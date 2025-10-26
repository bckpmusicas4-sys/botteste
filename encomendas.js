// === MÓDULO ENCOMENDAS - JK UNIVERSITÁRIO ===

const axios = require("axios");

const URL_API_ENTREGAS = "https://script.google.com/macros/s/AKfycbxd-NvEuxFOaF_u-519ajuPtgzStri31HtC0RZVbzSwNLHEaKkWt8O_i_SZCstw-0ha/exec";
const URL_API_HISTORICO = "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";
const URL_API_LOG = "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000; // 10 minutos

// 🔹 Timeout para limpar estado do usuário
function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

// 🔹 Função auxiliar para formatar data no padrão brasileiro
function formatarDataBR(isoDate) {
  if (!isoDate) return "";
  const data = new Date(isoDate);
  if (isNaN(data)) return isoDate;
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// 🔹 Função para enviar logs
async function enviarLog(grupo, usuario, mensagem) {
  try {
    const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    await axios.post(URL_API_LOG, { acao: "adicionar", dataHora, grupo, usuario, mensagem });
  } catch (err) {
    console.error("Erro ao enviar log:", err.message);
  }
}

// 🔹 Função principal do módulo
async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.key.fromMe || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const grupo = msg.key.remoteJid.includes("@g.us") ? "Grupo" : "Privado";
    const usuario = msg.pushName || "Desconhecido";

    const textoUsuario =
      (msg.message.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        "").trim();

    if (!msg.key.fromMe && textoUsuario) await enviarLog(grupo, usuario, textoUsuario);

    const idSessao = remetente;
    const estado = estadosUsuarios[idSessao] || {};

    // 🔹 Função para enviar mensagens com botões (compatível 6.7.20)
    const enviar = async (mensagem, botoes) => {
      if (botoes && botoes.length > 0) {
        await sock.sendMessage(remetente, {
          text: mensagem,
          footer: "Pousada JK Universitário",
          templateButtons: botoes.map(b => ({
            index: 1,
            quickReplyButton: { id: b.buttonId, displayText: b.buttonText.displayText }
          })),
          viewOnce: false
        });
      } else {
        await sock.sendMessage(remetente, { text: mensagem });
      }
    };

    // 🔹 Menu principal
    const menuTexto =
      "📦 *MENU ENCOMENDAS - JK UNIVERSITÁRIO*\n\nEscolha uma das opções:\n1️⃣ Registrar Encomenda 📦\n2️⃣ Ver Encomendas 📋\n3️⃣ Confirmar Retirada ✅\n4️⃣ Ver Histórico 🕓";

    const botoesMenu = [
      { buttonId: "1", buttonText: { displayText: "📦 Registrar" }, type: 1 },
      { buttonId: "2", buttonText: { displayText: "📋 Ver Encomendas" }, type: 1 },
      { buttonId: "3", buttonText: { displayText: "✅ Confirmar Retirada" }, type: 1 },
      { buttonId: "4", buttonText: { displayText: "🕓 Ver Histórico" }, type: 1 },
    ];

    // 🔹 Comando de menu
    if (["!menu", "!ajuda", "menu", "0"].includes(textoUsuario.toLowerCase())) {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      await enviar(menuTexto, botoesMenu);
      return;
    }

    if (!estado.etapa) return;
    iniciarTimeout(idSessao);

    switch (estado.etapa) {

      // 🔹 Menu principal
      case "menu":
        if (["1", "📦 Registrar"].includes(textoUsuario)) {
          estado.etapa = "obterNome";
          await enviar("👤 Qual o nome do destinatário?");
        } else if (["2", "📋 Ver Encomendas"].includes(textoUsuario)) {
          const { data } = await axios.get(`${URL_API_ENTREGAS}?action=listar`);
          if (!data.length) return await enviar("📭 Nenhuma encomenda registrada.");
          let resposta = "📦 *Encomendas Registradas:*\n\n";
          data.forEach(e => {
            const dataFormatada = formatarDataBR(e.data);
            resposta += `🆔 ${e.ID} - ${e.nome}\n📅 ${dataFormatada} | 🛒 ${e.local}\n📍 Status: ${e.status}\n\n`;
          });
          await enviar(resposta.trim());
          delete estadosUsuarios[idSessao];
        } else if (["3", "✅ Confirmar Retirada"].includes(textoUsuario)) {
          estado.etapa = "selecionarEncomenda";
          const { data } = await axios.get(`${URL_API_ENTREGAS}?action=listar`);
          if (!data.length) return await enviar("📭 Nenhuma encomenda para retirada.");

          const botoesEncomendas = data
            .filter(e => e.status === "Aguardando Recebimento")
            .map(e => ({ buttonId: e.ID.toString(), buttonText: { displayText: `${e.ID} - ${e.nome}` }, type: 1 }));

          if (!botoesEncomendas.length) return await enviar("📭 Nenhuma encomenda aguardando retirada.");

          estadosUsuarios[idSessao] = { etapa: "confirmarRecebedor" };
          await enviar("📦 Escolha a encomenda digitando o ID para a baixa", botoesEncomendas);
        } else if (["4", "🕓 Ver Histórico"].includes(textoUsuario)) {
          const { data } = await axios.get(`${URL_API_HISTORICO}?action=historico`);
          if (!data.length) return await enviar("📭 O histórico está vazio.");

          let resposta = "🕓 *Histórico de Encomendas:*\n\n";
          for (let i = 0; i < data.length; i += 5) {
            const grupo5 = data.slice(i, i + 5);
            grupo5.forEach(e => {
              const dataFormatada = formatarDataBR(e.data);
              resposta += `🆔 ${e.ID} - ${e.nome}\n📦 ${e.local} | ${dataFormatada}\n📍 ${e.status}\n📤 Recebido por: ${e.recebido_por || "-"}\n\n`;
            });
            await enviar(resposta.trim());
            resposta = "";
          }

          delete estadosUsuarios[idSessao];
        } else {
          await enviar("⚠️ Opção inválida. Clique em um botão ou digite 1️⃣, 2️⃣, 3️⃣ ou 4️⃣.");
        }
        break;

      // 🔹 Registrar encomenda passo a passo
      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        await enviar("📅 Qual a data estimada da entrega?");
        break;

      case "obterData":
        estado.data = textoUsuario;
        estado.etapa = "obterLocal";
        await enviar("🛒 Onde a compra foi realizada?");
        break;

      case "obterLocal":
        estado.local = textoUsuario;

        const { data: lista } = await axios.get(`${URL_API_ENTREGAS}?action=listar`);
        const novoId = lista.length ? Math.max(...lista.map(e => Number(e.ID) || 0)) + 1 : 1;

        // ✅ Data enviada correta para Sheets
        await axios.post(URL_API_ENTREGAS, {
          acao: "adicionar",
          id: novoId,
          nome: estado.nome,
          data: estado.data, // ✅ ISO para sheet reconhecer como DATE
          local: estado.local,
          status: "Aguardando Recebimento",
          recebido_por: ""
        });

        await enviar(
          `✅ Encomenda registrada com sucesso!\n` +
          `🆔 ${novoId}\n👤 ${estado.nome}\n🗓️ ${formatarDataBR(estado.data)}\n🛒 ${estado.local}\n📍 Status: Aguardando Recebimento`
        );

        delete estadosUsuarios[idSessao];
        break;

      // 🔹 Confirmar retirada
      case "confirmarRecebedor":
        estado.id = textoUsuario;
        estado.etapa = "informarRecebedor";
        await enviar("✋ Quem retirou essa encomenda?");
        break;

      case "informarRecebedor":
        await axios.post(URL_API_ENTREGAS, {
          acao: "atualizar",
          id: estado.id,
          status: "Entregue",
          recebido_por: textoUsuario
        });
        await enviar(`✅ Encomenda *${estado.id}* marcada como *Entregue* por ${textoUsuario}.`);
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
