import re

path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt"
endpoints = set()

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        m = re.search(r'"/api/public/([^"]+)"', line)
        if m:
            endpoints.add(m.group(1))

print("Public API endpoints found:")
for ep in sorted(list(endpoints)):
    print(f"  - {ep}")
