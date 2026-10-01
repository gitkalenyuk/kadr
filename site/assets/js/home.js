/* Kadr site — landing page interactions. Vanilla JS, no dependencies.
   Animations only touch transform/opacity (or canvases), run while visible,
   and are reduced to still states with prefers-reduced-motion. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // ?instant skips the demo's typing delays (handy for screenshots and tests)
  const instant = /[?&]instant(&|=|$)/.test(location.search);
  const sleep = (ms) => new Promise((r) => (instant ? r() : setTimeout(r, ms)));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DATA = window.KADR_SHOWCASE || {};
  // showcase paths are site-root relative; the Ukrainian page lives one folder down
  const ROOT = (document.body && document.body.dataset.root) || '';
  const asset = (p) => (!p || /^(https?:|data:|\/|\.\.\/)/.test(p) ? p : ROOT + p);
  const LANG = document.documentElement.lang === 'uk' ? 'uk' : 'en';
  const STR = {
    en: {
      play: 'Play video', pause: 'Pause video', playDemo: 'Play the demo video', pauseDemo: 'Pause the demo video',
      soundOn: 'Sound on', soundOff: 'Sound off', frame: 'frame', withFilter: (n) => `Same frame with the ${n} filter`, wordArt: (n) => `${n} word-art effect`,
      real: '200 OK · real response from kadr-server', mcpComment: '// Claude calls the kadr MCP tool', show: (l, c) => `${l}: show ${c}`,
      thinking: 'Claude is thinking',
      api: {},
      chat: null,
    },
    uk: {
      play: 'Відтворити відео', pause: 'Призупинити відео', playDemo: 'Відтворити демо', pauseDemo: 'Призупинити демо',
      soundOn: 'Зі звуком', soundOff: 'Без звуку', frame: 'кадр', withFilter: (n) => `Той самий кадр із фільтром ${n}`, wordArt: (n) => `Ефект word-art ${n}`,
      real: '200 OK · справжня відповідь kadr-server', mcpComment: '// Claude викликає MCP-інструмент kadr', show: (l, c) => `${l}: показати ${c}`,
      thinking: 'Claude думає',
      api: { Split: 'Розрізати', Delete: 'Видалити', Freeze: 'Стоп-кадр', 'Speed curve': 'Крива швидкості', 'Add text': 'Додати текст', Captions: 'Субтитри', 'Remove BG': 'Прибрати фон', 'Look at frame': 'Глянути кадр', Export: 'Експорт' },
      // the chat demo in Ukrainian; the titles stay English because the rendered video shows them
      chat: {
        user: ['Зроби 10-секундне промо 16:9 з моїх трьох фото: повільний наїзд у стилі Кена Бернса, великі word-art титри «Edit by hand.», «Or by API.», «Or just ask.», swirl-переходи, бірюзово-помаранчевий грейд на кадрі з океаном і блиск наприкінці.'],
        ai: ['Беруся — збираю таймлайн у Kadr.', '<b>Готово.</b> 10 с, 3 кліпи, 3 титри, 2 переходи. Я переглянув кадр на 5-й секунді — титри добре читаються. Вмикаю відтворення.'],
      },
    },
  }[LANG];

  /* ---------------------------------------------------------------- visibility helper */
  function whenVisible(el, on, off, margin = '0px') {
    if (!el) return;
    new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? on() : off && off())), { rootMargin: margin }).observe(el);
  }

  /* ---------------------------------------------------------------- lazy videos */
  function loadVideo(v) {
    if (v.dataset.loaded) return;
    v.dataset.loaded = '1';
    (v.dataset.sources || '').split(',').filter(Boolean).forEach((pair) => {
      const [src, type] = pair.split('|');
      const s = document.createElement('source');
      s.src = src; if (type) s.type = type;
      v.appendChild(s);
    });
    v.load();
  }
  $$('video.lazy-video').forEach((v) => {
    if (reduce) { v.controls = true; v.preload = 'none'; }
    // user-controlled pause (also stops autoplay when scrolled back into view)
    const host = v.parentElement;
    if (!reduce && host) {
      host.classList.add('vid-host');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'vid-toggle';
      b.setAttribute('aria-pressed', 'false');
      const sync = () => {
        const paused = v.dataset.userPaused === '1';
        b.setAttribute('aria-pressed', String(paused));
        b.setAttribute('aria-label', paused ? STR.play : STR.pause);
        b.innerHTML = `<svg aria-hidden="true"><use href="#${paused ? 'i-play' : 'i-pause'}"/></svg>`;
      };
      b.addEventListener('click', () => {
        if (v.dataset.userPaused === '1') { delete v.dataset.userPaused; loadVideo(v); v.play().catch(() => {}); }
        else { v.dataset.userPaused = '1'; v.pause(); }
        sync();
      });
      sync();
      host.appendChild(b);
    }
    whenVisible(v, () => { loadVideo(v); if (!reduce && !v.dataset.manual && v.dataset.userPaused !== '1') v.play().catch(() => {}); },
      () => { if (!v.paused) v.pause(); }, '200px');
  });

  /* ================================================================ HERO */
  const HERO = Object.assign({
    duration: 10,
    tracks: [
      { type: 'text', clips: [
        { id: 't1', s: 0.25, e: 3.3, label: 'Edit by hand.' },
        { id: 't2', s: 3.75, e: 6.8, label: 'Or by API.' },
        { id: 't3', s: 7.25, e: 9.9, label: 'Or just ask.' }] },
      { type: 'sticker', clips: [{ id: 'st', s: 7.6, e: 10, label: 'sparkle' }] },
      { type: 'filter', clips: [{ id: 'fl', s: 3.5, e: 7, label: 'filter' }] },
      { type: 'main', clips: [
        { id: 'a', s: 0, e: 3.5, label: 'Aurora flow', cls: 'v-a' },
        { id: 'b', s: 3.5, e: 7, label: 'Synthwave', cls: 'v-b' },
        { id: 'c', s: 7, e: 10, label: 'Neon floor', cls: 'v-c' }],
        transitions: [{ id: 'tr1', t: 3.5 }, { id: 'tr2', t: 7 }] },
      { type: 'audio', clips: [{ id: 'sfx1', s: 3.1, e: 4.3, label: 'whoosh' }, { id: 'sfx2', s: 6.6, e: 7.8, label: 'whoosh' }] },
    ],
    script: [],
  }, DATA.hero || {});

  const editor = $('#editor');
  const video = $('#hero-video');
  const canvasBox = video && video.closest('.ed-canvas');
  const tracksEl = $('#tl-tracks');
  const rulerEl = $('#tl-ruler');
  const playhead = $('#tl-playhead');
  const tcNow = $('#tc-now');
  const chatLog = $('#chat-log');

  function buildTimeline() {
    if (!tracksEl) return;
    const dur = HERO.duration * 1.06;
    editor.style.setProperty('--dur', dur);
    rulerEl.innerHTML = '';
    for (let s = 0; s <= HERO.duration; s += 2) {
      const sp = document.createElement('span');
      sp.style.left = `${(s / dur) * 100}%`;
      sp.textContent = `00:${String(s).padStart(2, '0')}`;
      rulerEl.appendChild(sp);
    }
    tracksEl.innerHTML = '';
    HERO.tracks.forEach((tr) => {
      const row = document.createElement('div');
      row.className = `trk ${tr.type}`;
      tr.clips.forEach((c) => {
        const el = document.createElement('div');
        const kind = tr.type === 'main' ? 'video' : tr.type;
        el.className = `clip ${kind} ${c.cls || ''}`;
        el.dataset.id = c.id;
        el.style.setProperty('--s', c.s);
        el.style.setProperty('--e', c.e);
        if (c.thumb) el.style.backgroundImage = `url(${asset(c.thumb)})`;
        const ico = { text: 'T', sticker: '★', filter: '◐', audio: '' }[tr.type];
        el.innerHTML = tr.type === 'main' ? `<span>${esc(c.label)}</span>${c.fx ? `<em class="fx">◐ ${esc(c.fx)}</em>` : ''}` : (ico ? `<span class="ico">${ico}</span>` : '') + (tr.type === 'audio' ? '' : `<span>${esc(c.label)}</span>`);
        row.appendChild(el);
      });
      (tr.transitions || []).forEach((t) => {
        const b = document.createElement('i');
        b.className = 'tr-badge';
        b.dataset.id = t.id;
        b.style.setProperty('--t', t.t);
        row.appendChild(b);
      });
      tracksEl.appendChild(row);
    });
  }

  function show(ids, on = true) {
    (Array.isArray(ids) ? ids : [ids]).forEach((id) => {
      const el = tracksEl.querySelector(`[data-id="${id}"]`);
      if (el) el.classList.toggle('on', on);
    });
  }
  function select(id) {
    $$('.clip.sel', tracksEl).forEach((c) => c.classList.remove('sel'));
    if (id) { const el = tracksEl.querySelector(`[data-id="${id}"]`); if (el) el.classList.add('sel'); }
  }
  function pickTile(key) {
    const t = $(`.tile[data-tile="${key}"]`);
    if (!t) return;
    t.classList.add('pick');
    setTimeout(() => t.classList.remove('pick'), 650);
  }
  function setField(id, text) {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.classList.add('flash');
    setTimeout(() => el.classList.remove('flash'), 700);
  }
  function setSlider(id, v) { const el = $(id); if (el) el.style.setProperty('--v', v); }

  // default MCP conversation; tool rows reveal the clips they create
  const BASE_SCRIPT = HERO.script.length ? HERO.script : [
    { user: 'Make a 10-second 16:9 promo: aurora intro, three bold titles — “Edit by hand.”, “Or by API.”, “Or just ask.” — swirl transitions and a sparkle at the end.' },
    { ai: 'On it — building the timeline.' },
    { tool: 'project_create', args: '{"name":"Summer promo","ratio":"16:9"}' },
    { tool: 'media_generate', args: '{"preset_id":"aurora_flow","add_to_timeline":true}', show: 'a', tile: 'a' },
    { tool: 'timeline_segment_add', args: '{"material_id":"mat_synthwave"}', show: 'b', tile: 'b' },
    { tool: 'media_generate', args: '{"preset_id":"neon_floor","add_to_timeline":true}', show: 'c', tile: 'c' },
    { tool: 'kadr_batch', args: '3 × text_add, text_apply_effect, text_set_glyph_animation', show: ['t1', 't2', 't3'], fields: [['#insp-effect', 'fx_neon_outline'], ['#insp-anim', 'in_letter_rise']], sliders: [['#sl-glow', 0.72], ['#sl-size', 0.82]], select: 't1' },
    { tool: 'transition_apply_all', args: '{"type":"swirl_twist","duration_us":600000}', show: ['tr1', 'tr2'], select: null },
    { tool: 'filter_apply', args: '{"filter_id":"…","intensity":0.8}', show: 'fl' },
    { tool: 'sticker_add', args: '{"sticker_id":"sparkle_twinkle","at_us":7600000}', show: 'st' },
    { tool: 'sfx_add', args: '{"sfx_id":"whoosh_fast"} ×2', show: ['sfx1', 'sfx2'] },
    { tool: 'preview_frame', args: '{"time_us":5000000}', preview: true },
    { ai: '<b>Done.</b> 10.0 s, 5 tracks, 2 transitions. I checked the frame at 5 s — titles are crisp. Playing it for you.', play: true },
  ];
  const SCRIPT = (() => {
    if (!STR.chat) return BASE_SCRIPT;
    const u = [...STR.chat.user], a = [...STR.chat.ai];
    return BASE_SCRIPT.map((st) => {
      if (st.user && u.length) return Object.assign({}, st, { user: u.shift() });
      if (st.ai && a.length) return Object.assign({}, st, { ai: a.shift() });
      return st;
    });
  })();

  let runId = 0;
  let heroVisible = true;
  async function typeInto(el, text, run, cps = 70) {
    el.classList.add('caret');
    if (reduce || instant) { el.textContent = text; el.classList.remove('caret'); return; }
    for (let i = 1; i <= text.length; i += 2) {
      if (run !== runId) return;
      el.textContent = text.slice(0, i);
      await sleep(1000 / cps * 2);
    }
    el.textContent = text;
    el.classList.remove('caret');
  }
  function addMsg(cls, html) {
    const li = document.createElement('li');
    li.className = `msg ${cls}`;
    li.innerHTML = html || '';
    chatLog.appendChild(li);
    while (chatLog.children.length > 16) chatLog.firstElementChild.remove();
    requestAnimationFrame(() => li.classList.add('on'));
    return li;
  }
  async function waitVisible(run) { while (!heroVisible && run === runId) await sleep(250); }

  async function runScript() {
    const run = ++runId;
    chatLog.innerHTML = '';
    $$('.clip, .tr-badge', tracksEl).forEach((c) => c.classList.remove('on', 'sel', 'has-fx'));
    setField('#insp-effect', '—'); setField('#insp-anim', '—');
    setSlider('#sl-glow', 0); setSlider('#sl-size', 0.62);
    stopPlayback();
    canvasBox.classList.remove('playing');
    await sleep(reduce ? 0 : 500);
    const tools = SCRIPT.filter((x) => x.tool).length || 1;
    let doneTools = 0;
    const prog = $('#chat-progress');
    if (prog) prog.style.transform = 'scaleX(0)';
    for (const step of SCRIPT) {
      if (run !== runId) return;
      await waitVisible(run);
      if (step.user) {
        const li = addMsg('msg-user');
        await typeInto(li, step.user, run, 90);
        await sleep(reduce ? 0 : 350);
      } else if (step.ai) {
        if (!reduce && !instant) {
          const dots = addMsg('msg-think', `<span class="sr-only">${esc(STR.thinking)}</span><i></i><i></i><i></i>`);
          await sleep(700);
          dots.remove();
          if (run !== runId) return;
        }
        const li = addMsg('msg-ai');
        li.innerHTML = step.ai;
        await sleep(reduce ? 0 : 500);
      } else if (step.tool) {
        const li = addMsg('msg-tool', `<span class="st"></span><span class="tn">${esc(step.tool)}</span><span class="ta">${esc(step.args || '')}</span>`);
        await sleep(reduce ? 0 : 380);
        if (run !== runId) return;
        li.classList.add('done');
        doneTools++;
        if (prog) prog.style.transform = `scaleX(${(doneTools / tools).toFixed(3)})`;
        if (step.tile) pickTile(step.tile);
        if (step.show) show(step.show);
        if (step.fx) { const el = tracksEl.querySelector(`[data-id="${step.fx}"]`); if (el) el.classList.add('has-fx'); }
        if (step.fields) step.fields.forEach(([id, t]) => setField(id, t));
        if (step.sliders) step.sliders.forEach(([id, v]) => setSlider(id, v));
        if ('select' in step) select(step.select);
        if (step.preview) { video.currentTime = 5; canvasBox.classList.add('playing'); const f = $('#ed-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
        await sleep(reduce ? 0 : 160);
      }
      if (step.play) startPlayback();
    }
    // loop the whole demo while it stays on screen
    if (!reduce && !instant) {
      await sleep(16000);
      while (run === runId && (!heroVisible || heroPaused)) await sleep(500);
      if (run === runId) {
        editor.classList.add('resetting');
        await sleep(450);
        editor.classList.remove('resetting');
        if (run === runId) runScript();
      }
    }
  }

  let rafId = 0;
  let playing = false;
  let heroPaused = false;
  function fmtTC(t) {
    const f = Math.floor((t % 1) * 30);
    const s = Math.floor(t);
    return `00:00:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
  }
  function tick() {
    rafId = 0;
    if (!playing || heroPaused) return;
    const t = video.currentTime || 0;
    const area = tracksEl.getBoundingClientRect();
    const dur = HERO.duration * 1.06;
    const x = (t / dur) * area.width;
    playhead.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    tcNow.textContent = fmtTC(t);
    rafId = requestAnimationFrame(tick);
  }
  function startPlayback() {
    if (!video) return;
    canvasBox.classList.add('playing');
    playing = true;
    if (reduce || heroPaused) { if (reduce) video.currentTime = 5; return; }
    video.play().then(() => { if (!rafId) rafId = requestAnimationFrame(tick); }).catch(() => { playing = false; });
  }
  function stopPlayback() {
    playing = false;
    if (video && !video.paused) video.pause();
    cancelAnimationFrame(rafId); rafId = 0;
    if (playhead) playhead.style.transform = 'translate3d(0,0,0)';
    if (tcNow) tcNow.textContent = fmtTC(0);
  }

  if (editor && video) {
    buildTimeline();
    let started = false;
    whenVisible(editor, () => {
      heroVisible = true;
      if (!started) { started = true; runScript(); }
      if (playing && !heroPaused && video.paused && !reduce) video.play().then(() => { if (!rafId) rafId = requestAnimationFrame(tick); }).catch(() => {});
    }, () => {
      heroVisible = false;
      if (!video.paused) video.pause();
    });
    $('#chat-replay').addEventListener('click', () => { heroPaused = false; syncPause(); runScript(); });
    const pauseBtn = $('#hero-pause');
    const syncPause = () => {
      pauseBtn.setAttribute('aria-pressed', String(heroPaused));
      pauseBtn.setAttribute('aria-label', heroPaused ? STR.playDemo : STR.pauseDemo);
      pauseBtn.innerHTML = `<svg aria-hidden="true"><use href="#${heroPaused ? 'i-play' : 'i-pause'}"/></svg>`;
    };
    pauseBtn.addEventListener('click', () => {
      heroPaused = !heroPaused;
      if (heroPaused) video.pause();
      else if (playing) video.play().then(() => { if (!rafId) rafId = requestAnimationFrame(tick); }).catch(() => {});
      syncPause();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden && !video.paused) video.pause(); else if (!document.hidden && playing && !heroPaused && heroVisible && !reduce) video.play().catch(() => {}); });

    // perspective tilt that flattens as the editor scrolls into view
    if (!reduce) {
      let ticking = false;
      const stage = $('#stage');
      const update = () => {
        ticking = false;
        if (innerWidth <= 760) { editor.style.removeProperty('--tilt'); editor.style.removeProperty('--sc'); return; }
        const r = stage.getBoundingClientRect();
        const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight * 0.85)));
        const ease = 1 - Math.pow(1 - p, 3);
        editor.style.setProperty('--tilt', `${(1 - ease) * 18}deg`);
        editor.style.setProperty('--sc', (0.94 + ease * 0.06).toFixed(4));
      };
      addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
      addEventListener('resize', update, { passive: true });
      update();
      // subtle pointer parallax (desktop only)
      if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
        let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
        const loop = () => {
          cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08;
          editor.style.setProperty('--ry', `${cx.toFixed(3)}deg`);
          editor.style.setProperty('--px', `${cy.toFixed(3)}deg`);
          raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.01 ? requestAnimationFrame(loop) : 0;
        };
        stage.addEventListener('pointermove', (e) => {
          const r = stage.getBoundingClientRect();
          tx = ((e.clientX - r.left) / r.width - 0.5) * 3;
          ty = -((e.clientY - r.top) / r.height - 0.5) * 2;
          if (!raf) raf = requestAnimationFrame(loop);
        }, { passive: true });
        stage.addEventListener('pointerleave', () => { tx = 0; ty = 0; if (!raf) raf = requestAnimationFrame(loop); });
      }
    }
  }

  /* ================================================================ API demo */
  const P = 'prj_9f2c41d07a3e', S = 'seg_4b1e9a0c2d7f';
  const BASE = [
    { label: 'Split', icon: 'i-scissors', key: 'Ctrl+B', cmd: 'timeline.segment.split', args: { project_id: P, segment_id: S, at_us: 2500000 },
      result: { track_id: 'trk_5d0e1c9b2a47', left: { id: S, target: { start_us: 0, duration_us: 2500000 } }, right: { id: 'seg_c81f02e6a9d4', target: { start_us: 2500000, duration_us: 3500000 } } } },
    { label: 'Delete', icon: 'i-trash', key: 'Del', cmd: 'timeline.segment.delete', args: { project_id: P, segment_id: 'seg_c81f02e6a9d4' },
      result: { deleted: ['seg_c81f02e6a9d4'] } },
    { label: 'Freeze', icon: 'i-snow', cmd: 'timeline.segment.freeze', args: { project_id: P, segment_id: S, at_us: 1200000 },
      result: { track_id: 'trk_5d0e1c9b2a47', segment: { id: 'seg_77a1d3f0b9e2', target: { start_us: 1200000, duration_us: 3000000 } } } },
    { label: 'Speed curve', icon: 'i-gauge', cmd: 'segment.set_speed_curve', args: { project_id: P, segment_id: S, preset: 'hero' },
      result: { segment: { id: S, speed_curve: { preset: 'hero' }, target: { start_us: 0, duration_us: 3640000 } } } },
    { label: 'Add text', icon: 'i-text', cmd: 'text.add', args: { project_id: P, text: 'Edit by hand.', style: { effect_id: 'fx_neon_outline' } },
      result: { segment_id: 'seg_8ce2832025e4', track_id: 'trk_3b9ed8f10afa' } },
    { label: 'Captions', icon: 'i-cc', cmd: 'captions.auto', args: { project_id: P, style_id: 'cap_highlight_word', wait: true },
      result: { job_id: 'cap_3c9e01a7', kind: 'captions', state: 'done', progress: 1, language: 'en', model: 'small', device: 'cuda' } },
    { label: 'Remove BG', icon: 'i-wand', cmd: 'ai.remove_background', args: { project_id: P, segment_id: S, wait: true },
      result: { segment_id: S, state: 'done', enabled: true, provider: 'onnx', model: 'u2net', note: 'Background removed; the matte is cached for this clip.' } },
    { label: 'Look at frame', icon: 'i-eye', cmd: 'preview.frame', args: { project_id: P, time_us: 5400000, width: 1280 },
      result: { width: 1280, height: 720, time_us: 5400000, png_base64: 'iVBORw0KGgo…' } },
    { label: 'Export', icon: 'i-export', key: 'Ctrl+E', cmd: 'export.start', args: { project_id: P, resolution: '4k', fps: 60, codec: 'hevc' },
      result: { job_id: 'exp_8b2d4f61', state: 'running', kind: 'video', width: 3840, height: 2160, fps: 60, codec: 'hevc' } },
  ];
  // Prefer real request/response pairs captured from kadr-server (gen-showcase.mjs).
  const SAMPLES = DATA.samples || {};
  const BUTTONS = BASE.map((b) => {
    const smp = SAMPLES[b.cmd];
    if (!smp) return b;
    const args = Object.assign({}, smp.request);
    if (b.cmd === 'export.start') { delete args.range_start_us; delete args.range_end_us; delete args.overwrite; }
    return Object.assign({}, b, { args, result: smp.response.result, real: true });
  });

  const btnGrid = $('#api-btns');
  const termIn = $('#term-in');
  const termOut = $('#term-out');
  const termCmd = $('#term-cmd');
  const termMs = $('#term-ms');
  let client = 'curl';
  let current = 0;
  let typingRun = 0;
  let autoTimer = 0;
  let userTouched = false;

  function hlJSON(s) {
    return esc(s).replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi, (m, str, colon, kw, num) => {
      if (str) return colon ? `<span class="tok-p">${str}</span>${colon}` : `<span class="tok-s">${str}</span>`;
      if (kw) return `<span class="tok-n">${kw}</span>`;
      return `<span class="tok-n">${num}</span>`;
    });
  }
  function hlShell(s) {
    return esc(s)
      .replace(/(&#39;|')(\{.*?\})(&#39;|')/g, (m, a, body, b) => `${a}${hlJSON(body.replace(/&quot;/g, '"'))}${b}`)
      .replace(/^(curl|kadrctl)\b/gm, '<span class="tok-k">$1</span>')
      .replace(/(\s)(--?[a-zA-Z_]+)/g, '$1<span class="tok-p">$2</span>')
      .replace(/(https?:\/\/[^\s\\]+)/g, '<span class="tok-f">$1</span>')
      .replace(/(\$[A-Z_]+)/g, '<span class="tok-n">$1</span>');
  }
  function requestText(b) {
    const json = JSON.stringify(b.args);
    if (client === 'curl') {
      return `curl -X POST http://127.0.0.1:7777/api/v1/commands/${b.cmd} \\\n  -H "Authorization: Bearer $KADR_TOKEN" \\\n  -d '${json}'`;
    }
    if (client === 'cli') {
      const flags = Object.entries(b.args).map(([k, v]) => {
        if (v === true) return `--${k}`;
        if (/_us$/.test(k) && typeof v === 'number' && v % 1000 === 0) return `--${k} ${v / 1e6}s`;
        if (typeof v === 'string') return `--${k} ${/^[\w.:#\/-]+$/.test(v) ? v : `"${v.replace(/"/g, '\\"')}"`}`;
        return `--${k} '${JSON.stringify(v)}'`;
      });
      return `kadrctl run ${b.cmd} ${flags.join(' ')}`;
    }
    return `${b.cmd.replace(/\./g, '_')}(${JSON.stringify(b.args, null, 2)})`;
  }
  function responseText(b) {
    if (client === 'curl') return JSON.stringify({ ok: true, result: b.result }, null, 2);
    return JSON.stringify(b.result, null, 2);
  }
  function hlRequest(text) {
    if (client === 'mcp') {
      const m = text.match(/^([a-z_]+)\(([\s\S]*)\)$/);
      if (m) return `<span class="tok-c">${STR.mcpComment}</span>\n<span class="tok-f">${m[1]}</span>(${hlJSON(m[2])})`;
    }
    return hlShell(text);
  }
  async function render(idx, animate = true) {
    current = idx;
    const run = ++typingRun;
    const b = BUTTONS[idx];
    $$('.api-btn', btnGrid).forEach((el, i) => el.setAttribute('aria-pressed', String(i === idx)));
    termCmd.textContent = client === 'mcp' ? b.cmd.replace(/\./g, '_') : b.cmd;
    const req = requestText(b);
    termOut.innerHTML = '';
    termMs.textContent = '';
    if (!animate || reduce) {
      termIn.innerHTML = hlRequest(req);
    } else {
      termIn.parentElement.classList.add('typing');
      for (let i = 0; i <= req.length; i += 3) {
        if (run !== typingRun) return;
        termIn.innerHTML = hlRequest(req.slice(0, i)) + '<span class="caret"></span>';
        await sleep(14);
      }
      termIn.innerHTML = hlRequest(req);
      await sleep(260);
      if (run !== typingRun) return;
    }
    termMs.textContent = b.real ? STR.real : '200 OK';
    const res = responseText(b);
    if (!animate || reduce) { termOut.innerHTML = hlJSON(res); return; }
    const lines = res.split('\n');
    for (let i = 1; i <= lines.length; i++) {
      if (run !== typingRun) return;
      termOut.innerHTML = hlJSON(lines.slice(0, i).join('\n'));
      await sleep(18);
    }
  }
  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (userTouched || reduce) return;
    autoTimer = setTimeout(() => { render((current + 1) % BUTTONS.length); scheduleAuto(); }, 6500);
  }
  if (btnGrid) {
    BUTTONS.forEach((b, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'api-btn';
      el.setAttribute('aria-pressed', 'false');
      const label = STR.api[b.label] || b.label;
      el.setAttribute('aria-label', STR.show(label, b.cmd));
      el.innerHTML = `<svg aria-hidden="true"><use href="#${b.icon}"/></svg><span>${esc(label)}</span>${b.key ? `<kbd aria-hidden="true">${esc(b.key)}</kbd>` : ''}`;
      el.addEventListener('click', () => { userTouched = true; clearTimeout(autoTimer); render(i); });
      btnGrid.appendChild(el);
    });
    const tabs = $$('.term-tabs [role="tab"]');
    const selectTab = (t, focus) => {
      tabs.forEach((x) => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; });
      client = t.dataset.client;
      if (focus) t.focus();
      render(current, false);
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => { userTouched = true; clearTimeout(autoTimer); selectTab(t); });
      t.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { e.preventDefault(); userTouched = true; selectTab(tabs[(i + d + tabs.length) % tabs.length], true); }
      });
    });
    let apiStarted = false;
    whenVisible($('#term'), () => {
      if (!apiStarted) { apiStarted = true; render(0); }
      scheduleAuto();
    }, () => clearTimeout(autoTimer));
  }

  /* ================================================================ filters compare */
  const FILTERS = DATA.filters || [];
  const compare = $('#compare');
  if (compare) {
    const range = $('#compare-range');
    const set = () => compare.style.setProperty('--pos', `${range.value}%`);
    range.addEventListener('input', set);
    set();
    const chips = $('#filter-chips');
    const img = $('#compare-img');
    const tag = $('#compare-tag');
    const choose = (f, btn) => {
      img.src = asset(f.file); img.alt = STR.withFilter(f.name);
      tag.textContent = f.name;
      $$('button', chips).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    };
    FILTERS.forEach((f, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = f.name; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => choose(f, b));
      chips.appendChild(b);
      if (i === 0) choose(f, b);
    });
    // gentle hint animation once
    if (!reduce) whenVisible(compare, () => {
      if (compare.dataset.hinted) return;
      compare.dataset.hinted = '1';
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / 1600);
        range.value = 52 + Math.sin(p * Math.PI * 2) * 16 * (1 - p);
        set();
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ================================================================ text effects strip */
  const strip = $('#textfx-strip');
  if (strip && DATA.textfx && DATA.textfx.length) {
    const track = document.createElement('div');
    track.className = 'textfx-track';
    const items = DATA.textfx.concat(DATA.textfx);
    track.innerHTML = items.map((t, i) => `<figure${i >= DATA.textfx.length ? ' aria-hidden="true"' : ''}><img src="${asset(t.file)}" alt="${i >= DATA.textfx.length ? '' : esc(STR.wordArt(t.name))}" loading="lazy" width="480" height="270"><figcaption>${esc(t.id)}</figcaption></figure>`).join('');
    strip.appendChild(track);
  } else if (strip) strip.remove();

  /* ================================================================ transitions label sync */
  const reelVideo = $('.card-reel video');
  const reelLabel = $('#reel-label');
  if (reelVideo && reelLabel && DATA.transitions && DATA.transitions.length) {
    let last = '';
    const b = reelLabel.querySelector('b');
    b.textContent = DATA.transitions[0].id;
    reelVideo.addEventListener('timeupdate', () => {
      const t = reelVideo.currentTime;
      let cur = DATA.transitions[0];
      for (const tr of DATA.transitions) if (t >= tr.start_s - 0.6) cur = tr;
      if (t < DATA.transitions[0].start_s - 0.6) cur = DATA.transitions[DATA.transitions.length - 1];
      if (cur.id !== last) {
        last = cur.id;
        b.textContent = cur.id;
        reelLabel.classList.remove('swap'); void reelLabel.offsetWidth; reelLabel.classList.add('swap');
      }
    });
  }

  /* ================================================================ speed curves */
  const spPath = $('#sp-curve');
  const spName = $('#sp-name');
  if (spPath) {
    const W = 280, X0 = 10, MID = 60;
    const curves = {
      montage: [[0, 1], [0.2, 3], [0.4, 0.5], [0.6, 3], [0.8, 0.5], [1, 2]],
      hero: [[0, 1], [0.35, 1.2], [0.5, 0.15], [0.65, 1.2], [1, 1]],
      bullet: [[0, 2], [0.3, 2], [0.45, 0.1], [0.75, 0.1], [1, 2]],
      jump_cut: [[0, 1], [0.4, 1], [0.5, 4], [0.6, 1], [1, 1]],
      flash_in: [[0, 5], [0.3, 1], [1, 1]],
      flash_out: [[0, 1], [0.7, 1], [1, 5]],
    };
    const toY = (v) => MID - Math.log2(v) * 16;
    const path = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(X0 + x * W).toFixed(1)} ${toY(y).toFixed(1)}`).join(' ');
    const names = Object.keys(curves);
    let i = 0;
    const next = () => { const n = names[i++ % names.length]; spPath.setAttribute('d', path(curves[n])); spName.textContent = n; };
    next();
    let timer = 0;
    if (!reduce) whenVisible(spPath, () => { clearInterval(timer); timer = setInterval(next, 2200); }, () => clearInterval(timer));
  }

  /* ================================================================ captions */
  const capVideo = $('#captions-video');
  const soundBtn = $('#captions-sound');
  if (capVideo && soundBtn) {
    capVideo.dataset.manual = '';
    soundBtn.addEventListener('click', () => {
      loadVideo(capVideo);
      const on = capVideo.muted;
      capVideo.muted = !on;
      if (on) { capVideo.currentTime = 0; capVideo.play().catch(() => {}); }
      soundBtn.setAttribute('aria-pressed', String(on));
      soundBtn.innerHTML = `<svg aria-hidden="true"><use href="#${on ? 'i-volume' : 'i-mute'}"/></svg><span>${on ? STR.soundOn : STR.soundOff}</span>`;
    });
    const words = DATA.captions && DATA.captions.words;
    const box = $('#transcript-words');
    if (words && words.length && box) {
      box.innerHTML = words.map((w, i) => `<span class="w" data-i="${i}">${esc(w.text)}</span>`).join(' ');
      const spans = $$('.w', box);
      let last = -2;
      const sync = () => {
        const t = capVideo.currentTime;
        let idx = -1;
        for (let i = 0; i < words.length; i++) if (t >= words[i].start) idx = i;
        if (idx !== last) {
          last = idx;
          spans.forEach((s, i) => { s.classList.toggle('past', i < idx); s.classList.toggle('now', i === idx && t <= words[i].end + 0.25); });
        }
        if (!capVideo.paused) requestAnimationFrame(sync);
      };
      capVideo.addEventListener('play', () => requestAnimationFrame(sync));
      capVideo.addEventListener('seeked', sync);
    }
  }

  /* ================================================================ beat canvas */
  function setupCanvas(cv) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  function rand(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

  const beat = $('#beat-canvas');
  if (beat) {
    const BPM = 124, SPB = 60 / BPM;
    const rnd = rand(7);
    const noise = Array.from({ length: 997 }, () => rnd());
    let geo, raf = 0, t0 = performance.now();
    const draw = (now) => {
      raf = 0;
      const { ctx, w, h } = geo;
      ctx.clearRect(0, 0, w, h);
      const pxPerSec = 150;
      const t = reduce ? 3 : (now - t0) / 1000;
      const mid = h * 0.44;
      const headX = w * 0.32;
      // waveform bars: transients on every beat, accents on the bar
      const barW = 3, gap = 2, step = barW + gap;
      const first = Math.floor((t * pxPerSec - headX) / step);
      for (let k = first; ; k++) {
        const x = k * step - (t * pxPerSec - headX);
        if (x > w) break;
        if (x < -step) continue;
        const bt = (k * step) / pxPerSec;
        const ph = (bt % SPB) / SPB;
        const accent = Math.floor(bt / SPB) % 4 === 0 ? 1 : 0.72;
        const n = noise[((k % noise.length) + noise.length) % noise.length];
        const a = 0.12 + (0.62 * Math.exp(-ph * 6) * accent + 0.16 * Math.exp(-((ph - 0.5) ** 2) * 60)) * (0.7 + n * 0.3) + n * 0.08;
        const bh = Math.min(0.95, a) * h * 0.55;
        ctx.fillStyle = x < headX ? 'rgba(109,140,240,0.9)' : 'rgba(109,140,240,0.38)';
        ctx.fillRect(x, mid - bh / 2, barW, bh);
      }
      // beat markers
      const secStart = t - headX / pxPerSec;
      const firstBeat = Math.ceil(secStart / SPB);
      for (let b = firstBeat; ; b++) {
        const bt = b * SPB;
        const x = headX + (bt - t) * pxPerSec;
        if (x > w) break;
        const strong = b % 4 === 0;
        ctx.fillStyle = strong ? 'rgba(255,61,139,0.95)' : 'rgba(255,61,139,0.45)';
        ctx.fillRect(x - 0.75, 28, 1.5, h - 70);
        ctx.beginPath(); ctx.moveTo(x - 5, 22); ctx.lineTo(x + 5, 22); ctx.lineTo(x, 30); ctx.closePath(); ctx.fill();
      }
      // clips snapped to beats (bottom row)
      const clipY = h - 34, clipH = 22;
      const colors = ['#1e5a63', '#3b2a6b', '#5a2340', '#1e5a63', '#2f5f3a'];
      const edges = ['#2bb8c4', '#7b61ff', '#ff3d8b', '#2bb8c4', '#6fd18a'];
      for (let b = Math.floor(secStart / (SPB * 4)) - 1; ; b++) {
        const st = b * SPB * 4;
        const x = headX + (st - t) * pxPerSec;
        if (x > w) break;
        const cw = SPB * 4 * pxPerSec - 3;
        const ci = ((b % 5) + 5) % 5;
        ctx.fillStyle = colors[ci];
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 1, clipY, cw, clipH, 5) : ctx.rect(x + 1, clipY, cw, clipH); ctx.fill();
        ctx.strokeStyle = edges[ci]; ctx.lineWidth = 1; ctx.stroke();
      }
      // playhead
      ctx.fillStyle = '#fff';
      ctx.fillRect(headX - 0.75, 14, 1.5, h - 14);
      const pulse = 1 - ((t % SPB) / SPB);
      ctx.fillStyle = `rgba(255,61,139,${0.15 * pulse * pulse})`;
      ctx.fillRect(0, 0, w, h);
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };
    let visible = false;
    const start = () => { geo = setupCanvas(beat); if (!raf) raf = requestAnimationFrame(draw); };
    whenVisible(beat, () => { visible = true; start(); }, () => { visible = false; });
    addEventListener('resize', () => { if (visible) start(); }, { passive: true });
  }

  /* ================================================================ silence canvas */
  const sil = $('#silence-canvas');
  if (sil) {
    const rnd = rand(11);
    const N = 90;
    const amps = Array.from({ length: N }, (_, i) => {
      const silent = (i > 22 && i < 34) || (i > 58 && i < 70);
      return silent ? 0.03 + rnd() * 0.03 : 0.25 + rnd() * 0.7;
    });
    const silentIdx = (i) => (i > 22 && i < 34) || (i > 58 && i < 70);
    let geo, raf = 0, visible = false, t0 = 0;
    const draw = (now) => {
      raf = 0;
      const { ctx, w, h } = geo;
      ctx.clearRect(0, 0, w, h);
      const cycle = 5;
      const t = reduce ? 3.5 : ((now - t0) / 1000) % cycle;
      const k = t < 1.4 ? 0 : t < 2.6 ? (t - 1.4) / 1.2 : t < 4.2 ? 1 : 1 - (t - 4.2) / 0.8;
      const e = k * k * (3 - 2 * k);
      const slots = amps.map((a, i) => (silentIdx(i) ? 1 - e : 1));
      const total = slots.reduce((s, v) => s + v, 0);
      const unit = (w - 24) / total;
      let x = 12;
      amps.forEach((a, i) => {
        const sw = slots[i] * unit;
        if (sw > 0.3) {
          const bh = a * h * 0.55;
          const s = silentIdx(i);
          ctx.fillStyle = s ? `rgba(255,61,139,${0.8 * (1 - e) + 0.1})` : 'rgba(31,209,219,0.85)';
          ctx.fillRect(x + sw * 0.18, h / 2 - bh / 2, Math.max(0.5, sw * 0.64), Math.max(1.5, bh));
        }
        x += sw;
      });
      if (e < 0.5) {
        ctx.strokeStyle = 'rgba(255,61,139,0.5)'; ctx.setLineDash([3, 3]);
        [[23, 34], [59, 70]].forEach(([a, b]) => {
          let xa = 12; for (let i = 0; i < a; i++) xa += slots[i] * unit;
          let xb = xa; for (let i = a; i < b; i++) xb += slots[i] * unit;
          if (xb - xa > 4) ctx.strokeRect(xa, 12, xb - xa, h - 24);
        });
        ctx.setLineDash([]);
      }
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };
    whenVisible(sil, () => { visible = true; geo = setupCanvas(sil); t0 = performance.now(); if (!raf) raf = requestAnimationFrame(draw); }, () => { visible = false; });
  }
  // background-removal scan width
  $$('.vis-bg').forEach((el) => {
    const set = () => el.style.setProperty('--w', `${el.clientWidth}px`);
    set(); addEventListener('resize', set, { passive: true });
  });

  /* ================================================================ export progress */
  const xpFill = $('#xp-fill');
  if (xpFill) {
    const pct = $('#xp-pct'), frames = $('#xp-frames'), log = $('#xp-events');
    let raf = 0, visible = false, t0 = 0, lastPct = -1;
    const pushEvent = (html) => {
      const d = document.createElement('div');
      d.className = 'ev'; d.innerHTML = html;
      log.appendChild(d);
      while (log.children.length > 7) log.firstElementChild.remove();
    };
    const step = (now) => {
      raf = 0;
      const dur = 6500, hold = 2200;
      const t = (now - t0) % (dur + hold);
      const p = Math.min(1, t / dur);
      const e = 1 - Math.pow(1 - p, 1.6);
      xpFill.style.transform = `scaleX(${e.toFixed(4)})`;
      const v = Math.round(e * 100);
      pct.textContent = `${v}%`;
      frames.textContent = `${STR.frame} ${Math.round(e * 600)} / 600`;
      if (v !== lastPct && v % 12 === 0) {
        if (v === 0 && lastPct !== -1) log.innerHTML = '';
        pushEvent(v === 0 ? '{"type":"<b>export.started</b>","job_id":"exp_8b2d4f61"}' : `{"type":"<b>export.progress</b>","progress":${(v / 100).toFixed(2)}}`);
      }
      if (v === 100 && lastPct !== 100) pushEvent('{"type":"<b>export.done</b>","size_bytes":51873209}');
      lastPct = v;
      if (visible && !reduce) raf = requestAnimationFrame(step);
    };
    if (reduce) { xpFill.style.transform = 'scaleX(1)'; pct.textContent = '100%'; frames.textContent = `${STR.frame} 600 / 600`; }
    else whenVisible(xpFill, () => { visible = true; if (!t0) t0 = performance.now(); if (!raf) raf = requestAnimationFrame(step); }, () => { visible = false; });
  }

  /* ================================================================ SFX chips (WebAudio sketches) */
  let actx;
  function sfx(kind) {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const now = actx.currentTime;
    const out = actx.createGain(); out.gain.value = 0.35; out.connect(actx.destination);
    const noise = (dur) => {
      const b = actx.createBuffer(1, actx.sampleRate * dur, actx.sampleRate);
      const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const s = actx.createBufferSource(); s.buffer = b; return s;
    };
    if (kind === 'whoosh' || kind === 'riser') {
      const dur = kind === 'riser' ? 1.4 : 0.6;
      const n = noise(dur), f = actx.createBiquadFilter(), g = actx.createGain();
      f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(kind === 'riser' ? 300 : 2400, now);
      f.frequency.exponentialRampToValueAtTime(kind === 'riser' ? 6000 : 300, now + dur);
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(1, now + dur * (kind === 'riser' ? 0.9 : 0.35)); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      n.connect(f).connect(g).connect(out); n.start(now); n.stop(now + dur);
    } else {
      const o = actx.createOscillator(), g = actx.createGain();
      const conf = { pop: ['sine', 900, 180, 0.12], ding: ['triangle', 1320, 1318, 0.9], boom: ['sine', 120, 38, 1.1] }[kind];
      o.type = conf[0];
      o.frequency.setValueAtTime(conf[1], now); o.frequency.exponentialRampToValueAtTime(conf[2], now + conf[3]);
      g.gain.setValueAtTime(1, now); g.gain.exponentialRampToValueAtTime(0.0001, now + conf[3]);
      o.connect(g).connect(out); o.start(now); o.stop(now + conf[3]);
    }
  }
  $$('#sfx-chips button').forEach((b) => b.addEventListener('click', () => {
    try { sfx(b.dataset.sfx); } catch (e) { /* audio unavailable */ }
    b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 300);
  }));
})();
