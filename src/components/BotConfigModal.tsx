import React, { useState } from 'react';
import { X, Check, Copy, Bot, AlertCircle, RotateCcw, Globe } from './Icons';
import { BotStatusResponse, Language } from '../types';

interface BotConfigModalProps {
  isOpen: boolean;
  lang: Language;
  botStatus: BotStatusResponse | null;
  onClose: () => void;
  onTokenSaved: () => void;
}

export const BotConfigModal: React.FC<BotConfigModalProps> = ({
  isOpen,
  lang,
  botStatus,
  onClose,
  onTokenSaved,
}) => {
  const [tokenInput, setTokenInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${currentOrigin}/api/telegram/webhook`;

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Ignore
    }
  };

  const handleSaveToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/bot/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== 'ok') {
        throw new Error(data.message || 'Falha ao validar o token do Telegram.');
      }

      setSuccessMessage(
        lang === 'pt'
          ? `Bot @${data.username} conectado com sucesso! O polling no Telegram já foi iniciado.`
          : `Bot @${data.username} connected successfully! Long polling is now running in Telegram.`
      );
      setTokenInput('');
      onTokenSaved();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao conectar ao Telegram.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#17212b] border border-white/10 w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 my-auto">
        {/* Header */}
        <div className="px-5 py-4 bg-[#242f3d] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#2481cc]/20 text-[#64b5f6] flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {lang === 'pt' ? 'Telegram Bot API & Conexão' : lang === 'es' ? 'Telegram Bot API y Conexión' : 'Telegram Bot API & Setup'}
              </h3>
              <p className="text-xs text-gray-400">
                {lang === 'pt' ? 'Controle seu lançador 100% por mensagens no Telegram' : 'Operate your launcher 100% via Telegram messages'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Status Badge Card */}
          <div className="p-3.5 rounded-xl bg-[#242f3d] border border-white/10 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-white flex items-center gap-2">
                <span>{lang === 'pt' ? 'Status do Bot:' : 'Bot Status:'}</span>
                {botStatus?.configured ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-mono text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>ONLINE ({botStatus.username ? `@${botStatus.username}` : 'Conectado'})</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-300 font-mono text-xs">
                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                    <span>Modo Simulador Web (Pronto para conectar)</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {botStatus?.configured
                  ? 'O bot está escutando mensagens no Telegram via Bot API.'
                  : 'Você pode testar todas as mensagens no simulador ou adicionar seu token abaixo.'}
              </p>
            </div>
            <div className="text-right font-mono text-[11px] text-[#64b5f6]">
              {botStatus?.totalApps || 0} apps
            </div>
          </div>

          {/* Connect Bot Form */}
          <form onSubmit={handleSaveToken} className="p-4 rounded-xl bg-[#1c2733] border border-white/10 space-y-3">
            <div className="font-semibold text-white text-sm flex items-center gap-1.5">
              <span>🔑</span>
              <span>{lang === 'pt' ? 'Conectar Bot do Telegram (@BotFather)' : 'Connect Telegram Bot'}</span>
            </div>

            <p className="text-gray-300 text-xs leading-relaxed">
              {lang === 'pt'
                ? 'Para usar o bot direto no aplicativo do Telegram, crie um bot no @BotFather e cole o token aqui:'
                : 'To use the bot directly inside the official Telegram app, create a bot in @BotFather and paste the token here:'}
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-gray-400">
                TELEGRAM_BOT_TOKEN
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="123456789:ABCdefGHIjklmNOPqrsTUVwxyz..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#242f3d] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-[#2481cc] font-mono text-xs"
                />
                <button
                  type="submit"
                  disabled={isSaving || !tokenInput.trim()}
                  className="px-4 py-2 bg-[#2481cc] hover:bg-[#1d6fae] text-white rounded-xl font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50 shrink-0"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
                  <span>{isSaving ? '...' : lang === 'pt' ? 'Ativar Bot' : 'Activate'}</span>
                </button>
              </div>
            </div>

            {successMessage && (
              <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </form>

          {/* Webhook URL Card */}
          <div className="p-4 rounded-xl bg-[#1c2733] border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-[#64b5f6]" />
                <span>{lang === 'pt' ? 'URL do Webhook (Opcional)' : 'Webhook Endpoint (Optional)'}</span>
              </div>
              <button
                onClick={() => handleCopy(webhookUrl, 'webhook')}
                className="px-2.5 py-1 rounded-lg bg-[#2481cc]/20 text-[#64b5f6] hover:bg-[#2481cc]/30 text-xs font-semibold flex items-center gap-1"
              >
                {copiedKey === 'webhook' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'webhook' ? 'Copiado!' : 'Copiar URL'}</span>
              </button>
            </div>
            <pre className="p-2.5 bg-[#0f161e] border border-white/10 rounded-xl font-mono text-[11px] text-gray-300 overflow-x-auto select-all">
              {webhookUrl}
            </pre>
            <p className="text-[11px] text-gray-400">
              {lang === 'pt'
                ? 'Nota: O servidor inicia Long Polling automático assim que o token é configurado, funcionando perfeitamente sem necessidade de webhook público!'
                : 'Note: The bot uses built-in Long Polling automatically, so a public webhook is not required for it to receive messages!'}
            </p>
          </div>

          {/* How it works by messages */}
          <div className="p-4 rounded-xl bg-[#1c2733] border border-white/10 space-y-2.5">
            <div className="font-semibold text-white">
              {lang === 'pt' ? 'Como Funciona o Lançador por Mensagens:' : 'How the Message Launcher Works:'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-gray-300">
              <div className="p-2.5 rounded-lg bg-[#242f3d] border border-white/5 space-y-1">
                <span className="font-bold text-white">/start ou /apps</span>
                <p className="text-gray-400">Abre o menu interativo no chat com categorias, botões de abrir e paginação.</p>
              </div>
              <div className="p-2.5 rounded-lg bg-[#242f3d] border border-white/5 space-y-1">
                <span className="font-bold text-white">Cole qualquer link</span>
                <p className="text-gray-400">O bot reconhece a URL e exibe botões para você escolher a categoria com 1 toque.</p>
              </div>
              <div className="p-2.5 rounded-lg bg-[#242f3d] border border-white/5 space-y-1">
                <span className="font-bold text-white">/search &lt;nome&gt;</span>
                <p className="text-gray-400">Busca rápida que retorna o botão de lançamento imediato do aplicativo.</p>
              </div>
              <div className="p-2.5 rounded-lg bg-[#242f3d] border border-white/5 space-y-1">
                <span className="font-bold text-white">/remove</span>
                <p className="text-gray-400">Lista os apps adicionados com botões de lixeira para exclusão rápida.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#242f3d] border-t border-white/10 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#2481cc] hover:bg-[#1d6fae] text-white text-xs font-semibold transition"
          >
            {lang === 'pt' ? 'Concluído' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
};
