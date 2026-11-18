// AI 문지기 시험 — 에뮬레이터(auth·firestore·functions) + 가짜 Anthropic(8787, 호출 수를 센다).
// 2026-11-18: 로그인만 하면 도움·조언·AI탐지·표절을 횟수 없이 부를 수 있었고, 첨삭 한도는 계정마다라 가입 반복으로 무한이었다.
// 판정: 미승인 교사·학급 없는 학생은 AI 0회 · 사람/학급/전체 하루 한도 · 동시 호출로도 한도 못 넘음 · 교사는 사람 한도 없음.
import http from "node:http";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const { initializeApp: adminInit } = require("../functions/node_modules/firebase-admin/lib/app/index.js");
const { getFirestore: adminFs } = require("../functions/node_modules/firebase-admin/lib/firestore/index.js");
const { getAuth: adminAuth } = require("../functions/node_modules/firebase-admin/lib/auth/index.js");
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "firebase/functions";

// 가짜 Anthropic — 받은 요청 수 = 실제로 돈이 나갔을 호출 수
let aiHits = 0;
const stub = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    aiHits++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "msg_x", type: "message", role: "assistant", model: "stub", stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 },
      content: [{ type: "text", text: '{"advice":"좋아요","emoji":"x","nextHint":"더 써 봐요"}' }] }));
  });
});
await new Promise((r) => stub.listen(8787, "127.0.0.1", r));

const P = "isw-writing";
const admin = adminInit({ projectId: P }, "admin");
const adb = adminFs(admin, "seoul");
const aauth = adminAuth(admin);
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/seoul/documents`, { method: "DELETE" });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: "DELETE" });
await adb.doc("settings/usageLimits").set({ perUser: 3, perSchool: 5, global: 12 });

const mk = async (email, data) => { const u = await aauth.createUser({ email, password: "secret123" }); await adb.doc(`users/${u.uid}`).set({ uid: u.uid, email, ...data }); return email; };
const pending = await mk("new@x.kr", { role: "teacher", approved: false });
const loner = await mk("loner@x.kr", { role: "student", classCode: null });
const tA = await mk("ta@x.kr", { role: "teacher", approved: true });
const s1 = await mk("s1@x.kr", { role: "student", classCode: "AAAAAA" });
const s2 = await mk("s2@x.kr", { role: "student", classCode: "AAAAAA" });
const s3 = await mk("s3@x.kr", { role: "student", classCode: "BBBBBB" });
const s4 = await mk("s4@x.kr", { role: "student", classCode: "CCCCCC" });

let n = 0;
const as = async (email) => {
  const app = initializeApp({ projectId: P, apiKey: "fake", authDomain: "x" }, `a${n++}`);
  const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, "secret123");
  const fns = getFunctions(app, "asia-northeast3"); connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  const advice = httpsCallable(fns, "getQuickAdvice");
  const help = httpsCallable(fns, "getWritingHelp");
  const analyze = httpsCallable(fns, "analyzeWriting");
  let k = 0; // 같은 글은 도움 캐시가 AI 없이 답한다(셀 필요 없음) — 매번 다른 글로 보낸다
  const call = (fn = advice) => fn({ text: `오늘은 학교에서 친구들과 함께 운동장에서 줄넘기를 ${++k}번 했다. 정말 재미있었다.`, topic: "나의 하루", gradeLevel: "elementary_3_4", adviceType: "next", helpType: "hint" })
    .then(() => "ok", (e) => e.code);
  return { call, help, analyze, app };
};
const tally = (rs) => rs.reduce((m, r) => ((m[r] = (m[r] || 0) + 1), m), {});

let bad = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) bad++; };

const P1 = await as(pending);
const r0 = [await P1.call(), await P1.call(P1.help)];
ok(r0.every((r) => r === "functions/permission-denied"), `승인 안 된 교사 → 거절 (${r0})`);
const L1 = await as(loner);
const r1 = await L1.call();
ok(r1 === "functions/permission-denied", `학급 없는 학생 → 거절 (${r1})`);
ok(aiHits === 0, `거절된 호출은 AI 에 안 감 (AI ${aiHits}회)`);

const A1 = await as(s1);
const ra = [];
for (let i = 0; i < 4; i++) ra.push(await A1.call(i % 2 ? A1.help : undefined));
ok(JSON.stringify(ra) === JSON.stringify(["ok", "ok", "ok", "functions/resource-exhausted"]), `사람 한도 3 — 도움·조언 합산 (${ra})`);

const A2 = await as(s2);
const rb = [];
for (let i = 0; i < 3; i++) rb.push(await A2.call());
ok(JSON.stringify(rb) === JSON.stringify(["ok", "ok", "functions/resource-exhausted"]), `학급 한도 5 — 같은 반 친구는 2번만 (${rb})`);

const B3 = await as(s3);
const rc = tally(await Promise.all(Array.from({ length: 8 }, () => B3.call())));
ok(rc.ok === 3, `동시 8번 → 딱 3번만 통과 (${JSON.stringify(rc)})`);

const T = await as(tA);
const rt = [];
for (let i = 0; i < 4; i++) rt.push(await T.call());
ok(rt.every((r) => r === "ok"), `승인 교사는 사람 한도(3)에 안 걸림 (${rt})`);

const C4 = await as(s4);
const rg = await C4.call();
ok(rg === "functions/resource-exhausted", `전체 한도 12 다 차면 처음 쓰는 반도 멈춤 (${rg})`);
ok(aiHits === 12, `실제 AI 호출 = 통과한 수 12 (AI ${aiHits}회)`);

// 무의미한 글은 AI 를 안 부르니 횟수도 안 센다 — 전체 한도가 찼어도 «무의미» 판정은 돌아온다
const junk = await C4.analyze({ text: "ㅋ".repeat(40), topic: "나의 하루", gradeLevel: "elementary_3_4", wordCount: 40, idealWordCount: 300 }).then((r) => `ok:${r.data.score}`, (e) => e.code);
ok(junk === "ok:0", `무의미한 글은 문지기 전에 0점으로 끝남 (${junk})`);

// 관리자 값: 0 = 멈춤, 터무니없는 값(1e20) = 기본값. 함수 쪽 한도 캐시(30초)가 지나길 기다린다
await adb.doc("settings/usageLimits").set({ perUser: 0, perSchool: 5, global: 1e20 });
await new Promise((r) => setTimeout(r, 31000));
const z = await C4.call();
ok(z === "functions/resource-exhausted", `사람 한도 0 = 멈춤 (${z})`);
const big = await T.call();
ok(big === "ok", `global 1e20 은 무시하고 기본값(5000) — 무한이 아님, 12 넘어도 교사 통과 (${big})`);

console.log(bad ? `\n${bad}개 실패` : "\n모두 통과");
for (const x of [P1, L1, A1, A2, B3, T, C4]) await deleteApp(x.app);
stub.close();
process.exit(bad ? 1 : 0);
