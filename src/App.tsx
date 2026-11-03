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
} from './services/telegram';
import { AppCard } from './components/AppCard';
import { AddEditAppModal } from './components/AddEditAppModal';
import { InAppViewer } from './components/InAppViewer';

const STORAGE_KEY_APPS = 'tma_cloud_apps';
const STORAGE_KEY_LANG = 'tma_lang';

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [apps, setApps] = useState<WebAppItem[]>(DEFAULT_APPS);
  const [, setUser] = useState<TelegramUser | null>(null);
  const [activeRunningApp, setActiveRunningApp] = useState<WebAppItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<WebAppItem | null>(null);
  const [syncState, setSyncState] = useState<CloudStorageSyncState>({
    status: 'syncing',
  });

  // Load persisted state from Telegram Cloud Storage or LocalStorage
  const loadCloudData = useCallback(async (initialLang: Language) => {
    try {
      setSyncState({ status: 'syncing' });
      // Load language preference
      const savedLang = await cloudStorageGetItem(STORAGE_KEY_LANG);
      if (savedLang === 'en' || savedLang === 'es') {
        setLang(savedLang);
      } else {
        setLang(initialLang);
      }

      // Load apps list with credentials
      const savedAppsJson = await cloudStorageGetItem(STORAGE_KEY_APPS);
      if (savedAppsJson) {
        const parsed = JSON.parse(savedAppsJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setApps(parsed);
        }
      }

      setSyncState({
        status: isCloudStorageAvailable() ? 'synced' : 'fallback',
        lastSyncedAt: Date.now(),
      });
    } catch (err) {
      console.warn('Failed to load Telegram Cloud data:', err);
      setSyncState({ status: 'fallback' });
    }
  }, []);

  // Initialize Telegram environment
  useEffect(() => {
    initTelegramUI();
    const tgUser = getTelegramUser();
    if (tgUser) {
      setUser(tgUser);
    }

    const initialLang: Language = tgUser?.language_code?.startsWith('es') ? 'es' : 'en';
    loadCloudData(initialLang);
  }, [loadCloudData]);

  // Save apps whenever modified
  const persistApps = useCallback(async (newApps: WebAppItem[]) => {
    setApps(newApps);
    setSyncState((prev) => ({ ...prev, status: 'syncing' }));
    try {
      await cloudStorageSetItem(STORAGE_KEY_APPS, JSON.stringify(newApps));
      setSyncState({
        status: isCloudStorageAvailable() ? 'synced' : 'fallback',
        lastSyncedAt: Date.now(),
      });
    } catch (e) {
      console.warn('Cloud sync error:', e);
      setSyncState({ status: 'fallback' });
    }
  }, []);

  // Save language changes
  const handleLanguageToggle = async () => {
    const nextLang: Language = lang === 'en' ? 'es' : 'en';
    hapticImpact('light');
    setLang(nextLang);
    try {
      await cloudStorageSetItem(STORAGE_KEY_LANG, nextLang);
    } catch {
      // Ignored
    }
  };

  // Reload / Re-sync apps from cloud
  const handleReload = () => {
    hapticImpact('medium');
    hapticNotification('success');
    loadCloudData(lang);
  };

  // Launch app handler: Runs strictly inside Telegram Mini App without leaving!
  const handleLaunchApp = (item: WebAppItem) => {
    hapticImpact('heavy');
    setActiveRunningApp(item);
  };

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

  const categories = ['All', 'Social', 'Work', 'Tools', 'Media', 'Other'];

  return (
    <div className="min-h-screen bg-[#17212b] text-white flex flex-col font-sans select-none">
      {/* If an app is running, show InAppViewer strictly inside Telegram */}
      {activeRunningApp && (
        <InAppViewer
          app={activeRunningApp}
          lang={lang}
          onClose={() => setActiveRunningApp(null)}
        />
      )}

      {/* Main Launcher View (when no app is active) */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-3.5 py-3.5 pb-10 flex flex-col">
        {/* Compact Search & Action Row:
            [ 🔍 Search apps... ] [ 🌐 EN/ES ] [ 🔄 Reload ] [ ➕ Add App ] */}
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={getTranslation(lang, 'searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#242f3d] border border-white/5 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-[#2481cc] transition"
            />
          </div>

          {/* Language Toggle: EN / ES */}
          <button
            onClick={handleLanguageToggle}
            className="h-9 px-2.5 rounded-xl bg-[#242f3d] border border-white/5 hover:bg-[#2b3747] text-xs font-semibold text-gray-200 flex items-center gap-1.5 transition active:scale-95 shrink-0"
            title={getTranslation(lang, 'language')}
          >
            <Globe className="w-3.5 h-3.5 text-[#64b5f6]" />
            <span>{lang.toUpperCase()}</span>
          </button>

          {/* Reload / Re-sync Button */}
          <button
            onClick={handleReload}
            className="h-9 w-9 rounded-xl bg-[#242f3d] border border-white/5 hover:bg-[#2b3747] text-gray-300 hover:text-white flex items-center justify-center transition active:scale-95 shrink-0"
            title={getTranslation(lang, 'reload')}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${syncState.status === 'syncing' ? 'animate-spin text-[#64b5f6]' : ''}`} />
          </button>

          {/* Add App Button */}
          <button
            onClick={() => {
              hapticImpact('light');
              setEditingApp(null);
              setIsModalOpen(true);
            }}
            className="h-9 px-3 rounded-xl bg-[#2481cc] hover:bg-[#1d6fae] text-white text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shrink-0 shadow-sm"
            title={getTranslation(lang, 'addApp')}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{getTranslation(lang, 'addApp')}</span>
          </button>
        </div>

        {/* Categories Pill Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-3 scrollbar-none">
          {categories.map((cat) => {
            const label =
              cat === 'All'
                ? getTranslation(lang, 'allCategories')
                : translations[lang][`category${cat as 'Social'}` as keyof typeof translations.en] || cat;
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

        {/* Footer: RAM and In-Telegram PWA Status */}
        <div className="mt-6 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-500">
          <span className="truncate max-w-[200px]">{getTranslation(lang, 'tagline')}</span>
          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md font-mono text-[10px]">
              ● In-Telegram PWA
            </span>
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
