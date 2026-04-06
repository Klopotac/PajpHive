// firebase-config.js
// Configured for HiveVoice (pajphive)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyAy1XojVREw3u1UbQgvUwfhwWMaHvULbe0",
  authDomain: "pajphive.firebaseapp.com",
  projectId: "pajphive",
  storageBucket: "pajphive.firebasestorage.app",
  messagingSenderId: "748259420534",
  appId: "1:748259420534:web:f5e7a518392cca5cfd3257"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export let messaging = null;

// Messaging only works in supported environments
try {
  messaging = getMessaging(app);
} catch (e) {
  console.warn("Firebase Messaging not supported in this browser:", e.message);
}

export default app;