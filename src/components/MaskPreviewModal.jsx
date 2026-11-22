import Emo from "./Emo.jsx";
// 제출 전 «AI 선생님에게 이렇게 보내요» — 서버와 같은 가림 규칙(functions/pii.mjs)으로 미리 보여 주고,
// 못 가린 낱말은 학생이 눌러서 더 가린다(그 목록이 maskWords 로 서버에 간다 — 서버도 같은 낱말을 가린다).
// Anthropic 미성년 이용 지침: 사용자에게 «사람이 아니라 AI»임을 알린다.
// 2026-11-22: 가림은 서버가 한다(maskPreview — 규칙 + 형태소 분석 층). 화면은 서버가 가린 글을 받아 보여 주고,
//   학생이 더 고른 낱말만 그 위에 덧가린다. 서버 답이 오기 전·못 왔을 때는 «보내기»를 막는다(보여 준 것 = 보내는 것).
import React, { useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { maskPII, MASK } from "../../functions/pii.mjs";

const TRAIL = /(이랑|이한테|이에게|이가|이는|이를|이도|에게|한테|하고|에서|으로|랑|와|과|이|가|은|는|을|를|의|도|에|로|야|아)$/;
const coreOf = (w) => {
  const s = w.replace(/[^가-힣A-Za-z0-9]/g, "");
  let c = s.length > 2 ? s.replace(TRAIL, "") : s;
  // «똘이는» → «똘»이 아니라 «똘이»(한 글자만 남으면 «이»는 이름의 일부로 본다)
  if (c.length < 2) c = s.replace(/(랑|한테|에게|하고|가|는|를|도|와|과|의|은|을|에|로|야|아)$/, "");
  return c.length >= 1 ? c : s;
};

export default function MaskPreviewModal({ text, initialExtra = [], onConfirm, onCancel }) {
  const [extra, setExtra] = useState(() => (Array.isArray(initialExtra) ? initialExtra.slice(0, 40) : []));
  const [server, setServer] = useState({ state: "loading", text: null, of: null }); // loading | ok | error · of = 이 결과가 어느 글의 것인지
  const [tryNo, setTryNo] = useState(0);
  useEffect(() => {
    let alive = true;
    setServer({ state: "loading", text: null, of: text });
    httpsCallable(functions, "maskPreview")({ texts: [text || ""] })
      .then((r) => { if (alive) setServer({ state: "ok", text: String(r.data?.texts?.[0] ?? ""), of: text }); })
      .catch(() => { if (alive) setServer({ state: "error", text: null, of: text }); });
    return () => { alive = false; };
  }, [text, tryNo]);
  // 서버(pii-deep.mjs maskDeep)의 마지막 단계와 같은 호출 — 보여 준 글 = 보내는 글
  const ready = server.state === "ok" && server.of === text; // 글이 바뀌면 옛 글의 미리보기로는 못 보낸다
  const masked = useMemo(() => (ready ? maskPII(server.text, { extraWords: extra }).text : ""), [ready, server.text, extra]);
  const tokens = useMemo(() => masked.split(/(\s+)/), [masked]);
  const add = (tok) => {
    const c = coreOf(tok);
    if (!c || c.includes(MASK) || extra.includes(c)) return;
    setExtra((x) => [...x, c].slice(0, 40));
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" data-mask-preview>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-4 shadow-xl sm:p-6">
        <h2 className="text-lg font-bold text-emerald-800"><Emo n="Bot" /> AI 선생님에게 이렇게 보내요</h2>
        <p className="mt-1 text-sm text-gray-600">
          AI 선생님은 <b>사람이 아니라 인공지능</b>이에요(미국 회사 Anthropic의 Claude). <b>이름·지역·주소·학교·전화번호는 «ㅇㅇㅇ»로 가려서</b> 보내요.
          아직 보이는 이름이나 사는 곳이 있으면 <b>그 낱말을 눌러</b> 더 가려 주세요.
        </p>
        {server.state === "loading" && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" data-mask-loading>이름과 사는 곳을 꼼꼼히 가리는 중이에요… 잠깐만 기다려 주세요.</p>}
        {server.state === "error" && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" data-mask-error>
            가림 준비가 안 돼서 아직 보낼 수 없어요.{" "}
            <button type="button" className="font-bold underline" onClick={() => setTryNo((n) => n + 1)}>다시 해 보기</button>
          </p>
        )}
        <div className="mt-3 flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-3 text-[15px] leading-7" data-mask-text>
          {tokens.map((tk, i) => (/^\s+$/.test(tk) ? tk : (
            <button type="button" key={i} onClick={() => add(tk)}
              className={`rounded px-0.5 ${tk.includes(MASK) ? "bg-emerald-200 font-bold text-emerald-900" : "hover:bg-amber-100"}`}>{tk}</button>
          )))}
        </div>
        {extra.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 text-xs" data-mask-extra>
            <span className="text-gray-500">내가 더 가린 낱말:</span>
            {extra.map((w) => (
              <button type="button" key={w} onClick={() => setExtra((x) => x.filter((y) => y !== w))} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">{w} <Emo n="X" /></button>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-xl border border-gray-300 px-4 py-2 text-sm">다시 고칠래요</button>
          <button type="button" onClick={() => ready && onConfirm(extra)} disabled={!ready} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40" data-mask-send>이대로 보내기</button>
        </div>
      </div>
    </div>
  );
}
