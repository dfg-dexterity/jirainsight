// POST /api/transicao — lista/executa transições de STATUS, REAGENDA o vencimento,
// COMENTA ou TRANSFERE (assignee) um ticket do Jira, com as credenciais da própria
// pessoa (mesmo modelo do /api/apontar): a mudança fica registrada no usuário de quem
// operou, e só quem tem permissão no projeto consegue.
//
// Corpos aceitos:
//   { listar:true, issue, email, token }             -> { ok, transicoes:[{id,nome,para,categoria}] }
//   { issue, transitionId, email, token }            -> executa a transição de status
//   { reagendar:true, issue, duedate, email, token }  -> muda a data de vencimento (duedate: 'YYYY-MM-DD' ou null/'' p/ remover)
//   { comentar:true, issue, texto, email, token }     -> adiciona um comentário ao chamado
//   { atribuir:true, issue, accountId, email, token } -> transfere o responsável (accountId vazio/null = sem responsável)
//   { excluir:true, issue, email, token }             -> EXCLUI o ticket (irreversível; permissão "Excluir itens")
import { jiraBase, cacheClear, json } from './_lib/util.js';

const RE_ISSUE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Texto simples -> ADF (um parágrafo por linha), para o corpo do comentário.
function adf(texto) {
  return {
    type: 'doc',
    version: 1,
    content: String(texto).split('\n').map((l) => ({
      type: 'paragraph',
      content: l ? [{ type: 'text', text: l }] : [],
    })),
  };
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
    if (!b.rotular && !b.epico && !RE_ISSUE.test(issue)) return json(res, 400, { erro: 'Ticket inválido.' });

    const base = jiraBase();
    const headers = {
      Authorization: authDe(email, token),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    // ---- Modo rotular (LOTE): adiciona/remove labels em vários tickets de uma vez ----
    // Usado pelo faturamento do ciclo AMS: marcar o ciclo como faturado grava as labels
    // (ex.: "faturado" + "ciclo-2026-07-01") nos chamados do ciclo, no próprio Jira.
    if (b.rotular) {
      const issues = [...new Set((Array.isArray(b.issues) ? b.issues : [])
        .map((k) => String(k || '').trim().toUpperCase()).filter((k) => RE_ISSUE.test(k)))].slice(0, 200);
      const labels = (Array.isArray(b.labels) ? b.labels : [])
        .map((l) => String(l || '').trim().replace(/\s+/g, '-').slice(0, 60))
        .filter((l) => /^[\w-]{1,60}$/.test(l)).slice(0, 5);
      const remover = !!b.remover;
      if (!issues.length) return json(res, 400, { erro: 'Nenhum ticket válido para rotular.' });
      if (!labels.length) return json(res, 400, { erro: 'Nenhuma label válida (use letras, números e hífens).' });
      const oks = []; const falhas = [];
      for (const k of issues) {
        try {
          const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(k)}`, {
            method: 'PUT', headers,
            body: JSON.stringify({ update: { labels: labels.map((l) => (remover ? { remove: l } : { add: l })) } }),
          });
          if (r.ok) oks.push(k);
          else if (r.status === 401 || r.status === 403) falhas.push({ k, erro: 'sem permissão' });
          else if (r.status === 404) falhas.push({ k, erro: 'não encontrado' });
          else falhas.push({ k, erro: `Jira ${r.status}: ${(await r.text()).slice(0, 120)}` });
        } catch (e) { falhas.push({ k, erro: String(e && e.message ? e.message : e).slice(0, 120) }); }
      }
      cacheClear('atividade:');
      cacheClear('reunioes:');            // a lista de reclassificação filtra por label
      return json(res, 200, {
        ok: falhas.length === 0, rotulados: oks.length, total: issues.length, labels, remover,
        ...(falhas.length ? { falhas: falhas.slice(0, 10) } : {}),
      });
    }
    // ---- Modo épico (LOTE): define o épico (fields.parent) de vários tickets ----
    // Usado pelo "Ajustar épicos" da Gestão: tickets soltos (sem épico) são
    // vinculados ao épico escolhido, um a um, com o token da própria pessoa.
    if (b.epico) {
      const issues = [...new Set((Array.isArray(b.issues) ? b.issues : [])
        .map((k) => String(k || '').trim().toUpperCase()).filter((k) => RE_ISSUE.test(k)))].slice(0, 100);
      const paiKey = String(b.paiKey || '').trim().toUpperCase();
      if (!issues.length) return json(res, 400, { erro: 'Nenhum ticket válido para vincular.' });
      if (!RE_ISSUE.test(paiKey)) return json(res, 400, { erro: 'Épico inválido.' });
      const oks = []; const falhas = [];
      for (const k of issues) {
        try {
          const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(k)}`, {
            method: 'PUT', headers,
            body: JSON.stringify({ fields: { parent: { key: paiKey } } }),
          });
          if (r.ok) oks.push(k);
          else if (r.status === 401 || r.status === 403) falhas.push({ k, erro: 'sem permissão' });
          else if (r.status === 404) falhas.push({ k, erro: 'não encontrado' });
          else falhas.push({ k, erro: `Jira ${r.status}: ${(await r.text()).slice(0, 160)}` });
        } catch (e) { falhas.push({ k, erro: String(e && e.message ? e.message : e).slice(0, 160) }); }
      }
      cacheClear('venc:');
      cacheClear('atividade:');
      return json(res, 200, {
        ok: falhas.length === 0, ajustados: oks.length, oks, total: issues.length, paiKey,
        ...(falhas.length ? { falhas: falhas.slice(0, 10) } : {}),
      });
    }
    // ---- Modo reagendar: muda a data de vencimento (duedate) do ticket ----
    if (b.reagendar) {
      let duedate = null;                               // null limpa a data
      const raw = b.duedate == null ? '' : String(b.duedate).trim();
      if (raw) {
        if (!RE_DATA.test(raw)) return json(res, 400, { erro: 'Data inválida.' });
        duedate = raw;
      }
      const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issue)}`, {
        method: 'PUT', headers, body: JSON.stringify({ fields: { duedate } }),
      });
      if (r.status === 401 || r.status === 403) {
        return json(res, 200, { ok: false, erro: 'Sem permissão para alterar este ticket.' });
      }
      if (r.status === 404) return json(res, 200, { ok: false, erro: `Ticket ${issue} não encontrado.` });
      if (!r.ok) {                                      // sucesso = 204 No Content
        const t = await r.text();
        return json(res, 200, { ok: false, erro: `Jira ${r.status}: ${t.slice(0, 300)}` });
      }
      cacheClear('venc:');
      cacheClear('atividade:');
      return json(res, 200, { ok: true, issue, duedate });
    }

    // ---- Modo comentar: adiciona um comentário ao chamado ----
    if (b.comentar) {
      const texto = String(b.texto || '').trim();
      if (!texto) return json(res, 400, { erro: 'Comentário vazio.' });
      if (texto.length > 30000) return json(res, 400, { erro: 'Comentário longo demais.' });
      const corpo = adf(texto);
      // Menção opcional: marca a pessoa (@) no início do comentário — o Jira notifica.
      const menId = String(b.mencionar || '').trim();
      if (menId && /^[\w:-]{5,128}$/.test(menId) && corpo.content) {
        corpo.content.unshift({ type: 'paragraph', content: [
          { type: 'mention', attrs: { id: menId } },
          { type: 'text', text: ' —' },
        ] });
      }
      const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issue)}/comment`, {
        method: 'POST', headers, body: JSON.stringify({ body: corpo }),
      });
      if (r.status === 401 || r.status === 403) return json(res, 200, { ok: false, erro: 'Sem permissão para comentar neste chamado.' });
      if (r.status === 404) return json(res, 200, { ok: false, erro: `Ticket ${issue} não encontrado.` });
      if (!r.ok) { const t = await r.text(); return json(res, 200, { ok: false, erro: `Jira ${r.status}: ${t.slice(0, 300)}` }); }
      cacheClear('atividade:');
      return json(res, 200, { ok: true, issue });
    }

    // ---- Modo excluir: apaga o ticket (IRREVERSÍVEL; exige a permissão "Excluir itens") ----
    if (b.excluir) {
      const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issue)}?deleteSubtasks=true`, {
        method: 'DELETE', headers,
      });
      if (r.status === 401 || r.status === 403) return json(res, 200, { ok: false, erro: 'Sem permissão para excluir este ticket (precisa de "Excluir itens" no projeto).' });
      if (r.status === 404) return json(res, 200, { ok: false, erro: `Ticket ${issue} não encontrado.` });
      if (r.status !== 204) { const t = await r.text(); return json(res, 200, { ok: false, erro: `Jira ${r.status}: ${t.slice(0, 300)}` }); }
      cacheClear('venc:');
      cacheClear('atividade:');
      return json(res, 200, { ok: true, issue, excluido: true });
    }

    // ---- Modo atribuir: transfere o responsável (assignee) do chamado ----
    if (b.atribuir) {
      const accountId = String(b.accountId || '').trim();
      const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(issue)}/assignee`, {
        method: 'PUT', headers, body: JSON.stringify({ accountId: accountId || null }),   // null = sem responsável
      });
      if (r.status === 401 || r.status === 403) return json(res, 200, { ok: false, erro: 'Sem permissão para transferir este chamado.' });
      if (r.status === 404) return json(res, 200, { ok: false, erro: `Ticket ${issue} não encontrado.` });
      if (r.status === 400) { const t = await r.text(); return json(res, 200, { ok: false, erro: `Não foi possível atribuir (a pessoa pode não ter acesso ao projeto). ${t.slice(0, 160)}` }); }
      if (!r.ok) { const t = await r.text(); return json(res, 200, { ok: false, erro: `Jira ${r.status}: ${t.slice(0, 300)}` }); }
      cacheClear('venc:');
      cacheClear('atividade:');
      return json(res, 200, { ok: true, issue, accountId });
    }

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
