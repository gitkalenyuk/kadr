// Loads the command registry (docs/openapi.json) and the docs fragments
// (site/tools/docs-src/{guide,ai}/<lang>/*.html and the site pages owned by
// site-core: changelog, privacy, licenses). Node standard library only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify } from './layout.mjs';
import { LANGS, langRoot } from './i18n.mjs';

export const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = path.resolve(TOOLS, '..');
export const REPO = path.resolve(SITE, '..');
// KADR_DOCS_SRC lets you build against another fragments folder (tests, previews).
export const DOCS_SRC = process.env.KADR_DOCS_SRC ? path.resolve(process.env.KADR_DOCS_SRC) : path.join(TOOLS, 'docs-src');
export const OPENAPI = path.join(REPO, 'docs', 'openapi.json');

/* ------------------------------------------------------------------ commands */
export function loadCommands() {
  const api = JSON.parse(fs.readFileSync(OPENAPI, 'utf8'));
  const tagOrder = (api.tags || []).map((t) => t.name);
  const byName = new Map();
  for (const [p, item] of Object.entries(api.paths)) {
    if (!p.startsWith('/api/v1/commands/')) continue;
    const op = item.post;
    const name = op.operationId || p.slice('/api/v1/commands/'.length);
    const desc = [];
    let ui = '', hotkey = '', undoable = false, returns = '';
    for (const line of (op.description || '').split('\n')) {
      if (line.startsWith('UI: ')) {
        const [u, h] = line.slice(4).split(' Hotkey: ');
        ui = u.replace(/\.$/, '');
        if (h) hotkey = h.replace(/\.$/, '');
      } else if (/^Hotkey: /.test(line)) {
        hotkey = line.slice(8).replace(/\.$/, '');
      } else if (/^Undoable with edit\.undo\.?$/.test(line)) {
        undoable = true;
      } else if (line.startsWith('Returns: ')) {
        returns = line.slice(9);
      } else if (line.trim()) {
        desc.push(line);
      }
    }
    const body = op.requestBody && op.requestBody.content && op.requestBody.content['application/json'];
    const schema = (body && body.schema) || { properties: {} };
    const required = new Set(schema.required || []);
    const params = Object.entries(schema.properties || {}).map(([pn, s]) => ({
      name: pn,
      type: s.type === 'array' && s.items && s.items.type ? `${s.items.type}[]` : (Array.isArray(s.type) ? s.type.join(' | ') : (s.type || 'any')),
      required: required.has(pn),
      description: s.description || '',
      enum: s.enum || null,
      default: 'default' in s ? s.default : undefined,
      minimum: s.minimum, maximum: s.maximum,
    }));
    params.sort((a, b) => (b.required - a.required)); // required first, then the registry's order
    const examples = Object.values((body && body.examples) || {}).map((e) => ({ summary: e.summary || '', value: e.value || {} }));
    const category = (op.tags && op.tags[0]) || 'Other';
    byName.set(name, {
      name, title: op.summary || name, category, slug: slugify(category),
      description: desc.join('\n'), ui, hotkey, undoable, returns, params, examples,
      mcp: name.replace(/\./g, '_'),
    });
  }
  const cats = new Map();
  for (const c of byName.values()) {
    if (!cats.has(c.category)) cats.set(c.category, { name: c.category, slug: c.slug, commands: [] });
    cats.get(c.category).commands.push(c);
  }
  const categories = [...cats.values()].sort((a, b) => {
    const ia = tagOrder.indexOf(a.name), ib = tagOrder.indexOf(b.name);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.name.localeCompare(b.name);
  });
  categories.forEach((c) => c.commands.sort((a, b) => a.name.localeCompare(b.name)));
  const total = categories.reduce((n, c) => n + c.commands.length, 0);
  return { categories, byName, total, version: (api.info && api.info.version) || '' };
}

/** Site-root relative URL of a command's reference entry. */
export const commandUrl = (cmd, lang = 'en') => `${langRoot(lang)}docs/ai/reference/${cmd.slug}.html#${cmd.name}`;

/* ------------------------------------------------------------------ fragments */
/**
 * Parses the metadata comment at the top of a fragment.
 * New format:  <!--meta {"title": "...", "order": 10, ...} -->
 * Old format:  <!--\ntitle: ...\ndescription: ...\n-->
 */
export function parseMeta(src, file, errors = []) {
  src = src.replace(/^﻿/, '');
  const m = src.match(/^\s*<!--\s*meta\s+([\s\S]*?)\s*-->\s*/);
  if (m) {
    try {
      return { meta: JSON.parse(m[1]), body: src.slice(m[0].length) };
    } catch (e) {
      errors.push(`${file}: the <!--meta {...} --> comment is not valid JSON (${e.message})`);
      return { meta: {}, body: src.slice(m[0].length) };
    }
  }
  const o = src.match(/^\s*<!--([\s\S]*?)-->\s*/);
  const meta = {};
  if (o && /^\s*[a-z_]+\s*:/im.test(o[1])) {
    for (const line of o[1].split(/\r?\n/)) {
      const mm = line.match(/^\s*([a-zA-Z_]+)\s*:\s*(.*?)\s*$/);
      if (mm) meta[mm[1].toLowerCase()] = mm[2];
    }
    return { meta, body: src.slice(o[0].length) };
  }
  return { meta, body: src };
}

function walkHtml(dir, rel = '') {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, f);
    const r = rel ? `${rel}/${f}` : f;
    if (fs.statSync(full).isDirectory()) out.push(...walkHtml(full, r));
    else if (f.endsWith('.html') && !f.startsWith('_') && !f.startsWith('.')) out.push({ full, rel: r });
  }
  return out;
}

function toPage(full, slug, errors) {
  const { meta, body } = parseMeta(fs.readFileSync(full, 'utf8'), path.relative(TOOLS, full).replace(/\\/g, '/'), errors);
  const title = String(meta.title || slug.split('/').pop().replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));
  return {
    slug, src: path.relative(TOOLS, full).replace(/\\/g, '/'), body,
    title, nav: String(meta.nav || meta.title || title),
    description: String(meta.description || meta.summary || ''),
    group: String(meta.group || meta.section || ''),
    order: Number.isFinite(Number(meta.order)) ? Number(meta.order) : 100,
    meta,
  };
}

/** Fragments of one doc set: { en: [page], uk: [page] }. Slug = file path without .html. */
export function loadSection(section, errors = []) {
  const out = {};
  for (const lang of LANGS) {
    out[lang] = walkHtml(path.join(DOCS_SRC, section, lang)).map(({ full, rel }) => toPage(full, rel.replace(/\.html$/, ''), errors));
  }
  return out;
}

/** Pages owned by site-core: changelog, privacy, licenses (name.html = en, name.uk.html = uk). */
export const SITE_PAGES = ['changelog', 'privacy', 'licenses'];
export function loadSitePages(errors = []) {
  const out = { en: [], uk: [] };
  for (const name of SITE_PAGES) {
    for (const lang of LANGS) {
      const file = path.join(DOCS_SRC, lang === 'en' ? `${name}.html` : `${name}.${lang}.html`);
      const fallback = path.join(TOOLS, 'docs-src', lang === 'en' ? `${name}.html` : `${name}.${lang}.html`);
      const f = fs.existsSync(file) ? file : (fs.existsSync(fallback) ? fallback : null);
      if (f) out[lang].push(toPage(f, name, errors));
    }
  }
  return out;
}
