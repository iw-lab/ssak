// 가정통신문 — 개인정보 수집·이용 동의서 + 국외 처리위탁 안내(인쇄용). 2026-11-18 개인정보 전수 점검.
//   근거: 개인정보 보호법 제15조제2항(알릴 사항)·제22조의2(만 14세 미만 법정대리인 동의).
//   2026-11-20 사용자 «국외에 안 넘기는데 국외이전 동의도 받아야 해?» → AI 첨삭(Anthropic)·로그인(Firebase Auth)은
//   서비스 제공을 위한 «처리위탁»이라 제28조의8제1항제3호가목(처리방침에 제2항 사항 공개)으로 별도 동의 없이 된다.
//   그래서 국외 칸은 동의가 아니라 «안내»다. 내용은 개인정보처리방침 제3조와 같아야 한다.
import { Link } from "react-router-dom";
import { useState } from "react";

const Row = ({ k, children }) => (
  <tr>
    <th className="w-36 border border-gray-400 bg-gray-50 px-3 py-2 text-left align-top font-bold">{k}</th>
    <td className="border border-gray-400 px-3 py-2 align-top">{children}</td>
  </tr>
);
const Check = ({ label }) => (
  <p className="mt-2 font-bold">
    {label} &nbsp; □ 동의함 &nbsp;&nbsp; □ 동의하지 않음
  </p>
);

export default function ConsentLetter() {
  const [school, setSchool] = useState("");
  const [teacher, setTeacher] = useState("");
  return (
    <div className="min-h-screen bg-white text-[14px] leading-relaxed text-gray-900">
      <div className="mx-auto max-w-3xl px-6 py-6 print:hidden">
        <Link to="/" className="font-bold text-primary">← 싹으로</Link>
        <p className="mt-3 text-gray-600">학교 이름과 담임 이름을 적고 인쇄하세요(아래 칸은 인쇄에 나오지 않습니다). 회수한 동의서는 학교에 보관하세요.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input className="field max-w-[14rem]" placeholder="학교 이름" value={school} onChange={(e) => setSchool(e.target.value)} />
          <input className="field max-w-[14rem]" placeholder="담임 선생님 이름" value={teacher} onChange={(e) => setTeacher(e.target.value)} />
          <button type="button" className="btn-primary" onClick={() => window.print()}>인쇄하기</button>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-6 pb-10">
        <h1 className="text-center text-2xl font-black">AI 글쓰기 첨삭 «싹» 이용을 위한 개인정보 수집·이용 동의서</h1>
        <p className="mt-4">
          보호자님께. 우리 반은 글쓰기 수업에서 AI 첨삭 웹사이트 «싹»(isw-writing.web.app)을 쓰려고 합니다. 만 14세 미만 학생의 개인정보를
          처리하려면 보호자님의 동의가 필요하여(개인정보 보호법 제22조의2) 아래 내용을 알려 드립니다. 동의하지 않으셔도 불이익은 없으며,
          그 학생은 종이 글쓰기 등 다른 방법으로 같은 수업에 참여합니다.
        </p>

        <h2 className="mt-6 text-lg font-black">1. 개인정보 수집·이용</h2>
        <table className="mt-2 w-full border-collapse">
          <tbody>
            <Row k="수집 항목">학생 번호 이름(예: 학생01)·별명, 학년·반, 로그인 아이디(담임이 만들어 줌), 학생이 쓴 글과 점수·첨삭 결과. <b>학생의 주민번호·연락처·학교명은 받지 않습니다.</b> 담임 선생님이 반 학생 이름을 «가림 명단»에 넣을 수 있습니다 — 학생 글 속 친구 이름을 가리는 데에만 쓰고, 번호·계정과 잇지 않으며, 국외(AI 회사)로 보내지 않습니다.</Row>
            <Row k="이용 목적">글쓰기 첨삭과 성장 기록, 담임 선생님의 학습 지도</Row>
            <Row k="보유 기간">학년도가 끝나면(매년 3월 1일) 계정·글 모두 자동 삭제. 동의를 철회하면 바로 삭제</Row>
            <Row k="저장 위치">대한민국(서울) Google Cloud 데이터센터. 담임 선생님과 서비스 관리자만 볼 수 있습니다.</Row>
            <Row k="거부할 권리">동의하지 않을 수 있으며, 그래도 불이익은 없습니다(계정을 만들지 않습니다).</Row>
          </tbody>
        </table>
        <Check label="위 개인정보 수집·이용에" />

        <h2 className="mt-8 text-lg font-black">2. 국외 처리위탁 안내(따로 동의하지 않으셔도 됩니다)</h2>
        <p className="mt-1">AI 첨삭과 로그인은 아래 회사에 맡겨 처리하며, 그 과정에서 일부 정보가 국외에서 처리됩니다. 서비스 제공을 위한 처리위탁이라
          개인정보처리방침에 공개하는 것으로 갈음합니다(개인정보 보호법 제28조의8제1항제3호). 글·점수·첨삭 결과는 서울에만 저장됩니다.
          학생 글은 보내기 전에 <b>이름·지역·주소·학교·전화번호 등을 «ㅇㅇㅇ»로 자동으로 가리고</b>, 학생이 보내기 전 화면에서 직접 더 가릴 수 있습니다.</p>
        <table className="mt-2 w-full border-collapse">
          <tbody>
            <Row k="이전받는 자 (연락처)">
              ① Anthropic, PBC — 미국 (privacy@anthropic.com · 국내대리인 앤트로픽코리아 유한회사 anthropic_privacy@kimchang.com)<br />
              ② Google LLC — 미국 등 (firebase.google.com/support/privacy)
            </Row>
            <Row k="이전 항목">① 가린 뒤의 글 내용·주제·학년(이름·아이디는 보내지 않음) &nbsp; ② 로그인 아이디·암호화된 비밀번호, 접속 IP</Row>
            <Row k="이전 시기·방법">① 글을 제출하거나 도움을 누를 때마다 ② 가입·로그인·접속할 때 — 모두 암호화 통신(HTTPS)</Row>
            <Row k="이용 목적·보유 기간">① AI 첨삭 생성, 받은 날부터 30일 안에 삭제(이용정책 위반 의심 글은 최대 2년), AI 학습에 쓰지 않음 &nbsp; ② 로그인·웹사이트 제공, 계정 삭제 때까지</Row>
            <Row k="원하지 않으시면">위 1번에서 «동의하지 않음»을 고르시거나 언제든 담임에게 알리시면 «싹» 계정을 만들지 않습니다(이미 있으면 글과 함께 삭제). 불이익은 없습니다.</Row>
          </tbody>
        </table>

        <p className="mt-6 text-[13px] text-gray-700">
          자세한 내용은 «싹» 개인정보처리방침(isw-writing.web.app/privacy)에 있습니다. 동의는 언제든 담임 선생님께 말씀하셔서 철회할 수 있습니다.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-6 text-[15px]">
          <p>학생: {school || "________"} 학교 ____학년 ____반 ____번 이름 ____________</p>
          <p>보호자(법정대리인): ____________ (서명) 관계: ______</p>
        </div>
        <p className="mt-6 text-right text-[15px]">20____년 ____월 ____일</p>
        <p className="mt-6 text-center text-[15px] font-bold">{school || "________"} 학교 담임 {teacher || "________"} 드림</p>
      </main>
    </div>
  );
}
