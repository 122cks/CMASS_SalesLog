from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / 'app' / 'src' / 'main' / 'res'
SRC = Path(__file__).resolve().parents[2] / 'assets' / 'CMASS_sales_logo.png'

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


def main():
    if not SRC.exists():
        raise SystemExit(f'Source PNG not found: {SRC}')
    img = Image.open(SRC).convert('RGBA')
    make_dirs()
    for folder, px in SIZES.items():
        out = ROOT / folder / 'ic_launcher_foreground.png'
        resized = img.resize((px, px), Image.LANCZOS)
        resized.save(out, format='PNG')
        print('Wrote', out)


if __name__ == '__main__':
    main()
