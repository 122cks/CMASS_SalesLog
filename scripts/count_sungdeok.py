# small helper to count assigned_sales for entries mentioning '숭덕'
import json
from collections import Counter
p = 'kakao_entries.normalized.jsonl'
c = Counter()
with open(p, encoding='utf8') as fh:
    for ln in fh:
        try:
            j = json.loads(ln)
        except Exception:
            continue
        text_fields = (j.get('school') or '') + '|' + (j.get('neis_name') or '') + '|' + (j.get('conversation') or '')
        if '숭덕' in text_fields:
            c[j.get('assigned_sales') or ''] += 1
for k, v in c.most_common():
    print(f"{k} : {v}")
