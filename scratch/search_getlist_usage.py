import re

filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\CALLE\logica.js"

with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print(f"Total lines in CALLE/logica.js: {len(lines)}")
for i, line in enumerate(lines):
    if "getchildlist" in line.lower() or "childrenapi" in line.lower() or "getlist" in line.lower():
        # print surrounding lines
        print(f"--- Line {i+1} ---")
        start = max(0, i - 3)
        end = min(len(lines), i + 4)
        for j in range(start, end):
            prefix = "-> " if j == i else "   "
            print(f"{prefix}{j+1}: {lines[j].strip()}")
