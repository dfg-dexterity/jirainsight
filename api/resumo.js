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
import { json, jiraSearchAll, cacheGet, cacheSetTTL, worklogsEnriquecidos, configCompartilhada, feriadosBR } from './_lib/util.js';
import { sincronizaFolgas } from './_lib/folgaSync.js';
import { chamaClaude } from './_lib/ia.js';

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

// Schema/sistema do resumo de atividades + cliente Claude: em ./_lib/ia.js
// (compartilhados com /api/teams, que envia o resumo agendado ao canal).

// ---------------------------------------------------------------------------
// Análise de QUALIDADE dos tickets vs. as boas práticas TI-04-006 (Notion).
// A rubrica é lida AO VIVO da página pública (o link pode ser atualizado a
// qualquer momento); se a página não puder ser lida, usa um snapshot local.
// Consolidada aqui pelo limite de 12 Serverless Functions.
// ---------------------------------------------------------------------------
const QUALIDADE_URL_PADRAO = 'https://dexterityitsolutions.notion.site/TI-04-006-Boas-Praticas-de-Cria-o-de-itens-do-Ticket-do-JIRA-2c7c69371e17803a9650c3e391599385';
const MAX_TICKETS_Q = 30;
// Snapshot condensado da TI-04-006 (fallback) — 13 princípios.
const RUBRICA_LOCAL = [
  'TI-04-006 — Boas práticas de criação de itens/tickets do Jira (Dexterity):',
  'P1. Um ticket = um objetivo claro: descrever O QUE fazer, o motivo e o critério de aceite; nada de "ver isso"/"alinhar", sem contexto, múltiplos objetivos ou ticket como chat.',
  'P2. Não apontar horas em Histórias: criar subtarefas para execução e apontar nelas; História é agrupador lógico.',
  'P3. Todo ticket tem dono: um único responsável principal definido (nunca em branco, nunca "equipe", troca formal registrada).',
  'P4. Status reflete a realidade: To Do = não começou; In Progress = execução ativa; Blocked = impedimento real; Done = concluído e validado. Não manipular status.',
  'P5. Atualização contínua: registrar início, bloqueios e conclusões; nada de ticket parado sem comentário ou comentários genéricos ("seguindo").',
  'P6. Tipo correto de item: Rotina p/ recorrente, Tarefa p/ entregável, História p/ agrupamento, Épico p/ grandes frentes.',
  'P7. Status usado corretamente: mudar só com mudança real; Blocked para dependência externa; encerrar só com aceite cumprido.',
  'P8. Nenhuma tarefa acumula mais de 8h consecutivas: quebrar em partes menores/subtarefas; não usar tarefa como "container de horas" por dias.',
  'P9. Ticket representa entrega, não intenção: precisa de entregável verificável; nada de "pensar sobre", genérico ou lembrete pessoal.',
  'P10. Reuniões/atividades administrativas têm procedimento próprio: não misturar reunião com tarefa técnica nem horas administrativas em tarefas de entrega.',
  'P11. Não deixar itens abertos só para apontar horas: fechar ao concluir; trabalho de vários dias vira subtarefas por dia/etapa/entrega.',
  'P12. Data limite = data REAL prevista de entrega (baseline): o campo de vencimento deve existir e refletir a realidade.',
  'P13. Ticket como fonte central de informação: links para todos os arquivos/evidências relevantes no ticket (não só no Teams/e-mail).',
  'Bugs: tipo Bug com comportamento atual, esperado, passos de reprodução, ambiente e evidências; título específico; um problema por bug; vincular ao ticket relacionado.',
].join('\n');

// Busca uma página PUBLICADA do Notion (notion.site) e devolve o texto puro, ou ''
// quando a página não pode ser lida / vem "vazia" (não publicada, bloqueio, rede).
async function paginaNotionTexto(url, minLen) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; jirainsight)', Accept: 'text/html' } });
    if (!r.ok) return '';
    const html = await r.text();
    const t = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ').trim();
    // Página publicada do Notion vem renderizada no HTML; se vier "vazia", cai no snapshot.
    return t.length > (minLen || 1200) ? t.slice(0, 24000) : '';
  } catch (e) { return ''; }
}

async function rubricaBoasPraticas() {
  const ck = 'qualidade:rubrica';
  const c = cacheGet(ck);
  if (c) return c;
  const url = (process.env.QUALIDADE_URL || QUALIDADE_URL_PADRAO).trim();
  const t = await paginaNotionTexto(url, 1200);
  if (t) return cacheSetTTL(ck, { texto: t, fonte: 'notion', url }, 30);
  return cacheSetTTL(ck, { texto: RUBRICA_LOCAL, fonte: 'local', url }, 30);
}

// ADF (descrição do Jira v3) -> texto simples.
function adfTexto(n, out) {
  if (!n) return '';
  out = out || [];
  if (Array.isArray(n)) { n.forEach((x) => adfTexto(x, out)); return out.join(''); }
  if (n.type === 'text') out.push(n.text || '');
  if (n.type === 'hardBreak' || n.type === 'paragraph') out.push('\n');
  if (n.content) adfTexto(n.content, out);
  return out.join('');
}

const SCHEMA_Q = {
  type: 'object',
  properties: {
    geral: { type: 'string' },
    tickets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          k: { type: 'string' },
          nota: { type: 'number' },
          sinal: { type: 'string', enum: ['bom', 'atencao', 'critico'] },
          problemas: {
            type: 'array',
            items: { type: 'object', properties: { principio: { type: 'string' }, detalhe: { type: 'string' } }, required: ['principio', 'detalhe'], additionalProperties: false },
          },
          acoes: {
            type: 'array',
            items: { type: 'object', properties: { tipo: { type: 'string', enum: ['comentar', 'vencimento', 'atribuir', 'status', 'dividir', 'editar'] }, rotulo: { type: 'string' }, texto: { type: 'string' } }, required: ['tipo', 'rotulo'], additionalProperties: false },
          },
        },
        required: ['k', 'nota', 'sinal', 'problemas', 'acoes'],
        additionalProperties: false,
      },
    },
  },
  required: ['geral', 'tickets'],
  additionalProperties: false,
};

const SISTEMA_Q = [
  'Você é um auditor de qualidade de tickets do Jira da Dexterity IT. Recebe a RUBRICA',
  '(as boas práticas oficiais TI-04-006, texto extraído do Notion) e uma lista de TICKETS',
  'criados recentemente (com descrição, tipo, responsável, vencimento, horas apontadas e',
  'nº de subtarefas). Avalie CADA ticket contra a rubrica, em português do Brasil.',
  '',
  'Para cada ticket devolva:',
  '- nota: 0 a 100 (aderência às boas práticas; 100 = exemplar).',
  '- sinal: "bom" (>=80), "atencao" (50–79) ou "critico" (<50).',
  '- problemas: SÓ os princípios violados (máx. 4, os mais graves primeiro), cada um com o',
  '  nº/nome curto do princípio (ex.: "P1 — objetivo claro") e um detalhe ESPECÍFICO deste',
  '  ticket (cite o que falta ou está errado; nunca genérico).',
  '- acoes: 1 a 3 ações práticas para o dono corrigir, escolhendo o tipo mais adequado:',
  '  "comentar" (inclua em texto um comentário pronto, construtivo e educado, citando as boas',
  '  práticas e pedindo a correção — será postado no ticket), "vencimento" (falta/errada a',
  '  data limite), "atribuir" (sem responsável), "status" (status não reflete a realidade),',
  '  "dividir" (mais de 8h acumuladas / vários objetivos → sugerir subtarefas) ou "editar"',
  '  (resumo/descrição precisam ser reescritos; em texto sugira o novo resumo/descrição).',
  '- Ticket bom (nota >= 80): problemas=[] e uma única ação "comentar" só se houver algo',
  '  pequeno a melhorar; senão acoes=[].',
  '',
  'Regras: baseie-se APENAS nos dados fornecidos; não invente campos que não recebeu.',
  'Descrição vazia/curta demais para o tipo é violação do P1. Horas apontadas em item de',
  'tipo História violam o P2. Sem responsável viola o P3. Sem vencimento viola o P12.',
  'Mais de 8h apontadas num ticket sem subtarefas sugere P8/P11.',
  'Em "geral", escreva 2 a 3 frases sobre o padrão do lote (principais problemas recorrentes).',
].join('\n');

async function analisaQualidade(res, b, apiKey) {
  const dias = Math.min(60, Math.max(1, Number(b.dias) || 14));
  const projeto = String(b.projeto || '').trim().toUpperCase();
  if (projeto && !/^[A-Z][A-Z0-9_]*$/.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
  const ck = `qualidade:analise:${dias}:${projeto || '*'}`;
  const c = cacheGet(ck);
  if (c && !b.nocache) return json(res, 200, c);

  const rubrica = await rubricaBoasPraticas();
  const jql = `created >= -${dias}d${projeto ? ` AND project = ${projeto}` : ''} ORDER BY created DESC`;
  const { issues } = await jiraSearchAll({
    jql,
    fields: ['summary', 'description', 'issuetype', 'status', 'assignee', 'duedate', 'created', 'reporter', 'priority', 'labels', 'timespent', 'subtasks', 'parent', 'project'],
    pageSize: MAX_TICKETS_Q, maxPages: 1,
  });
  if (!issues.length) return json(res, 200, { ok: true, tickets: [], geral: 'Nenhum ticket criado no período.', fonte: rubrica.fonte, url: rubrica.url, dias, projeto });

  const dados = issues.slice(0, MAX_TICKETS_Q).map((it) => {
    const f = it.fields || {};
    return {
      k: it.key,
      projeto: (f.project && f.project.key) || '',
      tipo: (f.issuetype && f.issuetype.name) || '',
      resumo: String(f.summary || '').slice(0, 255),
      descricao: adfTexto(f.description).replace(/\s+/g, ' ').trim().slice(0, 900),
      status: (f.status && f.status.name) || '',
      responsavel: (f.assignee && f.assignee.displayName) || '',
      respId: (f.assignee && f.assignee.accountId) || '',
      relator: (f.reporter && f.reporter.displayName) || '',
      relatorId: (f.reporter && f.reporter.accountId) || '',
      vencimento: f.duedate || '',
      criadoEm: String(f.created || '').slice(0, 10),
      prioridade: (f.priority && f.priority.name) || '',
      labels: Array.isArray(f.labels) ? f.labels.slice(0, 8) : [],
      horasApontadas: Math.round(((Number(f.timespent) || 0) / 3600) * 10) / 10,
      nSubtarefas: Array.isArray(f.subtasks) ? f.subtasks.length : 0,
      temPai: !!f.parent,
    };
  });

  const prompt = 'RUBRICA (boas práticas TI-04-006):\n\n' + rubrica.texto
    + '\n\n---\n\nTICKETS PARA AUDITAR (JSON):\n\n' + JSON.stringify(dados);
  const resultado = await chamaClaude(apiKey, null, { system: SISTEMA_Q, schema: SCHEMA_Q, prompt });

  const porK = {}; (resultado.tickets || []).forEach((t) => { porK[String(t.k || '')] = t; });
  const tickets = dados.map((d) => {
    const a = porK[d.k] || { nota: 0, sinal: 'atencao', problemas: [], acoes: [] };
    return {
      ...d,
      nota: Math.max(0, Math.min(100, Math.round(Number(a.nota) || 0))),
      sinal: ['bom', 'atencao', 'critico'].includes(a.sinal) ? a.sinal : 'atencao',
      problemas: (Array.isArray(a.problemas) ? a.problemas : []).slice(0, 4).map((p) => ({ principio: txt(p.principio, 60), detalhe: txt(p.detalhe, 400) })),
      acoes: (Array.isArray(a.acoes) ? a.acoes : []).slice(0, 3).map((x) => ({
        tipo: ['comentar', 'vencimento', 'atribuir', 'status', 'dividir', 'editar'].includes(x.tipo) ? x.tipo : 'comentar',
        rotulo: txt(x.rotulo, 80), texto: txt(x.texto, 1500),
      })),
    };
  });
  const out = { ok: true, geral: String(resultado.geral || ''), tickets, fonte: rubrica.fonte, url: rubrica.url, dias, projeto, quando: new Date().toISOString() };
  return json(res, 200, cacheSetTTL(ck, out, 10));
}

// ---------------------------------------------------------------------------
// 🕵️ AUDITORIA DE TICKETS — validações diárias de apontamentos (TI-04-014).
// A pessoa é escolhida no painel; o servidor junta os apontamentos do período
// (Clockwork, de TODO o time — para saber quem mais apontou nas reuniões), os
// detalhes dos tickets envolvidos (Jira) e o planejamento de alocação (config
// compartilhada), e a IA aplica as REGRAS LIDAS AO VIVO da página TI-04-014
// (env AUDITORIA_URL; fallback: snapshot local das regras).
// ---------------------------------------------------------------------------
const AUDITORIA_URL_PADRAO = 'https://dexterityitsolutions.notion.site/TI-04-014-Valida-es-di-rias-de-apontamentos-398c69371e1780bd9688e046fbd53e61';
const MAX_TICKETS_AUD = 45;
const RUBRICA_AUD_LOCAL = [
  'TI-04-014 — Validações diárias de apontamentos (Dexterity):',
  'REUNIÕES:',
  'R1. Toda reunião deve ter sido criada pela AUTOMAÇÃO. Reunião criada manualmente por uma pessoa indica erro do robô — abrir ticket no Jira avisando do erro.',
  'R2. Reunião deve ter MAIS DE UMA pessoa apontando horas. Se só uma pessoa apontou, é preciso convidar os demais participantes para apontar.',
  'R3. Reunião de CLIENTE deve estar no projeto do cliente. Reunião de cliente ativo parada em projeto administrativo/interno está no projeto errado (reclassificar).',
  'R4. Reunião com horas apontadas e vencimento atrasado há mais de 1 dia deve estar CONCLUÍDA. Reunião atrasada e ainda aberta precisa ser concluída.',
  'R5. Não pode existir ticket de outro tipo (Tarefa etc.) que na prática é uma reunião (resumo/descrição de reunião) — deve ser do tipo Reunião.',
  'APONTAMENTOS DA PESSOA:',
  'A1. O número de apontamentos por dia trabalhado deve ser MAIOR que 1. Um único apontamento no dia indica que a pessoa lançou o dia inteiro numa só tarefa — incorreto (detalhar o dia por atividade).',
  'A2. Os apontamentos devem estar nos projetos corretos, coerentes com a alocação planejada da pessoa.',
  'PLANEJADO × REALIZADO:',
  'P1. As horas realizadas por projeto devem seguir o planejamento de alocação da pessoa no período; desvios grandes (projeto planejado sem horas, ou muitas horas fora do planejado) devem ser apontados.',
].join('\n');

async function rubricaAuditoria() {
  const ck = 'auditoria:rubrica';
  const c = cacheGet(ck);
  if (c) return c;
  const url = (process.env.AUDITORIA_URL || AUDITORIA_URL_PADRAO).trim();
  const t = await paginaNotionTexto(url, 700);
  if (t) return cacheSetTTL(ck, { texto: t, fonte: 'notion', url }, 30);
  return cacheSetTTL(ck, { texto: RUBRICA_AUD_LOCAL, fonte: 'local', url }, 30);
}

const SCHEMA_AUD = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo', 'corretos', 'incorretos', 'acoes'],
  properties: {
    resumo: { type: 'string' },
    corretos: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['titulo', 'detalhe'], properties: { titulo: { type: 'string' }, detalhe: { type: 'string' } } },
    },
    incorretos: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['regra', 'detalhe', 'gravidade', 'tickets'],
        properties: {
          regra: { type: 'string' }, detalhe: { type: 'string' },
          gravidade: { type: 'string', enum: ['atencao', 'critico'] },
          tickets: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    acoes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['tipo', 'rotulo'],
        properties: {
          tipo: { type: 'string', enum: ['comentar', 'vencimento', 'status', 'convidar', 'reclassificar', 'criar', 'outro'] },
          rotulo: { type: 'string' }, texto: { type: 'string' }, ticket: { type: 'string' },
        },
      },
    },
  },
};

const SISTEMA_AUD = [
  'Você é um auditor de apontamentos de horas da Dexterity IT. Recebe a RUBRICA (as',
  'validações diárias oficiais TI-04-014, texto extraído do Notion) e os DADOS de UMA',
  'pessoa num período: apontamentos por dia, reuniões em que ela apontou (participantes',
  'que apontaram, criador, projeto/categoria, status, vencimento e atraso), demais tickets',
  'apontados e o planejamento de alocação (planejado × realizado por projeto).',
  'Aplique CADA regra da rubrica aos dados, em português do Brasil.',
  '',
  'Regras:',
  '- Baseie-se EXCLUSIVAMENTE nos dados fornecidos; nunca invente tickets, números ou nomes.',
  '- "resumo": 2 a 4 frases com o balanço da pessoa no período (o que vai bem e o que precisa de ajuste).',
  '- "corretos": o que está EM CONFORMIDADE com a rubrica — título curto + detalhe factual com números.',
  '- "incorretos": cada não conformidade com a regra violada (nome curto da regra), o detalhe',
  '  COM NÚMEROS/DATAS, a gravidade ("critico" para violação clara/recorrente; "atencao" para',
  '  pontual ou dúvida) e as chaves dos tickets envolvidos (apenas chaves presentes nos dados).',
  '- "acoes": ações CONCRETAS para ajustar, uma por problema quando possível — tipo "comentar"',
  '  (avisar no ticket), "vencimento" (reprogramar), "status" (concluir/mover), "convidar" (chamar',
  '  os participantes para apontar na reunião), "reclassificar" (mover de projeto/tipo), "criar"',
  '  (abrir ticket novo, ex.: avisar erro da automação) ou "outro". Preencha "ticket" quando a',
  '  ação é sobre um ticket específico e "texto" com a mensagem/instrução sugerida, pronta para uso.',
  '- Sábados, domingos, os FERIADOS listados nos dados e os períodos de ausência informados NÃO contam como dia sem apontamento.',
  '- Se os dados não permitirem avaliar uma regra, simplesmente não a liste em "incorretos".',
].join('\n');

const spDiaAud = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d || new Date());
const somaDiasAud = (s, n) => { const t = new Date(`${s}T12:00:00-03:00`); t.setUTCDate(t.getUTCDate() + n); return spDiaAud(t); };

async function auditaApontamentos(res, b, apiKey) {
  const accountId = String(b.accountId || '').trim();
  if (!accountId || !/^[\w:-]{5,128}$/.test(accountId)) return json(res, 400, { erro: 'Escolha a pessoa a auditar (accountId inválido).' });
  const dias = Math.min(31, Math.max(1, Number(b.dias) || 7));
  const ck = `auditoria:${accountId}:${dias}`;
  const c = cacheGet(ck);
  if (c && !b.nocache) return json(res, 200, c);

  const ate = spDiaAud();
  const de = somaDiasAud(ate, -(dias - 1));
  const [rubrica, enr, cfg] = await Promise.all([
    rubricaAuditoria(),
    worklogsEnriquecidos(de, ate),
    configCompartilhada({ metaGlobalH: 8, metasPessoa: {}, ausencias: [], alocacoes: [] }),
  ]);

  const wl = enr.worklogs.filter((w) => w.a === accountId);
  const nome = txt(b.nome || (enr.pessoas[accountId] && enr.pessoas[accountId].nome) || accountId, 80);
  const ausencias = (cfg.ausencias || []).filter((x) => x && x.a === accountId && !(x.ate < de || x.de > ate))
    .map((x) => ({ de: x.de, ate: x.ate }));
  // Feriados nacionais dentro do período (não contam como dia sem apontamento).
  const feriados = [];
  for (let d = de, g = 0; d <= ate && g < 40; d = somaDiasAud(d, 1), g += 1) {
    if (feriadosBR(+d.slice(0, 4)).has(d)) feriados.push(d);
  }
  if (!wl.length) {
    // Ausência cadastrada no período explica a falta de horas — não é violação clara.
    const temAus = ausencias.length > 0;
    const ausTxt = ausencias.map((x) => `${x.de} → ${x.ate}`).join(', ');
    const out = {
      ok: true, pessoa: { id: accountId, nome }, de, ate, dias, fonte: rubrica.fonte, url: rubrica.url,
      resumo: `Sem apontamentos de ${nome} no período (${de} → ${ate}).${temAus ? ` Há ausência cadastrada (${ausTxt}), o que pode explicar.` : ''}`,
      corretos: [],
      incorretos: [{
        regra: 'Apontamentos diários',
        detalhe: `Nenhuma hora apontada entre ${de} e ${ate}.${temAus ? ` Ausência cadastrada: ${ausTxt}.` : ''}`,
        gravidade: temAus ? 'atencao' : 'critico', tickets: [],
      }],
      acoes: [{ tipo: 'outro', rotulo: 'Verificar com a pessoa e reforçar o apontamento diário', texto: `Nenhum apontamento de ${nome} entre ${de} e ${ate}. ${temAus ? `Há ausência cadastrada (${ausTxt}) — confirmar se cobre todo o período.` : 'Confirmar se houve férias/ausência; se não, reforçar o apontamento diário no Clockwork.'}`, ticket: '' }],
      stats: { horas: 0, apontamentos: 0, diasComApontamento: 0, reunioes: 0, tickets: 0 },
      quando: new Date().toISOString(),
    };
    return json(res, 200, cacheSetTTL(ck, out, 10));
  }

  const ehReuniao = (t) => /reuni/i.test(String(t || ''));

  // Por dia: nº de apontamentos, tickets distintos e horas (regra "mais de 1 por dia").
  const porDiaMap = {};
  wl.forEach((w) => {
    const d = String(w.d || '').slice(0, 10); if (!d) return;
    const r = porDiaMap[d] || (porDiaMap[d] = { d, apontamentos: 0, tickets: new Set(), horas: 0 });
    r.apontamentos += 1; if (w.k) r.tickets.add(w.k); r.horas += w.s;
  });
  const porDia = Object.values(porDiaMap).sort((a, b2) => (a.d < b2.d ? -1 : 1))
    .map((r) => ({ dia: r.d, apontamentos: r.apontamentos, ticketsDistintos: r.tickets.size, horas: +(r.horas / 3600).toFixed(1) }));

  // Reuniões em que a pessoa apontou + quem MAIS apontou nelas (todo o time, no período).
  const chavesPessoa = [...new Set(wl.map((w) => w.k).filter(Boolean))];
  const reunioesKeys = new Set(wl.filter((w) => ehReuniao(w.t)).map((w) => w.k).filter(Boolean));
  const partPorK = {}; const totalPorK = {};
  enr.worklogs.forEach((w) => {
    if (!w.k || !reunioesKeys.has(w.k)) return;
    (partPorK[w.k] = partPorK[w.k] || new Set()).add(w.a);
    totalPorK[w.k] = (totalPorK[w.k] || 0) + w.s;
  });
  const horasDe = {}; wl.forEach((w) => { if (w.k) horasDe[w.k] = (horasDe[w.k] || 0) + w.s; });

  // Corte único e consistente em MAX_TICKETS_AUD: reuniões primeiro (são o foco das
  // regras), depois os demais por horas — detalhes do Jira e payload usam o MESMO corte.
  const chaves = [...chavesPessoa]
    .sort((a, b2) => ((reunioesKeys.has(b2) ? 1 : 0) - (reunioesKeys.has(a) ? 1 : 0)) || ((horasDe[b2] || 0) - (horasDe[a] || 0)))
    .slice(0, MAX_TICKETS_AUD);
  const ticketsForaDoCorte = chavesPessoa.length - chaves.length;
  const detalhes = {};
  if (chaves.length) {
    const { issues } = await jiraSearchAll({
      jql: `key in (${chaves.join(',')})`,
      fields: ['summary', 'description', 'issuetype', 'status', 'duedate', 'resolutiondate', 'reporter', 'created', 'project', 'assignee'],
      pageSize: 100, maxPages: 1,
    });
    issues.forEach((it) => {
      const f = it.fields || {};
      detalhes[it.key] = {
        resumo: String(f.summary || '').slice(0, 200),
        descTrecho: adfTexto(f.description).replace(/\s+/g, ' ').trim().slice(0, 260),
        tipo: (f.issuetype && f.issuetype.name) || '',
        status: (f.status && f.status.name) || '',
        concluido: !!f.resolutiondate || String((f.status && f.status.statusCategory && f.status.statusCategory.key) || '') === 'done',
        vencimento: f.duedate || '',
        criadoPor: (f.reporter && f.reporter.displayName) || '',
        criadoEm: String(f.created || '').slice(0, 10),
        responsavel: (f.assignee && f.assignee.displayName) || '',
        projeto: (f.project && f.project.key) || '',
        projetoNome: (f.project && f.project.name) || '',
        categoria: (f.project && f.project.projectCategory && f.project.projectCategory.name) || 'Sem categoria',
      };
    });
  }

  const reunioes = chaves.filter((k) => reunioesKeys.has(k)).map((k) => {
    const dt = detalhes[k] || {};
    const atrasoDias = (dt.vencimento && dt.vencimento < ate)
      ? Math.round((new Date(ate) - new Date(dt.vencimento)) / 86400000) : 0;
    return {
      k, resumo: dt.resumo || enr.resumos[k] || '', projeto: dt.projeto || '', projetoNome: dt.projetoNome || '',
      categoria: dt.categoria || '', tipo: dt.tipo || 'Reunião', status: dt.status || '', concluida: !!dt.concluido,
      vencimento: dt.vencimento || '', atrasoDias, criadoPor: dt.criadoPor || '', criadoEm: dt.criadoEm || '',
      participantesQueApontaram: (partPorK[k] ? partPorK[k].size : 1),
      horasDaPessoa: +((horasDe[k] || 0) / 3600).toFixed(1),
      horasTotais: +(((totalPorK[k] || 0)) / 3600).toFixed(1),
    };
  });
  const tarefas = chaves.filter((k) => !reunioesKeys.has(k)).map((k) => {
    const dt = detalhes[k] || {};
    return {
      k, resumo: dt.resumo || enr.resumos[k] || '', projeto: dt.projeto || '', categoria: dt.categoria || '',
      tipo: dt.tipo || '', status: dt.status || '', concluida: !!dt.concluido, vencimento: dt.vencimento || '',
      descTrecho: dt.descTrecho || '', horasDaPessoa: +((horasDe[k] || 0) / 3600).toFixed(1),
    };
  });

  // Planejado × realizado por projeto (alocações da config compartilhada, pró-rata no
  // período). Espelha o painel: linhas só contam com inicio E fim válidos (AAAA-MM-DD),
  // e alocações legadas guardavam % (pct) em vez de hSemana — mesma migração do front.
  const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
  const overlapSemanas = (a) => {
    if (!RE_DATA.test(a.inicio || '') || !RE_DATA.test(a.fim || '')) return 0;
    const ini = a.inicio > de ? a.inicio : de;
    const fim = a.fim < ate ? a.fim : ate;
    if (ini > fim) return 0;
    return Math.max(0, (new Date(fim) - new Date(ini)) / 86400000 + 1) / 7;
  };
  const hSemanaDe = (a) => (a.hSemana != null ? (Number(a.hSemana) || 0)
    : (a.pct != null ? Math.round((Number(a.pct) || 0) / 100 * 40) : 0));
  const planejado = {};
  (cfg.alocacoes || []).filter((a) => a && a.accountId === accountId && a.projeto).forEach((a) => {
    const h = hSemanaDe(a) * overlapSemanas(a);
    if (h > 0) planejado[a.projeto] = +((planejado[a.projeto] || 0) + h).toFixed(1);
  });
  const realizadoSeg = {};
  wl.forEach((w) => { realizadoSeg[w.p] = (realizadoSeg[w.p] || 0) + w.s; });
  const realizado = {};
  Object.keys(realizadoSeg).forEach((p) => { realizado[p] = +(realizadoSeg[p] / 3600).toFixed(1); });

  const metaHDia = Math.max(0, Number((cfg.metasPessoa || {})[accountId] != null ? cfg.metasPessoa[accountId] : cfg.metaGlobalH) || 0);

  const payload = {
    pessoa: { id: accountId, nome },
    periodo: {
      de, ate, dias,
      observacao: 'sábados, domingos, os feriados listados e as ausências não contam como dia de trabalho'
        + (ticketsForaDoCorte > 0 ? `; ${ticketsForaDoCorte} ticket(s) com poucas horas ficaram fora da amostra` : ''),
    },
    metaHorasPorDiaUtil: metaHDia,
    feriados,
    ausencias,
    apontamentosPorDia: porDia,
    reunioes,
    tarefas,
    alocacao: { planejadoHorasPorProjeto: planejado, realizadoHorasPorProjeto: realizado },
  };
  const prompt = 'RUBRICA (validações diárias TI-04-014):\n\n' + rubrica.texto
    + '\n\n---\n\nDADOS DA PESSOA PARA AUDITAR (JSON):\n\n' + JSON.stringify(payload);
  const resultado = await chamaClaude(apiKey, null, { system: SISTEMA_AUD, schema: SCHEMA_AUD, prompt });

  const chavesOk = new Set(chavesPessoa);
  const TIPOS_ACAO = ['comentar', 'vencimento', 'status', 'convidar', 'reclassificar', 'criar', 'outro'];
  const out = {
    ok: true, pessoa: { id: accountId, nome }, de, ate, dias, fonte: rubrica.fonte, url: rubrica.url,
    resumo: txt(resultado.resumo, 1200),
    corretos: (Array.isArray(resultado.corretos) ? resultado.corretos : []).slice(0, 10)
      .map((x) => ({ titulo: txt(x.titulo, 90), detalhe: txt(x.detalhe, 400) })),
    incorretos: (Array.isArray(resultado.incorretos) ? resultado.incorretos : []).slice(0, 12)
      .map((x) => ({
        regra: txt(x.regra, 90), detalhe: txt(x.detalhe, 500),
        gravidade: x.gravidade === 'critico' ? 'critico' : 'atencao',
        tickets: (Array.isArray(x.tickets) ? x.tickets : []).map(String).filter((k) => chavesOk.has(k)).slice(0, 8),
      })),
    acoes: (Array.isArray(resultado.acoes) ? resultado.acoes : []).slice(0, 12)
      .map((x) => ({
        tipo: TIPOS_ACAO.includes(x.tipo) ? x.tipo : 'outro',
        rotulo: txt(x.rotulo, 90), texto: txt(x.texto, 1500),
        ticket: chavesOk.has(String(x.ticket || '')) ? String(x.ticket) : '',
      })),
    stats: {
      horas: +((wl.reduce((s, w) => s + w.s, 0)) / 3600).toFixed(1),
      apontamentos: wl.length, diasComApontamento: porDia.length,
      reunioes: reunioes.length, tickets: chavesPessoa.length,
    },
    quando: new Date().toISOString(),
  };
  return json(res, 200, cacheSetTTL(ck, out, 10));
}

// ---------------------------------------------------------------------------
// 📍 MEU DIA — timetracking assistido: a ponte (scripts/meudia-activitywatch.mjs)
// envia os BLOCOS de atividade do Mac (app + título de janela + duração) e a IA
// sugere, para cada bloco, ONDE apontar (ticket recente) ou ONDE criar o ticket
// (caminho da árvore). Os blocos ficam na tabela de config compartilhada, numa
// linha por pessoa (id = meudia_<accountId>), substituídos a cada envio.
// ---------------------------------------------------------------------------
const MAX_BLOCOS = 80;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

async function jiraMyself(email, token) {
  const base = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '') || 'https://dexterityit.atlassian.net';
  const r = await fetch(`${base}/rest/api/3/myself`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'), Accept: 'application/json' },
  });
  if (r.status === 401 || r.status === 403) return { ok: false, erro: 'Credenciais inválidas — confira o e-mail e o token.' };
  if (!r.ok) return { ok: false, erro: `Jira ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const me = await r.json();
  return { ok: true, accountId: me.accountId || '', nome: me.displayName || '', email: me.emailAddress || '' };
}

function sbMeuDia() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// POST ?acao=meudia-ingest { email, token, dia, blocos:[{inicio,fim,app,titulo,seg}] }
async function meuDiaIngest(res, b) {
  const s = sbMeuDia();
  if (!s) return json(res, 200, { ok: false, erro: 'O Meu dia exige a configuração compartilhada (Supabase).' });
  const email = String(b.email || '').trim();
  const token = String(b.token || '').trim();
  if (!email || !token) return json(res, 400, { ok: false, erro: 'Informe email e token de API do Jira (os mesmos do painel).' });
  const me = await jiraMyself(email, token);
  if (!me.ok) return json(res, 200, { ok: false, erro: me.erro });

  const dia = RE_DIA.test(String(b.dia || '')) ? String(b.dia) : '';
  if (!dia) return json(res, 400, { ok: false, erro: 'Dia inválido (use AAAA-MM-DD).' });
  const blocos = (Array.isArray(b.blocos) ? b.blocos : []).slice(0, MAX_BLOCOS).map((x) => ({
    inicio: txt(x && x.inicio, 5),          // HH:MM
    fim: txt(x && x.fim, 5),
    app: txt(x && x.app, 60),
    titulo: txt(x && x.titulo, 140),
    seg: Math.max(0, Math.min(24 * 3600, Math.round(Number(x && x.seg) || 0))),
  })).filter((x) => x.seg >= 60 && x.app);
  if (!blocos.length) return json(res, 400, { ok: false, erro: 'Nenhum bloco válido (mínimo 1 minuto, com o nome do app).' });

  const r = await fetch(`${s.base}/rest/v1/jirainsight_config`, {
    method: 'POST',
    headers: { ...s.headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: `meudia_${me.accountId}`, data: { dia, blocos, nome: me.nome, quando: new Date().toISOString() } }),
  });
  if (!(r.status >= 200 && r.status < 300)) {
    return json(res, 200, { ok: false, erro: `Supabase ${r.status}: ${(await r.text()).slice(0, 200)}` });
  }
  return json(res, 200, { ok: true, accountId: me.accountId, nome: me.nome, dia, blocos: blocos.length });
}

const SCHEMA_MEUDIA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo', 'sugestoes'],
  properties: {
    resumo: { type: 'string' },
    sugestoes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['periodo', 'atividade', 'acao', 'tempo', 'justificativa'],
        properties: {
          periodo: { type: 'string' },
          atividade: { type: 'string' },
          acao: { type: 'string', enum: ['apontar', 'criar', 'ignorar'] },
          ticket: { type: 'string' },
          projeto: { type: 'string' },
          caminhoArvore: { type: 'string' },
          tempo: { type: 'string' },
          resumoTicket: { type: 'string' },
          justificativa: { type: 'string' },
        },
      },
    },
  },
};

const SISTEMA_MEUDIA = [
  'Você é um assistente de timetracking da Dexterity IT. Recebe os BLOCOS DE ATIVIDADE',
  'do computador de UMA pessoa num dia (app usado + título da janela + duração) e o',
  'CONTEXTO do Jira dela: projetos disponíveis (com categorias), os tickets em que ela',
  'apontou recentemente e as alocações planejadas. Em português do Brasil, sugira o',
  'que fazer com cada período de trabalho.',
  '',
  'Regras:',
  '- Agrupe blocos consecutivos da MESMA atividade numa sugestão só; ignore períodos',
  '  claramente pessoais/ociosos (acao "ignorar", sem poluir).',
  '- "apontar": quando a atividade combina com um TICKET RECENTE do contexto — preencha',
  '  "ticket" com a chave EXATA do contexto (nunca invente chaves).',
  '- "criar": quando não há ticket que sirva — preencha "projeto" (chave do catálogo que',
  '  melhor combina), "caminhoArvore" (ex.: "AMS direto", "AMS por parceria", "SAP —',
  '  épico de Gestão", "Interno — Melhorias", "Administrativa (rotina)", "Avulsa —',
  '  departamento X") e "resumoTicket" (título pronto, objetivo claro).',
  '- "tempo": duração arredondada para 15 min (formatos 30m, 1h, 1h30). "periodo": ex. "09:00–10:30".',
  '- Reuniões (Teams/Zoom/Meet ou títulos de reunião) normalmente vão em tickets de',
  '  reunião; trabalho em cliente AMS vai no projeto AMS do cliente.',
  '- "resumo": 2 a 3 frases do dia (horas cobertas, o que já tem ticket, o que falta).',
  '- Baseie-se SOMENTE nos dados fornecidos; não invente tickets, projetos ou horários.',
].join('\n');

// POST ?acao=meudia { accountId, contexto:{projetos,recentes,alocacoes} } → blocos + sugestões da IA.
async function meuDiaAnalisa(res, b, apiKey) {
  const s = sbMeuDia();
  if (!s) return json(res, 200, { ok: false, erro: 'O Meu dia exige a configuração compartilhada (Supabase).' });
  const accountId = String(b.accountId || '').trim();
  if (!accountId || !/^[\w:-]{5,128}$/.test(accountId)) return json(res, 400, { ok: false, erro: 'accountId inválido.' });

  const r = await fetch(`${s.base}/rest/v1/jirainsight_config?id=eq.${encodeURIComponent(`meudia_${accountId}`)}&select=data`, { headers: s.headers });
  const rows = r.ok ? await r.json() : [];
  const reg = (rows && rows[0] && rows[0].data) || null;
  if (!reg || !Array.isArray(reg.blocos) || !reg.blocos.length) {
    return json(res, 200, { ok: true, semDados: true, erro: '', dia: '', blocos: [], resumo: '', sugestoes: [] });
  }

  const ck = `meudia:${accountId}:${reg.quando || reg.dia}`;
  const c = cacheGet(ck);
  if (c && !b.nocache) return json(res, 200, c);

  const ctx = (b.contexto && typeof b.contexto === 'object') ? b.contexto : {};
  const projetos = (Array.isArray(ctx.projetos) ? ctx.projetos : []).slice(0, 120)
    .map((p) => ({ key: txt(p.key, 20), nome: txt(p.nome, 80), categoria: txt(p.categoria, 60) })).filter((p) => p.key);
  const recentes = (Array.isArray(ctx.recentes) ? ctx.recentes : []).slice(0, 30)
    .map((t) => ({ k: txt(t.k, 20), resumo: txt(t.resumo, 140), projeto: txt(t.projeto || t.p, 20) })).filter((t) => t.k);
  const alocacoes = (Array.isArray(ctx.alocacoes) ? ctx.alocacoes : []).slice(0, 20)
    .map((a) => ({ projeto: txt(a.projeto, 20), horasSemana: num(a.horasSemana || a.hSemana) })).filter((a) => a.projeto);

  const payload = {
    dia: reg.dia,
    blocos: reg.blocos.slice(0, MAX_BLOCOS),
    contexto: { projetos, ticketsRecentes: recentes, alocacoesPlanejadas: alocacoes },
  };
  const prompt = 'DIA DE TRABALHO PARA CLASSIFICAR (JSON):\n\n' + JSON.stringify(payload);
  const resultado = await chamaClaude(apiKey, null, { system: SISTEMA_MEUDIA, schema: SCHEMA_MEUDIA, prompt });

  const chavesRec = new Set(recentes.map((t) => t.k));
  const projOk = new Set(projetos.map((p) => p.key));
  const out = {
    ok: true, dia: reg.dia, quando: reg.quando || '', nome: reg.nome || '',
    blocos: reg.blocos,
    resumo: txt(resultado.resumo, 1000),
    sugestoes: (Array.isArray(resultado.sugestoes) ? resultado.sugestoes : []).slice(0, 30).map((x) => ({
      periodo: txt(x.periodo, 30), atividade: txt(x.atividade, 160),
      acao: ['apontar', 'criar', 'ignorar'].includes(x.acao) ? x.acao : 'ignorar',
      ticket: chavesRec.has(String(x.ticket || '')) ? String(x.ticket) : '',
      projeto: projOk.has(String(x.projeto || '')) ? String(x.projeto) : '',
      caminhoArvore: txt(x.caminhoArvore, 60), tempo: txt(x.tempo, 12),
      resumoTicket: txt(x.resumoTicket, 200), justificativa: txt(x.justificativa, 300),
    })),
  };
  // "apontar" sem ticket válido do contexto vira "criar" (a IA citou chave desconhecida).
  out.sugestoes.forEach((x) => { if (x.acao === 'apontar' && !x.ticket) x.acao = 'criar'; });
  return json(res, 200, cacheSetTTL(ck, out, 10));
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

    // 📍 Meu dia — ingest dos blocos da ponte (não precisa de IA; valida o token do Jira).
    if (acao === 'meudia-ingest') return await meuDiaIngest(res, b);

    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      return json(res, 200, {
        ok: false,
        configurado: false,
        erro: 'Análise por IA não configurada. Defina a variável ANTHROPIC_API_KEY na Vercel.',
      });
    }

    // Qualidade dos tickets vs. boas práticas TI-04-006 (rubrica lida do Notion).
    if (acao === 'qualidade') return await analisaQualidade(res, b, apiKey);

    // 🕵️ Auditoria de apontamentos de UMA pessoa vs. validações TI-04-014 (Notion).
    if (acao === 'auditoria') return await auditaApontamentos(res, b, apiKey);

    // 📍 Meu dia — blocos de atividade do Mac + sugestões da IA de onde apontar/criar.
    if (acao === 'meudia') return await meuDiaAnalisa(res, b, apiKey);

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
