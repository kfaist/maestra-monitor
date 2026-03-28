import sys
sys.stdout.reconfigure(encoding='utf-8')
path = r'C:\Users\Krista\maestra-monitor-fix2\src\components\SlotGrid.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()
# Find getPublishingSignals and getListeningSignals
for i, line in enumerate(lines):
    if 'getPublishingSignals' in line or 'getListeningSignals' in line:
        if 'function' in line or 'const' in line:
            for j in range(i, min(len(lines), i+15)):
                print(f"{j+1}: {lines[j].rstrip()}")
            print("---")
