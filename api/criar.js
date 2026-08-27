// POST /api/criar — cria tickets do Jira EM LOTE, com as credenciais da própria
// pessoa (mesmo modelo do /api/apontar): o repórter é quem criou, e as permissões
// do Jira valem para cada um. Usa o endpoint bulk do Jira (50 por requisição).
//
// Corpo: { itens:[{projeto, tipoId, resumo, descricao?, respId?, paiKey?}], email, token }
// Resposta: { ok, criados:[{indice,key,resumo}], erros:[{indice,erro}] }
import { jiraBase, cacheClear, cacheGet, cacheSetTTL, json } from './_lib/util.js';

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
async function magicoCore(b, base, headers) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const avisos = [];
  let projeto = String(b.projeto || '').trim().toUpperCase();
  let resumo = String(b.resumo || '').trim();
  let descricao = String(b.descricao || '').trim();
  let venc = String(b.venc || '').trim();
  let epicoKey = String(b.epicoKey || '').trim().toUpperCase();
  let epicoNome = '';
  const projetos = await magicoProjetos(base, headers);
  if (!projetos.length) return ({ ok: false, erro: 'Não consegui listar os projetos do Jira com o seu token.' });

  // Sem campos explícitos → interpreta o TEXTO com a IA.
  if (!projeto || !resumo) {
    const texto = String(b.texto || '').trim().slice(0, 2000);
    if (!texto) return ({ erro: 'Descreva o ticket (texto) ou informe os campos.' });
    if (!apiKey) return ({ ok: false, erro: 'A interpretação por IA precisa da ANTHROPIC_API_KEY na Vercel (a mesma do Resumo por IA).' });
    const { chamaClaude } = await import('./_lib/ia.js');
    const SYS = ['Você interpreta pedidos em português do Brasil para criar UM ticket no Jira.',
      'Escolha o projeto EXCLUSIVAMENTE da lista fornecida (retorne a key exata); case por nome/apelido — ex.: "projeto da Copel" casa com o projeto cujo nome contém "Copel".',
      'Se nenhum projeto da lista casar com o pedido, retorne projeto="" (nunca chute).',
      'resumo: um título curto e claro (máx. 120 caracteres). descricao: o detalhamento do pedido (pode repetir o texto original organizado).',
      'venc: data AAAA-MM-DD. Resolva datas relativas com a data de HOJE fornecida (fuso América/São Paulo): "dia 31" = dia 31 do mês corrente se ainda não passou, senão do mês seguinte (se o mês não tiver o dia, use o último dia do mês); "sexta" = a próxima sexta-feira; sem menção a prazo → "".',
      'epicoTexto: o nome aproximado do épico citado (ex.: "épico de gestão" → "gestão"); sem épico citado → "".'].join('\n');
    const SCHEMA_M = { type: 'object', additionalProperties: false,
      required: ['projeto', 'resumo', 'descricao', 'venc', 'epicoTexto'],
      properties: { projeto: { type: 'string' }, resumo: { type: 'string' }, descricao: { type: 'string' },
        venc: { type: 'string' }, epicoTexto: { type: 'string' } } };
    const prompt = `HOJE: ${magicoHojeSP()}\n\nPEDIDO:\n${texto}\n\nPROJETOS DISPONÍVEIS (key — nome — categoria):\n${
      projetos.map((p) => `${p.key} — ${p.nome}${p.categoria ? ` — ${p.categoria}` : ''}`).join('\n')}`;
    let out;
    try { out = await chamaClaude(apiKey, null, { system: SYS, schema: SCHEMA_M, prompt }); }
    catch (e) { return ({ ok: false, erro: `IA indisponível: ${String(e.message || e).slice(0, 200)}` }); }
    projeto = String(out.projeto || '').trim().toUpperCase();
    resumo = resumo || String(out.resumo || '').trim().slice(0, 250);
    descricao = descricao || String(out.descricao || '').trim();
    venc = venc || String(out.venc || '').trim();
    if (!epicoKey && out.epicoTexto) {
      const ep = await magicoEpico(base, headers, projeto, out.epicoTexto);
      if (ep) { epicoKey = ep.k; epicoNome = ep.nome; }
      else if (projeto) avisos.push(`Épico "${out.epicoTexto}" não encontrado no projeto ${projeto} — o ticket sai sem épico.`);
    }
  }
  if (!projeto || !projetos.some((p) => p.key === projeto)) {
    return ({ ok: false, erro: 'Não identifiquei o projeto no pedido — cite o nome como aparece no Jira (ex.: "no projeto da Copel").',
      projetos: projetos.map((p) => `${p.key} — ${p.nome}`).slice(0, 60) });
  }
  if (!resumo) return ({ ok: false, erro: 'Não identifiquei o título do ticket no pedido.' });
  if (venc && !/^\d{4}-\d{2}-\d{2}$/.test(venc)) { avisos.push(`Vencimento "${venc}" inválido — ignorado.`); venc = ''; }
  const tipo = await magicoTipoTarefa(base, headers, projeto);
  if (!tipo) return ({ ok: false, erro: `Não achei um tipo de tarefa utilizável no projeto ${projeto}.` });
  const pNome = (projetos.find((p) => p.key === projeto) || {}).nome || projeto;
  const previa = { projeto, projetoNome: pNome, tipoId: tipo.id, tipoNome: tipo.nome,
    epicoKey, epicoNome, resumo, descricao, venc, avisos };

  if (!b.confirmar) return ({ ok: true, previa });

  // ---- confirmar: cria o ticket na hora (1 issue) ----
  const fields = { project: { key: projeto }, issuetype: { id: tipo.id }, summary: resumo.slice(0, 250) };
  if (descricao) fields.description = adf(descricao);
  if (venc) fields.duedate = venc;
  if (epicoKey) fields.parent = { key: epicoKey };
  let r = await fetch(`${base}/rest/api/3/issue`, { method: 'POST', headers, body: JSON.stringify({ fields }) });
  if (!r.ok && epicoKey) {
    // alguns fluxos recusam parent no create — tenta sem o épico e avisa
    delete fields.parent;
    avisos.push(`O Jira recusou o épico ${epicoKey} no create — ticket criado sem épico.`);
    r = await fetch(`${base}/rest/api/3/issue`, { method: 'POST', headers, body: JSON.stringify({ fields }) });
  }
  if (!r.ok) return ({ ok: false, erro: `Jira ${r.status}: ${(await r.text()).slice(0, 300)}`, previa });
  const key = ((await r.json()) || {}).key || '';
  cacheClear('venc:'); cacheClear('epicos:');
  return ({ ok: true, key, previa,
    msg: `Criado ${key} no projeto ${pNome}${epicoKey ? ` (épico ${epicoNome || epicoKey})` : ''}${venc ? `, vence ${venc.split('-').reverse().join('/')}` : ''}: ${resumo}` });
}

async function magico(res, b, base, headers) {
  return json(res, 200, await magicoCore(b, base, headers));
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
  const EXEMPLO = 'Diga, por exemplo: crie um ticket no projeto da Copel, no épico de gestão, com a descrição fazer atividade XPTO e vencimento dia trinta e um.';

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
    const fala = `Entendi: ${p.resumo}, no projeto ${p.projetoNome}${p.epicoNome ? `, épico ${p.epicoNome}` : ''}${vencFala}. Posso criar?`;
    return json(res, 200, alexaFala(fala, { fim: false, reprompt: 'Posso criar o ticket?', attrs: { previa: p } }));
  }
  if (tipo === 'IntentRequest' && intent === 'AMAZON.YesIntent') {
    const p = attrs.previa;
    if (!p) return json(res, 200, alexaFala(`Não tenho um ticket pendente. ${EXEMPLO}`, { fim: false, reprompt: 'Qual ticket você quer criar?' }));
    const out = await magicoCore({ confirmar: 1, projeto: p.projeto, epicoKey: p.epicoKey || '',
      resumo: p.resumo, descricao: p.descricao || '', venc: p.venc || '' }, base, headers);
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
