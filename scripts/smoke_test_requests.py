
#!/usr/bin/env python3
"""
Simple smoke tester: fetch /input.html and /sales_staff.csv from localhost:5500
Print HTTP status, final URL (after redirects), and first 2000 chars of body.
"""
import sys
from urllib.parse import urljoin

def fetch(url):
    try:
        import requests
        r = requests.get(url, timeout=10)
        return r.status_code, r.url, r.headers.get('content-type',''), r.text
    except Exception:
        # fallback to urllib
        try:
            from urllib.request import urlopen, Request
            req = Request(url, headers={'User-Agent':'smoke-test/1.0'})
            with urlopen(req, timeout=10) as r:
                status = r.getcode()
                final = r.geturl()
                ct = r.headers.get('Content-Type','')
                body = r.read().decode('utf-8', errors='replace')
                return status, final, ct, body
        except Exception as e:
            return None, None, None, f'ERROR: {e}'


def main():
    base = 'http://localhost:5500'
    urls = [
        base + '/input?staff=songhoojae',
        base + '/input.html?staff=songhoojae',
        base + '/sales_staff.csv'
    ]
    for u in urls:
        print('='*80)
        print('URL:', u)
        status, final, ct, body = fetch(u)
        print('Status:', status)
        print('Final URL:', final)
        print('Content-Type:', ct)
        if body is None:
            print('No body')
            continue
        print('Body sample (first 2000 chars):')
        print(body[:2000])
        print('\n...')

if __name__ == '__main__':
    main()
