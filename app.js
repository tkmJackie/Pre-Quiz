const API_BASE = "https://cct-english-api.tkm12325.workers.dev";
const STORAGE_KEY = "cct.quiz.enterprise.session.v2";
const TRUSTED_DEVICE_KEY = "pre.quiz.trusted_device.v1";

let session = loadSession();
let cache = {
  organizations: [],
  users: [],
  questionSets: [],
  activeQuestion: null,
  activeQuestionSetId: "",
  activeQuestionSetTitle: "",
  activeCategory: "",
  currentScreen: "main",
  categoriesBySet: {},
  pendingTwoFactor: null,
  twoFactorSetup: null,
  questionCreatorSetId: "",
  questionCreatorSetTitle: "",
  questionCreatorQuestions: [],
  questionCreatorImageTarget: "",
  questionEditSetId: "",
  questionEditSetTitle: "",
  questionEditQuestionId: ""
};


const DECLARATIVE_ACTIONS = new Set(["addQuestionCreatorOption", "applyQuestionMarkdownToForm", "assignSetToOrg", "assignSetToUser", "backToQuestionSetList", "changePassword", "changeStudentCategory", "chooseQuestionCreatorImage", "clearImportedExcel", "clearQuestionBulkMarkdown", "clearQuestionCreatorForm", "closeTicket", "confirmTwoFactor", "createCompanyStudent", "createContactTicket", "createOrganization", "createQuestionSet", "createQuestionTicket", "createTicket", "createUser", "deleteOrganization", "deleteQuestion", "deleteQuestionSet", "deleteUser", "disableTwoFactor", "editOrganization", "editQuestionSet", "exportExcel", "goMainView", "importBulkQuestionMarkdown", "importExcel", "loadAnswers", "loadBulkQuestionMarkdownFile", "loadContactTickets", "loadProgress", "loadQuiz", "loadTickets", "logout", "refreshAnswersUserOptions", "refreshProgressUserOptions", "reloadAll", "removeQuestionCreatorOption", "replyTicket", "returnQuestionCreatorToAdmin", "returnQuestionEditorToAdmin", "saveProfile", "saveQuestionEditor", "saveQuestionFromCreator", "searchCompanyUsers", "searchUsers", "selectAdminQuestionSet", "selectQuestionSetFromList", "showContactView", "showPasswordView", "showProfileView", "showQuestionCreatorView", "showQuestionEditorView", "showTwoFactorView", "startQuestionSet", "startTwoFactorSetup", "submitAnswer", "switchRole", "toggleTicket"]);

function parseDeclarativeActionArgs(rawArgs) {
  const raw = String(rawArgs || "").trim();
  if (!raw) return [];

  const args = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const char of raw) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      current += char;
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === ",") {
      args.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) args.push(current.trim());

  return args.map((value) => {
    const trimmed = String(value || "").trim();

    if (
      (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
      return trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }

    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

    return trimmed;
  });
}

async function runDeclarativeAction(expression) {
  const expr = String(expression || "").trim();
  const match = expr.match(/^([A-Za-z_$][\w$]*)\s*(?:\((.*)\))?$/);
  if (!match) return;

  const name = match[1];
  if (!DECLARATIVE_ACTIONS.has(name)) {
    console.warn("Blocked undeclared action:", name);
    return;
  }

  const fn = window[name];
  if (typeof fn !== "function") {
    console.warn("Action function not found:", name);
    return;
  }

  const args = parseDeclarativeActionArgs(match[2] || "");
  await fn(...args);
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  event.preventDefault();
  runDeclarativeAction(target.getAttribute("data-action"));
});

document.addEventListener("change", (event) => {
  const target = event.target.closest("[data-change]");
  if (!target) return;

  runDeclarativeAction(target.getAttribute("data-change"));
});

function $(id) {
  return document.getElementById(id);
}

function parseJwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1];
    if (!payload) return null;

    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getJwtExpiresAt(token) {
  const payload = parseJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  return exp > 0 ? exp * 1000 : 0;
}

function isStoredSessionUsable(value) {
  if (!value || typeof value !== "object") return false;
  if (!value.token || !value.username || !Array.isArray(value.roles)) return false;

  const expiresAt = Number(value.expiresAt || getJwtExpiresAt(value.token) || 0);
  if (!expiresAt) return false;

  // 期限切れ直前のトークンは復元しない
  if (expiresAt <= Date.now() + 10 * 1000) return false;

  return true;
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const saved = JSON.parse(raw);
    if (!isStoredSessionUsable(saved)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return saved;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveSession() {
  try {
    if (!session?.token) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...session,
      savedAt: Date.now(),
      expiresAt: getJwtExpiresAt(session.token)
    }));
  } catch {
    // sessionStorageが使えない環境では、メモリ上のセッションだけで動作します。
  }
}


function getTrustedDeviceToken() {
  // 2FA省略トークンはHttpOnly CookieでWorker側が管理します。
  // JavaScriptからは読み取りません。
  return "";
}

function saveTrustedDeviceToken() {
  // 2FA省略トークンはHttpOnly CookieでWorker側が設定します。
}

function showMessage(text, type = "info") {
  const el = $("message");
  if (!el) return;
  el.textContent = text;
  el.className = `message ${type === "error" ? "error" : type === "success" ? "success" : ""}`;
  el.classList.remove("hidden");
}

function hideMessage() {
  $("message")?.classList.add("hidden");
}

async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const init = { ...options };
  const headers = { ...(options.headers || {}) };

  if (session?.token) {
    headers["Authorization"] = `Bearer ${session.token}`;
    headers["X-CCT-Role"] = session.role || session.roles?.[0] || "student";
  }

  if (init.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "text/plain;charset=UTF-8";
  }

  const response = await fetch(url, { ...init, headers, credentials: "include" });
  const text = await response.text();

  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    if (response.status === 401 && session?.token) {
      session = null;
      saveSession();
      cache.currentScreen = "main";
      await renderApp();
      throw new Error("ログイン状態の有効期限が切れました。もう一度ログインしてください。");
    }

    if (data.mustSetupTwoFactor && session) {
      session.mustSetupTwoFactor = true;
      session.twoFactorEnabled = false;
      saveSession();
      cache.currentScreen = "twoFactor";
      await renderApp();
    }
    throw new Error(data.error || `API error ${response.status}`);
  }

  return data;
}

function roleLabel(role) {
  return {
    admin: "管理者",
    company_manager: "企業担当者",
    student: "受講者"
  }[role] || role;
}

function setView(view) {
  $("authView").classList.toggle("hidden", view !== "auth");
  $("roleView").classList.toggle("hidden", view !== "role");
  $("appView").classList.toggle("hidden", view !== "app");
}

function renderSession() {
  const box = $("sessionBox");
  if (!session) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `
    <strong>${escapeHtml(session.displayName || session.username)}</strong><br>
    <span>${escapeHtml(session.username)}</span><br>
    <span>${session.organizationName ? escapeHtml(session.organizationName) : "組織なし"}</span><br>
    <span class="pill">${roleLabel(session.role)}</span>
    <div class="header-actions">
      <button class="mini ghost" data-action="showProfileView()">プロフィール設定</button>
      <button class="mini ghost" data-action="showContactView()">お問い合わせ</button>
    </div>
  `;
}

function renderRoleChooser() {
  setView("role");
  const box = $("roleButtons");
  box.innerHTML = "";
  for (const role of session.roles || []) {
    const btn = document.createElement("button");
    btn.textContent = roleLabel(role);
    btn.onclick = () => {
      session.role = role;
      saveSession();
      renderApp();
    };
    box.appendChild(btn);
  }
}

async function renderApp() {
  if (!session) {
    setView("auth");
    renderSession();
    return;
  }

  if (!session.role) {
    if ((session.roles || []).length > 1 && !session.mustSetupTwoFactor && session.twoFactorEnabled !== false) return renderRoleChooser();
    session.role = session.roles?.[0] || "student";
    saveSession();
  }

  if (session.mustSetupTwoFactor || session.twoFactorEnabled === false) {
    cache.currentScreen = "twoFactor";
  }

  setView("app");
  renderSession();
  hideMessage();

  $("roleNav").innerHTML = `
    <button class="ghost" data-action="reloadAll()">再読み込み</button>
    ${(session.roles || []).map((r) => `<button class="${session.role === r ? "" : "ghost"}" data-action="switchRole('${r}')">${roleLabel(r)}</button>`).join("")}
    <button class="danger" data-action="logout()">ログアウト</button>
  `;

  const isContact = cache.currentScreen === "contact";
  const isTwoFactor = cache.currentScreen === "twoFactor";
  const isProfile = cache.currentScreen === "profile";
  const isPassword = cache.currentScreen === "password";
  const isQuestionCreator = cache.currentScreen === "questionCreator";
  const isQuestionEditor = cache.currentScreen === "questionEditor";
  const isSettings = isTwoFactor || isProfile || isPassword;

  $("adminView").classList.toggle("hidden", isContact || isSettings || session.role !== "admin");
  $("companyView").classList.toggle("hidden", isContact || isSettings || session.role !== "company_manager");
  $("studentView").classList.toggle("hidden", isContact || isSettings || session.role !== "student");
  $("contactView").classList.toggle("hidden", !isContact);
  $("twoFactorView").classList.toggle("hidden", !isSettings);

  if (isContact) {
    await renderContactView();
    return;
  }

  if (isProfile) {
    await renderProfileView();
    return;
  }

  if (isPassword) {
    await renderPasswordView();
    return;
  }

  if (isTwoFactor) {
    await renderTwoFactorView();
    return;
  }

  if (isQuestionCreator) {
    await renderQuestionCreatorScreen();
    return;
  }

  if (isQuestionEditor) {
    await renderQuestionEditorScreen();
    return;
  }

  if (session.role === "admin") await renderAdmin();
  if (session.role === "company_manager") await renderCompany();
  if (session.role === "student") await renderStudent();
}

function switchRole(role) {
  session.role = role;
  saveSession();
  renderApp();
}

function logout() {
  session = null;
  saveSession();
  renderApp();
}

function goMainView() {
  if (session?.mustSetupTwoFactor || session?.twoFactorEnabled === false) {
    cache.currentScreen = "twoFactor";
    showMessage("2要素認証の設定が必須です。設定完了後に利用できます。", "error");
    renderApp();
    return;
  }

  cache.currentScreen = "main";
  renderApp();
}

function showContactView() {
  if (!session) return;
  cache.currentScreen = "contact";
  renderApp();
}

async function renderContactView() {
  const root = $("contactView");
  root.innerHTML = `
    <section class="card contact-card">
      <div class="section-title-row">
        <div>
          <h2>お問い合わせ</h2>
          <p class="muted">問題の誤り、解説の不明点、操作に関する質問を送信できます。</p>
        </div>
        <button class="ghost" data-action="goMainView()">戻る</button>
      </div>

      <label>件名</label>
      <input id="ticketTitle" placeholder="問題に誤りがあります">

      <label>お問い合わせ内容</label>
      <textarea id="ticketBody" rows="6" placeholder="問題集名、問題番号、気づいた点などを入力してください。"></textarea>

      <label>優先度</label>
      <select id="ticketPriority">
        <option value="normal">通常</option>
        <option value="high">高</option>
        <option value="low">低</option>
      </select>

      <div class="button-list">
        <button data-action="createContactTicket()">送信する</button>
        <button class="ghost" data-action="loadContactTickets()">過去のお問い合わせを表示</button>
      </div>

      <div id="contactTicketList"></div>
    </section>
  `;
  await loadContactTickets();
}

async function createContactTicket() {
  try {
    await api("/api/tickets", {
      method: "POST",
      body: JSON.stringify({
        title: $("ticketTitle").value,
        message: $("ticketBody").value,
        priority: $("ticketPriority").value
      })
    });
    $("ticketTitle").value = "";
    $("ticketBody").value = "";
    showMessage("お問い合わせを送信しました。", "success");
    await loadContactTickets();
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function loadContactTickets() {
  const data = await api("/api/tickets?status=all");
  const list = $("contactTicketList");
  if (!list) return;

  const tickets = data.tickets || [];
  if (!tickets.length) {
    list.innerHTML = `<p class="muted">お問い合わせ履歴はありません。</p>`;
    return;
  }

  list.innerHTML = tickets.map(t => `
    <div class="ticket-row">
      <div>
        <span class="pill ${t.status}">${ticketStatusLabel(t.status)}</span>
        <strong>${escapeHtml(t.title)}</strong>
        <p class="muted">${escapeHtml(t.created_at)}${t.question_set_title ? " / " + escapeHtml(t.question_set_title) : ""}</p>
      </div>
      <button class="mini ghost" data-action="toggleTicket('${t.id}')">詳細</button>
      <div id="ticketDetail-${t.id}" class="hidden"></div>
    </div>
  `).join("");
}



function settingsSidebar(active) {
  return `
    <aside class="settings-sidebar">
      <h3>プロフィール設定</h3>
      <nav>
        <button type="button" class="${active === "profile" ? "active" : ""}" data-action="showProfileView()">プロフィール</button>
        <button type="button" class="${active === "password" ? "active" : ""}" data-action="showPasswordView()">パスワード変更</button>
        <button type="button" class="${active === "twoFactor" ? "active" : ""}" data-action="showTwoFactorView()">2要素認証</button>
        <span data-action="logout()">ログアウト</span>
      </nav>
    </aside>
  `;
}

async function renderProfileView() {
  const root = $("twoFactorView");
  const data = await api("/api/me/profile");
  const roles = Array.isArray(data.roles) ? data.roles.map(roleLabel).join(" / ") : roleLabel(session.role);

  root.innerHTML = `
    <section class="simple-settings-layout">
      ${settingsSidebar("profile")}

      <section class="simple-two-factor-panel profile-settings-panel">
        <h2>プロフィール</h2>
        <p class="simple-lead">表示名などのプロフィール情報を設定できます。</p>

        <div class="simple-profile-form">
          <label>表示名</label>
          <input id="profileDisplayName" value="${escapeHtml(data.displayName || "")}" placeholder="表示名を入力してください">

          <label>メールアドレス</label>
          <input value="${escapeHtml(data.username || "")}" readonly>

          <label>企業</label>
          <input value="${escapeHtml(data.organizationName || "組織なし")}" readonly>

          <label>現在のロール</label>
          <input value="${escapeHtml(roles)}" readonly>

          <div class="simple-divider"></div>

          <div class="button-list">
            <button data-action="saveProfile()">保存</button>
            <button class="ghost" data-action="goMainView()">戻る</button>
          </div>
        </div>
      </section>
    </section>

    <input id="manualImageFileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden">
  `;
}

async function saveProfile() {
  try {
    const displayName = $("profileDisplayName").value.trim();

    const data = await api("/api/me/profile", {
      method: "POST",
      body: JSON.stringify({ displayName })
    });

    session.displayName = data.displayName;
    saveSession();
    renderSession();
    showMessage("プロフィールを更新しました。", "success");
    await renderProfileView();
  } catch (e) {
    showMessage(e.message, "error");
  }
}

function showPasswordView() {
  if (!session) return;

  if (session.mustSetupTwoFactor || session.twoFactorEnabled === false) {
    cache.currentScreen = "twoFactor";
    showMessage("先に2要素認証を設定してください。", "error");
    renderApp();
    return;
  }

  cache.currentScreen = "password";
  renderApp();
}

async function renderPasswordView() {
  const root = $("twoFactorView");

  root.innerHTML = `
    <section class="simple-settings-layout">
      ${settingsSidebar("password")}

      <section class="simple-two-factor-panel profile-settings-panel">
        <h2>パスワード変更</h2>
        <p class="simple-lead">現在のパスワードを確認して、新しいパスワードに変更できます。</p>

        <div class="simple-profile-form">
          <label>現在のパスワード</label>
          <div class="password-row settings-password-row">
            <input id="currentPassword" type="password" autocomplete="current-password" placeholder="現在のパスワード">
            <button type="button" class="ghost mini" data-toggle-password="currentPassword">表示</button>
          </div>

          <label>新しいパスワード</label>
          <div class="password-row settings-password-row">
            <input id="newPassword" type="password" autocomplete="new-password" placeholder="12文字以上で入力してください">
            <button type="button" class="ghost mini" data-toggle-password="newPassword">表示</button>
          </div>

          <label>新しいパスワード（確認）</label>
          <div class="password-row settings-password-row">
            <input id="newPasswordConfirm" type="password" autocomplete="new-password" placeholder="もう一度入力してください">
            <button type="button" class="ghost mini" data-toggle-password="newPasswordConfirm">表示</button>
          </div>

          <p class="muted">パスワードは12文字以上で設定してください。</p>

          <div class="simple-divider"></div>

          <div class="button-list">
            <button data-action="changePassword()">保存</button>
            <button class="ghost" data-action="goMainView()">戻る</button>
          </div>
        </div>
      </section>
    </section>
  `;
}

async function changePassword() {
  try {
    const currentPassword = $("currentPassword").value;
    const newPassword = $("newPassword").value;
    const newPasswordConfirm = $("newPasswordConfirm").value;

    if (!currentPassword) {
      alert("現在のパスワードを入力してください。");
      return;
    }

    if (!newPassword || newPassword.length < 12) {
      alert("新しいパスワードは12文字以上で入力してください。");
      return;
    }

    if (newPassword !== newPasswordConfirm) {
      alert("新しいパスワードと確認用パスワードが一致しません。");
      return;
    }

    await api("/api/me/password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword,
        newPassword
      })
    });

    $("currentPassword").value = "";
    $("newPassword").value = "";
    $("newPasswordConfirm").value = "";

    showMessage("パスワードを変更しました。", "success");
  } catch (e) {
    showMessage(e.message, "error");
  }
}


function showProfileView() {
  if (!session) return;

  if (session.mustSetupTwoFactor || session.twoFactorEnabled === false) {
    cache.currentScreen = "twoFactor";
    showMessage("先に2要素認証を設定してください。", "error");
    renderApp();
    return;
  }

  cache.currentScreen = "profile";
  renderApp();
}

function showTwoFactorView() {
  if (!session) return;
  cache.currentScreen = "twoFactor";
  renderApp();
}

async function renderTwoFactorView() {
  const root = $("twoFactorView");
  const me = await api("/api/me");
  const enabled = !!me.twoFactorEnabled;

  root.innerHTML = `
    <section class="simple-settings-layout">
${settingsSidebar("twoFactor")}

      <section class="simple-two-factor-panel">
        <h2>2要素認証</h2>
        <p class="simple-lead">セキュリティ強化のために2要素認証の設定をすることができます。</p>

        <div class="simple-two-factor-status">
          <div>
            <h3>2要素認証</h3>
          </div>
          <div class="simple-toggle ${enabled ? "on" : ""}" aria-label="2要素認証状態">
            <span></span>
          </div>
          <strong>${enabled ? "設定済み" : "設定する"}</strong>
        </div>

        <div class="simple-divider"></div>

        <div id="twoFactorSetupBox" class="simple-setup-box">
          ${enabled ? `
            <div class="simple-success-box">
              2要素認証は有効です。
            </div>

            <details class="simple-secret-details">
              <summary>認証アプリを再設定する</summary>
              <p class="muted">再設定には現在のパスワードが必要です。</p>
              <input
                id="twoFactorResetPassword"
                class="simple-code-input"
                type="password"
                autocomplete="current-password"
                placeholder="現在のパスワード"
              >
              <button class="simple-submit-button" data-action="startTwoFactorSetup()">再設定用QRコードを表示する</button>
            </details>

            <button class="ghost" data-action="goMainView()">戻る</button>
          ` : `
            <button data-action="startTwoFactorSetup()">QRコードを表示する</button>
          `}
        </div>
      </section>
    </section>
  `;
}


function renderTwoFactorQrCode(otpauthUrl) {
  const box = $("twoFactorQrCode");
  if (!box) return;

  box.innerHTML = "";

  if (!otpauthUrl) {
    box.innerHTML = `<p class="muted">QRコード用URLを取得できませんでした。セットアップキーを手入力してください。</p>`;
    return;
  }

  if (typeof QRCode === "function") {
    new QRCode(box, {
      text: otpauthUrl,
      width: 180,
      height: 180,
      correctLevel: QRCode.CorrectLevel.M
    });
    return;
  }

  box.innerHTML = `
    <p class="muted">
      QRコード生成ライブラリを読み込めませんでした。セットアップキーを手入力するか、
      <a href="${escapeHtml(otpauthUrl)}">認証アプリで開く</a> を利用してください。
    </p>
  `;
}

async function startTwoFactorSetup() {
  try {
    const resetPasswordInput = $("twoFactorResetPassword");
    const payload = resetPasswordInput ? { currentPassword: resetPasswordInput.value } : {};

    const data = await api("/api/me/2fa/setup", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    cache.twoFactorSetup = data;

    const box = $("twoFactorSetupBox");
    box.innerHTML = `
      <div class="simple-qr-row">
        <div id="twoFactorQrCode" class="simple-qr-box"></div>
        <p>
          Google Authenticatorアプリを起動して二次元バーコードを読み込み、<br>
          画面に表示された数字を入力してください。
        </p>
      </div>

      <input
        id="confirmTwoFactorCode"
        class="simple-code-input"
        inputmode="numeric"
        maxlength="6"
        placeholder="認証アプリに表示された6桁の数字を入力してください"
      >

      <details class="simple-secret-details">
        <summary>QRコードを読み取れない場合</summary>
        <p class="muted">以下のセットアップキーを認証アプリに手入力してください。</p>
        <div class="two-factor-secret">${escapeHtml(data.secret || "")}</div>
      </details>

      <div class="simple-divider"></div>

      <button class="simple-submit-button" data-action="confirmTwoFactor()">送信</button>
    `;

    renderTwoFactorQrCode(data.otpauthUrl || "");
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function confirmTwoFactor() {
  try {
    await api("/api/me/2fa/confirm", {
      method: "POST",
      body: JSON.stringify({
        code: $("confirmTwoFactorCode").value
      })
    });

    cache.twoFactorSetup = null;
    session.twoFactorEnabled = true;
    session.mustSetupTwoFactor = false;
    saveSession();
    cache.currentScreen = "main";
    showMessage("2要素認証を有効化しました。アプリを利用できます。", "success");
    await renderApp();
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function requestDisableTwoFactorCode() {
  try {
    const data = await api("/api/me/2fa/disable-request", {
      method: "POST",
      body: "{}"
    });
    cache.twoFactorSetup = data;

    const box = $("disableTwoFactorBox");
    box.innerHTML = `
      <div class="result-box">
        <p><strong>無効化コードをメールで送信しました。</strong></p>
        <p class="muted">送信先：${escapeHtml(session.username)}</p>
        <p class="muted">有効期限は10分です。</p>
        <label>メールに届いた6桁コード</label>
        <input id="disableTwoFactorCode" inputmode="numeric" maxlength="6" placeholder="123456">
        <button class="danger" data-action="disableTwoFactor()">2要素認証を無効化</button>
      </div>
    `;
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function disableTwoFactor() {
  if (!confirm("2要素認証を無効化しますか？")) return;
  try {
    if (!cache.twoFactorSetup?.codeId) {
      alert("無効化コードの送信情報がありません。もう一度コードを送信してください。");
      return;
    }

    await api("/api/me/2fa/disable", {
      method: "POST",
      body: JSON.stringify({
        codeId: cache.twoFactorSetup.codeId,
        code: $("disableTwoFactorCode").value
      })
    });
    cache.twoFactorSetup = null;
    showMessage("2要素認証を無効化しました。", "success");
    await renderTwoFactorView();
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function reloadAll() {
  cache = {
    organizations: [],
    users: [],
    questionSets: [],
    activeQuestion: null,
    activeQuestionSetId: cache.activeQuestionSetId,
    activeQuestionSetTitle: cache.activeQuestionSetTitle,
    activeCategory: cache.activeCategory,
    currentScreen: cache.currentScreen,
    categoriesBySet: {},
    pendingTwoFactor: null,
    twoFactorSetup: null
  };
  await renderApp();
}

async function login() {
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("loginUsername").value.trim().toLowerCase(),
        password: $("loginPassword").value
      })
    });

    if (data.twoFactorRequired) {
      cache.pendingTwoFactor = data;
      $("twoFactorLoginCard")?.classList.remove("hidden");
      showLoginTwoFactorNotice(data);
      $("twoFactorCode").focus();
      return;
    }

    session = {
      token: data.token,
      username: data.username,
      displayName: data.displayName,
      organizationId: data.organizationId,
      organizationName: data.organizationName,
      roles: data.roles,
      role: data.roles?.[0],
      twoFactorEnabled: !!data.twoFactorEnabled,
      mustSetupTwoFactor: !!data.mustSetupTwoFactor
    };

    if (data.mustSetupTwoFactor) {
      cache.currentScreen = "twoFactor";
    }

    saveSession();
    await renderApp();
  } catch (error) {
    alert(`ログイン失敗：${error.message}`);
  }
}

async function loginTwoFactor() {
  try {
    if (!cache.pendingTwoFactor?.challengeToken) {
      alert("2要素認証のログイン情報がありません。もう一度ログインしてください。");
      return;
    }

    const data = await api("/api/login/2fa", {
      method: "POST",
      body: JSON.stringify({
        challengeToken: cache.pendingTwoFactor.challengeToken,
        code: $("twoFactorCode").value,
        trustDevice: $("trustDeviceForWeek")?.checked === true
      })
    });

    cache.pendingTwoFactor = null;
    $("twoFactorLoginCard")?.classList.add("hidden");

    session = {
      token: data.token,
      username: data.username,
      displayName: data.displayName,
      organizationId: data.organizationId,
      organizationName: data.organizationName,
      roles: data.roles,
      role: data.roles?.[0],
      twoFactorEnabled: !!data.twoFactorEnabled,
      mustSetupTwoFactor: false
    };

    saveSession();
    await renderApp();
  } catch (error) {
    alert(`2要素認証に失敗しました：${error.message}`);
  }
}

function cancelTwoFactorLogin() {
  cache.pendingTwoFactor = null;
  $("twoFactorCode").value = "";
  $("twoFactorLoginCard")?.classList.add("hidden");
}

function showLoginTwoFactorNotice(data) {
  const card = $("twoFactorLoginCard");
  if (!card) return;

  let note = card.querySelector(".two-factor-login-note");
  if (!note) {
    note = document.createElement("p");
    note.className = "muted two-factor-login-note";
    card.insertBefore(note, card.querySelector("label"));
  }
  note.textContent = `${data.username} の認証アプリに表示される6桁コードを入力してください。`;

  let trust = card.querySelector("#trustDeviceForWeekWrap");
  if (!trust) {
    trust = document.createElement("label");
    trust.id = "trustDeviceForWeekWrap";
    trust.className = "trust-device-row";
    trust.innerHTML = `
      <input id="trustDeviceForWeek" class="trust-device-checkbox" type="checkbox" checked>
      <span class="trust-device-text">このデバイスでは1週間、2要素認証を省略する</span>
    `;
    const buttonList = card.querySelector(".button-list");
    if (buttonList) card.insertBefore(trust, buttonList);
    else card.appendChild(trust);
  }
}

async function loadOrganizations() {
  if (cache.organizations.length) return cache.organizations;
  const data = await api("/api/admin/organizations");
  cache.organizations = data.organizations || [];
  return cache.organizations;
}

async function loadUsers(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters || {})) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value).trim());
    }
  }

  const hasFilters = [...params.keys()].length > 0;
  if (!hasFilters && cache.users.length) return cache.users;

  const endpoint = session.role === "company_manager" ? "/api/company/users" : "/api/admin/users";
  const data = await api(endpoint + (hasFilters ? `?${params.toString()}` : ""));
  const users = data.users || [];

  if (!hasFilters) cache.users = users;
  return users;
}

async function loadQuestionSets() {
  if (cache.questionSets.length) return cache.questionSets;
  const endpoint = session.role === "admin" ? "/api/admin/question-sets" : "/api/question-sets";
  const data = await api(endpoint);
  cache.questionSets = data.questionSets || [];
  return cache.questionSets;
}

async function loadQuestionSetCategories(questionSetId) {
  if (!questionSetId) return [];
  if (cache.categoriesBySet[questionSetId]) return cache.categoriesBySet[questionSetId];

  const data = await api(`/api/question-sets/${encodeURIComponent(questionSetId)}/categories`);
  cache.categoriesBySet[questionSetId] = data.categories || [];
  return cache.categoriesBySet[questionSetId];
}

async function renderAdmin() {
  const root = $("adminView");
  root.innerHTML = `
    <div class="two-col">
      ${adminOrganizationCard()}
      ${adminUserCard()}
    </div>
    <div class="two-col">
      ${adminQuestionSetCard()}
      ${assignmentCard()}
    </div>
    <div class="two-col">
      ${progressCard()}
      ${answersCard()}
    </div>
    ${ticketsCard("管理者お問い合わせ窓口")}
  `;

  await fillAdminData();
}

function adminOrganizationCard() {
  return `
    <section class="card">
      <h2>企業管理</h2>
      <label>企業名</label>
      <input id="orgName" placeholder="株式会社サンプル">
      <label>企業コード</label>
      <input id="orgCode" placeholder="sample">
      <button data-action="createOrganization()">企業を作成</button>
      <div id="orgList" class="table-wrap"></div>
    </section>
  `;
}

function adminUserCard() {
  return `
    <section class="card">
      <h2>ユーザー管理</h2>
      <div class="three-col">
        <div>
          <label>メールアドレス</label>
          <input id="newUsername" type="email" placeholder="user@example.com">
        </div>
        <div>
          <label>表示名</label>
          <input id="newDisplayName">
        </div>
        <div>
          <label>パスワード</label>
          <input id="newPassword" type="password">
        </div>
      </div>
      <div class="three-col">
        <div>
          <label>ロール</label>
          <select id="newRole">
            <option value="student">受講者</option>
            <option value="company_manager">企業担当者</option>
            <option value="admin">管理者</option>
          </select>
        </div>
        <div>
          <label>企業</label>
          <select id="newUserOrg"></select>
        </div>
      </div>
      <button data-action="createUser()">ユーザーを作成</button>

      <div class="filter-box">
        <h3>ユーザー検索・絞り込み</h3>
        <div class="three-col">
          <div>
            <label>メールアドレス・表示名</label>
            <input id="userSearchQuery" placeholder="例：student@example.com">
          </div>
          <div>
            <label>企業</label>
            <select id="userSearchOrg"></select>
          </div>
          <div>
            <label>ロール</label>
            <select id="userSearchRole">
              <option value="">全て</option>
              <option value="student">受講者</option>
              <option value="company_manager">企業担当者</option>
              <option value="admin">管理者</option>
            </select>
          </div>
        </div>
        <div class="three-col">
          <div>
            <label>状態</label>
            <select id="userSearchActive">
              <option value="active">有効</option>
              <option value="">全て</option>
              <option value="inactive">削除済み</option>
            </select>
          </div>
        </div>
        <button class="ghost" data-action="searchUsers()">検索</button>
      </div>

      <div id="userList" class="table-wrap"></div>
    </section>
  `;
}

function adminQuestionSetCard() {
  return `
    <section class="card">
      <h2>問題集管理</h2>
      <div class="three-col">
        <div>
          <label>問題集タイトル</label>
          <input id="setTitle" placeholder="CCT基礎問題集">
        </div>
        <div>
          <label>分類</label>
          <input id="setCategory" placeholder="CCT">
        </div>
        <div>
          <label>説明</label>
          <input id="setDescription" placeholder="説明">
        </div>
      </div>
      <button data-action="createQuestionSet()">問題集を作成</button>

      <label>問題集選択</label>
      <select id="adminSetSelect" data-change="selectAdminQuestionSet()"></select>

      <div class="file-row">
        <div>
          <label>Excelインポート</label>
          <input id="excelFile" type="file" accept=".xlsx,.xls">
        </div>
        <button id="importButton" data-action="importExcel()">インポート</button>
        <button class="ghost" data-action="exportExcel()">エクスポート</button>
        <button class="danger" data-action="clearImportedExcel()">インポート済み問題を削除</button>
      </div>

      <div id="importProgress" class="import-progress hidden">
        <div class="import-progress-header">
          <strong id="importProgressTitle">インポート準備中</strong>
          <span id="importProgressPercent">0%</span>
        </div>
        <div class="progress-bar">
          <div id="importProgressBar" class="progress-bar-fill"></div>
        </div>
        <p id="importProgressDetail" class="muted">待機中</p>
      </div>

      <div class="button-list">
        <button class="ghost" data-action="editQuestionSet()">選択中の問題集を編集</button>
        <button class="danger" data-action="deleteQuestionSet()">選択中の問題集を削除</button>
      </div>

      <div class="button-list mt-12">
        <button data-action="showQuestionCreatorView()">問題作成画面を開く</button>
      </div>

      <h3>問題集一覧</h3>
      <div id="questionSetList" class="table-wrap"></div>

      <h3>選択中の問題一覧</h3>
      <div id="questionList" class="table-wrap"></div>
    </section>
  `;
}

function assignmentCard() {
  return `
    <section class="card">
      <h2>問題集割り当て</h2>
      <p class="muted">公開期間を設定すると、その期間内だけ受講者に問題集が表示されます。未入力の場合は期限なしです。</p>

      <label>問題集</label>
      <select id="assignSet"></select>

      <div class="three-col">
        <div>
          <label>公開開始日時</label>
          <input id="assignAvailableFrom" type="datetime-local">
        </div>
        <div>
          <label>公開終了日時</label>
          <input id="assignAvailableUntil" type="datetime-local">
        </div>
      </div>

      <label>企業に割り当て</label>
      <select id="assignOrg"></select>
      <button data-action="assignSetToOrg()">企業へ割り当て</button>

      <label>受講者に個別割り当て</label>
      <select id="assignUser"></select>
      <button class="ghost" data-action="assignSetToUser()">受講者へ割り当て</button>

      <p class="muted">通常は企業単位の割り当てで十分です。個別割り当ては例外対応用です。</p>
    </section>
  `;
}

function progressCard() {
  return `
    <section class="card">
      <h2>進捗確認</h2>
      <div class="three-col">
        <div>
          <label>問題集</label>
          <select id="progressSet"></select>
        </div>
        ${session.role === "admin" ? `
          <div>
            <label>企業</label>
            <select id="progressOrg" data-change="refreshProgressUserOptions()"></select>
          </div>
        ` : ""}
        <div>
          <label>ユーザー</label>
          <select id="progressUser"></select>
        </div>
      </div>
      <label>メールアドレス・表示名で検索</label>
      <input id="progressUserQuery" placeholder="例：student@example.com">
      <button data-action="loadProgress()">進捗を表示</button>
      <div id="progressList" class="table-wrap"></div>
    </section>
  `;
}

function answersCard() {
  return `
    <section class="card">
      <h2>回答履歴</h2>
      <div class="three-col">
        <div>
          <label>問題集</label>
          <select id="answersSet"></select>
        </div>
        ${session.role === "admin" ? `
          <div>
            <label>企業</label>
            <select id="answersOrg" data-change="refreshAnswersUserOptions()"></select>
          </div>
        ` : ""}
        <div>
          <label>ユーザー</label>
          <select id="answersUser"></select>
        </div>
      </div>
      <label>メールアドレス・表示名で検索</label>
      <input id="answersUserQuery" placeholder="例：student@example.com">
      <button data-action="loadAnswers()">回答履歴を表示</button>
      <div id="answersList" class="table-wrap"></div>
    </section>
  `;
}

function ticketsCard(title) {
  return `
    <section class="card">
      <h2>${title}</h2>
      <div class="three-col">
        <div>
          <label>状態</label>
          <select id="ticketStatus">
            <option value="all">全て</option>
            <option value="open">未対応</option>
            <option value="answered">回答済み</option>
            <option value="closed">クローズ</option>
          </select>
        </div>
        <div>
          <label>件名</label>
          <input id="ticketTitle" placeholder="問題に誤りがあります">
        </div>
        <div>
          <label>優先度</label>
          <select id="ticketPriority">
            <option value="normal">通常</option>
            <option value="high">高</option>
            <option value="low">低</option>
          </select>
        </div>
      </div>
      <label>お問い合わせ内容</label>
      <textarea id="ticketBody" rows="3" placeholder="該当問題・気づいた点など"></textarea>
      <div class="button-list">
        <button data-action="createTicket()">チケット起票</button>
        <button class="ghost" data-action="loadTickets()">チケット一覧を更新</button>
      </div>
      <div id="ticketList"></div>
    </section>
  `;
}

async function fillAdminData() {
  const [orgs, users, sets] = await Promise.all([loadOrganizations(), loadUsers(), loadQuestionSets()]);
  const studentUsers = users.filter(u => (u.roles || "").includes("student"));

  fillSelect("newUserOrg", orgs, "id", "name", true);
  fillSelect("userSearchOrg", orgs, "id", "name", true);
  fillSelect("adminSetSelect", sets, "id", "title", true);
  fillSelect("assignSet", sets, "id", "title", true);
  fillSelect("assignOrg", orgs, "id", "name", true);
  fillSelect("assignUser", studentUsers, "id", "display_name", true);
  fillSelect("progressSet", sets, "id", "title", true);
  fillSelect("answersSet", sets, "id", "title", true);
  fillSelect("progressOrg", orgs, "id", "name", true);
  fillSelect("answersOrg", orgs, "id", "name", true);
  fillSelect("progressUser", studentUsers, "id", "display_name", true);
  fillSelect("answersUser", studentUsers, "id", "display_name", true);

  renderOrganizationList(orgs);
  renderUserList(users);
  renderQuestionSetList(sets);
  await selectAdminQuestionSet();
  await loadTickets();
}

function fillSelect(id, rows, valueKey, labelKey, includeEmpty = false) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = includeEmpty ? `<option value="">選択してください</option>` : "";
  for (const row of rows) {
    const opt = document.createElement("option");
    opt.value = row[valueKey] || "";
    opt.textContent = row[labelKey] || row.title || row.username || "";
    el.appendChild(opt);
  }
}

function renderOrganizationList(orgs) {
  $("orgList").innerHTML = tableHtml(["企業名", "コード", "状態", "操作"], orgs.map(o => [
    escapeHtml(o.name),
    escapeHtml(o.code || ""),
    o.is_active ? "有効" : "無効",
    rawHtml(`<button class="mini ghost" data-action="editOrganization('${actionArg(o.id)}')">編集</button>
     <button class="mini danger" data-action="deleteOrganization('${actionArg(o.id)}')">無効化</button>`)
  ]));
}

function renderUserList(users) {
  $("userList").innerHTML = tableHtml(["メールアドレス", "表示名", "企業", "ロール", "2FA", "状態", "操作"], users.map(u => [
    escapeHtml(u.username),
    escapeHtml(u.display_name),
    escapeHtml(u.organization_name || ""),
    rawHtml(String(u.roles || "").split(",").filter(Boolean).map(r => `<span class="pill">${escapeHtml(roleLabel(r))}</span>`).join("")),
    u.two_factor_enabled ? "有効" : "未設定",
    u.is_active ? "有効" : "削除済み",
    u.is_active ? rawHtml(`<button class="mini danger" data-action="deleteUser('${actionArg(u.id)}')">削除</button>`) : ""
  ]));
}

function renderQuestionSetList(sets) {
  const list = $("questionSetList");
  if (!list) return;

  list.innerHTML = tableHtml(
    ["問題集", "分類", "問題数", "状態", "操作"],
    (sets || []).map(s => [
      escapeHtml(s.title || ""),
      escapeHtml(s.category || ""),
      s.question_count || 0,
      s.is_active ? "有効" : "無効",
      rawHtml(`<button class="mini ghost" data-action="selectQuestionSetFromList('${actionArg(s.id)}')">選択</button>
       <button class="mini ghost" data-action="editQuestionSet('${actionArg(s.id)}')">編集</button>
       <button class="mini danger" data-action="deleteQuestionSet('${actionArg(s.id)}')">削除</button>`)
    ])
  );
}

function selectQuestionSetFromList(questionSetId) {
  const select = $("adminSetSelect");
  if (select) {
    select.value = questionSetId;
    selectAdminQuestionSet();
  }
}

async function searchUsers() {
  try {
    const users = await loadUsers({
      query: $("userSearchQuery")?.value || "",
      organizationId: $("userSearchOrg")?.value || "",
      role: $("userSearchRole")?.value || "",
      active: $("userSearchActive")?.value || ""
    });
    renderUserList(users);
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function deleteUser(userId) {
  if (!confirm("このユーザーを削除しますか？\\n削除後はログインできなくなります。")) return;

  try {
    const endpoint = session.role === "company_manager"
      ? `/api/company/users/${userId}/delete`
      : `/api/admin/users/${userId}/delete`;

    await api(endpoint, {
      method: "POST",
      body: "{}"
    });

    cache.users = [];
    showMessage("ユーザーを削除しました。", "success");

    if (session.role === "company_manager" && $("companyUserList")) {
      await searchCompanyUsers();
    } else if ($("userList")) {
      await searchUsers();
    }
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function createOrganization() {
  try {
    await api("/api/admin/organizations", {
      method: "POST",
      body: JSON.stringify({ name: $("orgName").value, code: $("orgCode").value })
    });
    cache.organizations = [];
    showMessage("企業を作成しました。", "success");
    await renderApp();
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function editOrganization(id) {
  const org = cache.organizations.find(o => o.id === id);
  const name = prompt("企業名", org?.name || "");
  if (!name) return;
  const code = prompt("企業コード", org?.code || "") || "";
  await api(`/api/admin/organizations/${id}/update`, {
    method: "POST",
    body: JSON.stringify({ name, code, isActive: true })
  });
  cache.organizations = [];
  await renderApp();
}

async function deleteOrganization(id) {
  if (!confirm("この企業を無効化しますか？")) return;
  await api(`/api/admin/organizations/${id}/delete`, { method: "POST", body: "{}" });
  cache.organizations = [];
  await renderApp();
}

async function createUser() {
  try {
    await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: $("newUsername").value,
        displayName: $("newDisplayName").value,
        password: $("newPassword").value,
        organizationId: $("newUserOrg").value || null,
        roles: [$("newRole").value]
      })
    });
    cache.users = [];
    showMessage("ユーザーを作成しました。", "success");
    await renderApp();
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function createQuestionSet() {
  try {
    await api("/api/admin/question-sets", {
      method: "POST",
      body: JSON.stringify({
        title: $("setTitle").value,
        category: $("setCategory").value,
        description: $("setDescription").value
      })
    });
    cache.questionSets = [];
    showMessage("問題集を作成しました。", "success");
    await renderApp();
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function editQuestionSet(questionSetId = null) {
  const id = questionSetId || $("adminSetSelect")?.value;
  if (!id) return alert("問題集を選択してください。");
  const set = cache.questionSets.find(s => s.id === id);
  const title = prompt("問題集タイトル", set?.title || "");
  if (!title) return;
  const category = prompt("分類", set?.category || "") || "";
  const description = prompt("説明", set?.description || "") || "";
  await api(`/api/admin/question-sets/${id}/update`, {
    method: "POST",
    body: JSON.stringify({ title, category, description, isActive: true })
  });
  cache.questionSets = [];
  showMessage("問題集を更新しました。", "success");
  await renderApp();
}

async function deleteQuestionSet(questionSetId = null) {
  const id = questionSetId || $("adminSetSelect")?.value;
  if (!id) return alert("問題集を選択してください。");

  const set = cache.questionSets.find(s => s.id === id);
  const title = set?.title || "選択中の問題集";

  if (!confirm(`「${title}」を削除しますか？\n\nこの操作では、問題・選択肢・割り当て・進捗・回答履歴も削除されます。\nチケットは残りますが、問題集との紐付けは解除されます。`)) return;

  await api(`/api/admin/question-sets/${id}/delete`, { method: "POST", body: "{}" });
  cache.questionSets = [];
  cache.categoriesBySet = {};
  cache.activeQuestionSetId = null;
  cache.activeQuestionSetTitle = "";
  showMessage("問題集を削除しました。", "success");
  await renderApp();
}

async function selectAdminQuestionSet() {
  const id = $("adminSetSelect")?.value;
  if (!id) {
    if ($("questionList")) $("questionList").innerHTML = `<p class="muted">問題集を選択してください。</p>`;
    return;
  }
  const data = await api(`/api/admin/question-sets/${id}/questions`);
  const questions = data.questions || [];
  cache.questionCreatorQuestions = questions;

  $("questionList").innerHTML = tableHtml(
    ["番号", "分類", "問題文", "形式", "正答数", "選択肢", "操作"],
    questions.map(q => [
      q.number || "",
      escapeHtml(q.category || ""),
      escapeHtml(shorten(q.question_text, 80)),
      q.answer_type === "multiple" ? "チェックボックス" : "ラジオ",
      q.correct_count,
      rawHtml(q.options.map(o => `${o.is_correct ? "✅ " : ""}${escapeHtml(shorten(o.option_text, 28))}`).join("<br>")),
      rawHtml(`<div class="button-list table-actions">
        <button class="mini ghost" data-action="showQuestionEditorView('${actionArg(q.id)}')">編集</button>
        <button class="mini danger" data-action="deleteQuestion('${actionArg(q.id)}')">削除</button>
      </div>`)
    ])
  );

}



async function showQuestionEditorView(questionId) {
  if (!session || session.role !== "admin") return;

  const id = String(questionId || "").trim();
  if (!id) {
    alert("編集する問題が選択されていません。");
    return;
  }

  const select = $("adminSetSelect");
  cache.questionEditSetId = select?.value || cache.questionCreatorSetId || cache.activeQuestionSetId || "";
  cache.questionEditSetTitle = select?.selectedOptions?.[0]?.textContent || cache.questionCreatorSetTitle || "選択中の問題集";
  cache.questionEditQuestionId = id;
  cache.currentScreen = "questionEditor";
  await renderApp();
}

async function returnQuestionEditorToAdmin() {
  const setId = cache.questionEditSetId || cache.questionCreatorSetId || "";
  cache.currentScreen = "main";
  cache.questionEditQuestionId = "";
  await renderApp();

  if (setId && $("adminSetSelect")) {
    $("adminSetSelect").value = setId;
    await selectAdminQuestionSet();
  }
}

async function fetchQuestionForEdit(questionId) {
  const data = await api(`/api/admin/questions/${encodeURIComponent(questionId)}`);
  return data.question;
}

async function renderQuestionEditorScreen() {
  const root = $("adminView");
  const questionId = cache.questionEditQuestionId || "";

  if (!questionId) {
    root.innerHTML = `
      <section class="card">
        <h2>問題編集</h2>
        <p class="muted">編集対象の問題が選択されていません。</p>
        <button class="ghost" data-action="returnQuestionEditorToAdmin()">問題集管理へ戻る</button>
      </section>
    `;
    return;
  }

  const question = await fetchQuestionForEdit(questionId);
  if (!question) {
    root.innerHTML = `
      <section class="card">
        <h2>問題編集</h2>
        <p class="muted">問題が見つかりませんでした。</p>
        <button class="ghost" data-action="returnQuestionEditorToAdmin()">問題集管理へ戻る</button>
      </section>
    `;
    return;
  }

  cache.questionEditSetId = question.question_set_id || cache.questionEditSetId || "";
  cache.questionEditSetTitle = question.question_set_title || cache.questionEditSetTitle || "選択中の問題集";

  root.innerHTML = `
    <section class="card question-creator-page question-editor-page">
      <div class="question-creator-header">
        <div>
          <p class="eyebrow">QUESTION EDITOR</p>
          <h2>問題編集</h2>
          <p class="muted">対象問題集：${escapeHtml(cache.questionEditSetTitle || "選択中の問題集")}</p>
        </div>
        <div class="button-list">
          <button class="ghost" data-action="returnQuestionEditorToAdmin()">問題集管理へ戻る</button>
          <button class="danger" data-action="deleteQuestion('${actionArg(question.id)}')">この問題を削除</button>
        </div>
      </div>

      <div id="manualQuestionCreator"></div>
    </section>
  `;

  renderManualQuestionEditor(question);
}

function renderManualQuestionEditor(question) {
  const root = $("manualQuestionCreator");
  if (!root) return;

  const options = Array.isArray(question.options) && question.options.length
    ? question.options
    : [
        { id: `option_${Date.now()}_1`, option_text: "", is_correct: 1 },
        { id: `option_${Date.now()}_2`, option_text: "", is_correct: 0 }
      ];

  root.innerHTML = `
    <section class="question-builder-grid question-builder-grid-reversed">
      <section class="question-editor-panel">
        <div class="section-title-row">
          <h4>問題入力</h4>
          <span class="pill">編集</span>
        </div>

        ${renderQuestionBulkMarkdownBox("既存の内容を、貼り付けたMarkdownで上書きできます。")}

        <div class="two-col">
          <div>
            <label>番号</label>
            <input id="manualQuestionNumber" type="number" min="1" value="${escapeAttr(question.number || "")}">
          </div>
          <div>
            <label>分類</label>
            <input id="manualQuestionCategory" value="${escapeAttr(question.category || "")}" placeholder="例：情報セキュリティ">
          </div>
        </div>

        <div class="question-editor-section">
          <h5>① 問題文セクション</h5>
          <p class="muted">Excelで入れた問題も、手動で作成した問題も編集できます。Markdown形式・表・図に対応しています。</p>
          <div class="editor-toolbar">
            <button type="button" class="ghost mini" data-action="chooseQuestionCreatorImage('manualQuestionText')">問題文に図を追加</button>
            <span class="muted">画像をコピーして、この欄に貼り付けることもできます。</span>
          </div>
          <textarea id="manualQuestionText" class="image-paste-target" rows="8">${escapeHtml(question.question_text || "")}</textarea>
        </div>

        <div class="question-editor-section">
          <h5>② 選択肢セクション</h5>
          <p class="muted">選択肢の追加・削除、正解チェックの変更ができます。</p>
          <div id="manualOptionsList" class="question-options-editor">
            ${options.map((option, index) => questionCreatorOptionRow(
              option.id || `option_${Date.now()}_${index}`,
              option.option_text || option.text || "",
              Number(option.is_correct || 0) === 1 || option.isCorrect === true
            )).join("")}
          </div>
          <button type="button" class="ghost" data-action="addQuestionCreatorOption()">選択肢を追加</button>
        </div>

        <div class="question-editor-section">
          <h5>③ 解答解説セクション</h5>
          <p class="muted">Markdown形式・表・図に対応しています。</p>
          <div class="editor-toolbar">
            <button type="button" class="ghost mini" data-action="chooseQuestionCreatorImage('manualExplanation')">解答解説に図を追加</button>
            <span class="muted">画像をコピーして、この欄に貼り付けることもできます。</span>
          </div>
          <textarea id="manualExplanation" class="image-paste-target" rows="7">${escapeHtml(question.explanation || "")}</textarea>
        </div>

        <div class="button-list">
          <button data-action="saveQuestionEditor()">変更を保存</button>
          <button class="ghost" data-action="returnQuestionEditorToAdmin()">問題集管理へ戻る</button>
        </div>
      </section>

      <section class="question-preview-panel">
        <div class="question-builder-sticky">
          <div class="section-title-row">
            <h4>HTMLプレビュー</h4>
            <span class="pill">右画面</span>
          </div>

          <div class="preview-card">
            <p class="muted">問題文HTMLプレビュー</p>
            <div id="manualQuestionPreviewText" class="markdown-preview"></div>
            <details class="html-output-box">
              <summary>変換後HTMLを表示</summary>
              <pre id="manualQuestionPreviewHtml"></pre>
            </details>

            <p class="muted mt-12">選択肢プレビュー</p>
            <div id="manualQuestionPreviewOptions" class="preview-options"></div>

            <p class="muted mt-12">解答解説HTMLプレビュー</p>
            <div id="manualExplanationPreview" class="markdown-preview explanation-preview"></div>
            <details class="html-output-box">
              <summary>変換後HTMLを表示</summary>
              <pre id="manualExplanationPreviewHtml"></pre>
            </details>
          </div>
        </div>
      </section>
    </section>

    <input id="manualImageFileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden">
  `;

  const formRoot = $("manualQuestionCreator");
  if (formRoot) formRoot.dataset.bound = "0";
  bindQuestionCreatorEvents();
  updateQuestionCreatorPreview();
}

function validateQuestionEditorPayload() {
  const questionText = $("manualQuestionText")?.value.trim() || "";
  const explanation = $("manualExplanation")?.value.trim() || "";
  const category = $("manualQuestionCategory")?.value.trim() || "";
  const number = Number($("manualQuestionNumber")?.value || 0) || null;

  const options = collectQuestionCreatorOptions()
    .map(option => ({
      text: option.text,
      isCorrect: option.isCorrect
    }))
    .filter(option => option.text);

  const correctCount = options.filter(option => option.isCorrect).length;

  if (!questionText) throw new Error("問題文を入力してください。");
  if (options.length < 2) throw new Error("選択肢は最低2つ入力してください。");
  if (correctCount < 1) throw new Error("正解の選択肢にチェックを入れてください。");

  return {
    number,
    category,
    questionText,
    explanation,
    correctCount,
    options
  };
}

async function saveQuestionEditor() {
  const questionId = cache.questionEditQuestionId || "";
  if (!questionId) return alert("編集対象の問題が選択されていません。");

  try {
    const payload = validateQuestionEditorPayload();

    await api(`/api/admin/questions/${encodeURIComponent(questionId)}/update`, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    showMessage("問題を更新しました。", "success");
    await returnQuestionEditorToAdmin();
  } catch (error) {
    showMessage(error.message || "問題の更新に失敗しました。", "error");
  }
}

async function deleteQuestion(questionId = "") {
  const id = String(questionId || cache.questionEditQuestionId || "").trim();
  if (!id) return alert("削除する問題が選択されていません。");

  if (!confirm("この問題を削除しますか？\\n回答履歴と進捗も削除されます。")) return;

  try {
    await api(`/api/admin/questions/${encodeURIComponent(id)}/delete`, {
      method: "POST",
      body: JSON.stringify({})
    });

    showMessage("問題を削除しました。", "success");

    if (cache.currentScreen === "questionEditor") {
      await returnQuestionEditorToAdmin();
    } else {
      await selectAdminQuestionSet();
    }
  } catch (error) {
    showMessage(error.message || "問題の削除に失敗しました。", "error");
  }
}


function showQuestionCreatorView() {
  if (!session || session.role !== "admin") return;

  const select = $("adminSetSelect");
  const setId = select?.value || "";
  if (!setId) {
    alert("先に問題集を選択してください。");
    return;
  }

  cache.questionCreatorSetId = setId;
  cache.questionCreatorSetTitle = select?.selectedOptions?.[0]?.textContent || "選択中の問題集";
  cache.currentScreen = "questionCreator";
  renderApp();
}

function returnQuestionCreatorToAdmin() {
  cache.currentScreen = "main";
  renderApp();
}

async function renderQuestionCreatorScreen() {
  const root = $("adminView");
  const setId = cache.questionCreatorSetId || "";

  if (!setId) {
    root.innerHTML = `
      <section class="card">
        <h2>問題作成</h2>
        <p class="muted">問題集が選択されていません。</p>
        <button class="ghost" data-action="returnQuestionCreatorToAdmin()">問題集管理へ戻る</button>
      </section>
    `;
    return;
  }

  const data = await api(`/api/admin/question-sets/${setId}/questions`);
  cache.questionCreatorQuestions = data.questions || [];

  root.innerHTML = `
    <section class="card question-creator-page">
      <div class="question-creator-header">
        <div>
          <p class="eyebrow">QUESTION BUILDER</p>
          <h2>問題作成</h2>
          <p class="muted">対象問題集：${escapeHtml(cache.questionCreatorSetTitle || "選択中の問題集")}</p>
        </div>
        <div class="button-list">
          <button class="ghost" data-action="returnQuestionCreatorToAdmin()">問題集管理へ戻る</button>
        </div>
      </div>

      <div id="manualQuestionCreator"></div>
    </section>
  `;

  renderManualQuestionCreator(cache.questionCreatorQuestions);
}



function isAllowedMarkdownImageSrc(src) {
  const value = String(src || "").trim();

  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value)) {
    return true;
  }

  if (/^https:\/\/[^\s"'<>]+$/i.test(value)) {
    return true;
  }

  if (/^(?:\.\/)?images\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+\.(?:png|jpe?g|webp|gif)$/i.test(value)) {
    return true;
  }

  return false;
}

function inlineMarkdown(text) {
  const imageTokens = [];
  let source = String(text || "");

  source = source.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, src) => {
    const cleanSrc = String(src || "").trim();
    if (!isAllowedMarkdownImageSrc(cleanSrc)) {
      return match;
    }

    const token = `@@MD_IMAGE_${imageTokens.length}@@`;
    imageTokens.push({
      token,
      html: `<img class="markdown-image" src="${escapeAttr(cleanSrc)}" alt="${escapeAttr(alt || "図")}">`
    });
    return token;
  });

  let html = escapeHtml(source);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  for (const item of imageTokens) {
    html = html.replaceAll(item.token, item.html);
  }

  return html;
}

function splitMarkdownTableRow(line) {
  const trimmed = String(line || "").trim();
  const content = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  let escaped = false;

  for (const char of content) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function isMarkdownTableSeparator(line) {
  const cells = splitMarkdownTableRow(line);
  if (cells.length < 2) return false;

  return cells.every((cell) => {
    const normalized = String(cell || "").trim();
    return /^:?-{3,}:?$/.test(normalized);
  });
}

function tableAlignFromSeparator(cell) {
  const value = String(cell || "").trim();
  if (value.startsWith(":") && value.endsWith(":")) return "center";
  if (value.endsWith(":")) return "right";
  return "left";
}

function renderMarkdownTable(headers, separators, rows) {
  const aligns = separators.map(tableAlignFromSeparator);

  const thead = `
    <thead>
      <tr>
        ${headers.map((header, index) => `<th style="text-align:${aligns[index] || "left"}">${inlineMarkdown(header)}</th>`).join("")}
      </tr>
    </thead>
  `;

  const tbody = `
    <tbody>
      ${rows.map(row => `
        <tr>
          ${headers.map((_, index) => `<td style="text-align:${aligns[index] || "left"}">${inlineMarkdown(row[index] || "")}</td>`).join("")}
        </tr>
      `).join("")}
    </tbody>
  `;

  return `<div class="markdown-table-wrap"><table>${thead}${tbody}</table></div>`;
}

function renderMarkdownPreview(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n").trim();
  if (!source) return `<p class="muted">未入力です。</p>`;

  const lines = source.split("\n");
  const html = [];
  let paragraph = [];
  let list = [];
  let code = [];
  let inCode = false;

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!list.length) return;
    html.push(`<ul>${list.map(item => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  }

  function flushCode() {
    if (!code.length) return;
    html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    code = [];
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const raw = String(line || "");
    const trimmed = raw.trim();

    if (trimmed.startsWith("```")) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      code.push(raw);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const nextLine = lines[i + 1] || "";
    if (trimmed.includes("|") && isMarkdownTableSeparator(nextLine)) {
      flushParagraph();
      flushList();

      const headers = splitMarkdownTableRow(trimmed);
      const separators = splitMarkdownTableRow(nextLine);
      const rows = [];

      i += 2;
      while (i < lines.length) {
        const rowLine = String(lines[i] || "").trim();
        if (!rowLine || !rowLine.includes("|")) {
          i -= 1;
          break;
        }

        rows.push(splitMarkdownTableRow(rowLine));
        i += 1;
      }

      html.push(renderMarkdownTable(headers, separators, rows));
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(4, heading[1].length + 2);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushCode();
  flushParagraph();
  flushList();

  return html.join("");
}

function questionCreatorOptionRow(rowId, text = "", checked = false) {
  return `
    <div class="question-option-row" data-row-id="${escapeAttr(rowId)}">
      <label class="option-correct-check">
        <input type="checkbox" class="manual-option-correct" ${checked ? "checked" : ""}>
        <span>正解</span>
      </label>
      <textarea class="manual-option-text image-paste-target" rows="2" placeholder="選択肢を入力。図を貼り付ける場合は、ここに画像をペーストしてください。">${escapeHtml(text)}</textarea>
      <div class="option-row-actions">
        <button type="button" class="ghost mini" data-action="chooseQuestionCreatorImage('option:${actionArg(rowId)}')">図を追加</button>
        <button type="button" class="ghost mini" data-action="removeQuestionCreatorOption('${actionArg(rowId)}')">削除</button>
      </div>
    </div>
  `;
}

function nextManualQuestionNumber(questions = []) {
  const numbers = (questions || [])
    .map(q => Number(q.number || 0))
    .filter(n => Number.isFinite(n) && n > 0);
  if (!numbers.length) return (questions || []).length + 1;
  return Math.max(...numbers) + 1;
}

function renderManualQuestionCreator(questions = [], draft = {}) {
  const root = $("manualQuestionCreator");
  if (!root) return;

  const setId = $("adminSetSelect")?.value || cache.questionCreatorSetId || "";
  if (!setId) {
    root.innerHTML = `
      <div class="question-builder-empty">
        問題作成を行うには、先に問題集を選択してください。
      </div>
    `;
    return;
  }

  const nextNumber = Number(draft.number || 0) || nextManualQuestionNumber(questions);
  const draftCategory = String(draft.category || "");
  const firstId = `option_${Date.now()}_1`;
  const secondId = `option_${Date.now()}_2`;

  root.innerHTML = `
    <section class="question-builder-grid question-builder-grid-reversed">
      <section class="question-editor-panel">
        <div class="section-title-row">
          <h4>問題入力</h4>
          <span class="pill">左画面</span>
        </div>

        ${renderQuestionBulkMarkdownBox()}

        <div class="two-col">
          <div>
            <label>番号</label>
            <input id="manualQuestionNumber" type="number" min="1" value="${nextNumber}">
          </div>
          <div>
            <label>分類</label>
            <input id="manualQuestionCategory" value="${escapeAttr(draftCategory)}" placeholder="例：情報セキュリティ">
          </div>
        </div>

        <div class="question-editor-section">
          <h5>① 問題文セクション</h5>
          <p class="muted">Markdown形式で入力できます。右側にHTMLへ変換したプレビューを表示します。</p>
          <div class="editor-toolbar">
            <button type="button" class="ghost mini" data-action="chooseQuestionCreatorImage('manualQuestionText')">問題文に図を追加</button>
            <span class="muted">画像をコピーして、この欄に貼り付けることもできます。</span>
          </div>
          <textarea id="manualQuestionText" class="image-paste-target" rows="8" placeholder="# 問題文&#10;&#10;以下のうち、正しいものを選んでください。"></textarea>
        </div>

        <div class="question-editor-section">
          <h5>② 選択肢セクション</h5>
          <p class="muted">4択固定ではなく、何択でも作成できます。正解の選択肢にチェックを入れてください。</p>
          <div id="manualOptionsList" class="question-options-editor">
            ${questionCreatorOptionRow(firstId, "", true)}
            ${questionCreatorOptionRow(secondId, "", false)}
          </div>
          <button type="button" class="ghost" data-action="addQuestionCreatorOption()">選択肢を追加</button>
        </div>

        <div class="question-editor-section">
          <h5>③ 解答解説セクション</h5>
          <p class="muted">Markdown形式で入力できます。右側にHTMLへ変換したプレビューを表示します。</p>
          <div class="editor-toolbar">
            <button type="button" class="ghost mini" data-action="chooseQuestionCreatorImage('manualExplanation')">解答解説に図を追加</button>
            <span class="muted">画像をコピーして、この欄に貼り付けることもできます。</span>
          </div>
          <textarea id="manualExplanation" class="image-paste-target" rows="7" placeholder="## 解説&#10;&#10;この選択肢が正解となる理由を入力してください。"></textarea>
        </div>

        <div class="button-list">
          <button data-action="saveQuestionFromCreator()">問題を保存して次へ</button>
          <button class="ghost" data-action="clearQuestionCreatorForm()">入力内容をクリア</button>
        </div>
      </section>

      <section class="question-preview-panel">
        <div class="question-builder-sticky">
          <div class="section-title-row">
            <h4>HTMLプレビュー</h4>
            <span class="pill">右画面</span>
          </div>

          <div class="preview-card">
            <p class="muted">問題文HTMLプレビュー</p>
            <div id="manualQuestionPreviewText" class="markdown-preview"></div>
            <details class="html-output-box">
              <summary>変換後HTMLを表示</summary>
              <pre id="manualQuestionPreviewHtml"></pre>
            </details>

            <p class="muted mt-12">選択肢プレビュー</p>
            <div id="manualQuestionPreviewOptions" class="preview-options"></div>

            <p class="muted mt-12">解答解説HTMLプレビュー</p>
            <div id="manualExplanationPreview" class="markdown-preview explanation-preview"></div>
            <details class="html-output-box">
              <summary>変換後HTMLを表示</summary>
              <pre id="manualExplanationPreviewHtml"></pre>
            </details>
          </div>
        </div>
      </section>
    </section>
  `;

  bindQuestionCreatorEvents();
  updateQuestionCreatorPreview();
}


let questionMarkdownAutoFillTimer = null;

function renderQuestionBulkMarkdownBox(note = "Markdown形式の問題を貼り付けると、下の入力欄へ自動反映します。複数問を一括登録する場合は、各問題の末尾に ---END-QUESTION--- を入れてください。") {
  return `
    <div class="question-bulk-md-box">
      <div class="section-title-row">
        <h5>MD一括入力</h5>
        <span class="pill">自動入力 / 一括登録</span>
      </div>
      <p class="muted">${escapeHtml(note)}</p>
      <textarea id="manualQuestionBulkMarkdown" rows="10" placeholder="例：
番号: 1
分類: CySA+ (CS0-003)

## 問題
# 問題文

以下のうち、正しいものを選んでください。

## 選択肢
- [x] A. 正しい選択肢
- [ ] B. 誤っている選択肢

## 解答
A. 正しい選択肢

## 解説
この選択肢が正解となる理由を入力してください。

---END-QUESTION---

番号: 2
分類: CySA+ (CS0-003)

## 問題
次の問題文..."></textarea>

      <div class="bulk-md-import-row">
        <input id="bulkQuestionMarkdownFile" type="file" accept=".md,.txt,text/markdown,text/plain" class="hidden">
        <button type="button" class="ghost" data-action="loadBulkQuestionMarkdownFile()">MDファイルを読み込む</button>
        <button type="button" class="ghost" data-action="applyQuestionMarkdownToForm()">1問目を入力欄へ反映</button>
        <button type="button" data-action="importBulkQuestionMarkdown()">MDを全問一括保存</button>
        <button type="button" class="ghost" data-action="clearQuestionBulkMarkdown()">MD欄をクリア</button>
      </div>

      <p class="muted">
        区切り記号：<code>---END-QUESTION---</code>
        / <code>- [x]</code> は正解、<code>- [ ]</code> は不正解として読み込みます。
      </p>
    </div>
  `;
}

function scheduleQuestionMarkdownAutoFill() {
  clearTimeout(questionMarkdownAutoFillTimer);
  questionMarkdownAutoFillTimer = setTimeout(() => {
    applyQuestionMarkdownToForm(false);
  }, 350);
}

function normalizeMarkdownCompare(value) {
  return String(value || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/^[\s\-*・]+/, "")
    .replace(/^[A-Za-zＡ-Ｚａ-ｚ0-9０-９ア-ン]\s*[\).．、:：]\s*/, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function stripChoiceLabel(text) {
  return String(text || "")
    .replace(/^\s*[A-FＡ-Ｆ]\s*[\).．、:：]\s*/, "")
    .trim();
}

function getMarkdownSectionName(line) {
  const text = String(line || "").trim().replace(/^#+\s*/, "").trim();
  const normalized = text.replace(/\s+/g, "");

  if (/^(番号|No|NO|No\.|QuestionNo|問題番号)$/i.test(normalized)) return "number";
  if (/^(分類|カテゴリ|カテゴリー|Category)$/i.test(normalized)) return "category";
  if (/^(問題|問題文|設問|問題文セクション|Question)$/i.test(normalized)) return "question";
  if (/^(選択肢|選択肢セクション|Choices|Options)$/i.test(normalized)) return "options";
  if (/^(解答|答え|正解|Answer|CorrectAnswer)$/i.test(normalized)) return "answer";
  if (/^(解説|解答解説|解答解説セクション|Explanation)$/i.test(normalized)) return "explanation";
  return "";
}

function splitMarkdownQuestionSections(markdown) {
  const result = {
    number: "",
    category: "",
    question: [],
    options: [],
    answer: [],
    explanation: [],
    preface: []
  };

  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  let current = "preface";

  for (const line of lines) {
    const heading = String(line || "").match(/^\s{0,3}#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      const section = getMarkdownSectionName(line);
      if (section) {
        current = section;
        continue;
      }
    }

    const keyValue = String(line || "").match(/^\s*(番号|No\.?|分類|カテゴリ|カテゴリー|Category)\s*[:：]\s*(.+?)\s*$/i);
    if (keyValue) {
      const key = keyValue[1].toLowerCase();
      if (key.includes("no") || key.includes("番号")) result.number = keyValue[2].trim();
      else result.category = keyValue[2].trim();
      continue;
    }

    if (!Array.isArray(result[current])) {
      result[current] = String(line || "").trim();
      current = "preface";
      continue;
    }

    result[current].push(line);
  }

  if (!result.question.join("").trim() && result.preface.join("").trim()) {
    result.question = result.preface;
  }

  return result;
}

function parseQuestionOptionLine(line) {
  const raw = String(line || "").trim();
  if (!raw) return null;

  let match = raw.match(/^[-*・]\s*\[(x|X|✓|✔|○|o|O|true|TRUE|1|正解|\s)\]\s*(.+)$/);
  if (match) {
    return { text: stripChoiceLabel(match[2]), isCorrect: !/^\s$/.test(match[1]), label: "" };
  }

  match = raw.match(/^[-*・]\s*(?:正解|○|✓|✔)\s*[:：]?\s*(.+)$/);
  if (match) return { text: stripChoiceLabel(match[1]), isCorrect: true, label: "" };

  match = raw.match(/^[-*・]\s*(.+)$/);
  if (match) return { text: stripChoiceLabel(match[1]), isCorrect: false, label: "" };

  match = raw.match(/^([A-Za-zＡ-Ｚａ-ｚ0-9０-９ア-ン])\s*[\).．、:：]\s*(.+)$/);
  if (match) return { text: stripChoiceLabel(match[2]), isCorrect: false, label: match[1].trim() };

  return null;
}

function parseQuestionOptionsFromMarkdown(lines) {
  const options = [];
  let current = null;

  for (const line of lines || []) {
    const parsed = parseQuestionOptionLine(line);
    if (parsed) {
      if (current) options.push(current);
      current = parsed;
      continue;
    }

    if (current && String(line || "").trim()) {
      current.text += `\n${line}`;
    }
  }

  if (current) options.push(current);
  return options;
}

function applyAnswerSectionToOptions(options, answerText) {
  const answer = String(answerText || "").trim();
  if (!answer || !options.length) return options;

  const normalizedAnswer = normalizeMarkdownCompare(answer);
  const answerLabels = new Set(answer.split(/[\s,，、／/]+/).map(value => value.trim()).filter(Boolean));

  return options.map((option) => {
    const normalizedOption = normalizeMarkdownCompare(option.text);
    const labelMatched = option.label && answerLabels.has(option.label);
    const textMatched = normalizedOption && normalizedAnswer.includes(normalizedOption);
    const answerMatched = normalizedAnswer && normalizedOption.includes(normalizedAnswer);
    return { ...option, isCorrect: option.isCorrect || labelMatched || textMatched || answerMatched };
  });
}

function parseQuestionMarkdownForAutoFill(markdown) {
  const sections = splitMarkdownQuestionSections(markdown);
  const questionText = sections.question.join("\n").trim();
  const explanation = sections.explanation.join("\n").trim();
  let options = parseQuestionOptionsFromMarkdown(sections.options);
  options = applyAnswerSectionToOptions(options, sections.answer.join("\n"));

  return {
    number: String(sections.number || "").trim(),
    category: String(sections.category || "").trim(),
    questionText,
    answer: sections.answer.join("\n").trim(),
    explanation,
    options
  };
}

function setQuestionCreatorOptions(options) {
  const list = $("manualOptionsList");
  if (!list) return;

  const normalizedOptions = Array.isArray(options) && options.length
    ? options
    : [
        { text: "", isCorrect: true },
        { text: "", isCorrect: false }
      ];

  if (normalizedOptions.length < 2) normalizedOptions.push({ text: "", isCorrect: false });

  list.innerHTML = normalizedOptions.map((option, index) => {
    const rowId = `option_${Date.now()}_${index}_${Math.random().toString(16).slice(2)}`;
    return questionCreatorOptionRow(rowId, option.text || "", option.isCorrect === true);
  }).join("");
}


const QUESTION_BULK_DELIMITER = "---END-QUESTION---";

function splitBulkQuestionMarkdown(source) {
  const text = String(source || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  if (text.includes(QUESTION_BULK_DELIMITER)) {
    return text
      .split(QUESTION_BULK_DELIMITER)
      .map(block => block.trim())
      .filter(Boolean);
  }

  return [text];
}

function questionMarkdownToImportRow(markdown, index = 0) {
  const parsed = parseQuestionMarkdownForAutoFill(markdown);
  const numberRaw = String(parsed.number || "").trim();
  const number = numberRaw ? Number(numberRaw.replace(/[^\d]/g, "")) : null;
  const options = (parsed.options || [])
    .map(option => ({
      text: stripChoiceLabel(option.text),
      isCorrect: option.isCorrect === true
    }))
    .filter(option => option.text);

  const correctCount = options.filter(option => option.isCorrect).length;

  if (!parsed.questionText) {
    throw new Error(`${index + 1}問目：問題文が空です。`);
  }
  if (options.length < 2) {
    throw new Error(`${index + 1}問目：選択肢は最低2つ必要です。`);
  }
  if (correctCount < 1) {
    throw new Error(`${index + 1}問目：正解の選択肢に - [x] を付けてください。`);
  }

  return {
    number: Number.isFinite(number) && number > 0 ? number : null,
    category: parsed.category || "",
    questionText: parsed.questionText,
    explanation: parsed.explanation || "",
    correctCount,
    options
  };
}

function parseBulkQuestionMarkdownRows(source) {
  const blocks = splitBulkQuestionMarkdown(source);
  return blocks.map((block, index) => questionMarkdownToImportRow(block, index));
}

async function importBulkQuestionMarkdown() {
  const setId = $("adminSetSelect")?.value || cache.questionCreatorSetId || cache.questionEditSetId || "";
  if (!setId) return alert("問題集を選択してください。");

  const source = $("manualQuestionBulkMarkdown")?.value || "";
  if (!source.trim()) return alert("MD一括入力欄に内容を貼り付けてください。");

  let rows = [];
  try {
    rows = parseBulkQuestionMarkdownRows(source);
  } catch (error) {
    showMessage(error.message || "MDの解析に失敗しました。", "error");
    return;
  }

  if (!rows.length) return alert("読み込める問題がありません。");

  const message = `${rows.length}問をこの問題集へ追加します。既存の問題は削除されません。よろしいですか？`;
  if (!confirm(message)) return;

  try {
    const result = await api(`/api/admin/question-sets/${setId}/import`, {
      method: "POST",
      body: JSON.stringify({
        replace: false,
        rows
      })
    });

    if (Array.isArray(result.errors) && result.errors.length) {
      showMessage(result.errors.join("\n"), "error");
      return;
    }

    showMessage(`${rows.length}問を一括保存しました。`, "success");

    if (cache.currentScreen === "questionCreator") {
      const latest = await api(`/api/admin/question-sets/${setId}/questions`);
      cache.questionCreatorQuestions = latest.questions || [];
      renderManualQuestionCreator(cache.questionCreatorQuestions, {
        number: nextManualQuestionNumber(cache.questionCreatorQuestions),
        category: rows[rows.length - 1]?.category || ""
      });
    } else {
      await selectAdminQuestionSet();
    }
  } catch (error) {
    showMessage(error.message || "一括保存に失敗しました。", "error");
  }
}

function loadBulkQuestionMarkdownFile() {
  const input = $("bulkQuestionMarkdownFile");
  if (!input) return;

  input.value = "";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const textarea = $("manualQuestionBulkMarkdown");
      if (textarea) {
        textarea.value = String(reader.result || "");
        applyQuestionMarkdownToForm(false);
        showMessage("MDファイルを読み込みました。", "success");
      }
    };
    reader.onerror = () => showMessage("MDファイルの読み込みに失敗しました。", "error");
    reader.readAsText(file, "utf-8");
  };

  input.click();
}


function applyQuestionMarkdownToForm(showNotice = true) {
  const source = $("manualQuestionBulkMarkdown")?.value || "";
  if (!source.trim()) return;

  const firstBlock = splitBulkQuestionMarkdown(source)[0] || source;
  const parsed = parseQuestionMarkdownForAutoFill(firstBlock);

  if (parsed.number && $("manualQuestionNumber")) {
    const numeric = Number(parsed.number.replace(/[^\d]/g, ""));
    if (Number.isFinite(numeric) && numeric > 0) $("manualQuestionNumber").value = numeric;
  }

  if (parsed.category && $("manualQuestionCategory")) $("manualQuestionCategory").value = parsed.category;
  if (parsed.questionText && $("manualQuestionText")) $("manualQuestionText").value = parsed.questionText;
  if (parsed.explanation && $("manualExplanation")) $("manualExplanation").value = parsed.explanation;
  if (parsed.options.length) setQuestionCreatorOptions(parsed.options);

  updateQuestionCreatorPreview();
  if (showNotice) showMessage("Markdownを入力欄へ反映しました。", "success");
}

function clearQuestionBulkMarkdown() {
  const input = $("manualQuestionBulkMarkdown");
  if (input) input.value = "";
}

function bindQuestionCreatorEvents() {
  const root = $("manualQuestionCreator");
  if (!root || root.dataset.bound === "1") return;
  root.dataset.bound = "1";

  root.addEventListener("input", (event) => {
    if (event.target?.id === "manualQuestionBulkMarkdown") {
      scheduleQuestionMarkdownAutoFill();
      return;
    }

    updateQuestionCreatorPreview();
  });

  root.addEventListener("change", (event) => {
    if (event.target?.id === "manualImageFileInput") {
      handleQuestionCreatorImageFileInput(event);
      return;
    }

    updateQuestionCreatorPreview();
  });

  root.addEventListener("paste", (event) => {
    handleQuestionCreatorImagePaste(event);
  });

  root.addEventListener("dragover", (event) => {
    if (isQuestionCreatorEditable(event.target) && hasImageFiles(event.dataTransfer?.files)) {
      event.preventDefault();
    }
  });

  root.addEventListener("drop", (event) => {
    handleQuestionCreatorImageDrop(event);
  });
}

function isQuestionCreatorEditable(target) {
  return Boolean(target?.matches?.("#manualQuestionText, #manualExplanation, .manual-option-text"));
}

function hasImageFiles(files) {
  return Array.from(files || []).some(file => /^image\/(?:png|jpeg|jpg|webp|gif)$/i.test(file.type));
}

function questionCreatorImageMarkdown(dataUrl, fileName = "図") {
  const alt = String(fileName || "図").replace(/\.[^.]+$/, "").trim() || "図";
  return `\n\n![${alt}](${dataUrl})\n\n`;
}

function insertTextAtCursor(element, text) {
  if (!element) return;

  const start = Number(element.selectionStart ?? element.value.length);
  const end = Number(element.selectionEnd ?? element.value.length);
  const before = element.value.slice(0, start);
  const after = element.value.slice(end);

  element.value = `${before}${text}${after}`;

  const nextPosition = start + text.length;
  element.selectionStart = nextPosition;
  element.selectionEnd = nextPosition;
  element.focus();

  element.dispatchEvent(new Event("input", { bubbles: true }));
}

function imageFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(?:png|jpeg|jpg|webp|gif)$/i.test(file.type)) {
      reject(new Error("PNG、JPEG、WebP、GIF形式の画像だけ貼り付けできます。"));
      return;
    }

    if (file.type.toLowerCase() === "image/gif") {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxWidth = 1100;
        const maxHeight = 900;
        const scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        context.drawImage(img, 0, 0, width, height);

        const outputType = file.type.toLowerCase() === "image/png" ? "image/png" : "image/jpeg";
        const dataUrl = outputType === "image/png"
          ? canvas.toDataURL(outputType)
          : canvas.toDataURL(outputType, 0.86);

        resolve(dataUrl);
      };

      img.onerror = () => reject(new Error("画像の変換に失敗しました。"));
      img.src = String(reader.result || "");
    };

    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

async function insertQuestionCreatorImageFile(targetElement, file) {
  try {
    const dataUrl = await imageFileToDataUrl(file);
    insertTextAtCursor(targetElement, questionCreatorImageMarkdown(dataUrl, file.name || "図"));
    showMessage("図を挿入しました。", "success");
  } catch (error) {
    showMessage(error.message || "図の挿入に失敗しました。", "error");
  }
}

function getQuestionCreatorImageTargetElement(targetKey) {
  const key = String(targetKey || "").trim();

  if (key.startsWith("option:")) {
    const rowId = key.slice("option:".length);
    return document.querySelector(`#manualOptionsList .question-option-row[data-row-id="${CSS.escape(rowId)}"] .manual-option-text`);
  }

  if (key) return $(key);

  const active = document.activeElement;
  if (isQuestionCreatorEditable(active)) return active;

  return $("manualQuestionText") || $("manualExplanation") || document.querySelector(".manual-option-text");
}

function chooseQuestionCreatorImage(targetKey = "") {
  cache.questionCreatorImageTarget = String(targetKey || "");
  const input = $("manualImageFileInput");
  if (!input) return;

  input.value = "";
  input.click();
}

async function handleQuestionCreatorImageFileInput(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const target = getQuestionCreatorImageTargetElement(cache.questionCreatorImageTarget);
  await insertQuestionCreatorImageFile(target, file);

  cache.questionCreatorImageTarget = "";
  event.target.value = "";
}

async function handleQuestionCreatorImagePaste(event) {
  if (!isQuestionCreatorEditable(event.target)) return;

  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find(item => /^image\/(?:png|jpeg|jpg|webp|gif)$/i.test(item.type));
  if (!imageItem) return;

  const file = imageItem.getAsFile();
  if (!file) return;

  event.preventDefault();
  await insertQuestionCreatorImageFile(event.target, file);
}

async function handleQuestionCreatorImageDrop(event) {
  if (!isQuestionCreatorEditable(event.target)) return;

  const files = Array.from(event.dataTransfer?.files || []).filter(file => /^image\/(?:png|jpeg|jpg|webp|gif)$/i.test(file.type));
  if (!files.length) return;

  event.preventDefault();

  for (const file of files) {
    await insertQuestionCreatorImageFile(event.target, file);
  }
}

function collectQuestionCreatorOptions() {
  return Array.from(document.querySelectorAll("#manualOptionsList .question-option-row"))
    .map((row) => ({
      row,
      text: row.querySelector(".manual-option-text")?.value.trim() || "",
      isCorrect: row.querySelector(".manual-option-correct")?.checked === true
    }));
}

function updateQuestionCreatorPreview() {
  const questionPreview = $("manualQuestionPreviewText");
  const optionsPreview = $("manualQuestionPreviewOptions");
  const explanationPreview = $("manualExplanationPreview");
  const questionPreviewHtml = $("manualQuestionPreviewHtml");
  const explanationPreviewHtml = $("manualExplanationPreviewHtml");
  if (!questionPreview || !optionsPreview || !explanationPreview) return;

  const questionHtml = renderMarkdownPreview($("manualQuestionText")?.value || "");
  const explanationHtml = renderMarkdownPreview($("manualExplanation")?.value || "");

  questionPreview.innerHTML = questionHtml;
  explanationPreview.innerHTML = explanationHtml;

  if (questionPreviewHtml) questionPreviewHtml.textContent = questionHtml;
  if (explanationPreviewHtml) explanationPreviewHtml.textContent = explanationHtml;

  const options = collectQuestionCreatorOptions();
  const visibleOptions = options.filter(option => option.text);

  if (!visibleOptions.length) {
    optionsPreview.innerHTML = `<p class="muted">選択肢が未入力です。</p>`;
    return;
  }

  optionsPreview.innerHTML = visibleOptions.map((option, index) => `
    <div class="preview-option ${option.isCorrect ? "correct" : ""}">
      <span class="preview-option-letter">${String.fromCharCode(65 + index)}</span>
      <div class="preview-option-body">${renderMarkdownPreview(option.text)}</div>
      ${option.isCorrect ? `<strong>正解</strong>` : ""}
    </div>
  `).join("");
}

function addQuestionCreatorOption() {
  const list = $("manualOptionsList");
  if (!list) return;

  const rowId = `option_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  list.insertAdjacentHTML("beforeend", questionCreatorOptionRow(rowId, "", false));
  updateQuestionCreatorPreview();

  const rows = list.querySelectorAll(".question-option-row");
  const last = rows[rows.length - 1];
  last?.querySelector(".manual-option-text")?.focus();
}

function removeQuestionCreatorOption(rowId) {
  const rows = Array.from(document.querySelectorAll("#manualOptionsList .question-option-row"));
  if (rows.length <= 2) {
    alert("選択肢は最低2つ必要です。");
    return;
  }

  const row = rows.find(item => item.dataset.rowId === rowId);
  if (row) row.remove();
  updateQuestionCreatorPreview();
}

function clearQuestionCreatorForm() {
  if (!confirm("入力中の問題をクリアしますか？")) return;
  const currentNumber = Number($("manualQuestionNumber")?.value || 0) || nextManualQuestionNumber(cache.questionCreatorQuestions || []);
  const currentCategory = $("manualQuestionCategory")?.value.trim() || "";
  renderManualQuestionCreator(cache.questionCreatorQuestions || [], {
    number: currentNumber,
    category: currentCategory
  });
}

async function saveQuestionFromCreator() {
  const setId = $("adminSetSelect")?.value || cache.questionCreatorSetId || "";
  if (!setId) return alert("問題集を選択してください。");

  const questionText = $("manualQuestionText")?.value.trim() || "";
  const explanation = $("manualExplanation")?.value.trim() || "";
  const category = $("manualQuestionCategory")?.value.trim() || "";
  const number = Number($("manualQuestionNumber")?.value || 0) || null;

  const options = collectQuestionCreatorOptions()
    .map(option => ({
      text: option.text,
      isCorrect: option.isCorrect
    }))
    .filter(option => option.text);

  const correctCount = options.filter(option => option.isCorrect).length;

  if (!questionText) return alert("問題文を入力してください。");
  if (options.length < 2) return alert("選択肢は最低2つ入力してください。");
  if (correctCount < 1) return alert("正解の選択肢にチェックを入れてください。");

  try {
    const result = await api(`/api/admin/question-sets/${setId}/import`, {
      method: "POST",
      body: JSON.stringify({
        replace: false,
        rows: [{
          number,
          category,
          questionText,
          explanation,
          correctCount,
          options
        }]
      })
    });

    if (Array.isArray(result.errors) && result.errors.length) {
      showMessage(result.errors.join("\n"), "error");
      return;
    }

    const currentNumber = Number($("manualQuestionNumber")?.value || 0) || nextManualQuestionNumber(cache.questionCreatorQuestions || []);
    const currentCategory = $("manualQuestionCategory")?.value.trim() || "";

    showMessage("問題を作成しました。次の問題を入力できます。", "success");

    if (cache.currentScreen === "questionCreator") {
      const latest = await api(`/api/admin/question-sets/${setId}/questions`);
      cache.questionCreatorQuestions = latest.questions || [];
      renderManualQuestionCreator(cache.questionCreatorQuestions, {
        number: currentNumber + 1,
        category: currentCategory
      });
    } else {
      await selectAdminQuestionSet();
    }
  } catch (e) {
    showMessage(e.message, "error");
  }
}



function toApiDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error("公開期間の日付形式が正しくありません。");
  }

  // D1 / SQLite の CURRENT_TIMESTAMP と比較しやすいUTC形式に変換
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function getAssignmentPeriodPayload() {
  const availableFrom = toApiDateTime($("assignAvailableFrom")?.value || "");
  const availableUntil = toApiDateTime($("assignAvailableUntil")?.value || "");

  if (availableFrom && availableUntil && availableFrom > availableUntil) {
    throw new Error("公開終了日時は公開開始日時より後にしてください。");
  }

  return {
    availableFrom,
    availableUntil
  };
}

async function assignSetToOrg() {
  try {
    const period = getAssignmentPeriodPayload();

    await api("/api/admin/assignments", {
      method: "POST",
      body: JSON.stringify({
        questionSetId: $("assignSet").value,
        organizationId: $("assignOrg").value,
        ...period
      })
    });

    showMessage("企業へ問題集を割り当てました。", "success");
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function assignSetToUser() {
  try {
    const period = getAssignmentPeriodPayload();

    await api("/api/admin/assignments", {
      method: "POST",
      body: JSON.stringify({
        questionSetId: $("assignSet").value,
        userId: $("assignUser").value,
        ...period
      })
    });

    showMessage("受講者へ問題集を割り当てました。", "success");
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function importExcel() {
  const setId = $("adminSetSelect").value;
  const file = $("excelFile").files?.[0];
  if (!setId) return alert("問題集を選択してください。");
  if (!file) return alert("Excelファイルを選択してください。");
  if (!window.XLSX) return alert("Excelライブラリの読み込みに失敗しています。");

  const importButton = $("importButton");

  try {
    hideMessage();
    setImportProgress(1, "Excelを読み込み中", "ファイルをブラウザ側で解析しています。");
    if (importButton) importButton.disabled = true;

    const rows = await parseExcelFile(file);
    if (!rows.length) {
      setImportProgress(0, "インポート待機中", "取り込める問題がありません。", true);
      return alert("取り込める問題がありません。");
    }

    setImportProgress(15, "Excel解析完了", `${rows.length}件の問題を検出しました。`);
    await wait(120);

    const replace = confirm("既存問題を削除して置き換えますか？\nOK: 置き換え / キャンセル: 追加");

    const chunkSize = 25;
    const total = rows.length;
    let importedTotal = 0;
    const errors = [];

    for (let start = 0; start < total; start += chunkSize) {
      const chunk = rows.slice(start, start + chunkSize);
      const end = Math.min(start + chunk.length, total);
      const percent = Math.max(16, Math.round((end / total) * 80));

      setImportProgress(
        percent,
        "インポート中",
        `${end} / ${total} 件を送信中です。画面を閉じずにお待ちください。`
      );

      const result = await api(`/api/admin/question-sets/${setId}/import`, {
        method: "POST",
        body: JSON.stringify({
          replace: replace && start === 0,
          rows: chunk
        })
      });

      importedTotal += Number(result.imported || 0);
      if (Array.isArray(result.errors) && result.errors.length) {
        const adjustedErrors = result.errors.map((message) => {
          const match = String(message).match(/^(\d+)行目：(.*)$/);
          if (!match) return message;
          const originalLine = Number(match[1]);
          const actualLine = start + originalLine;
          return `${actualLine}行目：${match[2]}`;
        });
        errors.push(...adjustedErrors);
      }

      await wait(80);
    }

    setImportProgress(92, "一覧を更新中", "インポートした問題を再読み込みしています。");
    await selectAdminQuestionSet();

    if (errors.length) {
      setImportProgress(100, "インポート完了・一部エラーあり", `成功: ${importedTotal}件 / エラー: ${errors.length}件`);
      showMessage(`インポート完了。ただしエラーがあります。\n成功: ${importedTotal}件\n\n${errors.join("\n")}`, "error");
    } else {
      setImportProgress(100, "インポート完了", `成功: ${importedTotal}件`);
      showMessage(`インポート成功: ${importedTotal}件`, "success");
    }
  } catch (e) {
    setImportProgress(100, "インポート失敗", e.message, false, true);
    showMessage(e.message, "error");
  } finally {
    if (importButton) importButton.disabled = false;
  }
}

function setImportProgress(percent, title, detail, hideAfter = false, isError = false) {
  const box = $("importProgress");
  const titleEl = $("importProgressTitle");
  const percentEl = $("importProgressPercent");
  const barEl = $("importProgressBar");
  const detailEl = $("importProgressDetail");

  if (!box || !titleEl || !percentEl || !barEl || !detailEl) return;

  const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
  box.classList.remove("hidden");
  box.classList.toggle("error", !!isError);
  titleEl.textContent = title || "インポート中";
  percentEl.textContent = `${safePercent}%`;
  barEl.style.width = `${safePercent}%`;
  detailEl.textContent = detail || "";

  if (hideAfter) {
    setTimeout(() => box.classList.add("hidden"), 1800);
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function parseExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  return rawRows.map((row, index) => parseExcelRow(row, index + 2)).filter(Boolean);
}

function getCell(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return "";
}

function parseExcelRow(row, lineNo) {
  const questionText = String(getCell(row, ["問題文モンダイ", "問題文", "問題"]) || "").trim();
  if (!questionText) return null;

  const optionTexts = [
    getCell(row, ["選択肢１センタク", "選択肢1", "選択肢１"]),
    getCell(row, ["選択肢２センタク", "選択肢2", "選択肢２"]),
    getCell(row, ["選択肢３センタク", "選択肢3", "選択肢３"]),
    getCell(row, ["選択肢４センタク", "選択肢4", "選択肢４"])
  ].map(v => String(v || "").trim()).filter(Boolean);

  const answerRaw = String(getCell(row, ["解答カイトウ", "解答", "正解"]) || "").trim();
  const correctTokens = splitAnswers(answerRaw, optionTexts);
  const correctIndexes = resolveCorrectIndexes(correctTokens, optionTexts, lineNo);

  const correctCountCell = getCell(row, ["正答数セイト", "正答数", "正解数"]);
  const correctCount = Number(correctCountCell || correctIndexes.length || 1);

  if (correctCount !== correctIndexes.length) {
    throw new Error(`${lineNo}行目：正答数は${correctCount}ですが、解答に指定された正解は${correctIndexes.length}件です。`);
  }

  return {
    number: Number(getCell(row, ["番号バンゴウ", "番号", "No", "No."]) || lineNo - 1),
    category: String(getCell(row, ["分類ブンルイ", "分類", "カテゴリ"]) || "").trim(),
    questionText,
    explanation: String(getCell(row, ["解説カイセテゥ", "解説カイセツ", "解説"]) || "").trim(),
    correctCount,
    answerType: correctCount === 1 ? "single" : "multiple",
    options: optionTexts.map((text, i) => ({
      text,
      isCorrect: correctIndexes.includes(i)
    }))
  };
}

function splitAnswers(answerRaw, optionTexts = []) {
  if (!answerRaw) return [];

  const raw = String(answerRaw).trim();

  // 正解欄全体が選択肢と完全一致する場合は、カンマを区切り文字として扱わない。
  // 例: "Corporate owned, personally enabled (COPE)"
  const exactMatch = optionTexts.find(option => normalizeText(option) === normalizeText(raw));
  if (exactMatch) return [exactMatch];

  return raw
    .split(/[\n、，\/／]+/)
    .map(v => v.trim())
    .filter(Boolean);
}

function resolveCorrectIndexes(tokens, options, lineNo) {
  const indexes = [];
  const alphabet = { A: 0, B: 1, C: 2, D: 3, a: 0, b: 1, c: 2, d: 3 };

  for (const token of tokens) {
    let idx = -1;
    const normalized = token.replace(/\s/g, "");

    if (/^[1-4]$/.test(normalized)) idx = Number(normalized) - 1;
    else if (/^選択肢[1-4]$/.test(normalized)) idx = Number(normalized.replace("選択肢", "")) - 1;
    else if (alphabet[token] !== undefined) idx = alphabet[token];
    else idx = options.findIndex(o => normalizeText(o) === normalizeText(token));

    if (idx < 0 || idx >= options.length) {
      throw new Error(`${lineNo}行目：解答「${token}」が選択肢に見つかりません。`);
    }
    if (!indexes.includes(idx)) indexes.push(idx);
  }

  return indexes;
}

function normalizeText(text) {
  return String(text || "").trim().replace(/\s+/g, " ").toLowerCase();
}

async function clearImportedExcel() {
  const setId = $("adminSetSelect")?.value;
  if (!setId) return alert("問題集を選択してください。");

  const set = cache.questionSets.find(s => s.id === setId);
  const title = set?.title || "選択中の問題集";

  if (!confirm(`「${title}」にインポートされている問題を削除しますか？\n\n問題・選択肢・進捗・回答履歴が削除されます。\n問題集自体と企業/ユーザーへの割り当ては残ります。`)) return;

  await api(`/api/admin/question-sets/${setId}/clear-questions`, {
    method: "POST",
    body: "{}"
  });

  cache.categoriesBySet = {};
  cache.activeQuestion = null;
  showMessage("インポート済み問題を削除しました。問題集自体と割り当ては残っています。", "success");
  await selectAdminQuestionSet();
  cache.questionSets = [];
  await renderApp();
}

async function exportExcel() {
  const setId = $("adminSetSelect").value;
  if (!setId) return alert("問題集を選択してください。");
  if (!window.XLSX) return alert("Excelライブラリの読み込みに失敗しています。");

  const data = await api(`/api/admin/question-sets/${setId}/export`);
  const rows = data.rows || [];
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  const set = cache.questionSets.find(s => s.id === setId);
  const filename = `${safeFileName(set?.title || "question_set")}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

async function loadProgress() {
  const params = new URLSearchParams();

  const setId = $("progressSet")?.value || "";
  const orgId = $("progressOrg")?.value || "";
  const userId = $("progressUser")?.value || "";
  const query = $("progressUserQuery")?.value || "";

  if (setId) params.set("questionSetId", setId);
  if (orgId) params.set("organizationId", orgId);
  if (userId) params.set("userId", userId);
  if (query.trim()) params.set("query", query.trim());

  const data = await api(`/api/progress${params.toString() ? "?" + params.toString() : ""}`);
  $("progressList").innerHTML = tableHtml(
    ["受講者", "メールアドレス", "企業", "問題集", "問題数", "習得", "弱点", "回答数", "正答数", "正答率"],
    (data.progress || []).map(p => {
      const total = Number(p.total_answers || 0);
      const correct = Number(p.correct_answers || 0);
      const rate = total ? `${Math.round((correct / total) * 100)}%` : "-";
      return [
        escapeHtml(p.display_name || p.username),
        escapeHtml(p.username || ""),
        escapeHtml(p.organization_name || ""),
        escapeHtml(p.question_set_title || ""),
        p.question_count || 0,
        p.mastered_count || 0,
        p.weak_count || 0,
        total,
        correct,
        rate
      ];
    })
  );
}

async function loadAnswers() {
  const params = new URLSearchParams();

  const setId = $("answersSet")?.value || "";
  const orgId = $("answersOrg")?.value || "";
  const userId = $("answersUser")?.value || "";
  const query = $("answersUserQuery")?.value || "";

  if (setId) params.set("questionSetId", setId);
  if (orgId) params.set("organizationId", orgId);
  if (userId) params.set("userId", userId);
  if (query.trim()) params.set("query", query.trim());

  const data = await api(`/api/answers${params.toString() ? "?" + params.toString() : ""}`);
  $("answersList").innerHTML = tableHtml(
    ["日時", "受講者", "メールアドレス", "企業", "問題集", "問題", "結果", "回答", "正解"],
    (data.answers || []).map(a => [
      escapeHtml(a.answered_at),
      escapeHtml(a.display_name || a.username),
      escapeHtml(a.username || ""),
      escapeHtml(a.organization_name || ""),
      escapeHtml(a.question_set_title),
      escapeHtml(shorten(a.question_text, 50)),
      a.is_correct ? "正解" : "不正解",
      escapeHtml(a.selected_answer || ""),
      escapeHtml(a.correct_answer || "")
    ])
  );
}

function getStudentUsersForFilters() {
  return (cache.users || []).filter(u => (u.roles || "").includes("student") && Number(u.is_active) === 1);
}

function refreshProgressUserOptions() {
  const orgId = $("progressOrg")?.value || "";
  let users = getStudentUsersForFilters();
  if (orgId) users = users.filter(u => u.organization_id === orgId);
  fillSelect("progressUser", users, "id", "display_name", true);
}

function refreshAnswersUserOptions() {
  const orgId = $("answersOrg")?.value || "";
  let users = getStudentUsersForFilters();
  if (orgId) users = users.filter(u => u.organization_id === orgId);
  fillSelect("answersUser", users, "id", "display_name", true);
}

async function renderCompany() {
  const root = $("companyView");
  root.innerHTML = `
    <div class="two-col">
      <section class="card">
        <h2>自社受講者管理</h2>
        <p class="muted">自社に紐付く受講者のみ作成・検索・削除できます。</p>
        <label>メールアドレス</label>
        <input id="companyUsername" type="email" placeholder="student@example.com">
        <label>表示名</label>
        <input id="companyDisplayName">
        <label>初期パスワード</label>
        <input id="companyPassword" type="password">
        <button data-action="createCompanyStudent()">受講者を作成</button>

        <div class="filter-box">
          <h3>ユーザー検索・絞り込み</h3>
          <label>メールアドレス・表示名</label>
          <input id="companyUserSearchQuery" placeholder="例：student@example.com">
          <label>状態</label>
          <select id="companyUserSearchActive">
            <option value="active">有効</option>
            <option value="">全て</option>
            <option value="inactive">削除済み</option>
          </select>
          <button class="ghost" data-action="searchCompanyUsers()">検索</button>
        </div>

        <div id="companyUserList" class="table-wrap"></div>
      </section>
      ${progressCard()}
    </div>
    <div class="two-col">
      ${answersCard()}
      ${ticketsCard("自社お問い合わせ")}
    </div>
  `;
  const [users, sets] = await Promise.all([loadUsers(), loadQuestionSets()]);
  const studentUsers = users.filter(u => (u.roles || "").includes("student"));

  fillSelect("progressSet", sets, "id", "title", true);
  fillSelect("answersSet", sets, "id", "title", true);
  fillSelect("progressUser", studentUsers, "id", "display_name", true);
  fillSelect("answersUser", studentUsers, "id", "display_name", true);

  renderCompanyUserList(users);
  await loadTickets();
}

function renderCompanyUserList(users) {
  $("companyUserList").innerHTML = tableHtml(["メールアドレス", "表示名", "ロール", "2FA", "状態", "操作"], users.map(u => [
    escapeHtml(u.username),
    escapeHtml(u.display_name),
    escapeHtml(u.roles || ""),
    u.two_factor_enabled ? "有効" : "未設定",
    u.is_active ? "有効" : "削除済み",
    u.is_active ? rawHtml(`<button class="mini danger" data-action="deleteUser('${actionArg(u.id)}')">削除</button>`) : ""
  ]));
}

async function searchCompanyUsers() {
  try {
    const users = await loadUsers({
      query: $("companyUserSearchQuery")?.value || "",
      active: $("companyUserSearchActive")?.value || "active",
      role: "student"
    });
    renderCompanyUserList(users);
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function createCompanyStudent() {
  await api("/api/company/users", {
    method: "POST",
    body: JSON.stringify({
      username: $("companyUsername").value,
      displayName: $("companyDisplayName").value,
      password: $("companyPassword").value
    })
  });
  cache.users = [];
  showMessage("自社受講者を作成しました。", "success");
  await renderApp();
}

async function renderStudent() {
  if (cache.currentScreen === "studentQuiz") {
    await renderStudentQuizScreen();
    return;
  }

  const root = $("studentView");
  root.innerHTML = `
    <section class="card">
      <div class="section-title-row">
        <div>
          <h2>割り当てられている問題集</h2>
          <p class="muted">学習する問題集を選択してください。選択後、問題だけの画面に移動します。</p>
        </div>
      </div>
      <div id="studentQuestionSetCards" class="question-set-grid"></div>
    </section>
  `;

  const sets = await loadQuestionSets();
  const box = $("studentQuestionSetCards");

  if (!sets.length) {
    box.innerHTML = `<p class="muted">割り当てられている問題集がありません。</p>`;
    return;
  }

  box.innerHTML = sets.map(set => `
    <article class="question-set-card">
      <div>
        <span class="pill">${escapeHtml(set.category || "未分類")}</span>
        <h3>${escapeHtml(set.title)}</h3>
        <p>${escapeHtml(set.description || "説明はありません。")}</p>
        <p class="muted">問題数：${Number(set.question_count || 0)}問</p>
      </div>
      <button data-action="startQuestionSet('${set.id}')">この問題集を解く</button>
    </article>
  `).join("");
}

async function startQuestionSet(questionSetId) {
  const sets = await loadQuestionSets();
  const set = sets.find(s => s.id === questionSetId);

  cache.activeQuestionSetId = questionSetId;
  cache.activeQuestionSetTitle = set?.title || "";
  cache.activeCategory = "";
  cache.currentScreen = "studentQuiz";
  cache.activeQuestion = null;

  await renderApp();
}

async function backToQuestionSetList() {
  cache.currentScreen = "main";
  cache.activeQuestion = null;
  await renderApp();
}

async function renderStudentQuizScreen() {
  const root = $("studentView");
  const setId = cache.activeQuestionSetId;
  const categories = await loadQuestionSetCategories(setId);

  root.innerHTML = `
    <section class="card quiz-screen-card">
      <div class="quiz-topbar">
        <div>
          <button class="ghost mini" data-action="backToQuestionSetList()">← 問題集一覧へ戻る</button>
          <h2>${escapeHtml(cache.activeQuestionSetTitle || "問題")}</h2>
          <p class="muted">出題順は完全ランダムです。3回連続正解済みの問題は出題対象から除外され、不正解の場合は連続正解数が0に戻ります。</p>
        </div>
        <div class="quiz-controls random-only-controls">
          <div>
            <label>分野</label>
            <select id="studentCategorySelect" data-change="changeStudentCategory()">
              <option value="">全分野</option>
              ${categories.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.category)}（${c.count}問）</option>`).join("")}
            </select>
          </div>
          <button data-action="loadQuiz()">ランダムに出題</button>
        </div>
      </div>

      <div id="quizBox" class="quiz-only-box">
        <p class="muted">分野を選び、「ランダムに出題」を押してください。</p>
      </div>
    </section>
  `;

  $("studentCategorySelect").value = cache.activeCategory || "";
  await loadQuiz();
}

function changeStudentCategory() {
  cache.activeCategory = $("studentCategorySelect").value;
  cache.activeQuestion = null;
  loadQuiz();
}

async function loadQuiz() {
  const setId = cache.activeQuestionSetId || $("studentSetSelect")?.value;
  const category = $("studentCategorySelect")?.value || cache.activeCategory || "";

  if (!setId) return alert("問題集を選択してください。");
  cache.activeQuestionSetId = setId;
  cache.activeCategory = category;

  const params = new URLSearchParams({
    questionSetId: setId
  });
  if (category) params.set("category", category);

  const data = await api(`/api/quiz?${params.toString()}`);
  cache.activeQuestion = data.question;

  if (!data.question) {
    $("quizBox").innerHTML = `
      <div class="empty-quiz">
        <p>${escapeHtml(data.message || "出題対象の問題がありません。")}</p>
        <p class="muted">3回連続正解済みの問題は出題対象から除外されます。別の分野を選ぶか、進捗を確認してください。</p>
      </div>
    `;
    return;
  }

  const q = data.question;
  const inputType = q.answerType === "multiple" ? "checkbox" : "radio";
  $("quizBox").innerHTML = `
    <div class="quiz-question-header">
      <div>
        <span class="pill">${escapeHtml(q.category || "未分類")}</span>
        <span class="pill">${q.answerType === "multiple" ? "複数選択" : "単一選択"}</span>
        <span class="pill">正答数 ${q.correctCount}</span>
        <span class="pill">連続正解 ${Number(q.correctStreak || 0)} / 3</span>
      </div>
      <button class="ghost mini" data-action="createQuestionTicket()">この問題について問い合わせ</button>
    </div>

    <div class="question-title markdown-preview quiz-markdown">${renderMarkdownPreview(q.questionText)}</div>

    <div class="quiz-options">
      ${q.options.map(o => `
        <label class="option-row large-option" data-option-id="${escapeHtml(o.id)}">
          <input type="${inputType}" name="answerOption" value="${escapeHtml(o.id)}">
          <span class="quiz-option-text markdown-preview">${renderMarkdownPreview(o.text)}</span>
        </label>
      `).join("")}
    </div>

    <div class="quiz-action-row">
      <button id="submitAnswerButton" data-action="submitAnswer()">回答する</button>
      <button class="ghost" data-action="loadQuiz()">スキップ</button>
    </div>

    <div id="answerResult"></div>
  `;
}


function highlightAnswerOptions(correctOptions, selectedOptionIds) {
  const correctOptionIds = (correctOptions || []).map((option) => String(option.id));
  const selectedIds = (selectedOptionIds || []).map(String);

  const correctSet = new Set(correctOptionIds);
  const selectedSet = new Set(selectedIds);

  document.querySelectorAll(".option-row[data-option-id]").forEach((row) => {
    const optionId = String(row.dataset.optionId || "");
    const input = row.querySelector('input[name="answerOption"]');

    row.classList.remove("option-correct", "option-wrong", "option-unselected");

    if (correctSet.has(optionId)) {
      // 正解の選択肢は緑
      row.classList.add("option-correct");
    } else if (selectedSet.has(optionId)) {
      // 選んだが不正解だった選択肢は赤
      row.classList.add("option-wrong");
    } else {
      row.classList.add("option-unselected");
    }

    if (input) input.disabled = true;
  });
}

async function submitAnswer() {
  const q = cache.activeQuestion;
  if (!q) return alert("問題が選択されていません。");

  const selectedOptionIds = Array.from(document.querySelectorAll('input[name="answerOption"]:checked'))
    .map((input) => input.value);

  if (selectedOptionIds.length === 0) {
    alert("回答を選択してください。");
    return;
  }

  if (q.answerType === "single" && selectedOptionIds.length !== 1) {
    alert("この問題は1つだけ選択してください。");
    return;
  }

  if (q.answerType === "multiple" && selectedOptionIds.length !== Number(q.correctCount || 0)) {
    alert(`この問題は${q.correctCount}個選択してください。`);
    return;
  }

  const submitButton = $("submitAnswerButton");
  if (submitButton) submitButton.disabled = true;

  try {
    const data = await api("/api/answer", {
      method: "POST",
      body: JSON.stringify({
        questionId: q.id,
        selectedOptionIds,
        mode: "random"
      })
    });

    const progress = data.progress || {};
    const correctStreak = Number(progress.correctStreak || 0);
    const mastered = Number(progress.mastered || 0) === 1;
    const resultClass = data.isCorrect ? "success" : "error";
    const resultTitle = data.isCorrect ? "正解です。" : "不正解です。";
    const streakMessage = data.isCorrect
      ? `連続正解数：${correctStreak} / 3`
      : "連続正解数：0 / 3";
    const masteredMessage = mastered
      ? "3回連続正解したため、次回からこの問題は出題対象から除外されます。"
      : "";

    highlightAnswerOptions(data.correctOptions || [], selectedOptionIds);

    const resultBox = $("answerResult");
    if (resultBox) {
      resultBox.innerHTML = `
        <div class="result-box ${resultClass}">
          <p><strong>${resultTitle}</strong></p>
          <p>${escapeHtml(streakMessage)}</p>
          ${masteredMessage ? `<p class="muted">${escapeHtml(masteredMessage)}</p>` : ""}
          <div class="answer-summary-block">
            <strong>あなたの回答：</strong>
            <div class="markdown-preview">${renderMarkdownPreview(data.selectedAnswer || "未選択")}</div>
          </div>
          <div class="answer-summary-block">
            <strong>正解：</strong>
            <div class="markdown-preview">${renderMarkdownPreview(data.correctAnswer || "")}</div>
          </div>
          ${data.explanation ? `<div class="answer-summary-block"><strong>解説：</strong><div class="markdown-preview explanation-preview">${renderMarkdownPreview(data.explanation)}</div></div>` : ""}
          <button data-action="loadQuiz()">次の問題へ</button>
        </div>
      `;
    }
  } catch (e) {
    if (submitButton) submitButton.disabled = false;
    showMessage(e.message, "error");
  }
}

async function createQuestionTicket() {
  const q = cache.activeQuestion;
  if (!q) return alert("問題が選択されていません。");
  const body = prompt("問い合わせ内容を入力してください。", "問題文または解答に誤りがある可能性があります。");
  if (!body) return;

  await api("/api/tickets", {
    method: "POST",
    body: JSON.stringify({
      title: `問題 #${q.number || ""} に関する問い合わせ`,
      message: body,
      questionSetId: q.questionSetId,
      questionId: q.id,
      priority: "normal"
    })
  });
  showMessage("お問い合わせを送信しました。", "success");
}

async function createTicket() {
  try {
    await api("/api/tickets", {
      method: "POST",
      body: JSON.stringify({
        title: $("ticketTitle").value,
        message: $("ticketBody").value,
        priority: $("ticketPriority").value
      })
    });
    $("ticketTitle").value = "";
    $("ticketBody").value = "";
    showMessage("チケットを起票しました。", "success");
    await loadTickets();
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function loadTickets() {
  const status = $("ticketStatus")?.value || "all";
  const data = await api(`/api/tickets?status=${encodeURIComponent(status)}`);
  const list = $("ticketList");
  if (!list) return;

  const tickets = data.tickets || [];
  if (!tickets.length) {
    list.innerHTML = `<p class="muted">チケットはありません。</p>`;
    return;
  }

  list.innerHTML = tickets.map(t => `
    <div class="card card-flat mt-12">
      <div class="button-list">
        <span class="pill ${t.status}">${ticketStatusLabel(t.status)}</span>
        <strong>${escapeHtml(t.title)}</strong>
      </div>
      <p class="muted">
        ${escapeHtml(t.created_at)} /
        ${escapeHtml(t.created_by_name || t.created_by_username || "")}
        ${t.organization_name ? " / " + escapeHtml(t.organization_name) : ""}
        ${t.question_set_title ? " / " + escapeHtml(t.question_set_title) : ""}
      </p>
      <div class="button-list">
        <button class="ghost mini" data-action="toggleTicket('${t.id}')">詳細</button>
        ${t.status !== "closed" ? `<button class="danger mini" data-action="closeTicket('${t.id}')">クローズ</button>` : ""}
      </div>
      <div id="ticketDetail-${t.id}" class="hidden"></div>
    </div>
  `).join("");
}

function ticketStatusLabel(status) {
  return { open: "未対応", answered: "回答済み", closed: "クローズ" }[status] || status;
}

async function toggleTicket(ticketId) {
  const box = $(`ticketDetail-${ticketId}`);
  if (!box) return;
  if (!box.classList.contains("hidden")) {
    box.classList.add("hidden");
    return;
  }
  const data = await api(`/api/tickets/${ticketId}/comments`);
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="ticket-detail">
      ${(data.comments || []).map(c => `
        <div class="comment">
          <div class="comment-meta">${escapeHtml(c.display_name || c.username)} / ${escapeHtml(c.created_at)}</div>
          <div>${escapeHtml(c.body)}</div>
        </div>
      `).join("")}
      ${data.ticket.status !== "closed" ? `
        <textarea id="reply-${ticketId}" rows="3" placeholder="返信内容"></textarea>
        <div class="button-list">
          <button class="mini" data-action="replyTicket('${ticketId}')">返信</button>
          <button class="danger mini" data-action="closeTicket('${ticketId}')">クローズ</button>
        </div>
      ` : `<p class="muted">このチケットはクローズ済みです。</p>`}
    </div>
  `;
}

async function replyTicket(ticketId) {
  const message = $(`reply-${ticketId}`).value;
  await api(`/api/tickets/${ticketId}/comments`, {
    method: "POST",
    body: JSON.stringify({ message })
  });
  showMessage("返信しました。", "success");
  await toggleTicket(ticketId);
  await toggleTicket(ticketId);
}

async function closeTicket(ticketId) {
  if (!confirm("このチケットをクローズしますか？")) return;
  await api(`/api/tickets/${ticketId}/close`, { method: "POST", body: "{}" });
  showMessage("チケットをクローズしました。", "success");
  await loadTickets();
}

function safeCellHtml(cell) {
  if (cell instanceof TrustedHtml) {
    return cell.value;
  }

  return escapeHtml(cell);
}

function tableHtml(headers, rows) {
  if (!rows || rows.length === 0) return `<p class="muted">データがありません。</p>`;
  return `
    <table>
      <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map(row => `<tr>${row.map(cell => `<td>${safeCellHtml(cell)}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

class TrustedHtml {
  constructor(value) {
    this.value = String(value ?? "");
  }
}

function rawHtml(value) {
  return new TrustedHtml(value);
}

function actionArg(value) {
  return String(value ?? "").replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function shorten(text, max) {
  const s = String(text || "");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function safeFileName(name) {
  return String(name || "file").replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-toggle-password]");
  if (!target) return;
  const input = $(target.dataset.togglePassword);
  if (!input) return;
  input.type = input.type === "password" ? "text" : "password";
  target.textContent = input.type === "password" ? "表示" : "非表示";
});

if ($("loginButton")) $("loginButton").addEventListener("click", login);
if ($("twoFactorLoginButton")) $("twoFactorLoginButton").addEventListener("click", loginTwoFactor);
if ($("cancelTwoFactorButton")) $("cancelTwoFactorButton").addEventListener("click", cancelTwoFactorLogin);

renderApp();
