import os

search_terms = ["childrenApi", "GetChildList", "GetList", "MOVIMIENTOS_CLIENTES", "api/public", "schemaId"]
root_dir = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0"

for dirpath, dirnames, filenames in os.walk(root_dir):
    # Skip node_modules and .git
    if "node_modules" in dirpath or ".git" in dirpath:
        continue
    for filename in filenames:
        if filename.endswith((".js", ".py", ".txt", ".json", ".html", ".md")):
            filepath = os.path.join(dirpath, filename)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                found = []
                for term in search_terms:
                    if term.lower() in content.lower():
                        found.append(term)
                if found:
                    print(f"File: {filepath} | Contains: {found}")
            except Exception as e:
                pass
