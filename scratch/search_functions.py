filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\tmc-backend\functions\index.js"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

import re

# Find function obtenerDetalleComprobante
matches = [m.start() for m in re.finditer("obtenerDetalleComprobante", content)]
for idx, match in enumerate(matches):
    print(f"Match {idx} at character {match}")
    # print context of 1000 characters
    start = max(0, match - 200)
    end = min(len(content), match + 2000)
    print(content[start:end])
    print("-" * 50)
