import urllib.request
import urllib.parse
import json

AUTH_USER = "mercadolibre@tmcrespo.com.ar"
AUTH_PASS = "AdministracionMessi"
TOKEN_URL = "https://api.yiqi.com.ar/token"
GETLIST_URL = "https://api.yiqi.com.ar/api/instancesApi/GetList"

# Get Token
params = urllib.parse.urlencode({
    "grant_type": "password",
    "username": AUTH_USER,
    "password": AUTH_PASS
}).encode("utf-8")
req = urllib.request.Request(TOKEN_URL, data=params, method="POST")
req.add_header("Content-Type", "application/x-www-form-urlencoded")
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode("utf-8"))["access_token"]

# Get list of articles
list_url = f"{GETLIST_URL}?entityId=782&schemaId=1491&smartieId=2671"
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}
body = json.dumps({
    "page": 1,
    "pageSize": 5,
    "search": "le70452" # Let's search for the exact item they mentioned!
}).encode("utf-8")
req_list = urllib.request.Request(list_url, data=body, headers=headers, method="POST")

with urllib.request.urlopen(req_list) as resp:
    res = json.loads(resp.read().decode("utf-8"))
    columns = res.get("columns", [])
    print("--- COLUMNS ---")
    for col in columns:
        print(f"  Field: {col.get('field')} | Title: {col.get('title')}")
        
    rows = res.get("data", []) or res.get("rows", []) or res.get("instances", [])
    print("\n--- SAMPLE ROW VALUES ---")
    for row in rows:
        print(f"SKU: {row.get('MATE_CODIGO')} | Name: {row.get('MATE_NOMBRE')}")
        # Print all keys that contain stock or are numeric
        stock_keys = [k for k in row.keys() if "STOCK" in k or "CANT" in k or "DISP" in k]
        for k in stock_keys:
            print(f"  {k}: {row[k]}")
        # Print also general keys of the row to understand what's inside
        print("  Keys:", list(row.keys()))
        print("-" * 50)
