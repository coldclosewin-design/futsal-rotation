window.ExicanData = (() => {
  let demoPromise;
  const rules = window.ExicanRules;
  const copy = (value) => JSON.parse(JSON.stringify(value));

  function mode() {
    return !isConfigured(window.EXICAN_CONFIG) || new URLSearchParams(location.search).get("demo") === "1" ? "demo" : "live";
  }

  function showDemoBanner() {
    if (document.querySelector(".demo-banner")) return;
    const banner = document.createElement("div");
    banner.className = "auth-banner demo-banner";
    banner.setAttribute("role", "status");
    banner.textContent = "데모 데이터입니다 (저장되지 않음)";
    const anchor = document.querySelector(".authbar") || document.querySelector("nav.topnav");
    if (anchor) anchor.after(banner);
    else document.body.prepend(banner);
  }

  async function demoData() {
    showDemoBanner();
    if (!demoPromise) {
      demoPromise = (async () => {
        const response = await fetch("test/fixtures/demo-data.json");
        if (!response.ok) throw new Error(`데모 데이터를 불러오지 못했습니다 (${response.status})`);
        const data = await response.json();
        const today = rules.kstDate(new Date());
        const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
        const dateAfter = (days) => new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
        for (const poll of data.polls) {
          const match = data.matches?.find((row) => row.poll_id === poll.id);
          if (match && match.status !== "scheduled") {
            poll.match_date = dateAfter(-((weekday - 6 + 7) % 7 || 7));
            Object.assign(poll, rules.pollWindow(poll.match_date));
          } else if (rules.isSpecialPoll(poll)) {
            // 월요일 시작 달력의 다음 주 목요일. 정기 투표와 별개로 진행 중인 샘플이다.
            poll.match_date = dateAfter(10 - (weekday + 6) % 7);
            poll.opens_at = `${today}T00:00:00+09:00`;
            poll.closes_at = `${dateAfter(9 - (weekday + 6) % 7)}T13:00:00+09:00`;
          } else {
            poll.match_date = rules.nextSaturday(today);
            Object.assign(poll, rules.pollWindow(poll.match_date));
          }
        }
        for (const vote of data.poll_votes) {
          const poll = data.polls.find((item) => item.id === vote.poll_id);
          const time = Date.parse(poll.closes_at) + (vote.is_late ? 3600000 : -3600000);
          vote.updated_at = new Date(vote.is_late ? time : Math.min(Date.now(), time)).toISOString();
        }
        for (const table of ["match_candidates", "candidate_reactions", "matches", "ledger"]) data[table] = data[table] || [];
        return data;
      })().catch((error) => { demoPromise = null; throw error; });
    }
    return demoPromise;
  }

  async function live(query) {
    const client = await ExicanAuth.init();
    const result = await query(client);
    if (result.error) throw result.error;
    return result.data;
  }

  async function members({ activeOnly = true } = {}) {
    if (mode() === "demo") return copy((await demoData()).members.filter((member) => !activeOnly || member.active)
      .sort((a, b) => a.id.localeCompare(b.id)));
    return live((client) => {
      let query = client.from("members").select("*").order("id");
      if (activeOnly) query = query.eq("active", true);
      return query;
    });
  }

  async function upcomingPolls(nowIso = new Date().toISOString()) {
    const today = rules.kstDate(nowIso);
    if (mode() === "demo") return copy((await demoData()).polls.filter((poll) => poll.match_date >= today && !poll.cancelled)
      .sort((a, b) => a.match_date.localeCompare(b.match_date)));
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await live((client) => client.from("polls").select("*").gte("match_date", today)
        .eq("cancelled", false).order("match_date").range(offset, offset + 999));
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  }

  async function currentPoll(nowIso = new Date().toISOString()) {
    return (await upcomingPolls(nowIso))[0] || null;
  }

  async function votes(pollId) {
    if (mode() === "demo") return copy((await demoData()).poll_votes.filter((vote) => vote.poll_id === pollId));
    return live((client) => client.from("poll_votes").select("*").eq("poll_id", pollId).order("member_id"));
  }

  async function castVote(pollId, memberId, choice) {
    if (!["attend", "absent"].includes(choice)) throw new Error("참석 또는 불참을 선택하세요");
    const row = { poll_id: pollId, member_id: memberId, choice };
    if (mode() === "demo") {
      const data = await demoData();
      const poll = data.polls.find((item) => item.id === pollId);
      if (!poll || poll.cancelled) throw new Error("취소되었거나 존재하지 않는 투표입니다");
      if (!data.members.some((member) => member.id === memberId && member.active)) throw new Error("활동 멤버를 선택하세요");
      row.updated_at = new Date().toISOString();
      row.is_late = new Date(row.updated_at) > new Date(poll.closes_at);
      const previous = data.poll_votes.find((vote) => vote.poll_id === pollId && vote.member_id === memberId);
      if (previous) Object.assign(previous, row);
      else data.poll_votes.push(row);
      return copy(row);
    }
    // 지각 판정과 시각은 DB 트리거가 정한다. 서버가 반환한 결과를 화면에 사용한다.
    return live((client) => client.from("poll_votes").upsert(row, { onConflict: "poll_id,member_id" }).select().single());
  }

  async function requireAdmin() {
    if (mode() === "live" && await ExicanAuth.getRole() !== "admin") throw new Error("회장 로그인이 필요합니다");
  }

  async function createPoll(matchDate, { title = null, opens_at, closes_at, fines = true } = {}) {
    await requireAdmin();
    const defaults = rules.pollWindow(matchDate);
    const row = { match_date: matchDate, title, fines, opens_at: opens_at === undefined ? defaults.opens_at : opens_at,
      closes_at: closes_at === undefined ? defaults.closes_at : closes_at, cancelled: false };
    if (mode() === "demo") {
      const data = await demoData();
      if (data.polls.some((poll) => poll.match_date === matchDate)) throw new Error("해당 날짜의 투표가 이미 있습니다");
      row.id = `demo-poll-${matchDate}`;
      data.polls.push(row);
      return copy(row);
    }
    try { return await live((client) => client.from("polls").insert(row).select().single()); }
    catch (error) {
      if (error.code === "23505") throw new Error("해당 날짜의 투표가 이미 있습니다");
      throw error;
    }
  }

  async function setPollCancelled(pollId, cancelled) {
    await requireAdmin();
    if (mode() === "demo") {
      const poll = (await demoData()).polls.find((item) => item.id === pollId);
      if (!poll) throw new Error("투표를 찾을 수 없습니다");
      poll.cancelled = Boolean(cancelled);
      return copy(poll);
    }
    return live((client) => client.from("polls").update({ cancelled: Boolean(cancelled) }).eq("id", pollId).select().single());
  }

  async function candidates({ from, to, menuId, includeClosed = false, seenSince } = {}) {
    if (mode() === "demo") return copy((await demoData()).match_candidates.filter((row) =>
      (!from || row.parsed_date >= from) && (!to || row.parsed_date <= to) &&
      (!seenSince || !row.last_seen_at || !Number.isFinite(Date.parse(row.last_seen_at)) ||
        row.contact_status !== "new" || Date.parse(row.last_seen_at) >= Date.parse(seenSince)) &&
      (menuId === undefined || String(row.menu_id) === String(menuId)) && (includeClosed || !row.is_closed))
      .sort((a, b) => b.scraper_score - a.scraper_score));
    return live(async (client) => {
      let query = client.from("match_candidates").select("*").order("scraper_score", { ascending: false });
      if (from) query = query.gte("parsed_date", from);
      if (to) query = query.lte("parsed_date", to);
      if (seenSince) query = query.gte("last_seen_at", seenSince);
      if (menuId !== undefined) query = query.eq("menu_id", menuId);
      if (!includeClosed) query = query.eq("is_closed", false);
      if (!seenSince) return query;
      // 미분류 보충 조회에서도 연락한 글·수집 시각 없는 글의 만료 예외를 보존한다.
      let exceptions = client.from("match_candidates").select("*").is("parsed_date", null)
        .or(`and(contact_status.neq.new,last_seen_at.lt.${seenSince}),last_seen_at.is.null`);
      if (from) exceptions = exceptions.gte("parsed_date", from);
      if (to) exceptions = exceptions.lte("parsed_date", to);
      if (menuId !== undefined) exceptions = exceptions.eq("menu_id", menuId);
      if (!includeClosed) exceptions = exceptions.eq("is_closed", false);
      const [recent, retained] = await Promise.all([query, exceptions]);
      if (recent.error || retained.error) return { data: null, error: recent.error || retained.error };
      return { data: [...new Map(recent.data.concat(retained.data).map((row) => [row.article_id, row])).values()]
        .sort((a, b) => b.scraper_score - a.scraper_score), error: null };
    });
  }

  async function reactions(articleIds) {
    if (!articleIds.length) return [];
    if (mode() === "demo") return copy((await demoData()).candidate_reactions.filter((row) => articleIds.map(String).includes(String(row.article_id))));
    return live((client) => client.from("candidate_reactions").select("*").in("article_id", articleIds));
  }

  async function toggleReaction(articleId, memberId) {
    const row = { article_id: articleId, member_id: memberId };
    if (mode() === "demo") {
      const data = await demoData();
      const index = data.candidate_reactions.findIndex((item) => String(item.article_id) === String(articleId) && item.member_id === memberId);
      if (index >= 0) data.candidate_reactions.splice(index, 1);
      else data.candidate_reactions.push(row);
      return index < 0;
    }
    const existing = (await reactions([articleId])).some((item) => item.member_id === memberId);
    if (existing) {
      await live((client) => client.from("candidate_reactions").delete().eq("article_id", articleId).eq("member_id", memberId));
      return false;
    }
    // upsert(ON CONFLICT DO UPDATE)는 테이블 UPDATE 권한을 요구하는데 팀 계정에는 insert/delete만 있다. 단순 insert로 저장한다.
    try { await live((client) => client.from("candidate_reactions").insert(row)); }
    catch (error) {
      if (error.code !== "23505") throw error; // 다른 기기에서 이미 추천한 경우는 성공으로 본다.
    }
    return true;
  }

  async function updateCandidate(articleId, patch) {
    await requireAdmin();
    if (mode() === "demo") {
      const row = (await demoData()).match_candidates.find((item) => String(item.article_id) === String(articleId));
      if (!row) throw new Error("후보를 찾을 수 없습니다");
      Object.assign(row, copy(patch), { article_id: row.article_id });
      return copy(row);
    }
    return live((client) => client.from("match_candidates").update(patch).eq("article_id", articleId).select().single());
  }

  async function createMatch(row) {
    await requireAdmin();
    if (mode() === "demo") {
      const data = await demoData();
      if (data.matches.some((item) => item.match_date === row.match_date && item.start_time === row.start_time)) throw new Error("해당 시각의 매치가 이미 있습니다");
      const result = { ...copy(row), id: `demo-match-${data.matches.length + 1}` };
      data.matches.push(result);
      return copy(result);
    }
    return live((client) => client.from("matches").insert(row).select().single());
  }

  async function matches({ from } = {}) {
    if (mode() === "demo") return copy((await demoData()).matches.filter((row) => !from || row.match_date >= from)
      .sort((a, b) => `${a.match_date}${a.start_time}`.localeCompare(`${b.match_date}${b.start_time}`)));
    return live((client) => {
      let query = client.from("matches").select("*").order("match_date").order("start_time");
      if (from) query = query.gte("match_date", from);
      return query;
    });
  }

  async function ledger({ month } = {}) {
    if (mode() === "demo") return copy((await demoData()).ledger.filter((row) => !month || row.entry_date.startsWith(`${month}-`))
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date)));
    return live((client) => {
      let query = client.from("ledger").select("*").order("entry_date");
      if (month) {
        const [year, number] = month.split("-").map(Number);
        const nextMonth = new Date(Date.UTC(year, number, 1)).toISOString().slice(0, 10);
        query = query.gte("entry_date", `${month}-01`).lt("entry_date", nextMonth);
      }
      return query;
    });
  }

  const api = { members, upcomingPolls, currentPoll, votes, castVote, createPoll, setPollCancelled, candidates, reactions, toggleReaction, updateCandidate, createMatch, matches, ledger };
  return { mode, ...Object.fromEntries(Object.entries(api).map(([name, method]) => [name, async (...args) => {
    try { return await method(...args); }
    catch (error) { showToast(error.message || "데이터 요청에 실패했습니다"); throw error; }
  }])) };
})();
