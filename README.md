# 🤖 Bot WhatsApp JK - Lavanderia e Encomendas

Bot automatizado para WhatsApp desenvolvido com Node.js e Baileys, totalmente em português, para gerenciar grupos de Lavanderia Universitária e Encomendas.

## 📋 Funcionalidades

### 🧺 Módulo Lavanderia
- ✅ Mensagens de boas-vindas automáticas com menção de usuário
- ✅ Menu interativo com 10 opções
- ✅ Sistema de fila de espera para máquinas
- ✅ Controle de lavagem ativa
- ✅ Dicas de uso e informações
- ✅ Previsão do tempo
- ✅ Horários de funcionamento
- ✅ Coleta de lixo
- ✅ Sorteio de roupas (diversão!)

### 📦 Módulo Encomendas
- ✅ Registro de encomendas via SheetDB
- ✅ Visualização de encomendas pendentes
- ✅ Confirmação de retirada
- ✅ Histórico completo
- ✅ Logs automáticos de atividades

### 🎯 Funcionalidades Gerais
- ✅ Conexão via Baileys (WhatsApp Web)
- ✅ QR Code acessível via navegador
- ✅ Reconexão automática
- ✅ Detecção automática de grupos
- ✅ Servidor Express para manter ativo
- ✅ Keep-alive para Render
- ✅ Código totalmente comentado em português

## 🚀 Instalação e Uso

### 1. Clone o repositório
```bash
git clone <seu-repositorio>
cd bot-whatsapp-jk
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Configure as URLs do SheetDB (opcional)
Edite o arquivo `encomendas.js` e substitua as URLs do SheetDB pelas suas:
```javascript
const URL_SHEETDB_ENCOMENDAS = "https://sheetdb.io/api/v1/SEU_ID";
const URL_SHEETDB_HISTORICO = "https://sheetdb.io/api/v1/SEU_ID";
const URL_SHEETDB_LOG = "https://sheetdb.io/api/v1/SEU_ID";
```

Ou defina como variáveis de ambiente:
```bash
export SHEETDB_ENCOMENDAS="https://sheetdb.io/api/v1/SEU_ID"
export SHEETDB_HISTORICO="https://sheetdb.io/api/v1/SEU_ID"
export SHEETDB_LOG="https://sheetdb.io/api/v1/SEU_ID"
```

### 4. Inicie o bot
```bash
npm start
```

### 5. Escaneie o QR Code
Acesse http://localhost:5000/qr no seu navegador e escaneie o QR Code com seu WhatsApp.

## 📱 Comandos Disponíveis

### Comandos Gerais (todos os grupos)
- `!ping` - Verifica se o bot está online
- `!ajuda` ou `menu` - Mostra o menu de opções
- `!info` - Exibe informações do grupo
- `!todos` - Menciona todos os membros do grupo

### Lavanderia (opções do menu)
1. Dicas de uso 🧼
2. Info Lavadora ⚙️
3. Iniciar Lavagem 🚿
4. Finalizar Lavagem ✅
5. Entrar na Fila ⏳
6. Sair da Fila 🚶‍♂️
7. Sortear Roupas 🎲
8. Horário de Funcionamento ⏰
9. Previsão do Tempo 🌦️
10. Coleta de Lixo 🗑️

### Encomendas (opções do menu)
1. Registrar Encomenda 📦
2. Ver Encomendas 📋
3. Confirmar Retirada ✅
4. Ver Histórico 🕓

## 🌐 Deploy no Render

### Passo 1: Prepare o repositório
```bash
git init
git add .
git commit -m "Initial commit: Bot WhatsApp JK"
git branch -M main
git remote add origin <seu-repositorio-github>
git push -u origin main
```

### Passo 2: Configure o Render
1. Acesse [https://render.com](https://render.com)
2. Clique em "New +" → "Web Service"
3. Conecte seu repositório GitHub
4. Configure:
   - **Name**: bot-whatsapp-jk
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### Passo 3: Variáveis de Ambiente (opcional)
Adicione no Render:
- `SHEETDB_ENCOMENDAS`: URL da API SheetDB para encomendas
- `SHEETDB_HISTORICO`: URL da API SheetDB para histórico
- `SHEETDB_LOG`: URL da API SheetDB para logs

### Passo 4: Deploy
1. Clique em "Create Web Service"
2. Aguarde o deploy (3-5 minutos)
3. Acesse `https://seu-bot.onrender.com/qr`
4. Escaneie o QR Code

## 📁 Estrutura do Projeto

```
bot-whatsapp-jk/
├── index.js           # Arquivo principal com conexão Baileys
├── lavanderia.js      # Módulo de gerenciamento de lavanderia
├── encomendas.js      # Módulo de gerenciamento de encomendas
├── grupos.json        # IDs dos grupos (gerado automaticamente)
├── package.json       # Dependências e scripts
├── README.md          # Este arquivo
├── .gitignore         # Arquivos ignorados pelo Git
└── auth/              # Pasta de autenticação (criada automaticamente)
```

## 🔧 Configuração de Grupos

O arquivo `grupos.json` contém os IDs dos grupos. Você pode editá-lo manualmente ou deixar o bot detectar automaticamente grupos que contenham as palavras-chave:
- **Lavanderia**: grupos com "lavanderia" no nome
- **Encomendas**: grupos com "jk" ou "encomenda" no nome

Exemplo de `grupos.json`:
```json
{
  "lavanderia": [
    "120363416759586760@g.us"
  ],
  "encomendas": [
    "555193987654321-1682345678@g.us"
  ]
}
```

## 🛠️ Tecnologias Utilizadas

- **Node.js** - Plataforma JavaScript
- **@whiskeysockets/baileys** - Biblioteca para WhatsApp Web
- **Express** - Servidor HTTP
- **QRCode** - Geração de QR Codes
- **Axios** - Requisições HTTP
- **Moment-timezone** - Manipulação de datas e horários
- **Pino** - Sistema de logs

## 📝 Integração com SheetDB

O bot integra com SheetDB para armazenar dados de encomendas. Você precisa de **3 planilhas**:

### 1. Planilha de Encomendas (SHEETDB_ENCOMENDAS)
Colunas necessárias:
- `usuario` - Número do usuário (@5511999999999)
- `descricao` - Descrição da encomenda
- `dataHora` - Data e hora de registro
- `status` - Status da encomenda ("Aguardando retirada")

**Importante**: Quando o usuário confirma retirada (opção 3), o registro é **deletado** desta planilha.

### 2. Planilha de Histórico (SHEETDB_HISTORICO)
Colunas necessárias:
- `usuario` - Número do usuário
- `descricao` - Descrição da encomenda
- `dataRegistro` - Data de registro original
- `dataRetirada` - Data de retirada
- `status` - "Retirada concluída"

### 3. Planilha de Logs (SHEETDB_LOG)
Colunas necessárias:
- `usuario` - Número do usuário
- `mensagem` - Descrição da ação
- `dataHora` - Data e hora

### Como Configurar:

1. Crie 3 planilhas no Google Sheets com as colunas acima
2. Conecte cada planilha ao [SheetDB.io](https://sheetdb.io)
3. Copie as URLs das APIs geradas
4. Configure as variáveis de ambiente:
   ```bash
   SHEETDB_ENCOMENDAS=https://sheetdb.io/api/v1/SEU_ID_1
   SHEETDB_HISTORICO=https://sheetdb.io/api/v1/SEU_ID_2
   SHEETDB_LOG=https://sheetdb.io/api/v1/SEU_ID_3
   ```

**Nota**: O bot funciona sem SheetDB (apenas com logs locais), mas não terá persistência de dados.

## ⚠️ Importante

- **Autenticação**: A pasta `auth/` contém suas credenciais do WhatsApp. Nunca compartilhe ou faça commit dela!
- **Grupos**: Adicione o bot aos grupos desejados após escanear o QR Code
- **Keep-alive**: O Render desliga serviços gratuitos após inatividade. O bot possui keep-alive automático.
- **Limitações**: A conta do WhatsApp pode ser banida se houver uso abusivo ou spam. Use com moderação!

## 🐛 Solução de Problemas

### Bot não conecta
- Verifique se escaneou o QR Code corretamente
- Delete a pasta `auth/` e tente novamente

### Mensagens não são respondidas
- Verifique se o grupo está cadastrado em `grupos.json`
- Confira os logs no console

### Erro ao salvar encomendas
- Verifique se as URLs do SheetDB estão corretas
- Confirme se tem acesso à internet

## 📄 Licença

Este projeto é de código aberto para fins educacionais.

## 👨‍💻 Autor

Desenvolvido com ❤️ para a comunidade universitária JK

---

**Dúvidas?** Digite `menu` em qualquer grupo para ver as opções! 🚀
