f = open(r'C:\Users\Krista\maestra-monitor-fix2\src\components\SlotGrid.tsx', 'r', encoding='utf-8')
lines = f.readlines()
f.close()
for start, count in [(668, 20), (800, 25)]:
    print(f"--- Lines {start}-{start+count} ---")
    for i in range(start, min(start+count, len(lines))):
        print(f"{i+1}: {lines[i].rstrip()}")
    print()
