#!/usr/bin/env python3
"""
kakao_to_visits.py

Parse a KakaoTalk exported text file (flexible heuristics) and emit data in formats
used by this project.

Outputs supported:
 - CSV compatible with `visits_export_sample.csv` (--out-csv)
 - Aggregated JSON payload for POST /visits (--out-json)
 - Per-entry JSON lines for `visit_entries` (--out-entries)

Usage examples:
  python scripts\kakao_to_visits.py --input "KakaoTalk_...txt" --staff "임준호" --out-csv out.csv
  python scripts\kakao_to_visits.py -i chat.txt -s "송훈재" --out-json visits.json

Notes:
 - This is a best-effort parser. KakaoTalk export formats vary; if parsing is
   imperfect, paste a short excerpt here and I can fine-tune the heuristics.
 - If you drop the chat file into the workspace at the project root and ask me
   to run the script, I can run it for you.
"""

import re
import argparse
import csv
import json
from datetime import datetime
from pathlib import Path
import sys
import difflib
import urllib.request
import urllib.parse
import time

# Heuristic patterns for timestamps commonly seen in exports
ISO_RE = re.compile(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})")
YMD_HM_RE = re.compile(r"(\d{4}[\-./]\d{1,2}[\-./]\d{1,2})(?:[ T](\d{1,2}:\d{2}(?::\d{2})?))?")
# Common KakaoTalk Korean patterns sometimes like: 2025. 10. 28. 오후 1:23
KAKAO_RE = re.compile(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D+(오전|오후)?\s*(\d{1,2}:\d{2})?")

# Phone number extractor
PHONE_RE = re.compile(r"(01[016789][-\s]?\d{3,4}[-\s]?\d{4})")

# Simple subject keyword map to try to detect subject from free text
SUBJECT_KEYWORDS = ['정보', '진로', '수학', '영어', '국어', '과학', '사회', '도서', '단행본', '워크북']
# canonical meeting tags used in outputs; we normalize synonyms to these
MEETING_TAGS = ['명함', '재방문', '티칭샘소개', '구글클래스룸', '패들렛', '하이러닝', '비상', '워크북안내', '포스터', '연수안내', '브로슈어']

# mapping of synonyms found in text to canonical meeting tags
MEETING_NORMALIZE = {
    '티칭샘': '티칭샘소개',
    '티칭샘소개': '티칭샘소개',
    '연수': '연수안내',
    '연수안내': '연수안내',
    '브로셔': '브로슈어',
    '브로슈어': '브로슈어',
    '포스터': '포스터',
    '워크북': '워크북안내',
}

# Small alias map and normalizer for staff names found in bracketed tokens or sender fields.
# Ensures variants like '씨마스 조영환 부장' -> '조영환'
STAFF_ALIASES = {
    '씨마스 임준호': '임준호',
    '씨마스 임준호 차장': '임준호',
    '임준호차장': '임준호',
    '임준호': '임준호',
    '씨마스 조영환': '조영환',
    '씨마스 조영환 부장': '조영환',
    '조영환 부장': '조영환',
    '조영환': '조영환',
    '씨마스 송훈재': '송훈재',
    '씨마스 송훈재 부장': '송훈재',
    '송훈재 부장': '송훈재',
    '송훈재': '송훈재',
}

# small explicit alias map for common short school tokens -> canonical school name
# e.g. '숭덕여중' should canonicalize to '숭덕여자중학교' which appears in sales_staff.csv
SCHOOL_ALIASES = {
    # female/male disambiguation: be explicit
    '숭덕여중': '숭덕여자중학교',
    '숭덕여자중': '숭덕여자중학교',
    '숭덕여자중학교': '숭덕여자중학교',
    # '숭덕중' should map to the neutral '숭덕중학교'
    '숭덕중': '숭덕중학교',
    # do NOT map the ambiguous short token '숭덕' — leave it for fuzzy/NEIS resolution
}

# Simple in-memory NEIS lookup cache: short_token -> {name, code, atpt}
NEIS_CACHE = {}
_NEIS_CACHE_LOADED = False


def _neis_cache_path():
    root = Path(__file__).parent.parent
    return root / 'neis_cache.json'


def load_neis_cache():
    """Load NEIS cache from disk into NEIS_CACHE (no-op if already loaded)."""
    global NEIS_CACHE, _NEIS_CACHE_LOADED
    if _NEIS_CACHE_LOADED:
        return
    p = _neis_cache_path()
    # TTL for cache entries (seconds) - default 30 days
    TTL_SECONDS = 30 * 24 * 3600
    if p.exists():
        try:
            with p.open('r', encoding='utf8') as fh:
                raw = json.load(fh)
                now_ts = time.time()
                # raw should be mapping key -> info (may include cached_at)
                for k, v in (raw.items() if isinstance(raw, dict) else []):
                    try:
                        cached_at = float(v.get('cached_at', 0)) if isinstance(v, dict) else 0
                    except Exception:
                        cached_at = 0
                    if cached_at and (now_ts - cached_at) > TTL_SECONDS:
                        # expired - skip
                        continue
                    NEIS_CACHE[k] = v
        except Exception:
            # ignore corrupt cache
            NEIS_CACHE = {}
    _NEIS_CACHE_LOADED = True


def save_neis_cache():
    """Persist NEIS_CACHE to disk (best-effort)."""
    try:
        p = _neis_cache_path()
        # persist entire cache (best-effort)
        with p.open('w', encoding='utf8') as fh:
            json.dump(NEIS_CACHE, fh, ensure_ascii=False, indent=2)
    except Exception:
        # ignore save errors
        pass


def _find_neis_key():
    """Try to discover a NEIS API key from common project JS/HTML helper files.
    Falls back to environment variable NEIS_KEY if present.
    """
    import os, re
    if os.environ.get('NEIS_KEY'):
        return os.environ.get('NEIS_KEY')
    repo_root = Path(__file__).parent.parent
    candidates = [repo_root / 'tools' / 'script_4.js', repo_root / 'tools' / 'deploy_page.html', repo_root / 'input.html']
    key_re = re.compile(r"NEIS_KEY\s*=\s*['\"]([0-9a-zA-Z]+)['\"]")
    key_re2 = re.compile(r"KEY\s*=\s*['\"]([0-9a-zA-Z]+)['\"]")
    for p in candidates:
        try:
            s = p.read_text(encoding='utf8')
        except Exception:
            continue
        m = key_re.search(s)
        if m:
            return m.group(1)
        m = key_re2.search(s)
        if m:
            return m.group(1)
    return None


def neis_schoolinfo_lookup(school_name, atpt_code=''):
    """Query NEIS schoolInfo for a given SCHUL_NM. Returns dict with SCHUL_NM, SD_SCHUL_CODE, ATPT_OFCDC_SC_CODE or None.
    This is best-effort and caches results in NEIS_CACHE.
    """
    key = school_name.strip()
    if not key:
        return None
    # ensure disk cache loaded once per process
    try:
        load_neis_cache()
    except Exception:
        pass
    if key in NEIS_CACHE:
        return NEIS_CACHE[key]
    NEIS_KEY = _find_neis_key()
    if not NEIS_KEY:
        return None
    params = {
        'KEY': NEIS_KEY,
        'type': 'json',
        'pIndex': '1',
        'pSize': '10',
        'ATPT_OFCDC_SC_CODE': atpt_code,
        'SCHUL_NM': school_name,
    }
    url = 'https://open.neis.go.kr/hub/schoolInfo?' + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'cmass-neis-lookup/1.0'})
        with urllib.request.urlopen(req, timeout=10) as res:
            raw = res.read().decode('utf8', errors='ignore')
            try:
                j = json.loads(raw)
            except Exception:
                return None
            # NEIS usually returns schoolInfo -> [ {head}, {row: [...] } ]
            block = j.get('schoolInfo') or None
            rows = []
            if block:
                for part in block:
                    if isinstance(part, dict) and 'row' in part and isinstance(part['row'], list):
                        rows.extend(part['row'])
            if not rows:
                # sometimes different shapes
                for v in j.values():
                    if isinstance(v, list):
                        for part in v:
                            if isinstance(part, dict) and 'row' in part and isinstance(part['row'], list):
                                rows.extend(part['row'])
            if rows:
                found = rows[0]
                sch = found.get('SCHUL_NM') or found.get('SCHUL_NAME') or ''
                code = found.get('SD_SCHUL_CODE') or found.get('SCHOOL_CODE') or ''
                atpt = found.get('ATPT_OFCDC_SC_CODE') or found.get('ATPT_CODE') or atpt_code
                # build info object and also preserve raw NEIS response for downstream heuristics
                info = {
                    'name': sch,
                    'code': str(code) if code else '',
                    'atpt': atpt,
                    'raw': found.copy() if isinstance(found, dict) else {}
                }
                # try to normalize a couple of commonly useful fields
                info['atpt_name'] = found.get('ATPT_OFCDC_SC_NM') or found.get('ATPT_OFCDC_SC_NAME') or found.get('ATPT_OFCDC_SC_CODE') or atpt
                # location/address heuristics (NEIS field names vary); capture common keys if present
                info['location'] = found.get('LCTN_ADRES') or found.get('ORG_RDNMA') or found.get('ORG_RDNMA_DTL') or found.get('SCHUL_ADDR') or found.get('ADRES') or ''
                # Attach cache timestamp so TTL logic can evict stale entries later
                try:
                    info['cached_at'] = time.time()
                except Exception:
                    pass
                NEIS_CACHE[key] = info
                # also cache by official name so later lookups by canonical name return code
                if sch and sch not in NEIS_CACHE:
                    NEIS_CACHE[sch] = info
                # persist cache to disk (best-effort)
                try:
                    save_neis_cache()
                except Exception:
                    pass
                # be polite to remote API
                time.sleep(0.1)
                return info
    except Exception:
        return None
    return None


def normalize_staff_name(name):
    """Return a short staff name for several common verbose variants.
    - strips brackets/parentheses and common titles
    - checks explicit alias map
    - falls back to finding a known short name token inside the string
    """
    if not name:
        return ''
    s = name.strip()
    # remove surrounding brackets and parentheses
    s = re.sub(r"^[\[\(\s]+|[\]\)\s]+$", '', s)
    # remove extra punctuation
    s = s.replace('(', ' ').replace(')', ' ').replace('[', ' ').replace(']', ' ').strip()
    # collapse multiple spaces
    s = re.sub(r'\s+', ' ', s)
    # direct alias lookup (case-sensitive for Korean names is fine)
    if s in STAFF_ALIASES:
        return STAFF_ALIASES[s]

    # If any known short name appears inside the token, return it
    for short in ['임준호', '조영환', '송훈재']:
        if short in s:
            return short

    # As last resort return the cleaned token (may be full name)
    return s


# Pattern: e.g. "숭덕여중 (10:40~11:50)" or "숭덕여중 (10:40-11:50)"
SCHOOL_TIME_RE = re.compile(r"([가-힣A-Za-z0-9\.\s\-]+?)\s*\(\s*(\d{1,2}:\d{2})\s*[~\-–—]{1,2}\s*(\d{1,2}:\d{2})\s*\)")
# stricter list-style pattern: lines starting with list marker like '가. ' or '나. ' or another numbered/lettered bullet
# capture the bullet label (e.g. 가, 나, 다) as group(1) so we can preserve it in outputs
LIST_SCHOOL_TIME_RE = re.compile(
    r"(?:^|\n)\s*([가-힣A-Za-z0-9])\.\s*([가-힣A-Za-z0-9\.\s\-]+?)\s*\(\s*(\d{1,2}:\d{2})\s*[~\-–—]{1,2}\s*(\d{1,2}:\d{2})\s*\)\s*(?:\(?\s*(\d{1,3})분\s*\)?)",
    re.MULTILINE,
)
# Pattern: e.g. "정보 (김병길-교학사)" or "정보(김병길)" -> subject, teacher, optional publisher
SUBJECT_TEACHER_PUBLISHER_RE = re.compile(r"([가-힣A-Za-z0-9\s]+?)\s*\(\s*([가-힣A-Za-z\s]+?)(?:\s*-\s*([가-힣A-Za-z\s]+?))?\s*\)")


def normalize_publisher(pub_raw):
    """Normalize publisher token extracted from parenthesis patterns.
    Prefer the token after '-' or the last token after '.' or other separators.
    Examples:
      '김병길-교학사' -> '교학사'
      '권일영-이오북스' -> '이오북스'
      '비상' -> '비상'
    """
    if not pub_raw:
        return ''
    p = pub_raw.strip()
    # split on common separators and take the last non-empty token
    parts = [s.strip() for s in re.split(r'[-–—/\\.:]', p) if s.strip()]
    if parts:
        return parts[-1]
    return p


def time_str_to_minutes(tstr):
    """Convert 'HH:MM' to minutes since midnight. Returns int or None."""
    if not tstr:
        return None
    try:
        hh, mm = [int(x) for x in tstr.split(':')]
        return hh * 60 + mm
    except Exception:
        return None


def minutes_between(start_str, end_str):
    """Compute difference in minutes between two 'HH:MM' strings. If end < start, assume next day."""
    s = time_str_to_minutes(start_str)
    e = time_str_to_minutes(end_str)
    if s is None or e is None:
        return None
    diff = e - s
    if diff < 0:
        diff += 24 * 60
    return diff


def parse_kakao_lines(lines):
    """
    Parse lines into message dicts: {timestamp: datetime or None, sender: str or None, text: str}
    Heuristics:
      - If a line contains an ISO or YMD timestamp at start, treat as header for a new message
      - Otherwise, treat as continuation of previous message
    """
    msgs = []
    cur = None

    def start_message(ts, sender, text):
        nonlocal msgs
        msgs.append({'timestamp': ts, 'sender': sender, 'text': text.strip()})

    for raw in lines:
        line = raw.rstrip('\n')
        if not line.strip():
            # keep blank lines as paragraph separator inside message
            if cur:
                cur['text'] += '\n'
            continue

        # Try ISO first
        m = ISO_RE.search(line)
        if m:
            ts_str = m.group(1)
            try:
                ts = datetime.fromisoformat(ts_str)
            except Exception:
                ts = None
            # attempt to extract sender and message after timestamp
            after = line[m.end():].strip()
            # split first colon that likely separates sender
            if ':' in after:
                sender, text = after.split(':', 1)
                start_message(ts, sender.strip(), text.strip())
                cur = msgs[-1]
                continue
            else:
                # no sender found - treat entire remainder as text
                start_message(ts, None, after)
                cur = msgs[-1]
                continue

        # Try YMD_HM
        m2 = YMD_HM_RE.search(line)
        if m2:
            datepart = m2.group(1)
            timepart = m2.group(2) or ''
            ts = None
            try:
                if timepart:
                    ts = datetime.fromisoformat(datepart + 'T' + timepart)
                else:
                    ts = datetime.fromisoformat(datepart + 'T00:00:00')
            except Exception:
                ts = None
            after = line[m2.end():].strip()
            if ':' in after:
                sender, text = after.split(':', 1)
                start_message(ts, sender.strip(), text.strip())
                cur = msgs[-1]
                continue
            elif after:
                # Sometimes whatsapp-like: "2025-10-28, 홍길동: message"
                # try to find the first comma and colon
                colon_idx = after.find(':')
                if colon_idx != -1:
                    sender = after[:colon_idx].strip()
                    text = after[colon_idx+1:]
                    start_message(ts, sender, text.strip())
                    cur = msgs[-1]
                    continue
                else:
                    start_message(ts, None, after)
                    cur = msgs[-1]
                    continue

        # Try kakao style
        m3 = KAKAO_RE.search(line)
        if m3:
            # best-effort parse
            y, mo, d, ampm, timepart = m3.group(1), m3.group(2), m3.group(3), m3.group(4), m3.group(5)
            ts = None
            try:
                if timepart:
                    hhmm = timepart
                    # if 오후, add 12 hours except 12pm
                    hh, mm = [int(x) for x in hhmm.split(':')]
                    if ampm and '오후' in ampm and hh < 12:
                        hh += 12
                    ts = datetime(int(y), int(mo), int(d), hh, int(mm))
                else:
                    ts = datetime(int(y), int(mo), int(d), 0, 0)
            except Exception:
                ts = None
            after = line[m3.end():].strip()
            if ':' in after:
                sender, text = after.split(':', 1)
                start_message(ts, sender.strip(), text.strip())
                cur = msgs[-1]
                continue
            elif after:
                start_message(ts, None, after)
                cur = msgs[-1]
                continue

        # If we reach here, no timestamp detected. Append to previous message if any, else create orphan message
        if msgs:
            # append newline then the raw line
            msgs[-1]['text'] += '\n' + line
        else:
            # no previous messages - create a bare message
            start_message(None, None, line)
            cur = msgs[-1]

    return msgs


def detect_school(text, known_schools=None):
    # If a list of known schools is provided, try substring matching
    if not text: return ''
    if known_schools:
        for s in known_schools:
            if s and s in text:
                return s
    # fallback heuristics: look for words ending with '학교' or '중학교' or '고등학교'
    m = re.search(r"([가-힣A-Za-z0-9\s\-]+(초등학교|중학교|고등학교|학교))", text)
    if m:
        return m.group(1).strip()
    return ''


def load_known_schools():
    """Load school names from sales_staff.csv if present (returns list of school names)."""
    root = Path(__file__).parent.parent
    csvp = root / 'sales_staff.csv'
    schools = []
    if not csvp.exists():
        return schools
    # Best-effort CSV parsing: prefer DictReader if header exists, else scan cells for school-like tokens
    try:
        with csvp.open('r', encoding='utf-8') as fh:
            # Try DictReader first
            fh.seek(0)
            reader = csv.DictReader(fh)
            if reader.fieldnames and any('학교' in (h or '') for h in reader.fieldnames):
                for r in reader:
                    # try common header '학교명' or fallback to any cell that contains '학교' or '중'/'고' suffix
                    name = (r.get('학교명') or r.get('학교') or '')
                    if name:
                        name = name.strip()
                        if name:
                            schools.append(name)
            else:
                # fallback: no useful header — scan all cells for tokens that look like school names
                fh.seek(0)
                raw = fh.read()
                for row in csv.reader(raw.splitlines()):
                    for cell in row:
                        if cell and any(k in cell for k in ('학교','중학교','고등학교','초등학교','여중','여고')):
                            schools.append(cell.strip())
    except Exception:
        # if anything goes wrong, return what we've collected so far
        pass

    # Also augment known schools with NEIS school names found in local neis_*.json files
    try:
        for p in root.glob('neis_*.json'):
            try:
                data = json.load(open(p, 'r', encoding='utf8'))
            except Exception:
                continue
            # extract SCHUL_NM values if present
            def walk_for_key(o):
                if isinstance(o, dict):
                    for k, v in o.items():
                        if k == 'SCHUL_NM' and isinstance(v, str):
                            schools.append(v.strip())
                        else:
                            walk_for_key(v)
                elif isinstance(o, list):
                    for v in o:
                        walk_for_key(v)
            walk_for_key(data)
    except Exception:
        pass

    # Deduplicate while preserving order
    seen = set()
    out = []
    for s in schools:
        if not s: continue
        if s not in seen:
            out.append(s)
            seen.add(s)
    return out


def load_sales_staff_map():
    """Return a dict mapping canonical school name -> 담당자 (sales contact) from `sales_staff.csv`.
    This is used to recommend a canonical school name and find the assigned sales rep.
    """
    root = Path(__file__).parent.parent
    csvp = root / 'sales_staff.csv'
    mapping = {}
    if not csvp.exists():
        return mapping
    try:
        with csvp.open('r', encoding='utf-8') as fh:
            reader = csv.DictReader(fh)
            for r in reader:
                school = (r.get('학교명') or '').strip()
                staff = (r.get('담당자') or '').strip()
                if school:
                    mapping[school] = staff
    except Exception:
        return {}
    return mapping


def load_sales_staff_rows():
    """Return a list of rows (as dict) from `sales_staff.csv` for richer lookups.
    Each row includes keys from the CSV header such as '시도교육청','교육지원청','지역','정보공시학교코드','학교명','담당자'.
    """
    root = Path(__file__).parent.parent
    csvp = root / 'sales_staff.csv'
    rows = []
    if not csvp.exists():
        return rows
    try:
        with csvp.open('r', encoding='utf-8') as fh:
            reader = csv.DictReader(fh)
            for r in reader:
                rows.append({k: (v or '').strip() for k, v in r.items()})
    except Exception:
        return []
    return rows


def canonicalize_school(short_name, known_schools):
    """Try to map a parsed short school token to a canonical school name from known_schools.
    Heuristics: direct substring match, and some Korean suffix expansions (여중->여자중학교, 중->중학교, 고->고등학교).
    """
    if not short_name:
        return ''
    s = short_name.strip()
    # helper: detect school level to prefer same-level matches
    def _detect_level(name):
        if not name:
            return ''
        n = name
        if '초등' in n or '초' in n and '초등' not in n:
            return '초'
        if '중학교' in n or n.endswith('중') or '중' in n:
            return '중'
        if '고등' in n or n.endswith('고') or '고' in n:
            return '고'
        return ''
    src_level = _detect_level(s)
    # explicit alias shortcuts first
    key_norm = short_name.strip()
    if key_norm in SCHOOL_ALIASES:
        return SCHOOL_ALIASES[key_norm]

    # direct contains — prefer same school level matches when possible
    for ks in known_schools:
        if not ks:
            continue
        if src_level:
            # prefer candidates of same detected level
            try:
                if src_level == '초' and not ('초' in ks or '초등' in ks):
                    continue
                if src_level == '중' and not ('중' in ks or '중학교' in ks):
                    continue
                if src_level == '고' and not ('고' in ks or '고등' in ks):
                    continue
            except Exception:
                pass
        if s in ks or ks in s:
            return ks

    # try expanding common short forms
    candidates = [s]
    if s.endswith('여중'):
        candidates.append(s.replace('여중', '여자중학교'))
    if s.endswith('여고'):
        candidates.append(s.replace('여고', '여자고등학교'))
    if s.endswith('중') and not s.endswith('중학교'):
        candidates.append(s + '학교')
        candidates.append(s + '중학교')
    if s.endswith('고') and not s.endswith('고등학교'):
        candidates.append(s + '고등학교')
    if s.endswith('초') and not s.endswith('초등학교'):
        candidates.append(s + '초등학교')

    for c in candidates:
        for ks in known_schools:
            if not ks:
                continue
            if src_level:
                try:
                    if src_level == '초' and not ('초' in ks or '초등' in ks):
                        continue
                    if src_level == '중' and not ('중' in ks or '중학교' in ks):
                        continue
                    if src_level == '고' and not ('고' in ks or '고등' in ks):
                        continue
                except Exception:
                    pass
            if c and c in ks:
                return ks

    # fuzzy match fallback using difflib to handle short/abbreviated names
    try:
        # relax cutoff a bit to 0.65 to allow common abbreviations to match
        # For fuzzy matching, restrict choices to same school level when detected
        if src_level:
            choices = [ks for ks in known_schools if ks and ((src_level == '초' and ('초' in ks or '초등' in ks)) or (src_level == '중' and ('중' in ks or '중학교' in ks)) or (src_level == '고' and ('고' in ks or '고등' in ks)))]
            # fallback to all choices if none match level
            if not choices:
                choices = [ks for ks in known_schools if ks]
        else:
            choices = [ks for ks in known_schools if ks]
        matches = difflib.get_close_matches(s, choices, n=1, cutoff=0.65)
        if matches:
            return matches[0]
    except Exception:
        pass

    # As a last effort, query NEIS for an authoritative school name/code if we have a key
    try:
        info = neis_schoolinfo_lookup(s)
        if info and info.get('name'):
            # add NEIS-provided canonical name to known_schools for future matches
            try:
                if info['name'] not in known_schools:
                    known_schools.append(info['name'])
            except Exception:
                pass
            return info['name']
    except Exception:
        pass

    # fallback: return original token
    return short_name


def resolve_school(short_name, known_schools, context_text='', sales_rows=None, reporter_short=None):
    """Resolve a short parsed school token to the best canonical school name.
    Uses canonicalize_school but when multiple candidate schools could match,
    attempts to disambiguate using region hints found in context_text and
    the `sales_rows` dataset (which contains region columns).
    """
    # quick path: explicit canonicalization (keep as fallback but don't return yet so
    # reporter-priority or CSV/NEIS disambiguation can override)
    cand = canonicalize_school(short_name, known_schools)

    # Build candidate list: any known_school that contains or is contained by short_name
    s = (short_name or '').strip()
    candidates = []
    for ks in known_schools:
        if not ks:
            continue
        if s in ks or ks in s:
            candidates.append(ks)

    # If sales_rows provided, find direct CSV matches (school names containing short token)
    if sales_rows:
        csv_matches = []
        for r in sales_rows:
            nm = r.get('학교명') or ''
            if not nm:
                continue
            if s in nm or nm in s:
                csv_matches.append(nm)
        csv_unique = list(dict.fromkeys(csv_matches))
        if len(csv_unique) == 1:
            return csv_unique[0]
        # If multiple CSV matches, prefer the one whose 담당자 matches the reporter (reporter-priority)
        if reporter_short and len(csv_unique) > 1:
            for nm in csv_unique:
                for r in sales_rows:
                    if (r.get('학교명') or '') == nm and (r.get('담당자') or '') == reporter_short:
                        return nm

    # Try NEIS lookup early: if NEIS returns an authoritative canonical name that matches
    # one of the candidates or CSV rows, prefer that.
    try:
        info = neis_schoolinfo_lookup(s)
        if info and info.get('name'):
            info_name = info.get('name')
            # prefer NEIS-provided official name if it matches any candidate or CSV match
            if info_name in candidates:
                return info_name
            if sales_rows:
                for r in sales_rows:
                    if (r.get('학교명') or '') == info_name:
                        return info_name
    except Exception:
        pass

    # If we have sales_rows, try to match on region tokens
    if sales_rows and context_text and candidates:
        ctx = context_text
        # prepare a set of region tokens from sales_rows for candidates
        for cand_school in candidates:
            # find rows matching this school
            matched_rows = [r for r in sales_rows if r.get('학교명') == cand_school]
            for r in matched_rows:
                # check common region fields
                for region_key in ('지역', '교육지원청', '시도교육청'):
                    val = (r.get(region_key) or '')
                    if not val:
                        continue
                    if val in ctx:
                        return cand_school

    # as fallback, return the earlier canonical candidate if any
    if cand:
        return cand
    # else return original short_name
    return short_name


def clean_school_token(token):
    """Normalize/clean a parsed school-token before canonicalization.
    - remove common leading labels like '세부업무', leading bullet markers like '가.', '나.'
    - collapse whitespace and newlines
    - try to extract the inner substring that looks like a school (ends with 학교/중학교/초등학교/여중/여고/etc.)
    """
    if not token:
        return token
    t = token
    # remove common header words that sometimes get captured
    t = re.sub(r'^(세부업무\s*[:\-–—]*)', '', t)
    # remove any leading list bullet like '가. ' or '나.' at start
    t = re.sub(r'^[\s\n]*[가-힣A-Za-z0-9]\.\s*', '', t)
    # collapse newlines and multiple spaces
    t = re.sub(r'[\r\n]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()

    # try to find an inner school-like substring
    m = re.search(r'([가-힣A-Za-z0-9\s\-]+?(?:초등학교|중학교|고등학교|학교|여중|여고|여자중학교|여자고등학교))', t)
    if m:
        return m.group(1).strip()

    # if token contains '여중' or '여고' but not full '여자' form, return trimmed tail
    m2 = re.search(r'([\w\s\-]*\S*(?:여중|여고|여자중|여자고)\S*)', t)
    if m2:
        return m2.group(1).strip()

    # fallback - return the cleaned, collapsed token
    return t


def detect_subject(text):
    if not text: return ''
    for kw in SUBJECT_KEYWORDS:
        if kw in text:
            return kw
    return ''


def extract_meetings(text):
    if not text: return []
    found = []
    lowered = text
    # map synonyms to canonical tags first
    for syn, canon in MEETING_NORMALIZE.items():
        if syn in lowered and canon not in found:
            found.append(canon)
    # include any explicit canonical tags present
    for tag in MEETING_TAGS:
        if tag in lowered and tag not in found:
            found.append(tag)
    return found


def extract_contact(text):
    if not text: return ''
    m = PHONE_RE.search(text)
    if m:
        return m.group(1)
    return ''


def build_outputs(msgs, staff_name):
    # Group messages by date and by detected school (best-effort)
    visits_by_key = {}
    entries = []
    aggregated_visits = []

    # load known schools for canonicalization and sales assignment map
    known_schools = load_known_schools()
    sales_map = load_sales_staff_map()
    sales_rows = load_sales_staff_rows()

    # Keep track of the most recent reporter header seen in the stream of messages.
    # When a message contains list-style items starting at the top of the message
    # (e.g., "가. 학교명 (09:00~10:00) ..."), prefer the most recent header reporter
    # for attribution so that blocks under a header like
    # "[씨마스 조영환 부장] ..." get assigned to that reporter.
    current_block_reporter_short = None
    known_reporters = set()
    # Build known reporter short-names from sales_staff rows (담당자) and common staff values
    for r in sales_rows:
        name = (r.get('담당자') or r.get('assigned_sales') or '').strip()
        if name:
            known_reporters.add(name)
    # Also include any short 'staff' tokens already observed in entries
    for m in msgs:
        st = (m.get('sender') or '').strip()
        if st:
            known_reporters.add(st)

    for i, m in enumerate(msgs):
        ts = m.get('timestamp')
        if ts:
            date_str = ts.date().isoformat()
            created_at = ts.isoformat()
        else:
            date_str = (datetime.utcnow().date()).isoformat()
            created_at = datetime.utcnow().isoformat()
        text = m.get('text') or ''
        # Only process messages from allowed speakers. Messages sometimes include the
        # speaker bracketed at the start of the text rather than in the parsed sender
        # field. Accept messages if either parsed sender or a bracketed token in the
        # message text matches an allowed speaker. Also detect the actual reporter so
        # we can populate the 'staff' field with the real author rather than the CLI
        # importer's name.
        sender = (m.get('sender') or '')
        allowed_speakers = ['씨마스 송훈재', '씨마스 임준호', '씨마스 조영환']

        def _matches_allowed(s):
            return any(name in s for name in allowed_speakers)

        bracketed_matches = re.findall(r"\[([^\]]+)\]", text)
        if not (_matches_allowed(sender) or any(_matches_allowed(b) for b in bracketed_matches)):
            # skip messages from other participants
            continue

        # Determine reporter (the real staff who posted the message). Preference order:
        # 1) parsed sender if it contains an allowed speaker
        # 2) a bracketed token in the text that matches an allowed speaker
        # 3) partial-name match (e.g., '임준호 차장' -> '씨마스 임준호')
        # 4) fallback to the CLI-provided staff_name (this indicates the importer)
        reporter = None
        for name in allowed_speakers:
            if name in sender:
                reporter = name
                break
        if not reporter:
            for token in bracketed_matches:
                for name in allowed_speakers:
                    if name in token or token in name or name.split()[-1] in token:
                        reporter = name
                        break
                if reporter:
                    break
        if not reporter and sender:
            for name in allowed_speakers:
                if name.split()[-1] in sender:
                    reporter = name
                    break
        if not reporter:
            reporter = staff_name

        # normalize reporter to short staff name (e.g., '씨마스 조영환 부장' -> '조영환')
        reporter_short = normalize_staff_name(reporter)

        # If this message contains an explicit header reporter token (either in sender
        # or in bracketed tokens within the text), update the current block reporter
        # context so following messages (especially those that begin with list items)
        # can be attributed to that reporter.
        found_header_reporter = None
        # prefer bracketed tokens as explicit block headers
        for token in bracketed_matches:
            for name in allowed_speakers:
                if name in token or token in name or name.split()[-1] in token:
                    found_header_reporter = name
                    break
            if found_header_reporter:
                break
        # also accept parsed sender as header indicator
        if not found_header_reporter:
            for name in allowed_speakers:
                if name in sender:
                    found_header_reporter = name
                    break
        if found_header_reporter:
            current_block_reporter_short = normalize_staff_name(found_header_reporter)
        # Only include list-style items matching patterns like:
        # "가. 학교명 (HH:MM~HH:MM) (70분)" or "나. 학교명 (HH:MM~HH:MM) 70분"
        # Find all such matches within the message text. If none are found, skip this message.
        matches = list(LIST_SCHOOL_TIME_RE.finditer(text))
        if not matches:
            # No list-style school/time lines; skip adding an entry for this message
            continue

        # For messages containing multiple list items, create one entry per matched item
        # If the first matched list item starts near the beginning of the message,
        # prefer the current block reporter context (if any). This handles cases
        # where a header like "[씨마스 조영환 부장]" appears in a previous message
        # and the following message begins with the bullet list.
        first_match = matches[0]
        use_block_reporter = False
        try:
            if current_block_reporter_short and first_match.start() <= 5:
                use_block_reporter = True
        except Exception:
            use_block_reporter = False

        for match in matches:
            # match groups (with new regex): 1=bullet label, 2=school, 3=start, 4=end, 5=minutes
            bullet_label = match.group(1).strip()
            parsed_school = match.group(2).strip()
            # clean noisy tokens like leading headers or bullets so canonicalization can match
            parsed_school = clean_school_token(parsed_school)
            visit_start = match.group(3)
            visit_end = match.group(4)
            explicit_minutes = match.group(5) or ''
            # resolve_school uses context, sales_rows, and reporter to disambiguate
            school = resolve_school(parsed_school, known_schools, context_text=text, sales_rows=sales_rows, reporter_short=reporter_short) or parsed_school

            # determine school level marker: ONLY set if the parsed school explicitly contains '**중' or '**고'
            school_level = ''
            if '**중' in parsed_school or '**중' in (school or ''):
                school_level = '**중'
            elif '**고' in parsed_school or '**고' in (school or ''):
                school_level = '**고'

            # Try to extract subject + (teacher-publisher) from the nearby text (use whole message as context)
            subject = None
            teacher_from_text = ''
            publisher_from_text = ''
            # Prefer subject/teacher/publisher found in the bullet's nearby context
            # Extract per-bullet context: from this match start until next bullet (or message end)
            next_start = len(text)
            # find the next match start index if present
            # matches is the iterable of regex matches gathered earlier; find index of current match
            try:
                idx_in_matches = matches.index(match)
                if idx_in_matches is not None and idx_in_matches + 1 < len(matches):
                    next_start = matches[idx_in_matches + 1].start()
            except Exception:
                next_start = len(text)

            per_bullet_text = text[match.start(): next_start].strip()

            # Prefer to extract subject/teacher/publisher from the per-bullet text
            context_chunk = per_bullet_text
            # find all subject(teacher - publisher) occurrences within the bullet
            sp_iter = list(SUBJECT_TEACHER_PUBLISHER_RE.finditer(context_chunk))

            # Fallbacks (per-match context)
            if not school:
                school = detect_school(text, known_schools)

            meetings = extract_meetings(text)
            # treat 명함인사 or 명함 as meeting tag '명함'
            if '명함' in text or '명함인사' in text:
                if '명함' not in meetings:
                    meetings.append('명함')
            # if 워크북 mentioned, tag as 워크북안내
            if '워크북' in text and '워크북안내' not in meetings:
                meetings.append('워크북안내')
            # if 포스터 mentioned, tag as 포스터
            if '포스터' in text and '포스터' not in meetings:
                meetings.append('포스터')
            contact = extract_contact(per_bullet_text) or extract_contact(text)

            # compute duration minutes: prefer explicit minutes in parentheses, else compute from times
            duration_min = ''
            if explicit_minutes:
                try:
                    duration_min = int(explicit_minutes)
                except Exception:
                    duration_min = ''
            elif visit_start and visit_end:
                dm = minutes_between(visit_start, visit_end)
                duration_min = dm if dm is not None else ''

            # Choose effective reporter for this entry: prefer the message's reporter_short
            effective_reporter_short = reporter_short
            if use_block_reporter and current_block_reporter_short:
                effective_reporter_short = current_block_reporter_short

            # find assigned sales rep (if any) from sales_map for the canonicalized school
            assigned = sales_map.get(school, '') if school else ''
            if not assigned:
                assigned = effective_reporter_short

            # try to attach NEIS info if available
            neis_info = None
            try:
                if school and school in NEIS_CACHE:
                    neis_info = NEIS_CACHE.get(school)
                elif school:
                    neis_info = neis_schoolinfo_lookup(school)
            except Exception:
                neis_info = None

            # derive region/location from NEIS info when available
            region_val = ''
            location_val = ''
            try:
                if neis_info:
                    region_val = neis_info.get('atpt_name') or neis_info.get('atpt') or ''
                    raw = neis_info.get('raw') or {}
                    location_val = (neis_info.get('location') or raw.get('LCTN_ADRES') or raw.get('ORG_RDNMA') or raw.get('ORG_RDNMA_DTL') or raw.get('SCHUL_ADDR') or raw.get('ADRES') or '')
            except Exception:
                region_val = ''
                location_val = ''

            # If multiple subject/teacher pairs found within the bullet, create one record per pair
            if sp_iter:
                for spm in sp_iter:
                    subject = spm.group(1).strip()
                    teacher_from_text = (spm.group(2) or '').strip()
                    publisher_from_text = (spm.group(3) or '').strip()
                    # normalize publisher (prefer token after '-' or last part after common separators)
                    publisher_from_text = normalize_publisher(publisher_from_text)
                    # conversation snippet limited to the matched fragment for clarity
                    conv_snippet = spm.group(0).strip()

                    entry = {
                        'bullet': bullet_label,
                        'created_at': created_at,
                        'staff': effective_reporter_short,
                        'visit_date': date_str,
                        'school': school,
                        'neis_name': neis_info.get('name') if neis_info else '',
                        'neis_code': neis_info.get('code') if neis_info else '',
                        'schoolLevel': school_level,
                        'region': region_val,
                        'location': location_val,
                        'visitStart': visit_start or (ts.strftime('%H:%M') if ts else ''),
                        'visitEnd': visit_end or '',
                        'visitDurationMinutes': duration_min,
                        'subject': subject,
                        'teacher': teacher_from_text or (m.get('sender') or ''),
                        'publisher': publisher_from_text or '',
                        'assigned_sales': assigned,
                        'contact': contact,
                        'followUp': ','.join(meetings) if meetings else '',
                        'conversation': conv_snippet,
                        'meetings': ','.join(meetings) if meetings else ''
                    }
                    entries.append(entry)

                    # Aggregated grouping key: date + school
                    group_key = f"{date_str}||{school or subject}"
                    if group_key not in visits_by_key:
                        visits_by_key[group_key] = {
                            'visitDate': date_str,
                            'school': school,
                            'schoolLevel': school_level,
                            'region': '',
                            'visitStart': entry['visitStart'],
                            'visitEnd': entry['visitEnd'],
                            'visitDurationMinutes': entry.get('visitDurationMinutes', ''),
                            'subjects': []
                        }
                    subj_obj = {
                        'subject': subject,
                        'teacher': entry['teacher'],
                        'contact': contact,
                        'meetings': meetings,
                        'assigned_sales': assigned,
                        'conversation': conv_snippet,
                        'followUp': ''
                    }
                    visits_by_key[group_key]['subjects'].append(subj_obj)
            else:
                # fallback: single entry using heuristics similar to previous behavior
                subject = detect_subject(text) or '기타'
                teacher_from_text = ''
                publisher_from_text = ''
                publisher_from_text = normalize_publisher(publisher_from_text)
                entry = {
                    'bullet': bullet_label,
                    'created_at': created_at,
                    'staff': effective_reporter_short,
                    'visit_date': date_str,
                    'school': school,
                    'neis_name': neis_info.get('name') if neis_info else '',
                    'neis_code': neis_info.get('code') if neis_info else '',
                    'schoolLevel': school_level,
                    'region': '',
                    'location': '',
                    'visitStart': visit_start or (ts.strftime('%H:%M') if ts else ''),
                    'visitEnd': visit_end or '',
                    'visitDurationMinutes': duration_min,
                    'subject': subject,
                    'teacher': teacher_from_text or (m.get('sender') or ''),
                    'publisher': publisher_from_text or '',
                    'assigned_sales': assigned,
                    'contact': contact,
                    'followUp': ','.join(meetings) if meetings else '',
                    'conversation': per_bullet_text if per_bullet_text else text.strip(),
                    'meetings': ','.join(meetings) if meetings else ''
                }
                entries.append(entry)
                group_key = f"{date_str}||{school or subject}"
                if group_key not in visits_by_key:
                    visits_by_key[group_key] = {
                        'visitDate': date_str,
                        'school': school,
                        'schoolLevel': school_level,
                        'region': '',
                        'visitStart': entry['visitStart'],
                        'visitEnd': entry['visitEnd'],
                        'visitDurationMinutes': entry.get('visitDurationMinutes', ''),
                        'subjects': []
                    }
                subj_obj = {
                    'subject': subject,
                    'teacher': entry['teacher'],
                    'contact': contact,
                    'meetings': meetings,
                    'assigned_sales': assigned,
                    'conversation': per_bullet_text if per_bullet_text else text.strip(),
                    'followUp': ''
                }
                visits_by_key[group_key]['subjects'].append(subj_obj)

    # Convert visits_by_key to aggregated visits array
    for k, v in visits_by_key.items():
        # The app expects visits: array where each visit can have .subjects
        aggregated_visits.append({
            'visitDate': v['visitDate'],
            'school': v['school'],
            'schoolLevel': v.get('schoolLevel',''),
            'region': v['region'],
            'visitStart': v['visitStart'],
            'visitEnd': v['visitEnd'],
            'visitDurationMinutes': v.get('visitDurationMinutes', ''),
            'subjects': v['subjects']
        })

    return entries, aggregated_visits


def write_csv(entries, out_path):
    # write headers similar to visits_export_sample.csv, include visitDurationMinutes
    # include 'bullet' so the CSV explicitly lists the list-style label (가, 나, 다 ...)
    headers = ['record_id','bullet','created_at','staff','visit_date','school','schoolLevel','region','location','visitStart','visitEnd','visitDurationMinutes','subject','teacher','publisher','contact','followUp','conversation','meetings']
    p = Path(out_path)
    with p.open('w', newline='', encoding='utf-8-sig') as fh:
        w = csv.DictWriter(fh, fieldnames=headers)
        w.writeheader()
        for e in entries:
            row = {h: e.get(h, '') for h in headers}
            # Keep record_id blank for migration (DB will assign on import)
            row['record_id'] = ''
            w.writerow(row)
    print(f'Wrote CSV to {out_path} ({len(entries)} records)')


def write_json_aggregated(visits, out_path):
    payload = { 'staff': '', 'visits': visits }
    with open(out_path, 'w', encoding='utf-8') as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    print(f'Wrote aggregated JSON to {out_path} (visits: {len(visits)})')


def write_entries_jsonlines(entries, out_path):
    with open(out_path, 'w', encoding='utf-8') as fh:
        for e in entries:
            fh.write(json.dumps(e, ensure_ascii=False) + '\n')
    print(f'Wrote per-entry JSON lines to {out_path} ({len(entries)} lines)')


def post_process_entries(entries):
    """Canonicalize school names to sales_staff.csv, enrich NEIS fields when missing,
    and update assigned_sales where a canonical mapping exists.
    Returns a new list of updated entries.
    """
    if not entries:
        return entries
    known_schools = load_known_schools()
    sales_map = load_sales_staff_map()
    sales_rows = load_sales_staff_rows()

    # Explicit per-original overrides: if an original token exactly matches a key here,
    # use the provided canonical value (typically the original) and skip fuzzy/NEIS remapping.
    # Add more entries as needed when the ambiguous mappings CSV is reviewed.
    OVERRIDE_CANONICAL = {
        '성남동중학교': '성남동중학교',
        '서울삼광초등학교': '서울삼광초등학교',
        '신광초등학교': '신광초등학교'
    }

    out = []
    for e in entries:
        school_raw = (e.get('school') or '').strip()
        # Attempt to resolve to canonical name using resolve_school
        try:
            if school_raw in OVERRIDE_CANONICAL:
                canonical = OVERRIDE_CANONICAL[school_raw]
            else:
                canonical = resolve_school(school_raw, list(known_schools), context_text=e.get('conversation','') or e.get('meetings',''), sales_rows=sales_rows, reporter_short=e.get('staff',''))
        except Exception:
            canonical = school_raw
        if canonical and canonical != school_raw:
            e['school'] = canonical
        # Update assigned_sales if sales_map has entry for canonical name.
        # But if the entry already has a reporter/staff that matches a known reporter,
        # prefer that reporter as the assigned_sales (do not overwrite).
        reporter = (e.get('staff') or '').strip()
        # build known_reporters set from sales_rows and present 'staff' tokens
        known_reporters = set()
        for r in sales_rows:
            name = (r.get('담당자') or r.get('assigned_sales') or '').strip()
            if name:
                known_reporters.add(name)
        # include staff tokens from entries (small set) to be permissive
        # Note: entries list may be large; to be safe we only include current entry's staff
        if reporter:
            known_reporters.add(reporter)

        if e.get('school') and e['school'] in sales_map:
            # If reporter is a known reporter (on-site), keep reporter as assigned_sales
            if reporter and reporter in known_reporters:
                e['assigned_sales'] = reporter
            else:
                e['assigned_sales'] = sales_map.get(e['school'], e.get('assigned_sales', ''))

        # If NEIS fields are missing, try a NEIS lookup on the canonical name
        try:
            if (not e.get('neis_name')) and e.get('school'):
                info = neis_schoolinfo_lookup(e['school'])
                if info:
                    e['neis_name'] = info.get('name','') or e.get('neis_name','')
                    e['neis_code'] = info.get('code','') or e.get('neis_code','')
                    e['region'] = info.get('atpt_name') or info.get('atpt') or e.get('region','')
                    e['location'] = info.get('location') or e.get('location','')
        except Exception:
            pass

        # final cleanup: trim whitespace
        for k, v in list(e.items()):
            if isinstance(v, str):
                e[k] = v.strip()

        out.append(e)
    return out


def aggregate_visits_from_entries(entries):
    """Rebuild aggregated visits (same shape as build_outputs returns) from per-entry list.
    Groups by visit_date + school and collects subjects per visit.
    """
    visits_by_key = {}
    for e in entries:
        date = e.get('visit_date','')
        school = e.get('school','')
        key = f"{date}||{school}"
        subj = {
            'subject': e.get('subject',''),
            'teacher': e.get('teacher',''),
            'contact': e.get('contact',''),
            'meetings': e.get('meetings','').split(',') if e.get('meetings') else [],
            'assigned_sales': e.get('assigned_sales',''),
            'conversation': e.get('conversation',''),
            'followUp': e.get('followUp','')
        }
        if key not in visits_by_key:
            visits_by_key[key] = {
                'visitDate': date,
                'school': school,
                'schoolLevel': e.get('schoolLevel',''),
                'region': e.get('region',''),
                'visitStart': e.get('visitStart',''),
                'visitEnd': e.get('visitEnd',''),
                'visitDurationMinutes': e.get('visitDurationMinutes',''),
                'subjects': [subj]
            }
        else:
            visits_by_key[key]['subjects'].append(subj)

    aggregated = []
    for k, v in visits_by_key.items():
        aggregated.append({
            'visitDate': v['visitDate'],
            'school': v['school'],
            'schoolLevel': v.get('schoolLevel',''),
            'region': v.get('region',''),
            'visitStart': v.get('visitStart',''),
            'visitEnd': v.get('visitEnd',''),
            'visitDurationMinutes': v.get('visitDurationMinutes',''),
            'subjects': v['subjects']
        })
    return aggregated


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('-i','--input', required=True, help='KakaoTalk exported text file')
    parser.add_argument('-s','--staff', default='', help='Staff name to set on migrated records')
    parser.add_argument('--out-csv', help='Output CSV path')
    parser.add_argument('--out-json', help='Output aggregated JSON path (POST /visits payload)')
    parser.add_argument('--out-entries', help='Output per-entry JSON lines path')
    args = parser.parse_args()

    p = Path(args.input)
    if not p.exists():
        print('Input file not found:', args.input, file=sys.stderr)
        sys.exit(2)

    with p.open('r', encoding='utf-8', errors='replace') as fh:
        lines = fh.readlines()

    msgs = parse_kakao_lines(lines)
    print(f'Parsed {len(msgs)} messages from {args.input}')

    entries, aggregated_visits = build_outputs(msgs, args.staff)

    # Post-process entries: canonicalize school names and enrich NEIS fields when missing
    entries = post_process_entries(entries)
    # Re-aggregate visits from canonicalized entries so aggregated payload uses canonical names
    aggregated_visits = aggregate_visits_from_entries(entries)

    if args.out_csv:
        write_csv(entries, args.out_csv)
    if args.out_json:
        # set staff at top-level
        payload = { 'staff': args.staff or '', 'visits': aggregated_visits }
        with open(args.out_json, 'w', encoding='utf-8') as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
        print(f'Wrote aggregated JSON to {args.out_json} (visits: {len(aggregated_visits)})')
    if args.out_entries:
        write_entries_jsonlines(entries, args.out_entries)

    # If no outputs specified, print a short preview to stdout
    if not (args.out_csv or args.out_json or args.out_entries):
        print('\n--- Preview entries (first 5) ---')
        for e in entries[:5]:
            print(json.dumps(e, ensure_ascii=False, indent=2))
        print('\n--- Preview aggregated visits (first 5) ---')
        for v in aggregated_visits[:5]:
            print(json.dumps(v, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
