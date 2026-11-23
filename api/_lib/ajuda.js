// 📘 AJUDA COM A DOCUMENTAÇÃO DO NOTION (2026-11-22, a pedido do usuário: botão ❓ Ajuda no cabeçalho com o texto dos processos do Notion DENTRO do
// app, só para quem está identificado). Este módulo é a FONTE ÚNICA da cópia: lê as páginas dos processos TI-14-0NN pela API oficial do Notion
// (por BLOCOS), converte para um formato próprio e pequeno, mascara credenciais e guarda no banco do painel (jirainsight_config). Nada vai para o
// GitHub nem para public/. Quem chama: a fase `ajuda` do ?cron=1 e o ?tipo=ajuda do api/teams.js, e o POST /api/config?ajuda=1 (botão ↻ do gestor);
// quem lê: GET /api/config?ajuda=indice|proc|busca (identidade obrigatória). Esta lib NÃO importa api/teams.js nem api/config.js (ciclo).
// Funções de conversão/validação são PURAS; só notion*/ajudaSincroniza/leitores falam com a rede, e a rede entra por `AJUDA_DEPS` (trocável nos
// testes: fetch, agora (ms), pausa).
//
// ---------------------------------------------------------------------------------------
// FORMATO v1 (contrato com a tela public/js/25c-ajuda-painel.js)
// ---------------------------------------------------------------------------------------
// Linha `ajuda_indice` (pequena; é o que a tela lê ao abrir):
//   { v:1, conv, raiz, em, okEm, filaDia, filaForcar, fila:[arq…],
//     procs:[{ cod, arq, grupo, titulo, url, editadoEm:'AAAA-MM-DD'|'', editadoIso, hash, bytes, omit:{imagem,outros}, masc, tipos:[…], conv,
//              secs:[{id,t}], sincEm, erro? }],
//     soLink:[{ cod, titulo, url }] }
//   `erro` ∈ sem-acesso | arquivada | grande | invalida | rede | notion — a página NÃO atualizou (o conteúdo antigo, se houver, fica).
// Linha `ajuda_p_<arq>` (arq = 'ti-14-007'; um upsert só quando o `hash` mudou ou a `conv` subiu):
//   { v:1, conv, cod, titulo, url, editadoEm, secs:[{ id, t, n:1|2, b:[bloco…] }], busca:[{ s, st, x }] }
// Blocos (`t`): p {i} · h {n:3|4, i} · ul|ol {it:[{ i, f?:[bloco…] }]} · nota {ic, cor, b} · cit {b} · cod {ling, x} · mermaid {x} ·
//   tab {cab, l:[linha[célula[inline…]]]} · det {s:[inline…], b} · hr · omit {tipo, url?}
// Inline (lista plana): { x, b?:1, i?:1, c?:1, s?:1, l?:'https://…', p?:'ti-14-011', ps?:slug } e { br:1 }.
//   `l` = link externo (só https); `p` = link para outro processo do manual (link/menção do Notion cujo id está em AJUDA_FONTES).
// Seções: cortadas em heading_1/2; tudo antes do 1º título = `resumo`. id = ajudaSlug(título) (sem acento, ≤ 60, repetido ganha -2).
// `busca[].x` = texto puro da seção, sem acento, minúsculo, espaços colapsados, ≤ 4000 (mermaid e código ficam fora).
// Estado do agendador (teams_estado): `ultimaSincAjuda` = último dia de SP em que a rodada completou.
// SEGURANÇA: texto de fora entra no banco SÓ pelo conversor (sem HTML, link só https) e a tela monta o DOM só com textContent. Valor de credencial
// nunca é copiado (ajudaMascara troca por •••). Respostas de cron/manual/rotas trazem SÓ contagens e códigos — nunca texto do Notion.
import crypto from 'node:crypto';

export const AJUDA_V = 1;
export const AJUDA_CONV_V = 1;                 // sobe quando o conversor muda: reprocessa tudo na próxima rodada
export const AJUDA_RAIZ = 'https://app.notion.com/p/388c69371e178013820beec985c5e773';
export const AJUDA_MAX_BYTES = 300000;         // por linha ajuda_p_*
export const AJUDA_MAX_CHAMADAS_PAG = 150;     // chamadas de blocos por página
export const AJUDA_MAX_BLOCOS = 3000;          // blocos por página
export const AJUDA_PAUSA_MS = 120;             // entre disparos de chamadas em paralelo
export const AJUDA_MIN_PAGINA_MS = 6000;       // não começa página nova com menos orçamento que isto
export const AJUDA_PROF_MAX = 5;               // profundidade de blocos filhos seguida
export const AJUDA_GRUPOS = ['dia', 'entrega', 'negocio', 'insights', 'app', 'admin'];
const NOTION_VERSAO = '2022-06-28';
const TABELA = 'jirainsight_config';
export const ID_INDICE = 'ajuda_indice';
export const RE_ID_AJUDA_P = /^ajuda_p_ti-14-\d{3}$/;
export const RE_ARQ_AJUDA = /^ti-14-\d{3}$/;
const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

// Allowlist de fontes (ids de página não são segredo). TI-14-001 (índice + changelog ≈ 290 KB) não é copiado: vira link (`soLink`).
// `titulo` é só o rótulo de reserva (antes da 1ª sincronização); o título real vem do Notion. `omitir:[palavras]` tira seções pelo título.
const F = (n, id, grupo, titulo, extra) => ({ cod: `TI-14-${n}`, id, arq: `ti-14-${n}`, grupo, titulo, ...(extra || {}) });
export const AJUDA_FONTES = [
  F('001', '388c69371e178034b6dfd5ca9efad81c', 'app', 'Overview Jira Insights', { soLink: true }),
  F('002', '39dc69371e1780b48c62c2e1056ce1cf', 'dia', 'Criar Ticket onde é necessário'),
  F('003', '3a5c69371e1780f8aaf0cda9dd8b8455', 'app', 'Extensão JIRA Insight'),
  F('004', '3a8c69371e17808696a4c7d04b4757ec', 'admin', 'Integração Automática JIRA + SharePoint'),
  F('005', '3abc69371e1780e68214d5e8bac70285', 'admin', 'Integração Jira + Odoo'),
  F('006', '3c3c69371e178067a1acef04b6a58399', 'admin', 'Integração Jira + Finder Mac os'),
  F('007', '3cec69371e17812a9b5dcaaef598991f', 'dia', 'Apontamento de horas no dia a dia'),
  F('008', '3cec69371e17811f9dd9e30a4e934aa1', 'dia', 'Criação de tickets (lote, linguagem natural e voz)'),
  F('009', '3cec69371e1781868349cfad2187057b', 'entrega', 'Gestão de tickets e alertas'),
  F('010', '3cec69371e17817a88bbfad806d18f5b', 'dia', 'Reuniões: agenda, ticket e reclassificação'),
  F('011', '3cec69371e17816d80e2f2235d8f9adf', 'dia', 'Planejamento semanal e aprovação'),
  F('012', '3cec69371e1781a59d80de7a2753cb58', 'entrega', 'Análises, ranking e relatórios'),
  F('013', '3cec69371e178134b5b7daf251c76f2b', 'negocio', 'Controladoria, receita e contratos AMS'),
  F('014', '3cec69371e17817791e9e4b15f3ff382', 'insights', 'Prioridades do time e reunião semanal'),
  F('015', '3cec69371e1781dbbe23c17954ca61f0', 'admin', 'Configuração, metas e acesso ao painel'),
  F('016', '3cec69371e1781b6a91aeec25805e2e4', 'admin', 'Integrações e plataforma'),
  F('017', '3cec69371e178156a485ddba12cb794e', 'app', 'Ajuda, guias interativos e adoção'),
  F('018', '3cec69371e178166afe4f469355e2076', 'admin', 'Bot do Teams para criar tickets com IA'),
  F('019', '3dbc69371e1781ebad03d854f090cdab', 'app', 'Navegação por perfil e mapa do app (Dexterity Hub)'),
  F('020', '3e9c69371e17816e9261cc3b14966ecd', 'app', 'Uso do Dexterity Hub no celular e tablet'),
  F('021', '3e9c69371e17817aa612f3ecaae95503', 'entrega', 'Relatório semanal de sexta e pendências do projeto'),
  F('022', '3e9c69371e1781f2b00ed788e99c5d33', 'entrega', 'Portal do projeto para o cliente'),
  F('023', '3f4c69371e1781f58bb7c31280615ed8', 'dia', 'Ligações (Call tracking)'),
  F('024', '400c69371e1781409d5ec68fa5bbd9f1', 'app', 'Roadmap da solução'),
  F('025', '400c69371e178173880bf0a83cc4bae5', 'dia', 'Planejamento do dia (Hoje)'),
  F('026', '40fc69371e1781b68a6ef578ee7e8190', 'entrega', 'Status report do projeto'),
  F('027', '411c69371e1781969b04c38185acfaae', 'insights', 'Dashboard de KPIs em Insights'),
  F('028', '413c69371e17815a88f7fb381e20dfe8', 'app', 'Dexterity Hub de classe iPad'),
  F('029', '41ec69371e1781d99a45ccdb2eb602bf', 'dia', 'Pendências e bloqueios'),
];
const fontesSync = () => AJUDA_FONTES.filter((f) => !f.soLink && f.publicar !== false);
const fonteDe = (arq) => fontesSync().find((f) => f.arq === arq) || null;
/** A fonte sincronizável de um `arq` (ex.: 'ti-14-007'), ou null (inexistente, soLink ou publicar:false). */
export const fonteDeAjuda = fonteDe;
const idParaArq = () => { const m = new Map(); fontesSync().forEach((f) => m.set(f.id, f.arq)); return m; };

// Ganchos de teste (os handlers não recebem `deps`): fetch lê globalThis.fetch NA HORA da chamada; agora = relógio em ms; pausa = espera.
export const AJUDA_DEPS = {
  fetch: (...a) => globalThis.fetch(...a),
  agora: () => Date.now(),
  pausa: (ms) => new Promise((r) => setTimeout(r, ms)),
};

// ===========================================================================
// Texto: acento, slug, máscara de credenciais, hash
// ===========================================================================
export const ajudaSemAcento = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
/** id estável de seção: sem acento, minúsculo, só [a-z0-9] separados por '-', emojis fora, ≤ 60 caracteres. */
export function ajudaSlug(texto) {
  const s = ajudaSemAcento(texto).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return s || 'secao';
}
const MASC = '•••';
const DOM_HOOK = '(?:webhook\\.office\\.com|logic\\.azure\\.com|powerplatform\\.com|hooks\\.slack\\.com)';
// Ordem importa: o que engole a linha inteira (chave privada, URL de webhook, postgres) vem antes dos padrões de valor.
const PADROES_MASCARA = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----|[\s\S]*$)/g, sub: () => MASC },
  { re: new RegExp(`https?:\\/\\/[^\\s"'<>)\\]]*?${DOM_HOOK}[^\\s"'<>)\\]]*`, 'gi'), sub: () => MASC },
  { re: new RegExp(`(?:[\\w-]+\\.)*${DOM_HOOK}(?::\\d+)?\\/[^\\s"'<>)\\]]*`, 'gi'), sub: () => MASC },
  { re: /postgres(?:ql)?:\/\/[^\s"'<>)\]]+/gi, sub: () => MASC },
  { re: /ATATT3x[\w\-=.+/]{8,}/g, sub: () => MASC },
  { re: /\bntn_[A-Za-z0-9]{10,}/g, sub: () => MASC },
  { re: /\bsecret_[A-Za-z0-9]{20,}/g, sub: () => MASC },
  { re: /\bsk-ant-[\w-]{10,}/g, sub: () => MASC },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, sub: () => MASC },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g, sub: () => MASC },
  { re: /\beyJ[\w-]{20,}\.[\w-]{10,}(?:\.[\w-]*)?/g, sub: () => MASC },
  { re: /\b(Bearer\s+)[\w.\-~+/]{20,}=*/gi, sub: (m, p1) => `${p1}${MASC}` },
  { re: /((?:token|secret|senha|password|api[_ -]?key)["']?\s*[:=]\s*["']?)(?!•••)\S{16,}/gi, sub: (m, p1) => `${p1}${MASC}` },
];
/** Troca valor de credencial por •••. Nome de variável, e-mail, R$ e nome de cliente ficam. Idempotente. → { texto, n } */
export function ajudaMascara(texto) {
  let t = String(texto == null ? '' : texto); let n = 0;
  for (const { re, sub } of PADROES_MASCARA) {
    t = t.replace(re, (...a) => { n += 1; return sub(...a); });
  }
  return { texto: t, n };
}
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v === undefined ? null : v);
}
/** sha256 (hex) do JSON canônico (chaves ordenadas) — estável entre execuções. */
export const ajudaHash = (secs) => crypto.createHash('sha256').update(canon(secs)).digest('hex');

// ===========================================================================
// Links
// ===========================================================================
const HOSTS_NOTION = /(?:^|\.)(?:notion\.so|notion\.site|app\.notion\.com)$/i;
function idNotionDe(s) {
  const txt = String(s || '');
  const u = txt.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (u) return u[0].replace(/-/g, '').toLowerCase();
  let caminho = txt.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0];
  caminho = caminho.replace(/\/+$/, '');
  const seg = caminho.split('/').pop() || '';
  const m = seg.match(/([0-9a-f]{32})$/i);
  return m ? m[1].toLowerCase() : '';
}
/** href → { l } (externo https) | { p } (processo do manual) | null (só o texto). `idPagina` = id do mention, se houver. */
function linkDe(href, st, idPagina, soExterno) {
  const ids = soExterno ? new Map() : ((st && st.ids) || idParaArq());
  if (idPagina) { const a = ids.get(String(idPagina).replace(/-/g, '').toLowerCase()); if (a) return { p: a }; }
  const h = String(href == null ? '' : href).trim();
  if (!h || h.length > 2000) return null;
  if (h.startsWith('/')) { const a = ids.get(idNotionDe(h)); return a ? { p: a } : null; }
  let u;
  try { u = new URL(h); } catch (e) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password) return null;
  if (HOSTS_NOTION.test(u.hostname)) { const a = ids.get(idNotionDe(h)); if (a) return { p: a }; }
  u.protocol = 'https:';
  const out = u.toString();
  const mh = ajudaMascara(out).n;
  if (mh) { if (st) st.masc += mh; return null; }          // href que parece credencial perde o link
  return { l: out };
}

// ===========================================================================
// Conversão: rich_text → inline
// ===========================================================================
export function ajudaNovoCtx(fonte, extra) {
  return { fonte: fonte || null, ids: idParaArq(), filhos: (extra && extra.filhos) || null, masc: 0, tipos: new Set(), omit: { imagem: 0, outros: 0 } };
}
const mascara = (st, t) => { const r = ajudaMascara(t); st.masc += r.n; return r.texto; };
const txtRich = (rt) => (Array.isArray(rt) ? rt : []).map((r) => (r && r.plain_text != null ? String(r.plain_text) : '')).join('');

/** rich_text da API → lista plana de trechos { x, b, i, c, s, l|p } e { br:1 }. Texto sempre mascarado; marcação nunca é HTML. */
export function ajudaInline(richText, ctx) {
  const st = ctx || ajudaNovoCtx();
  const lista = Array.isArray(richText) ? richText.filter((r) => r && typeof r === 'object') : [];
  // credencial partida entre trechos com formatos diferentes: se a máscara do texto inteiro acha mais que a soma das partes, achata num trecho só
  const inteiro = ajudaMascara(lista.map((r) => (r.type === 'equation' && r.equation ? String(r.equation.expression || '') : String(r.plain_text == null ? '' : r.plain_text))).join(''));
  const partes = lista.map((r) => (r.type === 'equation' && r.equation ? String(r.equation.expression || '') : String(r.plain_text == null ? '' : r.plain_text))).map((x) => ajudaMascara(x).texto).join('');
  if (inteiro.n > 0 && inteiro.texto !== partes) { st.masc += inteiro.n; return quebraLinhas(inteiro.texto, {}); }
  const out = [];
  lista.forEach((r) => {
    const an = r.annotations || {};
    const fmt = {};
    if (an.bold) fmt.b = 1; if (an.italic) fmt.i = 1; if (an.code) fmt.c = 1; if (an.strikethrough) fmt.s = 1;
    let texto = r.plain_text == null ? '' : String(r.plain_text);
    let idPag = '';
    if (r.type === 'equation' && r.equation) { texto = String(r.equation.expression || ''); fmt.c = 1; }
    else if (r.type === 'mention' && r.mention) {
      if (r.mention.type === 'user') texto = texto.replace(/^@/, '');
      else if (r.mention.type === 'page' && r.mention.page) idPag = r.mention.page.id;
    }
    texto = mascara(st, texto);
    if (!texto) return;
    const href = (r.type === 'text' && r.text && r.text.link && r.text.link.url) || r.href || '';
    const isUserMention = r.type === 'mention' && r.mention && r.mention.type === 'user';
    const lk = isUserMention ? null : linkDe(href, st, idPag);
    const base = { ...fmt, ...(lk || {}) };
    quebraLinhas(texto, base).forEach((x) => out.push(x));
  });
  return out;
}
function quebraLinhas(texto, base) {
  const out = [];
  String(texto).split('\n').forEach((parte, i) => {
    if (i > 0) out.push({ br: 1 });
    if (parte !== '') out.push({ x: parte, ...base });
  });
  return out;
}
const textoInline = (inl) => (inl || []).map((x) => (x.br ? ' ' : x.x || '')).join('');

// ===========================================================================
// Conversão: blocos → formato próprio
// ===========================================================================
const COR = { blue: 'azul', yellow: 'amarelo', red: 'vermelho', green: 'verde' };
const corDe = (c) => COR[String(c || '').replace(/_background$/, '')] || 'cinza';
const filhosDe = (b, st) => (Array.isArray(b.children) ? b.children : (st.filhos && st.filhos[b.id]) || []);
const ehItem = (t) => t === 'bulleted_list_item' || t === 'numbered_list_item' || t === 'to_do';
const tipoLista = (t) => (t === 'numbered_list_item' ? 'ol' : (t === 'bulleted_list_item' || t === 'to_do') ? 'ul' : '');
const MEDIA_IMG = new Set(['image']);
const MEDIA_OUTROS = new Set(['file', 'pdf', 'video', 'embed', 'audio']);
const FILTRO_MERMAID = [/\bclick\s/i, /href/i, /javascript\s*:/i, /<script/i, /%%\{/, /<img/i, /<iframe/i, /<svg/i, /<object/i, /<embed/i, /foreignobject/i];
function ehMermaidSeguro(x) { return x.length <= 6000 && !FILTRO_MERMAID.some((re) => re.test(x)); }

function expande(lista, st) {
  const out = [];
  (lista || []).forEach((b) => {
    if (!b || typeof b !== 'object') return;
    if (b.type === 'column_list' || b.type === 'column' || b.type === 'synced_block') expande(filhosDe(b, st), st).forEach((x) => out.push(x));
    else out.push(b);
  });
  return out;
}
function dado(b) { return (b && b[b.type]) || {}; }

function listaDe(run, tipo, depth, st) {
  const it = [];
  run.forEach((b) => {
    const d = dado(b);
    let inl = ajudaInline(d.rich_text, st);
    if (b.type === 'to_do') inl = [{ x: d.checked ? '☑ ' : '☐ ' }, ...inl];
    const item = { i: inl };
    const kids = filhosDe(b, st);
    if (kids.length) {
      const f = convBlocos(kids, st, depth + 1);
      if (depth >= 2) {   // mais fundo que 3 níveis achata: as listas filhas viram irmãs
        const resto = [];
        f.forEach((x) => { if (x.t === 'ul' || x.t === 'ol') x.it.forEach((y) => resto.push(y)); else if (!item.f) item.f = [x]; else item.f.push(x); });
        it.push(item); resto.forEach((y) => it.push(y)); return;
      }
      if (f.length) item.f = f;
    }
    it.push(item);
  });
  return { t: tipo, it };
}

function convUm(b, st, depth) {
  const t = b.type; const d = dado(b);
  switch (t) {
    case 'paragraph': {
      const inl = ajudaInline(d.rich_text, st);
      const kids = filhosDe(b, st);
      const out = [];
      if (inl.length && textoInline(inl).trim() !== '') out.push({ t: 'p', i: inl });
      if (kids.length) convBlocos(kids, st, depth + 1).forEach((x) => out.push(x));
      return out;
    }
    case 'heading_1': case 'heading_2': case 'heading_3': case 'heading_4': {
      const inl = ajudaInline(d.rich_text, st);
      const out = inl.length ? [{ t: 'h', n: t === 'heading_4' ? 4 : 3, i: inl }] : [];
      const kids = filhosDe(b, st);
      if (kids.length) convBlocos(kids, st, depth + 1).forEach((x) => out.push(x));
      return out;
    }
    case 'toggle': {
      const s = ajudaInline(d.rich_text, st);
      return [{ t: 'det', s, b: convBlocos(filhosDe(b, st), st, depth + 1) }];
    }
    case 'callout': {
      const inl = ajudaInline(d.rich_text, st);
      const ic = d.icon && d.icon.type === 'emoji' ? String(d.icon.emoji || '').slice(0, 16) : '';
      const bs = [];
      if (inl.length && textoInline(inl).trim() !== '') bs.push({ t: 'p', i: inl });
      convBlocos(filhosDe(b, st), st, depth + 1).forEach((x) => bs.push(x));
      return [{ t: 'nota', ic, cor: corDe(d.color), b: bs }];
    }
    case 'quote': {
      const inl = ajudaInline(d.rich_text, st);
      const bs = [];
      if (inl.length) bs.push({ t: 'p', i: inl });
      convBlocos(filhosDe(b, st), st, depth + 1).forEach((x) => bs.push(x));
      return [{ t: 'cit', b: bs }];
    }
    case 'code': {
      const x = mascara(st, txtRich(d.rich_text));
      const ling = String(d.language || '').toLowerCase().slice(0, 40);
      if (ling === 'mermaid' && ehMermaidSeguro(x)) return [{ t: 'mermaid', x }];
      return [{ t: 'cod', ling, x }];
    }
    case 'equation': return [{ t: 'cod', ling: '', x: mascara(st, String(d.expression || '')) }];
    case 'table': {
      const l = filhosDe(b, st).filter((r) => r && r.type === 'table_row').map((r) => ((dado(r).cells) || []).map((c) => ajudaInline(c, st)));
      return [{ t: 'tab', cab: !!d.has_column_header, l }];
    }
    case 'divider': return [{ t: 'hr' }];
    case 'bookmark': case 'link_preview': {
      const lk = linkDe(d.url, st);
      if (lk && lk.l) {
        const cap = ajudaInline(d.caption, st);
        return [{ t: 'p', i: cap.length ? cap.map((c) => ({ ...c, l: lk.l })) : [{ x: lk.l, l: lk.l }] }];
      }
      st.omit.outros += 1; return [];
    }
    case 'child_page': case 'child_database': case 'link_to_page': {
      const tit = t === 'link_to_page' ? 'página vinculada' : mascara(st, String(d.title || '').trim() || 'página');
      const alvo = t === 'link_to_page' ? (d.page_id || d.database_id || '') : '';
      const lk = linkDe((st.fonte && st.fonte.url) || '', st, alvo, !alvo || !st.ids.get(String(alvo).replace(/-/g, '').toLowerCase()));
      return [{ t: 'p', i: [{ x: `📄 ${tit} — ver no Notion`, ...(lk || {}) }] }];
    }
    case 'table_of_contents': case 'breadcrumb': return [];
    default:
      if (MEDIA_IMG.has(t)) { st.omit.imagem += 1; return [{ t: 'omit', tipo: 'imagem' }]; }
      if (MEDIA_OUTROS.has(t)) { st.omit.outros += 1; return [{ t: 'omit', tipo: t }]; }
      st.tipos.add(String(t || 'desconhecido').slice(0, 40)); st.omit.outros += 1;
      return [];
  }
}
function convBlocos(lista, st, depth) {
  const L = expande(lista, st); const out = []; let i = 0;
  while (i < L.length) {
    const b = L[i];
    if (ehItem(b.type)) {
      const tipo = tipoLista(b.type); const run = [];
      while (i < L.length && tipoLista(L[i].type) === tipo) { run.push(L[i]); i += 1; }
      out.push(listaDe(run, tipo, depth, st));
      continue;
    }
    convUm(b, st, depth).forEach((x) => out.push(x));
    i += 1;
  }
  return out;
}

// texto puro de um bloco (busca): sem acento, minúsculo; mermaid e código ficam de fora
function textoBlocos(bs, out) {
  (bs || []).forEach((b) => {
    if (b.t === 'p' || b.t === 'h') out.push(textoInline(b.i));
    else if (b.t === 'ul' || b.t === 'ol') (b.it || []).forEach((x) => { out.push(textoInline(x.i)); textoBlocos(x.f, out); });
    else if (b.t === 'nota' || b.t === 'cit') textoBlocos(b.b, out);
    else if (b.t === 'det') { out.push(textoInline(b.s)); textoBlocos(b.b, out); }
    else if (b.t === 'tab') (b.l || []).forEach((r) => r.forEach((c) => out.push(textoInline(c))));
  });
  return out;
}
const textoBusca = (bs) => ajudaSemAcento(textoBlocos(bs, []).join(' ')).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 4000);

/**
 * Árvore de blocos da API (cada bloco pode trazer `children`; ou `ctx.filhos = {blockId:[…]}`) → { secs, busca, omit, masc, tipos }.
 * Pura e determinística. `fonte` = { cod, arq, url, omitir? }.
 */
export function ajudaConverte(blocos, fonte, ctx) {
  const st = ajudaNovoCtx(fonte, ctx);
  const L = expande(blocos, st);
  const brutas = [];
  let atual = { t: 'Resumo', n: 2, brutos: [], resumo: true };
  const fecha = () => { brutas.push(atual); };
  L.forEach((b) => {
    if (b.type === 'heading_1' || b.type === 'heading_2') {
      fecha();
      const d = dado(b);
      const titulo = textoInline(ajudaInline(d.rich_text, st)).replace(/\s+/g, ' ').trim() || 'Sem título';
      atual = { t: titulo, n: b.type === 'heading_1' ? 1 : 2, brutos: [] };
      filhosDe(b, st).length && atual.brutos.push(...filhosDe(b, st));
    } else atual.brutos.push(b);
  });
  fecha();
  const omitir = ((fonte && fonte.omitir) || []).map((p) => ajudaSemAcento(p).toLowerCase()).filter(Boolean);
  const usados = new Map(); const secs = []; const busca = [];
  brutas.forEach((s) => {
    const b = convBlocos(s.brutos, st, 0);
    if (s.resumo && !b.length) return;
    if (!s.resumo && omitir.some((p) => ajudaSemAcento(s.t).toLowerCase().includes(p))) return;
    const base = s.resumo ? 'resumo' : ajudaSlug(s.t);
    const k = (usados.get(base) || 0) + 1; usados.set(base, k);
    const id = k === 1 ? base : `${base}-${k}`.slice(0, 64);
    secs.push({ id, t: s.t, n: s.n, b });
    const x = textoBusca(b);
    if (x) busca.push({ s: id, st: s.t, x });
  });
  return { secs, busca, omit: { ...st.omit }, masc: st.masc, tipos: [...st.tipos].sort() };
}

// ===========================================================================
// Validadores (puros): { ok, erro? }
// ===========================================================================
const ehObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
const so = (o, permitidas) => Object.keys(o).every((k) => permitidas.includes(k));
const ehHttps = (s) => typeof s === 'string' && s.length <= 2000 && /^https:\/\/[^\s]+$/.test(s);
function vInline(x) {
  if (!ehObj(x)) return false;
  if (x.br !== undefined) return x.br === 1 && Object.keys(x).length === 1;
  if (!so(x, ['x', 'b', 'i', 'c', 's', 'l', 'p', 'ps'])) return false;
  if (typeof x.x !== 'string' || x.x.length > 20000) return false;
  for (const k of ['b', 'i', 'c', 's']) if (x[k] !== undefined && x[k] !== 1) return false;
  if (x.l !== undefined && !ehHttps(x.l)) return false;
  if (x.p !== undefined && !RE_ARQ_AJUDA.test(String(x.p))) return false;
  if (x.ps !== undefined && !RE_SLUG.test(String(x.ps))) return false;
  return !(x.l !== undefined && x.p !== undefined);
}
const vInls = (a) => Array.isArray(a) && a.length <= 5000 && a.every(vInline);
function vBlocos(a, prof) { return Array.isArray(a) && prof <= 8 && a.length <= 5000 && a.every((b) => vBloco(b, prof)); }
function vBloco(b, prof) {
  if (!ehObj(b) || typeof b.t !== 'string') return false;
  switch (b.t) {
    case 'p': return so(b, ['t', 'i']) && vInls(b.i);
    case 'h': return so(b, ['t', 'n', 'i']) && (b.n === 3 || b.n === 4) && vInls(b.i);
    case 'ul': case 'ol':
      return so(b, ['t', 'it']) && Array.isArray(b.it) && b.it.every((x) => ehObj(x) && so(x, ['i', 'f']) && vInls(x.i) && (x.f === undefined || vBlocos(x.f, prof + 1)));
    case 'nota': return so(b, ['t', 'ic', 'cor', 'b']) && typeof b.ic === 'string' && b.ic.length <= 16 && ['azul', 'amarelo', 'vermelho', 'verde', 'cinza'].includes(b.cor) && vBlocos(b.b, prof + 1);
    case 'cit': return so(b, ['t', 'b']) && vBlocos(b.b, prof + 1);
    case 'cod': return so(b, ['t', 'ling', 'x']) && typeof b.ling === 'string' && b.ling.length <= 40 && typeof b.x === 'string' && b.x.length <= 200000;
    case 'mermaid': return so(b, ['t', 'x']) && typeof b.x === 'string' && b.x.length <= 6000;
    case 'tab': return so(b, ['t', 'cab', 'l']) && typeof b.cab === 'boolean' && Array.isArray(b.l) && b.l.every((r) => Array.isArray(r) && r.every(vInls));
    case 'det': return so(b, ['t', 's', 'b']) && vInls(b.s) && vBlocos(b.b, prof + 1);
    case 'hr': return so(b, ['t']);
    case 'omit': return so(b, ['t', 'tipo', 'url']) && typeof b.tipo === 'string' && b.tipo.length <= 30 && (b.url === undefined || ehHttps(b.url));
    default: return false;
  }
}
const ok = () => ({ ok: true });
const nao = (erro) => ({ ok: false, erro });
/** Valida a linha ajuda_p_<arq> (campo `data`). */
export function ajudaValidaProc(o) {
  if (!ehObj(o)) return nao('não é um objeto');
  if (o.v !== AJUDA_V) return nao('v inválida');
  if (!Number.isInteger(o.conv)) return nao('conv inválida');
  if (!/^TI-14-\d{3}$/.test(String(o.cod || ''))) return nao('cod inválido');
  if (typeof o.titulo !== 'string' || o.titulo.length > 300) return nao('titulo inválido');
  if (!ehHttps(o.url)) return nao('url inválida');
  if (typeof o.editadoEm !== 'string' || !RE_DIA.test(o.editadoEm)) return nao('editadoEm inválido');
  if (!Array.isArray(o.secs) || o.secs.length > 300) return nao('secs inválidas');
  const ids = new Set();
  for (const s of o.secs) {
    if (!ehObj(s) || !so(s, ['id', 't', 'n', 'b'])) return nao('seção com esquema errado');
    if (typeof s.id !== 'string' || !RE_SLUG.test(s.id) || s.id.length > 64 || ids.has(s.id)) return nao('id de seção inválido ou repetido');
    ids.add(s.id);
    if (typeof s.t !== 'string' || s.t.length > 400) return nao('título de seção inválido');
    if (s.n !== 1 && s.n !== 2) return nao('nível de seção inválido');
    if (!vBlocos(s.b, 0)) return nao(`bloco inválido na seção ${s.id}`);
  }
  if (!Array.isArray(o.busca) || o.busca.length > 300) return nao('busca inválida');
  for (const x of o.busca) if (!ehObj(x) || !so(x, ['s', 'st', 'x']) || !ids.has(x.s) || typeof x.st !== 'string' || typeof x.x !== 'string' || x.x.length > 4000) return nao('entrada de busca inválida');
  return ok();
}
/** Valida a linha ajuda_indice (campo `data`). */
export function ajudaValidaIndice(o) {
  if (!ehObj(o)) return nao('não é um objeto');
  if (o.v !== AJUDA_V) return nao('v inválida');
  if (!Number.isInteger(o.conv)) return nao('conv inválida');
  if (!ehHttps(o.raiz)) return nao('raiz inválida');
  for (const k of ['em', 'okEm', 'filaDia']) if (typeof o[k] !== 'string') return nao(`${k} inválido`);
  if (!Array.isArray(o.fila) || !o.fila.every((a) => RE_ARQ_AJUDA.test(String(a)))) return nao('fila inválida');
  if (!Array.isArray(o.procs) || o.procs.length > 200) return nao('procs inválidos');
  const arqs = new Set();
  for (const p of o.procs) {
    if (!ehObj(p)) return nao('proc inválido');
    if (!/^TI-14-\d{3}$/.test(String(p.cod || '')) || !RE_ARQ_AJUDA.test(String(p.arq || '')) || arqs.has(p.arq)) return nao('proc com cod/arq inválido ou repetido');
    arqs.add(p.arq);
    if (!AJUDA_GRUPOS.includes(p.grupo)) return nao('grupo inválido');
    if (typeof p.titulo !== 'string' || !ehHttps(p.url)) return nao('proc com titulo/url inválido');
    if (typeof p.editadoEm !== 'string' || (p.editadoEm !== '' && !RE_DIA.test(p.editadoEm))) return nao('editadoEm inválido');
    if (!Array.isArray(p.secs) || !p.secs.every((s) => ehObj(s) && RE_SLUG.test(String(s.id)) && typeof s.t === 'string')) return nao('secs do proc inválidas');
    if (p.omit !== undefined && !(ehObj(p.omit) && Number.isFinite(p.omit.imagem) && Number.isFinite(p.omit.outros))) return nao('omit inválido');
    if (p.tipos !== undefined && !(Array.isArray(p.tipos) && p.tipos.every((x) => typeof x === 'string'))) return nao('tipos inválidos');
    if (p.erro !== undefined && typeof p.erro !== 'string') return nao('erro inválido');
  }
  if (!Array.isArray(o.soLink) || !o.soLink.every((s) => ehObj(s) && /^TI-14-\d{3}$/.test(String(s.cod)) && typeof s.titulo === 'string' && ehHttps(s.url))) return nao('soLink inválido');
  return ok();
}

// ===========================================================================
// Notion (API oficial, versão 2022-06-28) — só leitura, por blocos
// ===========================================================================
export class AjudaErro extends Error {
  constructor(codigo, status) { super(`ajuda:${codigo}${status ? `:${status}` : ''}`); this.codigo = codigo; this.status = status || 0; }
}
const notionBase = () => (process.env.NOTION_API_URL || 'https://api.notion.com').replace(/\/+$/, '');
async function notionGet(caminho, { ate } = {}) {
  const token = process.env.NOTION_TOKEN || '';
  if (!token) throw new AjudaErro('sem-chave');
  for (let tent = 0; tent < 3; tent += 1) {
    if (ate && AJUDA_DEPS.agora() > ate) throw new AjudaErro('orcamento');
    let r;
    try { r = await AJUDA_DEPS.fetch(`${notionBase()}${caminho}`, { headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSAO, Accept: 'application/json' } }); }
    catch (e) { if (tent < 1) { await AJUDA_DEPS.pausa(300); continue; } throw new AjudaErro('rede'); }
    if (r.status === 429) {
      if (tent >= 2) throw new AjudaErro('limite', 429);
      const ra = Number(r.headers && r.headers.get ? r.headers.get('retry-after') : 0);
      await AJUDA_DEPS.pausa(Math.min(5000, Math.max(200, (Number.isFinite(ra) ? ra : 1) * 1000)));
      continue;
    }
    if (r.status >= 500) { if (tent < 1) { await AJUDA_DEPS.pausa(400); continue; } throw new AjudaErro('notion', r.status); }
    if (r.status === 401) throw new AjudaErro('chave-invalida', 401);
    if (r.status === 404 || r.status === 403) throw new AjudaErro('sem-acesso', r.status);
    if (!r.ok) throw new AjudaErro('notion', r.status);
    try { return await r.json(); } catch (e) { throw new AjudaErro('notion', r.status); }
  }
  throw new AjudaErro('notion');
}
const sem32 = (id) => String(id || '').replace(/-/g, '').toLowerCase();
/** GET /v1/pages/{id} → { id, titulo, url, editadoIso, arquivada } (título = propriedade type 'title', sem o prefixo "TI-14-0NN - "). */
export async function notionPagina(id, { ate } = {}) {
  const p = await notionGet(`/v1/pages/${sem32(id)}`, { ate });
  if (!ehObj(p)) throw new AjudaErro('notion');
  let titulo = '';
  Object.values(p.properties || {}).forEach((pr) => { if (pr && pr.type === 'title' && !titulo) titulo = txtRich(pr.title); });
  titulo = titulo.replace(/^\s*TI-14-\d{3}\s*[-–—]\s*/i, '').replace(/\s+/g, ' ').trim();
  const url = ehHttps(p.url) ? p.url : `https://app.notion.com/p/${sem32(id)}`;
  return { id: sem32(id), titulo, url, editadoIso: String(p.last_edited_time || ''), arquivada: !!(p.archived || p.in_trash) };
}
/** Todos os blocos de uma página (paginado e recursivo; cada bloco ganha `children`). child_page/child_database não são seguidos. */
export async function notionBlocos(id, { ate, maxChamadas = AJUDA_MAX_CHAMADAS_PAG, maxBlocos = AJUDA_MAX_BLOCOS } = {}) {
  const cont = { chamadas: 0, blocos: 0 };
  async function lista(blockId, prof) {
    const out = []; let cursor = '';
    do {
      if (cont.chamadas >= maxChamadas) throw new AjudaErro('grande');
      cont.chamadas += 1;
      const r = await notionGet(`/v1/blocks/${sem32(blockId)}/children?page_size=100${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`, { ate });
      const res = Array.isArray(r && r.results) ? r.results : [];
      cont.blocos += res.length;
      if (cont.blocos > maxBlocos) throw new AjudaErro('grande');
      res.forEach((b) => out.push(b));
      cursor = r && r.has_more && r.next_cursor ? String(r.next_cursor) : '';
    } while (cursor);
    if (prof < AJUDA_PROF_MAX) {
      const seguir = out.filter((b) => b && b.has_children && b.type !== 'child_page' && b.type !== 'child_database');
      for (let i = 0; i < seguir.length; i += 3) {
        if (i > 0) await AJUDA_DEPS.pausa(AJUDA_PAUSA_MS);
        await Promise.all(seguir.slice(i, i + 3).map(async (b) => {
          const origem = b.type === 'synced_block' && b.synced_block && b.synced_block.synced_from && b.synced_block.synced_from.block_id;
          b.children = await lista(origem || b.id, prof + 1);
        }));
      }
    }
    return out;
  }
  const blocos = await lista(id, 0);
  return { blocos, chamadas: cont.chamadas, total: cont.blocos };
}

// ===========================================================================
// Supabase (linhas próprias da jirainsight_config)
// ===========================================================================
function sbDe(sb) {
  // O cliente do cron (sbTeams) não manda Content-Type: sem ele o PostgREST recusa o corpo JSON das gravações.
  if (sb && sb.base && sb.headers) return { base: sb.base, headers: { ...sb.headers, 'Content-Type': 'application/json' } };
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
async function sbRows(r, rot) { if (!r.ok) throw new Error(`Supabase ${r.status} (${rot})`); const j = await r.json(); return Array.isArray(j) ? j : []; }
const sbGet = (S, q, rot) => AJUDA_DEPS.fetch(`${S.base}/rest/v1/${TABELA}?${q}`, { headers: S.headers }).then((r) => sbRows(r, rot));
const idProc = (arq) => `ajuda_p_${arq}`;
async function leIndiceRow(S) { const rows = await sbGet(S, `id=eq.${ID_INDICE}&select=data,updated_at`, 'ler o índice da ajuda'); return rows[0] || null; }
async function gravaProc(S, arq, data) {
  const r = await AJUDA_DEPS.fetch(`${S.base}/rest/v1/${TABELA}?on_conflict=id`, {
    method: 'POST', headers: { ...S.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ id: idProc(arq), data, updated_at: new Date(AJUDA_DEPS.agora()).toISOString() }]),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} (gravar processo)`);
}
// Índice com trava otimista: PATCH filtrado pelo updated_at lido; sem linha, INSERT ignore-duplicates. null = outra escrita chegou antes.
async function gravaIndiceTentativa(S, row, data, agora) {
  const hdr = { ...S.headers, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  let r;
  if (row) {
    const filtro = row.updated_at ? `&updated_at=eq.${encodeURIComponent(row.updated_at)}` : '&updated_at=is.null';
    r = await AJUDA_DEPS.fetch(`${S.base}/rest/v1/${TABELA}?id=eq.${ID_INDICE}${filtro}`, { method: 'PATCH', headers: hdr, body: JSON.stringify({ data, updated_at: agora }) });
  } else {
    r = await AJUDA_DEPS.fetch(`${S.base}/rest/v1/${TABELA}?on_conflict=id`, { method: 'POST', headers: { ...hdr, Prefer: 'return=representation,resolution=ignore-duplicates' }, body: JSON.stringify([{ id: ID_INDICE, data, updated_at: agora }]) });
  }
  if (!r.ok) throw new Error(`Supabase ${r.status} (gravar índice)`);
  const rows = await r.json();
  return (Array.isArray(rows) && rows[0]) || null;
}
function normalizaIndice(d) {
  const o = ehObj(d) ? d : {};
  return {
    v: AJUDA_V, conv: AJUDA_CONV_V, raiz: AJUDA_RAIZ, em: String(o.em || ''), okEm: String(o.okEm || ''), filaDia: String(o.filaDia || ''), filaForcar: !!o.filaForcar,
    fila: (Array.isArray(o.fila) ? o.fila : []).filter((a) => RE_ARQ_AJUDA.test(String(a))),
    procs: (Array.isArray(o.procs) ? o.procs : []).filter((p) => ehObj(p) && RE_ARQ_AJUDA.test(String(p.arq || ''))),
    soLink: [],
  };
}
const soLinkDoCodigo = () => AJUDA_FONTES.filter((f) => f.soLink).map((f) => ({ cod: f.cod, titulo: f.titulo, url: `https://app.notion.com/p/${f.id}` }));
function ordemFontes(procs) { const ordem = fontesSync().map((f) => f.arq); return [...procs].filter((p) => ordem.includes(p.arq)).sort((a, b) => ordem.indexOf(a.arq) - ordem.indexOf(b.arq)); }
async function escreveIndice(S, row, idx, tocadas, agora) {
  let atual = idx; let rowAtual = row;
  for (let tent = 0; tent < 2; tent += 1) {
    const data = { ...atual, v: AJUDA_V, conv: AJUDA_CONV_V, raiz: AJUDA_RAIZ, procs: ordemFontes(atual.procs), soLink: soLinkDoCodigo() };
    const g = await gravaIndiceTentativa(S, rowAtual, data, agora);
    if (g) return data;
    rowAtual = await leIndiceRow(S);
    const rem = normalizaIndice(rowAtual && rowAtual.data);
    const mapa = new Map(rem.procs.map((p) => [p.arq, p]));
    atual.procs.forEach((p) => { if (tocadas.has(p.arq) || !mapa.has(p.arq)) mapa.set(p.arq, p); });
    atual = { ...atual, procs: [...mapa.values()], okEm: [atual.okEm, rem.okEm].sort().pop() || '' };
    if (rem.filaDia === atual.filaDia) atual.fila = atual.fila.filter((a) => rem.fila.includes(a));
  }
  throw new Error('índice da ajuda em conflito (2 tentativas)');
}
const diaSP = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

/** Índice gravado (ou null se não há linha). Lança com o Supabase fora. */
export async function ajudaLeIndice(sb) {
  const S = sbDe(sb); if (!S) throw new Error('Supabase não configurado');
  const row = await leIndiceRow(S);
  return row && ehObj(row.data) ? row.data : null;
}
/** A linha ajuda_p_<arq> (ou null). `arq` fora do padrão → null. */
export async function ajudaLeProc(sb, arq) {
  const S = sbDe(sb); if (!S) throw new Error('Supabase não configurado');
  const a = String(arq || '').toLowerCase();
  if (!RE_ARQ_AJUDA.test(a)) return null;
  const rows = await sbGet(S, `id=eq.${idProc(a)}&select=data`, 'ler processo da ajuda');
  return rows[0] && ehObj(rows[0].data) ? rows[0].data : null;
}
/** [{ p, pt, s, st, x }] de todas as linhas ajuda_p_* (texto de busca por seção). */
export async function ajudaLeBusca(sb) {
  const S = sbDe(sb); if (!S) throw new Error('Supabase não configurado');
  const rows = await sbGet(S, 'id=like.ajuda_p_ti-14-*&select=id,titulo:data->>titulo,busca:data->busca&order=id.asc&limit=200', 'ler busca da ajuda');
  const out = [];
  rows.forEach((r) => {
    if (!RE_ID_AJUDA_P.test(String(r.id || ''))) return;
    const p = r.id.slice('ajuda_p_'.length);
    (Array.isArray(r.busca) ? r.busca : []).forEach((b) => { if (ehObj(b) && typeof b.x === 'string') out.push({ p, pt: String(r.titulo || ''), s: String(b.s || ''), st: String(b.st || ''), x: b.x }); });
  });
  return out;
}
/**
 * O que o índice mostra a quem lê: sem hash/fila/editadoIso/conv; `erro` vira só `desatualizado:true` para todos. `diag` (erros, trechos mascarados,
 * tipos de bloco ignorados) só para gestor/admin.
 */
export function ajudaRecorteIndice(indice, { gestor = false } = {}) {
  const i = normalizaIndice(indice);
  const procs = ordemFontes(i.procs).map((p) => {
    // eslint-disable-next-line no-unused-vars
    const { hash, editadoIso, erro, masc, tipos, conv, fila, ...resto } = p;
    return { ...resto, secs: Array.isArray(p.secs) ? p.secs : [], editadoEm: p.editadoEm || '', desatualizado: !!erro };
  });
  const out = { v: AJUDA_V, raiz: AJUDA_RAIZ, em: i.em, okEm: i.okEm, procs, soLink: soLinkDoCodigo() };
  if (gestor) {
    out.diag = {
      erros: i.procs.filter((p) => p.erro).map((p) => ({ cod: p.cod, erro: p.erro })),
      masc: i.procs.filter((p) => p.masc > 0).map((p) => ({ cod: p.cod, n: p.masc })),
      tipos: i.procs.filter((p) => Array.isArray(p.tipos) && p.tipos.length).map((p) => ({ cod: p.cod, tipos: p.tipos })),
    };
  }
  return out;
}

// ===========================================================================
// Sincronização (retomável, com orçamento de tempo) — só devolve contagens e códigos, nunca texto do Notion
// ===========================================================================
/**
 * Processa a fila de páginas até o orçamento acabar.
 * @param {{sb?:object, agora?:string, orcamentoMs?:number, forcar?:boolean, dry?:boolean, so?:string}} p
 * @returns {Promise<{ok:boolean, semChave?:boolean, erro?:string, verificadas:number, atualizadas:number, iguais:number, falhas:number, pendentes:number,
 *   completo:boolean, ms:number, erros:{cod:string,erro:string}[], aviso?:string, diag?:object[]}>}
 */
export async function ajudaSincroniza({ sb, agora, orcamentoMs = 40000, forcar = false, dry = false, so = '' } = {}) {
  const t0 = AJUDA_DEPS.agora(); const fim = t0 + orcamentoMs;
  const res = { ok: true, verificadas: 0, atualizadas: 0, iguais: 0, falhas: 0, pendentes: 0, completo: false, ms: 0, erros: [] };
  const fecha = (extra) => ({ ...res, ...extra, ms: AJUDA_DEPS.agora() - t0 });
  if (!process.env.NOTION_TOKEN) return fecha({ ok: false, semChave: true });
  const S = sbDe(sb);
  if (!S) return fecha({ ok: false, erro: 'Supabase não configurado' });
  const iso = agora || new Date(t0).toISOString(); const hoje = diaSP(iso);
  const soArq = String(so || '').trim().toLowerCase();
  if (soArq && !fonteDe(soArq)) return fecha({ ok: false, erro: 'so inválido — use o arq de uma fonte (ex.: ti-14-007)' });
  let row;
  try { row = await leIndiceRow(S); } catch (e) { return fecha({ ok: false, erro: String(e.message).slice(0, 200) }); }
  const idx = normalizaIndice(row && row.data);
  const procDe = (arq) => idx.procs.find((p) => p.arq === arq);
  const todos = fontesSync().map((f) => f.arq);
  const nuncaFoi = (a) => { const p = procDe(a); return !(p && p.editadoEm); };
  const ordenaFila = () => [...todos.filter(nuncaFoi), ...todos.filter((a) => !nuncaFoi(a))];
  let fila; let modoForcar = !!forcar;
  if (soArq) fila = [soArq];
  else if (dry) fila = ordenaFila();
  else if (forcar || !idx.fila.length || idx.filaDia !== hoje) { fila = ordenaFila(); idx.filaForcar = !!forcar; }
  else { fila = idx.fila.filter((a) => todos.includes(a)); modoForcar = forcar || idx.filaForcar; }
  if (!soArq && !dry) { idx.filaDia = hoje; idx.fila = [...fila]; }
  const diag = []; const tocadas = new Map(); let fatal = ''; let abortada = false; let desdeGrava = 0;
  const flush = async (final) => {
    if (dry) return;
    idx.em = iso; idx.fila = soArq ? idx.fila : [...fila];
    try { await escreveIndice(S, row, idx, tocadas, iso); row = await leIndiceRow(S); desdeGrava = 0; }
    catch (e) { if (final) throw e; }
  };

  const pagina = async (f) => {
    const pg = await notionPagina(f.id, { ate: fim });
    const old = procDe(f.arq);
    if (pg.arquivada) throw new AjudaErro('arquivada');
    const mesmo = old && old.hash && old.editadoIso === pg.editadoIso && old.conv === AJUDA_CONV_V;
    if (mesmo && !modoForcar && !dry) {
      res.iguais += 1;
      if (old.erro) { const novo = { ...old }; delete novo.erro; novo.sincEm = iso; Object.assign(old, novo); delete old.erro; tocadas.set(f.arq, old); }
      return;
    }
    const arv = await notionBlocos(f.id, { ate: fim });
    const conv = ajudaConverte(arv.blocos, { cod: f.cod, arq: f.arq, url: pg.url, omitir: f.omitir });
    const titulo = ajudaMascara(pg.titulo).texto || f.titulo;
    const editadoEm = pg.editadoIso ? diaSP(pg.editadoIso) : hoje;
    const dados = { v: AJUDA_V, conv: AJUDA_CONV_V, cod: f.cod, titulo, url: pg.url, editadoEm, secs: conv.secs, busca: conv.busca };
    const bytes = Buffer.byteLength(JSON.stringify(dados));
    if (bytes > AJUDA_MAX_BYTES) throw new AjudaErro('grande');
    const v = ajudaValidaProc(dados);
    if (!v.ok) throw new AjudaErro('invalida');
    const hash = ajudaHash(conv.secs);
    // O hash cobre só as seções: título e link também regravam a linha (renomear a página no Notion não mexe nos blocos).
    const reescreve = !old || old.hash !== hash || old.conv !== AJUDA_CONV_V || old.titulo !== titulo || old.url !== pg.url;
    const entrada = {
      cod: f.cod, arq: f.arq, grupo: f.grupo, titulo, url: pg.url, editadoEm, editadoIso: pg.editadoIso, hash, bytes, omit: conv.omit, masc: conv.masc,
      tipos: conv.tipos, conv: AJUDA_CONV_V, secs: conv.secs.map((s) => ({ id: s.id, t: s.t })), sincEm: iso,
    };
    if (dry) {
      if (reescreve) res.atualizadas += 1; else res.iguais += 1;
      diag.push({ cod: f.cod, estado: !old ? 'nova' : reescreve ? 'alterada' : 'igual', secoes: conv.secs.length, bytes, tiposDesconhecidos: conv.tipos, mascarados: conv.masc });
      return;
    }
    if (reescreve) { await gravaProc(S, f.arq, dados); res.atualizadas += 1; desdeGrava += 1; } else res.iguais += 1;
    const i = idx.procs.findIndex((p) => p.arq === f.arq);
    if (i >= 0) idx.procs[i] = entrada; else idx.procs.push(entrada);
    tocadas.set(f.arq, entrada);
  };
  const erroPagina = (f, codigo) => {
    res.falhas += 1; res.erros.push({ cod: f.cod, erro: codigo });
    if (dry) { diag.push({ cod: f.cod, estado: `erro:${codigo}`, secoes: 0, bytes: 0, tiposDesconhecidos: [], mascarados: 0 }); return; }
    let p = procDe(f.arq);
    if (!p) { p = { cod: f.cod, arq: f.arq, grupo: f.grupo, titulo: f.titulo, url: `https://app.notion.com/p/${f.id}`, editadoEm: '', secs: [] }; idx.procs.push(p); }
    p.erro = codigo; p.sincEm = iso; tocadas.set(f.arq, p);
  };

  while (fila.length) {
    if (fim - AJUDA_DEPS.agora() < AJUDA_MIN_PAGINA_MS) break;
    const f = fonteDe(fila[0]);
    if (!f) { fila.shift(); continue; }
    try { await pagina(f); }
    catch (e) {
      const c = e && e.codigo;
      if (c === 'chave-invalida') { fatal = 'chave-invalida'; break; }
      if (c === 'orcamento') { abortada = true; break; }
      if (c === 'limite') { abortada = true; res.aviso = 'limite-notion'; break; }
      if (c) erroPagina(f, c);
      else { fatal = `supabase: ${String(e && e.message ? e.message : e).slice(0, 160)}`; break; }
    }
    res.verificadas += 1; fila.shift();
    if (desdeGrava >= 5) await flush(false);
  }
  const completo = !fatal && !abortada && fila.length === 0;
  if (completo && !dry && !soArq) {
    try {
      const rows = await sbGet(S, 'id=like.ajuda_p_ti-14-*&select=id&limit=500', 'listar linhas da ajuda');
      const velhas = rows.map((r) => r.id).filter((id) => RE_ID_AJUDA_P.test(String(id)) && !todos.includes(String(id).slice('ajuda_p_'.length)));
      if (velhas.length) await AJUDA_DEPS.fetch(`${S.base}/rest/v1/${TABELA}?id=in.(${velhas.map(encodeURIComponent).join(',')})`, { method: 'DELETE', headers: { ...S.headers, Prefer: 'return=minimal' } });
    } catch (e) { /* limpeza é best-effort: a próxima rodada completa tenta de novo */ }
    idx.procs = idx.procs.filter((p) => todos.includes(p.arq));
    idx.okEm = iso; idx.filaForcar = false;
  }
  try { await flush(true); } catch (e) { return fecha({ ok: false, erro: String(e.message).slice(0, 200), pendentes: fila.length }); }
  return fecha({ ok: !fatal, ...(fatal ? { erro: fatal } : {}), pendentes: fila.length, completo, ...(dry ? { diag } : {}) });
}
