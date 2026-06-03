path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt"

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

import re

# Look for FACTURA block
# Let's search for "FACT_" fields containing "ped" or "pedi" or similar in their descriptions/titles.
pattern = re.compile(r'"(FACT_[A-Z0-9_]+)"\s*:\s*\{')
matches = []
lines = content.splitlines()
for idx, line in enumerate(lines):
    m = pattern.search(line)
    if m:
        field_name = m.group(1)
        # Search next 10 lines for "pedido" or related text
        for i in range(1, 10):
            if idx + i < len(lines):
                next_line = lines[idx + i]
                if 'pedido' in next_line.lower():
                    matches.append((field_name, next_line.strip()))
                    break

print(f"Matches count: {len(matches)}")
for name, line in matches:
    print(f"Field: {name} -> Context line: {line}")
