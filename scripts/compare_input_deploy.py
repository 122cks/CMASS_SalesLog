#!/usr/bin/env python3
import urllib.request
import urllib.error
import sys
from pathlib import Path
import difflib

local_path = Path(r"C:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\public\input.html")
if not local_path.exists():
    print('Local input.html not found at', local_path)
    sys.exit(2)

url = 'https://cmass-sales.web.app/input?staff=SongHoonjae'
print('Fetching', url)
req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        deployed = r.read().decode('utf-8', errors='replace')
except Exception as e:
    print('Failed to fetch deployed URL:', e)
    sys.exit(3)

local = local_path.read_text(encoding='utf-8', errors='replace')

if local == deployed:
    print('MATCH: Deployed /input exactly matches local input.html')
    sys.exit(0)

print('MISMATCH: Deployed /input differs from local input.html')
local_lines = local.splitlines(keepends=True)
deployed_lines = deployed.splitlines(keepends=True)

diff = difflib.unified_diff(local_lines, deployed_lines, fromfile='local/input.html', tofile='deployed/input', lineterm='')
count = 0
for line in diff:
    if count < 400:
        sys.stdout.write(line + '\n')
    count += 1

print(f'--- diff lines shown: {min(count,400)} (truncated if >400) ---')
print('\nLocal file length:', len(local_lines), 'lines')
print('Deployed file length:', len(deployed_lines), 'lines')
sys.exit(1)
