from pathlib import Path
from PIL import Image

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


def main():
    make_dirs()
    for folder, px in SIZES.items():
        out = ROOT / folder / 'ic_launcher_background.png'
        img = Image.new('RGBA', (px, px), (255, 255, 255, 255))
        img.save(out, format='PNG')
        print('Wrote', out)


if __name__ == '__main__':
    main()
