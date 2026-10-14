(function () {
  const parser = typeof module !== "undefined" && module.exports ? require("./parse-title.js") : window.ExicanParse;

  function buildSmsText(candidate, context, config) {
    const hour = (value) => String(value).padStart(2, "0");
    const date = candidate.parsed_date ? candidate.parsed_date.slice(5).split("-").map(Number).join("/") +
      (candidate.weekday ? `(${candidate.weekday})` : "") : "날짜 협의";
    const time = candidate.start_hour == null ? "시간 협의" :
      `${hour(candidate.start_hour)}${candidate.end_hour == null ? "" : "~" + hour(candidate.end_hour)}시`;
    const venue = candidate.venue || parser.parseTitle(candidate.subject, candidate.write_ts).venue || "구장 협의";
    const values = { 제목: candidate.subject || "매칭 모집", 날짜: date, 시간: time, 구장: venue,
      인원: Number.isFinite(context.attendCount) ? `${context.attendCount}명` : "5~6명",
      포맷: context.format || (candidate.parsed_format || "").split(",").filter(Boolean).join(" 또는 ") || "5v5 또는 6v6",
      팀명: context.teamName || config.TEAM_NAME };
    return config.SMS_TEMPLATE.replace(/\{(제목|날짜|시간|구장|인원|포맷|팀명)\}/g, (token, key) => values[key]);
  }

  function smsHref(phone, text, isIos = false) {
    const number = String(phone || "").replace(/[^\d+]/g, "");
    if (!/\d/.test(number)) return "";
    return `sms:${number}${isIos ? "&" : "?"}body=${encodeURIComponent(text)}`;
  }

  const api = { buildSmsText, smsHref };
  if (typeof window !== "undefined") window.ExicanSms = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
