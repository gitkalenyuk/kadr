#!/usr/bin/env node
// Command reference of the Kadr site, generated from the command registry export
// docs/openapi.json (the same data as docs/commands.md):
//
//   docs/ai/reference/index.html         overview + filterable list of all commands
//   docs/ai/reference/<category>.html    one page per category, one article per command
//   uk/docs/ai/reference/...             the same with Ukrainian page chrome; command
//                                        descriptions stay English (what agents see)
//
// This module returns page descriptors; build.mjs renders them inside the AI docs
// layout. Running it directly runs the whole build:  node site/tools/gen-reference.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, codeBlock, codeTabs } from './lib/layout.mjs';
import { T, catName, langRoot } from './lib/i18n.mjs';
import { commandUrl } from './lib/content.mjs';

/** Escape text and turn known command names into reference links. */
export function linkify(text, byName, root, lang, selfName = '') {
  return esc(text).replace(/\b([a-z]+(?:\.[a-z_]+)+)\b/g, (m) => {
    const c = byName.get(m);
    if (!c || m === selfName) return c ? `<code>${m}</code>` : m;
    return `<a class="cmd-link" href="${root}${commandUrl(c, lang)}"><code>${m}</code></a>`;
  });
}

function fmtTime(us) {
  if (typeof us !== 'number' || !Number.isInteger(us) || us % 1000 !== 0) return String(us);
  return `${us / 1e6}s`;
}
function shQuote(v) {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return /^[A-Za-z0-9_.:,\/#+-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}
export function exampleVariants(cmd, args) {
  const json = JSON.stringify(args);
  const curl = `curl -X POST http://127.0.0.1:7777/api/v1/commands/${cmd.name} \\\n  -H "Authorization: Bearer $KADR_TOKEN" \\\n  -d '${json}'`;
  const flags = Object.entries(args).map(([k, v]) => {
    if (v === true) return `--${k}`;
    if (k.endsWith('_us') && typeof v === 'number') return `--${k} ${fmtTime(v)}`;
    return `--${k} ${shQuote(v)}`;
  });
  const cli = `kadrctl run ${cmd.name}${flags.length ? ' ' + flags.join(' ') : ''}`;
  const mcp = `// MCP tool: ${cmd.mcp}\n${JSON.stringify(args, null, 2)}`;
  return { curl, cli, mcp };
}

function paramRow(p, byName, root, lang) {
  const r = T[lang].ref;
  const bits = [];
  if (p.enum) bits.push(`<span class="p-enum">${esc(r.oneOf)} ${p.enum.map((e) => `<code>${esc(e)}</code>`).join(' ')}</span>`);
  if (p.default !== undefined) bits.push(`<span class="p-def">${esc(r.def)} <code>${esc(JSON.stringify(p.default))}</code></span>`);
  if (p.minimum !== undefined || p.maximum !== undefined) bits.push(`<span class="p-range">${esc(r.range)} <code>${p.minimum ?? '−∞'} … ${p.maximum ?? '∞'}</code></span>`);
  // some specs repeat "One of:" / "Default:" in the description; the meta line shows them
  const d = p.description.replace(/\s*One of: [^.]*\.\s*$/, '').replace(/\s*Default: `[^`]*`\.?\s*$/, '');
  return `<tr><td><code class="p-name">${esc(p.name)}</code>${p.required ? `<span class="p-req">${esc(r.required)}</span>` : ''}</td><td><span class="p-type">${esc(p.type)}</span></td><td><span lang="en">${linkify(d, byName, root, lang)}</span>${bits.length ? `<div class="p-meta">${bits.join('')}</div>` : ''}</td></tr>`;
}

function commandArticle(cmd, byName, root, lang) {
  const r = T[lang].ref;
  const badges = [];
  if (cmd.hotkey) badges.push(`<span class="badge b-key" title="${esc(r.hotkey)}">${cmd.hotkey.split('+').map((k) => `<kbd>${esc(k)}</kbd>`).join('+')}</span>`);
  badges.push(cmd.undoable ? `<span class="badge b-undo" title="${esc(r.undoableTip)}">${esc(r.undoable)}</span>` : `<span class="badge b-ro" title="${esc(r.noUndoTip)}">${esc(r.noUndo)}</span>`);
  if (cmd.ui) badges.push(`<span class="badge b-ui" title="${esc(r.uiTip)}" lang="en">${esc(cmd.ui.replace(/\//g, ' › '))}</span>`);
  badges.push(`<span class="badge b-mcp" title="${esc(r.mcpTip)}">MCP <code>${esc(cmd.mcp)}</code></span>`);
  const desc = cmd.description.split('\n').map((p) => `<p>${linkify(p, byName, root, lang, cmd.name)}</p>`).join('');
  const params = cmd.params.length
    ? `<div class="table-scroll"><table class="params"><thead><tr><th scope="col">${esc(r.thParam)}</th><th scope="col">${esc(r.thType)}</th><th scope="col">${esc(r.thDesc)}</th></tr></thead><tbody>${cmd.params.map((p) => paramRow(p, byName, root, lang)).join('')}</tbody></table></div>`
    : `<p class="muted">${esc(r.noParams)}</p>`;
  const examples = cmd.examples.map((ex) => {
    const v = exampleVariants(cmd, ex.value);
    return `<div class="example">${ex.summary ? `<p class="ex-title" lang="en">${esc(ex.summary)}</p>` : ''}${codeTabs([
      { key: 'curl', label: 'curl', html: codeBlock(v.curl, 'bash', { l: lang }) },
      { key: 'kadrctl', label: 'kadrctl', html: codeBlock(v.cli, 'bash', { l: lang }) },
      { key: 'mcp', label: 'MCP', html: codeBlock(v.mcp, 'json', { l: lang }) },
    ], lang)}</div>`;
  }).join('');
  return `<article class="cmd" id="${esc(cmd.name)}">
  <header class="cmd-head">
    <h2><a class="cmd-name" href="#${esc(cmd.name)}">${esc(cmd.name)}</a></h2>
    <p class="cmd-title" lang="en">${esc(cmd.title)}</p>
    <div class="cmd-badges">${badges.join('')}</div>
  </header>
  <div class="cmd-desc" lang="en">${desc}</div>
  <h3>${esc(r.params)}</h3>
  ${params}
  ${cmd.returns ? `<h3>${esc(r.returns)}</h3><p class="returns" lang="en">${linkify(cmd.returns, byName, root, lang)}</p>` : ''}
  ${examples ? `<h3>${esc(r.examples)}</h3>${examples}` : ''}
</article>`;
}

/**
 * Page descriptors of the reference for one language.
 * links: site-root relative targets of the REST / MCP / CLI pages (or null).
 * returns [{ path, title, description, body, toc, crumbs, bodyClass, nav, search }]
 */
export function referencePages(cmds, lang, links = {}) {
  const { categories, byName, total } = cmds;
  const r = T[lang].ref;
  const base = `${langRoot(lang)}docs/ai/reference/`;
  const rootFor = (p) => '../'.repeat(p.split('/').length - 1);
  const note = r.englishNote ? `<div class="callout note"><p>${esc(r.englishNote)}</p></div>` : '';
  const pages = [];

  // ---- overview
  {
    const p = `${base}index.html`;
    const root = rootFor(p);
    const c = (name) => { const x = byName.get(name); return x ? `<a class="cmd-link" href="${root}${commandUrl(x, lang)}"><code>${name}</code></a>` : `<code>${name}</code>`; };
    const L = (k) => (links[k] ? root + links[k] : '');
    const cards = categories.map((cat, i) => `<a class="cat-card" href="${root}${base}${cat.slug}.html" style="--i:${i}"><span class="cat-name">${esc(catName(lang, cat.name))}</span><span class="cat-count">${cat.commands.length}</span><span class="cat-cmds">${cat.commands.slice(0, 4).map((x) => esc(x.name)).join(' · ')}${cat.commands.length > 4 ? ' …' : ''}</span></a>`).join('');
    const rows = categories.flatMap((cat) => cat.commands.map((x) => `<tr data-q="${esc(`${x.name} ${x.title} ${cat.name} ${catName(lang, cat.name)} ${x.mcp}`.toLowerCase())}"><td><a href="${root}${commandUrl(x, lang)}"><code>${esc(x.name)}</code></a></td><td lang="en">${esc(x.title)}</td><td><a class="muted" href="${root}${base}${cat.slug}.html">${esc(catName(lang, cat.name))}</a></td></tr>`)).join('');
    const body = `<p class="lead">${r.lead(total)}</p>
${note}
<h2 id="calling">${esc(r.calling)}</h2>
<ul>${r.callingItems(root, { rest: L('rest'), mcp: L('mcp'), cli: L('cli') }).map((x) => `<li>${x}</li>`).join('')}</ul>
<h2 id="conventions">${esc(r.conventions)}</h2>
<ul>${r.conventionItems(c).map((x) => `<li>${x}</li>`).join('')}</ul>
<h2 id="categories">${esc(r.categories)}</h2>
<div class="cat-grid">${cards}</div>
<h2 id="all-commands">${esc(r.allCommands)}</h2>
<div class="filter-box"><label class="sr-only" for="cmd-filter">${esc(r.filterLabel)}</label><svg aria-hidden="true"><use href="#i-search"/></svg><input id="cmd-filter" type="search" placeholder="${esc(r.filter(total))}" autocomplete="off" spellcheck="false" data-count-one="${esc(r.count(1).replace(/^1 /, ''))}"><span class="filter-count" id="cmd-filter-count" aria-live="polite">${esc(r.count(total))}</span></div>
<div class="table-scroll"><table class="all-cmds" id="all-cmds"><thead><tr><th scope="col">${esc(r.thCommand)}</th><th scope="col">${esc(r.thTitle)}</th><th scope="col">${esc(r.thCategory)}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    pages.push({
      path: p, slug: 'reference/index', title: r.title, nav: r.all, description: r.description(total), body,
      toc: [{ id: 'calling', text: r.calling, level: 2 }, { id: 'conventions', text: r.conventions, level: 2 }, { id: 'categories', text: r.categories, level: 2 }, { id: 'all-commands', text: r.allCommands, level: 2 }],
      count: total, bodyClass: 'docs ref ref-index',
    });
  }

  // ---- category pages
  for (const cat of categories) {
    const p = `${base}${cat.slug}.html`;
    const root = rootFor(p);
    const name = catName(lang, cat.name);
    const body = `<p class="lead">${r.catLead(cat.commands.length, esc(name))}</p>
${note}
<ul class="cmd-index">${cat.commands.map((x) => `<li><a href="#${esc(x.name)}"><code>${esc(x.name)}</code><span lang="en">${esc(x.title)}</span></a></li>`).join('')}</ul>
${cat.commands.map((x) => commandArticle(x, byName, root, lang)).join('\n')}`;
    pages.push({
      path: p, slug: `reference/${cat.slug}`, title: r.catTitle(name), nav: name, count: cat.commands.length,
      description: r.catDescription(name, cat.commands.map((x) => x.name).join(', ')).slice(0, 300),
      body, toc: cat.commands.map((x) => ({ id: x.name, text: x.name, level: 2 })), bodyClass: 'docs ref',
    });
  }
  return pages;
}

// Run directly, it runs the whole build (in a child process: build.mjs imports this module).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), 'build.mjs')], { stdio: 'inherit' });
  process.exitCode = r.status ?? 1;
}
