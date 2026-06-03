
import sys

path = r'g:\Mi unidad\TMC - Administración\PROYECTOS TMC\TABLERO_V2\logica.js'
with open(path, 'rb') as f:
    content = f.read()

# Find the sort indicator line
start_marker = b'targetTh.innerHTML += sortObj.asc ?'
end_marker = b';'

start_idx = content.find(start_marker)
if start_idx != -1:
    end_idx = content.find(end_marker, start_idx) + 10
    snippet = content[start_idx:end_idx]
    print(f"Hex dump of logica.js sort indicators:")
    for i in range(0, len(snippet), 16):
        chunk = snippet[i:i+16]
        hex_str = ' '.join(f'{b:02x}' for b in chunk)
        ascii_str = ''.join(chr(b) if 32 <= b <= 126 else '.' for b in chunk)
        print(f"{i:04x}: {hex_str:<48} |{ascii_str}|")
else:
    print("Start marker not found")
