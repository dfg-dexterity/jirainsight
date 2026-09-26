// GET  /api/config                      -> { configurado, data }  (config compartilhada do time)
// POST /api/config                       -> salva a configuração (metas/ausências/contratos)
// GET  /api/config?portal=<token>        -> painel do cliente (somente leitura, escopado ao
//                                           contrato dono do token): horas do ciclo (banco de
//                                           horas) + chamados abertos/fechados por período.
//      /api/config?pcli=<ação>            -> 🔐 ÁREA DO CLIENTE (conta com e-mail e senha):
//                                           login · convite/definir · dados · trocar-senha
//                                           (sessão assinada, cabeçalho Authorization) e,
//                                           para o gestor (headers x-jira-*), contas ·
//                                           convidar · revogar · reativar · remover.
//                                           A conta é amarrada a UM contrato: é ele que
//                                           define o escopo — o pedido nunca escolhe.
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

  // ---- relatorio: planos + itens num intervalo de semanas (o realizado o front
  //      junta via /api/tempo, agrupando accountId + data + projeto).
  //      ABERTO a todos os usuários identificados (pedido de 2026-08-17):
  //      os relatórios são do time; só DECIDIR (aprovar/devolver) e listar
  //      pendências seguem restritos ao gestor. ----
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

  return json(res, 400, { ok: false, erro: 'Ação desconhecida.' });
}

// ============================================================================
// 🎯 Prioridades do time — log de decisões e próximas ações (POST /api/config?dec=1).
// Contrato da decisão: frase no perfeito + dono + prazo + ticket Jira. Estados:
// aberta → concluida | reprazada (1×; a 2ª volta como pauta) | escalada | revogada.
// Decisão nunca é apagada — revogar é status. Auth = mesma do planejamento
// (token do Jira validado por requisição; identidade sempre do servidor).
const T_DEC = 'jirainsight_decisoes';
const RE_TICKET_D = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
function decPublico(d) {
  return {
    id: d.id, decisao: d.decisao, tipo: d.tipo, status: d.status,
    reprazos: d.reprazos || 0,
    dono: { accountId: d.dono_account_id || '', nome: d.dono_nome || '' },
    prazo: d.prazo || '', ticket: d.ticket || '', projeto: d.projeto || '',
    contexto: d.contexto || '', ataUrl: d.ata_url || '',
    decididoEm: d.decidido_em || '', atualizadoEm: d.updated_at,
  };
}
async function decisoes(req, res, base, headers) {
  const quem = await planAuth(req);
  if (!quem.ok) return json(res, 401, { ok: false, erro: quem.erro });
  const raw = await lerBody(req);
  const b = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const acao = String(b.acao || '');
  const agora = new Date().toISOString();

  if (acao === 'listar') {
    const soAbertas = b.status !== 'todas';
    const fStatus = soAbertas ? '&status=in.(aberta,reprazada,escalada)' : '';
    const fProj = RE_PROJ_P.test(String(b.projeto || '')) ? `&projeto=eq.${b.projeto}` : '';
    const rows = await sbRows(await sbFetch(base, headers,
      `${T_DEC}?select=*${fStatus}${fProj}&order=prazo.asc.nullslast,criado_em.asc&limit=200`));
    return json(res, 200, { ok: true, decisoes: rows.map(decPublico) });
  }

  if (acao === 'registrar') {
    const texto = String(b.decisao || '').trim();
    if (!texto) return json(res, 400, { ok: false, erro: 'Escreva a decisão em uma frase.' });
    if (texto.length > 300) return json(res, 400, { ok: false, erro: 'Decisão longa demais (máx. 300).' });
    const ticket = String(b.ticket || '').trim().toUpperCase();
    if (!RE_TICKET_D.test(ticket)) return json(res, 400, { ok: false, erro: 'Informe o ticket Jira vinculado (ex.: CCDV-2) — sem rastro em ticket, a decisão não é auditável.' });
    const prazo = RE_DATA_P.test(String(b.prazo || '')) ? b.prazo : '';
    if (!prazo) return json(res, 400, { ok: false, erro: 'Informe o prazo (data concreta).' });
    const dono = (b.dono && typeof b.dono === 'object') ? b.dono : {};
    const reg = {
      decisao: texto,
      tipo: b.tipo === 'proxima-acao' ? 'proxima-acao' : 'decisao',
      status: 'aberta',
      dono_account_id: String(dono.accountId || quem.accountId).slice(0, 128),
      dono_nome: String(dono.nome || quem.nome || '').slice(0, 120),
      prazo,
      ticket,
      projeto: ticket.split('-')[0],
      contexto: String(b.contexto || '').trim().slice(0, 500),
      decidido_em: String(b.decididoEm || '').slice(0, 10) || agora.slice(0, 10),
      registrado_por: quem.accountId,
      updated_at: agora,
    };
    const rows = await sbRows(await sbFetch(base, headers, T_DEC, {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify([reg]),
    }));
    return json(res, 200, { ok: true, decisao: decPublico(rows[0]) });
  }

  if (acao === 'atualizar') {
    const id = String(b.id || '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return json(res, 400, { ok: false, erro: 'Decisão inválida.' });
    const atual = (await sbRows(await sbFetch(base, headers, `${T_DEC}?id=eq.${id}&select=*`)))[0];
    if (!atual) return json(res, 400, { ok: false, erro: 'Decisão não encontrada.' });
    const campos = {};
    const st = String(b.status || '');
    if (st) {
      if (!['concluida', 'reprazada', 'escalada', 'revogada', 'aberta'].includes(st)) {
        return json(res, 400, { ok: false, erro: 'Status inválido.' });
      }
      campos.status = st;
      if (st === 'reprazada') {
        if (!RE_DATA_P.test(String(b.prazo || ''))) return json(res, 400, { ok: false, erro: 'Reprazar exige a nova data.' });
        campos.prazo = b.prazo;
        campos.reprazos = (atual.reprazos || 0) + 1;
      }
    }
    if (b.ataUrl !== undefined) campos.ata_url = String(b.ataUrl || '').slice(0, 500);
    if (!Object.keys(campos).length) return json(res, 400, { ok: false, erro: 'Nada para atualizar.' });
    // Trava otimista: a escrita exige a revisão em que o cliente se baseou.
    const baseRev = String(b.base || '');
    const filtroRev = baseRev ? `&updated_at=eq.${encodeURIComponent(baseRev)}` : '';
    const rows = await sbRows(await sbFetch(base, headers, `${T_DEC}?id=eq.${id}${filtroRev}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...campos, updated_at: agora }),
    }));
    if (!rows[0]) return json(res, 200, { ok: false, conflito: true, decisao: decPublico(atual) });
    return json(res, 200, { ok: true, decisao: decPublico(rows[0]) });
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
// Uma linha da lista de chamados do portal. SÓ o que o cliente pode ver: chave, assunto,
// tipo, situação, datas e as horas gastas — nada de pessoa, comentário interno ou custo.
function linhaChamado(it, horas) {
  const f = it.fields || {};
  const st = f.status || {};
  const cat = ((st.statusCategory || {}).key) || '';
  return {
    k: it.key,
    resumo: String(f.summary || '').slice(0, 160),
    tipo: (f.issuetype && f.issuetype.name) || '',
    status: st.name || '',
    // aberto | andamento | concluido — o portal pinta por aqui, sem depender do nome do fluxo.
    fase: cat === 'done' ? 'concluido' : (cat === 'indeterminate' ? 'andamento' : 'aberto'),
    criado: String(f.created || '').slice(0, 10),
    fechado: String(f.resolutiondate || '').slice(0, 10),
    seg: (horas && horas.seg) || 0,
    segFat: (horas && horas.fat) || 0,
  };
}

// Contratos da config compartilhada — a fonte dos projetos e da apuração de cada cliente.
async function contratosDaConfig(base, headers) {
  const r = await fetch(`${base}/rest/v1/${TABELA}?id=eq.${ID}&select=data`, { headers });
  const rows = r.ok ? await r.json() : [];
  const data = (Array.isArray(rows) && rows[0] && rows[0].data) || {};
  return Array.isArray(data.contratos) ? data.contratos : [];
}
// Link antigo (?portal=<token>): o token do contrato é o próprio controle de acesso.
async function portal(req, res, base, headers, token) {
  const contratos = await contratosDaConfig(base, headers);
  const c = contratos.find((x) => x && x.portalToken && x.portalToken === token);
  if (!c) return json(res, 200, { ok: false, erro: 'Link inválido ou expirado.' });
  return await portalDados(req, res, c);
}
// Monta o painel para UM contrato JÁ RESOLVIDO — pelo link antigo ou pela conta logada.
// O escopo dos dados é sempre este contrato: nada aqui lê nome de cliente do pedido.
async function portalDados(req, res, c) {
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
    chamados: { abertosPorMes: {}, fechadosPorMes: {}, abertosTotal: 0, fechadosTotal: 0, porCausa: [], lista: [] },
  };
  cyc.meses.forEach((m) => { out.horas.porMes[m] = 0; out.chamados.abertosPorMes[m] = 0; out.chamados.fechadosPorMes[m] = 0; });

  if (!projetos.length) return json(res, 200, out);

  // --- Horas do ciclo (Clockwork, escopado aos projetos do cliente) ---
  // segPorChave alimenta a LISTA de chamados: é por ela que um chamado aberto ANTES do
  // ciclo, mas trabalhado dentro dele, também aparece para o cliente.
  const segPorChave = {};
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
      const k = w.k || '';
      if (k) { const o = segPorChave[k] || (segPorChave[k] = { seg: 0, fat: 0 }); o.seg += s; if (w.f) o.fat += s; }
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
  const vistos = {};                    // chave -> linha da lista de chamados
  try {
    const { issues } = await jiraSearchAll({
      jql: `project in (${projJql}) AND created >= "${cyc.start}" AND created < "${cyc.endExcl}" ORDER BY created ASC`,
      fields: ['created', 'components', 'labels', 'summary', 'status', 'resolutiondate', 'issuetype'],
      pageSize: 100, maxPages: 12,
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
      vistos[it.key] = linhaChamado(it, segPorChave[it.key]);
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

  // --- Lista de chamados do ciclo ---
  // União de dois conjuntos: os ABERTOS no ciclo (já buscados acima) e os que receberam
  // HORAS no ciclo sem terem nascido nele (chamado antigo que continua sendo trabalhado) —
  // estes precisam de uma busca extra por chave, em lotes, senão sairiam sem assunto.
  try {
    const faltam = Object.keys(segPorChave)
      .filter((k) => !vistos[k] && /^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(k) && projetos.includes(k.split('-')[0]));
    for (let i = 0; i < faltam.length && i < 300; i += 100) {
      const lote = faltam.slice(i, i + 100);
      const { issues } = await jiraSearchAll({
        jql: `key in (${lote.join(', ')})`,
        fields: ['created', 'summary', 'status', 'resolutiondate', 'issuetype'], pageSize: 100, maxPages: 1,
      });
      issues.forEach((it) => { vistos[it.key] = linhaChamado(it, segPorChave[it.key]); });
    }
  } catch (e) { out.chamados.erroLista = String(e && e.message ? e.message : e); }
  // Em aberto primeiro (é o que o cliente quer acompanhar), depois por horas gastas.
  const ordFase = { aberto: 0, andamento: 1, concluido: 2 };
  out.chamados.lista = Object.values(vistos).sort((a, b) => {
    const d = (ordFase[a.fase] ?? 3) - (ordFase[b.fase] ?? 3);
    return d || (b.seg - a.seg) || String(a.k).localeCompare(String(b.k));
  }).slice(0, 400);

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

// ===========================================================================
// 🔐 ÁREA DO CLIENTE — conta com e-mail e senha (pedido do usuário, 2026-09-26)
// O portal antigo (?portal=<token>) era "quem tem o link entra": bom para mandar por
// e-mail, ruim como área permanente no site — o link vaza, não se revoga por pessoa e
// não diz quem entrou. Aqui cada pessoa do cliente tem a SUA conta.
//
// Regra central: NINGUÉM SE CADASTRA SOZINHO. A conta nasce de um convite do gestor,
// já amarrada a UM contrato, e é esse contrato que define o escopo dos dados — o
// pedido do cliente nunca escolhe de quem são os chamados que ele vai ver.
//
// Decisões de segurança:
//  · senha só como hash scrypt (salt por conta, comparação em tempo constante);
//  · sessão SEM ESTADO, assinada com HMAC-SHA256 e com validade — não há tabela de
//    sessões para vazar, e revogar a conta corta o acesso na requisição seguinte;
//  · o token viaja no cabeçalho Authorization (o portal guarda no localStorage), não
//    em cookie: é o que faz a área funcionar dentro de um <iframe> no site do cliente
//    sem depender de cookie de terceiros;
//  · o login não conta se o e-mail existe, e erra devagar (bloqueio progressivo);
//  · sem endpoint novo — sub-rota ?pcli= do /api/config (limite de 12 funções).
// ===========================================================================
const PC_TAB = 'jirainsight_portal_contas';
const PC_SESSAO_H = 12;            // validade da sessão, em horas
const PC_CONVITE_D = 7;            // validade do convite, em dias
const PC_MAX_FALHAS = 5;           // erros de senha até bloquear
const PC_BLOQUEIO_MIN = 15;        // minutos de bloqueio
const PC_SENHA_MIN = 10;           // tamanho mínimo da senha

// Segredo da assinatura. Usa PORTAL_SEGREDO quando definido; senão DERIVA da chave do
// Supabase (que já é secreta e só existe no servidor) — assim a área funciona sem
// configuração extra. Trocar a env var invalida as sessões abertas, nunca as contas.
function pcSegredo() {
  const s = process.env.PORTAL_SEGREDO || process.env.SUPABASE_ANON_KEY || '';
  return crypto.createHash('sha256').update(`portal-cliente|${s}`).digest();
}
const b64u = (b) => Buffer.from(b).toString('base64url');
function pcHashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64url')}$${h.toString('base64url')}`;
}
function pcConfereSenha(senha, guardado) {
  try {
    const p = String(guardado || '').split('$');
    if (p.length !== 6 || p[0] !== 'scrypt') return false;
    const salt = Buffer.from(p[4], 'base64url'); const esperado = Buffer.from(p[5], 'base64url');
    const h = crypto.scryptSync(String(senha), salt, esperado.length,
      { N: Number(p[1]) || 16384, r: Number(p[2]) || 8, p: Number(p[3]) || 1 });
    return h.length === esperado.length && crypto.timingSafeEqual(h, esperado);
  } catch (e) { return false; }
}
// Token do convite: o que viaja no link é o valor cru; no banco fica só o hash.
const pcHashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function pcAssina(payload) {
  const corpo = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', pcSegredo()).update(corpo).digest('base64url');
  return `${corpo}.${mac}`;
}
function pcVerifica(tok) {
  const s = String(tok || ''); const i = s.indexOf('.');
  if (i <= 0) return null;
  const corpo = s.slice(0, i); const mac = s.slice(i + 1);
  const esperado = crypto.createHmac('sha256', pcSegredo()).update(corpo).digest('base64url');
  const a = Buffer.from(mac); const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8'));
    return (p && p.exp && Date.now() < p.exp) ? p : null;
  } catch (e) { return null; }
}
const pcEmailOk = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ''));
const pcNorm = (e) => String(e || '').trim().toLowerCase();

async function pcBusca(base, headers, filtro) {
  const r = await fetch(`${base}/rest/v1/${PC_TAB}?${filtro}`, { headers });
  if (!r.ok) return [];
  return await r.json().catch(() => []);
}
async function pcAtualiza(base, headers, id, campos) {
  await fetch(`${base}/rest/v1/${PC_TAB}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(campos),
  });
}
// Quem está logado no portal (cabeçalho Authorization: Bearer <token>).
// Revalida a conta no banco a cada pedido: revogar surte efeito na hora seguinte.
async function pcSessao(req, base, headers) {
  const h = String(req.headers.authorization || '');
  const p = pcVerifica(h.replace(/^Bearer\s+/i, ''));
  if (!p || !p.sub) return null;
  const linhas = await pcBusca(base, headers, `id=eq.${encodeURIComponent(p.sub)}&select=*`);
  const conta = linhas[0];
  if (!conta || !conta.ativo || !conta.senha_hash) return null;
  return conta;
}

async function portalCliente(req, res, base, headers) {
  const acao = String((req.query && req.query.pcli) || '');
  const body = (req.method === 'POST') ? await lerBody(req) : {};

  // ---- login: e-mail + senha -> token de sessão ----
  if (acao === 'login') {
    const email = pcNorm(body.email);
    const senha = String(body.senha || '');
    // Resposta única para e-mail inexistente, senha errada e conta revogada: quem tenta
    // adivinhar não aprende quais e-mails existem na base.
    const negar = () => json(res, 401, { ok: false, erro: 'E-mail ou senha inválidos.' });
    if (!pcEmailOk(email) || !senha) return negar();
    const linhas = await pcBusca(base, headers, `email=eq.${encodeURIComponent(email)}&select=*`);
    const conta = linhas[0];
    if (!conta || !conta.ativo || !conta.senha_hash) return negar();
    if (conta.bloqueado_ate && new Date(conta.bloqueado_ate).getTime() > Date.now()) {
      return json(res, 429, { ok: false, erro: 'Muitas tentativas. Tente de novo em alguns minutos.' });
    }
    if (!pcConfereSenha(senha, conta.senha_hash)) {
      const falhas = (Number(conta.falhas) || 0) + 1;
      await pcAtualiza(base, headers, conta.id, {
        falhas,
        bloqueado_ate: falhas >= PC_MAX_FALHAS ? new Date(Date.now() + PC_BLOQUEIO_MIN * 60000).toISOString() : null,
      });
      return negar();
    }
    await pcAtualiza(base, headers, conta.id, { falhas: 0, bloqueado_ate: null, ultimo_acesso: new Date().toISOString() });
    const contratos = await contratosDaConfig(base, headers);
    const c = contratos.find((x) => x && String(x.id) === String(conta.contrato_id));
    return json(res, 200, {
      ok: true,
      token: pcAssina({ sub: conta.id, exp: Date.now() + PC_SESSAO_H * 3600000 }),
      nome: conta.nome || '', email: conta.email,
      cliente: (c && c.cliente) || 'Cliente',
      expiraEm: PC_SESSAO_H * 3600,
    });
  }

  // ---- convite: quem recebeu o link define a senha (e a conta passa a valer) ----
  if (acao === 'convite') {   // GET: o portal confere o link antes de pedir a senha
    const linhas = await pcBusca(base, headers,
      `convite_hash=eq.${encodeURIComponent(pcHashToken(String((req.query && req.query.t) || '')))}&select=id,email,nome,convite_exp,ativo`);
    const conta = linhas[0];
    if (!conta || !conta.ativo || !conta.convite_exp || new Date(conta.convite_exp).getTime() < Date.now()) {
      return json(res, 200, { ok: false, erro: 'Convite inválido ou expirado — peça um novo à Dexterity.' });
    }
    return json(res, 200, { ok: true, email: conta.email, nome: conta.nome || '' });
  }
  if (acao === 'definir') {   // POST: grava a senha e já devolve a sessão
    const senha = String(body.senha || '');
    if (senha.length < PC_SENHA_MIN) return json(res, 400, { ok: false, erro: `A senha precisa de pelo menos ${PC_SENHA_MIN} caracteres.` });
    const linhas = await pcBusca(base, headers,
      `convite_hash=eq.${encodeURIComponent(pcHashToken(String(body.convite || '')))}&select=*`);
    const conta = linhas[0];
    if (!conta || !conta.ativo || !conta.convite_exp || new Date(conta.convite_exp).getTime() < Date.now()) {
      return json(res, 200, { ok: false, erro: 'Convite inválido ou expirado — peça um novo à Dexterity.' });
    }
    // O convite é de uso único: some assim que a senha é definida.
    await pcAtualiza(base, headers, conta.id, {
      senha_hash: pcHashSenha(senha), convite_hash: null, convite_exp: null,
      falhas: 0, bloqueado_ate: null, ultimo_acesso: new Date().toISOString(),
    });
    const contratos = await contratosDaConfig(base, headers);
    const c = contratos.find((x) => x && String(x.id) === String(conta.contrato_id));
    return json(res, 200, {
      ok: true, token: pcAssina({ sub: conta.id, exp: Date.now() + PC_SESSAO_H * 3600000 }),
      nome: conta.nome || '', email: conta.email, cliente: (c && c.cliente) || 'Cliente',
    });
  }

  // ---- dados: o painel do contrato DA CONTA logada ----
  if (acao === 'dados') {
    const conta = await pcSessao(req, base, headers);
    if (!conta) return json(res, 401, { ok: false, erro: 'Sessão expirada — entre de novo.' });
    const contratos = await contratosDaConfig(base, headers);
    const c = contratos.find((x) => x && String(x.id) === String(conta.contrato_id));
    if (!c) return json(res, 200, { ok: false, erro: 'Contrato não encontrado — fale com a Dexterity.' });
    return await portalDados(req, res, c);
  }

  // ---- trocar a própria senha (exige a atual) ----
  if (acao === 'trocar-senha') {
    const conta = await pcSessao(req, base, headers);
    if (!conta) return json(res, 401, { ok: false, erro: 'Sessão expirada — entre de novo.' });
    const nova = String(body.nova || '');
    if (nova.length < PC_SENHA_MIN) return json(res, 400, { ok: false, erro: `A senha precisa de pelo menos ${PC_SENHA_MIN} caracteres.` });
    if (!pcConfereSenha(String(body.atual || ''), conta.senha_hash)) return json(res, 401, { ok: false, erro: 'Senha atual incorreta.' });
    await pcAtualiza(base, headers, conta.id, { senha_hash: pcHashSenha(nova) });
    return json(res, 200, { ok: true });
  }

  // ---- administração (gestor do painel, autenticado pelo Jira) ----
  const auth = await validaJira(req);
  if (!auth.ok) return json(res, 401, { ok: false, erro: auth.erro });

  if (acao === 'contas') {   // lista as contas de um contrato
    const ct = String((req.query && req.query.ct) || body.contrato || '');
    if (!ct) return json(res, 400, { ok: false, erro: 'Informe o contrato.' });
    const linhas = await pcBusca(base, headers,
      `contrato_id=eq.${encodeURIComponent(ct)}&select=id,email,nome,ativo,criado_em,criado_por,ultimo_acesso,convite_exp,senha_hash&order=criado_em.desc`);
    return json(res, 200, {
      ok: true,
      contas: linhas.map((x) => ({
        id: x.id, email: x.email, nome: x.nome, ativo: x.ativo,
        criadoEm: x.criado_em, criadoPor: x.criado_por, ultimoAcesso: x.ultimo_acesso,
        // "pendente" = convidada e ainda sem senha definida.
        pendente: !x.senha_hash, conviteExpira: x.convite_exp,
      })),
    });
  }
  if (acao === 'convidar') {
    const email = pcNorm(body.email);
    const ct = String(body.contrato || '');
    if (!pcEmailOk(email)) return json(res, 400, { ok: false, erro: 'E-mail inválido.' });
    if (!ct) return json(res, 400, { ok: false, erro: 'Informe o contrato.' });
    const contratos = await contratosDaConfig(base, headers);
    if (!contratos.some((x) => x && String(x.id) === ct)) return json(res, 400, { ok: false, erro: 'Contrato não encontrado.' });
    const cru = crypto.randomBytes(32).toString('base64url');
    const conv = { convite_hash: pcHashToken(cru), convite_exp: new Date(Date.now() + PC_CONVITE_D * 86400000).toISOString() };
    const jaTem = (await pcBusca(base, headers, `email=eq.${encodeURIComponent(email)}&select=id,contrato_id`))[0];
    if (jaTem) {
      // Reconvidar reaproveita a conta (e pode movê-la de contrato), mas NUNCA apaga a
      // senha já definida: o convite só vale enquanto a pessoa não entrou.
      await pcAtualiza(base, headers, jaTem.id, { ...conv, contrato_id: ct, ativo: true, nome: String(body.nome || '').slice(0, 80) });
    } else {
      await fetch(`${base}/rest/v1/${PC_TAB}`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          email, nome: String(body.nome || '').slice(0, 80), contrato_id: ct,
          criado_por: auth.email || auth.nome || '', ...conv,
        }),
      });
    }
    // Não há serviço de e-mail no projeto: devolvemos o link para o gestor enviar.
    return json(res, 200, { ok: true, convite: cru, expiraEm: conv.convite_exp, reconvite: !!jaTem });
  }
  if (acao === 'revogar' || acao === 'reativar') {
    const id = String(body.id || '');
    if (!id) return json(res, 400, { ok: false, erro: 'Informe a conta.' });
    await pcAtualiza(base, headers, id, { ativo: acao === 'reativar', falhas: 0, bloqueado_ate: null });
    return json(res, 200, { ok: true });
  }
  if (acao === 'remover') {
    const id = String(body.id || '');
    if (!id) return json(res, 400, { ok: false, erro: 'Informe a conta.' });
    await fetch(`${base}/rest/v1/${PC_TAB}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers });
    return json(res, 200, { ok: true });
  }
  return json(res, 400, { ok: false, erro: 'Ação desconhecida.' });
}

// ===========================================================================
// 📊 USO DO PAINEL (pedido do usuário, 2026-09-19)
// "Quem abre qual TELA, quantas vezes e por quanto tempo" — o que faltava para decidir o
// que evoluir e o que aposentar. Quem conta é o navegador (public/js/31-uso.js), que manda
// LOTES já agregados por (dia, tela); aqui só se grava e se devolve somado.
//
// Três limites, de propósito:
//  · só id de TELA e duração — nenhum conteúdo (ticket, texto, filtro) passa por aqui;
//  · a identidade vem DECLARADA pelo cliente: serve para entender adoção, não é auditoria
//    (quem quisesse falsear o próprio número conseguiria — e não há o que proteger nisso);
//  · o histórico é podado: linhas com mais de USO_DIAS dias saem na primeira gravação
//    depois de cada partida a frio da função.
// Sem endpoint novo: entra como sub-rota do /api/config (o limite de 12 funções da Vercel).
// ===========================================================================
const USO_TAB = 'jirainsight_uso';
const USO_DIAS = 180;      // retenção do histórico
const USO_LOTE = 200;      // linhas por envio
const USO_JANELA = 120;    // dias por leitura
const USO_MAX_LINHAS = 50000;
const RE_USO_DIA = /^\d{4}-\d{2}-\d{2}$/;
const RE_USO_V = /^[a-z0-9_:-]{1,32}$/i;   // id de tela, nunca texto livre
let _usoPodou = false;

function usoDiaMenos(dias) {
  const d = new Date(`${spHoje()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// POST /api/config?uso=1 — grava um lote { a, nome, disp, linhas:[{d, v, n, s}] }
async function usoGrava(req, res, base, headers) {
  const b = await lerBody(req);
  const a = String((b && b.a) || '').trim().slice(0, 64);
  const nome = String((b && b.nome) || '').trim().slice(0, 80);
  const disp = (b && b.disp) === 'cel' ? 'cel' : 'pc';
  if (!a) return json(res, 400, { ok: false, erro: 'Sem identificação de quem usou.' });
  const hoje = spHoje(); const limite = usoDiaMenos(7);
  const linhas = (Array.isArray(b && b.linhas) ? b.linhas : []).slice(0, USO_LOTE)
    .map((x) => ({
      dia: String((x && x.d) || ''), v: String((x && x.v) || ''),
      n: Math.max(0, Math.min(10000, Math.round(Number(x && x.n) || 0))),
      seg: Math.max(0, Math.min(86400, Math.round(Number(x && x.s) || 0))),
      a, nome, disp,
    }))
    // dia plausível (não aceita datar o passado distante nem o futuro) e tela com cara de id
    .filter((x) => RE_USO_DIA.test(x.dia) && x.dia <= hoje && x.dia >= limite && RE_USO_V.test(x.v) && (x.n > 0 || x.seg > 0));
  if (!linhas.length) return json(res, 200, { ok: true, gravadas: 0 });

  const r = await sbFetch(base, headers, USO_TAB, {
    method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(linhas),
  });
  if (!r.ok) return json(res, 200, { ok: false, erro: `Supabase ${r.status}` });

  // Poda o histórico velho uma vez por instância quente (sem segurar a resposta).
  if (!_usoPodou) {
    _usoPodou = true;
    sbFetch(base, headers, `${USO_TAB}?dia=lt.${usoDiaMenos(USO_DIAS)}`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    }).catch(() => {});
  }
  return json(res, 200, { ok: true, gravadas: linhas.length });
}

// GET /api/config?uso=1&de=AAAA-MM-DD&ate=AAAA-MM-DD — o período somado por (dia, pessoa, tela).
async function usoLe(req, res, base, headers) {
  const q = req.query || {};
  const ate = RE_USO_DIA.test(String(q.ate || '')) ? String(q.ate) : spHoje();
  let de = RE_USO_DIA.test(String(q.de || '')) ? String(q.de) : usoDiaMenos(29);
  if (de > ate) de = ate;
  if (de < usoDiaMenos(USO_JANELA)) de = usoDiaMenos(USO_JANELA);   // janela máxima de leitura

  const rows = await sbRows(await sbFetch(base, headers,
    `${USO_TAB}?dia=gte.${de}&dia=lte.${ate}&select=dia,a,nome,v,disp,n,seg&limit=${USO_MAX_LINHAS}`));
  const mapa = new Map(); const pessoas = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    const k = `${r.dia}|${r.a}|${r.v}|${r.disp}`;
    const at = mapa.get(k) || { dia: r.dia, a: r.a, v: r.v, disp: r.disp, n: 0, seg: 0 };
    at.n += Number(r.n) || 0; at.seg += Number(r.seg) || 0;
    mapa.set(k, at);
    if (r.nome && !pessoas[r.a]) pessoas[r.a] = r.nome;
  });
  return json(res, 200, {
    ok: true, de, ate, pessoas, linhas: [...mapa.values()],
    truncado: Array.isArray(rows) && rows.length >= USO_MAX_LINHAS, geradoEm: new Date().toISOString(),
  });
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

    // 🔐 Área do cliente (conta com e-mail e senha) — sub-rota, sem função nova.
    if (req.query && req.query.pcli) return await portalCliente(req, res, base, headers);

    // 📋 Meu Planejamento: sub-API própria (sempre POST, com identidade do Jira).
    if (req.query && req.query.plan) {
      if (req.method !== 'POST') return json(res, 405, { ok: false, erro: 'Use POST' });
      return await planejamento(req, res, base, headers);
    }

    // 📊 Uso do painel: grava o lote (POST) e devolve o período somado (GET).
    if (req.query && req.query.uso) {
      return req.method === 'POST' ? await usoGrava(req, res, base, headers) : await usoLe(req, res, base, headers);
    }

    // 🎯 Prioridades do time: log de decisões (sempre POST, com identidade do Jira).
    if (req.query && req.query.dec) {
      if (req.method !== 'POST') return json(res, 405, { ok: false, erro: 'Use POST' });
      return await decisoes(req, res, base, headers);
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
