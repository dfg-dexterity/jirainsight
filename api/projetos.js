// Projetos e épicos para o módulo Planejar (num só endpoint, para caber no limite de
// Serverless Functions do plano Hobby da Vercel). Leitura via conta de serviço.
//
// GET /api/projetos            -> projetos do Jira com seus tipos de issue
// GET /api/projetos?epicos=KEY -> épicos e histórias ABERTOS do projeto KEY
import { cacheGet, cacheSetTTL, jiraBase, jiraSearchAll, json } from './_lib/util.js';

const RE_PROJ = /^[A-Za-z][A-Za-z0-9_]*$/;
const RE_HISTORIA = /story|hist[oó]ria/i;

function jiraAuthHeader() {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) throw new Error('JIRA_EMAIL / JIRA_API_TOKEN não configurados');
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

// GET /api/projetos?epicos=KEY -> { projeto, epicos, historias }
async function listarEpicos(projeto, res) {
  if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
  const ck = `epicos:${projeto}`;
  const cached = cacheGet(ck);
  if (cached) return json(res, 200, cached);

  const base = jiraBase();
  const headers = { Authorization: jiraAuthHeader(), Accept: 'application/json' };
  const rp = await fetch(`${base}/rest/api/3/project/${encodeURIComponent(projeto)}`, { headers });
  if (!rp.ok) {
    const t = await rp.text();
    return json(res, rp.status === 404 ? 404 : 500, { erro: `Jira ${rp.status}: ${t.slice(0, 200)}` });
  }
  const pdata = await rp.json();
  const tipos = pdata.issueTypes || [];
  const idsEpico = tipos.filter((t) => t.hierarchyLevel === 1).map((t) => t.id);
  const idsHistoria = tipos
    .filter((t) => !t.subtask && t.hierarchyLevel !== 1 && RE_HISTORIA.test(t.name || ''))
    .map((t) => t.id);

  const ids = [...idsEpico, ...idsHistoria];
  const epicos = [];
  const historias = [];
  if (ids.length) {
    const { issues } = await jiraSearchAll({
      jql: `project = ${projeto} AND issuetype in (${ids.join(',')}) AND statusCategory != Done ORDER BY created DESC`,
      fields: ['summary', 'issuetype', 'status', 'parent'],
      pageSize: 100,
      maxPages: 3,
    });
    for (const it of issues) {
      const f = it.fields || {};
      const ehEpico = idsEpico.includes(f.issuetype && f.issuetype.id);
      const item = {
        k: it.key,
        resumo: f.summary || '',
        status: (f.status && f.status.name) || '',
        tipo: (f.issuetype && f.issuetype.name) || '',
      };
      if (ehEpico) { item.nHistorias = 0; epicos.push(item); }
      else {
        // Épico-pai da história (Jira novo: o pai de uma história é o épico).
        item.epico = (f.parent && f.parent.key) || '';
        historias.push(item);
      }
    }
    // Conta quantas histórias (abertas) cada épico já tem, para mostrar contexto.
    const porEpico = {};
    historias.forEach((h) => { if (h.epico) porEpico[h.epico] = (porEpico[h.epico] || 0) + 1; });
    epicos.forEach((e) => { e.nHistorias = porEpico[e.k] || 0; });
  }
  return json(res, 200, cacheSetTTL(ck, { projeto, epicos, historias }, 10));
}

// GET /api/projetos?consultorias=KEY -> opções do campo CASCATA "AMS | Consultoria >
// Cliente" do projeto (via createmeta, conta de serviço): a consultoria é o valor-pai
// e os clientes são os filhos. Usado pela árvore de decisão (AMS por parceria).
async function listarConsultorias(projeto, res) {
  if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
  const ck = `conscli:${projeto}`;
  const cached = cacheGet(ck);
  if (cached) return json(res, 200, cached);

  const base = jiraBase();
  const headers = { Authorization: jiraAuthHeader(), Accept: 'application/json' };
  const r = await fetch(`${base}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projeto)}&expand=projects.issuetypes.fields`, { headers });
  if (!r.ok) {
    const t = await r.text();
    return json(res, r.status === 404 ? 404 : 500, { erro: `Jira ${r.status}: ${t.slice(0, 200)}` });
  }
  const j = await r.json();
  const tipos = (j.projects && j.projects[0] && j.projects[0].issuetypes) || [];
  let campo = ''; let nome = '';
  const mapa = new Map();
  for (const t of tipos) {
    for (const [fid, f] of Object.entries(t.fields || {})) {
      const cascata = f.schema && (f.schema.type === 'option-with-child' || /cascadingselect/.test(f.schema.custom || ''));
      if (!cascata || !/consultoria/i.test(f.name || '')) continue;
      campo = fid; nome = f.name || '';
      for (const v of (f.allowedValues || [])) {
        const atual = mapa.get(String(v.id)) || { id: String(v.id), nome: v.value || '', clientes: new Map() };
        for (const ch of (v.children || [])) atual.clientes.set(String(ch.id), { id: String(ch.id), nome: ch.value || '' });
        mapa.set(String(v.id), atual);
      }
    }
  }
  if (!campo) {
    return json(res, 200, { projeto, campo: '', nome: '', opcoes: [], erro: 'Campo "AMS | Consultoria > Cliente" não encontrado no projeto.' });
  }
  const opcoes = [...mapa.values()]
    .map((o) => ({ id: o.id, nome: o.nome, clientes: [...o.clientes.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt')) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  return json(res, 200, cacheSetTTL(ck, { projeto, campo, nome, opcoes }, 30));
}

// Catálogo de projetos (key, nome, categoria, descrição, tipos) via project/search.
// Cacheado em 'projetos:tipos' — usado pelo catálogo default e pela Visão por Projetos.
async function carregaCatalogoProjetos() {
  const ck = 'projetos:tipos';
  const cached = cacheGet(ck);
  if (cached) return cached.projetos;

  const base = jiraBase();
  const headers = { Authorization: jiraAuthHeader(), Accept: 'application/json' };
  const projetos = [];
  let startAt = 0;
  for (let page = 0; page < 10; page += 1) {
    const r = await fetch(
      `${base}/rest/api/3/project/search?expand=issueTypes,description&maxResults=50&startAt=${startAt}`,
      { headers },
    );
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Jira ${r.status}: ${t.slice(0, 300)}`);
    }
    const data = await r.json();
    for (const p of (data.values || [])) {
      projetos.push({
        key: p.key,
        nome: p.name || p.key,
        categoria: (p.projectCategory && p.projectCategory.name) || 'Sem categoria',
        descricao: String(p.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
        tipos: (p.issueTypes || []).map((t) => ({
          id: t.id,
          nome: t.name || '',
          subtarefa: !!t.subtask,
          nivel: typeof t.hierarchyLevel === 'number' ? t.hierarchyLevel : (t.subtask ? -1 : 0),
        })),
      });
    }
    if (data.isLast || (data.values || []).length === 0) break;
    startAt += 50;
  }
  projetos.sort((a, b) => a.key.localeCompare(b.key));
  cacheSetTTL(ck, { projetos }, 30);
  return projetos;
}

// O plano atual do Jira não permite arquivar projetos; a convenção da casa é
// prefixar com "ARQ" (nome ou categoria). Esses projetos somem do painel inteiro.
const RE_ARQUIVADO = /(^|[^A-Za-z])ARQ([^A-Za-z]|$)/;
function semArquivados(projetos) {
  return projetos.filter((p) => !RE_ARQUIVADO.test(p.nome || '') && !RE_ARQUIVADO.test(p.categoria || '') && p.key !== 'ARQ');
}

// ---------------------------------------------------------------------------
// GET /api/projetos?visao=1[&projeto=KEY][&nocache=1] — "Visão por Projetos".
// Consolidado (todos os projetos) + ficha detalhada de um projeto, direto do Jira.
// Espelha o relatório por projeto: Visão Geral, Status/Tipo/Prioridade, Épicos &
// Esforço, Categorias (rótulos), Evolução Mensal e Inconsistências.
// Horas = campos do Jira (Estimativa original / Tempo gasto) ÷ 3600.
// ---------------------------------------------------------------------------
const CAMPOS_VISAO = ['summary', 'status', 'issuetype', 'priority', 'assignee',
  'labels', 'parent', 'created', 'resolutiondate', 'duedate', 'timespent', 'timeoriginalestimate'];
const RE_CANCEL = /cancel/i;

function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function ehEpicoTipo(t) { return !!t && (t.name === 'Epic' || t.hierarchyLevel === 1); }
function mesDe(iso) { return iso ? String(iso).slice(0, 7) : ''; }   // YYYY-MM
function h1(seg) { return Math.round((Number(seg) || 0) / 360) / 10; }   // segundos -> horas (1 casa)

// Score de saúde 0–100 (simplista e componível): penaliza vencidos entre abertos e
// baixa taxa de conclusão. Cor no front (good/warn/bad).
function saudeProjeto(r) {
  if (!r.total) return 0;
  const abertos = r.backlog + r.emAndamento;
  const riscoVenc = abertos ? r.vencidos / abertos : 0;
  const conclui = r.pctConcluido / 100;
  return Math.max(0, Math.min(100, Math.round(100 - riscoVenc * 45 - (1 - conclui) * 25)));
}

// Agrega as issues de UM projeto nas métricas do relatório. detalhe=false → só o
// resumo (para o consolidado); detalhe=true → todas as seções da ficha.
function agregaProjeto(issues, { detalhe = false } = {}) {
  const hoje = hojeSP();
  const porStatus = {}, porTipo = {}, porPrioridade = {}, porResp = {}, porTipoEsf = {}, porLabel = {};
  const criadosMes = {}, concluidosMes = {}, epicos = {};
  const mapa = {};
  issues.forEach((it) => { mapa[it.key] = it; });

  let total = 0, concluidos = 0, cancelados = 0, emAndamento = 0, backlog = 0, vencidos = 0;
  let estSeg = 0, gastoSeg = 0;
  const inc = { resolvido: [], feitoSemTempo: [], gastoSemEst: [], estouro: [], backlogComGasto: [], semCategoria: [], naoEpicSemEst: [] };

  const catDone = (f) => (f.status && f.status.statusCategory && f.status.statusCategory.key) === 'done';
  const nomeSt = (f) => (f.status && f.status.name) || '';

  // Épico de uma issue (2 níveis: subtarefa → história → épico).
  function epicoDe(it) {
    const f = it.fields || {};
    if (ehEpicoTipo(f.issuetype)) return it.key;
    const p = f.parent; if (!p) return '';
    const pi = mapa[p.key];
    if (pi && ehEpicoTipo((pi.fields || {}).issuetype)) return p.key;
    const pp = pi && (pi.fields || {}).parent;   // pai é história → avô pode ser o épico
    return pp ? pp.key : p.key;
  }

  issues.forEach((it) => {
    const f = it.fields || {};
    total += 1;
    const stName = nomeSt(f) || '—';
    const stCat = (f.status && f.status.statusCategory && f.status.statusCategory.key) || '';
    const tipo = (f.issuetype && f.issuetype.name) || '—';
    const prio = (f.priority && f.priority.name) || 'Sem prioridade';
    const resp = (f.assignee && f.assignee.displayName) || 'Não atribuído';
    const est = Number(f.timeoriginalestimate) || 0;
    const gasto = Number(f.timespent) || 0;
    const cancel = RE_CANCEL.test(stName);
    const done = stCat === 'done';
    const feito = done && !cancel;
    const labels = Array.isArray(f.labels) ? f.labels : [];

    porStatus[stName] = (porStatus[stName] || 0) + 1;
    porTipo[tipo] = (porTipo[tipo] || 0) + 1;
    porPrioridade[prio] = (porPrioridade[prio] || 0) + 1;
    estSeg += est; gastoSeg += gasto;

    if (cancel) cancelados += 1;
    else if (done) concluidos += 1;
    else if (stCat === 'indeterminate') emAndamento += 1;
    else backlog += 1;
    if (f.duedate && f.duedate < hoje && !done) vencidos += 1;

    const r = porResp[resp] || (porResp[resp] = { itens: 0, concluidos: 0, estSeg: 0, gastoSeg: 0 });
    r.itens += 1; if (feito) r.concluidos += 1; r.estSeg += est; r.gastoSeg += gasto;
    const te = porTipoEsf[tipo] || (porTipoEsf[tipo] = { itens: 0, concluidos: 0, estSeg: 0, gastoSeg: 0 });
    te.itens += 1; if (feito) te.concluidos += 1; te.estSeg += est; te.gastoSeg += gasto;

    if (!labels.length) porLabel['Sem categoria'] = (porLabel['Sem categoria'] || 0) + 1;
    else labels.forEach((l) => { porLabel[l] = (porLabel[l] || 0) + 1; });

    const mc = mesDe(f.created); if (mc) criadosMes[mc] = (criadosMes[mc] || 0) + 1;
    if (feito && f.resolutiondate) { const mr = mesDe(f.resolutiondate); if (mr) concluidosMes[mr] = (concluidosMes[mr] || 0) + 1; }

    if (ehEpicoTipo(f.issuetype)) {
      const e = epicos[it.key] || (epicos[it.key] = { resumo: '', status: '', aberto: true, estSeg: 0, gastoSeg: 0, nFilhos: 0, nConcluidos: 0 });
      e.resumo = f.summary || ''; e.status = stName; e.aberto = !done;
    }

    if (feito && !f.resolutiondate) inc.resolvido.push(it.key);
    if (feito && !gasto) inc.feitoSemTempo.push(it.key);
    if (gasto > 0 && !est) inc.gastoSemEst.push(it.key);
    if (est > 0 && gasto > est) inc.estouro.push(it.key);
    if (stCat === 'new' && gasto > 0) inc.backlogComGasto.push(it.key);
    if (!labels.length) inc.semCategoria.push(it.key);
    if (!ehEpicoTipo(f.issuetype) && !est && !cancel) inc.naoEpicSemEst.push(it.key);
  });

  // 2ª passada: agrega filhos aos épicos.
  issues.forEach((it) => {
    const f = it.fields || {};
    if (ehEpicoTipo(f.issuetype)) return;
    const ek = epicoDe(it);
    const e = ek && epicos[ek];
    if (!e) return;
    e.nFilhos += 1;
    if (catDone(f) && !RE_CANCEL.test(nomeSt(f))) e.nConcluidos += 1;
    e.estSeg += Number(f.timeoriginalestimate) || 0;
    e.gastoSeg += Number(f.timespent) || 0;
  });

  const naoCancel = Math.max(1, total - cancelados);
  const resumo = {
    total, concluidos, cancelados, emAndamento, backlog, vencidos,
    pctConcluido: Math.round((concluidos / naoCancel) * 1000) / 10,
    estH: h1(estSeg), gastoH: h1(gastoSeg),
    nEpicos: Object.keys(epicos).length,
    nEpicosAbertos: Object.values(epicos).filter((e) => e.aberto).length,
    incTotal: Object.values(inc).reduce((s, a) => s + a.length, 0),
  };
  resumo.saude = saudeProjeto(resumo);

  // Concluídos dos últimos 30 dias (chave, dia, pessoa, tipo) — alimenta as visões
  // de atividade por categoria no consolidado. Compacto e limitado.
  const d30 = new Date(); d30.setUTCDate(d30.getUTCDate() - 30);
  const corte = d30.toISOString().slice(0, 10);
  const conc30 = [];
  issues.forEach((it) => {
    const f = it.fields || {};
    if (!f.resolutiondate) return;
    const dia = String(f.resolutiondate).slice(0, 10);
    if (dia < corte) return;
    const st = (f.status && f.status.name) || '';
    if (RE_CANCEL.test(st)) return;
    conc30.push({ k: it.key, d: dia, p: (f.assignee && f.assignee.displayName) || 'Não atribuído', t: (f.issuetype && f.issuetype.name) || '' });
  });
  conc30.sort((a, b) => b.d.localeCompare(a.d));
  resumo.conc30 = conc30.slice(0, 300);

  if (!detalhe) return resumo;

  const ord = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ nome: k, n: v, pct: Math.round((v / (total || 1)) * 1000) / 10 }));
  const esf = (obj) => Object.entries(obj)
    .map(([nome, r]) => ({ nome, itens: r.itens, concluidos: r.concluidos, estH: h1(r.estSeg), gastoH: h1(r.gastoSeg), ratio: r.estSeg ? Math.round((r.gastoSeg / r.estSeg) * 1000) / 10 : null }))
    .sort((a, b) => b.estH - a.estH || b.gastoH - a.gastoH);
  const meses = [...new Set([...Object.keys(criadosMes), ...Object.keys(concluidosMes)])].sort();
  let accC = 0, accD = 0;
  const evolucao = meses.map((m) => { accC += criadosMes[m] || 0; accD += concluidosMes[m] || 0; return { mes: m, criados: criadosMes[m] || 0, concluidos: concluidosMes[m] || 0, criadosAcum: accC, concluidosAcum: accD }; });
  const epicosArr = Object.entries(epicos)
    .map(([k, e]) => ({ k, resumo: e.resumo, status: e.status, nFilhos: e.nFilhos, nConcluidos: e.nConcluidos, pct: e.nFilhos ? Math.round((e.nConcluidos / e.nFilhos) * 1000) / 10 : 0, estH: h1(e.estSeg), gastoH: h1(e.gastoSeg) }))
    .sort((a, b) => b.nFilhos - a.nFilhos);
  const CAP = 300;
  const lst = (arr, rot, acao) => ({ rot, acao, qtd: arr.length, pct: Math.round((arr.length / (total || 1)) * 1000) / 10, chaves: arr.slice(0, CAP) });
  const inconsistencias = {
    resolvido: lst(inc.resolvido, 'Concluído sem "Resolvido"', 'Usar transição com resolução para gravar a data'),
    feitoSemTempo: lst(inc.feitoSemTempo, 'Feito sem tempo apontado', 'Registrar worklog antes de fechar o item'),
    gastoSemEst: lst(inc.gastoSemEst, 'Tempo gasto sem estimativa', 'Preencher Estimativa original ao iniciar'),
    estouro: lst(inc.estouro, 'Gasto acima do estimado (estouro)', 'Revisar estimativa ou justificar o desvio'),
    backlogComGasto: lst(inc.backlogComGasto, 'Backlog com tempo apontado', 'Atualizar status — já houve trabalho'),
    semCategoria: lst(inc.semCategoria, 'Sem categoria (rótulo)', 'Aplicar rótulo de categoria'),
    naoEpicSemEst: lst(inc.naoEpicSemEst, 'Não-Epic sem estimativa', 'Estimar Histórias/Subtarefas/Tarefas'),
  };
  // Lista compacta de itens para o drill-down no front (cap 1200): clicar em
  // qualquer card/barra/linha filtra esta lista localmente, sem nova chamada.
  const itens = issues.slice(0, 1200).map((it) => {
    const f = it.fields || {};
    return {
      k: it.key,
      s: String(f.summary || '').slice(0, 90),
      st: (f.status && f.status.name) || '',
      sc: (f.status && f.status.statusCategory && f.status.statusCategory.key) || '',
      t: (f.issuetype && f.issuetype.name) || '',
      pr: (f.priority && f.priority.name) || 'Sem prioridade',
      r: (f.assignee && f.assignee.displayName) || '',
      v: f.duedate || '',
      c: String(f.created || '').slice(0, 10),
      rd: f.resolutiondate ? String(f.resolutiondate).slice(0, 10) : '',
      eH: h1(Number(f.timeoriginalestimate) || 0),
      gH: h1(Number(f.timespent) || 0),
      l: (Array.isArray(f.labels) ? f.labels : []).join(','),
      e: ehEpicoTipo(f.issuetype) ? '' : epicoDe(it),
      ep: ehEpicoTipo(f.issuetype) ? 1 : 0,
    };
  });

  return {
    resumo, status: ord(porStatus), tipos: ord(porTipo), prioridades: ord(porPrioridade),
    categorias: ord(porLabel), esforcoResp: esf(porResp), esforcoTipo: esf(porTipoEsf),
    epicos: epicosArr, evolucao, inconsistencias,
    itens, itensTruncado: issues.length > 1200,
  };
}

async function fetchIssuesProjeto(projeto, maxPages) {
  return jiraSearchAll({ jql: `project = "${projeto}" ORDER BY created ASC`, fields: CAMPOS_VISAO, pageSize: 100, maxPages });
}

// Executa fn sobre os itens em lotes de `tamanho` (limita concorrência no Jira).
async function emLotes(itens, tamanho, fn) {
  const out = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    out.push(...await Promise.all(itens.slice(i, i + tamanho).map(fn)));
  }
  return out;
}

async function visaoPorProjetos(req, res) {
  const projeto = String((req.query && req.query.projeto) || '').trim().toUpperCase();
  const nocache = String((req.query && req.query.nocache) || '') === '1';

  // Ficha detalhada de um projeto.
  if (projeto) {
    if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
    const ck = `visao:proj:${projeto}`;
    if (!nocache) { const c = cacheGet(ck); if (c) return json(res, 200, c); }
    const { issues, truncado } = await fetchIssuesProjeto(projeto, 60);
    const det = agregaProjeto(issues, { detalhe: true });
    return json(res, 200, cacheSetTTL(ck, { projeto, geradoEm: new Date().toISOString(), truncado, ...det }, 10));
  }

  // Consolidado: um resumo por projeto (sem os "ARQ"), em paralelo com
  // concorrência limitada, + agregação por CATEGORIA de projeto.
  const ck = 'visao:consolidado';
  if (!nocache) { const c = cacheGet(ck); if (c) return json(res, 200, c); }
  const catalogo = semArquivados(await carregaCatalogoProjetos());
  let algumTrunc = false;
  const projetos = await emLotes(catalogo, 5, async (p) => {
    try {
      const { issues, truncado } = await fetchIssuesProjeto(p.key, 40);
      if (truncado) algumTrunc = true;
      return { key: p.key, nome: p.nome, categoria: p.categoria, truncado, ...agregaProjeto(issues, { detalhe: false }) };
    } catch (e) {
      return { key: p.key, nome: p.nome, categoria: p.categoria, erro: String((e && e.message) || e) };
    }
  });
  projetos.sort((a, b) => (b.total || 0) - (a.total || 0) || a.key.localeCompare(b.key));
  const totais = projetos.reduce((s, l) => ({
    total: s.total + (l.total || 0), concluidos: s.concluidos + (l.concluidos || 0),
    backlog: s.backlog + (l.backlog || 0), emAndamento: s.emAndamento + (l.emAndamento || 0),
    vencidos: s.vencidos + (l.vencidos || 0), estH: Math.round((s.estH + (l.estH || 0)) * 10) / 10,
    gastoH: Math.round((s.gastoH + (l.gastoH || 0)) * 10) / 10,
    nEpicos: s.nEpicos + (l.nEpicos || 0), nEpicosAbertos: s.nEpicosAbertos + (l.nEpicosAbertos || 0),
  }), { total: 0, concluidos: 0, backlog: 0, emAndamento: 0, vencidos: 0, estH: 0, gastoH: 0, nEpicos: 0, nEpicosAbertos: 0 });
  totais.pctConcluido = totais.total ? Math.round((totais.concluidos / totais.total) * 1000) / 10 : 0;

  // Agregação por categoria de projeto (ITPR, IMI, DEF, DAMS, …): totais + atividade
  // dos últimos 30 dias (concluídos por dia e por pessoa) para as visões por foco.
  const categorias = {};
  projetos.forEach((p) => {
    if (p.erro) return;
    const c = categorias[p.categoria] || (categorias[p.categoria] = {
      projetos: [], total: 0, concluidos: 0, backlog: 0, emAndamento: 0, vencidos: 0,
      estH: 0, gastoH: 0, nEpicos: 0, nEpicosAbertos: 0, conc30: [],
    });
    c.projetos.push(p.key);
    c.total += p.total; c.concluidos += p.concluidos; c.backlog += p.backlog;
    c.emAndamento += p.emAndamento; c.vencidos += p.vencidos;
    c.estH = Math.round((c.estH + p.estH) * 10) / 10; c.gastoH = Math.round((c.gastoH + p.gastoH) * 10) / 10;
    c.nEpicos += p.nEpicos || 0; c.nEpicosAbertos += p.nEpicosAbertos || 0;
    (p.conc30 || []).forEach((x) => c.conc30.push({ ...x, proj: p.key }));
    delete p.conc30;   // a linha do projeto fica leve; a lista vive na categoria
  });
  Object.values(categorias).forEach((c) => {
    c.conc30.sort((a, b) => b.d.localeCompare(a.d));
    c.conc30 = c.conc30.slice(0, 400);
    c.pctConcluido = c.total ? Math.round((c.concluidos / c.total) * 1000) / 10 : 0;
  });

  return json(res, 200, cacheSetTTL(ck, { geradoEm: new Date().toISOString(), truncado: algumTrunc, projetos, totais, categorias }, 15));
}

export default async function handler(req, res) {
  try {
    if (String((req.query && req.query.visao) || '').trim()) return await visaoPorProjetos(req, res);

    const epicosDe = String((req.query && req.query.epicos) || '').trim().toUpperCase();
    if (epicosDe) return await listarEpicos(epicosDe, res);

    const consDe = String((req.query && req.query.consultorias) || '').trim().toUpperCase();
    if (consDe) return await listarConsultorias(consDe, res);

    const projetos = semArquivados(await carregaCatalogoProjetos());
    return json(res, 200, { projetos });
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
