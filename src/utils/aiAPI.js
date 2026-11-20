import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";

export async function analyzeWriting(
  text,
  gradeLevel,
  topic,
  wordCount,
  idealWordCount,
  isRewrite = false,
  previousScore = null,
  previousText = null,
  maskWords = [],
  options = {}, // { genre, goal, focus } — 장르(2-A)·이번 글 목표(2-D)·과제 중점(2-J)
) {
  try {
    const analyzeWritingFn = httpsCallable(functions, "analyzeWriting");
    const result = await analyzeWritingFn({
      text,
      gradeLevel,
      topic,
      wordCount,
      idealWordCount,
      isRewrite,
      previousScore,
      previousText,
      maskWords,
      genre: options.genre || null,
      goal: options.goal || null,
      focus: Array.isArray(options.focus) ? options.focus : [],
    });
    return result.data;
  } catch (error) {
    console.error("AI API 에러:", error);
    throw error;
  }
}

export async function getWritingHelp(text, topic, helpType = "hint", maskWords = []) {
  try {
    const getWritingHelpFn = httpsCallable(functions, "getWritingHelp");
    const result = await getWritingHelpFn({
      text,
      topic,
      helpType,
      maskWords,
    });
    return result.data;
  } catch (error) {
    console.error("AI 도움 요청 에러:", error);
    throw error;
  }
}

export async function generateTopics(gradeLevel, count = 5, category = null) {
  try {
    const generateTopicsFn = httpsCallable(functions, "generateTopics");
    const result = await generateTopicsFn({
      gradeLevel,
      count,
      category,
    });
    return result.data;
  } catch (error) {
    console.error("AI 주제 생성 에러:", error);
    throw error;
  }
}

export async function getQuickAdvice(
  text,
  topic,
  gradeLevel,
  adviceType = "encourage",
  maskWords = [],
) {
  try {
    const getQuickAdviceFn = httpsCallable(functions, "getQuickAdvice");
    const result = await getQuickAdviceFn({
      text,
      topic,
      gradeLevel,
      adviceType,
      maskWords,
    });
    return result.data;
  } catch (error) {
    console.error("실시간 조언 에러:", error);
    throw error;
  }
}

// 싹DB 상태 확인 (디버깅용)
export async function checkSsakDBStatus() {
  try {
    const checkSsakDBStatusFn = httpsCallable(functions, "checkSsakDBStatus");
    const result = await checkSsakDBStatusFn();
    return result.data;
  } catch (error) {
    console.error("싹DB 상태 확인 에러:", error);
    throw error;
  }
}

// 잘 쓴 글 한 편(2-E) — 싹DB 본보기 글, AI 0원
export async function getExemplar(gradeLevel, genre, topic) {
  const fn = httpsCallable(functions, "getExemplar");
  const r = await fn({ gradeLevel, genre, topic });
  return r.data;
}

// 교사용 모아 보기(2-G·2-H) · 관리자 품질 재기(2-K)
export async function getClassInsights(classCode, topic) {
  return (await httpsCallable(functions, "classInsights")({ classCode, topic })).data;
}
export async function getStudentReport(studentId) {
  return (await httpsCallable(functions, "studentReport")({ studentId })).data;
}
export async function getQualityReport(runConsistency = false) {
  return (await httpsCallable(functions, "qualityReport")({ runConsistency })).data;
}

// 3-2 친구 글 칭찬·질문
const call = async (name, data) => (await httpsCallable(functions, name)(data || {})).data;
export const peerShare = (writingId, on) => call("peerShare", { writingId, on });
export const peerList = () => call("peerList");
export const peerSend = (shareId, praise, question) => call("peerSend", { shareId, praise, question });
export const peerInbox = () => call("peerInbox");
export const peerPending = (classCode) => call("peerPending", { classCode });
export const peerDecide = (noteId, approve, createdAt) => call("peerDecide", { noteId, approve, createdAt });
