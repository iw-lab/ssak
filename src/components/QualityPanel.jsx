// 품질 재는 자(2-K, 관리자) — 교사가 고친 점수와 AI 점수의 차이(0원) · 같은 글 3편 × 3번 다시 채점한 흔들림(약 9회 호출).
import { useState } from "react";
import Emo from "./Emo";
import { getQualityReport } from "../utils/aiAPI";

export default function QualityPanel() {
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (consistency) => {
    if (consistency && !confirm("같은 글 3편을 3번씩 다시 채점합니다(AI 약 9번, 30원 안팎). 진행할까요?")) return;
    setBusy(true);
    try {
      setR(await getQualityReport(consistency));
    } catch (e) {
      alert("실패: " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  };
  const ag = r?.agreement;
  return (
    <div className="space-y-3 rounded-2xl border border-indigo-200 bg-white p-5">
      <h3 className="flex items-center gap-2 text-lg font-bold text-indigo-900"><Emo n="Ruler" /> 첨삭 품질 재기</h3>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run(false)} className="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-semibold text-indigo-800">교사 점수와 비교(0원)</button>
        <button type="button" disabled={busy} onClick={() => run(true)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white">같은 글 흔들림 재기(약 30원)</button>
      </div>
      {busy && <p className="text-sm text-gray-500">재는 중…</p>}
      {ag && (ag.n ? (
        <p className="text-sm text-gray-800">선생님이 고친 글 {ag.n}편 · 평균 차이 <b>{ag.meanAbsDiff}점</b> · 5점 안 <b>{ag.within5}%</b> · AI가 더 높게 준 비율 {ag.aiHigher}%</p>
      ) : <p className="text-sm text-gray-500">아직 선생님이 점수를 고친 글이 없어요(교사 확인이 쌓이면 나와요).</p>)}
      {r?.at && <p className="text-xs text-gray-500">흔들림 마지막 잰 때: {new Date(r.at).toLocaleString("ko-KR")}</p>}
      {r?.consistency && (
        <ul className="space-y-1 text-sm text-gray-800">
          {r.consistency.map((c) => <li key={c.topic}>«{c.topic}» {c.runs ? `${c.runs}번 · ${c.min}~${c.max}점 · 흔들림 ${c.range}점` : "채점 실패"}</li>)}
          <li className="text-xs text-gray-500">같은 글을 학생이 다시 내면 서버 기록으로 늘 같은 점수가 나옵니다. 이 숫자는 «기록 없이 새로 채점하면» 얼마나 흔들리는지입니다.</li>
        </ul>
      )}
    </div>
  );
}
