// 첨삭 흐름 시험 — 에뮬레이터(auth·firestore·functions) + 가짜 Anthropic(8787). 2026-11-20 업그레이드 1단계.
// 판정: 결과에 서명(analysisId)·analyses 문서 · 같은 글 다시 → AI 0회·같은 점수 · 안 고친 고쳐쓰기는 덤 없음
//       · AI 가 망가진 답만 주면 «가짜 점수» 대신 unavailable · 서명 점수로만 제출 가능 · 고칠 것 ≤2·맞춤법만 바로
import http from "node:http";
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
import { getFirestore, connectFirestoreEmulator, doc, setDoc } from "firebase/firestore";

let aiHits = 0;
let lastBody = "";
let mode = "good";
const good = {
  scores: { content: 18, topic: 8, structure: 14, vocabulary: 13, grammar: 11, creativity: 6 },
  evidence: { content: { quote: "줄넘기를 했다", why: "겪은 일" }, topic: { quote: "없는 구절", why: "x" } },
  strengths: [{ text: "겪은 일을 썼어요", quote: "줄넘기를 했다" }, { text: "느낌", quote: "기뻤다" }],
  nextSteps: [
    { focus: "content", quote: "정말 기뻤다", why: "왜 기뻤는지", hint: "어떤 순간이었나요?", example: "예시" },
    { focus: "structure", quote: "오늘은", why: "처음", hint: "?", example: "e" },
    { focus: "grammar", quote: "열번", why: "셋째", hint: "?", example: "e" },
  ],
  spelling: [{ original: "열번을", suggestion: "열 번을" }, { original: "정말 기뻤다", suggestion: "나는 그때 세상에서 가장 행복한 아이였다" }],
  overall: "잘했어요", growth: "",
};
const stub = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    aiHits++;
    lastBody = body;
    const text = mode === "good" ? JSON.stringify(good) : "죄송해요 지금은 JSON 을 못 드려요";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: "stub", stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: "text", text }] }));
  });
});
await new Promise((r) => stub.listen(8787, "127.0.0.1", r));

const P = "isw-writing";
const admin = adminInit({ projectId: P }, "admin");
const adb = adminFs(admin, "seoul");
const aauth = adminAuth(admin);
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${P}/databases/seoul/documents`, { method: "DELETE" });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${P}/accounts`, { method: "DELETE" });
const u = await aauth.createUser({ email: "s@x.kr", password: "secret123" });
await adb.doc(`users/${u.uid}`).set({ uid: u.uid, role: "student", classCode: "AAAAAA", name: "학생01" });
await adb.doc("classes/AAAAAA").set({ teacherId: "t1", className: "1반", students: [{ studentId: u.uid }] });

const app = initializeApp({ projectId: P, apiKey: "fake", authDomain: "x" }, "c");
const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
const fdb = getFirestore(app, "seoul"); connectFirestoreEmulator(fdb, "127.0.0.1", 8080);
const fns = getFunctions(app, "asia-northeast3"); connectFunctionsEmulator(fns, "127.0.0.1", 5001);
await signInWithEmailAndPassword(auth, "s@x.kr", "secret123");
const analyze = httpsCallable(fns, "analyzeWriting");

let bad = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) bad++; };
const text = "오늘은 학교에서 친구들과 줄넘기를 했다. 나는 열번을 넘었다. 정말 기뻤다. 다음에는 더 많이 넘고 싶다. 친구들도 함께 박수를 쳐 주었다.";
const base = { text, topic: "나의 하루", gradeLevel: "elementary_3_4", wordCount: 300, idealWordCount: 300, genre: "diary", goal: "reason" };

const r1 = (await analyze(base)).data;
ok(typeof r1.analysisId === "string" && (await adb.doc(`analyses/${r1.analysisId}`).get()).data()?.score === r1.score, `결과에 서명·analyses 점수 일치 (${r1.score}점)`);
ok(r1.nextSteps.length === 2 && r1.spelling.length === 1, `고칠 것 2개·맞춤법만 바로 (${r1.nextSteps.length}, ${r1.spelling.length})`);
ok(r1.criteria.topic.quote === null && r1.criteria.content.quote, "글에 없는 근거 인용은 버림");
ok(!("aiUsageCheck" in r1), "AI 확률 판정 없음");
ok(aiHits === 1, `첫 첨삭 AI 1회 (${aiHits})`);

const r2 = (await analyze(base)).data;
ok(aiHits === 1 && r2.score === r1.score && r2.cached === true, `같은 글 다시 → AI 0회·같은 점수 (${r2.score}, AI ${aiHits})`);

const r3 = (await analyze({ ...base, isRewrite: true, previousScore: r1.score, previousText: text })).data;
ok(r3.score === r1.score && r3.scoreDiff === 0 && /달라진 곳이 없어요/.test(r3.growthNote), `안 고친 고쳐쓰기 → 덤 없음·솔직한 말 (${r3.score}, ${r3.growthNote})`);

mode = "broken";
const before = aiHits;
const r4 = await analyze({ ...base, text: text + " 새 문장을 하나 더 썼다." }).then(() => "통과됨", (e) => e.code);
ok(r4 === "functions/unavailable" && aiHits - before === 3, `AI 가 망가진 답만 → 가짜 점수 대신 unavailable (${r4}, 재시도 ${aiHits - before})`);

// 서명 점수로만 제출
const okSubmit = await setDoc(doc(fdb, "writings/w1"), { studentId: u.uid, classCode: "AAAAAA", topic: "나의 하루", content: text, isDraft: false, score: r1.score, analysisId: r1.analysisId, submittedAt: new Date().toISOString() }).then(() => "ok", (e) => e.code);
const forged = await setDoc(doc(fdb, "writings/w2"), { studentId: u.uid, classCode: "AAAAAA", content: text, isDraft: false, score: 100, analysisId: r1.analysisId }).then(() => "ok", (e) => e.code);
ok(okSubmit === "ok" && forged === "permission-denied", `서명 점수 제출 ok·위조 100점 거절 (${okSubmit}, ${forged})`);

ok(!("wordCountPenalty" in r1) === false && r1.wordCountPenalty > 0, `글자 수는 서버가 셈 — 짧은 글에 «300자»라 보내도 감점 (${r1.wordCountPenalty})`);

// 랭킹은 서버 트리거가 — 첫 글 노력 10(통과 못 함), 같은 주제 고쳐 쓴 글은 고쳐쓰기로 셈
const waitRank = async (pred) => { for (let i = 0; i < 40; i++) { const r = (await adb.doc("classes/AAAAAA").get()).data()?.weeklyRanking; const me = r?.data?.find((x) => x.studentId === u.uid); if (pred(me, r)) return { me, r }; await new Promise((z) => setTimeout(z, 500)); } return {}; };
const w1 = await waitRank((me) => me && me.submissionCount === 1);
ok(w1.me?.effortScore === 10 && w1.r?.formula === "effort1", `첫 글 → 노력 10·서버가 씀 (${w1.me?.effortScore})`);
mode = "good";
const text2 = text + " 그래서 다음 주에도 줄넘기를 열심히 연습하기로 마음먹었다.";
const r5 = (await analyze({ ...base, text: text2, isRewrite: true, previousScore: 0, previousText: text })).data;
await setDoc(doc(fdb, "writings/w3"), { studentId: u.uid, classCode: "AAAAAA", topic: "나의 하루", content: text2, isDraft: false, score: r5.score, analysisId: r5.analysisId, submittedAt: new Date(Date.now() + 1000).toISOString() });
const w2 = await waitRank((me) => me && me.submissionCount === 2);
const expect = 10 + 10 + Math.max(0, Math.min(20, r5.score - r1.score)) + (r5.score >= 70 ? 5 : 0);
ok(w2.me?.rewriteCount === 1 && w2.me?.effortScore === expect, `고쳐쓰기 → 서버가 앞 글에서 나아진 점수를 읽음(클라가 보낸 previousScore 0 은 무시) (${w2.me?.effortScore}/${expect})`);

// 가림 2층 — 규칙만으로는 새던 별명·가게·이름이 AI 로 나가지 않고, 미리보기에 보인 글이 그대로 나간다(2026-11-22)
mode = "good";
const piiText = "어제 학원 끝나고 탱구랑 무지개분식에서 떡볶이를 먹었다. 탱구는 솔메마을에 사는데 나보다 줄넘기를 훨씬 잘한다. 나는 열번을 넘었고 탱구는 쉰 번을 넘었다. 다음에는 빈우 형도 같이 가기로 했다. 정말 기뻤다.";
const pv = (await httpsCallable(fns, "maskPreview")({ texts: [piiText] })).data.texts[0];
ok(!/탱구|무지개분식|솔메|빈우/.test(pv) && pv.includes("ㅇㅇㅇ") && pv.includes("떡볶이"), `미리보기가 2층까지 가림 («${pv.slice(0, 40)}…»)`);
const hitsBeforePii = aiHits;
await analyze({ ...base, text: piiText });
const sent = JSON.parse(lastBody).messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");
ok(aiHits === hitsBeforePii + 1 && !/탱구|무지개분식|솔메|빈우/.test(lastBody), "AI 로 나간 요청에 별명·가게·마을·이름 없음");
ok(sent.includes(pv), "미리보기에 보인 글 = AI 로 나간 글");
const extra = (await httpsCallable(fns, "maskPreview")({ texts: [""] }).catch((e) => e.code));
ok(typeof extra === "string" || extra?.data, "빈 글 미리보기는 죽지 않음");

console.log(bad ? `\n${bad}개 실패` : "\n모두 통과");
stub.close();
process.exit(bad ? 1 : 0);
