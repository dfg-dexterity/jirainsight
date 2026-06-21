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
      consumidoSeg: 0, porMes: {}, bancoSeg: 0, excedenteSeg: 0,
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
    });
  } catch (e) { out.horas.erro = String(e && e.message ? e.message : e); }

  const poolSeg = out.horas.contratadasCiclo * 3600;
  out.horas.bancoSeg = Math.max(0, poolSeg - out.horas.consumidoSeg);
  out.horas.excedenteSeg = Math.max(0, out.horas.consumidoSeg - poolSeg);
  out.valor.parcela = out.horas.contratadasCiclo * out.valor.hora;
  out.valor.excedente = (out.horas.excedenteSeg / 3600) * out.valor.hora;
  out.valor.total = out.valor.parcela + out.valor.excedente;

  // --- Chamados abertos/fechados no ciclo (Jira, escopado aos projetos) ---
  const projJql = projetos.join(', ');
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
      const ym = ((it.fields && it.fields.resolutiondate) || '').slice(0, 7);
      if (ym in out.chamados.fechadosPorMes) out.chamados.fechadosPorMes[ym] += 1;
      out.chamados.fechadosTotal += 1;
    });
  } catch (e) { out.chamados.erroFech = String(e && e.message ? e.message : e); }

  return json(res, 200, out);
}

export default async function handler(req, res) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  const token = String((req.query && req.query.portal) || '');

  if (token && (!base || !key)) return json(res, 200, { ok: false, erro: 'Supabase não configurado.' });
  if (!base || !key) return json(res, 200, { configurado: false });

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    if (token) return await portal(req, res, base, headers, token);

    if (req.method === 'POST') {
      const body = await lerBody(req);
      const data = (body && typeof body === 'object') ? body : {};
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
