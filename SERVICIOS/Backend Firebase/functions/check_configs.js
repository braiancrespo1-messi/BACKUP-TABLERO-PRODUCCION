const admin = require("firebase-admin");
const serviceAccount = require("C:/Users/Usuario/.gemini/antigravity/brain/175990ae-aff2-41a9-afba-a403883dff65/scratch/tmc-backend-2f5c4-firebase-adminsdk.json");

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

async function run() {
  const db = admin.firestore();
  const snap = await db.collection("crm_whatsapp_configs").get();
  console.log("whatsapp configs count:", snap.size);
  snap.forEach(doc => {
    console.log(doc.id, "=>", JSON.stringify(doc.data()));
  });
}

run().catch(console.error);
