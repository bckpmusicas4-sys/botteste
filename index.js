const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const P = require("pino");
const { tratarMensagemEncomendas } = require("./tratarMensagemEncomendas");
const { tratarMensagemLavanderia } = require("./tratarMensagemLavanderia");

const grupos = {
  lavanderia: ["120363357349898033@g.us"],
  encomendas: ["120363357349898033@g.us"],
};

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    printQRInTerminal: true,
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
        try {
          await tratarMensagemLavanderia(sock, msg);
          console.log("✅ Módulo Lavanderia executado com sucesso");
        } catch (erro) {
          console.error("❌ Erro ao executar módulo Lavanderia:", erro);
        }
      } else if (grupos.encomendas.includes(remetente)) {
        console.log("📦 Chamando módulo Encomendas...");
        try {
          await tratarMensagemEncomendas(sock, msg);
          console.log("✅ Módulo Encomendas executado com sucesso");
        } catch (erro) {
          console.error("❌ Erro ao executar módulo Encomendas:", erro);
        }
      } else {
        console.log("🔍 Grupo não registrado:", remetente);
      }
    } catch (erro) {
      console.error("❗ Erro no roteamento de módulos:", erro);
    }
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
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
}

iniciarBot();
