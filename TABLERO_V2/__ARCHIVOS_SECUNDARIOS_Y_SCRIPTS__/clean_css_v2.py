
import sys

path = r'g:\Mi unidad\TMC - Administración\PROYECTOS TMC\TABLERO_V2\estilos.css'

with open(path, 'rb') as f:
    lines = f.readlines()

new_lines = []
in_th_after = False

for line in lines:
    if b'th::after {' in line:
        in_th_after = True
        new_lines.append(line)
        continue
    
    if in_th_after and b'content:' in line:
        # Replace the entire content line with a clean one
        new_lines.append(b"                content: '';\n")
        continue

    if in_th_after and b'}' in line:
        in_th_after = False
        new_lines.append(line)
        continue
    
    # Also fix the "Soltar aqui" line which was also corrupted
    if b'Soltar aqu' in line and b'content:' in line:
        new_lines.append(b'                content: "Soltar aqui";\n')
        continue

    new_lines.append(line)

with open(path, 'wb') as f:
    f.writelines(new_lines)

print("estilos.css cleaned successfully with block targeting.")
