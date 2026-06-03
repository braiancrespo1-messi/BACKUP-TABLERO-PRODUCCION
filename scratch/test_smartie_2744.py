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
    "pageSize": 5,
    "search": "le70452"
}).encode("utf-8")
req_list = urllib.request.Request(list_url, data=body, headers=headers, method="POST")

try:
    with urllib.request.urlopen(req_list) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        rows = res.get("data", []) or res.get("rows", []) or res.get("instances", [])
        print(f"Smartie 2744 returned {len(rows)} rows.")
        for row in rows[:3]:
            sku = row.get("MATE_CODIGO")
            name = row.get("MATE_NOMBRE")
            stock = row.get("MATE_STOCK_DISPONIBLE")
            l1_net = row.get("MATE_PRECIO_LISTA_1___NET")
            l2_net = row.get("MATE_PRECIO_LISTA_2___NET")
            iva = row.get("ALIV_PORCENTAJE")
            print(f"SKU: {sku} | Name: {name}")
            print(f"  Stock: {stock} | List1 Net: {l1_net} | List2 Net: {l2_net} | IVA: {iva}")
            print("  All keys in row:", list(row.keys()))
            print("-" * 50)
except Exception as e:
    print(f"Error querying Smartie 2744: {e}")
