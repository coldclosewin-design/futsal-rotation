const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const config = require("../js/config.js");

test("공용 설정이 Node와 브라우저에서 모든 필수 키를 제공한다", () => {
  const browser = { window: {} };
  runInNewContext(readFileSync(join(__dirname, "../js/config.js"), "utf8"), browser);

  for (const loaded of [config, browser.window.EXICAN_CONFIG]) {
    for (const key of [
      "SUPABASE_URL", "SUPABASE_ANON_KEY", "TEAM_EMAIL", "ADMIN_EMAIL", "FINES",
      "DUES_MONTHLY", "INJURY_EXEMPT_RATE", "PRESIDENT_EXEMPT_MODE", "CAFE",
      "PREFERRED_START_HOURS"
    ]) {
      assert.ok(Object.prototype.hasOwnProperty.call(loaded, key), key);
    }
    assert.match(loaded.SUPABASE_URL, /^https:\/\/[a-z]+\.supabase\.co$/);
    assert.match(loaded.SUPABASE_ANON_KEY, /^eyJ/);
    assert.equal(
      loaded.CAFE.ARTICLE_URL(123, 623),
      "https://cafe.naver.com/f-e/cafes/11367414/articles/123?menuid=623"
    );
  }
});
