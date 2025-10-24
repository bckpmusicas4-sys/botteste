// 📂 lavanderia.js
// --------------------------------------------------
// BOT LAVANDERIA JK UNIVERSITÁRIO 🧺
// Versão: revisada — persistência de estado + env vars
// --------------------------------------------------
// Uso:
// 1) Defina a variável de ambiente HGBR_API_KEY (ex: via .env).
// 2) No startup do bot, importe este módulo e chame:
//      const { tratarMensagemLavanderia, enviarBoasVindas, iniciarAgendamentos } = require('./lavanderia');
//      iniciarAgendamentos(sock); // chama assim que `sock` estiver pronto
// 3) Use tratarMensagemLavanderia(sock, msg) quando mensagens chegarem.
// --------------------------------------------------

const moment = require("moment-timezone");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config(); // para carregar .env se existir

// ----------------------
// Configurações / Constantes
// ----------------------
const TIMEZONE = "America/Sao_Paulo";
const CAMINHO_ESTADO = "./lavanderia.json";
const HGBR_API_KEY = process.env.HGBR_API_KEY || null; // deve ser configurada via env

// ----------------------
// Estado em memória (serializável)
// ----------------------
// Mantemos `estado` serializável (datas em ISO strings ao salvar).
let estado = {
  // filaDeEspera: array de { usuario: '55xxxxx', jid: '55xxxx@s.whatsapp.net' }
  filaDeEspera: [],
  // lavagemAtiva: null ou { usuario: '55xxxxx', jid: '55xxxxx@s.whatsapp.net', inicioISO: '...', fimISO: '...' }
  lavagemAtiva: null,
};

// Variáveis para controlar timeouts em memória (não persistidos)
let avisoTimeout = null;
let fimTimeout = null;

// ----------------------
// Funções de persistência
// ----------------------

// Carrega estado do arquivo (caso exista) — restaura estrutura em `estado`.
function carregarEstado() {
  try {
    if (fs.existsSync(CAMINHO_ESTADO)) {
      const raw = fs.readFileSync(CAMINHO_ESTADO, "utf8");
      const parsed = JSON.parse(raw);
      // Validação mínima
      estado = parsed || { filaDeEspera: [], lavagemAtiva: null };
      console.log("🧾 Estado da lavanderia restaurado com sucesso!");
    }
  } catch (err) {
    console.error("⚠️ Erro ao carregar estado da lavanderia:", err.message);
  }
}

// Salva estado atual no arquivo (JSON)
function salvarEstado() {
  try {
    fs.writeFileSync(CAMINHO_ESTADO, JSON.stringify(estado, null, 2));
  } catch (err) {
    console.error("⚠️ Erro ao salvar estado da lavanderia:", err.message);
  }
}

// Carrega estado ao iniciar o módulo
carregarEstado();

// ----------------------
// Utilitários de tempo e formatação
// ----------------------
function formatarHorario(momentObj) {
  return momentObj.tz(TIMEZONE).format("DD/MM/YYYY HH:mm:ss");
}

function obterSaudacao() {
  const hora = moment.tz(TIMEZONE).hour();
  if (hora >= 6 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

// Converte object.lavagemAtiva (com ISO strings) para objetos moment quando necessário
function obterLavagemAtivaComoMoment() {
  if (!estado.lavagemAtiva) return null;
  try {
    const inicio = moment.tz(estado.lavagemAtiva.inicioISO, TIMEZONE);
    const fim = moment.tz(estado.lavagemAtiva.fimISO, TIMEZONE);
    return { ...estado.lavagemAtiva, inicio, fim };
  } catch (err) {
    return null;
  }
}

// ----------------------
// Função para agendar timeouts (aviso e fim) para a lavagem ativa
// Deve ser chamada sempre que a lavagemAtiva for definida ou quando o bot reiniciar.
// ----------------------
function limparTimeoutsLocais() {
  if (avisoTimeout) {
    clearTimeout(avisoTimeout);
    avisoTimeout = null;
  }
  if (fimTimeout) {
    clearTimeout(fimTimeout);
    fimTimeout = null;
  }
}

/**
 * Agendar aviso e encerramento com base no estado persistido.
 * IMPORTANTE: exige `sock` para enviar mensagens.
 */
function agendarTimeoutsSeNecessario(sock) {
  limparTimeoutsLocais();

  const lavagem = obterLavagemAtivaComoMoment();
  if (!lavagem) return; // nada a agendar

  const agora = moment.tz(TIMEZONE);
  const fim = lavagem.fim;
  const inicio = lavagem.inicio;

  // Se a lavagem já terminou no tempo do reinício, limpamos o estado.
  if (agora.isSameOrAfter(fim)) {
    console.log("ℹ️ Lavagem já passou do horário final (ao restaurar). Limpando estado.");
    estado.lavagemAtiva = null;
    salvarEstado();
    // Não enviamos mensagem automática aqui porque pode ser confuso após reinício.
    return;
  }

  const totalMinutos = Math.ceil(moment.duration(fim.diff(inicio)).asMinutes());
  const avisoMinutosAntes = 10;
  const avisoEmMs = fim.clone().subtract(avisoMinutosAntes, "minutes").diff(agora);
  const fimEmMs = fim.diff(agora);

  // Agendar aviso (se ainda não passou o ponto do aviso)
  if (avisoEmMs > 0) {
    avisoTimeout = setTimeout(async () => {
      try {
        // verifica se ainda existe a mesma lavagem
        const atual = obterLavagemAtivaComoMoment();
        if (!atual) return;
        await sock.sendMessage(atual.jid?.includes("@") ? atual.jid.replace(/@s.whatsapp.net$/, "") + "@s.whatsapp.net" : atual.jid, {
          text: `🔔 @${atual.usuario}, sua lavagem vai finalizar em ${avisoMinutosAntes} minutos.`,
          mentions: atual.jid ? [atual.jid] : [],
        });
      } catch (err) {
        console.error("⚠️ Erro ao enviar aviso de 10 minutos:", err.message);
      }
    }, avisoEmMs);
    console.log(`⏱️ Aviso agendado em ${Math.round(avisoEmMs / 1000)}s`);
  } else {
    // Se o tempo do aviso já passou mas a lavagem ainda não terminou, podemos enviar aviso imediato (opcional).
    // Vamos enviar apenas se ainda não passou mais que X minutos (para evitar spam). Aqui mantemos simples e não enviamos.
    console.log("ℹ️ Ponto do aviso já passou; não será reenviado ao restaurar.");
  }

  // Agendar fim
  fimTimeout = setTimeout(async () => {
    try {
      const atual = obterLavagemAtivaComoMoment();
      if (!atual) return;
      await sock.sendMessage(atual.jid ? atual.jid : atual.jid, {
        text: `✅ @${atual.usuario}, sua lavagem terminou!\n🧺 A máquina agora está livre.`,
        mentions: atual.jid ? [atual.jid] : [],
      });

      // Limpar lavagem e persistir
      estado.lavagemAtiva = null;
      salvarEstado();

      // Se houver fila, notificar próximo
      if (estado.filaDeEspera.length > 0) {
        const proximo = estado.filaDeEspera.shift();
        salvarEstado();
        if (proximo) {
          await sock.sendMessage(proximo.jid, {
            text: `🚨 @${proximo.usuario}, chegou a sua vez de usar a máquina!`,
            mentions: [proximo.jid],
          });
        }
      }
    } catch (err) {
      console.error("⚠️ Erro ao processar fim de lavagem agendado:", err.message);
    }
  }, fimEmMs);

  console.log(`⏱️ Encerramento agendado em ${Math.round(fimEmMs / 1000)}s (total ${totalMinutos} minutos)`);
}

// ----------------------
// Menu principal (mantido igual)
// ----------------------
function obterMenuLavanderia() {
  return (
    "🧺 *MENU LAVANDERIA JK UNIVERSITÁRIO*\n\n" +
    "1️⃣ Dicas de uso 🧼\n" +
    "2️⃣ Info Lavadora ⚙️\n" +
    "3️⃣ Iniciar Lavagem 🚿\n" +
    "4️⃣ Finalizar Lavagem ✅\n" +
    "5️⃣ Entrar na Fila ⏳\n" +
    "6️⃣ Sair da Fila 🚶‍♂️\n" +
    "7️⃣ Sortear Roupas 🎲\n" +
    "8️⃣ Horário de Funcionamento ⏰\n" +
    "9️⃣ Previsão do Tempo 🌦️\n" +
    "🔟 Coleta de Lixo 🗑️\n\n" +
    "Digite o número da opção desejada ou use os comandos:\n" +
    "• *!ping* - Verificar status do bot\n" +
    "• *!ajuda* ou *menu* - Ver este menu\n" +
    "• *!info* - Informações do grupo;"
  );
}

// ----------------------
// Enviar boas-vindas (mantido, com try/catch)
// ----------------------
async function enviarBoasVindas(sock, grupoId, participante) {
  try {
    const numero = participante.split("@")[0];
    const saudacao = obterSaudacao();
    const metadata = await sock.groupMetadata(grupoId);

    const mensagem =
      `👋 ${saudacao}, @${numero}!\n\n` +
      `Seja muito bem-vindo(a) ao grupo *${metadata.subject}* 🧺\n\n` +
      `Aqui você pode gerenciar o uso das máquinas de lavar e ver horários disponíveis.\n\n` +
      `Digite *menu* para ver todas as opções disponíveis.`;

    await sock.sendMessage(grupoId, {
      text: mensagem,
      mentions: [participante],
    });

    console.log(`✅ Boas-vindas enviadas para @${numero}`);
  } catch (err) {
    console.error("❌ Erro ao enviar boas-vindas:", err.message);
  }
}

// ----------------------
// Tratar mensagem principal
// ----------------------
async function tratarMensagemLavanderia(sock, msg) {
  try {
    const grupoId = msg.key.remoteJid;
    const remetente = msg.key.participant || msg.key.remoteJid;
    const numero = remetente.split("@")[0];
    const texto = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      ""
    ).trim().toLowerCase();

    console.log(`🧺 [LAVANDERIA] Mensagem de @${numero}: ${texto}`);

    // ----------------------
    // Menu
    // ----------------------
    if (texto === "menu" || texto === "!ajuda") {
      await sock.sendMessage(grupoId, { text: obterMenuLavanderia() });
      return;
    }

    // ----------------------
    // Opção 1 - Dicas de uso (mantida)
    // ----------------------
    if (texto === "1" || texto.includes("dicas")) {
      const dicas =
`🧼 *DICAS DE USO DA LAVANDERIA*

1️⃣ Separe roupas por cor e tipo de tecido.
2️⃣ Não ultrapasse a capacidade máxima de 8,5kg.
3️⃣ Use a quantidade correta de sabão e amaciante.
4️⃣ Retire roupas imediatamente após o ciclo terminar.
5️⃣ Limpe o filtro da máquina regularmente.
6️⃣ Evite misturar roupas delicadas com pesadas.`;

      await sock.sendMessage(grupoId, { text: dicas });
      return;
    }

    // ----------------------
    // Opção 2 - Info Lavadora (mantida)
    // ----------------------
    if (texto === "2") {
      const mensagens = [
        "🧾 *Informações da Lavadora*\nElectrolux 8,5Kg LT09E\n\n*Especificações*\nCapacidade: 3-10 kg\nConsumo de energia: 0,26 KWh/ciclo\nSistema de lavagem: Agitação\nTipo de abertura: Superior\nPlugue: 10A\nQuantidade de níveis de roupa: 4",
        "*Este Produto inclui*\nÁgua quente: Não\nCesto: Polipropileno\nDispenser para alvejante: Sim\nDispenser para amaciante: Sim\nDispenser para sabão em pó: Sim\nFiltro elimina fiapos: Sim\nInterior de aço inox: Não\nPainel digital: Não\nPainel mecânico: Sim",
        "*Programas de lavagem*\n12 programas\nSistema de lavagem: Agitação\nVisualizador de etapas de lavagem: Sim\nDispenser para sabão líquido: Sim\nTipo de abertura: Superior\nMaterial do cesto: Polipropileno\nMotor direct drive: Não\nFunção lava tênis: Sim\nPrograma preferido: Não",
        "Sensor automático de carga de roupas: Não\nReaproveitamento de água: Sim\nEsterilização: Não\nFunção passa fácil: Não\nPré-lavagem: Não\nPés niveladores: Sim\nControle de temperatura: Não\nSilenciosa: Sim\nAlças laterais: Não",
        "*Funções*\nTurbo Agitação\nTurbo Secagem\nReutilização de Água\nAvança Etapas\nPerfect dilution\nCiclos rápidos: 19 min\nPainel: Mecânico\nProgramas: Pesado/jeans, Tira manchas, Limpeza de cesto, Rápido, Tênis, Edredom, Escuras, Coloridas, Brancas, Cama & banho, Delicado, Normal",
        "*Etapas de lavagem*\nMolho longo, Molho normal, Molho curto, Enxágue, Centrifugação\nProgramas disponíveis: Rápido, Tênis, Edredom, Brancas, Cama & banho, Normal, Super silencioso: Não, Pesado/intenso, Delicado/fitness: Não\nJatos poderosos: Não\nVapor: Não\nControle de molho: Sim",
        "Molho: Sim\nReutilizar água: Sim\nTurbo lavagem: Sim\nCiclo silencioso: Não\nWifi: Não\nIniciar/pausar: Não\nQuantidade de níveis de roupa: 4\nTamanho do edredom: Solteiro",
        "*Especificações técnicas*\nInstalação gratuita: Não\nConteúdo da embalagem: 1 máquina de lavar, 1 guia rápido, 1 curva da mangueira\nGarantia do produto: 1 ano\nEAN-13: 7896584070767 / 7896584070774\nTensão: 127 ou 220V\nCor: Branco",
        "Altura do produto embalado: 105,5 cm\nCapacidade de lavagem: 8,5 kg\nLargura do produto embalado: 57,4 cm\nProfundidade do produto embalado: 63 cm\nEcoPlus: Não\nPeso do produto embalado: 34,3 kg",
      ];

      for (const mensagem of mensagens) {
        await sock.sendMessage(grupoId, { text: mensagem });
        // mantém comportamento original: delay entre blocos para evitar flood
        await new Promise((res) => setTimeout(res, 10000));
      }
      return;
    }

    // ----------------------
    // Opção 3 - Iniciar Lavagem
    // ----------------------
    if (texto === "3" || texto.includes("iniciar")) {
      if (estado.lavagemAtiva) {
        await sock.sendMessage(grupoId, {
          text: `⚠️ A máquina já está em uso por @${estado.lavagemAtiva.usuario}!\n\nDigite *5* para entrar na fila.`,
          mentions: estado.lavagemAtiva.jid ? [estado.lavagemAtiva.jid] : [],
        });
        return;
      }

      const saudacao = obterSaudacao();
      const inicio = moment.tz(TIMEZONE);
      const fim = inicio.clone().add(2, "hours");
      const tempoAvisoAntesDoFim = 10;

      // Persistimos as datas como ISO strings para serializar
      estado.lavagemAtiva = {
        usuario: numero,
        jid: remetente,
        inicioISO: inicio.toISOString(),
        fimISO: fim.toISOString(),
      };
      salvarEstado();

      await sock.sendMessage(grupoId, {
        text: `${saudacao}, @${numero}! 🧺 Sua lavagem foi iniciada às ${formatarHorario(
          inicio
        )}.\n⏱️ Término previsto para ${formatarHorario(fim)}.`,
        mentions: [remetente],
      });

      // Agendar aviso 10 minutos antes e fim automático (no processo atual)
      // Observação: se o processo for reiniciado, chame iniciarAgendamentos(sock) para re-agendar
      // Aviso:
      avisoTimeout = setTimeout(async () => {
        // Verifica segurança: ainda é a mesma lavagem?
        const atual = obterLavagemAtivaComoMoment();
        if (!atual || atual.usuario !== numero) return;
        try {
          await sock.sendMessage(grupoId, {
            text: `🔔 @${numero}, sua lavagem vai finalizar em ${tempoAvisoAntesDoFim} minutos.`,
            mentions: [remetente],
          });
        } catch (err) {
          console.error("⚠️ Erro ao enviar aviso de 10 minutos:", err.message);
        }
      }, (120 - tempoAvisoAntesDoFim) * 60 * 1000);

      // Fim automático:
      fimTimeout = setTimeout(async () => {
        const atual = obterLavagemAtivaComoMoment();
        if (!atual || atual.usuario !== numero) return;
        try {
          await sock.sendMessage(grupoId, {
            text: `✅ @${numero}, sua lavagem terminou!\n🧺 A máquina agora está livre.`,
            mentions: [remetente],
          });
        } catch (err) {
          console.error("⚠️ Erro ao enviar mensagem de fim automático:", err.message);
        }

        // Limpar estado e persistir
        estado.lavagemAtiva = null;
        salvarEstado();

        // Notificar próximo da fila, se houver
        if (estado.filaDeEspera.length > 0) {
          const proximo = estado.filaDeEspera.shift();
          salvarEstado();
          if (proximo) {
            await sock.sendMessage(grupoId, {
              text: `🚨 @${proximo.usuario}, chegou a sua vez de usar a máquina!`,
              mentions: [proximo.jid],
            });
          }
        }
      }, 120 * 60 * 1000);

      return;
    }

    // ----------------------
    // Opção 4 - Finalizar Lavagem
    // ----------------------
    if (texto === "4" || texto.includes("finalizar")) {
      if (!estado.lavagemAtiva) {
        await sock.sendMessage(grupoId, {
          text: "ℹ️ Nenhuma lavagem está ativa no momento.",
        });
        return;
      }

      if (estado.lavagemAtiva.jid !== remetente) {
        await sock.sendMessage(grupoId, {
          text: `⚠️ Apenas @${estado.lavagemAtiva.usuario} pode finalizar esta lavagem.`,
          mentions: estado.lavagemAtiva.jid ? [estado.lavagemAtiva.jid] : [],
        });
        return;
      }

      const fim = moment.tz(TIMEZONE);
      const inicio = moment.tz(estado.lavagemAtiva.inicioISO);
      const duracao = moment.duration(fim.diff(inicio));
      const minutos = Math.floor(duracao.asMinutes());

      await sock.sendMessage(grupoId, {
        text: `✅ *LAVAGEM FINALIZADA*\n\n@${numero} terminou de usar a lavadora!\n⏱️ Duração: ${minutos} minutos\n\n${
          estado.filaDeEspera.length > 0
            ? `Próximo da fila: @${estado.filaDeEspera[0].usuario}`
            : "🟢 Máquina disponível!"
        }`,
        mentions:
          estado.filaDeEspera.length > 0
            ? [remetente, estado.filaDeEspera[0].jid]
            : [remetente],
      });

      // Limpar estado e persistir
      estado.lavagemAtiva = null;
      if (estado.filaDeEspera.length > 0) estado.filaDeEspera.shift();
      salvarEstado();

      // Limpar timeouts locais (caso existam)
      limparTimeoutsLocais();

      return;
    }

    // ----------------------
    // Opção 5 - Entrar na fila
    // ----------------------
    if (texto === "5" || texto.includes("entrar na fila")) {
      if (!estado.lavagemAtiva) {
        await sock.sendMessage(grupoId, { text: "🟢 A máquina está disponível! Use a opção *3* para iniciar." });
        return;
      }

      if (estado.filaDeEspera.find((p) => p.jid === remetente)) {
        await sock.sendMessage(grupoId, { text: `ℹ️ Você já está na fila, @${numero}!`, mentions: [remetente] });
        return;
      }

      estado.filaDeEspera.push({ usuario: numero, jid: remetente });
      salvarEstado();

      await sock.sendMessage(grupoId, {
        text: `⏳ @${numero} entrou na fila!\n📊 Posição: ${estado.filaDeEspera.length}º\n\n*Fila atual:*\n${estado.filaDeEspera.map((p, i) => `${i + 1}. @${p.usuario}`).join("\n")}`,
        mentions: [remetente],
      });
      return;
    }

    // ----------------------
    // Opção 6 - Sair da fila
    // ----------------------
    if (texto === "6" || texto.includes("sair da fila")) {
      const index = estado.filaDeEspera.findIndex((p) => p.jid === remetente);
      if (index === -1) {
        await sock.sendMessage(grupoId, { text: "ℹ️ Você não está na fila." });
        return;
      }

      estado.filaDeEspera.splice(index, 1);
      salvarEstado();

      await sock.sendMessage(grupoId, { text: `🚶‍♂️ @${numero} saiu da fila!`, mentions: [remetente] });
      return;
    }

    // ----------------------
    // --- OPÇÃO 7: SORTEAR ROUPAS ---
  if (texto === "7") {
    const roupas = [
  { nome: "Camiseta", peso: 0.2 },
  { nome: "Regata", peso: 0.15 },
  { nome: "Calça Jeans", peso: 0.6 },
  { nome: "Calça Legging", peso: 0.4 },
  { nome: "Bermuda", peso: 0.3 },
  { nome: "Moletom", peso: 0.8 },
  { nome: "Pijama", peso: 0.6 },
  { nome: "Camisa Social", peso: 0.25 },
  { nome: "Blusa", peso: 0.2 },
  { nome: "Meias", peso: 0.05 },
  { nome: "Roupa Íntima", peso: 0.05 },
  { nome: "Shorts", peso: 0.25 },
  { nome: "Toalha de Rosto", peso: 0.15 },
  { nome: "Toalha de Banho", peso: 0.4 },
  { nome: "Lençol Solteiro", peso: 0.5 },
  { nome: "Lençol Casal", peso: 0.7 },
  { nome: "Fronha", peso: 0.1 },
  { nome: "Blusa de Frio Leve", peso: 0.4 },
  { nome: "Camisa de Manga Longa", peso: 0.3 },
  { nome: "Cachecol", peso: 0.1 },
  { nome: "Luvas", peso: 0.05 }
];


    const pesoMax = 8.0;
    let pesoAtual = 0;
    let selecionadas = [];

    while (pesoAtual < pesoMax) {
      const roupa = roupas[Math.floor(Math.random() * roupas.length)];
      if (pesoAtual + roupa.peso > pesoMax) break;
      selecionadas.push(roupa.nome);
      pesoAtual += roupa.peso;
    }

    const contagem = selecionadas.reduce(
      (a, n) => ((a[n] = (a[n] || 0) + 1), a),
      {}
    );
    const lista = Object.entries(contagem)
      .map(([nome, qtd]) => `- ${qtd}x ${nome}`)
      .join("\n");

    await enviar({
      text: `🧺 Lavagem sorteada (até 8kg):\n${lista}\n\nPeso total: ${pesoAtual.toFixed(
        2
      )}kg`,
    });
    return;
  }

    // ----------------------
    // Opção 8 - Horário de funcionamento
    // ----------------------
    if (texto === "8" || texto.includes("horário") || texto.includes("horario")) {
      const horarios = `⏰ *HORÁRIO DE FUNCIONAMENTO*\n\n🗓️ Todos os dias: 07:00 - 20:00\n\n⚠️ *Aviso Importante:*\nA *última lavagem deve começar até as 20h* para que seja *finalizada até as 22h*, respeitando o horário de silêncio do condomínio. 🕊️\n\n🔕 Evite usar as máquinas após as 22h, em qualquer dia.`;
      await sock.sendMessage(grupoId, { text: horarios });
      return;
    }

    // ----------------------
    // Opção 9 - Previsão do tempo
    // ----------------------
    if (texto === "9" || texto.includes("previsão") || texto.includes("previsao") || texto.includes("tempo")) {
      try {
        if (!HGBR_API_KEY) throw new Error("Chave HGBR_API_KEY não configurada.");
        const { data } = await axios.get(`https://api.hgbrasil.com/weather?key=${HGBR_API_KEY}&city_name=Viamão,RS`);
        const info = data.results;
        let dica = "🧺 Aproveite o dia para lavar suas roupas!";
        const condicao = (info.description || "").toLowerCase();

        if (condicao.includes("chuva") || condicao.includes("tempestade")) dica = "🌧️ Vai chover! Evite estender roupas ao ar livre e use o varal interno.";
        else if (condicao.includes("nublado")) dica = "⛅ Dia nublado. Pode lavar, mas prefira secar em local coberto.";
        else if (condicao.includes("sol")) dica = "☀️ Sol forte! Ótimo dia para secar roupas rapidamente.";
        else if (condicao.includes("neblina")) dica = "🌫️ Neblina presente. O tempo úmido pode atrasar a secagem.";

        const mensagem = `🌦️ *PREVISÃO DO TEMPO - ${info.city}*  
📅 ${info.date}  
🌡️ Temperatura: ${info.temp}°C  
🌤️ Condição: ${info.description}  
💨 Vento: ${info.wind_speedy}  
💧 Umidade: ${info.humidity}%  
🌅 Nascer do Sol: ${info.sunrise}  
🌇 Pôr do Sol: ${info.sunset}  

💡 *Dica:* ${dica}

📍 *Atualizado automaticamente via HGBrasil API*`;

        await sock.sendMessage(grupoId, { text: mensagem });
      } catch (err) {
        console.error("❌ Erro ao obter previsão do tempo:", err.message);
        await sock.sendMessage(grupoId, { text: "⚠️ Não foi possível obter a previsão do tempo no momento. Tente novamente mais tarde." });
      }
      return;
    }

    // ----------------------
    // Opção 10 - Coleta de lixo
    // ----------------------
    if (texto === "10" || texto.includes("lixo") || texto.includes("coleta")) {
      const hoje = moment.tz(TIMEZONE).format("dddd");
      const coleta = `🗑️ *COLETA DE LIXO*\n\n📅 Hoje é *${hoje}*\n\n♻️ *Lixo Reciclável:* Terça, Quinta e Sábado\n🗑️ *Lixo Orgânico e Comum:* Segunda, Quarta e Sexta\n\n⏰ *Horário:* Deixar o lixo até às 19h na área designada.\n\n🔹 *Orientações importantes:*\n- Separe o lixo *reciclável* (papel, plástico, vidro, metal) do *orgânico* (restos de alimentos, cascas, etc.).\n- Mantenha uma *sacola separada apenas para recicláveis*, facilitando o trabalho dos catadores.\n- Sempre *amarre bem as sacolas* antes de colocar para fora.\n- Use preferencialmente:\n  🟦 *Sacos azuis* ou *sacolas brancas de supermercado* → para recicláveis\n  ⬛ *Sacos pretos* → para lixo comum e orgânico\n\n🚮 *Importante:*\nCaso os sacos de lixo estejam na *calçada*, o descarte será feito junto com os demais moradores,\npois a coleta ocorre *a cada 2 dias*. Dessa forma, evitamos acúmulo e mantemos o local limpo e organizado.\n\n💚 *Separar e descartar corretamente ajuda o meio ambiente e facilita o trabalho dos catadores!*`;

      await sock.sendMessage(grupoId, { text: coleta });
      return;
    }

    // Caso nenhuma condição tenha sido atendida, você pode optar por ignorar ou responder algo padrão.
    // Não adicionamos resposta extra para evitar ruído no grupo.
  } catch (err) {
    console.error("❌ Erro ao processar mensagem da lavanderia:", err.message);
    try {
      await sock.sendMessage(msg.key.remoteJid, { text: "❌ Ocorreu um erro ao processar seu comando. Tente novamente." });
    } catch (e) {
      console.error("⚠️ Não foi possível enviar mensagem de erro ao grupo:", e.message);
    }
  }
}

// ----------------------
// Função pública para re-agendar timeouts após reinício.
// Deve ser chamada pela aplicação que inicializa o 'sock'.
// ----------------------
function iniciarAgendamentos(sock) {
  try {
    agendarTimeoutsSeNecessario(sock);
    console.log("🔁 Agendamentos da lavanderia inicializados (se necessário).");
  } catch (err) {
    console.error("⚠️ Erro ao iniciar agendamentos:", err.message);
  }
}

// ----------------------
// Exportações do módulo
// ----------------------
module.exports = {
  tratarMensagemLavanderia,
  enviarBoasVindas,
  iniciarAgendamentos,
};
