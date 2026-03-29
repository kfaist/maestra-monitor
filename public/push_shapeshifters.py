# push_shapeshifters.py — Push comp1 video to KFaist_Shapeshifters
# Run once in TD Textport:
#   import urllib.request; exec(urllib.request.urlopen('https://maestra-monitor-production.up.railway.app/push_shapeshifters.py').read().decode())
#
# Creates an Execute DAT that grabs comp1 every few frames and POSTs
# the JPEG to /video/frame/KFaist_Shapeshifters on the Maestra backend.

import urllib.request, json, os

BACKEND = 'https://maestra-backend-v2-production.up.railway.app'
ENTITY = 'KFaist_Shapeshifters'
SOURCE_TOP = 'comp1'

# 1. Register entity
try:
    d = json.dumps({
        'name': ENTITY, 'slug': ENTITY,
        'state': {'active': True, 'server': BACKEND, 'toe_name': str(project.name)},
        'tags': ['touchdesigner'],
    }).encode()
    req = urllib.request.Request(BACKEND + '/entities', data=d, method='POST',
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as r:
        print('[Shapeshifters] Entity registered')
except Exception as e:
    print('[Shapeshifters] Entity: ' + str(e)[:60])

# 2. Create the relay script as an Execute DAT
EXEC_SCRIPT = '''import urllib.request, os, threading

BACKEND = "''' + BACKEND + '''"
ENTITY = "''' + ENTITY + '''"
SOURCE = "''' + SOURCE_TOP + '''"
_counter = 0
_busy = False

def _upload(data):
    global _busy
    try:
        req = urllib.request.Request(
            BACKEND + "/video/frame/" + ENTITY,
            data=data, method="POST",
            headers={"Content-Type": "image/jpeg"})
        urllib.request.urlopen(req, timeout=3)
    except:
        pass
    _busy = False

def onFrameStart(frame):
    global _counter, _busy
    _counter += 1
    if _counter % 4 != 0:
        return
    if _busy:
        return
    src = op("/" + project.name + "/" + SOURCE)
    if not src:
        return
    try:
        path = project.folder + "/._sf_frame.jpg"
        src.save(path)
        with open(path, "rb") as f:
            data = f.read()
        if len(data) < 100:
            return
        _busy = True
        t = threading.Thread(target=_upload, args=(data,), daemon=True)
        t.start()
    except:
        pass
'''

root = op('/project1')
exec_name = 'shapeshifters_exec'
exec_op = op('/project1/' + exec_name)
if not exec_op:
    exec_op = root.create(executeDAT, exec_name)
    print('[Shapeshifters] Created ' + exec_name)

exec_op.text = EXEC_SCRIPT
exec_op.par.framestart = True
exec_op.par.active = True

print('[Shapeshifters] Relay: ' + SOURCE_TOP + ' -> /video/frame/' + ENTITY)
print('[Shapeshifters] Posting every 4th frame via background thread')
print('[Shapeshifters] DONE — slot 3 video should appear within 5 seconds')
