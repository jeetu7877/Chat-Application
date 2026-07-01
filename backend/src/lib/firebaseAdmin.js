import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

let messagingEngine = null;

try {
  // Production-grade validation checking if credentials exist in env mapping
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    messagingEngine = admin.messaging();
    console.log("✅ Firebase Admin SDK initialized successfully in lib framework.");
  } else {
    console.warn("⚠️ Warning: FIREBASE_SERVICE_ACCOUNT_JSON is missing in env configurations.");
  }
} catch (error) {
  console.error("❌ Firebase Admin Initialization Engine Failure:", error.message);
}

export const messaging = messagingEngine;
export default admin;
