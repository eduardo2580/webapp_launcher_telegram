import React from 'react';
import { Cloud, CloudCheck, Plus, RotateCcw, Globe, User } from 'lucide-react';
import { Language, TelegramUser, CloudStorageSyncState } from '../types';
import { getTranslation } from '../i18n/translations';
import { hapticImpact } from '../services/telegram';

interface HeaderProps {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  onAddClick: () => void;
  onResetDefaults: () => void;
  user: TelegramUser | null;
  syncState: CloudStorageSyncState;
}

export const Header: React.FC<HeaderProps> = ({
  lang,
  onLanguageChange,
  onAddClick,
  onResetDefaults,
  user,
  syncState,
}) => {
  const toggleLanguage = () => {
    hapticImpact('light');
    onLanguageChange(lang === 'en' ? 'es' : 'en');
  };

  return (
    <header className="sticky top-0 z-30 bg-[#17212b]/95 backdrop-blur-md border-b border-white/10 px-4 py-3">
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        {/* Brand and user */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#2481cc] to-[#2AABEE] flex items-center justify-center shrink-0 shadow-sm">
            <span className="text-base font-bold text-white">🚀</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white tracking-tight truncate">
                {getTranslation(lang, 'appTitle')}
              </h1>
              {user && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-[#64b5f6] bg-[#2481cc]/15 px-1.5 py-0.5 rounded-full font-medium">
                  <User className="w-3 h-3" />
                  {user.first_name}
                </span>
              )}
            </div>

            {/* Telegram Cloud Storage Status Pill */}
            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
              {syncState.status === 'synced' ? (
                <>
                  <CloudCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">
                    {getTranslation(lang, 'cloudSynced')}
                  </span>
                </>
              ) : syncState.status === 'syncing' ? (
                <>
                  <Cloud className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span className="text-amber-400 font-medium">
                    {getTranslation(lang, 'syncing')}
                  </span>
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-gray-300">
                    {getTranslation(lang, 'localFallback')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 text-xs font-semibold text-gray-200 border border-white/5 transition flex items-center gap-1"
            title="Toggle Language"
          >
            <Globe className="w-3.5 h-3.5 text-[#64b5f6]" />
            <span>{lang.toUpperCase()}</span>
          </button>

          {/* Reset Defaults */}
          <button
            onClick={() => {
              hapticImpact('medium');
              onResetDefaults();
            }}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 text-gray-300 border border-white/5 transition"
            title={getTranslation(lang, 'resetDefaults')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Add App Button */}
          <button
            onClick={() => {
              hapticImpact('light');
              onAddClick();
            }}
            className="px-3 py-1.5 rounded-lg bg-[#2481cc] hover:bg-[#1d6fae] active:scale-95 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{getTranslation(lang, 'addApp')}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
