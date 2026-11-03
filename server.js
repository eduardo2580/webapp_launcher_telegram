// server.ts
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = Number(process.env.PORT) || 3e3;
var isProd = process.env.NODE_ENV === "production";
var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  next();
});
app.use(express.json({ limit: "32kb" }));
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: Date.now(),
    env: isProd ? "production" : "development"
  });
});
app.get("/api/network-info", (req, res) => {
  const host = req.get("host") || `localhost:${PORT}`;
  const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  res.status(200).json({
    status: "ok",
    serverPort: PORT,
    detectedHost: host,
    protocol,
    mobileTips: {
      androidEmulatorHost: `http://10.0.2.2:${PORT}`,
      genymotionHost: `http://10.0.3.2:${PORT}`,
      iosSimulatorHost: `http://127.0.0.1:${PORT}`,
      bindAddress: "0.0.0.0 (all network interfaces)",
      cleartextNote: 'Requires android:usesCleartextTraffic="true" on Android 9+ for HTTP',
      serviceWorkerRequirement: "Service Workers require HTTPS or localhost/127.0.0.1/10.0.2.2"
    }
  });
});
var CORE_APPS = [
  {
    id: "facebook",
    title: "Facebook",
    url: "https://m.facebook.com",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/facebook.png",
    category: "Social",
    isCustom: false
  },
  {
    id: "instagram",
    title: "Instagram",
    url: "https://www.instagram.com",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/instagram.png",
    category: "Social",
    isCustom: false
  },
  {
    id: "linkedin",
    title: "LinkedIn",
    url: "https://www.linkedin.com",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/linkedin.png",
    category: "Social",
    isCustom: false
  },
  {
    id: "wikipedia",
    title: "Wikipedia",
    url: "https://m.wikipedia.org",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wikipedia.png",
    category: "Tools",
    isCustom: false
  },
  {
    id: "youtube",
    title: "YouTube",
    url: "https://www.youtube.com",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/youtube.png",
    category: "Media",
    isCustom: false
  },
  {
    id: "x",
    title: "X / Twitter",
    url: "https://mobile.x.com",
    icon: "https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/x.png",
    category: "Social",
    isCustom: false
  }
];
var serverSyncedApps = [...CORE_APPS];
app.get("/api/apps", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
  res.status(200).json({
    status: "ok",
    version: "1.2.0",
    syncedAt: Date.now(),
    source: "server",
    apps: serverSyncedApps
  });
});
app.post("/api/apps/sync", (req, res) => {
  const { apps, clientTimestamp } = req.body || {};
  if (Array.isArray(apps) && apps.length > 0) {
    serverSyncedApps = apps;
  }
  res.status(200).json({
    status: "ok",
    syncedAt: Date.now(),
    clientTimestamp: clientTimestamp || null,
    count: serverSyncedApps.length
  });
});
app.post("/api/telegram/webhook", async (req, res) => {
  const update = req.body;
  res.status(200).send("OK");
  if (!BOT_TOKEN || !update?.message) return;
  const chatId = update.message.chat?.id;
  const text = (update.message.text || "").trim();
  const host = req.get("host") || "localhost:3000";
  const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
  const appUrl = process.env.APP_URL || `${protocol}://${host}`;
  try {
    if (text === "/start") {
      const payload = {
        chat_id: chatId,
        text: "\u{1F44B} *Welcome! / Bem-vindo! / \xA1Bienvenido!*\n\n*How to open the app / Como abrir o aplicativo / C\xF3mo abrir la aplicaci\xF3n:*\n1. Choose your language below.\n2. Tap the button to open the app inside Telegram.\n3. Add your favorite websites using the + button.\n\n1. Escolha seu idioma abaixo.\n2. Toque no bot\xE3o para abrir o aplicativo no Telegram.\n3. Adicione seus sites favoritos pelo bot\xE3o +.\n\n1. Elige tu idioma abajo.\n2. Pulsa el bot\xF3n para abrir la aplicaci\xF3n en Telegram.\n3. A\xF1ade tus sitios favoritos con el bot\xF3n +.",
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "\u{1F680} Launcher (EN)",
                web_app: { url: `${appUrl}?lang=en` }
              },
              {
                text: "\u{1F680} Lanzador (PT)",
                web_app: { url: `${appUrl}?lang=pt` }
              },
              {
                text: "\u{1F680} Lanzador (ES)",
                web_app: { url: `${appUrl}?lang=es` }
              }
            ]
          ]
        }
      };
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else if (text === "/launcher") {
      const payload = {
        chat_id: chatId,
        text: "\u26A1 *Open Web App Launcher*",
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "\u{1F680} Open Web App Launcher",
                web_app: { url: appUrl }
              }
            ]
          ]
        }
      };
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }
  } catch (err) {
    console.warn("Telegram webhook warning");
  }
});
async function startServer() {
  if (!isProd) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use("/sw.js", (_req, res, next) => {
      res.setHeader("Service-Worker-Allowed", "/");
      res.setHeader("Cache-Control", "no-cache");
      next();
    });
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Web App Launcher running on http://0.0.0.0:${PORT}`);
  });
}
startServer();
