import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { registerUser } from "../services/authService";
import { ROLES } from "../config/auth";
import AuthShell, { Field, ErrorNote } from "../components/AuthShell";

export default function Register() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    role: ROLES.TEACHER // 기본값을 선생님으로 설정
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    if (formData.password.length < 6) {
      setError("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    if (!formData.role) {
      setError("역할을 선택해 주세요.");
      return;
    }

    setLoading(true);

    try {
      await registerUser(formData.email, formData.password, formData.role, {
        ...(formData.name.trim() ? { name: formData.name.trim() } : {})
      });

      if (formData.role === ROLES.TEACHER) {
        alert("회원가입이 완료되었습니다. 관리자의 승인 후 이용 가능합니다.");
      } else {
        alert("회원가입이 완료되었습니다.");
      }

      navigate("/login");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("이미 사용 중인 이메일입니다.");
      } else {
        setError(err.message || "회원가입에 실패했습니다.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="선생님 가입"
      subtitle="학급을 만들고 학생 글을 함께 키워요"
      footer={<>이미 계정이 있나요? <Link to="/login" className="font-bold text-primary hover:underline">로그인</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <ErrorNote>{error}</ErrorNote>
        <Field label="학생에게 보일 이름" hint="선택 · 비우면 «선생님»">
          <input name="name" type="text" maxLength={20} className="field" placeholder="예: 김선생님" value={formData.name} onChange={handleChange} />
        </Field>
        <Field label="이메일">
          <input name="email" type="email" autoComplete="username" required className="field" placeholder="이메일을 입력하세요" value={formData.email} onChange={handleChange} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="비밀번호" hint="6자 이상">
            <input name="password" type="password" autoComplete="new-password" required className="field" placeholder="비밀번호" value={formData.password} onChange={handleChange} />
          </Field>
          <Field label="비밀번호 확인">
            <input name="confirmPassword" type="password" autoComplete="new-password" required className="field" placeholder="한 번 더" value={formData.confirmPassword} onChange={handleChange} />
          </Field>
        </div>
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900">선생님 계정은 관리자 승인 뒤에 쓸 수 있어요.</p>
        <button type="submit" disabled={loading} className="btn-primary w-full text-[17px] disabled:opacity-60">
          {loading ? "가입하는 중…" : "가입하기"}
        </button>
      </form>
    </AuthShell>
  );
}
