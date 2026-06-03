
import os
import re

files = [
    r"g:\Mi unidad\TMC - Administración\PROYECTOS TMC\TABLERO_V2\index.html"
]

for file_path in files:
    print(f"Cleaning {file_path}...")
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Remove C1 Control chars (U+0080 to U+009F)
        # Regex: [\x80-\x9F]
        new_content = re.sub(r'[\x80-\x9F]', '', content)
        
        if content != new_content:
            print("  Removed control characters.")
            with open(file_path, 'w', encoding='utf-8-sig') as f:
                f.write(new_content)
        else:
            print("  No control characters found to remove.")
            
    except Exception as e:
        print(f"Error: {e}")
