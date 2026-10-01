// Turns a docs fragment into page HTML: placeholders, command links, highlighted
// code blocks and code tabs, scrollable tables, heading anchors, the table of
// contents and the plain text used by the search index. Node standard library only.
import { esc, unesc, slugify, codeBlock, codeTabs, langLabel, SITE_URL } from './layout.mjs';
import { T, langRoot } from './i18n.mjs';
import { commandUrl } from './content.mjs';

const stripTags = (s) => s.replace(/<[^>]+>/g, '');
export const plainText = (html) => unesc(stripTags(html)).replace(/\s+/g, ' ').trim();

/** Reads lang / label of a <pre ...><code ...> pair. */
function preInfo(preAttrs = '', codeAttrs = '') {
  const attr = (s, n) => { const m = s.match(new RegExp(`\\b${n}="([^"]*)"`)); return m ? m[1] : ''; };
  let lang = attr(preAttrs, 'data-lang');
  if (!lang) { const m = codeAttrs.match(/class="[^"]*\b(?:lang|language)-([\w+-]+)/) || preAttrs.match(/class="[^"]*\b(?:lang|language)-([\w+-]+)/); if (m) lang = m[1]; }
  const label = attr(preAttrs, 'data-label') || attr(preAttrs, 'data-title') || attr(preAttrs, 'title');
  return { lang: (lang || 'text').toLowerCase(), label: unesc(label) };
}
const rawCode = (inner) => unesc(stripTags(inner)).replace(/^\r?\n/, '').replace(/\s+$/, '');

/**
 * ctx: { lang, root, cmds: {byName,total}, errors: [], src }
 * returns { body, toc, h1 (inner html or null), sections: [{id, t, x}], words }
 */
export function transformFragment(body, ctx) {
  const { lang, root, cmds, errors, src } = ctx;
  const total = cmds.total;
  // placeholders
  body = body
    .replace(/\{\{\s*root\s*\}\}/g, root)
    .replace(/\{\{\s*lang_root\s*\}\}/g, langRoot(lang))
    .replace(/\{\{\s*commands\s*\}\}/g, String(total))
    .replace(/\{\{\s*tools\s*\}\}/g, String(total + 1));
  // {{doc:faq}} → link to a well-known docs page whose slug the content teams chose
  body = body.replace(/\{\{\s*doc:([a-z-]+)\s*\}\}/g, (m, key) => {
    const target = ctx.resolveDoc && ctx.resolveDoc(key, lang);
    if (!target) { errors.push(`${src}: unknown {{doc:${key}}}`); return `${root}${langRoot(lang)}docs/index.html`; }
    return root + target;
  });
  if (/\{\{[^}]*\}\}/.test(body)) errors.push(`${src}: unknown placeholder ${body.match(/\{\{[^}]*\}\}/)[0]}`);
  // command references: <code class="cmd">timeline.get</code>
  body = body.replace(/<code class="cmd">([\s\S]*?)<\/code>/g, (m, raw) => {
    const name = unesc(stripTags(raw)).trim();
    const c = cmds.byName.get(name);
    if (!c) { errors.push(`${src}: unknown command "${name}"`); return `<code>${raw}</code>`; }
    return `<a class="cmd-link" href="${root}${commandUrl(c, lang)}"><code>${esc(name)}</code></a>`;
  });

  // code tabs
  body = body.replace(/<div class="code-tabs"[^>]*>([\s\S]*?)<\/div>/g, (m, inner) => {
    const tabs = [];
    inner.replace(/<pre([^>]*)>\s*(?:<code([^>]*)>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/g, (mm, pa, ca, code) => {
      const { lang: l, label } = preInfo(pa, ca);
      const key = l === 'cli' ? 'kadrctl' : l;
      tabs.push({ key, label: label || langLabel(l), html: codeBlock(rawCode(code), l, { l: lang }) });
      return '';
    });
    if (!tabs.length) { errors.push(`${src}: empty code-tabs block`); return ''; }
    return codeTabs(tabs, lang);
  });

  // remaining code blocks (skip ones already rendered)
  body = body.replace(/<pre(?![^>]*class="code)([^>]*)>\s*(?:<code([^>]*)>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/g, (m, pa, ca, code) => {
    const { lang: l, label } = preInfo(pa, ca);
    return codeBlock(rawCode(code), l, { label, l: lang });
  });

  // tables scroll on small screens
  body = body.replace(/<table\b([^>]*)>/g, '<div class="table-scroll"><table$1>').replace(/<\/table>/g, '</table></div>');
  body = body.replace(/<div class="table-scroll"><div class="table-scroll">/g, '<div class="table-scroll">').replace(/<\/table><\/div><\/div>/g, '</table></div>');

  // external links open normally but are marked
  body = body.replace(/<a href="(https?:\/\/[^"]+)"(?![^>]*\bclass=)/g, (m, href) => (href.startsWith(SITE_URL) ? m : `<a class="ext" rel="noopener" href="${href}"`));

  // images: lazy + async decoding by default
  body = body.replace(/<img\b(?![^>]*\bloading=)/g, '<img loading="lazy"').replace(/<img\b(?![^>]*\bdecoding=)/g, '<img decoding="async"');

  // first h1 is lifted into the page head
  let h1 = null;
  body = body.replace(/^\s*<h1[^>]*>([\s\S]*?)<\/h1>\s*/, (m, inner) => { h1 = inner.trim(); return ''; });

  // headings: ids, anchors, toc
  const toc = [];
  const used = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const t = T[lang] || T.en;
  body = body.replace(/<h([23])([^>]*)>([\s\S]*?)<\/h\1>/g, (m, lvl, attrs, inner) => {
    let id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    if (!id) {
      let base = slugify(plainText(inner)) || `section-${toc.length + 1}`;
      id = base; let n = 2;
      while (used.has(id)) id = `${base}-${n++}`;
      used.add(id);
      attrs = `${attrs} id="${id}"`;
    }
    toc.push({ id, text: plainText(inner), level: Number(lvl) });
    return `<h${lvl}${attrs}>${inner}<a class="anchor" href="#${id}" aria-label="${esc(t.docs.linkTo)}"><svg aria-hidden="true"><use href="#i-link"/></svg></a></h${lvl}>`;
  });

  // search sections (code blocks excluded) + reading time
  const noCode = body.replace(/<pre[\s\S]*?<\/pre>/g, ' ').replace(/<button[\s\S]*?<\/button>/g, ' ').replace(/<span class="code-label">[\s\S]*?<\/span>/g, ' ');
  const sections = [];
  const parts = noCode.split(/(?=<h[23][^>]*\bid=")/);
  for (const part of parts) {
    const hm = part.match(/^<h[23][^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h[23]>/);
    const text = plainText(hm ? part.slice(hm[0].length) : part);
    if (hm) sections.push({ id: hm[1], t: plainText(hm[2]), x: text.slice(0, 420) });
    else if (text) sections.push({ id: '', t: '', x: text.slice(0, 420) });
  }
  const words = plainText(noCode).split(/\s+/).length;
  return { body, toc, h1, sections, words };
}
