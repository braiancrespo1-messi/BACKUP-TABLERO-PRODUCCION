import re

filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\ADMINSITRATIVAS INTERNAS\cuentas_corrientes_clientes.html"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

def search_patterns(patterns):
    for idx, line in enumerate(lines):
        for pattern in patterns:
            if re.search(pattern, line, re.IGNORECASE):
                print(f"Line {idx+1}: {line.strip()[:100]}")
                break

print("=== Search for Recibo Wizard elements ===")
search_patterns(["crearReciboManual", "modal.*recibo", "pasos.*recibo", "obtenerAuxiliaresCobro", "tmc-add-efectivo"])

print("\n=== Search for Pedido Details ===")
search_patterns(["tmc-detail-pedido-container", "detail-pedido", "obtenerDetalleComprobante"])
