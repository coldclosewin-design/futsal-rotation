// 풋살 키퍼·휴식 배정 엔진
// - 전원 전체 참여(8쿼터)일 때는 4가지 정적 테이블 사용 (편차 ≤ 1, 엄격 연속 금지 보장)
// - 조기 퇴장자(Q시작~Q끝 제한)가 있으면 동적 그리디 알고리즘으로 전환
//   · 정책: 조기 퇴장자는 필드 중심 배치 (GK/Rest 후순위)
//   · 나머지 인원은 GK·Rest 누적 카운트 낮은 순으로 공평 분배
//   · 엄격 연속 금지 우선, 후보 부족 시 완화(경고)
// 슬롯 번호는 0-based.

const TOTAL_QUARTERS = 8;

const SCHEDULES = {
  "6_5v5": [
    { gk: 0, rest: [1] },
    { gk: 2, rest: [3] },
    { gk: 4, rest: [5] },
    { gk: 1, rest: [0] },
    { gk: 3, rest: [2] },
    { gk: 5, rest: [4] },
    { gk: 0, rest: [3] },
    { gk: 2, rest: [5] },
  ],
  "6_6v6": [
    { gk: 0, rest: [] },
    { gk: 1, rest: [] },
    { gk: 2, rest: [] },
    { gk: 3, rest: [] },
    { gk: 4, rest: [] },
    { gk: 5, rest: [] },
    { gk: 0, rest: [] },
    { gk: 2, rest: [] },
  ],
  "7_5v5": [
    { gk: 0, rest: [1, 2] },
    { gk: 3, rest: [4, 5] },
    { gk: 1, rest: [0, 6] },
    { gk: 4, rest: [2, 3] },
    { gk: 5, rest: [0, 6] },
    { gk: 2, rest: [1, 3] },
    { gk: 6, rest: [4, 5] },
    { gk: 0, rest: [1, 2] },
  ],
  "7_6v6": [
    { gk: 0, rest: [1] },
    { gk: 2, rest: [3] },
    { gk: 4, rest: [5] },
    { gk: 6, rest: [0] },
    { gk: 1, rest: [2] },
    { gk: 3, rest: [4] },
    { gk: 5, rest: [6] },
    { gk: 0, rest: [1] },
  ],
};

const REST_COUNT = {
  "6_5v5": 1,
  "6_6v6": 0,
  "7_5v5": 2,
  "7_6v6": 1,
};

function scheduleKey(playerCount, format) {
  return `${playerCount}_${format}`;
}

// quartersMap: { "이름": { start: 1, end: 8 } } 형태. 없거나 1~8이면 전체 참여.
function buildSchedule(players, format, quartersMap) {
  const qMap = quartersMap || {};
  const anyLimited = players.some((p) => {
    const r = qMap[p];
    return r && (r.start > 1 || r.end < TOTAL_QUARTERS);
  });
  return anyLimited
    ? buildScheduleDynamic(players, format, qMap)
    : buildScheduleStatic(players, format);
}

function buildScheduleStatic(players, format) {
  const key = scheduleKey(players.length, format);
  const table = SCHEDULES[key];
  if (!table) {
    throw new Error(`지원하지 않는 조합입니다: ${players.length}명 / ${format}`);
  }
  return table.map((slot, idx) => ({
    quarter: idx + 1,
    gk: players[slot.gk],
    rest: slot.rest.map((i) => players[i]),
    field: players.filter((_, i) => i !== slot.gk && !slot.rest.includes(i)),
  }));
}

function buildScheduleDynamic(players, format, quartersMap) {
  const fieldSize = format === "5v5" ? 5 : 6;
  const range = (p) => quartersMap[p] || { start: 1, end: TOTAL_QUARTERS };
  const isLimited = (p) => {
    const r = range(p);
    return r.start > 1 || r.end < TOTAL_QUARTERS;
  };

  const gkCount = Object.fromEntries(players.map((p) => [p, 0]));
  const restCount = Object.fromEntries(players.map((p) => [p, 0]));

  const result = [];
  let prevOut = new Set();
  const warnings = [];

  for (let q = 1; q <= TOTAL_QUARTERS; q++) {
    const active = players.filter((p) => {
      const r = range(p);
      return r.start <= q && q <= r.end;
    });
    if (active.length < fieldSize) {
      throw new Error(
        `Q${q}: 참가자 ${active.length}명으로 ${format} 불가 (최소 ${fieldSize}명 필요)`
      );
    }
    const restNeeded = active.length - fieldSize;
    const totalOut = restNeeded + 1; // GK 포함

    let outPool = active.filter((p) => !prevOut.has(p));
    if (outPool.length < totalOut) {
      warnings.push(`Q${q}: 연속 금지 완화 (후보 ${outPool.length}< 필요 ${totalOut})`);
      outPool = active.slice();
    }

    // out 선택 우선순위: 비-제한자 우선 + (GK+Rest) 누적 적은 순 + 이름 순
    outPool.sort((a, b) => {
      const la = isLimited(a) ? 1 : 0;
      const lb = isLimited(b) ? 1 : 0;
      if (la !== lb) return la - lb;
      const oa = gkCount[a] + restCount[a];
      const ob = gkCount[b] + restCount[b];
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b, "ko");
    });
    const selected = outPool.slice(0, totalOut);

    // GK 선정: selected 중 비-제한자 우선 + GK 카운트 적은 순
    const gkPool = selected.slice().sort((a, b) => {
      const la = isLimited(a) ? 1 : 0;
      const lb = isLimited(b) ? 1 : 0;
      if (la !== lb) return la - lb;
      if (gkCount[a] !== gkCount[b]) return gkCount[a] - gkCount[b];
      return a.localeCompare(b, "ko");
    });
    const gk = gkPool[0];
    const rest = selected.filter((p) => p !== gk);

    gkCount[gk]++;
    for (const r of rest) restCount[r]++;

    prevOut = new Set(selected);
    const field = active.filter((p) => !selected.includes(p));
    result.push({ quarter: q, gk, rest, field });
  }

  result.warnings = warnings;
  return result;
}

// quartersMap 있으면 동적 규칙 기준으로 검증
function validateSchedule(schedule, playerCount, format, quartersMap) {
  const errors = [];
  const fieldSize = format === "5v5" ? 5 : 6;
  const gkCount = {};
  const restCount = {};
  const dynamic = !!quartersMap && Object.keys(quartersMap).length > 0;
  const qMap = quartersMap || {};

  for (const q of schedule) {
    if (!q.gk) errors.push(`Q${q.quarter}: GK 없음`);
    const expectedSize = dynamic
      ? q.field.length + 1 + q.rest.length
      : playerCount;
    const expectedRest = expectedSize - fieldSize;
    if (q.rest.length !== expectedRest) {
      errors.push(`Q${q.quarter}: Rest ${q.rest.length}명 (기대 ${expectedRest})`);
    }
    if (q.field.length !== fieldSize - 1) {
      errors.push(`Q${q.quarter}: 필드 ${q.field.length}명 (기대 ${fieldSize - 1})`);
    }
    gkCount[q.gk] = (gkCount[q.gk] || 0) + 1;
    for (const r of q.rest) restCount[r] = (restCount[r] || 0) + 1;

    if (dynamic) {
      const inThisQuarter = [q.gk, ...q.rest, ...q.field];
      for (const p of inThisQuarter) {
        const r = qMap[p];
        if (r && (q.quarter < r.start || q.quarter > r.end)) {
          errors.push(`Q${q.quarter}: ${p}는 Q${r.start}~Q${r.end}만 참가`);
        }
      }
    }
  }

  for (let i = 0; i < schedule.length - 1; i++) {
    const curOut = new Set([schedule[i].gk, ...schedule[i].rest]);
    const nextOut = new Set([schedule[i + 1].gk, ...schedule[i + 1].rest]);
    for (const p of curOut) {
      if (nextOut.has(p)) {
        errors.push(`Q${i + 1}→Q${i + 2}: ${p} 연속 out 위반`);
      }
    }
  }

  // 공평성: 비제한자(전체 참여) 인원 기준으로 편차 검사
  const unlimited = dynamic
    ? Object.keys(gkCount).concat(Object.keys(restCount)).filter((p) => {
        const r = qMap[p];
        return !r || (r.start === 1 && r.end === TOTAL_QUARTERS);
      })
    : Object.keys(gkCount);
  const unlimitedSet = new Set(unlimited);

  const gkValues = Object.entries(gkCount)
    .filter(([p]) => !dynamic || unlimitedSet.has(p))
    .map(([, v]) => v);
  if (gkValues.length) {
    const spread = Math.max(...gkValues) - Math.min(...gkValues);
    if (spread > 1) errors.push(`GK 편차 ${spread} (> 1, 비제한자 기준)`);
  }
  const restValues = Object.entries(restCount)
    .filter(([p]) => !dynamic || unlimitedSet.has(p))
    .map(([, v]) => v);
  if (restValues.length) {
    const spread = Math.max(...restValues) - Math.min(...restValues);
    if (spread > 1) errors.push(`Rest 편차 ${spread} (> 1, 비제한자 기준)`);
  }

  return { ok: errors.length === 0, errors, gkCount, restCount };
}

function shortName(name) {
  return name.length > 0 ? name[0] : "";
}

function formatForKakao(schedule, format, players, quartersMap) {
  const qMap = quartersMap || {};
  const lines = [];
  lines.push(`🥅 풋살 배정 (${format}, ${players.length}명)`);
  const limited = players.filter((p) => {
    const r = qMap[p];
    return r && (r.start > 1 || r.end < TOTAL_QUARTERS);
  });
  if (limited.length) {
    const tags = limited.map((p) => `${p}(Q${qMap[p].start}~${qMap[p].end})`).join(", ");
    lines.push(`※ 부분 참여: ${tags}`);
  }
  lines.push("──────────────");
  for (const q of schedule) {
    const restText = q.rest.length ? `  Rest ${q.rest.join("·")}` : "";
    lines.push(`Q${q.quarter}  GK ${q.gk}${restText}`);
  }
  lines.push("──────────────");

  const gkCount = {};
  const restCount = {};
  for (const p of players) {
    gkCount[p] = 0;
    restCount[p] = 0;
  }
  for (const q of schedule) {
    gkCount[q.gk]++;
    for (const r of q.rest) restCount[r]++;
  }
  const gkSummary = players.map((p) => `${shortName(p)}${gkCount[p]}`).join(" ");
  lines.push(`키퍼 총 횟수: ${gkSummary}`);
  if (Object.values(restCount).some((v) => v > 0)) {
    const restSummary = players.map((p) => `${shortName(p)}${restCount[p]}`).join(" ");
    lines.push(`휴식 총 횟수: ${restSummary}`);
  }
  return lines.join("\n");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildSchedule,
    buildScheduleStatic,
    buildScheduleDynamic,
    validateSchedule,
    formatForKakao,
    SCHEDULES,
    REST_COUNT,
    TOTAL_QUARTERS,
  };
}
