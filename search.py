import json

path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\.brains\Modulos.txt"
out_path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\op_info.txt"

with open(path, "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()

json_content = ""
for idx, line in enumerate(lines):
    if line.strip().startswith("{"):
        json_content = "".join(lines[idx:])
        break

data = json.loads(json_content)

def find_key_in_dict(d, target, current_path=""):
    results = []
    if isinstance(d, dict):
        for k, v in d.items():
            new_path = f"{current_path}/{k}"
            if target.lower() in k.lower():
                results.append((new_path, v))
            results.extend(find_key_in_dict(v, target, new_path))
    elif isinstance(d, list):
        for idx, item in enumerate(d):
            new_path = f"{current_path}[{idx}]"
            results.extend(find_key_in_dict(item, target, new_path))
    return results

# Find where "OrdenDeProducción" or "OrdenDeProduccion" appears
matches = find_key_in_dict(data, "OrdenDeProdu")

out_lines = []
for p, val in matches:
    out_lines.append(f"PATH: {p}")
    # Print schema type or brief details of val
    if isinstance(val, dict):
        out_lines.append("KEYS in this dictionary:")
        for k in val.keys():
            out_lines.append(f"  - {k}")
        # If it has properties, print them
        if "properties" in val:
            out_lines.append("PROPERTIES:")
            for pk, pv in val["properties"].items():
                title = pv.get("title", "") if isinstance(pv, dict) else ""
                out_lines.append(f"    * {pk} ({title})")
        if "items" in val:
            out_lines.append("ITEMS:")
            items_val = val["items"]
            if isinstance(items_val, dict):
                out_lines.append("  KEYS in items:")
                for k in items_val.keys():
                    out_lines.append(f"    - {k}")
                if "properties" in items_val:
                    out_lines.append("  PROPERTIES in items:")
                    for pk, pv in items_val["properties"].items():
                        title = pv.get("title", "") if isinstance(pv, dict) else ""
                        out_lines.append(f"      * {pk} ({title})")
    out_lines.append("\n" + "="*80 + "\n")

with open(out_path, "w", encoding="utf-8") as out_f:
    out_f.write("\n".join(out_lines))

print(f"Done! Found {len(matches)} matches. Saved to op_info.txt")
