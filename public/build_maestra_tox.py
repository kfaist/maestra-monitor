"""
build_maestra_tox.py  v2.0
Run from TD Textport:  exec(open(r'C:\path\to\build_maestra_tox.py').read())
Or from a Text DAT:    right-click → Run Script

What happens:
  1. Scans ALL TOPs in your project (up to depth 5)
  2. Derives entity slug from your .toe filename
  3. Tries gallery server first (192.168.128.115:8080), falls back to Railway
  4. Creates /project1/maestra Base COMP with:
       - Custom pars: Entityslug, Serverurl, Connected
       - state_table DAT (live key/value display)
       - heartbeat_timer CHOP (5s pulse)
       - state_push Text DAT (call push_state() from anywhere)
  5. Registers entity on the server with:
       { toe_name, tops, server, active: true }
     → Dashboard slot auto-names + shows TOP dropdown in wizard
  6. Starts heartbeat loop
"""

import urllib.request, json, os, re, time

# ─── Config ────────────────────────────────────────────────────────────────
GALLERY_URL  = 'http://192.168.128.115:8080'
RAILWAY_URL  = 'https://maestra-backend-v2-production.up.railway.app'
MAX_DEPTH    = 5

# ─── Derive names ──────────────────────────────────────────────────────────
toe_path = str(project.path) if project.path else ''
TOE_NAME = os.path.splitext(os.path.basename(toe_path))[0] if toe_path else project.name
ENTITY_SLUG = re.sub(r'[^a-z0-9]+', '-', TOE_NAME.lower()).strip('-') or 'td-node'

print(f'[Maestra] TOE: {TOE_NAME}  slug: {ENTITY_SLUG}')

# ─── Scan TOPs ─────────────────────────────────────────────────────────────
def scan_tops():
    tops = []
    seen = set()
    for t in root.findChildren(type=topCOMP, maxDepth=MAX_DEPTH):
        try:
            p = t.path
            if p not in seen:
                seen.add(p)
                tops.append(p)
        except Exception:
            pass
    # Sort: prefer output/out/render paths first
    priority = [t for t in tops if any(k in t.lower() for k in ['out','render','final','display','stream'])]
    rest     = [t for t in tops if t not in priority]
    return (priority + rest)[:30]

TOPS = scan_tops()
print(f'[Maestra] Found {len(TOPS)} TOPs')
for t in TOPS[:8]:
    print(f'  {t}')
if len(TOPS) > 8:
    print(f'  ... and {len(TOPS)-8} more')

# ─── Probe server ──────────────────────────────────────────────────────────
def probe(url, timeout=3):
    for endpoint in ['/health', '/entities']:
        try:
            with urllib.request.urlopen(url + endpoint, timeout=timeout) as r:
                if r.status < 500:
                    return True
        except Exception:
            pass
    return False

print('[Maestra] Probing gallery server...')
SERVER_URL = GALLERY_URL if probe(GALLERY_URL) else RAILWAY_URL
print(f'[Maestra] Using: {SERVER_URL}')

# ─── Create/find /project1/maestra COMP ────────────────────────────────────
parent  = op('/project1')
maestra = parent.op('maestra')
if not maestra:
    maestra = parent.create(baseCOMP, 'maestra')
    print('[Maestra] Created /project1/maestra')
else:
    print('[Maestra] Found existing /project1/maestra')

# ─── Custom parameters ─────────────────────────────────────────────────────
try:
    pg = maestra.appendCustomPage('Maestra')
    for par_name, par_type, label, default in [
        ('Entityslug',  'Str',    'Entity Slug',  ENTITY_SLUG),
        ('Serverurl',   'Str',    'Server URL',   SERVER_URL),
        ('Connected',   'Toggle', 'Connected',    False),
        ('Autoconnect', 'Toggle', 'Auto Connect', True),
    ]:
        if not hasattr(maestra.par, par_name):
            getattr(pg, f'append{par_type}')(par_name, label=label)
        getattr(maestra.par, par_name).val = default
except Exception as e:
    # Pars may already exist
    try:
        maestra.par.Entityslug.val  = ENTITY_SLUG
        maestra.par.Serverurl.val   = SERVER_URL
        maestra.par.Autoconnect.val = True
    except Exception:
        pass

# ─── Internal operators ─────────────────────────────────────────────────────
def ensure(parent_op, op_type, name):
    o = parent_op.op(name)
    if not o:
        o = parent_op.create(op_type, name)
    return o

state_table = ensure(maestra, tableDAT, 'state_table')
state_table.clear()
state_table.appendRow(['key', 'value'])

ensure(maestra, tableDAT, 'log')
timer = ensure(maestra, timerCHOP, 'heartbeat_timer')
timer.par.period      = 5
timer.par.outseconds  = True
timer.par.active      = True

# ─── Register entity + push tops ───────────────────────────────────────────
def register():
    payload = json.dumps({
        'name':          TOE_NAME,
        'slug':          ENTITY_SLUG,
        'entity_type_id': 'default',
        'state': {
            'toe_name':  TOE_NAME,
            'tops':      TOPS,
            'server':    SERVER_URL,
            'active':    True,
        },
        'metadata': {
            'toe_name':  TOE_NAME,
            'tops':      TOPS,
            'server':    SERVER_URL,
            'tool':      'build_maestra_tox.py v2.0',
        },
        'tags': ['touchdesigner'],
    }).encode('utf-8')

    req = urllib.request.Request(
        SERVER_URL + '/entities',
        data=payload, method='POST',
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            resp = json.loads(r.read().decode('utf-8'))
            eid  = resp.get('id') or resp.get('entity_id') or 'ok'
            print(f'[Maestra] Registered → entity_id: {eid}')
            maestra.par.Connected.val = True
            # Update state_table
            state_table.clear()
            state_table.appendRow(['key', 'value'])
            state_table.appendRow(['toe_name', TOE_NAME])
            state_table.appendRow(['entity_id', str(eid)])
            state_table.appendRow(['server', SERVER_URL])
            state_table.appendRow(['tops_count', str(len(TOPS))])
            for i, t in enumerate(TOPS[:10]):
                state_table.appendRow([f'top_{i}', t])
            return eid
    except Exception as e:
        # Try PATCH if POST fails (entity already exists)
        try:
            patch_payload = json.dumps({
                'state': {
                    'toe_name': TOE_NAME,
                    'tops':     TOPS,
                    'server':   SERVER_URL,
                    'active':   True,
                }
            }).encode('utf-8')
            req2 = urllib.request.Request(
                f'{SERVER_URL}/entities/{ENTITY_SLUG}/state',
                data=patch_payload, method='PATCH',
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req2, timeout=10) as r2:
                print(f'[Maestra] State updated for existing entity: {ENTITY_SLUG}')
                maestra.par.Connected.val = True
                return ENTITY_SLUG
        except Exception as e2:
            print(f'[Maestra] Registration error: {e2}')
            maestra.par.Connected.val = False
            return None

entity_id = register()

# ─── Heartbeat DAT ─────────────────────────────────────────────────────────
hb = ensure(maestra, textDAT, 'heartbeat_cb')
hb.text = f'''# Heartbeat — fires every 5s via heartbeat_timer
import urllib.request, json, time

def onTimerPulse(timerOp):
    slug = op('/project1/maestra').par.Entityslug.val
    url  = op('/project1/maestra').par.Serverurl.val
    try:
        data = json.dumps({{'slug': slug, 'ts': time.time()}}).encode()
        req  = urllib.request.Request(
            url + '/entities/' + slug + '/heartbeat',
            data=data, method='POST',
            headers={{'Content-Type': 'application/json'}}
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass
'''

# ─── State push helper ──────────────────────────────────────────────────────
sp = ensure(maestra, textDAT, 'state_push')
sp.text = f'''# Push state to Maestra — call from anywhere:
#   op('/project1/maestra').op('state_push').module.push({{'brightness': 75}})
import urllib.request, json

def push(state_dict):
    m    = op('/project1/maestra')
    slug = m.par.Entityslug.val
    url  = m.par.Serverurl.val
    data = json.dumps({{'state': state_dict}}).encode()
    req  = urllib.request.Request(
        url + '/entities/' + slug + '/state',
        data=data, method='PATCH',
        headers={{'Content-Type': 'application/json'}}
    )
    try:
        urllib.request.urlopen(req, timeout=5)
    except Exception as e:
        print(f'[state_push] {{e}}')

# Wire a CHOP to auto-push — channel names become state keys:
#   op('/project1/maestra').op('state_push').module.push({{
#       ch.name: ch[0] for ch in op('my_chop').chans()
#   }})
'''

# ─── Done ───────────────────────────────────────────────────────────────────
top_preview = ', '.join(TOPS[:3]) + ('...' if len(TOPS) > 3 else '')
print(f'''
╔══════════════════════════════════════════════════════╗
║  /project1/maestra  READY                            ║
╠══════════════════════════════════════════════════════╣
║  Slug:    {ENTITY_SLUG:<44}║
║  Server:  {SERVER_URL[:44]:<44}║
║  TOPs:    {str(len(TOPS)):<44}║
╠══════════════════════════════════════════════════════╣
║  Dashboard will now show:                            ║
║   • Slot auto-named: {TOE_NAME[:33]:<33}║
║   • TOP dropdown in wizard step 4                    ║
╠══════════════════════════════════════════════════════╣
║  To push state from anywhere:                        ║
║  op('/project1/maestra').op('state_push')            ║
║       .module.push({{'brightness': 75}})              ║
╚══════════════════════════════════════════════════════╝
''')
