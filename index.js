const express = require("express");
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require("@whiskeysockets/baileys");
const P = require("pino");
const QRCode = require("qrcode"); // para gerar QR em imagem
const { tratarMensagemEncomendas } = require("./encomendas");
const { tratarMensagemLavanderia } = require("./lavanderia");

const app = express();
const PORT = process.env.PORT || 3000;

let ultimoQR = null;
let botStatus = "⏳ Iniciando bot...";

const grupos = {
  lavanderia: ["120363357349898033@g.us"],
  encomendas: ["120363357349898033@g.us"],
};

// === ROTA PRINCIPAL ===
app.get("/", (req, res) => {
  res.send(`
    <h2>🤖 Bot WhatsApp Ativo</h2>
    <p>Status atual: ${botStatus}</p>
    <p>Acesse <a href="/qr">/qr</a> para escanear o código do WhatsApp.</p>
  `);
});

// === ROTA DO QR CODE ===
app.get("/qr", async (req, res) => {
  if (ultimoQR) {
    try {
      const qrImage = await QRCode.toDataURL(ultimoQR);
      res.send(`
        <h2>📱 Escaneie o QR Code abaixo para conectar o bot:</h2>
        <img src="${qrImage}" alt="QR Code" />
        <p>Após escanear, o bot conectará automaticamente.</p>
      `);
    } catch (err) {
      res.status(500).send("Erro ao gerar o QR Code.");
    }
  } else {
    res.send(`<h2>✅ Nenhum QR disponível — o bot já pode estar conectado.</h2>`);
  }
});

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const remetente = msg.key.remoteJid;

    try {
      if (grupos.lavanderia.includes(remetente)) {
        console.log("🧺 Chamando módulo Lavanderia...");
        await tratarMensagemLavanderia(sock, msg);
        console.log("✅ Módulo Lavanderia executado com sucesso");
      } else if (grupos.encomendas.includes(remetente)) {
        console.log("📦 Chamando módulo Encomendas...");
        await tratarMensagemEncomendas(sock, msg);
        console.log("✅ Módulo Encomendas executado com sucesso");
      } else {
        console.log("🔍 Grupo não registrado:", remetente);
      }
    } catch (erro) {
      console.error("❗ Erro no roteamento de módulos:", erro);
    }
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      ultimoQR = qr;
      botStatus = "📲 Aguardando leitura do QR Code...";
      console.log("QR gerado — acesse /qr para escanear.");
    }

    if (connection === "open") {
      ultimoQR = null;
      botStatus = "✅ Bot conectado com sucesso!";
      console.log(botStatus);
    }

    if (connection === "close") {
      const motivo = lastDisconnect?.error?.output?.statusCode;
      botStatus = "❌ Conexão perdida. Tentando reconectar...";
      console.log("Conexão fechada:", motivo);

      if (motivo !== DisconnectReason.loggedOut) {
        iniciarBot();
      } else {
        botStatus = "⚠️ Sessão expirada. Escaneie o QR novamente.";
        console.log(botStatus);
      }
    }
  });
}

// Inicia o bot e o servidor web
iniciarBot();
app.listen(PORT, () => console.log(`🌐 Servidor Express rodando na porta ${PORT}`));
