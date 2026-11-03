import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const isProd = process.env.NODE_ENV === 'production';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let telegramBotStatus: 'disabled' | 'starting' | 'running' | 'reconnecting' | 'error' =
  BOT_TOKEN ? 'starting' : 'disabled';
const APP_URL = (() => {
  const configuredUrl = process.env.APP_URL?.trim();
  if (!configuredUrl) return undefined;
  try {
    const url = new URL(configuredUrl);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.toString();
  } catch {
    // Report invalid configuration below.
  }
  console.warn('[Telegram Bot] APP_URL must be a valid HTTPS URL; PWA launch buttons are disabled.');
  return undefined;
})();
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
      pwaConfigured: Boolean(APP_URL),
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
};
type TelegramApiResponse<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
};
type TelegramBotMessage = {
  chat?: { id?: number; type?: string };
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
let serverSyncedApps: unknown[] = [...CORE_APPS];
type TelegramChatState = {
  language?: BotLanguage;
  apps?: TelegramBotApp[];
};
const chatStates = new Map<number, TelegramChatState>();
const pendingAppAdds = new Set<number>();
const BOT_STATE_PATH = path.resolve(process.env.BOT_DATA_DIR || path.join(__dirname, 'data'), 'bot-state.json');
let stateWriteQueue: Promise<void> = Promise.resolve();

const BOT_COPY: Record<BotLanguage, {
  title: string;
  welcome: string;
  description: string;
  addMore: string;
  addPrompt: string;
  added: string;
  alreadyAdded: string;
  invalidUrl: string;
  saveFailed: string;
  appLimit: string;
  cancelled: string;
  privateOnly: string;
  help: string;
  unknown: string;
  pwaMissing: string;
  openPwa: string;
  remove: string;
  removePrompt: string;
  removed: string;
  removeEmpty: string;
  back: string;
  page: string;
  apps: string;
  empty: string;
}> = {
  en: {
    title: '📱 Your apps',
    welcome: '👋 Welcome to your Web App Launcher!\nChoose your preferred language to get started.',
    description: 'Tap an app to open it. Use “Add an app” to save another link right here in chat.',
    addMore: '➕ Add more apps',
    addPrompt: 'Send the app link (starting with https://). Send /cancel to stop.',
    added: '✅ App added: {title}',
    alreadyAdded: 'That app is already in your list: {title}',
    invalidUrl: 'That does not look like a valid HTTPS link. Send a link starting with https://, or /cancel.',
    saveFailed: 'Could not save that app right now. Please try again.',
    appLimit: 'Your list has reached the 200-app limit.',
    cancelled: 'Adding app cancelled.',
    privateOnly: 'Please use this command in a private chat with the bot.',
    help: 'I can launch the PWA, list saved apps, and add or remove app links.\n\n/open — launch the PWA\n/apps — show your apps\n/add — add an HTTPS app link\n/remove — remove an app\n/language — change language\n/cancel — cancel adding an app',
    unknown: 'I did not recognize that. Use the buttons below or /help to see what I can do.',
    pwaMissing: 'The PWA launch link is not configured. The bot owner must set APP_URL to the public HTTPS address of the PWA.',
    openPwa: '🚀 Open launcher',
    remove: '🗑 Remove',
    removePrompt: 'Choose an app to remove:',
    removed: '✅ App removed: {title}',
    removeEmpty: 'There are no apps to remove.',
    back: '↩️ Back to apps',
    page: 'Page',
    apps: 'apps',
    empty: 'No apps yet. Add your first app to get started.',
  },
  es: {
    title: '📱 Tus aplicaciones',
    welcome: '👋 ¡Te damos la bienvenida a tu lanzador de aplicaciones web!\nElige tu idioma preferido para comenzar.',
    description: 'Toca una aplicación para abrirla. Usa «Agregar aplicación» para guardar otro enlace aquí mismo.',
    addMore: '➕ Agregar más aplicaciones',
    addPrompt: 'Envía el enlace de la aplicación (debe comenzar con https://). Envía /cancel para detener.',
    added: '✅ Aplicación agregada: {title}',
    alreadyAdded: 'Esa aplicación ya está en tu lista: {title}',
    invalidUrl: 'El enlace no parece válido. Envía un enlace que comience con https:// o /cancel.',
    saveFailed: 'No se pudo guardar la aplicación. Inténtalo de nuevo.',
    appLimit: 'Tu lista llegó al límite de 200 aplicaciones.',
    cancelled: 'Se canceló la adición.',
    privateOnly: 'Usa este comando en un chat privado con el bot.',
    help: 'Puedo abrir la PWA, mostrar tus aplicaciones y agregar o quitar enlaces.\n\n/open — abrir la PWA\n/apps — mostrar aplicaciones\n/add — agregar un enlace HTTPS\n/remove — quitar una aplicación\n/language — cambiar idioma\n/cancel — cancelar',
    unknown: 'No entendí ese mensaje. Usa los botones o /help para ver los comandos.',
    pwaMissing: 'El enlace de la PWA no está configurado. El administrador debe establecer APP_URL con la dirección HTTPS pública.',
    openPwa: '🚀 Abrir lanzador',
    remove: '🗑 Quitar',
    removePrompt: 'Elige una aplicación para quitar:',
    removed: '✅ Aplicación eliminada: {title}',
    removeEmpty: 'No hay aplicaciones para quitar.',
    back: '↩️ Volver a las aplicaciones',
    page: 'Página',
    apps: 'aplicaciones',
    empty: 'Aún no tienes aplicaciones. Agrega la primera para comenzar.',
  },
  pt: {
    title: '📱 Seus aplicativos',
    welcome: '👋 Boas-vindas ao seu lançador de aplicativos web!\nEscolha seu idioma preferido para começar.',
    description: 'Toque em um aplicativo para abrir. Use «Adicionar aplicativo» para salvar outro link aqui mesmo.',
    addMore: '➕ Adicionar mais aplicativos',
    addPrompt: 'Envie o link do aplicativo (começando com https://). Envie /cancelar para parar.',
    added: '✅ Aplicativo adicionado: {title}',
    alreadyAdded: 'Esse aplicativo já está na sua lista: {title}',
    invalidUrl: 'Esse link não parece válido. Envie um link começando com https:// ou /cancelar.',
    saveFailed: 'Não foi possível salvar o aplicativo agora. Tente novamente.',
    appLimit: 'Sua lista atingiu o limite de 200 aplicativos.',
    cancelled: 'Adição cancelada.',
    privateOnly: 'Use este comando em uma conversa privada com o bot.',
    help: 'Posso abrir a PWA, mostrar seus aplicativos e adicionar ou remover links.\n\n/open — abrir a PWA\n/apps — mostrar aplicativos\n/add — adicionar link HTTPS\n/remove — remover aplicativo\n/language — alterar idioma\n/cancel — cancelar',
    unknown: 'Não entendi. Use os botões ou /help para ver os comandos.',
    pwaMissing: 'O link da PWA não está configurado. O administrador precisa definir APP_URL com o endereço HTTPS público.',
    openPwa: '🚀 Abrir lançador',
    remove: '🗑 Remover',
    removePrompt: 'Escolha um aplicativo para remover:',
    removed: '✅ Aplicativo removido: {title}',
    removeEmpty: 'Não há aplicativos para remover.',
    back: '↩️ Voltar aos aplicativos',
    page: 'Página',
    apps: 'aplicativos',
    empty: 'Você ainda não tem aplicativos. Adicione o primeiro para começar.',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeBotApps(values: unknown): TelegramBotApp[] {
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
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) return [];

    const appCategory = APP_CATEGORIES.includes(category as AppCategory)
      ? category as AppCategory
      : 'Other';
    return [{
      id,
      title: title.trim(),
      url: parsedUrl.toString(),
      category: appCategory,
    }];
  }).slice(0, 200);
}

function getBotApps(chatId: number): TelegramBotApp[] {
  return normalizeBotApps(chatStates.get(chatId)?.apps || CORE_APPS);
}

async function loadBotState(): Promise<void> {
  let persisted: unknown;
  try {
    persisted = JSON.parse(await readFile(BOT_STATE_PATH, 'utf8'));
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return;
    throw error;
  }
  if (!isRecord(persisted)) throw new Error('Bot state file must contain an object keyed by chat ID.');

  for (const [chatIdText, value] of Object.entries(persisted)) {
    const chatId = Number(chatIdText);
    if (!Number.isSafeInteger(chatId) || !isRecord(value)) continue;
    const state: TelegramChatState = {};
    if (value.language === 'en' || value.language === 'es' || value.language === 'pt') {
      state.language = value.language;
    }
    if (Array.isArray(value.apps)) state.apps = normalizeBotApps(value.apps);
    if (state.language || state.apps) chatStates.set(chatId, state);
  }
}

function persistBotState(): Promise<void> {
  const stateSnapshot = JSON.stringify(Object.fromEntries(chatStates));
  const write = stateWriteQueue.catch(() => undefined).then(async () => {
    await mkdir(path.dirname(BOT_STATE_PATH), { recursive: true });
    const temporaryPath = `${BOT_STATE_PATH}.${process.pid}.tmp`;
    await writeFile(temporaryPath, stateSnapshot, 'utf8');
    await rename(temporaryPath, BOT_STATE_PATH);
  });
  stateWriteQueue = write;
  return write;
}

function getBotLanguage(languageCode: unknown): BotLanguage {
  if (typeof languageCode !== 'string') return 'en';
  if (languageCode.toLowerCase().startsWith('pt')) return 'pt';
  if (languageCode.toLowerCase().startsWith('es')) return 'es';
  return 'en';
}

function parseAppUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && value.length <= 2048
      ? url
      : null;
  } catch {
    return null;
  }
}

const BOT_LANGUAGES: Array<{ language: BotLanguage; label: string }> = [
  { language: 'en', label: '🇺🇸 English' },
  { language: 'pt', label: '🇧🇷 Português' },
  { language: 'es', label: '🇪🇸 Español' },
];

function renderPwaButton(language: BotLanguage, isPrivateChat: boolean): Record<string, unknown>[] {
  if (!APP_URL) return [];
  const appUrl = new URL(APP_URL);
  appUrl.searchParams.set('lang', language);
  return [{
    text: BOT_COPY[language].openPwa,
    ...(isPrivateChat ? { web_app: { url: appUrl.toString() } } : { url: appUrl.toString() }),
  }];
}

function renderBotWelcome(language: BotLanguage, isPrivateChat: boolean) {
  const copy = BOT_COPY[language];
  return {
    text: [copy.welcome, ...(!APP_URL ? ['', copy.pwaMissing] : [])].join('\n'),
    reply_markup: {
      inline_keyboard: [
        BOT_LANGUAGES.map(({ language: option, label }) => ({
          text: label,
          callback_data: `language:${option}`,
        })),
        ...renderPwaButton(language, isPrivateChat).map((button) => [button]),
      ],
    },
  };
}

function renderBotAppMenu(chatId: number, language: BotLanguage, requestedPage: number, isPrivateChat: boolean) {
  const copy = BOT_COPY[language];
  const apps = getBotApps(chatId);
  const pageCount = Math.max(1, Math.ceil(apps.length / BOT_PAGE_SIZE));
  const page = Math.max(0, Math.min(Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0, pageCount - 1));
  const visibleApps = apps.slice(page * BOT_PAGE_SIZE, (page + 1) * BOT_PAGE_SIZE);
  const text = [
    copy.title,
    copy.description,
    '',
    `${apps.length} ${copy.apps} · ${copy.page} ${page + 1}/${pageCount}`,
    ...(visibleApps.length ? [] : ['', copy.empty]),
    ...(!APP_URL ? ['', copy.pwaMissing] : []),
  ].join('\n');

  const keyboard: Array<Array<Record<string, unknown>>> = [];
  for (let index = 0; index < visibleApps.length; index += 2) {
    keyboard.push(visibleApps.slice(index, index + 2).map((app) => ({
      text: `🌐 ${Array.from(app.title).slice(0, 60).join('')}`,
      url: app.url,
    })));
  }
  const pwaButton = renderPwaButton(language, isPrivateChat);
  if (pwaButton.length) keyboard.push(pwaButton);
  keyboard.push([{ text: copy.addMore, callback_data: 'add-app' }]);
  keyboard.push(BOT_LANGUAGES.map(({ language: option, label }) => ({
    text: label,
    callback_data: `language:${option}`,
  })));
  if (pageCount > 1) {
    keyboard.push([
      ...(page > 0
        ? [{ text: '◀️', callback_data: `apps:${language}:${page - 1}` }]
        : []),
      { text: `${page + 1}/${pageCount}`, callback_data: `apps:${language}:${page}` },
      ...(page + 1 < pageCount
        ? [{ text: '▶️', callback_data: `apps:${language}:${page + 1}` }]
        : []),
    ]);
  }

  return { text, reply_markup: { inline_keyboard: keyboard } };
}

function renderBotRemoveMenu(
  chatId: number,
  language: BotLanguage,
  requestedPage = 0,
  notice?: string,
) {
  const copy = BOT_COPY[language];
  const apps = getBotApps(chatId);
  if (!apps.length) {
    return {
      text: [notice, copy.removeEmpty].filter(Boolean).join('\n'),
      reply_markup: { inline_keyboard: [[{ text: copy.back, callback_data: `apps:${language}:0` }]] },
    };
  }
  const pageCount = Math.ceil(apps.length / BOT_PAGE_SIZE);
  const page = Math.max(0, Math.min(Math.floor(requestedPage), pageCount - 1));
  const start = page * BOT_PAGE_SIZE;
  const keyboard: Array<Array<Record<string, unknown>>> = apps
    .slice(start, start + BOT_PAGE_SIZE)
    .map((item, index) => [{
      text: `${copy.remove} ${Array.from(item.title).slice(0, 48).join('')}`,
      callback_data: `remove:${start + index}`,
    }]);
  if (pageCount > 1) {
    keyboard.push([
      ...(page > 0 ? [{ text: '◀️', callback_data: `remove-page:${page - 1}` }] : []),
      { text: `${page + 1}/${pageCount}`, callback_data: `remove-page:${page}` },
      ...(page + 1 < pageCount ? [{ text: '▶️', callback_data: `remove-page:${page + 1}` }] : []),
    ]);
  }
  keyboard.push([{ text: copy.back, callback_data: `apps:${language}:0` }]);
  return {
    text: [notice, copy.removePrompt].filter(Boolean).join('\n'),
    reply_markup: { inline_keyboard: keyboard },
  };
}

function parseBotMenuCallback(data: unknown): {
  action: 'language' | 'page' | 'add' | 'remove' | 'remove-page';
  language?: BotLanguage;
  page?: number;
} | null {
  if (typeof data !== 'string' || data.length > 64) return null;
  if (data === 'add-app') return { action: 'add' };
  const removeMatch = /^remove:(\d{1,3})$/.exec(data);
  if (removeMatch) return { action: 'remove', page: Number(removeMatch[1]) };
  const removePageMatch = /^remove-page:(\d{1,3})$/.exec(data);
  if (removePageMatch) return { action: 'remove-page', page: Number(removePageMatch[1]) };
  const languageMatch = /^language:(en|es|pt)$/.exec(data);
  if (languageMatch) return { action: 'language', language: languageMatch[1] as BotLanguage, page: 0 };

  const pageMatch = /^apps:(en|es|pt):(\d{1,4})$/.exec(data);
  if (pageMatch) return { action: 'page', language: pageMatch[1] as BotLanguage, page: Number(pageMatch[2]) };
  return null;
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
    apps: serverSyncedApps,
  });
});

// Endpoint to receive background sync updates when connectivity is restored
app.post('/api/apps/sync', (req: Request, res: Response) => {
  const { apps, clientTimestamp } = req.body || {};
  if (Array.isArray(apps)) {
    serverSyncedApps = apps;
  }
  res.status(200).json({
    status: 'ok',
    syncedAt: Date.now(),
    clientTimestamp: clientTimestamp || null,
    count: serverSyncedApps.length,
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

    if (state.action === 'add') {
      if (chat?.type !== 'private') {
        const language = state.language || chatStates.get(chatId)?.language || getBotLanguage(callback.from?.language_code);
        await callTelegramApi('answerCallbackQuery', {
          callback_query_id: callback.id,
          text: language === 'pt'
            ? 'Abra uma conversa privada com o bot para adicionar aplicativos.'
            : language === 'es'
            ? 'Abre un chat privado con el bot para agregar aplicaciones.'
            : 'Open a private chat with the bot to add apps.',
          show_alert: true,
        });
        return;
      }
      await callTelegramApi('answerCallbackQuery', { callback_query_id: callback.id });
      const language = chatStates.get(chatId)?.language || getBotLanguage(callback.from?.language_code);
      pendingAppAdds.add(chatId);
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: BOT_COPY[language].addPrompt,
        reply_markup: { force_reply: true },
      });
      return;
    }

    await callTelegramApi('answerCallbackQuery', { callback_query_id: callback.id });
    const language = state.language || chatStates.get(chatId)?.language || getBotLanguage(callback.from?.language_code);
    if (state.action === 'remove' || state.action === 'remove-page') {
      if (chat?.type !== 'private') return;
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

      const apps = getBotApps(chatId);
      const removedApp = apps[state.page || 0];
      if (!removedApp) {
        const menu = renderBotRemoveMenu(chatId, language);
        await callTelegramApi('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: menu.text,
          reply_markup: menu.reply_markup,
        });
        return;
      }
      const previousState = chatStates.get(chatId);
      const chatState = { ...previousState, apps: apps.filter((_, index) => index !== state.page) };
      chatStates.set(chatId, chatState);
      try {
        await persistBotState();
      } catch (error) {
        if (previousState) chatStates.set(chatId, previousState);
        else chatStates.delete(chatId);
        console.error('[Telegram Bot] Could not persist app removal:', error);
        const menu = renderBotRemoveMenu(chatId, language, 0, BOT_COPY[language].saveFailed);
        await callTelegramApi('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: menu.text,
          reply_markup: menu.reply_markup,
        });
        return;
      }
      const menu = renderBotRemoveMenu(chatId, language, 0, BOT_COPY[language].removed.replace('{title}', removedApp.title));
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: menu.text,
        reply_markup: menu.reply_markup,
      });
      return;
    }

    if (!state.language) return;
    if (state.action === 'language') {
      const previousState = chatStates.get(chatId);
      const chatState = { ...previousState };
      chatState.language = language;
      chatStates.set(chatId, chatState);
      try {
        await persistBotState();
      } catch (error) {
        if (previousState) chatStates.set(chatId, previousState);
        else chatStates.delete(chatId);
        console.error('[Telegram Bot] Could not persist selected language:', error);
        return;
      }
    }
    const menu = renderBotAppMenu(chatId, language, state.page || 0, chat?.type === 'private');
    await callTelegramApi('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: menu.text,
      reply_markup: menu.reply_markup,
    });
    return;
  }

  const message = update.message;
  if (!message) return;
  const chatId = message?.chat?.id;
  if (chatId === undefined) return;
  const input = typeof message.text === 'string' ? message.text.trim() : '';
  const command = input.split(/\s+/, 1)[0].split('@', 1)[0].toLowerCase();
  const savedLanguage = chatStates.get(chatId)?.language;
  const language = savedLanguage || getBotLanguage(message.from?.language_code);

  if (!input) {
    const buttons = renderPwaButton(language, message.chat?.type === 'private');
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: BOT_COPY[language].unknown,
      reply_markup: buttons.length ? { inline_keyboard: [buttons] } : undefined,
    });
    return;
  }

  if (pendingAppAdds.has(chatId) && (command === '/cancel' || command === '/cancelar')) {
    pendingAppAdds.delete(chatId);
    await callTelegramApi('sendMessage', { chat_id: chatId, text: BOT_COPY[language].cancelled });
    return;
  }

  if (pendingAppAdds.has(chatId) && command.startsWith('/')) {
    pendingAppAdds.delete(chatId);
  }

  if (pendingAppAdds.has(chatId) && !command.startsWith('/')) {
    if (message.chat?.type !== 'private') {
      pendingAppAdds.delete(chatId);
      return;
    }
    const appUrl = parseAppUrl(input);
    if (!appUrl) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: BOT_COPY[language].invalidUrl,
        reply_markup: { force_reply: true },
      });
      return;
    }

    const apps = getBotApps(chatId);
    if (apps.length >= 200) {
      pendingAppAdds.delete(chatId);
      await callTelegramApi('sendMessage', { chat_id: chatId, text: BOT_COPY[language].appLimit });
      return;
    }
    const normalizedUrl = appUrl.toString();
    if (apps.some((app) => app.url === normalizedUrl)) {
      pendingAppAdds.delete(chatId);
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: BOT_COPY[language].alreadyAdded.replace('{title}', appUrl.hostname),
      });
      return;
    }
    const title = appUrl.hostname.replace(/^www\./i, '');
    const previousState = chatStates.get(chatId);
    const chatState = { ...previousState };
    chatState.apps = [...apps, {
      id: `custom-${Date.now()}-${chatId}`,
      title,
      url: normalizedUrl,
      category: 'Other',
    }];
    chatStates.set(chatId, chatState);
    try {
      await persistBotState();
    } catch (error) {
      if (previousState) chatStates.set(chatId, previousState);
      else chatStates.delete(chatId);
      console.error('[Telegram Bot] Could not persist app list:', error);
      await callTelegramApi('sendMessage', { chat_id: chatId, text: BOT_COPY[language].saveFailed });
      return;
    }
    pendingAppAdds.delete(chatId);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: BOT_COPY[language].added.replace('{title}', title),
    });
    const menu = renderBotAppMenu(chatId, language, 0, message.chat?.type === 'private');
    await callTelegramApi('sendMessage', { chat_id: chatId, text: menu.text, reply_markup: menu.reply_markup });
    return;
  }

  if (command === '/cancel' || command === '/cancelar') {
    await callTelegramApi('sendMessage', { chat_id: chatId, text: BOT_COPY[language].cancelled });
    return;
  }
  if (command === '/add') {
    if (message.chat?.type !== 'private') {
      await callTelegramApi('sendMessage', { chat_id: chatId, text: BOT_COPY[language].privateOnly });
      return;
    }
    pendingAppAdds.add(chatId);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: BOT_COPY[language].addPrompt,
      reply_markup: { force_reply: true },
    });
    return;
  }
  if (command === '/remove') {
    if (message.chat?.type !== 'private') {
      await callTelegramApi('sendMessage', { chat_id: chatId, text: BOT_COPY[language].privateOnly });
      return;
    }
    const menu = renderBotRemoveMenu(chatId, language);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: menu.text,
      reply_markup: menu.reply_markup,
    });
    return;
  }
  if (command === '/open' || command === '/launch') {
    if (!APP_URL) {
      await callTelegramApi('sendMessage', { chat_id: chatId, text: BOT_COPY[language].pwaMissing });
      return;
    }
    const buttons = renderPwaButton(language, message.chat?.type === 'private');
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: BOT_COPY[language].openPwa,
      reply_markup: { inline_keyboard: [buttons] },
    });
    return;
  }
  if (command === '/help') {
    const buttons = renderPwaButton(language, message.chat?.type === 'private');
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: BOT_COPY[language].help,
      reply_markup: buttons.length ? { inline_keyboard: [buttons] } : undefined,
    });
    return;
  }

  pendingAppAdds.delete(chatId);
  if (command === '/start' || command === '/language') {
    const menu = renderBotWelcome(language, message.chat?.type === 'private');
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: menu.text,
      reply_markup: menu.reply_markup,
    });
    return;
  }
  if (command === '/apps' || command === '/launcher') {
    const menu = renderBotAppMenu(chatId, language, 0, message.chat?.type === 'private');
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: menu.text,
      reply_markup: menu.reply_markup,
    });
    return;
  }

  const buttons = renderPwaButton(language, message.chat?.type === 'private');
  await callTelegramApi('sendMessage', {
    chat_id: chatId,
    text: BOT_COPY[language].unknown,
    reply_markup: buttons.length ? { inline_keyboard: [buttons] } : undefined,
  });
}

app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
  res.status(200).send('OK');
  if (!BOT_TOKEN) return;

  const update = req.body as TelegramBotUpdate;
  void handleTelegramUpdate(update).catch((error: unknown) => {
    const details = error instanceof Error ? error.message : 'Unknown Telegram webhook error.';
    console.warn('[Telegram webhook] Failed to update the app menu:', details);
  });
});

async function startTelegramPolling(): Promise<void> {
  if (!BOT_TOKEN) return;

  telegramBotStatus = 'starting';
  let stateLoaded = false;
  let initializationRetryDelay = 1_000;
  while (true) {
    try {
      if (!stateLoaded) {
        await loadBotState();
        stateLoaded = true;
      }
      await callTelegramApi('deleteWebhook', { drop_pending_updates: false });
      break;
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown Telegram polling initialization error.';
      telegramBotStatus = 'reconnecting';
      console.error('[Telegram Bot] Could not initialize long polling; retrying:', details);
      await new Promise((resolve) => setTimeout(resolve, initializationRetryDelay));
      initializationRetryDelay = Math.min(initializationRetryDelay * 2, 30_000);
    }
  }

  console.log('[Telegram Bot] Long polling started.');
  try {
    const botCommands = [
      { command: 'start', description: 'Welcome and choose your language' },
      { command: 'apps', description: 'Show your apps' },
      { command: 'open', description: 'Launch the web app launcher' },
      { command: 'add', description: 'Add an HTTPS app link' },
      { command: 'remove', description: 'Remove a saved app' },
      { command: 'language', description: 'Change language' },
      { command: 'help', description: 'Show help and available commands' },
      { command: 'cancel', description: 'Cancel adding an app' },
    ] as const;
    await callTelegramApi('setMyCommands', { commands: botCommands });
    await callTelegramApi('setMyCommands', {
      commands: [
        { command: 'start', description: 'Bienvenida y elegir idioma' },
        { command: 'apps', description: 'Mostrar tus aplicaciones' },
        { command: 'open', description: 'Abrir el lanzador web' },
        { command: 'add', description: 'Agregar un enlace HTTPS' },
        { command: 'remove', description: 'Quitar una aplicación' },
        { command: 'language', description: 'Cambiar idioma' },
        { command: 'help', description: 'Ver ayuda y comandos' },
        { command: 'cancel', description: 'Cancelar la adición' },
      ],
      language_code: 'es',
    });
    await callTelegramApi('setMyCommands', {
      commands: [
        { command: 'start', description: 'Boas-vindas e escolha o idioma' },
        { command: 'apps', description: 'Mostrar seus aplicativos' },
        { command: 'open', description: 'Abrir o lançador web' },
        { command: 'add', description: 'Adicionar um link HTTPS' },
        { command: 'remove', description: 'Remover um aplicativo' },
        { command: 'language', description: 'Alterar idioma' },
        { command: 'help', description: 'Ver ajuda e comandos' },
        { command: 'cancel', description: 'Cancelar a adição' },
      ],
      language_code: 'pt',
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown Telegram command setup error.';
    console.warn('[Telegram Bot] Could not register localized commands:', details);
  }

  if (APP_URL) {
    try {
      await callTelegramApi('setChatMenuButton', {
        menu_button: {
          type: 'web_app',
          text: 'Open launcher',
          web_app: { url: APP_URL },
        },
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : 'Unknown Telegram menu button setup error.';
      console.warn('[Telegram Bot] Could not set the PWA menu button:', details);
    }
  }

  let offset = 0;
  let retryDelay = 1_000;
  while (true) {
    try {
      const updates = await callTelegramApi<TelegramBotUpdate[]>('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message', 'callback_query'],
      });

      telegramBotStatus = 'running';
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        try {
          await handleTelegramUpdate(update);
        } catch (error) {
          const details = error instanceof Error ? error.message : 'Unknown Telegram update error.';
          console.warn('[Telegram Bot] Failed to process an update:', details);
        }
      }
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
    if (BOT_TOKEN) void startTelegramPolling();
  });
}

startServer();
