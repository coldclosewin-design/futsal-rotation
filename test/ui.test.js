const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { escapeHtml, formatWon } = require("../js/ui.js");

describe("escapeHtml", () => {
  test("HTML 태그와 속성의 특수 문자를 이스케이프한다", () => {
    assert.equal(
      escapeHtml("<a title=\"팀's\">A&B</a>"),
      "&lt;a title=&quot;팀&#39;s&quot;&gt;A&amp;B&lt;/a&gt;"
    );
  });

  test("일반 한국어와 빈 문자열을 유지한다", () => {
    assert.equal(escapeHtml("이번 주 투표"), "이번 주 투표");
    assert.equal(escapeHtml(""), "");
  });

  test("기존 엔티티도 텍스트로 표시한다", () => {
    assert.equal(escapeHtml("&lt;script&gt;"), "&amp;lt;script&amp;gt;");
  });
});

describe("formatWon", () => {
  test("금액에 천 단위 구분과 원 단위를 표시한다", () => {
    assert.equal(formatWon(30000), "30,000원");
    assert.equal(formatWon(1234567), "1,234,567원");
  });

  test("0원과 음수 금액을 표시한다", () => {
    assert.equal(formatWon(0), "0원");
    assert.equal(formatWon(-15000), "-15,000원");
  });
});
