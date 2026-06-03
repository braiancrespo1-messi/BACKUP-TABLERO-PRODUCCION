with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

out_lines = []
found = False
for idx, line in enumerate(lines):
    if '"/MOVIMIENTOS_CLIENTES/report"' in line:
        found = True
        start = max(0, idx - 5)
        end = min(len(lines), idx + 80)
        for j in range(start, end):
            out_lines.append(f"  {j+1}: {lines[j].rstrip()}")
        break

if found:
    with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\scratch\report_endpoint_def.txt", "w", encoding="utf-8") as out:
        out.write("\n".join(out_lines))
    print("Saved definition to scratch/report_endpoint_def.txt")
else:
    print("Not found")
