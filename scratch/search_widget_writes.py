import json
import os
import re

transcript_path = r"C:\Users\Usuario\.gemini\antigravity\brain\4982a5b6-bf39-4c6a-81a8-f61da3494145\.system_generated\logs\transcript.jsonl"
out_dir = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\scratch\versions"
os.makedirs(out_dir, exist_ok=True)

with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
    for idx, line in enumerate(f):
        if "widget_estado_cuenta.html" in line:
            try:
                data = json.loads(line)
                tool_calls = data.get("tool_calls", [])
                for tc in tool_calls:
                    name = tc.get("name")
                    args = tc.get("args", {})
                    target_file = args.get("TargetFile", "")
                    if isinstance(target_file, str):
                        # clean quotes if they are present in JSON value
                        if target_file.startswith('"') and target_file.endswith('"'):
                            target_file = json.loads(target_file)
                    
                    if "widget_estado_cuenta.html" in target_file:
                        step = data.get("step_index")
                        print(f"Match at step {step}: tool {name}")
                        content = ""
                        if name == "write_to_file":
                            code_content = args.get("CodeContent", "")
                            if isinstance(code_content, str):
                                if code_content.startswith('"') and code_content.endswith('"'):
                                    try:
                                        code_content = json.loads(code_content)
                                    except:
                                        pass
                            content = code_content
                        elif name in ("replace_file_content", "multi_replace_file_content"):
                            # This is a replacement, we could print details but let's just log it
                            print(f"  Replacement at step {step}")
                            # print the replacement content
                            repl = args.get("ReplacementContent", "")
                            if repl:
                                if repl.startswith('"') and repl.endswith('"'):
                                    try:
                                        repl = json.loads(repl)
                                    except:
                                        pass
                                print(f"  Replacement content preview: {repl[:100]}...")
                                
                        if content:
                            out_file = os.path.join(out_dir, f"version_{step}.html")
                            with open(out_file, "w", encoding="utf-8") as out:
                                out.write(content)
                            print(f"  Saved version to {out_file}")
            except Exception as e:
                print(f"Error parsing line {idx}: {e}")
