const config = require("../js/config.js");
const { kstDate, nextSaturday, pollWindow, lateVoteRows, monthlyDuesRows } = require("../js/rules.js");
const { createRest, redact } = require("./lib/rest.js");

async function main(argv = process.argv.slice(2), {
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date().toISOString(),
  log = console.log,
  error = console.error
} = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = argv.includes("--dry-run");
  const report = (message) => log(redact(message, key));
  try {
    if (argv.some((arg) => arg !== "--dry-run")) throw new Error("지원하는 옵션은 --dry-run입니다.");
    const configured = Boolean(env.SUPABASE_URL?.trim() && key?.trim());
    if (!configured && !dryRun) {
      error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수를 설정하세요. 계획만 확인하려면 --dry-run을 사용하세요.");
      return 2;
    }
    const nowIso = new Date(now()).toISOString();
    const today = kstDate(nowIso);
    const matchDate = nextSaturday(today);
    const window = pollWindow(matchDate);
    const month = today.slice(0, 7);
    if (!configured) {
      report("dry-run: 시크릿 없음 — 조회 생략 (네트워크 요청 없음)");
      report(`poll: ${matchDate} · ${window.opens_at} 이후 없으면 생성 (조회 생략)`);
      report(`late_vote: 최근 14일 내 마감된 미취소 투표의 미투표·지각 벌금 ${config.FINES.LATE_VOTE}원 (조회 생략)`);
      report(`dues: ${month}-01 · 활동 멤버별 ${config.DUES_MONTHLY}원, 4주 이상 부상 면제 ${config.INJURY_EXEMPT_RATE * 100}% (조회 생략)`);
      return 0;
    }
    const rest = createRest({ url: env.SUPABASE_URL, key, fetchImpl });
    const members = await rest.select("members", { active: "eq.true", order: "id.asc" });
    async function write(table, rows, conflict) {
      if (dryRun) report(`dry-run ${table}: ${JSON.stringify(rows)} (on_conflict=${conflict})`);
      else await rest.insertIgnore(table, rows, conflict);
    }

    const existing = await rest.select("polls", { match_date: `eq.${matchDate}`, order: "id.asc" });
    if (existing.length) report("poll: exists");
    else if (new Date(nowIso) >= new Date(window.opens_at)) {
      await write("polls", [{ match_date: matchDate, ...window }], "match_date");
      report(`poll: ${dryRun ? "would create" : "created"} ${matchDate}`);
    } else report(`poll: scheduled ${window.opens_at}`);

    const since = new Date(new Date(nowIso).getTime() - 14 * 86400000).toISOString();
    const polls = await rest.select("polls", {
      cancelled: "eq.false", and: `(closes_at.lt.${nowIso},closes_at.gte.${since})`, order: "closes_at.asc,id.asc"
    });
    let lateRows = 0;
    for (const poll of polls) {
      const votes = await rest.select("poll_votes", { poll_id: `eq.${poll.id}`, order: "member_id.asc" });
      const rows = lateVoteRows(poll, votes, members, config.FINES.LATE_VOTE, kstDate(poll.closes_at));
      await write("ledger", rows, "member_id,category,ref_poll_id");
      lateRows += rows.length;
    }
    report(`late_vote: ${lateRows} rows (${dryRun ? "planned" : "inserted"} ≤${lateRows})`);
    const dues = monthlyDuesRows(members, month, config);
    await write("ledger", dues, "member_id,category,entry_date");
    report(`dues: ${dues.length} rows${dryRun ? " (planned)" : ""}`);
    return 0;
  } catch (failure) {
    error(redact(failure.message, key));
    return 1;
  }
}

module.exports = { main };

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.error("정기 작업 실행에 실패했습니다. 실행 환경을 확인하세요.");
    process.exitCode = 1;
  });
}
