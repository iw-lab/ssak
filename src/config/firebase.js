import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// 2026-11-17 싹 되살리기: 데이터는 서울(asia-northeast3) DB «seoul» — 종전 (default)는 미국(nam5)
export const db = getFirestore(app, "seoul");
export const functions = getFunctions(app, "asia-northeast3");

// Connect to emulators in development (disabled for production testing)
// if (import.meta.env.DEV) {
//   connectFunctionsEmulator(functions, "localhost", 5001);
// }
