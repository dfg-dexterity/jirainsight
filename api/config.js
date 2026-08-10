// GET  /api/config                      -> { configurado, data }  (config compartilhada do time)
// POST /api/config                       -> salva a configuração (metas/ausências/contratos)
// GET  /api/config?portal=<token>        -> painel do cliente (somente leitura, escopado ao
//                                           contrato dono do token): horas do ciclo (banco de
//                                           horas) + chamados abertos/fechados por período.
// POST /api/config?plan=1                -> Meu Planejamento (planejamento semanal por
//                                           atividade, SEM tickets): CRUD + fluxo de
//                                           aprovação + versões + histórico, nas tabelas
//                                           jirainsight_plan_* do Supabase. A identidade
//                                           vem do token do Jira (headers x-jira-email /
//                                           x-jira-token) — o accountId é resolvido no
//                                           servidor, nunca confiado do corpo.
//
// Guarda um único registro (id='default') na tabela `jirainsight_config` do Supabase.
import crypto from 'node:crypto';
import {
  json, jiraBase, jiraSearchAll, worklogsEnriquecidos, cacheGet, cacheSetTTL,
} from './_lib/util.js';

const TABELA = 'jirainsight_config';
const ID = 'default';

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

// ---- Autenticação da escrita: exige um token de API do Jira válido ----
// A config é compartilhada pelo time; qualquer pessoa autenticada do Jira pode editar,
// mas a gravação não pode ser anônima (senão qualquer um sobrescreve metas/contratos/tokens).
async function validaJira(req) {
  const email = String((req.headers['x-jira-email'] || '')).trim();
  const token = String((req.headers['x-jira-token'] || '')).trim();
  if (!email || !email.includes('@') || !token) {
    return { ok: false, erro: 'Autenticação necessária: configure suas credenciais do Jira (aba Apontar).' };
  }
  const base = jiraBase();
  if (!base) return { ok: false, erro: 'Jira não configurado no servidor.' };
  const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  try {
    const r = await fetch(`${base}/rest/api/3/myself`, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) return { ok: false, erro: 'Credenciais do Jira inválidas.' };
    if (!r.ok) return { ok: false, erro: `Jira ${r.status}` };
    const me = await r.json();
    return { ok: true, accountId: me.accountId || '', email: me.emailAddress || email, nome: me.displayName || '' };
  } catch (e) { return { ok: false, erro: 'Falha ao validar no Jira.' }; }
}

// ===================== 📋 Meu Planejamento (planejamento semanal) =====================
// Tabelas: jirainsight_plan_semana / _plan_itens / _plan_hist. Regras:
//   - o dono (accountId do token validado) só mexe no PRÓPRIO plano;
//   - gestores (config compartilhada `gestores`, por accountId/e-mail) decidem
//     pendências e leem relatórios; sem lista configurada, cai no aprovador
//     legado (nome/e-mail contendo "diego") para não travar a operação;
//   - transições: elaboracao|devolvido → enviado → aprovado|devolvido;
//     aprovado → (reabrir) elaboracao com versão+1; enviado → (retirar) elaboracao;
//   - concorrência otimista: escritas exigem o updated_at em que o cliente se
//     baseou (base); divergiu → {conflito:true, plano} sem sobrescrever nada.
const T_PLAN = 'jirainsight_plan_semana';
const T_ITENS = 'jirainsight_plan_itens';
const T_HIST = 'jirainsight_plan_hist';
const RE_DATA_P = /^\d{4}-\d{2}-\d{2}$/;
const RE_PROJ_P = /^[A-Za-z][A-Za-z0-9_]*$/;

// Identidade validada no Jira com cache curto (chave = hash do par credencial;
// o token NUNCA é gravado — só o digest efêmero em memória).
async function planAuth(req) {
  const email = String((req.headers['x-jira-email'] || '')).trim();
  const token = String((req.headers['x-jira-token'] || '')).trim();
  if (!email || !token) return { ok: false, erro: 'Identifique-se (e-mail + token do Jira) para usar o planejamento.' };
  const ck = 'plan:eu:' + crypto.createHash('sha256').update(`${email}|${token}`).digest('hex').slice(0, 32);
  const c = cacheGet(ck);
  if (c) return c;
  const v = await validaJira(req);
  if (!v.ok) return v;
  const me = { ok: true, accountId: v.accountId, email: v.email, nome: v.nome || '' };
  return cacheSetTTL(ck, me, 10);
}

function sbFetch(base, headers, caminho, opts) {
  return fetch(`${base}/rest/v1/${caminho}`, { ...(opts || {}), headers: { ...headers, ...((opts || {}).headers || {}) } });
}
async function sbRows(r) { if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`); return r.json(); }

// Gestores do planejamento: config compartilhada `gestores` (accountIds/e-mails).
async function planEhGestor(base, headers, quem) {
  try {
    const rows = await sbRows(await sbFetch(base, headers, `${TABELA}?id=eq.${ID}&select=data`));
    const lista = ((rows[0] && rows[0].data && rows[0].data.gestores) || [])
      .map((g) => String((g && (g.a || g.email)) || g || '').trim().toLowerCase()).filter(Boolean);
    if (lista.length) {
      return lista.includes(String(quem.accountId || '').toLowerCase())
        || lista.includes(String(quem.email || '').toLowerCase());
    }
  } catch (e) { /* sem config → fallback */ }
  return /diego/i.test(`${quem.nome || ''} ${quem.email || ''}`);   // aprovador legado
}

function planSegunda(d) { return segundaDaSemana(String(d || '').slice(0, 10)); }
function planErroItem(it, seg) {
  if (!it || typeof it !== 'object') return 'Item inválido.';
  const d = String(it.data || '');
  if (!RE_DATA_P.test(d) || d < seg || d > addDiasIso(seg, 6)) return 'Data fora da semana.';
  if (!RE_PROJ_P.test(String(it.projeto || ''))) return 'Projeto obrigatório.';
  const desc = String(it.descricao || '').trim();
  if (!desc) return 'Descrição obrigatória.';
  if (desc.length > 300) return 'Descrição longa demais (máx. 300).';
  const h = Number(it.horas);
  if (!(h > 0)) return 'Horas planejadas devem ser maiores que zero.';
  if (h > 24) return 'Horas acima de 24 num único dia.';
  if (String(it.categoria || '').length > 60) return 'Categoria longa demais.';
  if (String(it.observacao || '').length > 500) return 'Observação longa demais.';
  return '';
}
const planRound = (n) => Math.round(Number(n) * 100) / 100;

async function planDe(base, headers, accountId, semana) {
  const rows = await sbRows(await sbFetch(base, headers,
    `${T_PLAN}?account_id=eq.${encodeURIComponent(accountId)}&semana_inicio=eq.${semana}&select=*`));
  return rows[0] || null;
}
async function planItensDe(base, headers, planId) {
  return sbRows(await sbFetch(base, headers,
    `${T_ITENS}?planejamento_id=eq.${planId}&select=id,data,projeto,descricao,categoria,horas_planejadas,observacao,ordem&order=data.asc,ordem.asc`));
}
async function planHist(base, headers, reg) {
  await sbFetch(base, headers, T_HIST, {
    method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify([reg]),
  });
}
// Escrita no plano com trava otimista (updated_at precisa bater com a base do cliente).
async function planPatch(base, headers, planId, baseRev, campos) {
  const agora = new Date().toISOString();
  const filtroRev = baseRev ? `&updated_at=eq.${encodeURIComponent(baseRev)}` : '';
  const r = await sbFetch(base, headers, `${T_PLAN}?id=eq.${planId}${filtroRev}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...campos, updated_at: agora }),
  });
  const rows = await sbRows(r);
  return rows[0] || null;   // null = a rev não bateu (outra aba gravou antes)
}
function planPublico(p, itens) {
  if (!p) return null;
  return {
    id: p.id, accountId: p.account_id, nome: p.usuario_nome, email: p.usuario_email,
    semana: p.semana_inicio, status: p.status, versao: p.versao,
    total: Number(p.total_planejado) || 0,
    enviadoEm: p.enviado_em, aprovadoEm: p.aprovado_em, aprovadoPor: p.aprovado_por,
    devolvidoEm: p.devolvido_em, devolvidoPor: p.devolvido_por,
    comentarioGestor: p.comentario_gestor || '', atualizadoEm: p.updated_at,
    ...(itens ? {
      itens: itens.map((i) => ({
        id: i.id, data: i.data, projeto: i.projeto, descricao: i.descricao,
        categoria: i.categoria || '', horas: Number(i.horas_planejadas) || 0,
        observacao: i.observacao || '', ordem: i.ordem || 0,
      })),
    } : {}),
  };
}

async function planejamento(req, res, base, headers) {
  const quem = await planAuth(req);
  if (!quem.ok) return json(res, 401, { ok: false, erro: quem.erro });
  const b = await lerBody(req);
  const acao = String(b.acao || '');
  const agora = new Date().toISOString();

  // ---- meu: plano da pessoa na semana (cria a visão vazia sem gravar nada) ----
  if (acao === 'meu') {
    const semana = planSegunda(b.semana);
    if (!semana) return json(res, 400, { ok: false, erro: 'Semana inválida.' });
    const p = await planDe(base, headers, quem.accountId, semana);
    if (!p) return json(res, 200, { ok: true, plano: null, gestor: await planEhGestor(base, headers, quem) });
    const itens = await planItensDe(base, headers, p.id);
    return json(res, 200, { ok: true, plano: planPublico(p, itens), gestor: await planEhGestor(base, headers, quem) });
  }

  // ---- salvar: substitui os itens do MEU plano (só em elaboração/devolvido) ----
  if (acao === 'salvar') {
    const semana = planSegunda(b.semana);
    if (!semana) return json(res, 400, { ok: false, erro: 'Semana inválida.' });
    const itens = Array.isArray(b.itens) ? b.itens : [];
    if (itens.length > 80) return json(res, 400, { ok: false, erro: 'Máximo de 80 atividades por semana.' });
    for (const it of itens) {
      const e = planErroItem(it, semana);
      if (e) return json(res, 400, { ok: false, erro: e });
    }
    let p = await planDe(base, headers, quem.accountId, semana);
    if (p && !['elaboracao', 'devolvido'].includes(p.status)) {
      return json(res, 200, { ok: false, erro: p.status === 'enviado' ? 'Plano aguardando decisão do gestor — retire o envio para editar.' : 'Plano aprovado — use "Reabrir planejamento" para alterar.', plano: planPublico(p) });
    }
    const total = planRound(itens.reduce((s, i) => s + Number(i.horas), 0));
    if (!p) {
      const r = await sbFetch(base, headers, T_PLAN, {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify([{
          account_id: quem.accountId, usuario_nome: quem.nome || '', usuario_email: quem.email || '',
          semana_inicio: semana, status: 'elaboracao', versao: 1, total_planejado: total,
          created_at: agora, updated_at: agora,
        }]),
      });
      p = (await sbRows(r))[0];
    } else {
      const upd = await planPatch(base, headers, p.id, b.base || '', {
        total_planejado: total, usuario_nome: quem.nome || p.usuario_nome, usuario_email: quem.email || p.usuario_email,
      });
      if (!upd) {
        const atual = await planDe(base, headers, quem.accountId, semana);
        const its = atual ? await planItensDe(base, headers, atual.id) : [];
        return json(res, 200, { ok: false, conflito: true, erro: 'O plano foi alterado em outra aba/navegador — recarregado para você conferir.', plano: planPublico(atual, its) });
      }
      p = upd;
    }
    await sbFetch(base, headers, `${T_ITENS}?planejamento_id=eq.${p.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    if (itens.length) {
      await sbRows(await sbFetch(base, headers, T_ITENS, {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify(itens.map((i, ix) => ({
          planejamento_id: p.id, data: i.data, projeto: String(i.projeto).toUpperCase(),
          descricao: String(i.descricao).trim().slice(0, 300), categoria: String(i.categoria || '').trim().slice(0, 60),
          horas_planejadas: planRound(i.horas), observacao: String(i.observacao || '').trim().slice(0, 500),
          ordem: Number.isFinite(+i.ordem) ? +i.ordem : ix,
        }))),
      }));
    }
    const its = await planItensDe(base, headers, p.id);
    return json(res, 200, { ok: true, plano: planPublico(p, its) });
  }

  // ---- enviar / retirar / reabrir: transições do MEU plano ----
  if (acao === 'enviar' || acao === 'retirar' || acao === 'reabrir') {
    const semana = planSegunda(b.semana);
    const p = semana ? await planDe(base, headers, quem.accountId, semana) : null;
    if (!p) return json(res, 400, { ok: false, erro: 'Plano não encontrado.' });
    const itens = await planItensDe(base, headers, p.id);
    let campos = null; let hist = null;
    if (acao === 'enviar') {
      if (!['elaboracao', 'devolvido'].includes(p.status)) return json(res, 200, { ok: false, erro: 'Este plano não está em edição.', plano: planPublico(p) });
      if (!itens.length) return json(res, 400, { ok: false, erro: 'Adicione pelo menos uma atividade antes de enviar.' });
      campos = { status: 'enviado', enviado_em: agora };
      hist = { acao: p.status === 'devolvido' ? 'reenviado' : 'enviado', snap: true };
    } else if (acao === 'retirar') {
      if (p.status !== 'enviado') return json(res, 200, { ok: false, erro: 'O plano não está aguardando decisão.', plano: planPublico(p) });
      campos = { status: 'elaboracao' };
      hist = { acao: 'envio_retirado', snap: false };
    } else {
      if (p.status !== 'aprovado') return json(res, 200, { ok: false, erro: 'Só planos aprovados precisam ser reabertos.', plano: planPublico(p) });
      campos = { status: 'elaboracao', versao: (p.versao || 1) + 1 };
      hist = { acao: 'reaberto', snap: true };
    }
    const upd = await planPatch(base, headers, p.id, b.base || '', campos);
    if (!upd) {
      const atual = await planDe(base, headers, quem.accountId, semana);
      return json(res, 200, { ok: false, conflito: true, erro: 'O plano mudou em outra aba — recarregue.', plano: planPublico(atual, atual ? await planItensDe(base, headers, atual.id) : []) });
    }
    await planHist(base, headers, {
      planejamento_id: p.id, versao: p.versao || 1, acao: hist.acao,
      status_anterior: p.status, status_novo: campos.status, executado_por: `${quem.nome || ''} <${quem.email || ''}>`.trim(),
      executado_em: agora, comentario: '',
      snapshot: hist.snap ? { total: Number(p.total_planejado) || 0, itens } : null,
    });
    return json(res, 200, { ok: true, plano: planPublico(upd, itens) });
  }

  // ---- semana: totais/status dos planos de uma semana OU faixa (visão de equipe) ----
  if (acao === 'semana') {
    const de = planSegunda(b.de || b.semana);
    const ate = planSegunda(b.ate || b.semana) || de;
    if (!de) return json(res, 400, { ok: false, erro: 'Semana inválida.' });
    const rows = await sbRows(await sbFetch(base, headers,
      `${T_PLAN}?semana_inicio=gte.${de}&semana_inicio=lte.${ate}&select=account_id,usuario_nome,status,versao,total_planejado,enviado_em,semana_inicio`));
    return json(res, 200, { ok: true, planos: rows.map((p) => ({ accountId: p.account_id, nome: p.usuario_nome, status: p.status, versao: p.versao, total: Number(p.total_planejado) || 0, enviadoEm: p.enviado_em, semana: p.semana_inicio })) });
  }

  // ---- Daqui para baixo: ações de GESTOR (ou dono, no caso do "ver") ----
  const gestor = await planEhGestor(base, headers, quem);

  if (acao === 'ver') {
    const semana = planSegunda(b.semana);
    const alvo = String(b.accountId || quem.accountId);
    if (alvo !== quem.accountId && !gestor) return json(res, 403, { ok: false, erro: 'Só gestores podem ver o planejamento de outra pessoa.' });
    const p = semana ? await planDe(base, headers, alvo, semana) : null;
    if (!p) return json(res, 200, { ok: true, plano: null });
    const [itens, hist] = await Promise.all([
      planItensDe(base, headers, p.id),
      sbRows(await sbFetch(base, headers, `${T_HIST}?planejamento_id=eq.${p.id}&select=versao,acao,status_anterior,status_novo,executado_por,executado_em,comentario&order=executado_em.desc&limit=40`)),
    ]);
    return json(res, 200, { ok: true, plano: planPublico(p, itens), historico: hist });
  }

  if (!gestor) return json(res, 403, { ok: false, erro: 'Ação restrita aos gestores do planejamento (configure em ⚙️ Configurações).' });

  // ---- pendencias: planos enviados aguardando decisão (com itens) ----
  if (acao === 'pendencias') {
    const rows = await sbRows(await sbFetch(base, headers, `${T_PLAN}?status=eq.enviado&select=*&order=enviado_em.asc`));
    const out = [];
    for (const p of rows) out.push(planPublico(p, await planItensDe(base, headers, p.id)));
    return json(res, 200, { ok: true, pendencias: out });
  }

  // ---- decidir: aprovar ou devolver (comentário obrigatório na devolução) ----
  if (acao === 'decidir') {
    const id = String(b.id || '');
    const decisao = String(b.decisao || '');
    const comentario = String(b.comentario || '').trim().slice(0, 800);
    if (!/^[0-9a-f-]{36}$/.test(id)) return json(res, 400, { ok: false, erro: 'Plano inválido.' });
    if (!['aprovar', 'devolver'].includes(decisao)) return json(res, 400, { ok: false, erro: 'Decisão inválida.' });
    if (decisao === 'devolver' && !comentario) return json(res, 400, { ok: false, erro: 'Informe o motivo da devolução (comentário obrigatório).' });
    const rows = await sbRows(await sbFetch(base, headers, `${T_PLAN}?id=eq.${id}&select=*`));
    const p = rows[0];
    if (!p) return json(res, 404, { ok: false, erro: 'Plano não encontrado.' });
    if (p.status !== 'enviado') return json(res, 200, { ok: false, erro: 'Este plano não está mais aguardando decisão.', plano: planPublico(p) });
    const quemStr = `${quem.nome || ''} <${quem.email || ''}>`.trim();
    const campos = decisao === 'aprovar'
      ? { status: 'aprovado', aprovado_em: agora, aprovado_por: quemStr, comentario_gestor: comentario }
      : { status: 'devolvido', devolvido_em: agora, devolvido_por: quemStr, comentario_gestor: comentario };
    const upd = await planPatch(base, headers, p.id, b.base || '', campos);
    if (!upd) return json(res, 200, { ok: false, conflito: true, erro: 'O plano mudou enquanto você decidia — recarregue as pendências.' });
    const itens = await planItensDe(base, headers, p.id);
    await planHist(base, headers, {
      planejamento_id: p.id, versao: p.versao || 1, acao: decisao === 'aprovar' ? 'aprovado' : 'devolvido',
      status_anterior: 'enviado', status_novo: campos.status, executado_por: quemStr,
      executado_em: agora, comentario, snapshot: { total: Number(p.total_planejado) || 0, itens },
    });
    return json(res, 200, { ok: true, plano: planPublico(upd, itens) });
  }

  // ---- relatorio: planos + itens num intervalo de semanas (o realizado o front
  //      junta via /api/tempo, agrupando accountId + data + projeto) ----
  if (acao === 'relatorio') {
    const de = planSegunda(b.de); const ate = planSegunda(b.ate) || de;
    if (!de) return json(res, 400, { ok: false, erro: 'Período inválido.' });
    const rows = await sbRows(await sbFetch(base, headers,
      `${T_PLAN}?semana_inicio=gte.${de}&semana_inicio=lte.${ate}&select=*&order=semana_inicio.asc`));
    const ids = rows.map((p) => p.id);
    let itens = [];
    if (ids.length) {
      itens = await sbRows(await sbFetch(base, headers,
        `${T_ITENS}?planejamento_id=in.(${ids.join(',')})&select=planejamento_id,data,projeto,descricao,categoria,horas_planejadas&order=data.asc`));
    }
    const porPlan = {};
    itens.forEach((i) => { (porPlan[i.planejamento_id] = porPlan[i.planejamento_id] || []).push(i); });
    return json(res, 200, { ok: true, planos: rows.map((p) => planPublico(p, porPlan[p.id] || [])) });
  }

  return json(res, 400, { ok: false, erro: 'Ação desconhecida.' });
}

// ---- AMS: ciclo de apuração vigente (espelha a lógica do front) ----
const AMS_MESES = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
function spHoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function cicloVigente(c, ref) {
  ref = ref || spHoje();
  const cm = AMS_MESES[c.apuracao] || 3;
  let baseY; let baseM;
  if (c.inicio && /^\d{4}-\d{2}/.test(c.inicio)) { baseY = +c.inicio.slice(0, 4); baseM = +c.inicio.slice(5, 7) - 1; } else { baseY = +ref.slice(0, 4); baseM = 0; }
  const refY = +ref.slice(0, 4); const refM = +ref.slice(5, 7) - 1;
  let diff = (refY - baseY) * 12 + (refM - baseM); if (diff < 0) diff = 0;
  const idx = Math.floor(diff / cm); const startIdx = baseM + idx * cm;
  const start = `${baseY + Math.floor(startIdx / 12)}-${String(startIdx % 12 + 1).padStart(2, '0')}-01`;
  const endIdx = startIdx + cm;
  const endExcl = `${baseY + Math.floor(endIdx / 12)}-${String(endIdx % 12 + 1).padStart(2, '0')}-01`;
  const ed = new Date(`${endExcl}T00:00:00Z`); ed.setUTCDate(ed.getUTCDate() - 1);
  const end = ed.toISOString().slice(0, 10);
  const meses = [];
  for (let k = 0; k < cm; k += 1) { const mi = startIdx + k; meses.push(`${baseY + Math.floor(mi / 12)}-${String(mi % 12 + 1).padStart(2, '0')}`); }
  return { start, end, endExcl, meses, cm };
}
function segundaDaSemana(iso) { if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - wd); return dt.toISOString().slice(0, 10); }
function addDiasIso(iso, n) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }

async function portal(req, res, base, headers, token) {
  // Carrega os contratos da config e localiza o dono do token (escopo de dados).
  const r = await fetch(`${base}/rest/v1/${TABELA}?id=eq.${ID}&select=data`, { headers });
  const rows = r.ok ? await r.json() : [];
  const data = (Array.isArray(rows) && rows[0] && rows[0].data) || {};
  const contratos = Array.isArray(data.contratos) ? data.contratos : [];
  const c = contratos.find((x) => x && x.portalToken && x.portalToken === token);
  if (!c) return json(res, 200, { ok: false, erro: 'Link inválido ou expirado.' });

  // Projetos do cliente (sanitizados para a JQL).
  const projetos = (c.projetos || []).filter((p) => /^[A-Za-z][A-Za-z0-9_]*$/.test(p));
  const ref = (req.query && /^\d{4}-\d{2}-\d{2}$/.test(req.query.ref || '')) ? req.query.ref : spHoje();
  const cyc = cicloVigente(c, ref);
  const hoje = spHoje();
  const ateWl = cyc.end < hoje ? cyc.end : hoje;   // não busca worklogs no futuro

  const out = {
    ok: true,
    cliente: c.cliente || 'Cliente',
    apuracao: c.apuracao || 'trimestral',
    ciclo: { start: cyc.start, end: cyc.end, meses: cyc.meses },
    horas: {
      contratadasCiclo: Number(c.horasCiclo != null ? c.horasCiclo : c.horasContratadas) || 0,
      minMes: Number(c.minMes) || 0, tetoMes: Number(c.tetoMes) || 0,
      // consumidoSeg = todas as horas do ciclo; faturavelSeg = só as faturáveis (estas consomem o pacote).
      consumidoSeg: 0, faturavelSeg: 0, porMes: {}, bancoSeg: 0, excedenteSeg: 0,
    },
    valor: { hora: Number(c.valorHora) || 0, parcela: 0, excedente: 0, total: 0 },
    chamados: { abertosPorMes: {}, fechadosPorMes: {}, abertosTotal: 0, fechadosTotal: 0, porCausa: [] },
  };
  cyc.meses.forEach((m) => { out.horas.porMes[m] = 0; out.chamados.abertosPorMes[m] = 0; out.chamados.fechadosPorMes[m] = 0; });

  if (!projetos.length) return json(res, 200, out);

  // --- Horas do ciclo (Clockwork, escopado aos projetos do cliente) ---
  try {
    const enr = await worklogsEnriquecidos(cyc.start, ateWl);
    const set = new Set(projetos);
    enr.worklogs.forEach((w) => {
      if (!set.has(w.p)) return;
      const ym = (w.d || '').slice(0, 7);
      if (!(ym in out.horas.porMes)) return;
      const s = Number(w.s) || 0;
      out.horas.consumidoSeg += s; out.horas.porMes[ym] += s;
      if (w.f) out.horas.faturavelSeg += s;
    });
  } catch (e) { out.horas.erro = String(e && e.message ? e.message : e); }

  // Só as horas faturáveis consomem o pacote/excedente (as não faturáveis ficam fora da apuração).
  const poolSeg = out.horas.contratadasCiclo * 3600;
  out.horas.bancoSeg = Math.max(0, poolSeg - out.horas.faturavelSeg);
  out.horas.excedenteSeg = Math.max(0, out.horas.faturavelSeg - poolSeg);
  out.valor.parcela = out.horas.contratadasCiclo * out.valor.hora;
  out.valor.excedente = (out.horas.excedenteSeg / 3600) * out.valor.hora;
  out.valor.total = out.valor.parcela + out.valor.excedente;

  // --- Chamados abertos/fechados no ciclo (Jira, escopado aos projetos) ---
  const projJql = projetos.join(', ');
  const semAb = {}; const semFe = {};   // contagem por semana (segunda-feira)
  try {
    const { issues } = await jiraSearchAll({
      jql: `project in (${projJql}) AND created >= "${cyc.start}" AND created < "${cyc.endExcl}" ORDER BY created ASC`,
      fields: ['created', 'components', 'labels'], pageSize: 100, maxPages: 12,
    });
    const causa = {};
    issues.forEach((it) => {
      const f = it.fields || {};
      const ym = (f.created || '').slice(0, 7);
      if (ym in out.chamados.abertosPorMes) out.chamados.abertosPorMes[ym] += 1;
      out.chamados.abertosTotal += 1;
      const wk = segundaDaSemana((f.created || '').slice(0, 10)); if (wk) semAb[wk] = (semAb[wk] || 0) + 1;
      (f.components || []).forEach((cp) => { const n = cp && cp.name; if (n) causa[n] = (causa[n] || 0) + 1; });
      (f.labels || []).forEach((lb) => { if (lb) causa[lb] = (causa[lb] || 0) + 1; });
    });
    out.chamados.porCausa = Object.entries(causa).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([nome, n]) => ({ nome, n }));
  } catch (e) { out.chamados.erro = String(e && e.message ? e.message : e); }

  try {
    const { issues } = await jiraSearchAll({
      jql: `project in (${projJql}) AND resolutiondate >= "${cyc.start}" AND resolutiondate < "${cyc.endExcl}" ORDER BY resolutiondate ASC`,
      fields: ['resolutiondate'], pageSize: 100, maxPages: 12,
    });
    issues.forEach((it) => {
      const rd = (it.fields && it.fields.resolutiondate) || '';
      const ym = rd.slice(0, 7);
      if (ym in out.chamados.fechadosPorMes) out.chamados.fechadosPorMes[ym] += 1;
      out.chamados.fechadosTotal += 1;
      const wk = segundaDaSemana(rd.slice(0, 10)); if (wk) semFe[wk] = (semFe[wk] || 0) + 1;
    });
  } catch (e) { out.chamados.erroFech = String(e && e.message ? e.message : e); }

  // Série semanal (abertos/fechados) + backlog acumulado (net = Σ abertos − fechados).
  out.chamados.semanas = [];
  let wkc = segundaDaSemana(cyc.start); let guard = 0; let backlog = 0;
  const fimSem = cyc.end < hoje ? cyc.end : hoje;
  while (wkc && wkc <= fimSem && guard < 80) {
    const ab = semAb[wkc] || 0; const fe = semFe[wkc] || 0; backlog += (ab - fe);
    out.chamados.semanas.push({ ini: wkc, ab, fe, backlog });
    wkc = addDiasIso(wkc, 7); guard += 1;
  }

  return json(res, 200, out);
}

export default async function handler(req, res) {
  // GET /api/config?versao=1 → versão do deploy (commit/PR), injetada pela Vercel no runtime.
  // O merge squash guarda o nº do PR no fim da mensagem do commit: "Título (#60)".
  if (req.query && req.query.versao) {
    const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
    const msg = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || '').split('\n')[0];
    const m = msg.match(/\(#(\d+)\)\s*$/);
    const owner = String(process.env.VERCEL_GIT_REPO_OWNER || 'dfg-dexterity');
    const repo = String(process.env.VERCEL_GIT_REPO_SLUG || 'jirainsight');
    return json(res, 200, {
      sha, pr: m ? m[1] : '', titulo: msg.replace(/\s*\(#\d+\)\s*$/, '').slice(0, 140),
      url: `https://github.com/${owner}/${repo}`,
    });
  }
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  const token = String((req.query && req.query.portal) || '');

  if (token && (!base || !key)) return json(res, 200, { ok: false, erro: 'Supabase não configurado.' });
  if (!base || !key) return json(res, 200, { configurado: false });

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    if (token) return await portal(req, res, base, headers, token);

    // 📋 Meu Planejamento: sub-API própria (sempre POST, com identidade do Jira).
    if (req.query && req.query.plan) {
      if (req.method !== 'POST') return json(res, 405, { ok: false, erro: 'Use POST' });
      return await planejamento(req, res, base, headers);
    }

    if (req.method === 'POST') {
      const auth = await validaJira(req);
      if (!auth.ok) return json(res, 401, { configurado: true, ok: false, erro: auth.erro });
      const body = await lerBody(req);
      const data = (body && typeof body === 'object' && !Array.isArray(body)) ? body : {};
      // Concorrência otimista: o cliente manda a rev (updated_at) da config em que se
      // baseou. Se outra pessoa/aba gravou depois, RECUSAMOS a sobrescrita e devolvemos
      // o remoto para o cliente mesclar — nunca last-writer-wins do documento inteiro.
      const baseRev = String(data.__rev || '');
      delete data.__rev;
      // Guarda de tamanho: a config do time é pequena; rejeita payloads anômalos.
      if (JSON.stringify(data).length > 262144) {
        return json(res, 413, { configurado: true, ok: false, erro: 'Configuração grande demais.' });
      }
      const rAt = await fetch(`${base}/rest/v1/${TABELA}?id=eq.${ID}&select=data,updated_at`, { headers });
      const rowsAt = rAt.ok ? await rAt.json() : [];
      const atual = Array.isArray(rowsAt) && rowsAt[0];
      // Compara por época: o Postgres devolve "+00:00" e o JS grava "Z" — a string
      // difere mesmo quando o instante é o mesmo (senão todo salvar viraria conflito).
      const emMs = (s) => { const t = Date.parse(String(s || '')); return Number.isFinite(t) ? t : null; };
      if (atual && atual.updated_at && emMs(baseRev) !== emMs(atual.updated_at)) {
        // Também bloqueia clientes antigos (sem __rev): eles precisam recarregar a página.
        return json(res, 200, {
          configurado: true, ok: false, conflito: true,
          data: atual.data || {}, rev: atual.updated_at,
          erro: 'A config foi alterada por outra pessoa/aba — mesclando e tentando de novo.',
        });
      }
      const novoRev = new Date().toISOString();
      const payload = [{ id: ID, data, updated_at: novoRev }];
      const r = await fetch(`${base}/rest/v1/${TABELA}?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text();
        return json(res, 200, { configurado: true, ok: false, erro: t.slice(0, 300) });
      }
      return json(res, 200, { configurado: true, ok: true, rev: novoRev });
    }

    const r = await fetch(`${base}/rest/v1/${TABELA}?id=eq.${ID}&select=data,updated_at`, { headers });
    if (!r.ok) {
      const t = await r.text();
      return json(res, 200, { configurado: true, data: {}, erro: t.slice(0, 300) });
    }
    const rows = await r.json();
    const data = (Array.isArray(rows) && rows[0] && rows[0].data) || {};
    const rev = (Array.isArray(rows) && rows[0] && rows[0].updated_at) || '';
    return json(res, 200, { configurado: true, data, rev });
  } catch (err) {
    return json(res, 200, { configurado: true, ok: false, erro: String(err && err.message ? err.message : err) });
  }
}
