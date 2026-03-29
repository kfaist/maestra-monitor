# build_maestra_tox.py  v4.2 — ALL nodes + full operator tree
# Run in TD Textport:
#   exec(open(r'C:\Users\krista-showputer\Desktop\build_maestra_tox.py').read())
# Or fetch from URL:
#   import urllib.request; exec(urllib.request.urlopen('https://maestra-monitor-production.up.railway.app/build_maestra_tox.py').read().decode())

import urllib.request, json, os, re

GALLERY   = 'http://192.168.128.115:8080'
RAILWAY   = 'https://maestra-backend-v2-production.up.railway.app'
DASHBOARD = 'https://maestra-monitor-production.up.railway.app'

_name     = str(project.name) if project.name else 'untitled'
_toe_name = os.path.splitext(_name)[0]
_slug     = re.sub(r'[^a-z0-9]+', '-', _toe_name.lower()).strip('-') or 'td-node'
print('[Maestra] toe=' + _toe_name + '  slug=' + _slug)

# Build full tree: { nodeName: ["TYPE:name:path", ...] }
def _build():
    tree = {}
    tops = []
    for child in op('/project1').children:
        try:
            node = child.name
            ops = []
            try:
                t = child.OPType if hasattr(child,'OPType') else type(child).__name__
                ops.append(str(t) + ':' + child.name + ':' + child.path)
            except:
                pass
            try:
                for sub in child.children:
                    try:
                        st = sub.OPType if hasattr(sub,'OPType') else type(sub).__name__
                        ops.append(str(st) + ':' + sub.name + ':' + sub.path)
                    except:
                        pass
            except:
                pass
            try:
                for pg in child.customPages:
                    for p in pg.pars:
                        ops.append('PAR:' + p.name + ':' + child.path + '/' + p.name)
            except:
                pass
            tree[node] = ops
            tops.append(child.path)
            print('[Maestra] ' + node + ': ' + str(len(ops)) + ' ops')
        except Exception as e:
            print('[Maestra] skip ' + str(e)[:40])
    print('[Maestra] ' + str(len(tree)) + ' nodes total')
    return tree, tops

_tree, _tops = _build()

def _probe(url):
    for ep in ['/health', '/entities']:
        try:
            with urllib.request.urlopen(url+ep, timeout=3) as r:
                if r.status < 500: return True
        except: pass
    return False

_srv = GALLERY if _probe(GALLERY) else RAILWAY
print('[Maestra] server=' + _srv)

try:
    _d = json.dumps({
        'name': _toe_name, 'slug': _slug,
        'metadata': {'toe_name': _toe_name, 'server': _srv},
        'state':    {'toe_name': _toe_name, 'server': _srv, 'active': True},
        'tags': ['touchdesigner'],
    }).encode()
    _req = urllib.request.Request(_srv+'/entities', data=_d, method='POST',
                                  headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(_req, timeout=10) as _r:
        print('[Maestra] entity registered')
except Exception as _e: print('[Maestra] entity: ' + str(_e)[:80])

try:
    _d2 = json.dumps({'slug': _slug, 'tops': _tops, 'tree': _tree}).encode()
    _req2 = urllib.request.Request(DASHBOARD+'/api/tops', data=_d2, method='POST',
                                   headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(_req2, timeout=5) as _r2:
        print('[Maestra] dashboard: tree sent — ' + str(len(_tree)) + ' nodes')
except Exception as _e: print('[Maestra] dashboard: ' + str(_e)[:60])

print('[Maestra] DONE')
