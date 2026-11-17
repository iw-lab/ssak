// 싹 — 학생 글을 국외 AI(Anthropic, 미국)로 보내기 전에 개인정보를 «ㅇㅇㅇ»로 가린다(2026-11-17 사용자
//   «이름이나 주소를 가리고 보내거나 빼고. 그 부분은 ㅇㅇㅇ로 표시하고 국외첨삭을 받는 방식으로»).
//   서버(functions/index.js)가 AI 호출 직전에 반드시 이 함수를 거치고, 화면(제출 전 미리보기)도 같은 파일을 쓴다 — 두 벌로 갈리지 않게.
//   원칙: 놓치는 것(이름이 그대로 나감)이 지나치게 가리는 것(흔한 낱말이 ㅇㅇㅇ)보다 훨씬 나쁘다. 그래도 흔한 낱말은 막는다(첨삭이 망가지니까).
//   못 잡은 낱말은 학생이 미리보기에서 눌러 가린다(extraWords) — 그 목록도 이 함수가 처리한다.
export const MASK = "ㅇㅇㅇ";

const H = "[가-힣]";
// 조사·어미(이름 바로 뒤에 붙는 것) — 긴 것부터
const PARTICLES = ["이에게", "이한테", "이랑은", "이하고", "이까지", "이처럼", "이보다", "이네", "이가", "이는", "이를", "이랑", "이와", "이도", "이의", "이만", "이야", "이라", "에게", "한테", "하고", "까지", "처럼", "보다", "께서", "이", "가", "은", "는", "을", "를", "랑", "와", "과", "의", "도", "만", "야", "아", "네", "님", "씨"];
const PART = `(?:${PARTICLES.join("|")})`;
const END = `(?=$|[\\s.,!?~…"'”’)\\]:;]|${PART}(?=$|[\\s.,!?~…"'”’)\\]:;]))`;

// 흔한 성씨(충돌 적은 것과 많은 것을 함께 — 많은 것은 아래 이름 글자·금지어가 거른다)
const SURNAMES = "김이박최정강조윤장임한오서신권황안송류유전홍고문양손배백허남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경";
// 이름에 흔한 글자 — 3글자 이름은 뒤 두 글자가 모두 여기 있어야 이름으로 본다
const GIVEN = new Set([..."가강건결겸경계관광교규균근금길나남담대덕도동두라란람래량려련령례로록룡루류률륜리린림명모목무문미민범별병보복봉빈빛산상새서석선설섭성세소솔송수숙순슬승시식신실심아안애양언엄여연열염영예오옥온완요용우욱운웅원월위유윤율은을음의익인일임자장재전정제조종주준중지진찬창채천철청초춘충치태택하학한해행향혁현형혜호홍화환활황효후훈휘희"]);
// 성씨+이름글자 두 개로 우연히 맞는 흔한 낱말(오탐 금지어). 실측 코퍼스(test-pii.mjs)로 늘린다
const STOP = new Set(("강아지 기대치 기대감 기대가 대기실 대기열 고양이 우주선 도서관 선생님 유치원 어린이 장난감 주인공 하지만 이야기 신나는 신기한 소중한 성공한 정성껏 진짜로 지난주 이번주 다음주 " +
  "주말에 오늘은 오후에 오전에 어제는 내일은 저녁에 아침에 점심에 친구들 우리들 동생들 형제들 가족들 사람들 아이들 선수들 학생들 " +
  "한가운 한라산 백두산 남대문 동대문 경복궁 부모님 할머니 할아버지 외할머 이모부 고모부 삼촌은 " +
  "조용히 천천히 열심히 정말로 진심으로 무엇을 무엇이 언제나 어디서 신호등 소방서 경찰서 우체국 은행원 운동장 강당은 " +
  "정리를 정리한 정답을 문제를 문제가 박수를 박물관 수영장 놀이터 미술관 과학관 김치를 김치가 김밥을 김밥이 한복을 송편을 " +
  "윤동주 세종대 이순신 유관순 안중근 장영실 정약용 김구는 신사임 단군왕 주몽은 " +
  "우리반 우리나 차례로 차례를 연주를 연습을 위해서 위험한 명절에 금요일 토요일 일요일 월요일 화요일 수요일 목요일").split(/\s+/).filter(Boolean));
// 역사 인물·작가 등 공인 — 학생 개인정보가 아니고, 가리면 독후감·위인전 첨삭이 망가진다
const PUBLIC_FIGURES = new Set(("이순신 세종대왕 세종 유관순 안중근 김구 윤봉길 장영실 정약용 신사임당 이황 이이 방정환 윤동주 김소월 " +
  "을지문덕 강감찬 광개토대왕 김유신 계백 주몽 온조 박혁거세 허준 김정호 홍길동 심청 흥부 놀부 콩쥐 팥쥐 이몽룡 성춘향 " +
  "손흥민 김연아 박지성 류현진 이강인 김연경 반기문").split(/\s+/));
// 이름 글자 두 개로 된 흔한 낱말 — «수학이랑»·«우리가» 같은 것을 이름으로 보지 않게
const COMMON2 = new Set(("수학 영어 과학 음악 미술 체육 사회 도덕 우리 하루 소리 나라 지구 학교 교실 선물 서로 하나 모두 오후 오전 영화 사랑 운동 연습 숙제 문제 선수 시작 시험 " +
  "자리 시장 경기 경주 여행 여름 가을 정원 주인 주말 수영 수업 성공 성적 세상 세계 소원 소설 시계 시소 신문 신호 실수 안경 연필 연주 열매 영상 예술 요리 우산 우주 우승 원래 " +
  "유리 은행 음식 응원 인형 일기 자연 장미 장난 재미 전화 정리 정말 제일 조금 종이 준비 중간 지금 지도 진주 진심 찬성 창문 채소 천사 청소 초대 초록 태풍 하늘 학원 한글 한국 " +
  "해님 행복 현장 형제 호랑 화가 화분 환경 효도 휴일 희망 가방 가수 가지 강물 건강 결과 결혼 경찰 계단 계절 관심 광고 교장 규칙 금방 나비 남자 동물 동시 동화 두부 라면 로봇 " +
  "명절 모양 모자 문화 미래 민족 보물 보석 복도 봉사 산책 상자 상처 새해 서랍 석유 선배 설명 성격 세수 소식 송편 수건 수박 순서 승리 시민 식물 신발 실험 심장 안전 양말 여자 " +
  "연휴 열심 영웅 예절 오이 온도 완성 용기 우유 운명 위험 은혜 음료 의사 인사 자석 장갑 재료 전기 정답 제주 조용 종류 주사 주소 중요 지하 천둥 철도 청년 초등 충전 치마 태양 " +
  "택시 학년 한복 해변 행운 향기 현재 형님 호수 화장 환자 활동 황금 효과 후배 훈련 희생 시간 이유 도서 동생 가족 하지 오늘 내일 어제 반장 회장 수요 주변 동네 공부 소풍 " +
  "숙소 우리 가게 가위 강당 경험 계획 고민 과자 교과 기차 나무 노력 도움 마을 마음 무늬 미소 반지 발표 방학 보리 부모 사과 사진 상장 생일 선생 성당 세종 소나 소년 소녀 수첩 " +
  "숲속 시골 신기 아이 어린 여름 연극 영양 오리 우정 위로 유행 의자 이야 인기 자유 장소 전학 정성 조심 주제 지혜 진로 창작 축제 친척 칭찬 태도 토끼 평화 피아 학생 한번 해결 혼자 화요 효자").split(/\s+/));
const ROLE_WORDS = "친구|짝꿍|짝|단짝|베프|절친|동생|남동생|여동생|형|오빠|언니|누나|사촌|사촌동생|반장|부반장|회장|부회장|선배|후배|막내|첫째|둘째|조카";
// 역할 낱말 뒤에 와도 이름이 아닌 것
const NOT_NAME_AFTER_ROLE = new Set("같이 함께 모두 둘이 셋이 넷이 집에 집을 집에서 생일 생일에 생일을 들과 들이 들은 들도 들을 들의 들한테 들에게 하고 랑 와 이랑 에게 한테 덕분에 때문에 사이 사이에 사이가 얼굴 마음 말을 말이 말에 손을 방에 방을 방이 이름 이름은 이름이 학교 학교에 반에 반은 반이 한명 한 명 두명 두 명 모두가 모두와 없이 처럼 보다 만큼 거 것 꺼".split(/\s+/));
const TITLE_SUFFIX = "선생님|선생|쌤|샘|교수님|원장님|코치님|감독님|사장님|씨|님";
const NOT_NAME_BEFORE_TITLE = new Set(("선생 교장선생 교감선생 사모 담임 우리 우리반 저희 체육 음악 영어 과학 미술 보건 교장 교감 영양 상담 원어민 방과후 태권도 피아노 학원 수학 국어 사회 도덕 실과 코딩 " +
  "담당 옆반 다른 새 새로운 친절한 무서운 좋은 착한 멋진 예쁜 젊은 여자 남자 할머니 할아버지 그 이 저 한 두 모든 우리학교 학교 유치원 어린이집 " +
  "수영 축구 농구 줄넘기 바이올린 미술학원 영어학원 수학학원 독서 논술 컴퓨터 과학실 도서관 사서 특수 돌봄 반 전담 교과 기간제 강사").split(/\s+/));
const SCHOOL_GENERIC = new Set("우리 다른 새 옆 그 이 저 같은 큰 작은 시골 근처 동네 형 누나 언니 오빠 동생 친구 언니네 형네 예전 지금 원래 첫 마지막 여러 모든 어느 무슨 이웃 사립 공립 국립 한 두 세".split(/\s+/));
const NUM = "(?:\\d+|[일이삼사오육칠팔구십백천]+)";

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

/**
 * @param {string} text 학생 글
 * @param {{extraWords?: string[]}} [opts] 학생이 미리보기에서 더 가린 낱말
 * @returns {{text: string, hits: {kind: string, value: string}[], names: string[]}}
 */
export function maskPII(text, opts = {}) {
  if (typeof text !== "string" || !text) return { text: "", hits: [], names: [] };
  let t = text;
  const hits = [];
  const names = new Set();
  const places = new Set(); // 한 번 가린 동네는 글 전체에서(«효자동에 살아… 효자동 공원»)
  const all0 = new Set();
  const sub = (re, kind, fn) => {
    t = t.replace(re, (...m) => {
      const r = fn(...m);
      if (r !== m[0]) hits.push({ kind, value: m[0] });
      return r;
    });
  };

  // 1) 이메일·전화·주민번호(숫자 정보는 이름보다 먼저 — 아래 규칙이 숫자를 건드리지 않게)
  sub(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "email", () => MASK);
  sub(/(?<!\d)\d{6}\s?-?\s?[1-4]\d{6}(?!\d)/g, "rrn", () => MASK);
  sub(/(?:\+\s?82[-.\s]?)\(?0?1[016789]\)?[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g, "phone", () => MASK); // +82 10-…
  sub(/(?<!\d)\(?(?:0\d{1,2}|1[5-9]\d{2})\)?[-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g, "phone", () => MASK); // (010)1234-5678
  sub(/(?<!\d)01[016789]\d{7,8}(?!\d)/g, "phone", () => MASK);

  // 2) 주소 — 도로명·지번·아파트 동호수·시도+시군구 사슬
  // 도로명: «행복로 123», «세종대로 12번길 3» — «처음으로 1등»·«구체적으로 1.» 같은 말은 빼려고 «으로»로 끝나는 말·뒤에 단위가 붙는 수는 제외
  sub(new RegExp(`(${H}{1,10})(대로|로|길)\\s?(\\d+)(번길)?((?:\\s?\\d+(?:-\\d+)?)?)(번지)?(?![\\d.]?\\d|\\s?(?:등|번째|번|시|분|초|개|명|살|학년|반|월|일|층|회|권|장|점|원|등급|위|km|m|cm|%|\\.|\\)))`, "g"), "address",
    (m, a, r, d, bg = "") => (/(으|에|에게|부터|까지|처음|마지막|정말|차례|순서|번갈아)$/.test(a) || (r === "로" && /[으]$/.test(a)) || (!bg && d.length < 2) ? m : MASK));
  sub(new RegExp(`${H}{1,6}(?:동|읍|면|리)\\s?\\d+(?:-\\d+)?\\s?번지`, "g"), "address", () => MASK);
  sub(new RegExp(`${H}{1,6}(?:동|읍|면|리)\\s?\\d+-\\d+`, "g"), "address", () => MASK); // «역삼동 123-45»

  sub(new RegExp(`(?:${H}|[A-Za-z0-9]){2,12}\\s?(?:아파트|빌라|맨션|오피스텔|하이츠|캐슬|타운)\\s?${NUM}\\s?동(?:\\s?${NUM}\\s?호)?`, "g"), "address", () => MASK);
  sub(new RegExp(`(?<![가-힣\\d])${NUM}\\s?동\\s?${NUM}\\s?호`, "g"), "address", () => MASK);
  sub(new RegExp(`(?<![가-힣\\d])\\d{3,4}\\s?동(?=에|에서|이야|이다|이에요|입니다|으로|\\s|$|[.,!?])`, "g"), "address", () => MASK); // «101동에 산다»
  sub(new RegExp(`(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청북도|충청남도|전라북도|전라남도|경상북도|경상남도|제주도|경기도|강원도)(?:특별시|광역시|특별자치시|특별자치도|시|도)?\\s+${H}{1,5}(?:시|군|구)(?:\\s+${H}{1,5}(?:구|읍|면|동|리))*`, "g"), "address", () => MASK);
  // 아파트·빌라 이름(«OO아파트에 산다») — 우리·옆 같은 흔한 앞말은 남긴다
  sub(new RegExp(`((?:${H}|[A-Za-z0-9]){2,10})(아파트|빌라|맨션|오피스텔)`, "g"), "address", (m, a, b) => (SCHOOL_GENERIC.has(a) ? m : MASK + b));
  // «OO동에 산다/살아»
  sub(new RegExp(`(${H}{1,4})(동|읍|면|리)(에서|에|으로|로)?(\\s?)(?=(?:살|사는|산다|살아|살고|이사))`, "g"), "address", (m, a, b, c = "", sp = "") => (SCHOOL_GENERIC.has(a) ? m : MASK + (c || "") + sp));

  // 동네 이름 «덕진동에 있는», «전주 삼천동», «중화산동이다» — 흔한 «-동» 낱말(운동·활동·감동…)은 남긴다
  const DONG_STOP = new Set("운 행 활 자 아 이 감 공 출 노 충 작 변 가 진 율 난 소 폭 협 선 반 연 발 구 미 파 거 기 경 부 대 원 촌 아파트 형 남 북 서 한 겨울 초 동 어린이 다음 첫 몇 몇몇 각 같은 우리 옆".split(" "));
  const STRONG_PLACE = "에\\s?있|에\\s?살|에\\s?사|에서\\s?살|에서\\s?왔|으로\\s?이사|로\\s?이사|이다|이야|이에요|입니다";
  sub(new RegExp(`(^|[^가-힣])(${H}{1,4})(구\\s+)?(${H}{1,4})?(동|읍|면)(?=(?:${STRONG_PLACE}|에\\s|에서\\s|의\\s|\\s공원|\\s도서관|\\s시장|$|[.,!?]))`, "g"), "address",
    (m, pre, a, gu, b, d, off, all) => {
      const head = (b || a);
      if (!gu && DONG_STOP.has(head)) return m;
      // 면·읍은 흔한 낱말(장면·화면·라면…)이 많다 — «에 있는/살아/이다»처럼 사는 곳이 확실할 때만
      if (d !== "동" && !gu && head.length < 2) return m; // «라면이다»·«화면이다»
      if (d !== "동" && !gu && !new RegExp(`^(?:${STRONG_PLACE})`).test(all.slice(off + m.length))) return m;
      places.add(head + d);
      return `${pre}${MASK}`;
    });
  // 3) 학교·유치원 이름 — «OO초등학교», «OO초(에서)»
  sub(new RegExp(`((?:${H}|\\d){1,12})(\\s?)(초등학교|중학교|고등학교|초교|유치원|어린이집|학원|지역아동센터)`, "g"), "school", (m, a, sp, b) => (SCHOOL_GENERIC.has(a) || a.length < 2 && b === "학원" ? m : MASK + sp + b));
  const CHO_STOP = new Set("기 최 당 연 월 잡 약 화 수 해 감 산 식 몇 일 이 삼 사 오 십 녹 시".split(" "));
  sub(new RegExp(`(^|[\\s"'(])(${H}{2,5})초(?=(?:에서|에|의|는|가|를|로|\\s?\\d학년|$|[\\s.,!?]))`, "g"), "school", (m, pre, a) => (SCHOOL_GENERIC.has(a) || CHO_STOP.has(a.slice(-1)) ? m : `${pre}${MASK}초`));

  // 4) 이름 — 문맥이 확실한 것부터
  const markName = (n, force = false) => { if (n && n.length >= 2 && (force || !PUBLIC_FIGURES.has(n))) names.add(n); };
  // «이름은 김민재», «내 이름은 민재»
  sub(new RegExp(`(이름은|이름이|이름을|성함은|별명은|별명이)(\\s*["'“‘]?\\s*)(${H}{2,3}?)(?=입니다|이에요|예요|이야|야|이고|이라고|라고|이에|에요|이|가|는|$|[^가-힣])`, "g"), "name",
    (m, a, sp, n, off, all) => (/(강아지|고양이|햄스터|토끼|물고기|거북이|앵무새|인형|별명|팀|책|영화|노래|게임|캐릭터|로봇|반려견|반려묘)\s*$/.test(all.slice(Math.max(0, off - 8), off)) || /^(무엇|뭐|뭘|모르|비밀|없|알|지어|바꾸|부르|짓|정말|너무|참|아주|특이|예쁘|멋|좋|이상|길|짧|어려|쉬|김치)/.test(n) ? m : (markName(n, true), `${a}${sp}${MASK}`)));
  // «저는/나는 김민재입니다»
  sub(new RegExp(`(저는|나는|난|전|제가|내가)(\\s+)(${H}{2,4})(입니다|이에요|예요|이야|야|이고|라고|이라고)`, "g"), "name",
    (m, a, sp, n, e) => (/^(학생|초등|어린|친구|사람|아이|막내|첫째|둘째|형|누나|언니|오빠|동생|반장|회장|남자|여자|\d)/.test(n) || n.length < 2 ? m : (markName(n, true), `${a}${sp}${MASK}${e}`)));
  // «친구 민수가», «동생 지우랑»
  sub(new RegExp(`(^|[^가-힣])(${ROLE_WORDS})(\\s+)(${H}{2,3})(${PART})?(?=$|[\\s.,!?~…"'”’)])`, "g"), "name",
    (m, pre, role, sp, n, p = "") => {
      if (n.length === 3 && n.endsWith("이")) { p = "이" + (p || ""); n = n.slice(0, 2); } // «하윤이랑»
      const whole = n + (p || "");
      if (NOT_NAME_AFTER_ROLE.has(n) || NOT_NAME_AFTER_ROLE.has(whole) || /^(들|이랑|하고|와|과|에게|한테|이|가|은|는)/.test(n)) return m;
      const okChars = [...n].every((c, i) => GIVEN.has(c) || (i === 0 && n.length === 3 && SURNAMES.includes(c)));
      if (!okChars || COMMON2.has(n)) return m; // «회장 선거에»·«친구 사이»
      markName(n); return `${pre}${role}${sp}${MASK}${p || ""}`;
    });
  // «김민재 선생님», «박쌤», «민수 씨»
  sub(new RegExp(`(^|[^가-힣])(${H}{1,3})(\\s?)(${TITLE_SUFFIX})(?=$|[^가-힣]|${PART}|께|께서)`, "g"), "name",
    (m, pre, n, sp, title) => {
      if (NOT_NAME_BEFORE_TITLE.has(n)) return m;
      if (n.length === 1 && !SURNAMES.includes(n)) return m; // «박쌤»처럼 성만 있는 경우만
      if (n.length >= 2 && /[은는을를에의도가이]$/.test(n) && !(n.length === 3 && GIVEN.has(n[1]) && GIVEN.has(n[2]) && SURNAMES.includes(n[0]))) return m; // «오늘은 선생님»
      if (n.length === 2 && !(SURNAMES.includes(n[0]) && GIVEN.has(n[1])) && !(GIVEN.has(n[0]) && GIVEN.has(n[1]))) return m;
      if (n.length === 3 && !(SURNAMES.includes(n[0]) && GIVEN.has(n[1]) && GIVEN.has(n[2]))) return m;
      if ((title === "님" || title === "씨") && n.length < 2) return m;
      if ((title === "님" || title === "씨") && !SURNAMES.includes(n[0])) return m; // «하느님»·«부처님»·«아저씨» 같은 낱말
      if (/^(아저|아가|부처|하느|하나|선녀|임금|원님|사또|도령|아줌|아주머|아기)/.test(n)) return m;
      markName(n.length >= 2 ? n : ""); return `${pre}${MASK}${sp}${title}`;
    });
  // 성+이름 3글자(뒤 두 글자가 이름 글자) + 조사/끝
  sub(new RegExp(`(^|[^가-힣])([${SURNAMES}])(${H})(${H})(입니다|이에요|예요|이예요|이라고|라고|이고|이었|였|이었어요|${PART})?(?=$|[^가-힣])`, "g"), "name",
    (m, pre, s, g1, g2, p = "", off, all) => {
      if (!p && /^\s*(올림|드림|씀|가|이가)(?=$|[^가-힣])/.test(all.slice(off + m.length))) p = ""; // «최서준 올림»
      const signed = !p && /^\s*(올림|드림|씀)/.test(all.slice(off + m.length));
      const n = s + g1 + g2;
      // «…입니다/예요»는 자기소개 문맥일 때만 이름으로 본다(«기행문입니다» 같은 낱말 방지)
      if (/^(입니다|이에요|예요|이예요|이라고|라고|이고|이었|였|이었어요)$/.test(p || "") && !/(저는|나는|난|전|제가|내가|학년|반|이름은|이름이|이름|친구는|친구가|동생은|동생이)\s*$/.test(all.slice(Math.max(0, off - 14), off + pre.length)) &&
        !/(^|[\s,])(저는|나는|난|전|제가|내가)\s/.test(all.slice(0, off).split(/[.!?\n]/).pop())) return m;
      if (PUBLIC_FIGURES.has(n) || STOP.has(n) || STOP.has(n + (p || "").slice(0, 1))) return m;
      if (!GIVEN.has(g1) || !GIVEN.has(g2)) return m;
      const alone = !p && /^\s*(?:[,，、/\n(]|$)/.test(all.slice(off + m.length)); // «김민재\n…», «김민재, 박서준»
      if (!p && !signed && !alone && !names.has(n)) return m; // 조사 없이 홀로 선 3글자는 문장 경계일 때만(오탐 방지)
      markName(n); return `${pre}${MASK}${p || ""}`;
    });
  // 부르는 말 «민재야!», «지우야,» — 2글자 이름 글자 + 야/아 + 문장부호
  sub(new RegExp(`(^|[^가-힣])(${H}{2})(야|아)(?=[!,.~?…]|\\s*$)`, "g"), "name",
    (m, pre, n) => {
      if (![...n].every((c) => GIVEN.has(c))) return m;
      if (/^(그래|정말|진짜|아니|어서|빨리|좋아|싫어|안녕|여기|저기|거기|조심|미안|고마|어떡|세상|하나|우리|이제|아이|도와|아빠|엄마|할매|형님)$/.test(n)) return m;
      markName(n); return `${pre}${MASK}`;
    });

  // 성 없이 이름만(«민지랑 싸웠다… 민지가 사과했다») — 두 번 이상, 그중 한 번은 사람에게만 붙는 말(랑·한테·에게·하고·이가·이는…)일 때
  {
    const cnt = new Map(); const strong = new Set();
    const re = new RegExp(`(?:^|[^가-힣])(${H}{2})(이랑|이한테|이에게|이하고|이가|이는|이도|이를|랑|한테|에게|하고|가|는|도|와|의|를)(?=$|[^가-힣])`, "g");
    for (const m of t.matchAll(re)) {
      const n = m[1];
      if (!GIVEN.has(n[0]) || !GIVEN.has(n[1]) || COMMON2.has(n) || PUBLIC_FIGURES.has(n)) continue;
      cnt.set(n, (cnt.get(n) || 0) + 1);
      if (/^(이랑|이한테|이에게|이하고|이가|이는|이도|랑|한테|에게|하고)$/.test(m[2])) strong.add(n);
    }
    for (const [n, c] of cnt) if (c >= 2 && strong.has(n)) markName(n);
  }
  for (const pl of places) { all0.add(pl); }
  if (all0.size) sub(new RegExp([...all0].sort((a, b) => b.length - a.length).map(esc).join("|"), "g"), "address", () => MASK);
  // 5) 찾은 이름은 글 전체에서 — 성을 뗀 이름(«김민재» → «민재»)까지
  const all = new Set();
  for (const n of names) {
    all.add(n);
    if (n.length === 3 && SURNAMES.includes(n[0])) all.add(n.slice(1));
  }
  const nameList = [...all].filter((x) => x && x !== MASK).sort((a, b) => b.length - a.length);
  if (nameList.length) {
    // 이름 뒤가 조사·끝일 때만(«지우» 이름 때문에 «지우개»가 가려지지 않게) — 동네 이름은 places 로 따로
    const re = new RegExp(`(${nameList.map(esc).join("|")})(?=$|[^가-힣]|${PART}|이(?:가|는|랑|를|도|의|한테|에게|하고)?(?![가-힣]))`, "g");
    sub(re, "name", () => MASK);
  }
  // 학생이 미리보기에서 고른 낱말은 경계 없이 전부(학생이 고른 것이 우선) — 길이·개수 상한(정규식 폭주 방지)
  const extra = [...new Set((Array.isArray(opts.extraWords) ? opts.extraWords : []).slice(0, 40)
    .map((w) => String(w == null ? "" : w).trim().slice(0, 20)).filter((x) => x.length >= 1 && x !== MASK && !x.includes(MASK)))]
    .sort((a, b) => b.length - a.length);
  if (extra.length) sub(new RegExp(extra.map(esc).join("|"), "g"), "extra", () => MASK);
  // ㅇㅇㅇ가 붙어 반복되면 하나로
  t = t.replace(/(?:ㅇㅇㅇ){2,}/g, MASK);
  return { text: t, hits, names: [...names] };
}
