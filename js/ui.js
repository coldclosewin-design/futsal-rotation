let toastTimer;

function renderNav(activeKey) {
  const items = [
    { key: "home", label: "홈", href: "index.html" },
    { key: "vote", label: "투표", href: "vote.html" },
    { key: "matches", label: "매칭", href: "matches.html" },
    { key: "rotation", label: "배정표", href: "rotation.html" },
    { key: "ledger", label: "장부", href: "ledger.html" },
    { key: "rules", label: "회칙", href: "rules.html" },
    { key: "admin", label: "관리", href: "admin.html" }
  ];
  const nav = document.querySelector("nav.topnav") || document.createElement("nav");
  nav.className = "topnav";
  nav.setAttribute("aria-label", "주 메뉴");
  nav.textContent = "";

  for (const item of items) {
    const link = document.createElement("a");
    link.href = item.href;
    link.textContent = item.label;
    if (item.key === activeKey) {
      link.setAttribute("aria-current", "page");
    }
    nav.appendChild(link);
  }

  document.body.insertBefore(nav, document.body.firstChild);
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
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1500);
}

function escapeHtml(str) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return String(str).replace(/[&<>"']/g, (character) => entities[character]);
}

function formatWon(n) {
  return `${n.toLocaleString("ko-KR")}원`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { renderNav, showToast, escapeHtml, formatWon };
}
