import re

path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt"
paths = []

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        m = re.search(r'"(/[^"]+)"\s*:\s*\{', line)
        if m:
            paths.append(m.group(1))

unique_paths = sorted(list(set(paths)))
print("Paths containing CLIENTE:")
for p in unique_paths:
    if "cliente" in p.lower():
        print(f"  - {p}")
