import json

log_path = r"C:\Users\Usuario\.gemini\antigravity\brain\4982a5b6-bf39-4c6a-81a8-f61da3494145\.system_generated\logs\transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
# Print lines from 970 to 1000
for i in range(970, min(1005, len(lines))):
    line = lines[i]
    try:
        obj = json.loads(line)
        source = obj.get('source')
        type_ = obj.get('type')
        print(f"--- Line {i} | Source: {source} | Type: {type_} ---")
        if 'content' in obj:
            print("Content:", obj['content'][:500])
        if 'tool_calls' in obj:
            print("Tool calls:", json.dumps(obj['tool_calls'], indent=2)[:300])
    except Exception as e:
        print(f"Error line {i}: {e}")
