import { Language } from './i18n/translations';

export type { Language };

export interface WebAppItem {
  id: string;
  name: string;
  url: string;
  iconUrl?: string;
  category: 'Social' | 'Productivity' | 'Utilities' | 'Media' | 'News' | 'Games' | 'Custom';
  description?: string;
  isDefault?: boolean;
  accentColor?: string;
  createdAt: number;
  // Telegram Cloud Stored credentials
  username?: string;
  password?: string;
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

export interface UserPreferences {
  language: Language;
}

export interface CloudCredentials {
  username?: string;
  password?: string;
  lastSynced?: number;
}
