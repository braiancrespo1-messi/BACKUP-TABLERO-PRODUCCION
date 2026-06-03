import re
import sys

widget_path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\widget_estado_cuenta.html"

with open(widget_path, "r", encoding="utf-8") as f:
    html = f.read()

# Find <script> contents
scripts = re.findall(r"<script>(.*?)</script>", html, re.DOTALL)
if not scripts:
    print("No script found!")
    sys.exit(1)

js_content = scripts[0]
print("JS Content length:", len(js_content))

# Let's save JS to a temp file and run node -c on it
temp_js = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\scratch\temp_widget.js"
with open(temp_js, "w", encoding="utf-8") as f:
    f.write(js_content)

print("JS written to temp file. Now check syntax with node.")
