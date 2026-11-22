// node scripts/fetch-kiwi-model.mjs — 가림 2층(functions/pii-deep.mjs)이 쓰는 형태소 분석기 모델을 functions/kiwi-model 에 받는다.
//   모델(약 110MB)은 git 에 넣지 않는다. 받은 묶음의 sha256 이 아래와 다르면 풀지 않는다(다른 파일로 바뀐 것).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const URL_ = "https://github.com/bab2min/Kiwi/releases/download/v0.25.0/kiwi_model_v0.25.0_base.tgz";
const SHA = "2b32096ce9f48da6aaaf486db01ff46834e7e3dcb92f507879d35e3d2180a2dc";
const dest = new URL("../functions/kiwi-model/", import.meta.url).pathname;
if (existsSync(join(dest, "sj.morph")) && existsSync(join(dest, "cong.mdl")) && !process.argv.includes("--force")) { console.log("모델 있음:", dest); process.exit(0); }
const tmp = mkdtempSync(join(tmpdir(), "kiwi-model-"));
const tgz = join(tmp, "m.tgz");
const res = await fetch(URL_);
if (!res.ok) throw new Error(`모델 내려받기 실패 ${res.status}`);
writeFileSync(tgz, Buffer.from(await res.arrayBuffer()));
const got = createHash("sha256").update(readFileSync(tgz)).digest("hex");
if (got !== SHA) throw new Error(`모델 묶음 sha256 다름: ${got}`);
execFileSync("tar", ["xzf", tgz, "-C", tmp]);
const src = join(tmp, "models", "cong", "base");
mkdirSync(dest, { recursive: true });
for (const f of readdirSync(src)) copyFileSync(join(src, f), join(dest, f));
rmSync(tmp, { recursive: true, force: true });
console.log("모델 받음:", dest, readdirSync(dest).length, "개");
