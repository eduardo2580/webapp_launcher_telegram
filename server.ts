import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 8080;
const isProd = process.env.NODE_ENV === 'production';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
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
let telegramAddedApps: TelegramBotApp[] = [];
const pendingAppAdds = new Map<number, {
  messageId: number;
  language: BotLanguage;
}>();
const BOT_DATA_DIR = path.resolve(process.env.BOT_DATA_DIR || path.join(__dirname, 'data'));
const BOT_APPS_PATH = path.join(BOT_DATA_DIR, 'telegram-apps.json');
let botAppsWriteQueue: Promise<void> = Promise.resolve();

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
    addPrompt: 'Envía un enlace HTTPS para agregarlo. Envía /cancelar para detener.',
    addInvalid: 'El enlace HTTPS no es válido. Inténtalo de nuevo o envía /cancelar.',
    addDuplicate: 'Ese enlace ya está en tu lista.',
    addLimit: 'La lista de aplicaciones está llena.',
    addFailed: 'No se pudo guardar la aplicación. Inténtalo de nuevo.',
    addSuccess: '✅ Se agregó {title}.',
    addCancelled: 'Se canceló la adición.',
    addPrivateOnly: 'Abre un chat privado con el bot para agregar una aplicación.',
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
    addPrompt: 'Envie um link HTTPS para adicioná-lo. Envie /cancelar para parar.',
    addInvalid: 'Esse link HTTPS não é válido. Tente novamente ou envie /cancelar.',
    addDuplicate: 'Esse link já está na sua lista.',
    addLimit: 'Sua lista de aplicativos está cheia.',
    addFailed: 'Não foi possível salvar o aplicativo. Tente novamente.',
    addSuccess: '✅ {title} foi adicionado.',
    addCancelled: 'Adição cancelada.',
    addPrivateOnly: 'Abra uma conversa privada com o bot para adicionar um aplicativo.',
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

    return [{
      id,
      title: title.trim(),
      url: parsedUrl.toString(),
      category: APP_CATEGORIES.includes(category as AppCategory)
        ? category as AppCategory
        : 'Other',
    }];
  });
}

function getBotApps(): TelegramBotApp[] {
  const seen = new Set<string>();
  return [...normalizeBotApps(serverSyncedApps), ...telegramAddedApps]
    .filter((item) => {
      const key = item.url.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 200);
}

async function loadTelegramAddedApps(): Promise<void> {
  try {
    const content = await readFile(BOT_APPS_PATH, 'utf8');
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('Stored Telegram apps must be an array.');
    }
    telegramAddedApps = normalizeBotApps(parsed, true);
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return;
    throw error;
  }
}

function persistTelegramAddedApps(): Promise<void> {
  const write = botAppsWriteQueue.then(async () => {
    await mkdir(BOT_DATA_DIR, { recursive: true });
    const temporaryPath = `${BOT_APPS_PATH}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(telegramAddedApps, null, 2), 'utf8');
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

function getAppMetadata(): unknown[] {
  const existingUrls = new Set(normalizeBotApps(serverSyncedApps).map((item) => item.url.toLowerCase()));
  const additions = telegramAddedApps
    .filter((item) => !existingUrls.has(item.url.toLowerCase()))
    .map((item) => ({ ...item, icon: '', isCustom: true }));
  return [...serverSyncedApps, ...additions];
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
  language: BotLanguage,
  selectedCategory: AppCategory | 'All',
  requestedPage: number,
  allowMiniApps: boolean,
) {
  const copy = BOT_COPY[language];
  const apps = getBotApps();
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
      ...(allowMiniApps && app.url.startsWith('https:')
        ? { web_app: { url: app.url } }
        : { url: app.url }),
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

  return { text, reply_markup: { inline_keyboard: keyboard } };
}

function parseBotMenuCallback(data: unknown):
  | { action: 'add' }
  | { action: 'menu'; category: AppCategory | 'All'; page: number }
  | null {
  if (typeof data !== 'string' || data.length > 64) return null;
  if (data === 'launcher:add') return { action: 'add' };
  const categoryMatch = /^launcher:category:(All|Social|Work|Tools|Media|Other)$/.exec(data);
  if (categoryMatch) return { action: 'menu', category: categoryMatch[1] as AppCategory | 'All', page: 0 };

  const pageMatch = /^launcher:page:(All|Social|Work|Tools|Media|Other):(\d{1,4})$/.exec(data);
  if (pageMatch) {
    return { action: 'menu', category: pageMatch[1] as AppCategory | 'All', page: Number(pageMatch[2]) };
  }
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
    apps: getAppMetadata(),
  });
});

// Endpoint to receive background sync updates when connectivity is restored
app.post('/api/apps/sync', (req: Request, res: Response) => {
  const { apps, clientTimestamp } = req.body || {};
  if (Array.isArray(apps) && apps.length > 0) {
    serverSyncedApps = apps;
  }
  res.status(200).json({
    status: 'ok',
    syncedAt: Date.now(),
    clientTimestamp: clientTimestamp || null,
    count: getBotApps().length,
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
      const language = getBotLanguage(callback.from?.language_code);
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

    await callTelegramApi('answerCallbackQuery', { callback_query_id: callback.id });

    const menu = renderBotAppMenu(
      getBotLanguage(callback.from?.language_code),
      state.category,
      state.page,
      callback.message?.chat?.type === 'private',
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
  if (!message?.chat?.id || typeof message.text !== 'string') return;
  const input = message.text.trim();
  const command = input.split(/\s+/, 1)[0].split('@', 1)[0].toLowerCase();
  const chatId = message.chat.id;
  const pendingAdd = pendingAppAdds.get(chatId);
  const language = pendingAdd?.language || getBotLanguage(message.from?.language_code);

  if (pendingAdd && (command === '/cancel' || command === '/cancelar')) {
    pendingAppAdds.delete(chatId);
    await callTelegramApi('sendMessage', { chat_id: chatId, text: BOT_COPY[language].addCancelled });
    return;
  }

  if (pendingAdd && command !== '/start' && command !== '/launcher') {
    const appUrl = parseHttpsAppUrl(input);
    if (!appUrl) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: BOT_COPY[language].addInvalid,
        reply_markup: { force_reply: true },
      });
      return;
    }

    const apps = getBotApps();
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
    const menu = renderBotAppMenu(language, 'Other', 0, true);
    await callTelegramApi('editMessageText', {
      chat_id: chatId,
      message_id: pendingAdd.messageId,
      text: menu.text,
      parse_mode: 'HTML',
      reply_markup: menu.reply_markup,
    });
    return;
  }

  pendingAppAdds.delete(chatId);
  if (command !== '/start' && command !== '/launcher') return;

  const menu = renderBotAppMenu(
    language,
    'All',
    0,
    message.chat.type === 'private',
  );
  await callTelegramApi('sendMessage', {
    chat_id: message.chat.id,
    text: menu.text,
    parse_mode: 'HTML',
    reply_markup: menu.reply_markup,
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

  try {
    await callTelegramApi('deleteWebhook', { drop_pending_updates: false });
    console.log('[Telegram Bot] Long polling started.');
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown Telegram polling error.';
    console.error('[Telegram Bot] Could not initialize long polling:', details);
    return;
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
    if (BOT_TOKEN) void startTelegramPolling();
  });
}

startServer();
