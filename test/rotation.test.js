const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSchedule, validateSchedule, formatForKakao, TOTAL_QUARTERS } = require("../js/rotation.js");

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
