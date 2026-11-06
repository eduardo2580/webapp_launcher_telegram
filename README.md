# 🤖 Headless Telegram Bot Backend (Google Gemini AI)

> **Backend server-side puro em Python**, operando 100% no terminal via **Telegram Bot API** e **Google Gemini API** (`gemini-3.8-flash`).
> Sem qualquer interface web, frontend, HTML, CSS ou JavaScript.

---

## 📋 Sumário
1. [Visão Geral](#-visão-geral)
2. [Solução para o Erro NO_CLUSTER da Discloud](#-solução-para-o-erro-no_cluster-da-discloud)
3. [Instalação e Execução Local](#-instalação-e-execução-local)
4. [Deploy na Discloud](#-deploy-na-discloud)
5. [Deploy Econômico na Railway](#-deploy-econômico-na-railway)
6. [Alternativas Gratuitas sem Fila](#-alternativas-gratuitas-sem-fila)
7. [Comandos no Telegram](#-comandos-no-telegram)
8. [Licença](#-licença)

---

## 🌟 Visão Geral

* **100% Headless**: Roda no terminal sem frontend e usa apenas a biblioteca padrão do Python.
* **Gemini API**: Respostas inteligentes via modelo `gemini-3.8-flash`.
* **Baixo consumo**: Chama a API REST do Gemini diretamente, sem carregar um SDK pesado.
* **Webhook na Railway**: Usa HTTPS e valida o segredo do Telegram para evitar long polling ocioso.
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
# 1. Configurar variáveis no .env
cp .env.example .env

# 2. Executar o bot (não há dependências externas)
python3 bot.py
```

Sem `APP_URL` ou `RAILWAY_PUBLIC_DOMAIN`, o bot usa long polling localmente.

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

## 🚂 Deploy Econômico na Railway

O repositório inclui um `Dockerfile` Python mínimo para evitar instalar o antigo stack Node/React. Na Railway, crie **um único serviço** a partir do repositório, habilite um domínio público HTTPS e configure:

| Variável | Valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token criado no `@BotFather` |
| `GEMINI_API_KEY` | Chave do Google AI Studio |
| `GEMINI_MODEL` | Opcional; `gemini-3.8-flash` por padrão |
| `TELEGRAM_WEBHOOK_SECRET` | Opcional; use um segredo estável ou deixe vazio para gerar um |

A Railway fornece `PORT` e `RAILWAY_PUBLIC_DOMAIN`. O domínio público configura o webhook automaticamente. Use `APP_URL` somente se o domínio HTTPS for personalizado. O endpoint `/health` serve para diagnóstico.

Para minimizar o custo:

* Mantenha **uma réplica**, sem volume persistente e sem serviços de banco de dados.
* O modo webhook substitui o polling contínuo; o processo ainda permanece ativo, então o consumo de memória é cobrado mesmo quando não há mensagens.
* O plano Free informa US$ 1/mês em créditos de uso ([preços atuais](https://railway.com/pricing)). A cobrança depende do consumo por segundo de CPU e memória, além do tráfego; esse crédito não garante que o serviço ficará sem custo adicional. Confira o uso e configure alertas/limites no painel antes de deixá-lo ativo.
* O histórico das conversas fica apenas na memória e é perdido quando o serviço reinicia. Não adicione volume se essa persistência não for necessária.

Como referência, o processo local sem dependências extras usou cerca de 22 MiB de RSS; ao valor publicado de US$ 10/GiB-mês, isso equivale a aproximadamente US$ 0,22/mês de memória se o uso na Railway for semelhante. É apenas uma estimativa: não inclui CPU/tráfego e o consumo real deve ser confirmado no painel. Webhook reduz o trabalho ocioso de CPU, mas não elimina a cobrança de memória do processo sempre ativo.

---

## 🌐 Alternativas Gratuitas sem Limitação de Cluster

Se a Discloud estiver permanentemente lotada no plano gratuito, você pode hospedar este bot gratuitamente em:

1. **[Render.com](https://render.com/)**:
   - Crie um *Background Worker* ou *Web Service* gratuito.
   - Conecte o repositório Git.
   - Start Command: `python3 bot.py`.
   - Sem filas nem erro `NO_CLUSTER`.

2. **[Koyeb.com](https://www.koyeb.com/)**:
   - Oferece instâncias gratuitas *Eco* com deploy direto via GitHub ou Dockerfile.

3. **[Railway.app](https://railway.app/)** ou **VPS Gratuita**:
   - Consulte a seção de deploy Railway para habilitar o webhook e reduzir o uso ocioso.

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
