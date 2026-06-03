async function testDeployed() {
  try {
    const url = "https://us-central1-tmc-backend-2f5c4.cloudfunctions.net/obtenerEstadoCuenta?clientCode=8000";
    console.log("Fetching from:", url);
    const response = await fetch(url);
    console.log("Status:", response.status);
    const data = await response.json();
    console.log("success:", data.success);
    console.log("clientCode:", data.clientCode);
    console.log("clientName:", data.clientName);
    console.log("clientRazonSocial:", data.clientRazonSocial);
    console.log("saldoActual:", data.saldoActual);
    console.log("Number of movements:", data.data ? data.data.length : "null");
  } catch (error) {
    console.error("Error:", error);
  }
}

testDeployed();
