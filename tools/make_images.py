"""
Render the project images the site uses, from real data where it exists.

    station.webp   pass tracks over the PES ground station for the next 24 h,
                   propagated with Skyfield from tools/tles.json
    wildfire.webp  NASA FIRMS MODIS fire detections, 2021-2025
    asr.webp       a stylised speech spectrogram (decorative - no audio shipped)
    ascend.webp    ASCEND's 17-week habit heatmap motif (decorative)
    portrait.webp  background removed from a photo (pass --portrait PATH)

Run with the SatelliteAutomation venv (it has Skyfield, NumPy and Pillow):
    python tools/make_images.py [--portrait C:\\path\\to\\photo.jpg]
"""
import argparse
import csv
import json
import math
import random
from datetime import timedelta
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
FIRE_CSV = Path(r"C:\Users\jawwa\OneDrive\Desktop\fire_archive_M-C61_711825.csv")

W, H = 1600, 1100
BG = (7, 9, 12)
FG = (238, 240, 236)
MUTED = (127, 134, 138)
ACCENT = (244, 211, 24)
MONO = ImageFont.truetype(r"C:\Windows\Fonts\consola.ttf", 22)
MONO_S = ImageFont.truetype(r"C:\Windows\Fonts\consola.ttf", 18)
MONO_B = ImageFont.truetype(r"C:\Windows\Fonts\consolab.ttf", 26)


def ramp(t):
    """dark -> ember -> accent yellow -> near white, t in [0, 1]"""
    stops = [(0.0, BG), (0.35, (92, 58, 10)), (0.7, ACCENT), (1.0, (255, 250, 222))]
    t = float(min(max(t, 0.0), 1.0))
    for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
        if t <= t1:
            k = (t - t0) / (t1 - t0)
            return tuple(int(c0[i] + (c1[i] - c0[i]) * k) for i in range(3))
    return stops[-1][1]


def ramp_array(v):
    lut = np.array([ramp(i / 255) for i in range(256)], dtype=np.uint8)
    return lut[np.clip(v * 255, 0, 255).astype(np.uint8)]


def gblur(a, sigma):
    """Separable Gaussian blur on a float array (Pillow can't blur mode-F images)."""
    r = int(sigma * 3)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    a = np.apply_along_axis(lambda row: np.convolve(row, k, mode="same"), 1, a)
    return np.apply_along_axis(lambda col: np.convolve(col, k, mode="same"), 0, a)


def corner_text(draw, tl, br):
    draw.text((48, 40), tl, font=MONO, fill=MUTED)
    bw = draw.textlength(br, font=MONO)
    draw.text((W - 48 - bw, H - 64), br, font=MONO, fill=MUTED)


def save(img, name):
    OUT.mkdir(exist_ok=True)
    img.save(OUT / name, "WEBP", quality=86, method=6)
    print("wrote", OUT / name)


# ---------------------------------------------------------------- station
def station():
    from skyfield.api import EarthSatellite, load, wgs84

    ts = load.timescale()
    qth = wgs84.latlon(12.9500, 77.6670, elevation_m=888)
    sats = [EarthSatellite(s["l1"], s["l2"], s["name"], ts) for s in json.loads((ROOT / "tools" / "tles.json").read_text())]
    t0 = ts.now()
    times = ts.utc(t0.utc_datetime() + np.arange(0, 24 * 3600, 20) * timedelta(seconds=1))

    img = Image.new("RGB", (W, H), BG)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy, R = W // 2, H // 2 + 10, 470

    def proj(az, el):
        r = R * (90 - el) / 90
        return cx + r * math.sin(math.radians(az)), cy - r * math.cos(math.radians(az))

    # hatched band below the 25 degree floor
    r25 = R * 65 / 90
    for k in range(-2 * R, 2 * R, 14):
        pts = []
        for s in np.linspace(-R, R, 240):
            x, y = cx + s + k / 2, cy + s - k / 2
            rr = math.hypot(x - cx, y - cy)
            pts.append((x, y) if r25 <= rr <= R else None)
        seg = []
        for p in pts + [None]:
            if p:
                seg.append(p)
            elif len(seg) > 1:
                d.line(seg, fill=(*MUTED, 60), width=1)
                seg = []
            else:
                seg = []
    for rr, col, w in ((R, FG, 2), (r25, MUTED, 1), (R * 30 / 90, (*MUTED, 110), 1)):
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=col, width=w)
    for a in range(0, 360, 10):
        L = 16 if a % 30 == 0 else 8
        s, c = math.sin(math.radians(a)), math.cos(math.radians(a))
        d.line([(cx + R * s, cy - R * c), (cx + (R + L) * s, cy - (R + L) * c)], fill=MUTED, width=1)
    for lab, a in (("N", 0), ("E", 90), ("S", 180), ("W", 270)):
        s, c = math.sin(math.radians(a)), math.cos(math.radians(a))
        tw = d.textlength(lab, font=MONO_B)
        d.text((cx + (R + 40) * s - tw / 2, cy - (R + 40) * c - 14), lab, font=MONO_B, fill=FG)
    d.rectangle([cx - 3, cy - R - 12, cx + 3, cy - R + 12], fill=FG)

    tracks = []
    for sat in sats:
        alt, az, _ = (sat - qth).at(times).altaz()
        el, azd = alt.degrees, az.degrees
        up = el > 0
        i = 0
        while i < len(el):
            if up[i]:
                j = i
                while j < len(el) and up[j]:
                    j += 1
                if j - i > 2:
                    tracks.append((el[i:j].max(), [proj(azd[k], el[k]) for k in range(i, j)]))
                i = j
            else:
                i += 1
    tracks.sort(key=lambda t: t[0])
    for peak, pts in tracks[:-1]:
        d.line(pts, fill=(*FG, 70 if peak >= 25 else 34), width=2 if peak >= 25 else 1, joint="curve")
    peak, pts = tracks[-1]
    d.line(pts, fill=(*ACCENT, 255), width=5, joint="curve")
    d.ellipse([pts[0][0] - 7, pts[0][1] - 7, pts[0][0] + 7, pts[0][1] + 7], fill=ACCENT)

    img.paste(layer, (0, 0), layer)
    dd = ImageDraw.Draw(img)
    corner_text(dd, "PES GROUND STATION  12.9500N 77.6670E 888 M", f"{len(tracks)} PASSES / 24 H / {len(sats)} SATELLITES / SGP4")
    save(img, "station.webp")


# ---------------------------------------------------------------- wildfire
def wildfire():
    rows = list(csv.DictReader(open(FIRE_CSV, newline="")))
    lat0, lat1, lon0, lon1 = 10.45, 14.55, 74.95, 78.55
    k = math.cos(math.radians(12.5))
    span_x, span_y = (lon1 - lon0) * k, lat1 - lat0
    scale = min((W - 160) / span_x, (H - 160) / span_y)
    ox = (W - span_x * scale) / 2
    oy = (H - span_y * scale) / 2

    acc = np.zeros((H, W), dtype=np.float32)
    for r in rows:
        x = ox + (float(r["longitude"]) - lon0) * k * scale
        y = oy + (lat1 - float(r["latitude"])) * scale
        xi, yi = int(x), int(y)
        if 0 <= xi < W and 0 <= yi < H:
            acc[yi, xi] += 0.6 + min(float(r["frp"]), 120) / 60
    glow = gblur(acc, 9)
    core = gblur(acc, 1.6)
    v = np.log1p(glow * 40) / np.log1p(glow.max() * 40) * 0.8 + np.log1p(core * 8) / np.log1p(core.max() * 8) * 0.55
    img = Image.fromarray(ramp_array(np.clip(v, 0, 1)), "RGB")

    d = ImageDraw.Draw(img, "RGBA")
    for g in np.arange(11, 14.6, 1):
        y = oy + (lat1 - g) * scale
        d.line([(60, y), (W - 60, y)], fill=(*MUTED, 40))
        d.text((W - 150, y - 26), f"{g:.0f}.0N", font=MONO_S, fill=(*MUTED, 180))
    for g in np.arange(75.5, 78.6, 1):
        x = ox + (g - lon0) * k * scale
        d.line([(x, 60), (x, H - 60)], fill=(*MUTED, 40))
    dates = sorted(r["acq_date"] for r in rows)
    corner_text(d, "NASA FIRMS / MODIS C6.1 / KARNATAKA - KERALA - TAMIL NADU",
                f"{len(rows):,} DETECTIONS / {dates[0][:4]}-{dates[-1][:4]}")
    save(img, "wildfire.webp")


# ---------------------------------------------------------------- asr
def asr():
    rnd = np.random.default_rng(7)
    T, F = 400, 128
    t = np.linspace(0, 1, T)
    spec = rnd.random((F, T)) * 0.08
    # syllable envelopes
    env = np.zeros(T)
    x = 0.02
    while x < 0.96:
        dur = rnd.uniform(0.04, 0.11)
        env += np.exp(-((t - x - dur / 2) / (dur / 2.4)) ** 2) * rnd.uniform(0.6, 1)
        x += dur + rnd.uniform(0.005, 0.05)
    env = np.clip(env, 0, 1)
    pitch = 9 + 3 * np.sin(t * 9) + 1.5 * np.sin(t * 23)
    f = np.arange(F)[:, None]
    for h in range(1, 12):
        spec += np.exp(-((f - pitch * h) / 1.4) ** 2) * env * (0.95 / h ** 0.55)
    for fc, bw in ((34, 10), (62, 14), (92, 16)):
        spec += np.exp(-((f - fc - 6 * np.sin(t * 13)) / bw) ** 2) * env * 0.25
    spec = np.clip(spec / spec.max(), 0, 1) ** 0.8
    spec = spec[::-1]
    im = Image.fromarray(ramp_array(spec), "RGB").resize((W - 120, 760), Image.BICUBIC)
    img = Image.new("RGB", (W, H), BG)
    img.paste(im, (60, 110))
    d = ImageDraw.Draw(img)
    # CTC alignment strip
    x = 60
    while x < W - 80:
        wdt = int(rnd.uniform(14, 70))
        on = rnd.random() > 0.35
        d.rectangle([x, 900, x + wdt - 4, 930], fill=ACCENT if on else (30, 36, 42))
        x += wdt
    corner_text(d, "WAV2VEC2-XLS-R-300M + CTC / COMMON VOICE 17 URDU", "WER 34.6% / CER 11.5% / 4,056 CLIPS")
    save(img, "asr.webp")


# ---------------------------------------------------------------- ascend
def ascend():
    rnd = random.Random(11)
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    cols, rows_, cell, gap = 17, 7, 64, 14
    gw = cols * cell + (cols - 1) * gap
    gh = rows_ * cell + (rows_ - 1) * gap
    x0, y0 = (W - gw) // 2, (H - gh) // 2 + 20
    level = 0.2
    for c in range(cols):
        level = min(1, max(0, level + rnd.uniform(-0.12, 0.2)))
        for r in range(rows_):
            v = max(0, min(1, level + rnd.uniform(-0.35, 0.3)))
            if rnd.random() < 0.12:
                v = 0
            col = (26, 31, 37) if v < 0.08 else ramp(0.3 + v * 0.65)
            x, y = x0 + c * (cell + gap), y0 + r * (cell + gap)
            d.rounded_rectangle([x, y, x + cell, y + cell], radius=10, fill=col)
    for r, lab in enumerate("MTWTFSS"):
        d.text((x0 - 40, y0 + r * (cell + gap) + 18), lab, font=MONO_S, fill=MUTED)
    corner_text(d, "ASCEND / DAILY CHECK-INS / 17 WEEKS", "NEXT.JS 16 / PRISMA / POSTGRES / VERCEL")
    save(img, "ascend.webp")


# ---------------------------------------------------------------- portrait
def reconstruct(seed, allowed, iters=4000):
    """Grow `seed` through `allowed` pixels (4-connected) until it stops changing."""
    cur = seed & allowed
    for _ in range(iters):
        nxt = cur.copy()
        nxt[1:] |= cur[:-1]
        nxt[:-1] |= cur[1:]
        nxt[:, 1:] |= cur[:, :-1]
        nxt[:, :-1] |= cur[:, 1:]
        nxt &= allowed
        if (nxt == cur).all():
            break
        cur = nxt
    return cur


def portrait(src):
    im = Image.open(src).convert("RGB")
    small = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
    a = np.asarray(small, dtype=np.float32)
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.maximum(mx, 1)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # hue in degrees, enough to tell beige wall (~40-60) from skin and shirt (~10-30)
    hue = np.degrees(np.arctan2(np.sqrt(3) * (g - b), 2 * r - g - b)) % 360
    white = (mx > 185) & (sat < 0.16)
    beige = (mx > 140) & (sat < 0.32) & (hue > 36) & (hue < 70)
    bg_like = white | beige
    border = np.zeros_like(bg_like)
    border[0, :] = border[:, 0] = border[:, -1] = True
    border[-1, :] = False                           # the shirt runs off the bottom edge
    bg = reconstruct(border, bg_like)
    fg = ~bg
    seed = np.zeros_like(fg)
    seed[fg.shape[0] // 2, fg.shape[1] // 2] = True
    fg = reconstruct(seed, fg)                       # drop islands (wall switch, specks)
    # close pinholes inside the subject
    inv = reconstruct(border, ~fg)
    fg = ~inv
    mask = Image.fromarray((fg * 255).astype(np.uint8)).resize(im.size, Image.LANCZOS)
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(2.2))
    out = im.convert("RGBA")
    out.putalpha(mask)
    out = out.crop(out.getbbox())
    out.thumbnail((1100, 1500), Image.LANCZOS)
    OUT.mkdir(exist_ok=True)
    out.save(OUT / "portrait.webp", "WEBP", quality=88, method=6)
    print("wrote", OUT / "portrait.webp", out.size)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--portrait")
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    jobs = {"station": station, "wildfire": wildfire, "asr": asr, "ascend": ascend}
    for name, fn in jobs.items():
        if not args.only or name in args.only:
            fn()
    if args.portrait:
        portrait(args.portrait)
