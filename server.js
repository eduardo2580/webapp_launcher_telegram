// server.ts
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = Number(process.env.PORT) || 8080;
var isProd = process.env.NODE_ENV === "production";
var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  console.warn("[Telegram Bot] TELEGRAM_BOT_TOKEN is not configured; bot commands are disabled.");
}
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});
app.use(express.json({ limit: "32kb" }));
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: Date.now(),
    env: isProd ? "production" : "development"
  });
});
app.get("/api/network-info", (req, res) => {
  const host = req.get("host") || `localhost:${PORT}`;
  const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  res.status(200).json({
    status: "ok",
    serverPort: PORT,
    detectedHost: host,
    protocol,
    mobileTips: {
      androidEmulatorHost: `http://10.0.2.2:${PORT}`,
      genymotionHost: `http://10.0.3.2:${PORT}`,
      iosSimulatorHost: `http://127.0.0.1:${PORT}`,
      bindAddress: "0.0.0.0 (all network interfaces)",
      cleartextNote: 'Requires android:usesCleartextTraffic="true" on Android 9+ for HTTP',
      serviceWorkerRequirement: "Service Workers require HTTPS or localhost/127.0.0.1/10.0.2.2"
    }
  });
});
var CORE_APPS = [
  {
    id: "facebook",
    title: "Facebook",
    url: "https://m.facebook.com",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/facebook.png",
    category: "Social",
    isCustom: false
  },
  {
    id: "instagram",
    title: "Instagram",
    url: "https://www.instagram.com",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/instagram.png",
    category: "Social",
    isCustom: false
  },
  {
    id: "linkedin",
    title: "LinkedIn",
    url: "https://www.linkedin.com",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/linkedin.png",
    category: "Social",
    isCustom: false
  },
  {
    id: "wikipedia",
    title: "Wikipedia",
    url: "https://m.wikipedia.org",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wikipedia.png",
    category: "Tools",
    isCustom: false
  },
  {
    id: "youtube",
    title: "YouTube",
    url: "https://www.youtube.com",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/youtube.png",
    category: "Media",
    isCustom: false
  },
  {
    id: "x",
    title: "X / Twitter",
    url: "https://mobile.x.com",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/x.png",
    category: "Social",
    isCustom: false
  }
];
var serverSyncedApps = [...CORE_APPS];
var LANGUAGE_PROMPTS = {
  en: "Which language do you prefer? Choose one to open your app.",
  es: "\xBFQu\xE9 idioma prefieres? Elige uno para abrir la aplicaci\xF3n.",
  pt: "Qual idioma voc\xEA prefere? Escolha um para abrir o aplicativo."
};
var APP_URL_MISSING = {
  en: "The app link is not configured yet. Please contact the bot administrator.",
  es: "El enlace de la aplicaci\xF3n a\xFAn no est\xE1 configurado. Contacta al administrador del bot.",
  pt: "O link do aplicativo ainda n\xE3o foi configurado. Fale com o administrador do bot."
};
var LANGUAGE_CHOICES = [
  { language: "en", text: "\u{1F1FA}\u{1F1F8} English" },
  { language: "pt", text: "\u{1F1E7}\u{1F1F7} Portugu\xEAs" },
  { language: "es", text: "\u{1F1EA}\u{1F1F8} Espa\xF1ol" }
];
function getPublicAppUrl() {
  const configuredUrl = process.env.APP_URL?.trim();
  if (!configuredUrl) return null;
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}
var APP_URL = getPublicAppUrl();
if (!APP_URL) {
  console.warn("[Telegram Bot] Set APP_URL to the launcher public HTTPS URL; language buttons are disabled.");
}
function getBotLanguage(languageCode) {
  if (typeof languageCode !== "string") return "en";
  if (languageCode.toLowerCase().startsWith("pt")) return "pt";
  if (languageCode.toLowerCase().startsWith("es")) return "es";
  return "en";
}
function buildLanguageKeyboard(isPrivateChat) {
  if (!APP_URL) return void 0;
  return {
    inline_keyboard: LANGUAGE_CHOICES.map(({ language, text }) => {
      const url = new URL(APP_URL);
      url.searchParams.set("lang", language);
      return [{
        text,
        ...isPrivateChat ? { web_app: { url: url.toString() } } : { url: url.toString() }
      }];
    })
  };
}
async function callTelegramApi(method, payload) {
  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(method === "getUpdates" ? 4e4 : 15e3)
    });
  } catch {
    throw new Error(`Telegram ${method} network request failed.`);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(`Telegram ${method} returned an invalid response (${response.status}).`);
  }
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method} failed (${response.status}): ${result.description || "unknown error"}`);
  }
  return result.result;
}
app.get("/api/apps", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
  res.status(200).json({
    status: "ok",
    version: "1.2.0",
    syncedAt: Date.now(),
    source: "server",
    apps: serverSyncedApps
  });
});
app.post("/api/apps/sync", (req, res) => {
  const { apps, clientTimestamp } = req.body || {};
  if (Array.isArray(apps) && apps.length > 0) {
    serverSyncedApps = apps;
  }
  res.status(200).json({
    status: "ok",
    syncedAt: Date.now(),
    clientTimestamp: clientTimestamp || null,
    count: serverSyncedApps.length
  });
});
async function handleTelegramUpdate(update) {
  const message = update.message;
  if (!message?.chat?.id || typeof message.text !== "string") return;
  const command = message.text.trim().split(/\s+/, 1)[0].split("@", 1)[0];
  if (command !== "/start" && command !== "/launcher") return;
  const language = getBotLanguage(message.from?.language_code);
  const replyMarkup = buildLanguageKeyboard(message.chat.type === "private");
  await callTelegramApi("sendMessage", {
    chat_id: message.chat.id,
    text: APP_URL ? LANGUAGE_PROMPTS[language] : APP_URL_MISSING[language],
    ...replyMarkup ? { reply_markup: replyMarkup } : {}
  });
}
app.post("/api/telegram/webhook", async (req, res) => {
  res.status(200).send("OK");
  if (!BOT_TOKEN) return;
  const update = req.body;
  void handleTelegramUpdate(update).catch((error) => {
    const details = error instanceof Error ? error.message : "Unknown Telegram webhook error.";
    console.warn("[Telegram webhook] Failed to update the app menu:", details);
  });
});
async function startTelegramPolling() {
  if (!BOT_TOKEN) return;
  try {
    await callTelegramApi("deleteWebhook", { drop_pending_updates: false });
    console.log("[Telegram Bot] Long polling started.");
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown Telegram polling error.";
    console.error("[Telegram Bot] Could not initialize long polling:", details);
    return;
  }
  let offset = 0;
  let retryDelay = 1e3;
  while (true) {
    try {
      const updates = await callTelegramApi("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message"]
      });
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        try {
          await handleTelegramUpdate(update);
        } catch (error) {
          const details = error instanceof Error ? error.message : "Unknown Telegram update error.";
          console.warn("[Telegram Bot] Failed to process an update:", details);
        }
      }
      retryDelay = 1e3;
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown Telegram polling error.";
      console.error("[Telegram Bot] Polling failed; retrying:", details);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 3e4);
    }
  }
}
async function startServer() {
  if (!isProd) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use((req, res, next) => {
      if (req.path === "/" || req.path === "/index.html") {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
      next();
    });
    app.use("/sw.js", (_req, res, next) => {
      res.setHeader("Service-Worker-Allowed", "/");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      next();
    });
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Web App Launcher running on http://0.0.0.0:${PORT}`);
    if (BOT_TOKEN) void startTelegramPolling();
  });
}
startServer();
