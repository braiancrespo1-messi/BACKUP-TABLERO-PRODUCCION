import json
import os

transcript_path = r"C:\Users\Usuario\.gemini\antigravity\brain\4982a5b6-bf39-4c6a-81a8-f61da3494145\.system_generated\logs\transcript.jsonl"
out_dir = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\scratch\reconstructed"
os.makedirs(out_dir, exist_ok=True)

# We want to reconstruct the content of widget_estado_cuenta.html step by step.
file_content = ""

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
        except Exception as e:
            print(f"JSON error line {idx}: {e}")
            continue
            
        step = data.get("step_index")
        tool_calls = data.get("tool_calls", [])
        for tc in tool_calls:
            name = tc.get("name")
            args = tc.get("args", {})
            target_file = clean_arg(args.get("TargetFile", ""))
            
            if not target_file or "widget_estado_cuenta.html" not in target_file:
                continue
                
            print(f"Applying step {step} ({name})")
            
            if name == "write_to_file":
                code_content = clean_arg(args.get("CodeContent", ""))
                file_content = code_content
                print(f"  Initialized file. Size: {len(file_content)}")
                
            elif name == "replace_file_content":
                target = clean_arg(args.get("TargetContent", ""))
                repl = clean_arg(args.get("ReplacementContent", ""))
                if target in file_content:
                    file_content = file_content.replace(target, repl)
                    print(f"  Replaced. Size now: {len(file_content)}")
                else:
                    # Try with normalized newlines
                    file_content_norm = file_content.replace("\r\n", "\n")
                    target_norm = target.replace("\r\n", "\n")
                    repl_norm = repl.replace("\r\n", "\n")
                    if target_norm in file_content_norm:
                        file_content_norm = file_content_norm.replace(target_norm, repl_norm)
                        file_content = file_content_norm
                        print(f"  Replaced with normalized newlines. Size now: {len(file_content)}")
                    else:
                        print(f"  WARNING: Target content not found in step {step}!")
                        # Print target preview
                        print(f"  Target preview: {repr(target[:100])}")
                        
            elif name == "multi_replace_file_content":
                chunks = args.get("ReplacementChunks", [])
                if isinstance(chunks, str):
                    try:
                        chunks = json.loads(chunks)
                    except:
                        pass
                
                # Apply chunks
                for chunk in chunks:
                    target = clean_arg(chunk.get("TargetContent", ""))
                    repl = clean_arg(chunk.get("ReplacementContent", ""))
                    if target in file_content:
                        file_content = file_content.replace(target, repl)
                        print(f"    Chunk replaced. Size now: {len(file_content)}")
                    else:
                        file_content_norm = file_content.replace("\r\n", "\n")
                        target_norm = target.replace("\r\n", "\n")
                        repl_norm = repl.replace("\r\n", "\n")
                        if target_norm in file_content_norm:
                            file_content_norm = file_content_norm.replace(target_norm, repl_norm)
                            file_content = file_content_norm
                            print(f"    Chunk replaced with normalized newlines. Size now: {len(file_content)}")
                        else:
                            print(f"    WARNING: Chunk target content not found in step {step}!")
                            print(f"    Target preview: {repr(target[:100])}")
            
            # Save the file at this step
            out_file = os.path.join(out_dir, f"step_{step}.html")
            with open(out_file, "w", encoding="utf-8") as out:
                out.write(file_content)
            print(f"  Saved reconstructed version to {out_file}")

print("Done Reconstructing History!")
