import Emo from "../components/Emo.jsx";
import { Link } from "react-router-dom";

/**
 * 개인정보처리방침 페이지
 * 교육기관 기준 준수
 */
export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700"
          >
            <span className="text-2xl"><Emo n="Sprout" /></span>
            <span className="font-bold">ISW 글쓰기 도우미</span>
          </Link>
          <Link
            to="/login"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            로그인
          </Link>
        </div>
      </header>

      {/* 본문 */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            개인정보처리방침
          </h1>
          <p className="text-gray-500 mb-8">
            시행일: 2026년 1월 1일 | 최종 수정: 2026년 11월 22일(가림 명단 — 담임이 넣는 반 학생 이름 항목 추가)
          </p>

          <div className="prose prose-emerald max-w-none">
            {/* 제1조 */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                제1조 (목적)
              </h2>
              <p className="text-gray-700 leading-relaxed">
                ISW 글쓰기 도우미(이하 "서비스")는 학생들의 글쓰기 학습을 돕기
                위해 개인정보를 처리하며, 「개인정보 보호법」 제30조에 따라
                정보주체의 개인정보를 보호하고 이와 관련한 고충을 신속하고
                원활하게 처리할 수 있도록 하기 위하여 다음과 같이 개인정보
                처리방침을 수립·공개합니다.
              </p>
            </section>

            {/* 제2조 */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                제2조 (수집하는 개인정보)
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-200 text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-4 py-2 text-left">
                        구분
                      </th>
                      <th className="border border-gray-200 px-4 py-2 text-left">
                        수집 항목
                      </th>
                      <th className="border border-gray-200 px-4 py-2 text-left">
                        수집 목적
                      </th>
                      <th className="border border-gray-200 px-4 py-2 text-left">
                        보유 기간
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-gray-200 px-4 py-2 font-medium">
                        학생
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        학생 번호 이름(예: 학생01)·별명, 학년, 학급, 로그인 아이디(학급코드+번호 — 교사가 일괄 생성, 학생 연락처·학교명은 받지 않음), 자기번호(숫자 4자리 — 되돌릴 수 없는 값으로 바꿔 저장하고 틀린 횟수만 셈), 가림 명단(담임이 고르면 넣는 반 학생 이름 — 글 속 이름을 가리는 데에만 쓰고 번호·계정과 잇지 않으며 서울 서버에만 둠, 국외로 보내지 않음)
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        회원 식별, 학습 관리
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        학년도 끝(매년 3월 1일 자동 삭제)
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-4 py-2 font-medium">
                        교사
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        이메일(로그인용), 담당 학급, 학생에게 보일 이름(선택)
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        회원 식별, 학급 관리
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        탈퇴 시까지
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-4 py-2 font-medium">
                        학습 데이터
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        작성 글, 평가 결과, 수정 이력, 쓰는 과정 숫자(쓴 시간·입력 횟수), 쓰는 중 현황(주제·글자 수·시각), 친구에게 남긴 칭찬·질문
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        글쓰기 평가, 성장 추적, 담임의 수업 지도(현황·과정은 담임만 봄), 반 안 친구 글 읽기(담임이 고른 글만, 이름을 가린 사본 · 남긴 말은 담임 확인 뒤 이름 없이 전달)
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        학년도 끝(매년 3월 1일 자동 삭제)
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-200 px-4 py-2 font-medium">
                        자동 수집
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        접속 IP, 브라우저 정보, 접속 시간
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        서비스 개선, 보안
                      </td>
                      <td className="border border-gray-200 px-4 py-2">
                        3개월
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 제3조 */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                제3조 (AI 처리 및 개인정보 국외 이전)
              </h2>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <p className="font-medium text-amber-800">
                  <Emo n="AlertTriangle" /> AI 평가를 위한 데이터 국외 이전 안내
                </p>
              </div>
              <p className="text-gray-700 leading-relaxed mb-4">
                서비스 제공을 위해 아래 두 곳에 처리를 맡기며, 그 과정에서 일부 정보가 국외에서 처리됩니다. 이는 정보주체와의 계약(서비스 이용)
                이행에 필요한 처리위탁이므로, 이 방침에 아래 사항을 공개하는 것으로 별도 동의를 갈음합니다(개인정보 보호법 제28조의8제1항제3호가목). 학생 글은 보내기 전에
                이름·지역·주소·학교·전화번호 등을 «ㅇㅇㅇ»로 가리고, 학생이 제출 전 미리보기에서 더 가릴 수 있습니다.
              </p>
              <h3 className="font-bold text-gray-900 mt-4 mb-2">① AI 첨삭 — Anthropic</h3>
              <ul className="list-disc ml-6 text-gray-700 space-y-2">
                <li><strong>이전 항목:</strong> 가린 뒤의 글 내용, 글 주제, 학년(학생 이름·아이디·이메일은 보내지 않음)</li>
                <li><strong>이전 국가·시기·방법:</strong> 미국 / 학생이 글을 제출하거나 글쓰기 도움을 누를 때마다 / HTTPS 암호화 통신(API)</li>
                <li><strong>이전받는 자·연락처:</strong> Anthropic, PBC (548 Market St, PMB 90375, San Francisco, CA 94104, USA) · privacy@anthropic.com
                  · 국내대리인 앤트로픽코리아 유한회사(서울 강남구 테헤란로 152, 41층) anthropic_privacy@kimchang.com</li>
                <li><strong>이용 목적·보유 기간:</strong> 글쓰기 첨삭 생성 / 받은 날부터 30일 안에 삭제(이용정책 위반 의심 글은 최대 2년, 법령상 보존 예외).
                  API로 보낸 글은 기본적으로 AI 학습에 쓰지 않습니다.</li>
              </ul>
              <h3 className="font-bold text-gray-900 mt-4 mb-2">② 로그인·서비스 운영 — Google (Firebase)</h3>
              <ul className="list-disc ml-6 text-gray-700 space-y-2">
                <li><strong>이전 항목:</strong> 로그인 아이디(이메일 형식)·암호화된 비밀번호(Firebase Authentication), 접속 IP(Firebase Hosting, 부정 이용 탐지), 서버 기록(사용자 번호·처리 결과)</li>
                <li><strong>이전 국가·시기·방법:</strong> 미국 등 Google 데이터센터 / 가입·로그인·접속할 때 / HTTPS 암호화 통신</li>
                <li><strong>이전받는 자·연락처:</strong> Google LLC (1600 Amphitheatre Parkway, Mountain View, CA 94043, USA) · firebase.google.com/support/privacy</li>
                <li><strong>이용 목적·보유 기간:</strong> 로그인, 웹사이트 제공, 오류 확인 / 계정 삭제 시까지(접속 IP는 수개월)</li>
                <li><strong>학생 글 원본 저장 위치:</strong> 대한민국(서울) 리전 — 글·점수·첨삭 결과는 국외로 옮겨 저장하지 않습니다.</li>
              </ul>
              <h3 className="font-bold text-gray-900 mt-4 mb-2">③ 거부 방법·절차·거부할 때</h3>
              <ul className="list-disc ml-6 text-gray-700 space-y-2">
                <li>가정통신문(개인정보 수집·이용 동의서)에서 «동의하지 않음»을 고르거나, 언제든 담임 선생님께 말씀하시면 됩니다. 국외 처리를 원하지 않으시면 이 방법으로 서비스 이용 자체를 거부하실 수 있습니다.</li>
                <li>동의하지 않으면 그 학생의 계정을 만들지 않으며, 이미 만든 계정은 글과 함께 바로 삭제합니다.</li>
                <li>동의하지 않아도 불이익은 없습니다. 수업 활동은 종이 글쓰기 등 다른 방법으로 함께합니다.</li>
              </ul>
              <h3 className="font-bold text-gray-900 mt-4 mb-2">④ 처리 위탁</h3>
              <ul className="list-disc ml-6 text-gray-700 space-y-2">
                <li>Google LLC(Google Cloud·Firebase): 데이터 저장(서울 리전), 서버 기능 실행(서울 리전), 로그인, 웹사이트 제공</li>
                <li>Anthropic, PBC: AI 글쓰기 첨삭 생성</li>
              </ul>
            </section>

            {/* 제4조 */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                제4조 (개인정보 보호 조치)
              </h2>
              <ul className="list-disc ml-6 text-gray-700 space-y-2">
                <li>
                  <strong>기술적 조치:</strong> 저장 데이터 암호화(Google Cloud 기본 암호화),
                  HTTPS 통신 암호화, 접근 권한 규칙(담임은 자기 반만 — 다른 반·다른 학교 접근 차단을 공격 시험으로 확인)
                </li>
                <li>
                  <strong>관리적 조치:</strong> 개인정보 취급자 최소화, 접근
                  권한 관리
                </li>
                <li>
                  <strong>접근 제한:</strong> 학생 정보는 해당 학급 담당 교사와
                  관리자만 열람 가능
                </li>
                <li>
                  <strong>비밀번호:</strong> 일방향 암호화(Hash) 저장, 학생 첫 비밀번호는 학생마다 무작위
                </li>
              </ul>
            </section>

            {/* 제5조 */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                제5조 (정보주체의 권리)
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                정보주체(학생, 학부모, 교사)는 다음과 같은 권리를 행사할 수
                있습니다.
              </p>
              <ul className="list-disc ml-6 text-gray-700 space-y-2">
                <li>
                  <strong>열람 요구:</strong> 본인의 개인정보 처리 현황 열람
                </li>
                <li>
                  <strong>정정 요구:</strong> 잘못된 개인정보의 정정 요청
                </li>
                <li>
                  <strong>삭제 요구:</strong> 개인정보 삭제 요청 (단, 법령에
                  따른 보존 기간 중에는 삭제 불가)
                </li>
                <li>
                  <strong>처리정지 요구:</strong> 개인정보 처리 정지 요청
                </li>
                <li>
                  <strong>동의 철회:</strong> 개인정보 처리에 대한 동의 철회
                </li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                권리 행사는 서면, 이메일을 통해 요청할 수 있으며, 요청일로부터
                10일 이내에 처리합니다.
              </p>
            </section>

            {/* 제6조 */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                제6조 (아동의 개인정보)
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                개인정보보호법 제22조에 따라 만 14세 미만 아동의 개인정보
                수집·이용 시 법정대리인(학부모)의 동의를 받습니다.
              </p>
              <ul className="list-disc ml-6 text-gray-700 space-y-2">
                <li>
                  담당 교사가 가정통신문(개인정보 수집·이용 동의서)을 배부하고,
                  법정대리인의 서명을 회수한 후 학생 계정을 생성합니다.
                </li>
                <li>
                  법정대리인은 언제든지 동의를 철회할 수 있으며, 철회 시 해당
                  학생의 계정 및 데이터가 즉시 삭제됩니다.
                </li>
                <li>
                  동의하지 않는 학생은 해당 서비스를 이용할 수 없으며, 이로 인한
                  학습상의 불이익은 없습니다.
                </li>
              </ul>
            </section>

            {/* 제7조 */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                제7조 (개인정보 파기)
              </h2>
              <ul className="list-disc ml-6 text-gray-700 space-y-2">
                <li>보유 기간 경과 시 지체 없이 파기</li>
                <li>전자적 파일: 복구 불가능한 방법으로 영구 삭제</li>
                <li>종이 문서: 분쇄 또는 소각</li>
                <li>매년 3월 1일(학년도가 끝나면) 모든 학급·학생 계정·글·과제를 자동 삭제</li>
              </ul>
            </section>

            {/* 제8조 */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                제8조 (개인정보 보호책임자)
              </h2>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700">
                  <strong>개인정보 보호책임자(담당 부서):</strong> «싹» 운영팀 — 개인정보 보호·고충 처리 담당
                </p>
                <p className="text-gray-700">
                  <strong>이메일:</strong> simssijjang@gmail.com
                </p>
                <p className="text-gray-700">
                  <strong>문의 시간:</strong> 평일 09:00 - 18:00
                </p>
              </div>
            </section>

            {/* 제9조 */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                제9조 (권익침해 구제방법)
              </h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                개인정보침해로 인한 구제를 받기 위해 다음 기관에 상담을 신청할
                수 있습니다.
              </p>
              <ul className="list-disc ml-6 text-gray-700 space-y-2">
                <li>개인정보침해신고센터: (국번없이) 118</li>
                <li>개인정보분쟁조정위원회: 1833-6972</li>
                <li>대검찰청 사이버수사과: (국번없이) 1301</li>
                <li>경찰청 사이버안전국: (국번없이) 182</li>
              </ul>
            </section>

            {/* 제10조 */}
            <section className="mb-8">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-2 mb-4">
                제10조 (방침의 변경)
              </h2>
              <p className="text-gray-700 leading-relaxed">
                이 개인정보처리방침은 법령, 정책 또는 서비스 변경에 따라 수정될
                수 있으며, 변경 시 최소 7일 전에 공지사항을 통해 안내합니다.
              </p>
            </section>
          </div>

          {/* 하단 버튼 */}
          <div className="mt-8 pt-6 border-t flex justify-center gap-4">
            <Link
              to="/terms"
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              이용약관
            </Link>
            <Link
              to="/login"
              className="px-6 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
            >
              로그인
            </Link>
          </div>
        </div>
      </main>

      {/* 푸터 */}
      <footer className="bg-gray-800 text-gray-400 py-8 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm">
          <p>© 2026 ISW 글쓰기 도우미. All rights reserved.</p>
          <div className="mt-2 space-x-4">
            <Link to="/privacy" className="hover:text-white">
              개인정보처리방침
            </Link>
            <Link to="/terms" className="hover:text-white">
              이용약관
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
