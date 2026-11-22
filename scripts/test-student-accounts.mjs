// 학생 계정 최소수집 시험 — 에뮬레이터(auth·firestore·functions)에서 진짜 batchCreateStudents 를 부른다.
// 2026-11-18: 학생 아이디가 교사 메일 도메인(abc001@gmail.com·학교 도메인)을 빌려 학교가 드러나고 남의 실제 주소와 겹쳤다.
// 판정: 아이디 = 학급코드+번호@우리 도메인, 교사 도메인·메일 앞부분이 학생 쪽 어디에도 없음, 짧은 아이디로 로그인, 지운 뒤 다시 만들어도 안 겹침.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const { initializeApp: adminInit } = require("../functions/node_modules/firebase-admin/lib/app/index.js");
const { getFirestore: adminFs } = require("../functions/node_modules/firebase-admin/lib/firestore/index.js");
const { getAuth: adminAuth } = require("../functions/node_modules/firebase-admin/lib/auth/index.js");
import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";
import { toLoginEmail, STUDENT_EMAIL_DOMAIN } from "../src/config/studentId.js";

const P = "isw-writing";
const admin = adminInit({ projectId: P }, "admin");
const adb = adminFs(admin, "seoul");
const aauth = adminAuth(admin);
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/seoul/documents`, { method: "DELETE" });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: "DELETE" });

const mkT = async (email, data) => { const u = await aauth.createUser({ email, password: "secret123" }); await adb.doc(`users/${u.uid}`).set({ uid: u.uid, email, role: "teacher", approved: true, ...data }); return u.uid; };
const t1 = await mkT("kimteacher@gmail.com", {}); // 이름 안 적은 교사
const t2 = await mkT("lee@sen-hanbit.es.kr", { name: "이선생님" });
await adb.doc("classes/AB3K9Z").set({ teacherId: t1, className: "3반", gradeLevel: "elementary_3_4", students: [] });
await adb.doc("classes/QW12ER").set({ teacherId: t2, className: "2반", gradeLevel: "elementary_5_6", students: [] });

const app = initializeApp({ projectId: P, apiKey: "fake", authDomain: "x" }, "c");
const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const fns = getFunctions(app, "asia-northeast3"); connectFunctionsEmulator(fns, "127.0.0.1", 5001);
const batch = httpsCallable(fns, "batchCreateStudents");

let bad = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) bad++; };

await signInWithEmailAndPassword(auth, "kimteacher@gmail.com", "secret123");
const r1 = (await batch({ classCode: "AB3K9Z", count: 3, gradeLevel: "elementary_3_4", prefix: "kim" })).data;
await signOut(auth);
await signInWithEmailAndPassword(auth, "lee@sen-hanbit.es.kr", "secret123");
const r2 = (await batch({ classCode: "QW12ER", count: 2, gradeLevel: "elementary_5_6" })).data;
await signOut(auth);

const all = [...r1.results, ...r2.results];
ok(r1.created === 3 && r2.created === 2, `만든 수 3+2 (실제 ${r1.created}+${r2.created})`);
ok(all.every((r) => r.email.endsWith(`@${STUDENT_EMAIL_DOMAIN}`)), "학생 아이디는 모두 우리 도메인");
ok(!all.some((r) => /gmail|sen-hanbit|kimteacher|kim\d/.test(r.email)), "교사 도메인·메일 앞부분·임의 접두어가 학생 아이디에 없음");
ok(r1.results[0].email === `ab3k9z01@${STUDENT_EMAIL_DOMAIN}`, `아이디 모양 학급코드+번호 (${r1.results[0].email})`);

const s1 = (await aauth.getUserByEmail(r1.results[0].email)).uid;
const d1 = (await adb.doc(`users/${s1}`).get()).data();
const dump = JSON.stringify(d1);
ok(!/gmail|kimteacher|sen-hanbit/.test(dump), "학생 문서에 교사 메일 흔적 없음");
ok(d1.classInfo.teacherName === "선생님", `이름 없는 교사는 «선생님» (실제 ${d1.classInfo.teacherName})`);
ok(d1.name === "학생01", `학생 표시 이름 = 번호 (${d1.name})`);

// 짧은 아이디만으로 로그인
await signInWithEmailAndPassword(auth, toLoginEmail(" AB3K9Z02 "), r1.results[1].password);
ok(auth.currentUser?.email === `ab3k9z02@${STUDENT_EMAIL_DOMAIN}`, "짧은 아이디(대문자·공백)로 로그인");
await signOut(auth);
ok(toLoginEmail("kimteacher@gmail.com") === "kimteacher@gmail.com", "교사 이메일은 그대로");

// 한 명 지운 뒤(명단 2명) 다시 만들면 번호가 겹치지 않아야 한다
const s2 = (await aauth.getUserByEmail(r1.results[1].email)).uid;
await aauth.deleteUser(s2);
const cls = (await adb.doc("classes/AB3K9Z").get()).data();
await adb.doc("classes/AB3K9Z").update({ students: cls.students.filter((s) => s.studentId !== s2) });
await signInWithEmailAndPassword(auth, "kimteacher@gmail.com", "secret123");
const r3 = (await batch({ classCode: "AB3K9Z", count: 2, gradeLevel: "elementary_3_4" })).data;
const emails = r3.results.filter((r) => r.status === "created").map((r) => r.email);
ok(r3.created === 2 && !emails.includes(r1.results[2].email), `지운 뒤 다시 만들기 2명·겹침 없음 (${emails.join(", ")})`);

await signOut(auth);

// 관리자가 대신 만들어도 학생에게는 담당 교사 이름(여기선 이름 없음 → «선생님»)이 보여야 한다
const adm = await aauth.createUser({ email: "admin@ssak.kr", password: "secret123" });
await adb.doc(`users/${adm.uid}`).set({ uid: adm.uid, email: "admin@ssak.kr", role: "super_admin", approved: true, name: "관리자홍길동" });
await signInWithEmailAndPassword(auth, "admin@ssak.kr", "secret123");
const r4 = (await batch({ classCode: "AB3K9Z", count: 1, gradeLevel: "elementary_3_4" })).data;
const s4 = (await aauth.getUserByEmail(r4.results[0].email)).uid;
const tn = (await adb.doc(`users/${s4}`).get()).data().classInfo.teacherName;
ok(tn === "선생님", `관리자가 만들어도 관리자 이름이 안 들어감 (${tn})`);
let frac = "통과됨";
try { await batch({ classCode: "AB3K9Z", count: 1.5, gradeLevel: "elementary_3_4" }); } catch (e) { frac = e.code; }
ok(frac !== "통과됨", `소수 인원(1.5) 거절 (${frac})`);

console.log(bad ? `\n${bad}개 실패` : "\n모두 통과");
process.exit(bad ? 1 : 0); // 관문: student-account-minimal
