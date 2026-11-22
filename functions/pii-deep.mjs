// 싹 — 가림 2층(서버 전용). pii.mjs(규칙)는 «이름처럼 생긴 것»을 찾아 가린다 — 처음 보는 꼴은 샌다(블라인드 9번 묶음 55%).
//   이 층은 거꾸로 간다: 형태소 분석기(Kiwi)가 «아는 보통 낱말»로 풀지 못한 것 — 고유명사·사전에 없는 낱말·한 글자로 쪼개진 낱말 —
//   은 기본으로 가리고, 흔한 낱말과 같은 이름은 사람에게만 붙는 조사·호칭·부르는 말로 잡는다(2026-11-22 사용자 «100% 수준으로 올려»).
//   분석기 모델이 약 110MB·메모리 1GB 라 브라우저에서는 못 돈다 — 미리보기도 서버(maskPreview)가 가린 글을 받아 보여 준다.
//   분석기를 못 올리면 가린 척하지 않고 던진다(fail closed) — 덜 가린 글이 국외로 나가는 것보다 첨삭이 멈추는 쪽이 낫다.
import { maskPII, MASK, looksLikeName } from "./pii.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const MODEL_DIR = new URL("./kiwi-model/", import.meta.url);
let _kiwi = null;
export function loadKiwi() {
  if (!_kiwi) {
    _kiwi = (async () => {
      const { KiwiBuilder } = await import("kiwi-nlp");
      const builder = await KiwiBuilder.create(require.resolve("kiwi-nlp/dist/kiwi-wasm.wasm"));
      const modelFiles = {};
      for (const f of readdirSync(MODEL_DIR)) if (!f.startsWith(".")) modelFiles[f] = new Uint8Array(readFileSync(new URL(f, MODEL_DIR)));
      if (!modelFiles["sj.morph"]) throw new Error("가림 분석기 모델이 없다(functions/kiwi-model) — node scripts/fetch-kiwi-model.mjs");
      return builder.build({ modelFiles });
    })();
    _kiwi.catch(() => { _kiwi = null; });
  }
  return _kiwi;
}
const W = (s) => new Set(s.split(/\s+/).filter(Boolean));
export const SAFE_NNP = W(`화성 목성 수성 금성 토성 천왕성 해왕성 명왕성 소행성 티라노사우루스 트리케라톱스 벨로시랩터 브라키오사우루스 스테고사우루스 프테라노돈 디즈니랜드 롯데월드 에버랜드 도쿄타워 타임스퀘어 에펠탑 캔버라 워싱턴 런던 파리 베이징 도쿄 드라큘라 과학관 기념품점 공굴리기 이어달리기 줄다리기 사막여우 북유럽 어린왕자 한국 대한민국 우리나라 북한 미국 중국 일본 영국 프랑스 독일 러시아 캐나다 호주 인도 베트남 필리핀 태국 몽골 이탈리아 스페인 브라질 멕시코 이집트 터키 튀르키예 스위스 네덜란드 그리스 우즈베키스탄 인도네시아 말레이시아 싱가포르 대만 홍콩 아프리카 아시아 유럽 아메리카 남극 북극 동남아
서울 부산 대구 인천 광주 대전 울산 세종 경기도 강원도 충청도 전라도 경상도 제주도 제주 독도 한강 백두산 한라산 지리산 설악산 동해 서해 남해 태평양 대서양
지구 화성 금성 목성 토성 수성 천왕성 해왕성 태양 달 은하수
설날 추석 한가위 크리스마스 성탄절 어린이날 어버이날 스승의날 한글날 광복절 삼일절 현충일 개천절 할로윈 핼러윈 단오 정월대보름
한글 한국어 영어 국어 수학 과학 사회 도덕 실과 체육 음악 미술 한자 일본어 중국어
유튜브 구글 네이버 카카오 카카오톡 카톡 인스타그램 인스타 틱톡 넷플릭스 삼성 애플 아이폰 갤럭시 아이패드 닌텐도 레고 마인크래프트 로블록스 포켓몬 피카츄 뽀로로 핑크퐁 아기상어 디즈니 겨울왕국 엘사 해리포터 스파이더맨 아이언맨 어벤져스 짱구 도라에몽 코난 브롤스타즈 포트나이트 쿠키런 올림픽 월드컵 맥도날드 롯데월드 에버랜드 이마트 다이소 편의점
이순신 세종대왕 세종 유관순 안중근 김구 윤봉길 장영실 정약용 신사임당 이황 이이 방정환 윤동주 김소월 을지문덕 강감찬 광개토대왕 김유신 계백 주몽 온조 박혁거세 허준 김정호 홍길동 심청 흥부 놀부 콩쥐 팥쥐 이몽룡 성춘향 손흥민 김연아 박지성 류현진 이강인 김연경 반기문 단군 에디슨 아인슈타인 헬렌 켈러 링컨 간디 나이팅게일 퀴리 파브르 베토벤 모차르트 피카소 고흐 다빈치 뉴턴 갈릴레이 콜럼버스 나폴레옹 신데렐라 백설공주 피노키오 피터팬 앨리스 어린왕자 생텍쥐페리 안데르센 이솝 그림 조선 고려 신라 백제 고구려 가야 발해 임진왜란 훈민정음 거북선 첨성대 불국사 석굴암 경복궁 창덕궁 남대문 동대문 숭례문 광화문 남산 청와대 국회 하느님 하나님 예수 예수님 부처 부처님 산타 산타클로스 루돌프
월요일 화요일 수요일 목요일 금요일 토요일 일요일
골든리트리버 단군왕검 몬스터 윷놀이 한옥마을
액션가면 의적 여의봉 근두운 전라북도 전라남도 경상북도 경상남도 충청북도 충청남도 강원특별자치도 전북특별자치도 제주특별자치도 서울특별시 부산광역시 대구광역시 인천광역시 광주광역시 대전광역시 울산광역시 세종특별자치시 전북 전남 경북 경남 충북 충남 강원 경기 롯데월드타워 남산타워 서울타워 해피밀 현대자동차 기아자동차 삼성전자 엘지전자 올림픽공원 어린이대공원 서울숲 한강공원 월드컵공원 국립공원 호그와트
측우기 집현전 자격루 앙부일구 혼천의 한산도 명량 노량 행주 살수 귀주 광개토 만주 요동 폼페이 빅벤 돈키호테 쇼트트랙 품새 유칼립투스 리자몽 트리케라톱스 스테고사우루스 브라키오사우루스 벨로키랍토르 프테라노돈 빨주노초파남보 패티 도우 르네상스 메소포타미아 인더스 황하 잉카 마야 아즈텍 바이킹 스파르타 아테네 트로이 올림포스 태권브이 뽀빠이 스누피 헬로키티 쿠로미 산리오 시나모롤 포차코 마이멜로디 춘식이 라이언 어피치 무지 콘 네오 프로도 제이지 튜브
피구 축구 야구 농구 배구 탁구 족구 발야구 티볼 배드민턴 테니스 골프 태권도 유도 검도 합기도 복싱 스키 스케이트 햄스터 푸들 말티즈 치와와 진돗개 시바견 리트리버 포메라니안 비숑 고슴도치 앵무새 판다 코알라 캥거루 펭귄 티라노사우루스 공룡
에펠탑 피라미드 만리장성 자유의 여신상 콜로세움 타지마할 파리 런던 뉴욕 도쿄 베이징 로마 하와이 괌 워싱턴 베를린 모스크바 방콕 하노이 오사카 상하이 시드니 나일강 아마존 히말라야 에베레스트 사하라 알프스
피타고라스 제우스 헤라 포세이돈 아테나 아폴론 하데스 헤라클레스 오디세우스 헤르미온느 해리 포터 해리포터 론 덤블도어 볼드모트 호그와트 찰리 웡카 잎싹 초록머리 걸리버 톰 소여 허클베리 로빈슨 크루소 셜록 홈즈 왓슨 앤 도로시 오즈 알라딘 신밧드 라푼젤 인어공주 모아나 엘사 안나 올라프 심바 니모 도리 우디 버즈 미키 미니마우스 도널드 푸 피글렛 토토로 포뇨 짱아 흰둥이 철수 훈이 맹구 유리 노진구 퉁퉁이 비실이 이슬이 루피 조로 나루토 손오공 베지터 지우 웅이 이브이 파이리 꼬부기 이상해씨 잠만보 뮤츠 카카시 탄지로 네즈코 마리오 루이지 소닉 커비 링크 젤다 스티브 크리퍼 토트넘 맨유 맨시티 리버풀 바르셀로나 레알 마드리드 메시 호날두 음바페 오타니 김하성 이정후 안세영 신유빈 황희찬 김민재 방탄소년단 블랙핑크 뉴진스 아이브 아이유 유재석 백종원 흔한남매 도티 잠뜰
세종대왕 장보고 왕건 이성계 정몽주 최무선 김홍도 신윤복 정조 영조 태조 태종 선덕여왕 원효 의상 최치원 문익점 황희 이율곡 율곡 퇴계 권율 곽재우 논개 김만덕 김좌진 홍범도 안창호 유일한 전태일 이중섭 박수근 백남준 이태석 장기려 주시경 지석영 우장춘 석주명 방정환 소파 헬렌켈러 설리번 슈바이처 마더 테레사 테레사 만델라 처칠 루스벨트 워싱턴 다윈 파스칼 아르키메데스 소크라테스 플라톤 아리스토텔레스 공자 맹자 노자 석가모니 셰익스피어 톨스토이 괴테 안네 프랑크 라이트 형제 벨 노벨 마리 퀴리 장 앙리 파브르 시턴 스티브 잡스 빌 게이츠 일론 머스크 암스트롱 가가린 마젤란 징기스칸 칭기즈칸 진시황 클레오파트라 알렉산더 카이사르 잔다르크 엘리자베스 빅토리아
흥부와 놀부 개미와 베짱이 토끼와 거북이 해와 달이 된 오누이 선녀와 나무꾼 금도끼 은도끼 별주부전 심청전 춘향전 홍길동전 콩쥐팥쥐 견우 직녀 단군신화 어린 왕자 마당을 나온 암탉 강아지똥 몽실 언니 샬롯의 거미줄 윌버 샬롯 아낌없이 주는 나무 플랜더스의 개 네로 파트라슈 하이디 빨간 머리 앤 톰 소여의 모험 15소년 표류기 오즈의 마법사 이상한 나라의 앨리스 나니아 연대기 반지의 제왕 찰리와 초콜릿 공장 푸른 사자 와니니 와니니 수상한 책 먹는 여우 만복이네 떡집 만복 장군이 한밤중 달빛 식당 전천당 베니코 고양이 해결사 깜냥 깜냥 엉덩이 탐정 추리 천재 설민석 그리스 로마 신화 삼국지 유비 관우 장비 조조 제갈량 서유기 저팔계 사오정 삼장법사
베이킹소다 포스트잇 스카치테이프 호치키스 크레파스 사인펜 샤프 볼펜 컴퓨터 스마트폰 태블릿 노트북 인터넷 와이파이 블루투스 줌 챗지피티 엑셀 파워포인트 한컴 한글과컴퓨터 윈도우 안드로이드 크롬 사파리 스크래치 엔트리 코딩 로봇 드론 아두이노
코카콜라 펩시 스타벅스 버거킹 롯데리아 맘스터치 서브웨이 배스킨라빈스 던킨 파리바게뜨 뚜레쥬르 교촌 굽네 푸라닭 도미노 피자헛 김밥천국 신라면 불닭 새우깡 초코파이 빼빼로 바나나우유 요구르트 야쿠르트 나이키 아디다스 뉴발란스 현대 기아 엘지 쿠팡 배민 당근 올리브영 코스트코 홈플러스 롯데마트 하나로마트 교보문고 알라딘 예스24 씨지브이 메가박스 롯데시네마 키자니아 서울랜드 민속촌 경주월드 아쿠아리움 코엑스 잠실 명동 인사동 해운대 광안리 경포대 남이섬 한옥마을 첨성대 석가탑 다보탑 안압지 수원화성 덕수궁 종묘 국립중앙박물관 국립과천과학관 독립기념관 전쟁기념관 판문점 현충원
카네이션 무궁화 진달래 개나리 벚꽃 코스모스 해바라기 튤립 장미 민들레 단풍 은행나무 소나무 대나무 사과 배 감 귤 수박 참외 포도 딸기 바나나 파인애플 망고 키위 블루베리 토마토 감자 고구마 옥수수 호박 오이 당근 양파 마늘 배추 무 시금치 브로콜리 떡볶이 김밥 라면 짜장면 짬뽕 탕수육 돈가스 피자 치킨 햄버거 파스타 스파게티 카레 불고기 갈비 삼겹살 비빔밥 김치찌개 된장찌개 미역국 떡국 송편 잡채 순대 어묵 붕어빵 호떡 마카롱 아이스크림 초콜릿 사탕 젤리 케이크 쿠키 도넛 와플 팝콘 콜라 사이다 주스 우유`);
const COMMON1 = new Set([..."집반책물밥꽃눈손발말글길위밑앞뒤옆안밖속끝때날달해별산강불땅차배방문벽옷신돈힘꿈일것수줄번개명살등곳점색맛향빛소닭새곰쥐뱀양숲풀잎비봄떡빵국김콩팥쌀약병컵공칼형남여왕팀조편쪽층칸장권시분초년월주원저나너내네제우그이뭐왜꼭참좀더덜못안다또막딱쭉푹확척첫새헌옛온각전후중상하대소큰총면동읍군구도리로가키몸목팔코입귀이혀뼈피땀침숨잠꿀젖알씨싹뿔털똥배감밤귤무파쑥죽묵술차엿껌탑성절굴섬못샘늪들밭논뜰터골둑담창틀솥낫삽톱못끈실천솜붓먹종북징춤굿판놈년분님씨군양짝쌍벌켤짐통봉갑곽첩채대척량칸홉되말섬근돈푼치자길리평정보"]);
const SAFE_SL = W("tv pc ai ok no yes hi bye sns app cd dvd usb led wifi vs km cm mm kg ml cctv it vr ar bts kbs mbc sbs ebs youtube google the a i is am are you my love thank thanks sorry hello good best no1 top ufo sos qr pt ppt mvp ost cf pd dm");
const PERSON_OK = W("비밀 제자 손녀 손자 외손녀 외손자 최고 천재 바보 장난꾸러기 개구쟁이 말썽꾸러기 울보 겁쟁이 수다쟁이 먹보 잠꾸러기 멋쟁이 욕심쟁이 1등 일등 꼴찌 남자아이 여자아이 외동 외동딸 외동아들 쌍둥이 전학생 모범생 우등생 초등학생 중학생 고등학생 대학생 군인 회사원 요리사 운동선수 축구선수 유튜버 아이돌 이웃집 누구누구 엄마 아빠 어머니 아버지 부모님 부모 할머니 할아버지 외할머니 외할아버지 형 누나 언니 오빠 동생 남동생 여동생 형아 사촌 삼촌 이모 고모 숙모 외삼촌 큰아빠 큰엄마 작은아빠 작은엄마 조카 가족 식구 친구 친구들 짝 짝꿍 단짝 베프 절친 애 아이 아이들 애들 얘 쟤 걔 사람 사람들 어른 어른들 아저씨 아줌마 아주머니 선생님 선생 쌤 샘 담임 교장 교감 코치 관장 원장 감독 사장 의사 간호사 경찰 소방관 아기 애기 동물 강아지 고양이 개 새 토끼 햄스터 거북이 물고기 금붕어 병아리 닭 소 말 돼지 곰 인형 로봇 반 모둠 조 팀 우리 모두 누구 서로 남 여자 남자 여자애 남자애 형님 누님 언니들 형들 오빠들 누나들 동생들 선배 후배 반장 회장 주인공 손님 이웃 주인 아들 딸 남편 아내 신랑 신부 왕 임금 공주 왕자 하느님 하나님 부처님 예수님 산타 귀신 도깨비 괴물 요정 천사 악마 마녀 마법사 선수 가수 배우 작가 화가 기사 상대 상대방 자신 자기 본인 엄마아빠 고객 학생 학생들 어린이 유치원생 일학년 언니네 형네");
const KIN = W("형 언니 오빠 누나 쌤 샘 형아 삼촌 이모 고모 선생님 코치 관장 원장 목사 전도사 사범 누나야 언니야 오빠야 엄마 아빠 할머니 할아버지");
const KIN_PREFIX_OK = W("사촌 친 외 큰 작은 옆집 이웃 동네 담임 체육 음악 영어 과학 미술 수학 국어 사회 보건 영양 상담 원어민 방과후 태권도 피아노 학원 돌봄 교회 성당 친구 짝꿍 단짝 막내 첫째 둘째 셋째 군인 대학생 고등학생 중학생 유치원 어린이집 학교 수영 축구 야구 농구 코딩 바둑 발레 댄스 논술 독서 교생 실습 버스 택시 가게 마트 편의점 경비 급식 도서관 사서 의사 간호사 약사 미용실 치과 병원 외국인 친척 시골 서울 부산 제주 미국 중국 일본 베트남 필리핀");
const INST = W("소아과 의원 병원 약국 한의원 치과 안과 이비인후과 피부과 정형외과 내과 외과 문방구 문구 문구점 마트 슈퍼 슈퍼마켓 편의점 식당 분식 분식집 반점 치킨 피자 빵집 제과 제과점 베이커리 카페 미용실 헤어 이발소 학원 교습소 공부방 도장 체육관 태권도 합기도 검도 피아노 미술 음악 교회 성당 절 사 유치원 어린이집 건설 전자 물산 산업 상사 식품 제약 은행 증권 보험 화학 중공업 자동차 운수 택배 공업 기업 회사 공장 센터 아파트 빌라 맨션 타운 주택 마을 공원 놀이터 역 정류장 정거장 초 중 고 초등학교 중학교 고등학교 대학교 학교 사거리 삼거리 오거리 시장 상가 빌딩 타워 서점 문고 도서관 수영장 목욕탕 사우나 세탁소 정육점 꽃집 철물점 안경점 부동산 떡집 반찬 가게 상회 식육점 농장 목장 농원 수목원 펜션 호텔 모텔 캠핑장 키즈카페 피시방 노래방 볼링장 스튜디오 사진관 클리닉 동물병원 한방병원 요양원 복지관 주민센터 행정복지센터 경로당 회관 지구대 파출소 우체국 소방서 경찰서 시청 군청 구청 읍사무소 면사무소 터미널 휴게소 주유소 카센터 정비소 세차장 물류 유통 무역 통신 건축 설계 인테리어 디자인 출판 출판사 인쇄 신문 방송 엔터 게임즈 소프트 테크 시스템 솔루션 그룹 홀딩스 컴퍼니 랩 연구소 연구원 법률 세무 회계 노무 특허 치킨집 고깃집 횟집 국밥 칼국수 냉면 갈비 족발 보쌈 순대 김밥 떡볶이 돈가스 초밥 짜장 마라탕 탕후루 버거 커피 다방 제면소 국수 숯불 구이 한우 식육 수산 청과 과일 야채 쌀집 방앗간 태권도장 합기도장 검도장 수영 발레 댄스 논술 영어 수학 국어 과학 코딩 바둑 독서 한자 속셈 주산 컴퓨터 보습 종합 입시 어학원 영어학원 수학학원 미술학원 피아노학원 음악학원 태권도학원 논술학원 보습학원 독서실 스터디카페 지역아동센터 돌봄센터 초등 중등 고등 여중 여고 남중 남고 유치 병설 사립 초교");
const INST_GENERIC = W("마법 요리 운전 축구 야구 승마 군사 사관 예술 체육 과학 외국어 국제 대안 특수 기술 농업 공업 상업 간호 의과 법학 신학 사범 교육 올림픽 월드컵 국립 한강 서울 부산 제주 우리 동네 동물 종합 대형 어린이 소아 한방 전통 재래 지하철 버스 기차 고속버스 시외버스 놀이 수학 영어 국어 과학 논술 독서 코딩 바둑 발레 댄스 피아노 미술 음악 태권도 합기도 검도 수영 축구 야구 농구 줄넘기 컴퓨터 한자 주산 속셈 보습 입시 대학 초등 중 고등 자동차 장난감 과자 빵 옷 신발 가방 가구 전자 반도체 식품 제약 건설 조선 철강 화학 방송 신문 게임 인형 종이 유리 벽돌 초콜릿 라면 김치 두부 떡 국수 냉면 고기 생선 과일 야채 꽃 책 문구 안경 시계 금 은 보석 휴대폰 핸드폰 통신 인터넷 온라인 무인 24시 편의 할인 백화 면세 중고 헌책 동네 시골 도시 학교 교회 성당 회사 공장 병원 약국 은행 우체 소방 경찰 군 시립 구립 도립 국립 사립 공립 시민 주민 구민 군민 도민 마을 아파트 단지 근린 체육 생태 수변 호수 중앙 문화 예술 청소년 노인 실내 야외 공공 국공립 직장 가정 숲 영어유치원 요양 한의 치 안 내 외 정형 성형 피부 산부인 정신 재활 응급 대학병원 방과후 돌봄 지역아동 다문화 평생 교육 학습 연수 수련 체험 캠핑 오토 물놀이 눈썰매 스키 골프 볼링 탁구 당구 헬스 요가 필라테스 복싱 주짓수 유도 클라이밍 키즈 애견 반려 유기");
const COUNTERS = /^(한|두|세|네|몇|첫|각|여러|이|그|저|매|온|전|총|새|옛|헌)(번|명|개|살|시|분|장|권|반|조|팀|쪽|층|칸|일|주|달|해|년|원|등|편|곳|줄|집|날|때|분)$/;
// 흔한 낱말과 같은 이름으로 자주 쓰이는 것 — 문장의 주어이고 사람 얘기일 때만 가린다
const HOMO = W("미소 하늘 보람 나라 우주 지수 사랑 소망 이슬 한결 은별 별 봄 바다 콩 구름 가을 겨울 여름 새벽 마루 그루 단비 슬기 누리 다솜 아름 초롱 한솔 나리 보리 다래 이루 가람 한별 샛별 햇살 노을 솔 빛 달 해 강 산 들 꽃 잎 샘 결 온 은 진주 수정 유리 서진 정상 지혜 믿음 은혜 다정 한빛 새봄 봄이 바람 나무 열매 이삭 하루 나비 소라 보배 한울 가온 라온 다온 도담 마음 고운 푸름 나은 예나 세상 대한 민국 우리 누리 아리 다미 초원 은하 태양 로운 이든 한길 큰별 은솔 솔잎 풀잎 꽃님 달님 별님 단풍 장미 국화 매화 난초 진달래 다래 머루 수리 보라 노랑 하양 초록 연두");
const HUMAN_CUE = /(교실|우리 ?반|학년|짝|친구|키가|작다|크다|착하|웃기|웃었|웃는|울었|달리기|1등|일등|발표|전학|숙제|공부|말했|말한|화를|화났|삐졌|삐지|놀았|놀자|싸웠|혼났|칭찬|장난|줄넘기|축구|피구|그림을|노래를|춤을|잘한다|동생|언니|오빠|누나|형이|반장|회장|모둠|당번|지각|결석|아팠|아프다|다쳤|초대)/;
const PLACE_GENERIC = W("학교 학원 집 교실 도서관 유치원 체육관 운동장 방과후 교회 성당 인터넷 유튜브 책 학습지 온라인 문화센터 주민센터 복지관 돌봄교실 태권도장 수영장 과외 공부방 여기 거기 저기 어디 밖 안 앞 뒤 옆 위 아래 한국 외국 시골 도시 동네 마을 놀이터 공원 마트 병원 회사 방 거실 부엌 마당 옥상 강당 급식실 과학실 음악실 미술실 컴퓨터실 영어실 보건실 교무실 복도 계단");
const SPACED_INST = /^(정류장|정거장|사거리|삼거리|오거리|아파트|빌라|마을|학원|교회|성당|병원|의원|약국|마트|공원|놀이터|도서관|역|시장|상가|태권도|피아노|미술|유치원|어린이집|초등학교|중학교|고등학교|초|빌딩|타워|문구|문구점|분식|분식집|식당|카페|미용실|교습소|체육관|도장)$/;
const WITH_NEXT = /^(같이|함께|둘이|셋이|놀|싸우|만나|화해|얘기|이야기|통화|사귀|짝|친하|다투|헤어지|손잡|수다|장난|약속|전화|카톡|문자)/;
const VOC_OK = W("엄마 아빠 얘 애 친구 선생님 형 누나 언니 오빠 동생 아가 아기 할머니 할아버지 이모 삼촌 고모 아저씨 아줌마 여보 자기 얘들 애들 친구들 강아지 고양이 멍멍 야옹 하느님 주님 임금님 바람 구름 나무 하늘 바다 별 달 해 봄 꽃 비 눈 세상 사람 여러분 형아 누나야 할미 할비 아들 딸 공주 왕자 대장 바보 멍청이 귀염둥이 이놈 녀석 인간 지구 세월 시간 나 너 저 우리 저기 여기 거기 뭐 이게 그게 진짜 정말 맞 아니");
const isH = (s) => /[가-힣]/.test(s);
export function deepSpans(text, kiwi) {
  const toks = kiwi.tokenize(text);
  const spans = [], names = new Set();
  const ctxNames = new Set(); // 흔한 낱말과 같은 이름 — 사람 문맥으로 잡힌 것(같은 글의 «별이는·별이가»까지 가리려고)
  const CTX = /^(NAME이|NAME는|KIN|ANIM|WITH|VOC|VOC2|NICK|ROLE|TRANSFER|HOMO|HOMO0)$/;
  const add = (t, why, prop) => { spans.push([t.position, t.position + t.length, why, t.str]); if (prop && t.str.length >= 2) names.add(t.str); if (CTX.test(why)) ctxNames.add(t.str); };
  const addRange = (a, b, why, prop) => { const str = text.slice(a.position, b.position + b.length); spans.push([a.position, b.position + b.length, why, str]); if (prop && str.length >= 2 && !/\s/.test(str)) names.add(str); };
  const adj = (a, b) => a && b && a.position + a.length === b.position;
  // 제목 괄호 안(《》『』「」<>)은 책·작품 이름 — 분석 층은 건드리지 않는다
  const inTitle = []; for (const m of text.matchAll(/[《『「〈][^》』」〉\n]{1,40}[》』」〉]/g)) { if (m[0].length - 2 >= 4) inTitle.push([m.index, m.index + m[0].length]); } // 부등호 < > 는 제목 괄호가 아니다 · 3자 이하 한 낱말은 제목이라도 분석한다
  const titled = (t) => inTitle.some(([a, b]) => t.position >= a && t.position < b);
  const sentStart = (i) => i === 0 || toks[i - 1].sentPosition !== toks[i].sentPosition || /^(SF|SSO|SW|SP)$/.test(toks[i - 1].tag) && /["'“‘,]/.test(toks[i - 1].str) || /\n\s*$/.test(text.slice(toks[i - 1].position + toks[i - 1].length, toks[i].position));
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], n = toks[i + 1], n2 = toks[i + 2], pv = toks[i - 1];
    if (titled(t)) continue;
    if (t.tag === "NNP" && isH(t.str) && !SAFE_NNP.has(t.str) && !SAFE_NNP.has(t.str.replace(/\s/g, ""))) { add(t, "NNP", true); continue; }
    if (/^NN[GP]$/.test(t.tag) && t.morphId <= 3 && isH(t.str) && t.str.length >= 2 && !SAFE_NNP.has(t.str)) { add(t, "OOV", true); continue; }
    if (t.tag === "SL" && t.str.length >= 2 && !SAFE_SL.has(t.str.toLowerCase())) { add(t, "SL"); continue; }
    // 붙여 쓴 글에서 이름이 감탄사+명사로 쪼개진 것(«하은이랑같이» → 하/IC 은/NNG)
    if (/^(IC|MM|MAG)$/.test(t.tag) && t.str.length === 1 && isH(t.str) && n && n.tag === "NNG" && n.str.length === 1 && adj(t, n) && n2 && /^(J|VCP)/.test(n2.tag) && adj(n, n2) && !COMMON1.has(n.str) && !COMMON1.has(t.str + n.str)) { addRange(t, n, "SPLIT", true); i++; continue; }
    // 분석기가 모르는 이름을 조각으로 풀어 버린 것(«민호» → 민/NNG 호/NNB, «한지민» → 한지/NNG 민/NNG, «도율» → 도/NNG 율/XSN):
    //   한 어절 안에서 이어진 명사류 조각을 붙인 것이 이름 모양(규칙 층 looksLikeName)이면 가린다
    if (/^(NNG|NNB|NNP|MM|NR|XPN|IC)$/.test(t.tag) && isH(t.str) && t.str.length <= 2 && !(pv && adj(pv, t) && /^(NN|MM|NR|XPN)/.test(pv.tag))) {
      let j = i, str = t.str;
      while (toks[j + 1] && adj(toks[j], toks[j + 1]) && /^(NNG|NNB|NNP|XSN|NR)$/.test(toks[j + 1].tag) && isH(toks[j + 1].str) && (str + toks[j + 1].str).length <= 4) { j++; str += toks[j].str; }
      if (j > i && str.length >= 2 && looksLikeName(str, "") && !SAFE_NNP.has(str) && !COUNTERS.test(str)) { addRange(t, toks[j], "SHAPE", true); i = j; continue; }
    }
    // «기쁨이가», «늘봄이네 강아지» — 어절이 [줄기]+이+조사 꼴이고 «이»가 따로 떨어진 조각이면 이름에 붙는 접미다
    //   (고양이·어린이는 한 낱말이라 «이» 조각이 안 생긴다). 조사는 분석 결과가 흔들려(가/VV, 네 → 너+의) 글자로 본다.
    if (t.str === "이" && t.length === 1 && pv && adj(pv, t)) {
      const tail = (text.slice(t.position + 1).match(/^[가-힣]*/) || [""])[0];
      const nextWord = text.slice(t.position + 1 + tail.length).match(/^\s+([가-힣]+)/);
      if (/^(가|는|랑|도|를|한테|에게|의|와|만|하고|까지|처럼|보다)$/.test(tail) || (tail === "네" && nextWord && !/^(요|그래|진짜|정말)$/.test(nextWord[1]))) {
        let k = i - 1; while (k > 0 && adj(toks[k - 1], toks[k])) k--;
        const stem = text.slice(toks[k].position, t.position);
        if (/^[가-힣]{1,4}$/.test(stem) && !PERSON_OK.has(stem) && !PERSON_OK.has(stem + "이") && !titled(toks[k]) && !SAFE_NNP.has(stem)) { spans.push([toks[k].position, t.position, "STEM이", stem]); ctxNames.add(stem); continue; }
      }
    }
    if (t.tag === "NR" && isH(t.str) && t.str.length >= 2 && n && adj(t, n) && n.tag === "NNG" && INST.has(n.str)) { add(t, "INST", true); continue; }
    if (!/^NN[GB]$/.test(t.tag) || !isH(t.str)) continue;
    if (t.tag === "NNG" && (INST.has(t.str) || /^(집|가게|식당)$/.test(t.str)) && pv && adj(pv, t)) {
      let k = i - 1; while (k > 0 && adj(toks[k - 1], toks[k])) k--;
      const chain = toks.slice(k, i);
      if (chain.some((c) => !/^(NN|NP|NR|MM|S|J|XP|XS)/.test(c.tag)) && chain.every((c) => !/^S[FPSOEW]/.test(c.tag))) { addRange(toks[k], pv, "INSTADJ"); continue; }
    }
    const ok = PERSON_OK.has(t.str);
    // 한 글자 명사가 한 어절 안에서 잇달아 — 사전에 없는 낱말(이름·상호)이 쪼개진 것
    if (t.str.length === 1 && t.tag === "NNG") {
      let j = i; while (toks[j + 1] && toks[j + 1].tag === "NNG" && toks[j + 1].str.length === 1 && adj(toks[j], toks[j + 1])) j++;
      if (j > i && toks.slice(i, j + 1).some((r) => !COMMON1.has(r.str))) { addRange(t, toks[j], "RUN1", true); i = j; continue; }
    }
    // 업종·기관 낱말 앞에 붙은 고유한 이름(«은빛소아과», «미래건설», «행복동»)
    if (/^(NNG|NR)$/.test(t.tag) && adj(t, n) && /^NN[GB]$/.test(n.tag) && !INST_GENERIC.has(t.str) && !ok && !(t.tag === "NR" && !INST.has(n.str))) {
      if (INST.has(n.str) || (/^(동|읍|면|리|로|길|구|군|시)$/.test(n.str) && t.str.length >= 2 && !(toks[i + 2] && adj(n, toks[i + 2]) && /^NN/.test(toks[i + 2].tag)))) {
        if (/^(동|읍|면|리|로|길|구|군|시)$/.test(n.str)) { addRange(t, n, "PLACE"); i++; } else add(t, "INST", true);
        continue;
      }
    }
    // 별명: «토끼라고 불리는», «개구리라는 별명»
    {
      let k = i + 1; if (toks[k] && toks[k].str === "이" && toks[k].tag === "VCP") k++;
      const q = toks[k], nx = toks[k + 1];
      if (q && q.position <= t.position + t.length + 1 && /^(라고|라는|이라고|이라는)$/.test(q.str) && nx && [nx, toks[k + 2], toks[k + 3]].some((x) => x && /^(부르|불리|별명|애|아이|친구|형|동생|이름|누나|언니|오빠|짝|쓰|적|읽)$/.test(x.str) && x.position - q.position < 12)) { add(t, "NICK"); continue; }
    }
    // «강 온이 전학을 왔다» — 전학 오고 가는 것은 사람
    if (n && /^(이|가)$/.test(n.str) && /^J/.test(n.tag) && adj(t, n) && n2 && n2.str === "전학" && !PERSON_OK.has(t.str)) { add(t, "TRANSFER"); continue; }
    if (ok || t.str.length < 1) continue;
    const isName이 = adj(t, n) && n.str === "이" && /^(JKS|XSN|JX)$/.test(n.tag);
    // 흔한 낱말과 같은 이름: «하늘이가·하늘이는·하늘이랑» — «이» 뒤에 조사가 또 붙으면 이름 접미 «이»
    if (isName이 && adj(n, n2) && /^J/.test(n2.tag)) { add(t, "NAME이"); continue; }
    // «태양이는 발음이 좋다» — «이다»의 «이» 뒤에 «는»은 못 온다(의사인 ○ / 의사이는 ✕) → 이름 + 이 + 는
    if (adj(t, n) && n.str === "이" && n.tag === "VCP" && adj(n, n2) && n2.str === "는" && n2.tag === "ETM") { add(t, "NAME는"); continue; }
    // «내 짝은 별이다», «제 짝은 동건이에요» — 사람을 가리키는 말 + 은/는 + 낱말 + 이다
    if (pv && /^(은|는)$/.test(pv.str) && toks[i - 2] && /^(짝|짝꿍|단짝|베프|절친|친구|이름|동생|남동생|여동생|언니|오빠|누나|형)$/.test(toks[i - 2].str) && adj(t, n) && n.tag === "VCP") { add(t, "ROLE"); continue; }
    // «우리 동네 무궁화로는» — 동네·마을 바로 뒤 «○○로»는 길 이름
    if (pv && /^(동네|마을)$/.test(pv.str) && adj(t, n) && n.str === "로" && /^J/.test(n.tag) && t.str.length >= 2) { addRange(t, n, "ROAD"); i++; continue; }
    // «미소는 교실에서 제일 작다», «콩이 오늘 달리기 1등했다» — 이름으로 자주 쓰이는 낱말이 문장 맨 앞 주어이고 사람 얘기
    if (HOMO.has(t.str) && sentStart(i) && adj(t, n) && /^(은|는|이|가|도)$/.test(n.str) && /^J/.test(n.tag)) {
      const end = text.slice(t.position).search(/[.!?\n]/); const rest = text.slice(n.position + n.length, end < 0 ? undefined : t.position + end);
      if (HUMAN_CUE.test(rest)) { add(t, "HOMO"); continue; }
    }
    // «은혜 어제 전학 가서 울었다» — 조사 없이 문장 맨 앞에 놓인 이름
    if (HOMO.has(t.str) && sentStart(i) && n && !adj(t, n) && /^(MAG|NNG|NP|VV|VA|MM)$/.test(n.tag)) {
      const end = text.slice(t.position).search(/[.!?\n]/); const rest = text.slice(t.position + t.length, end < 0 ? undefined : t.position + end);
      if (/(전학|울었|웃었|말했|왔어|갔어|안녕|고마워|미안|축하|너 |넌 |네가|같이|놀자|아팠|결석|지각|발표|숙제)/.test(rest)) { add(t, "HOMO0"); continue; }
    }
    // «수학은 정상에서 배운다» — «○○에서 배운다/다닌다»의 ○○은 다니는 곳 이름
    if (adj(t, n) && ((n.str === "에서" && n2 && (/^(배우|다니)$/.test(n2.str) || (/^(주사|이|이빨|충치|치료|진료|검사|머리|파마|침|약)$/.test(n2.str) && toks.slice(i + 3, i + 8).some((x) => /^(맞|빼|뽑|받|자르|깎|하|짓)$/.test(x.str) && /^V/.test(x.tag))))) || (n.str === "에" && n2 && n2.str === "다니")) && !PLACE_GENERIC.has(t.str) && !INST.has(t.str)) {
      let k = i; while (k > 0 && adj(toks[k - 1], toks[k])) k--;
      const stem = text.slice(toks[k].position, t.position + t.length);
      if (!PLACE_GENERIC.has(stem) && !/(학교|학원|유치원|어린이집|병원|의원|치과|소아과|미용실|센터|교실|도장|체육관|수영장|교회|성당)$/.test(stem)) { spans.push([toks[k].position, t.position + t.length, "ATTEND", stem]); continue; }
    }
    // «분식집은 떡잔치야», «문구점 이름이 콩닥콩닥이다» — 가게·기관 낱말 + 은/는/이름이 + ○○ + 이다
    // «새벽이형», «미소언니» — 이름 + 호칭
    const kin = isName이 ? n2 : n;
    if (kin && adj(isName이 ? n : t, kin) && kin.tag === "NNG" && KIN.has(kin.str) && !KIN_PREFIX_OK.has(t.str) && t.tag === "NNG") { add(t, "KIN"); continue; }
    // 사람에게만 붙는 조사: «솔한테», «마루에게»
    if (adj(t, n) && /^(한테|에게|한테서|에게서|께|이한테|이에게)$/.test(n.str) && /^J/.test(n.tag)) { add(t, "ANIM"); continue; }
    // «마루랑 같이», «소망이랑 놀았다»
    if (adj(t, n) && /^(랑|이랑|하고|와|과)$/.test(n.str) && /^J/.test(n.tag) && n2 && WITH_NEXT.test(n2.str)) { add(t, "WITH"); continue; }
    // 부르는 말: 문장 맨 앞 «나라야 오늘…», «콩이야 내일…»
    if (sentStart(i) && adj(t, n) && !VOC_OK.has(t.str)) {
      const voc1 = /^(야|아|이야)$/.test(n.str) && /^(JX|JKV|IC)$/.test(n.tag);
      const voc2 = n.str === "이" && n.tag === "VCP" && n2 && n2.str === "야" && adj(n, n2);
      const after = toks[i + (voc2 ? 3 : 2)];
      if ((voc1 || voc2) && after && !/^S[FPE]$/.test(after.tag) && after.sentPosition === t.sentPosition) { add(t, "VOC"); continue; }
    }
    if (sentStart(i) && n && n.tag === "NP" && /^(너|니|넌|네)$/.test(n.str) && !adj(t, n)) { add(t, "VOC2"); continue; }
  }
  return { spans, names, ctxNames };
}
const K = "[공영일이삼사오육칠팔구]";
const NUM_RULES = [
  // 전화번호 전체를 먼저(연속 숫자 규칙이 앞부분만 먹으면 뒤가 남는다) · 앞자리를 한글로 섞어 써도
  [new RegExp(`(?<![\\d가-힣])(?:0|공|영)(?:1|일)[\\d${K.slice(1, -1)}][\\s,.\\-]{0,3}(?:\\d|${K}){3,4}[\\s,.\\-]{0,3}(?:\\d|${K}){4}`, "g"), "PHONEMIX"],
  [/(?<![\d.])\d{2,4}[./]\s?\d{1,2}[./]\s?\d{1,2}(?![\d])/g, "DATE"],
  [/\d{2,4}\s?년\s?생/g, "BIRTHY"],
  [/\d{2,4}\s?년\s?\d{1,2}\s?월\s?생/g, "BIRTHYM"],
  [/\d{1,2}\s?월\s?\d{1,2}\s?일\s?생/g, "BIRTHD"],
  [/\d{6,}/g, "DIGITS"],
  [/[공영일이삼사오육칠팔구]{3,4}(?:(?:에|의|\s|-)+[공영일이삼사오육칠팔구]{3,4}){1,2}/g, "KNUM"],
  [/(?<=\d\s?반\s)\d{1,2}\s?번(?=\s*ㅇㅇㅇ)/g, "ROLLNO"],
];
const NUM_RULES2 = [
  [new RegExp(`(?<=(?:번호|뒷자리|앞자리|비번|비밀번호|끝자리)[^.!?\\n]{0,12})${K}{4,}`, "g"), "KNUM4"],
  [new RegExp(`${K}{2,4}\\s?년\\s?[일이삼사오육칠팔구십시유]{1,3}\\s?월\\s?[일이삼사오육칠팔구십]{1,3}\\s?일`, "g"), "KDATE"],
  [/\d{1,2}\s?살(?=[^.!?\n]{0,25}(?:생일|태어|ㅇㅇㅇ에 태|생))/g, "AGEBIRTH"],
  [/\d{2,4}\s?번(?=\s?(?:버스|마을버스|을 타|를 타|타고))/g, "BUSNO"],
  [/\d{1,2}\s?번\s?출구/g, "EXIT"],
  [/\d{1,2}\s?단지/g, "DANJI"],
  [/\d{3,4}\s?호(?!선)/g, "HO"],
  // 생일 날짜 — 같은 줄 가까이에 «생일·태어»가 있으면 월·일도 가린다(«생일-8월19일», «4월 5일 내 생일», «생일인 친구: ○○(4/22)»)
  [/\d{1,2}\s?월\s?\d{1,2}\s?일(?=[^\n]{0,30}(?:생일|태어))/g, "BDAY"],
  [/(?<=(?:생일|태어)[^\n]{0,40})\d{1,2}\s?월\s?\d{1,2}\s?일/g, "BDAY"],
  [/(?<=생일[^\n]{0,40})(?<![\d/])\d{1,2}\/\d{1,2}(?![\d/])/g, "BDAY"],
  // 비밀번호·암호·학번 뒤 숫자(3~8자리) — «비밀번호를 알려줬다. 1029라고», «학번 20345»
  [/(?<=(?:비밀번호|비번|암호|학번|현관|도어락)[^\n]{0,20})(?<!\d)\d{3,8}(?!\d)/g, "CODE"],
  // 숫자 낀 아파트 차수·도로명 — «별하늘2차 아파트», «늘푸른2로 13길 5»
  [/[가-힣]{2,8}\d{1,2}차(?=\s?(?:아파트|빌라|에\s?(?:살|사)|(?:으)?로\s?이사|\s?\d{1,4}동))/g, "APTNO"],
  [/[가-힣]{2,7}\d{1,3}(?:로|길)(?:\s?\d{1,3}번?길)?(?:\s?\d{1,4}(?:-\d{1,4})?(?:번지|호)?)?(?![가-힣]*(?:로|으로)\s)/g, "ROAD3"],
];
const ID_CUE = /(닉네임|닉넴|아이디|별명|계정|비밀번호|비번|패스워드)(?:은|는|이|가|을|를|도)?\s*[:：]?\s*/g;
// 구간들을 가린다. 겹치는 구간은 하나로 합친다 — 겹친 것 중 하나를 버리면 버린 구간의 안 겹친 부분이 그대로 남는다.
function applySpans(out, spans, log) {
  const sorted = spans.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const [s, e, why, str] of sorted) {
    const m = merged.at(-1);
    if (m && s < m[1]) { m[1] = Math.max(m[1], e); m[2] += "+" + why; } else merged.push([s, e, why, str]);
  }
  for (let i = merged.length - 1; i >= 0; i--) { const [s, e, why, str] = merged[i]; out = out.slice(0, s) + MASK + out.slice(e); log.push(`${why}:${str}`); }
  return out;
}
// 글자 꼴로 잡는 것들(분석 결과와 무관) — 한 번 가린 뒤 드러나는 꼴(«별빛리 ㅇㅇㅇ 7»)이 있어 두 번 돌린다
function regexSpans(out, spans, ctxNames) {
  // 가게·기관 이름 서술: «분식집은 떡잔치야», «문구점 이름이 콩닥콩닥이다», «학원 이름은 ○○이다»
  for (const m of out.matchAll(/(분식집|문구점|문방구|가게|식당|마트|슈퍼|편의점|학원|교습소|미용실|병원|의원|약국|교회|성당|유치원|어린이집|태권도장|도장|체육관|카페|빵집|서점|아파트|빌라|마을|동네|회사|직장|학교)(?:은|는|\s?이름[은이]|\s?이름)\s+([가-힣A-Za-z0-9]{2,10}?)(?=(?:이야|야|이다|다|입니다|이에요|예요|인데|이고|이라고|라고)(?:[\s.,!?~]|$))/g)) {
    const w = m[2]; if (PERSON_OK.has(w) || PLACE_GENERIC.has(w) || w.includes(MASK) || /^(어디|무엇|뭐|비밀|여기|저기|거기|최고|처음|마지막)$/.test(w) || /(없|있|좋|많|크|작|멀|가깝|넓|좁|같|아니)$/.test(w)) continue;
    const st = m.index + m[0].length - w.length; spans.push([st, st + w.length, "INSTNAME", w]);
  }
  // 띄어 쓴 상호·정류장: «하얀구름 정류장», «○○ 아파트» — 앞 어절이 흔한 꾸밈말이 아니면 가린다
  for (const m of out.matchAll(/(^|[\s"'(])([가-힣]{2,8})\s(정류장|정거장|사거리|삼거리|아파트|빌라|마을|학원|교회|성당|병원|의원|약국|마트|공원|놀이터|도서관|시장|상가|유치원|어린이집|초등학교|문구점|분식집|미용실|교습소|태권도장)(?=[가-힣]{0,4}(?:[\s.,!?]|$))/g)) {
    const w = m[2]; if (INST_GENERIC.has(w) || PERSON_OK.has(w) || PLACE_GENERIC.has(w) || SAFE_NNP.has(w) || /(는|은|이|가|을|를|에|의|도|서|고|며|면|한|인|운|던|린|진|른|큰|새|옛|그|저|이번|다음|무슨|어느|어떤|모든|여러|다른|같은|랑|와|과|하고|한테|에게|으로|로|까지|부터|만|께|처럼|보다)$/.test(w) || /^(그|이|저|우리|내|제|너희|저희|다음|이번|가까운|근처|집앞|학교앞)/.test(w)) continue;
    const st = m.index + m[1].length; spans.push([st, st + w.length, "SPACEDINST", w]);
  }
  // 따옴표 별명 «'수'라고 부른다» · «ㅇㅇㅇ를 자라고 부르는데»
  for (const m of out.matchAll(/(['"‘“「])([^'"’”」\s]{1,8})(['"’”」])(?=\s?(?:이)?라고\s?(?:부[르른릅]|불[러렀리린]))/g)) spans.push([m.index + 1, m.index + 1 + m[2].length, "QNICK", m[2]]);
  for (const m of out.matchAll(/((?:를|을)\s+(?:그냥\s+|자꾸\s+|다들?\s+|모두\s+)?)([가-힣]{1,6}?)(?=(?:이)?라고\s?(?:부[르른릅]|불[러렀리린]))/g)) { if (!PERSON_OK.has(m[2])) spans.push([m.index + m[1].length, m.index + m[1].length + m[2].length, "NICK2", m[2]]); }
  // 이름 줄: «명단 [서진, 하늘, 도율]» — 명단·조원 같은 말 뒤 쉼표로 이은 짧은 낱말들
  for (const m of out.matchAll(/(명단|모둠원|조원|팀원|참가자|참석자|당번|이름들?|친구들?|멤버|선수)(?:은|는|이|가)?[ \t]{0,3}[:：\[(]?[ \t]{0,3}((?:[가-힣ㅇ]{2,4}[ \t]{0,2}[,·][ \t]{0,2}){1,12}[가-힣ㅇ]{2,4})/g)) {
    let off = m.index + m[0].length - m[2].length;
    for (const part of m[2].split(/([,·]\s*)/)) { if (/^[가-힣]{2,4}$/.test(part.trim()) && !PERSON_OK.has(part.trim())) { const lead = part.length - part.trimStart().length; spans.push([off + lead, off + lead + part.trim().length, "ROSTER", part.trim()]); } off += part.length; }
  }
  // 일기·편지 끝 서명 «- 지우»
  for (const m of out.matchAll(/[-–—~]\s*([가-힣]{2,4})(?=\s*$)/gm)) { if (!PERSON_OK.has(m[1]) && !/^(끝|안녕|이상|감사|사랑)$/.test(m[1])) { const st = m.index + m[0].length - m[1].length; spans.push([st, st + m[1].length, "SIGN2", m[1]]); ctxNames.add(m[1]); } }
  // 부르는 말 + 인사: «하늘아 안녕!», «하다야 잘 지내?»
  for (const m of out.matchAll(/(^|[.!?\n"“]\s*)([가-힣]{2,3})(?:아|야)[,!~]*\s+(?=안녕|잘 ?지내|고마워|미안|생일 ?축하|축하해|보고 ?싶|사랑해|놀자|놀러|같이|너 |넌 |네가|나랑|우리 )/g)) {
    const w = m[2]; if (PERSON_OK.has(w) || /^(얘들|애들|여러분|친구들)$/.test(w)) continue;
    const st = m.index + m[1].length; spans.push([st, st + w.length, "VOCGREET", w]); ctxNames.add(w);
  }
  // 학교 이름만 쓴 것: «별빛 3학년 2반이다»
  for (const m of out.matchAll(/(^|[\s"'(])([가-힣]{2,6})\s(?=\d\s?학년\s?\d{1,2}\s?반)/g)) {
    const w = m[2]; if (PERSON_OK.has(w) || /(는|은|이|가|도|에|서|의|를|을|로|와|과|랑|고|만)$/.test(w) || /^(올해|지금|이제|내년|작년|벌써|드디어|현재|아직|초등학교|중학교|우리|저희|다음|이번|새로|곧|그때|당시)$/.test(w)) continue;
    const st = m.index + m[1].length; spans.push([st, st + w.length, "SCHOOL0", w]);
  }
  // 작은 행정구역 + 번지: «별빛리 ㅇㅇㅇ 7», «느릅실길 12»
  for (const m of out.matchAll(/(^|[\s"'(])([가-힣]{2,6}(?:리|동|읍|면|길|로))(?=\s(?:ㅇㅇㅇ|\d|산\s?\d))/g)) { const st = m.index + m[1].length; if (!/^(도로|통로|거리|우리|마무리|자리|머리|다리|소리|요리|정리|수리|관리|처리|행동|운동|활동|감동|이동|자동|충동|아동|장면|화면|방면|라면|지면|정면|표면|측면|국면|수면|가면)$/.test(m[2])) { const num = /^\s(?:산\s?)?\d{1,5}(?:-\d{1,5})?(?:번지|호)?/.exec(out.slice(st + m[2].length)); spans.push([st, st + m[2].length + (num ? num[0].length : 0), "ADDR", m[2]]); } }
  // 길 이름: «하늬바람로를 따라», «○○로에 있는» — 조사 «로» 뒤에는 를·에·가 가 못 온다
  for (const m of out.matchAll(/(^|[\s"'(])([가-힣]{2,7}(?:로|길))(?=(?:를|을|에서|에는|에도|에|가|이)(?:[\s.,!?]|$))/g)) {
    const w = m[2]; if (/(도로|통로|선로|미로|진로|피로|난로|위로|경로|항로|수로|차로|대로|가로|세로|기로|산책로|등산로|보행로|활주로|철로|회로|퇴로|활로|애로|원로|과로|근로|공로|폭로|토로|포로|화로|별로|바로|서로|새로|따로|스스로|억지로|절로|저절로|제대로|함부로|홀로|날로|실로|참으로|주로|도대체로|때로|이대로|그대로|마음대로|멋대로|꽃길|눈길|손길|발길|물길|산길|들길|밤길|빗길|골목길|오솔길|지름길|갈림길|오르막길|내리막길|등굣길|하굣길|출근길|퇴근길|귀갓길|고갯길|숲길|흙길|자갈길|둘레길|산책길|찻길|기찻길|뱃길|하늘길|앞길|옛길|큰길|샛길|외길|한길|가는 ?길|오는 ?길|갈 ?길)$/.test(w) || PLACE_GENERIC.has(w)) continue;
    const st = m.index + m[1].length; spans.push([st, st + w.length, "ROAD2", w]);
  }
  // 이름을 대는 말: «이름이 강이든이라고», «이름: 서아» · 사투리 자기소개 «나 지우여»
  for (const m of out.matchAll(/((?:이름|성함)(?:은|이|\s?[:：])\s?)([가-힣]{2,4}?)(?=(?:이라고|라고|이야|야|이래|래|입니다|이에요|예요|이다|다|인데|이고)?(?:[\s.,!?/)]|$))/g)) {
    const w = m[2]; if (PERSON_OK.has(w) || /^(뭐|무엇|비밀|없|있|모르|어떻|그래|아직|원래|진짜|정말|너무|조금|모두|다들|같|다르|예쁘|멋지|특이|이상|웃기|길|짧)/.test(w)) continue;
    const st = m.index + m[1].length; spans.push([st, st + w.length, "NAMEIS", w]); ctxNames.add(w);
  }
  for (const m of out.matchAll(/((?:^|[\s"'])(?:나|난|저|전|나는|저는)\s)([가-힣]{2,3})(?=(?:이여|여|이라고 해|라고 해|이우다|이라예|라예|입니더|이어라|이랑께)(?:[\s.,!?]|$))/g)) {
    if (!PERSON_OK.has(m[2])) { const st = m.index + m[1].length; spans.push([st, st + m[2].length, "SELFNAME", m[2]]); ctxNames.add(m[2]); }
  }
  // 문장 첫머리에서 부르는 말: «유서야 나한테 왜그래»
  for (const m of out.matchAll(/((?:^|[.!?~"'\n]\s?))([가-힣]{2,3})(?=[야아],?\s(?:나한테|나랑|나도|너|넌|니가|네가|왜|우리|같이|미안|고마워|안녕|뭐\s?해|어디|내가|이따|오늘|내일))/g)) {
    if (!PERSON_OK.has(m[2]) && !VOC_OK.has(m[2])) { const st = m.index + m[1].length; spans.push([st, st + m[2].length, "VOC3", m[2]]); ctxNames.add(m[2]); }
  }
  // 양식의 곳 칸: «장소: 별빛파티룸», «주소: ○○», «사는 곳: ○○»
  for (const m of out.matchAll(/((?:장소|주소|사는 ?곳|집 ?주소)\s?[:：]\s?)([^\s.,!?/]{2,14})/g)) {
    const w = m[2]; if (w.includes(MASK) || PLACE_GENERIC.has(w) || INST_GENERIC.has(w) || PERSON_OK.has(w) || /^(우리|학교|교실|운동장|강당|체육관|도서관|급식실|놀이터|공원|집|비밀|미정|없음|모름)/.test(w)) continue;
    const st = m.index + m[1].length; spans.push([st, st + w.length, "PLACECUE", w]);
  }
  // 편지 맺음말 «- 제자 가온 올림», «별 올림»
  for (const m of out.matchAll(/([가-힣]{1,4})(\s?)(올림|드림|씀)(?=[\s.!~]*$)/gm)) {
    if (!PERSON_OK.has(m[1]) && !m[1].includes(MASK)) { spans.push([m.index, m.index + m[1].length, "SIGN", m[1]]); ctxNames.add(m[1]); }
  }
  // 닉네임·아이디 뒤 어절(한글 닉네임 포함) — 조사만 남기고 가린다
  for (const m of out.matchAll(ID_CUE)) {
    const st = m.index + m[0].length; const w = out.slice(st).match(/^[^\s.,!?]+/);
    if (w && !w[0].includes(MASK)) { const core = w[0].replace(/(으로|로|인데|이다|이야|야|입니다|이에요|예요|이고|고|라고|이라고|은|는|이|가|을|를)$/, "") || w[0]; if (!/^(뭐|무엇|있|없|바꾸|알려|만들|짓|정하|부르|불리|까먹|잊)/.test(core)) spans.push([st, st + core.length, "IDCUE", core]); }
  }
}
/** 규칙(pii.mjs) → 숫자 꼴 → 분석 층. { text, hits, names, log, rulesOnly } — pii.mjs 의 maskPII 와 같은 모양에 log 를 더했다. */
export async function maskDeep(text, opts = {}) {
  const kiwi = await loadKiwi();
  // 학생이 더 고른 낱말(extraWords)은 맨 끝에만 쓴다 — 미리보기(서버가 가린 글 위에 화면이 덧가림)와 글자 하나까지 같게.
  text = String(text ?? "").replace(/[‐‑‒–—―−﹣－]/g, "-").replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const pre = [];
  text = text.replace(NUM_RULES[0][0], (m) => { pre.push(`PHONEMIX:${m}`); return MASK; }); // 규칙층이 번호 앞부분만 먹기 전에 전화번호 전체를
  text = text.replace(/\S{300,}/g, (m) => { pre.push(`LONGRUN:${m.length}자`); return MASK; }); // 300자 넘게 안 띄운 덩어리는 글이 아니다 — 분석기를 오래 붙잡는다
  const base = maskPII(text, { ...opts, extraWords: [] });
  let out = base.text; const rulesOnly = out; const log = [...pre];
  out = out.replace(/#(?=[가-힣A-Za-z])/g, "# "); // 해시태그는 띄워서 분석한다(«#서연이랑놀기»)
  for (const [re, why] of [...NUM_RULES, ...NUM_RULES2]) out = out.replace(re, (m) => { log.push(`${why}:${m}`); return MASK; });
  const { spans, names, ctxNames } = deepSpans(out, kiwi);
  regexSpans(out, spans, ctxNames);
  out = applySpans(out, spans, log);
  { // 2회차: 가린 뒤에야 보이는 꼴
    const sp2 = []; regexSpans(out, sp2, ctxNames); out = applySpans(out, sp2, log);
  }
  // 한 번 이름으로 잡힌 낱말은 글 전체에서 가린다(«하은이가반찬을» — 뒤쪽은 분석이 못 쪼갠다)
  for (const nm of names) { if (out.includes(nm)) { out = out.split(nm).join(MASK); log.push(`PROP:${nm}`); } }
  // 사람 문맥으로 한 번 잡힌 낱말은 같은 글에서 조사가 붙은 꼴을 모두 가린다(«별이는», «별이가», «별이랑»)
  for (const nm of ctxNames) {
    if (PERSON_OK.has(nm)) continue;
    const re = new RegExp(`(^|[^가-힣])${nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=(?:이)?(?:가|는|은|를|을|랑|와|과|도|의|아|야|네|한테|에게|하고|처럼|보다|까지|만|야말로|다|에요|예요|입니다|였다|이었다)?(?:$|[^가-힣]))`, "g");
    out = out.replace(re, (m, a) => { log.push(`CTXPROP:${nm}`); return a + MASK; });
  }
  // 가린 이름들 사이에 낀 짧은 낱말(«ㅇㅇㅇ ㅇㅇㅇ 채원 ㅇㅇㅇ이랑») — 나열된 이름
  out = out.replace(/(ㅇㅇㅇ[,·]?\s+)([가-힣]{2,4})(?=[,·]?\s+ㅇㅇㅇ)/g, (m, a, w) => { log.push(`LIST:${w}`); return a + MASK; });
  // «올 사람은 지우, ㅇㅇㅇ, ㅇㅇㅇ» — 쉼표로 이어진 이름 줄의 맨 앞
  out = out.replace(/(^|[\s(])([가-힣]{2,4})(?=[,·]\s*ㅇㅇㅇ[,·\s])/g, (m, a, w) => (PERSON_OK.has(w) ? m : (log.push(`LIST0:${w}`), a + MASK)));
  // 학생이 고른 낱말(extraWords)은 마지막에 한 번 더 — 분석 층이 어절을 바꾼 뒤에도 남지 않게
  out = maskPII(out.replace(/(ㅇㅇㅇ)+/g, MASK), opts).text;
  out = out.replace(NUM_RULES.at(-1)[0], (m) => { log.push(`ROLLNO:${m}`); return MASK; });
  return { text: out.replace(/(ㅇㅇㅇ)+/g, MASK), hits: [...base.hits, ...log.map((l) => ({ kind: "deep:" + l.split(":")[0] }))], names: base.names, log, rulesOnly };
}
