// 교사용 모아 보기 — 2026-11-20 업그레이드 2-G(우리 반 공통 약점) · 2-H(성장 리포트) · 2-I(학급 문집).
//   인쇄는 새 창에 글자만 담는다(모든 값은 escape — 학생 글에 <script> 가 있어도 글자로만 찍힌다).
import { useState } from "react";
import Emo from "./Emo";
import { getClassInsights, getStudentReport } from "../utils/aiAPI";
import { getWritingById } from "../services/writingService";
import { maskPII } from "../../functions/pii.mjs";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 창은 클릭 자리에서 먼저 연다(글을 불러오는 동안 기다리면 팝업 차단에 걸린다) → 다 모이면 printHtml(…, w)
function openPrintWindow() {
  const w = window.open("", "_blank");
  if (!w) alert("팝업이 막혀 있어요. 이 사이트의 팝업을 허용해 주세요.");
  else w.document.write("<p style=\"font-family:sans-serif;margin:32px\">만드는 중…</p>");
  return w;
}

function printHtml(title, body, pre) {
  const w = pre || window.open("", "_blank");
  if (!w) return alert("팝업이 막혀 있어요. 이 사이트의 팝업을 허용해 주세요.");
  w.document.open();
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;margin:32px;color:#1f2937;line-height:1.7}h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px;border-bottom:2px solid #16a34a;padding-bottom:4px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #d1d5db;padding:4px 6px;text-align:left}.piece{page-break-inside:avoid;margin-bottom:28px}.piece pre{white-space:pre-wrap;font-family:inherit;font-size:15px;margin:0}.muted{color:#6b7280;font-size:13px}.bar{background:#e5e7eb;height:10px;border-radius:5px}.bar>i{display:block;height:10px;border-radius:5px;background:#16a34a}@media print{.noprint{display:none}}</style></head>
<body><button class="noprint" onclick="window.print()" style="float:right;padding:8px 16px">인쇄</button>${body}</body></html>`);
  w.document.close();
}

// 2-G 우리 반 공통 약점
export function InsightsPanel({ classCode, topic }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      setData(await getClassInsights(classCode, topic));
    } catch (e) {
      alert("불러오지 못했어요: " + (e.message || ""));
    } finally {
      setLoading(false);
    }
  };
  if (!data) {
    return (
      <button type="button" onClick={load} disabled={loading} className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-sm font-semibold text-violet-800">
        <Emo n="BarChart3" /> {loading ? "모으는 중…" : "우리 반 공통 약점"}
      </button>
    );
  }
  if (!data.count) return <p className="text-sm text-gray-500">아직 낸 글이 없어요.</p>;
  return (
    <div className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
      <p className="font-bold text-violet-900"><Emo n="BarChart3" /> «{topic}» 우리 반 {data.count}편</p>
      <div className="flex flex-wrap gap-2 text-sm">
        {Object.entries(data.averages).map(([k, v]) => (
          <span key={k} className="rounded-full bg-white px-3 py-1">{v.name} {v.pct}%</span>
        ))}
      </div>
      <ol className="space-y-2">
        {data.weak.map((w, i) => (
          <li key={w.key} className="rounded-lg bg-white p-3 text-sm">
            <b>{i + 1}. {w.name}</b> <span className="text-gray-500">— «고칠 것»으로 {w.count}번{w.pct !== null ? ` · 평균 ${w.pct}%` : ""}</span>
            <p className="mt-1 text-violet-900"><Emo n="Lightbulb" /> 5분 수업: {w.lesson}</p>
          </li>
        ))}
      </ol>
      {data.spelling.length > 0 && <p className="text-sm text-gray-700"><Emo n="SpellCheck" /> 자주 틀린 맞춤법: {data.spelling.map((s) => `${s.fix}(${s.count})`).join(" · ")}</p>}
    </div>
  );
}

// 2-H 성장 리포트(항목별 처음 3편 → 요즘 3편) + 인쇄
export function GrowthReport({ studentId }) {
  const [r, setR] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      setR(await getStudentReport(studentId));
    } catch (e) {
      alert("불러오지 못했어요: " + (e.message || ""));
    } finally {
      setLoading(false);
    }
  };
  const print = () => {
    const rows = Object.entries(r.recent).map(([k, v]) => {
      const f = r.first[k]?.pct;
      const d = r.change[k];
      return `<tr><td>${esc(v.name)}</td><td>${f === undefined ? "-" : `${f}%`}</td><td>${v.pct}%</td><td>${d === undefined ? "-" : `${d > 0 ? "+" : ""}${d}`}</td><td><div class="bar"><i style="width:${Math.max(0, Math.min(100, v.pct))}%"></i></div></td></tr>`;
    }).join("");
    const list = r.items.map((x) => `<tr><td>${esc(x.date)}</td><td>${esc(x.topic)}${x.rewrite ? " (고쳐쓰기)" : ""}</td><td>${x.score}${x.teacherScore !== null ? ` → 선생님 ${x.teacherScore}` : ""}</td></tr>`).join("");
    printHtml(`${r.name} 글쓰기 성장 리포트`, `<h1>${esc(r.name)} 글쓰기 성장 리포트</h1><p class="muted">글 ${r.count}편 · 고쳐쓰기 ${r.rewrites}번 · 선생님 한마디 ${r.teacherComments}번 · 잘하는 것: ${esc(r.strongest || "-")} · 더 키울 것: ${esc(r.weakest || "-")}</p>
<h2>항목별 변화(처음 3편 → 요즘 3편)</h2><table><tr><th>항목</th><th>처음</th><th>요즘</th><th>변화</th><th></th></tr>${rows}</table>
<h2>낸 글</h2><table><tr><th>날짜</th><th>주제</th><th>점수</th></tr>${list}</table><p class="muted">AI 첨삭 점수는 참고용입니다. 선생님이 고친 점수가 있으면 함께 적었습니다.</p>`);
  };
  if (!r) {
    return (
      <button type="button" onClick={load} disabled={loading} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
        <Emo n="TrendingUp" /> {loading ? "모으는 중…" : "항목별 성장 리포트"}
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-emerald-900">항목별 성장 · 글 {r.count}편 · 고쳐쓰기 {r.rewrites}번</p>
        <button type="button" onClick={print} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-800"><Emo n="Printer" /> 인쇄·PDF</button>
      </div>
      <ul className="space-y-1.5 text-sm">
        {Object.entries(r.recent).map(([k, v]) => {
          const d = r.change[k];
          return (
            <li key={k} className="flex items-center gap-2">
              <span className="w-14 font-semibold">{v.name}</span>
              <span className="h-2.5 flex-1 rounded-full bg-white"><span className="block h-2.5 rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, v.pct))}%` }} /></span>
              <span className="w-24 text-right">{r.first[k] ? `${r.first[k].pct}%` : "-"} → {v.pct}% {d !== undefined && <b className={d > 0 ? "text-emerald-700" : d < 0 ? "text-red-600" : "text-gray-500"}>{d > 0 ? "+" : ""}{d}</b>}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-emerald-900">잘하는 것: <b>{r.strongest || "-"}</b> · 더 키울 것: <b>{r.weakest || "-"}</b></p>
    </div>
  );
}

// 2-I 학급 문집 — 고른 글을 모아 인쇄. 이름·학교·지역은 AI 보낼 때와 같은 규칙으로 가린다. 글쓴이는 «학생NN».
export function AnthologyBuilder({ topic, students, classCode }) {
  const [picked, setPicked] = useState(() => new Set());
  const [title, setTitle] = useState(`우리 반 문집 — ${topic}`);
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const build = async () => {
    const win = openPrintWindow();
    if (!win) return;
    setBusy(true);
    try {
      const ids = students.filter((s) => picked.has(s.writingId)).map((s) => s.writingId);
      // 이 반·이 과제 글만(다른 글이 섞여 들어오지 않게)
      const ws = (await Promise.all(ids.map((id) => getWritingById(id).catch(() => null))))
        .filter((w) => w && w.topic === topic && classCode && w.classCode === classCode);
      // 글쓴이는 «학생NN»만 — 닉네임에 실명을 쓰는 아이가 있다. 반 아이 이름은 본문·제목에서도 가린다
      const names = [...new Set(students.flatMap((s) => [s.nickname, s.studentName, s.name]).filter((x) => typeof x === "string" && x.length >= 2))];
      const mask = (t) => maskPII(String(t || ""), { extraWords: names }).text;
      const pieces = ws.map((w, i) => `<div class="piece"><h2>${i + 1}. ${esc(mask(w.topic || topic))}</h2><p class="muted">글쓴이: 학생${String(i + 1).padStart(2, "0")}</p><pre>${esc(mask(w.content))}</pre></div>`).join("");
      printHtml(mask(title), `<h1>${esc(mask(title))}</h1><p class="muted">${ws.length}편 · 이름·학교·지역은 «ㅇㅇㅇ»로 가렸습니다.</p>${pieces}`, win);
    } catch (e) {
      win.close();
      alert("문집을 만들지 못했어요: " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="font-bold text-amber-900"><Emo n="BookOpen" /> 학급 문집 만들기</p>
      <input className="field w-full" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {students.filter((s) => s.writingId).map((s) => (
          <label key={s.writingId} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${picked.has(s.writingId) ? "border-amber-500 bg-amber-500 text-white" : "border-amber-200 bg-white"}`}>
            <input type="checkbox" className="sr-only" checked={picked.has(s.writingId)} onChange={() => toggle(s.writingId)} />
            {s.nickname || "학생"} {typeof s.score === "number" ? `· ${s.score}` : ""}
          </label>
        ))}
      </div>
      <button type="button" disabled={!picked.size || busy} onClick={build} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        {busy ? "만드는 중…" : `${picked.size}편으로 문집 만들기(인쇄·PDF)`}
      </button>
    </div>
  );
}
