// Jira Insights · 30 · 🎛️ EVENTOS DELEGADOS (#conteudo/#modal-body/document, por tela), 📱 PWA, 🌙 tema,
// 🌀 marca animada e a INICIALIZAÇÃO (leURL → carregaCfgRemota → recarrega). Este arquivo carrega por ÚLTIMO.
document.getElementById('btn-pdf').addEventListener('click', exportarPDF);
{ const bm=document.getElementById('btn-metas'); if(bm) bm.addEventListener('click', abreMetas); }
document.getElementById('btn-ajuda').addEventListener('click', abreAjuda);
// 🧭 Guia interativo da tela: botão flutuante, item do menu ⋯ Mais e a tecla "?".
document.getElementById('btn-guia').addEventListener('click', ()=>iniciaGuia(estado.vista));
document.getElementById('btn-guia-tela').addEventListener('click', ()=>{ fechaMenusNav(); iniciaGuia(estado.vista); });
document.addEventListener('keydown',(e)=>{
  if(e.key!=='?'||e.ctrlKey||e.metaKey||e.altKey) return;
  const a=document.activeElement, tag=a?(a.tagName||'').toLowerCase():'';
  if(tag==='input'||tag==='textarea'||tag==='select'||(a&&a.isContentEditable)) return;
  if(!document.getElementById('modal').hidden) return;
  e.preventDefault(); iniciaGuia(estado.vista);
});
setTimeout(()=>{ try{ atualizaBotaoGuia(); }catch(e){} },0);

// ── 📱 Versão iPhone/iPad (PWA) ──────────────────────────────────────────────
// O app é instalável pela Tela de Início: em pé de app nativo (tela cheia, ícone
// da Dexterity), sem App Store. O modal abaixo guia a instalação por plataforma.
let _bipEvento=null;   // beforeinstallprompt (Chrome/Edge/Android)
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); _bipEvento=e; });
function pwaEhIOS(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1); // iPadOS se apresenta como Mac
}
function pwaInstalado(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone===true;
}
function abreInstalar(){
  const passoIOS=(n,txt)=>`<div class="nov-item"><span class="nov-data">${n}.</span><span class="nov-txt">${txt}</span></div>`;
  let corpo='';
  if(pwaInstalado()){
    corpo=`<p>✅ <b>Você já está no app instalado</b> — tela cheia, com o ícone da Dexterity na Tela de Início. Nada a fazer aqui.</p>`;
  } else if(pwaEhIOS()){
    corpo=`<p>No <b>iPhone</b> ou <b>iPad</b>, a instalação é feita pelo <b>Safari</b> (2 toques):</p>
      <div class="nov-lista" style="margin-top:8px">
        ${passoIOS(1,'Abra <b>este endereço no Safari</b> (no Chrome do iOS o botão não aparece).')}
        ${passoIOS(2,'Toque em <b>Compartilhar</b> <svg width="16" height="18" viewBox="0 0 16 19" style="vertical-align:-3px" aria-hidden="true"><g fill="none" stroke="var(--cerceta)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5 H2 V17 H14 V7.5 H13"/><path d="M8 1.5 V11.5"/><path d="M4.8 4.6 L8 1.4 L11.2 4.6"/></g></svg> — no iPhone fica embaixo, no iPad no topo, ao lado da barra de endereço.')}
        ${passoIOS(3,'Role e toque em <b>“Adicionar à Tela de Início”</b> e confirme em <b>Adicionar</b>.')}
      </div>
      <p class="muted small" style="margin-top:10px">O ícone <b>Insights</b> aparece na Tela de Início e o painel abre em <b>tela cheia</b>, sem a barra do navegador — com o mesmo login por token de sempre.</p>`;
  } else if(_bipEvento){
    corpo=`<p>Seu navegador permite instalar o painel como aplicativo (janela própria, ícone no sistema):</p>
      <p style="margin-top:10px"><button class="btn primario" id="btn-instalar-agora">📲 Instalar agora</button></p>`;
  } else {
    corpo=`<p>Neste navegador a instalação fica no menu do próprio navegador (ex.: <b>⋮ → Instalar aplicativo</b> no Chrome/Edge).</p>
      <p class="muted small" style="margin-top:8px">No <b>iPhone/iPad</b>: abra este endereço no <b>Safari</b> → <b>Compartilhar</b> → <b>Adicionar à Tela de Início</b>.</p>`;
  }
  abreModal(`<h2>📱 Instalar no aparelho</h2>
    <div class="muted small">O painel vira um aplicativo no seu iPhone, iPad ou computador — sem loja, sem download.</div>
    <div style="margin-top:12px">${corpo}</div>`);
  const b=document.getElementById('btn-instalar-agora');
  if(b) b.addEventListener('click', async ()=>{
    if(!_bipEvento) return;
    _bipEvento.prompt();
    try{ await _bipEvento.userChoice; }catch(e){}
    _bipEvento=null; fechaModal();
  });
}
document.getElementById('btn-instalar').addEventListener('click', abreInstalar);
// Service worker: só registra em produção (https); rede-primeiro, nunca toca /api/.
if('serviceWorker' in navigator && location.protocol==='https:'){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('/sw.js').catch(()=>{}); });
}
{ const bl=document.getElementById('btn-log'); if(bl) bl.addEventListener('click', abreLogAcoes); }
document.getElementById('btn-novidades').addEventListener('click', abreNovidades);
// Modo claro/escuro (persistido em localStorage; o tema já foi aplicado cedo no <head>).
function aplicaTema(t){
  if(t==='dark') document.documentElement.setAttribute('data-theme','dark');
  else document.documentElement.removeAttribute('data-theme');
  const b=document.getElementById('btn-tema');
  if(b){ b.textContent = t==='dark' ? '☀️' : '🌙'; b.title = t==='dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'; }
}
(function(){ let t='light'; try{ t=localStorage.getItem('jirainsight_theme')==='dark'?'dark':'light'; }catch(e){} aplicaTema(t); })();
document.getElementById('btn-tema').addEventListener('click', ()=>{
  const dark = document.documentElement.getAttribute('data-theme')!=='dark';
  try{ localStorage.setItem('jirainsight_theme', dark?'dark':'light'); }catch(e){}
  aplicaTema(dark?'dark':'light');
  // Recolore os gráficos (as cores das séries são fixadas no HTML na renderização).
  // Evita re-render em abas com formulário para não descartar o que a pessoa digitou.
  if(!['apontar','planejar','reclassificar','reuvinc','gestao','admin'].includes(estado.vista)) try{ render(); }catch(e){}
});
// Logo no canto superior esquerdo volta para o início (Resumo).
document.getElementById('brand-home').addEventListener('click', ()=>{ dxLogoEntra(); vaiPara('acoes'); });
document.getElementById('brand-home').addEventListener('keydown', (e)=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); dxLogoEntra(); vaiPara('acoes'); } });

// ===========================================================================
// 🌀 MARCA DEXTERITY ANIMADA (cabeçalho) — a logo com movimento, com função:
//   1) ENTRADA "pivô": ao abrir o painel (e ao clicar na marca) cada pétala
//      gira no próprio canto interno, como uma íris abrindo;
//   2) "CICLO" enquanto o painel busca dados: a luz percorre as pétalas
//      enquanto houver chamada a /api/ no ar — o cabeçalho vira o indicador de
//      atividade, sem spinner extra na tela;
//   3) "ÍMÃ": passando o ponteiro sobre a marca, as pétalas acompanham de leve
//      e voltam ao lugar — vida no cabeçalho sem laço rodando o tempo todo.
// Quem pede menos movimento no sistema (prefers-reduced-motion) não recebe
// nenhuma das três — o CSS zera tudo e o ímã nem é ligado.
// ===========================================================================
const dxCalmo = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let _dxEntraT=null;
function dxLogoEntra(){
  const l=document.getElementById('dx-logo'); if(!l||dxCalmo) return;
  l.classList.remove('dx-entra'); void l.offsetWidth; l.classList.add('dx-entra');
  clearTimeout(_dxEntraT); _dxEntraT=setTimeout(()=>l.classList.remove('dx-entra'), 1400);
}
(function(){
  const l=document.getElementById('dx-logo'); if(!l) return;
  _dxEntraT=setTimeout(()=>l.classList.remove('dx-entra'), 1400);
  if(dxCalmo){ l.classList.remove('dx-entra'); return; }

  // --- ciclo enquanto carrega: conta as chamadas a /api/ no ar ---
  const pts=[...l.querySelectorAll('.dxp')];
  let noAr=0, liga=null;
  const limpaIma=()=>pts.forEach(p=>{ p.style.transform=''; });
  const pinta=()=>{
    if(noAr>0){ if(!liga) liga=setTimeout(()=>{ limpaIma(); l.classList.add('carregando'); }, 180); }
    else { clearTimeout(liga); liga=null; l.classList.remove('carregando'); }
  };
  const fetchOrig=window.fetch.bind(window);
  window.fetch=function(...args){
    let doPainel=false;
    try{ const u=String((args[0]&&args[0].url)||args[0]||''); doPainel=u.includes('/api/'); }catch(e){}
    if(!doPainel) return fetchOrig(...args);
    noAr+=1; pinta();
    return fetchOrig(...args).finally(()=>{ noAr=Math.max(0,noAr-1); pinta(); });
  };

  // --- ímã: as pétalas acompanham o ponteiro (só em telas com ponteiro fino) ---
  if(!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches)) return;
  const C={tl:[256.7,54.85],tr:[360.1,55.2],bl:[256.7,138.1],br:[360.1,138.3]};
  const quem=(el)=>(([...el.classList].find(c=>c.startsWith('dxp--'))||'').slice(5));
  const brand=document.getElementById('brand-home');
  brand.addEventListener('pointermove',(ev)=>{
    if(l.classList.contains('dx-entra')||l.classList.contains('carregando')) return;
    const r=l.getBoundingClientRect(); if(!r.width) return;
    const x=206.8+((ev.clientX-r.left)/r.width)*195.4;
    const y=-1.15+((ev.clientY-r.top)/r.height)*195.4;
    pts.forEach(p=>{
      const c=C[quem(p)]; if(!c) return;
      const dx=x-c[0], dy=y-c[1], d=Math.hypot(dx,dy)||1, puxa=Math.min(13,520/d);
      p.style.transform=`translate(${(dx/d*puxa).toFixed(2)}px,${(dy/d*puxa).toFixed(2)}px)`;
    });
  });
  brand.addEventListener('pointerleave',limpaIma);
  brand.addEventListener('pointercancel',limpaIma);
})();
// Botão "voltar ao topo": aparece após rolar a página.
(function(){ const b=document.getElementById('to-top'); if(!b) return;
  const upd=()=>{ b.hidden=(window.scrollY||document.documentElement.scrollTop)<400; };
  window.addEventListener('scroll', upd, { passive:true }); upd();
  b.addEventListener('click', ()=>window.scrollTo({ top:0, behavior:'smooth' })); })();
marcaNovidade();
// Navegação do tour guiado (botões ficam soltos no body).
document.addEventListener('click', (e)=>{
  const t=e.target.closest && e.target.closest('button'); if(!t) return;
  if(t.id==='tour-next'){ _tourI+=1; mostraTour(); }   // o fim (incluindo o do 🧭 guia) é tratado no mostraTour
  else if(t.id==='tour-prev'){ _tourI=Math.max(0,_tourI-1); mostraTour(); }
  else if(t.id==='tour-fim'){ fimTour(); _tourHome=false; _tourGuia=''; }
});

// ---- Tela Reclassificar: cliques, seleção e busca ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const t=e.target.closest('button'); if(!t) return;
  const rc=estado.reclass;
  if(t.id==='rc-retry'){ rc.erro=''; rc.dados=null; renderReclass(); }
  else if(t.id==='rc-refresh'){ rc.dados=null; carregaReunioes(true); }
  else if(t.id==='rc-mover'){ confirmaMover(); }
  else if(t.id==='rc-confirma-adm'){ confirmaReuniaoAdm(); }
  else if(t.id==='rc-verificar'){ verificaMover(); }
  else if(t.id==='rc-voltar'){ rc.resultado=null; rc.taskId=''; rc.dados=null; renderReclass(); }
  else if(t.id==='ia-gerar'){ geraAnaliseIA(); }
  else if(t.hasAttribute('data-folga')){ escondeTip();
    abreFolga(t.getAttribute('data-folga-a'), t.getAttribute('data-folga-email'),
      t.getAttribute('data-folga-nome'), t.getAttribute('data-folga-extra'), t.getAttribute('data-folga-sem')); }
});
document.getElementById('modal-body').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.id==='gx-com-confirmar'){ gxComentaLote(); }
  else if(t.id==='gx-st-confirmar'){ gxStatusLote(); }
  else if(t.id==='cv-enviar'){ cvEnviar(); }
  else if(t.id==='qk-prev-conf'){ qkConfirma(); }
  else if(t.hasAttribute&&t.hasAttribute('data-qk-t')){ const i=document.getElementById('qk-p-tempo');
    if(i) i.value=t.getAttribute('data-qk-t'); }
  else if(t.hasAttribute&&t.hasAttribute('data-qk-menc-rm')){ const a=t.getAttribute('data-qk-menc-rm');
    _qkMenc=_qkMenc.filter(m=>m.id!==a); qkAtualizaMenc(); }
  else if(t.id==='gx-del-confirmar'){ gxExcluiLote(); }
  else if(t.id==='gx-dup-selall'){ const g=estado.gestao;
    gxGruposDuplicados().forEach(a=>a.forEach(x=>{ g.sel[x.k]=true; }));
    fechaModal(); renderGestao(); toast('Duplicados selecionados — use as ações em massa para tratar.','ok'); }
  else if(t.hasAttribute&&t.hasAttribute('data-gx-dup-sel')){ const g=estado.gestao;
    t.getAttribute('data-gx-dup-sel').split(',').forEach(k=>{ if(k) g.sel[k]=true; });
    fechaModal(); renderGestao(); toast('Grupo selecionado — use as ações em massa para tratar.','ok'); }
  else if(t.hasAttribute&&t.hasAttribute('data-gx-ep-apl')){ gxAplicaEpico(t.getAttribute('data-gx-ep-apl')); }
  else if(t.id==='gx-ap-confirmar'){ gxApontaConfirma(); }
  else if(t.id==='gx-ap-cancelar'){ _gxApont=null; fechaModal(); }
  else if(t.hasAttribute&&t.hasAttribute('data-gx-apont')){ abreModalApontarGx(t.getAttribute('data-gx-apont')); }
  else if(t.hasAttribute&&t.hasAttribute('data-gx-st')){ abreModalStatusLote([t.getAttribute('data-gx-st')]); }
  else if(t.hasAttribute&&t.hasAttribute('data-gx-det')){ abreModalTicket(t.getAttribute('data-gx-det')); }
  else if(t.id==='gxf-salvar'){ gxfSalva(); }
  else if(t.hasAttribute&&t.hasAttribute('data-gxf-apl')){ const f=gxfLista().find(x=>x.id===t.getAttribute('data-gxf-apl'));
    fechaModal(); if(f){ gxfAplica(f); toast(`⭐ Filtro "${f.nome}" aplicado.`,'ok'); } }
  else if(t.hasAttribute&&t.hasAttribute('data-gxf-link')){ const f=gxfLista().find(x=>x.id===t.getAttribute('data-gxf-link')); if(f) gxfCopiaLink(f); }
  else if(t.hasAttribute&&t.hasAttribute('data-gxf-del')){ const id=t.getAttribute('data-gxf-del'); const f=gxfLista().find(x=>x.id===id);
    cfg.gxFiltros=gxfLista().filter(x=>x.id!==id); salvaCfg(); toast(f?`Filtro "${esc(f.nome)}" excluído (para o time).`:'Filtro excluído.','ok'); abreModalFiltrosGerir(); }
  else if(t.hasAttribute&&t.hasAttribute('data-gx-det-com')){ abreModalComentarLote([t.getAttribute('data-gx-det-com')]); }
  else if(t.hasAttribute&&t.hasAttribute('data-gx-trf')){ abreTransformar(t.getAttribute('data-gx-trf')); }
  else if(t.hasAttribute&&t.hasAttribute('data-gx-conv')){ abreConvidarApontar(t.getAttribute('data-gx-conv')); }
  else if(t.id==='trf-analisar'){
    const o=((document.getElementById('trf-origem')||{}).value||'').trim().toUpperCase();
    const d=((document.getElementById('trf-destino')||{}).value||'').trim().toUpperCase();
    if(!_trf) return;
    if(!RE_ISSUE_TRF.test(o)||!RE_ISSUE_TRF.test(d)){ _trf.erro='Informe os dois chamados (ex.: RDF-123 e CCDV-500).'; trfRenderPasso1(); return; }
    if(o===d){ _trf.erro='Origem e destino são o mesmo chamado.'; trfRenderPasso1(); return; }
    _trf.origem=o; _trf.destino=d; _trf.fo=null; _trf.fd=null; _trf.erro='';
    trfCarregaFicha('origem');
  }
  else if(t.id==='trf-executar'){ trfExecuta(); }
  else if(t.id==='trf-voltar'){ if(_trf){ _trf.fd=null; _trf.erro=''; trfRenderPasso1(); } }
  else if(t.id==='trf-nova'){ abreTransformar(''); }
  else if(t.hasAttribute&&t.hasAttribute('data-ct-gestao')){ const ks=t.getAttribute('data-ct-gestao').split(',').filter(Boolean);
    fechaModal(); const g=estado.gestao; g.soKeys=ks; g.origem='🏦 Controladoria'; g.preset=''; g.busca=''; g.fProj=''; g.fResp=''; g.fStatus=''; g.semTrat=false;
    g.sel={}; ks.forEach(k=>{ g.sel[k]=true; }); vaiPara('gestao'); }
  else if(t.hasAttribute&&t.hasAttribute('data-ct-rateio')){ const ks=t.getAttribute('data-ct-rateio').split(',').filter(Boolean);
    fechaModal(); const rt=estado.rateio; rt.texto=ks.join('\n'); rt.resultados=null; vaiPara('rateio'); rtConfere(); }
  else if(t.id==='gx-com-cancelar'||t.id==='gx-st-cancelar'||t.id==='gx-del-cancelar'||t.id==='gx-fechar'){ _gxCom=null; _gxSt=null; _gxDel=null; _trf=null; fechaModal(); }
});
document.getElementById('modal-body').addEventListener('input',(e)=>{
  const t=e.target; if(!t) return;
  if(t.id==='gx-del-conf'){ const b=document.getElementById('gx-del-confirmar');
    if(b) b.disabled = t.value.trim().toUpperCase()!=='EXCLUIR'; }
});
document.getElementById('modal-body').addEventListener('change',(e)=>{
  const t=e.target; if(!t||!t.hasAttribute) return;
  if(t.hasAttribute('data-gx-ep-sel')){ if(_gxEp) _gxEp.sel[t.getAttribute('data-gx-ep-sel')]=t.value; return; }
  // 🎫 prévia da criação rápida: escolher quem marcar (@) no comentário
  if(t.id==='qk-p-menc-add'){
    const a=t.value; if(!a){ return; }
    const p=_qkPessoas.find(x=>x.id===a);
    if(p&&!_qkMenc.some(m=>m.id===a)) _qkMenc.push({id:p.id,nome:p.nome});
    qkAtualizaMenc();
  }
});
// ---- Planejar: salvar template (modal) ----
document.getElementById('modal-body').addEventListener('click', (e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.id==='pl-tpl-conf'){ confirmaSalvarTemplatePl(); }
  else if(t.id==='pl-tpl-cancel'){ fechaModal(); }
  else if(t.id==='gtinfo-fechar'){ fechaModal(); }
  else if(t.hasAttribute('data-gtinfo-filtrar')){ estado.alocacao.fProj=t.getAttribute('data-gtinfo-filtrar');
    fechaModal(); if(estado.vista==='alocacao') renderAlocacao(); }
  else if(t.id==='ts-exp-cancel'){ fechaModal(); }
  else if(t.id==='ts-exp-ok'){ const m=(document.getElementById('ts-exp-modo')||{value:'matriz'}).value;
    exportaTimesheet(m); fechaModal(); toast('⬇ CSV exportado.','ok'); }
});

// Modal: pré-visualização do importador de CSV/Excel ao colar/digitar.
document.getElementById('modal-body').addEventListener('input', (e)=>{
  if(e.target && e.target.id==='pl-csv') atualizaPreviewCSV();
  else if(e.target && e.target.id==='alx-outro') alxAtualizaComent();
});
document.getElementById('modal-body').addEventListener('change', (e)=>{
  if(e.target && e.target.id==='gx-com-tpl'){ const t=GX_TPLS.find(x=>x[0]===e.target.value);
    const ta=document.getElementById('gx-com-texto'); if(ta&&t) ta.value=t[2]; return; }
  if(e.target && e.target.id==='pl-csv-head'){ e.target.setAttribute('data-touched','1'); atualizaPreviewCSV(); }
  else if(e.target && e.target.id==='folga-modo'){ folgaToggle(); }
  else if(e.target && e.target.id==='alx-motivo'){ alxAtualizaComent(); }
  else if(e.target && e.target.id==='alx-data'){ const v=e.target.value;
    if(_alxReprog && /^\d{4}-\d{2}-\d{2}$/.test(v)){ _alxReprog.nova=v; alxAtualizaComent(); } }
  else if(e.target && e.target.id==='alx-atrib-pessoa'){ alxAtribAtualizaComent(); }
  else if(e.target && e.target.id==='mt-teams-hora'){ const v=e.target.value;
    if(/^\d{2}:\d{2}$/.test(v)){ cfg.teamsHora=v; salvaCfg();
      toast(`🕑 Ranking no Teams agendado para as ${v} (dias úteis).`,'ok'); } }
});

// Modal: fechar
document.getElementById('modal-x').addEventListener('click', fechaModal);
document.getElementById('modal').addEventListener('click', (e)=>{ if(e.target.id==='modal') fechaModal(); });
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ fimTour(); fechaModal(); } });

document.addEventListener('keydown', (e)=>{
  if(!(e.ctrlKey||e.metaKey) || (e.key||'').toLowerCase()!=='c') return;
  const t=document.activeElement;
  if(!t||t.tagName!=='INPUT'||t.type!=='date'||!t.value) return;
  const txt=dataBR(t.value);
  const avisa=()=>{ try{ toast('📋 Data copiada: '+txt+' — Ctrl+V em outro campo de data'); }catch(_){} };
  try{ navigator.clipboard.writeText(txt).then(avisa,()=>{}); }
  catch(_){ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta);
    ta.select(); try{ if(document.execCommand('copy')) avisa(); }catch(__){} ta.remove(); }
});

// Drill-down e clique em pessoa (vale em qualquer visão E dentro dos modais,
// permitindo navegação encadeada: projeto → pessoa → projeto…).
document.addEventListener('click', (e)=>{
  const gt=e.target.closest && e.target.closest('[data-goto]');
  if(gt){ escondeTip(); vaiPara(gt.getAttribute('data-goto')); return; }
  const tf=e.target.closest && e.target.closest('#ts-forcar');
  if(tf){ escondeTip(); tf.disabled=true; tf.textContent='⟳ importando…';
    delete estado.cache[estado.periodo];
    recarrega(true).then(ok=>{ if(ok) toast('✓ Dados importados agora do Clockwork/Jira.','ok'); });
    return; }
  const dr=e.target.closest && e.target.closest('[data-drill]');
  if(dr){ escondeTip(); drill(dr.getAttribute('data-drill'), dr.getAttribute('data-key')); return; }
  const tsc=e.target.closest && e.target.closest('[data-ts-cell]');
  if(tsc){ escondeTip(); const v=tsc.getAttribute('data-ts-cell'); const i=v.indexOf('|');
    drillTimesheet(v.slice(0,i), v.slice(i+1)); return; }
  const pz=e.target.closest && e.target.closest('[data-pessoa]');
  if(pz){ escondeTip(); abrePessoa(pz.getAttribute('data-pessoa')); }
});
// Agrupamento da visão Tickets (o select é re-renderizado a cada render).
document.getElementById('conteudo').addEventListener('change', (e)=>{
  if(e.target && e.target.id==='tk-group'){ estado.tkGroup=e.target.value; render(); estadoParaURL(); }
  if(e.target && e.target.id==='ap-ate'){ const v=e.target.value;
    if(/^\d{4}-\d{2}-\d{2}$/.test(v)){ estado.apontar.ate=v; renderApontar(); estadoParaURL(); } }
  if(e.target && e.target.id==='ap-meus'){ estado.apontar.soMeus=e.target.checked; renderApontar(); estadoParaURL(); }
  if(e.target && e.target.id==='ap-semvenc'){ estado.apontar.semVenc=e.target.checked;
    if(!e.target.checked && estado.apontar.fil==='semvenc') estado.apontar.fil='todos'; renderApontar(); estadoParaURL(); }
  if(e.target && e.target.id==='ap-cat'){ estado.apontar.cat=e.target.value; estado.apontar.proj=''; renderApontar(); estadoParaURL(); }
  if(e.target && e.target.id==='ap-proj'){ estado.apontar.proj=e.target.value; renderApontar(); estadoParaURL(); }
  if(e.target && e.target.classList && e.target.classList.contains('ap-mover-sel')){
    const area=e.target.closest('.ap-mover-panel'); if(area) preencheTiposDestino(area); }
});

// Re-render de busca SEM matar a composição de acentos (teclas mortas: ´ + a):
// enquanto o navegador compõe o caractere, só guarda o valor; o re-render (que
// substituiria o input e abortaria a composição) sai num debounce curto depois.
let _buscaT=null;
function buscaComposta(e, grava, rerender, idInput){
  grava(e.target.value);
  if(e.isComposing) return;
  clearTimeout(_buscaT);
  _buscaT=setTimeout(()=>{ rerender();
    const nb=document.getElementById(idInput);
    if(nb){ nb.focus(); nb.setSelectionRange(nb.value.length,nb.value.length); } },140);
}

document.getElementById('modal-body').addEventListener('click', (e)=>{
  const t=e.target; if(t.tagName!=='BUTTON') return;
  const num=(id)=>Math.max(0, Number(document.getElementById(id).value)||0);
  const val=(id)=>document.getElementById(id).value;
  if(t.id==='mt-save-global'){ cfg.metaGlobalH=num('mt-global'); salvaCfg(); render(); abreMetas(); }
  else if(t.id==='mt-add-meta'){ const a=val('mt-meta-pessoa'); if(a){ cfg.metasPessoa[a]=num('mt-meta-h'); salvaCfg(); render(); abreMetas(); } }
  else if(t.hasAttribute('data-del-meta')){ delete cfg.metasPessoa[t.getAttribute('data-del-meta')]; salvaCfg(); render(); abreMetas(); }
  else if(t.id==='mt-add-aus'){ const a=val('mt-aus-pessoa'), de=val('mt-aus-de'), ate=val('mt-aus-ate');
    if(a&&de&&ate){ cfg.ausencias.push({a, de, ate:(ate<de?de:ate)}); salvaCfg(); render(); abreMetas(); } }
  else if(t.hasAttribute('data-del-aus')){ cfg.ausencias.splice(Number(t.getAttribute('data-del-aus')),1); salvaCfg(); render(); abreMetas(); }
  else if(t.id==='mt-add-vig'){ const a=val('mt-vig-pessoa'), ini=val('mt-vig-ini'), fim=val('mt-vig-fim');
    if(a&&(ini||fim)){
      if(ini&&fim&&fim<ini){ toast('O desligamento não pode vir antes da admissão.','warn'); return; }
      cfg.vigencias=cfg.vigencias||{}; cfg.vigencias[a]={ini:ini||'', fim:fim||''};
      salvaCfg(); invalidaCacheDados(); recarrega(); abreMetas(); }
    else toast('Escolha a pessoa e informe pelo menos uma das datas.','warn'); }
  else if(t.hasAttribute('data-del-vig')){ delete (cfg.vigencias||{})[t.getAttribute('data-del-vig')];
    salvaCfg(); invalidaCacheDados(); recarrega(); abreMetas(); }
  else if(t.id==='mt-add-oculto'){ const a=val('mt-oc-pessoa');
    if(a){ const nome=(pessoasUnidas()[a]&&pessoasUnidas()[a].nome)||a; cfg.ocultos=cfg.ocultos||[];
      if(!cfg.ocultos.some(o=>o.a===a)) cfg.ocultos.push({a,nome});
      salvaCfg(); invalidaCacheDados(); recarrega(); abreMetas(); } }
  else if(t.hasAttribute('data-del-oculto')){ cfg.ocultos.splice(Number(t.getAttribute('data-del-oculto')),1);
    salvaCfg(); invalidaCacheDados(); recarrega(); abreMetas(); }
  else if(t.id==='mt-add-fer'){ const de=val('mt-fer-data'), nm=(val('mt-fer-nome')||'').trim();
    if(de){ cfg.feriadosExtra=cfg.feriadosExtra||{}; cfg.feriadosExtra[de]=nm||'Feriado';
      cfg.feriadosRemovidos=(cfg.feriadosRemovidos||[]).filter(x=>x!==de); salvaCfg(); render(); abreMetas(); } }
  else if(t.hasAttribute('data-del-fer')){ const iso=t.getAttribute('data-del-fer'); cfg.feriadosExtra=cfg.feriadosExtra||{};
    if(cfg.feriadosExtra[iso]!=null){ delete cfg.feriadosExtra[iso]; }
    else { cfg.feriadosRemovidos=cfg.feriadosRemovidos||[]; if(!cfg.feriadosRemovidos.includes(iso)) cfg.feriadosRemovidos.push(iso); }
    salvaCfg(); render(); abreMetas(); }
  else if(t.hasAttribute('data-restore-fer')){ const iso=t.getAttribute('data-restore-fer');
    cfg.feriadosRemovidos=(cfg.feriadosRemovidos||[]).filter(x=>x!==iso); salvaCfg(); render(); abreMetas(); }
  else if(t.id==='ap-id-validar'){ validaIdentidade(); }
  else if(t.id==='ap-id-sair'){ limpaIdApontar(); estado.apontar.convites=null; pintaBadgeConvites(0); fechaModal(); if(estado.vista==='apontar') renderApontar(); }
  else if(t.id==='rg-enviar'){ enviaReuniaoGrupo(); }
  else if(t.hasAttribute('data-rg-chip')){ const i=document.getElementById('rg-tempo'); if(i) i.value=t.getAttribute('data-rg-chip'); }
  else if(t.id==='rg-todos'){ document.querySelectorAll('#rg-pessoas input[data-rg-p]').forEach(c=>{ c.checked=true; }); }
  else if(t.id==='rg-nenhum'){ document.querySelectorAll('#rg-pessoas input[data-rg-p]').forEach(c=>{ c.checked=false; }); }
  else if(t.id==='rg-time-salvar'){ const n=(document.getElementById('rg-time-nome').value||'').trim();
    const ids=rgSelecionados();
    if(!n||!ids.length){ const fb=document.getElementById('rg-fb');
      if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent='Dê um nome ao time e selecione as pessoas antes de salvar.'; } return; }
    const ts=rgTimes(); ts[n]=ids; rgSalvaTimes(ts); rgRenderTimes();
    document.getElementById('rg-time-nome').value=''; }
  else if(t.hasAttribute('data-rg-time')){ rgAplicaSelecao(rgTimes()[t.getAttribute('data-rg-time')]||[]); }
  else if(t.hasAttribute('data-rg-time-del')){ const ts=rgTimes(); delete ts[t.getAttribute('data-rg-time-del')]; rgSalvaTimes(ts); rgRenderTimes(); }
  else if(t.id==='pl-csv-import'){ confirmaImportacao(); }
  else if(t.id==='pl-csv-modelo'){ baixaModeloPlanejar(); }
  else if(t.id==='pl-csv-cancel'){ fechaModal(); }
  else if(t.id==='rc-confirmar'){ executaMover(); }
  else if(t.id==='rc-cancelar'){ fechaModal(); }
  else if(t.id==='rc-adm-confirmar'){ executaConfirmaAdm(); }
  else if(t.id==='rc-adm-cancelar'){ fechaModal(); }
  else if(t.id==='aj-guia-atual'){ iniciaGuia(estado.vista); }
  else if(t.id==='aj-tour'){ iniciaTour(); }
  else if(t.id==='aj-tour-telas'){ iniciaTourTelas(); }
  else if(t.classList && t.classList.contains('fb-tipo')){
    document.querySelectorAll('.fb-tipo').forEach(c=>c.setAttribute('aria-pressed', c===t?'true':'false')); }
  else if(t.id==='fb-enviar'){ enviaFeedback(); }
  else if(t.id==='folga-enviar'){ enviaFolga(); }
  else if(t.id==='folga-cancelar'){ fechaModal(); }
  else if(t.id==='alx-confirmar'){ confirmaReprog(); }
  else if(t.id==='alx-cancelar'){ _alxReprog=null; fechaModal(); }
  else if(t.id==='alx-atrib-confirmar'){ confirmaAtribuir(); }
  else if(t.id==='alx-atrib-cancelar'){ _alxAtrib=null; fechaModal(); }
  else if(t.id==='alx-atrib-mim'){ alxAtribParaMim(); }
  else if(t.getAttribute('data-ap-act')==='config-id'){ abreIdentidade(); }
});

leURL();
sincronizaControlesURL();
(async ()=>{ await carregaCfgRemota(); recarrega(); })();
if(idApontar()) carregaInbox();   // selos já no carregamento: convites (Apontar/Operação) + pendências (📥 Inbox)

// ---- Versão do deploy no rodapé (commit/PR do GitHub, via Vercel) ----
// Fica vazio quando indisponível (ex.: rodando o HTML local, sem as functions).
function mostraVersao(j){
  const el=document.getElementById('versaoApp'); if(!el) return;
  if(!j || (!j.pr && !j.sha)){ el.textContent=''; return; }
  const base=j.url||'https://github.com/dfg-dexterity/jirainsight';
  const url=j.pr?`${base}/pull/${j.pr}`:`${base}/commit/${j.sha}`;
  el.innerHTML=`<strong>Versão:</strong> <a href="${escA(url)}" target="_blank" rel="noopener">${j.pr?`PR #${esc(j.pr)}`:esc(j.sha)}</a>`+
    `${j.titulo?` — ${esc(j.titulo)}`:''}${j.pr&&j.sha?` <span class="muted">(${esc(j.sha)})</span>`:''}`;
}
fetch('/api/config?versao=1').then(x=>x.json()).then(mostraVersao).catch(()=>{});
