import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    fs.writeFileSync(APPS_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
  if (!fs.existsSync(PREFS_FILE)) {
    fs.writeFileSync(PREFS_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function readAppsStore(): Record<string, any[]> {
  try {
    ensureDataDir();
    const data = fs.readFileSync(APPS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading apps store:', err);
    return {};
  }
}

function writeAppsStore(store: Record<string, any[]>) {
  try {
    ensureDataDir();
    fs.writeFileSync(APPS_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing apps store:', err);
  }
}

function readPrefsStore(): Record<string, { language: 'en' | 'es' }> {
  try {
    ensureDataDir();
    const data = fs.readFileSync(PREFS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading prefs store:', err);
    return {};
  }
}

function writePrefsStore(store: Record<string, { language: 'en' | 'es' }>) {
  try {
    ensureDataDir();
    fs.writeFileSync(PREFS_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing prefs store:', err);
  }
}

function getUserLanguage(userId: string | number): 'en' | 'es' {
  const prefs = readPrefsStore();
  const uid = String(userId);
  return prefs[uid]?.language || 'en';
}

function setUserLanguage(userId: string | number, lang: 'en' | 'es') {
  const prefs = readPrefsStore();
  const uid = String(userId);
  prefs[uid] = { ...(prefs[uid] || {}), language: lang };
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
  const data = await response.json();
  return data;
}

// Telegram /start & Command message handler with language selection
async function handleTelegramMessage(chatId: number, text: string, fromUser: any, currentAppUrl: string) {
  const userId = fromUser?.id || chatId;
  const cleanCmd = (text || '').trim().toLowerCase();
  const currentLang = getUserLanguage(userId);

  if (cleanCmd.startsWith('/start') || cleanCmd === '/language' || cleanCmd === '/lang') {
    // Dynamic Language Selection Setup Chat Flow
    const promptText = 
      `👋 *Welcome to Web App Launcher!* / *¡Bienvenido al Lanzador Web!*\n\n` +
      `Please select your interface language:\n` +
      `Por favor selecciona tu idioma de preferencia:`;

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
    // Direct launch command
    const isEs = currentLang === 'es';
    const textMsg = isEs
      ? '🚀 *Lanzador de Apps Web*\nToca el botón a continuación para abrir tu panel de aplicaciones in-app:'
      : '🚀 *Web App Launcher*\nTap below to open your in-app applications dashboard:';
    const btnText = isEs ? '🚀 Abrir Lanzador de Apps' : '🚀 Open Web App Launcher';

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
          ],
          [
            {
              text: isEs ? '🌐 Cambiar Idioma' : '🌐 Change Language',
              callback_data: 'reselect_lang'
            }
          ]
        ]
      }
    });
  } else if (cleanCmd.startsWith('/help')) {
    const isEs = currentLang === 'es';
    const helpMsg = isEs
      ? `📖 *Comandos del Lanzador de Apps:*\n\n` +
        `• /start - Menú de inicio y selección de idioma\n` +
        `• /launcher - Abrir el lanzador de apps in-app\n` +
        `• /language - Cambiar idioma (Español / English)\n` +
        `• /help - Mostrar esta ayuda\n\n` +
        `_Todas las apps se ejecutan de manera estricta dentro de Telegram._`
      : `📖 *Web App Launcher Commands:*\n\n` +
        `• /start - Setup chat & language selection\n` +
        `• /launcher - Open in-app web apps dashboard\n` +
        `• /language - Switch language (English / Spanish)\n` +
        `• /help - Display this guide\n\n` +
        `_All web apps run strictly inside Telegram._`;

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: helpMsg,
      parse_mode: 'Markdown',
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
    // Default reply
    const isEs = currentLang === 'es';
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: isEs ? 'Toca abajo para abrir tus aplicaciones web:' : 'Tap below to access your Web Apps:',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: isEs ? '🚀 Abrir Lanzador de Apps' : '🚀 Open Web App Launcher',
              web_app: { url: `${currentAppUrl}?lang=${currentLang}` }
            }
          ]
        ]
      }
    });
  }
}

// Telegram Callback Query handler (Language selection click)
async function handleTelegramCallback(callbackQuery: any, currentAppUrl: string) {
  const cbId = callbackQuery.id;
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data || '';
  const fromUser = callbackQuery.from;
  const userId = fromUser?.id || chatId;

  await callTelegramApi('answerCallbackQuery', { callback_query_id: cbId }).catch(() => {});

  if (data === 'reselect_lang') {
    return handleTelegramMessage(chatId, '/language', fromUser, currentAppUrl);
  }

  if (data.startsWith('set_lang:')) {
    const lang = data.split(':')[1] === 'es' ? 'es' : 'en';
    setUserLanguage(userId, lang);

    const isEs = lang === 'es';
    const replyText = isEs
      ? `🇪🇸 *¡Idioma configurado a Español!*\n\n` +
        `Bienvenido a tu *Lanzador de Web Apps de Telegram*.\n` +
        `Todas las aplicaciones se ejecutan estrictamente dentro de Telegram.\n\n` +
        `Toca el botón a continuación para abrir tu lanzador:`
      : `🇺🇸 *Language set to English!*\n\n` +
        `Welcome to your *Telegram Web App Launcher*.\n` +
        `All web applications run strictly inside Telegram.\n\n` +
        `Tap the button below to open your launcher:`;

    const btnText = isEs ? '🚀 Abrir Lanzador de Apps' : '🚀 Open Web App Launcher';

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
          ],
          [
            {
              text: isEs ? '🌐 Cambiar Idioma' : '🌐 Change Language',
              callback_data: 'reselect_lang'
            }
          ]
        ]
      }
    });
  }
}

// Background Long-Polling Worker
async function startBotPolling() {
  if (isPollingActive || isWebhookConfigured || !runtimeBotToken) return;
  isPollingActive = true;

  console.log('Telegram Bot Polling started (Bi-lingual /start & In-App flow).');

  while (isPollingActive && !isWebhookConfigured && runtimeBotToken) {
    try {
      const updates = await callTelegramApi('getUpdates', {
        offset: pollingOffset,
        timeout: 15,
        allowed_updates: ['message', 'callback_query']
      });

      if (updates.ok && Array.isArray(updates.result)) {
        for (const update of updates.result) {
          pollingOffset = update.update_id + 1;

          if (update.message) {
            const chatId = update.message.chat?.id;
            const text = update.message.text || '';
            const fromUser = update.message.from;
            const appUrl = getAppUrl();
            if (chatId) {
              await handleTelegramMessage(chatId, text, fromUser, appUrl).catch(console.error);
            }
          } else if (update.callback_query) {
            const appUrl = getAppUrl();
            await handleTelegramCallback(update.callback_query, appUrl).catch(console.error);
          }
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes('409')) {
        isPollingActive = false;
        isWebhookConfigured = true;
        break;
      }
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  isPollingActive = false;
}

// Telegram native initData HMAC-SHA256 signature validation (No external logins!)
function verifyTelegramInitData(initDataString: string, botToken: string): { valid: boolean; user?: any; error?: string } {
  try {
    if (!initDataString) {
      return { valid: false, error: 'Empty initData' };
    }
    const params = new URLSearchParams(initDataString);
    const hash = params.get('hash');
    if (!hash) {
      return { valid: false, error: 'Missing hash in initData' };
    }

    params.delete('hash');
    const sortedKeys = Array.from(params.keys()).sort();
    const checkString = sortedKeys.map(k => `${k}=${params.get(k)}`).join('\n');

    // Telegram's secret key is HMAC-SHA256("WebAppData", botToken)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    const isValid = crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
    if (!isValid) {
      return { valid: false, error: 'Hash mismatch' };
    }

    const userRaw = params.get('user');
    const user = userRaw ? JSON.parse(userRaw) : null;
    return { valid: true, user };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Verification exception' };
  }
}

// ================= API ROUTES =================

// 1. In-App Embedded Web Proxy (Guarantees strict in-app iframe embedding without external browser)
app.get('/api/proxy', async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const parsed = new URL(targetUrl);
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8'
      }
    });

    const contentType = response.headers.get('content-type') || 'text/html';

    // Remove restrictive framing headers so app renders smoothly inside Telegram iframe
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', contentType);

    if (contentType.includes('text/html')) {
      let html = await response.text();
      // Inject base tag so relative links, assets and css resolve cleanly
      const baseTag = `<base href="${parsed.origin}${parsed.pathname}">`;
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}`);
      } else {
        html = `${baseTag}${html}`;
      }
      return res.send(html);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err: any) {
    res.status(502).send(`Error proxying ${targetUrl}: ${err.message}`);
  }
});

// 2. User Language Preferences
app.get('/api/user/preferences', (req: Request, res: Response) => {
  const userId = req.query.userId?.toString() || 'default';
  const language = getUserLanguage(userId);
  res.json({ userId, language });
});

app.post('/api/user/preferences', (req: Request, res: Response) => {
  const { userId, language } = req.body;
  if (!userId || (language !== 'en' && language !== 'es')) {
    return res.status(400).json({ error: 'Valid userId and language (en/es) required' });
  }
  setUserLanguage(userId, language);
  res.json({ success: true, language });
});

// 3. Bot Status
app.get('/api/bot/status', async (req: Request, res: Response) => {
  const currentAppUrl = getAppUrl(req);
  if (!runtimeBotToken) {
    return res.json({
      configured: false,
      appUrl: currentAppUrl,
      message: 'No bot token configured. BotFather guide is available.'
    });
  }

  try {
    if (!cachedBotInfo) {
      const meResult = await callTelegramApi('getMe', {});
      if (meResult.ok) {
        cachedBotInfo = meResult.result;
      }
    }

    res.json({
      configured: true,
      botUsername: cachedBotInfo?.username,
      botName: cachedBotInfo?.first_name,
      appUrl: currentAppUrl,
      webhookUrl: `${currentAppUrl}/api/telegram-webhook`,
      isPolling: isPollingActive,
      isWebhook: isWebhookConfigured
    });
  } catch (err: any) {
    res.json({
      configured: true,
      error: err.message,
      appUrl: currentAppUrl
    });
  }
});

// 4. Configure Bot (Token + setChatMenuButton + setWebhook)
app.post('/api/bot/configure', async (req: Request, res: Response) => {
  const { token, autoSetupWebhook, autoSetupMenuButton } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ success: false, error: 'Token string is required' });
  }

  const cleanToken = token.trim();
  const currentAppUrl = getAppUrl(req);

  try {
    const meRes = await callTelegramApi('getMe', {}, cleanToken);
    if (!meRes.ok) {
      return res.status(400).json({ success: false, error: meRes.description || 'Invalid Telegram Bot Token' });
    }

    runtimeBotToken = cleanToken;
    cachedBotInfo = meRes.result;

    const setupResults: Record<string, any> = { bot: meRes.result };

    // Setup Chat Menu Button
    if (autoSetupMenuButton !== false) {
      try {
        const menuBtnRes = await callTelegramApi('setChatMenuButton', {
          menu_button: {
            type: 'web_app',
            text: '🚀 Launcher',
            web_app: {
              url: currentAppUrl
            }
          }
        }, cleanToken);
        setupResults.menuButton = menuBtnRes;
      } catch (e: any) {
        setupResults.menuButtonError = e.message;
      }
    }

    // Setup Webhook if HTTPS, otherwise use background Polling
    if (autoSetupWebhook !== false && currentAppUrl.startsWith('https://')) {
      try {
        const webhookUrl = `${currentAppUrl}/api/telegram-webhook`;
        const hookRes = await callTelegramApi('setWebhook', {
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query']
        }, cleanToken);
        setupResults.webhook = hookRes;
        isWebhookConfigured = true;
      } catch (e: any) {
        setupResults.webhookError = e.message;
        isWebhookConfigured = false;
        startBotPolling();
      }
    } else {
      isWebhookConfigured = false;
      startBotPolling();
    }

    res.json({
      success: true,
      bot: meRes.result,
      appUrl: currentAppUrl,
      setupResults
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Failed to configure bot' });
  }
});

// 5. Telegram Webhook Handler
app.post('/api/telegram-webhook', async (req: Request, res: Response) => {
  res.status(200).send('OK');

  const update = req.body;
  if (!update) return;

  const currentAppUrl = getAppUrl(req);

  if (update.message) {
    const chatId = update.message.chat?.id;
    const text = update.message.text || '';
    const fromUser = update.message.from;
    if (chatId) {
      await handleTelegramMessage(chatId, text, fromUser, currentAppUrl).catch(console.error);
    }
  } else if (update.callback_query) {
    await handleTelegramCallback(update.callback_query, currentAppUrl).catch(console.error);
  }
});

// 6. Test Bot Command endpoint
app.post('/api/bot/test-command', async (req: Request, res: Response) => {
  const { command, user, lang } = req.body;
  const currentAppUrl = getAppUrl(req);
  const selectedLang = lang === 'es' ? 'es' : 'en';

  if (command === '/start' || command === '/language') {
    return res.json({
      text: `👋 Welcome! Please choose your preferred language:\n\n👋 ¡Bienvenido! Por favor elija su idioma preferido:`,
      keyboard: [
        [
          { text: '🇺🇸 English', callback_data: 'set_lang:en' },
          { text: '🇪🇸 Español', callback_data: 'set_lang:es' }
        ]
      ]
    });
  }

  const isEs = selectedLang === 'es';
  res.json({
    text: isEs
      ? `🚀 *Lanzador de Apps Web*\nToca el botón a continuación para abrir tu panel de aplicaciones in-app:`
      : `🚀 *Web App Launcher*\nTap below to open your in-app applications dashboard:`,
    keyboard: [
      [
        {
          text: isEs ? '🚀 Abrir Lanzador de Apps' : '🚀 Open Web App Launcher',
          url: `${currentAppUrl}?lang=${selectedLang}`
        }
      ]
    ]
  });
});

// 7. Auth / Validate InitData (Native Telegram Only - No external logins)
app.post('/api/auth/validate-init-data', (req: Request, res: Response) => {
  const { initData } = req.body;

  if (!initData) {
    return res.json({
      valid: false,
      reason: 'No initData provided (Standard preview mode)'
    });
  }

  if (!runtimeBotToken) {
    try {
      const params = new URLSearchParams(initData);
      const userRaw = params.get('user');
      const user = userRaw ? JSON.parse(userRaw) : null;
      return res.json({
        valid: true,
        isDevFallback: true,
        user,
        message: 'Validated in dev mode'
      });
    } catch {
      return res.json({ valid: false, reason: 'Failed to parse initData' });
    }
  }

  const result = verifyTelegramInitData(initData, runtimeBotToken);
  res.json(result);
});

// 8. User Apps Persistence API
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

  if (!Array.isArray(apps)) {
    return res.status(400).json({ error: 'apps must be an array' });
  }

  const store = readAppsStore();
  store[uid] = apps;
  writeAppsStore(store);

  res.json({ success: true, count: apps.length });
});

app.post('/api/apps/reset', (req: Request, res: Response) => {
  const { userId } = req.body;
  const uid = userId ? String(userId) : 'default';

  const store = readAppsStore();
  delete store[uid];
  writeAppsStore(store);

  res.json({ success: true, message: 'Reset to default apps' });
});

// Start Server
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (runtimeBotToken) {
    startBotPolling();
  }

  app.listen(PORT, () => {
    console.log(`Telegram Web App Launcher server running on port ${PORT}`);
    console.log(`App URL: ${getAppUrl()}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
