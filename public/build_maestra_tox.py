# build_maestra_tox.py  v3.8 — ALL nodes, no filters
# exec(open(r'C:\Users\Krista\Desktop\build_maestra_tox.py').read())

import urllib.request, json, os, re

GALLERY   = 'http://192.168.128.115:8080'
RAILWAY   = 'https://maestra-backend-v2-production.up.railway.app'
DASHBOARD = 'https://maestra-monitor-production.up.railway.app'

_name     = str(project.name) if project.name else 'untitled'
_toe_name = os.path.splitext(_name)[0]
_slug     = re.sub(r'[^a-z0-9]+', '-', _toe_name.lower()).strip('-') or 'td-node'
print('[Maestra] toe=' + _toe_name + '  slug=' + _slug)

# Scan ALL operators at depth 2 only — direct children of /project1
# These are YOUR nodes: videoin, audioin, lfochop, udpin, StreamDiffusionTD etc
def _scan():
    seen, out = set(), []
    try:
        for o in op('/project1').children:
            try:
                p = o.path
                if p not in seen:
                    seen.add(p)
                    out.append(p)
            except: pass
    except Exception as e:
        print('[Maestra] scan err: ' + str(e))
    print('[Maestra] nodes: ' + str(len(out)))
    for p in out: print('  ' + p)
    return out

_nodes = _scan()

# Probe server
def _probe(url):
    for ep in ['/health', '/entities']:
        try:
            with urllib.request.urlopen(url+ep, timeout=3) as r:
                if r.status < 500: return True
        except: pass
    return False

_srv = GALLERY if _probe(GALLERY) else RAILWAY
print('[Maestra] server=' + _srv)

# Register entity
_d = json.dumps({
    'name': _toe_name, 'slug': _slug,
    'metadata': {'toe_name': _toe_name, 'tops': _nodes, 'server': _srv},
    'state':    {'toe_name': _toe_name, 'tops': _nodes, 'server': _srv, 'active': True},
    'tags': ['touchdesigner'],
}).encode()
try:
    _req = urllib.request.Request(_srv+'/entities', data=_d, method='POST',
                                  headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(_req, timeout=10) as _r:
        print('[Maestra] POST OK: ' + str(json.loads(_r.read()).get('id','ok')))
except Exception as _e: print('[Maestra] POST: ' + str(_e)[:80])

# Post ALL nodes to dashboard dropdown
try:
    _d2 = json.dumps({'slug': _slug, 'tops': _nodes}).encode()
    _req2 = urllib.request.Request(DASHBOARD+'/api/tops', data=_d2, method='POST',
                                   headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(_req2, timeout=5) as _r2:
        print('[Maestra] dashboard: ' + str(json.loads(_r2.read()).get('count','?')) + ' nodes cached')
except Exception as _e: print('[Maestra] dashboard: ' + str(_e)[:60])

# Guard .module errors
for _gp in ['/project1/video_relay', '/project1/maestra_poll']:
    _go = op(_gp)
    if _go and hasattr(_go,'text') and 'onTimerPulse' in (_go.text or ''):
        if 'if not op("/project1/maestra")' not in (_go.text or ''):
            _go.text = _go.text.replace('def onTimerPulse(timerOp):',
                'def onTimerPulse(timerOp):\n    if not op("/project1/maestra"): return')
            print('[Maestra] guarded: ' + _gp)

print('[Maestra] READY: ' + _slug + ' — ' + str(len(_nodes)) + ' nodes in dropdown')
