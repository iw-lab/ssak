// 쓰기 전 생각 꺼내기(2-C) — AI 가 낸 질문에 학생이 «자기 말로» 답하면, 그 답을 개요로 글 칸에 넣는다.
//   AI 가 문장을 써 주지 않는다(글잇·키위런·Khanmigo 방식). 답이 없으면 넣을 것도 없다.
import { useState } from "react";
import Emo from "./Emo";

export default function ThinkFirst({ questions = [], onInsert }) {
  const [answers, setAnswers] = useState(() => questions.map(() => ""));
  const filled = answers.filter((a) => a.trim()).length;
  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs font-bold text-yellow-800"><Emo n="HelpCircle" /> 질문에 내 말로 짧게 답해 보세요</p>
      {questions.map((q, i) => (
        <label key={i} className="block text-sm text-yellow-900">
          {q}
          <input
            className="field mt-1 w-full text-sm"
            value={answers[i] || ""}
            maxLength={120}
            onChange={(e) => setAnswers((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder="한두 낱말이어도 좋아요"
          />
        </label>
      ))}
      <button
        type="button"
        disabled={!filled}
        onClick={() => onInsert(answers.filter((a) => a.trim()).map((a) => `- ${a.trim()}`).join("\n"))}
        className="rounded-lg bg-yellow-500 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
      >
        내 답으로 개요 만들기({filled}개)
      </button>
      <p className="text-xs text-yellow-700">개요는 글 맨 위에 들어가요. 이걸 보며 문장으로 이어 써 보세요.</p>
    </div>
  );
}
