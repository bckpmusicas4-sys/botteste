const axios = require("axios");

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

let estadosUsuarios = {};
let timeoutUsuarios = {};

const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000; // 10 minutos

// === Função para limpar sessões inativas ===
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
    if (!msg.message || msg.key.fromMe || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const textoUsuario =
      msg.message.conversation?.toLowerCase().trim() ||
      msg.message.extendedTextMessage?.text?.toLowerCase().trim() ||
      "";

    const idSessao = remetente + "_" + (msg.key.participant || "");
    const escolha = parseInt(textoUsuario, 10);

    const enviar = async (mensagem) => {
      await sock.sendMessage(
        remetente,
        typeof mensagem === "string" ? { text: mensagem } : mensagem
      );
    };

    const sessaoAtiva = estadosUsuarios[idSessao];
    if (!sessaoAtiva && textoUsuario !== "0") return;

    // === MENU PRINCIPAL ===
    if (textoUsuario === "0") {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      await enviar("🔐 *Módulo de Encomendas Iniciado!*");
      await enviar(
        "Escolha uma opção:\n\n1️⃣ Registrar Encomenda\n2️⃣ Ver Encomendas\n3️⃣ Confirmar Recebimento (via ID)\n4️⃣ Ver Histórico de Encomendas"
      );
      estadosUsuarios[idSessao].etapa = "aguardandoEscolha";
      return;
    }

    iniciarTimeout(idSessao);
    const estado = estadosUsuarios[idSessao];

    switch (estado.etapa) {
      // === Escolha do Menu ===
      case "aguardandoEscolha":
        if (escolha === 1) {
          estado.etapa = "obterNome";
          await enviar("👤 Qual o seu nome?");
        } else if (escolha === 2) {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);

          if (!data?.length) {
            await enviar("📭 Nenhuma encomenda registrada até o momento.");
            delete estadosUsuarios[idSessao];
            return;
          }

          const agrupado = {};
          for (const e of data) {
            const nome = e.nome?.toLowerCase().trim() || "desconhecido";
            if (!agrupado[nome]) agrupado[nome] = [];
            agrupado[nome].push(e);
          }

          let resposta = "📦 *Encomendas registradas:*\n\n";
          for (const [nome, encomendas] of Object.entries(agrupado)) {
            resposta += `👤 ${nome}\n`;
            for (const e of encomendas) {
              resposta += `🆔 ${e.id} 🛒 ${e.local} — ${e.data}\n📍 Status: ${e.status}`;
              if (e.recebido_por)
                resposta += `\n📬 Recebido por: ${e.recebido_por}`;
              resposta += "\n\n";
            }
          }

          await enviar(resposta.trim());
          delete estadosUsuarios[idSessao];
        } else if (escolha === 3) {
          estado.etapa = "informarID";
          await enviar("📦 Qual o *ID da encomenda* que deseja confirmar?");
        } else if (escolha === 4) {
          const { data: historico } = await axios.get(URL_SHEETDB_HISTORICO);

          const preenchidos = historico.filter((linha) =>
            Object.values(linha).some(
              (valor) => valor?.toString().trim() !== ""
            )
          );

          if (!preenchidos.length) {
            await enviar("📭 O histórico está vazio.");
            delete estadosUsuarios[idSessao];
            return;
          }

          for (let i = 0; i < preenchidos.length; i += 5) {
            const bloco = preenchidos.slice(i, i + 5);
            let mensagem = "📜 *Histórico de Encomendas:*\n\n";
            for (const e of bloco) {
              mensagem += `🆔 ${e.id} 🛒 ${e.local} — ${e.data}\n👤 ${e.nome}\n📍 Status: ${e.status}`;
              if (e.recebido_por)
                mensagem += `\n📬 Recebido por: ${e.recebido_por}`;
              mensagem += "\n\n";
            }
            await enviar(mensagem.trim());
          }

          delete estadosUsuarios[idSessao];
        } else {
          await enviar("❌ Opção inválida. Escolha 1, 2, 3 ou 4.");
        }
        break;

      // === Fluxo de registro ===
      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        await enviar("📅 Qual a data estimada de entrega? (Ex: 10/11/2025)");
        break;

      case "obterData": {
        const partes = textoUsuario.split(/[./-]/);
        if (partes.length !== 3)
          return await enviar("⚠️ Formato inválido. Use dia/mês/ano.");

        let [dia, mes, ano] = partes.map((p) => parseInt(p, 10));
        if (ano < 100) ano += 2000;
        const dataObj = new Date(ano, mes - 1, dia);
        if (isNaN(dataObj.getTime())) {
          return await enviar("⚠️ Data inválida, tente novamente.");
        }

        estado.data = `${String(dia).padStart(2, "0")}/${String(mes).padStart(
          2,
          "0"
        )}/${ano}`;
        estado.etapa = "obterLocal";
        await enviar("🏬 Onde a compra foi realizada? (Ex: Shopee, Mercado Livre)");
        break;
      }

      case "obterLocal": {
        estado.local = textoUsuario;
        const { data: todas } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const ids = todas
          .map((e) => parseInt(e.id, 10))
          .filter((i) => !isNaN(i));
        const proximoId = (Math.max(0, ...ids) + 1).toString();

        await axios.post(URL_SHEETDB_ENCOMENDAS, [
          {
            id: proximoId,
            nome: estado.nome,
            data: estado.data,
            local: estado.local,
            status: "Aguardando Recebimento",
          },
        ]);

        await enviar(
          `✅ Encomenda registrada com sucesso!\n👤 ${estado.nome}\n🆔 ID: ${proximoId}\n🗓️ Chegada: ${estado.data}\n🛒 Loja: ${estado.local}`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      // === Confirmação de recebimento ===
      case "informarID": {
        estado.idConfirmar = textoUsuario;
        const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const encomenda = data.find((e) => e.id === estado.idConfirmar);

        if (!encomenda || encomenda.status !== "Aguardando Recebimento") {
          await enviar(
            "❌ ID inválido ou encomenda já recebida.\nVolte ao menu digitando 0."
          );
          delete estadosUsuarios[idSessao];
          return;
        }

        estado.encomendaSelecionada = encomenda;
        estado.etapa = "confirmarRecebedor";
        await enviar("✋ Quem está recebendo essa encomenda?");
        break;
      }

      case "confirmarRecebedor": {
        const recebidoPor = textoUsuario;
        const enc = estado.encomendaSelecionada;

        await axios.patch(`${URL_SHEETDB_ENCOMENDAS}/id/${enc.id}`, {
          status: "Recebida",
          recebido_por: recebidoPor,
        });

        await enviar(
          `✅ Recebimento confirmado!\n🆔 ${enc.id}\n📦 ${enc.nome} — ${enc.local}\n📬 Recebido por: ${recebidoPor}`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      default:
        await enviar("⚠️ Algo deu errado. Envie '0' para recomeçar.");
        delete estadosUsuarios[idSessao];
    }
  } catch (error) {
    console.error("❌ Erro no tratarMensagemEncomendas:", error);
  }
}

module.exports = { tratarMensagemEncomendas };
