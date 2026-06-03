const fs = require('fs');
const path = require('path');

// Credenciales de YiQi
const USERNAME = "mercadolibre@tmcrespo.com.ar";
const PASSWORD = "AdministracionMessi";

async function descargarReportePdf(schemaId, reportId, instanceId, outputFilename) {
    console.log(`Iniciando sesión en me.yiqi.com.ar para ${USERNAME}...`);
    
    const loginUrl = "https://me.yiqi.com.ar/Account/Login?ReturnUrl=%2F";
    const body = new URLSearchParams({
        UserName: USERNAME,
        Password: PASSWORD,
        RememberMe: "true",
        sid: ""
    });
    
    try {
        // 1. Realizar POST de Login. Usamos redirect: 'manual' para evitar seguir la redirección
        // y poder extraer las cabeceras Set-Cookie directamente.
        const loginResponse = await fetch(loginUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body,
            redirect: 'manual'
        });
        
        // Extraer las cookies devueltas por el servidor
        // En Node.js v18+, fetch soporta headers.getSetCookie()
        let cookies = [];
        if (typeof loginResponse.headers.getSetCookie === 'function') {
            cookies = loginResponse.headers.getSetCookie();
        } else {
            // Fallback para entornos donde no esté getSetCookie
            const rawCookies = loginResponse.headers.get('set-cookie');
            if (rawCookies) {
                cookies = rawCookies.split(',').map(c => c.trim());
            }
        }
        
        if (cookies.length === 0) {
            console.error("No se recibieron cookies del servidor. Verificá las credenciales.");
            return false;
        }
        
        // Armar el string para la cabecera Cookie
        const cookieHeader = cookies.map(c => c.split(';')[0]).join('; ');
        console.log("¡Sesión establecida con éxito!");
        
        // 2. Descargar el reporte PDF usando las cookies obtenidas
        const reportUrl = `https://me.yiqi.com.ar/report/view?schemaId=${schemaId}&reportId=${reportId}&instanceId=${instanceId}`;
        console.log(`Descargando reporte desde: ${reportUrl}`);
        
        const reportResponse = await fetch(reportUrl, {
            method: 'GET',
            headers: {
                'Cookie': cookieHeader
            }
        });
        
        if (!reportResponse.ok) {
            console.error(`Error HTTP al descargar reporte: ${reportResponse.status}`);
            const errText = await reportResponse.text();
            console.error(errText.substring(0, 500));
            return false;
        }
        
        const contentType = reportResponse.headers.get('content-type') || '';
        if (!contentType.includes('application/pdf')) {
            console.error(`Error: El contenido recibido no es un PDF. Content-Type: ${contentType}`);
            const text = await reportResponse.text();
            console.error(text.substring(0, 500));
            return false;
        }
        
        const arrayBuffer = await reportResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        fs.writeFileSync(outputFilename, buffer);
        console.log(`¡PDF guardado con éxito! Guardado en: ${path.resolve(outputFilename)}`);
        return true;
        
    } catch (error) {
        console.error("Error en la ejecución:", error);
        return false;
    }
}

// Ejecutar ejemplo
// Pedido: https://me.yiqi.com.ar/view/PEDIDO?schemaId=1491#/27962
// Notificación de pedido: reportId=136, instanceId=27962, schemaId=1491
const schema = 1491;
const report = 136;
const instance = 27962;
const output = "notificacion_pedido_27962_node.pdf";

descargarReportePdf(schema, report, instance, output).catch(console.error);
