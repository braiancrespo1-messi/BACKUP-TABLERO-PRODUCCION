import urllib.request
import urllib.parse
import json

AUTH_USER = "mercadolibre@tmcrespo.com.ar"
AUTH_PASS = "AdministracionMessi"
TOKEN_URL = "https://api.yiqi.com.ar/token"
GETLIST_URL = "https://api.yiqi.com.ar/api/instancesApi/GetList"
GETINSTANCE_URL = "https://api.yiqi.com.ar/api/instancesApi/GetInstance"

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

# Get list of clients
list_url = f"{GETLIST_URL}?entityId=345&schemaId=1491&smartieId=2603"
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}
body = json.dumps({
    "page": 1,
    "pageSize": 30
}).encode("utf-8")
req_list = urllib.request.Request(list_url, data=body, headers=headers, method="POST")

with urllib.request.urlopen(req_list) as resp:
    res = json.loads(resp.read().decode("utf-8"))
    rows = res.get("data", []) or res.get("rows", []) or res.get("instances", [])

print(f"Checking {len(rows)} clients...")
for row in rows:
    cid = row.get("ID") or row.get("id")
    cname = row.get("CLIE_RAZON_SOCIAL") or row.get("CLIE_NOMBRE")
    inst_url = f"{GETINSTANCE_URL}?entityId=345&schemaId=1491&id={cid}"
    req_inst = urllib.request.Request(inst_url, headers={"Authorization": f"Bearer {token}"}, method="GET")
    try:
        with urllib.request.urlopen(req_inst) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            inst = data.get("data") or data.get("instances") or data
            
            # Scan atts and attsFkTexts
            atts = inst.get("atts", {})
            attsFkTexts = inst.get("attsFkTexts", {})
            
            # Let's search if any attribute value or text contains tidc or if we find a TIDC value
            # Let's print any attribute key in attsFkTexts that maps to "Plata", "Premium", "Nacional" 
            # or any key in atts that contains a TIDC-like structure (e.g. references entity 1038)
            for k, val in atts.items():
                val_raw = val.get("value")
                fk_text = attsFkTexts.get(k, "")
                if val_raw in [1, 2, 3] or fk_text in ["Plata", "Premium", "Nacional"]:
                    print(f"Client: {cname} (ID {cid}) -> Attribute {k} has val={val_raw}, fk_text={fk_text}")
                # Print also if the attribute is described as Tipo de Cliente in any way
                # Since we don't have descriptions, let's look at all non-empty fkTexts
            
    except Exception as e:
        print(f"Error checking client {cname}: {e}")
