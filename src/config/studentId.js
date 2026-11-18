// 학생 로그인 아이디 도메인(메일 서버 없음) — functions/index.js STUDENT_EMAIL_DOMAIN 과 같아야 한다
export const STUDENT_EMAIL_DOMAIN = "isw-writing.web.app";
// 학생은 짧은 아이디(예: ab3k9z07)만 쳐도 된다 — @ 가 없으면 학생 도메인을 붙인다
export const toLoginEmail = (id) => { const t = String(id).trim().toLowerCase(); return t.includes("@") ? t : `${t}@${STUDENT_EMAIL_DOMAIN}`; };
