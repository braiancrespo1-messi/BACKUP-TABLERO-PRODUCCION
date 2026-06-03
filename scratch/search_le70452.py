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

# Query Smartie 2744
list_url = f"{GETLIST_URL}?entityId=782&schemaId=1491&smartieId=2744"
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}
body = json.dumps({
    "page": 1,
    "pageSize": 50,
    "search": "LE70452"
}).encode("utf-8")
req_list = urllib.request.Request(list_url, data=body, headers=headers, method="POST")

with urllib.request.urlopen(req_list) as resp:
    res = json.loads(resp.read().decode("utf-8"))
    rows = res.get("data", []) or res.get("rows", []) or res.get("instances", [])
    print(f"Smartie 2744 search 'LE70452' returned {len(rows)} rows:")
    for row in rows:
        sku = row.get("MATE_CODIGO")
        name = row.get("MATE_NOMBRE")
        stock = row.get("MATE_STOCK_DISPONIBLE")
        print(f"SKU: {sku} | Stock: {stock} | Name: {name}")
