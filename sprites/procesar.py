"""
Turns the source illustrations into what the app ships.

Three things, in order: knock out the white background (feathering the edge,
so the dark outline does not pick up a halo on a dark panel), trim to what is
actually drawn, and square it so every resource occupies the same box
wherever it is used.

Run from the repo root:  python3 sprites/procesar.py

The sources stay here because they are the masters — 2752×1536 each, far more
than the app needs — and the webp files under apps/web/public/recursos are
derived. Re-run this after replacing a source; do not hand-edit the output.
"""

import os
from PIL import Image

NAMES = {
    'madera-sprite.jpeg': 'wood',
    'ladrillo-sprite.jpeg': 'brick',
    'lana-sprite.jpeg': 'sheep',
    'trigo-sprite.jpeg': 'wheat',
    'mineral-sprite.jpeg': 'ore',
}

# Anything this close to white is background, not drawing. The art has a dark
# outline all round, so the cut never eats into it.
WHITE = 238
FEATHER = 26
TARGET = 256

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'apps', 'web', 'public', 'recursos')


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for source, key in NAMES.items():
        image = Image.open(os.path.join(HERE, source)).convert('RGBA')
        pixels = image.load()
        width, height = image.size

        for y in range(height):
            for x in range(width):
                r, g, b, _ = pixels[x, y]
                darkest = min(r, g, b)
                if darkest >= WHITE:
                    pixels[x, y] = (r, g, b, 0)
                elif darkest >= WHITE - FEATHER:
                    pixels[x, y] = (r, g, b, int(255 * (WHITE - darkest) / FEATHER))

        box = image.getbbox()
        if box:
            image = image.crop(box)

        side = max(image.size)
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.paste(image, ((side - image.width) // 2, (side - image.height) // 2))
        canvas = canvas.resize((TARGET, TARGET), Image.LANCZOS)

        path = os.path.join(OUT, f'{key}.webp')
        canvas.save(path, 'WEBP', quality=86, method=6)
        print(f'{key:6} {os.path.getsize(path) / 1024:6.1f} kB')


if __name__ == '__main__':
    main()
