// POST /api/apontar — registra horas (worklog) num ticket do Jira EM NOME do
// próprio usuário. A API do Jira atribui o worklog sempre ao usuário autenticado,
// por isso cada pessoa usa o SEU e-mail + token de API (guardados só no navegador
// dela e repassados por requisição; nada é persistido aqui). O Clockwork lê os
// worklogs nativos do Jira, então o apontamento aparece nos relatórios também.
//
// Corpos aceitos:
//   { validar:true, email, token }                       -> confirma credenciais (GET /myself)
//   { issue, segundos, inicio, comentario?, email, token } -> cria o worklog
import { jiraBase, cacheClear, json } from './_lib/util.js';

const RE_ISSUE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const MIN_SEG = 60;            // 1 minuto
const MAX_SEG = 24 * 3600;     // 24 horas por lançamento

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

export default async function handler(req, res) {
  try {
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
      const r = await fetch(`${base}/rest/api/3/myself`, { headers });
      if (r.status === 401 || r.status === 403) {
        return json(res, 200, { ok: false, erro: 'Credenciais inválidas — confira o e-mail e o token.' });
      }
      if (!r.ok) {
        const t = await r.text();
        return json(res, 200, { ok: false, erro: `Jira ${r.status}: ${t.slice(0, 200)}` });
      }
      const me = await r.json();
      return json(res, 200, {
        ok: true,
        accountId: me.accountId || '',
        nome: me.displayName || email,
        email: me.emailAddress || email,
      });
    }

    // ---- Modo apontamento ----
    const issue = String(b.issue || '').trim().toUpperCase();
    const segundos = Math.round(Number(b.segundos) || 0);
    const inicio = String(b.inicio || '').trim();
    const comentario = String(b.comentario || '').trim();
    if (!RE_ISSUE.test(issue)) return json(res, 400, { erro: 'Ticket inválido.' });
    if (!(segundos >= MIN_SEG && segundos <= MAX_SEG)) {
      return json(res, 400, { erro: 'Tempo inválido (mínimo 1m, máximo 24h por lançamento).' });
    }
    if (!RE_DATA.test(inicio)) return json(res, 400, { erro: 'Data inválida.' });

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
      return json(res, 200, { ok: false, erro: 'Sem permissão — token inválido/expirado ou sem acesso ao projeto.' });
    }
    if (r.status === 404) {
      return json(res, 200, { ok: false, erro: `Ticket ${issue} não encontrado (ou sem permissão de visualizar).` });
    }
    if (!r.ok) {
      const t = await r.text();
      return json(res, 200, { ok: false, erro: `Jira ${r.status}: ${t.slice(0, 300)}` });
    }
    const wl = await r.json();

    // O dado mudou: derruba os caches desta instância para refletir mais rápido.
    cacheClear('tempo:');
    cacheClear('venc:');

    return json(res, 200, { ok: true, worklogId: wl.id || '', issue, segundos, inicio });
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
