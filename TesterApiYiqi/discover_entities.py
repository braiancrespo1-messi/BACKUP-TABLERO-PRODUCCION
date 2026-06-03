"""
Descubrir Entity IDs via el proxy local con GET (que es lo que funciona)
"""
import urllib.request, json, sys, time

PROXY = "http://localhost:8089/proxy/"

# Token via proxy
body = "grant_type=password&username=mercadolibre@tmcrespo.com.ar&password=AdministracionMessi".encode()
req = urllib.request.Request(PROXY + "https://api.yiqi.com.ar/token", data=body,
    headers={"Content-Type": "application/x-www-form-urlencoded"}, method="POST")
token = json.loads(urllib.request.urlopen(req).read())["access_token"]
print("Token OK")

def try_entity(eid):
    url = PROXY + f"https://api.yiqi.com.ar/api/instancesApi/GetList?entityId={eid}&schemaId=1491"
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token}, method="GET")
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read())
        total = data.get("total", 0)
        cols = data.get("columns", [])
        col_titles = [c.get("title","?") for c in cols[:5]]
        return {"id": eid, "total": total, "cols": col_titles}
    except:
        return None

# Test known entity
r = try_entity(794)
print(f"Test 794: {r}")
if not r:
    print("PROXY NO FUNCIONA")
    sys.exit(1)

# Scan ranges
print("\n=== SCANNING ===")
found = []
ranges = (
    list(range(750, 820)) +
    list(range(820, 900)) +
    list(range(1200, 1260)) +
    list(range(1380, 1420)) +
    list(range(1440, 1500))
)

for idx, eid in enumerate(ranges):
    r = try_entity(eid)
    if r:
        found.append(r)
        print(f"  FOUND {eid}: total={r['total']}, cols={r['cols']}")
        sys.stdout.flush()
    
    if (idx + 1) % 30 == 0:
        print(f"  ... {idx+1}/{len(ranges)} probados, {len(found)} encontrados")
        sys.stdout.flush()
        time.sleep(0.3)

print(f"\n=== RESULTADO: {len(found)} entidades ===")
for f in found:
    print(f"  Entity {f['id']}: {f['total']} registros -> {f['cols']}")
