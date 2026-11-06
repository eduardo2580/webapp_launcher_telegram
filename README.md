# 🤖 Headless Telegram Bot Backend (Google Gemini AI)

> **Backend server-side puro em Python**, operando 100% no terminal via **Telegram Bot API** e **Google Gemini API** (`gemini-3.8-flash`).  
> Sem qualquer interface web, frontend, HTML, CSS ou JavaScript.

---

## 📋 Sumário
1. [Visão Geral](#-visão-geral)
2. [Solução para o Erro NO_CLUSTER da Discloud](#-solução-para-o-erro-no_cluster-da-discloud)
3. [Instalação e Execução Local](#-instalação-e-execução-local)
4. [Deploy na Discloud](#-deploy-na-discloud)
5. [Alternativas Gratuitas sem Fila](#-alternativas-gratuitas-sem-fila)
6. [Comandos no Telegram](#-comandos-no-telegram)
7. [Licença](#-licença)

---

## 🌟 Visão Geral

* **100% Headless**: Roda no terminal como um daemon leve (< 15 MB de RAM).
* **Gemini API**: Respostas inteligentes via modelo `gemini-3.8-flash`.
* **Modo Offline**: Responde comandos, cálculos e saudações mesmo antes de configurar a chave do Gemini.
* **Compactação Ultra-Otimizada**: Arquivo `discloud.zip` de apenas ~9 KB, acelerando o provisionamento em servidores em nuvem.

---

## ⚡ Solução para o Erro `NO_CLUSTER` da Discloud

### O que significa `NO_CLUSTER`?
```json
{"status":"error","message":"No momento, estamos lidando com uma alta demanda de Bots em nosso plano gratuito...","code":"NO_CLUSTER"}
```
Esse erro da Discloud ocorre **exclusivamente quando os nós (clusters) do plano gratuito estão temporariamente lotados** de bots de outros usuários. Não é um erro no seu código.

### Como Evitar e Superar o `NO_CLUSTER`:

1. **Upload Limpo via `discloud.zip` (9.4 KB)**:
   Muitos usuários recebem erro porque enviam pastas inteiras ou arquivos desnecessários (`node_modules`, `.cache`), fazendo a alocação falhar.  
   Execute:
   ```bash
   python3 pack_discloud.py
   ```
   Isso cria o arquivo `discloud.zip` limpo com apenas os arquivos necessários (`bot.py`, `discloud.config`, `requirements.txt`).

2. **Auto-Retry com Fila (`deploy_discloud.py`)**:
   Em vez de tentar manualmente no painel web enquanto os servidores estão lotados, use o script de auto-deploy que tenta a cada 25 segundos até uma vaga abrir no cluster gratuito:
   ```bash
   python3 deploy_discloud.py SEU_TOKEN_DA_DISCLOUD
   ```
   *(Seu token pode ser obtido em `discloud.com/dashboard/user`)*.

3. **Horários de Baixa Demanda**:
   Na Discloud gratuita, vagas abrem com frequência a cada poucos minutos quando bots de teste de outros usuários são desligados ou reiniciados.

---

## 🚀 Instalação e Execução Local

```bash
# 1. Instalar dependências
pip install -r requirements.txt

# 2. Configurar variáveis no .env
cp .env.example .env

# 3. Executar o bot
python3 bot.py
```

---

## ☁️ Deploy na Discloud

O arquivo `discloud.config` já está nos padrões oficiais:
```ini
NAME=TelegramGeminiBot
TYPE=bot
MAIN=bot.py
RAM=100
AUTORESTART=true
VERSION=latest
```

Envie o arquivo `discloud.zip` gerado pelo `python3 pack_discloud.py` no [Painel da Discloud](https://discloud.com/dashboard).

---

## 🌐 Alternativas Gratuitas Sem Limitação de Cluster

Se a Discloud estiver permanentemente lotada no plano gratuito, você pode hospedar este bot gratuitamente em:

1. **[Render.com](https://render.com/)**:
   - Crie um *Background Worker* ou *Web Service* gratuito.
   - Conecte o repositório Git.
   - Start Command: `python3 bot.py`.
   - Sem filas nem erro `NO_CLUSTER`.

2. **[Koyeb.com](https://www.koyeb.com/)**:
   - Oferece instâncias gratuitas *Eco* com deploy direto via GitHub ou Dockerfile.

3. **[Railway.app](https://railway.app/)** ou **VPS Gratuita**:
   - Execute com `python3 bot.py`.

---

## 💬 Comandos no Telegram

* `/start` — Boas-vindas e introdução
* `/help` — Lista de comandos e ajuda
* `/clear` — Limpa o histórico da conversa
* `/status` — Status do servidor, uptime e contagem de mensagens
* `/ping` — Teste rápido de resposta

---

## 📄 Licença

Distribuído sob a licença **MIT** em nome de **Eduardo Souza Rodrigues**. Consulte o arquivo `LICENSE` para detalhes.
