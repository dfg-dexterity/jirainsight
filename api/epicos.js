// GET /api/epicos?projeto=KEY -> épicos e histórias ABERTOS do projeto (para o
// modo "Planejamento de épico"). Identifica os tipos pelo nível de hierarquia do
// próprio projeto (funciona com nomes em português: Épico, História etc.).
import { cacheGet, cacheSetTTL, jiraBase, jiraSearchAll, json } from './_lib/util.js';

function jiraAuthHeader() {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) throw new Error('JIRA_EMAIL / JIRA_API_TOKEN não configurados');
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

const RE_PROJ = /^[A-Za-z][A-Za-z0-9_]*$/;
const RE_HISTORIA = /story|hist[oó]ria/i;

export default async function handler(req, res) {
  try {
    const projeto = String((req.query && req.query.projeto) || '').trim().toUpperCase();
    if (!RE_PROJ.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
    const ck = `epicos:${projeto}`;
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);

    const base = jiraBase();
    const headers = { Authorization: jiraAuthHeader(), Accept: 'application/json' };

    // Tipos do projeto: épicos = hierarquia 1; histórias = nível 0 com nome de história.
    const rp = await fetch(`${base}/rest/api/3/project/${encodeURIComponent(projeto)}`, { headers });
    if (!rp.ok) {
      const t = await rp.text();
      return json(res, rp.status === 404 ? 404 : 500, { erro: `Jira ${rp.status}: ${t.slice(0, 200)}` });
    }
    const pdata = await rp.json();
    const tipos = pdata.issueTypes || [];
    const idsEpico = tipos.filter((t) => t.hierarchyLevel === 1).map((t) => t.id);
    const idsHistoria = tipos
      .filter((t) => !t.subtask && t.hierarchyLevel !== 1 && RE_HISTORIA.test(t.name || ''))
      .map((t) => t.id);

    const ids = [...idsEpico, ...idsHistoria];
    let epicos = [];
    let historias = [];
    if (ids.length) {
      const { issues } = await jiraSearchAll({
        jql: `project = ${projeto} AND issuetype in (${ids.join(',')}) AND statusCategory != Done ORDER BY created DESC`,
        fields: ['summary', 'issuetype', 'status'],
        pageSize: 100,
        maxPages: 3,
      });
      for (const it of issues) {
        const f = it.fields || {};
        const item = {
          k: it.key,
          resumo: f.summary || '',
          status: (f.status && f.status.name) || '',
          tipo: (f.issuetype && f.issuetype.name) || '',
        };
        if (idsEpico.includes(f.issuetype && f.issuetype.id)) epicos.push(item);
        else historias.push(item);
      }
    }
    const payload = { projeto, epicos, historias };
    return json(res, 200, cacheSetTTL(ck, payload, 10));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
