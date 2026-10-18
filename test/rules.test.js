const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const rules = require("../js/rules.js");
const config = require("../js/config.js");
const fixture = require("./fixtures/demo-data.json");
const { members } = fixture;
const poll = fixture.polls[0];

test("rules는 DOM 접근 없이 Node와 브라우저에 같은 API를 노출한다", () => {
  const context = { window: {} };
  runInNewContext(readFileSync(join(__dirname, "../js/rules.js"), "utf8"), context);
  assert.deepEqual(Object.keys(context.window.ExicanRules), Object.keys(rules));
});

test("데모 멤버 ID/이름이 원본과 같고 회장은 m03이다", () => {
  assert.deepEqual(members.map(({ id, name }) => ({ id, name })), require("../members.json").members);
  assert.deepEqual(members.filter((member) => member.is_president).map((member) => member.id), ["m03"]);
});

test("kstDate는 UTC 날짜 경계와 Date 객체를 처리한다", () => {
  assert.equal(rules.kstDate("2026-10-10T14:59:59Z"), "2026-10-10");
  assert.equal(rules.kstDate(new Date("2026-10-10T15:00:00Z")), "2026-10-11");
  assert.equal(rules.kstDate("2026-12-31T15:00:00Z"), "2027-01-01");
});

for (const [input, expected] of [
  ["2026-10-14", "2026-10-17"], ["2026-10-17", "2026-10-17"], ["2026-10-18", "2026-10-24"],
  ["2026-12-31", "2027-01-02"], ["2028-02-29", "2028-03-04"]
]) test(`nextSaturday ${input} → ${expected}`, () => assert.equal(rules.nextSaturday(input), expected));

test("pollWindow는 일요일 13시부터 월요일 13시까지 KST 창을 반환한다", () => {
  assert.deepEqual(rules.pollWindow("2026-10-17"), {
    opens_at: "2026-10-11T13:00:00+09:00", closes_at: "2026-10-12T13:00:00+09:00"
  });
  assert.deepEqual(rules.pollWindow("2027-01-02"), {
    opens_at: "2026-12-27T13:00:00+09:00", closes_at: "2026-12-28T13:00:00+09:00"
  });
});

for (const [now, expected] of [
  ["2026-10-11T12:59:59+09:00", "scheduled"], ["2026-10-11T13:00:00+09:00", "open"],
  ["2026-10-12T13:00:00+09:00", "open"], ["2026-10-12T13:00:00.001+09:00", "closed"]
]) test(`pollStatus ${now} → ${expected}`, () => assert.equal(rules.pollStatus(poll, now), expected));

test("pollStatus 취소 상태가 시간보다 우선한다", () => {
  for (const now of [poll.opens_at, "2026-10-20"]) assert.equal(rules.pollStatus({ ...poll, cancelled: true }, now), "cancelled");
});

test("참석 7명은 5v5 휴식 2명, 6v6 휴식 1명이며 세 목록에 빠짐없이 분류된다", () => {
  const votes = members.slice(0, 7).map((member) => ({ member_id: member.id, choice: "attend" }));
  votes.push({ member_id: "m08", choice: "absent" });
  const summary = rules.attendanceSummary(votes, members);
  assert.equal(summary.count, 7);
  assert.deepEqual(summary.formats, { "5v5": { ok: true, rest: 2 }, "6v6": { ok: true, rest: 1 } });
  assert.deepEqual(summary.attend, members.slice(0, 7));
  assert.deepEqual(summary.absent, [members[7]]);
  assert.deepEqual(summary.pending, members.slice(8));
});

test("참석 4명은 두 포맷 불가이며 비활동·미등록·중복 표는 인원을 늘리지 않는다", () => {
  const votes = members.slice(0, 5).map((member) => ({ member_id: member.id, choice: "attend" }));
  votes.push(votes[0], { member_id: "unknown", choice: "attend" });
  const roster = members.map((member) => ({ ...member, active: member.id !== "m05" }));
  const summary = rules.attendanceSummary(votes, roster);
  assert.equal(summary.count, 4);
  assert.deepEqual(summary.formats, { "5v5": { ok: false, rest: null }, "6v6": { ok: false, rest: null } });
  assert.equal(summary.pending.length, 7);
});

test("lateVoteRows 미투표 2명과 지각 1명만 벌금 부과하고 회장도 포함한다", () => {
  const roster = members.slice(0, 5);
  const votes = [
    { poll_id: poll.id, member_id: "m01", choice: "attend", is_late: false },
    { poll_id: poll.id, member_id: "m02", choice: "absent", is_late: false },
    { poll_id: poll.id, member_id: "m04", choice: "absent", is_late: true },
    { poll_id: "another", member_id: "m03", choice: "attend", is_late: false }
  ];
  assert.deepEqual(rules.lateVoteRows(poll, votes, roster, 5000, "2026-10-12"), ["m03", "m04", "m05"].map((id) => ({
    member_id: id, category: "fine_late_vote", amount: 5000, ref_poll_id: poll.id,
    entry_date: "2026-10-12", note: "투표 마감 미참여"
  })));
});

test("lateVoteRows는 취소된 투표와 비활동 멤버를 제외한다", () => {
  assert.deepEqual(rules.lateVoteRows({ ...poll, cancelled: true }, [], members, 5000, "2026-10-12"), []);
  assert.deepEqual(rules.lateVoteRows(poll, [], [{ ...members[0], active: false }], 5000, "2026-10-12"), []);
});

test("벌금 제외 투표는 미투표·지각 투표 모두 벌금이 없고 기존 데이터는 그대로 부과한다", () => {
  const ballot = [{ poll_id: poll.id, member_id: members[0].id, is_late: true }];
  assert.deepEqual(rules.lateVoteRows({ ...poll, fines: false }, ballot, members, 5000, "2026-10-12"), []);
  for (const fines of [undefined, true]) {
    assert.equal(rules.lateVoteRows({ ...poll, fines }, ballot, members, 5000, "2026-10-12").length, members.length);
  }
});

test("pollTitle은 제목을 보존하고 없으면 실제 요일을 계산한다", () => {
  assert.equal(rules.pollTitle({ match_date: "2026-10-22", title: "개천절 특별 매치" }), "개천절 특별 매치");
  assert.equal(rules.pollTitle({ match_date: "2026-10-17", title: null }), "10/17(토) 경기");
  assert.equal(rules.pollTitle({ match_date: "2026-10-21" }), "10/21(수) 경기");
  assert.equal(rules.pollTitle({ match_date: "2027-01-01", title: "" }), "1/1(금) 경기");
});

test("pollDateLabel·pollHeading은 제목이 있어도 날짜를 먼저 보여 준다", () => {
  assert.equal(rules.pollDateLabel({ match_date: "2026-10-24" }), "10/24(토)");
  assert.equal(rules.pollHeading({ match_date: "2026-10-24", title: "정기 풋살" }), "10/24 토 정기 풋살");
  assert.equal(rules.pollHeading({ match_date: "2026-10-22", title: null }), "10/22 목 경기");
  assert.equal(rules.pollHeading({ match_date: "2027-01-01", title: "" }), "1/1 금 경기");
});

test("longDate는 월·일·요일을 풀어 쓴다", () => {
  assert.equal(rules.longDate("2026-10-24"), "10월 24일 토요일");
  assert.equal(rules.longDate("2027-01-01"), "1월 1일 금요일");
});

test("matchForPoll은 투표 id 연결을 우선하고 없으면 같은 날짜의 예정 매치를 고른다", () => {
  const weekly = { id: "p1", match_date: "2026-10-24" };
  const linked = { id: "m1", poll_id: "p1", match_date: "2026-10-25", status: "scheduled" };
  const sameDay = { id: "m2", poll_id: null, match_date: "2026-10-24", status: "scheduled" };
  const cancelled = { id: "m3", poll_id: "p1", match_date: "2026-10-24", status: "cancelled" };
  assert.equal(rules.matchForPoll(weekly, [sameDay, linked, cancelled]), linked);
  assert.equal(rules.matchForPoll(weekly, [cancelled, sameDay]), sameDay);
  assert.equal(rules.matchForPoll(weekly, [cancelled]), null);
  assert.equal(rules.matchForPoll(weekly, undefined), null);
});

test("pollMatchLine은 확정 매치의 시간·구장·상대를, 없으면 날짜와 미확정을 보여 준다", () => {
  const poll = { id: "p1", match_date: "2026-10-24" };
  assert.deepEqual(rules.pollMatchLine(poll, null), { confirmed: false, title: "10월 24일 토요일 · 매치 미확정", sub: "매칭 탭에서 상대팀을 찾는 중입니다" });
  const match = { match_date: "2026-10-24", start_time: "08:00:00", end_time: "10:00:00", venue: "도봉풋살장", opponent: "FC 데모", format: "6v6", cost: 60000, memo: "주차 무료" };
  assert.deepEqual(rules.pollMatchLine(poll, match), { confirmed: true, title: "10월 24일 토요일 08:00~10:00 · 도봉풋살장", sub: "상대 FC 데모 · 6v6 · 구장비 60,000원 · 주차 무료" });
  assert.deepEqual(rules.pollMatchLine(poll, { match_date: "2026-10-24", start_time: "08:00:00" }),
    { confirmed: true, title: "10월 24일 토요일 08:00 · 구장 미정", sub: "상대 미정 · 포맷 미정 · 구장비 0원" });
  assert.equal(rules.pollMatchLine(poll, { match_date: "2026-10-24" }).title, "10월 24일 토요일 시간 미정 · 구장 미정");
});

test("deleteSummary는 함께 지워지는 기록 수와 연결만 풀리는 매치 수를 문장으로 만든다", () => {
  assert.equal(rules.deleteSummary({ votes: 7 }), "투표 기록 7건이 함께 삭제되고 되돌릴 수 없습니다.");
  assert.equal(rules.deleteSummary({ votes: 7, fines: 2, matches: 1 }),
    "투표 기록 7건과 벌금 기록 2건이 함께 삭제되고 되돌릴 수 없습니다. 연결된 매치 1건은 그대로 두고 투표 연결만 풉니다.");
  assert.equal(rules.deleteSummary(), "투표 기록 0건이 함께 삭제되고 되돌릴 수 없습니다.");
});

test("daysUntil은 KST 날짜 기준으로 남은 날을 세고 같은 날이면 0이다", () => {
  assert.equal(rules.daysUntil("2026-10-19T13:00:00+09:00", "2026-10-18T22:30:00+09:00"), 1);
  assert.equal(rules.daysUntil("2026-10-19T13:00:00+09:00", "2026-10-19T03:00:00+09:00"), 0);
  // UTC로는 10/18 15:30이지만 KST로는 10/19 00:30 → 같은 날.
  assert.equal(rules.daysUntil("2026-10-19T13:00:00+09:00", "2026-10-18T15:30:00Z"), 0);
  assert.equal(rules.daysUntil("2026-10-24T00:00:00+09:00", "2026-10-18T12:00:00+09:00"), 6);
});

test("특별 투표는 제목 또는 토요일 이외 날짜로 구분하고 벌금 설정과는 독립이다", () => {
  assert.equal(rules.isSpecialPoll({ match_date: "2026-10-17", fines: false }), false);
  assert.equal(rules.isSpecialPoll({ match_date: "2026-10-17", title: "이벤트" }), false);
  assert.equal(rules.isSpecialPoll({ match_date: "2026-10-22" }), true);
});

test("12명 월회비와 4주 이상 부상 1명의 50% 면제 행을 만든다", () => {
  const rows = rules.monthlyDuesRows(members, "2026-10", config);
  assert.equal(rows.length, 13);
  assert.equal(rows.filter((row) => row.category === "dues" && row.amount === 30000 && row.note === "10월 회비").length, 12);
  assert.ok(rows.every((row) => row.entry_date === "2026-10-01"));
  assert.deepEqual(rows.find((row) => row.category === "injury_exempt"), {
    member_id: "m07", category: "injury_exempt", amount: -15000, entry_date: "2026-10-01", period: "2026-10", note: "부상 면제 50%"
  });
});

for (const [from, to, month, exempt] of [
  ["2026-10-01", "2026-10-27", "2026-10", false],
  ["2026-10-01", "2026-10-28", "2026-10", true],
  ["2026-09-01", "2026-10-01", "2026-10", true],
  ["2026-10-31", "2026-11-30", "2026-10", true],
  ["2026-09-01", "2026-09-30", "2026-10", false],
  ["2026-11-01", "2026-11-30", "2026-10", false],
  ["2028-02-02", "2028-02-29", "2028-02", true],
  ["2026-10-28", "2026-10-01", "2026-10", false],
  ["2026-10-01", null, "2026-10", false]
]) test(`부상 ${from}~${to}, ${month} 면제=${exempt}`, () => {
  const rows = rules.monthlyDuesRows([{ ...members[0], injury_from: from, injury_to: to }], month, config);
  assert.equal(rows.length, exempt ? 2 : 1);
});

test("월회비는 비활동 멤버를 제외하고 설정 금액·면제율을 사용한다", () => {
  assert.deepEqual(rules.monthlyDuesRows([{ ...members[0], active: false }], "2026-10", config), []);
  const rows = rules.monthlyDuesRows([members[6]], "2026-10", { DUES_MONTHLY: 40000, INJURY_EXEMPT_RATE: 0.25 });
  assert.equal(rows[0].amount, 40000);
  assert.equal(rows[1].amount, -10000);
  assert.equal(rows[1].note, "부상 면제 25%");
});

for (const [input, expected] of [
  ["2026-10-15T11:59:59+09:00", "방금"], ["2026-10-15T11:58:00+09:00", "2분 전"],
  ["2026-10-15T09:00:00+09:00", "3시간 전"], [new Date("2026-10-13T12:00:00+09:00"), "2일 전"],
  ["2026-10-15T14:00:00+09:00", "2시간 후"], ["invalid", "시간 미상"]
]) test(`formatRelative → ${expected}`, () => assert.equal(rules.formatRelative(input, "2026-10-15T12:00:00+09:00"), expected));

test("displayDate는 월·일과 실제 요일을 표시한다", () => {
  assert.equal(rules.displayDate("2026-10-24"), "10/24 토");
  assert.equal(rules.displayDate("2027-01-01"), "1/1 금");
});

test("displayDate는 윤년의 요일도 시간대와 무관하게 계산한다", () => {
  assert.equal(rules.displayDate("2028-02-29"), "2/29 화");
});

test("displayDate는 weekday 옵션으로 요일을 생략한다", () => {
  assert.equal(rules.displayDate("2026-10-24", { weekday: false }), "10/24");
});
