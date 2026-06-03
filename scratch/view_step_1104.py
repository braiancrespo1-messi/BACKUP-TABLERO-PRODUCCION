import json

transcript_path = r"C:\Users\Usuario\.gemini\antigravity\brain\4982a5b6-bf39-4c6a-81a8-f61da3494145\.system_generated\logs\transcript.jsonl"

with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if idx == 1104:
            data = json.loads(line)
            print(json.dumps(data, indent=2))
            break
