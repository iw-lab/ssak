// 3-4 실시간 교실 현황(담임) — 누가 쓰는 중이고 누가 멈췄는지. 연 동안만 듣고 20분 뒤 저절로 끊는다(읽기 비용).
import { useEffect, useState } from "react";
import Emo from "./Emo";
import { watchPresence, liveState } from "../services/presenceService";

const LIMIT_MS = 20 * 60 * 1000;
const COLOR = { writing: "bg-emerald-100 text-emerald-800 border-emerald-300", idle: "bg-amber-100 text-amber-900 border-amber-300", done: "bg-sky-100 text-sky-800 border-sky-300", none: "bg-gray-50 text-gray-500 border-gray-200" };

export default function LivePanel({ classCode, topic, students }) {
  const [on, setOn] = useState(false);
  const [map, setMap] = useState({});
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!on) return undefined;
    setErr(false);
    const stop = watchPresence(classCode, (m) => (m ? setMap(m) : setErr(true)));
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const off = setTimeout(() => setOn(false), LIMIT_MS);
    return () => { stop(); clearInterval(tick); clearTimeout(off); };
  }, [on, classCode]);

  if (!on) {
    return (
      <button type="button" onClick={() => setOn(true)} className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-800">
        <Emo n="Activity" /> 지금 교실 현황(20분)
      </button>
    );
  }
  const rows = (students || []).map((s) => ({ s, st: liveState(map[s.studentId], topic, now) }));
  const count = (k) => rows.filter((r) => r.st.kind === k).length;
  return (
    <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold text-emerald-900"><Emo n="Activity" /> «{topic}» 지금 — 쓰는 중 {count("writing")} · 멈춤 {count("idle")} · 제출 {count("done")} · 안 열음 {count("none")}</p>
        <button type="button" onClick={() => setOn(false)} className="text-sm text-emerald-800 underline">끄기</button>
      </div>
      {err && <p className="text-sm text-red-600">현황을 불러오지 못했어요.</p>}
      <div className="flex flex-wrap gap-2">
        {rows.map(({ s, st }) => (
          <span key={s.studentId} className={`rounded-full border px-3 py-1 text-sm ${COLOR[st.kind]}`}>{s.studentName || s.nickname || "학생"} · {st.label}</span>
        ))}
      </div>
      <p className="text-xs text-emerald-800">글 내용은 오지 않아요(주제·글자 수만). 4분 넘게 글자가 늘지 않으면 «멈춤»으로 보여요.</p>
    </div>
  );
}
