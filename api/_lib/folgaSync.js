// Sincronização: folga APROVADA no Odoo → ticket no Jira (TAD) + worklog da pessoa.
//
// Acionada por GET /api/resumo?acao=folga-sync (cron do GitHub Actions; protegida por
// CRON_SECRET, mesmo modelo do /api/teams). Para CADA ausência aprovada (hr.leave com
// state='validate') alterada nos últimos dias, cria 1 ticket no Jira por DIA ÚTIL da
// folga, atribuído à pessoa (mapeada por e-mail), com data limite = o dia, e registra o
// trabalho (worklog) no nome da pessoa via Clockwork. Idempotente por (leave_id + dia),
// guardado no Supabase (tabela jirainsight_folgas). v1: apenas CRIA (não cancela em caso
// de recusa/edição). Use ?dry=1 para simular sem criar nada.
//
// Env: ODOO_URL/ODOO_DB/ODOO_LOGIN/ODOO_API_KEY, JIRA_BASE_URL/JIRA_EMAIL/JIRA_API_TOKEN,
//      SUPABASE_URL/SUPABASE_ANON_KEY, CLOCKWORK_API_TOKEN, CLOCKWORK_ESCRITA=1,
//      CRON_SECRET (opcional). Opcionais de configuração:
//      JIRA_FOLGA_PROJETO (10442), JIRA_FOLGA_TIPO (10009),
//      JIRA_FOLGA_DEPT_FIELD (customfield_10924), JIRA_FOLGA_DEPT_VALUE ("RH - Pessoas & Cultura"),
//      JIRA_FOLGA_HORAS_DIA (sobrepõe a jornada do Odoo), FOLGA_SYNC_LOOKBACK_DIAS (14),
//      FOLGA_SYNC_MAX (200), JIRA_FOLGA_MAP (JSON {"email":"accountId"} para exceções de mapeamento).
import { jiraBase, jiraAuthHeader, json } from './util.js';

const env = (k) => (process.env[k] || '').trim();
const num = (v, d) => { if (v === '' || v === null || v === undefined) return d; const n = Number(v); return Number.isFinite(n) ? n : d; };
const TAB = 'jirainsight_folgas';

// ---------------- Odoo (JSON-RPC) ----------------
async function odoo(url, service, method, args) {
  const r = await fetch(url.replace(/\/+$/, '') + '/jsonrpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: { service, method, args } }),
  });
  if (!r.ok) throw new Error(`Odoo HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) { const d = j.error.data || {}; throw new Error(d.message || j.error.message || 'Erro no Odoo'); }
  return j.result;
}

// ---------------- Supabase (idempotência) ----------------
function sb() {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return null;
  return { base, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}
async function sbSelectPorLeaves(s, leaveIds) {
  const out = [];
  for (let i = 0; i < leaveIds.length; i += 100) {       // quebra em lotes (evita URL/cap gigante)
    const lote = leaveIds.slice(i, i + 100);
    const q = `leave_id=in.(${lote.join(',')})&select=id,issue_key,status,tentativas`;
    const r = await fetch(`${s.base}/rest/v1/${TAB}?${q}`, { headers: s.headers });
    if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
    out.push(...(await r.json()));
  }
  return out;
}
async function sbUpsert(s, row) {
  const r = await fetch(`${s.base}/rest/v1/${TAB}?on_conflict=id`, {
    method: 'POST',
    headers: { ...s.headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ ...row, updated_at: new Date().toISOString() }]),
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// ---------------- Datas / fuso ----------------
const TZ = 'America/Sao_Paulo';
const isoData = (s) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');
// Próximo dia (string YYYY-MM-DD) usando meio-dia UTC para evitar bordas de fuso.
function proxDia(s) { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
// dia da semana no padrão Odoo: 0=segunda … 6=domingo.
function dowOdoo(s) { const d = new Date(s + 'T12:00:00Z'); return (d.getUTCDay() + 6) % 7; }
// Converte um datetime UTC do Odoo ('YYYY-MM-DD HH:MM:SS') para a data (YYYY-MM-DD) no fuso.
function dataNaTz(dtUtc, tz) {
  try {
    const d = new Date(String(dtUtc).replace(' ', 'T') + 'Z');
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch (e) { return String(dtUtc).slice(0, 10); }
}
function horaHHMM(f) {
  let h = Math.floor(f);
  let m = Math.round((f - h) * 60);
  if (m === 60) { h += 1; m = 0; }
  h = Math.max(0, Math.min(23, h));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------------- Jira (conta de serviço) ----------------
function adf(texto) {
  return { type: 'doc', version: 1, content: String(texto).split('\n').map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) };
}
async function jiraAccountIdPorEmail(base, auth, email, mapa) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return '';
  if (mapa[e]) return mapa[e];                                  // exceção configurada
  const r = await fetch(`${base}/rest/api/3/user/search?query=${encodeURIComponent(e)}`, { headers: { Authorization: auth, Accept: 'application/json' } });
  if (!r.ok) return '';
  const lista = await r.json().catch(() => []);
  const u = (Array.isArray(lista) ? lista : []).find((x) => String(x.emailAddress || '').toLowerCase() === e && x.accountType === 'atlassian');
  return (u && u.accountId) || '';
}
async function criaTicketJira(base, auth, fields) {
  const r = await fetch(`${base}/rest/api/3/issue`, {
    method: 'POST', headers: { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, erro: `Jira ${r.status}: ${JSON.stringify(data).slice(0, 300)}` };
  return { ok: true, key: data.key };
}

// ---------------- Clockwork (worklog com autor explícito) ----------------
async function worklogClockwork({ issueKey, segundos, started, accountId, comment }) {
  const token = env('CLOCKWORK_API_TOKEN');
  if (env('CLOCKWORK_ESCRITA') !== '1' || !token) return { ok: false, erro: 'Worklog não criado: defina CLOCKWORK_ESCRITA=1 e CLOCKWORK_API_TOKEN.' };
  try {
    const r = await fetch('https://api.clockwork.report/v1/worklogs', {
      method: 'POST', headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ issue_key: issueKey, time_spent_seconds: segundos, started, comment: comment || '', author: { accountId } }),
    });
    if (r.ok) { const d = await r.json().catch(() => ({})); return { ok: true, worklogId: String(d.id || '') }; }
    return { ok: false, erro: `Clockwork ${r.status}: ${(await r.text()).slice(0, 200)}` };
  } catch (e) { return { ok: false, erro: `Clockwork: ${String(e.message || e).slice(0, 200)}` }; }
}

// Expande uma folga em dias efetivos (úteis) respeitando o calendário do Odoo.
function diasEfetivos(leave, cal) {
  const de = isoData(leave.request_date_from), ate = isoData(leave.request_date_to) || de;
  if (!de) return [];
  // Meio período ou horas específicas: sempre 1 único dia.
  if (leave.request_unit_half || leave.request_unit_hours) return [de];
  const dows = (cal && cal.dows && cal.dows.size) ? cal.dows : new Set([0, 1, 2, 3, 4]); // padrão seg–sex
  const feriados = (cal && cal.feriados) || new Set();
  const out = [];
  let d = de; let guard = 0;
  while (d <= ate && guard++ < 120) {
    if (dows.has(dowOdoo(d)) && !feriados.has(d)) out.push(d);
    d = proxDia(d);
  }
  return out;
}

// Quantidade (segundos) e horário de início do worklog para um dia da folga.
function worklogDoDia(leave, dia, horasDia) {
  if (leave.request_unit_hours) {
    const hf = Number(leave.request_hour_from) || 9;
    const ht = Number(leave.request_hour_to) || (hf + horasDia);
    const seg = Math.max(900, Math.round((ht - hf) * 3600));
    return { segundos: seg, started: `${dia}T${horaHHMM(hf)}:00.000-0300` };
  }
  if (leave.request_unit_half) {
    const pm = leave.request_date_from_period === 'pm';
    return { segundos: Math.round((horasDia / 2) * 3600), started: `${dia}T${pm ? '14:00' : '09:00'}:00.000-0300` };
  }
  return { segundos: Math.round(horasDia * 3600), started: `${dia}T09:00:00.000-0300` };
}

export async function sincronizaFolgas(req, res) {
  try {
    // Proteção: este endpoint CRIA tickets/worklogs, então exige o segredo SEMPRE.
    const segredo = env('CRON_SECRET');
    if (!segredo) return json(res, 200, { ok: false, configurado: false, erro: 'Defina CRON_SECRET (obrigatório para folga-sync) na Vercel e como secret do repositório.' });
    const reqAuth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
    if (reqAuth !== `Bearer ${segredo}`) return json(res, 401, { ok: false, erro: 'Não autorizado.' });
    const dry = !!(req.query && req.query.dry === '1');

    const url = env('ODOO_URL'), db = env('ODOO_DB'), login = env('ODOO_LOGIN'), key = env('ODOO_API_KEY');
    if (!url || !db || !login || !key) return json(res, 200, { ok: false, configurado: false, erro: 'Odoo não configurado (ODOO_URL/ODOO_DB/ODOO_LOGIN/ODOO_API_KEY).' });
    const s = sb();
    if (!s) return json(res, 200, { ok: false, configurado: false, erro: 'Supabase não configurado (necessário para não duplicar tickets).' });

    let base, auth;
    try { base = jiraBase(); auth = jiraAuthHeader(); }
    catch (e) { return json(res, 200, { ok: false, configurado: false, erro: String(e.message || e) }); }

    const PROJ = env('JIRA_FOLGA_PROJETO') || '10442';
    const TIPO = env('JIRA_FOLGA_TIPO') || '10009';
    const DEPT_RAW = env('JIRA_FOLGA_DEPT_FIELD');
    const DEPT_FIELD = DEPT_RAW === 'off' ? '' : (DEPT_RAW || 'customfield_10924');   // "off" = não preenche
    const DEPT_VALUE = env('JIRA_FOLGA_DEPT_VALUE') || 'RH - Pessoas & Cultura';
    const HORAS_OVERRIDE = num(env('JIRA_FOLGA_HORAS_DIA'), 0);
    const LOOKBACK = Math.max(1, num(env('FOLGA_SYNC_LOOKBACK_DIAS'), 14));
    const MAX = Math.max(1, num(env('FOLGA_SYNC_MAX'), 200));
    const MAX_TENT = Math.max(1, num(env('FOLGA_SYNC_MAX_TENTATIVAS'), 5));   // não insiste em folgas que falham sempre
    let mapaEmail = {};
    try { mapaEmail = JSON.parse(env('JIRA_FOLGA_MAP') || '{}'); }
    catch (e) { console.error(`[folga-sync] JIRA_FOLGA_MAP inválido (${e.message}); usando mapa vazio.`); mapaEmail = {}; }
    mapaEmail = Object.fromEntries(Object.entries(mapaEmail).map(([k, v]) => [String(k).toLowerCase(), String(v)]));

    // 1) Autentica conta de serviço no Odoo.
    const uid = await odoo(url, 'common', 'authenticate', [db, login, key, {}]);
    if (!uid) return json(res, 200, { ok: false, erro: 'Falha de autenticação no Odoo.' });
    const exec = (model, method, args, kwargs = {}) => odoo(url, 'object', 'execute_kw', [db, uid, key, model, method, args, kwargs]);

    // 2) Folgas APROVADAS (state='validate') alteradas no período de lookback.
    const desde = new Date(Date.now() - LOOKBACK * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    const leaves = await exec('hr.leave', 'search_read',
      [[['state', '=', 'validate'], ['write_date', '>=', desde]]],
      {
        fields: ['id', 'employee_id', 'holiday_status_id', 'state', 'request_date_from', 'request_date_to',
          'date_from', 'date_to', 'number_of_days', 'request_unit_half', 'request_date_from_period',
          'request_unit_hours', 'request_hour_from', 'request_hour_to', 'name'],
        order: 'write_date asc', limit: MAX,
      });
    if (!leaves.length) return json(res, 200, { ok: true, dry, folgas: 0, criados: 0, pulados: 0, semMapeamento: 0, erros: [], mensagem: 'Nenhuma folga aprovada recente.' });

    // 3) Funcionários (e-mail, calendário, fuso).
    const empIds = [...new Set(leaves.map((l) => Array.isArray(l.employee_id) ? l.employee_id[0] : 0).filter(Boolean))];
    const emps = empIds.length ? await exec('hr.employee', 'read', [empIds], { fields: ['work_email', 'user_id', 'resource_calendar_id', 'tz', 'name'] }) : [];
    const empById = Object.fromEntries(emps.map((e) => [e.id, e]));

    // Calendários: jornada (hours_per_day) + dias de expediente + feriados globais no intervalo.
    const calIds = [...new Set(emps.map((e) => Array.isArray(e.resource_calendar_id) ? e.resource_calendar_id[0] : 0).filter(Boolean))];
    const calCache = {};
    if (calIds.length) {
      const cals = await exec('resource.calendar', 'read', [calIds], { fields: ['hours_per_day', 'tz'] });
      const att = await exec('resource.calendar.attendance', 'search_read', [[['calendar_id', 'in', calIds]]], { fields: ['calendar_id', 'dayofweek'] });
      const dowsByCal = {};
      att.forEach((a) => { const c = Array.isArray(a.calendar_id) ? a.calendar_id[0] : a.calendar_id; (dowsByCal[c] = dowsByCal[c] || new Set()).add(Number(a.dayofweek)); });
      // Feriados globais (resource_id=false) que tocam o intervalo total das folgas.
      const minD = leaves.reduce((m, l) => (isoData(l.request_date_from) && l.request_date_from < m ? l.request_date_from : m), '9999-12-31');
      const maxD = leaves.reduce((m, l) => { const a = isoData(l.request_date_to) || isoData(l.request_date_from); return a && a > m ? a : m; }, '0000-01-01');
      let feriados = [];
      try {
        feriados = await exec('resource.calendar.leaves', 'search_read',
          [[['resource_id', '=', false], ['date_from', '<=', `${maxD} 23:59:59`], ['date_to', '>=', `${minD} 00:00:00`]]],
          { fields: ['date_from', 'date_to', 'calendar_id'] });
      } catch (e) { feriados = []; }
      cals.forEach((c) => {
        const tz = c.tz || TZ;
        const fset = new Set();
        feriados.forEach((f) => {
          const fc = Array.isArray(f.calendar_id) ? f.calendar_id[0] : f.calendar_id;
          if (fc && fc !== c.id) return;                       // feriado de outro calendário
          let d = dataNaTz(f.date_from, tz); const fim = dataNaTz(f.date_to, tz); let g = 0;
          while (d <= fim && g++ < 40) { fset.add(d); d = proxDia(d); }
        });
        calCache[c.id] = { horasDia: Number(c.hours_per_day) || 8, dows: dowsByCal[c.id] || new Set([0, 1, 2, 3, 4]), feriados: fset };
      });
    }

    // 4) Já processados (idempotência) + nº de tentativas (evita retry infinito).
    const existentes = await sbSelectPorLeaves(s, leaves.map((l) => l.id));
    // "Já feito" = ticket criado OU reservado ('processando') — não recria (evita duplicata).
    const jaFeito = new Set(existentes.filter((r) => r.issue_key || r.status === 'processando').map((r) => r.id));
    const tentPorId = Object.fromEntries(existentes.map((r) => [r.id, Number(r.tentativas) || 0]));

    const erros = []; let criados = 0; let pulados = 0; let semMap = 0; let desistidos = 0; const previa = [];

    for (const lv of leaves) {
      try {
        const emp = empById[Array.isArray(lv.employee_id) ? lv.employee_id[0] : 0] || {};
        const nome = (Array.isArray(lv.employee_id) ? lv.employee_id[1] : '') || emp.name || 'Funcionário';
        const email = String(emp.work_email || '').trim();
        const calId = Array.isArray(emp.resource_calendar_id) ? emp.resource_calendar_id[0] : 0;
        const cal = calCache[calId] || { horasDia: 8, dows: new Set([0, 1, 2, 3, 4]), feriados: new Set() };
        const horasDia = HORAS_OVERRIDE > 0 ? HORAS_OVERRIDE : cal.horasDia;
        const dias = diasEfetivos(lv, cal);

        // accountId da pessoa (1x por folga). Distingue erro de API de "não encontrado".
        let accountId = ''; let erroLookup = '';
        try { accountId = await jiraAccountIdPorEmail(base, auth, email, mapaEmail); }
        catch (e) { erroLookup = `lookup accountId: ${e && e.message ? e.message : e}`; console.error(`[folga-sync] ${erroLookup}`); }

        for (const dia of dias) {
          const id = `${lv.id}:${dia}`;
          if (jaFeito.has(id)) { pulados += 1; continue; }
          const tent = tentPorId[id] || 0;
          if (tent >= MAX_TENT) { desistidos += 1; continue; }       // já falhou demais; não insiste
          const { segundos, started } = worklogDoDia(lv, dia, horasDia);
          const horas = +(segundos / 3600).toFixed(2);
          const tipoAus = (Array.isArray(lv.holiday_status_id) ? lv.holiday_status_id[1] : '') || 'Folga';
          const linha = { id, leave_id: lv.id, dia, email, horas, tentativas: tent + 1 };

          if (!accountId) {
            semMap += 1;
            if (!dry) await sbUpsert(s, { ...linha, account_id: '', issue_key: null, worklog_id: null, status: 'sem_mapeamento', erro: (erroLookup || `Sem accountId no Jira para ${email || nome}.`).slice(0, 400) });
            continue;
          }
          if (dry) { previa.push({ id, nome, dia, email, horas, tipo: tipoAus }); continue; }

          // Reserva a linha ANTES de criar o ticket ("claim"): se o Supabase cair
          // depois da criação, a próxima execução vê 'processando' e não duplica.
          await sbUpsert(s, { ...linha, account_id: accountId, issue_key: null, worklog_id: null, status: 'processando', erro: null });

          // Cria o ticket no TAD, atribuído à pessoa, com data limite = o dia.
          const fields = {
            project: { id: PROJ }, issuetype: { id: TIPO },
            summary: `Folga — ${nome} — ${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`,
            assignee: { id: accountId },
            duedate: dia,
            description: adf(`Folga aprovada no Odoo (${tipoAus}).\nFuncionário: ${nome}${email ? ` (${email})` : ''}\nDia: ${dia}\nHoras: ${horas}h\nReferência Odoo: hr.leave #${lv.id}${lv.name ? ` — ${lv.name}` : ''}`),
          };
          if (DEPT_FIELD) fields[DEPT_FIELD] = { value: DEPT_VALUE };
          const tk = await criaTicketJira(base, auth, fields);
          if (!tk.ok) {
            erros.push({ id, erro: tk.erro });
            await sbUpsert(s, { ...linha, account_id: accountId, issue_key: null, worklog_id: null, status: 'erro', erro: tk.erro.slice(0, 400) });
            continue;
          }
          // Aponta o trabalho no nome da pessoa (Clockwork). Não falha o ticket se o worklog falhar.
          const wl = await worklogClockwork({ issueKey: tk.key, segundos, started, accountId, comment: `Folga (${tipoAus})` });
          await sbUpsert(s, { ...linha, account_id: accountId, issue_key: tk.key, worklog_id: wl.ok ? wl.worklogId : null, status: 'criado', erro: wl.ok ? null : (wl.erro || '').slice(0, 400) });
          criados += 1;
          if (!wl.ok) erros.push({ id, issue: tk.key, erro: `worklog: ${wl.erro}` });
        }
      } catch (e) {
        // Uma folga problemática não derruba o resto do lote.
        erros.push({ leave_id: lv.id, erro: String(e && e.message ? e.message : e) });
      }
    }

    return json(res, 200, { ok: true, dry, folgas: leaves.length, criados, pulados, semMapeamento: semMap, desistidos, erros, ...(dry ? { previa } : {}) });
  } catch (err) {
    return json(res, 200, { ok: false, erro: String(err && err.message ? err.message : err) });
  }
}
