// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { Readable } from "stream";
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = process.env.PORT || 3e3;
app.disable("x-powered-by");
app.set("etag", false);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));
function getAppUrl(req) {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  if (req) {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    if (host) {
      return `${proto}://${host}`;
    }
  }
  return `http://localhost:${PORT}`;
}
var runtimeBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
var isPollingActive = false;
var pollingOffset = 0;
var isWebhookConfigured = false;
var DATA_DIR = path.join(__dirname, "data");
var APPS_FILE = path.join(DATA_DIR, "apps-store.json");
var PREFS_FILE = path.join(DATA_DIR, "preferences-store.json");
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(APPS_FILE)) {
    fs.writeFileSync(APPS_FILE, "{}", "utf-8");
  }
  if (!fs.existsSync(PREFS_FILE)) {
    fs.writeFileSync(PREFS_FILE, "{}", "utf-8");
  }
}
function readAppsStore() {
  try {
    ensureDataDir();
    const data = fs.readFileSync(APPS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}
function writeAppsStore(store) {
  try {
    ensureDataDir();
    fs.writeFileSync(APPS_FILE, JSON.stringify(store), "utf-8");
  } catch {
  }
}
function readPrefsStore() {
  try {
    ensureDataDir();
    const data = fs.readFileSync(PREFS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}
function writePrefsStore(store) {
  try {
    ensureDataDir();
    fs.writeFileSync(PREFS_FILE, JSON.stringify(store), "utf-8");
  } catch {
  }
}
function getUserLanguage(userId) {
  const prefs = readPrefsStore();
  return prefs[String(userId)]?.language || "en";
}
function setUserLanguage(userId, lang) {
  const prefs = readPrefsStore();
  prefs[String(userId)] = { ...prefs[String(userId)] || {}, language: lang };
  writePrefsStore(prefs);
}
async function callTelegramApi(method, payload, tokenOverride) {
  const token = tokenOverride || runtimeBotToken;
  if (!token) {
    throw new Error("Telegram Bot Token is not configured");
  }
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return await response.json();
}
async function handleTelegramMessage(chatId, text, fromUser, currentAppUrl) {
  const userId = fromUser?.id || chatId;
  const cleanCmd = (text || "").trim().toLowerCase();
  const currentLang = getUserLanguage(userId);
  if (cleanCmd.startsWith("/start") || cleanCmd === "/language" || cleanCmd === "/lang") {
    const promptText = `\u{1F44B} *Welcome to Web App Launcher!* / *\xA1Bienvenido al Lanzador Web!*

Please select your language / Selecciona tu idioma:`;
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: promptText,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "\u{1F1FA}\u{1F1F8} English", callback_data: "set_lang:en" },
            { text: "\u{1F1EA}\u{1F1F8} Espa\xF1ol", callback_data: "set_lang:es" }
          ]
        ]
      }
    });
  } else if (cleanCmd.startsWith("/launcher")) {
    const isEs = currentLang === "es";
    const textMsg = isEs ? "\u{1F680} *Lanzador de Apps Web*" : "\u{1F680} *Web App Launcher*";
    const btnText = isEs ? "\u{1F680} Abrir Lanzador" : "\u{1F680} Open Launcher";
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: textMsg,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: btnText,
              web_app: { url: `${currentAppUrl}?lang=${currentLang}` }
            }
          ]
        ]
      }
    });
  } else if (cleanCmd.startsWith("/help")) {
    const isEs = currentLang === "es";
    const helpMsg = isEs ? `\u2022 /start - Idioma y lanzador
\u2022 /launcher - Abrir apps
\u2022 /language - Cambiar idioma` : `\u2022 /start - Setup & launch
\u2022 /launcher - Open apps
\u2022 /language - Switch language`;
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: helpMsg,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: isEs ? "\u{1F680} Abrir Lanzador" : "\u{1F680} Open Launcher",
              web_app: { url: `${currentAppUrl}?lang=${currentLang}` }
            }
          ]
        ]
      }
    });
  } else {
    const isEs = currentLang === "es";
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: isEs ? "Toca abajo para abrir el lanzador:" : "Tap below to open your launcher:",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: isEs ? "\u{1F680} Abrir Lanzador" : "\u{1F680} Open Launcher",
              web_app: { url: `${currentAppUrl}?lang=${currentLang}` }
            }
          ]
        ]
      }
    });
  }
}
async function handleTelegramCallback(callbackQuery, currentAppUrl) {
  const cbId = callbackQuery.id;
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data || "";
  const fromUser = callbackQuery.from;
  const userId = fromUser?.id || chatId;
  await callTelegramApi("answerCallbackQuery", { callback_query_id: cbId }).catch(() => {
  });
  if (data.startsWith("set_lang:")) {
    const lang = data.split(":")[1] === "es" ? "es" : "en";
    setUserLanguage(userId, lang);
    const isEs = lang === "es";
    const replyText = isEs ? `\u{1F1EA}\u{1F1F8} *\xA1Idioma configurado a Espa\xF1ol!*

Toca abajo para abrir tu lanzador in-app:` : `\u{1F1FA}\u{1F1F8} *Language set to English!*

Tap below to open your in-app launcher:`;
    const btnText = isEs ? "\u{1F680} Abrir Lanzador" : "\u{1F680} Open Launcher";
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: replyText,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: btnText,
              web_app: { url: `${currentAppUrl}?lang=${lang}` }
            }
          ]
        ]
      }
    });
  }
}
async function startBotPolling() {
  if (isPollingActive || isWebhookConfigured || !runtimeBotToken) return;
  isPollingActive = true;
  while (isPollingActive && !isWebhookConfigured && runtimeBotToken) {
    try {
      const updates = await callTelegramApi("getUpdates", {
        offset: pollingOffset,
        timeout: 20,
        allowed_updates: ["message", "callback_query"]
      });
      if (updates.ok && Array.isArray(updates.result)) {
        for (const update of updates.result) {
          pollingOffset = update.update_id + 1;
          const appUrl = getAppUrl();
          if (update.message) {
            const chatId = update.message.chat?.id;
            const text = update.message.text || "";
            const fromUser = update.message.from;
            if (chatId) {
              await handleTelegramMessage(chatId, text, fromUser, appUrl).catch(() => {
              });
            }
          } else if (update.callback_query) {
            await handleTelegramCallback(update.callback_query, appUrl).catch(() => {
            });
          }
        }
      }
    } catch (err) {
      if (err.message && err.message.includes("409")) {
        isPollingActive = false;
        isWebhookConfigured = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 4e3));
    }
  }
  isPollingActive = false;
}
function verifyTelegramInitData(initDataString, botToken) {
  try {
    if (!initDataString) return { valid: false, error: "Empty" };
    const params = new URLSearchParams(initDataString);
    const hash = params.get("hash");
    if (!hash) return { valid: false, error: "Missing hash" };
    params.delete("hash");
    const sortedKeys = Array.from(params.keys()).sort();
    const checkString = sortedKeys.map((k) => `${k}=${params.get(k)}`).join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
    const isValid = crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
    if (!isValid) return { valid: false, error: "Invalid" };
    const userRaw = params.get("user");
    return { valid: true, user: userRaw ? JSON.parse(userRaw) : null };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
app.get("/api/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url");
  try {
    const parsed = new URL(targetUrl);
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    const contentType = response.headers.get("content-type") || "text/html";
    res.removeHeader("X-Frame-Options");
    res.removeHeader("Content-Security-Policy");
    res.setHeader("Content-Type", contentType);
    if (contentType.includes("text/html")) {
      let html = await response.text();
      const baseTag = `<base href="${parsed.origin}${parsed.pathname}">`;
      html = html.includes("<head>") ? html.replace("<head>", `<head>${baseTag}`) : `${baseTag}${html}`;
      return res.send(html);
    }
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch {
    res.status(502).send("Error");
  }
});
app.get("/api/user/preferences", (req, res) => {
  const userId = req.query.userId?.toString() || "default";
  res.json({ userId, language: getUserLanguage(userId) });
});
app.post("/api/user/preferences", (req, res) => {
  const { userId, language } = req.body;
  if (userId && (language === "en" || language === "es")) {
    setUserLanguage(userId, language);
  }
  res.json({ success: true, language });
});
app.get("/api/apps", (req, res) => {
  const userId = req.query.userId?.toString() || "default";
  const store = readAppsStore();
  const userApps = store[userId];
  res.json({
    userId,
    hasCustomApps: Boolean(userApps && userApps.length > 0),
    apps: userApps || null
  });
});
app.post("/api/apps", (req, res) => {
  const { userId, apps } = req.body;
  const uid = userId ? String(userId) : "default";
  if (Array.isArray(apps)) {
    const store = readAppsStore();
    store[uid] = apps;
    writeAppsStore(store);
  }
  res.json({ success: true });
});
app.post("/api/apps/reset", (req, res) => {
  const { userId } = req.body;
  const uid = userId ? String(userId) : "default";
  const store = readAppsStore();
  delete store[uid];
  writeAppsStore(store);
  res.json({ success: true });
});
app.post("/api/telegram-webhook", async (req, res) => {
  res.status(200).send("OK");
  const update = req.body;
  if (!update) return;
  const currentAppUrl = getAppUrl(req);
  if (update.message) {
    const chatId = update.message.chat?.id;
    if (chatId) {
      await handleTelegramMessage(chatId, update.message.text || "", update.message.from, currentAppUrl).catch(() => {
      });
    }
  } else if (update.callback_query) {
    await handleTelegramCallback(update.callback_query, currentAppUrl).catch(() => {
    });
  }
});
app.post("/api/auth/validate-init-data", (req, res) => {
  const { initData } = req.body;
  if (!initData) return res.json({ valid: false });
  if (!runtimeBotToken) {
    try {
      const params = new URLSearchParams(initData);
      const userRaw = params.get("user");
      return res.json({ valid: true, user: userRaw ? JSON.parse(userRaw) : null });
    } catch {
      return res.json({ valid: false });
    }
  }
  res.json(verifyTelegramInitData(initData, runtimeBotToken));
});
async function startServer() {
  const distPath = path.join(__dirname, "dist");
  const hasDist = fs.existsSync(path.join(distPath, "index.html"));
  if (hasDist || process.env.NODE_ENV === "production") {
    app.use(express.static(distPath, {
      maxAge: "7d",
      etag: false
    }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  }
  if (runtimeBotToken) {
    startBotPolling();
  }
  app.listen(PORT, () => {
    console.log(`Telegram Web App Launcher (Low-RAM mode) listening on port ${PORT}`);
  });
}
startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
