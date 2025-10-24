# 🚀 Guia de Deploy - Bot WhatsApp JK

## 📋 Checklist Pré-Deploy

Antes de fazer o deploy, certifique-se de que:

- [ ] Você tem as URLs do SheetDB configuradas (ou sabe que vai funcionar sem)
- [ ] Você tem uma conta no GitHub
- [ ] Você tem uma conta no Render.com (plano gratuito funciona)
- [ ] O bot está funcionando localmente no Replit

---

## 🔧 Passo 1: Configurar SheetDB (Opcional mas Recomendado)

### 1.1 Criar Planilhas no Google Sheets

Crie 3 planilhas separadas com os seguintes nomes e colunas:

**Planilha 1: Encomendas**
| usuario | descricao | dataHora | status |
|---------|-----------|----------|--------|
| | | | |

**Planilha 2: Histórico**
| usuario | descricao | dataRegistro | dataRetirada | status |
|---------|-----------|--------------|--------------|--------|
| | | | | |

**Planilha 3: Logs**
| usuario | mensagem | dataHora |
|---------|----------|----------|
| | | |

### 1.2 Conectar ao SheetDB

1. Acesse [https://sheetdb.io](https://sheetdb.io)
2. Crie uma conta gratuita
3. Para cada planilha:
   - Clique em "Create" → "From Google Sheets"
   - Compartilhe a planilha com o email fornecido pelo SheetDB
   - Copie a URL da API gerada (ex: `https://sheetdb.io/api/v1/abc123xyz`)

### 1.3 Salvar URLs

Guarde as 3 URLs:
```
SHEETDB_ENCOMENDAS=https://sheetdb.io/api/v1/SEU_ID_1
SHEETDB_HISTORICO=https://sheetdb.io/api/v1/SEU_ID_2
SHEETDB_LOG=https://sheetdb.io/api/v1/SEU_ID_3
```

---

## 📂 Passo 2: Subir para o GitHub

### 2.1 Criar Repositório

1. Acesse [https://github.com](https://github.com)
2. Clique em "New repository"
3. Nome: `bot-whatsapp-jk` (ou o que preferir)
4. Deixe como **Private** (recomendado por segurança)
5. **NÃO** adicione README, .gitignore ou licença (já temos)
6. Clique em "Create repository"

### 2.2 Fazer Push do Código

No terminal do Replit, execute:

```bash
# Inicializa repositório Git
git init

# Adiciona todos os arquivos (exceto os do .gitignore)
git add .

# Faz o primeiro commit
git commit -m "Initial commit: Bot WhatsApp JK completo"

# Define a branch principal
git branch -M main

# Adiciona o repositório remoto (substitua pela sua URL)
git remote add origin https://github.com/SEU-USUARIO/bot-whatsapp-jk.git

# Envia o código para o GitHub
git push -u origin main
```

**Importante**: Quando solicitado, use seu **Personal Access Token** do GitHub (não sua senha).

Para criar um token:
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token (classic)
3. Marque: `repo` (Full control of private repositories)
4. Copie o token e use como senha

---

## 🌐 Passo 3: Deploy no Render

### 3.1 Criar Web Service

1. Acesse [https://render.com](https://render.com)
2. Faça login ou crie uma conta gratuita
3. No Dashboard, clique em **"New +"** → **"Web Service"**
4. Conecte sua conta do GitHub (se ainda não conectou)
5. Selecione o repositório `bot-whatsapp-jk`
6. Clique em **"Connect"**

### 3.2 Configurar o Service

Preencha os campos:

| Campo | Valor |
|-------|-------|
| **Name** | `bot-whatsapp-jk` (ou outro nome único) |
| **Region** | Oregon (US West) ou mais próximo |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

### 3.3 Configurar Variáveis de Ambiente

Role até **"Environment Variables"** e adicione:

```
SHEETDB_ENCOMENDAS = https://sheetdb.io/api/v1/SEU_ID_1
SHEETDB_HISTORICO = https://sheetdb.io/api/v1/SEU_ID_2
SHEETDB_LOG = https://sheetdb.io/api/v1/SEU_ID_3
```

**Nota**: Se não tiver SheetDB, pule esta etapa. O bot funcionará sem persistência.

### 3.4 Selecionar Plano

- Escolha **"Free"** (0 USD/mês)
- O plano gratuito tem 750 horas/mês (suficiente para rodar 24/7)

### 3.5 Deploy

1. Clique em **"Create Web Service"**
2. Aguarde 3-5 minutos enquanto o Render:
   - Clona seu repositório
   - Instala as dependências
   - Inicia o bot

---

## 📱 Passo 4: Conectar WhatsApp

### 4.1 Acessar QR Code

1. Após o deploy terminar, você verá a URL do seu serviço
2. Será algo como: `https://bot-whatsapp-jk.onrender.com`
3. Acesse: `https://seu-bot.onrender.com/qr`

### 4.2 Escanear QR Code

1. Abra o **WhatsApp** no seu celular
2. Toque nos **3 pontinhos** (⋮) → **Aparelhos conectados**
3. Toque em **"Conectar um aparelho"**
4. Escaneie o **QR Code** da página
5. Aguarde a mensagem: **"✅ Bot conectado ao WhatsApp!"**

---

## 👥 Passo 5: Adicionar aos Grupos

### 5.1 Adicionar o Bot

1. Adicione o número do WhatsApp conectado aos grupos desejados
2. O bot detecta automaticamente grupos com:
   - **"lavanderia"** no nome → Grupo de Lavanderia
   - **"jk"** ou **"encomenda"** no nome → Grupo de Encomendas

### 5.2 Testar

Digite em qualquer grupo:
```
menu
```

O bot deve responder com o menu de opções!

---

## 🔍 Passo 6: Monitoramento

### 6.1 Logs do Render

Para ver os logs do bot:
1. No Dashboard do Render
2. Clique no seu serviço
3. Vá em **"Logs"** (no menu lateral)
4. Você verá mensagens como:
   ```
   ✅ Bot conectado ao WhatsApp!
   🧺 [LAVANDERIA] Mensagem de @5511999999999
   ```

### 6.2 Status do Bot

Acesse `https://seu-bot.onrender.com/` para ver:
- 🟢 Status: Bot rodando
- Link para QR Code

---

## ⚙️ Configurações Avançadas

### Atualizar o Bot

Quando fizer alterações no código:

```bash
git add .
git commit -m "Descrição das mudanças"
git push
```

O Render fará **deploy automático** das mudanças!

### Manter Bot Sempre Ativo

O bot já possui **keep-alive automático** que:
- Faz ping a cada 5 minutos
- Evita que o Render desligue por inatividade

### Backup da Sessão

**Importante**: A pasta `auth/` contém sua sessão do WhatsApp.
- No Render, ela é recriada a cada deploy
- Você precisará escanear o QR Code novamente após cada deploy
- Para evitar isso, considere usar persistent disk (plano pago)

---

## 🐛 Solução de Problemas

### Bot desconecta frequentemente

- Verifique os logs do Render
- O WhatsApp pode desconectar se detectar atividade suspeita
- Tente reduzir a frequência de mensagens

### QR Code não aparece

- Aguarde 30-60 segundos após o deploy
- Recarregue a página `/qr`
- Verifique os logs para erros

### Mensagens não são respondidas

- Confirme que o grupo está em `grupos.json` (veja logs)
- Digite `menu` para testar
- Verifique se o bot não foi removido/bloqueado

### SheetDB não funciona

- Verifique se as URLs estão corretas
- Confirme que as planilhas estão compartilhadas
- Teste as URLs no navegador (deve retornar JSON)

---

## 📊 Limites do Plano Gratuito

**Render Free:**
- 750 horas/mês (suficiente para 24/7)
- 512 MB RAM
- Desliga após 15 minutos de inatividade (keep-alive evita isso)
- Web service fica lento nos primeiros segundos após inatividade

**SheetDB Free:**
- 1.000 requests/mês
- Se ultrapassar, considere cache local ou plano pago

---

## ✅ Checklist Pós-Deploy

Após o deploy, verifique:

- [ ] Bot conectado ao WhatsApp (✅ nos logs)
- [ ] QR Code acessível em `/qr`
- [ ] Bot adicionado aos grupos
- [ ] Comando `menu` funciona
- [ ] SheetDB registrando encomendas (se configurado)
- [ ] Boas-vindas funcionando quando alguém entra
- [ ] Keep-alive ativo (ping a cada 5min nos logs)

---

## 🎉 Pronto!

Seu bot está no ar! 🚀

Para suporte ou dúvidas, consulte:
- **README.md** - Documentação completa
- **Logs do Render** - Debug e monitoramento
- **Código fonte** - index.js, lavanderia.js, encomendas.js

**Divirta-se com seu bot!** 🤖
