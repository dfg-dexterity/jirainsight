// GET /api/usuarios            -> { pessoas: { accountId: {nome,email} }, inativos: { accountId: {nome,email} } }
// GET /api/usuarios?custos=1   -> 410 (rota removida em 2026-11-06: devolvia nome, e-mail e R$/h de TODOS os
//                                 funcionários do Odoo sem identidade nem segredo — achado da revisão). A leitura do
//                                 custo/h do Odoo mora em api/_lib/custosOdoo.js e só sai pelo cron do api/teams.js e
//                                 pelo POST /api/config?custos=1 (gestor/admin), que gravam cfg.custosPessoa no servidor.
// Lista os usuários humanos e ativos do Jira (o "elenco" do time). Usado para que o
// ranking/timesheet mostre todo mundo que está ativo no Jira, mesmo quem não apontou
// horas no período. Não depende da janela, então fica em cache por mais tempo.
import { cacheGet, cacheSet, json, jiraUsuariosTodos } from './_lib/util.js';

export default async function handler(req, res) {
  try {
    if (req.query && req.query.custos) {
      return json(res, 410, { ok: false, erro: 'Rota removida (2026-11-06): o custo/h do Odoo é sincronizado pelo servidor — gestores usam ↻ Importar do Odoo na ⚙️ da 🏦 Controladoria (POST /api/config?custos=1).' });
    }
    const ck = 'usuarios:v2';
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);
    // `inativos` (2026-10-24): quem saiu do Jira continua existindo no que o painel guardou pelo accountId (fotos do
    // 🏅 Scoreboard, histórico) — sem esta lista a tela mostrava "712020:…" no lugar do nome.
    const { ativos: pessoas, inativos } = await jiraUsuariosTodos();
    return json(res, 200, cacheSet(ck, { pessoas, inativos, total: Object.keys(pessoas).length }));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
