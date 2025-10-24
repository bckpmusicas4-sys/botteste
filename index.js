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

// 🔧 Variáveis globais
let sock;
let grupos = { lavanderia: [], encomendas: [] };
const caminhoGrupos = "grupos.json";
let reconectando = false;
let qrCodeAtual = null;

// 🧱 Carrega grupos salvos no arquivo JSON
if (fs.existsSync(caminhoGrupos)) {
  grupos = JSON.parse(fs.readFileSync(caminhoGrupos, "utf-8"));
  console.log("✅ Grupos carregados do arquivo:");
  console.log("🧺 Lavanderia:", grupos.lavanderia);
  console.log("📦 Encomendas:", grupos.encomendas);
} else {
  console.log("⚠️ Arquivo grupos.json não encontrado. Será criado automaticamente.");
}

/**
 * 🚀 Função principal que inicia a conexão com o WhatsApp
 * Esta função conecta o bot ao WhatsApp usando Baileys e configura todos os eventos
 */
async function iniciar() {
  console.log("🔄 Iniciando conexão com WhatsApp...");

  // 🔄 Limpa eventos antigos para evitar duplicação (sem encerrar sessão)
  if (sock?.ev) {
    try {
      sock.ev.removeAllListeners();
      console.log("♻️ Eventos antigos removidos.");
    } catch (e) {
      console.warn("⚠️ Falha ao remover eventos:", e.message);
    }
  }

  // 📁 Carrega estado de autenticação (pasta auth/)
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  // 🤖 Cria conexão com o WhatsApp
  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true, // Mostra QR Code no console
    logger: P({ level: "silent" }), // Logger silencioso
    browser: ["BotJK", "Chrome", "120.0.0.0"], // Identificação do navegador
  });

  // 💾 Salva credenciais quando atualizadas
  sock.ev.on("creds.update", saveCreds);

  // 📩 Evento: Recebimento de mensagens
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const remetente = msg.key.remoteJid;

    // Ignora mensagens inválidas
    if (
      !msg.message ||
      msg.key.fromMe ||
      msg.message.protocolMessage ||
      msg.message.reactionMessage ||
      !remetente.endsWith("@g.us") // Apenas grupos
    )
      return;

    // 🏷️ Tenta detectar automaticamente o tipo de grupo
    try {
      const metadata = await sock.groupMetadata(remetente);
      const nomeGrupo = metadata.subject.toLowerCase();

      // Adiciona grupo automaticamente se contiver palavras-chave
      if (
        nomeGrupo.includes("lavanderia") &&
        !grupos.lavanderia.includes(remetente)
      ) {
        grupos.lavanderia.push(remetente);
        console.log(`✅ Grupo de lavanderia detectado: ${metadata.subject}`);
      } else if (
        (nomeGrupo.includes("jk") || nomeGrupo.includes("encomenda")) &&
        !grupos.encomendas.includes(remetente)
      ) {
        grupos.encomendas.push(remetente);
        console.log(`✅ Grupo de encomendas detectado: ${metadata.subject}`);
      }

      // Salva grupos atualizados
      fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
    } catch (e) {
      console.warn("❌ Erro ao obter metadados do grupo:", e.message);
    }

    console.log("🔔 Nova mensagem recebida de:", remetente);

    // 📨 Roteia mensagem para o módulo correto
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

  // 👋 Evento: Entrada e saída de participantes
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const metadata = await sock.groupMetadata(update.id);
      const grupoNome = metadata.subject;

      for (let participante of update.participants) {
        const numero = participante.split("@")[0];
        const dataHora = new Date().toLocaleString("pt-BR", {
          timeZone: "America/Sao_Paulo",
        });

        // Participante entrou no grupo
        if (update.action === "add") {
          console.log(`📱 @${numero} entrou no grupo ${grupoNome}`);

          // Mensagem de boas-vindas com menção
          await sock.sendMessage(update.id, {
            text: `👋 Olá @${numero}!\n\nBem-vindo(a) ao grupo *${grupoNome}*! 🎉\n\nDigite *menu* para ver as opções disponíveis.`,
            mentions: [participante],
          });

          // Log no SheetDB (se disponível)
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

        // Participante saiu do grupo
        else if (update.action === "remove") {
          console.log(`👋 @${numero} saiu do grupo ${grupoNome}`);

          await sock.sendMessage(update.id, {
            text: `👋 @${numero} saiu do grupo *${grupoNome}*`,
            mentions: [participante],
          });

          // Log no SheetDB (se disponível)
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

  // 🔄 Evento: Atualização de conexão
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // 📱 QR Code disponível
    if (qr) {
      try {
        qrCodeAtual = await QRCode.toDataURL(qr);
        console.log("📱 QR Code gerado! Acesse http://localhost:5000/qr para escanear");
      } catch (err) {
        console.error("❌ Erro ao gerar QR Code:", err.message);
      }
    }

    // 🔌 Conexão fechada
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Conexão encerrada. Código: ${statusCode}`);

      // Reconecta automaticamente (exceto se foi logout)
      if (!reconectando && statusCode !== DisconnectReason.loggedOut) {
        reconectando = true;
        console.log("🔄 Reconectando em 15 segundos...");
        await new Promise((resolve) => setTimeout(resolve, 15000));
        await iniciar();
      } else {
        console.log("❌ Sessão encerrada. Escaneie o QR Code novamente em /qr");
        qrCodeAtual = null;
      }
    }

    // ✅ Conexão aberta
    else if (connection === "open") {
      reconectando = false;
      qrCodeAtual = null;
      console.log("✅ Bot conectado ao WhatsApp com sucesso!");
      console.log("🤖 Bot JK está online e pronto para responder!");
    }
  });
}

// ▶️ Inicializa o bot
iniciar();

// 🌐 Servidor Express (necessário para manter ativo no Render)
const app = express();

// Rota principal
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

// Rota para visualizar QR Code
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

// Inicia servidor HTTP
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
  console.log(`📱 Acesse http://localhost:${PORT}/qr para ver o QR Code`);
});

// ♻️ Keep-alive para manter o bot ativo no Render
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
