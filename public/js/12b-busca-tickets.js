// Jira Insights · 12b · 🎫 BUSCA DE TICKETS — sobreposição rápida (tecla "/", Ctrl+J, botão 🎫 e Ctrl+K).
//
// O pedido (2026-09-15): "poder pesquisar os tickets, com um atalho, escolhendo primeiro o PROJETO e
// depois o ticket dentro dele — pensando em desempenho, entrando só nos que estão ABERTOS".
//
// O desenho é exatamente esse, e a velocidade vem de quatro decisões:
//   1. PROJETO PRIMEIRO, de graça — a lista de projetos já está na memória do app (projNomes() e
//      projetosUnidos(); o catálogo /api/projetos é memoizado por garanteProjetos()). Os últimos
//      projetos usados ficam no localStorage: na maioria das vezes é UM clique.
//   2. SÓ OS ABERTOS, DE UM PROJETO SÓ — GET /api/reunioes?abertos=PROJ devolve chave, resumo, status
//      e tipo dos tickets com statusCategory != Done daquele projeto (cache de 3 min no servidor).
//      É uma busca no Jira, não a base inteira — e nenhum endpoint novo foi preciso (a Vercel já
//      está no limite de 12 funções).
//   3. FILTRO LOCAL — depois que a lista chega, digitar NÃO vai à rede: filtra em memória (sem
//      acento, por chave/resumo/status/tipo) e pinta no máximo TKB_MAX linhas por vez.
//   4. CACHE NO NAVEGADOR (3 min, a mesma janela do servidor) — sair do projeto e voltar não custa
//      nada; o ↻ força a releitura (nocache=1).
//
// E o que fica FORA dos abertos continua ao alcance, sem custo: digitar a CHAVE (RDF-123) abre a
// ficha de qualquer ticket (aberto ou concluído); o que o painel já carregou no período aparece numa
// seção à parte; e quem já abriu o 📈 Analytics ganha a opção "🌐 todos os projetos", que lê os
// abertos que já estão em memória (estado.analytics.dados) — outra vez sem ida à rede.
//
// A ficha e as ações por ticket são as que já existem (abreModalTicket/abreModalApontarGx, em
// 20-gestao.js): a busca só resolve o "achar", que era o passo que faltava.

const TKB_TTL = 180000;                 // 3 min de cache no navegador (a mesma janela do servidor)
const TKB_MAX = 60;                     // linhas pintadas por vez (o resto pede refino da busca)
const TKB_MEM_MAX = 8;                  // linhas da seção "fora dos abertos"
const TKB_REC_KEY = 'jirainsight_tkb_rec_v1';
const TKB_REC_N = 6;                    // projetos recentes guardados
const RE_TKB_CHAVE = /^([A-Z][A-Z0-9_]*-\d+)$/;
const _tkbCache = {};                   // PROJ -> { quando, tickets:[{k,resumo,status,tipo,p}], truncado }
let _tkb = null;                        // { proj, q, sel, carregando, erro } enquanto a busca está aberta
let _tkbProjPedidos = false;            // o catálogo de projetos já foi pedido nesta sessão?

// ---- Projetos recentes (só neste navegador) ----
function tkbRecentes(){
  try{ const a=JSON.parse(localStorage.getItem(TKB_REC_KEY)||'[]');
    return Array.isArray(a)?a.filter(x=>typeof x==='string').slice(0,TKB_REC_N):[]; }catch(e){ return []; }
}
function tkbLembra(p){
  if(!p) return;
  const l=[p].concat(tkbRecentes().filter(x=>x!==p)).slice(0,TKB_REC_N);
  try{ localStorage.setItem(TKB_REC_KEY, JSON.stringify(l)); }catch(e){}
}

// ---- Fontes de dados (todas sem rede, exceto tkbBusca) ----
// Projetos: o catálogo do Jira (quando já veio) unido ao que o período carregou.
// Arquivados (convenção da casa: "ARQ" no nome ou na categoria) não somem — vão para o FIM, em cinza,
// como a paleta faz com as áreas fora do seu perfil: eles ainda têm tickets abertos (ver 📈 Métricas › ARQ).
const RE_TKB_ARQ=/(^|[^A-Za-z])ARQ([^A-Za-z]|$)/;
function tkbProjetos(){
  const cat=(typeof projetosUnidos==='function')?projetosUnidos():{};
  const nomes=(typeof projNomes==='function')?projNomes():{};
  const m={};
  const poe=(k)=>{ if(!k||k==='—'||m[k]) return;
    const nome=nomes[k]||k, c=(cat[k]&&cat[k].categoria)||'';
    m[k]={ k, nome, cat:c, arq:(k==='ARQ'||RE_TKB_ARQ.test(nome)||RE_TKB_ARQ.test(c)) }; };
  Object.keys(nomes).forEach(poe); Object.keys(cat).forEach(poe);
  return Object.values(m).sort((a,b)=>(a.arq?1:0)-(b.arq?1:0)||a.nome.localeCompare(b.nome,'pt'));
}
// Pede o catálogo UMA vez por sessão (memoizado em 13-apontar.js e cacheado 30 min no servidor).
function tkbGaranteProjetos(){
  if(_tkbProjPedidos||typeof garanteProjetos!=='function') return;
  _tkbProjPedidos=true;
  try{ garanteProjetos().then(()=>{ if(_tkb) tkbPinta(); }).catch(()=>{}); }catch(e){}
}
// 🌐 Todos os projetos: só quando o Analytics JÁ está em memória (nada é buscado por causa da busca).
function tkbGlobais(){
  const d=(estado.analytics&&estado.analytics.dados)||null;
  if(!d||!Array.isArray(d.abertos)) return null;
  return d.abertos.map(t=>({ k:t.k, resumo:t.resumo||'', status:t.status||'', tipo:t.t||'', p:t.p||'' }));
}
// 🕘 O que o painel já tem do período (inclui CONCLUÍDOS) — memoizado pelo período + tamanho das listas
// (só o tamanho não bastava: trocar de período pode devolver listas do mesmo tamanho).
let _tkbMem=null, _tkbMemSel='';
function tkbMemoria(){
  const wl=((estado.tempo&&estado.tempo.worklogs)||[]), ev=((estado.atividade&&estado.atividade.eventos)||[]);
  const sel=(estado.periodo||'')+'|'+wl.length+'|'+ev.length;
  if(_tkbMem&&_tkbMemSel===sel) return _tkbMem;
  const res=(typeof resumosUnidos==='function')?resumosUnidos():{}; const m={};
  wl.forEach(w=>{ if(w.k&&!m[w.k]) m[w.k]={ k:w.k, resumo:res[w.k]||'', status:'', tipo:w.t||'', p:w.p||'' }; });
  ev.forEach(x=>{ if(x.k&&!m[x.k]) m[x.k]={ k:x.k, resumo:res[x.k]||'', status:'', tipo:x.t||'', p:x.p||'' }; });
  _tkbMem=Object.values(m); _tkbMemSel=sel;
  return _tkbMem;
}

// Erro em português: "Failed to fetch"/"Unexpected token '<'" não dizem nada a quem está buscando
// um ticket. O texto do servidor (quando vem) é mantido, porque esse já é nosso.
function tkbErro(e){
  const m=String((e&&e.message)||e||'');
  if(/failed to fetch|networkerror|load failed/i.test(m)) return 'Sem resposta do servidor — verifique a conexão e tente o ↻.';
  if(/unexpected token|json/i.test(m)) return 'O servidor respondeu algo inesperado. Tente o ↻ em alguns segundos.';
  return m||'Não consegui buscar os tickets abertos deste projeto.';
}

// ---- A única ida à rede: os tickets ABERTOS de um projeto ----
function tkbCacheVivo(p){ const c=_tkbCache[p]; return !!(c && (Date.now()-c.quando)<TKB_TTL); }
function tkbTickets(){
  if(!_tkb) return [];
  if(_tkb.proj==='*') return tkbGlobais()||[];
  const c=_tkbCache[_tkb.proj];
  return (c&&c.tickets)||[];
}
function tkbBusca(p, forca){
  if(!p||p==='*') return;
  if(!forca && tkbCacheVivo(p)){ tkbPinta(); return; }
  if(_tkb){ _tkb.carregando=true; _tkb.erro=''; tkbPinta(); }
  fetch(`/api/reunioes?abertos=${encodeURIComponent(p)}${forca?'&nocache=1':''}`)
    .then(r=>r.json()).then(j=>{
      if(j&&j.erro) throw new Error(j.erro);
      _tkbCache[p]={ quando:Date.now(), truncado:!!(j&&j.truncado),
        tickets:((j&&j.tickets)||[]).map(t=>({ k:t.k, resumo:t.resumo||'', status:t.status||'', tipo:t.tipo||'', p })) };
      if(_tkb&&_tkb.proj===p){ _tkb.carregando=false; tkbPinta(); }
    })
    .catch(e=>{ if(_tkb&&_tkb.proj===p){ _tkb.carregando=false; _tkb.erro=tkbErro(e); tkbPinta(); } });
}

// Dados de um ticket que a busca já tem em memória (usado pela ficha e pelo ⏱ apontar,
// para o modal abrir com resumo e projeto mesmo sem passar pela Gestão).
function tkbInfo(k){
  const chave=String(k||'').toUpperCase();
  const nos=Object.keys(_tkbCache).map(p=>(_tkbCache[p].tickets||[]).find(x=>x.k===chave)).find(Boolean);
  return nos||(tkbGlobais()||[]).find(x=>x.k===chave)||null;
}

// ---- Filtro e ordenação (em memória) ----
function tkbChave(s){ const m=String(s||'').trim().toUpperCase().match(RE_TKB_CHAVE); return m?m[1]:''; }
// O "palheiro" de cada ticket é calculado UMA vez e guardado no próprio objeto (_h): digitar
// vira comparação de strings, sem remontar nada — importa no 🌐, onde a lista tem centenas de itens.
// O nome do projeto entra no palheiro e é refeito se o catálogo chegar depois (_hp).
function tkbPalha(x, nomes){
  const nm=(nomes&&x.p&&nomes[x.p])||'';
  if(x._h!==undefined&&x._hp===nm) return x._h;
  x._hp=nm; x._h=normPal(`${x.k} ${x.resumo} ${x.status} ${x.tipo} ${x.p||''} ${nm}`);
  return x._h;
}
// Chave exata primeiro, depois quem começa pela busca, depois o resto — sem mexer na ordem base
// (a API devolve por "atualizado há menos tempo", que é o melhor padrão com a busca vazia).
function tkbOrdena(arr, t){
  if(!t) return arr;
  const nota=(x)=>{ const k=normPal(x.k); if(k===t) return 0; if(k.startsWith(t)) return 1;
    if(normPal(x.resumo).startsWith(t)) return 2; if(k.includes(t)) return 3; return 4; };
  return arr.map((x,i)=>({x,i,n:nota(x)})).sort((a,b)=>(a.n-b.n)||(a.i-b.i)).map(o=>o.x);
}
function tkbFiltra(arr, t, nomes){ return t?arr.filter(x=>tkbPalha(x,nomes).includes(t)):arr; }

// ---- Desenho ----
// Idade da lista NESTE navegador (o servidor ainda guarda a dele por até 3 min — por isso "lida há",
// e não "atualizada há": o ↻ é que garante a leitura nova no Jira).
function tkbIdade(p){
  const c=_tkbCache[p]; if(!c) return '';
  const s=Math.round((Date.now()-c.quando)/1000);
  if(s<15) return 'lida agora mesmo';
  if(s<90) return `lida há ${s}s`;
  return `lida há ${Math.round(s/60)} min`;
}
function tkbLinhaTicket(x, comProj){
  const url=`${jiraBase()}/browse/${encodeURIComponent(x.k)}`;
  const dir=[x.status, x.tipo, comProj&&x.p?projNome(x.p):''].filter(Boolean).join(' · ');
  return `<div class="tkb-l">
    <button class="pal-row" data-tkb-ir="${escA(x.k)}" title="${escA(x.resumo||x.k)}">
      <span class="tkb-k">${esc(x.k)}</span><span class="tkb-res">${x.resumo?esc(x.resumo):'<span class="muted">(sem resumo)</span>'}</span>
      <span class="pal-g">${esc(dir)}</span></button>
    <button class="pal-fav" data-tkb-ap="${escA(x.k)}" data-tip="Apontar horas neste ticket"
      aria-label="Apontar horas em ${escA(x.k)}">⏱</button>
    <a class="pal-fav" href="${url}" target="_blank" rel="noopener" data-tip="Abrir no Jira"
      aria-label="Abrir ${escA(x.k)} no Jira">↗</a>
  </div>`;
}
function tkbLinhaProjeto(p){
  return `<div class="tkb-l"><button class="pal-row${p.arq?' pal-dim':''}" data-tkb-p="${escA(p.k)}" title="${escA(p.nome)}">
    <span class="tkb-k">${esc(p.k)}</span><span class="tkb-res">${esc(p.nome)}</span>
    <span class="pal-g">${p.arq?'arquivado':esc(p.cat||'')}</span></button></div>`;
}
function tkbTitulo(t){ return `<div class="pal-area">${esc(t)}</div>`; }

function tkbPinta(){
  if(!_tkb) return;
  const cab=document.getElementById('tkb-cab'), lista=document.getElementById('tkb-lista'), rod=document.getElementById('tkb-rod');
  if(!cab||!lista||!rod) return;
  const t=normPal(_tkb.q), chave=tkbChave(_tkb.q);
  const glob=tkbGlobais();
  const nomes=(typeof projNomes==='function')?projNomes():{};   // uma vez por pintura, não por ticket
  const linhaChave=(k)=>`<div class="tkb-l"><button class="pal-row" data-tkb-ir="${escA(k)}">
    🎫 Abrir a ficha de <span class="tkb-k">${esc(k)}</span><span class="pal-g">aberto ou concluído</span></button></div>`;

  if(!_tkb.proj){
    // ── Passo 1: o projeto (tudo em memória) ────────────────────────────────
    cab.innerHTML='';
    const projs=tkbProjetos();
    const casa=(p)=>!t||normPal(`${p.k} ${p.nome} ${p.cat}`).includes(t);
    const recs=tkbRecentes().map(k=>projs.find(p=>p.k===k)||{k,nome:k,cat:''}).filter(casa);
    const resto=projs.filter(p=>casa(p)&&!recs.some(r=>r.k===p.k));
    const cortados=Math.max(0,resto.length-TKB_MAX);
    lista.innerHTML=(chave?linhaChave(chave):'')
      +(recs.length?tkbTitulo('⏱ Projetos recentes')+recs.map(tkbLinhaProjeto).join(''):'')
      +((glob&&(!t||normPal('todos os projetos global sem escolher projeto').includes(t)))
          ?tkbTitulo('🌐 Sem escolher projeto')+`<div class="tkb-l"><button class="pal-row" data-tkb-p="*">
          <span class="tkb-k">🌐</span><span class="tkb-res">Todos os projetos — os ${glob.length} abertos que o Analytics já carregou</span>
          <span class="pal-g">em memória</span></button></div>`:'')
      +(resto.length?tkbTitulo(`📁 Projetos${t?` · ${resto.length}`:''}`)+resto.slice(0,TKB_MAX).map(tkbLinhaProjeto).join(''):'')
      +((!chave&&!recs.length&&!resto.length)?'<div class="muted small" style="padding:8px">Nenhum projeto com esse nome. Digite a chave do ticket (ex.: RDF-123) para abrir direto.</div>':'')
      +(cortados?`<div class="muted small" style="padding:6px 10px">… e mais ${cortados} projeto(s) — refine a busca.</div>`:'');
    rod.innerHTML='A busca entra <b>só nos tickets abertos</b> do projeto escolhido — é o que a deixa rápida. '
      +'Para qualquer ticket, aberto ou concluído, digite a <b>chave</b> (ex.: RDF-123).';
  } else {
    // ── Passo 2: os tickets abertos do projeto ──────────────────────────────
    const global=_tkb.proj==='*';
    const nome=global?'Todos os projetos':`${projNome(_tkb.proj)}`;
    const base=tkbTickets();
    cab.innerHTML=`<div class="tkb-cab">
      <button class="btn tkb-b" data-tkb-projetos="1" data-tip="Escolher outro projeto">← Projetos</button>
      <strong>${global?'🌐':'📁'} ${esc(nome)}</strong>${global?'':`<span class="muted small">${esc(_tkb.proj)}</span>`}
      <span class="tkb-n">${_tkb.carregando?'carregando…':`${base.length} aberto(s)`}</span>
      ${global?'<span class="muted small">do 📈 Analytics, em memória</span>'
             :`<span class="muted small">${esc(tkbIdade(_tkb.proj))}</span><button class="pal-fav" data-tkb-rec="1" data-tip="Reler do Jira agora">↻</button>`}
    </div>`;
    const achados=tkbOrdena(tkbFiltra(base,t,nomes),t);
    const cortados=Math.max(0,achados.length-TKB_MAX);
    const vistos=new Set(achados.map(x=>x.k));
    // 🕘 Fora dos abertos: o que o painel já carregou do período (pode estar concluído).
    const extra=(t.length>=2?tkbFiltra(tkbMemoria().filter(x=>!vistos.has(x.k)&&(global||x.p===_tkb.proj)),t,nomes):[]).slice(0,TKB_MEM_MAX);
    lista.innerHTML=(chave&&!vistos.has(chave)?linhaChave(chave):'')
      +(_tkb.erro?`<div class="erro" style="margin:8px 0">${esc(_tkb.erro)}</div>`:'')
      +(_tkb.carregando&&!base.length?'<div class="estado">Buscando os tickets abertos do projeto…</div>':'')
      +(achados.length?achados.slice(0,TKB_MAX).map(x=>tkbLinhaTicket(x,global)).join(''):'')
      +(cortados?`<div class="muted small" style="padding:6px 10px">… e mais ${cortados} — refine a busca.</div>`:'')
      +((!achados.length&&!_tkb.carregando&&!_tkb.erro)
          ?`<div class="muted small" style="padding:8px">${_tkb.q
              ?`Nenhum ticket <b>aberto</b> com "${esc(_tkb.q)}"${global?'':` em ${esc(nome)}`}. Se ele já foi concluído, digite a <b>chave</b> (ex.: ${esc(String(_tkb.proj==='*'?'RDF':_tkb.proj))}-123).`
              :`${global?'O Analytics não trouxe nenhum ticket aberto.':`<b>${esc(nome)}</b> não tem nenhum ticket aberto.`} Para um ticket já concluído, digite a <b>chave</b>.`}</div>`:'')
      +(extra.length?tkbTitulo('🕘 Fora dos abertos — do período carregado no painel')+extra.map(x=>tkbLinhaTicket(x,true)).join(''):'');
    rod.innerHTML=(_tkbCache[_tkb.proj]&&_tkbCache[_tkb.proj].truncado)
      ? '⚠ O projeto tem mais abertos do que cabe numa busca (300): estes são os <b>mais recentes</b> — refine ou digite a chave.'
      : 'Digitar filtra <b>em memória</b> (nada vai à rede). ↑ ↓ escolhem · Enter abre a ficha · ⏱ aponta horas · ↗ abre no Jira.';
  }
  tkbRealce();
}
// Realce da linha escolhida. Andar com ↑ ↓ só troca a classe — repintar a lista inteira
// a cada seta jogaria fora o HTML de dezenas de linhas por nada.
function tkbRealce(){
  const lista=document.getElementById('tkb-lista'); if(!lista||!_tkb) return null;
  const alvos=lista.querySelectorAll('[data-tkb-ir],[data-tkb-p]');
  if(!alvos.length){ _tkb.sel=0; return null; }
  _tkb.sel=Math.max(0,Math.min(_tkb.sel,alvos.length-1));
  alvos.forEach((b,i)=>{ b.classList.toggle('pal-on', i===_tkb.sel); });
  return alvos[_tkb.sel];
}

// ---- Abertura, navegação e teclado ----
function abreBuscaTickets(proj){
  _tkb={ proj:String(proj||''), q:'', sel:0, carregando:false, erro:'' };
  abreModal(`<h2 class="tkb-h">🎫 Buscar ticket <span class="muted small">projeto → ticket, só os abertos</span></h2>
    <div class="muted small">Atalho: a tecla <b>/</b> (ou <b>Ctrl+J</b>) em qualquer tela.</div>
    <input class="pal-q" id="tkb-q" type="text" autocomplete="off" spellcheck="false"
      placeholder="projeto, ou a chave do ticket (ex.: RDF-123)…" aria-label="Buscar projeto ou ticket">
    <div id="tkb-cab"></div>
    <div id="tkb-lista" class="tkb-lista" role="group" aria-label="Resultados da busca"></div>
    <div class="muted small tkb-rod" id="tkb-rod"></div>`);
  const q=document.getElementById('tkb-q');
  if(q){
    q.addEventListener('input',()=>{ _tkb.q=q.value; _tkb.sel=0; tkbPinta(); });
    q.addEventListener('keydown',tkbTecla);
  }
  tkbGaranteProjetos();
  if(_tkb.proj) tkbVaiProjeto(_tkb.proj); else tkbPinta();
  setTimeout(()=>{ const i=document.getElementById('tkb-q'); if(i) i.focus(); },50);
}
function tkbVaiProjeto(p){
  if(!_tkb) return;
  // `carregando` precisa zerar aqui: a resposta da busca anterior só mexe no estado se ainda
  // for o projeto dela, então sem isto o cabeçalho ficaria preso em "carregando…".
  _tkb.proj=String(p||''); _tkb.q=''; _tkb.sel=0; _tkb.erro=''; _tkb.carregando=false;
  const q=document.getElementById('tkb-q');
  if(q){ q.value=''; q.placeholder=_tkb.proj?'filtrar por chave, resumo, status ou tipo…':'projeto, ou a chave do ticket (ex.: RDF-123)…'; q.focus(); }
  if(_tkb.proj&&_tkb.proj!=='*') tkbLembra(_tkb.proj);
  tkbPinta();
  if(_tkb.proj&&_tkb.proj!=='*'&&!tkbCacheVivo(_tkb.proj)) tkbBusca(_tkb.proj,false);
}
function tkbAbreFicha(k){
  const volta=_tkb?_tkb.proj:null;
  if(typeof abreModalTicket==='function') abreModalTicket(k, volta);
  else window.open(`${jiraBase()}/browse/${encodeURIComponent(k)}`,'_blank','noopener');
}
function tkbTecla(e){
  if(!_tkb) return;
  const lista=document.getElementById('tkb-lista'); if(!lista) return;
  const alvos=lista.querySelectorAll('[data-tkb-ir],[data-tkb-p]');
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault(); if(!alvos.length) return;
    _tkb.sel=Math.max(0,Math.min(alvos.length-1,_tkb.sel+(e.key==='ArrowDown'?1:-1)));
    const n=tkbRealce();
    if(n&&n.scrollIntoView) n.scrollIntoView({ block:'nearest' });
    return;
  }
  if(e.key==='Enter'){ e.preventDefault(); const b=alvos[_tkb.sel]||alvos[0]; if(b) b.click(); return; }
  // Backspace com a busca vazia volta para a escolha do projeto (como nos seletores em cascata).
  if(e.key==='Backspace'&&!_tkb.q&&_tkb.proj){ e.preventDefault(); tkbVaiProjeto(''); }
}

// ---- Cliques (delegados) ----
document.addEventListener('click',(e)=>{
  const t=e.target; if(!t||!t.closest) return;
  // 🎫 na barra (computador) e em ⋯ Mais (o caminho do celular, onde a barra vira gaveta)
  if(t.closest('#btn-tkb')||t.closest('#btn-mais-tkb')){
    // no celular a barra é uma gaveta: fecha tudo antes, senão a busca abre com o menu atrás
    if(typeof fechaMenusHdr==='function') try{ fechaMenusHdr(); }catch(e){}
    if(typeof fechaMenusNav==='function') try{ fechaMenusNav(); }catch(e){}
    if(typeof fechaDrawer==='function') try{ fechaDrawer(); }catch(e){}
    abreBuscaTickets(); return;
  }
  const p=t.closest('[data-tkb-p]'); if(p){ tkbVaiProjeto(p.getAttribute('data-tkb-p')); return; }
  if(t.closest('[data-tkb-projetos]')){ tkbVaiProjeto(''); return; }
  if(t.closest('[data-tkb-rec]')){ if(_tkb&&_tkb.proj&&_tkb.proj!=='*') tkbBusca(_tkb.proj,true); return; }
  const ir=t.closest('[data-tkb-ir]'); if(ir){ tkbAbreFicha(ir.getAttribute('data-tkb-ir')); return; }
  const ap=t.closest('[data-tkb-ap]');
  if(ap){ e.preventDefault(); if(typeof abreModalApontarGx==='function') abreModalApontarGx(ap.getAttribute('data-tkb-ap')); return; }
  // ↩ Voltar à busca (botão da ficha do ticket, quando ela foi aberta por aqui)
  const vol=t.closest('[data-tkb-volta]'); if(vol){ abreBuscaTickets(vol.getAttribute('data-tkb-volta')||''); return; }
  // Entradas vindas da paleta Ctrl+K
  const ab=t.closest('[data-tkb-abrir]'); if(ab){ fechaModal(); _tkb=null; tkbAbreFicha(ab.getAttribute('data-tkb-abrir')); return; }
  if(t.closest('[data-tkb-buscar]')){ fechaModal(); abreBuscaTickets(); }
});

// ---- Atalhos: "/" fora de campos (irmã do "?" da ajuda, e o padrão de busca da web) e Ctrl+J ----
// Os dois respeitam um modal ABERTO: a busca não pode atropelar um formulário em preenchimento
// (apontar horas, criar ticket, contrato…). Se o modal já é a própria busca, só devolve o foco.
function tkbPodeAbrir(){
  const m=document.getElementById('modal');
  if(!m||m.hidden) return true;                       // nada aberto — abre (o corpo do modal fechado
  const i=document.getElementById('tkb-q');           // ainda tem o HTML da última busca, por isso a
  if(i){ i.focus(); return false; }                   // checagem do `hidden` vem ANTES)
  return false;                                       // outro modal aberto: não atropela
}
document.addEventListener('keydown',(e)=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&(e.key==='j'||e.key==='J')){
    e.preventDefault(); if(tkbPodeAbrir()) abreBuscaTickets(); return;
  }
  if(e.key!=='/') return;
  if(e.ctrlKey||e.metaKey||e.altKey) return;
  const a=document.activeElement, tag=a?(a.tagName||'').toLowerCase():'';
  if(tag==='input'||tag==='textarea'||tag==='select'||(a&&a.isContentEditable)) return;
  if(!tkbPodeAbrir()) return;
  e.preventDefault(); abreBuscaTickets();
});
