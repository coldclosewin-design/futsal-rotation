const EXICAN_CONFIG = {
  TEAM_NAME: "FC EXICAN",
  SMS_TEMPLATE: "안녕하세요, 모두의풋살 카페 글({제목}) 보고 연락드립니다. 저희는 3040 풋살팀 {팀명}(실력 하~중, 안 다치게 즐겁게 합니다)입니다. {날짜} {시간} {구장} 매치 가능할까요? 저희 인원 {인원}, {포맷} 희망합니다. 구장비 조건도 알려주시면 감사하겠습니다.",
  SUPABASE_URL: "https://ycczxijymewmuijkxgch.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljY3p4aWp5bWV3bXVpamt4Z2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODY4MTIsImV4cCI6MjEwNzU2MjgxMn0.CeePKk9p90Pc0sNhNhI1o56_66mVAdyoYhOqcm5l_9Y",
  TEAM_EMAIL: "team@fcexican.local",
  ADMIN_EMAIL: "admin@fcexican.local",
  FINES: { LATE_VOTE: 5000, NO_SHOW: 10000, LATE: 10000, LATE_KICKOFF: 30000 },
  DUES_MONTHLY: 30000,
  INJURY_EXEMPT_RATE: 0.5,
  PRESIDENT_EXEMPT_MODE: "week",
  LEDGER_START_MONTH: "2026-11",   // 이 달부터 회비 행 자동 생성 (이전 달은 카톡 정산으로 마감)
  CANDIDATE_STALE_HOURS: 72, // 수집기가 이 시간 넘게 보지 못한 글은 후보에서 숨김
  CAFE: {
    CLUB_ID: 11367414,
    MENUS: { 623: "성남/하남", 625: "서울북동", 627: "서울남동", 922: "남양주/구리" },
    ARTICLE_URL: (articleId, menuId) => `https://cafe.naver.com/f-e/cafes/11367414/articles/${articleId}?menuid=${menuId}`
  },
  PREFERRED_START_HOURS: [8, 7, 9, 10]
};

if (typeof window !== "undefined") {
  window.EXICAN_CONFIG = EXICAN_CONFIG;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = EXICAN_CONFIG;
}
