filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\tmc-backend\functions\index.js"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

import re

pattern = re.compile(r'exports\.([a-zA-Z0-9_]+)\s*=')
for idx, line in enumerate(content.splitlines()):
    m = pattern.search(line)
    if m:
        print(f"Line {idx+1}: exports.{m.group(1)}")
