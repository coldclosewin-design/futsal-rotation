(function () {
  const DAY = 86400000;
  const ATTENDANCE_LABELS = { present: "출석", late: "지각", late_kickoff: "경기 후 도착", no_show: "급불참", excused: "사유 불참" };
  const MATCH_LABELS = { scheduled: "예정", played: "경기 완료", cancelled: "취소", fallback_plab: "플랩 전환" };
  const attended = (status) => ["present", "late", "late_kickoff"].includes(status);
  const dateAfter = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

  function attendanceFines(match, attendance, votes, config) {
    const voters = new Set(votes.filter((vote) => vote.poll_id === match.poll_id && vote.choice === "attend").map((vote) => vote.member_id));
    const keys = { late: "LATE", late_kickoff: "LATE_KICKOFF", no_show: "NO_SHOW" };
    return attendance.filter((row) => (!row.match_id || row.match_id === match.id) &&
      Object.hasOwnProperty.call(keys, row.status) && (row.status !== "no_show" || voters.has(row.member_id)))
      .map((row) => ({ member_id: row.member_id, category: `fine_${row.status}`, amount: config.FINES[keys[row.status]],
        ref_match_id: match.id, entry_date: match.match_date, note: `${match.match_date} 경기 ${ATTENDANCE_LABELS[row.status]}` }));
  }

  // polls에는 연결된 매치의 match_id, status, match_date를 합쳐 전달한다.
  // polled는 집계 대상 완료 경기 수다. votes와 별개로 실제 출석을 집계한다.
  function attendanceRate(polls, votes, attendance, memberId, weeks = 12, todayKst = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)) {
    const from = dateAfter(todayKst, -Math.max(0, weeks) * 7);
    const eligible = polls.filter((poll) => poll.status === "played" && poll.match_date >= from && poll.match_date <= todayKst);
    const ids = new Set(eligible.map((poll) => poll.match_id || poll.id));
    const completed = new Set(attendance.filter((row) => ids.has(row.match_id) && row.member_id === memberId && attended(row.status)).map((row) => row.match_id));
    return { polled: ids.size, attended: completed.size, rate: ids.size ? completed.size / ids.size : null };
  }

  function rotationTotals(history, memberId) {
    const rows = history.filter((row) => row.member_id === memberId);
    return { matches: new Set(rows.map((row) => row.match_id)).size,
      gk: rows.reduce((sum, row) => sum + (Number(row.gk_count) || 0), 0),
      rest: rows.reduce((sum, row) => sum + (Number(row.rest_count) || 0), 0),
      outQuarters: rows.reduce((sum, row) => sum + (row.out_quarters || []).length, 0) };
  }

  function rosterFromVotes(votes, members) {
    const ids = new Set(votes.filter((vote) => vote.choice === "attend").map((vote) => vote.member_id));
    return members.filter((member) => member.active && ids.has(member.id)).slice().sort((a, b) => a.id.localeCompare(b.id)).map((member) => member.name);
  }

  function shiftPastDemoDates(rows, todayKst) {
    const today = new Date(`${todayKst}T00:00:00Z`).getUTCDay();
    return rows.map((row) => {
      const key = Object.hasOwnProperty.call(row, "match_date") ? "match_date" : "parsed_date";
      if (!row[key]) return { ...row };
      const day = new Date(`${row[key]}T00:00:00Z`).getUTCDay();
      if (!Number.isFinite(day)) return { ...row };
      return { ...row, [key]: dateAfter(todayKst, -((today - day + 7) % 7 || 7)) };
    });
  }

  function rotationRows(schedule, players, members) {
    return players.map((name) => {
      const matches = members.filter((member) => member.name === name);
      if (matches.length !== 1) throw new Error(`${name}: 멤버 이름을 정확히 연결할 수 없습니다`);
      const active = schedule.filter((quarter) => quarter.gk === name || quarter.rest.includes(name) || quarter.field.includes(name));
      const out = active.filter((quarter) => quarter.gk === name || quarter.rest.includes(name)).map((quarter) => quarter.quarter);
      return { member_id: matches[0].id, active_quarters: active.length,
        gk_count: schedule.filter((quarter) => quarter.gk === name).length,
        rest_count: schedule.filter((quarter) => quarter.rest.includes(name)).length, out_quarters: out };
    });
  }

  const api = { ATTENDANCE_LABELS, MATCH_LABELS, attendanceFines, attendanceRate, rotationTotals, rosterFromVotes, shiftPastDemoDates, rotationRows };
  if (typeof window !== "undefined") window.ExicanAttendance = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
