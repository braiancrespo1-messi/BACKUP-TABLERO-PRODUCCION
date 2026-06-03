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

        // Query the REPORTE_DE_CLIENTES entity
        const queryUrl = "https://api.yiqi.com.ar/api/public/REPORTE_DE_CLIENTES/query?schemaId=1491";

        const queryBody = {
            page: 1,
            pageSize: 1,
            columns: [
                {field: "CLIE_CODIGO"},
                {field: "CLIE_NOMBRE"},
                {field: "CLIENTE_IMPORTE"},
                {field: "id"}
            ],
            filters: [
                {
                    columnName: "CLIE_CODIGO",
                    operator: "=",
                    value: "8000"
                }
            ]
        };

        const r = await fetch(queryUrl, {
            method: 'POST',
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(queryBody)
        });

        if (!r.ok) {
            console.error(`Error ${r.status}:`, await r.text());
            return;
        }

        const data = await r.json();
        console.log("Reporte De Clientes API Response:");
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error in main:", e);
    }
}

main();
