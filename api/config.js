// GET  /api/config                      -> { configurado, data }  (config compartilhada do time)
// POST /api/config                       -> salva a configuração (metas/ausências/contratos)
// GET  /api/config?portal=<token>        -> painel do cliente (somente leitura, escopado ao
//                                           contrato dono do token): horas do ciclo (banco de
//                                           horas) + chamados abertos/fechados por período.
//
// Guarda um único registro (id='default') na tabela `jirainsight_config` do Supabase.
import {
  json, jiraBase, jiraSearchAll, worklogsEnriquecidos,
} from './_lib/util.js';

const TABELA = 'jirainsight_config';
const ID = 'default';

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

// ---- Autenticação da escrita: exige um token de API do Jira válido ----
// A config é compartilhada pelo time; qualquer pessoa autenticada do Jira pode editar,
// mas a gravação não pode ser anônima (senão qualquer um sobrescreve metas/contratos/tokens).
async function validaJira(req) {
  const email = String((req.headers['x-jira-email'] || '')).trim();
  const token = String((req.headers['x-jira-token'] || '')).trim();
  if (!email || !email.includes('@') || !token) {
    return { ok: false, erro: 'Autenticação necessária: configure suas credenciais do Jira (aba Apontar).' };
  }
  const base = jiraBase();
  if (!base) return { ok: false, erro: 'Jira não configurado no servidor.' };
  const auth = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
  try {
    const r = await fetch(`${base}/rest/api/3/myself`, { headers: { Authorization: auth, Accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) return { ok: false, erro: 'Credenciais do Jira inválidas.' };
    if (!r.ok) return { ok: false, erro: `Jira ${r.status}` };
    const me = await r.json();
    return { ok: true, accountId: me.accountId || '', email: me.emailAddress || email };
  } catch (e) { return { ok: false, erro: 'Falha ao validar no Jira.' }; }
}

// ---- AMS: ciclo de apuração vigente (espelha a lógica do front) ----
const AMS_MESES = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
function spHoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function cicloVigente(c, ref) {
  ref = ref || spHoje();
  const cm = AMS_MESES[c.apuracao] || 3;
  let baseY; let baseM;
  if (c.inicio && /^\d{4}-\d{2}/.test(c.inicio)) { baseY = +c.inicio.slice(0, 4); baseM = +c.inicio.slice(5, 7) - 1; } else { baseY = +ref.slice(0, 4); baseM = 0; }
  const refY = +ref.slice(0, 4); const refM = +ref.slice(5, 7) - 1;
  let diff = (refY - baseY) * 12 + (refM - baseM); if (diff < 0) diff = 0;
  const idx = Math.floor(diff / cm); const startIdx = baseM + idx * cm;
  const start = `${baseY + Math.floor(startIdx / 12)}-${String(startIdx % 12 + 1).padStart(2, '0')}-01`;
  const endIdx = startIdx + cm;
  const endExcl = `${baseY + Math.floor(endIdx / 12)}-${String(endIdx % 12 + 1).padStart(2, '0')}-01`;
  const ed = new Date(`${endExcl}T00:00:00Z`); ed.setUTCDate(ed.getUTCDate() - 1);
  const end = ed.toISOString().slice(0, 10);
  const meses = [];
  for (let k = 0; k < cm; k += 1) { const mi = startIdx + k; meses.push(`${baseY + Math.floor(mi / 12)}-${String(mi % 12 + 1).padStart(2, '0')}`); }
  return { start, end, endExcl, meses, cm };
}
function segundaDaSemana(iso) { if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - wd); return dt.toISOString().slice(0, 10); }
function addDiasIso(iso, n) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }

async function portal(req, res, base, headers, token) {
  // Carrega os contratos da config e localiza o dono do token (escopo de dados).
  const r = await fetch(`${base}/rest/v1/${TABELA}?id=eq.${ID}&select=data`, { headers });
  const rows = r.ok ? await r.json() : [];
  const data = (Array.isArray(rows) && rows[0] && rows[0].data) || {};
  const contratos = Array.isArray(data.contratos) ? data.contratos : [];
  const c = contratos.find((x) => x && x.portalToken && x.portalToken === token);
  if (!c) return json(res, 200, { ok: false, erro: 'Link inválido ou expirado.' });

  // Projetos do cliente (sanitizados para a JQL).
  const projetos = (c.projetos || []).filter((p) => /^[A-Za-z][A-Za-z0-9_]*$/.test(p));
  const ref = (req.query && /^\d{4}-\d{2}-\d{2}$/.test(req.query.ref || '')) ? req.query.ref : spHoje();
  const cyc = cicloVigente(c, ref);
  const hoje = spHoje();
  const ateWl = cyc.end < hoje ? cyc.end : hoje;   // não busca worklogs no futuro

  const out = {
    ok: true,
    cliente: c.cliente || 'Cliente',
    apuracao: c.apuracao || 'trimestral',
    ciclo: { start: cyc.start, end: cyc.end, meses: cyc.meses },
    horas: {
      contratadasCiclo: Number(c.horasCiclo != null ? c.horasCiclo : c.horasContratadas) || 0,
      minMes: Number(c.minMes) || 0, tetoMes: Number(c.tetoMes) || 0,
      // consumidoSeg = todas as horas do ciclo; faturavelSeg = só as faturáveis (estas consomem o pacote).
      consumidoSeg: 0, faturavelSeg: 0, porMes: {}, bancoSeg: 0, excedenteSeg: 0,
    },
    valor: { hora: Number(c.valorHora) || 0, parcela: 0, excedente: 0, total: 0 },
    chamados: { abertosPorMes: {}, fechadosPorMes: {}, abertosTotal: 0, fechadosTotal: 0, porCausa: [] },
  };
  cyc.meses.forEach((m) => { out.horas.porMes[m] = 0; out.chamados.abertosPorMes[m] = 0; out.chamados.fechadosPorMes[m] = 0; });

  if (!projetos.length) return json(res, 200, out);

  // --- Horas do ciclo (Clockwork, escopado aos projetos do cliente) ---
  try {
    const enr = await worklogsEnriquecidos(cyc.start, ateWl);
    const set = new Set(projetos);
    enr.worklogs.forEach((w) => {
      if (!set.has(w.p)) return;
      const ym = (w.d || '').slice(0, 7);
      if (!(ym in out.horas.porMes)) return;
      const s = Number(w.s) || 0;
      out.horas.consumidoSeg += s; out.horas.porMes[ym] += s;
      if (w.f) out.horas.faturavelSeg += s;
    });
  } catch (e) { out.horas.erro = String(e && e.message ? e.message : e); }

  // Só as horas faturáveis consomem o pacote/excedente (as não faturáveis ficam fora da apuração).
  const poolSeg = out.horas.contratadasCiclo * 3600;
  out.horas.bancoSeg = Math.max(0, poolSeg - out.horas.faturavelSeg);
  out.horas.excedenteSeg = Math.max(0, out.horas.faturavelSeg - poolSeg);
  out.valor.parcela = out.horas.contratadasCiclo * out.valor.hora;
  out.valor.excedente = (out.horas.excedenteSeg / 3600) * out.valor.hora;
  out.valor.total = out.valor.parcela + out.valor.excedente;

  // --- Chamados abertos/fechados no ciclo (Jira, escopado aos projetos) ---
  const projJql = projetos.join(', ');
  const semAb = {}; const semFe = {};   // contagem por semana (segunda-feira)
  try {
    const { issues } = await jiraSearchAll({
      jql: `project in (${projJql}) AND created >= "${cyc.start}" AND created < "${cyc.endExcl}" ORDER BY created ASC`,
      fields: ['created', 'components', 'labels'], pageSize: 100, maxPages: 12,
    });
    const causa = {};
    issues.forEach((it) => {
      const f = it.fields || {};
      const ym = (f.created || '').slice(0, 7);
      if (ym in out.chamados.abertosPorMes) out.chamados.abertosPorMes[ym] += 1;
      out.chamados.abertosTotal += 1;
      const wk = segundaDaSemana((f.created || '').slice(0, 10)); if (wk) semAb[wk] = (semAb[wk] || 0) + 1;
      (f.components || []).forEach((cp) => { const n = cp && cp.name; if (n) causa[n] = (causa[n] || 0) + 1; });
      (f.labels || []).forEach((lb) => { if (lb) causa[lb] = (causa[lb] || 0) + 1; });
    });
    out.chamados.porCausa = Object.entries(causa).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([nome, n]) => ({ nome, n }));
  } catch (e) { out.chamados.erro = String(e && e.message ? e.message : e); }

  try {
    const { issues } = await jiraSearchAll({
      jql: `project in (${projJql}) AND resolutiondate >= "${cyc.start}" AND resolutiondate < "${cyc.endExcl}" ORDER BY resolutiondate ASC`,
      fields: ['resolutiondate'], pageSize: 100, maxPages: 12,
    });
    issues.forEach((it) => {
      const rd = (it.fields && it.fields.resolutiondate) || '';
      const ym = rd.slice(0, 7);
      if (ym in out.chamados.fechadosPorMes) out.chamados.fechadosPorMes[ym] += 1;
      out.chamados.fechadosTotal += 1;
      const wk = segundaDaSemana(rd.slice(0, 10)); if (wk) semFe[wk] = (semFe[wk] || 0) + 1;
    });
  } catch (e) { out.chamados.erroFech = String(e && e.message ? e.message : e); }

  // Série semanal (abertos/fechados) + backlog acumulado (net = Σ abertos − fechados).
  out.chamados.semanas = [];
  let wkc = segundaDaSemana(cyc.start); let guard = 0; let backlog = 0;
  const fimSem = cyc.end < hoje ? cyc.end : hoje;
  while (wkc && wkc <= fimSem && guard < 80) {
    const ab = semAb[wkc] || 0; const fe = semFe[wkc] || 0; backlog += (ab - fe);
    out.chamados.semanas.push({ ini: wkc, ab, fe, backlog });
    wkc = addDiasIso(wkc, 7); guard += 1;
  }

  return json(res, 200, out);
}

export default async function handler(req, res) {
  // GET /api/config?versao=1 → versão do deploy (commit/PR), injetada pela Vercel no runtime.
  // O merge squash guarda o nº do PR no fim da mensagem do commit: "Título (#60)".
  if (req.query && req.query.versao) {
    const sha = String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);
    const msg = String(process.env.VERCEL_GIT_COMMIT_MESSAGE || '').split('\n')[0];
    const m = msg.match(/\(#(\d+)\)\s*$/);
    const owner = String(process.env.VERCEL_GIT_REPO_OWNER || 'dfg-dexterity');
    const repo = String(process.env.VERCEL_GIT_REPO_SLUG || 'jirainsight');
    return json(res, 200, {
      sha, pr: m ? m[1] : '', titulo: msg.replace(/\s*\(#\d+\)\s*$/, '').slice(0, 140),
      url: `https://github.com/${owner}/${repo}`,
    });
  }
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  const token = String((req.query && req.query.portal) || '');

  if (token && (!base || !key)) return json(res, 200, { ok: false, erro: 'Supabase não configurado.' });
  if (!base || !key) return json(res, 200, { configurado: false });

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    if (token) return await portal(req, res, base, headers, token);

    if (req.method === 'POST') {
      const auth = await validaJira(req);
      if (!auth.ok) return json(res, 401, { configurado: true, ok: false, erro: auth.erro });
      const body = await lerBody(req);
      const data = (body && typeof body === 'object' && !Array.isArray(body)) ? body : {};
      // Guarda de tamanho: a config do time é pequena; rejeita payloads anômalos.
      if (JSON.stringify(data).length > 262144) {
        return json(res, 413, { configurado: true, ok: false, erro: 'Configuração grande demais.' });
      }
      const payload = [{ id: ID, data, updated_at: new Date().toISOString() }];
      const r = await fetch(`${base}/rest/v1/${TABELA}?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text();
        return json(res, 200, { configurado: true, ok: false, erro: t.slice(0, 300) });
      }
      return json(res, 200, { configurado: true, ok: true });
    }

    const r = await fetch(`${base}/rest/v1/${TABELA}?id=eq.${ID}&select=data`, { headers });
    if (!r.ok) {
      const t = await r.text();
      return json(res, 200, { configurado: true, data: {}, erro: t.slice(0, 300) });
    }
    const rows = await r.json();
    const data = (Array.isArray(rows) && rows[0] && rows[0].data) || {};
    return json(res, 200, { configurado: true, data });
  } catch (err) {
    return json(res, 200, { configurado: true, ok: false, erro: String(err && err.message ? err.message : err) });
  }
}
