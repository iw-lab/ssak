// 선생님 확인·한마디·점수 고치기(1-7) + 쓰는 과정 요약(2-B).
//   AI 첨삭은 초벌이다 — 하이러닝·클리포·Google Classroom 처럼 교사가 보고 고친 값이 학생 화면에 «선생님이 확인했어요»로 뜬다.
//   규칙(firestore.rules writings): 담임은 reviewed·teacherComment·teacherScore·teacherCheckedAt·teacherName 만 바꿀 수 있다.
import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import Emo from "./Emo";

export function ProcessSummary({ process }) {
  if (!process) return <p className="text-xs text-gray-400">쓰는 과정 기록 없음(예전 글)</p>;
  const helps = Object.entries(process.helps || {}).filter(([, n]) => n > 0);
  const label = { hint: "힌트", structure: "구조", polish: "다듬기", expand: "넓히기", outline: "개요" };
  const warn = process.bigInserts > 0 || process.pasteBlocked > 0;
  return (
    <div className={`rounded-lg border p-3 text-sm ${warn ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
      <p className="mb-1 font-semibold text-gray-700"><Emo n="Activity" /> 이렇게 썼어요</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-gray-700">
        <li>쓴 시간 약 {process.activeMinutes ?? "?"}분(열어 둔 시간 {process.minutes ?? "?"}분)</li>
        <li>입력 {process.inputs ?? 0}번</li>
        {process.speechInserts > 0 && <li>말로 쓰기 {process.speechInserts}번</li>}
        {process.bigInserts > 0 && <li className="font-bold text-amber-800">한꺼번에 많이 들어온 글 {process.bigInserts}번</li>}
        {process.pasteBlocked > 0 && <li className="font-bold text-amber-800">붙여넣기 시도 {process.pasteBlocked}번(막음)</li>}
        {helps.length > 0 && <li>AI 도움: {helps.map(([k, n]) => `${label[k] || k} ${n}`).join(", ")}</li>}
      </ul>
      {warn && <p className="mt-1 text-xs text-amber-800">숫자는 참고용이에요. 의심이 들면 학생에게 어떻게 썼는지 직접 물어봐 주세요.</p>}
    </div>
  );
}

export default function TeacherReview({ writing, teacherName = "선생님", onSaved }) {
  const [comment, setComment] = useState(writing.teacherComment || "");
  const [score, setScore] = useState(Number.isInteger(writing.teacherScore) ? String(writing.teacherScore) : "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const n = score.trim() === "" ? null : Number(score);
    if (n !== null && (!Number.isInteger(n) || n < 0 || n > 100)) return alert("점수는 0~100 사이 정수로 넣어 주세요.");
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const patch = {
        teacherComment: comment.trim().slice(0, 500) || null,
        teacherScore: n,
        teacherCheckedAt: now,
        teacherName: String(teacherName || "선생님").slice(0, 20),
        reviewed: true,
        reviewedAt: now,
      };
      await updateDoc(doc(db, "writings", writing.writingId), patch);
      onSaved?.({ ...writing, ...patch });
    } catch (e) {
      alert("저장하지 못했어요: " + (e.message || ""));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="space-y-3 rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4">
      <p className="font-bold text-emerald-900"><Emo n="BadgeCheck" /> 선생님 확인 {writing.teacherCheckedAt && <span className="text-xs font-normal text-emerald-700">· {new Date(writing.teacherCheckedAt).toLocaleString()} 저장됨</span>}</p>
      <textarea className="field w-full" rows={3} maxLength={500} placeholder="학생에게 보일 한마디(선택)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-emerald-900">
          점수 고치기(선택)
          <input className="field ml-2 w-24" inputMode="numeric" placeholder={String(writing.score ?? "")} value={score} onChange={(e) => setScore(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))} />
        </label>
        <span className="text-xs text-emerald-800">비우면 AI 점수 {writing.score}점 그대로</span>
        <button type="button" onClick={save} disabled={saving} className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "저장 중…" : "확인하고 저장"}</button>
      </div>
    </div>
  );
}
