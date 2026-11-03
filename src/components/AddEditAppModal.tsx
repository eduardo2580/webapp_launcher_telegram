import React, { useState, useEffect } from 'react';
import { X, Lock, Globe, Tag, Image, Check } from './Icons';
import { WebAppItem, Language } from '../types';
import { getTranslation, type TranslationKey } from '../i18n/translations';
import { hapticImpact, hapticNotification } from '../services/telegram';

interface AddEditAppModalProps {
  isOpen: boolean;
  editingApp: WebAppItem | null;
  lang: Language;
  onSave: (app: WebAppItem) => void;
  onClose: () => void;
}

const PRESET_ICONS = [
  { label: 'Navegador', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/chrome.png' },
  { label: 'GitHub', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/github.png' },
  { label: 'YouTube', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/youtube.png' },
  { label: 'Reddit', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/reddit.png' },
  { label: 'Notion', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/notion.png' },
  { label: 'Spotify', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/spotify.png' },
];

const CATEGORY_TRANSLATION_KEYS: Record<WebAppItem['category'], TranslationKey> = {
  Social: 'categorySocial',
  Work: 'categoryWork',
  Tools: 'categoryTools',
  Media: 'categoryMedia',
  Other: 'categoryOther',
};

export const AddEditAppModal: React.FC<AddEditAppModalProps> = ({
  isOpen,
  editingApp,
  lang,
  onSave,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('');
  const [category, setCategory] = useState<WebAppItem['category']>('Other');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  useEffect(() => {
    if (editingApp) {
      setTitle(editingApp.title);
      setUrl(editingApp.url);
      setIcon(editingApp.icon || '');
      setCategory(editingApp.category);
      setUsername(editingApp.username || '');
      setPassword(editingApp.password || '');
      setShowMoreOptions(!!(editingApp.icon || editingApp.username || editingApp.password));
    } else {
      setTitle('');
      setUrl('');
      setIcon('');
      setCategory('Other');
      setUsername('');
      setPassword('');
      setShowMoreOptions(false);
    }
  }, [editingApp, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !url.trim()) return;

    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }

    const item: WebAppItem = {
      id: editingApp ? editingApp.id : `app_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim(),
      url: finalUrl,
      icon: icon.trim() || undefined,
      category,
      username: username.trim() || undefined,
      password: password.trim() || undefined,
      isCustom: editingApp ? editingApp.isCustom : true,
    };

    hapticNotification('success');
    onSave(item);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#17212b] border border-white/10 rounded-2xl p-5 sm:p-6 shadow-2xl animate-in fade-in zoom-in-95 my-auto max-h-[92dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h2 className="text-lg font-bold text-white">
            {editingApp ? getTranslation(lang, 'editApp') : getTranslation(lang, 'addApp')}
          </h2>
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-lg transition"
            aria-label={getTranslation(lang, 'close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-5 text-sm">
          {/* App Title */}
          <div>
            <label htmlFor="app-title" className="block text-white font-semibold mb-1.5">
              {getTranslation(lang, 'appName')} *
            </label>
            <input
              id="app-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={getTranslation(lang, 'appName')}
              autoComplete="off"
              className="w-full min-h-12 px-4 py-3 rounded-xl bg-[#242f3d] border border-white/15 text-base text-white placeholder-gray-400 focus:outline-none focus:border-[#2481cc]"
            />
            <p className="mt-1.5 text-xs text-gray-400">{getTranslation(lang, 'appNameHelp')}</p>
          </div>

          {/* App URL */}
          <div>
            <label htmlFor="app-url" className="block text-white font-semibold mb-1.5 flex items-center gap-2">
              <Globe className="w-4 h-4 text-[#64b5f6]" />
              <span>{getTranslation(lang, 'appUrl')} *</span>
            </label>
            <input
              id="app-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => {
                const trimmedUrl = url.trim();
                if (trimmedUrl && !/^https?:\/\//i.test(trimmedUrl)) {
                  setUrl(`https://${trimmedUrl}`);
                }
              }}
              placeholder="https://exemplo.com"
              className="w-full min-h-12 px-4 py-3 rounded-xl bg-[#242f3d] border border-white/15 text-base text-white placeholder-gray-400 focus:outline-none focus:border-[#2481cc]"
            />
            <p className="mt-1.5 text-xs text-gray-400">{getTranslation(lang, 'appUrlHelp')}</p>
            {(url.includes('localhost') || url.includes('127.0.0.1')) && (
              <div className="mt-2 p-3 rounded-lg bg-amber-500/15 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
                <span>{getTranslation(lang, 'localhostDetected')}</span>
                <button
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setUrl((prev) => prev.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2'));
                  }}
                  className="px-3 py-2 rounded bg-amber-400 text-black font-semibold text-xs shrink-0 hover:bg-amber-300 transition"
                >
                  {getTranslation(lang, 'fixWithEmulatorIp')}
                </button>
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <label htmlFor="app-category" className="block text-white font-semibold mb-1.5 flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#64b5f6]" />
              <span>{getTranslation(lang, 'category')}</span>
            </label>
            <select
              id="app-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as WebAppItem['category'])}
              className="w-full min-h-12 px-4 py-3 rounded-xl bg-[#242f3d] border border-white/15 text-base text-white focus:outline-none focus:border-[#2481cc]"
            >
              {(['Social', 'Work', 'Tools', 'Media', 'Other'] as const).map((cat) => (
                <option key={cat} value={cat}>{getTranslation(lang, CATEGORY_TRANSLATION_KEYS[cat])}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            aria-expanded={showMoreOptions}
            onClick={() => setShowMoreOptions((visible) => !visible)}
            className="w-full min-h-12 px-4 rounded-xl border border-white/15 bg-white/5 text-left text-sm font-semibold text-[#90caf9] hover:bg-white/10 transition"
          >
            {getTranslation(lang, showMoreOptions ? 'lessOptions' : 'moreOptions')}
          </button>

          {showMoreOptions && (
            <>
              {/* Icon URL and presets */}
              <div className="space-y-2">
                <label htmlFor="app-icon" className="block text-gray-300 font-medium mb-1 flex items-center gap-1">
                  <Image className="w-3.5 h-3.5 text-[#64b5f6]" />
                  <span>{getTranslation(lang, 'iconUrl')}</span>
                </label>
                <input
                  id="app-icon"
                  type="url"
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="https://exemplo.com/icone.png"
                  className="w-full min-h-11 px-4 py-2 rounded-xl bg-[#242f3d] border border-white/10 text-white placeholder-gray-400 focus:outline-none focus:border-[#2481cc]"
                />
                <div>
                  <span className="block text-xs text-gray-400 mb-2">{getTranslation(lang, 'iconSuggestions')}</span>
                  <div className="flex flex-wrap items-center gap-2 pb-1">
                    {PRESET_ICONS.map((p) => (
                      <button
                        type="button"
                        key={p.label}
                        onClick={() => {
                          hapticImpact('light');
                          setIcon(p.url);
                        }}
                        className={`h-11 w-11 rounded-lg border transition flex items-center justify-center ${
                          icon === p.url ? 'border-[#2481cc] bg-[#2481cc]/20' : 'border-white/10 bg-[#242f3d]'
                        }`}
                        title={p.label}
                        aria-label={p.label}
                      >
                        <img src={p.url} alt="" className="w-6 h-6 object-contain" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Optional Cloud Credentials */}
              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center gap-2 mb-2 text-amber-300 font-semibold">
                  <Lock className="w-4 h-4" />
                  <span>{getTranslation(lang, 'credentialsOptional')}</span>
                </div>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={getTranslation(lang, 'username')}
                    className="w-full min-h-11 px-4 py-2 rounded-xl bg-[#242f3d] border border-white/10 text-base text-white placeholder-gray-400 focus:outline-none focus:border-[#2481cc]"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={getTranslation(lang, 'password')}
                    className="w-full min-h-11 px-4 py-2 rounded-xl bg-[#242f3d] border border-white/10 text-base text-white placeholder-gray-400 focus:outline-none focus:border-[#2481cc]"
                  />
                </div>
              </div>
            </>
          )}

          {/* Action buttons */}
          <div className="pt-2 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              className="min-h-12 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold transition"
            >
              {getTranslation(lang, 'cancel')}
            </button>
            <button
              type="submit"
              className="min-h-12 px-4 rounded-xl bg-[#2481cc] hover:bg-[#1d6fae] text-white font-semibold flex items-center justify-center gap-2 shadow transition"
            >
              <Check className="w-4 h-4" />
              <span>{getTranslation(lang, editingApp ? 'saveChanges' : 'addAppButton')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
