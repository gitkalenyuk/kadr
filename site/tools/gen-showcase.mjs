#!/usr/bin/env node
// Turns the metadata written by the showcase renders (site/tools/render/*.json,
// produced by render_showcase.py against a real kadr-server) into
// site/assets/js/showcase-data.js, which the landing page reads:
//   - hero timeline (mirrors the real project behind hero.mp4) + the MCP chat script
//   - filters / text effects / transitions galleries, caption word timings
//   - real API request/response samples for the "Every button is an API" demo
// When ffmpeg is on PATH it also cuts small filmstrip thumbnails from hero.mp4.
//
// Usage (from the repository root):   node site/tools/gen-showcase.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SITE, TOOLS } from './lib/content.mjs';

const R = path.join(TOOLS, 'render');
const SHOW = 'assets/img/showcase/';
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')); } catch { return null; } };
const s = (us) => Math.round(us / 1e4) / 100;
// never publish local paths
const scrub = (v) => JSON.parse(JSON.stringify(v).replace(/C:\\\\Users\\\\[^"]*?\\\\([^"\\\\]+\.(mp4|mov|gif|png|wav|mp3))"/gi, 'C:\\\\Users\\\\you\\\\Videos\\\\Kadr\\\\$1"'));
const nice = (name) => name.replace(/\.(png|jpe?g|mp4|mov|webm)$/i, '').replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const data = {};

/* ---------------------------------------------------------------- hero */
const tl = read('hero-timeline.json');
if (tl) {
  const order = (t) => (t.type === 'audio' ? -2 : t.type === 'main_video' ? -1 : t.layer);
  const tracks = [...tl.tracks].sort((a, b) => order(b) - order(a));
  const kindOf = { main_video: 'main', video_overlay: 'main', text: 'text', sticker: 'sticker', audio: 'audio', filter: 'filter', effect: 'filter', adjustment: 'filter' };
  // filmstrip thumbnails from the real render
  const thumbs = [];
  const main = tl.tracks.find((t) => t.type === 'main_video');
  const heroMp4 = path.join(SITE, 'assets/media/hero.mp4');
  if (main && fs.existsSync(heroMp4)) {
    main.segments.forEach((seg, i) => {
      const t = (seg.start_us + seg.duration_us * 0.55) / 1e6;
      const out = path.join(SITE, `${SHOW}hero-thumb-${i + 1}.webp`);
      try {
        execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', heroMp4, '-frames:v', '1', '-vf', 'scale=-2:72:flags=lanczos', '-c:v', 'libwebp', '-quality', '70', out]);
        thumbs[i] = `${SHOW}hero-thumb-${i + 1}.webp`;
      } catch { /* ffmpeg missing: gradients are used */ }
    });
  }
  const counters = {};
  data.hero = {
    duration: s(tl.duration_us),
    tracks: tracks.map((t) => {
      const kind = kindOf[t.type] || 'filter';
      const tr = { type: kind, clips: [] };
      t.segments.forEach((seg, i) => {
        counters[kind] = (counters[kind] || 0);
        const id = `${kind}${counters[kind]++}`;
        const clip = { id, s: s(seg.start_us), e: s(seg.end_us), label: kind === 'main' ? nice(seg.label) : seg.label };
        if (kind === 'main' && thumbs[i]) clip.thumb = thumbs[i];
        if (seg.filter) clip.fx = seg.filter;
        tr.clips.push(clip);
        if (seg.transition_out) {
          tr.transitions = tr.transitions || [];
          tr.transitions.push({ id: `tr${tr.transitions.length}`, t: s(seg.end_us), type: seg.transition_out.type });
        }
      });
      return tr;
    }),
  };
  const mainClips = data.hero.tracks.find((t) => t.type === 'main');
  const texts = data.hero.tracks.find((t) => t.type === 'text');
  const trs = (mainClips && mainClips.transitions) || [];
  const filtered = mainClips && mainClips.clips.find((c) => c.fx);
  const sticker = data.hero.tracks.find((t) => t.type === 'sticker');
  const audio = data.hero.tracks.find((t) => t.type === 'audio');
  const ids = (t) => (t ? t.clips.map((c) => c.id) : []);
  const mats = (tl.materials || []).filter((m) => m.type === 'photo').map((m) => m.id);
  data.hero.script = [
    { user: 'Make a 10-second 16:9 promo from my three stills: slow Ken Burns, big word-art titles “Edit by hand.”, “Or by API.”, “Or just ask.”, swirl transitions, a teal-orange grade on the ocean and a twinkle at the end.' },
    { ai: 'On it — building the timeline in Kadr.' },
    { tool: 'project_create', args: '{"name":"Kadr hero","ratio":"16:9","fps":30}' },
    { tool: 'media_import', args: '{"paths":["C:\\\\Shots\\\\synthwave.png","C:\\\\Shots\\\\ocean.png","C:\\\\Shots\\\\city.png"]}' },
    { tool: 'timeline_segment_add ×3', args: `{"material_id":"${mats[0] || 'mat_0bc8ae47f859'}","duration_us":3500000}`, show: ids(mainClips) },
    { tool: 'keyframe_add ×12', args: '{"property":"scale","value":1.18,"easing":"ease_in_out"}' },
    { tool: 'text_add ×3', args: '{"text":"Edit by hand.","at_us":250000,"style":{"effect_id":"fx_neon_outline","size":56}}', show: ids(texts), select: texts && texts.clips[0].id, fields: [['#insp-effect', 'fx_neon_outline']], sliders: [['#sl-glow', 0.72], ['#sl-size', 0.86]] },
    { tool: 'text_set_glyph_animation ×6', args: '{"kind":"in","id":"in_letter_rise","duration_us":900000}', fields: [['#insp-anim', 'in_letter_rise']] },
    ...trs.map((t, i) => ({ tool: 'transition_set', args: `{"type":"${t.type}","duration_us":600000}`, show: t.id, select: i === 0 ? null : undefined })),
    ...(filtered ? [{ tool: 'filter_apply', args: `{"filter_id":"${filtered.fx}","intensity":0.7}`, fx: filtered.id }] : []),
    ...(sticker ? [{ tool: 'sticker_add', args: `{"sticker_id":"sparkle_twinkle","at_us":${Math.round(sticker.clips[0].s * 1e6)}}`, show: ids(sticker) }] : []),
    ...(audio ? [{ tool: `sfx_add ×${audio.clips.length}`, args: '{"sfx_id":"whoosh_fast"}', show: ids(audio) }] : []),
    { tool: 'preview_frame', args: '{"time_us":5000000}', preview: true },
    { ai: '<b>Done.</b> 10 s, 3 clips, 3 titles, 2 transitions. I looked at the frame at 5 s — the titles read well. Playing it now.', play: true },
  ];
  data.hero.script.forEach((st) => { if (st.select === undefined) delete st.select; });
}

/* ---------------------------------------------------------------- galleries */
const filters = read('filters.json');
if (filters) data.filters = filters.filter((f) => f.id !== 'none').map((f) => ({ id: f.id, name: f.name, file: SHOW + f.file }));
const textfx = read('textfx.json');
if (textfx) data.textfx = textfx.map((t) => ({ id: t.id, name: t.name, file: SHOW + t.file }));
const transitions = read('transitions.json');
if (transitions) data.transitions = transitions;
const cap = read('captions-words.json');
if (cap) {
  const words = (cap.transcript && cap.transcript.segments || []).flatMap((sg) => sg.words || []);
  data.captions = { style: cap.style_id, words: words.map((w) => ({ text: w.text, start: s(w.start_us), end: s(w.end_us) })) };
}

/* ---------------------------------------------------------------- API samples */
const samples = {};
const sdir = path.join(R, 'samples');
if (fs.existsSync(sdir)) {
  for (const f of fs.readdirSync(sdir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = scrub(JSON.parse(fs.readFileSync(path.join(sdir, f), 'utf8')));
      if (j && j.request && j.response) samples[f.replace(/\.json$/, '')] = j;
    } catch { /* skip */ }
  }
}
if (Object.keys(samples).length) data.samples = samples;

const out = path.join(SITE, 'assets/js/showcase-data.js');
fs.writeFileSync(out, `/* Generated by site/tools/gen-showcase.mjs from real Kadr renders — do not edit. */\nwindow.KADR_SHOWCASE = ${JSON.stringify(data)};\n`);
console.log(`showcase data → ${path.relative(SITE, out)} (${(fs.statSync(out).size / 1024).toFixed(1)} KB): ${Object.keys(data).join(', ')}`);
