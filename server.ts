import express, { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Minimal JSON parser for Telegram webhook
app.use(express.json({ limit: '32kb' }));

// Health check endpoint (minimal, zero internal server details exposed)
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

/**
 * Telegram Bot Webhook endpoint
 * Handles /start and /launcher commands with bilingual buttons
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
          '👋 *Welcome to Web App Launcher / Bienvenido al Lanzador*\n\n' +
          'Choose your preferred language / Elige tu idioma preferido:\n\n' +
          '🇺🇸 English: Ultra-lightweight launcher with Telegram Cloud storage & PWA.\n' +
          '🇪🇸 Español: Lanzador ultraligero con almacenamiento en Telegram Cloud y PWA.',
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🚀 Open Launcher (EN)',
                web_app: { url: `${appUrl}?lang=en` },
              },
              {
                text: '🚀 Abrir Lanzador (ES)',
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
    // Keep internal error details private
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
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`[Server] Web App Launcher running on port ${PORT}`);
  });
}

startServer();
