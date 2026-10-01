# Changelog

All notable changes to Kadr are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and Kadr uses
[Semantic Versioning](https://semver.org/). Versions with a suffix such as `-beta.1` are pre-releases and are
delivered through the **Beta** update channel.

## [0.1.0-beta.1] - Unreleased

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
