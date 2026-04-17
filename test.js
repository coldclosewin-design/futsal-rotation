// 풋살 배정 엔진 자동 회귀 테스트
// 실행: node test.js
// 의존성 없음. 실패 시 exit code 1.

const { buildSchedule, validateSchedule, formatForKakao, TOTAL_QUARTERS } = require("./rotation.js");

let pass = 0;
let fail = 0;
const failures = [];

function assert(label, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    failures.push({ label, detail });
    console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`);
  }
}

function runCase(title, fn) {
  console.log(`\n▶ ${title}`);
  try {
    fn();
  } catch (e) {
    fail++;
    failures.push({ label: title + " (예외)", detail: e.message });
    console.log(`  ✗ 예외: ${e.message}`);
  }
}

function checkFairness(counts, who, limit = 1) {
  const vals = who.map((p) => counts[p] || 0);
  if (vals.length === 0) return 0;
  return Math.max(...vals) - Math.min(...vals);
}

// ─── 1. 정적 테이블 경로 (전원 전체 참여) ───
const basicCases = [
  { n: 6, fmt: "5v5" },
  { n: 6, fmt: "6v6" },
  { n: 7, fmt: "5v5" },
  { n: 7, fmt: "6v6" },
];
for (const { n, fmt } of basicCases) {
  runCase(`[정적] ${n}명 / ${fmt}`, () => {
    const players = Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));
    const schedule = buildSchedule(players, fmt);
    const v = validateSchedule(schedule, n, fmt);
    assert("validateSchedule.ok", v.ok, v.errors.join("; "));
    assert("GK 편차 ≤ 1", checkFairness(v.gkCount, players) <= 1);
    const hasRest = schedule.some((q) => q.rest.length > 0);
    if (hasRest) {
      assert("Rest 편차 ≤ 1", checkFairness(v.restCount, players) <= 1);
    }
    assert("8쿼터 생성", schedule.length === TOTAL_QUARTERS);
  });
}

// ─── 2. 조기 퇴장 / 늦참 시나리오 ───
const dynamicCases = [
  {
    title: "7명/5v5 — A가 Q1~Q4만",
    players: ["A","B","C","D","E","F","G"],
    fmt: "5v5",
    qMap: { A: { start: 1, end: 4 } },
    earlyLeavers: ["A"],
  },
  {
    title: "7명/6v6 — A가 Q1~Q5만",
    players: ["A","B","C","D","E","F","G"],
    fmt: "6v6",
    qMap: { A: { start: 1, end: 5 } },
    earlyLeavers: ["A"],
  },
  {
    title: "6명/5v5 — A가 Q1~Q6만",
    players: ["A","B","C","D","E","F"],
    fmt: "5v5",
    qMap: { A: { start: 1, end: 6 } },
    earlyLeavers: ["A"],
  },
  {
    title: "7명/5v5 — 2명 조기: A Q1~4, B Q1~5",
    players: ["A","B","C","D","E","F","G"],
    fmt: "5v5",
    qMap: { A: { start: 1, end: 4 }, B: { start: 1, end: 5 } },
    earlyLeavers: ["A", "B"],
  },
  {
    title: "7명/5v5 — 늦참: A가 Q3~Q8만",
    players: ["A","B","C","D","E","F","G"],
    fmt: "5v5",
    qMap: { A: { start: 3, end: 8 } },
    earlyLeavers: ["A"],
  },
];

for (const c of dynamicCases) {
  runCase(`[동적] ${c.title}`, () => {
    const schedule = buildSchedule(c.players, c.fmt, c.qMap);
    const v = validateSchedule(schedule, c.players.length, c.fmt, c.qMap);
    assert("validateSchedule.ok", v.ok, v.errors.join("; "));

    // 조기 퇴장자 참여 구간 준수
    for (const leaver of c.earlyLeavers) {
      const range = c.qMap[leaver];
      let appearOutside = false;
      for (const q of schedule) {
        const inQ = q.gk === leaver || q.rest.includes(leaver) || q.field.includes(leaver);
        if (inQ && (q.quarter < range.start || q.quarter > range.end)) appearOutside = true;
      }
      assert(`${leaver} 참여 구간 준수`, !appearOutside);
    }

    // "필드 중심" 정책: 조기 퇴장자의 GK/Rest 합은 비제한자 최솟값 이하여야 함
    const unlimited = c.players.filter((p) => !c.qMap[p]);
    const unlimitedOut = unlimited.map((p) => (v.gkCount[p] || 0) + (v.restCount[p] || 0));
    const minUnlimited = unlimitedOut.length ? Math.min(...unlimitedOut) : 0;
    for (const leaver of c.earlyLeavers) {
      const leaverOut = (v.gkCount[leaver] || 0) + (v.restCount[leaver] || 0);
      assert(
        `${leaver} out(${leaverOut}) ≤ 비제한자 최소(${minUnlimited})`,
        leaverOut <= minUnlimited
      );
    }

    // 비제한자 기준 공평성 편차 ≤ 1
    assert("비제한자 GK 편차 ≤ 1", checkFairness(v.gkCount, unlimited) <= 1);
    const hasRest = schedule.some((q) => q.rest.length > 0);
    if (hasRest) {
      assert("비제한자 Rest 편차 ≤ 1", checkFairness(v.restCount, unlimited) <= 1);
    }
  });
}

// ─── 3. 에러 케이스 (필드 인원 부족) ───
runCase("[에러] 6명/6v6 — A가 Q1~Q2만 → Q3부터 5명 (6v6 불가)", () => {
  let threw = false;
  let msg = "";
  try {
    buildSchedule(["A","B","C","D","E","F"], "6v6", { A: { start: 1, end: 2 } });
  } catch (e) {
    threw = true;
    msg = e.message;
  }
  assert("에러 발생", threw, "에러가 나지 않음");
  assert("에러 메시지에 쿼터·포맷 정보 포함", /Q\d.*6v6/.test(msg), msg);
});

// ─── 4. formatForKakao 출력 형식 점검 ───
runCase("[포맷] formatForKakao 출력에 참여 구간 표시", () => {
  const players = ["A","B","C","D","E","F","G"];
  const qMap = { A: { start: 1, end: 4 } };
  const schedule = buildSchedule(players, "5v5", qMap);
  const text = formatForKakao(schedule, "5v5", players, qMap);
  assert("헤더 포함", text.includes("풋살 배정 (5v5, 7명)"));
  assert("부분 참여 표기", text.includes("A(Q1~4)"));
  assert("구분선 포함", text.includes("──"));
  assert("키퍼 요약 포함", /키퍼 총 횟수:\s/.test(text));
  assert("휴식 요약 포함", /휴식 총 횟수:\s/.test(text));
});

// ─── 결과 ───
console.log("\n" + "═".repeat(50));
console.log(`결과: ${pass} PASS, ${fail} FAIL`);
if (fail > 0) {
  console.log("\n실패 상세:");
  for (const f of failures) {
    console.log(`  - ${f.label}${f.detail ? ": " + f.detail : ""}`);
  }
  process.exit(1);
}
