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
  
  console.log("Renovando token de YiQi...");
  for (const url of tokenUrls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body
      });
      if (response.ok) {
        const data = await response.json();
        if (data.access_token) {
          console.log("Token obtenido correctamente.");
          return data.access_token;
        }
      }
    } catch (e) {
      console.error(`Error obteniendo token desde ${url}:`, e);
    }
  }
  throw new Error("No se pudo autenticar con YiQi ERP");
}

async function searchClientInYiQi(query) {
  try {
    const token = await getYiQiToken();
    const url = "https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=345&schemaId=1491&smartieId=2603";
    
    console.log(`Buscando "${query}" en YiQi API...`);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        page: 1,
        pageSize: 5,
        search: query
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${await response.text()}`);
    }
    
    const json = await response.json();
    console.log("Resultado de búsqueda:", JSON.stringify(json, null, 2));
    
    const rows = json.data || json.rows || json.instances || [];
    console.log(`Encontrados ${rows.length} clientes.`);
    rows.forEach(r => {
      console.log(`- ID: ${r.ID || r.id} | Nombre: ${r.CLIE_RAZON_SOCIAL || r.CLIE_NOMBRE} | Teléfono: ${r.CLIE_TELEFONO || r.CLIE_CELULAR || r.atts?.["1089"]?.value}`);
    });
  } catch (error) {
    console.error("Error en búsqueda:", error);
  }
}

async function runTests() {
  console.log("=== Test 1: Búsqueda con número limpio local (1170727276) ===");
  await searchClientInYiQi("1170727276");
  
  console.log("\n=== Test 2: Búsqueda con prefijo internacional completo (5491170727276) ===");
  await searchClientInYiQi("5491170727276");

  console.log("\n=== Test 3: Búsqueda con prefijo internacional sin el 9 (541170727276) ===");
  await searchClientInYiQi("541170727276");
}
runTests();
