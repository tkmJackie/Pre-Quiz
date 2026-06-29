/* =========================
   CCT Frontend Patch
   Google Authenticator + Publish Period
========================= */

(function () {
  function safeShowMessage(message, type = "info") {
    if (typeof showMessage === "function") showMessage(message, type);
    else alert(message);
  }

  function toApiDateTime(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new Error("公開期間の日付形式が正しくありません。");
    }

    return date.toISOString().slice(0, 19).replace("T", " ");
  }

  window.getAssignmentPeriodPayload = function getAssignmentPeriodPayload() {
    const availableFrom = toApiDateTime($("assignAvailableFrom")?.value || "");
    const availableUntil = toApiDateTime($("assignAvailableUntil")?.value || "");

    if (availableFrom && availableUntil && availableFrom > availableUntil) {
      throw new Error("公開終了日時は公開開始日時より後にしてください。");
    }

    return { availableFrom, availableUntil };
  };

  window.assignmentCard = function assignmentCard() {
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
        <button onclick="assignSetToOrg()">企業へ割り当て</button>

        <label>受講者に個別割り当て</label>
        <select id="assignUser"></select>
        <button class="ghost" onclick="assignSetToUser()">受講者へ割り当て</button>

        <p class="muted">通常は企業単位の割り当てで十分です。個別割り当ては例外対応用です。</p>
      </section>
    `;
  };

  window.assignSetToOrg = async function assignSetToOrg() {
    try {
      const period = window.getAssignmentPeriodPayload();

      await api("/api/admin/assignments", {
        method: "POST",
        body: JSON.stringify({
          questionSetId: $("assignSet").value,
          organizationId: $("assignOrg").value,
          ...period
        })
      });

      safeShowMessage("企業へ問題集を割り当てました。", "success");
    } catch (e) {
      safeShowMessage(e.message, "error");
    }
  };

  window.assignSetToUser = async function assignSetToUser() {
    try {
      const period = window.getAssignmentPeriodPayload();

      await api("/api/admin/assignments", {
        method: "POST",
        body: JSON.stringify({
          questionSetId: $("assignSet").value,
          userId: $("assignUser").value,
          ...period
        })
      });

      safeShowMessage("受講者へ問題集を割り当てました。", "success");
    } catch (e) {
      safeShowMessage(e.message, "error");
    }
  };

  window.showLoginTwoFactorNotice = function showLoginTwoFactorNotice(data) {
    const card = $("twoFactorLoginCard");
    if (!card) return;
    let note = card.querySelector(".two-factor-login-note");
    if (!note) {
      note = document.createElement("p");
      note.className = "muted two-factor-login-note";
      card.insertBefore(note, card.querySelector("label"));
    }
    note.textContent = `${data.username} の認証アプリに表示される6桁コードを入力してください。`;
  };

  window.renderTwoFactorView = async function renderTwoFactorView() {
    const root = $("twoFactorView");
    const me = await api("/api/me");
    const enabled = !!me.twoFactorEnabled;

    root.innerHTML = `
      <section class="card contact-card">
        <div class="section-title-row">
          <div>
            <h2>2要素認証設定</h2>
            <p class="muted">このアプリでは2要素認証が必須です。Google Authenticatorなどの認証アプリで6桁コードを生成します。</p>
          </div>
          ${enabled ? `<button class="ghost" onclick="goMainView()">戻る</button>` : ""}
        </div>

        <div class="status-box">
          現在の状態：
          <span class="pill ${enabled ? "open" : "closed"}">${enabled ? "有効" : "未設定"}</span>
        </div>

        ${enabled ? `
          <p class="muted">2要素認証は有効です。この設定は必須のため、利用者側では無効化できません。</p>
        ` : `
          <div class="message error" style="display:block;margin-top:14px;">
            2要素認証を有効化するまで、問題集・進捗・管理機能は利用できません。
          </div>
          <ol class="two-factor-steps">
            <li>「認証アプリの設定を開始」を押します。</li>
            <li>Google Authenticatorなどの認証アプリで、表示されたセットアップキーを登録します。</li>
            <li>認証アプリに表示された6桁コードを入力して2要素認証を有効化します。</li>
          </ol>
          <button onclick="startTwoFactorSetup()">認証アプリの設定を開始</button>
          <div id="twoFactorSetupBox"></div>
        `}
      </section>
    `;
  };

  window.startTwoFactorSetup = async function startTwoFactorSetup() {
    try {
      const data = await api("/api/me/2fa/setup", {
        method: "POST",
        body: "{}"
      });
      cache.twoFactorSetup = data;

      const box = $("twoFactorSetupBox");
      box.innerHTML = `
        <div class="result-box">
          <p><strong>認証アプリに以下のセットアップキーを登録してください。</strong></p>
          <p class="muted">Google Authenticator、Microsoft Authenticator、1PasswordなどのTOTP対応アプリで利用できます。</p>

          <label>アカウント名</label>
          <div class="two-factor-secret">${escapeHtml(data.accountName || session.username)}</div>

          <label>セットアップキー</label>
          <div class="two-factor-secret">${escapeHtml(data.secret || "")}</div>

          ${data.otpauthUrl ? `
            <p class="muted">
              スマートフォンの場合は、以下のリンクから認証アプリに追加できる場合があります。<br>
              <a href="${escapeHtml(data.otpauthUrl)}">認証アプリで開く</a>
            </p>
          ` : ""}

          <label>認証アプリに表示された6桁コード</label>
          <input id="confirmTwoFactorCode" inputmode="numeric" maxlength="6" placeholder="123456">
          <button onclick="confirmTwoFactor()">有効化する</button>
        </div>
      `;
    } catch (e) {
      safeShowMessage(e.message, "error");
    }
  };

  window.confirmTwoFactor = async function confirmTwoFactor() {
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
      safeShowMessage("2要素認証を有効化しました。アプリを利用できます。", "success");
      await renderApp();
    } catch (e) {
      safeShowMessage(e.message, "error");
    }
  };

  if (session) {
    renderApp();
  }
})();
