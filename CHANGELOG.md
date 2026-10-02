# Changelog

All notable changes to Kadr are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Kadr uses
[Semantic Versioning](https://semver.org/). Versions with a suffix such as `-beta.1` are pre-releases and are
delivered through the **Beta** update channel.

## [0.1.0-beta.3] - 2026-10-02

A much bigger library — several times more transitions, effects, filters, animations, text looks, stickers and
backgrounds — animated previews when you hover a card, 24 fonts with Cyrillic out of the box and 146 more in one click.

### New

- **See it move before you add it.** Hover any card for a moment — in the Transitions, Effects, Filters, Text and
  Stickers tabs, the Animation tab, Text → Effects and Animate, the Transition, Effect and Filter panels, caption styles
  and My kit — and it plays an animated preview rendered by Kadr's engine.
- **221 transitions** (was 68) in 19 tabs, with new Wipe, Zoom, Spin, Liquid, Particles, Film, Retro and Split tabs and
  directional whip pans. 23 of the new transitions take a direction and 13 an edge softness.
- **195 video effects** (was 56) in 20 tabs, with new Motion, Frame, Stylize, Weather, Dreamy and Color tabs. Every new
  effect has 1–4 sliders of its own.
- **227 filters** (was 70) in 25 tabs, with new Cinematic, Vintage, Aesthetic, Mood, Seasons, Duotone and Special looks
  and portrait filters that keep skin tones natural.
- **310 clip animations** (was 136): 105 In, 105 Out, 53 Combo and 47 Loop — blinds, slats, hinge swings, coin spins,
  slot rolls, shine sweeps, RGB splits, motion smears, waves and more. Loops now work on videos, photos, stickers and
  text alike.
- **175 text templates** (was 46), with new Vlog, Quote, Sale, Luxury, Gaming, Love, Travel, Food, Sports, News,
  Minimal, Impact and Kinetic tabs.
- **114 word-art effects** (was 22) and new text looks in Text → Effects: 28 patterns (glitter, holographic foil,
  marble, plaid, leopard…, some of them moving), bevel and emboss, inner shadow and inner glow, echo stacks, grunge,
  chalk and stamp textures, sparkles, drips, gradient outlines, a hand-made wobble and pixel art. The background box
  can now be one box per line, slanted, bordered, shadowed, gradient-filled or cut out around the letters.
- **137 letter animations** (was 39): 55 In, 45 Out and 37 Loop, such as decrypt, split-flap, terminal cursor, jelly
  pop, rain drop, glitch and neon buzz.
- **55 caption styles** (was 15) with new Karaoke, Pop, Cinematic, Neon, Minimal, Creator and Fun tabs, and 7 new word
  highlights: pop, bounce, reveal, dim ahead, glow, underline sweep and gliding box. Box-style highlights can recolour
  the spoken word's letters.
- **394 stickers** (was 82), 73 of them animated, with new Animated, Love, Party, Nature, Food, Tech, Retro, Travel,
  Sports, 3D and Folk tabs. Animated stickers arrive with their animation already applied.
- **98 generated media presets** (was 32) from 13 new generators: mesh gradients, aurora, lava lamp, plasma, bokeh,
  particles, light leaks, film dust, textures, patterns, styled timers, banners and frames. Moving backgrounds loop
  seamlessly; banners and frames are transparent overlays; light leaks and film dust are made for the Screen blend mode.
- **Fonts.** A new font picker in Text → Basic → Font with search, style filters (Sans, Serif, Display, Handwriting,
  Monospace, Pixel), a Cyrillic filter, *My fonts* and *More fonts*: 146 free, open-licence font families (123 with
  Cyrillic) that download and apply in one click. Import your own `.ttf`/`.otf` files too. Variable fonts get real
  Regular and Bold weights. Downloaded fonts are kept in `%APPDATA%\Kadr\fonts`.
- **24 fonts included, no download needed** — all with Cyrillic: Montserrat, Rubik, Oswald, Manrope, Unbounded, Russo
  One, Rubik Mono One, Comfortaa, Yeseva One, Seymour One, Tektur, Rubik Bubbles, Caveat, Lobster, Pacifico, Marck
  Script, Amatic SC, Bad Script, Playfair Display, Lora, Prata, JetBrains Mono, Press Start 2P and Pixelify Sans
  (SIL Open Font License; listed under *Bundled*).

### Fixed

- Some valid font files (for example Pacifico, Rubik Italic and Rubik Bubbles) were rejected when installing or
  importing, and some installed system fonts were missing from the font list.
- A few pop-style clip animations showed the clip at full size for one frame at their start or end.

### For AI agents and scripts

- **`library.preview`** returns a PNG contact sheet of how a transition, effect, filter, animation, text look, caption
  style, animated sticker or generated clip plays — over MCP it arrives as an image, so an agent can look before it
  chooses. Items that move carry a `preview` field (`GET` its `url` for the JPEG sprite strip).
- **Font commands:** `font.catalog`, `font.install` (background download with `font.progress` events), `font.import`,
  `font.remove` and `font.rescan`; event `fonts.changed`; `GET /api/v1/fonts/{id}/preview`.
- New optional text style fields (`pattern`, `bevel`, `inner_shadow`, `inner_glow`, `echo`, `distress`, `sparkle`,
  `drip`, `rough`, `pixelate`, `stroke_fill`, `fill.stops`, box extras, `highlight.text_color`) in `text.add`, with
  flat parameters in `text.update`.
- `sticker.add` applies an animated sticker's animations unless `animate: false`; `media.generate` has 13 new kinds.
- 183 documented commands (was 177).

## [0.1.0-beta.2] - 2026-10-01

Second public beta. If you have 0.1.0-beta.1 installed, Kadr offers this update automatically (Settings → Updates).

### New

- **Voices settings** (Settings → Voices): paste an ElevenLabs API key to use natural cloud voices — including
  Ukrainian — for text to speech. The key stays on your computer and is sent only to ElevenLabs.
- **ElevenLabs text to speech** through the API as well: `tts.set_api_key`, then `tts.speak` / `tts.from_text` with
  voices named `elevenlabs:<voice_id>`.
- **Watch an AI agent work:** new `ui.open_project`, `ui.select`, `ui.library_tab` and `ui.toast` commands let an agent
  show what it is doing in the open window.
- **The editor takes over from the background engine:** if an AI client started a headless `kadr-server` (via
  `kadr-mcp`), opening Kadr now takes over the API port, so the agent's edits appear live in the window.
- `kadr-mcp` starts the engine on demand when Kadr is not running.
- Web mode deep link: `?project=<id>` opens a project directly.

### Fixed

- `kadrctl batch` accepts JSON files saved with a UTF-8 byte-order mark (Notepad / PowerShell).
- The portable build keeps its data in a `data` folder next to `Kadr.exe`.
- OpenAPI operations now carry `x-scope`, `x-read-only` and `x-undoable`.

## [0.1.0-beta.1] - 2026-10-01

The first public beta of Kadr. Kadr is a CapCut-style desktop video editor for Windows where every action is also an
API command, available over REST, MCP (for AI agents), the `kadrctl` CLI and WebSocket events.

> **Install notes.** The installer is not code-signed yet, so Windows SmartScreen may warn you: choose
> **More info → Run anyway**, and compare the file hash with `SHA256SUMS.txt` if you want to be sure. Kadr does not
> bundle FFmpeg. On first launch it offers to download an official GPL build, or you can point it to your own FFmpeg.
> Requires Windows 10 1809+ or Windows 11 (x64) with the WebView2 Runtime.

### Editor

- CapCut-style workspace: home screen with projects, media library, player, inspector and a multi-track timeline in
  a dark theme.
- Projects in 10 canvas ratios (16:9, 9:16, 1:1, 4:3, 3:4, 21:9, 2.35:1, 2:1, 1.85:1, 5.8-inch), any frame rate,
  canvas background (colour, blur or image), cover frame, duplicate and rename.
- Media import of video, photo, audio and animated GIF files or whole folders by button, native dialog or drag and
  drop, with duplicate detection. Thumbnails, filmstrips and waveforms are generated in the background.
  **Proxies** make 4K and HEVC footage smooth to edit, and moved files can be relinked.
- Generated media: gradients, film grain and noise, drifting shapes, countdowns, grids, checkers, stripes and test cards,
  rendered locally (9 kinds, 32 presets).
- Timeline with a magnetic main track, video overlays (picture-in-picture), text, sticker, effect, filter,
  adjustment and audio tracks, snapping, linkage, preview axis, markers with colour and label, and track
  lock, hide and mute.
- Clip tools: split (`Ctrl+B`), delete, delete left/right (`Q`/`W`), duplicate (`Ctrl+D`), replace, freeze frame,
  reverse, mirror, rotate, crop with ratio presets, copy/cut/paste (`Ctrl+C`/`Ctrl+X`/`Ctrl+V`).
- On-canvas editing: select, move, scale and rotate clips in the player with snapping guides, plus a hand tool, zoom
  presets, arrow-key nudge and safe-zone overlays for vertical video.
- Speed from 0.1× to 100× with *keep pitch*, and speed curves (montage, hero, bullet, jump cut, flash in, flash out, or
  a custom curve).
- Compositing: position, scale, rotation, opacity, 14 blend modes, 6 mask shapes with feather, rounding and invert,
  chroma key, and a canvas background per clip.
- Keyframes on 22 properties (transform, opacity, volume, 15 colour controls, filter intensity) with four easing curves.
- Undo and redo for every edit, whoever made it. *My kit* presets save text styles, colour settings, filters, effects,
  transitions and animations for reuse in every project.

### Colour

- 14 basic adjustments: brightness, contrast, saturation, exposure, temperature, tint, highlights, shadows, sharpen,
  vignette, hue, fade, grain and shine.
- HSL with 8 colour bands, tone curves (master, R, G, B; up to 16 points; 7 presets) and `.cube` LUTs with intensity.
- Auto adjust, which corrects exposure, contrast, white balance and saturation from frame analysis.
- 70 original filters in 18 categories with keyframable intensity, plus adjustment layers.
- Video denoise and deflicker.

### Text and captions

- Text with 4 built-in fonts and every installed system font (with Cyrillic and CJK fallback): stroke and extra outlines,
  shadow, background box, glow, gradient fill, 3D extrude, curved text and letter case.
- 46 text templates, 22 word-art effects and 39 per-letter/per-word text animations (typewriter, letter rise,
  karaoke sweep, scramble, word pop and more).
- **Offline auto captions** with Whisper (faster-whisper): about 100 languages plus auto-detect, word-level timing,
  model choice from `tiny` to `large-v3`, and NVIDIA GPU acceleration.
- 15 caption styles, including word highlight and karaoke looks, and a caption editor to edit, split, merge, shift
  and restyle cues.
- Subtitle import (SRT, VTT, ASS/SSA, LRC) and export (SRT, VTT, TXT, LRC).
- **Transcript-based editing:** delete words to cut the video, remove filler words (English, Ukrainian, Russian, plus
  custom words) and remove pauses.
- Local text-to-speech with Windows SAPI voices and eSpeak NG, loudness-normalised, with an option to fit the text
  clip to the speech.

### Library

All items are original and generated or rendered by Kadr's own engine:

- 68 transitions in 11 categories (including 3D cube and flip, blinds, iris shapes, ripple, swirl and zoom blur), with
  direction and softness options.
- 56 video effects in 14 categories, each with its own parameter sliders.
- 136 clip animations: 44 in, 44 out, 28 combo and 20 loop.
- 82 stickers in 14 categories, 47 synthesised sound effects in 9 categories and 25 voice effects.

### Audio

- Volume in dB with keyframes, fades, noise reduction and loudness normalisation (−14 LUFS with a true-peak limit).
- EBU R128 loudness meter and beat detection with BPM and automatic beat markers.
- Separate audio (`Ctrl+Shift+S`) into a linked audio clip, and restore it later.
- A sound-effects browser with categories, search, preview and one-click add at the playhead.

### AI and smart tools (local)

- Remove background, using `rembg`, `onnxruntime` or `torch` on your machine.
- Scene detection and *split scenes*, *remove silence*, *auto reframe* (for example 16:9 to 9:16 following the
  subject), auto adjust, and beat detection.
- `ai.capabilities` and `captions.asr_status` report which optional components are installed and how to add the rest.

### Export

- 480p to 4K, 24 to 60 fps, H.264 or HEVC in MP4 or MOV, with quality presets or a custom bitrate.
- Automatic GPU encoding (NVIDIA NVENC, Intel Quick Sync, AMD AMF) with a software fallback.
- Animated GIF, audio-only MP3, WAV, AAC and FLAC, and range export.
- Size estimate, a background export queue with progress and cancel, and *open folder*.

### API, MCP and CLI

- 160+ documented commands generated from one registry. Each has a detailed description, typed parameters with units,
  examples, and errors with hints.
- REST API on `127.0.0.1:7777` with token authentication, an OpenAPI 3.1 spec (`/api/v1/openapi.json`) and an HTML
  reference at `/docs`.
- Atomic **batches** that apply many commands as one undo step, with **dry run**.
- WebSocket events for project changes, playback, imports, exports, captions and AI jobs.
- `kadr-mcp.exe`: an MCP server for Claude Desktop, Claude Code and other MCP clients. `preview_frame` and
  `preview_contact_sheet` return images, so agents can see their edits.
- `kadrctl`: list, describe and run commands from the terminal, with human time formats (`2.5s`, `00:01:02.5`).
- `kadr-server.exe`: the headless engine for scripts and pipelines.

### Installer and updates

- Per-user installer in English and Ukrainian (no admin rights needed) with an optional all-users mode, shortcuts,
  an optional *Add kadrctl and kadr-mcp to PATH* task, a WebView2 check and an uninstaller that asks before deleting your
  projects or the downloaded FFmpeg. A portable zip is also available.
- First-run FFmpeg setup: one click downloads the official BtbN GPL build of FFmpeg 7.1 (about 100 MB, SHA-256
  verified) into `%LOCALAPPDATA%\Kadr\tools\ffmpeg\bin`, or you can point Kadr to an existing FFmpeg
  (`tools.install_ffmpeg`, `tools.set_ffmpeg_dir`).
- Automatic updates from GitHub Releases, verified with an **Ed25519-signed manifest** and the installer's
  **SHA-256**. Installs silently in place and relaunches Kadr. Stable and Beta channels (pre-release builds default to
  Beta), *skip this version*, and update commands for agents (`update.check`, `update.install`, …).
- Settings window with *About*, *Updates* and *API* sections (address, token file and docs link).

[0.1.0-beta.1]: https://github.com/gitkalenyuk/kadr/releases/tag/v0.1.0-beta.1
