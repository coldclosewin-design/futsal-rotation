const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const rules = require("../js/ledger-rules.js");
const commonRules = require("../js/rules.js");
const config = require("../js/config.js");
const fixture = require("./fixtures/demo-data.json");
const clone = (value) => JSON.parse(JSON.stringify(value));
const match = { id: "test-match", match_date: "2026-10-10" };

test("장부 카테고리 12개와 한글 레이블", () => {
  assert.deepEqual(Object.values(rules.CATEGORY_LABELS), ["회비", "부상 면제", "회장 면제", "미투표 벌금", "급불참 벌금", "지각 벌금", "경기 후 도착 벌금", "구장비", "간식", "플랩 지원", "입금", "조정"]);
});

test("monthOf는 날짜에서 연월을 추출한다", () => {
  assert.equal(rules.monthOf("2026-10-01"), "2026-10");
  assert.equal(rules.monthOf("2027-01-31"), "2027-01");
});

test("개인 회비와 벌금 미납 합계", () => {
  assert.deepEqual(rules.memberSummary(fixture.ledger, "m05", "2026-10"), {
    due: 30000, fine: 5000, exempt: 0, refund: 0, settled: 0, outstanding: 35000
  });
});

test("납부 후 부상 면제는 음수 미정산이고 환급 열에 중복 포함하지 않는다", () => {
  assert.deepEqual(rules.memberSummary(fixture.ledger, "m07", "2026-10"), {
    due: 30000, fine: 0, exempt: -15000, refund: 0, settled: 30000, outstanding: -15000
  });
});

test("간식·플랩·음수 조정은 환급에 포함하고 정산 금액에도 부호를 유지한다", () => {
  const rows = [
    { category: "snack", amount: -8000, settled: false },
    { category: "plab_support", amount: -12000, settled: true },
    { category: "adjustment", amount: -5000, settled: false },
    { category: "president_exempt", amount: -7500, settled: false }
  ].map((row) => ({ member_id: "m01", entry_date: "2026-10-10", ...row }));
  assert.deepEqual(rules.memberSummary(rows, "m01", "2026-10"), {
    due: 0, fine: 0, exempt: -7500, refund: -25000, settled: -12000, outstanding: -20500
  });
});

test("다른 월·멤버와 빈 장부는 개인 요약에 포함하지 않는다", () => {
  const empty = { due: 0, fine: 0, exempt: 0, refund: 0, settled: 0, outstanding: 0 };
  assert.deepEqual(rules.memberSummary(fixture.ledger, "m01", "2026-11"), empty);
  assert.deepEqual(rules.memberSummary(fixture.ledger, "unknown", "2026-10"), empty);
  assert.deepEqual(rules.memberSummary([], "m01", "2026-10"), empty);
});

test("데모 팀 잔액 180,000원, 미납 4명 135,000원 및 월별 수입·지출", () => {
  assert.equal(fixture.ledger.filter((row) => row.category === "dues").length, 12);
  assert.equal(fixture.ledger.filter((row) => row.category === "dues" && row.settled).length, 8);
  assert.deepEqual(rules.teamSummary(fixture.ledger, "2026-10"), {
    income: 375000, expense: 90500, balance: 180000,
    unpaidMembers: [{ member_id: "m05", outstanding: 35000 }, { member_id: "m09", outstanding: 40000 },
      { member_id: "m10", outstanding: 30000 }, { member_id: "m12", outstanding: 30000 }]
  });
});

test("잔액은 전 기간 정산 행과 팀 행을 중복 없이 합산한다", () => {
  const rows = [
    { entry_date: "2026-09-01", member_id: "m01", category: "dues", amount: 30000, settled: true },
    { entry_date: "2026-09-01", member_id: null, category: "venue_fee", amount: -10000, settled: true },
    { entry_date: "2026-10-01", member_id: null, category: "venue_fee", amount: -5000, settled: false },
    { entry_date: "2026-10-01", member_id: "m02", category: "dues", amount: 30000, settled: false }
  ];
  assert.deepEqual(rules.teamSummary(rows, "2026-10"), {
    income: 30000, expense: 5000, balance: 15000, unpaidMembers: [{ member_id: "m02", outstanding: 30000 }]
  });
  assert.equal(rules.teamSummary(rows, "2027-01").balance, 15000);
  assert.deepEqual(rules.teamSummary([], "2026-10"), { income: 0, expense: 0, balance: 0, unpaidMembers: [] });
});

test("미납은 개인별 상계 후 양수만 세며 다른 사람의 환급으로 차감하지 않는다", () => {
  const rows = [
    { member_id: "m01", category: "dues", amount: 30000 },
    { member_id: "m01", category: "injury_exempt", amount: -15000 },
    { member_id: "m02", category: "snack", amount: -8000 },
    { member_id: "m03", category: "dues", amount: 30000 },
    { member_id: "m03", category: "adjustment", amount: -30000 }
  ].map((row) => ({ ...row, entry_date: "2026-10-01", settled: false }));
  assert.deepEqual(rules.teamSummary(rows, "2026-10").unpaidMembers, [{ member_id: "m01", outstanding: 15000 }]);
});

for (const [kind, key] of [["no_show", "NO_SHOW"], ["late", "LATE"], ["late_kickoff", "LATE_KICKOFF"]]) {
  test(`fineRow ${kind}는 전달한 설정 금액과 매치를 사용한다`, () => {
    const custom = { FINES: { [key]: 12345 } };
    assert.deepEqual(rules.fineRow(kind, "m01", match, custom), {
      member_id: "m01", category: `fine_${kind}`, amount: 12345,
      ref_match_id: match.id, entry_date: match.match_date, note: rules.CATEGORY_LABELS[`fine_${kind}`]
    });
  });
}

test("지원하지 않는 벌금은 거절한다", () => assert.throws(() => rules.fineRow("invalid", "m01", match, config), /벌금/));

test("주간 회장 면제는 4로 나눈 금액을 반올림하고 매치로 중복을 막는다", () => {
  assert.deepEqual(rules.presidentExemptRow(match, "m03", { DUES_MONTHLY: 30002, PRESIDENT_EXEMPT_MODE: "week" }), {
    member_id: "m03", category: "president_exempt", amount: -7501, ref_match_id: match.id, entry_date: match.match_date
  });
});

test("월간 회장 면제는 전액이며 period가 있고 매치 참조는 없다", () => {
  assert.deepEqual(rules.presidentExemptRow(match, "m03", { ...config, PRESIDENT_EXEMPT_MODE: "month" }), {
    member_id: "m03", category: "president_exempt", amount: -30000, ref_match_id: null, period: "2026-10", entry_date: match.match_date
  });
});

test("간식 행은 구매자에게 돌려줄 음수 미정산 환급이다", () => {
  assert.deepEqual(rules.snackLedgerRow(fixture.snack_claims[1]), {
    member_id: "m02", category: "snack", amount: -9000, ref_match_id: "demo-ledger-match-1", settled: false, note: "물2 음료2"
  });
});

test("플랩은 정산 여부와 관계없이 개인별 월 1회이고 다른 월·멤버는 허용한다", () => {
  const rows = [{ member_id: "m01", entry_date: "2026-10-31", category: "plab_support", amount: -10000, settled: true }];
  assert.equal(rules.plabSupportAllowed(rows, "m01", "2026-10"), false);
  assert.equal(rules.plabSupportAllowed(rows, "m01", "2026-11"), true);
  assert.equal(rules.plabSupportAllowed(rows, "m02", "2026-10"), true);
});

test("요약 계산은 입력 데이터를 변경하지 않는다", () => {
  const rows = clone(fixture.ledger);
  const before = clone(rows);
  rules.memberSummary(rows, "m01", "2026-10");
  rules.teamSummary(rows, "2026-10");
  assert.deepEqual(rows, before);
});

function loadScript(context, file) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), context, { filename: file });
}

function demoHarness(memberId = "m03") {
  const state = { memberId };
  const context = vm.createContext({ URLSearchParams, location: { search: "?demo=1" },
    isConfigured: () => false, showToast: () => {}, document: { querySelector: () => ({}) },
    fetch: async () => ({ ok: true, json: async () => clone(fixture) }) });
  context.window = context;
  context.ExicanRules = commonRules;
  context.ExicanLedgerRules = rules;
  context.ExicanMember = { getId: () => state.memberId };
  context.ExicanAuth = { getRole: async () => { throw new Error("데모에서는 인증하지 않음"); } };
  loadScript(context, "data.js");
  loadScript(context, "data-ledger.js");
  return { api: context.ExicanData, state };
}

test("브라우저 전역 export가 Node 순수 함수와 같은 결과를 낸다", () => {
  const context = vm.createContext({ window: {} });
  loadScript(context, "ledger-rules.js");
  assert.deepEqual(clone(context.window.ExicanLedgerRules.teamSummary(fixture.ledger, "2026-10")), rules.teamSummary(fixture.ledger, "2026-10"));
});

test("실제 공용 데모 로더를 확장하며 기간 경계와 사본을 유지한다", async () => {
  const { api } = demoHarness();
  assert.equal(typeof api.castVote, "function");
  const rows = await api.ledgerRange({ from: "2026-10-10", to: "2026-10-10" });
  assert.equal(rows.length, 3);
  rows[0].amount = 999;
  assert.equal((await api.ledgerRange()).find((row) => row.id === rows[0].id).amount, 10000);
});

test("데모 선택 정산은 미납과 잔액을 갱신하고 해제할 수 있다", async () => {
  const { api } = demoHarness();
  await api.setSettled([5, 14], true);
  const after = rules.teamSummary(await api.ledgerRange(), "2026-10");
  assert.equal(after.balance, 215000);
  assert.equal(after.unpaidMembers.length, 3);
  assert.equal(after.unpaidMembers.reduce((sum, row) => sum + row.outstanding, 0), 100000);
  await api.setSettled([5, 14], false);
  assert.equal(rules.teamSummary(await api.ledgerRange(), "2026-10").balance, 180000);
});

test("데모 팀원은 관리 쓰기를 할 수 없지만 내 이름으로 간식 청구를 제출한다", async () => {
  const { api } = demoHarness("m01");
  await assert.rejects(api.addLedger(rules.fineRow("late", "m01", match, config)), /회장 로그인/);
  await assert.rejects(api.setSettled([1], true), /회장 로그인/);
  await assert.rejects(api.reviewSnackClaim(2, "approved"), /회장 로그인/);
  const claim = await api.submitSnackClaim({ match_id: match.id, amount: 4500, items: " 물1 ", buyer_id: "m02" });
  assert.equal(claim.buyer_id, "m01");
  assert.equal(claim.status, "pending");
  assert.equal(claim.id, 3);
  assert.equal(claim.items, "물1");
  assert.equal((await api.snackClaims({ status: "pending" })).length, 2);
});

test("청구의 이름·매치·금액·품목은 필수이며 음수·소수 청구는 거절한다", async () => {
  const { api, state } = demoHarness("m01");
  for (const patch of [{ match_id: null }, { amount: -1 }, { amount: 1.5 }, { amount: 2147483648 }, { items: "  " }]) {
    await assert.rejects(api.submitSnackClaim({ match_id: match.id, amount: 1000, items: "물", ...patch }));
  }
  state.memberId = null;
  await assert.rejects(api.submitSnackClaim({ match_id: match.id, amount: 1000, items: "물" }), /이름/);
});

test("간식 승인 재시도와 동시 승인은 환급 행을 한 번만 추가한다", async () => {
  const { api } = demoHarness();
  await Promise.all([api.reviewSnackClaim(2, "approved"), api.reviewSnackClaim(2, "approved")]);
  await api.reviewSnackClaim(2, "approved");
  const rows = (await api.ledgerRange()).filter((row) => row.member_id === "m02" && row.category === "snack");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, -9000);
  assert.equal(rows[0].settled, false);
  assert.equal((await api.snackClaims()).find((row) => row.id === 2).status, "approved");
  await assert.rejects(api.reviewSnackClaim(2, "rejected"), /이미 처리/);
});

test("간식 거절은 장부를 추가하지 않는다", async () => {
  const { api } = demoHarness();
  await api.reviewSnackClaim(2, "rejected");
  assert.equal((await api.ledgerRange()).length, fixture.ledger.length);
  assert.equal((await api.snackClaims({ status: "rejected" })).length, 1);
  await assert.rejects(api.reviewSnackClaim(2, "approved"), /이미 처리/);
});

test("추가 기록 id는 증가하고 매치·period 중복은 23505로 거절한다", async () => {
  const { api } = demoHarness();
  const row = rules.fineRow("late", "m01", match, config);
  assert.equal((await api.addLedger(row)).id, 19);
  await assert.rejects(api.addLedger(row), (error) => error.code === "23505" && error.message === "이미 처리됨");
  const exempt = rules.presidentExemptRow(match, "m03", { ...config, PRESIDENT_EXEMPT_MODE: "month" });
  await api.addLedger(exempt);
  await assert.rejects(api.addLedger({ ...exempt, entry_date: "2026-10-24" }), (error) => error.code === "23505");
});

test("플랩 월 1회 제한은 데이터 함수에서도 검사하고 period를 채운다", async () => {
  const { api } = demoHarness();
  const row = { member_id: "m01", category: "plab_support", amount: -10000, entry_date: "2026-10-01" };
  assert.equal((await api.addLedger(row)).period, "2026-10");
  await assert.rejects(api.addLedger({ ...row, entry_date: "2026-10-31" }), /월 1회/);
  await api.addLedger({ ...row, entry_date: "2026-11-01" });
});

test("추가 기록은 잘못된 부호·금액·필수 멤버·period를 거절한다", async () => {
  const { api } = demoHarness();
  for (const row of [
    { category: "fine_late", member_id: "m01", amount: -1000 },
    { category: "venue_fee", amount: 1000 },
    { category: "deposit", amount: -1000 },
    { category: "snack", amount: -1000 },
    { category: "adjustment", amount: 0 },
    { category: "adjustment", amount: 1.5 },
    { category: "adjustment", amount: 2147483648 },
    { category: "dues", member_id: "m01", amount: 30000 }
  ]) await assert.rejects(api.addLedger(row));
});

test("장부 참조로 보충한 데모 매치는 기간을 제한하고 원래 matches를 바꾸지 않는다", async () => {
  const { api } = demoHarness();
  assert.equal((await api.ledgerMatches({ from: "2026-10-10", to: "2026-10-15" })).length, 1);
  assert.deepEqual(clone(await api.matches()), fixture.matches);
});

function liveHarness(respond, role = "admin") {
  const calls = [];
  const client = { from(table) {
    const call = { table, steps: [] };
    const query = { then(resolve, reject) { calls.push(call); return Promise.resolve().then(() => respond(call)).then(resolve, reject); } };
    for (const method of ["select", "order", "range", "gte", "lte", "eq", "in", "insert", "update", "single"]) {
      query[method] = (...args) => { call.steps.push([method, ...args]); return query; };
    }
    return query;
  } };
  const context = vm.createContext({});
  context.window = context;
  context.ExicanRules = commonRules;
  context.ExicanLedgerRules = rules;
  context.ExicanMember = { getId: () => "m01" };
  context.ExicanAuth = { init: async () => client, getRole: async () => role };
  context.ExicanData = { mode: () => "live", members: async () => fixture.members, matches: async () => [] };
  loadScript(context, "data-ledger.js");
  return { api: context.ExicanData, calls };
}

test("live 기간 조회는 gte/lte, 전 기간 조회는 1000행 제한 다음 페이지까지 읽는다", async () => {
  const { api, calls } = liveHarness((call) => {
    const offset = call.steps.find((step) => step[0] === "range")[1];
    return { data: offset === 0 ? Array.from({ length: 1000 }, (_, id) => ({ id, entry_date: "2026-10-01" })) : [{ id: 1000, entry_date: "2026-10-31" }] };
  });
  assert.equal((await api.ledgerRange({ from: "2026-10-01", to: "2026-10-31" })).length, 1001);
  assert.deepEqual(clone(calls[0].steps), [["select", "*"], ["gte", "entry_date", "2026-10-01"], ["lte", "entry_date", "2026-10-31"], ["order", "id"], ["range", 0, 999]]);
  assert.deepEqual(clone(calls[1].steps.at(-1)), ["range", 1000, 1999]);
});

test("live 정산은 update와 in을 사용하고 팀 세션 관리 쓰기는 요청 전에 거절한다", async () => {
  const { api, calls } = liveHarness(() => ({ data: [] }));
  await api.setSettled([5, 14], true);
  assert.deepEqual(clone(calls[0].steps), [["update", { settled: true }], ["in", "id", [5, 14]], ["select"]]);
  const team = liveHarness(() => { throw new Error("호출되면 안 됨"); }, "team");
  await assert.rejects(team.api.setSettled([1], true), /회장 로그인/);
  await assert.rejects(team.api.addLedger({ category: "adjustment", amount: 1000 }), /회장 로그인/);
  await assert.rejects(team.api.reviewSnackClaim(2, "approved"), /회장 로그인/);
  assert.equal(team.calls.length, 0);
});

for (const failure of [{ code: "42501" }, { status: 403 }, { code: "PGRST301", status: 403 }]) test(`RLS 거부 ${JSON.stringify(failure)}는 회장 로그인 안내`, async () => {
  const { api } = liveHarness(() => ({ error: failure }));
  await assert.rejects(api.setSettled([1], true), /회장 로그인이 필요합니다/);
});

test("live 팀원 청구는 본인 id와 pending만 insert한다", async () => {
  const { api, calls } = liveHarness((call) => ({ data: call.steps.find((step) => step[0] === "insert")[1] }), "team");
  await api.submitSnackClaim({ match_id: match.id, amount: 1000, items: "물", buyer_id: "m02", status: "approved" });
  assert.deepEqual(clone(calls[0].steps[0]), ["insert", { match_id: match.id, buyer_id: "m01", amount: 1000, items: "물", status: "pending" }]);
});

test("응답 최상위 HTTP 403도 회장 로그인 안내로 변환한다", async () => {
  const { api } = liveHarness(() => ({ status: 403, error: { code: "PGRST301", message: "Forbidden" } }));
  await assert.rejects(api.setSettled([1], true), /회장 로그인이 필요합니다/);
});

test("승인 장부 insert 실패 시 청구를 승인하지 않는다", async () => {
  const { api, calls } = liveHarness((call) => {
    if (call.table === "snack_claims") return { data: [fixture.snack_claims[1]] };
    if (call.steps.some((step) => step[0] === "insert")) return { error: { code: "42501" } };
    return { data: [] };
  });
  await assert.rejects(api.reviewSnackClaim(2, "approved"), /회장 로그인/);
  assert.equal(calls.some((call) => call.steps.some((step) => step[0] === "update")), false);
});

test("동시 승인에서 장부 23505는 무시하고 승인 상태 저장을 계속한다", async () => {
  const { api, calls } = liveHarness((call) => {
    if (call.steps.some((step) => step[0] === "update")) return { data: { ...fixture.snack_claims[1], status: "approved" } };
    if (call.table === "snack_claims") return { data: [fixture.snack_claims[1]] };
    if (call.steps.some((step) => step[0] === "insert")) return { error: { code: "23505" } };
    return { data: [] };
  });
  assert.equal((await api.reviewSnackClaim(2, "approved")).status, "approved");
  assert.ok(calls.at(-1).steps.some((step) => step[0] === "update" && step[1].status === "approved"));
});

test("상태 저장 실패 후 재승인은 기존 환급 행을 재사용한다", async () => {
  let inserted = null;
  let updates = 0;
  const { api, calls } = liveHarness((call) => {
    const insert = call.steps.find((step) => step[0] === "insert");
    if (insert) { inserted = insert[1]; return { data: inserted }; }
    if (call.steps.some((step) => step[0] === "update")) return ++updates === 1 ? { error: new Error("네트워크 오류") } : { data: { ...fixture.snack_claims[1], status: "approved" } };
    return { data: call.table === "snack_claims" ? [fixture.snack_claims[1]] : inserted ? [inserted] : [] };
  });
  await assert.rejects(api.reviewSnackClaim(2, "approved"), /네트워크/);
  await api.reviewSnackClaim(2, "approved");
  assert.equal(calls.filter((call) => call.steps.some((step) => step[0] === "insert")).length, 1);
});
