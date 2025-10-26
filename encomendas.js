// === MÓDULO ENCOMENDAS - JK UNIVERSITÁRIO ===

const axios = require("axios");

// 🔹 URLs das APIs do Google Apps Script
const URL_API_ENTREGAS = "https://script.google.com/macros/s/AKfycbxd-NvEuxFOaF_u-519ajuPtgzStri31HtC0RZVbzSwNLHEaKkWt8O_i_SZCstw-0ha/exec";
const URL_API_HISTORICO = "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";
const URL_API_LOG = "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

// 🔹 Armazena o estado de cada conversa
let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000; // 10 minutos

// 🔹 Controla o tempo de sessão de cada usuário
function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

// 🔹 Formata data para o padrão brasileiro
function formatarDataBR(isoDate) {
  if (!isoDate) return "";
  const data = new Date(isoDate);
  if (isNaN(data)) return isoDate;
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// 🔹 Envia logs de interação para a planilha
async function enviarLog(grupo, usuario, mensagem) {
  try {
    const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    await axios.post(URL_API_LOG, { acao: "adicionar", dataHora, grupo, usuario, mensagem });
  } catch (err) {
    console.error("Erro ao enviar log:", err.message);
  }
}

// 🔹 Função principal do módulo de Encomendas
async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.key.fromMe || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const grupo = msg.key.remoteJid.includes("@g.us") ? "Grupo" : "Privado";
    const usuario = msg.pushName || "Desconhecido";

    // 🔹 Captura o texto digitado ou clicado
    const textoUsuario =
      (msg.message.conversation ||
       msg.message?.extendedTextMessage?.text ||
       msg.message?.buttonsResponseMessage?.selectedButtonId ||
       msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
       ""
      ).trim();

    if (!msg.key.fromMe && textoUsuario) await enviarLog(grupo, usuario, textoUsuario);

    const idSessao = remetente;
    const estado = estadosUsuarios[idSessao] || {};

    // 🔹 Função auxiliar para enviar mensagens
    const enviar = async (mensagem, botoes) => {
      if (botoes && botoes.length > 0) {
        await sock.sendMessage(remetente, { text: mensagem, footer: "Pousada JK Universitário", buttons: botoes, headerType: 1 });
      } else {
        await sock.sendMessage(remetente, { text: mensagem });
      }
    };

    // 🔹 Texto e botões do menu principal
    const menuTexto =
      "📦 *MENU ENCOMENDAS - JK UNIVERSITÁRIO*\n\nEscolha uma das opções:\n1️⃣ Registrar Encomenda 📦\n2️⃣ Ver Encomendas 📋\n3️⃣ Confirmar Retirada ✅\n4️⃣ Ver Histórico 🕓";

    const botoesMenu = [
      { buttonId: "1", buttonText: { displayText: "📦 Registrar" }, type: 1 },
      { buttonId: "2", buttonText: { displayText: "📋 Ver Encomendas" }, type: 1 },
      { buttonId: "3", buttonText: { displayText: "✅ Confirmar Retirada" }, type: 1 },
      { buttonId: "4", buttonText: { displayText: "🕓 Ver Histórico" }, type: 1 },
    ];

    // 🔹 Exibe menu
    if (["!menu", "!ajuda", "menu", "0"].includes(textoUsuario.toLowerCase())) {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      await enviar(menuTexto, botoesMenu);
      return;
    }

    if (!estado.etapa) return;
    iniciarTimeout(idSessao);

    // 🔹 Controle de fluxo das etapas
    switch (estado.etapa) {
      // === MENU PRINCIPAL ===
      case "menu":
        // ➤ Opção 1: Registrar encomenda
        if (["1", "📦 Registrar"].includes(textoUsuario)) {
          estado.etapa = "obterNome";
          await enviar("👤 Qual o nome do destinatário?");
        }

        // ➤ Opção 2: Ver lista de encomendas
        else if (["2", "📋 Ver Encomendas"].includes(textoUsuario)) {
          const { data } = await axios.get(`${URL_API_ENTREGAS}?action=listar`);
          if (!data.length) return await enviar("📭 Nenhuma encomenda registrada.");
          let resposta = "📦 *Encomendas Registradas:*\n\n";
          data.forEach(e => {
            const dataFormatada = formatarDataBR(e.data);
            resposta += `🆔 ${e.ID} - ${e.nome}\n📅 ${dataFormatada} | 🛒 ${e.local}\n📍 Status: ${e.status}\n\n`;
          });
          await enviar(resposta.trim());
          delete estadosUsuarios[idSessao];
        }

        // ➤ Opção 3: Confirmar retirada
        else if (["3", "✅ Confirmar Retirada"].includes(textoUsuario)) {
          estado.etapa = "selecionarEncomenda";
          const { data } = await axios.get(`${URL_API_ENTREGAS}?action=listar`);
          if (!data.length) return await enviar("📭 Nenhuma encomenda para retirada.");

          const botoesEncomendas = data
            .filter(e => e.status === "Aguardando Recebimento")
            .map(e => ({ buttonId: e.ID.toString(), buttonText: { displayText: `${e.ID} - ${e.nome}` }, type: 1 }));

          if (!botoesEncomendas.length) return await enviar("📭 Nenhuma encomenda aguardando retirada.");

          estadosUsuarios[idSessao] = { etapa: "confirmarRecebedor" };
          await enviar("📦 Escolha a encomenda que foi retirada clicando no botão:", botoesEncomendas);
        }

        // ➤ Opção 4: Ver histórico (corrigida)
        else if (["4", "🕓 Ver Histórico"].includes(textoUsuario)) {
          const { data } = await axios.get(`${URL_API_HISTORICO}?action=historico`);
          if (!data || !data.length) return await enviar("📭 O histórico está vazio.");

          // 🔹 Se for array de arrays (planilha), converte em objetos
          const historico = Array.isArray(data[0])
            ? data.slice(1).map((row) => ({
                ID: row[0],
                nome: row[1],
                data: row[2],
                local: row[3],
                status: row[4],
              }))
            : data;

          // 🔹 Mostra 5 registros por mensagem
          let indice = 0;
          while (indice < historico.length) {
            const parte = historico.slice(indice, indice + 5);
            let resposta = "🕓 *Histórico de Encomendas:*\n\n";
            parte.forEach((e) => {
              const dataFormatada = formatarDataBR(e.data);
              resposta += `🆔 ${e.ID} - ${e.nome}\n📦 ${e.local} | ${dataFormatada}\n📍 ${e.status}\n\n`;
            });

            await enviar(resposta.trim());
            indice += 5;

            // Mensagem entre blocos
            if (indice < historico.length) {
              await enviar("⬇️ Mostrando mais registros...");
            }
          }

          delete estadosUsuarios[idSessao];
        }

        // ➤ Opção inválida
        else {
          await enviar("⚠️ Opção inválida. Clique em um botão ou digite 1️⃣, 2️⃣, 3️⃣ ou 4️⃣.");
        }
        break;

      // === ETAPAS DO REGISTRO DE ENCOMENDA ===
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

        // 🔹 Gera ID automaticamente antes de salvar
        const { data: lista } = await axios.get(`${URL_API_ENTREGAS}?action=listar`);
        const novoId = lista.length ? Math.max(...lista.map(e => Number(e.ID) || 0)) + 1 : 1;

        await axios.post(URL_API_ENTREGAS, {
          acao: "adicionar",
          id: novoId,
          nome: estado.nome,
          data: formatarDataBR(estado.data),
          local: estado.local,
          status: "Aguardando Recebimento",
          recebido_por: ""
        });

        await enviar(`✅ Encomenda registrada com sucesso!\n🆔 ${novoId}\n👤 ${estado.nome}\n🗓️ ${formatarDataBR(estado.data)}\n🛒 ${estado.local}\n📍 Status: Aguardando Recebimento`);
        delete estadosUsuarios[idSessao];
        break;

      // === CONFIRMAÇÃO DE RETIRADA ===
      case "confirmarRecebedor":
        estado.id = textoUsuario; // ID do botão clicado
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

      // === ERRO OU ETAPA INVÁLIDA ===
      default:
        await enviar("⚠️ Algo deu errado. Digite *!menu* para recomeçar.");
        delete estadosUsuarios[idSessao];
    }

  } catch (erro) {
    console.error("❌ Erro no módulo Encomendas:", erro.message);
  }
}

module.exports = { tratarMensagemEncomendas };
