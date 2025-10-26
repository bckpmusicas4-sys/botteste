// encomendas.js
const axios = require("axios");

const URL_ENCOMENDAS = "https://script.google.com/macros/s/AKfycbxd-NvEuxFOaF_u-519ajuPtgzStri31HtC0RZVbzSwNLHEaKkWt8O_i_SZCstw-0ha/exec";
const URL_HISTORICO = "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";
const URL_LOG = "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000; // 10 minutos

function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    delete estadosUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

// --- LOG silencioso ---
async function enviarLog(grupo, usuario, mensagem) {
  try {
    const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    await axios.post(URL_LOG, {
      acao: "adicionar",
      dataHora,
      grupo,
      usuario,
      mensagem
    });
  } catch (err) {
    console.error("Erro ao enviar log:", err.message);
  }
}

async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const textoUsuario = msg.message.conversation?.trim() || "";
    const idSessao = remetente + "_" + (msg.key.participant || "");
    const grupo = msg.key.remoteJid.includes("@g.us") ? "Grupo" : "Privado";
    const usuario = msg.pushName || "Desconhecido";

    // Log da mensagem do usuário
    if (!msg.key.fromMe && textoUsuario) await enviarLog(grupo, usuario, textoUsuario);

    const sessaoAtiva = estadosUsuarios[idSessao];

    const enviarMenu = async (texto, botoes) => {
      await sock.sendMessage(remetente, {
        text: texto,
        buttons: botoes.map((b, i) => ({ buttonId: String(i+1), buttonText: { displayText: b }, type: 1 })),
        headerType: 1
      });
      // Log da mensagem do BOT
      await enviarLog(grupo, "BOT", texto);
    };

    // Menu inicial ou comandos
    if (!sessaoAtiva || textoUsuario === "!menu" || textoUsuario === "!ajuda" || textoUsuario === "menu") {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);

      await enviarMenu(
        "📦 *MENU ENCOMENDAS - JK UNIVERSITÁRIO*\n\nEscolha uma opção:",
        [
          "Registrar Encomenda 📦",
          "Ver Encomendas 📋",
          "Confirmar Retirada ✅",
          "Ver Histórico 🕓"
        ]
      );

      estadosUsuarios[idSessao].etapa = "aguardandoEscolha";
      return;
    }

    iniciarTimeout(idSessao);
    const estado = estadosUsuarios[idSessao];

    const escolha = parseInt(textoUsuario, 10);

    switch (estado.etapa) {
      case "aguardandoEscolha":
        if (escolha === 1) {
          estado.etapa = "obterNome";
          await sock.sendMessage(remetente, { text: "👤 Qual o nome do destinatário?" });
        } else if (escolha === 2) {
          const { data } = await axios.get(`${URL_ENCOMENDAS}?action=listar`);
          if (!data.length) return sock.sendMessage(remetente, { text: "📭 Nenhuma encomenda registrada ainda." });

          let resposta = "📦 *Encomendas registradas:*\n\n";
          data.forEach(e => {
            resposta += `🆔 ${e.ID} — ${e.nome}\n🛒 ${e.local}\n🗓️ ${e.data}\n📍 Status: ${e.status}\n📬 Recebido por: ${e.recebido_por || "-"}\n\n`;
          });
          await sock.sendMessage(remetente, { text: resposta.trim() });
        } else if (escolha === 3) {
          estado.etapa = "informarID";
          await sock.sendMessage(remetente, { text: "📦 Qual o ID da encomenda que deseja confirmar?" });
        } else if (escolha === 4) {
          const { data } = await axios.get(`${URL_HISTORICO}?action=historico`);
          if (!data.length) return sock.sendMessage(remetente, { text: "📭 O histórico está vazio." });

          let resposta = "📜 *Histórico de Encomendas:*\n\n";
          data.forEach(e => {
            resposta += `🆔 ${e.ID} — ${e.nome}\n🛒 ${e.local}\n🗓️ ${e.data}\n📍 Status: ${e.status}\n📬 Recebido por: ${e.recebido_por || "-"}\n\n`;
          });
          await sock.sendMessage(remetente, { text: resposta.trim() });
        } else {
          await sock.sendMessage(remetente, { text: "⚠️ Opção inválida. Clique em um botão ou digite 1, 2, 3 ou 4." });
        }
        break;

      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterLocal";
        await sock.sendMessage(remetente, { text: "🛒 Qual a loja ou local da encomenda?" });
        break;

      case "obterLocal":
        estado.local = textoUsuario;
        estado.etapa = "obterData";
        await sock.sendMessage(remetente, { text: "📅 Qual a data estimada de entrega? (Ex: 26/10/2025)" });
        break;

      case "obterData":
        estado.data = textoUsuario;
        await axios.post(URL_ENCOMENDAS, {
          acao: "adicionar",
          nome: estado.nome,
          local: estado.local,
          data: estado.data,
          status: "Aguardando Recebimento",
          recebido_por: ""
        });

        await sock.sendMessage(remetente, {
          text: `✅ Encomenda registrada para ${estado.nome}!\n🛒 Loja: ${estado.local}\n🗓️ Chegada em: ${estado.data}\n📍 Status: Aguardando Recebimento`
        });
        delete estadosUsuarios[idSessao];
        break;

      case "informarID":
        estado.idConfirmar = textoUsuario;
        estado.etapa = "confirmarRecebedor";
        await sock.sendMessage(remetente, { text: "✋ Quem está retirando esta encomenda?" });
        break;

      case "confirmarRecebedor":
        await axios.post(URL_ENCOMENDAS, {
          acao: "atualizar",
          id: estado.idConfirmar,
          status: "Recebida",
          recebido_por: textoUsuario
        });
        await sock.sendMessage(remetente, {
          text: `✅ Recebimento confirmado!\nID: ${estado.idConfirmar}\nRecebido por: ${textoUsuario}\n📍 Status atualizado para Recebida`
        });
        delete estadosUsuarios[idSessao];
        break;

      default:
        await sock.sendMessage(remetente, { text: "⚠️ Algo deu errado. Digite !menu para recomeçar." });
        delete estadosUsuarios[idSessao];
    }

  } catch (err) {
    console.error("Erro no módulo encomendas:", err.message);
  }
}

module.exports = { tratarMensagemEncomendas };
