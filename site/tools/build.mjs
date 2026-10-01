#!/usr/bin/env node
// Builds the generated part of the Kadr website (the site is static — no build
// step is needed to *serve* it; this regenerates the committed HTML):
//
//   0. site/tools/gen-llms.mjs (if present) → llms.txt, llms-full.txt
//   1. docs/openapi.json → site/openapi.json
//   2. docs hubs            docs/index.html, uk/docs/index.html
//   3. user guide           docs-src/guide/{en,uk}/*.html → [uk/]docs/guide/*.html
//   4. AI docs              docs-src/ai/{en,uk}/*.html    → [uk/]docs/ai/*.html
//   5. command reference    docs/openapi.json             → [uk/]docs/ai/reference/*.html
//   6. site pages           docs-src/{changelog,privacy,licenses}[.uk].html → [uk/]*.html
//   7. landing pages        shared header/footer, doc links, command counts in [uk/]index.html
//   8. search indexes       assets/search/{en,uk}.json
//   9. legacy redirects     old docs/*.html URLs → new locations
//  10. sitemap.xml (with hreflang) + robots.txt
//  11. link check (0 broken links required)
//
// Usage (from the repository root):   node site/tools/build.mjs
// Fragment format: docs/design/site-v2.md. Node standard library only.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { rootOf, absUrl, slugify, docsPage, sidebar, redirectPage, header, footer, SITE_URL } from './lib/layout.mjs';
import { T, LANGS, langRoot } from './lib/i18n.mjs';
import { SITE, TOOLS, REPO, DOCS_SRC, OPENAPI, loadCommands, loadSection, loadSitePages, commandUrl, SITE_PAGES } from './lib/content.mjs';
import { transformFragment } from './lib/transform.mjs';
import { pageHead, sectionIndexBody, comingSoonBody, hubPage } from './lib/pages.mjs';
import { referencePages } from './gen-reference.mjs';
import { checkLinks } from './check-links.mjs';

const started = Date.now();
const errors = [];
const warnings = [];
const written = new Set();
const sitemap = []; // [{en, uk}] logical pages (site-root relative), null when not real
const search = { en: { pages: [], cmds: [] }, uk: { pages: [], cmds: [] } };
const other = (l) => (l === 'en' ? 'uk' : 'en');
const ukPlural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
const rel = (p) => path.relative(REPO, p).replace(/\\/g, '/');

function write(p, html) {
  const full = path.join(SITE, p);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, html);
  written.add(p);
}
function rmrf(p) { fs.rmSync(path.join(SITE, p), { recursive: true, force: true }); }

/* ================================================================ 0. llms.txt (docs-ai team) */
const llmsScript = path.join(TOOLS, 'gen-llms.mjs');
if (fs.existsSync(llmsScript)) {
  const r = spawnSync(process.execPath, [llmsScript], { cwd: REPO, encoding: 'utf8' });
  if (r.status !== 0) errors.push(`gen-llms.mjs failed (exit ${r.status}):\n${(r.stderr || r.stdout || '').trim().split('\n').slice(-12).join('\n')}`);
  else console.log(`llms: ${(r.stdout || '').trim().split('\n').pop() || 'ok'}`);
} else {
  warnings.push('site/tools/gen-llms.mjs not found yet — llms.txt not generated');
}
const hasLlms = fs.existsSync(path.join(SITE, 'llms.txt'));

/* ================================================================ 1. openapi.json */
const cmds = loadCommands();
fs.copyFileSync(OPENAPI, path.join(SITE, 'openapi.json'));

/* ================================================================ clean generated output */
rmrf('docs');
rmrf('uk/docs');
rmrf('assets/search-index.json');
for (const name of SITE_PAGES) for (const l of LANGS) rmrf(`${langRoot(l)}${name}.html`);

/* ================================================================ content */
const raw = { guide: loadSection('guide', errors), ai: loadSection('ai', errors) };
const siteRaw = loadSitePages(errors);

/**
 * Entries of a doc set per language, with fallbacks: a page that exists only in
 * the other language is rendered there with a "not translated yet" notice.
 */
function compose(section, pagesByLang, base) {
  const out = {};
  const index = {};
  for (const lang of LANGS) {
    const mine = new Map(pagesByLang[lang].map((p) => [p.slug, p]));
    const theirs = new Map(pagesByLang[other(lang)].map((p) => [p.slug, p]));
    // group names of the other language mapped through shared slugs
    const gmap = new Map();
    for (const [slug, p] of theirs) if (mine.has(slug) && p.group) gmap.set(p.group, mine.get(slug).group || p.group);
    const slugs = [...new Set([...mine.keys(), ...theirs.keys()])];
    out[lang] = [];
    for (const slug of slugs) {
      const own = mine.get(slug);
      const src = own || theirs.get(slug);
      const entry = {
        section, slug, lang, page: src, fallback: !own, srcLang: own ? lang : other(lang),
        path: base(lang, slug), title: src.title, nav: src.nav, order: src.order, description: src.description,
        group: own ? src.group : (gmap.get(src.group) || src.group),
      };
      if (slug === 'index') index[lang] = entry; else out[lang].push(entry);
    }
    out[lang].sort((a, b) => a.order - b.order || a.nav.localeCompare(b.nav));
  }
  return { entries: out, index };
}
const docBase = (section) => (lang, slug) => `${langRoot(lang)}docs/${section}/${slug}.html`;
const sets = {
  guide: compose('guide', raw.guide, docBase('guide')),
  ai: compose('ai', raw.ai, docBase('ai')),
};
const siteSet = compose('site', siteRaw, (lang, slug) => `${langRoot(lang)}${slug}.html`);
for (const s of ['guide', 'ai']) {
  if (!raw[s].en.length && !raw[s].uk.length) warnings.push(`no ${s} fragments yet (site/tools/docs-src/${s}/{en,uk}/) — "coming soon" index generated`);
}

/* ================================================================ well-known pages */
const KEYS = {
  // exact slugs first, then looser patterns (word-bounded so "cli" never matches "clients")
  install: ['guide', [/^(getting-started|install|installation|get-started|start)$/, /(^|[-/])(install|getting-started|get-started|first-steps)($|[-/])/]],
  faq: ['guide', [/^(faq|troubleshooting-faq|troubleshooting-and-faq|troubleshooting)$/, /(^|[-/])(faq|troubleshoot(ing)?)($|[-/])/]],
  shortcuts: ['guide', [/^(keyboard-shortcuts|shortcuts|hotkeys)$/, /(^|[-/])(shortcuts?|hotkeys?|keyboard)($|[-/])/]],
  mcp: ['ai', [/^(quick-start|quickstart|mcp|mcp-setup|connect-claude)$/, /(^|[-/])(quick-?start|mcp-setup)($|[-/])/, /^claude-(desktop|code)$/]],
  rest: ['ai', [/^(rest|rest-api|api|http-api)$/, /(^|[-/])rest(-api)?($|[-/])/]],
  cli: ['ai', [/^(cli|kadrctl|command-line)$/, /(^|[-/])(cli|kadrctl)($|[-/])/]],
  recipes: ['ai', [/^recipes?$/, /^recipes?\/index$/, /^recipes?\//, /(^|[-/])recipes?($|[-/])/]],
};
const sectionIndex = (section, lang) => `${langRoot(lang)}docs/${section}/index.html`;
/** Site-root relative path of a well-known page, or null when the doc set has none. */
function resolve(key, lang) {
  const [section, patterns] = KEYS[key];
  const entries = sets[section].entries[lang];
  for (const re of patterns) {
    const hit = entries.find((e) => !e.fallback && re.test(e.slug)) || entries.find((e) => re.test(e.slug));
    if (hit) return hit.path;
  }
  return null;
}
const resolveOr = (key, lang) => resolve(key, lang) || sectionIndex(KEYS[key][0], lang);
const resolveDoc = (key, lang) => (KEYS[key] ? resolveOr(key, lang) : null);
function footerLinks(lang) {
  return {
    guide: sectionIndex('guide', lang), ai: sectionIndex('ai', lang), reference: `${langRoot(lang)}docs/ai/reference/index.html`,
    mcp: resolve('mcp', lang), faq: resolve('faq', lang), llms: hasLlms ? 'llms.txt' : null,
  };
}

/* ================================================================ navigation */
const refPages = Object.fromEntries(LANGS.map((l) => [l, referencePages(cmds, l, { rest: resolve('rest', l), mcp: resolve('mcp', l), cli: resolve('cli', l) })]));

function navFor(section, lang) {
  const t = T[lang];
  const { entries, index } = sets[section];
  const list = entries[lang];
  const groups = [];
  const indexTitle = index[lang] ? index[lang].nav : t.docs.allTopics;
  groups.push({ title: '', items: [{ title: indexTitle, href: sectionIndex(section, lang) }] });
  const byGroup = new Map();
  for (const e of list) {
    const g = e.group || t.docs.sections[section].title;
    if (!byGroup.has(g)) byGroup.set(g, { title: g, min: e.order, items: [] });
    const G = byGroup.get(g);
    G.min = Math.min(G.min, e.order);
    G.items.push({ title: e.nav, href: e.path, tag: e.fallback ? T[e.srcLang].short : '', description: e.description });
  }
  groups.push(...[...byGroup.values()].sort((a, b) => a.min - b.min));
  if (section === 'ai') {
    const refItems = refPages[lang].map((p) => ({ title: p.nav, href: p.path, count: p.count }));
    // Merge into an existing group with the same title (e.g. the AI docs'
    // own "Command reference" intro group) instead of repeating the heading.
    const same = groups.find((g) => g.title && g.title.trim().toLowerCase() === t.ref.groupTitle.trim().toLowerCase());
    if (same) same.items.push(...refItems);
    else groups.push({ title: t.ref.groupTitle, items: refItems });
  }
  return groups;
}
const navs = {};
for (const s of ['guide', 'ai']) navs[s] = Object.fromEntries(LANGS.map((l) => [l, navFor(s, l)]));
const switcher = (lang) => [
  { key: 'guide', title: T[lang].docs.sections.guide.short, href: sectionIndex('guide', lang) },
  { key: 'ai', title: T[lang].docs.sections.ai.short, href: sectionIndex('ai', lang) },
];
function neighbours(groups, href) {
  const order = groups.flatMap((g) => g.items);
  const i = order.findIndex((o) => o.href === href);
  return { prev: i > 0 ? order[i - 1] : null, next: i >= 0 && i < order.length - 1 ? order[i + 1] : null };
}
const altOf = (p) => Object.fromEntries(LANGS.map((l) => [l, langRoot(l) + (p.startsWith('uk/') ? p.slice(3) : p)]));

/* ================================================================ render helpers */
function render(o) {
  // o: { path, lang, section, title, description, body, toc, crumbs, groups, real: {en,uk}, notice, articleLang, bodyClass, scripts, robots, canonical }
  const { prev, next } = o.groups ? neighbours(o.groups, o.path) : {};
  const html = docsPage({
    ...o, prev, next,
    sidebarHtml: sidebar({ path: o.path, lang: o.lang, section: o.section, switcher: switcher(o.lang), groups: o.groups || [] }),
    altHref: altOf(o.path), alternates: o.real || {}, links: footerLinks(o.lang),
  });
  write(o.path, html);
}
const minutes = (words, lang) => Math.max(1, Math.round(words / (lang === 'uk' ? 180 : 210)));
const crumbsFor = (lang, section, extra = []) => [
  { title: T[lang].docs.crumbsDocs, href: `${langRoot(lang)}docs/index.html` },
  ...(section === 'site' ? [] : [{ title: T[lang].docs.sections[section].title, href: sectionIndex(section, lang) }]),
  ...extra,
];
function searchPage(lang, kind, title, url, desc, sections = []) {
  search[lang].pages.push({ k: kind, t: title, u: url, d: desc, s: sections.filter((s) => s.id || s.x).slice(0, 40) });
}

/* ================================================================ 3–4. guide + AI pages */
for (const section of ['guide', 'ai']) {
  const { entries, index } = sets[section];
  for (const lang of LANGS) {
    const groups = navs[section][lang];
    const t = T[lang];
    // ---- pages
    for (const e of entries[lang]) {
      const root = rootOf(e.path);
      const res = transformFragment(e.page.body, { lang: e.srcLang, root, cmds, errors, src: e.page.src, resolveDoc });
      const body = pageHead({ lang, section, group: e.group, title: e.title, h1Html: res.h1, minutes: minutes(res.words, e.srcLang) }) + res.body;
      const otherEntry = entries[other(lang)].find((x) => x.slug === e.slug);
      const realBoth = !e.fallback && otherEntry && !otherEntry.fallback;
      render({
        path: e.path, lang, section, title: e.title, description: e.description || t.docs.sections[section].desc, body, toc: res.toc,
        crumbs: crumbsFor(lang, section, [{ title: e.nav }]), groups,
        real: realBoth ? { [lang]: e.path, [other(lang)]: otherEntry.path } : {},
        notice: e.fallback ? T[lang].docs.untranslated : '', articleLang: e.fallback ? e.srcLang : '',
        robots: e.fallback ? 'noindex, follow' : '', canonical: e.fallback ? otherEntry?.path : null,
        bodyClass: `docs sec-${section} page-${e.slug.replace(/\//g, '-')}`,
      });
      if (!e.fallback) {
        searchPage(lang, section, e.title, e.path, e.description, res.sections);
        if (lang === 'en') sitemap.push({ en: e.path, uk: otherEntry && !otherEntry.fallback ? otherEntry.path : null });
        else if (!otherEntry || otherEntry.fallback) sitemap.push({ en: null, uk: e.path });
      }
    }
    // ---- section index
    const ip = sectionIndex(section, lang);
    const ie = index[lang];
    const sec = t.docs.sections[section];
    let body, toc = [], description = sec.desc, title = sec.title;
    if (ie) {
      const res = transformFragment(ie.page.body, { lang: ie.srcLang, root: rootOf(ip), cmds, errors, src: ie.page.src, resolveDoc });
      body = pageHead({ lang, section, title: ie.title, h1Html: res.h1 }) + res.body;
      toc = res.toc; description = ie.description || description; title = ie.title;
      if (!ie.fallback) searchPage(lang, section, ie.title, ip, description, res.sections);
    } else if (entries[lang].length) {
      const extra = section === 'ai' ? [{ title: t.ref.title, description: t.ref.description(cmds.total), href: `${langRoot(lang)}docs/ai/reference/index.html` }] : [];
      body = pageHead({ lang, section, title }) + sectionIndexBody({ lang, section, path: ip, groups: groups.slice(1).filter((g) => g.title !== t.ref.groupTitle), extraCards: extra });
      toc = groups.slice(1).filter((g) => g.items.length && g.title !== t.ref.groupTitle).map((g) => ({ id: slugify(g.title || title), text: g.title || title, level: 2 }));
      searchPage(lang, section, title, ip, description, []);
    } else {
      const otherSec = section === 'guide' ? 'ai' : 'guide';
      const meanwhile = [];
      if (sets[otherSec].entries[lang].length) meanwhile.push({ title: t.docs.sections[otherSec].title, description: t.docs.sections[otherSec].desc, href: sectionIndex(otherSec, lang) });
      meanwhile.push({ title: t.ref.title, description: t.ref.description(cmds.total), href: `${langRoot(lang)}docs/ai/reference/index.html` });
      meanwhile.push({ title: t.footer.changelog, description: t.hub.q.changelog[1], href: `${langRoot(lang)}changelog.html` });
      body = pageHead({ lang, section, title }) + comingSoonBody({ lang, section, path: ip, meanwhile });
      toc = [];
    }
    render({
      path: ip, lang, section, title, description, body, toc, groups,
      crumbs: crumbsFor(lang, section).slice(0, 1).concat([{ title }]),
      real: { en: sectionIndex(section, 'en'), uk: sectionIndex(section, 'uk') },
      bodyClass: `docs sec-${section} section-index${!entries[lang].length && !ie ? ' is-soon' : ''}`,
    });
    if (lang === 'en') sitemap.push({ en: sectionIndex(section, 'en'), uk: sectionIndex(section, 'uk') });
  }
}

/* ================================================================ 5. command reference */
for (const lang of LANGS) {
  const groups = navs.ai[lang];
  const t = T[lang];
  for (const p of refPages[lang]) {
    const isIndex = p.slug === 'reference/index';
    render({
      path: p.path, lang, section: 'ai', active: 'reference', title: p.title, description: p.description,
      body: pageHead({ lang, section: 'ai', group: isIndex ? '' : t.ref.groupTitle, title: p.title }) + p.body, toc: p.toc, groups,
      crumbs: crumbsFor(lang, 'ai', isIndex ? [{ title: t.ref.crumb }] : [{ title: t.ref.crumb, href: `${langRoot(lang)}docs/ai/reference/index.html` }, { title: p.nav }]),
      real: altOf(p.path), bodyClass: p.bodyClass,
    });
    if (lang === 'en') sitemap.push(altOf(p.path));
  }
  search[lang].cmds = cmds.categories.flatMap((c) => c.commands.map((x) => ({
    n: x.name, t: x.title, c: T[lang].ref.cats[c.name] || c.name, u: commandUrl(x, lang),
    d: (x.description.match(/^(.{20,180}?[.!?])(\s|$)/) || [null, x.description.slice(0, 160)])[1].trim(), h: x.hotkey || undefined,
  })));
  searchPage(lang, 'ai', t.ref.title, `${langRoot(lang)}docs/ai/reference/index.html`, t.ref.description(cmds.total), []);
}

/* ================================================================ 6. site pages (changelog, privacy, licenses) */
for (const lang of LANGS) {
  const t = T[lang];
  const list = siteSet.entries[lang];
  const groups = [
    { title: t.site.sideTitle, items: list.map((e) => ({ title: e.nav, href: e.path, tag: e.fallback ? T[e.srcLang].short : '' })) },
    { title: t.site.docsGroup, items: [
      { title: t.docs.sections.guide.title, href: sectionIndex('guide', lang) },
      { title: t.docs.sections.ai.title, href: sectionIndex('ai', lang) },
      { title: t.ref.title, href: `${langRoot(lang)}docs/ai/reference/index.html` },
    ] },
  ];
  for (const e of list) {
    const res = transformFragment(e.page.body, { lang: e.srcLang, root: rootOf(e.path), cmds, errors, src: e.page.src, resolveDoc });
    const otherEntry = siteSet.entries[other(lang)].find((x) => x.slug === e.slug);
    const realBoth = !e.fallback && otherEntry && !otherEntry.fallback;
    render({
      path: e.path, lang, section: 'site', active: e.slug === 'changelog' ? 'changelog' : '', title: e.title, description: e.description,
      body: pageHead({ lang, section: 'site', title: e.title, h1Html: res.h1 }) + res.body, toc: res.toc,
      crumbs: [{ title: 'Kadr', href: `${langRoot(lang)}index.html` }, { title: e.nav }], groups,
      real: realBoth ? { [lang]: e.path, [other(lang)]: otherEntry.path } : {},
      notice: e.fallback ? T[lang].docs.untranslated : '', articleLang: e.fallback ? e.srcLang : '',
      robots: e.fallback ? 'noindex, follow' : '', canonical: e.fallback ? otherEntry?.path : null,
      bodyClass: `docs sec-site page-${e.slug}`, scripts: e.slug === 'changelog' ? ['release'] : [],
    });
    if (!e.fallback) {
      searchPage(lang, 'guide', e.title, e.path, e.description, res.sections);
      if (lang === 'en' || !realBoth) sitemap.push(realBoth ? { en: e.path, uk: otherEntry.path } : { [lang]: e.path, [other(lang)]: null });
    }
  }
}

/* ================================================================ 2. docs hubs */
for (const lang of LANGS) {
  const t = T[lang];
  const p = `${langRoot(lang)}docs/index.html`;
  const items = (s) => sets[s].entries[lang].map((e) => ({ title: e.nav, href: e.path }));
  const q = t.hub.q;
  const quick = [
    { key: 'install', id: 'install', title: q.install[0], desc: q.install[1], href: resolveOr('install', lang), icon: 'i-windows' },
    { key: 'mcp', title: q.mcp[0], desc: q.mcp[1], href: resolveOr('mcp', lang), icon: 'i-plug' },
    { key: 'reference', title: q.reference[0], desc: q.reference[1].replace('{n}', cmds.total), href: `${langRoot(lang)}docs/ai/reference/index.html`, icon: 'i-list' },
    ...(hasLlms ? [{ key: 'llms', title: q.llms[0], desc: q.llms[1], href: 'llms.txt', icon: 'i-file' }] : []),
    { key: 'openapi', title: q.openapi[0], desc: q.openapi[1], href: 'openapi.json', icon: 'i-braces' },
    { key: 'changelog', title: q.changelog[0], desc: q.changelog[1], href: `${langRoot(lang)}changelog.html`, icon: 'i-history' },
  ];
  write(p, hubPage({
    lang, path: p, altHref: altOf(p), alternates: altOf(p),
    data: {
      total: cmds.total, quick, links: footerLinks(lang),
      guide: { href: sectionIndex('guide', lang), items: items('guide') },
      ai: { href: sectionIndex('ai', lang), items: items('ai') },
    },
  }));
  if (lang === 'en') sitemap.push(altOf(p));
  searchPage(lang, 'guide', t.hub.title, p, t.hub.description, []);
}

/* ================================================================ 7. landing pages */
for (const lang of LANGS) {
  const p = `${langRoot(lang)}index.html`;
  const file = path.join(SITE, p);
  if (!fs.existsSync(file)) { errors.push(`${p} is missing`); continue; }
  let html = fs.readFileSync(file, 'utf8');
  const before = html;
  const root = rootOf(p);
  html = html.replace(/<!--site:header-->[\s\S]*?<!--\/site:header-->/, `<!--site:header-->\n${header({ path: p, lang, variant: 'home', altHref: altOf(p) })}\n<!--/site:header-->`);
  html = html.replace(/<!--site:footer-->[\s\S]*?<!--\/site:footer-->/, `<!--site:footer-->\n${footer({ path: p, lang, links: footerLinks(lang) })}\n<!--/site:footer-->`);
  html = html.replace(/<!--cmdcount-->\d+<!--\/cmdcount-->/g, `<!--cmdcount-->${cmds.total}<!--/cmdcount-->`)
    .replace(/<!--toolcount-->\d+<!--\/toolcount-->/g, `<!--toolcount-->${cmds.total + 1}<!--/toolcount-->`)
    .replace(/(data-count-to=")\d+("[^>]*data-count="cmd")/g, `$1${cmds.total}$2`)
    // Ukrainian nouns agree with the number: 172 команди, 177 команд
    .replace(/<!--cmdnoun-->[^<]*<!--\/cmdnoun-->/g, `<!--cmdnoun-->${T.uk.ref.count(cmds.total).replace(/^\d+ /, '')}<!--/cmdnoun-->`)
    .replace(/<!--toolnoun-->[^<]*<!--\/toolnoun-->/g, `<!--toolnoun-->${ukPlural(cmds.total + 1, 'інструмент', 'інструменти', 'інструментів')}<!--/toolnoun-->`);
  // links to docs pages whose slugs the content teams choose: <a href="…" data-doc="mcp">
  html = html.replace(/<a\b([^>]*?)\sdata-doc="([^"]+)"([^>]*)>/g, (m, a, key, b) => {
    const [k, hash] = key.split('#');
    let target;
    if (KEYS[k]) target = resolveOr(k, lang);
    else if (k === 'guide' || k === 'ai') target = sectionIndex(k, lang);
    else if (k === 'reference') target = `${langRoot(lang)}docs/ai/reference/index.html`;
    else if (k === 'docs') target = `${langRoot(lang)}docs/index.html`;
    else if (SITE_PAGES.includes(k)) target = `${langRoot(lang)}${k}.html`;
    else { errors.push(`${p}: unknown data-doc="${key}"`); return m; }
    const rel = path.posix.relative(path.posix.dirname(p), target).replace(/(^|\/)index\.html$/, '$1') || './';
    const href = `${rel}${hash ? `#${hash}` : ''}`;
    const attrs = `${a} data-doc="${key}"${b}`.replace(/\shref="[^"]*"/, ` href="${href}"`);
    return `<a${attrs}>`;
  });
  if (html !== before) fs.writeFileSync(file, html);
  if (lang === 'en') sitemap.unshift({ en: 'index.html', uk: 'uk/index.html' });
  searchPage(lang, 'guide', 'Kadr', p, T[lang].footer.tagline, []);
}

/* ================================================================ 8. search indexes */
for (const lang of LANGS) {
  write(`assets/search/${lang}.json`, JSON.stringify({ v: 2, lang, pages: search[lang].pages, cmds: search[lang].cmds }));
}

/* ================================================================ 9. legacy redirects */
const RECIPES = new Set(['ai-review-loop', 'batch-export-variants', 'beat-cut-music-video', 'photo-slideshow', 'podcast-audiogram', 'product-promo', 'talking-head-cleanup', 'translate-and-reburn-captions', 'vertical-tiktok']);
const legacyRecipesDir = path.join(DOCS_SRC, 'recipes');
if (fs.existsSync(legacyRecipesDir)) for (const f of fs.readdirSync(legacyRecipesDir)) if (f.endsWith('.html')) RECIPES.add(f.replace(/\.html$/, ''));
const legacy = [
  ['docs/getting-started.html', resolveOr('install', 'en')],
  ['docs/faq.html', resolveOr('faq', 'en')],
  ['docs/mcp.html', resolveOr('mcp', 'en')],
  ['docs/rest.html', resolveOr('rest', 'en')],
  ['docs/cli.html', resolveOr('cli', 'en')],
  ['docs/privacy.html', 'privacy.html'],
  ['docs/licenses.html', 'licenses.html'],
  ['docs/changelog.html', 'changelog.html'],
  ['docs/recipes/index.html', resolveOr('recipes', 'en')],
  ...[...RECIPES].map((name) => {
    const hit = sets.ai.entries.en.find((e) => e.slug === name || e.slug.endsWith(`/${name}`) || e.slug.endsWith(`-${name}`) || e.slug.startsWith(`${name}`));
    return [`docs/recipes/${name}.html`, hit ? hit.path : resolveOr('recipes', 'en')];
  }),
  ['docs/reference/index.html', 'docs/ai/reference/index.html'],
  ...cmds.categories.map((c) => [`docs/reference/${c.slug}.html`, `docs/ai/reference/${c.slug}.html`]),
];
for (const [from, to] of legacy) {
  if (written.has(from)) { errors.push(`legacy redirect ${from} would overwrite a generated page`); continue; }
  const uk = `uk/${to}`;
  write(from, redirectPage(from, to, 'en', written.has(uk) ? uk : null));
}

/* ================================================================ 10. sitemap + robots */
{
  const today = new Date().toISOString().slice(0, 10);
  const seen = new Set();
  const urls = [];
  for (const s of sitemap) {
    const real = LANGS.filter((l) => s[l] && fs.existsSync(path.join(SITE, s[l])));
    for (const l of real) {
      if (seen.has(s[l])) continue;
      seen.add(s[l]);
      const alts = real.length > 1 ? real.map((x) => `\n    <xhtml:link rel="alternate" hreflang="${x}" href="${absUrl(s[x])}"/>`).join('') + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${absUrl(s.en)}"/>` : '';
      urls.push(`  <url>\n    <loc>${absUrl(s[l])}</loc>${alts}\n    <lastmod>${today}</lastmod>\n  </url>`);
    }
  }
  fs.writeFileSync(path.join(SITE, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`);
  fs.writeFileSync(path.join(SITE, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
  console.log(`sitemap: ${urls.length} URLs`);
}

/* ================================================================ summary + 11. link check */
const count = (s, l) => sets[s].entries[l].filter((e) => !e.fallback).length;
console.log(`guide: en ${count('guide', 'en')} / uk ${count('guide', 'uk')} pages · ai: en ${count('ai', 'en')} / uk ${count('ai', 'uk')} pages · reference: ${cmds.total} commands in ${cmds.categories.length} categories × 2 languages · site pages: ${siteSet.entries.en.length}+${siteSet.entries.uk.length} · redirects: ${legacy.length} · ${written.size} files written`);
for (const w of warnings) console.log(`note: ${w}`);
const links = checkLinks();
if (links.bad) errors.push(`${links.bad} broken link(s) — see above`);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exitCode = 1;
} else {
  console.log(`build ok in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
