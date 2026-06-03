filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\ADMINSITRATIVAS INTERNAS\cuentas_corrientes_clientes.html"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

import re

# Find javascript matches for functions
patterns = ["populateInvoices", "submitCobro", "addChequeRow", "updateTotals", "transitionToStep", "openCobroManualModal"]
for p in patterns:
    matches = [m.start() for m in re.finditer(p, content)]
    print(f"Pattern {p}: {len(matches)} matches")
    for idx, m in enumerate(matches):
        print(f"  Match {idx}: character {m}, line {content[:m].count('\\n')+1}")
