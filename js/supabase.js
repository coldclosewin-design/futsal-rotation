function roleFromEmail(email, config) {
  if (typeof email !== "string" || !email || !config) return "anon";
  const normalized = email.toLowerCase();
  if (typeof config.ADMIN_EMAIL === "string" && normalized === config.ADMIN_EMAIL.toLowerCase()) {
    return "admin";
  }
  if (typeof config.TEAM_EMAIL === "string" && normalized === config.TEAM_EMAIL.toLowerCase()) {
    return "team";
  }
  return "anon";
}

function classifyAuthError(error) {
  const message = typeof error === "string" ? error : error?.message || "알 수 없는 오류";
  if (error?.code === "invalid_credentials" || message === "Invalid login credentials") {
    return { code: "invalid_credentials", message: "PIN 또는 비밀번호가 올바르지 않습니다" };
  }
  if (error?.code === "email_not_confirmed") {
    return { code: "email_not_confirmed", message: "계정 이메일 확인이 필요합니다 (Supabase 설정 확인)" };
  }
  if (error instanceof TypeError || error?.name === "TypeError" || /Failed to fetch/i.test(message)) {
    return { code: "network_error", message: "네트워크 연결을 확인하세요" };
  }
  return { code: error?.code || "unknown_error", message: "로그인 실패: " + message };
}

function isConfigured(config) {
  return [config?.SUPABASE_URL, config?.SUPABASE_ANON_KEY].every(
    (value) => typeof value === "string" && value.trim().length > 0
  );
}

if (typeof window !== "undefined") {
  window.ExicanAuth = (() => {
    let client = null;
    let activeModal = null;
    let teamRequired = false;
    let switchingAccount = false;
    const config = () => window.EXICAN_CONFIG;
    const notifyError = (error) => showToast(error.message);

    async function authRequest(operation) {
      try {
        const result = await operation();
        if (result.error) throw result.error;
        return result.data;
      } catch (error) {
        const classified = classifyAuthError(error);
        const failure = new Error(classified.message);
        failure.code = classified.code;
        throw failure;
      }
    }

    async function init() {
      if (!isConfigured(config())) return null;
      if (!client) {
        if (!window.supabase?.createClient) {
          throw new Error("인증 모듈을 불러오지 못했습니다. 네트워크 연결을 확인하고 새로고침하세요");
        }
        try {
          client = window.supabase.createClient(config().SUPABASE_URL, config().SUPABASE_ANON_KEY);
        } catch (error) {
          throw new Error("Supabase 설정을 확인하세요. 인증 클라이언트를 만들지 못했습니다");
        }
        client.auth.onAuthStateChange(() => {
          // Supabase 인증 잠금 밖에서 세션을 읽어 교착을 피한다.
          setTimeout(() => renderAuthBar().then(syncModal).catch(notifyError), 0);
        });
      }
      return client;
    }

    async function getRole() {
      const connection = await init();
      if (!connection) return "anon";
      const data = await authRequest(() => connection.auth.getSession());
      return roleFromEmail(data.session?.user?.email, config());
    }

    async function signIn(account, password) {
      const connection = await init();
      if (!connection) throw new Error("Supabase 설정 전입니다. 데이터 기능은 아직 동작하지 않습니다.");
      switchingAccount = true;
      try {
        // signInWithPassword가 세션을 교체하므로 사전 signOut은 하지 않는다.
        // (회장 비밀번호를 틀려도 팀 세션이 유지된다)
        const data = await authRequest(() => connection.auth.signInWithPassword({
          email: account === "admin" ? config().ADMIN_EMAIL : config().TEAM_EMAIL,
          password
        }));
        return roleFromEmail(data.session?.user?.email, config());
      } finally {
        switchingAccount = false;
        syncModal(await renderAuthBar());
      }
    }

    async function loginTeam(pin) {
      return signIn("team", pin);
    }

    async function loginAdmin(password) {
      return signIn("admin", password);
    }

    async function logout() {
      const connection = await init();
      if (connection) await authRequest(() => connection.auth.signOut());
      syncModal(await renderAuthBar());
    }

    function syncModal(role) {
      if (activeModal && !activeModal.busy &&
          (role === "admin" || (role === "team" && activeModal.account === "team"))) {
        activeModal.finish(role);
      }
      if (teamRequired && role === "anon" && !activeModal && !switchingAccount) {
        showLoginModal("team").catch(notifyError);
      }
    }

    function showLoginModal(account) {
      if (activeModal) return activeModal.promise;
      const previousFocus = document.activeElement;
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      const form = document.createElement("form");
      form.className = "modal";
      form.setAttribute("role", "dialog");
      form.setAttribute("aria-modal", "true");
      form.setAttribute("aria-labelledby", "auth-modal-title");
      const title = account === "admin" ? "회장 로그인" : "팀 PIN 입력";
      const label = account === "admin" ? "회장 비밀번호" : "팀 PIN";
      form.innerHTML = `
        <h2 id="auth-modal-title">${escapeHtml(title)}</h2>
        <label for="auth-password">${escapeHtml(label)}</label>
        <input id="auth-password" name="password" type="password" autocomplete="current-password" required>
        <p class="auth-error" id="auth-error" role="alert" aria-live="polite"></p>
        <button class="primary" type="submit">확인</button>
        ${account === "admin" ? '<button class="secondary" type="button" data-cancel>취소</button>' : ""}
      `;
      const input = form.querySelector("input");
      const errorMessage = form.querySelector(".auth-error");
      const submit = form.querySelector("button");
      if (account === "team") input.setAttribute("inputmode", "numeric");
      input.setAttribute("aria-describedby", "auth-error");
      const background = Array.from(document.body.children).filter(
        (element) => !["SCRIPT", "STYLE"].includes(element.tagName)
      );
      const inertStates = background.map((element) => element.inert);
      background.forEach((element) => { element.inert = true; });
      document.body.classList.add("auth-modal-open");
      backdrop.appendChild(form);
      document.body.appendChild(backdrop);
      let resolveLogin;
      const promise = new Promise((resolve) => { resolveLogin = resolve; });
      const modal = {
        account,
        promise,
        busy: false,
        finish(role) {
          input.value = "";
          backdrop.remove();
          background.forEach((element, index) => { element.inert = inertStates[index]; });
          document.body.classList.remove("auth-modal-open");
          document.removeEventListener("focusin", keepFocus);
          activeModal = null;
          if (previousFocus?.isConnected) previousFocus.focus();
          resolveLogin(role);
        }
      };
      function keepFocus(event) {
        if (!form.contains(event.target)) input.focus();
      }
      document.addEventListener("focusin", keepFocus);
      const cancel = form.querySelector("[data-cancel]");
      if (cancel) {
        cancel.addEventListener("click", async () => {
          if (modal.busy) return;
          modal.finish(await getRole());
        });
      }
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) input.focus();
      });
      form.addEventListener("keydown", (event) => {
        if (event.key === "Escape") event.preventDefault();
        if (event.key === "Tab") {
          event.preventDefault();
          const cycle = [input, submit, cancel].filter((element) => element && !element.disabled);
          const index = cycle.indexOf(document.activeElement);
          cycle[(index + (event.shiftKey ? cycle.length - 1 : 1)) % cycle.length].focus();
        }
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (modal.busy) return;
        modal.busy = true;
        submit.disabled = true;
        input.readOnly = true;
        errorMessage.textContent = "";
        input.removeAttribute("aria-invalid");
        submit.textContent = "확인 중…";
        try {
          const role = await (account === "admin" ? loginAdmin(input.value) : loginTeam(input.value));
          if (role === "anon") throw new Error("팀 계정으로 로그인해 주세요");
          modal.finish(role);
        } catch (error) {
          errorMessage.textContent = error.message;
          input.setAttribute("aria-invalid", "true");
          input.value = "";
        } finally {
          modal.busy = false;
          submit.disabled = false;
          input.readOnly = false;
          submit.textContent = "확인";
          if (activeModal === modal) input.focus();
        }
      });
      activeModal = modal;
      input.focus();
      return promise;
    }

    async function renderAuthBar() {
      const configured = isConfigured(config());
      const role = await getRole();
      const bar = document.querySelector(".authbar") || document.createElement("div");
      bar.className = "authbar";
      bar.setAttribute("aria-label", "인증 상태");
      bar.textContent = "";
      const status = document.createElement("span");
      status.setAttribute("role", "status");
      status.textContent = !configured ? "설정 전" :
        role === "admin" ? "회장 모드 ·" : role === "team" ? "팀 로그인됨 ·" : "로그인 필요";
      bar.appendChild(status);
      function addButton(label, action) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.textContent = label;
        button.addEventListener("click", () => action().catch(notifyError));
        bar.appendChild(button);
      }
      if (configured && role === "team") addButton("회장 로그인", () => showLoginModal("admin"));
      if (configured && role !== "anon") addButton("로그아웃", logout);
      const nav = document.querySelector("nav.topnav");
      if (nav) nav.after(bar);
      else document.body.prepend(bar);
      return role;
    }

    async function requireTeam() {
      if (!await init()) {
        await renderAuthBar();
        const banner = document.querySelector(".auth-banner") || document.createElement("div");
        banner.className = "auth-banner";
        banner.setAttribute("role", "status");
        banner.textContent = "Supabase 설정 전입니다. 데이터 기능은 아직 동작하지 않습니다.";
        document.querySelector(".authbar").after(banner);
        return null;
      }
      teamRequired = true;
      const role = await renderAuthBar();
      return role === "anon" ? showLoginModal("team") : role;
    }

    async function onAuthChange(callback) {
      const connection = await init();
      if (!connection) return null;
      return connection.auth.onAuthStateChange((event, session) => {
        // 구독자도 Supabase API를 호출할 수 있도록 인증 잠금 밖에서 알린다.
        setTimeout(() => Promise.resolve().then(() => callback(event, session)).catch(notifyError), 0);
      });
    }

    return {
      init,
      isConfigured: async () => isConfigured(config()),
      getRole,
      loginTeam,
      loginAdmin,
      logout,
      requireTeam,
      renderAuthBar,
      onAuthChange
    };
  })();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { roleFromEmail, classifyAuthError, isConfigured };
}
