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
        console.log("Local Token Length:", token.length);
        console.log("Local Token Start:", token.substring(0, 15));

        const queryUrl = "https://api.yiqi.com.ar/api/public/MOVIMIENTOS_CLIENTES/search?schemaId=1491&CLIE_ID_CLIE=7550";

        const r = await fetch(queryUrl, {
            method: 'GET',
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!r.ok) {
            console.error(`Error ${r.status}:`, await r.text());
            return;
        }

        const res = await r.json();
        console.log("Success! Retrieved from search:", res);
        return;

        let runningBalance = 0;
        const calculatedRows = [];

        rows.forEach((row) => {
            const debe = row.DEBE ? parseFloat(row.DEBE) : 0;
            const haber = row.HABER ? parseFloat(row.HABER) : 0;
            
            // In account statement:
            // Debe (debits/invoices) increases what the client owes (balance goes up)
            // Haber (credits/payments) decreases what the client owes (balance goes down)
            runningBalance = runningBalance + debe - haber;

            calculatedRows.push({
                fecha: row.FECHA,
                comprobante: row.COMPROBANTE,
                debe: row.DEBE,
                haber: row.HABER,
                saldo: runningBalance
            });
        });

        console.log("\nLast 15 rows of calculation:");
        const last15 = calculatedRows.slice(-15);
        last15.forEach((row) => {
            console.log(`${row.fecha.split('T')[0]} | ${row.comprobante.padEnd(25)} | Debe: ${String(row.debe || '-').padEnd(10)} | Haber: ${String(row.haber || '-').padEnd(10)} | Saldo: ${row.saldo.toFixed(2)}`);
        });

        console.log(`\nFinal Calculated Balance: $${runningBalance.toFixed(2)}`);
    } catch (e) {
        console.error("Error in main:", e);
    }
}

main();
