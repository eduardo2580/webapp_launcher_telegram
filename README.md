# 🚀 Telegram WebApp Launcher (Discloud Cloud Bot)

> **Bot em nuvem para Telegram hospedado na [Discloud](https://discloud.com/)**.  
> Todas as interações (lançar web apps, salvar links, buscar, organizar por categorias e gerenciar idiomas) acontecem **100% dentro do aplicativo do Telegram**, sem depender de navegador externo.

---

## 📋 Sumário
1. [Visão Geral](#-visão-geral)
2. [Principais Recursos](#-principais-recursos)
3. [Como Funciona](#-como-funciona)
4. [Deploy na Discloud (Passo a Passo)](#-deploy-na-discloud-passo-a-passo)
5. [Como Obter o Token no @BotFather](#-como-obter-o-token-no-botfather)
6. [Comandos do Bot no Telegram](#-comandos-do-bot-no-telegram)
7. [Variáveis de Ambiente](#-variáveis-de-ambiente)
8. [Desenvolvimento Local](#-desenvolvimento-local)
9. [Arquitetura e Otimização de Memória](#-arquitetura-e-otimização-de-memória)
10. [Endpoints da API REST](#-endpoints-da-api-rest)
11. [Estrutura do Projeto](#-estrutura-do-projeto)
12. [Solução de Problemas (FAQ)](#-solução-de-problemas-faq)

---

## 🌟 Visão Geral

Este projeto foi construído para transformar o Telegram em um **lançador central de aplicativos web e PWAs**.

* **Execução em Nuvem**: Projetado sob medida para o plano gratuito ou pago da **Discloud** (`TYPE=bot`, alocação de `RAM=100` MB).
* **Zero Navegador Externo**: Ao tocar em um aplicativo pelo menu do bot, o Telegram abre o site diretamente na sua visualização in-app segura.
* **Operação Totalmente por Mensagens**: Não há necessidade de acessar um painel web para adicionar ou usar seus apps. Tudo é feito conversando com o bot.
* **Painel de Monitoramento Incluso**: O servidor web (porta 3000) serve como monitor de saúde em tempo real, exibindo métricas da Discloud (heap, RSS, uptime e total de apps).

---

## ✨ Principais Recursos

* 📱 **Lançador Interativo com Teclado Inline**: Menus com paginação, categorias (*Social, Trabalho, Ferramentas, Mídia, Outros*) e botões com links diretos.
* 🔗 **Adição Inteligente por Colagem de Link**: Envie qualquer URL (ex: `https://reddit.com` ou `github.com`) diretamente no chat. O bot extrai o título do domínio, sugere a categoria e adiciona com 1 toque.
* 🔍 **Busca Rápida (`/search <termo>`)**: Localize qualquer app salvo instantaneamente.
* 🗑 **Menu de Remoção (`/remove`)**: Interface interativa com botões de lixeira para excluir apps adicionados.
* 🌐 **Suporte Multi-idioma**: Alternância dinâmica entre **Português (🇧🇷)**, **Inglês (🇺🇸)** e **Espanhol (🇪🇸)**.
* 💾 **Persistência Atômica Segura**: Armazenamento em arquivo JSON (`data/telegram-apps.json`) com fila de gravação assíncrona contra corrupção.
* ⚡ **Ultra Leve para Discloud**: Consumo de memória médio em torno de **~20 MB a ~35 MB**, muito abaixo do teto de 100 MB da Discloud.
* 🔄 **Long Polling Auto-recuperável**: Conexão direta com a Telegram Bot API sem necessidade de abrir portas públicas para webhook.

---

## 🛠 Como Funciona

```
┌─────────────────────────┐         Telegram Bot API
│   Aplicativo Telegram   │ ◄──────────────────────────────┐
│  (Mobile, Desktop, Web) │                                │
└────────────┬────────────┘                                │
             │  Mensagens & Botões Inline                  │ Long Polling
             ▼                                             │ (getUpdates)
┌──────────────────────────────────────────────────────────┴─────┐
│                    Discloud Cloud Worker                       │
│                   (Node.js Daemon / Bot)                       │
│                                                                │
│  • server.js: Escuta updates via TELEGRAM_BOT_TOKEN            │
│  • Parser de URLs & Auto-Categorização                         │
│  • Renderizador de Inline Keyboard (Menus & Paginação)         │
│  • Persistência Atômica: data/telegram-apps.json               │
│  • Healthcheck / Dashboard Web (Porta 3000)                    │
└────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Deploy na Discloud (Passo a Passo)

A [Discloud](https://discloud.com/) é uma plataforma especializada na hospedagem de bots (Node.js, Python, Java, etc.).

### 1. Arquivo `discloud.config`
O projeto já inclui o arquivo `discloud.config` configurado na raiz:

```ini
ID=webapp-launcher
TYPE=bot
MAIN=server.js
NAME=Telegram WebApp Launcher
RAM=100
AUTORESTART=true
VERSION=latest
BUILD=npm run build
START=npm run start
```

### 2. Configurando o Token na Discloud
1. Acesse o painel da Discloud: **[discloud.com/dashboard](https://discloud.com/dashboard)**.
2. No menu lateral, localize a sua aplicação (`webapp-launcher`).
3. Vá na aba **Variables / Variáveis de Ambiente**.
4. Adicione a chave:
   * **Nome:** `TELEGRAM_BOT_TOKEN`
   * **Valor:** *Seu token recebido do @BotFather* (ex: `123456789:ABCdefGHIjklmNOPqrsTUVwxyz`)
5. Clique em **Salvar** e **Reiniciar Bot**.

### 3. Upload dos Arquivos
Você pode enviar para a Discloud de três formas:
* **Via Painel Web (Upload Zip):** Compacte os arquivos do projeto em um arquivo `.zip` (o arquivo `.discloudignore` garante que a pasta `node_modules` seja excluída) e envie pelo painel.
* **Via Discloud CLI:**
  ```bash
  npm install -g discloud-cli
  discloud login
  discloud up
  ```
* **Via Integração com GitHub:** Vincule seu repositório diretamente na Discloud para deploys automáticos em cada commit.

---

## 🤖 Como Obter o Token no @BotFather

1. No Telegram, pesquise por **`@BotFather`** (verifique o selo azul de verificação).
2. Envie o comando:
   ```text
   /newbot
   ```
3. Escolha um nome amigável para o seu bot (ex: `Meu Web Launcher`).
4. Escolha um username único que termine obrigatoriamente com `bot` (ex: `meu_launcher_bot`).
5. O BotFather responderá com uma mensagem de sucesso contendo o seu token no formato:
   ```text
   123456789:ABCdefGHIjklmNOPqrsTUVwxyz
   ```
6. Guarde esse token e configure-o como `TELEGRAM_BOT_TOKEN` na Discloud ou no arquivo `.env`.

---

## 💬 Comandos do Bot no Telegram

| Comando | Descrição | Exemplo de Uso |
| :--- | :--- | :--- |
| `/start` | Inicia o bot e envia o lançador interativo com categorias. | `/start` |
| `/apps` | Exibe a lista completa de aplicativos salvos com botões de toque. | `/apps` |
| `/add <url>` | Adiciona um novo link diretamente à sua lista. | `/add https://github.com` |
| *Colar Link* | Apenas envie qualquer URL no chat. O bot detecta o site e solicita a categoria. | `https://netflix.com` |
| `/search <termo>` | Busca apps salvos pelo nome ou domínio e envia botão de acesso direto. | `/search youtube` |
| `/open <nome>` | Atalho para buscar e abrir um app. | `/open figma` |
| `/remove` | Abre o menu de exclusão de apps adicionados por você. | `/remove` |
| `/language` | Altera o idioma das respostas do bot (Português, Inglês, Espanhol). | `/language` |
| `/help` | Exibe a lista de comandos e dicas de uso. | `/help` |
| `/cancel` | Cancela qualquer operação em andamento (ex: cancela adição de app). | `/cancel` |

---

## 🔐 Variáveis de Ambiente

Crie um arquivo `.env` para execução local (ou configure no painel da Discloud):

```bash
# Token do bot gerado pelo @BotFather (Obrigatório para conexão real com o Telegram)
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklmNOPqrsTUVwxyz

# Diretório para armazenamento do banco de dados JSON (Padrão: ./data)
BOT_DATA_DIR=./data

# Porta HTTP para monitoramento e healthcheck (Padrão: 3000)
PORT=3000

# Ambiente de execução (production ou development)
NODE_ENV=production
```

---

## 💻 Desenvolvimento Local

### Pré-requisitos
* **Node.js**: v20.0.0 ou superior
* **npm**: v10.0.0 ou superior

### Instalação
```bash
# 1. Instale as dependências
npm install

# 2. Copie o arquivo de variáveis de ambiente
cp .env.example .env

# 3. Configure seu TELEGRAM_BOT_TOKEN no arquivo .env
# (Ou use o configurador interativo seguro)
npm run setup:telegram

# 4. Inicie o servidor de desenvolvimento
npm run dev
```

Abra `http://localhost:3000` para visualizar o painel do Discloud Bot e o simulador interativo de mensagens.

### Scripts Disponíveis no `package.json`
* `npm run dev`: Executa `tsx server.ts` com hot-reload no backend e Vite no frontend.
* `npm run build`: Compila o frontend React com Vite e gera o bundle único do backend `server.js` com esbuild.
* `npm run start`: Inicia o bot em modo de produção com flag `--max-old-space-size=64` para garantir economia de memória na Discloud.
* `npm run lint`: Valida o TypeScript estaticamente (`tsc --noEmit`).

---

## 🧠 Arquitetura e Otimização de Memória

### Por que Long Polling na Discloud?
A Discloud executa bots no modo `TYPE=bot`. Diferente de aplicações web (`TYPE=site`), bots com long polling não necessitam de porta HTTP aberta para o Telegram, certificados SSL externos ou URLs públicas de webhook. O bot se conecta diretamente à API do Telegram via chamadas HTTPS `getUpdates` com timeout estendido.

### Consumo de RAM (Limite Discloud: 100 MB)
* O processo foi otimizado para manter o consumo em **~22 MB de Heap** e **~35 MB de RSS**.
* O script de inicialização define `--max-old-space-size=64`, forçando coletas de lixo proativas pelo motor V8 do Node.js antes de atingir o teto de 100 MB.
* O arquivo `.discloudignore` exclui documentações, testes e `node_modules`, otimizando tempo de build e espaço em disco.

### Persistência Atômica de Dados
Os dados dos apps são salvos em `data/telegram-apps.json`. Para evitar corrupções em caso de reinicialização abrupta da máquina virtual:
1. Os dados são gravados primeiro em um arquivo temporário (`.tmp`).
2. O arquivo temporário é renomeado atomicamente com `fs.promises.rename`.
3. Uma fila assíncrona serializa todas as escritas concorrentes.

---

## 📡 Endpoints da API REST

O servidor Express disponibiliza endpoints úteis para automações, health checks e simulação:

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Healthcheck básico com status do bot e ambiente. |
| `GET` | `/api/bot/status` | Retorna status do bot, username `@`, métricas de RAM da Discloud e total de apps. |
| `POST` | `/api/bot/token` | Valida dinamicamente um novo token com o Telegram via `getMe` e inicia o polling. |
| `POST` | `/api/bot/message` | Simula envio de mensagens de texto (usado no painel web para testes). |
| `POST` | `/api/bot/callback` | Simula cliques em botões inline (usado no painel web para testes). |
| `GET` | `/api/apps` | Retorna lista completa de aplicativos em formato JSON com headers de cache. |
| `POST` | `/api/apps/sync` | Sincroniza metadados de aplicativos em lote. |
| `POST` | `/api/telegram/webhook` | Endpoint opcional caso prefira operar via webhook em vez de long polling. |

---

## 📂 Estrutura do Projeto

```text
├── discloud.config             # Configuração oficial para a Discloud (TYPE=bot, RAM=100)
├── .discloudignore             # Arquivos ignorados no upload para a Discloud
├── package.json                # Scripts de build, start e dependências
├── tsconfig.json               # Configurações do compilador TypeScript
├── vite.config.ts              # Configuração do Vite com plugin React & Tailwind
├── server.ts                   # Servidor backend Node.js (Bot Telegram + API + Express)
├── server.js                   # Bundle compilado para produção (gerado no build)
├── data/
│   └── telegram-apps.json      # Banco de dados JSON com os apps e idiomas salvos
├── public/
│   ├── icon.svg                # Ícone do aplicativo
│   ├── manifest.webmanifest    # Manifesto PWA
│   └── sw.js                   # Service Worker para cache offline
├── src/
│   ├── App.tsx                 # Dashboard Discloud Bot & Terminal de Testes
│   ├── main.tsx                # Ponto de entrada React
│   ├── types.ts                # Definições de tipos TypeScript
│   ├── components/
│   │   ├── BotConfigModal.tsx  # Modal de configuração do token do BotFather
│   │   └── Icons.tsx           # Ícones SVG leves inline
│   ├── i18n/
│   │   └── translations.ts     # Dicionário de traduções (PT, EN, ES)
│   └── services/
│       ├── telegram.ts         # Integração com o SDK nativo do Telegram WebApp
│       └── metadataSync.ts     # Sincronização em background com Service Worker
└── scripts/
    └── configure-telegram-token.mjs # Utilitário CLI para configuração segura do token
```

---

## ❓ Solução de Problemas (FAQ)

### 1. O bot não responde no Telegram após o deploy na Discloud
* **Verifique a variável:** Certifique-se de que a variável de ambiente se chama exatamente `TELEGRAM_BOT_TOKEN` e que não possui espaços antes ou depois.
* **Verifique o token:** Teste o token enviando uma requisição manual no navegador:
  ```text
  https://api.telegram.org/bot<SEU_TOKEN>/getMe
  ```
  Se retornar `"ok": true`, o token está correto.
* **Conflito de Webhook:** Se o bot estava configurado anteriormente em outro servidor com Webhook, o long polling é bloqueado. O servidor executa automaticamente `deleteWebhook` na inicialização para resolver isso.

### 2. O bot consome mais do que 100 MB de RAM?
* Não. O backend foi escrito sem bibliotecas pesadas de terceiros (usa `fetch` nativo do Node.js 20+ e parsing manual enxuto).
* O script `start` roda com `--max-old-space-size=64`, mantendo o processo bem abaixo do teto de 100 MB.

### 3. Como abrir os sites dentro do Telegram sem abrir o navegador padrão do celular?
* Todos os botões gerados pelo bot utilizam URLs normais no inline keyboard. Nos aplicativos oficiais do Telegram para Android, iOS e Desktop, esses links são abertos no navegador interno (In-App Browser) do Telegram, mantendo sessões, cookies e logins salvos.

---

## 📄 Licença
Distribuído sob a licença **MIT** © 2026 **Eduardo Souza Rodrigues**. Consulte o arquivo [`LICENSE`](./LICENSE) para mais detalhes.

