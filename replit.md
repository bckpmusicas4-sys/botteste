# Bot WhatsApp JK - Informações do Projeto

## 📋 Visão Geral
Bot automatizado para WhatsApp desenvolvido com Node.js e Baileys para gerenciar dois grupos:
- 🧺 **Lavanderia Universitária**: Sistema de controle de máquinas de lavar com fila de espera
- 📦 **Encomendas JK**: Gerenciamento de encomendas com integração SheetDB

## 🏗️ Arquitetura do Projeto

### Arquivos Principais
- **index.js**: Conexão principal com WhatsApp via Baileys, roteamento de mensagens, servidor Express
- **lavanderia.js**: Módulo com 10 funcionalidades para grupo de lavanderia
- **encomendas.js**: Módulo com integração SheetDB para gerenciar encomendas
- **grupos.json**: Configuração de IDs dos grupos (auto-detectados ou manuais)

### Tecnologias
- Node.js 20
- @whiskeysockets/baileys (WhatsApp Web)
- Express (servidor HTTP)
- Axios (requisições HTTP)
- QRCode (geração de QR)
- Moment-timezone (datas em America/Sao_Paulo)
- Pino (logging)

## 🚀 Status Atual
✅ **Implementação completa**
- Todos os módulos funcionando
- Sistema de reconexão automática
- QR Code acessível em /qr
- Keep-alive para Render
- Código totalmente em português com comentários

## 📱 Como Usar no Replit

1. **Escanear QR Code**: Acesse o webview e clique em "Ver QR Code" ou vá para /qr
2. **Adicionar aos Grupos**: Após conectar, adicione o número do bot aos grupos desejados
3. **Testar Comandos**: Digite `menu` em qualquer grupo para ver opções

## 🌐 Deploy no Render

### Passos para Deploy
1. Criar repositório no GitHub
2. Fazer push do código
3. Conectar no Render (render.com)
4. Configurar Build Command: `npm install`
5. Configurar Start Command: `npm start`
6. Adicionar variáveis de ambiente do SheetDB (opcional)
7. Deploy!
8. Acessar /qr para conectar WhatsApp

### Variáveis de Ambiente no Render
```
SHEETDB_ENCOMENDAS=<sua-url>
SHEETDB_HISTORICO=<sua-url>
SHEETDB_LOG=<sua-url>
```

## 🔧 Alterações Recentes
- 2025-10-17: Projeto criado com estrutura completa
- Implementados módulos de lavanderia e encomendas
- Configurado servidor Express com rotas /qr
- Sistema de boas-vindas com menção de usuários
- Integração com SheetDB para logs e encomendas

## 📝 Notas Importantes

### Autenticação
- A pasta `auth/` é criada automaticamente e contém credenciais do WhatsApp
- **Nunca** fazer commit da pasta auth/ no GitHub
- Já está no .gitignore

### Grupos
- O bot detecta automaticamente grupos com "lavanderia" ou "jk" no nome
- Você pode editar manualmente o arquivo grupos.json se necessário

### SheetDB
- URLs de exemplo estão no código
- Substitua pelas suas URLs reais ou use variáveis de ambiente
- Funciona sem SheetDB (apenas logs locais)

### Limitações do WhatsApp
- Evite spam ou uso abusivo
- Não envie mensagens em massa
- Respeite limites da API do WhatsApp
- Conta pode ser banida se violar termos de uso

## 🐛 Troubleshooting

### Bot não conecta
- Verifique logs do workflow
- Delete pasta `auth/` e escaneie QR novamente
- Verifique conexão com internet

### Mensagens não respondem
- Confirme que grupo está em grupos.json
- Verifique logs para erros
- Teste comando `!ping`

### QR Code não aparece
- Acesse diretamente /qr no navegador
- Aguarde alguns segundos para geração
- Recarregue a página

## 📚 Documentação Adicional
Ver README.md para instruções completas de instalação e uso.
