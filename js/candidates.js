(function () {
  const DEFAULT_FILTERS = Object.freeze({ menuIds: null, saturdayOnly: true, morningOnly: true,
    formats: null, includeClosed: false, includeUnparsed: true });
  const STATUS_LABELS = Object.freeze({ new: "미연락", contacted: "문자 보냄", replied: "답장 옴", confirmed: "확정", rejected: "거절/불발" });
  const weekdays = "일월화수목금토";

  function normalizeFilters(value, menuIds) {
    const result = { ...DEFAULT_FILTERS };
    if (!value || typeof value !== "object") return result;
    for (const key of ["saturdayOnly", "morningOnly", "includeClosed", "includeUnparsed"]) {
      if (typeof value[key] === "boolean") result[key] = value[key];
    }
    if (Array.isArray(value.menuIds)) {
      const selected = [...new Set(value.menuIds.map(Number))].filter((id) => menuIds.includes(id));
      result.menuIds = selected.length ? selected : null;
    }
    if (Array.isArray(value.formats)) {
      const selected = [...new Set(value.formats)].filter((format) => ["5v5", "6v6"].includes(format));
      result.formats = selected.length ? selected : null;
    }
    return result;
  }

  function filterCandidates(rows, filters, todayKst, nowIso) {
    const options = { ...DEFAULT_FILTERS, ...filters };
    const staleMs = (options.staleHours ?? 72) * 3600000;
    const now = Date.parse(nowIso);
    const ranked = [];
    const unparsed = [];
    for (const row of rows) {
      if (row.parsed_date && row.parsed_date < todayKst) continue;
      if (nowIso && row.last_seen_at && row.contact_status === "new" && now - Date.parse(row.last_seen_at) > staleMs) continue;
      if (options.menuIds && !options.menuIds.includes(row.menu_id)) continue;
      if (!options.includeClosed && row.is_closed && row.contact_status !== "confirmed") continue;
      const formats = (row.parsed_format || "").split(",").map((item) => item.trim());
      if (options.formats && !options.formats.some((format) => formats.includes(format))) continue;
      if (!row.parse_ok) {
        if (options.includeUnparsed) unparsed.push(row);
        continue;
      }
      if (options.saturdayOnly && row.weekday !== "토") continue;
      if (options.morningOnly && (row.start_hour == null || row.start_hour >= 12)) continue;
      ranked.push(row);
    }
    const compare = (a, b) => (b.scraper_score ?? -1000) - (a.scraper_score ?? -1000) ||
      (Date.parse(b.write_ts) || 0) - (Date.parse(a.write_ts) || 0);
    ranked.sort(compare);
    unparsed.sort(compare);
    return { ranked, unparsed };
  }

  function describeSchedule(row) {
    if (!row.parsed_date) return "일정 미분류";
    const [, month, day] = row.parsed_date.split("-");
    const weekday = row.weekday || weekdays[new Date(`${row.parsed_date}T00:00:00Z`).getUTCDay()];
    const hour = (value) => String(value).padStart(2, "0");
    const time = row.start_hour == null ? "시간 미정" :
      `${hour(row.start_hour)}${row.end_hour == null ? "" : "~" + hour(row.end_hour)}시`;
    return `${Number(month)}/${Number(day)}(${weekday}) ${time}`;
  }

  function nextStatus(status) {
    const next = { new: "contacted", contacted: "replied", replied: "confirmed", confirmed: "confirmed", rejected: "rejected" };
    return Object.prototype.hasOwnProperty.call(next, status) ? next[status] : "new";
  }

  function shiftDemoDates(rows, todayKst) {
    const today = new Date(`${todayKst}T00:00:00Z`);
    return rows.map((row) => {
      const key = Object.prototype.hasOwnProperty.call(row, "parsed_date") ? "parsed_date" : "match_date";
      if (!row[key]) return { ...row };
      const day = new Date(`${row[key]}T00:00:00Z`).getUTCDay();
      const delta = (day - today.getUTCDay() + 7) % 7;
      const shifted = new Date(today.getTime() + delta * 86400000).toISOString().slice(0, 10);
      return { ...row, [key]: shifted, ...(key === "parsed_date" ? { weekday: weekdays[day] } : {}) };
    });
  }

  function describeMatch(row) {
    const date = describeSchedule({ parsed_date: row.match_date }).replace(" 시간 미정", "");
    const time = `${(row.start_time || "").slice(0, 5)}${row.end_time ? "~" + row.end_time.slice(0, 5) : ""}`;
    return `${date} ${time} · ${row.venue || "구장 미정"} · ${row.format || "포맷 미정"} · 구장비 ${Number(row.cost || 0).toLocaleString("ko-KR")}원`;
  }

  function describeMatchDetail(match) {
    const date = describeSchedule({ parsed_date: match.match_date }).replace(" 시간 미정", "");
    const time = match.start_time ? `${match.start_time.slice(0, 5)}${match.end_time ? "~" + match.end_time.slice(0, 5) : ""}` : "시간 미정";
    return {
      title: `${date} ${time} · ${match.venue || "구장 미정"}`,
      sub: `${match.opponent ? "상대 " + match.opponent : "상대 미정"} · ${match.format || "포맷 미정"} · 구장비 ${Number(match.cost || 0).toLocaleString("ko-KR")}원${match.memo ? " · " + match.memo : ""}`
    };
  }

  function buildCandidatePatch(fields, nowIso) {
    const priority = fields.our_priority === "" || fields.our_priority == null ? null : Number(fields.our_priority);
    if (priority !== null && ![1, 2, 3].includes(priority)) throw new Error("우선순위는 1~3 중 선택하세요");
    if (!Object.prototype.hasOwnProperty.call(STATUS_LABELS, fields.contact_status)) throw new Error("연락 상태를 확인하세요");
    return { phone: String(fields.phone || "").trim() || null, memo: String(fields.memo || "").trim() || null,
      our_priority: priority, contact_status: fields.contact_status, admin_updated_at: nowIso };
  }

  function buildMatchRow(candidate, fields, { presidentId, poll }) {
    const date = fields.match_date;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error("경기 날짜를 확인하세요");
    const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!timePattern.test(fields.start_time)) throw new Error("시작 시각을 확인하세요");
    if (fields.end_time && !timePattern.test(fields.end_time) && fields.end_time !== "24:00") throw new Error("종료 시각을 확인하세요");
    const cost = Number(fields.cost);
    if (!Number.isSafeInteger(cost) || cost < 0 || cost > 2147483647) throw new Error("구장비는 0원 이상의 정수로 입력하세요");
    if (!["5v5", "6v6"].includes(fields.format)) throw new Error("5v5 또는 6v6를 선택하세요");
    if (!presidentId) throw new Error("회장 멤버 정보가 없습니다");
    return { match_date: date, start_time: fields.start_time, end_time: fields.end_time || null,
      venue: String(fields.venue || "").trim() || null, opponent: String(fields.opponent || "").trim() || null,
      cost, format: fields.format, memo: String(fields.memo || "").trim() || null,
      candidate_article_id: candidate.article_id, arranged_by: presidentId,
      poll_id: poll?.match_date === date ? poll.id : null, status: "scheduled" };
  }

  const api = { DEFAULT_FILTERS, STATUS_LABELS, normalizeFilters, filterCandidates, describeSchedule, nextStatus,
    shiftDemoDates, describeMatch, describeMatchDetail, buildCandidatePatch, buildMatchRow };
  if (typeof window !== "undefined") window.ExicanCandidates = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
