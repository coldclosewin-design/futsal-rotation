(function () {
  const DAY = 24 * 60 * 60 * 1000;

  function kstDate(isoOrDate) {
    return new Date(new Date(isoOrDate).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  function shiftDate(date, days) {
    return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
  }

  function nextSaturday(kstDateStr) {
    const weekday = new Date(`${kstDateStr}T00:00:00Z`).getUTCDay();
    return shiftDate(kstDateStr, (6 - weekday + 7) % 7);
  }

  function pollWindow(matchDate) {
    return {
      opens_at: `${shiftDate(matchDate, -6)}T13:00:00+09:00`,
      closes_at: `${shiftDate(matchDate, -5)}T13:00:00+09:00`
    };
  }

  function pollStatus(poll, nowIso) {
    if (poll.cancelled) return "cancelled";
    const now = new Date(nowIso).getTime();
    if (now < new Date(poll.opens_at).getTime()) return "scheduled";
    // DB 트리거와 동일하게 마감 시각을 지난 투표부터 지각이다.
    return now > new Date(poll.closes_at).getTime() ? "closed" : "open";
  }

  function pollTitle(poll) {
    if (poll.title) return poll.title;
    const [, month, day] = poll.match_date.split("-").map(Number);
    const weekday = "일월화수목금토"[new Date(`${poll.match_date}T00:00:00Z`).getUTCDay()];
    return `${month}/${day}(${weekday}) 경기`;
  }

  // 정기 투표 = 토요일 경기. 제목은 붙여도 되며 분류에 영향을 주지 않는다.
  function isSpecialPoll(poll) {
    return new Date(`${poll.match_date}T00:00:00Z`).getUTCDay() !== 6;
  }

  function attendanceSummary(votes, members) {
    const byMember = new Map(votes.map((vote) => [vote.member_id, vote]));
    const summary = { attend: [], absent: [], pending: [] };
    for (const member of members.filter((item) => item.active)) {
      const choice = byMember.get(member.id)?.choice;
      summary[choice === "attend" || choice === "absent" ? choice : "pending"].push(member);
    }
    const count = summary.attend.length;
    return { ...summary, count, formats: {
      "5v5": { ok: count >= 5, rest: count >= 5 ? count - 5 : null },
      "6v6": { ok: count >= 6, rest: count >= 6 ? count - 6 : null }
    } };
  }

  function lateVoteRows(poll, votes, members, fine, entryDate) {
    if (poll.cancelled || poll.fines === false) return [];
    const byMember = new Map(votes.filter((vote) => vote.poll_id === poll.id)
      .map((vote) => [vote.member_id, vote]));
    return members.filter((member) => member.active &&
      (!byMember.has(member.id) || byMember.get(member.id).is_late === true)).map((member) => ({
      member_id: member.id,
      category: "fine_late_vote",
      amount: fine,
      ref_poll_id: poll.id,
      entry_date: entryDate,
      note: "투표 마감 미참여"
    }));
  }

  function monthlyDuesRows(members, monthStr, config) {
    const start = `${monthStr}-01`;
    const [year, month] = monthStr.split("-").map(Number);
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return members.filter((member) => member.active).flatMap((member) => {
      const common = { member_id: member.id, entry_date: start, period: monthStr };
      const rows = [{ ...common, category: "dues", amount: config.DUES_MONTHLY, note: `${month}월 회비` }];
      const { injury_from: from, injury_to: to } = member;
      // 시작일과 종료일을 모두 포함한 전체 부상 기간이 4주 이상이고 해당 월과 겹치면 면제한다.
      const days = (new Date(to) - new Date(from)) / DAY + 1;
      if (from && to && from <= end && to >= start && days >= 28) {
        rows.push({ ...common, category: "injury_exempt",
          amount: -config.DUES_MONTHLY * config.INJURY_EXEMPT_RATE,
          note: `부상 면제 ${config.INJURY_EXEMPT_RATE * 100}%` });
      }
      return rows;
    });
  }

  function formatRelative(isoOrDate, nowIso) {
    const delta = new Date(nowIso) - new Date(isoOrDate);
    const seconds = Math.floor(Math.abs(delta) / 1000);
    if (!Number.isFinite(seconds)) return "시간 미상";
    if (seconds < 60) return "방금";
    const [size, unit] = seconds < 3600 ? [60, "분"] : seconds < 86400 ? [3600, "시간"] : [86400, "일"];
    return `${Math.floor(seconds / size)}${unit} ${delta < 0 ? "후" : "전"}`;
  }

  // "10월 24일 토요일" — 투표 제목("10/24(토)")보다 한 단계 자세한 경기 날짜.
  function longDate(dateStr) {
    const [, month, day] = dateStr.split("-").map(Number);
    const weekday = "일월화수목금토"[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
    return `${month}월 ${day}일 ${weekday}요일`;
  }

  // 투표에 해당하는 확정 매치. 투표 id 연결을 우선하고, 없으면 같은 날짜의 예정 매치.
  function matchForPoll(poll, matches) {
    const scheduled = (matches || []).filter((row) => row.status === "scheduled");
    return scheduled.find((row) => row.poll_id === poll.id) || scheduled.find((row) => row.match_date === poll.match_date) || null;
  }

  // 투표 보드의 "경기 일시" 줄. 확정 매치가 있으면 시간·구장과 상대·포맷·구장비, 없으면 날짜와 미확정 표시.
  function pollMatchLine(poll, match) {
    if (!match) return { confirmed: false, title: `${longDate(poll.match_date)} · 매치 미확정`, sub: "매칭 탭에서 상대팀을 찾는 중입니다" };
    const time = match.start_time ? `${match.start_time.slice(0, 5)}${match.end_time ? "~" + match.end_time.slice(0, 5) : ""}` : "시간 미정";
    return {
      confirmed: true,
      title: `${longDate(match.match_date)} ${time} · ${match.venue || "구장 미정"}`,
      sub: `${match.opponent ? "상대 " + match.opponent : "상대 미정"} · ${match.format || "포맷 미정"} · 구장비 ${Number(match.cost || 0).toLocaleString("ko-KR")}원${match.memo ? " · " + match.memo : ""}`
    };
  }

  // 투표 삭제 확인 문구. 함께 지워지는 투표·벌금 기록 수와 연결만 풀리는 매치 수.
  function deleteSummary({ votes = 0, fines = 0, matches = 0 } = {}) {
    const parts = [`투표 기록 ${votes}건`];
    if (fines) parts.push(`벌금 기록 ${fines}건`);
    let text = `${parts.join("과 ")}이 함께 삭제되고 되돌릴 수 없습니다.`;
    if (matches) text += ` 연결된 매치 ${matches}건은 그대로 두고 투표 연결만 풉니다.`;
    return text;
  }

  // 마감(또는 경기)까지 남은 날짜 수. 같은 KST 날짜면 0.
  function daysUntil(targetIso, nowIso) {
    return Math.round((Date.parse(`${kstDate(targetIso)}T00:00:00Z`) - Date.parse(`${kstDate(nowIso)}T00:00:00Z`)) / DAY);
  }

  const rules = { kstDate, nextSaturday, pollWindow, pollStatus, pollTitle, isSpecialPoll, attendanceSummary, lateVoteRows, monthlyDuesRows, formatRelative, longDate, matchForPoll, pollMatchLine, deleteSummary, daysUntil };
  if (typeof window !== "undefined") window.ExicanRules = rules;
  if (typeof module !== "undefined" && module.exports) module.exports = rules;
})();
