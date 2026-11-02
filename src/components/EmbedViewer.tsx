import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  RotateCw, 
  Globe, 
  Maximize, 
  Minimize,
  User,
  Key,
  Check
} from 'lucide-react';
import { WebAppItem, Language } from '../types';
import { translations } from '../i18n/translations';
import { triggerHaptic, getTelegramWebApp } from '../services/telegram';

interface EmbedViewerProps {
  app: WebAppItem;
  language: Language;
  onBackToLauncher: () => void;
}

export const EmbedViewer: React.FC<EmbedViewerProps> = ({
  app,
  language,
  onBackToLauncher
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [copiedField, setCopiedField] = useState<'user' | 'pass' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const t = translations[language];

  // Route framing-restricted sites through in-app proxy
  useEffect(() => {
    try {
      const host = new URL(app.url).hostname.toLowerCase();
      if (
        host.includes('facebook') ||
        host.includes('instagram') ||
        host.includes('linkedin') ||
        host.includes('twitter') ||
        host.includes('x.com')
      ) {
        setUseProxy(true);
      }
    } catch {}
  }, [app.url]);

  // Telegram native BackButton
  useEffect(() => {
    const tg = getTelegramWebApp();
    if (tg?.BackButton) {
      tg.BackButton.show();
      const handleBack = () => {
        triggerHaptic('selection');
        onBackToLauncher();
      };
      tg.BackButton.onClick(handleBack);

      return () => {
        tg.BackButton.offClick(handleBack);
        tg.BackButton.hide();
      };
    }
  }, [onBackToLauncher]);

  const domain = (() => {
    try {
      return new URL(app.url).hostname;
    } catch {
      return app.url;
    }
  })();

  const handleRefresh = () => {
    triggerHaptic('light');
    setIsLoading(true);
    setIframeKey(prev => prev + 1);
  };

  const handleCopyUser = () => {
    if (!app.username) return;
    triggerHaptic('selection');
    navigator.clipboard.writeText(app.username);
    setCopiedField('user');
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleCopyPass = () => {
    if (!app.password) return;
    triggerHaptic('selection');
    navigator.clipboard.writeText(app.password);
    setCopiedField('pass');
    setTimeout(() => setCopiedField(null), 1800);
  };

  const toggleFullscreen = () => {
    triggerHaptic('light');
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const frameSrc = useProxy ? `/api/proxy?url=${encodeURIComponent(app.url)}` : app.url;

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 z-50 flex flex-col bg-[var(--tg-theme-bg-color,#17212b)] text-[var(--tg-theme-text-color,#ffffff)] select-none"
    >
      {/* Persistent Top Navigation Bar */}
      <nav className="h-14 flex-shrink-0 bg-[var(--tg-theme-secondary-bg-color,#232e3c)] border-b border-[var(--tg-theme-section-bg-color,#1c2733)] px-3 flex items-center justify-between gap-2 shadow-md">
        {/* 🔙 Back to Launcher button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              triggerHaptic('selection');
              onBackToLauncher();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[var(--tg-theme-button-color,#2b73bc)] text-[var(--tg-theme-button-text-color,#ffffff)] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.viewer.backToLauncher}</span>
          </button>
        </div>

        {/* 🏷️ App Title Indicator */}
        <div className="flex items-center gap-2 min-w-0 max-w-[40%] sm:max-w-xs">
          {app.iconUrl && (
            <img 
              src={app.iconUrl} 
              alt={app.name} 
              className="w-5 h-5 object-contain rounded flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          )}
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-bold text-xs sm:text-sm text-[var(--tg-theme-text-color,#ffffff)] truncate">
                {app.name}
              </span>
              {isLoading && (
                <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping flex-shrink-0" />
              )}
            </div>
            <p className="text-[10px] text-[var(--tg-theme-hint-color,#708499)] truncate flex items-center gap-1">
              <Globe className="w-2.5 h-2.5 flex-shrink-0" />
              <span className="truncate">{domain}</span>
            </p>
          </div>
        </div>

        {/* Cloud Credentials Autofill & Controls */}
        <div className="flex items-center gap-1">
          {/* Quick Copy Username button */}
          {app.username && (
            <button
              onClick={handleCopyUser}
              title={`Copy username: ${app.username}`}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30 text-[11px] font-medium hover:bg-sky-500/25 active:scale-95 transition-all"
            >
              {copiedField === 'user' ? <Check className="w-3 h-3 text-emerald-400" /> : <User className="w-3 h-3" />}
              <span className="hidden xs:inline">{copiedField === 'user' ? 'OK!' : t.viewer.copyUser}</span>
            </button>
          )}

          {/* Quick Copy Password button */}
          {app.password && (
            <button
              onClick={handleCopyPass}
              title="Copy password from Telegram Cloud"
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[11px] font-medium hover:bg-amber-500/25 active:scale-95 transition-all"
            >
              {copiedField === 'pass' ? <Check className="w-3 h-3 text-emerald-400" /> : <Key className="w-3 h-3" />}
              <span className="hidden xs:inline">{copiedField === 'pass' ? 'OK!' : t.viewer.copyPass}</span>
            </button>
          )}

          <button
            onClick={handleRefresh}
            title={t.viewer.refresh}
            className="p-1.5 rounded-lg text-[var(--tg-theme-hint-color,#708499)] hover:text-white hover:bg-[var(--tg-theme-bg-color,#17212b)] transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>

          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="p-1.5 rounded-lg text-[var(--tg-theme-hint-color,#708499)] hover:text-white hover:bg-[var(--tg-theme-bg-color,#17212b)] transition-colors hidden sm:flex"
          >
            {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
          </button>
        </div>
      </nav>

      {/* Embedded Iframe Viewport */}
      <div className="relative flex-1 w-full h-full overflow-hidden bg-black/40">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--tg-theme-bg-color,#17212b)]/90 backdrop-blur-sm z-10 transition-opacity">
            <div className="w-9 h-9 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mb-2.5" />
            <p className="text-xs font-semibold text-[var(--tg-theme-text-color,#ffffff)]">
              {t.viewer.loading}
            </p>
            <p className="text-[11px] text-[var(--tg-theme-hint-color,#708499)] mt-0.5">
              {t.viewer.connectingTo} {app.name}
            </p>
          </div>
        )}

        <iframe
          key={iframeKey}
          src={frameSrc}
          title={app.name}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            if (!useProxy) {
              setUseProxy(true);
              setIframeKey(k => k + 1);
            } else {
              setIsLoading(false);
            }
          }}
          className="w-full h-full border-0 select-text"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-presentation"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        />
      </div>
    </div>
  );
};
