import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Language } from '../types';
import { getTranslation } from '../i18n/translations';
import { hapticImpact } from '../services/telegram';

interface PWAInstallButtonProps {
  lang: Language;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ lang }) => {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (isInstalled || !canInstall || dismissed) {
    return null;
  }

  const handleInstallClick = async () => {
    hapticImpact('medium');
    if (isIOS) {
      setShowIOSGuide(true);
    } else {
      await promptInstall();
    }
  };

  return (
    <>
      <div className="mb-4 bg-gradient-to-r from-[#2481cc]/20 via-[#2481cc]/10 to-transparent border border-[#2481cc]/30 rounded-xl p-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#2481cc] flex items-center justify-center shrink-0 shadow-md">
            <Download className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white leading-tight">
              {getTranslation(lang, 'installPWA')}
            </h4>
            <p className="text-xs text-gray-400 leading-tight mt-0.5">
              {getTranslation(lang, 'installPWADesc')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            onClick={handleInstallClick}
            className="px-3 py-1.5 bg-[#2481cc] hover:bg-[#1d6fae] active:scale-95 text-white text-xs font-medium rounded-lg transition-transform flex items-center gap-1.5 shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{getTranslation(lang, 'launch')}</span>
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg active:scale-95 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* iOS Safari Guide Modal */}
      {showIOSGuide && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#17212b] border border-white/10 rounded-2xl p-5 shadow-2xl animate-in fade-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white">
                {getTranslation(lang, 'installPWA')}
              </h3>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs text-gray-300">
              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[#2481cc]/20 text-[#64b5f6] flex items-center justify-center shrink-0 font-bold">
                  1
                </div>
                <div className="flex-1 pt-0.5">
                  <span>{lang === 'es' ? 'Toca el botón' : 'Tap the'} </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-white bg-white/10 px-1.5 py-0.5 rounded">
                    <Share2 className="w-3.5 h-3.5 text-[#64b5f6]" /> {lang === 'es' ? 'Compartir' : 'Share'}
                  </span>
                  <span> {lang === 'es' ? 'en la barra inferior de Safari.' : 'icon in Safari toolbar.'}</span>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[#2481cc]/20 text-[#64b5f6] flex items-center justify-center shrink-0 font-bold">
                  2
                </div>
                <div className="flex-1 pt-0.5">
                  <span>{lang === 'es' ? 'Desplázate y selecciona' : 'Scroll down and tap'} </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-white bg-white/10 px-1.5 py-0.5 rounded">
                    <PlusSquare className="w-3.5 h-3.5 text-[#64b5f6]" /> {lang === 'es' ? 'Agregar al inicio' : 'Add to Home Screen'}
                  </span>
                  <span>.</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowIOSGuide(false)}
              className="w-full py-2 bg-[#2481cc] hover:bg-[#1d6fae] text-white text-xs font-medium rounded-xl active:scale-98 transition"
            >
              {getTranslation(lang, 'cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
