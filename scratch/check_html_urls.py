filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\widget_estado_cuenta.html"

with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print(f"Total lines in widget_estado_cuenta.html: {len(lines)}")
for i, line in enumerate(lines):
    if "fetch" in line or "obtenerEstadoCuenta" in line or "cloudfunctions" in line or "app.run.app" in line:
        print(f"{i+1}: {line.strip()}")
