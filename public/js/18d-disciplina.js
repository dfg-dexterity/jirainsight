// Jira Insights · 18d · 🧭 DISCIPLINA DO TIME (Dexterity Insights › 📈 Dashboard de KPIs, 6ª aba: vista `dashdisc`).
//
// O pedido (2026-11-16): "indicadores enviados junto com o aviso diário do Teams: ticket que fica de um dia para outro vencido, se a pessoa
// usou o 📆 Hoje para planejar o dia; uma foto à meia-noite desses indicadores todo dia; é importante mostrar a evolução com o tempo".
// O SERVIDOR fotografa (api/_lib/disciplina.js; linha disc_<AAAA-MM-DD> em jirainsight_config, nunca na cfg) e esta tela só LÊ a fatia:
// GET /api/config?disc=1&gran=dia|sem&n=. O servidor já entrega o `rec` pronto (dia útil ou semana, com `saiu` calculado e o recorte por papel
// aplicado) — nada aqui recalcula o que ele calculou.
//
// Por que módulo próprio: o renderDash do 18c é atado a sem|mes e às fotos de KPI (↻, horizonte, pendentes). Aqui a carga, a janela e os filtros
// são outros, mas as PRIMITIVAS são as mesmas (tiles, gráficos, chips, tabela, CSV, glossário — DSH_IND é a fonte única dos indicadores, e os
// indicadores `d*` do grupo `disc` moram lá). O 18c delega: renderDash() → renderDisc(); dshJanela() → dscJanela().
//
// Quem vê o quê é decidido NO SERVIDOR (recorteDisc): gestor/negócio/diretoria/admin recebem a lista por pessoa inteira; os demais recebem os
// totais do time e só a PRÓPRIA linha (a tela fixa a pessoa nos tiles/gráfico — dscEuForcado — e diz isso no rodapé).
// Estado: estado.dash.disc (nasce no 18c, que o 29-url-topo lê para os links kdg/kdp).

const DSC_TTL_MS = 10 * 60 * 1000;
const DSC_TETO = { dia: 132, sem: 60 };
// período: [nº de períodos, rótulo]; o 1º elemento marcado é o padrão de cada granularidade
const DSC_PERS = { dia: [[22, '1 mês'], [66, '3 meses'], [132, '6 meses']], sem: [[13, '3 meses'], [26, '6 meses'], [52, '12 meses']] };
const DSC_PER_PADRAO = { dia: 66, sem: 26 };
const DSC_DIAS_GRADE = 10;
const DSC_DIAS_GRADE_CEL = 5;
const DSC_COLS = [
  ['nome', 'Pessoa'], ['esp', 'Dias esperados'], ['plan', 'Planejou'], ['cedo', 'Até 12h'], ['fech', 'Fechou'], ['venc', 'Vencidos (último retrato)'], ['novos', 'Novos'], ['saiu', 'Saíram'],
];

const dscS = () => estado.dash.disc;
const dscPct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);

// ---------------------------------------------------------------------------
// Leitura (cache na sessão por granularidade, da IDENTIDADE que leu — o servidor recorta por papel e o navegador não pode contrariar)
// ---------------------------------------------------------------------------
function dscNecessario() {
  const S = dscS(); const D = estado.dash; const f = D.comparar ? 2 : 1;
  return Math.min(DSC_TETO[S.gran] || 66, S.per * f);
}
function dscCarrega(gran, n) {
  const S = dscS(); if (S.carr[gran]) return;
  const idk = dshIdk();
  S.carr[gran] = true; S.erro[gran] = '';
  fetch(`/api/config?disc=1&gran=${gran}&n=${n}`, { headers: dshHeaders(), cache: 'no-store' })
    .then((r) => r.json().catch(() => ({ ok: false, erro: `Resposta inesperada do servidor (HTTP ${r.status}).` })))
    .then((j) => {
      S.carr[gran] = false;
      if (idk !== dshIdk()) { if (estado.vista === 'dashdisc') renderDash(); return; }   // a identidade mudou no meio da leitura: descarta
      if (!j || j.ok === false) S.erro[gran] = (j && j.erro) || 'Não consegui ler as fotos da disciplina.';
      else {
        S.cache[gran] = { n, itens: j.itens || [], pendentes: j.pendentes || 0, em: Date.now(), papeis: j.papeis || [], accountId: j.accountId || '', idk, de: j.de || '', fim: j.fim || '', horizonte: j.horizonte || '', desde: j.desde || '', planAte: j.planAte || '' };
        S.ver++; S._jan = null;
      }
      if (estado.vista === 'dashdisc') renderDash();
    })
    .catch((e) => {
      S.carr[gran] = false;
      if (idk !== dshIdk()) { if (estado.vista === 'dashdisc') renderDash(); return; }
      S.erro[gran] = `Sem resposta do servidor (${String((e && e.message) || e)}).`;
      if (estado.vista === 'dashdisc') renderDash();
    });
}
function dscGarante() {
  const S = dscS(); const eu = dshIdk();
  if (Object.values(S.cache).some((c) => c && c.idk !== eu)) dshZeraCache();
  const gran = S.gran; const n = dscNecessario(); const c = S.cache[gran];
  if ((!c || c.n < n || Date.now() - c.em > DSC_TTL_MS) && !S.carr[gran] && !S.erro[gran]) dscCarrega(gran, n);
}

// A janela: `atual` (W períodos) e `ant` (até W anteriores, para o "comparar"), memorizada pela versão do cache.
function dscJanela() {
  const D = estado.dash; const S = dscS(); const gran = S.gran;
  const chave = `${S.ver}|${gran}|${S.per}|${D.comparar ? 1 : 0}`;
  if (S._jan && S._jan.k === chave) return S._jan;
  const c = S.cache[gran]; const itens = (c && c.itens) || [];
  const W = S.per; const tudo = itens.slice(-(W * 2));
  const atual = tudo.slice(-W); const ant = tudo.slice(0, Math.max(0, tudo.length - atual.length));
  S._jan = { k: chave, gran, W, atual, ant, fim: (c && c.fim) || '' };
  return S._jan;
}
// quem não vê o time todo recebe só a própria linha: a tela fixa a pessoa (tiles e gráfico da própria linha)
function dscEuForcado() {
  if (dshVeTudo() || !dshPapeis().length) return '';
  const d = dscS().cache; const c = d.dia || d.sem; return (c && c.accountId) || '';
}
const dscNome = (a, p) => ((typeof nomePessoaDe === 'function' && nomePessoaDe(a) !== a) ? nomePessoaDe(a) : ((p && p.nome) || a));

// ---------------------------------------------------------------------------
// Opções de pessoa (do que o servidor mandou) e filtros
// ---------------------------------------------------------------------------
function dscPessoas() {
  const out = {};
  const c = dscS().cache[dscS().gran]; ((c && c.itens) || []).forEach((r) => { if (r.disc) Object.entries(r.disc.porPessoa || {}).forEach(([a, p]) => { out[a] = dscNome(a, p); }); });
  return out;
}
function dscFiltrosHTML() {
  const D = estado.dash; const S = dscS(); const veTudo = dshVeTudo(); const pessoas = dscPessoas();
  const ch = (rot, attr, val, on, tip) => `<button type="button" class="dsh-chip" aria-pressed="${on}" ${attr}="${val}"${tip ? ` data-tip="${escA(tip)}"` : ''}>${rot}</button>`;
  const per = DSC_PERS[S.gran].map(([n, rot]) => ch(rot, 'data-dsc-per', n, S.per === n)).join('');
  const gr = ch('Dia a dia', 'data-dsc-gran', 'dia', S.gran === 'dia', 'Uma foto por dia útil, tirada à meia-noite') + ch('Semana a semana', 'data-dsc-gran', 'sem', S.gran === 'sem', 'Soma das pessoas-dia da semana; vencidos = o último retrato da semana');
  const optPes = `<option value="">Todas as pessoas</option>${Object.entries(pessoas).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt')).map(([a, n]) => `<option value="${escA(a)}"${D.pessoa === a ? ' selected' : ''}>${esc(n)}</option>`).join('')}`;
  const acoes = `<button type="button" class="tsc-btn" data-dsh-tabela="1" aria-pressed="${D.tabela}" data-tip="Mostra os números do gráfico em tabela">▦ tabela</button>
    <button type="button" class="tsc-btn" data-dsh-copiar="1" data-tip="Copia a tabela (cole no Excel ou no Teams)">📋 copiar</button>
    <button type="button" class="tsc-btn" data-dsh-csv="1" data-tip="Baixa a tabela em CSV">📥 CSV</button>`;
  const campos = `<div class="campo"><label>Período</label><div class="dsh-chips" role="group" aria-label="Período">${per}</div></div>
      <div class="campo"><label>Granularidade</label><div class="dsh-chips" role="group" aria-label="Granularidade">${gr}</div></div>
      ${veTudo ? `<div class="campo"><label for="dsc-pessoa">Pessoa</label><select id="dsc-pessoa">${optPes}</select></div>` : ''}
      <div class="campo dsh-comp"><label class="check"><input type="checkbox" id="dsh-comp"${D.comparar ? ' checked' : ''}> comparar com o período anterior</label></div>`;
  const chipsAtivos = (veTudo && D.pessoa) ? `<div class="dsh-ativos"><span class="muted small">Filtrando por:</span> <button type="button" class="dsh-chip" data-dsh-limpa="pessoa" data-tip="Tirar o filtro" aria-label="Tirar o filtro de pessoa: ${escA(pessoas[D.pessoa] || D.pessoa)}">pessoa: <b>${esc(pessoas[D.pessoa] || dscNome(D.pessoa))}</b> ✕</button></div>` : '';
  if (!dshMobile()) return `<div class="dsh-filtros" id="dsc-filtros">${campos}<div class="campo dsh-acoes">${acoes}</div></div>${chipsAtivos}`;
  const per1 = (DSC_PERS[S.gran].find((x) => x[0] === S.per) || [0, ''])[1];
  const resumo = ['Filtros', per1, S.gran === 'dia' ? 'dia a dia' : 'semana a semana', (veTudo && D.pessoa) ? (pessoas[D.pessoa] || 'uma pessoa') : 'todo o time'].join(' · ');
  return `<div class="dsh-filtros dsh-filtros-m" id="dsc-filtros">
      <details class="dsh-filtros-det"${D.filtrosAbertos ? ' open' : ''}><summary>${esc(resumo)}</summary><div class="dsh-filtros-in">${campos}</div></details>
      <div class="campo dsh-acoes">${acoes}</div>
    </div>${chipsAtivos}`;
}

// ---------------------------------------------------------------------------
// 👥 Por pessoa no período (só as linhas que o servidor mandou)
// ---------------------------------------------------------------------------
function dscPessoasDados(jan) {
  const acc = {};
  jan.atual.forEach((r) => {
    if (!r.disc) return;
    Object.entries(r.disc.porPessoa || {}).forEach(([a, p]) => {
      const L = acc[a] || (acc[a] = { a, nome: dscNome(a, p), esp: 0, plan: 0, cedo: 0, fech: 0, venc: null, novos: null, saiu: null });
      L.nome = dscNome(a, p);
      ['esp', 'plan', 'cedo', 'fech'].forEach((k) => { L[k] += Number(p[k]) || 0; });
      ['novos', 'saiu'].forEach((k) => { if (p[k] != null) L[k] = (L[k] || 0) + p[k]; });
      if (r.modo !== 'retro' && p.venc != null) L.venc = p.venc;
    });
  });
  return Object.values(acc);
}
function dscPessoasHTML(jan) {
  const S = dscS(); const D = estado.dash; const veTudo = dshVeTudo();
  let linhas = dscPessoasDados(jan);
  if (!linhas.length) return `<div class="card full dsc-pes"><h3 class="dsh-h3">👥 Por pessoa no período</h3><div class="estado">Nenhuma pessoa com foto neste período.</div></div>`;
  const ord = S.ord || 'nome'; const dir = S.ordDir || 1;
  const val = (L) => (ord === 'nome' ? L.nome.toLowerCase() : (ord === 'plan' || ord === 'fech' || ord === 'cedo') ? (dscPct(L[ord], L.esp) == null ? -1 : dscPct(L[ord], L.esp)) : (L[ord] == null ? -1 : L[ord]));
  linhas = linhas.slice().sort((a, b) => { const x = val(a); const y = val(b); const c = typeof x === 'string' ? x.localeCompare(y, 'pt') : x - y; return (c || a.nome.localeCompare(b.nome, 'pt')) * dir; });
  const cab = DSC_COLS.map(([k, rot]) => `<th scope="col"${ord === k ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : ''}><button type="button" class="dsc-ord" data-dsc-ord="${k}" data-tip="Ordenar por ${escA(rot)}">${esc(rot)}${ord === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('');
  const nn = (v) => (v == null ? '—' : String(v));
  const cel = (n, e) => (e > 0 ? `${n} <span class="muted small">(${dscPct(n, e)}%)</span>` : '—');
  const rows = linhas.map((L) => {
    const nome = (veTudo && linhas.length > 1) ? `<button type="button" class="dsc-nome" data-dsh-q="pessoa" data-dsh-qk="${escA(L.a)}" data-tip="Filtrar a tela por ${escA(L.nome)}">${esc(L.nome)}</button>` : esc(L.nome);
    return `<tr${D.pessoa === L.a ? ' class="dsc-sel" aria-current="true"' : ''}><th scope="row">${nome}</th><td>${L.esp}</td><td>${cel(L.plan, L.esp)}</td><td>${cel(L.cedo, L.esp)}</td><td>${cel(L.fech, L.esp)}</td><td>${nn(L.venc)}</td><td>${nn(L.novos)}</td><td>${nn(L.saiu)}</td></tr>`;
  }).join('');
  const aviso = veTudo ? '' : '<div class="muted small dsc-aviso">Você vê os totais do time e a sua linha; a lista por pessoa é de gestor, negócio, diretoria e admin.</div>';
  return `<div class="card full dsc-pes"><h3 class="dsh-h3">👥 Por pessoa no período <span class="muted small">${veTudo ? 'clique no nome para filtrar a tela' : 'só a sua linha'}</span></h3>${aviso}
    <div class="dsh-tab-wrap scroll-x"><table class="tsc-tab dsc-tab"><caption class="dsh-sr">Disciplina por pessoa no período</caption><thead><tr>${cab}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// ---------------------------------------------------------------------------
// 📅 Dia a dia por pessoa (só gran=dia): a grade 🌅🌙
// ---------------------------------------------------------------------------
function dscGradeHTML(jan) {
  if (jan.gran !== 'dia') return '';
  const D = estado.dash; const veTudo = dshVeTudo();
  const n = dshMobile() ? DSC_DIAS_GRADE_CEL : DSC_DIAS_GRADE;
  const dias = jan.atual.slice(-n);
  const pess = {};
  dias.forEach((r) => { if (r.disc) Object.entries(r.disc.porPessoa || {}).forEach(([a, p]) => { pess[a] = dscNome(a, p); }); });
  let ids = Object.keys(pess).sort((a, b) => pess[a].localeCompare(pess[b], 'pt'));
  if (veTudo && D.pessoa) ids = ids.filter((a) => a === D.pessoa);
  if (!ids.length) return `<div class="card full dsc-grade-c"><h3 class="dsh-h3">📅 Dia a dia por pessoa</h3><div class="estado">Nenhuma pessoa com foto nos últimos ${n} dias úteis.</div></div>`;
  const cab = dias.map((r) => `<th scope="col" class="dsc-g-d" title="${escA(dshLeituraX('dia', r.chave))}"><span>${esc(dshRotX('dia', r.chave))}</span><span class="muted small">${esc(dshDow(r.chave))}</span></th>`).join('');
  const rows = ids.map((a) => {
    const cels = dias.map((r) => {
      const quando = dshLeituraX('dia', r.chave);
      if (r.vazio || !r.disc) return `<td class="dsc-g-x" title="${escA(`${quando}: sem foto`)}" aria-label="${escA(`${pess[a]}, ${quando}: sem foto`)}">–</td>`;
      const p = (r.disc.porPessoa || {})[a];
      if (!p) return `<td class="dsc-g-f" title="${escA(`${quando}: fora do público do dia (ausente, oculto ou sem meta)`)}" aria-label="${escA(`${pess[a]}, ${quando}: fora do público do dia`)}"></td>`;
      const ic = (p.plan && p.fech) ? '🌅🌙' : p.plan ? '🌅' : p.fech ? '🌙' : '·';
      const txt = [p.plan ? 'planejou' : 'não planejou', p.fech ? 'fechou o dia' : 'não fechou o dia'].join(' e ') + (p.venc != null ? (p.venc > 0 ? `; ${p.venc} vencido(s)` : '; sem vencidos') : '');
      const v = (p.venc != null && p.venc > 0) ? `<sup class="dsc-v">${p.venc}</sup>` : '';
      return `<td class="dsc-g-c${p.plan ? ' pl' : ''}${p.fech ? ' fe' : ''}" title="${escA(`${quando}: ${txt}`)}" aria-label="${escA(`${pess[a]}, ${quando}: ${txt}`)}"><span aria-hidden="true">${ic}</span>${v}</td>`;
    }).join('');
    return `<tr><th scope="row">${esc(pess[a])}</th>${cels}</tr>`;
  }).join('');
  return `<div class="card full dsc-grade-c"><h3 class="dsh-h3">📅 Dia a dia por pessoa <span class="muted small">os últimos ${dias.length} dias úteis</span></h3>
    <div class="muted small dsc-leg">🌅 planejou · 🌙 fechou · · não planejou · vazio = fora do público do dia · – = sem foto · número pequeno = vencidos na meia-noite</div>
    <div class="dsh-tab-wrap scroll-x"><table class="tsc-tab dsc-grade"><caption class="dsh-sr">Disciplina por pessoa e dia</caption><thead><tr><th scope="col">Pessoa</th>${cab}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// ---------------------------------------------------------------------------
// Rodapé, estados e a tela
// ---------------------------------------------------------------------------
function dscRodapeHTML(jan, c) {
  const D = estado.dash; const itens = [];
  const desde = c.desde || ''; const hor = c.horizonte || '';
  const fimR = (r) => r.ate || r.chave;
  const vazios = jan.atual.filter((r) => r.vazio && (!desde || fimR(r) >= desde));
  const antes = vazios.filter((r) => hor && fimR(r) < hor); const buraco = vazios.filter((r) => !(hor && fimR(r) < hor));
  const un = jan.gran === 'dia' ? 'dia(s) útil(eis)' : 'semana(s)';
  itens.push('📸 foto à meia-noite de cada dia útil (do dia que acabou)');
  if (buraco.length) itens.push(`${buraco.length} ${un} sem foto (aparecem como buraco no gráfico; o servidor recupera o planejamento no tique da manhã, mas os vencidos de um dia sem foto a tempo não se reconstroem)`);
  if (antes.length) itens.push(`${antes.length} ${un} anteriores a ${esc(dataBR(hor))} não têm foto (o histórico começa em ${esc(dataBR(hor))})`);
  else if (hor) itens.push(`histórico desde ${esc(dataBR(hor))}`);
  if (!buraco.length && !antes.length) itens.push('todos os períodos da janela têm foto');
  const rec = jan.atual.filter((r) => r.modo === 'recuperada');
  if (rec.length) itens.push(`${rec.length} foto(s) recuperada(s): tirada(s) depois da meia-noite (o cron da noite não rodou a tempo) — os vencidos são os do momento da foto`);
  const retro = jan.atual.filter((r) => r.modo === 'retro' || r.modo === 'misto');
  if (retro.length) itens.push(`${retro.length} ${jan.gran === 'dia' ? 'dia(s)' : 'semana(s)'} com foto retroativa: sem retrato dos vencidos (o estado aberto/vencido não se reconstrói); o planejamento e o fechamento vêm dos carimbos do 📆 Hoje e usam os ativos de hoje como público`);
  if (c.planAte) itens.push(`"planejou até ${esc(c.planAte.replace(':00', 'h'))}" = planejado na véspera ou até esse horário`);
  itens.push('vencidos = a régua do card ⚠ Meus tickets vencidos da Início (todos os tipos de ticket)');
  const ult = jan.atual.slice().reverse().find((r) => r.disc && r.modo !== 'retro' && r.disc.fora);
  if (ult) { const f = ult.disc.fora; const t = (f.semResp || 0) + (f.ausentes || 0) + (f.outros || 0); if (t) itens.push(`fora do público no último retrato: ${f.semResp || 0} sem responsável · ${f.ausentes || 0} de pessoas ausentes · ${f.outros || 0} de outros (não entram nos totais)`); }
  if (D.comparar && !jan.ant.some(dshTemFoto)) itens.push('período anterior sem fotos — comparação indisponível');
  else if (D.comparar) itens.push('tracejado = período anterior, só do 1º indicador de cada gráfico');
  if (!dshVeTudo() && dshPapeis().length) itens.push('você vê os totais do time e a sua linha; a lista por pessoa é de gestor, negócio, diretoria e admin');
  return `<div class="card full dsh-rodape" role="note">${itens.map((x) => `<span>${x}</span>`).join('<span class="dsh-sep" aria-hidden="true">·</span>')}</div>`;
}
function dscEstadoHTML(msg, erroGran) {
  return `<div class="ct-tela dsh-tela"><div class="card full"><h2>🧭 Disciplina do time <span>${esc((DSH_VIS.dashdisc || {}).sub || '')}</span></h2>
    ${erroGran ? `<div class="erro">${esc(erroGran)} <button type="button" class="btn" data-dsc-retry="1">Tentar de novo</button></div>` : `<div class="estado" aria-busy="true">${esc(msg)}</div>`}</div></div>`;
}
function renderDisc() {
  const D = estado.dash; const S = dscS(); const cont = document.getElementById('conteudo');
  if (typeof _tscReset === 'function') _tscReset();
  dscGarante();
  const gran = S.gran; const c = S.cache[gran];
  if (!c) { cont.replaceChildren(el(dscEstadoHTML('Lendo as fotos da disciplina…', S.erro[gran]))); return; }
  const jan = dscJanela(); const F = dshFiltro(); const vis = DSH_VIS.dashdisc;
  const algumaFoto = jan.atual.concat(jan.ant).some(dshTemFoto);
  const errAtual = S.erro[gran];
  let corpo;
  if (!algumaFoto) {
    corpo = '<div class="card full dsh-vazio"><div class="estado">📸 Ainda não há fotos — a primeira sai na próxima meia-noite de dia útil; o planejamento dos últimos dias entra retroativo no próximo tique da manhã.</div></div>';
  } else {
    const tiles = dshTilesHTML(DSH_IND.filter((i) => i.grupo === 'disc' && i.tile).map((i) => i.id), jan, F);
    const ids = dshIdsDe('dashdisc'); const dados = dshTabelaDados('dashdisc', jan, F);
    corpo = `${tiles}
    <div class="card full dsh-grafico"><h3 class="dsh-h3">📈 ${esc(vis.titulo)} <span class="muted small">clique num ponto para abrir o dia no 📆 Hoje do time</span></h3>
      ${dshChipsHTML('dashdisc')}
      ${dshGraficosHTML(ids, jan, F, D.comparar)}
      ${D.tabela ? dshTabelaHTML(dados) : ''}
    </div>
    ${dscPessoasHTML(jan)}
    ${dscGradeHTML(jan)}
    ${dshGlossarioHTML(DSH_IND.filter((i) => i.grupo === 'disc'))}`;
  }
  const notas = [];
  if (D.cat || D.proj) notas.push('A disciplina é do time por pessoa, não por projeto — o filtro de categoria/projeto foi ignorado aqui.');
  const aviso = (errAtual ? `<div class="aviso dsh-aviso">⚠ ${esc(errAtual)} — mostrando o que já estava na tela. <button type="button" class="btn" data-dsc-retry="1">Tentar de novo</button></div>` : '')
    + notas.map((t) => `<div class="aviso dsh-aviso">ℹ️ ${esc(t)}</div>`).join('');
  const per1 = (DSC_PERS[gran].find((x) => x[0] === S.per) || [0, `${S.per}`])[1];
  cont.replaceChildren(el(`<div class="ct-tela dsh-tela">
    <div class="card full dsh-topo"><h2 title="${escA(vis.sub)}">🧭 ${esc(vis.titulo)} <span>${esc(per1)} · ${gran === 'dia' ? 'dia a dia' : 'semana a semana'}${D.comparar ? ' · comparando com o período anterior' : ''}</span></h2>
      ${dscFiltrosHTML()}${aviso}</div>
    ${corpo}
    ${algumaFoto ? dscRodapeHTML(jan, c) : ''}
  </div>`));
}

// ---- Listeners delegados desta tela (os data-dsh-* de sempre — chips, tabela, CSV, filtro por pessoa, comparar — são do 18c) ----
function dscMuda() { dscS()._jan = null; try { estadoParaURL(); } catch (e) { /* link é conveniência */ } renderDash(); }
document.getElementById('conteudo').addEventListener('click', (e) => {
  if (estado.vista !== 'dashdisc') return;
  const alvo = e.target.closest && e.target.closest('[data-dsc-gran],[data-dsc-per],[data-dsc-ord],[data-dsc-retry]'); if (!alvo) return;
  const S = dscS(); const a = (n) => alvo.getAttribute(n);
  if (alvo.hasAttribute('data-dsc-gran')) {
    const g = a('data-dsc-gran') === 'sem' ? 'sem' : 'dia'; if (g === S.gran) return;
    const i = Math.max(0, DSC_PERS[S.gran].findIndex((x) => x[0] === S.per));   // o mesmo "tamanho" na outra granularidade (1 mês ≈ 3 meses…)
    S.gran = g; S.per = DSC_PERS[g][i][0]; dscMuda();
  }
  else if (alvo.hasAttribute('data-dsc-per')) { const n = +a('data-dsc-per'); if (DSC_PERS[S.gran].some((x) => x[0] === n)) { S.per = n; dscMuda(); } }
  else if (alvo.hasAttribute('data-dsc-ord')) { const k = a('data-dsc-ord'); if (S.ord === k) S.ordDir = -(S.ordDir || 1); else { S.ord = k; S.ordDir = k === 'nome' ? 1 : -1; } renderDash(); }
  else if (alvo.hasAttribute('data-dsc-retry')) { S.erro = {}; renderDash(); }
});
document.getElementById('conteudo').addEventListener('change', (e) => {
  if (estado.vista !== 'dashdisc') return;
  const t = e.target; if (!t || t.id !== 'dsc-pessoa') return;
  estado.dash.pessoa = t.value; dscMuda();
});
