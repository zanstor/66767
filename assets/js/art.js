/* Generative artwork: grainy B&W skies, industrial silhouettes, one red glitch streak.
   Also produces deterministic waveform peaks that follow each beat's arrangement. */
(function () {
  const B = window.BRND, U = B.util;
  const cache = new Map();

  function valueNoise(rng) {
    const P = new Uint8Array(512), G = new Float32Array(256);
    for (let i = 0; i < 256; i++) { P[i] = i; G[i] = rng(); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
    for (let i = 0; i < 256; i++) P[i + 256] = P[i];
    const sm = (t) => t * t * (3 - 2 * t);
    const n2 = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const a = G[P[P[xi & 255] + (yi & 255)]], b = G[P[P[(xi + 1) & 255] + (yi & 255)]];
      const c = G[P[P[xi & 255] + ((yi + 1) & 255)]], d = G[P[P[(xi + 1) & 255] + ((yi + 1) & 255)]];
      const u = sm(xf), v = sm(yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
    return (x, y, oct) => {
      let s = 0, amp = 0.5, f = 1, norm = 0;
      for (let o = 0; o < (oct || 5); o++) { s += n2(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
      return s / norm;
    };
  }

  /* ---------- silhouettes (drawn in near-black over the sky) ---------- */
  const SIL = {
    spire(c, w, h, r) {
      const cx = w * (0.42 + r() * 0.16), base = h * 0.98, bw = w * 0.16;
      c.fillRect(cx - bw / 2, base - h * 0.34, bw, h * 0.34);
      c.beginPath(); c.moveTo(cx - bw * 0.42, base - h * 0.34); c.lineTo(cx, h * 0.12); c.lineTo(cx + bw * 0.42, base - h * 0.34); c.fill();
      for (const s of [-1, 1]) {
        const px = cx + s * bw * 0.5;
        c.beginPath(); c.moveTo(px - bw * 0.07, base - h * 0.34); c.lineTo(px, base - h * 0.5); c.lineTo(px + bw * 0.07, base - h * 0.34); c.fill();
      }
      c.fillRect(cx - 1, h * 0.05, 2, h * 0.08);
      c.fillRect(0, base - h * 0.07, w, h * 0.1);
      for (let i = 0; i < 9; i++) { const x = r() * w, bh = h * (0.05 + r() * 0.12); c.fillRect(x, base - bh, w * (0.04 + r() * 0.08), bh); }
    },
    tvtower(c, w, h, r) {
      const cx = w * (0.38 + r() * 0.2), base = h;
      c.beginPath(); c.moveTo(cx - w * 0.035, base); c.lineTo(cx - w * 0.012, h * 0.36); c.lineTo(cx + w * 0.012, h * 0.36); c.lineTo(cx + w * 0.035, base); c.fill();
      c.beginPath(); c.arc(cx, h * 0.3, w * 0.07, 0, Math.PI * 2); c.fill();
      c.fillRect(cx - w * 0.006, h * 0.08, w * 0.012, h * 0.2);
      c.fillRect(cx - 1, h * 0.02, 2, h * 0.08);
      for (let i = 0; i < 14; i++) { const x = r() * w, bh = h * (0.04 + r() * 0.16); c.fillRect(x, base - bh, w * (0.05 + r() * 0.1), bh); }
    },
    refinery(c, w, h, r) {
      const base = h;
      for (let i = 0; i < 5; i++) {
        const x = w * (0.45 + i * 0.1 + r() * 0.04), cw = w * (0.02 + r() * 0.025), ch = h * (0.35 + r() * 0.35);
        c.fillRect(x, base - ch, cw, ch);
        c.fillRect(x - cw * 0.3, base - ch, cw * 1.6, h * 0.012);
        for (let k = 1; k < 5; k++) c.fillRect(x - cw * 0.15, base - ch + (ch * k) / 5, cw * 1.3, 2);
      }
      for (let i = 0; i < 4; i++) {
        const x = w * (0.05 + r() * 0.45), rr = w * (0.05 + r() * 0.06);
        c.fillRect(x - rr, base - h * 0.12, rr * 2, h * 0.12);
        c.beginPath(); c.ellipse(x, base - h * 0.12, rr, rr * 0.35, 0, Math.PI, 0); c.fill();
      }
      c.fillRect(0, base - h * 0.08, w, h * 0.08);
      c.lineWidth = Math.max(1, w * 0.004); c.strokeStyle = c.fillStyle;
      for (let i = 0; i < 4; i++) { const y = base - h * (0.14 + r() * 0.12); c.beginPath(); c.moveTo(w * r() * 0.4, y); c.lineTo(w * (0.5 + r() * 0.5), y); c.stroke(); }
    },
    pylon(c, w, h, r) {
      const draw = (cx, top, s) => {
        const base = h, half = w * 0.11 * s;
        c.lineWidth = Math.max(1, w * 0.004 * s); c.strokeStyle = c.fillStyle;
        c.beginPath(); c.moveTo(cx - half, base); c.lineTo(cx - half * 0.18, top); c.lineTo(cx + half * 0.18, top); c.lineTo(cx + half, base); c.stroke();
        const steps = 9;
        for (let i = 0; i < steps; i++) {
          const y1 = base - ((base - top) * i) / steps, y2 = base - ((base - top) * (i + 1)) / steps;
          const w1 = half - (half * 0.82 * i) / steps, w2 = half - (half * 0.82 * (i + 1)) / steps;
          c.beginPath(); c.moveTo(cx - w1, y1); c.lineTo(cx + w2, y2); c.moveTo(cx + w1, y1); c.lineTo(cx - w2, y2); c.stroke();
        }
        for (const k of [0.12, 0.3]) { const y = top + (base - top) * k; c.beginPath(); c.moveTo(cx - half * 1.3, y); c.lineTo(cx + half * 1.3, y); c.stroke(); }
        return { x: cx, y: top + (base - top) * 0.12, half };
      };
      const a = draw(w * (0.3 + r() * 0.1), h * 0.18, 1), b = draw(w * 0.86, h * 0.48, 0.55);
      c.lineWidth = 1;
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(-10, a.y + 30); c.quadraticCurveTo(a.x * 0.5, a.y + 40, a.x + s * a.half * 1.3, a.y);
        c.quadraticCurveTo((a.x + b.x) / 2, (a.y + b.y) / 2 + h * 0.08, b.x + s * b.half * 1.3, b.y); c.lineTo(w + 10, b.y + 20); c.stroke();
      }
      c.fillRect(0, h * 0.96, w, h * 0.04);
    },
    city(c, w, h, r) {
      let x = -5;
      while (x < w) {
        const bw = w * (0.05 + r() * 0.1), bh = h * (0.15 + Math.pow(r(), 1.6) * 0.6);
        c.fillRect(x, h - bh, bw, bh);
        if (r() < 0.3) c.fillRect(x + bw * 0.45, h - bh - h * 0.06, 2, h * 0.06);
        x += bw + (r() < 0.3 ? w * 0.01 : 0);
      }
    },
    vinyl(c, w, h, r) {
      const cx = w * (0.55 + r() * 0.1), cy = h * 0.62, R = Math.min(w, h) * 0.42;
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1;
      for (let rr = R * 0.38; rr < R * 0.98; rr += 2.2) { c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = R * 0.25;
      c.beginPath(); c.arc(cx, cy, R * 0.7, -0.9, -0.5); c.stroke();
      c.fillStyle = '#d8d4d2'; c.beginPath(); c.arc(cx, cy, R * 0.33, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#050505'; c.beginPath(); c.arc(cx, cy, R * 0.03, 0, Math.PI * 2); c.fill();
      c.fillRect(cx - R * 0.2, cy + R * 0.12, R * 0.4, 2);
    },
    grid(c, w, h, r) {
      const hor = h * 0.62, sx = w * (0.5 + (r() - 0.5) * 0.1), R = w * 0.22;
      const g = c.createLinearGradient(0, hor - R, 0, hor);
      g.addColorStop(0, 'rgba(235,235,235,0.95)'); g.addColorStop(1, 'rgba(120,120,120,0.9)');
      c.save(); c.fillStyle = g; c.beginPath(); c.arc(sx, hor, R, Math.PI, 0); c.fill(); c.restore();
      c.save(); c.fillStyle = '#050505';
      for (let i = 0; i < 7; i++) { const y = hor - R * 0.08 - i * i * R * 0.018; c.fillRect(sx - R, y, R * 2, 1.5 + i * 0.5); }
      c.fillRect(0, hor, w, h - hor);
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
      for (let i = -12; i <= 12; i++) { c.beginPath(); c.moveTo(sx + i * w * 0.02, hor); c.lineTo(sx + i * w * 0.22, h); c.stroke(); }
      for (let k = 1; k < 12; k++) { const y = hor + Math.pow(k / 12, 2.2) * (h - hor); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
      c.restore();
    },
    palms(c, w, h, r) {
      c.save(); c.fillStyle = 'rgba(230,230,230,0.9)';
      c.beginPath(); c.arc(w * 0.62, h * 0.72, w * 0.2, Math.PI, 0); c.fill(); c.restore();
      c.fillRect(0, h * 0.72, w, h * 0.28);
      const palm = (x, top, lean) => {
        c.lineWidth = Math.max(2, w * 0.012); c.strokeStyle = c.fillStyle; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x, h); c.quadraticCurveTo(x + lean * 0.5, (h + top) / 2, x + lean, top); c.stroke();
        c.lineWidth = Math.max(1.5, w * 0.007);
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI + (i / 6) * Math.PI + (r() - 0.5) * 0.3, L = w * (0.09 + r() * 0.05);
          const ex = x + lean + Math.cos(a) * L, ey = top + Math.sin(a) * L * 0.5 + L * 0.35;
          c.beginPath(); c.moveTo(x + lean, top); c.quadraticCurveTo(x + lean + Math.cos(a) * L * 0.6, top + Math.sin(a) * L * 0.6 - L * 0.1, ex, ey); c.stroke();
        }
      };
      palm(w * 0.2, h * 0.28, w * 0.05); palm(w * 0.33, h * 0.4, -w * 0.03); palm(w * 0.86, h * 0.33, -w * 0.06);
    }
  };

  /* Draws one artwork into a canvas and returns it. */
  function paint(seed, style, w, h, opts) {
    opts = opts || {};
    const rng = U.mulberry32(seed * 7919 + 13), noise = valueNoise(rng);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');

    /* clouds at low resolution, upscaled for softness */
    const lw = 96, lh = Math.max(16, Math.round((96 * h) / w));
    const low = document.createElement('canvas'); low.width = lw; low.height = lh;
    const lc = low.getContext('2d'), img = lc.createImageData(lw, lh);
    const lx = 0.45 + rng() * 0.4, ly = 0.15 + rng() * 0.3, sc = 3.2 + rng() * 1.6;
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const u = x / lw, v = y / lh;
      let n = noise(u * sc, v * sc * 0.85, 5);
      n = Math.min(1, Math.max(0, (n - 0.32) / 0.42));
      const light = Math.max(0, 1 - Math.hypot(u - lx, (v - ly) * 1.3) * 1.35);
      const val = 14 + 175 * Math.pow(n, 1.4) * (0.25 + 0.75 * light) + 40 * light * light;
      const i = (y * lw + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val; img.data[i + 3] = 255;
    }
    lc.putImageData(img, 0, 0);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(low, 0, 0, w, h);

    c.fillStyle = '#060606';
    (SIL[style] || SIL.city)(c, w, h, rng);

    /* film grain */
    const id = c.getImageData(0, 0, w, h), d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = (Math.random() - 0.5) * 34;
      d[i] = U.clamp(d[i] + g, 0, 255); d[i + 1] = U.clamp(d[i + 1] + g, 0, 255); d[i + 2] = U.clamp(d[i + 2] + g, 0, 255);
    }
    c.putImageData(id, 0, 0);

    /* horizontal tear slices */
    const slices = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < slices; i++) {
      const sy = Math.floor(rng() * h), sh = Math.max(2, Math.floor(rng() * h * 0.03)), dx = Math.floor((rng() - 0.5) * w * 0.08);
      c.drawImage(cv, 0, sy, w, sh, dx, sy, w, sh);
    }

    /* the red distortion streak */
    const rx = w * (opts.streakX != null ? opts.streakX : 0.18 + rng() * 0.64);
    const top = h * (0.02 + rng() * 0.2), bottom = h * (0.5 + rng() * 0.45);
    c.fillStyle = 'rgba(255,51,0,0.85)';
    c.fillRect(rx, top, Math.max(1, w * 0.004), bottom - top);
    for (let y = top; y < bottom; y += 1 + rng() * 3) {
      const len = w * (0.004 + Math.pow(rng(), 3) * 0.05);
      c.globalAlpha = 0.35 + rng() * 0.65;
      c.fillRect(rx - len * rng(), y, len, 1 + Math.floor(rng() * 2));
    }
    c.globalAlpha = 1;

    const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
    return cv;
  }

  /* Cached JPEG data URL for <img> / CSS use. */
  function cover(seed, style, w, h, opts) {
    w = w || 360; h = h || w;
    const key = [seed, style, w, h, opts && opts.streakX].join(':');
    if (!cache.has(key)) {
      let url = '';
      try { url = paint(seed, style, w, h, opts).toDataURL('image/jpeg', 0.84); } catch (e) { url = ''; }
      cache.set(key, url);
    }
    return cache.get(key);
  }

  /* Waveform peaks that follow the beat's arrangement: quiet intro, dips on breaks, fading outro. */
  const peakCache = new Map();
  function peaks(track, n) {
    const key = track.id + ':' + n;
    if (peakCache.has(key)) return peakCache.get(key);
    const rng = U.mulberry32(track.seed * 31 + n);
    const barSec = (60 / track.bpm) * 4, total = Math.max(8, Math.floor(track.duration / barSec));
    const energy = { intro: 0.3, verse: 0.66, hook: 0.86, break: 0.34, outro: 0.5 };
    const out = new Float32Array(n);
    let smooth = 0;
    for (let i = 0; i < n; i++) {
      const tSec = (i / n) * track.duration, bar = Math.floor(tSec / barSec);
      const sec = B.Engine.section(bar, total);
      let e = energy[sec];
      if (sec === 'outro') e *= Math.max(0.1, 1 - (bar - (total - 4)) / 4);
      const beat = ((tSec / barSec) * 4) % 1;
      const transient = Math.exp(-beat * 5) * (sec === 'verse' || sec === 'hook' ? 1 : 0.3);
      const raw = e * (0.5 + 0.35 * transient + 0.3 * rng());
      smooth = smooth * 0.35 + raw * 0.65;
      out[i] = U.clamp(smooth, 0.02, 1);
    }
    peakCache.set(key, out);
    return out;
  }

  B.Art = { cover, paint, peaks };
})();
