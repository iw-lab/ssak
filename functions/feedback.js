// 첨삭 엔진 — 프롬프트 만들기와 AI 답 다듬기(2026-11-20 업그레이드 1단계·2단계).
// 조사 83개(docs/UPGRADE-PLAN-2026-11.md)에서 가져온 원칙:
//   1-1 고친 문장을 바로 주지 않는다 — 문장별 첨삭은 «여기·왜·힌트», 예시는 학생이 고쳐 본 뒤에 연다(화면).
//       바로 보여 주는 건 맞춤법·띄어쓰기 같은 짧은 교정뿐.
//   1-2 이번에 고칠 것은 1~2개. 1-5 점수마다 학생 글의 실제 구절을 근거로(글에 없는 인용은 버린다).
//   1-4 고쳐쓰기 덤 없음 — 같은 기준으로 다시 채점. 2-A 장르별 기준, 2-D 이번 글 목표, 2-J 과제 중점.
// 이 파일은 순수 함수만 — 시험(functions/test-feedback.mjs)이 AI 없이 돌린다.

const PROMPT_VERSION = "2026-11-20a";

// 장르 — 화면(src/config/writingOptions.js)과 같은 키·이름이어야 한다(시험이 대조)
const GENRES = {
  diary: { name: "일기", focus: "겪은 일 하나를 골라 그때의 생각·느낌을 자세히 썼는가, 날짜·장소 같은 배경이 있는가" },
  review: { name: "독후감", focus: "책 내용 소개와 내 생각을 구분했는가, 인상 깊은 장면과 그 까닭이 있는가" },
  letter: { name: "편지", focus: "받는 사람·첫인사·하고 싶은 말·끝인사·쓴 사람의 짜임, 받는 사람에게 맞는 말투인가" },
  opinion: { name: "주장하는 글", focus: "주장이 분명한가, 까닭이 두 가지 이상이고 뒷받침하는 예가 있는가, 서론·본론·결론" },
  explain: { name: "설명하는 글", focus: "설명하는 대상이 분명한가, 차례·비교·예시 같은 방법으로 쉽게 풀었는가, 사실과 의견을 나눴는가" },
  story: { name: "이야기(상상하는 글)", focus: "인물·사건·배경이 있는가, 처음-가운데-끝 흐름과 생생한 장면 묘사가 있는가" },
  free: { name: "자유 글", focus: "주제에 맞게 하고 싶은 말이 분명한가" },
};

// 이번 글 목표 — 화면과 같은 키(시험이 대조)
const GOALS = {
  detail: "겪은 일을 자세히(보고·듣고·느낀 것)",
  reason: "생각에 까닭 붙이기",
  ending: "끝맺음 문장 쓰기",
  paragraph: "문단 나누기",
  words: "꾸며 주는 말·흉내 내는 말 넣기",
  spelling: "맞춤법·띄어쓰기 지키기",
};

// 항목: 키, 화면 이름, 만점, 옛 필드 이름(화면·저장 호환)
const CRITERIA = [
  ["content", "내용", 25, "contentScore"],
  ["topic", "주제", 10, "topicRelevanceScore"],
  ["structure", "구성", 20, "structureScore"],
  ["vocabulary", "어휘", 20, "vocabularyScore"],
  ["grammar", "문법", 15, "grammarScore"],
  ["creativity", "창의성", 10, "creativityScore"],
];
const CRITERION_KEYS = CRITERIA.map((c) => c[0]);

const clampInt = (v, max) => Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
const squash = (s) => String(s || "").replace(/[\s.,!?'"“”‘’()[\]{}:;·~\-_…]/g, "");
// 인용이 글에 «실제로» 있는가 — 공백·문장부호는 무시하고 본다(AI 가 띄어쓰기만 바꿔 옮기는 일이 잦다)
function quoteInText(quote, text) {
  const q = squash(quote);
  return q.length >= 4 && squash(text).includes(q); // 두세 글자는 아무 글에나 있다(8way grok·meta)
}
// 맞춤법 교정만 통과: 띄어쓰기만 다르거나(공백 빼면 같음) 글자 2개 이내로 다를 때
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
const isSpellingFix = (o, s) => o.replace(/\s/g, "") === s.replace(/\s/g, "") || editDistance(o.replace(/\s/g, ""), s.replace(/\s/g, "")) <= 2;
const cut = (s, n) => String(s || "").trim().slice(0, n);

function buildAnalysisPrompt({ grade, topic, text, wordCount, idealWordCount, genre, goal, focus, ssakContext, previousText }) {
  const g = GENRES[genre] || null;
  const goalText = GOALS[goal] || null;
  const focusKeys = Array.isArray(focus) ? focus.filter((k) => CRITERION_KEYS.includes(k)) : [];
  const focusNames = focusKeys.map((k) => CRITERIA.find((c) => c[0] === k)[1]);
  const lines = [
    `${grade} 학생 글 첨삭. 6+1 특성 기반, 격려하되 정직하게. 같은 글이면 언제나 같은 점수가 나오도록 아래 기준표대로만 채점한다.`,
    ssakContext || "",
    `주제: "${topic}" | ${wordCount}자(권장 ${idealWordCount}자)` + (g ? ` | 장르: ${g.name}` : ""),
    g ? `장르 기준: ${g.focus}` : "",
    goalText ? `학생이 고른 이번 글 목표: «${goalText}» — goalFeedback 에 이 목표를 얼마나 이뤘는지 먼저 말한다.` : "",
    focusNames.length ? `선생님이 정한 이번 과제 중점: ${focusNames.join("·")} — nextSteps 는 이 항목에서 먼저 고른다.` : "",
    previousText ? `[고쳐쓰기] 앞서 낸 글(비교용): """${String(previousText).slice(0, 600)}"""\n같은 기준으로 새 글만 채점한다(고쳐 썼다고 점수를 더 주지 않는다). growth 에 앞 글보다 실제로 나아진 곳을 구절로 짚는다. 나아진 곳이 없으면 솔직하게 말한다.` : "",
    `글:\n"""${text}"""`,
    `[0점: 같은 글자 반복, 무의미한 나열, 주제와 완전히 무관]`,
    `기준표(점수 = 이 안에서만):
- content 내용 0-25: 주제 이해 15-18, 자기 경험·생각이 구체적 19-22, 풍부하고 생생 23-25
- topic 주제 0-10: 3 이하면 주제를 벗어난 글
- structure 구성 0-20: 처음-가운데-끝이 있음 13-15, 문단·흐름이 자연스러움 16-18, 짜임이 뛰어남 19-20
- vocabulary 어휘 0-20: 알맞은 낱말 12-14, 다양한 낱말 15-17, 꾸며 주는 말·생생한 표현 18-20
- grammar 문법 0-15: 맞춤법·띄어쓰기 오류가 많음 6-9, 조금 10-12, 거의 없음 13-15
- creativity 창의성 0-10: 평범 4-5, 자기만의 표현 6-7, 독창적 8-10
학년 수준에 맞춰 본다. 평균적인 글은 70점대.`,
    `규칙:
1) evidence 의 quote, strengths 의 quote, nextSteps 의 quote 는 위 «글»에서 글자 그대로 옮긴 짧은 구절(5~30자). 글에 없는 말을 만들지 않는다.
2) nextSteps 는 1~2개만. hint 는 학생이 스스로 고치게 하는 질문(답을 알려 주지 않는다). example 은 그 구절을 고친 예시 한 문장(학생이 먼저 고쳐 본 뒤에만 보여 준다).
3) spelling 은 맞춤법·띄어쓰기만, 원문 어절과 바른 어절(짧게). 문장을 바꿔 쓰지 않는다. 최대 5개.
4) 이름·학교·지역 대신 «ㅇㅇㅇ»가 보이면 가린 자리이니 지적하지 않는다.
JSON 만: {"scores":{"content":0,"topic":0,"structure":0,"vocabulary":0,"grammar":0,"creativity":0},"evidence":{"content":{"quote":"","why":""},"topic":{"quote":"","why":""},"structure":{"quote":"","why":""},"vocabulary":{"quote":"","why":""},"grammar":{"quote":"","why":""},"creativity":{"quote":"","why":""}},"strengths":[{"text":"","quote":""},{"text":"","quote":""}],"nextSteps":[{"focus":"content","quote":"","why":"","hint":"","example":""}],"spelling":[{"original":"","suggestion":""}],"goalFeedback":"","overall":"","growth":""}`,
  ];
  return lines.filter(Boolean).join("\n\n");
}

// AI 답 → 화면·저장용. 옛 필드(contentScore·strengths 문자열·improvements·detailedFeedback)도 함께 채워 옛 화면이 안 깨지게.
function normalizeAnalysis(raw, text, { goal, focus } = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const s = r.scores && typeof r.scores === "object" ? r.scores : {};
  const out = { promptVersion: PROMPT_VERSION };
  const criteria = {};
  let total = 0;
  for (const [key, name, max, legacy] of CRITERIA) {
    const v = clampInt(s[key] ?? r[legacy], max);
    out[legacy] = v;
    total += v;
    const ev = r.evidence?.[key] || {};
    const quote = quoteInText(ev.quote, text) ? cut(ev.quote, 60) : null; // 1-5 글에 없는 인용은 버린다
    criteria[key] = { name, score: v, max, quote, why: cut(ev.why, 160) };
  }
  out.criteria = criteria;
  out.score = total;

  const strengths = (Array.isArray(r.strengths) ? r.strengths : [])
    .map((x) => (typeof x === "string" ? { text: x, quote: null } : x || {}))
    .filter((x) => cut(x.text, 200))
    .slice(0, 2)
    .map((x) => ({ text: cut(x.text, 200), quote: quoteInText(x.quote, text) ? cut(x.quote, 60) : null }));
  out.strengthItems = strengths;
  out.strengths = strengths.map((x) => x.text);

  // 1-2 고칠 것 1~2개 — 과제 중점(2-J)에 든 항목을 앞으로
  const focusSet = new Set(Array.isArray(focus) ? focus : []);
  let steps = (Array.isArray(r.nextSteps) ? r.nextSteps : [])
    .filter((x) => x && cut(x.why, 200))
    .map((x) => ({
      focus: CRITERION_KEYS.includes(x.focus) ? x.focus : "content",
      quote: quoteInText(x.quote, text) ? cut(x.quote, 80) : null,
      why: cut(x.why, 200),
      hint: cut(x.hint, 200),
      example: cut(x.example, 200) || null, // 화면이 «먼저 고쳐 보기» 뒤에만 연다
    }));
  steps.sort((a, b) => (focusSet.has(b.focus) ? 1 : 0) - (focusSet.has(a.focus) ? 1 : 0));
  steps = steps.slice(0, 2);
  out.nextSteps = steps;
  out.improvements = steps.map((x) => x.why);

  // 맞춤법·띄어쓰기만 바로 보여 준다 — 원문이 글에 있고, 고친 것이 «짧은 교정»일 때만(문장 바꿔 쓰기는 버린다)
  const spelling = [];
  for (const x of Array.isArray(r.spelling) ? r.spelling : []) {
    const o = cut(x?.original, 30), sug = cut(x?.suggestion, 30);
    if (!o || !sug || o === sug) continue; // 띄어쓰기만 다른 교정(«할수있다»→«할 수 있다»)은 남긴다
    if (!text.includes(o)) continue;
    if (sug.length > 20 || !isSpellingFix(o, sug)) continue; // 같은 길이로 뜻을 바꾼 «교정»도 버린다(8way codex)
    if (spelling.some((y) => y.original === o)) continue;
    spelling.push({ original: o, suggestion: sug });
    if (spelling.length >= 5) break;
  }
  out.spelling = spelling;
  out.detailedFeedback = spelling.map((x) => ({ type: "spelling", original: x.original, suggestion: x.suggestion, reason: "맞춤법·띄어쓰기" }));

  out.goal = GOALS[goal] ? goal : null;
  out.goalFeedback = out.goal ? cut(r.goalFeedback, 200) : "";
  out.overallFeedback = cut(r.overall, 300);
  out.feedback = out.overallFeedback;
  out.growthNote = cut(r.growth, 300);
  out.writingTips = [];
  return out;
}

module.exports = { isSpellingFix, PROMPT_VERSION, GENRES, GOALS, CRITERIA, CRITERION_KEYS, buildAnalysisPrompt, normalizeAnalysis, quoteInText };
