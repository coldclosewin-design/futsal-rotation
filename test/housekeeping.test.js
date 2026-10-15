const { test } = require("node:test");
const assert = require("node:assert/strict");
const { main } = require("../scripts/housekeeping.js");
const { createRest, redact } = require("../scripts/lib/rest.js");
const { lateVoteRows, monthlyDuesRows, pollWindow } = require("../js/rules.js");
const config = require("../js/config.js");
const fixture = require("./fixtures/demo-data.json");
const env = { SUPABASE_URL: "https://example.invalid/", SUPABASE_SERVICE_ROLE_KEY: "test-only-service-key" };

function harness({ now = "2026-10-11T13:00:00+09:00", polls = [], members = fixture.members, votes = fixture.poll_votes } = {}) {
  const calls = [];
  const logs = [];
  const errors = [];
  const fetchImpl = async (url, options) => {
    const endpoint = new URL(url);
    const table = endpoint.pathname.split("/").pop();
    calls.push({ endpoint, table, ...options, rows: options.body ? JSON.parse(options.body) : null });
    assert.equal(options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(options.headers.Authorization, `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
    if (options.method !== "GET") return { ok: true, status: 201 };
    let rows = [];
    if (table === "members") rows = members.filter((member) => member.active);
    if (table === "polls") {
      const date = endpoint.searchParams.get("match_date");
      rows = date ? polls.filter((poll) => poll.match_date === date.slice(3)) : polls.filter((poll) =>
        !poll.cancelled && new Date(poll.closes_at) < new Date(now) && new Date(poll.closes_at) >= new Date(new Date(now).getTime() - 14 * 86400000));
    }
    if (table === "poll_votes") rows = votes.filter((vote) => `eq.${vote.poll_id}` === endpoint.searchParams.get("poll_id"));
    return { ok: true, json: async () => rows };
  };
  return { calls, logs, errors, deps: { env, fetchImpl, now: () => now, log: (line) => logs.push(line), error: (line) => errors.push(line) } };
}

for (const [time, expected] of [["12:59:59", 0], ["13:00:00", 1]]) {
  test(`일요일 ${time}의 투표 생성 요청은 ${expected}건`, async () => {
    const context = harness({ now: `2026-10-11T${time}+09:00` });
    assert.equal(await main([], context.deps), 0);
    const inserts = context.calls.filter((call) => call.table === "polls" && call.method === "POST");
    assert.equal(inserts.length, expected);
    if (expected) {
      assert.deepEqual(inserts[0].rows, [{ match_date: "2026-10-17", ...pollWindow("2026-10-17") }]);
      assert.equal(inserts[0].endpoint.searchParams.get("on_conflict"), "match_date");
      assert.ok(context.logs.includes("poll: created 2026-10-17"));
    }
  });
}

test("해당 토요일 투표가 이미 있으면 생성하지 않는다", async () => {
  const context = harness({ polls: fixture.polls });
  assert.equal(await main([], context.deps), 0);
  assert.equal(context.calls.filter((call) => call.table === "polls" && call.method === "POST").length, 0);
  assert.ok(context.logs.includes("poll: exists"));
});

test("투표 창(월 13:00)이 이미 지났으면 소급 생성하지 않는다", async () => {
  const context = harness({ now: "2026-10-17T23:59:59+09:00" });
  assert.equal(await main([], context.deps), 0);
  assert.equal(context.calls.filter((call) => call.table === "polls" && call.method === "POST").length, 0);
  assert.ok(context.logs.includes("poll: window passed (2026-10-17), skip"));
});

test("일요일 13:00 이후에는 다음 토요일 투표를 생성한다", async () => {
  const context = harness({ now: "2026-10-18T13:00:00+09:00" });
  assert.equal(await main([], context.deps), 0);
  assert.equal(context.calls.find((call) => call.table === "polls" && call.method === "POST").rows[0].match_date, "2026-10-24");
});

test("벌금 본문·충돌 컬럼·14일 조회 범위가 발주서와 같다", async () => {
  const context = harness({ now: "2026-10-15T12:00:00+09:00", polls: fixture.polls });
  assert.equal(await main([], context.deps), 0);
  const insert = context.calls.find((call) => call.table === "ledger" && call.rows?.[0]?.category === "fine_late_vote");
  assert.deepEqual(insert.rows, lateVoteRows(fixture.polls[0], fixture.poll_votes, fixture.members, config.FINES.LATE_VOTE, "2026-10-12"));
  assert.equal(insert.endpoint.searchParams.get("on_conflict"), "member_id,category,ref_poll_id");
  assert.equal(insert.headers.Prefer, "resolution=ignore-duplicates,return=minimal");
  const query = context.calls.find((call) => call.endpoint.searchParams.has("and")).endpoint.searchParams;
  assert.equal(query.get("cancelled"), "eq.false");
  assert.equal(query.get("and"), "(closes_at.lt.2026-10-15T03:00:00.000Z,closes_at.gte.2026-10-01T03:00:00.000Z)");
});

test("마감 시각 당일 경계까지는 벌금을 요청하지 않는다", async () => {
  const context = harness({ now: fixture.polls[0].closes_at, polls: [fixture.polls[0]] });
  assert.equal(await main([], context.deps), 0);
  assert.equal(context.calls.filter((call) => call.rows?.[0]?.category === "fine_late_vote").length, 0);
});

test("마감이 지난 fines=false 투표는 장부 POST가 없다", async () => {
  const poll = { ...fixture.polls[0], title: "특별 경기", fines: false };
  const context = harness({ now: "2026-10-15T12:00:00+09:00", polls: [poll] });
  assert.equal(await main([], context.deps), 0);
  assert.ok(context.calls.some((call) => call.table === "poll_votes"));
  assert.equal(context.calls.filter((call) => call.table === "ledger" && call.method === "POST").length, 0);
});

test("취소·14일 초과 투표는 제외하고 14일 경계는 포함한다", async () => {
  const polls = [
    { ...fixture.polls[0], id: "old", closes_at: "2026-10-01T11:59:59+09:00" },
    { ...fixture.polls[0], id: "boundary", closes_at: "2026-10-01T12:00:00+09:00" },
    { ...fixture.polls[0], id: "cancelled", cancelled: true }
  ];
  const context = harness({ now: "2026-10-15T12:00:00+09:00", polls });
  assert.equal(await main([], context.deps), 0);
  const inserts = context.calls.filter((call) => call.rows?.[0]?.category === "fine_late_vote");
  assert.equal(inserts.length, 1);
  assert.ok(inserts[0].rows.every((row) => row.ref_poll_id === "boundary"));
});

test("LEDGER_START_MONTH 이전 달에는 회비 행을 만들지 않는다", async () => {
  const context = harness({ now: "2026-10-11T13:00:00+09:00" });
  assert.equal(await main([], context.deps), 0);
  assert.equal(context.calls.filter((call) => call.rows?.[0]?.category === "dues").length, 0);
  assert.ok(context.logs.includes(`dues: skipped (before ${config.LEDGER_START_MONTH})`));
});

test("월회비 본문과 on_conflict는 월별 멱등 키(period)를 사용한다", async () => {
  const context = harness({ now: "2026-11-08T13:00:00+09:00" });
  assert.equal(await main([], context.deps), 0);
  const insert = context.calls.find((call) => call.table === "ledger" && call.rows?.[0]?.category === "dues");
  assert.deepEqual(insert.rows, monthlyDuesRows(fixture.members, "2026-11", config));
  assert.ok(insert.rows.every((row) => row.period === "2026-11"));
  assert.equal(insert.endpoint.searchParams.get("on_conflict"), "member_id,category,period");
  assert.equal(insert.headers.Prefer, "resolution=ignore-duplicates,return=minimal");
  assert.ok(context.logs.includes("dues: 13 rows"));
});

test("UTC로 전날이어도 KST 월초 회비를 생성한다", async () => {
  const context = harness({ now: "2026-10-31T15:00:00Z" });
  assert.equal(await main([], context.deps), 0);
  const insert = context.calls.find((call) => call.rows?.[0]?.category === "dues");
  assert.ok(insert.rows.every((row) => row.entry_date === "2026-11-01"));
});

test("반복 실행은 같은 본문과 충돌 키로 요청한다 (DB 인덱스 추론은 별도 실검증)", async () => {
  const context = harness({ now: "2026-10-15T12:00:00+09:00", polls: fixture.polls });
  await main([], context.deps);
  const first = context.calls.filter((call) => call.method === "POST");
  context.calls.length = 0;
  await main([], context.deps);
  assert.deepEqual(context.calls.filter((call) => call.method === "POST"), first);
});

test("시크릿 있는 dry-run은 조회와 계획 출력만 하고 POST/PATCH가 없다", async () => {
  const context = harness({ now: "2026-10-15T12:00:00+09:00", polls: fixture.polls });
  assert.equal(await main(["--dry-run"], context.deps), 0);
  assert.ok(context.calls.length > 0);
  assert.ok(context.calls.every((call) => call.method === "GET"));
  assert.ok(context.logs.some((line) => line.startsWith("dry-run ledger:")));
});

test("시크릿 없는 dry-run은 네트워크 없이 조회 생략 계획을 출력하고 0을 반환한다", async () => {
  const context = harness();
  context.deps.env = {};
  context.deps.fetchImpl = async () => { assert.fail("네트워크 호출 금지"); };
  assert.equal(await main(["--dry-run"], context.deps), 0);
  assert.ok(context.logs.some((line) => line.includes("조회 생략")));
  assert.ok(context.logs.some((line) => line.includes("2026-10-17")));
});

test("필수 시크릿 하나라도 누락되면 쓰기 모드는 종료코드 2다", async () => {
  for (const setting of [{}, { SUPABASE_URL: env.SUPABASE_URL }, { SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY }]) {
    const context = harness();
    assert.equal(await main([], { ...context.deps, env: setting }), 2);
    assert.equal(context.calls.length, 0);
  }
});

test("잘못된 인자나 REST 예외는 종료코드 1이고 키를 로그에 노출하지 않는다", async () => {
  const context = harness();
  assert.equal(await main(["--unknown"], context.deps), 1);
  assert.equal(await main([], { ...context.deps, fetchImpl: async () => { throw new Error(env.SUPABASE_SERVICE_ROLE_KEY); } }), 1);
  assert.ok(context.errors.every((line) => !line.includes(env.SUPABASE_SERVICE_ROLE_KEY)));
});

test("REST 오류는 상태코드와 최대 300자 본문을 표시하며 키를 가린다", async () => {
  const rest = createRest({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY,
    fetchImpl: async () => ({ ok: false, status: 409, text: async () => env.SUPABASE_SERVICE_ROLE_KEY + "x".repeat(500) }) });
  await assert.rejects(rest.select("members"), (error) => {
    assert.match(error.message, /HTTP 409/);
    assert.ok(!error.message.includes(env.SUPABASE_SERVICE_ROLE_KEY));
    assert.equal(error.message.split(": ")[1].length, 300);
    return true;
  });
});

test("REST 빈 insert는 요청을 생략하고 update는 조건을 보존한다", async () => {
  const context = harness();
  const rest = createRest({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY, fetchImpl: context.deps.fetchImpl });
  await rest.insertIgnore("ledger", [], "member_id,category,period");
  assert.equal(context.calls.length, 0);
  await rest.update("polls", { id: "eq.demo-poll-1" }, { cancelled: true });
  assert.equal(context.calls[0].method, "PATCH");
  assert.equal(context.calls[0].endpoint.searchParams.get("id"), "eq.demo-poll-1");
  assert.deepEqual(context.calls[0].rows, { cancelled: true });
  assert.throws(() => rest.update("polls", {}, { cancelled: true }), /조건/);
  await assert.rejects(rest.insertIgnore("ledger", [{}]), /중복 방지/);
});

test("REST select는 1,000행 다음 페이지도 읽는다", async () => {
  const offsets = [];
  const rest = createRest({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY,
    fetchImpl: async (url) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      offsets.push(offset);
      return { ok: true, json: async () => Array.from({ length: offset === 0 ? 1000 : 1 }, (_, index) => ({ id: offset + index })) };
    } });
  assert.equal((await rest.select("members", { order: "id.asc" })).length, 1001);
  assert.deepEqual(offsets, [0, 1000]);
});

test("redact는 키가 없을 때도 JWT 모양 문자열을 가린다", () => {
  assert.equal(redact("ok", undefined), "ok");
  assert.equal(redact("eyJdummy.part.signature", undefined), "[숨김]");
});
