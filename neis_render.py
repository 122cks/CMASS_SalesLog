import sys, json, csv, html
from datetime import datetime

if len(sys.argv) < 3:
    print('Usage: neis_render.py <input_json> <output_prefix>')
    sys.exit(2)

infile = sys.argv[1]
outprefix = sys.argv[2]

with open(infile, 'r', encoding='utf-8-sig') as f:
    j = json.load(f)

# Try to find the timetable block (hisTimetable or misTimetable)
block = None
for key in ('hisTimetable','misTimetable'):
    if key in j:
        block = j[key]
        break

rows = []
if block and isinstance(block, list) and len(block) > 1 and isinstance(block[1], dict) and 'row' in block[1]:
    rows = block[1]['row']

# write csv
csv_path = outprefix + '.csv'
if rows:
    keys = list(rows[0].keys())
    with open(csv_path, 'w', newline='', encoding='utf-8') as cf:
        writer = csv.DictWriter(cf, fieldnames=keys)
        writer.writeheader()
        for r in rows:
            writer.writerow({k: (r.get(k) or '') for k in keys})
else:
    # write empty csv
    with open(csv_path, 'w', newline='', encoding='utf-8') as cf:
        cf.write('')

# write HTML
html_path = outprefix + '.html'
with open(html_path, 'w', encoding='utf-8') as hf:
    hf.write('<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><title>NEIS Timetable Preview</title>'
             + '<style>body{font-family:Segoe UI, Arial; padding:18px; background:#fff} table{border-collapse:collapse; width:100%} th,td{border:1px solid #e6eefc; padding:6px; text-align:left} th{background:#f7fbff}</style></head><body>')
    hf.write(f'<h2>NEIS Timetable preview - {html.escape(outprefix)}</h2>')
    if not rows:
        hf.write('<div style="color:#666">데이터가 없습니다.</div>')
    else:
        hf.write('<div style="margin-bottom:8px;"><a href="' + outprefix.split('/')[-1] + '.csv">CSV 다운로드</a></div>')
        # Build mapping by class (GRADE-CLASS_NM) and weekday/period
        class_map = {}  # class_key -> { period -> { weekday -> [subjects] } }
        max_period = 0
        for r in rows:
            grade = (r.get('GRADE') or r.get('GRADE') or '').strip()
            class_nm = (r.get('CLASS_NM') or r.get('CLRM_NM') or '').strip()
            if not grade and class_nm:
                # try to split class_nm like '1' etc.
                pass
            class_key = f"{grade}-{class_nm}" if grade or class_nm else 'Unknown'
            try:
                period = int(r.get('PERIO') or 0)
            except:
                period = 0
            if period > max_period:
                max_period = period
            date_str = r.get('ALL_TI_YMD') or ''
            weekday = None
            if date_str and len(date_str) >= 8:
                try:
                    dt = datetime.strptime(date_str[:8], '%Y%m%d')
                    weekday = dt.weekday()  # 0=Mon .. 6=Sun
                except:
                    weekday = None
            subj = (r.get('ITRT_CNTNT') or r.get('SUBJ_NM') or '').strip()
            class_map.setdefault(class_key, {}).setdefault(period, {}).setdefault(weekday, [])
            if weekday is not None and 0 <= weekday <= 4:
                cell = class_map[class_key][period].setdefault(weekday, [])
                if subj and subj not in cell:
                    cell.append(subj)

        # Prepare ordered class columns
        class_cols = sorted([k for k in class_map.keys() if k != 'Unknown'])
        if not class_cols and 'Unknown' in class_map:
            class_cols = ['Unknown']

        days = ['월','화','수','목','금']

        # Render one table per selected weekday (user wants a table for the visit weekday)
        # For usability we render all weekdays; each table has columns = classes, rows = periods
        for wd_index, day_label in enumerate(days):
            hf.write(f'<h3 style="margin-top:14px;">{day_label}요일</h3>')
            hf.write('<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">')
            # header: first cell is blank (교시), then class columns
            hf.write('<thead><tr><th style="border:1px solid #e6eefc;padding:6px;background:#f7fbff;">교시</th>')
            for ck in class_cols:
                hf.write('<th style="border:1px solid #e6eefc;padding:6px;background:#f7fbff;">' + html.escape(ck) + '</th>')
            hf.write('</tr></thead>')
            hf.write('<tbody>')
            # rows: periods
            for p in range(1, max_period+1):
                hf.write('<tr>')
                hf.write('<td style="border:1px solid #f2f6ff;padding:8px;font-weight:800;">' + str(p) + '교시</td>')
                for ck in class_cols:
                    grid = class_map.get(ck, {})
                    cell_items = grid.get(p, {}).get(wd_index, []) if grid else []
                    celltxt = ' / '.join(cell_items) if cell_items else ''
                    hf.write('<td style="border:1px solid #f2f6ff;padding:8px;vertical-align:top;">' + html.escape(celltxt) + '</td>')
                hf.write('</tr>')
            hf.write('</tbody></table>')
    hf.write('</body></html>')

print('Wrote', html_path, 'and', csv_path)
