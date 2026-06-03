
import os
import re

files = [
    r"g:\Mi unidad\TMC - Administración\PROYECTOS TMC\TABLERO_V2\index.html",
    r"g:\Mi unidad\TMC - Administración\PROYECTOS TMC\TABLERO_V2\logica.js",
    r"g:\Mi unidad\TMC - Administración\PROYECTOS TMC\TABLERO_V2\estilos.css"
]

invisible_chars = {
    '\u00A0': 'NO-BREAK SPACE',
    '\u200B': 'ZERO WIDTH SPACE',
    '\u200C': 'ZERO WIDTH NON-JOINER',
    '\u200D': 'ZERO WIDTH JOINER',
    '\uFEFF': 'ZERO WIDTH NO-BREAK SPACE',
    '\u202F': 'NARROW NO-BREAK SPACE',
    '\u007F': 'DELETE',
    '\u0000': 'NULL'
}

for file_path in files:
    print(f"Scanning {file_path}...")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        found = False
        for i, char in enumerate(content):
            if char in invisible_chars:
                snippet = content[max(0, i-10):min(len(content), i+10)].replace('\n', '\\n')
                print(f"  Found {invisible_chars[char]} at index {i}. Context: ...{snippet}...")
                found = True
            elif ord(char) > 127 and char not in ['á','é','í','ó','ú','ñ','Á','É','Í','Ó','Ú','Ñ','¿','¡','📝','🗓','️','🔄','🗑','❌','🔨','↕','🔍','⚠️','📅','🧩','✅','❓','🏭','❯','❮']:
                # Inspect other non-ascii chars to see if they are the issue
                # Note: The emojis above might be multi-char, so this check is simplistic but helps spot weird things.
                pass
                
        if not found:
            print("  No common invisible characters found.")
            
    except Exception as e:
        print(f"  Error reading file: {e}")
