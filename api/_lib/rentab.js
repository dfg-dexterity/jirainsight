// 💹 Rentabilidade no SERVIDOR — porte fiel das horas VENDIDAS do painel
// (public/js/17b-rentabilidade.js: rpMeses/rpFim/rpDiasUteis/rpVendPorMes/rpVendAte).
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
