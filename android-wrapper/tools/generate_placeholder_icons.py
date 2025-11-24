from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / 'app' / 'src' / 'main' / 'res'
SIZES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
    'mipmap-playstore': 512,
}


def make_dirs():
    for d in SIZES:
        (ROOT / d).mkdir(parents=True, exist_ok=True)


def draw_icon(size, text='CS'):
    img = Image.new('RGBA', (size, size), (0, 122, 255, 255))
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('arial.ttf', int(size * 0.4))
    except Exception:
        font = ImageFont.load_default()
    # Compute text size in a way compatible with multiple Pillow versions
    w = h = None
    try:
        # Pillow >= 8: FreeTypeFont.getbbox
        bbox = font.getbbox(text)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
    except Exception:
        try:
            # Pillow newer: ImageDraw.textbbox
            bbox = draw.textbbox((0, 0), text, font=font)
            w = bbox[2] - bbox[0]
            h = bbox[3] - bbox[1]
        except Exception:
            try:
                # Older fallback
                w, h = draw.textsize(text, font=font)
            except Exception:
                w = h = int(size * 0.5)
    draw.text(((size - w) / 2, (size - h) / 2), text, font=font, fill=(255, 255, 255, 255))
    return img


def main():
    make_dirs()
    for folder, px in SIZES.items():
        out = ROOT / folder / 'ic_launcher_foreground.png'
        img = draw_icon(px)
        img.save(out, format='PNG')
        print('Wrote', out)


if __name__ == '__main__':
    main()
