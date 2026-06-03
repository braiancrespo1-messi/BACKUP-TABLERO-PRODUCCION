import os
import glob

# Files to remove from root directory
root_patterns = [
    "match_line_*.json",
    "widget_at_step_*.html",
    "temp_*.js",
    "paths_list.txt",
    "op_info.txt"
]

for pat in root_patterns:
    for f in glob.glob(pat):
        try:
            os.remove(f)
            print(f"Removed {f}")
        except Exception as e:
            print(f"Error removing {f}: {e}")

# Also remove temp files in scratch/
scratch_files = [
    r"scratch\temp_widget.js",
    r"scratch\temp_test.js"
]
for f in scratch_files:
    if os.path.exists(f):
        try:
            os.remove(f)
            print(f"Removed {f}")
        except Exception as e:
            print(f"Error removing {f}: {e}")
