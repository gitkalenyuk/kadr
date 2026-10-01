/* Kadr site — latest release from GitHub (pre-releases included).
   GET https://api.github.com/repos/gitkalenyuk/kadr/releases?per_page=N, newest
   non-draft release first. Falls back to the releases page ("Coming soon") when
   there is no release yet or the API is unreachable / rate limited.
   Windows installers are live; a macOS build lights up automatically once a
   Kadr-X.Y.Z-macos-universal.dmg (or .zip) asset is published. */
(() => {
  const REPO = 'gitkalenyuk/kadr';
  const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
  const INSTALLER = /^Kadr-Setup-(.+)-x64\.exe$/i;
  const PORTABLE = /^Kadr-(.+)-windows-x64-portable\.zip$/i;
  const MAC = /^Kadr-(.+)-macos-universal\.(dmg|zip)$/i;
  const TTL = 10 * 60 * 1000;
  const cache = {};
  const LANG = document.documentElement.lang === 'uk' ? 'uk' : 'en';
  const S = {
    en: {
      out: (v, beta) => `Kadr ${v} is out${beta ? ' — public beta' : ''}`, beta: 'Beta', latest: 'Latest', publicBeta: 'Public beta', stable: 'Stable',
      meta: (v, size) => `v${v} · ${size ? `${size} · ` : ''}Windows 10 & 11 · Free`,
      status: (v, inst) => ` Kadr ${v} for Windows 10 & 11 (x64). ${inst ? 'One installer, no admin rights needed.' : 'The installer is being uploaded — grab it from the release page.'}`,
      main: (v, inst) => (inst ? `Download Kadr ${v}` : `Kadr ${v} on GitHub`), portable: (s) => `Portable zip (${s})`, notes: 'Release notes',
      mac: (v) => `Download for macOS`, macReady: 'Universal app for Apple silicon and Intel Macs.', locale: 'en-GB',
    },
    uk: {
      out: (v, beta) => `Вийшов Kadr ${v}${beta ? ' — публічна бета' : ''}`, beta: 'Бета', latest: 'Новий', publicBeta: 'Публічна бета', stable: 'Стабільний',
      meta: (v, size) => `v${v} · ${size ? `${size} · ` : ''}Windows 10 і 11 · Безкоштовно`,
      status: (v, inst) => ` Kadr ${v} для Windows 10 і 11 (x64). ${inst ? 'Один інсталятор, права адміністратора не потрібні.' : 'Інсталятор ще завантажується — візьміть його на сторінці випуску.'}`,
      main: (v, inst) => (inst ? `Завантажити Kadr ${v}` : `Kadr ${v} на GitHub`), portable: (s) => `Portable-архів (${s})`, notes: 'Нотатки до випуску',
      mac: (v) => `Завантажити для macOS`, macReady: 'Універсальний застосунок для Mac на Apple silicon та Intel.', locale: 'uk-UA',
    },
  }[LANG];

  function slim(r) {
    return {
      tag: r.tag_name, name: r.name, prerelease: !!r.prerelease, draft: !!r.draft,
      date: r.published_at || r.created_at, url: r.html_url, body: r.body || '',
      assets: (r.assets || []).map((a) => ({ name: a.name, size: a.size, url: a.browser_download_url })),
    };
  }

  function list(n = 5) {
    if (cache[n]) return cache[n];
    const key = `kadr-releases-${n}`;
    try {
      const c = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (c && Date.now() - c.t < TTL) return (cache[n] = Promise.resolve(c.d));
    } catch (e) { /* storage disabled */ }
    const ctrl = 'AbortController' in window ? new AbortController() : null;
    const timer = ctrl && setTimeout(() => ctrl.abort(), 7000);
    cache[n] = fetch(`https://api.github.com/repos/${REPO}/releases?per_page=${n}`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl ? ctrl.signal : undefined,
    }).then((r) => {
      if (timer) clearTimeout(timer);
      if (!r.ok) { const e = new Error(`GitHub API ${r.status}`); e.status = r.status; throw e; }
      return r.json();
    }).then((d) => {
      const out = (Array.isArray(d) ? d : []).filter((r) => !r.draft).map(slim);
      try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: out })); } catch (e) { /* ignore */ }
      return out;
    });
    cache[n].catch(() => { delete cache[n]; });
    return cache[n];
  }

  function installerOf(rel) { return rel && rel.assets.find((a) => INSTALLER.test(a.name)); }
  function portableOf(rel) { return rel && rel.assets.find((a) => PORTABLE.test(a.name)); }
  function macOf(rel) { return rel && rel.assets.find((a) => MAC.test(a.name)); }
  function versionOf(rel) {
    const a = installerOf(rel);
    const m = a && a.name.match(INSTALLER);
    return m ? m[1] : (rel.tag || '').replace(/^v/i, '');
  }
  function fmtSize(b) { return b >= 1e9 ? `${(b / 1e9).toFixed(2)} GB` : `${(b / 1048576).toFixed(1)} MB`; }
  function fmtDate(s) {
    try { return new Date(s).toLocaleDateString(S.locale, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return s; }
  }
  async function latest() {
    const rels = await list(5);
    return rels.find((r) => installerOf(r)) || rels[0] || null;
  }

  window.KadrRelease = { list, latest, installerOf, portableOf, macOf, versionOf, fmtSize, fmtDate, RELEASES_PAGE };

  // ---- landing page wiring (no-op on pages without these elements)
  const $ = (s) => document.querySelector(s);
  const status = $('#dl-status');
  const pillText = $('[data-release-text]');
  const meta = $('[data-release-meta]');
  if (!status && !pillText) return;

  function setText(el, t) { if (el) el.textContent = t; }

  latest().then((rel) => {
    if (!rel) throw new Error('no release yet');
    const v = versionOf(rel);
    const inst = installerOf(rel);
    const port = portableOf(rel);
    const beta = rel.prerelease;
    const badgeCls = beta ? 'badge badge-beta' : 'badge badge-live';
    document.querySelectorAll('[data-download-link]').forEach((a) => {
      a.href = inst ? inst.url : rel.url;
      if (inst) a.setAttribute('download', '');
    });
    setText(pillText, S.out(v, beta));
    const pillBadge = document.querySelector('[data-release-pill] .badge');
    if (pillBadge) { pillBadge.className = badgeCls; pillBadge.innerHTML = `<span class="dot"></span>${beta ? S.beta : S.latest}`; }
    setText(meta, S.meta(v, inst ? fmtSize(inst.size) : ''));
    if (status) {
      status.innerHTML = '';
      const b = document.createElement('span');
      b.className = badgeCls; b.innerHTML = `<span class="dot"></span>${beta ? S.publicBeta : S.stable}`;
      status.append(b, document.createTextNode(S.status(v, !!inst)));
    }
    setText($('#dl-main-label'), S.main(v, !!inst));
    const dm = $('#dl-meta');
    if (dm) {
      setText($('#dl-version'), v);
      setText($('#dl-date'), fmtDate(rel.date));
      setText($('#dl-size'), inst ? fmtSize(inst.size) : '—');
      dm.hidden = false;
    }
    // macOS lights up as soon as the build is published
    const mac = macOf(rel);
    const macCard = $('#dl-mac');
    if (mac && macCard) {
      macCard.classList.add('is-ready');
      const a = macCard.querySelector('a, [data-mac-link]');
      if (a) { a.href = mac.url; a.removeAttribute('aria-disabled'); a.setAttribute('download', ''); }
      setText(macCard.querySelector('[data-mac-label]'), S.mac(v));
      setText(macCard.querySelector('[data-mac-note]'), S.macReady);
      const badge = macCard.querySelector('.badge');
      if (badge) { badge.className = badgeCls; badge.innerHTML = `<span class="dot"></span>${fmtSize(mac.size)}`; }
    }
    const links = $('#dl-links');
    if (links) {
      const extra = [];
      if (port) extra.push(`<a href="${port.url}">${S.portable(fmtSize(port.size))}</a>`);
      const sums = rel.assets.find((a) => /^SHA256SUMS/i.test(a.name));
      if (sums) extra.push(`<a href="${sums.url}">SHA256SUMS</a>`);
      extra.push(`<a href="${rel.url}">${S.notes}</a>`);
      links.innerHTML = extra.join('<span aria-hidden="true">·</span>') + '<span aria-hidden="true">·</span>' + links.innerHTML;
    }
  }).catch(() => {
    // No release yet, offline or rate limited: keep the "Coming soon" state.
    document.querySelectorAll('[data-download-link]').forEach((a) => {
      if (a.getAttribute('href') !== '#download') a.href = RELEASES_PAGE;
    });
  });
})();
