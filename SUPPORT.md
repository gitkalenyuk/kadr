# Getting help with Kadr

Kadr is free software maintained in spare time. Support is best effort, and good reports get the fastest answers.

## Where to go

| You want to… | Go here |
|---|---|
| Learn how to do something | The [website and docs](https://gitkalenyuk.github.io/kadr/), the [FAQ](README.md#faq), and the built-in command reference at `http://127.0.0.1:7777/docs` while Kadr is running |
| Set up an AI agent (MCP) | [Quick start for AI agents](README.md#quick-start-for-ai-agents) |
| Report a bug or a crash | [Bug report](https://github.com/gitkalenyuk/kadr/issues/new?template=bug_report.yml) |
| Suggest a feature, effect or command | [Feature request](https://github.com/gitkalenyuk/kadr/issues/new?template=feature_request.yml) |
| Report a security problem | **Privately**, see [SECURITY.md](SECURITY.md). Never in a public issue |

Before opening an issue, please [search existing issues](https://github.com/gitkalenyuk/kadr/issues?q=is%3Aissue)
(open and closed) and update to the latest version: **Settings → Updates → Check now**.

## What to include in a bug report

1. **Kadr version** from **Settings → About**, and whether you use the installer or the portable zip.
2. **Windows version**: press `Win+R`, type `winver` and press Enter.
3. **GPU and driver version**, especially for export, preview or auto-caption problems.
4. **Steps to reproduce**, starting from a new project if possible.
5. **What happened, and what you expected.** For API/MCP problems include the command, its arguments and the full
   error JSON (`code`, `message` and `hint`).
6. **Logs and files.** Kadr keeps its data in `%APPDATA%\Kadr`. Attach any `*.log` files from there. If the problem
   is in one project, the folder `%APPDATA%\Kadr\projects\<project id>` helps (leave out media you don't want to
   share).

> Please don't attach private videos, the `api-token` file, or anything else you don't want to be public.
> Issues are public.

## Common fixes

| Problem | Try this |
|---|---|
| *"Windows protected your PC"* when installing | The build is not code-signed yet. Choose **More info → Run anyway**, and compare the file hash with `SHA256SUMS.txt` |
| The window stays blank or doesn't open | Install or repair the **Microsoft Edge WebView2 Runtime** from Microsoft, then start Kadr again |
| *FFmpeg not found* | Let Kadr download FFmpeg, choose a folder that contains `ffmpeg.exe` and `ffprobe.exe`, or set `KADR_FFMPEG_DIR` |
| Auto captions *not available* | `pip install faster-whisper`, download a model once, and set `KADR_PYTHON` if Python is not on `PATH`. Check with `captions.asr_status` |
| Background removal *not available* | `pip install rembg onnxruntime`. Check with `ai.capabilities` |
| Text-to-speech has few voices | Install [eSpeak NG](https://github.com/espeak-ng/espeak-ng) (about 130 languages) or more SAPI 5 desktop voices, then refresh the voice list |
| Agent says it can't connect | Kadr (or `kadr-server.exe`) must be running. Check `http://127.0.0.1:7777/api/v1/health` in a browser |
| `unauthorized` errors | The token changed. Restart the MCP client, or re-read `%APPDATA%\Kadr\api-token` |
| Port 7777 in use | Set `KADR_ADDR=127.0.0.1:7788` (or another free port) for Kadr and its tools |
| Choppy preview of 4K/HEVC footage | Use **Create proxy** on the media item, or lower the preview quality in the player |
| Export is slow | Update your GPU driver so a hardware encoder (NVENC, Quick Sync, AMF) can be used |
