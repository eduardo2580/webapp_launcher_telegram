import React, { useState } from 'react';
import { ExternalLink, Copy, Check, X, ShieldCheck, Key } from 'lucide-react';
import { WebAppItem, Language } from '../types';
import { getTranslation } from '../i18n/translations';
import { launchExternalApp, hapticImpact, hapticNotification } from '../services/telegram';

interface LaunchModalProps {
  app: WebAppItem | null;
  lang: Language;
  onClose: () => void;
}

export const LaunchModal: React.FC<LaunchModalProps> = ({ app, lang, onClose }) => {
  const [copiedField, setCopiedField] = useState<'user' | 'pass' | null>(null);

  if (!app) return null;

  const handleCopy = async (text: string, field: 'user' | 'pass') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      hapticNotification('success');
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.warn('Copy error:', err);
    }
  };

  const handleLaunch = () => {
    hapticImpact('heavy');
    launchExternalApp(app.url);
    onClose();
  };

  const hasCredentials = !!(app.username || app.password);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-sm bg-[#17212b] border border-white/10 rounded-3xl p-5 shadow-2xl animate-in fade-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#242f3d] border border-white/10 flex items-center justify-center p-2.5 overflow-hidden shrink-0 shadow-inner">
              {app.icon ? (
                <img src={app.icon} alt="" className="w-full h-full object-contain" />
              ) : (
                <span className="text-xl font-bold text-[#64b5f6]">{app.title.charAt(0)}</span>
              )}
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">{app.title}</h3>
              <p className="text-xs text-gray-400 truncate max-w-[180px]">{app.url}</p>
            </div>
          </div>

          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Credentials Box */}
        {hasCredentials ? (
          <div className="mt-4 bg-[#242f3d] border border-white/5 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
              <span className="flex items-center gap-1.5">
                <Key className="w-4 h-4 fill-amber-300/20" />
                <span>{getTranslation(lang, 'readyToLogin')}</span>
              </span>
            </div>

            {app.username && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#17212b] border border-white/5">
                <div className="min-w-0 mr-2">
                  <div className="text-[10px] text-gray-400">{getTranslation(lang, 'username')}</div>
                  <div className="text-xs font-mono text-white truncate font-medium">{app.username}</div>
                </div>
                <button
                  onClick={() => handleCopy(app.username!, 'user')}
                  className="px-2.5 py-1.5 rounded-lg bg-[#2481cc]/20 hover:bg-[#2481cc]/30 text-[#64b5f6] text-xs font-semibold flex items-center gap-1 transition shrink-0 active:scale-95"
                >
                  {copiedField === 'user' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">{getTranslation(lang, 'copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{getTranslation(lang, 'copyUsername')}</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {app.password && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#17212b] border border-white/5">
                <div className="min-w-0 mr-2">
                  <div className="text-[10px] text-gray-400">{getTranslation(lang, 'password')}</div>
                  <div className="text-xs font-mono text-white font-medium">••••••••••••</div>
                </div>
                <button
                  onClick={() => handleCopy(app.password!, 'pass')}
                  className="px-2.5 py-1.5 rounded-lg bg-[#2481cc]/20 hover:bg-[#2481cc]/30 text-[#64b5f6] text-xs font-semibold flex items-center gap-1 transition shrink-0 active:scale-95"
                >
                  {copiedField === 'pass' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">{getTranslation(lang, 'copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{getTranslation(lang, 'copyPassword')}</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 p-3 rounded-2xl bg-[#242f3d]/60 border border-white/5 text-xs text-gray-300">
            {getTranslation(lang, 'launchDesc')}
          </div>
        )}

        {/* Device Connection Guarantee Notice */}
        <div className="mt-3 flex items-center gap-2 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>{getTranslation(lang, 'deviceConnectionNotice')}</span>
        </div>

        {/* Action Button */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold transition"
          >
            {getTranslation(lang, 'cancel')}
          </button>
          <button
            onClick={handleLaunch}
            className="flex-[2] py-3 rounded-xl bg-[#2481cc] hover:bg-[#1d6fae] text-white text-xs font-bold shadow-lg shadow-[#2481cc]/25 flex items-center justify-center gap-2 transition active:scale-98"
          >
            <ExternalLink className="w-4 h-4" />
            <span>{getTranslation(lang, 'launch')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
