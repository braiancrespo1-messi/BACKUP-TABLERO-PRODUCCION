import urllib.request, ssl, json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

modules = json.loads(urllib.request.urlopen('https://apidoc.yiqi.com.ar/modules.json', context=ctx).read())
all_entities = {}

for m in modules:
    if m['id'] == 'security':
        continue
    try:
        url = 'https://apidoc.yiqi.com.ar/' + m['spec']
        data = json.loads(urllib.request.urlopen(url, context=ctx).read())
        paths = list(data.get('paths', {}).keys())
        entities = set()
        for p in paths:
            parts = p.strip('/').split('/')
            if parts[0]:
                entities.add(parts[0])
        for e in sorted(entities):
            all_entities[e] = m['name']
        print(m['name'] + ': ' + str(sorted(entities)))
    except Exception as ex:
        print(m['name'] + ': ERROR ' + str(ex))

print()
print('=== TODAS LAS ENTIDADES ===')
for e, mod in sorted(all_entities.items()):
    print('  ' + e + ' -> ' + mod)
