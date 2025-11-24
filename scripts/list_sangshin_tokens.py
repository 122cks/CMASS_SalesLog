# list_sangshin_tokens.py
# Print entries from kakao_entries.normalized.jsonl that contain '상신' and show key fields.
import json, re
p = 'kakao_entries.normalized.jsonl'
pat = re.compile(r'(\S*상신\S*)')
results = []
unique_tokens = set()
with open(p, encoding='utf8') as fh:
    for ln in fh:
        try:
            j = json.loads(ln)
        except Exception:
            continue
        text_fields = []
        for key in ('school','neis_name'):
            v = j.get(key) or ''
            if v:
                text_fields.append(v)
        conv = j.get('conversation') or ''
        text_fields.append(conv)
        joined = '\n'.join(text_fields)
        if '상신' in joined:
            toks = pat.findall(joined)
            for t in toks:
                unique_tokens.add(t.strip())
            results.append({
                'school': j.get('school') or '',
                'neis_name': j.get('neis_name') or '',
                'assigned_sales': j.get('assigned_sales') or '',
                'neis_code': j.get('neis_code') or '',
                'conversation_snippet': (conv[:300] + '...') if len(conv) > 300 else conv,
                'found_tokens': toks,
            })
# Print results
for i, r in enumerate(results, 1):
    print(f"[{i}] school: {r['school']} | neis_name: {r['neis_name']} | neis_code: {r['neis_code']} | assigned_sales: {r['assigned_sales']}")
    print('    found_tokens:', ', '.join(r['found_tokens']) )
    print('    conversation_snippet:')
    for line in r['conversation_snippet'].splitlines()[:8]:
        print('      ', line)
    print()
# Print unique tokens
print('Unique tokens found:')
for t in sorted(unique_tokens):
    print(' -', t)
print('\nTotal matching entries:', len(results))
