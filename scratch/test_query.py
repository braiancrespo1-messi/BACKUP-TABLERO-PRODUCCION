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

# 2. Query MOVIMIENTOS_CLIENTES for clients
client_codes = ['7550', '18557', '9061', '5939', '7867', '10778']
query_url = 'https://me.yiqi.com.ar/api/public/MOVIMIENTOS_CLIENTES/query?schemaId=1491'

for code in client_codes:
    print(f'\n=== Movements for Client: {code} ===')
    query_body = {
        'page': 1,
        'pageSize': 50,
        'columns': [
            {'field': 'FECHA'},
            {'field': 'COMPROBANTE'},
            {'field': 'DEBE'},
            {'field': 'HABER'},
            {'field': 'PENDIENTE_PAGO'},
            {'field': 'CLIE_SALDO_CLIENTE'},
            {'field': 'ESTADO'}
        ],
        'filters': [
            {'columnName': 'CLIE_ID_CLIE', 'operator': '=', 'value': str(code)}
        ]
    }
    
    req_query = urllib.request.Request(query_url, data=json.dumps(query_body).encode('utf-8'), method='POST')
    req_query.add_header('Content-Type', 'application/json')
    
    try:
        with opener.open(req_query) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            
            # Extract rows robustly
            rows = []
            if isinstance(res_data, list):
                rows = res_data
            elif isinstance(res_data, dict):
                if 'rows' in res_data:
                    rows = res_data['rows']
                elif 'data' in res_data:
                    d = res_data['data']
                    if isinstance(d, list):
                        rows = d
                    elif isinstance(d, dict):
                        rows = d.get('rows', [])
                else:
                    rows = res_data.get('data', [])
            
            print(f'Total rows found: {len(rows)}')
            for r in rows[:15]:  # print first 15
                print(f"Fecha: {r.get('FECHA')} | Comp: {r.get('COMPROBANTE')} | Debe: {r.get('DEBE')} | Haber: {r.get('HABER')} | Pendiente: {r.get('PENDIENTE_PAGO')} | SaldoClie: {r.get('CLIE_SALDO_CLIENTE')} | Estado: {r.get('ESTADO')}")
    except Exception as e:
        print('Query error for client', code, ':', e)
