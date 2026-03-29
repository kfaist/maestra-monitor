# pull_state.py — bidirectional: pulls state from Maestra backend into TD
# Run once in TD Textport:
#   import urllib.request; exec(urllib.request.urlopen('https://maestra-monitor-production.up.railway.app/pull_state.py').read().decode())
#
# Creates a Timer CHOP + Execute DAT that polls the entity's state
# every 2 seconds and writes values into a Table DAT for other ops to read.

import urllib.request, json

BACKEND = 'https://maestra-backend-v2-production.up.railway.app'
ENTITY = 'KFaist_Shapeshifters'

root = op('/project1')

# 1. Remove old components if they exist
for name in ['state_puller', 'state_puller_timer', 'maestra_state']:
    old = op('/project1/' + name)
    if old:
        old.destroy()
        print('[StatePuller] Removed old ' + name)

# 2. Create state table DAT — incoming values land here
state_table = root.create(tableDAT, 'maestra_state')
state_table.clear()
state_table.appendRow(['key', 'value', 'updated_at'])
print('[StatePuller] Created maestra_state table')

# 3. Create the puller script
PULLER_SCRIPT = '''import urllib.request, json, time

BACKEND = "''' + BACKEND + '''"
ENTITY = "''' + ENTITY + '''"
_last_state = {}

def _do_pull():
    global _last_state
    try:
        url = BACKEND + "/entities"
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=4) as r:
            entities = json.loads(r.read().decode())

        # Find our entity
        state = {}
        for e in entities:
            slug = e.get("slug", "")
            if slug == ENTITY or slug == ENTITY.replace("_", " "):
                state = e.get("state", {}) or {}
                break

        if not state:
            return

        # Write changed keys to the state table
        tbl = op("/" + project.name + "/maestra_state")
        if not tbl:
            return

        changed = False
        now = str(int(time.time()))
        for key, value in state.items():
            if key.startswith("_"):
                continue
            str_val = str(value)
            if _last_state.get(key) != str_val:
                _last_state[key] = str_val
                changed = True
                # Find or create row
                found = False
                for row_i in range(1, tbl.numRows):
                    if tbl[row_i, 0].val == key:
                        tbl[row_i, 1] = str_val
                        tbl[row_i, 2] = now
                        found = True
                        break
                if not found:
                    tbl.appendRow([key, str_val, now])

        if changed:
            print("[StatePuller] Updated: " + ", ".join(
                k for k in state if not k.startswith("_") and _last_state.get(k) == str(state[k])
            )[:80])
    except Exception as e:
        pass  # silent — runs every 2s, dont spam

def onFrameStart(frame):
    # Only pull every ~120 frames (~2 seconds at 60fps)
    if frame % 120 == 0:
        run("op(\\'" + me.path + "\\').module._do_pull()", delayFrames=1)
'''

puller = root.create(executeDAT, 'state_puller')
puller.text = PULLER_SCRIPT
puller.par.framestart = True
puller.par.active = True

print('[StatePuller] Pulling from ' + BACKEND + '/entities -> ' + ENTITY)
print('[StatePuller] State lands in /project1/maestra_state (Table DAT)')
print('[StatePuller] Updates every ~2 seconds')
print('[StatePuller] DONE')
print('')
print('[StatePuller] To read state in any op:')
print("  op('maestra_state')['prompt_text', 1]  # get value of 'prompt_text'")
