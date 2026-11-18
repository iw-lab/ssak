// 로그인·가입·역할 선택 공통 틀 — A «새싹 벤토»(docs/DESIGN-BRIEF.md). 왼쪽 브랜드 판(큰 화면) + 오른쪽 폼 카드.
import React from "react";
import { Link } from "react-router-dom";
import { PenLine, ShieldCheck, Sprout } from "lucide-react";

export function SsakLogo({ size = 36, withWord = true, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="12" fill="hsl(var(--primary))" />
        <path d="M20 31V19" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M20 21c0-5 3.6-7.6 9-7.6 0 5-3.6 7.6-9 7.6z" fill="#fff" />
        <path d="M20 19c0-4.4-3.2-6.8-8-6.8 0 4.4 3.2 6.8 8 6.8z" fill="#DDF1E4" />
      </svg>
      {withWord && <span className="text-2xl font-black tracking-tight text-foreground">싹</span>}
    </span>
  );
}

const FEATURES = [
  { Icon: PenLine, title: "쓰면 바로 첨삭", body: "AI 선생님이 잘한 점과 고칠 점을 알려 줘요" },
  { Icon: Sprout, title: "글이 자라는 기록", body: "점수와 성장이 한눈에 보여요" },
  { Icon: ShieldCheck, title: "이름은 가려서", body: "이름·지역·학교는 ㅇㅇㅇ로 가린 뒤 보내요" },
];

export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-5 py-10 lg:grid-cols-[1.05fr_1fr] lg:px-10">
        <section className="hidden lg:block">
          <SsakLogo size={44} />
          <h1 className="mt-8 text-[44px] font-black leading-[1.15] tracking-tight text-foreground">
            글이 <span className="text-primary">쑥쑥</span> 자라는
            <br />
            우리 반 글쓰기 교실
          </h1>
          <p className="mt-4 max-w-md text-lg text-muted-foreground">초등학생 눈높이에 맞춘 AI 첨삭으로, 매일 조금씩 더 잘 쓰게 돼요.</p>
          <div className="mt-10 grid max-w-lg gap-3">
            {FEATURES.map(({ Icon, title: t, body }) => (
              <div key={t} className="bento-card flex items-center gap-4 p-4">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-primary"><Icon className="h-6 w-6" strokeWidth={2.2} /></span>
                <span>
                  <b className="block text-[17px] text-foreground">{t}</b>
                  <span className="text-[15px] text-muted-foreground">{body}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden"><SsakLogo size={44} /></div>
          <div className="bento-card p-7 sm:p-9">
            <h2 className="text-[28px] font-extrabold tracking-tight text-foreground">{title}</h2>
            {subtitle && <p className="mt-1.5 text-[16px] text-muted-foreground">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-[15px] text-muted-foreground">{footer}</div>}
          <p className="mt-8 text-center text-[13px] text-muted-foreground">
            © 2026 싹 · <Link to="/privacy" className="underline-offset-2 hover:underline">개인정보처리방침</Link> · <Link to="/terms" className="underline-offset-2 hover:underline">이용약관</Link>
          </p>
        </section>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[15px] font-bold text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[13px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <div role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[15px] font-medium text-red-700">{children}</div>;
}
