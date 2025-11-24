#!/usr/bin/env python3
"""
scripts/precompute_geocodes.py

Usage:
  - Put a flattened visits JSONL or JSON array file (default: kakao_entries.normalized.jsonl or kakao_entries.normalized.json) in the repo root.
  - Run this script; it will read visits, aggregate by school name, query Nominatim politely, and write `geocodes.json` to the repo root.

Notes:
  - This is intended for one-off precompute. Nominatim has rate limits — the script uses a 1s delay by default and a user-agent header.
  - You can adjust INPUT_PATH and OUTPUT_PATH below.
"""
import time
import json
import sys
import os
from urllib.parse import urlencode
import urllib.request

INPUT_PATHS = ["kakao_entries.normalized.jsonl", "kakao_entries.normalized.json"]
OUTPUT_PATH = "geocodes.json"
USER_AGENT = "CMASS-GeocodeScript/1.0 (contact: your-email@example.com)"
DELAY_SEC = 1.0
NEIS_KEY = os.environ.get('NEIS_KEY') or ''


def load_entries():
    for p in INPUT_PATHS:
        if os.path.exists(p):
            print(f"Loading entries from {p}")
            if p.endswith('.jsonl'):
                out = []
                with open(p, 'r', encoding='utf8') as f:
                    for line in f:
                        line=line.strip()
                        if not line: continue
                        try:
                            out.append(json.loads(line))
                        except Exception as e:
                            print('skip line parse', e)
                return out
            else:
                with open(p, 'r', encoding='utf8') as f:
                    return json.load(f)
    print('No input entries file found in', INPUT_PATHS)
    return []


def aggregate_by_school(rows):
    by = {}
    for r in rows:
        s = (r.get('school') or '').strip()
        if not s: continue
        if s not in by: by[s] = {'count':0, 'examples': []}
        by[s]['count'] += 1
        if len(by[s]['examples']) < 10:
            by[s]['examples'].append({ 'date': r.get('visit_date') or r.get('created_at'), 'staff': r.get('staff') })
    return by


def nominatim_geocode(q):
    base = 'https://nominatim.openstreetmap.org/search'
    params = { 'format':'json', 'limit':1, 'countrycodes':'kr', 'q': q }
    url = base + '?' + urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = r.read().decode('utf8')
            arr = json.loads(data)
            if arr and len(arr):
                return { 'lat': float(arr[0]['lat']), 'lon': float(arr[0]['lon']), 'display_name': arr[0].get('display_name') }
    except Exception as e:
        print('geocode error', e)
    return None


def neis_schoolinfo_lookup(school_name, atpt_code=''):
    """Query NEIS schoolInfo endpoint for a school name. Returns parsed dict or None.
    Requires NEIS_KEY environment variable to be set.
    """
    if not NEIS_KEY:
        return None
    base = 'https://open.neis.go.kr/hub/schoolInfo'
    params = { 'KEY': NEIS_KEY, 'type':'json', 'pIndex':1, 'pSize':10, 'SCHUL_NM': school_name }
    if atpt_code:
        params['ATPT_OFCDC_SC_CODE'] = atpt_code
    url = base + '?' + urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': 'CMASS-NEIS-Precompute/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            text = r.read().decode('utf8')
            j = json.loads(text)
            # NEIS returns something like {"schoolInfo": [ {head}, {row: [...] } ] }
            for v in j.values():
                if isinstance(v, list):
                    for cand in v:
                        if isinstance(cand, dict) and 'row' in cand:
                            rows = cand.get('row')
                            if rows and len(rows):
                                # pick first
                                info = rows[0]
                                return info
    except Exception as e:
        print('NEIS lookup error', e)
    return None


def run():
    rows = load_entries()
    if not rows:
        print('No rows to process')
        return 1
    by = aggregate_by_school(rows)
    out = {}
    total = len(by)
    i = 0
    for name, info in by.items():
        i += 1
        print(f'[{i}/{total}] Geocoding: {name} (count={info["count"]})')
        # try NEIS first (if key present) to get canonical metadata
        neis_meta = None
        try:
            neis_meta = neis_schoolinfo_lookup(name)
        except Exception as e:
            neis_meta = None
        res = None
        if neis_meta:
            # attempt geocode with NEIS-provided address or school+교육청
            q = (neis_meta.get('LCTN_ADRES') or (name + ' 학교'))
            res = nominatim_geocode(q)
            if not res:
                # fallback to simple name search
                res = nominatim_geocode(name + ' 학교')
        else:
            q = name + ' 학교'
            res = nominatim_geocode(q)

        if res:
            res['count'] = info['count']
            res['examples'] = info['examples']
            if neis_meta:
                res['neis'] = neis_meta
            out[name] = res
        else:
            # store NEIS meta even if geocode failed
            if neis_meta:
                neis_meta['count'] = info['count']
                neis_meta['examples'] = info['examples']
                out[name] = { 'neis': neis_meta, 'lat': None, 'lon': None }
            else:
                out[name] = None
        time.sleep(DELAY_SEC)
    with open(OUTPUT_PATH, 'w', encoding='utf8') as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print('Wrote', OUTPUT_PATH)
    return 0


if __name__ == '__main__':
    sys.exit(run())
