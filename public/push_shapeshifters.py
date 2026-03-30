# push_shapeshifters.py v9 — auto-detects perform/comp2/comp1, direct upload
# Run in TD Textport:
#   import urllib.request; exec(urllib.request.urlopen('https://maestra-monitor-production.up.railway.app/push_shapeshifters.py').read().decode())

import urllib.request, json

MONITOR = 'https://maestra-monitor-production.up.railway.app'
BACKEND = 'https://maestra-backend-v2-production.up.railway.app'
ENTITY = 'KFaist_Shapeshifters'

# Auto-detect source TOP: prefer perform, then comp2, then comp1
SOURCE_TOP = None
for name in ['perform', 'perform1', 'comp2', 'comp1']:
    t = op('/project1/' + name)
    if t and t.width > 0:
        SOURCE_TOP = name
        break
if not SOURCE_TOP:
    print('[Shapeshifters] ERROR: no perform/comp found')
    raise SystemExit
print('[Shapeshifters] Source: ' + SOURCE_TOP + ' (' + str(op('/project1/' + SOURCE_TOP).width) + 'x' + str(op('/project1/' + SOURCE_TOP).height) + ')')

# Wire receiver level if unwired
level = op('/project1/state_receiver_level')
if level and SOURCE_TOP:
    src = op('/project1/' + SOURCE_TOP)
    if src and (not level.inputs or level.inputs[0] != src):
        level.inputConnectors[0].connect(src)
        print('[Shapeshifters] Wired ' + SOURCE_TOP + ' -> state_receiver_level')

# Register entity
try:
    d = json.dumps({
        'name': ENTITY, 'slug': ENTITY,
        'state': {'active': True, 'server': BACKEND, 'toe_name': str(project.name), 'source_top': SOURCE_TOP},
        'tags': ['touchdesigner'],
    }).encode()
    req = urllib.request.Request(BACKEND + '/entities', data=d, method='POST',
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as r:
        print('[Shapeshifters] Entity registered')
except Exception as e:
    print('[Shapeshifters] Entity: ' + str(e)[:80])

root = op('/project1')
old = op('/project1/shapeshifters_exec')
if old:
    old.destroy()
    print('[Shapeshifters] Removed old')

# Direct upload in onFrameStart — no run() deferral
EXEC_SCRIPT = '''import os, urllib.request

MONITOR = "''' + MONITOR + '''"
ENTITY = "''' + ENTITY + '''"
SOURCE = "''' + SOURCE_TOP + '''"
_counter = 0
_ok = 0
_fail = 0

def onFrameStart(frame):
    global _counter, _ok, _fail
    _counter += 1
    if _counter % 15 != 0:
        return
    try:
        src = op("/" + project.name + "/" + SOURCE)
        if not src:
            return
        path = project.folder + "/._sf_frame.jpg"
        src.save(path)
        if os.path.getsize(path) < 100:
            return
        with open(path, "rb") as f:
            data = f.read()
        req = urllib.request.Request(
            MONITOR + "/api/frame/" + ENTITY,
            data=data,
            method="POST",
            headers={"Content-Type": "image/jpeg"})
        urllib.request.urlopen(req, timeout=4)
        _ok += 1
        if _ok == 1:
            print("[Shapeshifters] First frame: " + str(len(data)) + " bytes")
        if _ok % 100 == 0:
            print("[Shapeshifters] " + str(_ok) + " frames ok")
    except Exception as e:
        _fail += 1
        if _fail <= 3 or _fail % 50 == 0:
            print("[Shapeshifters] err#" + str(_fail) + ": " + str(e)[:60])
'''

exec_op = root.create(executeDAT, 'shapeshifters_exec')
exec_op.text = EXEC_SCRIPT
exec_op.par.framestart = True
exec_op.par.active = True

print('[Shapeshifters] ' + SOURCE_TOP + ' -> ' + MONITOR + '/api/frame/' + ENTITY)
print('[Shapeshifters] Direct upload every 15th frame')
print('[Shapeshifters] DONE')
