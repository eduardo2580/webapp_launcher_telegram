import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Header 
} from './components/Header';
import { 
  AppCard 
} from './components/AppCard';
import { 
  EmbedViewer 
} from './components/EmbedViewer';
import { 
  AddEditAppModal 
} from './components/AddEditAppModal';
import { 
  BotSetupModal 
} from './components/BotSetupModal';
import { 
  SimulatorBar 
} from './components/SimulatorBar';
import { 
  DEFAULT_APPS 
} from './data/defaultApps';
import { 
  WebAppItem, 
  TelegramUser, 
  BotStatus 
} from './types';
import { 
  initTelegramApp, 
  isTelegramEnv, 
  getTelegramUser, 
  getInitDataString, 
  triggerHaptic,
  openExternalUrl
} from './services/telegram';
import { 
  Compass, 
  Grid, 
  Plus, 
  Bot, 
  Sparkles, 
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

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
  // Telegram environment and User
  const [isInsideTg, setIsInsideTg] = useState(false);
  const [currentUser, setCurrentUser] = useState<TelegramUser | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Apps state
  const [apps, setApps] = useState<WebAppItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Active Embed Viewer app (when viewing inside iframe)
  const [activeEmbedApp, setActiveEmbedApp] = useState<WebAppItem | null>(null);

  // Filter & Search
  const [activeCategory, setActiveCategory] = useState<WebAppItem['category'] | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<WebAppItem | null>(null);
  const [isBotModalOpen, setIsBotModalOpen] = useState(false);
  const [deleteConfirmAppId, setDeleteConfirmAppId] = useState<string | null>(null);

  // Bot Status
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  }, []);

  // Initialize Telegram WebApp SDK
  useEffect(() => {
    initTelegramApp();
    const inTg = isTelegramEnv();
    setIsInsideTg(inTg);

    const tgUser = getTelegramUser();
    if (tgUser) {
      setCurrentUser(tgUser);
    } else {
      // Default mock user for browser preview
      setCurrentUser({
        id: 12345678,
        first_name: 'Telegram',
        last_name: 'Explorer',
        username: 'tg_launcher_user'
      });
    }

    // Check URL query parameters (e.g. ?action=add)
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('action') === 'add') {
      setIsAddModalOpen(true);
    }

    // Fetch Bot Status from backend
    fetch('/api/bot/status')
      .then(r => r.json())
      .then(data => setBotStatus(data))
      .catch(() => {});

    // Validate initData if present
    const initDataStr = getInitDataString();
    if (initDataStr) {
      fetch('/api/auth/validate-init-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: initDataStr })
      })
        .then(r => r.json())
        .then(authRes => {
          if (authRes.user) {
            setCurrentUser(authRes.user);
          }
        })
        .catch(() => {});
    }
  }, []);

  // Apply theme to HTML root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load apps from LocalStorage or Backend API
  useEffect(() => {
    const userId = currentUser?.id || 'guest';
    const localKey = `tma_apps_${userId}`;

    // 1. Try local storage first for instant render
    const cached = localStorage.getItem(localKey);
    let initialList: WebAppItem[] = DEFAULT_APPS;

    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          initialList = parsed;
        }
      } catch (err) {
        console.error('Failed to parse cached apps', err);
      }
    }
    setApps(initialList);
    setIsLoaded(true);

    // 2. Sync from backend database
    fetch(`/api/apps?userId=${userId}`)
      .then(res => res.json())
      .then(data => {
        if (data.hasCustomApps && Array.isArray(data.apps)) {
          setApps(data.apps);
          localStorage.setItem(localKey, JSON.stringify(data.apps));
        }
      })
      .catch(err => {
        console.warn('Backend apps sync error:', err);
      });
  }, [currentUser?.id]);

  // Save apps handler (updates local state, localStorage, and syncs to backend)
  const handleSaveAppsList = useCallback((updatedApps: WebAppItem[]) => {
    const userId = currentUser?.id || 'guest';
    const localKey = `tma_apps_${userId}`;

    setApps(updatedApps);
    localStorage.setItem(localKey, JSON.stringify(updatedApps));

    // Sync to backend
    fetch('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        apps: updatedApps
      })
    }).catch(err => {
      console.warn('Error syncing apps to backend:', err);
    });
  }, [currentUser?.id]);

  // Add / Edit app
  const handleSaveApp = useCallback((appItem: WebAppItem) => {
    triggerHaptic('success');
    let updated: WebAppItem[];
    const exists = apps.some(a => a.id === appItem.id);

    if (exists) {
      updated = apps.map(a => (a.id === appItem.id ? appItem : a));
      showToast(`Updated ${appItem.name}`);
    } else {
      updated = [appItem, ...apps];
      showToast(`Added ${appItem.name} to launcher`);
    }

    handleSaveAppsList(updated);
    setEditingApp(null);
  }, [apps, handleSaveAppsList, showToast]);

  // Delete app
  const handleDeleteApp = useCallback((appId: string) => {
    triggerHaptic('warning');
    const target = apps.find(a => a.id === appId);
    const updated = apps.filter(a => a.id !== appId);
    handleSaveAppsList(updated);
    setDeleteConfirmAppId(null);
    showToast(`Removed ${target?.name || 'app'}`);
  }, [apps, handleSaveAppsList, showToast]);

  // Reset to default apps
  const handleResetDefaults = useCallback(() => {
    triggerHaptic('medium');
    handleSaveAppsList(DEFAULT_APPS);
    showToast('Reset launcher to default preset apps');
  }, [handleSaveAppsList, showToast]);

  // Launch in embed mode
  const handleLaunchEmbed = useCallback((appItem: WebAppItem) => {
    triggerHaptic('medium');
    setActiveEmbedApp(appItem);
  }, []);

  // Filtered apps based on search & category tab
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

  // If user opened an app in Iframe Embed mode, render the EmbedViewer
  if (activeEmbedApp) {
    return (
      <EmbedViewer
        app={activeEmbedApp}
        onBackToLauncher={() => {
          triggerHaptic('selection');
          setActiveEmbedApp(null);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--tg-theme-bg-color,#17212b)] text-[var(--tg-theme-text-color,#ffffff)]">
      {/* Top Simulator Bar (interactive tools for previewing & testing) */}
      <SimulatorBar
        isInsideTg={isInsideTg}
        currentUser={currentUser}
        onSelectMockUser={(u) => {
          setCurrentUser(u);
          showToast(`Switched user profile to ${u.first_name}`);
        }}
        botStatus={botStatus}
        onOpenBotModal={() => setIsBotModalOpen(true)}
      />

      {/* Main Header */}
      <Header
        user={currentUser}
        botStatus={botStatus}
        isInsideTg={isInsideTg}
        theme={theme}
        onToggleTheme={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
        onOpenAddModal={() => {
          setEditingApp(null);
          setIsAddModalOpen(true);
        }}
        onOpenBotModal={() => setIsBotModalOpen(true)}
        onResetDefaults={handleResetDefaults}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalApps={apps.length}
      />

      {/* Category Pills Bar */}
      <div className="bg-[var(--tg-theme-bg-color,#17212b)] border-b border-[var(--tg-theme-secondary-bg-color,#232e3c)] px-4 py-2.5 overflow-x-auto no-scrollbar">
        <div className="max-w-5xl mx-auto flex items-center gap-1.5 min-w-max">
          {CATEGORY_TABS.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                triggerHaptic('selection');
                setActiveCategory(cat);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeCategory === cat
                  ? 'bg-[var(--tg-theme-button-color,#2b73bc)] text-[var(--tg-theme-button-text-color,#ffffff)] shadow-sm'
                  : 'bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-[var(--tg-theme-hint-color,#708499)] hover:text-white hover:bg-[var(--tg-theme-section-bg-color,#1c2733)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Dashboard */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        {/* Hero Notice / Quick Info */}
        <div className="mb-6 p-4 rounded-3xl bg-gradient-to-r from-sky-500/10 via-blue-600/10 to-indigo-600/10 border border-sky-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-sm font-bold text-[var(--tg-theme-text-color,#ffffff)]">
                Telegram Web App Launcher Ready
              </h2>
            </div>
            <p className="text-xs text-[var(--tg-theme-hint-color,#708499)] max-w-xl leading-relaxed">
              Open apps in the built-in iframe viewer or launch directly in an external tab. Security-restricted platforms (Facebook, Instagram, LinkedIn) automatically include instant browser fallback.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                triggerHaptic('selection');
                setIsBotModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 text-xs font-semibold transition-all"
            >
              <Bot className="w-4 h-4" />
              <span>BotFather Setup</span>
            </button>
            <button
              onClick={() => {
                triggerHaptic('medium');
                setEditingApp(null);
                setIsAddModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--tg-theme-button-color,#2b73bc)] text-white text-xs font-semibold hover:opacity-90 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Custom Link</span>
            </button>
          </div>
        </div>

        {/* Apps Grid */}
        {filteredApps.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredApps.map((app) => (
              <AppCard
                key={app.id}
                app={app}
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
          <div className="py-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-[var(--tg-theme-hint-color,#708499)] flex items-center justify-center mx-auto">
              <Compass className="w-7 h-7" />
            </div>
            <h3 className="font-bold text-sm text-[var(--tg-theme-text-color,#ffffff)]">
              No web apps found
            </h3>
            <p className="text-xs text-[var(--tg-theme-hint-color,#708499)] max-w-sm mx-auto">
              {searchQuery ? `No matches for "${searchQuery}". Try a different keyword.` : `No apps in category "${activeCategory}".`}
            </p>
            <div className="pt-2 flex justify-center gap-2">
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-3 py-1.5 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-xs text-sky-400 font-semibold"
                >
                  Clear search
                </button>
              )}
              <button
                onClick={() => {
                  setEditingApp(null);
                  setIsAddModalOpen(true);
                }}
                className="px-4 py-1.5 rounded-xl bg-[var(--tg-theme-button-color,#2b73bc)] text-white text-xs font-semibold"
              >
                Add new app
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      {deleteConfirmAppId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-[var(--tg-theme-bg-color,#17212b)] border border-[var(--tg-theme-secondary-bg-color,#232e3c)] p-5 text-[var(--tg-theme-text-color,#ffffff)] shadow-2xl">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mb-3">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm mb-1">
              Delete this web app?
            </h3>
            <p className="text-xs text-[var(--tg-theme-hint-color,#708499)] mb-4">
              This app will be removed from your personal launcher. You can re-add it or reset defaults anytime.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmAppId(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteApp(deleteConfirmAppId)}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-colors"
              >
                Delete App
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit App Modal */}
      <AddEditAppModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingApp(null);
        }}
        onSave={handleSaveApp}
        editingApp={editingApp}
      />

      {/* Bot Setup & BotFather Modal */}
      <BotSetupModal
        isOpen={isBotModalOpen}
        onClose={() => setIsBotModalOpen(false)}
        botStatus={botStatus}
        onBotConfigured={(status) => {
          setBotStatus(status);
          showToast(`Telegram bot @${status.botUsername} linked!`);
        }}
      />

      {/* Floating Toast notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)]/95 backdrop-blur-md text-white text-xs font-semibold shadow-2xl border border-white/10 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
