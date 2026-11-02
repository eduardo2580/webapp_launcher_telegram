import React, { useState, useEffect } from 'react';
import { 
  X, 
  Globe, 
  Sparkles, 
  Image, 
  Layers, 
  ShieldAlert,
  Palette,
  Lock,
  User,
  Eye,
  EyeOff,
  Cloud
} from 'lucide-react';
import { WebAppItem, Language } from '../types';
import { translations } from '../i18n/translations';
import { triggerHaptic } from '../services/telegram';

interface AddEditAppModalProps {
  isOpen: boolean;
  language: Language;
  onClose: () => void;
  onSave: (app: WebAppItem) => void;
  editingApp?: WebAppItem | null;
}

const CATEGORIES: WebAppItem['category'][] = [
  'Social',
  'Productivity',
  'Utilities',
  'Media',
  'News',
  'Games',
  'Custom'
];

const QUICK_PRESETS = [
  { name: 'YouTube', url: 'https://youtube.com', category: 'Media' as const, color: '#FF0000' },
  { name: 'X / Twitter', url: 'https://x.com', category: 'Social' as const, color: '#000000' },
  { name: 'Reddit', url: 'https://reddit.com', category: 'Social' as const, color: '#FF4500' },
  { name: 'Notion', url: 'https://notion.so', category: 'Productivity' as const, color: '#000000' },
  { name: 'Spotify', url: 'https://open.spotify.com', category: 'Media' as const, color: '#1DB954' },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com', category: 'Utilities' as const, color: '#DE5833' },
];

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'
];

export const AddEditAppModal: React.FC<AddEditAppModalProps> = ({
  isOpen,
  language,
  onClose,
  onSave,
  editingApp
}) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [category, setCategory] = useState<WebAppItem['category']>('Utilities');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const t = translations[language];

  useEffect(() => {
    if (editingApp) {
      setName(editingApp.name);
      setUrl(editingApp.url);
      setIconUrl(editingApp.iconUrl || '');
      setCategory(editingApp.category);
      setDescription(editingApp.description || '');
      setAccentColor(editingApp.accentColor || '#3b82f6');
      setUsername(editingApp.username || '');
      setPassword(editingApp.password || '');
    } else {
      setName('');
      setUrl('');
      setIconUrl('');
      setCategory('Utilities');
      setDescription('');
      setAccentColor('#3b82f6');
      setUsername('');
      setPassword('');
    }
    setShowPassword(false);
    setError('');
  }, [editingApp, isOpen]);

  const handleUrlBlur = () => {
    if (!url) return;
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
      setUrl(cleanUrl);
    }

    try {
      const parsed = new URL(cleanUrl);
      if (!iconUrl) {
        setIconUrl(`https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128`);
      }
      if (!name) {
        const hostParts = parsed.hostname.replace(/^www\./, '').split('.');
        if (hostParts.length > 0) {
          const capitalized = hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1);
          setName(capitalized);
        }
      }
    } catch {}
  };

  const handleApplyPreset = (preset: typeof QUICK_PRESETS[0]) => {
    triggerHaptic('selection');
    setName(preset.name);
    setUrl(preset.url);
    setCategory(preset.category);
    setAccentColor(preset.color);
    try {
      const parsed = new URL(preset.url);
      setIconUrl(`https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=128`);
    } catch {}
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    triggerHaptic('medium');

    if (!name.trim()) {
      setError(t.modal.errors.nameRequired);
      return;
    }

    let finalUrl = url.trim();
    if (!finalUrl) {
      setError(t.modal.errors.urlRequired);
      return;
    }

    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`;
    }

    try {
      new URL(finalUrl);
    } catch {
      setError(t.modal.errors.invalidUrl);
      return;
    }

    const appItem: WebAppItem = {
      id: editingApp ? editingApp.id : `app_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: name.trim(),
      url: finalUrl,
      iconUrl: iconUrl.trim() || undefined,
      category,
      description: description.trim() || undefined,
      accentColor,
      username: username.trim() || undefined,
      password: password.trim() || undefined,
      isDefault: editingApp?.isDefault ?? false,
      createdAt: editingApp?.createdAt ?? Date.now()
    };

    onSave(appItem);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-[var(--tg-theme-bg-color,#17212b)] border border-[var(--tg-theme-secondary-bg-color,#232e3c)] shadow-2xl p-5 text-[var(--tg-theme-text-color,#ffffff)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--tg-theme-secondary-bg-color,#232e3c)] mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--tg-theme-text-color,#ffffff)]">
                {editingApp ? t.modal.editTitle : t.modal.addTitle}
              </h2>
              <p className="text-xs text-[var(--tg-theme-hint-color,#708499)] flex items-center gap-1">
                <span>{t.modal.subtitle}</span>
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic('selection');
              onClose();
            }}
            className="p-2 rounded-xl text-[var(--tg-theme-hint-color,#708499)] hover:text-white hover:bg-[var(--tg-theme-secondary-bg-color,#232e3c)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Presets */}
        {!editingApp && (
          <div className="mb-4">
            <span className="text-[11px] font-semibold text-[var(--tg-theme-hint-color,#708499)] uppercase tracking-wider block mb-2">
              {t.modal.quickSuggestions}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--tg-theme-secondary-bg-color,#232e3c)] hover:bg-[var(--tg-theme-section-bg-color,#1c2733)] text-[var(--tg-theme-text-color,#ffffff)] border border-transparent hover:border-sky-500/40 transition-all flex items-center gap-1.5"
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Web URL */}
          <div>
            <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1">
              {t.modal.urlLabel}
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-theme-hint-color,#708499)]" />
              <input
                type="text"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={handleUrlBlur}
                placeholder={t.modal.urlPlaceholder}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-sm text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/50 focus:outline-none transition-all font-mono"
              />
            </div>
          </div>

          {/* App Name */}
          <div>
            <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1">
              {t.modal.nameLabel}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.modal.namePlaceholder}
              className="w-full px-3 py-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-sm text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/50 focus:outline-none transition-all"
            />
          </div>

          {/* Telegram Cloud Storage Credentials Section */}
          <div className="p-3.5 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] border border-sky-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-xs font-bold text-[var(--tg-theme-text-color,#ffffff)]">
                  {t.modal.credentialsSection}
                </span>
              </div>
              <span className="text-[10px] bg-sky-500/15 text-sky-400 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                <Cloud className="w-2.5 h-2.5" />
                <span>Cloud</span>
              </span>
            </div>
            <p className="text-[11px] text-[var(--tg-theme-hint-color,#708499)]">
              {t.modal.credentialsDesc}
            </p>

            {/* Username / Email */}
            <div>
              <label className="block text-[11px] font-medium text-[var(--tg-theme-hint-color,#708499)] mb-1">
                {t.modal.usernameLabel}
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-theme-hint-color,#708499)]" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t.modal.usernamePlaceholder}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[var(--tg-theme-bg-color,#17212b)] text-xs text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/50 focus:outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-[11px] font-medium text-[var(--tg-theme-hint-color,#708499)] mb-1">
                {t.modal.passwordLabel}
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-theme-hint-color,#708499)]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.modal.passwordPlaceholder}
                  className="w-full pl-8 pr-9 py-1.5 rounded-xl bg-[var(--tg-theme-bg-color,#17212b)] text-xs text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/50 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-[var(--tg-theme-hint-color,#708499)] hover:text-white absolute right-2.5 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Custom Icon URL */}
          <div>
            <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1">
              {t.modal.iconLabel}
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Image className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-theme-hint-color,#708499)]" />
                <input
                  type="text"
                  value={iconUrl}
                  onChange={(e) => setIconUrl(e.target.value)}
                  placeholder={t.modal.iconPlaceholder}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-xs text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/50 focus:outline-none transition-all font-mono"
                />
              </div>
              {iconUrl && (
                <div className="w-9 h-9 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] flex items-center justify-center p-1 border border-white/10 flex-shrink-0">
                  <img src={iconUrl} alt="Preview" className="w-6 h-6 object-contain rounded" onError={() => {}} />
                </div>
              )}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1">
              {t.modal.categoryLabel}
            </label>
            <div className="relative">
              <Layers className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-theme-hint-color,#708499)] pointer-events-none" />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as WebAppItem['category'])}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-sm text-[var(--tg-theme-text-color,#ffffff)] border border-transparent focus:border-sky-500/50 focus:outline-none appearance-none cursor-pointer"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} className="bg-[#17212b]">
                    {t.categories[cat] || cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Accent Color */}
          <div>
            <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1.5 flex items-center gap-1">
              <Palette className="w-3.5 h-3.5" />
              <span>{t.modal.colorLabel}</span>
            </label>
            <div className="flex items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccentColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${accentColor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#17212b]' : 'opacity-70 hover:opacity-100'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1">
              {t.modal.descLabel}
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t.modal.descPlaceholder}
              className="w-full px-3 py-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-sm text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/50 focus:outline-none transition-all resize-none"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--tg-theme-secondary-bg-color,#232e3c)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] hover:text-white hover:bg-[var(--tg-theme-secondary-bg-color,#232e3c)] transition-colors"
            >
              {t.modal.cancel}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[var(--tg-theme-button-color,#2b73bc)] text-[var(--tg-theme-button-text-color,#ffffff)] text-xs font-bold hover:opacity-95 active:scale-95 transition-all shadow-md shadow-blue-500/20"
            >
              {editingApp ? t.modal.save : t.modal.create}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
