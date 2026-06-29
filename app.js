const SESSION_KEY = "cctEnglishMulti.session.v1";
const API_BASE = "https://cct-english-api.tkm12325.workers.dev";
const MASTER_STREAK = 3;

const $ = (id) => document.getElementById(id);

let session = loadSession();
let pendingLogin = null;
let currentQuestion = null;
let answered = false;

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  applySession();
});

function apiBase() {
  return API_BASE;
}

function saveApiBase() {
  // API URL is fixed in the source code.
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}

function saveSession(value) {
  session = value;
  if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else localStorage.removeItem(SESSION_KEY);
}

async function api(path, options = {}) {
  const base = apiBase();
  if (!base) throw new Error("API URLを入力してください。");

  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };

  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
    headers["X-CCT-Role"] = session.role;
  }

  const response = await fetch(`${base}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) throw new Error(data.error || `API error: ${response.status}`);
  return data;
}

function bindEvents() {
  document.addEventListener("click", togglePasswordVisibility);
  $("loginBtn").addEventListener("click", login);
  $("loginPassword").addEventListener("keydown", (event) => { if (event.key === "Enter") login(); });
  $("setupBtn").addEventListener("click", setupAdmin);
  $("roleOptions").addEventListener("click", selectRole);
  $("backToLoginBtn").addEventListener("click", () => {
    pendingLogin = null;
    $("roleScreen").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
  });

  $("logoutBtn").addEventListener("click", logout);
  $("switchRoleBtn").addEventListener("click", showRoleSelectFromSession);

  ["categoryFilter", "studyFilter", "questionMode"].forEach((id) => $(id).addEventListener("change", nextQuestion));
  $("choiceOptions").addEventListener("click", answerQuestion);
  $("nextChoiceBtn").addEventListener("click", nextQuestion);

  $("createUserBtn").addEventListener("click", createUser);
  $("refreshUsersBtn").addEventListener("click", loadUsers);
  $("refreshWordsBtn").addEventListener("click", loadAdminWords);
  $("wordSearch").addEventListener("input", debounce(loadAdminWords, 300));
  $("saveEditBtn").addEventListener("click", saveWordEdit);
  $("clearEditBtn").addEventListener("click", clearEditForm);

  $("wordList").addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit]");
    if (edit) startEdit(edit.dataset.edit);
  });
}

async function setupAdmin() {
  try {
    saveApiBase();
    const result = await api("/api/setup", {
      method: "POST",
      body: JSON.stringify({
        setupKey: $("setupKey").value,
        username: $("setupUsername").value,
        displayName: $("setupDisplayName").value,
        password: $("setupPassword").value
      })
    });
    $("setupStatus").textContent = result.message || "初期管理者を作成しました。";
  } catch (error) {
    $("setupStatus").textContent = `作成失敗：${error.message}`;
  }
}

async function login() {
  try {
    saveApiBase();
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username: $("loginUsername").value.trim(),
        password: $("loginPassword").value
      })
    });

    pendingLogin = data;
    $("loginError").textContent = "";

    if (data.roles.length > 1) {
      showRoleOptions(data);
    } else {
      completeLogin(data.roles[0]);
    }
  } catch (error) {
    $("loginError").textContent = error.message;
  }
}

function showRoleOptions(data) {
  $("loginScreen").classList.add("hidden");
  $("roleScreen").classList.remove("hidden");
  $("roleOptions").innerHTML = data.roles.map((role) => `
    <button class="primary wide" data-role="${role}">${roleLabel(role)}としてログイン</button>
  `).join("");
}

function selectRole(event) {
  const button = event.target.closest("[data-role]");
  if (!button || !pendingLogin) return;
  completeLogin(button.dataset.role);
}

function completeLogin(role) {
  saveSession({ ...pendingLogin, role });
  pendingLogin = null;
  applySession();
}

function showRoleSelectFromSession() {
  if (!session || session.roles.length <= 1) return;
  pendingLogin = session;
  showRoleOptions(session);
  $("appHeader").classList.add("hidden");
  $("appRoot").classList.add("hidden");
}

function logout() {
  saveSession(null);
  applySession();
}

function roleLabel(role) {
  return role === "admin" ? "管理者" : "受講生";
}

async function applySession() {
  if (!session) {
    $("loginScreen").classList.remove("hidden");
    $("roleScreen").classList.add("hidden");
    $("appHeader").classList.add("hidden");
    $("appRoot").classList.add("hidden");
    return;
  }

  $("loginScreen").classList.add("hidden");
  $("roleScreen").classList.add("hidden");
  $("appHeader").classList.remove("hidden");
  $("appRoot").classList.remove("hidden");

  $("currentUserLabel").textContent = session.displayName || session.username;
  $("currentRoleLabel").textContent = roleLabel(session.role);
  $("switchRoleBtn").classList.toggle("hidden", session.roles.length <= 1);
  $("adminArea").classList.toggle("hidden", session.role !== "admin");

  await Promise.all([loadCategories(), loadSummary()]);
  await nextQuestion();

  if (session.role === "admin") {
    await Promise.all([loadUsers(), loadAdminWords()]);
  }
}

/* =========================
   Student quiz
========================= */
async function loadCategories() {
  const data = await api("/api/categories");
  $("categoryFilter").innerHTML = `<option value="all">すべて</option>` +
    data.categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("");
}

async function loadSummary() {
  const data = await api("/api/summary");
  $("totalWords").textContent = data.totalWords;
  $("learningWords").textContent = data.learningWords;
  $("masteredWords").textContent = data.masteredWords;
  $("accuracy").textContent = `${data.accuracy}%`;
}

async function nextQuestion() {
  answered = false;
  $("choiceResult").textContent = "";
  $("choiceOptions").innerHTML = "";

  const params = new URLSearchParams({
    category: $("categoryFilter").value,
    filter: $("studyFilter").value,
    mode: $("questionMode").value
  });

  const data = await api(`/api/quiz?${params.toString()}`);
  currentQuestion = data;

  if (data.empty) {
    $("choiceCategory").textContent = "出題なし";
    $("choiceStreak").textContent = `連続正解：- / ${MASTER_STREAK}`;
    $("questionLabel").textContent = "";
    $("choiceQuestion").classList.remove("translation-mode");
    $("choiceQuestion").textContent = data.message;
    return;
  }

  $("choiceCategory").textContent = data.category;
  $("choiceStreak").textContent = `連続正解：${data.correctStreak} / ${MASTER_STREAK}`;
  $("questionLabel").textContent = data.questionLabel;
  $("choiceQuestion").textContent = data.questionText;
  $("choiceQuestion").classList.toggle("translation-mode", data.mode === "translation");

  $("choiceOptions").innerHTML = data.options.map((option) => `
    <button class="choice-option" data-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>
  `).join("");
}

async function answerQuestion(event) {
  const button = event.target.closest(".choice-option");
  if (!button || !currentQuestion || answered) return;
  answered = true;

  const selectedText = button.dataset.answer;

  const result = await api("/api/answer", {
    method: "POST",
    body: JSON.stringify({
      wordId: currentQuestion.wordId,
      mode: currentQuestion.mode,
      selectedText
    })
  });

  document.querySelectorAll(".choice-option").forEach((option) => {
    option.disabled = true;
    if (option.dataset.answer === result.correctAnswer) option.classList.add("correct");
    if (option === button && !result.correct) option.classList.add("wrong");
  });

  if (result.correct && result.mastered) {
    $("choiceResult").textContent = "正解！3回連続正解したので通常出題から外れました。";
  } else if (result.correct) {
    $("choiceResult").textContent = `正解！連続正解：${result.correctStreak} / ${MASTER_STREAK}`;
  } else {
    $("choiceResult").textContent = `不正解。正解は「${result.correctAnswer}」です。連続正解は0に戻りました。`;
  }

  await loadSummary();
}

/* =========================
   Admin
========================= */
async function createUser() {
  try {
    const roles = [];
    if ($("newRoleStudent").checked) roles.push("student");
    if ($("newRoleAdmin").checked) roles.push("admin");

    const data = await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        username: $("newUserName").value.trim(),
        displayName: $("newDisplayName").value.trim(),
        password: $("newPassword").value,
        roles
      })
    });

    $("createUserStatus").textContent = `作成しました：${data.id}`;
    $("newUserName").value = "";
    $("newDisplayName").value = "";
    $("newPassword").value = "";
    await loadUsers();
  } catch (error) {
    $("createUserStatus").textContent = `作成失敗：${error.message}`;
  }
}

async function loadUsers() {
  if (session?.role !== "admin") return;
  const data = await api("/api/admin/users");
  $("userList").innerHTML = data.users.map((user) => `
    <article class="user-row">
      <div>
        <h3>${escapeHtml(user.displayName)} / ${escapeHtml(user.username)}</h3>
        <p>${user.roles.map(roleLabel).join("・")} / ${user.isActive ? "有効" : "無効"}</p>
      </div>
    </article>
  `).join("");
}

async function loadAdminWords() {
  if (session?.role !== "admin") return;
  const q = encodeURIComponent($("wordSearch").value.trim());
  const data = await api(`/api/admin/words?q=${q}`);

  $("wordList").innerHTML = data.words.map((word) => `
    <article class="word-row">
      <div>
        <h3>${escapeHtml(word.english)} / ${escapeHtml(word.japanese)}</h3>
        <p>${escapeHtml(word.englishTranslationProblem)}</p>
        <p>${escapeHtml(word.japaneseTranslationProblem)}</p>
        <div class="badge">${escapeHtml(word.category)}</div>
      </div>
      <div class="word-actions">
        <button class="secondary" data-edit="${word.id}">編集</button>
      </div>
    </article>
  `).join("");
}

async function startEdit(id) {
  const data = await api(`/api/admin/words?q=`);
  const word = data.words.find((item) => item.id === id);
  if (!word) return;

  $("editWordId").value = word.id;
  $("editEnglish").value = word.english;
  $("editJapanese").value = word.japanese;
  $("editCategory").value = word.category;
  $("editPronounce").value = word.pronounce || "";
  $("editEnglishTranslationProblem").value = word.englishTranslationProblem || "";
  $("editJapaneseTranslationProblem").value = word.japaneseTranslationProblem || "";
  $("editExample").value = word.example || "";
  $("editMemo").value = word.memo || "";
  $("editStatus").textContent = `編集中：${word.english} / ${word.japanese}`;
  $("editResetProgress").checked = true;
  $("editWordId").scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearEditForm() {
  ["editWordId","editEnglish","editJapanese","editCategory","editPronounce","editEnglishTranslationProblem","editJapaneseTranslationProblem","editExample","editMemo"].forEach((id) => $(id).value = "");
  $("editResetProgress").checked = true;
  $("editStatus").textContent = "編集する問題を選択してください。";
}

async function saveWordEdit() {
  try {
    const id = $("editWordId").value;
    if (!id) throw new Error("編集する問題を選択してください。");

    await api(`/api/admin/words/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        english: $("editEnglish").value.trim(),
        japanese: $("editJapanese").value.trim(),
        category: $("editCategory").value.trim(),
        pronounce: $("editPronounce").value.trim(),
        englishTranslationProblem: $("editEnglishTranslationProblem").value.trim(),
        japaneseTranslationProblem: $("editJapaneseTranslationProblem").value.trim(),
        example: $("editExample").value.trim(),
        memo: $("editMemo").value.trim(),
        resetProgress: $("editResetProgress").checked
      })
    });

    $("editStatus").textContent = "保存しました。";
    await Promise.all([loadAdminWords(), loadCategories(), nextQuestion()]);
  } catch (error) {
    $("editStatus").textContent = `保存失敗：${error.message}`;
  }
}



function togglePasswordVisibility(event) {
  const button = event.target.closest("[data-toggle-password]");
  if (!button) return;

  const input = document.getElementById(button.dataset.togglePassword);
  if (!input) return;

  const isHidden = input.type === "password";
  input.type = isHidden ? "text" : "password";
  button.textContent = isHidden ? "非表示" : "表示";
}

/* =========================
   Utility
========================= */
function debounce(fn, delay) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
