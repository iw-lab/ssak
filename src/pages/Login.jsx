import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginUser } from "../services/authService";
import AuthShell, { Field, ErrorNote } from "../components/AuthShell";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await loginUser(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message || "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="다시 만나서 반가워요"
      subtitle="아이디와 비밀번호를 넣어 주세요"
      footer={<>처음 오셨나요? <Link to="/register" className="font-bold text-primary hover:underline">선생님 가입하기</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <ErrorNote>{error}</ErrorNote>
        <Field label="이메일">
          <input type="email" autoComplete="username" required className="field" placeholder="이메일을 입력하세요" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="비밀번호">
          <input type="password" autoComplete="current-password" required className="field" placeholder="비밀번호를 입력하세요" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button type="submit" disabled={loading} className="btn-primary w-full text-[17px] disabled:opacity-60">
          {loading ? "들어가는 중…" : "로그인"}
        </button>
      </form>
    </AuthShell>
  );
}
