import React, { useState } from 'react';
import { 
  X, 
  Bot, 
  Check, 
  Copy, 
  ExternalLink, 
  ShieldCheck, 
  Terminal, 
  Sparkles, 
  AlertCircle,
  Play,
  Send,
  Zap
} from 'lucide-react';
import { BotStatus } from '../types';
import { triggerHaptic } from '../services/telegram';

interface BotSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  botStatus: BotStatus | null;
  onBotConfigured: (status: BotStatus) => void;
}

export const BotSetupModal: React.FC<BotSetupModalProps> = ({
  isOpen,
  onClose,
  botStatus,
  onBotConfigured
}) => {
  const [tokenInput, setTokenInput] = useState('');
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configResult, setConfigResult] = useState<{ success?: boolean; error?: string; message?: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Command simulator test state
  const [testCommand, setTestCommand] = useState('/start');
  const [testOutput, setTestOutput] = useState<{ text?: string; keyboard?: any[] } | null>(null);
  const [isTestingCommand, setIsTestingCommand] = useState(false);

  if (!isOpen) return null;

  const appUrl = botStatus?.appUrl || window.location.origin;

  const handleCopy = (text: string, key: string) => {
    triggerHaptic('selection');
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleConnectBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setIsConfiguring(true);
    setConfigResult(null);
    triggerHaptic('medium');

    try {
      const response = await fetch('/api/bot/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenInput.trim(),
          autoSetupMenuButton: true,
          autoSetupWebhook: true
        })
      });

      const data = await response.json();
      if (data.success) {
        triggerHaptic('success');
        setConfigResult({
          success: true,
          message: `Bot @${data.bot.username} connected successfully! Menu button and webhook configured.`
        });
        onBotConfigured({
          configured: true,
          botUsername: data.bot.username,
          botName: data.bot.first_name,
          appUrl: data.appUrl,
          menuButtonConfigured: true
        });
      } else {
        triggerHaptic('error');
        setConfigResult({
          success: false,
          error: data.error || 'Failed to configure Telegram bot token'
        });
      }
    } catch (err: any) {
      triggerHaptic('error');
      setConfigResult({
        success: false,
        error: err.message || 'Network error while contacting server'
      });
    } finally {
      setIsConfiguring(false);
    }
  };

  const handleRunCommandTest = async () => {
    setIsTestingCommand(true);
    triggerHaptic('light');

    try {
      const res = await fetch('/api/bot/test-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: testCommand,
          user: { first_name: 'Explorer' }
        })
      });
      const data = await res.json();
      setTestOutput(data);
    } catch (err) {
      setTestOutput({ text: 'Error simulating bot command' });
    } finally {
      setIsTestingCommand(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[var(--tg-theme-bg-color,#17212b)] border border-[var(--tg-theme-secondary-bg-color,#232e3c)] shadow-2xl p-5 sm:p-6 text-[var(--tg-theme-text-color,#ffffff)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--tg-theme-secondary-bg-color,#232e3c)] mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--tg-theme-text-color,#ffffff)]">
                Telegram Bot & BotFather Guide
              </h2>
              <p className="text-xs text-[var(--tg-theme-hint-color,#708499)]">
                Configure your Telegram bot controller and web app menu button
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

        {/* Current Bot Status banner */}
        {botStatus?.configured ? (
          <div className="mb-5 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-emerald-300">
                  Bot Connected: @{botStatus.botUsername}
                </span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                  Active
                </span>
              </div>
              <p className="text-xs text-emerald-200/80 mt-1">
                Webhook and Menu Button have been registered with Telegram Bot API. Users can open this mini app directly from Telegram chat.
              </p>
              {botStatus.botUsername && (
                <a
                  href={`https://t.me/${botStatus.botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-2.5 px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Open @{botStatus.botUsername} on Telegram</span>
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-5 p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs text-sky-200 font-medium">
                Connect your bot token below to automatically bind the launcher menu button and webhook in Telegram!
              </p>
            </div>
          </div>
        )}

        {/* 1-Click Bot Connector Form */}
        <div className="mb-6 p-4 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] border border-[var(--tg-theme-section-bg-color,#1c2733)]">
          <h3 className="text-xs font-bold text-[var(--tg-theme-text-color,#ffffff)] uppercase tracking-wider mb-2 flex items-center gap-2">
            <span>Connect Bot via Token</span>
            <span className="text-[10px] font-normal text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded">Auto Config</span>
          </h3>

          <form onSubmit={handleConnectBot} className="space-y-3">
            <div>
              <div className="relative">
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste Bot Token (e.g., 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ)"
                  className="w-full pl-3 pr-24 py-2.5 rounded-xl bg-[var(--tg-theme-bg-color,#17212b)] text-xs sm:text-sm text-[var(--tg-theme-text-color,#ffffff)] placeholder-[var(--tg-theme-hint-color,#708499)] border border-transparent focus:border-sky-500/50 focus:outline-none font-mono"
                />
                <button
                  type="submit"
                  disabled={isConfiguring || !tokenInput.trim()}
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-3 rounded-lg bg-[var(--tg-theme-button-color,#2b73bc)] text-white text-xs font-bold hover:opacity-95 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  {isConfiguring ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>

            {configResult && (
              <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                configResult.success 
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
              }`}>
                {configResult.success ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                <span>{configResult.message || configResult.error}</span>
              </div>
            )}
          </form>
        </div>

        {/* Step-by-Step BotFather Guide */}
        <div className="space-y-4 mb-6">
          <h3 className="text-xs font-bold text-[var(--tg-theme-text-color,#ffffff)] uppercase tracking-wider">
            Step-by-Step BotFather Instructions
          </h3>

          {/* Step 1 */}
          <div className="p-3.5 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center">
                  1
                </span>
                <span className="font-semibold text-xs text-[var(--tg-theme-text-color,#ffffff)]">
                  Open @BotFather in Telegram
                </span>
              </div>
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
              >
                <span>Launch BotFather</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-[var(--tg-theme-hint-color,#708499)]">
              BotFather is the official Telegram bot used to create and configure all bots.
            </p>
          </div>

          {/* Step 2 */}
          <div className="p-3.5 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] border border-white/5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center">
                2
              </span>
              <span className="font-semibold text-xs text-[var(--tg-theme-text-color,#ffffff)]">
                Create a New Bot with /newbot
              </span>
            </div>
            <p className="text-xs text-[var(--tg-theme-hint-color,#708499)]">
              Send <code className="text-sky-300 bg-black/30 px-1 py-0.5 rounded font-mono">/newbot</code>. 
              Give your bot a friendly name (e.g. <em>Web App Launcher</em>) and a username ending with <code>bot</code> (e.g. <em>MyLauncher_bot</em>).
            </p>
          </div>

          {/* Step 3 */}
          <div className="p-3.5 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] border border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center">
                  3
                </span>
                <span className="font-semibold text-xs text-[var(--tg-theme-text-color,#ffffff)]">
                  Assign the Web App Menu Button (/setmenubutton)
                </span>
              </div>
            </div>
            <p className="text-xs text-[var(--tg-theme-hint-color,#708499)] leading-relaxed">
              To add the permanent "🚀 Launcher" button next to the chat text bar:
            </p>
            <ol className="text-xs text-[var(--tg-theme-subtitle-text-color,#8292a1)] list-decimal list-inside space-y-1">
              <li>Send <code className="text-sky-300 bg-black/30 px-1 py-0.5 rounded font-mono">/setmenubutton</code> to @BotFather</li>
              <li>Select your newly created bot</li>
              <li>Send your Web App URL when prompted:</li>
            </ol>
            <div className="flex items-center gap-2 bg-[var(--tg-theme-bg-color,#17212b)] p-2 rounded-xl border border-white/5">
              <code className="text-xs text-sky-400 font-mono flex-1 truncate">
                {appUrl}
              </code>
              <button
                onClick={() => handleCopy(appUrl, 'appUrl')}
                className="p-1.5 rounded-lg bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-xs text-white hover:bg-sky-600 transition-colors flex items-center gap-1"
              >
                {copiedKey === 'appUrl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>Copy URL</span>
              </button>
            </div>
            <p className="text-xs text-[var(--tg-theme-hint-color,#708499)]">
              4. When asked for button title, enter: <code className="text-sky-300 bg-black/30 px-1 py-0.5 rounded font-mono">🚀 Launcher</code>
            </p>
          </div>

          {/* Step 4 */}
          <div className="p-3.5 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] border border-white/5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center">
                4
              </span>
              <span className="font-semibold text-xs text-[var(--tg-theme-text-color,#ffffff)]">
                Setup Bot Commands
              </span>
            </div>
            <p className="text-xs text-[var(--tg-theme-hint-color,#708499)]">
              Send <code className="text-sky-300 bg-black/30 px-1 py-0.5 rounded font-mono">/setcommands</code>, select your bot, and paste:
            </p>
            <div className="bg-[var(--tg-theme-bg-color,#17212b)] p-2.5 rounded-xl border border-white/5 flex items-start justify-between gap-2 font-mono text-xs text-sky-300">
              <pre className="whitespace-pre">
start - Open Web App Launcher
launcher - Quick launch dashboard
help - Launcher guide and tips
              </pre>
              <button
                onClick={() => handleCopy('start - Open Web App Launcher\nlauncher - Quick launch dashboard\nhelp - Launcher guide and tips', 'commands')}
                className="p-1.5 rounded-lg bg-[var(--tg-theme-secondary-bg-color,#232e3c)] text-xs text-white hover:bg-sky-600 transition-colors flex items-center gap-1"
              >
                {copiedKey === 'commands' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Command Tester Simulator */}
        <div className="p-4 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#232e3c)] border border-white/5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-[var(--tg-theme-text-color,#ffffff)] uppercase tracking-wider flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-sky-400" />
              <span>Simulate Bot Command Response</span>
            </h4>
            <span className="text-[10px] text-[var(--tg-theme-hint-color,#708499)]">Local Test</span>
          </div>

          <div className="flex gap-2 mb-3">
            <select
              value={testCommand}
              onChange={(e) => setTestCommand(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-[var(--tg-theme-bg-color,#17212b)] text-xs text-[var(--tg-theme-text-color,#ffffff)] border border-white/10 font-mono"
            >
              <option value="/start">/start</option>
              <option value="/launcher">/launcher</option>
              <option value="/help">/help</option>
            </select>
            <button
              onClick={handleRunCommandTest}
              disabled={isTestingCommand}
              className="px-3 py-1.5 rounded-xl bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
            >
              <Play className="w-3 h-3" />
              <span>Simulate</span>
            </button>
          </div>

          {testOutput && (
            <div className="p-3 rounded-xl bg-[var(--tg-theme-bg-color,#17212b)] border border-white/5 text-xs space-y-2">
              <p className="whitespace-pre-wrap text-[var(--tg-theme-text-color,#ffffff)]">
                {testOutput.text}
              </p>
              {testOutput.keyboard && (
                <div className="pt-2 border-t border-white/5 flex flex-wrap gap-1.5">
                  {testOutput.keyboard.map((row: any[], i: number) => (
                    <div key={i} className="flex gap-1.5 w-full">
                      {row.map((btn, j) => (
                        <span key={j} className="px-2.5 py-1 rounded bg-sky-500/15 text-sky-300 font-semibold text-[11px] border border-sky-500/20">
                          {btn.text}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Close footer */}
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => {
              triggerHaptic('selection');
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-[var(--tg-theme-button-color,#2b73bc)] text-white text-xs font-bold hover:opacity-95 transition-opacity"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
