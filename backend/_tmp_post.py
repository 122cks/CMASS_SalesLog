import time, sys
import urllib.request, json
url = 'http://127.0.0.1:5000/api/visits'
payload = {"staff":"자동테스트","visits":[]}
for i in range(6):
    try:
        data = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(url, data=data, headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            print('HTTP', resp.getcode())
            print(resp.read().decode())
            sys.exit(0)
    except Exception as e:
        print('attempt', i, 'error', e)
        time.sleep(0.8)
print('failed to contact backend')
