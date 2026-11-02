export type OpenMode = 'iframe' | 'external' | 'telegram';

export interface WebAppItem {
  id: string;
  name: string;
  url: string;
  iconUrl?: string;
  category: 'Social' | 'Productivity' | 'Utilities' | 'Media' | 'News' | 'Games' | 'Custom';
  description?: string;
  openMode: OpenMode;
  isDefault?: boolean;
  accentColor?: string;
  createdAt: number;
  knownBlockedIframe?: boolean;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export interface BotStatus {
  configured: boolean;
  botUsername?: string;
  botName?: string;
  webhookUrl?: string;
  menuButtonConfigured?: boolean;
  error?: string;
  appUrl?: string;
}

export interface EmbedCheckResult {
  url: string;
  allowsIframe: boolean;
  reason?: string;
  headers?: {
    xFrameOptions?: string | null;
    csp?: string | null;
  };
}
