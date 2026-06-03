import re

path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt"

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    text = f.read()

# Let's find the schema definition for REPORTE_DE_CLIENTES
# We can search for the text "/REPORTE_DE_CLIENTES" and look for property keys in that block.
# Let's write a regex that extracts property keys in this block or searches around this line.
lines = text.splitlines()
start_idx = -1
for idx, line in enumerate(lines):
    if '"/REPORTE_DE_CLIENTES/query"' in line:
        start_idx = idx
        break

if start_idx != -1:
    print("Found /REPORTE_DE_CLIENTES/query at line", start_idx+1)
    # Print 200 lines around
    for j in range(start_idx, min(len(lines), start_idx + 150)):
        print(f"  {j+1}: {lines[j]}")
else:
    print("Not found")
