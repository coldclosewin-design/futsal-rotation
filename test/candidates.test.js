const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const api = require("../js/candidates.js");
const rules = require("../js/rules.js");
const fixture = require("./fixtures/demo-data.json");
const titles = require("./fixtures/cafe-titles.json");
const today = "2026-10-15";
const rows = api.shiftDemoDates(fixture.match_candidates, today);
const base = rows.find((row) => row.article_id === 2589474);

const statusToday = "2026-10-19";
const statusNow = "2026-10-19T09:00:00.000Z";
const statusRow = { parsed_date: "2026-10-24", weekday: "토", start_hour: 8, parse_ok: true,
  is_closed: false, contact_status: "new", last_seen_at: "2026-10-19T08:00:00.000Z" };

test("candidateStatus: 수요일 글만 있어도 전체 행의 마지막 수집 시각을 반환한다", () => {
  assert.deepEqual(api.candidateStatus([{ ...statusRow, parsed_date: "2026-10-21", weekday: "수" }], statusToday, statusNow), {
    lastSeenAt: statusRow.last_seen_at, saturday: "2026-10-24", total: 0, morning: 0, open: 0, morningOpen: 0
  });
});

test("candidateStatus: 토요일 오후 글은 전체·미마감 수에만 포함한다", () => {
  assert.deepEqual(api.candidateStatus([{ ...statusRow, start_hour: 13 }], statusToday, statusNow), {
    lastSeenAt: statusRow.last_seen_at, saturday: "2026-10-24", total: 1, morning: 0, open: 1, morningOpen: 0
  });
});

test("candidateStatus: 마감 포함 집계와 순서에 무관한 최대 수집 시각, 입력 불변", () => {
  const inputs = Object.freeze([
    Object.freeze({ ...statusRow, last_seen_at: "2026-10-19T15:00:00+09:00" }),
    Object.freeze({ ...statusRow, is_closed: true, last_seen_at: "2026-10-19T17:30:00+09:00" }),
    Object.freeze({ ...statusRow, start_hour: 13 })
  ]);
  const before = JSON.stringify(inputs);
  const expected = { lastSeenAt: "2026-10-19T08:30:00.000Z", saturday: "2026-10-24", total: 3, morning: 2, open: 2, morningOpen: 1 };
  assert.deepEqual(api.candidateStatus(inputs, statusToday, statusNow), expected);
  assert.deepEqual(api.candidateStatus([...inputs].reverse(), statusToday, statusNow), expected);
  assert.equal(JSON.stringify(inputs), before);
});

test("candidateStatus: 수집 시각 없음·무효, 시간 미정·미분류와 빈 배열", () => {
  assert.deepEqual(api.candidateStatus([
    { ...statusRow, start_hour: 0, last_seen_at: undefined },
    { ...statusRow, start_hour: null, parse_ok: false, last_seen_at: "invalid" }
  ], statusToday, statusNow), {
    lastSeenAt: null, saturday: "2026-10-24", total: 2, morning: 1, open: 2, morningOpen: 1
  });
  assert.deepEqual(api.candidateStatus([], statusToday, statusNow), {
    lastSeenAt: null, saturday: "2026-10-24", total: 0, morning: 0, open: 0, morningOpen: 0
  });
});

test("candidateStatus: 지난 토요일·73시간 된 미연락 글은 제외하고 72시간 경계·연락한 글은 유지한다", () => {
  const hoursAgo = (hours) => new Date(Date.parse(statusNow) - hours * 3600000).toISOString();
  const inputs = [
    { ...statusRow, parsed_date: "2026-10-17", last_seen_at: statusNow },
    { ...statusRow, last_seen_at: hoursAgo(73) },
    { ...statusRow, last_seen_at: hoursAgo(72) },
    { ...statusRow, last_seen_at: hoursAgo(73), contact_status: "contacted" },
    { ...statusRow, parsed_date: "2026-10-31" }
  ];
  assert.deepEqual(api.candidateStatus(inputs, statusToday, statusNow), {
    lastSeenAt: statusNow, saturday: "2026-10-24", total: 2, morning: 2, open: 2, morningOpen: 2
  });
  assert.equal(api.candidateStatus(inputs, statusToday, statusNow, { staleHours: 74 }).total, 3);
  assert.equal(api.candidateStatus(inputs, statusToday, statusNow, { staleHours: 1 }).total, 1);
});

test("candidateStatus: 이번 토요일 계산은 오늘 토요일·월말·연말에도 nextSaturday와 같다", () => {
  for (const date of ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-31", "2026-12-31"]) {
    assert.equal(api.candidateStatus([], date, statusNow).saturday, rules.nextSaturday(date));
  }
  assert.equal(api.candidateStatus([], "2026-10-24", statusNow).saturday, "2026-10-24");
});

test("candidateEmptyMessage: 매물 없음·오후만·오전 전부 마감·지역과 포맷 안내 우선순위", () => {
  const status = { saturday: "2026-10-24", total: 3, morning: 2, open: 2, morningOpen: 1 };
  const cases = [
    [{ ...status, total: 0, morning: 0, morningOpen: 0 }, {}, "이번 주 토요일(10/24) 매물이 아직 없습니다. 보통 수~금에 올라옵니다."],
    [{ ...status, total: 1, morning: 0, morningOpen: 0 }, {}, "이번 주 토요일 매물 1건 중 오전 경기는 없습니다. '오전만'을 끄면 보입니다."],
    [{ ...status, morningOpen: 0 }, {}, "이번 주 토요일 오전 매물 2건은 모두 마감되었습니다. '마감 포함'을 켜면 보입니다."],
    [status, { menuIds: [625], formats: ["5v5"] }, "조건에 맞는 후보가 없습니다. 지역·포맷 필터를 확인해 보세요."]
  ];
  for (const [input, filters, expected] of cases) {
    assert.equal(api.candidateEmptyMessage(input, { ...api.DEFAULT_FILTERS, ...filters }), expected);
  }
  const fallback = cases[3][2];
  assert.equal(api.candidateEmptyMessage({ ...status, morning: 0 }, { ...api.DEFAULT_FILTERS, morningOnly: false }), fallback);
  assert.equal(api.candidateEmptyMessage({ ...status, morningOpen: 0 }, { ...api.DEFAULT_FILTERS, includeClosed: true }), fallback);
  assert.equal(api.candidateEmptyMessage({ ...status, morningOpen: 0 }, { ...api.DEFAULT_FILTERS, saturdayOnly: false }), fallback);
  const nextYear = { ...status, saturday: "2027-01-02", total: 0 };
  assert.ok(api.candidateEmptyMessage(nextYear, api.DEFAULT_FILTERS).includes(`(${rules.displayDate(nextYear.saturday, { weekday: false })})`));
});

const historyMatch = { match_date: "2026-10-10", start_time: "08:00", venue: "도봉풋살장",
  opponent: "테스트 FC", format: "6v6", status: "played", score_us: 4, score_them: 3, attendance_count: 7 };
const historyLabels = { played: "경기 완료", cancelled: "취소", fallback_plab: "플랩 전환" };

test("지난 경기: 4:3 완료는 스코어·참석 수·승리를 표시하고 우리 기준으로 승패를 판단한다", () => {
  const row = { ...historyMatch };
  assert.deepEqual(api.describeHistory(row, historyLabels), {
    title: "10/10(토) · 도봉풋살장 · 4:3",
    sub: "상대 테스트 FC · 6v6 · 참석 7명 · 경기 완료", result: "win"
  });
  assert.equal(api.describeHistory({ ...row, score_us: 2 }, historyLabels).result, "loss");
  assert.deepEqual(row, historyMatch);
});

test("지난 경기: 2:2 완료는 무승부이고 0:0도 유효한 스코어다", () => {
  const detail = api.describeHistory({ ...historyMatch, score_us: 2, score_them: 2 }, historyLabels);
  assert.equal(detail.title, "10/10(토) · 도봉풋살장 · 2:2");
  assert.equal(detail.result, "draw");
  assert.equal(api.describeHistory({ ...historyMatch, score_us: 0, score_them: 0 }).result, "draw");
});

test("지난 경기: 스코어 없는 취소는 none과 취소 라벨이며 미완료 스코어는 승패가 없다", () => {
  const row = { ...historyMatch, status: "cancelled", score_us: null, score_them: null };
  assert.deepEqual(api.describeHistory(row, historyLabels), {
    title: "10/10(토) · 도봉풋살장",
    sub: "상대 테스트 FC · 6v6 · 참석 7명 · 취소", result: "none"
  });
  assert.equal(api.describeHistory({ ...historyMatch, status: "fallback_plab" }, historyLabels).result, "none");
  for (const score_us of [null, undefined, "4", NaN, Infinity]) {
    const detail = api.describeHistory({ ...historyMatch, score_us }, historyLabels);
    assert.equal(detail.result, "none");
    assert.equal(detail.title, "10/10(토) · 도봉풋살장");
  }
});

test("지난 경기: 참석 수가 없으면 참석 —명, 누락 필드와 상태 라벨 맵의 폴백을 표시한다", () => {
  for (const attendance_count of [undefined, null, "7", NaN]) {
    const detail = api.describeHistory({ ...historyMatch, venue: null, opponent: null, format: null, attendance_count });
    assert.equal(detail.title, "10/10(토) · 구장 미정 · 4:3");
    assert.equal(detail.sub, "상대 미정 · 포맷 미정 · 참석 —명 · played");
  }
  assert.match(api.describeHistory({ ...historyMatch, attendance_count: 0 }, historyLabels).sub, /참석 0명/);
});

test("Node와 브라우저에서 DOM 없이 동일한 후보 API를 제공한다", () => {
  const context = { window: {} };
  runInNewContext(readFileSync(join(__dirname, "../js/candidates.js"), "utf8"), context);
  assert.deepEqual(Object.keys(context.window.ExicanCandidates), Object.keys(api));
});

test("데모 실제 제목 10개와 더미 연락처 하나만 사용한다", () => {
  assert.equal(rows.length, 10);
  for (const row of rows) assert.equal(row.subject, titles.find((item) => item.articleId === row.article_id).subject);
  assert.deepEqual(rows.filter((row) => row.phone).map((row) => row.phone), ["010-0000-0000"]);
  assert.equal(rows.filter((row) => row.contact_status === "contacted").length, 1);
});

test("기본 필터는 토요일 오전 4건을 점수순으로, 미분류 1건을 별도로 반환한다", () => {
  const result = api.filterCandidates(rows, api.DEFAULT_FILTERS, today);
  assert.deepEqual(result.ranked.map((row) => row.article_id), [2589474, 2589739, 2589699, 2589263]);
  assert.deepEqual(result.unparsed.map((row) => row.article_id), [2590029]);
});

test("마감 포함을 켜면 토요일 오전 마감 후보 1건이 추가된다", () => {
  const result = api.filterCandidates(rows, { includeClosed: true }, today);
  assert.equal(result.ranked.length, 5);
  assert.equal(result.ranked.filter((row) => row.is_closed).length, 1);
});

test("지역을 여러 개 선택하면 해당 메뉴만 남는다", () => {
  const result = api.filterCandidates(rows, { menuIds: [623, 922], saturdayOnly: false, morningOnly: false }, today);
  assert.deepEqual(result.ranked.map((row) => row.article_id), [2589464, 2590162, 2589518]);
  assert.equal(result.unparsed.length, 0);
});

test("토요일·오전 필터를 각각 해제하면 일요일과 오후 후보가 보인다", () => {
  assert.equal(api.filterCandidates(rows, { saturdayOnly: false }, today).ranked.length, 5);
  assert.equal(api.filterCandidates(rows, { morningOnly: false }, today).ranked.length, 5);
  assert.equal(api.filterCandidates(rows, { saturdayOnly: false, morningOnly: false }, today).ranked.length, 8);
});

test("포맷 필터는 쉼표 구분 목록의 정확한 포맷을 찾는다", () => {
  const inputs = [{ ...base, parsed_format: "5v5,6v6" }, { ...base, article_id: 2, parsed_format: "15v5" }];
  assert.equal(api.filterCandidates(inputs, { formats: ["5v5"] }, today).ranked.length, 1);
  assert.equal(api.filterCandidates(rows, { formats: ["5v5"] }, today).ranked.length, 1);
  assert.equal(api.filterCandidates(rows, { formats: ["6v6"] }, today).ranked.length, 2);
});

test("과거 날짜는 미분류·마감 포함이어도 항상 제외한다", () => {
  const result = api.filterCandidates([{ ...base, parsed_date: "2026-10-14" },
    { ...base, parse_ok: false, parsed_date: "2026-10-14" }], { includeClosed: true, includeUnparsed: true }, today);
  assert.deepEqual(result, { ranked: [], unparsed: [] });
});

test("미분류에는 토요일·오전 제한을 적용하지 않지만 지역과 포맷 제한은 적용한다", () => {
  const unparsed = { ...base, parse_ok: false, weekday: "월", start_hour: 20, parsed_date: null };
  assert.deepEqual(api.filterCandidates([unparsed], {}, today).unparsed, [unparsed]);
  assert.equal(api.filterCandidates([unparsed], { includeUnparsed: false }, today).unparsed.length, 0);
  assert.equal(api.filterCandidates([unparsed], { menuIds: [623] }, today).unparsed.length, 0);
  assert.equal(api.filterCandidates([unparsed], { formats: ["5v5"] }, today).unparsed.length, 0);
});

test("오전 필터에서 0시는 포함하고 시간 미정과 정오를 제외한다", () => {
  const inputs = [0, 11, 12, null].map((hour, index) => ({ ...base, article_id: index, start_hour: hour }));
  assert.deepEqual(api.filterCandidates(inputs, {}, today).ranked.map((row) => row.start_hour), [0, 11]);
});

test("동점은 작성 시각 내림차순이며 원본 배열을 바꾸지 않는다", () => {
  const inputs = [
    { ...base, article_id: 1, write_ts: "2026-10-15T01:00:00+09:00" },
    { ...base, article_id: 2, write_ts: "2026-10-14T23:00:00Z" },
    { ...base, article_id: 3, scraper_score: 1, write_ts: "2026-10-15T10:00:00Z" }
  ];
  const original = JSON.stringify(inputs);
  assert.deepEqual(api.filterCandidates(inputs, {}, today).ranked.map((row) => row.article_id), [2, 1, 3]);
  assert.equal(JSON.stringify(inputs), original);
});

for (const [patch, expected] of [
  [{}, "10/17(토) 08~10시"], [{ start_hour: null }, "10/17(토) 시간 미정"],
  [{ parsed_date: null }, "일정 미분류"], [{ start_hour: 0, end_hour: null }, "10/17(토) 00시"],
  [{ weekday: null, start_hour: 22, end_hour: 24 }, "10/17(토) 22~24시"]
]) test(`describeSchedule: ${expected}`, () => assert.equal(api.describeSchedule({ ...base, ...patch }), expected));

test("상태 순서와 한글 라벨, 종료 상태를 제공한다", () => {
  assert.equal(api.nextStatus("new"), "contacted");
  assert.equal(api.nextStatus("contacted"), "replied");
  assert.equal(api.nextStatus("replied"), "confirmed");
  assert.equal(api.nextStatus("confirmed"), "confirmed");
  assert.equal(api.nextStatus("rejected"), "rejected");
  assert.equal(api.nextStatus("unknown"), "new");
  assert.equal(api.nextStatus("constructor"), "new");
  assert.deepEqual(api.STATUS_LABELS, { new: "미연락", contacted: "문자 보냄", replied: "답장 옴", confirmed: "확정", rejected: "거절/불발" });
});

test("저장된 필터는 타입과 알려진 지역·포맷을 검사한다", () => {
  assert.deepEqual(api.normalizeFilters(null, [623]), api.DEFAULT_FILTERS);
  assert.deepEqual(api.normalizeFilters({ menuIds: ["623", 999, 623], morningOnly: false, saturdayOnly: "false", formats: ["5v5", "other"] }, [623]),
    { ...api.DEFAULT_FILTERS, menuIds: [623], morningOnly: false, formats: ["5v5"] });
  assert.deepEqual(api.normalizeFilters({ menuIds: [999], formats: ["other"] }, [623]), api.DEFAULT_FILTERS);
});

test("데모 날짜는 연도를 넘어서 같은 요일의 다가오는 날짜로 이동하며 원본을 유지한다", () => {
  const inputs = [{ parsed_date: "2026-10-17", weekday: "토" }, { parsed_date: null }, { match_date: "2026-10-18" }];
  const shifted = api.shiftDemoDates(inputs, "2026-12-31");
  assert.deepEqual(shifted, [{ parsed_date: "2027-01-02", weekday: "토" }, { parsed_date: null }, { match_date: "2027-01-03" }]);
  assert.equal(inputs[0].parsed_date, "2026-10-17");
  assert.equal(api.shiftDemoDates(inputs, "2026-10-17")[0].parsed_date, "2026-10-17");
});

test("고정 픽스처 날짜가 지난 뒤에도 기본 후보 4건과 미분류 1건이 유지된다", () => {
  const future = "2029-03-01";
  const result = api.filterCandidates(api.shiftDemoDates(fixture.match_candidates, future), {}, future);
  assert.equal(result.ranked.length, 4);
  assert.equal(result.unparsed.length, 1);
});

test("홈 매치 요약은 날짜·시간·구장·포맷·금액을 표시한다", () => {
  assert.equal(api.describeMatch(fixture.matches[0]), "10/17(토) 08:00~10:00 · 도봉풋살장 · 6v6 · 구장비 60,000원");
  assert.equal(api.describeMatch({ match_date: "2026-10-17", start_time: "08:00:00" }), "10/17(토) 08:00 · 구장 미정 · 포맷 미정 · 구장비 0원");
});

test("후보 저장 패치는 cost를 제외하고 허용된 회장 필드만 반환한다", () => {
  const fields = { phone: "010-0000-0000", memo: " 확인 ", our_priority: "2", contact_status: "replied", cost: 60000, scraper_score: 999 };
  assert.deepEqual(api.buildCandidatePatch(fields, "now"), {
    phone: "010-0000-0000", memo: "확인", our_priority: 2, contact_status: "replied", admin_updated_at: "now"
  });
  assert.equal(api.buildCandidatePatch({ contact_status: "new" }, "now").phone, null);
  assert.throws(() => api.buildCandidatePatch({ contact_status: "invalid" }, "now"), /연락 상태/);
  assert.throws(() => api.buildCandidatePatch({ contact_status: "new", our_priority: 4 }, "now"), /우선순위/);
});

const fields = { match_date: "2026-10-17", start_time: "06:00", end_time: "08:00", venue: "테스트 구장", opponent: "",
  cost: "60000", format: "6v6", memo: "확인" };
const context = { presidentId: "m03", poll: { id: "demo-poll-1", match_date: "2026-10-17" } };

test("확정 행은 cost와 후보·회장·같은 날짜 투표를 연결한다", () => {
  assert.deepEqual(api.buildMatchRow(base, fields, context), {
    match_date: "2026-10-17", start_time: "06:00", end_time: "08:00", venue: "테스트 구장", opponent: null,
    cost: 60000, format: "6v6", memo: "확인", candidate_article_id: base.article_id,
    arranged_by: "m03", poll_id: "demo-poll-1", status: "scheduled"
  });
  assert.equal(api.buildMatchRow(base, { ...fields, match_date: "2026-10-18" }, context).poll_id, null);
  assert.equal(api.buildMatchRow(base, fields, { presidentId: "m03", poll: null }).poll_id, null);
});

test("확정 입력은 날짜·시간·정수 금액·포맷과 회장을 검사한다", () => {
  for (const patch of [{ match_date: "2026-02-30" }, { start_time: "24:00" }, { end_time: "25:00" },
    { cost: -1 }, { cost: 1.5 }, { cost: 2147483648 }, { format: "7v7" }]) {
    assert.throws(() => api.buildMatchRow(base, { ...fields, ...patch }, context));
  }
  assert.throws(() => api.buildMatchRow(base, fields, { poll: null }), /회장/);
  assert.equal(api.buildMatchRow(base, { ...fields, end_time: "24:00" }, context).end_time, "24:00");
});

const now = "2026-10-15T03:00:00Z";
const seenHoursAgo = (hours) => new Date(Date.parse(now) - hours * 3600000).toISOString();

for (const parseOk of [true, false]) {
  const candidate = { ...base, parse_ok: parseOk, contact_status: "new" };
  const group = parseOk ? "ranked" : "unparsed";
  test(`${group}: 73시간 된 미연락 글은 만료하지만 72시간 경계와 최근 글은 유지한다`, () => {
    const inputs = [73, 72, 1].map((hours) => ({ ...candidate, article_id: hours, last_seen_at: seenHoursAgo(hours) }));
    assert.deepEqual(api.filterCandidates(inputs, {}, today, now)[group].map((row) => row.article_id), [72, 1]);
    assert.equal(api.filterCandidates(inputs, { staleHours: 74 }, today, now)[group].length, 3);
    assert.equal(api.filterCandidates(inputs, { staleHours: 24 }, today, now)[group].length, 1);
    assert.equal(api.filterCandidates(inputs, {}, today)[group].length, 3);
  });
  test(`${group}: 마지막 수집 시각이 없거나 잘못되면 유지한다`, () => {
    for (const lastSeen of [undefined, null, "", "invalid"]) {
      assert.equal(api.filterCandidates([{ ...candidate, last_seen_at: lastSeen }], {}, today, now)[group].length, 1);
    }
    assert.equal(api.filterCandidates([{ ...candidate, last_seen_at: seenHoursAgo(73) }], {}, today, "invalid")[group].length, 1);
  });
  test(`${group}: 회장이 연락 상태를 변경한 글은 73시간이 지나도 유지한다`, () => {
    for (const status of ["contacted", "replied", "confirmed", "rejected"]) {
      assert.equal(api.filterCandidates([{ ...candidate, contact_status: status, last_seen_at: seenHoursAgo(73) }], {}, today, now)[group].length, 1);
    }
  });
  test(`${group}: 마감된 확정 글은 기본 필터에서 유지하고 과거 글은 제외한다`, () => {
    const confirmed = { ...candidate, is_closed: true, contact_status: "confirmed", last_seen_at: seenHoursAgo(73) };
    assert.equal(api.filterCandidates([confirmed], {}, today, now)[group].length, 1);
    assert.equal(api.filterCandidates([{ ...confirmed, contact_status: "new" }], {}, today)[group].length, 0);
    assert.equal(api.filterCandidates([{ ...confirmed, parsed_date: "2026-10-14" }], {}, today, now)[group].length, 0);
  });
}

test("만료 시간을 사용자 필터에 저장하지 않고 시각 없는 데모 후보 4건·미분류 1건을 유지한다", () => {
  assert.equal(Object.hasOwn(api.DEFAULT_FILTERS, "staleHours"), false);
  assert.equal(Object.hasOwn(api.normalizeFilters({ staleHours: 1 }, [623]), "staleHours"), false);
  const result = api.filterCandidates(rows, { staleHours: 72 }, today, now);
  assert.equal(result.ranked.length, 4);
  assert.equal(result.unparsed.length, 1);
});

for (const opponent of [null, "테스트팀"]) {
  for (const memo of [null, "입장 10분 전 집합"]) {
    test(`확정 매치 상세: 상대 ${opponent ? "있음" : "없음"}, 메모 ${memo ? "있음" : "없음"}`, () => {
      assert.deepEqual(api.describeMatchDetail({ ...fixture.matches[0], opponent, memo }), {
        title: "10/17(토) 08:00~10:00 · 도봉풋살장",
        sub: `${opponent ? "상대 테스트팀" : "상대 미정"} · 6v6 · 구장비 60,000원${memo ? " · 입장 10분 전 집합" : ""}`
      });
    });
  }
}

test("확정 매치 상세는 구장·포맷 미정, 종료 시각 생략과 시간 미정을 표시한다", () => {
  assert.deepEqual(api.describeMatchDetail({ match_date: "2026-10-17", start_time: "08:30:00" }), {
    title: "10/17(토) 08:30 · 구장 미정", sub: "상대 미정 · 포맷 미정 · 구장비 0원"
  });
  assert.equal(api.describeMatchDetail({ match_date: "2026-10-18" }).title, "10/18(일) 시간 미정 · 구장 미정");
});

function candidateData(client, demoRows) {
  const context = { URLSearchParams, location: { search: demoRows ? "?demo=1" : "" },
    isConfigured: () => true, ExicanAuth: { init: async () => client }, showToast: () => {},
    document: { querySelector: () => ({}) },
    fetch: async () => ({ ok: true, json: async () => ({ polls: [], poll_votes: [], match_candidates: demoRows }) }),
    window: { ExicanRules: { kstDate: () => today } } };
  runInNewContext(readFileSync(join(__dirname, "../js/data.js"), "utf8"), context);
  return context.window.ExicanData;
}

test("seenSince 데모 조회는 시각 없는 픽스처와 연락한 미분류를 유지하고 오래된 미연락은 제외한다", async () => {
  const stale = { ...base, article_id: 1, parsed_date: null, parse_ok: false, last_seen_at: seenHoursAgo(73), contact_status: "new" };
  const data = candidateData(null, [...rows, stale, { ...stale, article_id: 2, contact_status: "contacted" }]);
  const result = await data.candidates({ includeClosed: true, seenSince: seenHoursAgo(72) });
  assert.equal(result.length, rows.length + 1);
  assert.equal(result.some((row) => row.article_id === 1), false);
  assert.equal(result.some((row) => row.article_id === 2), true);
});

test("seenSince 라이브 조회는 서버 시각 제한과 날짜 없는 예외 조회를 합친다", async () => {
  const calls = [];
  const fresh = { ...base, article_id: 1, scraper_score: 10 };
  const contacted = { ...base, article_id: 2, scraper_score: 20, parsed_date: null, contact_status: "contacted" };
  const failure = new Error("예외 글 조회 실패");
  let fail = false;
  const client = { from(table) {
    assert.equal(table, "match_candidates");
    const operations = [];
    calls.push(operations);
    const query = {};
    for (const method of ["select", "order", "gte", "lte", "eq", "is", "or"]) {
      query[method] = (...args) => { operations.push([method, ...args]); return query; };
    }
    query.then = (resolve, reject) => {
      const exception = operations.some(([method]) => method === "or");
      return Promise.resolve({ data: exception ? [contacted] : [fresh], error: exception && fail ? failure : null }).then(resolve, reject);
    };
    return query;
  } };
  const data = candidateData(client);
  const cutoff = seenHoursAgo(72);
  const result = await data.candidates({ seenSince: cutoff, menuId: 625 });
  assert.deepEqual(Array.from(result, (row) => row.article_id), [2, 1]);
  assert.ok(calls[0].some(([method, column, value]) => method === "gte" && column === "last_seen_at" && value === cutoff));
  assert.ok(calls[1].some(([method, column, value]) => method === "is" && column === "parsed_date" && value === null));
  assert.ok(calls[1].some(([method, value]) => method === "or" && value === `and(contact_status.neq.new,last_seen_at.lt.${cutoff}),last_seen_at.is.null`));
  for (const operations of calls) {
    assert.ok(operations.some(([method, column, value]) => method === "eq" && column === "menu_id" && value === 625));
    assert.ok(operations.some(([method, column, value]) => method === "eq" && column === "is_closed" && value === false));
  }
  calls.length = 0;
  await data.candidates({ from: today, includeClosed: true });
  assert.equal(calls.length, 1);
  assert.ok(calls[0].some(([method, column, value]) => method === "gte" && column === "parsed_date" && value === today));
  fail = true;
  await assert.rejects(data.candidates({ seenSince: cutoff }), failure);
});
