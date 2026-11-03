import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Sparkles, Globe, RotateCcw, Plus } from './components/Icons';
import { WebAppItem, Language, TelegramUser, CloudStorageSyncState } from './types';
import { DEFAULT_APPS } from './data/defaultApps';
import { translations, getTranslation } from './i18n/translations';
import {
  initTelegramUI,
  getTelegramUser,
  cloudStorageGetItem,
  cloudStorageSetItem,
  isCloudStorageAvailable,
  hapticImpact,
  hapticNotification,
  setTelegramBackButton,
  forceMemoryGarbageCollection,
  handleExternalLinkClick,
} from './services/telegram';
import { AppCard } from './components/AppCard';
import { AddEditAppModal } from './components/AddEditAppModal';
import { InAppViewer } from './components/InAppViewer';

import {
  initMetadataSync,
  loadAppMetadataList,
  persistAppMetadataWithSync,
  triggerBackgroundSync,
  isBackgroundSyncSupported,
} from './services/metadataSync';

const STORAGE_KEY_LANG = 'tma_lang';
const CATEGORY_TRANSLATION_KEYS: Record<WebAppItem['category'], keyof typeof translations.en> = {
  Social: 'categorySocial',
  Work: 'categoryWork',
  Tools: 'categoryTools',
  Media: 'categoryMedia',
  Other: 'categoryOther',
};

export default function App() {
  const [lang, setLang] = useState<Language>('pt');
  const [apps, setApps] = useState<WebAppItem[]>(DEFAULT_APPS);
  const [, setUser] = useState<TelegramUser | null>(null);
  const [activeRunningApp, setActiveRunningApp] = useState<WebAppItem | null>(null);
  const [dashboardKey, setDashboardKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<WebAppItem | null>(null);
  const [syncState, setSyncState] = useState<CloudStorageSyncState>({
    status: 'syncing',
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    hasBackgroundSync: isBackgroundSyncSupported(),
  });

  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
  }, [lang]);

  // Load persisted state from Telegram Cloud, Service Worker Cache, or LocalStorage
  const loadCloudData = useCallback(async (initialLang: Language) => {
    try {
      setSyncState((prev) => ({ ...prev, status: 'syncing' }));

      // Load language preference
      const savedLang = await cloudStorageGetItem(STORAGE_KEY_LANG);
      const requestedLang = new URLSearchParams(window.location.search).get('lang');
      if (requestedLang === 'en' || requestedLang === 'es' || requestedLang === 'pt') {
        setLang(requestedLang);
      } else if (savedLang === 'en' || savedLang === 'es' || savedLang === 'pt') {
        setLang(savedLang);
      } else {
        setLang(initialLang);
      }

      // Load apps using progressive Service Worker cache & background sync strategy
      const result = await loadAppMetadataList();
      if (result.apps && result.apps.length > 0) {
        setApps(result.apps);
      }

      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setSyncState({
        status: !online
          ? 'offline'
          : result.source === 'cloud' && isCloudStorageAvailable()
          ? 'synced'
          : result.source === 'sw-cache'
          ? 'cached'
          : 'fallback',
        isOnline: online,
        hasBackgroundSync: isBackgroundSyncSupported(),
        lastSyncedAt: Date.now(),
        cachedCount: result.apps.length,
      });
    } catch (err) {
      console.warn('Failed to load app metadata:', err);
      setSyncState({
        status: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'fallback',
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      });
    }
  }, []);

  // Initialize Telegram environment and Service Worker background sync
  useEffect(() => {
    initTelegramUI();
    const tgUser = getTelegramUser();
    if (tgUser) {
      setUser(tgUser);
    }

    const browserLang = typeof navigator !== 'undefined' ? navigator.language : '';
    const initialLang: Language =
      tgUser?.language_code?.startsWith('pt') || browserLang.startsWith('pt')
        ? 'pt'
        : tgUser?.language_code?.startsWith('es') || browserLang.startsWith('es')
        ? 'es'
        : 'en';

    // Initialize Service Worker sync listener
    initMetadataSync({
      onMetadataUpdated: (updatedApps) => {
        setApps(updatedApps);
        setSyncState((prev) => ({
          ...prev,
          status: 'cached',
          cachedCount: updatedApps.length,
          lastSyncedAt: Date.now(),
        }));
      },
      onSyncStateChanged: (state) => {
        setSyncState((prev) => ({ ...prev, ...state }));
      },
    });

    loadCloudData(initialLang);
  }, [loadCloudData]);

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    const handleClick = (event: MouseEvent) => handleExternalLinkClick(event, root);
    root.addEventListener('click', handleClick, true);
    return () => root.removeEventListener('click', handleClick, true);
  }, []);

  // Save apps whenever modified & trigger Service Worker Background Sync
  const persistApps = useCallback(async (newApps: WebAppItem[]) => {
    setApps(newApps);
    setSyncState((prev) => ({ ...prev, status: 'syncing' }));
    try {
      await persistAppMetadataWithSync(newApps);
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setSyncState({
        status: !online
          ? 'offline'
          : isCloudStorageAvailable()
          ? 'synced'
          : 'cached',
        isOnline: online,
        hasBackgroundSync: isBackgroundSyncSupported(),
        lastSyncedAt: Date.now(),
        cachedCount: newApps.length,
      });
    } catch (e) {
      console.warn('Cloud sync error:', e);
      setSyncState((prev) => ({ ...prev, status: 'fallback' }));
    }
  }, []);


  // Cycle languages: PT -> EN -> ES -> PT
  const handleLanguageToggle = async () => {
    const cycleMap: Record<Language, Language> = {
      pt: 'en',
      en: 'es',
      es: 'pt',
    };
    const nextLang: Language = cycleMap[lang] || 'en';
    hapticImpact('light');
    setLang(nextLang);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', nextLang);
    window.history.replaceState(window.history.state, '', url.toString());
    try {
      await cloudStorageSetItem(STORAGE_KEY_LANG, nextLang);
    } catch {
      // Ignored
    }
  };

  // Reload / Re-sync apps from cloud & trigger Service Worker background sync
  const handleReload = async () => {
    hapticImpact('medium');
    hapticNotification('success');
    setSyncState((prev) => ({ ...prev, status: 'syncing' }));
    await triggerBackgroundSync(apps);
    await loadCloudData(lang);
  };


  // Launch app handler: Runs strictly inside Telegram Mini App without leaving!
  const handleLaunchApp = (item: WebAppItem) => {
    hapticImpact('heavy');
    setActiveRunningApp(item);
  };

  /**
   * Aggressively clears activeRunningApp state, unbinds Telegram navigation,
   * invokes garbage collection hints, and forces an immediate clean re-render of the dashboard.
   */
  const handleCloseActiveApp = useCallback(() => {
    // 1. Immediately drop the active app reference
    setActiveRunningApp(null);

    // 2. Clear native Telegram back button state
    setTelegramBackButton(false);

    // 3. Trigger immediate garbage collection hint
    forceMemoryGarbageCollection();

    // 4. Force a clean re-render on the next animation frame to flush detached tree & closures
    requestAnimationFrame(() => {
      setDashboardKey((prev) => prev + 1);
      // Secondary cleanup pulse to ensure GC catches detached DOM nodes
      setTimeout(() => {
        forceMemoryGarbageCollection();
      }, 50);
    });
  }, []);

  // Add / Edit app handler
  const handleSaveApp = (savedItem: WebAppItem) => {
    let updated: WebAppItem[];
    const exists = apps.some((a) => a.id === savedItem.id);
    if (exists) {
      updated = apps.map((a) => (a.id === savedItem.id ? savedItem : a));
    } else {
      updated = [savedItem, ...apps];
    }
    persistApps(updated);
    setIsModalOpen(false);
    setEditingApp(null);
  };

  // Delete app handler
  const handleDeleteApp = (id: string) => {
    const updated = apps.filter((a) => a.id !== id);
    persistApps(updated);
  };

  // Filtered apps computation
  const filteredApps = useMemo(() => {
    return apps.filter((app) => {
      const matchesSearch =
        app.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.url.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat =
        selectedCategory === 'All' || app.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [apps, searchQuery, selectedCategory]);

  const categories: Array<WebAppItem['category'] | 'All'> = ['All', 'Social', 'Work', 'Tools', 'Media', 'Other'];

  return (
    <div className="min-h-screen bg-[#17212b] text-white flex flex-col font-sans select-none">
      {/* If an app is running, show InAppViewer strictly inside Telegram with aggressive teardown */}
      {activeRunningApp && (
        <InAppViewer
          key={`running-${activeRunningApp.id}`}
          app={activeRunningApp}
          lang={lang}
          onClose={handleCloseActiveApp}
        />
      )}

      {/* Main Launcher View (when no app is active, key forces re-render/reclaimed memory) */}
      <main key={dashboardKey} className="flex-1 max-w-4xl w-full mx-auto px-3.5 py-3.5 pb-10 flex flex-col">
        {/* Search & Actions Bar (Image 3 bar + Image 2 buttons on the right) */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1.5 mb-3.5 sm:gap-2">
          {/* Search Bar - Flex 1 */}
          <div className="relative min-w-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={getTranslation(lang, 'searchPlaceholder')}
              className="w-full h-10 pl-10 pr-3.5 rounded-xl bg-[#242f3d] border border-white/10 text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#2481cc] transition shadow-inner"
            />
          </div>

          {/* Language Toggle Button: [🌐 EN/PT/ES] */}
          <button
            onClick={handleLanguageToggle}
            className="h-10 px-2 sm:px-3 rounded-xl bg-[#242f3d] border border-white/10 hover:bg-[#2b3747] text-xs font-semibold text-white flex items-center gap-1.5 transition active:scale-95 shrink-0"
            title={getTranslation(lang, 'language')}
          >
            <Globe className="w-4 h-4 text-[#64b5f6]" />
            <span>{lang.toUpperCase()}</span>
          </button>

          {/* Reload Button: [🔄] */}
          <button
            onClick={handleReload}
            className="h-10 w-10 rounded-xl bg-[#242f3d] border border-white/10 hover:bg-[#2b3747] text-gray-200 hover:text-white flex items-center justify-center transition active:scale-95 shrink-0"
            title={getTranslation(lang, 'reload')}
          >
            <RotateCcw className={`w-4 h-4 ${syncState.status === 'syncing' ? 'animate-spin text-[#64b5f6]' : ''}`} />
          </button>

          {/* Add App Button: [+ Add App] */}
          <button
            onClick={() => {
              hapticImpact('light');
              setEditingApp(null);
              setIsModalOpen(true);
            }}
            className="h-10 px-2 sm:px-3.5 rounded-xl bg-[#2481cc] hover:bg-[#1d6fae] text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition active:scale-95 shrink-0 shadow-md shadow-[#2481cc]/20"
            title={getTranslation(lang, 'addApp')}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden whitespace-nowrap sm:inline">{getTranslation(lang, 'addApp')}</span>
          </button>
        </div>

        {/* Offline & Service Worker Cache Alert Banner */}
        {(!syncState.isOnline || syncState.status === 'offline') && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              <span className="font-semibold">{getTranslation(lang, 'offlineMode')}</span>
              <span className="text-gray-400 hidden sm:inline">&bull;</span>
              <span className="text-gray-300 text-[11px] hidden sm:inline">{getTranslation(lang, 'offlineNotice')}</span>
            </div>
            <span className="text-[10px] font-mono bg-amber-500/20 px-2 py-0.5 rounded text-amber-200 shrink-0">
              {apps.length} {getTranslation(lang, 'cachedAppsCount')}
            </span>
          </div>
        )}

        {/* Categories Pill Bar */}

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-none">
          {categories.map((cat) => {
            const label =
              cat === 'All'
                ? getTranslation(lang, 'allCategories')
                : translations[lang][CATEGORY_TRANSLATION_KEYS[cat]] || cat;
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => {
                  hapticImpact('light');
                  setSelectedCategory(cat);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-[#2481cc] text-white shadow-xs'
                    : 'bg-[#242f3d] text-gray-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            );
          })}

        </div>

        {/* Apps Grid */}
        {filteredApps.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 flex-1">
            {filteredApps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                lang={lang}
                onLaunch={handleLaunchApp}
                onEdit={(item) => {
                  setEditingApp(item);
                  setIsModalOpen(true);
                }}
                onDelete={handleDeleteApp}
              />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center text-gray-400 my-auto">
            <div className="w-12 h-12 rounded-2xl bg-[#242f3d] flex items-center justify-center mx-auto mb-3 text-[#64b5f6]">
              <Sparkles className="w-6 h-6" />
            </div>
            <p className="text-xs font-medium">{getTranslation(lang, 'noAppsFound')}</p>
          </div>
        )}

        {/* Footer: RAM, Background Sync, and In-Telegram PWA Status */}
        <div className="mt-6 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[11px] text-gray-500">
          <span className="min-w-0 flex-1 truncate">© 2026 All rights reserved.</span>
          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md font-mono text-[10px]">
              <span className={`w-1.5 h-1.5 rounded-full ${syncState.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
              <span>{syncState.isOnline ? 'PWA no Telegram' : 'PWA sem conexão'}</span>
              <span className="text-gray-400">&bull;</span>
              <span className="text-[#64b5f6]">{syncState.status === 'synced' ? 'Telegram Cloud' : 'Em cache'}</span>
            </div>
          </div>
        </div>
      </main>

      {/* Add / Edit App Modal */}
      <AddEditAppModal
        isOpen={isModalOpen}
        editingApp={editingApp}
        lang={lang}
        onSave={handleSaveApp}
        onClose={() => {
          setIsModalOpen(false);
          setEditingApp(null);
        }}
      />

    </div>
  );
}
