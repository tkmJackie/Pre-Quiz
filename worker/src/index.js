import { DEFAULT_WORDS } from "./seed-words.js";

const MASTER_STREAK = 3;
const PASSWORD_ITERATIONS = 100000;
const encoder = new TextEncoder();

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return corsResponse(null, env, 204);

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === "/api/health") return json({ ok: true, service: "cct-english-api" }, env);

      if (path === "/api/setup" && request.method === "POST") return handleSetup(request, env);
      if (path === "/api/login" && request.method === "POST") return handleLogin(request, env);
      if (path === "/api/me" && request.method === "GET") return handleMe(request, env);

      const auth = await requireAuth(request, env);

      if (path === "/api/categories" && request.method === "GET") return handleCategories(request, env, auth);
      if (path === "/api/summary" && request.method === "GET") return handleSummary(request, env, auth);
      if (path === "/api/quiz" && request.method === "GET") return handleQuiz(request, env, auth);
      if (path === "/api/answer" && request.method === "POST") return handleAnswer(request, env, auth);

      if (path === "/api/admin/seed-words" && request.method === "POST") return requireAdminThen(request, env, auth, handleSeedWords);
      if (path === "/api/admin/users" && request.method === "GET") return requireAdminThen(request, env, auth, handleListUsers);
      if (path === "/api/admin/users" && request.method === "POST") return requireAdminThen(request, env, auth, handleCreateUser);
      if (path === "/api/admin/words" && request.method === "GET") return requireAdminThen(request, env, auth, handleAdminWords);
      if (path === "/api/admin/words" && request.method === "POST") return requireAdminThen(request, env, auth, handleCreateWord);
      if (path.startsWith("/api/admin/words/") && request.method === "PATCH") return requireAdminThen(request, env, auth, handleUpdateWord);
      if (path.startsWith("/api/admin/words/") && request.method === "DELETE") return requireAdminThen(request, env, auth, handleDeleteWord);
      if (path === "/api/admin/progress" && request.method === "GET") return requireAdminThen(request, env, auth, handleAdminProgress);

      return json({ error: "Not found" }, env, 404);
    } catch (error) {
      const status = error.status || 500;
      return json({ error: error.message || "Internal error" }, env, status);
    }
  }
};

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-CCT-Role",
    "Access-Control-Max-Age": "86400"
  };
}

function corsResponse(body, env, status = 200, headers = {}) {
  return new Response(body, { status, headers: { ...corsHeaders(env), ...headers } });
}

function json(data, env, status = 200) {
  return corsResponse(JSON.stringify(data, null, 2), env, status, { "Content-Type": "application/json; charset=utf-8" });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw httpError(400, "Invalid JSON");
  }
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeRole(role) {
  return role === "admin" ? "admin" : "student";
}

function rowToWord(row) {
  return {
    id: row.id,
    english: row.english,
    japanese: row.japanese,
    pronounce: row.pronounce,
    category: row.category,
    example: row.example,
    memo: row.memo,
    englishTranslationProblem: row.english_translation_problem,
    japaneseTranslationProblem: row.japanese_translation_problem,
    isActive: Boolean(row.is_active)
  };
}

/* =========================
   Crypto / JWT
========================= */
function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  let text = value.replace(/-/g, "+").replace(/_/g, "/");
  text += "=".repeat((4 - text.length % 4) % 4);
  const binary = atob(text);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlJson(data) {
  return bytesToBase64Url(encoder.encode(JSON.stringify(data)));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 };
  const data = `${base64UrlJson(header)}.${base64UrlJson(body)}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(data));
  return `${data}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifyJwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) throw httpError(401, "Invalid token");

  const [header, payload, signature] = parts;
  const data = `${header}.${payload}`;
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), base64UrlToBytes(signature), encoder.encode(data));
  if (!ok) throw httpError(401, "Invalid token");

  const body = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload)));
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) throw httpError(401, "Token expired");
  return body;
}

async function hashPassword(password, saltBase64 = null, iterations = PASSWORD_ITERATIONS) {
  const salt = saltBase64 ? base64UrlToBytes(saltBase64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return {
    salt: bytesToBase64Url(salt),
    hash: bytesToBase64Url(new Uint8Array(bits)),
    iterations
  };
}

async function verifyPassword(password, user) {
  const result = await hashPassword(password, user.password_salt, user.password_iterations);
  return result.hash === user.password_hash;
}

/* =========================
   Auth
========================= */
async function requireAuth(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw httpError(401, "Missing token");

  const payload = await verifyJwt(token, env.JWT_SECRET);
  const requestedRole = normalizeRole(request.headers.get("X-CCT-Role") || payload.role || "student");
  if (!payload.roles.includes(requestedRole)) throw httpError(403, "Role not allowed");

  return { ...payload, selectedRole: requestedRole };
}

async function requireAdminThen(request, env, auth, handler) {
  if (!auth.roles.includes("admin") || auth.selectedRole !== "admin") {
    throw httpError(403, "Admin role required");
  }
  return handler(request, env, auth);
}

async function getUserRoles(db, userId) {
  const result = await db.prepare("SELECT role FROM user_roles WHERE user_id = ? ORDER BY role").bind(userId).all();
  return result.results.map((row) => row.role);
}

async function handleSetup(request, env) {
  const body = await readJson(request);
  if (!env.SETUP_KEY || body.setupKey !== env.SETUP_KEY) throw httpError(403, "Invalid setup key");

  const countRow = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first();
  if (countRow.count > 0 && !body.force) {
    throw httpError(409, "Setup already completed");
  }

  const username = (body.username || "admin").trim();
  const password = body.password || "";
  const displayName = (body.displayName || "管理者").trim();

  if (!username || password.length < 8) throw httpError(400, "Username and password with at least 8 characters are required");

  const userId = crypto.randomUUID();
  const hashed = await hashPassword(password);

  await env.DB.prepare(
    "INSERT INTO users (id, username, display_name, password_hash, password_salt, password_iterations) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(userId, username, displayName, hashed.hash, hashed.salt, hashed.iterations).run();

  await env.DB.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, 'admin'), (?, 'student')").bind(userId, userId).run();
  await seedDefaultWords(env.DB);

  return json({ ok: true, message: "Admin user created and words seeded" }, env);
}

async function handleLogin(request, env) {
  const body = await readJson(request);
  const username = (body.username || "").trim();
  const password = body.password || "";

  const user = await env.DB.prepare("SELECT * FROM users WHERE username = ? AND is_active = 1").bind(username).first();
  if (!user || !(await verifyPassword(password, user))) throw httpError(401, "Invalid username or password");

  const roles = await getUserRoles(env.DB, user.id);
  const token = await signJwt({
    sub: user.id,
    username: user.username,
    displayName: user.display_name,
    roles
  }, env.JWT_SECRET);

  return json({ token, username: user.username, displayName: user.display_name, roles }, env);
}

async function handleMe(request, env) {
  const auth = await requireAuth(request, env);
  return json({ username: auth.username, displayName: auth.displayName, roles: auth.roles, selectedRole: auth.selectedRole }, env);
}

/* =========================
   Student API
========================= */
async function handleCategories(request, env) {
  const rows = await env.DB.prepare("SELECT DISTINCT category FROM words WHERE is_active = 1 ORDER BY category").all();
  return json({ categories: rows.results.map((row) => row.category) }, env);
}

async function handleSummary(request, env, auth) {
  const total = await env.DB.prepare("SELECT COUNT(*) AS count FROM words WHERE is_active = 1").first();
  const mastered = await env.DB.prepare("SELECT COUNT(*) AS count FROM progress WHERE user_id = ? AND mastered = 1").bind(auth.sub).first();
  const weak = await env.DB.prepare("SELECT COUNT(*) AS count FROM progress WHERE user_id = ? AND weak = 1 AND mastered = 0").bind(auth.sub).first();
  const answers = await env.DB.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(is_correct), 0) AS correct FROM answer_history WHERE user_id = ?").bind(auth.sub).first();

  return json({
    totalWords: total.count,
    learningWords: Math.max(0, total.count - mastered.count),
    masteredWords: mastered.count,
    weakWords: weak.count,
    totalAnswers: answers.total || 0,
    correctAnswers: answers.correct || 0,
    accuracy: answers.total ? Math.round((answers.correct / answers.total) * 100) : 0
  }, env);
}

function correctTextForMode(word, mode) {
  return mode === "translation" ? word.japanese_translation_problem : word.japanese;
}

function questionTextForMode(word, mode) {
  return mode === "translation" ? word.english_translation_problem : word.english;
}

function labelForMode(mode) {
  return mode === "translation" ? "次の英文問題の正しい日本語訳は？" : "この英語の意味は？";
}

async function getCandidateWords(env, auth, params) {
  const category = params.get("category") || "all";
  const filter = params.get("filter") || "learning";
  const binds = [auth.sub];
  let where = "w.is_active = 1";

  if (category !== "all") {
    where += " AND w.category = ?";
    binds.push(category);
  }

  if (filter === "learning") where += " AND COALESCE(p.mastered, 0) = 0";
  if (filter === "weak") where += " AND COALESCE(p.weak, 0) = 1 AND COALESCE(p.mastered, 0) = 0";
  if (filter === "mastered") where += " AND COALESCE(p.mastered, 0) = 1";

  const sql = `
    SELECT w.*, COALESCE(p.correct_streak, 0) AS correct_streak, COALESCE(p.mastered, 0) AS mastered, COALESCE(p.weak, 0) AS weak
    FROM words w
    LEFT JOIN progress p ON p.word_id = w.id AND p.user_id = ?
    WHERE ${where}
    ORDER BY w.category, w.english
  `;

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return rows.results;
}

async function handleQuiz(request, env, auth) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "translation" ? "translation" : "term";
  const candidates = await getCandidateWords(env, auth, url.searchParams);

  if (!candidates.length) {
    return json({ empty: true, message: "条件に合う問題がありません。" }, env);
  }

  const word = candidates[Math.floor(Math.random() * candidates.length)];
  const allWords = await env.DB.prepare("SELECT * FROM words WHERE is_active = 1 AND id <> ?").bind(word.id).all();
  const shuffled = allWords.results.sort(() => Math.random() - 0.5);
  const correctAnswer = correctTextForMode(word, mode);
  const wrong = shuffled.slice(0, 3).map((item) => correctTextForMode(item, mode));
  const options = [correctAnswer, ...wrong].sort(() => Math.random() - 0.5);

  return json({
    empty: false,
    wordId: word.id,
    mode,
    category: word.category,
    questionLabel: labelForMode(mode),
    questionText: questionTextForMode(word, mode),
    correctStreak: word.correct_streak || 0,
    options
  }, env);
}

async function ensureProgress(env, userId, wordId) {
  await env.DB.prepare("INSERT OR IGNORE INTO progress (user_id, word_id) VALUES (?, ?)").bind(userId, wordId).run();
}

async function handleAnswer(request, env, auth) {
  const body = await readJson(request);
  const wordId = body.wordId;
  const mode = body.mode === "translation" ? "translation" : "term";
  const selectedText = String(body.selectedText || "");

  const word = await env.DB.prepare("SELECT * FROM words WHERE id = ? AND is_active = 1").bind(wordId).first();
  if (!word) throw httpError(404, "Word not found");

  const correctAnswer = correctTextForMode(word, mode);
  const isCorrect = selectedText === correctAnswer;

  await ensureProgress(env, auth.sub, wordId);
  const current = await env.DB.prepare("SELECT * FROM progress WHERE user_id = ? AND word_id = ?").bind(auth.sub, wordId).first();

  const nextStreak = isCorrect ? Math.min(MASTER_STREAK, (current.correct_streak || 0) + 1) : 0;
  const mastered = nextStreak >= MASTER_STREAK ? 1 : 0;
  const weak = isCorrect ? 0 : 1;

  await env.DB.prepare(`
    UPDATE progress
    SET correct_streak = ?, mastered = ?, weak = ?, total_answers = total_answers + 1,
        correct_answers = correct_answers + ?, updated_at = ?
    WHERE user_id = ? AND word_id = ?
  `).bind(nextStreak, mastered, weak, isCorrect ? 1 : 0, nowIso(), auth.sub, wordId).run();

  await env.DB.prepare(`
    INSERT INTO answer_history (user_id, word_id, mode, selected_text, correct_answer, is_correct)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(auth.sub, wordId, mode, selectedText, correctAnswer, isCorrect ? 1 : 0).run();

  return json({ correct: isCorrect, correctAnswer, correctStreak: nextStreak, mastered: Boolean(mastered), weak: Boolean(weak) }, env);
}

/* =========================
   Admin API
========================= */
async function seedDefaultWords(db) {
  const statements = DEFAULT_WORDS.map((word) => db.prepare(`
    INSERT OR IGNORE INTO words
      (id, english, japanese, pronounce, category, example, memo, english_translation_problem, japanese_translation_problem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    word.id,
    word.english,
    word.japanese,
    word.pronounce || "",
    word.category || "Custom",
    word.example || "",
    word.memo || "",
    word.englishTranslationProblem || "",
    word.japaneseTranslationProblem || ""
  ));

  for (let i = 0; i < statements.length; i += 50) {
    await db.batch(statements.slice(i, i + 50));
  }
}

async function handleSeedWords(request, env) {
  await seedDefaultWords(env.DB);
  return json({ ok: true, count: DEFAULT_WORDS.length }, env);
}

async function handleListUsers(request, env) {
  const rows = await env.DB.prepare(`
    SELECT u.id, u.username, u.display_name, u.is_active, u.created_at,
           GROUP_CONCAT(r.role) AS roles
    FROM users u
    LEFT JOIN user_roles r ON r.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();

  return json({
    users: rows.results.map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      isActive: Boolean(row.is_active),
      roles: row.roles ? row.roles.split(",") : [],
      createdAt: row.created_at
    }))
  }, env);
}

async function handleCreateUser(request, env) {
  const body = await readJson(request);
  const username = (body.username || "").trim();
  const password = body.password || "";
  const displayName = (body.displayName || username).trim();
  const roles = Array.isArray(body.roles) && body.roles.length ? body.roles.map(normalizeRole) : ["student"];

  if (!username || password.length < 8) throw httpError(400, "Username and password with at least 8 characters are required");

  const userId = crypto.randomUUID();
  const hashed = await hashPassword(password);

  await env.DB.prepare(
    "INSERT INTO users (id, username, display_name, password_hash, password_salt, password_iterations) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(userId, username, displayName, hashed.hash, hashed.salt, hashed.iterations).run();

  for (const role of [...new Set(roles)]) {
    await env.DB.prepare("INSERT INTO user_roles (user_id, role) VALUES (?, ?)").bind(userId, role).run();
  }

  return json({ ok: true, id: userId }, env, 201);
}

async function handleAdminWords(request, env) {
  const url = new URL(request.url);
  const q = `%${(url.searchParams.get("q") || "").trim()}%`;

  const rows = await env.DB.prepare(`
    SELECT * FROM words
    WHERE is_active = 1
      AND (english LIKE ? OR japanese LIKE ? OR category LIKE ? OR english_translation_problem LIKE ? OR japanese_translation_problem LIKE ?)
    ORDER BY category, english
    LIMIT 500
  `).bind(q, q, q, q, q).all();

  return json({ words: rows.results.map(rowToWord) }, env);
}

async function handleCreateWord(request, env) {
  const body = await readJson(request);
  const id = crypto.randomUUID();
  const english = (body.english || "").trim();
  const japanese = (body.japanese || "").trim();

  if (!english || !japanese) throw httpError(400, "English and Japanese are required");

  const word = {
    id,
    english,
    japanese,
    pronounce: body.pronounce || "",
    category: body.category || "Custom",
    example: body.example || "",
    memo: body.memo || "",
    englishTranslationProblem: body.englishTranslationProblem || `What does the term "${english}" mean in security and IT?`,
    japaneseTranslationProblem: body.japaneseTranslationProblem || `セキュリティとITにおいて「${japanese}」という用語は何を意味しますか？`
  };

  await env.DB.prepare(`
    INSERT INTO words
      (id, english, japanese, pronounce, category, example, memo, english_translation_problem, japanese_translation_problem)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(word.id, word.english, word.japanese, word.pronounce, word.category, word.example, word.memo, word.englishTranslationProblem, word.japaneseTranslationProblem).run();

  return json({ ok: true, word }, env, 201);
}

function wordIdFromPath(request) {
  return decodeURIComponent(new URL(request.url).pathname.split("/").pop());
}

async function handleUpdateWord(request, env) {
  const id = wordIdFromPath(request);
  const body = await readJson(request);

  const existing = await env.DB.prepare("SELECT * FROM words WHERE id = ? AND is_active = 1").bind(id).first();
  if (!existing) throw httpError(404, "Word not found");

  const updated = {
    english: (body.english ?? existing.english).trim(),
    japanese: (body.japanese ?? existing.japanese).trim(),
    pronounce: body.pronounce ?? existing.pronounce,
    category: body.category ?? existing.category,
    example: body.example ?? existing.example,
    memo: body.memo ?? existing.memo,
    englishTranslationProblem: body.englishTranslationProblem ?? existing.english_translation_problem,
    japaneseTranslationProblem: body.japaneseTranslationProblem ?? existing.japanese_translation_problem
  };

  if (!updated.english || !updated.japanese) throw httpError(400, "English and Japanese are required");

  await env.DB.prepare(`
    UPDATE words
    SET english = ?, japanese = ?, pronounce = ?, category = ?, example = ?, memo = ?,
        english_translation_problem = ?, japanese_translation_problem = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    updated.english, updated.japanese, updated.pronounce, updated.category,
    updated.example, updated.memo, updated.englishTranslationProblem,
    updated.japaneseTranslationProblem, nowIso(), id
  ).run();

  if (body.resetProgress) {
    await env.DB.prepare("DELETE FROM progress WHERE word_id = ?").bind(id).run();
  }

  return json({ ok: true }, env);
}

async function handleDeleteWord(request, env) {
  const id = wordIdFromPath(request);
  await env.DB.prepare("UPDATE words SET is_active = 0, updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
  return json({ ok: true }, env);
}

async function handleAdminProgress(request, env) {
  const rows = await env.DB.prepare(`
    SELECT u.username, u.display_name,
           COUNT(p.word_id) AS touched_words,
           COALESCE(SUM(p.mastered), 0) AS mastered_words,
           COALESCE(SUM(p.total_answers), 0) AS total_answers,
           COALESCE(SUM(p.correct_answers), 0) AS correct_answers
    FROM users u
    LEFT JOIN progress p ON p.user_id = u.id
    GROUP BY u.id
    ORDER BY u.username
  `).all();

  return json({ progress: rows.results }, env);
}
