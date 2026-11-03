import React, { useState } from 'react';
import { ExternalLink, Trash2, Key, Edit3 } from 'lucide-react';
import { WebAppItem, Language } from '../types';
import { getTranslation } from '../i18n/translations';
import { hapticImpact } from '../services/telegram';

interface AppCardProps {
  app: WebAppItem;
  lang: Language;
  onLaunch: (app: WebAppItem) => void;
  onEdit: (app: WebAppItem) => void;
  onDelete: (id: string) => void;
}

export const AppCard: React.FC<AppCardProps> = ({
  app,
  lang,
  onLaunch,
  onEdit,
  onDelete,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const hasCredentials = !!(app.username || app.password);

  const handleLaunch = () => {
    hapticImpact('medium');
    onLaunch(app);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticImpact('heavy');
    if (window.confirm(getTranslation(lang, 'deleteConfirm'))) {
      onDelete(app.id);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticImpact('light');
    onEdit(app);
  };

  return (
    <div
      onClick={handleLaunch}
      className="group relative bg-[#242f3d] hover:bg-[#2b3747] border border-white/5 hover:border-[#2481cc]/40 rounded-2xl p-4 transition-all duration-150 cursor-pointer shadow-sm flex flex-col justify-between active:scale-[0.985]"
    >
      <div>
        {/* Top row: Icon and quick action icons */}
        <div className="flex items-start justify-between gap-2">
          {/* App Icon */}
          <div className="w-12 h-12 rounded-xl bg-[#17212b] border border-white/10 flex items-center justify-center p-2 overflow-hidden shrink-0 shadow-inner">
            {app.icon && !imageFailed ? (
              <img
                src={app.icon}
                alt={app.title}
                onError={() => setImageFailed(true)}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <span className="text-lg font-bold text-[#64b5f6]">
                {app.title.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* Action buttons (Edit & Delete) */}
          <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
            <button
              onClick={handleEdit}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition"
              title={getTranslation(lang, 'editApp')}
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
              title={getTranslation(lang, 'delete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Title and Category */}
        <div className="mt-3">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-white text-sm truncate tracking-tight">
              {app.title}
            </h3>
            {hasCredentials && (
              <span
                className="inline-flex items-center text-amber-400"
                title={getTranslation(lang, 'savedLogins')}
              >
                <Key className="w-3 h-3 fill-amber-400/20" />
              </span>
            )}
          </div>
          <span className="text-[11px] font-medium text-gray-400 bg-black/20 px-2 py-0.5 rounded-md inline-block mt-1">
            {app.category}
          </span>
        </div>
      </div>

      {/* Launch Footer Button */}
      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleLaunch();
          }}
          className="text-[11px] text-[#64b5f6] hover:text-[#90caf9] font-medium flex items-center gap-1 active:scale-95 transition"
        >
          <span>{getTranslation(lang, 'launch')}</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
        {hasCredentials && (
          <span className="text-[10px] text-gray-400 truncate max-w-[120px] bg-white/5 px-2 py-0.5 rounded">
            {app.username || '••••••'}
          </span>
        )}
      </div>
    </div>
  );
};
