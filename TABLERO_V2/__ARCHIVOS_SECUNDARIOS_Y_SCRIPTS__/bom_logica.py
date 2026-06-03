
import codecs

fpath = r"g:\Mi unidad\TMC - Administración\PROYECTOS TMC\TABLERO_V2\logica.js"
try:
    with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    with open(fpath, 'w', encoding='utf-8-sig') as f:
        f.write(content)
    print("Saved logica.js with BOM")
except Exception as e:
    print(e)
