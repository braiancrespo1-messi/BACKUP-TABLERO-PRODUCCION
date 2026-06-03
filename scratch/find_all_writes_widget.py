import json

transcript_path = r"C:\Users\Usuario\.gemini\antigravity\brain\4982a5b6-bf39-4c6a-81a8-f61da3494145\.system_generated\logs\transcript.jsonl"

def clean_arg(val):
    if isinstance(val, str):
        if val.startswith('"') and val.endswith('"'):
            try:
                return json.loads(val)
            except:
                pass
    return val

with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        try:
            data = json.loads(line)
        except:
            continue
        tool_calls = data.get("tool_calls", [])
        for tc in tool_calls:
            name = tc.get("name")
            args = tc.get("args", {})
            target_file = clean_arg(args.get("TargetFile", ""))
            if target_file and "widget_estado_cuenta.html" in target_file:
                print(f"Line {idx}, step_index: {data.get('step_index')}, tool: {name}, TargetFile: {target_file}")
