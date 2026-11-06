import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const telegramPublicBaseUrl =
  process.env.APP_URL?.trim() ||
  (process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN.trim().replace(/^https?:\/\//i, '')}`
    : undefined);
const telegramPublicUrl = telegramPublicBaseUrl ? new URL(telegramPublicBaseUrl) : undefined;
if (telegramPublicUrl && telegramPublicUrl.protocol !== 'https:') {
  throw new Error('APP_URL must use HTTPS to enable Telegram webhook mode.');
}
const TELEGRAM_WEB_APP_URL = telegramPublicUrl
  ? new URL('/', telegramPublicUrl).toString()
  : undefined;
const TELEGRAM_WEBHOOK_URL = telegramPublicUrl
  ? new URL('/api/telegram/webhook', telegramPublicUrl).toString()
  : undefined;
const TELEGRAM_WEBHOOK_SECRET =
  process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || randomBytes(32).toString('hex');
if (!/^[A-Za-z0-9_-]{1,256}$/.test(TELEGRAM_WEBHOOK_SECRET)) {
  throw new Error('TELEGRAM_WEBHOOK_SECRET must contain 1-256 letters, numbers, underscores, or hyphens.');
}
if (!BOT_TOKEN) {
  console.warn('[Telegram Bot] TELEGRAM_BOT_TOKEN is not configured; bot commands are disabled.');
}

// Permissive CORS & Security Headers for Mobile WebViews & Emulators
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// Minimal JSON parser for Telegram webhook
app.use(express.json({ limit: '32kb' }));

// Health check endpoint (for mobile WebView & PWA connectivity diagnostics)
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    env: isProd ? 'production' : 'development',
    telegramBot: {
      status: telegramBotStatus,
      configured: Boolean(BOT_TOKEN),
      delivery: !BOT_TOKEN ? 'disabled' : TELEGRAM_WEBHOOK_URL ? 'webhook' : 'polling',
    },
  });
});

// Network & diagnostics endpoint (helps identify local IP and emulator configuration)
app.get('/api/network-info', (req: Request, res: Response) => {
  const host = req.get('host') || `localhost:${PORT}`;
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  
  res.status(200).json({
    status: 'ok',
    serverPort: PORT,
    detectedHost: host,
    protocol,
    mobileTips: {
      androidEmulatorHost: `http://10.0.2.2:${PORT}`,
      genymotionHost: `http://10.0.3.2:${PORT}`,
      iosSimulatorHost: `http://127.0.0.1:${PORT}`,
      bindAddress: '0.0.0.0 (all network interfaces)',
      cleartextNote: 'Requires android:usesCleartextTraffic="true" on Android 9+ for HTTP',
      serviceWorkerRequirement: 'Service Workers require HTTPS or localhost/127.0.0.1/10.0.2.2',
    },
  });
});

// Core default apps metadata list for Service Worker background sync
const CORE_APPS = [
  {
    id: 'facebook',
    title: 'Facebook',
    url: 'https://m.facebook.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/facebook.png',
    category: 'Social',
    isCustom: false,
  },
  {
    id: 'instagram',
    title: 'Instagram',
    url: 'https://www.instagram.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/instagram.png',
    category: 'Social',
    isCustom: false,
  },
  {
    id: 'linkedin',
    title: 'LinkedIn',
    url: 'https://www.linkedin.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/linkedin.png',
    category: 'Social',
    isCustom: false,
  },
  {
    id: 'wikipedia',
    title: 'Wikipedia',
    url: 'https://m.wikipedia.org',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wikipedia.png',
    category: 'Tools',
    isCustom: false,
  },
  {
    id: 'youtube',
    title: 'YouTube',
    url: 'https://www.youtube.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/youtube.png',
    category: 'Media',
    isCustom: false,
  },
  {
    id: 'x',
    title: 'X / Twitter',
    url: 'https://mobile.x.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/x.png',
    category: 'Social',
    isCustom: false,
  },
];

type AppCategory = 'Social' | 'Work' | 'Tools' | 'Media' | 'Other';
type BotLanguage = 'en' | 'es' | 'pt';
type TelegramBotApp = {
  id: string;
  title: string;
  url: string;
  category: AppCategory;
  chatId?: number;
};
type TelegramApiResponse<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
};
type TelegramBotMessage = {
  chat?: { id?: number; type?: 'private' | 'group' | 'supergroup' | 'channel' };
  message_id?: number;
  text?: string;
  from?: { language_code?: string };
};
type TelegramBotUpdate = {
  update_id: number;
  message?: TelegramBotMessage;
  callback_query?: {
    id?: string;
    data?: string;
    from?: { language_code?: string };
    message?: TelegramBotMessage;
  };
};

const APP_CATEGORIES: AppCategory[] = ['Social', 'Work', 'Tools', 'Media', 'Other'];
const BOT_PAGE_SIZE = 8;
let telegramAddedApps: TelegramBotApp[] = [];
const pendingAppAdds = new Map<number, {
  messageId?: number;
  language: BotLanguage;
}>();
const BOT_DATA_DIR = path.resolve(process.env.BOT_DATA_DIR || path.join(__dirname, 'data'));
const BOT_APPS_PATH = path.join(BOT_DATA_DIR, 'telegram-apps.json');
let botAppsWriteQueue: Promise<void> = Promise.resolve();
const chatLanguages = new Map<number, BotLanguage>();
let telegramBotStatus: 'disabled' | 'starting' | 'running' | 'reconnecting' =
  BOT_TOKEN ? 'starting' : 'disabled';

const BOT_COPY: Record<BotLanguage, {
  title: string;
  description: string;
  addApp: string;
  addPrompt: string;
  addInvalid: string;
  addDuplicate: string;
  addLimit: string;
  addFailed: string;
  addSuccess: string;
  addCancelled: string;
  addPrivateOnly: string;
  help: string;
  unknown: string;
  unsupported: string;
  nothingToCancel: string;
  searchPrompt: string;
  noMatches: string;
  matches: string;
  removeApp: string;
  removePrompt: string;
  removeEmpty: string;
  removed: string;
  back: string;
  language: string;
  languageSaved: string;
  commands: {
    start: string;
    apps: string;
    add: string;
    open: string;
    search: string;
    remove: string;
    language: string;
    help: string;
    cancel: string;
  };
  page: string;
  apps: string;
  empty: string;
  all: string;
  categories: Record<AppCategory, string>;
}> = {
  en: {
    title: '📱 <b>Your apps</b>',
    description: 'Choose a category, then tap an app to open it in Telegram.',
    addApp: '➕ Add app',
    addPrompt: 'Send an HTTPS link to add it to your app list. Send /cancel to stop.',
    addInvalid: 'That is not a valid HTTPS link. Please try again or send /cancel.',
    addDuplicate: 'That link is already in your app list.',
    addLimit: 'Your app list is full.',
    addFailed: 'The app could not be saved. Please try again.',
    addSuccess: '✅ Added {title}.',
    addCancelled: 'Adding an app was cancelled.',
    addPrivateOnly: 'Open a private chat with the bot to add an app.',
    help: 'I keep your web apps organized and ready to open from Telegram.\n\n/start or /apps — browse your launcher\n/open <name> or /search <name> — find and open an app\n/add — save an HTTPS app link\n/remove — remove an app you added\n/language — change the bot language\n/cancel — stop adding an app',
    unknown: 'I can help you launch and organize web apps. Use /help to see commands.',
    unsupported: 'I can only process text links right now. Use /help to see what I can do.',
    nothingToCancel: 'There is no active action to cancel.',
    searchPrompt: 'Type an app name after /search.',
    noMatches: 'No matching apps found. Use /apps to browse your launcher.',
    matches: 'Search results',
    removeApp: '🗑 Remove apps',
    removePrompt: 'Choose an app to remove:',
    removeEmpty: 'You have not added any apps yet.',
    removed: '✅ Removed {title}.',
    back: '↩️ Back to apps',
    language: 'Choose your language:',
    languageSaved: 'Language updated.',
    commands: {
      start: 'Open your web app launcher',
      apps: 'Show your web apps',
      add: 'Add an HTTPS web app link',
      open: 'Open an app or show the launcher',
      search: 'Find an app by name',
      remove: 'Remove an app you added',
      language: 'Change the bot language',
      help: 'Show launcher help',
      cancel: 'Cancel the current action',
    },
    page: 'Page',
    apps: 'apps',
    empty: 'No apps in this category.',
    all: 'All',
    categories: { Social: 'Social', Work: 'Work', Tools: 'Tools', Media: 'Media', Other: 'Other' },
  },
  es: {
    title: '📱 <b>Tus aplicaciones</b>',
    description: 'Elige una categoría y toca una aplicación para abrirla en Telegram.',
    addApp: '➕ Agregar aplicación',
    addPrompt: 'Envía un enlace HTTPS para agregarlo. Envía /cancel para detener.',
    addInvalid: 'El enlace HTTPS no es válido. Inténtalo de nuevo o envía /cancel.',
    addDuplicate: 'Ese enlace ya está en tu lista.',
    addLimit: 'La lista de aplicaciones está llena.',
    addFailed: 'No se pudo guardar la aplicación. Inténtalo de nuevo.',
    addSuccess: '✅ Se agregó {title}.',
    addCancelled: 'Se canceló la adición.',
    addPrivateOnly: 'Abre un chat privado con el bot para agregar una aplicación.',
    help: 'Organizo tus aplicaciones web para abrirlas desde Telegram.\n\n/start o /apps — explorar el lanzador\n/open <nombre> o /search <nombre> — buscar y abrir una aplicación\n/add — guardar un enlace HTTPS\n/remove — quitar una aplicación agregada\n/language — cambiar el idioma\n/cancel — cancelar la adición',
    unknown: 'Puedo ayudarte a abrir y organizar aplicaciones web. Usa /help para ver los comandos.',
    unsupported: 'Por ahora solo puedo procesar enlaces de texto. Usa /help para ver los comandos.',
    nothingToCancel: 'No hay ninguna acción pendiente para cancelar.',
    searchPrompt: 'Escribe el nombre después de /search.',
    noMatches: 'No se encontraron aplicaciones. Usa /apps para explorar el lanzador.',
    matches: 'Resultados de búsqueda',
    removeApp: '🗑 Quitar aplicaciones',
    removePrompt: 'Elige una aplicación para quitar:',
    removeEmpty: 'Aún no has agregado aplicaciones.',
    removed: '✅ Se quitó {title}.',
    back: '↩️ Volver a las aplicaciones',
    language: 'Elige tu idioma:',
    languageSaved: 'Idioma actualizado.',
    commands: {
      start: 'Abrir el lanzador de aplicaciones web',
      apps: 'Mostrar tus aplicaciones web',
      add: 'Agregar un enlace HTTPS',
      open: 'Abrir una aplicación o ver el lanzador',
      search: 'Buscar una aplicación por nombre',
      remove: 'Quitar una aplicación agregada',
      language: 'Cambiar el idioma del bot',
      help: 'Ver ayuda del lanzador',
      cancel: 'Cancelar la acción actual',
    },
    page: 'Página',
    apps: 'aplicaciones',
    empty: 'No hay aplicaciones en esta categoría.',
    all: 'Todas',
    categories: { Social: 'Social', Work: 'Trabajo', Tools: 'Herramientas', Media: 'Medios', Other: 'Otros' },
  },
  pt: {
    title: '📱 <b>Seus aplicativos</b>',
    description: 'Escolha uma categoria e toque em um aplicativo para abri-lo no Telegram.',
    addApp: '➕ Adicionar aplicativo',
    addPrompt: 'Envie um link HTTPS para adicioná-lo. Envie /cancel para parar.',
    addInvalid: 'Esse link HTTPS não é válido. Tente novamente ou envie /cancel.',
    addDuplicate: 'Esse link já está na sua lista.',
    addLimit: 'Sua lista de aplicativos está cheia.',
    addFailed: 'Não foi possível salvar o aplicativo. Tente novamente.',
    addSuccess: '✅ {title} foi adicionado.',
    addCancelled: 'Adição cancelada.',
    addPrivateOnly: 'Abra uma conversa privada com o bot para adicionar um aplicativo.',
    help: 'Organizo seus aplicativos web para abrir pelo Telegram.\n\n/start ou /apps — explorar o lançador\n/open <nome> ou /search <nome> — buscar e abrir um aplicativo\n/add — salvar um link HTTPS\n/remove — remover um aplicativo adicionado\n/language — alterar o idioma\n/cancel — cancelar a adição',
    unknown: 'Posso ajudar a abrir e organizar aplicativos web. Use /help para ver os comandos.',
    unsupported: 'Por enquanto, só consigo processar links em texto. Use /help para ver os comandos.',
    nothingToCancel: 'Não há nenhuma ação em andamento para cancelar.',
    searchPrompt: 'Digite o nome do app depois de /search.',
    noMatches: 'Nenhum app encontrado. Use /apps para explorar o lançador.',
    matches: 'Resultados da busca',
    removeApp: '🗑 Remover aplicativos',
    removePrompt: 'Escolha um aplicativo para remover:',
    removeEmpty: 'Você ainda não adicionou aplicativos.',
    removed: '✅ {title} foi removido.',
    back: '↩️ Voltar aos aplicativos',
    language: 'Escolha seu idioma:',
    languageSaved: 'Idioma atualizado.',
    commands: {
      start: 'Abrir o lançador de aplicativos web',
      apps: 'Mostrar seus aplicativos web',
      add: 'Adicionar um link HTTPS',
      open: 'Abrir um aplicativo ou mostrar o lançador',
      search: 'Buscar um aplicativo pelo nome',
      remove: 'Remover um aplicativo adicionado',
      language: 'Alterar o idioma do bot',
      help: 'Ver ajuda do lançador',
      cancel: 'Cancelar a ação atual',
    },
    page: 'Página',
    apps: 'aplicativos',
    empty: 'Não há aplicativos nesta categoria.',
    all: 'Todos',
    categories: { Social: 'Social', Work: 'Trabalho', Tools: 'Ferramentas', Media: 'Mídia', Other: 'Outros' },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeBotApps(values: unknown, httpsOnly = false): TelegramBotApp[] {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value): TelegramBotApp[] => {
    if (!isRecord(value)) return [];
    const { id, title, url, category } = value;
    if (typeof id !== 'string' || typeof title !== 'string' || typeof url !== 'string') return [];
    if (!id || !title.trim() || title.length > 200) return [];

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return [];
    }
    if (
      !['http:', 'https:'].includes(parsedUrl.protocol) ||
      (httpsOnly && parsedUrl.protocol !== 'https:') ||
      parsedUrl.username ||
      parsedUrl.password
    ) return [];

    const appChatId = typeof value.chatId === 'number' && Number.isSafeInteger(value.chatId)
      ? value.chatId
      : undefined;
    return [{
      id,
      title: title.trim(),
      url: parsedUrl.toString(),
      category: APP_CATEGORIES.includes(category as AppCategory)
        ? category as AppCategory
        : 'Other',
      ...(appChatId !== undefined ? { chatId: appChatId } : {}),
    }];
  });
}

function getBotApps(chatId: number): TelegramBotApp[] {
  const seen = new Set<string>();
  return [
    ...normalizeBotApps(CORE_APPS),
    ...telegramAddedApps.filter((item) => item.chatId === undefined || item.chatId === chatId),
  ]
    .filter((item) => {
      const key = item.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 200);
}

function getChatAddedApps(chatId: number): TelegramBotApp[] {
  return telegramAddedApps.filter((item) => item.chatId === undefined || item.chatId === chatId);
}

async function loadTelegramAddedApps(): Promise<void> {
  try {
    const content = await readFile(BOT_APPS_PATH, 'utf8');
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) {
      telegramAddedApps = normalizeBotApps(parsed, true);
      return;
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.apps)) {
      throw new Error('Stored Telegram app data must contain an apps array.');
    }
    telegramAddedApps = normalizeBotApps(parsed.apps, true);
    if (isRecord(parsed.languages)) {
      for (const [chatId, language] of Object.entries(parsed.languages)) {
        const numericChatId = Number(chatId);
        if (
          Number.isSafeInteger(numericChatId) &&
          (language === 'en' || language === 'es' || language === 'pt')
        ) {
          chatLanguages.set(numericChatId, language);
        }
      }
    }
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return;
    throw error;
  }
}

function persistTelegramAddedApps(): Promise<void> {
  const write = botAppsWriteQueue.then(async () => {
    await mkdir(BOT_DATA_DIR, { recursive: true });
    const temporaryPath = `${BOT_APPS_PATH}.${randomUUID()}.tmp`;
    const data = {
      apps: telegramAddedApps,
      languages: Object.fromEntries(chatLanguages),
    };
    await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
    await rename(temporaryPath, BOT_APPS_PATH);
  });
  botAppsWriteQueue = write.catch(() => undefined);
  return write;
}

function parseHttpsAppUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function getBotLanguage(languageCode: unknown): BotLanguage {
  if (typeof languageCode !== 'string') return 'en';
  if (languageCode.toLowerCase().startsWith('pt')) return 'pt';
  if (languageCode.toLowerCase().startsWith('es')) return 'es';
  return 'en';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function renderBotAppMenu(
  chatId: number,
  language: BotLanguage,
  selectedCategory: AppCategory | 'All',
  requestedPage: number,
) {
  const copy = BOT_COPY[language];
  const apps = getBotApps(chatId);
  const categories: Array<AppCategory | 'All'> = [
    'All',
    ...APP_CATEGORIES.filter((category) => apps.some((app) => app.category === category)),
  ];
  const validCategory = categories.includes(selectedCategory) ? selectedCategory : 'All';
  const filteredApps = validCategory === 'All'
    ? apps
    : apps.filter((app) => app.category === validCategory);
  const pageCount = Math.max(1, Math.ceil(filteredApps.length / BOT_PAGE_SIZE));
  const page = Math.max(0, Math.min(Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0, pageCount - 1));
  const visibleApps = filteredApps.slice(page * BOT_PAGE_SIZE, (page + 1) * BOT_PAGE_SIZE);
  const selectedLabel = validCategory === 'All' ? copy.all : copy.categories[validCategory];
  const text = [
    copy.title,
    copy.description,
    '',
    `<b>${escapeHtml(selectedLabel)}</b> · ${filteredApps.length} ${copy.apps} · ${copy.page} ${page + 1}/${pageCount}`,
    ...(visibleApps.length ? [] : ['', copy.empty]),
  ].join('\n');

  const keyboard: Array<Array<Record<string, unknown>>> = [];
  for (let index = 0; index < categories.length; index += 3) {
    keyboard.push(categories.slice(index, index + 3).map((category) => ({
      text: category === 'All' ? copy.all : copy.categories[category],
      callback_data: category === 'All' ? 'launcher:category:All' : `launcher:category:${category}`,
    })));
  }
  for (let index = 0; index < visibleApps.length; index += 2) {
    keyboard.push(visibleApps.slice(index, index + 2).map((app) => ({
      text: `🌐 ${Array.from(app.title).slice(0, 58).join('')}`,
      url: app.url,
    })));
  }
  if (pageCount > 1) {
    keyboard.push([
      ...(page > 0
        ? [{ text: '◀️', callback_data: `launcher:page:${validCategory}:${page - 1}` }]
        : []),
      { text: `${page + 1}/${pageCount}`, callback_data: `launcher:page:${validCategory}:${page}` },
      ...(page + 1 < pageCount
        ? [{ text: '▶️', callback_data: `launcher:page:${validCategory}:${page + 1}` }]
        : []),
    ]);
  }
  keyboard.push([{ text: copy.addApp, callback_data: 'launcher:add' }]);
  keyboard.push([{ text: `🌐 ${copy.language}`, callback_data: 'launcher:languages' }]);
  if (getChatAddedApps(chatId).length) {
    keyboard.push([{ text: copy.removeApp, callback_data: 'launcher:remove-page:0' }]);
  }

  return { text, reply_markup: { inline_keyboard: keyboard } };
}

function parseBotMenuCallback(data: unknown):
  | { action: 'add' }
  | { action: 'languages' }
  | { action: 'language'; language: BotLanguage }
  | { action: 'remove'; id: string }
  | { action: 'remove-page'; page: number }
  | { action: 'menu'; category: AppCategory | 'All'; page: number }
  | null {
  if (typeof data !== 'string' || data.length > 64) return null;
  if (data === 'launcher:add') return { action: 'add' };
  if (data === 'launcher:languages') return { action: 'languages' };
  const languageMatch = /^launcher:language:(en|es|pt)$/.exec(data);
  if (languageMatch) return { action: 'language', language: languageMatch[1] as BotLanguage };
  const removeMatch = /^launcher:remove:(telegram-[a-f0-9-]{36})$/i.exec(data);
  if (removeMatch) return { action: 'remove', id: removeMatch[1] };
  const removePageMatch = /^launcher:remove-page:(\d{1,3})$/.exec(data);
  if (removePageMatch) return { action: 'remove-page', page: Number(removePageMatch[1]) };
  const categoryMatch = /^launcher:category:(All|Social|Work|Tools|Media|Other)$/.exec(data);
  if (categoryMatch) return { action: 'menu', category: categoryMatch[1] as AppCategory | 'All', page: 0 };

  const pageMatch = /^launcher:page:(All|Social|Work|Tools|Media|Other):(\d{1,4})$/.exec(data);
  if (pageMatch) {
    return { action: 'menu', category: pageMatch[1] as AppCategory | 'All', page: Number(pageMatch[2]) };
  }
  return null;
}

function renderBotRemoveMenu(chatId: number, language: BotLanguage, requestedPage: number, notice?: string) {
  const copy = BOT_COPY[language];
  const apps = getChatAddedApps(chatId);
  if (!apps.length) {
    return {
      text: [notice, copy.removeEmpty].filter(Boolean).join('\n'),
      reply_markup: {
        inline_keyboard: [[{ text: copy.back, callback_data: 'launcher:category:All' }]],
      },
    };
  }
  const pageCount = Math.ceil(apps.length / BOT_PAGE_SIZE);
  const page = Math.max(0, Math.min(Math.floor(requestedPage), pageCount - 1));
  const start = page * BOT_PAGE_SIZE;
  const keyboard: Array<Array<Record<string, unknown>>> = apps
    .slice(start, start + BOT_PAGE_SIZE)
    .map((item) => [{
      text: `🗑 ${Array.from(item.title).slice(0, 50).join('')}`,
      callback_data: `launcher:remove:${item.id}`,
    }]);
  if (pageCount > 1) {
    keyboard.push([
      ...(page > 0 ? [{ text: '◀️', callback_data: `launcher:remove-page:${page - 1}` }] : []),
      { text: `${page + 1}/${pageCount}`, callback_data: `launcher:remove-page:${page}` },
      ...(page + 1 < pageCount ? [{ text: '▶️', callback_data: `launcher:remove-page:${page + 1}` }] : []),
    ]);
  }
  keyboard.push([{ text: copy.back, callback_data: 'launcher:category:All' }]);
  return {
    text: [notice, copy.removePrompt].filter(Boolean).join('\n'),
    reply_markup: { inline_keyboard: keyboard },
  };
}

function renderBotLanguageMenu(language: BotLanguage) {
  const copy = BOT_COPY[language];
  return {
    text: copy.language,
    reply_markup: {
      inline_keyboard: [[
        { text: '🇺🇸 English', callback_data: 'launcher:language:en' },
        { text: '🇪🇸 Español', callback_data: 'launcher:language:es' },
        { text: '🇧🇷 Português', callback_data: 'launcher:language:pt' },
      ], [{ text: copy.back, callback_data: 'launcher:category:All' }]],
    },
  };
}

function findBotApps(chatId: number, query: string): TelegramBotApp[] {
  const normalize = (value: string) => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const normalizedQuery = normalize(query.trim()).slice(0, 100);
  if (!normalizedQuery) return [];

  return getBotApps(chatId)
    .map((item) => {
      const title = normalize(item.title);
      const hostname = normalize(new URL(item.url).hostname.replace(/^www\./i, ''));
      const rank = title === normalizedQuery || hostname === normalizedQuery
        ? 0
        : title.startsWith(normalizedQuery) || hostname.startsWith(normalizedQuery)
        ? 1
        : title.includes(normalizedQuery) || hostname.includes(normalizedQuery)
        ? 2
        : -1;
      return { item, rank };
    })
    .filter(({ rank }) => rank >= 0)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, BOT_PAGE_SIZE)
    .map(({ item }) => item);
}

function renderBotSearchResults(chatId: number, query: string, language: BotLanguage) {
  const copy = BOT_COPY[language];
  const results = findBotApps(chatId, query);
  if (!results.length) {
    return {
      text: copy.noMatches,
      reply_markup: {
        inline_keyboard: [[{
          text: copy.title.replace(/<\/?b>/g, ''),
          callback_data: 'launcher:category:All',
        }]],
      },
    };
  }
  return {
    text: `<b>${copy.matches}</b>\n${escapeHtml(query.trim())}`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: results.map((item) => [{
        text: `🌐 ${Array.from(item.title).slice(0, 58).join('')}`,
        url: item.url,
      }]),
    },
  };
}

function getChatLanguage(chatId: number, telegramLanguage?: unknown): BotLanguage {
  return chatLanguages.get(chatId) || getBotLanguage(telegramLanguage);
}

async function callTelegramApi<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T> {
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(method === 'getUpdates' ? 40_000 : 15_000),
    });
  } catch {
    throw new Error(`Telegram ${method} network request failed.`);
  }

  let result: TelegramApiResponse<T>;
  try {
    result = await response.json() as TelegramApiResponse<T>;
  } catch {
    throw new Error(`Telegram ${method} returned an invalid response (${response.status}).`);
  }
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method} failed (${response.status}): ${result.description || 'unknown error'}`);
  }
  return result.result as T;
}

// Core app metadata endpoint for Service Worker background sync & offline caching
app.get('/api/apps', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  res.status(200).json({
    status: 'ok',
    version: '1.2.0',
    syncedAt: Date.now(),
    source: 'server',
    apps: CORE_APPS,
  });
});

app.post('/api/apps/sync', (_req: Request, res: Response) => {
  res.status(410).json({
    status: 'error',
    message: 'Server-side app sync is disabled. App data stays in browser or Telegram Cloud Storage.',
  });
});

async function handleTelegramUpdate(update: TelegramBotUpdate): Promise<void> {
  const callback = update.callback_query;
  if (callback) {
    if (!callback.id) return;
    const state = parseBotMenuCallback(callback.data);
    const chat = callback.message?.chat;
    const chatId = chat?.id;
    const messageId = callback.message?.message_id;
    if (!state || chatId === undefined || messageId === undefined) {
      await callTelegramApi('answerCallbackQuery', { callback_query_id: callback.id });
      return;
    }
    const language = getChatLanguage(chatId, callback.from?.language_code);

    if (state.action === 'add') {
      if (chat?.type !== 'private') {
        await callTelegramApi('answerCallbackQuery', {
          callback_query_id: callback.id,
          text: BOT_COPY[language].addPrivateOnly,
          show_alert: true,
        });
        return;
      }
      await callTelegramApi('answerCallbackQuery', { callback_query_id: callback.id });
      pendingAppAdds.set(chatId, { messageId, language });
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: BOT_COPY[language].addPrompt,
        reply_markup: { force_reply: true },
      });
      return;
    }

    if (state.action === 'remove' || state.action === 'remove-page') {
      if (chat?.type !== 'private') {
        await callTelegramApi('answerCallbackQuery', {
          callback_query_id: callback.id,
          text: BOT_COPY[language].addPrivateOnly,
          show_alert: true,
        });
        return;
      }
      await callTelegramApi('answerCallbackQuery', { callback_query_id: callback.id });
      if (state.action === 'remove-page') {
        const menu = renderBotRemoveMenu(chatId, language, state.page);
        await callTelegramApi('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: menu.text,
          reply_markup: menu.reply_markup,
        });
        return;
      }

      const appIndex = telegramAddedApps.findIndex((item) =>
        item.id === state.id && (item.chatId === undefined || item.chatId === chatId));
      if (appIndex < 0) {
        const menu = renderBotRemoveMenu(chatId, language, 0);
        await callTelegramApi('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: menu.text,
          reply_markup: menu.reply_markup,
        });
        return;
      }

      const [removedApp] = telegramAddedApps.splice(appIndex, 1);
      try {
        await persistTelegramAddedApps();
      } catch (error) {
        telegramAddedApps.splice(appIndex, 0, removedApp);
        console.error('[Telegram Bot] Could not persist app removal:', error);
        const menu = renderBotRemoveMenu(chatId, language, 0, BOT_COPY[language].addFailed);
        await callTelegramApi('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: menu.text,
          reply_markup: menu.reply_markup,
        });
        return;
      }
      const copy = BOT_COPY[language];
      const notice = copy.removed.replace('{title}', escapeHtml(removedApp.title));
      const menu = renderBotRemoveMenu(chatId, language, 0, notice);
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: menu.text,
        parse_mode: 'HTML',
        reply_markup: menu.reply_markup,
      });
      return;
    }

    if (state.action === 'languages') {
      await callTelegramApi('answerCallbackQuery', { callback_query_id: callback.id });
      const menu = renderBotLanguageMenu(language);
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: menu.text,
        reply_markup: menu.reply_markup,
      });
      return;
    }

    if (state.action === 'language') {
      await callTelegramApi('answerCallbackQuery', {
        callback_query_id: callback.id,
        text: BOT_COPY[state.language].languageSaved,
      });
      const previousLanguage = chatLanguages.get(chatId);
      chatLanguages.set(chatId, state.language);
      try {
        await persistTelegramAddedApps();
      } catch (error) {
        if (previousLanguage) chatLanguages.set(chatId, previousLanguage);
        else chatLanguages.delete(chatId);
        console.error('[Telegram Bot] Could not persist language choice:', error);
        return;
      }
      const menu = renderBotAppMenu(chatId, state.language, 'All', 0);
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: menu.text,
        parse_mode: 'HTML',
        reply_markup: menu.reply_markup,
      });
      return;
    }

    await callTelegramApi('answerCallbackQuery', { callback_query_id: callback.id });

    const menu = renderBotAppMenu(
      chatId,
      language,
      state.category,
      state.page,
    );
    await callTelegramApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: menu.text,
      parse_mode: 'HTML',
      reply_markup: menu.reply_markup,
    });
    return;
  }

  const message = update.message;
  if (!message?.chat?.id) return;
  const chatId = message.chat.id;
  const pendingAdd = pendingAppAdds.get(chatId);
  const language = pendingAdd?.language || getChatLanguage(chatId, message.from?.language_code);
  if (typeof message.text !== 'string') {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: pendingAdd ? BOT_COPY[language].addInvalid : BOT_COPY[language].unsupported,
      reply_markup: pendingAdd ? { force_reply: true } : undefined,
    });
    return;
  }
  const input = message.text.trim();
  const command = input.split(/\s+/, 1)[0].split('@', 1)[0].toLowerCase();
  const commandArgument = input.split(/\s+/).slice(1).join(' ').trim();

  if (pendingAdd && (command === '/cancel' || command === '/cancelar')) {
    pendingAppAdds.delete(chatId);
    await callTelegramApi('sendMessage', { chat_id: chatId, text: BOT_COPY[language].addCancelled });
    return;
  }

  if (pendingAdd && !command.startsWith('/')) {
    const appUrl = parseHttpsAppUrl(input);
    if (!appUrl) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: BOT_COPY[language].addInvalid,
        reply_markup: { force_reply: true },
      });
      return;
    }

    const apps = getBotApps(chatId);
    if (apps.length >= 200) {
      pendingAppAdds.delete(chatId);
      await callTelegramApi('sendMessage', { chat_id: chatId, text: BOT_COPY[language].addLimit });
      return;
    }
    const normalizedUrl = appUrl.toString();
    if (apps.some((item) => item.url.toLowerCase() === normalizedUrl.toLowerCase())) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: BOT_COPY[language].addDuplicate,
        reply_markup: { force_reply: true },
      });
      return;
    }

    const title = appUrl.hostname.replace(/^www\./i, '');
    const app: TelegramBotApp = {
      id: `telegram-${randomUUID()}`,
      title,
      url: normalizedUrl,
      category: 'Other',
      chatId,
    };
    telegramAddedApps = [...telegramAddedApps, app];
    try {
      await persistTelegramAddedApps();
    } catch (error) {
      telegramAddedApps = telegramAddedApps.filter((item) => item.id !== app.id);
      console.error('[Telegram Bot] Could not persist added app:', error);
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: BOT_COPY[language].addFailed,
        reply_markup: { force_reply: true },
      });
      return;
    }

    pendingAppAdds.delete(chatId);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: BOT_COPY[language].addSuccess.replace('{title}', escapeHtml(title)),
      parse_mode: 'HTML',
    });
    const menu = renderBotAppMenu(chatId, language, 'Other', 0);
    if (pendingAdd.messageId !== undefined) {
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: pendingAdd.messageId,
        text: menu.text,
        parse_mode: 'HTML',
        reply_markup: menu.reply_markup,
      });
    } else {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: menu.text,
        parse_mode: 'HTML',
        reply_markup: menu.reply_markup,
      });
    }
    return;
  }

  if (pendingAdd && command.startsWith('/')) pendingAppAdds.delete(chatId);

  if (command === '/cancel' || command === '/cancelar') {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: BOT_COPY[language].nothingToCancel,
    });
    return;
  }
  if (command === '/add') {
    if (message.chat.type !== 'private') {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: BOT_COPY[language].addPrivateOnly,
      });
      return;
    }
    pendingAppAdds.set(chatId, { language });
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: BOT_COPY[language].addPrompt,
      reply_markup: { force_reply: true },
    });
    return;
  }
  if (command === '/remove') {
    if (message.chat.type !== 'private') {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: BOT_COPY[language].addPrivateOnly,
      });
      return;
    }
    const menu = renderBotRemoveMenu(chatId, language, 0);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: menu.text,
      reply_markup: menu.reply_markup,
    });
    return;
  }
  if (command === '/language') {
    const menu = renderBotLanguageMenu(language);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: menu.text,
      reply_markup: menu.reply_markup,
    });
    return;
  }
  if (command === '/open' || command === '/search') {
    if (!commandArgument && command === '/search') {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: BOT_COPY[language].searchPrompt,
      });
      return;
    }
    if (commandArgument) {
      const results = renderBotSearchResults(chatId, commandArgument, language);
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: results.text,
        ...(results.parse_mode ? { parse_mode: results.parse_mode } : {}),
        reply_markup: results.reply_markup,
      });
      return;
    }
    const menu = renderBotAppMenu(chatId, language, 'All', 0);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: menu.text,
      parse_mode: 'HTML',
      reply_markup: menu.reply_markup,
    });
    return;
  }
  if (command === '/help') {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: BOT_COPY[language].help,
      reply_markup: {
        inline_keyboard: [[{
          text: BOT_COPY[language].title.replace(/<\/?b>/g, ''),
          callback_data: 'launcher:category:All',
        }]],
      },
    });
    return;
  }

  pendingAppAdds.delete(chatId);
  if (!['/start', '/apps', '/launcher'].includes(command)) {
    const naturalSearch = /^(?:open|launch|abrir|abre)\s+(.+)$/i.exec(input);
    const results = naturalSearch
      ? findBotApps(chatId, naturalSearch[1])
      : command.startsWith('/')
      ? []
      : findBotApps(chatId, input);
    if (results.length) {
      const searchResults = renderBotSearchResults(chatId, naturalSearch?.[1] || input, language);
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: searchResults.text,
        parse_mode: searchResults.parse_mode,
        reply_markup: searchResults.reply_markup,
      });
      return;
    }
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: BOT_COPY[language].unknown,
      reply_markup: {
        inline_keyboard: [[{
          text: BOT_COPY[language].title.replace(/<\/?b>/g, ''),
          callback_data: 'launcher:category:All',
        }]],
      },
    });
    return;
  }

  const menu = renderBotAppMenu(
    chatId,
    language,
    'All',
    0,
  );
  await callTelegramApi('sendMessage', {
    chat_id: message.chat.id,
    text: menu.text,
    parse_mode: 'HTML',
    reply_markup: menu.reply_markup,
  });
}

app.post('/api/telegram/webhook', (req: Request, res: Response) => {
  if (!BOT_TOKEN || !TELEGRAM_WEBHOOK_URL) {
    res.sendStatus(404);
    return;
  }

  const receivedSecret = req.get('X-Telegram-Bot-Api-Secret-Token');
  const receivedSecretBuffer = Buffer.from(receivedSecret || '');
  const expectedSecretBuffer = Buffer.from(TELEGRAM_WEBHOOK_SECRET);
  if (
    receivedSecretBuffer.length !== expectedSecretBuffer.length ||
    !timingSafeEqual(receivedSecretBuffer, expectedSecretBuffer)
  ) {
    res.sendStatus(401);
    return;
  }

  const update = req.body as TelegramBotUpdate;
  if (!update || typeof update !== 'object' || !Number.isInteger(update.update_id)) {
    res.sendStatus(400);
    return;
  }

  res.status(200).send('OK');
  void handleTelegramUpdate(update).catch((error: unknown) => {
    const details = error instanceof Error ? error.message : 'Unknown Telegram webhook error.';
    console.warn('[Telegram webhook] Failed to update the app menu:', details);
  });
});

async function registerTelegramCommands(): Promise<void> {
  const commandNames = ['start', 'apps', 'open', 'search', 'add', 'remove', 'language', 'help', 'cancel'] as const;
  const commandsFor = (language: BotLanguage) => commandNames.map((command) => ({
    command,
    description: BOT_COPY[language].commands[command],
  }));
  try {
    await callTelegramApi('setMyCommands', { commands: commandsFor('en') });
    await callTelegramApi('setMyCommands', { commands: commandsFor('es'), language_code: 'es' });
    await callTelegramApi('setMyCommands', { commands: commandsFor('pt'), language_code: 'pt' });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown Telegram command setup error.';
    console.warn('[Telegram Bot] Could not register commands:', details);
  }

  if (TELEGRAM_WEB_APP_URL) {
    try {
      await callTelegramApi('setChatMenuButton', {
        menu_button: {
          type: 'web_app',
          text: 'Open launcher',
          web_app: { url: TELEGRAM_WEB_APP_URL },
        },
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown Telegram menu setup error.';
      console.warn('[Telegram Bot] Could not set the launcher menu button:', details);
    }
  }
}

async function startTelegramWebhook(): Promise<void> {
  if (!BOT_TOKEN || !TELEGRAM_WEBHOOK_URL) return;

  let retryDelay = 1_000;
  while (true) {
    try {
      await callTelegramApi('setWebhook', {
        url: TELEGRAM_WEBHOOK_URL,
        secret_token: TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query'],
      });
      await registerTelegramCommands();
      telegramBotStatus = 'running';
      console.log('[Telegram Bot] Webhook delivery started.');
      return;
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown Telegram webhook setup error.';
      telegramBotStatus = 'reconnecting';
      console.error('[Telegram Bot] Could not configure webhook; retrying:', details);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
}

async function startTelegramPolling(): Promise<void> {
  if (!BOT_TOKEN) return;

  let initializationDelay = 1_000;
  while (true) {
    try {
      await callTelegramApi('deleteWebhook', { drop_pending_updates: false });
      break;
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown Telegram polling error.';
      telegramBotStatus = 'reconnecting';
      console.error('[Telegram Bot] Could not initialize long polling; retrying:', details);
      await new Promise((resolve) => setTimeout(resolve, initializationDelay));
      initializationDelay = Math.min(initializationDelay * 2, 30_000);
    }
  }

  await registerTelegramCommands();

  console.log('[Telegram Bot] Long polling started.');
  let offset = 0;
  let retryDelay = 1_000;
  while (true) {
    try {
      const updates = await callTelegramApi<TelegramBotUpdate[]>('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message', 'callback_query'],
      });

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        try {
          await handleTelegramUpdate(update);
        } catch (error) {
          const details = error instanceof Error ? error.message : 'Unknown Telegram update error.';
          console.warn('[Telegram Bot] Failed to process an update:', details);
        }
      }
      telegramBotStatus = 'running';
      retryDelay = 1_000;
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown Telegram polling error.';
      telegramBotStatus = 'reconnecting';
      console.error('[Telegram Bot] Polling failed; retrying:', details);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
}

async function startServer() {
  await loadTelegramAddedApps();

  if (!isProd) {
    // Mount Vite dev server middlewares
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from dist
    const distPath = path.resolve(__dirname, 'dist');
    
    app.use((req, res, next) => {
      if (req.path === '/' || req.path === '/index.html') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      next();
    });

    // Explicit headers for Service Worker
    app.use('/sw.js', (_req, res, next) => {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      next();
    });

    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Bind strictly to 0.0.0.0 to allow incoming connections from Android emulators (10.0.2.2),
  // iOS simulators, and local Wi-Fi devices, avoiding ERR_CONNECTION_REFUSED
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Web App Launcher running on http://0.0.0.0:${PORT}`);
    if (TELEGRAM_WEBHOOK_URL) void startTelegramWebhook();
    else if (BOT_TOKEN) void startTelegramPolling();
  });
}

startServer();
