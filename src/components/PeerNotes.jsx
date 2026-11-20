// 3-2 친구 글에 칭찬 1 + 질문 1 — 담임이 고른 글(이름 가림)만 보이고, 남긴 말은 담임이 승인해야 글쓴이에게 간다.
import { useEffect, useState } from "react";
import Emo from "./Emo";
import { peerShare, peerList, peerSend, peerInbox, peerPending, peerDecide } from "../utils/aiAPI";

const errText = (e) => String(e?.message || "").replace(/^.*?:\s*/, "") || "잠시 뒤 다시 해 주세요.";

// 학생: 친구 글 읽고 남기기
export function PeerBoard() {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [praise, setPraise] = useState("");
  const [question, setQuestion] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => peerList().then((r) => setItems(r.items || []), () => setItems([]));
  useEffect(() => { load(); }, []);
  const send = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      await peerSend(open.id, praise, question);
      setMsg("보냈어요! 선생님이 확인하면 친구에게 전해져요.");
      setItems((xs) => xs.map((x) => (x.id === open.id ? { ...x, sent: true } : x)));
      setPraise(""); setQuestion(""); setOpen(null);
    } catch (err) {
      setMsg(errText(err));
    } finally {
      setBusy(false);
    }
  };
  if (items === null) return <p className="text-gray-500">불러오는 중…</p>;
  if (!items.length) return <p className="rounded-xl bg-gray-50 p-4 text-gray-600">아직 선생님이 보여 준 친구 글이 없어요.</p>;
  return (
    <div className="space-y-3">
      {msg && <p aria-live="polite" className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{msg}</p>}
      {items.map((it, n) => (
        <div key={it.id} className="rounded-2xl border border-pink-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold text-pink-900">친구 글 {n + 1} · «{it.topic}»</p>
            {it.sent ? <span className="text-sm text-emerald-700"><Emo n="CheckCircle2" /> 남겼어요</span> : (
              <button type="button" onClick={() => { setOpen(open?.id === it.id ? null : it); setMsg(""); }} className="rounded-lg bg-pink-500 px-3 py-1.5 text-sm font-bold text-white">{open?.id === it.id ? "닫기" : "읽고 남기기"}</button>
            )}
          </div>
          {open?.id === it.id && (
            <form onSubmit={send} className="mt-3 space-y-3">
              <p className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-pink-50 p-4 leading-relaxed text-gray-800">{it.content}</p>
              <label className="block text-sm font-semibold text-gray-700"><Emo n="ThumbsUp" /> 칭찬 한 가지 — 어느 부분이 왜 좋았나요?
                <input className="field mt-1 w-full" maxLength={120} value={praise} onChange={(e) => setPraise(e.target.value)} placeholder="예: 썰매 타는 장면이 눈에 보이는 것 같았어" />
              </label>
              <label className="block text-sm font-semibold text-gray-700"><Emo n="HelpCircle" /> 궁금한 것 한 가지
                <input className="field mt-1 w-full" maxLength={120} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="예: 그때 동생은 어떤 표정이었어?" />
              </label>
              <button type="submit" disabled={busy || praise.trim().length < 5 || question.trim().length < 5} className="rounded-xl bg-pink-500 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? "보내는 중…" : "보내기"}</button>
              <p className="text-xs text-gray-500">내 이름은 친구에게 안 보여요. 선생님이 먼저 읽고 전해 줘요.</p>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}

// 학생: 친구들이 내 글에 남긴 말(승인된 것만, 누가 썼는지 안 보임)
export function PeerInbox() {
  const [items, setItems] = useState(null);
  useEffect(() => { peerInbox().then((r) => setItems(r.items || []), () => setItems([])); }, []);
  if (!items?.length) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-pink-200 bg-pink-50 p-4">
      <p className="font-bold text-pink-900"><Emo n="MessageCircle" /> 친구들이 내 글에 남긴 말 {items.length}개</p>
      {items.slice(0, 20).map((n, i) => (
        <div key={i} className="rounded-xl bg-white p-3 text-sm">
          <p className="text-gray-500">«{n.topic}»</p>
          <p><Emo n="ThumbsUp" /> {n.praise}</p>
          <p><Emo n="HelpCircle" /> {n.question}</p>
        </div>
      ))}
    </div>
  );
}

// 교사: 글 하나를 친구들에게 보여주기(글 보기 창)
export function PeerShareToggle({ writing, shared, onChange }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await peerShare(writing.writingId, !shared);
      onChange?.(!shared);
    } catch (e) {
      alert(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" disabled={busy} onClick={toggle} className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${shared ? "border-pink-500 bg-pink-500 text-white" : "border-pink-300 bg-white text-pink-800"}`}>
      <Emo n="Users" /> {busy ? "바꾸는 중…" : shared ? "친구들에게 보여 주는 중(끄기)" : "친구들에게 보여 주기(이름 가림)"}
    </button>
  );
}

// 교사: 기다리는 말 승인·거절
export function PeerQueue({ classCode, onShared }) {
  const [data, setData] = useState(null);
  const load = () => peerPending(classCode).then((r) => { setData(r); onShared?.(new Set(r.shared || [])); }, () => setData({ items: [] }));
  useEffect(() => { load(); }, [classCode]);
  const [busyId, setBusyId] = useState(null);
  const decide = async (id, ok, createdAt) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await peerDecide(id, ok, createdAt);
      setData((d) => ({ ...d, items: d.items.filter((x) => x.id !== id) }));
    } catch (e) {
      alert(errText(e));
      load();
    } finally {
      setBusyId(null);
    }
  };
  if (!data) return null;
  return (
    <details className="rounded-xl border border-pink-200 bg-pink-50 p-4" open={data.items.length > 0}>
      <summary className="cursor-pointer font-bold text-pink-900"><Emo n="MessageCircle" /> 친구 칭찬·질문 승인 대기 {data.items.length}개 · 보여 주는 글 {data.shared?.length || 0}편</summary>
      <div className="mt-3 space-y-2">
        {!data.items.length && <p className="text-sm text-gray-600">기다리는 말이 없어요. 학생 글 보기 창에서 «친구들에게 보여 주기»를 누르면 친구들이 읽고 남길 수 있어요.</p>}
        {data.items.map((n) => (
          <div key={n.id} className="rounded-lg bg-white p-3 text-sm">
            <p className="text-gray-500">{n.from} → {n.to} · «{n.topic}»</p>
            <p><Emo n="ThumbsUp" /> {n.praise}</p>
            <p><Emo n="HelpCircle" /> {n.question}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={busyId === n.id} onClick={() => decide(n.id, true, n.at)} className="rounded-lg bg-emerald-600 px-3 py-1 font-semibold text-white">전하기</button>
              <button type="button" disabled={busyId === n.id} onClick={() => decide(n.id, false, n.at)} className="rounded-lg border border-gray-300 px-3 py-1 font-semibold text-gray-700">지우기</button>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
