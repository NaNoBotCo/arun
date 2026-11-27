#!/usr/bin/env python3
"""Photos from Mot Dang's Phnom Penh library (NaNoBotCo/phnom-penh data/photos, Wikimedia Commons,
credits in credits.json) resized to WebP for the offline file. Writes data/photos/*.webp + data/photos.json."""
import json, sys
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
SRC = Path.home() / 'Developer/claude code projects/phnom-penh/data/photos'
credits = json.loads((SRC / 'credits.json').read_text())
lm = json.loads((Path.home() / 'Developer/claude code projects/phnom-penh/data/landmarks.json').read_text())
out = ROOT / 'data/photos'; out.mkdir(parents=True, exist_ok=True)
want = {'koh-pich': (1600, 74), 'chaktomuk': (1100, 66), 'water-festival': (1000, 64)}
for l in lm:
    if (SRC / f"{l['id']}.jpg").exists(): want.setdefault(l['id'], (720, 62))
meta = {}
for slug, (w, q) in want.items():
    im = Image.open(SRC / f'{slug}.jpg').convert('RGB')
    if im.width > w: im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    im.save(out / f'{slug}.webp', 'WEBP', quality=q, method=6)
    c = credits.get(slug, {})
    meta[slug] = {'w': im.width, 'h': im.height, 'bytes': (out / f'{slug}.webp').stat().st_size, 'title': c.get('title'), 'author': c.get('author'), 'licence': c.get('licence'), 'page': c.get('page')}
(ROOT / 'data/photos.json').write_text(json.dumps(meta, indent=1, ensure_ascii=False))
print(len(meta), 'photos', sum(m['bytes'] for m in meta.values()) // 1024, 'kB')
