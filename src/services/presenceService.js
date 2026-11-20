// 3-4 실시간 교실 현황 — 학생은 «주제·글자 수·시각·상태»만 presence/{uid} 에 쓴다(글 내용 없음).
//   비용: 글자가 바뀌어도 2분에 한 번만 쓴다(30명 40분 ≈ 600회). 담임은 패널을 열었을 때만 듣고 20분 뒤 저절로 끊는다.
import { doc, setDoc, serverTimestamp, collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { shouldBeat, liveState } from "../utils/presence";
export { liveState };

const lastByUid = new Map(); // 공용 기기에서 학생이 바뀌어도 앞 학생 기록이 첫 쓰기를 삼키지 않게

export async function beat(uid, classCode, topic, len, state = "writing") {
  if (!uid || !classCode || !topic) return;
  const now = Date.now();
  const next = { topic: String(topic).slice(0, 200), len: Math.max(0, Math.min(20000, len | 0)), state };
  const last = lastByUid.get(uid) || { key: "", at: 0, len: -1 };
  if (!shouldBeat(last, next, now)) return;
  lastByUid.set(uid, { key: `${next.topic}|${state}`, at: now, len: next.len }); // 보내는 동안 겹쳐 보내지 않게
  try {
    await setDoc(doc(db, "presence", uid), { classCode, ...next, at: serverTimestamp() });
  } catch {
    lastByUid.set(uid, last); // 실패하면 되돌려 다음 입력 때 다시
    /* 현황은 덤 — 실패해도 글쓰기는 계속 */
  }
}

// 담임: 반 전체 현황 듣기 → 돌려준 함수로 끊는다
export function watchPresence(classCode, onChange) {
  const q = query(collection(db, "presence"), where("classCode", "==", classCode));
  return onSnapshot(q, (snap) => {
    const m = {};
    snap.forEach((d) => {
      const v = d.data();
      m[d.id] = { ...v, at: v.at?.toMillis ? v.at.toMillis() : 0 };
    });
    onChange(m);
  }, () => onChange(null));
}

