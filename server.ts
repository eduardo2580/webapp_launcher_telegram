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
    id: 'telegram',
    title: 'Telegram Web',
    url: 'https://web.telegram.org/a/',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/telegram.png',
    category: 'Social',
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

let serverSyncedApps = [...CORE_APPS];

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
 * Telegram Bot Webhook endpoint
 * Handles /start and /launcher commands with multilingual buttons
 */
app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
  const update = req.body;
  res.status(200).send('OK');

  if (!BOT_TOKEN || !update?.message) return;

  const chatId = update.message.chat?.id;
  const text = (update.message.text || '').trim();
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const appUrl = process.env.APP_URL || `${protocol}://${host}`;

  try {
    if (text === '/start') {
      const payload = {
        chat_id: chatId,
        text:
          '👋 *Welcome to Web App Launcher / Bem-vindo / Bienvenido*\n\n' +
          'Choose your preferred language / Escolha seu idioma:\n\n' +
          '🇺🇸 English: Ultra-lightweight launcher with Telegram Cloud storage & PWA.\n' +
          '🇧🇷 Português: Lanzador ultraleve com Telegram Cloud e PWA.\n' +
          '🇪🇸 Español: Lanzador ultraligero con almacenamiento en Telegram Cloud y PWA.',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Launcher (EN)',
                web_app: { url: `${appUrl}?lang=en` },
              },
              {
                text: '🚀 Lanzador (PT)',
                web_app: { url: `${appUrl}?lang=pt` },
              },
              {
                text: '🚀 Lanzador (ES)',
                web_app: { url: `${appUrl}?lang=es` },
              },
            ],
          ],
        },
      };

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } else if (text === '/launcher') {
      const payload = {
        chat_id: chatId,
        text: '⚡ *Open Web App Launcher*',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Open Web App Launcher',
                web_app: { url: appUrl },
              },
            ],
          ],
        },
      };

      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
  } catch (err) {
    console.warn('Telegram webhook warning');
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
    
    // Explicit headers for Service Worker
    app.use('/sw.js', (_req, res, next) => {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache');
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
