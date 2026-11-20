// 3-3 내 글 문장으로 5분 연습 — 내가 쓴 글에서 나온 맞춤법·띄어쓰기를 다시 고쳐 본다.
//   AI 호출 0(이미 받은 첨삭만 쓴다) · DB 쓰기 0(맞힌 기록은 이 기기에만). 시험: scripts/test-practice.mjs

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 2) return 3;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const squash = (s) => String(s || "").replace(/\s/g, "");
// 옛 첨삭엔 «문장 통째 바꾸기»가 섞여 있다 — 맞춤법·띄어쓰기만 문제로 낸다
export const isDrillable = (o, s) => {
  o = String(o || "").trim();
  s = String(s || "").trim();
  if (!o || !s || o === s || o.length > 20 || s.length > 20) return false;
  return squash(o) === squash(s) || editDistance(squash(o), squash(s)) <= 2;
};

// 글에서 그 낱말이 든 문장(앞뒤 60자 안)
function sentenceOf(content, word) {
  const text = String(content || "");
  const i = text.indexOf(word);
  if (i < 0) return null;
  let a = i, b = i + word.length;
  while (a > 0 && i - a < 60 && !/[.!?\n]/.test(text[a - 1])) a--;
  while (b < text.length && b - i < 60 && !/[.!?\n]/.test(text[b])) b++;
  if (b < text.length && /[.!?]/.test(text[b])) b++;
  return { before: text.slice(a, i).trimStart(), word, after: text.slice(i + word.length, b).trimEnd() };
}

// 내 글들 → 연습 문제(같은 실수는 하나로 묶고, 여러 번 틀린 것·최근 것 먼저). solved = 이 기기에서 맞힌 «틀린→바른» 목록
export function buildPractice(writings, { solved = [], max = 5 } = {}) {
  const done = new Set(solved);
  const byKey = new Map();
  const list = [...(writings || [])]
    .filter((w) => w && !w.isDraft && w.analysis)
    .sort((x, y) => String(y.submittedAt || y.createdAt || "").localeCompare(String(x.submittedAt || x.createdAt || "")));
  list.forEach((w, rank) => {
    const a = w.analysis;
    const items = Array.isArray(a.spelling) && a.spelling.length
      ? a.spelling
      : (Array.isArray(a.detailedFeedback) ? a.detailedFeedback : []).filter((d) => d && (!d.type || /spell|맞춤|띄어/.test(d.type)));
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const o = String(it.original || "").trim();
      const s = String(it.suggestion || "").trim();
      if (!isDrillable(o, s)) continue;
      const key = `${o}→${s}`;
      if (done.has(key)) continue;
      const ctx = sentenceOf(w.content, o);
      if (!ctx) continue;
      const cur = byKey.get(key);
      if (cur) cur.times++;
      else byKey.set(key, { key, wrong: o, right: s, ...ctx, topic: w.topic || "", times: 1, rank, spacing: squash(o) === squash(s) });
    }
  });
  return [...byKey.values()].sort((x, y) => y.times - x.times || x.rank - y.rank).slice(0, max);
}

// 답 맞히기 — 앞뒤 공백만 봐 준다(띄어쓰기 문제는 가운데 띄어쓰기가 곧 답)
export const checkAnswer = (item, answer) => String(answer || "").trim().replace(/\s+/g, " ") === item.right.replace(/\s+/g, " ");

const LS = "ssak_practice_solved";
export function loadSolved(uid) {
  try { return JSON.parse(localStorage.getItem(`${LS}_${uid}`) || "[]").slice(-300); } catch { return []; }
}
export function saveSolved(uid, keys) {
  try { localStorage.setItem(`${LS}_${uid}`, JSON.stringify([...new Set(keys)].slice(-300))); } catch { /* 저장 못 해도 연습은 된다 */ }
}
