filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\tmc-backend\functions\index.js"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

import re

start_idx = content.find("exports.obtenerEstadoCuenta")
end_idx = content.find("exports.descargarReportePDF")

if start_idx != -1 and end_idx != -1:
    print(content[start_idx:end_idx])
else:
    print("Function not found")
