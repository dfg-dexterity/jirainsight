// 🌐 PORTAL DO PROJETO — a visão externa que o cliente vê (2026-09-28, a pedido do usuário):
// progresso por épicos e marcos, pendências que dependem dele, decisões a tomar, riscos,
// time, próximas reuniões, FAQ, links, pasta e canal do Teams — sem acesso ao Jira.
//
// Três regras que este arquivo protege:
//  · UM ÚNICO PONTO DE SAÍDA para o cliente: portalProjetoPayload() monta o JSON por
//    ALLOWLIST (ESQUEMA abaixo) e assertAllowlist() reprova qualquer chave fora dela — é
//    a garantia de que responsável por ticket, horas por pessoa, custo, comentário, e-mail,
//    saúde/inconsistências internas e o que é de parceria nunca escapam por acidente.
//  · O ESCOPO é do contrato da sessão: `key ∈ c.projetos` E o projeto está publicado para
//    ESSE contrato — fora disso a resposta é o mesmo 404 do inexistente (não se aprende
//    que chaves existem).
//  · O conteúdo curado (riscos, FAQ, pendências, equipe, links) mora em tabelas próprias
//    (jirainsight_portal_projetos / _itens), nunca na config compartilhada, que desce
//    inteira para o navegador de todo o time e tem teto de 256 KB.
// A lógica pesada fica aqui (api/_lib não conta como função serverless); as rotas
// ?pcli=… estão em api/config.js — o limite de 12 funções da Vercel continua respeitado.
import { cacheGet, cacheSetTTL, cacheClear, jiraSearchAll, jiraUsuariosAtivos, textoComentario } from './util.js';
import { fichaProjeto, carregaCatalogoProjetos } from './projetos.js';
import { cronogramaDoProjeto, crDias, crAddDias } from './cronograma.js';
import { graphToken } from '../reunioes.js';

export const T_PROJ = 'jirainsight_portal_projetos';
export const T_ITENS = 'jirainsight_portal_itens';
export const T_DEC = 'jirainsight_decisoes';
export const T_CONTAS = 'jirainsight_portal_contas';
const T_CFG = 'jirainsight_config';

export const RE_PROJ = /^[A-Za-z][A-Za-z0-9_]*$/;
export const RE_EPICO = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;
const RE_UUID = /^[0-9a-f-]{36}$/i;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
// "Aguardando cliente" NO PORTAL: só status cujo NOME diz que a bola está com o cliente — precisa
// citar cliente/customer DEPOIS de aguardando/pendente/waiting/espera. É de propósito mais ESTRITA
// que o preset "Aguardando cliente" da 🧰 Gestão (GX_RE_AGUARDA_CLIENTE em 20-gestao.js), que
// pode continuar larga porque quem a lê é o time: aqui, "Aguardando deploy" ou "Waiting for
// approval" virariam cobrança ao cliente com o resumo interno exposto. O front não importa daqui
// (scripts clássicos, sem build); scripts/check-cronograma-paridade.mjs confere, sobre uma lista
// de nomes de status, que tudo o que esta expressão aceita a interna também aceita (subconjunto).
export const RE_AGUARDA_CLIENTE = /(aguard|pendent|waiting)\w*.*?\b(client|customer)/i;

export const PORTAL_TIPOS = ['pendencia', 'risco', 'faq', 'reuniao'];
export const PORTAL_BLOCOS = ['progresso', 'cronograma', 'pendencias', 'decisoes', 'riscos', 'equipe', 'reunioes', 'faq', 'links'];
// Situação por TIPO de item: pendência abre e fecha; risco é acompanhado, mitigado ou encerrado;
// reunião manual só sai da lista quando encerrada; FAQ não tem situação (fica sempre "aberto").
export const ITEM_STATUS_POR_TIPO = { pendencia: ['aberto', 'feito'], risco: ['aberto', 'mitigado', 'encerrado'], faq: ['aberto'], reuniao: ['aberto', 'encerrado'] };
export const ITEM_STATUS = [...new Set(Object.values(ITEM_STATUS_POR_TIPO).flat())];
export const ITEM_NIVEIS = ['alto', 'medio', 'baixo'];
const DIAS_REUNIOES = 30;          // janela das próximas reuniões
const CAL_TTL_MIN = 5;             // cache do calendário (dentro do cache do payload)
function ttlMin() { return Number(process.env.PORTAL_CACHE_MIN) || 10; }   // TTL do payload (env só para testes)

// Link externo: só http(s), no máximo 900 caracteres — mesma regra do pcUrl das parcerias.
export function pcUrl(u) { const s = String(u || '').trim(); return /^https?:\/\/[^\s<>"']+$/i.test(s) ? s.slice(0, 900) : ''; }
export function ehGuid(s) { return RE_GUID.test(String(s || '').trim()); }
// Calendário do projeto: e-mail da caixa compartilhada OU GUID do grupo M365 — nada mais.
export function calendarioValido(s) { const v = String(s || '').trim(); return !v || RE_EMAIL.test(v) || ehGuid(v); }
const txt = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// ---------------------------------------------------------------------------
// Supabase (PostgREST). As leituras LANÇAM em falha (rede, 5xx): uma falha transitória não pode
// virar "lista vazia" — o payload montado sem FAQ/riscos/pendências ficaria 10 min em cache
// (memória + linha durável) como se fosse verdade. Quem chama responde 502 e nada é gravado.
// `sb` = { base, headers } montado pelo api/config.js.
// ---------------------------------------------------------------------------
export async function sbLe(sb, caminho) {
  const r = await fetch(`${sb.base}/rest/v1/${caminho}`, { headers: sb.headers });
  if (!r.ok) { const e = new Error(`Supabase ${r.status} ao ler ${caminho.split('?')[0]}`); e.status = r.status; throw e; }
  const j = await r.json(); return Array.isArray(j) ? j : [];
}
async function sbEscreve(sb, caminho, metodo, corpo, prefer) {
  const r = await fetch(`${sb.base}/rest/v1/${caminho}`, {
    method: metodo, headers: { ...sb.headers, Prefer: prefer || 'return=representation' }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
  if ((prefer || '').includes('minimal')) return [];
  const j = await r.json().catch(() => []); return Array.isArray(j) ? j : [];
}
const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Config curada por projeto (jsonb `config` da jirainsight_portal_projetos)
// ---------------------------------------------------------------------------
export function configPadrao() {
  return { teamsUrl: '', pasta: '', calendario: '', links: [], equipe: [], epicosOcultos: [], mostrarAta: false,
    blocos: Object.fromEntries(PORTAL_BLOCOS.map((b) => [b, true])), apresentacao: '' };
}
// Normaliza a config: `estrito` (gravação pelo gestor) devolve erro no primeiro campo
// inválido; sem `estrito` (leitura) só descarta o que não presta.
export function normalizaConfig(bruta, projeto, estrito) {
  const b = (bruta && typeof bruta === 'object' && !Array.isArray(bruta)) ? bruta : {};
  const out = configPadrao();
  const erro = (m) => ({ ok: false, erro: m });
  for (const campo of ['teamsUrl', 'pasta']) {
    const v = txt(b[campo], 900);
    if (v && !pcUrl(v)) { if (estrito) return erro(`${campo === 'pasta' ? 'Pasta do SharePoint' : 'Canal do Teams'}: use um link http(s).`); }
    else out[campo] = v;
  }
  const cal = txt(b.calendario, 200);
  if (cal && !calendarioValido(cal)) { if (estrito) return erro('Calendário do projeto: informe o e-mail da caixa compartilhada ou o GUID do grupo do Teams.'); }
  else out.calendario = cal;
  const links = Array.isArray(b.links) ? b.links.slice(0, 30) : [];
  for (const l of links) {
    const url = pcUrl(l && l.url);
    if (!url) { if (estrito) return erro(`Link "${txt(l && l.nome, 40) || '?'}": use um endereço http(s).`); continue; }
    out.links.push({ nome: txt(l.nome, 80) || url.slice(0, 80), url, tipo: txt(l.tipo, 30) });
  }
  const equipe = Array.isArray(b.equipe) ? b.equipe.slice(0, 30) : [];
  for (const p of equipe) {
    const nome = txt(p && p.nome, 80); if (!nome) continue;
    out.equipe.push({ nome, papel: txt(p.papel, 80), contato: txt(p.contato, 120) });
  }
  const ocultos = Array.isArray(b.epicosOcultos) ? b.epicosOcultos.slice(0, 200) : [];
  for (const k of ocultos) {
    const key = txt(k, 40).toUpperCase();
    if (!RE_EPICO.test(key) || (projeto && key.split('-')[0] !== String(projeto).toUpperCase())) { if (estrito) return erro(`Épico oculto "${key}" não é deste projeto.`); continue; }
    if (!out.epicosOcultos.includes(key)) out.epicosOcultos.push(key);
  }
  out.mostrarAta = b.mostrarAta === true;
  if (b.blocos && typeof b.blocos === 'object') PORTAL_BLOCOS.forEach((k) => { if (k in b.blocos) out.blocos[k] = b.blocos[k] !== false; });
  out.apresentacao = txt(b.apresentacao, 600);
  return { ok: true, config: out };
}

// Linha da tabela → o que o gestor vê (o cliente nunca recebe este objeto inteiro).
export function projetoPublico(row, extra) {
  const cfg = normalizaConfig(row && row.config, row && row.projeto).config;
  return { projeto: row.projeto, contratoId: row.contrato_id, publicado: !!row.publicado, config: cfg,
    atualizadoEm: row.atualizado_em || '', atualizadoPor: row.atualizado_por || '', ...(extra || {}) };
}

// ---------------------------------------------------------------------------
// Itens curados (jirainsight_portal_itens): validação e forma pública (camelCase)
// ---------------------------------------------------------------------------
// Data de calendário de verdade (não só o formato): "2026-13-45" e "2026-02-30" não passam —
// o Postgres recusaria a coluna `date` e o erro voltaria cru para o gestor.
export function dataValida(iso) {
  if (!RE_DATA.test(String(iso || ''))) return false;
  const t = Date.parse(`${iso}T12:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso;
}
// Data/hora de reunião manual → instante ISO. Um valor SEM fuso ("AAAA-MM-DDTHH:mm", o que um
// <input type=datetime-local> manda) é horário de Brasília e ganha -03:00; só a data vira
// meia-noite de Brasília. Sem isso, na Vercel (TZ=UTC) "14:00" chegaria ao cliente como 11:00 e
// "AAAA-MM-DD" cairia às 21:00 do dia anterior. null = vazio; undefined = inválido.
const RE_ISO_SEM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;
const RE_ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
export function isoData(v) {
  let s = txt(v, 40); if (!s) return null;
  if (RE_DATA.test(s)) s += 'T00:00:00-03:00'; else if (RE_ISO_SEM_FUSO.test(s)) s += '-03:00';
  if (!RE_ISO_COM_FUSO.test(s) || !dataValida(s.slice(0, 10))) return undefined;
  const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}
export function normalizaItem(bruto, projeto) {
  const b = (bruto && typeof bruto === 'object') ? bruto : {};
  const erro = (m) => ({ ok: false, erro: m });
  const tipo = txt(b.tipo, 20);
  if (!PORTAL_TIPOS.includes(tipo)) return erro('Tipo inválido (pendencia, risco, faq ou reuniao).');
  const titulo = txt(b.titulo, 200);
  if (!titulo) return erro(tipo === 'faq' ? 'Escreva a pergunta.' : 'Escreva o título.');
  const reg = { projeto, tipo, titulo, descricao: txt(b.descricao, 2000) || null,
    resp_nome: txt(b.respNome, 80) || null, resp_lado: null, prazo: null, inicio: null, fim: null, link: null,
    prob: null, impacto: null, mitigacao: null, status: 'aberto', visivel: b.visivel !== false,
    ordem: Number.isFinite(+b.ordem) ? Math.round(+b.ordem) : 0 };
  const lado = txt(b.respLado, 20);
  if (lado && !['dexterity', 'cliente'].includes(lado)) return erro('Lado do responsável: dexterity ou cliente.');
  // Pendência sem lado cairia em "O que a Dexterity precisa de você" por omissão: o lado é obrigatório.
  if (tipo === 'pendencia' && !lado) return erro('Pendência: informe de quem ela depende (cliente ou dexterity).');
  if (lado) reg.resp_lado = lado;
  const prazo = txt(b.prazo, 10);
  if (prazo) { if (!dataValida(prazo)) return erro('Prazo: use uma data válida no formato AAAA-MM-DD.'); reg.prazo = prazo; }
  const st = txt(b.status, 20) || 'aberto';
  const permitidos = ITEM_STATUS_POR_TIPO[tipo];
  if (!permitidos.includes(st)) return erro(tipo === 'faq' ? 'FAQ não tem situação.' : `Situação inválida para ${tipo} (${permitidos.join(', ')}).`);
  reg.status = st;
  if (tipo === 'reuniao') {
    const ini = isoData(b.inicio); const fim = isoData(b.fim);
    if (ini === undefined || fim === undefined) return erro('Reunião: data/hora inválida.');
    if (!ini) return erro('Reunião: informe o início.');
    if (fim && fim < ini) return erro('Reunião: o fim não pode ser antes do início.');
    reg.inicio = ini; reg.fim = fim;
    const link = txt(b.link, 900);
    if (link && !pcUrl(link)) return erro('Link da reunião: use um endereço http(s).');
    reg.link = link || null;
  }
  if (tipo === 'risco') {
    for (const campo of ['prob', 'impacto']) {
      const v = txt(b[campo], 10);
      if (v && !ITEM_NIVEIS.includes(v)) return erro(`${campo === 'prob' ? 'Probabilidade' : 'Impacto'}: alto, medio ou baixo.`);
      reg[campo] = v || null;
    }
    reg.mitigacao = txt(b.mitigacao, 1000) || null;
  }
  return { ok: true, reg };
}
export function itemPublico(r) {
  return { id: r.id, projeto: r.projeto, tipo: r.tipo, titulo: r.titulo || '', descricao: r.descricao || '',
    respNome: r.resp_nome || '', respLado: r.resp_lado || '', prazo: r.prazo || '', inicio: r.inicio || '', fim: r.fim || '',
    link: r.link || '', prob: r.prob || '', impacto: r.impacto || '', mitigacao: r.mitigacao || '', status: r.status || 'aberto',
    visivel: r.visivel !== false, ordem: r.ordem || 0, criadoPor: r.criado_por || '', criadoEm: r.criado_em || '',
    atualizadoPor: r.atualizado_por || '', atualizadoEm: r.atualizado_em || '' };
}

// ---------------------------------------------------------------------------
// Allowlist do payload do cliente — a forma EXATA do que sai. Chave fora daqui = erro.
// ---------------------------------------------------------------------------
const ESQUEMA = {
  v: 0, cliente: '', projeto: { key: '', nome: '' }, apresentacao: '', atualizadoEm: '',
  blocos: Object.fromEntries(PORTAL_BLOCOS.map((b) => [b, true])),
  progresso: { pct: 0, itens: { total: 0, concluidos: 0 }, marcos: { total: 0, concluidos: 0, proximo: { nome: '', data: '' } },
    maiorAtrasoDias: 0, previsaoFim: '', ultimoMarco: '', previsaoRitmo: '', semaforo: '' },
  epicos: [{ k: '', nome: '', ini: '', fim: '', pct: 0, status: '', atrasoDias: 0 }],
  pendencias: [{ id: '', k: '', titulo: '', lado: '', desde: '', prazo: '', dias: 0, origem: '' }],
  decisoes: [{ titulo: '', contexto: '', dono: '', prazo: '', status: '', ata: '' }],
  riscos: [{ titulo: '', prob: '', impacto: '', mitigacao: '', resp: '', status: '' }],
  equipe: [{ nome: '', papel: '', contato: '' }],
  reunioes: [{ titulo: '', inicio: '', fim: '', link: '', local: '', origem: '' }],
  faq: [{ pergunta: '', resposta: '' }],
  links: [{ nome: '', url: '', tipo: '' }],
  pasta: '', teamsUrl: '',
};
export function assertAllowlist(obj, esq, caminho) {
  const e = esq === undefined ? ESQUEMA : esq; const c = caminho || 'payload';
  if (obj === null || obj === undefined) return true;
  if (Array.isArray(e)) {
    if (!Array.isArray(obj)) throw new Error(`allowlist: ${c} deveria ser lista`);
    obj.forEach((x, i) => assertAllowlist(x, e[0], `${c}[${i}]`)); return true;
  }
  if (e && typeof e === 'object') {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error(`allowlist: ${c} deveria ser objeto`);
    for (const k of Object.keys(obj)) {
      if (!Object.prototype.hasOwnProperty.call(e, k)) throw new Error(`allowlist: chave fora do esquema em ${c}.${k}`);
      assertAllowlist(obj[k], e[k], `${c}.${k}`);
    }
    return true;
  }
  if (obj && typeof obj === 'object') throw new Error(`allowlist: ${c} deveria ser valor simples`);
  return true;
}

// ---------------------------------------------------------------------------
// Cache do payload: linha 'portal_<KEY>' na jirainsight_config ({em, dados}) é a VERDADE sobre
// qual versão vale (sobrevive à partida a frio e é uma só para todas as instâncias); a memória
// da instância guarda {em, dados} e só serve quando o carimbo `em` bate com o da linha — lido a
// cada pedido com `select=data->em` (uma leitura leve, sem o payload). É isso que faz uma
// invalidação feita por OUTRA instância (o gestor escondeu uma decisão, um FAQ, um épico; trocou
// o contrato; admin-refresh) valer em todas na hora, e não só na que gravou até o TTL vencer.
// TTL 10 min; invalidar = em:0 + `limpo` (carimbo da limpeza, ver _jiraLido).
// ---------------------------------------------------------------------------
const ckPay = (key) => `portal:pay:${key}`;
// Quando ESTA instância leu o Jira pela última vez para o portal de cada projeto: se a linha
// durável diz que alguém pediu "atualizar" (limpo) depois disso, a próxima montagem relê o
// Jira (ficha e pendências) em vez de usar os caches de memória visao:proj:/portal:aguarda:.
const _jiraLido = {};
export async function portalCacheLe(sb, key) {
  const id = `portal_${enc(key)}`;
  const carimbo = (await sbLe(sb, `${T_CFG}?id=eq.${id}&select=data->em,data->limpo`))[0] || null;
  const em = Number(carimbo && carimbo.em) || 0;
  const limpo = Number(carimbo && carimbo.limpo) || 0;
  if (!em || Date.now() - em > ttlMin() * 60000) return { dados: null, limpo };
  const m = cacheGet(ckPay(key));
  if (m && m.em === em && m.dados) return { dados: m.dados, limpo };
  const row = (await sbLe(sb, `${T_CFG}?id=eq.${id}&select=data`))[0];
  const d = row && row.data;
  if (!d || Number(d.em) !== em || !d.dados) return { dados: null, limpo };
  cacheSetTTL(ckPay(key), { em, dados: d.dados }, ttlMin());
  return { dados: d.dados, limpo };
}
export async function portalCacheGrava(sb, key, dados) {
  const em = Date.now();
  try {
    await sbEscreve(sb, `${T_CFG}?on_conflict=id`, 'POST', [{ id: `portal_${key}`, data: { em, dados }, updated_at: new Date().toISOString() }],
      'resolution=merge-duplicates,return=minimal');
    cacheSetTTL(ckPay(key), { em, dados }, ttlMin());   // só depois de a linha existir: a memória nunca vale sem carimbo igual na linha
  } catch (e) { /* sem a linha, o próximo pedido recalcula — o cache é conforto, não verdade */ }
}
// Invalida o payload em TODAS as instâncias (linha em:0) e, nesta, a ficha do Jira; o carimbo
// `limpo` faz as outras instâncias relerem o Jira na próxima montagem: "atualizar" para o gestor
// é ver o Jira de agora, e não só na instância em que o clique caiu.
export async function portalCacheLimpa(sb, key) {
  cacheClear(ckPay(key)); cacheClear(`visao:proj:${key}`); cacheClear(`portal:aguarda:${key}`); cacheClear('portal:cal:');
  delete _jiraLido[key];
  try {
    await sbEscreve(sb, `${T_CFG}?on_conflict=id`, 'POST', [{ id: `portal_${key}`, data: { em: 0, limpo: Date.now() }, updated_at: new Date().toISOString() }],
      'resolution=merge-duplicates,return=minimal');
  } catch (e) { /* idem */ }
}

// ---------------------------------------------------------------------------
// 📅 Calendário do projeto (Microsoft Graph, credenciais de aplicativo já existentes).
// `calendario` = e-mail da caixa compartilhada (users/{upn}) OU GUID do grupo M365 (groups/{id},
// exige Group.Read.All). Só campos públicos: NUNCA attendees, organizer ou body. Cancelados e
// privados ficam de fora. Erros voltam como {erro} — quem decide mostrar é o chamador (o
// gestor vê na configuração; o cliente vê o bloco vazio).
// ---------------------------------------------------------------------------
// Graph devolve "2026-10-04T10:00:00.0000000" já no fuso pedido (Prefer outlook.timezone):
// vira ISO com o offset de São Paulo (-03:00, sem horário de verão) — o mesmo formato das
// reuniões manuais, para a lista ordenar por string sem misturar fusos.
const isoSP = (x) => { const m = String((x && x.dateTime) || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?/); return m ? `${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:${m[4] || '00'}-03:00` : ''; };
// Instante qualquer (ISO em UTC do Postgres, por exemplo) → ISO no fuso de São Paulo.
export function isoSPde(v) {
  const t = Date.parse(String(v || '')); if (!Number.isFinite(t)) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`;
}
export async function calendarioDoProjeto(calendario, de, ate) {
  const cal = String(calendario || '').trim();
  if (!cal || !calendarioValido(cal)) return { erro: 'invalido', eventos: [] };
  if (!process.env.MS_TENANT_ID || !process.env.MS_CLIENT_ID || !process.env.MS_CLIENT_SECRET) return { erro: 'nao-configurado', eventos: [] };
  const ck = `portal:cal:${cal.toLowerCase()}|${de}|${ate}`;
  const c = cacheGet(ck); if (c) return c;
  let tok;
  try { tok = await graphToken(); } catch (e) { return { erro: 'falha', eventos: [] }; }
  const alvo = ehGuid(cal) ? `groups/${cal}` : `users/${enc(cal)}`;
  const url = `https://graph.microsoft.com/v1.0/${alvo}/calendarView?startDateTime=${enc(`${de}T00:00:00-03:00`)}&endDateTime=${enc(`${ate}T23:59:59-03:00`)}`
    + '&$select=subject,start,end,location,onlineMeeting,onlineMeetingUrl,isCancelled,sensitivity,isAllDay&$orderby=start/dateTime&$top=50';
  let r; let j;
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${tok}`, Prefer: 'outlook.timezone="America/Sao_Paulo"', Accept: 'application/json' } });
    j = await r.json().catch(() => ({}));
  } catch (e) { return { erro: 'falha', eventos: [] }; }
  // Sem permissão: fica 1 min em cache (não adianta insistir). Falha transitória (5xx): NÃO entra em cache —
  // o payload sai sem os eventos e também não é guardado, então a próxima leitura tenta de novo.
  if (r.status === 403 || r.status === 401) return cacheSetTTL(ck, { erro: 'permissao', eventos: [] }, 1);
  if (!r.ok) return { erro: 'falha', eventos: [] };
  const eventos = (j.value || [])
    .filter((e) => e && !e.isCancelled && e.sensitivity !== 'private' && e.sensitivity !== 'confidential')
    .map((e) => ({ titulo: txt(e.subject, 160) || '(sem título)', inicio: isoSP(e.start), fim: isoSP(e.end),
      link: pcUrl((e.onlineMeeting && e.onlineMeeting.joinUrl) || e.onlineMeetingUrl || ''), local: txt(e.location && e.location.displayName, 120), origem: 'calendario' }))
    .filter((e) => e.inicio);
  return cacheSetTTL(ck, { erro: '', eventos }, CAL_TTL_MIN);
}

// ---------------------------------------------------------------------------
// Pendências vindas do Jira: tickets do projeto em status "aguardando cliente" — só chave,
// assunto e há quantos dias (desde a última movimentação). Sem responsável, sem descrição.
// Cada uma sai com o `epico` a que pertence (pai, ou avô quando o pai é história), porque um
// épico OCULTO pelo gestor esconde também os filhos: o filtro por ocultos é feito por quem
// monta o payload, DEPOIS deste cache — a lista de ocultos muda sem invalidar a busca.
// ---------------------------------------------------------------------------
const ehEpico = (t) => !!t && (t.name === 'Epic' || t.hierarchyLevel === 1);
async function aguardandoCliente(key, hoje, nocache) {
  const ck = `portal:aguarda:${key}`;
  if (!nocache) { const c = cacheGet(ck); if (c) return c; }
  const { issues } = await jiraSearchAll({ jql: `project = "${key}" AND statusCategory != Done ORDER BY updated ASC`,
    fields: ['summary', 'status', 'updated', 'duedate', 'parent', 'issuetype'], pageSize: 100, maxPages: 5 });
  const mapa = {}; issues.forEach((it) => { mapa[it.key] = it; });
  const aguardam = issues.filter((it) => RE_AGUARDA_CLIENTE.test(String((it.fields && it.fields.status && it.fields.status.name) || '')));
  // Pais que não estão entre os abertos (história já concluída com filho ainda aguardando):
  // uma busca só por chave, só com o que precisa para subir um nível.
  const pais = [...new Set(aguardam.map((it) => it.fields && it.fields.parent && it.fields.parent.key).filter((k) => k && !mapa[k] && RE_EPICO.test(k)))];
  if (pais.length) {
    const r = await jiraSearchAll({ jql: `key in (${pais.slice(0, 100).join(', ')})`, fields: ['parent', 'issuetype'], pageSize: 100, maxPages: 1 });
    r.issues.forEach((it) => { mapa[it.key] = it; });
  }
  const epicoDe = (it) => {
    const f = it.fields || {};
    if (ehEpico(f.issuetype)) return it.key;
    const p = f.parent; if (!p) return '';
    const pi = mapa[p.key];
    if (!pi || ehEpico((pi.fields || {}).issuetype)) return p.key;
    const pp = (pi.fields || {}).parent; return pp ? pp.key : p.key;
  };
  const out = aguardam.map((it) => { const f = it.fields || {}; const desde = String(f.updated || '').slice(0, 10);
    return { k: it.key, titulo: txt(f.summary, 160), lado: 'cliente', desde, prazo: f.duedate || '', dias: desde ? Math.max(0, crDias(desde, hoje)) : 0, origem: 'jira', epico: epicoDe(it) }; });
  return cacheSetTTL(ck, out, 5);
}

// Chaves Jira do contrato, saneadas e em MAIÚSCULAS: a tabela grava a chave assim, e o
// gestor pode ter digitado "acme" no contrato — a comparação nunca depende disso.
export function projetosDoContrato(c) {
  return (Array.isArray(c && c.projetos) ? c.projetos : []).map((k) => String(k || '').trim().toUpperCase()).filter((k) => RE_PROJ.test(k));
}
// O contrato "dono" de um projeto para o gestor (preview/sugestões): o da linha publicada
// quando existe; senão o primeiro contrato que lista a chave. null = projeto sem contrato.
export async function contratoDoProjeto(sb, contratos, key) {
  const lista = Array.isArray(contratos) ? contratos.filter(Boolean) : [];
  if (!RE_PROJ.test(key)) return null;
  const row = (await sbLe(sb, `${T_PROJ}?projeto=eq.${enc(key)}&select=contrato_id`))[0];
  const daLinha = row && lista.find((x) => String(x.id) === String(row.contrato_id));
  return daLinha || lista.find((x) => projetosDoContrato(x).includes(key)) || null;
}

// Linha do projeto no portal + checagem de escopo. Devolve null quando o cliente não pode ver.
async function linhaDoProjeto(sb, c, key, preview) {
  if (!c || !RE_PROJ.test(key) || !projetosDoContrato(c).includes(key)) return null;
  const row = (await sbLe(sb, `${T_PROJ}?projeto=eq.${enc(key)}&select=*`))[0] || null;
  if (row && String(row.contrato_id) !== String(c.id)) return null;         // publicado para OUTRO contrato
  if (!preview && !(row && row.publicado)) return null;                      // rascunho: o cliente não vê
  return row || { projeto: key, contrato_id: c.id, publicado: false, config: {} };
}

// ---------------------------------------------------------------------------
// O PAYLOAD DO CLIENTE. {sb, c (contrato da sessão), key, hoje, preview} → objeto da allowlist,
// ou null (fora do escopo / não publicado). `deps` permite trocar as fontes nos testes.
// ---------------------------------------------------------------------------
export async function portalProjetoPayload({ sb, c, key, hoje, preview, deps }) {
  const d = { ficha: fichaProjeto, aguardando: aguardandoCliente, calendario: calendarioDoProjeto, ...(deps || {}) };
  const row = await linhaDoProjeto(sb, c, key, preview);
  if (!row) return null;
  const { dados: cache, limpo } = await portalCacheLe(sb, key);
  if (cache) return cache;

  const cfg = normalizaConfig(row.config, key).config;
  const on = (b) => cfg.blocos[b] !== false;   // bloco desligado pelo gestor: NADA dele viaja (não é só a tela que esconde)
  // "Atualizar" pedido por outra instância depois da última leitura do Jira daqui: relê o Jira.
  const nocache = limpo > (_jiraLido[key] || 0);
  _jiraLido[key] = Date.now();
  const ficha = await d.ficha(key, nocache);            // sem Jira não há portal: o erro sobe para a rota (502)
  const ocultos = new Set(cfg.epicosOcultos);
  const cr = cronogramaDoProjeto((ficha.epicos || []).filter((e) => !ocultos.has(e.k)), hoje);
  // Projeto sem épicos (ou só épicos sem filhos): o progresso cai para os itens do projeto inteiro.
  if (!cr.resumo.itens.total) {
    const r = ficha.resumo || {}; const total = Math.max(0, (r.total || 0) - (r.cancelados || 0));
    cr.resumo.itens = { total, concluidos: r.concluidos || 0 };
    cr.resumo.pct = total ? Math.round((r.concluidos || 0) / total * 100) : cr.resumo.pct;
  }

  // Qualquer falha aqui (Supabase, Jira) LANÇA: a rota responde 502 e nada vai para o cache —
  // um portal "sem FAQ/riscos/pendências" por 10 min seria mentira servida com cara de verdade.
  const [itens, decs, pendJiraTodas] = await Promise.all([
    sbLe(sb, `${T_ITENS}?projeto=eq.${enc(key)}&visivel=eq.true&select=*&order=ordem.asc,criado_em.asc&limit=400`),
    on('decisoes') ? sbLe(sb, `${T_DEC}?projeto=eq.${enc(key)}&visivel_cliente=eq.true&status=in.(aberta,reprazada,escalada)&select=decisao,contexto,dono_nome,prazo,status,ata_url&order=prazo.asc.nullslast&limit=50`) : [],
    on('pendencias') ? d.aguardando(key, hoje, nocache) : [],
  ]);
  const dos = (tipo) => itens.filter((i) => i.tipo === tipo);
  // Épico oculto esconde os filhos também: o ticket "aguardando cliente" de um épico que o cliente
  // não vê não pode virar cobrança. O filtro é aqui (depois do cache da busca), e `epico` não sai.
  const pendJira = pendJiraTodas.filter((p) => !ocultos.has(p.epico)).map(({ epico, ...p }) => p);
  const pendencias = [
    ...pendJira,
    ...dos('pendencia').filter((i) => i.status === 'aberto').map((i) => { const desde = String(i.criado_em || '').slice(0, 10);
      return { id: i.id, titulo: txt(i.titulo, 200), lado: i.resp_lado || 'dexterity', desde, prazo: i.prazo || '', dias: desde ? Math.max(0, crDias(desde, hoje)) : 0, origem: 'manual' }; }),
  ].sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999') || b.dias - a.dias).slice(0, 80);

  const ate = crAddDias(hoje, DIAS_REUNIOES);
  const agora = Date.now();
  // Reuniões manuais: as que ainda não acabaram de começar (tolerância de 1 h) até 30 dias à frente,
  // no MESMO formato de data dos eventos do calendário (ISO no fuso de São Paulo).
  let reunioes = dos('reuniao').filter((i) => i.status !== 'encerrado' && i.inicio && Date.parse(i.inicio) >= agora - 3600000 && isoSPde(i.inicio).slice(0, 10) <= ate)
    .map((i) => ({ titulo: txt(i.titulo, 160), inicio: isoSPde(i.inicio), fim: isoSPde(i.fim), link: pcUrl(i.link), local: txt(i.descricao, 120), origem: 'manual' }));
  let completo = true;   // falha TRANSITÓRIA do Graph: o portal sai sem os eventos, mas NÃO vai para o cache
  if (cfg.calendario && on('reunioes')) {
    const cal = await d.calendario(cfg.calendario, hoje, ate);
    if (cal && cal.erro === 'falha') completo = false;
    reunioes = reunioes.concat((cal && cal.eventos) || []);   // permissão/configuração é erro do gestor, não do cliente
  }
  reunioes.sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)));

  const dados = {
    v: 1,
    cliente: c.cliente || 'Cliente',
    projeto: { key, nome: ficha.nome || key },
    apresentacao: cfg.apresentacao,
    atualizadoEm: new Date().toISOString(),
    blocos: cfg.blocos,
    progresso: on('progresso') ? cr.resumo : progressoVazio(),
    epicos: on('cronograma') ? cr.epicos.slice(0, 100).map(({ k, nome, ini, fim, pct, status, atrasoDias }) => ({ k, nome, ini, fim, pct, status, atrasoDias })) : [],
    pendencias: on('pendencias') ? pendencias : [],
    decisoes: decs.map((x) => ({ titulo: txt(x.decisao, 300), contexto: txt(x.contexto, 500), dono: txt(x.dono_nome, 120), prazo: x.prazo || '', status: x.status || '', ata: cfg.mostrarAta ? pcUrl(x.ata_url) : '' })),
    riscos: on('riscos') ? dos('risco').map((i) => ({ titulo: txt(i.titulo, 200), prob: i.prob || '', impacto: i.impacto || '', mitigacao: txt(i.mitigacao, 1000), resp: txt(i.resp_nome, 80), status: i.status || 'aberto' })).slice(0, 50) : [],
    equipe: on('equipe') ? cfg.equipe : [],
    reunioes: on('reunioes') ? reunioes.slice(0, 50) : [],
    faq: on('faq') ? dos('faq').map((i) => ({ pergunta: txt(i.titulo, 200), resposta: txt(i.descricao, 2000) })).slice(0, 50) : [],
    links: on('links') ? cfg.links : [],
    pasta: cfg.pasta,
    teamsUrl: cfg.teamsUrl,
  };
  assertAllowlist(dados);   // defesa em profundidade: chave nova fora da lista quebra aqui, nunca chega ao cliente
  if (completo) await portalCacheGrava(sb, key, dados);
  return dados;
}
function progressoVazio() {
  return { pct: 0, itens: { total: 0, concluidos: 0 }, marcos: { total: 0, concluidos: 0, proximo: null }, maiorAtrasoDias: 0, previsaoFim: '', ultimoMarco: '', previsaoRitmo: '', semaforo: '' };
}

// ---------------------------------------------------------------------------
// Rotas do GESTOR (chamadas por api/config.js depois de validar Jira + gestor)
// ---------------------------------------------------------------------------
// Projetos publicados do contrato, para o `pcli=dados` do cliente: [{key, nome, publicado:true}].
export async function projetosPublicados(sb, c) {
  const keys = projetosDoContrato(c);
  if (!keys.length) return [];
  const rows = await sbLe(sb, `${T_PROJ}?contrato_id=eq.${enc(String(c.id))}&publicado=eq.true&select=projeto`);
  const pub = rows.map((r) => r.projeto).filter((k) => keys.includes(k));
  if (!pub.length) return [];
  let cat = []; try { cat = await carregaCatalogoProjetos(); } catch (e) { cat = []; }
  return pub.map((k) => { const p = cat.find((x) => x.key === k); return { key: k, nome: (p && p.nome) || k, publicado: true }; });
}

// admin-projetos&ct=<contratoId>: contrato × projeto com contadores, para a tabela do módulo.
// Um projeto listado neste contrato mas cuja linha pertence a OUTRO sai com `outroContrato` dizendo
// para quem ele está publicado/configurado — trocar de contrato nunca é um clique silencioso (o
// admin-config responde 409 sem `forcar`). A linha devolvida é sempre a REAL (config e publicado,
// mesmo quando é do outro contrato): é dela que o formulário do módulo nasce, e mover um projeto
// de contrato não pode apagar a curadoria nem despublicar em silêncio.
export async function adminProjetos(sb, c, contratos) {
  const keys = projetosDoContrato(c);
  const lista0 = Array.isArray(contratos) ? contratos.filter(Boolean) : [];
  const [porContrato, porChave] = await Promise.all([
    sbLe(sb, `${T_PROJ}?contrato_id=eq.${enc(String(c.id))}&select=*`),
    keys.length ? sbLe(sb, `${T_PROJ}?projeto=in.(${keys.join(',')})&select=*`) : [],
  ]);
  const porK = {}; porChave.forEach((r) => { porK[r.projeto] = r; }); porContrato.forEach((r) => { porK[r.projeto] = r; });
  const todas = [...new Set([...keys, ...porContrato.map((r) => r.projeto)])];
  if (!todas.length) return [];
  const lista = `in.(${todas.join(',')})`;
  const [itens, decs, contas] = await Promise.all([
    sbLe(sb, `${T_ITENS}?projeto=${lista}&select=projeto,tipo,status,visivel`),
    sbLe(sb, `${T_DEC}?projeto=${lista}&visivel_cliente=eq.true&status=in.(aberta,reprazada,escalada)&select=projeto`),
    sbLe(sb, `${T_CONTAS}?contrato_id=eq.${enc(String(c.id))}&select=ultimo_acesso`),
  ]);
  const ultimoAcesso = contas.map((x) => x.ultimo_acesso || '').filter(Boolean).sort().pop() || '';
  let cat = []; try { cat = await carregaCatalogoProjetos(); } catch (e) { cat = []; }
  return todas.map((k) => {
    const linha = porK[k] || null;
    const deOutro = !!(linha && String(linha.contrato_id) !== String(c.id));
    const row = linha || { projeto: k, contrato_id: c.id, publicado: false, config: {} };
    const meus = itens.filter((i) => i.projeto === k && i.visivel !== false);
    const n = (tipo, st) => meus.filter((i) => i.tipo === tipo && (!st || st.includes(i.status))).length;
    const p = cat.find((x) => x.key === k);
    const outro = deOutro ? lista0.find((x) => String(x.id) === String(linha.contrato_id)) : null;
    return projetoPublico(row, { nome: (p && p.nome) || k, noContrato: keys.includes(k), ultimoAcesso,
      outroContrato: deOutro ? { id: String(linha.contrato_id), cliente: (outro && outro.cliente) || '', publicado: !!linha.publicado } : null,
      n: { pendencias: n('pendencia', ['aberto']), riscos: n('risco', ['aberto', 'mitigado']), faq: n('faq'), reunioes: n('reuniao', ['aberto']),
        decisoesVisiveis: decs.filter((x) => x.projeto === k).length } });
  });
}

// O "calendário do projeto" NUNCA pode ser a caixa de uma PESSOA do time: a credencial de
// aplicativo lê qualquer caixa do tenant, e a agenda pessoal inteira (reunião com outro cliente,
// 1:1 de RH) iria para o portal. Pessoa do time = usuário ativo do Jira, gestor da config ou quem
// está gravando. GUID (grupo do Teams) não passa por aqui. `extra.usuarios` é injetável nos testes.
export async function calendarioDePessoa(calendario, quem, extra) {
  const cal = String(calendario || '').trim().toLowerCase();
  if (!cal || !RE_EMAIL.test(cal)) return false;
  const lista = new Set([String(quem || '').trim().toLowerCase()]);
  ((extra && extra.gestores) || []).forEach((g) => { const e = String(typeof g === 'string' ? g : (g && g.email) || '').trim().toLowerCase(); if (e.includes('@')) lista.add(e); });   // cfg.gestores: {a, email} ou o e-mail cru
  const usuarios = await ((extra && extra.usuarios) ? extra.usuarios() : jiraUsuariosAtivos());   // falha → lança: sem conferir, não se grava
  Object.values(usuarios || {}).forEach((u) => { const e = String((u && u.email) || '').trim().toLowerCase(); if (e) lista.add(e); });
  lista.delete('');
  return lista.has(cal);
}

// admin-config (POST {projeto, contratoId, publicado?, config?, forcar?, calendarioConfirmado?}): upsert com validação.
export async function adminConfig(sb, contratos, body, quem, extra) {
  const key = txt(body.projeto, 40).toUpperCase();
  if (!RE_PROJ.test(key)) return { ok: false, status: 400, erro: 'Projeto inválido.' };
  const ct = txt(body.contratoId, 80);
  const c = contratos.find((x) => x && String(x.id) === ct);
  if (!c) return { ok: false, status: 400, erro: 'Contrato não encontrado.' };
  if (!projetosDoContrato(c).includes(key)) return { ok: false, status: 400, erro: `O projeto ${key} não está no contrato ${c.cliente || ct} — inclua-o em 📑 Contratos antes de publicar.` };
  if (body.publicado !== undefined && typeof body.publicado !== 'boolean') return { ok: false, status: 400, erro: '"publicado" precisa ser true ou false.' };
  const atual = (await sbLe(sb, `${T_PROJ}?projeto=eq.${enc(key)}&select=*`))[0] || null;
  // Trocar o projeto de contrato tira o acesso de quem está no contrato atual: só com `forcar`.
  if (atual && String(atual.contrato_id) !== ct && body.forcar !== true) {
    const outro = contratos.find((x) => x && String(x.id) === String(atual.contrato_id));
    const nomeOutro = (outro && (outro.cliente || outro.id)) || String(atual.contrato_id);
    return { ok: false, status: 409, erro: `${key} já está ${atual.publicado ? 'publicado' : 'configurado'} para o contrato ${nomeOutro}. Mover para ${c.cliente || ct} tira o acesso de quem está em ${nomeOutro} — confirme para mover.`,
      contratoAtual: { id: String(atual.contrato_id), cliente: (outro && outro.cliente) || '', publicado: !!(atual && atual.publicado) } };
  }
  let config = atual ? normalizaConfig(atual.config, key).config : configPadrao();
  if (body.config !== undefined) {
    const n = normalizaConfig(body.config, key, true);
    if (!n.ok) return { ok: false, status: 400, erro: n.erro };
    config = n.config;
    const calAntes = String((atual && atual.config && atual.config.calendario) || '').trim();
    if (config.calendario && config.calendario !== calAntes) {
      // Calendário NOVO: (1) nunca a caixa de uma pessoa do time; (2) o gestor precisa ter visto a
      // prévia (admin-sugestoes&cal=…) e confirmado ESTE valor — é o que ele acabou de ler que o cliente verá.
      if (await calendarioDePessoa(config.calendario, quem, extra)) return { ok: false, status: 400, erro: 'Calendário do projeto: este e-mail é de uma pessoa do time — a agenda pessoal dela inteira iria para o cliente. Use a caixa compartilhada do projeto ou o GUID do grupo do Teams.', calendarioPessoa: true };
      if (txt(body.calendarioConfirmado, 200) !== config.calendario) return { ok: false, status: 400, erro: 'Calendário do projeto: teste o calendário e confirme a prévia (as próximas reuniões) antes de salvar.', precisaConfirmar: true };
    }
  }
  const publicado = body.publicado === undefined ? !!(atual && atual.publicado) : body.publicado;
  const agora = new Date().toISOString();
  const rows = await sbEscreve(sb, `${T_PROJ}?on_conflict=projeto`, 'POST',
    [{ projeto: key, contrato_id: ct, publicado, config, atualizado_em: agora, atualizado_por: quem }], 'resolution=merge-duplicates,return=representation');
  await portalCacheLimpa(sb, key);
  const row = rows[0] || { projeto: key, contrato_id: ct, publicado, config, atualizado_em: agora, atualizado_por: quem };
  return { ok: true, projeto: projetoPublico(row), publicadoMudou: !!(atual && atual.publicado) !== publicado,
    contratoMudou: !!(atual && String(atual.contrato_id) !== ct) };
}

// admin-itens&p=KEY: GET lista tudo (visível ou não); POST {acao:'criar'|'editar'|'remover', item}.
export async function adminItensLista(sb, key) {
  const rows = await sbLe(sb, `${T_ITENS}?projeto=eq.${enc(key)}&select=*&order=tipo.asc,ordem.asc,criado_em.asc&limit=500`);
  return rows.map(itemPublico);
}
export async function adminItemEscreve(sb, key, body, quem) {
  const acao = txt(body.acao, 20); const item = (body.item && typeof body.item === 'object') ? body.item : {};
  const agora = new Date().toISOString();
  if (acao === 'remover') {
    const id = txt(item.id || body.id, 40);
    if (!RE_UUID.test(id)) return { ok: false, status: 400, erro: 'Item inválido.' };
    await sbEscreve(sb, `${T_ITENS}?id=eq.${enc(id)}&projeto=eq.${enc(key)}`, 'DELETE', undefined, 'return=minimal');
    await portalCacheLimpa(sb, key);
    return { ok: true, id };
  }
  if (acao !== 'criar' && acao !== 'editar') return { ok: false, status: 400, erro: 'Ação desconhecida (criar, editar ou remover).' };
  const n = normalizaItem(item, key);
  if (!n.ok) return { ok: false, status: 400, erro: n.erro };
  let rows;
  if (acao === 'criar') {
    rows = await sbEscreve(sb, T_ITENS, 'POST', [{ ...n.reg, criado_por: quem, criado_em: agora, atualizado_por: quem, atualizado_em: agora }]);
  } else {
    const id = txt(item.id, 40);
    if (!RE_UUID.test(id)) return { ok: false, status: 400, erro: 'Item inválido.' };
    rows = await sbEscreve(sb, `${T_ITENS}?id=eq.${enc(id)}&projeto=eq.${enc(key)}`, 'PATCH', { ...n.reg, atualizado_por: quem, atualizado_em: agora });
    if (!rows[0]) return { ok: false, status: 404, erro: 'Item não encontrado.' };
  }
  await portalCacheLimpa(sb, key);
  return { ok: true, item: itemPublico(rows[0] || { ...n.reg, criado_por: quem, atualizado_por: quem }) };
}

// admin-decisao (POST {id, visivel}): liga/desliga a decisão para o cliente.
export async function adminDecisao(sb, body) {
  const id = txt(body.id, 40);
  if (!RE_UUID.test(id)) return { ok: false, status: 400, erro: 'Decisão inválida.' };
  const atual = (await sbLe(sb, `${T_DEC}?id=eq.${enc(id)}&select=id,projeto`))[0];
  if (!atual) return { ok: false, status: 404, erro: 'Decisão não encontrada.' };
  const visivel = body.visivel === true;
  await sbEscreve(sb, `${T_DEC}?id=eq.${enc(id)}`, 'PATCH', { visivel_cliente: visivel }, 'return=minimal');
  if (atual.projeto) await portalCacheLimpa(sb, atual.projeto);
  return { ok: true, id, visivel, projeto: atual.projeto || '' };
}

// admin-sugestoes&p=KEY[&cal=…]: matéria-prima para o gestor montar a equipe e as reuniões — nunca vai ao
// cliente. `cal` testa um calendário AINDA NÃO SALVO (a prévia que o gestor confirma antes de gravar):
// e-mail de pessoa do time volta como {erro:'pessoa'} sem tocar no Graph.
export async function adminSugestoes(sb, key, hoje, calCandidato, quem, extra) {
  let equipe = []; let lead = '';
  try {
    const ficha = await fichaProjeto(key);
    equipe = (ficha.esforcoResp || []).map((r) => r.nome).filter((n) => n && n !== 'Não atribuído').slice(0, 30).map((nome) => ({ nome }));
    lead = equipe.length ? equipe[0].nome : '';
  } catch (e) { /* sem Jira, sem sugestão */ }
  let reunioesJira = [];
  try {
    const { issues } = await jiraSearchAll({ jql: `project = "${key}" AND labels = agenda-outlook AND duedate >= "${hoje}" ORDER BY duedate ASC`,
      fields: ['summary', 'duedate', 'description'], pageSize: 50, maxPages: 1 });
    reunioesJira = issues.map((it) => { const f = it.fields || {}; const m = textoComentario(f.description).match(/Link:\s*(https?:\/\/\S+)/i);
      return { k: it.key, titulo: txt(f.summary, 160).replace(/^Reuni[aã]o:\s*/i, ''), data: f.duedate || '', link: pcUrl(m ? m[1] : '') }; });
  } catch (e) { /* idem */ }
  const row = (await sbLe(sb, `${T_PROJ}?projeto=eq.${enc(key)}&select=config`))[0];
  const cfg = normalizaConfig(row && row.config, key).config;
  const alvo = txt(calCandidato, 200) || cfg.calendario;
  let calendario = null;
  if (alvo) {
    if (!calendarioValido(alvo)) calendario = { ok: false, erro: 'invalido', eventos: [], calendario: alvo };
    else if (await calendarioDePessoa(alvo, quem, extra)) calendario = { ok: false, erro: 'pessoa', eventos: [], calendario: alvo };
    else {
      const cal = await calendarioDoProjeto(alvo, hoje, crAddDias(hoje, DIAS_REUNIOES));
      calendario = { ok: !cal.erro, erro: cal.erro || '', eventos: (cal.eventos || []).slice(0, 3), calendario: alvo };
    }
  }
  return { equipe, lead, reunioesJira, calendario };
}
