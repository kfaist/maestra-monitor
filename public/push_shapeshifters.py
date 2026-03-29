# push_shapeshifters.py v3 — uses TD Web Client DAT (no urllib in callback)
# Run once in TD Textport:
#   import urllib.request; exec(urllib.request.urlopen('https://maestra-monitor-production.up.railway.app/push_shapeshifters.py').read().decode())

import urllib.request, json

BACKEND = 'https://maestra-backend-v2-production.up.railway.app'
ENTITY = 'KFaist_Shapeshifters'
SOURCE_TOP = 'comp1'

# 1. Register entity (this works from Textport main thread)
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

root = op('/project1')

# 2. Remove old exec if exists
old = op('/project1/shapeshifters_exec')
if old:
    old.destroy()
    print('[Shapeshifters] Removed old shapeshifters_exec')

# 3. Create Web Client DAT for uploading
wc_name = 'shapeshifters_webclient'
wc = op('/project1/' + wc_name)
if not wc:
    wc = root.create(webDAT, wc_name)
    print('[Shapeshifters] Created ' + wc_name)

# 4. Create Execute DAT that saves frame + triggers Web Client
EXEC_SCRIPT = '''import os

ENTITY = "''' + ENTITY + '''"
SOURCE = "''' + SOURCE_TOP + '''"
BACKEND = "''' + BACKEND + '''"
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
        sz = os.path.getsize(path)
        if sz < 100:
            return
        wc = op("/" + project.name + "/shapeshifters_webclient")
        if wc:
            wc.par.url = BACKEND + "/video/frame/" + ENTITY
            wc.par.uploadfilepath = path
            wc.par.method = "POST"
            wc.par.sendsrequest.pulse()
    except Exception as e:
        if _counter % 64 == 0:
            print("[Shapeshifters] " + str(e)[:60])
'''

exec_name = 'shapeshifters_exec'
exec_op = root.create(executeDAT, exec_name)
exec_op.text = EXEC_SCRIPT
exec_op.par.framestart = True
exec_op.par.active = True

print('[Shapeshifters] Relay: ' + SOURCE_TOP + ' -> /video/frame/' + ENTITY)
print('[Shapeshifters] Using Web Client DAT (not urllib)')
print('[Shapeshifters] DONE')
