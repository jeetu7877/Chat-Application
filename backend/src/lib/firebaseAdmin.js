import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

let messagingEngine;

try {
  // Production safe service account JSON authentication pipeline mapping
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  
  messagingEngine = admin.messaging();
  console.log("Firebase Admin SDK Engine initialized successfully.");
} catch (error) {
  console.error("Firebase Admin initialization skipped or failed:", error.message);
}

export const messaging = messagingEngine;
export default admin;
