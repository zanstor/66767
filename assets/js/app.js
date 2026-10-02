/* UI wiring: player, store, genres, licenses, cart, menu, glitches, contact form. */
(function () {
  const B = window.BRND, U = B.util, P = B.Player, V = B.Viz, A = B.Art;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const body = document.body;
  const reduce = U.reduceMotion;

  const LIC = Object.fromEntries(B.licenses.map((l) => [l.id, l]));
  const TRK = Object.fromEntries(B.tracks.map((t) => [t.id, t]));
  const KIT = Object.fromEntries(B.kits.map((k) => [k.id, k]));
  const GEN = Object.fromEntries(B.genres.map((g) => [g.id, g]));
  const keyLabel = (t) => t.key + ' ' + (t.scale === 'dorian' ? 'dor' : t.scale === 'phrygian' ? 'phr' : 'min');
  const cover = (item, size) => A.cover(item.seed, item.cover, size || 192, size || 192);

  const state = {
    filter: 'all',
    expanded: false,
    license: LIC[U.store.get('brnd-license', 'basic')] && LIC[U.store.get('brnd-license', 'basic')].price != null ? U.store.get('brnd-license', 'basic') : 'basic',
    cart: (U.store.get('brnd-cart', []) || []).filter((i) => (i.type === 'track' ? TRK[i.id] : KIT[i.id])),
    started: false,
    heroPlayerVisible: true
  };
  const priceFor = (track, lic) => (lic === 'basic' ? track.price : LIC[lic].price);

  /* ---------- static content ---------- */
  $$('[data-socials]').forEach((box) => {
    B.config.socials.forEach((s) => box.append(U.el('a', { href: s.url, target: '_blank', rel: 'noopener', 'aria-label': s.label, text: s.id })));
  });
  $('#mailAddr').textContent = B.config.email;
  $('#coords').textContent = B.config.coords;
  $('#year').textContent = new Date().getFullYear();
  $('#statBeats').textContent = String(B.tracks.length).padStart(2, '0');
  $('#statKits').textContent = String(B.kits.length).padStart(2, '0');
  $$('[data-count-beats]').forEach((n) => { n.textContent = B.tracks.length + ' beats'; });

  /* ---------- toasts ---------- */
  const toasts = $('#toasts');
  function toast(msg) {
    if (document.getElementById('cart').classList.contains('is-open')) return; // the cart shows the change itself
    const t = U.el('div', { class: 'toast', text: msg });
    toasts.append(t);
    while (toasts.children.length > 3) toasts.firstChild.remove();
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 320); }, 2600);
  }

  /* ==========================================================================
     Beat store
     ========================================================================== */
  const list = $('#trackList'), filters = $('#filters');
  const PLUS = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 0v14M0 7h14" fill="none"/></svg>';
  const COLLAPSED = 6;

  function renderFilters() {
    const opts = [{ id: 'all', title: 'All' }].concat(B.genres);
    opts.forEach((g) => {
      const n = g.id === 'all' ? B.tracks.length : B.tracks.filter((t) => t.genre === g.id).length;
      const b = U.el('button', { class: 'filter', type: 'button', 'data-filter': g.id, 'aria-pressed': 'false' });
      b.append(document.createTextNode(g.title), U.el('span', { class: 'filter__n', text: String(n).padStart(2, '0') }));
      filters.append(b);
    });
    filters.addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (b) setFilter(b.dataset.filter);
    });
  }

  function renderTracks() {
    B.tracks.forEach((t) => {
      const li = U.el('li', { class: 'track', 'data-id': t.id, 'data-genre': t.genre });
      li.innerHTML =
        '<span class="track__wave" aria-hidden="true"><canvas></canvas></span>' +
        '<span class="track__no"><span class="track__num"></span><span class="track__eq" aria-hidden="true"><i></i><i></i><i></i></span></span>' +
        '<button class="track__main" type="button">' +
          '<span class="track__title glitch"></span>' +
          '<span class="track__tags"></span>' +
        '</button>' +
        '<span class="track__dur"></span>' +
        '<span class="track__price"></span>' +
        '<button class="track__add" type="button">' + PLUS + '</button>';
      const title = $('.track__title', li);
      title.textContent = t.title; title.dataset.text = t.title;
      $('.track__tags', li).append(document.createTextNode(t.tags.join(' / ') + ' '), U.el('b', { text: '· ' + t.bpm + ' bpm · ' + keyLabel(t) }));
      $('.track__dur', li).textContent = U.fmtTime(t.duration);
      $('.track__main', li).setAttribute('aria-label', 'Play ' + t.title);
      const it = V.add($('canvas', li), V.draw.thumb, { live: V.draw.thumbLive, data: { track: t } });
      li._viz = it;
      list.append(li);
    });

    list.addEventListener('click', (e) => {
      const li = e.target.closest('.track'); if (!li) return;
      if (e.target.closest('.track__add')) { cartToggle('track', li.dataset.id); return; }
      playTrack(li.dataset.id);
    });
    $$('.track', list).forEach((li) => {
      li.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        U.glitch($('.track__title', li));
        if (!reduce.matches) li._viz.data.glitchUntil = performance.now() + 300;
        li._viz.data.hover = true; li._viz.dirty = true;
      });
      li.addEventListener('pointerleave', () => { li._viz.data.hover = false; li._viz.dirty = true; });
    });
  }

  function playTrack(id) {
    if (P.current && P.current.id === id) P.toggle();
    else P.load(id, true);
  }

  function applyFilter() {
    let n = 0;
    const visible = [];
    $$('.track', list).forEach((li) => {
      const match = state.filter === 'all' || li.dataset.genre === state.filter;
      const show = match && (state.expanded || state.filter !== 'all' || n < COLLAPSED);
      if (match) visible.push(li.dataset.id);
      if (show) { n++; $('.track__num', li).textContent = String(n).padStart(2, '0') + '.'; }
      li.classList.toggle('is-hidden', !show);
    });
    const hidden = (state.filter === 'all' ? B.tracks.length : visible.length) - n;
    $$('[data-browse]').forEach((b) => {
      b.firstChild.textContent = hidden > 0 ? 'Browse all ' + B.tracks.length + ' ' : state.expanded ? 'Show less ' : 'Browse all ';
      b.hidden = state.filter !== 'all';
    });
    $$('.filter', filters).forEach((b) => {
      const on = b.dataset.filter === state.filter;
      b.classList.toggle('is-active', on); b.setAttribute('aria-pressed', on);
    });
    P.setQueue(visible);
  }
  function setFilter(id) { state.filter = id; applyFilter(); }

  $$('[data-browse]').forEach((b) => b.addEventListener('click', () => {
    state.expanded = !state.expanded;
    applyFilter();
    if (!state.expanded) $('#beats').scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth' });
  }));

  function updatePrices() {
    $$('.track', list).forEach((li) => { $('.track__price', li).textContent = U.fmtPrice(priceFor(TRK[li.dataset.id], state.license)); });
  }

  /* ==========================================================================
     Player UI
     ========================================================================== */
  const ui = {
    title: $('#playerTitle'), artist: $('#playerArtist'), cur: $('#playerCur'), dur: $('#playerDur'),
    img: $('#playerImg'), coverBtn: $('#playerCover'), progress: $('#playerProgress'),
    dock: $('#dock'), dockImg: $('#dockImg'), dockTitle: $('#dockTitle'), dockTags: $('#dockTags'), dockTime: $('#dockTime'), dockProgress: $('#dockProgress'),
    eqBtn: $('#eqBtn'), sigStatus: $('#sigStatus'), sigPlay: $('#sigPlay')
  };

  function onLoad(t) {
    if (!t) return;
    ui.title.textContent = t.title; ui.title.dataset.text = t.title;
    U.glitch(ui.title);
    ui.artist.textContent = 'Bronderbility · ' + t.tags.join(' / ');
    ui.dur.textContent = U.fmtTime(P.duration());
    const img = cover(t, 192);
    ui.img.src = img; ui.img.alt = 'Cover art for ' + t.title;
    ui.coverBtn.style.setProperty('--img', 'url(' + img + ')');
    ui.dockImg.src = img;
    ui.dockTitle.textContent = t.title;
    ui.dockTags.textContent = t.tags.join(' / ') + ' · ' + t.bpm + ' bpm';
    $$('.track', list).forEach((li) => li.classList.toggle('is-current', li.dataset.id === t.id));
    $('#roSource').textContent = t.title;
    $('#roBpm').textContent = t.bpm + ' bpm';
    $('#roKey').textContent = keyLabel(t);
    updateGenres();
    updateMediaSession(t, img);
  }

  function onState(s) {
    body.classList.toggle('is-playing', s.playing);
    const label = s.playing ? 'Pause' : 'Play';
    $$('[data-action="toggle"]').forEach((b) => b.setAttribute('aria-label', label));
    ui.coverBtn.setAttribute('aria-label', label);
    ui.eqBtn.setAttribute('aria-label', label);
    ui.sigStatus.lastChild.textContent = s.playing ? 'Live signal' : state.started ? 'Paused' : 'Standby';
    ui.sigPlay.textContent = s.playing ? 'Pause signal' : 'Play signal';
    ui.sigPlay.classList.toggle('is-on', s.playing);
    if (s.playing) state.started = true;
    updateDock(); updateGenres();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = s.playing ? 'playing' : 'paused';
  }

  P.on('load', onLoad);
  P.on('state', onState);

  /* transport buttons (hero + dock) */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'toggle') P.toggle();
    else if (a === 'next') P.next();
    else if (a === 'prev') P.prev();
  });
  ui.coverBtn.addEventListener('click', () => P.toggle());
  ui.eqBtn.addEventListener('click', () => P.toggle());
  ui.sigPlay.addEventListener('click', () => P.toggle());

  /* time + progress, updated every frame */
  let lastSec = -1, dragging = null;
  function tickUi() {
    requestAnimationFrame(tickUi);
    const pos = P.position(), dur = P.duration() || 1, pct = (pos / dur) * 100;
    if (dragging !== ui.progress) ui.progress.style.setProperty('--p', pct + '%');
    if (dragging !== ui.dockProgress) ui.dockProgress.style.setProperty('--p', pct + '%');
    const sec = Math.floor(pos);
    if (sec !== lastSec) {
      lastSec = sec;
      ui.cur.textContent = U.fmtTime(pos);
      ui.dur.textContent = U.fmtTime(dur);
      ui.dockTime.textContent = U.fmtTime(pos) + ' / ' + U.fmtTime(dur);
      ui.progress.setAttribute('aria-valuenow', Math.round(pct));
      ui.progress.setAttribute('aria-valuetext', U.fmtTime(pos) + ' of ' + U.fmtTime(dur));
    }
  }
  requestAnimationFrame(tickUi);

  function bindSeek(el) {
    const frac = (x) => { const r = el.getBoundingClientRect(); return U.clamp((x - r.left) / r.width, 0, 1); };
    let f = 0;
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      dragging = el; f = frac(e.clientX);
      el.setPointerCapture(e.pointerId); el.classList.add('is-drag');
      el.style.setProperty('--p', f * 100 + '%');
    });
    el.addEventListener('pointermove', (e) => {
      if (dragging !== el) return;
      f = frac(e.clientX); el.style.setProperty('--p', f * 100 + '%');
    });
    const end = () => {
      if (dragging !== el) return;
      dragging = null; el.classList.remove('is-drag');
      P.seek(f * P.duration());
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { dragging = null; el.classList.remove('is-drag'); });
    el.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: -5, ArrowRight: 5, ArrowDown: -5, ArrowUp: 5, PageDown: -30, PageUp: 30 }[e.key];
      if (d) { e.preventDefault(); P.seek(P.position() + d); }
      else if (e.key === 'Home') { e.preventDefault(); P.seek(0); }
      else if (e.key === 'End') { e.preventDefault(); P.seek(P.duration() - 1); }
    });
  }
  bindSeek(ui.progress); bindSeek(ui.dockProgress);

  /* volume */
  const vol = $('#volume');
  vol.value = Math.round(P.volume * 100);
  vol.addEventListener('input', () => P.setVolume(vol.value / 100));

  /* dock: visible once something played and the hero player is off-screen */
  function updateDock() {
    const show = state.started && !state.heroPlayerVisible;
    ui.dock.classList.toggle('is-visible', show);
    body.classList.toggle('has-dock', show);
    ui.dock.setAttribute('aria-hidden', String(!show));
  }
  new IntersectionObserver(([e]) => { state.heroPlayerVisible = e.isIntersecting; updateDock(); }).observe($('#player'));

  /* lock-screen / headset controls */
  function updateMediaSession(t, img) {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: 'Bronderbility', album: t.tags.join(' / '), artwork: img ? [{ src: img, sizes: '192x192', type: 'image/jpeg' }] : [] });
    } catch (e) { /* unsupported artwork */ }
  }
  if ('mediaSession' in navigator) {
    const h = { play: () => P.play(), pause: () => P.pause(), nexttrack: () => P.next(), previoustrack: () => P.prev() };
    Object.keys(h).forEach((k) => { try { navigator.mediaSession.setActionHandler(k, h[k]); } catch (e) { /* unsupported action */ } });
  }

  /* space bar = play / pause */
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    if (e.target.closest('input, textarea, select, button, a, [role="slider"], [contenteditable]')) return;
    e.preventDefault(); P.toggle();
  });

  /* ==========================================================================
     Canvases
     ========================================================================== */
  const heroIt = V.add($('#heroCanvas'), V.draw.heroWave, { data: { t0: reduce.matches ? 0 : performance.now() / 1000 } });
  (function bindHeroWave() {
    const wrap = $('#heroWave'), tip = $('#waveTip');
    const frac = (x) => { const r = wrap.getBoundingClientRect(); return { f: U.clamp((x - r.left) / r.width, 0, 1), x: x - r.left }; };
    wrap.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const { f, x } = frac(e.clientX);
      heroIt.data.hoverX = x; heroIt.dirty = true;
      tip.hidden = false; tip.style.left = x + 'px'; tip.textContent = U.fmtTime(f * P.duration());
    });
    wrap.addEventListener('pointerleave', () => { heroIt.data.hoverX = null; heroIt.dirty = true; tip.hidden = true; });
    wrap.addEventListener('click', (e) => {
      const { f } = frac(e.clientX);
      P.seek(f * P.duration());
      if (!P.playing) P.play();
    });
  })();

  V.add($('#eqCanvas'), V.draw.eq);
  V.add($('#spectrum'), V.draw.spectrum);
  V.add($('#scope'), V.draw.scope);
  V.add($('#dockSpectrum'), V.draw.mini);
  V.add($('#footerLine'), V.draw.line);
  V.add($('#menuLine'), V.draw.line);

  /* frequency axis under the analyzer (same log scale as the drawing) */
  (function axis() {
    const box = $('#axis'), { fmin, fmax } = V.SPEC;
    [[30, '30'], [100, '100'], [300, '300'], [1000, '1k'], [3000, '3k'], [10000, '10k'], [16000, '16k Hz']].forEach(([f, label]) => {
      const s = U.el('span', { text: label });
      s.style.left = (Math.log(f / fmin) / Math.log(fmax / fmin)) * 100 + '%';
      box.append(s);
    });
  })();

  /* level readouts */
  setInterval(() => {
    const f = V.frame;
    const db = (v) => (v > 0.00001 ? (20 * Math.log10(v)).toFixed(1).replace('-', '−') : '−∞') + ' dBFS';
    $('#roRms').textContent = db(f.live ? f.rms : 0);
    $('#roPeak').textContent = db(f.live ? f.peak : 0);
  }, 250);

  /* ==========================================================================
     Genres
     ========================================================================== */
  function renderGenres() {
    const grid = $('#genreGrid');
    B.genres.forEach((g) => {
      const count = B.tracks.filter((t) => t.genre === g.id).length;
      const card = U.el('article', { class: 'genre', 'data-genre': g.id });
      card.innerHTML =
        '<canvas class="genre__viz" aria-hidden="true"></canvas>' +
        '<div class="genre__head"><span>' + g.code + ' / ' + g.bpm + ' bpm</span><span class="genre__live">Now playing</span><span class="genre__count">' + String(count).padStart(2, '0') + ' beats</span></div>' +
        '<h3 class="genre__title"><span class="glitch"></span></h3>' +
        '<p class="genre__sub"></p><p class="genre__desc"></p>' +
        '<div class="genre__actions"><button class="btn-line" type="button" data-play-genre></button><button class="link-arrow" type="button" data-view-genre>View beats <span aria-hidden="true">→</span></button></div>';
      const t = $('.glitch', card); t.textContent = g.title; t.dataset.text = g.title;
      $('.genre__sub', card).textContent = g.sub;
      $('.genre__desc', card).textContent = g.desc;
      $('[data-play-genre]', card).textContent = 'Play ' + g.title;
      const it = V.add($('canvas', card), V.draw.genre, { data: { genre: g.id } });
      card.addEventListener('pointerenter', () => { it.data.hover = true; });
      card.addEventListener('pointerleave', () => { it.data.hover = false; });
      $('[data-play-genre]', card).addEventListener('click', () => {
        if (P.current && P.current.genre === g.id) { P.toggle(); return; }
        const first = B.tracks.find((tr) => tr.genre === g.id);
        if (first) P.load(first.id, true);
      });
      $('[data-view-genre]', card).addEventListener('click', () => {
        setFilter(g.id);
        $('#beats').scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth' });
      });
      grid.append(card);
    });
  }
  function updateGenres() {
    const cur = P.current;
    $$('.genre').forEach((card) => {
      const on = !!cur && cur.genre === card.dataset.genre && P.playing;
      card.classList.toggle('is-active', on);
      $('.genre__count', card).hidden = on;
      $('[data-play-genre]', card).textContent = (on ? 'Pause ' : 'Play ') + GEN[card.dataset.genre].title;
    });
  }

  /* ==========================================================================
     Licenses & kits
     ========================================================================== */
  function renderLicenses() {
    const box = $('#licenses');
    box.innerHTML = '';
    B.licenses.forEach((l) => {
      const sel = l.id === state.license;
      const card = U.el('article', { class: 'license' + (l.featured ? ' license--featured' : '') + (sel ? ' is-selected' : '') });
      const top = U.el('div', { class: 'license__top' }, [U.el('span', { text: l.price == null ? 'On request' : 'Lease' })]);
      if (l.featured) top.append(U.el('span', { class: 'license__tag', text: 'Recommended' }));
      const name = U.el('h3', { class: 'license__name' }, [U.el('span', { class: 'glitch', 'data-text': l.name, text: l.name })]);
      const price = U.el('p', { class: 'license__price' });
      if (l.price != null) price.textContent = U.fmtPrice(l.price);
      else { const [w, v] = l.priceLabel.split(' '); price.append(U.el('small', { text: w }), document.createTextNode(v)); }
      const ul = U.el('ul', { class: 'license__list' }, l.features.map((f) => U.el('li', { text: f })));
      const btn = U.el('button', {
        class: 'btn-line license__btn' + (sel ? ' is-on' : ''), type: 'button',
        text: l.price == null ? 'Request exclusive' : sel ? 'Selected' : 'Use this license', 'aria-pressed': l.price == null ? null : String(sel)
      });
      btn.addEventListener('click', () => {
        if (l.price == null) {
          prefillContact('Exclusive license', P.current ? 'Exclusive rights for "' + P.current.title + '".' : '');
          return;
        }
        state.license = l.id; U.store.set('brnd-license', l.id);
        renderLicenses(); updatePrices();
        toast(l.name + ' selected for new beats');
      });
      card.append(top, name, U.el('p', { class: 'license__format', text: l.format }), price, ul, btn);
      box.append(card);
    });
  }

  function renderKits() {
    const box = $('#kitGrid');
    B.kits.forEach((k) => {
      const card = U.el('article', { class: 'kit', 'data-kit': k.id });
      const img = U.el('img', { alt: 'Artwork for ' + k.title, loading: 'lazy', width: 360, height: 360 });
      const fig = U.el('div', { class: 'kit__img glitch-img' }, [img]);
      const add = U.el('button', { class: 'track__add', type: 'button', 'data-kit-add': k.id, html: PLUS });
      card.append(fig, U.el('div', { class: 'kit__body' }, [
        U.el('div', { class: 'kit__info' }, [
          U.el('div', {}, [
            U.el('h4', { class: 'kit__title' }, [U.el('span', { class: 'glitch', 'data-text': k.title, text: k.title })]),
            U.el('p', { class: 'kit__meta', text: k.contents + ' · ' + k.format })
          ]),
          U.el('div', { class: 'kit__side' }, [U.el('span', { text: U.fmtPrice(k.price) }), add])
        ])
      ]));
      add.addEventListener('click', () => cartToggle('kit', k.id));
      box.append(card);
      idle(() => { const url = A.cover(k.seed, k.cover, 360, 360); img.src = url; fig.style.setProperty('--img', 'url(' + url + ')'); });
    });
  }

  /* ==========================================================================
     Cart
     ========================================================================== */
  const cartEl = $('#cart'), scrim = $('#scrim'), cartList = $('#cartList');
  const itemOf = (i) => (i.type === 'track' ? TRK[i.id] : KIT[i.id]);
  const itemPrice = (i) => (i.type === 'track' ? priceFor(TRK[i.id], i.license) : KIT[i.id].price);

  function cartSave() { U.store.set('brnd-cart', state.cart); }
  function cartToggle(type, id) {
    const idx = state.cart.findIndex((i) => i.type === type && i.id === id);
    const item = type === 'track' ? TRK[id] : KIT[id];
    if (idx >= 0) {
      state.cart.splice(idx, 1);
      toast('Removed: ' + item.title);
    } else {
      state.cart.push({ type, id, license: type === 'track' ? state.license : null });
      toast('Added: ' + item.title + (type === 'track' ? ' / ' + LIC[state.license].name : ''));
    }
    cartSave(); cartRender();
  }

  function cartRender() {
    const n = state.cart.length;
    $('#cartCount').textContent = '[' + n + ']';
    $('#cartTitleCount').textContent = '[' + n + ']';
    $('#cartBtn').classList.toggle('has-items', n > 0);
    $('#cartBtn').setAttribute('aria-label', 'Open cart, ' + n + ' item' + (n === 1 ? '' : 's'));
    $('#cartEmpty').hidden = n > 0;
    cartList.innerHTML = '';
    state.cart.forEach((i, idx) => {
      const it = itemOf(i);
      const li = U.el('li', { class: 'citem' });
      const bodyEl = U.el('div', { class: 'citem__body' }, [
        U.el('p', { class: 'citem__title', text: it.title }),
        U.el('p', { class: 'citem__sub', text: i.type === 'track' ? it.tags.join(' / ') + ' · ' + it.bpm + ' bpm' : it.contents })
      ]);
      if (i.type === 'track') {
        const sel = U.el('select', { 'aria-label': 'License for ' + it.title, id: 'lic-' + it.id });
        B.licenses.filter((l) => l.price != null).forEach((l) => sel.append(U.el('option', { value: l.id, text: l.name + ' — ' + U.fmtPrice(priceFor(it, l.id)), selected: l.id === i.license })));
        sel.addEventListener('change', () => { state.cart[idx].license = sel.value; cartSave(); cartRender(); });
        bodyEl.append(sel);
      }
      const rm = U.el('button', { class: 'citem__remove', type: 'button', text: 'Remove' });
      rm.addEventListener('click', () => cartToggle(i.type, i.id));
      li.append(U.el('img', { src: cover(it, 112), alt: '' }), bodyEl, U.el('div', { class: 'citem__side' }, [U.el('span', { text: U.fmtPrice(itemPrice(i)) }), rm]));
      cartList.append(li);
    });
    $('#cartTotal').textContent = U.fmtPrice(state.cart.reduce((s, i) => s + itemPrice(i), 0));
    const inCart = new Set(state.cart.map((i) => i.type + ':' + i.id));
    $$('.track', list).forEach((li) => {
      const on = inCart.has('track:' + li.dataset.id), b = $('.track__add', li), title = TRK[li.dataset.id].title;
      b.classList.toggle('is-in', on);
      b.setAttribute('aria-label', (on ? 'Remove ' : 'Add ') + title + (on ? ' from cart' : ' to cart'));
    });
    $$('[data-kit-add]').forEach((b) => {
      const on = inCart.has('kit:' + b.dataset.kitAdd);
      b.classList.toggle('is-in', on);
      b.setAttribute('aria-label', (on ? 'Remove ' : 'Add ') + KIT[b.dataset.kitAdd].title + (on ? ' from cart' : ' to cart'));
    });
  }

  let lastFocus = null;
  function cartOpen(open) {
    cartEl.classList.toggle('is-open', open); scrim.classList.toggle('is-open', open);
    cartEl.setAttribute('aria-hidden', String(!open));
    if (open) { toasts.innerHTML = ''; lastFocus = document.activeElement; setTimeout(() => $('#cartClose').focus(), 50); }
    else if (lastFocus) lastFocus.focus();
  }
  $('#cartBtn').addEventListener('click', () => cartOpen(true));
  $('#cartClose').addEventListener('click', () => cartOpen(false));
  scrim.addEventListener('click', () => cartOpen(false));

  $('#checkout').addEventListener('click', () => {
    if (!state.cart.length) { toast('Cart is empty'); return; }
    const lines = state.cart.map((i, n) => {
      const it = itemOf(i);
      const what = i.type === 'track' ? LIC[i.license].name + ' (' + LIC[i.license].format + ')' : 'Sound kit (' + it.format + ')';
      return String(n + 1).padStart(2, '0') + '. ' + it.title + ' — ' + what + ' — ' + U.fmtPrice(itemPrice(i));
    });
    const total = U.fmtPrice(state.cart.reduce((s, i) => s + itemPrice(i), 0));
    const text = 'Order — ' + B.config.brand + '\n\n' + lines.join('\n') + '\n\nTotal: ' + total + '\n';
    const note = $('#checkoutNote');
    const show = (copied) => {
      note.innerHTML = '';
      note.append(document.createTextNode('Your mail app should open with the order. If it does not, send the order to '), U.el('b', { text: B.config.email }),
        document.createTextNode(copied ? '. The order text is already in your clipboard.' : '.'));
    };
    try {
      navigator.clipboard.writeText(text).then(() => show(true), () => show(false));
    } catch (e) { show(false); }
    location.href = 'mailto:' + B.config.email + '?subject=' + encodeURIComponent('Order: ' + state.cart.length + ' item(s), ' + total) + '&body=' + encodeURIComponent(text);
  });

  /* ==========================================================================
     Header, menu, navigation
     ========================================================================== */
  const header = $('#header');
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => { header.classList.toggle('is-scrolled', window.scrollY > 24); ticking = false; });
  }, { passive: true });
  header.classList.toggle('is-scrolled', window.scrollY > 24);

  const NAV_FOR = { home: 'home', beats: 'beats', signal: 'beats', genres: 'beats', store: 'store', about: 'about', contact: 'contact' };
  const navObs = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const id = NAV_FOR[e.target.id];
    $$('.nav__link').forEach((a) => a.classList.toggle('is-active', a.dataset.nav === id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  Object.keys(NAV_FOR).forEach((id) => { const s = document.getElementById(id); if (s) navObs.observe(s); });

  const menu = $('#menu'), burger = $('#burger');
  $$('.menu__link', menu).forEach((a, i) => a.style.setProperty('--i', i));
  function menuOpen(open) {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    header.classList.toggle('is-menu', open);
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) $$('.menu__label', menu).forEach((l) => U.scramble(l, l.dataset.label || (l.dataset.label = l.textContent), { duration: 700 }));
  }
  burger.addEventListener('click', () => menuOpen(!menu.classList.contains('is-open')));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => menuOpen(false)));
  window.matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches) menuOpen(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (cartEl.classList.contains('is-open')) cartOpen(false);
    if (menu.classList.contains('is-open')) menuOpen(false);
  });

  /* ==========================================================================
     Glitch & scramble behaviour
     ========================================================================== */
  $$('[data-scramble]').forEach((el) => {
    el.dataset.label = el.textContent.trim();
    el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') U.scramble(el, el.dataset.label, { duration: 420 }); });
  });

  /* one-shot glitch when hovering a block */
  ['.genre', '.license', '.kit', '.service', '.store__visual', '.player', '.sec-head'].forEach((sel) => {
    $$(sel).forEach((host) => host.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return;
      $$('.glitch', host).forEach((g) => U.glitch(g));
      $$('.glitch-img', host).forEach((g) => U.glitch(g));
      if (sel === '.store__visual') U.scramble($('#coords'), B.config.coords, { duration: 600 });
    }));
  });
  /* on touch screens, glitch on tap instead */
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const host = e.target.closest('.genre, .license, .kit, .track, .store__visual');
    if (host) { $$('.glitch, .glitch-img', host).forEach((g) => U.glitch(g)); }
  }, { passive: true });

  /* section titles glitch once as they scroll in */
  const headObs = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    U.glitch(e.target); headObs.unobserve(e.target);
  }), { threshold: 1 });
  $$('.sec-head__title .glitch').forEach((g) => headObs.observe(g));

  /* hero eyebrow cycles through the four directions */
  const eyebrow = $('#heroEyebrow');
  const LINES = ['Industrial / EBM / Dark electronic', 'Trap / Distorted 808 / Cold hats', 'Boom bap / Lo-fi / Vinyl grit', 'Nu-disco / G-funk / Vintage synths'];
  let li = 0;
  if (!reduce.matches) setInterval(() => {
    if (document.hidden || window.scrollY > window.innerHeight) return;
    li = (li + 1) % LINES.length;
    U.scramble(eyebrow, LINES[li], { duration: 800 });
  }, 3800);

  /* the big title: scramble in on load, then glitch at random */
  const titleParts = $$('#heroTitle .glitch');
  titleParts.forEach((g, i) => setTimeout(() => U.scramble(g, g.dataset.text, { duration: 1100 }), 120 + i * 220));
  (function randomTitleGlitch() {
    setTimeout(() => {
      if (!document.hidden && window.scrollY < window.innerHeight * 0.8) titleParts[Math.floor(Math.random() * titleParts.length)] && U.glitch(titleParts[Math.floor(Math.random() * titleParts.length)]);
      randomTitleGlitch();
    }, 3500 + Math.random() * 5500);
  })();

  /* random digital artifacts: thin red / white slivers that flash for a frame or two */
  const artifacts = $('#artifacts');
  (function spawn() {
    setTimeout(spawn, 1800 + Math.random() * 4200);
    if (reduce.matches || document.hidden) return;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const horiz = Math.random() < 0.8, tear = Math.random() < 0.08;
      const a = U.el('span', { class: 'artifact' + (Math.random() < 0.22 ? ' artifact--white' : '') });
      const w = tear ? window.innerWidth : horiz ? 16 + Math.random() * 150 : 1 + Math.random() * 2;
      const h = horiz || tear ? 1 + Math.floor(Math.random() * 2) : 8 + Math.random() * 50;
      a.style.cssText = 'left:' + (tear ? 0 : Math.random() * 96) + (tear ? 'px' : 'vw') + ';top:' + Math.random() * 100 + 'vh;width:' + w + 'px;height:' + h + 'px;opacity:' + (0.5 + Math.random() * 0.5);
      artifacts.append(a);
      setTimeout(() => a.remove(), 50 + Math.random() * 170);
    }
  })();

  /* ==========================================================================
     Contact
     ========================================================================== */
  const form = $('#contactForm'), status = $('#formStatus');
  function prefillContact(subject, message) {
    $('#fSubject').value = subject;
    if (message && !$('#fMessage').value) $('#fMessage').value = message;
    $('#contact').scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth' });
    setTimeout(() => $('#fName').focus({ preventScroll: true }), reduce.matches ? 0 : 700);
  }
  $$('.service').forEach((b) => b.addEventListener('click', () => prefillContact(b.dataset.subject, '')));

  function setError(input, msg) {
    const field = input.closest('.field');
    field.classList.toggle('is-invalid', !!msg);
    let err = $('.field__err', field);
    if (msg) {
      if (!err) { err = U.el('span', { class: 'field__err', id: input.id + '-err' }); field.append(err); }
      err.textContent = msg; input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', err.id);
    } else if (err) { err.remove(); input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#fName'), email = $('#fEmail'), msg = $('#fMessage');
    const errors = [
      [name, name.value.trim() ? '' : 'Add your name or artist name'],
      [email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) ? '' : 'Enter an email we can reply to'],
      [msg, msg.value.trim().length >= 10 ? '' : 'Write at least a line about the project']
    ];
    errors.forEach(([i, m]) => setError(i, m));
    const bad = errors.find(([, m]) => m);
    if (bad) { bad[0].focus(); return; }
    const subject = $('#fSubject').value + ' — ' + name.value.trim();
    const text = msg.value.trim() + '\n\n— ' + name.value.trim() + ' / ' + email.value.trim();
    status.innerHTML = '';
    status.append(document.createTextNode('Your mail app should open with this message addressed to '), U.el('b', { text: B.config.email }), document.createTextNode('. If it does not, copy the address and write to us directly.'));
    location.href = 'mailto:' + B.config.email + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
  });
  ['#fName', '#fEmail', '#fMessage'].forEach((s) => $(s).addEventListener('input', (e) => { if (e.target.closest('.field').classList.contains('is-invalid')) setError(e.target, ''); }));

  $('#copyMail').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const done = (ok) => { btn.textContent = ok ? 'Copied' : 'Select it'; setTimeout(() => { btn.textContent = 'Copy'; }, 1600); };
    try {
      navigator.clipboard.writeText(B.config.email).then(() => done(true), () => { selectText($('#mailAddr')); done(false); });
    } catch (err) { selectText($('#mailAddr')); done(false); }
  });
  function selectText(node) {
    const r = document.createRange(); r.selectNodeContents(node);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  /* ==========================================================================
     Boot
     ========================================================================== */
  function idle(fn) { (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(fn); }

  renderFilters();
  renderTracks();
  renderGenres();
  renderLicenses();
  renderKits();
  applyFilter();
  updatePrices();
  cartRender();

  const featured = B.tracks.find((t) => t.featured) || B.tracks[0];
  P.load(featured.id, false);

  idle(() => {
    const url = A.cover(19, 'refinery', 540, 380, { streakX: 0.22 });
    $('#storeImg').src = url;
    $('#storeVisual').style.setProperty('--img', 'url(' + url + ')');
  });
})();
