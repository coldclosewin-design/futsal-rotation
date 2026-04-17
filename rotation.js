// 풋살 키퍼·휴식 배정 엔진
// - 5명 이상 임의 인원 지원 (5v5: ≥5명, 6v6: ≥6명)
// - 그리디 + 다중 시드 재시도로 엄격 연속 금지·공평성(편차 ≤ 1) 달성
// - 수학적으로 연속 금지 불가능한 케이스(totalOut > fieldSize)는 최소 위반 + 경고
// - 조기 퇴장자(quartersMap) 지원: 필드 중심 배치 정책

const TOTAL_QUARTERS = 8;
const RETRY_COUNT = 2000;

// ── 시드 기반 결정적 난수 (Mulberry32) ──
function makeRng(seed) {
  let s = (seed | 0) + 0x9E3779B9;
  return function () {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSchedule(players, format, quartersMap, shuffleOffset) {
  const qMap = quartersMap || {};
  // shuffleOffset은 시드 시작점 이동 → "다시 섞기" 버튼으로 전혀 다른 탐색 공간
  const base = (shuffleOffset || 0) * RETRY_COUNT;
  const first = buildScheduleDynamic(players, format, qMap, base);
  let best = first;
  let bestScore = scheduleScore(first, players, qMap, format);
  if (bestScore === 0) return best;

  for (let seed = base + 1; seed < base + RETRY_COUNT; seed++) {
    const s = buildScheduleDynamic(players, format, qMap, seed);
    const score = scheduleScore(s, players, qMap, format);
    if (score < bestScore) {
      bestScore = score;
      best = s;
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
    for (const p of cur) if (next.has(p)) violations++;
  }

  const qMap = quartersMap || {};
  const unlimited = players.filter((p) => {
    const r = qMap[p];
    return !r || (r.start === 1 && r.end === TOTAL_QUARTERS);
  });
  const gk = {}, rest = {};
  for (const p of players) { gk[p] = 0; rest[p] = 0; }
  for (const q of schedule) {
    gk[q.gk]++;
    for (const r of q.rest) rest[r]++;
  }
  const gkVals = unlimited.length ? unlimited.map((p) => gk[p]) : players.map((p) => gk[p]);
  const restVals = unlimited.length ? unlimited.map((p) => rest[p]) : players.map((p) => rest[p]);
  const gkSpread = gkVals.length ? Math.max(...gkVals) - Math.min(...gkVals) : 0;
  const restSpread = restVals.length ? Math.max(...restVals) - Math.min(...restVals) : 0;

  // 수학적으로 연속 금지 가능한지 판단
  const maxOutPerQ = Math.max(...schedule.map((q) => 1 + q.rest.length));
  // GK는 out에 포함되므로 다음 쿼터 out ⊆ 이전 쿼터 필드(fieldSize-1)여야 엄격 금지 가능
  const strictPossible = maxOutPerQ <= fieldSize - 1;
  // 수학적 불가능 케이스의 최소 가능한 위반 수 계산 (쿼터당 초과분의 합)
  const minUnavoidable = schedule.reduce((s, q) => s + Math.max(0, 1 + q.rest.length - (fieldSize - 1)), 0);
  const excessViolations = Math.max(0, violations - (strictPossible ? 0 : minUnavoidable));

  // 우선순위: 회피 가능한 연속 위반 > 공평성 편차 > 회피 불가 위반(참고용)
  return excessViolations * 10000 + Math.max(0, gkSpread - 1) * 100 + Math.max(0, restSpread - 1) * 100 + (strictPossible ? 0 : violations);
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
  for (const p of players) salts[p] = rng();
  // 시드별 정렬 전략: (GK+Rest) vs GK 우선 vs Rest 우선 순환
  const strategy = seed % 3;

  const range = (p) => quartersMap[p] || { start: 1, end: TOTAL_QUARTERS };
  const isLimited = (p) => {
    const r = range(p);
    return r.start > 1 || r.end < TOTAL_QUARTERS;
  };

  const gkCount = Object.fromEntries(players.map((p) => [p, 0]));
  const restCount = Object.fromEntries(players.map((p) => [p, 0]));
  const result = [];
  let prevOut = new Set();

  for (let q = 1; q <= TOTAL_QUARTERS; q++) {
    const active = players.filter((p) => {
      const r = range(p);
      return r.start <= q && q <= r.end;
    });
    if (active.length < fieldSize) {
      throw new Error(`Q${q}: 참가자 ${active.length}명으로 ${format} 불가 (최소 ${fieldSize}명 필요)`);
    }
    const restNeeded = active.length - fieldSize;
    const totalOut = restNeeded + 1;

    const outSort = (a, b) => {
      const la = isLimited(a) ? 1 : 0;
      const lb = isLimited(b) ? 1 : 0;
      if (la !== lb) return la - lb;
      const oa = gkCount[a] + restCount[a];
      const ob = gkCount[b] + restCount[b];
      const ga = gkCount[a], gb = gkCount[b];
      const ra = restCount[a], rb = restCount[b];
      if (strategy === 0) {
        if (oa !== ob) return oa - ob;
        if (ga !== gb) return ga - gb;
        if (ra !== rb) return ra - rb;
      } else if (strategy === 1) {
        if (ga !== gb) return ga - gb;
        if (oa !== ob) return oa - ob;
        if (ra !== rb) return ra - rb;
      } else {
        if (ra !== rb) return ra - rb;
        if (oa !== ob) return oa - ob;
        if (ga !== gb) return ga - gb;
      }
      return salts[a] - salts[b];
    };
    const notPrev = active.filter((p) => !prevOut.has(p)).sort(outSort);
    const wasPrev = active.filter((p) => prevOut.has(p)).sort(outSort);
    const selected = [...notPrev, ...wasPrev].slice(0, totalOut);

    // GK 선정: selected 중 gkCount 최소
    const gkPool = selected.slice().sort((a, b) => {
      const la = isLimited(a) ? 1 : 0;
      const lb = isLimited(b) ? 1 : 0;
      if (la !== lb) return la - lb;
      if (gkCount[a] !== gkCount[b]) return gkCount[a] - gkCount[b];
      return salts[a] - salts[b];
    });
    const gk = gkPool[0];
    const rest = selected.filter((p) => p !== gk);

    gkCount[gk]++;
    for (const r of rest) restCount[r]++;
    prevOut = new Set(selected);
    const field = active.filter((p) => !selected.includes(p));
    result.push({ quarter: q, gk, rest, field });
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

  for (const q of schedule) {
    if (!q.gk) errors.push(`Q${q.quarter}: GK 없음`);
    const activeSize = q.field.length + 1 + q.rest.length;
    const expectedRest = activeSize - fieldSize;
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

  // 수학적으로 연속 금지 가능한지
  const maxOutPerQ = Math.max(...schedule.map((q) => 1 + q.rest.length));
  // GK는 out에 포함되므로 다음 쿼터 out ⊆ 이전 쿼터 필드(fieldSize-1)여야 엄격 금지 가능
  const strictPossible = maxOutPerQ <= fieldSize - 1;
  const violations = [];
  for (let i = 0; i < schedule.length - 1; i++) {
    const curOut = new Set([schedule[i].gk, ...schedule[i].rest]);
    const nextOut = new Set([schedule[i + 1].gk, ...schedule[i + 1].rest]);
    for (const p of curOut) {
      if (nextOut.has(p)) violations.push(`Q${i + 1}→Q${i + 2}: ${p}`);
    }
  }
  if (violations.length) {
    if (strictPossible) {
      for (const v of violations) errors.push(`연속 out 위반 ${v}`);
    } else {
      warnings.push(`연속 out 불가피 ${violations.length}건 (인원 ${playerCount}명/${format}에서 수학적 한계)`);
    }
  }

  // 공평성: 비제한자 기준 편차 ≤ 1
  const unlimited = Object.keys(gkCount).concat(Object.keys(restCount)).filter((p) => {
    const r = qMap[p];
    return !r || (r.start === 1 && r.end === TOTAL_QUARTERS);
  });
  const unlimitedSet = new Set(unlimited);

  // 공평성 편차 체크: 0회 GK/Rest 포함을 위해 전체 인원 기준으로 계산
  const allPlayers = Array.from(new Set([...Object.keys(gkCount), ...Object.keys(restCount)]));
  const playerSet = unlimitedSet.size > 0 ? allPlayers.filter((p) => unlimitedSet.has(p)) : allPlayers;
  const gkVals = playerSet.map((p) => gkCount[p] || 0);
  const restVals = playerSet.map((p) => restCount[p] || 0);
  if (gkVals.length) {
    const spread = Math.max(...gkVals) - Math.min(...gkVals);
    if (spread > 1) warnings.push(`GK 편차 ${spread} (최적화 한계로 완전 균등 미달)`);
  }
  if (restVals.length && restVals.some((v) => v > 0)) {
    const spread = Math.max(...restVals) - Math.min(...restVals);
    if (spread > 1) warnings.push(`Rest 편차 ${spread} (최적화 한계로 완전 균등 미달)`);
  }

  return { ok: errors.length === 0, errors, warnings, gkCount, restCount };
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
  const gkSummary = players.map((p) => `${p} ${gkCount[p]}`).join(" · ");
  lines.push(`키퍼 총 횟수: ${gkSummary}`);
  if (Object.values(restCount).some((v) => v > 0)) {
    const restSummary = players.map((p) => `${p} ${restCount[p]}`).join(" · ");
    lines.push(`휴식 총 횟수: ${restSummary}`);
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
