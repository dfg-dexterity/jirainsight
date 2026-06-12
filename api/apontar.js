// /api/apontar — apontamento de horas (worklog) e convites de reunião em grupo.
//
// A API do Jira atribui o worklog sempre ao usuário autenticado, por isso cada
// pessoa usa o SEU e-mail + token de API (guardados só no navegador dela e
// repassados por requisição; nada é persistido aqui). O Clockwork lê os worklogs
// nativos do Jira, então o apontamento aparece nos relatórios também.
//
// Para reuniões que valem para várias pessoas existe o CONVITE: quem organizou
// dispara um convite (ticket + tempo + dia + pessoas); cada convidado confirma
// com 1 clique no painel e o worklog é criado com o token DELE. Os convites
// ficam na tabela `jirainsight_convites` do Supabase (mesmo projeto da config).
//
// Modo direto (opcional, desligado por padrão): com CLOCKWORK_ESCRITA=1 e
// CLOCKWORK_API_TOKEN configurados, o servidor TENTA criar o worklog dos
// convidados direto via API do Clockwork (que aceita autor explícito). Se o
// Clockwork recusar, o convite fica pendente normalmente (fallback automático).
//
// Rotas:
//   GET  ?convites=1&accountId=X                          -> convites pendentes da pessoa
//   POST { validar:true, email, token }                   -> confirma credenciais (GET /myself)
//   POST { issue, segundos, inicio, comentario?, email, token } -> cria o worklog próprio
//   POST { convidar:true, issue, segundos, inicio, comentario?, pessoas:[{accountId,nome}],
//          avisarTeams?, email, token }                   -> cria convites (e aponta o do organizador)
//   POST { confirmarConvite:id, email, token }            -> confirma um convite (cria o worklog)
//   POST { recusarConvite:id, email, token }              -> recusa um convite
import { randomUUID } from 'node:crypto';
import { jiraBase, cacheClear, json } from './_lib/util.js';

const RE_ISSUE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const MIN_SEG = 60;            // 1 minuto
const MAX_SEG = 24 * 3600;     // 24 horas por lançamento
const MAX_PESSOAS = 100;       // por convite
const CONVITE_DIAS = 21;       // convites mais velhos que isso não aparecem mais

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

function authDe(email, token) {
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

// ---------------- Supabase (mesmo armazenamento da config compartilhada) ----------------
const TABELA = 'jirainsight_convites';
function sb() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
async function sbSelect(s, query) {
  const r = await fetch(`${s.base}/rest/v1/${TABELA}?${query}`, { headers: s.headers });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function sbInsert(s, rows) {
  const r = await fetch(`${s.base}/rest/v1/${TABELA}`, {
    method: 'POST', headers: { ...s.headers, Prefer: 'return=minimal' }, body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
}
async function sbUpdate(s, id, patch) {
  const r = await fetch(`${s.base}/rest/v1/${TABELA}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { ...s.headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// ---------------- Jira: identidade e worklog ----------------
async function jiraMyself(base, headers) {
  const r = await fetch(`${base}/rest/api/3/myself`, { headers });
  if (r.status === 401 || r.status === 403) return { ok: false, erro: 'Credenciais inválidas — confira o e-mail e o token.' };
  if (!r.ok) return { ok: false, erro: `Jira ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const me = await r.json();
  return { ok: true, accountId: me.accountId || '', nome: me.displayName || '', email: me.emailAddress || '' };
}

async function criaWorklog(base, headers, { issue, segundos, inicio, comentario }) {
  const corpo = {
    timeSpentSeconds: segundos,
    // 09:00 no fuso de São Paulo — o dia é o que importa para o timesheet.
    started: `${inicio}T09:00:00.000-0300`,
  };
  if (comentario) {
    corpo.comment = {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: comentario }] }],
    };
  }
  const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issue)}/worklog`, {
    method: 'POST', headers, body: JSON.stringify(corpo),
  });
  if (r.status === 401 || r.status === 403) {
    return { ok: false, erro: 'Sem permissão — token inválido/expirado ou sem acesso ao projeto.' };
  }
  if (r.status === 404) {
    return { ok: false, erro: `Ticket ${issue} não encontrado (ou sem permissão de visualizar).` };
  }
  if (!r.ok) {
    return { ok: false, erro: `Jira ${r.status}: ${(await r.text()).slice(0, 300)}` };
  }
  const wl = await r.json();
  return { ok: true, worklogId: String(wl.id || '') };
}

// Modo direto via Clockwork (opt-in por env; payload melhor-esforço — se a API
// recusar, o convite segue pendente e o detalhe da recusa volta no diagnóstico).
async function clockworkDireto({ issue, segundos, inicio, comentario, accountId }) {
  const token = process.env.CLOCKWORK_API_TOKEN || '';
  if (process.env.CLOCKWORK_ESCRITA !== '1' || !token) return null;
  try {
    const r = await fetch('https://api.clockwork.report/v1/worklogs', {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        issue_key: issue,
        time_spent_seconds: segundos,
        started: `${inicio}T09:00:00.000-0300`,
        comment: comentario || '',
        author: { accountId },
      }),
    });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: true, worklogId: String(d.id || '') };
    }
    return { ok: false, erro: `Clockwork ${r.status}: ${(await r.text()).slice(0, 200)}` };
  } catch (e) {
    return { ok: false, erro: `Clockwork: ${String(e.message || e).slice(0, 200)}` };
  }
}

// Aviso no canal do Teams (mesmo webhook do ranking diário). Melhor esforço.
async function avisaTeams(req, { issue, resumo, segundos, inicio, nomes, criadoPor }) {
  const webhook = process.env.TEAMS_WEBHOOK_URL || '';
  if (!webhook) return;
  const h = Math.floor(segundos / 3600), m = Math.round((segundos % 3600) / 60);
  const tempo = h && m ? `${h}h${String(m).padStart(2, '0')}` : (h ? `${h}h` : `${m}m`);
  const dia = `${inicio.slice(8, 10)}/${inicio.slice(5, 7)}`;
  const painel = `https://${(req.headers && req.headers.host) || 'jirainsight.vercel.app'}/?v=apontar`;
  const cartao = {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type: 'AdaptiveCard', version: '1.4', msteams: { width: 'Full' },
        body: [
          { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: `👥 Apontamento de reunião — ${issue}` },
          { type: 'TextBlock', wrap: true, text: `**${criadoPor}** convidou a apontar **${tempo}** (${dia}) em **${issue}**${resumo ? ` — ${resumo}` : ''}.` },
          { type: 'TextBlock', wrap: true, isSubtle: true, text: `Convidados: ${nomes.join(', ')}` },
          { type: 'TextBlock', wrap: true, text: `[Abrir o painel e confirmar com 1 clique](${painel})` },
        ],
      },
    }],
  };
  try {
    await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cartao) });
  } catch (e) { /* aviso é melhor-esforço; o convite já foi criado */ }
}

// ---------------- GET: convites pendentes da pessoa ----------------
async function listarConvites(req, res) {
  const accountId = String((req.query && req.query.accountId) || '').trim();
  if (!accountId) return json(res, 400, { erro: 'Informe o accountId.' });
  const s = sb();
  if (!s) return json(res, 200, { ok: true, convites: [], configurado: false });
  const corte = new Date(Date.now() - CONVITE_DIAS * 86400000).toISOString();
  const q = new URLSearchParams({
    select: 'id,issue,resumo,segundos,inicio,comentario,criado_por_nome,created_at',
    account_id: `eq.${accountId}`,
    status: 'eq.pendente',
    created_at: `gte.${corte}`,
    order: 'created_at.desc',
    limit: '50',
  });
  const rows = await sbSelect(s, q.toString());
  return json(res, 200, {
    ok: true,
    configurado: true,
    convites: rows.map((r) => ({
      id: r.id, issue: r.issue, resumo: r.resumo || '', segundos: r.segundos,
      inicio: r.inicio, comentario: r.comentario || '',
      criadoPor: r.criado_por_nome || '', criadoEm: r.created_at,
    })),
  });
}

// ---------------- POST { convidar }: cria convites do grupo ----------------
async function criarConvites(req, res, b, base, headers, me) {
  const s = sb();
  if (!s) return json(res, 200, { ok: false, erro: 'Convites exigem a configuração compartilhada (Supabase) — fale com quem administra o painel.' });

  const issue = String(b.issue || '').trim().toUpperCase();
  const segundos = Math.round(Number(b.segundos) || 0);
  const inicio = String(b.inicio || '').trim();
  const comentario = String(b.comentario || '').trim();
  if (!RE_ISSUE.test(issue)) return json(res, 400, { erro: 'Ticket inválido.' });
  if (!(segundos >= MIN_SEG && segundos <= MAX_SEG)) {
    return json(res, 400, { erro: 'Tempo inválido (mínimo 1m, máximo 24h por lançamento).' });
  }
  if (!RE_DATA.test(inicio)) return json(res, 400, { erro: 'Data inválida.' });

  // Pessoas: dedup por accountId, até MAX_PESSOAS.
  const vistos = new Set();
  const pessoas = (Array.isArray(b.pessoas) ? b.pessoas : [])
    .map((p) => ({ accountId: String((p && p.accountId) || '').trim(), nome: String((p && p.nome) || '').trim() }))
    .filter((p) => p.accountId && p.accountId.length < 200 && !vistos.has(p.accountId) && vistos.add(p.accountId));
  if (!pessoas.length) return json(res, 400, { erro: 'Selecione pelo menos uma pessoa.' });
  if (pessoas.length > MAX_PESSOAS) return json(res, 400, { erro: `Máximo de ${MAX_PESSOAS} pessoas por convite.` });

  // Confere o ticket (com o token do organizador) e pega o resumo para o convite.
  const ri = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issue)}?fields=summary`, { headers });
  if (ri.status === 404) return json(res, 200, { ok: false, erro: `Ticket ${issue} não encontrado (ou sem permissão de visualizar).` });
  if (!ri.ok) return json(res, 200, { ok: false, erro: `Jira ${ri.status}: ${(await ri.text()).slice(0, 200)}` });
  const resumo = (((await ri.json()).fields || {}).summary || '').slice(0, 300);

  const grupo = randomUUID();
  const comum = {
    grupo, issue, resumo, segundos, inicio, comentario,
    criado_por: me.accountId, criado_por_nome: me.nome || me.email,
  };

  let proprio = null;        // resultado do apontamento do organizador
  let diretos = 0;           // worklogs criados via Clockwork (modo direto)
  let erroDireto = '';       // primeira recusa do Clockwork (diagnóstico)
  const rows = [];
  const pendentesNomes = [];

  for (const p of pessoas) {
    const row = { ...comum, account_id: p.accountId, nome: p.nome, status: 'pendente', worklog_id: '', erro: '' };
    if (p.accountId === me.accountId) {
      // O organizador aponta o dele na hora, com o próprio token.
      proprio = await criaWorklog(base, headers, { issue, segundos, inicio, comentario });
      if (proprio.ok) { row.status = 'confirmado'; row.worklog_id = proprio.worklogId; }
      else row.erro = proprio.erro.slice(0, 300);
    } else {
      const d = await clockworkDireto({ issue, segundos, inicio, comentario, accountId: p.accountId });
      if (d && d.ok) { row.status = 'direto'; row.worklog_id = d.worklogId; diretos += 1; }
      else if (d && !d.ok) { row.erro = d.erro.slice(0, 300); if (!erroDireto) erroDireto = d.erro; }
      if (row.status === 'pendente') pendentesNomes.push(p.nome || p.accountId);
    }
    rows.push(row);
  }

  await sbInsert(s, rows);
  if (proprio && proprio.ok) { cacheClear('tempo:'); cacheClear('venc:'); }
  if (diretos) { cacheClear('tempo:'); cacheClear('venc:'); }

  if (b.avisarTeams !== false && pendentesNomes.length) {
    await avisaTeams(req, {
      issue, resumo, segundos, inicio, nomes: pendentesNomes, criadoPor: me.nome || me.email,
    });
  }

  return json(res, 200, {
    ok: true,
    grupo,
    issue,
    total: pessoas.length,
    pendentes: pendentesNomes.length,
    diretos,
    proprio: proprio ? { ok: proprio.ok, erro: proprio.ok ? '' : proprio.erro } : null,
    ...(erroDireto ? { erroDireto } : {}),
  });
}

// ---------------- POST { confirmarConvite | recusarConvite } ----------------
async function respondeConvite(req, res, b, base, headers, me) {
  const s = sb();
  if (!s) return json(res, 200, { ok: false, erro: 'Convites exigem a configuração compartilhada (Supabase).' });
  const id = String(b.confirmarConvite || b.recusarConvite || '').trim();
  const confirmar = !!b.confirmarConvite;
  if (!id) return json(res, 400, { erro: 'Convite inválido.' });

  const rows = await sbSelect(s, `id=eq.${encodeURIComponent(id)}&select=*`);
  const cv = rows && rows[0];
  if (!cv) return json(res, 200, { ok: false, erro: 'Convite não encontrado.' });
  if (cv.account_id !== me.accountId) return json(res, 200, { ok: false, erro: 'Este convite é de outra pessoa.' });
  if (cv.status !== 'pendente') return json(res, 200, { ok: true, ja: true, status: cv.status });

  if (!confirmar) {
    await sbUpdate(s, id, { status: 'recusado' });
    return json(res, 200, { ok: true, status: 'recusado' });
  }

  const wl = await criaWorklog(base, headers, {
    issue: cv.issue, segundos: cv.segundos, inicio: cv.inicio, comentario: cv.comentario || '',
  });
  if (!wl.ok) {
    await sbUpdate(s, id, { erro: wl.erro.slice(0, 300) });
    return json(res, 200, { ok: false, erro: wl.erro });
  }
  await sbUpdate(s, id, { status: 'confirmado', worklog_id: wl.worklogId, erro: '' });
  cacheClear('tempo:');
  cacheClear('venc:');
  return json(res, 200, { ok: true, status: 'confirmado', issue: cv.issue, segundos: cv.segundos, inicio: cv.inicio });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      if (req.query && req.query.convites === '1') return await listarConvites(req, res);
      return json(res, 405, { erro: 'Use POST' });
    }
    if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
    const b = await lerBody(req);
    const email = String(b.email || '').trim();
    const token = String(b.token || '').trim();
    if (!email || !email.includes('@') || !token) {
      return json(res, 400, { erro: 'Informe seu e-mail do Jira e o token de API.' });
    }
    const base = jiraBase();
    const headers = {
      Authorization: authDe(email, token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    // ---- Modo validação: identifica a pessoa (e prova que o token funciona) ----
    if (b.validar) {
      const me = await jiraMyself(base, headers);
      if (!me.ok) return json(res, 200, { ok: false, erro: me.erro });
      return json(res, 200, { ok: true, accountId: me.accountId, nome: me.nome || email, email: me.email || email });
    }

    // ---- Convites de reunião (criar / confirmar / recusar) ----
    if (b.convidar || b.confirmarConvite || b.recusarConvite) {
      const me = await jiraMyself(base, headers);
      if (!me.ok) return json(res, 200, { ok: false, erro: me.erro });
      if (b.convidar) return await criarConvites(req, res, b, base, headers, me);
      return await respondeConvite(req, res, b, base, headers, me);
    }

    // ---- Modo apontamento próprio ----
    const issue = String(b.issue || '').trim().toUpperCase();
    const segundos = Math.round(Number(b.segundos) || 0);
    const inicio = String(b.inicio || '').trim();
    const comentario = String(b.comentario || '').trim();
    if (!RE_ISSUE.test(issue)) return json(res, 400, { erro: 'Ticket inválido.' });
    if (!(segundos >= MIN_SEG && segundos <= MAX_SEG)) {
      return json(res, 400, { erro: 'Tempo inválido (mínimo 1m, máximo 24h por lançamento).' });
    }
    if (!RE_DATA.test(inicio)) return json(res, 400, { erro: 'Data inválida.' });

    const wl = await criaWorklog(base, headers, { issue, segundos, inicio, comentario });
    if (!wl.ok) return json(res, 200, { ok: false, erro: wl.erro });

    // O dado mudou: derruba os caches desta instância para refletir mais rápido.
    cacheClear('tempo:');
    cacheClear('venc:');

    return json(res, 200, { ok: true, worklogId: wl.worklogId, issue, segundos, inicio });
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
