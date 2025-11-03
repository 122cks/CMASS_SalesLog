import json, csv, glob, re
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSONL = ROOT / 'kakao_entries.normalized.jsonl'
PAYLOAD_NORM = ROOT / 'kakao_visits_payload.normalized.json'
SALES_CSV = ROOT / 'sales_staff.csv'


def normalize(s):
    if s is None:
        return ''
    return re.sub(r"\s+", "", str(s)).strip().lower()


def best_match(name, candidates):
    best = None
    best_score = 0.0
    for c in candidates:
        if not c: continue
        score = SequenceMatcher(None, name, normalize(c)).ratio()
        if score > best_score:
            best_score = score
            best = c
    return best, best_score


def collect_neis_names():
    names = set()
    for p in ROOT.glob('neis_*.json'):
        try:
            data = json.load(open(p, 'r', encoding='utf8'))
        except Exception:
            continue
        # The NEIS JSON structure uses keys like 'row' -> list of dicts with 'SCHUL_NM' fields.
        # Try to extract any 'SCHUL_NM' values explicitly, otherwise fall back to a recursive walk.
        try:
            # Common NEIS layout: may contain top-level objects with 'row' arrays
            if isinstance(data, dict):
                # search for SCHUL_NM keys anywhere in nested structures
                def walk_for_key(o):
                    if isinstance(o, dict):
                        for k, v in o.items():
                            if k == 'SCHUL_NM' and isinstance(v, str):
                                names.add(v.strip())
                            else:
                                walk_for_key(v)
                    elif isinstance(o, list):
                        for v in o:
                            walk_for_key(v)
                walk_for_key(data)
        except Exception:
            # ignore and continue
            pass
    return names


def collect_sales_names():
    names = set()
    if not SALES_CSV.exists():
        return names
    try:
        with open(SALES_CSV, newline='', encoding='utf8') as fh:
            reader = csv.reader(fh)
            for row in reader:
                for cell in row:
                    if cell and any(k in cell for k in ('학교','중','고','초')):
                        names.add(cell.strip())
    except Exception:
        pass
    return names


def collect_jsonl_schools():
    schools = set()
    if JSONL.exists():
        with open(JSONL, 'r', encoding='utf8') as fh:
            for line in fh:
                line = line.strip()
                if not line: continue
                try:
                    obj = json.loads(line)
                    s = obj.get('school') or obj.get('schoolName') or obj.get('school_name')
                    if s:
                        schools.add(s.strip())
                except Exception:
                    continue
    return schools


def search_payload_for(term):
    hits = []
    if PAYLOAD_NORM.exists():
        txt = open(PAYLOAD_NORM, 'r', encoding='utf8').read()
        for m in re.finditer(r'(.{0,60}'+re.escape(term)+r'.{0,60})', txt):
            hits.append(m.group(0))
    return hits


def main():
    print('Loading candidate names from sales_staff and NEIS files...')
    sales_names = sorted(collect_sales_names())
    neis_names = sorted(collect_neis_names())
    print(f'  sales names: {len(sales_names)}; neis names: {len(neis_names)}')

    print('\nCollecting schools from kakao_entries.normalized.jsonl...')
    jsonl_schools = sorted(collect_jsonl_schools())
    print(f'  jsonl schools found: {len(jsonl_schools)}')
    for s in jsonl_schools[:20]:
        print('   -', s)

    # Also search payload normalized JSON for '숭덕' to capture any mentions
    print('\nSearching payload normalized JSON for "숭덕"...')
    payload_hits = search_payload_for('숭덕')
    print(f'  payload hits: {len(payload_hits)}')
    for h in payload_hits[:10]:
        print('   *', h.replace('\n',' '))

    # We'll test fuzzy matching for a few target variants
    targets = set()
    # Add common variants explicitly
    targets.update(['숭덕여중','숭덕여자중학교','숭덕여자중','숭덕여자중학'])
    # Also include any schools from jsonl that contain '숭' or '숭덕'
    for s in jsonl_schools:
        if '숭' in s:
            targets.add(s)

    print('\nRunning fuzzy matches for target variants (threshold>=0.6)...')
    for t in sorted(targets):
        tn = normalize(t)
        best_s, bs = best_match(tn, sales_names)
        best_n, bn = best_match(tn, neis_names)
        print(f"\nTarget: '{t}' (norm='{tn}')")
        if any(tn in normalize(x) for x in sales_names):
            exact = [x for x in sales_names if tn in normalize(x)]
            print('  direct sales matches:', exact[:5])
        else:
            if best_s:
                print(f'  best sales match: {best_s} (score={bs:.2f})')
            else:
                print('  no sales candidate')
        if any(tn in normalize(x) for x in neis_names):
            exactn = [x for x in neis_names if tn in normalize(x)]
            print('  direct NEIS matches:', exactn[:5])
        else:
            if best_n:
                print(f'  best NEIS match: {best_n} (score={bn:.2f})')
            else:
                print('  no NEIS candidate')

    # Specific check: does '숭덕여중' map to '숭덕여자중학교' in sales mapping?
    canonical = None
    for s in sales_names:
        if '숭덕여자중' in normalize(s) or '숭덕여중' in normalize(s):
            canonical = s
            break
    print('\nSummary:')
    if canonical:
        print(f"  Found sales canonical name for '숭덕' -> '{canonical}'")
    else:
        print("  No canonical sales name containing '숭덕' found in sales_staff.csv")

    # If we found canonical in sales, show assigned_sales for that school by scanning sales file rows
    if canonical:
        assigned = None
        try:
            with open(SALES_CSV, newline='', encoding='utf8') as fh:
                reader = csv.reader(fh)
                for row in reader:
                    if any(canonical == cell.strip() for cell in row):
                        # heuristics: '조영환' appears in the sample CSV as later columns; find any cell that looks like a name
                        for cell in row:
                            if cell and re.search(r'[가-힣]{2,4}', cell) and '학교' not in cell:
                                # ignore empty and school names
                                assigned = cell.strip()
                                # pick the last plausible person-name-looking cell
                        break
        except Exception:
            pass
        print('  sales CSV assigned person (heuristic):', assigned)

if __name__ == '__main__':
    main()
