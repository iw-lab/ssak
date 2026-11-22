// 가림 명단 — 담임이 반 학생 이름을 넣어 두면, 학생 글 속 그 이름을 AI 로 보내기 전에 «ㅇㅇㅇ»로 가린다.
// 명단은 서울 서버에만 두고(규칙상 화면에서 직접 읽기·쓰기 불가, 함수로만) AI 회사로는 보내지 않는다.
import { useCallback, useEffect, useState } from "react";
import { getMaskNames, setMaskNames } from "../services/classService";

const parse = (t) => [...new Set(String(t).split(/[\s,，、;]+/).map((s) => s.trim()).filter(Boolean))];

export default function MaskRosterBox({ classCode }) {
  const [text, setText] = useState("");
  const [terms, setTerms] = useState([]);
  const [loaded, setLoaded] = useState(false); // 불러오기에 성공한 뒤에만 저장할 수 있다 — 못 불러온 빈 칸으로 있던 명단을 덮어쓰지 않게
  const [state, setState] = useState("loading"); // loading | idle | saving | saved | error
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    let alive = true;
    setState("loading"); setMsg(""); setLoaded(false); setText(""); setTerms([]);
    getMaskNames(classCode).then(
      (r) => { if (alive) { setText(r.names.join(", ")); setTerms(r.terms); setLoaded(true); setState("idle"); } },
      (e) => { if (alive) { setState("error"); setMsg("명단을 불러오지 못했어요: " + (e.message || "")); } },
    );
    return () => { alive = false; };
  }, [classCode]);
  useEffect(() => load(), [load]);

  const names = parse(text);
  const bad = names.filter((n) => !/^[가-힣]{2,5}$/.test(n));
  const save = async () => {
    setState("saving"); setMsg("");
    try {
      const r = await setMaskNames(classCode, names);
      setText(r.names.join(", ")); setTerms(r.terms);
      setState("saved"); setMsg(r.names.length ? `${r.names.length}명 저장했어요.` : "명단을 지웠어요.");
    } catch (e) { setState("error"); setMsg("저장하지 못했어요: " + (e.message || "")); }
  };

  return (
    <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <h3 className="font-semibold text-emerald-900">가림 명단 (선택)</h3>
      <p className="mt-1 text-sm text-emerald-800">
        반 학생 이름을 넣어 두면, 학생 글에 그 이름이 나올 때 AI 로 보내기 전에 <b>반드시 «ㅇㅇㅇ»로 가려요</b>.
        «하늘·바다·유리»처럼 보통 낱말 같은 이름은 명단이 있어야 잡혀요. <b>성까지 붙여</b> 적으면(예: 김하늘) «김하늘»과 «하늘» 둘 다 가려요.
        명단은 우리나라(서울) 서버에만 두고 AI 회사로는 보내지 않으며, 학년도가 끝나면 반과 함께 지워져요.
      </p>
      <textarea
        className="mt-2 w-full rounded border border-emerald-300 bg-white p-2 text-sm"
        rows={3}
        aria-label="가림 명단"
        placeholder="김하늘, 박바다, 이유리 … (쉼표나 줄바꿈으로 나눠요. 한글 2~5자, 60명까지)"
        value={text}
        disabled={!loaded || state === "saving"}
        onChange={(e) => { setText(e.target.value); if (state !== "idle") { setState("idle"); setMsg(""); } }}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {loaded ? (
          <button
            onClick={save}
            disabled={state === "saving" || bad.length > 0 || names.length > 60}
            className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {state === "saving" ? "저장 중..." : "명단 저장"}
          </button>
        ) : state === "error" ? (
          <button onClick={load} className="rounded border border-emerald-400 bg-white px-3 py-1 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">다시 불러오기</button>
        ) : null}
        <span className="text-sm text-emerald-900">{names.length}명</span>
        {bad.length > 0 && <span className="text-sm text-red-700">한글 2~5자만 돼요: {bad.slice(0, 3).join(", ")}</span>}
        {names.length > 60 && <span className="text-sm text-red-700">60명까지 넣을 수 있어요.</span>}
        {msg && <span className={`text-sm ${state === "error" ? "text-red-700" : "text-emerald-900"}`} role="status">{msg}</span>}
      </div>
      {terms.length > 0 && (
        <p className="mt-2 text-xs text-emerald-800">지금 글에서 가려지는 낱말: {terms.join(" · ")}</p>
      )}
    </div>
  );
}
