const axios = require("axios");
const moment = require("moment-timezone");

// === URLs das planilhas (Apps Script) ===
const URL_SHEETDB_ENCOMENDAS =
  process.env.SHEETDB_ENCOMENDAS ||
  "https://script.google.com/macros/s/AKfycbxd-NvEuxFOaF_u-519ajuPtgzStri31HtC0RZVbzSwNLHEaKkWt8O_i_SZCstw-0ha/exec";

const URL_SHEETDB_HISTORICO =
  process.env.SHEETDB_HISTORICO ||
  "https://script.google.com/macros/s/AKfycbwj1pd6zqZFqqDgPqleEAT6ctgUAZCsbMKoXjEdR1OPd9DY6kxL3rDmjYweda7ur_So/exec";

const URL_SHEETDB_LOG =
  process.env.SHEETDB_LOG ||
  "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

// === Controle de sessões e timeout ===
let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000;

function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    console.log(`⌛ Sessão expirada: ${idSessao}`);
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

// === Função para enviar mensagem e registrar no log ===
async function enviarMensagem(sock, destinatario, mensagem) {
  const conteudo = typeof mensagem === "string" ? { text: mensagem } : mensagem;
  await sock.sendMessage(destinatario, conteudo);

  try {
    await axios.post(URL_SHEETDB_LOG, [
      {
        usuario: "BOT",
        mensagem: conteudo.text || JSON.stringify(conteudo),
        origem: "bot",
        dataHora: moment().tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm:ss"),
      },
    ]);
  } catch (err) {
    console.error("⚠️ Erro ao salvar log do BOT:", err.message);
  }
}

// === Menu ===
async function exibirMenu(sock, destinatario) {
  const menuMensagem = `
📦 *MENU ENCOMENDAS - JK UNIVERSITÁRIO*

1️⃣ Registrar Encomenda 📦
2️⃣ Ver Encomendas 📋
3️⃣ Confirmar Retirada ✅
4️⃣ Ver Histórico 🕓

Digite o número da opção desejada ou use os comandos:
• *!ping* - Verificar status do bot
• *!ajuda* ou *menu* - Ver este menu
• *!info* - Informações do grupo
`;
  await enviarMensagem(sock, destinatario, menuMensagem);
}

// === Função principal ===
async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const textoUsuario =
      (msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        "").trim();
    const idSessao = remetente + "_" + (msg.key.participant || "");
    const usuario = msg.pushName || "Desconhecido";

    // === Log do usuário ===
    if (!msg.key.fromMe && textoUsuario) {
      try {
        await axios.post(URL_SHEETDB_LOG, [
          {
            usuario,
            mensagem: textoUsuario,
            origem: "usuário",
            dataHora: moment().tz("America/Sao_Paulo").format("DD/MM/YYYY HH:mm:ss"),
          },
        ]);
      } catch (err) {
        console.error("⚠️ Erro ao salvar log do usuário:", err.message);
      }
    }

    // === Inicialização ===
    if (textoUsuario === "0") {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      await enviarMensagem(
        sock,
        remetente,
        "⚙️ A forma de acessar o módulo de encomendas mudou!\nAgora digite: *menu*"
      );
      return;
    }

    const sessaoAtiva = estadosUsuarios[idSessao];
    if (!sessaoAtiva && !["menu", "!ajuda"].includes(textoUsuario.toLowerCase()))
      return;

    iniciarTimeout(idSessao);

    if (
      textoUsuario.toLowerCase() === "menu" ||
      textoUsuario.toLowerCase() === "!ajuda"
    ) {
      estadosUsuarios[idSessao] = { etapa: "aguardandoEscolha" };
      await exibirMenu(sock, remetente);
      return;
    }

    const estado = estadosUsuarios[idSessao];
    const escolha = parseInt(textoUsuario, 10);

    switch (estado.etapa) {
      case "aguardandoEscolha":
        if (escolha === 1) {
          estado.etapa = "obterNome";
          await enviarMensagem(sock, remetente, "Qual o seu nome?");
        } else if (escolha === 2) {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
          const lista = Array.isArray(data) ? data : data.data || [];
          if (!lista.length)
            return await enviarMensagem(sock, remetente, "📭 Nenhuma encomenda registrada.");

          const agrupado = {};
          lista.forEach((e) => {
            const nome = (e.nome || "Desconhecido").toLowerCase();
            if (!agrupado[nome]) agrupado[nome] = [];
            agrupado[nome].push(e);
          });

          let listaMensagem = "📦 *Encomendas registradas:*\n\n";
          for (const [nome, encomendas] of Object.entries(agrupado)) {
            listaMensagem += `👤 ${nome}\n`;
            encomendas.forEach((enc) => {
              const dataFmt = enc.data
                ? moment(enc.data).tz("America/Sao_Paulo").format("DD/MM/YYYY")
                : "";
              listaMensagem += `🆔 ${enc.ID} 🛒 ${enc.local} — ${dataFmt}\n📍 Status: ${enc.status}`;
              if (enc.recebido_por)
                listaMensagem += `\n📬 Recebido por: ${enc.recebido_por}`;
              listaMensagem += "\n\n";
            });
          }

          await enviarMensagem(sock, remetente, listaMensagem.trim());
          delete estadosUsuarios[idSessao];
        } else if (escolha === 3) {
          estado.etapa = "informarID";
          await enviarMensagem(
            sock,
            remetente,
            "📦 Qual o ID da encomenda que deseja confirmar?"
          );
        } else if (escolha === 4) {
          const { data: historicoRaw } = await axios.get(URL_SHEETDB_HISTORICO);
          const historico = Array.isArray(historicoRaw)
            ? historicoRaw
            : historicoRaw.data || [];

          if (!historico.length)
            return await enviarMensagem(sock, remetente, "📭 Nenhum registro no histórico.");

          const blocos = [];
          for (let i = 0; i < historico.length; i += 5)
            blocos.push(historico.slice(i, i + 5));

          for (const bloco of blocos) {
            if (!Array.isArray(bloco)) continue;
            let msgHist = "📜 Histórico de Encomendas:\n\n";
            bloco.forEach((e) => {
              const dataRegistro = e.dataRegistro || e.dataHora || "";
              const dataFmt = dataRegistro
                ? moment(dataRegistro).tz("America/Sao_Paulo").format("DD/MM/YYYY")
                : "";
              msgHist += `🆔 ${e.ID} 🛒 ${e.local}\n👤 ${e.usuario}\n📍 Status: ${e.status}`;
              if (e.recebido_por)
                msgHist += `\n📬 Recebido por: ${e.recebido_por}`;
              msgHist += `\n📅 Data: ${dataFmt}\n\n`;
            });
            await enviarMensagem(sock, remetente, msgHist.trim());
          }
          delete estadosUsuarios[idSessao];
        } else {
          await enviarMensagem(
            sock,
            remetente,
            "❌ Opção inválida. Escolha 1, 2, 3 ou 4."
          );
        }
        break;

      case "informarID": {
        const idUsuario = parseInt(textoUsuario, 10);
        if (isNaN(idUsuario)) {
          await enviarMensagem(
            sock,
            remetente,
            "❌ ID inválido. Digite um número ou 0 para voltar ao menu."
          );
          return;
        }

        const { data: raw } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const lista = Array.isArray(raw) ? raw : raw.data || [];

        const encomenda = lista.find((e) => parseInt(e.ID, 10) === idUsuario);
        if (!encomenda || encomenda.status !== "Aguardando Recebimento") {
          await enviarMensagem(
            sock,
            remetente,
            "❌ ID inválido ou encomenda já recebida. Digite Menu para retornar ao menu."
          );
          delete estadosUsuarios[idSessao];
          return;
        }

        estado.encomendaSelecionada = encomenda;
        estado.etapa = "confirmarRecebedor";
        await enviarMensagem(sock, remetente, "✋ Quem está recebendo essa encomenda?");
        break;
      }

      case "confirmarRecebedor": {
        const recebidoPor = textoUsuario;
        const enc = estado.encomendaSelecionada;

        // ✅ Corrigido: trocado de PATCH → POST
        await axios.post(URL_SHEETDB_ENCOMENDAS, {
          acao: "atualizar",
          id: enc.ID,
          status: "Recebida",
          recebido_por: recebidoPor,
        });

        const dataFmt = enc.data
          ? moment(enc.data).tz("America/Sao_Paulo").format("DD/MM/YYYY")
          : "";
        await enviarMensagem(
          sock,
          remetente,
          `✅ Recebimento registrado!\n📦 ${enc.nome} — ${enc.local} em ${dataFmt}\n📬 Recebido por: ${recebidoPor}`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      default:
        await enviarMensagem(
          sock,
          remetente,
          "⚠️ Algo deu errado. Envie 'Menu' para recomeçar."
        );
        delete estadosUsuarios[idSessao];
    }
  } catch (error) {
    console.error("❌ Erro no tratarMensagemEncomendas:", error);
  }
}

module.exports = { tratarMensagemEncomendas };
