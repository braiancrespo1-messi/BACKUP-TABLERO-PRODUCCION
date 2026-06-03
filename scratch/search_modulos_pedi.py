path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt"

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

import re

# Look for entity: "PEDIDO"
# Let's search for "PEDIDO" in the file and print 100 lines after it.
match = re.search(r'"PEDIDO"\s*:\s*\{', content)
if match:
    start = match.start()
    print(content[start:start+3000])
else:
    print("Entity PEDIDO not found")
