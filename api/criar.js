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
  // Padrões do lote (opcionais): estimativa Jira (1w 2d 4h 30m), vencimento ISO, labels sem espaço.
  if (it.estimativa && !/^\s*\d+\s*[wdhm](\s+\d+\s*[wdhm])*\s*$/i.test(String(it.estimativa))) {
    return 'Estimativa inválida — use o formato do Jira: 4h, 2d, 1w 2d…';
  }
  if (it.venc && !/^\d{4}-\d{2}-\d{2}$/.test(String(it.venc))) return 'Vencimento inválido (use AAAA-MM-DD).';
  if (it.labels != null) {
    if (!Array.isArray(it.labels) || it.labels.length > 10) return 'Labels inválidas (máx. 10).';
    if (it.labels.some((l) => !/^\S{1,60}$/.test(String(l)))) return 'Labels não podem ter espaços (máx. 60 caracteres).';
  }
  return '';
}

// Feedback da tela de Ajuda (Dúvida/Sugestão/Bug): cria um ISSUE no GitHub do
// projeto usando um token de serviço (não usa o Jira). Consolidado aqui para
// respeitar o limite de 12 Serverless Functions do plano Hobby.
// Env: GITHUB_TOKEN (issues:write) e GITHUB_ISSUES_REPO (owner/repo).
const FB_TIPOS = {
  duvida: { label: 'dúvida', pref: 'Dúvida' },
  sugestao: { label: 'sugestão', pref: 'Sugestão' },
  bug: { label: 'bug', pref: 'Bug' },
};
async function criaFeedbackGitHub(res, b) {
  const token = (process.env.GITHUB_TOKEN || process.env.GH_FEEDBACK_TOKEN || '').trim();
  const repo = (process.env.GITHUB_ISSUES_REPO || 'dfg-dexterity/jirainsight').trim();
  if (!token) {
    return json(res, 200, { ok: false, configurado: false, erro: 'Integração com o GitHub não configurada. Defina GITHUB_TOKEN na Vercel.' });
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return json(res, 200, { ok: false, erro: 'GITHUB_ISSUES_REPO inválido (use owner/repo).' });
  }
  const t = FB_TIPOS[b.tipo] || FB_TIPOS.sugestao;
  const titulo = String(b.titulo || '').trim();
  if (!titulo) return json(res, 400, { ok: false, erro: 'Dê um título.' });
  const detalhes = String(b.detalhes || '').trim().slice(0, 20000);
  const rep = (b.reporter && typeof b.reporter === 'object') ? b.reporter : {};
  const nome = String(rep.nome || '').trim().slice(0, 120);
  const email = String(rep.email || '').trim().slice(0, 160);
  const corpo = [
    detalhes || '_(sem detalhes)_',
    '',
    '---',
    `**Tipo:** ${t.pref}`,
    (nome || email) ? `**Reportado por:** ${nome}${email ? ` (${email})` : ''}` : '',
    '**Origem:** painel Insights de Uso (Jira + Clockwork) — tela de Ajuda',
  ].filter(Boolean).join('\n');
  const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'jirainsight-feedback',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ title: `${t.pref}: ${titulo}`.slice(0, 250), body: corpo, labels: [t.label] }),
  });
  let data = {};
  try { data = await r.json(); } catch (e) { /* sem corpo */ }
  if (!r.ok) {
    return json(res, 200, { ok: false, erro: `GitHub ${r.status}: ${String(data.message || '').slice(0, 200)}` });
  }
  return json(res, 200, { ok: true, numero: data.number, url: data.html_url });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
    const b = await lerBody(req);
    if (b.feedback) return await criaFeedbackGitHub(res, b);
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
        if (it.estimativa) fields.timetracking = { originalEstimate: String(it.estimativa).trim() };
        if (it.venc) fields.duedate = String(it.venc);
        if (Array.isArray(it.labels) && it.labels.length) fields.labels = it.labels.map(String);
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
