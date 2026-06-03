filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\tmc-backend\functions\index.js"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "const pedidoId = matchedDetail.FACT_PEDIDO_ID" in line:
        print(f"pedidoId line: {idx+1}: {line.strip()}")
    if 'COBR_OBSERVACIONES: observaciones || "Recibo Manual (Aplicativo TMC)"' in line:
        print(f"observaciones default line: {idx+1}: {line.strip()}")
