/* Kadr site — shared behaviour on every page: navigation, language memory and
   the Ukrainian suggestion banner, scroll reveal, magnetic buttons, counters,
   card spotlight/tilt and parallax. Vanilla JS; animations only touch
   transform/opacity and stop for prefers-reduced-motion. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const html = document.documentElement;
  const lang = html.lang === 'uk' ? 'uk' : 'en';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage disabled */ } },
  };

  /* ---------------------------------------------------------------- nav */
  const nav = $('#nav');
  const burger = $('#nav-burger');
  if (nav && !nav.classList.contains('is-solid')) {
    const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  if (nav && burger) {
    const close = () => { nav.classList.remove('menu-open'); burger.setAttribute('aria-expanded', 'false'); };
    burger.addEventListener('click', () => {
      const open = !nav.classList.contains('menu-open');
      nav.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', String(open));
    });
    $$('#nav-links a').forEach((a) => a.addEventListener('click', close));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.addEventListener('click', (e) => { if (nav.classList.contains('menu-open') && !nav.contains(e.target)) close(); });
  }

  /* ---------------------------------------------------------------- language: remember the explicit choice */
  $$('[data-set-lang]').forEach((a) => a.addEventListener('click', () => {
    const l = a.dataset.setLang;
    store.set('kadr-lang', l);
    store.set('kadr-lang-hint', 'done');
    const sw = a.closest('.lang-switch');
    if (sw && l !== lang) sw.classList.add('is-going'); // slide the thumb before the page changes
  }));

  /* gentle suggestion for Ukrainian browsers on English pages — never a redirect */
  (function suggest() {
    if (lang !== 'en' || store.get('kadr-lang') || store.get('kadr-lang-hint')) return;
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || '']).map((l) => String(l).toLowerCase());
    if (!langs.some((l) => l === 'uk' || l.startsWith('uk-') || l === 'ru-ua')) return;
    const target = html.getAttribute('data-alt-uk');
    if (!target) return;
    const box = document.createElement('div');
    box.className = 'lang-hint';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Українська версія');
    box.lang = 'uk';
    box.innerHTML = `<span class="lh-flag" aria-hidden="true"></span><p><b>Цей сайт є українською.</b> Перейти на українську версію?</p><a class="btn btn-primary btn-sm" href="${target.replace(/"/g, '&quot;')}" hreflang="uk">Українською</a><button class="lh-x" type="button" aria-label="Закрити — залишитися англійською"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
    const dismiss = () => { store.set('kadr-lang-hint', 'dismissed'); box.classList.remove('on'); setTimeout(() => box.remove(), 600); };
    box.querySelector('.lh-x').addEventListener('click', dismiss);
    box.querySelector('a').addEventListener('click', () => { store.set('kadr-lang', 'uk'); store.set('kadr-lang-hint', 'done'); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && box.isConnected) dismiss(); });
    setTimeout(() => { document.body.appendChild(box); requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('on'))); }, reduce ? 0 : 1600);
  })();

  /* ---------------------------------------------------------------- scroll reveal */
  const reveals = $$('.reveal, .divider');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }

  /* ---------------------------------------------------------------- animated counters */
  const counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window && !reduce) {
    const items = counters.map((el) => {
      const node = (function find(n) {
        for (const c of n.childNodes) {
          if (c.nodeType === 3 && /\d/.test(c.nodeValue)) return c;
          if (c.nodeType === 1) { const f = find(c); if (f) return f; }
        }
        return null;
      })(el);
      return { el, node, to: node ? parseInt(node.nodeValue.replace(/\D/g, ''), 10) : 0, text: node ? node.nodeValue : '' };
    }).filter((x) => x.node && x.to > 0);
    // stage 1: zero a counter just before it scrolls into view (renderers that never scroll keep the real value)
    const pre = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        pre.unobserve(e.target);
        const x = items.find((i) => i.el === e.target);
        if (x && !x.started) x.node.nodeValue = x.text.replace(/\d+/, '0');
      });
    }, { rootMargin: '0px 0px 25% 0px', threshold: 0 });
    items.forEach((x) => pre.observe(x.el));
    // stage 2: count up once it is clearly visible
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const x = items.find((i) => i.el === e.target);
        if (!x) return;
        x.started = true;
        const t0 = performance.now(), dur = 1300 + Math.min(900, x.to * 4);
        const step = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          const k = 1 - Math.pow(1 - p, 4);
          x.node.nodeValue = x.text.replace(/\d+/, String(Math.round(x.to * k)));
          if (p < 1) requestAnimationFrame(step);
          else x.el.classList.add('counted');
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.6 });
    items.forEach((x) => io.observe(x.el));
  }

  /* ---------------------------------------------------------------- pointer effects (desktop) */
  if (finePointer && !reduce) {
    // spotlight follows the pointer inside cards
    document.addEventListener('pointermove', (e) => {
      const c = e.target.closest && e.target.closest('.card, .hub-card, .quick, .cat-card');
      if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    }, { passive: true });

    // magnetic primary buttons: they lean towards the pointer (CSS `translate`, composited)
    $$('.btn-primary.btn-lg, [data-magnetic]').forEach((b) => {
      b.classList.add('is-magnetic');
      let raf = 0, tx = 0, ty = 0;
      const apply = () => { raf = 0; b.style.translate = `${tx.toFixed(1)}px ${ty.toFixed(1)}px`; };
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        tx = (e.clientX - (r.left + r.width / 2)) * 0.22;
        ty = (e.clientY - (r.top + r.height / 2)) * 0.32;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      b.addEventListener('pointerleave', () => { tx = 0; ty = 0; b.classList.remove('is-magnetic'); apply(); setTimeout(() => b.classList.add('is-magnetic'), 500); });
    });

    // gentle 3D tilt for big cards
    $$('.hub-card, [data-tilt]').forEach((c) => {
      let raf = 0, rx = 0, ry = 0;
      const apply = () => { raf = 0; c.style.setProperty('--rx', `${rx.toFixed(2)}deg`); c.style.setProperty('--ry', `${ry.toFixed(2)}deg`); };
      c.addEventListener('pointerenter', () => c.classList.add('is-tilting'));
      c.addEventListener('pointermove', (e) => {
        const r = c.getBoundingClientRect();
        ry = ((e.clientX - r.left) / r.width - 0.5) * 5;
        rx = -((e.clientY - r.top) / r.height - 0.5) * 4;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      c.addEventListener('pointerleave', () => { c.classList.remove('is-tilting'); rx = 0; ry = 0; apply(); });
    });
  }

  /* ---------------------------------------------------------------- parallax: [data-parallax="0.15"] */
  const para = $$('[data-parallax]');
  if (para.length && !reduce) {
    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = innerHeight;
      para.forEach((el) => {
        const r = el.parentElement.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const f = parseFloat(el.dataset.parallax) || 0.15;
        const off = (r.top + r.height / 2 - vh / 2) * -f;
        el.style.transform = `translate3d(0, ${off.toFixed(1)}px, 0)`;
      });
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update, { passive: true });
    update();
  }
})();
