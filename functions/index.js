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
const STUDENT_EMAIL_DOMAIN = "isw-writing.web.app"; // 학생 로그인 아이디용(메일 서버 없음). src/config/studentId.js 와 같아야 한다
const MAX_AI_TEXT = 12000; // 아이 글은 보통 3천 자 이하 — 아주 긴 입력(숫자 수만 자 등)으로 가림 정규식을 오래 붙잡지 못하게
// 🔒 가림 2층(pii-deep.mjs, 2026-11-22): 규칙만으로는 처음 보는 꼴의 이름·상호가 샜다(블라인드 55%).
//   형태소 분석기가 «아는 보통 낱말»로 풀지 못한 것은 기본으로 가린다. 분석기를 못 올리면 던진다 — 덜 가린 글은 나가지 않는다.
//   분석기가 메모리 약 1GB 를 쓴다 → 이 함수를 부르는 함수는 MASK_FN(2GiB)로 띄운다.
const piiDeepModule = import("./pii-deep.mjs");
const MASK_FN = { memory: "2GiB", cpu: 1 };
// 학생이 더 고른 낱말 — 글자 낱말만, 20자·40개까지(긴 목록으로 가림을 붙잡지 못하게)
function cleanMaskWords(words) {
  return (Array.isArray(words) ? words : []).filter((w) => typeof w === "string" && w.trim().length >= 1 && w.length <= 20).slice(0, 40);
}
async function maskForAI(text, extraWords) {
  if (String(text || "").length > MAX_AI_TEXT) throw new HttpsError("invalid-argument", `글이 너무 길어요(${MAX_AI_TEXT.toLocaleString()}자까지).`);
  const { maskDeep } = await piiDeepModule;
  try {
    return await maskDeep(String(text || ""), { extraWords: cleanMaskWords(extraWords) });
  } catch (e) {
    console.error("[가림 2층 실패 — 전송 막음]", e.message);
    throw new HttpsError("unavailable", "개인정보 가림 준비가 안 됐어요. 조금 뒤에 다시 해 주세요.");
  }
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

// ============================================
// 🔒 AI 문지기 (2026-11-18 점검): 전엔 «로그인만» 하면 도움·조언·AI탐지·표절을 횟수 제한 없이 부를 수 있었고,
//   제출 첨삭의 하루 제한도 계정마다라 가입을 여러 번 하면 무한이었다(가입 화면은 누구나 연다). 캐시+덮어쓰기라 동시 호출로도 샜다.
//   이제 ① 승인된 교사·학급에 든 학생·관리자만 ② 사람·학급(교사)·전체 하루 횟수를 트랜잭션으로 함께 센다.
//   관리자 화면의 한도(settings/usageLimits perUser·perSchool)를 실제로 쓴다(perSchool = 학급·교사 단위).
// ============================================
const DAILY_API_LIMIT_PER_USER = 50; // 사람당 하루(모든 AI 기능 합산)
const DAILY_API_LIMIT_PER_SCHOOL = 800; // 학급(학생 전체) 또는 교사 한 명 하루 — 이름은 관리자 화면 호환
const DAILY_API_LIMIT_GLOBAL = 5000; // 서비스 전체 하루 — 마지막 둑(요금 폭주 차단)
// 관리자 값 검증: 정수 0~상한(0 = 그 칸 AI 멈춤), 그 밖의 값은 기본값. 터무니없이 큰 값(1e20)으로 상한이 사라지지 않게.
const LIMIT_MAX = { perUser: 1000, perScope: 20000, global: 100000 };
let limitCache = { at: 0, v: null };
async function readLimits() {
  if (Date.now() - limitCache.at < 30000 && limitCache.v) return limitCache.v;
  const dflt = { perUser: DAILY_API_LIMIT_PER_USER, perScope: DAILY_API_LIMIT_PER_SCHOOL, global: DAILY_API_LIMIT_GLOBAL };
  try {
    const d = (await db.doc("settings/usageLimits").get()).data() || {};
    const pick = (n, k) => (Number.isSafeInteger(n) && n >= 0 && n <= LIMIT_MAX[k] ? n : dflt[k]);
    const v = { perUser: pick(d.perUser, "perUser"), perScope: pick(d.perSchool, "perScope"), global: pick(d.global, "global") };
    limitCache = { at: Date.now(), v };
    return v;
  } catch (e) {
    // 읽기 실패: 직전에 읽은 값을 쓰고, 기본값을 캐시에 굳히지 않는다(관리자가 낮춘 한도가 풀리지 않게)
    console.warn("[한도 읽기 실패]", e.message);
    return limitCache.v || dflt;
  }
}
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/** AI 를 부르기 전 반드시 통과. 통과 못 하면 HttpsError 를 던진다.
 *  사람 횟수는 트랜잭션으로 정확히(한 계정 동시 연타도 못 넘게), 학급·전체는 문서 하나에 여러 사람이 몰리므로
 *  트랜잭션 경합을 피해 «읽고 확인 → 원자적 증가»(동시 요청 수만큼만 넘칠 수 있음). */
async function guardAI(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const uid = request.auth.uid;
  const u = (await db.doc(`users/${uid}`).get()).data();
  let scope = null;
  if (u?.role === "super_admin") scope = "admin";
  else if (u?.role === "teacher" && u.approved === true) scope = `teacher_${uid}`;
  else if (u?.role === "student" && typeof u.classCode === "string" && /^[A-Za-z0-9]{1,20}$/.test(u.classCode)) scope = `class_${u.classCode}`;
  if (!scope) throw new HttpsError("permission-denied", "승인된 선생님과 학급 학생만 AI 첨삭을 쓸 수 있어요.");

  const lim = await readLimits();
  const day = kstDay();
  const isAdmin = scope === "admin";
  const userRef = db.collection("usage").doc(`usage_${uid}_${day}`);
  const scopeRef = db.collection("usage").doc(`scope_${scope}_${day}`);
  const allRef = db.collection("usage").doc(`global_${day}`);
  const n = (x) => (x.exists ? x.data().count || 0 : 0);

  const [ss, gs] = await Promise.all([scopeRef.get(), allRef.get()]);
  if (n(gs) >= lim.global) throw new HttpsError("resource-exhausted", "오늘은 AI 첨삭이 너무 많이 쓰여 잠시 쉬어요. 내일 다시 써 주세요.");
  if (!isAdmin && n(ss) >= lim.perScope) throw new HttpsError("resource-exhausted", "우리 반이 오늘 쓸 수 있는 AI 횟수를 다 썼어요. 내일 다시 써 주세요.");

  // 교사는 자기 범위(teacher_uid)가 곧 한 사람이라 사람 한도 대신 범위 한도만 — 반 전체 표절·AI 검사가 50번에 막히지 않게
  const userCap = isAdmin || scope.startsWith("teacher_") ? Infinity : lim.perUser;
  const at = FieldValue.serverTimestamp();
  await db.runTransaction(async (tx) => {
    const us = await tx.get(userRef);
    if (n(us) >= userCap) throw new HttpsError("resource-exhausted", `오늘은 AI 를 ${lim.perUser}번 다 썼어요. 내일 다시 써 주세요.`);
    tx.set(userRef, { userId: uid, count: n(us) + 1, date: day, updatedAt: at }, { merge: true });
  });
  await Promise.all([
    scopeRef.set({ scope, count: FieldValue.increment(1), date: day, updatedAt: at }, { merge: true }),
    allRef.set({ scope: "global", count: FieldValue.increment(1), date: day, updatedAt: at }, { merge: true }),
  ]);
  return { scope };
}

/**
 * API 비용 추적 (월별 집계)
 */
async function trackApiCost(userId, schoolId, tokenCount = 0) {
  const yearMonth = kstDay().slice(0, 7); // YYYY-MM (한국 날짜 — 하루 한도와 같은 기준)
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
    // 1차: education_level, genre, level로 검색 — 데이터엔 «초등»과 «초등학교»가 섞여 있다(2026-11-20 실측 748편)
    let snapshot = await db
      .collection("examples")
      .where("education_level", "in", [exampleEducationLevel, `${exampleEducationLevel}학교`])
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
                teacherData.name || "선생님";

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
          teacherData.name || "선생님";
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

      // 자기번호 자리도 비운다(남은 해시는 쓸모없지만 번호를 다음 학생에게 돌려주려고)
      const pins = await db.collection("pinAuth").where("uid", "==", studentId).get();
      //   읽은 뒤 바뀐 문서(그 번호를 새 학생이 받음)는 지우지 않는다 — 마지막 수정 시각을 조건으로
      await Promise.all(pins.docs.map((d) => d.ref.delete({ lastUpdateTime: d.updateTime }).catch(() => {})));

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

  if (!Number.isInteger(total) || total < 1 || total > MAX_STUDENTS_PER_CLASS) {
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

  // 학생 아이디 = 학급코드+번호 @ 우리 도메인(메일함 없음). 교사 메일 도메인을 쓰면 학교가 드러나고
  // abc001@gmail.com 처럼 남의 실제 주소와 겹친다(2026-11-18 최소수집 점검). prefix 는 더 받지 않는다.
  void prefix;
  const idBase = String(classCode).toLowerCase().replace(/[^a-z0-9]/g, "") || "student";
  const now = new Date().toISOString();

  const results = [];
  const newStudents = [];
  let nextSeq = currentStudents + 1;

  // 학생에게 보일 이름은 «담당 교사» 것 — 관리자가 대신 만들어도 관리자 이름이 들어가면 안 된다
  let classTeacherName = classData.teacherName || null;
  if (!classTeacherName) {
    const owner = classData.teacherId === teacherUid ? teacherData : (await db.doc(`users/${classData.teacherId}`).get()).data();
    classTeacherName = owner?.name || "선생님";
  }

  for (let i = 1; i <= total; i++) {
    const password = kidPassword();
    let userRecord = null;
    let email = "";
    let displayName = "";
    // 지운 학생 자리 때문에 번호가 겹치면 다음 번호로(최대 60번 시도)
    for (let tries = 0; tries < 60 && !userRecord; tries++) {
      const seq = String(nextSeq++).padStart(2, "0");
      email = `${idBase}${seq}@${STUDENT_EMAIL_DOMAIN}`;
      displayName = `학생${seq}`;
      try {
        userRecord = await getAuth().createUser({ email, password, displayName });
      } catch (e) {
        if (e.code !== "auth/email-already-exists") {
          results.push({ email, password: null, status: "skipped", message: e.message });
          break;
        }
      }
    }
    if (!userRecord) continue;

    try {
      // 🚀 학생 userData에 classInfo 캐시 (로그인 시 DB 읽기 0회!)
      const classInfo = {
        classCode: classCode,
        className: classData.className || classCode,
        teacherId: classData.teacherId,
        teacherName: classTeacherName,
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

      results.push({ email, password, status: "created", studentId: userRecord.uid });
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

    // 만들면서 번호·자기번호도 같이 준다 — 나눠 줄 쪽지에 «학급코드·번호·자기번호» 세 가지만
    const roster = [...(classData.students || []), ...newStudents];
    // 자기번호가 실패해도 계정은 이미 만들어졌다 — 아이디·비번은 돌려주고 «자기번호 새로»로 다시 받게 한다
    try {
      const pins = await issuePins(classCode, roster, new Set(newStudents.map((s) => s.studentId)));
      const byId = new Map(pins.map((p) => [p.studentId, p]));
      for (const r of results) {
        const p = byId.get(r.studentId);
        if (p) { r.number = p.number; r.pin = p.pin; }
      }
    } catch (e) {
      console.error("[학생 생성] 자기번호 실패:", e.message);
    }
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

// 🔢 자기번호 로그인 — 학급코드 + 번호 + 숫자 4자리(2026-11-18 «게임처럼 자기번호로 집에서도 이어서»).
//   비번 쪽지 없이 저학년도 들어오게 하되, 4자리는 맞혀 보기에 약하므로 서버가 횟수를 센다:
//   5번 틀리면 15분 잠금, 모두 10번 틀리면 선생님이 새로 줄 때까지 잠금(맞히면 0으로).
//   해시는 서버 전용 컬렉션 pinAuth(규칙상 아무도 못 읽음)에만 있고, 성공하면 커스텀 토큰을 준다.
const { scrypt, randomBytes, timingSafeEqual } = require("crypto");
const PIN_SOFT_LOCK = 5;
const PIN_HARD_LOCK = 10;
const PIN_LOCK_MS = 15 * 60 * 1000;
const pinKey = (classCode, number) => `${classCode}_${String(number).padStart(2, "0")}`;
// 비동기 scrypt — 동기로 돌리면 요청이 몰릴 때 같은 인스턴스의 다른 호출까지 멈춘다(8way codex)
const hashPin = (pin, salt) => new Promise((ok, no) => scrypt(pin, salt, 32, (e, k) => (e ? no(e) : ok(k.toString("hex")))));
function newPin() {
  for (;;) {
    const p = String(randomInt(10000)).padStart(4, "0");
    // 0000·1111 같은 겹수와 1234·4321 같은 줄 번호는 친구가 먼저 넣어 본다
    if (/^(\d)\1{3}$/.test(p) || "0123456789".includes(p) || "9876543210".includes(p)) continue;
    return p;
  }
}

// 학급 주인(승인 교사)이나 관리자만 — resetStudentPassword 와 같은 문
async function assertClassOwner(request, classCode) {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const me = (await db.doc(`users/${request.auth.uid}`).get()).data();
  const isAdmin = me?.role === "super_admin";
  if (!isAdmin && !(me?.role === "teacher" && me.approved === true)) {
    throw new HttpsError("permission-denied", "승인된 교사만 할 수 있습니다.");
  }
  if (typeof classCode !== "string" || !/^[A-Za-z0-9]{4,12}$/.test(classCode)) {
    throw new HttpsError("invalid-argument", "학급 코드가 올바르지 않습니다.");
  }
  const classSnap = await db.doc(`classes/${classCode}`).get();
  if (!classSnap.exists) throw new HttpsError("not-found", "클래스를 찾을 수 없습니다.");
  const classData = classSnap.data();
  if (!isAdmin && classData.teacherId !== request.auth.uid) {
    throw new HttpsError("permission-denied", "해당 클래스의 담당 교사만 할 수 있습니다.");
  }
  return classData;
}

// 명단의 학생들에게 번호·자기번호를 준다. 번호는 한 번 정해지면 그대로(아이디 끝 두 자리와 같게),
//   자기번호만 새로. 반환 = [{ studentId, studentName, number, pin }]
async function issuePins(classCode, roster, targetIds) {
  // 번호 고르기와 쓰기를 한 트랜잭션으로 — «자기번호 새로»를 두 명에게 동시에 눌러도 같은 번호를 받지 않게
  return db.runTransaction((tx) => issuePinsTx(tx, classCode, roster, targetIds));
}
async function issuePinsTx(tx, classCode, roster, targetIds) {
  const existing = await tx.get(db.collection("pinAuth").where("classCode", "==", classCode));
  const rosterIds = new Set(roster.map((s) => s.studentId));
  const numberOf = new Map(); // uid → 번호
  const taken = new Set(); // 지금 학급에 있는 학생이 쓰는 번호
  const oldPin = new Map(); // uid → { salt, hash } — 새로 뽑은 숫자가 옛 것과 같으면 «새로»가 아니다
  for (const d of existing.docs) {
    const p = d.data();
    if (rosterIds.has(p.uid) && !numberOf.has(p.uid)) {
      numberOf.set(p.uid, p.number);
      taken.add(p.number);
      oldPin.set(p.uid, p);
    }
  }
  const idBase = classCode.toLowerCase().replace(/[^a-z0-9]/g, "");
  const emailRe = new RegExp(`^${idBase}(\\d{2,})@${STUDENT_EMAIL_DOMAIN.replace(/\./g, "\\.")}$`);
  const targets = roster.filter((s) => targetIds.has(s.studentId));
  // 아이디에 번호가 박힌 학생부터 자리를 잡는다(아이디 ab3k9z07 = 7번)
  const emails = new Map();
  await Promise.all(targets.map(async (s) => {
    if (numberOf.has(s.studentId)) return;
    const u = (await tx.get(db.doc(`users/${s.studentId}`))).data();
    emails.set(s.studentId, String(u?.email || ""));
  }));
  for (const s of targets) {
    if (numberOf.has(s.studentId)) continue;
    const m = emailRe.exec(emails.get(s.studentId) || "");
    const n = m ? Number(m[1]) : NaN;
    if (Number.isInteger(n) && n >= 1 && n <= 99 && !taken.has(n)) {
      numberOf.set(s.studentId, n);
      taken.add(n);
    }
  }
  let next = 1;
  for (const s of targets) {
    if (numberOf.has(s.studentId)) continue;
    while (taken.has(next)) next++;
    if (next > 99) throw new HttpsError("resource-exhausted", "번호가 99번을 넘었습니다.");
    numberOf.set(s.studentId, next);
    taken.add(next);
  }
  const out = [];
  const batch = tx; // 트랜잭션도 set·delete 를 같은 모양으로 받는다
  const now = Date.now();
  for (const s of targets) {
    const number = numberOf.get(s.studentId);
    const prev = oldPin.get(s.studentId);
    let pin = newPin();
    while (prev && (await hashPin(pin, prev.salt)) === prev.hash) pin = newPin();
    const salt = randomBytes(16).toString("hex");
    batch.set(db.doc(`pinAuth/${pinKey(classCode, number)}`), {
      uid: s.studentId, classCode, number, salt, hash: await hashPin(pin, salt),
      fails: 0, lockedUntil: null, issuedAt: now,
    });
    out.push({ studentId: s.studentId, studentName: s.studentName || "", number, pin });
  }
  // 학생이 다른 번호로 옮겨 갔다면 옛 자리 문서는 지운다(같은 학생이 두 번호로 들어오지 않게)
  for (const d of existing.docs) {
    const p = d.data();
    if (targetIds.has(p.uid) && numberOf.get(p.uid) !== p.number) batch.delete(d.ref);
  }
  return out.sort((a, b) => a.number - b.number);
}

exports.issueStudentPins = onCall(async (request) => {
  const { classCode, studentIds } = request.data || {};
  const classData = await assertClassOwner(request, classCode);
  const roster = Array.isArray(classData.students) ? classData.students : [];
  if (studentIds !== undefined && (!Array.isArray(studentIds) || studentIds.length > MAX_STUDENTS_PER_CLASS)) {
    throw new HttpsError("invalid-argument", "studentIds 가 올바르지 않습니다.");
  }
  const ids = new Set(studentIds ? studentIds.map(String) : roster.map((s) => s.studentId));
  const results = await issuePins(classCode, roster, ids);
  return { results };
});

exports.pinLogin = onCall(async (request) => {
  const d = request.data || {};
  const classCode = String(d.classCode || "").trim().toUpperCase();
  // 번호는 정수 또는 숫자 글자만(true·"1e1"·"0x7" 같은 것은 받지 않는다), 자기번호는 문자열 숫자 4개만
  const rawNum = typeof d.number === "number" ? String(d.number) : typeof d.number === "string" ? d.number.trim() : "";
  const number = /^\d{1,2}$/.test(rawNum) ? Number(rawNum) : NaN;
  const pin = typeof d.pin === "string" ? d.pin : "";
  if (!/^[A-Z0-9]{4,12}$/.test(classCode) || !Number.isInteger(number) || number < 1 || number > 99 || !/^\d{4}$/.test(pin)) {
    throw new HttpsError("invalid-argument", "학급 코드, 번호, 자기번호 4자리를 확인해 주세요.");
  }
  const ref = db.doc(`pinAuth/${pinKey(classCode, number)}`);
  const now = Date.now();
  // 틀린 횟수는 트랜잭션 안에서 센다(동시에 여러 번 넣어도 한 번씩). 거절은 트랜잭션 «밖»에서 던진다 —
  //   안에서 던지면 쓰기가 취소돼 틀린 횟수가 안 올라간다.
  const r = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) {
      await hashPin(pin, "0000000000000000"); // 없는 번호도 같은 시간이 걸리게
      return { kind: "wrong" };
    }
    const p = s.data();
    const fails = p.fails || 0;
    if (fails >= PIN_HARD_LOCK) return { kind: "hard" };
    if (p.lockedUntil && p.lockedUntil > now) return { kind: "soft", until: p.lockedUntil };
    const ok = timingSafeEqual(Buffer.from(await hashPin(pin, p.salt), "hex"), Buffer.from(p.hash, "hex"));
    if (ok) {
      tx.update(ref, { fails: 0, lockedUntil: null, lastLoginAt: now });
      return { kind: "ok", uid: p.uid };
    }
    const f = fails + 1;
    const soft = f < PIN_HARD_LOCK && f % PIN_SOFT_LOCK === 0;
    tx.update(ref, { fails: f, lockedUntil: soft ? now + PIN_LOCK_MS : null });
    if (f >= PIN_HARD_LOCK) return { kind: "hard" };
    if (soft) return { kind: "soft", until: now + PIN_LOCK_MS };
    return { kind: "wrong", f };
  });
  if (r.kind === "hard") {
    throw new HttpsError("resource-exhausted", "너무 많이 틀려서 잠겼어요. 선생님께 자기번호를 새로 받아요.");
  }
  if (r.kind === "soft") {
    const min = Math.max(1, Math.ceil((r.until - now) / 60000));
    throw new HttpsError("resource-exhausted", `여러 번 틀려서 잠겼어요. ${min}분 뒤에 다시 해 보세요.`);
  }
  const wrongMsg = "번호나 자기번호가 맞지 않아요." + (!r.f ? "" : r.f < PIN_SOFT_LOCK
    ? ` ${PIN_SOFT_LOCK - r.f}번 더 틀리면 잠시 잠겨요.`
    : ` ${PIN_HARD_LOCK - r.f}번 더 틀리면 선생님께 새로 받아야 해요.`);
  if (r.kind !== "ok") throw new HttpsError("unauthenticated", wrongMsg);
  // 문서만 믿지 않는다 — 지금도 이 학급 학생인지 확인(지운 학생·반을 옮긴 학생의 옛 자리는 못 씀)
  const u = (await db.doc(`users/${r.uid}`).get()).data();
  if (!u || u.role !== "student" || u.classCode !== classCode) {
    throw new HttpsError("unauthenticated", "번호나 자기번호가 맞지 않아요.");
  }
  const token = await auth.createCustomToken(r.uid);
  return { token };
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

// 🌱 첨삭 엔진(functions/feedback.js) — 2026-11-20 업그레이드: 고친 문장 대신 «여기·왜·힌트», 고칠 것 1~2개,
//   점수마다 글 속 근거, 고쳐쓰기 덤 없음, 장르·목표·과제 중점. AI 확률 판정은 없앴다(쓰는 과정 기록으로 대체).
const FB = require("./feedback.js");
const { createHash, randomUUID } = require("crypto");
const ANALYSIS_CACHE_DAYS = 90;
// 학년별 권장 글자 수(공백 뺀 글자) — 화면 src/config/wordCount.js 의 normalizeGradeLevel→ideal 과 같은 값
const IDEAL_WORDS = { elementary_1_2: 150, elementary_3_4: 350, elementary_5_6: 600, middle: 800, high: 1200, default: 350 };

// 같은 글 = 같은 점수(1-6): 글·주제·학년·장르·목표·중점이 같으면 서버 기록(analysisCache)의 결과를 그대로 준다.
//   예전 메모리 캐시는 인스턴스마다 따로라 같은 글을 다시 내면 점수가 달라졌다(국내 교사 불만 1위 «같은 답안 다른 점수»).
function analysisKey(o) {
  return createHash("sha256").update(JSON.stringify([FB.PROMPT_VERSION, o.gradeLevel, o.topic, o.genre, o.goal, o.focus, o.wordCount, o.idealWordCount, o.text])).digest("hex");
}

// 제출 점수 서명(1-9): 결과를 서버 전용 analyses/{id} 에 남기고 id 를 돌려준다.
//   writings 규칙이 «score == analyses/{id}.score 이고 내 것»일 때만 받는다 — 예전엔 브라우저가 점수를 아무 값으로 써도 됐다.
//   서명은 글 길이(가리기 전 원문 글자 수)에도 묶는다 — 규칙은 해시를 못 하니, 좋은 점수 서명을 다른 글에 붙이는 걸 길이로 막는다.
async function signAnalysis(uid, result, len) {
  const id = randomUUID();
  await db.doc(`analyses/${id}`).set({ uid, score: result.score, len, createdAt: new Date().toISOString() });
  return id;
}

exports.analyzeWriting = onCall(
  { secrets: [anthropicApiKey], ...MASK_FN },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const userId = request.auth.uid;
    const data = request.data || {};
    let { text, gradeLevel, topic, wordCount, idealWordCount, isRewrite, previousScore, previousText, schoolId } = data;
    const genre = FB.GENRES[data.genre] ? data.genre : null;
    const goal = FB.GOALS[data.goal] ? data.goal : null;
    const focus = Array.isArray(data.focus) ? data.focus.filter((k) => FB.CRITERION_KEYS.includes(k)).slice(0, 3) : [];
    // 글자 수·권장 글자 수는 서버가 정한다 — 클라가 보낸 값을 믿으면 짧은 글로 감점을 피한 점수가 서명된다(8way 4계열)
    wordCount = typeof text === "string" ? text.replace(/\s/g, "").length : 0;
    idealWordCount = IDEAL_WORDS[gradeLevel] || IDEAL_WORDS.default;

    // 🔒 국외 AI 로 가기 전 개인정보 가림(이름·주소·학교·전화 → ㅇㅇㅇ) — 학생이 미리보기에서 더 가린 낱말(maskWords) 포함
    const maskWords = Array.isArray(data.maskWords) ? data.maskWords : [];
    const originalLen = typeof text === "string" ? text.length : 0; // 서명에 묶을 원문 길이(가리기 전)
    if (text != null) text = (await maskForAI(text, maskWords)).text;
    if (previousText != null) previousText = (await maskForAI(previousText, maskWords)).text;
    if (topic != null) topic = (await maskForAI(topic, maskWords)).text;
    if (!text || !topic) {
      throw new HttpsError("invalid-argument", "텍스트와 주제가 필요합니다.");
    }

    // 🚀 서버 측 무의미한 글 감지 (AI 호출 전 차단 = API 비용 0원)
    const qualityCheck = checkWritingQuality(text, idealWordCount);
    if (qualityCheck.isInvalid) {
      const zero = FB.normalizeAnalysis({ overall: qualityCheck.feedback, nextSteps: [{ focus: "content", why: qualityCheck.improvement, hint: "주제에 대해 무엇을 말하고 싶은지 한 문장으로 먼저 써 볼까요?" }] }, text, { goal, focus });
      zero.qualityPenalty = qualityCheck.reason;
      zero.analysisId = await signAnalysis(userId, zero, originalLen);
      return zero;
    }

    const prev = previousScore === null || previousScore === undefined || previousScore === "" ? null : Number(previousScore);
    const finish = async (result) => {
      if (isRewrite && Number.isFinite(prev)) {
        result.isRewrite = true;
        result.previousScore = prev;
        result.scoreDiff = result.score - prev;
        if (previousText && previousText.trim() === text.trim()) result.growthNote = "앞 글과 달라진 곳이 없어요. «이번에 고칠 것»을 하나 골라 고쳐 보세요.";
      }
      result.analysisId = await signAnalysis(userId, result, originalLen);
      return result;
    };

    // 같은 글이면 서버 기록의 결과 그대로(AI 0원·점수 같음)
    const key = analysisKey({ gradeLevel, topic, genre, goal, focus, wordCount, idealWordCount, text });
    const cacheRef = db.doc(`analysisCache/${key}`);
    try {
      const hit = await cacheRef.get();
      if (hit.exists && Date.now() - Date.parse(hit.data().createdAt || 0) < ANALYSIS_CACHE_DAYS * 864e5) {
        console.log("[같은 글] 서버 기록 결과 재사용");
        return finish({ ...hit.data().result, cached: true });
      }
    } catch (e) {
      console.warn("[같은 글 기록 읽기 실패]", e.message);
    }

    // 💰 AI 문지기 — 무의미한 글·같은 글(AI 0원)은 세지 않고, AI 를 부르기 직전에만 센다
    await guardAI(request);

    const gradeNames = { elementary_1_2: "초1-2", elementary_3_4: "초3-4", elementary_5_6: "초5-6", middle: "중등", high: "고등" };
    const grade = gradeNames[gradeLevel] || gradeLevel;

    // 🌱 싹DB에서 루브릭과 우수작 예시 검색
    let ssakContext = "";
    try {
      const [rubric, example] = await Promise.all([getSsakRubric(gradeLevel, topic), getSsakExample(gradeLevel, topic, "high")]);
      ssakContext = buildSsakPromptContext(rubric, example);
    } catch (ssakError) {
      console.warn("[싹DB] 컨텍스트 로드 실패 (기본 평가 사용):", ssakError.message);
    }

    const prompt = FB.buildAnalysisPrompt({
      grade, topic, text, wordCount, idealWordCount, genre: genre || null, goal, focus, ssakContext,
      previousText: isRewrite ? previousText : null,
    });

    // 재시도 3번 — 그래도 못 받으면 «가짜 점수»를 주지 않고 다시 내라고 한다(예전엔 68~70점을 지어 줬다)
    let parsed = null;
    let responseText = "";
    for (let attempt = 1; attempt <= 3 && !parsed; attempt++) {
      try {
        responseText = await callAI(prompt, { masked: true, maxTokens: 4096, systemPrompt: SYSTEM_PROMPTS.writingAnalyzer });
        const m = responseText.match(/\{[\s\S]*\}/);
        if (m) {
          try {
            parsed = JSON.parse(m[0]);
          } catch {
            parsed = JSON.parse(m[0].replace(/,\s*}/g, "}").replace(/,\s*]/g, "]"));
          }
        }
        if (!parsed || typeof parsed.scores !== "object") parsed = null;
      } catch (e) {
        console.warn(`[첨삭 시도 ${attempt}/3 실패] ${e.message}`);
      }
      if (!parsed && attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
    }
    if (!parsed) {
      throw new HttpsError("unavailable", "첨삭을 잠시 못 했어요. 조금 뒤에 다시 내 주세요.");
    }

    const result = FB.normalizeAnalysis(parsed, text, { goal, focus });
    result.genre = genre;
    result.focus = focus;

    // 주제를 벗어난 글(주제 3점 이하)은 0점
    if (result.topicRelevanceScore <= 3) {
      result.score = 0;
      result.topicPenalty = "zero";
      result.overallFeedback = `이 글은 주제(«${topic}»)와 관련이 없어요. 주제를 다시 보고 그에 맞는 내용으로 써 보세요.`;
      result.feedback = result.overallFeedback;
    }

    // 글자 수 감점(완화된 기준) — 예전과 같음
    if (wordCount && idealWordCount && result.score > 0) {
      const ratio = wordCount / idealWordCount;
      const steps = [[0.2, 30], [0.3, 25], [0.4, 20], [0.5, 15], [0.6, 12], [0.7, 10], [0.8, 7], [0.9, 5]];
      const pen = (steps.find(([r]) => ratio < r) || [0, 0])[1];
      if (pen > 0) {
        result.score = Math.max(0, result.score - pen);
        result.wordCountPenalty = pen;
      }
    }

    // 같은 글 기록 — 고쳐쓰기 비교 말(growthNote)은 그 학생의 앞 글이 담겨 있어 남기지 않는다(다른 학생에게 새지 않게).
    //   동시에 같은 글이 두 번 오면 먼저 쓴 쪽이 이긴다(create) — 늦은 쪽은 먼저 것을 쓴다(같은 글 = 같은 점수).
    try {
      const { growthNote: _g, ...shared } = result;
      void _g;
      await cacheRef.create({ result: shared, createdAt: new Date().toISOString() });
    } catch (e) {
      if (e.code === 6 || /already exists/i.test(String(e.message))) {
        const first = (await cacheRef.get()).data()?.result;
        if (first) {
          trackApiCost(userId, schoolId, Math.ceil((prompt.length + responseText.length) * 0.5));
          return finish({ ...first, growthNote: result.growthNote, cached: true });
        }
      } else {
        console.warn("[같은 글 기록 쓰기 실패]", e.message);
      }
    }

    // 💰 API 비용 추적 (대략적인 토큰 수 = 문자 수 * 0.5)
    trackApiCost(userId, schoolId, Math.ceil((prompt.length + responseText.length) * 0.5));
    return finish(result);
  },
);

// Detect plagiarism
exports.detectPlagiarism = onCall(
  { secrets: [anthropicApiKey], ...MASK_FN },
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

      await guardAI(request); // 🔒 AI 문지기 — 승인 교사·학급 학생만, 하루 횟수
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
      if (error instanceof HttpsError) throw error; // 문지기(권한·횟수) 거절은 그대로 알린다
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
exports.detectAIUsage = onCall({ secrets: [anthropicApiKey], ...MASK_FN }, async (request) => {
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

    await guardAI(request); // 🔒 AI 문지기 — 승인 교사·학급 학생만, 하루 횟수
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
    if (error instanceof HttpsError) throw error; // 문지기(권한·횟수) 거절은 그대로 알린다
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
  { secrets: [anthropicApiKey], ...MASK_FN },
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
표현을 다듬을 곳 2-3개를 짚는다. 고친 문장은 쓰지 않는다(학생이 스스로 고친다 — 2026-11-20 업그레이드 1-1).
original=글에서 그대로 옮긴 구절, reason=왜 다듬으면 좋은지, hint=스스로 고치게 하는 질문.
JSON:{"suggestions":[{"original":"원문구절","reason":"이유","hint":"질문형 힌트","type":"clarity/flow/word"}],"tips":["실천팁1","2"],"praise":"구체적칭찬","readabilityTip":"가독성조언"}`,
        expand: `주제:"${topic}"
글:"""${text}"""
ProWritingAid스타일: 깊이있는확장아이디어(직접쓰지X)
JSON:{"expandIdeas":["구체적아이디어1","2","3"],"detailSuggestions":[{"part":"확장할부분","suggestion":"어떻게확장","example":"예시"}],"examples":["참고예시1","2"],"depthTip":"깊이있게쓰는법"}`,
        default: `주제:"${topic}" 현재:${text || "없음"}
성장중심 조언. JSON:{"advice":"구체적조언","tips":["실천팁1","2"],"motivation":"동기부여"}`,
      };

      const prompt = prompts[helpType] || prompts.default;
      await guardAI(request); // 🔒 AI 문지기 — 승인 교사·학급 학생만, 하루 횟수
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
      if (error instanceof HttpsError) throw error; // 문지기(권한·횟수) 거절은 그대로 알린다
      console.error("글쓰기 도움 에러:", error);
      throw new HttpsError("internal", `도움 요청 실패: ${error.message}`);
    }
  },
);

// Get quick advice - 🚀 최적화: 토큰 50% 절감
exports.getQuickAdvice = onCall(
  { secrets: [anthropicApiKey], ...MASK_FN },
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

      await guardAI(request); // 🔒 AI 문지기 — 승인 교사·학급 학생만, 하루 횟수
      const responseText = await callAI(prompt, {
            masked: true,
        systemPrompt: SYSTEM_PROMPTS.quickAdvice,
      });

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { advice: "좋아요! 계속 써보세요.", emoji: "📝" };

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      if (error instanceof HttpsError) throw error; // 문지기(권한·횟수) 거절은 그대로 알린다
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

      await guardAI(request); // 🔒 AI 문지기 — 승인 교사·학급 학생만, 하루 횟수
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
      if (error instanceof HttpsError) throw error; // 문지기(권한·횟수) 거절은 그대로 알린다
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

  const today = kstDay(); // 하루 한도와 같은 한국 날짜
  const yearMonth = today.slice(0, 7);

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
    const dateStr = new Date(Date.now() + 9 * 3600e3 - i * 86400e3).toISOString().slice(0, 10);

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

// ============================================
// 🌱 노력 랭킹(2026-11-20 업그레이드 1-8) — 글이 제출되면 서버가 반 랭킹을 고친다.
//   예전엔 브라우저가 classes.weeklyRanking 을 직접 썼다(규칙상 반 학생 누구나) — 점수·순위를 마음대로 바꿀 수 있었다.
//   고쳐쓰기 여부와 나아진 점수는 클라가 보낸 값이 아니라 DB 의 앞 글에서 읽는다. 하루에 노력 점수를 받는 제출은 5편까지.
//   점수식은 src/config/effort.js 와 같다(시험 scripts/test-effort-ranking.mjs · test-feedback-flow.mjs).
// ============================================
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const EFFORT_DAILY_CAP = 5;
const EFFORT_MIN_SCORE = 30;
function effortPointsServer({ score, isRewrite, scoreDiff, passed }) {
  if (!(score >= EFFORT_MIN_SCORE)) return 0;
  let p = isRewrite ? 10 + Math.max(0, Math.min(20, Number(scoreDiff) || 0)) : 10;
  if (passed) p += 5;
  return p;
}
function kstPeriodKey(period) {
  const k = new Date(Date.now() + 9 * 3600e3); // KST 를 UTC 필드로 읽는다
  const y = k.getUTCFullYear();
  if (period === "weekly") {
    const start = Date.UTC(y, 0, 1);
    const days = Math.floor((Date.UTC(y, k.getUTCMonth(), k.getUTCDate()) - start) / 864e5);
    const week = Math.ceil((days + new Date(start).getUTCDay() + 1) / 7);
    return `${y}-W${week}`;
  }
  return `${y}-${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

exports.onWritingSubmitted = onDocumentWritten({ document: "writings/{writingId}", database: DATABASE_ID }, async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const d = after.data();
  if (d.isDraft || typeof d.score !== "number" || !d.classCode || !d.studentId) return;
  const b = event.data.before?.exists ? event.data.before.data() : null;
  if (b && !b.isDraft && b.score === d.score && b.content === d.content) return; // 선생님 확인 등 다른 칸만 바뀜
  if (d.rankedAt) return; // 이미 반영(트리거 재시도)

  // 같은 주제의 앞 글(이 글 제외, 가장 최근 제출)
  const prevSnap = await db.collection("writings").where("studentId", "==", d.studentId).where("topic", "==", d.topic || "").where("isDraft", "==", false).get();
  const prev = prevSnap.docs
    .filter((x) => x.id !== after.id && (x.data().submittedAt || "") < (d.submittedAt || "~"))
    .map((x) => x.data())
    .sort((x, y) => String(y.submittedAt || "").localeCompare(String(x.submittedAt || "")))[0];
  const isRewrite = !!prev;
  const unchanged = prev && String(prev.content || "").trim() === String(d.content || "").trim();
  const scoreDiff = prev ? d.score - (Number(prev.score) || 0) : 0;
  const passed = d.score >= (Number(d.minScore) || 70);
  const user = (await db.doc(`users/${d.studentId}`).get()).data() || {};
  const today = kstDay();

  const classRef = db.doc(`classes/${d.classCode}`);
  await db.runTransaction(async (tx) => {
    const cls = await tx.get(classRef);
    if (!cls.exists) return;
    const cd = cls.data();
    const update = { rankingUpdatedAt: new Date().toISOString() };
    for (const period of ["weekly", "monthly"]) {
      const field = period === "weekly" ? "weeklyRanking" : "monthlyRanking";
      const key = kstPeriodKey(period);
      const saved = cd[field];
      let rows = saved && saved.periodKey === key && saved.formula === "effort1" ? [...(saved.data || [])] : [];
      let i = rows.findIndex((r) => r.studentId === d.studentId);
      if (i < 0) {
        rows.push({ studentId: d.studentId, nickname: user.nickname || user.name || "학생", submissionCount: 0, averageScore: 0, passCount: 0, highScore: 0, rewriteCount: 0, growthSum: 0, effortScore: 0, effortDay: today, effortToday: 0 });
        i = rows.length - 1;
      }
      const r = { ...rows[i] };
      r.submissionCount = (r.submissionCount || 0) + 1;
      r.averageScore = Math.round(((r.averageScore || 0) * (r.submissionCount - 1) + d.score) / r.submissionCount);
      if (passed) r.passCount = (r.passCount || 0) + 1;
      r.highScore = Math.max(r.highScore || 0, d.score);
      if (r.effortDay !== today) { r.effortDay = today; r.effortToday = 0; }
      let gain = unchanged ? 0 : effortPointsServer({ score: d.score, isRewrite, scoreDiff, passed });
      if (gain > 0 && r.effortToday >= EFFORT_DAILY_CAP) gain = 0;
      if (gain > 0) r.effortToday += 1;
      if (isRewrite && !unchanged) r.rewriteCount = (r.rewriteCount || 0) + 1;
      if (isRewrite && !unchanged && scoreDiff > 0) r.growthSum = (r.growthSum || 0) + Math.min(20, scoreDiff);
      r.effortScore = (r.effortScore || 0) + gain;
      r.rankingScore = r.effortScore;
      r.points = user.points || r.points || 0;
      r.nickname = user.nickname || user.name || r.nickname;
      rows[i] = r;
      rows.sort((x, y) => (y.rankingScore || 0) - (x.rankingScore || 0));
      rows = rows.map((x, k) => ({ ...x, rank: k + 1 }));
      update[field] = { periodKey: key, formula: "effort1", data: rows, updatedAt: new Date().toISOString() };
    }
    tx.update(classRef, update);
    tx.update(after.ref, { rankedAt: new Date().toISOString() });
  });
});

// 🧹 첨삭 서명(analyses)·같은 글 기록(analysisCache) 정리 — 매일 한국 시간 새벽 4시.
//   서명은 제출할 때만 쓰이니 30일, 같은 글 기록은 90일(읽을 때도 90일 넘은 건 안 쓴다). 한 번에 400개씩·createdAt 단일 색인.
exports.cleanupAnalyses = onSchedule({ schedule: "0 19 * * *", timeZone: "UTC" }, async () => {
  const sweep = async (col, days) => {
    const cutoff = new Date(Date.now() - days * 864e5).toISOString();
    let total = 0;
    for (let round = 0; round < 10; round++) {
      const snap = await db.collection(col).where("createdAt", "<", cutoff).limit(400).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      total += snap.size;
      if (snap.size < 400) break;
    }
    return total;
  };
  const a = await sweep("analyses", 30);
  const c = await sweep("analysisCache", ANALYSIS_CACHE_DAYS);
  console.log(`[정리] 첨삭 서명 ${a}개 · 같은 글 기록 ${c}개 삭제`);
});


// 📖 잘 쓴 글 한 편 보기(2-E, Graham & Perin «본보기 글»). 싹DB examples(748편)에서 같은 장르 «상» 글을 고른다. AI 0원.
const EXEMPLAR_GENRE = { diary: ["일기"], review: ["독후감", "독서감상문"], letter: ["편지"], opinion: ["논설문"], explain: ["설명문"], story: ["이야기"], free: ["생활문", "일기"] };
exports.getExemplar = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const { gradeLevel, genre, topic } = request.data || {};
  const names = Object.hasOwn(EXEMPLAR_GENRE, String(genre)) ? EXEMPLAR_GENRE[genre] : EXEMPLAR_GENRE.free;
  const lv = gradeLevel === "middle" ? ["중", "중학교"] : gradeLevel === "high" ? ["고", "고등학교"] : ["초등", "초등학교"];
  const snap = await db.collection("examples").where("genre", "in", names).where("level", "==", "상").limit(300).get();
  // 학교급이 다른 글로 대신하지 않는다 · 문서 id 순으로 고정해 같은 주제면 늘 같은 글
  const docs = snap.docs.filter((d) => lv.includes(d.data().education_level)).sort((a, b) => a.id.localeCompare(b.id));
  if (!docs.length) return { found: false };
  const h = [...String(topic || "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const ex = docs[h % docs.length].data();
  const content = String(ex.content || "").replace(/^제목:\s*[^\n]*\n+/, "").slice(0, 3000);
  return { found: true, title: String(ex.title || "").slice(0, 80), content, genre: ex.genre };
});

// ============================================
// 📊 교사용 모아 보기(2026-11-20 업그레이드 2-G·2-H·2-K) — 계산은 functions/insights.js(시험 test-insights.mjs)
// ============================================
const INS = require("./insights.js");

// 2-G 우리 반 공통 약점 — 과제(주제) 하나. 학생 글 원문은 돌려주지 않는다.
exports.classInsights = onCall(async (request) => {
  const { classCode, topic } = request.data || {};
  await assertClassOwner(request, classCode);
  if (typeof topic !== "string" || !topic || topic.length > 200) throw new HttpsError("invalid-argument", "주제가 필요합니다.");
  const snap = await db.collection("writings").where("classCode", "==", classCode).where("topic", "==", topic).where("isDraft", "==", false).limit(200).get();
  return INS.classInsights(snap.docs.map((d) => d.data()));
});

// 2-H 학생 성장 리포트 — 그 학생의 담임(또는 관리자)만
exports.studentReport = onCall(async (request) => {
  const { studentId } = request.data || {};
  // 로그인·교사 여부를 학생 조회보다 먼저(남이 학생 id 가 있는지 떠보지 못하게)
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  if (typeof studentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(studentId)) throw new HttpsError("invalid-argument", "studentId 가 필요합니다.");
  const me = (await db.doc(`users/${request.auth.uid}`).get()).data();
  if (!(me?.role === "super_admin" || (me?.role === "teacher" && me.approved === true))) throw new HttpsError("permission-denied", "승인된 교사만 할 수 있습니다.");
  const stu = (await db.doc(`users/${studentId}`).get()).data();
  if (!stu || stu.role !== "student" || !stu.classCode) throw new HttpsError("permission-denied", "해당 클래스의 담당 교사만 할 수 있습니다.");
  await assertClassOwner(request, stu.classCode);
  // 최근 300편(학생 화면과 같은 색인 studentId+createdAt) → 지금 반·낸 글만
  const snap = await db.collection("writings").where("studentId", "==", studentId).orderBy("createdAt", "desc").limit(300).get();
  return { name: stu.name || "학생", ...INS.studentReport(snap.docs.map((d) => d.data()).filter((w) => w.classCode === stu.classCode && !w.isDraft)) };
});

// 2-K 품질 재는 자(관리자) — ① 교사가 고친 점수와 AI 점수의 차이(AI 0원) ② 같은 글 3편을 3번씩 다시 채점해 흔들림(약 9회 호출)
const QUALITY_SAMPLES = [
  { topic: "나의 하루", gradeLevel: "elementary_3_4", genre: "diary", text: "오늘은 비가 와서 운동장에 못 나갔다. 그래서 교실에서 친구들과 공기놀이를 했다. 처음에는 계속 떨어뜨렸는데 다섯 번째 판에서 꺾기까지 성공했다. 친구가 박수를 쳐 줘서 얼굴이 빨개졌다. 비 오는 날도 재미있을 수 있다는 걸 알았다." },
  { topic: "학교에 휴대전화를 가져와도 될까", gradeLevel: "elementary_5_6", genre: "opinion", text: "나는 학교에 휴대전화를 가져와도 된다고 생각한다. 첫째, 하교할 때 부모님과 연락할 수 있다. 둘째, 수업 시간에 모르는 낱말을 바로 찾아볼 수 있다. 물론 게임을 하는 친구가 있을 수 있지만 쉬는 시간에만 쓰자는 규칙을 정하면 된다. 그러므로 규칙을 지킨다면 휴대전화를 가져와도 된다." },
  { topic: "고마운 사람에게", gradeLevel: "elementary_1_2", genre: "letter", text: "할머니께. 할머니 안녕하세요. 저번에 맛있는 떡을 만들어 주셔서 고맙습니다. 떡이 쫀득쫀득해서 동생이랑 다 먹었어요. 다음에 또 놀러 갈게요. 건강하세요. 손녀 올림." },
];
exports.qualityReport = onCall({ secrets: [anthropicApiKey], timeoutSeconds: 300 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const me = (await db.doc(`users/${request.auth.uid}`).get()).data();
  if (me?.role !== "super_admin") throw new HttpsError("permission-denied", "관리자만 볼 수 있습니다.");
  const snap = await db.collection("writings").where("teacherCheckedAt", ">", "").limit(500).get();
  const agreement = INS.teacherAgreement(snap.docs.map((d) => d.data()));
  const last = (await db.doc("settings/qualityReport").get()).data() || null;
  if (request.data?.runConsistency !== true) return { agreement, consistency: last?.consistency || null, at: last?.at || null };
  // 유료 9회 — 10분에 한 번만
  if (last?.at && Date.now() - Date.parse(last.at) < 10 * 60 * 1000) throw new HttpsError("resource-exhausted", "10분 안에 다시 잴 수 없어요(방금 잰 값을 보여 줍니다).");

  // 같은 글 흔들림 — 같은 글 기록(analysisCache)을 거치지 않고 새로 채점한다
  const consistency = [];
  for (const smp of QUALITY_SAMPLES) {
    const scores = [];
    for (let i = 0; i < 3; i++) {
      await guardAI(request);
      try {
        const prompt = FB.buildAnalysisPrompt({ grade: smp.gradeLevel, topic: smp.topic, text: smp.text, wordCount: smp.text.replace(/\s/g, "").length, idealWordCount: IDEAL_WORDS[smp.gradeLevel], genre: smp.genre });
        const out = await callAI(prompt, { masked: true, maxTokens: 4096, systemPrompt: SYSTEM_PROMPTS.writingAnalyzer });
        const m = out.match(/\{[\s\S]*\}/);
        if (m) scores.push(FB.normalizeAnalysis(JSON.parse(m[0]), smp.text).score);
      } catch (e) {
        console.warn("[품질 재기] 실패", e.message);
      }
    }
    consistency.push({ topic: smp.topic, ...INS.spread(scores) });
  }
  const at = new Date().toISOString();
  await db.doc("settings/qualityReport").set({ at, agreement, consistency });
  return { agreement, consistency, at };
});

// ───────────── 3-2 친구 글에 칭찬 1 + 질문 1 (2026-11-20) ─────────────
//   peerShares/{writingId} = 담임이 고른 글의 «가린 사본»(글쓴이 칸은 서버만 읽는다)
//   peerNotes/{shareId_fromUid} = 친구가 남긴 말(pending → 담임 승인 → 글쓴이에게)
//   두 모음 모두 규칙으로 막고(firestore.rules) 함수로만 다룬다.
const PEER = require("./peer.js");

async function studentMe(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const me = (await db.doc(`users/${request.auth.uid}`).get()).data();
  if (me?.role !== "student" || !me.classCode) throw new HttpsError("permission-denied", "학생만 할 수 있습니다.");
  return me;
}

// 🔒 «AI 선생님에게 이렇게 보내요» 미리보기 — 서버가 실제로 보낼 때와 같은 가림(규칙 + 분석 층)을 그대로 돌려준다.
//   분석 층은 서버에서만 돈다(모델 110MB) — 화면이 따로 가리면 «보여 준 것»과 «보낸 것»이 달라진다.
//   AI 를 부르지 않는다(0원). 로그인한 사람만, 글은 MAX_AI_TEXT 까지.
const previewHits = new Map(); // uid → [분 시작, 횟수] — 인스턴스 안 속도 제한(AI 0원이지만 CPU·메모리를 쓴다)
exports.maskPreview = onCall({ ...MASK_FN, maxInstances: 10 }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const minute = Math.floor(Date.now() / 60000), hit = previewHits.get(request.auth.uid);
  if (hit && hit[0] === minute && hit[1] >= 20) throw new HttpsError("resource-exhausted", "잠깐만요, 너무 자주 눌렀어요. 조금 뒤에 다시 해 주세요.");
  previewHits.set(request.auth.uid, hit && hit[0] === minute ? [minute, hit[1] + 1] : [minute, 1]);
  if (previewHits.size > 5000) previewHits.clear();
  const { texts, maskWords } = request.data || {};
  if (!Array.isArray(texts) || texts.length < 1 || texts.length > 4) throw new HttpsError("invalid-argument", "글이 필요합니다.");
  const out = [];
  for (const t of texts) out.push((await maskForAI(t == null ? "" : t, maskWords)).text);
  return { texts: out };
});

exports.peerShare = onCall({ ...MASK_FN }, async (request) => {
  const { writingId, on } = request.data || {};
  if (!PEER.isId(writingId)) throw new HttpsError("invalid-argument", "글이 필요합니다.");
  const w = (await db.doc(`writings/${writingId}`).get()).data();
  if (!w || w.isDraft) throw new HttpsError("not-found", "글을 찾을 수 없습니다.");
  const cls = await assertClassOwner(request, w.classCode);
  const ref = db.doc(`peerShares/${writingId}`);
  if (!on) {
    await ref.delete(); // 공유부터 끊는다(peerSend 가 트랜잭션 안에서 공유를 다시 읽으므로 새 말이 더 붙지 않는다)
    for (;;) {
      const notes = await db.collection("peerNotes").where("shareId", "==", writingId).limit(400).get();
      if (notes.empty) break;
      const batch = db.batch();
      notes.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    return { on: false };
  }
  // 반 아이들 이름도 함께 가린다(친구 이름이 글에 나올 수 있다)
  const names = [...new Set((cls.students || []).flatMap((s) => [s.studentName, s.name, s.nickname]).filter((x) => typeof x === "string" && x.length >= 2))];
  const masked = (await maskForAI(String(w.content || "").slice(0, 4000), names)).text;
  const maskedTopic = (await maskForAI(String(w.topic || "").slice(0, 200), names)).text; // 주제에 이름을 쓴 아이도 있다
  await ref.set({ classCode: w.classCode, topic: maskedTopic, content: masked, ownerId: w.studentId, sharedAt: new Date().toISOString() });
  return { on: true };
});

exports.peerList = onCall(async (request) => {
  const me = await studentMe(request);
  const snap = await db.collection("peerShares").where("classCode", "==", me.classCode).limit(60).get();
  const mine = await db.collection("peerNotes").where("fromId", "==", request.auth.uid).where("classCode", "==", me.classCode).limit(60).get();
  const sent = new Set(mine.docs.map((d) => d.data().shareId));
  return {
    items: snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((s) => s.ownerId !== request.auth.uid)
      .sort((a, b) => String(b.sharedAt).localeCompare(String(a.sharedAt)))
      .slice(0, 30)
      .map((s) => PEER.shareView(s, sent)),
  };
});

exports.peerSend = onCall(async (request) => {
  const me = await studentMe(request);
  const { shareId, praise, question } = request.data || {};
  if (!PEER.isId(shareId)) throw new HttpsError("invalid-argument", "글이 필요합니다.");
  const why = PEER.checkNote({ praise, question });
  if (why) throw new HttpsError("invalid-argument", why);
  const shareRef = db.doc(`peerShares/${shareId}`);
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const ref = db.doc(`peerNotes/${shareId}_${request.auth.uid}`);
  const capRef = db.doc(`usage/peer_${request.auth.uid}_${day}`);
  await db.runTransaction(async (tx) => {
    const [sh, n, cap] = await Promise.all([tx.get(shareRef), tx.get(ref), tx.get(capRef)]);
    const share = sh.data(); // 트랜잭션 안에서 읽는다 — 담임이 방금 공유를 끄면 여기서 막힌다
    if (!share || share.classCode !== me.classCode) throw new HttpsError("not-found", "글을 찾을 수 없습니다.");
    if (share.ownerId === request.auth.uid) throw new HttpsError("failed-precondition", "내 글에는 남길 수 없어요.");
    if (n.exists) throw new HttpsError("already-exists", "이 글에는 이미 남겼어요.");
    if ((cap.data()?.count || 0) >= PEER.DAILY_NOTES) throw new HttpsError("resource-exhausted", `하루에 ${PEER.DAILY_NOTES}개까지 남길 수 있어요.`);
    tx.set(capRef, { count: (cap.data()?.count || 0) + 1, at: new Date().toISOString() });
    tx.create(ref, {
      shareId, classCode: me.classCode, toId: share.ownerId, fromId: request.auth.uid, fromName: String(me.name || "").slice(0, 40),
      topic: share.topic, praise: String(praise).trim(), question: String(question).trim(), status: "pending", createdAt: new Date().toISOString(),
    });
  });
  return { ok: true };
});

// 글쓴이: 승인된 말만(누가 썼는지는 안 보인다)
exports.peerInbox = onCall(async (request) => {
  const me = await studentMe(request);
  const snap = await db.collection("peerNotes").where("toId", "==", request.auth.uid).where("status", "==", "approved").limit(100).get();
  return {
    items: snap.docs.map((d) => d.data()).filter((n) => n.classCode === me.classCode) // 반을 옮기면 옛 반 말은 안 보인다
      .sort((a, b) => String(b.decidedAt).localeCompare(String(a.decidedAt)))
      .map((n) => ({ topic: n.topic, praise: n.praise, question: n.question, at: n.decidedAt })),
  };
});

// 담임: 기다리는 말(누가 누구에게 썼는지 보인다) · 승인/거절
exports.peerPending = onCall(async (request) => {
  const { classCode } = request.data || {};
  const cls = await assertClassOwner(request, classCode);
  const snap = await db.collection("peerNotes").where("classCode", "==", classCode).where("status", "==", "pending").limit(200).get();
  const nameOf = Object.fromEntries((cls.students || []).map((s) => [s.studentId, s.studentName || s.name || s.nickname || "학생"]));
  const shares = await db.collection("peerShares").where("classCode", "==", classCode).limit(60).get();
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      .map((n) => ({ id: n.id, topic: n.topic, praise: n.praise, question: n.question, from: nameOf[n.fromId] || n.fromName || "학생", to: nameOf[n.toId] || "학생", at: n.createdAt })),
    shared: shares.docs.map((d) => d.id),
  };
});

exports.peerDecide = onCall(async (request) => {
  const { noteId, approve } = request.data || {};
  if (!PEER.isId(noteId, 300)) throw new HttpsError("invalid-argument", "말이 필요합니다.");
  const ref = db.doc(`peerNotes/${noteId}`);
  const n = (await ref.get()).data();
  if (!n) throw new HttpsError("not-found", "찾을 수 없습니다.");
  await assertClassOwner(request, n.classCode);
  // 담임이 읽은 그 말만 — 그사이 지워지고 새로 온 말(같은 id)을 옛 화면에서 승인하지 않게 내용까지 맞춘다
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data();
    if (!cur || cur.status !== "pending") throw new HttpsError("failed-precondition", "이미 처리된 말이에요. 목록을 새로 고쳐 주세요.");
    if (typeof request.data.createdAt !== "string" || cur.createdAt !== request.data.createdAt) throw new HttpsError("failed-precondition", "그사이 새로 온 말이에요. 목록을 새로 고쳐 주세요.");
    if (approve) tx.update(ref, { status: "approved", decidedAt: new Date().toISOString() });
    else tx.delete(ref);
  });
  return { ok: true };
});
