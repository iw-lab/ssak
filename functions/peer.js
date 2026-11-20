// 3-2 친구 글에 칭찬 1 + 질문 1 — 2026-11-20 업그레이드 3단계.
//   ① 담임이 고른 글만 친구에게 보인다(이름·학교·지역 가린 사본, 글쓴이 표시 없음)
//   ② 친구가 남긴 말은 담임이 승인해야 글쓴이에게 간다(누가 썼는지는 담임만 안다)
//   순수 함수만(시험 functions/test-peer.mjs).

// 초등 교실에서 자주 나오는 욕·비하(완전한 목록이 아니다 — 마지막 관문은 담임 승인)
const BAD = [
  "시발", "씨발", "ㅅㅂ", "ㅆㅂ", "병신", "ㅂㅅ", "븅신", "새끼", "ㅅㄲ", "지랄", "ㅈㄹ", "닥쳐", "꺼져", "죽을래",
  "멍청", "바보", "찐따", "ㄲㅈ", "엿먹", "개같", "개새", "미친", "ㅁㅊ", "또라이", "느금", "니애미", "애미", "애비",
  "한심", "노잼", "재미없", "구려", "최악", "쓰레기", "못썼", "못 썼",
];
// 한글·자모·영숫자만 남긴다(띄어쓰기·점·빗금·보이지 않는 글자 끼워 넣기 우회 막기)
const squash = (s) => String(s || "").normalize("NFC").toLowerCase().replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z0-9]/g, "");

// 한 칸(칭찬 또는 질문) 검사 → null(통과) | 까닭
function checkLine(text, kind) {
  const t = String(text || "").trim();
  if (t.length < 5) return `${kind}을 5자 이상 써 주세요.`;
  if (t.length > 120) return `${kind}은 120자까지예요.`;
  if (/https?:|www\.|\.com|\.kr/i.test(t)) return "주소는 쓸 수 없어요.";
  if (/\d[\d\s-]{6,}\d/.test(t)) return "전화번호 같은 숫자는 쓸 수 없어요.";
  const q = squash(t);
  if (BAD.some((w) => q.includes(squash(w)))) return "친구 마음이 다칠 수 있는 말이 있어요. 다른 말로 바꿔 볼까요?";
  if (/(.)\1{5,}/.test(q)) return "같은 글자만 반복하면 안 돼요.";
  return null;
}

function checkNote({ praise, question }) {
  return checkLine(praise, "칭찬") || checkLine(question, "질문") || (!/[?？]\s*$|(까|나요|가요|는지|을지|ㄹ지|니|냐)\s*$/.test(String(question || "").trim()) ? "질문은 물음표(?)로 끝내 주세요." : null);
}

// 하루에 보낼 수 있는 말 수
const DAILY_NOTES = 10;

// 친구에게 보일 글 — 원문은 서버만 읽고, 가린 사본만 돌려준다
function shareView(share, myNoteIds) {
  return { id: share.id, topic: String(share.topic || "").slice(0, 80), content: String(share.content || "").slice(0, 4000), sent: myNoteIds.has(share.id) };
}

// 문서 id — 빗금(/)으로 다른 경로를 가리키지 못하게
const isId = (x, max = 200) => typeof x === "string" && x.length > 0 && x.length <= max && !x.includes("/") && x !== "." && x !== "..";

module.exports = { BAD, checkLine, checkNote, DAILY_NOTES, shareView, isId };
