# 🚀 Headless Telegram App Launcher + Gemini Bot

> Backend puro em Python, executado no terminal. O launcher, busca, idiomas e configurações aparecem como botões dentro do Telegram; não há frontend web.

---

## 📋 Sumário
1. [Visão Geral](#-visão-geral)
2. [Solução para o Erro NO_CLUSTER da Discloud](#-solução-para-o-erro-no_cluster-da-discloud)
3. [Instalação e Execução Local](#-instalação-e-execução-local)
4. [Deploy na Discloud](#-deploy-na-discloud)
5. [Deploy Econômico na Railway](#-deploy-econômico-na-railway)
6. [Alternativas Gratuitas sem Fila](#-alternativas-gratuitas-sem-fila)
7. [Launcher e Gemini](#-launcher-e-gemini)
8. [Comandos no Telegram](#-comandos-no-telegram)
9. [Licença](#-licença)

---

## 🌟 Visão Geral

* **100% Headless**: Roda no terminal sem frontend e usa apenas a biblioteca padrão do Python.
* **Launcher no Telegram**: Categorias, links de apps, busca, inclusão/remoção de apps, ajuda e escolha de idioma.
* **Chave Gemini por usuário**: Cada pessoa pode configurar sua própria chave no chat privado; as chaves ficam apenas na memória e não são gravadas em disco.
* **Gemini API**: Respostas via modelo `gemini-3.8-flash`, com limite de saída para reduzir consumo.
* **Baixo consumo**: Chama a API REST do Gemini diretamente, sem carregar um SDK pesado.
* **Webhook na Railway**: Usa HTTPS e valida o segredo do Telegram para evitar long polling ocioso.
* **Sem chave compartilhada por padrão**: O servidor não usa a chave global para os usuários, a menos que `ALLOW_SHARED_GEMINI_KEY=true`.
* **Pacote de implantação enxuto**: O `discloud.zip` contém somente os arquivos necessários para o bot.

---

## ⚡ Solução para o Erro `NO_CLUSTER` da Discloud

### O que significa `NO_CLUSTER`?
```json
{"status":"error","message":"No momento, estamos lidando com uma alta demanda de Bots em nosso plano gratuito...","code":"NO_CLUSTER"}
```
Esse erro da Discloud ocorre **exclusivamente quando os nós (clusters) do plano gratuito estão temporariamente lotados** de bots de outros usuários. Não é um erro no seu código.

### Como Evitar e Superar o `NO_CLUSTER`:

1. **Upload Limpo via `discloud.zip`**:
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
python bot.py
```

No PowerShell, use `Copy-Item .env.example .env` no primeiro passo.
Sem `APP_URL` ou `RAILWAY_PUBLIC_DOMAIN`, o bot usa long polling localmente.
No Telegram, envie `/start`, escolha **🧠 Chave Gemini** e informe sua chave em uma conversa privada. Também é possível usar `/setkey`. Ela é removida da mensagem do Telegram quando permitido e mantida somente na memória; após reiniciar o bot, será necessário configurá-la novamente. Não envie chaves em grupos.

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
| `GEMINI_API_KEY` | Opcional; chave global do Google AI Studio |
| `ALLOW_SHARED_GEMINI_KEY` | `true` para permitir explicitamente o uso da chave global; padrão `false` |
| `GEMINI_MODEL` | Opcional; `gemini-3.8-flash` por padrão |
| `TELEGRAM_WEBHOOK_SECRET` | Opcional; use um segredo estável ou deixe vazio para gerar um |
| `DATA_FILE` | Opcional; arquivo JSON para preferências e apps personalizados, padrão `bot_data.json` |

A Railway fornece `PORT` e `RAILWAY_PUBLIC_DOMAIN`. O domínio público configura o webhook automaticamente. Use `APP_URL` somente se o domínio HTTPS for personalizado. O endpoint `/health` serve para diagnóstico.

Para minimizar o custo:

* Mantenha **uma réplica**, sem volume persistente e sem serviços de banco de dados.
* O modo webhook substitui o polling contínuo; o processo ainda permanece ativo, então o consumo de memória é cobrado mesmo quando não há mensagens.
* O plano Free informa US$ 1/mês em créditos de uso ([preços atuais](https://railway.com/pricing)). A cobrança depende do consumo por segundo de CPU e memória, além do tráfego; esse crédito não garante que o serviço ficará sem custo adicional. Confira o uso e configure alertas/limites no painel antes de deixá-lo ativo.
* O histórico das conversas fica apenas na memória e é perdido quando o serviço reinicia. Não adicione volume se essa persistência não for necessária.
* As chaves Gemini inseridas pelos usuários nunca são persistidas. Cada usuário precisa configurá-las novamente após uma reinicialização.
* Apps personalizados e idiomas ficam em `DATA_FILE`; sem volume persistente, esses dados podem desaparecer quando a Railway recriar o serviço.

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

## 🧩 Launcher e Gemini

O comando `/start` abre o launcher com filtros **Todos**, **Social**, **Ferramentas** e **Mídia**. Os botões de app abrem o endereço HTTPS diretamente. **Adicionar app** solicita `Nome | https://endereco.com | Social`, aceitando também `Tools` ou `Media`; apps personalizados podem ser buscados e removidos. Apps personalizados são separados por chat.

Cada usuário configura sua própria chave Gemini pelo botão **🧠 Chave Gemini** ou `/setkey`. As chamadas usam essa chave, que não é escrita em logs ou no arquivo de dados. O servidor só usa a chave global `GEMINI_API_KEY` se `ALLOW_SHARED_GEMINI_KEY=true` estiver definido conscientemente.

## 💬 Comandos no Telegram

* `/start` — Boas-vindas e introdução
* `/help` — Lista de comandos e ajuda
* `/search` — Buscar apps
* `/addapp` — Adicionar app personalizado
* `/removeapp` — Remover app personalizado
* `/language` — Alterar idioma
* `/setkey` — Configurar chave Gemini deste chat privado
* `/forgetkey` — Remover chave Gemini deste processo
* `/clear` — Limpar o histórico da conversa
* `/status` — Status do servidor e configuração
* `/ping` — Testar resposta rápida

---

## 📄 Licença

Distribuído sob a licença **MIT** em nome de **Eduardo Souza Rodrigues**. Consulte o arquivo `LICENSE` para detalhes.
