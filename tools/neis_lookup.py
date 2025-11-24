# NEIS lookup helper
# Usage: python neis_lookup.py "숭덕여중" "숭덕여자중학교"
# - Extracts NEIS_KEY from known JS files in repo (tools/script_4.js, deploy_page.html, input.html)
# - Calls schoolInfo endpoint for each provided SCHUL_NM and prints parsed rows (SCHUL_NM, SD_SCHUL_CODE, ATPT_OFCDC_SC_CODE)

import sys, re, json, urllib.parse, urllib.request, os

ROOT = os.path.dirname(__file__)
SEARCH_FILES = [os.path.join(ROOT, 'script_4.js'), os.path.join('..','input.html'), os.path.join('..','tools','deploy_page.html')]
# also try absolute paths relative to repo root
SEARCH_FILES = [p for p in SEARCH_FILES if os.path.exists(p)]

NEIS_KEY = None
key_re = re.compile(r"NEIS_KEY\s*=\s*['\"]([0-9a-fA-F]+)['\"]")
# fallback key pattern in deploy_page or script files
key_re2 = re.compile(r"KEY\s*=\s*['\"]([0-9a-fA-F]+)['\"]")

for p in SEARCH_FILES:
    try:
        s = open(p, 'r', encoding='utf8').read()
    except Exception:
        continue
    m = key_re.search(s)
    if m:
        NEIS_KEY = m.group(1)
        break
    m2 = key_re2.search(s)
    if m2:
        NEIS_KEY = m2.group(1)
        break

if not NEIS_KEY:
    # try scanning repo root files
    for fname in ['tools/script_4.js','tools/deploy_page.html','deploy_page.html','tools/script_4.js','input.html']:
        fp = os.path.join(os.path.dirname(ROOT), fname)
        if os.path.exists(fp):
            try:
                s = open(fp,'r',encoding='utf8').read()
            except Exception:
                continue
            m = key_re.search(s) or key_re2.search(s)
            if m:
                NEIS_KEY = m.group(1)
                break

if not NEIS_KEY:
    print('NEIS key not found in expected files. Please provide NEIS key via environment variable NEIS_KEY or add it to tools/script_4.js.')
    sys.exit(2)

candidates = sys.argv[1:]
if not candidates:
    print('Provide one or more school name candidates as command-line arguments.')
    sys.exit(2)

endpoint = 'https://open.neis.go.kr/hub/schoolInfo'

def query_school(school_name, atpt=''):
    params = {
        'KEY': NEIS_KEY,
        'type': 'json',
        'pIndex': '1',
        'pSize': '10',
        'ATPT_OFCDC_SC_CODE': atpt,
        'SCHUL_NM': school_name,
    }
    url = endpoint + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent':'neis-lookup/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            text = res.read().decode('utf8', errors='ignore')
            try:
                j = json.loads(text)
            except Exception:
                return {'error':'failed-parse','status':getattr(res,'status',None),'body':text[:2000]}
            return {'status':getattr(res,'status',None),'json':j}
    except Exception as e:
        return {'error':str(e)}

for cand in candidates:
    print('---')
    print('Candidate:', cand)
    r = query_school(cand)
    if 'error' in r:
        print('  ERROR:', r['error'])
        continue
    print('  HTTP status:', r.get('status'))
    j = r.get('json')
    # NEIS usually returns {"schoolInfo": [ {"head": [...]}, {"row": [ {...}, ... ] } ] }
    if not j:
        print('  No JSON returned')
        continue
    # find any 'schoolInfo' or 'school' keys
    block = None
    if 'schoolInfo' in j:
        block = j['schoolInfo']
    else:
        # try to find first key that contains 'school'
        for k in j:
            if 'school' in k.lower():
                block = j[k]
                break
    if not block:
        print('  No schoolInfo block in response; sample keys:', list(j.keys())[:10])
        continue
    # attempt to find rows
    rows = []
    for part in block:
        if isinstance(part, dict) and 'row' in part and isinstance(part['row'], list):
            rows.extend(part['row'])
    if not rows:
        # sometimes structure is simpler
        for part in block:
            if isinstance(part, list):
                for item in part:
                    if isinstance(item, dict):
                        rows.append(item)
    if not rows:
        print('  No rows found; raw block sample:', json.dumps(block)[:2000])
        continue
    print(f'  rows found: {len(rows)}')
    for r0 in rows:
        sch = r0.get('SCHUL_NM') or r0.get('SCHUL_NAME') or r0.get('schoolName') or ''
        code = r0.get('SD_SCHUL_CODE') or r0.get('SCHOOL_CODE') or ''
        atpt = r0.get('ATPT_OFCDC_SC_CODE') or r0.get('ATPT_CODE') or ''
        sido = r0.get('LCTN_SC_NM') or r0.get('ADDR') or ''
        print('   -', sch, '| code=', code, '| atpt=', atpt, '| loc=', sido)

print('--- Finished')
