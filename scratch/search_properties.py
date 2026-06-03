import re

path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\scratch\movimientos_schema_lines.txt"

with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# Let's find all occurrences of "field" or property names
# Since it's JSON-like, properties are usually key-value pairs
# We want to search for property names, for example: "CLIE_..." or "DEBE" or "HABER"
matches = re.findall(r'"([A-Za-z0-9_]+)"\s*:\s*\{', text)
unique_keys = sorted(list(set(matches)))

# Print all matching words that are uppercase or property-like
print("Property-like matches found in movimientos_schema_lines.txt:")
for k in unique_keys:
    if k.isupper() or "clie" in k.lower() or "saldo" in k.lower():
        print(f"  - {k}")
