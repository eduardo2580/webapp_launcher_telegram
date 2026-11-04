import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  RotateCcw,
  Globe,
  Settings,
  LinkIcon,
  Bot,
  ExternalLink,
  Check,
  Copy,
  AlertCircle,
  ShieldCheck,
  Cloud,
} from './components/Icons';
import { Language, ChatMessage, InlineKeyboardButtonItem, BotStatusResponse } from './types';
import { BotConfigModal } from './components/BotConfigModal';
import { launchExternalApp } from './services/telegram';

export default function App() {
  const [lang, setLang] = useState<Language>('pt');
  const [botStatus, setBotStatus] = useState<BotStatusResponse | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [isActivatingToken, setIsActivatingToken] = useState(false);
  const [tokenFeedback, setTokenFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Embedded Telegram Simulator / Test Console state
  const [isConsoleOpen, setIsConsoleOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scrollToBottom = useCallback((smooth = true) => {
    chatEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Sync document language
  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
  }, [lang]);

  // Fetch Bot Status from backend
  const refreshBotStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/bot/status');
      if (res.ok) {
        const data = await res.json();
        setBotStatus(data);
      }
    } catch {
      // Ignore network glitch
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshBotStatus();
    const interval = setInterval(refreshBotStatus, 8000);
    return () => clearInterval(interval);
  }, [refreshBotStatus]);

  // Load initial simulated /start message
  const handleResetChat = useCallback(async () => {
    setMessages([]);
    try {
      const res = await fetch('/api/bot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '/start', language: lang, chatId: -1 }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          setMessages(
            data.messages.map((m: {
              message_id: number;
              text: string;
              reply_markup?: { inline_keyboard?: InlineKeyboardButtonItem[][] };
            }) => ({
              id: m.message_id || Date.now(),
              sender: 'bot',
              text: m.text,
              time: timeStr,
              replyMarkup: m.reply_markup,
            }))
          );
        }
      }
    } catch {
      // Ignore
    }
    setTimeout(() => scrollToBottom(), 50);
  }, [lang, scrollToBottom]);

  useEffect(() => {
    handleResetChat();
  }, [handleResetChat]);

  useEffect(() => {
    if (isConsoleOpen) {
      scrollToBottom(false);
    }
  }, [messages, isConsoleOpen, scrollToBottom]);

  // Send message to simulator
  const handleSendMessage = async (textToSend: string) => {
    const text = textToSend.trim();
    if (!text || isSending) return;

    const userMsgId = Date.now();
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text,
      time: timeStr,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const res = await fetch('/api/bot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language: lang, chatId: -1 }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          const newBotMessages: ChatMessage[] = data.messages.map((m: {
            message_id: number;
            text: string;
            parse_mode?: string;
            reply_markup?: { inline_keyboard?: InlineKeyboardButtonItem[][] };
          }) => ({
            id: m.message_id || Date.now() + Math.random(),
            sender: 'bot',
            text: m.text,
            time: timeStr,
            parseMode: m.parse_mode,
            replyMarkup: m.reply_markup,
          }));

          setMessages((prev) => [...prev, ...newBotMessages]);
        }
      }
    } catch {
      // Network drop
    } finally {
      setIsSending(false);
      setTimeout(() => scrollToBottom(), 50);
    }
  };

  // Button click in simulator
  const handleButtonClick = async (btn: InlineKeyboardButtonItem, messageId: number) => {
    if (btn.url) {
      launchExternalApp(btn.url);
      return;
    }

    if (btn.callback_data) {
      try {
        const res = await fetch('/api/bot/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: btn.callback_data,
            messageId,
            language: lang,
            chatId: -1,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            const updated = data.messages[0];
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id === messageId || (updated.type === 'editMessageText' && msg.sender === 'bot')) {
                  return {
                    ...msg,
                    text: updated.text,
                    replyMarkup: updated.reply_markup,
                  };
                }
                return msg;
              })
            );

            if (data.messages.length > 1) {
              const extraMessages: ChatMessage[] = data.messages.slice(1).map((m: {
                message_id: number;
                text: string;
                reply_markup?: { inline_keyboard?: InlineKeyboardButtonItem[][] };
              }) => ({
                id: m.message_id || Date.now(),
                sender: 'bot',
                text: m.text,
                time: `${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, '0')}`,
                replyMarkup: m.reply_markup,
              }));
              setMessages((prev) => [...prev, ...extraMessages]);
            }
          }
        }
      } catch {
        // Ignored
      }
    }
  };

  // Activate token directly from page
  const handleActivateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setIsActivatingToken(true);
    setTokenFeedback(null);

    try {
      const res = await fetch('/api/bot/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'ok') {
        throw new Error(data.message || 'Falha ao validar token do Telegram.');
      }

      setTokenFeedback({
        type: 'success',
        message: lang === 'pt'
          ? `✅ Bot @${data.username} conectado com sucesso! O polling no Discloud foi iniciado.`
          : `✅ Bot @${data.username} connected successfully! Discloud polling active.`,
      });
      setTokenInput('');
      refreshBotStatus();
      handleResetChat();
    } catch (err: unknown) {
      setTokenFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Erro ao conectar.',
      });
    } finally {
      setIsActivatingToken(false);
    }
  };

  const botUsername = botStatus?.username;
  const telegramBotLink = botUsername ? `https://t.me/${botUsername}` : null;

  const handleCopyLink = () => {
    if (!telegramBotLink) return;
    void navigator.clipboard.writeText(telegramBotLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleToggleLang = () => {
    const nextLang: Language = lang === 'pt' ? 'en' : lang === 'en' ? 'es' : 'pt';
    setLang(nextLang);
  };

  return (
    <div className="min-h-screen bg-[#0e1621] text-gray-100 font-sans flex flex-col selection:bg-[#2481cc] selection:text-white">
      {/* Top Bar */}
      <header className="h-14 bg-[#17212b] border-b border-white/10 px-4 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#1d6fae] to-[#64b5f6] flex items-center justify-center text-white shadow-xs">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">Discloud Telegram Bot</span>
              <span className="bg-[#2481cc]/25 text-[#64b5f6] text-[10px] font-mono px-2 py-0.5 rounded font-semibold">
                TYPE=bot
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              {botStatus?.configured ? '🟢 Polling Ativo na Nuvem' : '🟡 Aguardando TELEGRAM_BOT_TOKEN'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Switch */}
          <button
            onClick={handleToggleLang}
            className="h-8 px-2.5 rounded-lg bg-[#242f3d] border border-white/10 hover:bg-[#2b3747] text-xs font-semibold text-white flex items-center gap-1.5 transition active:scale-95"
            title="Alternar Idioma"
          >
            <Globe className="w-3.5 h-3.5 text-[#64b5f6]" />
            <span>{lang.toUpperCase()}</span>
          </button>

          {/* Refresh Status */}
          <button
            onClick={refreshBotStatus}
            className="h-8 w-8 rounded-lg bg-[#242f3d] border border-white/10 hover:bg-[#2b3747] text-gray-300 hover:text-white flex items-center justify-center transition active:scale-95"
            title="Atualizar Status"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Settings modal button */}
          <button
            onClick={() => setIsConfigOpen(true)}
            className="h-8 px-3 rounded-lg bg-[#2481cc] hover:bg-[#1d6fae] text-white text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 shadow-sm"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">BotFather API</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Banner: Interaction is strictly with the Telegram Bot */}
        <section className="bg-gradient-to-r from-[#17212b] via-[#1c2a38] to-[#17212b] border border-white/10 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#2481cc]/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>
                  {botStatus?.configured
                    ? `Bot Ativo: @${botStatus.username || 'Bot'}`
                    : 'Discloud Bot Engine Pronto para Conectar'}
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                {lang === 'pt'
                  ? 'Aplicativo 100% no Telegram via BotFather API'
                  : lang === 'es'
                  ? 'Aplicación 100% en Telegram vía BotFather API'
                  : '100% Telegram Bot via BotFather API'}
              </h2>

              <p className="text-xs sm:text-sm text-gray-300 leading-relaxed">
                {lang === 'pt'
                  ? 'Este serviço não opera como uma página web comum. Todas as interações (abrir web apps, adicionar sites, buscar, organizar por categorias e trocar idioma) são executadas exclusivamente dentro do seu aplicativo do Telegram.'
                  : 'This service operates 100% as a cloud-hosted Telegram bot on Discloud. All actions (opening apps, adding URLs, searching, categories) happen directly inside Telegram.'}
              </p>
            </div>

            {/* Direct Telegram CTAs */}
            <div className="flex flex-col sm:flex-row md:flex-col gap-2.5 w-full md:w-auto shrink-0">
              {telegramBotLink ? (
                <>
                  <a
                    href={telegramBotLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-3 rounded-xl bg-[#2481cc] hover:bg-[#1d6fae] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#2481cc]/25 transition active:scale-95 text-center"
                  >
                    <span>💬 Abrir @{botUsername} no Telegram</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={handleCopyLink}
                    className="px-4 py-2 rounded-xl bg-[#242f3d] border border-white/10 hover:bg-[#2c3a4a] text-xs font-semibold text-gray-200 flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? 'Link Copiado!' : 'Copiar Link do Bot'}</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsConfigOpen(true)}
                  className="px-5 py-3 rounded-xl bg-[#2481cc] hover:bg-[#1d6fae] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#2481cc]/25 transition active:scale-95"
                >
                  <span>🔑 Configurar TELEGRAM_BOT_TOKEN</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Grid: Discloud Cloud Architecture & Live Metrics */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card 1: Discloud Provider Config */}
          <div className="bg-[#17212b] border border-white/10 rounded-2xl p-4.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Hospedagem em Nuvem</span>
              <Cloud className="w-4 h-4 text-[#64b5f6]" />
            </div>
            <div>
              <div className="text-lg font-bold text-white flex items-center gap-1.5">
                <span>Discloud</span>
                <span className="text-xs font-normal text-gray-400">(discloud.com)</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">Configuração: <code className="text-[#64b5f6]">discloud.config</code></p>
            </div>
            <div className="pt-2 border-t border-white/10 space-y-1 text-xs">
              <div className="flex justify-between text-gray-300">
                <span>ID:</span>
                <span className="font-mono text-white">webapp-launcher</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Tipo:</span>
                <span className="font-mono text-emerald-400">TYPE=bot (Node.js)</span>
              </div>
              <div className="flex justify-between text-gray-300">
                <span>Alocação RAM:</span>
                <span className="font-mono text-white">100 MB</span>
              </div>
            </div>
          </div>

          {/* Card 2: Memory & Discloud Health */}
          <div className="bg-[#17212b] border border-white/10 rounded-2xl p-4.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Perfil de Memória (Discloud)</span>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-white flex items-center gap-2">
                <span>{botStatus?.discloud?.heapUsedMB ?? 22} MB</span>
                <span className="text-xs font-normal text-gray-400">/ 100 MB Max</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-[#242f3d] rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, ((botStatus?.discloud?.heapUsedMB ?? 22) / 100) * 100)}%` }}
                ></div>
              </div>
            </div>
            <div className="pt-2 border-t border-white/10 space-y-1 text-xs text-gray-300">
              <div className="flex justify-between">
                <span>RSS Ativo:</span>
                <span className="font-mono text-white">{botStatus?.discloud?.rssMB ?? 35} MB</span>
              </div>
              <div className="flex justify-between">
                <span>Uptime:</span>
                <span className="font-mono text-white">{botStatus?.discloud?.uptimeSeconds ?? 0}s</span>
              </div>
            </div>
          </div>

          {/* Card 3: Storage & Apps */}
          <div className="bg-[#17212b] border border-white/10 rounded-2xl p-4.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Base de Aplicativos</span>
              <span className="text-xs font-mono text-[#64b5f6]">{botStatus?.totalApps ?? 6} Apps</span>
            </div>
            <div>
              <div className="text-lg font-bold text-white">data/telegram-apps.json</div>
              <p className="text-xs text-gray-400 mt-1">Armazenamento persistente na nuvem</p>
            </div>
            <div className="pt-2 border-t border-white/10 space-y-1 text-xs text-gray-300">
              <div className="flex justify-between">
                <span>Apps Essenciais:</span>
                <span className="font-mono text-white">{botStatus?.coreAppsCount ?? 6}</span>
              </div>
              <div className="flex justify-between">
                <span>Apps Personalizados:</span>
                <span className="font-mono text-white">{botStatus?.customAppsCount ?? 0}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Variable & Setup Section */}
        <section className="bg-[#17212b] border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">⚙️ Variável de Ambiente:</span>
            <code className="text-xs font-mono bg-[#242f3d] px-2.5 py-1 rounded text-[#64b5f6] border border-white/10">
              TELEGRAM_BOT_TOKEN
            </code>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-[#1c2733] border border-white/10 space-y-2">
              <div className="font-bold text-white flex items-center gap-1.5">
                <span>1. Como configurar no Discloud</span>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-gray-300 leading-relaxed">
                <li>Abra o Telegram e envie <code>/newbot</code> para <b>@BotFather</b> para obter o token.</li>
                <li>Acesse o painel do Discloud em <b>discloud.com/dashboard</b>.</li>
                <li>Selecione o seu aplicativo (<code>webapp-launcher</code>) e acesse <b>Environment Variables</b>.</li>
                <li>Adicione a variável <code>TELEGRAM_BOT_TOKEN</code> com o token gerado.</li>
                <li>Reinicie a aplicação no Discloud. O bot iniciará o long-polling automaticamente!</li>
              </ol>
            </div>

            {/* Quick in-page activator */}
            <form onSubmit={handleActivateToken} className="p-4 rounded-xl bg-[#1c2733] border border-white/10 space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="font-bold text-white flex items-center gap-1.5 mb-1">
                  <span>2. Ativar / Testar Token Agora</span>
                </div>
                <p className="text-gray-400 text-[11px]">
                  Cole o token aqui para conectar o daemon imediatamente na nuvem:
                </p>
                <div className="mt-2 flex gap-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="123456789:ABCdefGHIjklmNOPqrsTUVwxyz..."
                    className="flex-1 px-3 py-2 rounded-xl bg-[#242f3d] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-[#2481cc] font-mono text-xs"
                  />
                  <button
                    type="submit"
                    disabled={isActivatingToken || !tokenInput.trim()}
                    className="px-4 py-2 bg-[#2481cc] hover:bg-[#1d6fae] text-white rounded-xl font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 shrink-0 text-xs"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${isActivatingToken ? 'animate-spin' : ''}`} />
                    <span>{isActivatingToken ? 'Validando...' : 'Conectar Bot'}</span>
                  </button>
                </div>
              </div>

              {tokenFeedback && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    tokenFeedback.type === 'success'
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                  }`}
                >
                  {tokenFeedback.type === 'success' ? (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{tokenFeedback.message}</span>
                </div>
              )}
            </form>
          </div>
        </section>

        {/* Telegram Bot Commands Cheatsheet */}
        <section className="bg-[#17212b] border border-white/10 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span>📱 Comandos Interativos no Telegram</span>
              <span className="text-gray-400 text-xs font-normal">(Use no chat com o bot)</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
            <div className="p-3 rounded-xl bg-[#242f3d] border border-white/5 space-y-1">
              <span className="font-mono font-bold text-[#64b5f6]">/start ou /apps</span>
              <p className="text-gray-300 text-[11px]">Abre o lançador com botões de toque por categorias (Social, Trabalho, Ferramentas, Mídia).</p>
            </div>

            <div className="p-3 rounded-xl bg-[#242f3d] border border-white/5 space-y-1">
              <span className="font-mono font-bold text-[#64b5f6]">Cole qualquer link</span>
              <p className="text-gray-300 text-[11px]">Envie <code>https://exemplo.com</code> direto no chat. O bot detecta o nome e pede a categoria.</p>
            </div>

            <div className="p-3 rounded-xl bg-[#242f3d] border border-white/5 space-y-1">
              <span className="font-mono font-bold text-[#64b5f6]">/search &lt;nome&gt;</span>
              <p className="text-gray-300 text-[11px]">Busca aplicativos salvos e exibe o botão de lançamento com um toque.</p>
            </div>

            <div className="p-3 rounded-xl bg-[#242f3d] border border-white/5 space-y-1">
              <span className="font-mono font-bold text-[#64b5f6]">/remove</span>
              <p className="text-gray-300 text-[11px]">Menu com botões de lixeira para excluir apps adicionados por você.</p>
            </div>

            <div className="p-3 rounded-xl bg-[#242f3d] border border-white/5 space-y-1">
              <span className="font-mono font-bold text-[#64b5f6]">/language</span>
              <p className="text-gray-300 text-[11px]">Altera o idioma de respostas do bot (Português, English, Español).</p>
            </div>

            <div className="p-3 rounded-xl bg-[#242f3d] border border-white/5 space-y-1">
              <span className="font-mono font-bold text-[#64b5f6]">/help</span>
              <p className="text-gray-300 text-[11px]">Exibe o manual completo de comandos e instruções de uso.</p>
            </div>
          </div>
        </section>

        {/* Embedded Interactive Telegram Simulator / Console (Allows testing messages directly) */}
        <section className="bg-[#17212b] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 bg-[#242f3d] border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
              <h3 className="text-sm font-bold text-white">
                🧪 Console Interativo do Bot (Simulador de Mensagens Telegram)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetChat}
                className="px-2.5 py-1 rounded-lg bg-[#17212b] border border-white/10 hover:bg-[#2b3747] text-gray-300 text-xs flex items-center gap-1 transition"
                title="Reiniciar conversa"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reiniciar</span>
              </button>
              <button
                onClick={() => setIsConsoleOpen((v) => !v)}
                className="px-2.5 py-1 rounded-lg bg-[#17212b] border border-white/10 hover:bg-[#2b3747] text-gray-300 text-xs transition"
              >
                {isConsoleOpen ? 'Recolher' : 'Expandir'}
              </button>
            </div>
          </div>

          {isConsoleOpen && (
            <div className="flex flex-col h-[460px]">
              {/* Message thread */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0e1621]">
                {messages.map((msg) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-in fade-in`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-md ${
                          isUser
                            ? 'bg-[#2b5278] text-white rounded-br-xs'
                            : 'bg-[#182533] text-gray-100 border border-white/10 rounded-bl-xs'
                        }`}
                      >
                        {!isUser && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[11px] font-bold text-[#64b5f6]">
                              {botStatus?.username ? `@${botStatus.username}` : 'Web App Launcher'}
                            </span>
                            <span className="text-[9px] text-gray-400 font-mono">bot</span>
                          </div>
                        )}

                        <div
                          className="text-xs sm:text-[13px] leading-relaxed break-words whitespace-pre-wrap select-text"
                          dangerouslySetInnerHTML={{ __html: msg.text }}
                        />

                        {/* Inline Buttons */}
                        {msg.replyMarkup?.inline_keyboard && msg.replyMarkup.inline_keyboard.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-white/10 flex flex-col gap-1.5">
                            {msg.replyMarkup.inline_keyboard.map((row, rowIndex) => (
                              <div key={rowIndex} className="flex gap-1.5 flex-wrap">
                                {row.map((btn, btnIndex) => {
                                  const isUrl = Boolean(btn.url);
                                  return (
                                    <button
                                      key={btnIndex}
                                      onClick={() => handleButtonClick(btn, msg.id)}
                                      className={`flex-1 min-w-[28%] text-center py-1.5 px-2.5 rounded-xl text-xs font-semibold transition active:scale-95 flex items-center justify-center gap-1 truncate ${
                                        isUrl
                                          ? 'bg-[#2481cc]/25 hover:bg-[#2481cc]/40 text-[#64b5f6] border border-[#2481cc]/30 shadow-xs'
                                          : 'bg-[#242f3d] hover:bg-[#2c3a4a] text-gray-200 border border-white/10'
                                      }`}
                                      title={btn.text}
                                    >
                                      {isUrl && <LinkIcon className="w-3 h-3 shrink-0 opacity-70" />}
                                      <span className="truncate">{btn.text}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-gray-400">
                          <span>{msg.time}</span>
                          {isUser && <span className="text-[#64b5f6] font-bold">✓✓</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>

              {/* Bottom Quick Chips & Input */}
              <div className="p-3 bg-[#17212b] border-t border-white/10 space-y-2">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none text-[11px]">
                  {['/start', '/apps', '/add https://github.com', '/search youtube', '/remove', '/language', '/help'].map(
                    (cmd, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(cmd)}
                        className="px-2 py-0.5 rounded-md bg-[#242f3d] border border-white/10 hover:bg-[#2b3747] text-gray-300 font-mono transition"
                      >
                        {cmd}
                      </button>
                    )
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage(inputText);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Envie /start, /apps ou cole uma URL (ex: https://github.com)..."
                    className="flex-1 h-9 px-3 rounded-xl bg-[#242f3d] border border-white/10 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-[#2481cc]"
                  />
                  <button
                    type="submit"
                    disabled={isSending || !inputText.trim()}
                    className="h-9 px-3.5 rounded-xl bg-[#2481cc] hover:bg-[#1d6fae] text-white text-xs font-semibold flex items-center justify-center gap-1 transition active:scale-95 disabled:opacity-40"
                  >
                    {isSending ? (
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>Enviar</span>
                  </button>
                </form>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Bot Configuration Modal */}
      <BotConfigModal
        isOpen={isConfigOpen}
        lang={lang}
        botStatus={botStatus}
        onClose={() => setIsConfigOpen(false)}
        onTokenSaved={() => {
          refreshBotStatus();
          handleResetChat();
        }}
      />
    </div>
  );
}
