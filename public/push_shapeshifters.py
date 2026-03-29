# push_shapeshifters.py v2 — synchronous (no threading)
# Run once in TD Textport:
#   import urllib.request; exec(urllib.request.urlopen('https://maestra-monitor-production.up.railway.app/push_shapeshifters.py').read().decode())

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
    print('[Shapeshifters] Entity: ' + str(e)[:80])

# 2. Create relay as Execute DAT — synchronous, no threading
EXEC_SCRIPT = '''import urllib.request, os

BACKEND = "''' + BACKEND + '''"
ENTITY = "''' + ENTITY + '''"
SOURCE = "''' + SOURCE_TOP + '''"
_counter = 0

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
        with open(path, "rb") as f:
            data = f.read()
        if len(data) < 100:
            return
        req = urllib.request.Request(
            BACKEND + "/video/frame/" + ENTITY,
            data=data,
            method="POST",
            headers={"Content-Type": "image/jpeg"})
        urllib.request.urlopen(req, timeout=3)
    except Exception as e:
        if _counter % 64 == 0:
            print("[Shapeshifters] " + str(e)[:60])
'''

root = op('/project1')

# Remove old one if exists
old = op('/project1/shapeshifters_exec')
if old:
    old.destroy()
    print('[Shapeshifters] Removed old exec')

exec_op = root.create(executeDAT, 'shapeshifters_exec')
exec_op.text = EXEC_SCRIPT
exec_op.par.framestart = True
exec_op.par.active = True

print('[Shapeshifters] Relay: ' + SOURCE_TOP + ' -> /video/frame/' + ENTITY)
print('[Shapeshifters] Synchronous upload every 8th frame')
print('[Shapeshifters] DONE — errors will print every 64 frames if still failing')
