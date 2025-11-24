import json
from pathlib import Path
p = Path('geocodes.json')
if not p.exists():
    print('geocodes.json not found')
    raise SystemExit(1)
js = json.loads(p.read_text(encoding='utf-8'))
rows = [['school','has_neis','lat','lon','count','examples']]
for k,v in js.items():
    has_neis = 'no'
    lat = ''
    lon = ''
    cnt = ''
    ex = ''
    if v is None:
        pass
    else:
        if isinstance(v, dict) and 'neis' in v:
            has_neis = 'yes'
            cnt = str(v.get('neis',{}).get('count',''))
            ex_list = v.get('neis',{}).get('examples',[])
            ex = ' | '.join([f"{it.get('date','')}/{it.get('staff','')}" for it in ex_list])
        lat = '' if v is None else (str(v.get('lat','')) if isinstance(v,dict) else '')
        lon = '' if v is None else (str(v.get('lon','')) if isinstance(v,dict) else '')
    # include if missing coords
    if v is None or not lat or not lon or lat in ['null','None'] or lon in ['null','None']:
        rows.append([k,has_neis,lat,lon,cnt,ex])
out = '\n'.join([','.join(['"'+c.replace('"','""')+'"' for c in r]) for r in rows])
Path('geocodes_missing.csv').write_text(out,encoding='utf-8')
print('WROTE',len(rows)-1,'missing rows to geocodes_missing.csv')
