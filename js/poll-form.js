(function () {
  const rules = typeof module !== "undefined" && module.exports ? require("./rules.js") : window.ExicanRules;
  let dismiss = null;

  function defaults(matchDate) {
    const previous = new Date(Date.parse(`${matchDate}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    return { closes_at: `${previous}T13:00`, fines: !rules.isSpecialPoll({ match_date: matchDate }) };
  }

  function values(input, nowIso = new Date().toISOString()) {
    const date = input.match_date;
    const game = Date.parse(`${date}T00:00:00+09:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(game) || rules.kstDate(game) !== date || date < rules.kstDate(nowIso)) {
      throw new Error("경기 날짜는 오늘 이후로 선택하세요");
    }
    const title = String(input.title || "").trim();
    if (title.length > 30) throw new Error("제목은 30자까지 입력하세요");
    const closes = Date.parse(`${input.closes_at}:00+09:00`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.closes_at) || !Number.isFinite(closes) ||
        new Date(closes + 9 * 3600000).toISOString().slice(0, 16) !== input.closes_at) throw new Error("마감 시각을 확인하세요");
    if (closes >= game) throw new Error("마감은 경기 전이어야 합니다");
    return { title: title || null, opens_at: nowIso, closes_at: `${input.closes_at}:00+09:00`, fines: input.fines === true };
  }

  function formatTime(iso) {
    return new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 16).replace("T", " ").replace(/-/g, "/");
  }

  function close() { if (dismiss) dismiss(); }

  function open() {
    if (dismiss) return Promise.resolve(null);
    const previousFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<form class="modal poll-form" role="dialog" aria-modal="true" aria-labelledby="poll-form-title">
      <h2 id="poll-form-title">투표 만들기</h2>
      <label for="poll-date">경기 날짜</label><input id="poll-date" name="match_date" type="date" required>
      <label for="poll-name">제목 (선택, 30자)</label><input id="poll-name" name="title" maxlength="30" placeholder="예: 개천절 특별 매치">
      <label for="poll-closes">마감 시각 (한국 시간)</label><input id="poll-closes" name="closes_at" type="datetime-local" required>
      <label><input name="fines" type="checkbox"> 미투표 벌금 적용</label>
      <p class="auth-error" role="alert"></p>
      <div class="home-actions"><button type="submit" class="primary">만들기</button><button type="button" class="secondary" data-close>닫기</button></div>
    </form>`;
    const form = backdrop.querySelector("form");
    const fields = form.elements;
    const today = rules.kstDate(new Date());
    fields.match_date.min = today;
    fields.match_date.value = rules.nextSaturday(today);
    function resetDefaults() {
      if (!fields.match_date.value) return;
      const initial = defaults(fields.match_date.value);
      fields.closes_at.value = initial.closes_at;
      fields.fines.checked = initial.fines;
    }
    fields.match_date.addEventListener("change", resetDefaults);
    resetDefaults();
    const background = Array.from(document.body.children).filter((element) => !["SCRIPT", "STYLE"].includes(element.tagName));
    const inertStates = background.map((element) => element.inert);
    const wasModalOpen = document.body.classList.contains("auth-modal-open");
    background.forEach((element) => { element.inert = true; });
    document.body.classList.add("auth-modal-open");
    let busy = false, closed = false;
    return new Promise((resolve) => {
      dismiss = (poll = null) => {
        if (closed) return;
        closed = true;
        backdrop.remove();
        background.forEach((element, index) => { element.inert = inertStates[index]; });
        if (!wasModalOpen) document.body.classList.remove("auth-modal-open");
        document.removeEventListener("focusin", keepFocus);
        dismiss = null;
        if (previousFocus?.isConnected) previousFocus.focus();
        resolve(poll);
      };
      function keepFocus(event) {
        if (!backdrop.contains(event.target)) form.querySelector("input:not(:disabled), button:not(:disabled)")?.focus();
      }
      form.querySelector("[data-close]").onclick = () => { if (!busy) dismiss(); };
      backdrop.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); if (!busy) dismiss(); }
        if (event.key !== "Tab") return;
        event.preventDefault();
        const controls = Array.from(form.querySelectorAll("input:not(:disabled), button:not(:disabled)"));
        const index = controls.indexOf(document.activeElement);
        controls[(index + (event.shiftKey ? controls.length - 1 : 1)) % controls.length]?.focus();
      });
      form.onsubmit = async (event) => {
        event.preventDefault();
        if (busy) return;
        const errorText = form.querySelector("[role=alert]");
        errorText.textContent = "";
        const controls = Array.from(form.querySelectorAll("input, button"));
        try {
          const options = values({ match_date: fields.match_date.value, title: fields.title.value,
            closes_at: fields.closes_at.value, fines: fields.fines.checked });
          busy = true;
          controls.forEach((control) => { control.disabled = true; });
          const poll = await window.ExicanData.createPoll(fields.match_date.value, options);
          if (!closed) { dismiss(poll); showToast("투표를 생성했습니다"); }
        } catch (error) {
          if (!closed) errorText.textContent = error.message;
        } finally {
          busy = false;
          controls.forEach((control) => { control.disabled = false; });
        }
      };
      document.body.appendChild(backdrop);
      document.addEventListener("focusin", keepFocus);
      fields.match_date.focus();
    });
  }

  const api = { defaults, values, formatTime, open, close };
  if (typeof window !== "undefined") window.ExicanPollForm = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
