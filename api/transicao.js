// POST /api/transicao — lista ou executa transições de STATUS de um ticket do Jira,
// com as credenciais da própria pessoa (mesmo modelo do /api/apontar): a mudança fica
// registrada no usuário de quem moveu, e só quem tem permissão no projeto consegue.
//
// Corpos aceitos:
//   { listar:true, issue, email, token }          -> { ok, transicoes:[{id,nome,para,categoria}] }
//   { issue, transitionId, email, token }         -> executa a transição
import { jiraBase, cacheClear, json } from './_lib/util.js';

const RE_ISSUE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

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
    const issue = String(b.issue || '').trim().toUpperCase();
    if (!email || !email.includes('@') || !token) {
      return json(res, 400, { erro: 'Informe seu e-mail do Jira e o token de API.' });
    }
    if (!RE_ISSUE.test(issue)) return json(res, 400, { erro: 'Ticket inválido.' });

    const base = jiraBase();
    const headers = {
      Authorization: authDe(email, token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    const url = `${base}/rest/api/3/issue/${encodeURIComponent(issue)}/transitions`;

    // ---- Modo listagem: quais movimentos o workflow permite para ESTE usuário ----
    if (b.listar) {
      const r = await fetch(url, { headers });
      if (r.status === 401 || r.status === 403) {
        return json(res, 200, { ok: false, erro: 'Sem permissão — token inválido/expirado ou sem acesso ao projeto.' });
      }
      if (r.status === 404) return json(res, 200, { ok: false, erro: `Ticket ${issue} não encontrado.` });
      if (!r.ok) {
        const t = await r.text();
        return json(res, 200, { ok: false, erro: `Jira ${r.status}: ${t.slice(0, 300)}` });
      }
      const data = await r.json();
      const transicoes = (data.transitions || []).map((t) => ({
        id: t.id,
        nome: t.name || '',
        para: (t.to && t.to.name) || '',
        categoria: (t.to && t.to.statusCategory && t.to.statusCategory.key) || '',  // new|indeterminate|done
      }));
      return json(res, 200, { ok: true, issue, transicoes });
    }

    // ---- Modo execução ----
    const transitionId = String(b.transitionId || '').trim();
    if (!/^\d+$/.test(transitionId)) return json(res, 400, { erro: 'Transição inválida.' });
    const r = await fetch(url, {
      method: 'POST', headers, body: JSON.stringify({ transition: { id: transitionId } }),
    });
    if (r.status === 401 || r.status === 403) {
      return json(res, 200, { ok: false, erro: 'Sem permissão para mover este ticket.' });
    }
    if (r.status === 404) return json(res, 200, { ok: false, erro: `Ticket ${issue} não encontrado.` });
    if (!r.ok) {                                    // sucesso = 204 No Content (r.ok cobre)
      const t = await r.text();
      return json(res, 200, { ok: false, erro: `Jira ${r.status}: ${t.slice(0, 300)}` });
    }

    // O status mudou: derruba caches desta instância (lista de vencimentos e atividade).
    cacheClear('venc:');
    cacheClear('atividade:');
    return json(res, 200, { ok: true, issue });
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
