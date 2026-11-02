import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Low-memory optimizations for Express
app.disable('x-powered-by');
app.set('etag', false);
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// Determine effective App URL
function getAppUrl(req?: Request): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  if (req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) {
      return `${proto}://${host}`;
    }
  }
  return `http://localhost:${PORT}`;
}

// In-memory runtime bot state
let runtimeBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
let cachedBotInfo: { id?: number; username?: string; first_name?: string } | null = null;
let isPollingActive = false;
let pollingOffset = 0;
let isWebhookConfigured = false;

// File-based persistence directories & helpers
const DATA_DIR = path.join(__dirname, 'data');
const APPS_FILE = path.join(DATA_DIR, 'apps-store.json');
const PREFS_FILE = path.join(DATA_DIR, 'preferences-store.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(APPS_FILE)) {
    fs.writeFileSync(APPS_FILE, '{}', 'utf-8');
  }
  if (!fs.existsSync(PREFS_FILE)) {
    fs.writeFileSync(PREFS_FILE, '{}', 'utf-8');
  }
}

function readAppsStore(): Record<string, any[]> {
  try {
    ensureDataDir();
    const data = fs.readFileSync(APPS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function writeAppsStore(store: Record<string, any[]>) {
  try {
    ensureDataDir();
    fs.writeFileSync(APPS_FILE, JSON.stringify(store), 'utf-8');
  } catch {}
}

function readPrefsStore(): Record<string, { language: 'en' | 'es' }> {
  try {
    ensureDataDir();
    const data = fs.readFileSync(PREFS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function writePrefsStore(store: Record<string, { language: 'en' | 'es' }>) {
  try {
    ensureDataDir();
    fs.writeFileSync(PREFS_FILE, JSON.stringify(store), 'utf-8');
  } catch {}
}

function getUserLanguage(userId: string | number): 'en' | 'es' {
  const prefs = readPrefsStore();
  return prefs[String(userId)]?.language || 'en';
}

function setUserLanguage(userId: string | number, lang: 'en' | 'es') {
  const prefs = readPrefsStore();
  prefs[String(userId)] = { ...(prefs[String(userId)] || {}), language: lang };
  writePrefsStore(prefs);
}

// Telegram Bot API helper
async function callTelegramApi(method: string, payload: any, tokenOverride?: string) {
  const token = tokenOverride || runtimeBotToken;
  if (!token) {
    throw new Error('Telegram Bot Token is not configured');
  }
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await response.json();
}

// Message handler for /start and commands
async function handleTelegramMessage(chatId: number, text: string, fromUser: any, currentAppUrl: string) {
  const userId = fromUser?.id || chatId;
  const cleanCmd = (text || '').trim().toLowerCase();
  const currentLang = getUserLanguage(userId);

  if (cleanCmd.startsWith('/start') || cleanCmd === '/language' || cleanCmd === '/lang') {
    const promptText = 
      `👋 *Welcome to Web App Launcher!* / *¡Bienvenido al Lanzador Web!*\n\n` +
      `Please select your language / Selecciona tu idioma:`;

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: promptText,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🇺🇸 English', callback_data: 'set_lang:en' },
            { text: '🇪🇸 Español', callback_data: 'set_lang:es' }
          ]
        ]
      }
    });
  } else if (cleanCmd.startsWith('/launcher')) {
    const isEs = currentLang === 'es';
    const textMsg = isEs ? '🚀 *Lanzador de Apps Web*' : '🚀 *Web App Launcher*';
    const btnText = isEs ? '🚀 Abrir Lanzador' : '🚀 Open Launcher';

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: textMsg,
      parse_mode: 'Markdown',
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
  } else if (cleanCmd.startsWith('/help')) {
    const isEs = currentLang === 'es';
    const helpMsg = isEs
      ? `• /start - Idioma y lanzador\n• /launcher - Abrir apps\n• /language - Cambiar idioma`
      : `• /start - Setup & launch\n• /launcher - Open apps\n• /language - Switch language`;

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: helpMsg,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: isEs ? '🚀 Abrir Lanzador' : '🚀 Open Launcher',
              web_app: { url: `${currentAppUrl}?lang=${currentLang}` }
            }
          ]
        ]
      }
    });
  } else {
    const isEs = currentLang === 'es';
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: isEs ? 'Toca abajo para abrir el lanzador:' : 'Tap below to open your launcher:',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: isEs ? '🚀 Abrir Lanzador' : '🚀 Open Launcher',
              web_app: { url: `${currentAppUrl}?lang=${currentLang}` }
            }
          ]
        ]
      }
    });
  }
}

// Callback Query Handler
async function handleTelegramCallback(callbackQuery: any, currentAppUrl: string) {
  const cbId = callbackQuery.id;
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data || '';
  const fromUser = callbackQuery.from;
  const userId = fromUser?.id || chatId;

  await callTelegramApi('answerCallbackQuery', { callback_query_id: cbId }).catch(() => {});

  if (data.startsWith('set_lang:')) {
    const lang = data.split(':')[1] === 'es' ? 'es' : 'en';
    setUserLanguage(userId, lang);

    const isEs = lang === 'es';
    const replyText = isEs
      ? `🇪🇸 *¡Idioma configurado a Español!*\n\nToca abajo para abrir tu lanzador in-app:`
      : `🇺🇸 *Language set to English!*\n\nTap below to open your in-app launcher:`;

    const btnText = isEs ? '🚀 Abrir Lanzador' : '🚀 Open Launcher';

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: replyText,
      parse_mode: 'Markdown',
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

// Lightweight Bot Polling Worker
async function startBotPolling() {
  if (isPollingActive || isWebhookConfigured || !runtimeBotToken) return;
  isPollingActive = true;

  while (isPollingActive && !isWebhookConfigured && runtimeBotToken) {
    try {
      const updates = await callTelegramApi('getUpdates', {
        offset: pollingOffset,
        timeout: 20,
        allowed_updates: ['message', 'callback_query']
      });

      if (updates.ok && Array.isArray(updates.result)) {
        for (const update of updates.result) {
          pollingOffset = update.update_id + 1;
          const appUrl = getAppUrl();

          if (update.message) {
            const chatId = update.message.chat?.id;
            const text = update.message.text || '';
            const fromUser = update.message.from;
            if (chatId) {
              await handleTelegramMessage(chatId, text, fromUser, appUrl).catch(() => {});
            }
          } else if (update.callback_query) {
            await handleTelegramCallback(update.callback_query, appUrl).catch(() => {});
          }
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes('409')) {
        isPollingActive = false;
        isWebhookConfigured = true;
        break;
      }
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  isPollingActive = false;
}

// Telegram native initData HMAC-SHA256 validation
function verifyTelegramInitData(initDataString: string, botToken: string): { valid: boolean; user?: any; error?: string } {
  try {
    if (!initDataString) return { valid: false, error: 'Empty' };
    const params = new URLSearchParams(initDataString);
    const hash = params.get('hash');
    if (!hash) return { valid: false, error: 'Missing hash' };

    params.delete('hash');
    const sortedKeys = Array.from(params.keys()).sort();
    const checkString = sortedKeys.map(k => `${k}=${params.get(k)}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    const isValid = crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
    if (!isValid) return { valid: false, error: 'Invalid' };

    const userRaw = params.get('user');
    return { valid: true, user: userRaw ? JSON.parse(userRaw) : null };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

// ================= API ROUTES =================

// 1. Memory-efficient Streamed In-App Web Proxy
app.get('/api/proxy', async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) return res.status(400).send('Missing url');

  try {
    const parsed = new URL(targetUrl);
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    const contentType = response.headers.get('content-type') || 'text/html';
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', contentType);

    // If HTML, inject base tag and send; if binary/media, stream without buffering in memory!
    if (contentType.includes('text/html')) {
      let html = await response.text();
      const baseTag = `<base href="${parsed.origin}${parsed.pathname}">`;
      html = html.includes('<head>') ? html.replace('<head>', `<head>${baseTag}`) : `${baseTag}${html}`;
      return res.send(html);
    }

    if (response.body) {
      // Pipe stream directly to HTTP response - uses almost 0 RAM!
      Readable.fromWeb(response.body as any).pipe(res);
    } else {
      res.end();
    }
  } catch {
    res.status(502).send('Error');
  }
});

// 2. User Language Preferences
app.get('/api/user/preferences', (req: Request, res: Response) => {
  const userId = req.query.userId?.toString() || 'default';
  res.json({ userId, language: getUserLanguage(userId) });
});

app.post('/api/user/preferences', (req: Request, res: Response) => {
  const { userId, language } = req.body;
  if (userId && (language === 'en' || language === 'es')) {
    setUserLanguage(userId, language);
  }
  res.json({ success: true, language });
});

// 3. User Apps Persistence API
app.get('/api/apps', (req: Request, res: Response) => {
  const userId = req.query.userId?.toString() || 'default';
  const store = readAppsStore();
  const userApps = store[userId];
  res.json({
    userId,
    hasCustomApps: Boolean(userApps && userApps.length > 0),
    apps: userApps || null
  });
});

app.post('/api/apps', (req: Request, res: Response) => {
  const { userId, apps } = req.body;
  const uid = userId ? String(userId) : 'default';
  if (Array.isArray(apps)) {
    const store = readAppsStore();
    store[uid] = apps;
    writeAppsStore(store);
  }
  res.json({ success: true });
});

app.post('/api/apps/reset', (req: Request, res: Response) => {
  const { userId } = req.body;
  const uid = userId ? String(userId) : 'default';
  const store = readAppsStore();
  delete store[uid];
  writeAppsStore(store);
  res.json({ success: true });
});

// 4. Telegram Webhook Handler
app.post('/api/telegram-webhook', async (req: Request, res: Response) => {
  res.status(200).send('OK');
  const update = req.body;
  if (!update) return;

  const currentAppUrl = getAppUrl(req);
  if (update.message) {
    const chatId = update.message.chat?.id;
    if (chatId) {
      await handleTelegramMessage(chatId, update.message.text || '', update.message.from, currentAppUrl).catch(() => {});
    }
  } else if (update.callback_query) {
    await handleTelegramCallback(update.callback_query, currentAppUrl).catch(() => {});
  }
});

// 5. Auth / Validate InitData
app.post('/api/auth/validate-init-data', (req: Request, res: Response) => {
  const { initData } = req.body;
  if (!initData) return res.json({ valid: false });

  if (!runtimeBotToken) {
    try {
      const params = new URLSearchParams(initData);
      const userRaw = params.get('user');
      return res.json({ valid: true, user: userRaw ? JSON.parse(userRaw) : null });
    } catch {
      return res.json({ valid: false });
    }
  }

  res.json(verifyTelegramInitData(initData, runtimeBotToken));
});

// Start Server: High-efficiency static delivery (uses minimal RAM)
async function startServer() {
  const distPath = path.join(__dirname, 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  // If built dist exists, ALWAYS serve static files (saves ~100MB RAM compared to Vite in-memory server!)
  if (hasDist || process.env.NODE_ENV === 'production') {
    app.use(express.static(distPath, {
      maxAge: '7d',
      etag: false
    }));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // Development fallback only when dist is absent
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
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

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
