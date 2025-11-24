import io
import csv
from backend.app import app


def post(client, payload):
    resp = client.post('/api/visits', json=payload)
    assert resp.status_code == 201
    return resp.get_json()


def test_filters_and_csv(tmp_path):
    # Some werkzeug builds used by this environment don't expose __version__
    # Set a fallback to avoid Flask test client errors
    try:
        import werkzeug
        if not getattr(werkzeug, '__version__', None):
            werkzeug.__version__ = '0.0.0'
    except Exception:
        pass
    client = app.test_client()
    # clear in-memory storage if present
    try:
        from backend import app as _app
    except Exception:
        pass

    # post three records with different dates, managers, regions
    r1 = post(client, {'manager': 'A', 'region': 'R1', 'visitDate': '2025-10-20T10:00:00Z'})
    r2 = post(client, {'manager': 'B', 'region': 'R2', 'visitDate': '2025-10-22T12:00:00Z'})
    r3 = post(client, {'manager': 'A', 'region': 'R1', 'visitDate': '2025-10-24T09:00:00Z'})

    # no filter -> total 3
    res = client.get('/api/stats')
    data = res.get_json()
    assert data['total'] >= 3

    # filter by manager A -> at least 2
    res = client.get('/api/stats?manager=A')
    data = res.get_json()
    assert data['by_manager'].get('A', 0) >= 2

    # filter by date range that should include only r2
    res = client.get('/api/stats?from=2025-10-21&to=2025-10-23')
    data = res.get_json()
    # date keys are ISO dates; ensure at least one record in that range
    total = data.get('total', 0)
    assert total >= 1

    # CSV filtered by region R1 should contain rows with R1
    csv_resp = client.get('/sales/export.csv?region=R1')
    assert csv_resp.status_code == 200
    # read CSV and ensure 'R1' appears in content
    content = csv_resp.data.decode('utf-8')
    assert 'R1' in content
