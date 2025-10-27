// === MÓDULO ENCOMENDAS - JK UNIVERSITÁRIO (mantido formato original + melhorias) ===

const axios = require("axios");

const URL_API_ENTREGAS = "https://script.google.com/macros/s/AKfycbwAOD18Un4fe5WytqkTdiaTbDFGZCFdZT0Y1gGgquvFPqOyJrV4qK29UR74wMx7M9ux/exec";
const URL_API_HISTORICO = "https://script.google.com/macros/s/AKfycbwj1pd6zqZFqqDgPqleEAT6ctgUAZCsbMKoXjEdR1OPd9DY6kxL3rDmjYweda7ur_So/exec";
const URL_API_LOG = "https://script.google.com/macros/s/AKfycbyGlZrTV048EKeqsj290mj1IZitDMcfUGbjgatVjzT_-hxlowoo1l8yj_WZog3pI_Bo/exec";

let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000;

// cache simples para reduzir 429 em listar
let cacheListar = { ts: 0, data: null };
const CACHE_TTL_MS = 12 * 1000; // 12s

// ----------------- utilitários -----------------
function extrairLista(obj) {
  // suporta vários formatos retornados pelo Apps Script ou por versões antigas
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.dados)) return obj.dados;
  // Caso retorno do Apps Script seja {sucesso:false, erro:...}
  if (obj && obj.sucesso === false) return [];
  // Se vier um objeto com chave principal que é array (fallback)
  for (const k of Object.keys(obj)) {
    if (Array.isArray(obj[k])) return obj[k];
  }
  return [];
}

function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

// Formata datas: se já estiver dd/MM/yyyy, mantém; se for ISO, transforma para dd/MM/yyyy; senão retorna original
function formatarDataBR(data) {
  if (!data) return "";
  const s = String(data).trim();
  // já no formato dd/mm/yyyy?
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  // tenta ISO
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

async function enviarLog(grupo, usuario, mensagem) {
  try {
    const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    // não deixar falha de log interromper o fluxo
    await axios.post(URL_API_LOG, { acao: "adicionar", dataHora, grupo, usuario, mensagem }).catch(() => {});
  } catch (err) {
    console.error("Erro ao enviar log:", err.message);
  }
}

// -------- HTTP helpers: cache e retry --------
async function cachedListar(url) {
  const now = Date.now();
  if (cacheListar.data && (now - cacheListar.ts) < CACHE_TTL_MS) {
    return cacheListar.data;
  }
  const r = await axios.get(url);
  cacheListar = { ts: now, data: r.data };
  return r.data;
}

async function postWithRetry(url, payload, maxAttempts = 3) {
  let attempt = 0;
  const baseDelay = 600;
  while (attempt < maxAttempts) {
    try {
      const res = await axios.post(url, payload);
      return res;
    } catch (err) {
      attempt++;
      const status = err.response ? err.response.status : null;
      // se erro 4xx (exceto 429) não faz retry
      if (status && status >= 400 && status < 500 && status !== 429) throw err;
      if (attempt >= maxAttempts) throw err;
      const delay = Math.round(baseDelay * Math.pow(2, attempt - 1) + Math.random() * 200);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ----------------- principal -----------------
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

    // manter envio formatado com footer e templateButtons como antes
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

    // menu exatamente do jeito que você pediu
    const menuTexto =
      "📦 *ENCOMENDAS*\n\n" +
      "Escolha uma das opções:\n" +
      "1️⃣ Registrar Encomenda 📦\n" +
      "2️⃣ Ver Encomendas 📋\n" +
      "3️⃣ Confirmar Retirada ✅\n" +
      "4️⃣ Ver Histórico 🕓";

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
          const resposta = await cachedListar(`${URL_API_ENTREGAS}?action=listar`);
          const lista = extrairLista(resposta);

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
        // se usuário não informou, grava vazio (mantive comportamento original)
        estado.data = textoUsuario;
        estado.etapa = "obterLocal";
        estadosUsuarios[idSessao] = estado;
        return enviar("🛒 Local da compra?");

      case "obterLocal":
        estado.local = textoUsuario;

        // buscar lista atual (usa cache para evitar 429)
        const respLista = await cachedListar(`${URL_API_ENTREGAS}?action=listar`);
        const lista = extrairLista(respLista);

        // quem gera ID é o bot (campo ID maiúsculo)
        const novoID = lista.length ? Math.max(...lista.map(i => Number(i.ID))) + 1 : 1;

        // envia payload com chave ID (maiúscula) para o Apps Script
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
        // invalidar cache para refletir novo registro
        cacheListar = { ts: 0, data: null };
        return enviar(`✅ Registrado!\n🆔 ${novoID}`);

      case "confirmarId":
        estado.id = Number(textoUsuario);
        estado.etapa = "confirmarRecebedor";
        estadosUsuarios[idSessao] = estado;
        return enviar("✋ Quem retirou?");

      case "confirmarRecebedor":
        // enviar atualização com chave ID (maiúscula)
        await postWithRetry(URL_API_ENTREGAS, {
          acao: "atualizar",
          ID: Number(estado.id),
          status: "Entregue",
          recebido_por: textoUsuario
        }).catch(err => {
          console.error("Erro ao confirmar retirada:", err.response ? err.response.status : err.message);
          // limpa estado e avisa
          delete estadosUsuarios[idSessao];
          cacheListar = { ts: 0, data: null };
        });

        delete estadosUsuarios[idSessao];
        cacheListar = { ts: 0, data: null };
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
