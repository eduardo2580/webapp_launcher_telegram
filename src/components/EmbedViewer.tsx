import React, { useState, useEffect, useRef } from 'react';
import { 
  ArrowLeft, 
  ExternalLink, 
  RotateCw, 
  ShieldAlert, 
  Home, 
  Globe, 
  Copy, 
  Check,
  Maximize,
  Minimize
} from 'lucide-react';
import { WebAppItem } from '../types';
import { triggerHaptic, openExternalUrl, getTelegramWebApp } from '../services/telegram';

interface EmbedViewerProps {
  app: WebAppItem;
  onBackToLauncher: () => void;
}

export const EmbedViewer: React.FC<EmbedViewerProps> = ({
  app,
  onBackToLauncher
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(1);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showXFrameBanner, setShowXFrameBanner] = useState(app.knownBlockedIframe ?? false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Integrate Telegram Native BackButton
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

  const handleOpenExternal = () => {
    triggerHaptic('medium');
    openExternalUrl(app.url);
  };

  const handleCopy = () => {
    triggerHaptic('selection');
    navigator.clipboard.writeText(app.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  return (
    <div 
      ref={containerRef} 
      className="fixed inset-0 z-50 flex flex-col bg-[var(--tg-theme-bg-color,#17212b)] text-[var(--tg-theme-text-color,#ffffff)] select-none"
    >
      {/* Persistent Top Navigation Bar */}
      <nav className="h-14 flex-shrink-0 bg-[var(--tg-theme-secondary-bg-color,#232e3c)] border-b border-[var(--tg-theme-section-bg-color,#1c2733)] px-3 flex items-center justify-between gap-2 shadow-md">
        {/* Left: Back to Launcher / Home button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              triggerHaptic('selection');
              onBackToLauncher();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--tg-theme-button-color,#2b73bc)] text-[var(--tg-theme-button-text-color,#ffffff)] text-xs font-semibold hover:opacity-90 active:scale-95 transition-all shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Launcher</span>
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              onBackToLauncher();
            }}
            title="Return to Home Dashboard"
            className="p-2 rounded-xl text-[var(--tg-theme-hint-color,#708499)] hover:text-white hover:bg-[var(--tg-theme-bg-color,#17212b)] transition-colors"
          >
            <Home className="w-4 h-4" />
          </button>
        </div>

        {/* Center: App Identity & Status */}
        <div className="flex items-center gap-2 min-w-0 max-w-[40%] sm:max-w-md">
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
          <div className="min-w-0">
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

        {/* Right: Controls (Refresh, External, Fullscreen, Copy) */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            title="Reload frame"
            className="p-2 rounded-xl text-[var(--tg-theme-hint-color,#708499)] hover:text-white hover:bg-[var(--tg-theme-bg-color,#17212b)] transition-colors"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>

          <button
            onClick={handleCopy}
            title={copied ? "Copied URL!" : "Copy app URL"}
            className="p-2 rounded-xl text-[var(--tg-theme-hint-color,#708499)] hover:text-white hover:bg-[var(--tg-theme-bg-color,#17212b)] transition-colors hidden xs:flex"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className="p-2 rounded-xl text-[var(--tg-theme-hint-color,#708499)] hover:text-white hover:bg-[var(--tg-theme-bg-color,#17212b)] transition-colors hidden sm:flex"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          {/* Prominent External Launch Fallback Button */}
          <button
            onClick={handleOpenExternal}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30 hover:bg-sky-500/25 active:scale-95 text-xs font-semibold transition-all"
            title="Open app in external browser tab / window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open External</span>
          </button>
        </div>
      </nav>

      {/* X-Frame-Options / CSP Alert Banner for Protected Sites */}
      {showXFrameBanner && (
        <div className="bg-amber-950/80 border-b border-amber-600/40 px-4 py-2.5 text-xs flex items-center justify-between gap-3 text-amber-200">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div>
              <span className="font-semibold text-amber-300">X-Frame Policy Notice:</span>{' '}
              <span>
                {app.name} ({domain}) typically blocks direct iframe embedding (`X-Frame-Options: DENY` or `frame-ancestors`).
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleOpenExternal}
              className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold hover:bg-amber-400 active:scale-95 transition-all text-[11px]"
            >
              Open in Browser Now
            </button>
            <button
              onClick={() => setShowXFrameBanner(false)}
              className="text-amber-400 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Iframe Viewport Container */}
      <div className="relative flex-1 w-full h-full overflow-hidden bg-black/40">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--tg-theme-bg-color,#17212b)]/80 backdrop-blur-sm z-10 transition-opacity">
            <div className="w-10 h-10 border-3 border-sky-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium text-[var(--tg-theme-text-color,#ffffff)]">
              Loading {app.name}...
            </p>
            <p className="text-xs text-[var(--tg-theme-hint-color,#708499)] mt-1">
              Connecting to {domain}
            </p>
          </div>
        )}

        <iframe
          key={iframeKey}
          src={app.url}
          title={app.name}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setShowXFrameBanner(true);
          }}
          className="w-full h-full border-0 select-text"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-presentation"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        />
      </div>
    </div>
  );
};
