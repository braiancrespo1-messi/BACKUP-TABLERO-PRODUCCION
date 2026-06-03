import json

transcript_path = r"C:\Users\Usuario\.gemini\antigravity\brain\4982a5b6-bf39-4c6a-81a8-f61da3494145\.system_generated\logs\transcript.jsonl"

with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if "run_command" in line and ("deploy" in line or "firebase" in line):
            try:
                data = json.loads(line)
                print(f"Line {idx}, step: {data.get('step_index')}")
                for tc in data.get("tool_calls", []):
                    if tc.get("name") == "run_command":
                        cmd = tc.get("args", {}).get("CommandLine", "")
                        print(f"  CMD: {cmd}")
            except Exception as e:
                pass
