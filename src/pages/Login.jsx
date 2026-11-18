import { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { loginUser, loginWithPin } from "../services/authService";
import AuthShell, { Field, ErrorNote } from "../components/AuthShell";
import { toLoginEmail } from "../config/studentId";

// 학생은 «학급코드 + 번호 + 자기번호 4자리»(선생님이 준 반 주소로 오면 학급코드는 채워져 있다).
// 선생님·아이디가 있는 학생은 아이디/비밀번호 칸으로.
const CLASS_KEY = "ssak.classCode";
const MODE_KEY = "ssak.loginMode";
// 저장소가 꽉 찼거나 막혀 있어도 로그인은 끝까지 가야 한다(기억만 못 할 뿐)
const recall = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 기억 못 해도 괜찮다 */ } };
const onlyDigits = (v, n) => v.replace(/\D/g, "").slice(0, n);

export default function Login() {
  const [params] = useSearchParams();
  const linked = (params.get("class") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  const fromLink = linked.length >= 4 ? linked : ""; // 잘린 주소면 칸을 보여 직접 고치게
  // 선생님은 한 번 «아이디» 칸을 쓰면 다음에도 그 칸이 먼저(반 주소로 온 학생은 늘 자기번호 칸)
  const [mode, setMode] = useState(() => params.get("mode") === "id" ? "id" : fromLink ? "pin" : recall(MODE_KEY) === "id" ? "id" : "pin");
  const [classCode, setClassCode] = useState(() => fromLink || recall(CLASS_KEY) || "");
  const [number, setNumber] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const submit = (fn) => async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await fn();
      navigate("/");
    } catch (err) {
      setError(err.message || "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const pinSubmit = submit(async () => {
    const code = (fromLink || classCode).trim().toUpperCase(); // 반 주소가 바뀌면 화면에 보이는 그 코드로
    await loginWithPin(code, number, pin);
    store(MODE_KEY, "pin");
    store(CLASS_KEY, code); // 학급코드만 기억(번호·자기번호는 기억하지 않음 — 함께 쓰는 태블릿)
  });
  const idSubmit = submit(async () => {
    await loginUser(toLoginEmail(email), password);
    store(MODE_KEY, "id");
  });

  const tab = (m, label) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => { setMode(m); setError(""); }}
      className={`flex-1 rounded-xl py-2.5 text-[15px] font-bold transition ${mode === m ? "bg-white text-primary shadow" : "text-gray-600 hover:text-gray-800"}`}
    >
      {label}
    </button>
  );

  return (
    <AuthShell
      title="다시 만나서 반가워요"
      subtitle={mode === "pin" ? "번호와 자기번호를 넣어 주세요" : "아이디와 비밀번호를 넣어 주세요"}
      footer={<>처음 오셨나요? <Link to="/register" className="font-bold text-primary hover:underline">선생님 가입하기</Link></>}
    >
      <div role="tablist" className="mb-5 flex gap-1 rounded-2xl bg-gray-100 p-1">
        {tab("pin", "학생 · 자기번호")}
        {tab("id", "아이디 · 비밀번호")}
      </div>

      {mode === "pin" ? (
        <form onSubmit={pinSubmit} className="space-y-5">
          <ErrorNote>{error}</ErrorNote>
          {fromLink ? (
            <p className="rounded-xl bg-primary/10 px-4 py-3 text-[15px] font-bold text-primary">우리 반 코드 {fromLink}</p>
          ) : (
            <Field label="학급 코드">
              <input type="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} required maxLength={12} className="field uppercase tracking-widest" placeholder="선생님이 알려 준 6글자" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            </Field>
          )}
          <Field label="내 번호">
            <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" required className="field text-center text-2xl font-bold" placeholder="예: 7" value={number} onChange={(e) => setNumber(onlyDigits(e.target.value, 2))} />
          </Field>
          <Field label="자기번호 (숫자 4개)">
            <input type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" required minLength={4} maxLength={4} className="field text-center text-2xl tracking-[0.6em]" placeholder="••••" value={pin} onChange={(e) => setPin(onlyDigits(e.target.value, 4))} />
          </Field>
          <button type="submit" disabled={loading || pin.length !== 4 || !number || !classCode} className="btn-primary w-full text-[17px] disabled:opacity-60">
            {loading ? "들어가는 중…" : "들어가기"}
          </button>
          <p className="text-center text-sm text-gray-500">자기번호를 잊었으면 선생님께 새로 받아요.</p>
        </form>
      ) : (
        <form onSubmit={idSubmit} className="space-y-5">
          <ErrorNote>{error}</ErrorNote>
          <Field label="아이디 또는 이메일">
            <input type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" required className="field" placeholder="학생은 아이디, 선생님은 이메일" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="비밀번호">
            <input type="password" autoComplete="current-password" required className="field" placeholder="비밀번호를 입력하세요" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <button type="submit" disabled={loading} className="btn-primary w-full text-[17px] disabled:opacity-60">
            {loading ? "들어가는 중…" : "로그인"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
