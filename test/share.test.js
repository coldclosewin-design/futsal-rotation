const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { buildVoteShare, buildCandidateShare, buildMatchShare } = require("../js/share.js");
const { describeSchedule, describeMatch } = require("../js/candidates.js");
const config = require("../js/config.js");
const poll = Object.freeze({ match_date: "2026-10-17", closes_at: "2026-10-12T13:00:00+09:00" });
const page = "https://example.invalid/futsal/vote.html?demo=1";

describe("buildVoteShare", () => {
  test("날짜·마감·참석 수·링크를 지정된 문구로 반환", () => {
    assert.equal(buildVoteShare(poll, { count: 6 }, page), `[${config.TEAM_NAME}] 10/17(토) 경기 참석 투표\n마감: 10/12(월) 13:00\n현재 참석 6명\n👉 ${page}`);
  });
  test("UTC 마감도 KST 날짜와 시각으로 표시", () => {
    assert.match(buildVoteShare({ ...poll, closes_at: "2026-10-11T15:30:00Z" }, { count: 0 }, page), /마감: 10\/12\(월\) 00:30\n현재 참석 0명/);
  });
  test("연도 경계를 넘는 마감 날짜와 요일", () => {
    assert.match(buildVoteShare({ match_date: "2027-01-02", closes_at: "2026-12-31T16:00:00Z" }, null, page), /1\/2\(토\).*\n마감: 1\/1\(금\) 01:00/);
  });
  test("취소된 투표는 취소 안내를 명시", () => {
    assert.match(buildVoteShare({ ...poll, cancelled: true }, { count: 6 }, page), /취소된 투표입니다/);
  });
  test("투표 없음에도 안내와 원래 링크 유지", () => {
    assert.equal(buildVoteShare(null, null, page), `[${config.TEAM_NAME}] 경기 참석 투표\n아직 열린 투표가 없습니다.\n👉 ${page}`);
  });
  test("잘못된 날짜·누락 마감·참석 수에 안전한 안내", () => {
    const text = buildVoteShare({ match_date: "2026-02-30" }, {}, page);
    assert.match(text, /날짜 미정/); assert.match(text, /마감: 미정/); assert.match(text, /현재 참석 0명/);
    assert.doesNotMatch(text, /NaN|undefined|Invalid Date/);
  });
});

describe("buildCandidateShare", () => {
  const rows = Object.freeze(Array.from({ length: 4 }, (_, index) => Object.freeze({
    article_id: index + 1, menu_id: 625, subject: `후보 ${index + 1}`, parsed_date: "2026-10-17", weekday: "토", start_hour: 8, end_hour: 10,
    phone: "010-0000-0000", memo: "공유하면 안 되는 메모"
  })));
  test("순서대로 상위 3건의 일정·제목·카페 링크를 공유", () => {
    const text = buildCandidateShare(rows, page);
    for (const [index, row] of rows.slice(0, 3).entries()) {
      assert.ok(text.includes(`${index + 1}. ${describeSchedule(row)}\n${row.subject}\n${config.CAFE.ARTICLE_URL(row.article_id, row.menu_id)}`));
    }
    assert.doesNotMatch(text, /후보 4/);
    assert.ok(text.indexOf("후보 1") < text.indexOf("후보 2"));
    assert.ok(text.endsWith(`👉 ${page}`));
  });
  test("후보 1건과 미분류 일정", () => {
    assert.match(buildCandidateShare([{ ...rows[0], parsed_date: null }], page), /1\. 일정 미분류\n후보 1/);
  });
  test("후보 없음 안내", () => assert.match(buildCandidateShare([], page), /아직 추천할 후보가 없습니다/));
  test("연락처·메모를 포함하지 않으며 원본을 바꾸지 않음", () => {
    const before = JSON.stringify(rows);
    assert.doesNotMatch(buildCandidateShare(rows, page), /010-0000-0000|공유하면 안 되는 메모/);
    assert.equal(JSON.stringify(rows), before);
  });
});

describe("buildMatchShare", () => {
  const match = Object.freeze({ match_date: "2026-10-17", start_time: "08:00:00", end_time: "10:00:00", venue: "데모 풋살장", format: "6v6", cost: 60000, memo: "관리 메모" });
  test("확정 날짜·시각·구장·비용·15분 전 도착 공지", () => {
    assert.equal(buildMatchShare(match, page), `[${config.TEAM_NAME}] 확정 매치 공지\n${describeMatch(match)}\n경기 시작 15분 전 도착해 주세요.\n👉 ${page}`);
    assert.doesNotMatch(buildMatchShare(match, page), /관리 메모/);
  });
  test("무료 구장비와 미정 구장·포맷 표시", () => {
    const text = buildMatchShare({ ...match, cost: 0, venue: null, format: null }, page);
    assert.match(text, /구장비 0원/); assert.match(text, /구장 미정/); assert.match(text, /포맷 미정/);
  });
  test("확정 매치 없음 안내", () => assert.match(buildMatchShare(null, page), /아직 확정된 매치가 없습니다/));
  test("추가 이모지 없이 안내 화살표 하나만 사용", () => {
    for (const text of [buildVoteShare(poll, { count: 6 }, page), buildCandidateShare([], page), buildMatchShare(match, page)]) {
      assert.deepEqual(text.match(/\p{Extended_Pictographic}/gu), ["👉"]);
    }
  });
});
