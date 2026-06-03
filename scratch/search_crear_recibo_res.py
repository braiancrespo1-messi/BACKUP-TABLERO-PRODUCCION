filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\tmc-backend\functions\index.js"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

start_idx = content.find("exports.crearReciboManual")
end_idx = content.find("exports.obtenerDetalleComprobante")

if start_idx != -1 and end_idx != -1:
    block = content[start_idx:end_idx]
    lines = block.splitlines()
    for idx, line in enumerate(lines):
        if "res." in line or "receiptNumber" in line or "success:" in line:
            print(f"Line {idx}: {line.strip()}")
else:
    print("Function block not found")
