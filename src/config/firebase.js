import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
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

// 개발·화면 검수용: VITE_USE_EMU=1 일 때만 로컬 에뮬레이터에 붙는다(배포 빌드엔 변수가 없어 꺼져 있다)
if (import.meta.env.VITE_USE_EMU === "1" && !globalThis.__ssakEmu) {
  globalThis.__ssakEmu = true; // HMR 로 다시 평가돼도 한 번만 연결(두 번째 connect 는 예외)
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
// (옛 주석) Connect to emulators in development (disabled for production testing)
// if (import.meta.env.DEV) {
//   connectFunctionsEmulator(functions, "localhost", 5001);
// }
