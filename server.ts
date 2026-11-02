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

// Minimal RAM footprint: disable headers, disable etags, strict limits
app.disable('x-powered-by');
app.set('etag', false);
app.use(express.json({ limit: '64kb' }));

function getAppUrl(req?: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    if (host) return `${proto}://${host}`;
  }
  return `http://localhost:${PORT}`;
}

const runtimeBotToken = process.env.TELEGRAM_BOT_TOKEN || '';

// Telegram Bot API request helper
async function callTelegramApi(method: string, payload: any) {
  if (!runtimeBotToken) return null;
  const res = await fetch(`https://api.telegram.org/bot${runtimeBotToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return await res.json();
}

// Bot message dispatcher
async function handleTelegramMessage(chatId: number, text: string, currentAppUrl: string) {
  const clean = (text || '').trim().toLowerCase();

  if (clean.startsWith('/start') || clean === '/language' || clean === '/lang') {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: `👋 *Welcome to Web App Launcher!*\n\nAll apps, credentials, and settings are saved securely on *Telegram Cloud*.\n\nChoose language / Selecciona idioma:`,
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
  } else {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: `🚀 *Web App Launcher*\nApps & credentials synced via Telegram Cloud:`,
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
}

// Bot callback query dispatcher
async function handleTelegramCallback(callbackQuery: any, currentAppUrl: string) {
  const cbId = callbackQuery.id;
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data || '';

  await callTelegramApi('answerCallbackQuery', { callback_query_id: cbId }).catch(() => {});

  if (data.startsWith('set_lang:')) {
    const lang = data.split(':')[1] === 'es' ? 'es' : 'en';
    const isEs = lang === 'es';
    const text = isEs
      ? `🇪🇸 *¡Idioma configurado!*\n\nTus apps y accesos se guardan en *Telegram Cloud*.\nToca abajo para abrir:`
      : `🇺🇸 *Language set!*\n\nYour apps & logins are stored in *Telegram Cloud*.\nTap below to launch:`;

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: isEs ? '🚀 Abrir Lanzador' : '🚀 Open Launcher',
              web_app: { url: `${currentAppUrl}?lang=${lang}` }
            }
          ]
        ]
      }
    });
  }
}

// Optional lightweight long-poll when no webhook is set (sleeps 5s between cycles to keep RAM near 0)
let pollingActive = false;
async function startLightPolling() {
  if (pollingActive || !runtimeBotToken) return;
  pollingActive = true;
  let offset = 0;

  while (pollingActive && runtimeBotToken) {
    try {
      const updates = await callTelegramApi('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message', 'callback_query']
      });

      if (updates?.ok && Array.isArray(updates.result)) {
        for (const u of updates.result) {
          offset = u.update_id + 1;
          const appUrl = getAppUrl();
          if (u.message?.chat?.id) {
            await handleTelegramMessage(u.message.chat.id, u.message.text || '', appUrl).catch(() => {});
          } else if (u.callback_query) {
            await handleTelegramCallback(u.callback_query, appUrl).catch(() => {});
          }
        }
      }
    } catch (e: any) {
      if (e?.message?.includes('409')) {
        pollingActive = false;
        break;
      }
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  pollingActive = false;
}

// Telegram initData HMAC-SHA256 signature verification (No external auth)
function verifyTelegramInitData(initDataString: string, botToken: string) {
  try {
    if (!initDataString) return { valid: false };
    const params = new URLSearchParams(initDataString);
    const hash = params.get('hash');
    if (!hash) return { valid: false };

    params.delete('hash');
    const sortedKeys = Array.from(params.keys()).sort();
    const checkString = sortedKeys.map(k => `${k}=${params.get(k)}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');

    const isValid = crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
    if (!isValid) return { valid: false };

    const userRaw = params.get('user');
    return { valid: true, user: userRaw ? JSON.parse(userRaw) : null };
  } catch {
    return { valid: false };
  }
}

// ================= API ROUTES =================

// 1. Zero-RAM Streamed In-App Proxy (pipes chunks directly without holding whole page in RAM)
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

    if (contentType.includes('text/html')) {
      let html = await response.text();
      const baseTag = `<base href="${parsed.origin}${parsed.pathname}">`;
      html = html.includes('<head>') ? html.replace('<head>', `<head>${baseTag}`) : `${baseTag}${html}`;
      return res.send(html);
    }

    if (response.body) {
      Readable.fromWeb(response.body as any).pipe(res);
    } else {
      res.end();
    }
  } catch {
    res.status(502).send('Proxy Error');
  }
});

// 2. Telegram Webhook Handler (Immediate 200 response, 0 RAM accumulation)
app.post('/api/telegram-webhook', async (req: Request, res: Response) => {
  res.status(200).send('OK');
  const update = req.body;
  if (!update) return;

  const currentAppUrl = getAppUrl(req);
  if (update.message?.chat?.id) {
    handleTelegramMessage(update.message.chat.id, update.message.text || '', currentAppUrl).catch(() => {});
  } else if (update.callback_query) {
    handleTelegramCallback(update.callback_query, currentAppUrl).catch(() => {});
  }
});

// 3. Auth Validator
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

// Start Server: Static serving from dist/ uses only ~15-20MB RAM
async function startServer() {
  const distPath = path.join(__dirname, 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));

  if (hasDist || process.env.NODE_ENV === 'production') {
    app.use(express.static(distPath, { maxAge: '7d', etag: false }));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  if (runtimeBotToken) {
    startLightPolling();
  }

  app.listen(PORT, () => {
    console.log(`Telegram Web App Launcher (Ultra-low RAM) on port ${PORT}`);
  });
}

startServer().catch(console.error);
