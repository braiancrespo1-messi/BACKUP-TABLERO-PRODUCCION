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

        const queryUrl = "https://api.yiqi.com.ar/api/public/MOVIMIENTOS_CLIENTES/query?schemaId=1491";

        const queryBody = {
            page: 1,
            pageSize: 5,
            columns: [
                {field: "FECHA", sortDirection: "DESC", sortOrder: 1},
                {field: "COMPROBANTE"},
                {field: "DEBE"},
                {field: "HABER"},
                {field: "CLIE_SALDO_CLIENTE"},
                {field: "PENDIENTE_PAGO"},
                {field: "IMPORTE"},
                {field: "id"},
                {field: "DESC_ESTADO"}
            ],
            filters: [
                {
                    columnName: "CLIE_ID_CLIE",
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
        console.log("API Response:");
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error in main:", e);
    }
}

main();
