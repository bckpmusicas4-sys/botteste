const axios = require("axios");

// === URLs do Google Apps Script ===
const URL_API_ENCOMENDAS =
  "https://script.google.com/macros/s/AKfycbxd-NvEuxFOaF_u-519ajuPtgzStri31HtC0RZVbzSwNLHEaKkWt8O_i_SZCstw-0ha/exec";
const URL_API_HISTORICO =
  "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000; // 10 minutos

function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    console.log(`⌛ Sessão expirada: ${idSessao}`);
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

// === Função principal ===
async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const textoUsuario =
      msg.message.conversation?.trim() ||
      msg.message.extendedTextMessage?.text?.trim() ||
      "";
    const idSessao = remetente;
    const usuario = msg.pushName || "Desconhecido";

    if (!textoUsuario) return;

    const sessaoAtiva = estadosUsuarios[idSessao];

    // === Função de envio ===
    const enviar = async (mensagem, botoes) => {
      if (botoes && botoes.length > 0) {
        await sock.sendMessage(remetente, {
          text: mensagem,
          footer: "Pousada JK Universitário",
          buttons: botoes,
          headerType: 1,
        });
      } else {
        await sock.sendMessage(remetente, { text: mensagem });
      }
    };

    // ============================================================
    // 🔹 COMANDOS ESPECIAIS
    // ============================================================

    if (
      ["!menu", "menu", "!ajuda", "ajuda", "0"].includes(
        textoUsuario.toLowerCase()
      )
    ) {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);

      const botoesMenu = [
        { buttonId: "1", buttonText: { displayText: "📦 Registrar" }, type: 1 },
        { buttonId: "2", buttonText: { displayText: "📋 Ver Encomendas" }, type: 1 },
        { buttonId: "3", buttonText: { displayText: "✅ Confirmar Retirada" }, type: 1 },
        { buttonId: "4", buttonText: { displayText: "🕓 Ver Histórico" }, type: 1 },
      ];

      await enviar(
        "📦 *MENU ENCOMENDAS - JK UNIVERSITÁRIO*\n\n" +
          "Escolha uma das opções abaixo:",
        botoesMenu
      );

      estadosUsuarios[idSessao].etapa = "aguardandoEscolha";
      return;
    }

    // === Comandos rápidos ===
    if (textoUsuario.toLowerCase() === "!ping") {
      return await enviar("🏓 Bot ativo e funcionando!");
    }
    if (textoUsuario.toLowerCase() === "!info") {
      return await enviar(
        "ℹ️ *Pousada JK Universitário*\nSistema de controle de encomendas 📦\n\nDesenvolvido por Iron Maiden 🧠"
      );
    }

    // Se não há sessão ativa, ignora
    if (!sessaoAtiva) return;

    iniciarTimeout(idSessao);
    const estado = estadosUsuarios[idSessao];

    // ============================================================
    // 🔹 ETAPAS DO FLUXO
    // ============================================================
    switch (estado.etapa) {
      case "aguardandoEscolha":
        // 📦 REGISTRAR
        if (["1", "📦 Registrar"].includes(textoUsuario)) {
          estado.etapa = "obterNome";
          await enviar("👤 Qual o nome do morador?");
          return;
        }

        // 📋 VER ENCOMENDAS
        if (["2", "📋 Ver Encomendas"].includes(textoUsuario)) {
          const { data } = await axios.get(`${URL_API_ENCOMENDAS}?action=listar`);
          if (!data || !data.length) {
            await enviar("📭 Nenhuma encomenda registrada ainda.");
          } else {
            let resposta = "📋 *Encomendas Atuais:*\n\n";
            data.forEach((e) => {
              resposta += `🆔 ${e.ID} | ${e.nome} | ${e.local}\n📦 ${e.status}\n\n`;
            });
            await enviar(resposta.trim());
          }
          delete estadosUsuarios[idSessao];
          return;
        }

        // ✅ CONFIRMAR RETIRADA
        if (["3", "✅ Confirmar Retirada"].includes(textoUsuario)) {
          estado.etapa = "confirmarID";
          await enviar("📦 Informe o *ID* da encomenda retirada:");
          return;
        }

        // 🕓 VER HISTÓRICO
        if (["4", "🕓 Ver Histórico"].includes(textoUsuario)) {
          const { data } = await axios.get(`${URL_API_HISTORICO}?action=historico`);
          if (!data || !data.length) {
            await enviar("📭 O histórico está vazio.");
          } else {
            let resposta = "🕓 *Histórico de Encomendas:*\n\n";
            data.slice(-10).forEach((e) => {
              resposta += `🆔 ${e.ID} | ${e.nome} | ${e.local}\n📬 ${e.status}\n\n`;
            });
            await enviar(resposta.trim());
          }
          delete estadosUsuarios[idSessao];
          return;
        }

        await enviar("⚠️ Escolha uma opção válida do menu.");
        break;

      // === Registrar encomenda ===
      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterLocal";
        await enviar("🏬 Onde foi feita a compra?");
        break;

      case "obterLocal":
        estado.local = textoUsuario;
        estado.etapa = "obterData";
        await enviar("📅 Qual a data estimada de entrega? (ex: 25/10/2025)");
        break;

      case "obterData": {
        const partes = textoUsuario.split(/[./-]/);
        if (partes.length !== 3)
          return await enviar("⚠️ Use o formato dia/mês/ano.");
        const [dia, mes, ano] = partes.map((x) => parseInt(x, 10));
        const data = `${String(dia).padStart(2, "0")}/${String(mes).padStart(
          2,
          "0"
        )}/${ano}`;
        estado.data = data;

        await axios.post(URL_API_ENCOMENDAS, {
          acao: "adicionar",
          nome: estado.nome,
          local: estado.local,
          data: estado.data,
        });

        await enviar(
          `✅ Encomenda registrada!\n👤 ${estado.nome}\n🛒 ${estado.local}\n📅 ${estado.data}`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      // === Confirmar retirada ===
      case "confirmarID":
        estado.id = textoUsuario;
        estado.etapa = "confirmarRecebedor";
        await enviar("✋ Quem retirou a encomenda?");
        break;

      case "confirmarRecebedor":
        await axios.post(URL_API_ENCOMENDAS, {
          acao: "atualizar",
          id: estado.id,
          status: "Retirada",
          recebido_por: textoUsuario,
        });
        await enviar(
          `✅ Encomenda ${estado.id} marcada como *Retirada* por ${textoUsuario}.`
        );
        delete estadosUsuarios[idSessao];
        break;

      default:
        await enviar("⚠️ Algo deu errado. Envie *0* para recomeçar.");
        delete estadosUsuarios[idSessao];
    }
  } catch (err) {
    console.error("❌ Erro em tratarMensagemEncomendas:", err.message);
  }
}

module.exports = { tratarMensagemEncomendas };
