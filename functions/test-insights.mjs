// 교사용 모아 보기 시험(2-G·2-H·2-K) — AI·에뮬레이터 없이.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const I = require("./insights.js");
let bad = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) bad++; };

const A = (c, s, g, extra = {}) => ({ contentScore: c, topicRelevanceScore: 8, structureScore: s, vocabularyScore: 14, grammarScore: g, creativityScore: 6, ...extra });
const ws = [
  { isDraft: false, topic: "가을", score: 60, submittedAt: "2026-11-01", analysis: A(15, 8, 7, { nextSteps: [{ focus: "structure" }, { focus: "grammar" }], spelling: [{ original: "되요", suggestion: "돼요" }] }) },
  { isDraft: false, topic: "가을", score: 66, submittedAt: "2026-11-02", analysis: A(16, 9, 8, { nextSteps: [{ focus: "structure" }], spelling: [{ original: "되요", suggestion: "돼요" }] }) },
  { isDraft: false, topic: "겨울", score: 75, submittedAt: "2026-11-10", teacherScore: 80, teacherComment: "좋아요", analysis: A(20, 15, 12, { nextSteps: [{ focus: "content" }] }) },
  { isDraft: false, topic: "봄", score: 80, submittedAt: "2026-11-15", teacherScore: 70, analysis: A(21, 16, 13) },
  { isDraft: true, topic: "x", analysis: A(1, 1, 1) },
];
const ci = I.classInsights(ws);
ok(ci.count === 4, `임시 글은 빼고 4편 (${ci.count})`);
ok(ci.weak[0].key === "structure" && ci.weak[0].lesson, `가장 많이 나온 약점 = 구성 + 5분 수업 (${ci.weak.map((x) => x.key)})`);
ok(ci.spelling[0].fix === "되요→돼요" && ci.spelling[0].count === 2, "맞춤법 TOP");
ok(!JSON.stringify(ci).includes("content\":\"") , "학생 글 원문 없음");

const r = I.studentReport(ws);
ok(r.count === 4 && r.rewrites === 1 && r.teacherComments === 1, `편 수·고쳐쓰기·선생님 한마디 (${r.count}, ${r.rewrites}, ${r.teacherComments})`);
ok(r.change.structure > 0 && r.first.structure.pct < r.recent.structure.pct, `구성: 처음 ${r.first.structure.pct}% → 요즘 ${r.recent.structure.pct}%`);
ok(r.items[0].date === "2026-11-01" && r.items.at(-1).date === "2026-11-15", "날짜 순");

const ag = I.teacherAgreement(ws);
ok(ag.n === 2 && ag.meanAbsDiff === 7.5 && ag.within5 === 50 && ag.aiHigher === 50, `교사·AI 일치도 (${JSON.stringify(ag)})`);
ok(I.teacherAgreement([]).n === 0, "교사 점수 없으면 n 0");
ok(JSON.stringify(I.spread([70, 74, 71])) === JSON.stringify({ runs: 3, min: 70, max: 74, range: 4 }), "흔들림 범위");

// 교차검증 2단계: 항목 점수가 없는 글은 그 항목 분모에서 뺀다 · nextSteps 에 null 이 섞여도 죽지 않는다
const mixed = I.classInsights([
  { isDraft: false, analysis: { structureScore: 20, nextSteps: [null, { focus: "content" }], spelling: [null] } },
  { isDraft: false, analysis: { contentScore: 25 } },
]);
ok(mixed.averages.structure.pct === 100 && mixed.averages.content.pct === 100, `없는 항목은 분모에서 뺌 (${JSON.stringify(mixed.averages)})`);
console.log(bad ? `\n${bad}개 실패` : "\n모두 통과");
process.exit(bad ? 1 : 0);
