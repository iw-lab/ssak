// 3-4 실시간 교실 현황 — 판정만(파이어베이스 없이 시험: scripts/test-practice.mjs)
export const GAP_MS = 120 * 1000;

// 지금 써야 하나
export function shouldBeat(prev, { topic, len, state }, now) {
  const key = `${topic}|${state}`;
  if (key !== prev.key) return true; // 주제·상태가 바뀌면 바로
  if (state !== "writing") return false;
  return len !== prev.len && now - prev.at >= GAP_MS;
}

// 한 학생의 지금 상태(시험용)
export function liveState(p, topic, now) {
  if (!p || p.topic !== topic) return { kind: "none", label: "안 열음" };
  if (p.state === "submitted") return { kind: "done", label: "제출함" };
  if (!p.at) return { kind: "writing", label: `쓰는 중 · ${p.len}자` }; // 서버 시각이 아직 안 붙은 방금 쓴 기록
  const min = Math.floor((now - p.at) / 60000);
  if (p.state === "left") return { kind: "idle", label: `나감 · ${p.len}자` };
  if (min < 4) return { kind: "writing", label: `쓰는 중 · ${p.len}자` };
  return { kind: "idle", label: `${min}분째 멈춤 · ${p.len}자` };
}
