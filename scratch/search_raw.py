import json

path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt"

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

json_content = ""
for idx, line in enumerate(lines):
    if line.strip().startswith("{"):
        json_content = "".join(lines[idx:])
        break

data = json.loads(json_content)

def search_text(d, query, current_path=""):
    results = []
    if isinstance(d, dict):
        for k, v in d.items():
            new_path = f"{current_path}/{k}"
            if query.lower() in str(k).lower():
                results.append((new_path, str(v)[:100]))
            if query.lower() in str(v).lower() and not isinstance(v, (dict, list)):
                results.append((new_path, str(v)[:100]))
            results.extend(search_text(v, query, new_path))
    elif isinstance(d, list):
        for idx, item in enumerate(d):
            new_path = f"{current_path}[{idx}]"
            results.extend(search_text(item, query, new_path))
    return results

# Let's search for TIDC_ID_TIDC or TIDC
matches = search_text(data, "TIDC")
print(f"Found {len(matches)} matches for TIDC")
for p, val in matches[:20]:
    print(f"PATH: {p} => {val}")
