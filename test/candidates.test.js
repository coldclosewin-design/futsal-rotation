const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const api = require("../js/candidates.js");
const fixture = require("./fixtures/demo-data.json");
const titles = require("./fixtures/cafe-titles.json");
const today = "2026-10-15";
const rows = api.shiftDemoDates(fixture.match_candidates, today);
const base = rows.find((row) => row.article_id === 2589474);

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
