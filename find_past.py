import os
import json
import re

brain_dir = r"C:\Users\Usuario\.gemini\antigravity\brain"
keywords = ['qr', 'lectura', 'workflow', 'calle']

for root, dirs, files in os.walk(brain_dir):
    if "transcript.jsonl" in files:
        filepath = os.path.join(root, "transcript.jsonl")
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    if '"source":"USER_EXPLICIT"' in line or '"type":"USER_INPUT"' in line:
                        data = json.loads(line)
                        content = data.get("content", "")
                        if any(k in content.lower() for k in keywords):
                            print(f"CONV: {os.path.basename(root)}")
                            print(f"MSG: {content}")
                            print("-" * 50)
        except Exception as e:
            pass
