// server.ts
import express from "express";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
var chatStates = /* @__PURE__ */ new Map();
var pendingAppAdds = /* @__PURE__ */ new Set();
var BOT_STATE_PATH = path.resolve(process.env.BOT_DATA_DIR || path.join(__dirname, "data"), "bot-state.json");
var stateWriteQueue = Promise.resolve();
var BOT_COPY = {
  en: {
    title: "\u{1F4F1} Your apps",
    welcome: "\u{1F44B} Welcome to your Web App Launcher!\nChoose your preferred language to get started.",
    description: "Tap an app to open it. Use \u201CAdd an app\u201D to save another link right here in chat.",
    addMore: "\u2795 Add more apps",
    addPrompt: "Send the app link (starting with https://). Send /cancel to stop.",
    added: "\u2705 App added: {title}",
    alreadyAdded: "That app is already in your list: {title}",
    invalidUrl: "That does not look like a valid HTTPS link. Send a link starting with https://, or /cancel.",
    saveFailed: "Could not save that app right now. Please try again.",
    appLimit: "Your list has reached the 200-app limit.",
    cancelled: "Adding app cancelled.",
    privateOnly: "Please use this command in a private chat with the bot.",
    page: "Page",
    apps: "apps",
    empty: "No apps yet. Add your first app to get started."
  },
  es: {
    title: "\u{1F4F1} Tus aplicaciones",
    welcome: "\u{1F44B} \xA1Te damos la bienvenida a tu lanzador de aplicaciones web!\nElige tu idioma preferido para comenzar.",
    description: "Toca una aplicaci\xF3n para abrirla. Usa \xABAgregar aplicaci\xF3n\xBB para guardar otro enlace aqu\xED mismo.",
    addMore: "\u2795 Agregar m\xE1s aplicaciones",
    addPrompt: "Env\xEDa el enlace de la aplicaci\xF3n (debe comenzar con https://). Env\xEDa /cancel para detener.",
    added: "\u2705 Aplicaci\xF3n agregada: {title}",
    alreadyAdded: "Esa aplicaci\xF3n ya est\xE1 en tu lista: {title}",
    invalidUrl: "El enlace no parece v\xE1lido. Env\xEDa un enlace que comience con https:// o /cancel.",
    saveFailed: "No se pudo guardar la aplicaci\xF3n. Int\xE9ntalo de nuevo.",
    appLimit: "Tu lista lleg\xF3 al l\xEDmite de 200 aplicaciones.",
    cancelled: "Se cancel\xF3 la adici\xF3n.",
    privateOnly: "Usa este comando en un chat privado con el bot.",
    page: "P\xE1gina",
    apps: "aplicaciones",
    empty: "A\xFAn no tienes aplicaciones. Agrega la primera para comenzar."
  },
  pt: {
    title: "\u{1F4F1} Seus aplicativos",
    welcome: "\u{1F44B} Boas-vindas ao seu lan\xE7ador de aplicativos web!\nEscolha seu idioma preferido para come\xE7ar.",
    description: "Toque em um aplicativo para abrir. Use \xABAdicionar aplicativo\xBB para salvar outro link aqui mesmo.",
    addMore: "\u2795 Adicionar mais aplicativos",
    addPrompt: "Envie o link do aplicativo (come\xE7ando com https://). Envie /cancelar para parar.",
    added: "\u2705 Aplicativo adicionado: {title}",
    alreadyAdded: "Esse aplicativo j\xE1 est\xE1 na sua lista: {title}",
    invalidUrl: "Esse link n\xE3o parece v\xE1lido. Envie um link come\xE7ando com https:// ou /cancelar.",
    saveFailed: "N\xE3o foi poss\xEDvel salvar o aplicativo agora. Tente novamente.",
    appLimit: "Sua lista atingiu o limite de 200 aplicativos.",
    cancelled: "Adi\xE7\xE3o cancelada.",
    privateOnly: "Use este comando em uma conversa privada com o bot.",
    page: "P\xE1gina",
    apps: "aplicativos",
    empty: "Voc\xEA ainda n\xE3o tem aplicativos. Adicione o primeiro para come\xE7ar."
  }
};
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function normalizeBotApps(values) {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
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
function getBotApps(chatId) {
  return normalizeBotApps(chatStates.get(chatId)?.apps || CORE_APPS);
}
async function loadBotState() {
  let persisted;
  try {
    persisted = JSON.parse(await readFile(BOT_STATE_PATH, "utf8"));
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return;
    throw error;
  }
  if (!isRecord(persisted)) throw new Error("Bot state file must contain an object keyed by chat ID.");
  for (const [chatIdText, value] of Object.entries(persisted)) {
    const chatId = Number(chatIdText);
    if (!Number.isSafeInteger(chatId) || !isRecord(value)) continue;
    const state = {};
    if (value.language === "en" || value.language === "es" || value.language === "pt") {
      state.language = value.language;
    }
    if (Array.isArray(value.apps)) state.apps = normalizeBotApps(value.apps);
    if (state.language || state.apps) chatStates.set(chatId, state);
  }
}
function persistBotState() {
  const stateSnapshot = JSON.stringify(Object.fromEntries(chatStates));
  const write = stateWriteQueue.catch(() => void 0).then(async () => {
    await mkdir(path.dirname(BOT_STATE_PATH), { recursive: true });
    const temporaryPath = `${BOT_STATE_PATH}.${process.pid}.tmp`;
    await writeFile(temporaryPath, stateSnapshot, "utf8");
    await rename(temporaryPath, BOT_STATE_PATH);
  });
  stateWriteQueue = write;
  return write;
}
function getBotLanguage(languageCode) {
  if (typeof languageCode !== "string") return "en";
  if (languageCode.toLowerCase().startsWith("pt")) return "pt";
  if (languageCode.toLowerCase().startsWith("es")) return "es";
  return "en";
}
function parseAppUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && value.length <= 2048 ? url : null;
  } catch {
    return null;
  }
}
var BOT_LANGUAGES = [
  { language: "en", label: "\u{1F1FA}\u{1F1F8} English" },
  { language: "pt", label: "\u{1F1E7}\u{1F1F7} Portugu\xEAs" },
  { language: "es", label: "\u{1F1EA}\u{1F1F8} Espa\xF1ol" }
];
function renderBotWelcome(language) {
  const copy = BOT_COPY[language];
  return {
    text: copy.welcome,
    reply_markup: {
      inline_keyboard: [
        BOT_LANGUAGES.map(({ language: option, label }) => ({
          text: label,
          callback_data: `language:${option}`
        }))
      ]
    }
  };
}
function renderBotAppMenu(chatId, language, requestedPage) {
  const copy = BOT_COPY[language];
  const apps = getBotApps(chatId);
  const pageCount = Math.max(1, Math.ceil(apps.length / BOT_PAGE_SIZE));
  const page = Math.max(0, Math.min(Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0, pageCount - 1));
  const visibleApps = apps.slice(page * BOT_PAGE_SIZE, (page + 1) * BOT_PAGE_SIZE);
  const text = [
    copy.title,
    copy.description,
    "",
    `${apps.length} ${copy.apps} \xB7 ${copy.page} ${page + 1}/${pageCount}`,
    ...visibleApps.length ? [] : ["", copy.empty]
  ].join("\n");
  const keyboard = [];
  for (let index = 0; index < visibleApps.length; index += 2) {
    keyboard.push(visibleApps.slice(index, index + 2).map((app2) => ({
      text: `\u{1F310} ${Array.from(app2.title).slice(0, 60).join("")}`,
      url: app2.url
    })));
  }
  keyboard.push([{ text: copy.addMore, callback_data: "add-app" }]);
  keyboard.push(BOT_LANGUAGES.map(({ language: option, label }) => ({
    text: label,
    callback_data: `language:${option}`
  })));
  if (pageCount > 1) {
    keyboard.push([
      ...page > 0 ? [{ text: "\u25C0\uFE0F", callback_data: `apps:${language}:${page - 1}` }] : [],
      { text: `${page + 1}/${pageCount}`, callback_data: `apps:${language}:${page}` },
      ...page + 1 < pageCount ? [{ text: "\u25B6\uFE0F", callback_data: `apps:${language}:${page + 1}` }] : []
    ]);
  }
  return { text, reply_markup: { inline_keyboard: keyboard } };
}
function parseBotMenuCallback(data) {
  if (typeof data !== "string" || data.length > 64) return null;
  if (data === "add-app") return { action: "add" };
  const languageMatch = /^language:(en|es|pt)$/.exec(data);
  if (languageMatch) return { action: "language", language: languageMatch[1], page: 0 };
  const pageMatch = /^apps:(en|es|pt):(\d{1,4})$/.exec(data);
  if (pageMatch) return { action: "page", language: pageMatch[1], page: Number(pageMatch[2]) };
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
  if (Array.isArray(apps)) {
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
    const state = parseBotMenuCallback(callback.data);
    const chat = callback.message?.chat;
    const chatId2 = chat?.id;
    const messageId = callback.message?.message_id;
    if (!state || chatId2 === void 0 || messageId === void 0) {
      await callTelegramApi("answerCallbackQuery", { callback_query_id: callback.id });
      return;
    }
    if (state.action === "add") {
      if (chat?.type !== "private") {
        const language4 = chatStates.get(chatId2)?.language || getBotLanguage(callback.from?.language_code);
        await callTelegramApi("answerCallbackQuery", {
          callback_query_id: callback.id,
          text: language4 === "pt" ? "Abra uma conversa privada com o bot para adicionar aplicativos." : language4 === "es" ? "Abre un chat privado con el bot para agregar aplicaciones." : "Open a private chat with the bot to add apps.",
          show_alert: true
        });
        return;
      }
      await callTelegramApi("answerCallbackQuery", { callback_query_id: callback.id });
      const language3 = chatStates.get(chatId2)?.language || getBotLanguage(callback.from?.language_code);
      pendingAppAdds.add(chatId2);
      await callTelegramApi("sendMessage", {
        chat_id: chatId2,
        text: BOT_COPY[language3].addPrompt,
        reply_markup: { force_reply: true }
      });
      return;
    }
    await callTelegramApi("answerCallbackQuery", { callback_query_id: callback.id });
    if (!state.language) return;
    const language2 = state.language;
    if (state.action === "language") {
      const previousState = chatStates.get(chatId2);
      const chatState = { ...previousState };
      chatState.language = language2;
      chatStates.set(chatId2, chatState);
      try {
        await persistBotState();
      } catch (error) {
        if (previousState) chatStates.set(chatId2, previousState);
        else chatStates.delete(chatId2);
        console.error("[Telegram Bot] Could not persist selected language:", error);
        return;
      }
    }
    const menu2 = renderBotAppMenu(chatId2, language2, state.page || 0);
    await callTelegramApi("editMessageText", {
      chat_id: chatId2,
      message_id: messageId,
      text: menu2.text,
      reply_markup: menu2.reply_markup
    });
    return;
  }
  const message = update.message;
  const chatId = message?.chat?.id;
  if (chatId === void 0 || typeof message?.text !== "string") return;
  const input = message.text.trim();
  const command = input.split(/\s+/, 1)[0].split("@", 1)[0].toLowerCase();
  const savedLanguage = chatStates.get(chatId)?.language;
  const language = savedLanguage || getBotLanguage(message.from?.language_code);
  if (pendingAppAdds.has(chatId) && (command === "/cancel" || command === "/cancelar")) {
    pendingAppAdds.delete(chatId);
    await callTelegramApi("sendMessage", { chat_id: chatId, text: BOT_COPY[language].cancelled });
    return;
  }
  if (pendingAppAdds.has(chatId) && !command.startsWith("/")) {
    if (message.chat?.type !== "private") {
      pendingAppAdds.delete(chatId);
      return;
    }
    const appUrl = parseAppUrl(input);
    if (!appUrl) {
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: BOT_COPY[language].invalidUrl,
        reply_markup: { force_reply: true }
      });
      return;
    }
    const apps = getBotApps(chatId);
    if (apps.length >= 200) {
      pendingAppAdds.delete(chatId);
      await callTelegramApi("sendMessage", { chat_id: chatId, text: BOT_COPY[language].appLimit });
      return;
    }
    const normalizedUrl = appUrl.toString();
    if (apps.some((app2) => app2.url === normalizedUrl)) {
      pendingAppAdds.delete(chatId);
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: BOT_COPY[language].alreadyAdded.replace("{title}", appUrl.hostname)
      });
      return;
    }
    const title = appUrl.hostname.replace(/^www\./i, "");
    const previousState = chatStates.get(chatId);
    const chatState = { ...previousState };
    chatState.apps = [...apps, {
      id: `custom-${Date.now()}-${chatId}`,
      title,
      url: normalizedUrl,
      category: "Other"
    }];
    chatStates.set(chatId, chatState);
    try {
      await persistBotState();
    } catch (error) {
      if (previousState) chatStates.set(chatId, previousState);
      else chatStates.delete(chatId);
      console.error("[Telegram Bot] Could not persist app list:", error);
      await callTelegramApi("sendMessage", { chat_id: chatId, text: BOT_COPY[language].saveFailed });
      return;
    }
    pendingAppAdds.delete(chatId);
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: BOT_COPY[language].added.replace("{title}", title)
    });
    const menu2 = renderBotAppMenu(chatId, language, 0);
    await callTelegramApi("sendMessage", { chat_id: chatId, text: menu2.text, reply_markup: menu2.reply_markup });
    return;
  }
  if (command === "/cancel" || command === "/cancelar") {
    await callTelegramApi("sendMessage", { chat_id: chatId, text: BOT_COPY[language].cancelled });
    return;
  }
  if (command === "/add") {
    if (message.chat?.type !== "private") {
      await callTelegramApi("sendMessage", { chat_id: chatId, text: BOT_COPY[language].privateOnly });
      return;
    }
    pendingAppAdds.add(chatId);
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: BOT_COPY[language].addPrompt,
      reply_markup: { force_reply: true }
    });
    return;
  }
  if (!["/start", "/launcher", "/apps", "/language"].includes(command)) return;
  pendingAppAdds.delete(chatId);
  const menu = command === "/start" || command === "/language" ? renderBotWelcome(language) : renderBotAppMenu(chatId, language, 0);
  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text: menu.text,
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
    await loadBotState();
    await callTelegramApi("deleteWebhook", { drop_pending_updates: false });
    console.log("[Telegram Bot] Long polling started.");
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown Telegram polling error.";
    console.error("[Telegram Bot] Could not initialize long polling:", details);
    return;
  }
  try {
    const botCommands = [
      { command: "start", description: "Welcome and choose your language" },
      { command: "apps", description: "Show your apps" },
      { command: "language", description: "Change language" },
      { command: "add", description: "Add an app link in chat" },
      { command: "cancel", description: "Cancel adding an app" }
    ];
    await callTelegramApi("setMyCommands", { commands: botCommands });
    await callTelegramApi("setMyCommands", {
      commands: [
        { command: "start", description: "Bienvenida y elegir idioma" },
        { command: "apps", description: "Mostrar tus aplicaciones" },
        { command: "language", description: "Cambiar idioma" },
        { command: "add", description: "Agregar un enlace aqu\xED en el chat" },
        { command: "cancel", description: "Cancelar la adici\xF3n" }
      ],
      language_code: "es"
    });
    await callTelegramApi("setMyCommands", {
      commands: [
        { command: "start", description: "Boas-vindas e escolha o idioma" },
        { command: "apps", description: "Mostrar seus aplicativos" },
        { command: "language", description: "Alterar idioma" },
        { command: "add", description: "Adicionar um link aqui no chat" },
        { command: "cancel", description: "Cancelar a adi\xE7\xE3o" }
      ],
      language_code: "pt"
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown Telegram command setup error.";
    console.warn("[Telegram Bot] Could not register localized commands:", details);
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
