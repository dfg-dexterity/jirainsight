// Ficha de um projeto do Jira — catálogo, busca das issues e a agregação (épicos, esforço,
// evolução, inconsistências). Nasceu em api/projetos.js e mudou para cá em 2026-09-28 sem
// mudar de comportamento: a rota GET /api/projetos?visao=1&projeto=KEY continua chamando
// exatamente este código, e o 🌐 portal do projeto (api/_lib/portal.js) passou a montar o
// progresso do cliente a partir da MESMA ficha — um cálculo só, cliente e time veem o mesmo.
// (Um arquivo em api/_lib não conta como função serverless — o limite de 12 da Vercel.)
import { cacheGet, cacheSetTTL, jiraBase, jiraAuthHeader, jiraSearchAll } from './util.js';

// Catálogo de projetos (key, nome, categoria, descrição, tipos, líder) via project/search.
// Cacheado em 'projetos:tipos' — usado pelo catálogo default, pela Visão por Projetos, pelo
// 📊 relatório semanal (nomes dos projetos da foto) e pelo 🌐 portal do projeto.
// `lead` = o líder cadastrado no Jira: é só a SUGESTÃO inicial do "🧭 gerente do projeto"
// na ficha — quem manda é cfg.projGerentes, escolhido pelos gestores no painel.
export async function carregaCatalogoProjetos() {
  const ck = 'projetos:tipos';
  const cached = cacheGet(ck);
  if (cached) return cached.projetos;

  const base = jiraBase();
  const headers = { Authorization: jiraAuthHeader(), Accept: 'application/json' };
  const projetos = [];
  let startAt = 0;
  for (let page = 0; page < 10; page += 1) {
    const r = await fetch(
      `${base}/rest/api/3/project/search?expand=issueTypes,description,lead&maxResults=50&startAt=${startAt}`,
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
        lead: { id: (p.lead && p.lead.accountId) || '', nome: (p.lead && p.lead.displayName) || '' },
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

// Nome do projeto pelo catálogo — best-effort: sem Jira, a chave serve de nome.
export async function nomeProjeto(key) {
  try { const p = (await carregaCatalogoProjetos()).find((x) => x.key === key); return (p && p.nome) || key; } catch (e) { return key; }
}

// ---------------------------------------------------------------------------
// "Visão por Projetos": ficha detalhada de um projeto, direto do Jira. Espelha o relatório
// por projeto: Visão Geral, Status/Tipo/Prioridade, Épicos & Esforço, Categorias (rótulos),
// Evolução Mensal e Inconsistências. Horas = campos do Jira (Estimativa original / Tempo
// gasto) ÷ 3600.
// ---------------------------------------------------------------------------
export const CAMPOS_VISAO = ['summary', 'status', 'issuetype', 'priority', 'assignee',
  'labels', 'parent', 'created', 'resolutiondate', 'duedate', 'timespent', 'timeoriginalestimate'];
// 📅 Cronograma (R04): "Data de início" do Jira (campo do sistema, customfield_10015 nesta
// instância; ajustável por env) e os links entre itens (dependências épico → épico).
// Só a FICHA pede esses campos — o consolidado continua leve.
export const CF_INICIO = (process.env.JIRA_CF_INICIO || 'customfield_10015').trim();
export const CAMPOS_FICHA_EXTRA = [CF_INICIO, 'issuelinks'];
const RE_CANCEL = /cancel/i;
const dia10 = (v) => (v ? String(v).slice(0, 10) : '');

export function hojeSP() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function ehEpicoTipo(t) { return !!t && (t.name === 'Epic' || t.hierarchyLevel === 1); }
function mesDe(iso) { return iso ? String(iso).slice(0, 7) : ''; }   // YYYY-MM
function h1(seg) { return Math.round((Number(seg) || 0) / 360) / 10; }   // segundos -> horas (1 casa)

// Score de saúde 0–100 (simplista e componível): penaliza vencidos entre abertos e
// baixa taxa de conclusão. Cor no front (good/warn/bad).
export function saudeProjeto(r) {
  if (!r.total) return 0;
  const abertos = r.backlog + r.emAndamento;
  const riscoVenc = abertos ? r.vencidos / abertos : 0;
  const conclui = r.pctConcluido / 100;
  return Math.max(0, Math.min(100, Math.round(100 - riscoVenc * 45 - (1 - conclui) * 25)));
}

// Agrega as issues de UM projeto nas métricas do relatório. detalhe=false → só o
// resumo (para o consolidado); detalhe=true → todas as seções da ficha.
export function agregaProjeto(issues, { detalhe = false } = {}) {
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
    const respId = (f.assignee && f.assignee.accountId) || '';
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

    // Chaveia por accountId (quando houver) para permitir cruzar com custo/h no front.
    const r = porResp[respId || resp] || (porResp[respId || resp] = { nome: resp, id: respId, itens: 0, concluidos: 0, estSeg: 0, gastoSeg: 0 });
    r.itens += 1; if (feito) r.concluidos += 1; r.estSeg += est; r.gastoSeg += gasto;
    const te = porTipoEsf[tipo] || (porTipoEsf[tipo] = { itens: 0, concluidos: 0, estSeg: 0, gastoSeg: 0 });
    te.itens += 1; if (feito) te.concluidos += 1; te.estSeg += est; te.gastoSeg += gasto;

    if (!labels.length) porLabel['Sem categoria'] = (porLabel['Sem categoria'] || 0) + 1;
    else labels.forEach((l) => { porLabel[l] = (porLabel[l] || 0) + 1; });

    const mc = mesDe(f.created); if (mc) criadosMes[mc] = (criadosMes[mc] || 0) + 1;
    if (feito && f.resolutiondate) { const mr = mesDe(f.resolutiondate); if (mr) concluidosMes[mr] = (concluidosMes[mr] || 0) + 1; }

    if (ehEpicoTipo(f.issuetype)) {
      const e = epicos[it.key] || (epicos[it.key] = { resumo: '', status: '', aberto: true, estSeg: 0, gastoSeg: 0, nFilhos: 0, nConcluidos: 0,
        // 📅 cronograma: datas do próprio épico + o que os filhos revelam (2ª passada)
        sc: '', ini: '', fim: '', criado: '', resolvido: '', resp: '', emAnd: 0, filhosAbertos: 0, filhosVenc: 0, filhosDepois: 0,
        iniItens: '', fimItens: '', vencFilhos: '', ultAtiv: '', porMes: {}, links: [] });
      e.resumo = f.summary || ''; e.status = stName; e.aberto = !done; e.sc = cancel ? 'cancel' : stCat;
      e.ini = dia10(f[CF_INICIO]); e.fim = dia10(f.duedate); e.criado = dia10(f.created); e.resolvido = feito ? dia10(f.resolutiondate) : ''; e.resp = resp;
      (Array.isArray(f.issuelinks) ? f.issuelinks : []).forEach((l) => {
        const t = (l && l.type) || {};
        if (l && l.outwardIssue && l.outwardIssue.key) e.links.push({ d: 'out', n: t.name || '', rot: t.outward || t.name || '', k: l.outwardIssue.key });
        if (l && l.inwardIssue && l.inwardIssue.key) e.links.push({ d: 'in', n: t.name || '', rot: t.inward || t.name || '', k: l.inwardIssue.key });
      });
    }

    if (feito && !f.resolutiondate) inc.resolvido.push(it.key);
    if (feito && !gasto) inc.feitoSemTempo.push(it.key);
    if (gasto > 0 && !est) inc.gastoSemEst.push(it.key);
    if (est > 0 && gasto > est) inc.estouro.push(it.key);
    if (stCat === 'new' && gasto > 0) inc.backlogComGasto.push(it.key);
    if (!labels.length) inc.semCategoria.push(it.key);
    if (!ehEpicoTipo(f.issuetype) && !est && !cancel) inc.naoEpicSemEst.push(it.key);
  });

  // 2ª passada: agrega filhos aos épicos (contagens, esforço e, para o cronograma,
  // o que os filhos revelam: 1º item criado, último resolvido, maior vencimento,
  // itens vencidos, itens vencendo DEPOIS do marco do épico e criados/concluídos por mês).
  issues.forEach((it) => {
    const f = it.fields || {};
    if (ehEpicoTipo(f.issuetype)) return;
    const ek = epicoDe(it);
    const e = ek && epicos[ek];
    if (!e) return;
    const cancel = RE_CANCEL.test(nomeSt(f)); const done = catDone(f); const feito = done && !cancel;
    e.nFilhos += 1;
    if (feito) e.nConcluidos += 1;
    e.estSeg += Number(f.timeoriginalestimate) || 0;
    e.gastoSeg += Number(f.timespent) || 0;
    if (cancel) return;
    const stCat = (f.status && f.status.statusCategory && f.status.statusCategory.key) || '';
    if (stCat === 'indeterminate') e.emAnd += 1;
    if (!done) e.filhosAbertos += 1;
    const c = dia10(f[CF_INICIO]) || dia10(f.created); const rd = feito ? dia10(f.resolutiondate) : ''; const v = dia10(f.duedate);
    if (c && (!e.iniItens || c < e.iniItens)) e.iniItens = c;
    if (rd && (!e.fimItens || rd > e.fimItens)) e.fimItens = rd;
    if (v && (!e.vencFilhos || v > e.vencFilhos)) e.vencFilhos = v;
    if (v && v < hoje && !done) e.filhosVenc += 1;
    if (v && e.fim && v > e.fim) e.filhosDepois += 1;
    const ult = rd || dia10(f.created); if (ult && (!e.ultAtiv || ult > e.ultAtiv)) e.ultAtiv = ult;
    const mc = mesDe(f.created); if (mc) { const m = e.porMes[mc] || (e.porMes[mc] = { c: 0, d: 0 }); m.c += 1; }
    if (feito && f.resolutiondate) { const mr = mesDe(f.resolutiondate); if (mr) { const m = e.porMes[mr] || (e.porMes[mr] = { c: 0, d: 0 }); m.d += 1; } }
  });
  // Links só entre épicos DESTE projeto (dependências do cronograma); o resto some.
  Object.values(epicos).forEach((e) => { e.links = e.links.filter((l) => epicos[l.k]); });

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
    .map(([k, r]) => ({ nome: r.nome || k, id: r.id || '', itens: r.itens, concluidos: r.concluidos, estH: h1(r.estSeg), gastoH: h1(r.gastoSeg), ratio: r.estSeg ? Math.round((r.gastoSeg / r.estSeg) * 1000) / 10 : null }))
    .sort((a, b) => b.estH - a.estH || b.gastoH - a.gastoH);
  const meses = [...new Set([...Object.keys(criadosMes), ...Object.keys(concluidosMes)])].sort();
  let accC = 0, accD = 0;
  const evolucao = meses.map((m) => { accC += criadosMes[m] || 0; accD += concluidosMes[m] || 0; return { mes: m, criados: criadosMes[m] || 0, concluidos: concluidosMes[m] || 0, criadosAcum: accC, concluidosAcum: accD }; });
  const epicosArr = Object.entries(epicos)
    .map(([k, e]) => ({ k, resumo: e.resumo, status: e.status, nFilhos: e.nFilhos, nConcluidos: e.nConcluidos, pct: e.nFilhos ? Math.round((e.nConcluidos / e.nFilhos) * 1000) / 10 : 0, estH: h1(e.estSeg), gastoH: h1(e.gastoSeg),
      sc: e.sc, ini: e.ini, fim: e.fim, criado: e.criado, resolvido: e.resolvido, resp: e.resp, emAnd: e.emAnd, filhosAbertos: e.filhosAbertos, filhosVenc: e.filhosVenc, filhosDepois: e.filhosDepois,
      iniItens: e.iniItens, fimItens: e.fimItens, vencFilhos: e.vencFilhos, ultAtiv: e.ultAtiv, porMes: e.porMes, links: e.links }))
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
      si: dia10(f[CF_INICIO]),
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

export async function fetchIssuesProjeto(projeto, maxPages, extra) {
  return jiraSearchAll({ jql: `project = "${projeto}" ORDER BY created ASC`, fields: CAMPOS_VISAO.concat(extra || []), pageSize: 100, maxPages });
}

// Ficha detalhada de um projeto (a resposta de /api/projetos?visao=1&projeto=KEY), com o
// mesmo cache de 10 min de sempre ('visao:proj:KEY'): a rota e o portal do cliente batem na
// mesma entrada, então um não paga a busca no Jira que o outro acabou de fazer.
export async function fichaProjeto(projeto, nocache) {
  const ck = `visao:proj:${projeto}`;
  if (!nocache) { const c = cacheGet(ck); if (c) return c; }
  const { issues, truncado } = await fetchIssuesProjeto(projeto, 60, CAMPOS_FICHA_EXTRA);
  const det = agregaProjeto(issues, { detalhe: true });
  const meta = (await carregaCatalogoProjetos()).find((p) => p.key === projeto) || {};
  return cacheSetTTL(ck, { projeto, nome: meta.nome || '', categoria: meta.categoria || '', geradoEm: new Date().toISOString(), truncado, ...det }, 10);
}
