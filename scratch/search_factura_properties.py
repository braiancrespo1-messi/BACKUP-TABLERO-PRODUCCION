import re

path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt"
with open(path, "r", encoding="utf-8", errors="ignore") as f:
    text = f.read()

lines = text.splitlines()
start_idx = -1
for idx, line in enumerate(lines):
    if '"/FACTURA/query"' in line:
        start_idx = idx
        break

if start_idx != -1:
    print("Found /FACTURA/query at line", start_idx+1)
    # Print 200 lines around
    for j in range(start_idx, min(len(lines), start_idx + 120)):
        print(f"  {j+1}: {lines[j]}")
else:
    print("Not found")
