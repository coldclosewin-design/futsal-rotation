(function () {
  const api = window.ExicanData;
  const rules = window.ExicanLedgerRules;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const today = () => window.ExicanRules.kstDate(new Date());
  let demoPromise;

  async function demoData() {
    if (!demoPromise) demoPromise = (async () => {
      const [ledger, response] = await Promise.all([api.ledger(), fetch("test/fixtures/demo-data.json")]);
      if (!response.ok) throw new Error("데모 간식 청구를 불러오지 못했습니다");
      const fixture = await response.json();
      return { ledger, snack_claims: fixture.snack_claims || [] };
    })().catch((error) => { demoPromise = null; throw error; });
    return demoPromise;
  }

  async function requireRole(admin) {
    if (api.mode() === "demo") {
      const member = (await api.members()).find((row) => row.id === window.ExicanMember.getId());
      if (!member || (admin && !member.is_president)) throw new Error(admin ? "회장 로그인이 필요합니다" : "내 이름을 선택하세요");
    } else {
      const role = await window.ExicanAuth.getRole();
      if (admin ? role !== "admin" : !["team", "admin"].includes(role)) {
        throw new Error(admin ? "회장 로그인이 필요합니다" : "팀 로그인이 필요합니다");
      }
    }
  }

  async function live(operation) {
    const client = await window.ExicanAuth.init();
    const result = await operation(client);
    if (result.error) {
      const error = Object.assign(new Error(result.error.message || "데이터 요청에 실패했습니다"), result.error);
      if (result.status) error.status = result.status;
      throw error;
    }
    return result.data;
  }

  // 전 기간 잔액이 Supabase 기본 1,000행 제한으로 잘리지 않게 모두 읽는다.
  async function allRows(table, filter) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await live((client) => filter(client.from(table).select("*")).order("id").range(offset, offset + 999));
      rows.push(...page);
      if (page.length < 1000) return rows;
    }
  }

  async function ledgerRange({ from, to } = {}) {
    if (api.mode() === "demo") return copy((await demoData()).ledger.filter((row) =>
      (!from || row.entry_date >= from) && (!to || row.entry_date <= to))
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.id - b.id));
    const rows = await allRows("ledger", (query) => {
      if (from) query = query.gte("entry_date", from);
      if (to) query = query.lte("entry_date", to);
      return query;
    });
    return rows.sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.id - b.id);
  }

  async function addLedger(input) {
    await requireRole(true);
    const row = { member_id: input.member_id || null, category: input.category, amount: Number(input.amount),
      entry_date: input.entry_date || today(), settled: input.settled === true,
      ref_match_id: input.ref_match_id || null, ref_poll_id: input.ref_poll_id || null,
      period: input.period || null, note: input.note || "" };
    if (!Object.prototype.hasOwnProperty.call(rules.CATEGORY_LABELS, row.category) ||
        !Number.isInteger(row.amount) || Math.abs(row.amount) > 2147483647 || row.amount === 0) {
      throw new Error("항목과 0이 아닌 정수 금액을 확인하세요");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.entry_date)) throw new Error("기록 날짜를 확인하세요");
    if (!["venue_fee", "deposit", "adjustment"].includes(row.category) && !row.member_id) throw new Error("대상 멤버를 선택하세요");
    if ((["dues", "deposit"].includes(row.category) || row.category.startsWith("fine_")) && row.amount < 0) throw new Error("회비·벌금·입금은 양수로 입력하세요");
    if (["injury_exempt", "president_exempt", "venue_fee", "snack", "plab_support"].includes(row.category) && row.amount > 0) {
      throw new Error("면제·지출·환급은 음수로 입력하세요");
    }
    if (["dues", "injury_exempt"].includes(row.category) || (row.category === "president_exempt" && !row.ref_match_id)) {
      if (row.period !== rules.monthOf(row.entry_date)) throw new Error("기록 월과 같은 period가 필요합니다");
    }
    if (row.category === "plab_support") {
      if (!rules.plabSupportAllowed(await ledgerRange(), row.member_id, rules.monthOf(row.entry_date))) {
        throw new Error("플랩 지원은 1인당 월 1회만 가능합니다");
      }
      row.period = rules.monthOf(row.entry_date);
    }
    if (api.mode() === "demo") {
      const data = await demoData();
      if (row.member_id && data.ledger.some((item) => item.member_id === row.member_id && item.category === row.category &&
          ["ref_poll_id", "ref_match_id", "period"].some((key) => row[key] != null && item[key] === row[key]))) {
        throw Object.assign(new Error("이미 처리됨"), { code: "23505" });
      }
      row.id = Math.max(0, ...data.ledger.map((item) => Number(item.id))) + 1;
      data.ledger.push(row);
      return copy(row);
    }
    return live((client) => client.from("ledger").insert(row).select().single());
  }

  async function setSettled(ids, settled) {
    await requireRole(true);
    if (!Array.isArray(ids) || typeof settled !== "boolean") throw new Error("정산 항목을 확인하세요");
    if (!ids.length) return [];
    if (api.mode() === "demo") {
      const rows = (await demoData()).ledger.filter((row) => ids.map(String).includes(String(row.id)));
      rows.forEach((row) => { row.settled = settled; });
      return copy(rows);
    }
    return live((client) => client.from("ledger").update({ settled }).in("id", ids).select());
  }

  async function snackClaims({ status } = {}) {
    if (api.mode() === "demo") return copy((await demoData()).snack_claims.filter((row) => !status || row.status === status));
    return allRows("snack_claims", (query) => status ? query.eq("status", status) : query);
  }

  async function submitSnackClaim({ match_id, amount, items }) {
    await requireRole(false);
    const buyer_id = window.ExicanMember.getId();
    if (!(await api.members()).some((member) => member.id === buyer_id)) throw new Error("내 이름을 선택하세요");
    if (!match_id) throw new Error("매치를 선택하세요");
    if (!Number.isInteger(Number(amount)) || Number(amount) <= 0 || Number(amount) > 2147483647) throw new Error("청구 금액은 양의 정수로 입력하세요");
    if (typeof items !== "string" || !items.trim()) throw new Error("구매 품목을 입력하세요");
    const row = { match_id, buyer_id, amount: Number(amount), items: items.trim(), status: "pending" };
    if (api.mode() === "demo") {
      const data = await demoData();
      row.id = Math.max(0, ...data.snack_claims.map((item) => Number(item.id))) + 1;
      row.created_at = new Date().toISOString();
      data.snack_claims.push(row);
      return copy(row);
    }
    return live((client) => client.from("snack_claims").insert(row).select().single());
  }

  async function reviewSnackClaim(id, status) {
    await requireRole(true);
    if (!["approved", "rejected"].includes(status)) throw new Error("승인 또는 거절을 선택하세요");
    const claim = (await snackClaims()).find((row) => String(row.id) === String(id));
    if (!claim) throw new Error("간식 청구를 찾을 수 없습니다");
    if (claim.status !== "pending" && claim.status !== status) throw new Error("이미 처리된 청구의 상태는 변경할 수 없습니다");
    if (status === "approved") {
      const exists = (await ledgerRange()).some((row) => row.category === "snack" && row.member_id === claim.buyer_id && row.ref_match_id === claim.match_id);
      if (!exists) {
        try { await addLedger(rules.snackLedgerRow(claim)); }
        catch (error) { if (String(error.code) !== "23505") throw error; }
      }
    }
    // 장부 반영 성공 후 승인한다. 상태 저장 실패 후 재시도해도 환급 행은 중복되지 않는다.
    if (api.mode() === "demo") {
      const row = (await demoData()).snack_claims.find((item) => String(item.id) === String(id));
      row.status = status;
      return copy(row);
    }
    return live((client) => client.from("snack_claims").update({ status }).eq("id", id).select().single());
  }

  async function ledgerMatches({ from, to } = {}) {
    const matches = await api.matches({ from });
    if (api.mode() === "demo") {
      // 006의 matches 픽스처를 건드리지 않고 장부에 이미 참조된 데모 경기만 보충한다.
      for (const row of await ledgerRange()) {
        if (row.ref_match_id && !matches.some((match) => match.id === row.ref_match_id)) {
          matches.push({ id: row.ref_match_id, match_date: row.entry_date, start_time: "08:00", venue: "데모 경기" });
        }
      }
    }
    return matches.filter((match) => (!from || match.match_date >= from) && (!to || match.match_date <= to))
      .sort((a, b) => b.match_date.localeCompare(a.match_date));
  }

  const methods = { ledgerRange, addLedger, setSettled, snackClaims, submitSnackClaim, reviewSnackClaim, ledgerMatches };
  Object.assign(window.ExicanData, Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, async (...args) => {
    try { return await method(...args); }
    catch (error) {
      const code = String(error.code || error.status || error.statusCode || "");
      if ([error.code, error.status, error.statusCode].some((value) => ["42501", "403"].includes(String(value)))) {
        throw Object.assign(new Error("회장 로그인이 필요합니다"), { code });
      }
      if (code === "23505") throw Object.assign(new Error("이미 처리됨"), { code });
      throw error;
    }
  }])));
})();
