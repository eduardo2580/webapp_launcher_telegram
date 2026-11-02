// server.ts
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { Readable } from "stream";
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = process.env.PORT || 3e3;
app.disable("x-powered-by");
app.set("etag", false);
app.use(express.json({ limit: "64kb" }));
function getAppUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (req) {
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    if (host) return `${proto}://${host}`;
  }
  return `http://localhost:${PORT}`;
}
var runtimeBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
async function callTelegramApi(method, payload) {
  if (!runtimeBotToken) return null;
  const res = await fetch(`https://api.telegram.org/bot${runtimeBotToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return await res.json();
}
async function handleTelegramMessage(chatId, text, currentAppUrl) {
  const clean = (text || "").trim().toLowerCase();
  if (clean.startsWith("/start") || clean === "/language" || clean === "/lang") {
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: `\u{1F44B} *Welcome to Web App Launcher!*

All apps, credentials, and settings are saved securely on *Telegram Cloud*.

Choose language / Selecciona idioma:`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "\u{1F1FA}\u{1F1F8} English", callback_data: "set_lang:en" },
            { text: "\u{1F1EA}\u{1F1F8} Espa\xF1ol", callback_data: "set_lang:es" }
          ]
        ]
      }
    });
  } else {
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text: `\u{1F680} *Web App Launcher*
Apps & credentials synced via Telegram Cloud:`,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "\u{1F680} Open Launcher",
              web_app: { url: currentAppUrl }
            }
          ]
        ]
      }
    });
  }
}
async function handleTelegramCallback(callbackQuery, currentAppUrl) {
  const cbId = callbackQuery.id;
  const chatId = callbackQuery.message?.chat?.id;
  const data = callbackQuery.data || "";
  await callTelegramApi("answerCallbackQuery", { callback_query_id: cbId }).catch(() => {
  });
  if (data.startsWith("set_lang:")) {
    const lang = data.split(":")[1] === "es" ? "es" : "en";
    const isEs = lang === "es";
    const text = isEs ? `\u{1F1EA}\u{1F1F8} *\xA1Idioma configurado!*

Tus apps y accesos se guardan en *Telegram Cloud*.
Toca abajo para abrir:` : `\u{1F1FA}\u{1F1F8} *Language set!*

Your apps & logins are stored in *Telegram Cloud*.
Tap below to launch:`;
    await callTelegramApi("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: isEs ? "\u{1F680} Abrir Lanzador" : "\u{1F680} Open Launcher",
              web_app: { url: `${currentAppUrl}?lang=${lang}` }
            }
          ]
        ]
      }
    });
  }
}
var pollingActive = false;
async function startLightPolling() {
  if (pollingActive || !runtimeBotToken) return;
  pollingActive = true;
  let offset = 0;
  while (pollingActive && runtimeBotToken) {
    try {
      const updates = await callTelegramApi("getUpdates", {
        offset,
        timeout: 25,
        allowed_updates: ["message", "callback_query"]
      });
      if (updates?.ok && Array.isArray(updates.result)) {
        for (const u of updates.result) {
          offset = u.update_id + 1;
          const appUrl = getAppUrl();
          if (u.message?.chat?.id) {
            await handleTelegramMessage(u.message.chat.id, u.message.text || "", appUrl).catch(() => {
            });
          } else if (u.callback_query) {
            await handleTelegramCallback(u.callback_query, appUrl).catch(() => {
            });
          }
        }
      }
    } catch (e) {
      if (e?.message?.includes("409")) {
        pollingActive = false;
        break;
      }
      await new Promise((r) => setTimeout(r, 5e3));
    }
  }
  pollingActive = false;
}
function verifyTelegramInitData(initDataString, botToken) {
  try {
    if (!initDataString) return { valid: false };
    const params = new URLSearchParams(initDataString);
    const hash = params.get("hash");
    if (!hash) return { valid: false };
    params.delete("hash");
    const sortedKeys = Array.from(params.keys()).sort();
    const checkString = sortedKeys.map((k) => `${k}=${params.get(k)}`).join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");
    const isValid = crypto.timingSafeEqual(Buffer.from(calculatedHash), Buffer.from(hash));
    if (!isValid) return { valid: false };
    const userRaw = params.get("user");
    return { valid: true, user: userRaw ? JSON.parse(userRaw) : null };
  } catch {
    return { valid: false };
  }
}
app.get("/api/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing url");
  try {
    const parsed = new URL(targetUrl);
    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    const contentType = response.headers.get("content-type") || "text/html";
    res.removeHeader("X-Frame-Options");
    res.removeHeader("Content-Security-Policy");
    res.setHeader("Content-Type", contentType);
    if (contentType.includes("text/html")) {
      let html = await response.text();
      const baseTag = `<base href="${parsed.origin}${parsed.pathname}">`;
      html = html.includes("<head>") ? html.replace("<head>", `<head>${baseTag}`) : `${baseTag}${html}`;
      return res.send(html);
    }
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch {
    res.status(502).send("Proxy Error");
  }
});
app.post("/api/telegram-webhook", async (req, res) => {
  res.status(200).send("OK");
  const update = req.body;
  if (!update) return;
  const currentAppUrl = getAppUrl(req);
  if (update.message?.chat?.id) {
    handleTelegramMessage(update.message.chat.id, update.message.text || "", currentAppUrl).catch(() => {
    });
  } else if (update.callback_query) {
    handleTelegramCallback(update.callback_query, currentAppUrl).catch(() => {
    });
  }
});
app.post("/api/auth/validate-init-data", (req, res) => {
  const { initData } = req.body;
  if (!initData) return res.json({ valid: false });
  if (!runtimeBotToken) {
    try {
      const params = new URLSearchParams(initData);
      const userRaw = params.get("user");
      return res.json({ valid: true, user: userRaw ? JSON.parse(userRaw) : null });
    } catch {
      return res.json({ valid: false });
    }
  }
  res.json(verifyTelegramInitData(initData, runtimeBotToken));
});
async function startServer() {
  const distPath = path.join(__dirname, "dist");
  const hasDist = fs.existsSync(path.join(distPath, "index.html"));
  if (hasDist || process.env.NODE_ENV === "production") {
    app.use(express.static(distPath, { maxAge: "7d", etag: false }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
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
