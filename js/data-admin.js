(function () {
  const api = window.ExicanData;
  // 관리 화면의 장부 미리보기는 같은 문서의 데모 메모리를 사용한다.
  if (window.frameElement?.dataset.adminLedger === "true" && window.parent.ExicanData?.mode() === "demo") {
    Object.assign(api, window.parent.ExicanData);
    return;
  }
  const original = { ...api };
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const today = () => window.ExicanRules.kstDate(new Date());
  const past = (rows) => window.ExicanAttendance.shiftPastDemoDates(rows, today());
  let demoPromise;

  async function demoData() {
    if (!demoPromise) demoPromise = (async () => {
      // 공용 모듈의 배너는 유지하되 지난 투표를 미래로 치환하는 처리는 피한다.
      await original.members();
      const response = await fetch("test/fixtures/demo-data.json");
      if (!response.ok) throw new Error("관리 데모 데이터를 불러오지 못했습니다");
      const data = await response.json();
      const futurePolls = await original.upcomingPolls();
      const future = window.ExicanRules.nextSaturday(today());
      for (const match of data.matches) {
        match.match_date = match.status === "scheduled" ? future : past([match])[0].match_date;
      }
      for (const poll of data.polls) {
        const upcoming = futurePolls.find((row) => row.id === poll.id);
        if (upcoming) { Object.assign(poll, upcoming); continue; }
        const match = data.matches.find((row) => row.poll_id === poll.id);
        poll.match_date = match?.match_date || future;
        Object.assign(poll, window.ExicanRules.pollWindow(poll.match_date));
      }
      for (const vote of data.poll_votes) {
        const poll = data.polls.find((row) => row.id === vote.poll_id);
        const time = Date.parse(poll.closes_at) + (vote.is_late ? 1 : -1) * 3600000;
        vote.updated_at = new Date(vote.is_late ? time : Math.min(Date.now(), time)).toISOString();
      }
      data.match_attendance = data.match_attendance || [];
      data.rotation_history = data.rotation_history || [];
      return data;
    })().catch((error) => { demoPromise = null; throw error; });
    return demoPromise;
  }

  async function requireAdmin() {
    const allowed = api.mode() === "demo" ? (await members()).some((row) => row.id === window.ExicanMember.getId() && row.is_president) :
      await window.ExicanAuth.getRole() === "admin";
    if (!allowed) throw new Error("회장 로그인이 필요합니다");
  }

  async function live(operation) {
    const result = await operation(await window.ExicanAuth.init());
    if (result.error) throw Object.assign(new Error(result.error.message || "데이터 요청에 실패했습니다"), result.error, { status: result.status });
    return result.data;
  }

  async function allRows(table, filter, order = "id") {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await live((client) => filter(client.from(table).select("*")).order(order).range(offset, offset + 999));
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  }

  async function members({ activeOnly = true } = {}) {
    if (api.mode() !== "demo") return original.members({ activeOnly });
    return copy((await demoData()).members.filter((row) => !activeOnly || row.active).sort((a, b) => a.id.localeCompare(b.id)));
  }

  async function upsertMember(input) {
    await requireAdmin();
    const people = await members({ activeOnly: false });
    const existing = input.id && people.find((row) => row.id === input.id);
    if (input.id && !existing) throw new Error("멤버를 찾을 수 없습니다. 목록을 다시 불러오세요");
    const row = { ...existing };
    for (const key of ["name", "phone", "bank_account", "active", "is_president", "joined_at", "injury_from", "injury_to"]) {
      if (Object.hasOwnProperty.call(input, key)) row[key] = input[key];
    }
    row.name = String(row.name || "").trim();
    if (!row.name) throw new Error("이름을 입력하세요");
    if (people.some((person) => person.id !== row.id && person.name === row.name)) throw new Error("같은 이름의 멤버가 있습니다");
    if (row.injury_from && row.injury_to && row.injury_from > row.injury_to) throw new Error("부상 종료일을 확인하세요");
    if (!existing) {
      const max = Math.max(0, ...people.map((person) => /^m\d+$/.test(person.id) ? Number(person.id.slice(1)) : 0));
      row.id = `m${String(max + 1).padStart(2, "0")}`;
      row.active = input.active !== false;
      row.is_president = input.is_president === true;
    }
    if (api.mode() === "demo") {
      const data = await demoData();
      if (existing) Object.assign(data.members.find((person) => person.id === row.id), row);
      else data.members.push(row);
      return copy(row);
    }
    // 새 ID 경쟁 시 기존 사람을 덮어쓰지 않도록 신규는 insert로 충돌을 알린다.
    return live((client) => (existing ? client.from("members").upsert(row, { onConflict: "id" }) : client.from("members").insert(row)).select().single());
  }

  async function polls({ from, to } = {}) {
    const rows = api.mode() === "demo" ? (await demoData()).polls : await allRows("polls", (query) => {
      if (from) query = query.gte("match_date", from);
      if (to) query = query.lte("match_date", to);
      return query;
    });
    return copy(rows.filter((row) => (!from || row.match_date >= from) && (!to || row.match_date <= to)).sort((a, b) => b.match_date.localeCompare(a.match_date)));
  }

  async function upcomingPolls(now = new Date().toISOString()) {
    if (api.mode() !== "demo") return original.upcomingPolls(now);
    return (await polls({ from: window.ExicanRules.kstDate(now) })).filter((poll) => !poll.cancelled).reverse();
  }

  async function currentPoll(now = new Date().toISOString()) {
    return (await upcomingPolls(now))[0] || null;
  }

  async function createPoll(matchDate, { title = null, opens_at, closes_at, fines = true } = {}) {
    await requireAdmin();
    if (api.mode() !== "demo") return original.createPoll(matchDate, { title, opens_at, closes_at, fines });
    const data = await demoData();
    const defaults = window.ExicanRules.pollWindow(matchDate);
    const row = { id: `demo-poll-${matchDate}`, match_date: matchDate, title, fines,
      opens_at: opens_at === undefined ? defaults.opens_at : opens_at,
      closes_at: closes_at === undefined ? defaults.closes_at : closes_at, cancelled: false };
    const existing = data.polls.find((poll) => poll.match_date === matchDate);
    if (existing) {
      // 취소된 투표는 숨김 상태라 같은 날짜로 다시 만들면 새 옵션으로 되살린다(공용 모듈의 live 동작과 동일).
      if (!existing.cancelled) throw new Error("해당 날짜의 투표가 이미 있습니다");
      const { id, match_date, ...patch } = row;
      return copy(Object.assign(existing, patch));
    }
    data.polls.push(row);
    return copy(row);
  }

  async function cancelPoll(id, cancelled) {
    await requireAdmin();
    if (api.mode() !== "demo") return original.setPollCancelled(id, cancelled);
    const row = (await demoData()).polls.find((poll) => poll.id === id);
    if (!row) throw new Error("투표를 찾을 수 없습니다");
    row.cancelled = Boolean(cancelled);
    return copy(row);
  }

  async function votesByPolls(ids) {
    if (!ids.length) return [];
    if (api.mode() === "demo") return copy((await demoData()).poll_votes.filter((row) => ids.includes(row.poll_id)));
    return allRows("poll_votes", (query) => query.in("poll_id", ids).order("poll_id"), "member_id");
  }

  async function matches({ from } = {}) {
    if (api.mode() !== "demo") return original.matches({ from });
    return copy((await demoData()).matches.filter((row) => !from || row.match_date >= from)
      .sort((a, b) => `${a.match_date}${a.start_time}`.localeCompare(`${b.match_date}${b.start_time}`)));
  }

  async function updateMatch(id, input) {
    await requireAdmin();
    const row = (await matches()).find((match) => match.id === id);
    if (!row) throw new Error("매치를 찾을 수 없습니다");
    const patch = {};
    for (const key of ["status", "score_us", "score_them", "memo", "cost", "schedule"]) {
      if (Object.hasOwnProperty.call(input, key)) patch[key] = input[key];
    }
    const next = { ...row, ...patch };
    if (!Object.hasOwnProperty.call(window.ExicanAttendance.MATCH_LABELS, next.status)) throw new Error("매치 상태를 확인하세요");
    if (!Number.isInteger(next.cost) || next.cost < 0 || next.cost > 2147483647) throw new Error("구장비는 0 이상의 정수로 입력하세요");
    if (next.status === "played" && [next.score_us, next.score_them].some((score) => !Number.isInteger(score) || score < 0 || score > 2147483647)) {
      throw new Error("완료 경기의 스코어를 입력하세요");
    }
    if (api.mode() === "demo") {
      const match = (await demoData()).matches.find((item) => item.id === id);
      Object.assign(match, copy(patch));
      return copy(match);
    }
    return live((client) => client.from("matches").update(patch).eq("id", id).select().single());
  }

  async function attendance(matchId) {
    if (api.mode() === "demo") return copy((await demoData()).match_attendance.filter((row) => row.match_id === matchId));
    return allRows("match_attendance", (query) => query.eq("match_id", matchId), "member_id");
  }

  async function saveRows(table, matchId, rows) {
    await requireAdmin();
    if (!(await matches()).some((row) => row.id === matchId)) throw new Error("매치를 찾을 수 없습니다");
    const people = new Set((await members({ activeOnly: false })).map((row) => row.id));
    const seen = new Set();
    const clean = rows.map((row) => {
      if (!people.has(row.member_id) || seen.has(row.member_id)) throw new Error("멤버를 확인하세요");
      seen.add(row.member_id);
      if (table === "match_attendance") {
        if (!Object.hasOwnProperty.call(window.ExicanAttendance.ATTENDANCE_LABELS, row.status)) throw new Error("출석 상태를 확인하세요");
        return { match_id: matchId, member_id: row.member_id, status: row.status, note: row.note || null };
      }
      if ([row.active_quarters, row.gk_count, row.rest_count].some((n) => !Number.isInteger(n) || n < 0) ||
          !Array.isArray(row.out_quarters) || row.out_quarters.some((n) => !Number.isInteger(n) || n < 1)) throw new Error("배정 횟수를 확인하세요");
      return { match_id: matchId, member_id: row.member_id, active_quarters: row.active_quarters,
        gk_count: row.gk_count, rest_count: row.rest_count, out_quarters: [...row.out_quarters] };
    });
    if (!clean.length) return [];
    if (api.mode() === "demo") {
      const data = await demoData();
      for (const row of clean) {
        const previous = data[table].find((item) => item.match_id === matchId && item.member_id === row.member_id);
        if (previous) Object.assign(previous, row); else data[table].push(row);
      }
      return copy(clean);
    }
    return live((client) => client.from(table).upsert(clean, { onConflict: "match_id,member_id" }).select());
  }

  async function rotationHistory({ memberId, matchId } = {}) {
    if (api.mode() === "demo") return copy((await demoData()).rotation_history.filter((row) => (!memberId || row.member_id === memberId) && (!matchId || row.match_id === matchId)));
    return allRows("rotation_history", (query) => {
      if (memberId) query = query.eq("member_id", memberId);
      if (matchId) query = query.eq("match_id", matchId);
      return query.order("match_id");
    }, "member_id");
  }

  async function matchHistory({ limit = 30 } = {}) {
    const rows = (await matches()).filter((row) => ["played", "cancelled", "fallback_plab"].includes(row.status))
      .sort((a, b) => `${b.match_date}${b.start_time}`.localeCompare(`${a.match_date}${a.start_time}`)).slice(0, limit);
    return Promise.all(rows.map(async (row) => ({ ...row, attendance_count: (await attendance(row.id)).filter((item) => ["present", "late", "late_kickoff"].includes(item.status)).length })));
  }

  async function ledgerRange(options = {}) {
    if (api.mode() !== "demo") return original.ledgerRange(options);
    const data = await demoData();
    const fixtures = new Map(data.ledger.map((row) => [row.id, row]));
    const rows = (await original.ledgerRange()).map((row) => {
      if (!fixtures.has(row.id)) return row;
      const date = data.matches.find((match) => match.id === row.ref_match_id)?.match_date || `${today().slice(0, 7)}-${row.entry_date.slice(8)}`;
      return { ...row, entry_date: date, ...(row.period ? { period: date.slice(0, 7) } : {}) };
    });
    return rows.filter((row) => (!options.from || row.entry_date >= options.from) && (!options.to || row.entry_date <= options.to));
  }

  async function addLedger(row) {
    await requireAdmin();
    // 현재 스키마는 NULL member_id를 unique index에서 중복으로 보지 않는다.
    if (row.category === "venue_fee" && row.ref_match_id && (await api.ledgerRange()).some((item) => item.category === "venue_fee" && item.ref_match_id === row.ref_match_id)) {
      throw Object.assign(new Error("이미 처리됨"), { code: "23505" });
    }
    return original.addLedger(row);
  }

  const methods = { members, upsertMember, polls, upcomingPolls, currentPoll, createPoll, cancelPoll, setPollCancelled: cancelPoll, votesByPolls,
    votes: (id) => votesByPolls([id]), matches, updateMatch, attendance,
    saveAttendance: (id, rows) => saveRows("match_attendance", id, rows), rotationHistory,
    saveRotationHistory: (id, rows) => saveRows("rotation_history", id, rows), matchHistory };
  if (original.ledgerRange) Object.assign(methods, { ledgerRange, addLedger });
  Object.assign(api, Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, async (...args) => {
    try { return await method(...args); }
    catch (error) {
      if ([error.code, error.status, error.statusCode].some((code) => ["42501", "403"].includes(String(code)))) throw Object.assign(new Error("회장 로그인이 필요합니다"), { code: "42501" });
      if (String(error.code) === "23505") throw Object.assign(new Error("이미 처리됨"), { code: "23505" });
      throw error;
    }
  }])));
})();
