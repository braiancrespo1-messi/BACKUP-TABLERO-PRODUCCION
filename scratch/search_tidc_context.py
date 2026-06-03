with open(r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Api Ventas YiQi.txt", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "TIDC_ID_TIDC" in line:
        print(f"--- Line {idx+1} ---")
        start = max(0, idx - 15)
        end = min(len(lines), idx + 15)
        for i in range(start, end):
            print(f"{i+1}: {lines[i].strip()}")
