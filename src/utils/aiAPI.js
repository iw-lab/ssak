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
