const admin = require("firebase-admin");
const Afip = require("@afipsdk/afip.js");

// Inicializar Firebase Admin
admin.initializeApp({
  projectId: "tmc-backend-2f5c4"
});

const db = admin.firestore();

async function runTest() {
  try {
    console.log("1. Leyendo configuración de Firestore (/configs/afip_sdk)...");
    const configDoc = await db.collection("configs").doc("afip_sdk").get();
    
    if (!configDoc.exists) {
      console.error("❌ El documento /configs/afip_sdk no existe en Firestore.");
      process.exit(1);
    }
    
    const configData = configDoc.data();
    const sdkToken = configData.access_token || configData.accessToken;
    const cert = configData.cert;
    const key = configData.key;
    const representedCuit = parseInt(configData.cuit_representada || configData.cuit || "30717981312", 10);
    
    console.log("Configuración cargada:");
    console.log(`- representedCuit: ${representedCuit}`);
    console.log(`- sdkToken: ${sdkToken ? "Presente (largo " + sdkToken.length + ")" : "FALTANTE"}`);
    console.log(`- cert: ${cert ? "Presente (largo " + cert.length + ")" : "FALTANTE"}`);
    console.log(`- key: ${key ? "Presente (largo " + key.length + ")" : "FALTANTE"}`);
    
    if (!sdkToken) {
      console.error("❌ No hay access_token configurado.");
      process.exit(1);
    }
    
    const afipOptions = {
      CUIT: representedCuit,
      access_token: sdkToken,
      production: (cert && key) ? true : false
    };
    
    if (cert && key) {
      afipOptions.cert = cert;
      afipOptions.key = key;
    }
    
    console.log("\n2. Inicializando AFIP SDK...");
    console.log("Opciones de inicialización:", {
      CUIT: afipOptions.CUIT,
      production: afipOptions.production,
      certLength: cert ? cert.length : 0,
      keyLength: key ? key.length : 0
    });
    
    const afip = new Afip(afipOptions);
    
    const cuitToQuery = 30717981312; // CUIT de TMC
    console.log(`\n3. Consultando CUIT ${cuitToQuery} en AFIP...`);
    
    const details = await afip.RegisterInscriptionProof.getTaxpayerDetails(cuitToQuery);
    
    console.log("\n✅ [ÉXITO] Respuesta recibida de AFIP:");
    console.log(JSON.stringify(details, null, 2));
    
  } catch (error) {
    console.error("\n❌ [ERROR] Falló la consulta:");
    console.error(error);
  }
}

runTest();
