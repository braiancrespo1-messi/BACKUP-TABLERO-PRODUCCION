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

# Search inside data for entity 345
# We can traverse all keys looking for "345" or fields associated with CLIE
results = []
def scan(d, path_str=""):
    if isinstance(d, dict):
        for k, v in d.items():
            current = f"{path_str}/{k}"
            if k == "entityId" and str(v) == "345":
                results.append((current, d))
            scan(v, current)
    elif isinstance(d, list):
        for i, item in enumerate(d):
            scan(item, f"{path_str}[{i}]")

scan(data)
print(f"Found {len(results)} matches for entityId 345")

for idx, (p, val) in enumerate(results):
    print(f"Match {idx}: {p}")
    # Let's inspect attributes or properties
    if "attributes" in val:
        print("Attributes keys:")
        for attr_key, attr_val in val["attributes"].items():
            name = attr_val.get("name", "")
            code = attr_val.get("code", "")
            title = attr_val.get("title", "")
            desc = attr_val.get("description", "")
            if "TIDC" in str(code) or "TIDC" in str(name) or "Tipo" in str(title) or "tipo" in str(title):
                print(f"  - {attr_key}: code={code}, name={name}, title={title}")
    
    # If the schema is structured differently:
    if "properties" in val:
        print("Properties:")
        for pk, pv in val["properties"].items():
            if isinstance(pv, dict):
                title = pv.get("title", "")
                if "Tipo" in str(title) or "tipo" in str(title):
                    print(f"  - {pk}: title={title}")
