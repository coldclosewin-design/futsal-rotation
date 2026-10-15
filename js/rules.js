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

  function isSpecialPoll(poll) {
    return Boolean(poll.title) || new Date(`${poll.match_date}T00:00:00Z`).getUTCDay() !== 6;
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

  const rules = { kstDate, nextSaturday, pollWindow, pollStatus, pollTitle, isSpecialPoll, attendanceSummary, lateVoteRows, monthlyDuesRows, formatRelative };
  if (typeof window !== "undefined") window.ExicanRules = rules;
  if (typeof module !== "undefined" && module.exports) module.exports = rules;
})();
