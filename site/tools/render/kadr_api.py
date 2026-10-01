"""Tiny client for the Kadr REST API used by the showcase render scripts.

Every editor action in Kadr is a command: POST /api/v1/commands/<name> with a
JSON body, answered with {ok, result} (or {ok:false, error}).

Environment:
  KADR_ADDR      host:port of a running kadr-server (default 127.0.0.1:7839)
  KADR_DATA_DIR  data dir of that server; the API token is read from
                 <KADR_DATA_DIR>/api-token (or set KADR_TOKEN directly)
"""
from __future__ import annotations

import base64
import getpass
import json
import os
import re
import tempfile
import time
import urllib.error
import urllib.request

TMP = tempfile.gettempdir()
ADDR = os.environ.get("KADR_ADDR", "127.0.0.1:7839")
DATA_DIR = os.environ.get("KADR_DATA_DIR", os.path.join(TMP, "kadr-render-data"))


def _token() -> str:
    tok = os.environ.get("KADR_TOKEN")
    if tok:
        return tok.strip()
    with open(os.path.join(DATA_DIR, "api-token"), encoding="utf-8") as f:
        return f.read().strip()


class KadrError(RuntimeError):
    pass


# Every call is remembered so scripts can save real request/response samples.
LOG: list[dict] = []


def call(name: str, /, *, _timeout: float = 600, **args):
    """Run one command and return its result (raises KadrError on failure)."""
    body = json.dumps(args).encode("utf-8")
    req = urllib.request.Request(
        f"http://{ADDR}/api/v1/commands/{name}",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {_token()}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=_timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        data = json.loads(e.read().decode("utf-8") or "{}")
    LOG.append({"command": name, "request": args, "response": data})
    if not data.get("ok"):
        raise KadrError(f"{name} failed: {json.dumps(data.get('error', data))}")
    return data.get("result")


# Everything under site/ is published, so local machine paths and the user
# name are rewritten to neutral placeholders before any JSON is saved
# (API answers contain absolute file paths).
SCRUB = [
    (os.path.join(TMP, "kadr-render", "work"), r"C:\Users\you\Videos\Kadr"),
    (os.path.join(TMP, "kadr-render", "photos"), r"C:\Users\you\Pictures\Kadr"),
    (DATA_DIR, r"C:\Users\you\AppData\Roaming\Kadr"),
    (TMP, r"C:\Users\you\AppData\Local\Temp"),
    (os.path.expanduser("~"), r"C:\Users\you"),
]
_USER = getpass.getuser()


def scrub(obj):
    """Recursively replace local paths (backslash and slash forms, any case) in strings."""
    if isinstance(obj, dict):
        return {k: scrub(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [scrub(v) for v in obj]
    if isinstance(obj, str):
        for src, dst in SCRUB:
            if not src:
                continue
            for a, b in ((src, dst), (src.replace("\\", "/"), dst.replace("\\", "/"))):
                obj = re.sub(re.escape(a), lambda _m, b=b: b, obj, flags=re.IGNORECASE)
        if _USER and len(_USER) > 2:
            obj = re.sub(re.escape(_USER), "you", obj, flags=re.IGNORECASE)
        return obj
    return obj


def save_sample(path: str, request: dict, response, command: str | None = None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out = {"request": scrub(request), "response": scrub(response)}
    if command:
        out = {"command": command, **out}
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")


def S(seconds: float) -> int:
    """Seconds -> microseconds."""
    return int(round(seconds * 1_000_000))


def frame_png(project_id: str, t: float, width: int, path: str) -> str:
    r = call("preview.frame", project_id=project_id, time_us=S(t), width=width)
    with open(path, "wb") as f:
        f.write(base64.b64decode(r["png_base64"]))
    return path


def export(project_id: str, path: str, resolution="720p", fps=30, bitrate="higher",
           poll=1.0, **extra) -> tuple[dict, dict]:
    """Start an export, wait until it is done; returns (start_result, final_status)."""
    start = call("export.start", project_id=project_id, path=path, resolution=resolution,
                 fps=fps, codec="h264", bitrate=bitrate, overwrite=True, **extra)
    job = start["job_id"]
    while True:
        st = call("export.status", job_id=job)
        if st["state"] in ("done", "failed", "cancelled"):
            break
        time.sleep(poll)
    if st["state"] != "done":
        raise KadrError(f"export {job} {st['state']}: {st.get('error')}")
    return start, st
