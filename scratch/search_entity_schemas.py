path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt"

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

import re

# Look for PEDI_NRO_PEDIDO definition
match = re.search(r'"PEDI_NRO_PEDIDO"\s*:\s*\{', content)
if match:
    start = match.start()
    # Print context from 500 characters before to 1000 characters after
    print(content[max(0, start - 1000):start + 1000])
else:
    print("PEDI_NRO_PEDIDO not found")
