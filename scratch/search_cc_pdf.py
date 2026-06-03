filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\ADMINSITRATIVAS INTERNAS\cuentas_corrientes_clientes.html"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

import re

# Find download PDF patterns
patterns = ["DESCARGAR_PDF_URL", "reportId", "COBRO", "PDF"]
for p in patterns:
    matches = [m.start() for m in re.finditer(p, content)]
    print(f"Pattern {p}: {len(matches)} matches")
    for m in matches[:10]:
        print(f"  Line {content[:m].count('\\n')+1}: {content[m:m+120].strip()}")
