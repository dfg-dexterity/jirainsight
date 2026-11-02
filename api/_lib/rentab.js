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
//
// 🗓 Desde 2026-11-02 também o CICLO DE FATURAMENTO do plano: porte do 16b (pcFechamento/pcNota/pcPeriodo/pcPeriodos — puros),
// do 16g (cfg.clientes) e do 17b (rpCiclosDe/rpPeriodosFat). Precedência: cliente cadastrado › 🤝 contrato de parceria
// (fatFecha/ajustes) › mês civil. Ordem de uso do cliente e do contrato = a mesma do painel; o gate confere os períodos.
//
// 💰 Desde 2026-11-02 (T3) também o FATURAMENTO PELO VENDIDO: rpFatBase ('vendido' padrão | 'apontado'), rpFatManDe (horas do ciclo digitadas em
// p.fatMan), rpFracaoCiclo (a parte do ciclo já decorrida em dias úteis) e rpFatAte (o faturado até uma data: ciclo fechado inteiro, corrente
// pro rata, depois do fim do contrato zero; 'apontado' = horas faturáveis × valor-hora), mais rpVendEntre (já existia aqui; o painel ganhou o
// porte) e o rpPeriodosFat com horasAuto/man/horas/valorAuto/encerrado. O gate confere tudo contra o painel.
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
  return { meses, vend, vh, tipo, valorProj, receita, receitaPorMes, vendPorMes, diasUteis: vp.diasUteis, diasUteisTotal: vp.diasUteisTotal, porMes, porPessoa,
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

// ===========================================================================
// 🗓 Ciclo de faturamento: cliente cadastrado › contrato de parceria › mês civil
// ===========================================================================
// Porte fiel do 16b (datas do ciclo) — o ciclo é definido pelo FIM (`ajustes[ym].fecha` ou o dia `fatFecha` do mês) e começa no dia
// seguinte ao fim do anterior; a nota sai no `fatDia` (ou no fechamento). O cliente tem o MESMO modelo do contrato (fatFecha/fatDia/ajustes).
export const pcData = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export function pcDiaNoMes(ym, dia) { const u = rpUltimoDia(ym); const d = Math.max(1, Math.min(31, Math.round(Number(dia) || 31))); const dd = Math.min(d, +u.slice(8, 10)); return `${ym}-${String(dd).padStart(2, '0')}`; }
export function pcYmSoma(ym, n) { let y = +ym.slice(0, 4); let m = +ym.slice(5, 7) + n; while (m > 12) { m -= 12; y += 1; } while (m < 1) { m += 12; y -= 1; } return `${y}-${String(m).padStart(2, '0')}`; }
export function pcAjuste(c, ym) { const a = c && c.ajustes && c.ajustes[ym]; return a && typeof a === 'object' ? a : null; }
// Fechamento do período de faturamento do mês ym: ajuste do mês ou o dia padrão (31 = último dia).
export function pcFechamento(c, ym) { const a = pcAjuste(c, ym); if (a && pcData(a.fecha)) return a.fecha; return pcDiaNoMes(ym, c.fatFecha || 31); }
// Dia da nota do mês ym: ajuste do mês; senão o dia de faturamento no próprio mês (≥ fechamento) ou no seguinte.
export function pcNota(c, ym) {
  const a = pcAjuste(c, ym); if (a && pcData(a.nota)) return a.nota;
  const fd = Math.round(Number(c.fatDia) || 0); const fecha = pcFechamento(c, ym); if (!fd) return fecha;
  const d = pcDiaNoMes(ym, fd); return d >= fecha ? d : pcDiaNoMes(pcYmSoma(ym, 1), fd);
}
export function pcPeriodo(c, ym) {
  const fim = pcFechamento(c, ym); let ini = proxDia(pcFechamento(c, pcYmSoma(ym, -1))); if (ini > fim) ini = fim;
  return { ym, ini, fim, nota: pcNota(c, ym), ajustado: !!pcAjuste(c, ym) };
}
// Períodos de faturamento que cobrem [de, ate] — recortados nas pontas (iniPlano/fimPlano).
export function pcPeriodos(c, de, ate) {
  const out = []; if (!pcData(de) || !pcData(ate) || ate < de) return out;
  let ym = de.slice(0, 7); if (pcFechamento(c, ym) < de) ym = pcYmSoma(ym, 1); let g = 0;
  while (g++ < 60) {
    const P = pcPeriodo(c, ym); if (P.ini > ate) break;
    out.push({ ...P, iniPlano: P.ini < de ? de : P.ini, fimPlano: P.fim > ate ? ate : P.fim, recortado: P.ini < de || P.fim > ate }); ym = pcYmSoma(ym, 1);
  }
  return out;
}
// O cliente (cfg.clientes) e o contrato de parceria (cfg.parcerias) do plano — só LEEM (nada é criado na cfg).
export function rpClienteDe(p, cfg) {
  const id = p && p.clienteId; if (!id) return null;
  return (Array.isArray(cfg && cfg.clientes) ? cfg.clientes : []).find((c) => c && typeof c === 'object' && c.id === id) || null;
}
export function rpContratoDe(p, cfg) {
  const id = p && p.contrato; if (!id) return null;
  return (Array.isArray(cfg && cfg.parcerias) ? cfg.parcerias : []).find((c) => c && c.id === id) || null;
}
// De onde vêm os períodos do plano: { fonte: 'cliente' | 'contrato' | 'mes', obj }.
export function rpCiclosDe(p, cfg) {
  const cl = rpClienteDe(p, cfg); if (cl) return { fonte: 'cliente', obj: cl };
  const ct = rpContratoDe(p, cfg); if (ct) return { fonte: 'contrato', obj: ct };
  return { fonte: 'mes', obj: null };
}
// 🧾 Períodos de faturamento previstos (horas abertas): os do ciclo do plano ou o mês civil, com as horas vendidas rateadas pelos dias
// úteis de cada período (o mesmo critério do rpVendAte) e o valor = horas × valor-hora. `calc` = resultado do rpCalcResumo (opcional).
export function rpPeriodosFat(p, calc, cfg, hoje) {
  const ci = rpCiclosDe(p, cfg); const fim = rpFim(p, hoje); const vp = calc || rpCalcResumo(p, null, cfg, hoje); const vh = vp.vh; const meses = vp.meses;
  const ct = rpContratoDe(p, cfg);   // o ciclo que COMEÇA depois do fim do contrato ligado (qualquer que seja a fonte do ciclo) não é faturado
  const base = ci.obj ? pcPeriodos(ci.obj, p.inicio, fim) : meses.map((m, i) => {
    const ini = i === 0 ? p.inicio : `${m}-01`; const f = rpUltimoDia(m) < fim ? rpUltimoDia(m) : fim;
    return { ym: m, ini, fim: f, iniPlano: ini, fimPlano: f, nota: f, ajustado: false, recortado: false };
  });
  return base.map((P) => {
    let h = 0; let du = 0;
    meses.forEach((m, i) => {
      const a = i === 0 ? p.inicio : `${m}-01`; const b = rpUltimoDia(m) < fim ? rpUltimoDia(m) : fim;
      const x = P.iniPlano > a ? P.iniPlano : a; const y = P.fimPlano < b ? P.fimPlano : b; if (y < x) return;
      const d = rpDiasUteis(x, y, cfg); du += d; if (vp.diasUteis[m]) h += vp.vendPorMes[m] * d / vp.diasUteis[m];
    });
    // horasAuto = a conta (vendidas rateadas no ciclo); horas = o que vale (a digitada em p.fatMan, se houver) — o que vai ao Odoo, às notas e à receita
    const horasAuto = Math.round(h * 100) / 100; const fm = rpFatManDe(p, P.ym); const man = fm != null; const horas = man ? fm : horasAuto;
    return { ...P, du, horasAuto, valorAuto: horasAuto * vh, man, horas, valor: horas * vh, fonte: ci.fonte, encerrado: !!(ct && ct.fim && P.iniPlano > ct.fim) };
  });
}
// ---- 💰 faturamento pelo vendido (porte do 17b) ----
// 'vendido' (padrão): o escopo aberto fatura o valor cheio do ciclo; 'apontado': só as horas faturáveis apontadas × valor-hora (a regra antiga).
export function rpFatBase(p) { return p && p.fatBase === 'apontado' ? 'apontado' : 'vendido'; }
// Horas do CICLO digitadas (p.fatMan['AAAA-MM']; 0 vale) — só LÊ; nunca cria o objeto.
export function rpFatManDe(p, ym) {
  const m = p && p.fatMan; const v = (m && typeof m === 'object') ? m[ym] : null;
  return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null;
}
// Fração do ciclo já decorrida em dias úteis até `ate`: 1 = fechado, 0 = não começou, entre os dois = o ciclo corrente (pro rata).
export function rpFracaoCiclo(P, ate, cfg) { return P.fimPlano <= ate ? 1 : P.iniPlano > ate ? 0 : (P.du ? rpDiasUteis(P.iniPlano, ate, cfg) / P.du : 1); }
// O faturado até `ate`: `per` = rpPeriodosFat; gastasFat[i] = horas faturáveis apontadas no ciclo i; hFatTotal = todas as faturáveis do realizado
// (também as que caem fora de qualquer ciclo — o 'apontado' reproduz hFat × valor-hora). 'vendido': ciclo fechado conta as horas inteiras, o corrente
// pro rata (rpFracaoCiclo), o que começa depois do fim do contrato (encerrado) zero — × valor-hora.
export function rpFatAte(p, calc, per, ate, gastasFat, hFatTotal, cfg) {
  const vh = calc.vh; const base = rpFatBase(p); let horasAte = 0; let soma = 0;
  const por = per.map((P, i) => {
    const fr = rpFracaoCiclo(P, ate, cfg); const hAte = P.encerrado ? 0 : P.horas * fr;
    const valorAte = base === 'vendido' ? hAte * vh : (Number(gastasFat[i]) || 0) * vh;
    horasAte += hAte; soma += valorAte; return { ym: P.ym, fr, horasAte: hAte, valorAte };
  });
  const fatAte = base === 'vendido' ? soma : (hFatTotal != null ? Number(hFatTotal) : gastasFat.reduce((t, x) => t + (Number(x) || 0), 0)) * vh;
  return { fatAte, horasAte, por };
}

// ===========================================================================
// 📸 Realizado até um dia (porte do rpReal do painel — só números; base das fotos diárias/semanais)
// ===========================================================================
// O cenário ATIVO do plano (p.cenario, senão o primeiro) — como o rpCenario do painel, mas SEM criar nada no plano (o painel cria um
// cenário "Base" quando não há nenhum; aqui o plano é só lido). Sem cenário = alocação vazia.
export function rpCenarioDe(p) {
  const l = (p && Array.isArray(p.cenarios)) ? p.cenarios.filter((x) => x && typeof x === 'object') : [];
  return l.find((x) => x.id === p.cenario) || l[0] || { aloc: [] };
}
// Com que taxa o REALIZADO de uma pessoa é custeado: o repasse da alocação terceirizada dela no cenário (se houver e for > 0) ou o custo/h.
export function rpCustoRealH(cen, a, cfg) {
  const al = ((cen && cen.aloc) || []).find((x) => x && x.a === a && rpPapel(x) === 'terc' && Number(x.rep) > 0);
  return al ? Number(al.rep) : rpCustoH(a, cfg);
}
// O que o painel lê do Clockwork para o plano no dia `dia`: de p.inicio (no máximo 365 dias para trás) até o menor entre o fim do plano e o
// dia (o rpRealChave do painel). null = plano sem projeto, ou o dia vem antes do início.
export function rpJanelaReal(p, dia, hoje) {
  if (!p || !p.projeto) return null;
  const fim = rpFim(p, hoje); const ate = fim < dia ? fim : dia; let de = p.inicio;
  if (ate < de) return null;
  if (de < addDias(ate, -365)) de = addDias(ate, -365);
  return { de, ate };
}
// Valor dos marcos já FATURADOS (escopo fechado): valor do projeto × % de cada marco com status 'faturado' (mesma ordem de soma do painel).
export function rpMarcosFaturado(p, valor) {
  const lista = (Array.isArray(p && p.marcos) ? p.marcos : []).filter((m) => m && typeof m === 'object')
    .sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999') || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt'));
  let s = 0;
  lista.forEach((m) => { if (m.status === 'faturado') s += valor * Math.max(0, Number(m.pct) || 0) / 100; });
  return s;
}
// O rpReal do painel sobre uma lista de worklogs do Clockwork ({a,s,d,p,f,k}, como o worklogsEnriquecidos entrega) e a janela `jan` (rpJanelaReal):
// horas, horas faturáveis, custo (do projeto e o consolidado), terceirizado, o previsto até a data, a receita até a data e o faturado.
// `calc` = rpCalcResumo(p, cen, …). `dia` (opcional) pede também o que foi apontado NAQUELE dia (pessoasDia) — a foto diária.
export function rpRealAte(p, calc, cen, worklogs, jan, cfg, hoje, dia) {
  const ate = jan.ate;
  const taxas = {}; const taxa = (a) => ((a in taxas) ? taxas[a] : (taxas[a] = rpCustoRealH(cen, a, cfg)));
  const tercSet = new Set(((cen && cen.aloc) || []).filter((x) => x && rpPapel(x) === 'terc').map((x) => x.a));
  const meses = new Set(calc.meses);
  let h = 0; let hFat = 0; let custo = 0; let custoCons = 0; let tercH = 0; let tercCusto = 0; let tercCons = 0;
  const pessoas = {}; const pessoasDia = {}; const porDia = {};
  (worklogs || []).forEach((w) => {
    if (!w || w.p !== p.projeto) return;
    const dd = String(w.d || '').slice(0, 10);
    if (dd < jan.de || dd > ate) return;               // o /api/tempo só devolve a janela lida
    if (!meses.has(dd.slice(0, 7))) return;
    const hh = (Number(w.s) || 0) / 3600; const tx = taxa(w.a); const cu = hh * tx; const cc = hh * rpCustoH(w.a, cfg);
    h += hh; custo += cu; custoCons += cc; if (w.f) hFat += hh;
    const D = porDia[dd] = porDia[dd] || { h: 0, hFat: 0, custo: 0 }; D.h += hh; D.custo += cu; if (w.f) D.hFat += hh;
    if (tercSet.has(w.a)) { tercH += hh; tercCusto += cu; tercCons += cc; }
    const P = pessoas[w.a] = pessoas[w.a] || { h: 0, custo: 0 }; P.h += hh; P.custo += cu;
    if (dia && dd === dia) { const Q = pessoasDia[w.a] = pessoasDia[w.a] || { h: 0, custo: 0 }; Q.h += hh; Q.custo += cu; }
  });
  const duTot = calc.diasUteisTotal || rpDiasUteis(p.inicio, rpFim(p, hoje), cfg); const duAte = rpDiasUteis(p.inicio, ate, cfg);
  const fracao = duTot > 0 ? Math.min(1, duAte / duTot) : 1;
  const vendAteHoje = rpVendAte(p, ate, cfg, hoje);
  const pv = rpPrevAte(p, calc, ate, cfg);
  const receitaAteHoje = calc.tipo === 'fechado' ? calc.valorProj * fracao : calc.tipo === 'interno' ? 0 : vendAteHoje * calc.vh;
  // horas abertas: o faturado até aqui sai dos CICLOS (rpFatAte) — o rpFatCalc do painel: horas faturáveis por ciclo e no total, na ordem de leitura
  let fat = null;
  if (calc.tipo === 'horas') {
    const per = rpPeriodosFat(p, calc, cfg, hoje); const dias = Object.keys(porDia); let hFatTot = 0;
    dias.forEach((d) => { hFatTot += porDia[d].hFat; });
    const gastasFat = per.map((P) => { let g = 0; dias.forEach((d) => { if (d >= P.iniPlano && d <= P.fimPlano) g += porDia[d].hFat; }); return g; });
    const A = rpFatAte(p, calc, per, ate, gastasFat, hFatTot, cfg);
    fat = { fatAte: A.fatAte, horasAte: A.horasAte, hFat: hFatTot };
  }
  const receitaReal = calc.tipo === 'horas' ? fat.fatAte : calc.tipo === 'fechado' ? rpMarcosFaturado(p, calc.valorProj) : 0;
  const receitaBase = calc.tipo === 'horas' ? receitaReal : receitaAteHoje;   // a margem real usa o faturável (horas) ou o reconhecido (fechado)
  return { de: jan.de, ate, porDia, h, hFat, custo, custoCons, tercH, tercCusto, resultadoCedente: tercCusto - tercCons, pessoas, pessoasDia,
    vendAteHoje, prevAteHoje: pv.prevAteHoje, custoPrevAteHoje: pv.custoPrevAteHoje, custoRestante: pv.custoRestante, fMesAtual: pv.fMesAtual,
    receitaAteHoje, receitaReal, receitaBase, margemAteHoje: receitaBase - custo, econReal: vendAteHoje - h, eficReal: vendAteHoje > 0 ? h / vendAteHoje : null, fat };
}
