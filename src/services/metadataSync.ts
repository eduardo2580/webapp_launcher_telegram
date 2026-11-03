import { WebAppItem, CloudStorageSyncState } from '../types';
import { DEFAULT_APPS } from '../data/defaultApps';
import {
  cloudStorageGetItem,
  cloudStorageSetItem,
  isCloudStorageAvailable,
} from './telegram';

const STORAGE_KEY_APPS = 'tma_cloud_apps';
const METADATA_CACHE_NAME = 'tma-metadata-v2';
const METADATA_API_URL = '/api/apps';
const SYNC_TAG_METADATA = 'sync-app-metadata';

export interface MetadataSyncCallbacks {
  onMetadataUpdated?: (apps: WebAppItem[], source: string) => void;
  onSyncStateChanged?: (state: CloudStorageSyncState) => void;
}

let activeCallbacks: MetadataSyncCallbacks = {};
let swRegistration: ServiceWorkerRegistration | null = null;
let isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

/**
 * Check if the Background Sync API (SyncManager) is supported in this browser / WebView
 */
export function isBackgroundSyncSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'SyncManager' in window;
}

/**
 * Initialize Service Worker and Background Sync listeners
 */
export async function initMetadataSync(callbacks: MetadataSyncCallbacks) {
  activeCallbacks = callbacks;

  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  // 1. Connectivity status listeners
  const updateOnlineStatus = () => {
    isOnline = navigator.onLine;
    if (activeCallbacks.onSyncStateChanged) {
      activeCallbacks.onSyncStateChanged({
        status: isOnline ? (isCloudStorageAvailable() ? 'synced' : 'fallback') : 'offline',
        isOnline,
        hasBackgroundSync: isBackgroundSyncSupported(),
        swActive: !!navigator.serviceWorker.controller,
      });
    }

    // When coming back online, trigger background sync
    if (isOnline) {
      triggerBackgroundSync();
    }
  };

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // 2. Listen for messages from Service Worker (Background Sync events)
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    if (data.type === 'METADATA_UPDATED' || data.type === 'BACKGROUND_SYNC_COMPLETE') {
      if (Array.isArray(data.apps) && data.apps.length > 0 && activeCallbacks.onMetadataUpdated) {
        activeCallbacks.onMetadataUpdated(data.apps, data.source || 'service-worker');
      }

      if (activeCallbacks.onSyncStateChanged) {
        activeCallbacks.onSyncStateChanged({
          status: isCloudStorageAvailable() ? 'synced' : 'cached',
          isOnline: navigator.onLine,
          hasBackgroundSync: isBackgroundSyncSupported(),
          swActive: true,
          lastSyncedAt: data.timestamp || Date.now(),
        });
      }
    }
  });

  // 3. Register Service Worker and retrieve registration
  try {
    const reg = await navigator.serviceWorker.ready;
    swRegistration = reg;

    // Register Background Sync tag if supported
    if (isBackgroundSyncSupported() && 'sync' in reg) {
      try {
        await (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register(SYNC_TAG_METADATA);
      } catch (err) {
        console.warn('[SyncManager] SW sync registration deferred:', err);
      }
    }
  } catch (err) {
    console.warn('[SW] Ready registration notice:', err);
  }
}

/**
 * Triggers a Background Sync registration with the browser.
 * If Background Sync API is not supported (e.g. iOS WebKit),
 * executes an immediate resilient fetch fallback.
 */
export async function triggerBackgroundSync(appsToSync?: WebAppItem[]): Promise<boolean> {
  // If we have an active Service Worker, inform it of current metadata
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_METADATA',
      apps: appsToSync,
    });
  }

  // Also cache directly to Cache Storage
  if (appsToSync && typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(METADATA_CACHE_NAME);
      const res = new Response(
        JSON.stringify({
          status: 'ok',
          source: 'cache-api-direct',
          syncedAt: Date.now(),
          apps: appsToSync,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );
      await cache.put(METADATA_API_URL, res);
    } catch (e) {
      console.warn('[Cache] Direct cache write warning:', e);
    }
  }

  // Attempt Native Background Sync API
  if (isBackgroundSyncSupported()) {
    try {
      const reg = swRegistration || (await navigator.serviceWorker.ready);
      if (reg && 'sync' in reg) {
        await (reg as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register(SYNC_TAG_METADATA);
        return true;
      }
    } catch (e) {
      console.warn('[SyncManager] Native sync register failed, using network fallback:', e);
    }
  }

  // Resilient fallback for iOS / non-sync browsers
  if (navigator.onLine) {
    try {
      if (appsToSync && appsToSync.length > 0) {
        await fetch('/api/apps/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apps: appsToSync, clientTimestamp: Date.now() }),
        });
      } else {
        const res = await fetch(METADATA_API_URL, { cache: 'no-cache' });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.apps) && activeCallbacks.onMetadataUpdated) {
            activeCallbacks.onMetadataUpdated(data.apps, 'network-fetch');
          }
        }
      }
      return true;
    } catch {
      // Offline fallback: handled by caches
      return false;
    }
  }

  return false;
}

function migrateDefaultApps(apps: WebAppItem[]): WebAppItem[] {
  const migratedApps = apps.filter((app) => app.id !== 'telegram');
  const youtube = DEFAULT_APPS.find((app) => app.id === 'youtube');

  if (youtube && !migratedApps.some((app) => app.id === youtube.id)) {
    const telegramIndex = apps.findIndex((app) => app.id === 'telegram');
    const insertIndex = telegramIndex < 0 ? migratedApps.length : telegramIndex;
    migratedApps.splice(insertIndex, 0, youtube);
  }

  const changed =
    migratedApps.length !== apps.length ||
    migratedApps.some((app, index) => app !== apps[index]);
  if (changed) {
    try {
      void persistAppMetadataWithSync(migratedApps).catch((err) => {
        console.warn('[MetadataSync] Default app migration notice:', err);
      });
    } catch (err) {
      console.warn('[MetadataSync] Default app migration notice:', err);
    }
  }

  return migratedApps;
}

/**
 * Loads the core app metadata list with progressive offline fallback:
 * 1. Telegram Cloud Storage
 * 2. Service Worker Stale-While-Revalidate / Cache Storage (/api/apps)
 * 3. LocalStorage
 * 4. DEFAULT_APPS presets
 */
export async function loadAppMetadataList(): Promise<{
  apps: WebAppItem[];
  source: 'cloud' | 'sw-cache' | 'local' | 'presets';
}> {
  // 1. Try Telegram Cloud Storage
  try {
    const cloudAppsJson = await cloudStorageGetItem(STORAGE_KEY_APPS);
    if (cloudAppsJson) {
      const parsed = JSON.parse(cloudAppsJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const apps = migrateDefaultApps(parsed);
        // Cache this fresh cloud list into Service Worker cache in background
        triggerBackgroundSync(apps);
        return { apps, source: 'cloud' };
      }
    }
  } catch (err) {
    console.warn('[MetadataSync] CloudStorage read notice:', err);
  }

  // 2. Try Service Worker / Cache Storage /api/apps (Works 100% offline)
  try {
    const res = await fetch(METADATA_API_URL);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.apps) && data.apps.length > 0) {
        return { apps: migrateDefaultApps(data.apps), source: 'sw-cache' };
      }
    }
  } catch (err) {
    console.warn('[MetadataSync] Fetch /api/apps notice:', err);
  }

  // 3. Try direct Cache Storage inspection if fetch was completely bypassed
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(METADATA_CACHE_NAME);
      const cached = await cache.match(METADATA_API_URL);
      if (cached) {
        const data = await cached.json();
        if (Array.isArray(data.apps) && data.apps.length > 0) {
          return { apps: migrateDefaultApps(data.apps), source: 'sw-cache' };
        }
      }
    } catch (e) {
      console.warn('[MetadataSync] Cache storage direct read error:', e);
    }
  }

  // 4. Try LocalStorage fallback
  try {
    const localJson = localStorage.getItem(STORAGE_KEY_APPS);
    if (localJson) {
      const parsed = JSON.parse(localJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const apps = migrateDefaultApps(parsed);
        triggerBackgroundSync(apps);
        return { apps, source: 'local' };
      }
    }
  } catch (e) {
    console.warn('[MetadataSync] LocalStorage read notice:', e);
  }

  // 5. Built-in presets fallback
  triggerBackgroundSync(DEFAULT_APPS);
  return { apps: DEFAULT_APPS, source: 'presets' };
}

/**
 * Persists updated app metadata to all storage tiers and queues background sync:
 * - LocalStorage
 * - Telegram Cloud Storage
 * - Service Worker Cache
 * - Background Sync Registration
 */
export async function persistAppMetadataWithSync(apps: WebAppItem[]): Promise<boolean> {
  // 1. Instant local persistence
  try {
    localStorage.setItem(STORAGE_KEY_APPS, JSON.stringify(apps));
  } catch (e) {
    console.warn('LocalStorage save error:', e);
  }

  // 2. Cache in Service Worker & register background sync
  triggerBackgroundSync(apps);

  // 3. Save to Telegram Cloud Storage
  let cloudSuccess = false;
  try {
    cloudSuccess = await cloudStorageSetItem(STORAGE_KEY_APPS, JSON.stringify(apps));
  } catch (e) {
    console.warn('Telegram CloudStorage save notice:', e);
  }

  return cloudSuccess;
}
