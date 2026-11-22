// 배포본 실측 — 가림 2층이 실서버에서 도는지(2026-11-22).
//   node scripts/live-mask-check.mjs functions/test-data/pii-heldout13.json [--analyze 3]
// 하는 일: 임시 학생 계정 1개를 만들고 → 실서버 maskPreview 를 불러 세트 전체를 가려 보고(새는 조각·로컬 결과와 같은지·걸린 시간)
//          → (--analyze N) 실제 첨삭 N편을 불러 답에 개인정보 조각이 없는지 본 뒤 → 임시 계정·문서를 지운다.
// 인증: firebase CLI 로그인(배포에 쓰는 그 로그인)의 토큰. 열쇠를 파일·화면에 남기지 않는다.
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { maskDeep } from "../functions/pii-deep.mjs";
const require = createRequire(import.meta.url);

const P = "isw-writing", REGION = "asia-northeast3", DB = "seoul";
const args = process.argv.slice(2);
const setFile = args.find((a) => a.endsWith(".json"));
const nAnalyze = args.includes("--analyze") ? Number(args[args.indexOf("--analyze") + 1] || 3) : 0;
if (!setFile) { console.error("세트 파일이 필요하다"); process.exit(2); }
const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const API_KEY = env.VITE_FIREBASE_API_KEY;

const ftLib = ["/opt/homebrew/lib/node_modules/firebase-tools/lib", "/usr/local/lib/node_modules/firebase-tools/lib"].find((d) => existsSync(d + "/auth.js"));
const store = JSON.parse(readFileSync(homedir() + "/.config/configstore/firebase-tools.json", "utf8"));
const { access_token: ADMIN } = await require(ftLib + "/auth.js").getAccessToken(store.tokens.refresh_token, []);
const adminH = { authorization: `Bearer ${ADMIN}`, "content-type": "application/json", "x-goog-user-project": P };
const j = async (url, opt) => { const r = await fetch(url, opt); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { ok: r.ok, status: r.status, d }; };
const fsBase = `https://firestore.googleapis.com/v1/projects/${P}/databases/${DB}/documents`;

const email = `livemask-${randomBytes(4).toString("hex")}@isw-writing.web.app`, password = randomBytes(12).toString("base64url");
const created = await j(`https://identitytoolkit.googleapis.com/v1/projects/${P}/accounts`, { method: "POST", headers: adminH, body: JSON.stringify({ email, password }) });
if (!created.ok) { console.error("임시 계정 못 만듦", created.status, JSON.stringify(created.d).slice(0, 200)); process.exit(1); }
const uid = created.d.localId;
const CLASS = "LIVEMASK" + randomBytes(2).toString("hex").toUpperCase();
const made = [`users/${uid}`];
let bad = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) bad++; };
try {
  await j(`${fsBase}/users/${uid}`, { method: "PATCH", headers: adminH, body: JSON.stringify({ fields: { uid: { stringValue: uid }, role: { stringValue: "student" }, classCode: { stringValue: CLASS }, name: { stringValue: "실측" } } }) });
  const si = await j(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  if (!si.ok) throw new Error("로그인 실패 " + si.status);
  const userH = { authorization: `Bearer ${si.d.idToken}`, "content-type": "application/json" };
  const call = (fn, data) => j(`https://${REGION}-${P}.cloudfunctions.net/${fn}`, { method: "POST", headers: userH, body: JSON.stringify({ data }) });

  // 로그인 없이 부르면 거절
  const anon = await j(`https://${REGION}-${P}.cloudfunctions.net/maskPreview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: { texts: ["가"] } }) });
  ok(anon.status === 401, `로그인 없는 미리보기 거절 (${anon.status})`);

  const set = JSON.parse(readFileSync(setFile, "utf8"));
  let pieces = 0, leaked = 0, leakDocs = 0, differ = 0, calls = 0, limited = 0; const times = []; const leaks = [];
  for (let i = 0; i < set.length; i += 4) {
    const chunk = set.slice(i, i + 4);
    let r; const t0 = Date.now();
    for (;;) { r = await call("maskPreview", { texts: chunk.map((x) => x.text) }); if (r.status === 429) { limited++; await new Promise((s) => setTimeout(s, 15000)); continue; } break; }
    times.push(Date.now() - t0); calls++;
    if (!r.ok) { ok(false, `maskPreview ${r.status} ${JSON.stringify(r.d).slice(0, 160)}`); break; }
    const out = r.d.result.texts;
    for (let k = 0; k < chunk.length; k++) {
      const miss = chunk[k].pii.filter((p) => out[k].includes(p));
      pieces += chunk[k].pii.length; leaked += miss.length; if (miss.length) { leakDocs++; leaks.push(`[${miss.join(",")}] ${out[k].slice(0, 80)}`); }
      if (out[k] !== (await maskDeep(chunk[k].text)).text) differ++;
    }
    await new Promise((s) => setTimeout(s, 2600)); // 분당 20번 제한 아래로
  }
  times.sort((a, b) => a - b);
  console.log(`실서버 미리보기: 글 ${set.length}편 · 조각 ${pieces}개 중 막음 ${pieces - leaked} (${((100 * (pieces - leaked)) / pieces).toFixed(1)}%) · 샌 글 ${leakDocs}편 · 호출 ${calls}번(제한에 걸림 ${limited}번) · 첫 호출 ${times.at(-1) === times[0] ? times[0] : "최대 " + times.at(-1)}ms · 가운데 ${times[times.length >> 1]}ms`);
  for (const l of leaks.slice(0, 10)) console.log("  샘:", l);
  ok(differ === 0, `실서버 결과 = 이 저장소 코드 결과 (다른 글 ${differ}편)`);
  console.log(`실서버에서 샌 조각 ${leaked}개`);

  if (nAnalyze) {
    const long = set.filter((x) => x.pii.length && x.text.length >= 150).slice(0, nAnalyze);
    for (const x of long) {
      const t0 = Date.now();
      const r = await call("analyzeWriting", { text: x.text, topic: "나의 하루", gradeLevel: "elementary_3_4", wordCount: x.text.length, idealWordCount: 300, genre: "diary", goal: "reason" });
      const body = JSON.stringify(r.d);
      const seen = x.pii.filter((p) => body.includes(p));
      if (r.d?.result?.analysisId) made.push(`analyses/${r.d.result.analysisId}`);
      ok(r.ok && typeof r.d?.result?.score === "number" && seen.length === 0, `실제 첨삭 ${r.status} · ${r.d?.result?.score}점 · ${Date.now() - t0}ms · 답에 개인정보 조각 ${seen.length}개${seen.length ? " [" + seen.join(",") + "]" : ""}${r.ok ? "" : " " + body.slice(0, 160)}`);
    }
  }
} catch (e) { ok(false, "실측 중 오류: " + e.message); } finally {
  // 뒷정리 — 임시 계정·문서·쓴 횟수 기록
  const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  for (const d of [...made, `usage/usage_${uid}_${day}`, `usage/scope_class_${CLASS}_${day}`]) await j(`${fsBase}/${d}`, { method: "DELETE", headers: adminH });
  const del = await j(`https://identitytoolkit.googleapis.com/v1/projects/${P}/accounts:delete`, { method: "POST", headers: adminH, body: JSON.stringify({ localId: uid }) });
  console.log(`뒷정리: 임시 계정 삭제 ${del.ok ? "됨" : "실패 " + del.status} · 문서 ${made.length + 2}개 삭제 요청`);
}
console.log(bad ? `\n${bad}개 실패` : "\n모두 통과");
process.exit(bad ? 1 : 0);
