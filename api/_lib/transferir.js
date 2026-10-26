// 🔗 Transferir ticket (2026-10-26, a pedido do usuário: "todo o histórico de um ticket é enviado para outro ticket
// e o ticket original é deletado; entre projetos ou dentro do mesmo projeto").
//
// Sub-rota POST /api/reunioes { transf:'<etapa>', email, token, ... } — sem função serverless nova (limite de 12).
// TUDO com o token da PESSOA (leitura e escrita): ela só transfere o que enxerga e pode editar, e a exclusão
// exige a permissão "Excluir itens" dela no projeto de origem.
//
// O painel conduz por ETAPAS curtas (cabe nos 60 s da Vercel e cada uma pode ser repetida só no que falhou):
//   ler        → inventário da origem (comentários, anexos, vínculos, filhos, worklogs, histórico de status)
//   conferir   → ficha do destino escolhido (tipo, nível, projeto) para a tela checar a compatibilidade
//   destino    → cria o ticket novo OU comenta o cabeçalho da transferência no existente
//   comentarios / anexos / vinculos / filhos / historico / horas → copiam, em lotes, o que a tela pedir
//   excluir    → apaga a origem — recusa se ela ainda tiver filhos (subtarefas/itens), que sumiriam junto
// IDEMPOTÊNCIA (revisão de 2026-10-26): tudo o que é escrito no destino leva um MARCADOR com o id da origem
// ("comentário copiado de K #123", "⏩ Transferido de K #456", "🕓 Histórico de K", "📦 Transferido de K", anexo de mesmo
// nome e tamanho, remote link de mesma URL, propriedade tft.origem no ticket criado) e cada etapa LÊ o destino antes de
// escrever — repetir uma etapa (timeout, aba recarregada, ↻) nunca duplica. O excluir relê a origem e recusa se apareceu
// conteúdo novo desde o inventário ou se a conta de serviço enxerga comentários/apontamentos que a pessoa não enxerga.
// As horas de OUTRAS pessoas não passam por aqui: a API do Jira só cria worklog no nome de quem tem o token,
// então a tela manda um CONVITE (POST /api/apontar {convidar}) por pessoa e dia, e cada uma confirma com 1 clique.
import { jiraBase, cacheClear, json } from './util.js';

const RE_ISSUE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const RE_PROJ = /^[A-Za-z][A-Za-z0-9_]*$/;
export const TF_LIMITES = {
  comentarios: 300,          // lidos da origem (mais que isso → a tela avisa e não deixa excluir)
  worklogs: 1000,
  filhos: 100,
  anexoBytes: 25 * 1024 * 1024,
  loteComentarios: 10, loteAnexos: 3, loteVinculos: 40, loteFilhos: 25, loteHoras: 10,
  historico: 15000,          // caracteres do comentário do histórico (ADF de um parágrafo por linha pesa)
};

const auth = (email, token) => 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
const txt = (v, n) => String(v == null ? '' : v).slice(0, n);
const dataHoraBR = (iso) => {
  const s = String(iso || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s.slice(0, 10);
  // o Jira devolve com o fuso da conta de serviço/pessoa; mostra a hora como veio (dd/mm/aaaa hh:mm)
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
};
const nomeDe = (u) => (u && (u.displayName || u.emailAddress)) || '—';

async function jira(base, headers, path, opts) {
  const r = await fetch(`${base}${path}`, { ...(opts || {}), headers: { ...headers, ...((opts && opts.headers) || {}) } });
  let j = null;
  const t = r.status === 204 ? '' : await r.text();
  try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
  return { ok: r.ok, status: r.status, j, t };
}
const erroJira = (r) => {
  const j = r.j || {};
  const msgs = [].concat(j.errorMessages || [], j.errors ? Object.values(j.errors) : []).filter(Boolean);
  return `Jira ${r.status}${msgs.length ? `: ${msgs.join(' ')}` : (r.t ? `: ${String(r.t).slice(0, 160)}` : '')}`.slice(0, 300);
};

// ---- ADF ----
function adfParaTexto(node) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'text') return node.text || '';
  if (node.type === 'mention') return (node.attrs && node.attrs.text) || '@alguém';
  if (node.type === 'hardBreak') return '\n';
  const filhos = (node.content || []).map(adfParaTexto);
  if (['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote'].includes(node.type)) return filhos.join('').trim() + '\n';
  return filhos.join('');
}
export function textoParaAdf(texto) {
  return {
    type: 'doc', version: 1,
    content: String(texto).split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })),
  };
}
// Os anexos embutidos no ADF (media) apontam para arquivos DA ORIGEM — que vai ser excluída. Viram um aviso em
// texto; os arquivos em si são transferidos pela etapa de anexos.
const MIDIA_BLOCO = new Set(['mediaSingle', 'mediaGroup']);
const MIDIA_INLINE = new Set(['media', 'mediaInline']);
export function adfSemMidia(node) {
  if (!node || typeof node !== 'object') return node;
  if (MIDIA_BLOCO.has(node.type)) return { type: 'paragraph', content: [{ type: 'text', text: '[📎 imagem/anexo — veja os anexos transferidos]' }] };
  if (MIDIA_INLINE.has(node.type)) return { type: 'text', text: '[📎 anexo]' };
  const out = { ...node };
  if (Array.isArray(node.content)) out.content = node.content.map(adfSemMidia).filter(Boolean);
  return out;
}
const paragrafo = (texto, forte) => ({ type: 'paragraph', content: [{ type: 'text', text: texto, ...(forte ? { marks: [{ type: 'strong' }] } : {}) }] });
// Corpo ADF = cabeçalho em negrito + (conteúdo original sem mídia).
function adfComCabecalho(cabecalho, adf, extras) {
  const corpo = adf && adf.type === 'doc' && Array.isArray(adf.content) ? adfSemMidia(adf).content : [];
  return { type: 'doc', version: 1, content: [paragrafo(cabecalho, true), ...(extras || []).map((l) => paragrafo(l)), ...corpo] };
}

// ---- leitura da origem ----
async function lerComentarios(base, headers, k) {
  const out = []; let start = 0;
  for (let i = 0; i < 10; i++) {
    const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(k)}/comment?startAt=${start}&maxResults=100&orderBy=created`);
    if (!r.ok) throw new Error(`Comentários de ${k}: ${erroJira(r)}`);
    const cs = (r.j && r.j.comments) || [];
    out.push(...cs);
    start += cs.length;
    if (!cs.length || start >= ((r.j && r.j.total) || 0) || out.length > TF_LIMITES.comentarios) break;
  }
  return out;
}
async function lerWorklogs(base, headers, k) {
  const out = []; let start = 0;
  for (let i = 0; i < 5; i++) {
    const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(k)}/worklog?startAt=${start}&maxResults=1000`);
    if (!r.ok) throw new Error(`Apontamentos de ${k}: ${erroJira(r)}`);
    const ws = (r.j && r.j.worklogs) || [];
    out.push(...ws);
    start += ws.length;
    if (!ws.length || start >= ((r.j && r.j.total) || 0) || out.length >= TF_LIMITES.worklogs) break;
  }
  return out;
}
async function lerFilhos(base, headers, k) {
  const r = await jira(base, headers, '/rest/api/3/search/jql', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jql: `parent = ${k} ORDER BY created ASC`, fields: ['summary', 'status', 'issuetype', 'project'], maxResults: TF_LIMITES.filhos + 1 }),
  });
  if (!r.ok) throw new Error(`Filhos de ${k}: ${erroJira(r)}`);
  return ((r.j && r.j.issues) || []).map((it) => {
    const f = it.fields || {}; const t = f.issuetype || {};
    return { k: it.key, resumo: txt(f.summary, 200), status: (f.status && f.status.name) || '', tipo: t.name || '',
      nivel: t.subtask ? -1 : (Number.isFinite(t.hierarchyLevel) ? t.hierarchyLevel : 0), projeto: (f.project && f.project.key) || '' };
  });
}
async function lerRemotos(base, headers, k) {
  const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(k)}/remotelink`);
  return r.ok && Array.isArray(r.j) ? r.j : [];
}
// O que NÃO vai na transferência (a tela lista): prioridade/componentes/versões/campos personalizados preenchidos.
function naoVaiDe(f) {
  const out = [];
  if (f.components && f.components.length) out.push(`componentes (${f.components.map((c) => c.name).join(', ')})`);
  if (f.fixVersions && f.fixVersions.length) out.push(`versões (${f.fixVersions.map((c) => c.name).join(', ')})`);
  if (f.timeoriginalestimate) out.push('estimativa original');
  if (f.security) out.push('nível de segurança');
  const cf = Object.entries(f).filter(([k, v]) => /^customfield_/.test(k) && v != null && !(Array.isArray(v) && !v.length) && v !== '').length;
  if (cf) out.push(`${cf} campo(s) personalizado(s) preenchido(s) (ex.: campos AMS de causa raiz/produto/processo)`);
  return out;
}
// Marcadores lidos do DESTINO para não escrever duas vezes.
const escRx = (t) => String(t).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
function idsMarcados(textos, rotulo, k) {
  const rx = new RegExp(`${rotulo} ${escRx(k)} #(\\d+)`, 'g'); const set = new Set();
  textos.forEach((t) => { let m; while ((m = rx.exec(t))) set.add(m[1]); });
  return set;
}
async function marcasDoDestino(base, headers, k, d) {
  const [coms, wls] = await Promise.all([lerComentarios(base, headers, d), lerWorklogs(base, headers, d)]);
  const tc = coms.map((c) => adfParaTexto(c.body)); const tw = wls.map((w) => adfParaTexto(w.comment));
  return {
    com: idsMarcados(tc, 'comentário copiado de', k),
    wl: idsMarcados(tw, 'Transferido de', k),
    hist: tc.some((t) => t.includes(`🕓 Histórico de ${k} —`)),
    cab: tc.some((t) => t.includes(`📦 Transferido de ${k} —`)),
  };
}
async function lerChangelog(base, headers, k, it) {
  const cl = it.changelog || {};
  let hs = cl.histories || [];
  if ((cl.total || 0) > hs.length) {
    hs = []; let start = 0;
    for (let i = 0; i < 10; i++) {
      const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(k)}/changelog?startAt=${start}&maxResults=100`);
      if (!r.ok) break;
      const v = (r.j && r.j.values) || [];
      hs.push(...v); start += v.length;
      if (!v.length || (r.j && r.j.isLast)) break;
    }
  }
  return hs;
}
const CAMPOS_HIST = { status: 'Status', assignee: 'Responsável', resolution: 'Resolução', priority: 'Prioridade', duedate: 'Vencimento',
  issuetype: 'Tipo', project: 'Projeto', summary: 'Resumo', Key: 'Chave', parent: 'Pai', labels: 'Rótulos', 'Fix Version': 'Versão' };
export function historicoDe(it, hs) {
  const f = it.fields || {};
  const ev = [];
  hs.forEach((h) => (h.items || []).forEach((x) => {
    const campo = CAMPOS_HIST[x.field] || CAMPOS_HIST[x.fieldId];
    if (!campo) return;
    ev.push({ quando: h.created || '', quem: nomeDe(h.author), campo, de: txt(x.fromString, 120), para: txt(x.toString, 120) });
  }));
  ev.sort((a, b) => String(a.quando).localeCompare(String(b.quando)));
  const linhas = [
    `🕓 Histórico de ${it.key} — ${f.summary || ''} (copiado na transferência; o ticket original foi excluído)`,
    `${dataHoraBR(f.created)} · criado por ${nomeDe(f.reporter || f.creator)} · ${(f.issuetype && f.issuetype.name) || ''} em ${(f.project && f.project.key) || ''}`,
    ...ev.map((e) => `${dataHoraBR(e.quando)} · ${e.quem}: ${e.campo} ${e.de || '(vazio)'} → ${e.para || '(vazio)'}`),
  ];
  return { eventos: ev, texto: linhas.join('\n').slice(0, TF_LIMITES.historico) };
}
function vinculoDe(l) {
  const out = !!l.outwardIssue; const outra = l.outwardIssue || l.inwardIssue || {};
  const t = l.type || {};
  return { id: String(l.id), tipoId: String(t.id || ''), tipo: t.name || '', rotulo: (out ? t.outward : t.inward) || t.name || '',
    lado: out ? 'out' : 'in', k: outra.key || '', resumo: txt(outra.fields && outra.fields.summary, 160) };
}
function fichaDe(it) {
  const f = it.fields || {}; const t = f.issuetype || {};
  return {
    k: it.key, id: String(it.id || ''), resumo: f.summary || '', tipo: t.name || '', tipoId: String(t.id || ''),
    nivel: t.subtask ? -1 : (Number.isFinite(t.hierarchyLevel) ? t.hierarchyLevel : 0), ehSub: !!t.subtask,
    projeto: (f.project && f.project.key) || '', projetoNome: (f.project && f.project.name) || '',
    status: (f.status && f.status.name) || '', criado: f.created || '', relator: nomeDe(f.reporter),
    resp: f.assignee ? nomeDe(f.assignee) : '', respId: (f.assignee && f.assignee.accountId) || '',
    venc: f.duedate || '', labels: Array.isArray(f.labels) ? f.labels.slice(0, 20) : [],
    pai: f.parent ? f.parent.key : '',
  };
}

async function eu(base, headers) {
  const r = await jira(base, headers, '/rest/api/3/myself');
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Identificação inválida — confira o e-mail e o token de API do Jira.'), { status: 401 });
  if (!r.ok) throw new Error(erroJira(r));
  return { accountId: (r.j && r.j.accountId) || '', nome: nomeDe(r.j) };
}

async function ler(base, headers, b) {
  const k = String(b.origem || '').trim().toUpperCase();
  if (!RE_ISSUE.test(k)) return { status: 400, corpo: { erro: 'Ticket de origem inválido.' } };
  const me = await eu(base, headers);
  const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(k)}?fields=*all&expand=changelog`);
  if (r.status === 404) return { status: 200, corpo: { ok: false, erro: `${k} não existe ou você não tem acesso a ele.` } };
  if (!r.ok) return { status: 200, corpo: { ok: false, erro: erroJira(r) } };
  const it = r.j; const f = it.fields || {};
  const [coms, wls, filhos, hs, rem] = await Promise.all([lerComentarios(base, headers, k), lerWorklogs(base, headers, k), lerFilhos(base, headers, k), lerChangelog(base, headers, k, it), lerRemotos(base, headers, k)]);
  const hist = historicoDe(it, hs);
  return { status: 200, corpo: {
    ok: true,
    me,
    o: { ...fichaDe(it), desc: adfParaTexto(f.description).trim().slice(0, 1500) },
    comentarios: coms.slice(0, TF_LIMITES.comentarios).map((c) => ({ id: String(c.id), autor: nomeDe(c.author), quando: c.created || '',
      previa: adfParaTexto(c.body).trim().slice(0, 160), restrito: !!c.visibility })),
    comentariosMais: coms.length > TF_LIMITES.comentarios,
    anexos: (f.attachment || []).map((a) => ({ id: String(a.id), nome: a.filename || '', bytes: Number(a.size) || 0, mime: a.mimeType || '',
      autor: nomeDe(a.author), quando: a.created || '', grande: (Number(a.size) || 0) > TF_LIMITES.anexoBytes })),
    vinculos: (f.issuelinks || []).map(vinculoDe).filter((l) => l.k),
    filhos: filhos.slice(0, TF_LIMITES.filhos),
    filhosMais: filhos.length > TF_LIMITES.filhos,
    remotos: rem.map((x) => ({ id: String(x.id), titulo: txt((x.object || {}).title, 160), url: txt((x.object || {}).url, 400) })),
    naoVai: naoVaiDe(f),
    worklogs: wls.map((w) => ({ id: String(w.id), autorId: (w.author && w.author.accountId) || '', autor: nomeDe(w.author),
      ativo: !(w.author && w.author.active === false),
      inicio: w.started || '', dia: String(w.started || '').slice(0, 10), seg: Number(w.timeSpentSeconds) || 0,
      comentario: adfParaTexto(w.comment).trim().slice(0, 200) })),
    worklogsMais: wls.length >= TF_LIMITES.worklogs,
    historico: { n: hist.eventos.length, texto: hist.texto },
    limites: TF_LIMITES,
  } };
}

async function conferir(base, headers, b) {
  const k = String(b.destino || '').trim().toUpperCase();
  if (!RE_ISSUE.test(k)) return { status: 400, corpo: { erro: 'Ticket de destino inválido.' } };
  const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(k)}?fields=summary,issuetype,project,status,parent,assignee,reporter,created`);
  if (r.status === 404) return { status: 200, corpo: { ok: false, erro: `${k} não existe ou você não tem acesso a ele.` } };
  if (!r.ok) return { status: 200, corpo: { ok: false, erro: erroJira(r) } };
  return { status: 200, corpo: { ok: true, d: fichaDe(r.j) } };
}

// Cabeçalho que abre a transferência no destino (no ticket novo: a descrição; no existente: um comentário).
function cabecalhoOrigem(o, me) {
  return {
    titulo: `📦 Transferido de ${o.k} — ${o.resumo}`,
    linhas: [
      `${o.tipo} · status ${o.status} · projeto ${o.projeto}${o.projetoNome ? ` (${o.projetoNome})` : ''}`,
      `Criado em ${dataHoraBR(o.criado)} por ${o.relator}${o.resp ? ` · responsável: ${o.resp}` : ''}${o.venc ? ` · vencimento ${o.venc}` : ''}`,
      `Transferido por ${me.nome} pelo painel Jira Insights (🔗 Transferir ticket). ${o.k} foi excluído depois da cópia.`,
      'Descrição original:',
    ],
  };
}

async function destino(base, headers, b) {
  const k = String(b.origem || '').trim().toUpperCase();
  if (!RE_ISSUE.test(k)) return { status: 400, corpo: { erro: 'Ticket de origem inválido.' } };
  const me = await eu(base, headers);
  const ro = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(k)}?fields=summary,description,issuetype,project,status,created,reporter,assignee,duedate,labels,parent,priority`);
  if (!ro.ok) return { status: 200, corpo: { ok: false, erro: `Origem ${k}: ${erroJira(ro)}` } };
  const o = fichaDe(ro.j); const desc = (ro.j.fields || {}).description;
  const cab = cabecalhoOrigem(o, me);
  if (b.modo === 'criar') {
    const projeto = String(b.projeto || '').trim().toUpperCase();
    const tipoId = String(b.tipoId || '').trim();
    const resumo = txt(String(b.resumo || o.resumo || k).trim(), 255);
    if (!RE_PROJ.test(projeto)) return { status: 400, corpo: { erro: 'Projeto de destino inválido.' } };
    if (!/^\d+$/.test(tipoId)) return { status: 400, corpo: { erro: 'Tipo do ticket inválido.' } };
    const base0 = { project: { key: projeto }, issuetype: { id: tipoId }, summary: resumo, description: adfComCabecalho(cab.titulo, desc, cab.linhas) };
    // Leva junto o que for possível (responsável, vencimento, rótulos); se o projeto recusar algum, cria sem eles.
    // Já criado por uma tentativa anterior (resposta perdida, aba recarregada)? A propriedade tft.origem diz.
    const ja = await jira(base, headers, '/rest/api/3/search/jql', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql: `issue.property[tft].origem = "${k}"`, fields: ['summary'], maxResults: 1 }) });
    const achado = ja.ok && ja.j && (ja.j.issues || [])[0];
    if (achado && achado.key) return { status: 200, corpo: { ok: true, destino: achado.key, criado: true, reaproveitado: true } };
    const pri = (ro.j.fields || {}).priority;
    const extras = { ...(o.respId ? { assignee: { accountId: o.respId } } : {}), ...(o.venc ? { duedate: o.venc } : {}), ...(o.labels.length ? { labels: o.labels } : {}), ...(pri && pri.id ? { priority: { id: pri.id } } : {}) };
    let rc = await jira(base, headers, '/rest/api/3/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { ...base0, ...extras } }) });
    let semExtras = false;
    if (rc.status === 400 && Object.keys(extras).length) {
      semExtras = true;
      rc = await jira(base, headers, '/rest/api/3/issue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: base0 }) });
    }
    if (rc.status === 401 || rc.status === 403) return { status: 200, corpo: { ok: false, erro: `Sem permissão para criar no projeto ${projeto}.` } };
    if (!rc.ok || !(rc.j && rc.j.key)) return { status: 200, corpo: { ok: false, erro: `Falha ao criar o destino: ${erroJira(rc)}` } };
    await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(rc.j.key)}/properties/tft`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origem: k }) });
    cacheClear('reuvinc:'); cacheClear('venc:');
    return { status: 200, corpo: { ok: true, destino: rc.j.key, criado: true, semExtras } };
  }
  const d = String(b.destino || '').trim().toUpperCase();
  if (!RE_ISSUE.test(d)) return { status: 400, corpo: { erro: 'Ticket de destino inválido.' } };
  if (d === k) return { status: 200, corpo: { ok: false, erro: 'O destino não pode ser o próprio ticket de origem.' } };
  const rd = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(d)}?fields=parent`);
  if (!rd.ok) return { status: 200, corpo: { ok: false, erro: `Destino ${d}: ${erroJira(rd)}` } };
  if (((rd.j.fields || {}).parent || {}).key === k) return { status: 200, corpo: { ok: false, erro: `${d} é filho de ${k} — seria excluído junto. Escolha outro destino.` } };
  if ((await marcasDoDestino(base, headers, k, d)).cab) return { status: 200, corpo: { ok: true, destino: d, criado: false, reaproveitado: true } };
  const rc = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(d)}/comment`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: adfComCabecalho(cab.titulo, desc, cab.linhas) }),
  });
  if (rc.status === 401 || rc.status === 403) return { status: 200, corpo: { ok: false, erro: `Sem permissão para comentar em ${d}.` } };
  if (!rc.ok) return { status: 200, corpo: { ok: false, erro: `Falha ao registrar a transferência em ${d}: ${erroJira(rc)}` } };
  return { status: 200, corpo: { ok: true, destino: d, criado: false } };
}

const idsDe = (b, max) => [...new Set((Array.isArray(b.ids) ? b.ids : []).map((x) => String(x || '').trim()).filter((x) => /^\d+$/.test(x)))].slice(0, max);
function parOrigemDestino(b) {
  const k = String(b.origem || '').trim().toUpperCase(); const d = String(b.destino || '').trim().toUpperCase();
  if (!RE_ISSUE.test(k) || !RE_ISSUE.test(d) || k === d) return null;
  return { k, d };
}

async function comentarios(base, headers, b) {
  const p = parOrigemDestino(b); if (!p) return { status: 400, corpo: { erro: 'Origem/destino inválidos.' } };
  const feitos = []; const erros = {};
  const ja = (await marcasDoDestino(base, headers, p.k, p.d)).com;
  for (const id of idsDe(b, TF_LIMITES.loteComentarios)) {
    if (ja.has(id)) { feitos.push(id); continue; }
    const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.k)}/comment/${id}`);
    if (r.status === 404) { feitos.push(id); continue; }            // apagado na origem depois do inventário: nada a levar
    if (!r.ok) { erros[id] = erroJira(r); continue; }
    const c = r.j || {};
    const corpo = { body: adfComCabecalho(`💬 ${nomeDe(c.author)} em ${dataHoraBR(c.created)} (comentário copiado de ${p.k} #${id})`, c.body) };
    if (c.visibility && c.visibility.type && c.visibility.value) corpo.visibility = { type: c.visibility.type, value: c.visibility.value };
    const w = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.d)}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if (w.ok) feitos.push(id); else erros[id] = erroJira(w);
  }
  return { status: 200, corpo: { ok: true, feitos, erros } };
}

async function anexos(base, headers, b) {
  const p = parOrigemDestino(b); if (!p) return { status: 400, corpo: { erro: 'Origem/destino inválidos.' } };
  const feitos = []; const erros = {};
  const rd = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.d)}?fields=attachment`);
  if (!rd.ok) return { status: 200, corpo: { ok: false, erro: `Destino ${p.d}: ${erroJira(rd)}` } };
  const noDestino = new Set((((rd.j || {}).fields || {}).attachment || []).map((a) => `${a.filename}|${a.size}`));
  for (const id of idsDe(b, TF_LIMITES.loteAnexos)) {
    const m = await jira(base, headers, `/rest/api/3/attachment/${id}`);
    if (m.status === 404) { feitos.push(id); continue; }
    if (!m.ok) { erros[id] = erroJira(m); continue; }
    const meta = m.j || {};
    if (noDestino.has(`${meta.filename}|${meta.size}`)) { feitos.push(id); continue; }   // já foi numa tentativa anterior
    if ((Number(meta.size) || 0) > TF_LIMITES.anexoBytes) { erros[id] = `Arquivo de ${Math.round(meta.size / 1048576)} MB — acima do limite de ${TF_LIMITES.anexoBytes / 1048576} MB da transferência. Baixe e anexe à mão.`; continue; }
    // redirect=false: o Jira entrega o conteúdo direto (sem depender de como o fetch trata o Authorization num redirect).
    const rc = await fetch(`${base}/rest/api/3/attachment/content/${id}?redirect=false`, { headers: { Authorization: headers.Authorization } });
    if (!rc.ok) { erros[id] = `Download do anexo: Jira ${rc.status}`; continue; }
    const buf = Buffer.from(await rc.arrayBuffer());
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: meta.mimeType || 'application/octet-stream' }), meta.filename || `anexo-${id}`);
    const up = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(p.d)}/attachments`, {
      method: 'POST', headers: { Authorization: headers.Authorization, Accept: 'application/json', 'X-Atlassian-Token': 'no-check' }, body: fd,
    });
    if (up.ok) feitos.push(id); else erros[id] = `Envio do anexo: Jira ${up.status} ${(await up.text()).slice(0, 160)}`;
  }
  return { status: 200, corpo: { ok: true, feitos, erros } };
}

async function vinculos(base, headers, b) {
  const p = parOrigemDestino(b); if (!p) return { status: 400, corpo: { erro: 'Origem/destino inválidos.' } };
  // Relê os vínculos da ORIGEM (não confia no que a tela mandou além dos ids).
  const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.k)}?fields=issuelinks`);
  if (!r.ok) return { status: 200, corpo: { ok: false, erro: erroJira(r) } };
  const mapa = {}; (((r.j || {}).fields || {}).issuelinks || []).forEach((l) => { mapa[String(l.id)] = vinculoDe(l); });
  const feitos = []; const erros = {};
  for (const id of idsDe(b, TF_LIMITES.loteVinculos)) {
    const v = mapa[id];
    if (!v) { feitos.push(id); continue; }                       // removido da origem depois do inventário: nada a refazer
    if (v.k === p.d) { feitos.push(id); continue; }          // ligava origem ↔ destino: deixa de fazer sentido
    // No ticket, "outwardIssue" = o OUTRO está na ponta de saída, então a origem é a inwardIssue — e o destino herda o lado.
    const corpo = { type: { id: v.tipoId }, inwardIssue: { key: v.lado === 'out' ? p.d : v.k }, outwardIssue: { key: v.lado === 'out' ? v.k : p.d } };
    const w = await jira(base, headers, '/rest/api/3/issueLink', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    if (w.ok) feitos.push(id); else erros[id] = erroJira(w);
  }
  return { status: 200, corpo: { ok: true, feitos, erros } };
}

// Remote links (Confluence, o issue do GitHub do 🐞 Reportar…): todos de uma vez, sem repetir URL que o destino já tem.
async function remotos(base, headers, b) {
  const p = parOrigemDestino(b); if (!p) return { status: 400, corpo: { erro: 'Origem/destino inválidos.' } };
  const [ro, rd] = await Promise.all([lerRemotos(base, headers, p.k), lerRemotos(base, headers, p.d)]);
  const ja = new Set(rd.map((x) => (x.object || {}).url));
  const erros = {}; let n = 0;
  for (const x of ro) {
    const obj = x.object || {}; if (!obj.url || ja.has(obj.url)) continue;
    const w = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.d)}/remotelink`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object: { url: obj.url, title: obj.title || obj.url, ...(obj.summary ? { summary: obj.summary } : {}), ...(obj.icon ? { icon: obj.icon } : {}) }, ...(x.relationship ? { relationship: x.relationship } : {}) }) });
    if (w.ok) n += 1; else erros[String(x.id)] = erroJira(w);
  }
  return { status: 200, corpo: { ok: !Object.keys(erros).length, n, erros, ...(Object.keys(erros).length ? { erro: Object.values(erros)[0] } : {}) } };
}

async function filhosMover(base, headers, b) {
  const p = parOrigemDestino(b); if (!p) return { status: 400, corpo: { erro: 'Origem/destino inválidos.' } };
  const pedidas = [...new Set((Array.isArray(b.chaves) ? b.chaves : []).map((x) => String(x || '').trim().toUpperCase()).filter((x) => RE_ISSUE.test(x)))].slice(0, TF_LIMITES.loteFilhos);
  const feitos = []; const erros = {};
  for (const c of pedidas) {
    const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(c)}?fields=parent`);
    if (!r.ok) { erros[c] = erroJira(r); continue; }
    const pai = (((r.j || {}).fields || {}).parent || {}).key || '';
    if (pai === p.d) { feitos.push(c); continue; }
    if (pai !== p.k) { erros[c] = `${c} não é mais filho de ${p.k}`; continue; }
    const w = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(c)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { parent: { key: p.d } } }) });
    if (w.ok) feitos.push(c); else erros[c] = erroJira(w);
  }
  return { status: 200, corpo: { ok: true, feitos, erros } };
}

async function historico(base, headers, b) {
  const p = parOrigemDestino(b); if (!p) return { status: 400, corpo: { erro: 'Origem/destino inválidos.' } };
  if ((await marcasDoDestino(base, headers, p.k, p.d)).hist) return { status: 200, corpo: { ok: true, ja: true } };
  // Remonta do changelog da origem (o texto não vem da tela).
  const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.k)}?fields=summary,created,reporter,creator,issuetype,project&expand=changelog`);
  if (!r.ok) return { status: 200, corpo: { ok: false, erro: erroJira(r) } };
  const hs = await lerChangelog(base, headers, p.k, r.j);
  const h = historicoDe(r.j, hs);
  const w = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.d)}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: textoParaAdf(h.texto) }) });
  if (!w.ok) return { status: 200, corpo: { ok: false, erro: erroJira(w) } };
  return { status: 200, corpo: { ok: true } };
}

// Só os worklogs DA PRÓPRIA PESSOA: a API cria o worklog no nome de quem tem o token, então copiar o de um
// colega o colocaria nas horas de quem transfere. Os dos colegas vão por convite (tela → /api/apontar).
async function horas(base, headers, b) {
  const p = parOrigemDestino(b); if (!p) return { status: 400, corpo: { erro: 'Origem/destino inválidos.' } };
  const me = await eu(base, headers);
  const feitos = []; const erros = {};
  const ja = (await marcasDoDestino(base, headers, p.k, p.d)).wl;
  for (const id of idsDe(b, TF_LIMITES.loteHoras)) {
    if (ja.has(id)) { feitos.push(id); continue; }
    const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.k)}/worklog/${id}`);
    if (r.status === 404) { feitos.push(id); continue; }
    if (!r.ok) { erros[id] = erroJira(r); continue; }
    const w = r.j || {};
    if (((w.author || {}).accountId || '') !== me.accountId) { erros[id] = 'apontamento de outra pessoa — vai por convite'; continue; }
    const orig = adfParaTexto(w.comment).trim();
    const corpo = { timeSpentSeconds: Number(w.timeSpentSeconds) || 0, started: w.started,
      comment: textoParaAdf(`⏩ Transferido de ${p.k} #${id}${orig ? ` — ${orig}` : ''}`.slice(0, 2000)) };
    const c = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.d)}/worklog?adjustEstimate=leave&notifyUsers=false`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    if (c.ok) feitos.push(id); else erros[id] = erroJira(c);
  }
  if (feitos.length) { cacheClear('tempo:'); cacheClear('venc:'); }
  return { status: 200, corpo: { ok: true, feitos, erros } };
}

// Conta de serviço (só leitura): para saber se existe na origem algo que a PESSOA não enxerga (comentário ou
// apontamento restrito a um papel/grupo) — o DELETE apagaria junto sem ninguém ter visto.
function authSvc() {
  const e = process.env.JIRA_EMAIL, t = process.env.JIRA_API_TOKEN;
  return e && t ? 'Basic ' + Buffer.from(`${e}:${t}`).toString('base64') : '';
}
async function excluir(base, headers, b) {
  const p = parOrigemDestino(b); if (!p) return { status: 400, corpo: { erro: 'Origem/destino inválidos.' } };
  const nao = (erro, extra) => ({ status: 200, corpo: { ok: false, excluida: false, erro: `${erro} — ${p.k} NÃO foi excluído.`, ...(extra || {}) } });
  // O destino tem que existir de verdade antes de apagar a origem.
  const rd = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.d)}?fields=summary`);
  if (!rd.ok) return nao(`O destino ${p.d} não respondeu (${erroJira(rd)})`);
  // Filhos: a busca JQL (pode atrasar) E o campo subtasks do próprio ticket (imediato).
  const ro = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.k)}?fields=subtasks,attachment,issuelinks`);
  if (!ro.ok) return nao(`Origem: ${erroJira(ro)}`);
  const fo = ro.j.fields || {};
  const filhos = [...new Set([...(await lerFilhos(base, headers, p.k)).map((f) => f.k), ...(fo.subtasks || []).map((x) => x.key)])];
  if (filhos.length) return nao(`${p.k} ainda tem ${filhos.length} filho(s) (${filhos.slice(0, 5).join(', ')}) que seriam excluídos junto; mova-os antes`);
  // Nada novo desde o inventário: a tela manda TODOS os ids que viu (vistos), copiados ou não por escolha dela.
  const v = b.vistos || {};
  const viu = (k) => new Set((Array.isArray(v[k]) ? v[k] : []).map(String));
  const [coms, wls] = await Promise.all([lerComentarios(base, headers, p.k), lerWorklogs(base, headers, p.k)]);
  const novos = [
    ...coms.filter((c) => !viu('com').has(String(c.id))).map(() => 'comentário'),
    ...wls.filter((w) => !viu('wl').has(String(w.id))).map(() => 'apontamento'),
    ...(fo.attachment || []).filter((a) => !viu('anx').has(String(a.id))).map(() => 'anexo'),
    ...(fo.issuelinks || []).filter((l) => !viu('vin').has(String(l.id))).map(() => 'vínculo'),
  ];
  if (novos.length) {
    const cont = {}; novos.forEach((x) => { cont[x] = (cont[x] || 0) + 1; });
    return nao(`Apareceu conteúdo novo em ${p.k} depois que a transferência começou (${Object.entries(cont).map(([x, n]) => `${n} ${x}(s)`).join(', ')}). Feche e transfira de novo — o que já foi copiado não se repete`, { novos: cont });
  }
  const sv = authSvc();
  if (sv) {
    const hs = { Authorization: sv, Accept: 'application/json' };
    try {
      const [c2, w2] = await Promise.all([lerComentarios(base, hs, p.k), lerWorklogs(base, hs, p.k)]);
      const ocultos = c2.length - coms.length + w2.length - wls.length;
      if (ocultos > 0) return nao(`${p.k} tem ${ocultos} comentário(s)/apontamento(s) restritos que você não enxerga — eles seriam apagados sem cópia. Peça a quem tem acesso para transferir`);
    } catch (e) { /* conta de serviço indisponível: segue só com a visão da pessoa */ }
  }
  const r = await jira(base, headers, `/rest/api/3/issue/${encodeURIComponent(p.k)}?deleteSubtasks=false`, { method: 'DELETE' });
  cacheClear('reunioes:'); cacheClear('reuvinc:'); cacheClear('atividade:'); cacheClear('venc:'); cacheClear('tempo:');
  if (r.status === 204) return { status: 200, corpo: { ok: true, excluida: true } };
  if (r.status === 403) return { status: 200, corpo: { ok: false, excluida: false, permissao: true, erro: `Tudo foi copiado para ${p.d}, mas você não tem a permissão "Excluir itens" no projeto de ${p.k} — peça a um administrador do projeto para excluí-lo.` } };
  return { status: 200, corpo: { ok: false, excluida: false, erro: `Tudo foi copiado para ${p.d}, mas a exclusão de ${p.k} falhou (${erroJira(r)}).` } };
}

const ETAPAS = { ler, conferir, destino, comentarios, anexos, vinculos, remotos, filhos: filhosMover, historico, horas, excluir };

export async function transferir(req, res, b) {
  const email = String(b.email || '').trim(); const token = String(b.token || '').trim();
  if (!email || !email.includes('@') || !token) return json(res, 400, { erro: 'Identifique-se (e-mail + token de API do Jira).' });
  const fn = ETAPAS[String(b.transf || '')];
  if (!fn) return json(res, 400, { erro: 'Etapa da transferência desconhecida.' });
  const headers = { Authorization: auth(email, token), Accept: 'application/json' };
  try {
    const { status, corpo } = await fn(jiraBase(), headers, b);
    return json(res, status, corpo);
  } catch (e) {
    return json(res, e && e.status === 401 ? 401 : 200, { ok: false, erro: String((e && e.message) || e).slice(0, 300) });
  }
}
