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
        pass
except Exception as e:
    print('Login error:', e)
    exit(1)

# 2. Query MOVIMIENTOS_CLIENTES for clients
client_codes = ['7550', '18557', '9061', '5939', '7867', '10778']
query_url = 'https://me.yiqi.com.ar/api/public/MOVIMIENTOS_CLIENTES/query?schemaId=1491'

for code in client_codes:
    query_body = {
        'page': 1,
        'pageSize': 1000, # Load all for accurate calculation
        'columns': [
            {'field': 'FECHA'},
            {'field': 'COMPROBANTE'},
            {'field': 'DEBE'},
            {'field': 'HABER'},
            {'field': 'PENDIENTE_PAGO'}
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
            
            # Sort chronologically to compute running balance
            rows = sorted(rows, key=lambda x: x.get('FECHA', ''))
            
            running_balance = 0
            total_deuda_pendiente = 0
            
            for r in rows:
                debe = float(r.get('DEBE') or 0)
                haber = float(r.get('HABER') or 0)
                running_balance += debe - haber
                
                # Check if it is a debit movement
                is_debit = debe > 0
                if is_debit:
                    pendiente = float(r.get('PENDIENTE_PAGO') or 0)
                    total_deuda_pendiente += pendiente
            
            saldo_actual = running_balance
            saldo_no_imputado = max(0.0, total_deuda_pendiente - saldo_actual)
            
            print(f'Client: {code:5} | Saldo Actual: {saldo_actual:12.2f} | Total Deuda Pendiente: {total_deuda_pendiente:12.2f} | Saldo No Imputado: {saldo_no_imputado:12.2f}')
    except Exception as e:
        print('Error for client', code, ':', e)
