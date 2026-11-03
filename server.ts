import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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

const APP_CATEGORIES: AppCategory[] = ['Social', 'Work', 'Tools', 'Media', 'Other'];
const BOT_PAGE_SIZE = 8;
let serverSyncedApps: unknown[] = [...CORE_APPS];

const BOT_COPY: Record<BotLanguage, {
  title: string;
  description: string;
  page: string;
  apps: string;
  empty: string;
  all: string;
  categories: Record<AppCategory, string>;
}> = {
  en: {
    title: '📱 <b>Your apps</b>',
    description: 'Choose a category, then tap an app to open it in Telegram.',
    page: 'Page',
    apps: 'apps',
    empty: 'No apps in this category.',
    all: 'All',
    categories: { Social: 'Social', Work: 'Work', Tools: 'Tools', Media: 'Media', Other: 'Other' },
  },
  es: {
    title: '📱 <b>Tus aplicaciones</b>',
    description: 'Elige una categoría y toca una aplicación para abrirla en Telegram.',
    page: 'Página',
    apps: 'aplicaciones',
    empty: 'No hay aplicaciones en esta categoría.',
    all: 'Todas',
    categories: { Social: 'Social', Work: 'Trabajo', Tools: 'Herramientas', Media: 'Medios', Other: 'Otros' },
  },
  pt: {
    title: '📱 <b>Seus aplicativos</b>',
    description: 'Escolha uma categoria e toque em um aplicativo para abri-lo no Telegram.',
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

function getBotApps(): TelegramBotApp[] {
  return serverSyncedApps.flatMap((value): TelegramBotApp[] => {
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

  return { text, reply_markup: { inline_keyboard: keyboard } };
}

function parseBotMenuCallback(data: unknown): { category: AppCategory | 'All'; page: number } | null {
  if (typeof data !== 'string' || data.length > 64) return null;
  const categoryMatch = /^launcher:category:(All|Social|Work|Tools|Media|Other)$/.exec(data);
  if (categoryMatch) return { category: categoryMatch[1] as AppCategory | 'All', page: 0 };

  const pageMatch = /^launcher:page:(All|Social|Work|Tools|Media|Other):(\d{1,4})$/.exec(data);
  if (pageMatch) return { category: pageMatch[1] as AppCategory | 'All', page: Number(pageMatch[2]) };
  return null;
}

async function callTelegramApi(method: string, payload: Record<string, unknown>): Promise<void> {
  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Telegram ${method} network request failed.`);
  }

  let result: { ok?: boolean; description?: string };
  try {
    result = await response.json() as { ok?: boolean; description?: string };
  } catch {
    throw new Error(`Telegram ${method} returned an invalid response (${response.status}).`);
  }
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method} failed (${response.status}): ${result.description || 'unknown error'}`);
  }
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
  if (Array.isArray(apps) && apps.length > 0) {
    serverSyncedApps = apps;
  }
  res.status(200).json({
    status: 'ok',
    syncedAt: Date.now(),
    clientTimestamp: clientTimestamp || null,
    count: serverSyncedApps.length,
  });
});

/**
 * Telegram Bot Webhook endpoint.
 * The bot menu is rendered and navigated entirely through Telegram messages and inline buttons.
 */
app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
  const update = req.body;
  res.status(200).send('OK');

  if (!BOT_TOKEN) return;

  try {
    const callback = update?.callback_query;
    if (callback) {
      if (!callback.id) return;
      await callTelegramApi('answerCallbackQuery', { callback_query_id: callback.id });

      const state = parseBotMenuCallback(callback.data);
      const chatId = callback.message?.chat?.id;
      const messageId = callback.message?.message_id;
      if (!state || chatId === undefined || messageId === undefined) return;

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

    const message = update?.message;
    if (!message?.chat?.id || typeof message.text !== 'string') return;
    const command = message.text.trim().split(/\s+/, 1)[0].split('@', 1)[0];
    if (command !== '/start' && command !== '/launcher') return;

    const menu = renderBotAppMenu(
      getBotLanguage(message.from?.language_code),
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
  } catch (error) {
    const details = error instanceof Error ? error.message : 'Unknown Telegram webhook error.';
    console.warn('[Telegram webhook] Failed to update the app menu:', details);
  }
});

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
  });
}

startServer();
