import os
import json
import re
from datetime import datetime
from flask import Flask, jsonify, request, render_template, send_file
from flask import Response
import io
import csv
from dateutil import parser as date_parser

# Optional Firebase Admin (Firestore) integration
USE_FIRESTORE = False
db = None
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    # Two ways to provide credentials:
    # 1) Path to JSON service account file via FIREBASE_SERVICE_ACCOUNT env var
    # 2) JSON content via FIREBASE_CREDENTIALS_JSON env var
    sa_path = os.environ.get('FIREBASE_SERVICE_ACCOUNT')
    sa_json = os.environ.get('FIREBASE_CREDENTIALS_JSON')
    cred = None
    if sa_path and os.path.exists(sa_path):
        cred = credentials.Certificate(sa_path)
    elif sa_json:
        cred_dict = json.loads(sa_json)
        cred = credentials.Certificate(cred_dict)

    if cred is not None:
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        USE_FIRESTORE = True
        print('Firestore enabled for backend')
    else:
        print('Firestore not configured - running with in-memory storage')
except Exception as e:
    # If firebase_admin isn't installed or initialization fails, continue with in-memory storage
    print('Firestore integration not available:', str(e))

app = Flask(__name__)

# CORS support: restrict allowed origins to a configurable list (comma-separated env var ALLOWED_ORIGINS)
@app.after_request
def add_cors_headers(response: Response):
    # Default allowed origins: Firebase Hosting for this project + localhost for local testing
    default_allowed = 'https://cmass-sales.web.app,http://localhost:8000'
    allowed_env = os.environ.get('ALLOWED_ORIGINS', default_allowed)
    allowed = [o.strip() for o in allowed_env.split(',') if o.strip()]
    origin = request.headers.get('Origin')
    if origin and origin in allowed:
        response.headers['Access-Control-Allow-Origin'] = origin
        # allow credentialed requests if desired in the future
        # response.headers['Access-Control-Allow-Credentials'] = 'true'
    # always allow these headers/methods for preflight
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    return response

# 임시 데이터 저장소 (메모리 기반)
sales_logs = []

# Helper to normalize timestamps for in-memory storage
def now_iso():
    return datetime.utcnow().isoformat() + 'Z'

@app.route('/')
def home():
    return 'CMASS SalesLog Backend Running!'

# 영업일지 전체 조회
@app.route('/sales', methods=['GET'])
def get_sales():
    if USE_FIRESTORE and db is not None:
        docs = db.collection('sales_logs').order_by('created_at', direction=firestore.Query.DESCENDING).stream()
        results = []
        for d in docs:
            obj = d.to_dict()
            obj['id'] = d.id
            results.append(obj)
        return jsonify(results)
    return jsonify(sales_logs)


# Compatibility endpoints for older frontend paths (/api/visits)
@app.route('/api/visits', methods=['GET'])
def api_get_visits():
    # reuse existing /sales implementation
    return get_sales()


@app.route('/api/visits', methods=['POST'])
def api_add_visit():
    # reuse existing /sales POST implementation
    return add_sales()

# 영업일지 추가
@app.route('/sales', methods=['POST'])
def add_sales():
    data = request.get_json() or {}
    # Normalize payload and visits
    visits = data.get('visits') if isinstance(data, dict) else None

    # If visits is provided and non-empty, require visitStart and visitEnd for each item
    missing = []
    if isinstance(visits, list) and len(visits):
        for idx, v in enumerate(visits):
            try:
                vs = v.get('visitStart') if isinstance(v, dict) else None
                ve = v.get('visitEnd') if isinstance(v, dict) else None
            except Exception:
                vs = ve = None
            if not vs or not ve:
                missing.append({'index': idx, 'visitDate': (v.get('visitDate') if isinstance(v, dict) else None), 'school': (v.get('school') if isinstance(v, dict) else None)})
    if missing:
        return jsonify({'ok': False, 'error': 'missing_visit_times', 'missing': missing, 'msg': 'Each visit must include visitStart and visitEnd'}), 400

    # Determine staff and representative date (rep_date) to enforce one saved doc per staff/day
    staff = ''
    try:
        if isinstance(data, dict) and data.get('staff'):
            staff = str(data.get('staff'))
        elif isinstance(data, dict) and data.get('payload') and isinstance(data.get('payload'), dict) and data.get('payload').get('staff'):
            staff = str(data.get('payload').get('staff'))
    except Exception:
        staff = ''

    # prefer explicit repDate; otherwise derive from first visit's visitDate (yyyy-mm-dd)
    rep_date = None
    if isinstance(data, dict) and data.get('repDate'):
        rep_date = str(data.get('repDate'))
    elif isinstance(visits, list) and len(visits) and isinstance(visits[0], dict) and visits[0].get('visitDate'):
        try:
            rep_date = str(visits[0].get('visitDate'))[:10]
        except Exception:
            rep_date = None
    # fallback to today's date (UTC)
    if not rep_date:
        rep_date = now_iso()[:10]

    # Build the sales_log object to persist
    sales_log = {
        'payload': data,
        'created_at': now_iso(),
        'staff_key': staff,
        'rep_date': rep_date
    }

    # If visits is explicitly an empty list, treat as delete for that staff+date (idempotent)
    is_delete = isinstance(visits, list) and len(visits) == 0

    # Firestore-backed path: use deterministic document id per staff+date to ensure one doc per day
    if USE_FIRESTORE and db is not None:
        from urllib.parse import quote_plus
        safe_staff = quote_plus(staff or '');
        doc_id = f"daily|{safe_staff}|{rep_date}"
        coll = db.collection('sales_logs')
        if is_delete:
            # delete the document if exists
            try:
                doc_ref = coll.document(doc_id)
                doc_ref.delete()
                return jsonify({'ok': True, 'id': doc_id, 'deleted': True}), 200
            except Exception as e:
                return jsonify({'ok': False, 'msg': 'delete failed', 'error': str(e)}), 500
        else:
            try:
                # overwrite (set) the document so only the latest save remains for the staff/date
                coll.document(doc_id).set(sales_log)
                out = sales_log.copy()
                out['id'] = doc_id
                return jsonify(out), 200
            except Exception as e:
                return jsonify({'ok': False, 'msg': 'save failed', 'error': str(e)}), 500

    # In-memory fallback: find existing entry for staff+rep_date and replace/delete as appropriate
    found_idx = None
    for i, r in enumerate(sales_logs):
        try:
            payload = r.get('payload', {}) if isinstance(r, dict) else {}
            # check staff and rep_date match
            r_staff = r.get('staff_key') or (payload.get('staff') if isinstance(payload, dict) else None)
            r_date = r.get('rep_date') or (r.get('created_at')[:10] if r.get('created_at') else None)
            if (r_staff == staff) and (r_date == rep_date):
                found_idx = i
                break
        except Exception:
            continue

    if is_delete:
        if found_idx is not None:
            sales_logs.pop(found_idx)
            return jsonify({'ok': True, 'deleted': True}), 200
        else:
            return jsonify({'ok': True, 'deleted': False, 'msg': 'no existing doc'}), 200

    # upsert: replace existing or append new
    if found_idx is not None:
        sales_log['id'] = sales_logs[found_idx].get('id')
        sales_logs[found_idx] = sales_log
        return jsonify(sales_log), 200
    else:
        sales_log['id'] = len(sales_logs) + 1
        sales_logs.append(sales_log)
        return jsonify(sales_log), 201


@app.route('/api/stats', methods=['GET'])
def api_stats():
    # produce simple aggregations from in-memory or Firestore
    # Support query filters: from, to (ISO dates), manager, region
    q_from = request.args.get('from')
    q_to = request.args.get('to')
    q_manager = request.args.get('manager')
    q_region = request.args.get('region')

    def parse_dt(s):
        try:
            return date_parser.isoparse(s)
        except Exception:
            return None

    dt_from = parse_dt(q_from) if q_from else None
    dt_to = parse_dt(q_to) if q_to else None
    # normalize to date for comparisons (handles date-only or timezone-aware datetimes)
    dt_from_date = dt_from.date() if dt_from else None
    dt_to_date = dt_to.date() if dt_to else None

    results = {
        'total': 0,
        'by_manager': {},
        'by_region': {},
        'by_date': {}
    }

    # load rows
    if USE_FIRESTORE and db is not None:
        docs = db.collection('sales_logs').stream()
        rows = []
        for d in docs:
            obj = d.to_dict()
            obj['id'] = d.id
            rows.append(obj)
    else:
        rows = sales_logs

    for r in rows:
        payload = r.get('payload', {}) if isinstance(r, dict) else {}
        created_s = r.get('created_at') or payload.get('visitDate')
        created_dt = None
        if created_s:
            try:
                created_dt = date_parser.isoparse(created_s)
            except Exception:
                # fallback: try first 10 chars as date
                try:
                    created_dt = date_parser.isoparse((created_s[:10]))
                except Exception:
                    created_dt = None

        # apply filters: compare by date to avoid tz-aware vs naive issues
        created_date = created_dt.date() if created_dt else None
        if dt_from_date and created_date and created_date < dt_from_date:
            continue
        if dt_to_date and created_date and created_date > dt_to_date:
            continue
        manager = (payload.get('manager') or payload.get('user') or 'Unknown')
        region = payload.get('region') or payload.get('office_of_education') or 'Unknown'
        if q_manager and manager != q_manager:
            continue
        if q_region and region != q_region:
            continue

        results['total'] += 1
        date_key = (created_dt.isoformat()[:10] if created_dt else (created_s[:10] if created_s else now_iso()[:10]))
        results['by_manager'][manager] = results['by_manager'].get(manager, 0) + 1
        results['by_region'][region] = results['by_region'].get(region, 0) + 1
        results['by_date'][date_key] = results['by_date'].get(date_key, 0) + 1

    return jsonify(results)


@app.route('/api/kpis', methods=['GET'])
def api_kpis():
    """Compute key performance indicators (KPIs) from stored sales logs.
    Supported query params: from, to (ISO dates), manager, region
    KPIs returned:
      - total_visits
      - visits_by_date
      - visits_by_manager
      - visits_by_region
      - contacts_total
      - contacts_by_date
      - chat_invites_total
      - chat_invites_by_date
    """
    q_from = request.args.get('from')
    q_to = request.args.get('to')
    q_manager = request.args.get('manager')
    q_region = request.args.get('region')

    def parse_dt(s):
        try:
            return date_parser.isoparse(s)
        except Exception:
            return None

    dt_from = parse_dt(q_from) if q_from else None
    dt_to = parse_dt(q_to) if q_to else None
    dt_from_date = dt_from.date() if dt_from else None
    dt_to_date = dt_to.date() if dt_to else None

    kpis = {
        'total_visits': 0,
        'visits_by_date': {},
        'visits_by_manager': {},
        'visits_by_region': {},
        'contacts_total': 0,
        'contacts_by_date': {},
        'chat_invites_total': 0,
        'chat_invites_by_date': {}
    }

    # load rows
    if USE_FIRESTORE and db is not None:
        docs = db.collection('sales_logs').stream()
        rows = []
        for d in docs:
            obj = d.to_dict()
            obj['id'] = d.id
            rows.append(obj)
    else:
        rows = sales_logs

    for r in rows:
        payload = r.get('payload', {}) if isinstance(r, dict) else {}
        created_s = r.get('created_at') or payload.get('visitDate')
        created_dt = None
        if created_s:
            try:
                created_dt = date_parser.isoparse(created_s)
            except Exception:
                try:
                    created_dt = date_parser.isoparse(created_s[:10])
                except Exception:
                    created_dt = None

        created_date = created_dt.date() if created_dt else None
        if dt_from_date and created_date and created_date < dt_from_date:
            continue
        if dt_to_date and created_date and created_date > dt_to_date:
            continue

        manager = (payload.get('manager') or payload.get('user') or 'Unknown')
        region = payload.get('region') or payload.get('office_of_education') or 'Unknown'
        if q_manager and manager != q_manager:
            continue
        if q_region and region != q_region:
            continue

        # determine date key (YYYY-MM-DD)
        date_key = (created_dt.isoformat()[:10] if created_dt else (created_s[:10] if created_s else now_iso()[:10]))

        # increment visit counts
        kpis['total_visits'] += 1
        kpis['visits_by_date'][date_key] = kpis['visits_by_date'].get(date_key, 0) + 1
        kpis['visits_by_manager'][manager] = kpis['visits_by_manager'].get(manager, 0) + 1
        kpis['visits_by_region'][region] = kpis['visits_by_region'].get(region, 0) + 1

        # contacts: count subjects with non-empty contact
        subjects = payload.get('subjects') if isinstance(payload.get('subjects'), list) else []
        for s in subjects:
            contact = (s.get('contact') or '').strip() if isinstance(s, dict) else ''
            if contact:
                kpis['contacts_total'] += 1
                kpis['contacts_by_date'][date_key] = kpis['contacts_by_date'].get(date_key, 0) + 1

            # meetings: look for chat invite indicators (text containing '채팅')
            meetings = s.get('meetings') if isinstance(s.get('meetings'), list) else []
            for m in meetings:
                try:
                    if isinstance(m, str) and '채팅' in m:
                        kpis['chat_invites_total'] += 1
                        kpis['chat_invites_by_date'][date_key] = kpis['chat_invites_by_date'].get(date_key, 0) + 1
                except Exception:
                    continue

    return jsonify(kpis)


@app.route('/api/weekly-report', methods=['GET'])
def api_weekly_report():
    """Generate a weekly report covering a 7-day window.
    Query params:
      - from: ISO date (inclusive) start of window
      - to: ISO date (inclusive) end of window
    If not provided, defaults to last 7 days ending today (UTC).
    Response includes totals and daily breakdowns suitable for reporting.
    """
    q_from = request.args.get('from')
    q_to = request.args.get('to')

    def parse_dt(s):
        try:
            return date_parser.isoparse(s)
        except Exception:
            return None

    if q_from and q_to:
        dt_from = parse_dt(q_from)
        dt_to = parse_dt(q_to)
    else:
        # default: last 7 days ending today (UTC)
        today = datetime.utcnow().date()
        dt_to = datetime.combine(today, datetime.min.time())
        dt_from = datetime.combine(today, datetime.min.time())
        from datetime import timedelta
        dt_from = dt_to - timedelta(days=6)

    # normalize dates
    start_date = dt_from.date() if dt_from else None
    end_date = dt_to.date() if dt_to else None

    # reuse KPI logic but scoped to the date window
    total_visits = 0
    contacts_total = 0
    chat_invites_total = 0
    visits_by_date = {}
    contacts_by_date = {}
    chat_by_date = {}
    by_manager = {}
    by_region = {}

    if USE_FIRESTORE and db is not None:
        docs = db.collection('sales_logs').stream()
        rows = []
        for d in docs:
            obj = d.to_dict()
            obj['id'] = d.id
            rows.append(obj)
    else:
        rows = sales_logs

    for r in rows:
        payload = r.get('payload', {}) if isinstance(r, dict) else {}
        created_s = r.get('created_at') or payload.get('visitDate')
        created_dt = None
        if created_s:
            try:
                created_dt = date_parser.isoparse(created_s)
            except Exception:
                try:
                    created_dt = date_parser.isoparse(created_s[:10])
                except Exception:
                    created_dt = None

        if not created_dt:
            continue
        created_date = created_dt.date()
        if start_date and created_date < start_date:
            continue
        if end_date and created_date > end_date:
            continue

        date_key = created_date.isoformat()
        total_visits += 1
        visits_by_date[date_key] = visits_by_date.get(date_key, 0) + 1

        manager = (payload.get('manager') or payload.get('user') or 'Unknown')
        region = payload.get('region') or payload.get('office_of_education') or 'Unknown'
        by_manager[manager] = by_manager.get(manager, 0) + 1
        by_region[region] = by_region.get(region, 0) + 1

        subjects = payload.get('subjects') if isinstance(payload.get('subjects'), list) else []
        for s in subjects:
            contact = (s.get('contact') or '').strip() if isinstance(s, dict) else ''
            if contact:
                contacts_total += 1
                contacts_by_date[date_key] = contacts_by_date.get(date_key, 0) + 1
            meetings = s.get('meetings') if isinstance(s.get('meetings'), list) else []
            for m in meetings:
                try:
                    if isinstance(m, str) and '채팅' in m:
                        chat_invites_total += 1
                        chat_by_date[date_key] = chat_by_date.get(date_key, 0) + 1
                except Exception:
                    continue

    report = {
        'period': {
            'from': start_date.isoformat() if start_date else None,
            'to': end_date.isoformat() if end_date else None
        },
        'totals': {
            'visits': total_visits,
            'contacts': contacts_total,
            'chat_invites': chat_invites_total
        },
        'by_date': {
            'visits': visits_by_date,
            'contacts': contacts_by_date,
            'chat_invites': chat_by_date
        },
        'by_manager': by_manager,
        'by_region': by_region
    }

    return jsonify(report)


@app.route('/sales/export.csv', methods=['GET'])
def export_csv():
    # stream CSV of stored logs with optional filters (same as /api/stats)
    q_from = request.args.get('from')
    q_to = request.args.get('to')
    q_manager = request.args.get('manager')
    q_region = request.args.get('region')

    def parse_dt(s):
        try:
            return date_parser.isoparse(s)
        except Exception:
            return None

    dt_from = parse_dt(q_from) if q_from else None
    dt_to = parse_dt(q_to) if q_to else None
    dt_from_date = dt_from.date() if dt_from else None
    dt_to_date = dt_to.date() if dt_to else None

    # collect rows
    if USE_FIRESTORE and db is not None:
        docs = db.collection('sales_logs').stream()
        rows = []
        for d in docs:
            obj = d.to_dict()
            obj['id'] = d.id
            rows.append(obj)
    else:
        rows = list(sales_logs)

    # determine payload keys across filtered rows
    keys = set()
    filtered = []
    for r in rows:
        payload = r.get('payload', {}) if isinstance(r, dict) else {}
        created_s = r.get('created_at') or payload.get('visitDate')
        created_dt = None
        if created_s:
            try:
                created_dt = date_parser.isoparse(created_s)
            except Exception:
                try:
                    created_dt = date_parser.isoparse(created_s[:10])
                except Exception:
                    created_dt = None

        created_date = created_dt.date() if created_dt else None
        if dt_from_date and created_date and created_date < dt_from_date:
            continue
        if dt_to_date and created_date and created_date > dt_to_date:
            continue
        manager = (payload.get('manager') or payload.get('user') or 'Unknown')
        region = payload.get('region') or payload.get('office_of_education') or 'Unknown'
        if q_manager and manager != q_manager:
            continue
        if q_region and region != q_region:
            continue

        filtered.append(r)
        for k in payload.keys():
            keys.add(k)

    keys = sorted(list(keys))
    output = io.StringIO()
    writer = csv.writer(output)
    header = ['id', 'created_at'] + keys
    writer.writerow(header)
    for r in filtered:
        p = r.get('payload', {}) if isinstance(r, dict) else {}
        row = [r.get('id'), r.get('created_at')]
        for k in keys:
            row.append(p.get(k, ''))
        writer.writerow(row)
    output.seek(0)
    return send_file(io.BytesIO(output.getvalue().encode('utf-8')), mimetype='text/csv', as_attachment=True, download_name='sales_export.csv')


@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

# 영업일지 단일 조회
@app.route('/sales/<int:sales_id>', methods=['GET'])
def get_sales_log(sales_id):
    if USE_FIRESTORE and db is not None:
        doc = db.collection('sales_logs').document(str(sales_id)).get()
        if doc.exists:
            obj = doc.to_dict()
            obj['id'] = doc.id
            return jsonify(obj)
        return jsonify({'error': 'Not found'}), 404
    for log in sales_logs:
        if log['id'] == sales_id:
            return jsonify(log)
    return jsonify({'error': 'Not found'}), 404

# 영업일지 수정
@app.route('/sales/<int:sales_id>', methods=['PUT'])
def update_sales_log(sales_id):
    data = request.get_json()
    if USE_FIRESTORE and db is not None:
        doc_ref = db.collection('sales_logs').document(str(sales_id))
        doc = doc_ref.get()
        if doc.exists:
            update_fields = {}
            for k in ['office_of_education','region','manager','student_count']:
                if k in data:
                    update_fields[k] = data[k]
            if update_fields:
                doc_ref.update(update_fields)
            obj = doc_ref.get().to_dict()
            obj['id'] = doc_ref.id
            return jsonify(obj)
        return jsonify({'error': 'Not found'}), 404
    for log in sales_logs:
        if log['id'] == sales_id:
            log['office_of_education'] = data.get('office_of_education', log['office_of_education'])
            log['region'] = data.get('region', log['region'])
            log['manager'] = data.get('manager', log['manager'])
            log['student_count'] = data.get('student_count', log['student_count'])
            return jsonify(log)
    return jsonify({'error': 'Not found'}), 404

# 영업일지 삭제
@app.route('/sales/<int:sales_id>', methods=['DELETE'])
def delete_sales_log(sales_id):
    global sales_logs
    if USE_FIRESTORE and db is not None:
        doc_ref = db.collection('sales_logs').document(str(sales_id))
        doc_ref.delete()
        return jsonify({'result': 'Deleted'})
    sales_logs = [log for log in sales_logs if log['id'] != sales_id]
    return jsonify({'result': 'Deleted'})


# PIN verification endpoint - validates 4-digit PIN for protected staff
@app.route('/api/pin-check', methods=['POST'])
def api_pin_check():
    data = request.get_json() or {}
    staff = (data.get('staff') or '').strip()
    pin = str(data.get('pin') or '').strip()

    # Load mapping from environment variable PIN_MAP_JSON if provided (JSON string), else use defaults
    default_map = {'송훈재': '8747', '임준호': '1203', '조영환': '0686'}
    pin_map = default_map
    try:
        env_map = os.environ.get('PIN_MAP_JSON')
        if env_map:
            parsed = json.loads(env_map)
            if isinstance(parsed, dict):
                pin_map = parsed
    except Exception:
        pin_map = default_map

    # normalize staff name (remove common title suffixes) and support latin tokens -> Korean mapping
    base = re.sub(r"\s*(부장|차장|과장|대리|사원|팀장|선생님|선생)\s*$", '', staff).strip()
    # support canonical Latin tokens mapping used by frontend
    latin_map = {
        'songhoonjae': '송훈재', 'songhunje': '송훈재',
        'limjunho': '임준호', 'imjunho': '임준호',
        'choyounghwan': '조영환', 'joyounghwan': '조영환'
    }
    lower_base = base.lower()
    if lower_base in latin_map:
        base = latin_map[lower_base]

    # if staff not in pin_map keys, try direct match with provided staff string
    candidates = [base, staff]
    matched_key = None
    for c in candidates:
        if c in pin_map:
            matched_key = c
            break

    if not matched_key:
        # try to find a key by PIN value as a fallback (accept pin if it matches any configured value)
        found = None
        for k, v in pin_map.items():
            if str(v).strip() == pin:
                found = k
                break
        if found:
            return jsonify({'ok': True, 'staff': found})
        # no protected mapping found -> return 404 so client knows PIN not required or unknown
        return jsonify({'ok': False, 'msg': 'No PIN required or staff unknown'}), 404

    expected = str(pin_map.get(matched_key, '')).strip()
    if expected and pin == expected:
        return jsonify({'ok': True, 'staff': matched_key})
    return jsonify({'ok': False, 'msg': 'PIN mismatch'}), 401


def build_auto_tags(visits, max_tags=8):
    """Derive simple heuristic tags from a list of visit objects.
    Each visit is expected to be a dict with optional keys: 'school', 'visitDate', 'subjects' (list of subject objects),
    where each subject object may contain 'subject', 'contact', 'meetings' (list), 'conversation', 'followUp'.
    Returns a dict: { 'tags': [...], 'details': {...} }
    """
    subj_count = {}
    school_count = {}
    contact_count = 0
    chat_count = 0
    follow_count = 0
    training_count = 0

    # keyword patterns
    training_keywords = re.compile(r"연수|연수안내|연수문의|워크숍|연수희망|연수희망자|교육|교육안내|교육설명회|교원연수|연수참여|연수요청|교사연수|직무연수|연수신청", re.I)
    chat_keywords = re.compile(r"채팅|카카오톡|카톡|라인", re.I)
    follow_keywords = re.compile(r"자료|발송|자료발송|재발송|보내|견적|문의|추가|재방문|약속", re.I)

    for v in (visits or []):
        # school
        school = (v.get('school') or v.get('schoolName') or '').strip()
        if school:
            school_count[school] = school_count.get(school, 0) + 1

        subjects = v.get('subjects') or []
        for s in subjects:
            subj = (s.get('subject') or '').strip() or '기타'
            subj_count[subj] = subj_count.get(subj, 0) + 1
            contact = (s.get('contact') or '').strip()
            if contact:
                contact_count += 1
            meetings = s.get('meetings') or []
            for m in meetings:
                try:
                    if isinstance(m, str) and chat_keywords.search(m):
                        chat_count += 1
                except Exception:
                    continue
            conv = (s.get('conversation') or '') if isinstance(s.get('conversation'), str) else ''
            if conv and training_keywords.search(conv):
                training_count += 1
            if conv and follow_keywords.search(conv):
                follow_count += 1

    # also scan top-level visit-level text fields for keywords
    for v in (visits or []):
        vtext = ''
        if isinstance(v.get('notes'), str): vtext += ' ' + v.get('notes')
        if isinstance(v.get('conversation'), str): vtext += ' ' + v.get('conversation')
        if training_keywords.search(vtext):
            training_count += 1
        if chat_keywords.search(vtext):
            chat_count += 1
        if follow_keywords.search(vtext):
            follow_count += 1

    tags = []
    details = {
        'subjects': subj_count,
        'schools': school_count,
        'contacts': contact_count,
        'chat_invites': chat_count,
        'follow_flags': follow_count,
        'training_interest': training_count
    }

    # top subjects
    top_subjects = sorted(subj_count.items(), key=lambda x: x[1], reverse=True)
    for subj, cnt in top_subjects:
        tags.append(f"{subj}({cnt}회)")

    # schools with multiple visits (threshold 3)
    multi = [s for s, c in school_count.items() if c >= 3]
    if multi:
        # join up to 3 schools to avoid verbose tags
        tags.append("다수 방문: " + ', '.join(multi[:3]))

    if contact_count:
        tags.append(f"연락처 확보 {contact_count}건")
    if chat_count:
        tags.append("채팅방 안내")
    if follow_count:
        tags.append("자료 발송 필요")
    if training_count:
        tags.append("연수 관심")

    # dedupe and limit
    seen = set()
    out = []
    for t in tags:
        if t in seen: continue
        seen.add(t)
        out.append(t)
        if len(out) >= max_tags:
            break

    return {'tags': out, 'details': details}


@app.route('/api/autotags', methods=['GET', 'POST'])
def api_autotags():
    """Endpoint to return autotag suggestions.
    POST: accept JSON { visits: [...] , max_tags: N }
    GET: accepts query params staff, from, to and will aggregate stored logs for that staff/date range.
    """
    if request.method == 'POST':
        data = request.get_json() or {}
        visits = data.get('visits') or []
        try:
            max_tags = int(data.get('max_tags', 8))
        except Exception:
            max_tags = 8
        if not isinstance(visits, list) or len(visits) == 0:
            return jsonify({'error': 'visits array is required in POST body'}), 400
        out = build_auto_tags(visits, max_tags=max_tags)
        return jsonify(out)

    # GET: aggregate from stored logs
    q_staff = request.args.get('staff')
    q_from = request.args.get('from')
    q_to = request.args.get('to')

    def parse_dt(s):
        try:
            return date_parser.isoparse(s)
        except Exception:
            return None

    dt_from = parse_dt(q_from) if q_from else None
    dt_to = parse_dt(q_to) if q_to else None

    visits = []
    if USE_FIRESTORE and db is not None:
        docs = db.collection('sales_logs').stream()
        for d in docs:
            obj = d.to_dict()
            payload = obj.get('payload') or {}
            created_s = obj.get('created_at') or payload.get('visitDate')
            created_dt = None
            if created_s:
                try:
                    created_dt = date_parser.isoparse(created_s)
                except Exception:
                    try:
                        created_dt = date_parser.isoparse(created_s[:10])
                    except Exception:
                        created_dt = None
            if dt_from and created_dt and created_dt < dt_from: continue
            if dt_to and created_dt and created_dt > dt_to: continue
            manager = (payload.get('manager') or payload.get('user') or 'Unknown')
            if q_staff and manager != q_staff: continue
            # normalize payload to visit-like object
            visits.append(payload)
    else:
        for r in sales_logs:
            payload = r.get('payload', {}) if isinstance(r, dict) else {}
            created_s = r.get('created_at') or payload.get('visitDate')
            created_dt = None
            if created_s:
                try:
                    created_dt = date_parser.isoparse(created_s)
                except Exception:
                    try:
                        created_dt = date_parser.isoparse(created_s[:10])
                    except Exception:
                        created_dt = None
            if dt_from and created_dt and created_dt < dt_from: continue
            if dt_to and created_dt and created_dt > dt_to: continue
            manager = (payload.get('manager') or payload.get('user') or 'Unknown')
            if q_staff and manager != q_staff: continue
            visits.append(payload)

    out = build_auto_tags(visits, max_tags=int(request.args.get('max_tags') or 8))
    return jsonify(out)

if __name__ == '__main__':
    app.run(debug=True)