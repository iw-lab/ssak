// 🌱 노력 점수(2026-11-20 업그레이드 1-8): 점수 순이 아니라 «쓰고, 고쳐 쓰고, 나아진 만큼».
//   예전엔 평균 점수×3 + 통과×20 — 같은 글도 점수가 흔들리는데(교사 불만 1위) 그 점수로 줄을 세웠다.
//   글 1편 10 · 고쳐쓰기 1번 10(+나아진 점수만큼, 1번에 최대 20) · 통과 1번 5. 0점(무의미·주제 이탈)은 세지 않는다.
//   시험: scripts/test-effort-ranking.mjs
export function effortPoints({ score, isRewrite, scoreDiff, passed }) {
  if (!(score > 0)) return 0;
  let p = isRewrite ? 10 + Math.max(0, Math.min(20, Number(scoreDiff) || 0)) : 10;
  if (passed) p += 5;
  return p;
}
