// node functions/test-pii-deep.mjs — 가림 2층(규칙 + 형태소 분석) 시험.
//   ① 규칙 시험(test-pii.mjs)의 LEAK·KEEP 문장을 2층으로도 돌린다(새면 실패, KEEP 은 지나친 가림 상한).
//   ② 블라인드 묶음(test-data/pii-heldout*.json)마다 «막은 비율» 하한 — 묶음별 하한은 FLOOR 에 적는다.
//   묶음을 보고 고친 뒤의 점수는 정직한 수치가 아니다 — 새 묶음은 고치기 전에 먼저 재서 README 에 적는다.
import { maskDeep } from "./pii-deep.mjs";
import { MASK } from "./pii.mjs";
import { readFileSync, readdirSync } from "node:fs";
const src = readFileSync(new URL("./test-pii.mjs", import.meta.url), "utf8");
const grab = (name, next) => new Function(`return [${src.slice(src.indexOf(`const ${name} = [`) + `const ${name} = [`.length, src.indexOf(next))}`.replace(/\];\s*$/, "") + "]")();
const LEAK = grab("LEAK", "const KEEP = ["), KEEP = grab("KEEP", "\nlet fail = 0;");
const V = process.argv.includes("-v");
// 2층에서만 막히는 꼴 — 교차검증(codex·gemini 2026-11-22)이 실제로 새는 걸 보인 입력들
LEAK.push(
  ["아이디: 바나나오렌지포도올림", ["바나나오", "렌지포도"]], // 겹친 구간은 합쳐서 가린다
  ["3 < x일 때 탱구가 5 > 2 라고 했다", ["탱구"]], // 부등호는 제목 괄호가 아니다
  ["우리 반 <김철수, 강남구 역삼동> 이야기", ["김철수", "역삼동"]],
  ["전화번호는 010‑1234‑5678 이다", ["1234", "5678"]], // U+2011 하이픈
  ["전화는 공일공-1234-5678 이야", ["1234", "5678"]],
  ["번호는 0101234-567팔", ["567팔", "567"]],
  ["오늘 《휸랏》을 만났다.", ["휸랏"]],
  ["별빛리 7 에 산다", ["별빛리", "7"]],
  ["하늘은 교실에서 웃었다. 나는 하늘을 만났다.", ["하늘"]], // 사람 문맥에서 잡힌 이름은 글 전체에서
  ["친구 집 비밀번호를 들었다. 1029라고 했다.", ["1029"]],
  ["새 주소가 늘푸른2로 13길 5라고 알려줬다.", ["늘푸른2로", "13길"]],
  ["사는 곳은 별하늘2차 아파트라고 했다.", ["별하늘2차"]],
  ["짝꿍 생일-8월19일.", ["8월19일"]],
  ["친구 태양이는 야채를 다 잘 먹는다.", ["태양"]],
  ["콩콩이99랑 마크 같이했다", ["콩콩이99"]],
  ["라일락2차 놀이터에서 숨바꼭질했다", ["라일락2차"]],
  ["010~4432~8810 요걸로 카톡하자", ["4432", "8810"]],
  ["오늘 이.도.윤.이랑 짝이됐다.", ["이.도.윤"]],
  ["꼬부기왕 이라고 애들이 부른다", ["꼬부기왕"]],
  ["『지안과의 약속』 이라는 제목으로 일기썼다", ["지안"]],
);
let fail = 0;
for (const [s, bad] of LEAK) {
  const { text } = await maskDeep(s);
  const leaked = bad.filter((b) => text.includes(b));
  if (leaked.length || !text.includes(MASK)) { fail++; console.log(`❌ LEAK «${s}» → «${text}» 새는 것: ${leaked.join(",")}`); }
}
let over = 0;
for (const s of KEEP) { const r = await maskDeep(s); if (r.text !== s) { over++; if (V) console.log(`⚠️ OVER «${s}» → «${r.text}» ${r.log.join(",")}`); } }
const KEEP_MAX = Number(process.env.KEEP_MAX ?? 3);
console.log(`LEAK ${LEAK.length - fail}/${LEAK.length} 막음 · KEEP ${KEEP.length - over}/${KEEP.length} 그대로(상한 ${KEEP_MAX}개까지 가림 허용)`);
if (over > KEEP_MAX) fail++;
// 블라인드 묶음별 하한(조각 기준 막은 비율 %) / 깨끗한 글 어절 가림 상한(%)
const FLOOR = JSON.parse(readFileSync(new URL("./test-pii-deep.floor.json", import.meta.url), "utf8"));
for (const f of readdirSync(new URL("./test-data/", import.meta.url)).filter((x) => /^pii-heldout\d+\.json$/.test(x)).sort()) {
  const fl = FLOOR[f]; if (!fl) continue;
  let tot = 0, leak = 0, words = 0, masks = 0;
  for (const { text, pii } of JSON.parse(readFileSync(new URL(`./test-data/${f}`, import.meta.url), "utf8"))) {
    const r = await maskDeep(text);
    for (const p of pii) { tot++; if (r.text.includes(p)) { leak++; if (V) console.log(`   ${f} LEAK [${p}] ${r.text.replace(/\n/g, "⏎").slice(0, 160)}`); } }
    if (!pii.length) { words += text.split(/\s+/).length; masks += (r.text.match(/ㅇㅇㅇ/g) || []).length; }
  }
  const pct = 100 * (tot - leak) / tot, opct = words ? 100 * masks / words : 0;
  const bad = pct < fl.block || opct > fl.over;
  console.log(`${bad ? "❌" : "✅"} ${f}: 막음 ${tot - leak}/${tot} (${pct.toFixed(1)}% ≥ ${fl.block}) · 깨끗한 글 가림 ${masks}/${words}어절 (${opct.toFixed(1)}% ≤ ${fl.over})`);
  if (bad) fail++;
}
// 폭주 — 12,000자(서버 상한)짜리 고약한 글이 같은 길이 보통 글의 4배 안에 끝난다(정규식이 같은 공백을 나눠 먹으면 몇 분이 걸린다)
const N = 12000, fill = (u) => u.repeat(Math.ceil(N / u.length)).slice(0, N);
const NASTY = { "명단+공백": "우리 모둠 명단" + " ".repeat(N - 9) + "!", 공백: fill(" "), 쉼표이름: fill("가나, "), 숫자: fill("1"), "숫자-": fill("010-"), 한글숫자: fill("공일 "), 가림표시: fill("ㅇㅇㅇ "), 선생님: fill("선생님 "), 한글자: fill("가"), 따옴표: fill("'가'"), 괄호: fill("《가"), 물결: fill("- 가\n"), 주소: fill("가나리 "), 아이디: fill("아이디: "), 해시: fill("#가"), 줄바꿈: fill("\n"), 섞음: fill("명단 가나, 다라 · 마바 - 010 공일공 ㅇㅇㅇ 리 7 올림 ") };
const timeOf = async (t) => { const t0 = Date.now(); await maskDeep(t); return Date.now() - t0; };
const normal = Math.max(await timeOf(fill("오늘은 친구랑 운동장에서 놀았다. ")), await timeOf(fill("나는 집에 와서 숙제를 하고 밥을 먹었다. ")), 300); // 같은 길이 보통 글 — 머신이 바쁘면 같이 느려진다
let worst = ["", 0];
for (const [name, t] of Object.entries(NASTY)) {
  const ms = await timeOf(t); if (ms > worst[1]) worst = [name, ms];
  if (ms > normal * 4) { fail++; console.log(`❌ LEAK 폭주 «${name}» ${ms}ms > 보통 글 ${normal}ms 의 4배`); }
}
console.log(`폭주 입력 ${Object.keys(NASTY).length}종 — 가장 느린 «${worst[0]}» ${worst[1]}ms · 같은 길이 보통 글 ${normal}ms`);
process.exit(fail ? 1 : 0); // 관문: pii-deep-floor
