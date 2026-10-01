#!/usr/bin/env node
// Checks every link in site/**/*.html: relative href/src/poster targets must
// exist, #fragments must match an id on the target page, and absolute links to
// the site itself (canonical, hreflang, og:image) must map to a local file.
// Also flags pages that mention local machine paths.
// Usage (repo root): node site/tools/check-links.mjs   (build.mjs runs it too)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE } from './lib/content.mjs';
import { SITE_URL } from './lib/layout.mjs';

export function checkLinks({ quiet = false } = {}) {
  const pages = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) { if (f !== 'tools' && f !== 'node_modules') walk(full); continue; }
      if (f.endsWith('.html')) pages.push(full);
    }
  })(SITE);

  const USER = os.userInfo().username;
  const idCache = new Map();
  const ids = (file) => {
    if (!idCache.has(file)) {
      const html = fs.readFileSync(file, 'utf8');
      idCache.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
    }
    return idCache.get(file);
  };
  const resolveTarget = (page, p) => {
    let target = p ? path.resolve(path.dirname(page), decodeURIComponent(p.split('?')[0])) : page;
    if (p && (p.endsWith('/') || (fs.existsSync(target) && fs.statSync(target).isDirectory()))) target = path.join(target, 'index.html');
    return target;
  };

  let bad = 0, checked = 0;
  const problems = [];
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    const rel = path.relative(SITE, page).replace(/\\/g, '/');
    if (html.includes(USER) || /AppData\\{1,2}Local\\{1,2}Temp/i.test(html)) problems.push(`${rel}: contains a local path or user name`);
    if (rel === '404.html') continue; // uses a computed <base>
    for (const m of html.matchAll(/\s(?:href|src|poster|data-alt-[a-z]+)="([^"]*)"/g)) {
      let url = m[1].replace(/&amp;/g, '&');
      if (url.startsWith(SITE_URL)) {
        // absolute link to this site: map to the local file
        let local = decodeURIComponent(url.slice(SITE_URL.length).split('#')[0].split('?')[0]);
        if (local === '' || local.endsWith('/')) local += 'index.html';
        checked++;
        const target = path.join(SITE, local);
        if (!fs.existsSync(target)) { bad++; problems.push(`${rel}: absolute link to a missing page ${url}`); }
        continue;
      }
      if (/^(https?:|mailto:|data:|javascript:|tel:)/.test(url) || url.startsWith('//')) continue;
      if (url.includes('${')) continue;
      if (url === '') { bad++; problems.push(`${rel}: empty link`); continue; }
      checked++;
      const [p, frag] = url.split('#');
      const target = resolveTarget(page, p);
      if (!target.startsWith(SITE)) { bad++; problems.push(`${rel}: link leaves the site ${url}`); continue; }
      if (!fs.existsSync(target)) { bad++; problems.push(`${rel}: missing ${url}`); continue; }
      if (frag && target.endsWith('.html') && !ids(target).has(decodeURIComponent(frag)) && frag !== 'top') { bad++; problems.push(`${rel}: no #${frag} in ${path.relative(SITE, target).replace(/\\/g, '/')}`); }
    }
    // data-sources of lazy videos
    for (const m of html.matchAll(/data-sources="([^"]+)"/g)) {
      for (const pair of m[1].split(',')) {
        const src = pair.split('|')[0];
        checked++;
        if (!fs.existsSync(path.resolve(path.dirname(page), src))) { bad++; problems.push(`${rel}: missing video ${src}`); }
      }
    }
  }
  if (!quiet) {
    console.log(`links: ${pages.length} pages, ${checked} links checked, ${bad} broken`);
    if (problems.length) console.log(problems.slice(0, 200).map((p) => `  ${p}`).join('\n'));
  }
  return { pages: pages.length, checked, bad, problems };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const r = checkLinks();
  if (r.bad || r.problems.length) process.exitCode = 1;
}
