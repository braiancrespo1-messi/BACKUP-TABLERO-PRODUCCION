import urllib.request, urllib.parse, http.cookiejar, json

# 1. Login using HTTPCookieProcessor
cookie_jar = http.cookiejar.CookieJar()
handler = urllib.request.HTTPCookieProcessor(cookie_jar)
opener = urllib.request.build_opener(handler)

url_login = 'https://me.yiqi.com.ar/Account/Login?ReturnUrl=%2F'
data_login = urllib.parse.urlencode({
    'UserName': 'mercadolibre@tmcrespo.com.ar',
    'Password': 'AdministracionMessi',
    'RememberMe': 'true',
    'sid': ''
}).encode('utf-8')

req_login = urllib.request.Request(url_login, data=data_login, method='POST')
try:
    with opener.open(req_login) as response:
        print('Login success.')
except Exception as e:
    print('Login error:', e)
    exit(1)

# Query COBRO to see fields of a receipt
query_url = 'https://me.yiqi.com.ar/api/public/COBRO/query?schemaId=1491'
query_body = {
    'page': 1,
    'pageSize': 10,
    'columns': [
        {'field': 'id'},
        {'field': 'COBR_NRODERECIBO'},
        {'field': 'COBR_TOTAL_COBRADO'},
        {'field': 'COBR_FECHA'},
        {'field': 'CLIE_ID_CLIE'},
        {'field': 'COBR_OBSERVACIONES'},
        {'field': 'ESTA_NOMBRE'}
    ]
}

req_query = urllib.request.Request(query_url, data=json.dumps(query_body).encode('utf-8'), method='POST')
req_query.add_header('Content-Type', 'application/json')

try:
    with opener.open(req_query) as response:
        res_data = json.loads(response.read().decode('utf-8'))
        rows = res_data.get('rows', res_data.get('data', {}).get('rows', []))
        print(f'COBRO count: {len(rows)}')
        if rows:
            first_id = rows[0].get('id')
            print(f'Fetching detail for COBRO ID: {first_id}')
            detail_url = f'https://me.yiqi.com.ar/api/public/COBRO/{first_id}?schemaId=1491'
            req_detail = urllib.request.Request(detail_url, method='GET')
            with opener.open(req_detail) as det_resp:
                det_data = json.loads(det_resp.read().decode('utf-8'))
                print('COBRO Detail keys:')
                for k, v in det_data.items():
                    if not isinstance(v, (list, dict)):
                        if 'pendiente' in k.lower() or 'saldo' in k.lower() or 'total' in k.lower() or 'cobr' in k.lower():
                            print(f'  {k}: {v}')
                    else:
                        print(f'  {k}: {type(v)} of length {len(v)}')
except Exception as e:
    print('Query error:', e)
