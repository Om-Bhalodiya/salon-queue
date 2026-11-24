import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if basic config variables are provided
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

if (!isFirebaseConfigured) {
  console.warn(
    'Firebase environment variables missing. Ensure .env has VITE_FIREBASE_* keys set.'
  );
}

// Initialize Firebase app singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Cloud Firestore instance
export const db = getFirestore(app);

export default app;
