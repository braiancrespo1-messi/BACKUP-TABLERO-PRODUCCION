import sys
sys.stdout.reconfigure(encoding='utf-8')

with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\test_estado_cuenta.html", "r", encoding="utf-8") as f:
    for idx, line in enumerate(f):
        if "modal" in line.lower():
            print(f"Line {idx+1}: {line.strip()}")
