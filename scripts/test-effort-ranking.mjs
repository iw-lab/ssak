// 노력 점수(1-8) 시험 — 점수가 낮아도 꾸준히 고쳐 쓴 학생이 한 번 잘 쓴 학생보다 위.
import { effortPoints } from "../src/config/effort.js";
let bad = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) bad++; };
const sum = (xs) => xs.reduce((a, x) => a + effortPoints(x), 0);
const steady = sum([{ score: 55 }, { score: 61, isRewrite: true, scoreDiff: 6 }, { score: 68, isRewrite: true, scoreDiff: 7 }, { score: 72, isRewrite: true, scoreDiff: 4, passed: true }]);
const oneShot = sum([{ score: 95, passed: true }]);
ok(steady > oneShot, `꾸준히 고쳐 쓴 학생(${steady}) > 한 번 95점(${oneShot})`);
ok(effortPoints({ score: 0 }) === 0, "0점(무의미·주제 이탈)은 0");
ok(effortPoints({ score: 70, isRewrite: true, scoreDiff: 80 }) === 30, "나아진 점수는 한 번에 최대 20");
ok(effortPoints({ score: 70, isRewrite: true, scoreDiff: -5 }) === 10, "점수가 내려가도 고쳐 쓴 노력 10");
console.log(bad ? `\n${bad}개 실패` : "\n모두 통과");
process.exit(bad ? 1 : 0);
