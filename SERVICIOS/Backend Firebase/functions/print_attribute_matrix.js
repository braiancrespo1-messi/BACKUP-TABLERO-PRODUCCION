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
    const toyota = await getDetails(20073, token);
    const braian = await getDetails(10458, token);
    const gastro = await getDetails(11030, token);

    const toyotaAtts = toyota.atts || {};
    const braianAtts = braian.atts || {};
    const gastroAtts = gastro.atts || {};

    const allKeys = Array.from(new Set([
      ...Object.keys(toyotaAtts),
      ...Object.keys(braianAtts),
      ...Object.keys(gastroAtts)
    ])).sort((a,b)=>Number(a)-Number(b));

    console.log("AttrID\tToyota (20073)\tBraian (10458)\tGastro (11030)\tFK_Text_Toyota\tFK_Text_Braian\tFK_Text_Gastro");
    allKeys.forEach(k => {
      const tVal = toyotaAtts[k] ? toyotaAtts[k].value : undefined;
      const bVal = braianAtts[k] ? braianAtts[k].value : undefined;
      const gVal = gastroAtts[k] ? gastroAtts[k].value : undefined;

      const tFK = toyota.attsFkTexts && toyota.attsFkTexts[k] ? toyota.attsFkTexts[k] : "";
      const bFK = braian.attsFkTexts && braian.attsFkTexts[k] ? braian.attsFkTexts[k] : "";
      const gFK = gastro.attsFkTexts && gastro.attsFkTexts[k] ? gastro.attsFkTexts[k] : "";

      if (tVal !== bVal || tVal !== gVal || bVal !== gVal) {
        console.log(`${k}\t${tVal}\t${bVal}\t${gVal}\t${tFK}\t${bFK}\t${gFK}`);
      }
    });
  } catch (e) {
    console.error(e);
  }
}

run();
