const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const rules = require("../js/rules.js");
const form = require("../js/poll-form.js");
const fixture = require("./fixtures/demo-data.json");
const source = readFileSync(join(__dirname, "../js/data.js"), "utf8");
const now = "2026-10-15T12:00:00+09:00";

function environment({ clock = now, live = false, role = "admin", respond = () => ({ data: [] }) } = {}) {
  const calls = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return Date.parse(clock); }
  }
  const context = { Date: Clock, URLSearchParams, location: { search: live ? "" : "?demo=1" },
    EXICAN_CONFIG: {}, ExicanRules: rules, isConfigured: () => true,
    document: { querySelector: () => ({}) }, showToast: () => {},
    fetch: async () => ({ ok: true, json: async () => structuredClone(fixture) }),
    ExicanAuth: { getRole: async () => role, init: async () => ({ from(table) {
      const call = { table, operations: [] };
      calls.push(call);
      const query = { then: (resolve, reject) => Promise.resolve(respond(call)).then(resolve, reject) };
      for (const name of ["select", "gte", "eq", "order", "range", "insert", "update", "delete", "single"]) {
        query[name] = (...args) => { call.operations.push([name, ...args]); return query; };
      }
      return query;
    } }) }
  };
  context.window = context;
  runInNewContext(source, context);
  return { data: context.ExicanData, calls };
}

test("데모는 지난 투표를 제외하고 정기·특별 투표의 날짜와 응답을 분리한다", async () => {
  const { data } = environment();
  const polls = await data.upcomingPolls(now);
  assert.deepEqual(Array.from(polls, (poll) => poll.match_date), ["2026-10-17", "2026-10-22"]);
  const [regular, special] = polls;
  assert.equal(special.title, "개천절 특별 매치");
  assert.equal(special.fines, false);
  assert.equal(rules.pollStatus(special, now), "open");
  assert.equal((await data.votes(special.id)).length, 3);
  assert.ok((await data.votes(special.id)).every((row) => Date.parse(row.updated_at) <= Date.parse(now)));
  await data.castVote(regular.id, "m12", "attend");
  await data.castVote(special.id, "m12", "absent");
  assert.equal((await data.votes(regular.id)).find((row) => row.member_id === "m12").choice, "attend");
  assert.equal((await data.votes(special.id)).find((row) => row.member_id === "m12").choice, "absent");
  await data.setPollCancelled(regular.id, true);
  assert.equal((await data.currentPoll(now)).id, special.id);
  assert.equal((await data.upcomingPolls(now)).length, 1);
  await data.setPollCancelled(special.id, true);
  assert.equal(await data.currentPoll(now), null);
});

for (const [clock, expected] of [["2026-10-18T12:00:00+09:00", "2026-10-22"], ["2026-12-31T12:00:00+09:00", "2027-01-07"]]) {
  test(`특별 데모 날짜는 ${clock} 기준 다음 주 목요일 ${expected}`, async () => {
    const polls = await environment({ clock }).data.upcomingPolls(clock);
    assert.equal(polls.find((row) => row.fines === false).match_date, expected);
    assert.equal(polls.length, 2);
  });
}

test("기존 생성 API 기본 창과 임의 옵션·복사 격리·날짜 중복을 유지한다", async () => {
  const { data } = environment();
  const regular = await data.createPoll("2026-10-24");
  assert.equal(regular.title, null);
  assert.equal(regular.fines, true);
  assert.equal(regular.opens_at, rules.pollWindow("2026-10-24").opens_at);
  assert.equal(regular.closes_at, rules.pollWindow("2026-10-24").closes_at);
  const options = { title: "수요일", opens_at: now, closes_at: "2026-10-20T13:00:00+09:00", fines: false };
  const special = await data.createPoll("2026-10-21", options);
  for (const [key, value] of Object.entries(options)) assert.equal(special[key], value);
  special.title = "외부 수정";
  assert.equal((await data.upcomingPolls(now)).find((row) => row.id === special.id).title, options.title);
  await assert.rejects(() => data.createPoll("2026-10-21"), /해당 날짜의 투표가 이미 있습니다/);
});

test("데모 생성은 취소된 같은 날짜 투표를 새 옵션으로 되살린다", async () => {
  const { data } = environment();
  const special = await data.createPoll("2026-10-21", { title: "수요일", fines: false });
  await data.setPollCancelled(special.id, true);
  assert.equal((await data.upcomingPolls(now)).some((row) => row.id === special.id), false);
  const revived = await data.createPoll("2026-10-21", { title: "다시 여는 수요일", closes_at: "2026-10-20T18:00:00+09:00" });
  assert.equal(revived.id, special.id);
  assert.equal(revived.cancelled, false);
  assert.equal(revived.title, "다시 여는 수요일");
  assert.equal(revived.fines, true);
  assert.equal(revived.closes_at, "2026-10-20T18:00:00+09:00");
  assert.equal(revived.opens_at, rules.pollWindow("2026-10-21").opens_at);
  const listed = (await data.upcomingPolls(now)).filter((row) => row.match_date === "2026-10-21");
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, "다시 여는 수요일");
  await assert.rejects(() => data.createPoll("2026-10-21"), /해당 날짜의 투표가 이미 있습니다/);
});

test("데모 삭제는 투표와 기록을 지우고, 매치·벌금이 연결된 투표는 거부한다", async () => {
  const { data } = environment();
  const special = (await data.upcomingPolls(now)).find((row) => row.id === "demo-poll-special");
  assert.equal((await data.votes(special.id)).length, 3);
  const removed = await data.deletePoll(special.id);
  assert.equal(removed.id, special.id);
  assert.equal((await data.upcomingPolls(now)).some((row) => row.id === special.id), false);
  assert.equal((await data.votes(special.id)).length, 0);
  await assert.rejects(() => data.deletePoll(special.id), /투표를 찾을 수 없습니다/);
  // demo-poll-1은 확정 매치(matches.poll_id)와 벌금(ledger.ref_poll_id)이 참조한다.
  await assert.rejects(() => data.deletePoll("demo-poll-1"), /연결된 매치나 벌금 기록이 있어 삭제할 수 없습니다/);
  assert.equal((await data.upcomingPolls(now)).some((row) => row.id === "demo-poll-1"), true);
  const team = environment({ role: "team", live: true });
  await assert.rejects(() => team.data.deletePoll("demo-poll-special"), /회장 로그인/);
});

test("live 삭제는 id로 delete하고 참조 제한(23503)은 취소 안내로 바꾼다", async () => {
  const { data, calls } = environment({ live: true, respond: () => ({ data: { id: 7, match_date: "2026-10-24" } }) });
  assert.deepEqual(await data.deletePoll(7), { id: 7, match_date: "2026-10-24" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "polls");
  assert.deepEqual(calls[0].operations, [["delete"], ["eq", "id", 7], ["select"], ["single"]]);
  const referenced = environment({ live: true, respond: () => ({ error: { code: "23503", message: "violates foreign key" } }) });
  await assert.rejects(() => referenced.data.deletePoll(7), /연결된 매치나 벌금 기록이 있어 삭제할 수 없습니다. 대신 투표 취소를 쓰세요/);
  const other = environment({ live: true, respond: () => ({ error: { code: "42501", message: "permission denied" } }) });
  await assert.rejects(() => other.data.deletePoll(7), (error) => error.code === "42501");
});

test("live 다가오는 투표는 KST 경계·취소 제외·날짜순으로 1,000행 다음 페이지까지 조회한다", async () => {
  const { data, calls } = environment({ live: true, respond: (call) => {
    const offset = call.operations.find(([name]) => name === "range")[1];
    return { data: offset ? [{ id: "last" }] : Array.from({ length: 1000 }, (_, id) => ({ id })) };
  } });
  assert.equal((await data.upcomingPolls("2026-10-15T15:00:00Z")).length, 1001);
  for (const [index, call] of calls.entries()) {
    assert.equal(call.table, "polls");
    assert.deepEqual(call.operations, [["select", "*"], ["gte", "match_date", "2026-10-16"], ["eq", "cancelled", false], ["order", "match_date"], ["range", index * 1000, index * 1000 + 999]]);
  }
});

test("live 생성은 insert 옵션 보존·23505 안내·회장 권한 검사를 한다", async () => {
  const options = { title: "이벤트", opens_at: now, closes_at: "2026-10-20T13:00:00+09:00", fines: false };
  const { data, calls } = environment({ live: true, respond: (call) => ({ data: call.operations.find(([name]) => name === "insert")[1] }) });
  const row = await data.createPoll("2026-10-21", options);
  for (const [key, value] of Object.entries(options)) assert.equal(row[key], value);
  assert.equal(calls.length, 1);
  const duplicate = environment({ live: true, respond: (call) => call.operations.some(([name]) => name === "insert") ? { error: { code: "23505" } } : { data: [{ id: 1, match_date: "2026-10-21", cancelled: false }] } });
  await assert.rejects(() => duplicate.data.createPoll("2026-10-21"), /해당 날짜의 투표가 이미 있습니다/);
  assert.deepEqual(duplicate.calls.map((call) => call.operations[0][0]), ["insert", "select"]);
  const team = environment({ live: true, role: "team" });
  await assert.rejects(() => team.data.createPoll("2026-10-21"), /회장 로그인/);
  assert.equal(team.calls.length, 0);
});

test("live 생성은 23505 뒤 같은 날짜 행이 취소 상태면 update로 되살리고 아니면 중복 오류다", async () => {
  const cancelled = { id: 42, match_date: "2026-10-24", title: "옛 제목", fines: false, cancelled: true,
    opens_at: "2026-10-01T00:00:00+09:00", closes_at: "2026-10-02T13:00:00+09:00" };
  const respond = (row) => (call) => {
    const op = (name) => call.operations.find(([key]) => key === name);
    if (op("insert")) return { error: { code: "23505" } };
    if (op("update")) return { data: { ...row, ...op("update")[1] } };
    return { data: [row] };
  };
  const options = { title: "새 제목", closes_at: "2026-10-23T18:00:00+09:00" };
  const { data, calls } = environment({ live: true, respond: respond(cancelled) });
  const revived = await data.createPoll("2026-10-24", options);
  assert.deepEqual(revived, { ...cancelled, ...options, fines: true, cancelled: false, opens_at: rules.pollWindow("2026-10-24").opens_at });
  assert.deepEqual(calls.map((call) => call.table), ["polls", "polls", "polls"]);
  assert.deepEqual(calls[1].operations, [["select", "*"], ["eq", "match_date", "2026-10-24"]]);
  const [update, where, ...rest] = calls[2].operations;
  // vm 컨텍스트에서 만든 객체는 prototype이 달라 복사해 비교한다.
  assert.deepEqual([update[0], { ...update[1] }], ["update", { title: "새 제목", fines: true, cancelled: false, opens_at: rules.pollWindow("2026-10-24").opens_at, closes_at: options.closes_at }]);
  assert.deepEqual(where, ["eq", "id", 42]);
  assert.deepEqual(rest, [["select"], ["single"]]);
  const active = environment({ live: true, respond: respond({ ...cancelled, cancelled: false }) });
  await assert.rejects(() => active.data.createPoll("2026-10-24"), /해당 날짜의 투표가 이미 있습니다/);
  assert.equal(active.calls.length, 2);
  const missing = environment({ live: true, respond: (call) => call.operations.some(([name]) => name === "insert") ? { error: { code: "23505" } } : { data: [] } });
  await assert.rejects(() => missing.data.createPoll("2026-10-24"), /해당 날짜의 투표가 이미 있습니다/);
});

test("모달 기본값은 전날 13시와 토요일에만 벌금을 적용하며 연도 경계도 처리한다", () => {
  assert.deepEqual(form.defaults("2026-10-17"), { closes_at: "2026-10-16T13:00", fines: true });
  assert.deepEqual(form.defaults("2026-10-21"), { closes_at: "2026-10-20T13:00", fines: false });
  assert.deepEqual(form.defaults("2027-01-01"), { closes_at: "2026-12-31T13:00", fines: false });
});

test("모달 시각은 브라우저 시간대와 무관한 KST이고 제목은 선택 입력이다", () => {
  const input = { match_date: "2026-10-21", title: " 특별 경기 ", closes_at: "2026-10-20T13:00", fines: false };
  assert.deepEqual(form.values(input, now), { title: "특별 경기", opens_at: now, closes_at: "2026-10-20T13:00:00+09:00", fines: false });
  assert.equal(form.values({ ...input, title: "" }, now).title, null);
  assert.equal(form.formatTime("2026-10-20T04:00:00Z"), "2026/10/20 13:00");
});

test("지난 경기일·잘못된 날짜·긴 제목·경기 당일 이후 마감을 거절한다", () => {
  const input = { match_date: "2026-10-21", closes_at: "2026-10-20T13:00" };
  for (const match_date of ["2026-10-14", "2027-02-30", "", "invalid"]) assert.throws(() => form.values({ ...input, match_date }, now), /날짜/);
  assert.throws(() => form.values({ ...input, title: "가".repeat(31) }, now), /30자/);
  for (const closes_at of ["2026-10-21T00:00", "2026-10-22T13:00"]) assert.throws(() => form.values({ ...input, closes_at }, now), /마감은 경기 전이어야 합니다/);
  for (const closes_at of ["", "2026-10-20T25:00", "2027-02-30T13:00"]) assert.throws(() => form.values({ ...input, closes_at }, now), /마감 시각/);
  assert.equal(form.values({ match_date: "2026-10-16", closes_at: "2026-10-15T23:59", title: "가".repeat(30) }, "2026-10-15T15:00:00Z").title.length, 30);
  assert.throws(() => form.values({ ...input, match_date: "2026-10-15" }, "2026-10-15T15:00:00Z"), /날짜/);
});
