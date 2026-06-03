import json

path = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\scratch\movimientos_schema_lines.txt"

# Let's find the lines representing the properties of MOVIMIENTOS_CLIENTES
# We can search for the "properties" object of the schema.
with open(path, "r", encoding="utf-8") as f:
    text = f.read()

# Let's extract the properties block
import re
# Look for something like "properties": { followed by property definitions
# Since it is a large file, we can write a python script to scan it.
lines = text.splitlines()
prop_lines = []
in_properties = False
brace_count = 0

for idx, line in enumerate(lines):
    if '"properties": {' in line:
        # Check if it is the main properties of the entity
        # We can look a few lines up to see if it is under the response schema or schema definition
        in_properties = True
        brace_count = 1
        prop_lines.append(line)
        continue
        
    if in_properties:
        prop_lines.append(line)
        brace_count += line.count("{") - line.count("}")
        if brace_count <= 0:
            break

print("\n".join(prop_lines[:150]))
