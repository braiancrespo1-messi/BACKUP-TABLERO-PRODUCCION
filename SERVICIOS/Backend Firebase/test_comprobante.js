const USERNAME = "mercadolibre@tmcrespo.com.ar";
const PASSWORD = "AdministracionMessi";

async function getYiQiCookies() {
  const loginUrl = "https://me.yiqi.com.ar/Account/Login?ReturnUrl=%2F";
  const body = new URLSearchParams({
    UserName: USERNAME,
    Password: PASSWORD,
    RememberMe: "true",
    sid: ""
  });
  console.log("Iniciando sesion en me.yiqi.com.ar para obtener cookies...");
  const response = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body,
    redirect: "manual"
  });
  let cookies = [];
  if (typeof response.headers.getSetCookie === 'function') {
    cookies = response.headers.getSetCookie();
  } else {
    const rawCookies = response.headers.get('set-cookie');
    if (rawCookies) {
      cookies = rawCookies.split(',').map(c => c.trim());
    }
  }
  return cookies.map(c => c.split(';')[0]).join('; ');
}

async function test() {
  try {
    const cookies = await getYiQiCookies();
    console.log("Got cookies!");
    
    const queryUrl = `https://me.yiqi.com.ar/api/public/FACTURA/query?schemaId=1491`;
    const queryBody = {
      page: 1,
      pageSize: 10,
      columns: [
        { field: 'id' }, 
        { field: 'FACT_NUMERO' }
      ],
      filters: [
        { columnName: 'FACT_NUMERO', operator: '=', value: 115587 }
      ]
    };
    
    const resp = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(queryBody)
    });
    
    if (!resp.ok) {
      console.error("HTTP error:", resp.status, await resp.text());
      return;
    }
    
    const data = await resp.json();
    console.log("Query response for 115587:", JSON.stringify(data, null, 2));
    
    const items = data.rows || data.data || data;
    for (const item of items) {
      console.log(`Checking item: id=${item.id}`);
      const detailUrl = `https://me.yiqi.com.ar/api/public/FACTURA/${item.id}?schemaId=1491`;
      const detailResp = await fetch(detailUrl, {
        method: 'GET',
        headers: { 'Cookie': cookies }
      });
      if (detailResp.ok) {
        const detailData = await detailResp.json();
        console.log(`Detail for id=${item.id}:`, {
          CLIE_ID_CLIE: detailData.CLIE_ID_CLIE,
          FACT_ID_CLIENTE: detailData.FACT_ID_CLIENTE,
          TIFA_ID_TIFA: detailData.TIFA_ID_TIFA,
          FACT_NUMERO: detailData.FACT_NUMERO,
          FACT_TOTAL: detailData.FACT_TOTAL
        });
      } else {
        console.error(`Error loading detail for id=${item.id}:`, detailResp.status);
      }
    }
  } catch (err) {
    console.error("Test error:", err);
  }
}

test();
