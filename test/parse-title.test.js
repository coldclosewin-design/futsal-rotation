const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { execFileSync } = require("node:child_process");
const { parseTitle, scoreCandidate, SCORE } = require("../js/parse-title.js");
const config = require("../js/config.js");
const fixtures = JSON.parse(readFileSync(join(__dirname, "fixtures/cafe-titles.json"), "utf8"));
const WRITE_TS = "2026-10-14T12:00+09:00";
const NOW = "2026-10-15T09:00+09:00";

test("원본 픽스처 60건이 반환 계약을 만족하고 날짜·시간 추출률이 각각 85% 이상이다", (t) => {
  assert.equal(fixtures.length, 60);
  const parsed = fixtures.map((row) => {
    const result = parseTitle(row.subject, row.writeTs);
    assert.deepEqual(Object.keys(result), [
      "date", "weekday", "weekdayMismatch", "startHour", "endHour", "formats", "venue", "closed", "ok"
    ]);
    assert.ok(result.date === null || /^\d{4}-\d{2}-\d{2}$/.test(result.date));
    assert.ok(result.weekday === null || /^[월화수목금토일]$/.test(result.weekday));
    for (const hour of [result.startHour, result.endHour]) {
      assert.ok(hour === null || (Number.isInteger(hour) && hour >= 0 && hour <= 24));
    }
    assert.equal(typeof result.weekdayMismatch, "boolean");
    assert.ok(result.formats.every((format) => ["5v5", "6v6", "기타"].includes(format)));
    assert.equal(new Set(result.formats).size, result.formats.length);
    assert.equal(typeof result.venue, "string");
    assert.equal(typeof result.closed, "boolean");
    assert.equal(result.ok, result.date !== null && result.startHour !== null);
    assert.deepEqual(parseTitle(row.subject, row.writeTs), result);
    const score = scoreCandidate(result, { ...row, now: NOW });
    assert.ok(score === null || Number.isInteger(score));
    return result;
  });
  for (const field of ["date", "startHour"]) {
    const count = parsed.filter((row) => row[field] !== null).length;
    assert.ok(count / fixtures.length >= 0.85, `${field}: ${count}/60`);
    t.diagnostic(`${field}: ${count}/60 (${(100 * count / fixtures.length).toFixed(1)}%)`);
  }
});

// 발주서 표의 22개 행을 articleId로 원본 픽스처에 연결한다.
const expectedRows = [
  [2588736, "2026-10-17", "토", 6, 8, [], false],
  [2588528, "2026-10-18", "일", 8, 10, [], false],
  [2590115, "2026-10-18", "일", 10, 12, [], false],
  [2589964, "2026-10-18", "일", null, null, ["6v6"], false],
  [2589739, "2026-10-17", "토", 9, 11, [], false],
  [2589588, "2026-10-18", "일", 18, 20, ["6v6"], false],
  [2589474, "2026-10-17", "토", 8, 10, ["6v6"], false],
  [2588909, "2026-10-17", "토", 8, 10, [], false],
  [2590215, "2026-10-18", "일", 9, 11, [], false],
  [2589891, "2026-10-18", "일", 8, 10, [], false],
  [2589699, "2026-10-17", "토", 6, 8, ["6v6"], false],
  [2588969, "2026-10-13", "화", 20, 22, [], false],
  [2586661, "2026-10-12", "월", 20, 22, ["5v5"], false],
  [2589464, "2026-10-17", "토", 16, 18, [], false],
  [2588383, "2026-10-13", "화", 20, 22, ["6v6", "5v5"], true],
  [2590114, "2026-10-15", "목", 21, null, [], false],
  [2590029, null, null, 19, 21, [], false],
  [2590046, "2026-10-14", "수", 21, 23, [], false],
  [2589600, "2026-10-16", "금", 19, 21, [], true],
  [2586947, "2026-10-09", "금", 21, null, [], false],
  [2589741, "2026-10-24", "토", 13, 15, [], false],
  [2587814, "2026-10-14", "수", 20, 22, [], false]
];

for (const [articleId, date, weekday, startHour, endHour, formats, closed] of expectedRows) {
  const fixture = fixtures.find((row) => row.articleId === articleId);
  test(`발주서 기대값: ${fixture.subject}`, () => {
    const result = parseTitle(fixture.subject, fixture.writeTs);
    assert.deepEqual({
      date: result.date, weekday: result.weekday, startHour: result.startHour,
      endHour: result.endHour, formats: result.formats, closed: result.closed
    }, { date, weekday, startHour, endHour, formats, closed });
    assert.equal(result.weekdayMismatch, false);
  });
}

test("발주서의 구장명 두 개에서 날짜·시간·모집 문구와 구두점을 제거한다", () => {
  assert.equal(parseTitle("10/17(토) 06-08시 분당 마루공원", WRITE_TS).venue, "분당 마루공원");
  assert.equal(parseTitle("10/24 토 13-15 반포종합운동장 상대팀 구합니다!", WRITE_TS).venue, "반포종합운동장");
  assert.equal(parseTitle("10/17(토) 8~10시 5v5 매칭 초청합니다!", WRITE_TS).venue, "");
});

test("구장명의 풋살장·풋살파크·풋살스타디움과 이어지는 한글을 보존한다", () => {
  assert.equal(parseTitle("10/21(수) 20-22 성남종합운동장 풋살장 초청합니다~!", WRITE_TS).venue, "성남종합운동장 풋살장");
  for (const venue of ["천마 풋살파크", "로꼬풋살스타디움", "팀스포츠 구장", "샤인풋볼클럽"]) {
    assert.equal(parseTitle(`10/17(토) 8-10 ${venue} 풋살 팀매칭 구합니다`, WRITE_TS).venue, venue);
  }
});

const dateCases = [
  ["10/17", WRITE_TS, "2026-10-17"],
  ["10.17", WRITE_TS, "2026-10-17"],
  ["10. 14.", WRITE_TS, "2026-10-14"],
  ["10월 17일", WRITE_TS, "2026-10-17"],
  ["10월17일", WRITE_TS, "2026-10-17"],
  ["2026.10.17", WRITE_TS, "2026-10-17"],
  ["2026년 10월 16일", WRITE_TS, "2026-10-16"],
  ["26.10.18", WRITE_TS, "2026-10-18"],
  ["17일 (토)", WRITE_TS, "2026-10-17"],
  ["18(일)", WRITE_TS, "2026-10-18"],
  ["오늘", WRITE_TS, "2026-10-14"],
  ["금일", WRITE_TS, "2026-10-14"],
  ["오늘(13)", WRITE_TS, "2026-10-13"],
  ["오늘 2026.10.17", WRITE_TS, "2026-10-17"],
  ["1/2", "2026-12-30T12:00+09:00", "2027-01-02"],
  ["4/17", WRITE_TS, "2027-04-17"],
  ["5/17", WRITE_TS, "2026-05-17"],
  ["2026.1.2", "2026-12-30T12:00+09:00", "2026-01-02"],
  ["12일", WRITE_TS, "2026-10-12"],
  ["11일", WRITE_TS, "2026-11-11"],
  ["오늘(11)", WRITE_TS, "2026-11-11"],
  ["1일", "2026-12-30T12:00+09:00", "2027-01-01"],
  ["2028.2.29", WRITE_TS, "2028-02-29"],
  ["2026.2.29", WRITE_TS, null],
  ["2/30", WRITE_TS, null],
  ["13/17", WRITE_TS, null],
  ["10/0", WRITE_TS, null],
  ["31일", "2026-04-01T12:00+09:00", null],
  ["오늘", "2026-10-14T15:30:00Z", "2026-10-15"],
  ["오늘", new Date("2026-12-31T15:30:00Z"), "2027-01-01"],
  ["오늘", "2026-10-14T23:30:00-07:00", "2026-10-15"],
  ["오늘", "2026-10-14T23:30", "2026-10-14"]
];

for (const [subject, writeTs, expected] of dateCases) {
  test(`날짜 규칙: ${subject} / ${writeTs}`, () => {
    const result = parseTitle(subject, writeTs);
    assert.equal(result.date, expected);
    assert.equal(result.startHour, null, "날짜 숫자를 시각으로 오인하지 않는다");
    assert.equal(result.endHour, null);
    assert.equal(result.ok, false);
  });
}

test("잘못된 writeTs는 현재 KST 날짜를 사용한다", (t) => {
  t.mock.method(Date, "now", () => Date.parse("2026-12-31T15:30:00Z"));
  for (const value of [undefined, null, "잘못된 시각", "", new Date(NaN), 123, "123", "2026-02-30T08:00+09:00"]) {
    assert.equal(parseTitle("오늘 8시", value).date, "2027-01-01");
  }
});

test("요일 표기와 날짜가 다르면 날짜를 우선하고 불일치 표시를 남긴다", () => {
  for (const label of ["(일)", "(일요일)", "일요일", " 일 "]) {
    const result = parseTitle(`10/17 ${label} 8시`, WRITE_TS);
    assert.equal(result.weekday, "토");
    assert.equal(result.weekdayMismatch, true);
  }
  for (const label of ["(토)", "(토요일)", "토요일", " 토 ", "토"]) {
    const result = parseTitle(`${label} 8시`, WRITE_TS);
    assert.equal(result.date, null);
    assert.equal(result.weekday, "토");
    assert.equal(result.weekdayMismatch, false);
  }
  assert.equal(parseTitle("화 8시", WRITE_TS).weekday, "화");
  assert.equal(parseTitle("토모풋살장 월드컵공원 일원에코파크", WRITE_TS).weekday, null);
  assert.equal(parseTitle("10/13화22~24", WRITE_TS).venue, "");
});

const timeCases = [
  ["06-08시", 6, 8], ["08:00~10:00", 8, 10], ["8-10", 8, 10], ["8~10시", 8, 10],
  ["20-22", 20, 22], ["21시~23시", 21, 23], ["22시-24시", 22, 24], ["8시_10시", 8, 10],
  ["오전 8시 10시", 8, 10], ["오전10시-12시", 10, 12], ["8am~10am", 8, 10],
  ["21:00~ 23:00", 21, 23], ["19시-21시", 19, 21], ["저녁시간대(16~20)", 16, 20],
  ["21시", 21, null], ["오후 8시", 20, null], ["21:00", 21, null], ["오후 8시 10시", 20, 22],
  ["저녁 8시_10시", 20, 22], ["밤 8~10시", 20, 22], ["8pm~10pm", 20, 22], ["8PM~10PM", 20, 22],
  ["오후 12시", 12, null], ["오전 12시", 12, null], ["0시~2시", 0, 2], ["24시", 24, null],
  ["25시", null, null], ["25-26시", null, null], ["8시~25시", 8, null], ["125시", null, null],
  ["-1시", null, null], ["-1~2시", null, 2], ["8시~-1시", 8, null],
  ["9~11 일원에코파크", 9, 11], ["21시 일원에코파크", 21, null],
  ["21:99", null, null], ["2호점 3구장 1구장 제2풋살장 제 3풋살장 10명 2점", null, null],
  ["2-3구장 3-4명 1-2호점 1-2점", null, null], ["5:5 6:6 8:8 9대9 7v7 66매칭", null, null]
];

for (const [subject, startHour, endHour] of timeCases) {
  test(`시간 규칙: ${subject}`, () => {
    const parsed = parseTitle(`10/17 ${subject}`, WRITE_TS);
    assert.equal(parsed.startHour, startHour);
    assert.equal(parsed.endHour, endHour);
    assert.equal(parsed.ok, startHour !== null);
  });
}

test("포맷 표기를 정규화하고 등장 순서대로 중복을 제거한다", () => {
  const formats = [
    ["5:5 5vs5 5v5 5대5 5 대 5", ["5v5"]],
    ["6:6 6vs6 6v6 6대6 66매칭 66 매칭", ["6v6"]],
    ["9대9 7v7 8:8", ["기타"]],
    ["6vs6 5:5 7v7 66매칭 5대5", ["6v6", "5v5", "기타"]],
    ["7v7 5 대 5 6대6", ["기타", "5v5", "6v6"]],
    ["22-24", []], ["08:00~10:00", []], ["21:00", []]
  ];
  for (const [subject, expected] of formats) {
    assert.deepEqual(parseTitle(subject, WRITE_TS).formats, expected, subject);
  }
});

test("제목의 모든 지정 마감 문구를 인식한다", () => {
  for (const word of ["마감", "완료", "구함완료", "모집완료", "마감되었"]) {
    assert.equal(parseTitle(`${word} 10/17 8시`, WRITE_TS).closed, true);
  }
  assert.equal(parseTitle("10/17 8시 모집중", WRITE_TS).closed, false);
});

test("빈 제목과 문자열이 아닌 입력도 미분류 객체를 반환한다", () => {
  for (const subject of ["", " ", undefined, null, 123]) {
    assert.deepEqual(parseTitle(subject, WRITE_TS), {
      date: null, weekday: null, weekdayMismatch: false, startHour: null, endHour: null,
      formats: [], venue: "", closed: false, ok: false
    });
  }
});

test("발주서의 후보 점수와 제외 기준을 원본 픽스처로 검증한다", () => {
  for (const [articleId, expected] of [
    [2588736, 100], [2589474, 150], [2589741, 5], [2589588, -190], [2587386, null]
  ]) {
    const row = fixtures.find((fixture) => fixture.articleId === articleId);
    assert.equal(scoreCandidate(parseTitle(row.subject, row.writeTs), { ...row, now: NOW }), expected, row.subject);
  }
  for (const row of fixtures.filter((fixture) => fixture.headName === "매치마감")) {
    assert.equal(scoreCandidate(parseTitle(row.subject, row.writeTs), { ...row, now: NOW }), null);
  }
  assert.equal(scoreCandidate(parseTitle("마감 10/17 8시", WRITE_TS), { now: NOW }), null);
  assert.equal(scoreCandidate(parseTitle("토요일 8시", WRITE_TS), { now: NOW }), null);
});

test("시작 시간 점수 전부와 공용 설정의 선호 순서가 일치한다", () => {
  for (const [hour, expected] of [
    [8, 140], [7, 130], [9, 120], [10, 110], [6, 100], [11, 100],
    [0, 100], [5, 100], [12, 0], [24, 0], [null, 80]
  ]) {
    const parsed = parseTitle(`10/17 ${hour === null ? "" : `${hour}시`}`, WRITE_TS);
    assert.equal(scoreCandidate(parsed, { now: NOW }), expected);
  }
  const preferred = Object.keys(SCORE.START_HOUR)
    .map(Number)
    .filter((hour) => SCORE.START_HOUR[hour] > 0)
    .sort((a, b) => SCORE.START_HOUR[b] - SCORE.START_HOUR[a]);
  assert.deepEqual(preferred, config.PREFERRED_START_HOURS);
  assert.equal(scoreCandidate(parseTitle("10/18 8시", WRITE_TS), { now: NOW }), -60);
  assert.equal(scoreCandidate(parseTitle("10/17 8시 5v5 6v6", WRITE_TS), { now: NOW }), 150);
  assert.equal(scoreCandidate(parseTitle("10/17 8시 7v7", WRITE_TS), { now: NOW }), 140);
});

test("최근 글 가점은 과거 24시간 이내에만 적용하며 경계와 잘못된 시각을 처리한다", () => {
  const parsed = Object.freeze({ ...parseTitle("10/17 8시", WRITE_TS), formats: Object.freeze([]) });
  for (const [writeTs, expected] of [
    [NOW, 145], ["2026-10-14T09:00:00+09:00", 145],
    ["2026-10-14T08:59:59.999+09:00", 140], ["2026-10-15T09:00:00.001+09:00", 140],
    ["잘못된 시각", 140], [null, 140], [new Date("2026-10-14T09:00+09:00"), 145]
  ]) {
    assert.equal(scoreCandidate(parsed, { now: NOW, writeTs }), expected);
  }
});

test("지난 경기 제외는 UTC 시각이 아니라 KST 날짜를 기준으로 한다", () => {
  const parsed = parseTitle("10/14 23시", WRITE_TS);
  assert.equal(scoreCandidate(parsed, { now: "2026-10-14T14:59:59.999Z" }), -200);
  assert.equal(scoreCandidate(parsed, { now: "2026-10-14T15:00:00Z" }), null);
  assert.equal(scoreCandidate(parsed, { now: new Date("2026-10-14T15:00:00Z") }), null);
});

test("브라우저 전역 스크립트를 단독 또는 공용 설정과 함께 로드할 수 있다", () => {
  const source = readFileSync(join(__dirname, "../js/parse-title.js"), "utf8");
  for (const withConfig of [false, true]) {
    const context = { window: {} };
    if (withConfig) runInNewContext(readFileSync(join(__dirname, "../js/config.js"), "utf8"), context);
    runInNewContext(source, context);
    const api = context.window.ExicanParse;
    assert.equal(typeof api.parseTitle, "function");
    assert.equal(typeof api.scoreCandidate, "function");
    const parsed = api.parseTitle("10/17(토) 8시 6v6", WRITE_TS);
    assert.equal(parsed.date, "2026-10-17");
    assert.equal(api.scoreCandidate(parsed, { now: NOW }), 150);
    assert.deepEqual(JSON.parse(JSON.stringify(api.SCORE)), SCORE);
  }
});

test("실행 환경의 시간대가 달라도 KST 경계의 파싱·점수가 동일하다", () => {
  const source = `
    const { parseTitle, scoreCandidate } = require("./js/parse-title.js");
    const parsed = parseTitle("오늘 8시", new Date("2026-10-14T15:30:00Z"));
    const inferred = parseTitle("오늘 8시", "2026-10-14T23:30");
    process.stdout.write(JSON.stringify([parsed.date, inferred.date,
      scoreCandidate(parsed, { now: "2026-10-14T16:00:00Z" })]));
  `;
  for (const TZ of ["UTC", "Asia/Seoul", "America/Los_Angeles"]) {
    const output = execFileSync(process.execPath, ["-e", source], {
      cwd: join(__dirname, ".."), env: { ...process.env, TZ }, encoding: "utf8"
    });
    assert.deepEqual(JSON.parse(output), ["2026-10-15", "2026-10-14", -60]);
  }
});
