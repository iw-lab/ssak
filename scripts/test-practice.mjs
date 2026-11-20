// 3-3 내 글 문장 연습 시험 — AI·DB 없이.
import { buildPractice, checkAnswer, isDrillable } from "../src/utils/practice.js";
import { shouldBeat, liveState } from "../src/utils/presence.js";
let bad = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) bad++; };

const ws = [
  { isDraft: false, topic: "가을", submittedAt: "2026-11-01", content: "오늘은 공원에 갔다. 나무가 빨개서 정말 이뻣다. 그래서 기분이 좋았다 안되요.", analysis: { spelling: [{ original: "이뻣다", suggestion: "예뻤다" }, { original: "안되요", suggestion: "안 돼요" }] } },
  { isDraft: false, topic: "겨울", submittedAt: "2026-11-10", content: "눈이 왔다. 썰매를 탔는데 안되요 라고 동생이 말했다. 나는 열번 넘어졌다!", analysis: { detailedFeedback: [{ type: "spelling", original: "안되요", suggestion: "안 돼요" }, { type: "expression", original: "눈이 왔다", suggestion: "하얀 눈이 펑펑 쏟아져 온 세상이 하얘졌다" }, { original: "열번", suggestion: "열 번" }] } },
  { isDraft: true, content: "임시 글 되요", analysis: { spelling: [{ original: "되요", suggestion: "돼요" }] } },
];
const p = buildPractice(ws);
ok(p[0].key === "안되요→안 돼요" && p[0].times === 2, `두 번 틀린 것 먼저 (${p.map((x) => x.key)})`);
ok(!p.some((x) => x.right.includes("펑펑")), "문장 통째 바꾸기는 문제로 안 냄");
ok(!p.some((x) => x.wrong === "되요"), "임시 글은 뺌");
const yeol = p.find((x) => x.wrong === "열번");
ok(yeol && yeol.before === "나는 " && yeol.after === " 넘어졌다!" && yeol.spacing, `문장 맥락·띄어쓰기 표시 (${JSON.stringify(yeol)})`);
ok(checkAnswer(p[0], " 안 돼요 ") && !checkAnswer(p[0], "안돼요") && !checkAnswer(p[0], "안되요"), "띄어쓰기까지 맞아야 정답");
ok(buildPractice(ws, { solved: ["안되요→안 돼요"] }).every((x) => x.key !== "안되요→안 돼요"), "맞힌 건 다시 안 냄");
ok(buildPractice(ws, { max: 1 }).length === 1, "최대 개수");
ok(!isDrillable("가", "가") && !isDrillable("", "x"), "같거나 빈 것은 제외");
ok(buildPractice([{ isDraft: false, content: "글", analysis: { spelling: [{ original: "없는말", suggestion: "없는 말" }] } }]).length === 0, "글에 없는 낱말은 제외");
ok(buildPractice([{ isDraft: false, content: "x", analysis: { spelling: [null] } }, { isDraft: false, content: "y", analysis: { detailedFeedback: [null] } }]).length === 0, "첨삭에 null 이 섞여도 죽지 않음");
// 3-4 현황 — 2분에 한 번만 쓰고, 주제·상태가 바뀌면 바로
const p0 = { key: "", at: 0, len: -1 };
ok(shouldBeat(p0, { topic: "가을", len: 1, state: "writing" }, 1000), "처음은 바로 씀");
const p1 = { key: "가을|writing", at: 1000, len: 1 };
ok(!shouldBeat(p1, { topic: "가을", len: 30, state: "writing" }, 60000), "2분 안엔 안 씀");
ok(shouldBeat(p1, { topic: "가을", len: 30, state: "writing" }, 125000), "2분 지나고 글자 늘면 씀");
ok(!shouldBeat(p1, { topic: "가을", len: 1, state: "writing" }, 999999), "글자 그대로면 안 씀");
ok(shouldBeat(p1, { topic: "가을", len: 30, state: "submitted" }, 2000), "제출은 바로");
const now = 10 * 60000;
ok(liveState({ topic: "가을", state: "writing", at: now - 60000, len: 40 }, "가을", now).kind === "writing", "1분 전 = 쓰는 중");
ok(liveState({ topic: "가을", state: "writing", at: now - 5 * 60000, len: 40 }, "가을", now).label.startsWith("5분째 멈춤"), "5분 전 = 멈춤");
ok(liveState({ topic: "겨울", state: "writing", at: now, len: 40 }, "가을", now).kind === "none", "다른 주제 = 안 열음");
ok(liveState({ topic: "가을", state: "submitted", at: 0, len: 9 }, "가을", now).kind === "done", "제출함");
console.log(bad ? `\n${bad}개 실패` : "\n모두 통과");
process.exit(bad ? 1 : 0);
