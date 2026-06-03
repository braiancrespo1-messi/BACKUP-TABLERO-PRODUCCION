import os
import re

brains_dir = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains"
files = ["documentacion_produccion_fields.md", "documentacion_produccion.md", "yiqi_master_brain.md", "LEEME.md"]

for filename in files:
    filepath = os.path.join(brains_dir, filename)
    if os.path.exists(filepath):
        print(f"Searching in {filename}...")
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
            # Find all words starting with FADE_ or DENV_
            fields = set(re.findall(r"\bFADE_[A-Z0-9_]+\b", content))
            fields2 = set(re.findall(r"\bDENV_[A-Z0-9_]+\b", content))
            all_fields = fields.union(fields2)
            for field in sorted(list(all_fields)):
                if "bonif" in field.lower() or "dto" in field.lower() or "porc" in field.lower() or "descuento" in field.lower() or "neto" in field.lower():
                    print(f"  Field: {field}")
