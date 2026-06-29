const API_BASE = "https://cct-english-api.tkm12325.workers.dev";
const STORAGE_KEY = "cct.quiz.enterprise.session.v2";

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
  twoFactorSetup: null
};

function $(id) {
  return document.getElementById(id);
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveSession() {
  if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else localStorage.removeItem(STORAGE_KEY);
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
  let url = `${API_BASE}${path}`;
  const init = { ...options };
  const headers = { ...(options.headers || {}) };

  if (session?.token) {
    const sep = url.includes("?") ? "&" : "?";
    url += `${sep}token=${encodeURIComponent(session.token)}&role=${encodeURIComponent(session.role || session.roles?.[0] || "student")}`;
  }

  if (init.body !== undefined && !headers["Content-Type"]) {
    headers["Content-Type"] = "text/plain;charset=UTF-8";
  }

  const response = await fetch(url, { ...init, headers });
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
    throw new Error(data.error || `API error: ${response.status}`);
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
      <button class="mini ghost" onclick="showTwoFactorView()">2FA設定</button>
      <button class="mini ghost" onclick="showContactView()">お問い合わせ</button>
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
    if ((session.roles || []).length > 1) return renderRoleChooser();
    session.role = session.roles?.[0] || "student";
    saveSession();
  }

  setView("app");
  renderSession();
  hideMessage();

  $("roleNav").innerHTML = `
    <button class="ghost" onclick="reloadAll()">再読み込み</button>
    ${(session.roles || []).map((r) => `<button class="${session.role === r ? "" : "ghost"}" onclick="switchRole('${r}')">${roleLabel(r)}</button>`).join("")}
    <button class="danger" onclick="logout()">ログアウト</button>
  `;

  const isContact = cache.currentScreen === "contact";
  const isTwoFactor = cache.currentScreen === "twoFactor";
  $("adminView").classList.toggle("hidden", isContact || isTwoFactor || session.role !== "admin");
  $("companyView").classList.toggle("hidden", isContact || isTwoFactor || session.role !== "company_manager");
  $("studentView").classList.toggle("hidden", isContact || isTwoFactor || session.role !== "student");
  $("contactView").classList.toggle("hidden", !isContact);
  $("twoFactorView").classList.toggle("hidden", !isTwoFactor);

  if (isContact) {
    await renderContactView();
    return;
  }

  if (isTwoFactor) {
    await renderTwoFactorView();
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
        <button class="ghost" onclick="goMainView()">戻る</button>
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
        <button onclick="createContactTicket()">送信する</button>
        <button class="ghost" onclick="loadContactTickets()">過去のお問い合わせを表示</button>
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
      <button class="mini ghost" onclick="toggleTicket('${t.id}')">詳細</button>
      <div id="ticketDetail-${t.id}" class="hidden"></div>
    </div>
  `).join("");
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
    <section class="card contact-card">
      <div class="section-title-row">
        <div>
          <h2>2要素認証設定</h2>
          <p class="muted">ログイン時に、登録メールアドレスへ6桁の認証コードを送信します。</p>
        </div>
        <button class="ghost" onclick="goMainView()">戻る</button>
      </div>

      <div class="status-box">
        現在の状態：
        <span class="pill ${enabled ? "open" : "closed"}">${enabled ? "有効" : "未設定"}</span>
      </div>

      ${enabled ? `
        <p class="muted">2要素認証は有効です。無効化する場合は、メールで届く6桁コードを入力してください。</p>
        <button onclick="requestDisableTwoFactorCode()">無効化コードをメール送信</button>
        <div id="disableTwoFactorBox"></div>
      ` : `
        <ol class="two-factor-steps">
          <li>「確認コードをメール送信」を押します。</li>
          <li>登録メールアドレスに届いた6桁コードを確認します。</li>
          <li>6桁コードを入力して2要素認証を有効化します。</li>
        </ol>
        <button onclick="startTwoFactorSetup()">確認コードをメール送信</button>
        <div id="twoFactorSetupBox"></div>
      `}
    </section>
  `;
}

async function startTwoFactorSetup() {
  try {
    const data = await api("/api/me/2fa/setup", {
      method: "POST",
      body: "{}"
    });
    cache.twoFactorSetup = data;

    const box = $("twoFactorSetupBox");
    box.innerHTML = `
      <div class="result-box">
        <p><strong>確認コードをメールで送信しました。</strong></p>
        <p class="muted">送信先：${escapeHtml(session.username)}</p>
        <p class="muted">有効期限は10分です。</p>
        <label>メールに届いた6桁コード</label>
        <input id="confirmTwoFactorCode" inputmode="numeric" maxlength="6" placeholder="123456">
        <button onclick="confirmTwoFactor()">有効化する</button>
      </div>
    `;
  } catch (e) {
    showMessage(e.message, "error");
  }
}

async function confirmTwoFactor() {
  try {
    if (!cache.twoFactorSetup?.codeId) {
      alert("確認コードの送信情報がありません。もう一度コードを送信してください。");
      return;
    }

    await api("/api/me/2fa/confirm", {
      method: "POST",
      body: JSON.stringify({
        codeId: cache.twoFactorSetup.codeId,
        code: $("confirmTwoFactorCode").value
      })
    });
    cache.twoFactorSetup = null;
    showMessage("2要素認証を有効化しました。次回ログインからメール認証コードが必要です。", "success");
    await renderTwoFactorView();
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
        <button class="danger" onclick="disableTwoFactor()">2要素認証を無効化</button>
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
  cache = { organizations: [], users: [], questionSets: [], activeQuestion: null, activeQuestionSetId: cache.activeQuestionSetId };
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
      twoFactorEnabled: !!data.twoFactorEnabled
    };
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
        code: $("twoFactorCode").value
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
      twoFactorEnabled: !!data.twoFactorEnabled
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
  note.textContent = `${data.username} に認証コードを送信しました。有効期限は10分です。`;
}

async function loadOrganizations() {
  if (cache.organizations.length) return cache.organizations;
  const data = await api("/api/admin/organizations");
  cache.organizations = data.organizations || [];
  return cache.organizations;
}

async function loadUsers() {
  if (cache.users.length) return cache.users;
  const endpoint = session.role === "company_manager" ? "/api/company/users" : "/api/admin/users";
  const data = await api(endpoint);
  cache.users = data.users || [];
  return cache.users;
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
      <button onclick="createOrganization()">企業を作成</button>
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
      <button onclick="createUser()">ユーザーを作成</button>
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
      <button onclick="createQuestionSet()">問題集を作成</button>

      <label>問題集選択</label>
      <select id="adminSetSelect" onchange="selectAdminQuestionSet()"></select>

      <div class="file-row">
        <div>
          <label>Excelインポート</label>
          <input id="excelFile" type="file" accept=".xlsx,.xls">
        </div>
        <button id="importButton" onclick="importExcel()">インポート</button>
        <button class="ghost" onclick="exportExcel()">エクスポート</button>
      </div>

      <div id="importProgress" class="import-progress hidden">
        <div class="import-progress-header">
          <strong id="importProgressTitle">インポート準備中</strong>
          <span id="importProgressPercent">0%</span>
        </div>
        <div class="progress-bar">
          <div id="importProgressBar" class="progress-bar-fill" style="width:0%"></div>
        </div>
        <p id="importProgressDetail" class="muted">待機中</p>
      </div>

      <div class="button-list">
        <button class="ghost" onclick="editQuestionSet()">問題集を編集</button>
        <button class="danger" onclick="deleteQuestionSet()">問題集を削除</button>
      </div>

      <div id="questionList" class="table-wrap"></div>
    </section>
  `;
}

function assignmentCard() {
  return `
    <section class="card">
      <h2>問題集割り当て</h2>
      <label>問題集</label>
      <select id="assignSet"></select>
      <label>企業に割り当て</label>
      <select id="assignOrg"></select>
      <button onclick="assignSetToOrg()">企業へ割り当て</button>
      <label>受講者に個別割り当て</label>
      <select id="assignUser"></select>
      <button class="ghost" onclick="assignSetToUser()">受講者へ割り当て</button>
      <p class="muted">通常は企業単位の割り当てで十分です。個別割り当ては例外対応用です。</p>
    </section>
  `;
}

function progressCard() {
  return `
    <section class="card">
      <h2>進捗確認</h2>
      <label>問題集</label>
      <select id="progressSet"></select>
      <button onclick="loadProgress()">進捗を表示</button>
      <div id="progressList" class="table-wrap"></div>
    </section>
  `;
}

function answersCard() {
  return `
    <section class="card">
      <h2>回答履歴</h2>
      <label>問題集</label>
      <select id="answersSet"></select>
      <button onclick="loadAnswers()">回答履歴を表示</button>
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
        <button onclick="createTicket()">チケット起票</button>
        <button class="ghost" onclick="loadTickets()">チケット一覧を更新</button>
      </div>
      <div id="ticketList"></div>
    </section>
  `;
}

async function fillAdminData() {
  const [orgs, users, sets] = await Promise.all([loadOrganizations(), loadUsers(), loadQuestionSets()]);
  fillSelect("newUserOrg", orgs, "id", "name", true);
  fillSelect("adminSetSelect", sets, "id", "title", true);
  fillSelect("assignSet", sets, "id", "title", true);
  fillSelect("assignOrg", orgs, "id", "name", true);
  fillSelect("assignUser", users.filter(u => (u.roles || "").includes("student")), "id", "display_name", true);
  fillSelect("progressSet", sets, "id", "title", true);
  fillSelect("answersSet", sets, "id", "title", true);

  renderOrganizationList(orgs);
  renderUserList(users);
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
    `<button class="mini ghost" onclick="editOrganization('${o.id}')">編集</button>
     <button class="mini danger" onclick="deleteOrganization('${o.id}')">無効化</button>`
  ]));
}

function renderUserList(users) {
  $("userList").innerHTML = tableHtml(["メールアドレス", "表示名", "企業", "ロール", "2FA", "状態"], users.map(u => [
    escapeHtml(u.username),
    escapeHtml(u.display_name),
    escapeHtml(u.organization_name || ""),
    String(u.roles || "").split(",").filter(Boolean).map(r => `<span class="pill">${roleLabel(r)}</span>`).join(""),
    u.two_factor_enabled ? "有効" : "未設定",
    u.is_active ? "有効" : "無効"
  ]));
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

async function editQuestionSet() {
  const id = $("adminSetSelect").value;
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
  await renderApp();
}

async function deleteQuestionSet() {
  const id = $("adminSetSelect").value;
  if (!id) return alert("問題集を選択してください。");
  if (!confirm("この問題集を無効化しますか？")) return;
  await api(`/api/admin/question-sets/${id}/delete`, { method: "POST", body: "{}" });
  cache.questionSets = [];
  await renderApp();
}

async function selectAdminQuestionSet() {
  const id = $("adminSetSelect")?.value;
  if (!id) {
    if ($("questionList")) $("questionList").innerHTML = `<p class="muted">問題集を選択してください。</p>`;
    return;
  }
  const data = await api(`/api/admin/question-sets/${id}/questions`);
  $("questionList").innerHTML = tableHtml(
    ["番号", "分類", "問題文", "形式", "正答数", "選択肢"],
    (data.questions || []).map(q => [
      q.number || "",
      escapeHtml(q.category || ""),
      escapeHtml(shorten(q.question_text, 80)),
      q.answer_type === "multiple" ? "チェックボックス" : "ラジオ",
      q.correct_count,
      q.options.map(o => `${o.is_correct ? "✅ " : ""}${escapeHtml(shorten(o.option_text, 28))}`).join("<br>")
    ])
  );
}

async function assignSetToOrg() {
  await api("/api/admin/assignments", {
    method: "POST",
    body: JSON.stringify({ questionSetId: $("assignSet").value, organizationId: $("assignOrg").value })
  });
  showMessage("企業へ問題集を割り当てました。", "success");
}

async function assignSetToUser() {
  await api("/api/admin/assignments", {
    method: "POST",
    body: JSON.stringify({ questionSetId: $("assignSet").value, userId: $("assignUser").value })
  });
  showMessage("受講者へ問題集を割り当てました。", "success");
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
  const setId = $("progressSet")?.value || "";
  const qs = setId ? `?questionSetId=${encodeURIComponent(setId)}` : "";
  const data = await api(`/api/progress${qs}`);
  $("progressList").innerHTML = tableHtml(
    ["受講者", "企業", "問題集", "問題数", "習得", "弱点", "回答数", "正答数"],
    (data.progress || []).map(p => [
      escapeHtml(p.display_name || p.username),
      escapeHtml(p.organization_name || ""),
      escapeHtml(p.question_set_title || ""),
      p.question_count || 0,
      p.mastered_count || 0,
      p.weak_count || 0,
      p.total_answers || 0,
      p.correct_answers || 0
    ])
  );
}

async function loadAnswers() {
  const setId = $("answersSet")?.value || "";
  const qs = setId ? `?questionSetId=${encodeURIComponent(setId)}` : "";
  const data = await api(`/api/answers${qs}`);
  $("answersList").innerHTML = tableHtml(
    ["日時", "受講者", "問題集", "問題", "結果", "回答", "正解"],
    (data.answers || []).map(a => [
      escapeHtml(a.answered_at),
      escapeHtml(a.display_name || a.username),
      escapeHtml(a.question_set_title),
      escapeHtml(shorten(a.question_text, 50)),
      a.is_correct ? "正解" : "不正解",
      escapeHtml(a.selected_answer || ""),
      escapeHtml(a.correct_answer || "")
    ])
  );
}

async function renderCompany() {
  const root = $("companyView");
  root.innerHTML = `
    <div class="two-col">
      <section class="card">
        <h2>自社受講者管理</h2>
        <p class="muted">自社に紐付く受講者のみ作成・確認できます。</p>
        <label>メールアドレス</label>
        <input id="companyUsername" type="email" placeholder="student@example.com">
        <label>表示名</label>
        <input id="companyDisplayName">
        <label>初期パスワード</label>
        <input id="companyPassword" type="password">
        <button onclick="createCompanyStudent()">受講者を作成</button>
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
  fillSelect("progressSet", sets, "id", "title", true);
  fillSelect("answersSet", sets, "id", "title", true);
  $("companyUserList").innerHTML = tableHtml(["メールアドレス", "表示名", "ロール", "2FA", "状態"], users.map(u => [
    escapeHtml(u.username),
    escapeHtml(u.display_name),
    escapeHtml(u.roles || ""),
    u.two_factor_enabled ? "有効" : "未設定",
    u.is_active ? "有効" : "無効"
  ]));
  await loadTickets();
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
      <button onclick="startQuestionSet('${set.id}')">この問題集を解く</button>
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
          <button class="ghost mini" onclick="backToQuestionSetList()">← 問題集一覧へ戻る</button>
          <h2>${escapeHtml(cache.activeQuestionSetTitle || "問題")}</h2>
        </div>
        <div class="quiz-controls">
          <div>
            <label>分野</label>
            <select id="studentCategorySelect" onchange="changeStudentCategory()">
              <option value="">全分野</option>
              ${categories.map(c => `<option value="${escapeHtml(c.category)}">${escapeHtml(c.category)}（${c.count}問）</option>`).join("")}
            </select>
          </div>
          <div>
            <label>出題モード</label>
            <select id="quizMode">
              <option value="learning">未習得</option>
              <option value="weak">弱点</option>
              <option value="all">全て</option>
              <option value="mastered">習得済み</option>
            </select>
          </div>
          <button onclick="loadQuiz()">問題を表示</button>
        </div>
      </div>

      <div id="quizBox" class="quiz-only-box">
        <p class="muted">分野と出題モードを選び、「問題を表示」を押してください。</p>
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
  const mode = $("quizMode")?.value || "learning";
  const category = $("studentCategorySelect")?.value || cache.activeCategory || "";

  if (!setId) return alert("問題集を選択してください。");
  cache.activeQuestionSetId = setId;
  cache.activeCategory = category;

  const params = new URLSearchParams({
    questionSetId: setId,
    mode
  });
  if (category) params.set("category", category);

  const data = await api(`/api/quiz?${params.toString()}`);
  cache.activeQuestion = data.question;

  if (!data.question) {
    $("quizBox").innerHTML = `
      <div class="empty-quiz">
        <p>${escapeHtml(data.message || "対象の問題がありません。")}</p>
        <p class="muted">別の分野または出題モードを選んでください。</p>
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
      </div>
      <button class="ghost mini" onclick="createQuestionTicket()">この問題について問い合わせ</button>
    </div>

    <p class="question-title">${escapeHtml(q.questionText)}</p>

    <div class="quiz-options">
      ${q.options.map(o => `
        <label class="option-row large-option">
          <input type="${inputType}" name="answerOption" value="${o.id}">
          <span>${escapeHtml(o.text)}</span>
        </label>
      `).join("")}
    </div>

    <div class="quiz-action-row">
      <button onclick="submitAnswer()">回答する</button>
      <button class="ghost" onclick="loadQuiz()">スキップ</button>
    </div>

    <div id="answerResult"></div>
  `;
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
    <div class="card" style="box-shadow:none;margin-top:12px;">
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
        <button class="ghost mini" onclick="toggleTicket('${t.id}')">詳細</button>
        ${t.status !== "closed" ? `<button class="danger mini" onclick="closeTicket('${t.id}')">クローズ</button>` : ""}
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
          <button class="mini" onclick="replyTicket('${ticketId}')">返信</button>
          <button class="danger mini" onclick="closeTicket('${ticketId}')">クローズ</button>
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

function tableHtml(headers, rows) {
  if (!rows || rows.length === 0) return `<p class="muted">データがありません。</p>`;
  return `
    <table>
      <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map(row => `<tr>${row.map(cell => `<td>${cell ?? ""}</td>`).join("")}</tr>`).join("")}
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
