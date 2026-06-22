const admin = require("firebase-admin");

// Initialize Firebase
admin.initializeApp({
  projectId: "tmc-backend-2f5c4"
});

const db = admin.firestore();

async function readLogs() {
  try {
    const snap = await db.collection("tablero_activity_logs")
      .orderBy("timestamp", "desc")
      .limit(10)
      .get();
      
    console.log("Latest Firestore Tablero Activity Logs:");
    snap.forEach(doc => {
      const data = doc.data();
      console.log(`Time: ${data.date} ${data.time} | Action: ${data.action}`);
      console.log(`Details: ${data.details}`);
      console.log("-".repeat(50));
    });
  } catch (err) {
    console.error("Error reading logs:", err);
  }
}

readLogs();
