# build_receiver_tox.py — Creates maestra_receiver.tox
# Run in TD Textport:
#   import urllib.request; exec(urllib.request.urlopen('https://maestra-monitor-production.up.railway.app/build_receiver_tox.py').read().decode())
#
# Creates /project1/maestra_receiver COMP with:
#   Custom pars: Entityid, Serverurl, Pollframes, Active
#   Internal ops: poll_exec, log_table, level_out
#   Exports to Desktop as maestra_receiver.tox

import os

root = op('/project1')

# Clean up old version
old = op('/project1/maestra_receiver')
if old:
    old.destroy()
    print('[TOX] Removed old maestra_receiver')

# 1. Create container COMP
comp = root.create(baseCOMP, 'maestra_receiver')
print('[TOX] Created /project1/maestra_receiver')

# 2. Add custom parameters
page = comp.appendCustomPage('Maestra')
page.appendStr('Entityid', label='Entity ID')[0].default = 'KFaist_Shapeshifters'
page.appendStr('Serverurl', label='Server URL')[0].default = 'https://maestra-backend-v2-production.up.railway.app'
page.appendInt('Pollframes', label='Poll Every N Frames')[0].default = 60
page.appendToggle('Active', label='Active')[0].default = True

# Set initial values
comp.par.Entityid = 'KFaist_Shapeshifters'
comp.par.Serverurl = 'https://maestra-backend-v2-production.up.railway.app'
comp.par.Pollframes = 60
comp.par.Active = True

print('[TOX] Custom parameters added: Entityid, Serverurl, Pollframes, Active')

# 3. Create log table inside COMP
log_dat = comp.create(tableDAT, 'log_table')
log_dat.appendRow(['timestamp', 'key', 'value', 'changed'])
print('[TOX] Created log_table')

# 4. Create Level TOP for visual output
level_top = comp.create(levelTOP, 'level_out')
level_top.par.opacity = 1.0

# Create an In TOP so the COMP can receive input
in_top = comp.create(inTOP, 'in1')
level_top.inputConnectors[0].connect(in_top)

# Create an Out TOP so the COMP outputs the processed signal
out_top = comp.create(outTOP, 'out1')
out_top.inputConnectors[0].connect(level_top)

print('[TOX] Created in1 -> level_out -> out1')

# 5. Create the polling Execute DAT
EXEC_SCRIPT = '''import json

# Read config from parent COMP custom parameters
def _cfg():
    p = me.parent()
    return {
        'server': str(p.par.Serverurl.eval()),
        'entity': str(p.par.Entityid.eval()),
        'poll': int(p.par.Pollframes.eval()),
        'active': bool(p.par.Active.eval()),
    }

_counter = 0
_prev_state = {}
_last_fetch = 0
_last_error = ""
_fetch_count = 0
_success_count = 0

def _do_poll():
    import urllib.request, json, time
    global _prev_state, _last_fetch, _last_error, _fetch_count, _success_count

    cfg = _cfg()
    if not cfg['active']:
        return

    _fetch_count += 1
    try:
        url = cfg['server'] + "/entities"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as r:
            entities = json.loads(r.read().decode())

        norm = lambda s: s.replace(" ", "_").replace("__", "_").lower()
        target = norm(cfg['entity'])
        matches = [e for e in entities
                   if norm(str(e.get("slug", ""))) == target
                   or norm(str(e.get("name", ""))) == target]
        if matches:
            match = sorted(matches, key=lambda e: str(e.get("created_at", "")))[-1]
        else:
            match = None

        if not match:
            _last_error = "Entity not found: " + cfg['entity']
            if _fetch_count % 10 == 1:
                print("[maestra_receiver] " + _last_error)
            return

        state = match.get("state", {}) or {}
        _last_fetch = time.time()
        _success_count += 1

        log = me.parent().op('log_table')
        level = me.parent().op('level_out')
        t = time.strftime("%H:%M:%S")

        for key, value in state.items():
            if key.startswith("_"):
                continue
            prev_val = _prev_state.get(key)
            changed = prev_val != value
            if changed and log:
                log.appendRow([t, str(key), str(value)[:60], "YES" if prev_val is not None else "NEW"])
                while log.numRows > 200:
                    log.deleteRow(1)

            # Map known keys to Level TOP
            if key == "test_value" and level:
                try:
                    v = max(0.0, min(1.0, float(value)))
                    level.par.opacity = v
                    if changed:
                        print("[maestra_receiver] " + cfg['entity'] + " test_value -> opacity: " + str(v))
                except:
                    pass

            if key == "brightness" and level:
                try:
                    v = float(value) / 100.0
                    level.par.brightness1 = v
                    if changed:
                        print("[maestra_receiver] " + cfg['entity'] + " brightness -> brightness1: " + str(v))
                except:
                    pass

        if state != _prev_state:
            keys = list(state.keys())
            print("[maestra_receiver] " + cfg['entity'] + " state: " + str(len(keys)) + " keys")

        _prev_state = dict(state)
        _last_error = ""

    except Exception as e:
        _last_error = str(e)[:80]
        if _fetch_count % 10 == 1:
            print("[maestra_receiver] fetch error: " + _last_error)

def onFrameStart(frame):
    global _counter
    cfg = _cfg()
    if not cfg['active']:
        return
    _counter += 1
    if _counter % cfg['poll'] != 0:
        return
    run("op('" + me.path + "').module._do_poll()", delayFrames=1)

    # Diagnostics every 5 min
    if _counter % 18000 == 0:
        import time
        age = time.time() - _last_fetch if _last_fetch > 0 else -1
        print("[maestra_receiver] --- diagnostics ---")
        print("  entity: " + cfg['entity'])
        print("  server: " + cfg['server'])
        print("  fetches: " + str(_fetch_count) + " ok: " + str(_success_count))
        print("  last_fetch: " + (str(round(age, 1)) + "s ago" if age >= 0 else "never"))
        print("  state_keys: " + str(list(_prev_state.keys())))
'''

exec_op = comp.create(executeDAT, 'poll_exec')
exec_op.text = EXEC_SCRIPT
exec_op.par.framestart = True
exec_op.par.active = True
print('[TOX] Created poll_exec (polling engine)')

# 6. Add a README text DAT
readme = comp.create(textDAT, 'README')
readme.text = '''MAESTRA RECEIVER TOX
====================
Drop this COMP into any TouchDesigner project.
It polls the Maestra backend for your entity's state
and applies values to internal operators.

SETUP:
1. Set Entityid to your entity slug (e.g. KFaist_Shapeshifters)
2. Set Serverurl to your Maestra backend URL
3. Wire your visual source into the In TOP
4. Wire the Out TOP to your render chain
5. Toggle Active to start receiving

STATE KEYS:
- test_value (0-1) -> Level TOP opacity
- brightness (0-100) -> Level TOP brightness
- All keys logged to log_table

CUSTOM MAPPINGS:
Edit poll_exec to map additional state keys
to any TD parameter. Look for the section:
  # Map known keys to Level TOP

Add your own like:
  if key == "my_key" and some_op:
      some_op.par.whatever = float(value)

LICENSE: AGPL-3.0
AUTHOR: Krista Faist / kristabluedoor@gmail.com
FRAMEWORK: Built on Jordan Snyder's Maestra
'''
print('[TOX] Created README')

# 7. Export as .tox
tox_path = project.folder + '/maestra_receiver.tox'
desktop_path = 'C:/Users/krista-showputer/Desktop/maestra_receiver.tox'

comp.save(tox_path)
print('[TOX] Saved to project folder: ' + tox_path)

try:
    comp.save(desktop_path)
    print('[TOX] Saved to Desktop: ' + desktop_path)
except:
    print('[TOX] Could not save to Desktop (path may differ)')

print('')
print('[TOX] === DONE ===')
print('[TOX] maestra_receiver.tox is ready to distribute')
print('[TOX] Another artist drops it in, sets Entityid, wires In/Out TOPs, done')
print('[TOX] Current config: entity=' + str(comp.par.Entityid) + ' server=' + str(comp.par.Serverurl))
