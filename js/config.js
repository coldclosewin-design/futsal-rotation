const EXICAN_CONFIG = {
  SUPABASE_URL: "https://ycczxijymewmuijkxgch.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljY3p4aWp5bWV3bXVpamt4Z2NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5ODY4MTIsImV4cCI6MjEwNzU2MjgxMn0.CeePKk9p90Pc0sNhNhI1o56_66mVAdyoYhOqcm5l_9Y",
  TEAM_EMAIL: "team@fcexican.local",
  ADMIN_EMAIL: "admin@fcexican.local",
  FINES: { LATE_VOTE: 5000, NO_SHOW: 10000, LATE: 10000, LATE_KICKOFF: 30000 },
  DUES_MONTHLY: 30000,
  INJURY_EXEMPT_RATE: 0.5,
  PRESIDENT_EXEMPT_MODE: "week",
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
