with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\yiqi_master_brain.md", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for idx in range(117, 165):
    if idx < len(lines):
        print(f"L{idx+1}: {lines[idx].strip()}".encode("ascii", "replace").decode("ascii"))
