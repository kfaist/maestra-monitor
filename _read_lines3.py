f = open(r'C:\Users\Krista\maestra-monitor-fix2\src\components\SlotGrid.tsx', 'r', encoding='utf-8')
lines = f.readlines()
f.close()
for i, line in enumerate(lines, 1):
    low = line.lower()
    if 'scope' in low or 'getpublishingsignals' in low.lower():
        print(f"{i}: {line.rstrip()}")
