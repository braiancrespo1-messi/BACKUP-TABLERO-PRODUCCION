import re

path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt"
paths = []

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        # Match json key like "/something": {
        m = re.search(r'"(/[^"]+)"\s*:\s*\{', line)
        if m:
            paths.append(m.group(1))

print("Swagger paths found:")
for p in sorted(list(set(paths))):
    print(f"  - {p}")
