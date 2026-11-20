// 교사용 모아 보기 — 2026-11-20 업그레이드 2단계.
//   2-G 우리 반 공통 약점(과제 하나) · 2-H 학생 성장 리포트(항목별 처음→요즘) · 2-K 교사 점수와 AI 점수 일치도.
//   순수 함수만(시험 functions/test-insights.mjs). 학생 글 원문은 돌려주지 않는다 — 숫자와 맞춤법 낱말(가린 글에서 나온 것)만.

const CRIT = [
  ["content", "내용", 25, "contentScore"],
  ["topic", "주제", 10, "topicRelevanceScore"],
  ["structure", "구성", 20, "structureScore"],
  ["vocabulary", "어휘", 20, "vocabularyScore"],
  ["grammar", "문법", 15, "grammarScore"],
  ["creativity", "창의성", 10, "creativityScore"],
];

// 항목별 5분 수업 제안 — AI 없이(비용 0, 같은 약점엔 같은 제안)
const MINI_LESSON = {
  content: "겪은 일 하나를 골라 «보고·듣고·느낀 것» 세 칸 표를 채운 뒤 한 문장씩 이어 쓰기",
  topic: "주제 문장을 칠판에 쓰고, 각자 첫 문장이 주제와 이어지는지 짝과 확인하기",
  structure: "처음-가운데-끝 세 칸에 한 줄씩 먼저 쓰고 글 쓰기(개요 먼저)",
  vocabulary: "«좋았다·재미있었다» 대신 쓸 말 모으기 — 반 전체가 낱말 10개 찾기",
  grammar: "이번 과제에서 많이 틀린 맞춤법 3개를 바르게 고쳐 쓰는 짧은 받아쓰기",
  creativity: "같은 장면을 흉내 내는 말·비유로 다시 써 보기(«비가 왔다» → «비가 주룩주룩 내렸다»)",
};

const pct = (v, max) => (max ? Math.round((Number(v) || 0) / max * 100) : 0);

function criteriaPct(analysis) {
  const a = analysis || {};
  const out = {};
  for (const [key, , max, legacy] of CRIT) {
    if (a[legacy] === undefined) continue;
    out[key] = pct(a[legacy], max);
  }
  return out;
}

// 2-G 과제 하나의 반 전체: 항목 평균(%) · 가장 많이 나온 «이번에 고칠 것» · 맞춤법 TOP · 5분 수업 제안
function classInsights(writings) {
  const ws = writings.filter((w) => w && !w.isDraft && w.analysis);
  const n = ws.length;
  const sums = {};
  const counts = {}; // 항목마다 점수가 있는 글 수(없는 글까지 분모에 넣으면 평균이 깎인다)
  const focusCount = {};
  const spell = {};
  for (const w of ws) {
    const p = criteriaPct(w.analysis);
    for (const [k, v] of Object.entries(p)) { sums[k] = (sums[k] || 0) + v; counts[k] = (counts[k] || 0) + 1; }
    for (const st of Array.isArray(w.analysis.nextSteps) ? w.analysis.nextSteps : []) if (st && typeof st.focus === "string") focusCount[st.focus] = (focusCount[st.focus] || 0) + 1;
    for (const sp of Array.isArray(w.analysis.spelling) ? w.analysis.spelling : []) {
      if (!sp || !sp.original || !sp.suggestion) continue;
      const key = `${sp.original}→${sp.suggestion}`;
      spell[key] = (spell[key] || 0) + 1;
    }
  }
  const averages = Object.fromEntries(CRIT.filter(([k]) => sums[k] !== undefined).map(([k, name]) => [k, { name, pct: Math.round(sums[k] / counts[k]) }]));
  // 약점 = 고칠 것으로 자주 나온 항목 + 평균이 낮은 항목(둘 다 보고 3개)
  const score = (k) => (focusCount[k] || 0) * 10 + (100 - (averages[k]?.pct ?? 100));
  const weak = CRIT.map(([k, name]) => ({ key: k, name, count: focusCount[k] || 0, pct: averages[k]?.pct ?? null }))
    .filter((x) => x.pct !== null || x.count)
    .sort((a, b) => score(b.key) - score(a.key))
    .slice(0, 3)
    .map((x) => ({ ...x, lesson: MINI_LESSON[x.key] }));
  const spelling = Object.entries(spell).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, c]) => ({ fix: k, count: c }));
  return { count: n, averages, weak, spelling };
}

// 2-H 학생 한 명: 글마다 항목(%)·점수, 처음 3편과 요즘 3편의 항목 평균, 고쳐쓰기 수, 선생님 한마디 수
function studentReport(writings) {
  const ws = writings
    .filter((w) => w && !w.isDraft && typeof w.score === "number")
    .sort((a, b) => String(a.submittedAt || a.createdAt || "").localeCompare(String(b.submittedAt || b.createdAt || "")));
  const seen = new Set();
  const items = ws.map((w) => {
    const rewrite = seen.has(w.topic);
    seen.add(w.topic);
    return {
      date: String(w.submittedAt || w.createdAt || "").slice(0, 10),
      topic: String(w.topic || "").slice(0, 60),
      score: w.score,
      teacherScore: Number.isInteger(w.teacherScore) ? w.teacherScore : null,
      rewrite,
      criteria: criteriaPct(w.analysis),
    };
  });
  const avgOf = (arr) => {
    const out = {};
    for (const [k, name] of CRIT) {
      const vs = arr.map((x) => x.criteria[k]).filter((v) => v !== undefined);
      if (vs.length) out[k] = { name, pct: Math.round(vs.reduce((a, b) => a + b, 0) / vs.length) };
    }
    return out;
  };
  const first = avgOf(items.slice(0, 3));
  const recent = avgOf(items.slice(-3));
  const change = Object.fromEntries(Object.keys(recent).filter((k) => first[k]).map((k) => [k, recent[k].pct - first[k].pct]));
  const sortedRecent = Object.entries(recent).sort((a, b) => b[1].pct - a[1].pct);
  return {
    count: items.length,
    rewrites: items.filter((x) => x.rewrite).length,
    teacherComments: ws.filter((w) => w.teacherComment).length,
    first,
    recent,
    change,
    strongest: sortedRecent[0]?.[1]?.name || null,
    weakest: sortedRecent[sortedRecent.length - 1]?.[1]?.name || null,
    items: items.slice(-40),
  };
}

// 2-K 교사가 고친 점수와 AI 점수의 차이 — 평균 차이(절댓값)·5점 안 비율
function teacherAgreement(writings) {
  const pairs = writings.filter((w) => w && Number.isInteger(w.teacherScore) && typeof w.score === "number").map((w) => w.teacherScore - w.score);
  if (!pairs.length) return { n: 0 };
  const abs = pairs.map(Math.abs);
  return {
    n: pairs.length,
    meanAbsDiff: Math.round(abs.reduce((a, b) => a + b, 0) / abs.length * 10) / 10,
    within5: Math.round(abs.filter((d) => d <= 5).length / abs.length * 100),
    aiHigher: Math.round(pairs.filter((d) => d < 0).length / pairs.length * 100),
  };
}

// 2-K 같은 글 여러 번 채점했을 때의 흔들림
function spread(scores) {
  const s = scores.filter((x) => typeof x === "number");
  if (!s.length) return null;
  return { runs: s.length, min: Math.min(...s), max: Math.max(...s), range: Math.max(...s) - Math.min(...s) };
}

module.exports = { CRIT, MINI_LESSON, criteriaPct, classInsights, studentReport, teacherAgreement, spread };
