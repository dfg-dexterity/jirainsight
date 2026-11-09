// 🔔 Inscrições de Web Push por pessoa (2026-11-09, camada iPad). UMA linha por pessoa em `jirainsight_config`, id `push_<accountId>`
// (como as `sr_`/`dia_`/`semanal_`: NUNCA na cfg compartilhada — ela desce inteira para o navegador de todo o time, e o endpoint de push
// é uma credencial de envio). Formato v1:
//   { v:1, subs:[{ id, endpoint, keys:{p256dh,auth}, ua, em, ultimoOk, falhas }], prefs:{convites,reunioes,sexta,plano}, em }
// Conta de serviço = SUPABASE_URL + SUPABASE_ANON_KEY (o mesmo caminho das outras linhas). Gravação com trava otimista pelo updated_at.
// O payload que viaja NUNCA leva R$, e-mail nem texto de comentário (a notificação aparece na tela bloqueada).
import crypto from 'node:crypto';
import { enviaPush, vapidDeEnv, vapidConfigurado, deB64u } from './webpush.js';

export const PUSH_TIPOS = ['convites', 'reunioes', 'sexta', 'plano'];
export const PUSH_MAX_SUBS = 8;
export const PUSH_FALHAS_MAX = 5;
export const PUSH_TIMEOUT_MS = 4000;
const TABELA = 'jirainsight_config';
const RE_ACC = /^[A-Za-z0-9:_-]{1,80}$/;
const PREFS_PADRAO = { convites: true, reunioes: true, sexta: true, plano: true };

export const pushConfigurado = (env = process.env) => vapidConfigurado(env);
export const pushChavePublica = (env = process.env) => vapidDeEnv(env).pub;
export const pushIdDe = (endpoint) => crypto.createHash('sha256').update(String(endpoint || '')).digest('hex').slice(0, 16);
export const pushLinhaId = (a) => `push_${a}`;

function sbDe(sb) {
  if (sb && sb.base && sb.headers) return sb;
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
const emMs = (s) => { const t = Date.parse(String(s || '')); return Number.isFinite(t) ? t : null; };

function prefsLimpa(p) {
  const out = { ...PREFS_PADRAO };
  if (p && typeof p === 'object') PUSH_TIPOS.forEach((k) => { if (typeof p[k] === 'boolean') out[k] = p[k]; });
  return out;
}
function dadosLimpos(d) {
  const src = (d && typeof d === 'object') ? d : {};
  const subs = (Array.isArray(src.subs) ? src.subs : []).filter((s) => s && typeof s.endpoint === 'string' && s.keys && s.keys.p256dh && s.keys.auth);
  return { v: 1, subs, prefs: prefsLimpa(src.prefs), em: src.em || '' };
}

// Serviços de push reais (Safari/Apple, Chrome/FCM, Firefox/Mozilla, Edge/WNS). PUSH_HOSTS_EXTRA (hosts exatos, separados por vírgula) abre um serviço novo sem deploy.
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
export function pushHostPermitido(h) {
  const extra = String(process.env.PUSH_HOSTS_EXTRA || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  return PUSH_HOSTS.some((re) => re.test(h)) || extra.includes(h);
}

/** Valida e normaliza a inscrição do navegador. https obrigatório, sem IP/localhost (o servidor faz POST nesse endereço). */
export function pushSubValida(sub) {
  if (!sub || typeof sub !== 'object') return { ok: false, erro: 'Inscrição inválida.' };
  const endpoint = String(sub.endpoint || '').trim();
  let u; try { u = new URL(endpoint); } catch (e) { return { ok: false, erro: 'Endpoint inválido.' }; }
  if (u.protocol !== 'https:' || endpoint.length > 700) return { ok: false, erro: 'Endpoint inválido (precisa ser https).' };
  const h = u.hostname.toLowerCase();
  if (u.port !== '' || u.username || u.password) return { ok: false, erro: 'Endpoint não permitido (porta ou credencial na URL).' };
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^[\d.]+$/.test(h) || h.includes(':') || !h.includes('.')) return { ok: false, erro: 'Endpoint não permitido.' };
  if (!pushHostPermitido(h)) return { ok: false, erro: 'Serviço de notificação não reconhecido.' };   // o servidor faz POST nesse host: só os serviços de push reais
  const k = sub.keys || {};
  const p = deB64u(k.p256dh), a = deB64u(k.auth);
  if (p.length !== 65 || p[0] !== 4 || a.length !== 16) return { ok: false, erro: 'Chaves da inscrição inválidas.' };
  return { ok: true, sub: { endpoint, keys: { p256dh: String(k.p256dh), auth: String(k.auth) } } };
}

/** Lê a linha crua → { data, rev } ou null (sem linha). Lança em erro de rede/Supabase (quem chama decide). */
async function leLinha(a, sb) {
  const S = sbDe(sb); if (!S) throw new Error('Supabase não configurado.');
  const r = await fetch(`${S.base}/rest/v1/${TABELA}?id=eq.${encodeURIComponent(pushLinhaId(a))}&select=data,updated_at`, { headers: S.headers });
  if (!r.ok) throw new Error(`Supabase ${r.status} (ler push)`);
  const rows = await r.json();
  const row = Array.isArray(rows) && rows[0];
  return row ? { data: dadosLimpos(row.data), rev: row.updated_at || '' } : null;
}

/** Lê-altera-grava com trava otimista (até 4 tentativas). `fn(dados)` devolve os dados novos, ou null/undefined para não gravar. */
async function muta(a, fn, sb) {
  if (!RE_ACC.test(String(a || ''))) throw new Error('accountId inválido.');
  const S = sbDe(sb); if (!S) throw new Error('Supabase não configurado.');
  const id = pushLinhaId(a);
  for (let t = 0; t < 4; t++) {
    const atual = await leLinha(a, S);
    const novo = await fn(atual ? atual.data : dadosLimpos({}));
    if (!novo) return atual ? atual.data : dadosLimpos({});
    // updated_at SEMPRE diferente do lido (a trava é a igualdade dele): duas gravações no mesmo milissegundo não podem passar uma pela outra.
    const revMs = atual ? emMs(atual.rev) : null;
    const agora = new Date(Math.max(Date.now(), revMs == null ? 0 : revMs + 1)).toISOString();
    const data = { ...novo, v: 1, em: agora };
    if (JSON.stringify(data).length > 30000) throw new Error('Dados de push grandes demais.');
    if (atual) {
      const filtro = atual.rev ? `&updated_at=eq.${encodeURIComponent(atual.rev)}` : '&updated_at=is.null';
      const r = await fetch(`${S.base}/rest/v1/${TABELA}?id=eq.${encodeURIComponent(id)}${filtro}`, {
        method: 'PATCH', headers: { ...S.headers, Prefer: 'return=representation' }, body: JSON.stringify({ data, updated_at: agora }),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status} (gravar push)`);
      const rows = await r.json();
      if (Array.isArray(rows) && rows[0]) return data;
    } else {
      const r = await fetch(`${S.base}/rest/v1/${TABELA}?on_conflict=id`, {
        method: 'POST', headers: { ...S.headers, Prefer: 'return=representation,resolution=ignore-duplicates' }, body: JSON.stringify([{ id, data, updated_at: agora }]),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status} (criar push)`);
      const rows = await r.json();
      if (Array.isArray(rows) && rows[0]) return data;
    }
    // perdeu a corrida: relê e refaz
  }
  throw new Error('Não consegui gravar as inscrições de push (conflito repetido).');
}

/** Dados da pessoa (sem linha = vazio com prefs padrão). */
export async function pushLe(a, sb) {
  const l = await leLinha(a, sb);
  return l ? l.data : dadosLimpos({});
}

/** Upsert por id (sha256 do endpoint); teto de 8 — a mais antiga sai. → dados novos. */
export async function pushInscreve(a, sub, ua, prefs, sb) {
  const v = pushSubValida(sub);
  if (!v.ok) throw Object.assign(new Error(v.erro), { status: 400 });
  const id = pushIdDe(v.sub.endpoint);
  return muta(a, (d) => {
    const agora = new Date().toISOString();
    const antiga = d.subs.find((s) => s.id === id);
    const nova = { id, endpoint: v.sub.endpoint, keys: v.sub.keys, ua: String(ua || '').slice(0, 160), em: antiga ? antiga.em : agora, ultimoOk: antiga ? antiga.ultimoOk || '' : '', falhas: 0 };
    let subs = d.subs.filter((s) => s.id !== id).concat(nova);
    if (subs.length > PUSH_MAX_SUBS) subs = subs.sort((x, y) => String(x.em).localeCompare(String(y.em))).slice(subs.length - PUSH_MAX_SUBS);
    return { ...d, subs, prefs: prefs ? prefsLimpa({ ...d.prefs, ...prefs }) : d.prefs };
  }, sb);
}

/** Remove a inscrição daquele endpoint (de quem pediu; só enxerga as próprias). → dados novos. */
export async function pushCancela(a, endpoint, sb) {
  const id = pushIdDe(endpoint);
  return muta(a, (d) => (d.subs.some((s) => s.id === id) ? { ...d, subs: d.subs.filter((s) => s.id !== id) } : null), sb);
}

/** Troca as preferências por categoria (só chaves booleanas conhecidas). → dados novos. */
export async function pushPrefs(a, prefs, sb) {
  return muta(a, (d) => ({ ...d, prefs: prefsLimpa({ ...d.prefs, ...(prefs && typeof prefs === 'object' ? prefs : {}) }) }), sb);
}

// ---- payload: ≤ 2 KB, nada de R$/e-mail/texto de comentário ----
const limpaTxt = (s, max) => String(s == null ? '' : s)
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`/g, '')
  .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '').replace(/R\$\s?[\d.,]+/gi, '')
  .replace(/\s+/g, ' ').trim().slice(0, max);
export function pushPayload(msg, tipo) {
  const m = msg || {};
  const url = /^\/(?!\/)/.test(String(m.url || '')) ? String(m.url).slice(0, 300) : '/';
  const p = { titulo: limpaTxt(m.titulo, 90) || 'Dexterity Hub', corpo: limpaTxt(m.corpo, 220), url, tag: String(m.tag || tipo || 'hub').replace(/[^A-Za-z0-9_:.-]/g, '').slice(0, 64), tipo: PUSH_TIPOS.includes(tipo) ? tipo : String(tipo || '').slice(0, 20), em: new Date().toISOString() };
  while (Buffer.byteLength(JSON.stringify(p)) > 2048 && p.corpo.length > 20) p.corpo = p.corpo.slice(0, Math.floor(p.corpo.length / 2));
  return p;
}

/**
 * Envia a(s) pessoa(s) — `pessoas:[{accountId}]`, `msg` = {titulo, corpo, url, tag} OU função (pessoa) → msg. Só as inscrições de quem tem a
 * `prefs[tipo]` ligada; allSettled, timeout 4 s por envio; 404/410 e ≥ 5 falhas seguidas apagam a inscrição. NUNCA lança.
 * → { enviados, pessoas, apagadas, semInscricao, falhas, naoConfigurado? }
 */
export async function pushEnviaPara(pessoas, msg, { tipo, sb, vapid } = {}) {
  const out = { enviados: 0, pessoas: 0, apagadas: 0, semInscricao: 0, falhas: 0 };
  try {
    if (!(vapid ? (vapid.pub && vapid.priv) : pushConfigurado())) return { ...out, naoConfigurado: true };
    const S = sbDe(sb); if (!S) return { ...out, naoConfigurado: true };
    const vistos = new Set();
    const lista = (Array.isArray(pessoas) ? pessoas : []).filter((p) => p && RE_ACC.test(String(p.accountId || '')) && !vistos.has(p.accountId) && vistos.add(p.accountId));
    await Promise.allSettled(lista.map(async (p) => {
      try {
        const d = await pushLe(p.accountId, S);
        if (!d.subs.length) { out.semInscricao += 1; return; }
        if (PUSH_TIPOS.includes(tipo) && d.prefs[tipo] === false) return;
        const m = typeof msg === 'function' ? msg(p) : msg;
        if (!m) return;
        const carga = JSON.stringify(pushPayload(m, tipo));
        const res = await Promise.allSettled(d.subs.map((s) => enviaPush(s, carga, { timeoutMs: PUSH_TIMEOUT_MS, vapid })));
        const r = res.map((x) => (x.status === 'fulfilled' ? x.value : { ok: false, status: 0, apagar: false }));
        const ok = r.filter((x) => x.ok).length;
        out.enviados += ok; out.falhas += r.filter((x) => !x.ok && !x.apagar).length;
        if (ok) out.pessoas += 1;
        const mortas = new Set(); const agora = new Date().toISOString();
        const novoSubs = d.subs.map((s, i) => {
          const x = r[i];
          if (x.ok) return { ...s, ultimoOk: agora, falhas: 0 };
          if (x.apagar) { mortas.add(s.id); return s; }
          const f = (s.falhas || 0) + 1;
          if (f >= PUSH_FALHAS_MAX) mortas.add(s.id);
          return { ...s, falhas: f };
        });
        out.apagadas += mortas.size;
        // regrava só o estado (ultimoOk/falhas/mortas) — por id, sobre o que estiver lá agora (outra aba pode ter inscrito nesse meio tempo)
        const mudou = r.some((x, i) => !x.ok || (d.subs[i].falhas || 0) > 0);
        if (mudou) {
          const porId = new Map(novoSubs.map((s) => [s.id, s]));
          await muta(p.accountId, (cur) => ({ ...cur, subs: cur.subs.filter((s) => !mortas.has(s.id)).map((s) => porId.get(s.id) || s) }), S).catch(() => null);
        }
      } catch (e) { out.falhas += 1; }
    }));
  } catch (e) { out.falhas += 1; }
  return out;
}
