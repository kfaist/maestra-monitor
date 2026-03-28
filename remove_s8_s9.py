import sys
sys.stdout.reconfigure(encoding='utf-8')

path = r'C:\Users\Krista\maestra-monitor-fix2\src\components\SlotGrid.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove Section 8 and 9 using brace matching
# Both start with their comment, then a conditional JSX expression
for marker in ['Section 8: DMX Lighting', 'Section 9: Audio Analysis']:
    pos = content.find(marker)
    if pos < 0:
        print(f"NOT FOUND: {marker}")
        continue
    
    # Find the {/* comment start
    comment_start = content.rfind('{/*', pos - 100, pos)
    line_start = comment_start
    while line_start > 0 and content[line_start-1] in ' \t':
        line_start -= 1
    
    # Find the opening { of the conditional block after the comment
    comment_end = content.find('*/}', pos) + 3
    # Skip whitespace
    scan = comment_end
    while scan < len(content) and content[scan] in ' \t\n\r':
        scan += 1
    
    # Now at the { of {(condition) && ...}
    # Match braces to find the full block
    if content[scan] != '{':
        print(f"UNEXPECTED char at {scan}: '{content[scan]}' for {marker}")
        continue
    
    depth = 0
    i = scan
    while i < len(content):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                block_end = i + 1
                break
        i += 1
    
    # Eat trailing whitespace
    end = block_end
    while end < len(content) and content[end] in ' \t\n\r':
        end += 1
    
    removed_lines = content[line_start:end].count('\n')
    content = content[:line_start] + content[end:]
    print(f"REMOVED {removed_lines} lines: {marker}")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done!")
