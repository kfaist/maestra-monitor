import sys

path = r'C:\Users\Krista\maestra-monitor-fix2\src\components\SlotGrid.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# === CHANGE 1: In State Schema section, replace arrow prefixes ===
content = content.replace(
    "<span style={{ color: slotColor, fontSize: 10 }}>\u2191</span>",
    "<span style={{ color: slotColor, fontSize: 10, fontWeight: 700 }}>=</span>"
)
content = content.replace(
    "<span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>\u2193</span>",
    "<span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10, fontWeight: 700 }}>\u2212</span>"
)
# === CHANGE 2: Extract TD State sidecar block ===
sidecar_comment = '{/* \u2500\u2500 Sidecar state chips: prompt_text, visitor_present, per-machine fps \u2500\u2500 */}'
sidecar_start = content.find(sidecar_comment)
if sidecar_start < 0:
    print("ERROR: Could not find sidecar start marker")
    sys.exit(1)

next_section = content.find('{/* \u2500\u2500 Section 2: Signals \u2500\u2500 */}', sidecar_start)
if next_section < 0:
    print("ERROR: Could not find Signals section marker")
    sys.exit(1)

sidecar_block = content[sidecar_start:next_section].rstrip()
print(f"Sidecar block: {len(sidecar_block)} chars")

# Remove sidecar from current position
content = content[:sidecar_start] + content[next_section:]

# === CHANGE 3: Insert sidecar + compact entity bar into preview area ===
badge_marker = """{slot.frameUrl ? 'LIVE' : mStatus?.stream === 'advertised' ? 'ADVERTISED' : 'LIVE'}
                    </div>
                  </div>"""

badge_pos = content.find(badge_marker)
if badge_pos < 0:
    print("ERROR: Could not find badge/thumb closing marker")
    sys.exit(1)

insert_pos = badge_pos + len(badge_marker)

preview_info = '''

                  {/* -- Preview Info: compact entity bar + TD state -- */}
                  <div style={{ padding: '6px 10px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: slotColor, fontWeight: 700 }}>
                      {(entityStates[slot.entity_id || slot.id] as Record<string,unknown>|undefined)?.toe_name as string || slot.entity_id || slot.id}
                    </span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: mStatus?.server === 'connected' ? '#4ade80' : mStatus?.server ? '#fbbf24' : 'rgba(255,255,255,0.2)' }} />
                    <span style={{ fontSize: 10, color: mStatus?.server === 'connected' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-mono)' }}>
                      {mStatus?.server === 'connected' ? 'connected' : mStatus?.server || 'offline'}
                    </span>
                    {mStatus?.lastHeartbeatAt && (
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                        {mStatus.heartbeat === 'live' ? 'now' : `${formatAge(now - mStatus.lastHeartbeatAt)} ago`}
                      </span>
                    )}
                  </div>

                  ''' + sidecar_block + '''
'''

content = content[:insert_pos] + preview_info + content[insert_pos:]
print("Inserted preview info + sidecar into preview column")

# === CHANGE 4: Remove old Entity Identity section ===
entity_comment = '{/* \u2500\u2500 Entity Identity + Live Status \u2500\u2500 */}'
entity_start = content.find(entity_comment)
if entity_start >= 0:
    section_start = content.find('<div className="live-section">', entity_start)
    if section_start >= 0 and section_start - entity_start < 200:
        depth = 0
        i = section_start
        while i < len(content):
            if content[i:].startswith('<div'):
                depth += 1
                i += 4
            elif content[i:].startswith('</div>'):
                depth -= 1
                if depth == 0:
                    entity_end = i + len('</div>')
                    while entity_end < len(content) and content[entity_end] in ' \t\n\r':
                        entity_end += 1
                    line_start = entity_start
                    while line_start > 0 and content[line_start-1] in ' \t':
                        line_start -= 1
                    content = content[:line_start] + content[entity_end:]
                    print("Removed Entity Identity section")
                    break
                i += 6
            else:
                i += 1
else:
    print("WARNING: Entity Identity section not found")

# === CHANGE 5: Remove raw Entity State table (Section 3) ===
raw_marker = '{/* \u2500\u2500 Section 3: Entity State \u2500\u2500 */}'
raw_start = content.find(raw_marker)
if raw_start >= 0:
    iife_open = content.find('{(() => {', raw_start)
    if iife_open >= 0 and iife_open - raw_start < 100:
        depth = 0
        i = iife_open
        while i < len(content):
            if content[i] == '{':
                depth += 1
            elif content[i] == '}':
                depth -= 1
                if depth == 0:
                    raw_end = i + 1
                    while raw_end < len(content) and content[raw_end] in ' \t\n\r':
                        raw_end += 1
                    line_start = raw_start
                    while line_start > 0 and content[line_start-1] in ' \t':
                        line_start -= 1
                    content = content[:line_start] + content[raw_end:]
                    print("Removed raw Entity State section")
                    break
            i += 1
else:
    print("Raw Entity State section not found (skipping)")

# === CHANGE 6: Add italic drag-and-drop instruction before Signals ===
signals_marker = '{/* \u2500\u2500 Section 2: Signals \u2500\u2500 */}'
signals_pos = content.find(signals_marker)
if signals_pos >= 0:
    instruction = '''                  {/* -- Drag-and-drop instruction -- */}
                  <div style={{ padding: '4px 10px 2px', fontSize: 11, fontStyle: 'italic', color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
                    drag <span style={{ color: '#22c55e', fontWeight: 700 }}>+</span> output and <span style={{ color: '#5cc8ff', fontWeight: 700 }}>\u2212</span> input chips to wire your entity slot
                  </div>

'''
    content = content[:signals_pos] + instruction + content[signals_pos:]
    print("Added italic instruction text")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("\nAll changes applied successfully!")
