// 첨삭 엔진 시험 — AI 없이 normalizeAnalysis·buildAnalysisPrompt 를 잰다(2026-11-20 업그레이드 1·2단계).
// 판정: 글에 없는 인용은 버림 · 고칠 것 ≤2 · 과제 중점이 앞 · 맞춤법만 바로(문장 바꿔 쓰기는 버림) · 총점 = 항목 합
//       · 프롬프트에 고쳐쓰기 덤 지시 없음 · 장르·목표 키가 화면과 같음
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const F = require("./feedback.js");
const UI = await import("../src/config/writingOptions.js");

let bad = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) bad++; };

const text = "오늘은 학교에서 친구들과 줄넘기를 했다. 나는 열번을 넘었다 정말 기뻤다. 다음에는 더 잘하고 싶다.";
const raw = {
  scores: { content: 30, topic: 8, structure: 14, vocabulary: 13, grammar: 9, creativity: 5 },
  evidence: {
    content: { quote: "친구들과 줄넘기를 했다", why: "겪은 일이 있다" },
    topic: { quote: "우주 여행을 떠났다", why: "글에 없는 인용" },
    structure: { quote: "다음에는  더 잘하고 싶다", why: "띄어쓰기만 다른 인용" },
  },
  strengths: [{ text: "겪은 일을 썼어요", quote: "줄넘기를 했다" }, { text: "느낌을 썼어요", quote: "없는 말" }, { text: "세 번째", quote: "" }],
  nextSteps: [
    { focus: "content", quote: "정말 기뻤다", why: "왜 기뻤는지", hint: "어떤 순간이 가장 기뻤나요?", example: "열 번째를 넘는 순간 친구들이 박수를 쳐 줘서 가슴이 두근거렸다." },
    { focus: "grammar", quote: "열번을 넘었다", why: "띄어쓰기", hint: "숫자와 단위 사이", example: "열 번을 넘었다." },
    { focus: "structure", quote: "오늘은", why: "셋째는 버려야", hint: "", example: "" },
  ],
  spelling: [
    { original: "열번을", suggestion: "열 번을" },
    { original: "넘었다 정말", suggestion: "넘었다. 그리고 그 순간 나는 세상에서 가장 행복한 아이가 되었다" },
    { original: "없는어절", suggestion: "없는 어절" },
  ],
  goalFeedback: "까닭을 붙이려고 했어요",
  overall: "잘했어요",
  growth: "",
};
const a = F.normalizeAnalysis(raw, text, { goal: "reason", focus: ["grammar"] });

ok(a.contentScore === 25 && a.score === 25 + 8 + 14 + 13 + 9 + 5, `점수는 만점 안으로·총점 = 합(${a.score})`);
ok(a.criteria.content.quote && a.criteria.topic.quote === null, "글에 없는 인용(우주 여행)은 버리고 있는 인용은 남김");
ok(a.criteria.structure.quote !== null, "띄어쓰기만 다른 인용은 글에 있는 것으로");
ok(a.strengthItems.length === 2 && a.strengthItems[1].quote === null, `잘한 점 2개·없는 인용은 null (${a.strengthItems.length})`);
ok(a.nextSteps.length === 2, `고칠 것 2개까지 (${a.nextSteps.length})`);
ok(a.nextSteps[0].focus === "grammar", `과제 중점(문법)이 맨 앞 (${a.nextSteps.map((x) => x.focus)})`);
ok(a.nextSteps.every((x) => x.hint !== undefined && "example" in x), "고칠 것마다 힌트·예시(예시는 화면이 잠가 둠)");
ok(a.spelling.length === 1 && a.spelling[0].suggestion === "열 번을", `맞춤법은 짧은 교정만, 문장 바꿔 쓰기·글에 없는 어절은 버림 (${JSON.stringify(a.spelling)})`);
ok(a.detailedFeedback.every((x) => x.type === "spelling"), "옛 문장별 수정 칸에는 맞춤법만");
ok(a.goal === "reason" && a.goalFeedback, "목표 응답이 남음");
ok(!("aiUsageCheck" in a) && !("aiCheck" in a), "AI 확률 판정 없음(2-B 과정 기록으로 대체)");
ok(F.normalizeAnalysis({}, text).score === 0 && F.normalizeAnalysis(null, text).nextSteps.length === 0, "빈 답도 안 깨짐");

ok(F.isSpellingFix("할수있다", "할 수 있다") && F.isSpellingFix("되요", "돼요") && !F.isSpellingFix("나는 밥을 먹었다.", "나는 잠이 들었다."), "맞춤법 = 띄어쓰기·글자 2개 이내만, 같은 길이로 뜻 바꾸기는 아님");
ok(F.quoteInText("줄넘기를 했다", text) && !F.quoteInText("오늘", text) && !F.quoteInText("했다", text), "근거 인용은 4글자 이상(두세 글자는 아무 글에나 있다)");

const p = F.buildAnalysisPrompt({ grade: "초3-4", topic: "줄넘기", text, wordCount: 50, idealWordCount: 300, genre: "opinion", goal: "reason", focus: ["structure"], previousText: "예전 글" });
ok(!/\+3|\+5|보너스|노력인정/.test(p), "고쳐쓰기 덤 지시 없음(1-4)");
ok(p.includes("주장하는 글") && p.includes("까닭이 두 가지") && p.includes("생각에 까닭 붙이기") && p.includes("구성"), "장르 기준·목표·과제 중점이 프롬프트에");
ok(p.includes("고쳐 썼다고 점수를 더 주지 않는다"), "고쳐쓰기는 같은 기준");

const sameKeys = (srv, ui) => JSON.stringify(Object.keys(srv)) === JSON.stringify(ui.map((x) => x.key)) && ui.every((x) => (srv[x.key].name || srv[x.key]) === x.name);
ok(sameKeys(F.GENRES, UI.GENRES), "장르 키·이름 = 화면");
ok(sameKeys(F.GOALS, UI.GOALS), "목표 키·이름 = 화면");
ok(JSON.stringify(F.CRITERIA.map((c) => [c[0], c[1], c[2]])) === JSON.stringify(UI.CRITERIA.map((c) => [c.key, c.name, c.max])), "항목·만점 = 화면");

console.log(bad ? `\n${bad}개 실패` : "\n모두 통과");
process.exit(bad ? 1 : 0);
