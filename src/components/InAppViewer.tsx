import React, { useState, useEffect } from 'react';
import { ArrowLeft, RotateCcw, Copy, Check, Key, Globe, ExternalLink, X } from './Icons';
import { WebAppItem, Language } from '../types';
import { getTranslation } from '../i18n/translations';
import { setTelegramBackButton, hapticImpact, hapticNotification } from '../services/telegram';

interface InAppViewerProps {
  app: WebAppItem;
  lang: Language;
  onClose: () => void;
}

export const InAppViewer: React.FC<InAppViewerProps> = ({ app, lang, onClose }) => {
  const [iframeKey, setIframeKey] = useState(0);
  const [showCredsDropdown, setShowCredsDropdown] = useState(false);
  const [copiedField, setCopiedField] = useState<'user' | 'pass' | null>(null);
  const [hasFrameError, setHasFrameError] = useState(false);

  // Bind Telegram native BackButton
  useEffect(() => {
    setTelegramBackButton(true, onClose);
    return () => {
      setTelegramBackButton(false);
    };
  }, [onClose]);

  const handleReload = () => {
    hapticImpact('light');
    setIframeKey((prev) => prev + 1);
    setHasFrameError(false);
  };

  const handleCopy = async (text: string, field: 'user' | 'pass') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      hapticNotification('success');
      setTimeout(() => setCopiedField(null), 2000);
    } catch (e) {
      console.warn('Copy failed:', e);
    }
  };

  const hasCredentials = !!(app.username || app.password);

  return (
    <div className="fixed inset-0 z-40 bg-[#17212b] text-white flex flex-col overflow-hidden">
      {/* In-App Telegram Header Bar */}
      <header className="h-12 bg-[#242f3d] border-b border-white/10 px-3 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-200 text-xs font-semibold active:scale-95 transition"
            title={getTranslation(lang, 'back')}
          >
            <ArrowLeft className="w-4 h-4 text-[#64b5f6]" />
            <span className="hidden sm:inline">{getTranslation(lang, 'back')}</span>
          </button>

          <div className="flex items-center gap-2 min-w-0">
            {app.icon ? (
              <img
                src={app.icon}
                alt=""
                className="w-5 h-5 rounded-md object-contain shrink-0"
              />
            ) : (
              <div className="w-5 h-5 rounded-md bg-[#17212b] flex items-center justify-center text-[10px] font-bold text-[#64b5f6] shrink-0">
                {app.title.charAt(0)}
              </div>
            )}
            <span className="text-xs font-bold truncate max-w-[140px] sm:max-w-[200px]">
              {app.title}
            </span>
          </div>
        </div>

        {/* Right action buttons: Credentials, Reload, Close */}
        <div className="flex items-center gap-1.5 relative">
          {hasCredentials && (
            <div className="relative">
              <button
                onClick={() => {
                  hapticImpact('light');
                  setShowCredsDropdown(!showCredsDropdown);
                }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
                  showCredsDropdown
                    ? 'bg-amber-400 text-black'
                    : 'bg-amber-400/20 text-amber-300 hover:bg-amber-400/30'
                }`}
                title={getTranslation(lang, 'savedLogins')}
              >
                <Key className="w-3.5 h-3.5" />
                <span className="text-[11px] font-semibold">{getTranslation(lang, 'login')}</span>
              </button>

              {/* Credentials Popover */}
              {showCredsDropdown && (
                <div className="absolute right-0 top-9 w-64 bg-[#17212b] border border-white/10 rounded-2xl p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5 text-[11px] font-semibold text-gray-300">
                    <span>{getTranslation(lang, 'savedLogins')}</span>
                    <button
                      onClick={() => setShowCredsDropdown(false)}
                      className="p-1 text-gray-400 hover:text-white rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {app.username && (
                    <div className="mb-2 p-2 rounded-xl bg-[#242f3d] flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[9px] text-gray-400">{getTranslation(lang, 'username')}</div>
                        <div className="text-xs font-mono font-medium truncate text-white">{app.username}</div>
                      </div>
                      <button
                        onClick={() => handleCopy(app.username!, 'user')}
                        className="px-2 py-1 rounded-md bg-[#2481cc]/20 hover:bg-[#2481cc]/30 text-[#64b5f6] text-[10px] font-semibold shrink-0 flex items-center gap-1"
                      >
                        {copiedField === 'user' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">{getTranslation(lang, 'copied')}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>{getTranslation(lang, 'copy')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {app.password && (
                    <div className="p-2 rounded-xl bg-[#242f3d] flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[9px] text-gray-400">{getTranslation(lang, 'password')}</div>
                        <div className="text-xs font-mono font-medium text-white">••••••••</div>
                      </div>
                      <button
                        onClick={() => handleCopy(app.password!, 'pass')}
                        className="px-2 py-1 rounded-md bg-[#2481cc]/20 hover:bg-[#2481cc]/30 text-[#64b5f6] text-[10px] font-semibold shrink-0 flex items-center gap-1"
                      >
                        {copiedField === 'pass' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">{getTranslation(lang, 'copied')}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>{getTranslation(lang, 'copy')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Reload Frame Button */}
          <button
            onClick={handleReload}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition active:scale-95"
            title={getTranslation(lang, 'reload')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Close button */}
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main In-App Web View */}
      <div className="flex-1 relative bg-black/40 w-full h-full">
        <iframe
          key={iframeKey}
          src={app.url}
          title={app.title}
          className="w-full h-full border-0 bg-white"
          allow="camera; microphone; geolocation; clipboard-read; clipboard-write; fullscreen; autoplay; encrypted-media"
          sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts allow-top-navigation-by-user-activation"
          onError={() => setHasFrameError(true)}
        />

        {/* If user needs quick access or if site restricts frame */}
        {hasFrameError && (
          <div className="absolute inset-0 bg-[#17212b] p-6 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#242f3d] flex items-center justify-center mb-4 text-[#64b5f6]">
              <Globe className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">{app.title}</h3>
            <p className="text-xs text-gray-400 max-w-xs mb-4">
              {app.url}
            </p>
            <button
              onClick={handleReload}
              className="px-4 py-2 rounded-xl bg-[#2481cc] text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{getTranslation(lang, 'reload')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
