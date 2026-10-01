#!/usr/bin/env bash
# Re-creates every showcase render of the Kadr site with the real Kadr engine.
#
#   bash site/tools/render/render-showcase.sh            # everything
#   bash site/tools/render/render-showcase.sh hero filters   # only some steps
#
# Needs Go, Python 3 (numpy + Pillow), ffmpeg/ffprobe (libx264, libvpx-vp9,
# libwebp). Captions need faster-whisper (model "small"), the bgremove step an
# ONNX matting model (see ai.capabilities). Run from the repository root.
# Binaries and data live in the temp dir; the server is always stopped again.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMPROOT="$(python -c 'import tempfile; print(tempfile.gettempdir())')"
T="$TMPROOT/kadr-render"
export KADR_DATA_DIR="$TMPROOT/kadr-render-data"
export KADR_ADDR="${KADR_ADDR:-127.0.0.1:7839}"
export PYTHONIOENCODING=utf-8
mkdir -p "$T/bin" "$T/photos" "$T/work" "$KADR_DATA_DIR"

cd "$ROOT"
go build -o "$T/bin/kadr-server.exe" ./cmd/server
go build -o "$T/bin/kadrctl.exe" ./cmd/kadrctl

"$T/bin/kadr-server.exe" > "$T/server.log" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do [ -f "$KADR_DATA_DIR/api-token" ] && break; sleep 0.2; done
sleep 1

# 1) procedural "footage" (1920x1080 PNGs, never copied into site/)
python site/tools/render/gen_photos.py "$T/photos"
# 2) every render, driven through the Kadr API
cd site/tools/render
python render_showcase.py "$@"
