const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const schema = readFileSync(path.join(__dirname, "../supabase/schema.sql"), "utf8");
const seed = readFileSync(path.join(__dirname, "../supabase/seed.sql"), "utf8");
const { members } = JSON.parse(readFileSync(path.join(__dirname, "../members.json"), "utf8"));
const tables = [
  "members", "polls", "poll_votes", "match_candidates", "candidate_reactions",
  "matches", "match_attendance", "ledger", "snack_claims", "rotation_history",
];

for (const table of tables) {
  test(`${table}: 멱등 테이블 생성과 RLS 활성화`, () => {
    assert.match(schema, new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+public\\.${table}\\s*\\(`, "i"));
    assert.match(schema, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security\\s*;`, "i"));
  });
}

test("anon 역할을 허용하는 정책이 없음", () => {
  assert.doesNotMatch(schema, /\bto\s+anon\b/i);
  const policies = schema.match(/create\s+policy\b[^;]+;/gi) || [];
  assert.ok(policies.length > 0);
  for (const policy of policies) {
    assert.match(policy, /\bto\s+authenticated\s+(?:using|with\s+check)\b/i);
  }
});

for (const helper of ["is_team", "is_admin"]) {
  test(`${helper}: 권한 헬퍼 함수 정의`, () => {
    assert.match(schema, new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${helper}\\s*\\(\\s*\\)`, "i"));
  });
}

test("시드는 m01~m12를 원본 순서·이름과 회장 지정으로 멱등 삽입", () => {
  const rows = [...seed.matchAll(/\('(m\d{2})',\s*'([^']+)',\s*(true|false)\)/g)]
    .map(([, id, name, president]) => ({ id, name, is_president: president === "true" }));
  assert.deepEqual(rows.map((row) => row.id), Array.from({ length: 12 }, (_, i) => `m${String(i + 1).padStart(2, "0")}`));
  assert.deepEqual(rows, members.map((member) => ({ ...member, is_president: member.id === "m03" })));
  assert.match(seed, /on\s+conflict\s*\(id\)\s+do\s+update\s+set\s+name\s*=\s*excluded\.name\s*;/i);
  assert.doesNotMatch(seed, /\b(?:phone|bank_account)\b/i);
});
