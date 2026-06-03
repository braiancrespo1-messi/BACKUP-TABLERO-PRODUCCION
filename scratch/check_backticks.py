with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\widget_estado_cuenta.html", "r", encoding="utf-8") as f:
    lines = f.readlines()

css_lines = lines[124:624]
for idx, line in enumerate(css_lines):
    if "`" in line:
        print(f"Backtick at line {idx+125}: {line.strip()}")
