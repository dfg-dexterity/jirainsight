// 💵 Custo/h das pessoas vindo do Odoo (2026-11-06, a pedido do usuário: "onde está o custo dos funcionários usado no
// Jira Insight? É para vir do Odoo"). Este módulo é a FONTE ÚNICA da sincronização — o cron do api/teams.js (fase
// `custos`, 1× por dia útil no 1º tique ≥ CUSTOS_ODOO_HORA) e o botão ↻ da ⚙️ da 🏦 Controladoria (POST
// /api/config?custos=1) chamam a mesma `sincronizaCustos`. Lê hr.employee (só ativos) com o campo ODOO_CAMPO_CUSTO
// (padrão hourly_cost), casa com as pessoas ATIVAS do Jira por e-mail (depois por nome sem acento) e grava:
//   · cfg.custosPessoa[accountId] = R$/h — a leitura de custo de TODAS as telas (alocCustoH no painel, rpCustoH no
//     servidor): nada muda para quem consome;
//   · cfg.custosOdoo = { em, campo, n, pessoas:{a:{custo,nome,por}}, semPar:[{a,nome}], semCusto:[{a,nome}] } — a foto da
//     última sincronização, escrita SÓ aqui (a tela só lê).
// Regras (decisões do usuário, 2026-11-06):
//   · quem NÃO tem funcionário correspondente no Odoo MANTÉM o custo digitado e aparece em `semPar` (a tela avisa);
//   · valor digitado à mão pelo gestor para quem TEM par no Odoo é EXCEÇÃO (cfg.custosOrigem[a]==='manual', gravado
//     pela ⚙️ da Controladoria) e não é sobrescrito — a tela mostra "exceção" e um ↺ para voltar ao Odoo;
//   · funcionário no Odoo com custo 0/vazio não zera ninguém: fica em `semCusto` e o valor atual (se houver) continua;
//   · a gravação é no registro `default` da jirainsight_config com trava otimista pelo updated_at (3 tentativas) —
//     nunca last-writer-wins; o cliente que estiver salvando recebe `conflito` e mescla (cfgMescla3), como sempre.
// Nada aqui apaga cfg.custosPessoa de ninguém. Tudo recebe `fetchFn` para os testes (Odoo e Supabase falsos).
export const CUSTOS_ODOO_HORA = '06:30';   // depois da foto da Rentabilidade (06:00), no tique seguinte do cron
const TABELA = 'jirainsight_config';
const ID = 'default';

export function odooEnv(env = process.env) {
  const url = String(env.ODOO_URL || '').trim().replace(/\/+$/, '');
  const db = String(env.ODOO_DB || '').trim();
  const login = String(env.ODOO_LOGIN || '').trim();
  const key = String(env.ODOO_API_KEY || '').trim();
  if (!url || !db || !login || !key) return null;
  return { url, db, login, key, campo: String(env.ODOO_CAMPO_CUSTO || '').trim() || 'hourly_cost' };
}

async function odooRpc(env, service, method, args, fetchFn) {
  const r = await fetchFn(`${env.url}/jsonrpc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: { service, method, args } }),
  });
  let j;
  try { j = await r.json(); } catch (e) { throw new Error(`Odoo ${r.status}: resposta inválida`); }
  if (j && j.error) throw new Error(String((j.error.data && j.error.data.message) || j.error.message || 'Erro no Odoo').slice(0, 300));
  if (!r.ok) throw new Error(`Odoo HTTP ${r.status}`);   // 5xx com JSON sem `error` não pode virar "login recusado"
  return j ? j.result : undefined;
}

// Funcionários ATIVOS do Odoo: [{ id, nome, email, custo }] (custo já em número ≥ 0; e-mail em minúsculas).
export async function lerFuncionariosOdoo(env, fetchFn = fetch) {
  const uid = await odooRpc(env, 'common', 'login', [env.db, env.login, env.key], fetchFn);
  if (!uid) throw new Error('Login do Odoo recusado — confira ODOO_DB, ODOO_LOGIN e ODOO_API_KEY.');
  const emps = await odooRpc(env, 'object', 'execute_kw',
    [env.db, uid, env.key, 'hr.employee', 'search_read', [[['active', '=', true]]], { fields: ['name', 'work_email', env.campo], limit: 2000 }], fetchFn);
  return (Array.isArray(emps) ? emps : []).map((e) => ({
    id: Number(e && e.id) || 0,
    nome: String((e && e.name) || '').trim(),
    email: String((e && e.work_email) || '').trim().toLowerCase(),
    custo: Math.max(0, Number(e && e[env.campo]) || 0),
  }));
}

export function normNome(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Casa os funcionários do Odoo com as pessoas do Jira ({accountId:{nome,email}}): e-mail primeiro, depois o nome sem
// acento. Devolve { pessoas:{a:{custo,nome,por}}, semPar:[{a,nome}], semCusto:[{a,nome}] } — `semCusto` é quem casou,
// mas está com o campo de custo vazio/zero no Odoo (não vira custo 0 para ninguém).
export function casaCustos(funcionarios, pessoas) {
  // Dois funcionários com o mesmo e-mail ou o mesmo nome (homônimos) = casamento AMBÍGUO: ninguém casa por essa chave
  // (revisão de 2026-11-06 — guardar só o 1º registro dava o custo de um homônimo ao outro). A pessoa fica em semPar
  // com o `motivo`, e a tela explica.
  const porEmail = new Map(); const porNome = new Map(); const emailsRep = new Set(); const nomesRep = new Set();
  (Array.isArray(funcionarios) ? funcionarios : []).forEach((f) => {
    if (!f) return;
    if (f.email) { if (porEmail.has(f.email)) emailsRep.add(f.email); else porEmail.set(f.email, f); }
    const n = normNome(f.nome); if (n) { if (porNome.has(n)) nomesRep.add(n); else porNome.set(n, f); }
  });
  const out = { pessoas: {}, semPar: [], semCusto: [] };
  Object.entries(pessoas || {}).forEach(([a, p]) => {
    const nome = String((p && p.nome) || a).trim();
    const email = String((p && p.email) || '').trim().toLowerCase();
    const nn = normNome(nome);
    const fe = (email && !emailsRep.has(email)) ? porEmail.get(email) : null;
    const f = fe || ((nn && !nomesRep.has(nn)) ? porNome.get(nn) : null) || null;
    if (!f) {
      const motivo = (email && emailsRep.has(email)) ? 'email-repetido' : ((nn && nomesRep.has(nn)) ? 'homonimo' : '');
      out.semPar.push(motivo ? { a, nome, motivo } : { a, nome }); return;
    }
    if (!(f.custo > 0)) { out.semCusto.push({ a, nome }); return; }
    out.pessoas[a] = { custo: Math.round(f.custo * 100) / 100, nome: f.nome || nome, por: fe ? 'email' : 'nome', _fid: f.id || f.email || nn, _nomeJira: nome };
  });
  // Duas contas do Jira no MESMO funcionário (segunda conta da pessoa, homônimo externo com outro e-mail): fica só a que
  // casou por e-mail, se for uma só; as demais vão para semPar com motivo 'duplicado' — custo interno nunca cai numa conta
  // estranha por causa do nome (revisão de 2026-11-06).
  const porFunc = new Map();
  Object.entries(out.pessoas).forEach(([a, x]) => { if (!porFunc.has(x._fid)) porFunc.set(x._fid, []); porFunc.get(x._fid).push(a); });
  porFunc.forEach((as) => {
    if (as.length < 2) return;
    const porEmailAs = as.filter((a) => out.pessoas[a].por === 'email');
    const fica = porEmailAs.length === 1 ? porEmailAs[0] : null;
    as.forEach((a) => { if (a === fica) return; out.semPar.push({ a, nome: out.pessoas[a]._nomeJira, motivo: 'duplicado' }); delete out.pessoas[a]; });
  });
  Object.values(out.pessoas).forEach((x) => { delete x._fid; delete x._nomeJira; });
  const ord = (x, y) => x.nome.localeCompare(y.nome, 'pt');
  out.semPar.sort(ord); out.semCusto.sort(ord);
  return out;
}

// JSON canônico (chaves ordenadas) para saber se a foto mudou sem falso positivo pela ordem que o Odoo devolveu.
function canon(v) {
  const ord = (x) => (Array.isArray(x) ? x.map(ord) : (x && typeof x === 'object') ? Object.keys(x).sort().reduce((o, k) => { o[k] = ord(x[k]); return o; }, {}) : x);
  return JSON.stringify(v === undefined ? null : ord(v));
}

// Aplica o casamento na config (função PURA — devolve uma cópia): grava o custo do Odoo em quem casou e não é exceção
// manual; nunca apaga ninguém; escreve a foto cfg.custosOdoo. `mudou` = algum custo trocou OU a foto (sem o `em`) mudou.
export function aplicaCustosOdoo(cfg, casado, agora, campo) {
  const c = (cfg && typeof cfg === 'object' && !Array.isArray(cfg)) ? cfg : {};
  const custos = { ...((c.custosPessoa && typeof c.custosPessoa === 'object') ? c.custosPessoa : {}) };
  const origem = { ...((c.custosOrigem && typeof c.custosOrigem === 'object') ? c.custosOrigem : {}) };
  const fotoAntes = (c.custosOdoo && typeof c.custosOdoo === 'object' && c.custosOdoo.pessoas && typeof c.custosOdoo.pessoas === 'object') ? c.custosOdoo.pessoas : {};
  const cas = (casado && typeof casado === 'object') ? casado : { pessoas: {}, semPar: [], semCusto: [] };
  let aplicados = 0; let iguais = 0; let origemMudou = false; const excecoes = [];
  Object.entries(cas.pessoas || {}).forEach(([a, p]) => {
    const atual = Number(custos[a]) || 0; const antes = Number((fotoAntes[a] || {}).custo) || 0;
    // Valor diferente do que a ÚLTIMA sincronização gravou foi digitado DEPOIS dela — talvez numa aba que nem tinha a foto
    // para marcar a exceção (revisão de 2026-11-06): a marca nasce aqui. Sem foto anterior, ou pessoa que acabou de ganhar
    // par (`antes` = 0), o Odoo manda, como sempre.
    if (origem[a] !== 'manual' && antes > 0 && atual > 0 && Math.abs(atual - antes) >= 0.005 && Math.abs(atual - p.custo) >= 0.005) { origem[a] = 'manual'; origemMudou = true; }
    if (origem[a] === 'manual') {
      if (Math.abs(atual - p.custo) < 0.005) { delete origem[a]; origemMudou = true; iguais += 1; return; }   // igual ao Odoo não é exceção
      excecoes.push({ a, nome: p.nome, manual: atual, odoo: p.custo }); return;
    }
    if (Math.abs(atual - p.custo) < 0.005) { iguais += 1; return; }
    custos[a] = p.custo; aplicados += 1;
  });
  const foto = {
    em: agora, campo: campo || 'hourly_cost', n: Object.keys(cas.pessoas || {}).length,
    pessoas: Object.fromEntries(Object.entries(cas.pessoas || {}).map(([a, p]) => [a, { custo: p.custo, nome: p.nome, por: p.por }])),
    semPar: (cas.semPar || []).map((x) => (x.motivo ? { a: x.a, nome: x.nome, motivo: x.motivo } : { a: x.a, nome: x.nome })),
    semCusto: (cas.semCusto || []).map((x) => ({ a: x.a, nome: x.nome })),
  };
  const antes = (c.custosOdoo && typeof c.custosOdoo === 'object') ? { ...c.custosOdoo, em: undefined } : null;
  const mudouFoto = canon(antes) !== canon({ ...foto, em: undefined });
  const data = { ...c, custosPessoa: custos, custosOdoo: foto, ...(origemMudou ? { custosOrigem: origem } : {}) };
  return { data, mudou: aplicados > 0 || mudouFoto || origemMudou, aplicados, iguais, excecoes, casados: foto.n, semPar: foto.semPar.length, semCusto: foto.semCusto.length };
}

async function leRow(sb, fetchFn) {
  const r = await fetchFn(`${sb.base}/rest/v1/${TABELA}?id=eq.${ID}&select=data,updated_at`, { headers: sb.headers });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const rows = await r.json();
  return (Array.isArray(rows) && rows[0]) || null;
}
// Grava com trava otimista: PATCH filtrado pelo updated_at lido (null = outra escrita chegou antes); sem linha, INSERT.
async function gravaRow(sb, row, data, agora, fetchFn) {
  const hdr = { ...sb.headers, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  let r;
  if (row) {
    const filtro = row.updated_at ? `&updated_at=eq.${encodeURIComponent(row.updated_at)}` : '&updated_at=is.null';
    r = await fetchFn(`${sb.base}/rest/v1/${TABELA}?id=eq.${ID}${filtro}`, { method: 'PATCH', headers: hdr, body: JSON.stringify({ data, updated_at: agora }) });
  } else {
    r = await fetchFn(`${sb.base}/rest/v1/${TABELA}?on_conflict=id`, { method: 'POST', headers: { ...hdr, Prefer: 'return=representation,resolution=ignore-duplicates' }, body: JSON.stringify([{ id: ID, data, updated_at: agora }]) });
  }
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const rows = await r.json();
  return (Array.isArray(rows) && rows[0]) || null;
}

// A sincronização inteira: Odoo → casamento → config (com trava). `pessoas` = ativos do Jira ({a:{nome,email}}).
// Devolve { ok, em, rev, data, mudou, campo, funcionarios, casados, aplicados, iguais, excecoes:[…], semPar:[nomes],
// semCusto:[nomes] } — ou { ok:false, configurado, erro }. Com `dry` calcula e não grava (sem `data`/`rev`).
export async function sincronizaCustos({ sb, pessoas, agora, dry, fetchFn = fetch, env = process.env } = {}) {
  const oe = odooEnv(env);
  if (!oe) return { ok: false, configurado: false, erro: 'Odoo não configurado — defina ODOO_URL, ODOO_DB, ODOO_LOGIN e ODOO_API_KEY na Vercel.' };
  if (!sb || !sb.base || !sb.headers) return { ok: false, configurado: true, erro: 'Supabase não configurado (a config compartilhada mora nele).' };
  let funcionarios;
  try { funcionarios = await lerFuncionariosOdoo(oe, fetchFn); } catch (e) {
    return { ok: false, configurado: true, erro: `Odoo: ${String(e && e.message ? e.message : e).slice(0, 300)}` };
  }
  const em = agora || new Date().toISOString();
  let row; let casado; let ocultos = 0;
  try {
    row = await leRow(sb, fetchFn);
    // Usuários externos marcados como "ocultar" (cfg.ocultos, como no ranking e no relatório semanal) ficam fora do
    // casamento: não entram em semPar nem ganham custo (revisão de 2026-11-06).
    const oc = new Set((((row && row.data) || {}).ocultos || []).map((o) => o && o.a).filter(Boolean));
    const pessoasVis = Object.fromEntries(Object.entries(pessoas || {}).filter(([a]) => !oc.has(a)));
    ocultos = Object.keys(pessoas || {}).length - Object.keys(pessoasVis).length;
    casado = casaCustos(funcionarios, pessoasVis);
  } catch (e) {
    return { ok: false, configurado: true, erro: String(e && e.message ? e.message : e).slice(0, 300) };
  }
  const resumo = (r) => ({
    campo: oe.campo, funcionarios: funcionarios.length, casados: r.casados, aplicados: r.aplicados, iguais: r.iguais, excecoes: r.excecoes,
    semPar: casado.semPar.map((x) => x.nome), semCusto: casado.semCusto.map((x) => x.nome), ocultos,
  });
  try {
    for (let tent = 0; tent < 3; tent += 1) {
      if (tent > 0) row = await leRow(sb, fetchFn);
      const r = aplicaCustosOdoo(row ? row.data : {}, casado, em, oe.campo);
      if (dry) return { ok: true, dry: true, em, mudou: r.mudou, ...resumo(r) };
      const gravado = await gravaRow(sb, row, r.data, em, fetchFn);
      if (gravado) return { ok: true, em, mudou: r.mudou, rev: gravado.updated_at || em, data: gravado.data || r.data, ...resumo(r) };
    }
  } catch (e) {
    return { ok: false, configurado: true, erro: String(e && e.message ? e.message : e).slice(0, 300) };
  }
  return { ok: false, configurado: true, erro: 'A config foi alterada por outra pessoa enquanto a sincronização gravava (3 tentativas) — tente de novo.' };
}
