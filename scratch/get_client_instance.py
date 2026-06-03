import urllib.request
import urllib.parse
import json

AUTH_USER = "mercadolibre@tmcrespo.com.ar"
AUTH_PASS = "AdministracionMessi"
TOKEN_URL = "https://api.yiqi.com.ar/token"
GETLIST_URL = "https://api.yiqi.com.ar/api/instancesApi/GetList"
GETINSTANCE_URL = "https://api.yiqi.com.ar/api/instancesApi/GetInstance"

# 1. Get Token
params = urllib.parse.urlencode({
    "grant_type": "password",
    "username": AUTH_USER,
    "password": AUTH_PASS
}).encode("utf-8")

req = urllib.request.Request(TOKEN_URL, data=params, method="POST")
req.add_header("Content-Type", "application/x-www-form-urlencoded")

try:
    with urllib.request.urlopen(req) as resp:
        token = json.loads(resp.read().decode("utf-8"))["access_token"]
        print("Token obtained successfully.")
except Exception as e:
    print(f"Error obtaining token: {e}")
    exit(1)

# 2. Get first client
list_url = f"{GETLIST_URL}?entityId=345&schemaId=1491&smartieId=2603"
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}
body = json.dumps({
    "page": 1,
    "pageSize": 5,
    "search": "Joaquin" # Search for "Joaquin Sabina" or any client
}).encode("utf-8")

req_list = urllib.request.Request(list_url, data=body, headers=headers, method="POST")

try:
    with urllib.request.urlopen(req_list) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        rows = res.get("data", []) or res.get("rows", []) or res.get("instances", [])
        if not rows:
            print("No clients found.")
            exit(1)
        client = rows[0]
        client_id = client.get("ID") or client.get("id")
        print(f"Found client: {client.get('CLIE_RAZON_SOCIAL')} (ID: {client_id})")
except Exception as e:
    print(f"Error searching client: {e}")
    exit(1)

# 3. Get client instance details
inst_url = f"{GETINSTANCE_URL}?entityId=345&schemaId=1491&id={client_id}"
req_inst = urllib.request.Request(inst_url, headers={"Authorization": f"Bearer {token}"}, method="GET")

try:
    with urllib.request.urlopen(req_inst) as resp:
        client_details = json.loads(resp.read().decode("utf-8"))
        data = client_details.get("data") or client_details.get("instances") or client_details
        
        print("\n--- ATTS FK TEXTS ---")
        atts_fk = data.get("attsFkTexts", {})
        for k, v in atts_fk.items():
            print(f"  Attribute {k}: {v}")
            
        print("\n--- ATTS VALUES ---")
        atts = data.get("atts", {})
        for k, v in atts.items():
            print(f"  Attribute {k}: {v}")
            
except Exception as e:
    print(f"Error getting client details: {e}")
