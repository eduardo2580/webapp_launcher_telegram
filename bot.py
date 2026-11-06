#!/usr/bin/env python3
"""
Telegram Bot Backend powered by Google Gemini API.
Pure headless server-side script running entirely in the terminal.
No web UI, HTML, CSS, JavaScript, or React components.
"""

import os
import sys
import time
import json
import logging
import threading
from typing import Dict, List, Any, Optional
import urllib.request
import urllib.parse
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

# Configure terminal logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("telegram_gemini_bot")

# ---------------------------------------------------------------------------
# Environment Variable Loading
# ---------------------------------------------------------------------------

def load_env_file(filepath: str = ".env") -> None:
    """Manually parse .env file if python-dotenv is not installed."""
    if not os.path.exists(filepath):
        return
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip("\"'").strip()
                if key and key not in os.environ:
                    os.environ[key] = val
    except Exception as e:
        logger.warning(f"Could not read .env file: {e}")

# Attempt to load using python-dotenv, fallback to manual parser
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    load_env_file()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
PORT = int(os.getenv("PORT", "3000"))

# Default System Instruction
DEFAULT_SYSTEM_INSTRUCTION = (
    "You are an intelligent, helpful, and concise AI assistant communicating with users "
    "via Telegram messages. Your replies must be well-structured and direct. "
    "Use Telegram-compatible formatting when appropriate: bold with *text*, italic with _text_, "
    "inline code with `code`, and code blocks with ```language\\ncode\\n```. "
    "Do not use raw HTML tags. Keep responses mobile-friendly."
)

SYSTEM_INSTRUCTION = os.getenv("GEMINI_SYSTEM_INSTRUCTION", DEFAULT_SYSTEM_INSTRUCTION)

# Per-chat conversation history: {chat_id: [{"role": "user"|"model", "text": "..."}]}
chat_histories: Dict[int, List[Dict[str, str]]] = {}
MAX_HISTORY_TURNS = 10
bot_start_time = time.time()
total_messages_processed = 0

# ---------------------------------------------------------------------------
# Google Gemini API Client
# ---------------------------------------------------------------------------

def get_gemini_api_key() -> str:
    """Dynamically resolves GEMINI_API_KEY from env or .env file."""
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key and os.path.exists(".env"):
        load_env_file(".env")
        key = os.getenv("GEMINI_API_KEY", "").strip()
    return key


def _handle_offline_response(prompt: str) -> str:
    """Friendly fallback when GEMINI_API_KEY is not yet configured."""
    p = prompt.strip().lower()

    # Math calculator fallback
    math_chars = set("0123456789+-*/(). %")
    if set(p).issubset(math_chars) and any(op in p for op in "+-*/") and len(p) >= 3:
        try:
            result = eval(p, {"__builtins__": None}, {})
            return f"🔢 *Resultado:* `{p} = {result}`"
        except Exception:
            pass

    if p in ("oi", "olá", "ola", "hello", "hi", "hey", "bom dia", "boa tarde", "boa noite"):
        return (
            "👋 Olá! Estou online e funcionando como seu bot no Telegram!\n\n"
            "Posso responder a comandos como `/help`, `/status` e `/ping`.\n\n"
            "💡 *Como ativar a inteligência artificial do Gemini:*\n"
            "Você não precisa de cartão de crédito. Obtenha uma chave gratuita em: "
            "[aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) "
            "ou configure no painel *Settings > Secrets*."
        )

    return (
        f"📩 *Mensagem recebida:* \"{prompt}\"\n\n"
        "O bot está ativo no Telegram, mas a chave `GEMINI_API_KEY` ainda não foi configurada.\n\n"
        "🔑 *Como obter sua chave gratuita do Gemini (100% gratuita):*\n"
        "1. Acesse: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)\n"
        "2. Clique no botão *'Create API Key'*\n"
        "3. Adicione `GEMINI_API_KEY=sua_chave` no seu arquivo `.env` ou configure no painel *Settings > Secrets*\n\n"
        "Assim que a chave for adicionada, eu passarei a responder utilizando o modelo `gemini-3.8-flash`!"
    )


def call_gemini(user_prompt: str, chat_id: Optional[int] = None) -> str:
    """
    Sends user_prompt to Google Gemini API (gemini-3.8-flash) with system instructions
    and returns the generated response. Supports multi-turn context.
    """
    api_key = get_gemini_api_key()
    if not api_key:
        return _handle_offline_response(user_prompt)

    # 1. Try official google-genai SDK if installed
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(
            api_key=api_key,
            http_options={"headers": {"User-Agent": "aistudio-build"}},
        )

        # Build contents from history
        contents: List[Any] = []
        if chat_id and chat_id in chat_histories:
            for turn in chat_histories[chat_id]:
                role = "user" if turn["role"] == "user" else "model"
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=turn["text"])]))

        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_prompt)]))

        config = types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
        )

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=config,
        )

        answer = response.text or "Desculpe, não consegui gerar uma resposta."
        return answer.strip()

    except ImportError:
        # 2. Direct HTTP REST call to Gemini API using Python standard library
        return _call_gemini_rest(user_prompt, chat_id)
    except Exception as e:
        logger.error(f"Gemini SDK call failed: {e}. Falling back to REST API.")
        return _call_gemini_rest(user_prompt, chat_id)


def _call_gemini_rest(user_prompt: str, chat_id: Optional[int] = None) -> str:
    """Fallback REST API call using urllib.request."""
    api_key = get_gemini_api_key()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"

    # Build contents array
    contents: List[Dict[str, Any]] = []
    if chat_id and chat_id in chat_histories:
        for turn in chat_histories[chat_id]:
            role = "user" if turn["role"] == "user" else "model"
            contents.append({"role": role, "parts": [{"text": turn["text"]}]})

    contents.append({"role": "user", "parts": [{"text": user_prompt}]})

    payload = {
        "systemInstruction": {
            "parts": [{"text": SYSTEM_INSTRUCTION}]
        },
        "contents": contents,
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "User-Agent": "aistudio-build",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            candidates = res_data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "").strip()
            return "Não foi possível obter uma resposta do modelo Gemini."
    except urllib.error.HTTPError as err:
        error_body = err.read().decode("utf-8", errors="replace")
        logger.error(f"Gemini API HTTPError {err.code}: {error_body}")
        if err.code == 400:
            return f"❌ *Erro de requisição Gemini (400)*:\nVerifique os parâmetros ou o modelo `{GEMINI_MODEL}`."
        if err.code == 403:
            return "❌ *Erro de Autenticação*: A chave `GEMINI_API_KEY` é inválida ou não tem permissão."
        if err.code == 429:
            return "⏳ *Limite de Requisições*: Cota do Gemini excedida. Aguarde alguns instantes."
        return f"❌ *Erro na API Gemini*: HTTP {err.code}"
    except Exception as err:
        logger.error(f"Gemini API Exception: {err}")
        return f"❌ *Erro de Conexão*: Não foi possível contatar a API do Gemini ({err})."

# ---------------------------------------------------------------------------
# Telegram Bot API Client
# ---------------------------------------------------------------------------

def call_telegram_api(method: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Makes a request to the Telegram Bot API."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning(f"TELEGRAM_BOT_TOKEN not configured. Skipping API call: {method}")
        return None

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=35) as response:
            res_json = json.loads(response.read().decode("utf-8"))
            if not res_json.get("ok"):
                logger.warning(f"Telegram API {method} returned error: {res_json.get('description')}")
            return res_json
    except urllib.error.HTTPError as e:
        error_text = e.read().decode("utf-8", errors="replace")
        logger.warning(f"Telegram API HTTP error {e.code} for {method}: {error_text}")
        return None
    except Exception as e:
        logger.warning(f"Telegram API connection error for {method}: {e}")
        return None


def send_chat_action(chat_id: int, action: str = "typing") -> None:
    """Sends a chat action such as 'typing'."""
    call_telegram_api("sendChatAction", {"chat_id": chat_id, "action": action})


def send_telegram_message(chat_id: int, text: str, reply_to_message_id: Optional[int] = None) -> None:
    """Sends text to a Telegram chat, handling 4096-char split and Markdown fallbacks."""
    # Telegram max message length is 4096 characters
    CHUNK_SIZE = 4000
    chunks = [text[i : i + CHUNK_SIZE] for i in range(0, len(text), CHUNK_SIZE)]

    for chunk in chunks:
        # First attempt with Markdown parse mode
        payload = {
            "chat_id": chat_id,
            "text": chunk,
            "parse_mode": "Markdown",
        }
        if reply_to_message_id:
            payload["reply_to_message_id"] = reply_to_message_id

        res = call_telegram_api("sendMessage", payload)
        # If Telegram rejected Markdown (e.g. unclosed asterisk), retry without parse_mode
        if not res or not res.get("ok"):
            payload.pop("parse_mode", None)
            call_telegram_api("sendMessage", payload)

# ---------------------------------------------------------------------------
# Message Handler
# ---------------------------------------------------------------------------

def handle_update(update: Dict[str, Any]) -> None:
    """Processes an incoming Telegram update."""
    global total_messages_processed

    message = update.get("message")
    if not message:
        return

    chat = message.get("chat", {})
    chat_id = chat.get("id")
    if not chat_id:
        return

    from_user = message.get("from", {})
    user_name = from_user.get("first_name") or from_user.get("username") or "Usuário"
    text = (message.get("text") or "").strip()
    msg_id = message.get("message_id")

    if not text:
        return

    total_messages_processed += 1
    logger.info(f"Received message from @{user_name} (chat_id: {chat_id}): {text[:60]!r}")

    # Handle built-in bot commands
    command = text.split()[0].lower() if text.startswith("/") else ""

    if command in ("/start", "/iniciar"):
        welcome_text = (
            f"👋 Olá, *{user_name}*!\n\n"
            f"Eu sou um bot conectado diretamente à *API do Google Gemini* (`{GEMINI_MODEL}`).\n\n"
            "💬 *Como usar:*\n"
            "Basta me enviar qualquer pergunta ou mensagem aqui no chat! Eu respondo utilizando inteligência artificial diretamente no Telegram.\n\n"
            "📌 *Comandos disponíveis:*\n"
            "• `/help` — Ajuda e instruções\n"
            "• `/clear` — Limpar o histórico da conversa\n"
            "• `/status` — Informações do servidor e modelo\n"
            "• `/ping` — Verificar latência e conexão"
        )
        send_telegram_message(chat_id, welcome_text, reply_to_message_id=msg_id)
        return

    if command in ("/help", "/ajuda"):
        help_text = (
            "🤖 *Manual do Bot Telegram + Gemini*\n\n"
            "• *Conversa Contínua*: O bot lembra das últimas mensagens para manter o contexto.\n"
            "• *Perguntas e Respostas*: Faça perguntas, peça códigos, traduções ou explicações.\n"
            "• *Formatação*: As respostas são formatadas em negrito, itálico e blocos de código.\n\n"
            "🛠 *Comandos:*\n"
            "`/clear` — Limpa o contexto da conversa atual\n"
            "`/status` — Mostra o status do servidor backend\n"
            "`/ping` — Testa a resposta rápida"
        )
        send_telegram_message(chat_id, help_text, reply_to_message_id=msg_id)
        return

    if command in ("/clear", "/limpar", "/reset"):
        chat_histories.pop(chat_id, None)
        send_telegram_message(chat_id, "🧹 *Histórico de conversa limpo com sucesso!* Nova sessão iniciada.")
        return

    if command in ("/ping",):
        send_telegram_message(chat_id, "🏓 *Pong!* Bot ativo e conectado ao servidor.")
        return

    if command in ("/status",):
        uptime_sec = int(time.time() - bot_start_time)
        hours, remainder = divmod(uptime_sec, 3600)
        minutes, seconds = divmod(remainder, 60)
        uptime_str = f"{hours}h {minutes}m {seconds}s"
        history_len = len(chat_histories.get(chat_id, []))

        status_text = (
            "📊 *Status do Backend Headless*\n\n"
            f"• *Modelo Gemini:* `{GEMINI_MODEL}`\n"
            f"• *API Key configurada:* `{'Sim' if bool(GEMINI_API_KEY) else 'Não'}`\n"
            f"• *Uptime:* `{uptime_str}`\n"
            f"• *Mensagens processadas:* `{total_messages_processed}`\n"
            f"• *Mensagens em memória neste chat:* `{history_len}`\n"
            f"• *Porta de Diagnóstico:* `{PORT}`"
        )
        send_telegram_message(chat_id, status_text, reply_to_message_id=msg_id)
        return

    # User sent standard text -> Send typing action and forward to Gemini
    send_chat_action(chat_id, "typing")

    t_start = time.time()
    ai_response = call_gemini(text, chat_id=chat_id)
    duration = time.time() - t_start
    logger.info(f"Gemini replied for chat {chat_id} in {duration:.2f}s")

    # Update conversation history
    if chat_id not in chat_histories:
        chat_histories[chat_id] = []
    chat_histories[chat_id].append({"role": "user", "text": text})
    chat_histories[chat_id].append({"role": "model", "text": ai_response})

    # Limit history to prevent excessive context size
    if len(chat_histories[chat_id]) > MAX_HISTORY_TURNS * 2:
        chat_histories[chat_id] = chat_histories[chat_id][-MAX_HISTORY_TURNS * 2 :]

    # Reply directly to Telegram chat
    send_telegram_message(chat_id, ai_response, reply_to_message_id=msg_id)

# ---------------------------------------------------------------------------
# Telegram Long-Polling Loop
# ---------------------------------------------------------------------------

def run_telegram_polling() -> None:
    """Continuously polls Telegram for updates."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("=" * 60)
        logger.warning("TELEGRAM_BOT_TOKEN is not set.")
        logger.warning("Add TELEGRAM_BOT_TOKEN to your environment or .env file.")
        logger.warning("=" * 60)

    # Verify bot identity with getMe
    if TELEGRAM_BOT_TOKEN:
        try:
            me_res = call_telegram_api("getMe", {})
            if me_res and me_res.get("ok"):
                bot_user = me_res.get("result", {}).get("username", "Bot")
                logger.info(f"Successfully authenticated as @{bot_user} on Telegram!")
            else:
                logger.warning(f"getMe check failed. Check your TELEGRAM_BOT_TOKEN.")
        except Exception as e:
            logger.warning(f"Could not verify getMe: {e}")

    offset = 0
    logger.info("Telegram polling daemon started. Listening for incoming messages...")

    while True:
        if not TELEGRAM_BOT_TOKEN:
            time.sleep(5)
            continue

        try:
            payload = {
                "offset": offset,
                "timeout": 20,
                "allowed_updates": ["message"],
            }
            res = call_telegram_api("getUpdates", payload)
            if res and res.get("ok"):
                updates = res.get("result", [])
                for upd in updates:
                    offset = max(offset, upd.get("update_id", 0) + 1)
                    try:
                        handle_update(upd)
                    except Exception as err:
                        logger.error(f"Error handling update: {err}", exc_info=True)
            time.sleep(0.5)
        except Exception as e:
            logger.warning(f"Polling loop exception: {e}. Retrying in 3s...")
            time.sleep(3)

# ---------------------------------------------------------------------------
# Headless Diagnostic Server (Port 3000)
# ---------------------------------------------------------------------------

class HeadlessStatusHandler(BaseHTTPRequestHandler):
    """Minimal text/json diagnostic responder to satisfy container health checks."""

    def do_GET(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        status_data = {
            "status": "ok",
            "service": "telegram-gemini-bot",
            "mode": "headless_server",
            "engine": GEMINI_MODEL,
            "telegram_configured": bool(TELEGRAM_BOT_TOKEN),
            "gemini_configured": bool(GEMINI_API_KEY),
            "messages_processed": total_messages_processed,
            "uptime_seconds": int(time.time() - bot_start_time),
        }
        self.wfile.write(json.dumps(status_data, indent=2).encode("utf-8"))

    def log_message(self, format: str, *args: Any) -> None:
        # Suppress routine HTTP access logs to keep terminal clean
        pass


def run_diagnostic_server(port: int = 3000) -> None:
    """Runs a minimal background HTTP health check on port 3000."""
    try:
        server = HTTPServer(("0.0.0.0", port), HeadlessStatusHandler)
        logger.info(f"Headless diagnostic health check active on port {port}")
        server.serve_forever()
    except Exception as e:
        logger.warning(f"Diagnostic server could not bind to port {port}: {e}")

# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------

def main() -> None:
    logger.info("=" * 60)
    logger.info("  TELEGRAM BOT + GOOGLE GEMINI BACKEND (HEADLESS)")
    logger.info(f"  Model: {GEMINI_MODEL}")
    logger.info(f"  Telegram Token: {'Configured' if TELEGRAM_BOT_TOKEN else 'MISSING'}")
    logger.info(f"  Gemini API Key: {'Configured' if GEMINI_API_KEY else 'MISSING'}")
    logger.info("=" * 60)

    # Start health check server in background thread (binds port 3000)
    health_thread = threading.Thread(target=run_diagnostic_server, args=(PORT,), daemon=True)
    health_thread.start()

    # Start Telegram long-polling loop in main thread
    run_telegram_polling()


if __name__ == "__main__":
    main()
