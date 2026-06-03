const USERNAME = 'mercadolibre@tmcrespo.com.ar';
const PASSWORD = 'AdministracionMessi';

async function run() {
  const loginUrl = 'https://me.yiqi.com.ar/Account/Login?ReturnUrl=%2F';
  const body = new URLSearchParams({
    UserName: USERNAME,
    Password: PASSWORD,
    RememberMe: 'true',
    sid: ''
  });

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body,
    redirect: 'manual'
  });

  const cookies = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  
  // Query 20 recent invoices
  const queryUrl = 'https://me.yiqi.com.ar/api/public/FACTURA/query?schemaId=1491';
  const queryBody = {
    page: 1,
    pageSize: 20,
    columns: [{ field: 'id' }],
    filters: []
  };

  const queryResp = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      'Cookie': cookies,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(queryBody)
  });

  if (!queryResp.ok) {
    console.error(`Failed to query invoices: ${queryResp.status}`);
    return;
  }

  const qData = await queryResp.json();
  const rows = qData.rows || qData.data || qData;
  const items = rows.rows || rows;
  console.log(`Fetched ${items.length} invoices.`);

  for (const item of items) {
    const detailUrl = `https://me.yiqi.com.ar/api/public/FACTURA/${item.id}?schemaId=1491`;
    const detailResp = await fetch(detailUrl, {
      method: 'GET',
      headers: { 'Cookie': cookies }
    });
    if (detailResp.ok) {
      const detailData = await detailResp.json();
      console.log(`Invoice ${item.id} (${detailData.FACT_NUMERO}):`);
      // Find all keys starting with FACT_ and having PED or PEDI
      const pedKeys = Object.keys(detailData).filter(k => k.toLowerCase().includes('ped'));
      pedKeys.forEach(k => {
        console.log(`  - ${k}:`, typeof detailData[k], detailData[k]);
      });
    }
  }
}

run();
