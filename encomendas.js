// === MÓDULO ENCOMENDAS - JK UNIVERSITÁRIO (VERSÃO COMPLETA E REFORÇADA) ===

const axios = require("axios");

const URL_API_ENTREGAS = "https://script.google.com/macros/s/AKfycbwAOD18Un4fe5WytqkTdiaTbDFGZCFdZT0Y1gGgquvFPqOyJrV4qK29UR74wMx7M9ux/exec";
const URL_API_HISTORICO = "https://script.google.com/macros/s/AKfycbwj1pd6zqZFqqDgPqleEAT6ctgUAZCsbMKoXjEdR1OPd9DY6kxL3rDmjYweda7ur_So/exec";
const URL_API_LOG = "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000;

// --- Cache simples para resposta de listar (evita 429) ---
let cacheListar = { ts: 0, data: null };
const CACHE_TTL_MS = 12 * 1000; // 12 segundos - ajuste se quiser

// --- Funções utilitárias ---
function extrairLista(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (obj.data && Array.isArray(obj.data)) return obj.data;
  // Se objeto é retorno do Apps Script com {sucesso:false, erro:...} -> []
  if (obj && obj.sucesso === false) return [];
  return obj || [];
}

function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

function formatarDataBR(data) {
  if (!data) return "";
  // Se já estiver em dd/MM/yyyy, mantém; caso contrário tenta normalizar
  const partsSlash = String(data).split("/");
  if (partsSlash.length === 3) return data;
  // tenta converter de ISO para dd/MM/yyyy
  const d = new Date(data);
  if (isNaN(d)) return data;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function enviarLog(grupo, usuario, mensagem) {
  try {
    const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    // não bloquear fluxo se log falhar (ex: 429)
    await axios.post(URL_API_LOG, { acao: "adicionar", dataHora, grupo, usuario, mensagem }).catch(e => {
      console.warn("Falha ao enviar log (não impede fluxo):", e.response ? e.response.status : e.message);
    });
  } catch (err) {
    console.error("Erro inesperado ao enviar log:", err.message);
  }
}

/* ---------- HTTP helpers com retries/backoff ---------- */

/** GET com cache (somente para listar) */
async function cachedListar(url) {
  const now = Date.now();
  if (cacheListar.data && (now - cacheListar.ts) < CACHE_TTL_MS) {
    return cacheListar.data;
  }
  const r = await axios.get(url);
  cacheListar = { ts: now, data: r.data };
  return r.data;
}

/** POST com retry exponencial simples (3 tentativas) */
async function postWithRetry(url, payload, maxAttempts = 3) {
  let attempt = 0;
  const baseDelay = 600; // ms
  while (attempt < maxAttempts) {
    try {
      const res = await axios.post(url, payload);
      return res;
    } catch (err) {
      attempt++;
      const status = err.response ? err.response.status : null;
      // Se 4xx que não for 429 -> não retry
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw err;
      }
      if (attempt >= maxAttempts) throw err;
      // Exponencial + jitter
      const delay = Math.round(baseDelay * Math.pow(2, attempt - 1) + Math.random() * 200);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/* ---------- Principal: tratar mensagem ---------- */

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

    const enviar = async (mensagem, botoes = []) => {
      if (botoes.length > 0) {
        await sock.sendMessage(remetente, {
          text: mensagem,
          footer: "Pousada JK Universitário",
          templateButtons: botoes.map((b, idx) => ({
            index: idx + 1,
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
          estadosUsuarios[idSessao] = estado;
          return enviar("👤 Nome do destinatário?");
        }
        if (textoUsuario === "2") {
          // usa cache para reduzir chamadas
          const resposta = await cachedListar(`${URL_API_ENTREGAS}?action=listar`);
          const lista = extrairLista(resposta);

          if (lista.length === 0)
            return enviar("📭 Nenhuma encomenda registrada.");

          let txt = "📦 *Encomendas:*\n\n";
          lista.forEach(e => {
            // usa e.ID (conforme cabeçalho)
            txt += `🆔 ${e.ID} - ${e.nome}\n📅 ${formatarDataBR(e.data)}\n📍 ${e.local}\n\n`;
          });

          delete estadosUsuarios[idSessao];
          return enviar(txt);
        }
        if (textoUsuario === "3") {
          const resposta = await cachedListar(`${URL_API_ENTREGAS}?action=listar`);
          const lista = extrairLista(resposta);
          const pendentes = lista.filter(e => (e.status || "").toString().toLowerCase() === "aguardando recebimento");

          if (!pendentes.length)
            return enviar("📭 Nenhuma encomenda aguardando retirada.");

          estado.etapa = "confirmarId";
          estadosUsuarios[idSessao] = estado;
          return enviar("Digite o ID da encomenda para baixa:");
        }
        if (textoUsuario === "4") {
          const resposta = await cachedListar(`${URL_API_HISTORICO}?action=historico`);
          const lista = extrairLista(resposta);

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
        estadosUsuarios[idSessao] = estado;
        return enviar("📅 Data da entrega (dd/mm/aaaa)?");

      case "obterData":
        estado.data = textoUsuario || Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy");
        estado.etapa = "obterLocal";
        estadosUsuarios[idSessao] = estado;
        return enviar("🛒 Local da compra?");

      case "obterLocal":
        estado.local = textoUsuario || "";
        // buscar lista atual (cache é usado internamente)
        const respLista = await cachedListar(`${URL_API_ENTREGAS}?action=listar`);
        const lista = extrairLista(respLista);

        // calcula novo ID com base no campo ID (maiúsculo)
        const novoID = lista.length ? Math.max(...lista.map(i => Number(i.ID))) + 1 : 1;

        // payload envia 'ID' maiúsculo (conforme padronizamos no Apps Script)
        const payload = {
          acao: "adicionar",
          ID: novoID,
          nome: estado.nome,
          data: estado.data,
          local: estado.local,
          status: "Aguardando Recebimento",
          recebido_por: ""
        };

        try {
          await postWithRetry(URL_API_ENTREGAS, payload, 3);
        } catch (e) {
          console.error("Erro ao salvar nova encomenda:", e.response ? e.response.status : e.message);
          return enviar("❌ Erro ao registrar encomenda. Tente novamente mais tarde.");
        }

        delete estadosUsuarios[idSessao];
        // invalida cache para refletir novo registro imediatamente
        cacheListar = { ts: 0, data: null };
        return enviar(`✅ Registrado!\n🆔 ${novoID}`);

      case "confirmarId":
        estado.id = Number(textoUsuario);
        if (!estado.id || Number.isNaN(estado.id)) {
          delete estadosUsuarios[idSessao];
          return enviar("⚠️ ID inválido. Reinicie com *!menu*.");
        }
        estado.etapa = "confirmarRecebedor";
        estadosUsuarios[idSessao] = estado;
        return enviar("✋ Quem retirou?");

      case "confirmarRecebedor":
        const corpoUp = {
          acao: "atualizar",
          ID: estado.id,
          status: "Entregue",
          recebido_por: textoUsuario
        };

        try {
          await postWithRetry(URL_API_ENTREGAS, corpoUp, 3);
          // opcional: mover para histórico via endpoint 'entregar' (se desejar mover)
          // const corpoEntregar = { acao: "entregar", ID: estado.id, recebido_por: textoUsuario };
          // await postWithRetry(URL_API_ENTREGAS, corpoEntregar, 2);

          // limpa cache para atualizar listagens
          cacheListar = { ts: 0, data: null };
        } catch (e) {
          console.error("Erro ao confirmar retirada:", e.response ? e.response.status : e.message);
          delete estadosUsuarios[idSessao];
          return enviar("❌ Erro ao confirmar retirada. Tente novamente mais tarde.");
        }

        delete estadosUsuarios[idSessao];
        return enviar("✅ Baixa realizada com sucesso!");

      default:
        delete estadosUsuarios[idSessao];
        return enviar("⚠️ Reinicie com *0* ou *!menu*.");
    }

  } catch (err) {
    console.error("❌ Erro (tratamento encomendas):", err);
  }
}

module.exports = { tratarMensagemEncomendas };
