import React from 'react';
import { 
  Plus, 
  Sun, 
  Moon, 
  RotateCcw,
  Search
} from 'lucide-react';
import { TelegramUser, Language } from '../types';
import { translations } from '../i18n/translations';
import { triggerHaptic } from '../services/telegram';

interface HeaderProps {
  user: TelegramUser | null;
  theme: 'dark' | 'light';
  language: Language;
  onToggleLanguage: (newLang: Language) => void;
  onToggleTheme: () => void;
  onOpenAddModal: () => void;
  onResetDefaults: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  totalApps: number;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  theme,
  language,
  onToggleLanguage,
  onToggleTheme,
  onOpenAddModal,
  onResetDefaults,
  searchQuery,
  onSearchChange,
  totalApps
}) => {
  const t = translations[language];

  return (
    <header className="sticky top-0 z-30 bg-[var(--tg-theme-bg-color,#17212b)]/95 backdrop-blur-md border-b border-[var(--tg-theme-secondary-bg-color,#232e3c)] px-4 py-3 transition-colors">
      <div className="max-w-4xl mx-auto flex flex-col gap-2.5">
        {/* Top Brand & Actions */}
        <div className="flex items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-sm shadow-sky-500/25">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-[var(--tg-theme-text-color,#ffffff)] tracking-tight">
                  {t.appName}
                </h1>
                <span className="text-[10px] bg-sky-500/15 text-sky-400 border border-sky-500/30 font-medium px-1.5 py-0.2 rounded-full flex items-center gap-0.5">
                  <span>☁️</span>
                  <span className="hidden xs:inline">{t.cloudSynced}</span>
                </span>
              </div>
              {user && (
                <p className="text-[11px] text-[var(--tg-theme-hint-color,#708499)] leading-none mt-0.5">
                  {user.first_name}
                </p>
              )}
            </div>
          </div>

          {/* Minimal Controls */}
          <div className="flex items-center gap-1.5">
            {/* Language Pill Switcher */}
            <div className="flex items-center bg-[var(--tg-theme-secondary-bg-color,#232e3c)] rounded-lg p-0.5 border border-white/5">
              <button
                onClick={() => {
                  triggerHaptic('selection');
                  onToggleLanguage('en');
                }}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${
                  language === 'en'
                    ? 'bg-sky-500 text-white'
                    : 'text-[var(--tg-theme-hint-color,#708499)] hover:text-white'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => {
                  triggerHaptic('selection');
                  onToggleLanguage('es');
                }}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${
                  language === 'es'
                    ? 'bg-sky-500 text-white'
                    : 'text-[var(--tg-theme-hint-color,#708499)] hover:text-white'
                }`}
              >
                ES
              </button>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={() => {
                triggerHaptic('light');
                onToggleTheme();
              }}
              className="p-1.5 rounded-lg bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-[var(--tg-theme-hint-color,#708499)] hover:text-white transition-colors"
              title={t.switchTheme}
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
            </button>

            {/* Add App Button */}
            <button
              onClick={() => {
                triggerHaptic('medium');
                onOpenAddModal();
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--tg-theme-button-color,#2b73bc)] text-[var(--tg-theme-button-text-color,#ffffff)] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t.addApp}</span>
            </button>
          </div>
        </div>

        {/* Clean Search Input */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-theme-hint-color,#708499)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-xs text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/40 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--tg-theme-hint-color,#708499)] hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          <button
            onClick={() => {
              triggerHaptic('selection');
              onResetDefaults();
            }}
            title={t.resetDefaults}
            className="p-1.5 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-[var(--tg-theme-hint-color,#708499)] hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
