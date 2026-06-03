import os
import json

files = [f for f in os.listdir(".") if f.startswith("match_line_") and f.endswith(".json")]

for filename in files:
    try:
        with open(filename, "r", encoding="utf-8") as f:
            data = json.load(f)
            
            content = data.get("content", "")
            thinking = data.get("thinking", "")
            
            # Let's search inside the log
            # For VIEW_FILE
            if "widget_estado_cuenta.html" in content or "widget_estado_cuenta.html" in thinking:
                print(f"File {filename}: contains reference in content/thinking. Length: {len(content)}")
                # check if there is File Path in content
                for line in content.split("\n"):
                    if "File Path" in line or "TargetFile" in line:
                        print(f"  {line}")
                        
            # For tool_calls
            tool_calls = data.get("tool_calls", [])
            for tc in tool_calls:
                args = tc.get("args", {})
                target = args.get("TargetFile", "")
                if "widget_estado_cuenta.html" in target:
                    print(f"File {filename}: contains write/replace to widget_estado_cuenta.html in tool_calls!")
                    
    except Exception as e:
        print(f"Error reading {filename}: {e}")
