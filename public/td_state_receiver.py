# td_state_receiver.py — Polls Maestra backend for entity state, applies to TD
# Run once in TD Textport:
#   import urllib.request; exec(urllib.request.urlopen('https://maestra-monitor-production.up.railway.app/td_state_receiver.py').read().decode())
#
# Creates:
#   /project1/state_receiver_exec  — Execute DAT, triggers poll every 60 frames (~1s)
#   /project1/state_receiver_log   — Table DAT, logs every incoming key/value
#   /project1/state_receiver_level — Level TOP on comp2 output, controlled by test_value

import urllib.request, json

BACKEND = 'https://maestra-backend-v2-production.up.railway.app'
ENTITY_SLUG = 'KFaist_Shapeshifters'

root = op('/project1')

# 1. Clean up old instances
for name in ['state_receiver_exec', 'state_receiver_log', 'state_receiver_level']:
    old = op('/project1/' + name)
    if old:
        old.destroy()
        print('[Receiver] Removed old ' + name)

# 2. Create log table
log_dat = root.create(tableDAT, 'state_receiver_log')
log_dat.appendRow(['timestamp', 'key', 'value', 'changed'])
print('[Receiver] Created state_receiver_log')

# 3. Create Level TOP on comp2 output (test_value controls opacity)
level_top = root.create(levelTOP, 'state_receiver_level')
level_top.par.opacity = 1.0
# Wire comp2 into level
comp2 = op('/project1/comp2')
if comp2:
    level_top.inputConnectors[0].connect(comp2)
    print('[Receiver] Wired comp2 -> state_receiver_level')
else:
    print('[Receiver] WARNING: comp2 not found, level TOP unwired')

# 4. Create Execute DAT with polling logic
EXEC_SCRIPT = '''import json

BACKEND = "''' + BACKEND + '''"
ENTITY_SLUG = "''' + ENTITY_SLUG + '''"
_counter = 0
_prev_state = {}
_last_fetch = 0
_last_error = ""
_fetch_count = 0
_success_count = 0

def _do_poll():
    import urllib.request, json, time
    global _prev_state, _last_fetch, _last_error, _fetch_count, _success_count
    _fetch_count += 1
    try:
        url = BACKEND + "/entities"
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as r:
            entities = json.loads(r.read().decode())

        # Find our entity by slug (normalize spaces/underscores)
        norm = lambda s: s.replace(" ", "_").replace("__", "_").lower()
        target = norm(ENTITY_SLUG)
        match = None
        for e in entities:
            if norm(str(e.get("slug", ""))) == target or norm(str(e.get("name", ""))) == target:
                match = e
                break

        if not match:
            _last_error = "Entity not found: " + ENTITY_SLUG
            if _fetch_count % 10 == 1:
                print("[Receiver] " + _last_error)
            return

        state = match.get("state", {}) or {}
        _last_fetch = time.time()
        _success_count += 1

        # Log table
        log = op("/project1/state_receiver_log")
        level = op("/project1/state_receiver_level")
        t = time.strftime("%H:%M:%S")

        for key, value in state.items():
            if key.startswith("_"):
                continue
            prev_val = _prev_state.get(key)
            changed = prev_val != value
            if changed and log:
                log.appendRow([t, str(key), str(value)[:60], "YES" if prev_val is not None else "NEW"])
                # Keep log manageable
                while log.numRows > 100:
                    log.deleteRow(1)

            # Map test_value to Level TOP opacity (0.0 - 1.0)
            if key == "test_value" and level:
                try:
                    v = float(value)
                    # Clamp to 0-1
                    v = max(0.0, min(1.0, v))
                    level.par.opacity = v
                    if changed:
                        print("[Receiver] test_value -> opacity: " + str(v))
                except:
                    pass

            # Map brightness to Level TOP brightness
            if key == "brightness" and level:
                try:
                    v = float(value) / 100.0  # 0-100 -> 0-1
                    level.par.brightness1 = v
                    if changed:
                        print("[Receiver] brightness -> brightness1: " + str(v))
                except:
                    pass

        if state != _prev_state:
            keys = list(state.keys())
            print("[Receiver] State updated: " + str(len(keys)) + " keys: " + ", ".join(keys[:5]))

        _prev_state = dict(state)
        _last_error = ""

    except Exception as e:
        _last_error = str(e)[:80]
        if _fetch_count % 10 == 1:
            print("[Receiver] Fetch error: " + _last_error)

def onFrameStart(frame):
    global _counter
    _counter += 1
    # Poll every 60 frames (~1 second at 60fps)
    if _counter % 60 != 0:
        return
    # Defer to main thread where urllib works
    run("op('" + me.path + "').module._do_poll()", delayFrames=1)

    # Print diagnostics every 5 minutes
    if _counter % 18000 == 0:
        import time
        age = time.time() - _last_fetch if _last_fetch > 0 else -1
        print("[Receiver] Diagnostics:")
        print("  entity: " + ENTITY_SLUG)
        print("  server: " + BACKEND)
        print("  fetches: " + str(_fetch_count) + " ok: " + str(_success_count))
        print("  last_fetch: " + (str(round(age, 1)) + "s ago" if age >= 0 else "never"))
        print("  last_error: " + (_last_error or "none"))
        print("  state_keys: " + str(list(_prev_state.keys())))
'''

exec_op = root.create(executeDAT, 'state_receiver_exec')
exec_op.text = EXEC_SCRIPT
exec_op.par.framestart = True
exec_op.par.active = True

print('[Receiver] Created state_receiver_exec')
print('[Receiver] Polling ' + BACKEND + ' for entity ' + ENTITY_SLUG)
print('[Receiver] test_value (0-1) -> Level TOP opacity')
print('[Receiver] brightness (0-100) -> Level TOP brightness')
print('[Receiver] All state changes logged to state_receiver_log')
print('[Receiver] DONE — check state_receiver_log table for incoming data')
