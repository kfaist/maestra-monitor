# push_shapeshifters.py v5 — pushes to monitor /api/frame/ proxy (not backend)
# Run once in TD Textport:
#   import urllib.request; exec(urllib.request.urlopen('https://maestra-monitor-production.up.railway.app/push_shapeshifters.py').read().decode())

import urllib.request, json

MONITOR = 'https://maestra-monitor-production.up.railway.app'
BACKEND = 'https://maestra-backend-v2-production.up.railway.app'
ENTITY = 'KFaist_Shapeshifters'
SOURCE_TOP = 'comp1'

# 1. Register entity on Maestra backend
try:
    d = json.dumps({
        'name': ENTITY, 'slug': ENTITY,
        'state': {'active': True, 'server': BACKEND, 'toe_name': str(project.name)},
        'tags': ['touchdesigner'],
    }).encode()
    req = urllib.request.Request(BACKEND + '/entities', data=d, method='POST',
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as r:
        print('[Shapeshifters] Entity registered on backend')
except Exception as e:
    print('[Shapeshifters] Entity: ' + str(e)[:80])

root = op('/project1')

# 2. Remove old exec if exists
old = op('/project1/shapeshifters_exec')
if old:
    old.destroy()
    print('[Shapeshifters] Removed old shapeshifters_exec')

# 3. Create Execute DAT — saves frame, defers upload via run() to main thread
# Target: MONITOR /api/frame/ proxy (in-memory buffer on Railway)
EXEC_SCRIPT = '''import os

MONITOR = "''' + MONITOR + '''"
ENTITY = "''' + ENTITY + '''"
SOURCE = "''' + SOURCE_TOP + '''"
_counter = 0

def _do_upload():
    import urllib.request
    try:
        path = project.folder + "/._sf_frame.jpg"
        with open(path, "rb") as f:
            data = f.read()
        if len(data) < 100:
            return
        req = urllib.request.Request(
            MONITOR + "/api/frame/" + ENTITY,
            data=data,
            method="POST",
            headers={"Content-Type": "image/jpeg"})
        urllib.request.urlopen(req, timeout=3)
    except:
        pass

def onFrameStart(frame):
    global _counter
    _counter += 1
    if _counter % 8 != 0:
        return
    try:
        src = op("/" + project.name + "/" + SOURCE)
        if not src:
            return
        path = project.folder + "/._sf_frame.jpg"
        src.save(path)
        if os.path.getsize(path) < 100:
            return
        run("op('" + me.path + "').module._do_upload()", delayFrames=1)
    except:
        pass
'''

exec_op = root.create(executeDAT, 'shapeshifters_exec')
exec_op.text = EXEC_SCRIPT
exec_op.par.framestart = True
exec_op.par.active = True

print('[Shapeshifters] Relay: ' + SOURCE_TOP + ' -> ' + MONITOR + '/api/frame/' + ENTITY)
print('[Shapeshifters] Upload deferred to main thread via run()')
print('[Shapeshifters] DONE')
