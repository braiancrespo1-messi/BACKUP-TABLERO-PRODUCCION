const USERNAME = "mercadolibre@tmcrespo.com.ar";
const PASSWORD = "AdministracionMessi";

async function getYiQiToken() {
  const tokenUrls = [
    "https://api.yiqi.com.ar/token",
    "https://api.yiqi.com.ar/connect/token",
    "https://me.yiqi.com.ar/connect/token"
  ];
  const body = new URLSearchParams({
    grant_type: "password",
    username: USERNAME,
    password: PASSWORD
  });
  
  for (const url of tokenUrls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body
      });
      if (response.ok) {
        const data = await response.json();
        if (data.access_token) return data.access_token;
      }
    } catch (e) {}
  }
  throw new Error("No auth");
}

async function searchWithPayload(payloadName, bodyOverride) {
  try {
    const token = await getYiQiToken();
    const url = "https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=345&schemaId=1491&smartieId=2603";
    
    const defaultBody = {
      page: 1,
      pageSize: 5,
      search: "30717951626" // CUIT de Gastronomika
    };
    
    const finalBody = { ...defaultBody, ...bodyOverride };
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(finalBody)
    });
    
    const json = await response.json();
    console.log(`Payload: ${payloadName} | Total devuelto: ${json.total}`);
    const rows = json.data || json.rows || json.instances || [];
    rows.forEach(r => {
      console.log(`  - Match: ID=${r.ID || r.id} | Nombre=${r.CLIE_NOMBRE}`);
    });
  } catch (e) {
    console.error(`Error en payload ${payloadName}:`, e.message);
  }
}

async function run() {
  const token = await getYiQiToken();
  
  console.log("Probando diferentes variaciones de filtros...");
  
  await searchWithPayload("1. Default (solo search)", {});
  await searchWithPayload("2. filters: []", { filters: [] });
  await searchWithPayload("3. ignoreFilters: true", { ignoreFilters: true });
  await searchWithPayload("4. ignoreSmartieFilters: true", { ignoreSmartieFilters: true });
  await searchWithPayload("5. filter: null", { filter: null });
  await searchWithPayload("6. clearFilters: true", { clearFilters: true });
}

run();
