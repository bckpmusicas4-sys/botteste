// === MÓDULO ENCOMENDAS - JK UNIVERSITÁRIO (VERSÃO SUPER COMPLETA) ===

const axios = require("axios");

const URL_API_ENTREGAS = "https://script.google.com/macros/s/AKfycbwAOD18Un4fe5WytqkTdiaTbDFGZCFdZT0Y1gGgquvFPqOyJrV4qK29UR74wMx7M9ux/exec";
const URL_API_HISTORICO = "https://script.google.com/macros/s/AKfycbwj1pd6zqZFqqDgPqleEAT6ctgUAZCsbMKoXjEdR1OPd9DY6kxL3rDmjYweda7ur_So/exec";
const URL_API_LOG = "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

// --- Estados temporários por usuário ---
let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000;

// --- Cache simples para reduzir erro 429 ---
let cacheListar = { ts: 0, data: null };
const CACHE_TTL_MS = 12 * 1000;

// === Funções auxiliares ===
function extrairLista(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj.dados)) return obj.dados;
  if (Array.isArray(obj.data)) return obj.data;
  return [];
}

function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

function formatarDataBR(data) {
  const d = new Date(data);
  if (isNaN(d)) return data;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function enviarLog(grupo, usuario, mensagem) {
  const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await axios.post(URL_API_LOG, {
    acao: "adicionar",
    dataHora,
    grupo,
    usuario,
    mensagem
  }).catch(()=>{});
}

async function cachedListar(url) {
  const now = Date.now();
  if (cacheListar.data && now - cacheListar.ts < CACHE_TTL_MS) {
    return cacheListar.data;
  }
  const r = await axios.get(url);
  cacheListar = { ts: now, data: r.data };
  return r.data;
}

async function postWithRetry(url, data) {
  let tentativas = 0;
  while (tentativas < 3) {
    try {
      return await axios.post(url, data);
    } catch(e) {
      tentativas++;
      const status = e.response?.status;
      if (tentativas >= 3) throw e;
      if (status >= 400 && status < 500 && status !== 429) throw e;
      await new Promise(r => setTimeout(r, 500 * tentativas));
    }
  }
}

// === PROCESSAMENTO PRINCIPAL ===
async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.key.fromMe) return;

    const remetente = msg.key.remoteJid;
    const grupo = remetente.includes("@g.us") ? "Grupo" : "Privado";
    const usuario = msg.pushName || "Desconhecido";

    const textoUsuario =
      msg.message.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.buttonsResponseMessage?.selectedButtonId ||
      msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      "";

    if (textoUsuario) enviarLog(grupo, usuario, textoUsuario);

    const idSessao = remetente;
    const estado = estadosUsuarios[idSessao] ?? {};

    const enviar = (t) => sock.sendMessage(remetente, { text: t });

    if (["0", "!menu", "menu"].includes(textoUsuario.toLowerCase())) {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      return enviar(
        "📦 *MENU ENCOMENDAS*\n\n" +
        "1️⃣ Registrar Encomenda\n" +
        "2️⃣ Ver Encomendas\n" +
        "3️⃣ Confirmar Retirada\n" +
        "4️⃣ Histórico\n"
      );
    }

    if (!estado.etapa) return;

    iniciarTimeout(idSessao);

    switch(estado.etapa) {

      case "menu":
        if (textoUsuario === "1") {
          estado.etapa = "obterNome";
          estadosUsuarios[idSessao] = estado;
          return enviar("👤 Quem irá retirar?");
        }

        if (textoUsuario === "2") {
          const dados = await cachedListar(`${URL_API_ENTREGAS}?action=listar`);
          const lista = extrairLista(dados);

          if (!lista.length) return enviar("📭 Sem encomendas pendentes.");

          const txt = "📦 *Aguardando Retirada:*\n\n" +
            lista.map(e => `🆔 ${e.ID} • ${e.nome}\n📅 ${formatarDataBR(e.data)}\n📍 ${e.local}\n`).join("\n");

          return enviar(txt);
        }

        if (textoUsuario === "3") {
          const dados = await cachedListar(`${URL_API_ENTREGAS}?action=listar`);
          const lista = extrairLista(dados);

          if (!lista.length) return enviar("✅ Nenhuma encomenda pendente!");

          estado.etapa = "confirmarId";
          estadosUsuarios[idSessao] = estado;
          return enviar("Digite o *ID* da encomenda:");
        }

        if (textoUsuario === "4") {
          const dados = await cachedListar(`${URL_API_HISTORICO}?action=historico`);
          const lista = extrairLista(dados);

          if (!lista.length) return enviar("Histórico vazio 📭");

          const txt = "📜 *Histórico Completo*\n\n" +
            lista.map(e =>
              `🆔 ${e.ID} • ${e.nome}\n📅 ${formatarDataBR(e.data)}\n✅ Recebido: ${e.recebido_por || "N/I"}\n`
            ).join("\n");

          return enviar(txt);
        }

        return enviar("Opção inválida ❌");

      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        estadosUsuarios[idSessao] = estado;
        return enviar("📅 Data da compra (dd/mm/aaaa)");

      case "obterData":
        estado.data = textoUsuario;
        estado.etapa = "obterLocal";
        estadosUsuarios[idSessao] = estado;
        return enviar("📍 Local da compra?");

      case "obterLocal":
        estado.local = textoUsuario;

        const dados = await cachedListar(`${URL_API_ENTREGAS}?action=listar`);
        const lista = extrairLista(dados);

        const novoID = lista.length ? Math.max(...lista.map(e => Number(e.ID))) + 1 : 1;

        await postWithRetry(URL_API_ENTREGAS, {
          acao: "adicionar",
          ID: novoID,
          nome: estado.nome,
          data: estado.data,
          local: estado.local,
          status: "Aguardando Recebimento",
          recebido_por: ""
        });

        delete estadosUsuarios[idSessao];
        cacheListar = { ts: 0, data: null };
        return enviar(`✅ Registrado! ID: *${novoID}*`);

      case "confirmarId":
        estado.id = Number(textoUsuario);
        if (!estado.id) {
          delete estadosUsuarios[idSessao];
          return enviar("ID inválido ❌ Reinicie com *!menu*");
        }
        estado.etapa = "confirmarRecebedor";
        estadosUsuarios[idSessao] = estado;
        return enviar("👤 Quem retirou?");

      case "confirmarRecebedor":
        await postWithRetry(URL_API_ENTREGAS, {
          acao: "atualizar",
          ID: estado.id,
          status: "Entregue",
          recebido_por: textoUsuario
        });

        delete estadosUsuarios[idSessao];
        cacheListar = { ts: 0, data: null };
        return enviar("✅ Baixa concluída!");

      default:
        delete estadosUsuarios[idSessao];
        return enviar("Erro. Digite *!menu*");
    }

  } catch(e) {
    console.error("Erro encomendas:", e);
  }
}

module.exports = { tratarMensagemEncomendas };
