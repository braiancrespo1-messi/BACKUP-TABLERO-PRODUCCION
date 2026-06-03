with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

out_lines = []
for idx, line in enumerate(lines):
    if "SALDO_CLIENTE" in line:
        out_lines.append(f"LINE {idx+1}:")
        start = max(0, idx - 5)
        end = min(len(lines), idx + 20)
        for j in range(start, end):
            out_lines.append(f"  {j+1}: {lines[j].rstrip()}")
        out_lines.append("\n" + "="*80 + "\n")

with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\scratch\saldo_cliente_def.txt", "w", encoding="utf-8") as out:
    out.write("\n".join(out_lines))

print("Saved to scratch/saldo_cliente_def.txt")
