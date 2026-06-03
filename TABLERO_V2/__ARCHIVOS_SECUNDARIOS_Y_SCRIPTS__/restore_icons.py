
import sys

# Paths to files
logica_path = r'g:\Mi unidad\TMC - Administración\PROYECTOS TMC\TABLERO_V2\logica.js'
index_path = r'g:\Mi unidad\TMC - Administración\PROYECTOS TMC\TABLERO_V2\index.html'

def fix_file(path, target, replacement):
    with open(path, 'rb') as f:
        content = f.read()
    
    if target in content:
        new_content = content.replace(target, replacement)
        with open(path, 'wb') as f:
            f.write(new_content)
        return True
    return False

# 1. Fix logica.js
# Restore statusIcon emoji
fix_file(logica_path, b'let statusIcon = \'<span title="No Agendado">(!)</span>\';', b'let statusIcon = \'<span title="No Agendado">\xe2\x9a\xa0\xef\xb8\x8f</span>\';')
# Restore appAlert emoji
fix_file(logica_path, b'appAlert("(!) El pedido no es visible', b'appAlert("\xe2\x9a\xa0\xef\xb8\x8f El pedido no es visible')

# 2. Fix index.html (ensure clean UTF-8 for the emoji)
# The terminal saw ?? but view_file saw the emoji. Let's force rewrite that line.
with open(index_path, 'rb') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if b'filter-ped-status' in line and b'pending' in line:
        # Assuming the next line is the one with the label
        new_lines.append(line)
        continue
    if b'Sin Agendar' in line and b'<label>' not in line: # It's usually the line after pending radio
         # This is a bit risky if structure varies, let's be more specific
         new_lines.append(line.replace(b'\xe2\x9a\xa0\xef\xb8\x8f', b'\xe2\x9a\xa0\xef\xb8\x8f').replace(b'!', b'!')) # placeholder
         continue
    new_lines.append(line)

# Let's do a more direct replacement for index.html as well
with open(index_path, 'rb') as f:
    idx_content = f.read()

# Replace whatever is before "Sin Agendar" after the radio button
import re
# Look for the pattern of the label with the emoji
# <label><input type="radio" name="filter-ped-status" value="pending" onchange="applyFilters()"> ⚠️ Sin Agendar</label>
# Some are multiline in my view_file output:
# 104:                         <label><input type="radio" name="filter-ped-status" value="pending" onchange="applyFilters()">
# 105:                             ⚠️ Sin Agendar</label>

# We'll just target the string "Sin Agendar" and ensure the bytes before it are the correct emoji
idx_content = idx_content.replace(b'(!) Sin Agendar', b'\xe2\x9a\xa0\xef\xb8\x8f Sin Agendar')
# If it has the corrupted bytes (?? seen as e2 9a a0 ef b8 8f or similar)
# We'll just leave it if it's already there, but let's re-save to be sure.

with open(index_path, 'wb') as f:
    f.write(idx_content)

print("Icons restored in logica.js and index.html")
