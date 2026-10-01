"""Procedural "photos" for the Kadr showcase renders (numpy + PIL only).

There is no stock footage in the project, so every backdrop used in the
showcase videos is painted here from scratch: gradients, fractal noise,
height-field silhouettes, analytic anti-aliasing, glows computed in linear
light, then tone-mapped, dithered and given a fine film grain.

    python gen_photos.py <out_dir> [scene ...]

Scenes: synthwave, forest, ocean, city, dunes, aurora, camera  (default: all)
Each scene is written as <out_dir>/<scene>.png at 1920x1080.
"""
from __future__ import annotations

import math
import os
import sys
import time

import numpy as np
from PIL import Image

W, H = 1920, 1080
F32 = np.float32


# ----------------------------------------------------------------- helpers ---

def hexc(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], F32)


def to_lin(c):
    return np.power(np.clip(c, 0, None), 2.2).astype(F32)


def lhex(h: str) -> np.ndarray:
    """sRGB hex -> linear rgb."""
    return to_lin(hexc(h))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a + (b - a) * t


def grid():
    y, x = np.mgrid[0:H, 0:W].astype(F32)
    return x, y


def vgrad(stops, h=H):
    """Vertical gradient (Hx1x3, linear light) from [(pos 0..1, '#hex'), ...]
    interpolated in sRGB (perceptual), so the designed colours are hit."""
    ys = (np.arange(h, dtype=F32) + 0.5) / h
    pos = np.array([p for p, _ in stops], F32)
    cols = np.stack([hexc(c) for _, c in stops])
    out = np.stack([np.interp(ys, pos, cols[:, k]) for k in range(3)], -1)
    return to_lin(out)[:, None, :].astype(F32)


def resize_f(a: np.ndarray, w: int, h: int) -> np.ndarray:
    return np.asarray(Image.fromarray(a.astype(F32), "F").resize((w, h), Image.BICUBIC), F32)


def _box1(a, r, axis):
    if r < 1:
        return a
    n = a.shape[axis]
    pad = [(0, 0)] * a.ndim
    pad[axis] = (r + 1, r)
    p = np.pad(a, pad, mode="edge")
    c = np.cumsum(p, axis=axis, dtype=np.float64)
    hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
    lo = np.take(c, np.arange(0, n), axis=axis)
    return ((hi - lo) / (2 * r + 1)).astype(F32)


def blur(a: np.ndarray, sigma: float, sigma_y: float | None = None) -> np.ndarray:
    """Approximate gaussian blur (3 box passes), works on HxW or HxWxC floats.
    Large radii are blurred on a downscaled copy (smooth and fast)."""
    sy = sigma if sigma_y is None else sigma_y
    sx = sigma
    if max(sx, sy) > 12:
        f = max(sx, sy) / 6.0
        h, w = a.shape[:2]
        sw, sh = max(4, int(w / f)), max(4, int(h / f))
        if a.ndim == 3:
            small = np.stack([resize_f(a[..., k], sw, sh) for k in range(a.shape[2])], -1)
        else:
            small = resize_f(a, sw, sh)
        small = blur(small, sx / f, sy / f)
        if a.ndim == 3:
            return np.stack([resize_f(small[..., k], w, h) for k in range(a.shape[2])], -1)
        return resize_f(small, w, h)
    out = a.astype(F32)
    rx, ry = int(round(sx)), int(round(sy))
    for _ in range(3):
        out = _box1(out, rx, 1)
        out = _box1(out, ry, 0)
    return out


def noise2d(h, w, sx, sy=None, octaves=4, persistence=0.5, rng=None, ridged=False):
    """Fractal value noise in about [-1, 1]; sx/sy = feature size in pixels."""
    sy = sx if sy is None else sy
    out = np.zeros((h, w), F32)
    amp, total = 1.0, 0.0
    for o in range(octaves):
        gw = max(2, int(math.ceil(w / sx)) + 3)
        gh = max(2, int(math.ceil(h / sy)) + 3)
        g = rng.standard_normal((gh, gw)).astype(F32)
        big = resize_f(g, int(gw * sx), int(gh * sy))
        oy, ox = int(sy), int(sx)
        n = big[oy:oy + h, ox:ox + w]
        if n.shape != (h, w):
            n = resize_f(g, w, h)
        n = n * 0.6
        if ridged:
            n = 1.0 - np.abs(n) * 1.6
        out += amp * n
        total += amp
        amp *= persistence
        sx, sy = sx / 2.0, sy / 2.0
    return out / total


def noise1d(n, scale, octaves=5, persistence=0.5, rng=None, ridged=False):
    """1-D fractal noise of length n; scale = feature size in samples."""
    out = np.zeros(n, F32)
    amp, total = 1.0, 0.0
    for _ in range(octaves):
        cells = max(2, int(math.ceil(n / scale)) + 3)
        g = rng.standard_normal(cells).astype(F32)
        big = resize_f(g[None, :], int(cells * scale), 1)[0]
        o = int(scale)
        seg = big[o:o + n]
        if len(seg) < n:
            seg = resize_f(g[None, :], n, 1)[0]
        seg = seg * 0.6
        if ridged:
            seg = 1.0 - np.abs(seg) * 1.6
        out += amp * seg
        total += amp
        amp *= persistence
        scale = max(1.0, scale / 2.0)
    return out / total


def cover(y, ridge):
    """Anti-aliased coverage of pixels below a height-field ridge (per column)."""
    return np.clip(y - ridge[None, :] + 0.5, 0.0, 1.0)


def disc(x, y, cx, cy, r, soft=1.0):
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    return np.clip((r - d) / soft + 0.5, 0, 1), d


def stars(rng, count, ymax, bright=1.0, fade_to=None, x=None, y=None, big_frac=0.03,
          tint=True):
    """Star field (linear light, HxWx3): tiny soft points, a few with halos."""
    img = np.zeros((H, W, 3), F32)
    xs = rng.uniform(0, W, count)
    ys = rng.uniform(0, ymax, count) if fade_to is None else ymax * np.power(rng.uniform(0, 1, count), 1.6)
    mags = np.power(rng.uniform(0, 1, count), 6.0) * 1.0 + 0.04
    pts = np.zeros((H, W), F32)
    xi, yi = xs.astype(int), ys.astype(int)
    np.add.at(pts, (yi, xi), mags)
    core = blur(pts, 0.7) * 6.0
    big = rng.uniform(0, 1, count) < big_frac
    halo_pts = np.zeros((H, W), F32)
    np.add.at(halo_pts, (yi[big], xi[big]), mags[big] * 3)
    halo = blur(halo_pts, 3.0) * 6 + blur(halo_pts, 9.0) * 4
    lum = (core + halo) * bright
    if tint:
        tints = np.zeros((H, W, 3), F32) + 1.0
        col_noise = noise2d(H, W, 300, octaves=1, rng=rng)
        warm = np.stack([1.0 + 0.15 * col_noise, np.ones_like(col_noise), 1.0 - 0.15 * col_noise], -1)
        img = lum[..., None] * warm * tints
    else:
        img = np.repeat(lum[..., None], 3, -1)
    if fade_to is not None:
        yy = np.arange(H, dtype=F32)[:, None, None]
        img = img * (1.0 - smoothstep(fade_to[0], fade_to[1], yy))
    return img.astype(F32)


def finish(lin, rng, grain=0.022, vignette=0.28, shoulder=0.78, path=None):
    """Vignette, soft highlight shoulder, sRGB encode, film grain, dither."""
    x, y = grid()
    nx, ny = (x - W / 2) / (W / 2), (y - H / 2) / (H / 2)
    v = 1.0 - vignette * smoothstep(0.35, 1.45, np.sqrt(nx * nx * 0.85 + ny * ny))
    c = lin * v[..., None]
    k = shoulder
    hi = c > k
    c = np.where(hi, k + (1 - k) * np.tanh((c - k) / (1 - k)), c)
    s = np.power(np.clip(c, 0, 1), 1 / 2.2)
    if grain > 0:
        g = rng.standard_normal((H, W)).astype(F32)
        g = 0.65 * g + 0.35 * blur(g, 0.8) * 2.2
        lum = s.mean(-1)
        amp = grain * (0.35 + 0.65 * (1 - np.abs(lum * 2 - 1)))
        s = s + (g * amp)[..., None]
    s = s + rng.uniform(-0.5, 0.5, s.shape).astype(F32) / 255.0
    out = (np.clip(s, 0, 1) * 255 + 0.5).astype(np.uint8)
    im = Image.fromarray(out, "RGB")
    if path:
        im.save(path)
    return im


# ------------------------------------------------------------------ scenes ---

def scene_synthwave(rng):
    x, y = grid()
    y0 = H * 0.635
    img = np.broadcast_to(vgrad([
        (0.00, "#06021a"), (0.18, "#140735"), (0.36, "#3b0f5f"),
        (0.50, "#8a1d79"), (0.585, "#e83f7a"), (0.635, "#ff8a5c"),
        (0.64, "#2a0838"), (1.0, "#07020f")]), (H, W, 3)).copy()

    # stars in the upper sky
    img += stars(rng, 2600, y0 * 0.85, bright=0.55, fade_to=(H * 0.12, H * 0.5)) * 0.9

    # the sun
    cx, R = W * 0.5, H * 0.255
    cy = y0 - R * 0.42
    sun_a, d = disc(x, y, cx, cy, R, 1.2)
    sun_a = sun_a * np.clip(y0 - y, 0, 1)
    t = np.clip((y - (cy - R)) / (2 * R), 0, 1)
    sun_top, sun_mid, sun_bot = lhex("#fff7a8"), lhex("#ffb04a"), lhex("#ff2e7e")
    tt = t[..., None]
    sun_col = np.where(tt < 0.5, mix(sun_top, sun_mid, tt / 0.5), mix(sun_mid, sun_bot, (tt - 0.5) / 0.5))
    # stripes: gaps growing towards the bottom of the disc
    gaps = np.zeros_like(sun_a)
    for i in range(6):
        gy = cy - R * 0.12 + R * i * 0.125
        gh = 2.5 + i * 3.4
        gaps = np.maximum(gaps, np.clip((gh / 2 - np.abs(y - gy)) + 0.5, 0, 1))
    sun_a = sun_a * (1 - gaps)
    glow_src = sun_a[..., None] * sun_col
    img = img * (1 - sun_a[..., None]) + sun_col * 1.05 * sun_a[..., None]
    img += blur(glow_src, 30) * 0.55 * lhex("#ff6a8a") / lhex("#ff6a8a").max()
    img += blur(sun_a, 110)[..., None] * (lhex("#ff7a6a") * 0.55 + lhex("#ff3d8a") * 0.25)

    # mountains: two layers with a valley in the middle so the sun shows
    xn = np.arange(W, dtype=F32) / W
    valley = 0.25 + 0.75 * smoothstep(0.05, 0.42, np.abs(xn - 0.5))
    back = y0 - (H * 0.20 * np.clip(0.55 + 0.6 * noise1d(W, 260, 4, 0.45, rng, ridged=True), 0, 2) * valley)
    front = y0 - (H * 0.10 * np.clip(0.45 + 0.7 * noise1d(W, 190, 4, 0.45, rng, ridged=True), 0, 2) * valley)
    for ridge, base, rim_col, rim_k in ((back, "#3a1260", "#ff5fa8", 0.9), (front, "#16062e", "#ff9a6a", 1.3)):
        a = cover(y, ridge) * (y <= y0 + 1)
        depth = np.clip((y - ridge[None, :]) / (y0 - ridge.min() + 1), 0, 1)
        face = mix(lhex(base) * 1.6, lhex(base) * 0.6, depth[..., None])
        # face texture: faint diagonal gullies
        gul = noise2d(H, W, 40, 70, 3, 0.5, rng)
        face *= (1 + 0.12 * gul)[..., None]
        rim = np.exp(-np.clip(y - ridge[None, :], 0, None) / 3.0) * a
        near_sun = np.exp(-((x - cx) / (W * 0.28)) ** 2)
        face = face + rim[..., None] * lhex(rim_col) * rim_k * (0.35 + 0.65 * near_sun)[..., None]
        img = img * (1 - a[..., None]) + face * a[..., None]

    # horizon haze
    haze = np.exp(-((y - y0) / (H * 0.035)) ** 2)
    img += haze[..., None] * lhex("#ff4f8b") * 0.22

    # perspective grid on the floor
    dy = np.maximum(y - y0, 0.001)
    A = 900.0
    z = A / dy
    s = 1.0
    v = z / s
    dvdy = A / (s * dy * dy)
    f = 520.0
    u = (x - cx) * z / (f * s)
    dudx = z / (f * s)
    du_px = np.abs(u - np.round(u)) / dudx
    dv_px = np.abs(v - np.round(v + 0.0)) / dvdy
    wline = 0.9 + 1.6 * smoothstep(0, H - y0, y - y0)
    lu = np.clip(wline - du_px + 0.5, 0, 1) * smoothstep(6, 22, 1 / dudx)
    lv = np.clip(wline - dv_px + 0.5, 0, 1) * smoothstep(6, 22, 1 / dvdy)
    lines = np.maximum(lu, lv) * (y > y0 + 1)
    lines *= 0.3 + 0.7 * smoothstep(y0, y0 + 90, y)
    lc = mix(lhex("#ff2bd6"), lhex("#7b5cff"), smoothstep(y0, H, y)[..., None])
    gl = lines[..., None] * lc
    img += gl * 1.1 + blur(gl, 4) * 1.4 + blur(gl, 18) * 1.0
    # sun reflection on the floor
    refl = np.exp(-((x - cx) / (R * 0.55)) ** 2) * np.exp(-(y - y0) / (H * 0.12)) * (y > y0)
    img += refl[..., None] * lhex("#ff5c7a") * 0.35
    # bright horizon line
    hl = np.exp(-((y - y0) / 1.6) ** 2)
    img += (hl * (0.6 + 0.4 * np.exp(-((x - cx) / (W * 0.3)) ** 2)))[..., None] * lhex("#ffb0d8") * 0.9
    img += blur(hl[..., None] * lhex("#ff3d9a"), 8) * 1.2
    return finish(img, rng, grain=0.02, vignette=0.32)


def pine_ridge(base, rng, density, hmin, hmax, wfac=0.32, patch=None):
    """Raise a ridge line with pointed conifer silhouettes."""
    out = base.copy()
    n = len(base)
    xs = np.cumsum(rng.uniform(0.3, 1.7, int(n * density * 1.6)) / density)
    xs = xs[xs < n]
    for xt in xs:
        k = 1.0 if patch is None else float(patch[int(min(n - 1, xt))])
        if k <= 0.05:
            continue
        ht = rng.uniform(hmin, hmax) * k
        wt = ht * wfac * rng.uniform(0.75, 1.25)
        lo, hi = int(max(0, xt - wt)), int(min(n, xt + wt + 1))
        if hi <= lo or wt < 0.6:
            continue
        xx = np.arange(lo, hi, dtype=F32)
        t = 1 - np.abs(xx - xt) / wt
        # layered branch profile (little steps every few pixels)
        prof = ht * np.clip(t, 0, 1) ** 0.85 * (0.84 + 0.16 * np.abs(np.sin((1 - t) * 10.0 + xt)))
        top = base[int(min(n - 1, max(0, xt)))] - prof
        out[lo:hi] = np.minimum(out[lo:hi], top)
    return out


def scene_forest(rng):
    x, y = grid()
    img = np.broadcast_to(vgrad([
        (0.0, "#4d6796"), (0.20, "#8a93bb"), (0.36, "#d8b4b6"),
        (0.47, "#ffcf9e"), (0.60, "#ffe0b8"), (1.0, "#f0cdb0")]), (H, W, 3)).copy()
    sx, sy = W * 0.64, H * 0.445
    sun_a, d = disc(x, y, sx, sy, 30, 2.0)
    glow = np.exp(-d / 50.0) * 1.0 + np.exp(-d / 220.0) * 0.55 + np.exp(-d / 650.0) * 0.3
    img += glow[..., None] * lhex("#ffd49a")
    img = mix(img, lhex("#fffaf0") * 1.8, sun_a[..., None])

    # soft high clouds, warm undersides near the sun
    cl = noise2d(H, W, 560, 80, 5, 0.55, rng)
    cmask = smoothstep(0.08, 0.5, cl) * (1 - smoothstep(H * 0.12, H * 0.40, y)) * 0.45
    ccol = mix(lhex("#c9b3c8"), lhex("#ffd8c0"), np.exp(-((x - sx) / (W * 0.35)) ** 2)[..., None])
    img = mix(img, ccol, cmask[..., None])

    # god rays (drawn between the far and the near layers)
    ang = np.arctan2(y - sy, x - sx)
    an = (ang + math.pi) / (2 * math.pi) * 4096
    ray_n = noise1d(4096 + 4, 14, 3, 0.55, rng)
    idx = np.clip(an.astype(int), 0, 4095)
    rays = np.clip(ray_n[idx] * 1.5 + 0.35, 0, None) ** 1.3
    rays = rays / rays.max()
    rd = np.sqrt((x - sx) ** 2 + (y - sy) ** 2)
    rays = rays * np.exp(-rd / 520.0) * smoothstep(30, 200, rd) * smoothstep(sy - 30, sy + 80, y)
    rays = blur(rays, 4)

    cols = ["#e6c0b4", "#c8a6ae", "#9c8aa2", "#6e6e8c", "#465472", "#273a52", "#122130"]
    n = len(cols)
    xs = np.arange(W, dtype=F32)
    for i in range(n):
        t = i / (n - 1)
        base_y = H * (0.455 + 0.41 * t ** 1.2)
        amp = H * (0.035 + 0.075 * t)
        r = base_y - amp * (0.55 + 1.2 * noise1d(W, 520 - 50 * i, 5, 0.5, rng))
        r = r - H * (0.012 + 0.02 * t) * np.sin(xs / W * math.pi * (1.1 + 0.35 * i) + i * 1.9)
        th = 4 + 40 * t ** 1.6
        patch = np.clip(0.55 + 1.4 * noise1d(W, 160, 3, 0.5, rng), 0, 1.15)
        r = pine_ridge(r, rng, density=0.05 + 0.04 * (1 - t), hmin=th * 0.45, hmax=th * 1.4,
                       wfac=0.27, patch=patch)
        a = cover(y, r)
        col = lhex(cols[i])
        below = np.clip(y - r[None, :], 0, None)
        mist_col = mix(col, lhex("#f2cdb6"), 0.75)
        mist = smoothstep(15, 200 + 80 * t, below) * 0.75 * (1 - t) ** 1.2
        layer = mix(np.broadcast_to(col, (H, W, 3)), mist_col, mist[..., None])
        # warm rim light on the ridge facing the sun
        rim = np.exp(-below / 2.0) * np.exp(-((x - sx) / (W * 0.22)) ** 2) * (0.9 * (1 - t) + 0.12)
        layer = layer + rim[..., None] * lhex("#ffd29a") * 0.9
        img = img * (1 - a[..., None]) + layer * a[..., None]
        if i == 3:
            img += rays[..., None] * lhex("#ffe2b8") * 0.22
        if i == 4:
            img += rays[..., None] * lhex("#ffe2b8") * 0.06

    # a few birds
    for k in range(5):
        bx, by, bs = W * rng.uniform(0.25, 0.48), H * rng.uniform(0.2, 0.32), rng.uniform(5, 9)
        xx = x - bx
        wing = by - bs * 0.45 * np.abs(np.sin(np.clip(xx / bs, -1.2, 1.2) * 1.6)) * (np.abs(xx) < bs * 1.1)
        b = np.clip(1.2 - np.abs(y - wing - np.abs(xx) * 0.15), 0, 1) * (np.abs(xx) < bs * 1.1)
        img = mix(img, lhex("#3a3a48"), b[..., None] * 0.7)
    return finish(img, rng, grain=0.024, vignette=0.25)


def bilinear(tex, u, v):
    h, w = tex.shape
    u = np.mod(u, w)
    v = np.mod(v, h)
    x0 = np.floor(u).astype(np.int32)
    y0 = np.floor(v).astype(np.int32)
    fx, fy = (u - x0).astype(F32), (v - y0).astype(F32)
    x1, y1 = (x0 + 1) % w, (y0 + 1) % h
    a = tex[y0, x0] * (1 - fx) + tex[y0, x1] * fx
    b = tex[y1, x0] * (1 - fx) + tex[y1, x1] * fx
    return a * (1 - fy) + b * fy


def tile_noise(n, cells, rng, octaves=4):
    out = np.zeros((n, n), F32)
    amp = 1.0
    for _ in range(octaves):
        g = rng.standard_normal((cells, cells)).astype(F32)
        gp = np.pad(g, 3, mode="wrap")
        s = n / cells
        big = resize_f(gp, int(round((cells + 6) * s)), int(round((cells + 6) * s)))
        o = int(round(3 * s))
        out += amp * big[o:o + n, o:o + n]
        amp *= 0.5
        cells *= 2
    return out / np.abs(out).max()


def scene_ocean(rng):
    x, y = grid()
    y0 = H * 0.585
    img = np.broadcast_to(vgrad([
        (0.0, "#28325e"), (0.16, "#4b4679"), (0.32, "#9a6488"),
        (0.46, "#ec9474"), (0.55, "#ffc485"), (0.585, "#ffdca0"),
        (0.586, "#f2b88e"), (0.63, "#b9767c"), (0.72, "#4a4b72"),
        (0.86, "#1d2a4a"), (1.0, "#0b1428")]), (H, W, 3)).copy()
    sx, sy = W * 0.5, y0 - H * 0.06
    sun_a, d = disc(x, y, sx, sy, 40, 1.5)
    sky = (y < y0).astype(F32)
    glow = np.exp(-d / 40.0) * 1.3 + np.exp(-d / 160.0) * 0.7 + np.exp(-d / 520.0) * 0.4
    img += (glow * sky)[..., None] * lhex("#ffbe76")
    # horizontal anamorphic streak through the sun
    streak = np.exp(-((y - sy) / 3.0) ** 2) * np.exp(-np.abs(x - sx) / (W * 0.22)) * sky
    img += streak[..., None] * lhex("#ffd29a") * 0.6
    img = mix(img, lhex("#fff4d8") * 2.0, (sun_a * sky)[..., None])

    # big soft clouds lit from below by the low sun
    cn = noise2d(H, W, 820, 150, 6, 0.55, rng)
    band = smoothstep(H * 0.02, H * 0.12, y) * (1 - smoothstep(H * 0.38, H * 0.53, y))
    cn = cn / cn.std()
    dens = smoothstep(-0.7, 0.9, cn) * band
    lit = np.exp(-((x - sx) / (W * 0.42)) ** 2) * (0.4 + 0.6 * smoothstep(H * 0.05, H * 0.45, y))
    ccol = mix(lhex("#3e3560"), lhex("#ff9f74"), lit[..., None])
    # brighter rims on the underside facing the sun
    under = np.clip(blur(dens, 4) - np.roll(blur(dens, 4), -10, axis=0), 0, 1) * 4
    ccol = ccol + (under * lit)[..., None] * lhex("#ffd09a") * 0.9
    img = mix(img, ccol, (np.clip(dens, 0, 1) * 0.88)[..., None])

    # far headland on the left, hazy
    xs = np.arange(W, dtype=F32)
    head = y0 - H * 0.075 * np.clip(1 - xs / (W * 0.34), 0, 1) ** 0.7 * (0.8 + 0.25 * noise1d(W, 90, 5, 0.5, rng))
    a = cover(y, head) * (y <= y0 + 1)
    img = mix(img, lhex("#7a4f6e"), a[..., None] * 0.9)

    # ocean: anisotropic wave texture seen in perspective
    sea = (y > y0).astype(F32)
    tex = tile_noise(1024, 8, rng, 4)
    tex2 = tile_noise(1024, 16, rng, 3)
    A, f = 1000.0, 1000.0
    dy = np.maximum(y - y0, 0.5)
    z = A / dy
    X = (x - sx) * z / f
    Zw = z
    su, sv = 197.0, 677.0
    vpp = sv * A / (dy * dy)          # texels per pixel vertically
    u, v = X * su, Zw * sv
    w1 = bilinear(tex, u, v)
    w2 = bilinear(tex2, u * 2.3 + 300, v * 2.3 + 100)
    fade1 = smoothstep(90, 8, vpp)
    fade2 = smoothstep(90, 8, vpp * 2.3)
    wv = w1 * fade1 * 0.65 + w2 * fade2 * 0.35
    # facet slope along the view direction (towards/away from the sun)
    ds = (bilinear(tex, u, v + 3) - w1) * fade1 + (bilinear(tex2, u * 2.3 + 300, v * 2.3 + 103) - w2) * fade2 * 0.6
    dsn = ds / (ds[y > y0 + 40].std() + 1e-6)
    shade = 1.0 + 0.32 * np.tanh(dsn * 0.8) + 0.18 * wv
    img = img * np.where(sea[..., None] > 0, shade[..., None], 1.0)
    # sky reflection on crests: warm near the sun column
    width = 30 + (y - y0) * 0.8
    colm = np.exp(-((x - sx) / width) ** 2) * sea
    sparkle = np.clip(dsn * 0.45 + wv * 0.3, 0, None) ** 2.4
    glit = colm * sparkle * smoothstep(y0, y0 + 6, y)
    img += glit[..., None] * lhex("#ffd890") * 2.6
    img += blur(glit, 3)[..., None] * lhex("#ffae5a") * 1.6
    broad = np.exp(-((x - sx) / (width * 2.8)) ** 2) * np.exp(-(y - y0) / (H * 0.22)) * sea
    img += broad[..., None] * lhex("#ff9a5a") * 0.55
    core = np.exp(-((x - sx) / (width * 0.7)) ** 2) * np.exp(-(y - y0) / (H * 0.12)) * sea
    core *= 0.55 + 0.45 * np.clip(1 + wv * 2, 0, 2) * 0.5
    img += core[..., None] * lhex("#ffc070") * 0.9
    # horizon haze
    hz = np.exp(-((y - y0) / (H * 0.022)) ** 2)
    img = mix(img, lhex("#ffcf9e"), (hz * 0.5)[..., None])
    return finish(img, rng, grain=0.022, vignette=0.3)


def scene_city(rng):
    x, y = grid()
    yw = H * 0.78  # water line
    img = np.broadcast_to(vgrad([
        (0.0, "#03050f"), (0.25, "#0a1130"), (0.45, "#1c1c4c"),
        (0.60, "#43296a"), (0.72, "#9a4a7c"), (0.78, "#e0857a"), (1.0, "#0a0d1c")]), (H, W, 3)).copy()
    img += stars(rng, 900, H * 0.45, bright=0.35, fade_to=(H * 0.12, H * 0.42))
    # moon with halo
    mx, my = W * 0.82, H * 0.14
    ma, d = disc(x, y, mx, my, 30, 1.2)
    cut, _ = disc(x, y, mx + 13, my - 7, 27, 1.2)
    moon = ma * (1 - cut * 0.94)
    img += (np.exp(-d / 70.0) * 0.14 + np.exp(-d / 260.0) * 0.07)[..., None] * lhex("#a8b8ff")
    img = mix(img, lhex("#f4f0ff") * 1.3, moon[..., None])

    win_layer = np.zeros((H, W, 3), F32)
    layers = [
        # (hmin, hmax, wmin, wmax, color, window brightness, lit prob, haze after)
        (170, 440, 45, 120, "#222552", 0.22, 0.22, 0.22),
        (90, 320, 55, 150, "#171a3a", 0.75, 0.30, 0.15),
        (35, 150, 90, 230, "#05060c", 1.0, 0.16, 0.0),
    ]
    warm, cool, white = lhex("#ffc46b"), lhex("#8fd2ff"), lhex("#fff1d6")
    neon = [lhex("#ff3fb4"), lhex("#36e0ff"), lhex("#b46bff")]
    by = yw
    for li, (hmin, hmax, wmin, wmax, colh, wb, lp, haze_k) in enumerate(layers):
        col = lhex(colh)
        xs = -rng.uniform(0, 80)
        mask = np.zeros((H, W), F32)
        wins = np.zeros((H, W, 3), F32)
        while xs < W:
            bw = rng.uniform(wmin, wmax)
            bh = rng.uniform(hmin, hmax) * (1.45 if rng.uniform() < 0.12 else 1.0)
            if li == 2:
                edge = min(xs, W - xs - bw) / W
                bh *= 0.6 + 1.6 * smoothstep(0.25, 0.0, edge)  # taller near the frame edges
            x0, x1 = int(max(0, xs)), int(min(W, xs + bw))
            top = int(by - bh)
            if x1 > x0:
                mask[top:int(by) + 1, x0:x1] = 1
                if rng.uniform() < 0.35:
                    sw = bw * rng.uniform(0.35, 0.6)
                    sx0 = int(max(0, xs + (bw - sw) / 2))
                    sx1 = int(min(W, xs + (bw + sw) / 2))
                    st = int(top - rng.uniform(20, 70))
                    mask[st:top, sx0:sx1] = 1
                    if rng.uniform() < 0.6:
                        cxa = int((sx0 + sx1) / 2)
                        at = int(st - rng.uniform(25, 70))
                        if 0 <= cxa < W - 2:
                            mask[at:st, cxa:cxa + 2] = 1
                            win_layer[max(0, at - 1):at + 3, max(0, cxa - 1):cxa + 3] += lhex("#ff3030") * 3
                    top = st
                cw, ch = rng.uniform(6, 10), rng.uniform(9, 13)
                ww, wh = cw * rng.uniform(0.45, 0.65), ch * rng.uniform(0.45, 0.6)
                yy, xx = np.mgrid[top + 6:int(by) - 4, x0 + 3:x1 - 3]
                if yy.size:
                    seed = int(abs(xs) * 7 + li * 9973 + 100000)
                    rr = np.random.default_rng(seed).uniform(0, 1, 5000)
                    rowr = np.random.default_rng(seed + 1).uniform(0, 1, 500)
                    gx = ((xx - x0 - 3) % cw) < ww
                    gy = ((yy - top - 6) % ch) < wh
                    row = ((yy - top) // ch).astype(int)
                    cellid = ((xx - x0) // cw).astype(int) * 131 + row * 17
                    rowlit = rowr[row % 500] < 0.7
                    lit = (rr[cellid % 5000] < lp) & gx & gy & rowlit
                    hue = rng.uniform()
                    wc = warm if hue < 0.6 else (cool if hue < 0.85 else white)
                    var = 0.25 + 0.75 * rr[(cellid * 7) % 5000] ** 2
                    wins[yy, xx] += (lit * var)[..., None] * wc * wb
                # occasional neon sign on mid buildings
                if li == 1 and rng.uniform() < 0.12 and x1 - x0 > 40:
                    nc = neon[rng.integers(0, 3)]
                    ny0 = int(top + rng.uniform(20, 60))
                    nx = int(x0 + rng.uniform(8, max(9, x1 - x0 - 14)))
                    wins[ny0:ny0 + int(rng.uniform(40, 90)), nx:nx + 5] += nc * 2.2
            xs += bw + rng.uniform(-10, 18)
        grad = smoothstep(by - 380, by, y)[..., None]
        bcol = col * (1 + grad * (0.7 - 0.2 * li)) + lhex("#4a2458") * grad * (0.22 - 0.07 * li)
        img = mix(img, bcol, mask[..., None])
        img += wins * mask[..., None]
        win_layer += wins
        if haze_k > 0:  # city haze between layers
            hz = smoothstep(by - 420, by, y) * haze_k
            img = mix(img, lhex("#5a3a78"), hz[..., None])
    # street-level glow and bloom of the windows
    img += (np.exp(-((y - yw) / 14.0) ** 2) * (y < yw + 2))[..., None] * lhex("#ff9a5a") * 0.35
    img += blur(win_layer, 3) * 0.55 + blur(win_layer, 16) * 0.45

    # water reflection
    iw = int(yw)
    rows = np.arange(iw, H)
    src = np.clip(2 * iw - rows - 1, 0, iw - 1)
    rip = noise2d(H - iw, W, 160, 3, 3, 0.5, rng) * 22
    xi = np.clip((np.arange(W)[None, :] + rip).astype(int), 0, W - 1)
    refl = img[src[:, None], xi]
    refl = blur(refl, 1.0, 4.0) * 0.55
    streak = noise2d(H - iw, W, 700, 2.5, 2, 0.5, rng)
    refl *= (0.7 + 0.45 * streak)[..., None]
    fade = np.exp(-(rows - yw) / (H * 0.28))[:, None, None]
    img[iw:] = refl * fade + lhex("#05070f") * (1 - fade) * 0.6
    img += (np.exp(-((y - yw) / 1.5) ** 2))[..., None] * lhex("#e090c0") * 0.18

    # soft foreground bokeh, low in the frame
    bok = np.zeros((H, W, 3), F32)
    for _ in range(14):
        bx, byy = rng.uniform(-50, W + 50), rng.uniform(H * 0.84, H * 1.1)
        br = rng.uniform(40, 120)
        c = [lhex("#ffb35c"), lhex("#ff4fa3"), lhex("#5cc8ff"), lhex("#ffd890")][rng.integers(0, 4)]
        a, dd = disc(x, y, bx, byy, br, 3.0)
        ring = np.exp(-((dd - br * 0.94) / (br * 0.06)) ** 2) * 0.35
        bok += ((a * 0.4 + ring * a) * rng.uniform(0.07, 0.18))[..., None] * c
    img += blur(bok, 2.5)
    return finish(img, rng, grain=0.026, vignette=0.32)


def scene_dunes(rng):
    x, y = grid()
    y0 = H * 0.60
    img = np.broadcast_to(vgrad([
        (0.0, "#0c0624"), (0.25, "#21104a"), (0.45, "#4f2272"),
        (0.55, "#a2417c"), (0.60, "#f6886a"), (1.0, "#f6886a")]), (H, W, 3)).copy()
    # milky way: soft diagonal band of dust and stars
    t = (x * 0.42 - y + H * 0.05) / H
    band = np.exp(-(t / 0.13) ** 2)
    dust = noise2d(H, W, 160, octaves=5, rng=rng)
    img += (band * np.clip(0.3 + dust * 1.4, 0, None) * 0.10 * (1 - smoothstep(H * 0.15, H * 0.5, y)))[..., None] * lhex("#b9a0ff")
    img += stars(rng, 1700, y0 * 0.92, bright=0.6, fade_to=(H * 0.2, H * 0.55), tint=False, big_frac=0.02)
    img += stars(rng, 2600, y0 * 0.75, bright=0.35, fade_to=(H * 0.1, H * 0.45), tint=False, big_frac=0.0) * band[..., None]
    # glow of the set sun on the left horizon
    gx, gy = W * 0.18, y0
    dd = np.sqrt(((x - gx) / 1.6) ** 2 + (y - gy) ** 2)
    img += ((np.exp(-dd / 220.0) * 0.55 + np.exp(-dd / 700.0) * 0.25) * smoothstep(H * 0.25, H * 0.6, y))[..., None] * lhex("#ffa070") * (y < y0 + 200)[..., None]
    # a bright planet
    pa, pd = disc(x, y, W * 0.72, H * 0.24, 2.4, 1.0)
    img += (pa * 2.5 + np.exp(-pd / 6) * 0.6 + np.exp(-pd / 30) * 0.08)[..., None] * lhex("#fff2d0")

    xs = np.arange(W, dtype=F32)

    def dune_ridge(base, n, hmin, hmax, wl_range, wr_range):
        r = np.full(W, base, F32)
        crests = np.sort(rng.uniform(-0.1 * W, 1.1 * W, n))
        for xc in crests:
            hc = rng.uniform(hmin, hmax)
            wl, wr = rng.uniform(*wl_range), rng.uniform(*wr_range)
            left = np.clip(1 - (np.clip(xc - xs, 0, None) / wl) ** 2, 0, 1) * (xs <= xc)
            right = np.clip(1 - (np.clip(xs - xc, 0, None) / wr) ** 1.35, 0, 1) * (xs > xc)
            prof = hc * np.maximum(left, right)
            r = np.minimum(r, base - prof)
        return r + 4 * noise1d(W, 120, 3, 0.5, rng)

    layers = [
        (y0 + 6, 5, 30, 70, (300, 600), (120, 260), "#d0707a", "#56306e", 0.7),
        (y0 + 70, 4, 60, 130, (350, 700), (150, 300), "#e47c62", "#3f1f62", 0.42),
        (y0 + 190, 3, 110, 210, (500, 900), (200, 380), "#f0875c", "#2f1650", 0.2),
        (H + 40, 2, 230, 330, (800, 1200), (300, 520), "#f6935c", "#200c38", 0.0),
    ]
    haze = lhex("#e08a86")
    for base, n, hmin, hmax, wlr, wrr, lit_h, sh_h, aerial in layers:
        r = dune_ridge(base, n, hmin, hmax, wlr, wrr)
        a = cover(y, r)
        below = np.clip(y - r[None, :], 0, None)
        slope = np.gradient(r)
        # light from the left: faces rising to the right (slope<0) are lit
        light = smoothstep(0.08, -0.25, slope)
        # shear the shadow boundary so it sweeps down-left from the crest
        shear = (xs[None, :] - below * 1.3).astype(np.int32)
        L = light[np.clip(shear, 0, W - 1)]
        L = blur(L, 1.2)
        lit_c, sh_c = lhex(lit_h), lhex(sh_h)
        depth = smoothstep(0, 260, below)[..., None]
        col = mix(sh_c, lit_c, L[..., None]) * (1 - 0.45 * depth)
        # crest highlight + fine ripples on the lit faces
        crest = np.exp(-below / 2.0) * light[None, :]
        col += crest[..., None] * lhex("#ffd0a0") * 0.6
        rip = np.sin((y - r[None, :] * 0.6) * 0.35 + noise2d(H, W, 60, octaves=2, rng=rng) * 4)
        col *= (1 + 0.04 * rip * L * (1 - aerial))[..., None]
        col = mix(col, haze, aerial * 0.8)
        mist = smoothstep(30, 200, below) * aerial * 0.4
        col = mix(col, haze, mist[..., None])
        img = img * (1 - a[..., None]) + col * a[..., None]
    return finish(img, rng, grain=0.024, vignette=0.3)


def peaks_ridge(rng, base, n, hmin, hmax, wmin, wmax, detail):
    xs = np.arange(W, dtype=F32)
    r = np.zeros(W, F32)
    centers = np.sort(rng.uniform(-0.05 * W, 1.05 * W, n))
    for c in centers:
        h = rng.uniform(hmin, hmax)
        wl, wr = rng.uniform(wmin, wmax), rng.uniform(wmin, wmax)
        w = np.where(xs < c, wl, wr)
        prof = h * np.clip(1 - np.abs(xs - c) / w, 0, 1) ** 1.5
        r = np.maximum(r, prof)
    det = noise1d(W, 110, 6, 0.55, rng, ridged=True)
    r = r + detail * det * (0.25 + 0.75 * r / max(r.max(), 1))
    return base - r


def scene_aurora(rng):
    x, y = grid()
    yl = H * 0.79  # lake line
    img = np.broadcast_to(vgrad([
        (0.0, "#01030a"), (0.35, "#041022"), (0.62, "#0a2236"),
        (0.79, "#12344a"), (1.0, "#02060c")]), (H, W, 3)).copy()
    img += stars(rng, 3000, yl, bright=0.65, fade_to=(H * 0.3, H * 0.78), big_frac=0.02)

    # aurora curtains: bright lower edge, rays fading upwards
    aur = np.zeros((H, W, 3), F32)
    xs = np.arange(W, dtype=F32)
    green, teal, violet, pink = lhex("#46ffb0"), lhex("#25d0c8"), lhex("#7d4dff"), lhex("#ff4fc8")
    curt = [
        (H * 0.36, H * 0.11, 1.0, 0.9, 0.6, 300),
    ]
    for base, amp, inten, freq, ph, envs in curt:
        yc = base + amp * np.sin(xs / W * math.pi * 2 * freq + ph) + H * 0.04 * noise1d(W, 380, 3, 0.5, rng)
        rays = np.clip(0.62 + 0.55 * noise1d(W, 10, 4, 0.6, rng), 0.05, None) ** 1.6
        env = np.clip(0.45 + 2.2 * noise1d(W, envs * 1.6, 2, 0.5, rng), 0.03, 1.3)
        env = env * (0.55 + 0.45 * np.exp(-((xs - W * 0.6) / (W * 0.35)) ** 2))
        d = yc[None, :] - y
        prof = smoothstep(-34, 30, d) * (0.5 * np.exp(-np.clip(d, 0, None) / (H * 0.035)) +
                                         0.5 * np.exp(-np.clip(d, 0, None) / (H * 0.2)))
        tcol = smoothstep(0, H * 0.36, d)[..., None]
        c = mix(green * 1.15, teal, smoothstep(0.1, 0.45, tcol))
        c = mix(c, violet, smoothstep(0.35, 0.8, tcol))
        c = mix(c, pink * 0.9, smoothstep(0.75, 1.0, tcol))
        aur += (prof * (rays * env)[None, :] * inten)[..., None] * c
    aur = blur(aur, 1.2, 5.0)
    g1 = np.roll(blur(aur, 24), -50, axis=0)
    g2 = np.roll(blur(aur, 120), -140, axis=0)
    g1[-50:] = 0
    g2[-140:] = 0
    img += aur * 0.85 + g1 * 0.3 + g2 * 0.22

    # majestic snowy peaks, far and near ranges
    glow_tint = 1 + 0.6 * blur(aur, 200).max(-1, keepdims=True)
    ranges = [
        (yl - 2, 7, H * 0.18, H * 0.32, W * 0.12, W * 0.24, H * 0.05, "#8fb0c4", "#2a435c", "#141f2e", 0.45),
        (yl + 2, 6, H * 0.06, H * 0.15, W * 0.09, W * 0.2, H * 0.035, "#c4dfe6", "#33506a", "#0b131d", 0.06),
    ]
    for base, n, hmin, hmax, wmin, wmax, det, lit_h, sh_h, rock_h, haze_k in ranges:
        r = peaks_ridge(rng, base, n, hmin, hmax, wmin, wmax, det)
        a = cover(y, r) * (y < yl + 2)
        below = np.clip(y - r[None, :], 0, None)
        slope_a = np.gradient(blur(r[None, :], 8)[0])
        slope_b = np.gradient(blur(r[None, :], 1.5)[0])
        la = smoothstep(0.12, -0.12, slope_a)       # faces rising to the right are lit
        lb = smoothstep(0.3, -0.3, slope_b)
        sh_a = np.clip((xs[None, :] + below * 0.6).astype(np.int32), 0, W - 1)
        sh_b = np.clip((xs[None, :] + below * 0.35).astype(np.int32), 0, W - 1)
        L = blur(0.65 * la[sh_a] + 0.35 * lb[sh_b], 1.5)
        # couloirs: streaks running down the slopes on either side of the spine
        side = np.where(L > 0.5, -1.0, 1.0)
        u = xs[None, :] + side * below * 0.85
        sn = noise1d(3 * W, 24, 3, 0.55, rng)
        streak = sn[np.clip((u + W).astype(np.int32), 0, 3 * W - 1)]
        brk = noise2d(H, W, 140, 140, 3, 0.5, rng)
        rock = smoothstep(0.3, 0.75, streak * 1.0 + brk * 0.7 + below / 520.0 - 0.3)
        snow_c = mix(lhex(sh_h), lhex(lit_h), L[..., None])
        rock_c = lhex(rock_h) * (0.7 + 0.8 * L)[..., None]
        col = mix(snow_c, rock_c, (rock * 0.55)[..., None])
        col = col * (1 - 0.5 * smoothstep(0, 340, below))[..., None] * glow_tint
        crest = np.exp(-below / 2.0) * L
        col += crest[..., None] * lhex("#d8fff4") * 0.35
        col = mix(col, lhex("#18374c"), haze_k)
        img = img * (1 - a[..., None]) + col * a[..., None]

    # mist on the far shore
    mist = np.exp(-((y - yl) / (H * 0.02)) ** 2) * (0.6 + 0.4 * noise2d(H, W, 260, 20, 3, 0.5, rng))
    img = mix(img, lhex("#3d6a78"), (np.clip(mist, 0, 1) * 0.45)[..., None])

    # still lake mirroring sky and peaks
    il = int(yl)
    rows = np.arange(il, H)
    src = np.clip(2 * il - rows - 1, 0, il - 1)
    rip = noise2d(H - il, W, 260, 3, 3, 0.5, rng) * 5
    xi = np.clip((np.arange(W)[None, :] + rip).astype(int), 0, W - 1)
    refl = img[src[:, None], xi] * 0.5
    refl = blur(refl, 0.8, 2.5)
    lines = 1 + 0.08 * noise2d(H - il, W, 900, 2, 2, 0.5, rng)
    img[il:] = refl * lines[..., None] * np.exp(-(rows - yl) / (H * 0.5))[:, None, None]
    shore = H - H * 0.03 - H * 0.025 * np.clip(noise1d(W, 300, 5, 0.5, rng) + 0.3, 0, 2)
    a = cover(y, shore)
    sc = mix(lhex("#2c4252"), lhex("#0d151d"), smoothstep(H * 0.94, H, y)[..., None])
    img = img * (1 - a[..., None]) + sc * a[..., None]
    return finish(img, rng, grain=0.022, vignette=0.3)


def rrect(x, y, cx, cy, w, h, r, soft=1.0):
    """Anti-aliased rounded rectangle coverage."""
    qx = np.abs(x - cx) - (w / 2 - r)
    qy = np.abs(y - cy) - (h / 2 - r)
    d = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - r
    return np.clip(0.5 - d / soft, 0, 1)


def scene_camera(rng, out_dir="."):
    """A retro film-camera mascot (the 'subject') in front of the busy night city,
    used to demo ai.remove_background."""
    bg_path = os.path.join(out_dir, "city.png")
    if not os.path.exists(bg_path):
        scene_city(np.random.default_rng(SCENES["city"][1])).save(bg_path)
    bg = np.asarray(Image.open(bg_path).convert("RGB"), F32) / 255.0
    img = to_lin(bg) * 0.9
    x, y = grid()
    cx, cy = W * 0.5, H * 0.56

    def paint(cov, col):
        nonlocal img
        img = img * (1 - cov[..., None]) + col * cov[..., None]

    # soft contact shadow
    sh = np.exp(-(((x - cx) / 420) ** 2 + ((y - (cy + 270)) / 40) ** 2))
    img *= (1 - 0.55 * sh)[..., None]
    # film reels
    for rx in (cx - 170, cx + 175):
        ry = cy - 300
        a, d = disc(x, y, rx, ry, 125, 1.2)
        shade = 0.6 + 0.4 * smoothstep(ry + 120, ry - 120, y)
        paint(a, lhex("#2b2d3a") * shade[..., None])
        ring, _ = disc(x, y, rx, ry, 112, 1.2)
        paint(ring * (1 - disc(x, y, rx, ry, 100, 1.2)[0]), lhex("#8e95a8"))
        ang = np.arctan2(y - ry, x - rx)
        spokes = (np.cos(ang * 3) > 0.55) * disc(x, y, rx, ry, 92, 1.2)[0] * (1 - disc(x, y, rx, ry, 26, 1.2)[0])
        paint(spokes.astype(F32) * 0.85, lhex("#c9cfdd") * (0.7 + 0.3 * shade)[..., None])
        hub, _ = disc(x, y, rx, ry, 18, 1.2)
        paint(hub, lhex("#e8ecf5"))
    # body
    bw, bh = 820, 470
    body = rrect(x, y, cx, cy, bw, bh, 70, 1.5)
    t = np.clip((y - (cy - bh / 2)) / bh, 0, 1)[..., None]
    body_col = mix(lhex("#ff7a6e"), lhex("#c8304a"), t)
    side = np.clip((x - (cx - bw / 2)) / bw, 0, 1)[..., None]
    body_col = body_col * (1.08 - 0.25 * side)
    paint(body, body_col)
    # top chrome plate
    plate = rrect(x, y, cx, cy - bh / 2 + 55, bw - 30, 80, 30, 1.5) * body
    pc = mix(lhex("#f4f6fb"), lhex("#7d8496"), np.clip((y - (cy - bh / 2 + 15)) / 80, 0, 1)[..., None])
    paint(plate, pc)
    # leather band with grain
    band = rrect(x, y, cx, cy + 60, bw - 10, 220, 20, 1.5) * body
    grain = noise2d(H, W, 3, 3, 2, 0.5, rng)
    paint(band, lhex("#3a1f2c") * (1 + 0.25 * grain)[..., None])
    # viewfinder and shutter button
    vf = rrect(x, y, cx - 300, cy - bh / 2 + 55, 120, 54, 12, 1.2)
    paint(vf, mix(lhex("#1b2340"), lhex("#5a6fb0"), np.clip((x - (cx - 360)) / 120, 0, 1)[..., None]))
    btn = rrect(x, y, cx + 290, cy - bh / 2 - 12, 90, 40, 14, 1.2)
    paint(btn, lhex("#ffd25a") * (0.8 + 0.3 * smoothstep(cy - bh / 2, cy - bh / 2 - 30, y))[..., None])
    # lens barrel
    lx, ly = cx + 10, cy + 35
    for r, col in ((215, "#d9dee9"), (196, "#3a3f4f"), (178, "#b9c0cf"), (160, "#14161f")):
        a, d = disc(x, y, lx, ly, r, 1.3)
        shade = 0.75 + 0.35 * smoothstep(ly + r, ly - r, y + (x - lx) * 0.3)
        paint(a, lhex(col) * shade[..., None])
    glass, d = disc(x, y, lx, ly, 132, 1.3)
    gcol = mix(lhex("#5b3cff"), lhex("#071026"), smoothstep(0, 132, d)[..., None])
    gcol = gcol + lhex("#2fe0ff") * (np.exp(-((d - 95) / 14) ** 2) * 0.35)[..., None]
    paint(glass, gcol)
    # reflections on the glass
    hl, _ = disc(x, y, lx - 48, ly - 52, 34, 1.5)
    img += (hl * glass * 1.6)[..., None] * lhex("#ffffff")
    arc = np.exp(-((d - 108) / 6) ** 2) * (np.arctan2(y - ly, x - lx) < -1.9) * (np.arctan2(y - ly, x - lx) > -3.0)
    img += (arc * glass * 0.9)[..., None] * lhex("#cfe8ff")
    small, _ = disc(x, y, lx + 40, ly + 38, 10, 1.2)
    img += (small * 0.9)[..., None] * lhex("#ffffff")
    # rim light on the body edge from the city glow
    edge = np.clip(body - blur(body, 3), 0, 1)
    img += (edge * 0.6)[..., None] * lhex("#ffb0d0")
    return finish(img, rng, grain=0.018, vignette=0.2)


SCENES = {
    "synthwave": (scene_synthwave, 11),
    "forest": (scene_forest, 23),
    "ocean": (scene_ocean, 37),
    "city": (scene_city, 41),
    "dunes": (scene_dunes, 53),
    "aurora": (scene_aurora, 67),
    "camera": (scene_camera, 79),  # subject for the background-removal demo (needs city)
}


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    names = sys.argv[2:] or list(SCENES)
    os.makedirs(out, exist_ok=True)
    for n in names:
        fn, seed = SCENES[n]
        t0 = time.time()
        rng = np.random.default_rng(seed)
        im = fn(rng, out) if n == "camera" else fn(rng)
        p = os.path.join(out, f"{n}.png")
        im.save(p)
        im.resize((960, 540), Image.LANCZOS).save(os.path.join(out, f"{n}_preview.png"))
        print(f"{n}: {p} ({time.time() - t0:.1f}s)")


if __name__ == "__main__":
    main()
