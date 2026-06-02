import os, sys
from fontTools.ttLib import TTFont

for f in os.listdir('.'):
    if f.endswith('.ttf') and not os.path.exists(f.replace('.ttf', '.woff2')):
        try:
            out = f.replace('.ttf', '.woff2')
            font = TTFont(f)
            font.flavor = 'woff2'
            font.save(out)
            orig = os.path.getsize(f)
            conv = os.path.getsize(out)
            print(f'{f} -> {out} ({orig//1024}K -> {conv//1024}K)')
        except Exception as e:
            print(f'{f}: ERROR {e}', file=sys.stderr)
