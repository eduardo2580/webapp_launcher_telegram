import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
function getPort(): number {
  const portArgIndex = process.argv.indexOf('--port');
  if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const parsed = Number(process.argv[portArgIndex + 1]);
    if (parsed) return parsed;
  }
  // If explicitly specified in Discloud production env
  if (process.env.DISCLOUD_PORT) {
    return Number(process.env.DISCLOUD_PORT);
  }
  return 3000;
}

const PORT = getPort();
const isProd = process.env.NODE_ENV === 'production' || existsSync(path.resolve(__dirname, 'dist'));
function sanitizeTelegramToken(token?: string): string {
  const trimmed = (token || '').trim();
  if (!trimmed || trimmed.startsWith('replace-') || trimmed === 'your_token_here' || !trimmed.includes(':')) {
    return '';
  }
  return trimmed;
}

let BOT_TOKEN = sanitizeTelegramToken(process.env.TELEGRAM_BOT_TOKEN);

if (!BOT_TOKEN) {
  console.log('[Telegram Bot] TELEGRAM_BOT_TOKEN not provided in env. Ready for Discloud token.');
}

// Permissive CORS & Security Headers
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

app.use(express.json({ limit: '64kb' }));

// Core App preset list
const CORE_APPS = [
  {
    id: 'facebook',
    title: 'Facebook',
    url: 'https://m.facebook.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/facebook.png',
    category: 'Social' as const,
    isCustom: false,
  },
  {
    id: 'instagram',
    title: 'Instagram',
    url: 'https://www.instagram.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/instagram.png',
    category: 'Social' as const,
    isCustom: false,
  },
  {
    id: 'linkedin',
    title: 'LinkedIn',
    url: 'https://www.linkedin.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/linkedin.png',
    category: 'Social' as const,
    isCustom: false,
  },
  {
    id: 'wikipedia',
    title: 'Wikipedia',
    url: 'https://m.wikipedia.org',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wikipedia.png',
    category: 'Tools' as const,
    isCustom: false,
  },
  {
    id: 'youtube',
    title: 'YouTube',
    url: 'https://www.youtube.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/youtube.png',
    category: 'Media' as const,
    isCustom: false,
  },
  {
    id: 'x',
    title: 'X / Twitter',
    url: 'https://mobile.x.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/x.png',
    category: 'Social' as const,
    isCustom: false,
  },
];

export type AppCategory = 'Social' | 'Work' | 'Tools' | 'Media' | 'Other';
export type BotLanguage = 'en' | 'es' | 'pt';

export type TelegramBotApp = {
  id: string;
  title: string;
  url: string;
  category: AppCategory;
  chatId?: number;
  icon?: string;
  createdAt?: number;
};

export type InlineKeyboardButton = {
  text: string;
  url?: string;
  callback_data?: string;
};

export type TelegramBotMessage = {
  chat?: { id?: number; type?: 'private' | 'group' | 'supergroup' | 'channel' };
  message_id?: number;
  text?: string;
  date?: number;
  from?: { id?: number; first_name?: string; language_code?: string };
  reply_markup?: {
    inline_keyboard?: InlineKeyboardButton[][];
  };
};

export type TelegramBotUpdate = {
  update_id: number;
  message?: TelegramBotMessage;
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number; first_name?: string; language_code?: string };
    message?: TelegramBotMessage;
  };
};

const APP_CATEGORIES: AppCategory[] = ['Social', 'Work', 'Tools', 'Media', 'Other'];
const BOT_PAGE_SIZE = 8;
const BOT_DATA_DIR = path.resolve(process.env.BOT_DATA_DIR || path.join(__dirname, 'data'));
const BOT_APPS_PATH = path.join(BOT_DATA_DIR, 'telegram-apps.json');

let telegramAddedApps: TelegramBotApp[] = [];
let botAppsWriteQueue: Promise<void> = Promise.resolve();
const chatLanguages = new Map<number, BotLanguage>();
const pendingAppAdds = new Map<number, { messageId?: number; language: BotLanguage; tempUrl?: string; tempTitle?: string }>();

let telegramBotStatus: 'disabled' | 'starting' | 'running' | 'reconnecting' = BOT_TOKEN ? 'starting' : 'disabled';
let activeBotUsername: string | null = null;
let pollingAbortController: AbortController | null = null;

// Multi-language copy for the bot
export const BOT_COPY: Record<BotLanguage, {
  title: string;
  description: string;
  addApp: string;
  addPrompt: string;
  addCategoryPrompt: string;
  addInvalid: string;
  addDuplicate: string;
  addLimit: string;
  addFailed: string;
  addSuccess: string;
  addCancelled: string;
  addPrivateOnly: string;
  help: string;
  unknown: string;
  unsupported: string;
  nothingToCancel: string;
  searchPrompt: string;
  noMatches: string;
  matches: string;
  removeApp: string;
  removePrompt: string;
  removeEmpty: string;
  removed: string;
  back: string;
  language: string;
  languageSaved: string;
  page: string;
  apps: string;
  empty: string;
  all: string;
  categories: Record<AppCategory, string>;
  openInApp: string;
  seeAllApps: string;
}> = {
  pt: {
    title: '🚀 <b>Lançador de Aplicativos Web</b>',
    description: 'Escolha uma categoria e toque no aplicativo para abrir diretamente pelo Telegram:',
    addApp: '➕ Adicionar App',
    addPrompt: 'Envie um link (ex: <code>https://reddit.com</code>) para salvar no seu lançador.\nEnvie /cancel para cancelar.',
    addCategoryPrompt: '✨ <b>Link detectado:</b> <b>{title}</b>\n<code>{url}</code>\n\nEscolha em qual categoria deseja salvar:',
    addInvalid: 'Esse link não parece ser um endereço web válido. Envie um link com http/https ou envie /cancel.',
    addDuplicate: 'Esse link já está na sua lista de aplicativos.',
    addLimit: 'Sua lista de aplicativos atingiu o limite máximo.',
    addFailed: 'Não foi possível salvar o aplicativo. Tente novamente.',
    addSuccess: '✅ <b>{title}</b> foi adicionado à categoria <b>{category}</b>!',
    addCancelled: 'Ação de adicionar aplicativo cancelada.',
    addPrivateOnly: 'Abra uma conversa privada com o bot para adicionar aplicativos.',
    help: '📱 <b>Comandos do Lançador Web</b>\n\n' +
      '• <b>/start</b> ou <b>/apps</b> — Abre o lançador interativo com categorias e botões de acesso\n' +
      '• <b>/add &lt;link&gt;</b> — Salva um novo web app (ou apenas cole o link diretamente no chat!)\n' +
      '• <b>/search &lt;nome&gt;</b> ou <b>/open &lt;nome&gt;</b> — Busca e abre aplicativos com 1 toque\n' +
      '• <b>/remove</b> — Remove aplicativos adicionados por você\n' +
      '• <b>/language</b> — Altera o idioma do bot (Português, English, Español)\n' +
      '• <b>/cancel</b> — Cancela a ação em andamento\n\n' +
      '💡 <i>Dica: Você pode simplesmente colar qualquer link aqui na conversa e escolher a categoria!</i>',
    unknown: 'Olá! Posso abrir e organizar seus web apps diretamente no Telegram.\nEnvie <b>/apps</b> para ver seu lançador ou <b>/help</b> para ver todos os comandos.',
    unsupported: 'Por enquanto posso processar links web em texto. Envie /help para saber mais.',
    nothingToCancel: 'Não há nenhuma ação em andamento para cancelar.',
    searchPrompt: 'Digite o nome do aplicativo após /search (exemplo: <code>/search youtube</code>).',
    noMatches: 'Nenhum aplicativo encontrado com esse nome. Use /apps para ver todos.',
    matches: 'Resultados da busca:',
    removeApp: '🗑 Remover Apps',
    removePrompt: 'Toque no aplicativo que você deseja remover da sua lista:',
    removeEmpty: 'Você ainda não adicionou nenhum aplicativo personalizado.',
    removed: '✅ <b>{title}</b> foi removido do seu lançador.',
    back: '↩️ Voltar ao Lançador',
    language: 'Escolha o idioma / Choose your language:',
    languageSaved: 'Idioma atualizado com sucesso!',
    page: 'Página',
    apps: 'apps',
    empty: 'Nenhum app nesta categoria ainda.',
    all: 'Todos',
    categories: { Social: 'Social', Work: 'Trabalho', Tools: 'Ferramentas', Media: 'Mídia', Other: 'Outros' },
    openInApp: 'Abrir',
    seeAllApps: '📱 Ver Todos os Apps',
  },

  en: {
    title: '🚀 <b>Web App Launcher</b>',
    description: 'Choose a category and tap any app to open it directly in Telegram:',
    addApp: '➕ Add App',
    addPrompt: 'Send a link (e.g. <code>https://reddit.com</code>) to save to your launcher.\nSend /cancel to stop.',
    addCategoryPrompt: '✨ <b>Link detected:</b> <b>{title}</b>\n<code>{url}</code>\n\nChoose which category to save it under:',
    addInvalid: 'That does not look like a valid web link. Please send a valid link or send /cancel.',
    addDuplicate: 'That link is already in your app list.',
    addLimit: 'Your app list has reached the maximum limit.',
    addFailed: 'Could not save the app. Please try again.',
    addSuccess: '✅ <b>{title}</b> was added to <b>{category}</b>!',
    addCancelled: 'Action cancelled.',
    addPrivateOnly: 'Open a private chat with the bot to add apps.',
    help: '📱 <b>Web Launcher Commands</b>\n\n' +
      '• <b>/start</b> or <b>/apps</b> — Opens the interactive app launcher\n' +
      '• <b>/add &lt;link&gt;</b> — Adds a new web app (or simply paste any link directly!)\n' +
      '• <b>/search &lt;name&gt;</b> or <b>/open &lt;name&gt;</b> — Finds and opens apps with 1 tap\n' +
      '• <b>/remove</b> — Removes apps you added\n' +
      '• <b>/language</b> — Changes bot language (English, Português, Español)\n' +
      '• <b>/cancel</b> — Cancels the current action\n\n' +
      '💡 <i>Tip: You can simply paste any URL into this chat and pick a category!</i>',
    unknown: 'Hello! I organize and open your web apps directly in Telegram.\nSend <b>/apps</b> to open your launcher or <b>/help</b> for commands.',
    unsupported: 'I can only process text links right now. Send /help for details.',
    nothingToCancel: 'There is no active action to cancel.',
    searchPrompt: 'Type the app name after /search (e.g. <code>/search youtube</code>).',
    noMatches: 'No matching apps found. Use /apps to browse your launcher.',
    matches: 'Search results:',
    removeApp: '🗑 Remove Apps',
    removePrompt: 'Tap the app you want to remove:',
    removeEmpty: 'You have not added any custom apps yet.',
    removed: '✅ <b>{title}</b> was removed from your launcher.',
    back: '↩️ Back to Launcher',
    language: 'Choose your language:',
    languageSaved: 'Language updated successfully!',
    page: 'Page',
    apps: 'apps',
    empty: 'No apps in this category yet.',
    all: 'All',
    categories: { Social: 'Social', Work: 'Work', Tools: 'Tools', Media: 'Media', Other: 'Other' },
    openInApp: 'Open',
    seeAllApps: '📱 View All Apps',
  },
  es: {
    title: '🚀 <b>Lanzador de Aplicaciones Web</b>',
    description: 'Elige una categoría y toca una aplicación para abrirla directamente en Telegram:',
    addApp: '➕ Agregar App',
    addPrompt: 'Envía un enlace (ej: <code>https://reddit.com</code>) para guardarlo en tu lanzador.\nEnvía /cancel para cancelar.',
    addCategoryPrompt: '✨ <b>Enlace detectado:</b> <b>{title}</b>\n<code>{url}</code>\n\nElige la categoría en la que deseas guardarlo:',
    addInvalid: 'Ese enlace no parece ser válido. Envía un enlace válido o envía /cancel.',
    addDuplicate: 'Ese enlace ya está en tu lista de aplicaciones.',
    addLimit: 'Tu lista de aplicaciones ha alcanzado el límite máximo.',
    addFailed: 'No se pudo guardar la aplicación. Inténtalo de nuevo.',
    addSuccess: '✅ <b>{title}</b> se agregó a la categoría <b>{category}</b>!',
    addCancelled: 'Acción cancelada.',
    addPrivateOnly: 'Abre un chat privado con el bot para agregar aplicaciones.',
    help: '📱 <b>Comandos del Lanzador Web</b>\n\n' +
      '• <b>/start</b> o <b>/apps</b> — Abre el lanzador interactivo\n' +
      '• <b>/add &lt;link&gt;</b> — Guarda una nueva aplicación (¡o pega el enlace aquí directamente!)\n' +
      '• <b>/search &lt;nombre&gt;</b> o <b>/open &lt;nombre&gt;</b> — Busca y abre aplicaciones en 1 toque\n' +
      '• <b>/remove</b> — Quita aplicaciones agregadas por ti\n' +
      '• <b>/language</b> — Cambia el idioma del bot\n' +
      '• <b>/cancel</b> — Cancela la acción en curso\n\n' +
      '💡 <i>Consejo: ¡Puedes pegar cualquier enlace en esta conversación y elegir la categoría!</i>',
    unknown: '¡Hola! Organizo y abro tus aplicaciones web en Telegram.\nEnvía <b>/apps</b> para ver el lanzador o <b>/help</b> para ver los comandos.',
    unsupported: 'Por ahora solo puedo procesar enlaces de texto. Envía /help para ver detalles.',
    nothingToCancel: 'No hay ninguna acción en curso para cancelar.',
    searchPrompt: 'Escribe el nombre de la app después de /search (ejemplo: <code>/search youtube</code>).',
    noMatches: 'No se encontraron aplicaciones con ese nombre. Usa /apps para ver todas.',
    matches: 'Resultados de búsqueda:',
    removeApp: '🗑 Quitar Apps',
    removePrompt: 'Toca la aplicación que deseas quitar de tu lista:',
    removeEmpty: 'Aún no has agregado aplicaciones personalizadas.',
    removed: '✅ <b>{title}</b> fue quitado de tu lanzador.',
    back: '↩️ Volver al Lanzador',
    language: 'Elige tu idioma / Choose your language:',
    languageSaved: '¡Idioma actualizado con éxito!',
    page: 'Página',
    apps: 'apps',
    empty: 'No hay aplicaciones en esta categoría.',
    all: 'Todas',
    categories: { Social: 'Social', Work: 'Trabajo', Tools: 'Herramientas', Media: 'Medios', Other: 'Otros' },
    openInApp: 'Abrir',
    seeAllApps: '📱 Ver Todas las Apps',
  },

};

// Known popular domain friendly titles
const KNOWN_DOMAINS: Record<string, { title: string; category: AppCategory }> = {
  'youtube.com': { title: 'YouTube', category: 'Media' },
  'youtu.be': { title: 'YouTube', category: 'Media' },
  'instagram.com': { title: 'Instagram', category: 'Social' },
  'facebook.com': { title: 'Facebook', category: 'Social' },
  'linkedin.com': { title: 'LinkedIn', category: 'Social' },
  'reddit.com': { title: 'Reddit', category: 'Social' },
  'github.com': { title: 'GitHub', category: 'Work' },
  'gitlab.com': { title: 'GitLab', category: 'Work' },
  'twitter.com': { title: 'X / Twitter', category: 'Social' },
  'x.com': { title: 'X / Twitter', category: 'Social' },
  'notion.so': { title: 'Notion', category: 'Work' },
  'figma.com': { title: 'Figma', category: 'Work' },
  'spotify.com': { title: 'Spotify', category: 'Media' },
  'netflix.com': { title: 'Netflix', category: 'Media' },
  'discord.com': { title: 'Discord', category: 'Social' },
  'twitch.tv': { title: 'Twitch', category: 'Media' },
  'chatgpt.com': { title: 'ChatGPT', category: 'Tools' },
  'openai.com': { title: 'OpenAI', category: 'Tools' },
  'wikipedia.org': { title: 'Wikipedia', category: 'Tools' },
  'google.com': { title: 'Google', category: 'Tools' },
  'canva.com': { title: 'Canva', category: 'Work' },
  'trello.com': { title: 'Trello', category: 'Work' },
  'medium.com': { title: 'Medium', category: 'Media' },
};

function cleanDomainTitle(hostname: string): string {
  const cleanHost = hostname.replace(/^www\./i, '').toLowerCase();
  for (const [domain, info] of Object.entries(KNOWN_DOMAINS)) {
    if (cleanHost === domain || cleanHost.endsWith('.' + domain)) {
      return info.title;
    }
  }
  const parts = cleanHost.split('.');
  const name = parts.length > 2 && (parts[1] === 'com' || parts[1] === 'co' || parts[1] === 'org')
    ? parts[0]
    : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function guessCategory(hostname: string): AppCategory {
  const cleanHost = hostname.replace(/^www\./i, '').toLowerCase();
  for (const [domain, info] of Object.entries(KNOWN_DOMAINS)) {
    if (cleanHost === domain || cleanHost.endsWith('.' + domain)) {
      return info.category;
    }
  }
  return 'Other';
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] || character);
}

function parseUrlFromText(text: string): { url: string; title?: string } | null {
  const trimmed = text.trim();
  // Check for URL pattern
  const match = trimmed.match(/(https?:\/\/[^\s]+|[a-zA-Z0-9][-a-zA-Z0-9]{0,62}\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/i);
  if (!match) return null;

  let rawUrl = match[1];
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = 'https://' + rawUrl;
  }

  try {
    const parsed = new URL(rawUrl);
    if (!parsed.hostname || parsed.hostname.length < 3 || parsed.username || parsed.password) {
      return null;
    }

    // Check if user provided title before or after URL
    const leftover = trimmed.replace(match[0], '').replace(/^\/add\s*/i, '').trim();
    return {
      url: parsed.toString(),
      title: leftover && leftover.length < 60 ? leftover : undefined,
    };
  } catch {
    return null;
  }
}

// Data persistence
async function loadTelegramAddedApps(): Promise<void> {
  try {
    const content = await readFile(BOT_APPS_PATH, 'utf8');
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      telegramAddedApps = parsed;
      return;
    }
    if (parsed && Array.isArray(parsed.apps)) {
      telegramAddedApps = parsed.apps;
      if (parsed.languages && typeof parsed.languages === 'object') {
        for (const [chatId, lang] of Object.entries(parsed.languages)) {
          if (lang === 'en' || lang === 'es' || lang === 'pt') {
            chatLanguages.set(Number(chatId), lang as BotLanguage);
          }
        }
      }
    }
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'ENOENT') return;
    console.warn('[Telegram Bot] Load apps notice:', error);
  }
}

function persistTelegramAddedApps(): Promise<void> {
  const write = botAppsWriteQueue.then(async () => {
    await mkdir(BOT_DATA_DIR, { recursive: true });
    const temporaryPath = `${BOT_APPS_PATH}.${randomUUID()}.tmp`;
    const data = {
      apps: telegramAddedApps,
      languages: Object.fromEntries(chatLanguages),
    };
    await writeFile(temporaryPath, JSON.stringify(data, null, 2), 'utf8');
    await rename(temporaryPath, BOT_APPS_PATH);
  });
  botAppsWriteQueue = write.catch(() => undefined);
  return write;
}

function getChatLanguage(chatId: number, telegramLanguage?: string): BotLanguage {
  return chatLanguages.get(chatId) || (telegramLanguage?.startsWith('pt') ? 'pt' : telegramLanguage?.startsWith('es') ? 'es' : 'en');
}

function getBotApps(chatId: number): TelegramBotApp[] {
  const seen = new Set<string>();
  const combined = [
    ...CORE_APPS,
    ...telegramAddedApps.filter((item) => item.chatId === undefined || item.chatId === chatId),
  ];
  return combined.filter((item) => {
    const key = item.url.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getChatAddedApps(chatId: number): TelegramBotApp[] {
  return telegramAddedApps.filter((item) => item.chatId === undefined || item.chatId === chatId);
}

// Menu Renderers
export function renderBotAppMenu(
  chatId: number,
  language: BotLanguage,
  selectedCategory: AppCategory | 'All',
  requestedPage: number,
) {
  const copy = BOT_COPY[language];
  const apps = getBotApps(chatId);
  const categories: Array<AppCategory | 'All'> = [
    'All',
    ...APP_CATEGORIES.filter((cat) => apps.some((app) => app.category === cat)),
  ];
  const validCategory = categories.includes(selectedCategory) ? selectedCategory : 'All';
  const filteredApps = validCategory === 'All'
    ? apps
    : apps.filter((app) => app.category === validCategory);
  
  const pageCount = Math.max(1, Math.ceil(filteredApps.length / BOT_PAGE_SIZE));
  const page = Math.max(0, Math.min(Math.floor(requestedPage) || 0, pageCount - 1));
  const visibleApps = filteredApps.slice(page * BOT_PAGE_SIZE, (page + 1) * BOT_PAGE_SIZE);
  const selectedLabel = validCategory === 'All' ? copy.all : copy.categories[validCategory];

  const text = [
    copy.title,
    copy.description,
    '',
    `🏷️ <b>${escapeHtml(selectedLabel)}</b> · ${filteredApps.length} ${copy.apps} · ${copy.page} ${page + 1}/${pageCount}`,
    ...(visibleApps.length ? [] : ['', `<i>${copy.empty}</i>`]),
  ].join('\n');

  const keyboard: InlineKeyboardButton[][] = [];

  // Category filter buttons (row of 3)
  for (let i = 0; i < categories.length; i += 3) {
    keyboard.push(
      categories.slice(i, i + 3).map((cat) => ({
        text: (cat === validCategory ? '● ' : '') + (cat === 'All' ? copy.all : copy.categories[cat]),
        callback_data: `launcher:category:${cat}`,
      }))
    );
  }

  // App launch buttons (2 per row) - uses direct URL button so Telegram opens the web app with device connection!
  for (let i = 0; i < visibleApps.length; i += 2) {
    keyboard.push(
      visibleApps.slice(i, i + 2).map((app) => ({
        text: `🌐 ${app.title.slice(0, 24)}`,
        url: app.url,
      }))
    );
  }

  // Pagination buttons
  if (pageCount > 1) {
    keyboard.push([
      ...(page > 0 ? [{ text: '◀️', callback_data: `launcher:page:${validCategory}:${page - 1}` }] : []),
      { text: `${page + 1}/${pageCount}`, callback_data: `launcher:page:${validCategory}:${page}` },
      ...(page + 1 < pageCount ? [{ text: '▶️', callback_data: `launcher:page:${validCategory}:${page + 1}` }] : []),
    ]);
  }

  // Action buttons
  keyboard.push([
    { text: copy.addApp, callback_data: 'launcher:add' },
    { text: '🔍 ' + copy.matches.replace(':', ''), callback_data: 'launcher:search' },
  ]);

  const bottomRow: InlineKeyboardButton[] = [
    { text: '🌐 ' + copy.language.split('/')[0].trim(), callback_data: 'launcher:languages' },
  ];
  if (getChatAddedApps(chatId).length > 0) {
    bottomRow.push({ text: copy.removeApp, callback_data: 'launcher:remove-page:0' });
  }
  bottomRow.push({ text: 'ℹ️ Ajuda', callback_data: 'launcher:help' });
  keyboard.push(bottomRow);

  return { text, reply_markup: { inline_keyboard: keyboard }, parse_mode: 'HTML' };
}

export function renderBotRemoveMenu(chatId: number, language: BotLanguage, requestedPage: number, notice?: string) {
  const copy = BOT_COPY[language];
  const apps = getChatAddedApps(chatId);
  if (!apps.length) {
    return {
      text: [notice, copy.removeEmpty].filter(Boolean).join('\n\n'),
      reply_markup: {
        inline_keyboard: [[{ text: copy.back, callback_data: 'launcher:category:All' }]],
      },
      parse_mode: 'HTML',
    };
  }
  const pageCount = Math.ceil(apps.length / BOT_PAGE_SIZE);
  const page = Math.max(0, Math.min(Math.floor(requestedPage) || 0, pageCount - 1));
  const start = page * BOT_PAGE_SIZE;
  const keyboard: InlineKeyboardButton[][] = apps
    .slice(start, start + BOT_PAGE_SIZE)
    .map((item) => [{
      text: `🗑 ${item.title.slice(0, 36)}`,
      callback_data: `launcher:remove:${item.id}`,
    }]);

  if (pageCount > 1) {
    keyboard.push([
      ...(page > 0 ? [{ text: '◀️', callback_data: `launcher:remove-page:${page - 1}` }] : []),
      { text: `${page + 1}/${pageCount}`, callback_data: `launcher:remove-page:${page}` },
      ...(page + 1 < pageCount ? [{ text: '▶️', callback_data: `launcher:remove-page:${page + 1}` }] : []),
    ]);
  }
  keyboard.push([{ text: copy.back, callback_data: 'launcher:category:All' }]);

  return {
    text: [notice, copy.removePrompt].filter(Boolean).join('\n\n'),
    reply_markup: { inline_keyboard: keyboard },
    parse_mode: 'HTML',
  };
}

export function renderBotLanguageMenu(language: BotLanguage) {
  const copy = BOT_COPY[language];
  return {
    text: `🌐 <b>${copy.language}</b>`,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🇧🇷 Português', callback_data: 'launcher:language:pt' },
          { text: '🇺🇸 English', callback_data: 'launcher:language:en' },
          { text: '🇪🇸 Español', callback_data: 'launcher:language:es' },
        ],
        [{ text: copy.back, callback_data: 'launcher:category:All' }],
      ],
    },
  };
}

export function renderBotSearchResults(chatId: number, query: string, language: BotLanguage) {
  const copy = BOT_COPY[language];
  const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = normalize(query.trim()).slice(0, 100);

  const results = getBotApps(chatId).filter((app) => {
    const t = normalize(app.title);
    const u = normalize(app.url);
    return t.includes(q) || u.includes(q);
  });

  if (!results.length) {
    return {
      text: `🔍 <b>${copy.matches} "${escapeHtml(query)}"</b>\n\n<i>${copy.noMatches}</i>`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: copy.back, callback_data: 'launcher:category:All' }]],
      },
    };
  }

  const keyboard: InlineKeyboardButton[][] = results.slice(0, 8).map((app) => [{
    text: `🌐 ${app.title} (${app.category})`,
    url: app.url,
  }]);
  keyboard.push([{ text: copy.back, callback_data: 'launcher:category:All' }]);

  return {
    text: `🔍 <b>${copy.matches} "${escapeHtml(query)}"</b> (${results.length})\nToque para abrir diretamente:`,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keyboard },
  };
}

// Memory buffer to capture outgoing messages for simulated sessions
type SimulatedMessageResult = {
  message_id: number;
  chat_id: number;
  text: string;
  parse_mode?: string;
  reply_markup?: { inline_keyboard?: InlineKeyboardButton[][] };
  type: 'sendMessage' | 'editMessageText' | 'answerCallbackQuery';
};

const simulatorSessions = new Map<number, { messages: SimulatedMessageResult[]; nextMessageId: number }>();

function getSimulatorSession(chatId: number) {
  let session = simulatorSessions.get(chatId);
  if (!session) {
    session = { messages: [], nextMessageId: 100 };
    simulatorSessions.set(chatId, session);
  }
  return session;
}

// Telegram API dispatcher
async function callTelegramApi<T = unknown>(
  method: string,
  payload: Record<string, unknown>,
  simulatedContext?: { chatId: number }
): Promise<T> {
  const targetChatId = Number(payload.chat_id) || simulatedContext?.chatId;

  // If this is a simulated chat session (or token not set and simulator context exists)
  if (targetChatId && (targetChatId < 0 || !BOT_TOKEN)) {
    const session = getSimulatorSession(targetChatId);
    if (method === 'sendMessage') {
      const msgId = ++session.nextMessageId;
      const res: SimulatedMessageResult = {
        message_id: msgId,
        chat_id: targetChatId,
        text: String(payload.text || ''),
        parse_mode: String(payload.parse_mode || 'HTML'),
        reply_markup: payload.reply_markup as { inline_keyboard?: InlineKeyboardButton[][] },
        type: 'sendMessage',
      };
      session.messages.push(res);
      return { ok: true, result: res } as T;
    }
    if (method === 'editMessageText') {
      const msgId = Number(payload.message_id) || session.nextMessageId;
      const res: SimulatedMessageResult = {
        message_id: msgId,
        chat_id: targetChatId,
        text: String(payload.text || ''),
        parse_mode: String(payload.parse_mode || 'HTML'),
        reply_markup: payload.reply_markup as { inline_keyboard?: InlineKeyboardButton[][] },
        type: 'editMessageText',
      };
      session.messages.push(res);
      return { ok: true, result: res } as T;
    }
    if (method === 'answerCallbackQuery') {
      return { ok: true, result: true } as T;
    }
    return { ok: true } as T;
  }

  // Real Telegram Bot API call
  if (!BOT_TOKEN) {
    throw new Error('Telegram Bot token is not configured.');
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(method === 'getUpdates' ? 35_000 : 15_000),
  });

  const result = await response.json() as { ok: boolean; result?: T; description?: string };
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram API ${method} failed (${response.status}): ${result.description || 'Unknown error'}`);
  }
  return result.result as T;
}

// Master Telegram Update Handler (Processes all messages and callback buttons)
export async function handleTelegramUpdate(update: TelegramBotUpdate, simulatedContext?: { chatId: number }): Promise<void> {
  // 1. Handle Callback Query (Inline Keyboard Buttons)
  const callback = update.callback_query;
  if (callback) {
    if (!callback.id) return;
    const data = callback.data || '';
    const chat = callback.message?.chat;
    const chatId = chat?.id ?? simulatedContext?.chatId ?? -1;
    const messageId = callback.message?.message_id ?? 1;
    const language = getChatLanguage(chatId, callback.from?.language_code);
    const copy = BOT_COPY[language];

    await callTelegramApi('answerCallbackQuery', { callback_query_id: callback.id }, simulatedContext);

    // Callback: Switch Category
    if (data.startsWith('launcher:category:')) {
      const cat = data.replace('launcher:category:', '') as AppCategory | 'All';
      const menu = renderBotAppMenu(chatId, language, cat, 0);
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: menu.text,
        parse_mode: menu.parse_mode,
        reply_markup: menu.reply_markup,
      }, simulatedContext);
      return;
    }

    // Callback: Pagination
    if (data.startsWith('launcher:page:')) {
      const parts = data.replace('launcher:page:', '').split(':');
      const cat = (parts[0] || 'All') as AppCategory | 'All';
      const page = Number(parts[1]) || 0;
      const menu = renderBotAppMenu(chatId, language, cat, page);
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: menu.text,
        parse_mode: menu.parse_mode,
        reply_markup: menu.reply_markup,
      }, simulatedContext);
      return;
    }

    // Callback: Add App
    if (data === 'launcher:add') {
      pendingAppAdds.set(chatId, { messageId, language });
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: copy.addPrompt,
        parse_mode: 'HTML',
        reply_markup: { force_reply: true },
      }, simulatedContext);
      return;
    }

    // Callback: Save app to category from detected link
    if (data.startsWith('launcher:savecat:')) {
      const pending = pendingAppAdds.get(chatId);
      const parts = data.replace('launcher:savecat:', '').split(':');
      const chosenCat = parts[0] as AppCategory;
      const url = pending?.tempUrl || decodeURIComponent(parts[1] || '');
      const title = pending?.tempTitle || decodeURIComponent(parts[2] || cleanDomainTitle(new URL(url).hostname));

      if (url) {
        const newApp: TelegramBotApp = {
          id: `telegram-${randomUUID()}`,
          title,
          url,
          category: chosenCat,
          chatId,
          createdAt: Date.now(),
        };
        telegramAddedApps = [...telegramAddedApps, newApp];
        void persistTelegramAddedApps();
        pendingAppAdds.delete(chatId);

        const successText = copy.addSuccess
          .replace('{title}', escapeHtml(title))
          .replace('{category}', copy.categories[chosenCat] || chosenCat);

        await callTelegramApi('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: successText + '\n\n' + copy.description,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: `🌐 ${copy.openInApp} ${title}`, url: url }],
              [{ text: copy.seeAllApps, callback_data: 'launcher:category:All' }],
            ],
          },
        }, simulatedContext);
      }
      return;
    }

    // Callback: Search Prompt
    if (data === 'launcher:search') {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: copy.searchPrompt,
        parse_mode: 'HTML',
      }, simulatedContext);
      return;
    }

    // Callback: Remove Menu & Pagination
    if (data.startsWith('launcher:remove-page:')) {
      const page = Number(data.replace('launcher:remove-page:', '')) || 0;
      const menu = renderBotRemoveMenu(chatId, language, page);
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: menu.text,
        parse_mode: menu.parse_mode,
        reply_markup: menu.reply_markup,
      }, simulatedContext);
      return;
    }

    // Callback: Remove specific app
    if (data.startsWith('launcher:remove:')) {
      const appId = data.replace('launcher:remove:', '');
      const index = telegramAddedApps.findIndex((a) => a.id === appId && (a.chatId === undefined || a.chatId === chatId));
      if (index >= 0) {
        const [removed] = telegramAddedApps.splice(index, 1);
        void persistTelegramAddedApps();
        const notice = copy.removed.replace('{title}', escapeHtml(removed.title));
        const menu = renderBotRemoveMenu(chatId, language, 0, notice);
        await callTelegramApi('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: menu.text,
          parse_mode: menu.parse_mode,
          reply_markup: menu.reply_markup,
        }, simulatedContext);
      }
      return;
    }

    // Callback: Language picker
    if (data === 'launcher:languages') {
      const menu = renderBotLanguageMenu(language);
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: menu.text,
        parse_mode: menu.parse_mode,
        reply_markup: menu.reply_markup,
      }, simulatedContext);
      return;
    }

    // Callback: Set Language
    if (data.startsWith('launcher:language:')) {
      const newLang = data.replace('launcher:language:', '') as BotLanguage;
      chatLanguages.set(chatId, newLang);
      void persistTelegramAddedApps();
      const menu = renderBotAppMenu(chatId, newLang, 'All', 0);
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: menu.text,
        parse_mode: menu.parse_mode,
        reply_markup: menu.reply_markup,
      }, simulatedContext);
      return;
    }

    // Callback: Help
    if (data === 'launcher:help') {
      await callTelegramApi('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: copy.help,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: copy.back, callback_data: 'launcher:category:All' }]],
        },
      }, simulatedContext);
      return;
    }
    return;
  }

  // 2. Handle Text Messages
  const message = update.message;
  if (!message || typeof message.text !== 'string') return;

  const chatId = message.chat?.id ?? simulatedContext?.chatId ?? -1;
  const rawText = message.text.trim();
  const language = getChatLanguage(chatId, message.from?.language_code);
  const copy = BOT_COPY[language];

  // Parse command & arguments
  const command = rawText.split(/\s+/)[0].split('@')[0].toLowerCase();
  const commandArgs = rawText.slice(command.length).trim();

  // Cancel action
  if (command === '/cancel' || command === '/cancelar') {
    if (pendingAppAdds.has(chatId)) {
      pendingAppAdds.delete(chatId);
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: copy.addCancelled,
      }, simulatedContext);
    } else {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: copy.nothingToCancel,
      }, simulatedContext);
    }
    return;
  }

  // Start / Apps / Launcher
  if (['/start', '/apps', '/launcher', '/iniciar'].includes(command)) {
    pendingAppAdds.delete(chatId);
    const menu = renderBotAppMenu(chatId, language, 'All', 0);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: menu.text,
      parse_mode: menu.parse_mode,
      reply_markup: menu.reply_markup,
    }, simulatedContext);
    return;
  }

  // Help command
  if (['/help', '/ajuda', '/ayuda'].includes(command)) {
    pendingAppAdds.delete(chatId);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: copy.help,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: copy.seeAllApps, callback_data: 'launcher:category:All' }]],
      },
    }, simulatedContext);
    return;
  }

  // Language command
  if (['/language', '/idioma'].includes(command)) {
    const menu = renderBotLanguageMenu(language);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: menu.text,
      parse_mode: menu.parse_mode,
      reply_markup: menu.reply_markup,
    }, simulatedContext);
    return;
  }

  // Search or Open command
  if (['/search', '/buscar', '/open', '/abrir'].includes(command)) {
    if (!commandArgs) {
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: copy.searchPrompt,
        parse_mode: 'HTML',
      }, simulatedContext);
      return;
    }
    const results = renderBotSearchResults(chatId, commandArgs, language);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: results.text,
      parse_mode: results.parse_mode,
      reply_markup: results.reply_markup,
    }, simulatedContext);
    return;
  }

  // Remove command
  if (['/remove', '/remover', '/delete', '/excluir'].includes(command)) {
    const menu = renderBotRemoveMenu(chatId, language, 0);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: menu.text,
      parse_mode: menu.parse_mode,
      reply_markup: menu.reply_markup,
    }, simulatedContext);
    return;
  }

  // Check if text is a direct URL or contains a URL (e.g. user pasted https://github.com or /add https://...)
  const parsedUrl = parseUrlFromText(rawText);
  if (parsedUrl) {
    const hostname = new URL(parsedUrl.url).hostname;
    const title = parsedUrl.title || cleanDomainTitle(hostname);
    const suggestedCat = guessCategory(hostname);

    // Save temporary details in pending map
    pendingAppAdds.set(chatId, {
      language,
      tempUrl: parsedUrl.url,
      tempTitle: title,
    });

    const categoryText = copy.addCategoryPrompt
      .replace('{title}', escapeHtml(title))
      .replace('{url}', escapeHtml(parsedUrl.url));

    const encodedUrl = encodeURIComponent(parsedUrl.url);
    const encodedTitle = encodeURIComponent(title);

    // Present category buttons to save with 1 tap
    const categoryButtons: InlineKeyboardButton[][] = [
      [
        { text: (suggestedCat === 'Social' ? '⭐ ' : '') + copy.categories.Social, callback_data: `launcher:savecat:Social:${encodedUrl}:${encodedTitle}` },
        { text: (suggestedCat === 'Work' ? '⭐ ' : '') + copy.categories.Work, callback_data: `launcher:savecat:Work:${encodedUrl}:${encodedTitle}` },
      ],
      [
        { text: (suggestedCat === 'Tools' ? '⭐ ' : '') + copy.categories.Tools, callback_data: `launcher:savecat:Tools:${encodedUrl}:${encodedTitle}` },
        { text: (suggestedCat === 'Media' ? '⭐ ' : '') + copy.categories.Media, callback_data: `launcher:savecat:Media:${encodedUrl}:${encodedTitle}` },
        { text: (suggestedCat === 'Other' ? '⭐ ' : '') + copy.categories.Other, callback_data: `launcher:savecat:Other:${encodedUrl}:${encodedTitle}` },
      ],
      [
        { text: '❌ Cancelar', callback_data: 'launcher:category:All' }
      ]
    ];

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: categoryText,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: categoryButtons },
    }, simulatedContext);
    return;
  }

  // If text is not a command and not a URL, check if it's a search term (e.g. user typed "youtube" or "facebook")
  const allApps = getBotApps(chatId);
  const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = normalize(rawText);
  const matching = allApps.filter((a) => normalize(a.title).includes(q) || normalize(a.url).includes(q));

  if (matching.length > 0 && rawText.length >= 2) {
    const results = renderBotSearchResults(chatId, rawText, language);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: results.text,
      parse_mode: results.parse_mode,
      reply_markup: results.reply_markup,
    }, simulatedContext);
    return;
  }

  // Fallback / Unknown message
  await callTelegramApi('sendMessage', {
    chat_id: chatId,
    text: copy.unknown,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[{ text: copy.seeAllApps, callback_data: 'launcher:category:All' }]],
    },
  }, simulatedContext);
}

// Background long polling for real Telegram bot
async function startTelegramPolling() {
  if (!BOT_TOKEN) return;

  pollingAbortController?.abort();
  pollingAbortController = new AbortController();
  const { signal } = pollingAbortController;

  telegramBotStatus = 'starting';
  console.log('[Telegram Bot] Initializing polling with token...');

  // Verify token with getMe
  try {
    const botInfo = await callTelegramApi<{ username?: string }>('getMe', {});
    activeBotUsername = botInfo.username || 'Bot';
    telegramBotStatus = 'running';
    console.log(`[Telegram Bot] Connected successfully as @${activeBotUsername}!`);
  } catch (err) {
    telegramBotStatus = 'reconnecting';
    console.warn('[Telegram Bot] getMe failed:', err);
  }

  // Register bot commands
  try {
    await callTelegramApi('deleteWebhook', { drop_pending_updates: false });
    const commandsPt = [
      { command: 'start', description: 'Abrir lançador de aplicativos' },
      { command: 'apps', description: 'Ver aplicativos salvos' },
      { command: 'add', description: 'Adicionar novo aplicativo' },
      { command: 'search', description: 'Buscar aplicativo por nome' },
      { command: 'remove', description: 'Remover aplicativo' },
      { command: 'language', description: 'Alterar idioma do bot' },
      { command: 'help', description: 'Ver ajuda e instruções' },
    ];
    await callTelegramApi('setMyCommands', { commands: commandsPt });
  } catch (err) {
    console.warn('[Telegram Bot] setMyCommands notice:', err);
  }

  let offset = 0;
  let retryDelay = 2000;

  while (!signal.aborted) {
    try {
      const updates = await callTelegramApi<TelegramBotUpdate[]>('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message', 'callback_query'],
      });

      if (Array.isArray(updates)) {
        for (const update of updates) {
          offset = Math.max(offset, update.update_id + 1);
          void handleTelegramUpdate(update).catch((e) => console.warn('[Telegram Bot] Update error:', e));
        }
      }
      telegramBotStatus = 'running';
      retryDelay = 2000;
    } catch (error) {
      if (signal.aborted) break;
      telegramBotStatus = 'reconnecting';
      console.warn('[Telegram Bot] Polling warning, retrying in', retryDelay, 'ms...');
      await new Promise((r) => setTimeout(r, retryDelay));
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
}

// REST API Endpoints

// 1. Health check & status
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    env: isProd ? 'production' : 'development',
    telegramBot: {
      status: telegramBotStatus,
      configured: Boolean(BOT_TOKEN),
      username: activeBotUsername,
    },
  });
});

// 2. Bot Status & Info
app.get('/api/bot/status', (req: Request, res: Response) => {
  const host = req.get('host') || `localhost:${PORT}`;
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const webhookUrl = `${protocol}://${host}/api/telegram/webhook`;
  const mem = process.memoryUsage();

  res.status(200).json({
    status: 'ok',
    botStatus: telegramBotStatus,
    configured: Boolean(BOT_TOKEN),
    username: activeBotUsername,
    webhookUrl,
    totalApps: CORE_APPS.length + telegramAddedApps.length,
    coreAppsCount: CORE_APPS.length,
    customAppsCount: telegramAddedApps.length,
    apps: getBotApps(-1),
    discloud: {
      provider: 'Discloud (discloud.com)',
      type: 'bot',
      id: 'webapp-launcher',
      ramLimitMB: 100,
      heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      rssMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      uptimeSeconds: Math.floor(process.uptime()),
    },
  });
});

// 3. Update / Test Bot Token
app.post('/api/bot/token', async (req: Request, res: Response) => {
  const { token } = req.body || {};
  if (!token || typeof token !== 'string') {
    res.status(400).json({ status: 'error', message: 'Token is required.' });
    return;
  }

  const cleanToken = token.trim();
  try {
    const testRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const data = await testRes.json() as { ok: boolean; result?: { username?: string }; description?: string };
    if (!data.ok || !data.result) {
      res.status(400).json({ status: 'error', message: data.description || 'Invalid Telegram bot token.' });
      return;
    }

    BOT_TOKEN = cleanToken;
    activeBotUsername = data.result.username || null;
    telegramBotStatus = 'running';
    void startTelegramPolling();

    res.status(200).json({
      status: 'ok',
      username: activeBotUsername,
      message: `Bot @${activeBotUsername} successfully verified and activated!`,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: String(err) });
  }
});

// 4. Web Chat Simulator: Send Message
app.post('/api/bot/message', async (req: Request, res: Response) => {
  const { text, chatId = -1, language = 'pt' } = req.body || {};
  if (!text) {
    res.status(400).json({ status: 'error', message: 'Text is required.' });
    return;
  }

  const session = getSimulatorSession(chatId);
  const initialLength = session.messages.length;

  const simulatedUpdate: TelegramBotUpdate = {
    update_id: Date.now(),
    message: {
      message_id: ++session.nextMessageId,
      chat: { id: chatId, type: 'private' },
      text: String(text),
      date: Math.floor(Date.now() / 1000),
      from: { id: 999999, first_name: 'Usuário', language_code: language },
    },
  };

  try {
    await handleTelegramUpdate(simulatedUpdate, { chatId });
    const newMessages = session.messages.slice(initialLength);
    res.status(200).json({
      status: 'ok',
      messages: newMessages,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: String(err) });
  }
});

// 5. Web Chat Simulator: Send Callback Query (Button Tap)
app.post('/api/bot/callback', async (req: Request, res: Response) => {
  const { data, messageId = 1, chatId = -1, language = 'pt' } = req.body || {};
  if (!data) {
    res.status(400).json({ status: 'error', message: 'Data is required.' });
    return;
  }

  const session = getSimulatorSession(chatId);
  const initialLength = session.messages.length;

  const simulatedUpdate: TelegramBotUpdate = {
    update_id: Date.now(),
    callback_query: {
      id: `query_${Date.now()}`,
      data: String(data),
      from: { id: 999999, first_name: 'Usuário', language_code: language },
      message: {
        message_id: messageId,
        chat: { id: chatId, type: 'private' },
        date: Math.floor(Date.now() / 1000),
      },
    },
  };

  try {
    await handleTelegramUpdate(simulatedUpdate, { chatId });
    const newMessages = session.messages.slice(initialLength);
    res.status(200).json({
      status: 'ok',
      messages: newMessages,
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: String(err) });
  }
});

// 6. Apps API for offline PWA caching
app.get('/api/apps', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  res.status(200).json({
    status: 'ok',
    version: '2.0.0',
    syncedAt: Date.now(),
    source: 'server',
    apps: getBotApps(-1),
  });
});

app.post('/api/apps/sync', (req: Request, res: Response) => {
  const { apps } = req.body || {};
  if (Array.isArray(apps) && apps.length > 0) {
    telegramAddedApps = apps.filter((a) => a.isCustom || a.id.startsWith('telegram-'));
    void persistTelegramAddedApps();
  }
  res.status(200).json({
    status: 'ok',
    syncedAt: Date.now(),
    count: getBotApps(-1).length,
  });
});

// 7. Real Telegram Bot Webhook endpoint
app.post('/api/telegram/webhook', async (req: Request, res: Response) => {
  res.status(200).send('OK');
  if (!BOT_TOKEN) return;

  const update = req.body as TelegramBotUpdate;
  if (!update) return;

  void handleTelegramUpdate(update).catch((error: unknown) => {
    const details = error instanceof Error ? error.message : 'Unknown Telegram webhook error.';
    console.warn('[Telegram Webhook] Failed to process update:', details);
  });
});

// Network info diagnostics endpoint
app.get('/api/network-info', (req: Request, res: Response) => {
  const host = req.get('host') || `localhost:${PORT}`;
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';

  res.status(200).json({
    status: 'ok',
    serverPort: PORT,
    detectedHost: host,
    protocol,
    botConfigured: Boolean(BOT_TOKEN),
    botStatus: telegramBotStatus,
  });
});

async function startServer() {
  await loadTelegramAddedApps();

  if (!isProd) {
    // Mount Vite dev server middlewares
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files from dist in production
    const distPath = path.resolve(__dirname, 'dist');

    app.use((req, res, next) => {
      if (req.path === '/' || req.path === '/index.html') {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
      next();
    });

    // Explicit headers for Service Worker
    app.use('/sw.js', (_req, res, next) => {
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      next();
    });

    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  // Bind to 0.0.0.0 and PORT (defaults to 3000 for AI Studio environment)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Web App Launcher running on http://0.0.0.0:${PORT}`);
    if (BOT_TOKEN) {
      void startTelegramPolling();
    }
  });
}

startServer();
