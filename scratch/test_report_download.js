const USERNAME = "mercadolibre@tmcrespo.com.ar";
const PASSWORD = "AdministracionMessi";

async function get_token() {
    const body = new URLSearchParams({
        grant_type: "password",
        username: USERNAME,
        password: PASSWORD
    });

    const tokenUrls = [
        "https://api.yiqi.com.ar/token",
        "https://api.yiqi.com.ar/connect/token",
        "https://me.yiqi.com.ar/connect/token"
    ];

    for (const url of tokenUrls) {
        try {
            const r = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body
            });
            if (r.ok) {
                const data = await r.json();
                if (data.access_token) return data.access_token;
            }
        } catch (e) {
            console.warn(`Failed token from ${url}:`, e.message);
        }
    }
    throw new Error("Failed to get token");
}

async function main() {
    try {
        const token = await get_token();
        console.log("Token obtained successfully.");

        const reportNames = [
            "Estado de Cuenta Corriente de Cliente",
            "Estado de Cuenta Corriente de Cliente.rdlc",
            "Estado de Cuenta Corriente",
            "Cuenta Corriente",
            "Movimientos de Clientes",
            "MOVIMIENTOS_CLIENTES",
            "ESTADO_DE_CUENTA_CLIENTE",
            "Reporte de cuenta corriente"
        ];

        for (const name of reportNames) {
            const url = `https://api.yiqi.com.ar/api/public/MOVIMIENTOS_CLIENTES/report?reportName=${encodeURIComponent(name)}&instanceId=8000&schemaId=1491`;
            const r = await fetch(url, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (r.ok) {
                console.log(`🎉 SUCCESS with reportName: "${name}"!`);
                return;
            } else {
                const txt = await r.text();
                console.log(`❌ Fail with "${name}": Status ${r.status} - ${txt.trim()}`);
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
