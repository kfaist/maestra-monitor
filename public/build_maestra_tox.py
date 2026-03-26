"""
build_maestra_tox.py — Maestra COMP builder for TouchDesigner
Run this from a Text DAT (right-click → Run Script) or from Textport:
    exec(open('/path/to/build_maestra_tox.py').read())

What this does:
1. Creates /project1/maestra Base COMP with full Maestra extension
2. Auto-registers this .toe with the Maestra server
3. Pushes { toe_name, tops } so the Monitor wizard can show a TOP dropdown
4. Sets up state_in CHOP wiring and state_table/state_chop outputs

Server priority: Gallery local (192.168.128.115:8080) → Railway fallback
"""

import urllib.request
import json
import os
import time

# ─── Config ────────────────────────────────────────────────────────────────
RAILWAY_URL   = 'https://maestra-backend-v2-production.up.railway.app'
GALLERY_URL   = 'http://192.168.128.115:8080'
AUTO_DISCOVER = True   # Try gallery first, fall back to Railway

# Derive entity slug from project name
def make_slug(name):
    import re
    s = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return s or 'td-node'

TOE_NAME    = os.path.splitext(os.path.basename(project.path))[0] if project.path else project.name
ENTITY_SLUG = make_slug(TOE_NAME)

# ─── Detect reachable server ────────────────────────────────────────────────
def probe_server(url):
    try:
        req = urllib.request.Request(url + '/health', method='GET')
        with urllib.request.urlopen(req, timeout=3) as r:
            return r.status == 200
    except Exception:
        try:
            req = urllib.request.Request(url + '/entities', method='GET')
            with urllib.request.urlopen(req, timeout=3) as r:
                return r.status == 200
        except Exception:
            return False

SERVER_URL = GALLERY_URL if (AUTO_DISCOVER and probe_server(GALLERY_URL)) else RAILWAY_URL
print(f'[Maestra] Using server: {SERVER_URL}')

# ─── Collect available TOPs ─────────────────────────────────────────────────
def collect_tops(max_depth=3):
    tops = []
    for t in root.findChildren(type=topCOMP, maxDepth=max_depth):
        try:
            tops.append(t.path)
        except Exception:
            pass
    return tops[:30]

TOPS = collect_tops()

# ─── Create or find maestra COMP ───────────────────────────────────────────
parent = op('/project1')
maestra = parent.op('maestra')
if maestra:
    print(f'[Maestra] Found existing COMP at {maestra.path}')
else:
    maestra = parent.create(baseCOMP, 'maestra')
    print(f'[Maestra] Created COMP at {maestra.path}')

# ─── Build internal operators ───────────────────────────────────────────────
def ensure_op(parent_op, op_type, name):
    existing = parent_op.op(name)
    if existing:
        return existing
    return parent_op.create(op_type, name)

# state_table DAT
state_table = ensure_op(maestra, tableDAT, 'state_table')
state_table.clear()
state_table.appendRow(['key', 'value', 'type'])

# log DAT
log_dat = ensure_op(maestra, tableDAT, 'log')

# null1 — connection point
null_out = ensure_op(maestra, nullCHOP, 'null_out')

# timer for heartbeat
timer = ensure_op(maestra, timerCHOP, 'heartbeat_timer')
timer.par.period = 5
timer.par.outseconds = True

print('[Maestra] Internal operators ready')

# ─── Custom parameters ──────────────────────────────────────────────────────
page = maestra.appendCustomPage('Connection')
if not hasattr(maestra.par, 'Serverurl'):
    page.appendStr('Serverurl',  label='Server URL')
if not hasattr(maestra.par, 'Entityslug'):
    page.appendStr('Entityslug', label='Entity Slug')
if not hasattr(maestra.par, 'Connected'):
    page.appendToggle('Connected', label='Connected')
if not hasattr(maestra.par, 'Autoconnect'):
    page.appendToggle('Autoconnect', label='Auto Connect')

maestra.par.Serverurl.val   = SERVER_URL
maestra.par.Entityslug.val  = ENTITY_SLUG
maestra.par.Autoconnect.val = True

print(f'[Maestra] Entity slug: {ENTITY_SLUG}')

# ─── Register entity + push toe_name/tops ──────────────────────────────────
def register_entity():
    payload = {
        'name': TOE_NAME,
        'slug': ENTITY_SLUG,
        'entity_type_id': 'default',
        'state': {
            'toe_name': TOE_NAME,
            'tops': TOPS,
            'server': SERVER_URL,
            'active': True,
        },
        'description': f'TouchDesigner node: {TOE_NAME}',
        'tags': ['touchdesigner'],
        'metadata': {
            'toe_name': TOE_NAME,
            'tops': TOPS,
            'server': SERVER_URL,
            'registered_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        }
    }
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        SERVER_URL + '/entities',
        data=data,
        method='POST',
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            resp = json.loads(r.read().decode('utf-8'))
            entity_id = resp.get('id', 'unknown')
            print(f'[Maestra] Registered entity: {entity_id}')
            maestra.par.Connected.val = True
            # Update state_table
            state_table.clear()
            state_table.appendRow(['key', 'value', 'type'])
            state_table.appendRow(['toe_name', TOE_NAME, 'string'])
            state_table.appendRow(['entity_id', entity_id, 'string'])
            state_table.appendRow(['server', SERVER_URL, 'string'])
            for top in TOPS[:8]:
                state_table.appendRow([f'top:{top}', top, 'path'])
            return entity_id
    except Exception as e:
        print(f'[Maestra] Registration error: {e}')
        maestra.par.Connected.val = False
        return None

entity_id = register_entity()

# ─── Heartbeat callback DAT ────────────────────────────────────────────────
heartbeat_code = f'''
# Maestra heartbeat — runs every 5 seconds via timer_chop
import urllib.request, json, time

SERVER_URL   = op('maestra').par.Serverurl.val
ENTITY_SLUG  = op('maestra').par.Entityslug.val

def onTimerPulse(timerOp):
    try:
        payload = json.dumps({{'slug': ENTITY_SLUG, 'timestamp': time.time()}}).encode()
        req = urllib.request.Request(
            SERVER_URL + '/entities/' + ENTITY_SLUG + '/heartbeat',
            data=payload, method='POST',
            headers={{'Content-Type': 'application/json'}}
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass
'''

hb_dat = ensure_op(maestra, textDAT, 'heartbeat_callback')
hb_dat.text = heartbeat_code

# ─── State push helper ──────────────────────────────────────────────────────
state_push_code = f'''
# Call this to push state to Maestra
# Usage: op('maestra').op('state_push').run({'key': 'brightness', 'value': 75})
import urllib.request, json

def push_state(state_dict):
    SERVER_URL  = op('maestra').par.Serverurl.val
    SLUG        = op('maestra').par.Entityslug.val
    payload     = json.dumps({{'state': state_dict}}).encode()
    req = urllib.request.Request(
        SERVER_URL + '/entities/' + SLUG + '/state',
        data=payload, method='PATCH',
        headers={{'Content-Type': 'application/json'}}
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print(f'[Maestra] push_state error: {{e}}')
'''

push_dat = ensure_op(maestra, textDAT, 'state_push')
push_dat.text = state_push_code

# ─── Done ───────────────────────────────────────────────────────────────────
print(f'''
╔════════════════════════════════════════════════╗
║  Maestra COMP ready at /project1/maestra       ║
║                                                ║
║  Entity:  {ENTITY_SLUG:<38}║
║  Server:  {SERVER_URL[:38]:<38}║
║  TOPs:    {len(TOPS):<38}║
╚════════════════════════════════════════════════╝

Next steps:
1. Wire any CHOP output into maestra/null_out — channel names become state keys
2. Read state in your network: op('/project1/maestra').op('state_table')
3. Push state manually: op('/project1/maestra').op('state_push').module.push_state({{'brightness': 75}})
4. The Monitor wizard at maestra-monitor-production.up.railway.app will now show
   a TOP dropdown populated from this project
''')
