const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { buildSmsText, smsHref } = require("../js/sms-template.js");
const config = require("../js/config.js");
const parser = require("../js/parse-title.js");
const candidate = { subject: "10/17(토) 도봉풋살장 08~10 6v6", parsed_date: "2026-10-17", weekday: "토",
  start_hour: 8, end_hour: 10, venue: "도봉풋살장", parsed_format: "6v6" };

test("문자 템플릿의 모든 자리를 날짜·시간·구장·인원·포맷·팀명으로 치환한다", () => {
  assert.equal(buildSmsText(candidate, { attendCount: 7, format: "5v5", teamName: "테스트팀" }, config),
    "안녕하세요, 모두의풋살 카페 글(10/17(토) 도봉풋살장 08~10 6v6) 보고 연락드립니다. 저희는 3040 풋살팀 테스트팀(실력 하~중, 안 다치게 즐겁게 합니다)입니다. 10/17(토) 08~10시 도봉풋살장 매치 가능할까요? 저희 인원 7명, 5v5 희망합니다. 구장비 조건도 알려주시면 감사하겠습니다.");
});

test("빠진 값에는 협의 문구·5~6명·기본 포맷·설정 팀명을 사용한다", () => {
  const text = buildSmsText({ subject: "매칭 초청합니다" }, {}, config);
  for (const value of ["시간 협의", "날짜 협의", "구장 협의", "5~6명", "5v5 또는 6v6", "FC EXICAN"]) assert.ok(text.includes(value), value);
  assert.ok(!/\{[^}]+\}/.test(text));
});

test("구장이 비어 있으면 제목의 venue를 사용하고 0명·0시는 유효값이다", () => {
  const text = buildSmsText({ ...candidate, venue: null, start_hour: 0, end_hour: null }, { attendCount: 0 }, config);
  assert.ok(text.includes("00시 도봉풋살장"));
  assert.ok(text.includes("인원 0명, 6v6"));
});

test("사용자 제목의 치환 기호를 재해석하거나 달러 치환하지 않는다", () => {
  const text = buildSmsText({ ...candidate, subject: "$& {팀명}" }, {}, { ...config, SMS_TEMPLATE: "{제목} / {팀명} / {팀명}" });
  assert.equal(text, "$& {팀명} / FC EXICAN / FC EXICAN");
});

test("Android 링크는 숫자와 +만 남기고 본문을 인코딩한다", () => {
  const text = "안녕하세요? 5v5 & 6v6\n감사합니다";
  assert.equal(smsHref("+82 (010)-0000-0000", text, false), `sms:+8201000000000?body=${encodeURIComponent(text)}`);
});

test("iOS 링크는 &body=를 사용한다", () => {
  assert.equal(smsHref("010-0000-0000", "안녕", true), `sms:01000000000&body=${encodeURIComponent("안녕")}`);
});

test("연락처가 없으면 열 수 있는 링크를 만들지 않는다", () => {
  for (const value of [null, undefined, "", "전화번호 없음", "+"]) assert.equal(smsHref(value, "안녕"), "");
});

test("브라우저 전역도 Node와 동일한 텍스트·링크를 만든다", () => {
  const context = { window: { ExicanParse: parser } };
  runInNewContext(readFileSync(join(__dirname, "../js/sms-template.js"), "utf8"), context);
  assert.equal(context.window.ExicanSms.buildSmsText(candidate, {}, config), buildSmsText(candidate, {}, config));
  assert.equal(context.window.ExicanSms.smsHref("010-0000-0000", "안녕", true), smsHref("010-0000-0000", "안녕", true));
});
