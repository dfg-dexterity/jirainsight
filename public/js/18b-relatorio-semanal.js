// Jira Insights · 18b · 📊 RELATÓRIO SEMANAL DE SEXTA — a tela (?v=semanal), comparável semana a semana (R28).
//
// O pedido (2026-09-28): "toda sexta um relatório do planejado × orçado × realizado, reuniões, tickets
// criados, qualidade da informação — comparável com as semanas anteriores, com a atividade de cada
// pessoa e a visão do gerente do projeto". O SERVIDOR tira a foto (api/teams.js ?tipo=semanal, cálculo
// em api/_lib/semanal.js) e a guarda; esta tela só LÊ as fotos (GET /api/config?semanal=1&n=8, com a
// identidade do Jira) e compara: Δ vs a foto anterior, média das últimas 4 e a série das 8 — tudo
// calculado aqui, sobre números já prontos. Nada é recalculado das fontes: é isso que garante que o
// cartão do Teams, a mensagem de cada gerente e a tela contam a mesma história.
//
// Quem vê o quê é decidido NO SERVIDOR (papel por cfg.papeis/cfg.gestores): gestor, negócio, diretoria
// e admin recebem a foto inteira; os demais recebem o time, a própria linha e os projetos em que são
// gerentes — a tela desenha o que veio, sem decidir nada. A foto não tem R$: aqui é horas, tickets e nota.
//
// "Semana fechada": a foto sai na sexta à tarde, com o dia em curso; a execução seguinte anota o
// realizado FECHADO (`realFechado`). Quando ele existe, é ele que a tela mostra como realizado (com o
// selo 🔒) e o que ela usa para refazer execução e consumo; aderência fica a da foto (depende das chaves
// pessoa·dia·projeto, que não viajam). Sem foto ainda? A tela explica quando a primeira sai (⚙️ config).

const SM_N = 8;                         // fotos por janela (a série do gráfico e o seletor)
const SM_RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
// Estado da tela (só nesta sessão): a janela lida, a semana escolhida e a ordenação das tabelas.
// Nasce aqui (não em 01-nucleo) para o link ?v=semanal&semana= poder ser lido pelo 29-url-topo.
estado.semanal = estado.semanal || { dados: null, carregando: false, erro: '', sel: '', ate: '', ordP: 'real', dirP: -1, ordJ: 'real', dirJ: -1 };

// ---- leitura ----
function smHeaders(){ const id = idApontar() || {}; return { 'x-jira-email': id.email || '', 'x-jira-token': id.token || '' }; }
function smCarrega(){
  const st = estado.semanal; st.carregando = true; st.erro = '';
  const q = new URLSearchParams({ semanal: '1', n: String(SM_N) });
  if(SM_RE_DATA.test(st.ate)) q.set('semana', st.ate);
  fetch(`/api/config?${q}`, { headers: smHeaders(), cache: 'no-store' }).then(r => r.json()).then(j => {
    st.carregando = false;
    if(!j || j.ok === false){ st.erro = (j && j.erro) || 'Não consegui ler as fotos do relatório semanal.'; st.dados = null; }
    else {
      st.dados = j; const fs = j.semanas || [];
      if(!st.sel || !fs.some(f => f.semana === st.sel)) st.sel = fs.length ? fs[0].semana : '';
    }
    if(estado.vista === 'semanal'){ renderSemanal(); try{ estadoParaURL(); }catch(e){} }
  }).catch(e => {
    st.carregando = false; st.erro = `Sem resposta do servidor (${String((e && e.message) || e)}).`;
    if(estado.vista === 'semanal') renderSemanal();
  });
}

// ---- números ----
const smNum = (v) => ((typeof v === 'number' && Number.isFinite(v)) ? v : null);
const smPct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : null);
const smTemPlano = (p) => ['enviado', 'aprovado'].includes((p && p.planoStatus) || '');
// A "vista" de uma foto: os mesmos campos, com o realizado FECHADO por cima quando ele existe.
// Execução e consumo são refeitos só quando a base inteira está visível (no recorte do consultor
// faltam pessoas e projetos — aí ficam os da foto). Tudo o que a tela mostra passa por aqui.
function smVista(f){
  if(!f) return null;
  const rf = f.realFechado; const fechada = !!(rf && rf.time);
  const time = { ...(f.time || {}) }; time.reunioes = time.reunioes || {}; time.qualidade = time.qualidade || {};
  const pessoas = {}; const projetos = {};
  Object.keys(f.pessoas || {}).forEach(a => {
    const p = { ...f.pessoas[a] }; p.reunioes = p.reunioes || {}; p.qualidade = p.qualidade || {};
    if(fechada){ const r = (rf.pessoas || {})[a] || { real: 0, realFat: 0 }; p.real = r.real || 0; p.realFat = r.realFat || 0; p.exec = smTemPlano(p) ? smPct(p.real, p.plan) : null; }
    pessoas[a] = p;
  });
  Object.keys(f.projetos || {}).forEach(k => {
    const j = { ...f.projetos[k] }; j.qualidade = j.qualidade || {};
    if(fechada){ const r = (rf.projetos || {})[k] || { real: 0, realFat: 0 }; j.real = r.real || 0; j.realFat = r.realFat || 0; j.consumo = smPct(j.real, j.orc); }
    projetos[k] = j;
  });
  if(fechada){
    time.real = rf.time.real || 0; time.realFat = rf.time.realFat || 0;
    const ps = Object.values(pessoas);
    if(ps.length === (f.time || {}).pessoas){ const rc = ps.filter(smTemPlano).reduce((s, p) => s + (p.real || 0), 0); time.exec = smPct(rc, time.plan); }
    const js = Object.values(projetos); const orcVis = js.reduce((s, j) => s + (j.orc || 0), 0);
    if(orcVis === (f.time || {}).orc){ const ro = js.filter(j => j.orc > 0).reduce((s, j) => s + (j.real || 0), 0); time.consumo = smPct(ro, time.orc); }
  }
  return { semana: f.semana, ate: f.ate, fotoEm: f.fotoEm, parado: f.parado, truncado: f.truncado || {}, ia: f.ia || '', fechada, time, pessoas, projetos };
}
// tipo: 'h' segundos · '%' percentual · 'n' contagem · 'pt' nota 0–100. `bom`: para que lado o Δ é bom.
const SM_HERO = [
  { id: 'plan', rot: 'Planejado', v: t => t.plan, tipo: 'h', tip: 'Σ horas dos planos enviados/aprovados da semana (📋 Meu Planejamento)' },
  { id: 'orc', rot: 'Orçado', v: t => t.orc, tipo: 'h', tip: 'Horas vendidas da semana (💹 Rentabilidade, pro rata pelos dias úteis)' },
  { id: 'cap', rot: 'Capacidade', v: t => t.cap, tipo: 'h', tip: 'Meta por dia × dias úteis da semana − ausências (🎯 Metas & ausências)' },
  { id: 'real', rot: 'Realizado', v: t => t.real, tipo: 'h', tip: 'Horas apontadas na semana (Clockwork)' },
  { id: 'exec', rot: 'Execução', v: t => t.exec, tipo: '%', bom: 'alto', tip: 'Realizado ÷ planejado, só de quem tem plano enviado/aprovado' },
  { id: 'ader', rot: 'Aderência', v: t => t.ader, tipo: '%', bom: 'alto', tip: 'Σ min(realizado, planejado) por pessoa · dia · projeto ÷ realizado — quanto do que foi feito era o que estava planejado' },
  { id: 'consumo', rot: 'Consumo do orçado', v: t => t.consumo, tipo: '%', tip: 'Realizado ÷ orçado nos projetos com horas vendidas' },
  { id: 'qual', rot: 'Qualidade', v: t => t.qualidade.nota, tipo: 'pt', bom: 'alto', tip: 'Nota 0–100: apontamento (comentário, específico, dias cheios) 40 · tickets abertos (vencimento, atualizado, estimado, descrição) 45 · plano (enviado, aderência) 15' },
];
const SM_MINI = [
  { id: 'criados', rot: 'Criados', v: t => t.criados, tipo: 'n', tip: 'Tickets criados na semana (data de criação)' },
  { id: 'concluidos', rot: 'Concluídos', v: t => t.concluidos, tipo: 'n', bom: 'alto', tip: 'Tickets resolvidos na semana' },
  { id: 'saldo', rot: 'Saldo', v: t => t.saldo, tipo: 'n', bom: 'baixo', tip: 'Criados − concluídos: o backlog cresceu (+) ou encolheu (−)' },
  { id: 'reuCri', rot: 'Reuniões criadas', v: t => t.reunioes.criadas, tipo: 'n', tip: 'Tickets de reunião criados na semana' },
  { id: 'reuH', rot: 'Horas em reunião', v: t => t.reunioes.horas, tipo: 'h', tip: 'Horas apontadas em tickets de reunião' },
  { id: 'reuVenc', rot: 'Reuniões vencidas', v: t => t.reunioes.vencidasAbertas, tipo: 'n', bom: 'baixo', tip: 'Reuniões ainda abertas com a data no passado' },
  { id: 'vencidos', rot: 'Vencidos', v: t => t.vencidos, tipo: 'n', bom: 'baixo', tip: 'Tickets abertos com vencimento no passado (no dia da foto)' },
  { id: 'parados', rot: 'Parados', v: t => t.parados, tipo: 'n', bom: 'baixo', tip: 'Em andamento sem atualização há N dias ou mais' },
  { id: 'semVenc', rot: 'Sem data', v: t => t.semVenc, tipo: 'n', bom: 'baixo', tip: 'Abertos sem data de vencimento (fora épicos e histórias)' },
  { id: 'diasVazios', rot: 'Dias sem apontar', v: t => t.diasVazios, tipo: 'n', bom: 'baixo', tip: 'Dias úteis (antes do dia da foto) em que alguém do time não apontou nada, descontando ausências' },
];
function smFmt(v, tipo){
  if(v == null) return '—';
  if(tipo === 'h') return fmtH(v);
  if(tipo === '%') return `${v}%`;
  return String(v);
}
// Δ como texto (com sinal): horas em h/min, % em pontos percentuais, contagem e nota como número.
function smFmtD(d, tipo){
  if(d == null) return '';
  const s = d > 0 ? '+' : (d < 0 ? '−' : '');
  const a = Math.abs(d);
  if(tipo === 'h') return `${s}${fmtH(a)}`;
  if(tipo === '%') return `${s}${a} p.p.`;
  return `${s}${a}`;
}
function smDeltaHTML(atual, anterior, tipo, bom, rot){
  const a = smNum(atual), b = smNum(anterior);
  if(a == null || b == null) return `<span class="sm-d muted" data-tip="${escA(rot || 'Sem semana anterior para comparar')}">— vs ant.</span>`;
  const d = a - b; let cls = '';
  if(d !== 0 && bom) cls = ((d > 0) === (bom === 'alto')) ? ' sm-bom' : ' sm-ruim';
  const seta = d > 0 ? '▲' : (d < 0 ? '▼' : '=');
  return `<span class="sm-d${cls}" data-tip="${escA(rot || 'vs semana anterior')}" data-tip2="${escA(`antes: ${smFmt(b, tipo)}`)}">${seta} ${esc(smFmtD(d, tipo))}</span>`;
}
// Média das últimas 4 fotos a partir da escolhida (a própria + até 3 mais antigas); nulos ficam fora.
function smMedia(vistas, i, fn){
  const vs = vistas.slice(i, i + 4).map(v => smNum(fn(v.time))).filter(x => x != null);
  if(!vs.length) return { m: null, n: 0 };
  return { m: Math.round(vs.reduce((s, x) => s + x, 0) / vs.length), n: vs.length };
}
function smRotSemana(v){ return v ? `${dataBR(v.semana).slice(0, 5)} → ${dataBR(v.ate || v.semana)}` : ''; }
function smISO(v){ try{ const s = isoSemana(v.semana); return `S${String(s.num).padStart(2, '0')}`; }catch(e){ return ''; } }
function smQuando(iso){ if(!iso) return ''; try{ return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }catch(e){ return String(iso).slice(0, 16); } }
// Nome de uma pessoa da foto: a linha dela (quando veio), senão o elenco já carregado no painel.
function smNome(V, a){
  const p = V && V.pessoas && V.pessoas[a]; if(p && p.nome) return p.nome;
  const u = (typeof pessoasUnidas === 'function') ? (pessoasUnidas()[a] || null) : null;
  return (u && (u.nome || u.displayName)) || String(a || '').slice(0, 12) || '—';
}
// Maiores desvios da semana: pessoa = real − plan (quem tem plano) · projeto = real − orc (com orçado).
function smDesvios(V){
  const top = (arr) => arr.filter(x => x.d !== 0).sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 5);
  return {
    pessoas: top(Object.entries(V.pessoas).filter(([, p]) => p.plan > 0 && smTemPlano(p)).map(([a, p]) => ({ a, nome: p.nome, base: p.plan, real: p.real, d: p.real - p.plan }))),
    projetos: top(Object.entries(V.projetos).filter(([, j]) => j.orc > 0).map(([k, j]) => ({ k, nome: j.nome, base: j.orc, real: j.real, d: j.real - j.orc }))),
  };
}
const SM_ST_ROT = { aprovado: '✓ aprovado', enviado: '⏳ enviado', elaboracao: '✎ rascunho', devolvido: '↩ devolvido' };

// ---- tabelas (por pessoa / por projeto), com Δ por célula e ordenação ----
const SM_COLS_P = [
  ['nome', 'Pessoa', 'txt'], ['plan', 'Plan.', 'h'], ['cap', 'Cap.', 'h'], ['real', 'Real', 'h'], ['exec', 'Exec.', '%', 'alto'], ['ader', 'Ader.', '%', 'alto'],
  ['criados', 'Criados', 'n'], ['concluidos', 'Concl.', 'n', 'alto'], ['reuCri', 'Reun.', 'n'], ['reuH', 'h reun.', 'h'],
  ['diasVazios', 'Dias vazios', 'n', 'baixo'], ['vencidos', 'Vencidos', 'n', 'baixo'], ['parados', 'Parados', 'n', 'baixo'], ['nota', 'Qualid.', 'pt', 'alto'],
];
const SM_COLS_J = [
  ['nome', 'Projeto', 'txt'], ['plan', 'Plan.', 'h'], ['orc', 'Orç.', 'h'], ['real', 'Real', 'h'], ['consumo', 'Consumo', '%'],
  ['criados', 'Criados', 'n'], ['concluidos', 'Concl.', 'n', 'alto'], ['saldo', 'Saldo', 'n', 'baixo'],
  ['vencidos', 'Vencidos', 'n', 'baixo'], ['parados', 'Parados', 'n', 'baixo'], ['semVenc', 'Sem data', 'n', 'baixo'], ['reuVenc', 'Reun. venc.', 'n', 'baixo'], ['nota', 'Qualid.', 'pt', 'alto'],
  ['gerentes', 'Gerente(s)', 'txt'],
];
function smValP(p, id){
  if(!p) return null;
  if(id === 'nome') return p.nome || '';
  if(id === 'reuCri') return smNum(p.reunioes && p.reunioes.criadas);
  if(id === 'reuH') return smNum(p.reunioes && p.reunioes.horas);
  if(id === 'nota') return smNum(p.qualidade && p.qualidade.nota);
  return smNum(p[id]);
}
function smValJ(j, id){
  if(!j) return null;
  if(id === 'nome') return j.nome || '';
  if(id === 'reuVenc') return smNum(j.reunioesVencidas);
  if(id === 'nota') return smNum(j.qualidade && j.qualidade.nota);
  if(id === 'gerentes') return null;
  return smNum(j[id]);
}
function smOrdena(linhas, ord, dir, val){
  return linhas.slice().sort((x, y) => {
    const a = val(x, ord), b = val(y, ord);
    if(ord === 'nome') return String(a).localeCompare(String(b), 'pt') * dir;
    if(a == null && b == null) return 0; if(a == null) return 1; if(b == null) return -1;   // sem base sempre no fim
    return (a - b) * dir || String(val(x, 'nome')).localeCompare(String(val(y, 'nome')), 'pt');
  });
}
// Cabeçalho ordenável (gerentes e ações não ordenam: são texto/botões).
function smTh(cols, ord, dir, tab){
  return cols.map(([id, rot, tipo]) => (id === 'gerentes' ? `<th>${esc(rot)}</th>`
    : `<th data-sm-sort="${id}" data-sm-tab="${tab}" class="${ord === id ? 'sorted' : ''}${tipo === 'txt' ? '' : ' num'}">${esc(rot)}${ord === id ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`)).join('');
}
// Selo "R28" no título: a tela entrega um relatório oficial da 📚 Central (REL_CAT, 18-controladoria).
function smSeloR(){
  const it = (typeof REL_CAT !== 'undefined') ? REL_CAT.find(r => r.vista === 'semanal') : null; if(!it) return '';
  return `<span class="rc-cods"><button class="rc-cod" data-rc-abrir-rel="${escA(it.id)}" data-tip="${escA(`Relatório ${it.id} · ${it.nome} — clique para ver no catálogo da 📚 Central`)}">${esc(it.id)}</button></span>`;
}
function smCelula(v, ant, tipo, bom, temAnt){
  if(tipo === 'txt') return `<td>${esc(v)}</td>`;
  const d = (temAnt && smNum(v) != null && smNum(ant) != null) ? v - ant : null;
  let cls = ''; if(d && bom) cls = ((d > 0) === (bom === 'alto')) ? ' sm-bom' : ' sm-ruim';
  return `<td class="num">${smFmt(v, tipo)}${d == null ? '' : `<small class="sm-d${cls}">${esc(smFmtD(d, tipo))}</small>`}</td>`;
}
function smTabPessoas(V, A){
  const st = estado.semanal; const temAnt = !!A;
  const linhas = smOrdena(Object.entries(V.pessoas).map(([a, p]) => ({ a, ...p })), st.ordP, st.dirP, (x, id) => smValP(x, id));
  if(!linhas.length) return '<div class="muted small">Nenhuma pessoa nesta foto (no seu recorte).</div>';
  const tr = linhas.map(p => {
    const ant = A && A.pessoas[p.a];
    const stt = p.planoStatus ? `<span class="sm-st ${escA(p.planoStatus)}">${esc(SM_ST_ROT[p.planoStatus] || p.planoStatus)}</span>` : '<span class="sm-st">sem plano</span>';
    const projs = (p.projetos || []).map(x => `${x.p} ${fmtH(x.real)}`).join(' · ');
    const nome = `<td><b>${esc(p.nome)}</b>${stt}${projs ? `<small class="muted">${esc(projs)}</small>` : ''}</td>`;
    return `<tr>${nome}${SM_COLS_P.slice(1).map(([id, , tipo, bom]) => smCelula(smValP(p, id), smValP(ant, id), tipo, bom, temAnt)).join('')}</tr>`;
  }).join('');
  return `<div class="scroll-x"><table class="mp-tab-mini sm-tab sm-tab-p"><thead><tr>${smTh(SM_COLS_P, st.ordP, st.dirP, 'p')}</tr></thead><tbody>${tr}</tbody></table></div>`;
}
function smTabProjetos(V, A){
  const st = estado.semanal; const temAnt = !!A;
  const linhas = smOrdena(Object.entries(V.projetos).map(([k, j]) => ({ k, ...j })), st.ordJ, st.dirJ, (x, id) => smValJ(x, id));
  if(!linhas.length) return '<div class="muted small">Nenhum projeto nesta foto (no seu recorte: só os projetos em que você é gerente).</div>';
  const tr = linhas.map(j => {
    const ant = A && A.projetos[j.k];
    // 🧭 abre as pendências do projeto (?v=gp, a visão do gerente) e 📁 a ficha (🦴 espinha, caminho de volta)
    const acoes = `<span class="sm-acoes-td"><a class="lnk-ficha" href="?v=gp&amp;proj=${encodeURIComponent(j.k)}" data-tip="🧭 Pendências do projeto (visão do gerente): vencidos por pessoa, parados, sem data, reuniões vencidas — para cobrar com clareza">🧭 Pendências</a> ${(typeof projChipsFicha === 'function') ? projChipsFicha([j.k]) : ''}</span>`;
    const nome = `<td><b>${esc(j.nome || j.k)}</b><small class="muted">${esc(j.k)}</small>${acoes}</td>`;
    const ger = (j.gerentes || []).length ? j.gerentes.map(a => esc(smNome(V, a))).join(', ') : '<span class="muted">—</span>';
    return `<tr>${nome}${SM_COLS_J.slice(1, -1).map(([id, , tipo, bom]) => smCelula(smValJ(j, id), smValJ(ant, id), tipo, bom, temAnt)).join('')}<td class="sm-ger">${ger}</td></tr>`;
  }).join('');
  return `<div class="scroll-x"><table class="mp-tab-mini sm-tab sm-tab-j"><thead><tr>${smTh(SM_COLS_J, st.ordJ, st.dirJ, 'j')}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

// ---- resumo em texto (📋 copiar) — o que se cola no Teams ou na ata; sem R$ por definição ----
function smResumoTexto(V, A, vistas, i){
  const t = V.time; const at = A && A.time;
  const d = (id, tipo) => { const k = SM_HERO.concat(SM_MINI).find(x => x.id === id); if(!k || !at) return ''; const a = smNum(k.v(t)), b = smNum(k.v(at)); return (a == null || b == null) ? '' : ` (${smFmtD(a - b, tipo)})`; };
  const L = [];
  L.push(`📊 Relatório semanal · semana ${smRotSemana(V)} · foto de ${smQuando(V.fotoEm)}${V.fechada ? ' · semana fechada' : ''}`);
  L.push(`Time: planejado ${smFmt(t.plan, 'h')}${d('plan', 'h')} · orçado ${smFmt(t.orc, 'h')}${d('orc', 'h')} · capacidade ${smFmt(t.cap, 'h')} · realizado ${smFmt(t.real, 'h')}${d('real', 'h')}`);
  L.push(`Execução ${smFmt(t.exec, '%')}${d('exec', '%')} · aderência ${smFmt(t.ader, '%')}${d('ader', '%')} · consumo do orçado ${smFmt(t.consumo, '%')}${d('consumo', '%')} · qualidade ${smFmt(t.qualidade.nota, 'pt')}/100${d('qual', 'pt')}`);
  L.push(`Tickets: ${t.criados} criados${d('criados', 'n')} · ${t.concluidos} concluídos${d('concluidos', 'n')} · saldo ${smFmtD(t.saldo, 'n') || '0'} · ${t.vencidos} vencidos${d('vencidos', 'n')} · ${t.parados} parados (≥ ${V.parado || 5} dias)${d('parados', 'n')} · ${t.semVenc} sem data`);
  L.push(`Reuniões: ${t.reunioes.criadas} criadas · ${smFmt(t.reunioes.horas, 'h')} apontadas · ${t.reunioes.vencidasAbertas} vencidas abertas · dias sem apontamento: ${t.diasVazios}`);
  const m4 = smMedia(vistas, i, x => x.real); if(m4.n > 1) L.push(`Média das últimas ${m4.n} semanas: realizado ${smFmt(m4.m, 'h')} · execução ${smFmt(smMedia(vistas, i, x => x.exec).m, '%')} · qualidade ${smFmt(smMedia(vistas, i, x => x.qualidade.nota).m, 'pt')}`);
  const dv = smDesvios(V); const linhasDv = dv.pessoas.map(x => `${x.nome} ${smFmtD(x.d, 'h')} vs plano`).concat(dv.projetos.map(x => `${x.k} ${smFmtD(x.d, 'h')} vs orçado`));
  if(linhasDv.length) L.push(`Maiores desvios: ${linhasDv.join('; ')}`);
  const pend = Object.entries(V.projetos).filter(([, j]) => j.vencidos || j.parados || j.semVenc || j.reunioesVencidas)
    .sort((x, y) => (y[1].vencidos + y[1].parados) - (x[1].vencidos + x[1].parados)).slice(0, 8)
    .map(([k, j]) => `${k}: ${j.vencidos} vencidos, ${j.parados} parados, ${j.semVenc} sem data${j.reunioesVencidas ? `, ${j.reunioesVencidas} reuniões vencidas` : ''}${(j.gerentes || []).length ? ` (gerente: ${j.gerentes.map(a => smNome(V, a)).join(', ')})` : ''}`);
  if(pend.length) L.push(`Pendências por projeto: ${pend.join(' · ')}`);
  if(V.ia) L.push(`O que mudou (IA): ${V.ia}`);
  L.push(`Link: https://jirainsight.vercel.app/?v=semanal&semana=${V.semana}`);
  return L.join('\n');
}
function smCopia(){
  const st = estado.semanal; const fs = ((st.dados || {}).semanas) || []; const vistas = fs.map(smVista);
  const i = Math.max(0, vistas.findIndex(v => v.semana === st.sel)); const V = vistas[i]; if(!V) return;
  const tx = smResumoTexto(V, vistas[i + 1] || null, vistas, i);
  const ok = () => toast('📋 Resumo da semana copiado — cole no Teams ou na ata.', 'ok');
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(tx).then(ok).catch(() => prompt('Copie o resumo:', tx));
  else prompt('Copie o resumo:', tx);
}

// ---- a tela ----
function smKpiHTML(k, V, A, vistas, i, mini){
  const a = smNum(k.v(V.time)); const b = A ? smNum(k.v(A.time)) : null;
  const m4 = smMedia(vistas, i, k.v);
  const serie = vistas.slice().reverse().map(v => { const x = smNum(k.v(v.time)); return x == null ? 0 : x; });
  const spark = (!mini && typeof sparkline === 'function' && serie.length > 1) ? `<div class="sm-spark" data-tip="${escA(`${serie.length} semanas (da mais antiga à mais recente)`)}">${sparkline(serie, 120, 30, 'var(--marca,#009994)')}</div>` : '';
  const fech = (k.id === 'real' && V.fechada) ? '<span class="sm-fech" data-tip="Realizado FECHADO: anotado na execução seguinte, quando ninguém mais aponta nesta semana">🔒 fechada</span>' : '';
  return `<div class="sm-kpi${mini ? ' sm-mini' : ''}" data-sm-kpi="${escA(k.id)}" data-tip="${escA(k.tip || k.rot)}">
    <div class="l">${esc(k.rot)}${fech}</div><div class="v">${smFmt(a, k.tipo)}</div>
    <div class="sm-sub">${smDeltaHTML(a, b, k.tipo, k.bom, A ? `vs semana ${smRotSemana(A)}` : '')}${m4.n > 1 ? `<span data-tip="${escA(`Média das últimas ${m4.n} fotos (esta + ${m4.n - 1} anteriores)`)}">média ${m4.n}: <b>${smFmt(m4.m, k.tipo)}</b></span>` : ''}</div>${spark}</div>`;
}
function renderSemanal(){
  const cont = document.getElementById('conteudo'); const st = estado.semanal; const id = idApontar();
  if(!id || !id.accountId){
    cont.replaceChildren(el(`<div><div class="card full sm-card"><h2>📊 Relatório semanal <span>de sexta — planejado × orçado × realizado, semana a semana</span></h2>
      <div class="estado">Identifique-se (e-mail + token do Jira) para abrir o relatório — é o servidor que decide o que você vê (o time inteiro para gestores, negócio e diretoria; a sua linha e os seus projetos para os demais).<br>
        <button class="btn primario" data-ap-act="config-id" style="margin-top:10px">Identificar-se</button></div></div></div>`));
    return;
  }
  if(!st.dados && !st.carregando && !st.erro){ if(st.sel && !st.ate) st.ate = st.sel; smCarrega(); }   // link com ?semana= abre a janela daquela semana
  const fs = ((st.dados || {}).semanas) || []; const vistas = fs.map(smVista);
  const i = Math.max(0, vistas.findIndex(v => v.semana === st.sel)); const V = vistas[i] || null; const A = vistas[i + 1] || null;
  const podeTudo = st.dados && Array.isArray(st.dados.papeis) && st.dados.papeis.some(p => ['gestor', 'negocio', 'diretoria', 'admin'].includes(p));
  const cfgRel = (cfg && cfg.relSemanal && typeof cfg.relSemanal === 'object') ? cfg.relSemanal : {};   // leitor: não cria o objeto
  const cab = `<div class="card full sm-card"><h2>📊 Relatório semanal <span>de sexta — planejado × orçado × realizado, reuniões, tickets e qualidade, comparável semana a semana</span>${smSeloR()}</h2>
    <div class="muted small">A foto sai toda ${cfgRel.ativo ? `sexta às ${esc(cfgRel.hora || '16:00')}` : 'sexta (envio desligado em ⚙️ Envios automáticos)'} e é a mesma que vai ao canal dos gestores e à mensagem de cada gerente — aqui ela fica <b>comparável</b>: Δ vs a semana anterior, média das últimas 4 e a série das ${SM_N}.
      ${st.dados && !podeTudo ? 'Você está vendo <b>o time, a sua linha e os projetos em que é gerente</b>.' : ''}</div>
    <div class="sm-top" style="margin-top:10px">
      <label class="hdr-sel"><span>Semana</span><select id="sm-semana" ${fs.length ? '' : 'disabled'}>${fs.length ? vistas.map(v => `<option value="${escA(v.semana)}" ${v.semana === st.sel ? 'selected' : ''}>${esc(smISO(v))} · ${esc(smRotSemana(v))}${v.fechada ? ' · 🔒' : ''}</option>`).join('') : '<option>sem foto</option>'}</select></label>
      <div class="sm-acoes">
        <button class="btn" id="sm-ant" data-tip="Janela anterior: as ${SM_N} semanas antes destas" ${fs.length < SM_N ? 'disabled' : ''}>◀ mais antigas</button>
        <button class="btn" id="sm-prox" data-tip="Volta às semanas mais recentes" ${st.ate ? '' : 'disabled'}>mais recentes ▶</button>
        <button class="btn" id="sm-atualizar" data-tip="Relê as fotos do servidor">↻</button>
        <button class="btn" id="sm-copiar" ${V ? '' : 'disabled'} data-tip="Copia um resumo em texto (time, Δ, desvios, pendências por projeto) para colar no Teams ou na ata">📋 Copiar resumo</button>
        ${podeTudo ? '<button class="btn" id="sm-config" data-tip="Dia, hora e o N de dias do \'parado\' — em ⚙️ Central › 📣 Envios automáticos">⚙️ Envio</button>' : ''}
      </div></div></div>`;
  if(st.carregando && !st.dados){ cont.replaceChildren(el(`<div>${cab}<div class="estado">⏳ Lendo as fotos semanais…</div></div>`)); return; }
  if(st.erro && !st.dados){ cont.replaceChildren(el(`<div>${cab}<div class="erro">${esc(st.erro)}</div></div>`)); return; }
  if(!V){
    cont.replaceChildren(el(`<div>${cab}<div class="estado sm-vazio">Ainda não há foto semanal${st.ate ? ` até ${esc(dataBR(st.ate))}` : ''}.
      ${st.ate ? '' : `A primeira sai na sexta às ${esc(cfgRel.hora || '16:00')}${cfgRel.ativo ? '' : ' — depois de ligar o envio em ⚙️ Central › 📣 Envios automáticos › 📊 Relatório semanal'}; a comparação começa na segunda foto.`}</div></div>`));
    return;
  }
  const tr = V.truncado; const cortes = ['atividade', 'abertos', 'worklogs', 'tickets'].filter(k => tr[k]);
  const aviso = cortes.length ? `<div class="aviso">⚠ Nesta foto algum teto foi batido (${esc(cortes.join(', '))}): os números são parciais — o servidor limita as páginas por execução.</div>` : '';
  const meta = `<div class="muted small sm-meta">Foto tirada em <b>${esc(smQuando(V.fotoEm))}</b> · semana ${esc(smRotSemana(V))} · "parado" = ${esc(String(V.parado || 5))} dias sem atualização${V.fechada ? ' · <b>🔒 semana fechada</b> (realizado anotado depois do fim da semana)' : ''}${A ? ` · Δ vs ${esc(smISO(A))} (${esc(smRotSemana(A))})` : ' · sem semana anterior nesta janela'} · ${esc(String((V.time || {}).pessoas || 0))} pessoas · ${esc(String((V.time || {}).pessoasComPlano || 0))} com plano</div>`;
  const kpis = `<div class="sm-kpis sm-hero">${SM_HERO.map(k => smKpiHTML(k, V, A, vistas, i, false)).join('')}</div>
    <div class="sm-kpis sm-minis">${SM_MINI.map(k => smKpiHTML(k, V, A, vistas, i, true)).join('')}</div>`;
  const ia = V.ia ? `<div class="card full sm-card sm-ia-card"><h2>🧠 O que mudou <span>3–5 frases geradas por IA na hora do envio</span></h2><div class="sm-ia">${esc(V.ia)}</div></div>` : '';
  const dv = smDesvios(V);
  const desvios = (dv.pessoas.length || dv.projetos.length) ? `<div class="card full sm-card"><h2>📉 Maiores desvios da semana <span>pessoa: realizado − planejado · projeto: realizado − orçado</span></h2>
    <div class="sm-desvios">${dv.pessoas.map(x => `<span class="sm-dv"><b>${esc(x.nome)}</b> ${esc(smFmtD(x.d, 'h'))} <span class="muted">(${esc(fmtH(x.real))} de ${esc(fmtH(x.base))} planejadas)</span></span>`).join('')}
      ${dv.projetos.map(x => `<span class="sm-dv"><b>${esc(x.k)}</b> ${esc(smFmtD(x.d, 'h'))} <span class="muted">(${esc(fmtH(x.real))} de ${esc(fmtH(x.base))} orçadas)</span></span>`).join('')}</div></div>` : '';
  const pessoas = `<div class="card full sm-card"><h2>👥 Por pessoa <span>cada número com o Δ vs a semana anterior · clique no cabeçalho para ordenar</span></h2>${smTabPessoas(V, A)}</div>`;
  const projetos = `<div class="card full sm-card"><h2>📁 Por projeto <span>planejado · orçado · realizado · pendências · qualidade — 🧭 abre a lista para cobrar, 📁 a ficha</span></h2>${smTabProjetos(V, A)}</div>`;
  cont.replaceChildren(el(`<div>${cab}${aviso}${meta}${kpis}${ia}${desvios}${pessoas}${projetos}
    <div class="card full sm-card"><h2>ℹ️ Como ler</h2><div class="muted small"><b>Planejado</b> = planos enviados/aprovados do 📋 Meu Planejamento · <b>Orçado</b> = horas vendidas da 💹 Rentabilidade (pro rata da semana) · <b>Capacidade</b> = meta/dia × dias úteis − ausências · <b>Realizado</b> = Clockwork.
      <b>Execução</b> = realizado ÷ planejado · <b>Aderência</b> = quanto do realizado era o planejado (pessoa · dia · projeto) · <b>Consumo</b> = realizado ÷ orçado · <b>Qualidade</b> = nota 0–100 (apontamento 40 · tickets abertos 45 · plano 15).
      Criados/concluídos são por data de criação/resolução; vencidos, parados e sem data são os abertos <em>no dia da foto</em>. Reuniões medidas só pelo Jira. Sem valores em R$ aqui — isso fica na 💹 Rentabilidade e na 🏦 Controladoria.</div></div></div>`));
}

// ---- Listeners delegados desta tela (#conteudo) ----
document.getElementById('conteudo').addEventListener('click', (e) => {
  if(estado.vista !== 'semanal') return;
  const t = e.target; if(!t || !t.closest) return; const st = estado.semanal;
  const th = t.closest('[data-sm-sort]');
  if(th){ const col = th.getAttribute('data-sm-sort'); const tab = th.getAttribute('data-sm-tab');
    // clicar de novo inverte; coluna nova começa do maior (nome começa em ordem alfabética)
    if(tab === 'p'){ if(st.ordP === col) st.dirP = -st.dirP; else { st.ordP = col; st.dirP = col === 'nome' ? 1 : -1; } }
    else { if(st.ordJ === col) st.dirJ = -st.dirJ; else { st.ordJ = col; st.dirJ = col === 'nome' ? 1 : -1; } }
    renderSemanal(); return; }
  if(t.closest('#sm-copiar')){ smCopia(); return; }
  if(t.closest('#sm-atualizar')){ st.dados = null; st.erro = ''; smCarrega(); renderSemanal(); return; }
  if(t.closest('#sm-ant')){ const fs = ((st.dados || {}).semanas) || []; const ult = fs[fs.length - 1]; if(!ult) return;
    st.ate = addDiasISO(ult.semana, -7); st.sel = ''; st.dados = null; smCarrega(); renderSemanal(); return; }
  if(t.closest('#sm-prox')){ st.ate = ''; st.sel = ''; st.dados = null; smCarrega(); renderSemanal(); return; }
  if(t.closest('#sm-config')){ vaiPara('config'); return; }
});
document.getElementById('conteudo').addEventListener('change', (e) => {
  if(estado.vista !== 'semanal') return;
  if(e.target && e.target.id === 'sm-semana'){ estado.semanal.sel = e.target.value; renderSemanal(); try{ estadoParaURL(); }catch(x){} }
});
// Segunda-feira N dias antes/depois (AAAA-MM-DD, aritmética em UTC como o resto do painel).
function addDiasISO(s, n){ const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
