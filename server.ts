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

// In-memory runtime bot token with env fallback
let runtimeBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
let cachedBotInfo: { id?: number; username?: string; first_name?: string } | null = null;

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

// Verify Telegram initData via HMAC-SHA256
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
      webhookUrl: `${currentAppUrl}/api/telegram-webhook`
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

    // 2. Auto setup Menu Button if requested
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

    // 3. Auto setup Webhook if requested
    if (autoSetupWebhook !== false && currentAppUrl.startsWith('https://')) {
      try {
        const webhookUrl = `${currentAppUrl}/api/telegram-webhook`;
        const hookRes = await callTelegramApi('setWebhook', {
          url: webhookUrl,
          allowed_updates: ['message', 'callback_query']
        }, cleanToken);
        setupResults.webhook = hookRes;
      } catch (e: any) {
        setupResults.webhookError = e.message;
      }
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

// 3. Telegram Webhook Handler (receives /start, /launcher, etc.)
app.post('/api/telegram-webhook', async (req: Request, res: Response) => {
  // Always answer 200 immediately to Telegram
  res.status(200).send('OK');

  const update = req.body;
  if (!update || !update.message) return;

  const msg = update.message;
  const chatId = msg.chat?.id;
  const text = (msg.text || '').trim();
  const currentAppUrl = getAppUrl(req);

  if (!chatId || !text) return;

  try {
    if (text.startsWith('/start') || text.startsWith('/launcher')) {
      const firstName = msg.from?.first_name || 'there';
      const welcomeMessage = 
        `👋 *Hello, ${firstName}!* Welcome to the *Telegram Mini App Web Launcher*.\n\n` +
        `Launch and switch between your favorite web applications directly within Telegram:\n` +
        `• 📱 *Integrated Iframe Viewer* with Home & Navigation controls\n` +
        `• 🌐 *Default Presets:* Facebook, Instagram, LinkedIn, Wikipedia, and more\n` +
        `• ⚡ *Custom App Manager:* Add any website link with auto-icon discovery\n` +
        `• 🛡️ *Smart Fallback:* External launch toggle for X-Frame-Options protected sites\n\n` +
        `Tap the button below to launch the dashboard!`;

      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: welcomeMessage,
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
                text: '⚙️ Add Custom App',
                web_app: { url: `${currentAppUrl}?action=add` }
              },
              {
                text: 'ℹ️ About & Help',
                callback_data: 'help_info'
              }
            ]
          ]
        }
      });
    } else if (text.startsWith('/help')) {
      const helpMessage = 
        `📖 *Web App Launcher Help*\n\n` +
        `*Commands:*\n` +
        `• /start - Open launcher menu\n` +
        `• /launcher - Quick launch button\n` +
        `• /help - Display this guide\n\n` +
        `*Features:*\n` +
        `• You can configure the permanent Menu Button on the bottom-left of the chat via @BotFather with /setmenubutton.`;

      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: helpMessage,
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
    }
  } catch (err) {
    console.error('Webhook execution error:', err);
  }
});

// 4. Test Bot Command endpoint (Allows browser testing & simulation)
app.post('/api/bot/test-command', async (req: Request, res: Response) => {
  const { command, user } = req.body;
  const currentAppUrl = getAppUrl(req);
  const name = user?.first_name || 'Guest Explorer';

  if (command === '/start' || command === '/launcher') {
    return res.json({
      text: `👋 Hello, ${name}! Welcome to the Telegram Mini App Web Launcher.\n\nReady to explore your web apps!`,
      keyboard: [
        [{ text: '🚀 Open Web App Launcher', url: currentAppUrl }],
        [{ text: '⚙️ Add Custom App', url: `${currentAppUrl}?action=add` }]
      ]
    });
  }

  res.json({
    text: `Command ${command} recognized. Use /start or /launcher to view the menu.`,
    keyboard: [[{ text: '🚀 Launch', url: currentAppUrl }]]
  });
});

// 5. Auth / Validate InitData
app.post('/api/auth/validate-init-data', (req: Request, res: Response) => {
  const { initData } = req.body;

  if (!initData) {
    return res.json({
      valid: false,
      reason: 'No initData provided (standard browser preview mode)'
    });
  }

  if (!runtimeBotToken) {
    // If no token is configured, parse unsafe payload gracefully for demo preview
    try {
      const params = new URLSearchParams(initData);
      const userRaw = params.get('user');
      const user = userRaw ? JSON.parse(userRaw) : null;
      return res.json({
        valid: true,
        isDevFallback: true,
        user,
        message: 'Validated in dev mode (Configure BOT_TOKEN to enforce cryptographic HMAC-SHA256 verification)'
      });
    } catch {
      return res.json({ valid: false, reason: 'Failed to parse initData' });
    }
  }

  const result = verifyTelegramInitData(initData, runtimeBotToken);
  res.json(result);
});

// 6. User Apps API (Persistence synced by Telegram User ID)
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

// 7. Check Embed Header (inspects X-Frame-Options and Content-Security-Policy)
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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

    if (csp && csp.toLowerCase().includes('frame-ancestors')) {
      const match = csp.match(/frame-ancestors\s+([^;]+)/i);
      const directive = match ? match[1].trim() : 'strict';
      if (!directive.includes('*')) {
        allowsIframe = false;
        reason = `Blocked by Content-Security-Policy: frame-ancestors ${directive}`;
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
      allowsIframe: true, // Optimistically allow or fallback on client
      reason: `Could not reach target directly (${err.message}). Will attempt embed.`,
      headers: {}
    });
  }
});

// Setup dev server with Vite or static production serving
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

  app.listen(PORT, () => {
    console.log(`Telegram Web App Launcher server running on port ${PORT}`);
    console.log(`App URL: ${getAppUrl()}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
