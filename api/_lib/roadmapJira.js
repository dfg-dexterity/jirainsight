// 🗺️→🎫 ROADMAP do app → Jira (projeto JI): manutenção automática (pedido do usuário, 2026-11-18: "Sincronize o roadmap do Notion
// com o Jira, crie e mantenha sincronizado os dois; se não formos criar determinada funcionalidade do roadmap nós cancelamos no
// Jira"). A carga inicial (épicos JI-303..JI-310 e uma História por item, com o rótulo `roadmap-R###`) foi feita pelo MCP; esta lib
// só MANTÉM. Fonte única da regra: o ?tipo=roadmap-jira do api/teams.js e o script da CI (scripts/roadmap-jira-payload.mjs) chamam
// estas funções — nada de regra duplicada.
//
// QUEM MANDA EM QUÊ
//  · o APP (array ROADMAP, public/js/05-novidades-roadmap.js) manda em: resumo (`R### <título>`), o trecho da descrição ACIMA da linha
//    `---` e o estágio (fazendo → Fazendo; avaliacao ↔ rótulo `em-avaliacao`);
//  · o JIRA manda em: épico certo, subtarefas, horas, responsável e o status Feito de uma entrega — esta lib NUNCA mexe nisso;
//  · tudo da linha `---` para baixo na descrição é do Notion/da entrega e fica INTACTO (reescreve-se só o que vem acima).
//  · nunca apaga nada; história Feito nunca é tocada (nem reaberta), salvo a que tem o rótulo `cancelado` e VOLTOU ao array.
//
// FORMATO
//   itens     = [{ id:'R###', s:'fazendo'|'planejado'|'avaliacao', t, d }]            (o ROADMAP do app)
//   historias = [{ key, id:'R###', status:'new'|'indeterminate'|'done', statusNome, labels:[], resumo, descHash }]   (rjLeHistorias)
//   acoes     = [{ tipo, id, key?, ... }] com tipo ∈ criar | transicao | rotulo | resumo | desc | entregue | cancelar | reabrir
//   avisos    = [{ id, key, aviso }]   (observações do plano que não viram escrita)
// `descHash` = hash do texto ACIMA do `---` só com letras e dígitos (a conversão markdown→ADF do Jira troca pontuação, asteriscos e
// numeração: comparar só o conteúdo evita reescrever a mesma descrição a cada rodada). Mudança só de pontuação não é detectada.
// Dependências trocáveis (RJ_DEPS, como DISC_DEPS): { busca(jql, fields) → {issues, truncado}, req(metodo, caminho, corpo) → {status, json},
// pausa(ms) }. Os testes usam um Jira falso por HTTP (JIRA_BASE_URL) e só trocam a pausa.
import crypto from 'node:crypto';
import { jiraBase, jiraAuthHeader, jiraSearchAll } from './util.js';

export const RJ_PROJETO = 'JI';
export const RJ_TIPO_HISTORIA = '11113';        // "História"
export const RJ_EPICO_PADRAO = 'JI-307';        // Plataforma — a entrega reclassifica pelo MCP (rótulo `sem-area`)
export const RJ_ROT = { base: ['dexterity-hub', 'roadmap'], semArea: 'sem-area', avaliacao: 'em-avaliacao', cancelado: 'cancelado' };
export const RJ_TR = { aFazer: '11', fazendo: '21', feito: '41' };
export const RJ_RESUMO_MAX = 250;
export const RJ_ITENS_MAX = 400;
export const RJ_T_MAX = 300;
export const RJ_D_MAX = 4000;
export const RJ_SAIDAS_LIMITE = 15;              // saídas do array (entregue + cancelar) acima disso e de 20% das histórias = payload suspeito
export const RJ_ORCAMENTO_MS = 45000;            // a função tem 60 s; o que sobrar fica para a próxima rodada (idempotente)
const RJ_RESPONSAVEL = process.env.ROADMAP_JIRA_RESPONSAVEL || '712020:3a98a142-a5ce-443c-b3f2-32cd080d2583';
const ESTAGIOS = new Set(['fazendo', 'planejado', 'avaliacao']);
const RE_ID = /^R\d{3,4}$/;
const RE_ROT_ID = /^roadmap-(R\d{3,4})$/;
const RE_RESUMO_ID = /^(R\d{3,4}) /;
export const RJ_COM_SAIDA = 'Saiu do roadmap do app ao ser entregue — confira a entrega';
export const RJ_COM_CANCELA = 'Cancelado: saiu do roadmap do Dexterity Hub';
export const RJ_COM_REABRE = 'Reaberto: o item voltou ao roadmap do Dexterity Hub';

// ---------------------------------------------------------------------------------------------------------------------------------
// Parser do ROADMAP (a fonte única: scripts/roadmap-notion.mjs e scripts/roadmap-jira-payload.mjs importam daqui). O array é literal,
// sem interpolação; respeita aspas, crases e escapes.
// ---------------------------------------------------------------------------------------------------------------------------------
export function literalDe(nome, src) {
  const i = src.indexOf(`const ${nome}=`);
  if (i < 0) return null;
  let p = i + `const ${nome}=`.length;
  const ini = p;
  let prof = 0; let aspa = ''; let escapa = false;
  for (; p < src.length; p += 1) {
    const c = src[p];
    if (escapa) { escapa = false; continue; }
    if (aspa) { if (c === '\\') escapa = true; else if (c === aspa) aspa = ''; continue; }
    if (c === "'" || c === '"' || c === '`') { aspa = c; continue; }
    if (c === '[' || c === '{' || c === '(') prof += 1;
    else if (c === ']' || c === '}' || c === ')') prof -= 1;
    else if (c === ';' && prof === 0) break;
  }
  return new Function(`return (${src.slice(ini, p).trim()})`)();
}
// O ROADMAP do app como [{id,s,t,d}] já validado (id, estágio, título; id repetido = erro).
export function leRoadmapApp(src) {
  const arr = literalDe('ROADMAP', src);
  if (!Array.isArray(arr) || !arr.length) throw new Error('ROADMAP não encontrado');
  const ids = new Set();
  return arr.map((x, i) => {
    const id = String((x && x.id) || '');
    if (!RE_ID.test(id)) throw new Error(`ROADMAP[${i}] sem id R### válido — rode npm run check`);
    if (ids.has(id)) throw new Error(`ROADMAP: id repetido ${id}`);
    ids.add(id);
    if (!ESTAGIOS.has(x.s)) throw new Error(`ROADMAP[${i}] (${id}): estágio "${x.s}" inválido`);
    return { id, s: x.s, t: String(x.t || '').trim(), d: String(x.d || '').trim() };
  });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Validação do corpo da rota: { itens:[{id,s,t,d}] } — devolve { itens } ou { erro }.
// ---------------------------------------------------------------------------------------------------------------------------------
export function rjValidaCorpo(corpo) {
  const arr = corpo && typeof corpo === 'object' ? corpo.itens : null;
  if (!Array.isArray(arr) || !arr.length) return { erro: 'Envie { itens: [{ id, s, t, d }] } com pelo menos 1 item.' };
  if (arr.length > RJ_ITENS_MAX) return { erro: `itens demais (${arr.length}) — o máximo é ${RJ_ITENS_MAX}.` };
  const ids = new Set(); const itens = [];
  for (let i = 0; i < arr.length; i += 1) {
    const x = arr[i];
    if (!x || typeof x !== 'object' || Array.isArray(x)) return { erro: `itens[${i}] inválido.` };
    if (typeof x.id !== 'string' || !RE_ID.test(x.id)) return { erro: `itens[${i}].id inválido — use R### (3 ou 4 dígitos).` };
    if (ids.has(x.id)) return { erro: `id repetido: ${x.id}.` };
    ids.add(x.id);
    if (typeof x.s !== 'string' || !ESTAGIOS.has(x.s)) return { erro: `itens[${i}] (${x.id}): s deve ser fazendo, planejado ou avaliacao.` };
    if (typeof x.t !== 'string' || !x.t.trim() || x.t.length > RJ_T_MAX) return { erro: `itens[${i}] (${x.id}): t deve ter de 1 a ${RJ_T_MAX} caracteres.` };
    if (typeof x.d !== 'string' || x.d.length > RJ_D_MAX) return { erro: `itens[${i}] (${x.id}): d deve ser texto de até ${RJ_D_MAX} caracteres.` };
    itens.push({ id: x.id, s: x.s, t: x.t.trim(), d: x.d.trim() });
  }
  return { itens };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Funções puras
// ---------------------------------------------------------------------------------------------------------------------------------
// O corte pode deixar um espaço no fim; o Jira o apara, então aparamos também (senão o resumo "mudaria" a cada rodada).
export const rjResumoDe = (it) => `${it.id} ${String(it.t).replace(/\s+/g, ' ').trim()}`.slice(0, RJ_RESUMO_MAX).trim();
const soConteudo = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
export const rjHashDesc = (texto) => crypto.createHash('sha1').update(soConteudo(texto)).digest('hex').slice(0, 12);

// ADF → texto do trecho ACIMA da primeira linha horizontal (`rule`); sem `rule`, o texto todo.
function adfTexto(n, out) {
  if (!n) return;
  if (Array.isArray(n)) { n.forEach((x) => adfTexto(x, out)); return; }
  if (n.type === 'text') { out.push(n.text || ''); return; }
  if (n.type === 'hardBreak') { out.push(' '); return; }
  if (n.type === 'emoji' && n.attrs) { out.push(n.attrs.text || ''); return; }
  if (n.content) { adfTexto(n.content, out); out.push(' '); }
}
export function rjTextoAcima(adf) {
  const nos = adf && Array.isArray(adf.content) ? adf.content : [];
  const out = [];
  for (const no of nos) { if (no && no.type === 'rule') break; adfTexto(no, out); }
  return out.join(' ');
}

// O plano. PURA: não lê nem escreve nada. Ver o cabeçalho para o formato.
export function rjPlano(itens, historias) {
  const acoes = []; const avisos = [];
  const hist = new Map();
  for (const h of (historias || [])) {
    if (!h || !h.id) continue;
    if (hist.has(h.id)) { avisos.push({ id: h.id, key: h.key, aviso: `história repetida para ${h.id} (a ${hist.get(h.id).key} vale; esta não é tocada)` }); continue; }
    hist.set(h.id, h);
  }
  const noApp = new Set();
  for (const it of (itens || [])) {
    noApp.add(it.id);
    const h = hist.get(it.id);
    if (!h) {
      acoes.push({ tipo: 'criar', id: it.id, item: { id: it.id, s: it.s, t: it.t, d: it.d } });
      continue;
    }
    const rots = new Set(h.labels || []);
    let status = h.status;
    if (rots.has(RJ_ROT.cancelado)) {
      if (status === 'done') {       // voltou ao array: reabre e segue o fluxo normal como se estivesse "A fazer"
        acoes.push({ tipo: 'reabrir', id: it.id, key: h.key });
        status = 'new'; rots.delete(RJ_ROT.cancelado);
      } else {                         // rótulo solto numa história aberta: só tira
        acoes.push({ tipo: 'rotulo', id: it.id, key: h.key, add: [], remove: [RJ_ROT.cancelado] });
        rots.delete(RJ_ROT.cancelado);
      }
    }
    if (status === 'done') continue;   // Feito: nunca mexe (nem reabre)
    if (it.s === 'fazendo' && status === 'new') acoes.push({ tipo: 'transicao', id: it.id, key: h.key, para: RJ_TR.fazendo });
    else if (it.s !== 'fazendo' && status === 'indeterminate') avisos.push({ id: it.id, key: h.key, aviso: `no app está "${it.s}" e no Jira já está em andamento (${h.statusNome || 'Fazendo'}) — não rebaixa` });
    const querAval = it.s === 'avaliacao';
    if (querAval && !rots.has(RJ_ROT.avaliacao)) acoes.push({ tipo: 'rotulo', id: it.id, key: h.key, add: [RJ_ROT.avaliacao], remove: [] });
    else if (!querAval && rots.has(RJ_ROT.avaliacao)) acoes.push({ tipo: 'rotulo', id: it.id, key: h.key, add: [], remove: [RJ_ROT.avaliacao] });
    const resumo = rjResumoDe(it);
    if (String(h.resumo || '').trim() !== resumo) acoes.push({ tipo: 'resumo', id: it.id, key: h.key, resumo });
    if ((h.descHash || '') !== rjHashDesc(it.d)) acoes.push({ tipo: 'desc', id: it.id, key: h.key, d: it.d });
  }
  for (const [id, h] of hist) {
    if (noApp.has(id)) continue;
    if (h.status === 'indeterminate') acoes.push({ tipo: 'entregue', id, key: h.key });
    else if (h.status === 'new') acoes.push({ tipo: 'cancelar', id, key: h.key });
    // done: já tratado (entrega, cancelamento anterior) — nunca mexe
  }
  return { acoes, avisos };
}

export function rjContagens(acoes, erros = 0) {
  const c = { criar: 0, transicao: 0, rotulo: 0, resumo: 0, desc: 0, entregue: 0, cancelar: 0, reabrir: 0, erros };
  for (const a of acoes) if (a.tipo in c) c[a.tipo] += 1;
  return c;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// ADF (descrição)
// ---------------------------------------------------------------------------------------------------------------------------------
const paragrafos = (texto) => {
  const linhas = String(texto || '').split(/\n+/).map((s) => s.trim()).filter(Boolean);
  return (linhas.length ? linhas : ['']).map((l) => (l ? { type: 'paragraph', content: [{ type: 'text', text: l }] } : { type: 'paragraph', content: [] }));
};
export const adfDoc = (conteudo) => ({ type: 'doc', version: 1, content: conteudo });
export const adfTextoSimples = (texto) => adfDoc(paragrafos(texto));
// Reescreve SÓ o trecho acima da 1ª `rule`; o que vem da `rule` para baixo é devolvido intacto. Sem `rule` no original, o conteúdo antigo
// desce para baixo de uma linha nova (nunca se perde nada).
export function rjNovaDescricao(adfAtual, d) {
  const nos = adfAtual && Array.isArray(adfAtual.content) ? adfAtual.content : [];
  const i = nos.findIndex((n) => n && n.type === 'rule');
  const novo = paragrafos(d);
  if (i < 0) return adfDoc(nos.length ? [...novo, { type: 'rule' }, ...nos] : novo);
  return adfDoc([...novo, ...nos.slice(i)]);
}
const descCriar = (item) => adfDoc([
  ...paragrafos(item.d), { type: 'rule' },
  { type: 'paragraph', content: [{ type: 'text', text: `Roadmap do Dexterity Hub · ${item.id}`, marks: [{ type: 'strong' }] }, { type: 'text', text: ' — item novo no roadmap do app, ainda sem classificação (rótulo sem-area): a entrega escolhe o épico da área e completa esta descrição.' }] },
]);

// ---------------------------------------------------------------------------------------------------------------------------------
// Rede
// ---------------------------------------------------------------------------------------------------------------------------------
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
async function reqPadrao(metodo, caminho, corpo, tentativa = 0) {
  const r = await fetch(`${jiraBase()}${caminho}`, {
    method: metodo,
    headers: { Authorization: jiraAuthHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (r.status === 429 && tentativa < 2) { await dorme(Math.min(5, Number(r.headers.get('retry-after') || 1)) * 1000); return reqPadrao(metodo, caminho, corpo, tentativa + 1); }
  const txt = await r.text();
  let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
  return { status: r.status, json: j };
}
// Ganchos de teste: o que for posto aqui vence as dependências padrão.
export const RJ_DEPS = {};
const depsPadrao = () => ({
  busca: (jql, fields) => jiraSearchAll({ jql, fields, maxPages: 20 }),
  req: reqPadrao,
  pausa: () => dorme(150),
  ...RJ_DEPS,
});
const falhou = (r) => !r || r.status < 200 || r.status >= 300;
class ErroJira extends Error { constructor(status) { super(`Jira HTTP ${status}`); this.status = status; } }
const exige = (r) => { if (falhou(r)) throw new ErroJira(r ? r.status : 0); return r; };

export const RJ_JQL = `project = ${RJ_PROJETO} AND labels = roadmap AND labels = dexterity-hub AND issuetype = "História"`;
// Lê as histórias do roadmap já no Jira. Lança se a leitura vier cortada (agir sobre uma lista parcial criaria duplicatas e cancelaria à toa).
export async function rjLeHistorias(deps) {
  const d = { ...depsPadrao(), ...(deps || {}) };
  const { issues, truncado } = await d.busca(RJ_JQL, ['summary', 'status', 'labels', 'description']);
  if (truncado) throw new Error('Leitura das histórias cortada pelo limite de páginas — nada foi feito.');
  const out = [];
  for (const is of issues || []) {
    const f = is.fields || {};
    const labels = Array.isArray(f.labels) ? f.labels : [];
    let id = '';
    for (const l of labels) { const m = RE_ROT_ID.exec(l); if (m) { id = m[1]; break; } }
    if (!id) { const m = RE_RESUMO_ID.exec(String(f.summary || '')); if (m) id = m[1]; }
    if (!id) continue;
    const cat = f.status && f.status.statusCategory && f.status.statusCategory.key;
    out.push({
      key: is.key, id, status: cat === 'done' || cat === 'new' || cat === 'indeterminate' ? cat : 'indeterminate',
      statusNome: (f.status && f.status.name) || '', labels, resumo: String(f.summary || ''),
      descHash: rjHashDesc(rjTextoAcima(f.description)),
    });
  }
  out.sort((a, b) => String(a.key).localeCompare(String(b.key), 'en', { numeric: true }));
  return out;
}

// Executa o plano em série (pausa curta entre as chamadas). Erro num item não para os outros. Devolve SÓ contagens + ids de roadmap
// (nada de título nem de descrição). Com `dry` nada é escrito: as contagens são as do plano.
export async function rjAplica(acoes, deps, { dry = false, orcamentoMs = RJ_ORCAMENTO_MS } = {}) {
  const d = { ...depsPadrao(), ...(deps || {}) };
  const feitas = []; const ids = {}; const erros = []; const avisos = { semResolucao: 0, semComentario: 0, semTransicao: 0, adiadas: 0 };
  const marca = (a) => { (ids[a.tipo] = ids[a.tipo] || []).push(a.id); };
  const t0 = Date.now();
  if (dry) { for (const a of acoes) { feitas.push(a); marca(a); } return { contagens: rjContagens(feitas, 0), ids, avisos }; }
  const edita = (key, corpo) => d.req('PUT', `/rest/api/3/issue/${encodeURIComponent(key)}`, corpo).then(exige);
  const transiciona = (key, id, corpo) => d.req('POST', `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, { transition: { id }, ...(corpo || {}) }).then(exige);
  const comenta = async (key, texto) => {      // melhor esforço: o comentário nunca desfaz nem reprova a mudança já feita
    try { exige(await d.req('POST', `/rest/api/3/issue/${encodeURIComponent(key)}/comment`, { body: adfTextoSimples(texto) })); } catch (e) { avisos.semComentario += 1; }
  };
  for (let i = 0; i < acoes.length; i += 1) {
    const a = acoes[i];
    if (Date.now() - t0 > orcamentoMs) { avisos.adiadas = acoes.length - i; break; }
    try {
      if (a.tipo === 'criar') {
        const it = a.item;
        const labels = [...RJ_ROT.base, `roadmap-${it.id}`, RJ_ROT.semArea, ...(it.s === 'avaliacao' ? [RJ_ROT.avaliacao] : [])];
        const r = exige(await d.req('POST', '/rest/api/3/issue', { fields: {
          project: { key: RJ_PROJETO }, issuetype: { id: RJ_TIPO_HISTORIA }, summary: rjResumoDe(it), parent: { key: RJ_EPICO_PADRAO },
          labels, description: descCriar(it), assignee: { accountId: RJ_RESPONSAVEL },
        } }));
        const key = r.json && r.json.key;
        if (it.s === 'fazendo' && key) { await d.pausa(150); try { await transiciona(key, RJ_TR.fazendo); } catch (e) { avisos.semTransicao += 1; } }
      } else if (a.tipo === 'transicao') {
        await transiciona(a.key, a.para);
      } else if (a.tipo === 'rotulo') {
        const up = [...a.add.map((add) => ({ add })), ...a.remove.map((remove) => ({ remove }))];
        await edita(a.key, { update: { labels: up } });
      } else if (a.tipo === 'resumo') {
        await edita(a.key, { fields: { summary: a.resumo } });
      } else if (a.tipo === 'desc') {
        const atual = exige(await d.req('GET', `/rest/api/3/issue/${encodeURIComponent(a.key)}?fields=description`));
        await edita(a.key, { fields: { description: rjNovaDescricao(atual.json && atual.json.fields && atual.json.fields.description, a.d) } });
      } else if (a.tipo === 'entregue') {
        await transiciona(a.key, RJ_TR.feito);
        await comenta(a.key, RJ_COM_SAIDA);
      } else if (a.tipo === 'cancelar') {
        await edita(a.key, { update: { labels: [{ add: RJ_ROT.cancelado }] } });   // 1º o rótulo (idempotente); depois o status
        await transiciona(a.key, RJ_TR.feito);
        let ok = false;
        for (const nome of ["Won't Do", 'Não será feito']) {
          try { exige(await d.req('PUT', `/rest/api/3/issue/${encodeURIComponent(a.key)}`, { fields: { resolution: { name: nome } } })); ok = true; break; } catch (e) { /* tenta a próxima */ }
        }
        if (!ok) avisos.semResolucao += 1;
        await comenta(a.key, RJ_COM_CANCELA);
      } else if (a.tipo === 'reabrir') {
        await transiciona(a.key, RJ_TR.aFazer);
        await edita(a.key, { update: { labels: [{ remove: RJ_ROT.cancelado }] } });
        await comenta(a.key, RJ_COM_REABRE);
      }
      feitas.push(a); marca(a);
    } catch (e) {
      erros.push({ id: a.id, tipo: a.tipo, status: e && e.status ? e.status : 0 });
      console.error(`roadmap-jira: ${a.tipo} ${a.id} falhou (HTTP ${e && e.status ? e.status : '?'})`);
    }
    await d.pausa(150);
  }
  if (erros.length) ids.erros = erros;
  return { contagens: rjContagens(feitas, erros.length), ids, avisos };
}

// Orquestra: lê, planeja, protege, aplica. `forcar` libera o freio de saídas em massa.
export async function rjSincroniza(itens, { dry = false, forcar = false, deps } = {}) {
  const historias = await rjLeHistorias(deps);
  const { acoes, avisos } = rjPlano(itens, historias);
  const saidas = acoes.filter((a) => a.tipo === 'entregue' || a.tipo === 'cancelar').length;
  if (!forcar && saidas > RJ_SAIDAS_LIMITE && saidas > historias.length * 0.2) {
    return { ok: false, bloqueado: true, historias: historias.length, saidas, contagens: rjContagens(acoes, 0), ids: {} };
  }
  const r = await rjAplica(acoes, deps, { dry });
  return { ok: !r.contagens.erros, dry, historias: historias.length, itens: itens.length, contagens: r.contagens, ids: r.ids, avisos: { ...r.avisos, planoSemRebaixar: avisos.length } };
}
