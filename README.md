# Jawwaad Sheriff: portfolio

One self-contained `index.html`: no build step, no framework. Lenis (smooth scroll)
loads from jsDelivr; fonts are Anton and Onest from Google Fonts. Everything else
is inline.

## Preview

```powershell
cd "C:\Users\jawwa\OneDrive\Desktop\portfolio"
python -m http.server 8731
```

Open http://localhost:8731. Opening `index.html` directly from disk also works.

## Images (`assets/`)

| File | What it is |
|---|---|
| `portrait.webp` | Your photo in the hero, with the background removed. See **Changing your photo**. |
| `station.webp` | Real pass tracks over the PES ground station, next 24 h, Skyfield/SGP4 |
| `wildfire.webp` | Real NASA FIRMS MODIS fire detections, 2021-2025 |
| `asr.webp` | Stylised spectrogram (decorative) |
| `ascend.webp` | Habit-heatmap motif (decorative) |

Regenerate them (uses the SatelliteAutomation venv, which has Skyfield, NumPy, Pillow):

```powershell
..\SatelliteAutomation\.venv\Scripts\python.exe tools\make_images.py
```

## Changing your photo

The hero photo is **`assets/portrait.webp`**. It's used in one place,
`index.html`, in the hero (search the file for `YOUR PHOTO`):

```html
<img src="assets/portrait.webp" alt="">
```

It must be a **cut-out with a transparent background**, or the photo's own
background shows as a box over your name. Three ways to make one:

1. **Easiest, no tools:** Windows 11 Paint → open the photo → *Remove background*
   → *Save as* PNG. Put the PNG in `assets\` and change the `src` above to its
   name (e.g. `assets/portrait.png`).
2. **Website:** remove.bg does the same; download the PNG.
3. **Script (best edges on busy backgrounds):**
   `python tools\cutout.py "C:\path\to\photo.jpg"` overwrites `assets/portrait.webp`.
   Needs `pip install "rembg[cpu]" pillow`.

Waist-up photos work best. The site pins the image to the bottom-centre of the
screen and shows it in black and white until someone hovers over it.

## Deploy

Live at **https://mansdone.github.io** (repo `mansdone/mansdone.github.io`,
GitHub Pages from `master`). To update the live site, commit and push:

```powershell
git add -A
git commit -m "Update photo"
git push
```

It rebuilds in about 10 seconds.
