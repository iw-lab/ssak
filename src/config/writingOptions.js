// 글 장르·이번 글 목표·과제 중점 — 서버(functions/feedback.js)와 같은 키·이름이어야 한다(functions/test-feedback.mjs 가 대조).
export const GENRES = [
  { key: "diary", name: "일기" },
  { key: "review", name: "독후감" },
  { key: "letter", name: "편지" },
  { key: "opinion", name: "주장하는 글" },
  { key: "explain", name: "설명하는 글" },
  { key: "story", name: "이야기(상상하는 글)" },
  { key: "free", name: "자유 글" },
];

export const GOALS = [
  { key: "detail", name: "겪은 일을 자세히(보고·듣고·느낀 것)" },
  { key: "reason", name: "생각에 까닭 붙이기" },
  { key: "ending", name: "끝맺음 문장 쓰기" },
  { key: "paragraph", name: "문단 나누기" },
  { key: "words", name: "꾸며 주는 말·흉내 내는 말 넣기" },
  { key: "spelling", name: "맞춤법·띄어쓰기 지키기" },
];

export const CRITERIA = [
  { key: "content", name: "내용", max: 25 },
  { key: "topic", name: "주제", max: 10 },
  { key: "structure", name: "구성", max: 20 },
  { key: "vocabulary", name: "어휘", max: 20 },
  { key: "grammar", name: "문법", max: 15 },
  { key: "creativity", name: "창의성", max: 10 },
];

// 주제 낱말로 장르를 짐작(학생이 안 골랐을 때 기본값) — 서버 getGenreFromTopic 과 같은 생각
export function guessGenre(topic = "") {
  const t = String(topic);
  if (/독후감|읽고|책/.test(t)) return "review";
  if (/일기|오늘|하루/.test(t)) return "diary";
  if (/편지|에게/.test(t)) return "letter";
  if (/주장|해야|찬성|반대|생각하는가|좋을까/.test(t)) return "opinion";
  if (/소개|설명|방법|까닭/.test(t)) return "explain";
  if (/상상|만약|이야기/.test(t)) return "story";
  return "free";
}
