export type Language = 'en' | 'es';

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
  status: 'synced' | 'syncing' | 'offline' | 'fallback';
  lastSyncedAt?: number;
}
