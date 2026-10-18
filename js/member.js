window.ExicanMember = (() => {
  const key = "exican_member_id";
  let pending = null;
  let memoryId = null;
  let previousName = null;

  function getId() {
    try { return localStorage.getItem(key) || memoryId; }
    catch (error) { return memoryId; }
  }

  function set(id) {
    memoryId = id;
    try { localStorage.setItem(key, id); }
    catch (error) { showToast("이 브라우저에서는 이름이 새로고침 후 유지되지 않을 수 있습니다"); }
  }

  function clear() {
    memoryId = null;
    try { localStorage.removeItem(key); }
    catch (error) { /* 저장소를 사용할 수 없는 환경에서는 메모리만 비운다. */ }
  }

  async function ensure(members) {
    const saved = members.find((member) => member.id === getId());
    if (saved) return saved;
    if (pending) return pending;
    if (!members.length) throw new Error("선택할 활동 멤버가 없습니다");
    const previousFocus = document.activeElement;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = '<div class="modal member-picker" role="dialog" aria-modal="true" aria-labelledby="member-title"><h2 id="member-title">내 이름을 선택하세요</h2><div class="member-picker-grid"></div></div>';
    const grid = backdrop.querySelector(".member-picker-grid");
    if (previousName) {
      const notice = document.createElement("p");
      notice.textContent = `이전 이름(${previousName})으로 한 투표는 그대로 남습니다. 잘못 골랐다면 회장에게 알려주세요.`;
      grid.before(notice);
    }
    const background = Array.from(document.body.children).filter((element) => !["SCRIPT", "STYLE"].includes(element.tagName));
    const inertStates = background.map((element) => element.inert);
    background.forEach((element) => { element.inert = true; });
    document.body.classList.add("auth-modal-open");
    let finish;
    pending = new Promise((resolve) => { finish = resolve; });
    const promise = pending;
    for (const member of members) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = member.name;
      button.addEventListener("click", () => {
        set(member.id);
        backdrop.remove();
        background.forEach((element, index) => { element.inert = inertStates[index]; });
        document.body.classList.remove("auth-modal-open");
        document.removeEventListener("focusin", keepFocus);
        pending = null;
        if (previousFocus?.isConnected) previousFocus.focus();
        finish(member);
      });
      grid.appendChild(button);
    }
    function keepFocus(event) {
      if (!backdrop.contains(event.target)) grid.firstElementChild.focus();
    }
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.preventDefault();
      if (event.key !== "Tab") return;
      event.preventDefault();
      const buttons = Array.from(grid.children);
      const index = buttons.indexOf(document.activeElement);
      buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
    });
    document.body.appendChild(backdrop);
    document.addEventListener("focusin", keepFocus);
    grid.firstElementChild.focus();
    return promise;
  }

  function renderBadge(container, member, onChange) {
    container.classList.add("member-badge");
    container.textContent = `내 이름: ${member.name} `;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary";
    button.textContent = "변경";
    button.addEventListener("click", async () => {
      button.disabled = true;
      previousName = getId() === member.id ? member.name : null;
      try { await onChange(); }
      catch (error) { showToast(error.message); }
      finally { previousName = null; button.disabled = false; }
    });
    container.appendChild(button);
  }

  return { getId, set, clear, ensure, renderBadge };
})();
