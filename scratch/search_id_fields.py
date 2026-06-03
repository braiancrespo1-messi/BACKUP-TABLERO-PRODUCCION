filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\tmc-backend\functions\index.js"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

import re

# Look for _ID references in index.js
for line in content.splitlines():
    if "_ID" in line or "_id" in line:
        if "FACT_" in line or "ped" in line or "PEDI_" in line:
            print(line.strip())
