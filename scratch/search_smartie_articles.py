with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\yiqi_master_brain.md", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "2671" in line or "2744" in line or "782" in line:
        print(f"L{idx+1}: {line.strip()}".encode("ascii", "replace").decode("ascii"))
