const express = require("express");
const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const P = require("pino");
const qrcode = require("qrcode-terminal");
const { tratarMensagemEncomendas } = require("./encomendas");
const { tratarMensagemLavanderia } = require("./lavanderia");

const app = express();
app.use(express.json());

// ✅ Servidor HTTP básico
app.get("/", (req, res) => {
  res.send("🤖 Bot WhatsApp está rodando com sucesso!");
});

const grupos = {
  lavanderia: ["120363357349898033@g.us"],
  encomendas: ["120363357349898033@g.us"],
};

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: "silent" }),
    // ⚠️ printQRInTerminal removido (depreciado)
  });

  sock.ev.on("creds.update", saveCreds);

  // ✅ Exibir QR manualmente
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📱 Escaneie o QR code abaixo para conectar o bot:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const motivo = lastDisconnect?.error?.output?.statusCode;
      console.log("Conexão fechada:", motivo);
      if (motivo !== 401) {
        iniciarBot();
      } else {
        console.log("❌ Sessão expirada, faça login novamente.");
      }
    } else if (connection === "open") {
      console.log("✅ Bot conectado com sucesso!");
    }
  });

  // ✅ Tratamento das mensagens
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message) return;

    const remetente = msg.key.remoteJid;

    try {
      if (grupos.lavanderia.includes(remetente)) {
        console.log("🧺 Chamando módulo Lavanderia...");
        await tratarMensagemLavanderia(sock, msg);
      } else if (grupos.encomendas.includes(remetente)) {
        console.log("📦 Chamando módulo Encomendas...");
        await tratarMensagemEncomendas(sock, msg);
      } else {
        console.log("🔍 Grupo não registrado:", remetente);
      }
    } catch (erro) {
      console.error("❗ Erro ao processar mensagem:", erro);
    }
  });
}

// 🚀 Iniciar servidor e bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor Express rodando na porta ${PORT}`);
  iniciarBot();
});
