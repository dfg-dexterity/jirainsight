// POST /api/resumo — resumo em linguagem natural das atividades de cada pessoa no
// período, gerado por IA (Claude). O front-end envia as MÉTRICAS JÁ AGREGADAS que
// mostra na aba Resumo (horas, faturável, tickets, alterações, transições,
// comentários, criações, cadência diária e meta) — este endpoint só pede ao modelo
// para interpretar e descrever. Nenhum dado do Jira/Clockwork é relido aqui.
//
// Requer a variável de ambiente ANTHROPIC_API_KEY (Vercel). Sem ela, responde
// { ok:false, configurado:false } e o front-end orienta como configurar.
//
// Corpo: { periodo:{label,diasUteis}, equipe:{...}, pessoas:[{id,nome,...}] }
// Resposta: { ok, geral, pessoas:[{id, resumo, sinal}] }
import { json } from './_lib/util.js';
import { sincronizaFolgas } from './_lib/folgaSync.js';

const MODELO = process.env.ANTHROPIC_MODELO || 'claude-opus-4-8';
const MAX_PESSOAS = 25;

function lerBody(req) {
  return new Promise((resolve) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') { try { return resolve(JSON.parse(req.body)); } catch (e) { return resolve({}); } }
      return resolve(req.body);
    }
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const txt = (v, max = 80) => String(v == null ? '' : v).slice(0, max);

// ---------------------------------------------------------------------------
// Folga (compensação de horas extras) — consolidada AQUI por causa do limite de
// 12 Serverless Functions do plano Hobby (esta rota já é a "do servidor" da aba
// Resumo). Acionada por POST /api/resumo?acao=folga: cria um pedido de Time Off
// no Odoo PARA a pessoa, via API externa (JSON-RPC) com uma CONTA DE SERVIÇO.
// Variáveis de ambiente (Vercel): ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY,
// ODOO_FOLGA_TIPO_ID (id numérico OU nome do tipo de ausência, hr.leave.type).
// ---------------------------------------------------------------------------
const env = (k) => (process.env[k] || '').trim();
const isoData = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? s : '';

async function odoo(url, service, method, args) {
  const r = await fetch(url.replace(/\/+$/, '') + '/jsonrpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { service, method, args } }),
  });
  if (!r.ok) throw new Error(`Odoo respondeu HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) {
    const d = j.error.data || {};
    throw new Error(d.message || j.error.message || 'Erro no Odoo');
  }
  return j.result;
}

async function criaFolga(res, b) {
  const url = env('ODOO_URL'), db = env('ODOO_DB'), login = env('ODOO_LOGIN'),
    key = env('ODOO_API_KEY'), tipoCfg = env('ODOO_FOLGA_TIPO_ID');
  if (!url || !db || !login || !key) {
    return json(res, 200, { ok: false, configurado: false,
      erro: 'Integração com o Odoo não configurada. Defina ODOO_URL, ODOO_DB, ODOO_LOGIN e ODOO_API_KEY na Vercel.' });
  }
  if (!tipoCfg) {
    return json(res, 200, { ok: false, configurado: false,
      erro: 'Defina ODOO_FOLGA_TIPO_ID (id ou nome do tipo de ausência) na Vercel.' });
  }

  const email = String(b.email || '').trim().toLowerCase();
  const nome = String(b.nome || '').trim();
  const data = isoData(b.data);
  const modo = ['meio', 'dia', 'horas'].includes(b.modo) ? b.modo : 'meio';
  if (!data) return json(res, 400, { ok: false, erro: 'Data da folga inválida (use AAAA-MM-DD).' });
  if (!email && !nome) return json(res, 400, { ok: false, erro: 'Sem e-mail nem nome para identificar a pessoa.' });

  // 1) Autentica a conta de serviço → uid.
  const uid = await odoo(url, 'common', 'authenticate', [db, login, key, {}]);
  if (!uid) return json(res, 200, { ok: false, erro: 'Falha de autenticação no Odoo (confira ODOO_DB/ODOO_LOGIN/ODOO_API_KEY).' });
  const exec = (model, method, args, kwargs = {}) =>
    odoo(url, 'object', 'execute_kw', [db, uid, key, model, method, args, kwargs]);

  // 2) Resolve o tipo de ausência: id numérico direto ou busca por nome.
  let tipoId = /^\d+$/.test(tipoCfg) ? Number(tipoCfg) : 0;
  if (!tipoId) {
    const tipos = await exec('hr.leave.type', 'search_read', [[['name', 'ilike', tipoCfg]]], { fields: ['id'], limit: 1 });
    if (!tipos.length) return json(res, 200, { ok: false, erro: `Tipo de ausência "${tipoCfg}" não encontrado no Odoo.` });
    tipoId = tipos[0].id;
  }

  // 3) Localiza o funcionário (por e-mail de trabalho; cai para o nome).
  let emps = [];
  if (email) emps = await exec('hr.employee', 'search_read', [[['work_email', '=ilike', email]]], { fields: ['id', 'name'], limit: 1 });
  if (!emps.length && nome) emps = await exec('hr.employee', 'search_read', [[['name', 'ilike', nome]]], { fields: ['id', 'name'], limit: 1 });
  if (!emps.length) return json(res, 200, { ok: false, erro: `Funcionário não encontrado no Odoo (${email || nome}). Confirme o e-mail/nome cadastrado lá.` });
  const empId = emps[0].id;

  // 4) Monta o pedido de ausência (hr.leave).
  const vals = {
    employee_id: empId,
    holiday_status_id: tipoId,
    name: String(b.motivo || '').trim() || 'Compensação de horas extras (painel Insights)',
    request_date_from: data,
    request_date_to: isoData(b.dataFim) || data,
  };
  if (modo === 'meio') {
    vals.request_unit_half = true;
    vals.request_date_to = data;
    vals.request_date_from_period = (b.periodo === 'pm') ? 'pm' : 'am';
  } else if (modo === 'horas') {
    const h = Math.min(8, Math.max(0.5, Number(b.horas) || 1));
    vals.request_unit_hours = true;
    vals.request_date_to = data;
    const ini = 9;                            // janela padrão a partir das 9h
    vals.request_hour_from = String(ini);
    vals.request_hour_to = String(ini + h);
  }

  const id = await exec('hr.leave', 'create', [vals]);
  // 5) Tenta enviar para aprovação (não falha o pedido se o fluxo não permitir).
  try { await exec('hr.leave', 'action_confirm', [[id]]); } catch (e) { /* fica como rascunho */ }

  const link = `${url.replace(/\/+$/, '')}/web#id=${id}&model=hr.leave&view_type=form`;
  return json(res, 200, { ok: true, id, funcionario: emps[0].name, url: link });
}

// Schema da saída (structured outputs): garante JSON válido e do formato esperado.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['geral', 'pessoas'],
  properties: {
    geral: { type: 'string' },
    pessoas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'resumo', 'sinal'],
        properties: {
          id: { type: 'string' },
          resumo: { type: 'string' },
          sinal: { type: 'string', enum: ['positivo', 'neutro', 'atencao'] },
        },
      },
    },
  },
};

const SISTEMA = [
  'Você é um analista de produtividade de um time de TI. Recebe MÉTRICAS já agregadas',
  'de uso do Jira (atividade) e do Clockwork (horas apontadas) de cada pessoa, em um',
  'período. Sua tarefa é escrever um RESUMO claro e objetivo das atividades de cada',
  'pessoa, em português do Brasil.',
  '',
  'Regras:',
  '- Baseie-se EXCLUSIVAMENTE nos números fornecidos. Nunca invente dados, nomes ou fatos.',
  '- Para cada pessoa, escreva 2 a 4 frases cobrindo: a cadência de apontamento (horas no',
  '  período, média por dia útil, dias sem apontar vs. a meta), o volume e o tipo de',
  '  atividade (tickets tocados, alterações, transições/conclusões de status, criações) e',
  '  a colaboração (comentários — sinal de troca com o time). Destaque o que for relevante.',
  '- Classifique cada pessoa em "sinal": "positivo" (em dia com a meta e ativa),',
  '  "neutro" (parcial/mediano) ou "atencao" (apontamento bem abaixo da meta, ou sem',
  '  atividade). Use os números, não suposições.',
  '- Seja construtivo e factual, sem juízo de valor pessoal. Não trate ausência de horas',
  '  como falha se houver indício de ausência/férias; apenas descreva o que os dados mostram.',
  '- "Concluídas" é um total do time (sem atribuição individual) — comente apenas no resumo geral.',
  '- "geral": 2 a 4 frases sobre o time no período (volume de horas, % faturável, tickets',
  '  criados/concluídos, e quem se destacou ou merece atenção).',
  '- Não use markdown pesado; texto corrido. Mantenha cada resumo curto.',
].join('\n');

async function chamaClaude(apiKey, payload) {
  const base = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '');
  const corpo = {
    model: MODELO,
    max_tokens: 8000,
    system: SISTEMA,
    output_config: {
      effort: 'low',                       // tarefa de sumarização: rápida e barata
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [{
      role: 'user',
      content: 'Gere o resumo a partir destes dados (JSON):\n\n' + JSON.stringify(payload),
    }],
  };
  const r = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  if (data.stop_reason === 'refusal') {
    throw new Error('O modelo recusou a solicitação.');
  }
  const bloco = (data.content || []).find((b) => b.type === 'text');
  if (!bloco) throw new Error('Resposta sem conteúdo.');
  return JSON.parse(bloco.text);
}

export default async function handler(req, res) {
  try {
    // Sincronização de folgas aprovadas (Odoo → ticket no Jira + worklog). Aceita GET
    // (cron do GitHub Actions, protegido por CRON_SECRET) — tratada antes do guard de POST.
    if (String((req.query && req.query.acao) || '').trim() === 'folga-sync') return await sincronizaFolgas(req, res);

    if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
    const b = await lerBody(req);

    // Solicitação de folga (compensação de horas extras) — Odoo. Mesma rota por
    // causa do limite de 12 funções; selecionada por ?acao=folga (ou body.acao).
    const acao = String((req.query && req.query.acao) || b.acao || '').trim();
    if (acao === 'folga') return await criaFolga(res, b);

    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      return json(res, 200, {
        ok: false,
        configurado: false,
        erro: 'Resumo por IA não configurado. Defina a variável ANTHROPIC_API_KEY na Vercel.',
      });
    }

    const pessoasIn = Array.isArray(b.pessoas) ? b.pessoas : [];
    if (!pessoasIn.length) return json(res, 400, { erro: 'Sem pessoas para resumir.' });

    // Sanitiza e limita o payload (defesa: o front-end já manda agregado).
    const pessoas = pessoasIn.slice(0, MAX_PESSOAS).map((p) => ({
      id: txt(p.id, 80),
      nome: txt(p.nome, 80),
      horas: num(p.horas),
      faturavelPct: num(p.faturavelPct),
      tickets: num(p.tickets),
      alteracoes: num(p.alteracoes),
      transicoes: num(p.transicoes),
      comentarios: num(p.comentarios),
      criados: num(p.criados),
      diasComApontamento: num(p.diasComApontamento),
      diasUteisEsperados: num(p.diasUteisEsperados),
      metaPct: num(p.metaPct),
    })).filter((p) => p.id);

    const periodo = {
      label: txt((b.periodo && b.periodo.label) || '', 60),
      diasUteis: num(b.periodo && b.periodo.diasUteis),
    };
    const equipe = b.equipe && typeof b.equipe === 'object' ? {
      horasTotais: num(b.equipe.horasTotais),
      faturavelPct: num(b.equipe.faturavelPct),
      ticketsTocados: num(b.equipe.ticketsTocados),
      transicoes: num(b.equipe.transicoes),
      concluidas: num(b.equipe.concluidas),
      criados: num(b.equipe.criados),
      comentarios: num(b.equipe.comentarios),
    } : {};

    const resultado = await chamaClaude(apiKey, { periodo, equipe, pessoas });
    return json(res, 200, {
      ok: true,
      geral: String(resultado.geral || ''),
      pessoas: Array.isArray(resultado.pessoas) ? resultado.pessoas.map((p) => ({
        id: String(p.id || ''),
        resumo: String(p.resumo || ''),
        sinal: ['positivo', 'neutro', 'atencao'].includes(p.sinal) ? p.sinal : 'neutro',
      })) : [],
    });
  } catch (err) {
    return json(res, 200, { ok: false, erro: String(err && err.message ? err.message : err) });
  }
}
