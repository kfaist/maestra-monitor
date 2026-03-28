f = open(r'C:\Users\Krista\maestra-monitor-fix2\src\app\page.tsx', 'r', encoding='utf-8')
lines = f.readlines()
f.close()
for i in [750,751,752,753,754,755,756,757,758,808,809,810,811,812,813,814,815,816,1196,1197,1198,1199,1200,1201]:
    if i <= len(lines):
        print(f"{i}: {lines[i-1].rstrip()}")
