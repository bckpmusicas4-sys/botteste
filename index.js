// ========================= IMPORTS E DEPENDÊNCIAS =========================
// Baileys (cliente WhatsApp), logger, fs, express, axios, qrcode e módulos locais
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const fs = require("fs");
const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");
const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

// ========================= VARIÁVEIS GLOBAIS =========================
// sock: conexão do baileys
let sock;

// Estrutura de grupos salva em arquivo (duas categorias)
let grupos = { lavanderia: [], encomendas: [] };

// Caminho do arquivo JSON onde os grupos são persistidos
const caminhoGrupos = "grupos.json";

// Flags de controle de conexão / QR
let reconectando = false;
let qrCodeAtual = null;

// ========================= CARREGA GRUPOS SALVOS =========================
// Se o arquivo existir, carrega as listas; caso contrário, será criado ao salvar
if (fs.existsSync(caminhoGrupos)) {
  grupos = JSON.parse(fs.readFileSync(caminhoGrupos, "utf-8"));
  console.log("✅ Grupos carregados do arquivo:");
  console.log("🧺 Lavanderia:", grupos.lavanderia);
  console.log("📦 Encomendas:", grupos.encomendas);
} else {
  console.log("⚠️ Arquivo grupos.json não encontrado. Será criado automaticamente.");
}

// ========================= FUNÇÃO PRINCIPAL: INICIAR BOT =========================
/**
 * Função iniciar()
 * - Cria/renova a conexão Baileys
 * - Configura eventos (mensagens, participantes, conexão)
 * - Mantém o comportamento original do seu código
 */
async function iniciar() {
  console.log("🔄 Iniciando conexão com WhatsApp...");

  // ========================= REMOÇÃO DE LISTENERS ANTIGOS =========================
  // Evita duplicação de handlers caso iniciar() seja chamado novamente
  if (sock?.ev) {
    try {
      sock.ev.removeAllListeners();
      console.log("♻️ Eventos antigos removidos.");
    } catch (e) {
      console.warn("⚠️ Falha ao remover eventos:", e.message);
    }
  }

  // ========================= AUTENTICAÇÃO E VERSÃO DO BAILEYS =========================
  // useMultiFileAuthState cria/usa a pasta 'auth' para persistir credenciais
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  // ========================= CRIA SOCKET (CONEXÃO) =========================
  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true, // mostra QR no terminal
    logger: P({ level: "silent" }), // logger silencioso
    browser: ["BotJK", "Chrome", "120.0.0.0"], // identificação do "navegador"
  });

  // Salva credenciais quando atualizadas (persistência)
  sock.ev.on("creds.update", saveCreds);
// ========================= EVENTO: MENSAGENS RECEBIDAS =========================
/**
 * messages.upsert
 * - Recebe mensagens novas (grupos e privados)
 * - Filtra apenas mensagens de grupos (sufixo @g.us)
 * - Roteia mensagens para módulos ou lida com comandos administrativos
 */
sock.ev.on("messages.upsert", async ({ messages }) => {
  const msg = messages[0];
  const remetente = msg.key.remoteJid;

  // Filtragem inicial: ignora mensagens inválidas, reações, protocol messages, mensagens próprias
  if (
    !msg.message ||
    msg.key.fromMe ||
    msg.message.protocolMessage ||
    msg.message.reactionMessage ||
    !remetente.endsWith("@g.us") // processar apenas grupos
  )
    return;

  // Captura texto da mensagem (cobre conversation e extendedTextMessage)
  const texto =
    (msg.message.conversation && msg.message.conversation.trim()) ||
    (msg.message.extendedTextMessage &&
      msg.message.extendedTextMessage.text &&
      msg.message.extendedTextMessage.text.trim()) ||
    "";

  // 🆔 Comando para mostrar o ID do grupo
  if (texto.toLowerCase() === "!idgrupo") {
    try {
      const metadata = await sock.groupMetadata(remetente);
      const nomeGrupo = metadata.subject;
      await sock.sendMessage(remetente, {
        text: `🆔 ID do grupo *${nomeGrupo}*:\n\n\`${remetente}\``
      });
      console.log(`📡 ID solicitado no grupo: ${nomeGrupo} → ${remetente}`);
    } catch (e) {
      console.error("❌ Erro ao obter ID do grupo:", e.message);
    }
    return; // impede que o restante do código processe essa mensagem
  }

  // (segue o restante do código normalmente)

    // ------------------------- DETECÇÃO AUTOMÁTICA DE GRUPOS -------------------------
    // Tenta detectar automaticamente se o grupo pertence a 'lavanderia' ou 'encomendas'
    // Observação: esta detecção é baseada no nome do grupo (metadata.subject)
    try {
      const metadata = await sock.groupMetadata(remetente);
      const nomeGrupo = (metadata.subject || "").toLowerCase();

      // Palavras-chave para adicionar automaticamente:
      // - lavanderia
      // - jk
      // - jk universitário (expressão)
      // - encomenda (para lista de encomendas)
      // Se encontrar a palavra e o ID ainda não estiver registrado, adiciona e salva.
      if (nomeGrupo.includes("lavanderia") && !grupos.lavanderia.includes(remetente)) {
        grupos.lavanderia.push(remetente);
        console.log(`✅ Grupo de lavanderia detectado automaticamente: ${metadata.subject}`);
      } else if (
        // Para encomendas aceitamos "jk" (quando for um grupo de encomendas com jk no nome),
        // "jk universitário" (frase completa) ou "encomenda"
        (nomeGrupo.includes("jk") || nomeGrupo.includes("jk universitário") || nomeGrupo.includes("encomenda")) &&
        !grupos.encomendas.includes(remetente)
      ) {
        grupos.encomendas.push(remetente);
        console.log(`✅ Grupo de encomendas detectado automaticamente: ${metadata.subject}`);
      }

      // Salva qualquer alteração feita pelas detecções automáticas
      fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
    } catch (e) {
      // Em caso de falha ao buscar metadados do grupo, apenas logamos o erro
      console.warn("❌ Erro ao obter metadados do grupo (detecção automática):", e.message);
    }

    // Log básico de recebimento
    console.log("🔔 Nova mensagem recebida de:", remetente, "| texto:", texto);

    // ------------------------- TRATAMENTO DE COMANDOS (APENAS ADM) -------------------------
    // Comandos requeridos:
    // - !addgrupo <lavanderia|encomendas>  -> adiciona o grupo atual à categoria
    // - !removegrupo <lavanderia|encomendas> -> remove o grupo atual da categoria
    // - !listagrupo -> lista todos os grupos registrados (nomes quando acessíveis)
    //
    // Regras:
    // - Apenas administradores do grupo podem executar os comandos
    // - Comando deve ser digitado no próprio grupo (remetente é o ID do grupo)
    try {
      // Normalize o texto para análise de comandos (minúsculas)
      const textoLower = texto.toLowerCase();

      // Se for comando !addgrupo
      if (textoLower.startsWith("!addgrupo")) {
        // Pega argumento (tipo)
        const parts = textoLower.split(/\s+/); // split por espaço(s)
        const tipo = parts[1]; // ex: 'lavanderia' ou 'encomendas'

        // Validação básica do argumento
        if (!tipo || !["lavanderia", "encomendas"].includes(tipo)) {
          await sock.sendMessage(remetente, {
            text: "⚠️ Uso: !addgrupo lavanderia  OU  !addgrupo encomendas",
          });
          return;
        }

        // Verifica se quem enviou é admin (apenas admins podem executar)
        // Para saber se o remetente (o grupo) tem admin? Precisamos saber quem enviou a mensagem:
        // msg.key.participant contém o ID do usuário que enviou a mensagem (ex: '5511999999999@s.whatsapp.net')
        const quemEnviou = msg.key.participant; // usuário que digitou o comando
        let isAdmin = false;

        try {
          const meta = await sock.groupMetadata(remetente);
          // metadata.participants é um array com objetos contendo 'id' e flags de admin
          // Em alguns formatos a propriedade pode ser 'admin' com valor 'admin' ou 'superadmin'
          // Então buscamos o participante e checamos essas propriedades
          const participante = meta.participants.find(p => p.id === quemEnviou);
          if (participante) {
            // Em diferentes versões da lib, a flag pode ser 'admin' ou 'isAdmin' ou 'isSuperAdmin'.
            // Vamos checar as opções mais comuns.
            if (
              participante.admin === "admin" ||
              participante.admin === "superadmin" ||
              participante.isAdmin === true ||
              participante.isSuperAdmin === true
            ) {
              isAdmin = true;
            }
          }
        } catch (err) {
          console.warn("⚠️ Não foi possível verificar administradores do grupo:", err.message);
          // Em caso de erro ao buscar metadata, negar a execução do comando por segurança
          await sock.sendMessage(remetente, {
            text: "❌ Não foi possível verificar permissões do grupo. Tente novamente mais tarde.",
          });
          return;
        }

        // Se não for admin, responde e retorna
        if (!isAdmin) {
          await sock.sendMessage(remetente, {
            text: "❌ Apenas administradores do grupo podem usar este comando.",
          });
          return;
        }

        // Se já estiver cadastrado, informa
        if (grupos[tipo].includes(remetente)) {
          await sock.sendMessage(remetente, {
            text: `⚠️ Este grupo já está cadastrado como *${tipo}*.`,
          });
          return;
        }

        // Adiciona o grupo à lista correta e salva em disco
        grupos[tipo].push(remetente);
        fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));

        // Envia confirmação com o nome do grupo (tenta pegar metadata)
        try {
          const meta = await sock.groupMetadata(remetente);
          await sock.sendMessage(remetente, {
            text: `✅ Grupo *${meta.subject}* adicionado com sucesso como *${tipo}*!`,
          });
        } catch {
          // Se não conseguir pegar o nome, envia resposta genérica
          await sock.sendMessage(remetente, {
            text: `✅ Grupo adicionado com sucesso como *${tipo}*!`,
          });
        }

        console.log(`✅ Grupo manualmente adicionado: ${remetente} como ${tipo}`);
        return; // comando tratado
      }

      // Se for comando !removegrupo
      if (textoLower.startsWith("!removegrupo")) {
        const parts = textoLower.split(/\s+/);
        const tipo = parts[1];

        if (!tipo || !["lavanderia", "encomendas"].includes(tipo)) {
          await sock.sendMessage(remetente, {
            text: "⚠️ Uso: !removegrupo lavanderia  OU  !removegrupo encomendas",
          });
          return;
        }

        // Verifica permissões do usuário que enviou (apenas admin)
        const quemEnviou = msg.key.participant;
        let isAdmin = false;

        try {
          const meta = await sock.groupMetadata(remetente);
          const participante = meta.participants.find(p => p.id === quemEnviou);
          if (participante) {
            if (
              participante.admin === "admin" ||
              participante.admin === "superadmin" ||
              participante.isAdmin === true ||
              participante.isSuperAdmin === true
            ) {
              isAdmin = true;
            }
          }
        } catch (err) {
          console.warn("⚠️ Não foi possível verificar administradores do grupo:", err.message);
          await sock.sendMessage(remetente, {
            text: "❌ Não foi possível verificar permissões do grupo. Tente novamente mais tarde.",
          });
          return;
        }

        if (!isAdmin) {
          await sock.sendMessage(remetente, {
            text: "❌ Apenas administradores do grupo podem usar este comando.",
          });
          return;
        }

        // Se não estiver cadastrado, informa
        if (!grupos[tipo].includes(remetente)) {
          await sock.sendMessage(remetente, {
            text: `⚠️ Este grupo não está cadastrado em *${tipo}*.`,
          });
          return;
        }

        // Remove o ID do grupo da lista correspondente
        grupos[tipo] = grupos[tipo].filter((id) => id !== remetente);
        fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));

        // Confirma remoção com o nome quando possível
        try {
          const meta = await sock.groupMetadata(remetente);
          await sock.sendMessage(remetente, {
            text: `🗑️ Grupo *${meta.subject}* removido da categoria *${tipo}*.`,
          });
        } catch {
          await sock.sendMessage(remetente, {
            text: `🗑️ Grupo removido da categoria *${tipo}*.`,
          });
        }

        console.log(`🗑️ Grupo removido manualmente: ${remetente} de ${tipo}`);
        return; // comando tratado
      }

      // Se for comando !listagrupo
      if (textoLower.startsWith("!listagrupo")) {
        // Monta a resposta com as listas atuais
        let resposta = "📋 *Grupos registrados:*\n\n";

        // Função auxiliar para listar cada tipo
        const listar = async (tipo) => {
          if (!grupos[tipo] || grupos[tipo].length === 0) {
            resposta += `• Nenhum grupo registrado em *${tipo}*\n\n`;
            return;
          }

          resposta += `🧩 *${tipo.toUpperCase()}*\n`;
          for (const id of grupos[tipo]) {
            try {
              const meta = await sock.groupMetadata(id);
              resposta += ` - ${meta.subject}\n`;
            } catch {
              resposta += ` - ${id} (não acessível)\n`;
            }
          }
          resposta += "\n";
        };

        // Listar ambas categorias
        await listar("lavanderia");
        await listar("encomendas");

        // Envia a lista de grupos (texto simples)
        await sock.sendMessage(remetente, { text: resposta.trim() });
        return; // comando tratado
      }
    } catch (e) {
      // Erro no bloco de comandos: loga para debug, mas não quebra o fluxo
      console.error("❗ Erro ao processar comandos administrativos:", e.message);
    }

    // ------------------------- ROTEAMENTO PARA MÓDULOS EXISTENTES -------------------------
    // Se o grupo já estiver em uma das listas, encaminha a mensagem para o módulo apropriado
    try {
      if (grupos.lavanderia.includes(remetente)) {
        console.log("🧺 Direcionando para módulo Lavanderia");
        await tratarMensagemLavanderia(sock, msg);
      } else if (grupos.encomendas.includes(remetente)) {
        console.log("📦 Direcionando para módulo Encomendas");
        await tratarMensagemEncomendas(sock, msg);
      } else {
        console.log("🔍 Grupo não registrado:", remetente);
      }
    } catch (e) {
      console.error("❗ Erro ao processar mensagem:", e.message);
    }
  });

  // ========================= EVENTO: PARTICIPANTES (ADD/REMOVE) =========================
  /**
   * group-participants.update
   * - Monitora entradas e saídas do grupo
   * - Envia boas-vindas quando alguém entra
   * - Registra no SheetDB quando configurado
   */
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const metadata = await sock.groupMetadata(update.id);
      const grupoNome = metadata.subject;

      for (let participante of update.participants) {
        const numero = participante.split("@")[0];
        const dataHora = new Date().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        });

        // Quando entra (add)
        if (update.action === "add") {
          console.log(`📱 @${numero} entrou no grupo ${grupoNome}`);

          // Mensagem de boas-vindas com menção
          await sock.sendMessage(update.id, {
            text: `👋 Olá @${numero}!\n\nBem-vindo(a) ao grupo *${grupoNome}*! 🎉\n\nDigite *menu* para ver as opções disponíveis.`,
            mentions: [participante],
          });

          // Tenta logar no SheetDB (opcional)
          try {
            await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
              data: [
                {
                  usuario: `@${numero}`,
                  mensagem: `Entrou no grupo ${grupoNome}`,
                  dataHora,
                },
              ],
            });
          } catch (err) {
            console.warn("⚠️ Erro ao registrar entrada no SheetDB:", err.message);
          }
        }

        // Quando sai (remove)
        else if (update.action === "remove") {
          console.log(`👋 @${numero} saiu do grupo ${grupoNome}`);

          await sock.sendMessage(update.id, {
            text: `👋 @${numero} saiu do grupo *${grupoNome}*`,
            mentions: [participante],
          });

          // Tenta logar no SheetDB (opcional)
          try {
            await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
              data: [
                {
                  usuario: `@${numero}`,
                  mensagem: `Saiu do grupo ${grupoNome}`,
                  dataHora,
                },
              ],
            });
          } catch (err) {
            console.warn("⚠️ Erro ao registrar saída no SheetDB:", err.message);
          }
        }
      }
    } catch (err) {
      console.error("❌ Erro no evento de participante:", err.message);
    }
  });

  // ========================= EVENTO: ATUALIZAÇÃO DE CONEXÃO =========================
  /**
   * connection.update
   * - Lida com QR (gera dataURL para exibir na rota /qr)
   * - Detecta quando a conexão fecha e tenta reconectar (exceto logout)
   * - Mantém flags de reconexão e QR atual atualizados
   */
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Quando QR é enviado geramos um dataURL para exibir na rota /qr
    if (qr) {
      try {
        qrCodeAtual = await QRCode.toDataURL(qr);
        console.log("📱 QR Code gerado! Acesse http://localhost:5000/qr para escanear");
      } catch (err) {
        console.error("❌ Erro ao gerar QR Code:", err.message);
      }
    }

    // Quando a conexão fecha
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Conexão encerrada. Código: ${statusCode}`);

      // Reconecta automaticamente exceto quando foi logout (manter comportamento original)
      if (!reconectando && statusCode !== DisconnectReason.loggedOut) {
        reconectando = true;
        console.log("🔄 Reconectando em 15 segundos...");
        await new Promise((resolve) => setTimeout(resolve, 15000));
        await iniciar(); // reinicia a conexão
      } else {
        console.log("❌ Sessão encerrada. Escaneie o QR Code novamente em /qr");
        qrCodeAtual = null;
      }
    }

    // Quando a conexão abre com sucesso
    else if (connection === "open") {
      reconectando = false;
      qrCodeAtual = null;
      console.log("✅ Bot conectado ao WhatsApp com sucesso!");
      console.log("🤖 Bot JK está online e pronto para responder!");
    }
  });
} // fim da função iniciar()

// ========================= INICIALIZAÇÃO =========================
// Chama a função para iniciar a conexão e configurar eventos
iniciar();

// ========================= SERVIDOR EXPRESS (UI / QR) =========================
// Mantive exatamente a UI original para / e /qr, sem alterar aparência ou comportamento

const app = express();

// Rota principal - mantém a interface e estilo originais
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Bot WhatsApp JK</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          background: #f5f5f5;
        }
        .container {
          background: white;
          padding: 30px;
          border-radius: 10px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #25D366; }
        .status { 
          padding: 10px; 
          background: #d4edda; 
          border-left: 4px solid #28a745;
          margin: 20px 0;
        }
        a {
          display: inline-block;
          margin: 10px 0;
          padding: 10px 20px;
          background: #25D366;
          color: white;
          text-decoration: none;
          border-radius: 5px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🤖 Bot WhatsApp JK</h1>
        <div class="status">
          <strong>Status:</strong> 🟢 Bot rodando no Render!
        </div>
        <p>O bot está ativo e pronto para responder mensagens nos grupos configurados.</p>
        <a href="/qr">📱 Ver QR Code de Conexão</a>
      </div>
    </body>
    </html>
  `);
});

// Rota para visualizar QR Code — mantém instruções e reload automático (comportamento original)
app.get("/qr", (req, res) => {
  if (qrCodeAtual) {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code - Bot WhatsApp</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            display: inline-block;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #25D366; }
          img { max-width: 400px; margin: 20px 0; }
          .instructions {
            text-align: left;
            max-width: 400px;
            margin: 20px auto;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📱 Escaneie o QR Code</h1>
          <img src="${qrCodeAtual}" alt="QR Code" />
          <div class="instructions">
            <h3>Instruções:</h3>
            <ol>
              <li>Abra o WhatsApp no seu celular</li>
              <li>Toque em "Mais opções" (⋮) e depois "Aparelhos conectados"</li>
              <li>Toque em "Conectar um aparelho"</li>
              <li>Escaneie este QR Code</li>
            </ol>
          </div>
        </div>
        <script>
          // Recarrega a página a cada 10 segundos caso QR mude
          setTimeout(() => location.reload(), 10000);
        </script>
      </body>
      </html>
    `);
  } else {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bot WhatsApp - Status</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: #f5f5f5;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            display: inline-block;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #28a745; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Bot já está conectado!</h1>
          <p>Não é necessário escanear QR Code.</p>
          <p>O bot está funcionando normalmente.</p>
        </div>
        <script>
          // Recarrega a cada 5 segundos para verificar se precisa de QR
          setTimeout(() => location.reload(), 5000);
        </script>
      </body>
      </html>
    `);
  }
});

// ========================= INICIA SERVIDOR HTTP =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
  console.log(`📱 Acesse http://localhost:${PORT}/qr para ver o QR Code`);
});

// ========================= KEEP-ALIVE (PING) =========================
// Mantém a instância ativa em plataformas como Render (a cada 5 minutos)
setInterval(async () => {
  try {
    const url = process.env.RENDER_EXTERNAL_URL
      ? `https://${process.env.RENDER_EXTERNAL_URL}/`
      : `http://localhost:${PORT}/`;
    
    await axios.get(url);
    console.log("💤 Keep-alive: ping enviado para manter bot ativo");
  } catch (err) {
    console.log("⚠️ Keep-alive falhou:", err.message);
  }
}, 1000 * 60 * 5); // A cada 5 minutos
