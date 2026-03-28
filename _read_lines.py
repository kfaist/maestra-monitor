import sys
f = open(r'C:\Users\Krista\maestra-monitor-fix2\src\app\page.tsx', 'r', encoding='utf-8')
lines = f.readlines()
f.close()
# Search for scope, kfaist, hydrat, entity_id
for i, line in enumerate(lines, 1):
    low = line.lower()
    if 'scope' in low or 'kfaist' in low or 'hydrat' in low or 'always present' in low:
        print(f"{i}: {line.rstrip()}")
