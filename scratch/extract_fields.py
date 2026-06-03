with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

# Extract lines from 66000 to 68100
sub_lines = lines[66000:68100]

with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\scratch\movimientos_schema_lines.txt", "w", encoding="utf-8") as out:
    out.writelines(sub_lines)

print("Sub-lines saved to scratch/movimientos_schema_lines.txt")
