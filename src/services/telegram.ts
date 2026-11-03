import { TelegramUser } from '../types';

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe: {
          user?: TelegramUser;
          query_id?: string;
          auth_date?: string;
          hash?: string;
        };
        version: string;
        platform: string;
        colorScheme: 'light' | 'dark';
        themeParams: Record<string, string>;
        isExpanded: boolean;
        viewportHeight: number;
        viewportStableHeight: number;
        headerColor: string;
        backgroundColor: string;
        isVersionAtLeast: (version: string) => boolean;
        ready: () => void;
        expand: () => void;
        close: () => void;
        enableClosingConfirmation?: () => void;
        openLink?: (url: string, options?: { try_instant_view?: boolean; try_browser?: boolean }) => void;
        openTelegramLink?: (url: string) => void;
        BackButton?: {
          isVisible: boolean;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        MainButton?: {
          text: string;
          color: string;
          textColor: string;
          isVisible: boolean;
          isActive: boolean;
          show: () => void;
          hide: () => void;
          setText: (text: string) => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        HapticFeedback?: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
        CloudStorage?: {
          setItem: (key: string, value: string, callback?: (err: Error | null, success: boolean) => void) => void;
          getItem: (key: string, callback: (err: Error | null, value: string) => void) => void;
          getItems: (keys: string[], callback: (err: Error | null, values: Record<string, string>) => void) => void;
          removeItem: (key: string, callback?: (err: Error | null, success: boolean) => void) => void;
          getKeys: (callback: (err: Error | null, keys: string[]) => void) => void;
        };
      };
    };
  }
}

export function getTelegramWebApp() {
  if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
}

export function isTelegramWebApp(): boolean {
  return !!getTelegramWebApp();
}

/**
 * Initialize Telegram Mini App UI according to official TMA guidelines
 */
export function initTelegramUI() {
  const tg = getTelegramWebApp();
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (typeof tg.enableClosingConfirmation === 'function') {
        tg.enableClosingConfirmation();
      }
    } catch (e) {
      console.warn('Telegram WebApp init notice:', e);
    }
  }
}

export function getTelegramUser(): TelegramUser | null {
  const tg = getTelegramWebApp();
  return tg?.initDataUnsafe?.user || null;
}

/**
 * Opens URLs through Telegram's in-app browser when running as a Mini App.
 */
export function launchExternalApp(url: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (err) {
    console.warn('Cannot open invalid URL:', err);
    return;
  }

  const isTelegramLink =
    parsedUrl.protocol === 'tg:' ||
    (parsedUrl.protocol === 'https:' && parsedUrl.hostname.toLowerCase() === 't.me');
  const isWebLink = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  if (!isTelegramLink && !isWebLink) {
    console.warn('Cannot open unsupported URL protocol:', parsedUrl.protocol);
    return;
  }

  const tg = getTelegramWebApp();

  if (tg) {
    if (isTelegramLink) {
      if (typeof tg.openTelegramLink === 'function') {
        try {
          tg.openTelegramLink(url);
        } catch (err) {
          console.warn('Telegram openTelegramLink error:', err);
        }
      } else {
        console.warn('Telegram openTelegramLink is unavailable');
      }
      return;
    }

    if (typeof tg.openLink === 'function') {
      try {
        tg.openLink(url, { try_instant_view: true });
      } catch (err) {
        console.warn('Telegram openLink error:', err);
      }
    } else {
      console.warn('Telegram openLink is unavailable');
    }
    return;
  }

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function handleExternalLinkClick(event: MouseEvent, root: HTMLElement) {
  const target = event.target;
  if (!target || typeof (target as Element).closest !== 'function') return;

  const element = target as Element;
  const anchor = element.closest('a[href]');
  if (!anchor || anchor.tagName !== 'A' || !root.contains(anchor)) return;
  const link = anchor as HTMLAnchorElement;

  let targetUrl: URL;
  try {
    targetUrl = new URL(link.href);
  } catch {
    return;
  }

  const isTelegramLink =
    targetUrl.protocol === 'tg:' ||
    (targetUrl.protocol === 'https:' && targetUrl.hostname.toLowerCase() === 't.me');
  const appOrigin = root.ownerDocument.location.origin;
  const isExternalWebLink =
    (targetUrl.protocol === 'http:' || targetUrl.protocol === 'https:') &&
    targetUrl.origin !== appOrigin;
  if (!isTelegramLink && !isExternalWebLink) return;

  event.preventDefault();
  launchExternalApp(targetUrl.href);
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') {
  const tg = getTelegramWebApp();
  if (tg?.HapticFeedback) {
    try {
      tg.HapticFeedback.impactOccurred(style);
    } catch {
      // Ignore in non-TMA
    }
  }
}

export function hapticNotification(type: 'error' | 'success' | 'warning' = 'success') {
  const tg = getTelegramWebApp();
  if (tg?.HapticFeedback) {
    try {
      tg.HapticFeedback.notificationOccurred(type);
    } catch {
      // Ignore
    }
  }
}

let activeBackHandler: (() => void) | null = null;

export function setTelegramBackButton(visible: boolean, onClickHandler?: () => void) {
  const tg = getTelegramWebApp();
  if (tg?.BackButton) {
    try {
      // Remove any previously bound handler first to avoid memory leaks or duplicate firings
      if (activeBackHandler && typeof tg.BackButton.offClick === 'function') {
        tg.BackButton.offClick(activeBackHandler);
        activeBackHandler = null;
      }

      if (visible && onClickHandler) {
        activeBackHandler = onClickHandler;
        tg.BackButton.show();
        tg.BackButton.onClick(onClickHandler);
      } else {
        tg.BackButton.hide();
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Aggressively invokes garbage collection hints and memory reclamation.
 * Useful when unmounting heavy embedded WebViews, iframes, and media contexts.
 */
export function forceMemoryGarbageCollection() {
  try {
    // Check for V8 / WebKit / Node developer expose-gc flag
    if (typeof (window as unknown as { gc?: () => void }).gc === 'function') {
      (window as unknown as { gc: () => void }).gc();
    }
  } catch {
    // Ignore in non-debug runtimes
  }
}


/**
 * Checks whether Telegram CloudStorage API is supported.
 * CRITICAL: Telegram Bot API version 6.9+ is strictly required.
 */
export function isCloudStorageAvailable(): boolean {
  const tg = getTelegramWebApp();
  if (!tg || !tg.CloudStorage) return false;
  try {
    return typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast('6.9');
  } catch {
    return false;
  }
}

/**
 * Safe CloudStorage getItem with fallback to localStorage.
 */
export async function cloudStorageGetItem(key: string): Promise<string | null> {
  const tg = getTelegramWebApp();

  if (isCloudStorageAvailable() && tg?.CloudStorage) {
    return new Promise((resolve) => {
      try {
        tg.CloudStorage!.getItem(key, (err, val) => {
          if (err || !val) {
            resolve(localStorage.getItem(key));
          } else {
            resolve(val);
          }
        });
      } catch {
        resolve(localStorage.getItem(key));
      }
    });
  }

  return localStorage.getItem(key);
}

/**
 * Safe CloudStorage setItem with fallback to localStorage.
 */
export async function cloudStorageSetItem(key: string, value: string): Promise<boolean> {
  localStorage.setItem(key, value);

  const tg = getTelegramWebApp();
  if (isCloudStorageAvailable() && tg?.CloudStorage) {
    return new Promise((resolve) => {
      try {
        tg.CloudStorage!.setItem(key, value, (err, success) => {
          resolve(!err && !!success);
        });
      } catch {
        resolve(false);
      }
    });
  }

  return true;
}

/**
 * Safe CloudStorage removeItem with fallback to localStorage.
 */
export async function cloudStorageRemoveItem(key: string): Promise<boolean> {
  localStorage.removeItem(key);

  const tg = getTelegramWebApp();
  if (isCloudStorageAvailable() && tg?.CloudStorage) {
    return new Promise((resolve) => {
      try {
        tg.CloudStorage!.removeItem(key, (err, success) => {
          resolve(!err && !!success);
        });
      } catch {
        resolve(false);
      }
    });
  }

  return true;
}
