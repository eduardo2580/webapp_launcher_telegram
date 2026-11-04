export type Language = 'en' | 'es' | 'pt';

export interface WebAppItem {
  id: string;
  title: string;
  url: string;
  icon?: string;
  category: 'Social' | 'Work' | 'Tools' | 'Media' | 'Other';
  username?: string;
  password?: string;
  isCustom?: boolean;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface CloudStorageSyncState {
  status: 'synced' | 'syncing' | 'offline' | 'fallback' | 'cached';
  lastSyncedAt?: number;
  isOnline?: boolean;
  hasBackgroundSync?: boolean;
  swActive?: boolean;
  cachedCount?: number;
}

export interface InlineKeyboardButtonItem {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface ChatMessage {
  id: number;
  sender: 'user' | 'bot';
  text: string;
  time: string;
  parseMode?: string;
  replyMarkup?: {
    inline_keyboard?: InlineKeyboardButtonItem[][];
  };
}

export interface BotStatusResponse {
  status: string;
  botStatus: 'disabled' | 'starting' | 'running' | 'reconnecting';
  configured: boolean;
  username: string | null;
  webhookUrl: string;
  totalApps: number;
  coreAppsCount: number;
  customAppsCount: number;
  apps: WebAppItem[];
  discloud?: {
    provider: string;
    type: string;
    id: string;
    ramLimitMB: number;
    heapUsedMB: number;
    rssMB: number;
    uptimeSeconds: number;
  };
}

