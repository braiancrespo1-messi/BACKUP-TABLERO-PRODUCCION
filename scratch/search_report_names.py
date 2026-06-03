import os
import re

root_dir = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0"
matches = []

for dirpath, dirnames, filenames in os.walk(root_dir):
    # Skip tmc-backend node_modules
    if "node_modules" in dirpath or ".git" in dirpath:
        continue
    for filename in filenames:
        if filename.endswith((".js", ".py", ".html", ".txt")):
            filepath = os.path.join(dirpath, filename)
            try:
                with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                    for line_num, line in enumerate(f, 1):
                        if "reportName" in line or "reportName=" in line:
                            matches.append(f"{filename}:{line_num}: {line.strip()[:150]}")
            except Exception as e:
                pass

print(f"Found {len(matches)} matches:")
for m in matches[:50]:
    print(m)
