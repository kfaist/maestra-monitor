"""
push_gallery.py — Gallery-to-Railway bridge
============================================
Run this on ANY machine that can reach the local gallery server.
It fetches entity data from the gallery every 10 seconds and pushes
it to the Railway monitor's /api/gallery-cache endpoint, so any
browser (even off-network) can see gallery data.

Usage (Python 3.7+):
    python push_gallery.py

Override defaults with env vars:
    GALLERY_URL=http://192.168.128.115:8080
    MONITOR_URL=https://maestra-monitor-production.up.railway.app
    PUSH_INTERVAL=10
"""

import os, time, json, urllib.request, urllib.error

GALLERY_URL  = os.environ.get('GALLERY_URL',  'http://192.168.128.115:8080')
MONITOR_URL  = os.environ.get('MONITOR_URL',  'https://maestra-monitor-production.up.railway.app')
PUSH_INTERVAL = int(os.environ.get('PUSH_INTERVAL', '10'))

GALLERY_ENTITIES = f'{GALLERY_URL}/entities'
CACHE_ENDPOINT   = f'{MONITOR_URL}/api/gallery-cache'

def fetch_gallery():
    """Fetch entities from local gallery server."""
    req = urllib.request.Request(GALLERY_ENTITIES)
    req.add_header('Accept', 'application/json')
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    entities = data if isinstance(data, list) else data.get('entities', [])
    return entities

def push_to_monitor(entities):
    """POST entity array to Railway monitor gallery-cache."""
    payload = json.dumps(entities).encode('utf-8')
    req = urllib.request.Request(CACHE_ENDPOINT, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))

def main():
    print(f'Gallery bridge started')
    print(f'  Gallery : {GALLERY_ENTITIES}')
    print(f'  Monitor : {CACHE_ENDPOINT}')
    print(f'  Interval: {PUSH_INTERVAL}s')
    print()

    consecutive_errors = 0
    while True:
        try:
            entities = fetch_gallery()
            result = push_to_monitor(entities)
            print(f'[OK] Pushed {result.get("count", "?")} entities to monitor')
            consecutive_errors = 0
        except urllib.error.URLError as e:
            consecutive_errors += 1
            print(f'[ERR] {e.reason} (attempt {consecutive_errors})')
        except Exception as e:
            consecutive_errors += 1
            print(f'[ERR] {e} (attempt {consecutive_errors})')

        time.sleep(PUSH_INTERVAL)

if __name__ == '__main__':
    main()
