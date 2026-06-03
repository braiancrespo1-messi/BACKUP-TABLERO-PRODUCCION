filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\tmc-backend\functions\index.js"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx in range(1600, len(lines)):
    print(f"Line {idx+1}: {lines[idx]}", end="")
