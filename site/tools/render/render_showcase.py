"""Builds the Kadr marketing-site showcase renders with the REAL Kadr engine.

Every edit below is an API command (POST /api/v1/commands/<name>) sent to a
running kadr-server; the frames come from preview.frame / export.start, then
ffmpeg only scales/trims/encodes them for the web.

How to run (from the repo root, Git Bash):

    T=$TEMP/kadr-render
    go build -o $T/bin/kadr-server.exe ./cmd/server
    KADR_DATA_DIR=$TEMP/kadr-render-data KADR_ADDR=127.0.0.1:7839 $T/bin/kadr-server.exe &
    python site/tools/render/gen_photos.py $T/photos          # procedural "footage"
    KADR_DATA_DIR=$TEMP/kadr-render-data python site/tools/render/render_showcase.py all
    taskkill //F //PID <server pid>

Sub-commands: hero, captions, transitions, filters, textfx, textanim,
contact, samples, vertical, bgremove, all (see main()).
Outputs go to site/assets/media, site/assets/img/showcase and
site/tools/render (JSON metadata + API samples).
"""
from __future__ import annotations

import base64
import io
import json
import os
import shutil
import subprocess
import sys
import time

from PIL import Image

import kadr_api as k
from kadr_api import S, call

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, "..", ".."))
MEDIA = os.path.join(SITE, "assets", "media")
SHOW = os.path.join(SITE, "assets", "img", "showcase")
SAMPLES = os.path.join(HERE, "samples")
TMP = os.path.join(k.TMP, "kadr-render")  # tempfile.gettempdir()/kadr-render
PHOTOS = os.path.join(TMP, "photos")
WORK = os.path.join(TMP, "work")
for d in (MEDIA, SHOW, SAMPLES, WORK):
    os.makedirs(d, exist_ok=True)


# ----------------------------------------------------------------- helpers ---

def photo(name: str) -> str:
    return os.path.join(PHOTOS, f"{name}.png")


def run(cmd: list[str]):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)}\n{r.stderr[-2000:]}")
    return r.stdout


def frame(pid: str, t: float, width: int = 960) -> Image.Image:
    r = call("preview.frame", project_id=pid, time_us=S(t), width=width)
    return Image.open(io.BytesIO(base64.b64decode(r["png_base64"]))).convert("RGB")


def sheet(pid: str, times: list[float], path: str, width: int = 480, cols: int = 4):
    ims = [frame(pid, t, width) for t in times]
    w, h = ims[0].size
    rows = (len(ims) + cols - 1) // cols
    out = Image.new("RGB", (cols * w, rows * h))
    for i, im in enumerate(ims):
        out.paste(im, ((i % cols) * w, (i // cols) * h))
    out.save(path)
    return path


def import_photos(pid: str, names: list[str]) -> dict[str, str]:
    r = call("media.import", project_id=pid, paths=[photo(n) for n in names])
    mats = {}
    for m in r["materials"]:
        mats[os.path.splitext(os.path.basename(m["path"]))[0]] = m["id"]
    for d in r.get("duplicates", []):
        mats[os.path.splitext(os.path.basename(d["path"]))[0]] = d["material_id"]
    return mats


def ken_burns(pid, seg, dur, s0, s1, x0=0.0, x1=0.0, y0=0.0, y1=0.0, easing="ease_in_out"):
    """Slow push/pan with scale + position keyframes (CapCut-style Ken Burns)."""
    for prop, a, b in (("transform.scale", s0, s1), ("transform.x", x0, x1), ("transform.y", y0, y1)):
        if a == b and prop != "transform.scale":
            continue
        call("keyframe.add", project_id=pid, segment_id=seg, property=prop, time_us=0, value=a, easing=easing)
        call("keyframe.add", project_id=pid, segment_id=seg, property=prop, time_us=S(dur), value=b, easing=easing)


def add_clip(pid, mat, dur, **kw):
    r = call("timeline.segment.add", project_id=pid, material_id=mat, duration_us=S(dur), **kw)
    return r["segment"]["id"]


def export_video(pid: str, name: str, resolution="720p", fps=30, **extra) -> str:
    out = os.path.join(WORK, f"{name}.mp4")
    start, st = k.export(pid, out, resolution=resolution, fps=fps, **extra)
    return st["path"], start, st


def probe(path: str) -> dict:
    out = run(["ffprobe", "-v", "error", "-show_entries",
               "format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,bit_rate",
               "-of", "json", path])
    return json.loads(out)


def enc_mp4(src, dst, w, h, crf=28, extra_vf="", audio=False, t=None, ss=None, preset="slow"):
    vf = f"scale={w}:{h}:flags=lanczos" + (f",{extra_vf}" if extra_vf else "")
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    if ss is not None:
        cmd += ["-ss", str(ss)]
    cmd += ["-i", src]
    if t is not None:
        cmd += ["-t", str(t)]
    cmd += ["-vf", vf, "-c:v", "libx264", "-preset", preset, "-crf", str(crf),
            "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart"]
    if audio:
        cmd += ["-af", "pan=mono|c0=0.5*c0+0.5*c1", "-c:a", "aac", "-b:a", "96k", "-ar", "48000"]
    else:
        cmd += ["-an"]
    cmd += [dst]
    run(cmd)
    return dst


def enc_webm(src, dst, w, h, crf=36, t=None, ss=None):
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    if ss is not None:
        cmd += ["-ss", str(ss)]
    cmd += ["-i", src]
    if t is not None:
        cmd += ["-t", str(t)]
    cmd += ["-vf", f"scale={w}:{h}:flags=lanczos", "-c:v", "libvpx-vp9", "-b:v", "0",
            "-crf", str(crf), "-row-mt", "1", "-deadline", "good", "-cpu-used", "1",
            "-pix_fmt", "yuv420p", "-an", dst]
    run(cmd)
    return dst


def webp_from(src_img: Image.Image | str, dst: str, size=None, q=80):
    im = Image.open(src_img) if isinstance(src_img, str) else src_img
    im = im.convert("RGB")
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    im.save(dst, "WEBP", quality=q, method=6)
    return dst


def poster_from_video(src, dst, t=0.0, size=None, q=80):
    tmp = os.path.join(WORK, "_poster.png")
    run(["ffmpeg", "-y", "-loglevel", "error", "-ss", str(t), "-i", src, "-frames:v", "1", tmp])
    return webp_from(tmp, dst, size, q)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(k.scrub(data), f, indent=2, ensure_ascii=False)
        f.write("\n")


def kb(path):
    return os.path.getsize(path) / 1024


# -------------------------------------------------------------------- hero ---

HERO = dict(
    clips=[("synthwave", 3.5), ("ocean", 3.5), ("city", 3.0)],
    transitions=["swirl_twist", "kaleido_turn"],
    trans_dur=0.6,
    filter=("teal_orange", 0.7),
    titles=[
        # text, start, end, style, glyph_in, glyph_out, y
        ("Edit by hand.", 0.25, 3.15, {"font": "sys_segoe_ui_black", "size": 56, "effect_id": "fx_neon_outline", "color": "#F0FFFF"},
         ("in_letter_rise", 0.9), ("out_letter_fade", 0.35), -0.42),
        ("Or by API.", 3.85, 6.7, {"font": "sys_cascadia_code", "bold": True, "size": 60, "effect_id": "fx_glitch_double"},
         ("in_scramble", 1.0), ("out_word_blur", 0.35), -0.40),
        ("Or just ask.", 7.3, 9.85, {"font": "sys_segoe_ui_black", "size": 58, "effect_id": "fx_3d_extrude"},
         ("in_letter_pop", 0.8), ("out_letter_drop", 0.35), -0.36),
    ],
    sticker=("sparkle_twinkle", 7.5, 2.35, 0.62, -0.62, 0.16),
)


def build_hero(cfg=HERO, name="Kadr hero"):
    pid = call("project.create", name=name, ratio="16:9", fps=30)["id"]
    names = [c for c, _ in cfg["clips"]]
    mats = import_photos(pid, names)
    segs = [add_clip(pid, mats[n], d) for n, d in cfg["clips"]]
    d0, d1, d2 = [d for _, d in cfg["clips"]]
    # Ken Burns moves: push into the sun, pan along the sea, ease out over the city
    ken_burns(pid, segs[0], d0, 1.04, 1.20, y0=0.0, y1=-0.035)
    ken_burns(pid, segs[1], d1, 1.18, 1.18, x0=0.07, x1=-0.07)
    ken_burns(pid, segs[2], d2, 1.24, 1.06, y0=-0.03, y1=0.0)
    for s, tr in zip(segs[:2], cfg["transitions"]):
        call("transition.set", project_id=pid, segment_id=s, type=tr, duration_us=S(cfg["trans_dur"]))
    fid, fint = cfg["filter"]
    call("filter.apply", project_id=pid, segment_id=segs[1], filter_id=fid, intensity=fint)
    texts = []
    for text, a, b, style, gin, gout, ty in cfg["titles"]:
        st = dict(style)
        st["glyph_in"] = {"id": gin[0], "duration_us": S(gin[1])}
        st["glyph_out"] = {"id": gout[0], "duration_us": S(gout[1])}
        r = call("text.add", project_id=pid, text=text, at_us=S(a), duration_us=S(b - a), style=st)
        call("segment.set_transform", project_id=pid, segment_id=r["segment_id"], y=ty)
        texts.append(r["segment_id"])
    sid, sa, sd, sx, sy, sc = cfg["sticker"]
    r = call("sticker.add", project_id=pid, sticker_id=sid, at_us=S(sa), duration_us=S(sd))
    stk = r["segment_id"]
    call("segment.set_transform", project_id=pid, segment_id=stk, x=sx, y=sy, scale=sc)
    call("animation.set", project_id=pid, segment_id=stk, kind="in", id="in_pop", duration_us=S(0.45))
    call("animation.set", project_id=pid, segment_id=stk, kind="loop", id="loop_pulse", duration_us=S(1.2))
    cut1, cut2 = d0, d0 + d1
    for t in (cut1, cut2):
        call("sfx.add", project_id=pid, sfx_id="whoosh_fast", at_us=S(t - 0.28))
    return pid, segs, texts, stk


def hero_preview(times=None):
    pid, *_ = build_hero()
    times = times or [0.3, 0.8, 1.6, 3.0, 3.35, 3.5, 3.65, 4.6, 6.0, 6.85, 7.0, 7.15, 7.6, 8.4, 9.5, 9.9]
    p = sheet(pid, times, os.path.join(WORK, "hero_sheet.png"), width=480, cols=4)
    print(pid, p)
    return pid


def kmeans_quant(im, k=256, iters=25, seed=0):
    """256-colour palette chosen by k-means (better than median cut on glows)."""
    import numpy as np
    a = np.asarray(im.convert("RGB")).reshape(-1, 3).astype(np.float32)
    rng = np.random.default_rng(seed)
    smp = a[rng.choice(len(a), 60000, replace=False)]
    c = smp[rng.choice(len(smp), k, replace=False)].copy()
    for _ in range(iters):
        lab = ((smp[:, None, :] - c[None, :, :]) ** 2).sum(-1).argmin(1)
        for j in range(k):
            m = smp[lab == j]
            c[j] = m.mean(0) if len(m) else smp[rng.integers(len(smp))]
    pal = Image.new("P", (1, 1))
    pal.putpalette(np.clip(c, 0, 255).astype(np.uint8).flatten().tolist())
    return im.convert("RGB").quantize(palette=pal, dither=Image.Dither.FLOYDSTEINBERG)


def find_log(command, pred=None):
    for e in k.LOG:
        if e["command"] == command and (pred is None or pred(e)):
            return e
    return None


def sample_from_log(fname, command, pred=None, transform=None):
    e = find_log(command, pred)
    if not e:
        print("no sample for", command)
        return
    resp = e["response"]
    if transform:
        resp = transform(json.loads(json.dumps(resp)))
    k.save_sample(os.path.join(SAMPLES, fname), e["request"], resp, command=command)


def trunc_png(resp):
    if resp.get("result", {}).get("png_base64"):
        resp["result"]["png_base64"] = "iVBORw0KGgo…"
    return resp


def do_hero():
    k.LOG.clear()
    pid, segs, texts, stk = build_hero()
    tl = call("timeline.get", project_id=pid)
    save_json(os.path.join(HERE, "hero-timeline.json"), tl)
    # API samples captured from this real session
    sample_from_log("project.create.json", "project.create")
    sample_from_log("text.add.json", "text.add")
    sample_from_log("timeline.get.json", "timeline.get")
    # OG frame: engine frame at 1280 px while "Edit by hand." is fully visible.
    # A full-colour PNG is ~1 MB (grain, stars, grid), so it gets a k-means
    # 256-colour palette + Floyd-Steinberg dither (smooth glow, ~320 KB).
    og = frame(pid, 1.9, 1280)
    sample_from_log("preview.frame.json", "preview.frame", transform=trunc_png)
    # source frame of the OpenGraph card (site/tools/og/og.html → assets/img/og.jpg)
    og_path = os.path.join(SITE, "tools", "og", "og-frame.webp")
    og.convert("RGB").save(og_path, quality=92, method=6)
    src, start, st = export_video(pid, "hero", resolution="720p", range_start_us=0, range_end_us=S(10.0))
    sample_from_log("export.start.json", "export.start")
    sample_from_log("export.status.json", "export.status", pred=lambda e: e["response"].get("result", {}).get("state") == "done")
    mp4 = enc_mp4(src, os.path.join(MEDIA, "hero.mp4"), 960, 540, crf=HERO_CRF[0], t=10.0)
    webm = enc_webm(src, os.path.join(MEDIA, "hero.webm"), 960, 540, crf=HERO_CRF[1], t=10.0)
    poster_from_video(mp4, os.path.join(SHOW, "hero-poster.webp"), t=0.0, q=80)
    print("hero", pid, src, f"mp4 {kb(mp4):.0f} KB, webm {kb(webm):.0f} KB, og {kb(og_path):.0f} KB")
    return pid


HERO_CRF = (26, 35)


# ---------------------------------------------------------------- captions ---

CAPTION_TEXT = "Kadr writes your captions right on your computer. Every word lights up as it is spoken."
CAPTION_STYLE = "cap_pill_active"
CAPTION_LEN = 7.0


def build_captions():
    pid = call("project.create", name="Kadr captions", ratio="9:16", fps=30)["id"]
    mats = import_photos(pid, ["aurora"])
    bg = add_clip(pid, mats["aurora"], CAPTION_LEN)
    # vertical crop of the wide photo: fill the 9:16 frame and pan slowly across it
    ken_burns(pid, bg, CAPTION_LEN, 3.2, 3.38, x0=0.72, x1=0.12, easing="ease_in_out")
    call("segment.set_adjust", project_id=pid, segment_id=bg, brightness=-0.18, vignette=0.45)
    call("tts.speak", project_id=pid, text=CAPTION_TEXT, voice="sapi:Microsoft Zira Desktop",
         rate=1.0, at_us=S(0.4))
    job = call("captions.auto", project_id=pid, wait=True, model="small", language="en",
               prompt="Kadr", style_id=CAPTION_STYLE)
    sample_from_log("captions.auto.json", "captions.auto")
    # short, punchy two-line cues
    call("captions.relayout", project_id=pid, max_chars=14, max_lines=2)
    cues = call("captions.list", project_id=pid, include_words=False)["cues"]
    # re-break the second sentence as "Every word lights up" / "as it is spoken."
    second = [c for c in cues if c["text"].replace("\n", " ").startswith("Every")]
    rest = [c for c in cues if cues.index(c) > cues.index(second[0])] if second else []
    if second and rest:
        merged = call("captions.merge", project_id=pid, segment_ids=[second[0]["segment_id"], rest[-1]["segment_id"]])
        words = merged["text"].replace("\n", " ").split()
        call("captions.split", project_id=pid, segment_id=merged["segment_id"], at_word=words.index("as"))
    cues = call("captions.list", project_id=pid, include_words=False)["cues"]
    # balanced two-line layout for every cue (word timings are kept by captions.update)
    for c in cues:
        flat = c["text"].replace("\n", " ")
        if "\n" not in c["text"] and len(flat.split()) > 2:
            w = flat.split()
            cut = max(range(1, len(w)), key=lambda i: -abs(len(" ".join(w[:i])) - len(" ".join(w[i:]))))
            call("captions.update", project_id=pid, segment_id=c["segment_id"],
                 text=" ".join(w[:cut]) + "\n" + " ".join(w[cut:]))
    cues = call("captions.list", project_id=pid, include_words=False)["cues"]
    # hold the last caption until the end of the clip
    call("captions.update", project_id=pid, segment_id=cues[-1]["segment_id"], end_us=S(CAPTION_LEN - 0.05))
    cues = call("captions.list", project_id=pid, include_words=False)["cues"]
    for c in cues:
        call("text.update", project_id=pid, segment_id=c["segment_id"], size=16, font="sys_segoe_ui_black")
        call("segment.set_transform", project_id=pid, segment_id=c["segment_id"], y=0.12)
    return pid, job


def do_captions():
    k.LOG.clear()
    pid, job = build_captions()
    words = {
        "text": CAPTION_TEXT,
        "voice": "sapi:Microsoft Zira Desktop",
        "style_id": CAPTION_STYLE,
        "transcript": call("transcript.get", project_id=pid),
        "captions": call("captions.list", project_id=pid),
    }
    save_json(os.path.join(HERE, "captions-words.json"), words)
    sheet(pid, [0.8, 1.6, 2.4, 3.2, 4.4, 5.6], os.path.join(WORK, "captions_sheet.png"), width=270, cols=6)
    src, *_ = export_video(pid, "captions", resolution="720p")
    mp4 = enc_mp4(src, os.path.join(MEDIA, "captions.mp4"), 360, 640, crf=26, audio=True)
    poster_from_video(mp4, os.path.join(SHOW, "captions-poster.webp"), t=1.2, q=80)
    print("captions", pid, f"{kb(mp4):.0f} KB")
    return pid


# ------------------------------------------------------------- transitions ---

REEL_CLIP = 1.9
REEL_TRANS = 0.8
REEL = [  # clip, Ken Burns (s0, s1, x0, x1, y0, y1), transition to the next clip
    ("dunes", (1.04, 1.15, 0.03, 0, 0, 0), "zoom_blur_through"),
    ("ocean", (1.16, 1.16, 0.05, -0.05, 0, 0), "page_peel"),
    ("forest", (1.14, 1.04, 0, 0, 0.02, 0), "iris_heart"),
    ("city", (1.05, 1.15, -0.03, 0.02, 0, 0), "block_glitch"),
    ("aurora", (1.04, 1.14, 0, 0, 0, 0.02), "cube_turn_left"),
    ("@grid", None, "photo_drop"),
    ("synthwave", (1.06, 1.16, 0, 0, 0, -0.02), None),
]
REEL_GRID = dict(kind="grid", params={"style": "perspective", "color": "#36E0FF", "background": "#07031a",
                                      "color2": "#2a0b55", "glow": True, "speed": 1.5, "cells": 16,
                                      "thickness": 2.5})


def build_transitions():
    pid = call("project.create", name="Kadr transitions", ratio="16:9", fps=30)["id"]
    mats = import_photos(pid, [c for c, *_ in REEL if not c.startswith("@")])
    segs = []
    for clip, kb_, _ in REEL:
        if clip == "@grid":
            g = call("media.generate", project_id=pid, duration_us=S(REEL_CLIP + 0.3), name="Neon grid", **REEL_GRID)
            segs.append(add_clip(pid, g["material_id"], REEL_CLIP))
            continue
        seg = add_clip(pid, mats[clip], REEL_CLIP)
        s0, s1, x0, x1, y0, y1 = kb_
        ken_burns(pid, seg, REEL_CLIP, s0, s1, x0, x1, y0, y1)
        segs.append(seg)
    lib = {i["id"]: i["name"] for i in call("library.list", kind="transition")["items"]}
    windows = []
    for i, (clip, _, tr) in enumerate(REEL):
        if not tr:
            continue
        call("transition.set", project_id=pid, segment_id=segs[i], type=tr, duration_us=S(REEL_TRANS))
        cut = REEL_CLIP * (i + 1)
        windows.append({"id": tr, "name": lib.get(tr, tr),
                        "start_s": round(cut - REEL_TRANS / 2, 3), "end_s": round(cut + REEL_TRANS / 2, 3)})
    return pid, segs, windows


def do_transitions():
    pid, segs, windows = build_transitions()
    total = REEL_CLIP * len(REEL)
    save_json(os.path.join(HERE, "transitions.json"), windows)
    mids = [round((w["start_s"] + w["end_s"]) / 2, 3) for w in windows]
    sheet(pid, sorted(mids + [m - 0.2 for m in mids] + [m + 0.2 for m in mids]),
          os.path.join(WORK, "transitions_sheet.png"), width=320, cols=6)
    src, *_ = export_video(pid, "transitions", resolution="720p")
    mp4 = enc_mp4(src, os.path.join(MEDIA, "transitions.mp4"), 640, 360, crf=REEL_CRF[0], t=total)
    webm = enc_webm(src, os.path.join(MEDIA, "transitions.webm"), 640, 360, crf=REEL_CRF[1], t=total)
    poster_from_video(mp4, os.path.join(SHOW, "transitions-poster.webp"), t=0.0, q=80)
    # contact sheet of the same project, straight from the engine
    cs = call("preview.contact_sheet", project_id=pid, count=12, columns=6, tile_width=240)
    im = Image.open(io.BytesIO(base64.b64decode(cs["png_base64"])))
    webp_from(im, os.path.join(SHOW, "contact-sheet.webp"), q=80)
    print("transitions", pid, f"mp4 {kb(mp4):.0f} KB webm {kb(webm):.0f} KB", cs["width"], cs["height"])
    return pid


REEL_CRF = (27, 38)


# ----------------------------------------------------------------- filters ---

FILTER_PHOTO = "forest"
FILTERS = ["teal_orange", "cyberpunk", "noir", "honey_glow", "cross_process", "duotone_sunset"]


def do_filters():
    pid = call("project.create", name="Kadr filters", ratio="16:9", fps=30)["id"]
    mats = import_photos(pid, [FILTER_PHOTO])
    seg = add_clip(pid, mats[FILTER_PHOTO], 3.0)
    lib = {i["id"]: i for i in call("library.list", kind="filter")["items"]}
    out = [{"id": "none", "name": "Original", "file": "filter-none.webp"}]
    webp_from(frame(pid, 1.0, 960), os.path.join(SHOW, "filter-none.webp"), q=80)
    for fid in FILTERS:
        call("filter.apply", project_id=pid, segment_id=seg, filter_id=fid, intensity=1.0)
        fn = f"filter-{fid}.webp"
        webp_from(frame(pid, 1.0, 960), os.path.join(SHOW, fn), q=80)
        out.append({"id": fid, "name": lib[fid]["name"], "file": fn})
    save_json(os.path.join(HERE, "filters.json"), out)
    print("filters", pid, sum(kb(os.path.join(SHOW, o["file"])) for o in out), "KB")
    return pid


# ------------------------------------------------------------ text effects ---

TEXTFX_WORD = "Kadr"
TEXTFX = ["fx_sunset_gradient", "fx_gold_metal", "fx_chrome", "fx_neon_outline", "fx_neon_pink", "fx_fire",
          "fx_ice", "fx_3d_extrude", "fx_retro_sunset_3d", "fx_glitch_double", "fx_sticker_cut", "fx_comic"]
TEXTFX_BG = {"type": "radial", "colors": ["#2b2450", "#100d1e", "#06050b"]}


def do_textfx(size=120):
    pid = call("project.create", name="Kadr text effects", ratio="16:9", fps=30)["id"]
    call("media.generate", project_id=pid, kind="gradient", params=TEXTFX_BG, duration_us=S(5),
         add_to_timeline=True, at_us=0)
    seg = call("text.add", project_id=pid, text=TEXTFX_WORD, at_us=0, duration_us=S(5),
               style={"font": "sys_segoe_ui_black", "size": size})["segment_id"]
    lib = {i["id"]: i for i in call("library.list", kind="text_effect")["items"]}
    out = []
    for fx in TEXTFX:
        call("text.apply_effect", project_id=pid, segment_id=seg, effect_id=fx)
        fn = f"textfx-{fx}.webp"
        webp_from(frame(pid, 1.0, 960), os.path.join(SHOW, fn), size=(480, 270), q=82)
        out.append({"id": fx, "name": lib[fx]["name"], "file": fn})
    save_json(os.path.join(HERE, "textfx.json"), out)
    print("textfx", pid, round(sum(kb(os.path.join(SHOW, o["file"])) for o in out)), "KB")
    return pid


# ------------------------------------------------------- text animation loop ---

TA_LEN = 6.0
TA_LINES = [
    # text, start, end, y, style, in, out, loop
    ("Letters rise,", 0.25, 5.55, -0.44,
     {"font": "sys_segoe_ui_black", "size": 54, "color": "#FFFFFF",
      "glow": {"color": "#8F7BFF", "intensity": 0.45, "radius": 0.35}},
     ("in_letter_rise", 1.0), ("out_letter_drop", 0.7), None),
    ("words scramble,", 0.75, 5.7, 0.0,
     {"font": "sys_cascadia_code", "bold": True, "size": 47, "effect_id": "fx_neon_outline", "color": "#E8FFFF"},
     ("in_scramble", 1.2), ("out_scramble", 0.7), None),
    ("titles wave.", 1.25, 5.85, 0.44,
     {"font": "sys_segoe_ui_black", "size": 58, "effect_id": "fx_sunset_gradient"},
     ("in_wave_rise", 1.1), ("out_letter_fade", 0.7), ("loop_wave", 1.4)),
]
TA_BG = dict(kind="gradient", params={"type": "linear", "colors": ["#1b0f3a", "#0a1230", "#2a0a33"],
                                      "angle": 35, "speed": 0.6})


def build_textanim():
    pid = call("project.create", name="Kadr text animation", ratio="16:9", fps=30)["id"]
    call("media.generate", project_id=pid, duration_us=S(TA_LEN), add_to_timeline=True, at_us=0,
         name="Dark flow", **TA_BG)
    for text, a, b, y, style, gin, gout, gloop in TA_LINES:
        st = dict(style)
        st["glyph_in"] = {"id": gin[0], "duration_us": S(gin[1])}
        st["glyph_out"] = {"id": gout[0], "duration_us": S(gout[1])}
        if gloop:
            st["glyph_loop"] = {"id": gloop[0], "duration_us": S(gloop[1])}
        seg = call("text.add", project_id=pid, text=text, at_us=S(a), duration_us=S(b - a), style=st)["segment_id"]
        call("segment.set_transform", project_id=pid, segment_id=seg, y=y)
    return pid


def do_textanim():
    pid = build_textanim()
    sheet(pid, [0.5, 0.9, 1.4, 1.9, 2.6, 3.4, 4.9, 5.3, 5.7], os.path.join(WORK, "textanim_sheet.png"), width=320, cols=3)
    src, *_ = export_video(pid, "textanim", resolution="720p")
    mp4 = enc_mp4(src, os.path.join(MEDIA, "text-anim.mp4"), 640, 360, crf=27, t=TA_LEN)
    webm = enc_webm(src, os.path.join(MEDIA, "text-anim.webm"), 640, 360, crf=36, t=TA_LEN)
    poster_from_video(mp4, os.path.join(SHOW, "text-anim-poster.webp"), t=3.0, q=80)
    print("textanim", pid, f"mp4 {kb(mp4):.0f} KB webm {kb(webm):.0f} KB")
    return pid


# ------------------------------------------------------------- API samples ---

def do_samples():
    """Real request/response pairs for the site's API section. The hero and
    captions runs already saved project.create, text.add, timeline.get,
    preview.frame, export.start, export.status and captions.auto."""
    k.LOG.clear()
    pid = call("project.create", name="API sample", ratio="16:9")["id"]
    mats = import_photos(pid, ["ocean"])
    seg = add_clip(pid, mats["ocean"], 6.0)
    call("timeline.segment.split", project_id=pid, segment_id=seg, at_us=S(2.5))
    sample_from_log("timeline.segment.split.json", "timeline.segment.split")
    return pid


# --------------------------------------------------------- vertical (social) ---

VERT_LEN = 6.0
VERT = [  # photo, dur, ken burns (s0, s1, x0, x1), template, text, size, transition to next
    ("ocean", 2.0, (3.25, 3.6, 0.10, -0.05), "gradient_pop_title", "golden hour", 24, ("flash_zoom", 0.36)),
    ("city", 2.0, (3.3, 3.5, -0.35, 0.05), "neon_sign_pink", "city lights", 25, ("whip_pan", 0.4)),
    ("synthwave", 2.0, (3.5, 3.2, 0.0, 0.0), "chrome_retro_title", "retro nights", 17, None),
]


def build_vertical():
    pid = call("project.create", name="Kadr vertical", ratio="9:16", fps=30)["id"]
    mats = import_photos(pid, [v[0] for v in VERT])
    segs, t = [], 0.0
    for ph, d, (s0, s1, x0, x1), tpl, text, size, _ in VERT:
        seg = add_clip(pid, mats[ph], d)
        ken_burns(pid, seg, d, s0, s1, x0, x1)
        segs.append(seg)
        r = call("text.add", project_id=pid, text=text, template_id=tpl, at_us=S(t + 0.15),
                 duration_us=S(d - 0.3), style={"size": size})
        call("segment.set_transform", project_id=pid, segment_id=r["segment_id"], y=-0.62 if ph == "synthwave" else -0.42)
        t += d
    for seg, v in zip(segs, VERT):
        if v[6]:
            call("transition.set", project_id=pid, segment_id=seg, type=v[6][0], duration_us=S(v[6][1]))
    call("effect.add", project_id=pid, effect_id="lens_flare_sweep", at_us=S(0.1), duration_us=S(1.7))
    call("effect.apply", project_id=pid, segment_id=segs[1], effect_id="bokeh_drift")
    st = call("sticker.add", project_id=pid, sticker_id="ui_like_heart", at_us=S(4.5), duration_us=S(1.45))["segment_id"]
    call("segment.set_transform", project_id=pid, segment_id=st, x=0.52, y=0.62, scale=0.32)
    call("animation.set", project_id=pid, segment_id=st, kind="in", id="in_elastic_pop", duration_us=S(0.5))
    call("animation.set", project_id=pid, segment_id=st, kind="loop", id="loop_heartbeat", duration_us=S(0.8))
    st2 = call("sticker.add", project_id=pid, sticker_id="fire", at_us=S(4.3), duration_us=S(1.65))["segment_id"]
    call("segment.set_transform", project_id=pid, segment_id=st2, x=-0.66, y=-0.86, scale=0.2, rotation=-12)
    call("animation.set", project_id=pid, segment_id=st2, kind="in", id="in_pop", duration_us=S(0.4))
    return pid


def do_vertical():
    pid = build_vertical()
    sheet(pid, [0.3, 1.0, 1.8, 2.0, 2.6, 3.4, 4.0, 4.6, 5.5], os.path.join(WORK, "vertical_sheet.png"), width=180, cols=9)
    src, *_ = export_video(pid, "vertical", resolution="720p")
    mp4 = enc_mp4(src, os.path.join(MEDIA, "vertical.mp4"), 360, 640, crf=28, t=VERT_LEN)
    poster_from_video(mp4, os.path.join(SHOW, "vertical-poster.webp"), t=0.0, q=80)
    print("vertical", pid, f"{kb(mp4):.0f} KB")
    return pid


# ------------------------------------------------------- background removal ---

BGR_BG = dict(kind="gradient", params={"type": "radial", "colors": ["#4ff0ff", "#5b3cff", "#1a0a40"]})


def do_bgremove():
    k.LOG.clear()
    pid = call("project.create", name="Kadr remove background", ratio="16:9", fps=30)["id"]
    call("media.generate", project_id=pid, duration_us=S(3), add_to_timeline=True, at_us=0,
         name="Backdrop", **BGR_BG)
    mats = import_photos(pid, ["camera"])
    seg = call("timeline.segment.add", project_id=pid, material_id=mats["camera"], at_us=0,
               duration_us=S(3), new_track=True)["segment"]["id"]
    before = frame(pid, 1.0, 960)
    res = call("ai.remove_background", project_id=pid, segment_id=seg, wait=True, _timeout=1200)
    after = frame(pid, 1.0, 960)
    webp_from(before, os.path.join(SHOW, "bgremove-before.webp"), q=80)
    webp_from(after, os.path.join(SHOW, "bgremove-after.webp"), q=80)
    print("bgremove", pid, res.get("state"), res.get("provider"), res.get("model"))
    return pid


# -------------------------------------------------------------------- main ---

STEPS = {
    "hero": do_hero,              # 1 + 8 (og-frame) + samples
    "captions": do_captions,      # 2
    "transitions": do_transitions,  # 3 + 7 (contact sheet)
    "filters": do_filters,        # 4
    "textfx": do_textfx,          # 5
    "textanim": do_textanim,      # 6
    "samples": do_samples,        # 9 (timeline.segment.split)
    "vertical": do_vertical,      # 10 (optional)
    "bgremove": do_bgremove,      # 10 (optional)
}


def budget():
    files = [os.path.join(MEDIA, f) for f in sorted(os.listdir(MEDIA))] + \
            [os.path.join(SHOW, f) for f in sorted(os.listdir(SHOW))]
    total = 0
    for f in files:
        size = kb(f)
        counted = not f.endswith("og-frame.png")
        total += size if counted else 0
        print(f"{size:8.1f} KB  {os.path.relpath(f, SITE)}{'' if counted else '  (not counted)'}")
    print(f"{total:8.1f} KB  total (budget 4500 KB)")


def main(argv):
    steps = argv or ["all"]
    if steps == ["all"]:
        steps = list(STEPS)
    for s in steps:
        if s == "budget":
            continue
        t0 = time.time()
        STEPS[s]()
        print(f"[{s}] {time.time() - t0:.1f}s")
    budget()


if __name__ == "__main__":
    main(sys.argv[1:])
