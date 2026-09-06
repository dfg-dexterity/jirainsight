// Jira Insights · 02 · 📁 VISÃO POR PROJETOS — consolidado + ficha por projeto (/api/projetos?visao=1).
// ===========================================================================
// 📁 Visão por Projetos — consolidado (todos os projetos) + ficha detalhada por
// projeto, direto do Jira (/api/projetos?visao=1). Espelha o relatório por
// projeto: Visão Geral, Status/Tipo/Prioridade, Épicos & Esforço, Categorias,
// Evolução Mensal e Inconsistências. Horas = campos do Jira (÷3600). Reusa os
// primitivos (KPIs vg-*, barlist, sparkline, tooltips).
// ===========================================================================
const fmtHd = (h) => (h == null ? '—' : (Math.round(Number(h) * 10) / 10).toLocaleString('pt-BR') + 'h');
const nBR = (n) => (Number(n) || 0).toLocaleString('pt-BR');
const corSaude = (s) => (s >= 70 ? 'good' : (s >= 40 ? 'warn' : 'bad'));
const CORSAUDE = { good: '#2f9e44', warn: '#e8a33d', bad: '#d20a0a' };
const projJira = (k) => `${jiraBase()}/browse/${encodeURIComponent(k)}`;

function carregaProjConsolidado(forca) {
  const p = estado.projetos; p.carregando = true; p.erro = '';
  fetch(`/api/projetos?visao=1${forca ? '&nocache=1' : ''}`).then((r) => r.json()).then((j) => {
    p.carregando = false;
    if (j && j.erro) p.erro = j.erro; else p.consolidado = j;
    if (estado.vista === 'projetos' && !p.sel) renderProjetos();
  }).catch((e) => { p.carregando = false; p.erro = humanizaErro(e); if (estado.vista === 'projetos' && !p.sel) renderProjetos(); });
}
function carregaProjFicha(key, forca) {
  const p = estado.projetos; p.carregando = true; p.erro = '';
  fetch(`/api/projetos?visao=1&projeto=${encodeURIComponent(key)}${forca ? '&nocache=1' : ''}`).then((r) => r.json()).then((j) => {
    p.carregando = false;
    if (j && j.erro) p.erro = j.erro; else p.fichas[key] = j;
    if (estado.vista === 'projetos' && p.sel === key) renderProjetos();
  }).catch((e) => { p.carregando = false; p.erro = humanizaErro(e); if (estado.vista === 'projetos' && p.sel === key) renderProjetos(); });
}

function projSelectorHTML() {
  const p = estado.projetos; const cons = p.consolidado;
  const opts = ['<option value="">Todos os projetos (consolidado)</option>']
    .concat(((cons && cons.projetos) || []).map((x) => `<option value="${escA(x.key)}"${p.sel === x.key ? ' selected' : ''}>${esc(x.nome||x.key)} (${esc(x.key)})</option>`)).join('');
  return `<label class="hdr-sel" style="min-width:min(320px,80vw)"><span>Projeto</span><select data-proj-sel>${opts}</select></label>`;
}
function projToolbar() {
  const p = estado.projetos;
  return `<div class="ts-fonte" style="align-items:flex-end;gap:14px;flex-wrap:wrap">
    ${p.sel ? '<button class="btn" data-proj-back title="Voltar ao consolidado">‹ Todos</button>' : ''}
    ${projSelectorHTML()}
    <span class="spacer"></span>
    <button class="btn" data-proj-refresh title="Rebuscar do Jira ignorando o cache">⟳ Atualizar</button></div>`;
}

// ---- Drill-down local: tudo clicável filtra a lista compacta d.itens (sem nova chamada) ----
const RE_CANCEL_F = /cancel/i;
function projHoje() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()); }
// Tabela de itens para os modais de drill (chave→Jira, resumo, status, resp, venc, gasto).
function projTabelaItens(itens, cap) {
  cap = cap || 300;
  const rows = itens.slice(0, cap).map((i) => `<tr>
    <td><a href="${projJira(i.k)}" target="_blank" rel="noopener">${esc(i.k)}</a>${i.ep ? ' <span class="muted small">épico</span>' : ''}</td>
    <td>${esc(i.s || '')}</td><td>${esc(i.st || '')}</td><td>${esc(i.r || '—')}</td>
    <td class="num">${i.v ? esc(i.v) : '—'}</td><td class="num">${i.gH ? fmtHd(i.gH) : '—'}</td></tr>`).join('');
  return `<div class="scroll-x"><table><thead><tr><th>Chave</th><th>Resumo</th><th>Status</th><th>Responsável</th><th class="num">Venc.</th><th class="num">Gasto</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6" class="muted">Nenhum item.</td></tr>'}</tbody></table></div>
    ${itens.length > cap ? `<div class="muted small" style="margin-top:6px">Mostrando ${cap} de ${itens.length}.</div>` : ''}`;
}
// Último drill aberto (título limpo + itens) — alimenta o "🛠 Abrir na Gestão".
let _projDrillUlt=null;
function projDrillItens(titulo, sub, itens) {
  _projDrillUlt = { titulo: String(titulo).replace(/<[^>]*>/g, ''), itens: itens || [] };
  abreModal(`<h2>${titulo} <span class="muted small" style="font-weight:400">${esc(sub || '')}</span></h2>
    <div class="muted small" style="margin:2px 0 10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">${itens.length} item(ns)
      <span class="spacer"></span>
      <button class="btn primario" data-pj-gestao ${itens.length ? '' : 'disabled'}
        data-tip="Abre a 🛠 Gestão de Tickets só com estes itens, já selecionados — todas as ações em massa (atribuir, status, comentar, reprogramar…) e por linha">🛠 Abrir na Gestão</button></div>
    ${projTabelaItens(itens)}`);
}
// Barras clicáveis próprias do módulo (mesmo visual do barlist, atributos de drill próprios).
function projBars(pares, cor, attr, fmt) {
  fmt = fmt || nBR;
  if (!pares.length) return '<div class="estado">Sem dados.</div>';
  const max = Math.max(1, ...pares.map((p) => p[1]));
  return `<div class="barlist anima">` + pares.map(([rot, v, key]) => `
    <div class="barrow" ${attr}="${escA(key == null ? rot : key)}" data-tip="${escA(rot)}" data-tip2="${escA(fmt(v))}" data-tipk="clique para ver os itens">
      <div class="nome">${esc(rot)}</div>
      <div class="track"><div class="fill" style="width:${Math.max(2, v / max * 100)}%;background:${cor}"></div></div>
      <div class="val">${fmt(v)}</div></div>`).join('') + `</div>`;
}
// Filtros da ficha (usam a lista compacta d.itens).
function projFiltraKpi(itens, kpi) {
  const hoje = projHoje();
  if (kpi === 'total') return itens;
  if (kpi === 'concluidos') return itens.filter((i) => i.sc === 'done' && !RE_CANCEL_F.test(i.st));
  if (kpi === 'cancelados') return itens.filter((i) => RE_CANCEL_F.test(i.st));
  if (kpi === 'andamento') return itens.filter((i) => i.sc === 'indeterminate');
  if (kpi === 'backlog') return itens.filter((i) => i.sc === 'new' && !RE_CANCEL_F.test(i.st));
  if (kpi === 'vencidos') return itens.filter((i) => i.v && i.v < hoje && i.sc !== 'done');
  return itens;
}
// Idade (dias) entre duas datas YYYY-MM-DD no fuso de SP.
function projDias(de, ate) { return Math.round((Date.parse(ate + 'T12:00:00-03:00') - Date.parse(de + 'T12:00:00-03:00')) / 86400000); }
function projAberto(i) { return i.sc !== 'done' && !RE_CANCEL_F.test(i.st); }
// Buckets de idade do backlog (itens abertos, pela data de criação).
const PROJ_AGING = [['a7', 'até 7 dias'], ['a30', '8–30 dias'], ['a90', '31–90 dias'], ['a90p', 'mais de 90 dias']];
function projAgingKey(i, hoje) {
  if (!projAberto(i) || !i.c) return '';
  const dias = projDias(i.c, hoje);
  return dias <= 7 ? 'a7' : dias <= 30 ? 'a30' : dias <= 90 ? 'a90' : 'a90p';
}
// Buckets de vencimento (itens abertos).
const PROJ_VENC = [['vencido', '🔴 Vencidos'], ['hoje', 'Vencem hoje'], ['sem7', 'Próximos 7 dias'], ['sem14', '8–14 dias'], ['depois', 'Mais adiante'], ['semv', 'Sem vencimento']];
function projVencKey(i, hoje) {
  if (!projAberto(i)) return '';
  if (!i.v) return 'semv';
  if (i.v < hoje) return 'vencido';
  if (i.v === hoje) return 'hoje';
  const dias = projDias(hoje, i.v);
  return dias <= 7 ? 'sem7' : dias <= 14 ? 'sem14' : 'depois';
}
// Treemap com os atributos de drill DESTE módulo (evita o mecanismo global de drill).
function projTreemap(items, opts) {
  return treemap(items, opts).replace(/data-drill="/g, 'data-ptm="').replace(/data-key="/g, 'data-ptm-key="');
}
// Escopo fechado (PEF/DEF): ganha visão financeira e planejado × realizado por épico.
// (Usa o fmtBRL já existente no painel — módulo Receita.)
function projEscopoFechado(d) { return /(^|[^A-Za-z])(PEF|DEF)([^A-Za-z]|$)/.test(`${d.categoria || ''} ${d.nome || ''}`); }
// Barras pareadas (planejado × realizado) por épico — linha clicável → composição.
function projParesEpicos(epicos) {
  const list = (epicos || []).filter((e) => (e.estH || 0) > 0 || (e.gastoH || 0) > 0);
  if (!list.length) return '<div class="estado">Sem estimativas nem horas nos épicos.</div>';
  const max = Math.max(1, ...list.map((e) => Math.max(e.estH || 0, e.gastoH || 0)));
  const rows = list.map((e) => {
    const estouro = (e.estH || 0) > 0 && (e.gastoH || 0) > (e.estH || 0);
    const corR = estouro ? CORSAUDE.bad : cores.musgo;
    return `<div class="pe-row" data-pdrill-epico="${escA(e.k)}" data-tip="${escA(`${e.k} — ${e.resumo || ''}`)}" data-tip2="${escA(`planejado ${fmtHd(e.estH)} · realizado ${fmtHd(e.gastoH)}`)}" data-tipk="clique para ver a composição">
      <div class="pe-nome"><strong>${esc(e.k)}</strong> <span class="muted small">${esc((e.resumo || '').slice(0, 42))}</span></div>
      <div class="pe-bars">
        <div class="track"><div class="fill" style="width:${Math.max(2, (e.estH || 0) / max * 100)}%;background:${cores.cerceta}"></div></div>
        <div class="track"><div class="fill" style="width:${Math.max(2, (e.gastoH || 0) / max * 100)}%;background:${corR}"></div></div>
      </div>
      <div class="pe-vals"><span style="color:${cores.cerceta}">${fmtHd(e.estH)}</span><span style="color:${corR}">${fmtHd(e.gastoH)}</span></div>
    </div>`;
  }).join('');
  return `<div class="pe-list anima">${rows}</div>
    <div class="pp-legend" style="margin-top:8px"><span><i style="background:${cores.cerceta}"></i>Planejado</span><span><i style="background:${cores.musgo}"></i>Realizado</span><span><i style="background:${CORSAUDE.bad}"></i>Acima do planejado</span></div>`;
}
// Foco de cada categoria de projeto (reflete a operação da casa):
// ITPR (internos) → atividade por dia/pessoa · IMI → planejado × realizado ·
// AMS/DAMS → horas · demais (DEF/PEA/PEF/IPA…) → entrega (épicos + vencidos).
function focoCategoria(nome) {
  if (/ITPR|Interno.*Tarefas|Rotina/i.test(nome)) return 'atividade';
  if (/IMI|Melhoria/i.test(nome)) return 'planejado';
  if (/AMS|DAMS/i.test(nome)) return 'horas';
  return 'entrega';
}
// Série "concluídos por dia" dos últimos 30 dias a partir do conc30 da categoria.
function projSerie30(conc30) {
  const porDia = {}; (conc30 || []).forEach((x) => { porDia[x.d] = (porDia[x.d] || 0) + 1; });
  const pts = []; const t = new Date();
  for (let i = 29; i >= 0; i -= 1) {
    const dt = new Date(t); dt.setUTCDate(dt.getUTCDate() - i);
    const d = dt.toISOString().slice(0, 10);
    pts.push({ x: d.slice(5), v: porDia[d] || 0 });
  }
  return pts;
}

function renderProjetos() {
  const cont = document.getElementById('conteudo'); const p = estado.projetos;
  if (!p.consolidado && !p.erro) {
    if (!p.carregando) carregaProjConsolidado(false);
    cont.replaceChildren(el(`<div><div class="card full"><h2>📁 Projetos <span>visão consolidada + ficha por projeto (direto do Jira)</span></h2>${skeletonPainel()}</div></div>`));
    return;
  }
  if (p.erro && !p.consolidado) {
    cont.replaceChildren(el(`<div><div class="card full"><h2>📁 Projetos</h2><div class="estado">Não consegui carregar: ${esc(p.erro)} <button class="btn" data-proj-refresh style="margin-left:8px">Tentar de novo</button></div></div></div>`));
    return;
  }
  if (!p.sel) return renderProjConsolidado(cont);
  return renderProjFicha(cont, p.sel);
}

function renderProjConsolidado(cont) {
  const p = estado.projetos; const c = p.consolidado; const t = c.totais || {};
  // KPIs clicáveis: abrem a composição por projeto (drill).
  const kpi = (l, v, sev, drill) => `<div class="vg-k ${sev || ''}"${drill ? ` data-pdrill-cons="${drill}" data-tipk="clique para ver por projeto"` : ''}><div class="v">${esc(String(v))}</div><div class="l">${esc(l)}</div></div>`;
  const kpis = [
    kpi('Projetos', nBR((c.projetos || []).length)),
    kpi('Itens (total)', nBR(t.total), '', 'total'),
    kpi('% concluído', nBR(t.pctConcluido) + '%', '', 'concluidos'),
    kpi('Backlog', nBR(t.backlog), '', 'backlog'),
    kpi('Em andamento', nBR(t.emAndamento), '', 'emAndamento'),
    kpi('Vencidos', nBR(t.vencidos), t.vencidos ? 'warn' : '', 'vencidos'),
    kpi('Épicos abertos', `${nBR(t.nEpicosAbertos)}/${nBR(t.nEpicos)}`, '', 'epicos'),
    kpi('Estimado', fmtHd(t.estH), '', 'estH'),
    kpi('Gasto', fmtHd(t.gastoH), '', 'gastoH'),
  ].join('');

  const ord = p.ord || 'total'; const dir = p.dir == null ? -1 : p.dir; const asc = dir === 1;
  const linhas = (c.projetos || []).slice().sort((a, b) => {
    if (ord === 'key' || ord === 'nome') return (asc ? 1 : -1) * String(a[ord] || '').localeCompare(String(b[ord] || ''), 'pt');
    return (asc ? 1 : -1) * ((Number(a[ord]) || 0) - (Number(b[ord]) || 0));
  });
  const cols = [['key', 'Projeto'], ['total', 'Total'], ['pctConcluido', '% Concl.'], ['backlog', 'Backlog'],
    ['emAndamento', 'Andam.'], ['vencidos', 'Vencidos'], ['estH', 'Est.'], ['gastoH', 'Gasto'], ['saude', 'Saúde']];
  const seta = (col) => (ord === col ? (asc ? ' ▲' : ' ▼') : '');
  const th = cols.map(([k, l]) => `<th data-proj-sort="${k}" class="${ord === k ? 'sorted' : ''}${k === 'key' ? '' : ' num'}">${esc(l)}${seta(k)}</th>`).join('');
  const rows = linhas.map((x) => {
    if (x.erro) return `<tr class="proj-linha" data-proj-open="${escA(x.key)}"><td><strong>${esc(x.key)}</strong> <span class="muted small">${esc(x.nome)}</span></td><td colspan="8" class="muted small">${esc(x.erro)}</td></tr>`;
    const sev = corSaude(x.saude || 0);
    return `<tr class="proj-linha" data-proj-open="${escA(x.key)}" data-tip="${escA(x.nome)}" data-tipk="clique para abrir a ficha do projeto">
      <td><strong>${esc(x.key)}</strong> <span class="muted small">${esc(x.nome)}</span></td>
      <td class="num">${nBR(x.total)}</td>
      <td class="num">${nBR(x.pctConcluido)}%</td>
      <td class="num">${nBR(x.backlog)}</td>
      <td class="num">${nBR(x.emAndamento)}</td>
      <td class="num">${x.vencidos ? `<strong style="color:${CORSAUDE.bad}">${nBR(x.vencidos)}</strong>` : '0'}</td>
      <td class="num">${fmtHd(x.estH)}</td>
      <td class="num">${fmtHd(x.gastoH)}</td>
      <td class="num"><span class="proj-saude"><span class="dot" style="background:${CORSAUDE[sev]}"></span>${nBR(x.saude)}</span></td></tr>`;
  }).join('');

  const trunc = c.truncado ? '<div class="estado" style="margin-top:8px">⚠ Alguns projetos têm muitos itens e foram truncados na leitura; abra a ficha do projeto para números exatos.</div>' : '';

  // ---- Seção "Por categoria" — cada categoria com o gráfico do seu foco ----
  const cats = Object.entries(c.categorias || {}).sort((a, b) => (b[1].total || 0) - (a[1].total || 0));
  const catCards = cats.map(([nome, cat]) => {
    const foco = focoCategoria(nome);
    const chips = (cat.projetos || []).map((k) => `<button class="chip" data-proj-open="${escA(k)}">${esc(k)}</button>`).join(' ');
    const mini = `<div class="muted small" style="margin:4px 0 8px">${nBR(cat.total)} itens · ${nBR(cat.pctConcluido)}% concluído · ${nBR(cat.vencidos)} vencidos · ${nBR(cat.nEpicosAbertos)}/${nBR(cat.nEpicos)} épicos abertos · ${fmtHd(cat.gastoH)} de ${fmtHd(cat.estH)}</div>`;
    let corpo = '';
    if (foco === 'atividade') {
      // Internos (ITPR): o que anda por DIA e por PESSOA (últimos 30 dias).
      const porPessoa = {}; (cat.conc30 || []).forEach((x) => { porPessoa[x.p] = (porPessoa[x.p] || 0) + 1; });
      const pares = Object.entries(porPessoa).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, v]) => [n, v, `${nome}|${n}`]);
      corpo = `<div class="sec">Concluídos por dia (últimos 30 dias)</div>${areaChart(projSerie30(cat.conc30), { cor: cores.cerceta, fmt: nBR })}
        <div class="sec" style="margin-top:12px">Concluídos por pessoa (30d)</div>${projBars(pares, cores.musgo, 'data-pdrill-catpessoa')}`;
    } else if (foco === 'planejado') {
      // Melhorias internas (IMI): planejado × realizado por projeto.
      const linhas = (cat.projetos || []).map((k) => (c.projetos || []).find((x) => x.key === k)).filter(Boolean);
      const rws = linhas.map((x) => `<tr class="proj-linha" data-proj-open="${escA(x.key)}"><td><strong>${esc(x.key)}</strong></td>
        <td class="num">${nBR(x.total)}</td><td class="num">${nBR(x.pctConcluido)}%</td>
        <td class="num">${fmtHd(x.estH)}</td><td class="num">${fmtHd(x.gastoH)}</td>
        <td class="num">${x.estH ? nBR(Math.round(x.gastoH / x.estH * 1000) / 10) + '%' : '—'}</td>
        <td class="num">${nBR(x.nEpicosAbertos)}</td></tr>`).join('');
      corpo = `<div class="sec">Planejado × realizado por projeto</div><div class="scroll-x"><table>
        <thead><tr><th>Projeto</th><th class="num">Itens</th><th class="num">% Concl.</th><th class="num">Estimado</th><th class="num">Gasto</th><th class="num">Gasto/Est.</th><th class="num">Épicos abertos</th></tr></thead>
        <tbody>${rws}</tbody></table></div>`;
    } else if (foco === 'horas') {
      const pares = (cat.projetos || []).map((k) => { const x = (c.projetos || []).find((y) => y.key === k); return x && x.gastoH ? [k, x.gastoH, k] : null; }).filter(Boolean).sort((a, b) => b[1] - a[1]);
      corpo = `<div class="sec">Horas gastas por projeto</div>${projBars(pares, cores.roxo, 'data-proj-open', fmtHd)}`;
    } else {
      const parEp = (cat.projetos || []).map((k) => { const x = (c.projetos || []).find((y) => y.key === k); return x && x.nEpicosAbertos ? [k, x.nEpicosAbertos, k] : null; }).filter(Boolean).sort((a, b) => b[1] - a[1]);
      const parVc = (cat.projetos || []).map((k) => { const x = (c.projetos || []).find((y) => y.key === k); return x && x.vencidos ? [k, x.vencidos, k] : null; }).filter(Boolean).sort((a, b) => b[1] - a[1]);
      corpo = `<div class="sec">Épicos abertos por projeto</div>${projBars(parEp, cores.cerceta, 'data-proj-open')}
        <div class="sec" style="margin-top:12px">Vencidos por projeto</div>${projBars(parVc, CORSAUDE.bad, 'data-proj-open')}`;
    }
    const rotFoco = { atividade: 'foco: atividade por dia/pessoa', planejado: 'foco: planejado × realizado', horas: 'foco: horas', entrega: 'foco: entrega (épicos & prazos)' }[foco];
    return `<div class="vg-card"><h3>${esc(nome)} <span class="muted small" style="font-weight:400">· ${rotFoco}</span></h3>${mini}<div style="margin-bottom:8px">${chips}</div>${corpo}</div>`;
  }).join('');

  // 🗺 Treemap do portfólio: área = nº de itens, cor = saúde; clique → ficha.
  const tmPort = projTreemap((c.projetos || []).filter((x) => !x.erro && x.total > 0).map((x) => ({
    nome: `${x.key} — ${x.nome}`, valor: x.total, cor: CORSAUDE[corSaude(x.saude || 0)], drill: { type: 'proj', key: x.key },
  })), { fmt: (v) => nBR(v) + ' itens', h: 330 });
  const legSaude = `<div class="pp-legend" style="margin-top:6px"><span><i style="background:${CORSAUDE.good}"></i>saúde ≥ 70</span><span><i style="background:${CORSAUDE.warn}"></i>40–69</span><span><i style="background:${CORSAUDE.bad}"></i>&lt; 40</span></div>`;

  cont.replaceChildren(el(`<div>
    ${projToolbar()}
    <div class="card full"><h2>📁 Projetos — Consolidado <span>${nBR((c.projetos || []).length)} projetos · clique nos cards, categorias e linhas para detalhar</span></h2>
      <div class="vg-hero">${kpis}</div>
      <div class="scroll-x" style="margin-top:14px"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>
      ${trunc}
    </div>
    <div class="vg-card" style="margin-bottom:14px"><h3>🗺 Mapa do portfólio <span class="muted small" style="font-weight:400">· área = nº de itens · cor = saúde · clique para abrir a ficha</span></h3>${tmPort}${legSaude}</div>
    <div class="vg-grid">${catCards}</div>
  </div>`));
}

function projTabela(titulo, arr, cols) {
  const head = cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.rot)}</th>`).join('');
  const body = (arr || []).map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.fn(r)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">Sem dados.</td></tr>`;
  return `<div class="vg-card"><h3>${esc(titulo)}</h3><div class="scroll-x"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

function renderProjFicha(cont, key) {
  const p = estado.projetos; const d = p.fichas[key];
  if (!d) {
    if (!p.carregando) carregaProjFicha(key, false);
    cont.replaceChildren(el(`<div>${projToolbar()}<div class="card full"><h2>📁 ${esc(key)}</h2>${skeletonPainel()}</div></div>`));
    return;
  }
  const r = d.resumo || {}; const aba = p.aba || 'geral';
  // KPIs clicáveis: cada card abre a lista dos itens que o compõem.
  const kpi = (l, v, sev, drill) => `<div class="vg-k ${sev || ''}"${drill ? ` data-proj-kpi="${drill}" data-tipk="clique para ver os itens"` : ''}><div class="v">${esc(String(v))}</div><div class="l">${esc(l)}</div></div>`;
  const kpis = [
    kpi('Total', nBR(r.total), '', 'total'), kpi('Concluídos', nBR(r.concluidos), 'good', 'concluidos'),
    kpi('% concluído', nBR(r.pctConcluido) + '%', '', 'concluidos'), kpi('Em andamento', nBR(r.emAndamento), '', 'andamento'),
    kpi('Backlog', nBR(r.backlog), '', 'backlog'), kpi('Cancelados', nBR(r.cancelados), '', 'cancelados'),
    kpi('Vencidos', nBR(r.vencidos), r.vencidos ? 'bad' : '', 'vencidos'),
    kpi('Épicos abertos', `${nBR(r.nEpicosAbertos)}/${nBR(r.nEpicos)}`, '', 'epicos'),
    kpi('Estimado', fmtHd(r.estH)), kpi('Gasto', fmtHd(r.gastoH)),
    kpi('Saúde', nBR(r.saude), corSaude(r.saude || 0)),
  ].join('');
  const abas = [['geral', 'Visão Geral'], ['epicos', 'Épicos & Esforço'], ['categorias', 'Categorias'], ['evolucao', 'Evolução'], ['inconsist', `Inconsistências${r.incTotal ? ` (${nBR(r.incTotal)})` : ''}`]];
  const tabbar = `<div class="proj-tabs">${abas.map(([k, l]) => `<button class="chip${aba === k ? ' on' : ''}" data-proj-aba="${k}" aria-pressed="${aba === k}">${esc(l)}</button>`).join('')}</div>`;

  let sec = '';
  const dim = (arr, cor, tipo, limite) => projBars((arr || []).slice(0, limite || 14).map((x) => [x.nome, x.n, `${tipo}|${x.nome}`]), cor, 'data-pdrill-dim');
  if (aba === 'geral') {
    const hoje = projHoje(); const its = d.itens || [];
    // ⏳ Idade do backlog: há quanto tempo os itens ABERTOS foram criados.
    const agingCnt = {}; its.forEach((i) => { const b = projAgingKey(i, hoje); if (b) agingCnt[b] = (agingCnt[b] || 0) + 1; });
    const agingBars = projBars(PROJ_AGING.filter(([b]) => agingCnt[b]).map(([b, rot]) => [rot, agingCnt[b], b]), cores.amarelo, 'data-pdrill-aging');
    // 📅 Radar de vencimentos dos abertos.
    const vencCnt = {}; its.forEach((i) => { const b = projVencKey(i, hoje); if (b) vencCnt[b] = (vencCnt[b] || 0) + 1; });
    const vencBars = projBars(PROJ_VENC.filter(([b]) => vencCnt[b]).map(([b, rot]) => [rot, vencCnt[b], b]), cores.roxo, 'data-pdrill-venc');
    // 👤 Carga aberta por responsável.
    const cargaCnt = {}; its.forEach((i) => { if (projAberto(i)) { const n = i.r || 'Não atribuído'; cargaCnt[n] = (cargaCnt[n] || 0) + 1; } });
    const cargaBars = projBars(Object.entries(cargaCnt).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, v]) => [n, v, n]), cores.cerceta, 'data-pdrill-resp');
    // Progresso: % concluído e % do estimado já consumido.
    const pctEsf = r.estH ? Math.min(100, Math.round(r.gastoH / r.estH * 100)) : 0;
    const donuts = `<div style="display:flex;gap:14px;justify-content:space-around;align-items:center;flex-wrap:wrap">
      ${donut(r.pctConcluido, 'concluído', cores.musgo)}${donut(pctEsf, 'do estimado', cores.cerceta)}</div>
      <div class="muted small" style="text-align:center;margin-top:6px">${fmtHd(r.gastoH)} gastos de ${fmtHd(r.estH)} estimados</div>`;
    sec = `<div class="vg-grid">
      <div class="vg-card"><h3>Itens por Status</h3>${dim(d.status, cores.cerceta, 'st')}</div>
      <div class="vg-card"><h3>Itens por Tipo</h3>${dim(d.tipos, cores.musgo, 't')}</div>
      <div class="vg-card"><h3>Itens por Prioridade</h3>${dim(d.prioridades, cores.amarelo, 'pr', 10)}</div>
      <div class="vg-card"><h3>Progresso</h3>${donuts}</div>
      <div class="vg-card"><h3>⏳ Idade do backlog <span class="muted small" style="font-weight:400">· abertos, desde a criação</span></h3>${agingBars}</div>
      <div class="vg-card"><h3>📅 Vencimentos <span class="muted small" style="font-weight:400">· itens abertos</span></h3>${vencBars}</div>
      <div class="vg-card"><h3>👤 Carga aberta por responsável</h3>${cargaBars}</div></div>`;
  } else if (aba === 'epicos') {
    const epRows = (d.epicos || []).map((e) => `<tr class="proj-linha" data-pdrill-epico="${escA(e.k)}" data-tipk="clique para ver o que compõe o épico">
      <td><a href="${projJira(e.k)}" target="_blank" rel="noopener">${esc(e.k)} ↗</a></td>
      <td>${esc((e.resumo || '').slice(0, 80))}</td><td>${esc(e.status || '')}</td>
      <td class="num">${nBR(e.nConcluidos)}/${nBR(e.nFilhos)}</td><td class="num">${nBR(e.pct)}%</td>
      <td class="num">${fmtHd(e.estH)}</td><td class="num">${fmtHd(e.gastoH)}</td></tr>`).join('');
    const ep = `<div class="vg-card"><h3>Épicos <span class="muted small" style="font-weight:400">· clique numa linha para ver a composição</span></h3>
      <div class="scroll-x"><table><thead><tr><th>Épico</th><th>Resumo</th><th>Status</th><th class="num">Concl./Filhos</th><th class="num">%</th><th class="num">Est.</th><th class="num">Gasto</th></tr></thead>
      <tbody>${epRows || '<tr><td colspan="7" class="muted">Sem épicos.</td></tr>'}</tbody></table></div></div>`;
    const colsEsf = [
      { rot: 'Itens', num: 1, fn: (x) => nBR(x.itens) },
      { rot: 'Concl.', num: 1, fn: (x) => nBR(x.concluidos) },
      { rot: 'Estimado', num: 1, fn: (x) => fmtHd(x.estH) },
      { rot: 'Gasto', num: 1, fn: (x) => fmtHd(x.gastoH) },
      { rot: 'Gasto/Est.', num: 1, fn: (x) => x.ratio == null ? '—' : nBR(x.ratio) + '%' },
    ];
    const resp = projTabela('Esforço por responsável', d.esforcoResp, [{ rot: 'Responsável', fn: (x) => esc(x.nome) }, ...colsEsf]);
    const tipo = projTabela('Esforço por tipo', d.esforcoTipo, [{ rot: 'Tipo', fn: (x) => esc(x.nome) }, ...colsEsf]);
    // ---- Escopo fechado (PEF/DEF): 💰 valor realizado + 📐 planejado × realizado por épico ----
    let fechado = '';
    if (projEscopoFechado(d)) {
      const custoDe = (id) => (typeof alocCustoH === 'function' ? alocCustoH(id || '') : Math.max(0, Number((cfg.custosPessoa || {})[id]) || 0));
      const linhasVal = (d.esforcoResp || []).filter((x) => x.gastoH > 0)
        .map((x) => { const ch = x.id ? custoDe(x.id) : 0; return { ...x, custoH: ch, valor: Math.round(x.gastoH * ch * 100) / 100 }; })
        .sort((a, b) => b.valor - a.valor || b.gastoH - a.gastoH);
      const totalVal = linhasVal.reduce((s, x) => s + x.valor, 0);
      const semCusto = linhasVal.filter((x) => !x.custoH);
      const valRows = linhasVal.map((x) => `<tr><td>${esc(x.nome)}</td><td class="num">${fmtHd(x.gastoH)}</td>
        <td class="num">${x.custoH ? fmtBRL(x.custoH) : '<span class="muted" data-tip="Sem custo/h cadastrado — fora do total">—</span>'}</td>
        <td class="num">${x.custoH ? `<strong>${fmtBRL(x.valor)}</strong>` : '<span class="muted">—</span>'}</td></tr>`).join('');
      const valorCard = `<div class="vg-card"><h3>💰 Valor realizado <span class="muted small" style="font-weight:400">· horas do Jira × custo/h por pessoa</span></h3>
        <div class="vg-k good" style="max-width:260px;margin-bottom:10px"><div class="v">${fmtBRL(totalVal)}</div><div class="l">realizado (${fmtHd(r.gastoH)} apontadas)</div></div>
        <div class="scroll-x"><table><thead><tr><th>Responsável</th><th class="num">Horas</th><th class="num">Custo/h</th><th class="num">Valor</th></tr></thead>
        <tbody>${valRows || '<tr><td colspan="4" class="muted">Sem horas apontadas.</td></tr>'}</tbody></table></div>
        ${semCusto.length ? `<div class="estado" style="margin-top:8px">⚠ ${semCusto.length} pessoa(s) sem custo/h cadastrado (fora do total): ${esc(semCusto.map((x) => x.nome).slice(0, 4).join(', '))}${semCusto.length > 4 ? '…' : ''} — cadastre na 🧑‍💼 Alocação ou importe do Odoo.</div>` : ''}</div>`;
      const paresCard = `<div class="vg-card"><h3>📐 Planejado × Realizado por épico <span class="muted small" style="font-weight:400">· clique num épico para ver a composição</span></h3>${projParesEpicos(d.epicos)}</div>`;
      fechado = `<div class="vg-grid">${valorCard}${paresCard}</div>`;
    }
    // 🗺 Treemap dos épicos: área = nº de itens; clique na célula → composição.
    const tmEp = (d.epicos || []).length ? `<div class="vg-card"><h3>🗺 Mapa dos épicos <span class="muted small" style="font-weight:400">· área = nº de itens · clique para ver a composição</span></h3>
      ${projTreemap((d.epicos || []).map((e2, i2) => ({ nome: `${e2.k} — ${e2.resumo || ''}`, valor: Math.max(1, e2.nFilhos), cor: PALETA[i2 % PALETA.length], drill: { type: 'epico', key: e2.k } })), { fmt: (v) => nBR(v) + ' itens', h: 300 })}</div>` : '';
    sec = fechado + tmEp + ep + `<div class="vg-grid">${resp}${tipo}</div>`;
  } else if (aba === 'categorias') {
    sec = `<div class="vg-card"><h3>Itens por categoria (rótulo) <span class="muted small" style="font-weight:400">· clique para ver os itens</span></h3>${dim(d.categorias, cores.cerceta, 'l', 25)}</div>`;
  } else if (aba === 'evolucao') {
    const ev = d.evolucao || [];
    // Criados × Concluídos com crosshair + leitura (tsChart), e o trabalho em aberto
    // acumulado (criados acum. − concluídos acum.) — mostra escopo crescendo vs. entrega.
    const fluxo = tsChart([
      { nome: 'Criados', cor: cores.cerceta, vals: ev.map((m) => ({ x: m.mes, v: m.criados })) },
      { nome: 'Concluídos', cor: cores.musgo, vals: ev.map((m) => ({ x: m.mes, v: m.concluidos })) },
    ], { fmt: nBR, xlabel: (x) => String(x).slice(2), readX: (x) => x });
    const aberto = tsChart([
      { nome: 'Em aberto', cor: cores.amarelo, vals: ev.map((m) => ({ x: m.mes, v: Math.max(0, m.criadosAcum - m.concluidosAcum) })) },
    ], { fmt: nBR, xlabel: (x) => String(x).slice(2), readX: (x) => x });
    const rows = ev.map((m) => `<tr class="proj-linha" data-pdrill-mes="${escA(m.mes)}" data-tipk="clique para ver os itens do mês"><td>${esc(m.mes)}</td><td class="num">${nBR(m.criados)}</td><td class="num">${nBR(m.concluidos)}</td><td class="num">${nBR(m.criadosAcum)}</td><td class="num">${nBR(m.concluidosAcum)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Sem itens.</td></tr>';
    sec = `<div class="vg-card"><h3>Criados × Concluídos por mês <span class="muted small" style="font-weight:400">· passe o mouse para ler os valores</span></h3>${fluxo}</div>
      <div class="vg-card"><h3>Trabalho em aberto (acumulado) <span class="muted small" style="font-weight:400">· criados − concluídos</span></h3>${aberto}</div>
      <div class="vg-card"><h3>Evolução mensal <span class="muted small" style="font-weight:400">· clique num mês para ver os itens</span></h3><div class="scroll-x"><table><thead><tr><th>Mês</th><th class="num">Criados</th><th class="num">Concluídos</th><th class="num">Criados acum.</th><th class="num">Concluídos acum.</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  } else if (aba === 'inconsist') {
    const ordem = ['resolvido', 'feitoSemTempo', 'gastoSemEst', 'estouro', 'backlogComGasto', 'semCategoria', 'naoEpicSemEst'];
    p.incAberta = p.incAberta || {};
    const cards = ordem.map((kk) => {
      const c = (d.inconsistencias || {})[kk]; if (!c) return '';
      const aberta = !!p.incAberta[kk];
      const chaves = (c.chaves || []).map((k) => `<a href="${projJira(k)}" target="_blank" rel="noopener">${esc(k)}</a>`).join(', ');
      const sev = c.qtd ? (c.pct >= 15 ? 'bad' : 'warn') : 'good';
      return `<div class="vg-card">
        <div style="display:flex;align-items:baseline;gap:10px">
          <div class="v" style="font-size:24px;color:${c.qtd ? CORSAUDE[sev === 'bad' ? 'bad' : 'warn'] : CORSAUDE.good}">${nBR(c.qtd)}</div>
          <div><strong>${esc(c.rot)}</strong> <span class="muted small">${nBR(c.pct)}% da base</span><br><span class="muted small">💡 ${esc(c.acao)}</span></div>
        </div>
        ${c.qtd ? `<button class="btn" data-proj-inc="${kk}" style="margin-top:8px">${aberta ? 'Ocultar' : 'Ver'} chaves (${c.qtd > 300 ? '300+' : nBR(c.qtd)})</button>${aberta ? `<div class="small" style="margin-top:8px;line-height:2">${chaves}${c.qtd > 300 ? ' …' : ''}</div>` : ''}` : ''}</div>`;
    }).join('');
    sec = `<div class="estado" style="margin-bottom:10px">Contagens sobre a base do projeto — ajustes sugeridos direto no Jira.</div><div class="vg-grid">${cards}</div>`;
  }

  const trunc = d.truncado ? '<div class="estado" style="margin-top:8px">⚠ Projeto com muitos itens: a leitura foi truncada; alguns números podem estar subestimados.</div>' : '';
  cont.replaceChildren(el(`<div>
    ${projToolbar()}
    <div class="card full"><h2>📁 ${esc(key)} <span>${esc(d.nome || d.projeto || '')}${d.categoria ? ` · ${esc(d.categoria)}` : ''}${projEscopoFechado(d) ? ' 🔒' : ''} · ficha do projeto</span></h2>
      <div class="vg-hero">${kpis}</div>${trunc}
      ${tabbar}${sec}
    </div></div>`));
}

// Interações do módulo Projetos (delegadas em #conteudo — anexadas uma vez).
function projetosClick(e) {
  const t = e.target; const cl = (s) => t.closest && t.closest(s);
  const open = cl('[data-proj-open]');
  if (open) { const p = estado.projetos; p.sel = open.getAttribute('data-proj-open'); p.aba = 'geral'; renderProjetos(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const aba = cl('[data-proj-aba]');
  if (aba) { estado.projetos.aba = aba.getAttribute('data-proj-aba'); renderProjetos(); return; }
  const back = cl('[data-proj-back]');
  if (back) { estado.projetos.sel = ''; renderProjetos(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const sort = cl('[data-proj-sort]');
  if (sort) { const col = sort.getAttribute('data-proj-sort'); const p = estado.projetos; if (p.ord === col) p.dir = (p.dir === 1 ? -1 : 1); else { p.ord = col; p.dir = (col === 'key' ? 1 : -1); } renderProjetos(); return; }
  const inc = cl('[data-proj-inc]');
  if (inc) { const k = inc.getAttribute('data-proj-inc'); const p = estado.projetos; p.incAberta = p.incAberta || {}; p.incAberta[k] = !p.incAberta[k]; renderProjetos(); return; }
  const refr = cl('[data-proj-refresh]');
  if (refr) { const p = estado.projetos; if (p.sel) { delete p.fichas[p.sel]; carregaProjFicha(p.sel, true); } else { p.consolidado = null; carregaProjConsolidado(true); } renderProjetos(); return; }
}
function projetosChange(e) {
  const sel = e.target.closest && e.target.closest('[data-proj-sel]');
  if (!sel) return;
  const p = estado.projetos; p.sel = sel.value; p.aba = 'geral'; renderProjetos(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.getElementById('conteudo').addEventListener('click', projetosClick);
document.getElementById('conteudo').addEventListener('change', projetosChange);

// Drill-down do módulo Projetos (nível documento: funciona na tela E dentro dos modais).
document.addEventListener('click', (e) => {
  const cl = (s) => e.target.closest && e.target.closest(s);
  const p = estado.projetos; if (!p) return;
  const c = p.consolidado; const d = p.sel ? p.fichas[p.sel] : null;

  // Dentro de um modal, clicar num projeto fecha o modal e abre a ficha.
  const open = cl('#modal [data-proj-open]');
  if (open) { fechaModal(); p.sel = open.getAttribute('data-proj-open'); p.aba = 'geral'; renderProjetos(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }

  // Consolidado: KPI → composição por projeto.
  const kc = cl('[data-pdrill-cons]');
  if (kc && c) {
    const m = kc.getAttribute('data-pdrill-cons');
    const rot = { total: 'Itens', concluidos: 'Concluídos', backlog: 'Backlog', emAndamento: 'Em andamento', vencidos: 'Vencidos', epicos: 'Épicos abertos', estH: 'Estimado', gastoH: 'Gasto' }[m] || m;
    const val = (x) => m === 'epicos' ? (x.nEpicosAbertos || 0) : (Number(x[m]) || 0);
    const fmt = (m === 'estH' || m === 'gastoH') ? fmtHd : nBR;
    const rows = (c.projetos || []).filter((x) => !x.erro && val(x) > 0).sort((a, b) => val(b) - val(a))
      .map((x) => `<tr class="proj-linha" data-proj-open="${escA(x.key)}"><td><strong>${esc(x.key)}</strong> <span class="muted small">${esc(x.nome)}</span></td><td class="num">${m === 'epicos' ? `${nBR(x.nEpicosAbertos)}/${nBR(x.nEpicos)}` : fmt(val(x))}</td></tr>`).join('');
    abreModal(`<h2>${esc(rot)} — por projeto</h2><div class="muted small" style="margin:2px 0 10px">clique num projeto para abrir a ficha</div>
      <div class="scroll-x"><table><thead><tr><th>Projeto</th><th class="num">${esc(rot)}</th></tr></thead><tbody>${rows || '<tr><td colspan="2" class="muted">Nada.</td></tr>'}</tbody></table></div>`);
    return;
  }

  // Categoria (foco atividade): pessoa → itens concluídos (30d) da categoria.
  const cp = cl('[data-pdrill-catpessoa]');
  if (cp && c) {
    // O nome da categoria pode conter '|' (ex.: "ITPR | Interno…") — separa pelo ÚLTIMO.
    const vcp = cp.getAttribute('data-pdrill-catpessoa');
    const icp = vcp.lastIndexOf('|');
    const catNome = vcp.slice(0, icp), pessoa = vcp.slice(icp + 1);
    const lista = (((c.categorias || {})[catNome] || {}).conc30 || []).filter((x) => x.p === pessoa);
    const rows = lista.map((x) => `<tr><td><a href="${projJira(x.k)}" target="_blank" rel="noopener">${esc(x.k)}</a></td><td>${esc(x.proj)}</td><td>${esc(x.t)}</td><td class="num">${esc(x.d)}</td></tr>`).join('');
    abreModal(`<h2>✓ ${esc(pessoa)} <span class="muted small" style="font-weight:400">· concluídos nos últimos 30 dias — ${esc(catNome)}</span></h2>
      <div class="muted small" style="margin:2px 0 10px">${lista.length} item(ns)</div>
      <div class="scroll-x"><table><thead><tr><th>Chave</th><th>Projeto</th><th>Tipo</th><th class="num">Dia</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">Nada.</td></tr>'}</tbody></table></div>`);
    return;
  }

  // Treemaps do módulo: portfólio (→ ficha) e épicos (→ composição).
  const tm = cl('[data-ptm]');
  if (tm) {
    const tipoTm = tm.getAttribute('data-ptm'), kTm = tm.getAttribute('data-ptm-key');
    if (tipoTm === 'proj') { p.sel = kTm; p.aba = 'geral'; renderProjetos(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (tipoTm === 'epico' && d) {
      const filhosTm = (d.itens || []).filter((i) => i.e === kTm);
      const epTm = (d.epicos || []).find((x) => x.k === kTm);
      projDrillItens(`🧩 ${esc(kTm)}`, (epTm && epTm.resumo) ? epTm.resumo.slice(0, 70) : 'composição do épico', filhosTm);
      return;
    }
  }

  // 🛠 Abrir na Gestão: leva os itens do drill atual para a Gestão de Tickets
  // (mesmo mecanismo do Analytics: soKeys + origem + tudo pré-selecionado).
  const pg = cl('[data-pj-gestao]');
  if (pg && _projDrillUlt && _projDrillUlt.itens.length) {
    const g = estado.gestao;
    g.soKeys = _projDrillUlt.itens.map((i) => i.k);
    g.origem = `📁 ${_projDrillUlt.titulo}`;
    g.preset = ''; g.busca = ''; g.fProj = ''; g.fResp = ''; g.fStatus = ''; g.semTrat = false;
    g.sel = {}; g.soKeys.forEach((k2) => { g.sel[k2] = true; });
    fechaModal();
    vaiPara('gestao');
    return;
  }

  if (!d) return;   // os drills abaixo são da ficha

  // Ficha: idade do backlog / vencimentos / carga por responsável → itens.
  const ag = cl('[data-pdrill-aging]');
  if (ag) {
    const b = ag.getAttribute('data-pdrill-aging'); const hoje = projHoje();
    const rot = (PROJ_AGING.find(([k2]) => k2 === b) || [])[1] || b;
    projDrillItens(`⏳ ${esc(rot)} — ${esc(projNome(p.sel))}`, 'itens abertos por idade de criação', (d.itens || []).filter((i) => projAgingKey(i, hoje) === b));
    return;
  }
  const vc = cl('[data-pdrill-venc]');
  if (vc) {
    const b = vc.getAttribute('data-pdrill-venc'); const hoje = projHoje();
    const rot = (PROJ_VENC.find(([k2]) => k2 === b) || [])[1] || b;
    projDrillItens(`📅 ${esc(rot)} — ${esc(projNome(p.sel))}`, 'itens abertos por vencimento', (d.itens || []).filter((i) => projVencKey(i, hoje) === b));
    return;
  }
  const rp = cl('[data-pdrill-resp]');
  if (rp) {
    const nome = rp.getAttribute('data-pdrill-resp');
    projDrillItens(`👤 ${esc(nome)} — ${esc(projNome(p.sel))}`, 'itens abertos da pessoa', (d.itens || []).filter((i) => projAberto(i) && (i.r || 'Não atribuído') === nome));
    return;
  }

  // Ficha: KPI → itens que o compõem (épicos têm modal próprio, com drill nos filhos).
  const kf = cl('[data-proj-kpi]');
  if (kf) {
    const kpi = kf.getAttribute('data-proj-kpi');
    if (kpi === 'epicos') {
      const rows = (d.epicos || []).map((ep) => `<tr class="proj-linha" data-pdrill-epico="${escA(ep.k)}"><td><a href="${projJira(ep.k)}" target="_blank" rel="noopener">${esc(ep.k)}</a></td><td>${esc((ep.resumo || '').slice(0, 60))}</td><td>${esc(ep.status)}</td><td class="num">${nBR(ep.nConcluidos)}/${nBR(ep.nFilhos)}</td><td class="num">${nBR(ep.pct)}%</td></tr>`).join('');
      abreModal(`<h2>Épicos de ${esc(projNome(p.sel))}</h2><div class="muted small" style="margin:2px 0 10px">clique num épico para ver o que o compõe</div>
        <div class="scroll-x"><table><thead><tr><th>Épico</th><th>Resumo</th><th>Status</th><th class="num">Concl./Filhos</th><th class="num">%</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">Sem épicos.</td></tr>'}</tbody></table></div>`);
    } else {
      const rot = { total: 'Todos os itens', concluidos: 'Concluídos', cancelados: 'Cancelados', andamento: 'Em andamento', backlog: 'Backlog', vencidos: 'Vencidos' }[kpi] || kpi;
      projDrillItens(`${esc(rot)} — ${esc(projNome(p.sel))}`, '', projFiltraKpi(d.itens || [], kpi));
    }
    return;
  }
  // Ficha: barra de dimensão (status/tipo/prioridade/rótulo) → itens.
  const dd = cl('[data-pdrill-dim]');
  if (dd) {
    // O valor pode conter '|' — o tipo é sempre o 1º segmento.
    const vdd = dd.getAttribute('data-pdrill-dim');
    const idd = vdd.indexOf('|');
    const tipo = vdd.slice(0, idd), val = vdd.slice(idd + 1);
    const its = (d.itens || []).filter((i) => tipo === 'st' ? i.st === val
      : tipo === 't' ? i.t === val
      : tipo === 'pr' ? i.pr === val
      : (val === 'Sem categoria' ? !i.l : (i.l || '').split(',').includes(val)));
    projDrillItens(`${esc(val)} — ${esc(projNome(p.sel))}`, { st: 'por status', t: 'por tipo', pr: 'por prioridade', l: 'por rótulo' }[tipo] || '', its);
    return;
  }
  // Ficha: épico → composição (filhos em 2 níveis).
  const de = cl('[data-pdrill-epico]');
  if (de) {
    const k = de.getAttribute('data-pdrill-epico');
    const filhos = (d.itens || []).filter((i) => i.e === k);
    const ep = (d.epicos || []).find((x) => x.k === k);
    projDrillItens(`🧩 ${esc(k)}`, (ep && ep.resumo) ? ep.resumo.slice(0, 70) : 'composição do épico', filhos);
    return;
  }
  // Ficha: mês da evolução → criados e concluídos no mês.
  const dm = cl('[data-pdrill-mes]');
  if (dm) {
    const mes = dm.getAttribute('data-pdrill-mes');
    const criados = (d.itens || []).filter((i) => (i.c || '').startsWith(mes));
    const concl = (d.itens || []).filter((i) => (i.rd || '').startsWith(mes));
    abreModal(`<h2>${esc(mes)} — ${esc(projNome(p.sel))}</h2>
      <div class="sec">Criados no mês (${criados.length})</div>${projTabelaItens(criados, 150)}
      <div class="sec" style="margin-top:14px">Concluídos no mês (${concl.length})</div>${projTabelaItens(concl, 150)}`);
    return;
  }
});

