
import sys

path = r'g:\Mi unidad\TMC - Administración\PROYECTOS TMC\TABLERO_V2\estilos.css'

with open(path, 'rb') as f:
    content = f.read()

# Replace "th::after { content: '  '; ..." with an empty string for content
# We use byte sequences to avoid encoding issues
target1 = b"th::after {\n                content: '  ';"
replacement1 = b"th::after {\n                content: '';"

# We'll use a more flexible search for these specific corrupted areas
# Line 311 approximately
content = content.replace(b"content: '  ';", b"content: '';")

# Line 891 approximately (Soltar aqui)
# The output showed "content: \"?? Soltar aqu?\";"
# We'll look for the "Soltar aqu" part
idx = content.find(b"Soltar aqu")
if idx != -1:
    # Find start and end of that line/statement
    start = content.rfind(b"content:", 0, idx)
    end = content.find(b";", idx)
    if start != -1 and end != -1:
        content = content[:start] + b'content: "Soltar aqui"' + content[end:]

with open(path, 'wb') as f:
    f.write(content)

print("estilos.css cleaned successfully.")
