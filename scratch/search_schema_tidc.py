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

# We want to search for TIDC_ID_TIDC or TIDC inside the whole parsed data,
# especially looking for a map that gives the field ID (the numeric key in client atts)
# in schema 1491 or general schemas.

def scan_dict(d, parent_key=None, path=""):
    results = []
    if isinstance(d, dict):
        for k, v in d.items():
            current_path = f"{path}/{k}"
            if "TIDC_ID_TIDC" in str(k) or "TIDC_ID_TIDC" in str(v):
                results.append((current_path, d))
            results.extend(scan_dict(v, k, current_path))
    elif isinstance(d, list):
        for i, item in enumerate(d):
            results.extend(scan_dict(item, None, f"{path}[{i}]"))
    return results

matches = scan_dict(data)
print(f"Found {len(matches)} matches:")
for p, obj in matches[:10]:
    print(f"PATH: {p}")
    # Print the parent or keys of the dictionary containing it
    if isinstance(obj, dict):
        print("Keys:", list(obj.keys()))
        print("Obj preview:", str(obj)[:300])
