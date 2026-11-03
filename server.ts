import express from 'express';
import type { Request, Response, NextFunction } from 'express';
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

type BotLanguage = 'en' | 'es' | 'pt';
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
};

let serverSyncedApps: unknown[] = [...CORE_APPS];

const LANGUAGE_PROMPTS: Record<BotLanguage, string> = {
  en: 'Which language do you prefer? Choose one to open your app.',
  es: '¿Qué idioma prefieres? Elige uno para abrir la aplicación.',
  pt: 'Qual idioma você prefere? Escolha um para abrir o aplicativo.',
};

const APP_URL_MISSING: Record<BotLanguage, string> = {
  en: 'The app link is not configured yet. Please contact the bot administrator.',
  es: 'El enlace de la aplicación aún no está configurado. Contacta al administrador del bot.',
  pt: 'O link do aplicativo ainda não foi configurado. Fale com o administrador do bot.',
};

const LANGUAGE_CHOICES: Array<{ language: BotLanguage; text: string }> = [
  { language: 'en', text: '🇺🇸 English' },
  { language: 'pt', text: '🇧🇷 Português' },
  { language: 'es', text: '🇪🇸 Español' },
];

function getPublicAppUrl(): URL | null {
  const configuredUrl = process.env.APP_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

const APP_URL = getPublicAppUrl();
if (!APP_URL) {
  console.warn('[Telegram Bot] Set APP_URL to the launcher public HTTPS URL; language buttons are disabled.');
}

function getBotLanguage(languageCode: unknown): BotLanguage {
  if (typeof languageCode !== 'string') return 'en';
  if (languageCode.toLowerCase().startsWith('pt')) return 'pt';
  if (languageCode.toLowerCase().startsWith('es')) return 'es';
  return 'en';
}

function buildLanguageKeyboard(isPrivateChat: boolean) {
  if (!APP_URL) return undefined;

  return {
    inline_keyboard: LANGUAGE_CHOICES.map(({ language, text }) => {
      const url = new URL(APP_URL);
      url.searchParams.set('lang', language);
      return [{
        text,
        ...(isPrivateChat ? { web_app: { url: url.toString() } } : { url: url.toString() }),
      }];
    }),
  };
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

async function handleTelegramUpdate(update: TelegramBotUpdate): Promise<void> {
  const message = update.message;
  if (!message?.chat?.id || typeof message.text !== 'string') return;
  const command = message.text.trim().split(/\s+/, 1)[0].split('@', 1)[0];
  if (command !== '/start' && command !== '/launcher') return;

  const language = getBotLanguage(message.from?.language_code);
  const replyMarkup = buildLanguageKeyboard(message.chat.type === 'private');
  await callTelegramApi('sendMessage', {
    chat_id: message.chat.id,
    text: APP_URL ? LANGUAGE_PROMPTS[language] : APP_URL_MISSING[language],
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
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
        allowed_updates: ['message'],
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
