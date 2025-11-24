import threading
import http.server
import socketserver
import time
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright

PORT = 8080
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), '..', 'public')
RESULT_PATH = os.path.join(os.environ.get('TEMP') or '/tmp', 'cmass_py_smoke_result.json')


class SilentHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


def start_server():
    os.chdir(PUBLIC_DIR)
    handler = SilentHandler
    with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), handler) as httpd:
        # server.serve_forever will block -- run in thread
        httpd.serve_forever()


def run_smoke(url):
    out = {'url': url, 'console': [], 'network': [], 'actions': [], 'errors': []}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()

            page.on('console', lambda msg: out['console'].append({'type': msg.type, 'text': msg.text}))
            page.on('pageerror', lambda e: out['errors'].append({'type': 'pageerror', 'message': str(e)}))
            page.on('requestfailed', lambda req: out['network'].append({'url': req.url, 'status': 'failed', 'method': req.method, 'failureText': req.failure and getattr(req.failure, 'errorText', None)}))

            def on_response(res):
                try:
                    st = res.status
                    if st >= 400:
                        out['network'].append({'url': res.url, 'status': st})
                except Exception:
                    pass

            page.on('response', on_response)

            try:
                page.goto(url, wait_until='domcontentloaded', timeout=30000)
                out['actions'].append('loaded')
            except Exception as e:
                out['errors'].append({'type': 'goto', 'message': str(e)})
                browser.close()
                return out

            # try region
            try:
                # allow more time for deferred scripts and CSV parsing to run
                page.wait_for_selector('#regionButtons .selector-btn', timeout=20000)
                regionBtn = page.query_selector('#regionButtons .selector-btn')
                if regionBtn:
                    regionBtn.click()
                    out['actions'].append('clicked-first-region')
                    page.wait_for_timeout(500)
                else:
                    out['actions'].append('no-region-button')
            except Exception as e:
                out['errors'].append({'stage': 'region', 'message': str(e)})

            # capture applyMappingIfPresent typeof before
            try:
                beforeType = page.evaluate('() => typeof window.applyMappingIfPresent')
                out['actions'].append({'name': 'applyMappingIfPresent_before', 'value': beforeType})
            except Exception as e:
                out['errors'].append({'stage': 'before-check', 'message': str(e)})

            # Inspect CSV helper availability and try to get rows count (helps debug why regions may be empty)
            try:
                fetchType = page.evaluate("() => typeof window.fetchCsvRows")
                out['actions'].append({'name': 'fetchCsvRows_type', 'value': fetchType})
                if fetchType == 'function':
                    rowsInfo = page.evaluate("() => window.fetchCsvRows().then(r => ({ len: Array.isArray(r)? r.length : null, header: (Array.isArray(r) && r.length>0)? r[0] : null })).catch(e => ({ error: String(e) }))")
                    out['actions'].append({'name': 'fetchCsvRows_result', 'value': rowsInfo})
                    # If the canonical fetchCsvRows returned null/undefined, inject a lightweight CSV parser and
                    # populate #regionButtons / #schoolButtons so we can verify the rest of the flow.
                    if rowsInfo and (rowsInfo.get('len') is None):
                        inject = page.evaluate(r"""
                        async () => {
                          try {
                            const txt = await (await fetch('/sales_staff.csv')).text();
                            const lines = txt.split(/\r?\n/).filter(l=>l.trim());
                            const rows = lines.map(l=> l.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(c=>{ let t=c.trim(); if(t.startsWith('"') && t.endsWith('"')) t = t.slice(1,-1).replace(/""/g,'"'); return t; }));
                            const header = rows[0] || [];
                            const idxRegion = header.findIndex(h=>/(region|지역)/i.test(h));
                            const idxSchool = header.findIndex(h=>/(school|학교명|학교)/i.test(h));
                            const idxStaff = header.findIndex(h=>/(staff|담당자)/i.test(h));
                            const regionMap = {};
                            for (let i=1;i<rows.length;i++){
                              const r = rows[i];
                              const region = (r[idxRegion]||'').trim() || '기타';
                              const school = (r[idxSchool]||'').trim() || '';
                              const staff = idxStaff>=0 ? (r[idxStaff]||'').trim() : '';
                              if(!regionMap[region]) regionMap[region]=[];
                              regionMap[region].push({ name: school, staff: staff });
                            }
                            const regionButtons = document.getElementById('regionButtons');
                            const schoolButtons = document.getElementById('schoolButtons');
                            if(regionButtons){ regionButtons.innerHTML = ''; }
                            if(schoolButtons){ schoolButtons.innerHTML = ''; }
                            for (const reg of Object.keys(regionMap)){
                              const btn = document.createElement('button'); btn.className = 'selector-btn';
                              const lbl = document.createElement('span'); lbl.className = 'selector-label'; lbl.textContent = reg; btn.appendChild(lbl);
                              btn.addEventListener('click', function(){
                                if(!schoolButtons) return;
                                schoolButtons.innerHTML = '';
                                regionMap[reg].forEach(s => {
                                  const sb = document.createElement('button'); sb.className = 'selector-btn';
                                  const sl = document.createElement('span'); sl.className = 'selector-label'; sl.textContent = s.name || '(이름없음)'; sb.appendChild(sl);
                                  schoolButtons.appendChild(sb);
                                });
                              });
                              regionButtons.appendChild(btn);
                            }
                            return Object.keys(regionMap).length;
                          } catch(e){ return { error: String(e) }; }
                        }
                        """)
                        out['actions'].append({'name': 'injectedRegionCount', 'value': inject})
            except Exception as e:
                out['errors'].append({'stage': 'fetch-check', 'message': str(e)})

            # click first school
            try:
                page.wait_for_selector('#schoolButtons .selector-btn', timeout=20000)
                schoolBtn = page.query_selector('#schoolButtons .selector-btn')
                if schoolBtn:
                    schoolBtn.click()
                    out['actions'].append('clicked-first-school')
                    page.wait_for_timeout(1200)
                else:
                    out['actions'].append('no-school-button')
            except Exception as e:
                out['errors'].append({'stage': 'school', 'message': str(e)})

            try:
                afterType = page.evaluate('() => typeof window.applyMappingIfPresent')
                out['actions'].append({'name': 'applyMappingIfPresent_after', 'value': afterType})
            except Exception as e:
                out['errors'].append({'stage': 'after-check', 'message': str(e)})

            try:
                meta = page.evaluate('() => ({ lastFoundMeta: !!window._cmass_lastFoundMeta, lastAppliedKey: window._cmass_lastAppliedMappingKey || null })')
                out['actions'].append({'name': 'meta', 'value': meta})
            except Exception as e:
                out['errors'].append({'stage': 'meta-check', 'message': str(e)})

            browser.close()
    except Exception as e:
        out['errors'].append({'type': 'run', 'message': str(e)})
    return out


def main():
    # start server thread
    srv_thread = threading.Thread(target=start_server, daemon=True)
    srv_thread.start()
    time.sleep(0.6)  # give server a moment to start

    url = f'http://127.0.0.1:{PORT}/input.html'
    result = run_smoke(url)

    Path(os.path.dirname(RESULT_PATH)).mkdir(parents=True, exist_ok=True)
    with open(RESULT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print('RESULT_FILE:' + RESULT_PATH)


if __name__ == '__main__':
    main()
