import re

path = r'C:\Users\Krista\Desktop\maestra-monitor-src\src\app\globals.css'
with open(path, 'r', encoding='utf-8-sig') as f:
    src = f.read()

# Fix palette grid inline
src = src.replace(
    '.palette { display: grid; grid-template-columns: repeat(8, 1fr); gap: 0.5rem; margin-bottom: 1rem; }',
    '.palette { display: grid; grid-template-columns: repeat(8, 56px); gap: 6px; margin-bottom: 0.5rem; }'
)

# Fix palette-btn aspect-ratio and min-height
src = src.replace(
    '  aspect-ratio: 1;\n  border: none;\n  border-radius: 8px;\n  cursor: pointer;\n  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);\n  min-height: 48px;',
    '  width: 56px;\n  height: 56px;\n  aspect-ratio: unset;\n  border: none;\n  border-radius: 8px;\n  cursor: pointer;\n  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);\n  min-height: 0;'
)

# Fix slot-grid minmax
src = src.replace(
    'grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));',
    'grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));'
)

# Strip old appended overrides
cut = src.rfind('\n/* Fix slot overflow')
if cut > 0:
    src = src[:cut]

# Append clean block
src += """

/* PROPORTION + TEXT-SLOT FIX */
.palette { grid-template-columns: repeat(8, 56px) !important; gap: 6px !important; }
.palette-btn { width: 56px !important; height: 56px !important; min-height: 0 !important; aspect-ratio: unset !important; }
.slot-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important; overflow-y: auto !important; }
.slot { max-height: 310px !important; overflow-y: auto !important; overflow-x: hidden !important; }
.live-node-panel { max-height: 240px !important; }
.live-node-thumb { aspect-ratio: 16 / 5 !important; }
.slot[data-signal="text"] { max-height: 155px !important; }
.slot[data-signal="text"] .slot-video-area { display: none !important; }
.slot[data-signal="text"] .live-node-thumb { height: 32px !important; aspect-ratio: unset !important; }
.slot[data-signal="text"] .live-node-panel { max-height: 130px !important; }
.slot[data-signal="osc"] { max-height: 155px !important; }
.slot[data-signal="osc"] .slot-video-area { display: none !important; }
.live-inject-input { font-size: 11px !important; padding: 5px 8px !important; }
.live-inject-send { font-size: 10px !important; padding: 5px 14px !important; }
.slot-wizard-btn { font-size: 11px !important; padding: 8px 18px !important; }
"""

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print('OK', src.count('56px'), 'occurrences of 56px')
print('text slot:', 'data-signal="text"' in src)
