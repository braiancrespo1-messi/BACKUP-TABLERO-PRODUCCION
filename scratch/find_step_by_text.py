import json

transcript_path = r"C:\Users\Usuario\.gemini\antigravity\brain\4982a5b6-bf39-4c6a-81a8-f61da3494145\.system_generated\logs\transcript.jsonl"

with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if "El modal hace una consulta en tiempo real" in line:
            try:
                data = json.loads(line)
                print(f"Match found at line {idx}, step_index: {data.get('step_index')}, type: {data.get('type')}")
                print(f"Content: {data.get('content')[:300]}")
            except Exception as e:
                print(f"Error on line {idx}: {e}")
