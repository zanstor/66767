/* Canvas visuals driven by one requestAnimationFrame loop.
   Every canvas registers a draw function; only visible canvases are redrawn.
   When nothing is playing, a low "standby" signal keeps the analyzers breathing. */
(function () {
  const B = window.BRND, U = B.util, P = B.Player;

  const css = getComputedStyle(document.documentElement);
  const C = {
    fg: css.getPropertyValue('--fg').trim() || '#FFFFFF',
    accent: css.getPropertyValue('--accent').trim() || '#FF3300',
    bg: css.getPropertyValue('--bg').trim() || '#000000'
  };
  const alpha = (a) => 'rgba(255,255,255,' + a + ')';
  const accentA = (a) => 'rgba(255,51,0,' + a + ')';

  const frame = {
    freq: new Uint8Array(1024), wave: new Float32Array(2048),
    live: false, playing: false, level: 0, rms: 0, peak: 0, t: 0, dt: 0.016, pos: 0, progress: 0, track: null, started: false
  };
  const items = [];

  function resize(it) {
    const r = it.canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === it.w && h === it.h && dpr === it.dpr) return;
    it.w = w; it.h = h; it.dpr = dpr;
    it.canvas.width = Math.round(w * dpr); it.canvas.height = Math.round(h * dpr);
    it.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    it.dirty = true;
  }
  const ro = new ResizeObserver((entries) => entries.forEach((e) => e.target._viz && resize(e.target._viz)));
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    const it = e.target._viz; if (!it) return;
    it.visible = e.isIntersecting; if (it.visible) { resize(it); it.dirty = true; }
  }), { rootMargin: '120px' });

  /* opts.live: (it, frame) => bool — redraw every frame while true; otherwise only when dirty */
  function add(canvas, draw, opts) {
    opts = opts || {};
    const it = { canvas, ctx: canvas.getContext('2d'), draw, w: 0, h: 0, dpr: 1, visible: false, dirty: true, live: opts.live || (() => true), data: opts.data || {} };
    canvas._viz = it;
    resize(it); ro.observe(canvas); io.observe(canvas);
    items.push(it);
    return it;
  }
  function markAll() { items.forEach((it) => { it.dirty = true; }); }
  ['load', 'seek', 'state'].forEach((ev) => P.on(ev, markAll));
  P.on('state', (s) => { if (s.playing) frame.started = true; });

  /* ---------- standby signal ---------- */
  function standby(f) {
    const t = f.t;
    for (let i = 0; i < f.freq.length; i++) {
      const fall = Math.exp(-i / 140);
      const wob = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.07) * Math.sin(t * 0.7 + i * 0.013);
      f.freq[i] = Math.max(0, 120 * fall * (0.35 + 0.65 * wob) + 22 * Math.random() * fall);
    }
    for (let i = 0; i < f.wave.length; i++) {
      f.wave[i] = 0.05 * Math.sin(i * 0.031 + t * 2) * Math.sin(i * 0.0041 + t * 0.4) + 0.012 * (Math.random() - 0.5);
    }
  }

  /* ---------- the loop ---------- */
  let last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    if (document.hidden) return;
    const f = frame;
    f.t = ts / 1000; f.dt = Math.min(0.1, last ? (ts - last) / 1000 : 0.016); last = ts;
    f.live = P.sample(f.freq, f.wave);
    f.playing = P.playing; f.track = P.current;
    const dur = P.duration(); f.pos = P.position(); f.progress = dur ? f.pos / dur : 0;
    if (f.live) {
      let s = 0, pk = 0;
      for (let i = 0; i < f.wave.length; i++) { const v = f.wave[i]; s += v * v; const a = Math.abs(v); if (a > pk) pk = a; }
      f.rms = Math.sqrt(s / f.wave.length); f.peak = pk;
      f.level = U.lerp(f.level, Math.min(1, f.rms * 3.2), 0.35);
    } else {
      f.rms = 0; f.peak = 0; f.level = U.lerp(f.level, 0, 0.08);
      standby(f);
    }
    const still = U.reduceMotion.matches && !f.live;
    for (const it of items) {
      if (!it.visible) continue;
      if (!it.dirty && (still || !it.live(it, f))) continue;
      it.dirty = false;
      it.draw(it, f);
    }
  }
  requestAnimationFrame(loop);

  /* ---------- helpers ---------- */
  function sliceGlitch(it, count, maxShift, region) {
    const c = it.ctx, d = it.dpr, x0 = region ? region[0] : 0, w = region ? region[1] - region[0] : it.w;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < count; i++) {
      const sy = Math.random() * it.h, sh = 1 + Math.random() * Math.max(2, it.h * 0.08), dx = (Math.random() - 0.5) * 2 * maxShift;
      c.drawImage(it.canvas, x0 * d, sy * d, w * d, sh * d, (x0 + dx) * d, sy * d, w * d, sh * d);
    }
    c.restore();
  }
  const edgeFade = (u, e) => { const k = Math.min(1, u / e, (1 - u) / e); return k * k; };

  /* ---------- hero waveform ---------- */
  const heroGlitch = { at: 0, lines: [] };
  function heroWave(it, f) {
    const c = it.ctx, w = it.w, h = it.h, track = f.track;
    c.clearRect(0, 0, w, h);
    if (!track) return;
    const gap = 3, n = Math.floor(w / gap), pk = B.Art.peaks(track, n), mid = Math.round(h / 2);
    const intro = it.data.t0 ? U.clamp((f.t - it.data.t0) / 1.4, 0, 1) : 1, ease = 1 - Math.pow(1 - intro, 3);
    const p = f.started ? f.progress : 0.7, zone = 0.13;

    c.fillStyle = alpha(0.16); c.fillRect(0, mid, w, 1);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      if (Math.abs(u - 0.5) > ease * 0.52) continue;
      const d = u - p, ef = edgeFade(u, 0.1);
      let a = pk[i] * ef;
      if (f.live) {
        if (d > -zone && d < 0.015) a = Math.max(a * 0.7, Math.abs(f.wave[(i * 7) % f.wave.length]) * 1.7 * Math.max(ef, 0.6));
        else a *= 0.93 + f.level * 0.3 * Math.sin(i * 0.3 + f.t * 6);
      } else a *= 0.95 + 0.05 * Math.sin(i * 0.21 + f.t * 1.4);
      a *= ease;
      const amp = Math.max(0.5, Math.min(mid - 2, a * mid * 0.95));
      let xo = 0;
      if (d < -zone) c.fillStyle = alpha(0.92);
      else if (d < 0) {
        const k = 1 + d / zone;
        c.fillStyle = C.accent;
        xo = (Math.random() - 0.5) * 4 * k;
      } else c.fillStyle = alpha(0.3);
      c.fillRect(i * gap + xo, mid - amp, 1, amp * 2);
    }

    /* red horizontal artifacts around the playhead */
    const now = f.t;
    if (now - heroGlitch.at > (f.live ? 0.07 : 0.16)) {
      heroGlitch.at = now; heroGlitch.lines = [];
      const count = 3 + Math.floor(Math.random() * (f.live ? 8 : 4));
      for (let i = 0; i < count; i++) {
        heroGlitch.lines.push({
          x: (p - Math.random() * zone * 1.3) * w, y: mid + (Math.random() - 0.5) * h * 0.85,
          len: 6 + Math.pow(Math.random(), 2) * 90, a: 0.3 + Math.random() * 0.7
        });
      }
    }
    if (ease > 0.9) {
      heroGlitch.lines.forEach((l) => { c.fillStyle = accentA(l.a); c.fillRect(l.x, Math.round(l.y), l.len, 1); });
      if (Math.random() < (f.live ? 0.5 : 0.15)) sliceGlitch(it, 2, 8, [Math.max(0, (p - zone) * w), Math.min(w, (p + 0.02) * w)]);
    }
    if (it.data.hoverX != null) { c.fillStyle = alpha(0.55); c.fillRect(Math.round(it.data.hoverX), 0, 1, h); }
  }

  /* ---------- track-row thumbnail ---------- */
  function thumb(it, f) {
    const c = it.ctx, w = it.w, h = it.h, track = it.data.track;
    c.clearRect(0, 0, w, h);
    const gap = 2, n = Math.floor(w / gap), pk = B.Art.peaks(track, n), mid = Math.round(h / 2);
    const cur = f.track === track && f.started, p = f.progress;
    const zs = 0.6 + (track.seed % 13) / 100;
    c.fillStyle = alpha(0.12); c.fillRect(0, mid, w, 1);
    for (let i = 0; i < n; i++) {
      const u = i / n, ef = Math.pow(Math.min(1, u / 0.14, (1 - u) / 0.14), 1.5);
      let a = pk[i] * ef;
      if (cur && f.live && Math.abs(u - p) < 0.05) a = Math.max(a * 0.7, Math.abs(f.wave[(i * 13) % f.wave.length]) * 1.6 * ef);
      const amp = Math.max(0.5, Math.min(mid - 1, a * mid));
      if (cur) c.fillStyle = u < p - 0.07 ? alpha(0.9) : u < p ? C.accent : alpha(0.26);
      else c.fillStyle = u > zs && u < zs + 0.13 ? accentA(0.85) : alpha(it.data.hover ? 0.6 : 0.38);
      c.fillRect(i * gap, mid - amp, 1, amp * 2);
    }
    if (it.data.glitchUntil > performance.now()) {
      sliceGlitch(it, 4, 10);
      for (let i = 0; i < 4; i++) { c.fillStyle = accentA(0.5 + Math.random() * 0.5); c.fillRect(Math.random() * w, Math.random() * h, 8 + Math.random() * 40, 1); }
    }
  }
  const thumbLive = (it, f) => (f.track === it.data.track && f.playing) || it.data.glitchUntil > performance.now() - 40;

  /* ---------- spectrum analyzer ---------- */
  function bandsFrom(f, bars, fmin, fmax) {
    const binHz = P.sampleRate / 2048, out = new Float32Array(bars), r = fmax / fmin;
    for (let b = 0; b < bars; b++) {
      const f0 = fmin * Math.pow(r, b / bars), f1 = fmin * Math.pow(r, (b + 1) / bars);
      const i0 = Math.max(1, Math.floor(f0 / binHz)), i1 = Math.max(i0 + 1, Math.ceil(f1 / binHz));
      let m = 0;
      for (let i = i0; i < i1 && i < f.freq.length; i++) if (f.freq[i] > m) m = f.freq[i];
      out[b] = (m / 255) * (0.9 + 0.25 * (b / bars));
    }
    return out;
  }
  const SPEC = { fmin: 30, fmax: 16000 };

  function spectrum(it, f) {
    const c = it.ctx, w = it.w, h = it.h;
    c.clearRect(0, 0, w, h);
    const bars = U.clamp(Math.floor(w / 7), 32, 128);
    const d = it.data;
    if (!d.vals || d.vals.length !== bars) { d.vals = new Float32Array(bars); d.peaks = new Float32Array(bars); }
    const v = bandsFrom(f, bars, SPEC.fmin, SPEC.fmax), gapW = w / bars, bw = Math.max(1, Math.floor(gapW * 0.5));
    const top = 8, H = h - top - 1, thr = 0.7;
    c.fillStyle = alpha(0.06);
    [0.25, 0.5, 0.75].forEach((k) => c.fillRect(0, Math.round(top + H * k), w, 1));
    for (let x = 0; x < w; x += 6) { c.fillStyle = accentA(0.35); c.fillRect(x, Math.round(top + H * (1 - thr)), 2, 1); }
    for (let b = 0; b < bars; b++) {
      const val = Math.min(1, v[b]);
      d.vals[b] = val > d.vals[b] ? val : Math.max(val, d.vals[b] - f.dt * 1.1);
      d.peaks[b] = Math.max(d.peaks[b] - f.dt * 0.28, d.vals[b]);
      const x = Math.round(b * gapW + (gapW - bw) / 2), bh = d.vals[b] * H;
      const white = Math.min(bh, H * thr);
      c.fillStyle = alpha(f.live ? 0.92 : 0.35); c.fillRect(x, top + H - white, bw, white);
      if (bh > H * thr) { c.fillStyle = C.accent; c.fillRect(x, top + H - bh, bw, bh - white); }
      const py = top + H - d.peaks[b] * H;
      c.fillStyle = d.peaks[b] > thr ? C.accent : alpha(0.8); c.fillRect(x, Math.round(py) - 2, bw, 1);
    }
    c.fillStyle = C.bg;
    for (let y = h - 3; y > 0; y -= 3) c.fillRect(0, y, w, 1); // LED segmentation
    if (f.live && Math.random() < 0.08) sliceGlitch(it, 1, 6);
  }

  /* ---------- oscilloscope ---------- */
  function scope(it, f) {
    const c = it.ctx, w = it.w, h = it.h, mid = h / 2, wave = f.wave;
    c.clearRect(0, 0, w, h);
    c.fillStyle = alpha(0.12); c.fillRect(0, Math.round(mid), w, 1);
    let start = 0;
    for (let i = 1; i < 1024; i++) if (wave[i - 1] < 0 && wave[i] >= 0) { start = i; break; }
    const N = 1024, g = f.live ? 1.4 : 3;
    c.beginPath();
    for (let k = 0; k < N; k++) {
      const x = (k / (N - 1)) * w, y = mid - U.clamp(wave[start + k] * g, -1, 1) * mid * 0.9;
      k ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.strokeStyle = alpha(f.live ? 0.9 : 0.4); c.lineWidth = 1; c.stroke();
    c.fillStyle = C.accent;
    for (let k = 0; k < N; k += 2) {
      const val = wave[start + k] * g;
      if (Math.abs(val) > 0.75) c.fillRect((k / (N - 1)) * w, mid - U.clamp(val, -1, 1) * mid * 0.9 - 1, 2, 2);
    }
  }

  /* ---------- genre visualizers ---------- */
  function genre(it, f) {
    const c = it.ctx, w = it.w, h = it.h, t = f.t, d = it.data;
    const active = f.live && f.track && f.track.genre === d.genre;
    const lv = active ? f.level : 0, hov = d.hover ? 1 : 0;
    c.clearRect(0, 0, w, h);
    c.fillStyle = alpha(0.1); c.fillRect(0, Math.round(h / 2), w, 1);

    if (d.genre === 'trap') { /* sine 808 pushed into hard clipping */
      const drive = 1.2 + 1.6 * (0.5 + 0.5 * Math.sin(t * 0.9)) + lv * 2.2 + hov * 1.2;
      const mid = h / 2, A = h * 0.36, k = (Math.PI * 2 * 1.6) / w;
      c.beginPath();
      for (let x = 0; x <= w; x += 2) {
        const raw = drive * Math.sin(x * k - t * 2.2) * 0.55, y = mid - U.clamp(raw, -1, 1) * A;
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.strokeStyle = alpha(0.9); c.lineWidth = 1.2; c.stroke();
      c.fillStyle = C.accent;
      for (let x = 0; x <= w; x += 2) {
        const raw = drive * Math.sin(x * k - t * 2.2) * 0.55;
        if (Math.abs(raw) > 1) c.fillRect(x, mid - Math.sign(raw) * A - 1, 2, 3);
      }
    } else if (d.genre === 'boombap') { /* spinning record, static sheen, dust */
      const R = h * 0.95, cx = w - R * 0.55, cy = h / 2, a = t * Math.PI * 2 * 0.555;
      c.fillStyle = '#0b0a0a'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
      c.strokeStyle = alpha(0.1); c.lineWidth = 1;
      for (let r = R * 0.36; r < R; r += 3) { c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke(); }
      c.strokeStyle = alpha(0.12 + lv * 0.2); c.lineWidth = R * 0.5;
      c.beginPath(); c.arc(cx, cy, R * 0.68, Math.PI * 1.05, Math.PI * 1.3); c.stroke();
      c.fillStyle = C.accent; c.beginPath(); c.arc(cx, cy, R * 0.3, 0, Math.PI * 2); c.fill();
      c.strokeStyle = C.bg; c.lineWidth = 2;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * R * 0.08, cy + Math.sin(a) * R * 0.08); c.lineTo(cx + Math.cos(a) * R * 0.26, cy + Math.sin(a) * R * 0.26); c.stroke();
      c.fillStyle = C.bg; c.beginPath(); c.arc(cx, cy, 2.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = alpha(0.7); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(w - 6, 6); c.lineTo(cx - R * 0.55, cy - R * 0.62 + Math.sin(t * 3) * lv * 3); c.stroke();
      c.fillStyle = alpha(0.9);
      const dust = 2 + Math.floor(Math.random() * (3 + lv * 10));
      for (let i = 0; i < dust; i++) c.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    } else if (d.genre === 'industrial') { /* square wave with harsh noise bursts */
      const mid = h / 2, A = h * 0.3 * (1 + lv * 0.5), period = 46;
      c.lineWidth = 1;
      let prevY = null;
      for (let x = 0; x <= w; x += 2) {
        const ph = (x + t * 90) / period, cell = Math.floor(ph);
        const burst = U.hash01(cell, 7, 3) < 0.22 + lv * 0.3;
        let y = mid - (ph % 1 < 0.5 ? 1 : -1) * A;
        if (burst) y += (Math.random() - 0.5) * A * 1.4;
        c.strokeStyle = burst ? C.accent : alpha(0.85);
        c.beginPath(); c.moveTo(x - 2, prevY == null ? y : prevY); c.lineTo(x, y); c.stroke();
        prevY = y;
      }
      if (Math.random() < 0.12 + hov * 0.3) sliceGlitch(it, 2, 12);
    } else { /* nu-disco / g-funk: smooth Lissajous */
      const cx = w / 2, cy = h / 2, ax = w * 0.42, ay = h * 0.38 * (1 + lv * 0.25), ph = t * 0.5;
      c.beginPath();
      for (let i = 0; i <= 420; i++) {
        const s = (i / 420) * Math.PI * 2;
        const x = cx + Math.sin(3 * s + ph) * ax, y = cy + Math.sin(2 * s) * ay;
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.strokeStyle = alpha(0.85); c.lineWidth = 1; c.stroke();
      const s = t * 1.3;
      for (let k = 0; k < 14; k++) {
        const ss = s - k * 0.025;
        c.fillStyle = accentA(1 - k / 14);
        c.fillRect(cx + Math.sin(3 * ss + ph) * ax - 1.5, cy + Math.sin(2 * ss) * ay - 1.5, 3, 3);
      }
    }
  }

  /* ---------- small meters ---------- */
  function eq(it, f) {
    const c = it.ctx, w = it.w, h = it.h, bars = 7, gap = w / bars;
    c.clearRect(0, 0, w, h);
    const shape = [0.35, 0.6, 0.85, 1, 0.8, 0.55, 0.3];
    for (let b = 0; b < bars; b++) {
      let v;
      if (f.live) v = f.freq[[3, 6, 10, 18, 34, 70, 140][b]] / 255;
      else v = shape[b] * (0.55 + 0.25 * Math.sin(f.t * 2.2 + b * 0.9));
      const bh = Math.max(2, v * h);
      c.fillStyle = f.live && v > 0.82 ? C.accent : C.fg;
      c.fillRect(Math.round(b * gap + gap / 2 - 0.5), Math.round((h - bh) / 2), 1, Math.round(bh));
    }
  }

  function mini(it, f) {
    const c = it.ctx, w = it.w, h = it.h, bars = U.clamp(Math.floor(w / 5), 12, 48);
    c.clearRect(0, 0, w, h);
    const v = bandsFrom(f, bars, 40, 14000), gw = w / bars;
    for (let b = 0; b < bars; b++) {
      const val = Math.min(1, v[b]) * (f.live ? 1 : 0.4), bh = Math.max(1, val * h);
      c.fillStyle = val > 0.75 ? C.accent : alpha(0.85);
      c.fillRect(Math.round(b * gw), h - bh, Math.max(1, Math.floor(gw * 0.5)), bh);
    }
  }

  function line(it, f) {
    const c = it.ctx, w = it.w, h = it.h, mid = h / 2;
    c.clearRect(0, 0, w, h);
    c.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const u = x / w, ef = Math.sin(Math.PI * u);
      const v = f.live ? f.wave[Math.floor(u * 2047)] * 1.4 : 0.12 * Math.sin(u * 60 + f.t * 2) * Math.sin(u * 7 - f.t * 0.6);
      const y = mid - U.clamp(v, -1, 1) * mid * 0.9 * ef;
      x ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.strokeStyle = alpha(0.45); c.lineWidth = 1; c.stroke();
    const rx = w * (0.62 + 0.04 * Math.sin(f.t * 0.3));
    c.fillStyle = C.accent; c.fillRect(rx, mid - 6, 1, 12);
    if (Math.random() < 0.2) c.fillRect(rx - 20 - Math.random() * 40, mid + (Math.random() - 0.5) * h * 0.8, 10 + Math.random() * 40, 1);
  }

  B.Viz = { add, frame, markAll, SPEC, draw: { heroWave, thumb, thumbLive, spectrum, scope, genre, eq, mini, line } };
})();
