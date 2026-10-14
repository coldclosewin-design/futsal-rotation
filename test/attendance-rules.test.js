const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const rules = require("../js/attendance-rules.js");
const config = require("../js/config.js");

describe("attendanceFines", () => {
  const match = { id: "match-1", poll_id: "poll-1", match_date: "2026-10-10" };
  const votes = [{ poll_id: "poll-1", member_id: "m03", choice: "attend" }, { poll_id: "poll-1", member_id: "m04", choice: "absent" }];
  test("지각·경기 후 도착·참석 투표 후 급불참만 설정 금액으로 청구", () => {
    const attendance = ["late", "late_kickoff", "no_show", "no_show", "excused", "present"].map((status, index) => ({ member_id: `m0${index + 1}`, match_id: match.id, status }));
    const rows = rules.attendanceFines(match, attendance, votes, config);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((row) => row.amount), [config.FINES.LATE, config.FINES.LATE_KICKOFF, config.FINES.NO_SHOW]);
    assert.deepEqual(rows.map((row) => row.category), ["fine_late", "fine_late_kickoff", "fine_no_show"]);
    for (const row of rows) { assert.equal(row.ref_match_id, match.id); assert.equal(row.entry_date, match.match_date); assert.match(row.note, /^2026-10-10 경기 /); }
  });
  test("다른 투표의 참석을 급불참 벌금에 사용하지 않음", () => {
    assert.deepEqual(rules.attendanceFines(match, [{ member_id: "m01", status: "no_show" }], [{ poll_id: "other", member_id: "m01", choice: "attend" }], config), []);
  });
  test("다른 매치 출석과 알 수 없는 상태 제외", () => {
    assert.deepEqual(rules.attendanceFines(match, [{ member_id: "m01", match_id: "other", status: "late" }, { member_id: "m02", status: "constructor" }], votes, config), []);
  });
  test("미투표 급불참은 벌금 없음", () => {
    assert.deepEqual(rules.attendanceFines(match, [{ member_id: "m06", status: "no_show" }], votes, config), []);
  });
});

describe("attendanceRate", () => {
  const today = "2026-10-15";
  function rate(matches, votes, attendance, weeks = 12) { return rules.attendanceRate(matches, votes, attendance, "m01", weeks, today); }
  test("완료 경기 수 대비 실제 출석 비율", () => {
    const matches = ["a", "b", "c", "d"].map((id) => ({ id, poll_id: id, status: "played", match_date: "2026-10-10" }));
    const votes = matches.map((row) => ({ poll_id: row.id, member_id: "m01", choice: "attend" }));
    const attendance = ["present", "late", "late_kickoff", "no_show"].map((status, i) => ({ match_id: matches[i].id, member_id: "m01", status }));
    assert.deepEqual(rate(matches, votes, attendance), { polled: 4, attended: 3, rate: 0.75 });
  });
  test("12주 경계 포함, 범위 밖·미래·예정·취소 제외", () => {
    const matches = [["a", "2026-07-23", "played"], ["b", "2026-07-22", "played"], ["c", "2026-10-16", "played"], ["d", today, "scheduled"], ["e", today, "cancelled"]].map(([id, match_date, status]) => ({ id, poll_id: id, match_date, status }));
    assert.deepEqual(rate(matches, matches.map((row) => ({ poll_id: row.id, member_id: "m01", choice: "attend" })), []), { polled: 1, attended: 0, rate: 0 });
  });
  test("경기가 없으면 rate null", () => assert.deepEqual(rate([], [], []), { polled: 0, attended: 0, rate: null }));
  test("불참·미투표도 완료 경기 분모에 포함하고 실제 출석으로 집계", () => {
    const matches = [{ id: "a", status: "played", match_date: today }];
    assert.equal(rate(matches, [], []).rate, 0);
    assert.equal(rate(matches, [{ poll_id: "a", member_id: "m01", choice: "absent" }], [{ match_id: "a", member_id: "m01", status: "present" }]).rate, 1);
  });
  test("매치 정보를 합친 poll 입력과 개인 필터", () => {
    assert.deepEqual(rate([{ id: "p", match_id: "m", status: "played", match_date: today }], [{ poll_id: "p", member_id: "m01", choice: "attend" }], [{ match_id: "m", member_id: "m02", status: "present" }]), { polled: 1, attended: 0, rate: 0 });
  });
});

describe("배정과 날짜", () => {
  test("rotationTotals 개인별 누적과 키퍼·휴식 쿼터 수", () => {
    assert.deepEqual(rules.rotationTotals([{ member_id: "m01", match_id: "a", gk_count: 2, rest_count: 1, out_quarters: [7, 8] }, { member_id: "m01", match_id: "b", gk_count: 1, rest_count: 2 }, { member_id: "m02", match_id: "a", gk_count: 8 }], "m01"), { matches: 2, gk: 3, rest: 3, outQuarters: 2 });
  });
  test("배정 기록 없을 때 0", () => assert.deepEqual(rules.rotationTotals([], "m01"), { matches: 0, gk: 0, rest: 0, outQuarters: 0 }));
  test("참석자 active 필터·ID 순서·중복 투표", () => {
    const members = [{ id: "m03", name: "다", active: true }, { id: "m02", name: "나", active: false }, { id: "m01", name: "가", active: true }];
    const votes = ["m03", "m01", "m02", "m01"].map((member_id) => ({ member_id, choice: "attend" }));
    assert.deepEqual(rules.rosterFromVotes(votes, members), ["가", "다"]);
    assert.equal(members[0].id, "m03");
  });
  test("불참만 있으면 빈 명단", () => assert.deepEqual(rules.rosterFromVotes([{ member_id: "m01", choice: "absent" }], [{ id: "m01", active: true }]), []));
  test("최근 과거 같은 요일로 치환, 원본 보존", () => {
    const rows = [{ match_date: "2026-10-10", id: "a" }];
    assert.equal(rules.shiftPastDemoDates(rows, "2026-10-15")[0].match_date, "2026-10-10");
    assert.equal(rules.shiftPastDemoDates(rows, "2026-10-17")[0].match_date, "2026-10-10");
    assert.equal(rows[0].match_date, "2026-10-10");
  });
  test("연도 경계와 parsed_date 처리", () => assert.equal(rules.shiftPastDemoDates([{ parsed_date: "2026-10-10" }], "2027-01-01")[0].parsed_date, "2026-12-26"));
  test("NULL 날짜 보존", () => assert.deepEqual(rules.shiftPastDemoDates([{ parsed_date: null }], "2026-10-15"), [{ parsed_date: null }]));
  test("부분 참여 쿼터를 정확히 저장 행으로 변환", () => {
    const schedule = [{ quarter: 1, gk: "가", rest: ["나"], field: [] }, { quarter: 2, gk: "나", rest: [], field: [] }];
    assert.deepEqual(rules.rotationRows(schedule, ["가", "나"], [{ id: "m01", name: "가" }, { id: "m02", name: "나" }]), [
      { member_id: "m01", active_quarters: 1, gk_count: 1, rest_count: 0, out_quarters: [1] },
      { member_id: "m02", active_quarters: 2, gk_count: 1, rest_count: 1, out_quarters: [1, 2] }
    ]);
  });
  test("이름 누락·동명이인 매핑 실패", () => {
    assert.throws(() => rules.rotationRows([], ["가"], []), /연결/);
    assert.throws(() => rules.rotationRows([], ["가"], [{ id: "m01", name: "가" }, { id: "m02", name: "가" }]), /연결/);
  });
});

// 브라우저 전역 확장 모듈의 권한·저장 계약도 의존성 없이 검사한다.
function environment({ member = "m03", live = false, failure } = {}) {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/demo-data.json"), "utf8"));
  const context = { URLSearchParams, location: { search: "?demo=1" }, EXICAN_CONFIG: config,
    ExicanRules: require("../js/rules.js"), ExicanAttendance: rules, ExicanLedgerRules: require("../js/ledger-rules.js"),
    ExicanMember: { getId: () => member }, fetch: async () => ({ ok: true, json: async () => structuredClone(fixture) }),
    ExicanAuth: { getRole: async () => member === "m03" ? "admin" : "team", init: async () => ({ from: () => ({ update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ error: failure, status: 403 }) }) }) }) }) }) },
    ExicanData: { mode: () => live ? "live" : "demo", members: async () => structuredClone(fixture.members), matches: async () => structuredClone(fixture.matches), ledger: async () => structuredClone(fixture.ledger) } };
  context.window = context;
  vm.createContext(context);
  for (const name of ["data-ledger.js", "data-admin.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../js", name), "utf8"), context);
  return context.ExicanData;
}

describe("data-admin 저장 계약", () => {
  test("팀원은 모든 관리 쓰기 불가", async () => {
    const data = environment({ member: "m05" });
    for (const operation of [() => data.upsertMember({ name: "테스트" }), () => data.cancelPoll("demo-poll-1", true), () => data.createPoll("2026-11-07"), () => data.updateMatch("demo-match-1", {}), () => data.saveAttendance("demo-match-1", []), () => data.saveRotationHistory("demo-match-1", []), () => data.addLedger({})]) await assert.rejects(operation, /회장 로그인/);
  });
  test("멤버 ID 최대+1·수정·중복 이름 거절", async () => {
    const data = environment();
    const added = await data.upsertMember({ name: "테스트 멤버" });
    assert.equal(added.id, "m13");
    await data.upsertMember({ id: "m13", name: "테스트 수정", active: false });
    assert.equal((await data.members()).some((row) => row.id === "m13"), false);
    assert.equal((await data.members({ activeOnly: false })).find((row) => row.id === "m13").name, "테스트 수정");
    await assert.rejects(() => data.upsertMember({ name: "안준호" }), /같은 이름/);
  });
  test("지난 투표와 현재 투표 분리·취소 반영", async () => {
    const data = environment();
    const polls = await data.polls();
    assert.ok(polls.find((row) => row.id === "demo-poll-past").match_date < polls.find((row) => row.id === "demo-poll-1").match_date);
    assert.equal((await data.currentPoll()).id, "demo-poll-1");
    await data.cancelPoll("demo-poll-1", true);
    assert.equal((await data.currentPoll()).cancelled, true);
    assert.equal((await data.votes("demo-poll-past")).length, 8);
  });
  test("출석 upsert는 누락 멤버를 삭제하지 않음", async () => {
    const data = environment();
    await data.saveAttendance("demo-ledger-match-1", [{ member_id: "m01", status: "late" }]);
    const rows = await data.attendance("demo-ledger-match-1");
    assert.equal(rows.length, 8);
    assert.equal(rows.find((row) => row.member_id === "m01").status, "late");
    await assert.rejects(() => data.saveAttendance("demo-ledger-match-1", [{ member_id: "m02", status: "invalid" }]), /출석 상태/);
  });
  test("매치 완료 스코어 필수·배정표 저장·임의 필드 차단", async () => {
    const data = environment();
    await assert.rejects(() => data.updateMatch("demo-match-1", { status: "played" }), /스코어/);
    const row = await data.updateMatch("demo-match-1", { status: "played", score_us: 4, score_them: 3, cost: 70000, schedule: [], opponent: "변경 금지" });
    assert.equal(row.status, "played"); assert.equal(row.cost, 70000); assert.equal(row.opponent, null);
  });
  test("배정 재저장은 중복 행 없이 반영", async () => {
    const data = environment();
    const row = { member_id: "m01", active_quarters: 8, gk_count: 1, rest_count: 1, out_quarters: [] };
    await data.saveRotationHistory("demo-match-1", [row]);
    await data.saveRotationHistory("demo-match-1", [{ ...row, gk_count: 2 }]);
    assert.equal((await data.rotationHistory({ matchId: "demo-match-1" })).length, 1);
    assert.equal((await data.rotationHistory({ matchId: "demo-match-1" }))[0].gk_count, 2);
  });
  test("경기 기록은 완료 1건과 실제 출석 7명", async () => {
    const rows = await environment().matchHistory();
    assert.equal(rows.length, 1); assert.equal(rows[0].attendance_count, 7);
  });
  test("벌금 중복과 NULL 멤버 구장비 중복 차단", async () => {
    const data = environment();
    const row = { member_id: "m01", category: "fine_late", amount: 10000, ref_match_id: "demo-match-1", entry_date: "2026-10-17" };
    await data.addLedger(row);
    await assert.rejects(() => data.addLedger(row), { code: "23505" });
    await assert.rejects(() => data.addLedger({ ...row, member_id: null, category: "venue_fee", amount: -60000, ref_match_id: "demo-ledger-match-1", settled: true }), { code: "23505" });
  });
  test("DB 권한 오류 42501/403을 회장 안내로 래핑", async () => {
    const data = environment({ live: true, failure: { code: "42501", message: "permission denied" } });
    await assert.rejects(() => data.updateMatch("demo-match-1", { cost: 60000 }), /회장 로그인이 필요합니다/);
  });
});
