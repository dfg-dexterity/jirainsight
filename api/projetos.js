// GET /api/projetos -> projetos do Jira com seus tipos de issue (para o Planejar).
// Usa o token do painel (leitura). Cache de 30 min — estrutura muda raramente.
import { cacheGet, cacheSetTTL, jiraBase, json } from './_lib/util.js';

function jiraAuthHeader() {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) throw new Error('JIRA_EMAIL / JIRA_API_TOKEN não configurados');
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

export default async function handler(req, res) {
  try {
    const ck = 'projetos:tipos';
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);

    const base = jiraBase();
    const headers = { Authorization: jiraAuthHeader(), Accept: 'application/json' };
    const projetos = [];
    let startAt = 0;
    for (let page = 0; page < 10; page += 1) {
      const r = await fetch(
        `${base}/rest/api/3/project/search?expand=issueTypes&maxResults=50&startAt=${startAt}`,
        { headers },
      );
      if (!r.ok) {
        const t = await r.text();
        throw new Error(`Jira ${r.status}: ${t.slice(0, 300)}`);
      }
      const data = await r.json();
      for (const p of (data.values || [])) {
        projetos.push({
          key: p.key,
          nome: p.name || p.key,
          categoria: (p.projectCategory && p.projectCategory.name) || 'Sem categoria',
          tipos: (p.issueTypes || []).map((t) => ({
            id: t.id,
            nome: t.name || '',
            subtarefa: !!t.subtask,
            nivel: typeof t.hierarchyLevel === 'number' ? t.hierarchyLevel : (t.subtask ? -1 : 0),
          })),
        });
      }
      if (data.isLast || (data.values || []).length === 0) break;
      startAt += 50;
    }
    projetos.sort((a, b) => a.key.localeCompare(b.key));
    return json(res, 200, cacheSetTTL(ck, { projetos }, 30));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
