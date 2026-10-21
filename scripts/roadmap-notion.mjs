#!/usr/bin/env node
// 🗂 Sincroniza o 🗺️ ROADMAP do app com a base "Roadmap da solução" no Notion (processo TI-14-024,
// acordo de 2026-10-21 com o usuário: "além de manter o roadmap da solução atualizado, sempre atualize
// essa nova base do Notion").
//
// QUEM MANDA EM QUÊ — a regra que deixa as duas listas coexistirem sem briga:
//  · o APP (array ROADMAP em public/js/05-novidades-roadmap.js) é a fonte de: Nome, Estágio, Descrição,
//    Ordem no app e ID no app. Este script grava SÓ esses campos (+ Última sincronização / Saiu do app em);
//  · o NOTION é a fonte das dimensões de planejamento: Onda, Categoria, Área, Telas, Tamanho, Esforço
//    (M tokens), Horas estimadas, Impacto, Valor para, Origem, Pré-requisitos, Dependência externa,
//    Decisão pendente, Referência de mercado, Ticket Jira, PR, Entregue em. O script nunca toca nelas —
//    quem preenche é a pessoa (ou a entrega, pelo MCP do Notion).
//  · a CHAVE é `id` (R###): o título pode ser reescrito à vontade; o id nunca muda nem é reaproveitado
//    (scripts/check-entrega.mjs reprova id ausente ou repetido).
//  · item que SAIU do array (entregue ou descartado) não é apagado no Notion: vira "Fora do roadmap" com a
//    data em "Saiu do app em" — a entrega marca "Entregue" (e "Entregue em") pelo MCP; o script respeita
//    "Entregue" e não mexe mais no estágio desse item.
//
// Uso:
//   node scripts/roadmap-notion.mjs --dry     # mostra o que criaria/atualizaria, não grava
//   node scripts/roadmap-notion.mjs           # grava
// Variáveis: NOTION_TOKEN (integração interna do Notion com acesso à base), NOTION_ROADMAP_DB (id da base),
//            NOTION_API_URL (padrão https://api.notion.com — os testes apontam para um servidor falso),
//            ROADMAP_ARQ (padrão public/js/05-novidades-roadmap.js — os testes usam uma cópia alterada).
// Roda na CI a cada push na main que mexa no 05 (.github/workflows/roadmap-notion.yml) e, sem os secrets,
// a CI só avisa: a sincronização fica por conta da entrega (MCP), como o CLAUDE.md descreve.
import { readFileSync } from 'node:fs';

const ARQ = process.env.ROADMAP_ARQ || 'public/js/05-novidades-roadmap.js';
const DRY = process.argv.includes('--dry');
const TOKEN = process.env.NOTION_TOKEN || '';
const DB = String(process.env.NOTION_ROADMAP_DB || '').trim();
const API = (process.env.NOTION_API_URL || 'https://api.notion.com').replace(/\/$/, '');
const VERSAO = '2022-06-28';
const PAUSA_MS = Number(process.env.NOTION_PAUSA_MS ?? 350);   // o Notion aceita ~3 pedidos/s
const HOJE = new Date().toISOString().slice(0, 10);

// Nomes das propriedades na base (iguais aos do esquema criado em 2026-10-21 — mudar lá = mudar aqui).
const P = {
  nome: 'Nome', id: 'ID no app', estagio: 'Estágio', desc: 'Descrição', ordem: 'Ordem no app',
  sync: 'Última sincronização', saiu: 'Saiu do app em', entrou: 'Entrou em',
};
const ESTAGIO = { fazendo: 'Em desenvolvimento', planejado: 'Planejado', avaliacao: 'Em avaliação' };
const FORA = 'Fora do roadmap';
const ENTREGUE = 'Entregue';
const RICH_MAX = 2000;   // limite do Notion por objeto de rich_text

// ---- leitura do ROADMAP (o mesmo parser do gate de entrega: o array é literal, sem interpolação) ----
function literalDe(nome, src) {
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
export function leRoadmap(src) {
  const arr = literalDe('ROADMAP', src);
  if (!Array.isArray(arr) || !arr.length) throw new Error(`ROADMAP não encontrado em ${ARQ}`);
  const ids = new Set();
  return arr.map((x, i) => {
    if (!/^R\d{3,}$/.test(String(x.id || ''))) throw new Error(`ROADMAP[${i}] sem id R### — rode npm run check`);
    if (ids.has(x.id)) throw new Error(`ROADMAP: id repetido ${x.id}`);
    ids.add(x.id);
    if (!ESTAGIO[x.s]) throw new Error(`ROADMAP[${i}] (${x.id}): estágio "${x.s}" inválido`);
    return { id: x.id, t: String(x.t || '').trim(), d: String(x.d || '').trim(), estagio: ESTAGIO[x.s], ordem: i + 1 };
  });
}

// ---- montagem das propriedades no formato da API ----
const rich = (s) => { const out = []; for (let i = 0; i < s.length; i += RICH_MAX) out.push({ type: 'text', text: { content: s.slice(i, i + RICH_MAX) } }); return out.length ? out : [{ type: 'text', text: { content: '' } }]; };
export function propsDe(item, { novo }) {
  const p = {
    [P.nome]: { title: rich(item.t) },
    [P.estagio]: { select: { name: item.estagio } },
    [P.desc]: { rich_text: rich(item.d) },
    [P.ordem]: { number: item.ordem },
    [P.sync]: { date: { start: HOJE } },
  };
  if (novo) { p[P.id] = { rich_text: rich(item.id) }; p[P.entrou] = { date: { start: HOJE } }; }
  return p;
}
// ---- leitura das propriedades que vêm do Notion ----
const texto = (prop) => ((prop && (prop.title || prop.rich_text)) || []).map((t) => t.plain_text ?? (t.text && t.text.content) ?? '').join('');
export function lePagina(pg) {
  const pr = pg.properties || {};
  return {
    pagina: pg.id, id: texto(pr[P.id]).trim(), t: texto(pr[P.nome]).trim(), d: texto(pr[P.desc]).trim(),
    estagio: (pr[P.estagio] && pr[P.estagio].select && pr[P.estagio].select.name) || '',
    ordem: pr[P.ordem] ? pr[P.ordem].number : null,
  };
}
// O que mudou entre o app e a página (só os campos do app). Devolve as propriedades a gravar, ou null.
export function diferenca(item, pag) {
  const muda = {};
  if (item.t !== pag.t) muda[P.nome] = { title: rich(item.t) };
  if (item.estagio !== pag.estagio) muda[P.estagio] = { select: { name: item.estagio } };
  if (item.d !== pag.d) muda[P.desc] = { rich_text: rich(item.d) };
  if (item.ordem !== pag.ordem) muda[P.ordem] = { number: item.ordem };
  if (!Object.keys(muda).length) return null;
  muda[P.sync] = { date: { start: HOJE } };
  return muda;
}

// ---- API ----
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
async function req(metodo, caminho, corpo, tentativa = 0) {
  const r = await fetch(`${API}/v1${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': VERSAO, 'Content-Type': 'application/json' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (r.status === 429 && tentativa < 3) { await dorme(Number(r.headers.get('retry-after') || 1) * 1000); return req(metodo, caminho, corpo, tentativa + 1); }
  const txt = await r.text();
  if (!r.ok) throw new Error(`${metodo} ${caminho} → HTTP ${r.status}: ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : {};
}
async function todasAsPaginas() {
  const out = []; let cursor;
  do {
    const j = await req('POST', `/databases/${DB}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...(j.results || []));
    cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  return out;
}

// ---- plano: o que criar, atualizar e marcar como fora ----
export function planeja(itens, paginas) {
  const porId = new Map();
  for (const pg of paginas) { const p = lePagina(pg); if (p.id) { if (porId.has(p.id)) throw new Error(`Notion: duas páginas com ID no app = ${p.id}`); porId.set(p.id, p); } }
  const criar = []; const atualizar = []; const fora = [];
  for (const it of itens) {
    const pag = porId.get(it.id);
    if (!pag) { criar.push(it); continue; }
    const muda = diferenca(it, pag);
    if (muda) atualizar.push({ item: it, pagina: pag.pagina, props: muda });
  }
  const noApp = new Set(itens.map((i) => i.id));
  for (const [id, pag] of porId) {
    if (noApp.has(id)) continue;
    if (pag.estagio === ENTREGUE || pag.estagio === FORA) continue;   // já tratado (pela entrega ou por uma rodada anterior)
    fora.push({ id, pagina: pag.pagina, t: pag.t });
  }
  return { criar, atualizar, fora, semMudanca: itens.length - criar.length - atualizar.length };
}

async function main() {
  if (!TOKEN || !DB) { console.error('Defina NOTION_TOKEN e NOTION_ROADMAP_DB (integração interna do Notion com acesso à base do processo TI-14-024).'); process.exit(2); }
  const itens = leRoadmap(readFileSync(ARQ, 'utf8'));
  const paginas = await todasAsPaginas();
  const plano = planeja(itens, paginas);
  console.log(`🗺️ ${itens.length} item(ns) no app · ${paginas.length} página(s) no Notion → criar ${plano.criar.length} · atualizar ${plano.atualizar.length} · fora do roadmap ${plano.fora.length} · sem mudança ${plano.semMudanca}${DRY ? '  (dry: nada gravado)' : ''}`);
  for (const it of plano.criar) console.log(`  + ${it.id} ${it.t}`);
  for (const a of plano.atualizar) console.log(`  ~ ${a.item.id} ${a.item.t}  [${Object.keys(a.props).filter((k) => k !== P.sync).join(', ')}]`);
  for (const f of plano.fora) console.log(`  − ${f.id} ${f.t}  → ${FORA}`);
  if (DRY) return;
  let n = 0;
  for (const it of plano.criar) { await req('POST', '/pages', { parent: { database_id: DB }, properties: propsDe(it, { novo: true }) }); n += 1; await dorme(PAUSA_MS); }
  for (const a of plano.atualizar) { await req('PATCH', `/pages/${a.pagina}`, { properties: a.props }); n += 1; await dorme(PAUSA_MS); }
  for (const f of plano.fora) { await req('PATCH', `/pages/${f.pagina}`, { properties: { [P.estagio]: { select: { name: FORA } }, [P.saiu]: { date: { start: HOJE } }, [P.sync]: { date: { start: HOJE } } } }); n += 1; await dorme(PAUSA_MS); }
  console.log(`✓ ${n} gravação(ões) no Notion.`);
}

// Só executa quando chamado direto (os testes importam as funções puras).
if (process.argv[1] && /roadmap-notion\.mjs$/.test(process.argv[1])) {
  main().catch((e) => { console.error('✗ roadmap-notion:', e.message); process.exit(1); });
}
