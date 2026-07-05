// GET /api/usuarios            -> { pessoas: { accountId: {nome,email} } }
// GET /api/usuarios?custos=1   -> { configurado, campo, custos:[{nome,email,custo}] }
//                                 custo/h dos funcionários vindo do Odoo (hr.employee).
// Lista os usuários humanos e ativos do Jira (o "elenco" do time). Usado para que o
// ranking/timesheet mostre todo mundo que está ativo no Jira, mesmo quem não apontou
// horas no período. Não depende da janela, então fica em cache por mais tempo.
//
// Odoo (consolidado aqui para respeitar o limite de 12 funções do plano Hobby):
// Envs: ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY e, opcional, ODOO_CAMPO_CUSTO
// (padrão: hourly_cost do hr.employee). O front casa por e-mail/nome e grava o
// custo na config compartilhada (cfg.custosPessoa) — o Odoo não é consultado a cada tela.
import { cacheGet, cacheSet, cacheSetTTL, json, jiraUsuariosAtivos } from './_lib/util.js';

async function custosOdoo(res) {
  const url = (process.env.ODOO_URL || '').replace(/\/+$/, '');
  const db = process.env.ODOO_DB || '';
  const login = process.env.ODOO_LOGIN || '';
  const key = process.env.ODOO_API_KEY || '';
  if (!url || !db || !login || !key) {
    return json(res, 200, { configurado: false, erro: 'Odoo não configurado — defina ODOO_URL, ODOO_DB, ODOO_LOGIN e ODOO_API_KEY na Vercel.' });
  }
  const ck = 'odoo:custos';
  const cached = cacheGet(ck);
  if (cached) return json(res, 200, cached);
  const campo = (process.env.ODOO_CAMPO_CUSTO || 'hourly_cost').trim();
  const rpc = async (service, method, args) => {
    const r = await fetch(`${url}/jsonrpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: 1 }),
    });
    let j = {};
    try { j = await r.json(); } catch (e) { throw new Error(`Odoo ${r.status}: resposta inválida`); }
    if (j.error) throw new Error(String((j.error.data && j.error.data.message) || j.error.message || 'Erro no Odoo').slice(0, 300));
    return j.result;
  };
  const uid = await rpc('common', 'login', [db, login, key]);
  if (!uid) return json(res, 200, { configurado: true, erro: 'Login do Odoo recusado — confira ODOO_DB, ODOO_LOGIN e ODOO_API_KEY.' });
  const emps = await rpc('object', 'execute_kw', [db, uid, key, 'hr.employee', 'search_read', [[]],
    { fields: ['name', 'work_email', campo], limit: 1000 }]);
  const custos = (Array.isArray(emps) ? emps : []).map((e) => ({
    nome: String(e.name || ''), email: String(e.work_email || '').toLowerCase(), custo: Number(e[campo]) || 0,
  }));
  return json(res, 200, cacheSetTTL(ck, { configurado: true, campo, custos }, 10));
}

export default async function handler(req, res) {
  try {
    if (req.query && req.query.custos) return await custosOdoo(res);
    const ck = 'usuarios:ativos';
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);
    const pessoas = await jiraUsuariosAtivos();
    return json(res, 200, cacheSet(ck, { pessoas, total: Object.keys(pessoas).length }));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
