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

// File-based persistence directory & helper
const DATA_DIR = path.join(__dirname, 'data');
const APPS_FILE = path.join(DATA_DIR, 'apps-store.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(APPS_FILE)) {
    fs.writeFileSync(APPS_FILE, JSON.stringify({}, null, 2), 'utf-8');
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

// Central handler for Telegram incoming commands (KISS & Telegram Directives)
async function handleTelegramMessage(chatId: number, text: string, fromUser: any, currentAppUrl: string) {
  const firstName = fromUser?.first_name || 'Friend';
  const cleanCmd = (text || '').trim().toLowerCase();

  if (cleanCmd.startsWith('/start') || cleanCmd.startsWith('/launcher')) {
    const welcome = 
      `👋 *Hello, ${firstName}!*\n\n` +
      `Welcome to *Web App Launcher* on Telegram.\n\n` +
      `Tap below to open your apps dashboard:`;

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: welcome,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Open Web App Launcher',
              web_app: { url: currentAppUrl }
            }
          ],
          [
            {
              text: '➕ Add App',
              web_app: { url: `${currentAppUrl}?action=add` }
            },
            {
              text: '📖 Help',
              callback_data: 'help'
            }
          ]
        ]
      }
    });
  } else if (cleanCmd.startsWith('/help')) {
    const help = 
      `*Web App Launcher Commands:*\n\n` +
      `• /start - Launch dashboard\n` +
      `• /launcher - Quick launch button\n` +
      `• /help - Show commands\n\n` +
      `*Tip:* Tap the menu button next to the chat bar to launch anytime!`;

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: help,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Open Launcher',
              web_app: { url: currentAppUrl }
            }
          ]
        ]
      }
    });
  } else {
    // Default reply for any casual text
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: `Tap below to access your Web Apps:`,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Open Web App Launcher',
              web_app: { url: currentAppUrl }
            }
          ]
        ]
      }
    });
  }
}

// Background Long-Polling Worker (Ensures bot works without external webhook)
async function startBotPolling() {
  if (isPollingActive || isWebhookConfigured || !runtimeBotToken) return;
  isPollingActive = true;

  console.log('Telegram Bot Polling started (KISS mode).');

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
            const cbId = update.callback_query.id;
            const chatId = update.callback_query.message?.chat?.id;
            const data = update.callback_query.data;
            const appUrl = getAppUrl();

            await callTelegramApi('answerCallbackQuery', { callback_query_id: cbId }).catch(() => {});
            if (data === 'help' && chatId) {
              await handleTelegramMessage(chatId, '/help', update.callback_query.from, appUrl).catch(console.error);
            }
          }
        }
      }
    } catch (err: any) {
      // If webhook is active, Telegram rejects getUpdates with 409
      if (err.message && err.message.includes('409')) {
        isPollingActive = false;
        isWebhookConfigured = true;
        break;
      }
      // Wait slightly on error before retry
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  isPollingActive = false;
}

// Telegram initData verification (HMAC-SHA256 according to core.telegram.org/bots/webapps)
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

// 1. Bot Status
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

// 2. Configure Bot (Token + setChatMenuButton + setWebhook)
app.post('/api/bot/configure', async (req: Request, res: Response) => {
  const { token, autoSetupWebhook, autoSetupMenuButton } = req.body;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ success: false, error: 'Token string is required' });
  }

  const cleanToken = token.trim();
  const currentAppUrl = getAppUrl(req);

  try {
    // 1. Test getMe
    const meRes = await callTelegramApi('getMe', {}, cleanToken);
    if (!meRes.ok) {
      return res.status(400).json({ success: false, error: meRes.description || 'Invalid Telegram Bot Token' });
    }

    runtimeBotToken = cleanToken;
    cachedBotInfo = meRes.result;

    const setupResults: Record<string, any> = {
      bot: meRes.result
    };

    // 2. Setup Chat Menu Button (/setmenubutton directive)
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

    // 3. Setup Webhook if HTTPS, otherwise enable Polling
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

// 3. Telegram Webhook Handler
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
    const cbId = update.callback_query.id;
    const chatId = update.callback_query.message?.chat?.id;
    const data = update.callback_query.data;

    await callTelegramApi('answerCallbackQuery', { callback_query_id: cbId }).catch(() => {});
    if (data === 'help' && chatId) {
      await handleTelegramMessage(chatId, '/help', update.callback_query.from, currentAppUrl).catch(console.error);
    }
  }
});

// 4. Test Bot Command endpoint
app.post('/api/bot/test-command', async (req: Request, res: Response) => {
  const { command, user } = req.body;
  const currentAppUrl = getAppUrl(req);
  const name = user?.first_name || 'Friend';

  if (command === '/start' || command === '/launcher') {
    return res.json({
      text: `👋 Hello, ${name}!\n\nWelcome to Web App Launcher on Telegram.\n\nTap below to open your apps dashboard:`,
      keyboard: [
        [{ text: '🚀 Open Web App Launcher', url: currentAppUrl }],
        [{ text: '➕ Add App', url: `${currentAppUrl}?action=add` }]
      ]
    });
  }

  res.json({
    text: `Web App Launcher Commands:\n\n• /start - Launch dashboard\n• /launcher - Quick launch button\n• /help - Show commands`,
    keyboard: [[{ text: '🚀 Launch', url: currentAppUrl }]]
  });
});

// 5. Auth / Validate InitData
app.post('/api/auth/validate-init-data', (req: Request, res: Response) => {
  const { initData } = req.body;

  if (!initData) {
    return res.json({
      valid: false,
      reason: 'No initData provided'
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

// 6. User Apps API
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

// 7. Check Embed Header
app.get('/api/check-embed', async (req: Request, res: Response) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const checkRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const xFrame = checkRes.headers.get('x-frame-options');
    const csp = checkRes.headers.get('content-security-policy');

    let allowsIframe = true;
    let reason = 'Allows iframe embedding';

    if (xFrame) {
      const lower = xFrame.toLowerCase();
      if (lower.includes('deny') || lower.includes('sameorigin')) {
        allowsIframe = false;
        reason = `Blocked by header: X-Frame-Options: ${xFrame}`;
      }
    }

    res.json({
      url: targetUrl,
      allowsIframe,
      reason,
      headers: {
        xFrameOptions: xFrame,
        csp: csp
      }
    });
  } catch (err: any) {
    res.json({
      url: targetUrl,
      allowsIframe: true,
      reason: `Will attempt embed (${err.message})`,
      headers: {}
    });
  }
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

  // If token is already present via environment, start polling or check status
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
