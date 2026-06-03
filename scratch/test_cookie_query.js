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

async function testClientQuery(clientCode = "7550") {
  try {
    const cookies = await getYiQiCookies();
    const queryUrl = `https://me.yiqi.com.ar/api/instancesApi/GetList?entityId=345&schemaId=1491&smartieId=2603`;
    
    let response = await fetch(queryUrl, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        page: 1,
        pageSize: 50,
        search: String(clientCode)
      })
    });

    const data = await response.json();
    const rows = data.data || data.rows || data;
    const items = rows.rows || rows;
    
    console.log(`Search for "${clientCode}" returned ${items.length} items.`);
    
    // Find the one with exact ID match
    const exactMatch = items.find(r => String(r.id) === String(clientCode) || String(r.ID) === String(clientCode));
    if (exactMatch) {
      console.log("Exact match found:");
      console.log("Razón Social:", exactMatch.CLIE_RAZON_SOCIAL);
      console.log("Nombre:", exactMatch.CLIE_NOMBRE);
      console.log("ID:", exactMatch.id);
    } else {
      console.log("No exact match found in returned list.");
    }

  } catch (error) {
    console.error("Error:", error);
  }
}

testClientQuery("7550");
