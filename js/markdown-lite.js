const markdownEscapeHtml = typeof module !== "undefined" && module.exports
  ? require("./ui.js").escapeHtml
  : escapeHtml;

function renderMarkdownLite(markdown) {
  const html = [];
  const paragraph = [];
  const listIndents = [];
  let orderedList = false;
  const lines = markdownEscapeHtml(markdown).replace(/\r\n?/g, "\n").split("\n");

  function inline(text, allowLinks = true) {
    // 이스케이프된 원문을 토큰별로 변환해 링크 속성이나 이미 만든 태그를 다시 치환하지 않는다.
    return text.replace(/\*\*([^\n]+?)\*\*|\[([^\]\n]+)\]\(([^)\n]+)\)|\brotation\.html\b/g, (match, bold, label, url) => {
      if (bold !== undefined) return `<strong>${inline(bold, allowLinks)}</strong>`;
      if (!allowLinks) return match;
      if (url !== undefined) {
        const external = /^https?:\/\//.test(url);
        const relative = /^#/.test(url) || /^(?![a-z][a-z\d+.-]*:)(?!\/\/)[^\\\s]*\.(?:html|md)$/i.test(url);
        if (!external && !relative) return match;
        const attributes = external ? " target=\"_blank\" rel=\"noopener\"" : "";
        return `<a href="${url}"${attributes}>${inline(label, false)}</a>`;
      }
      return "<a href=\"rotation.html\">rotation.html</a>";
    });
  }

  function flushParagraph() {
    if (paragraph.length) {
      html.push(`<p>${paragraph.map(line => inline(line)).join(" ")}</p>`);
      paragraph.length = 0;
    }
  }

  function closeLists(depth = 0) {
    if (orderedList) {
      html.push("</li></ol>");
      orderedList = false;
    }
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

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const numbered = /^\d+\.\s+(.+)$/.exec(line);
    if (numbered) {
      flushParagraph();
      if (orderedList) {
        html.push("</li><li>");
      } else {
        closeLists();
        html.push("<ol><li>");
        orderedList = true;
      }
      html.push(inline(numbered[1]));
      continue;
    }
    if (orderedList) closeLists();

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
