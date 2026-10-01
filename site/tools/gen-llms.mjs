#!/usr/bin/env node
// Generates the machine-readable files for LLMs (https://llmstxt.org):
//
//   site/llms.txt       — index: title, summary, key facts, links to every English
//                         AI docs page + the command reference + openapi.json
//   site/llms-full.txt  — every English AI docs page as clean Markdown, followed by
//                         the full specification of every command (name, MCP tool,
//                         description, parameters with types/units/defaults/enums,
//                         returns, examples), generated from docs/openapi.json
//
// Sources: site/tools/docs-src/ai/en/*.html (fragments, see docs/design/site-v2.md)
//          docs/openapi.json
// Usage:   node site/tools/gen-llms.mjs     (any working directory; build.mjs runs it too)
// Node standard library only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(TOOLS, '..');
const REPO = path.resolve(SITE, '..');
export const SITE_URL = 'https://gitkalenyuk.github.io/kadr/';

/* ------------------------------------------------------------------ HTML → tree */
const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rarr: '→', larr: '←', times: '×', middot: '·' };
export function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] ?? m;
  });
}

function parse(html) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+|<)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) { // close tag
      const tag = m[1].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
    } else if (m[2]) { // open tag
      const tag = m[2].toLowerCase();
      const attrs = {};
      for (const a of m[3].matchAll(/([^\s=>/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[3] ?? a[4] ?? a[5] ?? '');
      const node = { tag, attrs, children: [] };
      top.children.push(node);
      if (!VOID.has(tag) && !m[4]) stack.push(node);
    } else {
      top.children.push({ tag: '#text', text: decode(m[5]) });
    }
  }
  return root;
}
const cls = (n) => (n.attrs?.class || '').split(/\s+/);
const textOf = (n) => (n.tag === '#text' ? n.text : (n.children || []).map(textOf).join(''));

/* ------------------------------------------------------------------ tree → Markdown */
const BLOCK = new Set(['p', 'div', 'ul', 'ol', 'li', 'pre', 'table', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figure', 'hr', 'dl', 'section', 'header', 'footer']);
const LANG_MD = { kadrctl: 'powershell', cli: 'powershell', mcp: 'json', curl: 'bash', cmd: 'bat', powershell: 'powershell', bash: 'bash', json: 'json', js: 'js', text: 'text', markdown: 'markdown', toml: 'toml' };
const TAB_LABEL = { kadrctl: 'kadrctl (PowerShell)', mcp: 'MCP tool call (tools/call params)', curl: 'curl', cmd: 'Command Prompt', powershell: 'PowerShell', bash: 'bash', cursor: 'Cursor', vscode: 'VS Code', windsurf: 'Windsurf', codex: 'Codex CLI', gemini: 'Gemini CLI' };

function href(h, base) {
  if (!h) return '';
  let u = h.replace(/\{\{\s*root\s*\}\}/g, SITE_URL).replace(/\{\{\s*lang_root\s*\}\}/g, '');
  if (u.startsWith('#')) return base ? base + u : '';
  return u;
}

function inline(nodes, ctx) {
  let out = '';
  for (const n of nodes) {
    if (n.tag === '#text') { out += n.text.replace(/\s+/g, ' '); continue; }
    const kids = () => inline(n.children, ctx);
    switch (n.tag) {
      case 'strong': case 'b': { const t = kids().trim(); out += t ? `**${t}**` : ''; break; }
      case 'em': case 'i': { const t = kids().trim(); out += t ? `*${t}*` : ''; break; }
      case 'code': case 'kbd': { const t = textOf(n).replace(/\s+/g, ' '); const tick = t.includes('`') ? '``' : '`'; out += `${tick}${tick.length > 1 ? ' ' : ''}${t}${tick.length > 1 ? ' ' : ''}${tick}`; break; }
      case 'a': { const t = kids().trim(); const u = href(n.attrs.href, ctx.url); out += u ? `[${t}](${u})` : t; break; }
      case 'br': out += '\n'; break;
      case 'img': out += `![${n.attrs.alt || ''}](${href(n.attrs.src)})`; break;
      default: out += kids();
    }
  }
  return out;
}

function fence(code, lang) {
  const ticks = code.includes('```') ? '````' : '```';
  return `${ticks}${lang || ''}\n${code.replace(/\s+$/, '')}\n${ticks}`;
}
function preLang(pre) {
  const codeEl = pre.children.find((c) => c.tag === 'code');
  const dl = pre.attrs['data-lang'];
  if (dl) return dl.toLowerCase();
  const m = (codeEl?.attrs?.class || pre.attrs.class || '').match(/\b(?:lang|language)-([\w+-]+)/);
  return m ? m[1].toLowerCase() : 'text';
}
const preCode = (pre) => textOf(pre).replace(/^\r?\n/, '');

function table(n, ctx) {
  const rows = [];
  const walk = (x) => { for (const c of x.children || []) { if (c.tag === 'tr') rows.push(c); else if (c.tag !== '#text') walk(c); } };
  walk(n);
  if (!rows.length) return '';
  const cells = rows.map((r) => r.children.filter((c) => c.tag === 'td' || c.tag === 'th').map((c) => inline(c.children, ctx).replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()));
  const width = Math.max(...cells.map((r) => r.length));
  const pad = (r) => [...r, ...Array(width - r.length).fill('')];
  const head = pad(cells[0]);
  const lines = [`| ${head.join(' | ')} |`, `|${head.map(() => ' --- ').join('|')}|`];
  for (const r of cells.slice(1)) lines.push(`| ${pad(r).join(' | ')} |`);
  return lines.join('\n');
}

function blocks(nodes, ctx, depth = 0) {
  const out = [];
  let buf = [];
  const flush = () => { const t = inline(buf, ctx).replace(/[ \t]+\n/g, '\n').trim(); if (t) out.push(t); buf = []; };
  for (const n of nodes) {
    if (n.tag === '#text' || !BLOCK.has(n.tag)) { buf.push(n); continue; }
    flush();
    const c = cls(n);
    switch (n.tag) {
      case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': {
        const lvl = Math.min(6, Number(n.tag[1]) + (ctx.shift || 0));
        out.push(`${'#'.repeat(lvl)} ${inline(n.children, ctx).trim()}`);
        break;
      }
      case 'p': { const t = inline(n.children, ctx).trim(); if (t) out.push(t); break; }
      case 'pre': out.push(fence(preCode(n), LANG_MD[preLang(n)] ?? preLang(n))); break;
      case 'table': out.push(table(n, ctx)); break;
      case 'blockquote': out.push(blocks(n.children, ctx, depth).split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')); break;
      case 'hr': out.push('---'); break;
      case 'ul': case 'ol': {
        if (n.tag === 'ol' && c.includes('steps') && n.children.some((li) => li.tag === 'li' && li.children.some((x) => /^h[2-6]$/.test(x.tag)))) {
          // numbered step sections: "### 1. Title" followed by the step body, not indented
          let k = 1;
          for (const li of n.children.filter((x) => x.tag === 'li')) {
            const h = li.children.find((x) => /^h[2-6]$/.test(x.tag));
            const rest = li.children.filter((x) => x !== h);
            const lvl = Math.min(6, (h ? Number(h.tag[1]) : 3) + (ctx.shift || 0));
            out.push(`${'#'.repeat(lvl)} ${k++}. ${h ? inline(h.children, ctx).trim() : ''}`.trim());
            const body = blocks(rest, ctx, depth);
            if (body) out.push(body);
          }
          break;
        }
        let i = 1;
        const items = [];
        for (const li of n.children.filter((x) => x.tag === 'li')) {
          const mark = n.tag === 'ol' ? `${i++}.` : '-';
          const body = blocks(li.children, ctx, depth + 1).split('\n');
          const indent = ' '.repeat(mark.length + 1);
          items.push(`${mark} ${body[0]}${body.slice(1).map((l) => (l ? `\n${indent}${l}` : '\n')).join('')}`);
        }
        out.push(items.join('\n'));
        break;
      }
      case 'li': out.push(blocks(n.children, ctx, depth)); break;
      case 'figure': {
        const img = n.children.find((x) => x.tag === 'img');
        const cap = n.children.find((x) => x.tag === 'figcaption');
        if (img) out.push(`![${img.attrs.alt || ''}](${href(img.attrs.src)})${cap ? `\n*${inline(cap.children, ctx).trim()}*` : ''}`);
        break;
      }
      case 'div': {
        if (c.includes('code-tabs')) {
          for (const pre of n.children.filter((x) => x.tag === 'pre')) {
            const l = preLang(pre);
            out.push(`**${TAB_LABEL[l] || l}:**\n\n${fence(preCode(pre), LANG_MD[l] ?? l)}`);
          }
        } else if (c.includes('callout')) {
          const label = c.includes('warn') ? 'Warning' : c.includes('tip') ? 'Tip' : 'Note';
          const body = blocks(n.children, ctx, depth);
          out.push(`> **${label}:** ${body.split('\n').join('\n> ')}`);
        } else if (c.includes('cards')) {
          const items = n.children.filter((x) => x.tag === 'a' || x.tag === 'div').map((card) => {
            const title = card.children.find((x) => x.tag === 'b' || x.tag === 'strong');
            const rest = card.children.filter((x) => x !== title);
            const t = title ? inline(title.children, ctx).trim() : '';
            const d = inline(rest, ctx).replace(/\s+/g, ' ').trim();
            const u = href(card.attrs.href);
            return `- ${u ? `[${t}](${u})` : `**${t}**`}${d ? `: ${d}` : ''}`;
          });
          out.push(items.join('\n'));
        } else {
          out.push(blocks(n.children, ctx, depth));
        }
        break;
      }
      default: out.push(blocks(n.children, ctx, depth));
    }
  }
  flush();
  return out.filter((x) => x && x.trim()).join('\n\n');
}

/** Converts a docs fragment body (HTML) to Markdown. */
export function htmlToMarkdown(html, { url = '', shift = 0 } = {}) {
  return blocks(parse(html).children, { url, shift }).replace(/\n{3,}/g, '\n\n').trim();
}

/* ------------------------------------------------------------------ sources */
function loadPages(dir) {
  if (!fs.existsSync(dir)) return [];
  const pages = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html') && !x.startsWith('_')).sort()) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8').replace(/^\uFEFF/, '');
    const m = src.match(/^\s*<!--meta\s+([\s\S]*?)\s*-->\s*/);
    let meta = {};
    if (m) { try { meta = JSON.parse(m[1]); } catch { /* keep defaults */ } }
    const slug = f.replace(/\.html$/, '');
    pages.push({
      slug, body: m ? src.slice(m[0].length) : src,
      title: meta.title || slug, nav: meta.nav || meta.title || slug, description: meta.description || meta.summary || '',
      group: meta.group || '', order: Number.isFinite(Number(meta.order)) ? Number(meta.order) : 100,
      url: `${SITE_URL}docs/ai/${slug}.html`,
    });
  }
  return pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function loadCommands(file) {
  const api = JSON.parse(fs.readFileSync(file, 'utf8'));
  const tagOrder = (api.tags || []).map((t) => t.name);
  const cats = new Map();
  for (const [p, item] of Object.entries(api.paths)) {
    if (!p.startsWith('/api/v1/commands/')) continue;
    const op = item.post;
    const desc = [];
    let ui = '', hotkey = '', undoable = false, returns = '';
    for (const line of (op.description || '').split('\n')) {
      if (line.startsWith('UI: ')) { const [u, h] = line.slice(4).split(' Hotkey: '); ui = u.replace(/\.$/, ''); if (h) hotkey = h.replace(/\.$/, ''); }
      else if (/^Hotkey: /.test(line)) hotkey = line.slice(8).replace(/\.$/, '');
      else if (/^Undoable with edit\.undo\.?$/.test(line)) undoable = true;
      else if (line.startsWith('Returns: ')) returns = line.slice(9);
      else if (line.trim()) desc.push(line);
    }
    const body = op.requestBody?.content?.['application/json'];
    const schema = body?.schema || { properties: {} };
    const required = new Set(schema.required || []);
    const params = Object.entries(schema.properties || {}).map(([name, s]) => {
      let d = s.description || '';
      let unit = '';
      const um = d.match(/\s*Unit: ([^.]+)\.\s*$/);
      if (um) { unit = um[1]; d = d.slice(0, um.index).trim(); }
      return { name, type: s.type === 'array' && s.items?.type ? `${s.items.type}[]` : (s.type || 'any'), required: required.has(name), description: d, unit, enum: s.enum, default: s.default, minimum: s.minimum, maximum: s.maximum };
    }).sort((a, b) => b.required - a.required);
    const examples = Object.values(body?.examples || {}).map((e) => ({ summary: e.summary || '', value: e.value || {} }));
    const category = op.tags?.[0] || 'Other';
    if (!cats.has(category)) cats.set(category, []);
    cats.get(category).push({
      name: op.operationId, title: op.summary || op.operationId, category, description: desc.join('\n'), ui, hotkey, undoable, returns, params, examples,
    });
  }
  const categories = [...cats.entries()].map(([name, commands]) => ({ name, slug: slugify(name), commands: commands.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => { const ia = tagOrder.indexOf(a.name), ib = tagOrder.indexOf(b.name); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.name.localeCompare(b.name); });
  return { version: api.info?.version || '', categories, total: categories.reduce((n, c) => n + c.commands.length, 0) };
}

/* ------------------------------------------------------------------ command spec → Markdown */
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
function range(p) {
  const bits = [];
  if (p.enum) bits.push(p.enum.map((v) => `\`${v}\``).join(', '));
  if (p.minimum !== undefined || p.maximum !== undefined) bits.push(`${p.minimum ?? '−∞'} … ${p.maximum ?? '∞'}`);
  return bits.join('; ');
}
function commandMarkdown(c) {
  const lines = [`### ${c.name}`, ''];
  const facts = [`**${c.title}**`, `MCP tool \`${c.name.replace(/\./g, '_')}\``, `\`POST /api/v1/commands/${c.name}\``];
  if (c.undoable) facts.push('undoable');
  if (c.hotkey) facts.push(`hotkey ${c.hotkey}`);
  if (c.ui) facts.push(`UI: ${c.ui}`);
  lines.push(facts.join(' · '), '', c.description, '');
  if (c.params.length) {
    lines.push('| Parameter | Type | Required | Default | Allowed values / range | Description |', '| --- | --- | --- | --- | --- | --- |');
    for (const p of c.params) {
      const type = p.unit ? `${p.type} (${p.unit})` : p.type;
      lines.push(`| \`${p.name}\` | ${type} | ${p.required ? 'yes' : 'no'} | ${p.default !== undefined ? `\`${JSON.stringify(p.default)}\`` : ''} | ${cell(range(p))} | ${cell(p.description)} |`);
    }
    lines.push('');
  } else {
    lines.push('No parameters.', '');
  }
  if (c.returns) lines.push(`**Returns:** ${c.returns}`, '');
  for (const e of c.examples) lines.push(`Example${e.summary ? ` — ${e.summary}` : ''}:`, '', '```json', JSON.stringify(e.value), '```', '');
  return lines.join('\n').trim();
}

/* ------------------------------------------------------------------ outputs */
const SUMMARY = (total) => `Kadr is a free, offline CapCut-style desktop video editor in which every action is a documented command. AI agents drive it through MCP (\`kadr-mcp\`), a local REST API (\`http://127.0.0.1:7777/api/v1\`) or the \`kadrctl\` CLI — ${total} commands with parameters, units and examples — while a human watches the edits live in the editor.`;
const FACTS = [
  'Times are integer microseconds (1 s = 1000000); time parameters end in `_us`. `kadrctl` also accepts `2.5s`, `1500ms`, `00:01:02.5`.',
  'MCP tool names are command names with dots replaced by underscores (`timeline.segment.split` → `timeline_segment_split`); `kadr_batch` runs several project commands as one atomic, undoable step (`dry_run` supported).',
  'REST: `POST /api/v1/commands/{name}` with a JSON object of arguments and `Authorization: Bearer <token>` (token file `%APPDATA%\\Kadr\\api-token`). Responses: `{"ok": true, "result": …}` or `{"ok": false, "error": {"code", "message", "hint", "field"}}`; `not_available` (HTTP 503) means a local component is missing.',
  'Model: project (`prj_…`) → tracks (`trk_…`, compositing order, one magnetic `main_video` track) → segments (`seg_…`, timeline range + source range) → materials (`mat_…`). Transitions live on the left clip; keyframe times are relative to the segment; positions are canvas fractions with +Y down; `volume_db` is dB but `volume` keyframes are linear.',
  'Work loop: read state (`timeline_get`), batch related edits, look at `preview_frame` / `preview_contact_sheet` (returned as images over MCP), follow error hints, poll long jobs (`captions_status` with `wait_s`, `export_status`).',
];

export function generate({ site = SITE, repo = REPO, now = new Date() } = {}) {
  const pages = loadPages(path.join(site, 'tools', 'docs-src', 'ai', 'en'));
  const cmds = loadCommands(path.join(repo, 'docs', 'openapi.json'));
  const groupsOrder = [];
  const groups = new Map();
  for (const p of pages) {
    const g = p.slug === 'index' ? 'Start' : (p.group || 'Docs');
    if (!groups.has(g)) { groups.set(g, []); groupsOrder.push(g); }
    groups.get(g).push(p);
  }

  /* llms.txt */
  const L = [`# Kadr`, '', `> ${SUMMARY(cmds.total)}`, '', 'Key facts for agents:', '', ...FACTS.map((f) => `- ${f}`), ''];
  const REF = 'Command reference';
  for (const g of groupsOrder.filter((x) => x !== REF)) {
    L.push(`## ${g}`, '');
    for (const p of groups.get(g)) L.push(`- [${p.title}](${p.url})${p.description ? `: ${p.description}` : ''}`);
    L.push('');
  }
  L.push(`## ${REF}`, '');
  for (const p of groups.get(REF) || []) L.push(`- [${p.title === REF ? 'Introduction to the command reference' : p.title}](${p.url})${p.description ? `: ${p.description}` : ''}`);
  L.push(`- [All commands](${SITE_URL}docs/ai/reference/index.html): the ${cmds.total} commands by category, with parameters, units, defaults, returns and examples.`);
  for (const c of cmds.categories) L.push(`- [${c.name}](${SITE_URL}docs/ai/reference/${c.slug}.html): ${c.commands.map((x) => x.name).join(', ')}`);
  L.push(`- [OpenAPI 3.1 specification](${SITE_URL}openapi.json): machine-readable description of every command (request bodies are JSON Schemas).`);
  L.push(`- [llms-full.txt](${SITE_URL}llms-full.txt): all AI docs pages plus the full specification of every command, as one Markdown file.`, '');
  L.push('## Optional', '');
  L.push(`- [User guide](${SITE_URL}docs/guide/index.html): how people use the Kadr editor (UI, shortcuts, workflows).`);
  L.push(`- [AI docs in Ukrainian](${SITE_URL}uk/docs/ai/index.html): the same AI documentation in Ukrainian.`);
  L.push(`- [Downloads and releases](https://github.com/gitkalenyuk/kadr/releases): Windows installer and portable zip.`, '');
  const llms = L.join('\n');

  /* llms-full.txt */
  const F = [`# Kadr — complete documentation for AI agents`, '', `> ${SUMMARY(cmds.total)}`, '',
    `Generated ${now.toISOString().slice(0, 10)} from ${SITE_URL} for Kadr ${cmds.version}. Part 1 contains the ${pages.length} English AI docs pages; part 2 the specification of all ${cmds.total} commands, generated from the engine's command registry (docs/openapi.json). A running Kadr serves the same specification at http://127.0.0.1:7777/api/v1/commands.`, '',
    '## Contents', '', ...pages.map((p) => `- ${p.title}`), `- Command specifications (${cmds.categories.length} categories)`, ''];
  for (const p of pages) {
    F.push('---', '', `# ${p.title}`, '', `Source: ${p.url}`, '');
    if (p.description) F.push(`*${p.description}*`, '');
    F.push(htmlToMarkdown(p.body, { url: p.url }), '');
  }
  F.push('---', '', '# Command specifications', '', `All ${cmds.total} commands, grouped by category. Every command is available as \`POST /api/v1/commands/<name>\`, as the MCP tool \`<name with dots replaced by underscores>\` and as \`kadrctl run <name> --param value\`. Commands that edit one project take \`project_id\` and can be combined in a batch; global commands (projects list/create/duplicate/delete, library, presets, export jobs, \`captions.auto\`, \`transcript.transcribe\`, tools, updates, \`ui.toast\`, \`ui.library_tab\`) cannot — a batch rejects them with an explicit error. Parameters ending in \`_us\` are integer microseconds.`, '');
  for (const c of cmds.categories) {
    F.push(`## ${c.name}`, '', `${c.commands.length} commands: ${c.commands.map((x) => `\`${x.name}\``).join(', ')}.`, `Reference page: ${SITE_URL}docs/ai/reference/${c.slug}.html`, '');
    for (const x of c.commands) F.push(commandMarkdown(x), '');
  }
  const full = F.join('\n').replace(/\n{3,}/g, '\n\n');

  fs.writeFileSync(path.join(site, 'llms.txt'), llms.endsWith('\n') ? llms : `${llms}\n`);
  fs.writeFileSync(path.join(site, 'llms-full.txt'), full.endsWith('\n') ? full : `${full}\n`);
  return { pages: pages.length, commands: cmds.total, llmsBytes: Buffer.byteLength(llms), fullBytes: Buffer.byteLength(full) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const r = generate();
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`llms.txt ${kb(r.llmsBytes)}, llms-full.txt ${kb(r.fullBytes)} (${r.pages} AI pages, ${r.commands} commands)`);
}
