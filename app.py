from flask import Flask, request, jsonify, send_from_directory, make_response
import sqlite3
import os
import json
from datetime import datetime

BASE_DIR = os.path.dirname(__file__)
# Serve frontend files from the local CMASS_SalesLog folder when possible so
# edits to files here are reflected immediately when running the Flask app.
# If a file isn't present in this folder, fall back to the parent directory.
_candidate = os.path.abspath(BASE_DIR)
if os.path.exists(os.path.join(_candidate, 'input.html')):
    FRONTEND_DIR = _candidate
else:
    FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, '..'))
# Allow overriding DB path via environment for Cloud Run / container usage
DB_PATH = os.environ.get('VISITS_DB') or os.path.join(BASE_DIR, 'visits.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute('''
        CREATE TABLE IF NOT EXISTS visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT,
            staff TEXT,
            visit_date TEXT,
            payload TEXT
        )
    ''')
    conn.commit()
    conn.close()

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
app.config['JSON_AS_ASCII'] = False
init_db()

# Simple SSE broadcaster
from queue import Queue
_sse_clients = []

def sse_broadcast(event_name, data):
    payload = f"event: {event_name}\n"
    payload += f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    # push to client queues (non-blocking)
    for q in list(_sse_clients):
        try:
            q.put(payload, block=False)
        except Exception:
            try: _sse_clients.remove(q)
            except Exception: pass


def add_cors_headers(resp):
    # lightweight CORS for API usage from hosting; adjust origins in production
    try:
        resp.headers['Access-Control-Allow-Origin'] = os.environ.get('CORS_ALLOW_ORIGIN', '*')
        resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    except Exception:
        pass
    return resp

@app.route('/api/visits', methods=['POST'])
def save_visits():
    try:
        data = request.get_json(force=True)
    except Exception as e:
        return jsonify({'ok': False, 'error': 'invalid_json', 'msg': str(e)}), 400
    if not data:
        return jsonify({'ok': False, 'error': 'empty_payload'}), 400
    staff = data.get('staff') or ''
    visits = data.get('visits') or []

    # Validation: require visitStart and visitEnd for each visit entry
    missing = []
    if isinstance(visits, list):
        for idx, v in enumerate(visits):
            try:
                vs = v.get('visitStart') if isinstance(v, dict) else None
                ve = v.get('visitEnd') if isinstance(v, dict) else None
            except Exception:
                vs = ve = None
            # treat empty string or None as missing
            if not vs or not ve:
                missing.append({'index': idx, 'visitDate': (v.get('visitDate') if isinstance(v, dict) else None), 'school': (v.get('school') if isinstance(v, dict) else None)})

    if missing:
        return jsonify({'ok': False, 'error': 'missing_visit_times', 'missing': missing, 'msg': 'Each visit must include visitStart and visitEnd'}), 400
    visit_date = None
    if isinstance(visits, list) and visits:
        visit_date = visits[0].get('visitDate') or None
    # store payload as JSON text
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()

        # Determine incoming visit_date and first visit's school (if any)
        incoming_school = None
        if isinstance(visits, list) and visits:
            try:
                incoming_school = (visits[0].get('school') if isinstance(visits[0], dict) else None)
            except Exception:
                incoming_school = None

        rowid = None
        # Look for existing records with same staff + visit_date.
        # If any existing record contains a visit with the same school as any incoming visit,
        # prefer updating that record (avoid creating duplicates for same school/day/staff).
        updated = False
        if staff and visit_date:
            cur.execute('SELECT id, payload FROM visits WHERE staff = ? AND visit_date = ? ORDER BY id DESC', (staff, visit_date))
            candidates = cur.fetchall() or []
        else:
            candidates = []

        if candidates:
            # build set of incoming schools for quick lookup
            incoming_schools = set()
            try:
                for vv in visits:
                    if isinstance(vv, dict) and vv.get('school'):
                        incoming_schools.add(str(vv.get('school')).strip())
            except Exception:
                incoming_schools = set()

            for cand in candidates:
                try:
                    rid = cand[0]
                    payload_text = cand[1]
                    payload_obj = json.loads(payload_text) if payload_text else {}
                    ev = (payload_obj.get('visits') if isinstance(payload_obj, dict) else None)
                    existing_schools = set()
                    if ev and isinstance(ev, list):
                        for evis in ev:
                            try:
                                if isinstance(evis, dict) and evis.get('school'):
                                    existing_schools.add(str(evis.get('school')).strip())
                            except Exception:
                                continue
                    # If intersection exists, update this candidate row
                    if incoming_schools and existing_schools and (incoming_schools & existing_schools):
                        cur.execute('UPDATE visits SET payload = ?, created_at = ? WHERE id = ?', (
                            json.dumps(data, ensure_ascii=False), datetime.utcnow().isoformat(), rid
                        ))
                        conn.commit()
                        rowid = rid
                        try:
                            sse_broadcast('updated_visit', {'id': rowid, 'staff': staff, 'visit_date': visit_date, 'payload': data})
                        except Exception:
                            pass
                        conn.close()
                        return jsonify({'ok': True, 'id': rowid, 'updated': True}), 200
                except Exception:
                    # ignore candidate parsing errors and try next
                    continue

        # Otherwise insert as a new record
        cur.execute('INSERT INTO visits (created_at, staff, visit_date, payload) VALUES (?,?,?,?)', (
            datetime.utcnow().isoformat(), staff, visit_date, json.dumps(data, ensure_ascii=False)
        ))
        conn.commit()
        rowid = cur.lastrowid
        conn.close()

        # broadcast to SSE clients
        try:
            sse_broadcast('new_visit', {'id': rowid, 'staff': staff, 'visit_date': visit_date, 'payload': data})
        except Exception:
            pass

        return jsonify({'ok': True, 'id': rowid}), 201
    except Exception as e:
        return jsonify({'ok': False, 'error': 'db_error', 'msg': str(e)}), 500


@app.route('/api/visits', methods=['GET'])
def list_visits():
    # returns stored visit records, supports pagination and simple filters
    try:
        limit = int(request.args.get('limit') or 100)
        offset = int(request.args.get('offset') or 0)
    except Exception:
        limit = 100
        offset = 0

    # simple filter params
    staff_q = request.args.get('staff')
    school_q = request.args.get('school')
    subject_q = request.args.get('subject')
    region_q = request.args.get('region')
    date_from = request.args.get('from')
    date_to = request.args.get('to')

    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute('SELECT id, created_at, staff, visit_date, payload FROM visits ORDER BY id DESC LIMIT ? OFFSET ?', (limit, offset))
        rows = cur.fetchall()
        conn.close()

        out = []
        for r in rows:
            try:
                payload = json.loads(r[4]) if r[4] else None
            except Exception:
                payload = None
            rec = { 'id': r[0], 'created_at': r[1], 'staff': r[2], 'visit_date': r[3], 'payload': payload }

            # apply simple post-fetch filters (payload-inspected)
            def matches():
                try:
                    if staff_q and (not rec['staff'] or staff_q not in rec['staff']):
                        return False
                    if not payload:
                        return True
                    # school filter
                    if school_q:
                        v = ''
                        if isinstance(payload, dict):
                            visits = payload.get('visits') or []
                            if visits and isinstance(visits, list): v = (visits[0].get('school') or '')
                        if school_q not in (v or ''): return False
                    # subject filter
                    if subject_q:
                        found = False
                        if isinstance(payload, dict):
                            for vv in payload.get('visits') or []:
                                subs = vv.get('subjects') or []
                                for s in subs:
                                    subname = s.get('subject') if isinstance(s, dict) else str(s)
                                    if subject_q in (subname or ''): found = True
                        if not found: return False
                    # region filter
                    if region_q:
                        v = ''
                        if isinstance(payload, dict):
                            visits = payload.get('visits') or []
                            if visits and isinstance(visits, list): v = (visits[0].get('region') or '')
                        if region_q not in (v or ''): return False
                    # date range
                    if date_from or date_to:
                        dt = rec.get('visit_date') or ''
                        if date_from and dt and dt < date_from: return False
                        if date_to and dt and dt > date_to: return False
                except Exception:
                    return False
                return True

            if matches():
                out.append(rec)
        resp = make_response(jsonify({'ok': True, 'rows': out}), 200)
        return add_cors_headers(resp)
    except Exception as e:
        resp = make_response(jsonify({'ok': False, 'error': 'db_error', 'msg': str(e)}), 500)
        return add_cors_headers(resp)


@app.route('/api/visits/export', methods=['GET'])
def export_visits_csv():
    # export flattened CSV of stored visits -> one subject per row
    import csv
    # support optional filters in query params (delegates to list_visits logic)
    try:
        # reuse list_visits logic by invoking it through a local request-like pattern
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute('SELECT id, created_at, staff, visit_date, payload FROM visits ORDER BY id DESC')
        rows = cur.fetchall()
        conn.close()
    except Exception as e:
        return jsonify({'ok': False, 'error': 'db_error', 'msg': str(e)}), 500

    # support filter params
    staff_q = request.args.get('staff')
    school_q = request.args.get('school')
    subject_q = request.args.get('subject')
    region_q = request.args.get('region')
    date_from = request.args.get('from')
    date_to = request.args.get('to')

    def row_matches(payload_text, staff_val, visit_date_val):
        try:
            payload = json.loads(payload_text) if payload_text else {}
        except Exception:
            payload = {}
        if staff_q and staff_q not in (staff_val or ''): return False
        if school_q:
            v = ''
            visits = payload.get('visits') if isinstance(payload, dict) else None
            if visits and isinstance(visits, list) and len(visits): v = visits[0].get('school') or ''
            if school_q not in (v or ''): return False
        if subject_q:
            found=False
            visits = payload.get('visits') if isinstance(payload, dict) else None
            for vv in (visits or []):
                for s in (vv.get('subjects') or []):
                    subname = s.get('subject') if isinstance(s, dict) else str(s)
                    if subject_q in (subname or ''): found=True
            if not found: return False
        if region_q:
            v = ''
            visits = payload.get('visits') if isinstance(payload, dict) else None
            if visits and isinstance(visits, list) and len(visits): v = visits[0].get('region') or ''
            if region_q not in (v or ''): return False
        if date_from and visit_date_val and visit_date_val < date_from: return False
        if date_to and visit_date_val and visit_date_val > date_to: return False
        return True

    def generate():
        import io
        buf = io.StringIO()
        w = csv.writer(buf)
        # header (added 'location' column)
        w.writerow(['record_id','created_at','staff','visit_date','school','region','location','visitStart','visitEnd','subject','teacher','publisher','contact','followUp','conversation','meetings'])
        yield buf.getvalue()
        buf.seek(0); buf.truncate(0)

        for r in rows:
            rid, created_at, staff, visit_date, payload_text = r
            if not row_matches(payload_text, staff, visit_date):
                continue
            try:
                payload = json.loads(payload_text) if payload_text else {}
            except Exception:
                payload = {}
            visits = payload.get('visits') if isinstance(payload, dict) else None
            if not visits:
                # output empty row (include location column)
                w.writerow([rid, created_at, staff, visit_date, '', '', '', '', '', '', '', '', '', '', '', ''])
                yield buf.getvalue(); buf.seek(0); buf.truncate(0)
            else:
                for v in visits:
                    school = v.get('school')
                    region = v.get('region')
                    location = v.get('location')
                    visitStart = v.get('visitStart')
                    visitEnd = v.get('visitEnd')
                    subjects = v.get('subjects') or []
                    if not subjects:
                        w.writerow([rid, created_at, staff, visit_date, school, region, location, visitStart, visitEnd, '', '', '', '', '', '', ''])
                        yield buf.getvalue(); buf.seek(0); buf.truncate(0)
                    else:
                        for s in subjects:
                            subj = s.get('subject')
                            teacher = s.get('teacher')
                            publisher = s.get('publisher')
                            contact = s.get('contact')
                            follow = s.get('followUp')
                            conv = s.get('conversation')
                            meetings = ','.join(s.get('meetings') or [])
                            w.writerow([rid, created_at, staff, visit_date, school, region, location, visitStart, visitEnd, subj, teacher, publisher, contact, follow, conv, meetings])
                            yield buf.getvalue(); buf.seek(0); buf.truncate(0)

    # streaming response
    resp = app.response_class(generate(), mimetype='text/csv', headers={'Content-Disposition':'attachment; filename=visits_export.csv'})
    return add_cors_headers(resp)


@app.route('/api/visits/patch_school', methods=['POST'])
def patch_school():
    """Admin helper: change school name inside stored visit payloads.
    Expects JSON: { staff: str (optional), visit_date: str (optional), old_school: str, new_school: str }
    Returns rows updated and details.
    NOTE: This updates the JSON text stored in the `payload` column.
    """
    try:
        data = request.get_json(force=True)
    except Exception as e:
        return jsonify({'ok': False, 'error': 'invalid_json', 'msg': str(e)}), 400
    old = (data.get('old_school') or '').strip()
    new = (data.get('new_school') or '').strip()
    if not old or not new:
        return jsonify({'ok': False, 'error': 'missing_params', 'msg': 'old_school and new_school are required'}), 400
    staff_q = data.get('staff')
    date_q = data.get('visit_date')

    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        # fetch candidate rows where payload contains the old school text
        q = 'SELECT id, payload FROM visits WHERE payload LIKE ?'
        params = ['%' + old + '%']
        if staff_q:
            q = q.replace('WHERE', 'WHERE staff = ? AND')
            params.insert(0, staff_q)
        cur.execute(q, params)
        rows = cur.fetchall()
        updated = []
        for rid, payload_text in rows:
            try:
                payload = json.loads(payload_text) if payload_text else {}
            except Exception:
                payload = None
            if not isinstance(payload, dict):
                continue
            changed = False
            visits = payload.get('visits') or []
            for v in visits:
                # optional visit_date filter
                if date_q and (v.get('visitDate') or payload.get('visitDate') or '') != date_q:
                    continue
                s = v.get('school') or ''
                if isinstance(s, str) and old in s:
                    v['school'] = s.replace(old, new)
                    changed = True
            if changed:
                # write back updated payload
                cur.execute('UPDATE visits SET payload = ? WHERE id = ?', (json.dumps(payload, ensure_ascii=False), rid))
                updated.append(rid)
        conn.commit()
        conn.close()
        return add_cors_headers(make_response(jsonify({'ok': True, 'updated_ids': updated, 'count': len(updated)}), 200))
    except Exception as e:
        return add_cors_headers(make_response(jsonify({'ok': False, 'error': 'db_error', 'msg': str(e)}), 500))


@app.route('/api/events')
def sse_events():
    def gen(q):
        try:
            # send a ping comment to keep connection alive
            q.put(':ok\n\n')
            while True:
                try:
                    data = q.get(timeout=25)
                    yield data
                except Exception:
                    # send a keep-alive comment
                    yield ':keep-alive\n\n'
        finally:
            try:
                _sse_clients.remove(q)
            except Exception:
                pass

    q = Queue()
    _sse_clients.append(q)
    resp = app.response_class(gen(q), mimetype='text/event-stream')
    return add_cors_headers(resp)

@app.route('/')
def index():
    # serve the frontend input.html as root
    resp = make_response(send_from_directory(FRONTEND_DIR, 'input.html'))
    # force no-cache for HTML to ensure clients fetch latest after deploy
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    # debugging header so browser can show which folder served the HTML
    try:
        resp.headers['X-Served-From'] = FRONTEND_DIR
    except Exception:
        pass
    return resp

@app.route('/<path:filename>')
def static_files(filename):
    # serve other frontend files (CSV, manifest, sw.js, etc.) from frontend dir
    resp = make_response(send_from_directory(FRONTEND_DIR, filename))
    # For critical assets ensure browsers don't use stale cached copies
    if filename.endswith('.html') or filename.endswith('.js') or filename.endswith('.css') or filename == 'sw.js' or filename.endswith('.json'):
        resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        resp.headers['Pragma'] = 'no-cache'
    try:
        resp.headers['X-Served-From'] = FRONTEND_DIR
    except Exception:
        pass
    return resp


@app.route('/_health')
def health():
    # simple health check for load balancers / Cloud Run
    try:
        ok = os.path.exists(DB_PATH)
        return add_cors_headers(make_response(jsonify({'ok': True, 'db_exists': ok}), 200))
    except Exception as e:
        return add_cors_headers(make_response(jsonify({'ok': False, 'error': str(e)}), 500))


@app.route('/clear-client')
def clear_client():
    # Serve a tiny page which will unregister service workers, delete caches,
    # remove the local draft key and then redirect back to the main page.
    # This helps clients that are still controlled by an old service worker.
    html = '''<!doctype html><meta charset="utf-8"><title>Clearing client</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;background:#f6f7fb;color:#0b2b5a;display:flex;align-items:center;justify-content:center;height:100vh}</style>
<div style="text-align:center"><h3>서비스워커/캐시 정리 중...</h3><p>잠시만 기다려 주세요. 완료되면 자동으로 페이지로 이동합니다.</p></div>
<script>(async function(){try{
 if('serviceWorker' in navigator){ const regs = await navigator.serviceWorker.getRegistrations(); for(const r of regs){ try{ await r.unregister(); }catch(e){} }}
 if(window.caches && caches.keys){ const keys = await caches.keys(); for(const k of keys){ try{ await caches.delete(k); }catch(e){} }}
 try{ localStorage.removeItem('cmass_sales_draft_v1'); }catch(e){}
 setTimeout(function(){ location.replace('/input.html'); }, 700);
}catch(e){ console.error(e); alert('오류 발생: '+ (e && e.message ? e.message : e)); }})();</script>'''
    resp = make_response(html)
    resp.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    return resp


# Serve shared assets folder (absolute path) so logo at parent assets is available
ASSETS_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', '..', 'assets'))
@app.route('/assets/<path:filename>')
def serve_assets(filename):
    return send_from_directory(ASSETS_DIR, filename)

if __name__ == '__main__':
    # simple debug runner - honor PORT env var for container usage
    port = int(os.environ.get('PORT') or 5000)
    debug = os.environ.get('FLASK_ENV', '').lower() != 'production'
    # print the frontend folder so it's visible in the terminal on start
    try:
        print('Starting Flask. FRONTEND_DIR =', FRONTEND_DIR)
    except Exception:
        pass
    app.run(host='0.0.0.0', port=port, debug=debug)
 

