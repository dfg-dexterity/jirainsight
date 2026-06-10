// POST /api/criar — cria tickets do Jira EM LOTE, com as credenciais da própria
// pessoa (mesmo modelo do /api/apontar): o repórter é quem criou, e as permissões
// do Jira valem para cada um. Usa o endpoint bulk do Jira (50 por requisição).
//
// Corpo: { itens:[{projeto, tipoId, resumo, descricao?, respId?, paiKey?}], email, token }
// Resposta: { ok, criados:[{indice,key,resumo}], erros:[{indice,erro}] }
import { jiraBase, cacheClear, json } from './_lib/util.js';

const RE_PROJ = /^[A-Za-z][A-Za-z0-9_]*$/;
const RE_ISSUE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const MAX_ITENS = 100;

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

// Texto simples -> ADF (um parágrafo por linha).
function adf(texto) {
  const linhas = String(texto).split('\n');
  return {
    type: 'doc',
    version: 1,
    content: linhas.map((l) => ({
      type: 'paragraph',
      content: l ? [{ type: 'text', text: l }] : [],
    })),
  };
}

// Valida um item e devolve a mensagem de erro ('' = ok).
function validaItem(it) {
  if (!it || typeof it !== 'object') return 'Item inválido.';
  if (!RE_PROJ.test(String(it.projeto || ''))) return 'Projeto inválido.';
  if (!/^\d+$/.test(String(it.tipoId || ''))) return 'Tipo de ticket inválido.';
  const resumo = String(it.resumo || '').trim();
  if (!resumo) return 'Resumo vazio.';
  if (resumo.length > 255) return 'Resumo com mais de 255 caracteres.';
  if (it.paiKey && !RE_ISSUE.test(String(it.paiKey))) return 'Ticket pai inválido.';
  if (it.descricao && String(it.descricao).length > 30000) return 'Descrição longa demais.';
  return '';
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
    const b = await lerBody(req);
    const email = String(b.email || '').trim();
    const token = String(b.token || '').trim();
    if (!email || !email.includes('@') || !token) {
      return json(res, 400, { erro: 'Identifique-se (e-mail + token de API) para criar tickets.' });
    }
    const itens = Array.isArray(b.itens) ? b.itens : [];
    if (!itens.length) return json(res, 400, { erro: 'Nenhum ticket para criar.' });
    if (itens.length > MAX_ITENS) return json(res, 400, { erro: `Máximo de ${MAX_ITENS} tickets por lote.` });

    // ---- Validação prévia (defesa no servidor; o front também valida) ----
    const erros = [];
    itens.forEach((it, i) => { const e = validaItem(it); if (e) erros.push({ indice: i, erro: e }); });
    if (erros.length) return json(res, 200, { ok: false, criados: [], erros });

    const base = jiraBase();
    const headers = {
      Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    const criados = [];
    // O endpoint bulk aceita até 50 por chamada — fatia o lote.
    for (let i = 0; i < itens.length; i += 50) {
      const fatia = itens.slice(i, i + 50);
      const issueUpdates = fatia.map((it) => {
        const fields = {
          project: { key: String(it.projeto).toUpperCase() },
          issuetype: { id: String(it.tipoId) },
          summary: String(it.resumo).trim(),
        };
        if (it.descricao && String(it.descricao).trim()) fields.description = adf(String(it.descricao).trim());
        if (it.respId) fields.assignee = { id: String(it.respId) };
        if (it.paiKey) fields.parent = { key: String(it.paiKey).toUpperCase() };
        return { fields };
      });

      const r = await fetch(`${base}/rest/api/3/issue/bulk`, {
        method: 'POST', headers, body: JSON.stringify({ issueUpdates }),
      });
      if (r.status === 401 || r.status === 403) {
        return json(res, 200, { ok: false, criados, erros: [{ indice: i, erro: 'Sem permissão — token inválido/expirado ou sem acesso ao projeto.' }] });
      }
      let data = {};
      try { data = await r.json(); } catch (e) { /* resposta sem corpo */ }
      if (!r.ok && !Array.isArray(data.issues)) {
        const t = JSON.stringify(data).slice(0, 300);
        return json(res, 200, { ok: false, criados, erros: [{ indice: i, erro: `Jira ${r.status}: ${t}` }] });
      }

      // Reconstrói a correspondência: 'errors' traz o índice que falhou dentro da
      // fatia; os sucessos vêm em 'issues' na ordem dos itens restantes.
      const falharam = new Set((data.errors || []).map((e) => e.failedElementNumber));
      (data.errors || []).forEach((e) => {
        const el = e.elementErrors || {};
        const msgs = [...(el.errorMessages || []), ...Object.values(el.errors || {})];
        erros.push({ indice: i + e.failedElementNumber, erro: msgs.join(' ').slice(0, 300) || 'Falha ao criar.' });
      });
      let s = 0;
      fatia.forEach((it, j) => {
        if (falharam.has(j)) return;
        const issue = (data.issues || [])[s]; s += 1;
        if (issue && issue.key) criados.push({ indice: i + j, key: issue.key, resumo: String(it.resumo).trim() });
      });
    }

    // Dados novos no Jira: derruba caches desta instância.
    cacheClear('atividade:');
    cacheClear('venc:');
    cacheClear('epicos:');

    return json(res, 200, { ok: erros.length === 0, criados, erros });
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
