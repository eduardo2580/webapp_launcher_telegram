// server.ts
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = process.env.PORT || 3e3;
var isProd = process.env.NODE_ENV === "production";
var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
app.use(express.json({ limit: "32kb" }));
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
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
        text: "\u{1F44B} *Welcome to Web App Launcher / Bienvenido al Lanzador*\n\nChoose your preferred language / Elige tu idioma preferido:\n\n\u{1F1FA}\u{1F1F8} English: Ultra-lightweight launcher with Telegram Cloud storage & PWA.\n\u{1F1EA}\u{1F1F8} Espa\xF1ol: Lanzador ultraligero con almacenamiento en Telegram Cloud y PWA.",
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "\u{1F680} Open Launcher (EN)",
                web_app: { url: `${appUrl}?lang=en` }
              },
              {
                text: "\u{1F680} Abrir Lanzador (ES)",
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
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }
  app.listen(PORT, () => {
    console.log(`[Server] Web App Launcher running on port ${PORT}`);
  });
}
startServer();
