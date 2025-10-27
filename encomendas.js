// === MÓDULO ENCOMENDAS - JK UNIVERSITÁRIO ===

const axios = require("axios");

const URL_API_ENTREGAS = "https://script.google.com/macros/s/AKfycbwAOD18Un4fe5WytqkTdiaTbDFGZCFdZT0Y1gGgquvFPqOyJrV4qK29UR74wMx7M9ux/exec";
const URL_API_HISTORICO = "https://script.google.com/macros/s/AKfycbwj1pd6zqZFqqDgPqleEAT6ctgUAZCsbMKoXjEdR1OPd9DY6kxL3rDmjYweda7ur_So/exec";
const URL_API_LOG = "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000;

// 🔹 Organiza resposta da API para sempre retornar array
function extrairLista(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (obj.data && Array.isArray(obj.data)) return obj.data;
  return [];
}

// 🔹 Timeout para limpar estado
function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

// 🔹 Formatador de data BR
function formatarDataBR(data) {
  if (!data) return "";
  const formatada = new Date(data);
  if (isNaN(formatada)) return data;
  return formatada.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// 🔹 Envia log
async function enviarLog(grupo, usuario, mensagem) {
  try {
    const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    await axios.post(URL_API_LOG, { acao: "adicionar", dataHora, grupo, usuario, mensagem });
  } catch (err) {
    console.error("Erro ao enviar log:", err.message);
  }
}

// 🔹 Principal
async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.key.fromMe) return;

    const remetente = msg.key.remoteJid;
    const grupo = remetente.includes("@g.us") ? "Grupo" : "Privado";
    const usuario = msg.pushName || "Desconhecido";

    const textoUsuario =
      (msg.message.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.buttonsResponseMessage?.selectedButtonId ||
        msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        "").trim();

    if (textoUsuario) await enviarLog(grupo, usuario, textoUsuario);

    const idSessao = remetente;
    const estado = estadosUsuarios[idSessao] || {};

    // 🔹 Enviar formatado
    const enviar = async (mensagem, botoes = []) => {
      if (botoes.length > 0) {
        await sock.sendMessage(remetente, {
          text: mensagem,
          footer: "Pousada JK Universitário",
          templateButtons: botoes.map(b => ({
            index: 1,
            quickReplyButton: { id: b.buttonId, displayText: b.buttonText.displayText }
          }))
        });
      } else {
        await sock.sendMessage(remetente, { text: mensagem });
      }
    };

    const menuTexto =
      "📦 *MENU ENCOMENDAS - JK UNIVERSITÁRIO*\n\nEscolha:\n" +
      "1️⃣ Registrar Encomenda\n" +
      "2️⃣ Ver Encomendas\n" +
      "3️⃣ Confirmar Retirada\n" +
      "4️⃣ Ver Histórico";

    const botoesMenu = [
      { buttonId: "1", buttonText: { displayText: "📦 Registrar" } },
      { buttonId: "2", buttonText: { displayText: "📋 Ver Encomendas" } },
      { buttonId: "3", buttonText: { displayText: "✅ Confirmar Retirada" } },
      { buttonId: "4", buttonText: { displayText: "🕓 Ver Histórico" } }
    ];

    if (["0", "menu", "!menu"].includes(textoUsuario.toLowerCase())) {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      return enviar(menuTexto, botoesMenu);
    }

    if (!estado.etapa) return;
    iniciarTimeout(idSessao);

    switch (estado.etapa) {
      case "menu":
        if (textoUsuario === "1") {
          estado.etapa = "obterNome";
          return enviar("👤 Nome do destinatário?");
        }
        if (textoUsuario === "2") {
          const resposta = await axios.get(`${URL_API_ENTREGAS}?action=listar`);
          const lista = extrairLista(resposta.data);

          if (lista.length === 0)
            return enviar("📭 Nenhuma encomenda registrada.");

          let txt = "📦 *Encomendas:*\n\n";
          lista.forEach(e => {
            txt += `🆔 ${e.ID} - ${e.nome}\n📅 ${formatarDataBR(e.data)}\n📍 ${e.local}\n\n`;
          });

          delete estadosUsuarios[idSessao];
          return enviar(txt);
        }
        if (textoUsuario === "3") {
          const resposta = await axios.get(`${URL_API_ENTREGAS}?action=listar`);
          const lista = extrairLista(resposta.data);
          const pendentes = lista.filter(e => e.status === "Aguardando Recebimento");

          if (!pendentes.length)
            return enviar("📭 Nenhuma encomenda aguardando retirada.");

          estado.etapa = "confirmarId";
          return enviar("Digite o ID da encomenda para baixa:");
        }
        if (textoUsuario === "4") {
          const resposta = await axios.get(`${URL_API_HISTORICO}?action=historico`);
          const lista = extrairLista(resposta.data);

          if (!lista.length)
            return enviar("📭 Histórico vazio.");

          let txt = "🕓 *Histórico*\n\n";
          lista.forEach(e => {
            txt += `🆔 ${e.ID} - ${e.nome}\n📅 ${formatarDataBR(e.data)} | ${e.local}\n📍 ${e.status}\n\n`;
          });

          delete estadosUsuarios[idSessao];
          return enviar(txt);
        }

        return enviar("⚠️ Opção inválida!", botoesMenu);

      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        return enviar("📅 Data da entrega (dd/mm/aaaa)?");

      case "obterData":
        estado.data = textoUsuario;
        estado.etapa = "obterLocal";
        return enviar("🛒 Local da compra?");

      case "obterLocal":
        estado.local = textoUsuario;

        const respLista = await axios.get(`${URL_API_ENTREGAS}?action=listar`);
        const lista = extrairLista(respLista.data);

        const novoID = lista.length ? Math.max(...lista.map(i => Number(i.ID))) + 1 : 1;

        await axios.post(URL_API_ENTREGAS, {
          acao: "adicionar",
          id: novoID,
          nome: estado.nome,
          data: estado.data,
          local: estado.local,
          status: "Aguardando Recebimento",
          recebido_por: ""
        });

        delete estadosUsuarios[idSessao];
        return enviar(`✅ Registrado!\n🆔 ${novoID}`);

      case "confirmarId":
        estado.id = Number(textoUsuario);
        estado.etapa = "confirmarRecebedor";
        return enviar("✋ Quem retirou?");

      case "confirmarRecebedor":
        await axios.post(URL_API_ENTREGAS, {
          acao: "atualizar",
          id: Number(estado.id),
          status: "Entregue",
          recebido_por: textoUsuario
        });

        delete estadosUsuarios[idSessao];
        return enviar("✅ Baixa realizada com sucesso!");

      default:
        delete estadosUsuarios[idSessao];
        return enviar("⚠️ Reinicie com *0* ou *!menu*.");
    }

  } catch (err) {
    console.error("❌ Erro:", err);
  }
}

module.exports = { tratarMensagemEncomendas };
