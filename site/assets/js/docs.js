/* Kadr docs — sidebar drawer, copy buttons, code tabs, table-of-contents
   scroll-spy, grouped search over the guide, AI docs and commands, theme toggle,
   image zoom and the live changelog. Vanilla JS, no dependencies. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const html = document.documentElement;
  const ROOT = document.body.dataset.root || './';
  const LANG = html.lang === 'uk' ? 'uk' : 'en';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };
  const L = {
    en: {
      copy: 'Copy', copied: 'Copied', pressCtrlC: 'Press Ctrl+C', copyPrompt: 'Copy prompt', promptLabel: 'Prompt for Claude',
      groups: { guide: 'Guide', ai: 'AI docs', cmd: 'Commands' }, suggested: 'Suggested',
      empty: (q) => `No results for “${esc(q)}”. Try a command name like <code>split</code> or a task like “captions”.`,
      loadError: 'The search index could not be loaded.',
      count: (n) => `${n} command${n === 1 ? '' : 's'}`,
      rel: { loading: 'Loading releases from GitHub…', none: 'No public release yet — the notes below describe the first beta.', live: (u) => `Live from <a href="${u}">GitHub Releases</a>.`, offline: (u) => `Couldn’t reach GitHub right now — showing the notes bundled with this site. See all releases on <a href="${u}">GitHub</a>.`, pre: 'Pre-release', stable: 'Stable', noNotes: 'No notes.', view: 'View on GitHub' },
      themeLight: 'Light theme', themeDark: 'Dark theme',
    },
    uk: {
      copy: 'Копіювати', copied: 'Скопійовано', pressCtrlC: 'Натисніть Ctrl+C', copyPrompt: 'Копіювати запит', promptLabel: 'Запит для Claude',
      groups: { guide: 'Посібник', ai: 'Для ШІ', cmd: 'Команди' }, suggested: 'Рекомендовано',
      empty: (q) => `Нічого не знайдено за запитом «${esc(q)}». Спробуйте назву команди, як-от <code>split</code>, або задачу, як-от «субтитри».`,
      loadError: 'Не вдалося завантажити пошуковий індекс.',
      count: (n) => { const a = n % 10, b = n % 100; return `${n} ${a === 1 && b !== 11 ? 'команда' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'команди' : 'команд'}`; },
      rel: { loading: 'Завантажуємо випуски з GitHub…', none: 'Публічних випусків ще немає — нижче нотатки до першої бети.', live: (u) => `Наживо з <a href="${u}">GitHub Releases</a>.`, offline: (u) => `Не вдалося зв’язатися з GitHub — показуємо нотатки, що вбудовані в сайт. Усі випуски — на <a href="${u}">GitHub</a>.`, pre: 'Попередній випуск', stable: 'Стабільний', noNotes: 'Без нотаток.', view: 'Переглянути на GitHub' },
      themeLight: 'Світла тема', themeDark: 'Темна тема',
    },
  }[LANG];

  /* ---------------------------------------------------------------- theme */
  const themeBtn = $('#theme-toggle');
  if (themeBtn) {
    const sync = () => themeBtn.setAttribute('aria-pressed', String(html.dataset.theme === 'light'));
    sync();
    themeBtn.addEventListener('click', () => {
      const next = html.dataset.theme === 'light' ? 'dark' : 'light';
      if (next === 'dark') delete html.dataset.theme; else html.dataset.theme = next;
      store.set('kadr-theme', next === 'dark' ? '' : next);
      sync();
    });
  }

  /* ---------------------------------------------------------------- sidebar drawer (mobile) */
  const side = $('#docs-side'), sideBtn = $('#side-toggle'), scrim = $('#side-scrim'), sideClose = $('#side-close');
  let lastFocus = null;
  const openSide = () => {
    if (!side) return;
    lastFocus = document.activeElement;
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('on'));
    side.classList.add('open');
    sideBtn && sideBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    const cur = side.querySelector('[aria-current="page"]');
    if (cur) cur.scrollIntoView({ block: 'center' });
    (sideClose || side.querySelector('a')).focus({ preventScroll: true });
  };
  const closeSide = () => {
    if (!side || !side.classList.contains('open')) return;
    side.classList.remove('open');
    scrim.classList.remove('on');
    setTimeout(() => { scrim.hidden = true; }, 300);
    sideBtn && sideBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  };
  if (side && sideBtn) {
    sideBtn.addEventListener('click', openSide);
    scrim && scrim.addEventListener('click', closeSide);
    sideClose && sideClose.addEventListener('click', closeSide);
    addEventListener('resize', () => { if (innerWidth > 960) closeSide(); }, { passive: true });
  }
  // keep the current page visible in a long desktop sidebar
  const cur = side && side.querySelector('[aria-current="page"]');
  if (cur && innerWidth > 960 && side.scrollHeight > side.clientHeight) {
    const r = cur.getBoundingClientRect(), sr = side.getBoundingClientRect();
    if (r.bottom > sr.bottom - 40) side.scrollTop = r.top - sr.top - sr.height / 3;
  }

  /* ---------------------------------------------------------------- copy buttons */
  async function copy(text, btn, label) {
    const span = btn.querySelector('span') || btn;
    try {
      await navigator.clipboard.writeText(text);
      span.textContent = L.copied; btn.classList.add('done');
    } catch (e) {
      span.textContent = L.pressCtrlC;
    }
    setTimeout(() => { span.textContent = label; btn.classList.remove('done'); }, 1600);
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.copy-btn');
    if (b) { const pre = b.parentElement.querySelector('pre'); if (pre) copy(pre.innerText.replace(/\n$/, ''), b, L.copy); }
    const p = e.target.closest('.copy-prompt');
    if (p) { const q = p.parentElement.cloneNode(true); q.querySelectorAll('.copy-prompt, .prompt-label').forEach((x) => x.remove()); copy(q.textContent.replace(/\s+/g, ' ').trim(), p, L.copyPrompt); }
  });
  $$('blockquote.prompt').forEach((q) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'copy-prompt'; b.textContent = L.copyPrompt;
    const l = document.createElement('span');
    l.className = 'prompt-label'; l.textContent = L.promptLabel;
    q.append(l, b);
  });

  /* ---------------------------------------------------------------- code tabs (choice shared across the page and remembered) */
  const groups = $$('.code-tabs');
  const selectTab = (group, key, focus) => {
    const tabs = $$('[role="tab"]', group);
    const t = tabs.find((x) => x.dataset.tab === key);
    if (!t) return false;
    tabs.forEach((x) => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; });
    $$('.ct-panel', group).forEach((p) => p.classList.toggle('on', p.dataset.tab === key));
    if (focus) t.focus();
    return true;
  };
  if (groups.length) {
    const saved = store.get('kadr-code-tab');
    if (saved) groups.forEach((g) => selectTab(g, saved));
    groups.forEach((g) => {
      const tabs = $$('[role="tab"]', g);
      tabs.forEach((t, i) => {
        t.addEventListener('click', () => {
          const top = t.getBoundingClientRect().top;
          const key = t.dataset.tab;
          groups.forEach((x) => selectTab(x, key));
          store.set('kadr-code-tab', key);
          // keep the clicked tab where it was (other blocks may change height)
          window.scrollBy(0, t.getBoundingClientRect().top - top);
        });
        t.addEventListener('keydown', (e) => {
          const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          const n = tabs[(i + d + tabs.length) % tabs.length];
          groups.forEach((x) => selectTab(x, n.dataset.tab));
          n.focus();
          store.set('kadr-code-tab', n.dataset.tab);
        });
      });
    });
  }

  /* ---------------------------------------------------------------- toc scroll-spy */
  const tocLinks = $$('.docs-toc a[href^="#"]:not(.toc-top)');
  if (tocLinks.length) {
    const map = new Map(tocLinks.map((a) => [decodeURIComponent(a.getAttribute('href').slice(1)), a]));
    const targets = [...map.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    const toc = $('.docs-toc');
    let active = null, ticking = false;
    const update = () => {
      ticking = false;
      document.body.classList.toggle('scrolled', scrollY > 600);
      let curT = targets[0];
      for (const t of targets) { if (t.getBoundingClientRect().top <= 150) curT = t; else break; }
      // at the very bottom, light up the last heading
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) curT = targets[targets.length - 1];
      const a = curT && map.get(curT.id);
      if (a && a !== active) {
        if (active) active.classList.remove('active');
        active = a; a.classList.add('active');
        const r = a.getBoundingClientRect(), tr = toc.getBoundingClientRect();
        if (r.top < tr.top + 30 || r.bottom > tr.bottom - 30) toc.scrollTop += r.top - tr.top - tr.height / 2;
      }
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------------------------------------------------------------- reference filter */
  const filter = $('#cmd-filter');
  if (filter) {
    const rows = $$('#all-cmds tbody tr');
    const count = $('#cmd-filter-count');
    filter.addEventListener('input', () => {
      const q = filter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      let n = 0;
      rows.forEach((r) => { const ok = q.every((t) => r.dataset.q.includes(t)); r.hidden = !ok; if (ok) n++; });
      count.textContent = L.count(n);
    });
  }

  /* ---------------------------------------------------------------- image zoom */
  document.addEventListener('click', (e) => {
    const img = e.target.closest('.prose figure img, .prose > p > img');
    if (!img || img.closest('a')) return;
    const z = document.createElement('div');
    z.className = 'zoom';
    z.setAttribute('role', 'dialog');
    z.setAttribute('aria-label', img.alt || 'Image');
    z.innerHTML = `<img src="${esc(img.currentSrc || img.src)}" alt="${esc(img.alt)}">`;
    const close = () => { z.remove(); removeEventListener('keydown', onKey); };
    const onKey = (ev) => { if (ev.key === 'Escape') close(); };
    z.addEventListener('click', close);
    addEventListener('keydown', onKey);
    document.body.appendChild(z);
  });

  /* ---------------------------------------------------------------- search */
  const modal = $('#search-modal'), input = $('#search-input'), list = $('#search-results');
  let index = null, flat = [], sel = 0, lastSearchFocus = null;
  async function loadIndex() {
    if (index) return index;
    const r = await fetch(`${ROOT}assets/search/${LANG}.json`);
    if (!r.ok) throw new Error(String(r.status));
    index = await r.json();
    return index;
  }
  const MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g'); // combining accents
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(MARKS, '').replace(/ё/g, 'е').replace(/ґ/g, 'г');
  function score(q, terms, f) {
    const name = norm(f.n), title = norm(f.t), desc = norm(f.d), extra = norm(f.x);
    let s = 0;
    if (name && name === q) s += 140;
    if (title === q) s += 120;
    if (name && name.startsWith(q)) s += 60;
    if (name && name.includes(q)) s += 35;
    if (title.startsWith(q)) s += 45;
    if (title.includes(q)) s += 20;
    for (const t of terms) {
      let hit = false;
      if (name && name.split(/[._]/).some((p) => p.startsWith(t))) { s += 22; hit = true; }
      if (title.split(/[\s,.:;()«»“”"'/-]+/).some((p) => p.startsWith(t))) { s += 18; hit = true; }
      if (f.c && norm(f.c).includes(t)) { s += 8; hit = true; }
      if (desc.includes(t)) { s += 6; hit = true; }
      if (extra.includes(t)) { s += 3; hit = true; }
      if (!hit) return 0;
    }
    return s - Math.min(12, (name || title).length * 0.2);
  }
  function search(q) {
    q = norm(q.trim());
    if (!index) return [];
    const res = { guide: [], ai: [], cmd: [] };
    if (!q) {
      index.pages.filter((p) => p.k === 'guide' || p.k === 'ai').slice(0, 40).forEach((p) => {
        const bucket = res[p.k];
        if (bucket.length < 4 && !/\/index\.html$|^index\.html$|^uk\/index\.html$/.test(p.u)) bucket.push({ s: 1, kind: p.k, title: p.t, desc: p.d, url: p.u });
      });
      return [{ key: 'suggested', label: L.suggested, items: [...res.guide, ...res.ai].slice(0, 8) }];
    }
    const terms = q.split(/\s+/).filter(Boolean);
    index.cmds.forEach((c) => { const s = score(q, terms, c); if (s) res.cmd.push({ s: s + 4, kind: 'cmd', title: c.n, sub: c.t, where: c.c, desc: c.d, url: c.u }); });
    index.pages.forEach((p) => {
      const bucket = res[p.k] || res.guide;
      const s = score(q, terms, { t: p.t, d: p.d });
      if (s) bucket.push({ s: s + 10, kind: p.k, title: p.t, desc: p.d, url: p.u });
      (p.s || []).forEach((h) => {
        const hs = score(q, terms, { t: h.t, d: '', x: h.x });
        if (hs) bucket.push({ s: hs - 2, kind: p.k, title: h.t || p.t, where: h.t ? p.t : '', desc: snippet(h.x, terms) || p.d, url: h.id ? `${p.u}#${h.id}` : p.u });
      });
    });
    const out = [];
    for (const key of ['guide', 'ai', 'cmd']) {
      const items = res[key].sort((a, b) => b.s - a.s);
      const seen = new Set();
      const uniq = items.filter((x) => (seen.has(x.url) ? false : seen.add(x.url)));
      if (uniq.length) out.push({ key, label: L.groups[key], best: uniq[0].s, items: uniq.slice(0, key === 'cmd' ? 8 : 6) });
    }
    return out.sort((a, b) => b.best - a.best);
  }
  function snippet(text, terms) {
    if (!text) return '';
    const n = norm(text);
    let i = -1;
    for (const t of terms) { i = n.indexOf(t); if (i >= 0) break; }
    if (i < 0) return text.slice(0, 140);
    const start = Math.max(0, i - 40);
    return (start ? '…' : '') + text.slice(start, start + 150) + (start + 150 < text.length ? '…' : '');
  }
  function hl(text, q) {
    const t = esc(text);
    const terms = q.trim().split(/\s+/).filter((x) => x.length > 1).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!terms.length) return t;
    return t.replace(new RegExp(`(${terms.join('|')})`, 'ig'), '<mark>$1</mark>');
  }
  function render() {
    const q = input.value;
    const groupsR = search(q);
    flat = [];
    sel = 0;
    if (!groupsR.length || !groupsR.some((g) => g.items.length)) { list.innerHTML = `<p class="search-empty">${L.empty(q)}</p>`; input.removeAttribute('aria-activedescendant'); return; }
    let i = 0;
    list.innerHTML = groupsR.map((g) => `<div class="sr-section" role="group" aria-label="${esc(g.label)}"><p class="sr-group g-${g.key}" aria-hidden="true">${esc(g.label)}</p>${g.items.map((r) => {
      const id = `sr-${i}`;
      flat.push(r);
      const title = r.kind === 'cmd' ? `<code>${hl(r.title, q)}</code> <span class="muted">${esc(r.sub || '')}</span>` : hl(r.title, q);
      return `<div class="sr-item" role="option" id="${id}" aria-selected="${i++ === 0}"><a href="${ROOT}${r.url}"><span class="sr-title">${title}</span>${r.where ? `<span class="sr-where">${esc(r.where)}</span>` : ''}<span class="sr-desc">${hl(r.desc || '', q)}</span></a></div>`;
    }).join('')}</div>`).join('');
    input.setAttribute('aria-activedescendant', 'sr-0');
  }
  function move(d) {
    const items = $$('.sr-item', list);
    if (!items.length) return;
    items[sel].setAttribute('aria-selected', 'false');
    sel = (sel + d + items.length) % items.length;
    items[sel].setAttribute('aria-selected', 'true');
    items[sel].scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', items[sel].id);
  }
  function openSearch() {
    if (!modal) return;
    closeSide();
    lastSearchFocus = document.activeElement;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    input.value = '';
    input.focus();
    loadIndex().then(render).catch(() => { list.innerHTML = `<p class="search-empty">${L.loadError}</p>`; });
  }
  function closeSearch() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    if (lastSearchFocus) lastSearchFocus.focus({ preventScroll: true });
  }
  if (modal) {
    $$('[data-search-open]').forEach((b) => b.addEventListener('click', openSearch));
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { const a = $$('.sr-item a', list)[sel]; if (a) { e.preventDefault(); closeSearch(); location.href = a.href; } }
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) closeSearch(); });
    modal.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); input.focus(); } });
    list.addEventListener('click', (e) => { if (e.target.closest('a')) closeSearch(); });
  }
  document.addEventListener('keydown', (e) => {
    const a = document.activeElement;
    const typing = a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
    if (e.key === 'Escape') { closeSearch(); closeSide(); }
    else if (modal && ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) { e.preventDefault(); openSearch(); }
  });

  /* ---------------------------------------------------------------- changelog from GitHub releases */
  const relBox = $('#releases');
  if (relBox && window.KadrRelease) {
    const md = (src) => {
      const inline = (s) => esc(s)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
      // paragraphs join soft-wrapped lines; "> " lines form a quote; indented lines continue a list item
      const out = [];
      let para = [], list = null, quote = [];
      const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
      const flushList = () => { if (list) { out.push(`<ul>${list.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`); list = null; } };
      const flushQuote = () => { if (quote.length) { out.push(`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`); quote = []; } };
      const flushAll = () => { flushPara(); flushList(); flushQuote(); };
      src.replace(new RegExp(String.fromCharCode(13), 'g'), '').split(String.fromCharCode(10)).forEach((line) => {
        const h = line.match(/^(#{1,6})\s+(.*)$/);
        const li = line.match(/^\s*[-*+]\s+(.*)$/);
        const q = line.match(/^\s*>\s?(.*)$/);
        if (!line.trim()) { flushAll(); return; }
        if (h) { flushAll(); const lvl = Math.min(4, Math.max(3, h[1].length + 1)); out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`); return; }
        if (q) { flushPara(); flushList(); quote.push(q[1]); return; }
        flushQuote();
        if (li) { flushPara(); (list = list || []).push(li[1]); return; }
        if (list && /^\s+\S/.test(line)) { list[list.length - 1] += ` ${line.trim()}`; return; }
        if (list) flushList();
        para.push(line.trim());
      });
      flushAll();
      return out.join('');
    };
    const R = window.KadrRelease;
    const status = document.createElement('p');
    status.className = 'releases-status';
    status.textContent = L.rel.loading;
    relBox.before(status);
    R.list(20).then((rels) => {
      if (!rels.length) { status.textContent = L.rel.none; return; }
      status.innerHTML = L.rel.live(R.RELEASES_PAGE);
      relBox.innerHTML = rels.map((r) => {
        const v = R.versionOf(r);
        const assets = r.assets.filter((a) => /\.(exe|zip|dmg|txt)$/i.test(a.name)).map((a) => `<a href="${esc(a.url)}">${esc(a.name)} <small>${R.fmtSize(a.size)}</small></a>`).join('');
        return `<section class="release" id="v${esc(v.replace(/[^a-z0-9]+/gi, '-'))}"><h2>${esc(r.name || r.tag)} ${r.prerelease ? `<span class="badge badge-beta">${L.rel.pre}</span>` : `<span class="badge badge-live">${L.rel.stable}</span>`}<span class="release-date">${esc(R.fmtDate(r.date))}</span></h2><div class="release-body" lang="en">${md(r.body || '') || `<p class="muted">${L.rel.noNotes}</p>`}</div>${assets ? `<div class="release-assets">${assets}</div>` : ''}<p><a href="${esc(r.url)}">${L.rel.view}</a></p></section>`;
      }).join('');
    }).catch((err) => {
      status.innerHTML = err && err.status === 404 ? L.rel.none : L.rel.offline(R.RELEASES_PAGE);
    });
  }
})();
