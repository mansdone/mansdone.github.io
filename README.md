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
| `portrait.webp` | Hero cutout. Currently cut from `Downloads\jawwaad.jpeg`, a stand-in. |
| `station.webp` | Real pass tracks over the PES ground station, next 24 h, Skyfield/SGP4 |
| `wildfire.webp` | Real NASA FIRMS MODIS fire detections, 2021-2025 |
| `asr.webp` | Stylised spectrogram (decorative) |
| `ascend.webp` | Habit-heatmap motif (decorative) |

Regenerate them (uses the SatelliteAutomation venv, which has Skyfield, NumPy, Pillow):

```powershell
..\SatelliteAutomation\.venv\Scripts\python.exe tools\make_images.py
```

### Swapping the portrait

Best result: a waist-up or chest-up photo on a plain wall. Either:

- Remove the background yourself (Windows 11 Paint → *Remove background*, or
  Photos → *Edit* → *Background*), save as PNG, then convert:
  `python -c "from PIL import Image; Image.open('me.png').save('assets/portrait.webp', quality=88)"`
- Or let the script try: `python tools\make_images.py --only none --portrait C:\path\photo.jpg`
  (works well on light, plain walls).

## Deploy

It's static: GitHub Pages, Vercel or Netlify all work by pointing at this folder.
Not deployed yet.
