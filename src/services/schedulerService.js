import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  limit,
} from "firebase/firestore";
import { db } from "../config/firebase";
import { generateTopics } from "../utils/aiAPI";
import { createAssignment, getAssignmentsByClass } from "./assignmentService";

const devLog = import.meta.env.DEV ? console.log.bind(console) : () => {};

// ============================================
// 캐싱 시스템 - Firestore 읽기 최적화 (10,000명 대응)
// ============================================
const schedulerCache = new Map(); // classCode -> { data, timestamp }
const autoAssignmentTodayCache = new Map(); // classCode -> { result, date }

const CACHE_TTL = 7200000; // 2시간 - 스케줄러 설정은 거의 변경 안됨 (변경 시 무효화됨)
const LS_PREFIX = "ssak_sched_";

function isCacheValid(timestamp) {
  if (!timestamp) return false;
  const jitter = CACHE_TTL * 0.1 * Math.random();
  return Date.now() - timestamp < CACHE_TTL + jitter;
}

// LocalStorage에 스케줄러 설정 저장
function saveToLocalStorage(key, data) {
  try {
    const item = { data, timestamp: Date.now() };
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(item));
  } catch (e) {
    if (import.meta.env.DEV) console.warn("localStorage error:", e.message);
  }
}

// LocalStorage에서 스케줄러 설정 로드
function loadFromLocalStorage(key) {
  try {
    const item = localStorage.getItem(LS_PREFIX + key);
    if (!item) return null;
    const parsed = JSON.parse(item);
    if (isCacheValid(parsed.timestamp)) {
      return parsed.data;
    }
    localStorage.removeItem(LS_PREFIX + key);
  } catch (e) {
    if (import.meta.env.DEV) console.warn("localStorage error:", e.message);
  }
  return null;
}

// 스케줄러 캐시 무효화
export function invalidateSchedulerCache(classCode) {
  schedulerCache.delete(classCode);
  try {
    localStorage.removeItem(LS_PREFIX + classCode);
  } catch (e) {
    if (import.meta.env.DEV) console.warn("localStorage error:", e.message);
  }
}

// 스케줄러 설정 저장
export async function saveSchedulerSettings(classCode, settings) {
  try {
    const schedulerRef = doc(db, "schedulers", classCode);
    await setDoc(schedulerRef, {
      classCode,
      ...settings,
      updatedAt: new Date().toISOString(),
    });

    // 캐시 무효화
    invalidateSchedulerCache(classCode);

    return { success: true };
  } catch (error) {
    console.error("스케줄러 설정 저장 에러:", error);
    throw error;
  }
}

// 최적화: 캐싱 추가 (메모리 + LocalStorage 이중 캐시)
export async function getSchedulerSettings(classCode, forceRefresh = false) {
  try {
    // classCode 유효성 검사
    if (!classCode || typeof classCode !== "string") {
      console.error("유효하지 않은 classCode:", classCode);
      return null;
    }

    // 1. 메모리 캐시 확인
    if (!forceRefresh) {
      const cached = schedulerCache.get(classCode);
      if (cached && isCacheValid(cached.timestamp)) {
        devLog(`[ DB읽기] getSchedulerSettings 메모리 캐시 히트`);
        return cached.data;
      }

      // 2. LocalStorage 캐시 확인
      const lsData = loadFromLocalStorage(classCode);
      if (lsData) {
        devLog(`[ DB읽기] getSchedulerSettings LocalStorage 캐시 히트`);
        schedulerCache.set(classCode, { data: lsData, timestamp: Date.now() });
        return lsData;
      }
    }

    // 3. DB에서 조회 (캐시 미스 시에만)
    devLog(
      `[ DB읽기] getSchedulerSettings DB 조회 - classCode: ${classCode}`,
    );
    const schedulerDoc = await getDoc(doc(db, "schedulers", classCode));
    const result = schedulerDoc.exists() ? schedulerDoc.data() : null;

    // 메모리 + LocalStorage 이중 캐시 저장
    schedulerCache.set(classCode, { data: result, timestamp: Date.now() });
    if (result) {
      saveToLocalStorage(classCode, result);
    }

    return result;
  } catch (error) {
    console.error("스케줄러 설정 로드 에러:", error);
    throw error;
  }
}

// 스케줄러 비활성화
export async function disableScheduler(classCode) {
  try {
    const schedulerRef = doc(db, "schedulers", classCode);
    await updateDoc(schedulerRef, {
      enabled: false,
      updatedAt: new Date().toISOString(),
    });
    return { success: true };
  } catch (error) {
    console.error("스케줄러 비활성화 에러:", error);
    throw error;
  }
}

// 이전에 출제된 과제 제목들 가져오기
export async function getPreviousAssignmentTitles(classCode) {
  try {
    const assignments = await getAssignmentsByClass(classCode);
    return assignments.map((a) => a.title);
  } catch (error) {
    console.error("이전 과제 조회 에러:", error);
    return [];
  }
}

// 자동 과제 생성 (Cloud Functions에서 호출되거나 클라이언트에서 수동 실행)
export async function generateAutoAssignment(
  classCode,
  gradeLevel,
  teacherId,
  settings,
) {
  try {
    // 이전 과제 제목들 가져오기
    const previousTitles = await getPreviousAssignmentTitles(classCode);

    // 글쓰기 유형 목록 (16개)
    const writingTypes = [
      "주장하는 글",
      "설명하는 글",
      "묘사하는 글",
      "서사/이야기",
      "편지",
      "일기",
      "감상문",
      "상상글",
      "기사문",
      "인터뷰",
      "비교/대조",
      "문제해결",
      "광고/홍보",
      "보고서",
      "시/운문",
      "토론/논쟁",
    ];

    // 분야 목록
    const categories = [
      "가족",
      "학교",
      "친구",
      "환경",
      "동물",
      "꿈/미래",
      "여행",
      "취미",
      "계절/날씨",
      "음식",
      "과학",
      "스포츠",
      "문화",
      "사회",
    ];

    // 랜덤 선택
    const randomType =
      writingTypes[Math.floor(Math.random() * writingTypes.length)];
    const randomCategory =
      categories[Math.floor(Math.random() * categories.length)];
    const combinedCategory = `${randomType} - ${randomCategory}`;

    // AI로 주제 생성
    const result = await generateTopics(gradeLevel, 5, combinedCategory);
    const topics = result.topics || [];

    if (topics.length === 0) {
      throw new Error("주제 생성 실패");
    }

    // 이전에 출제되지 않은 주제 찾기
    let selectedTopic = null;
    for (const topic of topics) {
      const isSimilar = previousTitles.some(
        (title) =>
          title.toLowerCase().includes(topic.title.toLowerCase()) ||
          topic.title.toLowerCase().includes(title.toLowerCase()) ||
          calculateSimilarity(title, topic.title) > 0.6,
      );

      if (!isSimilar) {
        selectedTopic = topic;
        break;
      }
    }

    // 모든 주제가 비슷하면 첫 번째 사용
    if (!selectedTopic) {
      selectedTopic = topics[0];
    }

    // 과제 생성
    const assignment = await createAssignment(
      teacherId,
      classCode,
      selectedTopic.title,
      `[자동 출제] ${selectedTopic.description || ""}\n유형: ${randomType} | 분야: ${randomCategory}`,
      null, // 마감일 없음
      settings.minScore || 70,
      settings.maxAiProbability || 50,
    );

    // 자동 출제 로그 저장
    await addDoc(collection(db, "autoAssignmentLogs"), {
      classCode,
      assignmentId: assignment.id,
      title: selectedTopic.title,
      writingType: randomType,
      category: randomCategory,
      createdAt: new Date().toISOString(),
    });

    // 캐시 무효화
    invalidateAutoAssignmentCache(classCode);

    return assignment;
  } catch (error) {
    console.error("자동 과제 생성 에러:", error);
    throw error;
  }
}

// 문자열 유사도 계산 (간단한 버전)
function calculateSimilarity(str1, str2) {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }

  return matches / longer.length;
}

// 최적화: 오늘 날짜 캐싱 + Firestore 서버사이드 필터링
export async function hasAutoAssignmentToday(classCode, forceRefresh = false) {
  try {
    // classCode 유효성 검사
    if (!classCode || typeof classCode !== "string") {
      console.error("유효하지 않은 classCode:", classCode);
      return false;
    }

    // 한국 시간(KST) 기준으로 오늘 날짜 계산
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000; // UTC+9
    const kstDate = new Date(now.getTime() + kstOffset);
    const today = kstDate.toISOString().split("T")[0];

    devLog(`[스케줄러] 오늘 날짜(KST): ${today}`);

    // 캐시 확인 (같은 날짜면 캐시 사용, forceRefresh가 아닐 때만)
    if (!forceRefresh) {
      const cached = autoAssignmentTodayCache.get(classCode);
      if (cached && cached.date === today) {
        devLog(`[ DB읽기] hasAutoAssignmentToday 캐시 히트`);
        return cached.result;
      }
    }

    // 오늘 날짜 범위 계산 (KST 기준 00:00 ~ 23:59를 UTC로 변환)
    const todayStart = `${today}T00:00:00+09:00`;
    const todayEnd = `${today}T23:59:59+09:00`;
    // ISO 문자열로 변환 (Firestore 비교용)
    const todayStartUTC = new Date(todayStart).toISOString();
    const todayEndUTC = new Date(todayEnd).toISOString();

    devLog(`[스케줄러] 검색 범위: ${todayStartUTC} ~ ${todayEndUTC}`);

    devLog(
      `[ DB읽기] hasAutoAssignmentToday DB 조회 - classCode: ${classCode}`,
    );
    // Firestore에서 직접 필터링 (클라이언트 필터링 제거)
    const q = query(
      collection(db, "autoAssignmentLogs"),
      where("classCode", "==", classCode),
      where("createdAt", ">=", todayStartUTC),
      where("createdAt", "<=", todayEndUTC),
      limit(1), // only need to check existence
    );
    const snapshot = await getDocs(q);

    const result = !snapshot.empty;

    // 캐시 저장
    autoAssignmentTodayCache.set(classCode, { result, date: today });

    return result;
  } catch (error) {
    console.error("오늘 자동 과제 확인 에러:", error);
    return false;
  }
}

// 자동 출제 캐시 무효화 (과제 생성 후 호출)
export function invalidateAutoAssignmentCache(classCode) {
  autoAssignmentTodayCache.delete(classCode);
}

// 스케줄 실행 (클라이언트에서 호출 - 페이지 로드시 체크)
// 최적화: cachedSettings 파라미터 추가 - 이미 로드된 설정 전달 시 DB 조회 절약
export async function checkAndRunScheduler(
  classCode,
  gradeLevel,
  teacherId,
  cachedSettings = null,
) {
  try {
    // 캐시된 설정이 있으면 사용, 없으면 DB 조회
    const settings = cachedSettings || (await getSchedulerSettings(classCode));

    devLog(`[스케줄러] 체크 시작 - classCode: ${classCode}`);
    devLog(`[스케줄러] 설정:`, settings);

    if (!settings || !settings.enabled) {
      devLog(`[스케줄러] 비활성화 상태`);
      return { executed: false, reason: "스케줄러 비활성화" };
    }

    const now = new Date();
    const currentDay = now.getDay(); // 0 = 일요일
    const currentHour = now.getHours();

    devLog(
      `[스케줄러] 현재: ${now.toLocaleString()}, 요일: ${currentDay}, 시간: ${currentHour}시`,
    );
    devLog(
      `[스케줄러] 설정된 요일: ${settings.selectedDays}, 설정된 시간: ${settings.scheduledTime}`,
    );

    // 요일 확인 (selectedDays: [1, 2, 3, 4, 5] = 월~금)
    if (!settings.selectedDays || !settings.selectedDays.includes(currentDay)) {
      devLog(
        `[스케줄러] 오늘(${currentDay})은 출제 요일이 아님 (설정: ${settings.selectedDays})`,
      );
      return {
        executed: false,
        reason: `오늘은 출제 요일이 아님 (현재: ${currentDay}, 설정: ${settings.selectedDays})`,
      };
    }

    // 시간 확인 (설정된 시간 이후면 실행)
    const scheduledHour = parseInt(
      settings.scheduledTime?.split(":")[0] || "9",
    );
    if (currentHour < scheduledHour) {
      return {
        executed: false,
        reason: `출제 시간(${scheduledHour}시) 이전입니다. 현재: ${currentHour}시`,
      };
    }

    // 이미 오늘 출제되었는지 확인 (forceRefresh=true로 실시간 확인)
    const alreadyAssigned = await hasAutoAssignmentToday(classCode, true);
    if (alreadyAssigned) {
      return { executed: false, reason: "오늘 이미 자동 출제됨" };
    }

    // 과제 생성
    const assignment = await generateAutoAssignment(
      classCode,
      gradeLevel,
      teacherId,
      settings,
    );

    return {
      executed: true,
      assignment,
      message: `"${assignment.title}" 과제가 자동 출제되었습니다!`,
    };
  } catch (error) {
    console.error("스케줄러 실행 에러:", error);
    return { executed: false, reason: error.message };
  }
}
