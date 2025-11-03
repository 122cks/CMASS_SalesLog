from pathlib import Path
import cairosvg

base=Path('icon_src/CMASS_sales_logo.svg')
if not base.exists():
    raise SystemExit(f'SVG not found: {base}')

sizes={'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192,'play':512}
out_base=Path('app/src/main/res')
for k,s in sizes.items():
    d = out_base / f'mipmap-{k}' if k!='play' else out_base / 'mipmap-playstore'
    d.mkdir(parents=True, exist_ok=True)
    out = d / 'ic_launcher_foreground.png'
    cairosvg.svg2png(url=str(base), write_to=str(out), output_width=s, output_height=s)
    print('wrote', out)
