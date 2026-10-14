(function () {
  const node = typeof module !== "undefined" && module.exports;
  const config = node ? require("./config.js") : window.EXICAN_CONFIG;
  const candidates = node ? require("./candidates.js") : window.ExicanCandidates;
  const weekdays = "일월화수목금토";

  function dateLabel(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "날짜 미정";
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return "날짜 미정";
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}(${weekdays[date.getUTCDay()]})`;
  }

  function deadlineLabel(value) {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return "미정";
    const kst = new Date(time + 9 * 3600000);
    const hour = String(kst.getUTCHours()).padStart(2, "0");
    const minute = String(kst.getUTCMinutes()).padStart(2, "0");
    return `${dateLabel(kst.toISOString().slice(0, 10))} ${hour}:${minute}`;
  }

  function buildVoteShare(poll, summary, pageUrl) {
    if (!poll) return `[${config.TEAM_NAME}] 경기 참석 투표\n아직 열린 투표가 없습니다.\n👉 ${pageUrl}`;
    const count = Number.isFinite(summary?.count) ? summary.count : 0;
    return `[${config.TEAM_NAME}] ${dateLabel(poll.match_date)} 경기 참석 투표\n` +
      `${poll.cancelled ? "취소된 투표입니다.\n" : ""}마감: ${deadlineLabel(poll.closes_at)}\n현재 참석 ${count}명\n👉 ${pageUrl}`;
  }

  function buildCandidateShare(rows, pageUrl) {
    const top = rows.slice(0, 3);
    const lines = top.map((row, index) => `${index + 1}. ${candidates.describeSchedule(row)}\n${row.subject || "제목 없음"}\n${config.CAFE.ARTICLE_URL(row.article_id, row.menu_id)}`);
    return `[${config.TEAM_NAME}] 매칭 후보\n${lines.length ? lines.join("\n\n") : "아직 추천할 후보가 없습니다."}\n\n👉 ${pageUrl}`;
  }

  function buildMatchShare(match, pageUrl) {
    if (!match) return `[${config.TEAM_NAME}] 확정 매치\n아직 확정된 매치가 없습니다.\n👉 ${pageUrl}`;
    return `[${config.TEAM_NAME}] 확정 매치 공지\n${candidates.describeMatch(match)}\n경기 시작 15분 전 도착해 주세요.\n👉 ${pageUrl}`;
  }

  const api = { buildVoteShare, buildCandidateShare, buildMatchShare };
  if (typeof window !== "undefined") window.ExicanShare = api;
  if (node) module.exports = api;
})();
