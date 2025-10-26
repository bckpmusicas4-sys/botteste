// index.js
const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const P = require("pino");
const express = require("express");
const QRCode = require("qrcode");

const { tratarMensagemEncomendas } = require("./encomendas");
const { tratarMensagemLavanderia } = require("./lavanderia");

const app = express();
const PORT = process.env.PORT || 10000;

let qrAtual = "";
let sockGlobal = null;

// 🔹 Rota principal
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head><title>Bot JK</title></head>
      <body style="font-family:sans-serif;text-align:center;margin-top:100px;">
        <h1>🤖 Bot JK ativo!</h1>
        <p>Use <a href="/qr">/qr</a> para visualizar o QR Code.</p>
      </body>
    </html>
  `);
});

// 🔹 Rota QR Code
app.get("/qr", (req, res) => {
  if (qrAtual) {
    QRCode.toDataURL(qrAtual, (err, url) => {
      if (err) return res.status(500).send("Erro ao gerar QR Code.");
      res.send(`
        <html>
          <head><title>QR Code - Bot JK</title></head>
          <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
            <h2>📱 Escaneie o QR Code para conectar o Bot JK</h2>
            <img src="${url}" alt="QR Code" style="width:300px;height:300px;"/>
            <p>Atualize a página se o QR Code expirar.</p>
          </body>
        </html>
      `);
    });
  } else {
    res.send("<h2>✅ Já conectado ao WhatsApp!</h2>");
  }
});

// 🔹 Servidor Express
app.listen(PORT, () => {
  console.log(`🌐 Servidor HTTP rodando na porta ${PORT}`);
  console.log(`📱 Acesse http://localhost:${PORT}/qr para ver o QR Code`);
});

// 🔹 IDs dos grupos
const grupos = {
  lavanderia: [
    "120363416759586760@g.us", // Lavanderia JK
    "555193321922-1558822702@g.us" // outro grupo lavanderia
  ],
  encomendas: [
    "120363248264829284@g.us", // JK Universitário
    "555193987654321-1682345678@g.us" // outro grupo encomendas
  ],
};

// 🔹 Inicialização do bot
async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    printQRInTerminal: false, // desativado
  });

  sockGlobal = sock;

  // Atualiza credenciais
  sock.ev.on("creds.update", saveCreds);

  // 🔹 Recebimento de mensagens
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const remetente = msg.key.remoteJid;
    const texto =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";
    const textoLimpo = texto.trim().toLowerCase();

    console.log("🔔 Nova mensagem de:", remetente, "| Conteúdo:", textoLimpo);

    try {
      // 🧺 Lavanderia JK
      if (grupos.lavanderia.includes(remetente) && textoLimpo === "menu") {
        console.log("🧺 Ativando módulo Lavanderia (menu detectado)");
        await tratarMensagemLavanderia(sock, msg);
      }

      // 📦 JK Universitário (Encomendas)
      else if (grupos.encomendas.includes(remetente) && textoLimpo === "menu") {
        console.log("📦 Ativando módulo Encomendas (menu detectado)");
        await tratarMensagemEncomendas(sock, msg);
      }

      // Grupo não registrado
      else if (!grupos.lavanderia.includes(remetente) && !grupos.encomendas.includes(remetente)) {
        console.log("⚠️ Grupo não registrado:", remetente);
      }
    } catch (erro) {
      console.error("❗ Erro ao processar mensagem:", erro);
    }
  });

  // 🔹 Atualizações de conexão
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrAtual = qr;
      console.log("📱 QR Code gerado! Acesse /qr para escanear");
    }

    if (connection === "open") {
      qrAtual = "";
      console.log("✅ Bot conectado com sucesso!");
    }

    if (connection === "close") {
      const motivo = lastDisconnect?.error?.output?.statusCode;
      console.log("⚠️ Conexão encerrada. Código:", motivo);
      if (motivo !== 401) {
        console.log("🔄 Tentando reconectar em 10s...");
        setTimeout(() => iniciarBot(), 10000);
      } else {
        console.log("❌ Sessão expirada. Escaneie o QR novamente em /qr.");
      }
    }
  });
}

// 🚀 Inicia o bot
console.log("🔄 Iniciando conexão com WhatsApp...");
iniciarBot();
