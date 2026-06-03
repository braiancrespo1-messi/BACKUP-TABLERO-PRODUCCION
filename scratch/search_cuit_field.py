import json

with open("scratch/raw_invoice_18557.json", "r", encoding="utf-8") as f:
    detail = json.load(f)

for k, v in detail.items():
    v_str = str(v)
    if "30716229897" in v_str or "30717981312" in v_str:
        print(f"Key: {k} -> {v_str[:100]}")
