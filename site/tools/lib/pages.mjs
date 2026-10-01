// Bodies of the generated pages that are not plain fragments: the docs hub
// (two big cards), section indexes, "coming soon" states and the page head.
import { esc, rootOf, head, htmlAttrs, header, footer, searchModal, ICONS, slugify } from './layout.mjs';
import { T, langRoot } from './i18n.mjs';

/** Eyebrow + h1 above a docs page. */
export function pageHead({ lang, section, group = '', title, h1Html = null, minutes = 0 }) {
  const t = T[lang];
  const sec = t.docs.sections[section];
  const icon = section === 'ai' ? 'i-bot' : section === 'guide' ? 'i-user' : 'i-sparkle';
  const bits = [];
  if (sec && section !== 'site') bits.push(`<span class="pe-sec pe-${section}"><svg aria-hidden="true"><use href="#${icon}"/></svg>${esc(sec.kicker || sec.short)}</span>`);
  if (group) bits.push(`<span class="pe-group">${esc(group)}</span>`);
  if (minutes) bits.push(`<span class="pe-time"><svg aria-hidden="true"><use href="#i-clock"/></svg>${esc(t.docs.minRead(minutes))}</span>`);
  return `<header class="page-head">${bits.length ? `<p class="page-eyebrow">${bits.join('')}</p>` : ''}<h1>${h1Html || esc(title)}</h1></header>`;
}

/** Auto-generated index of a doc set: a card per page, grouped. */
export function sectionIndexBody({ lang, section, path, groups, extraCards = [] }) {
  const root = rootOf(path);
  const t = T[lang];
  const sec = t.docs.sections[section];
  let out = `<p class="lead">${esc(sec.desc)}</p>\n`;
  let i = 0;
  for (const g of groups) {
    if (!g.items.length) continue;
    const id = slugify(g.title || sec.title) || `group-${i}`;
    out += `<h2 id="${esc(id)}">${esc(g.title || sec.title)}</h2>\n<div class="cards">${g.items.map((it) => `<a class="card" href="${root}${it.href}" style="--i:${i++}"><b>${esc(it.title)}</b>${it.description ? `<span>${esc(it.description)}</span>` : ''}${it.tag ? `<em class="tag">${esc(it.tag)}</em>` : ''}<svg class="card-arrow" aria-hidden="true"><use href="#i-arrow"/></svg></a>`).join('')}</div>\n`;
  }
  if (extraCards.length) {
    out += `<div class="cards cards-wide">${extraCards.map((c) => `<a class="card card-feature" href="${root}${c.href}"><b>${esc(c.title)}</b><span>${esc(c.description)}</span><svg class="card-arrow" aria-hidden="true"><use href="#i-arrow"/></svg></a>`).join('')}</div>`;
  }
  return out;
}

/** "Coming soon" body when a doc set has no fragments yet. */
export function comingSoonBody({ lang, section, path, meanwhile = [] }) {
  const root = rootOf(path);
  const t = T[lang];
  return `<div class="soon">
  <div class="soon-art" aria-hidden="true">
    <div class="soon-row"><i class="s1"></i><i class="s2"></i><i class="s3"></i></div>
    <div class="soon-row"><i class="s4"></i><i class="s5"></i></div>
    <div class="soon-row"><i class="s6"></i><i class="s7"></i><i class="s8"></i></div>
    <span class="soon-head"></span>
  </div>
  <p><span class="badge badge-beta"><span class="dot"></span>${esc(t.docs.comingSoonTitle)}</span></p>
  <p class="lead">${esc(t.docs.comingSoon[section])}</p>
</div>
${meanwhile.length ? `<h2 id="meanwhile">${esc(t.docs.meanwhile)}</h2>
<div class="cards">${meanwhile.map((c) => `<a class="card" href="${root}${c.href}"><b>${esc(c.title)}</b><span>${esc(c.description)}</span><svg class="card-arrow" aria-hidden="true"><use href="#i-arrow"/></svg></a>`).join('')}</div>` : ''}`;
}

/* ------------------------------------------------------------------ hub */
const humanArt = `<div class="hc-art hc-art-tl" aria-hidden="true">
  <div class="tl-bar"><i></i><i></i><i></i><b></b></div>
  <div class="tl-canvas"><span class="tl-title">Aa</span><span class="tl-sel"></span></div>
  <div class="tl-tracks">
    <div class="tl-trk t-text"><i class="c1"></i><i class="c2"></i></div>
    <div class="tl-trk t-main"><i class="c1"></i><i class="c2"></i><i class="c3"></i></div>
    <div class="tl-trk t-audio"><i class="c1"></i></div>
    <span class="tl-head"></span>
  </div>
</div>`;

const aiArt = `<div class="hc-art hc-art-term" aria-hidden="true">
  <div class="term-top"><i></i><i></i><i></i><span>kadr · MCP</span></div>
  <ol class="term-lines">
    <li class="l1"><b>›</b> timeline_segment_split <em>{"at_us": 2500000}</em></li>
    <li class="l2 ok">✓ ok · 1 undo step</li>
    <li class="l3"><b>›</b> text_add <em>{"text": "Or just ask."}</em></li>
    <li class="l4 ok">✓ seg_8ce2832025e4</li>
    <li class="l5"><b>›</b> preview_frame <em>{"time_us": 5000000}</em></li>
    <li class="l6 ok">✓ 1280×720 png</li>
  </ol>
</div>`;

/**
 * The docs hub. data: { guide: {href, items:[{title,href}], count}, ai: {...}, quick: [{key, title, desc, href, icon, id?, soon?}], total, links }
 */
export function hubPage({ lang, path, data, altHref, alternates }) {
  const root = rootOf(path);
  const t = T[lang];
  const h = t.hub;
  const card = (key, art) => {
    const d = data[key];
    const c = h[key === 'guide' ? 'humans' : 'ai'];
    const max = 6;
    const list = d.items.length
      ? `<ul class="hc-list">${d.items.slice(0, max).map((it) => `<li><a href="${root}${it.href}">${esc(it.title)}</a></li>`).join('')}${d.items.length > max ? `<li class="hc-more"><a href="${root}${d.href}">${esc(t.docs.morePages(d.items.length - max))}</a></li>` : ''}</ul>`
      : `<p class="hc-soon"><span class="badge badge-beta"><span class="dot"></span>${esc(h.soon)}</span></p>`;
    return `<article class="hub-card hc-${key} reveal" style="--d:${key === 'ai' ? '.12s' : '0s'}">
  <span class="hc-ring" aria-hidden="true"></span>
  ${art}
  <div class="hc-body">
    <span class="hc-kicker"><svg aria-hidden="true"><use href="#${key === 'ai' ? 'i-bot' : 'i-user'}"/></svg>${esc(c.kicker)}</span>
    <h2><a class="hc-link" href="${root}${d.href}">${esc(c.title)}</a></h2>
    <p>${esc(c.text.replace('{n}', data.total))}</p>
    ${list}
    <span class="hc-cta" aria-hidden="true">${esc(c.cta)}<svg><use href="#i-arrow"/></svg></span>
  </div>
</article>`;
  };
  const quick = data.quick.map((q, i) => `<a class="quick reveal" href="${root}${q.href}"${q.id ? ` id="${q.id}"` : ''} style="--d:${(i * 0.05).toFixed(2)}s"><span class="q-ico q-${q.key}"><svg aria-hidden="true"><use href="#${q.icon}"/></svg></span><b>${esc(q.title)}</b><span>${esc(q.desc)}</span><svg class="q-arrow" aria-hidden="true"><use href="#i-arrow"/></svg></a>`).join('\n      ');
  return `<!doctype html>
<html ${htmlAttrs(lang, path, altHref)} data-section="hub">
${head({ path, lang, title: `${h.title} — Kadr`, description: h.description, alternates, css: ['docs'], theme: true, ogType: 'website' })}
<body class="docs hub-page" data-root="${root}" data-lang-root="${langRoot(lang)}" id="top">
<a class="skip-link" href="#content">${esc(t.skip)}</a>
${ICONS}
${header({ path, lang, variant: 'docs', active: 'docs', altHref })}
<main class="hub" id="content">
  <section class="hub-hero wrap">
    <div class="hub-bg" aria-hidden="true"><i class="hb1"></i><i class="hb2"></i><i class="hb3"></i></div>
    <p class="eyebrow hub-in"><span class="chip-clip"></span>${esc(h.eyebrow)}</p>
    <h1 class="hub-title hub-in"><span>${esc(h.h1a)}</span> <span class="grad-text">${esc(h.h1b)}</span></h1>
    <p class="hub-sub hub-in">${esc(h.sub)}</p>
    <button class="hub-search hub-in" type="button" data-search-open><svg aria-hidden="true"><use href="#i-search"/></svg><span>${esc(h.searchPlaceholder)}</span><kbd>Ctrl</kbd><kbd>K</kbd></button>
  </section>
  <section class="hub-cards wrap-wide" aria-label="${esc(t.docs.title)}">
    ${card('guide', humanArt)}
    ${card('ai', aiArt)}
  </section>
  <section class="hub-quick wrap-wide" aria-labelledby="quick-title">
    <h2 class="hub-h2 reveal" id="quick-title">${esc(h.quick)}</h2>
    <div class="quick-grid">
      ${quick}
    </div>
  </section>
</main>
${footer({ path, lang, links: data.links })}
${searchModal(lang)}
<script src="${root}assets/js/site.js" defer></script>
<script src="${root}assets/js/docs.js" defer></script>
</body>
</html>
`;
}
