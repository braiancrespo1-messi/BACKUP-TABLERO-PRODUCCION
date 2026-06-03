with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

out_lines = []
for idx, line in enumerate(lines):
    if '"/CLIENTES' in line or '"/api/public/CLIENTES' in line:
        out_lines.append(f"LINE {idx+1}: {line.strip()}")

print("Client endpoints found:")
for o in out_lines:
    print(o)
