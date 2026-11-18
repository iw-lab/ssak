import AuthShell from "../components/AuthShell";
import Emo from "../components/Emo.jsx";
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { updateUserData, getUserData } from '../services/authService';
import { auth } from '../config/firebase';
import { ROLES } from '../config/auth';

export default function RoleSelection() {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  // 페이지 로드 시 기존 역할 확인
  useEffect(() => {
    const checkExistingRole = async () => {
      try {
        if (auth.currentUser) {
          const existingData = await getUserData(auth.currentUser.uid);
          // 이미 학생이면 학생 페이지로 이동
          if (existingData?.role === ROLES.STUDENT) {
            alert('이미 학생 계정이 있습니다. 학생 페이지로 이동합니다.');
            navigate('/student');
            return;
          }
          // 이미 선생님이면 홈으로 이동
          if (existingData?.role === ROLES.TEACHER) {
            navigate('/');
            return;
          }
        }
      } catch (error) {
        console.error('역할 확인 에러:', error);
      } finally {
        setChecking(false);
      }
    };
    checkExistingRole();
  }, [navigate]);

  // 선생님으로 바로 가입 (학생은 교사가 일괄 생성)
  const handleTeacherSignup = async () => {
    setLoading(true);

    try {
      // 다시 한번 기존 역할 확인 (동시 요청 방지)
      const existingData = await getUserData(auth.currentUser.uid);
      if (existingData?.role === ROLES.STUDENT) {
        alert('이미 학생 계정이 있습니다. 선생님으로 변경할 수 없습니다.');
        navigate('/student');
        return;
      }

      await updateUserData(auth.currentUser.uid, {
        role: ROLES.TEACHER,
        gradeLevel: null,
        approved: false // 관리자 승인 필요
      });

      navigate('/');
    } catch (error) {
      console.error('역할 설정 에러:', error);
      alert('역할 설정에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-lg font-semibold text-muted-foreground">확인하는 중…</div>
      </div>
    );
  }

  return (
    <AuthShell title="선생님 가입" subtitle="학생 계정은 선생님이 한 번에 만들어 드려요">
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-primary"><Emo n="GraduationCap" className="h-6 w-6" /></span>
            <b className="text-[17px] text-emerald-900">선생님으로 시작하기</b>
          </div>
          <ul className="mt-4 space-y-2 text-[15px] text-emerald-900">
            <li className="flex gap-2"><Emo n="Check" className="mt-1 text-primary" /> 학급 만들기와 학생 계정 한 번에 만들기</li>
            <li className="flex gap-2"><Emo n="Check" className="mt-1 text-primary" /> 글쓰기 과제 내기·자동 출제</li>
            <li className="flex gap-2"><Emo n="Check" className="mt-1 text-primary" /> 학생 글 AI 첨삭 결과 보기</li>
          </ul>
        </div>
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-900">선생님 계정은 관리자 승인 뒤에 모든 기능을 쓸 수 있어요.</p>
        <p className="rounded-2xl bg-muted px-4 py-3 text-[14px] text-muted-foreground"><b className="text-foreground">학생인가요?</b> 담임 선생님께 계정을 받아 로그인하세요.</p>
        <button onClick={handleTeacherSignup} disabled={loading} className="btn-primary w-full text-[17px] disabled:opacity-60">
          {loading ? "설정하는 중…" : "선생님으로 가입하기"}
        </button>
      </div>
    </AuthShell>
  );
}
