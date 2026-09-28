// 📅 Cronograma no SERVIDOR — porte fiel de crLinhas (public/js/02b-cronograma.js) e de
// projMarcos (public/js/02-projetos.js), para o 🌐 portal do projeto (2026-09-28).
//
// Por que existe: o status derivado de cada épico (concluído · atrasado · em risco · em
// andamento · não iniciado), a previsão pelo ritmo e o atraso em dias eram calculados só
// no navegador. O cliente precisa ver o MESMO semáforo que o time vê no 📅 Cronograma —
// então a fórmula foi copiada para cá, linha a linha, e `scripts/check-cronograma-paridade.mjs`
// (no `npm run check`) carrega o arquivo do front num `vm` e compara os dois sobre fixtures:
// quem mudar a regra de um lado sem o outro é reprovado. As diferenças são só o que o portal
// não usa: alertas de texto (precisam de fmtHd), prefixo de fase e dependências ficam no front.
// `hoje` é parâmetro (o front usa hojeSP()) — é o que deixa a comparação determinística.

export function crDias(a, b) { if (!a || !b) return 0; return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }
export function crAddDias(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// Linhas do cronograma: datas, status derivado e previsão por épico (= crLinhas do front).
export function crLinhas(epicos, hoje) {
  const corte = crAddDias(hoje, -56);
  return (epicos || []).map((e) => {
    const iniPlan = e.ini || ''; const fimPlan = e.fim || ''; const fimRef = fimPlan || e.vencFilhos || ''; const fimDerivado = !fimPlan && !!e.vencFilhos;
    const iniReal = e.iniItens || ''; const done = e.sc === 'done'; const cancel = e.sc === 'cancel';
    const fimReal = done ? (e.resolvido || e.fimItens || '') : '';
    // ritmo: filhos concluídos nas últimas 8 semanas → previsão de término
    let concl8 = 0; Object.entries(e.porMes || {}).forEach(([m, v]) => { if (m >= corte.slice(0, 7)) concl8 += v.d || 0; });
    const restantes = Math.max(0, (e.nFilhos || 0) - (e.nConcluidos || 0));
    const ritmo = concl8 / 8; let previsao = ''; if (!done && !cancel && restantes > 0 && ritmo > 0) previsao = crAddDias(hoje, Math.ceil(restantes / ritmo * 7));
    const pct = e.nFilhos ? Math.round(e.nConcluidos / e.nFilhos * 100) : (done ? 100 : 0);
    const diasAte = fimRef ? crDias(hoje, fimRef) : null;
    const risco = !done && !cancel && ((previsao && fimRef && previsao > fimRef) || (fimRef && diasAte != null && diasAte <= 14 && diasAte >= 0 && pct < 70) || (e.filhosVenc > 0));
    let st = 'nao_iniciado';
    if (cancel) st = 'cancelado'; else if (done) st = 'concluido'; else if (fimRef && fimRef < hoje) st = 'atrasado'; else if (risco) st = 'risco';
    else if (e.sc === 'indeterminate' || e.emAnd > 0 || e.nConcluidos > 0 || (e.gastoH > 0)) st = 'andamento';
    const atraso = st === 'atrasado' ? crDias(fimRef, hoje) : (done && fimPlan && fimReal && fimReal > fimPlan ? crDias(fimPlan, fimReal) : 0);
    return { ...e, iniPlan, fimPlan, fimRef, fimDerivado, iniReal, fimReal, done, cancel, previsao, ritmo, restantes, pct, diasAte, st, atraso };
  });
}

// Ordem em cascata (= o padrão de crOrdena do front): pelo número da fase no nome ("1.", "2.3"…),
// depois pelo início (planejado, real ou criação) e pela chave — o cliente vê a mesma sequência do Cronograma.
export function crPrefixo(resumo) { const m = String(resumo || '').match(/^\s*(\d+(?:\.\d+)*)[.)\s-]/); if (!m) return { nums: [], nivel: 0 }; const nums = m[1].split('.').map(Number); return { nums, nivel: Math.max(0, nums.length - 1) }; }
export function crCmpNums(a, b) { for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] == null ? -1 : a[i], y = b[i] == null ? -1 : b[i]; if (x !== y) return x - y; } return 0; }
export function crOrdenaCascata(rows) {
  const key = (r) => r.iniPlan || r.iniReal || r.criado || '9999';
  return rows.slice().sort((a, b) => { const pa = a.pfx.nums.length, pb = b.pfx.nums.length; if (pa && pb) { const c = crCmpNums(a.pfx.nums, b.pfx.nums); if (c) return c; } else if (pa !== pb) return pa ? -1 : 1; return key(a).localeCompare(key(b)) || a.k.localeCompare(b.k); });
}

// Próximo marco (Data limite de épico aberto ≥ hoje) e contagem de épicos (= projMarcos do front).
export function projMarcos(epicos, hoje) {
  const eps = epicos || [];
  const abertos = eps.filter((e) => e.sc !== 'done' && e.sc !== 'cancel');
  const prox = abertos.map((e) => e.fim || '').filter((f) => f && f >= hoje).sort()[0] || '';
  const atras = abertos.filter((e) => e.fim && e.fim < hoje).length;
  return { n: eps.length, abertos: abertos.length, prox, atras };
}

// O que o CLIENTE recebe: os épicos com o status traduzido (nao_iniciado → planejado; os
// cancelados não entram — trabalho que não vai acontecer não é notícia para o cliente) e o
// resumo dos 4 KPIs do portal: progresso em itens (a mesma conta do KPI "Progresso geral" do
// Cronograma), marcos concluídos/total, próximo marco, maior atraso, previsão de fim e o semáforo.
// `previsaoFim` = o MAIOR entre o último marco planejado (KPI "Último marco planejado" do 📅
// Cronograma interno) e a previsão pelo ritmo do épico mais lento — a previsão pelo ritmo só olha
// os épicos com filhos e nunca pode ser ANTERIOR a um marco ainda planejado; os dois vão separados
// (`ultimoMarco`, `previsaoRitmo`) para a página dizer qual é qual.
const ST_CLIENTE = { concluido: 'concluido', andamento: 'andamento', atrasado: 'atrasado', risco: 'risco', nao_iniciado: 'planejado' };
export function cronogramaDoProjeto(epicos, hoje) {
  const todas = crOrdenaCascata(crLinhas(epicos, hoje).filter((r) => !r.cancel).map((r) => ({ ...r, pfx: crPrefixo(r.resumo) })));
  const abertos = todas.filter((r) => !r.done);
  const itensTot = todas.reduce((s, r) => s + (r.nFilhos || 0), 0);
  const itensConc = todas.reduce((s, r) => s + (r.nConcluidos || 0), 0);
  const marcos = todas.filter((r) => r.fimPlan);
  const mk = projMarcos((epicos || []).filter((e) => e.sc !== 'cancel'), hoje);
  const proxEp = mk.prox ? abertos.find((r) => r.fimPlan === mk.prox) : null;
  const fimProj = todas.reduce((s, r) => (r.fimRef && r.fimRef > s ? r.fimRef : s), '');
  const prevProj = abertos.reduce((s, r) => (r.previsao && r.previsao > s ? r.previsao : s), '');
  const maiorAtraso = todas.reduce((s, r) => (r.st === 'atrasado' && r.atraso > s ? r.atraso : s), 0);
  const semaforo = todas.some((r) => r.st === 'atrasado') ? 'atrasado' : (todas.some((r) => r.st === 'risco') ? 'atencao' : 'ok');
  return {
    epicos: todas.map((r) => ({ k: r.k, nome: r.resumo || '', ini: r.iniPlan, fim: r.fimPlan, pct: r.pct, status: ST_CLIENTE[r.st] || 'planejado', atrasoDias: r.atraso || 0, previsao: r.previsao || '' })),
    resumo: {
      pct: itensTot ? Math.round(itensConc / itensTot * 100) : (todas.length && todas.every((r) => r.done) ? 100 : 0),
      itens: { total: itensTot, concluidos: itensConc },
      marcos: { total: marcos.length, concluidos: marcos.filter((r) => r.done).length, proximo: proxEp ? { nome: proxEp.resumo || '', data: mk.prox } : null },
      maiorAtrasoDias: maiorAtraso,
      previsaoFim: prevProj > fimProj ? prevProj : (fimProj || prevProj || ''),
      ultimoMarco: fimProj || '',
      previsaoRitmo: prevProj || '',
      semaforo,
    },
  };
}
