import Emo from "./components/Emo.jsx";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useState, useEffect, lazy, Suspense } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./config/firebase";
import { getUserData, updateUserData } from "./services/authService";
import { ROLES, SUPER_ADMIN_UID } from "./config/auth";
import PrivacyConsent from "./components/PrivacyConsent";
import ErrorBoundary from "./components/ErrorBoundary";

// Lazy Loading - 대시보드는 필요할 때만 로드 (초기 로딩 속도 향상)
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const RoleSelection = lazy(() => import("./pages/RoleSelection"));
const SuperAdminDashboard = lazy(() => import("./pages/SuperAdminDashboard"));
const TeacherDashboard = lazy(() => import("./pages/TeacherDashboard"));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Terms = lazy(() => import("./pages/Terms"));
const ConsentLetter = lazy(() => import("./pages/ConsentLetter"));
const Landing = lazy(() => import("./pages/Landing"));

// 로딩 컴포넌트 (Suspense fallback)
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-emerald-50">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
      <p className="text-gray-600 font-medium">페이지 로딩 중...</p>
    </div>
  </div>
);

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPrivacyConsent, setShowPrivacyConsent] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          let data = await getUserData(user.uid);

          // 슈퍼 관리자 자동 설정
          if (user.uid === SUPER_ADMIN_UID) {
            data = { ...data, role: ROLES.SUPER_ADMIN, approved: true };
          }

          setUserData(data);

          // 개인정보 동의 여부 확인 (학생/선생님 대상, 슈퍼관리자 제외)
          if (data && !data.privacyAgreed && user.uid !== SUPER_ADMIN_UID) {
            setShowPrivacyConsent(true);
          } else {
            setShowPrivacyConsent(false);
          }
        } catch (error) {
          console.error("사용자 정보 로드 에러:", error);
        }
      } else {
        setCurrentUser(null);
        setUserData(null);
        setShowPrivacyConsent(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 개인정보 동의 처리
  const handlePrivacyConsent = async (consentData) => {
    try {
      await updateUserData(currentUser.uid, {
        privacyAgreed: consentData.privacyAgreed,
        aiProcessingAgreed: consentData.aiProcessingAgreed,
        marketingAgreed: consentData.marketingAgreed || false,
        privacyConsentAt: consentData.agreedAt,
      });
      setUserData((prev) => ({
        ...prev,
        privacyAgreed: true,
        aiProcessingAgreed: true,
        privacyConsentAt: consentData.agreedAt,
      }));
      setShowPrivacyConsent(false);
    } catch (error) {
      console.error("동의 저장 에러:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-xl font-semibold text-gray-700">로딩 중...</div>
      </div>
    );
  }

  // 로그인된 상태에서 동의가 필요하면 동의 팝업 표시
  if (showPrivacyConsent && currentUser) {
    return (
      <PrivacyConsent
        onConsent={handlePrivacyConsent}
        userName={userData?.name || userData?.nickname || ""}
      />
    );
  }

  return (
    <Router>
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route
              path="/"
              element={
                currentUser ? (
                  userData?.role === ROLES.SUPER_ADMIN ? (
                    <Navigate to="/super-admin" replace />
                  ) : userData?.role === ROLES.TEACHER ? (
                    userData?.approved ? (
                      <Navigate to="/teacher" replace />
                    ) : userData?.rejected ? (
                      // 거절된 선생님
                      <div className="min-h-screen flex items-center justify-center bg-gray-100">
                        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
                          <div className="text-6xl mb-4"><Emo n="Frown" /></div>
                          <h2 className="text-2xl font-bold mb-4 text-red-600">
                            가입 요청이 거절되었습니다
                          </h2>
                          <p className="text-gray-600 mb-2">
                            관리자가 선생님 계정 가입 요청을 거절하였습니다.
                          </p>
                          {userData?.rejectedReason && (
                            <p className="text-gray-500 mb-4 bg-gray-100 p-3 rounded">
                              사유: {userData.rejectedReason}
                            </p>
                          )}
                          <p className="text-sm text-gray-400 mb-4">
                            문의: 관리자에게 연락해주세요.
                          </p>
                          <button
                            onClick={() => auth.signOut()}
                            className="bg-red-500 text-white px-6 py-2 rounded hover:bg-red-600"
                          >
                            로그아웃
                          </button>
                        </div>
                      </div>
                    ) : (
                      // 승인 대기 중
                      <div className="min-h-screen flex items-center justify-center bg-gray-100">
                        <div className="bg-white p-8 rounded-lg shadow-md max-w-md text-center">
                          <div className="text-6xl mb-4"><Emo n="Hourglass" /></div>
                          <h2 className="text-2xl font-bold mb-4 text-gray-800">
                            승인 대기 중
                          </h2>
                          <p className="text-gray-600 mb-4">
                            계정이 아직 승인되지 않았습니다.
                            <br />
                            관리자의 승인을 기다려주세요.
                          </p>
                          <button
                            onClick={() => auth.signOut()}
                            className="bg-red-500 text-white px-6 py-2 rounded hover:bg-red-600"
                          >
                            로그아웃
                          </button>
                        </div>
                      </div>
                    )
                  ) : userData?.role === ROLES.STUDENT ? (
                    <Navigate to="/student" replace />
                  ) : (
                    <Navigate to="/role-selection" replace />
                  )
                ) : (
                  <Navigate to="/login" replace />
                )
              }
            />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/role-selection" element={<RoleSelection />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/consent-letter" element={<ConsentLetter />} />
            <Route path="/landing" element={<Landing />} />
            <Route
              path="/super-admin"
              element={
                currentUser && userData?.role === ROLES.SUPER_ADMIN ? (
                  <SuperAdminDashboard user={currentUser} userData={userData} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/teacher"
              element={
                currentUser &&
                userData?.role === ROLES.TEACHER &&
                userData?.approved ? (
                  <TeacherDashboard user={currentUser} userData={userData} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="/student"
              element={
                currentUser && userData?.role === ROLES.STUDENT ? (
                  <StudentDashboard user={currentUser} userData={userData} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route
              path="*"
              element={
                <div className="min-h-screen flex items-center justify-center bg-emerald-50">
                  <div className="text-center p-8">
                    <div className="text-8xl mb-4"><Emo n="Sprout" /></div>
                    <h1 className="text-4xl font-bold text-gray-800 mb-2">
                      404
                    </h1>
                    <p className="text-gray-500 mb-6">
                      페이지를 찾을 수 없습니다
                    </p>
                    <a
                      href="/"
                      className="inline-block px-6 py-3 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-600 transition-colors"
                    >
                      홈으로 돌아가기
                    </a>
                  </div>
                </div>
              }
            />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Router>
  );
}

export default App;
