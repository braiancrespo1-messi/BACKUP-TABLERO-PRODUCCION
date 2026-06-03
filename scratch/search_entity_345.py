import os

root_dir = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0"

for dirpath, dirnames, filenames in os.walk(root_dir):
    if "node_modules" in dirpath or ".git" in dirpath:
        continue
    for filename in filenames:
        if filename.endswith(".js"):
            filepath = os.path.join(dirpath, filename)
            try:
                with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                    content = f.read()
                if "345" in content:
                    print(f"File: {filepath}")
            except Exception as e:
                pass
