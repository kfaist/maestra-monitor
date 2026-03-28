f = open(r'C:\Users\Krista\maestra-monitor-fix2\src\components\SlotGrid.tsx', 'r', encoding='utf-8')
lines = f.readlines()
f.close()
for i, line in enumerate(lines, 1):
    if 'ENTITY SLUG' in line or 'entity_id' in line.lower() or 'slot.label' in line:
        print(f"{i}: {line.rstrip()}")
