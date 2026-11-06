// server.ts
import express from "express";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
var isProd = process.env.NODE_ENV === "production";
var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
var telegramPublicBaseUrl = process.env.APP_URL?.trim() || (process.env.RAILWAY_PUBLIC_DOMAIN?.trim() ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN.trim().replace(/^https?:\/\//i, "")}` : void 0);
var telegramPublicUrl = telegramPublicBaseUrl ? new URL(telegramPublicBaseUrl) : void 0;
if (telegramPublicUrl && telegramPublicUrl.protocol !== "https:") {
  throw new Error("APP_URL must use HTTPS to enable Telegram webhook mode.");
}
var TELEGRAM_WEB_APP_URL = telegramPublicUrl ? new URL("/", telegramPublicUrl).toString() : void 0;
var TELEGRAM_WEBHOOK_URL = telegramPublicUrl ? new URL("/api/telegram/webhook", telegramPublicUrl).toString() : void 0;
var TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || randomBytes(32).toString("hex");
if (!/^[A-Za-z0-9_-]{1,256}$/.test(TELEGRAM_WEBHOOK_SECRET)) {
  throw new Error("TELEGRAM_WEBHOOK_SECRET must contain 1-256 letters, numbers, underscores, or hyphens.");
}
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
    env: isProd ? "production" : "development",
    telegramBot: {
      status: telegramBotStatus,
      configured: Boolean(BOT_TOKEN),
      delivery: !BOT_TOKEN ? "disabled" : TELEGRAM_WEBHOOK_URL ? "webhook" : "polling"
    }
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
var telegramAddedApps = [];
var pendingAppAdds = /* @__PURE__ */ new Map();
var BOT_DATA_DIR = path.resolve(process.env.BOT_DATA_DIR || path.join(__dirname, "data"));
var BOT_APPS_PATH = path.join(BOT_DATA_DIR, "telegram-apps.json");
var botAppsWriteQueue = Promise.resolve();
var chatLanguages = /* @__PURE__ */ new Map();
var telegramBotStatus = BOT_TOKEN ? "starting" : "disabled";
var BOT_COPY = {
  en: {
    title: "\u{1F4F1} <b>Your apps</b>",
    description: "Choose a category, then tap an app to open it in Telegram.",
    addApp: "\u2795 Add app",
    addPrompt: "Send an HTTPS link to add it to your app list. Send /cancel to stop.",
    addInvalid: "That is not a valid HTTPS link. Please try again or send /cancel.",
    addDuplicate: "That link is already in your app list.",
    addLimit: "Your app list is full.",
    addFailed: "The app could not be saved. Please try again.",
    addSuccess: "\u2705 Added {title}.",
    addCancelled: "Adding an app was cancelled.",
    addPrivateOnly: "Open a private chat with the bot to add an app.",
    help: "I keep your web apps organized and ready to open from Telegram.\n\n/start or /apps \u2014 browse your launcher\n/open <name> or /search <name> \u2014 find and open an app\n/add \u2014 save an HTTPS app link\n/remove \u2014 remove an app you added\n/language \u2014 change the bot language\n/cancel \u2014 stop adding an app",
    unknown: "I can help you launch and organize web apps. Use /help to see commands.",
    unsupported: "I can only process text links right now. Use /help to see what I can do.",
    nothingToCancel: "There is no active action to cancel.",
    searchPrompt: "Type an app name after /search.",
    noMatches: "No matching apps found. Use /apps to browse your launcher.",
    matches: "Search results",
    removeApp: "\u{1F5D1} Remove apps",
    removePrompt: "Choose an app to remove:",
    removeEmpty: "You have not added any apps yet.",
    removed: "\u2705 Removed {title}.",
    back: "\u21A9\uFE0F Back to apps",
    language: "Choose your language:",
    languageSaved: "Language updated.",
    commands: {
      start: "Open your web app launcher",
      apps: "Show your web apps",
      add: "Add an HTTPS web app link",
      open: "Open an app or show the launcher",
      search: "Find an app by name",
      remove: "Remove an app you added",
      language: "Change the bot language",
      help: "Show launcher help",
      cancel: "Cancel the current action"
    },
    page: "Page",
    apps: "apps",
    empty: "No apps in this category.",
    all: "All",
    categories: { Social: "Social", Work: "Work", Tools: "Tools", Media: "Media", Other: "Other" }
  },
  es: {
    title: "\u{1F4F1} <b>Tus aplicaciones</b>",
    description: "Elige una categor\xEDa y toca una aplicaci\xF3n para abrirla en Telegram.",
    addApp: "\u2795 Agregar aplicaci\xF3n",
    addPrompt: "Env\xEDa un enlace HTTPS para agregarlo. Env\xEDa /cancel para detener.",
    addInvalid: "El enlace HTTPS no es v\xE1lido. Int\xE9ntalo de nuevo o env\xEDa /cancel.",
    addDuplicate: "Ese enlace ya est\xE1 en tu lista.",
    addLimit: "La lista de aplicaciones est\xE1 llena.",
    addFailed: "No se pudo guardar la aplicaci\xF3n. Int\xE9ntalo de nuevo.",
    addSuccess: "\u2705 Se agreg\xF3 {title}.",
    addCancelled: "Se cancel\xF3 la adici\xF3n.",
    addPrivateOnly: "Abre un chat privado con el bot para agregar una aplicaci\xF3n.",
    help: "Organizo tus aplicaciones web para abrirlas desde Telegram.\n\n/start o /apps \u2014 explorar el lanzador\n/open <nombre> o /search <nombre> \u2014 buscar y abrir una aplicaci\xF3n\n/add \u2014 guardar un enlace HTTPS\n/remove \u2014 quitar una aplicaci\xF3n agregada\n/language \u2014 cambiar el idioma\n/cancel \u2014 cancelar la adici\xF3n",
    unknown: "Puedo ayudarte a abrir y organizar aplicaciones web. Usa /help para ver los comandos.",
    unsupported: "Por ahora solo puedo procesar enlaces de texto. Usa /help para ver los comandos.",
    nothingToCancel: "No hay ninguna acci\xF3n pendiente para cancelar.",
    searchPrompt: "Escribe el nombre despu\xE9s de /search.",
    noMatches: "No se encontraron aplicaciones. Usa /apps para explorar el lanzador.",
    matches: "Resultados de b\xFAsqueda",
    removeApp: "\u{1F5D1} Quitar aplicaciones",
    removePrompt: "Elige una aplicaci\xF3n para quitar:",
    removeEmpty: "A\xFAn no has agregado aplicaciones.",
    removed: "\u2705 Se quit\xF3 {title}.",
    back: "\u21A9\uFE0F Volver a las aplicaciones",
    language: "Elige tu idioma:",
    languageSaved: "Idioma actualizado.",
    commands: {
      start: "Abrir el lanzador de aplicaciones web",
      apps: "Mostrar tus aplicaciones web",
      add: "Agregar un enlace HTTPS",
      open: "Abrir una aplicaci\xF3n o ver el lanzador",
      search: "Buscar una aplicaci\xF3n por nombre",
      remove: "Quitar una aplicaci\xF3n agregada",
      language: "Cambiar el idioma del bot",
      help: "Ver ayuda del lanzador",
      cancel: "Cancelar la acci\xF3n actual"
    },
    page: "P\xE1gina",
    apps: "aplicaciones",
    empty: "No hay aplicaciones en esta categor\xEDa.",
    all: "Todas",
    categories: { Social: "Social", Work: "Trabajo", Tools: "Herramientas", Media: "Medios", Other: "Otros" }
  },
  pt: {
    title: "\u{1F4F1} <b>Seus aplicativos</b>",
    description: "Escolha uma categoria e toque em um aplicativo para abri-lo no Telegram.",
    addApp: "\u2795 Adicionar aplicativo",
    addPrompt: "Envie um link HTTPS para adicion\xE1-lo. Envie /cancel para parar.",
    addInvalid: "Esse link HTTPS n\xE3o \xE9 v\xE1lido. Tente novamente ou envie /cancel.",
    addDuplicate: "Esse link j\xE1 est\xE1 na sua lista.",
    addLimit: "Sua lista de aplicativos est\xE1 cheia.",
    addFailed: "N\xE3o foi poss\xEDvel salvar o aplicativo. Tente novamente.",
    addSuccess: "\u2705 {title} foi adicionado.",
    addCancelled: "Adi\xE7\xE3o cancelada.",
    addPrivateOnly: "Abra uma conversa privada com o bot para adicionar um aplicativo.",
    help: "Organizo seus aplicativos web para abrir pelo Telegram.\n\n/start ou /apps \u2014 explorar o lan\xE7ador\n/open <nome> ou /search <nome> \u2014 buscar e abrir um aplicativo\n/add \u2014 salvar um link HTTPS\n/remove \u2014 remover um aplicativo adicionado\n/language \u2014 alterar o idioma\n/cancel \u2014 cancelar a adi\xE7\xE3o",
    unknown: "Posso ajudar a abrir e organizar aplicativos web. Use /help para ver os comandos.",
    unsupported: "Por enquanto, s\xF3 consigo processar links em texto. Use /help para ver os comandos.",
    nothingToCancel: "N\xE3o h\xE1 nenhuma a\xE7\xE3o em andamento para cancelar.",
    searchPrompt: "Digite o nome do app depois de /search.",
    noMatches: "Nenhum app encontrado. Use /apps para explorar o lan\xE7ador.",
    matches: "Resultados da busca",
    removeApp: "\u{1F5D1} Remover aplicativos",
    removePrompt: "Escolha um aplicativo para remover:",
    removeEmpty: "Voc\xEA ainda n\xE3o adicionou aplicativos.",
    removed: "\u2705 {title} foi removido.",
    back: "\u21A9\uFE0F Voltar aos aplicativos",
    language: "Escolha seu idioma:",
    languageSaved: "Idioma atualizado.",
    commands: {
      start: "Abrir o lan\xE7ador de aplicativos web",
      apps: "Mostrar seus aplicativos web",
      add: "Adicionar um link HTTPS",
      open: "Abrir um aplicativo ou mostrar o lan\xE7ador",
      search: "Buscar um aplicativo pelo nome",
      remove: "Remover um aplicativo adicionado",
      language: "Alterar o idioma do bot",
      help: "Ver ajuda do lan\xE7ador",
      cancel: "Cancelar a a\xE7\xE3o atual"
    },
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
function normalizeBotApps(values, httpsOnly = false) {
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
    if (!["http:", "https:"].includes(parsedUrl.protocol) || httpsOnly && parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password) return [];
    const appChatId = typeof value.chatId === "number" && Number.isSafeInteger(value.chatId) ? value.chatId : void 0;
    return [{
      id,
      title: title.trim(),
      url: parsedUrl.toString(),
      category: APP_CATEGORIES.includes(category) ? category : "Other",
      ...appChatId !== void 0 ? { chatId: appChatId } : {}
    }];
  });
}
function getBotApps(chatId) {
  const seen = /* @__PURE__ */ new Set();
  return [
    ...normalizeBotApps(CORE_APPS),
    ...telegramAddedApps.filter((item) => item.chatId === void 0 || item.chatId === chatId)
  ].filter((item) => {
    const key = item.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 200);
}
function getChatAddedApps(chatId) {
  return telegramAddedApps.filter((item) => item.chatId === void 0 || item.chatId === chatId);
}
async function loadTelegramAddedApps() {
  try {
    const content = await readFile(BOT_APPS_PATH, "utf8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      telegramAddedApps = normalizeBotApps(parsed, true);
      return;
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.apps)) {
      throw new Error("Stored Telegram app data must contain an apps array.");
    }
    telegramAddedApps = normalizeBotApps(parsed.apps, true);
    if (isRecord(parsed.languages)) {
      for (const [chatId, language] of Object.entries(parsed.languages)) {
        const numericChatId = Number(chatId);
        if (Number.isSafeInteger(numericChatId) && (language === "en" || language === "es" || language === "pt")) {
          chatLanguages.set(numericChatId, language);
        }
      }
    }
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return;
    throw error;
  }
}
function persistTelegramAddedApps() {
  const write = botAppsWriteQueue.then(async () => {
    await mkdir(BOT_DATA_DIR, { recursive: true });
    const temporaryPath = `${BOT_APPS_PATH}.${randomUUID()}.tmp`;
    const data = {
      apps: telegramAddedApps,
      languages: Object.fromEntries(chatLanguages)
    };
    await writeFile(temporaryPath, JSON.stringify(data, null, 2), "utf8");
    await rename(temporaryPath, BOT_APPS_PATH);
  });
  botAppsWriteQueue = write.catch(() => void 0);
  return write;
}
function parseHttpsAppUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
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
function renderBotAppMenu(chatId, language, selectedCategory, requestedPage) {
  const copy = BOT_COPY[language];
  const apps = getBotApps(chatId);
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
      url: app2.url
    })));
  }
  if (pageCount > 1) {
    keyboard.push([
      ...page > 0 ? [{ text: "\u25C0\uFE0F", callback_data: `launcher:page:${validCategory}:${page - 1}` }] : [],
      { text: `${page + 1}/${pageCount}`, callback_data: `launcher:page:${validCategory}:${page}` },
      ...page + 1 < pageCount ? [{ text: "\u25B6\uFE0F", callback_data: `launcher:page:${validCategory}:${page + 1}` }] : []
    ]);
  }
  keyboard.push([{ text: copy.addApp, callback_data: "launcher:add" }]);
  keyboard.push([{ text: `\u{1F310} ${copy.language}`, callback_data: "launcher:languages" }]);
  if (getChatAddedApps(chatId).length) {
    keyboard.push([{ text: copy.removeApp, callback_data: "launcher:remove-page:0" }]);
  }
  return { text, reply_markup: { inline_keyboard: keyboard } };
}
function parseBotMenuCallback(data) {
  if (typeof data !== "string" || data.length > 64) return null;
  if (data === "launcher:add") return { action: "add" };
  if (data === "launcher:languages") return { action: "languages" };
  const languageMatch = /^launcher:language:(en|es|pt)$/.exec(data);
  if (languageMatch) return { action: "language", language: languageMatch[1] };
  const removeMatch = /^launcher:remove:(telegram-[a-f0-9-]{36})$/i.exec(data);
  if (removeMatch) return { action: "remove", id: removeMatch[1] };
  const removePageMatch = /^launcher:remove-page:(\d{1,3})$/.exec(data);
  if (removePageMatch) return { action: "remove-page", page: Number(removePageMatch[1]) };
  const categoryMatch = /^launcher:category:(All|Social|Work|Tools|Media|Other)$/.exec(data);
  if (categoryMatch) return { action: "menu", category: categoryMatch[1], page: 0 };
  const pageMatch = /^launcher:page:(All|Social|Work|Tools|Media|Other):(\d{1,4})$/.exec(data);
  if (pageMatch) {
    return { action: "menu", category: pageMatch[1], page: Number(pageMatch[2]) };
  }
  return null;
}
function renderBotRemoveMenu(chatId, language, requestedPage, notice) {
  const copy = BOT_COPY[language];
  const apps = getChatAddedApps(chatId);
  if (!apps.length) {
    return {
      text: [notice, copy.removeEmpty].filter(Boolean).join("\n"),
      reply_markup: {
        inline_keyboard: [[{ text: copy.back, callback_data: "launcher:category:All" }]]
      }
    };
  }
  const pageCount = Math.ceil(apps.length / BOT_PAGE_SIZE);
  const page = Math.max(0, Math.min(Math.floor(requestedPage), pageCount - 1));
  const start = page * BOT_PAGE_SIZE;
  const keyboard = apps.slice(start, start + BOT_PAGE_SIZE).map((item) => [{
    text: `\u{1F5D1} ${Array.from(item.title).slice(0, 50).join("")}`,
    callback_data: `launcher:remove:${item.id}`
  }]);
  if (pageCount > 1) {
    keyboard.push([
      ...page > 0 ? [{ text: "\u25C0\uFE0F", callback_data: `launcher:remove-page:${page - 1}` }] : [],
      { text: `${page + 1}/${pageCount}`, callback_data: `launcher:remove-page:${page}` },
      ...page + 1 < pageCount ? [{ text: "\u25B6\uFE0F", callback_data: `launcher:remove-page:${page + 1}` }] : []
    ]);
  }
  keyboard.push([{ text: copy.back, callback_data: "launcher:category:All" }]);
  return {
    text: [notice, copy.removePrompt].filter(Boolean).join("\n"),
    reply_markup: { inline_keyboard: keyboard }
  };
}
function renderBotLanguageMenu(language) {
  const copy = BOT_COPY[language];
  return {
    text: copy.language,
    reply_markup: {
      inline_keyboard: [[
        { text: "\u{1F1FA}\u{1F1F8} English", callback_data: "launcher:language:en" },
        { text: "\u{1F1EA}\u{1F1F8} Espa\xF1ol", callback_data: "launcher:language:es" },
        { text: "\u{1F1E7}\u{1F1F7} Portugu\xEAs", callback_data: "launcher:language:pt" }
      ], [{ text: copy.back, callback_data: "launcher:category:All" }]]
    }
  };
}
function findBotApps(chatId, query) {
  const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const normalizedQuery = normalize(query.trim()).slice(0, 100);
  if (!normalizedQuery) return [];
  return getBotApps(chatId).map((item) => {
    const title = normalize(item.title);
    const hostname = normalize(new URL(item.url).hostname.replace(/^www\./i, ""));
    const rank = title === normalizedQuery || hostname === normalizedQuery ? 0 : title.startsWith(normalizedQuery) || hostname.startsWith(normalizedQuery) ? 1 : title.includes(normalizedQuery) || hostname.includes(normalizedQuery) ? 2 : -1;
    return { item, rank };
  }).filter(({ rank }) => rank >= 0).sort((left, right) => left.rank - right.rank).slice(0, BOT_PAGE_SIZE).map(({ item }) => item);
}
function renderBotSearchResults(chatId, query, language) {
  const copy = BOT_COPY[language];
  const results = findBotApps(chatId, query);
  if (!results.length) {
    return {
      text: copy.noMatches,
      reply_markup: {
        inline_keyboard: [[{
          text: copy.title.replace(/<\/?b>/g, ""),
          callback_data: "launcher:category:All"
        }]]
      }
    };
  }
  return {
    text: `<b>${copy.matches}</b>
${escapeHtml(query.trim())}`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: results.map((item) => [{
        text: `\u{1F310} ${Array.from(item.title).slice(0, 58).join("")}`,
        url: item.url
      }])
    }
  };
}
function getChatLanguage(chatId, telegramLanguage) {
  return chatLanguages.get(chatId) || getBotLanguage(telegramLanguage);
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
    apps: CORE_APPS
  });
});
app.post("/api/apps/sync", (_req, res) => {
  res.status(410).json({
    status: "error",
    message: "Server-side app sync is disabled. App data stays in browser or Telegram Cloud Storage."
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
    const language2 = getChatLanguage(chatId2, callback.from?.language_code);
    if (state.action === "add") {
      if (chat?.type !== "private") {
        await callTelegramApi("answerCallbackQuery", {
          callback_query_id: callback.id,
          text: BOT_COPY[language2].addPrivateOnly,
          show_alert: true
        });
        return;
      }
      await callTelegramApi("answerCallbackQuery", { callback_query_id: callback.id });
      pendingAppAdds.set(chatId2, { messageId, language: language2 });
      await callTelegramApi("sendMessage", {
        chat_id: chatId2,
        text: BOT_COPY[language2].addPrompt,
        reply_markup: { force_reply: true }
      });
      return;
    }
    if (state.action === "remove" || state.action === "remove-page") {
      if (chat?.type !== "private") {
        await callTelegramApi("answerCallbackQuery", {
          callback_query_id: callback.id,
          text: BOT_COPY[language2].addPrivateOnly,
          show_alert: true
        });
        return;
      }
      await callTelegramApi("answerCallbackQuery", { callback_query_id: callback.id });
      if (state.action === "remove-page") {
        const menu4 = renderBotRemoveMenu(chatId2, language2, state.page);
        await callTelegramApi("editMessageText", {
          chat_id: chatId2,
          message_id: messageId,
          text: menu4.text,
          reply_markup: menu4.reply_markup
        });
        return;
      }
      const appIndex = telegramAddedApps.findIndex((item) => item.id === state.id && (item.chatId === void 0 || item.chatId === chatId2));
      if (appIndex < 0) {
        const menu4 = renderBotRemoveMenu(chatId2, language2, 0);
        await callTelegramApi("editMessageText", {
          chat_id: chatId2,
          message_id: messageId,
          text: menu4.text,
          reply_markup: menu4.reply_markup
        });
        return;
      }
      const [removedApp] = telegramAddedApps.splice(appIndex, 1);
      try {
        await persistTelegramAddedApps();
      } catch (error) {
        telegramAddedApps.splice(appIndex, 0, removedApp);
        console.error("[Telegram Bot] Could not persist app removal:", error);
        const menu4 = renderBotRemoveMenu(chatId2, language2, 0, BOT_COPY[language2].addFailed);
        await callTelegramApi("editMessageText", {
          chat_id: chatId2,
          message_id: messageId,
          text: menu4.text,
          reply_markup: menu4.reply_markup
        });
        return;
      }
      const copy = BOT_COPY[language2];
      const notice = copy.removed.replace("{title}", escapeHtml(removedApp.title));
      const menu3 = renderBotRemoveMenu(chatId2, language2, 0, notice);
      await callTelegramApi("editMessageText", {
        chat_id: chatId2,
        message_id: messageId,
        text: menu3.text,
        parse_mode: "HTML",
        reply_markup: menu3.reply_markup
      });
      return;
    }
    if (state.action === "languages") {
      await callTelegramApi("answerCallbackQuery", { callback_query_id: callback.id });
      const menu3 = renderBotLanguageMenu(language2);
      await callTelegramApi("editMessageText", {
        chat_id: chatId2,
        message_id: messageId,
        text: menu3.text,
        reply_markup: menu3.reply_markup
      });
      return;
    }
    if (state.action === "language") {
      await callTelegramApi("answerCallbackQuery", {
        callback_query_id: callback.id,
        text: BOT_COPY[state.language].languageSaved
      });
      const previousLanguage = chatLanguages.get(chatId2);
      chatLanguages.set(chatId2, state.language);
      try {
        await persistTelegramAddedApps();
      } catch (error) {
        if (previousLanguage) chatLanguages.set(chatId2, previousLanguage);
        else chatLanguages.delete(chatId2);
        console.error("[Telegram Bot] Could not persist language choice:", error);
        return;
      }
      const menu3 = renderBotAppMenu(chatId2, state.language, "All", 0);
      await callTelegramApi("editMessageText", {
        chat_id: chatId2,
        message_id: messageId,
        text: menu3.text,
        parse_mode: "HTML",
        reply_markup: menu3.reply_markup
      });
      return;
    }
    await callTelegramApi("answerCallbackQuery", { callback_query_id: callback.id });
    const menu2 = renderBotAppMenu(
      chatId2,
      language2,
      state.category,
      state.page
    );
    await callTelegramApi("editMessageText", {
      chat_id: chatId2,
      message_id: messageId,
      text: menu2.text,
      parse_mode: "HTML",
      reply_markup: menu2.reply_markup
    });
    return;
  }
  const message = update.message;
  if (!message?.chat?.id) return;
  const chatId = message.chat.id;
  const pendingAdd = pendingAppAdds.get(chatId);
  const language = pendingAdd?.language || getChatLanguage(chatId, message.from?.language_code);
  if (typeof message.text !== "string") {
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: pendingAdd ? BOT_COPY[language].addInvalid : BOT_COPY[language].unsupported,
      reply_markup: pendingAdd ? { force_reply: true } : void 0
    });
    return;
  }
  const input = message.text.trim();
  const command = input.split(/\s+/, 1)[0].split("@", 1)[0].toLowerCase();
  const commandArgument = input.split(/\s+/).slice(1).join(" ").trim();
  if (pendingAdd && (command === "/cancel" || command === "/cancelar")) {
    pendingAppAdds.delete(chatId);
    await callTelegramApi("sendMessage", { chat_id: chatId, text: BOT_COPY[language].addCancelled });
    return;
  }
  if (pendingAdd && !command.startsWith("/")) {
    const appUrl = parseHttpsAppUrl(input);
    if (!appUrl) {
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: BOT_COPY[language].addInvalid,
        reply_markup: { force_reply: true }
      });
      return;
    }
    const apps = getBotApps(chatId);
    if (apps.length >= 200) {
      pendingAppAdds.delete(chatId);
      await callTelegramApi("sendMessage", { chat_id: chatId, text: BOT_COPY[language].addLimit });
      return;
    }
    const normalizedUrl = appUrl.toString();
    if (apps.some((item) => item.url.toLowerCase() === normalizedUrl.toLowerCase())) {
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: BOT_COPY[language].addDuplicate,
        reply_markup: { force_reply: true }
      });
      return;
    }
    const title = appUrl.hostname.replace(/^www\./i, "");
    const app2 = {
      id: `telegram-${randomUUID()}`,
      title,
      url: normalizedUrl,
      category: "Other",
      chatId
    };
    telegramAddedApps = [...telegramAddedApps, app2];
    try {
      await persistTelegramAddedApps();
    } catch (error) {
      telegramAddedApps = telegramAddedApps.filter((item) => item.id !== app2.id);
      console.error("[Telegram Bot] Could not persist added app:", error);
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: BOT_COPY[language].addFailed,
        reply_markup: { force_reply: true }
      });
      return;
    }
    pendingAppAdds.delete(chatId);
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: BOT_COPY[language].addSuccess.replace("{title}", escapeHtml(title)),
      parse_mode: "HTML"
    });
    const menu2 = renderBotAppMenu(chatId, language, "Other", 0);
    if (pendingAdd.messageId !== void 0) {
      await callTelegramApi("editMessageText", {
        chat_id: chatId,
        message_id: pendingAdd.messageId,
        text: menu2.text,
        parse_mode: "HTML",
        reply_markup: menu2.reply_markup
      });
    } else {
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: menu2.text,
        parse_mode: "HTML",
        reply_markup: menu2.reply_markup
      });
    }
    return;
  }
  if (pendingAdd && command.startsWith("/")) pendingAppAdds.delete(chatId);
  if (command === "/cancel" || command === "/cancelar") {
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: BOT_COPY[language].nothingToCancel
    });
    return;
  }
  if (command === "/add") {
    if (message.chat.type !== "private") {
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: BOT_COPY[language].addPrivateOnly
      });
      return;
    }
    pendingAppAdds.set(chatId, { language });
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: BOT_COPY[language].addPrompt,
      reply_markup: { force_reply: true }
    });
    return;
  }
  if (command === "/remove") {
    if (message.chat.type !== "private") {
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: BOT_COPY[language].addPrivateOnly
      });
      return;
    }
    const menu2 = renderBotRemoveMenu(chatId, language, 0);
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: menu2.text,
      reply_markup: menu2.reply_markup
    });
    return;
  }
  if (command === "/language") {
    const menu2 = renderBotLanguageMenu(language);
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: menu2.text,
      reply_markup: menu2.reply_markup
    });
    return;
  }
  if (command === "/open" || command === "/search") {
    if (!commandArgument && command === "/search") {
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: BOT_COPY[language].searchPrompt
      });
      return;
    }
    if (commandArgument) {
      const results = renderBotSearchResults(chatId, commandArgument, language);
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: results.text,
        ...results.parse_mode ? { parse_mode: results.parse_mode } : {},
        reply_markup: results.reply_markup
      });
      return;
    }
    const menu2 = renderBotAppMenu(chatId, language, "All", 0);
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: menu2.text,
      parse_mode: "HTML",
      reply_markup: menu2.reply_markup
    });
    return;
  }
  if (command === "/help") {
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: BOT_COPY[language].help,
      reply_markup: {
        inline_keyboard: [[{
          text: BOT_COPY[language].title.replace(/<\/?b>/g, ""),
          callback_data: "launcher:category:All"
        }]]
      }
    });
    return;
  }
  pendingAppAdds.delete(chatId);
  if (!["/start", "/apps", "/launcher"].includes(command)) {
    const naturalSearch = /^(?:open|launch|abrir|abre)\s+(.+)$/i.exec(input);
    const results = naturalSearch ? findBotApps(chatId, naturalSearch[1]) : command.startsWith("/") ? [] : findBotApps(chatId, input);
    if (results.length) {
      const searchResults = renderBotSearchResults(chatId, naturalSearch?.[1] || input, language);
      await callTelegramApi("sendMessage", {
        chat_id: chatId,
        text: searchResults.text,
        parse_mode: searchResults.parse_mode,
        reply_markup: searchResults.reply_markup
      });
      return;
    }
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: BOT_COPY[language].unknown,
      reply_markup: {
        inline_keyboard: [[{
          text: BOT_COPY[language].title.replace(/<\/?b>/g, ""),
          callback_data: "launcher:category:All"
        }]]
      }
    });
    return;
  }
  const menu = renderBotAppMenu(
    chatId,
    language,
    "All",
    0
  );
  await callTelegramApi("sendMessage", {
    chat_id: message.chat.id,
    text: menu.text,
    parse_mode: "HTML",
    reply_markup: menu.reply_markup
  });
}
app.post("/api/telegram/webhook", (req, res) => {
  if (!BOT_TOKEN || !TELEGRAM_WEBHOOK_URL) {
    res.sendStatus(404);
    return;
  }
  const receivedSecret = req.get("X-Telegram-Bot-Api-Secret-Token");
  const receivedSecretBuffer = Buffer.from(receivedSecret || "");
  const expectedSecretBuffer = Buffer.from(TELEGRAM_WEBHOOK_SECRET);
  if (receivedSecretBuffer.length !== expectedSecretBuffer.length || !timingSafeEqual(receivedSecretBuffer, expectedSecretBuffer)) {
    res.sendStatus(401);
    return;
  }
  const update = req.body;
  if (!update || typeof update !== "object" || !Number.isInteger(update.update_id)) {
    res.sendStatus(400);
    return;
  }
  res.status(200).send("OK");
  void handleTelegramUpdate(update).catch((error) => {
    const details = error instanceof Error ? error.message : "Unknown Telegram webhook error.";
    console.warn("[Telegram webhook] Failed to update the app menu:", details);
  });
});
async function registerTelegramCommands() {
  const commandNames = ["start", "apps", "open", "search", "add", "remove", "language", "help", "cancel"];
  const commandsFor = (language) => commandNames.map((command) => ({
    command,
    description: BOT_COPY[language].commands[command]
  }));
  try {
    await callTelegramApi("setMyCommands", { commands: commandsFor("en") });
    await callTelegramApi("setMyCommands", { commands: commandsFor("es"), language_code: "es" });
    await callTelegramApi("setMyCommands", { commands: commandsFor("pt"), language_code: "pt" });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown Telegram command setup error.";
    console.warn("[Telegram Bot] Could not register commands:", details);
  }
  if (TELEGRAM_WEB_APP_URL) {
    try {
      await callTelegramApi("setChatMenuButton", {
        menu_button: {
          type: "web_app",
          text: "Open launcher",
          web_app: { url: TELEGRAM_WEB_APP_URL }
        }
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown Telegram menu setup error.";
      console.warn("[Telegram Bot] Could not set the launcher menu button:", details);
    }
  }
}
async function startTelegramWebhook() {
  if (!BOT_TOKEN || !TELEGRAM_WEBHOOK_URL) return;
  let retryDelay = 1e3;
  while (true) {
    try {
      await callTelegramApi("setWebhook", {
        url: TELEGRAM_WEBHOOK_URL,
        secret_token: TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query"]
      });
      await registerTelegramCommands();
      telegramBotStatus = "running";
      console.log("[Telegram Bot] Webhook delivery started.");
      return;
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown Telegram webhook setup error.";
      telegramBotStatus = "reconnecting";
      console.error("[Telegram Bot] Could not configure webhook; retrying:", details);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 3e4);
    }
  }
}
async function startTelegramPolling() {
  if (!BOT_TOKEN) return;
  let initializationDelay = 1e3;
  while (true) {
    try {
      await callTelegramApi("deleteWebhook", { drop_pending_updates: false });
      break;
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown Telegram polling error.";
      telegramBotStatus = "reconnecting";
      console.error("[Telegram Bot] Could not initialize long polling; retrying:", details);
      await new Promise((resolve) => setTimeout(resolve, initializationDelay));
      initializationDelay = Math.min(initializationDelay * 2, 3e4);
    }
  }
  await registerTelegramCommands();
  console.log("[Telegram Bot] Long polling started.");
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
      telegramBotStatus = "running";
      retryDelay = 1e3;
    } catch (error) {
      const details = error instanceof Error ? error.message : "Unknown Telegram polling error.";
      telegramBotStatus = "reconnecting";
      console.error("[Telegram Bot] Polling failed; retrying:", details);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 3e4);
    }
  }
}
async function startServer() {
  await loadTelegramAddedApps();
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
    if (TELEGRAM_WEBHOOK_URL) void startTelegramWebhook();
    else if (BOT_TOKEN) void startTelegramPolling();
  });
}
startServer();
