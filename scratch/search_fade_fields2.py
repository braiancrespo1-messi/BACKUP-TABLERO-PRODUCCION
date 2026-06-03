import os
import re

brains_dir = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains"
files = ["Modulos.txt", "Api Ventas YiQi.txt"]

for filename in files:
    filepath = os.path.join(brains_dir, filename)
    if os.path.exists(filepath):
        print(f"Searching in {filename}...")
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                if '"FADE_' in line or '"DENV_' in line:
                    # Match pattern
                    matches = re.findall(r'"(FADE_[A-Z0-9_]+)"|"(DENV_[A-Z0-9_]+)"', line)
                    for m in matches:
                        field = m[0] or m[1]
                        if any(k in field.lower() for k in ["bonif", "dto", "porc", "desc", "neto"]):
                            print(f"  {field} (found in: {line.strip()[:100]})")
                            
        # stop after first file if too many results
