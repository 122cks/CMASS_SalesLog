
#!/usr/bin/env python3
import urllib.request
import urllib.error

urls = [
    'https://cmass-sales.web.app/',
    'https://cmass-sales.web.app/input',
    'https://cmass-sales.web.app/meeting',
    'https://cmass-sales.web.app/front',
    'https://cmass-sales.web.app/report',
]

for u in urls:
    print('\n===', u, '===')
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as r:
            status = r.getcode()
            body = r.read().decode('utf-8', errors='replace')
            snippet = body[:1000]
            print('Status:', status)
            print(snippet)
    except urllib.error.HTTPError as he:
        print('HTTPError:', he.code, he.reason)
    except Exception as e:
        print('ERROR:', repr(e))
