import csv
from pathlib import Path
p = Path(__file__).resolve().parents[1] / 'public' / 'order.csv'
if not p.exists():
    print('order.csv not found at', p)
    raise SystemExit(1)

matches = []
with p.open(newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for r in reader:
        code = (r.get('정보공시학교코드') or r.get('school_code') or r.get('학교코드') or '').strip()
        name = (r.get('교지명') or r.get('교재명') or r.get('도서명') or r.get('bookname') or '').strip()
        schoolname = (r.get('학교명') or r.get('school') or '').strip()
        if code == 'S020000338':
            matches.append({'code':code,'school':schoolname,'name':name,'raw':r})

print('TOTAL_MATCHES:', len(matches))
for i,m in enumerate(matches[:50],1):
    print(i, m['code'], m['school'], m['name'])

has_text = [m for m in matches if '교과서' in (m['name'] or '')]
print('WITH_교과서:', len(has_text))
for m in has_text[:20]:
    print(' *', m['code'], m['school'], m['name'])
