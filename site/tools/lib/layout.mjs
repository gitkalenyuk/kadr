// Shared page shells (head, header, footer, docs layout, redirects) and syntax
// highlighting for every generated page of the Kadr site. Node standard library only.
import { T, LANGS, langRoot } from './i18n.mjs';

export const SITE_URL = 'https://gitkalenyuk.github.io/kadr/';
export const REPO_URL = 'https://github.com/gitkalenyuk/kadr';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
export function unesc(s) {
  return String(s ?? '').replace(/&(lt|gt|quot|#39|#x27|apos|nbsp|amp);/g, (m, e) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", apos: "'", nbsp: '\u00a0', amp: '&' }[e]));
}
/** URL/id-safe slug; keeps Cyrillic and other letters (valid HTML ids). */
export function slugify(s) {
  return String(s).toLowerCase().normalize('NFC').replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}
/** "../" repeated for a page at `path` relative to the site root (docs/ai/x.html → ../../). */
export function rootOf(path) {
  const depth = path.split('/').length - 1;
  return depth ? '../'.repeat(depth) : './';
}
/** Pretty URL of a site-root relative path (index.html dropped). */
export const pretty = (p) => p.replace(/(^|\/)index\.html$/, '$1');
export const absUrl = (p) => SITE_URL + pretty(p);

/* ------------------------------------------------------------------ highlighting */
const RULES = {
  json: [
    ['tok-c', /\/\/[^\n]*/y],
    ['tok-p', /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y],
    ['tok-s', /"(?:[^"\\\n]|\\.)*"/y],
    ['tok-n', /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\btrue\b|\bfalse\b|\bnull\b/y],
    ['tok-o', /[{}[\],:]/y],
  ],
  shell: [
    ['tok-c', /(?:^|(?<=\s))#[^\n]*|^\s*(?:REM|::)\b[^\n]*/my],
    ['json1', /'\{[\s\S]*?\}'|'\[[\s\S]*?\]'/y],
    ['tok-s', /'[^'\n]*'|"(?:[^"\\\n]|\\.)*"/y],
    ['tok-n', /\$env:[A-Za-z_]+|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_]+%/y],
    ['tok-f', /https?:\/\/[^\s'"\\]+/y],
    ['tok-p', /(?<=\s)--?[A-Za-z][\w-]*/y],
    ['tok-k', /(?<=^|\n|\|\s|\(\s?|&&\s|;\s)(?:curl|kadrctl|kadr-mcp|kadr-server|claude|Invoke-RestMethod|irm|Get-Content|Set-Content|Start-Process|winget|python|py|pip|npx|node|cd|set|setx|export|foreach|Get-ChildItem|ffmpeg|ffprobe|echo|cat|jq|wscat|websocat|for|do|done|Copy-Item|New-Item|Remove-Item|ForEach-Object|ConvertTo-Json|ConvertFrom-Json|Write-Host|\$[a-z]+\s*=)\b/y],
  ],
  python: [
    ['tok-c', /#[^\n]*/y],
    ['tok-s', /"""[\s\S]*?"""|'''[\s\S]*?'''|[rbf]?"(?:[^"\\\n]|\\.)*"|[rbf]?'(?:[^'\\\n]|\\.)*'/y],
    ['tok-k', /\b(?:import|from|as|def|return|if|elif|else|for|while|in|not|and|or|with|try|except|finally|raise|class|lambda|pass|break|continue|yield|async|await|None|True|False)\b/y],
    ['tok-n', /\b\d+(?:\.\d+)?\b/y],
    ['tok-f', /\b[a-zA-Z_][\w]*(?=\()/y],
  ],
  js: [
    ['tok-c', /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
    ['tok-s', /`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/y],
    ['tok-k', /\b(?:const|let|var|function|return|if|else|for|of|in|while|await|async|import|from|export|new|try|catch|throw|class|true|false|null|undefined)\b/y],
    ['tok-n', /\b\d+(?:\.\d+)?\b/y],
    ['tok-f', /\b[a-zA-Z_$][\w$]*(?=\()/y],
  ],
  http: [
    ['tok-k', /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/my],
    ['tok-p', /^[A-Za-z-]+(?=:\s)/my],
    ['tok-s', /"(?:[^"\\\n]|\\.)*"/y],
    ['tok-f', /https?:\/\/[^\s]+|\/api\/[^\s]+/y],
  ],
};
const ALIAS = {
  bash: 'shell', sh: 'shell', zsh: 'shell', powershell: 'shell', ps: 'shell', ps1: 'shell', pwsh: 'shell', cmd: 'shell', bat: 'shell',
  curl: 'shell', kadrctl: 'shell', cli: 'shell', console: 'shell', terminal: 'shell',
  mcp: 'json', jsonc: 'json', json5: 'json',
  py: 'python', javascript: 'js', ts: 'js', typescript: 'js', mjs: 'js', node: 'js',
};
export const LANG_LABELS = {
  curl: 'curl', kadrctl: 'kadrctl', cli: 'kadrctl', mcp: 'MCP', json: 'JSON', bash: 'Bash', sh: 'Shell', shell: 'Shell', zsh: 'zsh',
  powershell: 'PowerShell', ps: 'PowerShell', ps1: 'PowerShell', pwsh: 'PowerShell', cmd: 'CMD', bat: 'CMD', python: 'Python', py: 'Python',
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript', http: 'HTTP', text: 'Text', toml: 'TOML', yaml: 'YAML',
  console: 'Console', terminal: 'Terminal', claude: 'Claude', 'claude-code': 'Claude Code', 'claude-desktop': 'Claude Desktop',
};
export const langLabel = (l) => LANG_LABELS[String(l || '').toLowerCase()] || String(l || 'Code');

/** Highlight raw (unescaped) code; returns HTML. */
export function highlight(code, lang = 'text') {
  const key = String(lang || 'text').toLowerCase();
  const rules = RULES[key] || RULES[ALIAS[key]];
  if (!rules) return esc(code);
  let out = '';
  let i = 0;
  let plain = '';
  const flush = () => { if (plain) { out += esc(plain); plain = ''; } };
  outer: while (i < code.length) {
    for (const [cls, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m.index === i && m[0].length) {
        flush();
        if (cls === 'json1') out += `<span class="tok-s">'</span>${highlight(m[0].slice(1, -1), 'json')}<span class="tok-s">'</span>`;
        else out += `<span class="${cls}">${esc(m[0])}</span>`;
        i += m[0].length;
        continue outer;
      }
    }
    plain += code[i++];
  }
  flush();
  return out;
}

export function codeBlock(code, lang = 'text', { copy = true, label = '', l = 'en' } = {}) {
  const t = T[l] || T.en;
  const btn = copy ? `<button class="copy-btn" type="button" aria-label="${esc(t.docs.copyCode)}"><svg aria-hidden="true"><use href="#i-copy"/></svg><span>${esc(t.docs.copy)}</span></button>` : '';
  return `<div class="code-wrap${label ? ' has-label' : ''}">${label ? `<span class="code-label">${esc(label)}</span>` : ''}<pre class="code lang-${esc(String(lang).toLowerCase())}"><code>${highlight(code, lang)}</code></pre>${btn}</div>`;
}

let tabSeq = 0;
/** Tabbed code examples. tabs: [{key, label, html}] (html = rendered code block). */
export function codeTabs(tabs, l = 'en') {
  const n = ++tabSeq;
  const bar = tabs.map((tb, i) => `<button type="button" role="tab" id="ct${n}-${i}" aria-controls="ct${n}-${i}p" aria-selected="${i === 0}"${i ? ' tabindex="-1"' : ''} data-tab="${esc(tb.key)}">${esc(tb.label)}</button>`).join('');
  const panels = tabs.map((tb, i) => `<div class="ct-panel${i === 0 ? ' on' : ''}" role="tabpanel" id="ct${n}-${i}p" aria-labelledby="ct${n}-${i}" data-tab="${esc(tb.key)}" data-label="${esc(tb.label)}">${tb.html}</div>`).join('');
  return `<div class="code-tabs"><div class="ct-bar" role="tablist" aria-label="${esc((T[l] || T.en).docs.codeExamples)}">${bar}</div>${panels}</div>`;
}

/* ------------------------------------------------------------------ icons */
export const ICONS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="i-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="i-arrow-l" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol>
<symbol id="i-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></symbol>
<symbol id="i-ext" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></symbol>
<symbol id="i-download" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></symbol>
<symbol id="i-github" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></symbol>
<symbol id="i-menu" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></symbol>
<symbol id="i-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></symbol>
<symbol id="i-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></symbol>
<symbol id="i-sparkle" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c.5 4.6 2.9 7 7.5 7.5-4.6.5-7 2.9-7.5 7.5-.5-4.6-2.9-7-7.5-7.5 4.6-.5 7-2.9 7.5-7.5zM19 15.5c.2 2 1.2 3 3.2 3.2-2 .2-3 1.2-3.2 3.2-.2-2-1.2-3-3.2-3.2 2-.2 3-1.2 3.2-3.2z"/></symbol>
<symbol id="i-book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6.5A2.5 2.5 0 0 0 4 21.5zM4 19.5A2.5 2.5 0 0 1 6.5 17H20"/></symbol>
<symbol id="i-user" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></symbol>
<symbol id="i-bot" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 4h6M9 13h.01M15 13h.01M9 17h6"/></symbol>
<symbol id="i-terminal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 17 6-6-6-6M12 19h8"/></symbol>
<symbol id="i-plug" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/></symbol>
<symbol id="i-file" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></symbol>
<symbol id="i-braces" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1"/></symbol>
<symbol id="i-list" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
<symbol id="i-windows" viewBox="0 0 24 24" fill="currentColor"><path d="M2.5 5.2 10.4 4v7.6H2.5zM11.6 3.8 21.5 2.4v9.2h-9.9zM2.5 12.6h7.9v7.6l-7.9-1.1zM11.6 12.6h9.9v9.2l-9.9-1.4z"/></symbol>
<symbol id="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></symbol>
<symbol id="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></symbol>
<symbol id="i-history" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/></symbol>
</defs></svg>`;

/* ------------------------------------------------------------------ head */
/**
 * <head> for generated pages. alternates: {en: path|null, uk: path|null} (real pages only).
 */
export function head({ path, lang, title, description, canonical = null, alternates = {}, robots = '', css = [], ogType = 'article', ogImage = lang === 'uk' ? 'assets/img/og-uk.jpg' : 'assets/img/og.jpg', theme = false, extra = '' }) {
  const root = rootOf(path);
  const t = T[lang];
  const can = absUrl(canonical || path);
  const alts = (alternates.en && alternates.uk)
    ? LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${absUrl(alternates[l])}">`).join('\n') + `\n<link rel="alternate" hreflang="x-default" href="${absUrl(alternates.en)}">`
    : '';
  const other = LANGS.find((l) => l !== lang);
  const init = `document.documentElement.classList.replace('no-js','js');try{var s=localStorage,d=document.documentElement;${theme ? "var th=s.getItem('kadr-theme');if(th)d.dataset.theme=th;" : ''}var w=s.getItem('kadr-lang'),r=document.referrer;if(w&&w!==d.lang&&!(r&&r.indexOf(location.origin)===0)&&!/[?&]stay\\b/.test(location.search)){var a=d.getAttribute('data-alt-'+w);if(a)location.replace(a+location.hash)}}catch(e){}`;
  return `<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${can}">
${alts}
${robots ? `<meta name="robots" content="${robots}">` : ''}
<meta name="theme-color" content="#07070a">
<meta name="color-scheme" content="${theme ? 'dark light' : 'dark'}">
<link rel="icon" href="${root}favicon.ico" sizes="48x48">
<link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="${root}apple-touch-icon.png">
<link rel="manifest" href="${root}site.webmanifest">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Kadr">
<meta property="og:locale" content="${t.locale}">
<meta property="og:locale:alternate" content="${T[other].locale}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${can}">
<meta property="og:image" content="${SITE_URL}${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${SITE_URL}${ogImage}">
${lang === 'uk' ? '' : `<link rel="preload" href="${root}assets/fonts/inter-var-latin.woff2" as="font" type="font/woff2" crossorigin>
`}<link rel="stylesheet" href="${root}assets/css/base.css">
${css.map((c) => `<link rel="stylesheet" href="${root}assets/css/${c}.css">`).join('\n')}
<script>${init}</script>
${extra}</head>`.replace(/\n{2,}/g, '\n');
}

/** Attributes for <html>: language + relative paths of this page in each language (for the switcher memory). */
export function htmlAttrs(lang, path, altHref) {
  const root = rootOf(path);
  return `lang="${lang}" class="no-js" ${LANGS.map((l) => `data-alt-${l}="${esc(root + (altHref[l] || ''))}"`).join(' ')}`;
}

/* ------------------------------------------------------------------ header / footer */
/**
 * Site header. variant "home" shows landing anchors, "docs" shows docs sections + search + theme.
 * altHref: {en, uk} site-root relative targets of the language switch.
 */
export function header({ path, lang, variant = 'docs', active = '', altHref = {} }) {
  const root = rootOf(path);
  const t = T[lang];
  const home = `${root}${langRoot(lang)}`;
  const homeHref = home === './' ? './' : home;
  const cur = (k) => (active === k ? ' aria-current="page"' : '');
  const links = variant === 'home'
    ? [['#features', t.nav.features], ['#api', t.nav.api], ['#captions', t.nav.captions], ['#ai-tools', t.nav.smart], [`${home}changelog.html`, t.nav.changelog, 'changelog']]
    : [[`${home}docs/guide/`, t.nav.guide, 'guide'], [`${home}docs/ai/`, t.nav.ai, 'ai'], [`${home}docs/ai/reference/`, t.nav.reference, 'reference'], [`${home}changelog.html`, t.nav.changelog, 'changelog']];
  const sw = LANGS.map((l) => `<a href="${esc(root + (altHref[l] ?? langRoot(l)))}" hreflang="${l}" lang="${l}" data-set-lang="${l}" title="${esc(T[l].name)}"${l === lang ? ' aria-current="true"' : ''}>${T[l].short}</a>`).join('');
  const docsTools = variant === 'docs'
    ? `<button class="nav-icon nav-search" type="button" data-search-open aria-label="${esc(t.nav.search)}"><svg aria-hidden="true"><use href="#i-search"/></svg><kbd class="nav-kbd">Ctrl K</kbd></button>
      <button class="nav-icon theme-toggle" type="button" id="theme-toggle" aria-label="${esc(t.nav.theme)}"><svg class="i-sun" aria-hidden="true"><use href="#i-sun"/></svg><svg class="i-moon" aria-hidden="true"><use href="#i-moon"/></svg></button>`
    : '';
  return `<header class="nav${variant === 'docs' ? ' is-solid' : ''}" id="nav">
  <div class="nav-inner">
    <a class="nav-logo" href="${homeHref}" aria-label="${esc(t.nav.home)}"><img src="${root}assets/img/logo.svg" alt="Kadr" width="118" height="28"></a>
    <nav class="nav-links" id="nav-links" aria-label="${esc(t.nav.main)}">
      <a class="nav-docs" href="${home}docs/"${cur('docs')}><svg aria-hidden="true"><use href="#i-book"/></svg><span>${esc(t.nav.docs)}</span></a>
      ${links.map(([h, label, k]) => `<a href="${h}"${k ? cur(k) : ''}>${esc(label)}</a>`).join('\n      ')}
    </nav>
    <div class="nav-right">
      ${docsTools}
      <div class="lang-switch" role="group" aria-label="${esc(t.nav.language)}" data-lang="${lang}">${sw}<span class="ls-thumb" aria-hidden="true"></span></div>
      <a class="nav-icon nav-gh" href="${REPO_URL}" aria-label="${esc(t.nav.github)}"><svg aria-hidden="true"><use href="#i-github"/></svg></a>
      <a class="btn btn-primary btn-sm nav-dl" href="${home}#download"><svg aria-hidden="true"><use href="#i-download"/></svg><span class="label-long">${esc(t.nav.download)}</span><span class="sr-only">${esc(t.nav.downloadLong)}</span></a>
      <button class="nav-burger" id="nav-burger" type="button" aria-label="${esc(t.nav.menu)}" aria-expanded="false" aria-controls="nav-links"><span></span></button>
    </div>
  </div>
</header>`;
}

/**
 * Footer. links: site-root relative targets resolved by the build
 * ({install, faq, mcp, guide, ai, reference, llms?}).
 */
export function footer({ path, lang, links = {} }) {
  const root = rootOf(path);
  const t = T[lang].footer;
  const home = `${root}${langRoot(lang)}`;
  const L = (p) => `${root}${p}`;
  const li = (href, label) => `<li><a href="${href}">${esc(label)}</a></li>`;
  const other = LANGS.map((l) => `<a href="${root}${langRoot(l) || './'}" hreflang="${l}" lang="${l}" data-set-lang="${l}"${l === lang ? ' aria-current="true"' : ''}>${esc(T[l].name)}</a>`).join('<span aria-hidden="true">·</span>');
  return `<footer class="footer">
  <div class="footer-glow" aria-hidden="true"></div>
  <div class="wrap-wide">
    <div class="footer-grid">
      <div class="footer-brand">
        <img src="${root}assets/img/logo.svg" alt="Kadr" width="118" height="28" loading="lazy">
        <p>${esc(t.tagline)}</p>
        <p class="footer-langs">${other}</p>
      </div>
      <div><h2>${esc(t.product)}</h2><ul>${li(`${home}#download`, t.download)}${li(`${home}#features`, t.features)}${li(`${home}changelog.html`, t.changelog)}${li(`${home}#requirements`, t.requirements)}</ul></div>
      <div><h2>${esc(t.docs)}</h2><ul>${li(L(links.guide || `${langRoot(lang)}docs/guide/index.html`), t.guide)}${li(L(links.ai || `${langRoot(lang)}docs/ai/index.html`), t.ai)}${li(L(links.reference || `${langRoot(lang)}docs/ai/reference/index.html`), t.reference)}${links.mcp ? li(L(links.mcp), t.mcp) : ''}${links.llms ? li(L(links.llms), t.llms) : ''}</ul></div>
      <div><h2>${esc(t.kadr)}</h2><ul>${links.faq ? li(L(links.faq), t.faq) : ''}${li(`${home}privacy.html`, t.privacy)}${li(`${home}licenses.html`, t.licenses)}${li(`${REPO_URL}/issues`, t.bug)}${li(REPO_URL, t.github)}</ul></div>
    </div>
    <div class="footer-bottom"><span>${esc(t.copy)}</span><span>${esc(t.notAffiliated)}</span></div>
  </div>
</footer>`;
}

/* ------------------------------------------------------------------ search modal */
export function searchModal(lang) {
  const t = T[lang].search;
  return `<div class="search-modal" id="search-modal" role="dialog" aria-modal="true" aria-label="${esc(t.label)}" hidden>
  <div class="search-box">
    <div class="search-input"><svg aria-hidden="true"><use href="#i-search"/></svg><input id="search-input" type="search" placeholder="${esc(t.placeholder)}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="search-results" aria-describedby="search-help"><kbd>Esc</kbd></div>
    <div class="search-results" id="search-results" role="listbox" aria-label="${esc(t.results)}"></div>
    <p class="search-help" id="search-help"><kbd>↑</kbd><kbd>↓</kbd> ${t.help}</p>
  </div>
</div>`;
}

/* ------------------------------------------------------------------ docs page */
/**
 * Full docs page with sidebar, TOC, pager and search.
 * opts: path, lang, title, description, body (HTML), sidebarHtml, toc [{id,text,level}], prev/next {title, href},
 *       crumbs [{title, href?}], alternates {en,uk} (real pages), altHref {en,uk} (switch targets),
 *       section, active, robots, canonical, links (footer), bodyClass, scripts [], eyebrow, notice
 */
export function docsPage(o) {
  const { path, lang, title, description, body, sidebarHtml = '', toc = [], prev = null, next = null, crumbs = [] } = o;
  const root = rootOf(path);
  const t = T[lang];
  const fullTitle = title === 'Kadr' ? title : `${title} — Kadr`;
  const tocHtml = toc.length
    ? `<aside class="docs-toc" aria-label="${esc(t.docs.onThisPage)}"><p class="side-title">${esc(t.docs.onThisPage)}</p><ul>${toc.map((x) => `<li class="lvl-${x.level}"><a href="#${esc(x.id)}">${esc(x.text)}</a></li>`).join('')}</ul><a class="toc-top" href="#top"><svg aria-hidden="true"><use href="#i-up"/></svg>${esc(t.docs.backToTop)}</a></aside>`
    : '<aside class="docs-toc" aria-hidden="true"></aside>';
  const pn = (prev || next)
    ? `<nav class="pager" aria-label="${esc(t.docs.prev)} / ${esc(t.docs.next)}">${prev ? `<a class="pager-prev" href="${root}${prev.href}" rel="prev"><span>${esc(t.docs.prev)}</span><b><svg aria-hidden="true"><use href="#i-arrow-l"/></svg>${esc(prev.title)}</b></a>` : '<span></span>'}${next ? `<a class="pager-next" href="${root}${next.href}" rel="next"><span>${esc(t.docs.next)}</span><b>${esc(next.title)}<svg aria-hidden="true"><use href="#i-arrow"/></svg></b></a>` : ''}</nav>`
    : '';
  const crumbHtml = crumbs.length
    ? `<nav class="crumbs" aria-label="Breadcrumb"><ol>${crumbs.map((c, i) => `<li>${c.href && i < crumbs.length - 1 ? `<a href="${root}${c.href}">${esc(c.title)}</a>` : `<span aria-current="page">${esc(c.title)}</span>`}</li>`).join('')}</ol></nav>`
    : '';
  const scripts = ['site', ...(o.scripts || []), 'docs'];
  return `<!doctype html>
<html ${htmlAttrs(lang, path, o.altHref || {})} data-section="${o.section || ''}">
${head({ path, lang, title: fullTitle, description, canonical: o.canonical, alternates: o.alternates || {}, robots: o.robots, css: ['docs'], theme: true })}
<body class="${o.bodyClass || 'docs'}" data-root="${root}" data-lang-root="${langRoot(lang)}" id="top">
<a class="skip-link" href="#content">${esc(t.skip)}</a>
${ICONS}
${header({ path, lang, variant: 'docs', active: o.active || o.section, altHref: o.altHref || {} })}
<div class="docs-shell wrap-wide">
  <div class="side-bar-mobile"><button class="side-toggle" type="button" id="side-toggle" aria-controls="docs-side" aria-expanded="false"><svg aria-hidden="true"><use href="#i-menu"/></svg>${esc(t.docs.menu)}</button>${crumbs.length > 1 ? `<span class="side-where">${esc(crumbs[crumbs.length - 1].title)}</span>` : ''}</div>
  ${sidebarHtml}
  <div class="side-scrim" id="side-scrim" hidden></div>
  <main class="docs-main" id="content">
    ${crumbHtml}
    ${o.notice ? `<div class="lang-notice" role="note"><svg aria-hidden="true"><use href="#i-sparkle"/></svg><p>${o.notice}</p></div>` : ''}
    <article class="prose"${o.articleLang ? ` lang="${o.articleLang}"` : ''}>
${body}
    </article>
    ${pn}
  </main>
  ${tocHtml}
</div>
${footer({ path, lang, links: o.links })}
${searchModal(lang)}
${scripts.map((s) => `<script src="${root}assets/js/${s}.js" defer></script>`).join('\n')}
</body>
</html>
`;
}

/**
 * Sidebar. sections: [{key, title, href}] for the doc-set switch; groups: [{title, items: [{title, href, count?, tag?}]}].
 */
export function sidebar({ path, lang, section, switcher = [], groups = [] }) {
  const root = rootOf(path);
  const t = T[lang];
  const item = (it) => {
    const cur = it.href === path;
    return `<li><a href="${root}${it.href}"${cur ? ' aria-current="page"' : ''}><span>${esc(it.title)}</span>${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ''}${it.count != null ? `<span class="count">${it.count}</span>` : ''}</a></li>`;
  };
  const sw = switcher.length
    ? `<div class="side-switch" role="group" aria-label="${esc(t.docs.title)}">${switcher.map((s) => `<a href="${root}${s.href}" class="ss-${s.key}"${s.key === section ? ' aria-current="true"' : ''}><svg aria-hidden="true"><use href="#${s.key === 'ai' ? 'i-bot' : 'i-user'}"/></svg>${esc(s.title)}</a>`).join('')}<span class="ss-thumb" aria-hidden="true"></span></div>`
    : '';
  return `<aside class="docs-side" id="docs-side" aria-label="${esc(t.docs.title)}">
  <div class="side-head">
    <button class="side-close" type="button" id="side-close" aria-label="${esc(t.docs.close)}"><svg aria-hidden="true"><use href="#i-x"/></svg></button>
    ${sw}
    <button class="search-trigger" type="button" data-search-open aria-label="${esc(t.nav.search)}"><svg aria-hidden="true"><use href="#i-search"/></svg><span>${esc(t.docs.searchDocs)}</span><kbd>/</kbd></button>
  </div>
  <nav class="side-nav" aria-label="${esc(t.docs.title)}">
    ${groups.filter((g) => g.items.length).map((g) => `<div class="side-group">${g.title ? `<p class="side-title">${esc(g.title)}</p>` : ''}<ul>${g.items.map(item).join('')}</ul></div>`).join('\n    ')}
  </nav>
</aside>`;
}

/* ------------------------------------------------------------------ redirects */
export function redirectPage(from, to, lang = 'en', ukTo = null) {
  const root = rootOf(from);
  const target = root + to;
  const ukTarget = ukTo ? root + ukTo : null;
  const t = T[lang].redirect;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${esc(t.title)} — Kadr</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${absUrl(to)}">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<script>var t=${JSON.stringify(target)};${ukTarget ? `try{if(localStorage.getItem('kadr-lang')==='uk')t=${JSON.stringify(ukTarget)}}catch(e){}` : ''}location.replace(t+location.hash)</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07070a;color:#a7a7b3;font:16px/1.6 system-ui,sans-serif}a{color:#1fd1db}</style>
</head>
<body><p>${esc(t.text)} <a href="${esc(target)}">${esc(absUrl(to))}</a></p></body>
</html>
`;
}
