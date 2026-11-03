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
var APP_CATEGORIES = ["Social", "Work", "Tools", "Media", "Other"];
var BOT_PAGE_SIZE = 8;
var serverSyncedApps = [...CORE_APPS];
var BOT_COPY = {
  en: {
    title: "\u{1F4F1} <b>Your apps</b>",
    description: "Choose a category, then tap an app to open it in Telegram.",
    page: "Page",
    apps: "apps",
    empty: "No apps in this category.",
    all: "All",
    categories: { Social: "Social", Work: "Work", Tools: "Tools", Media: "Media", Other: "Other" }
  },
  es: {
    title: "\u{1F4F1} <b>Tus aplicaciones</b>",
    description: "Elige una categor\xEDa y toca una aplicaci\xF3n para abrirla en Telegram.",
    page: "P\xE1gina",
    apps: "aplicaciones",
    empty: "No hay aplicaciones en esta categor\xEDa.",
    all: "Todas",
    categories: { Social: "Social", Work: "Trabajo", Tools: "Herramientas", Media: "Medios", Other: "Otros" }
  },
  pt: {
    title: "\u{1F4F1} <b>Seus aplicativos</b>",
    description: "Escolha uma categoria e toque em um aplicativo para abri-lo no Telegram.",
    page: "P\xE1gina",
    apps: "aplicativos",
    empty: "N\xE3o h\xE1 aplicativos nesta categoria.",
    all: "Todos",
    categories: { Social: "Social", Work: "Trabalho", Tools: "Ferramentas", Media: "M\xEDdia", Other: "Outros" }
  }
};
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function getBotApps() {
  return serverSyncedApps.flatMap((value) => {
    if (!isRecord(value)) return [];
    const { id, title, url, category } = value;
    if (typeof id !== "string" || typeof title !== "string" || typeof url !== "string") return [];
    if (!id || !title.trim() || title.length > 200) return [];
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return [];
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) return [];
    const appCategory = APP_CATEGORIES.includes(category) ? category : "Other";
    return [{
      id,
      title: title.trim(),
      url: parsedUrl.toString(),
      category: appCategory
    }];
  }).slice(0, 200);
}
function getBotLanguage(languageCode) {
  if (typeof languageCode !== "string") return "en";
  if (languageCode.toLowerCase().startsWith("pt")) return "pt";
  if (languageCode.toLowerCase().startsWith("es")) return "es";
  return "en";
}
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] || character);
}
function renderBotAppMenu(language, selectedCategory, requestedPage, allowMiniApps) {
  const copy = BOT_COPY[language];
  const apps = getBotApps();
  const categories = [
    "All",
    ...APP_CATEGORIES.filter((category) => apps.some((app2) => app2.category === category))
  ];
  const validCategory = categories.includes(selectedCategory) ? selectedCategory : "All";
  const filteredApps = validCategory === "All" ? apps : apps.filter((app2) => app2.category === validCategory);
  const pageCount = Math.max(1, Math.ceil(filteredApps.length / BOT_PAGE_SIZE));
  const page = Math.max(0, Math.min(Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0, pageCount - 1));
  const visibleApps = filteredApps.slice(page * BOT_PAGE_SIZE, (page + 1) * BOT_PAGE_SIZE);
  const selectedLabel = validCategory === "All" ? copy.all : copy.categories[validCategory];
  const text = [
    copy.title,
    copy.description,
    "",
    `<b>${escapeHtml(selectedLabel)}</b> \xB7 ${filteredApps.length} ${copy.apps} \xB7 ${copy.page} ${page + 1}/${pageCount}`,
    ...visibleApps.length ? [] : ["", copy.empty]
  ].join("\n");
  const keyboard = [];
  for (let index = 0; index < categories.length; index += 3) {
    keyboard.push(categories.slice(index, index + 3).map((category) => ({
      text: category === "All" ? copy.all : copy.categories[category],
      callback_data: category === "All" ? "launcher:category:All" : `launcher:category:${category}`
    })));
  }
  for (let index = 0; index < visibleApps.length; index += 2) {
    keyboard.push(visibleApps.slice(index, index + 2).map((app2) => ({
      text: `\u{1F310} ${Array.from(app2.title).slice(0, 58).join("")}`,
      ...allowMiniApps && app2.url.startsWith("https:") ? { web_app: { url: app2.url } } : { url: app2.url }
    })));
  }
  if (pageCount > 1) {
    keyboard.push([
      ...page > 0 ? [{ text: "\u25C0\uFE0F", callback_data: `launcher:page:${validCategory}:${page - 1}` }] : [],
      { text: `${page + 1}/${pageCount}`, callback_data: `launcher:page:${validCategory}:${page}` },
      ...page + 1 < pageCount ? [{ text: "\u25B6\uFE0F", callback_data: `launcher:page:${validCategory}:${page + 1}` }] : []
    ]);
  }
  return { text, reply_markup: { inline_keyboard: keyboard } };
}
function parseBotMenuCallback(data) {
  if (typeof data !== "string" || data.length > 64) return null;
  const categoryMatch = /^launcher:category:(All|Social|Work|Tools|Media|Other)$/.exec(data);
  if (categoryMatch) return { category: categoryMatch[1], page: 0 };
  const pageMatch = /^launcher:page:(All|Social|Work|Tools|Media|Other):(\d{1,4})$/.exec(data);
  if (pageMatch) return { category: pageMatch[1], page: Number(pageMatch[2]) };
  return null;
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
  const callback = update.callback_query;
  if (callback) {
    if (!callback.id) return;
    await callTelegramApi("answerCallbackQuery", { callback_query_id: callback.id });
    const state = parseBotMenuCallback(callback.data);
    const chatId = callback.message?.chat?.id;
    const messageId = callback.message?.message_id;
    if (!state || chatId === void 0 || messageId === void 0) return;
    const menu2 = renderBotAppMenu(
      getBotLanguage(callback.from?.language_code),
      state.category,
      state.page,
      callback.message?.chat?.type === "private"
    );
    await callTelegramApi("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: menu2.text,
      parse_mode: "HTML",
      reply_markup: menu2.reply_markup
    });
    return;
  }
  const message = update.message;
  if (!message?.chat?.id || typeof message.text !== "string") return;
  const command = message.text.trim().split(/\s+/, 1)[0].split("@", 1)[0];
  if (command !== "/start" && command !== "/launcher") return;
  const menu = renderBotAppMenu(
    getBotLanguage(message.from?.language_code),
    "All",
    0,
    message.chat.type === "private"
  );
  await callTelegramApi("sendMessage", {
    chat_id: message.chat.id,
    text: menu.text,
    parse_mode: "HTML",
    reply_markup: menu.reply_markup
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
        allowed_updates: ["message", "callback_query"]
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
