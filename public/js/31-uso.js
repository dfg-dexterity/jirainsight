// Jira Insights · 31 · 📊 USO DO PAINEL — quem abre qual tela, quantas vezes e por quanto tempo.
//
// O pedido (2026-09-19): "algo como o Google Analytics para o site — entender como o meu time está
// usando, que funcionalidades cada um acessa, por quanto tempo".
//
// O que o painel tinha antes disto: o Vercel Web Analytics (pageviews ANÔNIMOS e agregados — e como o
// app é uma página só que troca de tela pelo `?v=`, o que chegava lá era "abriram o app") e o
// 🗒 Histórico de ações (só o que ESCREVE: apontar, comentar, reprogramar…). Nenhum dos dois responde
// "quem abriu qual tela e por quanto tempo".
//
// COMO A CONTA É FEITA (e por que ela é honesta)
//  · O relógio anda de USO_TICK em USO_TICK e só conta quando a aba está VISÍVEL e houve interação nos
//    últimos USO_OCIOSO — senão "tempo na tela" viraria "aba esquecida aberta", que é o erro clássico.
//  · Cada troca de tela conta uma ABERTURA; o tempo fica na tela que estava à frente.
//  · O acumulado mora no localStorage (sobrevive ao F5) e sobe em LOTES já somados por (dia, tela) —
//    nunca evento a evento. Ao fechar a aba, vai de sendBeacon.
//  · Só id de TELA e duração viajam. Nenhum conteúdo — ticket, texto, filtro — entra nisto.
//  · Sem identidade (ninguém se identificou no ⏱ Apontar), não se envia nada.
//
// QUEM VÊ O QUÊ: gestor, negócio, diretoria e admin veem o time todo; quem não tem papel vê só os
// próprios números. É lente de adoção — para decidir o que evoluir e o que aposentar —, não vigilância.

const USO_TICK = 15000;        // granularidade do relógio (15s)
const USO_OCIOSO = 300000;     // 5 min sem interação = a pessoa saiu de perto
const USO_FLUSH = 600000;      // sobe o acumulado a cada 10 min
const USO_LOTE = 200;          // linhas por envio (o servidor corta no mesmo número)
const USO_BUF_KEY = 'jirainsight_uso_buf_v1';
// `ultimo` começa AGORA: sem isso a primeira batida do relógio (15s depois de abrir o app) já
// dispararia um envio, porque `agora - 0` é sempre maior que USO_FLUSH.
const _uso = { atual: '', ativo: Date.now(), ultimo: Date.now() };

// ---- Acumulado local: { 'AAAA-MM-DD|vista': {n, s} } ----
function usoBuf(){
  try{ const o = JSON.parse(localStorage.getItem(USO_BUF_KEY) || '{}'); return (o && typeof o === 'object') ? o : {}; }
  catch(e){ return {}; }
}
function usoSalvaBuf(b){ try{ localStorage.setItem(USO_BUF_KEY, JSON.stringify(b)); }catch(e){} }
function usoDisp(){ return (window.innerWidth || 1024) < 760 ? 'cel' : 'pc'; }
function usoSoma(v, seg, n){
  if(!v) return;
  const b = usoBuf(); const k = `${hojeSP()}|${v}`;
  const at = b[k] || { n: 0, s: 0 };
  at.n += (n || 0); at.s += (seg || 0);
  b[k] = at; usoSalvaBuf(b);
}
// Chamada pelo render() a cada desenho: só reage quando a TELA muda de verdade.
function usoTela(v){
  if(!v || v === _uso.atual) return;
  _uso.atual = v;
  usoSoma(v, 0, 1);
}
// Envia o acumulado. `beacon` = a aba está indo embora (sem resposta para conferir).
function usoEnvia(beacon){
  const id = (typeof idApontar === 'function') ? idApontar() : null;
  if(!id || !id.accountId) return;                       // sem identidade, nada sobe
  const b = usoBuf(); const chaves = Object.keys(b).slice(0, USO_LOTE);
  if(!chaves.length) return;
  const linhas = chaves.map(k => { const [d, v] = k.split('|'); return { d, v, n: b[k].n, s: Math.round(b[k].s) }; })
    .filter(x => x.d && x.v && (x.n > 0 || x.s > 0));
  if(!linhas.length) return;
  const corpo = JSON.stringify({ a: id.accountId, nome: id.nome || '', disp: usoDisp(), linhas });
  // Tira do acumulado ANTES de mandar (para não contar duas vezes) e devolve se o envio falhar.
  const enviados = {}; chaves.forEach(k => { enviados[k] = b[k]; delete b[k]; });
  usoSalvaBuf(b); _uso.ultimo = Date.now();
  const url = '/api/config?uso=1';
  if(beacon && navigator.sendBeacon){
    try{ navigator.sendBeacon(url, new Blob([corpo], { type: 'application/json' })); }catch(e){ usoDevolve(enviados); }
    return;
  }
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, keepalive: true })
    .then(r => r.json()).then(j => { if(!j || !j.ok) usoDevolve(enviados); })
    .catch(() => usoDevolve(enviados));
}
function usoDevolve(enviados){
  const b = usoBuf();
  Object.keys(enviados || {}).forEach(k => {
    const at = b[k] || { n: 0, s: 0 };
    at.n += enviados[k].n; at.s += enviados[k].s; b[k] = at;
  });
  usoSalvaBuf(b);
}

// ---- Leitura (a tela) ----
function usoPeriodo(){
  const st = estado.uso; const dias = Math.max(1, Math.min(120, Number(st.dias) || 30));
  const ate = hojeSP(); const d = new Date(`${ate}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (dias - 1));
  return { de: d.toISOString().slice(0, 10), ate };
}
function usoCarrega(){
  const st = estado.uso; const { de, ate } = usoPeriodo();
  st.carregando = true; st.erro = '';
  fetch(`/api/config?uso=1&de=${de}&ate=${ate}`).then(r => r.json()).then(j => {
    st.carregando = false;
    if(!j || j.ok === false) st.erro = (j && j.erro) || 'Não consegui ler o uso do painel.';
    else st.dados = j;
    if(estado.vista === 'uso') renderUso();
  }).catch(e => {
    st.carregando = false; st.erro = `Sem resposta do servidor (${String((e && e.message) || e)}).`;
    if(estado.vista === 'uso') renderUso();
  });
}
// Quem enxerga o time todo. Sem papel: só o próprio uso (a tela continua abrindo para todos).
function usoPodeTudo(){
  try{ return temPapel('gestor') || temPapel('negocio') || temPapel('diretoria') || temPapel('admin') || souAprovador(); }
  catch(e){ return false; }
}
function usoRot(v){
  const c = (typeof NAVCAT !== 'undefined') ? NAVCAT.find(x => x[0] === v) : null;
  return c ? c[1] : v;
}
function usoArea(v){
  const c = (typeof NAVCAT !== 'undefined') ? NAVCAT.find(x => x[0] === v) : null;
  const a = c && c[2];
  return (typeof AREAS !== 'undefined' && AREAS[a] && AREAS[a].rot) || '';
}
function usoDur(seg){
  const s = Math.max(0, Math.round(Number(seg) || 0));
  if(s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if(m < 60) return `${m}min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h ${r}min` : `${h}h`;
}

// Tudo o que a tela mostra sai daqui: um passe pelas linhas do período.
function usoCalc(){
  const st = estado.uso; const d = st.dados || { linhas: [], pessoas: {} };
  const eu = ((typeof idApontar === 'function' && idApontar()) || {}).accountId || '';
  const tudo = usoPodeTudo();
  const linhas = (d.linhas || []).filter(x => tudo || x.a === eu);
  const porTela = {}, porPessoa = {}, porDia = {}, porDisp = { pc: 0, cel: 0 };
  let seg = 0, n = 0;
  linhas.forEach(x => {
    seg += x.seg; n += x.n;
    const t = porTela[x.v] || (porTela[x.v] = { v: x.v, seg: 0, n: 0, quem: new Set() });
    t.seg += x.seg; t.n += x.n; t.quem.add(x.a);
    const p = porPessoa[x.a] || (porPessoa[x.a] = { a: x.a, nome: (d.pessoas || {})[x.a] || x.a, seg: 0, n: 0, telas: {} });
    p.seg += x.seg; p.n += x.n; p.telas[x.v] = (p.telas[x.v] || 0) + x.seg;
    const dia = porDia[x.dia] || (porDia[x.dia] = { dia: x.dia, seg: 0, n: 0, quem: new Set() });
    dia.seg += x.seg; dia.n += x.n; dia.quem.add(x.a);
    porDisp[x.disp === 'cel' ? 'cel' : 'pc'] += x.seg;
  });
  const telas = Object.values(porTela).map(t => ({ ...t, pessoas: t.quem.size }))
    .sort((a, b) => b.seg - a.seg || b.n - a.n);
  const pessoas = Object.values(porPessoa).map(p => {
    const top = Object.keys(p.telas).sort((a, b) => p.telas[b] - p.telas[a])[0] || '';
    return { ...p, nTelas: Object.keys(p.telas).length, top };
  }).sort((a, b) => b.seg - a.seg);
  const dias = Object.values(porDia).sort((a, b) => a.dia.localeCompare(b.dia))
    .map(x => ({ ...x, pessoas: x.quem.size }));
  // 🕸 O que ninguém abriu: telas do catálogo (sem as ações) fora da lista usada.
  const usadas = new Set(telas.map(t => t.v));
  const semUso = ((typeof NAVCAT !== 'undefined') ? NAVCAT : [])
    .filter(c => !String(c[0]).startsWith('acao:') && !usadas.has(c[0])).map(c => c[0]);
  return { linhas, telas, pessoas, dias, porDisp, seg, n, semUso, tudo, eu };
}

function renderUso(){
  const cont = document.getElementById('conteudo');
  const st = estado.uso = estado.uso || { dias: 30, dados: null, carregando: false, erro: '', pessoa: '' };
  if(!st.dados && !st.carregando && !st.erro) usoCarrega();
  const { de, ate } = usoPeriodo();
  const cab = `<div class="card full uso-card"><h2>📊 Uso do painel <span>quem abre qual tela, quantas vezes e por quanto tempo</span></h2>
    <div class="muted small">O relógio conta <b>só com a aba à frente</b> e para depois de 5 minutos sem interação — "tempo na tela" aqui é tempo de uso, não aba esquecida aberta.
      Guardamos <b>id de tela e duração</b>: nenhum ticket, texto ou filtro. ${st.dados && !usoPodeTudo() ? 'Você está vendo <b>o seu próprio uso</b>.' : ''}</div>
    <div class="ap-filtros" style="margin-top:10px">
      <label class="hdr-sel"><span>Período</span>
        <select id="uso-dias">${[7, 14, 30, 60, 90].map(x => `<option value="${x}" ${Number(st.dias) === x ? 'selected' : ''}>últimos ${x} dias</option>`).join('')}</select></label>
      <button class="btn" id="uso-atualizar">↻ Atualizar</button>
      <span class="muted small">${esc(dataBR(de))} → ${esc(dataBR(ate))}</span>
    </div></div>`;

  if(st.carregando && !st.dados){ cont.replaceChildren(el(`<div>${cab}<div class="estado">⏳ Lendo o uso do painel…</div></div>`)); return; }
  if(st.erro && !st.dados){ cont.replaceChildren(el(`<div>${cab}<div class="erro">${esc(st.erro)}</div></div>`)); return; }

  const C = usoCalc();
  if(!C.linhas.length){
    cont.replaceChildren(el(`<div>${cab}<div class="estado">Nenhum uso registrado neste período.
      A contagem começa quando esta versão entra no ar — ela não reconstrói o passado.</div></div>`));
    const s0 = document.getElementById('uso-dias'); if(s0) s0.value = String(st.dias);
    return;
  }

  const maxT = C.telas[0] ? C.telas[0].seg : 1;
  const barra = (seg) => `<span class="uso-bar"><i style="width:${Math.max(2, Math.round((seg / (maxT || 1)) * 100))}%"></i></span>`;
  const kpis = `<div class="kpis">
    <div class="kpi a"><div class="v">${C.pessoas.length}</div><div class="l">${C.tudo ? 'Pessoas no período' : 'Você'}</div></div>
    <div class="kpi t"><div class="v">${usoDur(C.seg)}</div><div class="l">Tempo de uso</div></div>
    <div class="kpi a"><div class="v">${C.n.toLocaleString('pt-BR')}</div><div class="l">Aberturas de tela</div></div>
    <div class="kpi a"><div class="v">${C.telas.length}</div><div class="l">Telas usadas</div></div>
  </div>`;

  const spark = (typeof sparkline === 'function' && C.dias.length > 1)
    ? sparkline(C.dias.map(x => Math.round(x.seg / 60)), 360, 46, 'var(--marca,#009994)') : '';
  const evol = `<div class="card"><h2>📈 Por dia <span>minutos de uso${C.tudo ? ' · pessoas ativas' : ''}</span></h2>
    ${spark}
    <div class="scroll-x uso-dias"><table class="mp-tab-mini"><thead><tr><th>Dia</th><th class="num">Tempo</th><th class="num">Aberturas</th>${C.tudo ? '<th class="num">Pessoas</th>' : ''}</tr></thead>
      <tbody>${C.dias.slice(-14).reverse().map(x => `<tr><td>${esc(dataBR(x.dia))}</td><td class="num">${usoDur(x.seg)}</td><td class="num">${x.n}</td>${C.tudo ? `<td class="num">${x.pessoas}</td>` : ''}</tr>`).join('')}</tbody></table></div></div>`;

  const disp = `<div class="card"><h2>💻 Onde usam <span>tempo por aparelho</span></h2>
    <div class="uso-disp"><div><b>💻 Computador</b><div class="uso-bar uso-bar-g"><i style="width:${Math.round((C.porDisp.pc / (C.seg || 1)) * 100)}%"></i></div><span class="muted small">${usoDur(C.porDisp.pc)}</span></div>
      <div><b>📱 Celular</b><div class="uso-bar uso-bar-g"><i style="width:${Math.round((C.porDisp.cel / (C.seg || 1)) * 100)}%"></i></div><span class="muted small">${usoDur(C.porDisp.cel)}</span></div></div></div>`;

  const ranking = `<div class="card full uso-card"><h2>🏆 Telas mais usadas <span>por tempo — a abertura conta o clique, o tempo conta o proveito</span></h2>
    <div class="scroll-x"><table class="mp-tab-mini uso-tab"><thead><tr><th>Tela</th><th>Área</th><th class="num">Tempo</th><th class="num">%</th><th class="num">Aberturas</th>${C.tudo ? '<th class="num">Pessoas</th>' : ''}<th></th></tr></thead>
      <tbody>${C.telas.map(t => `<tr><td><b>${esc(usoRot(t.v))}</b></td><td class="muted small">${esc(usoArea(t.v))}</td>
        <td class="num">${usoDur(t.seg)}</td><td class="num">${Math.round((t.seg / (C.seg || 1)) * 100)}%</td>
        <td class="num">${t.n}</td>${C.tudo ? `<td class="num">${t.pessoas}</td>` : ''}<td class="uso-bar-td">${barra(t.seg)}</td></tr>`).join('')}</tbody></table></div></div>`;

  const pessoas = C.tudo ? `<div class="card full uso-card"><h2>👥 Por pessoa <span>quanto tempo, quantas telas e qual a tela dela — clique para abrir o detalhe</span></h2>
    <div class="scroll-x"><table class="mp-tab-mini uso-tab"><thead><tr><th>Pessoa</th><th class="num">Tempo</th><th class="num">Aberturas</th><th class="num">Telas</th><th>Tela preferida</th></tr></thead>
      <tbody>${C.pessoas.map(p => `<tr class="${st.pessoa === p.a ? 'rm-destaque' : ''}"><td><span class="lnk" data-uso-pessoa="${escA(p.a)}">${esc(p.nome)}</span></td>
        <td class="num">${usoDur(p.seg)}</td><td class="num">${p.n}</td><td class="num">${p.nTelas}</td>
        <td class="muted small">${esc(usoRot(p.top))}</td></tr>`).join('')}</tbody></table></div>
    ${st.pessoa ? usoDetalhePessoa(C, st.pessoa) : ''}</div>` : '';

  const semUso = C.semUso.length ? `<div class="card full uso-card"><h2>🕸 Ninguém abriu neste período <span>${C.semUso.length} tela(s) — candidatas a sumir do menu</span></h2>
    <div class="muted small">Antes de aposentar: confira se a tela é sazonal (fechamento do mês, apuração) e se quem precisa dela tem o papel para enxergá-la.</div>
    <div class="uso-chips">${C.semUso.map(v => `<span class="rc-cod" data-uso-ir="${escA(v)}" data-tip="Abrir ${escA(usoRot(v))}">${esc(usoRot(v))}</span>`).join('')}</div></div>` : '';

  cont.replaceChildren(el(`<div>${cab}${kpis}<div class="grid uso-mini">${evol}${disp}</div>${ranking}${pessoas}${semUso}
    <div class="card full uso-card"><h2>🔒 O que fica guardado</h2>
      <div class="muted small">Cada pessoa vê o próprio uso; o consolidado do time é de gestores e diretoria. Guardamos <b>quem · qual tela · quantas aberturas · quantos segundos · que dia · celular ou computador</b> — e nada mais.
      O histórico é podado depois de 180 dias. O número é <b>declarado pelo navegador</b>: serve para entender adoção, não como auditoria.</div></div></div>`));
  const s = document.getElementById('uso-dias'); if(s) s.value = String(st.dias);
}
function usoDetalhePessoa(C, a){
  const p = C.pessoas.find(x => x.a === a); if(!p) return '';
  const linhas = Object.keys(p.telas).sort((x, y) => p.telas[y] - p.telas[x])
    .map(v => `<tr><td>${esc(usoRot(v))}</td><td class="num">${usoDur(p.telas[v])}</td><td class="num">${Math.round((p.telas[v] / (p.seg || 1)) * 100)}%</td></tr>`).join('');
  return `<div class="mt-sec"><h3>👤 ${esc(p.nome)} <span class="muted small">${usoDur(p.seg)} em ${p.nTelas} tela(s)</span></h3>
    <div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Tela</th><th class="num">Tempo</th><th class="num">%</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <div style="margin-top:8px"><button class="btn rt-step" data-uso-pessoa="">Fechar</button></div></div>`;
}

// ---- Listeners da tela ----
document.getElementById('conteudo').addEventListener('click', (e) => {
  if(estado.vista !== 'uso') return;
  const t = e.target; if(!t || !t.closest) return;
  const p = t.closest('[data-uso-pessoa]');
  if(p){ const a = p.getAttribute('data-uso-pessoa'); estado.uso.pessoa = (estado.uso.pessoa === a) ? '' : a; renderUso(); return; }
  const ir = t.closest('[data-uso-ir]'); if(ir){ vaiPara(ir.getAttribute('data-uso-ir')); return; }
  if(t.id === 'uso-atualizar'){ estado.uso.dados = null; usoCarrega(); renderUso(); }
});
document.getElementById('conteudo').addEventListener('change', (e) => {
  if(estado.vista !== 'uso') return;
  if(e.target && e.target.id === 'uso-dias'){
    estado.uso.dias = Math.max(1, Math.min(120, Number(e.target.value) || 30));
    estado.uso.dados = null; usoCarrega(); renderUso();
  }
});

// ---- O relógio ----
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
  document.addEventListener(ev, () => { _uso.ativo = Date.now(); }, { passive: true }));
document.addEventListener('visibilitychange', () => {
  if(document.hidden) usoEnvia(true); else _uso.ativo = Date.now();
});
window.addEventListener('pagehide', () => usoEnvia(true));
// Uma batida do relógio: devolve true quando contou. É aqui que moram as duas regras que
// separam "tempo de uso" de "aba esquecida aberta" — aba visível e interação recente.
function usoPulso(){
  if(!_uso.atual || document.hidden) return false;
  if(Date.now() - _uso.ativo > USO_OCIOSO) return false;
  usoSoma(_uso.atual, USO_TICK / 1000, 0);
  if(Date.now() - _uso.ultimo > USO_FLUSH) usoEnvia(false);
  return true;
}
setInterval(usoPulso, USO_TICK);
