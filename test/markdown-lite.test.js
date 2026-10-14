const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
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
});
