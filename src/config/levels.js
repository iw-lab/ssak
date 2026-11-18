/* design-gate: ignore-file — 아바타·상점·레벨 «콘텐츠»(아이템 그림·배지 데이터)라 화면 장식 이모지가 아니다(2026-11-18 리디자인) */
// 레벨 시스템 설정
export const LEVELS = [
  { level: 1, name: '씨앗', emoji: '🌱', minPoints: 0, color: 'from-gray-400 to-gray-500' },
  { level: 2, name: '새싹', emoji: '🌿', minPoints: 100, color: 'from-green-400 to-green-500' },
  { level: 3, name: '잎사귀', emoji: '🍀', minPoints: 300, color: 'from-green-500 to-emerald-500' },
  { level: 4, name: '꽃봉오리', emoji: '🌷', minPoints: 600, color: 'from-pink-400 to-pink-500' },
  { level: 5, name: '꽃', emoji: '🌸', minPoints: 1000, color: 'from-pink-500 to-rose-500' },
  { level: 6, name: '나무', emoji: '🌳', minPoints: 1500, color: 'from-emerald-500 to-green-600' },
  { level: 7, name: '큰나무', emoji: '🌲', minPoints: 2500, color: 'from-green-600 to-green-700' },
  { level: 8, name: '숲', emoji: '🏕️', minPoints: 4000, color: 'from-green-700 to-emerald-800' },
  { level: 9, name: '정원', emoji: '🏡', minPoints: 6000, color: 'from-emerald-600 to-teal-600' },
  { level: 10, name: '마스터', emoji: '👑', minPoints: 10000, color: 'from-yellow-500 to-amber-500' },
];

// 포인트로 레벨 정보 가져오기
export const getLevelInfo = (points) => {
  let currentLevel = LEVELS[0];
  for (const level of LEVELS) {
    if (points >= level.minPoints) {
      currentLevel = level;
    } else {
      break;
    }
  }
  return currentLevel;
};

// 다음 레벨까지 필요한 포인트
export const getNextLevelInfo = (points) => {
  const currentLevel = getLevelInfo(points);
  const nextLevelIndex = LEVELS.findIndex(l => l.level === currentLevel.level) + 1;

  if (nextLevelIndex >= LEVELS.length) {
    return { nextLevel: null, pointsNeeded: 0, progress: 100 };
  }

  const nextLevel = LEVELS[nextLevelIndex];
  const pointsNeeded = nextLevel.minPoints - points;
  const levelRange = nextLevel.minPoints - currentLevel.minPoints;
  const currentProgress = points - currentLevel.minPoints;
  const progress = Math.round((currentProgress / levelRange) * 100);

  return { nextLevel, pointsNeeded, progress };
};

// 업적/뱃지 정의 (100개)
export const ACHIEVEMENTS = [
  // ============================================
  // 📝 글쓰기 횟수 (15개)
  // ============================================
  { id: 'first_submit', name: '첫 발걸음', emoji: '👣', description: '첫 글 제출 완료', category: 'writing' },
  { id: 'submit_3', name: '초보 작가', emoji: '✏️', description: '3편 제출 완료', category: 'writing' },
  { id: 'submit_5', name: '꾸준한 작가', emoji: '✍️', description: '5편 제출 완료', category: 'writing' },
  { id: 'submit_10', name: '열정 작가', emoji: '📝', description: '10편 제출 완료', category: 'writing' },
  { id: 'submit_20', name: '성실 작가', emoji: '📋', description: '20편 제출 완료', category: 'writing' },
  { id: 'submit_30', name: '베스트셀러 작가', emoji: '📚', description: '30편 제출 완료', category: 'writing' },
  { id: 'submit_50', name: '다작 작가', emoji: '🖊️', description: '50편 제출 완료', category: 'writing' },
  { id: 'submit_75', name: '문학가', emoji: '🎭', description: '75편 제출 완료', category: 'writing' },
  { id: 'submit_100', name: '전설의 작가', emoji: '🏆', description: '100편 제출 완료', category: 'writing' },
  { id: 'submit_150', name: '작가의 길', emoji: '🛤️', description: '150편 제출 완료', category: 'writing' },
  { id: 'submit_200', name: '글쓰기 달인', emoji: '🎖️', description: '200편 제출 완료', category: 'writing' },
  { id: 'submit_300', name: '프로 작가', emoji: '💼', description: '300편 제출 완료', category: 'writing' },
  { id: 'submit_500', name: '마스터 작가', emoji: '👑', description: '500편 제출 완료', category: 'writing' },
  { id: 'submit_750', name: '그랜드마스터', emoji: '🌟', description: '750편 제출 완료', category: 'writing' },
  { id: 'submit_1000', name: '천편일률', emoji: '🏅', description: '1000편 제출 완료', category: 'writing' },

  // ============================================
  // ⭐ 점수 관련 (15개)
  // ============================================
  { id: 'score_60', name: '노력상', emoji: '💪', description: '60점 이상 달성', category: 'score' },
  { id: 'score_70', name: '발전상', emoji: '📈', description: '70점 이상 달성', category: 'score' },
  { id: 'score_80', name: '우수 작가', emoji: '⭐', description: '80점 이상 달성', category: 'score' },
  { id: 'score_85', name: '실력파', emoji: '✨', description: '85점 이상 달성', category: 'score' },
  { id: 'score_90', name: '최우수 작가', emoji: '🌟', description: '90점 이상 달성', category: 'score' },
  { id: 'score_95', name: '천재 작가', emoji: '🧠', description: '95점 이상 달성', category: 'score' },
  { id: 'score_100', name: '완벽한 글', emoji: '💯', description: '100점 달성', category: 'score' },
  { id: 'avg_70', name: '안정적인 작가', emoji: '📊', description: '평균 70점 이상', category: 'score' },
  { id: 'avg_80', name: '고품질 작가', emoji: '🎯', description: '평균 80점 이상', category: 'score' },
  { id: 'avg_90', name: '명문 작가', emoji: '🏛️', description: '평균 90점 이상', category: 'score' },
  { id: 'perfect_3', name: '연속 완벽', emoji: '🔥', description: '연속 3회 90점 이상', category: 'score' },
  { id: 'perfect_5', name: '불꽃 연속', emoji: '🔥🔥', description: '연속 5회 90점 이상', category: 'score' },
  { id: 'perfect_10', name: '완벽주의자', emoji: '💎', description: '연속 10회 90점 이상', category: 'score' },
  { id: 'score_80_10times', name: '꾸준한 고득점', emoji: '📚', description: '80점 이상 10회 달성', category: 'score' },
  { id: 'score_90_5times', name: '최고의 순간들', emoji: '🌠', description: '90점 이상 5회 달성', category: 'score' },

  // ============================================
  // 📅 연속 제출 관련 (12개)
  // ============================================
  { id: 'streak_2', name: '연속 시작', emoji: '🌱', description: '2일 연속 제출', category: 'streak' },
  { id: 'streak_3', name: '3일 연속', emoji: '📅', description: '3일 연속 제출', category: 'streak' },
  { id: 'streak_5', name: '5일 연속', emoji: '🗓️', description: '5일 연속 제출', category: 'streak' },
  { id: 'streak_7', name: '1주일 연속', emoji: '📆', description: '7일 연속 제출', category: 'streak' },
  { id: 'streak_14', name: '2주 연속', emoji: '🔄', description: '14일 연속 제출', category: 'streak' },
  { id: 'streak_21', name: '3주 연속', emoji: '🌙', description: '21일 연속 제출', category: 'streak' },
  { id: 'streak_30', name: '한 달 연속', emoji: '📆', description: '30일 연속 제출', category: 'streak' },
  { id: 'streak_60', name: '두 달 연속', emoji: '🏃', description: '60일 연속 제출', category: 'streak' },
  { id: 'streak_90', name: '분기 연속', emoji: '🏃‍♂️', description: '90일 연속 제출', category: 'streak' },
  { id: 'streak_180', name: '반년 연속', emoji: '🦸', description: '180일 연속 제출', category: 'streak' },
  { id: 'streak_365', name: '1년 연속', emoji: '🏆', description: '365일 연속 제출', category: 'streak' },
  { id: 'streak_comeback', name: '컴백 작가', emoji: '🔙', description: '7일 이상 쉬고 다시 제출', category: 'streak' },

  // ============================================
  // 📄 글자 수 관련 (12개)
  // ============================================
  { id: 'words_100', name: '100자 작가', emoji: '📄', description: '한 편에 100자 이상', category: 'words' },
  { id: 'words_300', name: '300자 돌파', emoji: '📃', description: '한 편에 300자 이상', category: 'words' },
  { id: 'words_500', name: '500자 돌파', emoji: '📑', description: '한 편에 500자 이상', category: 'words' },
  { id: 'words_700', name: '700자 작가', emoji: '📋', description: '한 편에 700자 이상', category: 'words' },
  { id: 'words_1000', name: '1000자 돌파', emoji: '📖', description: '한 편에 1000자 이상', category: 'words' },
  { id: 'words_1500', name: '1500자 작가', emoji: '📚', description: '한 편에 1500자 이상', category: 'words' },
  { id: 'words_2000', name: '장편 작가', emoji: '📕', description: '한 편에 2000자 이상', category: 'words' },
  { id: 'words_3000', name: '대작 작가', emoji: '📗', description: '한 편에 3000자 이상', category: 'words' },
  { id: 'words_5000', name: '소설가', emoji: '📘', description: '한 편에 5000자 이상', category: 'words' },
  { id: 'total_words_10000', name: '만자 돌파', emoji: '✏️', description: '총 10,000자 작성', category: 'words' },
  { id: 'total_words_50000', name: '5만자 작가', emoji: '🖋️', description: '총 50,000자 작성', category: 'words' },
  { id: 'total_words_100000', name: '10만자 달성', emoji: '🏆', description: '총 100,000자 작성', category: 'words' },

  // ============================================
  // 💰 포인트 관련 (12개)
  // ============================================
  { id: 'points_100', name: '100P 달성', emoji: '🪙', description: '100 포인트 누적', category: 'points' },
  { id: 'points_300', name: '300P 달성', emoji: '💴', description: '300 포인트 누적', category: 'points' },
  { id: 'points_500', name: '500P 달성', emoji: '💰', description: '500 포인트 누적', category: 'points' },
  { id: 'points_1000', name: '1000P 달성', emoji: '💵', description: '1000 포인트 누적', category: 'points' },
  { id: 'points_2000', name: '2000P 달성', emoji: '💳', description: '2000 포인트 누적', category: 'points' },
  { id: 'points_3000', name: '3000P 달성', emoji: '💎', description: '3000 포인트 누적', category: 'points' },
  { id: 'points_5000', name: '부자 작가', emoji: '💎💎', description: '5000 포인트 누적', category: 'points' },
  { id: 'points_7500', name: '재벌 작가', emoji: '🏦', description: '7500 포인트 누적', category: 'points' },
  { id: 'points_10000', name: '만점 부자', emoji: '🤑', description: '10000 포인트 누적', category: 'points' },
  { id: 'points_15000', name: '포인트 왕', emoji: '👑', description: '15000 포인트 누적', category: 'points' },
  { id: 'points_20000', name: '포인트 황제', emoji: '🏰', description: '20000 포인트 누적', category: 'points' },
  { id: 'points_50000', name: '전설의 부자', emoji: '🌟', description: '50000 포인트 누적', category: 'points' },

  // ============================================
  // ⏰ 시간대 관련 (10개)
  // ============================================
  { id: 'early_bird', name: '아침형 작가', emoji: '🌅', description: '오전 6시~8시에 제출', category: 'time' },
  { id: 'morning_writer', name: '오전 작가', emoji: '☀️', description: '오전 9시~11시에 제출', category: 'time' },
  { id: 'lunch_writer', name: '점심 작가', emoji: '🍱', description: '오후 12시~1시에 제출', category: 'time' },
  { id: 'afternoon_writer', name: '오후 작가', emoji: '🌤️', description: '오후 2시~5시에 제출', category: 'time' },
  { id: 'evening_writer', name: '저녁 작가', emoji: '🌆', description: '오후 6시~8시에 제출', category: 'time' },
  { id: 'night_owl', name: '밤형 작가', emoji: '🦉', description: '오후 9시~11시에 제출', category: 'time' },
  { id: 'midnight_writer', name: '자정 작가', emoji: '🌙', description: '자정~새벽 2시에 제출', category: 'time' },
  { id: 'weekend_writer', name: '주말 작가', emoji: '🎉', description: '주말에 제출', category: 'time' },
  { id: 'holiday_writer', name: '휴일 작가', emoji: '🎊', description: '공휴일에 제출', category: 'time' },
  { id: 'all_time_writer', name: '24시간 작가', emoji: '⏰', description: '모든 시간대 제출 경험', category: 'time' },

  // ============================================
  // 🎨 글쓰기 유형 관련 (12개)
  // ============================================
  { id: 'type_diary', name: '일기 전문가', emoji: '📔', description: '일기 5편 작성', category: 'type' },
  { id: 'type_letter', name: '편지 전문가', emoji: '💌', description: '편지 5편 작성', category: 'type' },
  { id: 'type_story', name: '이야기꾼', emoji: '📚', description: '서사/이야기 5편 작성', category: 'type' },
  { id: 'type_opinion', name: '논객', emoji: '💬', description: '주장하는 글 5편 작성', category: 'type' },
  { id: 'type_description', name: '설명왕', emoji: '📋', description: '설명하는 글 5편 작성', category: 'type' },
  { id: 'type_imagination', name: '상상력 대장', emoji: '🦄', description: '상상글 5편 작성', category: 'type' },
  { id: 'type_poem', name: '시인', emoji: '🎭', description: '시 3편 작성', category: 'type' },
  { id: 'type_review', name: '감상문 달인', emoji: '🎬', description: '감상문 5편 작성', category: 'type' },
  { id: 'type_all_rounder', name: '만능 작가', emoji: '🌈', description: '모든 유형 1편씩 작성', category: 'type' },
  { id: 'type_specialist', name: '전문 작가', emoji: '🎯', description: '한 유형 10편 이상', category: 'type' },
  { id: 'type_versatile', name: '다재다능', emoji: '🎪', description: '3가지 유형 각 5편 이상', category: 'type' },
  { id: 'type_master', name: '유형 마스터', emoji: '👑', description: '5가지 유형 각 5편 이상', category: 'type' },

  // ============================================
  // 🔄 고쳐쓰기/개선 관련 (8개)
  // ============================================
  { id: 'rewrite_first', name: '첫 퇴고', emoji: '✏️', description: '첫 고쳐쓰기 완료', category: 'rewrite' },
  { id: 'rewrite_success', name: '퇴고 성공', emoji: '📝', description: '고쳐쓰기로 점수 10점 이상 상승', category: 'rewrite' },
  { id: 'rewrite_master', name: '퇴고의 달인', emoji: '🖊️', description: '고쳐쓰기로 80점 이상 달성', category: 'rewrite' },
  { id: 'rewrite_5', name: '5번 퇴고', emoji: '🔄', description: '고쳐쓰기 5회 완료', category: 'rewrite' },
  { id: 'rewrite_10', name: '10번 퇴고', emoji: '🔁', description: '고쳐쓰기 10회 완료', category: 'rewrite' },
  { id: 'rewrite_20', name: '퇴고 전문가', emoji: '⚡', description: '고쳐쓰기 20회 완료', category: 'rewrite' },
  { id: 'improvement_king', name: '발전왕', emoji: '📈', description: '같은 주제 30점 이상 상승', category: 'rewrite' },
  { id: 'never_give_up', name: '포기란 없다', emoji: '💪', description: '한 글에서 5번 이상 재도전', category: 'rewrite' },

  // ============================================
  // 🏆 랭킹/경쟁 관련 (8개)
  // ============================================
  { id: 'rank_top10', name: 'TOP 10', emoji: '🏅', description: '주간 랭킹 10위 안에 진입', category: 'rank' },
  { id: 'rank_top5', name: 'TOP 5', emoji: '🥉', description: '주간 랭킹 5위 안에 진입', category: 'rank' },
  { id: 'rank_top3', name: 'TOP 3', emoji: '🥈', description: '주간 랭킹 3위 안에 진입', category: 'rank' },
  { id: 'rank_1st', name: '1등', emoji: '🥇', description: '주간 랭킹 1위 달성', category: 'rank' },
  { id: 'rank_up', name: '순위 상승', emoji: '⬆️', description: '전주 대비 5순위 이상 상승', category: 'rank' },
  { id: 'rank_maintain', name: '왕좌 수호', emoji: '👑', description: '2주 연속 1위 유지', category: 'rank' },
  { id: 'monthly_top10', name: '월간 TOP 10', emoji: '📊', description: '월간 랭킹 10위 안에 진입', category: 'rank' },
  { id: 'monthly_1st', name: '이달의 작가', emoji: '🏆', description: '월간 랭킹 1위 달성', category: 'rank' },

  // ============================================
  // 🎁 특별/시즌 업적 (8개)
  // ============================================
  { id: 'new_year', name: '새해 작가', emoji: '🎆', description: '1월 1일에 글 제출', category: 'special' },
  { id: 'christmas', name: '크리스마스 작가', emoji: '🎄', description: '12월 25일에 글 제출', category: 'special' },
  { id: 'halloween', name: '할로윈 작가', emoji: '🎃', description: '10월 31일에 글 제출', category: 'special' },
  { id: 'birthday_writer', name: '생일 작가', emoji: '🎂', description: '생일에 글 제출', category: 'special' },
  { id: 'first_day', name: '첫날의 기억', emoji: '🌟', description: '가입 첫날 글 제출', category: 'special' },
  { id: 'anniversary', name: '1주년 기념', emoji: '🎊', description: '가입 1주년에 글 제출', category: 'special' },
  { id: 'lucky_7', name: '럭키 세븐', emoji: '🍀', description: '7점 단위 점수 7번 획득', category: 'special' },
  { id: 'perfect_timing', name: '완벽한 타이밍', emoji: '⏱️', description: '정각에 글 제출', category: 'special' },
];

// 업적 달성 여부 확인 (100개 업적 지원)
export const checkAchievements = (userStats) => {
  const earned = [];
  const submissions = userStats.totalSubmissions || 0;
  const highestScore = userStats.highestScore || 0;
  const avgScore = userStats.avgScore || 0;
  const streakDays = userStats.streakDays || userStats.currentStreak || 0;
  const maxStreak = userStats.maxStreak || streakDays;
  const maxWordCount = userStats.maxWordCount || 0;
  const totalWords = userStats.totalWords || 0;
  const totalPoints = userStats.totalPoints || 0;
  const consecutivePerfect = userStats.consecutivePerfect || 0;
  const score80Count = userStats.score80Count || 0;
  const score90Count = userStats.score90Count || 0;
  const rewriteCount = userStats.rewriteCount || 0;

  // 시간대별 제출 여부
  const timeSlots = userStats.timeSlots || {};
  const writingTypes = userStats.writingTypes || {};

  for (const achievement of ACHIEVEMENTS) {
    let isEarned = false;

    switch (achievement.id) {
      // ============================================
      // 📝 글쓰기 횟수 (15개)
      // ============================================
      case 'first_submit': isEarned = submissions >= 1; break;
      case 'submit_3': isEarned = submissions >= 3; break;
      case 'submit_5': isEarned = submissions >= 5; break;
      case 'submit_10': isEarned = submissions >= 10; break;
      case 'submit_20': isEarned = submissions >= 20; break;
      case 'submit_30': isEarned = submissions >= 30; break;
      case 'submit_50': isEarned = submissions >= 50; break;
      case 'submit_75': isEarned = submissions >= 75; break;
      case 'submit_100': isEarned = submissions >= 100; break;
      case 'submit_150': isEarned = submissions >= 150; break;
      case 'submit_200': isEarned = submissions >= 200; break;
      case 'submit_300': isEarned = submissions >= 300; break;
      case 'submit_500': isEarned = submissions >= 500; break;
      case 'submit_750': isEarned = submissions >= 750; break;
      case 'submit_1000': isEarned = submissions >= 1000; break;

      // ============================================
      // ⭐ 점수 관련 (15개)
      // ============================================
      case 'score_60': isEarned = highestScore >= 60; break;
      case 'score_70': isEarned = highestScore >= 70; break;
      case 'score_80': isEarned = highestScore >= 80; break;
      case 'score_85': isEarned = highestScore >= 85; break;
      case 'score_90': isEarned = highestScore >= 90; break;
      case 'score_95': isEarned = highestScore >= 95; break;
      case 'score_100': isEarned = highestScore >= 100; break;
      case 'avg_70': isEarned = avgScore >= 70 && submissions >= 3; break;
      case 'avg_80': isEarned = avgScore >= 80 && submissions >= 5; break;
      case 'avg_90': isEarned = avgScore >= 90 && submissions >= 5; break;
      case 'perfect_3': isEarned = consecutivePerfect >= 3; break;
      case 'perfect_5': isEarned = consecutivePerfect >= 5; break;
      case 'perfect_10': isEarned = consecutivePerfect >= 10; break;
      case 'score_80_10times': isEarned = score80Count >= 10; break;
      case 'score_90_5times': isEarned = score90Count >= 5; break;

      // ============================================
      // 📅 연속 제출 관련 (12개)
      // ============================================
      case 'streak_2': isEarned = maxStreak >= 2; break;
      case 'streak_3': isEarned = maxStreak >= 3; break;
      case 'streak_5': isEarned = maxStreak >= 5; break;
      case 'streak_7': isEarned = maxStreak >= 7; break;
      case 'streak_14': isEarned = maxStreak >= 14; break;
      case 'streak_21': isEarned = maxStreak >= 21; break;
      case 'streak_30': isEarned = maxStreak >= 30; break;
      case 'streak_60': isEarned = maxStreak >= 60; break;
      case 'streak_90': isEarned = maxStreak >= 90; break;
      case 'streak_180': isEarned = maxStreak >= 180; break;
      case 'streak_365': isEarned = maxStreak >= 365; break;
      case 'streak_comeback': isEarned = userStats.hasComeback || false; break;

      // ============================================
      // 📄 글자 수 관련 (12개)
      // ============================================
      case 'words_100': isEarned = maxWordCount >= 100; break;
      case 'words_300': isEarned = maxWordCount >= 300; break;
      case 'words_500': isEarned = maxWordCount >= 500; break;
      case 'words_700': isEarned = maxWordCount >= 700; break;
      case 'words_1000': isEarned = maxWordCount >= 1000; break;
      case 'words_1500': isEarned = maxWordCount >= 1500; break;
      case 'words_2000': isEarned = maxWordCount >= 2000; break;
      case 'words_3000': isEarned = maxWordCount >= 3000; break;
      case 'words_5000': isEarned = maxWordCount >= 5000; break;
      case 'total_words_10000': isEarned = totalWords >= 10000; break;
      case 'total_words_50000': isEarned = totalWords >= 50000; break;
      case 'total_words_100000': isEarned = totalWords >= 100000; break;

      // ============================================
      // 💰 포인트 관련 (12개)
      // ============================================
      case 'points_100': isEarned = totalPoints >= 100; break;
      case 'points_300': isEarned = totalPoints >= 300; break;
      case 'points_500': isEarned = totalPoints >= 500; break;
      case 'points_1000': isEarned = totalPoints >= 1000; break;
      case 'points_2000': isEarned = totalPoints >= 2000; break;
      case 'points_3000': isEarned = totalPoints >= 3000; break;
      case 'points_5000': isEarned = totalPoints >= 5000; break;
      case 'points_7500': isEarned = totalPoints >= 7500; break;
      case 'points_10000': isEarned = totalPoints >= 10000; break;
      case 'points_15000': isEarned = totalPoints >= 15000; break;
      case 'points_20000': isEarned = totalPoints >= 20000; break;
      case 'points_50000': isEarned = totalPoints >= 50000; break;

      // ============================================
      // ⏰ 시간대 관련 (10개)
      // ============================================
      case 'early_bird': isEarned = timeSlots.early || userStats.hasEarlySubmission || false; break;
      case 'morning_writer': isEarned = timeSlots.morning || false; break;
      case 'lunch_writer': isEarned = timeSlots.lunch || false; break;
      case 'afternoon_writer': isEarned = timeSlots.afternoon || false; break;
      case 'evening_writer': isEarned = timeSlots.evening || false; break;
      case 'night_owl': isEarned = timeSlots.night || userStats.hasNightSubmission || false; break;
      case 'midnight_writer': isEarned = timeSlots.midnight || false; break;
      case 'weekend_writer': isEarned = timeSlots.weekend || userStats.hasWeekendSubmission || false; break;
      case 'holiday_writer': isEarned = timeSlots.holiday || false; break;
      case 'all_time_writer':
        isEarned = timeSlots.early && timeSlots.morning && timeSlots.afternoon &&
                   timeSlots.evening && timeSlots.night;
        break;

      // ============================================
      // 🎨 글쓰기 유형 관련 (12개)
      // ============================================
      case 'type_diary': isEarned = (writingTypes.diary || 0) >= 5; break;
      case 'type_letter': isEarned = (writingTypes.letter || 0) >= 5; break;
      case 'type_story': isEarned = (writingTypes.story || 0) >= 5; break;
      case 'type_opinion': isEarned = (writingTypes.opinion || 0) >= 5; break;
      case 'type_description': isEarned = (writingTypes.description || 0) >= 5; break;
      case 'type_imagination': isEarned = (writingTypes.imagination || 0) >= 5; break;
      case 'type_poem': isEarned = (writingTypes.poem || 0) >= 3; break;
      case 'type_review': isEarned = (writingTypes.review || 0) >= 5; break;
      case 'type_all_rounder':
        isEarned = Object.keys(writingTypes).length >= 8;
        break;
      case 'type_specialist':
        isEarned = Object.values(writingTypes).some(count => count >= 10);
        break;
      case 'type_versatile':
        isEarned = Object.values(writingTypes).filter(count => count >= 5).length >= 3;
        break;
      case 'type_master':
        isEarned = Object.values(writingTypes).filter(count => count >= 5).length >= 5;
        break;

      // ============================================
      // 🔄 고쳐쓰기/개선 관련 (8개)
      // ============================================
      case 'rewrite_first': isEarned = rewriteCount >= 1; break;
      case 'rewrite_success': isEarned = userStats.hasRewriteImprovement || false; break;
      case 'rewrite_master': isEarned = userStats.hasRewriteSuccess || false; break;
      case 'rewrite_5': isEarned = rewriteCount >= 5; break;
      case 'rewrite_10': isEarned = rewriteCount >= 10; break;
      case 'rewrite_20': isEarned = rewriteCount >= 20; break;
      case 'improvement_king': isEarned = userStats.hasBigImprovement || false; break;
      case 'never_give_up': isEarned = userStats.hasMultipleRetries || false; break;

      // ============================================
      // 🏆 랭킹/경쟁 관련 (8개)
      // ============================================
      case 'rank_top10': isEarned = userStats.bestWeeklyRank <= 10 && userStats.bestWeeklyRank > 0; break;
      case 'rank_top5': isEarned = userStats.bestWeeklyRank <= 5 && userStats.bestWeeklyRank > 0; break;
      case 'rank_top3': isEarned = userStats.bestWeeklyRank <= 3 && userStats.bestWeeklyRank > 0; break;
      case 'rank_1st': isEarned = userStats.bestWeeklyRank === 1; break;
      case 'rank_up': isEarned = userStats.hasRankUp || false; break;
      case 'rank_maintain': isEarned = userStats.consecutiveFirst >= 2; break;
      case 'monthly_top10': isEarned = userStats.bestMonthlyRank <= 10 && userStats.bestMonthlyRank > 0; break;
      case 'monthly_1st': isEarned = userStats.bestMonthlyRank === 1; break;

      // ============================================
      // 🎁 특별/시즌 업적 (8개)
      // ============================================
      case 'new_year': isEarned = userStats.hasNewYearSubmission || false; break;
      case 'christmas': isEarned = userStats.hasChristmasSubmission || false; break;
      case 'halloween': isEarned = userStats.hasHalloweenSubmission || false; break;
      case 'birthday_writer': isEarned = userStats.hasBirthdaySubmission || false; break;
      case 'first_day': isEarned = userStats.hasFirstDaySubmission || false; break;
      case 'anniversary': isEarned = userStats.hasAnniversarySubmission || false; break;
      case 'lucky_7': isEarned = (userStats.lucky7Count || 0) >= 7; break;
      case 'perfect_timing': isEarned = userStats.hasPerfectTiming || false; break;

      default:
        isEarned = false;
    }

    if (isEarned) {
      earned.push(achievement);
    }
  }

  return earned;
};

// 업적 카테고리별 그룹화
export const getAchievementsByCategory = () => {
  const categories = {
    writing: { name: '📝 글쓰기', achievements: [] },
    score: { name: '⭐ 점수', achievements: [] },
    streak: { name: '📅 연속', achievements: [] },
    words: { name: '📄 글자 수', achievements: [] },
    points: { name: '💰 포인트', achievements: [] },
    time: { name: '⏰ 시간대', achievements: [] },
    type: { name: '🎨 글 유형', achievements: [] },
    rewrite: { name: '🔄 고쳐쓰기', achievements: [] },
    rank: { name: '🏆 랭킹', achievements: [] },
    special: { name: '🎁 특별', achievements: [] },
  };

  for (const achievement of ACHIEVEMENTS) {
    if (categories[achievement.category]) {
      categories[achievement.category].achievements.push(achievement);
    }
  }

  return categories;
};

// 총 업적 개수
export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;

// 글쓰기 템플릿
export const WRITING_TEMPLATES = [
  {
    id: 'free',
    name: '자유 글쓰기',
    emoji: '✏️',
    description: '형식 없이 자유롭게 작성',
    template: ''
  },
  {
    id: 'intro_body_conclusion',
    name: '서론-본론-결론',
    emoji: '📝',
    description: '기본적인 글 구성',
    template: `[서론]
주제를 소개하고, 글을 쓰는 이유나 배경을 적어보세요.


[본론]
주제에 대해 자세히 설명하거나, 경험/생각을 풀어서 써보세요.


[결론]
글을 정리하고, 느낀 점이나 다짐을 적어보세요.

`
  },
  {
    id: 'diary',
    name: '일기',
    emoji: '📔',
    description: '하루를 기록하는 일기',
    template: `오늘의 날씨:

오늘 있었던 일:


가장 기억에 남는 일:


오늘의 기분:


내일 하고 싶은 일:

`
  },
  {
    id: 'letter',
    name: '편지',
    emoji: '💌',
    description: '누군가에게 쓰는 편지',
    template: `_____에게

안녕하세요, 저는 _____입니다.




보고 싶은 마음을 담아,
_____가(이)
`
  },
  {
    id: 'book_report',
    name: '독후감',
    emoji: '📖',
    description: '책을 읽고 쓰는 감상문',
    template: `책 제목:
저자:
읽은 날짜:

[책 소개]
이 책은 어떤 내용인가요?


[인상 깊은 장면]
가장 기억에 남는 장면이나 문장은 무엇인가요?


[내 생각과 느낌]
이 책을 읽고 어떤 생각이 들었나요?


[추천하고 싶은 사람]
이 책을 누구에게 추천하고 싶나요? 왜 그런가요?

`
  },
  {
    id: 'opinion',
    name: '주장하는 글',
    emoji: '💬',
    description: '내 의견을 주장하는 글',
    template: `[나의 주장]
나는 _____라고 생각합니다.

[이유 1]
첫 번째로,


[이유 2]
두 번째로,


[이유 3]
세 번째로,


[결론]
따라서, _____

`
  },
  {
    id: 'description',
    name: '설명하는 글',
    emoji: '📋',
    description: '무언가를 설명하는 글',
    template: `[소개]
_____에 대해 설명하겠습니다.

[정의/특징]
_____은(는) _____입니다.


[상세 설명]



[마무리]
이처럼 _____

`
  },
  {
    id: 'story',
    name: '이야기 글',
    emoji: '📚',
    description: '창작 이야기',
    template: `제목:

[배경]
언제, 어디서 일어난 이야기인가요?


[등장인물]
누가 나오나요?


[사건의 시작]
무슨 일이 일어났나요?


[사건의 전개]
그 다음에 어떻게 되었나요?


[결말]
이야기는 어떻게 끝나나요?

`
  },
  {
    id: 'poem',
    name: '시',
    emoji: '🎭',
    description: '감정을 담은 시',
    template: `제목:




`
  },
  {
    id: 'news',
    name: '기사문',
    emoji: '📰',
    description: '뉴스 기사 형식',
    template: `[제목]


[누가]
[언제]
[어디서]
[무엇을]
[어떻게]
[왜]

[상세 내용]


[기자 의견]

`
  },
  {
    id: 'interview',
    name: '인터뷰',
    emoji: '🎤',
    description: '가상 인터뷰 글',
    template: `인터뷰 대상:

Q1: 자기소개를 해주세요.
A1:


Q2:
A2:


Q3:
A3:


Q4: 마지막으로 하고 싶은 말이 있다면?
A4:

`
  },
  {
    id: 'compare',
    name: '비교하는 글',
    emoji: '⚖️',
    description: '두 가지를 비교하는 글',
    template: `비교 대상: _____ vs _____

[공통점]
1.
2.
3.

[차이점]
1.
2.
3.

[나의 선택/결론]

`
  }
];
