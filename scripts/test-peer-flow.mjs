// 3-2 친구 칭찬·질문 흐름 시험 — 에뮬레이터(auth·firestore·functions). AI 없음.
// 판정: 담임만 공유 · 친구에겐 가린 사본(글쓴이 없음) · 내 글엔 못 남김 · 욕 거절 · 한 글에 한 번 · 승인 전엔 글쓴이가 못 봄 · 승인 뒤 익명으로 보임 · 다른 반은 못 봄
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const { initializeApp: adminInit } = require("../functions/node_modules/firebase-admin/lib/app/index.js");
const { getFirestore: adminFs } = require("../functions/node_modules/firebase-admin/lib/firestore/index.js");
const { getAuth: adminAuth } = require("../functions/node_modules/firebase-admin/lib/auth/index.js");
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { getFirestore, connectFirestoreEmulator, doc, getDoc } from "firebase/firestore";

const P = "isw-writing";
const admin = adminInit({ projectId: P }, "admin");
const adb = adminFs(admin, "seoul");
const aauth = adminAuth(admin);
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/seoul/documents`, { method: "DELETE" });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: "DELETE" });
const mk = async (email, data) => { const u = await aauth.createUser({ email, password: "secret123" }); await adb.doc(`users/${u.uid}`).set({ uid: u.uid, ...data }); return u.uid; };
const tA = await mk("t@a.kr", { role: "teacher", approved: true, name: "김선생" });
const tB = await mk("t@b.kr", { role: "teacher", approved: true, name: "이선생" });
const s1 = await mk("s1@a.kr", { role: "student", classCode: "AAAA01", name: "김민준" });
const s2 = await mk("s2@a.kr", { role: "student", classCode: "AAAA01", name: "이서연" });
const sb = await mk("sb@b.kr", { role: "student", classCode: "BBBB01", name: "박하늘" });
await adb.doc("classes/AAAA01").set({ teacherId: tA, students: [{ studentId: s1, studentName: "김민준" }, { studentId: s2, studentName: "이서연" }] });
await adb.doc("classes/BBBB01").set({ teacherId: tB, students: [{ studentId: sb, studentName: "박하늘" }] });
await adb.doc("writings/w1").set({ writingId: "w1", studentId: s1, classCode: "AAAA01", topic: "김민준의 겨울", isDraft: false, content: "나는 김민준이다. 이서연이랑 썰매를 탔다. 우리 동네 공원은 정말 넓다." });

let n = 0;
const as = async (email) => {
  const app = initializeApp({ projectId: P, apiKey: "fake", authDomain: "x" }, `c${n++}`);
  const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const fns = getFunctions(app, "asia-northeast3"); connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  const db = getFirestore(app, "seoul"); connectFirestoreEmulator(db, "127.0.0.1", 8080);
  await signInWithEmailAndPassword(auth, email, "secret123");
  const c = (name, data) => httpsCallable(fns, name)(data || {}).then((r) => r.data, (e) => ({ err: e.code, msg: e.message }));
  return { c, db };
};
let bad = 0;
const ok = (cond, m) => { console.log(`${cond ? "PASS" : "FAIL"}  ${m}`); if (!cond) bad++; };

const S1 = await as("s1@a.kr"), S2 = await as("s2@a.kr"), SB = await as("sb@b.kr"), TA = await as("t@a.kr"), TB = await as("t@b.kr");
ok((await S1.c("peerShare", { writingId: "w1", on: true })).err === "functions/permission-denied", "학생은 공유 못 함");
ok((await TB.c("peerShare", { writingId: "w1", on: true })).err === "functions/permission-denied", "남의 반 교사는 공유 못 함");
ok((await TA.c("peerShare", { writingId: "w1", on: true })).on === true, "담임이 공유");

const list = await S2.c("peerList");
const it = list.items?.[0];
ok(list.items?.length === 1 && !/김민준|이서연/.test(it.content + it.topic) && !("ownerId" in it), `친구에겐 이름 가린 사본·글쓴이 없음 (${it?.content})`);
ok((await S1.c("peerList")).items.length === 0, "내 글은 내 목록에 안 나옴");
ok((await SB.c("peerList")).items.length === 0, "다른 반 학생은 못 봄");
ok((await S1.c("peerSend", { shareId: "w1", praise: "내 글 정말 잘 썼다 최고", question: "다음엔 뭘 쓸까?" })).err === "functions/failed-precondition", "내 글엔 못 남김");
ok((await SB.c("peerSend", { shareId: "w1", praise: "썰매 장면이 좋았어요", question: "어디 공원이야?" })).err === "functions/not-found", "다른 반은 못 남김");
ok((await S2.c("peerSend", { shareId: "w1", praise: "너 진짜 바보 같아", question: "왜 그렇게 썼어?" })).err === "functions/invalid-argument", "상처 주는 말 거절");
ok((await S2.c("peerSend", { shareId: "w1", praise: "썰매 타는 장면이 눈에 보였어", question: "그때 기분이 어땠어?" })).ok === true, "좋은 말은 보냄");
ok((await S2.c("peerSend", { shareId: "w1", praise: "또 남길게 좋았어요", question: "또 궁금해 뭐였어?" })).err === "functions/already-exists", "한 글에 한 번");
ok((await S1.c("peerInbox")).items.length === 0, "승인 전엔 글쓴이가 못 봄");
ok((await TB.c("peerPending", { classCode: "AAAA01" })).err === "functions/permission-denied", "남의 반 교사는 대기 목록 못 봄");
const pend = await TA.c("peerPending", { classCode: "AAAA01" });
ok(pend.items?.length === 1 && pend.items[0].from === "이서연" && pend.items[0].to === "김민준", "담임은 누가 누구에게 썼는지 봄");
ok((await S2.c("peerDecide", { noteId: pend.items[0].id, approve: true, createdAt: pend.items[0].at })).err === "functions/permission-denied", "학생은 승인 못 함");
ok((await TA.c("peerDecide", { noteId: pend.items[0].id, approve: true })).err === "functions/failed-precondition", "읽은 시각 없이 승인 못 함");
await TA.c("peerDecide", { noteId: pend.items[0].id, approve: true, createdAt: pend.items[0].at });
const inbox = await S1.c("peerInbox");
ok(inbox.items?.length === 1 && !JSON.stringify(inbox).includes("이서연") && !JSON.stringify(inbox).includes(s2), "승인 뒤 글쓴이에게 익명으로 보임");
const direct = await getDoc(doc(S1.db, "peerNotes", pend.items[0].id)).then(() => "읽힘", (e) => e.code);
await adb.doc("peerShares/w1").delete(); // 담임이 끈 직후 보내기 → 트랜잭션 안에서 막힘
ok((await S2.c("peerSend", { shareId: "w1", praise: "또 남기는 칭찬이에요", question: "다음엔 뭘 쓸 거야?" })).err === "functions/not-found", "공유를 끈 글엔 못 보냄");
ok(direct === "permission-denied", `남긴 말 문서를 직접 읽지 못함(보낸이 칸 보호) (${direct})`);
ok((await TA.c("peerDecide", { noteId: pend.items[0].id, approve: false, createdAt: pend.items[0].at })).err === "functions/failed-precondition", "이미 승인한 말은 다시 처리 못 함");
ok((await TA.c("peerDecide", { noteId: "a/b/c", approve: true })).err === "functions/invalid-argument", "빗금 id 거절");
await TA.c("peerShare", { writingId: "w1", on: false });
ok((await S2.c("peerList")).items.length === 0 && (await S1.c("peerInbox")).items.length === 0, "공유 끄면 글·말 함께 지움");

console.log(bad ? `\n${bad}개 실패` : "\n모두 통과");
process.exit(bad ? 1 : 0);
