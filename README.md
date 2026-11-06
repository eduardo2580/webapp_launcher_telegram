# 🤖 Headless Telegram Bot Backend (Google Gemini AI)

> **Backend server-side puro em Python**, operando 100% no terminal via **Telegram Bot API** e **Google Gemini API** (`gemini-3.8-flash`).  
> Sem qualquer interface web, frontend, HTML, CSS ou JavaScript.

---

## 📋 Sumário
1. [Visão Geral](#-visão-geral)
2. [Principais Recursos](#-principais-recursos)
3. [Arquitetura](#-arquitetura)
4. [Instalação e Execução](#-instalação-e-execução)
5. [Variáveis de Ambiente](#-variáveis-de-ambiente)
6. [Deploy na Discloud](#-deploy-na-discloud)
7. [Comandos do Bot no Telegram](#-comandos-do-bot-no-telegram)
8. [Licença](#-licença)

---

## 🌟 Visão Geral

Este bot roda como um processo daemon no terminal:
* **Terminal Headless**: Recebe atualizações via long polling da Telegram Bot API.
* **Google Gemini API**: Repassa as mensagens dos usuários para o modelo `gemini-3.8-flash` acompanhadas de instruções de sistema (*system instructions*) otimizadas para mensagens móveis.
* **Respostas Diretas no Chat**: Responde no chat do Telegram com formatação compatível (Markdown, blocos de código, negrito, itálico).
* **Indicador de Digitação**: Ativa o status `typing...` no Telegram enquanto a IA gera a resposta.
* **Memória de Conversa**: Mantém o contexto de turnos recentes da conversa por chat.

---

## 📦 Arquivos do Projeto

* `bot.py`: Script principal do servidor backend em Python.
* `requirements.txt`: Dependências Python (`google-genai`, `python-dotenv`, `requests`).
* `discloud.config`: Configuração para hospedagem do bot na nuvem Discloud.
* `.env.example`: Modelo de variáveis de ambiente.

---

## 🚀 Instalação e Execução

### 1. Clonar ou Acessar o Diretório
```bash
cd telegram-gemini-bot
```

### 2. Instalar Dependências
```bash
pip install -r requirements.txt
```

### 3. Configurar Credenciais
Crie um arquivo `.env` baseado no `.env.example`:
```env
TELEGRAM_BOT_TOKEN=seu_token_do_botfather
GEMINI_API_KEY=sua_chave_gemini_api
GEMINI_MODEL=gemini-3.8-flash
PORT=3000
```

### 4. Executar no Terminal
```bash
python3 bot.py
```

---

## ☁️ Deploy na Discloud

O arquivo `discloud.config` já está pronto:

```ini
ID=telegram-gemini-bot
TYPE=bot
MAIN=bot.py
NAME=Telegram Gemini Bot
RAM=100
AUTORESTART=true
VERSION=latest
BUILD=pip install -r requirements.txt
START=python3 bot.py
```

No painel da [Discloud](https://discloud.com/):
1. Adicione a variável `TELEGRAM_BOT_TOKEN` com o token gerado pelo `@BotFather`.
2. Adicione a variável `GEMINI_API_KEY` com sua chave do Google AI Studio.
3. Inicie a aplicação no plano `RAM=100`.

---

## 💬 Comandos no Telegram

* `/start` — Mensagem de boas-vindas e início da conversa
* `/help` — Manual de instruções e recursos
* `/clear` ou `/reset` — Limpa o histórico de memória da conversa atual
* `/status` — Informações sobre o modelo, uptime e mensagens processadas
* `/ping` — Teste de latência e conectividade
* *Texto livre* — Envie qualquer pergunta ou comando e receba a resposta da IA

---

## 📄 Licença

Distribuído sob a licença **MIT** em nome de **Eduardo Souza Rodrigues**. Consulte o arquivo `LICENSE` para detalhes.
