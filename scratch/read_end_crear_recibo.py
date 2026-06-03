filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\tmc-backend\functions\index.js"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

import re

# Find end of crearReciboManual which is right before exports.obtenerDetalleComprobante
start_idx = content.find("exports.crearReciboManual")
end_idx = content.find("exports.obtenerDetalleComprobante")

if start_idx != -1 and end_idx != -1:
    print(content[end_idx - 1500 : end_idx])
else:
    print("Not found")
