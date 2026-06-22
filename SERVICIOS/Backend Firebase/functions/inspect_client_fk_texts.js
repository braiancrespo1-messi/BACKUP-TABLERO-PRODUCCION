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

async function getDetails(id, token) {
  const url = `https://api.yiqi.com.ar/api/instancesApi/GetInstance?entityId=345&schemaId=1491&id=${id}`;
  const response = await fetch(url, { method: "GET", headers: { "Authorization": `Bearer ${token}` } });
  return await response.json();
}

async function run() {
  try {
    const token = await getYiQiToken();
    const ids = [10458, 20073];
    for (const id of ids) {
      const data = await getDetails(id, token);
      console.log(`=== ID: ${id} (${data.name || "Sin Nombre"}) ===`);
      console.log("attsFkTexts:", JSON.stringify(data.attsFkTexts, null, 2));
    }
  } catch (e) {
    console.error(e);
  }
}

run();
