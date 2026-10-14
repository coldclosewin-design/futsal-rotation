const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const { roleFromEmail, classifyAuthError, isConfigured } = require("../js/supabase.js");
const config = require("../js/config.js");
const source = readFileSync(join(__dirname, "../js/supabase.js"), "utf8");

describe("roleFromEmail", () => {
  test("설정에 지정된 팀과 회장 이메일을 구분한다", () => {
    assert.equal(roleFromEmail(config.TEAM_EMAIL, config), "team");
    assert.equal(roleFromEmail(config.ADMIN_EMAIL, config), "admin");
  });

  test("입력과 설정의 이메일 대소문자를 무시한다", () => {
    assert.equal(roleFromEmail(config.ADMIN_EMAIL.toUpperCase(), config), "admin");
    assert.equal(roleFromEmail(config.TEAM_EMAIL, {
      ...config, TEAM_EMAIL: config.TEAM_EMAIL.toUpperCase()
    }), "team");
  });

  test("null, undefined, 빈 값, 다른 이메일은 anon이다", () => {
    for (const email of [null, undefined, "", "other@example.invalid", 123]) {
      assert.equal(roleFromEmail(email, config), "anon");
    }
  });

  test("설정이 없거나 계정 이메일이 없으면 anon이다", () => {
    for (const setting of [null, undefined, {}, { TEAM_EMAIL: null, ADMIN_EMAIL: 123 }]) {
      assert.equal(roleFromEmail(config.TEAM_EMAIL, setting), "anon");
    }
  });

  test("두 계정 이메일이 같으면 발주서대로 admin을 우선한다", () => {
    assert.equal(roleFromEmail(config.TEAM_EMAIL, {
      TEAM_EMAIL: config.TEAM_EMAIL, ADMIN_EMAIL: config.TEAM_EMAIL
    }), "admin");
  });
});

describe("classifyAuthError", () => {
  test("잘못된 자격 증명의 오류 코드를 한국어로 분류한다", () => {
    assert.deepEqual(classifyAuthError({ code: "invalid_credentials", message: "invalid" }), {
      code: "invalid_credentials", message: "PIN 또는 비밀번호가 올바르지 않습니다"
    });
  });

  test("코드 없는 Invalid login credentials도 같은 오류로 분류한다", () => {
    assert.deepEqual(classifyAuthError(new Error("Invalid login credentials")), {
      code: "invalid_credentials", message: "PIN 또는 비밀번호가 올바르지 않습니다"
    });
  });

  test("이메일 미확인을 설정 안내로 분류한다", () => {
    assert.deepEqual(classifyAuthError({ code: "email_not_confirmed" }), {
      code: "email_not_confirmed", message: "계정 이메일 확인이 필요합니다 (Supabase 설정 확인)"
    });
  });

  test("TypeError와 다른 실행 환경의 TypeError도 네트워크 오류다", () => {
    for (const error of [new TypeError("offline"), { name: "TypeError", message: "offline" }]) {
      assert.deepEqual(classifyAuthError(error), {
        code: "network_error", message: "네트워크 연결을 확인하세요"
      });
    }
  });

  test("SDK가 감싼 Failed to fetch도 네트워크 오류다", () => {
    assert.deepEqual(classifyAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch" }), {
      code: "network_error", message: "네트워크 연결을 확인하세요"
    });
  });

  test("나머지 오류는 코드와 원문 메시지를 보존한다", () => {
    assert.deepEqual(classifyAuthError({ code: "over_request_rate_limit", message: "요청이 너무 많습니다" }), {
      code: "over_request_rate_limit", message: "로그인 실패: 요청이 너무 많습니다"
    });
  });

  test("문자열 오류와 오류 정보가 없는 경우도 처리한다", () => {
    assert.deepEqual(classifyAuthError("일시적인 오류"), {
      code: "unknown_error", message: "로그인 실패: 일시적인 오류"
    });
    for (const error of [null, undefined, {}]) {
      assert.deepEqual(classifyAuthError(error), {
        code: "unknown_error", message: "로그인 실패: 알 수 없는 오류"
      });
    }
  });
});

describe("isConfigured", () => {
  const configured = { SUPABASE_URL: "https://example.invalid", SUPABASE_ANON_KEY: "test-only-key" };

  test("URL과 키가 모두 문자열로 채워져 있으면 true다", () => {
    assert.equal(isConfigured(configured), true);
  });

  test("URL 또는 키 중 하나만 비어도 false다", () => {
    assert.equal(isConfigured({ ...configured, SUPABASE_URL: "" }), false);
    assert.equal(isConfigured({ ...configured, SUPABASE_ANON_KEY: "" }), false);
  });

  test("공백만 있는 URL과 키는 설정 전이다", () => {
    assert.equal(isConfigured({ ...configured, SUPABASE_URL: " \t" }), false);
    assert.equal(isConfigured({ ...configured, SUPABASE_ANON_KEY: "\n " }), false);
  });

  test("문자열이 아닌 URL과 키는 설정 전이다", () => {
    for (const value of [null, undefined, 123, {}, []]) {
      assert.equal(isConfigured({ ...configured, SUPABASE_URL: value }), false);
      assert.equal(isConfigured({ ...configured, SUPABASE_ANON_KEY: value }), false);
    }
  });

  test("설정 객체가 없거나 비어 있어도 false다", () => {
    for (const value of [null, undefined, {}]) assert.equal(isConfigured(value), false);
  });
});

describe("모듈 초기화와 세션", () => {
  test("Node 로드 시 DOM에 접근하지 않고 순수 함수 세 개만 export한다", () => {
    const context = { module: { exports: {} } };
    Object.defineProperty(context, "document", { get() { throw new Error("DOM 접근 금지"); } });
    runInNewContext(source, context);
    assert.deepEqual(Object.keys(context.module.exports).sort(), [
      "classifyAuthError", "isConfigured", "roleFromEmail"
    ]);
  });

  test("설정 전에는 SDK와 DOM 없이 초기화하고 anon을 반환한다", async () => {
    const context = { window: { EXICAN_CONFIG: { ...config, SUPABASE_URL: "", SUPABASE_ANON_KEY: "" } } };
    runInNewContext(source, context);
    const auth = context.window.ExicanAuth;
    assert.equal(await auth.init(), null);
    assert.equal(await auth.isConfigured(), false);
    assert.equal(await auth.getRole(), "anon");
    assert.equal(await auth.onAuthChange(() => {}), null);
  });

  test("동시 초기화에도 클라이언트와 내부 구독은 한 번만 생성한다", async () => {
    let creations = 0;
    let subscriptions = 0;
    const client = { auth: { onAuthStateChange() { subscriptions += 1; } } };
    const context = { window: {
      EXICAN_CONFIG: { ...config, SUPABASE_URL: "https://example.invalid", SUPABASE_ANON_KEY: "test-only-key" },
      supabase: { createClient(...args) {
        creations += 1;
        assert.deepEqual(args, ["https://example.invalid", "test-only-key"]);
        return client;
      } }
    } };
    runInNewContext(source, context);
    const auth = context.window.ExicanAuth;
    const clients = await Promise.all([auth.init(), auth.init(), auth.init()]);
    assert.ok(clients.every((value) => value === client));
    assert.equal(creations, 1);
    assert.equal(subscriptions, 1);
  });

  test("getRole은 SDK가 복원한 세션과 이후 세션 변경을 읽는다", async () => {
    let session = { user: { email: config.TEAM_EMAIL } };
    const context = { window: {
      EXICAN_CONFIG: { ...config, SUPABASE_URL: "https://example.invalid", SUPABASE_ANON_KEY: "test-only-key" },
      supabase: { createClient: () => ({ auth: {
        onAuthStateChange() {},
        getSession: async () => ({ data: { session }, error: null })
      } }) }
    } };
    runInNewContext(source, context);
    const auth = context.window.ExicanAuth;
    assert.equal(await auth.getRole(), "team");
    session = { user: { email: config.ADMIN_EMAIL } };
    assert.equal(await auth.getRole(), "admin");
    session = null;
    assert.equal(await auth.getRole(), "anon");
  });
});
