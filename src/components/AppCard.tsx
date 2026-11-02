import React, { useState } from 'react';
import { 
  Play, 
  Trash2, 
  Edit3, 
  Globe, 
  Share2, 
  Check,
  Lock
} from 'lucide-react';
import { WebAppItem, Language } from '../types';
import { translations } from '../i18n/translations';
import { triggerHaptic } from '../services/telegram';

interface AppCardProps {
  app: WebAppItem;
  language: Language;
  onLaunchEmbed: (app: WebAppItem) => void;
  onEdit: (app: WebAppItem) => void;
  onDelete: (appId: string) => void;
}

export const AppCard: React.FC<AppCardProps> = ({
  app,
  language,
  onLaunchEmbed,
  onEdit,
  onDelete
}) => {
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = translations[language];

  const getFaviconUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128`;
    } catch {
      return '';
    }
  };

  const domain = (() => {
    try {
      return new URL(app.url).hostname.replace(/^www\./, '');
    } catch {
      return app.url;
    }
  })();

  const handleLaunch = () => {
    triggerHaptic('medium');
    onLaunchEmbed(app);
  };

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    triggerHaptic('selection');
    navigator.clipboard.writeText(app.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasCredentials = Boolean(app.username || app.password);

  const categoryColorMap: Record<string, string> = {
    Social: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    Productivity: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    Utilities: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    Media: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    News: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    Games: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    Custom: 'bg-purple-500/15 text-purple-400 border-purple-500/30'
  };

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] border border-[var(--tg-theme-section-bg-color,#1c2733)] hover:border-sky-500/40 p-4 transition-all duration-200 hover:shadow-lg hover:shadow-sky-500/5">
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          {/* Icon + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div 
              className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden bg-[var(--tg-theme-bg-color,#17212b)] border border-white/10 shadow-inner"
              style={{
                boxShadow: app.accentColor ? `0 0 15px ${app.accentColor}25` : undefined
              }}
            >
              {!imageError && (app.iconUrl || getFaviconUrl(app.url)) ? (
                <img
                  src={app.iconUrl || getFaviconUrl(app.url)}
                  alt={app.name}
                  className="w-7 h-7 object-contain"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div 
                  className="w-full h-full flex items-center justify-center font-bold text-base text-white"
                  style={{ backgroundColor: app.accentColor || '#3b82f6' }}
                >
                  {app.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="min-w-0">
              <h3 className="font-bold text-sm text-[var(--tg-theme-text-color,#ffffff)] truncate group-hover:text-sky-400 transition-colors">
                {app.name}
              </h3>
              <p className="text-xs text-[var(--tg-theme-hint-color,#708499)] truncate flex items-center gap-1">
                <Globe className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{domain}</span>
              </p>
            </div>
          </div>

          {/* Quick Actions (Share, Edit, Delete) */}
          <div className="flex items-center gap-1 opacity-80 sm:opacity-40 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleCopyLink}
              title={copied ? t.card.copied : t.card.copyLink}
              className="p-1.5 rounded-lg text-[var(--tg-theme-hint-color,#708499)] hover:text-sky-400 hover:bg-[var(--tg-theme-bg-color,#17212b)] transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => {
                triggerHaptic('selection');
                onEdit(app);
              }}
              title={t.card.edit}
              className="p-1.5 rounded-lg text-[var(--tg-theme-hint-color,#708499)] hover:text-sky-400 hover:bg-[var(--tg-theme-bg-color,#17212b)] transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                triggerHaptic('warning');
                onDelete(app.id);
              }}
              title={t.card.delete}
              className="p-1.5 rounded-lg text-[var(--tg-theme-hint-color,#708499)] hover:text-rose-400 hover:bg-[var(--tg-theme-bg-color,#17212b)] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Description */}
        {app.description && (
          <p className="text-xs text-[var(--tg-theme-subtitle-text-color,#8292a1)] line-clamp-2 mb-3 leading-relaxed">
            {app.description}
          </p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${categoryColorMap[app.category] || categoryColorMap.Custom}`}>
            {t.categories[app.category] || app.category}
          </span>

          {hasCredentials && (
            <span 
              title={t.card.hasCredentials}
              className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-full flex items-center gap-1"
            >
              <Lock className="w-2.5 h-2.5" />
              <span>{t.card.hasCredentials}</span>
            </span>
          )}
        </div>
      </div>

      {/* Primary In-App Launch Button */}
      <div className="pt-2 border-t border-white/5">
        <button
          onClick={handleLaunch}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-[var(--tg-theme-button-color,#2b73bc)] text-[var(--tg-theme-button-text-color,#ffffff)] text-xs font-semibold hover:opacity-95 active:scale-95 transition-all shadow-sm shadow-blue-500/20"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{t.card.launch}</span>
        </button>
      </div>
    </div>
  );
};
