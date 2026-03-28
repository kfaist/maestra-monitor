import sys
sys.stdout.reconfigure(encoding='utf-8')

path = r'C:\Users\Krista\maestra-monitor-fix2\src\components\SlotGrid.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"Original: {len(content)} chars")

# Sections to remove - each identified by its comment marker
# For each, we find the comment, then find the enclosing JSX block
markers = [
    'Section 4: Signal Injection',
    'Section 4: Source / Reference',
    'Section 5: Origin Aggregate',
    'Section 6: Signal Wiring',
    'Section 8: DMX Lighting',
    'Section 9: Audio Analysis',
    'Section 10: Recent Activity',
]

# Process from end to start so positions don't shift
positions = []
for marker in markers:
    pos = content.find(marker)
    if pos < 0:
        print(f"  NOT FOUND: {marker}")
        continue
    positions.append((pos, marker))

positions.sort(reverse=True)

for pos, marker in positions:
    # Back up to find the start of this JSX expression
    # It'll be either:
    #   {/* comment */}\n  <div ...>...</div>  (a plain div section)
    #   {/* comment */}\n  {(() => { ... })()}  (an IIFE section)
    # Back up to the { that opens the comment
    comment_open = content.rfind('{/*', pos - 200, pos)
    if comment_open < 0:
        print(f"  SKIP (no comment open): {marker}")
        continue
    
    # Back up further to start of line
    line_start = comment_open
    while line_start > 0 and content[line_start-1] in ' \t':
        line_start -= 1
    
    # Now scan forward from the comment to find what follows
    # Skip past the comment closing */}
    comment_close = content.find('*/}', comment_open)
    if comment_close < 0:
        print(f"  SKIP (no comment close): {marker}")
        continue
    after_comment = comment_close + 3
    
    # Skip whitespace after comment
    scan = after_comment
    while scan < len(content) and content[scan] in ' \t\n\r':
        scan += 1
    
    # Determine block type
    if content[scan:scan+8] == '{(() => ':
        # IIFE block - find matching closing })()}
        block_start = scan
        depth = 0
        i = block_start
        while i < len(content):
            if content[i] == '{':
                depth += 1
            elif content[i] == '}':
                depth -= 1
                if depth == 0:
                    block_end = i + 1
                    break
            i += 1
        else:
            print(f"  SKIP (unmatched IIFE): {marker}")
            continue
    elif content[scan] == '<':
        # JSX div block - find matching closing </div>
        block_start = scan
        depth = 0
        i = block_start
        while i < len(content):
            if content[i:i+4] == '<div':
                depth += 1
                i += 4
            elif content[i:i+6] == '</div>':
                depth -= 1
                if depth == 0:
                    block_end = i + 6
                    break
                i += 6
            else:
                i += 1
        else:
            print(f"  SKIP (unmatched div): {marker}")
            continue
    elif content[scan:scan+2] == '  ' or content[scan] == '\n':
        # Empty section (like Signal Injection) - just remove the comment
        block_end = scan
        block_start = scan
    else:
        print(f"  SKIP (unknown block type at '{content[scan:scan+20]}'): {marker}")
        continue
    
    # Eat trailing whitespace/newlines
    end = block_end
    while end < len(content) and content[end] in ' \t\n\r':
        end += 1
    
    removed = content[line_start:end]
    removed_lines = removed.count('\n')
    content = content[:line_start] + content[end:]
    print(f"  REMOVED {removed_lines} lines: {marker}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"\nResult: {len(content)} chars")
