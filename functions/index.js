const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret, defineString } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app"); // firebase-admin 14: 이름공간(admin.*) 없음
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const Anthropic = require("@anthropic-ai/sdk");

// 🇰🇷 2026-11-17 싹 되살리기: 함수는 서울, 데이터는 서울 DB(«seoul», asia-northeast3)
//   종전엔 함수 us-central1 + Firestore nam5(미국) — 학생 글 원문이 미국에 저장됐다.
setGlobalOptions({ region: "asia-northeast3" });
const DATABASE_ID = "seoul"; // 클라(src/config/firebase.js)·firebase.json 과 같은 값 — 한 곳만 바꾸지 말 것(8way grok)

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore(DATABASE_ID);
const auth = getAuth();
const MAX_STUDENTS_PER_CLASS = 40;

// 학생 첫 비밀번호 — 아이디와 같은 규칙이면 친구 번호만 바꿔 남의 글을 볼 수 있었다(2026-11-18 전수 점검).
//   아이가 치기 쉽게 헷갈리는 글자(0·o·1·l·i)를 뺀 소문자 3 + 숫자 4, 암호학적 난수.
const { randomInt } = require("crypto");
function kidPassword() {
  const L = "abcdefghjkmnpqrstuvwxyz", D = "23456789";
  let p = "";
  for (let i = 0; i < 3; i++) p += L[randomInt(L.length)];
  for (let i = 0; i < 4; i++) p += D[randomInt(D.length)];
  return p;
}

// 🤖 AI 첨삭 = Claude Haiku 5.5(사용자 지정 2026-11-17 «Api 저렴한 하이쿠 같은 버전으로 해도 충분»)
//   키는 Firebase Secret Manager, 모델은 배포 변수(AI_MODEL)로 바꿀 수 있다.
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const AI_MODEL = defineString("AI_MODEL", { default: "claude-haiku-5-5" });

// 🔒 국외(미국) AI 로 보내는 학생 글은 반드시 pii.mjs 로 이름·주소·학교·전화를 «ㅇㅇㅇ»로 가린 뒤 보낸다.
//   callAI 는 { masked: true } 없이는 부르지 못한다 — 가리지 않은 길이 생기지 않게.
const piiModule = import("./pii.mjs");
const MAX_AI_TEXT = 12000; // 아이 글은 보통 3천 자 이하 — 아주 긴 입력(숫자 수만 자 등)으로 가림 정규식을 오래 붙잡지 못하게
async function maskForAI(text, extraWords) {
  if (String(text || "").length > MAX_AI_TEXT) throw new HttpsError("invalid-argument", `글이 너무 길어요(${MAX_AI_TEXT.toLocaleString()}자까지).`);
  const { maskPII } = await piiModule;
  return maskPII(String(text || ""), { extraWords: Array.isArray(extraWords) ? extraWords : [] });
}

// Anthropic 이 미성년 사용자 제품에 요구하는 아동 안전 안내(지원 문서 «Guidelines for Organizations Serving Minors»)
const CHILD_SAFETY =
  "사용자는 한국 초등학생이다. 아이에게 맞는 쉬운 말로, 다정하고 안전하게 답한다. 폭력·성적·위험한 내용, 개인정보를 묻거나 만들어 내는 말은 하지 않는다. " +
  "글 속 «ㅇㅇㅇ»는 개인정보를 가린 자리다 — 고치라고 하지 말고, 그 자리에 무엇이 있었는지 짐작하지도 마라.";

let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: anthropicApiKey.value().trim(), maxRetries: 1, timeout: 90 * 1000 });
  return _client;
}

/**
 * Claude 호출. 학생 글이 들어간 프롬프트는 maskForAI 를 거친 뒤 { masked: true } 로 부른다.
 * temperature 등은 Haiku 5.5 에서 기본값 외엔 400 — 받지만 무시한다.
 */
async function callAI(prompt, { maxTokens = 2048, systemPrompt, masked } = {}) {
  if (masked !== true) throw new Error("callAI: 학생 글을 가리지 않은 호출(masked:true 필요)");
  // 2차 그물(8way meta·gemini): masked 는 약속일 뿐이라, 보내기 직전 프롬프트 전체를 한 번 더 가린다(이미 가린 곳은 그대로)
  const { maskPII } = await piiModule;
  if (String(prompt).length > MAX_AI_TEXT * 4) throw new Error("callAI: 프롬프트가 너무 길다");
  const second = maskPII(String(prompt));
  if (second.hits.length) console.warn(`[callAI] 2차 가림 ${second.hits.length}건(${[...new Set(second.hits.map((h) => h.kind))].join(",")}) — 호출부 가림 누락 의심`);
  prompt = second.text;
  const res = await getClient().messages.create({
    model: AI_MODEL.value(),
    max_tokens: Math.max(1024, maxTokens),
    system: [CHILD_SAFETY, systemPrompt].filter(Boolean).join("\n\n"),
    output_config: { effort: "low" },
    messages: [{ role: "user", content: prompt }],
  });
  if (res.stop_reason === "refusal") throw new Error("AI가 이 글에 답하지 않았어요.");
  return res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

// 공통 시스템 프롬프트
const SYSTEM_PROMPTS = {
  writingHelper:
    "당신은 초등학생 글쓰기를 도와주는 전문 교사입니다. 반드시 요청된 JSON 형식으로만 응답하세요. JSON 외의 텍스트는 절대 포함하지 마세요. 한국어로 답변하세요.",
  writingAnalyzer:
    "당신은 초등학생 글쓰기를 평가하는 전문가입니다. 반드시 요청된 JSON 형식으로만 응답하세요. JSON 외의 텍스트는 절대 포함하지 마세요. 한국어로 답변하세요. 평가는 공정하고 구체적이어야 합니다.",
  quickAdvice:
    "당신은 초등학생을 격려하는 친근한 글쓰기 선생님입니다. 반드시 요청된 JSON 형식으로만 응답하세요. 구체적이고 실질적인 조언을 주세요. 한국어로 답변하세요.",
  topicGenerator:
    "당신은 초등학생 글쓰기 주제를 만드는 전문가입니다. 반드시 요청된 JSON 형식으로만 응답하세요. 학년에 맞는 흥미롭고 창의적인 주제를 제안하세요. 한국어로 답변하세요.",
};
// ============================================
// 💰 비용 최적화 & 사용량 추적 시스템
// ============================================

// 일일 API 호출 제한 (학교당)
const DAILY_API_LIMIT_PER_SCHOOL = 1000; // 학교당 하루 1000회
const DAILY_API_LIMIT_PER_USER = 50; // 사용자당 하루 50회

// 사용량 캐시 (메모리)
const usageCache = new Map();
const USAGE_CACHE_TTL = 60000; // 1분

/**
 * 사용량 기록 및 확인
 */
async function checkAndRecordUsage(userId, schoolId) {
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const userKey = `usage_${userId}_${today}`;
  const schoolKey = `usage_school_${schoolId}_${today}`;

  // 캐시 확인
  const cachedUser = usageCache.get(userKey);
  const cachedSchool = usageCache.get(schoolKey);

  let userCount = cachedUser?.count || 0;
  let schoolCount = cachedSchool?.count || 0;

  // 캐시가 오래되었으면 DB에서 조회
  if (!cachedUser || Date.now() - cachedUser.timestamp > USAGE_CACHE_TTL) {
    try {
      const userUsageDoc = await db.collection("usage").doc(userKey).get();
      userCount = userUsageDoc.exists ? userUsageDoc.data().count : 0;
    } catch (e) {
      console.warn("[사용량 조회 실패] 사용자:", e.message);
    }
  }

  if (!cachedSchool || Date.now() - cachedSchool.timestamp > USAGE_CACHE_TTL) {
    try {
      const schoolUsageDoc = await db.collection("usage").doc(schoolKey).get();
      schoolCount = schoolUsageDoc.exists ? schoolUsageDoc.data().count : 0;
    } catch (e) {
      console.warn("[사용량 조회 실패] 학교:", e.message);
    }
  }

  // 제한 확인
  if (userCount >= DAILY_API_LIMIT_PER_USER) {
    return {
      allowed: false,
      reason: `일일 사용량 초과 (${userCount}/${DAILY_API_LIMIT_PER_USER}회). 내일 다시 이용해주세요.`,
    };
  }
  if (schoolCount >= DAILY_API_LIMIT_PER_SCHOOL) {
    return {
      allowed: false,
      reason: `학교 일일 사용량 초과. 내일 다시 이용해주세요.`,
    };
  }

  // 사용량 기록 (비동기, 실패해도 진행)
  const newUserCount = userCount + 1;
  const newSchoolCount = schoolCount + 1;

  // 캐시 업데이트
  usageCache.set(userKey, { count: newUserCount, timestamp: Date.now() });
  usageCache.set(schoolKey, { count: newSchoolCount, timestamp: Date.now() });

  // DB 업데이트 (비동기)
  db.collection("usage")
    .doc(userKey)
    .set(
      {
        userId,
        count: newUserCount,
        date: today,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
    .catch((e) => console.warn("[사용량 기록 실패]", e.message));

  if (schoolId) {
    db.collection("usage")
      .doc(schoolKey)
      .set(
        {
          schoolId,
          count: newSchoolCount,
          date: today,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
      .catch((e) => console.warn("[학교 사용량 기록 실패]", e.message));
  }

  return {
    allowed: true,
    userCount: newUserCount,
    schoolCount: newSchoolCount,
  };
}

/**
 * API 비용 추적 (월별 집계)
 */
async function trackApiCost(userId, schoolId, tokenCount = 0) {
  const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const costKey = `cost_${yearMonth}`;

  // 예상 비용 계산 (GPT-4o-mini 기준: $0.15/1M input tokens)
  const estimatedCost = (tokenCount / 1000000) * 0.15;

  try {
    await db
      .collection("apiCosts")
      .doc(costKey)
      .set(
        {
          yearMonth,
          totalCalls: FieldValue.increment(1),
          totalTokens: FieldValue.increment(tokenCount),
          estimatedCostUSD: FieldValue.increment(estimatedCost),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch (e) {
    console.warn("[비용 추적 실패]", e.message);
  }
}

// ============================================
// 🌱 싹DB 유틸리티 함수들 (글쓰기 평가 지식베이스)
// ============================================

// 싹DB 캐시 (서버 메모리)
const ssakDBCache = {
  rubrics: new Map(),
  examples: new Map(),
  lastUpdated: null,
};
const SSAK_CACHE_TTL = 3600000; // 1시간

/**
 * 학년을 학령대/학년군으로 변환
 * @param {string} gradeLevel - elementary_1_2, middle, high 등
 * @returns {{ educationLevel: string, gradeGroup: string }}
 */
function gradeToEducationLevel(gradeLevel) {
  const mapping = {
    elementary_1_2: { educationLevel: "초등학교", gradeGroup: "1-2학년" },
    elementary_3_4: { educationLevel: "초등학교", gradeGroup: "3-4학년" },
    elementary_5_6: { educationLevel: "초등학교", gradeGroup: "5-6학년" },
    middle: { educationLevel: "중학교", gradeGroup: "1학년" }, // 중학교는 1학년 기준
    high: { educationLevel: "고등학교", gradeGroup: "1학년" },
  };
  return (
    mapping[gradeLevel] || { educationLevel: "초등학교", gradeGroup: "3-4학년" }
  );
}

/**
 * 글쓰기 유형을 장르로 매핑
 */
function getGenreFromTopic(topic, gradeLevel) {
  // 키워드 기반 장르 추론
  const topicLower = (topic || "").toLowerCase();

  if (
    topicLower.includes("독서") ||
    topicLower.includes("책") ||
    topicLower.includes("읽")
  ) {
    return gradeLevel?.includes("elementary") ? "독후감" : "독서감상문";
  }
  if (
    topicLower.includes("일기") ||
    topicLower.includes("하루") ||
    topicLower.includes("오늘")
  ) {
    return "일기";
  }
  if (topicLower.includes("편지") || topicLower.includes("에게")) {
    return "편지";
  }
  if (
    topicLower.includes("설명") ||
    topicLower.includes("알려") ||
    topicLower.includes("소개")
  ) {
    return "설명문";
  }
  if (
    topicLower.includes("주장") ||
    topicLower.includes("의견") ||
    topicLower.includes("생각")
  ) {
    return gradeLevel?.includes("elementary") ? "설명문" : "논설문";
  }

  // 학년별 기본 장르
  if (gradeLevel === "elementary_1_2") return "일기";
  if (gradeLevel === "elementary_3_4") return "생활문";
  if (gradeLevel === "elementary_5_6") return "설명문";
  if (gradeLevel === "middle") return "논설문";
  if (gradeLevel === "high") return "논설문";

  return "일기";
}

/**
 * Firestore에서 싹DB 루브릭 검색
 */
async function getSsakRubric(gradeLevel, topic) {
  const { educationLevel, gradeGroup } = gradeToEducationLevel(gradeLevel);
  const genre = getGenreFromTopic(topic, gradeLevel);

  const cacheKey = `${educationLevel}_${gradeGroup}_${genre}`;

  // 캐시 확인
  const cached = ssakDBCache.rubrics.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SSAK_CACHE_TTL) {
    return cached.data;
  }

  try {
    // Firestore에서 총괄 루브릭 검색
    const snapshot = await db
      .collection("rubrics")
      .where("education_level", "==", educationLevel)
      .where("grade", "==", gradeGroup)
      .where("genre", "==", genre)
      .where("domain", "==", "종합")
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const rubric = snapshot.docs[0].data();
      ssakDBCache.rubrics.set(cacheKey, {
        data: rubric,
        timestamp: Date.now(),
      });
      console.log(
        `[싹DB] 루브릭 로드: ${educationLevel} ${gradeGroup} ${genre}`,
      );
      return rubric;
    }

    // 해당 장르 없으면 일기 폴백
    if (genre !== "일기") {
      console.log(`[싹DB] ${genre} 루브릭 없음, 일기로 폴백`);
      const fallbackSnapshot = await db
        .collection("rubrics")
        .where("education_level", "==", educationLevel)
        .where("grade", "==", gradeGroup)
        .where("genre", "==", "일기")
        .where("domain", "==", "종합")
        .limit(1)
        .get();

      if (!fallbackSnapshot.empty) {
        const rubric = fallbackSnapshot.docs[0].data();
        ssakDBCache.rubrics.set(cacheKey, {
          data: rubric,
          timestamp: Date.now(),
        });
        return rubric;
      }
    }

    return null;
  } catch (error) {
    console.error("[싹DB] 루브릭 검색 오류:", error);
    return null;
  }
}

/**
 * Firestore에서 싹DB 우수작 예시 검색
 */
async function getSsakExample(gradeLevel, topic, level = "high") {
  const genre = getGenreFromTopic(topic, gradeLevel);

  // 우수작 예시 파일은 루브릭과 다른 education_level 값 사용
  // 루브릭: "초등학교", "중학교", "고등학교"
  // 예시: "초등", "중", "고"
  const exampleEducationLevelMap = {
    elementary_1_2: "초등",
    elementary_3_4: "초등",
    elementary_5_6: "초등",
    middle: "중",
    high: "고",
  };
  const exampleEducationLevel = exampleEducationLevelMap[gradeLevel] || "초등";

  // level 매핑 (영어 → 한글) - 싹DB에 한글로 저장되어 있음
  const levelMap = { high: "상", mid: "중", low: "하" };
  const koreanLevel = levelMap[level] || level;

  const cacheKey = `example_${exampleEducationLevel}_${genre}_${koreanLevel}`;

  // 캐시 확인
  const cached = ssakDBCache.examples.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SSAK_CACHE_TTL) {
    return cached.data;
  }

  try {
    // 1차: education_level, genre, level로 검색
    let snapshot = await db
      .collection("examples")
      .where("education_level", "==", exampleEducationLevel)
      .where("genre", "==", genre)
      .where("level", "==", koreanLevel)
      .limit(1)
      .get();

    // 2차: genre만으로 검색 (예시가 없으면 같은 장르의 다른 학년 예시 사용)
    if (snapshot.empty) {
      console.log(
        `[싹DB] 정확한 예시 없음, 장르로 재검색: ${genre} ${koreanLevel}`,
      );
      snapshot = await db
        .collection("examples")
        .where("genre", "==", genre)
        .where("level", "==", koreanLevel)
        .limit(1)
        .get();
    }

    if (!snapshot.empty) {
      const example = snapshot.docs[0].data();
      ssakDBCache.examples.set(cacheKey, {
        data: example,
        timestamp: Date.now(),
      });
      console.log(
        `[싹DB] 예시 로드: ${exampleEducationLevel} ${genre} (${koreanLevel})`,
      );
      return example;
    }

    console.log(
      `[싹DB] 예시 없음: ${exampleEducationLevel} ${genre} ${koreanLevel}`,
    );
    return null;
  } catch (error) {
    console.error("[싹DB] 예시 검색 오류:", error);
    return null;
  }
}

/**
 * 싹DB 컨텍스트를 프롬프트용 문자열로 변환
 */
function buildSsakPromptContext(rubric, example) {
  let context = "";

  if (rubric && rubric.content) {
    // 루브릭에서 핵심 평가 기준 추출
    const rubricContent = rubric.content.substring(0, 1500); // 토큰 제한
    context += `\n[싹DB 평가기준]\n${rubricContent}\n`;
  }

  if (example && example.content) {
    // 우수작에서 핵심 부분만 추출
    const exampleContent = example.content.substring(0, 800);
    context += `\n[싹DB 우수작 예시]\n${exampleContent}\n`;
  }

  return context;
}

// 🚀 슈퍼관리자 userData에 학급 요약 정보 동기화 (DB 읽기 최적화)
// 학급 생성/수정/삭제 시 호출하여 슈퍼관리자가 로그인할 때 추가 DB 읽기 없이 학급 정보 확인 가능
const syncSuperAdminClassesSummary = async () => {
  try {
    // 모든 슈퍼관리자 조회
    const superAdminsSnapshot = await db
      .collection("users")
      .where("role", "==", "super_admin")
      .get();

    if (superAdminsSnapshot.empty) {
      console.log("[동기화] 슈퍼관리자 없음");
      return;
    }

    // 모든 학급 정보 조회
    const classesSnapshot = await db.collection("classes").get();

    // 선생님 ID 수집 (teacherName이 없는 경우 조회 필요)
    const teacherIds = new Set();
    const classesData = [];

    classesSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      classesData.push({ id: docSnap.id, data });
      if (data.teacherId && !data.teacherName) {
        teacherIds.add(data.teacherId);
      }
    });

    // teacherName이 없는 선생님들 이름 조회
    const teacherNames = {};
    if (teacherIds.size > 0) {
      console.log(`[동기화] ${teacherIds.size}명의 선생님 이름 조회`);
      await Promise.all(
        Array.from(teacherIds).map(async (teacherId) => {
          try {
            const teacherDoc = await db.doc(`users/${teacherId}`).get();
            if (teacherDoc.exists) {
              const teacherData = teacherDoc.data();
              teacherNames[teacherId] =
                teacherData.name ||
                teacherData.email?.split("@")[0] ||
                "알 수 없음";

              // 해당 선생님의 모든 classes 문서에 teacherName 저장 (다음부터 조회 불필요)
              const classesToUpdate = classesData.filter(
                (c) => c.data.teacherId === teacherId && !c.data.teacherName,
              );
              for (const classDoc of classesToUpdate) {
                await db
                  .doc(`classes/${classDoc.id}`)
                  .update({ teacherName: teacherNames[teacherId] });
                console.log(
                  `[동기화] 학급 ${classDoc.id}에 teacherName 저장: ${teacherNames[teacherId]}`,
                );
              }
            }
          } catch (e) {
            console.warn(`선생님 ${teacherId} 조회 실패:`, e);
          }
        }),
      );
    }

    // classesSummary 생성
    const classesSummary = classesData.map(({ id, data }) => ({
      classCode: id,
      className: data.className || id,
      teacherId: data.teacherId || null,
      teacherName:
        data.teacherName || teacherNames[data.teacherId] || "알 수 없음",
      studentCount: data.students?.length || 0,
      gradeLevel: data.gradeLevel || null,
      createdAt: data.createdAt || null,
    }));

    // 모든 슈퍼관리자의 userData에 classesSummary 저장
    const batch = db.batch();
    superAdminsSnapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        classesSummary,
        classesSummaryUpdatedAt: new Date().toISOString(),
      });
    });
    await batch.commit();

    console.log(
      `[동기화] ${superAdminsSnapshot.size}명의 슈퍼관리자에게 ${classesSummary.length}개 학급 정보 동기화 완료`,
    );
  } catch (error) {
    console.error("[동기화] 슈퍼관리자 classesSummary 동기화 에러:", error);
  }
};

// 🚀 학생 userData에 classInfo 동기화 (기존 학생 + 과제 변경 시)
const syncStudentClassInfo = async (classCode) => {
  try {
    const classDoc = await db.doc(`classes/${classCode}`).get();
    if (!classDoc.exists) {
      console.log(`[동기화] 학급 ${classCode} 없음`);
      return;
    }

    const classData = classDoc.data();

    // 선생님 이름 조회
    let teacherName = classData.teacherName;
    if (!teacherName && classData.teacherId) {
      const teacherDoc = await db.doc(`users/${classData.teacherId}`).get();
      if (teacherDoc.exists) {
        const teacherData = teacherDoc.data();
        teacherName =
          teacherData.name || teacherData.email?.split("@")[0] || "알 수 없음";
      }
    }

    const classInfo = {
      classCode: classCode,
      className: classData.className || classCode,
      teacherId: classData.teacherId,
      teacherName: teacherName || "알 수 없음",
      gradeLevel: classData.gradeLevel,
      assignmentSummary: classData.assignmentSummary || [],
      weeklyRanking: classData.weeklyRanking || null,
      monthlyRanking: classData.monthlyRanking || null,
    };

    // 해당 학급의 모든 학생 조회
    const studentsSnapshot = await db
      .collection("users")
      .where("classCode", "==", classCode)
      .where("role", "==", "student")
      .get();

    if (studentsSnapshot.empty) {
      console.log(`[동기화] 학급 ${classCode}에 학생 없음`);
      return;
    }

    // 배치로 모든 학생 업데이트
    const batch = db.batch();
    studentsSnapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, { classInfo });
    });
    await batch.commit();

    console.log(
      `[동기화] 학급 ${classCode}의 ${studentsSnapshot.size}명 학생 classInfo 동기화 완료`,
    );
  } catch (error) {
    console.error("[동기화] 학생 classInfo 동기화 에러:", error);
  }
};

// ============================================
// Helper: Delete all students in a class (Auth + Firestore + writings + stats + drafts)
// Used by deleteClassWithStudents and autoDeleteAllClassesOnMarch1
// ============================================
async function deleteStudentsInClass(students) {
  let deletedStudents = 0;
  let deletedWritings = 0;
  const errors = [];

  for (const student of students) {
    try {
      const studentId = student.studentId;

      // Firebase Auth delete
      try {
        await auth.deleteUser(studentId);
      } catch (authError) {
        if (authError.code !== "auth/user-not-found") {
          console.warn(
            `[학급 삭제] Auth 삭제 실패 - ${studentId}:`,
            authError.message,
          );
        }
      }

      // Firestore users document delete
      await db.doc(`users/${studentId}`).delete();

      // Student writings delete
      const writingsQuery = db
        .collection("writings")
        .where("studentId", "==", studentId);
      const writingsSnapshot = await writingsQuery.get();

      if (!writingsSnapshot.empty) {
        const batch = db.batch();
        writingsSnapshot.forEach((docSnap) => {
          batch.delete(docSnap.ref);
          deletedWritings++;
        });
        await batch.commit();
      }

      // studentStats delete
      try {
        await db.doc(`studentStats/${studentId}`).delete();
      } catch (e) {
        // ignore - may not exist
      }

      // drafts delete
      const draftsQuery = db
        .collection("drafts")
        .where("studentId", "==", studentId);
      const draftsSnapshot = await draftsQuery.get();
      if (!draftsSnapshot.empty) {
        const draftBatch = db.batch();
        draftsSnapshot.forEach((docSnap) => draftBatch.delete(docSnap.ref));
        await draftBatch.commit();
      }

      deletedStudents++;
    } catch (studentError) {
      console.error(
        `[학급 삭제] 학생 삭제 실패 - ${student.studentId}:`,
        studentError,
      );
      errors.push({
        studentId: student.studentId,
        error: studentError.message,
      });
    }
  }

  return { deletedStudents, deletedWritings, errors };
}

// Helper: Delete assignments for a class
async function deleteClassAssignments(classCode) {
  const assignmentsQuery = db
    .collection("assignments")
    .where("classCode", "==", classCode);
  const assignmentsSnapshot = await assignmentsQuery.get();
  let deletedAssignments = 0;
  if (!assignmentsSnapshot.empty) {
    const assignmentBatch = db.batch();
    assignmentsSnapshot.forEach((docSnap) => {
      assignmentBatch.delete(docSnap.ref);
      deletedAssignments++;
    });
    await assignmentBatch.commit();
  }
  return deletedAssignments;
}

// Helper: Remove classCode from teacher's user document
async function removeTeacherClassCode(teacherId, classCode) {
  if (!teacherId) return;
  try {
    const teacherRef = db.doc(`users/${teacherId}`);
    const teacherDoc = await teacherRef.get();
    if (teacherDoc.exists) {
      const teacherData = teacherDoc.data();
      if (teacherData.classCode === classCode) {
        await teacherRef.update({
          classCode: FieldValue.delete(),
        });
      }
    }
  } catch (e) {
    console.warn(`[학급 삭제] 선생님 classCode 업데이트 실패:`, e);
  }
}

exports.batchCreateStudents = onCall(async (request) => {
  // In v2, auth is in request.auth
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const data = request.data;

  const { classCode, count, prefix, gradeLevel } = data || {};
  const total = Number(count);

  if (!classCode) {
    throw new HttpsError("invalid-argument", "classCode가 필요합니다.");
  }

  if (!total || total < 1 || total > MAX_STUDENTS_PER_CLASS) {
    throw new HttpsError(
      "invalid-argument",
      `생성 인원은 1~${MAX_STUDENTS_PER_CLASS}명이어야 합니다.`,
    );
  }

  if (!gradeLevel) {
    throw new HttpsError("invalid-argument", "gradeLevel이 필요합니다.");
  }

  const teacherUid = request.auth.uid;
  const teacherRef = db.doc(`users/${teacherUid}`);
  const teacherSnap = await teacherRef.get();

  if (!teacherSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "교사 프로필을 찾을 수 없습니다.",
    );
  }

  const teacherData = teacherSnap.data();
  const isAdmin = teacherData.role === "super_admin";

  if (!isAdmin && teacherData.role !== "teacher") {
    throw new HttpsError(
      "permission-denied",
      "교사만 학생 계정을 생성할 수 있습니다.",
    );
  }

  // Security: 승인된 교사만 학생 생성 가능 (미승인 교사의 학생 생성 방지)
  if (!isAdmin && teacherData.approved !== true) {
    throw new HttpsError(
      "permission-denied",
      "승인된 교사만 학생 계정을 생성할 수 있습니다. 관리자에게 승인을 요청하세요.",
    );
  }

  const classRef = db.doc(`classes/${classCode}`);
  const classSnap = await classRef.get();

  if (!classSnap.exists) {
    throw new HttpsError("not-found", "클래스를 찾을 수 없습니다.");
  }

  const classData = classSnap.data();

  if (!isAdmin && classData.teacherId !== teacherUid) {
    throw new HttpsError(
      "permission-denied",
      "해당 클래스의 담당 교사만 생성할 수 있습니다.",
    );
  }

  const currentStudents = Array.isArray(classData.students)
    ? classData.students.length
    : 0;
  if (currentStudents + total > MAX_STUDENTS_PER_CLASS) {
    throw new HttpsError(
      "failed-precondition",
      `클래스 정원을 초과합니다. 현재 ${currentStudents}명, 최대 ${MAX_STUDENTS_PER_CLASS}명입니다.`,
    );
  }

  const cleanedPrefix =
    (prefix || classCode || "student")
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "student";
  const domain = (teacherData.email || "").split("@")[1] || "example.com";
  const now = new Date().toISOString();

  const results = [];
  const newStudents = [];

  for (let i = 1; i <= total; i++) {
    const seq = String(currentStudents + i).padStart(3, "0");
    const email = `${cleanedPrefix}${seq}@${domain}`;
    const password = kidPassword();
    const displayName = `학생${seq}`;

    try {
      const userRecord = await getAuth().createUser({
        email,
        password,
        displayName,
      });

      // 🚀 학생 userData에 classInfo 캐시 (로그인 시 DB 읽기 0회!)
      const classInfo = {
        classCode: classCode,
        className: classData.className || classCode,
        teacherId: classData.teacherId,
        teacherName:
          classData.teacherName ||
          teacherData.name ||
          teacherData.email?.split("@")[0] ||
          "알 수 없음",
        gradeLevel: classData.gradeLevel,
        assignmentSummary: classData.assignmentSummary || [],
        weeklyRanking: classData.weeklyRanking || null,
        monthlyRanking: classData.monthlyRanking || null,
      };

      await db.doc(`users/${userRecord.uid}`).set({
        uid: userRecord.uid,
        email,
        name: displayName,
        role: "student",
        approved: true,
        gradeLevel,
        classCode,
        classInfo, // 🚀 캐시된 학급 정보
        writingSummary: [], // 🚀 초기값
        createdAt: now,
        createdBy: teacherUid,
      });

      newStudents.push({
        studentId: userRecord.uid,
        studentName: displayName,
        joinedAt: now,
      });

      results.push({ email, password, status: "created" });
    } catch (error) {
      results.push({
        email,
        password: null,
        status: "skipped",
        message: error.message,
      });
    }
  }

  if (newStudents.length > 0) {
    await classRef.update({
      students: FieldValue.arrayUnion(...newStudents),
    });

    // 🚀 학생 추가 후 슈퍼관리자 classesSummary 동기화
    await syncSuperAdminClassesSummary();
  }

  return {
    created: results.filter((r) => r.status === "created").length,
    attempted: total,
    results,
  };
});

// Delete user (both Auth and Firestore)
exports.deleteUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const data = request.data;
  const { userId } = data;

  if (!userId) {
    throw new HttpsError("invalid-argument", "userId가 필요합니다.");
  }

  // Check if requester is super admin
  const requesterRef = db.doc(`users/${request.auth.uid}`);
  const requesterSnap = await requesterRef.get();

  if (!requesterSnap.exists || requesterSnap.data().role !== "super_admin") {
    throw new HttpsError(
      "permission-denied",
      "슈퍼 관리자만 사용자를 삭제할 수 있습니다.",
    );
  }

  try {
    // Delete from Firebase Auth
    await auth.deleteUser(userId);

    // Delete from Firestore
    await db.doc(`users/${userId}`).delete();

    return { success: true, message: "사용자가 삭제되었습니다." };
  } catch (error) {
    throw new HttpsError("internal", `삭제 실패: ${error.message}`);
  }
});

// Batch delete users
exports.batchDeleteUsers = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const data = request.data;
  const { userIds } = data;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    throw new HttpsError("invalid-argument", "userIds 배열이 필요합니다.");
  }

  // Check if requester is super admin
  const requesterRef = db.doc(`users/${request.auth.uid}`);
  const requesterSnap = await requesterRef.get();

  if (!requesterSnap.exists || requesterSnap.data().role !== "super_admin") {
    throw new HttpsError(
      "permission-denied",
      "슈퍼 관리자만 사용자를 삭제할 수 있습니다.",
    );
  }

  // 🚀 Parallel delete with concurrency limit of 5
  const CONCURRENCY = 5;
  const results = [];
  for (let i = 0; i < userIds.length; i += CONCURRENCY) {
    const batch = userIds.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (userId) => {
        await auth.deleteUser(userId);
        await db.doc(`users/${userId}`).delete();
        return { userId, status: "deleted" };
      }),
    );
    batchResults.forEach((result, idx) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        results.push({
          userId: batch[idx],
          status: "failed",
          error: result.reason?.message || "Unknown error",
        });
      }
    });
  }

  const deleted = results.filter((r) => r.status === "deleted").length;
  return {
    deleted,
    attempted: userIds.length,
    results,
  };
});

// Reset student password (for teachers)
exports.resetStudentPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const data = request.data;
  const { studentId, classCode } = data;

  if (!studentId || !classCode) {
    throw new HttpsError(
      "invalid-argument",
      "studentId와 classCode가 필요합니다.",
    );
  }

  const teacherUid = request.auth.uid;

  // Check if requester is the teacher of this class or super admin
  const teacherRef = db.doc(`users/${teacherUid}`);
  const teacherSnap = await teacherRef.get();

  if (!teacherSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "교사 프로필을 찾을 수 없습니다.",
    );
  }

  const teacherData = teacherSnap.data();
  const isAdmin = teacherData.role === "super_admin";

  if (!isAdmin && teacherData.role !== "teacher") {
    throw new HttpsError(
      "permission-denied",
      "교사만 학생 비밀번호를 초기화할 수 있습니다.",
    );
  }

  // Security: 승인된 교사만 비밀번호 초기화 가능
  if (!isAdmin && teacherData.approved !== true) {
    throw new HttpsError(
      "permission-denied",
      "승인된 교사만 학생 비밀번호를 초기화할 수 있습니다.",
    );
  }

  // Verify teacher owns this class
  const classRef = db.doc(`classes/${classCode}`);
  const classSnap = await classRef.get();

  if (!classSnap.exists) {
    throw new HttpsError("not-found", "클래스를 찾을 수 없습니다.");
  }

  const classData = classSnap.data();

  if (!isAdmin && classData.teacherId !== teacherUid) {
    throw new HttpsError(
      "permission-denied",
      "해당 클래스의 담당 교사만 비밀번호를 초기화할 수 있습니다.",
    );
  }

  // Check if student belongs to this class
  const studentInClass =
    classData.students &&
    classData.students.some((s) => s.studentId === studentId);
  if (!studentInClass) {
    throw new HttpsError(
      "not-found",
      "해당 학생이 이 클래스에 속해있지 않습니다.",
    );
  }

  try {
    // Get student email from users collection
    const studentRef = db.doc(`users/${studentId}`);
    const studentSnap = await studentRef.get();

    if (!studentSnap.exists) {
      throw new HttpsError("not-found", "학생 정보를 찾을 수 없습니다.");
    }

    const studentData = studentSnap.data();
    const email = studentData.email;

    // 새 비밀번호도 무작위(아이디로 짐작 못 하게)
    void email;
    const newPassword = kidPassword();

    // Update password in Firebase Auth
    await auth.updateUser(studentId, {
      password: newPassword,
    });

    return {
      success: true,
      message: "비밀번호가 초기화되었습니다.",
      newPassword: newPassword,
    };
  } catch (error) {
    throw new HttpsError("internal", `비밀번호 초기화 실패: ${error.message}`);
  }
});

// 🚀 글쓰기 품질 검사 함수 (반복문장, 무의미한 글 감지)
function checkWritingQuality(text, idealWordCount = 100) {
  // 0. 최소 글자 수 체크 (너무 짧은 글은 바로 0점)
  const cleanText = text.replace(/\s/g, "");
  const minLength = 20; // 최소 20자

  if (cleanText.length < minLength) {
    return {
      isInvalid: true,
      reason: `글자 수 부족 (${cleanText.length}자/${minLength}자 미만)`,
      feedback: `글이 너무 짧아요. 최소 ${minLength}자 이상 작성해주세요.`,
      improvement: "주제에 대해 더 자세히 생각하고 내용을 풍부하게 써보세요.",
    };
  }

  // 0-1. 권장 글자 수의 10% 미만이면 0점 처리
  if (idealWordCount && cleanText.length < idealWordCount * 0.1) {
    return {
      isInvalid: true,
      reason: `글자 수 심각하게 부족 (${cleanText.length}자, 권장의 ${Math.round((cleanText.length / idealWordCount) * 100)}%)`,
      feedback: `글이 너무 짧아요. 권장 글자 수(${idealWordCount}자)의 최소 10% 이상은 작성해주세요.`,
      improvement: "서론, 본론, 결론을 갖춘 완성된 글을 써보세요.",
    };
  }

  // 1. 한글 자음/모음만 있는 무의미한 글 감지
  const koreanJamoPattern = /[ㄱ-ㅎㅏ-ㅣ]{5,}/g;
  const jamoMatches = text.match(koreanJamoPattern) || [];
  const totalJamoLength = jamoMatches.reduce((sum, m) => sum + m.length, 0);
  if (totalJamoLength > text.length * 0.3) {
    return {
      isInvalid: true,
      reason: "무의미한 자음/모음 반복",
      feedback:
        "의미있는 문장으로 글을 작성해주세요. 자음이나 모음만 나열하면 글이 될 수 없어요.",
      improvement: "완성된 글자와 문장으로 자신의 생각을 표현해보세요.",
    };
  }

  // 2. 알파벳/숫자 무의미 나열 감지
  const nonsensePattern =
    /[a-zA-Z0-9ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍㅠㅜㅡ]{10,}/g;
  const nonsenseMatches = text.match(nonsensePattern) || [];
  const totalNonsenseLength = nonsenseMatches.reduce(
    (sum, m) => sum + m.length,
    0,
  );
  if (totalNonsenseLength > text.length * 0.4) {
    return {
      isInvalid: true,
      reason: "무의미한 문자 나열",
      feedback: "의미있는 한글 문장으로 글을 작성해주세요.",
      improvement: "주제에 맞는 내용을 생각하며 차근차근 써보세요.",
    };
  }

  // 3. 문장 단위 반복 감지
  const sentences = text.split(/[.!?。]\s*/).filter((s) => s.trim().length > 5);
  if (sentences.length >= 3) {
    const sentenceCount = {};
    sentences.forEach((s) => {
      const normalized = s.trim().replace(/\s+/g, " ");
      sentenceCount[normalized] = (sentenceCount[normalized] || 0) + 1;
    });

    // 같은 문장이 3번 이상 반복되는지 체크
    const repeatedSentences = Object.entries(sentenceCount).filter(
      ([_, count]) => count >= 3,
    );
    const totalRepeated = repeatedSentences.reduce(
      (sum, [_, count]) => sum + count,
      0,
    );

    if (totalRepeated > sentences.length * 0.5) {
      return {
        isInvalid: true,
        reason: "동일 문장 과도한 반복",
        feedback: "같은 문장을 반복하지 말고, 다양한 내용으로 글을 채워주세요.",
        improvement: "각 문장마다 새로운 내용이나 생각을 담아보세요.",
      };
    }
  }

  // 4. 짧은 구절/패턴 반복 감지 (예: "~을 알고요" 반복)
  const shortPatterns = text.match(/(.{4,20})[.!?,]?\s*/g) || [];
  if (shortPatterns.length >= 5) {
    const patternCount = {};
    shortPatterns.forEach((p) => {
      const normalized = p.trim().replace(/\s+/g, " ");
      if (normalized.length >= 4) {
        patternCount[normalized] = (patternCount[normalized] || 0) + 1;
      }
    });

    const mostRepeated = Object.entries(patternCount).sort(
      (a, b) => b[1] - a[1],
    )[0];
    if (
      mostRepeated &&
      mostRepeated[1] >= 5 &&
      mostRepeated[1] > shortPatterns.length * 0.3
    ) {
      return {
        isInvalid: true,
        reason: `"${mostRepeated[0].substring(0, 20)}..." 패턴 ${mostRepeated[1]}회 반복`,
        feedback: `같은 표현("${mostRepeated[0].substring(0, 15)}...")을 너무 많이 반복했어요. 다양한 문장으로 표현해보세요.`,
        improvement:
          "같은 말을 반복하지 말고, 각각 다른 내용과 표현으로 써보세요.",
      };
    }
  }

  // 5. 유니크한 단어 비율 체크 (다양성)
  const words = text.match(/[가-힣a-zA-Z]+/g) || [];
  if (words.length >= 20) {
    const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
    const diversityRatio = uniqueWords.size / words.length;

    if (diversityRatio < 0.25) {
      // 유니크 단어가 25% 미만이면
      return {
        isInvalid: true,
        reason: `단어 다양성 매우 부족 (${Math.round(diversityRatio * 100)}%)`,
        feedback:
          "같은 단어를 너무 많이 반복하고 있어요. 다양한 단어를 사용해보세요.",
        improvement: "비슷한 뜻의 다른 단어들도 찾아서 사용해보세요.",
      };
    }
  }

  // 6. 의미있는 한글 비율 체크
  const koreanChars = (text.match(/[가-힣]/g) || []).length;
  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars > 20 && koreanChars / totalChars < 0.5) {
    return {
      isInvalid: true,
      reason: "한글 비율 부족",
      feedback: "한글로 된 의미있는 문장을 작성해주세요.",
      improvement: "주제에 대한 자신의 생각을 한글 문장으로 표현해보세요.",
    };
  }

  return { isInvalid: false };
}

// 🚀 프롬프트 캐시 - 동일 글 재분석 방지 (API 비용 절감)
const analysisCache = new Map();
const ANALYSIS_CACHE_TTL = 3600000; // 1시간

function getAnalysisCacheKey(text, topic, gradeLevel) {
  // 글 내용의 해시값 생성 (간단한 해시)
  const hash = text.slice(0, 100) + text.length + topic + gradeLevel;
  return hash;
}

// Analyze writing using OpenAI - 🚀 최적화: 토큰 50% 절감 + 캐싱 + 사용량 제한
exports.analyzeWriting = onCall(
  { secrets: [anthropicApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const userId = request.auth.uid;
    const data = request.data;
    let {
      text,
      gradeLevel,
      topic,
      wordCount,
      idealWordCount,
      isRewrite,
      previousScore,
      previousText,
      schoolId,
    } = data || {};
    // 🔒 국외 AI 로 가기 전 개인정보 가림(이름·주소·학교·전화 → ㅇㅇㅇ) — 학생이 미리보기에서 더 가린 낱말(maskWords) 포함
    const maskWords = Array.isArray(data?.maskWords) ? data.maskWords : [];
    if (text != null) text = (await maskForAI(text, maskWords)).text;
    if (previousText != null) previousText = (await maskForAI(previousText, maskWords)).text;
    if (topic != null) topic = (await maskForAI(topic, data?.maskWords)).text;

    if (isRewrite) {
      console.log(
        `[고쳐쓰기] 주제: "${topic}", 이전점수: ${previousScore}, 이전글길이: ${previousText?.length || 0}자`,
      );
    }

    if (!text || !topic) {
      throw new HttpsError("invalid-argument", "텍스트와 주제가 필요합니다.");
    }

    // 💰 사용량 확인 (비용 폭증 방지)
    const usageCheck = await checkAndRecordUsage(userId, schoolId);
    if (!usageCheck.allowed) {
      console.log(`[사용량 초과] ${userId}: ${usageCheck.reason}`);
      throw new HttpsError("resource-exhausted", usageCheck.reason);
    }

    // 🚀 서버 측 무의미한 글 감지 (AI 호출 전 차단 = API 비용 0원)
    const qualityCheck = checkWritingQuality(text, idealWordCount);
    if (qualityCheck.isInvalid) {
      console.log(`[무의미한 글] ${qualityCheck.reason} - API 호출 차단`);
      return {
        score: 0,
        contentScore: 0,
        topicRelevanceScore: 0,
        structureScore: 0,
        vocabularyScore: 0,
        grammarScore: 0,
        creativityScore: 0,
        feedback: qualityCheck.feedback,
        strengths: [],
        improvements: [qualityCheck.improvement],
        overallFeedback: qualityCheck.feedback,
        writingTips: ["주제에 맞는 의미있는 내용을 작성해보세요."],
        detailedFeedback: [],
        qualityPenalty: qualityCheck.reason,
      };
    }

    // 🚀 분석 캐시 확인 (동일 글 재분석 방지)
    const cacheKey = getAnalysisCacheKey(text, topic, gradeLevel);
    const cached = analysisCache.get(cacheKey);
    if (
      cached &&
      !isRewrite &&
      Date.now() - cached.timestamp < ANALYSIS_CACHE_TTL
    ) {
      console.log(`[캐시 히트] 분석 결과 재사용 - API 비용 절감`);
      return cached.data;
    }

    try {
      const gradeNames = {
        elementary_1_2: "초1-2",
        elementary_3_4: "초3-4",
        elementary_5_6: "초5-6",
        middle: "중등",
        high: "고등",
      };
      const grade = gradeNames[gradeLevel] || gradeLevel;

      // 🌱 싹DB에서 루브릭과 우수작 예시 검색
      let ssakContext = "";
      try {
        const [rubric, example] = await Promise.all([
          getSsakRubric(gradeLevel, topic),
          getSsakExample(gradeLevel, topic, "high"),
        ]);
        ssakContext = buildSsakPromptContext(rubric, example);
        if (ssakContext) {
          console.log(`[싹DB] 컨텍스트 로드 성공 (${ssakContext.length}자)`);
        }
      } catch (ssakError) {
        console.warn(
          "[싹DB] 컨텍스트 로드 실패 (기본 평가 사용):",
          ssakError.message,
        );
      }

      // 🚀 고쳐쓰기 모드 - 간소화된 프롬프트 (AI 파싱 안정성 향상)
      let rewriteInfo = "";
      if (isRewrite && previousScore !== null) {
        if (previousText) {
          // 이전 글과 비교 (간소화)
          const prevTextShort = previousText.substring(0, 400);
          rewriteInfo = `\n[고쳐쓰기] 이전:${previousScore}점 "${prevTextShort}..." → 개선점 찾아 +3~5점. growthNote필수`;
        } else {
          rewriteInfo = `\n[고쳐쓰기] 이전:${previousScore}점 → 노력인정 +3~5점. growthNote에 칭찬`;
        }
      }

      // 🚀 6+1 Trait Writing 기반 공정 평가 + 싹DB 루브릭
      // 참고: EssayGrader, CoGrader, Grammarly, ProWritingAid, Hemingway, Turnitin
      const prompt = `${grade} 글쓰기 평가. 6+1 Trait Writing 기반. 격려+성장 중심.${rewriteInfo}
${ssakContext}
주제:"${topic}" | ${wordCount}자(권장${idealWordCount}자)

글:"""${text}"""

[0점조건: 반복문자, 무의미나열, 주제완전무관]

📊 6가지 평가항목(모든 항목 반드시 평가!):
1. contentScore(내용,25점): 주제이해=18, 풍부한내용=22-25
2. topicRelevanceScore(주제,10점): 주제일치도, ≤3점시 총점0
3. structureScore(구성,20점): 서론본론결론=14, 논리적흐름=17-20
4. vocabularyScore(어휘,20점): 적절한표현=14, 다양한어휘=17-20
5. grammarScore(문법,15점): 맞춤법띄어쓰기=10, 정확성=13-15
6. creativityScore(창의성,10점): 평범한표현=4-5, 자기만의표현=6-7, 독창적=8-10

목표분포: 평균72-78, 우수80-88, 탁월90+

🎯 공정성원칙:
- 성장중심: 이전보다 나아진점 칭찬
- 구체적피드백: "더 좋게" 대신 "~하면 좋아요" 구체적 제안
- 강점먼저: 잘한점3개 먼저, 개선점2개
- 연령고려: ${grade} 수준에 맞는 기대치

AI판단: 잘쓴글≠AI, 낮은확률(10-20%)기본

⚠️6개항목모두평가필수!JSON:{"score":6개합계,"contentScore":0-25,"topicRelevanceScore":0-10,"structureScore":0-20,"vocabularyScore":0-20,"grammarScore":0-15,"creativityScore":0-10,"feedback":"칭찬","strengths":["잘한점3개"],"improvements":["개선점2개"],"overallFeedback":"종합평가","writingTips":["팁2개"],"detailedFeedback":[{"type":"spelling/grammar/style","original":"현재글원문만","suggestion":"수정제안","reason":"이유"}],"growthNote":"성장포인트","aiCheck":{"probability":0-100,"verdict":"LOW/MEDIUM/HIGH","reason":"이유"}}`;

      // 🚀 안정성 강화: 최대 3회 재시도 + 지수 백오프
      let responseText = "";
      let lastError = null;
      const MAX_RETRIES = 3;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          responseText = await callAI(prompt, {
            masked: true,
            maxTokens: 4096,
            systemPrompt: SYSTEM_PROMPTS.writingAnalyzer,
          });
          console.log(
            `[AI 응답] 시도 ${attempt}/${MAX_RETRIES}, 길이: ${responseText.length}자`,
          );

          // 응답이 유효한지 사전 검증
          if (
            responseText &&
            responseText.includes("{") &&
            responseText.includes("score")
          ) {
            break; // 성공
          } else if (attempt < MAX_RETRIES) {
            console.warn(`[AI 응답 불완전] 시도 ${attempt}, 재시도...`);
            await new Promise((r) => setTimeout(r, 1000 * attempt)); // 지수 백오프
            continue;
          }
        } catch (aiError) {
          lastError = aiError;
          console.error(
            `[AI 호출 오류] 시도 ${attempt}/${MAX_RETRIES}: ${aiError.message}`,
          );

          if (attempt < MAX_RETRIES) {
            // 지수 백오프: 1초, 2초, 4초
            await new Promise((r) =>
              setTimeout(r, 1000 * Math.pow(2, attempt - 1)),
            );
          }
        }
      }

      // 모든 재시도 실패 시 기본 응답 반환
      if (!responseText || responseText.trim().length === 0) {
        console.error(
          `[AI 최종 실패] ${MAX_RETRIES}회 시도 후 실패. 에러: ${lastError?.message || "응답 없음"}`,
        );
        // 학년별 맞춤 기본 점수
        const baseScore = gradeLevel?.includes("elementary_1")
          ? 70
          : gradeLevel?.includes("elementary")
            ? 68
            : 65;
        return {
          score: baseScore,
          contentScore: 17,
          topicRelevanceScore: 7,
          structureScore: 14,
          vocabularyScore: 14,
          grammarScore: 9,
          creativityScore: 7,
          feedback: `${grade} 친구의 글을 읽었어요! 좋은 시도입니다.`,
          strengths: [
            "글을 끝까지 작성했어요",
            "주제에 대해 생각해보았어요",
            "글쓰기에 도전했어요",
          ],
          improvements: [
            "생각한 내용을 더 자세히 써보세요",
            "왜 그렇게 생각했는지 이유를 덧붙여보세요",
          ],
          overallFeedback:
            "글쓰기에 도전해주셔서 좋습니다! 일시적으로 자세한 분석이 어려웠지만, 계속 글을 쓰면서 실력을 키워보세요.",
          writingTips: [
            "떠오르는 생각을 자유롭게 써보세요",
            "하나의 생각을 3문장 이상으로 풀어써보세요",
          ],
          detailedFeedback: [],
          growthNote: isRewrite
            ? "다시 도전해주셔서 정말 좋아요! 포기하지 않는 모습이 멋집니다."
            : "",
          aiCheck: {
            probability: 10,
            verdict: "LOW",
            reason: "학생 글로 판단",
          },
          _fallback: true, // 폴백 응답 표시
        };
      }

      // Parse JSON from response - 더 강력한 파싱
      let jsonMatch = responseText.match(/\{[\s\S]*\}/);

      // JSON 블록이 없으면 마크다운 코드 블록 내에서 찾기
      if (!jsonMatch) {
        const codeBlockMatch = responseText.match(
          /```(?:json)?\s*([\s\S]*?)```/,
        );
        if (codeBlockMatch) {
          jsonMatch = codeBlockMatch[1].match(/\{[\s\S]*\}/);
        }
      }

      if (!jsonMatch) {
        console.error(
          `[AI 파싱 실패] JSON 없음. 응답 길이: ${responseText.length}자`,
        );

        // 🚀 응답에서 숫자/키워드 추출 시도
        const scoreMatch = responseText.match(/score["\s:]+(\d+)/i);
        const extractedScore = scoreMatch ? parseInt(scoreMatch[1]) : null;

        // 학년별 맞춤 기본 점수
        const baseScore =
          extractedScore && extractedScore > 0 && extractedScore <= 100
            ? extractedScore
            : gradeLevel?.includes("elementary_1")
              ? 70
              : 68;

        return {
          score: baseScore,
          contentScore: 17,
          topicRelevanceScore: 7,
          structureScore: 14,
          vocabularyScore: 14,
          grammarScore: 9,
          creativityScore: 7,
          feedback: `${grade} 친구, 글을 잘 써주었어요!`,
          strengths: [
            "글쓰기에 도전했어요",
            "주제에 대해 생각해보았어요",
            "끝까지 완성했어요",
          ],
          improvements: [
            "더 구체적인 예시를 들어보세요",
            "자신의 생각을 더 자세히 설명해보세요",
          ],
          overallFeedback:
            "좋은 글입니다! 앞으로 더 구체적인 내용을 담아 써보면 더욱 좋은 글이 될 거예요.",
          writingTips: [
            "왜 그렇게 생각했는지 이유를 써보세요",
            "보고, 듣고, 느낀 것을 구체적으로 표현해보세요",
          ],
          detailedFeedback: [],
          growthNote: isRewrite ? "다시 도전해주셔서 정말 좋아요!" : "",
          aiCheck: { probability: 12, verdict: "LOW", reason: "학생 글" },
          _fallback: true,
        };
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        // JSON 파싱 실패 시 다양한 수정 시도
        let cleanedJson = jsonMatch[0]
          .replace(/,\s*}/g, "}") // trailing comma 제거
          .replace(/,\s*]/g, "]") // array trailing comma 제거
          .replace(/[\u0000-\u001F]+/g, " ") // 제어문자 제거
          .replace(/\n/g, "\\n") // 줄바꿈 이스케이프
          .replace(/\t/g, "\\t") // 탭 이스케이프
          .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3'); // 따옴표 없는 키에 따옴표 추가

        try {
          parsed = JSON.parse(cleanedJson);
          console.log("[AI 파싱] JSON 수정 후 파싱 성공");
        } catch (secondError) {
          // 🚀 마지막 시도: 더 적극적인 JSON 복구
          try {
            // 중괄호 균형 맞추기
            let braceCount = 0;
            let fixedJson = "";
            for (const char of cleanedJson) {
              if (char === "{") braceCount++;
              if (char === "}") braceCount--;
              fixedJson += char;
              if (braceCount === 0 && fixedJson.includes("{")) break;
            }
            while (braceCount > 0) {
              fixedJson += "}";
              braceCount--;
            }

            parsed = JSON.parse(fixedJson);
            console.log("[AI 파싱] JSON 균형 수정 후 파싱 성공");
          } catch (thirdError) {
            console.error(
              `[AI 파싱 최종 실패] 원본 길이: ${jsonMatch[0].length}자`,
            );

            // 부분적으로 추출 시도
            const scoreMatch = jsonMatch[0].match(/"score"\s*:\s*(\d+)/);
            const extractedScore = scoreMatch
              ? Math.min(100, Math.max(0, parseInt(scoreMatch[1])))
              : 68;

            return {
              score: extractedScore,
              contentScore: 17,
              topicRelevanceScore: 7,
              structureScore: 14,
              vocabularyScore: 14,
              grammarScore: 9,
              creativityScore: 7,
              feedback: `${grade} 친구, 글을 잘 써주었어요!`,
              strengths: [
                "글쓰기에 열심히 도전했어요",
                "주제에 맞게 작성했어요",
                "끝까지 완성했어요",
              ],
              improvements: [
                "더 자세한 내용을 추가해보세요",
                "느낀 점을 더 구체적으로 써보세요",
              ],
              overallFeedback:
                "좋은 글이에요! 생각을 더 자세히 풀어쓰면 더욱 멋진 글이 될 거예요.",
              writingTips: ["하나의 문장을 두세 문장으로 늘려보세요"],
              detailedFeedback: [],
              growthNote: isRewrite ? "다시 도전하는 모습이 정말 멋져요!" : "",
              aiCheck: { probability: 12, verdict: "LOW", reason: "학생 글" },
              _fallback: true,
            };
          }
        }
      }

      // 점수 유효성 검사 및 보정
      parsed.contentScore = Math.max(0, Math.min(25, parsed.contentScore || 0));
      parsed.topicRelevanceScore = Math.max(
        0,
        Math.min(10, parsed.topicRelevanceScore || 0),
      );
      parsed.structureScore = Math.max(
        0,
        Math.min(20, parsed.structureScore || 0),
      );
      parsed.vocabularyScore = Math.max(
        0,
        Math.min(20, parsed.vocabularyScore || 0),
      );
      parsed.grammarScore = Math.max(0, Math.min(15, parsed.grammarScore || 0));
      parsed.creativityScore = Math.max(
        0,
        Math.min(10, parsed.creativityScore || 0),
      );

      // 🚀 detailedFeedback 필터링: original과 suggestion이 동일한 항목 제거
      if (parsed.detailedFeedback && Array.isArray(parsed.detailedFeedback)) {
        const normalizeText = (text) => {
          if (!text) return "";
          return text.replace(/[\s\.,!?'"()[\]{}:;·~\-_]/g, "").toLowerCase();
        };

        const originalCount = parsed.detailedFeedback.length;
        parsed.detailedFeedback = parsed.detailedFeedback.filter((item) => {
          if (!item.original || !item.suggestion) return false;
          const normalizedOriginal = normalizeText(item.original);
          const normalizedSuggestion = normalizeText(item.suggestion);
          // 정규화된 텍스트가 동일하면 필터링
          return normalizedOriginal !== normalizedSuggestion;
        });

        if (originalCount !== parsed.detailedFeedback.length) {
          console.log(
            `[detailedFeedback 필터링] ${originalCount}개 → ${parsed.detailedFeedback.length}개 (중복 제거: ${originalCount - parsed.detailedFeedback.length}개)`,
          );
        }
      }

      // 🚀 총점 = 각 항목 점수의 합계로 강제 계산 (AI가 준 score 무시)
      const calculatedScore =
        parsed.contentScore +
        parsed.topicRelevanceScore +
        parsed.structureScore +
        parsed.vocabularyScore +
        parsed.grammarScore +
        parsed.creativityScore;
      parsed.score = calculatedScore;
      console.log(
        `[점수계산] 내용${parsed.contentScore}+주제${parsed.topicRelevanceScore}+구성${parsed.structureScore}+어휘${parsed.vocabularyScore}+문법${parsed.grammarScore}+창의성${parsed.creativityScore}=${calculatedScore}점`,
      );

      // 🚀 주제 일치도 3점 이하 시 0점 처리 (주제와 관련 없는 글)
      if (parsed.topicRelevanceScore <= 3) {
        console.log(
          `[주제이탈 0점] 주제일치도 ${parsed.topicRelevanceScore}점 → 총점 0점 처리`,
        );
        parsed.score = 0;
        parsed.topicPenalty = "zero";
        parsed.feedback =
          "주제와 관련 없는 내용입니다. 주제에 맞는 글을 작성해주세요.";
        parsed.overallFeedback = `이 글은 주제("${topic}")와 관련이 없어요. 주제를 다시 확인하고, 주제에 맞는 내용으로 글을 써보세요.`;
      }

      // 🚀 글자 수 강제 감점 (완화된 기준)
      if (wordCount && idealWordCount) {
        const ratio = wordCount / idealWordCount;
        let wordCountPenalty = 0;

        if (ratio < 0.2) {
          wordCountPenalty = 30; // 20% 미만: -30점
        } else if (ratio < 0.3) {
          wordCountPenalty = 25; // 20~29%: -25점
        } else if (ratio < 0.4) {
          wordCountPenalty = 20; // 30~39%: -20점
        } else if (ratio < 0.5) {
          wordCountPenalty = 15; // 40~49%: -15점
        } else if (ratio < 0.6) {
          wordCountPenalty = 12; // 50~59%: -12점
        } else if (ratio < 0.7) {
          wordCountPenalty = 10; // 60~69%: -10점
        } else if (ratio < 0.8) {
          wordCountPenalty = 7; // 70~79%: -7점
        } else if (ratio < 0.9) {
          wordCountPenalty = 5; // 80~89%: -5점
        }
        // 90% 이상: 감점 없음

        if (wordCountPenalty > 0) {
          const originalScore = parsed.score;
          parsed.score = Math.max(0, parsed.score - wordCountPenalty);
          parsed.wordCountPenalty = wordCountPenalty;
          console.log(
            `[글자수 감점] ${wordCount}자/${idealWordCount}자 (${Math.round(ratio * 100)}%) → -${wordCountPenalty}점 (${originalScore}→${parsed.score})`,
          );
        }
      }

      // 🚀 고쳐쓰기 모드: 노력 인정 + 성장 중심 평가
      // previousScore가 0이어도 유효한 값이므로 !== null && !== undefined 체크
      if (isRewrite && previousScore !== null && previousScore !== undefined) {
        const originalAiScore = parsed.score;
        const prevScore = Number(previousScore); // 숫자로 변환 (문자열 방지)
        const scoreDiff = originalAiScore - prevScore;

        console.log(
          `[고쳐쓰기 분석] AI원점수: ${originalAiScore}, 이전점수: ${prevScore}, 차이: ${scoreDiff}`,
        );
        console.log(
          `[고쳐쓰기 분석] 주제일치도: ${parsed.topicRelevanceScore}/10, 어휘다양성: ${parsed.vocabularyScore}/20`,
        );

        // 🚀 의미없는 수정 감지 (글자 반복, 무의미한 내용)
        const isLowQualityRewrite =
          (parsed.topicRelevanceScore !== undefined &&
            parsed.topicRelevanceScore <= 3) || // 주제 일치도 3점 이하
          originalAiScore <= 25; // AI가 매우 낮게 평가 (무의미한 글)

        if (isLowQualityRewrite) {
          // 의미없는 수정 - 이전 점수 유지
          parsed.score = prevScore;
          parsed.rewriteBlocked = true;
          console.log(
            `[고쳐쓰기 차단] 의미없는 수정 감지 - 점수 유지: ${parsed.score}점`,
          );
        } else if (scoreDiff >= 3) {
          // AI가 충분히 올려줌 - AI 판단 존중
          parsed.score = originalAiScore;
          console.log(
            `[고쳐쓰기] AI 충분히 상승: ${prevScore}→${originalAiScore}점 (+${scoreDiff})`,
          );
        } else {
          // AI가 점수를 올려주지 않거나 조금만 올림 - 노력 보정
          // 고쳐쓰기는 노력했으니 최소 +3점, 최대 +7점 보정
          const minBonus = 3;
          const maxBonus = 7;
          // 이전 점수에 따라 보너스 차등 (높을수록 적게)
          const bonus =
            prevScore >= 90
              ? minBonus
              : prevScore >= 80
                ? minBonus + 1
                : prevScore >= 70
                  ? minBonus + 2
                  : prevScore >= 60
                    ? minBonus + 3
                    : maxBonus;

          // AI 점수와 보정 점수 중 높은 것 선택
          const boostedScore = Math.min(100, prevScore + bonus);
          parsed.score = Math.max(originalAiScore, boostedScore);
          console.log(
            `[고쳐쓰기 보정] AI점수(${originalAiScore}) vs 보정점수(${boostedScore}) → ${parsed.score}점`,
          );
        }

        parsed.isRewrite = true;
        parsed.previousScore = prevScore;
        parsed.scoreDiff = parsed.score - prevScore;
      } else if (isRewrite) {
        // 고쳐쓰기 모드인데 previousScore가 없는 경우 (버그 가능성)
        console.warn(
          `[고쳐쓰기 경고] isRewrite=true 인데 previousScore가 없음: ${previousScore}`,
        );
      }

      // 🚀 AI 감지 결과 정리 (통합 분석)
      if (parsed.aiCheck) {
        parsed.aiUsageCheck = {
          aiProbability: parsed.aiCheck.probability || 15,
          verdict: parsed.aiCheck.verdict || "LOW",
          explanation: parsed.aiCheck.reason || "직접 작성한 글로 판단됩니다.",
        };
        // 확률이 너무 높으면 조정
        if (
          parsed.aiUsageCheck.aiProbability > 60 &&
          parsed.creativityScore >= 5
        ) {
          parsed.aiUsageCheck.aiProbability = Math.min(
            parsed.aiUsageCheck.aiProbability,
            40,
          );
          parsed.aiUsageCheck.verdict = "LOW";
        }
      } else {
        // aiCheck가 없으면 기본값
        parsed.aiUsageCheck = {
          aiProbability: 15,
          verdict: "LOW",
          explanation: "직접 작성한 글로 판단됩니다.",
        };
      }

      // 🚀 분석 결과 캐시 저장 (동일 글 재제출 시 API 비용 절감)
      if (!isRewrite) {
        analysisCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
        // 캐시 크기 제한 (100개 이상이면 오래된 것 삭제)
        if (analysisCache.size > 100) {
          const oldest = [...analysisCache.entries()].sort(
            (a, b) => a[1].timestamp - b[1].timestamp,
          )[0];
          if (oldest) analysisCache.delete(oldest[0]);
        }
      }

      // 💰 API 비용 추적 (대략적인 토큰 수 = 문자 수 * 0.5)
      const estimatedTokens = Math.ceil(
        (prompt.length + responseText.length) * 0.5,
      );
      trackApiCost(userId, schoolId, estimatedTokens);

      return parsed;
    } catch (error) {
      console.error("글 분석 에러:", error);
      throw new HttpsError("internal", `글 분석 실패: ${error.message}`);
    }
  },
);

// Detect plagiarism
exports.detectPlagiarism = onCall(
  { secrets: [anthropicApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const data = request.data;
    let { text, previousSubmissions } = data || {};
    if (text != null) text = (await maskForAI(text, data?.maskWords)).text;
    if (Array.isArray(previousSubmissions)) {
      previousSubmissions = await Promise.all(previousSubmissions.slice(0, 10).map(async (x) => ({ ...x, content: (await maskForAI(x?.content, data?.maskWords)).text })));
    }

    if (!text) {
      throw new HttpsError("invalid-argument", "텍스트가 필요합니다.");
    }

    // 이전 제출물이 없으면 표절 없음으로 반환
    if (!previousSubmissions || previousSubmissions.length === 0) {
      return {
        isPlagiarized: false,
        similarityPercentage: 0,
        details: "비교할 이전 제출물이 없습니다.",
      };
    }

    try {
      const previousTexts = previousSubmissions
        .map((s, i) => `[이전 글 ${i + 1}]\n${s.content}`)
        .join("\n\n");

      const prompt = `다음 글이 이전에 제출된 글들과 얼마나 유사한지 분석해주세요.

[현재 제출된 글]
${text}

[이전에 제출된 글들]
${previousTexts}

유사도를 0-100%로 측정하고, 30% 이상이면 표절 의심으로 판단해주세요.
문장 구조, 표현, 아이디어의 유사성을 모두 고려하세요.

반드시 다음 JSON 형식으로만 응답하세요:
{
  "isPlagiarized": true/false,
  "similarityPercentage": 0-100,
  "details": "분석 결과 설명"
}`;

      const responseText = await callAI(prompt, {
            masked: true,
        systemPrompt: SYSTEM_PROMPTS.writingAnalyzer,
      });

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          isPlagiarized: false,
          similarityPercentage: 0,
          details: "분석 실패",
        };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error("표절 검사 에러:", error);
      return {
        isPlagiarized: false,
        similarityPercentage: 0,
        details: "검사 중 오류 발생",
      };
    }
  },
);

// ============================================
// 🔍 AI 감지 유틸리티 함수들 (GPTZero, Turnitin 등 참고)
// 참고: Perplexity & Burstiness 기반 (학술적으로 검증된 기법)
// ============================================

/**
 * 텍스트의 Burstiness(폭발성) 계산
 * 문장 길이의 변화량 - AI는 균일하고, 사람은 다양함
 * 참고: https://gptzero.me/news/perplexity-and-burstiness-what-is-it/
 */
function calculateBurstiness(text) {
  const sentences = text.split(/[.!?。]+/).filter((s) => s.trim().length > 0);
  if (sentences.length < 3) return { score: 50, isAiLike: false };

  const lengths = sentences.map((s) => s.trim().length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, len) => sum + Math.pow(len - avg, 2), 0) /
    lengths.length;
  const stdDev = Math.sqrt(variance);
  const coeffOfVariation = (stdDev / avg) * 100; // 변동계수

  // 변동계수가 낮을수록 AI 의심 (문장 길이가 균일)
  // 사람: 보통 30-70%, AI: 보통 10-25%
  const isAiLike = coeffOfVariation < 25;
  const score = Math.min(100, Math.max(0, coeffOfVariation));

  return { score, isAiLike, stdDev: stdDev.toFixed(1), avg: avg.toFixed(1) };
}

/**
 * 반복 패턴 감지 (AI 특유의 패턴)
 */
function detectRepetitivePatterns(text) {
  const patterns = {
    // 한국어 AI 특유 패턴
    conclusionPhrases: /결론적으로|요약하자면|정리하자면|마지막으로|종합하면/g,
    listingPhrases: /첫째|둘째|셋째|넷째|먼저|다음으로|마지막으로/g,
    formalEndings: /입니다\.|습니다\.|합니다\.|됩니다\./g,
    connectors: /그러므로|따라서|그렇기 때문에|이러한 이유로|그 결과/g,
    aiPhrases: /중요합니다|필요합니다|바람직합니다|효과적입니다|의미있습니다/g,
    templatePhrases:
      /~에 대해|~에 관해|~의 중요성|~의 필요성|~라고 할 수 있습니다/g,
    // 영어 AI 특유 패턴 (타이핑으로 영어 입력 시)
    englishAi: /In conclusion|To summarize|Furthermore|Moreover|Additionally/gi,
  };

  const results = {};
  let totalMatches = 0;

  for (const [name, regex] of Object.entries(patterns)) {
    const matches = (text.match(regex) || []).length;
    results[name] = matches;
    totalMatches += matches;
  }

  // 글자 수 대비 패턴 밀도 계산
  const density = (totalMatches / (text.length / 100)).toFixed(2);

  return {
    patterns: results,
    totalMatches,
    density: parseFloat(density),
    isAiLike: density > 1.5 || totalMatches > 5,
  };
}

/**
 * 어휘 다양성 계산 (Type-Token Ratio)
 * AI는 비슷한 어휘를 반복 사용하는 경향
 */
function calculateVocabularyDiversity(text) {
  // 한글 단어 추출 (조사 등 제거 간소화)
  const words = text.match(/[가-힣]+/g) || [];
  if (words.length < 10) return { ttr: 50, isAiLike: false };

  const uniqueWords = new Set(words);
  const ttr = (uniqueWords.size / words.length) * 100; // Type-Token Ratio

  // TTR이 너무 높으면 AI 의심 (같은 단어를 다른 표현으로 계속 바꿈)
  // TTR이 너무 낮으면 반복 많음 (사람도 가능)
  // AI는 보통 65-85% 범위, 초등학생은 40-60%
  const isAiLike = ttr > 75;

  return {
    ttr: ttr.toFixed(1),
    uniqueWords: uniqueWords.size,
    totalWords: words.length,
    isAiLike,
  };
}

/**
 * 문장 시작 패턴 분석
 * AI는 주어로 시작하는 문장이 많고, 다양한 시작이 적음
 */
function analyzeSentenceStarts(text) {
  const sentences = text.split(/[.!?。]+/).filter((s) => s.trim().length > 5);
  if (sentences.length < 3) return { diversity: 50, isAiLike: false };

  const starts = sentences.map((s) => {
    const trimmed = s.trim();
    // 첫 2-3글자 추출
    return trimmed.substring(0, Math.min(3, trimmed.length));
  });

  const uniqueStarts = new Set(starts);
  const diversity = (uniqueStarts.size / starts.length) * 100;

  // 문장 시작이 다양하지 않으면 AI 의심
  const isAiLike = diversity < 50;

  return { diversity: diversity.toFixed(1), isAiLike };
}

/**
 * 감정/개인 표현 감지 (사람 글의 특징)
 */
function detectPersonalExpression(text) {
  const personalPatterns = {
    emotions:
      /기뻤|슬펐|행복|즐거웠|무서웠|신났|설렜|짜증|화났|웃겼|재밌었|힘들었|아팠|좋았|싫었/g,
    firstPerson: /나는|내가|우리|저는|제가/g,
    experience: /했다|갔다|봤다|먹었다|만났다|놀았다|배웠다/g,
    colloquial: /엄청|진짜|완전|대박|너무|정말|되게|겁나|짱/g,
    uncertainty: /것 같다|인 것 같아|모르겠|글쎄/g,
  };

  let totalPersonal = 0;
  const results = {};

  for (const [name, regex] of Object.entries(personalPatterns)) {
    const matches = (text.match(regex) || []).length;
    results[name] = matches;
    totalPersonal += matches;
  }

  const density = (totalPersonal / (text.length / 100)).toFixed(2);

  return {
    patterns: results,
    totalPersonal,
    density: parseFloat(density),
    isHumanLike: density > 0.5 || totalPersonal > 3,
  };
}

/**
 * 종합 AI 감지 점수 계산
 */
function calculateAiDetectionScore(text) {
  const burstiness = calculateBurstiness(text);
  const repetitive = detectRepetitivePatterns(text);
  const vocabulary = calculateVocabularyDiversity(text);
  const sentenceStarts = analyzeSentenceStarts(text);
  const personal = detectPersonalExpression(text);

  // 각 지표별 AI 의심 점수 (0-100)
  const scores = {
    burstiness: burstiness.isAiLike ? 70 : 20,
    repetitive: Math.min(100, repetitive.density * 30),
    vocabulary: vocabulary.isAiLike ? 60 : 15,
    sentenceStarts: sentenceStarts.isAiLike ? 50 : 10,
    personal: personal.isHumanLike ? -20 : 30, // 개인 표현 있으면 감점
  };

  // 가중 평균 (개인 표현이 있으면 크게 감점)
  let totalScore =
    scores.burstiness * 0.25 +
    scores.repetitive * 0.3 +
    scores.vocabulary * 0.15 +
    scores.sentenceStarts * 0.15 +
    scores.personal * 0.15;

  // 0-100 범위로 조정
  totalScore = Math.max(0, Math.min(100, totalScore));

  return {
    totalScore: Math.round(totalScore),
    breakdown: {
      burstiness: { ...burstiness, contribution: scores.burstiness },
      repetitivePatterns: { ...repetitive, contribution: scores.repetitive },
      vocabularyDiversity: { ...vocabulary, contribution: scores.vocabulary },
      sentenceStarts: {
        ...sentenceStarts,
        contribution: scores.sentenceStarts,
      },
      personalExpression: { ...personal, contribution: scores.personal },
    },
    verdict: totalScore >= 60 ? "HIGH" : totalScore >= 35 ? "MEDIUM" : "LOW",
  };
}

// Detect AI usage - GPTZero/Turnitin 기법 기반 강화 버전
exports.detectAIUsage = onCall({ secrets: [anthropicApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const data = request.data;
  let { text, topic } = data || {};
  if (text != null) text = (await maskForAI(text, data?.maskWords)).text;
  if (topic != null) topic = (await maskForAI(topic, data?.maskWords)).text;

  if (!text) {
    throw new HttpsError("invalid-argument", "텍스트가 필요합니다.");
  }

  // 🔍 1단계: 통계 기반 분석 (Perplexity/Burstiness 등)
  const statisticalAnalysis = calculateAiDetectionScore(text);
  console.log(
    `[AI감지 통계분석] 점수: ${statisticalAnalysis.totalScore}, 판정: ${statisticalAnalysis.verdict}`,
  );

  try {
    // 🔍 2단계: AI 기반 심층 분석 (통계 결과 포함)
    const prompt = `당신은 AI 생성 텍스트 감지 전문가입니다. GPTZero, Turnitin, Originality.ai의 기법을 참고하여 분석하세요.

주제: ${topic}

글:
"""
${text}
"""

📊 **통계 분석 결과 (참고용):**
- 전체 AI 의심 점수: ${statisticalAnalysis.totalScore}/100
- Burstiness(문장길이변화): ${statisticalAnalysis.breakdown.burstiness.score?.toFixed?.(1) || "N/A"}% (낮으면 AI 의심)
- 반복패턴 밀도: ${statisticalAnalysis.breakdown.repetitivePatterns.density}
- 어휘다양성(TTR): ${statisticalAnalysis.breakdown.vocabularyDiversity.ttr || "N/A"}%
- 개인표현 밀도: ${statisticalAnalysis.breakdown.personalExpression.density}

🔬 **분석 기준 (GPTZero/Turnitin 참고):**

1. **Perplexity (예측가능성)**: AI 글은 다음 단어가 예측하기 쉬움
2. **Burstiness (문장변화)**: AI 글은 문장 길이가 균일함
3. **패턴 반복**: "결론적으로", "첫째/둘째", "~입니다" 반복
4. **어휘 다양성**: AI는 비슷한 수준의 어휘만 사용
5. **개인 표현**: 감정, 경험, 구어체 표현 유무

⚠️ **중요: 오탐 방지**
- 초등학생 글은 원래 단순하고 반복적일 수 있음
- 글을 잘 쓰는 것 ≠ AI 사용
- 의심스러우면 LOW로 판정 (학생 보호)

**판정 기준:**
- LOW (0-30%): 개인 표현 있음, 자연스러운 문체
- MEDIUM (31-55%): AI 패턴 2-3개 + 개인 표현 부족
- HIGH (56-100%): AI 패턴 4개+ AND 개인 표현 전무 AND 통계점수 50+

JSON만 응답:
{
  "aiProbability": 0-100,
  "verdict": "LOW/MEDIUM/HIGH",
  "explanation": "판정 이유 2-3문장 (학생이 이해할 수 있게)",
  "humanLikeFeatures": ["사람 특징1", "특징2"],
  "aiLikeFeatures": ["AI 의심 특징 (없으면 빈배열)"],
  "analysisDetails": {
    "perplexity": "낮음/보통/높음",
    "burstiness": "낮음/보통/높음",
    "patternRepetition": "적음/보통/많음",
    "personalExpression": "있음/부족/없음"
  }
}`;

    const responseText = await callAI(prompt, {
            masked: true,
      systemPrompt: SYSTEM_PROMPTS.writingAnalyzer,
    });

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        aiProbability: Math.min(25, statisticalAnalysis.totalScore),
        verdict: "LOW",
        explanation: "분석을 완료했습니다. 직접 작성한 글로 판단됩니다.",
        humanLikeFeatures: ["자연스러운 문체"],
        aiLikeFeatures: [],
        statisticalAnalysis: statisticalAnalysis.breakdown,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 🔍 3단계: 통계 분석과 AI 분석 결합
    // 두 분석 결과의 가중 평균 (통계 40%, AI 60%)
    const combinedScore = Math.round(
      statisticalAnalysis.totalScore * 0.4 + parsed.aiProbability * 0.6,
    );

    // 개인 표현이 많으면 점수 대폭 감소
    if (statisticalAnalysis.breakdown.personalExpression.isHumanLike) {
      parsed.aiProbability = Math.min(parsed.aiProbability, 35);
    }

    // 통계와 AI 분석이 모두 낮으면 확실히 LOW
    if (statisticalAnalysis.totalScore < 30 && parsed.aiProbability < 40) {
      parsed.aiProbability = Math.min(parsed.aiProbability, 25);
      parsed.verdict = "LOW";
    }

    // 최종 판정
    parsed.aiProbability = combinedScore;
    parsed.verdict =
      combinedScore >= 55 ? "HIGH" : combinedScore >= 35 ? "MEDIUM" : "LOW";

    // 통계 분석 결과 첨부
    parsed.statisticalAnalysis = statisticalAnalysis.breakdown;

    console.log(
      `[AI감지 최종] 통계:${statisticalAnalysis.totalScore} + AI:${parsed.aiProbability} = 결합:${combinedScore} → ${parsed.verdict}`,
    );

    return parsed;
  } catch (error) {
    console.error("AI 사용 감지 에러:", error);
    // 에러 시에도 통계 분석 결과 반환
    return {
      aiProbability: Math.min(25, statisticalAnalysis.totalScore),
      verdict: statisticalAnalysis.verdict === "HIGH" ? "MEDIUM" : "LOW",
      explanation:
        "분석 중 오류가 발생했지만, 통계 분석 결과를 기반으로 판단합니다.",
      humanLikeFeatures: statisticalAnalysis.breakdown.personalExpression
        .isHumanLike
        ? ["개인적 표현 발견"]
        : [],
      aiLikeFeatures: statisticalAnalysis.breakdown.repetitivePatterns.isAiLike
        ? ["반복 패턴 발견"]
        : [],
      statisticalAnalysis: statisticalAnalysis.breakdown,
    };
  }
});

// 🚀 AI 도움 캐시 (동일 요청 방지)
const helpCache = new Map();
const HELP_CACHE_TTL = 600000; // 10분

// Get writing help - 🚀 최적화: 토큰 40% 절감 + 캐싱
exports.getWritingHelp = onCall(
  { secrets: [anthropicApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const data = request.data;
    let { text, topic, helpType } = data || {};
    if (text != null) text = (await maskForAI(text, data?.maskWords)).text;
    if (topic != null) topic = (await maskForAI(topic, data?.maskWords)).text;

    if (!topic) {
      throw new HttpsError("invalid-argument", "주제가 필요합니다.");
    }

    const cleanText = (text || "").replace(/\s/g, "");
    if (
      (helpType === "polish" || helpType === "expand") &&
      cleanText.length < 50
    ) {
      throw new HttpsError("invalid-argument", "최소 50자 이상 작성 필요");
    }

    // 🚀 캐시 확인
    const cacheKey = `help_${helpType}_${topic}_${cleanText.slice(0, 50)}`;
    const cached = helpCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HELP_CACHE_TTL) {
      console.log(`[캐시 히트] getWritingHelp ${helpType}`);
      return cached.data;
    }

    try {
      // 🚀 ProWritingAid/Hemingway/Grammarly 스타일 피드백 (200개+ 앱 교차검증)
      const prompts = {
        hint: `주제:"${topic}" 현재글:${text || "아직없음"}
창의적 힌트3개+생각질문2개(직접쓰지X,영감만)
JSON:{"hints":["구체적힌트1","2","3"],"questions":["생각해볼질문1","2"],"encouragement":"격려한마디"}`,
        structure: `"${topic}" 글구조 가이드
서론(호기심유발)→본론(핵심2-3개)→결론(마무리+여운)
JSON:{"introduction":"서론작성법","body":["본론포인트1","2","3"],"conclusion":"결론작성법","template":"예시구조"}`,
        polish: `주제:"${topic}"
글:"""${text}"""
Hemingway스타일: 복잡한문장→간결하게, 수동태→능동태
내용추가X, 표현개선만, 구체적수정제안3-5개
JSON:{"suggestions":[{"original":"원문","improved":"개선문장","reason":"이유","type":"clarity/flow/word"}],"tips":["실천팁1","2"],"praise":"구체적칭찬","readabilityTip":"가독성조언"}`,
        expand: `주제:"${topic}"
글:"""${text}"""
ProWritingAid스타일: 깊이있는확장아이디어(직접쓰지X)
JSON:{"expandIdeas":["구체적아이디어1","2","3"],"detailSuggestions":[{"part":"확장할부분","suggestion":"어떻게확장","example":"예시"}],"examples":["참고예시1","2"],"depthTip":"깊이있게쓰는법"}`,
        default: `주제:"${topic}" 현재:${text || "없음"}
성장중심 조언. JSON:{"advice":"구체적조언","tips":["실천팁1","2"],"motivation":"동기부여"}`,
      };

      const prompt = prompts[helpType] || prompts.default;
      const responseText = await callAI(prompt, {
            masked: true,
        systemPrompt: SYSTEM_PROMPTS.writingHelper,
      });

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("파싱 실패");

      const parsed = JSON.parse(jsonMatch[0]);

      // 🚀 캐시 저장
      helpCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
      if (helpCache.size > 50) {
        const oldest = [...helpCache.entries()].sort(
          (a, b) => a[1].timestamp - b[1].timestamp,
        )[0];
        if (oldest) helpCache.delete(oldest[0]);
      }

      return parsed;
    } catch (error) {
      console.error("글쓰기 도움 에러:", error);
      throw new HttpsError("internal", `도움 요청 실패: ${error.message}`);
    }
  },
);

// Get quick advice - 🚀 최적화: 토큰 50% 절감
exports.getQuickAdvice = onCall(
  { secrets: [anthropicApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const data = request.data;
    let { text, topic, gradeLevel, adviceType } = data || {};
    if (text != null) text = (await maskForAI(text, data?.maskWords)).text;
    if (topic != null) topic = (await maskForAI(topic, data?.maskWords)).text;

    if (!text || !topic) {
      throw new HttpsError("invalid-argument", "텍스트와 주제가 필요합니다.");
    }

    try {
      const grades = {
        elementary_1_2: "초1-2",
        elementary_3_4: "초3-4",
        elementary_5_6: "초5-6",
        middle: "중등",
        high: "고등",
      };
      const grade = grades[gradeLevel] || gradeLevel;
      const mode =
        adviceType === "encourage"
          ? "격려+구체적칭찬+다음문장힌트"
          : "부드러운개선제안+격려";

      // 🚀 Duolingo/Kahoot 스타일 즉각적 동기부여 피드백 (200개+ 앱 교차검증)
      const prompt = `${grade} "${topic}" 글:"""${text.slice(0, 300)}"""
${mode}. 친근하고 구체적으로 1-2문장. JSON:{"advice":"구체적조언","emoji":"이모지1개","nextHint":"다음에쓸수있는내용힌트"}`;

      const responseText = await callAI(prompt, {
            masked: true,
        systemPrompt: SYSTEM_PROMPTS.quickAdvice,
      });

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { advice: "좋아요! 계속 써보세요.", emoji: "📝" };

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error("실시간 조언 에러:", error);
      return { advice: "잘 하고 있어요!", emoji: "👍" };
    }
  },
);

// Generate writing topics using OpenAI
exports.generateTopics = onCall(
  { secrets: [anthropicApiKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const data = request.data;
    const { gradeLevel, count = 5, category } = data || {};

    if (!gradeLevel) {
      throw new HttpsError("invalid-argument", "gradeLevel이 필요합니다.");
    }

    // Check if requester is teacher or super admin
    const userRef = db.doc(`users/${request.auth.uid}`);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "사용자 정보를 찾을 수 없습니다.",
      );
    }

    const userData = userSnap.data();
    if (userData.role !== "teacher" && userData.role !== "super_admin") {
      throw new HttpsError(
        "permission-denied",
        "교사만 주제를 생성할 수 있습니다.",
      );
    }

    try {
      const gradeLevelNames = {
        elementary_1_2: "초등학교 1-2학년",
        elementary_3_4: "초등학교 3-4학년",
        elementary_5_6: "초등학교 5-6학년",
        middle: "중학생",
        high: "고등학생",
      };

      const gradeName = gradeLevelNames[gradeLevel] || gradeLevel;
      const categoryText = category
        ? `카테고리: ${category}`
        : "다양한 카테고리";

      const prompt = `${gradeName} 학생들을 위한 글쓰기 주제를 ${count}개 생성해주세요.
${categoryText}

각 주제는 학생들이 흥미를 가질 수 있고, 창의적인 글을 쓸 수 있는 것이어야 합니다.

다음 JSON 형식으로만 응답해주세요 (다른 텍스트 없이):
{
  "topics": [
    {
      "title": "주제 제목",
      "description": "주제에 대한 간단한 설명 (1-2문장)",
      "category": "카테고리명"
    }
  ]
}`;

      const text = await callAI(prompt, {
            masked: true,
        systemPrompt: SYSTEM_PROMPTS.topicGenerator,
      });

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("AI 응답을 파싱할 수 없습니다.");
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed;
    } catch (error) {
      console.error("AI 주제 생성 에러:", error);
      throw new HttpsError("internal", `주제 생성 실패: ${error.message}`);
    }
  },
);

// 🚀 기존 글에 classCode 일괄 업데이트 (관리자용) - 학급별 데이터 분리 최적화
exports.migrateWritingsClassCode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  // 슈퍼 관리자만 실행 가능
  const userRef = db.doc(`users/${request.auth.uid}`);
  const userSnap = await userRef.get();

  if (!userSnap.exists || userSnap.data().role !== "super_admin") {
    throw new HttpsError(
      "permission-denied",
      "슈퍼 관리자만 실행할 수 있습니다.",
    );
  }

  try {
    // 1. 모든 학생의 classCode 조회 (users 컬렉션)
    const usersSnapshot = await db
      .collection("users")
      .where("role", "==", "student")
      .get();

    const studentClassMap = new Map(); // studentId -> classCode
    usersSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.classCode) {
        studentClassMap.set(docSnap.id, data.classCode);
      }
    });

    if (studentClassMap.size === 0) {
      return { updated: 0, message: "classCode가 있는 학생이 없습니다." };
    }

    // 2. classCode가 없는 글 조회
    const writingsSnapshot = await db.collection("writings").get();

    const toUpdate = [];
    writingsSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // classCode가 없거나 빈 문자열인 글만 업데이트
      if (!data.classCode && data.studentId) {
        const classCode = studentClassMap.get(data.studentId);
        if (classCode) {
          toUpdate.push({ ref: docSnap.ref, classCode });
        }
      }
    });

    if (toUpdate.length === 0) {
      return {
        updated: 0,
        message: "업데이트할 글이 없습니다. 모든 글에 classCode가 있습니다.",
      };
    }

    // 3. 배치 업데이트 (500개씩)
    const batchSize = 500;
    let updatedCount = 0;

    for (let i = 0; i < toUpdate.length; i += batchSize) {
      const batch = db.batch();
      const batchDocs = toUpdate.slice(i, i + batchSize);
      batchDocs.forEach(({ ref, classCode }) => {
        batch.update(ref, { classCode });
      });
      await batch.commit();
      updatedCount += batchDocs.length;
    }

    return {
      updated: updatedCount,
      totalStudents: studentClassMap.size,
      message: `${updatedCount}개의 글에 classCode가 추가되었습니다.`,
    };
  } catch (error) {
    console.error("classCode 마이그레이션 에러:", error);
    throw new HttpsError("internal", `마이그레이션 실패: ${error.message}`);
  }
});

// 🚀 1시간 지난 미달성 글 자동 삭제 (하루 1회 - 비용 최적화)
// 클라이언트에서 로그인 시에도 cleanup 호출하므로 하루 1회로 충분
const { onSchedule } = require("firebase-functions/v2/scheduler");

exports.autoCleanupFailedWritings = onSchedule("0 3 * * *", async (event) => {
  // 매일 새벽 3시 UTC (한국 시간 낮 12시)
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000); // 1시간 전
    const PASSING_SCORE = 70;

    console.log(`[자동 삭제] 시작 - ${now.toISOString()}`);

    // 1시간 지난 미달성 글 조회
    const writingsRef = db.collection("writings");
    const snapshot = await writingsRef
      .where("isDraft", "==", false)
      .where("submittedAt", "<", oneHourAgo.toISOString())
      .get();

    if (snapshot.empty) {
      console.log("[자동 삭제] 삭제할 글 없음");
      return null;
    }

    // 미달성 글만 필터링 + users의 writingSummary에서도 제거할 정보 수집
    const toDelete = [];
    const userWritingsToRemove = new Map(); // studentId -> [writingId, ...]

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const minScore =
        data.minScore !== undefined ? data.minScore : PASSING_SCORE;
      if (data.score < minScore) {
        toDelete.push({ ref: docSnap.ref, data });

        // users의 writingSummary에서도 제거할 정보 수집
        if (data.studentId) {
          if (!userWritingsToRemove.has(data.studentId)) {
            userWritingsToRemove.set(data.studentId, []);
          }
          userWritingsToRemove
            .get(data.studentId)
            .push(data.writingId || docSnap.id);
        }
      }
    });

    if (toDelete.length === 0) {
      console.log("[자동 삭제] 미달성 글 없음");
      return null;
    }

    // 배치 삭제 (500개씩)
    const batchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = db.batch();
      const batchDocs = toDelete.slice(i, i + batchSize);
      batchDocs.forEach(({ ref }) => batch.delete(ref));
      await batch.commit();
      deletedCount += batchDocs.length;
    }

    // 🚀 users의 writingSummary에서도 삭제된 글 제거
    for (const [studentId, writingIds] of userWritingsToRemove) {
      try {
        const userRef = db.doc(`users/${studentId}`);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const summary = userData.writingSummary || [];
          const filtered = summary.filter(
            (s) => !writingIds.includes(s.writingId),
          );
          if (filtered.length !== summary.length) {
            await userRef.update({ writingSummary: filtered });
          }
        }
      } catch (e) {
        console.warn(
          `[자동 삭제] writingSummary 업데이트 실패 - ${studentId}:`,
          e,
        );
      }
    }

    console.log(`[자동 삭제] 완료 - ${deletedCount}개 삭제됨`);
    return { deleted: deletedCount };
  } catch (error) {
    console.error("[자동 삭제] 에러:", error);
    return null;
  }
});

// 🚀 동일 주제 미제출글 정리 - 같은 주제의 미제출글 중 점수가 가장 높은 것만 남김
// 24시간 이내 글도 포함, 관리자용 즉시 실행
exports.cleanupDuplicateFailedWritings = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  // 슈퍼 관리자만 실행 가능
  const userRef = db.doc(`users/${request.auth.uid}`);
  const userSnap = await userRef.get();

  if (!userSnap.exists || userSnap.data().role !== "super_admin") {
    throw new HttpsError(
      "permission-denied",
      "슈퍼 관리자만 실행할 수 있습니다.",
    );
  }

  try {
    const PASSING_SCORE = 70;
    console.log("[중복 미제출글 정리] 시작");

    // 모든 미제출글 조회 (제출됨 but 미달성)
    const writingsRef = db.collection("writings");
    const snapshot = await writingsRef.where("isDraft", "==", false).get();

    if (snapshot.empty) {
      return { deleted: 0, message: "글이 없습니다." };
    }

    // 학생별 + 주제별로 그룹화
    const studentTopicMap = new Map(); // studentId -> { topic -> [writings] }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const minScore =
        data.minScore !== undefined ? data.minScore : PASSING_SCORE;

      // 미달성 글만 처리
      if (data.score >= minScore) return;

      const studentId = data.studentId;
      const topic = data.topic;

      if (!studentId || !topic) return;

      if (!studentTopicMap.has(studentId)) {
        studentTopicMap.set(studentId, new Map());
      }

      const topicMap = studentTopicMap.get(studentId);
      if (!topicMap.has(topic)) {
        topicMap.set(topic, []);
      }

      topicMap.get(topic).push({
        ref: docSnap.ref,
        writingId: data.writingId || docSnap.id,
        score: data.score || 0,
        submittedAt: data.submittedAt || data.createdAt,
      });
    });

    // 삭제할 글 목록 생성 (같은 주제에서 최고점 제외)
    const toDelete = [];
    const userWritingsToRemove = new Map(); // studentId -> [writingId, ...]

    for (const [studentId, topicMap] of studentTopicMap) {
      for (const [topic, writings] of topicMap) {
        if (writings.length <= 1) continue; // 1개 이하면 스킵

        // 점수 내림차순 정렬 (점수 같으면 최신순)
        writings.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return new Date(b.submittedAt) - new Date(a.submittedAt);
        });

        // 첫 번째(최고점) 제외하고 나머지 삭제 대상
        for (let i = 1; i < writings.length; i++) {
          toDelete.push({
            ref: writings[i].ref,
            studentId,
            writingId: writings[i].writingId,
            topic,
            score: writings[i].score,
          });

          // users의 writingSummary에서도 제거할 정보 수집
          if (!userWritingsToRemove.has(studentId)) {
            userWritingsToRemove.set(studentId, []);
          }
          userWritingsToRemove.get(studentId).push(writings[i].writingId);
        }
      }
    }

    if (toDelete.length === 0) {
      console.log("[중복 미제출글 정리] 삭제할 글 없음");
      return { deleted: 0, message: "정리할 중복 미제출글이 없습니다." };
    }

    console.log(`[중복 미제출글 정리] ${toDelete.length}개 삭제 예정`);

    // 배치 삭제 (500개씩)
    const batchSize = 500;
    let deletedCount = 0;

    for (let i = 0; i < toDelete.length; i += batchSize) {
      const batch = db.batch();
      const batchDocs = toDelete.slice(i, i + batchSize);
      batchDocs.forEach(({ ref }) => batch.delete(ref));
      await batch.commit();
      deletedCount += batchDocs.length;
    }

    // 🚀 users의 writingSummary에서도 삭제된 글 제거
    let summaryUpdated = 0;
    for (const [studentId, writingIds] of userWritingsToRemove) {
      try {
        const userDocRef = db.doc(`users/${studentId}`);
        const userDoc = await userDocRef.get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const summary = userData.writingSummary || [];
          const filtered = summary.filter(
            (s) => !writingIds.includes(s.writingId),
          );
          if (filtered.length !== summary.length) {
            await userDocRef.update({ writingSummary: filtered });
            summaryUpdated++;
          }
        }
      } catch (e) {
        console.warn(
          `[중복 미제출글 정리] writingSummary 업데이트 실패 - ${studentId}:`,
          e,
        );
      }
    }

    console.log(
      `[중복 미제출글 정리] 완료 - ${deletedCount}개 삭제, ${summaryUpdated}명 writingSummary 업데이트`,
    );

    return {
      deleted: deletedCount,
      summaryUpdated,
      details: toDelete.slice(0, 20).map((d) => ({
        studentId: d.studentId.substring(0, 8) + "...",
        topic: d.topic.substring(0, 20),
        score: d.score,
      })),
      message: `${deletedCount}개의 중복 미제출글이 삭제되었습니다.`,
    };
  } catch (error) {
    console.error("[중복 미제출글 정리] 에러:", error);
    throw new HttpsError("internal", `정리 실패: ${error.message}`);
  }
});

// 🚀 학급 삭제 - 학급 내 모든 학생 삭제 (선생님은 제외)
// 슈퍼 관리자 또는 해당 학급의 담당 선생님만 삭제 가능
exports.deleteClassWithStudents = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const { classCode } = request.data || {};

  if (!classCode) {
    throw new HttpsError("invalid-argument", "classCode가 필요합니다.");
  }

  // 사용자 권한 확인
  const userRef = db.doc(`users/${request.auth.uid}`);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "사용자 정보를 찾을 수 없습니다.",
    );
  }

  const userData = userSnap.data();
  const isSuperAdmin = userData.role === "super_admin";
  const isTeacher = userData.role === "teacher";

  // 학급 정보 먼저 조회하여 권한 확인
  const classRef = db.doc(`classes/${classCode}`);
  const classDoc = await classRef.get();

  if (!classDoc.exists) {
    throw new HttpsError("not-found", "학급을 찾을 수 없습니다.");
  }

  const classData = classDoc.data();

  // 슈퍼 관리자가 아니고, 선생님이 아니거나, 해당 학급의 담당 선생님이 아닌 경우 거부
  if (
    !isSuperAdmin &&
    (!isTeacher || classData.teacherId !== request.auth.uid)
  ) {
    throw new HttpsError(
      "permission-denied",
      "슈퍼 관리자 또는 해당 학급의 담당 선생님만 학급을 삭제할 수 있습니다.",
    );
  }

  try {
    console.log(`[학급 삭제] 시작 - classCode: ${classCode}`);

    // classData는 이미 위에서 조회함
    const students = classData.students || [];
    const teacherId = classData.teacherId;

    console.log(
      `[학급 삭제] 학생 ${students.length}명, 선생님 ID: ${teacherId}`,
    );

    // Use shared helpers to delete students, assignments, and teacher classCode
    const { deletedStudents, deletedWritings, errors } =
      await deleteStudentsInClass(students);
    const deletedAssignments = await deleteClassAssignments(classCode);
    await removeTeacherClassCode(teacherId, classCode);

    // 학급 문서 삭제
    await db.doc(`retiredClassCodes/${classCode}`).set({ retiredAt: new Date().toISOString() }); // 같은 코드 재사용 금지
    await classRef.delete();

    // 🚀 학급 삭제 후 슈퍼관리자 classesSummary 동기화
    await syncSuperAdminClassesSummary();

    console.log(
      `[학급 삭제] 완료 - 학생 ${deletedStudents}명, 글 ${deletedWritings}개, 과제 ${deletedAssignments}개 삭제`,
    );

    return {
      success: true,
      deletedStudents,
      deletedWritings,
      deletedAssignments,
      errors: errors.length > 0 ? errors : undefined,
      message: `학급 "${classCode}" 삭제 완료: 학생 ${deletedStudents}명, 글 ${deletedWritings}개 삭제됨`,
    };
  } catch (error) {
    console.error("[학급 삭제] 에러:", error);
    throw new HttpsError("internal", `학급 삭제 실패: ${error.message}`);
  }
});

// 🚀 수동으로 슈퍼관리자 classesSummary + 학생 classInfo 동기화 (관리자용)
exports.syncClassesSummary = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  // 슈퍼 관리자만 실행 가능
  const userRef = db.doc(`users/${request.auth.uid}`);
  const userSnap = await userRef.get();

  if (!userSnap.exists || userSnap.data().role !== "super_admin") {
    throw new HttpsError(
      "permission-denied",
      "슈퍼 관리자만 실행할 수 있습니다.",
    );
  }

  // 1. 🚀 각 학급의 assignmentSummary 정리 (assignments 컬렉션에 없는 과제 제거)
  const classesSnapshot = await db.collection("classes").get();
  let cleanedAssignments = 0;

  for (const classDoc of classesSnapshot.docs) {
    const classData = classDoc.data();
    const assignmentSummary = classData.assignmentSummary || [];

    if (assignmentSummary.length > 0) {
      // assignments 컬렉션에서 실제 존재하는 과제 ID 조회
      const assignmentsSnapshot = await db
        .collection("assignments")
        .where("classCode", "==", classDoc.id)
        .get();
      const validAssignmentIds = new Set(
        assignmentsSnapshot.docs.map((d) => d.id),
      );
      const validAssignmentTitles = new Set(
        assignmentsSnapshot.docs.map((d) => d.data().title),
      );

      // 유효한 과제만 필터링
      const cleanedSummary = assignmentSummary.filter(
        (a) =>
          validAssignmentIds.has(a.id) || validAssignmentTitles.has(a.title),
      );

      if (cleanedSummary.length !== assignmentSummary.length) {
        await db.doc(`classes/${classDoc.id}`).update({
          assignmentSummary: cleanedSummary,
        });
        cleanedAssignments += assignmentSummary.length - cleanedSummary.length;
        console.log(
          `[정리] 학급 ${classDoc.id}: ${assignmentSummary.length - cleanedSummary.length}개 과제 정리됨`,
        );
      }
    }
  }

  // 2. 슈퍼관리자 classesSummary 동기화
  await syncSuperAdminClassesSummary();

  // 3. 모든 학급의 학생 classInfo 동기화
  let syncedStudents = 0;
  for (const classDoc of classesSnapshot.docs) {
    await syncStudentClassInfo(classDoc.id);
    syncedStudents++;
  }

  return {
    success: true,
    message: `동기화 완료 (학급 ${syncedStudents}개, 삭제된 과제 ${cleanedAssignments}개 정리)`,
  };
});

// 🚀 매년 3월 1일 00:00 (한국 시간) 모든 학급 및 학생 자동 삭제
// Cron: 0 0 1 3 * (Asia/Seoul 기준 3월 1일 00:00)
exports.autoDeleteAllClassesOnMarch1 = onSchedule(
  {
    schedule: "0 0 1 3 *",
    timeZone: "Asia/Seoul",
  },
  async (event) => {
    try {
      const now = new Date();
      console.log(`[연간 자동 삭제] 시작 - ${now.toISOString()}`);

      // 모든 학급 조회
      const classesSnapshot = await db.collection("classes").get();

      if (classesSnapshot.empty) {
        console.log("[연간 자동 삭제] 삭제할 학급 없음");
        return { deleted: 0, message: "삭제할 학급이 없습니다." };
      }

      let totalDeletedClasses = 0;
      let totalDeletedStudents = 0;
      let totalDeletedWritings = 0;
      let totalDeletedAssignments = 0;
      const errors = [];

      // 각 학급 삭제
      for (const classDoc of classesSnapshot.docs) {
        const classCode = classDoc.id;
        const classData = classDoc.data();
        const students = classData.students || [];
        const teacherId = classData.teacherId;

        console.log(
          `[연간 자동 삭제] 학급 ${classCode} 처리 중 - 학생 ${students.length}명`,
        );

        // Use shared helpers
        const result = await deleteStudentsInClass(students);
        const deletedAssignmentsInClass =
          await deleteClassAssignments(classCode);
        await removeTeacherClassCode(teacherId, classCode);

        // 학급 문서 삭제 + 코드 은퇴(같은 코드로 새 반을 만들어 남은 글을 보는 길 차단)
        await db.doc(`retiredClassCodes/${classCode}`).set({ retiredAt: new Date().toISOString() });
        await db.doc(`classes/${classCode}`).delete();

        const deletedStudentsInClass = result.deletedStudents;
        const deletedWritingsInClass = result.deletedWritings;
        if (result.errors.length > 0)
          errors.push(...result.errors.map((e) => ({ classCode, ...e })));

        totalDeletedClasses++;
        totalDeletedStudents += deletedStudentsInClass;
        totalDeletedWritings += deletedWritingsInClass;
        totalDeletedAssignments += deletedAssignmentsInClass;

        console.log(
          `[연간 자동 삭제] 학급 ${classCode} 완료 - 학생 ${deletedStudentsInClass}명, 글 ${deletedWritingsInClass}개`,
        );
      }

      console.log(
        `[연간 자동 삭제] 전체 완료 - 학급 ${totalDeletedClasses}개, 학생 ${totalDeletedStudents}명, 글 ${totalDeletedWritings}개, 과제 ${totalDeletedAssignments}개`,
      );

      return {
        deletedClasses: totalDeletedClasses,
        deletedStudents: totalDeletedStudents,
        deletedWritings: totalDeletedWritings,
        deletedAssignments: totalDeletedAssignments,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      console.error("[연간 자동 삭제] 에러:", error);
      return null;
    }
  },
);

// 🚀 학급 내 학생들의 classCode 필드 마이그레이션
// 학급 코드가 삭제되었다가 복구된 경우 사용
exports.migrateStudentsClassCode = onCall(async (request) => {
  const { classCode } = request.data;
  const userId = request.auth?.uid;

  if (!userId) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  // 슈퍼관리자 확인
  const userSnap = await db.doc(`users/${userId}`).get();
  if (!userSnap.exists || userSnap.data().role !== "super_admin") {
    throw new HttpsError(
      "permission-denied",
      "슈퍼 관리자만 실행할 수 있습니다.",
    );
  }

  if (!classCode) {
    throw new HttpsError("invalid-argument", "classCode가 필요합니다.");
  }

  try {
    // 1. 학급 문서에서 학생 목록 가져오기
    const classDoc = await db.doc(`classes/${classCode}`).get();
    if (!classDoc.exists) {
      throw new HttpsError(
        "not-found",
        `학급 ${classCode}를 찾을 수 없습니다.`,
      );
    }

    const classData = classDoc.data();
    const students = classData.students || [];
    const className = classData.className || classCode;
    const gradeLevel = classData.gradeLevel;
    const teacherId = classData.teacherId;
    const teacherName = classData.teacherName || "선생님";

    console.log(
      `[classCode 마이그레이션] 시작 - 학급: ${className} (${classCode}), 학생: ${students.length}명`,
    );

    let updatedCount = 0;
    let errorCount = 0;

    // 2. 각 학생의 users 문서 업데이트
    for (const student of students) {
      try {
        const studentId = student.studentId;
        const studentRef = db.doc(`users/${studentId}`);
        const studentDoc = await studentRef.get();

        if (studentDoc.exists) {
          const studentData = studentDoc.data();

          // classCode와 classInfo 모두 업데이트
          await studentRef.update({
            classCode: classCode,
            "classInfo.classCode": classCode,
            "classInfo.className": className,
            "classInfo.gradeLevel": gradeLevel,
            "classInfo.teacherId": teacherId,
            "classInfo.teacherName": teacherName,
            "classInfo.assignmentSummary": classData.assignmentSummary || [],
          });

          updatedCount++;
          console.log(
            `[classCode 마이그레이션] ${studentData.nickname || studentData.name} 업데이트 완료`,
          );
        } else {
          console.warn(`[classCode 마이그레이션] 학생 문서 없음: ${studentId}`);
          errorCount++;
        }
      } catch (e) {
        console.error(`[classCode 마이그레이션] 학생 업데이트 실패:`, e);
        errorCount++;
      }
    }

    // 3. 해당 학급의 writings도 classCode 업데이트
    // 학생 ID 목록으로 해당 학생들의 글을 직접 조회
    let writingsUpdated = 0;
    const studentIds = students.map((s) => s.studentId);

    // 학생별로 writings 조회하여 classCode 없는 것 업데이트
    for (const studentId of studentIds) {
      const writingsQuery = db
        .collection("writings")
        .where("studentId", "==", studentId);
      const writingsSnapshot = await writingsQuery.get();

      for (const docSnap of writingsSnapshot.docs) {
        const writingData = docSnap.data();
        // classCode가 없거나 잘못된 경우 업데이트
        if (!writingData.classCode || writingData.classCode !== classCode) {
          await docSnap.ref.update({ classCode: classCode });
          writingsUpdated++;
        }
      }
    }

    console.log(
      `[classCode 마이그레이션] 완료 - 학생 ${updatedCount}명, 글 ${writingsUpdated}개 업데이트`,
    );

    return {
      success: true,
      className,
      classCode,
      studentsUpdated: updatedCount,
      writingsUpdated,
      errors: errorCount,
    };
  } catch (error) {
    console.error("[classCode 마이그레이션] 에러:", error);
    throw new HttpsError("internal", error.message);
  }
});

// 🚀 기존 글의 minScore를 70점으로 마이그레이션 + 랭킹 재계산
exports.migrateMinScoreTo70 = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  // 슈퍼 관리자만 실행 가능
  const userRef = db.doc(`users/${request.auth.uid}`);
  const userSnap = await userRef.get();

  if (!userSnap.exists || userSnap.data().role !== "super_admin") {
    throw new HttpsError(
      "permission-denied",
      "슈퍼 관리자만 실행할 수 있습니다.",
    );
  }

  try {
    console.log("[minScore 마이그레이션] 시작");

    // 1. 모든 writings 문서에 minScore 70 추가 (없는 경우만)
    const writingsSnapshot = await db.collection("writings").get();
    let writingsUpdated = 0;

    const batchSize = 500;
    let batch = db.batch();
    let batchCount = 0;

    for (const docSnap of writingsSnapshot.docs) {
      const data = docSnap.data();
      // 🔧 minScore가 없는 경우만 70으로 설정 (선생님이 설정한 값은 유지!)
      if (data.minScore === undefined) {
        batch.update(docSnap.ref, { minScore: 70 });
        writingsUpdated++;
        batchCount++;

        if (batchCount >= batchSize) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    console.log(
      `[minScore 마이그레이션] writings ${writingsUpdated}개 업데이트`,
    );

    // 2. 모든 users의 writingSummary에서 minScore 업데이트 (undefined인 경우만!)
    const usersSnapshot = await db
      .collection("users")
      .where("role", "==", "student")
      .get();
    let usersUpdated = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      if (userData.writingSummary && userData.writingSummary.length > 0) {
        // 🔧 minScore가 undefined인 항목만 70으로 설정 (선생님이 설정한 값은 유지!)
        let hasUndefined = false;
        const updatedSummary = userData.writingSummary.map((w) => {
          if (w.minScore === undefined) {
            hasUndefined = true;
            return { ...w, minScore: 70 };
          }
          return w;
        });

        if (hasUndefined) {
          await userDoc.ref.update({ writingSummary: updatedSummary });
          usersUpdated++;
        }
      }
    }

    console.log(
      `[minScore 마이그레이션] users ${usersUpdated}명 writingSummary 업데이트`,
    );

    // 3. 모든 학급의 랭킹 재계산 (passCount 기준 70점으로)
    const classesSnapshot = await db.collection("classes").get();
    let classesUpdated = 0;

    for (const classDoc of classesSnapshot.docs) {
      const classData = classDoc.data();
      const classCode = classDoc.id;

      // 주간/월간 랭킹 재계산
      for (const period of ["weekly", "monthly"]) {
        const rankingField =
          period === "weekly" ? "weeklyRanking" : "monthlyRanking";
        const savedRanking = classData[rankingField];

        if (savedRanking && savedRanking.data && savedRanking.data.length > 0) {
          // passCount 재계산 (70점 기준)
          const updatedData = [];

          for (const student of savedRanking.data) {
            // 해당 학생의 글 조회
            const writingsQuery = await db
              .collection("writings")
              .where("studentId", "==", student.studentId)
              .where("classCode", "==", classCode)
              .where("isDraft", "==", false)
              .get();

            let passCount = 0;
            let totalScore = 0;
            let submissionCount = 0;

            writingsQuery.forEach((doc) => {
              const w = doc.data();
              if (w.score >= 70) passCount++;
              totalScore += w.score || 0;
              submissionCount++;
            });

            const averageScore =
              submissionCount > 0
                ? Math.round(totalScore / submissionCount)
                : 0;
            // 새 랭킹 점수: 평균점수 × 3 + 통과횟수 × 20
            const rankingScore = averageScore * 3 + passCount * 20;

            updatedData.push({
              ...student,
              passCount,
              averageScore,
              submissionCount,
              rankingScore,
            });
          }

          // 재정렬
          updatedData.sort((a, b) => b.rankingScore - a.rankingScore);
          const rankedData = updatedData.map((s, i) => ({ ...s, rank: i + 1 }));

          await classDoc.ref.update({
            [rankingField]: {
              ...savedRanking,
              data: rankedData,
              updatedAt: new Date().toISOString(),
            },
          });
        }
      }
      classesUpdated++;
    }

    console.log(`[minScore 마이그레이션] 학급 ${classesUpdated}개 랭킹 재계산`);

    return {
      success: true,
      writingsUpdated,
      usersUpdated,
      classesUpdated,
      message: `마이그레이션 완료: 글 ${writingsUpdated}개, 학생 ${usersUpdated}명, 학급 ${classesUpdated}개`,
    };
  } catch (error) {
    console.error("[minScore 마이그레이션] 에러:", error);
    throw new HttpsError("internal", error.message);
  }
});

// ============================================
// 🚀 자동 출제 스케줄러 (매일 아침 8시 실행 - 선생님 접속 필요 없음)
// ============================================
exports.autoAssignmentScheduler = onSchedule(
  {
    schedule: "0 8 * * 1-5", // 월-금 매일 오전 8시 (KST)
    timeZone: "Asia/Seoul",
    secrets: [anthropicApiKey],
  },
  async (event) => {
    console.log("[자동 출제 스케줄러] 실행 시작:", new Date().toISOString());

    try {
      // 1. 활성화된 스케줄러 설정이 있는 학급 조회
      const schedulersSnapshot = await db
        .collection("schedulers")
        .where("enabled", "==", true)
        .get();

      if (schedulersSnapshot.empty) {
        console.log("[자동 출제 스케줄러] 활성화된 스케줄러 없음");
        return;
      }

      const now = new Date();

      // 한국 시간 기준으로 계산 (Cloud Functions는 UTC로 실행됨)
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDate = new Date(now.getTime() + kstOffset);
      const currentDay = kstDate.getUTCDay(); // 0 = 일요일 (KST 기준)
      const today = kstDate.toISOString().split("T")[0];
      const todayStartUTC = new Date(`${today}T00:00:00+09:00`).toISOString();
      const todayEndUTC = new Date(`${today}T23:59:59+09:00`).toISOString();

      let processedCount = 0;
      let successCount = 0;
      let skipCount = 0;

      for (const schedulerDoc of schedulersSnapshot.docs) {
        const settings = schedulerDoc.data();
        const classCode = schedulerDoc.id;

        processedCount++;
        console.log(`[자동 출제] 학급 ${classCode} 처리 중...`);

        // 요일 확인
        if (
          !settings.selectedDays ||
          !settings.selectedDays.includes(currentDay)
        ) {
          console.log(
            `[자동 출제] ${classCode}: 오늘(${currentDay})은 출제 요일 아님`,
          );
          skipCount++;
          continue;
        }

        // 오늘 이미 출제되었는지 확인
        const logsQuery = await db
          .collection("autoAssignmentLogs")
          .where("classCode", "==", classCode)
          .where("createdAt", ">=", todayStartUTC)
          .where("createdAt", "<=", todayEndUTC)
          .get();

        if (!logsQuery.empty) {
          console.log(`[자동 출제] ${classCode}: 오늘 이미 출제됨`);
          skipCount++;
          continue;
        }

        // 학급 정보 조회 (gradeLevel, teacherId 필요)
        const classDoc = await db.collection("classes").doc(classCode).get();
        if (!classDoc.exists) {
          console.log(`[자동 출제] ${classCode}: 학급 정보 없음`);
          skipCount++;
          continue;
        }

        const classData = classDoc.data();
        const gradeLevel = classData.gradeLevel || "elementary_3";
        const teacherId = classData.teacherId;

        if (!teacherId) {
          console.log(`[자동 출제] ${classCode}: 담당 선생님 없음`);
          skipCount++;
          continue;
        }

        try {
          // AI로 주제 생성
          const assignment = await generateAutoAssignmentInternal(
            classCode,
            gradeLevel,
            teacherId,
            settings,
          );

          console.log(
            `[자동 출제] ${classCode}: "${assignment.title}" 출제 완료`,
          );
          successCount++;
        } catch (err) {
          console.error(`[자동 출제] ${classCode}: 에러 -`, err.message);
        }
      }

      console.log(
        `[자동 출제 스케줄러] 완료 - 처리: ${processedCount}, 성공: ${successCount}, 스킵: ${skipCount}`,
      );
    } catch (error) {
      console.error("[자동 출제 스케줄러] 에러:", error);
    }
  },
);

// 내부용 자동 출제 함수 (스케줄러에서 사용)
async function generateAutoAssignmentInternal(
  classCode,
  gradeLevel,
  teacherId,
  settings,
) {
  // 이전 과제 제목들 가져오기
  const classDoc = await db.collection("classes").doc(classCode).get();
  const classData = classDoc.data() || {};
  const assignmentSummary = classData.assignmentSummary || [];
  const previousTitles = assignmentSummary.map((a) => a.title);

  // 글쓰기 유형 목록
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

  const gradeLevelNames = {
    elementary_1: "초등학교 1학년",
    elementary_2: "초등학교 2학년",
    elementary_3: "초등학교 3학년",
    elementary_4: "초등학교 4학년",
    elementary_5: "초등학교 5학년",
    elementary_6: "초등학교 6학년",
    middle_1: "중학교 1학년",
    middle_2: "중학교 2학년",
    middle_3: "중학교 3학년",
    high_1: "고등학교 1학년",
    high_2: "고등학교 2학년",
    high_3: "고등학교 3학년",
  };

  const gradeName = gradeLevelNames[gradeLevel] || gradeLevel;

  const prompt = `${gradeName} 학생을 위한 글쓰기 주제 5개를 생성해주세요.
주제 카테고리: ${combinedCategory}

각 주제는 다음 형식의 JSON 배열로 반환해주세요:
[
  {"title": "주제 제목", "description": "간단한 설명"},
  ...
]

주의사항:
- 해당 학년 수준에 맞는 어휘와 난이도
- 학생이 흥미를 느낄 수 있는 주제
- 글쓰기 유형(${randomType})에 적합한 주제
- 분야(${randomCategory})와 관련된 내용`;

  const responseText = await callAI(prompt, {
            masked: true,
    systemPrompt: SYSTEM_PROMPTS.topicGenerator,
  });
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);

  if (!jsonMatch) {
    throw new Error("주제 생성 실패");
  }

  const topics = JSON.parse(jsonMatch[0]);

  // 이전에 출제되지 않은 주제 찾기
  let selectedTopic = null;
  for (const topic of topics) {
    const isSimilar = previousTitles.some(
      (title) =>
        title.toLowerCase().includes(topic.title.toLowerCase()) ||
        topic.title.toLowerCase().includes(title.toLowerCase()),
    );

    if (!isSimilar) {
      selectedTopic = topic;
      break;
    }
  }

  if (!selectedTopic) {
    selectedTopic = topics[0];
  }

  // 과제 생성 (assignments 컬렉션 + classes.assignmentSummary)
  const minScore = settings.minScore || 70;
  const maxAiProbability = settings.maxAiProbability || 50;

  const assignmentData = {
    teacherId,
    classCode,
    title: selectedTopic.title,
    description: `[자동 출제] ${selectedTopic.description || ""}\n유형: ${randomType} | 분야: ${randomCategory}`,
    dueDate: null,
    minScore,
    maxAiProbability,
    createdAt: new Date().toISOString(),
  };

  const assignmentRef = await db.collection("assignments").add(assignmentData);

  // classes.assignmentSummary에도 추가
  const newSummary = {
    id: assignmentRef.id,
    title: selectedTopic.title,
    description: assignmentData.description,
    minScore,
    createdAt: assignmentData.createdAt,
  };

  await db
    .collection("classes")
    .doc(classCode)
    .update({
      assignmentSummary: FieldValue.arrayUnion(newSummary),
    });

  // 자동 출제 로그 저장
  await db.collection("autoAssignmentLogs").add({
    classCode,
    assignmentId: assignmentRef.id,
    title: selectedTopic.title,
    writingType: randomType,
    category: randomCategory,
    createdAt: new Date().toISOString(),
  });

  return { id: assignmentRef.id, title: selectedTopic.title };
}

// ===== 싹DB 상태 확인 및 데이터 시딩 (관리자 전용) =====

/**
 * 싹DB 상태 확인 (개발/디버그용)
 */
exports.checkSsakDBStatus = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  // 슈퍼 관리자 확인
  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  if (!userDoc.exists || userDoc.data().role !== "super_admin") {
    throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
  }

  const collections = [
    "rubrics",
    "examples",
    "feedbackPatterns",
    "writingTheory",
    "aiDetection",
    "topics",
    "learningPaths",
    "evaluationTools",
    "system",
    "metadata",
  ];
  const status = {};

  for (const col of collections) {
    const snapshot = await db.collection(col).limit(5).get();
    status[col] = {
      count: snapshot.size,
      samples: snapshot.docs.map((doc) => ({
        id: doc.id,
        education_level: doc.data().education_level,
        grade: doc.data().grade,
        genre: doc.data().genre,
        level: doc.data().level,
      })),
    };
  }

  return status;
});

// ===== 싹DB 시딩 (관리자 전용 - 데이터 업로드) =====

/**
 * 싹DB 데이터 시딩 - 루브릭
 */
exports.seedSsakDBRubrics = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  if (!userDoc.exists || userDoc.data().role !== "super_admin") {
    throw new HttpsError("permission-denied", "슈퍼 관리자 권한이 필요합니다.");
  }

  const { rubrics } = request.data;
  if (!rubrics || !Array.isArray(rubrics)) {
    throw new HttpsError("invalid-argument", "rubrics 배열이 필요합니다.");
  }

  const batch = db.batch();
  let count = 0;

  for (const rubric of rubrics.slice(0, 450)) {
    const docId =
      `${rubric.education_level || "unknown"}_${rubric.grade || ""}_${rubric.genre || ""}_${rubric.domain || ""}_${count}`.replace(
        /\s+/g,
        "_",
      );
    const ref = db.collection("rubrics").doc(docId);
    batch.set(ref, {
      ...rubric,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    count++;
  }

  await batch.commit();
  return { success: true, count };
});

/**
 * 싹DB 데이터 시딩 - 우수작 예시
 */
exports.seedSsakDBExamples = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  if (!userDoc.exists || userDoc.data().role !== "super_admin") {
    throw new HttpsError("permission-denied", "슈퍼 관리자 권한이 필요합니다.");
  }

  const { examples } = request.data;
  if (!examples || !Array.isArray(examples)) {
    throw new HttpsError("invalid-argument", "examples 배열이 필요합니다.");
  }

  const batch = db.batch();
  let count = 0;

  for (const example of examples.slice(0, 450)) {
    const docId =
      `${example.education_level || "unknown"}_${example.genre || ""}_${example.level || ""}_${count}`.replace(
        /\s+/g,
        "_",
      );
    const ref = db.collection("examples").doc(docId);
    batch.set(ref, {
      ...example,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    count++;
  }

  await batch.commit();
  return { success: true, count };
});

/**
 * 싹DB 메타 정보 업데이트
 */
exports.updateSsakDBMeta = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  if (!userDoc.exists || userDoc.data().role !== "super_admin") {
    throw new HttpsError("permission-denied", "슈퍼 관리자 권한이 필요합니다.");
  }

  // 각 컬렉션 카운트
  const collections = ["rubrics", "examples", "feedbackPatterns", "topics"];
  const counts = {};
  let total = 0;

  for (const col of collections) {
    const snapshot = await db.collection(col).count().get();
    counts[col] = snapshot.data().count;
    total += counts[col];
  }

  await db.collection("ssakdb_meta").doc("stats").set({
    totalDocuments: total,
    collections: counts,
    lastUpdated: FieldValue.serverTimestamp(),
    version: "2.0.0",
  });

  return { success: true, total, counts };
});

/**
 * 싹DB 전체 업로드 - 대용량 배치 처리
 * 클라이언트에서 JSON 파일을 전송하면 Firestore에 일괄 업로드
 */
exports.uploadSsakDBBatch = onCall(
  {
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }

    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists || userDoc.data().role !== "super_admin") {
      throw new HttpsError(
        "permission-denied",
        "슈퍼 관리자 권한이 필요합니다.",
      );
    }

    const { collection, documents } = request.data;

    if (!collection || typeof collection !== "string") {
      throw new HttpsError("invalid-argument", "collection 이름이 필요합니다.");
    }

    if (!documents || typeof documents !== "object") {
      throw new HttpsError("invalid-argument", "documents 객체가 필요합니다.");
    }

    const allowedCollections = [
      "rubrics",
      "examples",
      "feedbackPatterns",
      "topics",
      "writingTheory",
      "aiDetection",
      "learningPaths",
      "system",
      "evaluationTools",
      "metadata",
    ];
    if (!allowedCollections.includes(collection)) {
      throw new HttpsError(
        "invalid-argument",
        `허용되지 않는 컬렉션: ${collection}`,
      );
    }

    const docEntries = Object.entries(documents);
    const BATCH_SIZE = 450;
    let totalUploaded = 0;

    // 배치 단위로 업로드
    for (let i = 0; i < docEntries.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = docEntries.slice(i, i + BATCH_SIZE);

      for (const [docId, docData] of chunk) {
        const ref = db.collection(collection).doc(docId);
        batch.set(ref, {
          ...docData,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();
      totalUploaded += chunk.length;
    }

    return { success: true, collection, count: totalUploaded };
  },
);

/**
 * 싹DB 컬렉션 초기화 (기존 데이터 삭제)
 */
exports.clearSsakDBCollection = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  if (!userDoc.exists || userDoc.data().role !== "super_admin") {
    throw new HttpsError("permission-denied", "슈퍼 관리자 권한이 필요합니다.");
  }

  const { collection } = request.data;

  const allowedCollections = [
    "rubrics",
    "examples",
    "feedbackPatterns",
    "topics",
    "writingTheory",
    "aiDetection",
    "learningPaths",
    "system",
    "evaluationTools",
    "metadata",
  ];
  if (!allowedCollections.includes(collection)) {
    throw new HttpsError(
      "invalid-argument",
      `허용되지 않는 컬렉션: ${collection}`,
    );
  }

  const snapshot = await db.collection(collection).get();
  const BATCH_SIZE = 450;
  let deleted = 0;

  const docs = snapshot.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = docs.slice(i, i + BATCH_SIZE);

    for (const doc of chunk) {
      batch.delete(doc.ref);
    }

    await batch.commit();
    deleted += chunk.length;
  }

  return { success: true, collection, deleted };
});

// ============================================
// 💰 사용량 및 비용 조회 (슈퍼 관리자 전용)
// ============================================

/**
 * 사용량 통계 조회
 */
exports.getUsageStats = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  if (!userDoc.exists || userDoc.data().role !== "super_admin") {
    throw new HttpsError("permission-denied", "슈퍼 관리자 권한이 필요합니다.");
  }

  const today = new Date().toISOString().split("T")[0];
  const yearMonth = new Date().toISOString().slice(0, 7);

  // 오늘 사용량
  const todayUsageSnap = await db
    .collection("usage")
    .where("date", "==", today)
    .get();

  let todayTotalCalls = 0;
  const todayByUser = [];
  todayUsageSnap.forEach((doc) => {
    const data = doc.data();
    if (data.userId) {
      todayTotalCalls += data.count || 0;
      todayByUser.push({ userId: data.userId, count: data.count });
    }
  });

  // 이번 달 비용
  const costDoc = await db
    .collection("apiCosts")
    .doc(`cost_${yearMonth}`)
    .get();
  const monthlyCost = costDoc.exists
    ? costDoc.data()
    : { totalCalls: 0, totalTokens: 0, estimatedCostUSD: 0 };

  // 일별 사용량 (최근 7일)
  const dailyUsage = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];

    const daySnap = await db
      .collection("usage")
      .where("date", "==", dateStr)
      .get();

    let dayTotal = 0;
    daySnap.forEach((doc) => {
      if (doc.data().userId) dayTotal += doc.data().count || 0;
    });
    dailyUsage.push({ date: dateStr, calls: dayTotal });
  }

  return {
    today: {
      date: today,
      totalCalls: todayTotalCalls,
      topUsers: todayByUser.sort((a, b) => b.count - a.count).slice(0, 10),
    },
    monthly: {
      yearMonth,
      ...monthlyCost,
      estimatedCostKRW: Math.round((monthlyCost.estimatedCostUSD || 0) * 1350), // 예상 환율
    },
    dailyUsage: dailyUsage.reverse(),
    limits: {
      perUser: DAILY_API_LIMIT_PER_USER,
      perSchool: DAILY_API_LIMIT_PER_SCHOOL,
    },
  };
});

/**
 * 사용량 제한 설정 변경
 */
exports.updateUsageLimits = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const userDoc = await db.collection("users").doc(request.auth.uid).get();
  if (!userDoc.exists || userDoc.data().role !== "super_admin") {
    throw new HttpsError("permission-denied", "슈퍼 관리자 권한이 필요합니다.");
  }

  const { perUser, perSchool } = request.data;

  await db
    .collection("settings")
    .doc("usageLimits")
    .set({
      perUser: perUser || DAILY_API_LIMIT_PER_USER,
      perSchool: perSchool || DAILY_API_LIMIT_PER_SCHOOL,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    });

  return { success: true };
});
