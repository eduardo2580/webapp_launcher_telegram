import React, { useState } from 'react';
import { 
  Smartphone, 
  User, 
  Vibrate, 
  CheckCircle, 
  HelpCircle, 
  Bot, 
  ChevronDown, 
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { TelegramUser, BotStatus } from '../types';
import { triggerHaptic } from '../services/telegram';

interface SimulatorBarProps {
  isInsideTg: boolean;
  currentUser: TelegramUser | null;
  onSelectMockUser: (user: TelegramUser) => void;
  botStatus: BotStatus | null;
  onOpenBotModal: () => void;
}

const MOCK_USERS: TelegramUser[] = [
  {
    id: 108234567,
    first_name: 'Pavel',
    last_name: 'Durov',
    username: 'durov',
    photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face',
    is_premium: true
  },
  {
    id: 987654321,
    first_name: 'Alex',
    last_name: 'Developer',
    username: 'alex_dev',
    photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
    is_premium: false
  },
  {
    id: 456123789,
    first_name: 'Elena',
    last_name: 'Product',
    username: 'elena_pm',
    photo_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face',
    is_premium: true
  }
];

export const SimulatorBar: React.FC<SimulatorBarProps> = ({
  isInsideTg,
  currentUser,
  onSelectMockUser,
  botStatus,
  onOpenBotModal
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastHaptic, setLastHaptic] = useState<string | null>(null);

  const handleTestHaptic = (style: 'light' | 'medium' | 'heavy' | 'success' | 'warning') => {
    triggerHaptic(style);
    setLastHaptic(style);
    setTimeout(() => setLastHaptic(null), 1500);
  };

  return (
    <div className="bg-[var(--tg-theme-section-bg-color,#1c2733)] border-b border-sky-500/20 text-xs transition-all">
      <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        {/* Left: Environment pill & active user */}
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold text-[10px] uppercase tracking-wide flex-shrink-0 ${
            isInsideTg 
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
              : 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
          }`}>
            <Smartphone className="w-3 h-3" />
            <span>{isInsideTg ? 'Inside Telegram' : 'TMA Simulator'}</span>
          </span>

          <div className="flex items-center gap-1.5 truncate">
            {currentUser?.photo_url ? (
              <img 
                src={currentUser.photo_url} 
                alt={currentUser.first_name} 
                className="w-4 h-4 rounded-full object-cover" 
              />
            ) : (
              <User className="w-3.5 h-3.5 text-sky-400" />
            )}
            <span className="text-[var(--tg-theme-text-color,#ffffff)] font-medium truncate">
              {currentUser ? `${currentUser.first_name} (${currentUser.username ? `@${currentUser.username}` : `ID: ${currentUser.id}`})` : 'Guest'}
            </span>
          </div>
        </div>

        {/* Right: Quick actions and toggle */}
        <div className="flex items-center gap-2">
          {lastHaptic && (
            <span className="text-[10px] text-amber-400 font-mono animate-bounce flex items-center gap-1">
              <Vibrate className="w-3 h-3" />
              <span>Haptic: {lastHaptic}</span>
            </span>
          )}

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-[var(--tg-theme-hint-color,#708499)] hover:text-white transition-colors text-[11px]"
          >
            <span>{isExpanded ? 'Hide Tools' : 'Simulator Tools'}</span>
            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Expanded Tools Panel */}
      {isExpanded && (
        <div className="max-w-5xl mx-auto px-4 pb-3 pt-1 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* User Switcher */}
          <div className="p-2.5 rounded-xl bg-[var(--tg-theme-bg-color,#17212b)] border border-white/5 space-y-1.5">
            <span className="text-[10px] font-bold text-[var(--tg-theme-hint-color,#708499)] uppercase">
              Switch Test User (Syncs Apps)
            </span>
            <div className="flex flex-wrap gap-1">
              {MOCK_USERS.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    triggerHaptic('selection');
                    onSelectMockUser(u);
                  }}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                    currentUser?.id === u.id
                      ? 'bg-sky-500 text-white'
                      : 'bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-[var(--tg-theme-text-color,#ffffff)] hover:bg-white/10'
                  }`}
                >
                  {u.first_name} {u.is_premium ? '★' : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Haptic Tester */}
          <div className="p-2.5 rounded-xl bg-[var(--tg-theme-bg-color,#17212b)] border border-white/5 space-y-1.5">
            <span className="text-[10px] font-bold text-[var(--tg-theme-hint-color,#708499)] uppercase">
              Test Telegram Haptic Feedback
            </span>
            <div className="flex flex-wrap gap-1">
              {(['light', 'medium', 'heavy', 'success', 'warning'] as const).map((style) => (
                <button
                  key={style}
                  onClick={() => handleTestHaptic(style)}
                  className="px-2 py-1 rounded-lg text-[11px] bg-[var(--tg-theme-secondary-bg-color,#232e3c)] hover:bg-sky-500/30 text-[var(--tg-theme-text-color,#ffffff)] capitalize transition-colors"
                >
                  {style}
                </button>
              ))}
            </div>
          </div>

          {/* Bot Setup Quicklink */}
          <div className="p-2.5 rounded-xl bg-[var(--tg-theme-bg-color,#17212b)] border border-white/5 space-y-1.5 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-bold text-[var(--tg-theme-hint-color,#708499)] uppercase">
                Bot Connection
              </span>
              <p className="text-[11px] text-[var(--tg-theme-hint-color,#708499)]">
                {botStatus?.configured ? `Linked to @${botStatus.botUsername}` : 'No token linked yet'}
              </p>
            </div>
            <button
              onClick={() => {
                triggerHaptic('selection');
                onOpenBotModal();
              }}
              className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 self-start"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Open BotFather Guide</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
