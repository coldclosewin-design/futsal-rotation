const { readFile } = require("node:fs/promises");
const { CAFE } = require("../js/config.js");
const { parseTitle, scoreCandidate } = require("../js/parse-title.js");

const SCRAPER_COLUMNS = [
  "article_id", "menu_id", "menu_name", "subject", "head_name", "is_closed", "write_ts",
  "comment_count", "read_count", "parsed_date", "start_hour", "end_hour", "weekday",
  "parsed_format", "venue", "parse_ok", "scraper_score", "last_seen_at"
];

function buildCandidateRow(article, menuName, nowIso) {
  const writeTs = new Date(article.writeDateTimestamp).toISOString();
  const parsed = parseTitle(article.subject, writeTs);
  const score = scoreCandidate(parsed, { headName: article.headName, writeTs, now: nowIso });
  return {
    article_id: article.articleId,
    menu_id: article.menuId,
    menu_name: menuName,
    subject: article.subject,
    head_name: article.headName || null,
    is_closed: article.headName === "매치마감" || parsed.closed,
    write_ts: writeTs,
    comment_count: article.commentCount ?? 0,
    read_count: article.readCount ?? 0,
    parsed_date: parsed.date,
    start_hour: parsed.startHour,
    end_hour: parsed.endHour,
    weekday: parsed.weekday,
    parsed_format: parsed.formats.length ? parsed.formats.join(",") : null,
    venue: parsed.venue || null,
    parse_ok: parsed.ok,
    scraper_score: score ?? -1000,
    last_seen_at: nowIso
  };
}

function redact(value, key) {
  let text = String(value);
  if (key) text = text.split(key).join("[숨김]");
  return text.replace(/eyJ[A-Za-z0-9_=-]*(?:\.[A-Za-z0-9_=-]+)*/g, "[숨김]");
}

async function upsertCandidates(rows, { url, key, fetchImpl = globalThis.fetch }) {
  let upserted = 0;
  for (let offset = 0; offset < rows.length; offset += 100) {
    // 호출자가 다른 컬럼을 넘겨도 회장 입력값과 최초 수집 시각은 전송하지 않는다.
    const chunk = rows.slice(offset, offset + 100).map((row) => Object.fromEntries(
      SCRAPER_COLUMNS.filter((column) => Object.prototype.hasOwnProperty.call(row, column))
        .map((column) => [column, row[column]])
    ));
    const response = await fetchImpl(`${url.replace(/\/+$/, "")}/rest/v1/match_candidates?on_conflict=article_id`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify(chunk)
    });
    if (!response.ok) {
      const body = redact(await response.text(), key).slice(0, 300);
      throw new Error(`후보 저장 실패 (HTTP ${response.status}): ${body}`);
    }
    upserted += chunk.length;
  }
  return upserted;
}

function parseOptions(argv) {
  const options = { dryRun: false, pages: 2, menus: Object.keys(CAFE.MENUS) };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (!["--input", "--menu", "--menus", "--pages"].includes(option)) {
      throw new Error("지원하지 않는 옵션입니다. --dry-run, --input, --menu, --menus, --pages를 사용하세요.");
    }
    const value = argv[++index];
    if (!value || value.startsWith("--")) throw new Error(`${option}에 값을 지정하세요.`);
    if (option === "--input") options.input = value;
    if (option === "--menu") options.menu = value;
    if (option === "--menus") options.menus = [...new Set(value.split(",").map((id) => id.trim()))];
    if (option === "--pages") {
      if (!["1", "2"].includes(value)) throw new Error("--pages는 1 또는 2로 지정하세요.");
      options.pages = Number(value);
    }
  }
  if (options.menu && !options.input) throw new Error("--menu는 --input과 함께 사용하세요. 온라인 수집은 --menus를 사용하세요.");
  if (options.input && !options.dryRun) throw new Error("파일 입력은 네트워크를 사용하지 않습니다. --input에 --dry-run을 함께 지정하세요.");
  for (const id of [...options.menus, ...(options.menu ? [options.menu] : [])]) {
    if (!Object.prototype.hasOwnProperty.call(CAFE.MENUS, id)) throw new Error("js/config.js의 CAFE.MENUS에 등록된 메뉴를 지정하세요.");
  }
  if (options.menu && !options.menus.includes(options.menu)) throw new Error("--menu가 --menus에 포함되어야 합니다.");
  return options;
}

function articleList(payload) {
  const articles = payload?.message?.result?.articleList;
  if (!Array.isArray(articles)) throw new Error("카페 응답의 message.result.articleList가 배열이 아닙니다.");
  return articles;
}

async function fetchPage(menuId, page, fetchImpl) {
  const url = new URL("https://apis.naver.com/cafe-web/cafe2/ArticleListV2dot1.json");
  url.search = new URLSearchParams({
    "search.clubid": CAFE.CLUB_ID,
    "search.menuid": menuId,
    "search.perPage": 30,
    "search.page": page,
    "search.queryType": "lastArticle"
  }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetchImpl(url.toString(), {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; exican-hub/1.0)" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`카페 목록 요청 실패 (HTTP ${response.status})`);
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error("카페 응답이 JSON이 아닙니다.");
    }
    return articleList(payload);
  } finally {
    clearTimeout(timeout);
  }
}

function printRows(rows, log, key) {
  log("articleId | score | date weekday start-end | formats | closed | subject(50자)");
  for (const row of [...rows].sort((first, second) => second.scraper_score - first.scraper_score)) {
    const subject = Array.from(redact(row.subject, key).replace(/[\r\n\t|]/g, " ")).slice(0, 50).join("");
    log(`${row.article_id} | ${row.scraper_score} | ${row.parsed_date ?? "-"} ${row.weekday ?? "-"} ${row.start_hour ?? "-"}-${row.end_hour ?? "-"} | ${row.parsed_format ?? "-"} | ${row.is_closed} | ${subject}`);
  }
}

async function main(argv = process.argv.slice(2), {
  env = process.env,
  fetchImpl = globalThis.fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => new Date().toISOString(),
  log = console.log,
  error = console.error
} = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const report = (message) => log(redact(message, key));
  const reportError = (message) => error(redact(message, key));
  let options;
  try {
    options = parseOptions(argv);
  } catch (failure) {
    reportError(failure.message);
    return 2;
  }
  if (!options.dryRun && (!env.SUPABASE_URL?.trim() || !key?.trim())) {
    reportError("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수를 설정하세요. 저장 없이 확인하려면 --dry-run을 사용하세요.");
    return 2;
  }

  let inputArticles;
  if (options.input) {
    try {
      inputArticles = articleList(JSON.parse(await readFile(options.input, "utf8")));
      const menuId = String(options.menu ?? inputArticles[0]?.menuId ?? "");
      if (!options.menus.includes(menuId)) throw new Error("파일의 메뉴를 확인하거나 --menu로 수집할 메뉴를 지정하세요.");
      options.menus = [menuId];
    } catch (failure) {
      // JSON 오류에는 원문 일부가 포함될 수 있으므로 파일 내용은 로그에 남기지 않는다.
      reportError(failure instanceof SyntaxError ? "입력 파일이 올바른 JSON이 아닙니다." : `입력 파일 처리 실패: ${failure.message}`);
      return 1;
    }
  }

  const summaries = [];
  let successes = 0;
  let requested = false;
  for (const menuId of options.menus) {
    const menuName = CAFE.MENUS[menuId];
    let fetched = 0;
    let rows = [];
    let upserted = 0;
    let failed = false;
    try {
      const articles = inputArticles ? [...inputArticles] : [];
      if (!inputArticles) {
        for (let page = 1; page <= options.pages; page += 1) {
          if (requested) await sleep(500);
          requested = true;
          articles.push(...await fetchPage(menuId, page, fetchImpl));
          fetched = articles.length;
        }
      }
      fetched = articles.length;
      const nowIso = now();
      // 페이지 경계에서 글이 반복되면 앞 페이지의 값을 사용해 중복 upsert 충돌을 막는다.
      const unique = new Map();
      for (const article of articles) {
        if (!unique.has(article.articleId)) {
          unique.set(article.articleId, buildCandidateRow({ ...article, menuId: Number(menuId) }, menuName, nowIso));
        }
      }
      rows = [...unique.values()];
      if (options.dryRun) printRows(rows, report, key);
      else upserted = await upsertCandidates(rows, { url: env.SUPABASE_URL, key, fetchImpl });
      successes += 1;
    } catch (failure) {
      failed = true;
      reportError(`menu ${menuId} ${menuName}: 실패 - ${failure.name === "AbortError" ? "요청 시간 초과 (20초)" : failure.message}`);
    }
    summaries.push(`menu ${menuId} ${menuName}: fetched ${fetched}, parse_ok ${rows.filter((row) => row.parse_ok).length}, closed ${rows.filter((row) => row.is_closed).length}, upserted ${upserted}${failed ? " (실패)" : ""}`);
  }
  summaries.forEach(report);
  return successes > 0 ? 0 : 1;
}

module.exports = { buildCandidateRow, upsertCandidates, main };

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.error("수집기를 실행하지 못했습니다. 입력과 실행 환경을 확인하세요.");
    process.exitCode = 1;
  });
}
