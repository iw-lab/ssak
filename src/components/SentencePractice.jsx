// 3-3 내 글 문장으로 5분 연습 — 내 글에서 나온 맞춤법·띄어쓰기를 다시 고쳐 쓴다(AI 0회·DB 쓰기 0).
import { useMemo, useState } from "react";
import Emo from "./Emo";
import { buildPractice, checkAnswer, loadSolved, saveSolved } from "../utils/practice";

export default function SentencePractice({ uid, writings }) {
  const [solved, setSolved] = useState(() => loadSolved(uid));
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState(null); // null | "right" | "wrong" | "shown"
  const [tries, setTries] = useState(0);
  const [score, setScore] = useState(0);
  // 열 때 한 번 문제를 고정한다(풀면서 목록이 바뀌지 않게)
  const [items, setItems] = useState([]);
  const available = useMemo(() => buildPractice(writings, { solved }).length, [writings, solved]);

  if (!available && !open) return null;

  const start = () => {
    setItems(buildPractice(writings, { solved }));
    setI(0); setAnswer(""); setResult(null); setTries(0); setScore(0); setOpen(true);
  };
  const item = items[i];
  const submit = (e) => {
    e.preventDefault();
    if (!item || result === "right" || result === "shown") return;
    if (checkAnswer(item, answer)) {
      setResult("right");
      if (tries === 0) setScore((s) => s + 1);
      const next = [...solved, item.key];
      setSolved(next);
      saveSolved(uid, next);
    } else {
      setTries((t) => t + 1);
      setResult(tries >= 1 ? "shown" : "wrong");
    }
  };
  const next = () => { setI((n) => n + 1); setAnswer(""); setResult(null); setTries(0); };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
        <p className="text-sky-900"><Emo n="Target" /> <b>내 글 문장 연습</b> — 내가 쓴 글에서 틀린 맞춤법 {available}개를 다시 고쳐 봐요(5분)</p>
        <button type="button" onClick={start} className="rounded-xl bg-sky-600 px-4 py-2 font-bold text-white">연습 시작</button>
      </div>
    );
  }
  if (!item) {
    return (
      <div className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 p-5 text-center">
        <p className="text-lg font-bold text-sky-900"><Emo n="PartyPopper" /> 연습 끝! 한 번에 맞힌 것 {score} / {items.length}</p>
        <p className="text-sm text-sky-800">맞힌 낱말은 다음엔 안 나와요. 새 글을 쓰면 새 문제가 생겨요.</p>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-sky-300 bg-white px-4 py-2 font-semibold text-sky-800">닫기</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-5">
      <div className="flex items-center justify-between text-sm text-sky-800">
        <span><Emo n="Target" /> {i + 1} / {items.length} · «{item.topic}»에서{item.times > 1 ? ` · ${item.times}번 나온 실수` : ""}</span>
        <button type="button" onClick={() => setOpen(false)} className="underline">그만하기</button>
      </div>
      <p className="rounded-xl bg-white p-4 text-lg leading-relaxed text-gray-800">
        {item.before}<mark className="rounded bg-amber-200 px-1 font-bold">{item.word}</mark>{item.after}
      </p>
      <p className="text-sm text-gray-700">{item.spacing ? "띄어쓰기를 바르게 고쳐 써 보세요." : "맞춤법을 바르게 고쳐 써 보세요."}</p>
      <div className="flex gap-2">
        <input
          className="field flex-1 text-lg"
          value={answer}
          autoFocus
          maxLength={30}
          onChange={(e) => { setAnswer(e.target.value); if (result === "wrong") setResult(null); }}
          disabled={result === "right" || result === "shown"}
          aria-label="고쳐 쓴 낱말"
        />
        {result === "right" || result === "shown" ? (
          <button type="button" onClick={next} className="rounded-xl bg-sky-600 px-4 py-2 font-bold text-white">다음</button>
        ) : (
          <button type="submit" disabled={!answer.trim()} className="rounded-xl bg-sky-600 px-4 py-2 font-bold text-white disabled:opacity-50">확인</button>
        )}
      </div>
      <p aria-live="polite" className="min-h-6 font-semibold">
        {result === "right" && <span className="text-emerald-700"><Emo n="CheckCircle2" /> 맞았어요! «{item.right}»</span>}
        {result === "wrong" && <span className="text-amber-700">아직이에요. 한 번 더 — {item.spacing ? "어디를 띄어 쓸까요?" : `글자 수 ${item.right.replace(/\s/g, "").length}자예요.`}</span>}
        {result === "shown" && <span className="text-sky-800">바른 답은 «{item.right}»예요. 다음에 또 나올 거예요.</span>}
      </p>
    </form>
  );
}
