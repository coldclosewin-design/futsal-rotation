const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { createHash } = require("node:crypto");
const { renderMarkdownLite } = require("../js/markdown-lite.js");

describe("renderMarkdownLite", () => {
  test("#과 ## 제목을 변환한다", () => {
    assert.equal(
      renderMarkdownLite("# 회칙\n\n## 회비"),
      "<h1>회칙</h1><h2>회비</h2>"
    );
  });

  test("연속 불릿을 목록으로 묶고 다음 제목 전에 닫는다", () => {
    assert.equal(
      renderMarkdownLite("- 월 회비\n- 매월 납부\n## 경기 운영"),
      "<ul><li>월 회비</li><li>매월 납부</li></ul><h2>경기 운영</h2>"
    );
  });

  test("들여쓴 하위 불릿을 부모 항목 안에 중첩하고 상위 목록으로 돌아온다", () => {
    assert.equal(
      renderMarkdownLite("- 급불참\n  - 애사\n  - 개인 사유\n    - 벌금 부과\n- 지각"),
      "<ul><li>급불참<ul><li>애사</li><li>개인 사유<ul><li>벌금 부과</li></ul></li></ul></li><li>지각</li></ul>"
    );
  });

  test("빈 줄로 문단을 구분하고 문단 안의 줄바꿈은 이어 붙인다", () => {
    assert.equal(
      renderMarkdownLite("첫 번째 줄\r\n이어지는 줄\r\n\r\n다음 문단\r\n\r\n- 항목\r\n\r\n마지막 문단"),
      "<p>첫 번째 줄 이어지는 줄</p><p>다음 문단</p><ul><li>항목</li></ul><p>마지막 문단</p>"
    );
    assert.equal(renderMarkdownLite("\n  \n"), "");
  });

  test("제목·불릿·문단의 HTML과 특수 문자를 먼저 이스케이프한다", () => {
    assert.equal(
      renderMarkdownLite("# <script>alert(\"x\")</script>\n- <img src=x onerror=\"alert(1)\">\n\nA&B '회칙' &lt;b&gt;"),
      "<h1>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</h1><ul><li>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</li></ul><p>A&amp;B &#39;회칙&#39; &amp;lt;b&amp;gt;</p>"
    );
  });

  test("불릿 다음에 들여쓴 괄호 설명을 같은 항목에 유지한다", () => {
    assert.equal(
      renderMarkdownLite("- 회비 사용\n  (운영위원장 승인 시 허용)\n- 공식 경기"),
      "<ul><li>회비 사용 (운영위원장 승인 시 허용)</li><li>공식 경기</li></ul>"
    );
  });

  test("rotation.html을 고정된 배정표 링크로 변환한다", () => {
    assert.equal(
      renderMarkdownLite("- 배정표: rotation.html\n\n<rotation.html onclick=\"alert(1)\">"),
      "<ul><li>배정표: <a href=\"rotation.html\">rotation.html</a></li></ul><p>&lt;<a href=\"rotation.html\">rotation.html</a> onclick=&quot;alert(1)&quot;&gt;</p>"
    );
  });

  test("###은 h3로, 네 개 이상의 #은 문단으로 유지한다", () => {
    assert.equal(
      renderMarkdownLite("### 처음 한 번만\n#### 지원하지 않는 제목\n##### 역시 문단"),
      "<h3>처음 한 번만</h3><p>#### 지원하지 않는 제목 ##### 역시 문단</p>"
    );
  });

  test("굵게는 한 줄에서만 닫고 짝이 없는 별표는 그대로 유지한다", () => {
    assert.equal(
      renderMarkdownLite("### **설정**\n**팀 PIN**과 **이름**\n\n**첫 줄\n다음 줄**\n\n**미완성"),
      "<h3><strong>설정</strong></h3><p><strong>팀 PIN</strong>과 <strong>이름</strong></p><p>**첫 줄 다음 줄**</p><p>**미완성</p>"
    );
  });

  test("http(s) 링크만 새 창으로 열고 상대 문서·앵커 링크는 같은 창으로 연다", () => {
    assert.equal(
      renderMarkdownLite("[외부](https://example.com/?a=1&b=2) [HTTP](http://example.com) [홈](index.html) [가이드](docs/guide.md) [회칙](../rules.html) [팀원](#팀원-편)"),
      "<p><a href=\"https://example.com/?a=1&amp;b=2\" target=\"_blank\" rel=\"noopener\">외부</a> <a href=\"http://example.com\" target=\"_blank\" rel=\"noopener\">HTTP</a> <a href=\"index.html\">홈</a> <a href=\"docs/guide.md\">가이드</a> <a href=\"../rules.html\">회칙</a> <a href=\"#팀원-편\">팀원</a></p>"
    );
  });

  test("허용하지 않는 URL은 확장자로 위장해도 링크로 만들지 않는다", () => {
    for (const url of ["javascript:evil.html", "JaVaScRiPt:evil.md", "data:text/html,evil.md", "mailto:team@example.com", "//example.com/evil.html", "\\evil.html", "rules.pdf", "rules.html?demo=1"]) {
      const markdown = `[링크](${url})`;
      assert.equal(renderMarkdownLite(markdown), `<p>${markdown}</p>`);
    }
  });

  test("굵게·링크를 결합해도 중첩 링크나 속성 안의 태그를 만들지 않는다", () => {
    assert.equal(
      renderMarkdownLite("[**rotation.html**](rotation.html) **[배정표](rotation.html)** [외부](https://example.com/rotation.html)"),
      "<p><a href=\"rotation.html\"><strong>rotation.html</strong></a> <strong><a href=\"rotation.html\">배정표</a></strong> <a href=\"https://example.com/rotation.html\" target=\"_blank\" rel=\"noopener\">외부</a></p>"
    );
  });

  test("새 인라인 문법도 HTML·따옴표·엔티티를 먼저 이스케이프한다", () => {
    assert.equal(
      renderMarkdownLite("**<img src=x onerror=\"evil\">** [<script>](https://example.com/\" onmouseover=\"evil) [위장](javascript&#58;evil.html)"),
      "<p><strong>&lt;img src=x onerror=&quot;evil&quot;&gt;</strong> <a href=\"https://example.com/&quot; onmouseover=&quot;evil\" target=\"_blank\" rel=\"noopener\">&lt;script&gt;</a> <a href=\"javascript&amp;#58;evil.html\">위장</a></p>"
    );
  });

  test("연속 번호 목록은 번호 값과 관계없이 하나의 ol로 묶고 블록마다 닫는다", () => {
    assert.equal(
      renderMarkdownLite("3. **첫 항목**\n9. [회칙](rules.html)\n\n5. 새 목록\n### 제목\n1. 제목 다음\n- 불릿\n2. 불릿 다음\n문단"),
      "<ol><li><strong>첫 항목</strong></li><li><a href=\"rules.html\">회칙</a></li></ol><ol><li>새 목록</li></ol><h3>제목</h3><ol><li>제목 다음</li></ol><ul><li>불릿</li></ul><ol><li>불릿 다음</li></ol><p>문단</p>"
    );
  });

  test("번호 목록은 중첩하지 않고 불릿의 기존 중첩 동작은 유지한다", () => {
    assert.equal(
      renderMarkdownLite("1. 첫 항목\n  2. 들여쓴 번호\n- 불릿\n  - 하위 불릿\n3. 마지막 번호"),
      "<ol><li>첫 항목</li></ol><p>2. 들여쓴 번호</p><ul><li>불릿<ul><li>하위 불릿</li></ul></li></ul><ol><li>마지막 번호</li></ol>"
    );
  });

  test("기존 docs/rules.md의 렌더 결과를 바꾸지 않는다", () => {
    const markdown = readFileSync(join(__dirname, "../docs/rules.md"), "utf8");
    // 확장 전 렌더러로 main 0995c3b의 회칙을 렌더링한 HTML 전체의 SHA-256.
    assert.equal(
      createHash("sha256").update(renderMarkdownLite(markdown)).digest("hex"),
      "b6a43e094c129501c6567a63dac52348af832467c817573f8421fedaa1db1837"
    );
  });
});
