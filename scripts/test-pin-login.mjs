// 자기번호 로그인 시험 — 에뮬레이터(auth·firestore·functions)에서 진짜 pinLogin·issueStudentPins 를 부른다.
// 2026-11-18: 비번 쪽지 없이 «학급코드 + 번호 + 숫자 4자리»로 들어오게 했다. 4자리는 맞혀 보기에 약하니
// 판정: 맞으면 그 학생으로 로그인 · 5번 틀리면 잠금(맞는 번호도 막힘) · 10번이면 선생님이 새로 줄 때까지 ·
//       동시에 마구 넣어도 횟수가 새지 않음 · 남의 반 교사·학생은 자기번호를 못 만듦 · 반에서 빠진 학생은 못 들어옴.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const { initializeApp: adminInit } = require("../functions/node_modules/firebase-admin/lib/app/index.js");
const { getFirestore: adminFs } = require("../functions/node_modules/firebase-admin/lib/firestore/index.js");
const { getAuth: adminAuth } = require("../functions/node_modules/firebase-admin/lib/auth/index.js");
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signInWithCustomToken, signOut } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

const P = "isw-writing";
const admin = adminInit({ projectId: P }, "admin");
const adb = adminFs(admin, "seoul");
const aauth = adminAuth(admin);
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/seoul/documents`, { method: "DELETE" });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: "DELETE" });

const mk = async (email, data) => { const u = await aauth.createUser({ email, password: "secret123" }); await adb.doc(`users/${u.uid}`).set({ uid: u.uid, email, ...data }); return u.uid; };
const tA = await mk("ta@x.kr", { role: "teacher", approved: true });
await mk("tb@x.kr", { role: "teacher", approved: true });
// 옛 방식 아이디(교사 메일 앞부분)로 만든 학생이 이미 반에 있다 — 번호가 겹치면 안 된다
const old = await mk("kim001@gmail.com", { role: "student", classCode: "AB3K9Z" });
await adb.doc("classes/AB3K9Z").set({ teacherId: tA, className: "3반", gradeLevel: "elementary_3_4", students: [{ studentId: old, studentName: "학생1" }] });

const app = initializeApp({ projectId: P, apiKey: "fake", authDomain: "x" }, "c");
const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const fns = getFunctions(app, "asia-northeast3"); connectFunctionsEmulator(fns, "127.0.0.1", 5001);
const batch = httpsCallable(fns, "batchCreateStudents");
const issue = httpsCallable(fns, "issueStudentPins");
const pinLogin = httpsCallable(fns, "pinLogin");
// 성공 = 토큰 문자열, 실패 = "functions/…" 코드 — 둘 다 문자열이라 isTok 으로 가른다
const tryPin = (classCode, number, pin) => pinLogin({ classCode, number, pin }).then((r) => r.data.token, (e) => e.code);
const isTok = (r) => typeof r === "string" && !r.startsWith("functions/");

let bad = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) bad++; };

await signInWithEmailAndPassword(auth, "ta@x.kr", "secret123");
const made = (await batch({ classCode: "AB3K9Z", count: 3, gradeLevel: "elementary_3_4" })).data.results;
await signOut(auth);
ok(made.every((r) => /^\d{4}$/.test(r.pin) && Number.isInteger(r.number)), `만들 때 번호·자기번호가 같이 나옴 (${made.map((r) => `${r.number}:${r.pin ? "****" : "없음"}`).join(" ")})`);
ok(JSON.stringify(made.map((r) => r.number)) === "[2,3,4]", `번호 = 아이디 끝 두 자리 (${made.map((r) => r.number)})`);

const [s2, s3, s4] = made;
const tok = await tryPin(" ab3k9z ", s2.number, s2.pin);
ok(isTok(tok), `맞는 자기번호 → 들어감(학급코드 소문자·공백도) (${isTok(tok) ? "토큰" : tok})`);
if (isTok(tok)) {
  await signInWithCustomToken(auth, tok);
  ok(auth.currentUser?.uid === s2.studentId, "그 학생 계정으로 로그인됨");
  await signOut(auth);
}
const wrongPin = (p) => String((Number(p) + 1) % 10000).padStart(4, "0");

// 없는 번호와 틀린 자기번호는 같은 대답
const ghost = await tryPin("AB3K9Z", 77, "5829");
const w1 = await tryPin("AB3K9Z", s3.number, wrongPin(s3.pin));
ok(ghost === "functions/unauthenticated" && w1 === "functions/unauthenticated", `없는 번호·틀린 자기번호 → 같은 거절 (${ghost}, ${w1})`);

// 5번 틀리면 잠금 — 맞는 번호도 막힘
for (let i = 0; i < 4; i++) await tryPin("AB3K9Z", s3.number, wrongPin(s3.pin));
const locked = await tryPin("AB3K9Z", s3.number, s3.pin);
ok(locked === "functions/resource-exhausted", `5번 틀린 뒤엔 맞는 자기번호도 잠김 (${locked})`);
// 잠금 시간이 지나면 다시 — 맞히면 틀린 횟수 0
await adb.doc("pinAuth/AB3K9Z_03").update({ lockedUntil: Date.now() - 1 });
const after = await tryPin("AB3K9Z", s3.number, s3.pin);
const f0 = (await adb.doc("pinAuth/AB3K9Z_03").get()).data().fails;
ok(isTok(after) && f0 === 0, `잠금이 풀리면 들어가고 틀린 횟수 0 (${isTok(after) ? "토큰" : after}, fails ${f0})`);

// 동시에 12번 마구 넣어도 5번까지만 세고 잠김
const burst = await Promise.all(Array.from({ length: 12 }, (_, i) => tryPin("AB3K9Z", s4.number, String((Number(s4.pin) + 1 + i) % 10000).padStart(4, "0"))));
const f4 = (await adb.doc("pinAuth/AB3K9Z_04").get()).data().fails;
ok(f4 === 5 && !burst.some(isTok), `동시 12번 → 정확히 5번 세고 잠금 (fails ${f4})`);
// 10번 = 선생님이 새로 줄 때까지
await adb.doc("pinAuth/AB3K9Z_04").update({ lockedUntil: Date.now() - 1 });
for (let i = 0; i < 5; i++) await tryPin("AB3K9Z", s4.number, wrongPin(s4.pin));
await adb.doc("pinAuth/AB3K9Z_04").update({ lockedUntil: Date.now() - 1 }); // 시간이 지나도
const hard = await tryPin("AB3K9Z", s4.number, s4.pin);
ok(hard === "functions/resource-exhausted", `10번 틀리면 시간이 지나도 잠김 (${hard})`);

// 남이 자기번호를 만들 수 없다
await signInWithEmailAndPassword(auth, "tb@x.kr", "secret123");
const other = await issue({ classCode: "AB3K9Z", studentIds: [s4.studentId] }).then(() => "통과됨", (e) => e.code);
await signOut(auth);
await signInWithCustomToken(auth, tok);
const byKid = await issue({ classCode: "AB3K9Z", studentIds: [s4.studentId] }).then(() => "통과됨", (e) => e.code);
await signOut(auth);
ok(other === "functions/permission-denied" && byKid === "functions/permission-denied", `다른 반 교사·학생은 자기번호를 못 만듦 (${other}, ${byKid})`);

// 담임이 새로 주면 풀리고, 옛 자기번호는 안 됨. 옛 아이디 학생도 겹치지 않는 번호를 받음
await signInWithEmailAndPassword(auth, "ta@x.kr", "secret123");
const re = (await issue({ classCode: "AB3K9Z", studentIds: [s4.studentId] })).data.results[0];
const all = (await issue({ classCode: "AB3K9Z" })).data.results;
await signOut(auth);
const reOld = await tryPin("AB3K9Z", s4.number, s4.pin);
ok(re.number === s4.number && reOld === "functions/unauthenticated", `새로 주면 번호는 그대로·옛 자기번호는 거절 (${re.number}, ${reOld})`);
const nums = all.map((r) => r.number);
ok(new Set(nums).size === 4 && all.find((r) => r.studentId === old)?.number === 1, `반 전체 다시 주기 — 옛 아이디 학생은 빈 번호 1번, 겹침 없음 (${nums})`);
const s4now = all.find((r) => r.studentId === s4.studentId);
const relog = await tryPin("AB3K9Z", s4now.number, s4now.pin);
ok(isTok(relog), `새 자기번호로 들어감 (${isTok(relog) ? "토큰" : relog})`);

// 반에서 빠진 학생은 맞는 자기번호로도 못 들어온다
const s2now = all.find((r) => r.studentId === s2.studentId);
await adb.doc(`users/${s2.studentId}`).update({ classCode: null });
const moved = await tryPin("AB3K9Z", s2now.number, s2now.pin);
ok(moved === "functions/unauthenticated", `반에서 빠진 학생 → 거절 (${moved})`);

const asBool = await pinLogin({ classCode: "AB3K9Z", number: true, pin: "1234" }).then(() => "통과됨", (e) => e.code);
const asExp = await pinLogin({ classCode: "AB3K9Z", number: "1e1", pin: "1234" }).then(() => "통과됨", (e) => e.code);
ok(asBool === "functions/invalid-argument" && asExp === "functions/invalid-argument", `번호에 true·"1e1" → 거절 (${asBool}, ${asExp})`);
const padded = await tryPin("AB3K9Z", String(s4now.number).padStart(2, "0"), s4now.pin);
ok(isTok(padded), `번호를 "04" 처럼 넣어도 들어감 (${isTok(padded) ? "토큰" : padded})`);

// 번호 없는 옛 학생 둘에게 동시에 «자기번호 새로» → 서로 다른 번호
const o2 = await mk("kim002@gmail.com", { role: "student", classCode: "AB3K9Z" });
const o3 = await mk("kim003@gmail.com", { role: "student", classCode: "AB3K9Z" });
const cls = (await adb.doc("classes/AB3K9Z").get()).data();
await adb.doc("classes/AB3K9Z").update({ students: [...cls.students, { studentId: o2, studentName: "학생2" }, { studentId: o3, studentName: "학생3" }] });
await signInWithEmailAndPassword(auth, "ta@x.kr", "secret123");
const [i2, i3] = await Promise.all([issue({ classCode: "AB3K9Z", studentIds: [o2] }), issue({ classCode: "AB3K9Z", studentIds: [o3] })]);
await signOut(auth);
const n2 = i2.data.results[0].number, n3 = i3.data.results[0].number;
const p2 = await tryPin("AB3K9Z", n2, i2.data.results[0].pin), p3 = await tryPin("AB3K9Z", n3, i3.data.results[0].pin);
ok(n2 !== n3 && isTok(p2) && isTok(p3), `동시에 두 명 발급 → 다른 번호·둘 다 들어감 (${n2}, ${n3})`);

const junk = await tryPin("AB3K9Z", 1, "12a4");
ok(junk === "functions/invalid-argument", `숫자 4자리가 아니면 거절 (${junk})`);

console.log(bad ? `\n${bad}개 실패` : "\n모두 통과");
await deleteApp(app);
process.exit(bad ? 1 : 0);
