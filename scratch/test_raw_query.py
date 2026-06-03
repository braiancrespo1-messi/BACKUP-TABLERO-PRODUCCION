import requests
import json

USERNAME = "mercadolibre@tmcrespo.com.ar"
PASSWORD = "AdministracionMessi"

def get_token():
    url = "https://api.yiqi.com.ar/token"
    body = {
        "grant_type": "password",
        "username": USERNAME,
        "password": PASSWORD
    }
    r = requests.post(url, data=body)
    if r.ok:
        return r.json().get("access_token")
    
    # Try next
    url = "https://api.yiqi.com.ar/connect/token"
    r = requests.post(url, data=body)
    if r.ok:
        return r.json().get("access_token")
    
    raise Exception("Failed to get token")

def main():
    token = get_token()
    print("Token obtained successfully.")
    
    query_url = "https://api.yiqi.com.ar/api/public/MOVIMIENTOS_CLIENTES/query?schemaId=1491"
    
    # We query all columns to see what values they have
    query_body = {
        "page": 1,
        "pageSize": 5,
        "columns": [
            {"field": "FECHA", "sortDirection": "DESC", "sortOrder": 1},
            {"field": "COMPROBANTE"},
            {"field": "DEBE"},
            {"field": "HABER"},
            {"field": "CLIE_SALDO_CLIENTE"},
            {"field": "PENDIENTE_PAGO"},
            {"field": "IMPORTE"},
            {"field": "id"},
            {"field": "DESC_ESTADO"}
        ],
        "filters": [
            {
                "columnName": "CLIE_ID_CLIE",
                "operator": "=",
                "value": "8000"
            }
        ]
    }
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    r = requests.post(query_url, json=query_body, headers=headers)
    if not r.ok:
        print(f"Error {r.status_code}: {r.text}")
        return
        
    data = r.json()
    print("API Response:")
    print(json.dumps(data, indent=2))

if __name__ == "__main__":
    main()
