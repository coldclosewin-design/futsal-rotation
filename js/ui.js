let toastTimer;

// 아이콘: 24px 그리드, 1.75px 스트로크 한 벌. 이모지 대신 쓴다.
const ICONS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20h-5.5v-5h-5v5H4z"/>',
  vote: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4"/>',
  matches: '<circle cx="12" cy="12" r="8"/><path d="M12 4c2.5 2.3 2.5 13.7 0 16M4 12h16M6 7.5c3 1.5 9 1.5 12 0M6 16.5c3-1.5 9-1.5 12 0"/>',
  rotation: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 5v14M3 12h18"/><circle cx="12" cy="12" r="2.2"/>',
  ledger: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
  member: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
  rules: '<path d="M5 4h9l5 5v11H5z"/><path d="M14 4v5h5M8 13h8M8 17h6"/>',
  admin: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  more: '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  thumb: '<path d="M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7"/>',
  shuffle: '<path d="M4 7h3l4 5-4 5H4M20 7h-3l-4 5 4 5h3M17 4l3 3-3 3M17 14l3 3-3 3"/>',
  warn: '<path d="M12 4l9 16H3zM12 10v4M12 17v.5"/>'
};

function icon(name, size = 22) {
  const body = ICONS[name] || ICONS.more;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

const NAV_ITEMS = [
  { key: "home", label: "홈", href: "index.html" },
  { key: "vote", label: "투표", href: "vote.html" },
  { key: "matches", label: "매칭", href: "matches.html" },
  { key: "rotation", label: "배정표", href: "rotation.html" },
  { key: "ledger", label: "장부", href: "ledger.html" },
  { key: "member", label: "내 현황", href: "member.html" },
  { key: "rules", label: "회칙", href: "rules.html" },
  { key: "admin", label: "관리", href: "admin.html" }
];
const TABBAR_KEYS = ["home", "vote", "matches", "rotation", "ledger"];

function navLink(item, activeKey, size) {
  const link = document.createElement("a");
  link.href = item.href;
  link.innerHTML = `${icon(item.key, size)}<span>${item.label}</span>`;
  if (item.key === activeKey) link.setAttribute("aria-current", "page");
  return link;
}

// 셸: 모바일은 하단 탭바(+더보기 시트), 데스크톱(≥900px)은 왼쪽 레일. CSS가 노출을 결정한다.
function renderNav(activeKey) {
  document.querySelectorAll("nav.topnav, nav.tabbar, nav.rail, .more-sheet").forEach((node) => node.remove());

  const rail = document.createElement("nav");
  rail.className = "rail";
  rail.setAttribute("aria-label", "주 메뉴");
  const mark = document.createElement("div");
  mark.className = "rail-mark";
  mark.textContent = "FC";
  mark.setAttribute("aria-hidden", "true");
  rail.appendChild(mark);
  for (const item of NAV_ITEMS) rail.appendChild(navLink(item, activeKey, 22));

  const tabbar = document.createElement("nav");
  tabbar.className = "tabbar";
  tabbar.setAttribute("aria-label", "주 메뉴");
  for (const item of NAV_ITEMS.filter((entry) => TABBAR_KEYS.includes(entry.key))) tabbar.appendChild(navLink(item, activeKey, 22));
  const moreItems = NAV_ITEMS.filter((entry) => !TABBAR_KEYS.includes(entry.key));
  const more = document.createElement("a");
  more.href = "#more";
  more.innerHTML = `${icon("more")}<span>더보기</span>`;
  if (moreItems.some((entry) => entry.key === activeKey)) more.setAttribute("aria-current", "page");
  tabbar.appendChild(more);

  const sheet = document.createElement("div");
  sheet.className = "more-sheet";
  sheet.innerHTML = '<div class="backdrop"></div><div class="sheet" role="dialog" aria-label="더보기 메뉴"></div>';
  const list = sheet.querySelector(".sheet");
  for (const item of moreItems) list.appendChild(navLink(item, activeKey, 22));
  const open = (show) => { if (show) sheet.setAttribute("open", ""); else sheet.removeAttribute("open"); };
  more.addEventListener("click", (event) => { event.preventDefault(); open(!sheet.hasAttribute("open")); });
  sheet.querySelector(".backdrop").addEventListener("click", () => open(false));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") open(false); });

  document.body.prepend(rail);
  document.body.append(tabbar, sheet);
}

function showToast(msg) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function escapeHtml(str) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return String(str).replace(/[&<>"']/g, (character) => entities[character]);
}

function formatWon(n) {
  return `${n.toLocaleString("ko-KR")}원`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { renderNav, showToast, escapeHtml, formatWon, icon, NAV_ITEMS };
}
