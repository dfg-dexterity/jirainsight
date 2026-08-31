// POST /api/criar — cria tickets do Jira EM LOTE, com as credenciais da própria
// pessoa (mesmo modelo do /api/apontar): o repórter é quem criou, e as permissões
// do Jira valem para cada um. Usa o endpoint bulk do Jira (50 por requisição).
//
// Corpo: { itens:[{projeto, tipoId, resumo, descricao?, respId?, paiKey?}], email, token }
// Resposta: { ok, criados:[{indice,key,resumo}], erros:[{indice,erro}] }
import { jiraBase, cacheClear, cacheGet, cacheSetTTL, json, jiraUsuariosAtivos } from './_lib/util.js';

// Campo "Departamento Dexterity" (tarefas avulsas/TAD): o id do custom field é
// resolvido pelo NOME via createmeta do projeto (cache 30 min). Se o campo não
// existir no projeto, o ticket é criado sem ele e a resposta traz um aviso.
async function campoDepartamento(base, headers, projeto) {
  const ck = `criar:depto:${projeto}`;
  const c = cacheGet(ck);
  if (c !== null && c !== undefined) return c;
  let out = null;
  try {
    const r = await fetch(`${base}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projeto)}&expand=projects.issuetypes.fields`, { headers });
    if (r.ok) {
      const j = await r.json();
      const tipos = (j.projects && j.projects[0] && j.projects[0].issuetypes) || [];
      for (const t of tipos) {
        for (const [fid, f] of Object.entries(t.fields || {})) {
          if (/departamento\s*dexterity/i.test(f.name || '')) {
            out = { id: fid, tipo: (f.schema && f.schema.type) || 'option',
              valores: (f.allowedValues || []).map((v) => ({ id: v.id, value: v.value || v.name || '' })) };
            break;
          }
        }
        if (out) break;
      }
    }
  } catch (e) { /* segue sem o campo */ }
  return cacheSetTTL(ck, out, 30);
}

// "AMS | Consultoria > Cliente" (campo CASCATA): resolvido pelo nome via createmeta,
// como o Departamento. O valor vai como { id: consultoria, child: { id: cliente } }.
async function campoConsultoriaCliente(base, headers, projeto) {
  const ck = `criar:conscli:${projeto}`;
  const c = cacheGet(ck);
  if (c !== null && c !== undefined) return c;
  let out = null;
  try {
    const r = await fetch(`${base}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projeto)}&expand=projects.issuetypes.fields`, { headers });
    if (r.ok) {
      const j = await r.json();
      const tipos = (j.projects && j.projects[0] && j.projects[0].issuetypes) || [];
      for (const t of tipos) {
        for (const [fid, f] of Object.entries(t.fields || {})) {
          const cascata = f.schema && (f.schema.type === 'option-with-child' || /cascadingselect/.test(f.schema.custom || ''));
          if (cascata && /consultoria/i.test(f.name || '')) { out = { id: fid }; break; }
        }
        if (out) break;
      }
    }
  } catch (e) { /* segue sem o campo */ }
  return cacheSetTTL(ck, out, 30);
}

const RE_PROJ = /^[A-Za-z][A-Za-z0-9_]*$/;
const RE_ISSUE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const MAX_ITENS = 100;

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

// Texto simples -> ADF (um parágrafo por linha).
function adf(texto) {
  const linhas = String(texto).split('\n');
  return {
    type: 'doc',
    version: 1,
    content: linhas.map((l) => ({
      type: 'paragraph',
      content: l ? [{ type: 'text', text: l }] : [],
    })),
  };
}

// Valida um item e devolve a mensagem de erro ('' = ok).
function validaItem(it) {
  if (!it || typeof it !== 'object') return 'Item inválido.';
  if (!RE_PROJ.test(String(it.projeto || ''))) return 'Projeto inválido.';
  if (!/^\d+$/.test(String(it.tipoId || ''))) return 'Tipo de ticket inválido.';
  const resumo = String(it.resumo || '').trim();
  if (!resumo) return 'Resumo vazio.';
  if (resumo.length > 255) return 'Resumo com mais de 255 caracteres.';
  if (it.paiKey && !RE_ISSUE.test(String(it.paiKey))) return 'Ticket pai inválido.';
  if (it.consultoriaId && !/^\d{1,12}$/.test(String(it.consultoriaId))) return 'Consultoria inválida.';
  if (it.clienteId && !/^\d{1,12}$/.test(String(it.clienteId))) return 'Cliente inválido.';
  if (it.descricao && String(it.descricao).length > 30000) return 'Descrição longa demais.';
  // Padrões do lote (opcionais): estimativa Jira (1w 2d 4h 30m), vencimento ISO, labels sem espaço.
  if (it.estimativa && !/^\s*\d+\s*[wdhm](\s+\d+\s*[wdhm])*\s*$/i.test(String(it.estimativa))) {
    return 'Estimativa inválida — use o formato do Jira: 4h, 2d, 1w 2d…';
  }
  if (it.venc && !/^\d{4}-\d{2}-\d{2}$/.test(String(it.venc))) return 'Vencimento inválido (use AAAA-MM-DD).';
  if (it.labels != null) {
    if (!Array.isArray(it.labels) || it.labels.length > 10) return 'Labels inválidas (máx. 10).';
    if (it.labels.some((l) => !/^\S{1,60}$/.test(String(l)))) return 'Labels não podem ter espaços (máx. 60 caracteres).';
  }
  return '';
}

// Feedback da tela de Ajuda (Dúvida/Sugestão/Bug): cria um ISSUE no GitHub do
// projeto usando um token de serviço (não usa o Jira). Consolidado aqui para
// respeitar o limite de 12 Serverless Functions do plano Hobby.
// Env: GITHUB_TOKEN (issues:write) e GITHUB_ISSUES_REPO (owner/repo).
const FB_TIPOS = {
  duvida: { label: 'dúvida', pref: 'Dúvida' },
  sugestao: { label: 'sugestão', pref: 'Sugestão' },
  bug: { label: 'bug', pref: 'Bug' },
};
async function criaFeedbackGitHub(res, b) {
  const token = (process.env.GITHUB_TOKEN || process.env.GH_FEEDBACK_TOKEN || '').trim();
  const repo = (process.env.GITHUB_ISSUES_REPO || 'dfg-dexterity/jirainsight').trim();
  if (!token) {
    return json(res, 200, { ok: false, configurado: false, erro: 'Integração com o GitHub não configurada. Defina GITHUB_TOKEN na Vercel.' });
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return json(res, 200, { ok: false, erro: 'GITHUB_ISSUES_REPO inválido (use owner/repo).' });
  }
  const t = FB_TIPOS[b.tipo] || FB_TIPOS.sugestao;
  const titulo = String(b.titulo || '').trim();
  if (!titulo) return json(res, 400, { ok: false, erro: 'Dê um título.' });
  const detalhes = String(b.detalhes || '').trim().slice(0, 20000);
  const rep = (b.reporter && typeof b.reporter === 'object') ? b.reporter : {};
  const nome = String(rep.nome || '').trim().slice(0, 120);
  const email = String(rep.email || '').trim().slice(0, 160);
  const corpo = [
    detalhes || '_(sem detalhes)_',
    '',
    '---',
    `**Tipo:** ${t.pref}`,
    (nome || email) ? `**Reportado por:** ${nome}${email ? ` (${email})` : ''}` : '',
    '**Origem:** painel Insights de Uso (Jira + Clockwork) — tela de Ajuda',
  ].filter(Boolean).join('\n');
  const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'jirainsight-feedback',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ title: `${t.pref}: ${titulo}`.slice(0, 250), body: corpo, labels: [t.label] }),
  });
  let data = {};
  try { data = await r.json(); } catch (e) { /* sem corpo */ }
  if (!r.ok) {
    return json(res, 200, { ok: false, erro: `GitHub ${r.status}: ${String(data.message || '').slice(0, 200)}` });
  }
  return json(res, 200, { ok: true, numero: data.number, url: data.html_url });
}

// ---- Edição EM MASSA (grade pós-criação estilo planilha): data limite e/ou
// responsável de vários tickets de uma vez, com o token da própria pessoa.
// Corpo: { editar:1, itens:[{key, venc?, respId?}], email, token }
//   - 'venc' presente e vazio  -> LIMPA a data limite; 'AAAA-MM-DD' -> define.
//   - 'respId' presente e vazio -> REMOVE o responsável; accountId -> define.
// Resposta: { ok, resultados:[{key, ok, erro?}] }
const RE_ACC = /^[\w:.-]{1,128}$/;
async function editaLote(res, b, base, headers) {
  const itens = Array.isArray(b.itens) ? b.itens : [];
  if (!itens.length) return json(res, 400, { erro: 'Nenhum ticket para alterar.' });
  if (itens.length > MAX_ITENS) return json(res, 400, { erro: `Máximo de ${MAX_ITENS} tickets por vez.` });
  for (const it of itens) {
    if (!it || !RE_ISSUE.test(String(it.key || ''))) return json(res, 400, { erro: `Ticket inválido: ${String((it && it.key) || '?').slice(0, 30)}` });
    if ('venc' in it && it.venc !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(it.venc))) {
      return json(res, 400, { erro: `Data limite inválida em ${it.key} (use AAAA-MM-DD).` });
    }
    if ('respId' in it && it.respId !== '' && !RE_ACC.test(String(it.respId))) {
      return json(res, 400, { erro: `Responsável inválido em ${it.key}.` });
    }
    if (!('venc' in it) && !('respId' in it)) return json(res, 400, { erro: `Nada para alterar em ${it.key}.` });
  }
  const resultados = [];
  // Lotes de 5 em paralelo — gentil com o rate limit do Jira.
  for (let i = 0; i < itens.length; i += 5) {
    await Promise.all(itens.slice(i, i + 5).map(async (it) => {
      const key = String(it.key).toUpperCase();
      const fields = {};
      if ('venc' in it) fields.duedate = it.venc ? String(it.venc) : null;
      if ('respId' in it) fields.assignee = it.respId ? { id: String(it.respId) } : null;
      try {
        const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}`, {
          method: 'PUT', headers, body: JSON.stringify({ fields }),
        });
        if (r.status === 204 || r.ok) { resultados.push({ key, ok: true }); return; }
        let msg = '';
        try { const j = await r.json(); msg = [...(j.errorMessages || []), ...Object.values(j.errors || {})].join(' '); } catch (e) { /* sem corpo */ }
        if (r.status === 401 || r.status === 403) msg = msg || 'Sem permissão — token inválido/expirado ou sem acesso ao projeto.';
        resultados.push({ key, ok: false, erro: (msg || `Jira ${r.status}`).slice(0, 300) });
      } catch (e) {
        resultados.push({ key, ok: false, erro: String(e && e.message ? e.message : e).slice(0, 300) });
      }
    }));
  }
  // Datas/responsáveis mudaram: derruba caches de leitura desta instância.
  cacheClear('atividade:');
  cacheClear('venc:');
  const ordem = new Map(itens.map((it, i) => [String(it.key).toUpperCase(), i]));
  resultados.sort((a, b2) => (ordem.get(a.key) || 0) - (ordem.get(b2.key) || 0));
  return json(res, 200, { ok: resultados.every((r) => r.ok), resultados });
}

// ===========================================================================
// ✨ Criação MÁGICA (linguagem natural): { magico:1, texto, email, token }
// interpreta o pedido em português com a IA (projeto da lista, épico por nome
// aproximado, resumo, descrição e vencimento — datas relativas resolvidas no
// fuso de São Paulo) e devolve a PRÉVIA. Com { confirmar:1 } cria o ticket na
// hora (é o modo usado pelos Atalhos da Siri no celular) — campos explícitos
// no corpo (projeto/resumo/descricao/venc/epicoKey) têm prioridade sobre o
// texto, para a prévia editada no painel. Requer ANTHROPIC_API_KEY na Vercel.
//
// AÇÕES no mesmo pedido (2026-08-31): além de criar, o pedido pode pedir
//   • responsável  ("no nome da Jéssica")            -> fields.assignee
//   • apontamento  ("aponte 30 minutos")             -> worklog (no SEU usuário)
//   • comentário   ("comente que … marque o Diego")  -> comment com @menção (ADF)
//   • status       ("passe para finalizado")          -> transição do workflow
// Tudo resolvido por NOME (pessoas ativas do Jira e status do próprio fluxo do
// projeto/tipo) e devolvido na prévia para conferência; na confirmação as ações
// rodam uma a uma e o resultado de cada uma volta em `acoes`.
// ===========================================================================
function magicoHojeSP() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}
async function magicoProjetos(base, headers) {
  const ck = 'criar:magico:projetos';
  const c = cacheGet(ck);
  if (c) return c;
  const lista = [];
  let startAt = 0;
  for (let p = 0; p < 4; p++) {
    const r = await fetch(`${base}/rest/api/3/project/search?maxResults=100&startAt=${startAt}`, { headers });
    if (!r.ok) break;
    const j = await r.json();
    (j.values || []).forEach((pr) => lista.push({
      key: pr.key, nome: pr.name || pr.key,
      categoria: (pr.projectCategory && pr.projectCategory.name) || '',
    }));
    if (j.isLast || !(j.values || []).length) break;
    startAt += (j.values || []).length;
  }
  const uteis = lista.filter((pr) => !/^ARQ\b|arquiv/i.test(pr.categoria) && pr.key !== 'ARQ');
  return cacheSetTTL(ck, uteis, 30);
}
async function magicoTipoTarefa(base, headers, projeto) {
  const ck = `criar:magico:tipo:${projeto}`;
  const c = cacheGet(ck);
  if (c) return c;
  const r = await fetch(`${base}/rest/api/3/issue/createmeta?projectKeys=${encodeURIComponent(projeto)}`, { headers });
  if (!r.ok) return null;
  const tipos = (((await r.json()).projects || [])[0] || {}).issuetypes || [];
  const uteis = tipos.filter((t) => !t.subtask && !/epic|épico/i.test(t.name || ''));
  const alvo = uteis.find((t) => /tarefa|task/i.test(t.name || '')) || uteis[0];
  return alvo ? cacheSetTTL(ck, { id: String(alvo.id), nome: alvo.name || '' }, 30) : null;
}
const magicoNorm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
async function magicoEpico(base, headers, projeto, epicoTexto) {
  if (!epicoTexto) return null;
  const jql = encodeURIComponent(`project = ${projeto} AND issuetype in (Epic, Épico) AND statusCategory != Done ORDER BY created DESC`);
  const r = await fetch(`${base}/rest/api/3/search/jql?jql=${jql}&maxResults=100&fields=summary`, { headers });
  if (!r.ok) return null;
  const eps = (((await r.json()).issues) || []).map((i) => ({ k: i.key, nome: (i.fields && i.fields.summary) || '' }));
  const alvo = magicoNorm(epicoTexto);
  const hits = eps.filter((e) => magicoNorm(e.nome).includes(alvo) || alvo.includes(magicoNorm(e.nome)));
  hits.sort((a, b) => a.nome.length - b.nome.length);
  return hits[0] || null;
}

// ---- pessoas ativas (responsável e menções), resolvidas pelo NOME falado ----
// Tenta com o token de quem pediu; se ele não tiver "Procurar usuários", cai
// para a conta de serviço (leitura, como o resto do painel).
async function magicoPessoas(base, headers) {
  const ck = 'criar:magico:pessoas';
  const c = cacheGet(ck);
  if (c) return c;
  const out = [];
  const vistos = new Set();
  const junta = (u) => {
    if (!u || u.accountType !== 'atlassian' || u.active === false || !u.accountId) return;
    if (vistos.has(u.accountId)) return;
    vistos.add(u.accountId);
    out.push({ id: u.accountId, nome: u.displayName || u.accountId, email: String(u.emailAddress || '').toLowerCase() });
  };
  for (let startAt = 0, p = 0; p < 12; p += 1, startAt += 100) {
    let r;
    try { r = await fetch(`${base}/rest/api/3/users/search?startAt=${startAt}&maxResults=100`, { headers }); }
    catch (e) { break; }
    if (!r || !r.ok) break;
    let lote = [];
    try { lote = await r.json(); } catch (e) { break; }
    if (!Array.isArray(lote) || !lote.length) break;
    lote.forEach(junta);
    if (lote.length < 100) break;
  }
  if (!out.length) {
    try {
      const pes = await jiraUsuariosAtivos();
      Object.entries(pes).forEach(([id, p2]) => out.push({ id, nome: p2.nome || id, email: String(p2.email || '').toLowerCase() }));
    } catch (e) { /* segue sem lista de pessoas */ }
  }
  out.sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
  return cacheSetTTL(ck, out, 30);
}

// "Jéssica", "jessica.silva@…", "Ana Júlia" -> { pessoa, ambiguos:[nomes] }
const RE_ART = /^(a|o|as|os|para a|para o|pra|para|do|da|de|no|na|com a|com o)\s+/;
function magicoAchaPessoa(pessoas, texto) {
  const vazio = { pessoa: null, ambiguos: [] };
  let alvo = magicoNorm(texto).replace(/[.,;:!?]+$/, '').trim();
  while (RE_ART.test(alvo)) alvo = alvo.replace(RE_ART, '').trim();
  if (!alvo || !pessoas.length) return vazio;
  const cand = pessoas.map((p) => ({ p, n: magicoNorm(p.nome), e: magicoNorm(p.email) }));
  const exato = cand.filter((c) => c.n === alvo || c.e === alvo || c.e.split('@')[0] === alvo);
  if (exato.length === 1) return { pessoa: exato[0].p, ambiguos: [] };
  const termos = alvo.split(/\s+/).filter(Boolean);
  const escolhe = (lista) => {
    if (!lista.length) return null;
    const ord = [...lista].sort((a, b) => a.n.length - b.n.length);
    return { pessoa: ord[0].p, ambiguos: ord.slice(1, 4).map((h) => h.p.nome) };
  };
  // todos os termos batem com o começo de alguma palavra do nome (ou do e-mail)
  const hits = cand.filter((c) => termos.every((t) => c.n.split(/\s+/).some((w) => w === t || w.startsWith(t))
    || (c.e && c.e.split(/[@._-]/).some((w) => w === t || w.startsWith(t)))));
  return escolhe(hits) || escolhe(cand.filter((c) => c.n.includes(alvo))) || vazio;
}

// ---- status possíveis no fluxo do projeto/tipo (para "passe para finalizado") ----
async function magicoStatusOpcoes(base, headers, projeto, tipoId) {
  const ck = `criar:magico:status:${projeto}`;
  let todos = cacheGet(ck);
  if (!todos) {
    let bruto = [];
    try {
      const r = await fetch(`${base}/rest/api/3/project/${encodeURIComponent(projeto)}/statuses`, { headers });
      if (r.ok) bruto = await r.json();
    } catch (e) { /* segue sem status */ }
    todos = cacheSetTTL(ck, Array.isArray(bruto) ? bruto : [], 30);
  }
  const doTipo = todos.filter((t) => tipoId && String(t.id) === String(tipoId));
  const fonte = doTipo.length ? doTipo : todos;
  const out = [];
  const vistos = new Set();
  fonte.forEach((t) => (t.statuses || []).forEach((s) => {
    const nome = String(s.name || '');
    if (!nome || vistos.has(nome)) return;
    vistos.add(nome);
    out.push({ nome, cat: (s.statusCategory && s.statusCategory.key) || '' });
  }));
  return out;
}
const STATUS_SIN = [
  { re: /(finaliz|conclu|encerr|pronto|feito|fechad|done|resolvid|entregue|terminad)/, cat: 'done' },
  { re: /(fazendo|andamento|iniciad|come[cç]|progress|executand|desenvolv|trabalhand)/, cat: 'indeterminate' },
  { re: /(a ?fazer|backlog|abert|nov[oa]|todo|pendente|espera|fila)/, cat: 'new' },
];
function magicoAchaStatus(opcoes, texto) {
  let alvo = magicoNorm(texto).replace(/^(status|estado)\s+/, '').replace(/[.,;:!?]+$/, '').trim();
  while (RE_ART.test(alvo)) alvo = alvo.replace(RE_ART, '').trim();
  if (!alvo || !opcoes.length) return null;
  const exato = opcoes.find((s) => magicoNorm(s.nome) === alvo);
  if (exato) return exato;
  const parcial = opcoes.filter((s) => magicoNorm(s.nome).includes(alvo) || alvo.includes(magicoNorm(s.nome)));
  if (parcial.length) return [...parcial].sort((a, b) => a.nome.length - b.nome.length)[0];
  const sin = STATUS_SIN.find((x) => x.re.test(alvo));
  if (sin) {
    const naCat = opcoes.filter((s) => s.cat === sin.cat);
    if (naCat.length) return naCat.find((s) => sin.re.test(magicoNorm(s.nome))) || naCat[naCat.length - 1];
  }
  return null;
}

// ---- tempo falado -> segundos ("30 minutos", "1h30", "meia hora", "2 horas") ----
function magicoTempoSeg(txt) {
  if (txt == null) return null;
  let s = magicoNorm(txt).replace(/[.,;:!?]+$/, '').trim();
  if (!s) return null;
  if (/meia\s*hora/.test(s)) return 1800;
  if (/^(uma|1)\s*horas?$/.test(s)) return 3600;
  s = s.replace(/\be\b/g, ' ').replace(/horas?/g, 'h').replace(/minutos?/g, 'm').replace(/\bmins?\b/g, 'm')
    .replace(/\s+/g, '').replace(',', '.');
  let m;
  if ((m = s.match(/^(\d+)[:h]([0-5]?\d)m?$/))) return (+m[1]) * 3600 + (+m[2]) * 60;
  if ((m = s.match(/^(\d+(?:\.\d+)?)h$/))) return Math.round((+m[1]) * 3600);
  if ((m = s.match(/^(\d+(?:\.\d+)?)m$/))) return Math.round((+m[1]) * 60);
  if ((m = s.match(/^(\d+(?:\.\d+)?)d$/))) return Math.round((+m[1]) * 8 * 3600);
  if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) return Math.round((+m[1]) * 3600);
  return null;
}
function magicoTempoFmt(seg) {
  const h = Math.floor(seg / 3600);
  const mi = Math.round((seg % 3600) / 60);
  if (h && mi) return `${h}h${String(mi).padStart(2, '0')}`;
  return h ? `${h}h` : `${mi}m`;
}

// Comentário em ADF com @menções reais (nó 'mention') no começo do texto.
function adfComentario(texto, mencoes) {
  const doc = adf(String(texto || ''));
  const lista = Array.isArray(mencoes) ? mencoes.filter((m) => m && m.id) : [];
  if (!lista.length) return doc;
  const inicio = [];
  lista.forEach((m) => {
    inicio.push({ type: 'mention', attrs: { id: String(m.id), text: `@${m.nome || ''}` } });
    inicio.push({ type: 'text', text: ' ' });
  });
  const p0 = doc.content[0];
  if (p0 && p0.type === 'paragraph') p0.content = [...inicio, ...(p0.content || [])];
  else doc.content.unshift({ type: 'paragraph', content: inicio });
  return doc;
}

// Executa as ações pedidas DEPOIS de criar o ticket. Cada uma é independente:
// se uma falhar, as outras seguem e o motivo volta na lista.
async function magicoExecutaAcoes(base, headers, key, plano) {
  const acoes = [];
  const falha = async (r) => {
    let msg = '';
    try {
      const j = await r.json();
      msg = [...(j.errorMessages || []), ...Object.values(j.errors || {})].join(' ');
    } catch (e) { /* sem corpo */ }
    if (!msg && (r.status === 401 || r.status === 403)) msg = 'sem permissão para esta ação no projeto';
    return (msg || `Jira ${r.status}`).slice(0, 240);
  };
  if (plano.respId && plano.atribuirDepois) {
    try {
      const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}/assignee`, {
        method: 'PUT', headers, body: JSON.stringify({ accountId: String(plano.respId) }),
      });
      acoes.push(r.ok || r.status === 204
        ? { tipo: 'responsavel', ok: true, detalhe: `responsável: ${plano.respNome || plano.respId}` }
        : { tipo: 'responsavel', ok: false, erro: await falha(r) });
    } catch (e) { acoes.push({ tipo: 'responsavel', ok: false, erro: String(e.message || e).slice(0, 200) }); }
  }
  if (plano.tempoSeg) {
    try {
      const corpo = { timeSpentSeconds: plano.tempoSeg, started: `${plano.tempoDia || magicoHojeSP()}T09:00:00.000-0300` };
      if (plano.tempoComentario) corpo.comment = adf(plano.tempoComentario);
      const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}/worklog`, {
        method: 'POST', headers, body: JSON.stringify(corpo),
      });
      acoes.push(r.ok
        ? { tipo: 'tempo', ok: true, detalhe: `${magicoTempoFmt(plano.tempoSeg)} apontado(s) no seu usuário` }
        : { tipo: 'tempo', ok: false, erro: await falha(r) });
    } catch (e) { acoes.push({ tipo: 'tempo', ok: false, erro: String(e.message || e).slice(0, 200) }); }
  }
  const mencoes = Array.isArray(plano.mencoes) ? plano.mencoes : [];
  if (plano.comentario || mencoes.length) {
    try {
      const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
        method: 'POST', headers, body: JSON.stringify({ body: adfComentario(plano.comentario, mencoes) }),
      });
      acoes.push(r.ok
        ? { tipo: 'comentario', ok: true, detalhe: `comentário publicado${mencoes.length ? ` marcando ${mencoes.map((m) => m.nome).join(', ')}` : ''}` }
        : { tipo: 'comentario', ok: false, erro: await falha(r) });
    } catch (e) { acoes.push({ tipo: 'comentario', ok: false, erro: String(e.message || e).slice(0, 200) }); }
  }
  if (plano.statusNome) {
    try {
      const r0 = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, { headers });
      const lista = r0.ok ? (((await r0.json()) || {}).transitions || []) : [];
      const alvo = magicoNorm(plano.statusNome);
      const nomeDe = (t) => magicoNorm((t.to && t.to.name) || '');
      let t = lista.find((x) => nomeDe(x) === alvo)
        || lista.find((x) => nomeDe(x).includes(alvo) || alvo.includes(nomeDe(x)))
        || lista.find((x) => magicoNorm(x.name || '') === alvo);
      if (!t && plano.statusCat) t = lista.find((x) => ((x.to && x.to.statusCategory && x.to.statusCategory.key) || '') === plano.statusCat);
      if (!t) {
        acoes.push({ tipo: 'status', ok: false,
          erro: `o fluxo do ticket não oferece "${plano.statusNome}" agora${lista.length ? ` — disponíveis: ${lista.map((x) => (x.to && x.to.name) || x.name).join(', ')}` : ''}`.slice(0, 240) });
      } else {
        const r = await fetch(`${base}/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
          method: 'POST', headers, body: JSON.stringify({ transition: { id: String(t.id) } }),
        });
        acoes.push(r.ok || r.status === 204
          ? { tipo: 'status', ok: true, detalhe: `status: ${(t.to && t.to.name) || plano.statusNome}` }
          : { tipo: 'status', ok: false, erro: await falha(r) });
      }
    } catch (e) { acoes.push({ tipo: 'status', ok: false, erro: String(e.message || e).slice(0, 200) }); }
  }
  return acoes;
}

async function magicoCore(b, base, headers) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const avisos = [];
  let projeto = String(b.projeto || '').trim().toUpperCase();
  let resumo = String(b.resumo || '').trim();
  let descricao = String(b.descricao || '').trim();
  let venc = String(b.venc || '').trim();
  let epicoKey = String(b.epicoKey || '').trim().toUpperCase();
  let epicoNome = '';
  // Ações do pedido (podem vir explícitas da prévia editada, ou da IA).
  const explicito = !!(projeto && resumo);
  let respId = String(b.respId || '').trim();
  let respNome = '';
  let tempoSeg = Number(b.tempoSeg || 0) || 0;
  let statusNome = String(b.statusNome || '').trim();
  let comentario = String(b.comentario || '').trim();
  let mencoes = (Array.isArray(b.mencoes) ? b.mencoes : [])
    .map((m) => (typeof m === 'string' ? { id: m } : (m || {})))
    .filter((m) => RE_ACC.test(String(m.id || ''))).slice(0, 10);
  const projetos = await magicoProjetos(base, headers);
  if (!projetos.length) return ({ ok: false, erro: 'Não consegui listar os projetos do Jira com o seu token.' });

  // Sem campos explícitos → interpreta o TEXTO com a IA.
  if (!explicito) {
    const texto = String(b.texto || '').trim().slice(0, 2000);
    if (!texto) return ({ erro: 'Descreva o ticket (texto) ou informe os campos.' });
    if (!apiKey) return ({ ok: false, erro: 'A interpretação por IA precisa da ANTHROPIC_API_KEY na Vercel (a mesma do Resumo por IA).' });
    const { chamaClaude } = await import('./_lib/ia.js');
    const SYS = ['Você interpreta pedidos em português do Brasil para criar UM ticket no Jira e executar as ações pedidas nele.',
      'Escolha o projeto EXCLUSIVAMENTE da lista fornecida (retorne a key exata); case por nome/apelido — ex.: "projeto da Copel" casa com o projeto cujo nome contém "Copel".',
      'Se nenhum projeto da lista casar com o pedido, retorne projeto="" (nunca chute).',
      'resumo: um título curto e claro (máx. 120 caracteres). descricao: o detalhamento do pedido (pode repetir o texto original organizado).',
      'venc: data AAAA-MM-DD. Resolva datas relativas com a data de HOJE fornecida (fuso América/São Paulo): "hoje" = a data de HOJE; "amanhã" = HOJE + 1 dia; "dia 31" = dia 31 do mês corrente se ainda não passou, senão do mês seguinte (se o mês não tiver o dia, use o último dia do mês); "sexta" = a próxima sexta-feira; sem menção a prazo → "".',
      'epicoTexto: o nome aproximado do épico citado (ex.: "épico de gestão" → "gestão"); sem épico citado → "".',
      'responsavelTexto: o NOME da pessoa que fica com o ticket ("no nome da Jéssica", "para o Pedro", "atribua ao Diego") — só o nome, sem artigos; sem responsável citado → "".',
      'tempoTexto: quanto apontar de horas NO ticket ("aponte 30 minutos", "lance 2 horas"), normalizado como "30m", "2h" ou "1h30"; sem apontamento pedido → "".',
      'statusTexto: o status final pedido ("passe para finalizado", "deixe em andamento") — só o nome do status; sem status citado → "".',
      'comentarioTexto: o texto do comentário a publicar no ticket ("comente que…", "no comentário escreva…"); use só o conteúdo do comentário, sem os nomes de quem marcar; sem comentário pedido → "".',
      'mencoesTexto: lista com os NOMES das pessoas a marcar (@) no comentário ("marque o Diego no comentário"); sem menção pedida → [].',
      'Importante: NÃO invente ações. Só preencha um campo quando o pedido realmente pedir aquilo.'].join('\n');
    const SCHEMA_M = { type: 'object', additionalProperties: false,
      required: ['projeto', 'resumo', 'descricao', 'venc', 'epicoTexto', 'responsavelTexto', 'tempoTexto', 'statusTexto', 'comentarioTexto', 'mencoesTexto'],
      properties: { projeto: { type: 'string' }, resumo: { type: 'string' }, descricao: { type: 'string' },
        venc: { type: 'string' }, epicoTexto: { type: 'string' }, responsavelTexto: { type: 'string' },
        tempoTexto: { type: 'string' }, statusTexto: { type: 'string' }, comentarioTexto: { type: 'string' },
        mencoesTexto: { type: 'array', items: { type: 'string' } } } };
    const prompt = `HOJE: ${magicoHojeSP()}\n\nPEDIDO:\n${texto}\n\nPROJETOS DISPONÍVEIS (key — nome — categoria):\n${
      projetos.map((p) => `${p.key} — ${p.nome}${p.categoria ? ` — ${p.categoria}` : ''}`).join('\n')}`;
    let out;
    try { out = await chamaClaude(apiKey, null, { system: SYS, schema: SCHEMA_M, prompt }); }
    catch (e) { return ({ ok: false, erro: `IA indisponível: ${String(e.message || e).slice(0, 200)}` }); }
    projeto = String(out.projeto || '').trim().toUpperCase();
    resumo = resumo || String(out.resumo || '').trim().slice(0, 250);
    descricao = descricao || String(out.descricao || '').trim();
    venc = venc || String(out.venc || '').trim();
    comentario = comentario || String(out.comentarioTexto || '').trim().slice(0, 5000);
    if (!epicoKey && out.epicoTexto) {
      const ep = await magicoEpico(base, headers, projeto, out.epicoTexto);
      if (ep) { epicoKey = ep.k; epicoNome = ep.nome; }
      else if (projeto) avisos.push(`Épico "${out.epicoTexto}" não encontrado no projeto ${projeto} — o ticket sai sem épico.`);
    }
    // Pessoas (responsável + menções) resolvidas pelo nome falado.
    const querPessoa = !!(out.responsavelTexto || (out.mencoesTexto || []).length);
    const pessoas = querPessoa ? await magicoPessoas(base, headers) : [];
    if (querPessoa && !pessoas.length) avisos.push('Não consegui listar as pessoas do Jira — responsável e menções ficaram de fora.');
    if (!respId && out.responsavelTexto && pessoas.length) {
      const ach = magicoAchaPessoa(pessoas, out.responsavelTexto);
      if (ach.pessoa) {
        respId = ach.pessoa.id; respNome = ach.pessoa.nome;
        if (ach.ambiguos.length) avisos.push(`"${out.responsavelTexto}" também poderia ser ${ach.ambiguos.join(', ')} — confira o responsável.`);
      } else avisos.push(`Não achei ninguém chamado "${out.responsavelTexto}" no Jira — escolha o responsável na prévia.`);
    }
    if (!mencoes.length && (out.mencoesTexto || []).length && pessoas.length) {
      (out.mencoesTexto || []).slice(0, 10).forEach((nm) => {
        const ach = magicoAchaPessoa(pessoas, nm);
        if (ach.pessoa && !mencoes.some((m) => m.id === ach.pessoa.id)) mencoes.push({ id: ach.pessoa.id, nome: ach.pessoa.nome });
        else if (!ach.pessoa) avisos.push(`Não achei "${nm}" no Jira para marcar no comentário.`);
      });
      if (mencoes.length && !comentario) comentario = String(descricao || resumo || '').slice(0, 5000);
    }
    if (!tempoSeg && out.tempoTexto) {
      const seg = magicoTempoSeg(out.tempoTexto);
      if (seg && seg >= 60 && seg <= 24 * 3600) tempoSeg = seg;
      else if (out.tempoTexto) avisos.push(`Não entendi o tempo "${out.tempoTexto}" — ajuste na prévia (ex.: 30m, 1h30, 2h).`);
    }
    if (!statusNome && out.statusTexto) statusNome = String(out.statusTexto).trim();
  }
  if (!projeto || !projetos.some((p) => p.key === projeto)) {
    return ({ ok: false, erro: 'Não identifiquei o projeto no pedido — cite o nome como aparece no Jira (ex.: "no projeto da Copel").',
      projetos: projetos.map((p) => `${p.key} — ${p.nome}`).slice(0, 60) });
  }
  if (!resumo) return ({ ok: false, erro: 'Não identifiquei o título do ticket no pedido.' });
  if (venc && !/^\d{4}-\d{2}-\d{2}$/.test(venc)) { avisos.push(`Vencimento "${venc}" inválido — ignorado.`); venc = ''; }
  if (respId && !RE_ACC.test(respId)) { avisos.push('Responsável inválido — ignorado.'); respId = ''; }
  if (tempoSeg && (tempoSeg < 60 || tempoSeg > 24 * 3600)) {
    avisos.push('Tempo fora do intervalo (1 minuto a 24 horas) — apontamento ignorado.'); tempoSeg = 0;
  }
  comentario = comentario.slice(0, 5000);
  const tipo = await magicoTipoTarefa(base, headers, projeto);
  if (!tipo) return ({ ok: false, erro: `Não achei um tipo de tarefa utilizável no projeto ${projeto}.` });
  const pNome = (projetos.find((p) => p.key === projeto) || {}).nome || projeto;

  // Status do fluxo do projeto/tipo: resolve o nome falado e monta as opções da prévia.
  const statusOpcoes = await magicoStatusOpcoes(base, headers, projeto, tipo.id);
  let statusCat = '';
  if (statusNome) {
    const st = magicoAchaStatus(statusOpcoes, statusNome);
    if (st) { statusNome = st.nome; statusCat = st.cat; }
    else {
      const sin = STATUS_SIN.find((x) => x.re.test(magicoNorm(statusNome)));
      statusCat = sin ? sin.cat : '';
      if (statusOpcoes.length) avisos.push(`Status "${statusNome}" não existe no fluxo de ${projeto} — os possíveis são: ${statusOpcoes.map((s) => s.nome).join(', ')}.`);
    }
  }
  // Nomes das menções/responsável vindos da prévia editada: confirmados na lista.
  if (!explicito || respId || mencoes.length) {
    const precisaNome = (respId && !respNome) || mencoes.some((m) => !m.nome);
    if (precisaNome) {
      const pessoas = await magicoPessoas(base, headers);
      if (respId && !respNome) respNome = (pessoas.find((p) => p.id === respId) || {}).nome || '';
      mencoes = mencoes.map((m) => (m.nome ? m : { id: m.id, nome: (pessoas.find((p) => p.id === m.id) || {}).nome || '' }));
    }
  }

  const previa = { projeto, projetoNome: pNome, tipoId: tipo.id, tipoNome: tipo.nome,
    epicoKey, epicoNome, resumo, descricao, venc,
    respId, respNome, tempoSeg, tempoTexto: tempoSeg ? magicoTempoFmt(tempoSeg) : '',
    statusNome, statusCat, comentario, mencoes, avisos };

  if (!b.confirmar) {
    // A prévia do painel monta os seletores (responsável, menções e status) com estas listas.
    const pessoas = await magicoPessoas(base, headers);
    return ({ ok: true, previa,
      pessoas: pessoas.map((p) => ({ id: p.id, nome: p.nome })).slice(0, 400),
      statusOpcoes });
  }

  // ---- confirmar: cria o ticket na hora (1 issue) + executa as ações pedidas ----
  const fields = { project: { key: projeto }, issuetype: { id: tipo.id }, summary: resumo.slice(0, 250) };
  if (descricao) fields.description = adf(descricao);
  if (venc) fields.duedate = venc;
  if (epicoKey) fields.parent = { key: epicoKey };
  if (respId) fields.assignee = { id: respId };
  let atribuirDepois = false;
  let r = await fetch(`${base}/rest/api/3/issue`, { method: 'POST', headers, body: JSON.stringify({ fields }) });
  if (!r.ok && epicoKey) {
    // alguns fluxos recusam parent no create — tenta sem o épico e avisa
    delete fields.parent;
    avisos.push(`O Jira recusou o épico ${epicoKey} no create — ticket criado sem épico.`);
    r = await fetch(`${base}/rest/api/3/issue`, { method: 'POST', headers, body: JSON.stringify({ fields }) });
  }
  if (!r.ok && respId) {
    // projetos cuja tela de criação não tem o campo "Responsável": cria sem ele
    // e atribui logo depois, pelo endpoint dedicado.
    delete fields.assignee;
    atribuirDepois = true;
    r = await fetch(`${base}/rest/api/3/issue`, { method: 'POST', headers, body: JSON.stringify({ fields }) });
  }
  if (!r.ok) return ({ ok: false, erro: `Jira ${r.status}: ${(await r.text()).slice(0, 300)}`, previa });
  const key = ((await r.json()) || {}).key || '';
  const acoes = [];
  if (respId && !atribuirDepois) acoes.push({ tipo: 'responsavel', ok: true, detalhe: `responsável: ${respNome || respId}` });
  const extras = await magicoExecutaAcoes(base, headers, key, {
    respId, respNome, atribuirDepois, tempoSeg, comentario, mencoes, statusNome, statusCat,
  });
  acoes.push(...extras);
  cacheClear('venc:'); cacheClear('epicos:'); cacheClear('atividade:');
  const feitos = acoes.filter((a) => a.ok).map((a) => a.detalhe);
  const falhas = acoes.filter((a) => !a.ok);
  const msg = `Criado ${key} no projeto ${pNome}${epicoKey ? ` (épico ${epicoNome || epicoKey})` : ''}`
    + `${venc ? `, vence ${venc.split('-').reverse().join('/')}` : ''}: ${resumo}`
    + `${feitos.length ? `. Também fiz: ${feitos.join('; ')}` : ''}`
    + `${falhas.length ? `. Não consegui: ${falhas.map((a) => `${a.tipo} (${a.erro})`).join('; ')}` : ''}`;
  return ({ ok: true, key, previa, acoes, msg });
}

async function magico(res, b, base, headers) {
  const out = await magicoCore(b, base, headers);
  // O Atalho da Siri lê o campo "msg" (Get Dictionary Value → Show Result):
  // em ERRO a resposta vinha sem msg e o atalho terminava mudo — agora o
  // motivo sempre viaja em msg, e o celular fala o que impediu a criação.
  if (!out.msg && out.erro) out.msg = `Não criei o ticket: ${out.erro}`;
  return json(res, 200, out);
}

// ===========================================================================
// 🔊 SKILL DA ALEXA — endpoint HTTPS custom (não precisa de Lambda): o console
// da Alexa aponta para POST /api/criar e o envelope {version, session, request}
// é detectado antes das rotas do painel. Fluxo por voz com CONFIRMAÇÃO:
//   "crie um ticket <pedido>" → interpreta (magicoCore) → fala a prévia e
//   pergunta; "sim" cria (a prévia viaja em sessionAttributes), "não" cancela.
// Env na Vercel: ALEXA_SKILL_ID (validação do applicationId — obrigatória),
// ALEXA_JIRA_EMAIL + ALEXA_JIRA_TOKEN (credenciais de quem a skill cria; a
// skill fica em modo desenvolvimento, só nas Alexas da conta do dono).
// Modelo de interação pronto: /alexa-skill-model.json (colar no console).
// ===========================================================================
function alexaFala(texto, { fim = true, reprompt = '', attrs = null } = {}) {
  const r = { version: '1.0', response: {
    outputSpeech: { type: 'PlainText', text: String(texto).slice(0, 6000) },
    shouldEndSession: !!fim } };
  if (reprompt) r.response.reprompt = { outputSpeech: { type: 'PlainText', text: reprompt } };
  if (attrs) r.sessionAttributes = attrs;
  return r;
}
async function alexaSkill(res, b) {
  const skillId = (process.env.ALEXA_SKILL_ID || '').trim();
  const email = (process.env.ALEXA_JIRA_EMAIL || '').trim();
  const token = (process.env.ALEXA_JIRA_TOKEN || '').trim();
  const appId = (b.session && b.session.application && b.session.application.applicationId)
    || (b.context && b.context.System && b.context.System.application && b.context.System.application.applicationId) || '';
  if (!skillId || appId !== skillId) {
    return json(res, 403, alexaFala('Esta skill não está autorizada neste servidor.'));
  }
  if (!email || !token) {
    return json(res, 200, alexaFala('A skill ainda não tem as credenciais do Jira. Defina ALEXA_JIRA_EMAIL e ALEXA_JIRA_TOKEN na Vercel.'));
  }
  const req2 = b.request || {};
  const tipo = req2.type || '';
  const intent = (req2.intent && req2.intent.name) || '';
  const attrs = (b.session && b.session.attributes) || {};
  const base = jiraBase();
  const headers = {
    Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
    Accept: 'application/json', 'Content-Type': 'application/json',
  };
  const EXEMPLO = 'Diga, por exemplo: crie um ticket no projeto da Copel, no épico de gestão, no nome da Jéssica, '
    + 'com a descrição alinhamento de estratégia e vencimento hoje, marque o Diego no comentário e passe para finalizado.';

  if (tipo === 'SessionEndedRequest') return json(res, 200, { version: '1.0', response: {} });
  if (tipo === 'LaunchRequest') {
    return json(res, 200, alexaFala(`Oi! Me diga o ticket que você quer criar. ${EXEMPLO}`,
      { fim: false, reprompt: 'Qual ticket você quer criar?' }));
  }
  if (tipo === 'IntentRequest' && intent === 'CriarTicketIntent') {
    const texto = String((((req2.intent || {}).slots || {}).texto || {}).value || '').trim();
    if (!texto) return json(res, 200, alexaFala(`Não entendi o pedido. ${EXEMPLO}`, { fim: false, reprompt: 'Qual ticket você quer criar?' }));
    const out = await magicoCore({ texto }, base, headers);
    if (!out.ok || !out.previa) {
      return json(res, 200, alexaFala(`${out.erro || 'Não consegui interpretar.'} Tente de novo com o nome do projeto.`,
        { fim: false, reprompt: 'Qual ticket você quer criar?' }));
    }
    const p = out.previa;
    const vencFala = p.venc ? `, vencendo em ${p.venc.split('-').reverse().join(' do ')}` : '';
    const extras = [];
    if (p.respNome) extras.push(`no nome de ${p.respNome}`);
    if (p.tempoSeg) extras.push(`apontando ${magicoTempoFmt(p.tempoSeg)}`);
    if (p.statusNome) extras.push(`e mudando o status para ${p.statusNome}`);
    if ((p.mencoes || []).length) extras.push(`marcando ${p.mencoes.map((m) => m.nome).join(' e ')} no comentário`);
    else if (p.comentario) extras.push('com um comentário');
    const fala = `Entendi: ${p.resumo}, no projeto ${p.projetoNome}${p.epicoNome ? `, épico ${p.epicoNome}` : ''}${vencFala}`
      + `${extras.length ? `, ${extras.join(', ')}` : ''}. Posso criar?`;
    return json(res, 200, alexaFala(fala, { fim: false, reprompt: 'Posso criar o ticket?', attrs: { previa: p } }));
  }
  if (tipo === 'IntentRequest' && intent === 'AMAZON.YesIntent') {
    const p = attrs.previa;
    if (!p) return json(res, 200, alexaFala(`Não tenho um ticket pendente. ${EXEMPLO}`, { fim: false, reprompt: 'Qual ticket você quer criar?' }));
    const out = await magicoCore({ confirmar: 1, projeto: p.projeto, epicoKey: p.epicoKey || '',
      resumo: p.resumo, descricao: p.descricao || '', venc: p.venc || '',
      respId: p.respId || '', tempoSeg: p.tempoSeg || 0, statusNome: p.statusNome || '',
      comentario: p.comentario || '', mencoes: p.mencoes || [] }, base, headers);
    if (!out.ok || !out.key) return json(res, 200, alexaFala(`Não consegui criar: ${out.erro || 'erro no Jira'}.`));
    return json(res, 200, alexaFala(`${out.msg || `Criado o ticket ${out.key}.`} Até mais!`));
  }
  if (tipo === 'IntentRequest' && (intent === 'AMAZON.NoIntent' || intent === 'AMAZON.CancelIntent' || intent === 'AMAZON.StopIntent')) {
    return json(res, 200, alexaFala('Tudo bem, cancelei. Até mais!'));
  }
  if (tipo === 'IntentRequest' && intent === 'AMAZON.HelpIntent') {
    return json(res, 200, alexaFala(`Eu crio tickets no Jira da Dexterity. ${EXEMPLO}`, { fim: false, reprompt: 'Qual ticket você quer criar?' }));
  }
  return json(res, 200, alexaFala(`Não entendi. ${EXEMPLO}`, { fim: false, reprompt: 'Qual ticket você quer criar?' }));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST' });
    const b = await lerBody(req);
    // Envelope da Alexa (skill custom apontando para este endpoint): detectado
    // pela tripla version+session/context+request, antes das rotas do painel.
    if (b.version && b.request && b.request.type) return await alexaSkill(res, b);
    if (b.feedback) return await criaFeedbackGitHub(res, b);
    const email = String(b.email || '').trim();
    const token = String(b.token || '').trim();
    if (!email || !email.includes('@') || !token) {
      return json(res, 400, { erro: 'Identifique-se (e-mail + token de API) para criar tickets.' });
    }
    if (b.magico) {
      return await magico(res, b, jiraBase(), {
        Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      });
    }
    if (b.editar) {
      return await editaLote(res, b, jiraBase(), {
        Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      });
    }
    const itens = Array.isArray(b.itens) ? b.itens : [];
    if (!itens.length) return json(res, 400, { erro: 'Nenhum ticket para criar.' });
    if (itens.length > MAX_ITENS) return json(res, 400, { erro: `Máximo de ${MAX_ITENS} tickets por lote.` });

    // ---- Validação prévia (defesa no servidor; o front também valida) ----
    const erros = [];
    itens.forEach((it, i) => { const e = validaItem(it); if (e) erros.push({ indice: i, erro: e }); });
    if (erros.length) return json(res, 200, { ok: false, criados: [], erros });

    const base = jiraBase();
    const headers = {
      Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    // "Departamento Dexterity": resolve o custom field por projeto (só quando usado).
    const metaDepto = {};
    const avisos = [];
    for (const p of [...new Set(itens.filter((it) => it.departamento).map((it) => String(it.projeto || '').toUpperCase()))]) {
      metaDepto[p] = await campoDepartamento(base, headers, p);
      if (!metaDepto[p]) avisos.push(`Campo "Departamento Dexterity" não encontrado no projeto ${p} — ticket(s) criado(s) sem o campo.`);
    }

    // "AMS | Consultoria > Cliente" (cascata): resolve o custom field por projeto (só quando usado).
    const metaCons = {};
    for (const p of [...new Set(itens.filter((it) => it.consultoriaId).map((it) => String(it.projeto || '').toUpperCase()))]) {
      metaCons[p] = await campoConsultoriaCliente(base, headers, p);
      if (!metaCons[p]) avisos.push(`Campo "AMS | Consultoria > Cliente" não encontrado no projeto ${p} — ticket(s) criado(s) sem o campo.`);
    }

    const criados = [];
    // O endpoint bulk aceita até 50 por chamada — fatia o lote.
    for (let i = 0; i < itens.length; i += 50) {
      const fatia = itens.slice(i, i + 50);
      const issueUpdates = fatia.map((it) => {
        const fields = {
          project: { key: String(it.projeto).toUpperCase() },
          issuetype: { id: String(it.tipoId) },
          summary: String(it.resumo).trim(),
        };
        if (it.descricao && String(it.descricao).trim()) fields.description = adf(String(it.descricao).trim());
        if (it.respId) fields.assignee = { id: String(it.respId) };
        if (it.paiKey) fields.parent = { key: String(it.paiKey).toUpperCase() };
        if (it.estimativa) fields.timetracking = { originalEstimate: String(it.estimativa).trim() };
        if (it.venc) fields.duedate = String(it.venc);
        if (Array.isArray(it.labels) && it.labels.length) fields.labels = it.labels.map(String);
        if (it.departamento) {
          const m = metaDepto[String(it.projeto || '').toUpperCase()];
          if (m && m.id) {
            const alvo = String(it.departamento).trim().slice(0, 80);
            if (m.valores && m.valores.length) {
              const op = m.valores.find((v) => v.value.toLowerCase() === alvo.toLowerCase())
                || m.valores.find((v) => v.value.toLowerCase().includes(alvo.toLowerCase().split(' ')[0]));
              fields[m.id] = op ? { id: op.id } : { value: alvo };
            } else if (m.tipo === 'string') fields[m.id] = alvo;
            else fields[m.id] = { value: alvo };
          }
        }
        if (it.consultoriaId) {
          const m = metaCons[String(it.projeto || '').toUpperCase()];
          if (m && m.id) {
            fields[m.id] = { id: String(it.consultoriaId),
              ...(it.clienteId ? { child: { id: String(it.clienteId) } } : {}) };
          }
        }
        return { fields };
      });

      const r = await fetch(`${base}/rest/api/3/issue/bulk`, {
        method: 'POST', headers, body: JSON.stringify({ issueUpdates }),
      });
      if (r.status === 401 || r.status === 403) {
        return json(res, 200, { ok: false, criados, erros: [{ indice: i, erro: 'Sem permissão — token inválido/expirado ou sem acesso ao projeto.' }] });
      }
      let data = {};
      try { data = await r.json(); } catch (e) { /* resposta sem corpo */ }
      if (!r.ok && !Array.isArray(data.issues)) {
        const t = JSON.stringify(data).slice(0, 300);
        return json(res, 200, { ok: false, criados, erros: [{ indice: i, erro: `Jira ${r.status}: ${t}` }] });
      }

      // Reconstrói a correspondência: 'errors' traz o índice que falhou dentro da
      // fatia; os sucessos vêm em 'issues' na ordem dos itens restantes.
      const falharam = new Set((data.errors || []).map((e) => e.failedElementNumber));
      (data.errors || []).forEach((e) => {
        const el = e.elementErrors || {};
        const msgs = [...(el.errorMessages || []), ...Object.values(el.errors || {})];
        erros.push({ indice: i + e.failedElementNumber, erro: msgs.join(' ').slice(0, 300) || 'Falha ao criar.' });
      });
      let s = 0;
      fatia.forEach((it, j) => {
        if (falharam.has(j)) return;
        const issue = (data.issues || [])[s]; s += 1;
        if (issue && issue.key) criados.push({ indice: i + j, key: issue.key, resumo: String(it.resumo).trim() });
      });
    }

    // Dados novos no Jira: derruba caches desta instância.
    cacheClear('atividade:');
    cacheClear('venc:');
    cacheClear('epicos:');

    return json(res, 200, { ok: erros.length === 0, criados, erros, ...(avisos.length ? { avisos } : {}) });
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
