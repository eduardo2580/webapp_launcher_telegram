import { TelegramUser } from '../types';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe: {
          query_id?: string;
          user?: TelegramUser;
          auth_date?: number;
          hash?: string;
          start_param?: string;
        };
        version: string;
        platform: string;
        colorScheme: 'light' | 'dark';
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
        };
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
        headerColor: string;
        backgroundColor: string;
        BackButton: {
          isVisible: boolean;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        MainButton: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          isProgressVisible: boolean;
          setText: (text: string) => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
          show: () => void;
          hide: () => void;
          enable: () => void;
          disable: () => void;
          showProgress: (leaveActive?: boolean) => void;
          hideProgress: () => void;
        };
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        CloudStorage?: {
          setItem: (key: string, value: string, callback?: (err: Error | null, stored?: boolean) => void) => void;
          getItem: (key: string, callback: (err: Error | null, value?: string) => void) => void;
          getItems: (keys: string[], callback: (err: Error | null, values?: Record<string, string>) => void) => void;
          removeItem: (key: string, callback?: (err: Error | null, removed?: boolean) => void) => void;
          removeItems: (keys: string[], callback?: (err: Error | null, removed?: boolean) => void) => void;
          getKeys: (callback: (err: Error | null, keys?: string[]) => void) => void;
        };
        isVersionAtLeast?: (version: string) => boolean;
        expand: () => void;
        close: () => void;
        ready: () => void;
        openLink: (url: string, options?: { try_instant_view?: boolean }) => void;
        openTelegramLink: (url: string) => void;
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        enableClosingConfirmation: () => void;
        onEvent: (eventType: string, eventHandler: () => void) => void;
        offEvent: (eventType: string, eventHandler: () => void) => void;
        sendData: (data: string) => void;
      };
    };
  }
}

export function isTelegramEnv(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.Telegram?.WebApp &&
    (window.Telegram.WebApp.initData || window.Telegram.WebApp.initDataUnsafe?.user)
  );
}

export function getTelegramWebApp() {
  if (typeof window === 'undefined') return undefined;
  return window.Telegram?.WebApp;
}

export function getTelegramUser(): TelegramUser | null {
  const tg = getTelegramWebApp();
  if (tg?.initDataUnsafe?.user) {
    return tg.initDataUnsafe.user;
  }
  return null;
}

export function getInitDataString(): string {
  const tg = getTelegramWebApp();
  return tg?.initData || '';
}

export function initTelegramApp() {
  const tg = getTelegramWebApp();
  if (!tg) return;

  try {
    tg.ready();
    tg.expand();
    tg.enableClosingConfirmation();
  } catch (err) {
    console.warn('Could not fully initialize Telegram WebApp SDK:', err);
  }
}

export function triggerHaptic(
  type: 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error' = 'light'
) {
  const tg = getTelegramWebApp();
  if (!tg?.HapticFeedback) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      if (type === 'light' || type === 'selection') navigator.vibrate(10);
      else if (type === 'medium') navigator.vibrate(25);
      else if (type === 'heavy' || type === 'error') navigator.vibrate([30, 40, 30]);
    }
    return;
  }

  try {
    if (type === 'selection') {
      tg.HapticFeedback.selectionChanged();
    } else if (type === 'success' || type === 'warning' || type === 'error') {
      tg.HapticFeedback.notificationOccurred(type);
    } else {
      tg.HapticFeedback.impactOccurred(type);
    }
  } catch {}
}

// ================= Safe Telegram Cloud Storage Helpers =================
// Telegram added CloudStorage in Bot API 6.9. Calling it in version 6.0 causes:
// "[Telegram.WebApp] CloudStorage is not supported in version 6.0"
// We verify version compatibility with isVersionAtLeast('6.9') before invoking.

export function isCloudStorageAvailable(): boolean {
  const tg = getTelegramWebApp();
  if (!tg?.CloudStorage) return false;

  try {
    // 1. Check official isVersionAtLeast
    if (typeof tg.isVersionAtLeast === 'function') {
      return tg.isVersionAtLeast('6.9');
    }

    // 2. Parse version string fallback
    if (tg.version) {
      const parts = tg.version.split('.').map(Number);
      if (parts[0] > 6 || (parts[0] === 6 && parts[1] >= 9)) {
        return true;
      }
    }
  } catch {}

  return false;
}

export function cloudStorageSetItem(key: string, value: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Always sync locally first for instant availability
    try {
      localStorage.setItem(key, value);
    } catch {}

    // Only attempt Telegram CloudStorage if version is 6.9+
    if (isCloudStorageAvailable()) {
      const tg = getTelegramWebApp();
      try {
        tg?.CloudStorage?.setItem(key, value, (err, stored) => {
          resolve(!err && (stored ?? true));
        });
        return;
      } catch {}
    }

    resolve(true);
  });
}

export function cloudStorageGetItem(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    // Read local cache immediately
    const localVal = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;

    // Only query Telegram CloudStorage if version is 6.9+
    if (isCloudStorageAvailable()) {
      const tg = getTelegramWebApp();
      try {
        tg?.CloudStorage?.getItem(key, (err, cloudVal) => {
          if (!err && cloudVal !== undefined && cloudVal !== null) {
            resolve(cloudVal);
          } else {
            resolve(localVal);
          }
        });
        return;
      } catch {}
    }

    resolve(localVal);
  });
}

export function cloudStorageRemoveItem(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      localStorage.removeItem(key);
    } catch {}

    if (isCloudStorageAvailable()) {
      const tg = getTelegramWebApp();
      try {
        tg?.CloudStorage?.removeItem(key, (err, removed) => {
          resolve(!err && (removed ?? true));
        });
        return;
      } catch {}
    }

    resolve(true);
  });
}
