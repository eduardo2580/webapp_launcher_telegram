import React, { useState } from 'react';
import { X, Wrench, Smartphone, Wifi, Check, Copy, AlertCircle, RotateCcw } from './Icons';
import { Language, CloudStorageSyncState, WebAppItem } from '../types';
import { getTranslation } from '../i18n/translations';

import { getTelegramWebApp, isCloudStorageAvailable } from '../services/telegram';

interface DiagnosticsModalProps {
  isOpen: boolean;
  lang: Language;
  syncState?: CloudStorageSyncState;
  apps?: WebAppItem[];
  onTriggerSync?: () => Promise<boolean>;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({
  isOpen,
  lang,
  syncState,
  apps = [],
  onTriggerSync,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'status' | 'android' | 'ios' | 'checklist'>('status');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [networkInfo, setNetworkInfo] = useState<{
    serverOk: boolean;
    serverHost?: string;
    serverPort?: number;
    protocol?: string;
    error?: string;
    latencyMs?: number;
  } | null>(null);


  if (!isOpen) return null;

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {
      console.warn('Copy error:', e);
    }
  };

  const runConnectionTest = async () => {
    setIsTesting(true);
    const start = performance.now();
    try {
      const res = await fetch('/api/network-info', { cache: 'no-store' });
      const latency = Math.round(performance.now() - start);
      if (res.ok) {
        const data = await res.json();
        setNetworkInfo({
          serverOk: true,
          serverHost: data.detectedHost,
          serverPort: data.serverPort,
          protocol: data.protocol,
          latencyMs: latency,
        });
      } else {
        setNetworkInfo({
          serverOk: false,
          error: `HTTP ${res.status}: ${res.statusText}`,
          latencyMs: latency,
        });
      }
    } catch (err: unknown) {
      setNetworkInfo({
        serverOk: false,
        error: err instanceof Error ? err.message : 'Connection failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const tg = getTelegramWebApp();
  const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const isSWActive = typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;

  // Code snippets for copy
  const androidNetSecXml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
        <domain includeSubdomains="true">10.0.2.2</domain> <!-- Android Emulator -->
        <domain includeSubdomains="true">10.0.3.2</domain> <!-- Genymotion -->
        <domain includeSubdomains="true">192.168.0.0</domain>
        <domain includeSubdomains="true">192.168.1.0</domain>
    </domain-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors><certificates src="system" /></trust-anchors>
    </base-config>
</network-security-config>`;

  const androidManifestXml = `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.weblauncher">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:usesCleartextTraffic="true"
        android:networkSecurityConfig="@xml/network_security_config">
        <!-- Activities -->
    </application>
</manifest>`;

  const iosPlistXml = `<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsLocalNetworking</key>
    <true/>
    <key>NSAllowsArbitraryLoadsInWebContent</key>
    <true/>
    <key>NSExceptionDomains</key>
    <dict>
        <key>localhost</key>
        <dict><key>NSTemporaryExceptionAllowsInsecureHTTPLoads</key><true/></dict>
        <key>127.0.0.1</key>
        <dict><key>NSTemporaryExceptionAllowsInsecureHTTPLoads</key><true/></dict>
    </dict>
</dict>`;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#17212b] border border-white/10 w-full max-w-xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="px-4 py-3 bg-[#242f3d] border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#2481cc]/20 text-[#64b5f6] flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {lang === 'pt' ? 'Diagnóstico & Config Mobile' : lang === 'es' ? 'Diagnóstico y Config Móvil' : 'Mobile & WebView Diagnostics'}
              </h3>
              <p className="text-[10px] text-gray-400">
                {lang === 'pt' ? 'Solução para ERR_CONNECTION_REFUSED e WebViews' : 'Resolving ERR_CONNECTION_REFUSED & WebViews'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-white/10 bg-[#1c2733] px-3 pt-2 gap-1 overflow-x-auto scrollbar-none shrink-0">
          <button
            onClick={() => setActiveTab('status')}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold transition border-b-2 ${
              activeTab === 'status'
                ? 'border-[#2481cc] text-[#64b5f6] bg-[#17212b]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {lang === 'pt' ? 'Status Conexão' : 'Connection Status'}
          </button>
          <button
            onClick={() => setActiveTab('android')}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold transition border-b-2 ${
              activeTab === 'android'
                ? 'border-[#2481cc] text-[#64b5f6] bg-[#17212b]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Android (XML)
          </button>
          <button
            onClick={() => setActiveTab('ios')}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold transition border-b-2 ${
              activeTab === 'ios'
                ? 'border-[#2481cc] text-[#64b5f6] bg-[#17212b]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            iOS (Plist)
          </button>
          <button
            onClick={() => setActiveTab('checklist')}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-semibold transition border-b-2 ${
              activeTab === 'checklist'
                ? 'border-[#2481cc] text-[#64b5f6] bg-[#17212b]'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Checklist Debug
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3.5 text-xs">
          {activeTab === 'status' && (
            <div className="space-y-3">
              {/* Live Test Action */}
              <div className="p-3 bg-[#242f3d] rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-white">
                    {lang === 'pt' ? 'Teste de Conexão com o Backend' : 'Backend Connectivity Test'}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {lang === 'pt' ? 'Verifica binding 0.0.0.0 e resposta da API' : 'Pings /api/network-info on port 3000'}
                  </div>
                </div>
                <button
                  onClick={runConnectionTest}
                  disabled={isTesting}
                  className="px-3 py-1.5 bg-[#2481cc] hover:bg-[#1d6fae] text-white rounded-lg font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? '...' : lang === 'pt' ? 'Testar' : 'Test'}</span>
                </button>
              </div>

              {networkInfo && (
                <div
                  className={`p-3 rounded-xl border ${
                    networkInfo.serverOk
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-bold mb-1">
                    {networkInfo.serverOk ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>
                      {networkInfo.serverOk
                        ? lang === 'pt' ? 'Servidor Ativo e Respondendo!' : 'Server Active & Connected!'
                        : lang === 'pt' ? 'Falha na Conexão' : 'Connection Refused / Failed'}
                    </span>
                    {networkInfo.latencyMs !== undefined && (
                      <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded font-mono ml-auto">
                        {networkInfo.latencyMs}ms
                      </span>
                    )}
                  </div>
                  {networkInfo.serverOk ? (
                    <div className="text-[11px] space-y-0.5 text-gray-300 font-mono mt-1">
                      <div>Host: {networkInfo.serverHost}</div>
                      <div>Porta: {networkInfo.serverPort} (ouvindo em 0.0.0.0)</div>
                      <div>Protocolo: {networkInfo.protocol}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-rose-200 mt-1">
                      {networkInfo.error}
                    </div>
                  )}
                </div>
              )}

              {/* Environment checks */}
              <div className="space-y-2">
                <div className="p-2.5 bg-[#242f3d] rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-[#64b5f6]" />
                    <span className="text-gray-300 font-medium">Binding de Rede</span>
                  </div>
                  <span className="font-mono text-emerald-400 font-semibold">0.0.0.0:3000 (Todas as interfaces)</span>
                </div>

                <div className="p-2.5 bg-[#242f3d] rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4 text-[#64b5f6]" />
                    <span className="text-gray-300 font-medium">Mapeamento Emulador Android</span>
                  </div>
                  <span className="font-mono text-amber-300 font-semibold">10.0.2.2:3000</span>
                </div>

                <div className="p-2.5 bg-[#242f3d] rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">⚙️</span>
                    <span className="text-gray-300 font-medium">Service Worker (PWA)</span>
                  </div>
                  <span className={`font-mono text-xs font-semibold ${isSWActive ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {isSWActive ? 'Ativo & Registrado' : hasServiceWorker ? 'Suportado' : 'Não disponível'}
                  </span>
                </div>

                <div className="p-2.5 bg-[#242f3d] rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🔄</span>
                    <span className="text-gray-300 font-medium">Background Sync API</span>
                  </div>
                  <span className={`font-mono text-xs font-semibold ${syncState?.hasBackgroundSync ? 'text-emerald-400' : 'text-amber-300'}`}>
                    {syncState?.hasBackgroundSync ? 'Suportado (SyncManager)' : 'Fallback Automático (Eventos)'}
                  </span>
                </div>

                <div className="p-2.5 bg-[#242f3d] rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📦</span>
                    <span className="text-gray-300 font-medium">Cache de Metadados (/api/apps)</span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-[#64b5f6]">
                    tma-metadata-v2 ({apps.length} apps)
                  </span>
                </div>

                <div className="p-2.5 bg-[#242f3d] rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">✈️</span>
                    <span className="text-gray-300 font-medium">Telegram WebApp SDK</span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-[#64b5f6]">
                    {tg ? `v${tg.version} (${tg.platform})` : 'Modo Navegador / PWA'}
                  </span>
                </div>

                <div className="p-2.5 bg-[#242f3d] rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">☁️</span>
                    <span className="text-gray-300 font-medium">Telegram Cloud Storage</span>
                  </div>
                  <span className={`font-mono text-xs font-semibold ${isCloudStorageAvailable() ? 'text-emerald-400' : 'text-gray-400'}`}>
                    {isCloudStorageAvailable() ? 'Disponível (v6.9+)' : 'Fallback LocalStorage'}
                  </span>
                </div>

                {/* Manual Background Sync Trigger */}
                {onTriggerSync && (
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white text-[11px]">{getTranslation(lang, 'backgroundSync')}</div>
                      <div className="text-[10px] text-gray-400">
                        {syncFeedback ? (
                          <span className="text-emerald-400 font-medium">{syncFeedback}</span>
                        ) : (
                          'Grava metadados no Cache Storage e dispara sincronização'
                        )}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        setIsSyncing(true);
                        setSyncFeedback(null);
                        try {
                          await onTriggerSync();
                          setSyncFeedback('Sincronizado!');
                          setTimeout(() => setSyncFeedback(null), 3000);
                        } catch {
                          setSyncFeedback('Erro');
                          setTimeout(() => setSyncFeedback(null), 3000);
                        } finally {
                          setIsSyncing(false);
                        }
                      }}
                      disabled={isSyncing}
                      className="px-2.5 py-1 bg-[#2481cc]/20 hover:bg-[#2481cc]/30 text-[#64b5f6] border border-[#2481cc]/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                    >
                      <RotateCcw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? '...' : getTranslation(lang, 'forceSyncNow')}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}


          {activeTab === 'android' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white">res/xml/network_security_config.xml</span>
                  <button
                    onClick={() => handleCopy(androidNetSecXml, 'netSec')}
                    className="px-2 py-0.5 rounded bg-[#2481cc]/20 text-[#64b5f6] hover:bg-[#2481cc]/30 text-[11px] font-semibold flex items-center gap-1"
                  >
                    {copiedKey === 'netSec' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'netSec' ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <pre className="p-2.5 bg-[#0f161e] border border-white/10 rounded-xl font-mono text-[10px] text-gray-300 overflow-x-auto">
                  {androidNetSecXml}
                </pre>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white">AndroidManifest.xml (aplicar no &lt;application&gt;)</span>
                  <button
                    onClick={() => handleCopy(androidManifestXml, 'manifest')}
                    className="px-2 py-0.5 rounded bg-[#2481cc]/20 text-[#64b5f6] hover:bg-[#2481cc]/30 text-[11px] font-semibold flex items-center gap-1"
                  >
                    {copiedKey === 'manifest' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'manifest' ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <pre className="p-2.5 bg-[#0f161e] border border-white/10 rounded-xl font-mono text-[10px] text-gray-300 overflow-x-auto">
                  {androidManifestXml}
                </pre>
              </div>
            </div>
          )}

          {activeTab === 'ios' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white">Info.plist (App Transport Security)</span>
                  <button
                    onClick={() => handleCopy(iosPlistXml, 'iosPlist')}
                    className="px-2 py-0.5 rounded bg-[#2481cc]/20 text-[#64b5f6] hover:bg-[#2481cc]/30 text-[11px] font-semibold flex items-center gap-1"
                  >
                    {copiedKey === 'iosPlist' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'iosPlist' ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
                <pre className="p-2.5 bg-[#0f161e] border border-white/10 rounded-xl font-mono text-[10px] text-gray-300 overflow-x-auto">
                  {iosPlistXml}
                </pre>
              </div>
              <div className="p-3 bg-[#242f3d] rounded-xl text-gray-300 text-[11px] space-y-1">
                <div className="font-semibold text-amber-300">Nota para iOS / WKWebView:</div>
                <p>
                  No simulador iOS, <code>localhost</code> aponta diretamente para o seu Mac. Já em aparelhos físicos, use o IP da sua rede local (ex: <code>http://192.168.1.50:3000</code>).
                </p>
              </div>
            </div>
          )}

          {activeTab === 'checklist' && (
            <div className="space-y-2 text-[11px] text-gray-300">
              <div className="p-2.5 bg-[#242f3d] rounded-xl border border-white/10">
                <div className="font-bold text-white mb-0.5">1. IP da Máquina vs Emulador (ERR_CONNECTION_REFUSED)</div>
                <p className="text-gray-400">
                  Dentro do emulador Android, <code>localhost</code> é o emulador em si! Use <strong>10.0.2.2</strong> para acessar o servidor rodando no computador.
                </p>
              </div>

              <div className="p-2.5 bg-[#242f3d] rounded-xl border border-white/10">
                <div className="font-bold text-white mb-0.5">2. Binding do Servidor em 0.0.0.0</div>
                <p className="text-gray-400">
                  O servidor foi configurado para escutar em <code>app.listen(PORT, '0.0.0.0')</code>. Se escutar apenas em 127.0.0.1, conexões do emulador e dispositivos locais serão recusadas.
                </p>
              </div>

              <div className="p-2.5 bg-[#242f3d] rounded-xl border border-white/10">
                <div className="font-bold text-white mb-0.5">3. Bloqueio de Frame (Instagram, Facebook, LinkedIn)</div>
                <p className="text-gray-400">
                  Grandes redes sociais enviam o cabeçalho <code>X-Frame-Options: DENY</code>. Use a opção <strong>"Abrir no Navegador In-App do Telegram"</strong> integrada no launcher para rodar 100% dentro do Telegram com login completo e cookies preservados.
                </p>
              </div>

              <div className="p-2.5 bg-[#242f3d] rounded-xl border border-white/10">
                <div className="font-bold text-white mb-0.5">4. Service Worker e HTTPS</div>
                <p className="text-gray-400">
                  PWAs e Service Workers requerem conexão segura (HTTPS), exceto quando executadas em <code>localhost</code>, <code>127.0.0.1</code> ou <code>10.0.2.2</code>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-[#242f3d] border-t border-white/10 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-gray-400">Arquivos prontos em /android-config e /ios-config</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-[#2481cc] hover:bg-[#1d6fae] text-white text-xs font-semibold transition"
          >
            {getTranslation(lang, 'close')}
          </button>
        </div>
      </div>
    </div>
  );
};
