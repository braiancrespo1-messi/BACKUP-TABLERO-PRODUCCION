import urllib.request
import urllib.parse
import http.cookiejar
import sys
import os

# Credenciales de YiQi
USERNAME = "mercadolibre@tmcrespo.com.ar"
PASSWORD = "AdministracionMessi"

def descargar_reporte_pdf(schema_id, report_id, instance_id, output_filename):
    """
    Inicia sesión en me.yiqi.com.ar mediante cookies y descarga el PDF de un reporte.
    """
    print(f"Iniciando sesión en me.yiqi.com.ar para {USERNAME}...")
    
    # 1. Configurar el manejador de cookies automático
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    
    # 2. Realizar POST de Login
    login_url = "https://me.yiqi.com.ar/Account/Login?ReturnUrl=%2F"
    login_data = urllib.parse.urlencode({
        "UserName": USERNAME,
        "Password": PASSWORD,
        "RememberMe": "true",
        "sid": ""
    }).encode("utf-8")
    
    try:
        req = urllib.request.Request(login_url, data=login_data, method="POST")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        
        with opener.open(req) as resp:
            # Si el inicio de sesión es exitoso, redirecciona a la raíz
            if resp.status == 200:
                print("¡Inicio de sesión exitoso!")
            else:
                print(f"Advertencia: Código de respuesta de login: {resp.status}")
    except Exception as e:
        print(f"Error al iniciar sesión: {e}")
        return False

    # Mostrar cookies obtenidas
    print("Sesión establecida. Cookies obtenidas:")
    for cookie in cj:
        print(f"  - {cookie.name}: {cookie.value[:15]}...")
        
    # 3. Solicitar el reporte PDF con la sesión activa (cookies)
    report_url = f"https://me.yiqi.com.ar/report/view?schemaId={schema_id}&reportId={report_id}&instanceId={instance_id}"
    print(f"Descargando reporte desde: {report_url}")
    
    try:
        report_req = urllib.request.Request(report_url, method="GET")
        with opener.open(report_req) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "application/pdf" not in content_type:
                print(f"Error: La respuesta no es un PDF. Content-Type: {content_type}")
                # Imprimir los primeros caracteres por si es un error HTML
                body = resp.read()
                print(body[:200].decode("utf-8", errors="ignore"))
                return False
                
            pdf_data = resp.read()
            print(f"PDF descargado con éxito ({len(pdf_data)} bytes).")
            
            # Guardar el archivo
            with open(output_filename, "wb") as f:
                f.write(pdf_data)
            print(f"Archivo guardado como: {os.path.abspath(output_filename)}")
            return True
            
    except Exception as e:
        print(f"Error al descargar el reporte: {e}")
        return False

if __name__ == "__main__":
    # Parámetros del ejemplo del usuario:
    # Pedido: https://me.yiqi.com.ar/view/PEDIDO?schemaId=1491#/27962
    # Notificación de pedido: reportId=136, instanceId=27962, schemaId=1491
    schema = 1491
    report = 136
    instance = 27962
    output = "notificacion_pedido_27962.pdf"
    
    descargar_reporte_pdf(schema, report, instance, output)
