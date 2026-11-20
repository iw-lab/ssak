// 첨삭 보기 — 2026-11-20 업그레이드(docs/UPGRADE-PLAN-2026-11.md 1-1·1-2·1-3·1-5·1-7·2-D·2-F).
//   잘한 점 2 → 이번에 고칠 것 1~2(여기·왜·힌트, 예시는 고쳐 써 본 뒤에) → 맞춤법(바로) → 점수 근거 → 고쳐쓰기 전후 → 종합.
//   옛 첨삭(문자열 strengths·improvements·detailedFeedback)도 그대로 보인다.
import { useMemo, useState } from "react";
import Emo from "./Emo";
import { CRITERIA, GOALS } from "../config/writingOptions";
import { getExemplar } from "../utils/aiAPI";

// 낱말 단위 차이(LCS) — 고쳐 쓴 곳에 색을 칠한다
export function wordDiff(a = "", b = "") {
  const A = String(a).split(/(\s+)/).filter((x) => x !== "");
  const B = String(b).split(/(\s+)/).filter((x) => x !== "");
  if (A.length * B.length > 400000) return [{ t: "same", s: b }]; // 너무 길면 비교 생략
  const dp = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  const push = (t, s) => (out.length && out[out.length - 1].t === t ? (out[out.length - 1].s += s) : out.push({ t, s }));
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { push("same", B[j]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { push("del", A[i]); i++; }
    else { push("add", B[j]); j++; }
  }
  while (i < A.length) push("del", A[i++]);
  while (j < B.length) push("add", B[j++]);
  return out;
}

const goalName = (k) => GOALS.find((g) => g.key === k)?.name;
const critName = (k) => CRITERIA.find((c) => c.key === k)?.name || "내용";

function speak(text) {
  try {
    if (!("speechSynthesis" in window)) return alert("이 기기는 읽어 주기를 지원하지 않아요.");
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 0.95;
    window.speechSynthesis.speak(u);
  } catch {
    /* 소리가 안 나도 화면은 그대로 */
  }
}

function Quote({ children }) {
  if (!children) return null;
  return <span className="mt-1 inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[13px] text-amber-900">«{children}»</span>;
}

function NextStep({ step, idx, unlocked }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-orange-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-bold text-orange-700">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100">{idx + 1}</span>
        {critName(step.focus)}
      </div>
      {step.quote && <div className="mt-2"><Quote>{step.quote}</Quote></div>}
      <p className="mt-2 text-[15px] text-gray-800">{step.why}</p>
      {step.hint && (
        <p className="mt-2 flex items-start gap-1.5 text-[15px] font-semibold text-indigo-800">
          <Emo n="HelpCircle" /> {step.hint}
        </p>
      )}
      {step.example && (
        <div className="mt-3">
          {unlocked ? (
            open ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><b>예시</b> · {step.example}</p>
            ) : (
              <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-emerald-700 underline">내가 고친 것과 예시 비교해 보기</button>
            )
          ) : (
            <p className="text-xs text-gray-500"><Emo n="Lock" /> «고쳐쓰기»에서 이 구절을 내 말로 고치면 예시가 열려요.</p>
          )}
        </div>
      )}
    </li>
  );
}

// 잘 쓴 글 한 편 보기(2-E) — 내 글과 나란히. 따라 쓰지 말고 «무엇이 다른지» 찾게.
function Exemplar({ gradeLevel, genre, topic, mine }) {
  const [ex, setEx] = useState(null);
  const [loading, setLoading] = useState(false);
  const open = async () => {
    setLoading(true);
    try {
      setEx(await getExemplar(gradeLevel, genre, topic));
    } catch {
      setEx({ found: false });
    } finally {
      setLoading(false);
    }
  };
  if (!ex) {
    return (
      <button type="button" onClick={open} disabled={loading} className="w-full rounded-lg border border-sky-200 bg-white px-4 py-3 text-left text-[15px] font-semibold text-sky-800">
        <Emo n="BookOpen" /> {loading ? "찾는 중…" : "같은 종류의 잘 쓴 글 한 편 보기"}
      </button>
    );
  }
  if (!ex.found) return <p className="text-sm text-gray-500">이 종류의 본보기 글이 아직 없어요.</p>;
  return (
    <div className="rounded-lg border border-sky-200 bg-white p-4">
      <p className="mb-2 font-semibold text-sky-800"><Emo n="BookOpen" /> 본보기 글 · {ex.title}</p>
      <p className="mb-3 text-sm text-sky-900">따라 쓰지 말고, 내 글과 «무엇이 다른지» 하나만 찾아보세요. 처음을 어떻게 열었나요? 느낌을 어떻게 썼나요?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-sky-50 p-3 text-sm leading-relaxed">{ex.content}</div>
        {mine && <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm leading-relaxed"><b className="block text-gray-500">내 글</b>{mine}</div>}
      </div>
    </div>
  );
}

export default function FeedbackView({ feedback, writing }) {
  const f = feedback || {};
  const strengths = f.strengthItems?.length ? f.strengthItems : (f.strengths || []).map((t) => ({ text: t }));
  const steps = f.nextSteps?.length ? f.nextSteps : (f.improvements || []).slice(0, 2).map((t) => ({ why: t, focus: "content" }));
  const spelling = f.spelling?.length ? f.spelling : (f.detailedFeedback || []).filter((d) => d.type === "spelling" || d.type === "grammar").slice(0, 5);
  // 예시는 첨삭 화면에선 늘 잠가 둔다 — 고쳐쓰기 화면(RewriteGuide)에서 그 구절을 고치면 열린다(8way gemini·codex)
  const unlocked = false;
  const prevContent = writing?.previousContent;
  const diff = useMemo(() => (prevContent && writing?.content ? wordDiff(prevContent, writing.content) : null), [prevContent, writing?.content]);
  const prevCrit = writing?.previousCriteria;

  const readAloud = () =>
    speak([
      f.goalFeedback,
      strengths.length ? `잘한 점. ${strengths.map((s) => s.text).join(" ")}` : "",
      steps.length ? `이번에 고칠 것. ${steps.map((s) => `${s.why} ${s.hint || ""}`).join(" ")}` : "",
      f.overallFeedback,
    ].filter(Boolean).join(" "));

  return (
    <div className="space-y-4 rounded-xl border border-indigo-100 bg-background p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-lg font-bold text-indigo-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-sm text-white">AI</span>
          첨삭
        </h4>
        <div className="flex gap-2">
          <button type="button" onClick={readAloud} className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700"><Emo n="Volume2" /> 첨삭 듣기</button>
          {writing?.content && <button type="button" onClick={() => speak(writing.content)} className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-sm font-semibold text-indigo-700"><Emo n="BookOpen" /> 내 글 듣기</button>}
        </div>
      </div>

      {(f.teacherComment || Number.isInteger(f.teacherScore)) && (
        <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 font-bold text-emerald-800"><Emo n="BadgeCheck" /> {f.teacherName || "선생님"}이 확인했어요{Number.isInteger(f.teacherScore) ? ` · ${f.teacherScore}점` : ""}</p>
          {f.teacherComment && <p className="mt-1 text-[15px] text-emerald-900">{f.teacherComment}</p>}
        </div>
      )}

      {f.goal && f.goalFeedback && (
        <div className="rounded-lg border border-violet-200 bg-white p-4">
          <p className="text-xs font-bold text-violet-700">이번 글 목표 · {goalName(f.goal)}</p>
          <p className="mt-1 text-[15px] text-gray-800">{f.goalFeedback}</p>
        </div>
      )}

      {strengths.length > 0 && (
        <div className="rounded-lg border border-emerald-200 bg-white p-4">
          <h5 className="mb-2 flex items-center gap-2 font-semibold text-emerald-700"><Emo n="Sparkles" /> 잘한 점</h5>
          <ul className="space-y-2">
            {strengths.map((s, i) => (
              <li key={i} className="text-[15px] text-gray-800">
                {s.text}
                {s.quote && <div><Quote>{s.quote}</Quote></div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {steps.length > 0 && (
        <div>
          <h5 className="mb-2 flex items-center gap-2 font-semibold text-orange-700"><Emo n="Target" /> 이번에 고칠 것</h5>
          <ol className="space-y-3">
            {steps.map((s, i) => <NextStep key={i} step={s} idx={i} unlocked={unlocked} />)}
          </ol>
        </div>
      )}

      {spelling.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-white p-4">
          <h5 className="mb-2 flex items-center gap-2 font-semibold text-blue-700"><Emo n="SpellCheck" /> 맞춤법·띄어쓰기</h5>
          <ul className="flex flex-wrap gap-2">
            {spelling.map((x, i) => (
              <li key={i} className="rounded-md bg-blue-50 px-2.5 py-1 text-sm">
                <span className="text-gray-500 line-through">{x.original}</span> → <b className="text-blue-900">{x.suggestion}</b>
              </li>
            ))}
          </ul>
        </div>
      )}

      {f.criteria && (
        <details className="rounded-lg border border-gray-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold text-gray-700">점수는 이렇게 매겼어요</summary>
          <ul className="mt-3 space-y-2">
            {CRITERIA.map((c) => {
              const x = f.criteria[c.key];
              if (!x) return null;
              const before = prevCrit?.[c.key]?.score;
              const d = Number.isFinite(before) ? x.score - before : null;
              return (
                <li key={c.key} className="text-sm text-gray-800">
                  <b>{c.name} {x.score}/{c.max}</b>
                  {d !== null && d !== 0 && <span className={`ml-1 font-bold ${d > 0 ? "text-emerald-600" : "text-red-600"}`}>({d > 0 ? "+" : ""}{d})</span>}
                  {x.why && <span className="text-gray-600"> — {x.why}</span>}
                  {x.quote && <div><Quote>{x.quote}</Quote></div>}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {diff && (
        <div className="rounded-lg border border-teal-200 bg-white p-4">
          <h5 className="mb-2 flex items-center gap-2 font-semibold text-teal-700"><Emo n="GitCompare" /> 고쳐 쓴 곳</h5>
          {f.growthNote && <p className="mb-2 text-[15px] text-teal-900">{f.growthNote}</p>}
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
            {diff.map((p, i) =>
              p.t === "same" ? <span key={i}>{p.s}</span> : p.t === "add" ? <mark key={i} className="rounded bg-emerald-100 px-0.5 text-emerald-900">{p.s}</mark> : <del key={i} className="text-red-400">{p.s}</del>,
            )}
          </p>
          {Number.isFinite(f.previousScore) && <p className="mt-2 text-sm text-gray-600">점수 {f.previousScore} → {f.score}</p>}
        </div>
      )}
      {!diff && f.growthNote && <p className="rounded-lg bg-teal-50 p-3 text-[15px] text-teal-900">{f.growthNote}</p>}

      {writing?.gradeLevel && (
        <Exemplar gradeLevel={writing.gradeLevel} genre={f.genre || writing.genre} topic={writing.topic} mine={writing.content} />
      )}

      {f.overallFeedback && (
        <div className="rounded-lg border border-indigo-200 bg-white p-4">
          <h5 className="mb-1 flex items-center gap-2 font-semibold text-indigo-700"><Emo n="MessageCircle" /> 한마디</h5>
          <p className="text-[15px] leading-relaxed text-gray-800">{f.overallFeedback}</p>
        </div>
      )}
    </div>
  );
}

// 고쳐쓰기 길잡이 — 고칠 곳을 원문에 칠하고, 학생이 그 구절을 바꾸면(원문 구절이 글에서 사라지면) 예시를 연다.
export function RewriteGuide({ rewrite, content = "" }) {
  const steps = rewrite?.nextSteps?.length ? rewrite.nextSteps : (rewrite?.improvements || []).slice(0, 2).map((t) => ({ why: t }));
  const spelling = rewrite?.spelling || (rewrite?.detailedFeedback || []).filter((d) => d.type === "spelling");
  // 서버 quoteInText 와 같은 기준(공백·문장부호 무시) — 다르면 고치기도 전에 예시가 열린다(8way codex)
  const squash = (x) => String(x || "").replace(/[\s.,!?'"“”‘’()[\]{}:;·~\-_…]/g, "");
  const changed = (q) => !!q && !squash(content).includes(squash(q));
  if (!steps.length && !spelling.length) return null;
  return (
    <div className="mb-3 space-y-3 rounded-xl border-2 border-orange-300 bg-orange-50 p-4">
      <p className="font-bold text-orange-800"><Emo n="Target" /> 이번에 고칠 것 — 내 말로 고쳐 써 보세요</p>
      <ol className="space-y-2">
        {steps.map((st, i) => {
          const done = changed(st.quote);
          return (
            <li key={i} className={`rounded-lg border bg-white p-3 ${done ? "border-emerald-300" : "border-orange-200"}`}>
              <p className="text-xs font-bold text-orange-700">{i + 1}. {critName(st.focus)} {done && <span className="ml-1 text-emerald-600">· 고쳤어요!</span>}</p>
              {st.quote && <div><Quote>{st.quote}</Quote></div>}
              <p className="mt-1 text-[15px] text-gray-800">{st.why}</p>
              {st.hint && <p className="mt-1 text-[15px] font-semibold text-indigo-800"><Emo n="HelpCircle" /> {st.hint}</p>}
              {st.example && (done
                ? <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><b>예시와 비교해 보기</b> · {st.example}</p>
                : <p className="mt-2 text-xs text-gray-500"><Emo n="Lock" /> 이 구절을 고치면 예시가 열려요.</p>)}
            </li>
          );
        })}
      </ol>
      {spelling.length > 0 && (
        <p className="text-sm text-blue-900"><Emo n="SpellCheck" /> 맞춤법: {spelling.map((x) => `${x.original} → ${x.suggestion}`).join(" · ")}</p>
      )}
    </div>
  );
}
