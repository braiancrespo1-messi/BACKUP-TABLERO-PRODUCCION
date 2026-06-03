import os
import re

scratch_dir = r"C:\Users\Usuario\.gemini\antigravity\scratch"

for filename in os.listdir(scratch_dir):
    if filename.endswith(".py") or filename.endswith(".js") or filename.endswith(".json"):
        filepath = os.path.join(scratch_dir, filename)
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            if "PEDI_" in content:
                for line in content.splitlines():
                    if "PEDI_" in line:
                        print(f"{filename}: {line.strip()[:120]}")
        except Exception as e:
            pass
