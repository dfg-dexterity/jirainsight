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
//  · nunca apaga nada; história Feito nunca é tocada (nem reaberta), salvo a com rótulo `cancelado` que VOLTOU ao array.
//
// SAÍDAS EXPLÍCITAS (revisão de 2026-11-18): só se encerra (`entregue`/`cancelar`) a História de um id que venha em `saidas:[R###]` no corpo —
// a CI calcula a lista pelo diff do array ROADMAP entre o commit anterior e o atual. História no Jira que não está no array e não está em
// `saidas` (nunca esteve, foi criada à mão, o item foi entregue e a História ficou esquecida) só gera aviso `foraDoArray`.
//
// ADOÇÃO POR PROPRIEDADE: o último texto que o APP mandou fica na propriedade de entidade `dexhub.roadmap` = { h: hash da descrição, r: hash do
// resumo } de cada História. Só se reescreve quando o hash do app MUDA em relação à propriedade. Sem a propriedade (as Histórias da carga inicial,
// que usaram a descrição do Notion e têm linhas como "Origem: JI-xxx" acima do `---`) o plano só ADOTA — grava a propriedade com o hash atual e não
// reescreve nada. Descrição sem a linha `---` nunca é reescrita (só aviso).
//
// FORMATO
//   itens     = [{ id:'R###', s:'fazendo'|'planejado'|'avaliacao', t, d }]            (o ROADMAP do app)
//   saidas    = ['R###', …]                                                            (ids que saíram do array neste commit)
//   historias = [{ key, id:'R###', status:'new|indeterminate|done', statusNome, labels, resumo, prop:{h,r}|null, temRegua }]   (rjLeHistorias)
//   acoes     = [{ tipo, id, key?, ... }] com tipo ∈ criar | transicao | rotulo | resumo | desc | adotar | entregue | cancelar | reabrir
//   avisos    = [{ tipo:'foraDoArray'|'semRebaixar'|'semRegua'|'repetida', id, key, aviso }]
// Dependências trocáveis (RJ_DEPS, como DISC_DEPS): { busca(jql, fields, props) → {issues, truncado}, req(metodo, caminho, corpo) → {status, json},
// pausa(ms) }. Os testes usam um Jira falso por HTTP (JIRA_BASE_URL) e só trocam a pausa.
import crypto from 'node:crypto';
import { jiraBase, jiraAuthHeader } from './util.js';

export const RJ_PROJETO = 'JI';
export const RJ_TIPO_HISTORIA = '11113';        // "História"
export const RJ_EPICO_PADRAO = 'JI-307';        // Plataforma — a entrega reclassifica pelo MCP (rótulo `sem-area`)
export const RJ_ROT = { base: ['dexterity-hub', 'roadmap'], semArea: 'sem-area', avaliacao: 'em-avaliacao', cancelado: 'cancelado' };
export const RJ_TR = { aFazer: '11', fazendo: '21', feito: '41' };
export const RJ_RESUMO_MAX = 250;
export const RJ_ITENS_MAX = 400;
export const RJ_T_MAX = 300;
export const RJ_D_MAX = 4000;
export const RJ_SAIDAS_LIMITE = 15;              // entregue + cancelar acima disso OU de 20% das histórias = 409 sem forcar
export const RJ_EDICOES_LIMITE = 25;             // desc + resumo reescritos de uma vez acima disso = 409 sem forcar
export const RJ_D_VAZIO_MAX = 0.1;               // mais de 10% dos itens com `d` vazio = corpo suspeito (400)
export const RJ_ORCAMENTO_MS = 40000;            // a função tem 60 s; contado desde o início da requisição; o que sobrar fica para a próxima rodada
export const RJ_TIMEOUT_MS = 10000;              // por chamada ao Jira
export const RJ_PROP = 'dexhub.roadmap';
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
// Validação do corpo da rota: { itens:[{id,s,t,d}], saidas?:['R###'] } — devolve { itens, saidas } ou { erro }.
// ---------------------------------------------------------------------------------------------------------------------------------
export function rjValidaCorpo(corpo) {
  const arr = corpo && typeof corpo === 'object' ? corpo.itens : null;
  if (!Array.isArray(arr) || !arr.length) return { erro: 'Envie { itens: [{ id, s, t, d }] } com pelo menos 1 item.' };
  if (arr.length > RJ_ITENS_MAX) return { erro: `itens demais (${arr.length}) — o máximo é ${RJ_ITENS_MAX}.` };
  const ids = new Set(); const itens = []; let vazios = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const x = arr[i];
    if (!x || typeof x !== 'object' || Array.isArray(x)) return { erro: `itens[${i}] inválido.` };
    if (typeof x.id !== 'string' || !RE_ID.test(x.id)) return { erro: `itens[${i}].id inválido — use R### (3 ou 4 dígitos).` };
    if (ids.has(x.id)) return { erro: `id repetido: ${x.id}.` };
    ids.add(x.id);
    if (typeof x.s !== 'string' || !ESTAGIOS.has(x.s)) return { erro: `itens[${i}] (${x.id}): s deve ser fazendo, planejado ou avaliacao.` };
    if (typeof x.t !== 'string' || !x.t.trim() || x.t.length > RJ_T_MAX) return { erro: `itens[${i}] (${x.id}): t deve ter de 1 a ${RJ_T_MAX} caracteres.` };
    if (typeof x.d !== 'string' || x.d.length > RJ_D_MAX) return { erro: `itens[${i}] (${x.id}): d deve ser texto de até ${RJ_D_MAX} caracteres.` };
    if (!x.d.trim()) vazios += 1;
    itens.push({ id: x.id, s: x.s, t: x.t.trim(), d: x.d.trim() });
  }
  if (vazios > itens.length * RJ_D_VAZIO_MAX) return { erro: `d vazio em ${vazios} de ${itens.length} itens — o corpo parece truncado.` };
  const sai = corpo.saidas === undefined ? [] : corpo.saidas;
  if (!Array.isArray(sai) || sai.length > RJ_ITENS_MAX) return { erro: `saidas deve ser uma lista de até ${RJ_ITENS_MAX} ids R###.` };
  const saidas = [];
  for (const id of sai) {
    if (typeof id !== 'string' || !RE_ID.test(id)) return { erro: 'saidas: id inválido — use R###.' };
    if (ids.has(id)) return { erro: `saidas: ${id} também está em itens.` };
    if (!saidas.includes(id)) saidas.push(id);
  }
  return { itens, saidas };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Funções puras
// ---------------------------------------------------------------------------------------------------------------------------------
export const rjResumoDe = (it) => `${it.id} ${String(it.t).replace(/\s+/g, ' ').trim()}`.slice(0, RJ_RESUMO_MAX).trim();   // o Jira apara o espaço final do corte
const soConteudo = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const sha = (t) => crypto.createHash('sha1').update(t).digest('hex').slice(0, 12);
export const rjHashDesc = (texto) => sha(soConteudo(texto));   // só letras e dígitos: espaços/pontuação/markdown não contam como mudança
export const rjHashResumo = (resumo) => sha(String(resumo || ''));
export const rjIdsDe = (acoes) => { const ids = {}; for (const a of acoes) (ids[a.tipo] = ids[a.tipo] || []).push(a.id); return ids; };

// O plano. PURA: não lê nem escreve nada. Ver o cabeçalho para o formato.
export function rjPlano(itens, historias, saidas = []) {
  const acoes = []; const avisos = [];
  const hist = new Map();
  for (const h of (historias || [])) {
    if (!h || !h.id) continue;
    if (hist.has(h.id)) { avisos.push({ tipo: 'repetida', id: h.id, key: h.key, aviso: `história repetida para ${h.id} (a ${hist.get(h.id).key} vale; esta não é tocada)` }); continue; }
    hist.set(h.id, h);
  }
  const noApp = new Set(); const sai = new Set(saidas || []); const adotares = [];
  for (const it of (itens || [])) {
    noApp.add(it.id);
    const h = hist.get(it.id);
    if (!h) { acoes.push({ tipo: 'criar', id: it.id, item: { id: it.id, s: it.s, t: it.t, d: it.d } }); continue; }
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
    if (status === 'done') continue;   // Feito: nunca mexe (nem reabre, nem adota)
    if (it.s === 'fazendo' && status === 'new') acoes.push({ tipo: 'transicao', id: it.id, key: h.key, para: RJ_TR.fazendo });
    else if (it.s !== 'fazendo' && status === 'indeterminate') avisos.push({ tipo: 'semRebaixar', id: it.id, key: h.key, aviso: `no app está "${it.s}" e no Jira já está em andamento (${h.statusNome || 'Fazendo'}) — não rebaixa` });
    const querAval = it.s === 'avaliacao';
    // em-avaliacao só em quem ainda não começou: História em andamento (ou reaberta que já foi para Fazendo) não ganha o rótulo
    if (querAval && status === 'new' && !rots.has(RJ_ROT.avaliacao)) acoes.push({ tipo: 'rotulo', id: it.id, key: h.key, add: [RJ_ROT.avaliacao], remove: [] });
    else if (!querAval && rots.has(RJ_ROT.avaliacao)) acoes.push({ tipo: 'rotulo', id: it.id, key: h.key, add: [], remove: [RJ_ROT.avaliacao] });
    // resumo e descrição: comparam o app com a PROPRIEDADE (o último texto que o app mandou), nunca com o texto do Jira
    const resumo = rjResumoDe(it); const hD = rjHashDesc(it.d); const hR = rjHashResumo(resumo);
    const p = h.prop && typeof h.prop === 'object' ? h.prop : {};
    const adota = {};
    if (p.h === undefined) adota.h = hD;
    if (p.r === undefined) adota.r = hR;
    if (p.r !== undefined && p.r !== hR) acoes.push({ tipo: 'resumo', id: it.id, key: h.key, resumo, set: { r: hR }, prop: p });
    if (p.h !== undefined && p.h !== hD) {
      if (h.temRegua) acoes.push({ tipo: 'desc', id: it.id, key: h.key, d: it.d, set: { h: hD }, prop: p });
      else avisos.push({ tipo: 'semRegua', id: it.id, key: h.key, aviso: 'a descrição do app mudou, mas a História não tem a linha --- : não é reescrita' });
    }
    if (Object.keys(adota).length) adotares.push({ tipo: 'adotar', id: it.id, key: h.key, set: adota, prop: p });
  }
  for (const [id, h] of hist) {
    if (noApp.has(id)) continue;
    if (h.status === 'done') continue;   // já tratado (entrega, cancelamento anterior) — nunca mexe
    if (!sai.has(id)) { avisos.push({ tipo: 'foraDoArray', id, key: h.key, aviso: `${id} tem História aberta no Jira mas não está no roadmap do app e não saiu neste commit — confira à mão` }); continue; }
    if (h.status === 'indeterminate') acoes.push({ tipo: 'entregue', id, key: h.key });
    else if (h.status === 'new') acoes.push({ tipo: 'cancelar', id, key: h.key });
  }
  acoes.push(...adotares);   // adotar por ÚLTIMO: o que muda o status (entregue/cancelar/transições/rótulos) não espera por ele
  return { acoes, avisos };
}

export function rjContagens(acoes, erros = 0) {
  const c = { criar: 0, transicao: 0, rotulo: 0, resumo: 0, desc: 0, adotar: 0, entregue: 0, cancelar: 0, reabrir: 0, erros };
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
// Reescreve SÓ o trecho acima da 1ª `rule`; o que vem da `rule` para baixo é devolvido intacto. Sem `rule` no original devolve null: nunca se reescreve.
export function rjNovaDescricao(adfAtual, d) {
  const nos = adfAtual && Array.isArray(adfAtual.content) ? adfAtual.content : [];
  const i = nos.findIndex((n) => n && n.type === 'rule');
  if (i < 0) return null;
  return adfDoc([...paragrafos(d), ...nos.slice(i)]);
}
export const adfTemRegua = (adf) => !!(adf && Array.isArray(adf.content) && adf.content.some((n) => n && n.type === 'rule'));
const descCriar = (item) => adfDoc([
  ...paragrafos(item.d), { type: 'rule' },
  { type: 'paragraph', content: [{ type: 'text', text: `Roadmap do Dexterity Hub · ${item.id}`, marks: [{ type: 'strong' }] }, { type: 'text', text: ' — item novo no roadmap do app, ainda sem classificação (rótulo sem-area): a entrega escolhe o épico da área e completa esta descrição.' }] },
]);

// ---------------------------------------------------------------------------------------------------------------------------------
// Rede
// ---------------------------------------------------------------------------------------------------------------------------------
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
// Retry-After não numérico (ou ausente) = 1 s; teto de 5 s.
export const rjEsperaRetry = (v) => { const n = (v === null || v === undefined || String(v).trim() === '') ? NaN : Number(v); return (Number.isFinite(n) && n >= 0 ? Math.min(5, n) : 1) * 1000; };
async function reqPadrao(metodo, caminho, corpo, tentativa = 0) {
  let r;
  try {
    r = await fetch(`${jiraBase()}${caminho}`, {
      method: metodo,
      headers: { Authorization: jiraAuthHeader(), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(RJ_DEPS.timeoutMs || RJ_TIMEOUT_MS),
    });
  } catch (e) { return { status: 0, json: null }; }   // tempo esgotado / rede: quem chama decide (erro do item)
  if (r.status === 429 && tentativa < 2) { await dorme(rjEsperaRetry(r.headers.get('retry-after'))); return reqPadrao(metodo, caminho, corpo, tentativa + 1); }
  const txt = await r.text().catch(() => '');
  let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
  return { status: r.status, json: j };
}
// Busca paginada (search/jql, nextPageToken) com as propriedades pedidas. `truncado` = ainda havia página além do teto.
async function buscaPadrao(jql, fields, props, req = reqPadrao) {
  const issues = []; let token; let paginas = 0;
  do {
    const r = await req('POST', '/rest/api/3/search/jql', { jql, fields, properties: props, maxResults: 100, ...(token ? { nextPageToken: token } : {}) });
    if (r.status < 200 || r.status >= 300 || !r.json) throw new Error(`Jira busca HTTP ${r.status}`);
    issues.push(...(r.json.issues || []));
    token = r.json.isLast ? undefined : r.json.nextPageToken;
    paginas += 1;
  } while (token && paginas < 20);
  return { issues, truncado: !!token };
}
// Ganchos de teste: o que for posto aqui vence as dependências padrão.
export const RJ_DEPS = {};
const depsPadrao = () => {
  const d = { req: reqPadrao, pausa: () => dorme(150), ...RJ_DEPS };
  return { busca: (jql, fields, props) => buscaPadrao(jql, fields, props, d.req), ...d };
};
const falhou = (r) => !r || r.status < 200 || r.status >= 300;
class ErroJira extends Error { constructor(status) { super(`Jira HTTP ${status}`); this.status = status; } }
const exige = (r) => { if (falhou(r)) throw new ErroJira(r ? r.status : 0); return r; };

export const RJ_JQL = `project = ${RJ_PROJETO} AND labels = roadmap AND labels = dexterity-hub AND issuetype = "História"`;
// Lê as histórias do roadmap já no Jira. Lança se a leitura vier cortada (agir sobre uma lista parcial criaria duplicatas).
export async function rjLeHistorias(deps) {
  const d = { ...depsPadrao(), ...(deps || {}) };
  const { issues, truncado } = await d.busca(RJ_JQL, ['summary', 'status', 'labels', 'description', 'updated'], [RJ_PROP]);
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
    const prop = is.properties && is.properties[RJ_PROP] && typeof is.properties[RJ_PROP] === 'object' ? is.properties[RJ_PROP] : null;
    out.push({
      key: is.key, id, status: cat === 'done' || cat === 'new' || cat === 'indeterminate' ? cat : 'indeterminate',
      updated: String(f.updated || ''), statusNome: (f.status && f.status.name) || '', labels, resumo: String(f.summary || ''), prop, temRegua: adfTemRegua(f.description),
    });
  }
  out.sort((a, b) => String(a.key).localeCompare(String(b.key), 'en', { numeric: true }));
  // Sanidade: mais de 50% sem a propriedade pode ser só a carga inicial — ou a busca não devolver `properties` (aí adotaríamos a cada rodada).
  // Lê a propriedade de UMA das sem propriedade (a de maior `updated`): se ela existir lá, a busca não está devolvendo — erro claro.
  const sem = out.filter((h) => !h.prop);
  if (out.length && sem.length > out.length * 0.5) {
    const alvo = [...sem].sort((a, b) => (a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0))[0];
    const g = await d.req('GET', `/rest/api/3/issue/${encodeURIComponent(alvo.key)}/properties/${RJ_PROP}`);
    if (!falhou(g) && g.json && g.json.value !== undefined && g.json.value !== null) throw new Error('a busca do Jira não devolve properties — nada foi feito.');
  }
  return out;
}

// Executa o plano em série (pausa curta entre as chamadas). Erro num item não para os outros. Devolve SÓ contagens + ids de roadmap
// (nada de título nem de descrição). Com `dry` nada é escrito: as contagens são as do plano. `t0` = início da requisição (o orçamento conta dele).
export async function rjAplica(acoes, deps, { dry = false, orcamentoMs = RJ_ORCAMENTO_MS, t0 = Date.now() } = {}) {
  const d = { ...depsPadrao(), ...(deps || {}) };
  const feitas = []; const ids = {}; const erros = [];
  const avisos = { semResolucao: 0, semLimparResolucao: 0, semComentario: 0, semTransicao: 0, semPropriedade: 0, adiadas: 0 };
  const marca = (a) => { (ids[a.tipo] = ids[a.tipo] || []).push(a.id); };
  if (dry) { for (const a of acoes) { feitas.push(a); marca(a); } return { contagens: rjContagens(feitas, 0), ids, avisos }; }
  const K = (key) => encodeURIComponent(key);
  const edita = (key, corpo) => d.req('PUT', `/rest/api/3/issue/${K(key)}`, corpo).then(exige);
  const transiciona = (key, id) => d.req('POST', `/rest/api/3/issue/${K(key)}/transitions`, { transition: { id } }).then(exige);
  const comenta = async (key, texto) => {      // melhor esforço: o comentário nunca desfaz nem reprova a mudança já feita
    try { exige(await d.req('POST', `/rest/api/3/issue/${K(key)}/comment`, { body: adfTextoSimples(texto) })); } catch (e) { avisos.semComentario += 1; }
  };
  const tentaResolucao = async (key, nomes) => {
    for (const nome of nomes) { try { exige(await d.req('PUT', `/rest/api/3/issue/${K(key)}`, { fields: { resolution: { name: nome } } })); return true; } catch (e) { /* tenta a próxima */ } }
    return false;
  };
  const props = new Map();   // key → propriedade atual (várias ações da mesma História somam campos; nenhuma pisa na outra)
  const gravaProp = async (a) => {
    const atual = { ...(props.has(a.key) ? props.get(a.key) : (a.prop || {})), ...(a.set || {}) };
    exige(await d.req('PUT', `/rest/api/3/issue/${K(a.key)}/properties/${RJ_PROP}`, atual));
    props.set(a.key, atual);
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
        }, properties: [{ key: RJ_PROP, value: { h: rjHashDesc(it.d), r: rjHashResumo(rjResumoDe(it)) } }] }));
        const key = r.json && r.json.key;
        if (it.s === 'fazendo' && key) { await d.pausa(150); try { await transiciona(key, RJ_TR.fazendo); } catch (e) { avisos.semTransicao += 1; } }
      } else if (a.tipo === 'transicao') {
        await transiciona(a.key, a.para);
      } else if (a.tipo === 'rotulo') {
        const up = [...a.add.map((add) => ({ add })), ...a.remove.map((remove) => ({ remove }))];
        await edita(a.key, { update: { labels: up } });
      } else if (a.tipo === 'resumo') {
        await edita(a.key, { fields: { summary: a.resumo } });
        await gravaProp(a);
      } else if (a.tipo === 'desc') {
        const atual = exige(await d.req('GET', `/rest/api/3/issue/${K(a.key)}?fields=description`));
        const nova = rjNovaDescricao(atual.json && atual.json.fields && atual.json.fields.description, a.d);
        if (!nova) throw new ErroJira(409);   // a linha --- sumiu desde a leitura: nunca reescreve
        await edita(a.key, { fields: { description: nova } });
        await gravaProp(a);
      } else if (a.tipo === 'adotar') {
        await gravaProp(a);
      } else if (a.tipo === 'entregue') {
        await transiciona(a.key, RJ_TR.feito);
        // a transição por si só não grava resolução no fluxo do JI: se ficou sem, põe a de Feito (a que o Jira aceitar)
        const g = await d.req('GET', `/rest/api/3/issue/${K(a.key)}?fields=resolution`);
        const semRes = !falhou(g) && !(g.json && g.json.fields && g.json.fields.resolution);
        if (semRes && !(await tentaResolucao(a.key, ['Done', 'Feito', 'Concluído']))) avisos.semResolucao += 1;
        await comenta(a.key, RJ_COM_SAIDA);
      } else if (a.tipo === 'cancelar') {
        await edita(a.key, { update: { labels: [{ add: RJ_ROT.cancelado }] } });   // 1º o rótulo (idempotente); depois o status
        await transiciona(a.key, RJ_TR.feito);
        if (!(await tentaResolucao(a.key, ["Won't Do", 'Não será feito']))) avisos.semResolucao += 1;
        await comenta(a.key, RJ_COM_CANCELA);
      } else if (a.tipo === 'reabrir') {
        await transiciona(a.key, RJ_TR.aFazer);
        // o Jira real não limpa a resolução na transição: reabrir sem limpar deixa a História "resolvida" e riscada
        try { exige(await d.req('PUT', `/rest/api/3/issue/${K(a.key)}`, { fields: { resolution: null } })); } catch (e) { avisos.semLimparResolucao += 1; }
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

// Orquestra: lê, planeja, protege (freios), aplica. `forcar` libera os freios de saídas e de edições em massa.
export async function rjSincroniza(itens, { saidas = [], dry = false, forcar = false, deps, t0 = Date.now() } = {}) {
  const historias = await rjLeHistorias(deps);
  const { acoes, avisos } = rjPlano(itens, historias, saidas);
  const nAvisos = {}; const idsAvisos = {};
  for (const a of avisos) { nAvisos[a.tipo] = (nAvisos[a.tipo] || 0) + 1; (idsAvisos[a.tipo] = idsAvisos[a.tipo] || []).push(a.id); }
  const sai = acoes.filter((a) => a.tipo === 'entregue' || a.tipo === 'cancelar').length;
  const edic = acoes.filter((a) => a.tipo === 'desc' || a.tipo === 'resumo').length;
  if (!forcar) {
    const motivo = (sai > RJ_SAIDAS_LIMITE || sai > historias.length * 0.2) ? 'saidas' : (edic > RJ_EDICOES_LIMITE ? 'edicoes' : '');
    if (motivo) return { ok: false, bloqueado: motivo, historias: historias.length, contagens: rjContagens(acoes, 0), ids: { ...rjIdsDe(acoes), ...idsAvisos }, avisos: nAvisos };
  }
  const r = await rjAplica(acoes, deps, { dry, t0 });
  const ids = { ...r.ids, ...idsAvisos };
  return { ok: !r.contagens.erros, dry, historias: historias.length, itens: itens.length, contagens: r.contagens, ids, avisos: { ...r.avisos, ...nAvisos } };
}
