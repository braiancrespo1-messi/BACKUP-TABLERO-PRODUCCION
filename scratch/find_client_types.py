import urllib.request
import urllib.parse
import json

AUTH_USER = "mercadolibre@tmcrespo.com.ar"
AUTH_PASS = "AdministracionMessi"
TOKEN_URL = "https://api.yiqi.com.ar/token"
GETLIST_URL = "https://api.yiqi.com.ar/api/instancesApi/GetList"

params = urllib.parse.urlencode({
    "grant_type": "password",
    "username": AUTH_USER,
    "password": AUTH_PASS
}).encode("utf-8")

req = urllib.request.Request(TOKEN_URL, data=params, method="POST")
req.add_header("Content-Type", "application/x-www-form-urlencoded")

with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode("utf-8"))["access_token"]

# Let's get the list of clients without search term, just page 1
list_url = f"{GETLIST_URL}?entityId=345&schemaId=1491&smartieId=2603"
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}
body = json.dumps({
    "page": 1,
    "pageSize": 50
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
    found_types = 0
    for row in rows[:15]:
        # Check if there is any field related to TIDC
        tidc_keys = [k for k in row.keys() if "TIDC" in k or "TIPO" in k or "TYPE" in k]
        cname = row.get("CLIE_RAZON_SOCIAL") or row.get("CLIE_NOMBRE")
        print(f"Client: {cname}")
        for k in tidc_keys:
            print(f"  {k}: {row[k]}")
            if row[k]:
                found_types += 1
    print(f"\nFound {found_types} non-null type values in first 15 rows")
