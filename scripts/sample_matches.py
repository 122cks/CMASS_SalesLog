# sample_matches.py
# Print up to 5 distinct school entries from kakao_entries.normalized.jsonl
import json
p = 'kakao_entries.normalized.jsonl'
seen = set()
count = 0
with open(p, encoding='utf8') as fh:
    for ln in fh:
        try:
            j = json.loads(ln)
        except Exception:
            continue
        school = (j.get('school') or '').strip()
        if not school:
            continue
        if school in seen:
            continue
        seen.add(school)
        count += 1
        print(f"[{count}] school: {school}")
        print(f"    neis_name: {j.get('neis_name') or ''}")
        print(f"    neis_code: {j.get('neis_code') or ''}")
        print(f"    assigned_sales: {j.get('assigned_sales') or ''}")
        print(f"    visit_date: {j.get('visit_date') or ''}")
        conv = (j.get('conversation') or '').replace('\n','\n        ')
        snippet = conv[:200] + ('...' if len(conv) > 200 else '')
        print('    conversation_snippet:')
        print('        ' + snippet)
        print()
        if count >= 5:
            break
if count == 0:
    print('No school entries found.')
