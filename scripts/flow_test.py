
#!/usr/bin/env python3
"""
End-to-end flow test (index -> front -> input -> meeting -> report)
Uses Playwright (sync API). Run with:
  python -u scripts/flow_test.py --base-url http://localhost:5500 --runs 50

The script selects the user, enters the local PIN, navigates through the UI,
selects the first region/school available, fills a deterministic visitDate,
and verifies that meeting page receives the expected staff token and visitDate,
then submits to report and verifies the final URL/session state.
"""
import argparse
import sys
import time
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout


def run_one(page, base_url, user_token, pin, visit_date_iso, expect_staff_token):
    result = { 'ok': False, 'error': None }
    try:
        # 1) index
        page.goto(base_url + '/', wait_until='load', timeout=30000)
        # select user
        page.select_option('#userSelect', user_token)
        page.fill('#pinInput', pin)
        page.click('#pinSubmit')
        # wait for front
        page.wait_for_url('**/front**', timeout=10000)

        # 2) front -> click 영업일지 입력
        page.wait_for_selector('#goInput', timeout=5000)
        page.click('#goInput')
        # wait for input page (could be /input or /input/)
        page.wait_for_url('**/input**', timeout=10000)

        # 3) input: set deterministic visitDate, choose first region + school
        # ensure visitDate exists
        page.wait_for_selector('#visitDate', timeout=5000)
        page.fill('#visitDate', visit_date_iso)
        # Wait for region buttons to populate
        sel_region = None
        try:
            page.wait_for_selector('#regionButtons button, #regionButtons .selector-btn, #regionButtons .grid-button', timeout=8000)
            els = page.query_selector_all('#regionButtons button, #regionButtons .selector-btn, #regionButtons .grid-button')
            if els:
                els[0].scroll_into_view_if_needed()
                els[0].click()
                sel_region = True
        except PWTimeout:
            # fallback: attempt to set hiddenRegionInput and window.selectedRegion
            page.evaluate("() => { try { if (document.getElementById('selectedRegionInput')) document.getElementById('selectedRegionInput').value=''; window.selectedRegion=''; } catch(e){} }")
        # Wait briefly
        time.sleep(0.3)
        # choose first school
        try:
            page.wait_for_selector('#schoolButtons button, #schoolButtons .selector-btn, #schoolButtons .grid-button', timeout=8000)
            els2 = page.query_selector_all('#schoolButtons button, #schoolButtons .selector-btn, #schoolButtons .grid-button')
            if els2:
                els2[0].scroll_into_view_if_needed()
                els2[0].click()
        except PWTimeout:
            # as fallback, set hiddenSchoolInput and window.selectedSchool
            page.evaluate("() => { try { if (document.getElementById('selectedSchoolInput')) document.getElementById('selectedSchoolInput').value=''; window.selectedSchool=''; } catch(e){} }")

        # If no visible region/school were clickable we still set window.selectedRegion/window.selectedSchool
        page.evaluate("(r,s) => { try{ if (!window.selectedRegion) window.selectedRegion = r || '자동지역'; if (!window.selectedSchool) window.selectedSchool = s || '자동학교'; if (document.getElementById('selectedRegionInput')) document.getElementById('selectedRegionInput').value = window.selectedRegion; if (document.getElementById('selectedSchoolInput')) document.getElementById('selectedSchoolInput').value = window.selectedSchool; }catch(e){} }", '자동지역', '자동학교')

        # click next
        page.wait_for_selector('#nextStepBtn', timeout=5000)
        page.click('#nextStepBtn')
        # expect navigation to meeting
        page.wait_for_url('**/meeting**', timeout=10000)

        # 4) meeting page: verify staff and visitDate
        page.wait_for_selector('#staff', timeout=5000)
        staff_val = page.eval_on_selector('#staff', 'el => el.value')
        visit_date_val = page.eval_on_selector('#visitDate', 'el => el.value')

        if str(staff_val).lower() != str(expect_staff_token).lower():
            result['error'] = f"staff token mismatch: got={staff_val} expected={expect_staff_token}"
            return result
        if str(visit_date_val) != str(visit_date_iso):
            result['error'] = f"visitDate mismatch: got={visit_date_val} expected={visit_date_iso}"
            return result

        # 5) submit to report
        page.click('#btnSubmit')
        page.wait_for_url('**/report**', timeout=10000)

        # verify final URL has staff param or sessionStorage has metrics
        url = page.url
        ok_final = (f'staff=' in url) or (page.evaluate("() => !!(sessionStorage.getItem('cmass:report_metrics'))"))
        if not ok_final:
            result['error'] = f'report page missing expected state, url={url}'
            return result

        result['ok'] = True
        return result
    except Exception as e:
        result['error'] = repr(e)
        return result


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--base-url', default='http://localhost:5500')
    p.add_argument('--runs', type=int, default=50)
    p.add_argument('--headed', action='store_true', help='run with headed browser for diagnostics')
    p.add_argument('--user', default='SongHoonjae')
    p.add_argument('--pin', default='8747')
    p.add_argument('--date', default=time.strftime('%Y-%m-%d'))
    args = p.parse_args()

    total = args.runs
    success = 0
    failures = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=(not args.headed))
        page = browser.new_page()
        page.set_default_timeout(20000)
        for i in range(1, total+1):
            start = time.time()
            print(f'Run {i}/{total}...', flush=True)
            res = run_one(page, args.base_url, args.user, args.pin, args.date, 'songhoonjae')
            dur = time.time()-start
            if res.get('ok'):
                print(f'  OK in {dur:.2f}s')
                success += 1
            else:
                print(f'  FAIL in {dur:.2f}s -> {res.get("error")}', flush=True)
                failures.append({'run':i,'err':res.get('error')})
            # small pause between runs to avoid server overload
            time.sleep(0.25)
        browser.close()

    print('\nSummary:')
    print(f'  Total runs: {total}')
    print(f'  Successes : {success}')
    print(f'  Failures  : {len(failures)}')
    if failures:
        print('\nFailure details:')
        for f in failures[:20]:
            print(f'  Run {f["run"]}: {f["err"]}')
    if len(failures) > 0:
        sys.exit(2)


if __name__ == '__main__':
    main()
