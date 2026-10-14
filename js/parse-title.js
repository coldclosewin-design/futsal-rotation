(function () {
  const SCORE = Object.freeze({
    SATURDAY: 100,
    OTHER_DAY: -100,
    START_HOUR: Object.freeze({ 8: 40, 7: 30, 9: 20, 10: 10, 6: 0, 11: 0 }),
    OTHER_MORNING: 0,
    AFTERNOON: -100,
    UNKNOWN_START: -20,
    PREFERRED_FORMAT: 10,
    RECENT: 5
  });
  const HOUR_MS = 60 * 60 * 1000;

  function timestamp(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value !== "string" || !value.trim()) return NaN;
    let iso = value.trim();
    const calendar = iso.match(/^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
    if (!calendar || validDate(Number(calendar[1]), Number(calendar[2]), Number(calendar[3])) === null) return NaN;
    // 오프셋 없는 ISO 입력도 실행 환경의 로컬 시간 대신 KST로 해석한다.
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) iso += "T00:00:00+09:00";
    else if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(iso)) iso += "+09:00";
    return Date.parse(iso);
  }

  function kstDate(ms) {
    return new Date(ms + 9 * HOUR_MS).toISOString().slice(0, 10);
  }

  function validDate(year, month, day) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day) return null;
    return date.toISOString().slice(0, 10);
  }

  function extractDate(subject, reference) {
    const [year, month, day] = reference.split("-").map(Number);
    let text = subject;
    let date = null;
    let found = false;

    function strip(pattern, resolve) {
      text = text.replace(pattern, (...match) => {
        if (!found) {
          date = resolve(match);
          found = true;
        }
        return " ";
      });
    }

    function dayOnly(value) {
      const nextMonth = month + (value <= day - 3 ? 1 : 0);
      return validDate(year + (nextMonth > 12 ? 1 : 0), nextMonth > 12 ? 1 : nextMonth, value);
    }

    // 명시된 날짜를 오늘/금일보다 우선하며, 잘못된 날짜도 시간 분석 전에 지운다.
    strip(/(?<!\d)(\d{4}|\d{2})\s*(?:년\s*|\.\s*)(\d{1,2})\s*(?:월\s*|\.\s*)(\d{1,2})(?:일|\.)?(?!\d)/g,
      (match) => validDate(Number(match[1]) + (match[1].length === 2 ? 2000 : 0), Number(match[2]), Number(match[3])));
    strip(/(?<!\d)(\d{1,2})\s*(?:월\s*|[/.]\s*)(\d{1,2})(?:일|\.)?(?!\d)/g,
      (match) => validDate(year + (Number(match[1]) <= month - 6 ? 1 : 0), Number(match[1]), Number(match[2])));
    strip(/(?:오늘|금일)\s*\(\s*(\d{1,2})\s*\)/g, (match) => dayOnly(Number(match[1])));
    strip(/(?<!\d)(\d{1,2})(?:일(?![가-힣])|(?=\s*\(\s*[월화수목금토일](?:요일)?\s*\)))/g,
      (match) => dayOnly(Number(match[1])));
    strip(/오늘|금일/g, () => reference);
    return { text, date };
  }

  function extractWeekday(subject) {
    let weekday = null;
    const text = subject.replace(
      /\(\s*([월화수목금토일])(?:요일)?\s*\)|([월화수목금토일])요일|(?:^|\s)([월화수목금토일])(?=\s|\d|$)/g,
      (match, parenthesized, full, single) => {
        if (weekday === null) weekday = parenthesized || full || single;
        return " ";
      }
    );
    return { text, weekday };
  }

  function readHour(prefix, digits, minutes, suffix) {
    let hour = Number(digits);
    if (hour < 0 || hour > 24 || (minutes !== undefined && Number(minutes) > 59)) return null;
    const marker = suffix ? suffix.toLowerCase() : "";
    if ((marker === "pm" || (marker !== "am" && /^(오후|저녁|밤)$/.test(prefix))) && hour < 12) {
      hour += 12;
    }
    return hour;
  }

  function extractTime(subject) {
    const prefix = "(?:(오전|오후|저녁|밤)(?:시간대)?\\s*\\(?\\s*)?";
    const hour = "(-?\\d{1,3})(?::(\\d{2}))?(?:\\s*(시|am|pm))?";
    const markedHour = "(-?\\d{1,3})(?::(\\d{2}))?\\s*(시|am|pm)";
    const begin = "(?<![\\d:])";
    const end = "(?![\\d:]|(?:구장|호점|명|월|일|점|풋살장))";
    let startHour = null;
    let endHour = null;
    let found = false;
    let text = subject;

    function takeRange(match, firstPrefix, first, firstMinutes, firstSuffix,
      lastPrefix, last, lastMinutes, lastSuffix) {
      if (!found) {
        startHour = readHour(firstPrefix, first, firstMinutes, firstSuffix);
        endHour = readHour(lastPrefix, last, lastMinutes, lastSuffix);
        if (startHour >= 12 && endHour !== null && endHour < 12 && endHour < startHour &&
            lastPrefix !== "오전" && (!lastSuffix || lastSuffix.toLowerCase() !== "am")) {
          endHour += 12;
        }
        found = true;
      }
      return " ";
    }

    text = text.replace(new RegExp(begin + prefix + hour + "\\s*[-~_]\\s*" + prefix + hour + end, "gi"), takeRange);
    text = text.replace(new RegExp(begin + prefix + markedHour + "\\s+" + prefix + markedHour + end, "gi"), takeRange);
    text = text.replace(new RegExp(begin + prefix + hour + end, "gi"), (match, period, digits, minutes, suffix) => {
      // 단독 숫자와 5:5 같은 한 자리 콜론 포맷은 시작 시각으로 간주하지 않는다.
      if (minutes === undefined && suffix === undefined) return match;
      if (!found) {
        startHour = readHour(period, digits, minutes, suffix);
        found = true;
      }
      return " ";
    });
    return { text, startHour, endHour };
  }

  function extractFormats(subject) {
    const formats = [];
    const text = subject.replace(/(?<![\d:])(\d{1,2})\s*(?::|vs|v|대)\s*(\d{1,2})(?![\d:])|(?<!\d)66\s*매칭/gi,
      (match, first, second) => {
        let format = "기타";
        if (first === undefined || (Number(first) === 6 && Number(second) === 6)) format = "6v6";
        else if (Number(first) === 5 && Number(second) === 5) format = "5v5";
        if (!formats.includes(format)) formats.push(format);
        return " ";
      });
    return { text, formats };
  }

  function cleanVenue(subject) {
    return subject
      .replace(/초청합니다|초청드립니다|구해봅니다|구합니다|모십니다|상대팀|구해요|모셔요|드립니다|팀매칭|매칭|매치|상대|초청|구함|모집|무료|급구|풋살(?![가-힣])|합니다|오늘|금일|팀(?![가-힣])/g, " ")
      .replace(/[\/,.!~()[\]_\-:]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseTitle(subject, writeTs) {
    const title = typeof subject === "string" ? subject : "";
    const written = timestamp(writeTs);
    const dated = extractDate(title, kstDate(Number.isFinite(written) ? written : Date.now()));
    const labeled = extractWeekday(dated.text);
    const timed = extractTime(labeled.text);
    const formatted = extractFormats(timed.text);
    let weekday = labeled.weekday;
    if (dated.date !== null) {
      const [year, month, day] = dated.date.split("-").map(Number);
      weekday = "일월화수목금토"[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
    }
    return {
      date: dated.date,
      weekday,
      weekdayMismatch: dated.date !== null && labeled.weekday !== null && labeled.weekday !== weekday,
      startHour: timed.startHour,
      endHour: timed.endHour,
      formats: formatted.formats,
      venue: cleanVenue(formatted.text),
      closed: /마감|완료|구함완료|모집완료|마감되었/.test(title),
      ok: dated.date !== null && timed.startHour !== null
    };
  }

  function scoreCandidate(parsed, { headName, writeTs, now } = {}) {
    const suppliedNow = timestamp(now);
    const current = Number.isFinite(suppliedNow) ? suppliedNow : Date.now();
    if (parsed.closed || headName === "매치마감" || parsed.date == null || parsed.date < kstDate(current)) return null;
    let score = parsed.weekday === "토" ? SCORE.SATURDAY : SCORE.OTHER_DAY;
    if (parsed.startHour === null) score += SCORE.UNKNOWN_START;
    else if (parsed.startHour >= 12) score += SCORE.AFTERNOON;
    else score += SCORE.START_HOUR[parsed.startHour] ?? SCORE.OTHER_MORNING;
    if (parsed.formats.includes("5v5") || parsed.formats.includes("6v6")) score += SCORE.PREFERRED_FORMAT;
    const age = current - timestamp(writeTs);
    if (age >= 0 && age <= 24 * HOUR_MS) score += SCORE.RECENT;
    return score;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { parseTitle, scoreCandidate, SCORE };
  }
  if (typeof window !== "undefined") { window.ExicanParse = { parseTitle, scoreCandidate, SCORE }; }
})();
