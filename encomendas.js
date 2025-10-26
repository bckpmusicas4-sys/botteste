// === MÓDULO ENCOMENDAS - JK UNIVERSITÁRIO ===
// Autor: Iron Maiden 🤘

// === CONFIGURAÇÕES ===
const axios = require("axios");

const URL_API_ENTREGAS = "https://script.google.com/macros/s/AKfycbxd-NvEuxFOaF_u-519ajuPtgzStri31HtC0RZVbzSwNLHEaKkWt8O_i_SZCstw-0ha/exec";
const URL_API_HISTORICO = "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000; // 10 minutos

// --- Reinicia o timeout da sessão ---
function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    console.log(`⌛ Sessão expirada: ${idSessao}`);
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

// === FUNÇÃO PRINCIPAL ===
async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.key.fromMe || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const textoUsuario = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
    const idSessao = remetente;
    const estado = estadosUsuarios[idSessao] || {};

    // === Função de envio de mensagem ===
    const enviar = async (mensagem, botoes) => {
      if (botoes && botoes.length > 0) {
        const buttonsMessage = {
          text: mensagem,
          footer: "Pousada JK Universitário",
          buttons: botoes,
          headerType: 4,
        };
        await sock.sendMessage(remetente, buttonsMessage);
      } else {
        await sock.sendMessage(remetente, { text: mensagem });
      }
    };

    // === MENU PRINCIPAL ===
    const menuTexto =
      "📦 *MENU ENCOMENDAS - JK UNIVERSITÁRIO*\n\n" +
      "Escolha uma das opções abaixo:\n\n" +
      "1️⃣ Registrar Encomenda 📦\n" +
      "2️⃣ Ver Encomendas 📋\n" +
      "3️⃣ Confirmar Retirada ✅\n" +
      "4️⃣ Ver Histórico 🕓\n\n" +
      "Digite o número da opção desejada ou use os comandos:\n" +
      "• *!ping* - Verificar status do bot\n" +
      "• *!ajuda* ou *menu* - Ver este menu\n" +
      "• *!info* - Informações do grupo";

    const botoesMenu = [
      { buttonId: "1", buttonText: { displayText: "📦 Registrar" }, type: 1 },
      { buttonId: "2", buttonText: { displayText: "📋 Ver Encomendas" }, type: 1 },
      { buttonId: "3", buttonText: { displayText: "✅ Confirmar Retirada" }, type: 1 },
      { buttonId: "4", buttonText: { displayText: "🕓 Ver Histórico" }, type: 1 },
    ];

    // === Comando inicial ===
    if (["!menu", "!ajuda", "menu", "0"].includes(textoUsuario.toLowerCase())) {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      await enviar(menuTexto, botoesMenu);
      return;
    }

    // === Se o usuário não tiver sessão, ignora ===
    if (!estado.etapa) return;

    iniciarTimeout(idSessao);

    // === Etapas do fluxo ===
    switch (estado.etapa) {
      case "menu":
        if (["1", "📦 Registrar"].includes(textoUsuario)) {
          estado.etapa = "obterNome";
          await enviar("👤 Qual o nome do destinatário?");
        } else if (["2", "📋 Ver Encomendas"].includes(textoUsuario)) {
          const { data } = await axios.get(`${URL_API_ENTREGAS}?action=listar`);
          if (!data.length) return await enviar("📭 Nenhuma encomenda registrada.");
          let resposta = "📦 *Encomendas Registradas:*\n\n";
          data.forEach(e => {
            resposta += `🆔 ${e.ID} - ${e.nome}\n📅 ${e.data} | 🛒 ${e.local}\n📍 Status: ${e.status}\n\n`;
          });
          await enviar(resposta.trim());
          delete estadosUsuarios[idSessao];
        } else if (["3", "✅ Confirmar Retirada"].includes(textoUsuario)) {
          estado.etapa = "confirmarID";
          await enviar("📦 Digite o *ID* da encomenda que foi retirada:");
        } else if (["4", "🕓 Ver Histórico"].includes(textoUsuario)) {
          const { data } = await axios.get(`${URL_API_HISTORICO}?action=historico`);
          if (!data.length) return await enviar("📭 O histórico está vazio.");
          let resposta = "🕓 *Histórico de Encomendas:*\n\n";
          data.forEach(e => {
            resposta += `🆔 ${e.ID} - ${e.nome}\n📦 ${e.local} | ${e.data}\n📍 ${e.status}\n\n`;
          });
          await enviar(resposta.trim());
          delete estadosUsuarios[idSessao];
        } else {
          await enviar("⚠️ Opção inválida. Escolha 1️⃣, 2️⃣, 3️⃣ ou 4️⃣.");
        }
        break;

      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        await enviar("📅 Qual a data estimada da entrega? (Ex: 26/10/2025)");
        break;

      case "obterData":
        estado.data = textoUsuario;
        estado.etapa = "obterLocal";
        await enviar("🛒 Onde a compra foi realizada? (Ex: Shopee, Mercado Livre)");
        break;

      case "obterLocal":
        estado.local = textoUsuario;
        await axios.post(URL_API_ENTREGAS, {
          acao: "adicionar",
          nome: estado.nome,
          data: estado.data,
          local: estado.local,
        });
        await enviar(
          `✅ Encomenda registrada com sucesso!\n👤 ${estado.nome}\n🗓️ ${estado.data}\n🛒 ${estado.local}`
        );
        delete estadosUsuarios[idSessao];
        break;

      case "confirmarID":
        estado.id = textoUsuario;
        estado.etapa = "confirmarRecebedor";
        await enviar("✋ Quem retirou essa encomenda?");
        break;

      case "confirmarRecebedor":
        await axios.post(URL_API_ENTREGAS, {
          acao: "atualizar",
          id: estado.id,
          status: "Retirada",
          recebido_por: textoUsuario,
        });
        await enviar(`✅ Encomenda *${estado.id}* marcada como *Retirada* por ${textoUsuario}.`);
        delete estadosUsuarios[idSessao];
        break;

      default:
        await enviar("⚠️ Algo deu errado. Digite *!menu* para recomeçar.");
        delete estadosUsuarios[idSessao];
    }
  } catch (erro) {
    console.error("❌ Erro no módulo Encomendas:", erro.message);
  }
}

module.exports = { tratarMensagemEncomendas };
