filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\tmc-backend\functions\index.js"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

import re

# Find exports.crearReciboManual code block
start_idx = content.find("exports.crearReciboManual")
if start_idx != -1:
    # Print the code between exports.crearReciboManual and the next export or functions
    lines = content[start_idx : start_idx + 8000].splitlines()
    for idx, line in enumerate(lines):
        if "res.json" in line or "res.status" in line or "cobroId" in line or "receiptNumber" in line:
            print(f"Line {idx}: {line.strip()}")
else:
    print("Function not found")
