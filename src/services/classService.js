import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc,
  documentId,
  limit
} from 'firebase/firestore';
import { db, functions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { generateClassCode } from '../utils/classCodeGenerator';
import { MAX_STUDENTS_PER_CLASS } from '../config/auth';

const devLog = import.meta.env.DEV ? console.log.bind(console) : () => {};

// ============================================
// 캐싱 시스템 - Firestore 읽기 최적화 (10,000명 대응)
// ============================================
const studentDetailsCache = new Map(); // studentIds key -> { data, timestamp }
const classCache = new Map(); // classCode -> { data, timestamp }
const teacherClassesCache = new Map(); // teacherId -> { data, timestamp }

// 캐시 TTL 극대화 (100,000명 대응) - 비용 최적화
const CACHE_TTL = {
  studentDetails: 7200000, // 2시간 - 학생 정보는 거의 변경 안됨
  classData: 7200000,      // 2시간 - 반 정보는 거의 변경 안됨 (변경 시 무효화)
  teacherClasses: 7200000, // 2시간 - 선생님 학급은 거의 변경 안됨
};

// LocalStorage 키 접두사
const LS_PREFIX = 'ssak_class_';

function isCacheValid(timestamp, ttl) {
  if (!timestamp) return false;
  // 10% jitter 추가
  const jitter = ttl * 0.1 * Math.random();
  return (Date.now() - timestamp) < (ttl + jitter);
}

// LocalStorage에 클래스 데이터 저장
function saveToLocalStorage(key, data) {
  try {
    const item = { data, timestamp: Date.now() };
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(item));
  } catch (e) { if (import.meta.env.DEV) console.warn('localStorage error:', e.message); }
}

// LocalStorage에서 클래스 데이터 로드
function loadFromLocalStorage(key, ttl) {
  try {
    const item = localStorage.getItem(LS_PREFIX + key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    if (isCacheValid(parsed.timestamp, ttl)) {
      return parsed.data;
    }
    localStorage.removeItem(LS_PREFIX + key);
  } catch (e) { if (import.meta.env.DEV) console.warn('localStorage error:', e.message); }
  return null;
}

// 클래스 캐시 무효화
export function invalidateClassCache(classCode) {
  classCache.delete(classCode);
  try {
    localStorage.removeItem(LS_PREFIX + classCode);
  } catch (e) { if (import.meta.env.DEV) console.warn('localStorage error:', e.message); }
}

// 선생님 클래스 캐시 무효화
export function invalidateTeacherClassesCache(teacherId) {
  teacherClassesCache.delete(teacherId);
  try {
    localStorage.removeItem(LS_PREFIX + `teacher_${teacherId}`);
  } catch (e) { if (import.meta.env.DEV) console.warn('localStorage error:', e.message); }
}

export async function createClass(teacherId, className, gradeLevel, description = '') {
  try {
    // 선생님이 이미 학급을 가지고 있는지 확인 (1개만 허용)
    const existingClasses = await getTeacherClasses(teacherId);
    if (existingClasses.length > 0) {
      throw new Error('선생님은 1개의 학급만 생성할 수 있습니다. 기존 학급을 삭제한 후 다시 시도해주세요.');
    }

    let classCode = generateClassCode();

    // 중복 코드 확인 및 재생성
    let isUnique = false;
    while (!isUnique) {
      const classDoc = await getDoc(doc(db, 'classes', classCode));
      if (!classDoc.exists()) {
        isUnique = true;
      } else {
        classCode = generateClassCode();
      }
    }

    const classData = {
      classCode,
      className,
      gradeLevel,
      description,
      teacherId,
      students: [],
      createdAt: new Date().toISOString(),
      maxStudents: MAX_STUDENTS_PER_CLASS
    };

    await setDoc(doc(db, 'classes', classCode), classData);
    return classData;
  } catch (error) {
    console.error('학급 생성 에러:', error);
    throw error;
  }
}

// 최적화: 캐싱 추가 (메모리 + LocalStorage 이중 캐시)
// 에러 핸들링 강화 - 에러 발생해도 앱이 중단되지 않도록
export async function getClassByCode(classCode, forceRefresh = false) {
  try {
    // classCode 유효성 검사
    if (!classCode || typeof classCode !== 'string') {
      console.warn('getClassByCode: 유효하지 않은 classCode:', classCode);
      return null;
    }

    // 1. 메모리 캐시 확인
    if (!forceRefresh) {
      const cached = classCache.get(classCode);
      if (cached && isCacheValid(cached.timestamp, CACHE_TTL.classData)) {
        devLog(`[ DB읽기] getClassByCode 메모리 캐시 히트 - ${classCode}`);
        return cached.data;
      }

      // 2. LocalStorage 캐시 확인
      const lsData = loadFromLocalStorage(classCode, CACHE_TTL.classData);
      if (lsData) {
        devLog(`[ DB읽기] getClassByCode LocalStorage 캐시 히트 - ${classCode}`);
        classCache.set(classCode, { data: lsData, timestamp: Date.now() });
        return lsData;
      }
    }

    // 3. DB에서 조회 (캐시 미스 시에만)
    devLog(`[ DB읽기] getClassByCode DB 조회 - classCode: ${classCode}`);
    const classDoc = await getDoc(doc(db, 'classes', classCode));
    const result = classDoc.exists() ? { ...classDoc.data(), classCode } : null;

    // 메모리 + LocalStorage 이중 캐시 저장
    if (result) {
      classCache.set(classCode, { data: result, timestamp: Date.now() });
      saveToLocalStorage(classCode, result);
    }

    return result;
  } catch (error) {
    console.error('학급 조회 에러:', error);
    // 에러 시 null 반환 (앱 중단 방지)
    return null;
  }
}

// 최적화: 캐싱 추가 (메모리 + LocalStorage 이중 캐시)
export async function getTeacherClasses(teacherId, forceRefresh = false) {
  try {
    const cacheKey = `teacher_${teacherId}`;

    // 1. 메모리 캐시 확인
    if (!forceRefresh) {
      const cached = teacherClassesCache.get(teacherId);
      if (cached && isCacheValid(cached.timestamp, CACHE_TTL.teacherClasses)) {
        devLog(`[ DB읽기] getTeacherClasses 메모리 캐시 히트`);
        return cached.data;
      }

      // 2. LocalStorage 캐시 확인
      const lsData = loadFromLocalStorage(cacheKey, CACHE_TTL.teacherClasses);
      if (lsData) {
        devLog(`[ DB읽기] getTeacherClasses LocalStorage 캐시 히트`);
        teacherClassesCache.set(teacherId, { data: lsData, timestamp: Date.now() });
        return lsData;
      }
    }

    // 3. DB에서 조회 (캐시 미스 시에만)
    devLog(`[ DB읽기] getTeacherClasses DB 조회 - teacherId: ${teacherId}`);
    const q = query(collection(db, 'classes'), where('teacherId', '==', teacherId), limit(50));
    const querySnapshot = await getDocs(q);
    const classes = [];
    querySnapshot.forEach((docSnap) => {
      classes.push({ ...docSnap.data(), classCode: docSnap.id });
    });
    devLog(`[ DB읽기] getTeacherClasses 결과 - ${classes.length}개 클래스 로드됨`);

    // 메모리 + LocalStorage 이중 캐시 저장
    teacherClassesCache.set(teacherId, { data: classes, timestamp: Date.now() });
    saveToLocalStorage(cacheKey, classes);

    return classes;
  } catch (error) {
    console.error('선생님 학급 조회 에러:', error);
    throw error;
  }
}

export async function joinClass(classCode, studentId, studentName) {
  try {
    const classRef = doc(db, 'classes', classCode);
    const classDoc = await getDoc(classRef);

    if (!classDoc.exists()) {
      throw new Error('존재하지 않는 학급 코드입니다.');
    }

    const classData = classDoc.data();

    // 학생 수 제한 확인
    if (classData.students.length >= MAX_STUDENTS_PER_CLASS) {
      throw new Error(`학급 정원이 초과되었습니다. (최대 ${MAX_STUDENTS_PER_CLASS}명)`);
    }

    // 이미 가입된 학생인지 확인
    if (classData.students.some(s => s.studentId === studentId)) {
      throw new Error('이미 가입된 학급입니다.');
    }

    // 학생 추가
    await updateDoc(classRef, {
      students: arrayUnion({
        studentId,
        studentName,
        joinedAt: new Date().toISOString()
      })
    });

    // 학생의 classCode 업데이트
    await updateDoc(doc(db, 'users', studentId), {
      classCode
    });

    // 캐시 무효화
    invalidateClassCache(classCode);

    return classData;
  } catch (error) {
    console.error('학급 가입 에러:', error);
    throw error;
  }
}

export async function removeStudentFromClass(classCode, studentId) {
  try {
    const classRef = doc(db, 'classes', classCode);
    const classDoc = await getDoc(classRef);

    if (!classDoc.exists()) {
      throw new Error('존재하지 않는 학급입니다.');
    }

    const classData = classDoc.data();
    const student = classData.students.find(s => s.studentId === studentId);

    if (!student) {
      throw new Error('해당 학생을 찾을 수 없습니다.');
    }

    await updateDoc(classRef, {
      students: arrayRemove(student)
    });

    // 학생의 classCode 제거
    await updateDoc(doc(db, 'users', studentId), {
      classCode: null
    });

    // 캐시 무효화
    invalidateClassCache(classCode);

    return true;
  } catch (error) {
    console.error('학생 제거 에러:', error);
    throw error;
  }
}

export async function deleteClass(classCode) {
  try {
    const classRef = doc(db, 'classes', classCode);
    const classDoc = await getDoc(classRef);

    if (!classDoc.exists()) {
      throw new Error('존재하지 않는 학급입니다.');
    }

    const classData = classDoc.data();

    // 모든 학생의 classCode 병렬 제거 (최적화)
    await Promise.all(
      classData.students.map(student =>
        updateDoc(doc(db, 'users', student.studentId), { classCode: null })
      )
    );

    // 학급 삭제
    await deleteDoc(classRef);

    // 캐시 무효화
    invalidateClassCache(classCode);
    invalidateTeacherClassesCache(classData.teacherId);

    return true;
  } catch (error) {
    console.error('학급 삭제 에러:', error);
    throw error;
  }
}

// 학생 상세 정보 조회 (이메일 포함)
// 최적화: N+1 쿼리 대신 배치 쿼리 + 캐싱
export async function getStudentDetails(studentIds, forceRefresh = false) {
  try {
    if (!studentIds || studentIds.length === 0) {
      return [];
    }

    // 캐시 키 생성 (정렬된 ID 목록)
    const cacheKey = [...studentIds].sort().join(',');
    const cached = studentDetailsCache.get(cacheKey);

    // 캐시 확인
    if (!forceRefresh && cached && isCacheValid(cached.timestamp, CACHE_TTL.studentDetails)) {
      return cached.data;
    }

    // Firestore 'in' 쿼리 최대 30개까지 지원 (배치 크기 증가)
    const batchSize = 30;
    const batches = [];

    for (let i = 0; i < studentIds.length; i += batchSize) {
      const batchIds = studentIds.slice(i, i + batchSize);
      batches.push(batchIds);
    }

    // 배치 쿼리 병렬 실행
    const batchResults = await Promise.all(
      batches.map(async (batchIds) => {
        const q = query(
          collection(db, 'users'),
          where(documentId(), 'in', batchIds)
        );
        const snapshot = await getDocs(q);
        const results = new Map();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          results.set(docSnap.id, {
            studentId: docSnap.id,
            email: data.email || '',
            name: data.name || ''
          });
        });
        return results;
      })
    );

    // 결과 병합
    const allResults = new Map();
    batchResults.forEach(batchMap => {
      batchMap.forEach((value, key) => allResults.set(key, value));
    });

    // 원래 순서대로 정렬하고 없는 ID는 빈 데이터로 채움
    const studentDetails = studentIds.map(studentId =>
      allResults.get(studentId) || { studentId, email: '', name: '' }
    );

    // 캐시 저장
    studentDetailsCache.set(cacheKey, {
      data: studentDetails,
      timestamp: Date.now()
    });

    return studentDetails;
  } catch (error) {
    console.error('학생 상세정보 조회 에러:', error);
    throw error;
  }
}

// 학생 상세 정보 캐시 무효화
export function invalidateStudentDetailsCache() {
  studentDetailsCache.clear();
}

// 학생 비밀번호 초기화
export async function resetStudentPassword(studentId, classCode) {
  try {
    const resetPassword = httpsCallable(functions, 'resetStudentPassword');
    const result = await resetPassword({ studentId, classCode });
    return result.data;
  } catch (error) {
    console.error('비밀번호 초기화 에러:', error);
    throw error;
  }
}
