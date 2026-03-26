"""
build_maestra_tox.py  v2 — Maestra COMP builder for TouchDesigner
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Run once from Textport (Alt+T / Option+T):
    exec(open('/path/to/build_maestra_tox.py').read())

What this does
──────────────
1. Auto-detects server (Gallery LAN → Railway fallback)
2. Creates /project1/maestra Base COMP
3. Registers this .toe as a Maestra entity
4. Pushes  { toe_name, tops, server }  every heartbeat
   → Dashboard auto-names your slot + shows TOP dropdown
5. Sets up state_in CHOP, state_table DAT, heartbeat timer

Connecting from the Monitor
────────────────────────────
• Visit  https://maestra-monitor-production.up.railway.app/
• Your slot appears automatically once this script runs
• Click the slot → wizard → reference stage shows your TOPs
• Wire a CHOP into  /project1/maestra/state_in
  Channel names become published signals automatically

Filepath OUT (manual path mode)
────────────────────────────────
• In the Monitor wizard reference stage, type a TD operator path
  e.g.  project1/my_out_top   or   project1/audio_analysis
• That path is stored on the slot and shown in routing panel
"""

import urllib.request, urllib.parse, json, os, time, re, sys

# ── Config ──────────────────────────────────────────────────────────────────
RAILWAY_URL  = 'https://maestra-backend-v2-production.up.railway.app'
GALLERY_URL  = 'http://192.168.128.115:8080'
HEARTBEAT_S  = 5      # push state every N seconds
MAX_TOPS     = 40     # max TOPs to list

# ── Helpers ─────────────────────────────────────────────────────────────────
def make_slug(name):
    s = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return s or 'td-node'

def probe(url):
    for path in ['/health', '/entities']:
        try:
            with urllib.request.urlopen(url + path, timeout=2) as r:
                if r.status < 400: return True
        except: pass
    return False

def http(url, data=None, method='GET'):
    req = urllib.request.Request(
        url, data=json.dumps(data).encode() if data else None,
        method=method,
        headers={'Content-Type': 'application/json'} if data else {}
    )
    try:
        with urllib.request.urlopen(req, timeout=6) as r:
            return json.loads(r.read())
    except Exception as e:
        return {'error': str(e)}

# ── Collect project metadata ─────────────────────────────────────────────────
TOE_PATH   = project.path or ''
TOE_NAME   = os.path.splitext(os.path.basename(TOE_PATH))[0] if TOE_PATH else project.name or 'unnamed'
SLUG       = make_slug(TOE_NAME)

def collect_tops():
    result = []
    for t in root.findChildren(type=topCOMP, maxDepth=4):
        try: result.append(t.path)
        except: pass
    return result[:MAX_TOPS]

def collect_chops():
    result = []
    for c in root.findChildren(type=chopCOMP, maxDepth=3):
        try: result.append(c.path)
        except: pass
    return result[:20]

# ── Detect server ────────────────────────────────────────────────────────────
SERVER = GALLERY_URL if probe(GALLERY_URL) else RAILWAY_URL
print(f'[Maestra] Server: {SERVER}')
print(f'[Maestra] Entity: {SLUG}  ({TOE_NAME})')

# ── Create /project1/maestra COMP ───────────────────────────────────────────
parent  = op('/project1')
maestra = parent.op('maestra') or parent.create(baseCOMP, 'maestra')
print(f'[Maestra] COMP: {maestra.path}')

def get_or_create(parent_op, op_type, name):
    return parent_op.op(name) or parent_op.create(op_type, name)

# Internal operators
state_table = get_or_create(maestra, tableDAT,  'state_table')
state_chop  = get_or_create(maestra, nullCHOP,  'state_chop')
state_in    = get_or_create(maestra, nullCHOP,  'state_in')
hb_timer    = get_or_create(maestra, timerCHOP, 'heartbeat_timer')
hb_timer.par.period     = HEARTBEAT_S
hb_timer.par.outseconds = True

# ── Custom parameters ────────────────────────────────────────────────────────
try:
    cp = maestra.appendCustomPage('Connection')
    pars = {
        'Serverurl':   ('Server URL',  SERVER,  'appendStr'),
        'Entityslug':  ('Entity Slug', SLUG,    'appendStr'),
        'Toename':     ('TOE Name',    TOE_NAME,'appendStr'),
        'Connected':   ('Connected',   False,   'appendToggle'),
    }
    for key, (label, default, method) in pars.items():
        if not hasattr(maestra.par, key):
            getattr(cp, method)(key, label=label)
    maestra.par.Serverurl.val  = SERVER
    maestra.par.Entityslug.val = SLUG
    maestra.par.Toename.val    = TOE_NAME
except Exception as e:
    print(f'[Maestra] Custom pars warning: {e}')

# ── Register entity ──────────────────────────────────────────────────────────
TOPS  = collect_tops()
CHOPS = collect_chops()

reg_payload = {
    'name':  TOE_NAME,
    'slug':  SLUG,
    'state': {
        'toe_name': TOE_NAME,
        'tops':     TOPS,
        'chops':    CHOPS,
        'server':   SERVER,
        'active':   True,
        'registered_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    },
    'tags': ['touchdesigner'],
}

resp = http(SERVER + '/entities', reg_payload, 'POST')
entity_id = resp.get('id') or resp.get('entity_id') or SLUG
print(f'[Maestra] Registered: {entity_id}')
maestra.par.Connected.val = True

# Seed state_table
state_table.clear()
state_table.appendRow(['key', 'value'])
state_table.appendRow(['toe_name', TOE_NAME])
state_table.appendRow(['entity_id', entity_id])
state_table.appendRow(['server', SERVER])
state_table.appendRow(['tops_count', str(len(TOPS))])

# ── Heartbeat DAT — pushes toe_name+tops every tick ─────────────────────────
hb_dat = get_or_create(maestra, textDAT, 'heartbeat_dat')
hb_dat.text = '''
import urllib.request, json, time, os, re

def make_slug(name):
    import re
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "td-node"

def http_patch(url, data):
    req = urllib.request.Request(
        url, data=json.dumps(data).encode(), method="PATCH",
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=4): pass
    except: pass

def collect_tops():
    tops = []
    for t in root.findChildren(type=topCOMP, maxDepth=4):
        try: tops.append(t.path)
        except: pass
    return tops[:40]

def onTimerPulse(timerOp):
    server = op("maestra").par.Serverurl.val
    slug   = op("maestra").par.Entityslug.val
    name   = op("maestra").par.Toename.val
    tops   = collect_tops()
    # Push state — dashboard reads toe_name+tops to auto-name slot + populate dropdown
    http_patch(server + "/entities/" + slug + "/state", {
        "state": {
            "toe_name": name,
            "tops":     tops,
            "active":   True,
            "ts":       time.time(),
        }
    })
'''

print(f'[Maestra] Heartbeat DAT ready — pushing every {HEARTBEAT_S}s')

# ── Done ─────────────────────────────────────────────────────────────────────
print(f"""
┌─────────────────────────────────────────────────────┐
│  Maestra COMP ready at /project1/maestra            │
│                                                     │
│  TOE :  {TOE_NAME:<43} │
│  Slug:  {SLUG:<43} │
│  TOPs:  {len(TOPS):<43} │
│  Server:{SERVER[:43]:<43} │
└─────────────────────────────────────────────────────┘

Dashboard → slot auto-named "{TOE_NAME}" with TOP dropdown.

To publish signals:
  Wire any CHOP → /project1/maestra/state_in
  Channel names become published signals automatically.

To receive signals (prompt_text, lighting.scene, etc.):
  Read from /project1/maestra/state_table  (DAT)
  or  /project1/maestra/state_chop  (CHOP)

Manual path:
  In Monitor wizard reference step, type any operator path.
  e.g.  project1/out1   or   project1/audio/rms
""")
