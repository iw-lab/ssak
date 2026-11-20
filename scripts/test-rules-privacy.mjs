// 개인정보 접근 규칙 공격 시험 — 에뮬레이터(auth 9099·firestore 8080)에 붙어 «남의 반 글·명단»을 훔쳐 보려 한다.
// 사용: (에뮬레이터 켠 뒤) node scripts/test-rules-privacy.mjs   → 모든 공격이 막히면 PASS, 하나라도 뚫리면 FAIL(종료 1)
// 2026-11-18 전수 점검: 자가 가입 교사가 approved:true 를 스스로 써서 모든 학교 글을 읽을 수 있었다.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const { initializeApp: adminInit } = require("../functions/node_modules/firebase-admin/lib/app/index.js");
const { getFirestore: adminFs } = require("../functions/node_modules/firebase-admin/lib/firestore/index.js");
const { getAuth: adminAuth } = require("../functions/node_modules/firebase-admin/lib/auth/index.js");
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, getDocs, collection, query, where, orderBy, limit, documentId, terminate } from "firebase/firestore";

const P = "isw-writing";
const admin = adminInit({ projectId: P }, "admin");
const adb = adminFs(admin, "seoul");
const aauth = adminAuth(admin);
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/seoul/documents`, { method: "DELETE" });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: "DELETE" });

const mk = async (email, data) => { const u = await aauth.createUser({ email, password: "secret123" }); await adb.doc(`users/${u.uid}`).set({ uid: u.uid, email, ...data }); return u.uid; };
const tA = await mk("ta@school-a.kr", { role: "teacher", approved: true, name: "김선생" });
const tB = await mk("tb@school-b.kr", { role: "teacher", approved: true, name: "이선생" });
const sA = await mk("sa001@school-a.kr", { role: "student", classCode: "A1", name: "학생001" });
const sA2 = await mk("sa002@school-a.kr", { role: "student", classCode: "A1", name: "학생002" });
const sB = await mk("sb001@school-b.kr", { role: "student", classCode: "B1", name: "학생001" });
const adm = await mk("admin@ssak.kr", { role: "super_admin", approved: true, name: "슈퍼 관리자" });
await adb.doc("classes/A1").set({ teacherId: tA, className: "A반", students: [{ studentId: sA, nickname: "학생001" }, { studentId: sA2, nickname: "학생002" }] });
await adb.doc("classes/B1").set({ teacherId: tB, className: "B반", students: [{ studentId: sB, nickname: "학생001" }] });
await adb.doc("writings/wB").set({ studentId: sB, classCode: "B1", content: "B학교 학생의 비밀 일기", topic: "일기" });
await adb.doc("writings/wA2").set({ studentId: sA2, classCode: "A1", content: "A반 친구의 글", topic: "일기", isDraft: false, createdAt: "2026-11-18" });
await adb.doc("assignments/aA").set({ teacherId: tA, classCode: "A1", title: "가을", submissions: [{ studentId: sA2, nickname: "학생002", score: 80 }, { studentId: "old1", nickname: "학생003", score: 85 }] });
await adb.doc("assignments/aB").set({ teacherId: tB, classCode: "B1", title: "겨울", submissions: [{ studentId: sB, nickname: "학생001", score: 90 }] });
await adb.doc("schedulers/A1").set({ enabled: true });
await adb.doc("retiredClassCodes/OLD111").set({ retiredAt: "2026-03-01" });
await adb.doc("schedulers/B1").set({ enabled: true });
await adb.doc("usage/usage_x_2026-11-18").set({ count: 3 });
await adb.doc("analyses/okA").set({ uid: sA, score: 77, len: 1 });
await adb.doc("analyses/okB").set({ uid: sB, score: 99 });
await adb.doc("analysisCache/k1").set({ result: { score: 77 } });
await adb.doc("pinAuth/A1_01").set({ uid: sA, classCode: "A1", number: 1, salt: "s", hash: "h", fails: 0 });
await adb.doc("writings/wNull").set({ studentId: sB, classCode: null, content: "옛 글", isDraft: false });
await adb.doc("writings/wA1").set({ studentId: sA, classCode: "A1", content: "내 글", topic: "일기", isDraft: false, createdAt: "2026-11-18" });

let n = 0;
const c_uid = (auth) => auth.currentUser.uid;
const client = async (fn) => {
  const app = initializeApp({ apiKey: "fake", projectId: P }, `c${n++}`);
  const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app, "seoul"); connectFirestoreEmulator(db, "127.0.0.1", 8080);
  try { return await fn(auth, db); } finally { await terminate(db); await deleteApp(app); }
};
const results = [];
const attack = async (name, fn) => {
  let ok;
  try { await fn(); ok = false; } catch (e) { ok = /permission|PERMISSION_DENIED|insufficient/i.test(String(e?.code || e?.message)); if (!ok) console.log("  (예상 밖 오류)", e?.message); }
  results.push([name, ok]); console.log(`${ok ? "✅ 막힘" : "🔴 뚫림"}  ${name}`);
};
const legit = async (name, fn) => {
  try { await fn(); results.push([name, true]); console.log(`✅ 허용  ${name}`); } catch (e) { results.push([name, false]); console.log(`🔴 정상 사용이 막힘  ${name}: ${e?.message}`); }
};

// 1) 낯선 사람이 가입하며 스스로 «승인된 교사»가 되기
await client(async (auth, db) => {
  const c = await createUserWithEmailAndPassword(auth, "evil@x.kr", "secret123");
  await attack("자가 가입 때 approved:true 로 승인 교사 행세", () => setDoc(doc(db, `users/${c.user.uid}`), { uid: c.user.uid, email: "evil@x.kr", role: "teacher", approved: true }));
});
// 1-2) 낯선 사람이 «B반 학생»이라고 스스로 적고 명단 읽기
await client(async (auth, db) => {
  const c = await createUserWithEmailAndPassword(auth, "fake@x.kr", "secret123");
  await attack("자가 가입 때 시험용 학생(isTestStudent)으로 — 점수 서명 우회", () => setDoc(doc(db, `users/${c.user.uid}`), { uid: c.user.uid, email: "fake@x.kr", role: "student", approved: true, isTestStudent: true }));
  await attack("자가 가입 때 classCode 를 적어 남의 반 학생 행세", () => setDoc(doc(db, `users/${c.user.uid}`), { uid: c.user.uid, email: "fake@x.kr", role: "student", approved: true, classCode: "B1" }));
  await legit("반 없는 학생 가입(옛 경로)", () => setDoc(doc(db, `users/${c.user.uid}`), { uid: c.user.uid, email: "fake@x.kr", role: "student", approved: true }));
  await attack("가입 뒤 스스로 classCode 를 B1 로 바꾸기", () => updateDoc(doc(db, `users/${c.user.uid}`), { classCode: "B1" }));
  await attack("반 없는 학생이 B반 명단 읽기", () => getDoc(doc(db, "classes/B1")));
});
// 2) 승인 안 된 교사(정상 가입)가 남의 학생 문서 읽기
await client(async (auth, db) => {
  const c = await createUserWithEmailAndPassword(auth, "new@x.kr", "secret123");
  await legit("정상 교사 가입(승인 대기)", () => setDoc(doc(db, `users/${c.user.uid}`), { uid: c.user.uid, email: "new@x.kr", role: "teacher", approved: false, name: "새선생" }));
  await attack("승인 대기 교사가 남의 학생 정보 읽기", () => getDoc(doc(db, `users/${sB}`)));
  await attack("승인 대기 교사가 남의 반 명단 읽기", () => getDoc(doc(db, "classes/B1")));
  await attack("승인 대기 교사가 반 없는 옛 글 지우기", () => deleteDoc(doc(db, "writings/wNull")));
  await attack("승인 대기 교사가 자동출제 설정 읽기", () => getDoc(doc(db, "schedulers/B1")));
});
// 3) 승인된 A학교 교사가 B학교 학생의 글·정보 읽기
await client(async (auth, db) => {
  await signInWithEmailAndPassword(auth, "ta@school-a.kr", "secret123");
  await attack("다른 학교 교사가 B학교 학생 글 읽기", () => getDoc(doc(db, "writings/wB")));
  await attack("다른 학교 교사가 B학교 학생 글 목록 조회", () => getDocs(query(collection(db, "writings"), where("classCode", "==", "B1"))));
  await attack("다른 학교 교사가 B학교 학생 정보 읽기", () => getDoc(doc(db, `users/${sB}`)));
  await legit("담임이 자기 반 학생 글 읽기", () => getDoc(doc(db, "writings/wA2")));
  await legit("담임이 자기 반 글 목록 조회", () => getDocs(query(collection(db, "writings"), where("classCode", "==", "A1"))));
  await legit("담임이 자기 반 학생 정보 읽기", () => getDoc(doc(db, `users/${sA}`)));
  // 앱이 실제로 쓰는 조회들(writingService·assignmentService·classService)
  await legit("담임: 반 학생 목록(classCode+role)", () => getDocs(query(collection(db, "users"), where("classCode", "==", "A1"), where("role", "==", "student"))));
  await legit("담임: 학생 여러 명 한 번에(documentId in)", () => getDocs(query(collection(db, "users"), where(documentId(), "in", [sA, sA2]))));
  await legit("담임: 반 글 목록(classCode+isDraft)", () => getDocs(query(collection(db, "writings"), where("classCode", "==", "A1"), where("isDraft", "==", false), limit(500))));
  await legit("담임: 내 반 목록(teacherId)", () => getDocs(query(collection(db, "classes"), where("teacherId", "==", c_uid(auth)), limit(50))));
  await legit("담임: 학생 리뷰 표시", () => updateDoc(doc(db, "writings/wA2"), { reviewed: true, reviewedAt: "x" }));
  await attack("담임: 다른 반 학생 목록(classCode B1)", () => getDocs(query(collection(db, "users"), where("classCode", "==", "B1"), where("role", "==", "student"))));
  await attack("담임: 다른 학교 학생 리뷰 표시 바꾸기", () => updateDoc(doc(db, "writings/wB"), { reviewed: true }));
  await legit("담임: 새 반 코드 중복 확인(없는 문서)", () => getDoc(doc(db, "classes/NEW9")));
  await legit("담임: 자기 반 과제 목록", () => getDocs(query(collection(db, "assignments"), where("classCode", "==", "A1"), limit(100))));
  await legit("담임: 자기 반 과제 내기", () => addDoc(collection(db, "assignments"), { teacherId: c_uid(auth), classCode: "A1", title: "봄", createdAt: "x" }));
  await attack("담임: 다른 반에 과제 끼워 넣기", () => addDoc(collection(db, "assignments"), { teacherId: c_uid(auth), classCode: "B1", title: "봄" }));
  await attack("담임: 다른 반 과제(제출 명단) 읽기", () => getDoc(doc(db, "assignments/aB")));
  await attack("담임: 다른 반 과제 목록", () => getDocs(query(collection(db, "assignments"), where("classCode", "==", "B1"))));
  await legit("담임: 자기 반 자동출제 설정", () => getDoc(doc(db, "schedulers/A1")));
  await attack("담임: 다른 반 자동출제 설정 읽기", () => getDoc(doc(db, "schedulers/B1")));
  await legit("담임: 자동출제 기록 남기기", () => addDoc(collection(db, "autoAssignmentLogs"), { classCode: "A1", title: "봄", createdAt: "2026-11-18T01:00:00Z" }));
  await legit("담임: 오늘 자동출제 확인", () => getDocs(query(collection(db, "autoAssignmentLogs"), where("classCode", "==", "A1"), where("createdAt", ">=", "2026-11-18"), limit(1))));
  await attack("담임: 다른 반 자동출제 기록 조회", () => getDocs(query(collection(db, "autoAssignmentLogs"), where("classCode", "==", "B1"))));
  await attack("담임: 반을 학생에게 넘기기(teacherId 변경)", () => updateDoc(doc(db, "classes/A1"), { teacherId: sA }));
  await attack("담임: 다른 반 학생 문서 만들기", () => setDoc(doc(db, "users/ghost1"), { uid: "ghost1", role: "student", classCode: "B1" }));
  await attack("담임: 자기 반 학생을 남의 반으로 옮겨 심기", () => updateDoc(doc(db, `users/${sA2}`), { classCode: "B1" }));
  await legit("담임: 학생을 반에서 빼기(classCode null)", () => updateDoc(doc(db, `users/${sA2}`), { classCode: null }));
  await legit("담임: 새 코드로 반 만들기", () => setDoc(doc(db, "classes/NEW222"), { classCode: "NEW222", teacherId: c_uid(auth), students: [], maxStudents: 40 }));
  await attack("담임: 남의 반 코드 있는지 엿보기(읽기)", () => getDoc(doc(db, "classes/B1")));
  await attack("담임: 지운 반 코드로 새 반 만들기(옛 글 보기)", () => setDoc(doc(db, "classes/OLD111"), { teacherId: c_uid(auth), students: [], maxStudents: 40 }));
  await attack("담임: 반 문서만 직접 지우기(학생·글은 남김)", () => deleteDoc(doc(db, "classes/A1")));
  await attack("담임: 은퇴 코드 목록 읽기", () => getDoc(doc(db, "retiredClassCodes/OLD111")));
  await attack("담임: 사용량 기록 읽기", () => getDoc(doc(db, "usage/usage_x_2026-11-18")));
  await attack("담임: 자기번호 해시 읽기", () => getDoc(doc(db, "pinAuth/A1_01")));
  await legit("담임: 자기 반 글에 한마디·점수 고치기", () => updateDoc(doc(db, "writings/wA2"), { teacherComment: "끝맺음이 좋아요", teacherScore: 85, teacherCheckedAt: "2026-11-20", teacherName: "선생님" }));
  await attack("담임: 점수 150", () => updateDoc(doc(db, "writings/wA2"), { teacherScore: 150 }));
  await attack("담임: AI 점수 칸 직접 바꾸기", () => updateDoc(doc(db, "writings/wA2"), { score: 100 }));
  await attack("담임: 다른 반 글에 한마디", () => updateDoc(doc(db, "writings/wB"), { teacherComment: "x" }));
  await attack("담임: 자기번호 직접 바꾸기", () => setDoc(doc(db, "pinAuth/A1_01"), { uid: sA, classCode: "A1", number: 1, salt: "s", hash: "x", fails: 0 }));
});
// 4) 학생이 친구·다른 반 것을 읽거나 고치기
await client(async (auth, db) => {
  await signInWithEmailAndPassword(auth, "sa001@school-a.kr", "secret123");
  await attack("학생이 같은 반 친구 글 읽기", () => getDoc(doc(db, "writings/wA2")));
  await attack("학생: 내 자기번호 해시 읽기", () => getDoc(doc(db, "pinAuth/A1_01")));
  await attack("학생: 틀린 횟수 0으로 되돌리기", () => updateDoc(doc(db, "pinAuth/A1_01"), { fails: 0, lockedUntil: null }));
  await attack("학생이 다른 반 명단 읽기", () => getDoc(doc(db, "classes/B1")));
  await attack("학생이 다른 반 명단 고치기", () => updateDoc(doc(db, "classes/B1"), { students: [] }));
  await attack("학생이 스스로 교사로 바꾸기", () => updateDoc(doc(db, `users/${sA}`), { role: "teacher" }));
  await legit("학생이 자기 반 정보 읽기", () => getDoc(doc(db, "classes/A1")));
  await legit("학생: 내 글 목록(studentId+정렬)", () => getDocs(query(collection(db, "writings"), where("studentId", "==", sA), orderBy("createdAt", "desc"), limit(100))));
  await legit("학생: 자기 반 과제 읽기", () => getDocs(query(collection(db, "assignments"), where("classCode", "==", "A1"))));
  await attack("학생: 다른 반 과제(제출 명단) 읽기", () => getDoc(doc(db, "assignments/aB")));
  await attack("학생: 자기 반 과제 제출 명단 통째로 지우기", () => updateDoc(doc(db, "assignments/aA"), { submissions: [] }));
  await legit("학생: 자기 반 과제에 제출 기록", () => updateDoc(doc(db, "assignments/aA"), { submissions: [{ studentId: sA2, nickname: "학생002", score: 80 }, { studentId: "old1", nickname: "학생003", score: 85 }, { studentId: sA, nickname: "학생001", score: 75 }] }));
  await attack("학생: 다른 반 과제 제출 명단 지우기", () => updateDoc(doc(db, "assignments/aB"), { submissions: [] }));
  await legit("학생: 자기 반 코드로 글 쓰기", () => setDoc(doc(db, "writings/wS1"), { studentId: sA, classCode: "A1", content: "새 글", isDraft: false }));
  await attack("학생: 서명 없이 점수 100 쓰기", () => setDoc(doc(db, "writings/wS2"), { studentId: sA, classCode: "A1", content: "x", isDraft: false, score: 100 }));
  await attack("학생: 남의 첨삭 서명으로 점수 쓰기", () => setDoc(doc(db, "writings/wS3"), { studentId: sA, classCode: "A1", content: "x", isDraft: false, score: 99, analysisId: "okB" }));
  await attack("학생: 서명과 다른 점수", () => setDoc(doc(db, "writings/wS4"), { studentId: sA, classCode: "A1", content: "x", isDraft: false, score: 95, analysisId: "okA" }));
  await attack("학생: 좋은 서명을 다른(길이가 다른) 글에 붙이기", () => setDoc(doc(db, "writings/wS6"), { studentId: sA, classCode: "A1", content: "다른 글을 길게 썼다", isDraft: false, score: 77, analysisId: "okA" }));
  await legit("학생: 서명된 점수로 제출", () => setDoc(doc(db, "writings/wS5"), { studentId: sA, classCode: "A1", content: "x", isDraft: false, score: 77, analysisId: "okA" }));
  await attack("학생: 낸 글 점수를 100으로 고치기", () => updateDoc(doc(db, "writings/wS5"), { score: 100 }));
  await legit("학생: 낸 글의 다른 칸 고치기(점수·글 그대로)", () => updateDoc(doc(db, "writings/wS5"), { lastSavedAt: "2026-11-20" }));
  await attack("학생: 점수는 두고 글만 바꿔치기", () => updateDoc(doc(db, "writings/wS5"), { content: "남이 쓴 좋은 글을 통째로" }));
  await attack("학생: 선생님 한마디 스스로 쓰기", () => updateDoc(doc(db, "writings/wS5"), { teacherComment: "참 잘했어요", teacherScore: 100 }));
  await attack("학생: 첨삭 서명 읽기", () => getDoc(doc(db, "analyses/okA")));
  await attack("학생: 내 글을 «선생님 확인됨»으로", () => updateDoc(doc(db, "writings/wS5"), { reviewed: true, reviewedAt: "x" }));
  await attack("학생: 반 랭킹 직접 고치기", () => updateDoc(doc(db, "classes/A1"), { weeklyRanking: { periodKey: "x", formula: "effort1", data: [{ studentId: sA, rankingScore: 9999 }] } }));
  await attack("학생: 같은 글 기록 읽기", () => getDoc(doc(db, "analysisCache/k1")));
  await attack("학생: 다른 반 코드로 글 끼워 넣기", () => setDoc(doc(db, "writings/wS2"), { studentId: sA, classCode: "B1", content: "x" }));
  await attack("학생: 내 글을 친구 글로 바꾸기(studentId)", () => updateDoc(doc(db, "writings/wS1"), { studentId: sA2 }));
  await attack("학생: 자기 반 랭킹 비우기(이제 서버만 쓴다)", () => updateDoc(doc(db, "classes/A1"), { weeklyRanking: { data: [] }, rankingUpdatedAt: "x" }));
  await attack("학생: 다른 반 랭킹 조작", () => updateDoc(doc(db, "classes/B1"), { weeklyRanking: { data: [] } }));
  await attack("학생: 친구 정보 읽기", () => getDoc(doc(db, `users/${sA2}`)));
});
await client(async (auth, db) => {
  await signInWithEmailAndPassword(auth, "admin@ssak.kr", "secret123");
  await legit("슈퍼관리자: 모든 반", () => getDocs(query(collection(db, "classes"))));
  await legit("슈퍼관리자: 교사 목록", () => getDocs(query(collection(db, "users"), where("role", "==", "teacher"))));
  await legit("슈퍼관리자: 교사 승인", () => updateDoc(doc(db, `users/${tB}`), { approved: true }));
});

const bad = results.filter(([, ok]) => !ok);
console.log(bad.length ? `FAIL ${bad.length}/${results.length}` : `PASS ${results.length}/${results.length}`);
process.exit(bad.length ? 1 : 0);
