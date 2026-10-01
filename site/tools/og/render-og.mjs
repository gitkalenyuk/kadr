#!/usr/bin/env node
// Renders site/tools/og/og.html (1200x630) with a headless Chromium (Microsoft
// Edge or Google Chrome) to site/assets/img/og.png; convert it to the published
// og.jpg afterwards, e.g. python -c "from PIL import Image; Image.open('site/assets/img/og.png').convert('RGB').save('site/assets/img/og.jpg', quality=88, optimize=True, progressive=True)"
// og-frame.webp is a frame of the hero project rendered with preview.frame.
// Usage (repo root): node site/tools/og/render-og.mjs [uk]   (uk → assets/img/og-uk.png from og.html#uk)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const uk = process.argv[2] === 'uk';
const out = path.resolve(here, uk ? '../../assets/img/og-uk.png' : '../../assets/img/og.png');
const candidates = [
  process.env.CHROME,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) { console.error('No Chromium-based browser found; set CHROME=<path>'); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kadr-og-'));
if (fs.existsSync(out)) fs.rmSync(out);
execFileSync(browser, ['--headless', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  `--user-data-dir=${profile}`, `--screenshot=${out}`, '--window-size=1200,630', '--virtual-time-budget=3000',
  pathToFileURL(path.join(here, 'og.html')).href + (uk ? '#uk' : '')], { stdio: 'inherit' });
// Edge may hand the work to a child process and return early: wait for the file.
const t0 = Date.now();
let last = -1;
while (Date.now() - t0 < 20000) {
  const size = fs.existsSync(out) ? fs.statSync(out).size : -1;
  if (size > 0 && size === last) break;
  last = size;
  execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},400)']);
}
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
if (!fs.existsSync(out)) { console.error('screenshot failed'); process.exit(1); }
console.log('wrote', path.relative(process.cwd(), out));
