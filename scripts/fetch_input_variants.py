#!/usr/bin/env python3
import urllib.request, urllib.error, time
from pathlib import Path
outdir = Path('scripts/deploy-checks')
outdir.mkdir(parents=True, exist_ok=True)
base = 'https://cmass-sales.web.app'
paths = ['/input', '/input.html', '/input/index.html']
for p in paths:
    url = base + p + '?_ts=' + str(int(time.time()))
    print('Fetching', url)
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=20) as r:
            body = r.read()
            f = outdir / (p.strip('/').replace('/','_') or 'root')
            f = f.with_suffix('.html')
            f.write_bytes(body)
            print('Wrote', f, 'size=', len(body))
    except Exception as e:
        print('ERROR', p, e)
