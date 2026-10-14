const markdownEscapeHtml = typeof module !== "undefined" && module.exports
  ? require("./ui.js").escapeHtml
  : escapeHtml;

function renderMarkdownLite(markdown) {
  const html = [];
  const paragraph = [];
  const listIndents = [];
  const lines = markdownEscapeHtml(markdown).replace(/\r\n?/g, "\n").split("\n");

  function inline(text) {
    return text.replace(/\brotation\.html\b/g, "<a href=\"rotation.html\">rotation.html</a>");
  }

  function flushParagraph() {
    if (paragraph.length) {
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph.length = 0;
    }
  }

  function closeLists(depth = 0) {
    while (listIndents.length > depth) {
      html.push("</li></ul>");
      listIndents.pop();
    }
  }

  for (const line of lines) {
    if (!line.trim()) {
      flushParagraph();
      closeLists();
      continue;
    }

    const heading = /^(#{1,2})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^(\s*)-\s+(.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      const indent = bullet[1].length;
      while (listIndents.length && indent < listIndents[listIndents.length - 1]) {
        closeLists(listIndents.length - 1);
      }
      if (!listIndents.length || indent > listIndents[listIndents.length - 1]) {
        html.push("<ul><li>");
        listIndents.push(indent);
      } else {
        html.push("</li><li>");
      }
      html.push(inline(bullet[2]));
      continue;
    }

    // 들여쓴 괄호 설명은 바로 앞 불릿의 본문으로 이어 붙인다.
    if (listIndents.length && /^\s+\S/.test(line)) {
      html.push(` ${inline(line.trim())}`);
    } else {
      closeLists();
      paragraph.push(line.trim());
    }
  }

  flushParagraph();
  closeLists();
  return html.join("");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { renderMarkdownLite };
}
