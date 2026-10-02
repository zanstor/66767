/* Shared helpers: seeded randomness, formatting, text scramble, one-shot glitch. */
(function () {
  const B = window.BRND;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* Deterministic PRNG so a seed always produces the same pattern / artwork. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Stateless hash → [0,1). Used by the sequencer so seeking replays identically. */
  function hash01(a, b, c) {
    let h = Math.imul((a | 0) ^ 0x9E3779B9, 0x85EBCA6B);
    h = Math.imul(h ^ ((b | 0) + 0x632BE5AB), 0xC2B2AE35);
    h = Math.imul(h ^ ((c | 0) + 0x27D4EB2F), 0x165667B1);
    h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }

  function pick(rng, list) { return list[Math.floor(rng() * list.length) % list.length]; }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function fmtPrice(v) { return B.config.currency + v; }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* Tiny event emitter. */
  function emitter() {
    const map = {};
    return {
      on(ev, fn) { (map[ev] = map[ev] || []).push(fn); return () => { map[ev] = map[ev].filter(f => f !== fn); }; },
      emit(ev, data) { (map[ev] || []).forEach(fn => fn(data)); }
    };
  }

  /* Text scramble: characters flicker through glyphs and settle left → right. */
  const GLYPHS = '!<>-_\\/[]{}—=+*^?#01░▒▓█';
  const running = new WeakMap();
  function scramble(el, text, opts) {
    opts = opts || {};
    const target = text == null ? el.textContent : text;
    if (reduceMotion.matches || opts.instant) { el.textContent = target; return; }
    const from = el.textContent;
    const len = Math.max(from.length, target.length);
    const duration = opts.duration || 520;
    const start = performance.now();
    const queue = [];
    for (let i = 0; i < len; i++) {
      const s = Math.random() * duration * 0.45;
      queue.push({ from: from[i] || '', to: target[i] || '', start: s, end: s + duration * (0.25 + Math.random() * 0.3) });
    }
    const token = {};
    running.set(el, token);
    function frame(now) {
      if (running.get(el) !== token) return;
      const t = now - start;
      let out = '', done = 0;
      for (const q of queue) {
        if (t >= q.end) { out += q.to; done++; }
        else if (t >= q.start) out += q.to === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        else out += q.from;
      }
      el.textContent = out;
      if (done < queue.length) requestAnimationFrame(frame);
      else el.textContent = target;
    }
    requestAnimationFrame(frame);
  }

  /* One-shot glitch: adds a class for a single animation run. */
  function glitch(el, cls) {
    if (!el || reduceMotion.matches) return;
    cls = cls || 'is-glitching';
    el.classList.remove(cls);
    void el.offsetWidth; // restart animation
    el.classList.add(cls);
    clearTimeout(el._glitchT);
    el._glitchT = setTimeout(() => el.classList.remove(cls), 460);
  }

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    }
  };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (children || []).forEach(c => c != null && node.append(c));
    return node;
  }

  B.util = { reduceMotion, mulberry32, hash01, pick, fmtTime, fmtPrice, clamp, lerp, emitter, scramble, glitch, store, el };
})();
