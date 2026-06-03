filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\ADMINSITRATIVAS INTERNAS\cuentas_corrientes_clientes.html"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

def search_text(keywords):
    for idx, line in enumerate(lines):
        for kw in keywords:
            if kw in line:
                print(f"Line {idx+1}: {line.strip()[:100]}")

search_text(["tmc-modal-cobro-manual", "openCobroManualModal", "addChequeRow", "populateInvoices", "updateTotals", "transitionToStep", "submitCobroManual"])
