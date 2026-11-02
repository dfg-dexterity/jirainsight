// 💹 Rentabilidade no SERVIDOR — porte fiel das horas VENDIDAS do painel
// (public/js/17b-rentabilidade.js: rpMeses/rpFim/rpDiasUteis/rpVendPorMes/rpVendAte) e, desde 2026-11-02, do
// CUSTO PREVISTO por papel (execução · gestão · terceirizado interno): rpCustoH/rpRepH/rpEsf/rpCalcResumo,
// rpPrevAte (o "previsto até aqui" do rpReal) e rpStatusK. O terceirizado interno é o terceiro papel da alocação:
// o projeto paga o valor-hora de repasse (al.rep) e a empresa continua gastando o custo/h — vazio = custo/h, e aí
// os números são idênticos aos da execução.
//
// Por que existe: o 📊 relatório semanal (api/_lib/semanal.js) precisa do "orçado" de cada
// projeto — as horas vendidas da Rentabilidade rateadas pelos dias úteis da semana — e o
// cálculo mora no navegador. Reescrever "parecido" daria dois números diferentes para a
// mesma coisa; por isso este arquivo copia a semântica linha a linha (inclusive o `vendMan`
// digitado por mês, o modo da carga, o início/fim no meio do mês e os tipos) e
// scripts/check-rentab-paridade.mjs (no `npm run check`) carrega o 17b de verdade e reprova
// o PR se os dois divergirem. Mexeu no 17b → mexe aqui → o gate cobra.
//
// Diferenças de forma (não de resultado): as funções recebem a `cfg` compartilhada (feriados
// extra/removidos) e o `hoje` opcional, em vez de lerem globais — o servidor não tem `cfg`
// nem `hojeSP()` no escopo e os testes precisam de datas fixas.
import { feriadosBR } from './util.js';

export const RP_MAX_MESES = 36;
const RP_TIPOS = ['horas', 'fechado', 'interno'];

export function spHoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
// ---- datas (mesma aritmética em UTC sobre strings do 01-nucleo.js) ----
export function proxDia(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10); }
export function addDias(s, n) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
export function diaSemana(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); }   // 0=dom … 6=sáb
export const ehUtil = (s) => { const w = diaSemana(s); return w >= 1 && w <= 5; };
// Feriado = nacional (feriadosBR) + cfg.feriadosExtra, menos cfg.feriadosRemovidos — é o
// nomeFeriado() do painel, só que com a config recebida por parâmetro.
export function ehFeriado(dia, cfg) {
  const c = cfg || {};
  if ((c.feriadosRemovidos || []).includes(dia)) return false;
  const ex = c.feriadosExtra || {};
  if (ex[dia]) return true;
  return feriadosBR(+dia.slice(0, 4)).has(dia);
}
export function ehUtilBR(dia, cfg) { return ehUtil(dia) && !ehFeriado(dia, cfg); }

export function rpTipo(p) { return RP_TIPOS.includes(p && p.tipo) ? p.tipo : 'horas'; }
// Dias úteis (seg–sex sem feriado) entre duas datas, inclusive — teto de 1500 dias como no painel.
export function rpDiasUteis(de, ate, cfg) {
  if (!de || !ate || ate < de) return 0;
  let n = 0; let d = de; let g = 0;
  while (d <= ate && g++ < 1500) { if (ehUtil(d) && !ehFeriado(d, cfg)) n += 1; d = proxDia(d); }
  return n;
}
export function rpUltimoDia(ym) { const y = +ym.slice(0, 4); const m = +ym.slice(5, 7); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
export const rpFimValido = (p) => /^\d{4}-\d{2}-\d{2}$/.test(p.fim || '') && p.fim >= (p.inicio || '');
// Meses do plano: do início até o FIM informado (quando há) ou pela duração em meses.
export function rpMeses(p, hoje) {
  const out = [];
  const ini = /^\d{4}-\d{2}/.test(p.inicio || '') ? p.inicio : (hoje || spHoje());
  let y = +ini.slice(0, 4); let m = +ini.slice(5, 7);
  let n = rpFimValido(p) ? ((+p.fim.slice(0, 4) - y) * 12 + (+p.fim.slice(5, 7) - m) + 1) : Math.round(Number(p.meses) || 1);
  n = Math.max(1, Math.min(RP_MAX_MESES, n));
  for (let i = 0; i < n; i += 1) { out.push(`${y}-${String(m).padStart(2, '0')}`); m += 1; if (m > 12) { m = 1; y += 1; } }
  return out;
}
export function rpFim(p, hoje) {
  const ms = rpMeses(p, hoje); const u = rpUltimoDia(ms[ms.length - 1]);
  return rpFimValido(p) && p.fim <= u ? p.fim : u;
}
// Horas digitadas do mês (p.vendMan) — só LÊ; nunca cria o objeto (regra do painel).
export function rpVendManDe(p, ym) {
  const m = p && p.vendMan; const v = (m && typeof m === 'object') ? m[ym] : null;
  return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null;
}
// Horas vendidas por mês: h/dia útil × dias úteis do mês dentro do prazo (modo 'dia'), um total
// rateado pelos dias úteis ('total') ou o legado h/mês ('mes') — e o número digitado, quando houver.
export function rpVendPorMes(p, cfg, hoje) {
  const ms = rpMeses(p, hoje); const fim = rpFim(p, hoje);
  const out = {}; const auto = {}; const man = {}; const du = {}; let duTot = 0; let nMan = 0;
  ms.forEach((m) => {
    const a = m === ms[0] ? p.inicio : `${m}-01`;
    const b = rpUltimoDia(m) < fim ? rpUltimoDia(m) : fim;
    du[m] = rpDiasUteis(a, b, cfg); duTot += du[m];
  });
  const modo = p.modoCarga || 'dia';
  ms.forEach((m) => {
    auto[m] = modo === 'total' ? (duTot ? Math.max(0, Number(p.cargaTotal) || 0) * du[m] / duTot : 0)
      : modo === 'mes' ? Math.max(0, Number(p.cargaMes) || 0)
        : Math.max(0, Number(p.cargaDia) || 0) * du[m];
    const v = rpVendManDe(p, m); man[m] = v != null; if (v != null) nMan += 1;
    out[m] = v != null ? v : auto[m];
  });
  return { porMes: out, auto, man, nMan, diasUteis: du, diasUteisTotal: duTot };
}
export function rpVendidas(p, cfg, hoje) { const v = rpVendPorMes(p, cfg, hoje).porMes; return Object.values(v).reduce((s, x) => s + x, 0); }
// Horas vendidas até uma data (pro rata pelos dias úteis já decorridos) — igual ao painel.
export function rpVendAte(p, ate, cfg, hoje) {
  const v = rpVendPorMes(p, cfg, hoje); const ms = rpMeses(p, hoje); let s = 0;
  ms.forEach((m) => {
    if (m > ate.slice(0, 7)) return;
    if (m < ate.slice(0, 7)) { s += v.porMes[m]; return; }
    const a = m === ms[0] ? p.inicio : `${m}-01`; const du = rpDiasUteis(a, ate, cfg);
    s += v.diasUteis[m] ? v.porMes[m] * du / v.diasUteis[m] : 0;
  });
  return s;
}
// Horas vendidas num INTERVALO [de, ate] — o "orçado da semana" do relatório semanal: cada mês
// entra pro rata pelos dias úteis do intervalo dentro do mês ÷ dias úteis do mês no prazo do
// plano (o mesmo critério do rpVendAte e dos períodos de faturamento, rpPeriodosFat).
export function rpVendEntre(p, de, ate, cfg, hoje) {
  if (!de || !ate || ate < de) return 0;
  const v = rpVendPorMes(p, cfg, hoje); const ms = rpMeses(p, hoje); const fim = rpFim(p, hoje); let s = 0;
  ms.forEach((m) => {
    const a = m === ms[0] ? p.inicio : `${m}-01`;
    const b = rpUltimoDia(m) < fim ? rpUltimoDia(m) : fim;
    const x = a > de ? a : de; const y = b < ate ? b : ate;
    if (!x || y < x) return;
    const du = rpDiasUteis(x, y, cfg);
    s += v.diasUteis[m] ? v.porMes[m] * du / v.diasUteis[m] : 0;
  });
  return s;
}

// ===========================================================================
// 🔁 Papéis, custo/h e CUSTO PREVISTO (porte do rpCalc/rpReal do painel — só o que é número, sem rótulos/UI)
// ===========================================================================
export const RP_PAPEIS = ['exec', 'gestao', 'terc'];
// Valor desconhecido (dado antigo ou à mão) cai em execução — igual ao painel.
export function rpPapel(al) { const v = al && al.papel; return RP_PAPEIS.includes(v) ? v : 'exec'; }
// Custo/h da pessoa: vaga planejada ("plan_…" em cfg.pessoasPlanejadas) usa o custo previsto do cadastro; pessoa real
// usa cfg.custosPessoa. 0 = sem custo cadastrado. Mesmo caminho do alocCustoH do painel (id "plan_…" que não existe
// mais na lista cai em custosPessoa, como lá).
export function rpCustoH(a, cfg) {
  const c = cfg || {};
  const pp = String(a || '').startsWith('plan_') ? (Array.isArray(c.pessoasPlanejadas) ? c.pessoasPlanejadas : []).find((x) => x && x.id === a) : null;
  if (pp) return Math.max(0, Number(pp.custoH) || 0);
  return Math.max(0, Number((c.custosPessoa || {})[a]) || 0);
}
// O que o PROJETO paga por hora desta alocação: o repasse (só terceirizado interno, > 0) ou o custo/h da pessoa.
export function rpRepH(al, cfg) { return rpPapel(al) === 'terc' && Number(al && al.rep) > 0 ? Number(al.rep) : rpCustoH(al && al.a, cfg); }
// A ÚNICA soma de esforço: execução + gestão + terceirizado interno.
export const rpEsf = (M) => M.exec + M.gestao + M.terc;
export function rpStatusK(p, hoje) {
  const h = hoje || spHoje();
  if (h < (p.inicio || '')) return 'planejado';
  if (h > rpFim(p, h)) return 'encerrado';
  return 'andamento';
}
// Receita por mês do escopo fechado: % de cada marco sobre o valor do projeto, no mês da data do marco (mesma ordem de soma do painel).
function rpMarcosPorMes(p, valor) {
  const lista = (Array.isArray(p.marcos) ? p.marcos : []).filter((m) => m && typeof m === 'object')
    .sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999') || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt'));
  const porMes = {};
  lista.forEach((m) => { const pct = Math.max(0, Number(m.pct) || 0); const v = valor * pct / 100; const k = (m.data || '').slice(0, 7); if (k) porMes[k] = (porMes[k] || 0) + v; });
  return porMes;
}
const rpPct = (n, d) => (d > 0 ? Math.round(n / d * 100) : null);
// Cálculo de UM cenário (cen = { aloc:[{a, papel, rep, h:{AAAA-MM:horas}}] }) — o rpCalc do painel sem rótulos/gráficos.
// Duas visões do custo: do PROJETO (custo = horas × repasse no terceirizado, × custo/h nos demais) e CONSOLIDADA
// (custoCons = horas × custo/h real de todo mundo); a diferença é o resultado da área que cede (resultadoCedente).
export function rpCalcResumo(p, cen, cfg, hoje) {
  const meses = rpMeses(p, hoje); const vp = rpVendPorMes(p, cfg, hoje); const vendPorMes = vp.porMes;
  const vend = meses.reduce((s, m) => s + vendPorMes[m], 0); const vh = Math.max(0, Number(p.valorHora) || 0);
  const tipo = rpTipo(p); const valorProj = Math.max(0, Number(p.valorProjeto) || 0);
  const receita = tipo === 'fechado' ? valorProj : tipo === 'interno' ? 0 : vend * vh;
  const marcosPorMes = tipo === 'fechado' ? rpMarcosPorMes(p, valorProj) : null;
  const receitaPorMes = {};
  meses.forEach((m) => { receitaPorMes[m] = tipo === 'horas' ? vendPorMes[m] * vh : tipo === 'fechado' ? (marcosPorMes[m] || 0) : 0; });
  const porMes = {}; meses.forEach((m) => { porMes[m] = { exec: 0, gestao: 0, terc: 0, custo: 0, custoTerc: 0 }; });
  const porPessoa = [];
  let exec = 0; let gestao = 0; let terc = 0; let custo = 0; let custoExec = 0; let custoGestao = 0; let custoTerc = 0; let custoCons = 0; let tercCons = 0;
  ((cen && cen.aloc) || []).forEach((al, i) => {
    const ch = rpCustoH(al.a, cfg); const papel = rpPapel(al); const rep = rpRepH(al, cfg); let tot = 0; let cus = 0; let cusC = 0;
    meses.forEach((m) => {
      const h = Math.max(0, Number((al.h || {})[m]) || 0); tot += h; cus += h * rep; cusC += h * ch; const M = porMes[m];
      if (papel === 'gestao') M.gestao += h; else if (papel === 'terc') { M.terc += h; M.custoTerc += h * rep; } else M.exec += h;
      M.custo += h * rep;
    });
    if (papel === 'gestao') { gestao += tot; custoGestao += cus; } else if (papel === 'terc') { terc += tot; custoTerc += cus; tercCons += cusC; } else { exec += tot; custoExec += cus; }
    custo += cus; custoCons += cusC;
    porPessoa.push({ i, a: al.a, papel, ch, rep, h: tot, custo: cus });
  });
  const esforco = rpEsf({ exec, gestao, terc });
  const margem = receita - custo; const margemCons = receita - custoCons;
  return { meses, vend, vh, tipo, receita, receitaPorMes, diasUteis: vp.diasUteis, porMes, porPessoa,
    exec, gestao, terc, esforco, custo, custoExec, custoGestao, custoTerc, custoCons,
    resultadoCedente: custoTerc - tercCons, margem, mgp: receita > 0 ? rpPct(margem, receita) : null, margemCons, mgpCons: receita > 0 ? rpPct(margemCons, receita) : null };
}
// O "previsto até aqui" do rpReal: horas e custo do cenário até a data lida — o mês corrente entra pro rata dos dias úteis
// já decorridos (fMes), os anteriores inteiros e os seguintes zerados. `calc` é o resultado do rpCalcResumo.
export function rpPrevAte(p, calc, ate, cfg) {
  const mesAtual = ate.slice(0, 7);
  const fMes = (m) => {
    if (m < mesAtual) return 1; if (m > mesAtual) return 0;
    const a = m === calc.meses[0] ? p.inicio : `${m}-01`; const du = calc.diasUteis[m] || 0;
    return du ? Math.min(1, rpDiasUteis(a, ate, cfg) / du) : 1;
  };
  return {
    prevAteHoje: calc.meses.reduce((s, m) => s + rpEsf(calc.porMes[m]) * fMes(m), 0),
    custoPrevAteHoje: calc.meses.reduce((s, m) => s + calc.porMes[m].custo * fMes(m), 0),
    custoRestante: calc.meses.reduce((s, m) => s + calc.porMes[m].custo * (1 - fMes(m)), 0),
    fMesAtual: fMes(mesAtual),
  };
}
