from flask import Flask, send_from_directory, redirect

# Simple Flask app to serve files from the `public/` folder itself.
# This file is intended to be executed from the repository root as:
#   python .\public\app.py

app = Flask(__name__, static_folder='.', static_url_path='')


@app.route('/')
def index():
    return redirect('/meeting.html')


@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory('.', filename)


@app.route('/_health')
def health():
    return 'ok', 200


if __name__ == '__main__':
    # Development server for local testing
    app.run(host='127.0.0.1', port=5000, debug=True)

@app.route('/redirect_meeting')
def redirect_meeting():
    # Collect known query params and redirect to meeting page with same query
    from flask import request, redirect
    parts = []
    for k in ('staff','date','region','school'):
        v = request.args.get(k)
        if v:
            parts.append(f"{k}={v}")
    q = ('?' + '&'.join(parts)) if parts else ''
    return redirect('/meeting.html' + q)
