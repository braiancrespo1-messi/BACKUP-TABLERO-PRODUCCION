filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\widget_estado_cuenta.html"

with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
for i, line in enumerate(lines):
    if "tmc-no-wrap" in line or "cleanFXComprobante" in line or "buildMailtoLink" in line or "renderTable =" in line or "cachedMovements = " in line:
        print(f"Line {i+1}: {line.strip()}")
