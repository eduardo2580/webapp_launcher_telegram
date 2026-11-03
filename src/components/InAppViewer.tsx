import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, RotateCcw, Copy, Check, Key, Globe, Smartphone, X, AlertCircle } from './Icons';
import { WebAppItem, Language } from '../types';
import { getTranslation } from '../i18n/translations';
import {
  setTelegramBackButton,
  hapticImpact,
  hapticNotification,
  launchExternalApp,
  handleExternalLinkClick,
  forceMemoryGarbageCollection,
} from '../services/telegram';

interface InAppViewerProps {
  app: WebAppItem;
  lang: Language;
  onClose: () => void;
}

export const InAppViewer: React.FC<InAppViewerProps> = ({ app, lang, onClose }) => {
  const [currentUrl, setCurrentUrl] = useState(app.url);
  const [iframeKey, setIframeKey] = useState(0);
  const [showCredsDropdown, setShowCredsDropdown] = useState(false);
  const [copiedField, setCopiedField] = useState<'user' | 'pass' | null>(null);
  const [hasFrameError, setHasFrameError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeLinkListenerRef = useRef<{
    document: Document;
    listener: (event: MouseEvent) => void;
  } | null>(null);

  // Identify if URL is localhost or known frame-restricted site (Instagram, Facebook, LinkedIn, X)
  const isLocalhost = currentUrl.includes('localhost') || currentUrl.includes('127.0.0.1');
  const isRestrictedSocial =
    currentUrl.includes('instagram.com') ||
    currentUrl.includes('facebook.com') ||
    currentUrl.includes('linkedin.com') ||
    currentUrl.includes('twitter.com') ||
    currentUrl.includes('x.com');

  // Aggressive teardown function to guarantee zero memory leaks from embedded iframe
  const destroyIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      // 1. Attempt to stop media and timers in accessible content documents
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          const mediaNodes = doc.querySelectorAll('video, audio');
          mediaNodes.forEach((node) => {
            try {
              const media = node as HTMLMediaElement;
              media.pause();
              media.removeAttribute('src');
              media.load();
            } catch {
              // Ignore
            }
          });
          doc.open();
          doc.write('');
          doc.close();
        }
      } catch {
        // Cross-origin restriction is expected for external domains
      }

      // 2. Stop window activity and network execution
      try {
        iframe.contentWindow?.stop();
      } catch {
        // Ignore
      }

      // 3. Clear window references and navigate to about:blank to destroy DOM, scripts, and contexts
      iframe.src = 'about:blank';

      // 4. Detach from DOM if still mounted
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    } catch (err) {
      console.warn('Iframe cleanup notice:', err);
    } finally {
      iframeRef.current = null;
      iframeLinkListenerRef.current?.document.removeEventListener(
        'click',
        iframeLinkListenerRef.current.listener,
        true
      );
      iframeLinkListenerRef.current = null;
      forceMemoryGarbageCollection();
    }
  }, []);

  // Aggressive close handler triggered by user or Telegram native BackButton
  const handleAggressiveClose = useCallback(() => {
    hapticImpact('light');
    destroyIframe();
    onClose();
  }, [destroyIframe, onClose]);

  // Bind Telegram native BackButton and guarantee unmount cleanup
  useEffect(() => {
    setTelegramBackButton(true, handleAggressiveClose);
    return () => {
      setTelegramBackButton(false);
      destroyIframe();
    };
  }, [handleAggressiveClose, destroyIframe]);

  const handleReload = () => {
    hapticImpact('light');
    setIframeKey((prev) => prev + 1);
    setHasFrameError(false);
  };

  const handleIframeLoad = () => {
    const iframeDocument = iframeRef.current?.contentDocument;
    if (!iframeDocument || iframeLinkListenerRef.current?.document === iframeDocument) return;

    iframeLinkListenerRef.current?.document.removeEventListener(
      'click',
      iframeLinkListenerRef.current.listener,
      true
    );
    const listener = (event: MouseEvent) =>
      handleExternalLinkClick(event, iframeDocument.documentElement);
    iframeDocument.addEventListener('click', listener, true);
    iframeLinkListenerRef.current = { document: iframeDocument, listener };
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

  // Open strictly inside Telegram using Telegram's built-in in-app browser
  // This bypasses X-Frame-Options and keeps logins and cookies active without leaving Telegram
  const handleOpenInTelegramBrowser = () => {
    hapticImpact('medium');
    launchExternalApp(currentUrl);
  };

  // 1-Click fix for Android emulator connection refused
  const handleFixEmulatorIp = () => {
    hapticImpact('light');
    const fixed = currentUrl
      .replace('localhost', '10.0.2.2')
      .replace('127.0.0.1', '10.0.2.2');
    setCurrentUrl(fixed);
    setIframeKey((prev) => prev + 1);
    setHasFrameError(false);
  };

  const hasCredentials = !!(app.username || app.password);

  return (
    <div className="fixed inset-0 z-40 bg-[#17212b] text-white flex flex-col overflow-hidden">
      {/* In-App Telegram Header Bar */}
      <header className="h-12 bg-[#242f3d] border-b border-white/10 px-3 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={handleAggressiveClose}
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
            <span className="text-xs font-bold truncate max-w-[130px] sm:max-w-[200px]">
              {app.title}
            </span>
          </div>
        </div>

        {/* Right action buttons: Telegram In-App Browser, Credentials, Reload, Close */}
        <div className="flex items-center gap-1.5 relative">
          {/* Quick Telegram In-App browser launcher button */}
          <button
            onClick={handleOpenInTelegramBrowser}
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg bg-[#2481cc]/20 hover:bg-[#2481cc]/30 text-[#64b5f6] text-[11px] font-semibold transition active:scale-95"
            title={getTranslation(lang, 'openInTgBrowser')}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Navegador do Telegram</span>
          </button>

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
            onClick={handleAggressiveClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Helpful Notification Bar for localhost or X-Frame-Options */}
      {isLocalhost && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 py-1.5 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-1.5 truncate">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">{getTranslation(lang, 'localhostDetected')}</span>
          </div>
          <button
            onClick={handleFixEmulatorIp}
            className="px-2 py-0.5 rounded bg-amber-400 text-black font-semibold text-[10px] shrink-0 hover:bg-amber-300 transition"
          >
            {getTranslation(lang, 'fixWithEmulatorIp')}
          </button>
        </div>
      )}

      {isRestrictedSocial && (
        <div className="bg-[#2481cc]/15 border-b border-[#2481cc]/30 px-3 py-1.5 flex items-center justify-between text-xs text-[#64b5f6]">
          <div className="flex items-center gap-1.5 truncate">
            <Smartphone className="w-4 h-4 text-[#64b5f6] shrink-0" />
            <span className="truncate">{getTranslation(lang, 'frameBlockedNotice')}</span>
          </div>
          <button
            onClick={handleOpenInTelegramBrowser}
            className="px-2 py-0.5 rounded bg-[#2481cc] text-white font-semibold text-[10px] shrink-0 hover:bg-[#1d6fae] transition"
          >
            {getTranslation(lang, 'openInTgBrowser')}
          </button>
        </div>
      )}

      {/* Main In-App Web View */}
      <div className="flex-1 relative bg-black/40 w-full h-full">
        <iframe
          ref={iframeRef}
          key={iframeKey}
          src={currentUrl}
          title={app.title}
          className="w-full h-full border-0 bg-white"
          allow="camera; microphone; geolocation; clipboard-read; clipboard-write; fullscreen; autoplay; encrypted-media"
          sandbox="allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-presentation allow-same-origin allow-scripts"
          onLoad={handleIframeLoad}
          onError={() => setHasFrameError(true)}
        />

        {/* If frame fails to load or connection is refused */}
        {hasFrameError && (
          <div className="absolute inset-0 bg-[#17212b] p-6 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#242f3d] flex items-center justify-center mb-4 text-[#64b5f6]">
              <Globe className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">{app.title}</h3>
            <p className="text-xs text-gray-400 max-w-xs mb-4 font-mono truncate">
              {currentUrl}
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleOpenInTelegramBrowser}
                className="px-4 py-2 rounded-xl bg-[#2481cc] hover:bg-[#1d6fae] text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <Smartphone className="w-4 h-4" />
                <span>{getTranslation(lang, 'openInTgBrowser')}</span>
              </button>
              <button
                onClick={handleReload}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{getTranslation(lang, 'reload')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
