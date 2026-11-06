#!/usr/bin/env python3
"""Headless Telegram launcher and Gemini assistant; all interaction stays in Telegram."""

import hmac
import json
import logging
import os
import re
import secrets
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List, Optional


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("telegram_launcher")


def load_env_file(filepath: str = ".env") -> None:
    """Load optional environment variables without overriding the process environment."""
    try:
        with open(filepath, "r", encoding="utf-8") as env_file:
            for line in env_file:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip("\"'").strip()
                if key and key not in os.environ:
                    os.environ[key] = value
    except FileNotFoundError:
        return
    except OSError as error:
        logger.warning("Could not read .env file: %s", error)


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


load_env_file()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
ALLOW_SHARED_GEMINI_KEY = env_bool("ALLOW_SHARED_GEMINI_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
if not re.fullmatch(r"[A-Za-z0-9._-]+", GEMINI_MODEL):
    raise ValueError("GEMINI_MODEL may contain only letters, numbers, dots, underscores, and hyphens.")

try:
    PORT = int(os.getenv("PORT", "3000"))
except ValueError as error:
    raise ValueError("PORT must be an integer.") from error
if not 1 <= PORT <= 65535:
    raise ValueError("PORT must be between 1 and 65535.")

DATA_FILE = os.getenv("DATA_FILE", "bot_data.json")
WEBHOOK_PATH = "/api/telegram/webhook"
MAX_WEBHOOK_BODY_BYTES = 1024 * 1024
MAX_PROMPT_LENGTH = 6000
MAX_HISTORY_TURNS = 6
MAX_CUSTOM_APPS = 40
PAGE_SIZE = 6


def get_webhook_url() -> Optional[str]:
    """Use a public HTTPS URL for webhooks when one is configured."""
    public_url = (
        os.getenv("APP_URL", "").strip()
        or os.getenv("RAILWAY_PUBLIC_DOMAIN", "").strip()
    )
    if not public_url:
        return None
    if "://" not in public_url:
        public_url = f"https://{public_url}"
    parsed = urllib.parse.urlsplit(public_url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("APP_URL and RAILWAY_PUBLIC_DOMAIN must be valid public HTTPS URLs.")
    try:
        parsed.port
    except ValueError as error:
        raise ValueError("APP_URL and RAILWAY_PUBLIC_DOMAIN must use a valid port.") from error
    return urllib.parse.urlunsplit(("https", parsed.netloc, WEBHOOK_PATH, "", ""))


TELEGRAM_WEBHOOK_URL = get_webhook_url()
TELEGRAM_WEBHOOK_SECRET = (
    os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip() or secrets.token_urlsafe(32)
)
if not 1 <= len(TELEGRAM_WEBHOOK_SECRET) <= 256 or not re.fullmatch(
    r"[A-Za-z0-9_-]+", TELEGRAM_WEBHOOK_SECRET
):
    raise ValueError("TELEGRAM_WEBHOOK_SECRET must be 1-256 letters, numbers, underscores, or hyphens.")

DEFAULT_SYSTEM_INSTRUCTION = (
    "You are a helpful, concise assistant in a Telegram chat. "
    "Answer clearly and keep replies mobile-friendly."
)
SYSTEM_INSTRUCTION = os.getenv("GEMINI_SYSTEM_INSTRUCTION", DEFAULT_SYSTEM_INSTRUCTION).strip()
if not SYSTEM_INSTRUCTION:
    SYSTEM_INSTRUCTION = DEFAULT_SYSTEM_INSTRUCTION


DEFAULT_APPS = [
    {"name": "WhatsApp", "url": "https://web.whatsapp.com", "category": "social"},
    {"name": "Instagram", "url": "https://www.instagram.com", "category": "social"},
    {"name": "Telegram", "url": "https://web.telegram.org", "category": "social"},
    {"name": "YouTube", "url": "https://www.youtube.com", "category": "media"},
    {"name": "Spotify", "url": "https://open.spotify.com", "category": "media"},
    {"name": "Canva", "url": "https://www.canva.com", "category": "tools"},
    {"name": "Google Drive", "url": "https://drive.google.com", "category": "tools"},
]
CATEGORIES = ("all", "social", "tools", "media")
LANGUAGES = ("pt", "en", "es")

TEXTS = {
    "pt": {
        "welcome": "👋 Olá! Escolha uma categoria ou abra um aplicativo.",
        "menu": "🚀 Seus aplicativos",
        "count": "{count} aplicativo(s)",
        "empty": "Nenhum aplicativo nesta categoria.",
        "all": "📱 Todos",
        "social": "💬 Social",
        "tools": "🧰 Ferramentas",
        "media": "🎬 Mídia",
        "add": "➕ Adicionar app",
        "search": "🔎 Buscar",
        "language": "🌐 Idioma",
        "help": "❔ Ajuda",
        "gemini": "🧠 Chave Gemini",
        "set_key": "🔑 Configurar chave",
        "remove": "🗑 Remover app",
        "open": "🔗 {name}",
        "previous": "⬅️ Anterior",
        "next": "Próxima ➡️",
        "home": "🏠 Início",
        "add_prompt": "Envie: Nome | https://endereco.com | Social, Tools ou Media.\nExemplo: Meu app | https://example.com | Tools\nEnvie /cancelar para sair.",
        "search_prompt": "Digite o nome ou endereço para buscar. Envie /cancelar para sair.",
        "key_prompt": "Envie sua chave da API Gemini nesta conversa privada. Ela fica apenas na memória do processo, não é gravada em disco, e a mensagem será apagada se o Telegram permitir. Envie /cancelar para sair.",
        "remove_prompt": "Escolha o app personalizado que deseja remover.",
        "invalid_app": "Formato inválido. Use: Nome | https://endereco.com | Social, Tools ou Media.",
        "invalid_url": "O endereço precisa ser HTTPS válido, sem usuário ou senha na URL.",
        "app_added": "✅ App adicionado.",
        "app_removed": "✅ App removido.",
        "not_found": "Nenhum app encontrado.",
        "need_private": "Por segurança, gerencie apps e chaves em uma conversa privada com o bot.",
        "key_saved": "✅ Chave recebida e mantida somente na memória. Ela será esquecida quando o bot reiniciar.",
        "key_cleared": "Chave Gemini removida deste chat.",
        "key_missing": "Configure sua chave Gemini pelo botão 🧠 ou use /setkey antes de conversar com a IA.",
        "key_help": "Crie uma chave no Google AI Studio: https://aistudio.google.com/app/apikey\nA chave é mantida apenas na memória deste processo e não é persistida. Evite enviá-la em grupos.",
        "key_present": "Sua chave já está configurada neste processo. Você pode substituí-la ou removê-la.",
        "cancelled": "Ação cancelada.",
        "help_text": "Use os botões para filtrar, abrir, adicionar e buscar aplicativos. Apps adicionados ficam separados por chat e são salvos em disco; forneça DATA_FILE em volume persistente se precisar mantê-los após uma recriação do serviço.\n\nPara usar o Gemini, configure sua própria chave no botão 🧠 ou com /setkey. A chave fica apenas na memória e precisa ser informada de novo após reiniciar o bot. /forgetkey remove a chave; /clear limpa o histórico de conversa.",
        "language_prompt": "Escolha o idioma:",
        "language_set": "Idioma atualizado.",
        "bad_key": "A chave parece inválida. Envie uma chave com 20 a 512 caracteres, ou /cancelar.",
        "duplicate_app": "Esse endereço já está na sua lista.",
        "app_limit": "Você atingiu o limite de apps personalizados.",
        "save_error": "Não foi possível salvar. Verifique as permissões e o caminho de DATA_FILE.",
        "prompt_too_long": "Mensagem muito longa. O limite é 6000 caracteres.",
        "api_bad_request": "A Gemini API rejeitou a solicitação. Confira o modelo e a chave.",
        "api_auth": "A chave Gemini foi recusada. Use /setkey para substituí-la.",
        "api_quota": "Limite da Gemini API atingido. Verifique a cota da sua chave e tente mais tarde.",
        "api_error": "Não foi possível obter uma resposta da Gemini API agora.",
        "unknown_command": "Comando não reconhecido. Use /help.",
        "status": "Modelo: {model}\nChave deste chat: {key}\nChave compartilhada do servidor: {shared}\nTempo ativo: {uptime}\nMensagens processadas: {messages}\nHistórico neste chat: {history} turnos\nPorta de saúde: {port}",
        "yes": "sim",
        "no": "não",
    },
    "en": {
        "welcome": "👋 Welcome! Choose a category or open an app.",
        "menu": "🚀 Your apps",
        "count": "{count} app(s)",
        "empty": "There are no apps in this category.",
        "all": "📱 All",
        "social": "💬 Social",
        "tools": "🧰 Tools",
        "media": "🎬 Media",
        "add": "➕ Add app",
        "search": "🔎 Search",
        "language": "🌐 Language",
        "help": "❔ Help",
        "gemini": "🧠 Gemini key",
        "set_key": "🔑 Set my key",
        "remove": "🗑 Remove app",
        "open": "🔗 {name}",
        "previous": "⬅️ Previous",
        "next": "Next ➡️",
        "home": "🏠 Home",
        "add_prompt": "Send: Name | https://address.com | Social, Tools, or Media.\nExample: My app | https://example.com | Tools\nSend /cancel to stop.",
        "search_prompt": "Type an app name or address to search. Send /cancel to stop.",
        "key_prompt": "Send your Gemini API key in this private chat. It stays in process memory only, is not written to disk, and the message will be deleted if Telegram allows it. Send /cancel to stop.",
        "remove_prompt": "Choose the custom app to remove.",
        "invalid_app": "Invalid format. Use: Name | https://address.com | Social, Tools, or Media.",
        "invalid_url": "The address must be a valid HTTPS URL without embedded credentials.",
        "app_added": "✅ App added.",
        "app_removed": "✅ App removed.",
        "not_found": "No apps found.",
        "need_private": "For safety, manage apps and API keys in a private chat with the bot.",
        "key_saved": "✅ Key received and kept in memory only. It will be forgotten when the bot restarts.",
        "key_cleared": "Gemini key removed from this chat.",
        "key_missing": "Set your Gemini key with the 🧠 button or /setkey before chatting with AI.",
        "key_help": "Create a key in Google AI Studio: https://aistudio.google.com/app/apikey\nThe key is kept only in this process's memory and is not persisted. Never send it in a group.",
        "key_present": "Your key is currently configured in this process. You can replace or remove it.",
        "cancelled": "Action cancelled.",
        "help_text": "Use the buttons to filter, open, add, and search apps. Custom apps are isolated by chat and saved to disk; set DATA_FILE to a persistent volume if they should survive service replacement.\n\nTo use Gemini, set your own key with the 🧠 button or /setkey. Keys stay in memory and must be entered again after a restart. /forgetkey removes the key; /clear clears chat history.",
        "language_prompt": "Choose a language:",
        "language_set": "Language updated.",
        "bad_key": "That key does not look valid. Send a 20–512 character key, or /cancel.",
        "duplicate_app": "That address is already in your list.",
        "app_limit": "You have reached the custom app limit.",
        "save_error": "Could not save your changes. Check DATA_FILE path and permissions.",
        "prompt_too_long": "Message too long. The limit is 6000 characters.",
        "api_bad_request": "The Gemini API rejected the request. Check the model and key.",
        "api_auth": "Gemini rejected the key. Use /setkey to replace it.",
        "api_quota": "Gemini API quota reached. Check your key's quota and try again later.",
        "api_error": "Could not get a response from the Gemini API right now.",
        "unknown_command": "Unknown command. Use /help.",
        "status": "Model: {model}\nThis chat's key: {key}\nServer shared key: {shared}\nUptime: {uptime}\nMessages processed: {messages}\nChat history: {history} turns\nHealth port: {port}",
        "yes": "yes",
        "no": "no",
    },
    "es": {
        "welcome": "👋 ¡Hola! Elige una categoría o abre una aplicación.",
        "menu": "🚀 Tus aplicaciones",
        "count": "{count} aplicación(es)",
        "empty": "No hay aplicaciones en esta categoría.",
        "all": "📱 Todas",
        "social": "💬 Social",
        "tools": "🧰 Herramientas",
        "media": "🎬 Medios",
        "add": "➕ Añadir app",
        "search": "🔎 Buscar",
        "language": "🌐 Idioma",
        "help": "❔ Ayuda",
        "gemini": "🧠 Clave Gemini",
        "set_key": "🔑 Configurar clave",
        "remove": "🗑 Eliminar app",
        "open": "🔗 {name}",
        "previous": "⬅️ Anterior",
        "next": "Siguiente ➡️",
        "home": "🏠 Inicio",
        "add_prompt": "Envía: Nombre | https://direccion.com | Social, Tools o Media.\nEjemplo: Mi app | https://example.com | Tools\nEnvía /cancel para salir.",
        "search_prompt": "Escribe el nombre o dirección para buscar. Envía /cancel para salir.",
        "key_prompt": "Envía tu clave API de Gemini en este chat privado. Solo permanece en la memoria del proceso, no se guarda en disco y el mensaje se borrará si Telegram lo permite. Envía /cancel para salir.",
        "remove_prompt": "Elige la aplicación personalizada que quieres eliminar.",
        "invalid_app": "Formato inválido. Usa: Nombre | https://direccion.com | Social, Tools o Media.",
        "invalid_url": "La dirección debe ser una URL HTTPS válida sin credenciales.",
        "app_added": "✅ Aplicación añadida.",
        "app_removed": "✅ Aplicación eliminada.",
        "not_found": "No se encontraron aplicaciones.",
        "need_private": "Por seguridad, administra apps y claves en un chat privado con el bot.",
        "key_saved": "✅ Clave recibida y guardada solo en memoria. Se olvidará al reiniciar el bot.",
        "key_cleared": "Clave Gemini eliminada de este chat.",
        "key_missing": "Configura tu clave Gemini con el botón 🧠 o /setkey antes de usar la IA.",
        "key_help": "Crea una clave en Google AI Studio: https://aistudio.google.com/app/apikey\nLa clave solo permanece en la memoria del proceso y no se guarda. No la envíes en grupos.",
        "key_present": "Tu clave está configurada en este proceso. Puedes reemplazarla o eliminarla.",
        "cancelled": "Acción cancelada.",
        "help_text": "Usa los botones para filtrar, abrir, añadir y buscar aplicaciones. Las apps personalizadas se separan por chat y se guardan en disco; configura DATA_FILE en un volumen persistente para conservarlas al recrear el servicio.\n\nPara usar Gemini, configura tu clave con el botón 🧠 o /setkey. Las claves quedan en memoria y deben volver a enviarse tras reiniciar. /forgetkey elimina la clave; /clear borra el historial.",
        "language_prompt": "Elige un idioma:",
        "language_set": "Idioma actualizado.",
        "bad_key": "La clave no parece válida. Envía una clave de 20 a 512 caracteres o /cancel.",
        "duplicate_app": "Esa dirección ya está en tu lista.",
        "app_limit": "Has alcanzado el límite de aplicaciones personalizadas.",
        "save_error": "No se pudieron guardar los cambios. Revisa la ruta y los permisos de DATA_FILE.",
        "prompt_too_long": "Mensaje demasiado largo. El límite es de 6000 caracteres.",
        "api_bad_request": "Gemini API rechazó la solicitud. Comprueba el modelo y la clave.",
        "api_auth": "Gemini rechazó la clave. Usa /setkey para cambiarla.",
        "api_quota": "Se alcanzó la cuota de Gemini API. Revisa la cuota de tu clave e inténtalo más tarde.",
        "api_error": "No se pudo obtener una respuesta de Gemini API ahora.",
        "unknown_command": "Comando desconocido. Usa /help.",
        "status": "Modelo: {model}\nClave de este chat: {key}\nClave compartida del servidor: {shared}\nTiempo activo: {uptime}\nMensajes procesados: {messages}\nHistorial de este chat: {history} turnos\nPuerto de salud: {port}",
        "yes": "sí",
        "no": "no",
    },
}

_state_lock = threading.RLock()
_user_data: Dict[str, Dict[str, Any]] = {}
_api_keys: Dict[int, str] = {}
_chat_histories: Dict[int, List[Dict[str, str]]] = {}
_pending_actions: Dict[int, Dict[str, Any]] = {}
_bot_start_time = time.time()
_total_messages_processed = 0


def tr(language: str, key: str, **values: Any) -> str:
    language = language if language in TEXTS else "en"
    return TEXTS[language][key].format(**values)


def _chat_entry(chat_id: int) -> Dict[str, Any]:
    return _user_data.setdefault(str(chat_id), {"language": "pt", "apps": []})


def _valid_https_url(value: str) -> bool:
    if len(value) > 2048:
        return False
    try:
        parsed = urllib.parse.urlsplit(value)
        hostname = parsed.hostname or ""
        return (
            parsed.scheme == "https"
            and bool(hostname)
            and parsed.username is None
            and parsed.password is None
            and parsed.port in (None, 443)
            and not any(character.isspace() for character in value)
            and "\\" not in value
            and bool(hostname.encode("idna"))
        )
    except (UnicodeError, ValueError):
        return False


def load_user_data() -> None:
    """Load only non-secret app and language settings from the configured data file."""
    if not os.path.exists(DATA_FILE):
        return
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as data_file:
            raw_data = json.load(data_file)
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Could not load DATA_FILE ({DATA_FILE}): {error}") from error
    if not isinstance(raw_data, dict):
        raise RuntimeError(f"DATA_FILE ({DATA_FILE}) must contain a JSON object.")

    for chat_id, entry in raw_data.items():
        if not isinstance(chat_id, str) or not isinstance(entry, dict):
            continue
        language = entry.get("language", "pt")
        if language not in LANGUAGES:
            language = "pt"
        apps = []
        raw_apps = entry.get("apps", [])
        if not isinstance(raw_apps, list):
            raw_apps = []
        for app in raw_apps:
            if not isinstance(app, dict):
                continue
            name, url, category = app.get("name"), app.get("url"), app.get("category")
            if (
                isinstance(name, str)
                and 1 <= len(name.strip()) <= 36
                and isinstance(url, str)
                and _valid_https_url(url)
                and category in ("social", "tools", "media")
            ):
                apps.append({"name": name.strip(), "url": url, "category": category})
        _user_data[chat_id] = {"language": language, "apps": apps[:MAX_CUSTOM_APPS]}


def save_user_data() -> None:
    """Atomically persist app metadata and language preferences, never API keys."""
    directory = os.path.dirname(os.path.abspath(DATA_FILE))
    os.makedirs(directory, exist_ok=True)
    temporary_path = ""
    with _state_lock:
        snapshot = json.dumps(_user_data, ensure_ascii=False, separators=(",", ":"))
        try:
            descriptor, temporary_path = tempfile.mkstemp(
                prefix=".telegram-bot-", suffix=".tmp", dir=directory
            )
            with os.fdopen(descriptor, "w", encoding="utf-8") as data_file:
                data_file.write(snapshot)
                data_file.flush()
                os.fsync(data_file.fileno())
            os.replace(temporary_path, DATA_FILE)
        except OSError:
            if temporary_path and os.path.exists(temporary_path):
                os.unlink(temporary_path)
            raise


def get_language(chat_id: int, telegram_language: str = "") -> str:
    with _state_lock:
        entry = _user_data.get(str(chat_id))
        if entry and entry.get("language") in LANGUAGES:
            return entry["language"]
    prefix = telegram_language.lower().split("-", 1)[0]
    return prefix if prefix in LANGUAGES else "pt"


def initialize_chat_data(chat_id: int, language: str) -> None:
    with _state_lock:
        _user_data.setdefault(
            str(chat_id),
            {"language": language if language in LANGUAGES else "pt", "apps": []},
        )


def set_language(chat_id: int, language: str) -> None:
    if language not in LANGUAGES:
        raise ValueError("Unsupported language.")
    with _state_lock:
        entry = _chat_entry(chat_id)
        previous = entry.get("language", "pt")
        entry["language"] = language
        try:
            save_user_data()
        except OSError:
            entry["language"] = previous
            raise


def get_gemini_api_key(chat_id: Optional[int] = None) -> str:
    """Return a chat-specific key, or an explicitly enabled shared server key."""
    if chat_id is not None:
        with _state_lock:
            key = _api_keys.get(chat_id)
        if key:
            return key
    if ALLOW_SHARED_GEMINI_KEY:
        return GEMINI_API_KEY
    return ""


class GeminiApiError(Exception):
    def __init__(self, status_code: Optional[int] = None) -> None:
        self.status_code = status_code


def call_gemini(user_prompt: str, chat_id: int) -> str:
    api_key = get_gemini_api_key(chat_id)
    if not api_key:
        return tr(get_language(chat_id), "key_missing")

    with _state_lock:
        history = list(_chat_histories.get(chat_id, []))
    contents = [
        {
            "role": "user" if turn["role"] == "user" else "model",
            "parts": [{"text": turn["text"]}],
        }
        for turn in history
    ]
    contents.append({"role": "user", "parts": [{"text": user_prompt}]})
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
        "contents": contents,
        "generationConfig": {"maxOutputTokens": 700},
    }
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{urllib.parse.quote(GEMINI_MODEL, safe='._-')}:generateContent"
    )
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            response_data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        logger.warning("Gemini API returned HTTP %s.", error.code)
        raise GeminiApiError(error.code) from None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        logger.warning("Gemini API request failed: %s", type(error).__name__)
        raise GeminiApiError() from None

    if not isinstance(response_data, dict):
        raise GeminiApiError()
    candidates = response_data.get("candidates", [])
    if not isinstance(candidates, list) or not candidates or not isinstance(candidates[0], dict):
        raise GeminiApiError()
    content = candidates[0].get("content", {})
    parts = content.get("parts", []) if isinstance(content, dict) else []
    if not isinstance(parts, list):
        raise GeminiApiError()
    answer = "\n".join(
        part["text"]
        for part in parts
        if isinstance(part, dict) and isinstance(part.get("text"), str)
    )
    if not answer.strip():
        raise GeminiApiError()
    return answer.strip()


def call_telegram_api(method: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN is not configured; skipped Telegram API call.")
        return None
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{method}"
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            result = json.loads(response.read().decode("utf-8"))
        if not isinstance(result, dict):
            logger.warning("Telegram API %s returned an invalid response.", method)
            return None
        if not result.get("ok"):
            logger.warning("Telegram API %s returned an error.", method)
        return result
    except urllib.error.HTTPError as error:
        logger.warning("Telegram API %s returned HTTP %s.", method, error.code)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        logger.warning("Telegram API %s request failed: %s", method, type(error).__name__)
    return None


def send_telegram_message(
    chat_id: int,
    text: str,
    reply_to_message_id: Optional[int] = None,
    reply_markup: Optional[Dict[str, Any]] = None,
) -> None:
    for offset in range(0, len(text), 3900):
        payload: Dict[str, Any] = {"chat_id": chat_id, "text": text[offset : offset + 3900]}
        if reply_to_message_id and offset == 0:
            payload["reply_to_message_id"] = reply_to_message_id
        if reply_markup and offset == 0:
            payload["reply_markup"] = reply_markup
        call_telegram_api("sendMessage", payload)


def _category_apps(chat_id: int, category: str) -> List[Dict[str, str]]:
    apps = DEFAULT_APPS + _chat_entry(chat_id).get("apps", [])
    if category != "all":
        apps = [app for app in apps if app["category"] == category]
    return apps


def _app_button(app: Dict[str, str], language: str) -> Dict[str, Any]:
    title = app["name"][:48]
    return {"text": tr(language, "open", name=title), "url": app["url"]}


def _menu_markup(
    chat_id: int, language: str, category: str = "all", page: int = 0
) -> Dict[str, Any]:
    apps = _category_apps(chat_id, category)
    page_count = max(1, (len(apps) + PAGE_SIZE - 1) // PAGE_SIZE)
    page = max(0, min(page, page_count - 1))
    rows: List[List[Dict[str, Any]]] = []

    for index in range(page * PAGE_SIZE, min((page + 1) * PAGE_SIZE, len(apps)), 2):
        rows.append([_app_button(app, language) for app in apps[index : index + 2]])

    rows.append(
        [
            {"text": tr(language, "all"), "callback_data": "cat:all"},
            {"text": tr(language, "social"), "callback_data": "cat:social"},
        ]
    )
    rows.append(
        [
            {"text": tr(language, "tools"), "callback_data": "cat:tools"},
            {"text": tr(language, "media"), "callback_data": "cat:media"},
        ]
    )
    if page_count > 1:
        navigation = []
        if page > 0:
            navigation.append(
                {"text": tr(language, "previous"), "callback_data": f"page:{category}:{page - 1}"}
            )
        if page < page_count - 1:
            navigation.append(
                {"text": tr(language, "next"), "callback_data": f"page:{category}:{page + 1}"}
            )
        rows.append(navigation)
    rows.extend(
        [
            [
                {"text": tr(language, "add"), "callback_data": "action:add"},
                {"text": tr(language, "search"), "callback_data": "action:search"},
            ],
            [
                {"text": tr(language, "language"), "callback_data": "action:language"},
                {"text": tr(language, "help"), "callback_data": "action:help"},
            ],
            [{"text": tr(language, "gemini"), "callback_data": "action:gemini"}],
        ]
    )
    if _chat_entry(chat_id).get("apps"):
        rows.append([{"text": tr(language, "remove"), "callback_data": "action:remove"}])
    return {"inline_keyboard": rows}


def show_menu(
    chat_id: int,
    language: str,
    message_id: Optional[int] = None,
    category: str = "all",
    page: int = 0,
    welcome: bool = False,
) -> None:
    apps = _category_apps(chat_id, category)
    page_count = max(1, (len(apps) + PAGE_SIZE - 1) // PAGE_SIZE)
    page = max(0, min(page, page_count - 1))
    title = tr(language, "welcome") if welcome else tr(language, "menu")
    text = f"{title}\n\n{tr(language, 'count', count=len(apps))}"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "reply_markup": _menu_markup(chat_id, language, category, page),
    }
    if message_id is None:
        call_telegram_api("sendMessage", payload)
    else:
        payload["message_id"] = message_id
        call_telegram_api("editMessageText", payload)


def _force_reply_prompt(chat_id: int, text: str, action: str, user_id: int) -> None:
    with _state_lock:
        _pending_actions[chat_id] = {"action": action, "user_id": user_id}
    send_telegram_message(
        chat_id,
        text,
        reply_markup={"force_reply": True, "selective": True},
    )


def _begin_action(
    chat_id: int,
    user_id: int,
    chat_type: str,
    action: str,
    language: str,
    message_id: Optional[int],
) -> None:
    if action in ("add", "remove", "gemini") and chat_type != "private":
        send_telegram_message(chat_id, tr(language, "need_private"))
        return
    if action == "add":
        _force_reply_prompt(chat_id, tr(language, "add_prompt"), action, user_id)
    elif action == "search":
        _force_reply_prompt(chat_id, tr(language, "search_prompt"), action, user_id)
    elif action == "language":
        keyboard = {
            "inline_keyboard": [[
                {"text": "Português", "callback_data": "lang:pt"},
                {"text": "English", "callback_data": "lang:en"},
                {"text": "Español", "callback_data": "lang:es"},
            ]]
        }
        _send_or_edit_message(chat_id, message_id, tr(language, "language_prompt"), keyboard)
    elif action == "help":
        _send_or_edit_message(
            chat_id,
            message_id,
            tr(language, "help_text"),
            {"inline_keyboard": [[
                {"text": tr(language, "home"), "callback_data": "home"}
            ]]},
        )
    elif action == "gemini":
        with _state_lock:
            has_key = chat_id in _api_keys
        key_text = tr(language, "key_help")
        if has_key:
            key_text += "\n\n" + tr(language, "key_present")
        keyboard = {
            "inline_keyboard": [[
                {"text": tr(language, "set_key"), "callback_data": "key:set"},
                {"text": tr(language, "remove"), "callback_data": "key:forget"},
            ], [
                {"text": tr(language, "home"), "callback_data": "home"}
            ]]
        }
        _send_or_edit_message(chat_id, message_id, key_text, keyboard)
    elif action == "remove":
        apps = _chat_entry(chat_id).get("apps", [])
        if not apps:
            send_telegram_message(chat_id, tr(language, "not_found"))
            return
        rows = [
            [{"text": app["name"][:50], "callback_data": f"remove:{index}"}]
            for index, app in enumerate(apps)
        ]
        rows.append([{"text": tr(language, "home"), "callback_data": "home"}])
        _send_or_edit_message(
            chat_id,
            message_id,
            tr(language, "remove_prompt"),
            {"inline_keyboard": rows},
        )


def _send_or_edit_message(
    chat_id: int,
    message_id: Optional[int],
    text: str,
    reply_markup: Dict[str, Any],
) -> None:
    payload: Dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "reply_markup": reply_markup,
    }
    if message_id:
        payload["message_id"] = message_id
        call_telegram_api("editMessageText", payload)
    else:
        call_telegram_api("sendMessage", payload)


def _parse_app(text: str) -> Optional[Dict[str, str]]:
    parts = [part.strip() for part in text.split("|")]
    if len(parts) != 3:
        return None
    name, url, raw_category = parts
    category = raw_category.casefold()
    aliases = {
        "social": "social",
        "ferramentas": "tools",
        "tools": "tools",
        "mídia": "media",
        "midia": "media",
        "media": "media",
    }
    category = aliases.get(category, "")
    if (
        not name
        or len(name) > 36
        or any(ord(character) < 32 for character in name)
        or not category
        or not _valid_https_url(url)
    ):
        return None
    return {"name": name, "url": url, "category": category}


def _add_app(chat_id: int, app: Dict[str, str]) -> str:
    with _state_lock:
        entry = _chat_entry(chat_id)
        apps = entry.setdefault("apps", [])
        if len(apps) >= MAX_CUSTOM_APPS:
            return "app_limit"
        if any(
            existing["url"].casefold() == app["url"].casefold()
            for existing in DEFAULT_APPS + apps
        ):
            return "duplicate_app"
        apps.append(app)
        try:
            save_user_data()
        except OSError:
            apps.pop()
            logger.exception("Could not persist a custom app.")
            return "save_error"
    return "app_added"


def _remove_app(chat_id: int, index: int) -> bool:
    with _state_lock:
        apps = _chat_entry(chat_id).get("apps", [])
        if index < 0 or index >= len(apps):
            return False
        removed = apps.pop(index)
        try:
            save_user_data()
        except OSError:
            apps.insert(index, removed)
            logger.exception("Could not persist removal of a custom app.")
            raise
    return True


def _process_pending_action(
    message: Dict[str, Any], chat_id: int, user_id: int, text: str, language: str
) -> bool:
    with _state_lock:
        pending = _pending_actions.get(chat_id)
    if not pending or pending.get("user_id") != user_id:
        return False
    if text.lower() in ("/cancel", "/cancelar"):
        with _state_lock:
            _pending_actions.pop(chat_id, None)
        send_telegram_message(chat_id, tr(language, "cancelled"))
        return True

    action = pending["action"]
    if action == "key":
        key = text.strip()
        message_id = message.get("message_id")
        deleted = False
        if message_id:
            result = call_telegram_api(
                "deleteMessage", {"chat_id": chat_id, "message_id": message_id}
            )
            deleted = bool(result and result.get("ok"))
        with _state_lock:
            _pending_actions.pop(chat_id, None)
            if 20 <= len(key) <= 512 and not any(char.isspace() for char in key):
                _api_keys[chat_id] = key
            else:
                key = ""
        if not key:
            send_telegram_message(chat_id, tr(language, "bad_key"))
        else:
            confirmation = tr(language, "key_saved")
            if not deleted:
                confirmation += "\n" + (
                    "Apague a mensagem da chave." if language == "pt"
                    else "Delete the key message." if language == "en"
                    else "Borra el mensaje de la clave."
                )
            send_telegram_message(chat_id, confirmation)
        return True

    with _state_lock:
        _pending_actions.pop(chat_id, None)
    if action == "add":
        app = _parse_app(text)
        if not app:
            parts = [part.strip() for part in text.split("|")]
            error_key = (
                "invalid_url"
                if len(parts) == 3 and not _valid_https_url(parts[1])
                else "invalid_app"
            )
            send_telegram_message(chat_id, tr(language, error_key))
            _force_reply_prompt(
                chat_id, tr(language, "add_prompt"), "add", user_id
            )
            return True
        result_key = _add_app(chat_id, app)
        send_telegram_message(chat_id, tr(language, result_key))
        if result_key == "app_added":
            show_menu(chat_id, language)
        return True
    if action == "search":
        query = text.casefold()
        matches = [
            app for app in _category_apps(chat_id, "all")
            if query in app["name"].casefold() or query in app["url"].casefold()
        ]
        rows = [
            [_app_button(app, language)]
            for app in matches[:MAX_CUSTOM_APPS + len(DEFAULT_APPS)]
        ]
        rows.append([{"text": tr(language, "home"), "callback_data": "home"}])
        send_telegram_message(
            chat_id,
            tr(language, "count", count=len(matches)) if matches
            else tr(language, "not_found"),
            reply_markup={"inline_keyboard": rows},
        )
        return True
    return False


def _answer_callback(callback_id: str) -> None:
    call_telegram_api("answerCallbackQuery", {"callback_query_id": callback_id})


def _handle_callback_query(callback: Dict[str, Any]) -> None:
    callback_id = callback.get("id")
    if callback_id:
        _answer_callback(callback_id)
    message = callback.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    user = callback.get("from") or {}
    user_id = user.get("id")
    message_id = message.get("message_id")
    data = callback.get("data", "")
    if not isinstance(chat_id, int) or not isinstance(user_id, int) or not message_id:
        return
    if not isinstance(data, str):
        return
    language = get_language(chat_id, user.get("language_code", ""))
    initialize_chat_data(chat_id, language)
    chat_type = chat.get("type", "")

    if data == "home":
        show_menu(chat_id, language, message_id=message_id)
    elif data.startswith("cat:"):
        category = data.split(":", 1)[1]
        if category in CATEGORIES:
            show_menu(chat_id, language, message_id=message_id, category=category)
    elif data.startswith("page:"):
        parts = data.split(":")
        if len(parts) == 3 and parts[1] in CATEGORIES and parts[2].isdigit():
            show_menu(
                chat_id,
                language,
                message_id=message_id,
                category=parts[1],
                page=int(parts[2]),
            )
    elif data.startswith("action:"):
        _begin_action(
            chat_id, user_id, chat_type, data.split(":", 1)[1], language, message_id
        )
    elif data.startswith("lang:"):
        new_language = data.split(":", 1)[1]
        if new_language in LANGUAGES:
            try:
                set_language(chat_id, new_language)
            except OSError:
                send_telegram_message(chat_id, tr(language, "save_error"))
            else:
                show_menu(
                    chat_id,
                    new_language,
                    message_id=message_id,
                    welcome=False,
                )
    elif data == "key:set":
        if chat_type != "private":
            send_telegram_message(chat_id, tr(language, "need_private"))
        else:
            _force_reply_prompt(chat_id, tr(language, "key_prompt"), "key", user_id)
    elif data == "key:forget":
        if chat_type != "private":
            send_telegram_message(chat_id, tr(language, "need_private"))
        else:
            with _state_lock:
                _api_keys.pop(chat_id, None)
            send_telegram_message(chat_id, tr(language, "key_cleared"))
    elif data.startswith("remove:"):
        if chat_type != "private":
            send_telegram_message(chat_id, tr(language, "need_private"))
            return
        index_text = data.split(":", 1)[1]
        if index_text.isdigit():
            try:
                removed = _remove_app(chat_id, int(index_text))
            except OSError:
                send_telegram_message(chat_id, tr(language, "save_error"))
                return
            if removed:
                send_telegram_message(chat_id, tr(language, "app_removed"))
                show_menu(chat_id, language)
            else:
                send_telegram_message(chat_id, tr(language, "not_found"))


def _handle_message(message: Dict[str, Any]) -> None:
    global _total_messages_processed
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if not isinstance(chat_id, int):
        return
    sender = message.get("from") or {}
    user_id = sender.get("id")
    if not isinstance(user_id, int):
        return
    text = (message.get("text") or "").strip()
    if not text:
        return
    with _state_lock:
        _total_messages_processed += 1
    language = get_language(chat_id, sender.get("language_code", ""))
    initialize_chat_data(chat_id, language)

    command_token = text.split(maxsplit=1)[0] if text.startswith("/") else ""
    command = command_token.split("@", 1)[0].lower()
    command_args = text[len(command_token):].strip()

    if command in ("/start", "/launcher", "/iniciar"):
        show_menu(
            chat_id,
            language,
            welcome=True,
        )
        return
    if command in ("/cancel", "/cancelar"):
        if not _process_pending_action(message, chat_id, user_id, text, language):
            send_telegram_message(chat_id, tr(language, "cancelled"))
        return
    if command in ("/help", "/ajuda"):
        send_telegram_message(chat_id, tr(language, "help_text"))
        return
    if command in ("/clear", "/limpar", "/reset"):
        with _state_lock:
            _chat_histories.pop(chat_id, None)
        send_telegram_message(chat_id, "🧹 Histórico de conversa limpo." if language == "pt" else "🧹 Conversation history cleared." if language == "en" else "🧹 Historial de conversación borrado.")
        return
    if command == "/ping":
        send_telegram_message(chat_id, "🏓 Pong!")
        return
    if command == "/status":
        uptime_seconds = int(time.time() - _bot_start_time)
        hours, remainder = divmod(uptime_seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        with _state_lock:
            history = len(_chat_histories.get(chat_id, [])) // 2
            has_key = bool(_api_keys.get(chat_id))
            messages = _total_messages_processed
        send_telegram_message(
            chat_id,
            tr(
                language,
                "status",
                model=GEMINI_MODEL,
                key=tr(language, "yes" if has_key else "no"),
                shared=tr(
                    language,
                    "yes" if ALLOW_SHARED_GEMINI_KEY and GEMINI_API_KEY else "no",
                ),
                uptime=f"{hours}h {minutes}m {seconds}s",
                messages=messages,
                history=history,
                port=PORT,
            ),
        )
        return
    if command in ("/setkey", "/apikey"):
        if chat.get("type") != "private":
            send_telegram_message(chat_id, tr(language, "need_private"))
        elif command_args:
            with _state_lock:
                _pending_actions[chat_id] = {"action": "key", "user_id": user_id}
            _process_pending_action(message, chat_id, user_id, command_args, language)
        else:
            _force_reply_prompt(chat_id, tr(language, "key_prompt"), "key", user_id)
        return
    if command in ("/forgetkey", "/removekey"):
        with _state_lock:
            _api_keys.pop(chat_id, None)
        send_telegram_message(chat_id, tr(language, "key_cleared"))
        return
    if command in ("/addapp", "/search", "/removeapp", "/language"):
        action = {
            "/addapp": "add",
            "/search": "search",
            "/removeapp": "remove",
            "/language": "language",
        }[command]
        _begin_action(chat_id, user_id, chat.get("type", ""), action, language, None)
        return
    if command:
        send_telegram_message(chat_id, tr(language, "unknown_command"))
        return

    if _process_pending_action(message, chat_id, user_id, text, language):
        return
    if len(text) > MAX_PROMPT_LENGTH:
        send_telegram_message(chat_id, tr(language, "prompt_too_long"))
        return
    if not get_gemini_api_key(chat_id):
        send_telegram_message(chat_id, tr(language, "key_missing"))
        return

    call_telegram_api("sendChatAction", {"chat_id": chat_id, "action": "typing"})
    try:
        answer = call_gemini(text, chat_id)
    except GeminiApiError as error:
        error_key = {
            400: "api_bad_request",
            401: "api_auth",
            403: "api_auth",
            429: "api_quota",
        }.get(error.status_code, "api_error")
        send_telegram_message(chat_id, tr(language, error_key))
        return

    with _state_lock:
        history = _chat_histories.setdefault(chat_id, [])
        history.extend(({"role": "user", "text": text}, {"role": "model", "text": answer}))
        del history[:-MAX_HISTORY_TURNS * 2]
    send_telegram_message(chat_id, answer, reply_to_message_id=message.get("message_id"))


def handle_update(update: Dict[str, Any]) -> None:
    """Dispatch Telegram message and inline-keyboard callback updates."""
    callback = update.get("callback_query")
    if isinstance(callback, dict):
        _handle_callback_query(callback)
        return
    message = update.get("message")
    if isinstance(message, dict):
        _handle_message(message)


def register_bot_commands() -> None:
    commands = [
        {"command": "start", "description": "Open the app launcher"},
        {"command": "help", "description": "Show help"},
        {"command": "search", "description": "Search apps"},
        {"command": "addapp", "description": "Add an app"},
        {"command": "removeapp", "description": "Remove a custom app"},
        {"command": "language", "description": "Change language"},
        {"command": "setkey", "description": "Set your Gemini API key"},
        {"command": "forgetkey", "description": "Remove your Gemini API key"},
        {"command": "clear", "description": "Clear conversation history"},
        {"command": "status", "description": "Show bot status"},
        {"command": "ping", "description": "Check bot response"},
    ]
    result = call_telegram_api("setMyCommands", {"commands": commands})
    if not result or not result.get("ok"):
        logger.warning("Could not register Telegram commands.")


def run_telegram_polling() -> None:
    if TELEGRAM_BOT_TOKEN:
        result = call_telegram_api("getMe", {})
        if result and result.get("ok"):
            logger.info("Authenticated with Telegram.")
        register_bot_commands()

    offset = 0
    logger.info("Telegram long polling started.")
    while True:
        if not TELEGRAM_BOT_TOKEN:
            time.sleep(5)
            continue
        try:
            result = call_telegram_api(
                "getUpdates",
                {
                    "offset": offset,
                    "timeout": 20,
                    "allowed_updates": ["message", "callback_query"],
                },
            )
            if result and result.get("ok"):
                for update in result.get("result", []):
                    offset = max(offset, update.get("update_id", 0) + 1)
                    try:
                        handle_update(update)
                    except Exception:
                        logger.exception("Could not process Telegram update.")
            time.sleep(0.5)
        except Exception:
            logger.exception("Telegram polling failed; retrying shortly.")
            time.sleep(3)


class HeadlessStatusHandler(BaseHTTPRequestHandler):
    """Minimal JSON health and Telegram webhook endpoint; no user-facing web pages."""

    def _send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path != "/health":
            self._send_json(404, {"status": "not_found"})
            return
        with _state_lock:
            messages = _total_messages_processed
        self._send_json(
            200,
            {
                "status": "ok",
                "service": "telegram-app-launcher",
                "mode": "headless",
                "telegram_delivery": "webhook" if TELEGRAM_WEBHOOK_URL else "polling",
                "engine": GEMINI_MODEL,
                "telegram_configured": bool(TELEGRAM_BOT_TOKEN),
                "shared_gemini_key_enabled": bool(
                    ALLOW_SHARED_GEMINI_KEY and GEMINI_API_KEY
                ),
                "messages_processed": messages,
                "uptime_seconds": int(time.time() - _bot_start_time),
            },
        )

    def do_POST(self) -> None:
        if self.path != WEBHOOK_PATH or not TELEGRAM_WEBHOOK_URL:
            self._send_json(404, {"status": "not_found"})
            return
        received_secret = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not hmac.compare_digest(received_secret, TELEGRAM_WEBHOOK_SECRET):
            self._send_json(401, {"status": "unauthorized"})
            return
        try:
            content_length = int(self.headers.get("Content-Length", ""))
        except ValueError:
            self._send_json(400, {"status": "invalid_content_length"})
            return
        if content_length <= 0 or content_length > MAX_WEBHOOK_BODY_BYTES:
            self._send_json(413, {"status": "request_too_large"})
            return
        try:
            update = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"status": "invalid_json"})
            return
        if not isinstance(update, dict) or not isinstance(update.get("update_id"), int):
            self._send_json(400, {"status": "invalid_update"})
            return
        try:
            handle_update(update)
        except Exception:
            logger.exception("Could not process Telegram webhook update.")
            self._send_json(500, {"status": "processing_failed"})
            return
        self._send_json(200, {"status": "ok"})

    def log_message(self, format: str, *args: Any) -> None:
        return


def create_diagnostic_server(port: int = PORT) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("0.0.0.0", port), HeadlessStatusHandler)
    server.daemon_threads = True
    return server


def register_telegram_webhook() -> None:
    if not TELEGRAM_WEBHOOK_URL:
        return
    result = call_telegram_api(
        "setWebhook",
        {
            "url": TELEGRAM_WEBHOOK_URL,
            "secret_token": TELEGRAM_WEBHOOK_SECRET,
            "allowed_updates": ["message", "callback_query"],
            "drop_pending_updates": False,
            "max_connections": 5,
        },
    )
    if not result or not result.get("ok"):
        raise RuntimeError(
            "Could not register the Telegram webhook; check the public HTTPS domain and bot token."
        )
    register_bot_commands()
    logger.info("Telegram webhook registered.")


def main() -> None:
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("Set TELEGRAM_BOT_TOKEN before starting the bot.")
    load_user_data()
    logger.info(
        "Starting headless Telegram launcher: model=%s, delivery=%s, shared Gemini key=%s",
        GEMINI_MODEL,
        "webhook" if TELEGRAM_WEBHOOK_URL else "long polling",
        "enabled" if ALLOW_SHARED_GEMINI_KEY and GEMINI_API_KEY else "disabled",
    )
    server = create_diagnostic_server()
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    logger.info("Health endpoint active on port %s.", PORT)

    if TELEGRAM_WEBHOOK_URL:
        try:
            register_telegram_webhook()
        except Exception:
            server.shutdown()
            raise
        server_thread.join()
        return

    call_telegram_api("deleteWebhook", {"drop_pending_updates": False})
    run_telegram_polling()


if __name__ == "__main__":
    main()
