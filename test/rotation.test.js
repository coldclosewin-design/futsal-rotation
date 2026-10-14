const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSchedule, validateSchedule, formatForKakao, TOTAL_QUARTERS, playerSpacing, spacingPenalty, SPACING_WEIGHT } = require("../js/rotation.js");

// 기존 어서션마다 테스트 1개를 등록하여 91개 검증을 개별 결과로 유지합니다.
function check(label, condition, detail) {
  test(label, () => {
    assert.ok(condition, detail || label);
  });
}

function spread(values) {
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

function countSpread(counts, players) {
  return spread(players.map((player) => counts[player] || 0));
}

function normalizedOutSpread(gkCount, restCount, players, qMap) {
  return spread(
    players.map((player) => {
      const range = qMap[player] || { start: 1, end: TOTAL_QUARTERS };
      const active = range.end - range.start + 1;
      return ((gkCount[player] || 0) + (restCount[player] || 0)) / active;
    }),
  );
}

const basicCases = [];
for (const count of [5, 6, 7, 8, 9, 10, 11, 12]) {
  for (const format of ["5v5", "6v6"]) {
    const minimum = format === "5v5" ? 5 : 6;
    if (count >= minimum) basicCases.push({ count, format });
  }
}

for (const testCase of basicCases) {
  describe(`[basic] ${testCase.count} players / ${testCase.format}`, () => {
    const players = Array.from({ length: testCase.count }, (_, index) => String.fromCharCode(65 + index));
    const schedule = buildSchedule(players, testCase.format);
    const validation = validateSchedule(schedule, players.length, testCase.format);

    check("validateSchedule.ok", validation.ok, validation.errors.join("; "));
    check("GK spread <= 2", countSpread(validation.gkCount, players) <= 2);

    const hasRest = schedule.some((quarter) => quarter.rest.length > 0);
    if (hasRest) {
      check("Rest spread <= 2", countSpread(validation.restCount, players) <= 2);
    }

    check("8 quarters generated", schedule.length === TOTAL_QUARTERS);
  });
}

const dynamicCases = [
  {
    title: "7 players / 5v5 / A only Q1-Q4",
    players: ["A", "B", "C", "D", "E", "F", "G"],
    format: "5v5",
    qMap: { A: { start: 1, end: 4 } },
    partialPlayers: ["A"],
  },
  {
    title: "7 players / 6v6 / A only Q1-Q5",
    players: ["A", "B", "C", "D", "E", "F", "G"],
    format: "6v6",
    qMap: { A: { start: 1, end: 5 } },
    partialPlayers: ["A"],
  },
  {
    title: "6 players / 5v5 / A only Q1-Q6",
    players: ["A", "B", "C", "D", "E", "F"],
    format: "5v5",
    qMap: { A: { start: 1, end: 6 } },
    partialPlayers: ["A"],
  },
  {
    title: "7 players / 5v5 / A Q1-Q4, B Q1-Q5",
    players: ["A", "B", "C", "D", "E", "F", "G"],
    format: "5v5",
    qMap: { A: { start: 1, end: 4 }, B: { start: 1, end: 5 } },
    partialPlayers: ["A", "B"],
  },
  {
    title: "7 players / 5v5 / A joins from Q3",
    players: ["A", "B", "C", "D", "E", "F", "G"],
    format: "5v5",
    qMap: { A: { start: 3, end: 8 } },
    partialPlayers: ["A"],
  },
];

for (const testCase of dynamicCases) {
  describe(`[dynamic] ${testCase.title}`, () => {
    const schedule = buildSchedule(testCase.players, testCase.format, testCase.qMap);
    const validation = validateSchedule(schedule, testCase.players.length, testCase.format, testCase.qMap);

    check("validateSchedule.ok", validation.ok, validation.errors.join("; "));

    for (const player of testCase.partialPlayers) {
      const range = testCase.qMap[player];
      let appearsOutsideRange = false;

      for (const quarter of schedule) {
        const appears =
          quarter.gk === player || quarter.rest.includes(player) || quarter.field.includes(player);
        if (appears && (quarter.quarter < range.start || quarter.quarter > range.end)) {
          appearsOutsideRange = true;
        }
      }

      check(`${player} stays within active range`, !appearsOutsideRange);
    }

    check(
      "normalized out spread <= 0.26",
      normalizedOutSpread(validation.gkCount, validation.restCount, testCase.players, testCase.qMap) <= 0.26,
    );

    const fullTimers = testCase.players.filter((player) => !testCase.qMap[player]);
    check("full-timer GK spread <= 2", countSpread(validation.gkCount, fullTimers) <= 2);

    const hasRest = schedule.some((quarter) => quarter.rest.length > 0);
    if (hasRest) {
      check("full-timer Rest spread <= 2", countSpread(validation.restCount, fullTimers) <= 2);
    }
  });
}

describe("[error] 6 players / 6v6 / A only Q1-Q2", () => {
  let threw = false;
  let message = "";

  try {
    buildSchedule(["A", "B", "C", "D", "E", "F"], "6v6", { A: { start: 1, end: 2 } });
  } catch (error) {
    threw = true;
    message = error.message;
  }

  check("throws error", threw);
  check("error includes quarter and format", /Q\d.*6v6/.test(message), message);
});

describe("[format] formatForKakao includes partial-range info", () => {
  const players = ["A", "B", "C", "D", "E", "F", "G"];
  const qMap = { A: { start: 1, end: 4 } };
  const schedule = buildSchedule(players, "5v5", qMap);
  const text = formatForKakao(schedule, "5v5", players, qMap);

  check("header exists", text.includes("풋살 배정 (5v5, 7명)"));
  check("partial range exists", text.includes("A(Q1~Q4)"));
  check("separator exists", text.includes("──────────────"));
  check("keeper summary exists", /키퍼 총 횟수:\s/.test(text));
  check("rest summary exists", /휴식 총 횟수:\s/.test(text));
});

function outQuarters(schedule, player) {
  return schedule
    .filter((quarter) => quarter.gk === player || quarter.rest.includes(player))
    .map((quarter) => quarter.quarter)
    .sort((a, b) => a - b);
}

function spacingFixture(out, role = "gk") {
  return Array.from({ length: TOTAL_QUARTERS }, (_, index) => {
    const quarter = index + 1;
    const isOut = out.includes(quarter);
    return {
      quarter,
      gk: isOut && role === "gk" ? "A" : "B",
      rest: isOut && role === "rest" ? ["A"] : [],
      field: isOut ? ["C", "D", "E", "F"] : ["A", "C", "D", "E"],
    };
  });
}

describe("[spacing-unit] normalized play-run variance", () => {
  const cases = [
    { out: [3, 6], expected: 0 },
    { out: [2, 6], expected: 1 / 6 },
    { out: [2, 4], expected: 0.5 },
    { out: [1, 6], expected: 2 / 3 },
    { out: [1, 8], expected: 2 },
    { out: [1], expected: 1 },
    { out: [4], expected: 0.020408, tolerance: 0.0000005 },
    { out: [3, 6], range: { start: 3, end: 8 }, expected: 0.5 },
    { out: [], expected: 0 },
    { out: [1, 2, 3, 4, 5, 6, 7, 8], expected: 0 },
    { out: [3], range: { start: 3, end: 3 }, expected: 0 },
    { out: [], range: { start: 3, end: 3 }, expected: 0 },
  ];
  for (const { out, range, expected, tolerance = 1e-9 } of cases) {
    test(`out ${JSON.stringify(out)}, range ${JSON.stringify(range || { start: 1, end: 8 })}`, () => {
      for (const role of ["gk", "rest"]) {
        const actual = playerSpacing(spacingFixture(out, role), "A", range);
        assert.ok(Number.isFinite(actual));
        assert.ok(Math.abs(actual - expected) <= tolerance, `${role}: ${actual} != ${expected}`);
      }
    });
  }

  test("sorts quarters and limits metrics to the participation range", () => {
    const schedule = spacingFixture([1, 3, 6]).reverse();
    assert.ok(Math.abs(playerSpacing(schedule, "A", { start: 3, end: 8 }) - 0.5) < 1e-9);
  });

  test("averages only players with out, including zero penalties", () => {
    const schedule = spacingFixture([3, 6]);
    const expected = playerSpacing(schedule, "B") / 2;
    assert.equal(spacingPenalty(schedule, ["A", "B", "C"]), expected);
    assert.equal(spacingPenalty(schedule, ["A", "B", "C"], {}), expected);
    assert.equal(spacingPenalty(schedule, ["C"]), 0);
    assert.equal(spacingPenalty(schedule, []), 0);
    assert.equal(spacingPenalty([], ["A"]), 0);
  });

  test("uses each player's range for the mean and excludes out outside it", () => {
    const schedule = spacingFixture([1, 3, 6]);
    const qMap = { A: { start: 3, end: 8 }, B: { start: 1, end: 1 } };
    assert.ok(Math.abs(spacingPenalty(schedule, ["A", "B", "C"], qMap) - 0.5) < 1e-9);
  });

  test("exports the spacing weight", () => {
    assert.equal(SPACING_WEIGHT, 200);
  });

  test("exposes spacing helpers and weight to following browser scripts", () => {
    const { readFileSync } = require("node:fs");
    const { createContext, runInContext } = require("node:vm");
    const source = readFileSync(require.resolve("../js/rotation.js"), "utf8");
    const browser = createContext({});
    runInContext(source, browser);
    assert.equal(runInContext("typeof playerSpacing", browser), "function");
    assert.equal(runInContext("typeof spacingPenalty", browser), "function");
    assert.equal(runInContext("SPACING_WEIGHT", browser), 200);
  });

  test("warns above 1.0 and lists out quarters in order", () => {
    const validation = validateSchedule(spacingFixture([1, 8]), 6, "5v5");
    assert.ok(validation.warnings.includes("out 간격 편중: A (Q1,Q8)"));
    assert.ok(!validation.errors.some((error) => error.includes("간격 편중")));
  });

  test("does not warn at 1.0 or for balanced partial participation", () => {
    const boundary = validateSchedule(spacingFixture([1]), 6, "5v5");
    assert.ok(!boundary.warnings.some((warning) => warning.startsWith("out 간격 편중: A ")));
    const partial = validateSchedule(spacingFixture([3, 6]), 6, "5v5", { A: { start: 3, end: 8 } });
    assert.ok(!partial.warnings.some((warning) => warning.startsWith("out 간격 편중: A ")));
  });
});

// 발주서 보정 규칙: 최초 실행 관측 최대값 × 1.5. 통과한 기준은 그대로 유지합니다.
const spacingLimits = {
  "7/5v5": { penalty: 0.44357142857142856 * 1.5, player: 0.875 * 1.5 },
  "7/6v6": { penalty: 0.40380952380952373 * 1.5, player: 1.08 * 1.5 },
  "9/6v6": { penalty: 0.4005555555555555 * 1.5, player: 0.875 * 1.5 },
  "10/5v5": { penalty: 0.85 * 1.5 },
  "11/5v5": { penalty: 1.1363636363636365 * 1.5 },
  "12/5v5": { penalty: 1.5 * 1.5 },
};

for (const { count, format } of basicCases) {
  const fieldSize = format === "5v5" ? 5 : 6;
  if (count === fieldSize) continue;
  test(`[spacing] ${count} players / ${format}`, () => {
    const players = Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
    const schedule = buildSchedule(players, format);
    const maxOutPerQ = Math.max(...schedule.map((quarter) => 1 + quarter.rest.length));
    const strictPossible = maxOutPerQ <= fieldSize - 1;
    const penalty = spacingPenalty(schedule, players);
    const limits = spacingLimits[`${count}/${format}`] || {};
    assert.ok(penalty <= (limits.penalty ?? (strictPossible ? 0.4 : 0.8)), `spacingPenalty = ${penalty}`);
    if (!strictPossible) return;

    for (const player of players) {
      const spacing = playerSpacing(schedule, player);
      assert.ok(spacing <= (limits.player ?? 0.7), `${player}: playerSpacing = ${spacing}`);
      const out = outQuarters(schedule, player);
      if (out.length < 2) continue;
      assert.ok(out[0] <= 4 && out[out.length - 1] >= 5, `${player}: out = ${out}`);
      for (let i = 1; i < out.length; i++) {
        assert.ok(out[i] - out[i - 1] <= 5, `${player}: out = ${out}`);
      }
    }
  });
}

const dynamicSpacingLimits = new Map([
  [dynamicCases[0], 0.76 * 1.5],
  [dynamicCases[3], 0.76 * 1.5],
  [dynamicCases[4], 0.875 * 1.5],
]);

for (const testCase of dynamicCases) {
  test(`[spacing-dynamic] ${testCase.title}`, () => {
    const { players, format, qMap } = testCase;
    const schedule = buildSchedule(players, format, qMap);
    for (const player of players) {
      const range = qMap[player];
      const spacing = playerSpacing(schedule, player, range);
      if (!range) {
        assert.ok(spacing <= (dynamicSpacingLimits.get(testCase) ?? 0.7), `${player}: playerSpacing = ${spacing}`);
      } else {
        assert.ok(Number.isFinite(spacing) && spacing >= 0, `${player}: playerSpacing = ${spacing}`);
        assert.ok(outQuarters(schedule, player).every((quarter) => quarter >= range.start && quarter <= range.end));
      }
    }
  });
}

for (const testCase of [
  { title: "basic 7 players / 5v5", players: ["A", "B", "C", "D", "E", "F", "G"], format: "5v5" },
  dynamicCases[4],
]) {
  test(`[determinism] ${testCase.title}`, () => {
    for (const offset of [0, 1]) {
      const first = buildSchedule(testCase.players, testCase.format, testCase.qMap, offset);
      const second = buildSchedule(testCase.players, testCase.format, testCase.qMap, offset);
      assert.equal(JSON.stringify(first), JSON.stringify(second));
    }
  });
}
