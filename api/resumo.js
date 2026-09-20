// POST /api/resumo — resumo em linguagem natural das atividades de cada pessoa no
// período, gerado por IA (Claude). O front-end envia as MÉTRICAS JÁ AGREGADAS que
// mostra na aba Resumo (horas, faturável, tickets, alterações, transições,
// comentários, criações, cadência diária e meta) — este endpoint só pede ao modelo
// para interpretar e descrever. Nenhum dado do Jira/Clockwork é relido aqui.
//
// Requer a variável de ambiente ANTHROPIC_API_KEY (Vercel). Sem ela, responde
// { ok:false, configurado:false } e o front-end orienta como configurar.
//
// Corpo: { periodo:{label,diasUteis}, equipe:{...}, pessoas:[{id,nome,...}] }
// Resposta: { ok, geral, pessoas:[{id, resumo, sinal}] }
import { json, jiraSearchAll, cacheGet, cacheSetTTL, worklogsEnriquecidos, configCompartilhada, feriadosBR } from './_lib/util.js';
import { sincronizaFolgas } from './_lib/folgaSync.js';
import { chamaClaude } from './_lib/ia.js';

const MAX_PESSOAS = 25;

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

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const txt = (v, max = 80) => String(v == null ? '' : v).slice(0, max);

// ---------------------------------------------------------------------------
// Folga (compensação de horas extras) — consolidada AQUI por causa do limite de
// 12 Serverless Functions do plano Hobby (esta rota já é a "do servidor" da aba
// Resumo). Acionada por POST /api/resumo?acao=folga: cria um pedido de Time Off
// no Odoo PARA a pessoa, via API externa (JSON-RPC) com uma CONTA DE SERVIÇO.
// Variáveis de ambiente (Vercel): ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY,
// ODOO_FOLGA_TIPO_ID (id numérico OU nome do tipo de ausência, hr.leave.type).
// ---------------------------------------------------------------------------
const env = (k) => (process.env[k] || '').trim();
const isoData = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? s : '';

async function odoo(url, service, method, args) {
  const r = await fetch(url.replace(/\/+$/, '') + '/jsonrpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { service, method, args } }),
  });
  if (!r.ok) throw new Error(`Odoo respondeu HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) {
    const d = j.error.data || {};
    throw new Error(d.message || j.error.message || 'Erro no Odoo');
  }
  return j.result;
}

// ---------------------------------------------------------------------------
// 💹 Rentabilidade → Odoo Vendas (pedido de 2026-09-13): cria uma COTAÇÃO (sale.order
// em rascunho, nada é confirmado) com o faturamento previsto de um plano de horas
// abertas — UM ITEM POR PERÍODO DE FATURAMENTO (horas previstas × valor da hora; os
// períodos vêm do 🤝 contrato de parceria ou do mês civil), no cliente do plano.
// POST /api/resumo?acao=odoo-venda. Devolve também os ids das linhas criadas (itens[])
// para o painel ligar cada período ao seu item e sincronizar depois. A escrita é pela
// conta de serviço do Odoo; quem pediu é confirmado pelo token do Jira (nunca
// persistido). Env: ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY e, opcional,
// ODOO_PRODUTO_SERVICO (id ou nome do produto de serviço; sem ele, o 1º produto do tipo
// Serviço). `dry:1` só monta.
// ---------------------------------------------------------------------------
async function criaCotacaoOdoo(res, b) {
  const url = env('ODOO_URL'), db = env('ODOO_DB'), login = env('ODOO_LOGIN'), key = env('ODOO_API_KEY');
  const email = txt(b.email, 200), token = String(b.token || '');
  const linhas = (Array.isArray(b.linhas) ? b.linhas : [])
    .map((l) => ({ mes: txt(l && l.mes, 7), de: isoData(l && l.de), ate: isoData(l && l.ate), nota: isoData(l && l.nota), descricao: txt(l && l.descricao, 200), qtd: Math.max(0, num(l && l.qtd)), unitario: Math.max(0, num(l && l.unitario)) }))
    .filter((l) => l.qtd > 0 && l.unitario > 0).slice(0, 60);
  const ct = b.contrato && typeof b.contrato === 'object' ? { consultoria: txt(b.contrato.consultoria, 120), conta: txt(b.contrato.conta, 120), fatFecha: Math.round(num(b.contrato.fatFecha)) || 0, fatDia: Math.round(num(b.contrato.fatDia)) || 0, modalidade: txt(b.contrato.modalidade, 60) } : null;
  const cliente = txt(b.cliente, 120);
  const total = Math.round(linhas.reduce((s, l) => s + l.qtd * l.unitario, 0) * 100) / 100;
  const ref = `Jira Insights · ${txt(b.projeto, 20)} · plano ${txt(b.planoId, 30)}`;
  if (!linhas.length) return json(res, 400, { ok: false, erro: 'Nenhuma linha com horas e valor para cotar.' });
  if (b.dry) return json(res, 200, { ok: true, dry: true, total, linhas, ref, configurado: !!(url && db && login && key) });
  if (!url || !db || !login || !key) return json(res, 200, { ok: false, configurado: false, erro: 'Integração com o Odoo não configurada.', dica: 'Defina ODOO_URL, ODOO_DB, ODOO_LOGIN e ODOO_API_KEY na Vercel (as mesmas das folgas).' });
  if (!email || !token) return json(res, 400, { ok: false, erro: 'Identifique-se em ⏱ Apontar (e-mail + token do Jira) para criar a cotação.' });
  const quem = await jiraMyself(email, token);
  if (!quem.ok) return json(res, 401, { ok: false, erro: quem.erro });
  try {
    const uid = await odoo(url, 'common', 'authenticate', [db, login, key, {}]);
    if (!uid) return json(res, 200, { ok: false, erro: 'Login no Odoo recusado — confira ODOO_LOGIN e ODOO_API_KEY.' });
    const exec = (model, method, args, kw) => odoo(url, 'object', 'execute_kw', [db, uid, key, model, method, args, kw || {}]);
    // Cliente (res.partner): id escolhido pela pessoa, ou busca pelo nome — várias respostas ambíguas voltam para escolher.
    let partnerId = Math.max(0, Math.round(num(b.parceiroId)));
    if (!partnerId) {
      if (!cliente) return json(res, 200, { ok: false, erro: 'Informe o cliente do plano (✏️ Dados do projeto) para achar o parceiro no Odoo.' });
      let lista = await exec('res.partner', 'search_read', [[['name', 'ilike', cliente], ['is_company', '=', true]]], { fields: ['id', 'name'], limit: 8 });
      if (!lista.length) lista = await exec('res.partner', 'search_read', [[['name', 'ilike', cliente]]], { fields: ['id', 'name'], limit: 8 });
      if (!lista.length) return json(res, 200, { ok: false, erro: `Nenhum cliente parecido com "${cliente}" no Odoo.`, dica: 'Cadastre o cliente em Contatos no Odoo (ou ajuste o nome do cliente no plano) e tente de novo.' });
      const exato = lista.find((x) => String(x.name || '').trim().toLowerCase() === cliente.toLowerCase());
      if (lista.length > 1 && !exato) return json(res, 200, { ok: false, escolher: lista.map((x) => ({ id: x.id, name: x.name })) });
      partnerId = (exato || lista[0]).id;
    }
    // Produto de serviço das linhas: id/nome por env ou o 1º produto do tipo Serviço.
    const prodCfg = env('ODOO_PRODUTO_SERVICO'); let produtoId = /^\d+$/.test(prodCfg) ? Number(prodCfg) : 0;
    if (!produtoId) {
      const prods = await exec('product.product', 'search_read', [prodCfg ? [['name', 'ilike', prodCfg]] : [['type', '=', 'service']]], { fields: ['id', 'name'], limit: 1 });
      if (!prods.length) return json(res, 200, { ok: false, erro: 'Nenhum produto de serviço encontrado no Odoo para as linhas da cotação.', dica: 'Crie um produto do tipo Serviço (ex.: "Consultoria") ou defina ODOO_PRODUTO_SERVICO (id ou nome) na Vercel.' });
      produtoId = prods[0].id;
    }
    const ctTxt = ct ? ` Contrato de parceria: ${ct.consultoria}${ct.modalidade ? ' (' + ct.modalidade + ')' : ''}${ct.fatFecha ? `, período de faturamento até o dia ${ct.fatFecha}` : ''}${ct.fatDia ? `, nota no dia ${ct.fatDia}` : ''}${ct.conta ? `, recebimento na conta ${ct.conta}` : ''}.` : '';
    const nota = `Faturamento previsto do plano "${txt(b.nome, 120)}" (${txt(b.projeto, 20)}), ${txt(b.inicio, 10)} → ${txt(b.fim, 10)} — um item por período de faturamento (${linhas.length}).${ctTxt} Gerado no Jira Insights por ${quem.nome || email}.${b.obs ? ' ' + txt(b.obs, 300) : ''}`;
    const orderId = await exec('sale.order', 'create', [{
      partner_id: partnerId, client_order_ref: ref, origin: ref, note: nota,
      order_line: linhas.map((l) => [0, 0, { product_id: produtoId, name: l.descricao, product_uom_qty: l.qtd, price_unit: l.unitario }]),
    }]);
    const lidos = await exec('sale.order', 'read', [[orderId]], { fields: ['name', 'amount_total', 'order_line'] });
    const ord = (lidos && lidos[0]) || {};
    // ids das linhas na ordem em que foram criadas → o painel liga cada período ao seu item (para a sincronização)
    const ids = Array.isArray(ord.order_line) ? ord.order_line.map((x) => Number(x) || 0) : [];
    const itens = linhas.map((l, i) => ({ id: ids[i] || 0, mes: l.mes, de: l.de, ate: l.ate, nota: l.nota, qtd: l.qtd, unitario: l.unitario }));
    cacheSetTTL(`odoo-venda-status:${orderId}`, null, 0);   // se houver leitura antiga em cache, cai
    return json(res, 200, { ok: true, id: orderId, name: ord.name || '', total: num(ord.amount_total) || total, parceiroId: partnerId, itens, url: `${url.replace(/\/+$/, '')}/web#id=${orderId}&model=sale.order&view_type=form` });
  } catch (e) {
    return json(res, 200, { ok: false, erro: `Odoo: ${String((e && e.message) || e).slice(0, 300)}`, dica: 'Confira se o módulo Vendas está instalado e se a conta de serviço do Odoo pode criar cotações.' });
  }
}

// ---------------------------------------------------------------------------
// 💹 Rentabilidade ← Odoo (pedido de 2026-09-13): SOMENTE LEITURA do estado de uma ordem de
// venda criada pelo painel — estado da ordem, quanto de cada item já foi faturado
// (qty_invoiced) e as faturas ligadas (account.move: número, data, estado, pagamento).
// É com isso que o período de faturamento do plano vira "faturado"/"pago" sozinho.
// POST /api/resumo?acao=odoo-venda-status {id, forca}. Cache de 3 min por ordem (forca=1
// ignora). Não escreve nada e nunca devolve credenciais.
// ---------------------------------------------------------------------------
async function statusVendaOdoo(res, b) {
  const url = env('ODOO_URL'), db = env('ODOO_DB'), login = env('ODOO_LOGIN'), key = env('ODOO_API_KEY');
  const id = Math.max(0, Math.round(num(b.id)));
  if (!id) return json(res, 400, { ok: false, erro: 'Informe o id da ordem de venda no Odoo.' });
  if (!url || !db || !login || !key) return json(res, 200, { ok: false, configurado: false, erro: 'Integração com o Odoo não configurada.', dica: 'Defina ODOO_URL, ODOO_DB, ODOO_LOGIN e ODOO_API_KEY na Vercel (as mesmas das folgas).' });
  const ck = `odoo-venda-status:${id}`;
  if (!b.forca) { const c = cacheGet(ck); if (c) return json(res, 200, { ...c, cache: true }); }
  try {
    const uid = await odoo(url, 'common', 'authenticate', [db, login, key, {}]);
    if (!uid) return json(res, 200, { ok: false, erro: 'Login no Odoo recusado — confira ODOO_LOGIN e ODOO_API_KEY.' });
    const exec = (model, method, args, kw) => odoo(url, 'object', 'execute_kw', [db, uid, key, model, method, args, kw || {}]);
    const ords = await exec('sale.order', 'read', [[id]], { fields: ['name', 'state', 'invoice_status', 'amount_total', 'order_line', 'invoice_ids', 'date_order'] });
    const o = (ords && ords[0]) || null;
    if (!o) return json(res, 200, { ok: false, erro: `Ordem de venda #${id} não encontrada no Odoo (pode ter sido excluída).` });
    const lineIds = (o.order_line || []).map((x) => Number(x) || 0).filter(Boolean);
    const linhas = lineIds.length ? await exec('sale.order.line', 'read', [lineIds], { fields: ['name', 'product_uom_qty', 'price_unit', 'price_subtotal', 'qty_invoiced', 'qty_to_invoice', 'invoice_lines'] }) : [];
    const invIds = (o.invoice_ids || []).map((x) => Number(x) || 0).filter(Boolean);
    const movs = invIds.length ? await exec('account.move', 'read', [invIds], { fields: ['name', 'state', 'move_type', 'invoice_date', 'invoice_date_due', 'amount_total', 'amount_residual', 'payment_state', 'invoice_line_ids'] }) : [];
    const faturas = movs.filter((f) => !f.move_type || /^out_/.test(String(f.move_type))).map((f) => ({
      id: f.id, nome: txt(f.name, 40), estado: txt(f.state, 20), tipo: txt(f.move_type, 20), data: isoData(f.invoice_date) || '', vencimento: isoData(f.invoice_date_due) || '',
      total: num(f.amount_total), aberto: num(f.amount_residual), pagamento: txt(f.payment_state, 30), linhasIds: Array.isArray(f.invoice_line_ids) ? f.invoice_line_ids.map((x) => Number(x) || 0) : [],
    }));
    const out = {
      ok: true, id, name: txt(o.name, 40), state: txt(o.state, 20), invoiceStatus: txt(o.invoice_status, 20), total: num(o.amount_total), lidoEm: new Date().toISOString(),
      url: `${url.replace(/\/+$/, '')}/web#id=${id}&model=sale.order&view_type=form`,
      linhas: linhas.map((l) => { const il = Array.isArray(l.invoice_lines) ? l.invoice_lines.map((x) => Number(x) || 0) : [];
        return { id: l.id, nome: txt(l.name, 200), qtd: num(l.product_uom_qty), unitario: num(l.price_unit), subtotal: num(l.price_subtotal), qtdFat: num(l.qty_invoiced), qtdAFat: num(l.qty_to_invoice),
          faturas: faturas.filter((f) => f.linhasIds.some((x) => il.includes(x))).map((f) => f.id) }; }),
      faturas: faturas.map(({ linhasIds, ...f }) => f),
    };
    return json(res, 200, cacheSetTTL(ck, out, 3));
  } catch (e) {
    return json(res, 200, { ok: false, erro: `Odoo: ${String((e && e.message) || e).slice(0, 300)}`, dica: 'Confira se a conta de serviço do Odoo pode ler ordens de venda e faturas (Vendas e Faturamento).' });
  }
}

// ---------------------------------------------------------------------------
// 🤝 Contrato de parceria ↔ Odoo Vendas (pedido de 2026-09-20). O CONTRATO passa a ser o dono da
// ordem de venda: UM ITEM POR PERÍODO DE FATURAMENTO (produto das "horas de consultoria") + UM ITEM
// POR HORA EXTRA lançada (produto de horas extras), cada item com o RATEIO por objeto de resultado
// (contas analíticas → analytic_distribution). Três ações, todas com a identidade do Jira de quem
// pede (nunca persistida) e a conta de serviço do Odoo:
//   • ?acao=odoo-catalogo          — SOMENTE LEITURA: produtos de serviço à venda e contas analíticas
//                                    (10 min de cache; forca=1 relê).
//   • ?acao=odoo-contrato          — sem ordemId CRIA a ordem (cotação em rascunho); com ordemId COMPARA
//                                    a previsão com os itens que a ordem já tem e cria/atualiza/remove o
//                                    que mudou. `dry:1` só devolve o PLANO — é o que a tela mostra antes
//                                    de a pessoa confirmar. Regras: item já faturado nunca muda; a
//                                    quantidade nunca cai abaixo do já faturado; item que saiu da previsão
//                                    é apagado na cotação e ZERADO na ordem confirmada (o Odoo não deixa
//                                    apagar linha de ordem confirmada); item criado à mão no Odoo fica
//                                    como está. Sem o campo analytic_distribution (módulo analítico
//                                    ausente), grava sem rateio e avisa.
//   • ?acao=odoo-contrato-cancela  — cancela a ordem (o contrato foi removido no painel).
// A leitura do estado (faturado/pago por item) continua sendo ?acao=odoo-venda-status.
// ---------------------------------------------------------------------------
async function odooConecta() {
  const url = env('ODOO_URL'), db = env('ODOO_DB'), login = env('ODOO_LOGIN'), key = env('ODOO_API_KEY');
  if (!url || !db || !login || !key) return { ok: false, configurado: false, erro: 'Integração com o Odoo não configurada.', dica: 'Defina ODOO_URL, ODOO_DB, ODOO_LOGIN e ODOO_API_KEY na Vercel (as mesmas das folgas).' };
  const uid = await odoo(url, 'common', 'authenticate', [db, login, key, {}]);
  if (!uid) return { ok: false, erro: 'Login no Odoo recusado — confira ODOO_LOGIN e ODOO_API_KEY.' };
  const base = url.replace(/\/+$/, '');
  return { ok: true, base, exec: (model, method, args, kw) => odoo(url, 'object', 'execute_kw', [db, uid, key, model, method, args, kw || {}]),
    urlOrdem: (id) => `${base}/web#id=${id}&model=sale.order&view_type=form` };
}
const odooMsg = (e) => String((e && e.message) || e).slice(0, 300);
const semAnalitica = (e) => /analytic/i.test(String((e && e.message) || e));
// {ac, pct}[] → {"<id da conta analítica>": pct} (o formato do analytic_distribution); vazio → null.
function odooDistribuicao(rateio) {
  const d = {};
  (rateio || []).forEach((r) => { const ac = Math.round(num(r && r.ac)), pct = Math.round(num(r && r.pct) * 100) / 100; if (ac > 0 && pct > 0) d[String(ac)] = Math.round(((d[String(ac)] || 0) + pct) * 100) / 100; });
  return Object.keys(d).length ? d : null;
}
function odooDistIgual(a, b) {
  const A = (a && typeof a === 'object') ? a : {}, B = (b && typeof b === 'object') ? b : {};
  const ka = Object.keys(A), kb = Object.keys(B);
  return ka.length === kb.length && ka.every((k) => Math.abs(num(A[k]) - num(B[k])) < 0.01);
}
function odooLinhasCorpo(b) {
  return (Array.isArray(b.linhas) ? b.linhas : []).map((l) => ({
    chave: txt(l && l.chave, 40), tipo: (l && l.tipo === 'extra') ? 'extra' : 'periodo', mes: txt(l && l.mes, 7), de: isoData(l && l.de), ate: isoData(l && l.ate), nota: isoData(l && l.nota),
    descricao: txt(l && l.descricao, 200), qtd: Math.round(Math.max(0, num(l && l.qtd)) * 100) / 100, unitario: Math.round(Math.max(0, num(l && l.unitario)) * 100) / 100,
    rateio: (Array.isArray(l && l.rateio) ? l.rateio : []).slice(0, 12).map((r) => ({ ac: Math.round(num(r && r.ac)), pct: num(r && r.pct) })).filter((r) => r.ac > 0 && r.pct > 0),
  })).filter((l) => l.chave && l.qtd > 0 && l.unitario > 0).slice(0, 80);
}
const resumoLinha = (l, extra) => ({ chave: l.chave, tipo: l.tipo, mes: l.mes, descricao: l.descricao, qtd: l.qtd, unitario: l.unitario, valor: Math.round(l.qtd * l.unitario * 100) / 100, rateio: l.rateio, ...(extra || {}) });
// Produto de serviço: o id escolhido na tela → o env (id ou nome) → o 1º serviço à venda (se `fallback`).
async function odooProduto(s, id, cfgEnv, fallback) {
  const pid = Math.max(0, Math.round(num(id)));
  if (pid) { const r = await s.exec('product.product', 'search_read', [[['id', '=', pid]]], { fields: ['id'], limit: 1 }); if (r.length) return pid; }
  if (cfgEnv) {
    const dom = /^\d+$/.test(cfgEnv) ? [['id', '=', Number(cfgEnv)]] : [['name', 'ilike', cfgEnv]];
    const r = await s.exec('product.product', 'search_read', [dom], { fields: ['id'], limit: 1 }); if (r.length) return r[0].id;
  }
  if (!fallback) return 0;
  const r = await s.exec('product.product', 'search_read', [[['type', '=', 'service'], ['sale_ok', '=', true]]], { fields: ['id'], limit: 1 });
  return r.length ? r[0].id : 0;
}
// Cliente (res.partner) pelo nome da consultoria; várias respostas ambíguas voltam para a pessoa escolher.
async function odooParceiro(s, nome) {
  if (!nome) return { ok: false, erro: 'Informe o nome da consultoria no contrato para achar o cliente no Odoo.' };
  let lista = await s.exec('res.partner', 'search_read', [[['name', 'ilike', nome], ['is_company', '=', true]]], { fields: ['id', 'name'], limit: 8 });
  if (!lista.length) lista = await s.exec('res.partner', 'search_read', [[['name', 'ilike', nome]]], { fields: ['id', 'name'], limit: 8 });
  if (!lista.length) return { ok: false, erro: `Nenhum cliente parecido com "${nome}" no Odoo.`, dica: 'Cadastre a consultoria em Contatos no Odoo (ou ajuste o nome no contrato) e tente de novo.' };
  const exato = lista.find((x) => String(x.name || '').trim().toLowerCase() === nome.toLowerCase());
  if (lista.length > 1 && !exato) return { ok: false, escolher: lista.map((x) => ({ id: x.id, name: x.name })) };
  const p = exato || lista[0]; return { ok: true, id: p.id, nome: txt(p.name, 120) };
}
async function catalogoOdoo(res, b) {
  const email = txt(b.email, 200), token = String(b.token || '');
  if (!email || !token) return json(res, 400, { ok: false, erro: 'Identifique-se em ⏱ Apontar (e-mail + token do Jira) para ler o catálogo do Odoo.' });
  const quem = await jiraMyself(email, token); if (!quem.ok) return json(res, 401, { ok: false, erro: quem.erro });
  const ck = 'odoo-catalogo';
  if (!b.forca) { const c = cacheGet(ck); if (c) return json(res, 200, { ...c, cache: true }); }
  const s = await odooConecta(); if (!s.ok) return json(res, 200, s);
  try {
    const prods = await s.exec('product.product', 'search_read', [[['sale_ok', '=', true], ['type', '=', 'service']]], { fields: ['id', 'name', 'default_code', 'list_price'], limit: 200, order: 'name' });
    let anals = [], analErro = '';
    try { anals = await s.exec('account.analytic.account', 'search_read', [[['active', '=', true]]], { fields: ['id', 'name', 'code', 'plan_id'], limit: 500, order: 'name' }); }
    catch (e) { analErro = 'Contas analíticas indisponíveis: ' + odooMsg(e).slice(0, 160); }
    const out = { ok: true, lidoEm: new Date().toISOString(),
      produtos: prods.map((p) => ({ id: p.id, nome: txt(p.name, 120), ref: txt(p.default_code || '', 40), preco: num(p.list_price) })),
      analiticas: anals.map((a) => ({ id: a.id, nome: txt(a.name, 120), codigo: txt(a.code || '', 40), plano: Array.isArray(a.plan_id) ? txt(a.plan_id[1], 80) : '' })), analErro };
    return json(res, 200, cacheSetTTL(ck, out, 10));
  } catch (e) {
    return json(res, 200, { ok: false, erro: `Odoo: ${odooMsg(e)}`, dica: 'Confira se a conta de serviço do Odoo pode ler produtos (Vendas) e contas analíticas (Contabilidade).' });
  }
}
async function sincronizaContratoOdoo(res, b) {
  const email = txt(b.email, 200), token = String(b.token || '');
  const linhas = odooLinhasCorpo(b); const ordemId = Math.max(0, Math.round(num(b.ordemId)));
  const vinculos = (Array.isArray(b.itens) ? b.itens : []).map((x) => ({ chave: txt(x && x.chave, 40), id: Math.round(num(x && x.id)) })).filter((x) => x.chave && x.id > 0).slice(0, 200);
  const consultoria = txt(b.consultoria, 120); const cliente = txt(b.cliente, 120) || consultoria;
  const ref = `Jira Insights · contrato de parceria ${txt(b.contratoId, 30)}`;
  const totalPrev = Math.round(linhas.reduce((s, l) => s + l.qtd * l.unitario, 0) * 100) / 100;
  if (!ordemId && !linhas.length) return json(res, 400, { ok: false, erro: 'Nenhum período com horas e valor (nem hora extra) para levar ao Odoo.' });
  if (!email || !token) return json(res, 400, { ok: false, erro: 'Identifique-se em ⏱ Apontar (e-mail + token do Jira) para mexer na ordem de venda.' });
  const quem = await jiraMyself(email, token); if (!quem.ok) return json(res, 401, { ok: false, erro: quem.erro });
  const s = await odooConecta(); if (!s.ok) return json(res, 200, s);
  const avisos = [];
  try {
    const produtoId = await odooProduto(s, b.produtoId, env('ODOO_PRODUTO_SERVICO'), true);
    if (!produtoId) return json(res, 200, { ok: false, erro: 'Nenhum produto de serviço encontrado no Odoo para os itens da ordem.', dica: 'Escolha o produto em 🧾 Faturamentos › ⚙ Produtos no Odoo, ou crie um produto do tipo Serviço (ex.: "Horas de consultoria") lá.' });
    const produtoExtraId = (await odooProduto(s, b.produtoExtraId, env('ODOO_PRODUTO_EXTRA'), false)) || produtoId;
    const vals = (l, comRateio) => { const v = { product_id: l.tipo === 'extra' ? produtoExtraId : produtoId, name: l.descricao, product_uom_qty: l.qtd, price_unit: l.unitario }; const d = comRateio ? odooDistribuicao(l.rateio) : null; if (d) v.analytic_distribution = d; return v; };
    if (!ordemId) {
      // ---- ordem NOVA: cotação em rascunho com todos os itens ----
      let partnerId = Math.max(0, Math.round(num(b.parceiroId))), partnerNome = '';
      if (!partnerId) { const p = await odooParceiro(s, cliente); if (!p.ok) return json(res, 200, p); partnerId = p.id; partnerNome = p.nome; }
      const plano = { novo: true, criar: linhas.map((l) => resumoLinha(l)), atualizar: [], remover: [], mantidas: [], manuais: [], iguais: 0, total: totalPrev, produtoId, produtoExtraId, parceiroId: partnerId, parceiroNome: partnerNome };
      if (b.dry) return json(res, 200, { ok: true, dry: true, plano });
      const ct = ` Contrato de parceria: ${consultoria}${b.modalidade ? ' (' + txt(b.modalidade, 60) + ')' : ''}${num(b.fatFecha) ? `, período de faturamento até o dia ${Math.round(num(b.fatFecha))}` : ''}${num(b.fatDia) ? `, nota no dia ${Math.round(num(b.fatDia))}` : ''}${b.conta ? `, recebimento na conta ${txt(b.conta, 120)}` : ''}.`;
      const nota = `Ordem de venda do contrato de parceria "${consultoria}" — um item por período de faturamento e um por hora extra (${linhas.length} item(ns)).${ct} Gerada no Jira Insights por ${quem.nome || email}.${b.obs ? ' ' + txt(b.obs, 300) : ''}`;
      const cabecalho = { partner_id: partnerId, client_order_ref: ref, origin: ref, note: nota };
      let orderId;
      try { orderId = await s.exec('sale.order', 'create', [{ ...cabecalho, order_line: linhas.map((l) => [0, 0, vals(l, true)]) }]); }
      catch (e) { if (!semAnalitica(e)) throw e; avisos.push('objetos de resultado não aplicados (o Odoo recusou a distribuição analítica): ' + odooMsg(e).slice(0, 120)); orderId = await s.exec('sale.order', 'create', [{ ...cabecalho, order_line: linhas.map((l) => [0, 0, vals(l, false)]) }]); }
      const ord = ((await s.exec('sale.order', 'read', [[orderId]], { fields: ['name', 'state', 'amount_total', 'order_line'] })) || [])[0] || {};
      const ids = (ord.order_line || []).map((x) => Number(x) || 0);
      const itens = linhas.map((l, i) => ({ chave: l.chave, id: ids[i] || 0 })).filter((x) => x.id);
      cacheSetTTL(`odoo-venda-status:${orderId}`, null, 0);
      return json(res, 200, { ok: true, id: orderId, name: txt(ord.name, 40), state: txt(ord.state, 20) || 'draft', total: num(ord.amount_total) || totalPrev, url: s.urlOrdem(orderId), parceiroId: partnerId, produtoId, produtoExtraId, itens, aplicado: { criadas: itens.length, atualizadas: 0, removidas: 0, zeradas: 0 }, avisos });
    }
    // ---- ordem EXISTENTE: comparar a previsão com os itens que ela tem ----
    const ord = ((await s.exec('sale.order', 'read', [[ordemId]], { fields: ['name', 'state', 'order_line', 'partner_id', 'amount_total'] })) || [])[0];
    if (!ord) return json(res, 200, { ok: false, erro: `Ordem de venda #${ordemId} não encontrada no Odoo (pode ter sido excluída) — esqueça o vínculo e crie outra.` });
    if (ord.state === 'cancel') return json(res, 200, { ok: false, erro: `A ordem ${ord.name} está cancelada no Odoo — esqueça o vínculo para criar outra.` });
    const lineIds = (ord.order_line || []).map((x) => Number(x) || 0).filter(Boolean);
    const exist = lineIds.length ? await s.exec('sale.order.line', 'read', [lineIds], { fields: ['name', 'product_uom_qty', 'price_unit', 'qty_invoiced', 'analytic_distribution', 'product_id', 'display_type'] }) : [];
    const porId = {}; exist.forEach((L) => { porId[L.id] = L; });
    const mapa = {}; vinculos.forEach((x) => { if (porId[x.id]) mapa[x.chave] = x.id; });   // só vínculos que ainda existem na ordem
    const rascunho = ord.state === 'draft' || ord.state === 'sent';
    const criar = [], atualizar = [], remover = [], mantidas = [], iguais = [];
    linhas.forEach((l) => {
      const id = mapa[l.chave]; const L = id ? porId[id] : null;
      if (!L) { criar.push(resumoLinha(l)); return; }
      const fat = num(L.qty_invoiced), qAtual = num(L.product_uom_qty);
      if (fat > 0 && fat >= qAtual - 0.01 && l.qtd <= fat + 0.01) { mantidas.push(resumoLinha(l, { id, motivo: 'já faturado' })); iguais.push({ chave: l.chave, id }); return; }
      const v = {}; let qtd = l.qtd, travada = 0;
      if (fat > 0 && qtd < fat) { qtd = fat; travada = fat; }   // nunca abaixo do já faturado
      if (Math.abs(qAtual - qtd) > 0.005) v.product_uom_qty = qtd;
      if (fat <= 0 && Math.abs(num(L.price_unit) - l.unitario) > 0.005) v.price_unit = l.unitario;   // preço só muda antes de qualquer fatura
      if (txt(L.name, 200) !== l.descricao) v.name = l.descricao;
      const d = odooDistribuicao(l.rateio); const atual = (L.analytic_distribution && typeof L.analytic_distribution === 'object') ? L.analytic_distribution : null;
      if (!odooDistIgual(d, atual)) v.analytic_distribution = d || false;
      if (Object.keys(v).length) atualizar.push(resumoLinha(l, { id, vals: v, de: { qtd: qAtual, unitario: num(L.price_unit) }, travada }));
      else iguais.push({ chave: l.chave, id });
    });
    const enviadas = new Set(linhas.map((l) => l.chave));
    Object.keys(mapa).forEach((chave) => {
      if (enviadas.has(chave)) return;
      const id = mapa[chave], L = porId[id], fat = num(L.qty_invoiced), qAtual = num(L.product_uom_qty);
      const base = { chave, id, descricao: txt(L.name, 200), qtd: qAtual, unitario: num(L.price_unit), valor: Math.round(qAtual * num(L.price_unit) * 100) / 100 };
      if (fat > 0) { mantidas.push({ ...base, motivo: 'saiu da previsão, mas já tem fatura' }); iguais.push({ chave, id }); return; }
      if (qAtual <= 0) { iguais.push({ chave, id }); return; }   // já zerada numa sincronização anterior
      remover.push({ ...base, modo: rascunho ? 'apagar' : 'zerar' });
    });
    const conhecidos = new Set(Object.values(mapa));
    const manuais = exist.filter((L) => !conhecidos.has(L.id) && !L.display_type).map((L) => ({ id: L.id, descricao: txt(L.name, 200), qtd: num(L.product_uom_qty), unitario: num(L.price_unit), valor: Math.round(num(L.product_uom_qty) * num(L.price_unit) * 100) / 100, faturada: num(L.qty_invoiced) > 0 }));
    const plano = { novo: false, name: txt(ord.name, 40), state: txt(ord.state, 20), criar, atualizar, remover, mantidas, manuais, iguais: iguais.length, total: totalPrev, produtoId, produtoExtraId };
    if (b.dry) return json(res, 200, { ok: true, dry: true, plano });
    // ---- aplicar ----
    const itens = iguais.slice();
    let criadas = 0, atualizadas = 0, removidas = 0, zeradas = 0;
    if (criar.length) {
      const novas = linhas.filter((l) => criar.some((c) => c.chave === l.chave));
      let ids;
      try { ids = await s.exec('sale.order.line', 'create', [novas.map((l) => ({ order_id: ordemId, ...vals(l, true) }))]); }
      catch (e) { if (!semAnalitica(e)) throw e; avisos.push('objetos de resultado não aplicados nos itens novos: ' + odooMsg(e).slice(0, 120)); ids = await s.exec('sale.order.line', 'create', [novas.map((l) => ({ order_id: ordemId, ...vals(l, false) }))]); }
      ids = Array.isArray(ids) ? ids : [ids];
      novas.forEach((l, i) => { if (ids[i]) { itens.push({ chave: l.chave, id: Number(ids[i]) }); criadas += 1; } });
    }
    for (const a of atualizar) {
      try { await s.exec('sale.order.line', 'write', [[a.id], a.vals]); atualizadas += 1; itens.push({ chave: a.chave, id: a.id }); }
      catch (e) {
        const v = { ...a.vals };
        if ('analytic_distribution' in v && semAnalitica(e)) {
          delete v.analytic_distribution; avisos.push(`item ${a.mes || a.chave}: objetos de resultado não aplicados`);
          try { if (Object.keys(v).length) await s.exec('sale.order.line', 'write', [[a.id], v]); atualizadas += 1; itens.push({ chave: a.chave, id: a.id }); }
          catch (e2) { avisos.push(`item ${a.mes || a.chave} não atualizado: ${odooMsg(e2).slice(0, 120)}`); itens.push({ chave: a.chave, id: a.id }); }
        } else { avisos.push(`item ${a.mes || a.chave} não atualizado: ${odooMsg(e).slice(0, 120)}`); itens.push({ chave: a.chave, id: a.id }); }
      }
    }
    for (const r of remover) {
      try {
        if (r.modo === 'apagar') { await s.exec('sale.order.line', 'unlink', [[r.id]]); removidas += 1; }
        else { await s.exec('sale.order.line', 'write', [[r.id], { product_uom_qty: 0 }]); zeradas += 1; itens.push({ chave: r.chave, id: r.id }); }
      } catch (e) { avisos.push(`item ${r.chave} não removido: ${odooMsg(e).slice(0, 120)}`); itens.push({ chave: r.chave, id: r.id }); }
    }
    cacheSetTTL(`odoo-venda-status:${ordemId}`, null, 0);
    const dep = ((await s.exec('sale.order', 'read', [[ordemId]], { fields: ['name', 'state', 'amount_total'] })) || [])[0] || {};
    return json(res, 200, { ok: true, id: ordemId, name: txt(dep.name || ord.name, 40), state: txt(dep.state || ord.state, 20), total: num(dep.amount_total), url: s.urlOrdem(ordemId),
      parceiroId: Array.isArray(ord.partner_id) ? Number(ord.partner_id[0]) || 0 : 0, produtoId, produtoExtraId, itens, aplicado: { criadas, atualizadas, removidas, zeradas }, avisos });
  } catch (e) {
    return json(res, 200, { ok: false, erro: `Odoo: ${odooMsg(e)}`, dica: 'Confira se o módulo Vendas está instalado e se a conta de serviço do Odoo pode criar e alterar ordens de venda.' });
  }
}
async function cancelaOrdemOdoo(res, b) {
  const email = txt(b.email, 200), token = String(b.token || ''); const ordemId = Math.max(0, Math.round(num(b.ordemId)));
  if (!ordemId) return json(res, 400, { ok: false, erro: 'Informe a ordem de venda a cancelar.' });
  if (!email || !token) return json(res, 400, { ok: false, erro: 'Identifique-se em ⏱ Apontar (e-mail + token do Jira) para cancelar a ordem.' });
  const quem = await jiraMyself(email, token); if (!quem.ok) return json(res, 401, { ok: false, erro: quem.erro });
  const s = await odooConecta(); if (!s.ok) return json(res, 200, s);
  try {
    const le = async () => ((await s.exec('sale.order', 'read', [[ordemId]], { fields: ['name', 'state'] })) || [])[0] || null;
    let ord = await le();
    if (!ord) return json(res, 200, { ok: true, state: 'ausente', name: '', aviso: `Ordem #${ordemId} já não existe no Odoo.` });
    if (ord.state === 'cancel') return json(res, 200, { ok: true, state: 'cancel', name: txt(ord.name, 40) });
    // O Odoo abre um assistente de confirmação em alguns estados; o contexto abaixo pula o aviso e, se ainda
    // assim voltar o assistente, ele é criado e confirmado aqui mesmo.
    try { await s.exec('sale.order', 'action_cancel', [[ordemId]], { context: { disable_cancel_warning: true } }); } catch (e) { if (!/cancel/i.test(odooMsg(e))) throw e; }
    ord = await le();
    if (ord && ord.state !== 'cancel') {
      try { const wid = await s.exec('sale.order.cancel', 'create', [{ order_id: ordemId }]); await s.exec('sale.order.cancel', 'action_cancel', [[wid]]); } catch (e) { /* sem assistente nesta versão */ }
      ord = await le();
    }
    cacheSetTTL(`odoo-venda-status:${ordemId}`, null, 0);
    if (ord && ord.state === 'cancel') return json(res, 200, { ok: true, state: 'cancel', name: txt(ord.name, 40) });
    return json(res, 200, { ok: false, state: txt(ord && ord.state, 20), name: txt(ord && ord.name, 40), erro: `O Odoo não cancelou a ordem ${txt(ord && ord.name, 40)} (há faturas lançadas?). Cancele-a no Odoo.` });
  } catch (e) {
    return json(res, 200, { ok: false, erro: `Odoo: ${odooMsg(e)}`, dica: 'Confira se a conta de serviço do Odoo pode cancelar ordens de venda.' });
  }
}

// Tipos de ausência aceitos pela árvore "Onde crio?" — cada um resolve o
// hr.leave.type do Odoo por env (id ou nome) ou por busca de nome padrão.
const AUS_TIPOS_SRV = {
  compensacao: { env: 'ODOO_FOLGA_TIPO_ID', busca: null, rot: 'Compensação de horas' },
  atestado: { env: 'ODOO_TIPO_ATESTADO', busca: (n) => /atestado/i.test(n), rot: 'Atestado médico' },
  ferias: { env: 'ODOO_TIPO_FERIAS', busca: (n) => /f[ée]rias/i.test(n) && !/n[ãa]o\s+remun|sem\s+remun/i.test(n), rot: 'Férias remuneradas' },
  ferias_nr: { env: 'ODOO_TIPO_FERIAS_NR', busca: (n) => /f[ée]rias/i.test(n) && /n[ãa]o\s+remun|sem\s+remun/i.test(n), rot: 'Férias não remuneradas' },
};

async function criaFolga(res, b) {
  const url = env('ODOO_URL'), db = env('ODOO_DB'), login = env('ODOO_LOGIN'),
    key = env('ODOO_API_KEY');
  if (!url || !db || !login || !key) {
    return json(res, 200, { ok: false, configurado: false,
      erro: 'Integração com o Odoo não configurada. Defina ODOO_URL, ODOO_DB, ODOO_LOGIN e ODOO_API_KEY na Vercel.' });
  }
  const tipoAus = AUS_TIPOS_SRV[String(b.tipoAusencia || 'compensacao')] || AUS_TIPOS_SRV.compensacao;
  const tipoCfg = env(tipoAus.env);
  if (tipoAus.env === 'ODOO_FOLGA_TIPO_ID' && !tipoCfg) {
    return json(res, 200, { ok: false, configurado: false,
      erro: 'Defina ODOO_FOLGA_TIPO_ID (id ou nome do tipo de ausência) na Vercel.' });
  }

  const email = String(b.email || '').trim().toLowerCase();
  const nome = String(b.nome || '').trim();
  const data = isoData(b.data);
  const modo = ['meio', 'dia', 'horas'].includes(b.modo) ? b.modo : 'meio';
  if (!data) return json(res, 400, { ok: false, erro: 'Data da folga inválida (use AAAA-MM-DD).' });
  if (!email && !nome) return json(res, 400, { ok: false, erro: 'Sem e-mail nem nome para identificar a pessoa.' });

  // 1) Autentica a conta de serviço → uid.
  const uid = await odoo(url, 'common', 'authenticate', [db, login, key, {}]);
  if (!uid) return json(res, 200, { ok: false, erro: 'Falha de autenticação no Odoo (confira ODOO_DB/ODOO_LOGIN/ODOO_API_KEY).' });
  const exec = (model, method, args, kwargs = {}) =>
    odoo(url, 'object', 'execute_kw', [db, uid, key, model, method, args, kwargs]);

  // 2) Resolve o tipo de ausência: env com id numérico ou nome; sem env, busca o
  //    hr.leave.type pelo nome padrão do tipo (atestado/férias…).
  let tipoId = /^\d+$/.test(tipoCfg) ? Number(tipoCfg) : 0;
  if (!tipoId && tipoCfg) {
    const tipos = await exec('hr.leave.type', 'search_read', [[['name', 'ilike', tipoCfg]]], { fields: ['id'], limit: 1 });
    if (!tipos.length) return json(res, 200, { ok: false, erro: `Tipo de ausência "${tipoCfg}" não encontrado no Odoo.` });
    tipoId = tipos[0].id;
  }
  if (!tipoId && tipoAus.busca) {
    const todos = await exec('hr.leave.type', 'search_read', [[]], { fields: ['id', 'name'], limit: 80 });
    const achado = (todos || []).find((t) => tipoAus.busca(String(t.name || '')));
    if (!achado) {
      return json(res, 200, { ok: false,
        erro: `Não achei o tipo "${tipoAus.rot}" no Odoo — configure ${tipoAus.env} (id ou nome do hr.leave.type) na Vercel.` });
    }
    tipoId = achado.id;
  }
  if (!tipoId) return json(res, 200, { ok: false, erro: `Tipo de ausência não resolvido (${tipoAus.rot}).` });

  // 3) Localiza o funcionário (por e-mail de trabalho; cai para o nome).
  let emps = [];
  if (email) emps = await exec('hr.employee', 'search_read', [[['work_email', '=ilike', email]]], { fields: ['id', 'name'], limit: 1 });
  if (!emps.length && nome) emps = await exec('hr.employee', 'search_read', [[['name', 'ilike', nome]]], { fields: ['id', 'name'], limit: 1 });
  if (!emps.length) return json(res, 200, { ok: false, erro: `Funcionário não encontrado no Odoo (${email || nome}). Confirme o e-mail/nome cadastrado lá.` });
  const empId = emps[0].id;

  // 4) Monta o pedido de ausência (hr.leave).
  const vals = {
    employee_id: empId,
    holiday_status_id: tipoId,
    name: String(b.motivo || '').trim() || `${tipoAus.rot} (painel Insights)`,
    request_date_from: data,
    request_date_to: isoData(b.dataFim) || data,
  };
  if (modo === 'meio') {
    vals.request_unit_half = true;
    vals.request_date_to = data;
    vals.request_date_from_period = (b.periodo === 'pm') ? 'pm' : 'am';
  } else if (modo === 'horas') {
    const h = Math.min(8, Math.max(0.5, Number(b.horas) || 1));
    vals.request_unit_hours = true;
    vals.request_date_to = data;
    const ini = 9;                            // janela padrão a partir das 9h
    vals.request_hour_from = String(ini);
    vals.request_hour_to = String(ini + h);
  }

  const id = await exec('hr.leave', 'create', [vals]);
  // 5) Tenta enviar para aprovação (não falha o pedido se o fluxo não permitir).
  try { await exec('hr.leave', 'action_confirm', [[id]]); } catch (e) { /* fica como rascunho */ }

  const link = `${url.replace(/\/+$/, '')}/web#id=${id}&model=hr.leave&view_type=form`;
  return json(res, 200, { ok: true, id, funcionario: emps[0].name, url: link });
}

// Schema/sistema do resumo de atividades + cliente Claude: em ./_lib/ia.js
// (compartilhados com /api/teams, que envia o resumo agendado ao canal).

// ---------------------------------------------------------------------------
// Análise de QUALIDADE dos tickets vs. as boas práticas TI-04-006 (Notion).
// A rubrica é lida AO VIVO da página pública (o link pode ser atualizado a
// qualquer momento); se a página não puder ser lida, usa um snapshot local.
// Consolidada aqui pelo limite de 12 Serverless Functions.
// ---------------------------------------------------------------------------
const QUALIDADE_URL_PADRAO = 'https://dexterityitsolutions.notion.site/TI-04-006-Boas-Praticas-de-Cria-o-de-itens-do-Ticket-do-JIRA-2c7c69371e17803a9650c3e391599385';
const MAX_TICKETS_Q = 30;
// Snapshot condensado da TI-04-006 (fallback) — 13 princípios.
const RUBRICA_LOCAL = [
  'TI-04-006 — Boas práticas de criação de itens/tickets do Jira (Dexterity):',
  'P1. Um ticket = um objetivo claro: descrever O QUE fazer, o motivo e o critério de aceite; nada de "ver isso"/"alinhar", sem contexto, múltiplos objetivos ou ticket como chat.',
  'P2. Não apontar horas em Histórias: criar subtarefas para execução e apontar nelas; História é agrupador lógico.',
  'P3. Todo ticket tem dono: um único responsável principal definido (nunca em branco, nunca "equipe", troca formal registrada).',
  'P4. Status reflete a realidade: To Do = não começou; In Progress = execução ativa; Blocked = impedimento real; Done = concluído e validado. Não manipular status.',
  'P5. Atualização contínua: registrar início, bloqueios e conclusões; nada de ticket parado sem comentário ou comentários genéricos ("seguindo").',
  'P6. Tipo correto de item: Rotina p/ recorrente, Tarefa p/ entregável, História p/ agrupamento, Épico p/ grandes frentes.',
  'P7. Status usado corretamente: mudar só com mudança real; Blocked para dependência externa; encerrar só com aceite cumprido.',
  'P8. Nenhuma tarefa acumula mais de 8h consecutivas: quebrar em partes menores/subtarefas; não usar tarefa como "container de horas" por dias.',
  'P9. Ticket representa entrega, não intenção: precisa de entregável verificável; nada de "pensar sobre", genérico ou lembrete pessoal.',
  'P10. Reuniões/atividades administrativas têm procedimento próprio: não misturar reunião com tarefa técnica nem horas administrativas em tarefas de entrega.',
  'P11. Não deixar itens abertos só para apontar horas: fechar ao concluir; trabalho de vários dias vira subtarefas por dia/etapa/entrega.',
  'P12. Data limite = data REAL prevista de entrega (baseline): o campo de vencimento deve existir e refletir a realidade.',
  'P13. Ticket como fonte central de informação: links para todos os arquivos/evidências relevantes no ticket (não só no Teams/e-mail).',
  'Bugs: tipo Bug com comportamento atual, esperado, passos de reprodução, ambiente e evidências; título específico; um problema por bug; vincular ao ticket relacionado.',
].join('\n');

// Busca uma página PUBLICADA do Notion (notion.site) e devolve o texto puro, ou ''
// quando a página não pode ser lida / vem "vazia" (não publicada, bloqueio, rede).
async function paginaNotionTexto(url, minLen) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; jirainsight)', Accept: 'text/html' } });
    if (!r.ok) return '';
    const html = await r.text();
    const t = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ').trim();
    // Página publicada do Notion vem renderizada no HTML; se vier "vazia", cai no snapshot.
    return t.length > (minLen || 1200) ? t.slice(0, 24000) : '';
  } catch (e) { return ''; }
}

async function rubricaBoasPraticas() {
  const ck = 'qualidade:rubrica';
  const c = cacheGet(ck);
  if (c) return c;
  const url = (process.env.QUALIDADE_URL || QUALIDADE_URL_PADRAO).trim();
  const t = await paginaNotionTexto(url, 1200);
  if (t) return cacheSetTTL(ck, { texto: t, fonte: 'notion', url }, 30);
  return cacheSetTTL(ck, { texto: RUBRICA_LOCAL, fonte: 'local', url }, 30);
}

// ADF (descrição do Jira v3) -> texto simples.
function adfTexto(n, out) {
  if (!n) return '';
  out = out || [];
  if (Array.isArray(n)) { n.forEach((x) => adfTexto(x, out)); return out.join(''); }
  if (n.type === 'text') out.push(n.text || '');
  if (n.type === 'hardBreak' || n.type === 'paragraph') out.push('\n');
  if (n.content) adfTexto(n.content, out);
  return out.join('');
}

const SCHEMA_Q = {
  type: 'object',
  properties: {
    geral: { type: 'string' },
    tickets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          k: { type: 'string' },
          nota: { type: 'number' },
          sinal: { type: 'string', enum: ['bom', 'atencao', 'critico'] },
          problemas: {
            type: 'array',
            items: { type: 'object', properties: { principio: { type: 'string' }, detalhe: { type: 'string' } }, required: ['principio', 'detalhe'], additionalProperties: false },
          },
          acoes: {
            type: 'array',
            items: { type: 'object', properties: { tipo: { type: 'string', enum: ['comentar', 'vencimento', 'atribuir', 'status', 'dividir', 'editar'] }, rotulo: { type: 'string' }, texto: { type: 'string' } }, required: ['tipo', 'rotulo'], additionalProperties: false },
          },
        },
        required: ['k', 'nota', 'sinal', 'problemas', 'acoes'],
        additionalProperties: false,
      },
    },
  },
  required: ['geral', 'tickets'],
  additionalProperties: false,
};

const SISTEMA_Q = [
  'Você é um auditor de qualidade de tickets do Jira da Dexterity IT. Recebe a RUBRICA',
  '(as boas práticas oficiais TI-04-006, texto extraído do Notion) e uma lista de TICKETS',
  'criados recentemente (com descrição, tipo, responsável, vencimento, horas apontadas e',
  'nº de subtarefas). Avalie CADA ticket contra a rubrica, em português do Brasil.',
  '',
  'Para cada ticket devolva:',
  '- nota: 0 a 100 (aderência às boas práticas; 100 = exemplar).',
  '- sinal: "bom" (>=80), "atencao" (50–79) ou "critico" (<50).',
  '- problemas: SÓ os princípios violados (máx. 4, os mais graves primeiro), cada um com o',
  '  nº/nome curto do princípio (ex.: "P1 — objetivo claro") e um detalhe ESPECÍFICO deste',
  '  ticket (cite o que falta ou está errado; nunca genérico).',
  '- acoes: 1 a 3 ações práticas para o dono corrigir, escolhendo o tipo mais adequado:',
  '  "comentar" (inclua em texto um comentário pronto, construtivo e educado, citando as boas',
  '  práticas e pedindo a correção — será postado no ticket), "vencimento" (falta/errada a',
  '  data limite), "atribuir" (sem responsável), "status" (status não reflete a realidade),',
  '  "dividir" (mais de 8h acumuladas / vários objetivos → sugerir subtarefas) ou "editar"',
  '  (resumo/descrição precisam ser reescritos; em texto sugira o novo resumo/descrição).',
  '- Ticket bom (nota >= 80): problemas=[] e uma única ação "comentar" só se houver algo',
  '  pequeno a melhorar; senão acoes=[].',
  '',
  'Regras: baseie-se APENAS nos dados fornecidos; não invente campos que não recebeu.',
  'Descrição vazia/curta demais para o tipo é violação do P1. Horas apontadas em item de',
  'tipo História violam o P2. Sem responsável viola o P3. Sem vencimento viola o P12.',
  'Mais de 8h apontadas num ticket sem subtarefas sugere P8/P11.',
  'Em "geral", escreva 2 a 3 frases sobre o padrão do lote (principais problemas recorrentes).',
].join('\n');

async function analisaQualidade(res, b, apiKey) {
  const dias = Math.min(60, Math.max(1, Number(b.dias) || 14));
  const projeto = String(b.projeto || '').trim().toUpperCase();
  if (projeto && !/^[A-Z][A-Z0-9_]*$/.test(projeto)) return json(res, 400, { erro: 'Projeto inválido.' });
  const ck = `qualidade:analise:${dias}:${projeto || '*'}`;
  const c = cacheGet(ck);
  if (c && !b.nocache) return json(res, 200, c);

  const rubrica = await rubricaBoasPraticas();
  const jql = `created >= -${dias}d${projeto ? ` AND project = ${projeto}` : ''} ORDER BY created DESC`;
  const { issues } = await jiraSearchAll({
    jql,
    fields: ['summary', 'description', 'issuetype', 'status', 'assignee', 'duedate', 'created', 'reporter', 'priority', 'labels', 'timespent', 'subtasks', 'parent', 'project'],
    pageSize: MAX_TICKETS_Q, maxPages: 1,
  });
  if (!issues.length) return json(res, 200, { ok: true, tickets: [], geral: 'Nenhum ticket criado no período.', fonte: rubrica.fonte, url: rubrica.url, dias, projeto });

  const dados = issues.slice(0, MAX_TICKETS_Q).map((it) => {
    const f = it.fields || {};
    return {
      k: it.key,
      projeto: (f.project && f.project.key) || '',
      tipo: (f.issuetype && f.issuetype.name) || '',
      resumo: String(f.summary || '').slice(0, 255),
      descricao: adfTexto(f.description).replace(/\s+/g, ' ').trim().slice(0, 900),
      status: (f.status && f.status.name) || '',
      responsavel: (f.assignee && f.assignee.displayName) || '',
      respId: (f.assignee && f.assignee.accountId) || '',
      relator: (f.reporter && f.reporter.displayName) || '',
      relatorId: (f.reporter && f.reporter.accountId) || '',
      vencimento: f.duedate || '',
      criadoEm: String(f.created || '').slice(0, 10),
      prioridade: (f.priority && f.priority.name) || '',
      labels: Array.isArray(f.labels) ? f.labels.slice(0, 8) : [],
      horasApontadas: Math.round(((Number(f.timespent) || 0) / 3600) * 10) / 10,
      nSubtarefas: Array.isArray(f.subtasks) ? f.subtasks.length : 0,
      temPai: !!f.parent,
    };
  });

  const prompt = 'RUBRICA (boas práticas TI-04-006):\n\n' + rubrica.texto
    + '\n\n---\n\nTICKETS PARA AUDITAR (JSON):\n\n' + JSON.stringify(dados);
  const resultado = await chamaClaude(apiKey, null, { system: SISTEMA_Q, schema: SCHEMA_Q, prompt });

  const porK = {}; (resultado.tickets || []).forEach((t) => { porK[String(t.k || '')] = t; });
  const tickets = dados.map((d) => {
    const a = porK[d.k] || { nota: 0, sinal: 'atencao', problemas: [], acoes: [] };
    return {
      ...d,
      nota: Math.max(0, Math.min(100, Math.round(Number(a.nota) || 0))),
      sinal: ['bom', 'atencao', 'critico'].includes(a.sinal) ? a.sinal : 'atencao',
      problemas: (Array.isArray(a.problemas) ? a.problemas : []).slice(0, 4).map((p) => ({ principio: txt(p.principio, 60), detalhe: txt(p.detalhe, 400) })),
      acoes: (Array.isArray(a.acoes) ? a.acoes : []).slice(0, 3).map((x) => ({
        tipo: ['comentar', 'vencimento', 'atribuir', 'status', 'dividir', 'editar'].includes(x.tipo) ? x.tipo : 'comentar',
        rotulo: txt(x.rotulo, 80), texto: txt(x.texto, 1500),
      })),
    };
  });
  const out = { ok: true, geral: String(resultado.geral || ''), tickets, fonte: rubrica.fonte, url: rubrica.url, dias, projeto, quando: new Date().toISOString() };
  return json(res, 200, cacheSetTTL(ck, out, 10));
}

// ---------------------------------------------------------------------------
// 🕵️ AUDITORIA DE TICKETS — validações diárias de apontamentos (TI-04-014).
// A pessoa é escolhida no painel; o servidor junta os apontamentos do período
// (Clockwork, de TODO o time — para saber quem mais apontou nas reuniões), os
// detalhes dos tickets envolvidos (Jira) e o planejamento de alocação (config
// compartilhada), e a IA aplica as REGRAS LIDAS AO VIVO da página TI-04-014
// (env AUDITORIA_URL; fallback: snapshot local das regras).
// ---------------------------------------------------------------------------
const AUDITORIA_URL_PADRAO = 'https://dexterityitsolutions.notion.site/TI-04-014-Valida-es-di-rias-de-apontamentos-398c69371e1780bd9688e046fbd53e61';
const MAX_TICKETS_AUD = 45;
const RUBRICA_AUD_LOCAL = [
  'TI-04-014 — Validações diárias de apontamentos (Dexterity):',
  'REUNIÕES:',
  'R1. Toda reunião deve ter sido criada pela AUTOMAÇÃO. Reunião criada manualmente por uma pessoa indica erro do robô — abrir ticket no Jira avisando do erro.',
  'R2. Reunião deve ter MAIS DE UMA pessoa apontando horas. Se só uma pessoa apontou, é preciso convidar os demais participantes para apontar.',
  'R3. Reunião de CLIENTE deve estar no projeto do cliente. Reunião de cliente ativo parada em projeto administrativo/interno está no projeto errado (reclassificar).',
  'R4. Reunião com horas apontadas e vencimento atrasado há mais de 1 dia deve estar CONCLUÍDA. Reunião atrasada e ainda aberta precisa ser concluída.',
  'R5. Não pode existir ticket de outro tipo (Tarefa etc.) que na prática é uma reunião (resumo/descrição de reunião) — deve ser do tipo Reunião.',
  'APONTAMENTOS DA PESSOA:',
  'A1. O número de apontamentos por dia trabalhado deve ser MAIOR que 1. Um único apontamento no dia indica que a pessoa lançou o dia inteiro numa só tarefa — incorreto (detalhar o dia por atividade).',
  'A2. Os apontamentos devem estar nos projetos corretos, coerentes com a alocação planejada da pessoa.',
  'PLANEJADO × REALIZADO:',
  'P1. As horas realizadas por projeto devem seguir o planejamento de alocação da pessoa no período; desvios grandes (projeto planejado sem horas, ou muitas horas fora do planejado) devem ser apontados.',
].join('\n');

async function rubricaAuditoria() {
  const ck = 'auditoria:rubrica';
  const c = cacheGet(ck);
  if (c) return c;
  const url = (process.env.AUDITORIA_URL || AUDITORIA_URL_PADRAO).trim();
  const t = await paginaNotionTexto(url, 700);
  if (t) return cacheSetTTL(ck, { texto: t, fonte: 'notion', url }, 30);
  return cacheSetTTL(ck, { texto: RUBRICA_AUD_LOCAL, fonte: 'local', url }, 30);
}

const SCHEMA_AUD = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo', 'corretos', 'incorretos', 'acoes'],
  properties: {
    resumo: { type: 'string' },
    corretos: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['titulo', 'detalhe'], properties: { titulo: { type: 'string' }, detalhe: { type: 'string' } } },
    },
    incorretos: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['regra', 'detalhe', 'gravidade', 'tickets'],
        properties: {
          regra: { type: 'string' }, detalhe: { type: 'string' },
          gravidade: { type: 'string', enum: ['atencao', 'critico'] },
          tickets: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    acoes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['tipo', 'rotulo'],
        properties: {
          tipo: { type: 'string', enum: ['comentar', 'vencimento', 'status', 'convidar', 'reclassificar', 'criar', 'outro'] },
          rotulo: { type: 'string' }, texto: { type: 'string' }, ticket: { type: 'string' },
        },
      },
    },
  },
};

const SISTEMA_AUD = [
  'Você é um auditor de apontamentos de horas da Dexterity IT. Recebe a RUBRICA (as',
  'validações diárias oficiais TI-04-014, texto extraído do Notion) e os DADOS de UMA',
  'pessoa num período: apontamentos por dia, reuniões em que ela apontou (participantes',
  'que apontaram, criador, projeto/categoria, status, vencimento e atraso), demais tickets',
  'apontados e o planejamento de alocação (planejado × realizado por projeto).',
  'Aplique CADA regra da rubrica aos dados, em português do Brasil.',
  '',
  'Regras:',
  '- Baseie-se EXCLUSIVAMENTE nos dados fornecidos; nunca invente tickets, números ou nomes.',
  '- "resumo": 2 a 4 frases com o balanço da pessoa no período (o que vai bem e o que precisa de ajuste).',
  '- "corretos": o que está EM CONFORMIDADE com a rubrica — título curto + detalhe factual com números.',
  '- "incorretos": cada não conformidade com a regra violada (nome curto da regra), o detalhe',
  '  COM NÚMEROS/DATAS, a gravidade ("critico" para violação clara/recorrente; "atencao" para',
  '  pontual ou dúvida) e as chaves dos tickets envolvidos (apenas chaves presentes nos dados).',
  '- "acoes": ações CONCRETAS para ajustar, uma por problema quando possível — tipo "comentar"',
  '  (avisar no ticket), "vencimento" (reprogramar), "status" (concluir/mover), "convidar" (chamar',
  '  os participantes para apontar na reunião), "reclassificar" (mover de projeto/tipo), "criar"',
  '  (abrir ticket novo, ex.: avisar erro da automação) ou "outro". Preencha "ticket" quando a',
  '  ação é sobre um ticket específico e "texto" com a mensagem/instrução sugerida, pronta para uso.',
  '- Sábados, domingos, os FERIADOS listados nos dados e os períodos de ausência informados NÃO contam como dia sem apontamento.',
  '- Se os dados não permitirem avaliar uma regra, simplesmente não a liste em "incorretos".',
].join('\n');

const spDiaAud = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d || new Date());
const somaDiasAud = (s, n) => { const t = new Date(`${s}T12:00:00-03:00`); t.setUTCDate(t.getUTCDate() + n); return spDiaAud(t); };

async function auditaApontamentos(res, b, apiKey) {
  const accountId = String(b.accountId || '').trim();
  if (!accountId || !/^[\w:-]{5,128}$/.test(accountId)) return json(res, 400, { erro: 'Escolha a pessoa a auditar (accountId inválido).' });
  const dias = Math.min(31, Math.max(1, Number(b.dias) || 7));
  const ck = `auditoria:${accountId}:${dias}`;
  const c = cacheGet(ck);
  if (c && !b.nocache) return json(res, 200, c);

  const ate = spDiaAud();
  const de = somaDiasAud(ate, -(dias - 1));
  const [rubrica, enr, cfg] = await Promise.all([
    rubricaAuditoria(),
    worklogsEnriquecidos(de, ate),
    configCompartilhada({ metaGlobalH: 8, metasPessoa: {}, ausencias: [], alocacoes: [] }),
  ]);

  const wl = enr.worklogs.filter((w) => w.a === accountId);
  const nome = txt(b.nome || (enr.pessoas[accountId] && enr.pessoas[accountId].nome) || accountId, 80);
  const ausencias = (cfg.ausencias || []).filter((x) => x && x.a === accountId && !(x.ate < de || x.de > ate))
    .map((x) => ({ de: x.de, ate: x.ate }));
  // Feriados nacionais dentro do período (não contam como dia sem apontamento).
  const feriados = [];
  for (let d = de, g = 0; d <= ate && g < 40; d = somaDiasAud(d, 1), g += 1) {
    if (feriadosBR(+d.slice(0, 4)).has(d)) feriados.push(d);
  }
  if (!wl.length) {
    // Ausência cadastrada no período explica a falta de horas — não é violação clara.
    const temAus = ausencias.length > 0;
    const ausTxt = ausencias.map((x) => `${x.de} → ${x.ate}`).join(', ');
    const out = {
      ok: true, pessoa: { id: accountId, nome }, de, ate, dias, fonte: rubrica.fonte, url: rubrica.url,
      resumo: `Sem apontamentos de ${nome} no período (${de} → ${ate}).${temAus ? ` Há ausência cadastrada (${ausTxt}), o que pode explicar.` : ''}`,
      corretos: [],
      incorretos: [{
        regra: 'Apontamentos diários',
        detalhe: `Nenhuma hora apontada entre ${de} e ${ate}.${temAus ? ` Ausência cadastrada: ${ausTxt}.` : ''}`,
        gravidade: temAus ? 'atencao' : 'critico', tickets: [],
      }],
      acoes: [{ tipo: 'outro', rotulo: 'Verificar com a pessoa e reforçar o apontamento diário', texto: `Nenhum apontamento de ${nome} entre ${de} e ${ate}. ${temAus ? `Há ausência cadastrada (${ausTxt}) — confirmar se cobre todo o período.` : 'Confirmar se houve férias/ausência; se não, reforçar o apontamento diário no Clockwork.'}`, ticket: '' }],
      stats: { horas: 0, apontamentos: 0, diasComApontamento: 0, reunioes: 0, tickets: 0 },
      quando: new Date().toISOString(),
    };
    return json(res, 200, cacheSetTTL(ck, out, 10));
  }

  const ehReuniao = (t) => /reuni/i.test(String(t || ''));

  // Por dia: nº de apontamentos, tickets distintos e horas (regra "mais de 1 por dia").
  const porDiaMap = {};
  wl.forEach((w) => {
    const d = String(w.d || '').slice(0, 10); if (!d) return;
    const r = porDiaMap[d] || (porDiaMap[d] = { d, apontamentos: 0, tickets: new Set(), horas: 0 });
    r.apontamentos += 1; if (w.k) r.tickets.add(w.k); r.horas += w.s;
  });
  const porDia = Object.values(porDiaMap).sort((a, b2) => (a.d < b2.d ? -1 : 1))
    .map((r) => ({ dia: r.d, apontamentos: r.apontamentos, ticketsDistintos: r.tickets.size, horas: +(r.horas / 3600).toFixed(1) }));

  // Reuniões em que a pessoa apontou + quem MAIS apontou nelas (todo o time, no período).
  const chavesPessoa = [...new Set(wl.map((w) => w.k).filter(Boolean))];
  const reunioesKeys = new Set(wl.filter((w) => ehReuniao(w.t)).map((w) => w.k).filter(Boolean));
  const partPorK = {}; const totalPorK = {};
  enr.worklogs.forEach((w) => {
    if (!w.k || !reunioesKeys.has(w.k)) return;
    (partPorK[w.k] = partPorK[w.k] || new Set()).add(w.a);
    totalPorK[w.k] = (totalPorK[w.k] || 0) + w.s;
  });
  const horasDe = {}; wl.forEach((w) => { if (w.k) horasDe[w.k] = (horasDe[w.k] || 0) + w.s; });

  // Corte único e consistente em MAX_TICKETS_AUD: reuniões primeiro (são o foco das
  // regras), depois os demais por horas — detalhes do Jira e payload usam o MESMO corte.
  const chaves = [...chavesPessoa]
    .sort((a, b2) => ((reunioesKeys.has(b2) ? 1 : 0) - (reunioesKeys.has(a) ? 1 : 0)) || ((horasDe[b2] || 0) - (horasDe[a] || 0)))
    .slice(0, MAX_TICKETS_AUD);
  const ticketsForaDoCorte = chavesPessoa.length - chaves.length;
  const detalhes = {};
  if (chaves.length) {
    const { issues } = await jiraSearchAll({
      jql: `key in (${chaves.join(',')})`,
      fields: ['summary', 'description', 'issuetype', 'status', 'duedate', 'resolutiondate', 'reporter', 'created', 'project', 'assignee'],
      pageSize: 100, maxPages: 1,
    });
    issues.forEach((it) => {
      const f = it.fields || {};
      detalhes[it.key] = {
        resumo: String(f.summary || '').slice(0, 200),
        descTrecho: adfTexto(f.description).replace(/\s+/g, ' ').trim().slice(0, 260),
        tipo: (f.issuetype && f.issuetype.name) || '',
        status: (f.status && f.status.name) || '',
        concluido: !!f.resolutiondate || String((f.status && f.status.statusCategory && f.status.statusCategory.key) || '') === 'done',
        vencimento: f.duedate || '',
        criadoPor: (f.reporter && f.reporter.displayName) || '',
        criadoEm: String(f.created || '').slice(0, 10),
        responsavel: (f.assignee && f.assignee.displayName) || '',
        projeto: (f.project && f.project.key) || '',
        projetoNome: (f.project && f.project.name) || '',
        categoria: (f.project && f.project.projectCategory && f.project.projectCategory.name) || 'Sem categoria',
      };
    });
  }

  const reunioes = chaves.filter((k) => reunioesKeys.has(k)).map((k) => {
    const dt = detalhes[k] || {};
    const atrasoDias = (dt.vencimento && dt.vencimento < ate)
      ? Math.round((new Date(ate) - new Date(dt.vencimento)) / 86400000) : 0;
    return {
      k, resumo: dt.resumo || enr.resumos[k] || '', projeto: dt.projeto || '', projetoNome: dt.projetoNome || '',
      categoria: dt.categoria || '', tipo: dt.tipo || 'Reunião', status: dt.status || '', concluida: !!dt.concluido,
      vencimento: dt.vencimento || '', atrasoDias, criadoPor: dt.criadoPor || '', criadoEm: dt.criadoEm || '',
      participantesQueApontaram: (partPorK[k] ? partPorK[k].size : 1),
      horasDaPessoa: +((horasDe[k] || 0) / 3600).toFixed(1),
      horasTotais: +(((totalPorK[k] || 0)) / 3600).toFixed(1),
    };
  });
  const tarefas = chaves.filter((k) => !reunioesKeys.has(k)).map((k) => {
    const dt = detalhes[k] || {};
    return {
      k, resumo: dt.resumo || enr.resumos[k] || '', projeto: dt.projeto || '', categoria: dt.categoria || '',
      tipo: dt.tipo || '', status: dt.status || '', concluida: !!dt.concluido, vencimento: dt.vencimento || '',
      descTrecho: dt.descTrecho || '', horasDaPessoa: +((horasDe[k] || 0) / 3600).toFixed(1),
    };
  });

  // Planejado × realizado por projeto (alocações da config compartilhada, pró-rata no
  // período). Espelha o painel: linhas só contam com inicio E fim válidos (AAAA-MM-DD),
  // e alocações legadas guardavam % (pct) em vez de hSemana — mesma migração do front.
  const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
  const overlapSemanas = (a) => {
    if (!RE_DATA.test(a.inicio || '') || !RE_DATA.test(a.fim || '')) return 0;
    const ini = a.inicio > de ? a.inicio : de;
    const fim = a.fim < ate ? a.fim : ate;
    if (ini > fim) return 0;
    return Math.max(0, (new Date(fim) - new Date(ini)) / 86400000 + 1) / 7;
  };
  const hSemanaDe = (a) => (a.hSemana != null ? (Number(a.hSemana) || 0)
    : (a.pct != null ? Math.round((Number(a.pct) || 0) / 100 * 40) : 0));
  const planejado = {};
  (cfg.alocacoes || []).filter((a) => a && a.accountId === accountId && a.projeto).forEach((a) => {
    const h = hSemanaDe(a) * overlapSemanas(a);
    if (h > 0) planejado[a.projeto] = +((planejado[a.projeto] || 0) + h).toFixed(1);
  });
  const realizadoSeg = {};
  wl.forEach((w) => { realizadoSeg[w.p] = (realizadoSeg[w.p] || 0) + w.s; });
  const realizado = {};
  Object.keys(realizadoSeg).forEach((p) => { realizado[p] = +(realizadoSeg[p] / 3600).toFixed(1); });

  const metaHDia = Math.max(0, Number((cfg.metasPessoa || {})[accountId] != null ? cfg.metasPessoa[accountId] : cfg.metaGlobalH) || 0);

  const payload = {
    pessoa: { id: accountId, nome },
    periodo: {
      de, ate, dias,
      observacao: 'sábados, domingos, os feriados listados e as ausências não contam como dia de trabalho'
        + (ticketsForaDoCorte > 0 ? `; ${ticketsForaDoCorte} ticket(s) com poucas horas ficaram fora da amostra` : ''),
    },
    metaHorasPorDiaUtil: metaHDia,
    feriados,
    ausencias,
    apontamentosPorDia: porDia,
    reunioes,
    tarefas,
    alocacao: { planejadoHorasPorProjeto: planejado, realizadoHorasPorProjeto: realizado },
  };
  const prompt = 'RUBRICA (validações diárias TI-04-014):\n\n' + rubrica.texto
    + '\n\n---\n\nDADOS DA PESSOA PARA AUDITAR (JSON):\n\n' + JSON.stringify(payload);
  const resultado = await chamaClaude(apiKey, null, { system: SISTEMA_AUD, schema: SCHEMA_AUD, prompt });

  const chavesOk = new Set(chavesPessoa);
  const TIPOS_ACAO = ['comentar', 'vencimento', 'status', 'convidar', 'reclassificar', 'criar', 'outro'];
  const out = {
    ok: true, pessoa: { id: accountId, nome }, de, ate, dias, fonte: rubrica.fonte, url: rubrica.url,
    resumo: txt(resultado.resumo, 1200),
    corretos: (Array.isArray(resultado.corretos) ? resultado.corretos : []).slice(0, 10)
      .map((x) => ({ titulo: txt(x.titulo, 90), detalhe: txt(x.detalhe, 400) })),
    incorretos: (Array.isArray(resultado.incorretos) ? resultado.incorretos : []).slice(0, 12)
      .map((x) => ({
        regra: txt(x.regra, 90), detalhe: txt(x.detalhe, 500),
        gravidade: x.gravidade === 'critico' ? 'critico' : 'atencao',
        tickets: (Array.isArray(x.tickets) ? x.tickets : []).map(String).filter((k) => chavesOk.has(k)).slice(0, 8),
      })),
    acoes: (Array.isArray(resultado.acoes) ? resultado.acoes : []).slice(0, 12)
      .map((x) => ({
        tipo: TIPOS_ACAO.includes(x.tipo) ? x.tipo : 'outro',
        rotulo: txt(x.rotulo, 90), texto: txt(x.texto, 1500),
        ticket: chavesOk.has(String(x.ticket || '')) ? String(x.ticket) : '',
      })),
    stats: {
      horas: +((wl.reduce((s, w) => s + w.s, 0)) / 3600).toFixed(1),
      apontamentos: wl.length, diasComApontamento: porDia.length,
      reunioes: reunioes.length, tickets: chavesPessoa.length,
    },
    quando: new Date().toISOString(),
  };
  return json(res, 200, cacheSetTTL(ck, out, 10));
}

// ---------------------------------------------------------------------------
// 📍 MEU DIA — timetracking assistido: a ponte (scripts/meudia-activitywatch.mjs)
// envia os BLOCOS de atividade do Mac (app + título de janela + duração) e a IA
// sugere, para cada bloco, ONDE apontar (ticket recente) ou ONDE criar o ticket
// (caminho da árvore). Os blocos ficam na tabela de config compartilhada, numa
// linha por pessoa (id = meudia_<accountId>), substituídos a cada envio.
// ---------------------------------------------------------------------------
const MAX_BLOCOS = 80;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

async function jiraMyself(email, token) {
  const base = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '') || 'https://dexterityit.atlassian.net';
  const r = await fetch(`${base}/rest/api/3/myself`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'), Accept: 'application/json' },
  });
  if (r.status === 401 || r.status === 403) return { ok: false, erro: 'Credenciais inválidas — confira o e-mail e o token.' };
  if (!r.ok) return { ok: false, erro: `Jira ${r.status}: ${(await r.text()).slice(0, 200)}` };
  const me = await r.json();
  return { ok: true, accountId: me.accountId || '', nome: me.displayName || '', email: me.emailAddress || '' };
}

function sbMeuDia() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

// POST ?acao=meudia-ingest { email, token, dia, blocos:[{inicio,fim,app,titulo,seg}] }
async function meuDiaIngest(res, b) {
  const s = sbMeuDia();
  if (!s) return json(res, 200, { ok: false, erro: 'O Meu dia exige a configuração compartilhada (Supabase).' });
  const email = String(b.email || '').trim();
  const token = String(b.token || '').trim();
  if (!email || !token) return json(res, 400, { ok: false, erro: 'Informe email e token de API do Jira (os mesmos do painel).' });
  const me = await jiraMyself(email, token);
  if (!me.ok) return json(res, 200, { ok: false, erro: me.erro });

  const dia = RE_DIA.test(String(b.dia || '')) ? String(b.dia) : '';
  if (!dia) return json(res, 400, { ok: false, erro: 'Dia inválido (use AAAA-MM-DD).' });
  const blocos = (Array.isArray(b.blocos) ? b.blocos : []).slice(0, MAX_BLOCOS).map((x) => ({
    inicio: txt(x && x.inicio, 5),          // HH:MM
    fim: txt(x && x.fim, 5),
    app: txt(x && x.app, 60),
    titulo: txt(x && x.titulo, 140),
    seg: Math.max(0, Math.min(24 * 3600, Math.round(Number(x && x.seg) || 0))),
  })).filter((x) => x.seg >= 60 && x.app);
  if (!blocos.length) return json(res, 400, { ok: false, erro: 'Nenhum bloco válido (mínimo 1 minuto, com o nome do app).' });

  const r = await fetch(`${s.base}/rest/v1/jirainsight_config`, {
    method: 'POST',
    headers: { ...s.headers, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: `meudia_${me.accountId}`, data: { dia, blocos, nome: me.nome, quando: new Date().toISOString() } }),
  });
  if (!(r.status >= 200 && r.status < 300)) {
    return json(res, 200, { ok: false, erro: `Supabase ${r.status}: ${(await r.text()).slice(0, 200)}` });
  }
  return json(res, 200, { ok: true, accountId: me.accountId, nome: me.nome, dia, blocos: blocos.length });
}

const SCHEMA_MEUDIA = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo', 'sugestoes'],
  properties: {
    resumo: { type: 'string' },
    sugestoes: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['periodo', 'atividade', 'acao', 'tempo', 'justificativa'],
        properties: {
          periodo: { type: 'string' },
          atividade: { type: 'string' },
          acao: { type: 'string', enum: ['apontar', 'criar', 'ignorar'] },
          ticket: { type: 'string' },
          projeto: { type: 'string' },
          caminhoArvore: { type: 'string' },
          tempo: { type: 'string' },
          resumoTicket: { type: 'string' },
          justificativa: { type: 'string' },
        },
      },
    },
  },
};

const SISTEMA_MEUDIA = [
  'Você é um assistente de timetracking da Dexterity IT. Recebe os BLOCOS DE ATIVIDADE',
  'do computador de UMA pessoa num dia (app usado + título da janela + duração) e o',
  'CONTEXTO do Jira dela: projetos disponíveis (com categorias), os tickets em que ela',
  'apontou recentemente e as alocações planejadas. Em português do Brasil, sugira o',
  'que fazer com cada período de trabalho.',
  '',
  'Regras:',
  '- Agrupe blocos consecutivos da MESMA atividade numa sugestão só; ignore períodos',
  '  claramente pessoais/ociosos (acao "ignorar", sem poluir).',
  '- "apontar": quando a atividade combina com um TICKET RECENTE do contexto — preencha',
  '  "ticket" com a chave EXATA do contexto (nunca invente chaves).',
  '- "criar": quando não há ticket que sirva — preencha "projeto" (chave do catálogo que',
  '  melhor combina), "caminhoArvore" (ex.: "AMS direto", "AMS por parceria", "SAP —',
  '  épico de Gestão", "Interno — Melhorias", "Administrativa (rotina)", "Avulsa —',
  '  departamento X") e "resumoTicket" (título pronto, objetivo claro).',
  '- "tempo": duração arredondada para 15 min (formatos 30m, 1h, 1h30). "periodo": ex. "09:00–10:30".',
  '- Reuniões (Teams/Zoom/Meet ou títulos de reunião) normalmente vão em tickets de',
  '  reunião; trabalho em cliente AMS vai no projeto AMS do cliente.',
  '- "resumo": 2 a 3 frases do dia (horas cobertas, o que já tem ticket, o que falta).',
  '- Baseie-se SOMENTE nos dados fornecidos; não invente tickets, projetos ou horários.',
].join('\n');

// POST ?acao=meudia { accountId, contexto:{projetos,recentes,alocacoes} } → blocos + sugestões da IA.
async function meuDiaAnalisa(res, b, apiKey) {
  const s = sbMeuDia();
  if (!s) return json(res, 200, { ok: false, erro: 'O Meu dia exige a configuração compartilhada (Supabase).' });
  const accountId = String(b.accountId || '').trim();
  if (!accountId || !/^[\w:-]{5,128}$/.test(accountId)) return json(res, 400, { ok: false, erro: 'accountId inválido.' });

  const r = await fetch(`${s.base}/rest/v1/jirainsight_config?id=eq.${encodeURIComponent(`meudia_${accountId}`)}&select=data`, { headers: s.headers });
  const rows = r.ok ? await r.json() : [];
  const reg = (rows && rows[0] && rows[0].data) || null;
  if (!reg || !Array.isArray(reg.blocos) || !reg.blocos.length) {
    return json(res, 200, { ok: true, semDados: true, erro: '', dia: '', blocos: [], resumo: '', sugestoes: [] });
  }

  const ck = `meudia:${accountId}:${reg.quando || reg.dia}`;
  const c = cacheGet(ck);
  if (c && !b.nocache) return json(res, 200, c);

  const ctx = (b.contexto && typeof b.contexto === 'object') ? b.contexto : {};
  const projetos = (Array.isArray(ctx.projetos) ? ctx.projetos : []).slice(0, 120)
    .map((p) => ({ key: txt(p.key, 20), nome: txt(p.nome, 80), categoria: txt(p.categoria, 60) })).filter((p) => p.key);
  const recentes = (Array.isArray(ctx.recentes) ? ctx.recentes : []).slice(0, 30)
    .map((t) => ({ k: txt(t.k, 20), resumo: txt(t.resumo, 140), projeto: txt(t.projeto || t.p, 20) })).filter((t) => t.k);
  const alocacoes = (Array.isArray(ctx.alocacoes) ? ctx.alocacoes : []).slice(0, 20)
    .map((a) => ({ projeto: txt(a.projeto, 20), horasSemana: num(a.horasSemana || a.hSemana) })).filter((a) => a.projeto);

  const payload = {
    dia: reg.dia,
    blocos: reg.blocos.slice(0, MAX_BLOCOS),
    contexto: { projetos, ticketsRecentes: recentes, alocacoesPlanejadas: alocacoes },
  };
  const prompt = 'DIA DE TRABALHO PARA CLASSIFICAR (JSON):\n\n' + JSON.stringify(payload);
  const resultado = await chamaClaude(apiKey, null, { system: SISTEMA_MEUDIA, schema: SCHEMA_MEUDIA, prompt });

  const chavesRec = new Set(recentes.map((t) => t.k));
  const projOk = new Set(projetos.map((p) => p.key));
  const out = {
    ok: true, dia: reg.dia, quando: reg.quando || '', nome: reg.nome || '',
    blocos: reg.blocos,
    resumo: txt(resultado.resumo, 1000),
    sugestoes: (Array.isArray(resultado.sugestoes) ? resultado.sugestoes : []).slice(0, 30).map((x) => ({
      periodo: txt(x.periodo, 30), atividade: txt(x.atividade, 160),
      acao: ['apontar', 'criar', 'ignorar'].includes(x.acao) ? x.acao : 'ignorar',
      ticket: chavesRec.has(String(x.ticket || '')) ? String(x.ticket) : '',
      projeto: projOk.has(String(x.projeto || '')) ? String(x.projeto) : '',
      caminhoArvore: txt(x.caminhoArvore, 60), tempo: txt(x.tempo, 12),
      resumoTicket: txt(x.resumoTicket, 200), justificativa: txt(x.justificativa, 300),
    })),
  };
  // "apontar" sem ticket válido do contexto vira "criar" (a IA citou chave desconhecida).
  out.sugestoes.forEach((x) => { if (x.acao === 'apontar' && !x.ticket) x.acao = 'criar'; });
  return json(res, 200, cacheSetTTL(ck, out, 10));
}

// Diagnóstico (SOMENTE LEITURA) da integração com o Odoo. GET /api/resumo?acao=odoo-diag
// Mostra, passo a passo, o que a CONTA DE SERVIÇO enxerga: variáveis presentes,
// versão do servidor, autenticação (uid) e se o modelo hr.leave.type resolve na base
// autenticada (com a lista de tipos + ids). Não escreve nada e NUNCA devolve a API key.
async function diagOdoo(res) {
  const url = env('ODOO_URL'), db = env('ODOO_DB'), login = env('ODOO_LOGIN'), key = env('ODOO_API_KEY');
  const mascaraLogin = (s) => { if (!s) return ''; const i = s.indexOf('@'); return i > 0 ? s.slice(0, 2) + '***' + s.slice(i) : s.slice(0, 2) + '***'; };
  const out = {
    ok: false,
    envs: {
      ODOO_URL: url || '(vazio)',
      ODOO_DB: db || '(vazio)',
      ODOO_LOGIN: login ? mascaraLogin(login) : '(vazio)',
      ODOO_API_KEY: key ? 'definida' : '(vazia)',
      ODOO_FOLGA_TIPO_ID: env('ODOO_FOLGA_TIPO_ID') || '(vazio)',
    },
    passos: [],
  };
  const passo = (nome, okp, info) => out.passos.push({ passo: nome, ok: okp, info: info == null ? '' : info });

  if (!url || !db || !login || !key) {
    out.dica = 'Defina ODOO_URL, ODOO_DB, ODOO_LOGIN e ODOO_API_KEY na Vercel e faça um Redeploy.';
    return json(res, 200, out);
  }

  // 1) Versão do servidor (não exige login) — confirma que a URL responde.
  try { const v = await odoo(url, 'common', 'version', []); passo('versao', true, (v && (v.server_version || v.server_serie)) || v); }
  catch (e) { passo('versao', false, String(e.message || e)); }

  // 2) Autenticação da conta de serviço → uid.
  let uid = 0;
  try { uid = await odoo(url, 'common', 'authenticate', [db, login, key, {}]); passo('autenticar', !!uid, uid ? ('uid ' + uid) : 'db/login/api key recusados'); }
  catch (e) { passo('autenticar', false, String(e.message || e)); }
  if (!uid) {
    out.dica = 'Autenticação falhou. Na Odoo Online o ODOO_DB é o subdomínio (ex.: dexterityit). Confira também ODOO_LOGIN e ODOO_API_KEY (e refaça o Redeploy).';
    return json(res, 200, out);
  }
  const exec = (model, method, args, kwargs = {}) => odoo(url, 'object', 'execute_kw', [db, uid, key, model, method, args, kwargs]);

  // 3) O modelo hr.leave.type resolve NESSA base? (é o ponto que estava falhando)
  try {
    const tipos = await exec('hr.leave.type', 'search_read', [[]], { fields: ['id', 'name'], limit: 50 });
    out.tiposAusencia = (tipos || []).map((t) => ({ id: t.id, nome: t.name }));
    passo('hr.leave.type', true, (tipos ? tipos.length : 0) + ' tipo(s) de ausência');
    out.ok = true;
    out.dica = out.tiposAusencia.length
      ? 'Tudo certo no Odoo. Copie um dos "id" acima para ODOO_FOLGA_TIPO_ID (ou use o nome exato) na Vercel e faça Redeploy.'
      : 'Time Off instalado, mas sem tipos cadastrados. Crie um em Time Off → Configuração → Tipos de Ausência.';
  } catch (e) {
    const msg = String(e.message || e);
    passo('hr.leave.type', false, msg);
    out.dica = /doesn't exist|does not exist|não existe|invalid model/i.test(msg)
      ? 'A base autenticada NÃO tem o modelo hr.leave.type: ou o app Time Off não está instalado nessa base, ou o ODOO_DB aponta para uma base diferente da que você abre no navegador.'
      : /access|allowed|permiss/i.test(msg)
        ? 'A conta de serviço (ODOO_LOGIN) não tem permissão de Time Off. Dê o grupo Time Off (Utilizador/Officer) a ela em Definições → Utilizadores.'
        : 'Falha ao ler hr.leave.type — veja a mensagem crua em "info".';
  }
  return json(res, 200, out);
}

// ---------------------------------------------------------------------------
// 🤖 POST /api/resumo?acao=planrel — análise por IA do PLANEJADO × REALIZADO
// (Relatórios do planejamento). O front manda o recorte JÁ AGREGADO (totais,
// status dos planos, pessoas, projetos e semanas do filtro atual); o modelo
// devolve resumo, destaques, análise por pessoa e recomendações. Cache por
// hash do payload (mesmo recorte não paga a IA de novo); body.nocache regenera.
// ---------------------------------------------------------------------------
const SCHEMA_PLANREL = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo', 'destaques', 'pessoas', 'recomendacoes'],
  properties: {
    resumo: { type: 'string' },
    destaques: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titulo', 'texto', 'sinal'],
        properties: {
          titulo: { type: 'string' },
          texto: { type: 'string' },
          sinal: { type: 'string', enum: ['positivo', 'neutro', 'atencao'] },
        },
      },
    },
    pessoas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nome', 'analise', 'sinal'],
        properties: {
          nome: { type: 'string' },
          analise: { type: 'string' },
          sinal: { type: 'string', enum: ['positivo', 'neutro', 'atencao'] },
        },
      },
    },
    recomendacoes: { type: 'array', items: { type: 'string' } },
  },
};
const SISTEMA_PLANREL = [
  'Você é um analista de planejamento de um time de TI. Recebe o recorte JÁ AGREGADO',
  'de um relatório de PLANEJADO × REALIZADO (planos semanais das pessoas × horas',
  'apontadas no Clockwork) e escreve uma análise clara em português do Brasil.',
  '',
  'Regras:',
  '- Baseie-se EXCLUSIVAMENTE nos números fornecidos. Nunca invente dados, nomes ou fatos.',
  '- "resumo": 2 a 4 frases sobre o recorte — execução geral (realizado ÷ planejado),',
  '  horas realizadas fora do plano (realizadoNaoPlanejadoH), horas planejadas que não',
  '  aconteceram (planejadoNaoRealizadoH) e a situação dos planos (statusPlanos).',
  '- "destaques": até 4 achados que MERECEM atenção ou reconhecimento — ex.: projeto com',
  '  desvio grande, semana fora da curva, muita hora não planejada, planos devolvidos/parados.',
  '  Cada um com título curto, 1-2 frases de texto e sinal (positivo/neutro/atencao).',
  '- "pessoas": 1-2 frases por pessoa da lista (aderência ao próprio plano, horas fora do',
  '  plano, status do plano). Sinal: positivo (execução ~80-120% com plano em dia),',
  '  neutro (parcial) ou atencao (sem plano, execução muito baixa/alta, plano devolvido).',
  '  Se a lista de pessoas estiver vazia, devolva o array vazio.',
  '- "recomendacoes": 3 a 5 ações práticas e específicas para a próxima semana (ex.: rever',
  '  o plano de X, investigar as horas sem plano no projeto Y, aprovar planos pendentes).',
  '- Tom construtivo e factual; nada de juízo pessoal. Diferenças de até ±10% são ruído,',
  '  não desvio. Não use markdown; texto corrido. Horas em formato 12h30 quando natural.',
].join('\n');

async function analisaPlanRel(res, b, apiKey) {
  const payload = {
    periodo: { de: txt(b.periodo && b.periodo.de, 10), ate: txt(b.periodo && b.periodo.ate, 10), semanas: num(b.periodo && b.periodo.semanas) },
    audiencia: txt(b.audiencia, 10),
    filtros: {
      usuario: txt(b.filtros && b.filtros.usuario, 80),
      projeto: txt(b.filtros && b.filtros.projeto, 120),
      status: txt(b.filtros && b.filtros.status, 20),
    },
    totais: {
      planejadoH: num(b.totais && b.totais.planejadoH),
      realizadoH: num(b.totais && b.totais.realizadoH),
      execucaoPct: b.totais && b.totais.execucaoPct == null ? null : num(b.totais && b.totais.execucaoPct),
      realizadoNaoPlanejadoH: num(b.totais && b.totais.realizadoNaoPlanejadoH),
      planejadoNaoRealizadoH: num(b.totais && b.totais.planejadoNaoRealizadoH),
    },
    statusPlanos: {
      elaboracao: num(b.statusPlanos && b.statusPlanos.elaboracao),
      enviado: num(b.statusPlanos && b.statusPlanos.enviado),
      aprovado: num(b.statusPlanos && b.statusPlanos.aprovado),
      devolvido: num(b.statusPlanos && b.statusPlanos.devolvido),
    },
    pessoas: (Array.isArray(b.pessoas) ? b.pessoas : []).slice(0, MAX_PESSOAS)
      .map((p) => ({ nome: txt(p.nome, 80), plan: num(p.plan), real: num(p.real), status: txt(p.status, 120) }))
      .filter((p) => p.nome),
    projetos: (Array.isArray(b.projetos) ? b.projetos : []).slice(0, 20)
      .map((p) => ({ projeto: txt(p.projeto, 120), plan: num(p.plan), real: num(p.real) }))
      .filter((p) => p.projeto),
    semanas: (Array.isArray(b.semanas) ? b.semanas : []).slice(0, 54)
      .map((s) => ({ semana: txt(s.semana, 12), plan: num(s.plan), real: num(s.real) })),
  };
  if (!payload.totais.planejadoH && !payload.totais.realizadoH) {
    return json(res, 200, { ok: false, erro: 'Sem horas no recorte — ajuste o período/filtros antes de analisar.' });
  }
  // Hash simples (djb2) do payload sanitizado: mesmo recorte reaproveita a análise.
  const s = JSON.stringify(payload);
  let h = 5381; for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  const ck = `iaplanrel:${h.toString(36)}:${s.length}`;
  if (!b.nocache) {
    const c = cacheGet(ck);
    if (c) return json(res, 200, { ...c, cache: true });
  }
  const r = await chamaClaude(apiKey, payload, { system: SISTEMA_PLANREL, schema: SCHEMA_PLANREL });
  const out = {
    ok: true,
    analise: {
      resumo: String(r.resumo || ''),
      destaques: (Array.isArray(r.destaques) ? r.destaques : []).slice(0, 6).map((d) => ({
        titulo: String(d.titulo || ''), texto: String(d.texto || ''),
        sinal: ['positivo', 'neutro', 'atencao'].includes(d.sinal) ? d.sinal : 'neutro',
      })),
      pessoas: (Array.isArray(r.pessoas) ? r.pessoas : []).slice(0, MAX_PESSOAS).map((p) => ({
        nome: String(p.nome || ''), analise: String(p.analise || ''),
        sinal: ['positivo', 'neutro', 'atencao'].includes(p.sinal) ? p.sinal : 'neutro',
      })),
      recomendacoes: (Array.isArray(r.recomendacoes) ? r.recomendacoes : []).slice(0, 6).map((x) => String(x || '')),
    },
  };
  return json(res, 200, cacheSetTTL(ck, out, 60));
}

// ---------------------------------------------------------------------------
// ⏳ POST /api/resumo?acao=meutempo — "Como estou gastando meu tempo?": análise
// por IA do histórico de apontamentos de UMA pessoa no período. O front manda o
// recorte JÁ AGREGADO (horas por tipo/projeto/categoria/épico, hora do dia, dia da
// semana, tamanho dos apontamentos, troca de contexto, top tickets, colaboração,
// estatísticas e AMOSTRAS dos comentários dos apontamentos, e o score de qualidade
// dos dados calculado no painel). O modelo devolve: resumo, como funciona o dia,
// onde vai o tempo, colaboração, avaliação da qualidade dos dados e recomendações.
// Cache por hash do payload (mesmo recorte não paga a IA de novo); body.nocache regenera.
// ---------------------------------------------------------------------------
const SCHEMA_MEUTEMPO = {
  type: 'object',
  additionalProperties: false,
  required: ['resumo', 'sinal', 'rotina', 'tempo', 'colaboracao', 'qualidade', 'recomendacoes'],
  properties: {
    resumo: { type: 'string' },
    sinal: { type: 'string', enum: ['positivo', 'neutro', 'atencao'] },
    rotina: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['titulo', 'texto'], properties: { titulo: { type: 'string' }, texto: { type: 'string' } } } },
    tempo: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['titulo', 'texto', 'sinal'], properties: { titulo: { type: 'string' }, texto: { type: 'string' }, sinal: { type: 'string', enum: ['positivo', 'neutro', 'atencao'] } } } },
    colaboracao: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['titulo', 'texto'], properties: { titulo: { type: 'string' }, texto: { type: 'string' } } } },
    qualidade: {
      type: 'object', additionalProperties: false, required: ['nota', 'avaliacao', 'problemas', 'recomendacoes'],
      properties: { nota: { type: 'number' }, avaliacao: { type: 'string' }, problemas: { type: 'array', items: { type: 'string' } }, recomendacoes: { type: 'array', items: { type: 'string' } } },
    },
    recomendacoes: { type: 'array', items: { type: 'string' } },
  },
};
const SISTEMA_MEUTEMPO = [
  'Você é um analista de produtividade e coach de gestão do tempo de consultores de TI.',
  'Recebe o histórico de apontamentos de horas (Clockwork/Jira) de UMA pessoa em um',
  'período, JÁ AGREGADO pelo painel, mais amostras dos comentários que ela escreveu nos',
  'apontamentos e estatísticas sobre a qualidade desses registros. Escreva em português',
  'do Brasil, na segunda pessoa ("você"), como quem devolve um espelho honesto e útil.',
  '',
  'Regras:',
  '- Baseie-se EXCLUSIVAMENTE nos dados fornecidos. Nunca invente números, tickets, nomes ou fatos.',
  '- "resumo": 3 a 5 frases — o retrato geral: quantas horas, em quantos dias, onde a maior',
  '  parte do tempo foi, e a característica mais marcante do período.',
  '- "rotina" (2 a 4 itens): COMO O DIA FUNCIONA — em que horas o trabalho se concentra',
  '  (use porHoraDoDia; se "horarioDisponivel" for false, diga que o horário não é registrado',
  '  e não conclua nada sobre horas do dia), quais dias da semana pesam mais, quantas',
  '  tarefas/projetos por dia (troca de contexto), tamanho típico dos apontamentos (blocos',
  '  longos × muitos pequenos) e o que isso sugere sobre foco e fragmentação.',
  '- "tempo" (3 a 5 itens, cada um com sinal): ONDE O TEMPO VAI — por tipo de ticket, projeto/',
  '  categoria, faturável × não faturável, épicos, tickets que mais consumiram e o que os',
  '  comentários revelam sobre a natureza do trabalho (reunião, desenvolvimento, suporte…).',
  '  Sinal "atencao" quando algo merece olhar (ex.: muito tempo em reunião/não faturável,',
  '  um ticket genérico absorvendo horas, fragmentação alta); "positivo" para bons padrões.',
  '- "colaboracao" (1 a 3 itens): com quem a pessoa divide tickets, quais tickets andam juntos',
  '  no mesmo dia (coocorrência) e o que isso indica (pares de trabalho, dependências).',
  '- "qualidade": avalie se os DADOS permitem uma boa análise. Considere: % de apontamentos',
  '  com comentário, riqueza e repetição dos comentários, % das horas com épico, tickets',
  '  genéricos ("Reunião", "Diversos"…), apontamentos de 8h em bloco único, horário não',
  '  registrado. Dê uma "nota" de 0 a 100 (pode partir do score do painel, ajustando pelo',
  '  que as amostras mostram), uma "avaliacao" de 2 a 3 frases, "problemas" (até 5, concretos,',
  '  citando o número que os sustenta) e "recomendacoes" (até 5, práticas: como escrever o',
  '  comentário, como quebrar o apontamento, que campo preencher).',
  '- "recomendacoes" (3 a 5): o que a pessoa pode mudar na semana que vem para usar melhor o',
  '  tempo — concretas e ligadas aos dados (ex.: agrupar reuniões, reservar blocos de foco,',
  '  reduzir tickets simultâneos por dia, separar gestão de execução).',
  '- "sinal" geral: "positivo" (tempo bem distribuído e bem registrado), "neutro" ou',
  '  "atencao" (padrões preocupantes ou dados fracos demais para concluir).',
  '- Tom construtivo, direto e sem julgamento moral. Sem markdown; texto corrido em cada campo.',
].join('\n');

async function analisaMeuTempo(res, b, apiKey) {
  const arr = (v, n) => (Array.isArray(v) ? v : []).slice(0, n);
  const item = (o, campos) => { const out = {}; campos.forEach(([k, tipo, max]) => { out[k] = tipo === 'n' ? num(o && o[k]) : txt(o && o[k], max || 80); }); return out; };
  const totais = b.totais && typeof b.totais === 'object' ? b.totais : {};
  const payload = {
    pessoa: txt(b.pessoa && b.pessoa.nome, 80),
    periodo: { de: txt(b.periodo && b.periodo.de, 10), ate: txt(b.periodo && b.periodo.ate, 10), diasUteis: num(b.periodo && b.periodo.diasUteis) },
    totais: {
      horas: num(totais.horas), apontamentos: num(totais.apontamentos), diasComApontamento: num(totais.diasComApontamento),
      mediaHorasPorDia: num(totais.mediaHorasPorDia), faturavelPct: num(totais.faturavelPct), tickets: num(totais.tickets),
      projetos: num(totais.projetos), mediaHorasPorApontamento: num(totais.mediaHorasPorApontamento), horarioDisponivel: !!totais.horarioDisponivel,
      horasEmFimDeSemana: num(totais.horasEmFimDeSemana), horasSemEpicoPct: num(totais.horasSemEpicoPct),
    },
    porTipo: arr(b.porTipo, 15).map((x) => item(x, [['nome', 't', 60], ['horas', 'n'], ['pct', 'n']])),
    porProjeto: arr(b.porProjeto, 15).map((x) => item(x, [['nome', 't', 80], ['categoria', 't', 60], ['horas', 'n'], ['pct', 'n']])),
    porCategoria: arr(b.porCategoria, 12).map((x) => item(x, [['nome', 't', 60], ['horas', 'n'], ['pct', 'n']])),
    porEpico: arr(b.porEpico, 12).map((x) => item(x, [['nome', 't', 100], ['horas', 'n'], ['pct', 'n']])),
    porHoraDoDia: arr(b.porHoraDoDia, 24).map((x) => item(x, [['hora', 'n'], ['horas', 'n']])),
    porDiaSemana: arr(b.porDiaSemana, 7).map((x) => item(x, [['dia', 't', 12], ['horas', 'n']])),
    tamanhos: arr(b.tamanhos, 8).map((x) => item(x, [['faixa', 't', 20], ['n', 'n'], ['horas', 'n']])),
    contexto: {
      ticketsPorDiaMedia: num(b.contexto && b.contexto.ticketsPorDiaMedia), ticketsPorDiaMax: num(b.contexto && b.contexto.ticketsPorDiaMax),
      projetosPorDiaMedia: num(b.contexto && b.contexto.projetosPorDiaMedia), diasFragmentados: num(b.contexto && b.contexto.diasFragmentados),
      inicioMedio: txt(b.contexto && b.contexto.inicioMedio, 5), fimMedio: txt(b.contexto && b.contexto.fimMedio, 5),
    },
    topTickets: arr(b.topTickets, 20).map((x) => item(x, [['k', 't', 20], ['resumo', 't', 120], ['tipo', 't', 40], ['projeto', 't', 40], ['horas', 'n'], ['n', 'n'], ['outrosHoras', 'n']])),
    colaboradores: arr(b.colaboradores, 12).map((x) => item(x, [['nome', 't', 60], ['horasNosMeusTickets', 'n'], ['tickets', 'n']])),
    coocorrencia: arr(b.coocorrencia, 10).map((x) => item(x, [['a', 't', 20], ['b', 't', 20], ['dias', 'n']])),
    comentarios: {
      com: num(b.comentarios && b.comentarios.com), sem: num(b.comentarios && b.comentarios.sem), pct: num(b.comentarios && b.comentarios.pct),
      mediaChars: num(b.comentarios && b.comentarios.mediaChars), genericos: num(b.comentarios && b.comentarios.genericos), repetidos: num(b.comentarios && b.comentarios.repetidos),
      classes: arr(b.comentarios && b.comentarios.classes, 10).map((x) => item(x, [['nome', 't', 40], ['horas', 'n'], ['pct', 'n']])),
      amostras: arr(b.comentarios && b.comentarios.amostras, 60).map((x) => item(x, [['k', 't', 20], ['tipo', 't', 40], ['h', 'n'], ['texto', 't', 200]])),
    },
    qualidade: { nota: num(b.qualidade && b.qualidade.nota), problemas: arr(b.qualidade && b.qualidade.problemas, 8).map((x) => txt(x, 160)) },
  };
  if (!payload.totais.horas) return json(res, 200, { ok: false, erro: 'Sem horas apontadas no período — amplie o intervalo antes de analisar.' });
  const s = JSON.stringify(payload);
  let h = 5381; for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  const ck = `iameutempo:${h.toString(36)}:${s.length}`;
  if (!b.nocache) { const c = cacheGet(ck); if (c) return json(res, 200, { ...c, cache: true }); }
  const r = await chamaClaude(apiKey, payload, { system: SISTEMA_MEUTEMPO, schema: SCHEMA_MEUTEMPO });
  const sinal = (v) => (['positivo', 'neutro', 'atencao'].includes(v) ? v : 'neutro');
  const lista = (v, n, comSinal) => (Array.isArray(v) ? v : []).slice(0, n).map((d) => ({ titulo: String(d.titulo || ''), texto: String(d.texto || ''), ...(comSinal ? { sinal: sinal(d.sinal) } : {}) }));
  const out = {
    ok: true,
    analise: {
      resumo: String(r.resumo || ''), sinal: sinal(r.sinal),
      rotina: lista(r.rotina, 5), tempo: lista(r.tempo, 6, true), colaboracao: lista(r.colaboracao, 4),
      qualidade: {
        nota: Math.max(0, Math.min(100, Math.round(num(r.qualidade && r.qualidade.nota)))),
        avaliacao: String((r.qualidade && r.qualidade.avaliacao) || ''),
        problemas: arr(r.qualidade && r.qualidade.problemas, 6).map((x) => String(x || '')),
        recomendacoes: arr(r.qualidade && r.qualidade.recomendacoes, 6).map((x) => String(x || '')),
      },
      recomendacoes: arr(r.recomendacoes, 6).map((x) => String(x || '')),
    },
  };
  return json(res, 200, cacheSetTTL(ck, out, 60));
}

export default async function handler(req, res) {
  try {
    // Sincronização de folgas aprovadas (Odoo → ticket no Jira + worklog). Aceita GET
    // (cron do GitHub Actions, protegido por CRON_SECRET) — tratada antes do guard de POST.
    if (String((req.query && req.query.acao) || '').trim() === 'folga-sync') return await sincronizaFolgas(req, res);

    // Diagnóstico (somente leitura) da integração com o Odoo. GET, sem corpo.
    if (String((req.query && req.query.acao) || '').trim() === 'odoo-diag') return await diagOdoo(res);

    if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
    const b = await lerBody(req);

    // Solicitação de folga (compensação de horas extras) — Odoo. Mesma rota por
    // causa do limite de 12 funções; selecionada por ?acao=folga (ou body.acao).
    const acao = String((req.query && req.query.acao) || b.acao || '').trim();
    if (acao === 'folga') return await criaFolga(res, b);

    // 💹 Rentabilidade → cotação no Odoo (Vendas) com um item por período de faturamento;
    // ← leitura do que já foi faturado/pago na ordem (sincronização).
    if (acao === 'odoo-venda') return await criaCotacaoOdoo(res, b);
    if (acao === 'odoo-venda-status') return await statusVendaOdoo(res, b);
    // 🤝 Contrato de parceria ↔ Odoo: catálogo (leitura), ordem do contrato (criar/comparar/aplicar) e cancelamento.
    if (acao === 'odoo-catalogo') return await catalogoOdoo(res, b);
    if (acao === 'odoo-contrato') return await sincronizaContratoOdoo(res, b);
    if (acao === 'odoo-contrato-cancela') return await cancelaOrdemOdoo(res, b);

    // 📍 Meu dia — ingest dos blocos da ponte (não precisa de IA; valida o token do Jira).
    if (acao === 'meudia-ingest') return await meuDiaIngest(res, b);

    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      return json(res, 200, {
        ok: false,
        configurado: false,
        erro: 'Análise por IA não configurada. Defina a variável ANTHROPIC_API_KEY na Vercel.',
      });
    }

    // Qualidade dos tickets vs. boas práticas TI-04-006 (rubrica lida do Notion).
    if (acao === 'qualidade') return await analisaQualidade(res, b, apiKey);

    // 🕵️ Auditoria de apontamentos de UMA pessoa vs. validações TI-04-014 (Notion).
    if (acao === 'auditoria') return await auditaApontamentos(res, b, apiKey);

    // 📍 Meu dia — blocos de atividade do Mac + sugestões da IA de onde apontar/criar.
    if (acao === 'meudia') return await meuDiaAnalisa(res, b, apiKey);

    // 🤖 Relatórios do planejamento — análise do planejado × realizado do recorte.
    if (acao === 'planrel') return await analisaPlanRel(res, b, apiKey);

    // ⏳ Como estou gastando meu tempo? — análise do histórico de apontamentos de uma pessoa.
    if (acao === 'meutempo') return await analisaMeuTempo(res, b, apiKey);

    const pessoasIn = Array.isArray(b.pessoas) ? b.pessoas : [];
    if (!pessoasIn.length) return json(res, 400, { erro: 'Sem pessoas para resumir.' });

    // Sanitiza e limita o payload (defesa: o front-end já manda agregado).
    const pessoas = pessoasIn.slice(0, MAX_PESSOAS).map((p) => ({
      id: txt(p.id, 80),
      nome: txt(p.nome, 80),
      horas: num(p.horas),
      faturavelPct: num(p.faturavelPct),
      tickets: num(p.tickets),
      alteracoes: num(p.alteracoes),
      transicoes: num(p.transicoes),
      comentarios: num(p.comentarios),
      criados: num(p.criados),
      diasComApontamento: num(p.diasComApontamento),
      diasUteisEsperados: num(p.diasUteisEsperados),
      metaPct: num(p.metaPct),
    })).filter((p) => p.id);

    const periodo = {
      label: txt((b.periodo && b.periodo.label) || '', 60),
      diasUteis: num(b.periodo && b.periodo.diasUteis),
    };
    const equipe = b.equipe && typeof b.equipe === 'object' ? {
      horasTotais: num(b.equipe.horasTotais),
      faturavelPct: num(b.equipe.faturavelPct),
      ticketsTocados: num(b.equipe.ticketsTocados),
      transicoes: num(b.equipe.transicoes),
      concluidas: num(b.equipe.concluidas),
      criados: num(b.equipe.criados),
      comentarios: num(b.equipe.comentarios),
    } : {};

    const resultado = await chamaClaude(apiKey, { periodo, equipe, pessoas });
    return json(res, 200, {
      ok: true,
      geral: String(resultado.geral || ''),
      pessoas: Array.isArray(resultado.pessoas) ? resultado.pessoas.map((p) => ({
        id: String(p.id || ''),
        resumo: String(p.resumo || ''),
        sinal: ['positivo', 'neutro', 'atencao'].includes(p.sinal) ? p.sinal : 'neutro',
      })) : [],
    });
  } catch (err) {
    return json(res, 200, { ok: false, erro: String(err && err.message ? err.message : err) });
  }
}
