import React, { useState, useEffect } from 'react';
import { X, Lock, Globe, Tag, Image, Check } from './Icons';
import { WebAppItem, Language } from '../types';
import { getTranslation } from '../i18n/translations';
import { hapticImpact, hapticNotification } from '../services/telegram';

interface AddEditAppModalProps {
  isOpen: boolean;
  editingApp: WebAppItem | null;
  lang: Language;
  onSave: (app: WebAppItem) => void;
  onClose: () => void;
}

const PRESET_ICONS = [
  { label: 'Globe', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/chrome.png' },
  { label: 'GitHub', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/github.png' },
  { label: 'YouTube', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/youtube.png' },
  { label: 'Reddit', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/reddit.png' },
  { label: 'Notion', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/notion.png' },
  { label: 'Spotify', url: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/spotify.png' },
];

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

  useEffect(() => {
    if (editingApp) {
      setTitle(editingApp.title);
      setUrl(editingApp.url);
      setIcon(editingApp.icon || '');
      setCategory(editingApp.category);
      setUsername(editingApp.username || '');
      setPassword(editingApp.password || '');
    } else {
      setTitle('');
      setUrl('');
      setIcon('');
      setCategory('Other');
      setUsername('');
      setPassword('');
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-[#17212b] border border-white/10 rounded-2xl p-5 shadow-2xl animate-in fade-in zoom-in-95 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <h2 className="text-base font-bold text-white">
            {editingApp ? getTranslation(lang, 'editApp') : getTranslation(lang, 'addApp')}
          </h2>
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1 text-gray-400 hover:text-white rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
          {/* App Title */}
          <div>
            <label className="block text-gray-300 font-medium mb-1">
              {getTranslation(lang, 'appName')} *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. My Favorite App"
              className="w-full px-3 py-2 rounded-xl bg-[#242f3d] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-[#2481cc]"
            />
          </div>

          {/* App URL */}
          <div>
            <label className="block text-gray-300 font-medium mb-1 flex items-center gap-1">
              <Globe className="w-3.5 h-3.5 text-[#64b5f6]" />
              <span>{getTranslation(lang, 'appUrl')} *</span>
            </label>
            <input
              type="text"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 rounded-xl bg-[#242f3d] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-[#2481cc]"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-gray-300 font-medium mb-1 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-[#64b5f6]" />
              <span>{getTranslation(lang, 'category')}</span>
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['Social', 'Work', 'Tools', 'Media', 'Other'] as const).map((cat) => (
                <button
                  type="button"
                  key={cat}
                  onClick={() => {
                    hapticImpact('light');
                    setCategory(cat);
                  }}
                  className={`py-1.5 text-center rounded-lg font-medium transition ${
                    category === cat
                      ? 'bg-[#2481cc] text-white'
                      : 'bg-[#242f3d] text-gray-400 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Icon URL and presets */}
          <div>
            <label className="block text-gray-300 font-medium mb-1 flex items-center gap-1">
              <Image className="w-3.5 h-3.5 text-[#64b5f6]" />
              <span>{getTranslation(lang, 'iconUrl')}</span>
            </label>
            <input
              type="url"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="https://.../icon.png"
              className="w-full px-3 py-2 rounded-xl bg-[#242f3d] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-[#2481cc]"
            />
            {/* Quick preset icons */}
            <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1">
              <span className="text-[10px] text-gray-400 shrink-0">Presets:</span>
              {PRESET_ICONS.map((p) => (
                <button
                  type="button"
                  key={p.label}
                  onClick={() => {
                    hapticImpact('light');
                    setIcon(p.url);
                  }}
                  className={`p-1 rounded-lg border shrink-0 transition flex items-center justify-center ${
                    icon === p.url ? 'border-[#2481cc] bg-[#2481cc]/20' : 'border-white/10 bg-[#242f3d]'
                  }`}
                  title={p.label}
                >
                  <img src={p.url} alt={p.label} className="w-4 h-4 object-contain" />
                </button>
              ))}
            </div>
          </div>

          {/* Optional Cloud Credentials */}
          <div className="pt-2 border-t border-white/10">
            <div className="flex items-center gap-1.5 mb-2 text-amber-300 font-semibold">
              <Lock className="w-3.5 h-3.5" />
              <span>{getTranslation(lang, 'credentialsOptional')}</span>
            </div>

            <div className="space-y-2">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={getTranslation(lang, 'username')}
                className="w-full px-3 py-2 rounded-xl bg-[#242f3d] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-[#2481cc]"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={getTranslation(lang, 'password')}
                className="w-full px-3 py-2 rounded-xl bg-[#242f3d] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-[#2481cc]"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-medium transition"
            >
              {getTranslation(lang, 'cancel')}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[#2481cc] hover:bg-[#1d6fae] text-white font-semibold flex items-center gap-1.5 shadow transition"
            >
              <Check className="w-4 h-4" />
              <span>{getTranslation(lang, 'save')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
