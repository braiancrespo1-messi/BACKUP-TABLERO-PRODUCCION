import re

with open(r'.\.brains\Modulos.txt', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Search for CLIE_ in Modulos.txt and find any fields containing SALDO or IMPUT
matches = set(re.findall(r'\bCLIE_\w*(?:SALDO|IMPUT)\w*\b', content, re.IGNORECASE))
print("Matches for CLIE_ balance/imput fields:")
print(matches)

# Also check generally for fields containing SALDO_NO_IMPUTADO or PENDIENTE_DE_ASIGNAC
matches2 = set(re.findall(r'\b\w*(?:SALDO_NO|NO_IMPUT|PENDIENTE_DE_ASIG)\w*\b', content, re.IGNORECASE))
print("Other interesting fields:")
print(matches2)
