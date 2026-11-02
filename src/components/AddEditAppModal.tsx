import React, { useState, useEffect } from 'react';
import { 
  X, 
  Globe, 
  Sparkles, 
  Image, 
  Layers, 
  ExternalLink, 
  Maximize2, 
  ShieldAlert,
  Palette
} from 'lucide-react';
import { WebAppItem, OpenMode } from '../types';
import { triggerHaptic } from '../services/telegram';

interface AddEditAppModalProps {
  isOpen: boolean;
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
  { name: 'YouTube', url: 'https://youtube.com', category: 'Media', color: '#FF0000', openMode: 'external' as OpenMode },
  { name: 'X / Twitter', url: 'https://x.com', category: 'Social', color: '#000000', openMode: 'external' as OpenMode },
  { name: 'Reddit', url: 'https://reddit.com', category: 'Social', color: '#FF4500', openMode: 'external' as OpenMode },
  { name: 'TikTok', url: 'https://tiktok.com', category: 'Social', color: '#000000', openMode: 'external' as OpenMode },
  { name: 'ChatGPT', url: 'https://chatgpt.com', category: 'Productivity', color: '#10A37F', openMode: 'external' as OpenMode },
  { name: 'Notion', url: 'https://notion.so', category: 'Productivity', color: '#000000', openMode: 'external' as OpenMode },
  { name: 'Spotify Web', url: 'https://open.spotify.com', category: 'Media', color: '#1DB954', openMode: 'external' as OpenMode },
  { name: 'DuckDuckGo', url: 'https://duckduckgo.com', category: 'Utilities', color: '#DE5833', openMode: 'iframe' as OpenMode },
];

const PRESET_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
  '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'
];

export const AddEditAppModal: React.FC<AddEditAppModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingApp
}) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [category, setCategory] = useState<WebAppItem['category']>('Utilities');
  const [openMode, setOpenMode] = useState<OpenMode>('iframe');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState('#3b82f6');
  const [error, setError] = useState('');

  useEffect(() => {
    if (editingApp) {
      setName(editingApp.name);
      setUrl(editingApp.url);
      setIconUrl(editingApp.iconUrl || '');
      setCategory(editingApp.category);
      setOpenMode(editingApp.openMode);
      setDescription(editingApp.description || '');
      setAccentColor(editingApp.accentColor || '#3b82f6');
    } else {
      setName('');
      setUrl('');
      setIconUrl('');
      setCategory('Utilities');
      setOpenMode('iframe');
      setDescription('');
      setAccentColor('#3b82f6');
    }
    setError('');
  }, [editingApp, isOpen]);

  // Auto-detect favicon when URL is typed
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
        // Infer readable name from domain
        const hostParts = parsed.hostname.replace(/^www\./, '').split('.');
        if (hostParts.length > 0) {
          const capitalized = hostParts[0].charAt(0).toUpperCase() + hostParts[0].slice(1);
          setName(capitalized);
        }
      }

      // Check for known iframe-blocking platforms
      const host = parsed.hostname.toLowerCase();
      if (
        host.includes('facebook') || 
        host.includes('instagram') || 
        host.includes('linkedin') || 
        host.includes('twitter') || 
        host.includes('x.com') ||
        host.includes('youtube') ||
        host.includes('google')
      ) {
        setOpenMode('external');
      }
    } catch {
      // Invalid URL handled on submit
    }
  };

  const handleApplyPreset = (preset: typeof QUICK_PRESETS[0]) => {
    triggerHaptic('selection');
    setName(preset.name);
    setUrl(preset.url);
    setCategory(preset.category as WebAppItem['category']);
    setOpenMode(preset.openMode);
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
      setError('App name is required');
      return;
    }

    let finalUrl = url.trim();
    if (!finalUrl) {
      setError('URL is required');
      return;
    }

    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = `https://${finalUrl}`;
    }

    try {
      new URL(finalUrl);
    } catch {
      setError('Please enter a valid website URL (e.g., https://example.com)');
      return;
    }

    const host = new URL(finalUrl).hostname.toLowerCase();
    const isKnownBlocked = 
      host.includes('facebook') || 
      host.includes('instagram') || 
      host.includes('linkedin') || 
      host.includes('twitter') || 
      host.includes('x.com');

    const appItem: WebAppItem = {
      id: editingApp ? editingApp.id : `app_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      name: name.trim(),
      url: finalUrl,
      iconUrl: iconUrl.trim() || undefined,
      category,
      openMode,
      description: description.trim() || undefined,
      accentColor,
      isDefault: editingApp?.isDefault ?? false,
      createdAt: editingApp?.createdAt ?? Date.now(),
      knownBlockedIframe: isKnownBlocked
    };

    onSave(appItem);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-[var(--tg-theme-bg-color,#17212b)] border border-[var(--tg-theme-secondary-bg-color,#232e3c)] shadow-2xl p-5 text-[var(--tg-theme-text-color,#ffffff)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--tg-theme-secondary-bg-color,#232e3c)] mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--tg-theme-text-color,#ffffff)]">
                {editingApp ? 'Edit Web App' : 'Add Web App'}
              </h2>
              <p className="text-xs text-[var(--tg-theme-hint-color,#708499)]">
                Add any link to your personal launcher dashboard
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

        {/* Quick Presets (Only on Add) */}
        {!editingApp && (
          <div className="mb-4">
            <span className="text-[11px] font-semibold text-[var(--tg-theme-hint-color,#708499)] uppercase tracking-wider block mb-2">
              Quick Suggestions
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

          {/* App URL */}
          <div>
            <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1">
              Website URL *
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-theme-hint-color,#708499)]" />
              <input
                type="text"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={handleUrlBlur}
                placeholder="https://example.com"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-sm text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/50 focus:outline-none transition-all font-mono"
              />
            </div>
          </div>

          {/* App Name */}
          <div>
            <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1">
              App Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Notion, Twitter, Figma"
              className="w-full px-3 py-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-sm text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/50 focus:outline-none transition-all"
            />
          </div>

          {/* Custom Icon URL */}
          <div>
            <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1">
              Icon URL (Optional)
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Image className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-theme-hint-color,#708499)]" />
                <input
                  type="text"
                  value={iconUrl}
                  onChange={(e) => setIconUrl(e.target.value)}
                  placeholder="https://... or auto-fetched favicon"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-sm text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/50 focus:outline-none transition-all text-xs font-mono"
                />
              </div>
              {iconUrl && (
                <div className="w-9 h-9 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] flex items-center justify-center p-1 border border-white/10 flex-shrink-0">
                  <img src={iconUrl} alt="Preview" className="w-6 h-6 object-contain rounded" onError={() => {}} />
                </div>
              )}
            </div>
          </div>

          {/* Category & Preferred Mode row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1">
                Category
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
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Launch Mode Preference */}
            <div>
              <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1">
                Preferred Launch Mode
              </label>
              <div className="grid grid-cols-2 gap-1 bg-[var(--tg-theme-secondary-bg-color,#232e3c)] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setOpenMode('iframe');
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                    openMode === 'iframe'
                      ? 'bg-[var(--tg-theme-button-color,#2b73bc)] text-white shadow-sm'
                      : 'text-[var(--tg-theme-hint-color,#708499)] hover:text-white'
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Iframe</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('selection');
                    setOpenMode('external');
                  }}
                  className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                    openMode === 'external'
                      ? 'bg-[var(--tg-theme-button-color,#2b73bc)] text-white shadow-sm'
                      : 'text-[var(--tg-theme-hint-color,#708499)] hover:text-white'
                  }`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>External</span>
                </button>
              </div>
            </div>
          </div>

          {/* Accent Color selection */}
          <div>
            <label className="block text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] mb-1.5 flex items-center gap-1">
              <Palette className="w-3.5 h-3.5" />
              <span>Accent Glow Color</span>
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
              Short Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this web app do?"
              className="w-full px-3 py-2 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-sm text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/50 focus:outline-none transition-all resize-none"
            />
          </div>

          {/* Footer Submit Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--tg-theme-secondary-bg-color,#232e3c)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--tg-theme-hint-color,#708499)] hover:text-white hover:bg-[var(--tg-theme-secondary-bg-color,#232e3c)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-[var(--tg-theme-button-color,#2b73bc)] text-[var(--tg-theme-button-text-color,#ffffff)] text-xs font-bold hover:opacity-95 active:scale-95 transition-all shadow-md shadow-blue-500/20"
            >
              {editingApp ? 'Save Changes' : 'Add to Launcher'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
