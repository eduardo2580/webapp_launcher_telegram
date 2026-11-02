import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Header } from './components/Header';
import { AppCard } from './components/AppCard';
import { EmbedViewer } from './components/EmbedViewer';
import { AddEditAppModal } from './components/AddEditAppModal';
import { DEFAULT_APPS } from './data/defaultApps';
import { WebAppItem, TelegramUser, Language } from './types';
import { translations } from './i18n/translations';
import { 
  initTelegramApp, 
  isTelegramEnv, 
  getTelegramUser, 
  getInitDataString, 
  triggerHaptic,
  cloudStorageGetItem,
  cloudStorageSetItem
} from './services/telegram';
import { Compass, AlertTriangle, CheckCircle2 } from 'lucide-react';

const CATEGORY_TABS: (WebAppItem['category'] | 'All')[] = [
  'All',
  'Social',
  'Productivity',
  'Utilities',
  'Media',
  'News',
  'Games',
  'Custom'
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<TelegramUser | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Bi-lingual Language Preference (English / Spanish)
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const urlLang = new URLSearchParams(window.location.search).get('lang');
      if (urlLang === 'es' || urlLang === 'en') return urlLang;
      const stored = localStorage.getItem('tma_lang');
      if (stored === 'es' || stored === 'en') return stored;
      if (navigator.language?.startsWith('es')) return 'es';
    }
    return 'en';
  });

  const t = translations[language];

  // Apps state
  const [apps, setApps] = useState<WebAppItem[]>([]);
  const [activeEmbedApp, setActiveEmbedApp] = useState<WebAppItem | null>(null);

  // Filter & Search
  const [activeCategory, setActiveCategory] = useState<WebAppItem['category'] | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<WebAppItem | null>(null);
  const [deleteConfirmAppId, setDeleteConfirmAppId] = useState<string | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  }, []);

  // Sync language with Telegram Cloud Storage
  const handleToggleLanguage = useCallback((newLang: Language) => {
    setLanguage(newLang);
    try { localStorage.setItem('tma_lang', newLang); } catch {}
    cloudStorageSetItem('tma_lang', newLang).catch(() => {});
  }, []);

  // Init Telegram
  useEffect(() => {
    initTelegramApp();
    const tgUser = getTelegramUser();
    if (tgUser) {
      setCurrentUser(tgUser);
    }

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('action') === 'add') {
      setIsAddModalOpen(true);
    }
    const paramLang = searchParams.get('lang');
    if (paramLang === 'es' || paramLang === 'en') {
      setLanguage(paramLang);
    } else {
      // Load saved language from Telegram Cloud Storage
      cloudStorageGetItem('tma_lang').then((savedLang) => {
        if (savedLang === 'es' || savedLang === 'en') {
          setLanguage(savedLang);
        }
      });
    }

    const initDataStr = getInitDataString();
    if (initDataStr) {
      fetch('/api/auth/validate-init-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: initDataStr })
      })
        .then(r => r.json())
        .then(authRes => {
          if (authRes.user) setCurrentUser(authRes.user);
        })
        .catch(() => {});
    }
  }, []);

  // Sync theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load apps directly from Telegram Cloud Storage (with fallback to local storage)
  useEffect(() => {
    const userId = currentUser?.id || 'guest';
    const localKey = `tma_apps_${userId}`;

    // 1. Query Telegram Cloud Storage
    cloudStorageGetItem('tma_cloud_apps').then((cloudVal) => {
      if (cloudVal) {
        try {
          const parsed = JSON.parse(cloudVal);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setApps(parsed);
            try { localStorage.setItem(localKey, cloudVal); } catch {}
            return;
          }
        } catch {}
      }

      // 2. Fallback to localStorage
      try {
        const cached = localStorage.getItem(localKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setApps(parsed);
            return;
          }
        }
      } catch {}

      // 3. Fallback to default presets
      setApps(DEFAULT_APPS);
    });
  }, [currentUser?.id]);

  // Save apps list directly to Telegram Cloud Storage & LocalStorage
  const handleSaveAppsList = useCallback((updatedApps: WebAppItem[]) => {
    const userId = currentUser?.id || 'guest';
    const localKey = `tma_apps_${userId}`;
    const serialized = JSON.stringify(updatedApps);

    setApps(updatedApps);
    try { localStorage.setItem(localKey, serialized); } catch {}

    // Persist apps and credentials directly in Telegram Cloud Storage
    cloudStorageSetItem('tma_cloud_apps', serialized).catch(() => {});
  }, [currentUser?.id]);

  // Add / Edit app
  const handleSaveApp = useCallback((appItem: WebAppItem) => {
    triggerHaptic('success');
    let updated: WebAppItem[];
    const exists = apps.some(a => a.id === appItem.id);

    if (exists) {
      updated = apps.map(a => (a.id === appItem.id ? appItem : a));
      showToast(`${t.toasts.updated}: ${appItem.name}`);
    } else {
      updated = [appItem, ...apps];
      showToast(`${t.toasts.added}: ${appItem.name}`);
    }

    handleSaveAppsList(updated);
    setEditingApp(null);
  }, [apps, handleSaveAppsList, showToast, t.toasts.added, t.toasts.updated]);

  // Delete app
  const handleDeleteApp = useCallback((appId: string) => {
    triggerHaptic('warning');
    const target = apps.find(a => a.id === appId);
    const updated = apps.filter(a => a.id !== appId);
    handleSaveAppsList(updated);
    setDeleteConfirmAppId(null);
    showToast(`${t.toasts.deleted}: ${target?.name || 'app'}`);
  }, [apps, handleSaveAppsList, showToast, t.toasts.deleted]);

  // Reset defaults
  const handleResetDefaults = useCallback(() => {
    triggerHaptic('medium');
    handleSaveAppsList(DEFAULT_APPS);
    showToast(t.toasts.reset);
  }, [handleSaveAppsList, showToast, t.toasts.reset]);

  // Launch in-app embed
  const handleLaunchEmbed = useCallback((appItem: WebAppItem) => {
    triggerHaptic('medium');
    setActiveEmbedApp(appItem);
  }, []);

  // Filtered apps
  const filteredApps = useMemo(() => {
    return apps.filter(app => {
      const matchesCategory = activeCategory === 'All' || app.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = 
        !q ||
        app.name.toLowerCase().includes(q) ||
        app.url.toLowerCase().includes(q) ||
        app.category.toLowerCase().includes(q) ||
        (app.description && app.description.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [apps, activeCategory, searchQuery]);

  // Strict In-App Embed Viewer
  if (activeEmbedApp) {
    return (
      <EmbedViewer
        app={activeEmbedApp}
        language={language}
        onBackToLauncher={() => {
          triggerHaptic('selection');
          setActiveEmbedApp(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--tg-theme-bg-color,#17212b)] text-[var(--tg-theme-text-color,#ffffff)] antialiased">
      {/* Clean Header */}
      <Header
        user={currentUser}
        theme={theme}
        language={language}
        onToggleLanguage={handleToggleLanguage}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        onOpenAddModal={() => {
          setEditingApp(null);
          setIsAddModalOpen(true);
        }}
        onResetDefaults={handleResetDefaults}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalApps={apps.length}
      />

      {/* Category Tabs */}
      <div className="bg-[var(--tg-theme-bg-color,#17212b)] border-b border-[var(--tg-theme-secondary-bg-color,#232e3c)] px-4 py-2 overflow-x-auto no-scrollbar">
        <div className="max-w-4xl mx-auto flex items-center gap-1.5 min-w-max">
          {CATEGORY_TABS.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                triggerHaptic('selection');
                setActiveCategory(cat);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-[var(--tg-theme-button-color,#2b73bc)] text-[var(--tg-theme-button-text-color,#ffffff)] shadow-sm'
                  : 'bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-[var(--tg-theme-hint-color,#708499)] hover:text-white'
              }`}
            >
              {t.categories[cat] || cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Apps Grid */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-4">
        {filteredApps.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredApps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
                language={language}
                onLaunchEmbed={handleLaunchEmbed}
                onEdit={(item) => {
                  setEditingApp(item);
                  setIsAddModalOpen(true);
                }}
                onDelete={(appId) => setDeleteConfirmAppId(appId)}
              />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-[var(--tg-theme-hint-color,#708499)] flex items-center justify-center mx-auto">
              <Compass className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-sm">
              {t.empty.title}
            </h3>
            <p className="text-xs text-[var(--tg-theme-hint-color,#708499)]">
              {searchQuery ? `${t.empty.noMatches}` : t.empty.noMatches}
            </p>
            <div className="pt-2 flex justify-center gap-2">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-3 py-1.5 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-xs text-sky-400 font-semibold"
                >
                  {t.empty.clearSearch}
                </button>
              )}
              <button
                onClick={() => {
                  setEditingApp(null);
                  setIsAddModalOpen(true);
                }}
                className="px-4 py-1.5 rounded-xl bg-[var(--tg-theme-button-color,#2b73bc)] text-white text-xs font-semibold"
              >
                {t.empty.addNew}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteConfirmAppId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-[var(--tg-theme-bg-color,#17212b)] border border-[var(--tg-theme-secondary-bg-color,#232e3c)] p-5 text-[var(--tg-theme-text-color,#ffffff)] shadow-2xl">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm mb-1">
              {t.deleteModal.title}
            </h3>
            <p className="text-xs text-[var(--tg-theme-hint-color,#708499)] mb-4">
              {t.deleteModal.message}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmAppId(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] hover:text-white"
              >
                {t.deleteModal.cancel}
              </button>
              <button
                onClick={() => handleDeleteApp(deleteConfirmAppId)}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-colors"
              >
                {t.deleteModal.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit App Modal */}
      <AddEditAppModal
        isOpen={isAddModalOpen}
        language={language}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingApp(null);
        }}
        onSave={handleSaveApp}
        editingApp={editingApp}
      />

      {/* Lightweight Floating Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)]/95 backdrop-blur-md text-white text-xs font-medium shadow-xl border border-white/10 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
