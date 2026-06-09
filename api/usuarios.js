// GET /api/usuarios -> { pessoas: { accountId: {nome,email} } }
// Lista os usuários humanos e ativos do Jira (o "elenco" do time). Usado para que o
// ranking/timesheet mostre todo mundo que está ativo no Jira, mesmo quem não apontou
// horas no período. Não depende da janela, então fica em cache por mais tempo.
import { cacheGet, cacheSet, json, jiraUsuariosAtivos } from './_lib/util.js';

export default async function handler(req, res) {
  try {
    const ck = 'usuarios:ativos';
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);
    const pessoas = await jiraUsuariosAtivos();
    return json(res, 200, cacheSet(ck, { pessoas, total: Object.keys(pessoas).length }));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
