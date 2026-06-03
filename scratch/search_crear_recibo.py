filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\tmc-backend\functions\index.js"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

import re

# Find exports.crearReciboManual code block
start_idx = content.find("exports.crearReciboManual")
end_idx = content.find("exports.obtenerDetalleComprobante")

if start_idx != -1:
    if end_idx != -1 and end_idx > start_idx:
        print(content[start_idx:end_idx])
    else:
        print(content[start_idx:start_idx + 4000])
else:
    print("Function crearReciboManual not found")
