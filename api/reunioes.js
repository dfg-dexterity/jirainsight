// Reclassificação de tickets de reunião (lista + movimentação num só endpoint, para
// caber no limite de Serverless Functions do plano Hobby da Vercel).
//
// GET  /api/reunioes?projeto=RDF        -> reuniões abertas + projetos-destino válidos
// GET  /api/reunioes?detalhe=RDF-12     -> detalhes de uma reunião (descrição + horas apontadas)
// GET  /api/reunioes?abertos=PROJ       -> tickets abertos de um projeto (para vincular)
// POST /api/reunioes { alvo, itens, ... } -> move (bulk move do Jira) com o token da pessoa
// POST /api/reunioes { taskId, ... }      -> consulta o andamento de um move
// POST /api/reunioes { vincular:1, ... }  -> vincula reunião a ticket de AMS (cria OU comenta,
//                                            worklog opcional) e EXCLUI a reunião — token da pessoa
import {
  cacheGet, cacheSetTTL, cacheClear, jiraBase, jiraSearchAll, json,
} from './_lib/util.js';

const RE_PROJ = /^[A-Za-z][A-Za-z0-9_]*$/;
const RE_ISSUE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const RE_REUNI = /reuni/i;

function authSvc() {
  const e = process.env.JIRA_EMAIL, t = process.env.JIRA_API_TOKEN;
  if (!e || !t) throw new Error('JIRA_EMAIL / JIRA_API_TOKEN não configurados');
  return 'Basic ' + Buffer.from(`${e}:${t}`).toString('base64');
}
function authUser(email, token) {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}
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
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function projetosComTipos(base, headers) {
  const out = [];
  let startAt = 0;
  for (let p = 0; p < 12; p += 1) {
    const r = await fetch(`${base}/rest/api/3/project/search?expand=issueTypes&maxResults=50&startAt=${startAt}`, { headers });
    if (!r.ok) { const t = await r.text(); throw new Error(`Jira ${r.status}: ${t.slice(0, 200)}`); }
    const d = await r.json();
    (d.values || []).forEach((pr) => out.push(pr));
    if (d.isLast || (d.values || []).length === 0) break;
    startAt += 50;
  }
  return out;
}

// --------------------------------- GET: listar ---------------------------------
async function listar(req, res) {
  const projeto = String((req.query && req.query.projeto) || 'RDF').trim().toUpperCase();
  if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
  const ck = `reunioes:${projeto}`;
  if (!(req.query && req.query.nocache === '1')) {
    const c = cacheGet(ck);
    if (c) return json(res, 200, c);
  }
  const base = jiraBase();
  const headers = { Authorization: authSvc(), Accept: 'application/json' };
  const projs = await projetosComTipos(base, headers);
  const src = projs.find((p) => p.key === projeto);
  if (!src) return json(res, 404, { erro: `Projeto ${projeto} não encontrado.` });

  const tiposReuni = (src.issueTypes || []).filter((t) => !t.subtask && RE_REUNI.test(t.name || ''));
  if (!tiposReuni.length) {
    return json(res, 200, cacheSetTTL(ck, {
      projeto, nome: src.name || projeto, tickets: [], alvos: [], tiposReuni: [],
      aviso: `O projeto ${projeto} não tem um tipo de issue de reunião.`,
    }, 5));
  }
  const idsTipo = tiposReuni.map((t) => t.id);
  const nomesTipo = new Set(tiposReuni.map((t) => (t.name || '').toLowerCase()));

  const { issues, truncado } = await jiraSearchAll({
    jql: `project = ${projeto} AND issuetype in (${idsTipo.join(',')}) AND statusCategory != Done ORDER BY status ASC, created DESC`,
    fields: ['summary', 'status', 'issuetype'],
    pageSize: 100,
    maxPages: 5,
  });
  const tickets = issues.map((it) => {
    const f = it.fields || {};
    return {
      id: it.id, k: it.key, resumo: f.summary || '',
      status: (f.status && f.status.name) || '',
      tipo: (f.issuetype && f.issuetype.name) || '',
    };
  });

  const alvos = projs.filter((p) => p.key !== projeto).map((p) => {
    const tipos = {};
    (p.issueTypes || []).forEach((t) => {
      const n = (t.name || '').toLowerCase();
      if (nomesTipo.has(n)) tipos[n] = t.id;
    });
    return Object.keys(tipos).length ? { key: p.key, nome: p.name || p.key, tipos } : null;
  }).filter(Boolean).sort((a, b) => a.key.localeCompare(b.key));

  return json(res, 200, cacheSetTTL(ck, {
    projeto, nome: src.name || projeto, tickets, alvos,
    tiposReuni: tiposReuni.map((t) => ({ id: t.id, nome: t.name })), truncado,
  }, 5));
}

// --------------------------------- POST: mover ---------------------------------
async function statusTask(base, headers, taskId) {
  const r = await fetch(`${base}/rest/api/3/bulk/queue/${encodeURIComponent(taskId)}`, { headers });
  if (!r.ok) { const t = await r.text(); throw new Error(`status ${r.status}: ${t.slice(0, 200)}`); }
  return r.json();
}
async function keysDeIds(base, ids) {
  const map = {};
  let auth = null;
  try { auth = authSvc(); } catch (e) { auth = null; }
  if (!auth || !ids.length) return map;
  const headers = { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' };
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const r = await fetch(`${base}/rest/api/3/search/jql`, {
      method: 'POST', headers,
      body: JSON.stringify({ jql: `id in (${lote.join(',')})`, fields: ['summary'], maxResults: 100 }),
    });
    if (!r.ok) continue;
    const d = await r.json();
    (d.issues || []).forEach((it) => { map[String(it.id)] = { key: it.key, resumo: (it.fields && it.fields.summary) || '' }; });
  }
  return map;
}

async function mover(req, res) {
  const b = await lerBody(req);
  const email = String(b.email || '').trim(), token = String(b.token || '').trim();
  if (!email || !email.includes('@') || !token) {
    return json(res, 400, { erro: 'Identifique-se (e-mail + token de API) para mover.' });
  }
  const base = jiraBase();
  const headers = { Authorization: authUser(email, token), Accept: 'application/json' };

  let taskId = String(b.taskId || '').trim();

  if (!taskId) {
    const alvo = String(b.alvo || '').trim().toUpperCase();
    if (!RE_PROJ.test(alvo)) return json(res, 400, { erro: 'Projeto destino inválido.' });
    const itens = Array.isArray(b.itens) ? b.itens : [];
    if (!itens.length) return json(res, 400, { erro: 'Nenhum ticket selecionado.' });
    if (itens.length > 200) return json(res, 400, { erro: 'Máximo de 200 tickets por vez.' });

    const rp = await fetch(`${base}/rest/api/3/project/${encodeURIComponent(alvo)}`, { headers });
    if (!rp.ok) { const t = await rp.text(); return json(res, 200, { ok: false, erro: `Destino ${alvo}: ${rp.status} ${t.slice(0, 150)}` }); }
    const pdata = await rp.json();
    const nomeParaId = {};
    (pdata.issueTypes || []).forEach((t) => { nomeParaId[(t.name || '').toLowerCase()] = t.id; });

    const grupos = {};
    const faltam = new Set();
    for (const it of itens) {
      const id = String((it && it.id) || '').trim();
      const tipoNome = String((it && it.tipo) || '').trim().toLowerCase();
      // Aceita id numérico OU chave do issue (ex.: RDF-123) — o bulk move do Jira aceita ambos.
      if (!/^\d+$/.test(id) && !RE_ISSUE.test(id)) return json(res, 400, { erro: 'Item inválido.' });
      const tId = nomeParaId[tipoNome];
      if (!tId) { faltam.add((it && it.tipo) || tipoNome); continue; }
      const chave = `${alvo},${tId}`;
      (grupos[chave] = grupos[chave] || []).push(id);
    }
    if (faltam.size) return json(res, 200, { ok: false, erro: `O projeto ${alvo} não tem o tipo: ${[...faltam].join(', ')}.` });

    const targetToSourcesMapping = {};
    Object.entries(grupos).forEach(([chave, ids]) => {
      targetToSourcesMapping[chave] = {
        inferClassificationDefaults: true,
        inferFieldDefaults: true,
        inferStatusDefaults: true,
        inferSubtaskTypeDefault: true,
        issueIdsOrKeys: ids,
      };
    });

    const r = await fetch(`${base}/rest/api/3/bulk/issues/move`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sendBulkNotification: false, targetToSourcesMapping }),
    });
    if (r.status === 401 || r.status === 403) {
      return json(res, 200, { ok: false, erro: 'Sem permissão — precisa de "Mover itens" na origem e "Criar" no destino.' });
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.taskId) {
      return json(res, 200, { ok: false, erro: `Jira ${r.status}: ${JSON.stringify(data).slice(0, 250)}` });
    }
    taskId = String(data.taskId);
  }

  let st = null;
  for (let i = 0; i < 10; i += 1) {
    st = await statusTask(base, headers, taskId);
    const s = (st.status || '').toUpperCase();
    if (s === 'COMPLETE' || s === 'FAILED' || s === 'CANCELLED') break;
    await delay(2500);
  }
  const s = (st && st.status || '').toUpperCase();
  if (s !== 'COMPLETE' && s !== 'FAILED' && s !== 'CANCELLED') {
    return json(res, 200, { ok: true, status: 'andamento', taskId, progresso: (st && st.progressPercent) || 0 });
  }
  if (s === 'FAILED' || s === 'CANCELLED') {
    return json(res, 200, { ok: false, status: s.toLowerCase(), taskId, erro: 'A movimentação não foi concluída no Jira.' });
  }

  const ids = (st.processedAccessibleIssues || []).map(String);
  const keys = await keysDeIds(base, ids);
  const movidos = ids.map((id) => ({ id, key: (keys[id] && keys[id].key) || id, resumo: (keys[id] && keys[id].resumo) || '' }));
  cacheClear('reunioes:'); cacheClear('atividade:'); cacheClear('venc:');
  return json(res, 200, {
    ok: true, status: 'completo', taskId, movidos,
    total: st.totalIssueCount || ids.length, invalidos: st.invalidOrInaccessibleIssueCount || 0,
  });
}

// ==================== Vincular reunião a ticket de AMS ====================
// ADF -> texto simples (parágrafos/bullets em linhas) e texto -> ADF.
function adfParaTexto(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return node.text || '';
  const filhos = (node.content || []).map(adfParaTexto);
  if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'listItem') {
    return filhos.join('').trim() + '\n';
  }
  return filhos.join('');
}
function textoParaAdf(texto) {
  return {
    type: 'doc', version: 1,
    content: String(texto).split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })),
  };
}
const fmtH = (seg) => (Math.round((seg / 3600) * 10) / 10).toLocaleString('pt-BR') + 'h';
const fmtDataBR = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

// Carrega a reunião (issue + worklogs) e devolve um resumo pronto para virar descrição/comentário.
async function carregaReuniao(base, headers, key) {
  const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,created,reporter,status,issuetype`, { headers });
  if (r.status === 404) throw new Error(`Reunião ${key} não encontrada (ou sem permissão).`);
  if (!r.ok) { const t = await r.text(); throw new Error(`Jira ${r.status}: ${t.slice(0, 200)}`); }
  const it = await r.json();
  const f = it.fields || {};
  const rw = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}/worklog?maxResults=100`, { headers });
  const wl = rw.ok ? await rw.json() : { worklogs: [] };
  const porPessoa = {};
  let totalSeg = 0;
  (wl.worklogs || []).forEach((w) => {
    const nome = (w.author && w.author.displayName) || '—';
    const s = Number(w.timeSpentSeconds) || 0;
    porPessoa[nome] = (porPessoa[nome] || 0) + s; totalSeg += s;
  });
  return {
    k: it.key, resumo: f.summary || '',
    desc: adfParaTexto(f.description).trim(),
    criado: (f.created || '').slice(0, 10),
    relator: (f.reporter && f.reporter.displayName) || '',
    tipo: (f.issuetype && f.issuetype.name) || '',
    status: (f.status && f.status.name) || '',
    horas: Object.entries(porPessoa).map(([nome, seg]) => ({ nome, seg })).sort((a, b) => b.seg - a.seg),
    totalSeg,
  };
}
function textoDetalhes(m) {
  const linhas = [
    `Reunião vinculada: ${m.k} — ${m.resumo}`,
    `Data: ${fmtDataBR(m.criado)}${m.relator ? ` · Relator: ${m.relator}` : ''}`,
  ];
  if (m.totalSeg > 0) {
    linhas.push(`Horas apontadas na reunião: ${fmtH(m.totalSeg)} (${m.horas.map((h) => `${h.nome} ${fmtH(h.seg)}`).join(' · ')})`);
  }
  if (m.desc) { linhas.push('', 'Descrição original:', m.desc); }
  linhas.push('', '— Registrado pelo painel Insights (Vincular Reuniões a Tickets de AMS); a reunião original foi excluída.');
  return linhas.join('\n');
}

// GET ?detalhe=KEY — detalhes da reunião (conta de serviço; leitura).
async function detalhe(req, res) {
  const key = String(req.query.detalhe || '').trim().toUpperCase();
  if (!RE_ISSUE.test(key)) return json(res, 400, { erro: 'Chave inválida.' });
  const base = jiraBase();
  const headers = { Authorization: authSvc(), Accept: 'application/json' };
  return json(res, 200, await carregaReuniao(base, headers, key));
}

// GET ?abertos=PROJ — tickets abertos do projeto destino (conta de serviço; cache curto).
async function abertos(req, res) {
  const projeto = String(req.query.abertos || '').trim().toUpperCase();
  if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
  const ck = `reuvinc:abertos:${projeto}`;
  const c = cacheGet(ck);
  if (c && !(req.query.nocache === '1')) return json(res, 200, c);
  const { issues, truncado } = await jiraSearchAll({
    jql: `project = ${projeto} AND statusCategory != Done ORDER BY updated DESC`,
    fields: ['summary', 'status', 'issuetype'], pageSize: 100, maxPages: 3,
  });
  const tickets = issues.map((it) => ({
    k: it.key, resumo: (it.fields && it.fields.summary) || '',
    status: (it.fields && it.fields.status && it.fields.status.name) || '',
    tipo: (it.fields && it.fields.issuetype && it.fields.issuetype.name) || '',
  }));
  return json(res, 200, cacheSetTTL(ck, { projeto, tickets, truncado }, 3));
}

// POST { vincular:1 } — cria/comenta no destino, worklog opcional e EXCLUI a reunião.
async function vincular(req, res, b) {
  const email = String(b.email || '').trim(); const token = String(b.token || '').trim();
  if (!email || !email.includes('@') || !token) return json(res, 400, { erro: 'Identifique-se (e-mail + token de API).' });
  const reuniaoKey = String(b.reuniao || '').trim().toUpperCase();
  if (!RE_ISSUE.test(reuniaoKey)) return json(res, 400, { erro: 'Reunião inválida.' });
  const modo = b.modo === 'existente' ? 'existente' : 'criar';
  const horasSeg = Math.max(0, Math.round((Number(b.horas) || 0) * 3600));

  const base = jiraBase();
  const headers = { Authorization: authUser(email, token), Accept: 'application/json', 'Content-Type': 'application/json' };

  // 1) Lê a reunião com o token da pessoa (garante que ela enxerga/pode operar).
  const m = await carregaReuniao(base, headers, reuniaoKey);
  const detalhes = textoDetalhes(m);

  let destinoKey = '';
  if (modo === 'criar') {
    const projeto = String(b.projeto || '').trim().toUpperCase();
    const tipoId = String(b.tipoId || '').trim();
    const resumo = String(b.resumo || '').trim().slice(0, 255) || `Apoio funcional — ${m.resumo}`.slice(0, 255);
    if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto destino inválido.' });
    if (!/^\d+$/.test(tipoId)) return json(res, 400, { erro: 'Tipo de ticket inválido.' });
    const rc = await fetch(`${base}/rest/api/3/issue`, {
      method: 'POST', headers,
      body: JSON.stringify({ fields: { project: { key: projeto }, issuetype: { id: tipoId }, summary: resumo, description: textoParaAdf(detalhes) } }),
    });
    const dc = await rc.json().catch(() => ({}));
    if (rc.status === 401 || rc.status === 403) return json(res, 200, { ok: false, erro: 'Sem permissão para criar no projeto destino (token/perfil).' });
    if (!rc.ok || !dc.key) {
      const msgs = dc.errorMessages || (dc.errors && Object.values(dc.errors)) || [];
      return json(res, 200, { ok: false, erro: `Falha ao criar: ${(msgs.join(' ') || JSON.stringify(dc)).slice(0, 250)}` });
    }
    destinoKey = dc.key;
  } else {
    destinoKey = String(b.ticket || '').trim().toUpperCase();
    if (!RE_ISSUE.test(destinoKey)) return json(res, 400, { erro: 'Ticket destino inválido.' });
    const rc = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(destinoKey)}/comment`, {
      method: 'POST', headers, body: JSON.stringify({ body: textoParaAdf(detalhes) }),
    });
    if (rc.status === 401 || rc.status === 403) return json(res, 200, { ok: false, erro: 'Sem permissão para comentar no ticket destino.' });
    if (!rc.ok) { const t = await rc.text(); return json(res, 200, { ok: false, erro: `Falha ao comentar: ${t.slice(0, 250)}` }); }
  }

  // 2) Worklog opcional (as horas da reunião morreriam com a exclusão).
  let worklogOk = null;
  if (b.worklog && horasSeg > 0) {
    const started = `${/^\d{4}-\d{2}-\d{2}$/.test(m.criado) ? m.criado : new Date().toISOString().slice(0, 10)}T12:00:00.000-0300`;
    const rw = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(destinoKey)}/worklog`, {
      method: 'POST', headers,
      body: JSON.stringify({ timeSpentSeconds: horasSeg, started, comment: textoParaAdf(`Reunião ${m.k} — ${m.resumo}`) }),
    });
    worklogOk = rw.ok;
  }

  // 3) Exclui a reunião — só depois que o destino foi gravado com sucesso.
  const rd = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(reuniaoKey)}?deleteSubtasks=true`, { method: 'DELETE', headers });
  const excluida = rd.status === 204;

  cacheClear('reunioes:'); cacheClear('reuvinc:'); cacheClear('atividade:'); cacheClear('venc:');
  return json(res, 200, {
    ok: true, modo, destino: destinoKey, worklogOk, excluida,
    erro: excluida ? '' : `O destino foi gravado, mas a exclusão de ${reuniaoKey} falhou (Jira ${rd.status}) — provavelmente falta a permissão "Excluir itens". Exclua manualmente.`,
  });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      const b = await lerBody(req);
      if (b.vincular) return await vincular(req, res, b);
      // mover() relê o corpo; repassa o já lido para não consumir o stream duas vezes.
      req.body = b;
      return await mover(req, res);
    }
    if (req.query && req.query.detalhe) return await detalhe(req, res);
    if (req.query && req.query.abertos) return await abertos(req, res);
    return await listar(req, res);
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
