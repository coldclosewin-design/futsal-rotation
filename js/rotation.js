// Futsal keeper/rest rotation engine.
// Supports partial participation and balances assignments by active-quarter ratio.

const TOTAL_QUARTERS = 8;
const RETRY_COUNT = 2000;

function makeRng(seed) {
  let s = (seed | 0) + 0x9e3779b9;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getQuarterRange(quartersMap, player) {
  return quartersMap[player] || { start: 1, end: TOTAL_QUARTERS };
}

function getActiveQuarterCount(quartersMap, player) {
  const range = getQuarterRange(quartersMap, player);
  return range.end - range.start + 1;
}

function getNormalizedRoleCount(counts, quartersMap, player) {
  return counts[player] / getActiveQuarterCount(quartersMap, player);
}

function getNormalizedLoad(gkCount, restCount, quartersMap, player) {
  return (gkCount[player] + restCount[player]) / getActiveQuarterCount(quartersMap, player);
}

function buildSchedule(players, format, quartersMap, shuffleOffset) {
  const qMap = quartersMap || {};
  const base = (shuffleOffset || 0) * RETRY_COUNT;
  const first = buildScheduleDynamic(players, format, qMap, base);
  let best = first;
  let bestScore = scheduleScore(first, players, qMap, format);
  if (bestScore === 0) return best;

  for (let seed = base + 1; seed < base + RETRY_COUNT; seed++) {
    const schedule = buildScheduleDynamic(players, format, qMap, seed);
    const score = scheduleScore(schedule, players, qMap, format);
    if (score < bestScore) {
      bestScore = score;
      best = schedule;
      if (score === 0) break;
    }
  }

  return best;
}

function scheduleScore(schedule, players, quartersMap, format) {
  const fieldSize = format === "5v5" ? 5 : 6;
  let violations = 0;

  for (let i = 0; i < schedule.length - 1; i++) {
    const cur = new Set([schedule[i].gk, ...schedule[i].rest]);
    const next = new Set([schedule[i + 1].gk, ...schedule[i + 1].rest]);
    for (const player of cur) {
      if (next.has(player)) violations++;
    }
  }

  const gk = {};
  const rest = {};
  for (const player of players) {
    gk[player] = 0;
    rest[player] = 0;
  }
  for (const quarter of schedule) {
    gk[quarter.gk]++;
    for (const player of quarter.rest) rest[player]++;
  }

  const gkVals = players.map((player) => getNormalizedRoleCount(gk, quartersMap, player));
  const restVals = players.map((player) => getNormalizedRoleCount(rest, quartersMap, player));
  const outVals = players.map((player) => getNormalizedLoad(gk, rest, quartersMap, player));
  const gkSpread = gkVals.length ? Math.max(...gkVals) - Math.min(...gkVals) : 0;
  const restSpread = restVals.length ? Math.max(...restVals) - Math.min(...restVals) : 0;
  const outSpread = outVals.length ? Math.max(...outVals) - Math.min(...outVals) : 0;

  const maxOutPerQ = Math.max(...schedule.map((quarter) => 1 + quarter.rest.length));
  const strictPossible = maxOutPerQ <= fieldSize - 1;
  const minUnavoidable = schedule.reduce(
    (sum, quarter) => sum + Math.max(0, 1 + quarter.rest.length - (fieldSize - 1)),
    0,
  );
  const excessViolations = Math.max(0, violations - (strictPossible ? 0 : minUnavoidable));

  return excessViolations * 10000 + outSpread * 1000 + gkSpread * 100 + restSpread * 100 + (strictPossible ? 0 : violations);
}

function buildScheduleDynamic(players, format, quartersMap, seed = 0) {
  const fieldSize = format === "5v5" ? 5 : 6;
  const rng = makeRng(seed);
  const workingPlayers = [...players];

  if (seed > 0) {
    for (let i = workingPlayers.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [workingPlayers[i], workingPlayers[j]] = [workingPlayers[j], workingPlayers[i]];
    }
  }

  players = workingPlayers;
  const salts = {};
  for (const player of players) salts[player] = rng();
  const strategy = seed % 3;

  const gkCount = Object.fromEntries(players.map((player) => [player, 0]));
  const restCount = Object.fromEntries(players.map((player) => [player, 0]));
  const result = [];
  let prevOut = new Set();

  for (let quarter = 1; quarter <= TOTAL_QUARTERS; quarter++) {
    const active = players.filter((player) => {
      const range = getQuarterRange(quartersMap, player);
      return range.start <= quarter && quarter <= range.end;
    });

    if (active.length < fieldSize) {
      throw new Error(`Q${quarter}: 참가자 ${active.length}명으로 ${format} 불가 (최소 ${fieldSize}명 필요)`);
    }

    const restNeeded = active.length - fieldSize;
    const totalOut = restNeeded + 1;

    const outSort = (a, b) => {
      const outA = getNormalizedLoad(gkCount, restCount, quartersMap, a);
      const outB = getNormalizedLoad(gkCount, restCount, quartersMap, b);
      const gkA = getNormalizedRoleCount(gkCount, quartersMap, a);
      const gkB = getNormalizedRoleCount(gkCount, quartersMap, b);
      const restA = getNormalizedRoleCount(restCount, quartersMap, a);
      const restB = getNormalizedRoleCount(restCount, quartersMap, b);

      if (strategy === 0) {
        if (outA !== outB) return outA - outB;
        if (gkA !== gkB) return gkA - gkB;
        if (restA !== restB) return restA - restB;
      } else if (strategy === 1) {
        if (gkA !== gkB) return gkA - gkB;
        if (outA !== outB) return outA - outB;
        if (restA !== restB) return restA - restB;
      } else {
        if (restA !== restB) return restA - restB;
        if (outA !== outB) return outA - outB;
        if (gkA !== gkB) return gkA - gkB;
      }

      return salts[a] - salts[b];
    };

    const notPrev = active.filter((player) => !prevOut.has(player)).sort(outSort);
    const wasPrev = active.filter((player) => prevOut.has(player)).sort(outSort);
    const selected = [...notPrev, ...wasPrev].slice(0, totalOut);

    const gkPool = selected.slice().sort((a, b) => {
      const gkA = getNormalizedRoleCount(gkCount, quartersMap, a);
      const gkB = getNormalizedRoleCount(gkCount, quartersMap, b);
      if (gkA !== gkB) return gkA - gkB;
      return salts[a] - salts[b];
    });

    const gk = gkPool[0];
    const rest = selected.filter((player) => player !== gk);
    const field = active.filter((player) => !selected.includes(player));

    gkCount[gk]++;
    for (const player of rest) restCount[player]++;
    prevOut = new Set(selected);

    result.push({ quarter, gk, rest, field });
  }

  return result;
}

function validateSchedule(schedule, playerCount, format, quartersMap) {
  const errors = [];
  const warnings = [];
  const fieldSize = format === "5v5" ? 5 : 6;
  const gkCount = {};
  const restCount = {};
  const qMap = quartersMap || {};
  const dynamic = !!quartersMap && Object.keys(qMap).length > 0;

  for (const quarter of schedule) {
    if (!quarter.gk) errors.push(`Q${quarter.quarter}: GK 없음`);

    const activeSize = quarter.field.length + 1 + quarter.rest.length;
    const expectedRest = activeSize - fieldSize;
    if (quarter.rest.length !== expectedRest) {
      errors.push(`Q${quarter.quarter}: Rest ${quarter.rest.length}명 (기대 ${expectedRest})`);
    }
    if (quarter.field.length !== fieldSize - 1) {
      errors.push(`Q${quarter.quarter}: 필드 ${quarter.field.length}명 (기대 ${fieldSize - 1})`);
    }

    gkCount[quarter.gk] = (gkCount[quarter.gk] || 0) + 1;
    for (const player of quarter.rest) {
      restCount[player] = (restCount[player] || 0) + 1;
    }

    if (dynamic) {
      const inThisQuarter = [quarter.gk, ...quarter.rest, ...quarter.field];
      for (const player of inThisQuarter) {
        const range = qMap[player];
        if (range && (quarter.quarter < range.start || quarter.quarter > range.end)) {
          errors.push(`Q${quarter.quarter}: ${player}는 Q${range.start}~Q${range.end}만 참가`);
        }
      }
    }
  }

  const maxOutPerQ = Math.max(...schedule.map((quarter) => 1 + quarter.rest.length));
  const strictPossible = maxOutPerQ <= fieldSize - 1;
  const violations = [];

  for (let i = 0; i < schedule.length - 1; i++) {
    const curOut = new Set([schedule[i].gk, ...schedule[i].rest]);
    const nextOut = new Set([schedule[i + 1].gk, ...schedule[i + 1].rest]);
    for (const player of curOut) {
      if (nextOut.has(player)) violations.push(`Q${i + 1}→Q${i + 2}: ${player}`);
    }
  }

  if (violations.length) {
    if (strictPossible) {
      for (const violation of violations) errors.push(`연속 out 위반 ${violation}`);
    } else {
      warnings.push(`연속 out 불가피 ${violations.length}건 (인원 ${playerCount}명/${format}에서 수학적 한계)`);
    }
  }

  const allPlayers = Array.from(new Set([...Object.keys(gkCount), ...Object.keys(restCount)]));
  const gkVals = allPlayers.map((player) => getNormalizedRoleCount(gkCount, qMap, player));
  const restVals = allPlayers.map((player) => getNormalizedRoleCount(restCount, qMap, player));
  const outVals = allPlayers.map((player) => getNormalizedLoad(gkCount, restCount, qMap, player));

  if (gkVals.length) {
    const spread = Math.max(...gkVals) - Math.min(...gkVals);
    if (spread > 0.26) warnings.push(`GK 비율 편차 ${spread.toFixed(2)} (참여 쿼터 대비 완전 균등 미달)`);
  }
  if (restVals.length && restVals.some((value) => value > 0)) {
    const spread = Math.max(...restVals) - Math.min(...restVals);
    if (spread > 0.26) warnings.push(`Rest 비율 편차 ${spread.toFixed(2)} (참여 쿼터 대비 완전 균등 미달)`);
  }
  if (outVals.length) {
    const spread = Math.max(...outVals) - Math.min(...outVals);
    if (spread > 0.26) warnings.push(`Out 비율 편차 ${spread.toFixed(2)} (참여 쿼터 대비 완전 균등 미달)`);
  }

  return { ok: errors.length === 0, errors, warnings, gkCount, restCount };
}

function formatForKakao(schedule, format, players, quartersMap) {
  const qMap = quartersMap || {};
  const lines = [];

  lines.push(`🥅 풋살 배정 (${format}, ${players.length}명)`);

  const limited = players.filter((player) => {
    const range = qMap[player];
    return range && (range.start > 1 || range.end < TOTAL_QUARTERS);
  });
  if (limited.length) {
    const tags = limited.map((player) => `${player}(Q${qMap[player].start}~Q${qMap[player].end})`).join(", ");
    lines.push(`※ 부분 참여: ${tags}`);
  }

  lines.push("──────────────");
  for (const quarter of schedule) {
    const restText = quarter.rest.length ? `  Rest ${quarter.rest.join("·")}` : "";
    lines.push(`Q${quarter.quarter}  GK ${quarter.gk}${restText}`);
  }
  lines.push("──────────────");

  const gkCount = {};
  const restCount = {};
  for (const player of players) {
    gkCount[player] = 0;
    restCount[player] = 0;
  }
  for (const quarter of schedule) {
    gkCount[quarter.gk]++;
    for (const player of quarter.rest) restCount[player]++;
  }

  lines.push(`키퍼 총 횟수: ${players.map((player) => `${player} ${gkCount[player]}`).join(" · ")}`);
  if (Object.values(restCount).some((value) => value > 0)) {
    lines.push(`휴식 총 횟수: ${players.map((player) => `${player} ${restCount[player]}`).join(" · ")}`);
  }

  return lines.join("\n");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildSchedule,
    buildScheduleDynamic,
    validateSchedule,
    formatForKakao,
    TOTAL_QUARTERS,
  };
}
