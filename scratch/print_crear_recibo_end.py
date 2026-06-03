filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\tmc-backend\functions\index.js"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

import re

start_idx = content.find("exports.crearReciboManual")
if start_idx != -1:
    lines = content[start_idx : start_idx + 8000].splitlines()
    for idx, line in enumerate(lines):
        if idx >= 200 and idx < 300:
            print(f"Line {idx}: {line}")
else:
    print("Function not found")
