import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db, functions } from '../config/firebase';
import { SUPER_ADMIN_UID, ROLES } from '../config/auth';
import { CacheManager, DEFAULT_TTL, LS_PREFIX, clearLocalStorageByPrefix } from '../utils/cacheUtils';

// ============================================
// 캐시 관리자 - 공통 유틸리티 사용
// ============================================
const userCache = new CacheManager(LS_PREFIX.USER, DEFAULT_TTL.USER_DATA);

/**
 * 사용자 데이터 캐시 무효화
 * @param {string} uid - 사용자 ID (없으면 전체 무효화)
 */
export function invalidateUserCache(uid) {
  if (uid) {
    userCache.invalidate(uid);
  } else {
    userCache.clear();
  }
}

async function ensureSuperAdminProfile(user, existingDoc) {
  const superRef = doc(db, 'users', user.uid);
  const now = new Date().toISOString();
  const baseProfile = {
    uid: user.uid,
    email: user.email || existingDoc?.email || '',
    role: ROLES.SUPER_ADMIN,
    approved: true,
    name: existingDoc?.name || '슈퍼 관리자',
    createdAt: existingDoc?.createdAt || now
  };

  if (!existingDoc) {
    await setDoc(superRef, baseProfile);
    return baseProfile;
  }

  if (existingDoc.role !== ROLES.SUPER_ADMIN || existingDoc.approved !== true) {
    await updateDoc(superRef, {
      role: ROLES.SUPER_ADMIN,
      approved: true
    });
  }

  return { ...existingDoc, role: ROLES.SUPER_ADMIN, approved: true };
}

export async function ensureSuperAdminAccess(user) {
  if (!user) return null;

  const userRef = doc(db, 'users', user.uid);
  const now = new Date().toISOString();

  const profile = {
    uid: user.uid,
    email: user.email || '',
    role: ROLES.SUPER_ADMIN,
    approved: true,
    name: '슈퍼 관리자',
    createdAt: now
  };

  await setDoc(userRef, profile, { merge: true });
  return profile;
}

export async function registerUser(email, password, role, additionalData = {}) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Firestore에 사용자 정보 저장
    const userData = {
      uid: user.uid,
      email: user.email,
      role: role,
      approved: role === ROLES.STUDENT ? true : false, // 학생은 자동 승인, 선생님은 승인 대기
      createdAt: new Date().toISOString(),
      ...additionalData
    };

    await setDoc(doc(db, 'users', user.uid), userData);

    return { user, userData };
  } catch (error) {
    console.error('회원가입 에러:', error);
    throw error;
  }
}

export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Firestore에서 사용자 정보 가져오기
    const userDoc = await getDoc(doc(db, 'users', user.uid));

    if (!userDoc.exists()) {
      if (user.uid === SUPER_ADMIN_UID) {
        const superProfile = await ensureSuperAdminProfile(user, null);
        return { user, userData: superProfile };
      }
      throw new Error('사용자 정보를 찾을 수 없습니다.');
    }

    const userData = userDoc.data();

    // 슈퍼 관리자 확인
    if (user.uid === SUPER_ADMIN_UID) {
      const ensuredProfile = await ensureSuperAdminProfile(user, userData);
      return { user, userData: ensuredProfile };
    }

    // 승인되지 않은 선생님인 경우
    if (userData.role === ROLES.TEACHER && !userData.approved) {
      throw new Error('아직 승인되지 않은 계정입니다. 관리자의 승인을 기다려주세요.');
    }

    return { user, userData };
  } catch (error) {
    console.error('로그인 에러:', error);
    throw error;
  }
}

// 자기번호 로그인 — 서버(pinLogin)가 학급코드·번호·숫자 4자리를 확인하고(틀린 횟수도 서버가 센다) 토큰을 준다
export async function loginWithPin(classCode, number, pin) {
  const res = await httpsCallable(functions, 'pinLogin')({ classCode, number: Number(number), pin });
  const { user } = await signInWithCustomToken(auth, res.data.token);
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  return { user, userData: userDoc.data() };
}

export async function signOut() {
  try {
    // 로그아웃 시 모든 캐시 정리 (보안: 세션 데이터 잔류 방지)
    userCache.clear();
    clearLocalStorageByPrefix(LS_PREFIX.USER);
    clearLocalStorageByPrefix(LS_PREFIX.CLASS);
    clearLocalStorageByPrefix(LS_PREFIX.ASSIGNMENT);
    clearLocalStorageByPrefix(LS_PREFIX.WRITING);
    clearLocalStorageByPrefix(LS_PREFIX.SCHEDULER);
    clearLocalStorageByPrefix('ssak_cache_');
    await firebaseSignOut(auth);
  } catch (error) {
    console.error('로그아웃 에러:', error);
    throw error;
  }
}

/**
 * 사용자 데이터 조회 (메모리 + LocalStorage 이중 캐시)
 * @param {string} uid - 사용자 ID
 * @param {boolean} forceRefresh - 강제 새로고침 여부
 * @returns {Promise<object|null>}
 */
export async function getUserData(uid, forceRefresh = false) {
  try {
    // 슈퍼 관리자는 캐싱하지 않음 (권한 변경 즉시 반영 필요)
    if (uid === SUPER_ADMIN_UID) {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      const ensuredProfile = await ensureSuperAdminProfile(
        auth.currentUser || { uid, email: userDoc.data()?.email },
        userDoc.exists() ? userDoc.data() : null
      );
      return ensuredProfile;
    }

    // 캐시 확인 (공통 유틸리티 사용)
    if (!forceRefresh) {
      const cached = userCache.get(uid);
      if (cached) {
        return cached;
      }
    }

    // DB에서 조회 (캐시 미스 시에만)
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const userData = userDoc.data();
      userCache.set(uid, userData);
      return userData;
    }

    return null;
  } catch (error) {
    console.error('사용자 정보 조회 에러:', error);
    throw error;
  }
}

export async function updateUserData(uid, data) {
  try {
    await updateDoc(doc(db, 'users', uid), data);
    // 캐시 무효화 - 업데이트 후 캐시 갱신
    invalidateUserCache(uid);
  } catch (error) {
    console.error('사용자 정보 업데이트 에러:', error);
    throw error;
  }
}
