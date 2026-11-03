import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { WebAppItem, Language, TelegramUser, CloudStorageSyncState } from './types';
import { DEFAULT_APPS } from './data/defaultApps';
import { translations, getTranslation } from './i18n/translations';
import {
  initTelegramUI,
  getTelegramUser,
  cloudStorageGetItem,
  cloudStorageSetItem,
  isCloudStorageAvailable,
  launchExternalApp,
  hapticImpact,
} from './services/telegram';
import { Header } from './components/Header';
import { AppCard } from './components/AppCard';
import { LaunchModal } from './components/LaunchModal';
import { AddEditAppModal } from './components/AddEditAppModal';
import { PWAInstallButton } from './components/PWAInstallButton';

const STORAGE_KEY_APPS = 'tma_cloud_apps';
const STORAGE_KEY_LANG = 'tma_lang';

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [apps, setApps] = useState<WebAppItem[]>(DEFAULT_APPS);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [launchingApp, setLaunchingApp] = useState<WebAppItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<WebAppItem | null>(null);
  const [syncState, setSyncState] = useState<CloudStorageSyncState>({
    status: 'syncing',
  });

  // Initialize Telegram environment and load state from Telegram Cloud Storage
  useEffect(() => {
    initTelegramUI();
    const tgUser = getTelegramUser();
    if (tgUser) {
      setUser(tgUser);
    }

    // Determine initial language
    const initialLang: Language = tgUser?.language_code?.startsWith('es') ? 'es' : 'en';

    // Load persisted state from Telegram Cloud Storage / LocalStorage
    async function loadCloudData() {
      try {
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
    }

    loadCloudData();
  }, []);

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
  const handleLanguageChange = async (newLang: Language) => {
    setLang(newLang);
    try {
      await cloudStorageSetItem(STORAGE_KEY_LANG, newLang);
    } catch {
      // Ignored
    }
  };

  // Launch app handler: If app has credentials, open credential helper sheet; otherwise open directly on device
  const handleLaunchApp = (item: WebAppItem) => {
    if (item.username || item.password) {
      setLaunchingApp(item);
    } else {
      hapticImpact('heavy');
      launchExternalApp(item.url);
    }
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

  // Reset defaults handler
  const handleResetDefaults = () => {
    if (window.confirm(getTranslation(lang, 'confirmReset'))) {
      persistApps(DEFAULT_APPS);
    }
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
    <div className="min-h-screen bg-[#17212b] text-white flex flex-col">
      {/* Header */}
      <Header
        lang={lang}
        onLanguageChange={handleLanguageChange}
        onAddClick={() => {
          setEditingApp(null);
          setIsModalOpen(true);
        }}
        onResetDefaults={handleResetDefaults}
        user={user}
        syncState={syncState}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4 pb-12">
        {/* PWA Install Banner */}
        <PWAInstallButton lang={lang} />

        {/* Search & Category Filter */}
        <div className="space-y-3 mb-5">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={getTranslation(lang, 'searchPlaceholder')}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#242f3d] border border-white/5 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-[#2481cc] shadow-inner"
            />
          </div>

          {/* Categories Pill Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
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
                      ? 'bg-[#2481cc] text-white shadow-sm'
                      : 'bg-[#242f3d] text-gray-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Apps Grid */}
        {filteredApps.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
          <div className="py-16 text-center text-gray-400">
            <div className="w-12 h-12 rounded-2xl bg-[#242f3d] flex items-center justify-center mx-auto mb-3 text-[#64b5f6]">
              <Sparkles className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium">{getTranslation(lang, 'noAppsFound')}</p>
          </div>
        )}

        {/* Footer info: Direct device connection & ultra-low RAM footprint indicator */}
        <div className="mt-8 pt-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-[11px] text-gray-500 gap-2">
          <span>{getTranslation(lang, 'tagline')}</span>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-md font-mono">
              ⚡ Direct Connection
            </span>
            <span className="inline-flex items-center gap-1 bg-[#2481cc]/10 text-[#64b5f6] px-2 py-0.5 rounded-md font-mono">
              PWA Ready
            </span>
          </div>
        </div>
      </main>

      {/* Launch Credentials & Direct Open Sheet */}
      <LaunchModal
        app={launchingApp}
        lang={lang}
        onClose={() => setLaunchingApp(null)}
      />

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
