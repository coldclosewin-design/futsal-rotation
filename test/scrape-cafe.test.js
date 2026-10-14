const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");
const { buildCandidateRow, upsertCandidates, main } = require("../scripts/scrape-cafe.js");
const { CAFE } = require("../js/config.js");

const ROOT = join(__dirname, "..");
const FIXTURE = join(__dirname, "fixtures/api-menu-623.json");
const ARTICLES = JSON.parse(readFileSync(FIXTURE, "utf8")).message.result.articleList;
const NOW = "2026-10-15T09:00:00+09:00";
const KEY = "dummy-test-key";
const URL_BASE = "https://example.invalid";
const ENV = { SUPABASE_URL: URL_BASE, SUPABASE_SERVICE_ROLE_KEY: KEY };
const FORBIDDEN = ["first_seen_at", "phone", "contact_status", "memo", "our_priority", "admin_updated_at", "created_at"];
const COLUMNS = [
  "article_id", "menu_id", "menu_name", "subject", "head_name", "is_closed", "write_ts",
  "comment_count", "read_count", "parsed_date", "start_hour", "end_hour", "weekday",
  "parsed_format", "venue", "parse_ok", "scraper_score", "last_seen_at"
];

function assertOwned(row) {
  assert.deepEqual(Object.keys(row).sort(), [...COLUMNS].sort());
  for (const column of FORBIDDEN) assert.equal(Object.hasOwn(row, column), false);
}

function response(articles = ARTICLES) {
  return { ok: true, json: async () => ({ message: { result: { articleList: articles } } }) };
}

async function run(args, overrides = {}) {
  const output = [];
  const errors = [];
  const code = await main(args, {
    env: {},
    fetchImpl: async () => { assert.fail("예상하지 않은 네트워크 호출"); },
    sleep: async () => {},
    now: () => NOW,
    log: (line) => output.push(line),
    error: (line) => errors.push(line),
    ...overrides
  });
  return { code, output, errors };
}

function inputFile(t, content) {
  const directory = mkdtempSync(join(tmpdir(), "exican-scrape-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "input.json");
  writeFileSync(path, content);
  return path;
}

test("buildCandidateRow: 첫 글의 날짜·요일·시각·점수와 스크래퍼 컬럼만 반환한다", () => {
  const article = { ...ARTICLES[0], ...Object.fromEntries(FORBIDDEN.map((column) => [column, "dummy"])) };
  const row = buildCandidateRow(article, CAFE.MENUS[623], NOW);
  assertOwned(row);
  assert.equal(row.article_id, 2590162);
  assert.equal(row.menu_id, 623);
  assert.equal(row.menu_name, "성남/하남");
  assert.equal(row.subject, article.subject);
  assert.equal(row.head_name, "성남");
  assert.equal(row.parsed_date, "2026-10-21");
  assert.equal(row.weekday, "수");
  assert.equal(row.start_hour, 20);
  assert.equal(row.end_hour, 22);
  assert.equal(row.is_closed, false);
  assert.equal(row.parse_ok, true);
  assert.ok(Number.isInteger(row.scraper_score));
  assert.equal(row.scraper_score, -195);
  assert.equal(row.write_ts, new Date(article.writeDateTimestamp).toISOString());
  assert.equal(row.last_seen_at, NOW);
  assert.equal(row.read_count, 17);
  assert.equal(row.comment_count, 0);
  assert.equal(row.parsed_format, null);
  assert.equal(row.venue, "성남종합운동장 풋살장");
});

test("buildCandidateRow: 말머리 또는 제목이 마감이면 -1000을 저장한다", () => {
  for (const patch of [{ headName: "매치마감" }, { subject: `${ARTICLES[0].subject} 모집완료` }]) {
    const row = buildCandidateRow({ ...ARTICLES[0], ...patch }, "성남/하남", NOW);
    assert.equal(row.is_closed, true);
    assert.equal(row.scraper_score, -1000);
  }
});

test("buildCandidateRow: 누락된 말머리·포맷·장소는 null이고 제외 대상 점수는 -1000이다", () => {
  const row = buildCandidateRow({ ...ARTICLES[0], subject: "", headName: undefined, readCount: undefined, commentCount: undefined }, "성남/하남", NOW);
  assert.equal(row.head_name, null);
  assert.equal(row.parsed_format, null);
  assert.equal(row.venue, null);
  assert.equal(row.parsed_date, null);
  assert.equal(row.parse_ok, false);
  assert.equal(row.scraper_score, -1000);
  assert.equal(row.read_count, 0);
  assert.equal(row.comment_count, 0);
});

test("buildCandidateRow: 여러 포맷을 연결하고 과거 글을 삭제하지 않고 제외 점수로 보존한다", () => {
  const row = buildCandidateRow({ ...ARTICLES[0], subject: "10/10(토) 08-10시 5:5 6v6 구장" }, "성남/하남", NOW);
  assert.equal(row.parsed_format, "5v5,6v6");
  assert.equal(row.scraper_score, -1000);
  assert.equal(row.is_closed, false);
  ARTICLES.forEach((article) => assertOwned(buildCandidateRow(article, "성남/하남", NOW)));
});

test("upsertCandidates: 250행을 100/100/50으로 나눠 올바른 URL·헤더·허용 컬럼만 전송한다", async () => {
  const row = buildCandidateRow(ARTICLES[0], "성남/하남", NOW);
  const rows = Array.from({ length: 250 }, (_, index) => ({
    ...row, article_id: index + 1, unknown_column: "dummy",
    ...Object.fromEntries(FORBIDDEN.map((column) => [column, "dummy"]))
  }));
  const chunks = [];
  const count = await upsertCandidates(rows, {
    url: `${URL_BASE}/`, key: KEY,
    fetchImpl: async (url, options) => {
      assert.equal(url, `${URL_BASE}/rest/v1/match_candidates?on_conflict=article_id`);
      assert.equal(options.method, "POST");
      assert.deepEqual(options.headers, {
        apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      });
      const chunk = JSON.parse(options.body);
      chunk.forEach(assertOwned);
      chunks.push(chunk);
      return { ok: true, status: 204 };
    }
  });
  assert.equal(count, 250);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [100, 100, 50]);
  assert.deepEqual(chunks.flat().map((item) => item.article_id), rows.map((item) => item.article_id));
  assert.equal(rows[0].memo, "dummy");
});

test("upsertCandidates: 빈 목록은 요청하지 않는다", async () => {
  assert.equal(await upsertCandidates([], { url: URL_BASE, key: KEY, fetchImpl: () => assert.fail("빈 요청") }), 0);
});

test("upsertCandidates: 비2xx는 상태코드와 본문 앞 300자로 실패하며 다음 청크를 보내지 않는다", async () => {
  const body = "가".repeat(300) + "출력하면 안 되는 뒷부분";
  let calls = 0;
  await assert.rejects(upsertCandidates(Array(250).fill(buildCandidateRow(ARTICLES[0], "성남/하남", NOW)), {
    url: URL_BASE, key: KEY,
    fetchImpl: async () => {
      calls += 1;
      return { ok: false, status: 409, text: async () => body };
    }
  }), (error) => {
    assert.equal(error.message, `후보 저장 실패 (HTTP 409): ${body.slice(0, 300)}`);
    return true;
  });
  assert.equal(calls, 1);
});

test("upsertCandidates: 오류 응답에 반사된 키와 JWT 모양 문자열을 가린다", async () => {
  await assert.rejects(upsertCandidates([buildCandidateRow(ARTICLES[0], "성남/하남", NOW)], {
    url: URL_BASE, key: KEY,
    fetchImpl: async () => ({ ok: false, status: 401, text: async () => `${KEY} eyJdummy.payload.signature` })
  }), (error) => {
    assert.match(error.message, /401/);
    assert.doesNotMatch(error.message, /dummy-test-key|eyJ/);
    return true;
  });
});

test("CLI: --input dry-run은 15행을 점수순으로 출력하며 키 흔적이 없다", () => {
  const output = execFileSync(process.execPath, ["scripts/scrape-cafe.js", "--dry-run", "--input", FIXTURE, "--menu", "623"], {
    cwd: ROOT, encoding: "utf8", env: { ...process.env, ...ENV }
  });
  const lines = output.split(/\r?\n/).filter((line) => /^\d+ \|/.test(line));
  assert.equal(lines.length, 15);
  const scores = lines.map((line) => Number(line.split(" | ")[1]));
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  for (const line of lines) assert.ok(Array.from(line.split(" | ")[5]).length <= 50);
  assert.match(output, /menu 623 성남\/하남: fetched 15, parse_ok 15, closed 0, upserted 0/);
  assert.doesNotMatch(output, /SUPABASE|eyJ|dummy-test-key/);
});

test("CLI: 시크릿 없이 실행하면 종료코드 2와 한국어 안내를 출력한다", () => {
  const env = { ...process.env };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  const result = spawnSync(process.execPath, ["scripts/scrape-cafe.js"], { cwd: ROOT, encoding: "utf8", env });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /환경변수를 설정하세요/);
  assert.match(result.stderr, /--dry-run/);
});

test("main: 파일 입력은 네트워크 없이 메뉴를 추론하거나 명시한 메뉴로 라벨링한다", async () => {
  const inferred = await run(["--dry-run", "--input", FIXTURE]);
  assert.equal(inferred.code, 0);
  assert.match(inferred.output.at(-1), /^menu 623 성남\/하남: fetched 15/);
  const relabeled = await run(["--dry-run", "--input", FIXTURE, "--menu", "625"], { env: ENV });
  assert.equal(relabeled.code, 0);
  assert.match(relabeled.output.at(-1), /^menu 625 서울북동: fetched 15/);
  assert.deepEqual(relabeled.errors, []);
});

test("main: 기본 네 메뉴·두 페이지를 500ms 간격, 지정 URL·헤더·취소 신호로 요청한다", async () => {
  const calls = [];
  const delays = [];
  const result = await run(["--dry-run"], {
    sleep: async (ms) => delays.push(ms),
    fetchImpl: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin + parsed.pathname, "https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json");
      assert.equal(parsed.searchParams.get("search.clubid"), String(CAFE.CLUB_ID));
      assert.equal(parsed.searchParams.get("search.perPage"), "30");
      assert.equal(parsed.searchParams.get("search.queryType"), "lastArticle");
      assert.deepEqual(options.headers, { "User-Agent": "Mozilla/5.0 (compatible; exican-hub/1.0)" });
      assert.ok(options.signal instanceof AbortSignal);
      calls.push([parsed.searchParams.get("search.menuid"), parsed.searchParams.get("search.page")]);
      return response([]);
    }
  });
  assert.equal(result.code, 0);
  assert.deepEqual(calls, Object.keys(CAFE.MENUS).flatMap((id) => [[id, "1"], [id, "2"]]));
  assert.deepEqual(delays, Array(7).fill(500));
  assert.equal(result.output.filter((line) => line.startsWith("menu ")).length, 4);
});

test("main: 메뉴·페이지 제한과 페이지 중복 제거 후 upsert한다", async () => {
  const requests = [];
  const posted = [];
  const result = await run(["--menus", "623,625", "--pages", "1"], {
    env: ENV,
    fetchImpl: async (url, options) => {
      if (options.method === "POST") {
        posted.push(JSON.parse(options.body));
        return { ok: true, status: 201 };
      }
      requests.push(new URL(url).searchParams.get("search.menuid"));
      return response([ARTICLES[0], { ...ARTICLES[0], subject: "중복 글의 오래된 값" }]);
    }
  });
  assert.equal(result.code, 0);
  assert.deepEqual(requests, ["623", "625"]);
  assert.deepEqual(posted.map((rows) => rows.length), [1, 1]);
  posted.flat().forEach(assertOwned);
  assert.equal(posted[1][0].menu_id, 625);
  assert.equal(posted[1][0].menu_name, "서울북동");
  assert.equal(posted[0][0].subject, ARTICLES[0].subject);
  assert.match(result.output[0], /fetched 2, parse_ok 1, closed 0, upserted 1/);
});

for (const failure of ["html", "shape", "http", "network", "write"]) {
  test(`main: ${failure} 실패 메뉴 다음에도 나머지를 처리하고 하나라도 성공하면 0이다`, async () => {
    let reads = 0;
    let writes = 0;
    const result = await run(["--menus", "623,625", "--pages", "1"], {
      env: ENV,
      fetchImpl: async (url, options) => {
        if (options.method === "POST") {
          writes += 1;
          if (failure === "write" && writes === 1) return { ok: false, status: 503, text: async () => "일시 오류" };
          return { ok: true, status: 204 };
        }
        reads += 1;
        if (reads === 1) {
          if (failure === "html") return { ok: true, json: async () => { throw new SyntaxError("<html>로그인</html>"); } };
          if (failure === "shape") return { ok: true, json: async () => ({ message: { result: { articleList: {} } } }) };
          if (failure === "http") return { ok: false, status: 403 };
          if (failure === "network") throw new Error(`연결 실패 ${KEY}`);
        }
        return response([ARTICLES[0]]);
      }
    });
    assert.equal(result.code, 0);
    assert.equal(reads, 2);
    assert.equal(writes, failure === "write" ? 2 : 1);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0], /menu 623.*실패/);
    assert.match(result.output[0], /\(실패\)$/);
    assert.match(result.output[1], /menu 625.*upserted 1$/);
    assert.doesNotMatch(result.errors.join("\n"), /dummy-test-key/);
  });
}

test("main: 모든 메뉴가 실패하면 종료코드 1이며 빈 정상 목록은 성공이다", async () => {
  const failed = await run(["--dry-run", "--pages", "1"], {
    fetchImpl: async () => ({ ok: true, json: async () => ({}) })
  });
  assert.equal(failed.code, 1);
  assert.equal(failed.errors.length, 4);
  const empty = await run(["--menus", "623", "--pages", "1"], { env: ENV, fetchImpl: async () => response([]) });
  assert.equal(empty.code, 0);
  assert.match(empty.output[0], /fetched 0, parse_ok 0, closed 0, upserted 0/);
});

test("main: 두 번째 페이지 실패 시 해당 메뉴의 일부 데이터를 저장하지 않는다", async () => {
  let calls = 0;
  const result = await run(["--menus", "623"], {
    env: ENV,
    fetchImpl: async (url, options) => {
      assert.notEqual(options.method, "POST");
      calls += 1;
      if (calls === 2) throw new Error("페이지 오류");
      return response();
    }
  });
  assert.equal(result.code, 1);
  assert.match(result.output[0], /fetched 15.*upserted 0.*실패/);
});

test("main: 20초 타이머가 AbortController를 취소하고 타이머를 정리한다", async (t) => {
  let expire;
  const timer = {};
  let cleared = false;
  t.mock.method(globalThis, "setTimeout", (callback, ms) => {
    assert.equal(ms, 20000);
    expire = callback;
    return timer;
  });
  t.mock.method(globalThis, "clearTimeout", (value) => {
    assert.equal(value, timer);
    cleared = true;
  });
  const result = await run(["--dry-run", "--menus", "623", "--pages", "1"], {
    fetchImpl: async (url, { signal }) => {
      expire();
      assert.equal(signal.aborted, true);
      signal.throwIfAborted();
    }
  });
  assert.equal(result.code, 1);
  assert.equal(cleared, true);
  assert.match(result.errors[0], /시간 초과 \(20초\)/);
});

test("main: 옵션 오류·파일 쓰기 시도·환경변수 누락은 요청 전에 종료코드 2다", async () => {
  for (const args of [
    ["--unknown"], ["--pages"], ["--pages", "0"], ["--pages", "3"], ["--menus", "623,"],
    ["--menus", "999"], ["--menu", "623"], ["--input", FIXTURE],
    ["--dry-run", "--input", FIXTURE, "--menu", "623", "--menus", "625"]
  ]) {
    assert.equal((await run(args, { env: ENV })).code, 2);
  }
  for (const env of [{}, { SUPABASE_URL: URL_BASE }, { SUPABASE_SERVICE_ROLE_KEY: KEY }, { ...ENV, SUPABASE_SERVICE_ROLE_KEY: " " }]) {
    assert.equal((await run([], { env })).code, 2);
  }
});

test("main: 잘못된 JSON·응답 구조·없는 파일은 네트워크 없이 실패한다", async (t) => {
  for (const content of ["<html>로그인 필요</html>", "{}", '{"message":{"result":{"articleList":{}}}}']) {
    const path = inputFile(t, content);
    assert.equal((await run(["--dry-run", "--input", path, "--menu", "623"])).code, 1);
  }
  assert.equal((await run(["--dry-run", "--input", join(tmpdir(), "exican-nonexistent", "missing.json")])).code, 1);
});

test("main: 빈 파일 목록은 --menu가 있으면 성공하고 없으면 메뉴 안내를 출력한다", async (t) => {
  const path = inputFile(t, JSON.stringify({ message: { result: { articleList: [] } } }));
  assert.equal((await run(["--dry-run", "--input", path, "--menu", "623"])).code, 0);
  const result = await run(["--dry-run", "--input", path]);
  assert.equal(result.code, 1);
  assert.match(result.errors[0], /--menu/);
});

test("main: 표의 줄바꿈·구분자를 정리하고 50자 절단 전에 키를 가린다", async () => {
  const key = "dummy-".repeat(20);
  const result = await run(["--dry-run", "--menus", "623", "--pages", "1"], {
    env: { ...ENV, SUPABASE_SERVICE_ROLE_KEY: key },
    fetchImpl: async () => response([{ ...ARTICLES[0], subject: `${key}\n\t| eyJdummy.payload.signature ${"가".repeat(60)}` }])
  });
  assert.equal(result.code, 0);
  const line = result.output[1];
  assert.equal(line.split(" | ").length, 6);
  assert.equal(Array.from(line.split(" | ")[5]).length, 50);
  assert.doesNotMatch(line, /dummy|eyJ|\t|\n/);
});
