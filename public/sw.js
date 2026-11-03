/**
 * Telegram Web App Launcher - Service Worker
 * Implements Stale-While-Revalidate Caching & Background Sync Strategy
 * for Core App Metadata and offline resilience in Telegram WebViews
 */

const STATIC_CACHE_NAME = 'tma-launcher-static-v3';
const METADATA_CACHE_NAME = 'tma-metadata-v2';
const SYNC_TAG_METADATA = 'sync-app-metadata';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/apple-touch-icon.png'
];

// Core fallback metadata list for 100% offline bootstrap
const CORE_FALLBACK_APPS = [
  {
    id: 'facebook',
    title: 'Facebook',
    url: 'https://m.facebook.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/facebook.png',
    category: 'Social',
    isCustom: false,
  },
  {
    id: 'instagram',
    title: 'Instagram',
    url: 'https://www.instagram.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/instagram.png',
    category: 'Social',
    isCustom: false,
  },
  {
    id: 'linkedin',
    title: 'LinkedIn',
    url: 'https://www.linkedin.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/linkedin.png',
    category: 'Social',
    isCustom: false,
  },
  {
    id: 'wikipedia',
    title: 'Wikipedia',
    url: 'https://m.wikipedia.org',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/wikipedia.png',
    category: 'Tools',
    isCustom: false,
  },
  {
    id: 'youtube',
    title: 'YouTube',
    url: 'https://www.youtube.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/youtube.png',
    category: 'Media',
    isCustom: false,
  },
  {
    id: 'x',
    title: 'X / Twitter',
    url: 'https://mobile.x.com',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/x.png',
    category: 'Social',
    isCustom: false,
  },
];

// Helper to notify all open clients
async function broadcastToClients(message) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage(message);
  }
}

// 1. Install Phase: Cache Static Assets + Seed Initial Metadata Cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Cache static files
      const staticCache = await caches.open(STATIC_CACHE_NAME);
      await staticCache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache static warning:', err);
      });

      // Seed initial metadata cache so offline start works on instant boot
      const metadataCache = await caches.open(METADATA_CACHE_NAME);
      const initialPayload = {
        status: 'ok',
        version: '1.2.0',
        source: 'sw-preseeded-cache',
        syncedAt: Date.now(),
        apps: CORE_FALLBACK_APPS,
      };
      const initialResponse = new Response(JSON.stringify(initialPayload), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-SW-Cache': 'pre-seeded',
        },
      });
      await metadataCache.put('/api/apps', initialResponse);
    })()
  );
  self.skipWaiting();
});

// 2. Activate Phase: Clean Old Caches & Claim Clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE_NAME && key !== METADATA_CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// 3. Background Sync API Handler
self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG_METADATA || event.tag === 'sync-cloud-apps') {
    event.waitUntil(executeBackgroundMetadataSync());
  }
});

/**
 * Executes Background Sync for App Metadata:
 * 1. Pings backend /api/apps
 * 2. Updates METADATA_CACHE_NAME
 * 3. Broadcasts success event to active TMA windows
 */
async function executeBackgroundMetadataSync() {
  try {
    const metadataCache = await caches.open(METADATA_CACHE_NAME);
    const cachedResponse = await metadataCache.match('/api/apps');
    if (cachedResponse) {
      const cachedData = await cachedResponse.clone().json();
      if (Array.isArray(cachedData.apps)) {
        const syncResponse = await fetch('/api/apps/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apps: cachedData.apps, clientTimestamp: Date.now() }),
        });
        if (!syncResponse.ok) {
          throw new Error(`Metadata sync failed (${syncResponse.status}).`);
        }
      }
    }

    const res = await fetch('/api/apps', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.clone().json();
      await metadataCache.put('/api/apps', res);

      // Broadcast update to open launcher views
      await broadcastToClients({
        type: 'BACKGROUND_SYNC_COMPLETE',
        apps: data.apps,
        timestamp: Date.now(),
        source: 'background-sync',
      });
      return true;
    }
  } catch (err) {
    console.warn('[SW] Background sync retry deferred:', err);
    throw err; // Throw to let the browser schedule retry
  }
}

// 4. Fetch Handler
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Special Handling for Core App Metadata API: /api/apps
  if (url.pathname === '/api/apps' && event.request.method === 'GET') {
    event.respondWith(
      (async () => {
        const metadataCache = await caches.open(METADATA_CACHE_NAME);
        const cachedResponse = await metadataCache.match('/api/apps');

        // Background revalidation promise
        const fetchPromise = fetch(event.request)
          .then(async (networkRes) => {
            if (networkRes.ok) {
              const clone = networkRes.clone();
              await metadataCache.put('/api/apps', clone);
              // Inform clients of fresh data
              const freshData = await networkRes.clone().json();
              broadcastToClients({
                type: 'METADATA_UPDATED',
                apps: freshData.apps,
                timestamp: Date.now(),
              });
            }
            return networkRes;
          })
          .catch(() => {
            // Network failure: we return cached or pre-seeded fallback
            return null;
          });

        // Stale-While-Revalidate: Return cached immediately if present
        if (cachedResponse) {
          // Trigger revalidation in background
          event.waitUntil(fetchPromise);
          return cachedResponse;
        }

        // If not in cache yet, wait for network or provide pre-seeded fallback
        const networkResponse = await fetchPromise;
        if (networkResponse) return networkResponse;

        // Offline fallback synthesis
        return new Response(
          JSON.stringify({
            status: 'ok',
            source: 'sw-offline-emergency',
            syncedAt: Date.now(),
            apps: CORE_FALLBACK_APPS,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      })()
    );
    return;
  }

  // Handle external app icon caching (e.g. cdn.jsdelivr.net icons)
  if (url.hostname.includes('jsdelivr.net') || url.pathname.endsWith('.png') || url.pathname.endsWith('.svg')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((response) => {
            if (response.ok && response.type === 'basic' || response.type === 'cors') {
              const clone = response.clone();
              caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => caches.match('/icon.svg'));
      })
    );
    return;
  }

  // Skip other /api/ calls and non-GET or cross-origin requests
  if (
    event.request.method !== 'GET' ||
    url.origin !== location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // Network-First for HTML documents (Launcher shell)
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match('/index.html')))
    );
    return;
  }

  // Cache-First for static scripts, CSS, and manifest
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && url.origin === location.origin) {
          const clone = response.clone();
          caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// 5. Message Handling from Client Windows
self.addEventListener('message', (event) => {
  const { data } = event;
  if (!data || !data.type) return;

  // Client requests caching of current app metadata
  if (data.type === 'CACHE_METADATA') {
    event.waitUntil(
      (async () => {
        const metadataCache = await caches.open(METADATA_CACHE_NAME);
        const payload = {
          status: 'ok',
          source: 'sw-client-sync',
          syncedAt: Date.now(),
          apps: Array.isArray(data.apps) ? data.apps : CORE_FALLBACK_APPS,
        };
        const response = new Response(JSON.stringify(payload), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-SW-Cache': 'client-updated',
          },
        });
        await metadataCache.put('/api/apps', response);
      })()
    );
  }

  // Client requests immediate manual background sync
  if (data.type === 'TRIGGER_SYNC') {
    event.waitUntil(
      executeBackgroundMetadataSync()
        .then(() => {
          if (event.source) {
            event.source.postMessage({ type: 'MANUAL_SYNC_SUCCESS', timestamp: Date.now() });
          }
        })
        .catch((err) => {
          if (event.source) {
            event.source.postMessage({ type: 'MANUAL_SYNC_ERROR', error: String(err) });
          }
        })
    );
  }

  // Status ping from UI diagnostics
  if (data.type === 'PING_SW') {
    if (event.source) {
      event.source.postMessage({
        type: 'PONG_SW',
        version: 'v2',
        syncTag: SYNC_TAG_METADATA,
        timestamp: Date.now(),
      });
    }
  }
});
