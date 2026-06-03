import json

path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt"
out_path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\paths_list.txt"

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

json_content = ""
for idx, line in enumerate(lines):
    if line.strip().startswith("{"):
        json_content = "".join(lines[idx:])
        break

data = json.loads(json_content)

paths = sorted(list(data.get("paths", {}).keys()))

out_lines = []
for p in paths:
    methods = list(data["paths"][p].keys())
    out_lines.append(f"{p} -> {methods}")

with open(out_path, "w", encoding="utf-8") as out_f:
    out_f.write("\n".join(out_lines))

print(f"Done! Extracted {len(paths)} paths to paths_list.txt")
