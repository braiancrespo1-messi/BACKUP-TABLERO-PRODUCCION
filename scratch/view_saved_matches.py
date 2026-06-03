import os
import json

files = [f for f in os.listdir(".") if f.startswith("match_line_") and f.endswith(".json")]

for filename in files:
    try:
        with open(filename, "r", encoding="utf-8") as f:
            data = json.load(f)
            target = data.get("TargetFile", "")
            # check what keys are in data
            keys = list(data.keys())
            code_len = len(data.get("CodeContent", ""))
            repl_len = len(data.get("ReplacementContent", ""))
            print(f"File: {filename}")
            print(f"  TargetFile: {target}")
            print(f"  Keys: {keys}")
            if code_len:
                print(f"  CodeContent length: {code_len}")
            if repl_len:
                print(f"  ReplacementContent length: {repl_len}")
            if "ReplacementChunks" in data:
                chunks = data["ReplacementChunks"]
                print(f"  ReplacementChunks: {len(chunks)} chunks")
    except Exception as e:
        print(f"Error reading {filename}: {e}")
