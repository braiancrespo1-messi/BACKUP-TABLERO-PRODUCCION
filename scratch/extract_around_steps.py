import json
import os

transcript_path = r"C:\Users\Usuario\.gemini\antigravity\brain\4982a5b6-bf39-4c6a-81a8-f61da3494145\.system_generated\logs\transcript.jsonl"

def clean_arg(val):
    if isinstance(val, str):
        if val.startswith('"') and val.endswith('"'):
            try:
                return json.loads(val)
            except:
                pass
    return val

target_steps = [1825, 2318]

with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        try:
            data = json.loads(line)
        except:
            continue
        step = data.get("step_index")
        if step in target_steps or (step is not None and any(abs(step - ts) <= 2 for ts in target_steps)):
            print(f"Line {idx}, step_index: {step}, type: {data.get('type')}, source: {data.get('source')}")
            tool_calls = data.get("tool_calls", [])
            for tc in tool_calls:
                name = tc.get("name")
                args = tc.get("args", {})
                target_file = clean_arg(args.get("TargetFile", ""))
                if target_file:
                    print(f"  Tool: {name}, TargetFile: {target_file}")
                    if "widget_estado_cuenta.html" in target_file:
                        content = clean_arg(args.get("CodeContent", ""))
                        if content:
                            print(f"    CodeContent size: {len(content)}")
                            out_file = f"widget_at_step_{step}.html"
                            with open(out_file, "w", encoding="utf-8") as out:
                                out.write(content)
                            print(f"    Wrote to {out_file}")
