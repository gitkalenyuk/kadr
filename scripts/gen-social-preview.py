#!/usr/bin/env python3
"""Renders assets/social-preview.png (1280x640), the GitHub social card of gitkalenyuk/kadr.

Original art built from the Kadr brand: the "K" mark made of five timeline clips next to a white stem
(same geometry as build/brand/gen/gen_brand.py), the teal / violet / pink palette, Inter for the type, and a
stylised editor window (player + timeline + playhead) with an agent's API call floating over it.

Usage (from the release repo or the source tree):
    python scripts/gen-social-preview.py [--out assets/social-preview.png] [--font path/to/Inter.woff2|.ttf]

Needs Python 3.9+, Pillow (with FreeType) and numpy. The Inter variable font is looked up in
$KADR_INTER_FONT, site/assets/fonts/inter-var-latin.woff2 (release repo or source tree), then
frontend/public/Inter-Medium.ttf. Deterministic: the same inputs give the same PNG.
"""
from __future__ import annotations

import argparse
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 640
S = 2  # supersampling factor; everything is drawn at 2x and downsampled once

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)  # release-repo/
SOURCE = os.path.dirname(REPO)  # source tree root when release-repo/ sits inside it

# ---------------------------------------------------------------- palette (build/brand)
TEAL = ("#13c4ce", "#7cf4f8")
VIOLET = ("#6c55ff", "#a993ff")
PINK = ("#ff2f86", "#ff8a5b")
STEM = ("#ffffff", "#d3d9e3")
ACCENT_TEAL = "#1fd1db"
ACCENT_PINK = "#ff3d8b"
ACCENT_VIOLET = "#6c55ff"
BG_TOP, BG_BOTTOM = "#121318", "#08080b"
TEXT = "#f2f4f8"
MUTED = "#a3a9b8"
DIM = "#6f7586"

# K mark geometry in 1024 units (build/brand/gen/gen_brand.py)
ROW_Y0, ROW_H, ROW_PITCH = 230, 92, 118
STEM_X, STEM_W = 232, 120
BARS = [(614, 182), (496, 210), (378, 232), (496, 210), (614, 182)]
ROW_FILLS = [TEAL, TEAL, VIOLET, PINK, PINK]
MARK_X0, MARK_Y0, MARK_SIZE = 232, 230, 564  # bounding square of the mark


def rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def s(v: float) -> int:
    return int(round(v * S))


# ---------------------------------------------------------------- fonts

def find_font(explicit: str | None) -> str:
    cands = [explicit, os.environ.get("KADR_INTER_FONT")]
    for root in (REPO, SOURCE):
        cands.append(os.path.join(root, "site", "assets", "fonts", "inter-var-latin.woff2"))
    cands.append(os.path.join(SOURCE, "frontend", "public", "Inter-Medium.ttf"))
    for c in cands:
        if c and os.path.isfile(c):
            return c
    sys.exit("Inter font not found: pass --font or set KADR_INTER_FONT (site/assets/fonts/inter-var-latin.woff2)")


class Fonts:
    def __init__(self, path: str):
        self.path = path
        self.cache: dict[tuple[int, str], ImageFont.FreeTypeFont] = {}

    def get(self, size: float, weight: str = "Regular") -> ImageFont.FreeTypeFont:
        key = (s(size), weight)
        if key not in self.cache:
            f = ImageFont.truetype(self.path, s(size))
            try:
                f.set_variation_by_name(weight)
            except Exception:  # static font (Inter-Medium.ttf) or name missing: keep its own weight
                pass
            self.cache[key] = f
        return self.cache[key]


# ---------------------------------------------------------------- drawing helpers

def gradient(w: int, h: int, c0: str, c1: str, vertical: bool = False) -> Image.Image:
    a, b = np.array(rgb(c0), np.float32), np.array(rgb(c1), np.float32)
    n = h if vertical else w
    t = np.linspace(0.0, 1.0, max(n, 1), dtype=np.float32)[:, None]
    line = (a + (b - a) * t).astype(np.uint8)  # n x 3
    arr = np.repeat(line[:, None, :], w, axis=1) if vertical else np.repeat(line[None, :, :], h, axis=0)
    return Image.fromarray(arr, "RGB")


def paste_rounded(canvas: Image.Image, box, radius: float, fill, vertical=False, alpha: float = 1.0) -> None:
    """Rounded rectangle in 1x coordinates; fill is a colour or a (c0, c1) gradient pair."""
    x0, y0, x1, y1 = (s(v) for v in box)
    w, h = max(x1 - x0, 1), max(y1 - y0, 1)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w - 1, h - 1), radius=s(radius), fill=int(255 * alpha))
    if isinstance(fill, tuple) and isinstance(fill[0], str):
        src = gradient(w, h, fill[0], fill[1], vertical)
    else:
        src = Image.new("RGB", (w, h), rgb(fill) if isinstance(fill, str) else fill)
    canvas.paste(src, (x0, y0), mask)


def outline_rounded(canvas: Image.Image, box, radius: float, color: str, width: float = 1, alpha: float = 1.0) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    r, g, b = rgb(color)
    ImageDraw.Draw(layer).rounded_rectangle([s(v) for v in box], radius=s(radius),
                                            outline=(r, g, b, int(255 * alpha)), width=max(1, s(width)))
    canvas.alpha_composite(layer)


def glow(arr: np.ndarray, cx: float, cy: float, radius: float, color: str, strength: float) -> None:
    """Adds a soft radial light (Gaussian falloff) to a float32 RGB array in place."""
    hh, ww, _ = arr.shape
    ys = np.arange(hh, dtype=np.float32)[:, None]
    xs = np.arange(ww, dtype=np.float32)[None, :]
    d2 = ((xs - s(cx)) ** 2 + (ys - s(cy)) ** 2) / float(s(radius)) ** 2
    a = (strength * np.exp(-d2 * 2.2)).astype(np.float32)[..., None]
    c = np.array(rgb(color), np.float32)[None, None, :]
    arr += (c - arr) * a


def text(canvas: Image.Image, xy, value: str, font, color: str, alpha: float = 1.0, anchor: str = "ls") -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    r, g, b = rgb(color)
    ImageDraw.Draw(layer).text((s(xy[0]), s(xy[1])), value, font=font, fill=(r, g, b, int(255 * alpha)), anchor=anchor)
    canvas.alpha_composite(layer)


def gradient_text(canvas: Image.Image, xy, value: str, font, c0: str, c1: str, anchor: str = "ls") -> None:
    mask = Image.new("L", canvas.size, 0)
    ImageDraw.Draw(mask).text((s(xy[0]), s(xy[1])), value, font=font, fill=255, anchor=anchor)
    bbox = mask.getbbox()
    if not bbox:
        return
    x0, y0, x1, y1 = bbox
    grad = gradient(x1 - x0, y1 - y0, c0, c1).convert("RGBA")
    canvas.paste(grad, (x0, y0), mask.crop(bbox))


def width_of(font, value: str) -> float:
    return font.getlength(value) / S


def shadow(canvas: Image.Image, box, radius: float, blur: float, offset_y: float, alpha: float) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    x0, y0, x1, y1 = box
    ImageDraw.Draw(layer).rounded_rectangle([s(x0), s(y0 + offset_y), s(x1), s(y1 + offset_y)],
                                            radius=s(radius), fill=(0, 0, 0, int(255 * alpha)))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(s(blur))))


# ---------------------------------------------------------------- pieces

def background() -> Image.Image:
    arr = np.asarray(gradient(s(W), s(H), BG_TOP, BG_BOTTOM, vertical=True), dtype=np.float32).copy()
    glow(arr, 250, 150, 430, ACCENT_TEAL, 0.20)
    glow(arr, 860, 40, 360, ACCENT_VIOLET, 0.16)
    glow(arr, 1210, 640, 470, ACCENT_PINK, 0.22)
    glow(arr, 40, 660, 300, ACCENT_VIOLET, 0.10)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").convert("RGBA")
    # faint dot grid, like a timeline ruler seen from afar
    dots = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(dots)
    for y in range(24, H, 32):
        for x in range(24, W, 32):
            fade = 0.35 + 0.65 * (x / W)
            d.ellipse([s(x) - 1.5, s(y) - 1.5, s(x) + 1.5, s(y) + 1.5], fill=(255, 255, 255, int(16 * fade)))
    img.alpha_composite(dots)
    return img


def mark(canvas: Image.Image, x: float, y: float, size: float) -> None:
    k = size / MARK_SIZE

    def box(bx, by, bw, bh):
        return (x + (bx - MARK_X0) * k, y + (by - MARK_Y0) * k, x + (bx - MARK_X0 + bw) * k, y + (by - MARK_Y0 + bh) * k)

    radius = 28 * k
    # soft light behind the mark
    halo = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    r, g, b = rgb(ACCENT_TEAL)
    ImageDraw.Draw(halo).ellipse([s(x - size * 0.15), s(y - size * 0.15), s(x + size * 1.15), s(y + size * 1.15)],
                                 fill=(r, g, b, 46))
    canvas.alpha_composite(halo.filter(ImageFilter.GaussianBlur(s(size * 0.28))))
    paste_rounded(canvas, box(STEM_X, ROW_Y0, STEM_W, ROW_H * 5 + (ROW_PITCH - ROW_H) * 4), radius, STEM, vertical=True)
    for i, ((bx, bw), fill) in enumerate(zip(BARS, ROW_FILLS)):
        paste_rounded(canvas, box(bx, ROW_Y0 + i * ROW_PITCH, bw, ROW_H), radius, fill)


def chip(canvas: Image.Image, x: float, y: float, label: str, font, accent: str) -> float:
    pad, h = 16, 38
    w = width_of(font, label) + pad * 2 + 14
    paste_rounded(canvas, (x, y, x + w, y + h), h / 2, "#17181f", alpha=0.92)
    outline_rounded(canvas, (x, y, x + w, y + h), h / 2, accent, 1.2, 0.75)
    dot = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    r, g, b = rgb(accent)
    ImageDraw.Draw(dot).ellipse([s(x + pad - 1), s(y + h / 2 - 4), s(x + pad + 7), s(y + h / 2 + 4)], fill=(r, g, b, 255))
    canvas.alpha_composite(dot)
    text(canvas, (x + pad + 14, y + h / 2 + 1), label, font, TEXT, anchor="lm")
    return w


def editor_card(canvas: Image.Image, fonts: Fonts) -> None:
    x0, y0, x1, y1 = 676, 92, 1208, 556
    shadow(canvas, (x0, y0, x1, y1), 24, 28, 22, 0.55)
    paste_rounded(canvas, (x0, y0, x1, y1), 24, ("#16171d", "#0f1014"), vertical=True)
    outline_rounded(canvas, (x0, y0, x1, y1), 24, "#2b2d38", 1.2)

    # title bar
    for i, c in enumerate(("#3a3d4a", "#3a3d4a", "#3a3d4a")):
        paste_rounded(canvas, (x0 + 22 + i * 18, y0 + 18, x0 + 32 + i * 18, y0 + 28), 5, c)
    text(canvas, ((x0 + x1) / 2, y0 + 24), "Trip to the sea  ·  9:16", fonts.get(14, "Medium"), MUTED, anchor="mm")
    paste_rounded(canvas, (x1 - 92, y0 + 12, x1 - 20, y0 + 36), 12, (ACCENT_TEAL, "#7cf4f8"))
    text(canvas, (x1 - 56, y0 + 24.5), "Export", fonts.get(13, "SemiBold"), "#061316", anchor="mm")

    # player
    px0, py0, px1, py1 = x0 + 20, y0 + 46, x1 - 20, y0 + 262
    paste_rounded(canvas, (px0, py0, px1, py1), 14, "#0a0b0e")
    fw = 118  # 9:16 frame
    fh = fw * 16 / 9
    fx0 = (px0 + px1) / 2 - fw / 2
    fy0 = py0 + (py1 - py0 - fh) / 2
    frame = gradient(s(fw), s(fh), "#5b46f0", "#ff5a8f", vertical=True).convert("RGBA")
    arr = np.asarray(frame, dtype=np.float32)[..., :3].copy()
    sun_y = fh * 0.56
    hh, ww, _ = arr.shape
    ys = np.arange(hh, dtype=np.float32)[:, None] / S
    xs = np.arange(ww, dtype=np.float32)[None, :] / S
    d = np.sqrt((xs - fw * 0.5) ** 2 + (ys - sun_y) ** 2)
    sun = np.clip(1.0 - (d - 17) / 2.5, 0, 1)[..., None]
    halo = np.exp(-((d / 46.0) ** 2))[..., None] * 0.45
    arr += (np.array(rgb("#ffd7a8"), np.float32) - arr) * halo
    arr += (np.array(rgb("#fff1dc"), np.float32) - arr) * sun
    sea = (ys > sun_y + 6).astype(np.float32)[..., None]
    arr += (np.array(rgb("#2a1d6e"), np.float32) - arr) * sea * 0.82
    for k in range(5):  # sun reflections on the water
        ry = sun_y + 14 + k * 9
        band = ((np.abs(ys - ry) < 1.3) & (np.abs(xs - fw * 0.5) < 22 - k * 3.5)).astype(np.float32)[..., None]
        arr += (np.array(rgb("#ffb38a"), np.float32) - arr) * band * 0.7
    frame = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    fmask = Image.new("L", frame.size, 0)
    ImageDraw.Draw(fmask).rounded_rectangle((0, 0, frame.size[0] - 1, frame.size[1] - 1), radius=s(8), fill=255)
    canvas.paste(frame, (s(fx0), s(fy0)), fmask)
    # caption with word highlight + on-canvas selection handles
    cap_font = fonts.get(12.5, "ExtraBold")
    w1, w2 = "every edit is an", "API call"
    cy = fy0 + fh * 0.30
    text(canvas, (fx0 + fw / 2, cy), w1, cap_font, "#ffffff", anchor="mm")
    hw = width_of(cap_font, w2) + 10
    paste_rounded(canvas, (fx0 + fw / 2 - hw / 2, cy + 9, fx0 + fw / 2 + hw / 2, cy + 27), 5, ACCENT_PINK)
    text(canvas, (fx0 + fw / 2, cy + 18), w2, cap_font, "#ffffff", anchor="mm")
    sx0, sy0, sx1, sy1 = fx0 + 6, cy - 12, fx0 + fw - 6, cy + 32
    outline_rounded(canvas, (sx0, sy0, sx1, sy1), 3, ACCENT_TEAL, 1.2)
    for hx, hy in ((sx0, sy0), (sx1, sy0), (sx0, sy1), (sx1, sy1)):
        paste_rounded(canvas, (hx - 3.5, hy - 3.5, hx + 3.5, hy + 3.5), 1.5, "#ffffff")
    # player transport under the frame area
    text(canvas, (px0 + 16, py1 - 14), "00:00:04:12", fonts.get(12, "Medium"), MUTED, anchor="ls")
    text(canvas, (px1 - 16, py1 - 14), "00:00:15:00", fonts.get(12, "Medium"), DIM, anchor="rs")

    # timeline
    tx0, tx1 = x0 + 20, x1 - 20
    ty = y0 + 282
    rf = fonts.get(10.5, "Medium")
    for i in range(0, int(tx1 - tx0) + 1, 16):
        major = i % 96 == 0
        layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).line([s(tx0 + i), s(ty + (0 if major else 6)), s(tx0 + i), s(ty + 12)],
                                   fill=(255, 255, 255, 70 if major else 34), width=max(1, s(0.8)))
        canvas.alpha_composite(layer)
        if major:
            text(canvas, (tx0 + i + 4, ty + 9), f"00:{i // 48:02d}", rf, DIM, anchor="ls")
    rows = [
        ("Title", VIOLET, [(40, 150), (232, 330)]),
        ("clip", TEAL, [(0, 132), (136, 290), (294, 492)]),
        ("voiceover.wav", PINK, [(0, 410)]),
        ("Glow", ("#ff8a5b", "#ffc07a"), [(186, 300)]),
    ]
    th, gap = 30, 9
    labels = ["Title", "Day 1", "beach_01.mp4", "", "", "voiceover.wav", "Glow"]
    li = 0
    for r_i, (_name, fill, clips) in enumerate(rows):
        yy = ty + 22 + r_i * (th + gap)
        for c0, c1 in clips:
            bx0, bx1 = tx0 + c0, tx0 + c1
            paste_rounded(canvas, (bx0, yy, bx1, yy + th), 6, fill)
            label = labels[li] if li < len(labels) else ""
            lx = bx0 + (13 if (r_i == 1 and c0 > 0) else 8)  # clear of the transition marker
            if r_i == 1:  # filmstrip frames on video clips, after the label
                start = lx + width_of(fonts.get(11, "SemiBold"), label) + (8 if label else 0)
                for fx in np.arange(start, bx1 - 26, 30):
                    paste_rounded(canvas, (fx, yy + 4, fx + 24, yy + th - 4), 3, "#0b3f45", alpha=0.35)
            if r_i == 2:  # waveform
                layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
                dd = ImageDraw.Draw(layer)
                for j, wx in enumerate(np.arange(bx0 + 6, bx1 - 4, 3.0)):
                    amp = 0.25 + 0.75 * abs(math.sin(j * 0.37) * math.cos(j * 0.11 + 0.6))
                    hgt = (th - 10) * amp / 2
                    dd.line([s(wx), s(yy + th / 2 - hgt), s(wx), s(yy + th / 2 + hgt)], fill=(255, 255, 255, 120),
                            width=max(1, s(1.2)))
                canvas.alpha_composite(layer)
            li += 1
            text(canvas, (lx, yy + th / 2 + 0.5), label, fonts.get(11, "SemiBold"), "#ffffff", 0.92, anchor="lm")
        if r_i == 1:  # transition markers between video clips
            for c0, _ in clips[1:]:
                cx, cy2 = tx0 + c0 - 2, yy + th / 2
                layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
                ImageDraw.Draw(layer).polygon([(s(cx), s(cy2 - 7)), (s(cx + 7), s(cy2)), (s(cx), s(cy2 + 7)), (s(cx - 7), s(cy2))],
                                              fill=(255, 255, 255, 235))
                canvas.alpha_composite(layer)
    # playhead
    phx = tx0 + 350
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    r, g, b = rgb(ACCENT_PINK)
    dd = ImageDraw.Draw(layer)
    dd.line([s(phx), s(ty - 2), s(phx), s(y1 - 14)], fill=(r, g, b, 255), width=s(2))
    dd.rounded_rectangle([s(phx - 6), s(ty - 8), s(phx + 6), s(ty + 6)], radius=s(3), fill=(r, g, b, 255))
    canvas.alpha_composite(layer)


def api_bubble(canvas: Image.Image, fonts: Fonts) -> None:
    x0, y0, x1, y1 = 600, 470, 928, 562
    shadow(canvas, (x0, y0, x1, y1), 16, 18, 14, 0.6)
    paste_rounded(canvas, (x0, y0, x1, y1), 16, "#1b1c24", alpha=0.97)
    outline_rounded(canvas, (x0, y0, x1, y1), 16, "#343746", 1.2)
    paste_rounded(canvas, (x0 + 14, y0 + 16, x0 + 18, y1 - 16), 2, (ACCENT_TEAL, ACCENT_PINK), vertical=True)
    hf = fonts.get(14, "SemiBold")
    text(canvas, (x0 + 32, y0 + 33), "AI agent", hf, ACCENT_TEAL, anchor="ls")
    ax = x0 + 32 + width_of(hf, "AI agent") + 10  # Inter's latin subset has no arrow glyph: draw one
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    r, g, b = rgb(ACCENT_TEAL)
    da = ImageDraw.Draw(layer)
    da.line([s(ax), s(y0 + 28), s(ax + 18), s(y0 + 28)], fill=(r, g, b, 255), width=s(1.6))
    da.polygon([(s(ax + 20), s(y0 + 28)), (s(ax + 14), s(y0 + 24)), (s(ax + 14), s(y0 + 32))], fill=(r, g, b, 255))
    canvas.alpha_composite(layer)
    text(canvas, (ax + 30, y0 + 33), "kadr-mcp", hf, ACCENT_TEAL, anchor="ls")
    text(canvas, (x0 + 32, y0 + 62), "timeline_segment_split", fonts.get(18, "SemiBold"), TEXT, anchor="ls")
    t = fonts.get(13, "Medium")
    text(canvas, (x0 + 32, y0 + 81), "at_us: 4500000  ·  1 undo step", t, MUTED, anchor="ls")
    # check mark badge
    cx, cy = x1 - 34, y0 + 46
    paste_rounded(canvas, (cx - 15, cy - 15, cx + 15, cy + 15), 15, ("#21e6a0", "#1fd1db"))
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).line([(s(cx - 7), s(cy + 0.5)), (s(cx - 2), s(cy + 5.5)), (s(cx + 7.5), s(cy - 5.5))],
                               fill=(6, 30, 26, 255), width=s(3), joint="curve")
    canvas.alpha_composite(layer)


def left_column(canvas: Image.Image, fonts: Fonts) -> None:
    x = 72
    col_w = 560
    mark(canvas, x, 86, 104)
    word = fonts.get(118, "ExtraBold")
    text(canvas, (x + 104 + 26, 86 + 104 - 2), "Kadr", word, TEXT, anchor="ls")

    # tagline: largest size (<= 54) whose lines fit the column
    lines = ["The video editor", "your AI agent can drive."]
    size = 54.0
    while size > 36 and max(width_of(fonts.get(size, "Bold"), l) for l in lines) > col_w:
        size -= 1
    f = fonts.get(size, "Bold")
    y = 278
    text(canvas, (x, y), lines[0], f, TEXT, anchor="ls")
    y += size * 1.14
    gradient_text(canvas, (x, y), lines[1], f, ACCENT_TEAL, ACCENT_PINK, anchor="ls")

    sub = fonts.get(21, "Medium")
    y += 44
    text(canvas, (x, y), "A CapCut-style desktop editor where every button,", sub, MUTED, anchor="ls")
    y += 29
    text(canvas, (x, y), "hotkey and menu item is also an API call.", sub, MUTED, anchor="ls")

    cf = fonts.get(16, "SemiBold")
    cx, cy = x, y + 30
    for label, accent in (("MCP for AI agents", ACCENT_PINK), ("REST · CLI", ACCENT_VIOLET), ("Offline", ACCENT_TEAL)):
        cx += chip(canvas, cx, cy, label, cf, accent) + 10

    text(canvas, (x, H - 46), "gitkalenyuk.github.io/kadr", fonts.get(17, "Medium"), DIM, anchor="ls")


def render(font_path: str) -> Image.Image:
    fonts = Fonts(font_path)
    canvas = background()
    editor_card(canvas, fonts)
    left_column(canvas, fonts)
    api_bubble(canvas, fonts)
    return canvas.convert("RGB").resize((W, H), Image.LANCZOS)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=os.path.join(REPO, "assets", "social-preview.png"))
    ap.add_argument("--font", default=None, help="Inter font (variable WOFF2/TTF preferred)")
    args = ap.parse_args()
    font = find_font(args.font)
    img = render(font)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    img.save(args.out, "PNG", optimize=True)
    print(f"wrote {args.out} ({img.size[0]}x{img.size[1]}, {os.path.getsize(args.out) / 1024:.0f} KB) using {font}")


if __name__ == "__main__":
    main()
