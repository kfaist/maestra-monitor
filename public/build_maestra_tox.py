# build_maestra_tox.py  v3.0 — Maestra Entity Registration + Auto-Rescan
# Run from TD Textport:
#   exec(open(r'C:\Users\Krista\Desktop\build_maestra_tox.py').read())
# Or add to your startup script for auto-registration on load.

import urllib.request, json, os, re, time

GALLERY_URL = 'http://192.168.128.115:8080'
RAILWAY_URL = 'https://maestra-backend-v2-production.up.railway.app'
MAX_DEPTH   = 5
RESCAN_SECS = 60   # how often the timer re-scans for new TOPs

# Derive names from TOE path
toe_path   = str(project.path) if project.path else ''
TOE_NAME   = os.path.splitext(os.path.basename(toe_path))[0] if toe_path else project.name
ENTITY_SLUG = re.sub(r'[^a-z0-9]+', '-', TOE_NAME.lower()).strip('-') or 'td-node'
print('[Maestra] TOE: ' + TOE_NAME + '  slug: ' + ENTITY_SLUG)

# Scan all TOPs in project
def scan_tops():
    tops, seen = [], set()
    for t in root.findChildren(type=topCOMP, maxDepth=MAX_DEPTH):
        try:
            p = t.path
            if p not in seen:
                seen.add(p)
                tops.append(p)
        except Exception:
            pass
    priority = [t for t in tops if any(k in t.lower() for k in ['out','render','final','display','stream'])]
    rest     = [t for t in tops if t not in priority]
    return (priority + rest)[:30]

TOPS = scan_tops()
print('[Maestra] Found ' + str(len(TOPS)) + ' TOPs: ' + str(TOPS[:3]))

# Probe server — gallery first, fallback to Railway
def probe(url, timeout=3):
    for ep in ['/health', '/entities']:
        try:
            with urllib.request.urlopen(url + ep, timeout=timeout) as r:
                if r.status < 500:
                    return True
        except Exception:
            pass
    return False

print('[Maestra] Probing gallery...')
SERVER_URL = GALLERY_URL if probe(GALLERY_URL) else RAILWAY_URL
print('[Maestra] Using: ' + SERVER_URL)

# Create or find /project1/maestra COMP
parent  = op('/project1')
maestra = parent.op('maestra') or parent.create(baseCOMP, 'maestra')
print('[Maestra] COMP: ' + maestra.path)

# Custom parameters
try:
    pg = maestra.appendCustomPage('Maestra')
except Exception:
    pg = None

for par_name, par_type, val in [
    ('Entityslug', 'Str', ENTITY_SLUG),
    ('Serverurl',  'Str', SERVER_URL),
    ('Connected',  'Toggle', False),
    ('Autoconnect','Toggle', True),
]:
    try:
        if not hasattr(maestra.par, par_name) and pg:
            getattr(pg, 'append' + par_type)(par_name, label=par_name)
        getattr(maestra.par, par_name).val = val
    except Exception:
        pass

# State table
state_table = maestra.op('state_table') or maestra.create(tableDAT, 'state_table')
state_table.clear()
state_table.appendRow(['key', 'value'])

# Register entity on server
def register(tops_list):
    payload = json.dumps({
        'name':     TOE_NAME,
        'slug':     ENTITY_SLUG,
        'metadata': { 'toe_name': TOE_NAME, 'tops': tops_list, 'server': SERVER_URL },
        'state':    { 'toe_name': TOE_NAME, 'tops': tops_list, 'server': SERVER_URL, 'active': True },
        'tags':     ['touchdesigner'],
    }).encode('utf-8')
    for method, url in [('POST', SERVER_URL + '/entities'),
                         ('PATCH', SERVER_URL + '/entities/' + ENTITY_SLUG)]:
        try:
            req = urllib.request.Request(url, data=payload, method=method,
                                          headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=10) as r:
                resp = json.loads(r.read())
                eid  = resp.get('id') or resp.get('entity_id') or 'ok'
                print('[Maestra] Registered (' + method + '): ' + str(eid))
                try: maestra.par.Connected.val = True
                except Exception: pass
                state_table.clear()
                state_table.appendRow(['key', 'value'])
                for k, v in [('toe_name', TOE_NAME), ('server', SERVER_URL),
                               ('tops_count', str(len(tops_list))), ('entity_id', str(eid))]:
                    state_table.appendRow([k, v])
                for i, t in enumerate(tops_list[:10]):
                    state_table.appendRow(['top_' + str(i), t])
                return str(eid)
        except Exception as e:
            print('[Maestra] ' + method + ' failed: ' + str(e)[:80])
    return None

register(TOPS)

# Auto-rescan timer callback DAT
hb_cb = maestra.op('heartbeat_cb') or maestra.create(textDAT, 'heartbeat_cb')
hb_cb.text = (
    'import time\n'
    'def onTimerPulse(timerOp):\n'
    '    import urllib.request, json, time\n'
    '    m = op("/project1/maestra")\n'
    '    if not m: return\n'
    '    # Re-scan TOPs — auto-updates dashboard dropdown\n'
    '    try:\n'
    '        tops = [t.path for t in root.findChildren(type=topCOMP, maxDepth=5)][:30]\n'
    '        st = m.op("state_table")\n'
    '        prev = st.col("value")[1] if st and st.numRows > 1 else ""\n'
    '        if str(tops) != str(prev):\n'
    '            slug = m.par.Entityslug.val\n'
    '            url  = m.par.Serverurl.val\n'
    '            d    = json.dumps({"state": {"tops": tops, "toe_name": slug, "active": True}}).encode()\n'
    '            req  = urllib.request.Request(url + "/entities/" + slug + "/state",\n'
    '                       data=d, method="PATCH", headers={"Content-Type": "application/json"})\n'
    '            urllib.request.urlopen(req, timeout=5)\n'
    '            print("[Maestra] TOPs updated: " + str(len(tops)))\n'
    '    except Exception as e:\n'
    '        print("[Maestra] rescan error: " + str(e)[:60])\n'
    '    # Heartbeat\n'
    '    try:\n'
    '        slug = m.par.Entityslug.val\n'
    '        url  = m.par.Serverurl.val\n'
    '        d    = json.dumps({"ts": time.time()}).encode()\n'
    '        req  = urllib.request.Request(url + "/entities/" + slug + "/heartbeat",\n'
    '                   data=d, method="POST", headers={"Content-Type": "application/json"})\n'
    '        urllib.request.urlopen(req, timeout=3)\n'
    '    except Exception:\n'
    '        pass\n'
)

# Timer CHOP
timer = maestra.op('heartbeat_timer') or maestra.create(timerCHOP, 'heartbeat_timer')
timer.par.period     = RESCAN_SECS
timer.par.outseconds = True
timer.par.active     = True
try:
    timer.par.callbacks.val = hb_cb.path
except Exception:
    pass

# State push helper
sp = maestra.op('state_push') or maestra.create(textDAT, 'state_push')
sp.text = (
    '# Push state: op("/project1/maestra").op("state_push").module.push({"key": "val"})\n'
    'import urllib.request, json\n\n'
    'def push(state_dict):\n'
    '    m = op("/project1/maestra")\n'
    '    if not m: return\n'
    '    d   = json.dumps({"state": state_dict}).encode()\n'
    '    req = urllib.request.Request(\n'
    '        m.par.Serverurl.val + "/entities/" + m.par.Entityslug.val + "/state",\n'
    '        data=d, method="PATCH", headers={"Content-Type": "application/json"})\n'
    '    try: urllib.request.urlopen(req, timeout=5)\n'
    '    except Exception as e: print("[state_push] " + str(e))\n'
)

print('')
print('[Maestra] READY: ' + ENTITY_SLUG + ' @ ' + SERVER_URL)
print('[Maestra] ' + str(len(TOPS)) + ' TOPs registered')
print('[Maestra] Auto-rescan every ' + str(RESCAN_SECS) + 's — new TOPs appear in dashboard automatically')
print('[Maestra] Push state: op("/project1/maestra").op("state_push").module.push({"key": "val"})')
