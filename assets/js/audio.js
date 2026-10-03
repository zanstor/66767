/* ==========================================================================
   Audio: a small Web Audio groovebox + the site player.

   Engine  — synth voices (kick, 808, clap, hats, metal, basses, pads, keys,
             bells, plucks, G-funk lead) and four genre generators that turn a
             track from data.js into a 16-step sequence with an arrangement
             (intro → verse → hook → break → outro).
   Player  — one transport for the whole site. Plays synthesized beats or a
             real file (`track.src`). Exposes an AnalyserNode for the visuals.
   ========================================================================== */
(function () {
  const B = window.BRND, U = B.util;

  /* ---------- music theory ---------- */
  const KEY = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const SCALES = {
    minor:    [0, 2, 3, 5, 7, 8, 10],
    harmonic: [0, 2, 3, 5, 7, 8, 11],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    dorian:   [0, 2, 3, 5, 7, 9, 10]
  };
  const CT = [0, 2, 4, 7, 9, 11, 14]; // chord tones in scale steps: root, 3rd, 5th, octave, 10th, 12th, 15th
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* scale degree → midi note */
  function dm(base, scale, d) {
    const s = SCALES[scale] || SCALES.minor, n = s.length;
    const o = Math.floor(d / n), i = ((d % n) + n) % n;
    return base + o * 12 + s[i];
  }
  const stack = (base, scale, root, steps) => steps.map((x) => dm(base, scale, root + x));
  const keysBase = (pc) => 48 + pc + (pc < 4 ? 12 : 0);

  /* ---------- shared per-context resources ---------- */
  const shared = new WeakMap();
  function res(ctx) {
    let r = shared.get(ctx);
    if (r) return r;
    r = { curves: {} };
    const sr = ctx.sampleRate;

    r.noise = ctx.createBuffer(1, sr * 2, sr);
    const nd = r.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const len = Math.floor(sr * 2.6);
    r.ir = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const d = r.ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const fadeIn = i < sr * 0.008 ? i / (sr * 0.008) : 1;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4) * fadeIn;
      }
    }

    /* vinyl: hiss + random dust clicks */
    r.crackle = ctx.createBuffer(1, sr * 4, sr);
    const cd = r.crackle.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * 0.006;
    for (let i = 0; i < cd.length; i++) {
      if (Math.random() < 0.00022) {
        const amp = Math.pow(Math.random(), 2) * 0.8, l = 6 + Math.random() * 36;
        for (let k = 0; k < l && i + k < cd.length; k++) cd[i + k] += amp * (1 - k / l) * (Math.random() * 2 - 1);
      }
    }
    shared.set(ctx, r);
    return r;
  }

  function shaperCurve(r, k) {
    k = Math.round(k * 10) / 10;
    if (!r.curves[k]) {
      const n = 2048, c = new Float32Array(n), th = Math.tanh(k);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / th; }
      r.curves[k] = c;
    }
    return r.curves[k];
  }

  /* master: gain → glue compressor → analyser → speakers */
  function buildMaster(ctx) {
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 5;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.78;
    analyser.minDecibels = -95;
    analyser.maxDecibels = -14;
    /* safety soft-clipper: linear below 0.85, smooth knee above */
    const clip = ctx.createWaveShaper(), n = 2048, c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
      c[i] = a < 0.85 ? x : Math.sign(x) * (0.85 + 0.15 * Math.tanh((a - 0.85) / 0.15));
    }
    clip.curve = c; clip.oversample = '2x';
    master.connect(comp); comp.connect(clip); clip.connect(analyser); analyser.connect(ctx.destination);
    return { master, comp, analyser };
  }

  /* ---------- the rig: buses, effects and voices for one playback session ---------- */
  class Rig {
    constructor(ctx, dest, song) {
      this.ctx = ctx; this.song = song; this.r = res(ctx);
      const fx = song.fx, gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
      const filter = (type, f, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; return b; };
      this.nodes = [];

      this.out = gain(fx.trim || 1); this.out.connect(dest);
      this.tone = filter('lowpass', fx.tone || 20000, 0.4); this.tone.connect(this.out);

      /* drums (optionally saturated) */
      this.drums = gain(1);
      if (fx.drumDrive > 1) {
        const sh = ctx.createWaveShaper(); sh.curve = shaperCurve(this.r, fx.drumDrive); sh.oversample = '2x';
        const post = gain(1 / Math.pow(fx.drumDrive, 0.55));
        this.drums.connect(sh); sh.connect(post); post.connect(this.tone);
      } else this.drums.connect(this.tone);

      /* bass: drive → lowpass (the distorted 808 lives here) */
      this.bass = gain(1);
      const bsh = ctx.createWaveShaper(); bsh.curve = shaperCurve(this.r, fx.bassDrive || 1.2); bsh.oversample = '4x';
      const blp = filter('lowpass', fx.bassCut || 2400, 0.5);
      const bpost = gain(1 / Math.pow(fx.bassDrive || 1.2, 0.5));
      this.bass.connect(bsh); bsh.connect(blp); blp.connect(bpost); bpost.connect(this.tone);

      /* music bus with sidechain duck */
      this.music = gain(1); this.duckG = gain(1);
      this.music.connect(this.duckG); this.duckG.connect(this.tone);

      /* reverb send */
      this.verb = gain(1);
      const conv = ctx.createConvolver(); conv.buffer = this.r.ir;
      const vOut = gain(fx.verb == null ? 0.3 : fx.verb);
      this.verb.connect(conv); conv.connect(vOut); vOut.connect(this.tone);

      /* tempo-synced delay send */
      this.dly = gain(1);
      const d = ctx.createDelay(2); d.delayTime.value = song.stepDur * (fx.delaySteps || 3);
      const fb = gain(fx.feedback || 0.35), dlp = filter('lowpass', 2600, 0.5), dOut = gain(0.5);
      this.dly.connect(d); d.connect(dlp); dlp.connect(fb); fb.connect(d); dlp.connect(dOut); dOut.connect(this.tone);
      this.nodes.push(d, fb, conv);

      if (fx.crackle) {
        const src = ctx.createBufferSource(); src.buffer = this.r.crackle; src.loop = true;
        const hp = filter('highpass', 500, 0.5), cg = gain(fx.crackle);
        src.connect(hp); hp.connect(cg); cg.connect(this.out);
        src.start(ctx.currentTime, Math.random() * 3);
        this.crackle = src;
      }
      if (fx.wobble) { /* tape wow: slow pitch drift on keys & pads */
        this.lfo = ctx.createOscillator(); this.lfo.frequency.value = 0.55;
        this.wob = gain(fx.wobble); this.lfo.connect(this.wob); this.lfo.start();
      }
      this.lastOpen = null;
    }

    stop() {
      const t = this.ctx.currentTime, g = this.out.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.06);
      setTimeout(() => {
        try { this.crackle && this.crackle.stop(); this.lfo && this.lfo.stop(); } catch (e) { /* already stopped */ }
        try { this.out.disconnect(); this.nodes.forEach((n) => n.disconnect()); } catch (e) { /* noop */ }
      }, 300);
    }

    send(node, verb, dly) {
      if (verb) { const s = this.ctx.createGain(); s.gain.value = verb; node.connect(s); s.connect(this.verb); }
      if (dly) { const s = this.ctx.createGain(); s.gain.value = dly; node.connect(s); s.connect(this.dly); }
    }

    env(g, t, v, att, end) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + att);
      g.gain.exponentialRampToValueAtTime(0.0001, Math.max(t + att + 0.005, end));
    }

    noise(t, dur, v, type, freq, q, dest, verb) {
      const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.r.noise;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 0.7;
      const g = ctx.createGain();
      this.env(g, t, v, 0.002, t + dur);
      src.connect(f); f.connect(g); g.connect(dest || this.drums);
      if (verb) this.send(g, verb);
      src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.03);
      return g;
    }

    duck(t) {
      const p = this.duckG.gain;
      p.cancelScheduledValues(t); p.setValueAtTime(this.song.fx.duck, t); p.setTargetAtTime(1, t + 0.03, 0.09);
    }

    kick(t, v, o) {
      o = o || {};
      const ctx = this.ctx, osc = ctx.createOscillator(), g = ctx.createGain(), dec = o.decay || 0.4;
      osc.frequency.setValueAtTime(o.f0 || 155, t);
      osc.frequency.exponentialRampToValueAtTime(o.f1 || 46, t + (o.sweep || 0.075));
      this.env(g, t, v, 0.003, t + dec);
      osc.connect(g); g.connect(this.drums); osc.start(t); osc.stop(t + dec + 0.03);
      this.noise(t, 0.012, 0.28 * v, 'highpass', 2600, 0.7);
      if (this.song.fx.duck) this.duck(t);
    }

    snare(t, v, o) {
      o = o || {};
      this.noise(t, o.decay || 0.19, 0.5 * v, 'highpass', o.hp || 1300, 0.6, this.drums, o.verb || 0);
      const ctx = this.ctx, osc = ctx.createOscillator(), g = ctx.createGain(), f = o.tone || 210;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t); osc.frequency.exponentialRampToValueAtTime(f * 0.75, t + 0.08);
      this.env(g, t, 0.45 * v, 0.002, t + 0.11);
      osc.connect(g); g.connect(this.drums); osc.start(t); osc.stop(t + 0.14);
    }

    clap(t, v, o) {
      o = o || {};
      const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.r.noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.freq || 1150; f.Q.value = 0.9;
      const g = ctx.createGain(), dec = o.decay || 0.17;
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) {
        const s = t + i * 0.011;
        g.gain.setValueAtTime(v * 0.9, s); g.gain.exponentialRampToValueAtTime(v * 0.12, s + 0.009);
      }
      const s = t + 0.033;
      g.gain.setValueAtTime(v, s); g.gain.exponentialRampToValueAtTime(0.0001, s + dec);
      src.connect(f); f.connect(g); g.connect(this.drums); this.send(g, o.verb == null ? 0.15 : o.verb);
      src.start(t, Math.random()); src.stop(s + dec + 0.03);
    }

    hat(t, v, open) {
      if (this.lastOpen) { /* closed hat chokes the open one */
        const lg = this.lastOpen.gain; lg.cancelScheduledValues(t); lg.setTargetAtTime(0.0001, t, 0.008); this.lastOpen = null;
      }
      const g = this.noise(t, open ? 0.3 : 0.045, (open ? 0.2 : 0.2) * v, 'highpass', open ? 6500 : 7800, 0.5, this.drums, 0);
      if (open) this.lastOpen = g;
    }

    metal(t, v, o) { /* industrial clang: inharmonic squares through a resonant band */
      o = o || {};
      const ctx = this.ctx, g = ctx.createGain(), bp = ctx.createBiquadFilter(), dec = o.decay || 0.22;
      bp.type = 'bandpass'; bp.frequency.value = o.freq || 2600; bp.Q.value = 2.5;
      this.env(g, t, 0.32 * v, 0.002, t + dec);
      [1, 1.483, 1.932, 2.546].forEach((r) => {
        const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.value = (o.base || 317) * r;
        osc.connect(bp); osc.start(t); osc.stop(t + dec + 0.03);
      });
      bp.connect(g); g.connect(this.drums); this.send(g, o.verb == null ? 0.45 : o.verb);
    }

    e808(t, midi, dur, v, slideFrom) {
      const ctx = this.ctx, osc = ctx.createOscillator(), g = ctx.createGain(), f = mtof(midi);
      if (slideFrom != null) {
        osc.frequency.setValueAtTime(mtof(slideFrom), t);
        osc.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.14, dur * 0.5));
      } else {
        osc.frequency.setValueAtTime(f * 1.9, t);
        osc.frequency.exponentialRampToValueAtTime(f, t + 0.035);
      }
      const end = t + Math.max(0.12, dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.005);
      g.gain.setTargetAtTime(v * 0.55, t + 0.02, Math.max(0.08, dur * 0.5));
      g.gain.setTargetAtTime(0.0001, end, 0.03);
      osc.connect(g); g.connect(this.bass); osc.start(t); osc.stop(end + 0.25);
    }

    sbass(t, midi, dur, v, o) { /* analog-style saw bass with filter envelope */
      o = o || {};
      const ctx = this.ctx, f = mtof(midi), end = t + Math.max(0.05, dur), att = o.att || 0.004, rel = o.rel || 0.04;
      const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = o.res == null ? 6 : o.res;
      const cut = o.cut || 600;
      filt.frequency.setValueAtTime(Math.min(16000, cut * (o.env || 4)), t);
      filt.frequency.exponentialRampToValueAtTime(cut, t + (o.envDecay || 0.12));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + att);
      g.gain.setValueAtTime(v, Math.max(t + att, end - 0.02));
      g.gain.exponentialRampToValueAtTime(0.0001, end + rel);
      const oscs = [ctx.createOscillator()];
      oscs[0].type = o.wave || 'sawtooth'; oscs[0].connect(filt);
      if (o.sub) {
        const sub = ctx.createOscillator(), sg = ctx.createGain();
        sub.type = 'square'; sub.detune.value = -1200; sg.gain.value = o.sub;
        sub.connect(sg); sg.connect(filt); oscs.push(sub);
      }
      oscs.forEach((osc) => {
        if (o.glideFrom != null) {
          osc.frequency.setValueAtTime(mtof(o.glideFrom), t);
          osc.frequency.exponentialRampToValueAtTime(f, t + (o.glide || 0.07));
        } else osc.frequency.setValueAtTime(f, t);
        osc.start(t); osc.stop(end + rel + 0.03);
      });
      filt.connect(g); g.connect(this.bass);
    }

    ubass(t, midi, dur, v) { /* soft round bass for boom bap */
      const ctx = this.ctx, f = mtof(midi), end = t + dur, g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.012);
      g.gain.setTargetAtTime(v * 0.6, t + 0.03, 0.3);
      g.gain.setTargetAtTime(0.0001, end, 0.05);
      const a = ctx.createOscillator(), b = ctx.createOscillator(), bg = ctx.createGain();
      a.frequency.value = f; b.type = 'triangle'; b.frequency.value = f * 2; bg.gain.value = 0.25;
      a.connect(g); b.connect(bg); bg.connect(g); g.connect(this.bass);
      a.start(t); b.start(t); a.stop(end + 0.4); b.stop(end + 0.4);
    }

    pad(t, midis, dur, v, o) {
      o = o || {};
      const ctx = this.ctx, filt = ctx.createBiquadFilter(), g = ctx.createGain();
      const att = o.att || 0.35, rel = o.rel || 0.7, end = t + dur, cut = o.cut || 1400;
      filt.type = 'lowpass'; filt.Q.value = o.q || 0.8;
      filt.frequency.setValueAtTime(cut * 0.5, t); filt.frequency.linearRampToValueAtTime(cut, t + dur * 0.6);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + att);
      g.gain.setValueAtTime(v, Math.max(t + att, end - 0.01));
      g.gain.linearRampToValueAtTime(0.0001, end + rel);
      midis.forEach((m) => [-7, 7].forEach((dt) => {
        const osc = ctx.createOscillator(); osc.type = o.wave || 'sawtooth';
        osc.frequency.value = mtof(m); osc.detune.value = dt;
        if (this.wob) this.wob.connect(osc.detune);
        osc.connect(filt); osc.start(t); osc.stop(end + rel + 0.05);
      }));
      filt.connect(g); g.connect(this.music); this.send(g, o.verb == null ? 0.35 : o.verb, o.dly || 0);
    }

    keys(t, midis, dur, v, o) { /* two-operator FM electric piano */
      o = o || {};
      const ctx = this.ctx;
      midis.forEach((m, i) => {
        const tt = t + i * (o.strum == null ? 0.014 : o.strum), f = mtof(m), end = tt + dur;
        const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
        car.frequency.value = f; mod.frequency.value = f * (o.ratio || 1);
        mg.gain.setValueAtTime(f * (o.index || 1.4), tt);
        mg.gain.exponentialRampToValueAtTime(f * 0.08, tt + 0.7);
        mod.connect(mg); mg.connect(car.frequency);
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(v, tt + 0.005);
        g.gain.setTargetAtTime(v * 0.25, tt + 0.01, 0.45);
        g.gain.setTargetAtTime(0.0001, end, 0.12);
        if (this.wob) this.wob.connect(car.detune);
        car.connect(g); g.connect(this.music); this.send(g, o.verb == null ? 0.22 : o.verb, o.dly || 0);
        car.start(tt); mod.start(tt); car.stop(end + 0.8); mod.stop(end + 0.8);
      });
    }

    bell(t, midi, dur, v) { /* inharmonic FM bell for dark trap melodies */
      const ctx = this.ctx, f = mtof(midi), end = t + Math.min(1.6, dur + 0.6);
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g = ctx.createGain();
      car.frequency.value = f; mod.frequency.value = f * 3.5;
      mg.gain.setValueAtTime(f * 2.4, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.4);
      mod.connect(mg); mg.connect(car.frequency);
      this.env(g, t, v, 0.003, end);
      car.connect(g); g.connect(this.music); this.send(g, 0.35, 0.28);
      car.start(t); mod.start(t); car.stop(end + 0.05); mod.stop(end + 0.05);
    }

    pluck(t, midi, dur, v, o) {
      o = o || {};
      const ctx = this.ctx, f = mtof(midi), end = t + Math.min(dur, 0.45) + 0.06;
      const filt = ctx.createBiquadFilter(), g = ctx.createGain();
      filt.type = 'lowpass'; filt.Q.value = 4;
      filt.frequency.setValueAtTime(o.bright || 3800, t); filt.frequency.exponentialRampToValueAtTime(260, t + 0.22);
      this.env(g, t, v, 0.003, end);
      [-6, 6].forEach((dt) => {
        const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = f; osc.detune.value = dt;
        osc.connect(filt); osc.start(t); osc.stop(end + 0.05);
      });
      filt.connect(g); g.connect(this.music); this.send(g, 0.2, o.dly == null ? 0.3 : o.dly);
    }

    stab(t, midis, dur, v) {
      const ctx = this.ctx, filt = ctx.createBiquadFilter(), g = ctx.createGain(), end = t + dur;
      filt.type = 'lowpass'; filt.Q.value = 2;
      filt.frequency.setValueAtTime(3200, t); filt.frequency.exponentialRampToValueAtTime(900, t + 0.15);
      this.env(g, t, v, 0.004, end);
      midis.forEach((m) => [-5, 5].forEach((dt) => {
        const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = mtof(m); osc.detune.value = dt;
        osc.connect(filt); osc.start(t); osc.stop(end + 0.05);
      }));
      filt.connect(g); g.connect(this.music); this.send(g, 0.3, 0.18);
    }

    lead(t, midi, dur, v, o) { /* G-funk whistle: sine with portamento & delayed vibrato */
      o = o || {};
      const ctx = this.ctx, f = mtof(midi), end = t + dur, from = o.glideFrom != null ? mtof(o.glideFrom) : f;
      const osc = ctx.createOscillator(); osc.type = 'sine';
      osc.frequency.setValueAtTime(from, t);
      if (from !== f) osc.frequency.exponentialRampToValueAtTime(f, t + 0.1);
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.4;
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib == null ? 24 : o.vib, t + Math.min(0.35, dur));
      lfo.connect(lg); lg.connect(osc.detune);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.03);
      g.gain.setValueAtTime(v, Math.max(t + 0.03, end - 0.02));
      g.gain.exponentialRampToValueAtTime(0.0001, end + 0.12);
      osc.connect(lp); lp.connect(g); g.connect(this.music); this.send(g, 0.3, 0.22);
      osc.start(t); lfo.start(t); osc.stop(end + 0.15); lfo.stop(end + 0.15);
    }
  }

  /* ---------- arrangement ---------- */
  function section(bar, total) {
    if (bar < 2) return 'intro';
    if (bar >= total - 4) return 'outro';
    const k = (bar - 2) % 24;
    if (k >= 16 && k < 18) return 'break';
    return k < 8 ? 'verse' : 'hook';
  }

  function info(song, n) {
    const bar = Math.floor(n / 16), s = n % 16, total = song.totalBars;
    const sec = section(bar, total), nextSec = section(bar + 1, total);
    const fill = (sec === 'verse' || sec === 'hook') && (bar % 4 === 3 || nextSec === 'break');
    const fade = sec === 'outro' ? Math.max(0.15, 1 - (bar - (total - 4) + s / 16) / 4)
      : sec === 'intro' ? 0.8 + 0.1 * bar : 1;
    return { bar, s, s32: n % 32, sec, fill, fade, hr: (k) => U.hash01(song.seed, n, k) };
  }

  function hatHits(rig, ch, t, sd, v) {
    if (!ch || ch === '.') return;
    if (ch === 'o') { rig.hat(t, v * 0.9, true); return; }
    if (ch === 'g') { rig.hat(t, v * 0.35); return; }
    const k = ch === 'r' ? 2 : ch === 't' ? 3 : ch === 'q' ? 4 : 1;
    for (let i = 0; i < k; i++) rig.hat(t + (i * sd) / k, v * (k > 1 ? 0.55 + 0.45 * (i / k) : 1));
  }

  /* ---------- TRAP: distorted 808 with slides, rolling hats, bells ---------- */
  const TRAP = {
    b808: [
      [{ s: 0, d: 0, l: 7 }, { s: 7, d: 0, l: 3 }, { s: 10, d: -2, l: 6 }, { s: 16, d: 0, l: 6 }, { s: 22, d: 4, l: 2, slide: 1 }, { s: 24, d: 2, l: 4 }, { s: 28, d: 0, l: 4, slide: 1 }],
      [{ s: 0, d: 0, l: 3 }, { s: 3, d: 0, l: 3 }, { s: 6, d: 0, l: 5 }, { s: 11, d: -3, l: 5 }, { s: 16, d: 0, l: 6 }, { s: 22, d: 7, l: 4, slide: 1 }, { s: 26, d: 5, l: 2 }, { s: 28, d: 4, l: 4, slide: 1 }],
      [{ s: 0, d: 0, l: 10 }, { s: 10, d: 0, l: 2 }, { s: 12, d: -1, l: 4 }, { s: 16, d: 0, l: 4 }, { s: 20, d: 0, l: 3 }, { s: 23, d: 2, l: 5, slide: 1 }, { s: 28, d: -2, l: 4 }]
    ],
    hats: [
      'x.x.x.x.x.x.x.x.x.x.x.x.x.x.t.rr',
      'xxxxxxxxxxxxxxxxxxxxxxxxxxxxtttt',
      'x.xxx.xxx.x.t.x.x.xxx.xxx.x.rrqq'
    ],
    mel: [
      [{ s: 0, c: 3 }, { s: 3, c: 2 }, { s: 6, c: 1 }, { s: 8, c: 2 }, { s: 12, c: 0 }, { s: 16, c: 3 }, { s: 19, c: 4 }, { s: 22, c: 2 }, { s: 24, c: 1 }, { s: 28, c: 2 }],
      [{ s: 0, c: 0 }, { s: 2, c: 1 }, { s: 4, c: 2 }, { s: 6, c: 3 }, { s: 10, c: 2 }, { s: 12, c: 1 }, { s: 16, c: 0 }, { s: 18, c: 1 }, { s: 20, c: 2 }, { s: 22, c: 4 }, { s: 26, c: 3 }, { s: 28, c: 2 }],
      [{ s: 0, c: 2, l: 6 }, { s: 6, c: 1, l: 2 }, { s: 8, c: 0, l: 8 }, { s: 16, c: 2, l: 4 }, { s: 20, c: 3, l: 4 }, { s: 24, c: 1, l: 8 }]
    ],
    prog: [[0, 0, 5, 4], [0, 5, 3, 4], [0, 3, 5, 4], [0, 0, 3, 5]]
  };

  function buildTrap(song, rng) {
    const st = song.track.style;
    song.fx = { trim: 0.62, bassDrive: st === 'hard' ? 7 : st === 'electro' ? 5 : 4.2, bassCut: 2200, drumDrive: st === 'electro' ? 1.8 : 1.2, verb: 0.3, delaySteps: 3, feedback: 0.38 };
    const b808 = U.pick(rng, TRAP.b808), hats = U.pick(rng, TRAP.hats), mel = U.pick(rng, TRAP.mel), prog = U.pick(rng, TRAP.prog);
    const lead = st === 'electro' ? 'pluck' : st === 'hard' ? 'keys' : 'bell';
    const base808 = song.pc >= 5 ? 24 + song.pc : 36 + song.pc, kb = keysBase(song.pc);

    song.schedule = (rig, n, t) => {
      const I = info(song, n), { bar, s, s32, sec } = I, sd = song.stepDur, root = prog[bar % 4];
      const drums = sec === 'verse' || sec === 'hook';

      if (drums || (sec === 'intro' && bar >= 1)) {
        let ch = hats[s32];
        if (sec === 'intro') ch = s % 4 === 0 ? 'x' : '.';
        else if (I.fill && s >= 12) ch = s % 2 ? 't' : 'r';
        hatHits(rig, ch, t, sd, (s % 4 === 0 ? 1 : 0.72) * I.fade);
      }
      if (drums) {
        if (s === 8) { rig.clap(t, 1.3); rig.snare(t, 0.45, { decay: 0.14, verb: 0.15 }); }
        if (st === 'electro' && (s === 6 || s === 14) && I.hr(2) < 0.55) rig.metal(t, 0.5, { base: 420, decay: 0.1, verb: 0.25 });
        b808.forEach((e, i) => {
          if (e.s !== s32 || (I.fill && s >= 14)) return;
          const midi = dm(base808, song.scale, root + e.d);
          const prev = b808[(i - 1 + b808.length) % b808.length];
          rig.e808(t, midi, e.l * sd, 0.95, e.slide ? dm(base808, song.scale, root + prev.d) : null);
          if (!e.slide) rig.kick(t, 0.8, { decay: 0.24, f1: 55 });
        });
      }
      if (s === 0) rig.pad(t, stack(kb, song.scale, root, [0, 2, 4]), 16 * sd, 0.045 * I.fade, { cut: 900, att: 0.5, rel: 0.8, verb: 0.4 });
      mel.forEach((e) => {
        if (e.s !== s32) return;
        const midi = dm(kb + 12, song.scale, root + CT[e.c]), len = (e.l || 2) * sd;
        const v = (sec === 'verse' ? 0.75 : 1) * I.fade;
        if (lead === 'bell') rig.bell(t, midi, len, 0.2 * v);
        else if (lead === 'keys') rig.keys(t, [midi, midi - 12], len, 0.13 * v, { index: 2.4, strum: 0, verb: 0.3, dly: 0.2 });
        else rig.pluck(t, midi, len, 0.11 * v, { dly: 0.32 });
      });
    };
  }

  /* ---------- BOOM BAP / LO-FI: swing, dusty keys, vinyl ---------- */
  const BB = {
    kick: ['x......x..x.....x.x......xx.....', 'x.........x.....x......x.x..x...', 'x......x.x......x.x.....x.x.....'],
    snare: ['....x.......x...', '....x..g....x.g.', '....x.......x..g'],
    hat: ['x.x.x.x.x.x.x.x.', 'x.xgx.x.x.xgx.x.', 'x.x.x.xgx.x.x.xo'],
    prog: [[0, 0, 3, 3], [0, 5, 3, 4], [5, 4, 0, 0], [0, 3, 6, 4]],
    mel: [
      [{ s: 0, c: 3, l: 6 }, { s: 6, c: 2, l: 2 }, { s: 8, c: 4, l: 6 }, { s: 14, c: 3, l: 2 }],
      [{ s: 2, c: 2, l: 4 }, { s: 6, c: 3, l: 4 }, { s: 10, c: 4, l: 2 }, { s: 12, c: 3, l: 4 }]
    ]
  };

  function buildBoomBap(song, rng) {
    const dusty = song.track.style === 'dusty';
    song.swing = dusty ? 0.12 : 0.17;
    song.fx = { trim: 0.58, tone: dusty ? 7000 : 5200, crackle: dusty ? 0.35 : 0.55, wobble: dusty ? 5 : 9, bassDrive: 1.6, bassCut: 900, drumDrive: dusty ? 1.8 : 1.3, verb: 0.2, delaySteps: 3, feedback: 0.3 };
    const kick = U.pick(rng, BB.kick), snare = U.pick(rng, BB.snare), hat = U.pick(rng, BB.hat), prog = U.pick(rng, BB.prog), mel = U.pick(rng, BB.mel);
    const kb = keysBase(song.pc), bb = 36 + song.pc - (song.pc > 6 ? 12 : 0);

    song.schedule = (rig, n, t) => {
      const I = info(song, n), { bar, s, s32, sec } = I, sd = song.stepDur, root = prog[bar % 4];
      const drums = sec === 'verse' || sec === 'hook';
      if (drums) {
        if (kick[s32] === 'x') {
          rig.kick(t, 0.95, { f0: 120, f1: 50, decay: 0.32, sweep: 0.06 });
          let len = 1; while (len < 8 && kick[(s32 + len) % 32] !== 'x') len++;
          rig.ubass(t, dm(bb, song.scale, root), len * sd * 0.95, 0.75);
        }
        const sn = snare[s];
        if (sn === 'x') rig.snare(t, 1, { decay: 0.2, tone: 190, hp: 1500, verb: 0.12 });
        else if (sn === 'g') rig.snare(t, 0.25, { decay: 0.08 });
      }
      if (drums || (sec === 'intro' && bar >= 1)) hatHits(rig, hat[s], t, sd, (s % 4 === 0 ? 0.8 : 0.6) * I.fade);
      if (sec === 'break' && s === 0) rig.ubass(t, dm(bb, song.scale, root), 14 * sd, 0.6);

      const chord = stack(kb, song.scale, root, dusty ? [0, 2, 4, 6, 8] : [0, 2, 4, 6]);
      if (s === 0) rig.keys(t, chord, (dusty ? 14 : 9) * sd, 0.085 * I.fade, { strum: 0.018 });
      if (!dusty && s === 10) rig.keys(t, chord.slice(1), 5 * sd, 0.06 * I.fade, { strum: 0.01 });
      if (sec === 'hook') mel.forEach((e) => {
        if (e.s === s) rig.keys(t, [dm(kb + 12, song.scale, root + CT[e.c])], e.l * sd, 0.075, { index: 2.2, strum: 0, dly: 0.25 });
      });
    };
  }

  /* ---------- INDUSTRIAL / EBM / SYNTHWAVE ---------- */
  const IND = {
    ebm:       { prog: [[0, 0, 1, 1], [0, 0, 5, 6]], kick: '4', clap: [4, 12], hat: '16o', bass: 'ebm', pad: 'pad', arp: '8', metal: [14], cut: 520, res: 9, fx: { drumDrive: 2.6, bassDrive: 2.2, verb: 0.32, duck: 0.45 } },
    techno:    { prog: [[0, 0, 0, 1], [0, 0, 6, 5]], kick: '4', clap: [4, 12], hat: 'off', bass: 'off', pad: 'stab', arp: false, metal: [3, 7, 11], cut: 380, res: 10, fx: { drumDrive: 2.2, bassDrive: 2, verb: 0.3, duck: 0.4 } },
    synthwave: { prog: [[0, 5, 2, 6], [0, 3, 5, 6]], kick: '4', snare: [4, 12], hat: '16', bass: 'oct', pad: 'pad', arp: '16', metal: [], cut: 900, res: 3, fx: { drumDrive: 1.3, bassDrive: 1.5, verb: 0.45, duck: 0.55 } },
    ambient:   { prog: [[0, 5, 0, 3], [0, 3, 5, 4]], kick: 'sparse', snare: [12], hat: 'sparse', bass: 'long', pad: 'pad', arp: false, metal: [6], cut: 300, res: 2, fx: { drumDrive: 1.5, bassDrive: 1.4, verb: 0.6, duck: 0.8 } }
  };

  function buildIndustrial(song, rng) {
    const style = IND[song.track.style] ? song.track.style : 'ebm', cfg = IND[style];
    song.fx = Object.assign({ bassCut: 2600, delaySteps: 3, feedback: 0.4 }, cfg.fx);
    const prog = U.pick(rng, cfg.prog), kb = keysBase(song.pc), bb = 36 + song.pc - (song.pc > 7 ? 12 : 0);

    song.schedule = (rig, n, t) => {
      const I = info(song, n), { bar, s, sec } = I, sd = song.stepDur, root = prog[bar % 4];
      const drums = sec === 'verse' || sec === 'hook', hook = sec === 'hook';
      const rootMidi = dm(bb, song.scale, root);

      if (drums) {
        if (cfg.kick === '4' ? s % 4 === 0 : (s === 0 || s === 10)) rig.kick(t, 1, { f0: 170, f1: 44, decay: cfg.kick === '4' ? 0.34 : 0.5 });
        if (cfg.clap && cfg.clap.includes(s)) { rig.clap(t, 1.15, { verb: 0.3 }); rig.snare(t, 0.5, { decay: 0.12 }); }
        if (cfg.snare && cfg.snare.includes(s)) rig.snare(t, 1, { decay: 0.24, verb: style === 'ambient' ? 0.7 : 0.5, tone: 180 });
        if (cfg.metal.includes(s) && I.hr(3) < 0.7) rig.metal(t, 0.8, { base: 300 + 80 * (bar % 3), decay: 0.18, verb: 0.5 });
        if (cfg.hat === '16o') { if (s % 4 === 2) rig.hat(t, 0.7, true); else rig.hat(t, s % 2 ? 0.45 : 0.6); }
        else if (cfg.hat === 'off') { if (s % 4 === 2) rig.hat(t, 0.75, true); else if (s % 2) rig.hat(t, 0.4); }
        else if (cfg.hat === '16') rig.hat(t, s % 4 === 2 ? 0.7 : 0.4);
        else if (cfg.hat === 'sparse' && hook && s % 4 === 2) rig.hat(t, 0.5);
        if (I.fill && s >= 12 && cfg.hat !== 'sparse') rig.snare(t, 0.35 + (s - 12) * 0.12, { decay: 0.08 });
      } else if (style === 'ambient' && sec !== 'outro' && s === 6 && bar % 2 === 1) {
        rig.metal(t, 0.5, { base: 260, decay: 0.4, verb: 0.9 });
      }

      if (drums || sec === 'break') {
        const cut = cfg.cut * (1 + 0.9 * (0.5 + 0.5 * Math.sin((n / 128) * Math.PI * 2)));
        const bo = { cut, res: cfg.res, env: 5, envDecay: 0.09, sub: 0.35 };
        if (cfg.bass === 'ebm' && s % 4 !== 0) rig.sbass(t, rootMidi + [0, 0, 12][s % 4 - 1], sd * 0.85, 0.32, bo);
        else if (cfg.bass === 'off' && (s % 4 === 2 || (s === 15 && I.hr(4) < 0.5))) rig.sbass(t, rootMidi, sd * 1.4, 0.36, bo);
        else if (cfg.bass === 'oct' && s % 2 === 0) rig.sbass(t, rootMidi + (s % 4 === 2 ? 12 : 0), sd * 1.6, 0.3, bo);
        else if (cfg.bass === 'long' && s === 0) rig.sbass(t, rootMidi, sd * 15, 0.34, { cut: 260, res: 2, env: 2, envDecay: 0.6, att: 0.08, rel: 0.4 });
      }

      const chord = stack(kb, song.scale, root, [0, 2, 4, 7]);
      if (cfg.pad === 'pad' && s === 0) {
        const cut = sec === 'intro' ? 900 + bar * 500 : style === 'synthwave' ? 2400 : 1300;
        rig.pad(t, chord, 16 * sd, 0.04 * I.fade, { cut, att: style === 'ambient' ? 1.6 : 0.4, rel: 1, verb: 0.45 });
      }
      if (cfg.pad === 'stab') {
        if ((hook || sec === 'break') && (s === 3 || (s === 11 && I.hr(5) < 0.6))) rig.stab(t, chord, sd * 1.5, 0.05);
        if (s === 0 && (sec === 'intro' || sec === 'outro' || sec === 'break')) rig.pad(t, chord, 16 * sd, 0.035 * I.fade, { cut: 900, att: 0.6, rel: 1 });
      }
      if (cfg.arp && (hook || sec === 'break')) {
        const every = cfg.arp === '8' ? 2 : 1;
        if (s % every === 0) {
          const seq = [0, 1, 2, 3, 2, 1], idx = Math.floor(n / every) % seq.length;
          rig.pluck(t, dm(kb + 12, song.scale, root + CT[seq[idx]]), sd * every, 0.07, { dly: 0.35, bright: 3000 });
        }
      }
    };
  }

  /* ---------- NU-DISCO / G-FUNK ---------- */
  const ND = {
    discoProg: [[0, 6, 3, 4], [0, 3, 0, 3], [0, 4, 3, 6]],
    gfProg: [[0, 0, 3, 3], [0, 3, 0, 3]],
    gfKick: 'x......x..x.....x.x......x......',
    gfBass: [{ s: 0, o: 0, l: 3 }, { s: 3, o: 0, l: 2 }, { s: 6, o: 12, l: 1 }, { s: 7, o: 10, l: 2, g: 1 }, { s: 10, o: 7, l: 3, g: 1 }, { s: 14, o: 0, l: 2, g: 1 }],
    discoBass: [[0, 0], [3, 12], [6, 0], [8, 0], [10, 12], [11, 0], [14, 12]],
    lead: [
      [{ s: 0, c: 3, l: 6 }, { s: 6, c: 4, l: 2, g: 1 }, { s: 8, c: 5, l: 8, g: 1 }, { s: 16, c: 4, l: 4 }, { s: 20, c: 3, l: 4, g: 1 }, { s: 24, c: 2, l: 8, g: 1 }],
      [{ s: 0, c: 5, l: 4 }, { s: 4, c: 4, l: 4, g: 1 }, { s: 8, c: 3, l: 6, g: 1 }, { s: 14, c: 2, l: 2 }, { s: 16, c: 3, l: 12, g: 1 }, { s: 28, c: 4, l: 4, g: 1 }]
    ]
  };

  function buildNuDisco(song, rng) {
    const gf = song.track.style === 'gfunk';
    song.swing = gf ? 0.1 : 0;
    song.fx = gf
      ? { trim: 0.9, tone: 15000, bassDrive: 1.6, bassCut: 1600, drumDrive: 1.2, verb: 0.3, delaySteps: 3, feedback: 0.32 }
      : { trim: 1.1, bassDrive: 1.5, bassCut: 2400, drumDrive: 1.1, verb: 0.28, duck: 0.35, delaySteps: 3, feedback: 0.35 };
    const prog = U.pick(rng, gf ? ND.gfProg : ND.discoProg), lead = U.pick(rng, ND.lead);
    const kb = keysBase(song.pc), bb = 36 + song.pc - (song.pc > 7 ? 12 : 0);

    song.schedule = (rig, n, t) => {
      const I = info(song, n), { bar, s, s32, sec } = I, sd = song.stepDur, root = prog[bar % 4];
      const drums = sec === 'verse' || sec === 'hook', hook = sec === 'hook';
      const rootMidi = dm(bb, song.scale, root);

      if (gf) {
        if (drums) {
          if (ND.gfKick[s32] === 'x') rig.kick(t, 0.95, { f0: 130, f1: 48, decay: 0.36 });
          if (s === 4 || s === 12) { rig.snare(t, 0.9, { decay: 0.18, verb: 0.2 }); rig.clap(t, 0.8); }
          rig.hat(t, s % 4 === 2 ? 0.55 : s % 2 ? 0.28 : 0.4);
        }
        if (drums || sec === 'break') ND.gfBass.forEach((e, i) => {
          if (e.s !== s) return;
          const p = ND.gfBass[(i - 1 + ND.gfBass.length) % ND.gfBass.length];
          rig.sbass(t, rootMidi + e.o, e.l * sd * 0.92, 0.42, { cut: 420, res: 3, env: 3, envDecay: 0.14, sub: 0.6, glideFrom: e.g ? rootMidi + p.o : null, glide: 0.06 });
        });
        const chord = stack(kb, song.scale, root, [0, 2, 4, 6, 8]);
        if (s === 0) rig.keys(t, chord, 7 * sd, 0.075 * I.fade, { strum: 0.012 });
        if (s === 9) rig.keys(t, chord.slice(1), 5 * sd, 0.055 * I.fade);
        if (hook || sec === 'outro') lead.forEach((e, i) => {
          if (e.s !== s32) return;
          const p = lead[(i - 1 + lead.length) % lead.length];
          rig.lead(t, dm(kb + 12, song.scale, root + CT[e.c]), e.l * sd, 0.1 * I.fade, { glideFrom: e.g ? dm(kb + 12, song.scale, root + CT[p.c]) : null });
        });
      } else {
        if (drums) {
          if (s % 4 === 0) rig.kick(t, 0.95, { f0: 140, f1: 50, decay: 0.3 });
          if (s === 4 || s === 12) rig.clap(t, 1.1, { verb: 0.25 });
          if (s % 4 === 2) rig.hat(t, 0.7, true); else rig.hat(t, s % 2 ? 0.3 : 0.42);
          ND.discoBass.forEach(([st, o]) => { if (st === s) rig.sbass(t, rootMidi + o, sd * 1.1, 0.34, { cut: 700, res: 5, env: 4, envDecay: 0.1, sub: 0.4 }); });
        } else if (sec === 'intro' && bar >= 1 && s % 4 === 2) rig.hat(t, 0.5, true);
        if (s === 0) rig.pad(t, stack(kb, song.scale, root, [0, 2, 4, 6]), 16 * sd, 0.038 * I.fade, { cut: 2600, att: 0.08, rel: 0.4, verb: 0.3 });
        if (hook || sec === 'break') rig.pluck(t, dm(kb + 12, song.scale, root + CT[[0, 1, 2, 3][s % 4]]), sd, 0.06, { dly: 0.3, bright: 4200 });
      }
    };
  }

  const BUILDERS = { trap: buildTrap, boombap: buildBoomBap, industrial: buildIndustrial, nudisco: buildNuDisco };
  const songCache = new Map();

  function makeSong(track) {
    if (songCache.has(track.id)) return songCache.get(track.id);
    const pc = KEY[track.key] == null ? 0 : KEY[track.key];
    const stepDur = 60 / track.bpm / 4;
    const song = {
      track, seed: track.seed || 1, bpm: track.bpm, stepDur, pc, scale: track.scale || 'minor', swing: 0, fx: {},
      totalBars: Math.max(8, Math.floor(track.duration / (stepDur * 16)))
    };
    (BUILDERS[track.genre] || buildTrap)(song, U.mulberry32(song.seed));
    songCache.set(track.id, song);
    return song;
  }

  /* Render a slice of a beat without a live context (used by tests / tooling). */
  function renderOffline(track, seconds, from) {
    from = from || 0;
    const sr = 44100, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const octx = new OAC(2, Math.ceil(sr * seconds), sr);
    const song = makeSong(track), m = buildMaster(octx), rig = new Rig(octx, m.master, song);
    const sd = song.stepDur, maxStep = Math.floor(track.duration / sd);
    for (let n = Math.ceil(from / sd); n < maxStep && n * sd - from < seconds; n++) {
      song.schedule(rig, n, Math.max(0, n * sd - from + (n % 2 ? song.swing * sd : 0)));
    }
    return octx.startRendering();
  }

  B.Engine = { KEY, section, song: makeSong, Rig, buildMaster, renderOffline };

  /* ==========================================================================
     Player
     ========================================================================== */
  B.Player = (function () {
    const em = U.emitter();
    let ctx = null, chain = null, media = null;
    let queue = [], cur = null, song = null, rig = null;
    let playing = false, pos0 = 0, ctx0 = 0, paused = 0, nextStep = 0, timer = 0;
    let volume = U.store.get('brnd-volume', 0.9);

    function ensure() {
      if (ctx) return ctx;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: 'interactive' });
      chain = buildMaster(ctx);
      chain.master.gain.value = volume;
      const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); // iOS unlock
      s.buffer = b; s.connect(ctx.destination); s.start(0);
      document.addEventListener('visibilitychange', () => { if (playing) tick(); });
      return ctx;
    }

    const isMedia = () => !!(cur && cur.src);

    function ensureMedia() {
      if (media) return media;
      media = new Audio();
      media.preload = 'metadata';
      media.addEventListener('ended', () => next(true));
      media.addEventListener('loadedmetadata', () => em.emit('load', cur));
      if (location.protocol === 'file:') {
        /* index.html opened by double-click: browsers forbid analysing local files,
           so the file plays directly (the analyzers stay in standby). */
        media.volume = volume;
      } else {
        media.crossOrigin = 'anonymous';
        ctx.createMediaElementSource(media).connect(chain.master);
      }
      return media;
    }

    function halt() {
      if (rig) { rig.stop(); rig = null; }
      clearInterval(timer); timer = 0;
      if (media) media.pause();
      playing = false;
    }

    function startSession(at) {
      rig = new Rig(ctx, chain.master, song);
      ctx0 = ctx.currentTime + 0.05; pos0 = at;
      nextStep = Math.ceil(at / song.stepDur - 1e-6);
      clearInterval(timer); timer = setInterval(tick, 25);
      tick();
    }

    function tick() {
      if (!playing || !cur) return;
      if (isMedia()) return;
      const ahead = document.hidden ? 1.6 : 0.16, sd = song.stepDur, now = ctx.currentTime;
      const maxStep = Math.floor(cur.duration / sd);
      while (nextStep < maxStep) {
        const base = ctx0 + nextStep * sd - pos0;
        if (base > now + ahead) break;
        const t = base + (nextStep % 2 ? song.swing * sd : 0);
        if (t >= now - 0.005) song.schedule(rig, nextStep, Math.max(t, now));
        nextStep++;
      }
      if (position() >= cur.duration - 0.02) next(true);
    }

    function load(id, autoplay) {
      const t = B.tracks.find((x) => x.id === id);
      if (!t) return;
      if (cur && cur.id === id) { if (autoplay && !playing) play(); return; }
      halt();
      cur = t; song = t.src ? null : makeSong(t); paused = 0;
      em.emit('load', t);
      if (autoplay) play(); else em.emit('state', { playing: false });
    }

    function play() {
      if (!cur) return;
      ensure();
      if (ctx.state !== 'running') ctx.resume();
      if (isMedia()) {
        ensureMedia();
        if (media.dataset.id !== cur.id) {
          media.src = cur.src; media.dataset.id = cur.id;
          const at = paused;
          if (at) media.addEventListener('loadedmetadata', () => { media.currentTime = at; }, { once: true });
        }
        media.play().catch(() => {});
        playing = true;
      } else {
        if (paused >= cur.duration - 0.25) paused = 0;
        playing = true;
        startSession(paused);
      }
      em.emit('state', { playing: true });
    }

    function pause() {
      if (!playing) return;
      paused = position();
      halt();
      em.emit('state', { playing: false });
    }

    function position() {
      if (!cur) return 0;
      if (isMedia()) return media && media.dataset.id === cur.id ? media.currentTime : paused;
      if (!playing) return paused;
      return Math.min(cur.duration, pos0 + Math.max(0, ctx.currentTime - ctx0));
    }

    function duration() {
      if (isMedia() && media && media.dataset.id === cur.id && isFinite(media.duration)) return media.duration;
      return cur ? cur.duration : 0;
    }

    function seek(sec) {
      if (!cur) return;
      sec = U.clamp(sec, 0, Math.max(0, duration() - 0.1));
      if (isMedia()) { paused = sec; if (media && media.dataset.id === cur.id) media.currentTime = sec; }
      else if (playing) { rig.stop(); startSession(sec); }
      else paused = sec;
      em.emit('seek', sec);
    }

    function list() { return queue.length ? queue : B.tracks; }
    function step(dir, keep) {
      const l = list(); let i = l.findIndex((t) => t === cur);
      if (i < 0) i = dir > 0 ? -1 : 0;
      const n = l[(i + dir + l.length) % l.length];
      if (n === cur) { seek(0); return; }
      load(n.id, keep);
    }
    function next(auto) { step(1, playing || !!auto); }
    function prev() { if (position() > 3) { seek(0); return; } step(-1, playing); }

    function setQueue(ids) { queue = ids.map((id) => B.tracks.find((t) => t.id === id)).filter(Boolean); }

    function setVolume(v) {
      volume = U.clamp(v, 0, 1);
      U.store.set('brnd-volume', volume);
      if (chain) chain.master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
      if (media && location.protocol === 'file:') media.volume = volume;
      em.emit('volume', volume);
    }

    /* Fills analyser arrays; returns false when there is no live signal. */
    function sample(freq, wave) {
      if (!chain || !playing) return false;
      chain.analyser.getByteFrequencyData(freq);
      if (chain.analyser.getFloatTimeDomainData) chain.analyser.getFloatTimeDomainData(wave);
      return true;
    }

    return {
      on: em.on, load, play, pause, toggle: () => (playing ? pause() : play()), next, prev, seek, setQueue, setVolume, sample,
      position, duration,
      get current() { return cur; },
      get playing() { return playing; },
      get volume() { return volume; },
      get sampleRate() { return ctx ? ctx.sampleRate : 44100; }
    };
  })();
})();
