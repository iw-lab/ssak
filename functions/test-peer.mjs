// 3-2 친구 칭찬·질문 검사 시험 — AI·에뮬레이터 없이.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("./peer.js");
let bad = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) bad++; };

ok(P.checkNote({ praise: "썰매 타는 장면이 눈에 보이는 것 같았어", question: "그때 동생은 어떤 표정이었어?" }) === null, "좋은 칭찬·질문 통과");
ok(/5자/.test(P.checkNote({ praise: "좋아", question: "왜 그랬어?" })), "너무 짧은 칭찬");
ok(/마음/.test(P.checkNote({ praise: "너 진짜 바 보 같다 ㅋㅋ", question: "왜 그렇게 썼어?" })), "띄어 쓴 욕도 잡음");
ok(/마음/.test(P.checkNote({ praise: "글이 재미있었어요 좋아요", question: "근데 ㅅ.ㅂ 왜 그래?" })), "점 섞은 욕도 잡음");
ok(/전화/.test(P.checkNote({ praise: "내 번호 010-1234-5678 이야", question: "연락할래?" })), "전화번호 막음");
ok(/주소/.test(P.checkNote({ praise: "여기 봐 www.game.com 재밌어", question: "같이 할래?" })), "주소 막음");
ok(/물음표/.test(P.checkNote({ praise: "장면 묘사가 정말 좋았어", question: "다음 이야기도 써 줘" })), "질문이 아니면 막음");
ok(/반복/.test(P.checkNote({ praise: "ㅋㅋㅋㅋㅋㅋㅋㅋㅋ", question: "뭐야 이건 뭐지?" })), "같은 글자 반복 막음");
const v = P.shareView({ id: "w1", topic: "겨울", content: "가린 글", ownerId: "secret-uid", ownerName: "김철수" }, new Set(["w1"]));
ok(!("ownerId" in v) && !JSON.stringify(v).includes("김철수") && v.sent === true, "친구에게 보이는 글엔 글쓴이 없음");
// 교차검증 3단계: 보이지 않는 글자·빗금 끼워 넣기 · «요»로 끝난 평서문 · 빗금 id
ok(/마음/.test(P.checkNote({ praise: "글이 좋아요 시\u200b발 진짜", question: "어디서 탔어?" })), "보이지 않는 글자 끼운 욕도 잡음");
ok(/마음/.test(P.checkNote({ praise: "너는 바/보 같아 정말", question: "어디서 탔어?" })), "빗금 끼운 욕도 잡음");
ok(/물음표/.test(P.checkNote({ praise: "장면 묘사가 정말 좋았어", question: "다음에도 써 주세요" })), "«요»로 끝난 부탁은 질문 아님");
ok(P.checkNote({ praise: "장면 묘사가 정말 좋았어", question: "그때 누구랑 갔나요" }) === null, "«나요»는 질문");
ok(!P.isId("a/b") && !P.isId("") && P.isId("w1_abc"), "빗금 id 거절");
console.log(bad ? `\n${bad}개 실패` : "\n모두 통과");
process.exit(bad ? 1 : 0);
