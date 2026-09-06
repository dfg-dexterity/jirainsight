// Jira Insights · 30 · 🎛️ EVENTOS DELEGADOS (#conteudo/#modal-body/document, por tela), 📱 PWA, 🌙 tema,
// 🌀 marca animada e a INICIALIZAÇÃO (leURL → carregaCfgRemota → recarrega). Este arquivo carrega por ÚLTIMO.
document.getElementById('btn-pdf').addEventListener('click', exportarPDF);
// Receita / AMS: navegação de ciclo + PDF da apuração por contrato.
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const nav=e.target.closest&&e.target.closest('[data-ams-nav]');
  if(nav){ escondeTip(); const dir=nav.getAttribute('data-ams-nav');
    const ams=(cfg.contratos||[]).filter(c=>c.tipo==='ams'&&(c.projetos||[]).length);
    const rep=amsContratoSel(ams); const cm=amsCicloMeses((rep&&rep.apuracao)||'trimestral'); const ref=amsRefSel();
    if(dir==='prev'){ const nr=amsShiftRef(ref,-1,cm);
      // Não recua antes do 1º ciclo do contrato: trava o ref no início do ciclo atual.
      if(rep && amsCicloVigente(rep,nr).start===amsCicloVigente(rep,ref).start) estado.ams.ref=amsCicloVigente(rep,ref).start;
      else estado.ams.ref=nr; }
    else if(dir==='next'){ const nr=amsShiftRef(ref,1,cm);
      if(rep && amsCicloVigente(rep,nr).start>=amsCicloVigente(rep,hojeSP()).start) estado.ams.ref='';
      else estado.ams.ref=nr; }
    renderAMS(); return; }
  const cur=e.target.closest&&e.target.closest('[data-ams-cur]');
  if(cur){ escondeTip(); estado.ams.ref=''; renderAMS(); return; }
  const atz=e.target.closest&&e.target.closest('[data-ams-atualiza]');
  if(atz){ escondeTip(); estado.ams.dados=null; estado.ams.range=''; estado.ams.forcar=true; renderAMS(); return; }
  const pdf=e.target.closest&&e.target.closest('[data-ams-pdf]');
  if(pdf){ escondeTip(); pdfApuracaoAMS(pdf.getAttribute('data-ams-pdf')); return; }
  const mes=e.target.closest&&e.target.closest('[data-ams-mes]');
  if(mes){ escondeTip(); const v=mes.getAttribute('data-ams-mes'); const i=v.indexOf('|'); amsDrillMes(v.slice(0,i), v.slice(i+1)); return; }
  const rel=e.target.closest&&e.target.closest('[data-ams-rel]');
  if(rel){ escondeTip(); amsDrillRel((estado.ams&&estado.ams.sel)||'', rel.getAttribute('data-ams-rel'), rel.getAttribute('data-ams-relv')); return; }
  const amsEdit=e.target.closest&&e.target.closest('[data-ams-edit]');
  if(amsEdit){ escondeTip(); estado.admin.editId=amsEdit.getAttribute('data-ams-edit'); vaiPara('admin'); return; }
  const fat=e.target.closest&&e.target.closest('[data-ams-fatura]');
  if(fat){ escondeTip();
    const ams=(cfg.contratos||[]).filter(c=>c.tipo==='ams'&&(c.projetos||[]).length);
    const c=amsContratoSel(ams); if(!c) return;
    // O status fica salvo para o time (Supabase); a gravação compartilhada exige login do Jira.
    if(cfgShared && !idApontar()){ abreIdentidade(); return; }
    const cyc=amsCicloVigente(c, amsRefSel());
    // Chaves dos chamados do ciclo ANTES do re-render (que pode recarregar os dados).
    const keys=amsChamadosCiclo(c,cyc).map(o=>o.k).filter(k=>/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(k));
    c.faturados=c.faturados||{};
    const marcar=!c.faturados[cyc.start];
    if(marcar){ const id0=idApontar(); c.faturados[cyc.start]={ em:hojeSP(), por:(id0&&(id0.nome||id0.email))||'' }; }
    else delete c.faturados[cyc.start];
    salvaCfg(); renderAMS();
    // Reflete NO JIRA: labels "faturado" + "ciclo-<início>" em todos os chamados do
    // ciclo — adicionadas ao marcar, removidas ao desmarcar (com o token de quem marca).
    const idJ=idApontar();
    if(!idJ){ toast('Ciclo atualizado no painel — identifique-se (token do Jira) para gravar as labels nos tickets.','err'); return; }
    if(!keys.length){ toast(`Ciclo ${marcar?'marcado como faturado':'desmarcado'} — nenhum chamado com chave para rotular no Jira.`,'ok'); return; }
    const labels=['faturado', 'ciclo-'+cyc.start];
    toast(`${marcar?'Gravando':'Removendo'} a marcação de faturado em ${keys.length} ticket(s) no Jira…`);
    fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({rotular:true, issues:keys, labels, remover:!marcar, email:idJ.email, token:idJ.token})})
      .then(r=>r.json()).then(j=>{
        if(j.ok){ toast(`✓ ${j.rotulados} ticket(s) ${marcar?'marcados como FATURADO':'desmarcados'} no Jira (labels ${labels.join(', ')}).`,'ok');
          logAcao({acao:marcar?'ams-faturado':'ams-desfaturado', t:'', de:c.nome||c.id, para:`${j.rotulados} tickets · ciclo ${cyc.start}`, ok:true}); }
        else toast(`⚠ Labels no Jira: ${j.rotulados||0} ok, ${((j.falhas||[]).length)||'?'} falha(s)${j.erro?' — '+j.erro:''}. O status do ciclo no painel foi salvo.`,'err');
      }).catch(e=>toast('⚠ Falha ao gravar as labels no Jira: '+(e.message||e)+'. O status do ciclo no painel foi salvo.','err'));
    return; }
});
// AMS: seletor de cliente (mostra um contrato por vez; volta ao ciclo vigente ao trocar).
document.getElementById('conteudo').addEventListener('change', (e)=>{
  if(e.target && e.target.id==='ams-sel'){ estado.ams.sel=e.target.value; estado.ams.ref=''; renderAMS(); }
});
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

// ---- Qualidade dos Tickets (IA): analisar + menu de ações por ticket ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  const q=estado.qualidade;
  if(t.id==='qa-analisar'){ qaAnalisa(false); }
  else if(t.id==='qa-refresh'){ qaAnalisa(true); }
  else if(t.hasAttribute('data-qa-abrir')){ window.open(`${jiraBase()}/browse/${encodeURIComponent(t.getAttribute('data-qa-abrir'))}`,'_blank'); }
  else if(t.hasAttribute('data-qa-avisar')){
    const k=t.getAttribute('data-qa-avisar');
    const tk=((q.dados&&q.dados.tickets)||[]).find(x=>x.k===k); if(!tk) return;
    const alvoId=tk.respId||tk.relatorId; const alvoNome=(tk.respId?tk.responsavel:tk.relator)||'';
    if(!alvoId) return;
    escondeTip();
    abreQaComentar(k, { texto: qaTextoAviso(tk, (q.dados&&q.dados.url)||'') }, { id:alvoId, nome:alvoNome });
  }
  else if(t.hasAttribute('data-qa-act')){
    const k=t.getAttribute('data-qa-k'); const i=+t.getAttribute('data-qa-i');
    const tk=((q.dados&&q.dados.tickets)||[]).find(x=>x.k===k); const a=tk&&tk.acoes[i]; if(!a) return;
    escondeTip();
    if(a.tipo==='vencimento'){ abreModalReprog([k],''); }
    else if(a.tipo==='atribuir'){ abreModalAtribuir([k]); }
    else { abreQaComentar(k, a); }   // comentar / editar / dividir / status → feedback no ticket
  }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  const t=e.target; if(!t||!t.id) return;
  if(t.id==='qa-dias'){ estado.qualidade.dias=Number(t.value)||14; }
  else if(t.id==='qa-proj'){ estado.qualidade.projeto=t.value; }
});
document.getElementById('modal-body').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.id==='qa-com-cancel'){ fechaModal(); }
  else if(t.id==='qa-com-pub'){ publicaQaComentario(t.getAttribute('data-qa-com-k')); }
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
document.getElementById('conteudo').addEventListener('change', (e)=>{
  const rc=estado.reclass; const t=e.target; if(!t) return;
  if(t.id==='rc-alvo'){ rc.alvo=t.value; renderReclass(); }
  else if(t.id==='rc-all'){
    let lista=(rc.dados&&rc.dados.tickets)||[];
    if(rc.busca){ const q=rc.busca.toLowerCase(); lista=lista.filter(x=>(x.k+' '+x.resumo+' '+x.status).toLowerCase().includes(q)); }
    lista.forEach(x=>{ if(t.checked) rc.sel[x.id]=true; else delete rc.sel[x.id]; });
    renderReclass();
  } else if(t.classList && t.classList.contains('rc-chk')){
    const idv=t.getAttribute('data-id');
    if(t.checked) rc.sel[idv]=true; else delete rc.sel[idv];
    const n=Object.keys(rc.sel).filter(x=>rc.sel[x]).length;
    const c=document.getElementById('rc-count'); if(c) c.textContent=n+' selecionado(s)';
    const b=document.getElementById('rc-mover');
    if(b){ b.disabled=!(n>0 && rc.alvo && idApontar()); b.textContent=`Mover ${n||''} para ${rc.alvo||'…'} →`; }
    const ba=document.getElementById('rc-confirma-adm'); if(ba) ba.disabled=!(n>0 && idApontar());
  }
});
document.getElementById('conteudo').addEventListener('input', (e)=>{
  if(e.target && e.target.id==='rc-busca'){
    buscaComposta(e,(v)=>{ estado.reclass.busca=v; },renderReclass,'rc-busca');
  }
});
// ---- Ações de hoje: Ver casos → tela certa com o preset aplicado ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  const g=e.target.closest&&e.target.closest('[data-ax-goto]');
  if(g){ const k=g.getAttribute('data-ax-goto');
    if(k==='meta'){ vaiPara('timesheet'); return; }
    if(k==='fat'){ vaiPara('receita'); return; }
    estado.gestao.preset={atras:'atrasados',sematu:'sematu',semresp:'semresp',cli:'cliente'}[k]||'';
    vaiPara('gestao'); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.id==='ax-retry'){ estado.acoes.erro=''; estado.acoes.venc=null; renderAcoes(); }
  else if(t.id==='ax-mes-retry'){ estado.acoes.mesErro=''; estado.acoes.mes=null; renderAcoes(); }
});
// ---- 💬 Menções: lista, filtros e resposta ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  const gi=e.target.closest&&e.target.closest('[data-mn-ign]');
  if(gi){ mnIgnora(gi.getAttribute('data-mn-ign'));
    toast('🔕 Menção ignorada — não aparece mais para você. Reverta em "mostrar ignoradas".','ok');
    if(estado.vista==='inbox') renderInbox(); else renderMencoes(); return; }
  const gd=e.target.closest&&e.target.closest('[data-mn-desig]');
  if(gd){ mnIgnora(gd.getAttribute('data-mn-desig'), true);
    toast('↩ Menção de volta às suas listas.','ok');
    if(estado.vista==='inbox') renderInbox(); else renderMencoes(); return; }
  const r=e.target.closest&&e.target.closest('[data-mn-resp]');
  if(r){ abreResponderMencao(r.getAttribute('data-mn-resp')); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  const mn=estado.mencoes;
  if(t.id==='mn-retry'){ mn.erro=''; mn.dados=null; renderMencoes(); }
  else if(t.id==='mn-refresh'){ mn.dados=null; carregaMencoes(true); renderMencoes(); }
  // ---- 📥 Inbox ----
  else if(t.id==='ib-forcar'){ t.disabled=true; t.textContent='⟳ atualizando…'; carregaInbox(true); }
  else if(t.id==='ib-retry'){ estado.inbox.erro=''; estado.inbox.carregou=false; renderInbox(); }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  const mn=estado.mencoes; const t=e.target; if(!t||!t.id) return;
  if(t.id==='mn-dias'){ mn.dias=Number(t.value)||14; mn.dados=null; carregaMencoes(false); renderMencoes(); }
  else if(t.id==='mn-sopend'){ mn.soPend=t.checked; renderMencoes(); }
  else if(t.id==='mn-verign'){ mn.verIgn=t.checked; renderMencoes(); }
});
document.getElementById('conteudo').addEventListener('input',(e)=>{
  if(e.target&&e.target.id==='mn-busca'){ buscaComposta(e,(v)=>{ estado.mencoes.busca=v; },renderMencoes,'mn-busca'); }
});
document.getElementById('modal-body').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.id==='mn-enviar'){ enviaRespostaMencao(); }
  else if(t.id==='mn-cancelar'){ _mnResp=null; fechaModal(); }
  else if(t.hasAttribute&&t.hasAttribute('data-mn-chip-del')){
    if(_mnPick) _mnPick.delete(t.getAttribute('data-mn-chip-del')); mnPickerRefresh(); }
  else if(t.hasAttribute&&t.hasAttribute('data-mn-anexo-del')){
    _mnFiles.splice(Number(t.getAttribute('data-mn-anexo-del')),1); mnAnexosRefresh(); }
});
document.getElementById('modal-body').addEventListener('change',(e)=>{
  const t=e.target; if(!t) return;
  if(t.id==='mn-add-pessoa'&&t.value){
    const p=pessoasUnidas()[t.value];
    if(_mnPick) _mnPick.set(t.value,(p&&p.nome)||t.value);
    mnPickerRefresh(); return;
  }
  if(t.id==='mn-anexos'){ mnAnexosAdd(t.files); t.value=''; }
});
// Colar print (Ctrl+V) dentro dos modais com campo de anexos.
document.getElementById('modal-body').addEventListener('paste',(e)=>{
  if(!document.getElementById('mn-anexos')) return;
  const fs2=(e.clipboardData&&e.clipboardData.files)||[];
  if(fs2.length){ e.preventDefault(); mnAnexosAdd(fs2); toast('🖼 Print adicionado como anexo.','ok'); }
});
// ---- 📈 Analytics: cards, drill, filtros e CSV ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  const card=e.target.closest&&e.target.closest('[data-anl-card]');
  if(card){ estado.analytics.sel=card.getAttribute('data-anl-card'); estado.analytics.busca=''; renderAnalytics(); return; }
  const g=e.target.closest&&e.target.closest('[data-anl-goto]');
  if(g){ vaiPara(g.getAttribute('data-anl-goto')); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  const an=estado.analytics;
  if(t.id==='anl-voltar'){ an.sel=''; an.busca=''; renderAnalytics(); }
  else if(t.id==='anl-retry'){ an.erro=''; an.dados=null; renderAnalytics(); }
  else if(t.id==='anl-refresh'){ an.dados=null; carregaAnalytics(true); renderAnalytics(); }
  else if(t.id==='anl-csv'){ const res=anlResultados().find(r=>r.ch.id===an.sel);
    if(res&&res.itens){ let itens=res.itens;
      if(an.busca){ const q=an.busca.toLowerCase();
        itens=itens.filter(x=>(x.k+' '+x.resumo+' '+(x.resp||'')+' '+(x.status||'')).toLowerCase().includes(q)); }
      anlExportaCSV({ch:res.ch,itens}); } }
  else if(t.id==='anl-gestao'){ const res=anlResultados().find(r=>r.ch.id===an.sel);
    if(res&&res.itens&&res.itens.length){ let itens=res.itens;
      if(an.busca){ const q=an.busca.toLowerCase();
        itens=itens.filter(x=>(x.k+' '+x.resumo+' '+(x.resp||'')+' '+(x.status||'')).toLowerCase().includes(q)); }
      const g=estado.gestao;
      g.soKeys=itens.map(x=>x.k); g.origem=`${res.ch.n}. ${res.ch.tit}`;
      g.preset=''; g.busca=''; g.fProj=''; g.fResp=''; g.fStatus=''; g.semTrat=false;
      g.sel={}; g.soKeys.forEach(k=>{ g.sel[k]=true; });
      vaiPara('gestao'); } }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  const an=estado.analytics; const t=e.target; if(!t||!t.id) return;
  if(t.id==='anl-fproj'){ an.fProj=t.value; renderAnalytics(); }
  else if(t.id==='anl-fresp'){ an.fResp=t.value; renderAnalytics(); }
  else if(t.id==='anl-x'){ an.x=Math.max(1,Math.min(60,Number(t.value)||5)); renderAnalytics(); }
  else if(t.id==='anl-dias'){ an.dias=Number(t.value)||30; an.dados=null; carregaAnalytics(false); renderAnalytics(); }
});
document.getElementById('conteudo').addEventListener('input',(e)=>{
  if(e.target&&e.target.id==='anl-busca'){ buscaComposta(e,(v)=>{ estado.analytics.busca=v; },renderAnalytics,'anl-busca'); }
});
// ---- Gestão de Tickets: filtros, seleção e ações em massa ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  const act=e.target.closest&&e.target.closest('[data-gx-act]');
  if(act){ const keys=gxSelKeys(); const a=act.getAttribute('data-gx-act');
    if(a==='atribuir') abreModalAtribuir(keys);
    else if(a==='reprog') abreModalReprog(keys,'HOJE');
    else if(a==='comentar') abreModalComentarLote(keys);
    else if(a==='status') abreModalStatusLote(keys);
    else if(a==='rateio'&&keys.length){ const rt=estado.rateio;
      rt.texto=keys.join('\n'); rt.resultados=null; vaiPara('rateio'); rtConfere(); }
    else if(a==='transformar'&&keys.length){
      if(keys.length>1) toast(`Transformar leva UM chamado por vez — usando ${keys[0]}.`,'warn');
      abreTransformar(keys[0]); }
    else if(a==='excluir') abreModalExcluirLote(keys);
    return; }
  const card=e.target.closest&&e.target.closest('[data-gx-card]');
  if(card && !e.target.closest('a') && !e.target.closest('input') && !e.target.closest('button')){
    const g0=estado.gestao; const k=card.getAttribute('data-gx-card');
    if(g0.sel[k]) delete g0.sel[k]; else g0.sel[k]=true; renderGestao(); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  const g=estado.gestao;
  if(t.hasAttribute&&t.hasAttribute('data-gx-vis')){ g.vis=t.getAttribute('data-gx-vis'); renderGestao(); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gx-preset')){ const v=t.getAttribute('data-gx-preset');
    g.preset=(g.preset===v?'':v); renderGestao(); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gx-r')){ const [k,acao]=t.getAttribute('data-gx-r').split('|');
    abreModalReprog([k], acao==='DATA'?'HOJE':acao); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gx-msg')){ abreModalComentarLote([t.getAttribute('data-gx-msg')],'cobrar'); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gx-transf')){ abreRvWizard(t.getAttribute('data-gx-transf'), true); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gx-apont')){ abreModalApontarGx(t.getAttribute('data-gx-apont')); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gx-st')){ abreModalStatusLote([t.getAttribute('data-gx-st')]); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gx-trf')){ abreTransformar(t.getAttribute('data-gx-trf')); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gx-conv')){ abreConvidarApontar(t.getAttribute('data-gx-conv')); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gx-det')){ abreModalTicket(t.getAttribute('data-gx-det')); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gx-solimpar')){ g.soKeys=null; g.origem=''; renderGestao(); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gxf-salvar')){ abreModalFiltroSalvar(); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gxf-gerir')){ abreModalFiltrosGerir(); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gxf-linkatual')){ gxfCopiaLinkAtual(); return; }
  if(t.hasAttribute&&t.hasAttribute('data-gxf-apl')){ const f=gxfLista().find(x=>x.id===t.getAttribute('data-gxf-apl'));
    if(f){ gxfAplica(f); toast(`⭐ Filtro "${f.nome}" aplicado.`,'ok'); } return; }
  if(t.hasAttribute&&t.hasAttribute('data-gx-grp-sel')){
    t.getAttribute('data-gx-grp-sel').split(',').forEach(k=>{ if(k) g.sel[k]=true; });
    renderGestao(); toast('Grupo selecionado — use as ações em massa.','ok'); return; }
  if(t.id==='gx-tratar'){ const ks=gxSelKeys(); if(!ks.length) return;
    cfg.tratados=cfg.tratados||{}; const quem=(idApontar()||{}).nome||'';
    const desmarca=ks.every(k=>cfg.tratados[k]);
    ks.forEach(k=>{ if(desmarca){ delete cfg.tratados[k]; } else { cfg.tratados[k]={q:hojeSP(),u:quem};
      logAcao({acao:'tratado',t:k,ok:true},false); } });
    salvaCfg(); toast(desmarca?'Marcação de tratado removida.':`✓ ${ks.length} ticket(s) marcados como tratados.`,'ok');
    renderGestao(); return; }
  if(t.id==='gx-csv-sel'){ gxExportaCSV(); return; }
  if(t.id==='gx-dup'){ if(g.dados) abreModalDuplicados(); return; }
  if(t.id==='gx-epicos'){ if(g.dados) abreModalEpicos(); return; }
  if(t.id==='gx-retry'){ g.erro=''; g.dados=null; renderGestao(); }
  else if(t.id==='gx-refresh'){ g.dados=null; carregaGestao(true); }
  else if(t.id==='gx-limpar'){ g.sel={}; renderGestao(); }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  const g=estado.gestao; const t=e.target; if(!t) return;
  if(t.id==='gx-ate'){ g.ate=t.value; g.dados=null; carregaGestao(false); }
  else if(t.id==='gx-fproj'){ g.fProj=t.value; renderGestao(); }
  else if(t.id==='gx-fresp'){ g.fResp=t.value; renderGestao(); }
  else if(t.id==='gx-fstatus'){ g.fStatus=t.value; renderGestao(); }
  else if(t.id==='gx-ord'){ g.ord=t.value; renderGestao(); }
  else if(t.id==='gx-agrupar'){ g.agrupar=t.value; renderGestao(); }
  else if(t.id==='gx-semtrat'){ g.semTrat=t.checked; renderGestao(); }
  else if(t.id==='gx-all'){ const l=gxLista(); l.forEach(x=>{ if(t.checked) g.sel[x.k]=true; else delete g.sel[x.k]; }); renderGestao(); }
  else if(t.classList&&t.classList.contains('gx-chk')){ const k=t.getAttribute('data-k');
    if(t.checked) g.sel[k]=true; else delete g.sel[k]; renderGestao(); }
});
document.getElementById('conteudo').addEventListener('input',(e)=>{
  if(e.target&&e.target.id==='gx-busca'){ buscaComposta(e,(v)=>{ estado.gestao.busca=v; },renderGestao,'gx-busca'); }
});
// ---- 🏦 Controladoria: período, categoria, blocos por categoria e drill ----
// 🏅 Scoreboard — data de início do placar (gestores; vale para o time)
document.getElementById('conteudo').addEventListener('change',(e)=>{
  const t=e.target; if(!t||t.id!=='sc-inicio') return;
  cfg.scoreInicio=/^\d{4}-\d{2}-\d{2}$/.test(t.value||'')?t.value:'';
  salvaCfg();
  toast(cfg.scoreInicio?`📆 Placar valendo a partir de ${fmtBR(cfg.scoreInicio)} — dias anteriores saem do jogo.`
    :'📆 Início do placar removido — todo o histórico guardado volta a contar.','ok');
  renderRanking();
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='controladoria') return;
  const ct=estado.ctrl; const t=e.target; if(!t) return;
  if(t.id==='ct-de'){ if(t.value) ct.de=t.value; renderControladoria(); }
  else if(t.id==='ct-ate'){ if(t.value) ct.ate=t.value; renderControladoria(); }
  else if(t.hasAttribute&&t.hasAttribute('data-ct-b')){
    cfg.ctrl=cfg.ctrl||{custoPadrao:0,cats:{}}; cfg.ctrl.cats=cfg.ctrl.cats||{};
    const atual={...ctBlocosDe(ct.cat)}; atual[t.getAttribute('data-ct-b')]=t.checked?1:0;
    cfg.ctrl.cats[ct.cat]=atual; ct.cfgAberto=true; salvaCfg(); renderControladoria(); }
  else if(t.id==='ct-custopadrao'){ cfg.ctrl=cfg.ctrl||{custoPadrao:0,cats:{}};
    cfg.ctrl.custoPadrao=Math.max(0,Number(t.value)||0); ct.cfgAberto=true; salvaCfg(); renderControladoria(); }
  else if(t.hasAttribute&&t.hasAttribute('data-ct-custo')){
    cfg.custosPessoa=cfg.custosPessoa||{};
    const a=t.getAttribute('data-ct-custo'); const v=Math.max(0,Number(t.value)||0);
    if(v>0) cfg.custosPessoa[a]=v; else delete cfg.custosPessoa[a];
    ct.cfgAberto=true; salvaCfg(); renderControladoria(); }
});
// Enter/Espaço abrem o drill (as linhas anunciam role="button")
document.getElementById('conteudo').addEventListener('keydown',(e)=>{
  if(estado.vista!=='controladoria') return;
  if(e.key!=='Enter'&&e.key!==' ') return;
  const dr=e.target.closest&&e.target.closest('[data-ct-drill]');
  if(dr){ e.preventDefault(); ctAbreTickets(dr.getAttribute('data-ct-drill')); }
});
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='controladoria') return;
  const ct=estado.ctrl;
  const dr=e.target.closest&&e.target.closest('[data-ct-drill]');
  if(dr&&!e.target.closest('button')&&!e.target.closest('a')&&!e.target.closest('input')){
    ctAbreTickets(dr.getAttribute('data-ct-drill')); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-ct-cat')){ ct.cat=t.getAttribute('data-ct-cat'); renderControladoria(); return; }
  if(t.hasAttribute('data-ct-per')){ const p=t.getAttribute('data-ct-per'); const h=hojeSP();
    ct.de=p==='mes'?ctPrimeiroDiaMes(0):p==='3m'?ctPrimeiroDiaMes(-2):p==='6m'?ctPrimeiroDiaMes(-5):h.slice(0,4)+'-01-01';
    ct.ate=h; renderControladoria(); return; }
  if(t.id==='ct-retry'){ ct.tempoErro=''; ct.chaveT=''; renderControladoria(); return; }
});
// ---- ➗ Rateio: parsing ao vivo, modos, cálculo, execução e status em conjunto ----
// Tickets VÁLIDOS da lista (fora os "não encontrados") — base do %, do status
// em lote e dos preenchimentos automáticos.
function rtValidos(){ const fora=new Set(estado.rateio.naoEnc||[]); return estado.rateio.tickets.filter(k=>!fora.has(k)); }
// Percentuais iguais fechando em 100, SÓ nos tickets válidos.
function rtPctIgual(){
  const rt=estado.rateio; const ks=rtValidos(); if(!ks.length) return;
  const q=Math.floor(10000/ks.length)/100;
  ks.forEach((k,i)=>{ rt.pcts[k]=i?q:Math.round((100-q*(ks.length-1))*100)/100; });
}
let _rtDeb=null;
document.getElementById('conteudo').addEventListener('input',(e)=>{
  if(estado.vista!=='rateio') return;
  const rt=estado.rateio; const t=e.target; if(!t||rt.executando) return;
  if(t.id==='rt-texto'){ rt.texto=t.value;
    const nn=rtParse(rt.texto).length;
    const c=document.getElementById('rt-count');
    if(c) c.textContent=`${nn} ticket(s) reconhecido(s)${nn>=100?' — limite de 100':''}`;
    const bc=document.getElementById('rt-conferir'); if(bc) bc.disabled=!nn;
    const bl=document.getElementById('rt-limpar'); if(bl) bl.disabled=false;
    // Re-render "ao vivo" com debounce (o render preserva o foco da textarea):
    // a tabela do passo 3 acompanha a lista sem esperar o blur.
    clearTimeout(_rtDeb);
    _rtDeb=setTimeout(()=>{ if(estado.vista==='rateio'&&!estado.rateio.executando
      &&rtParse(estado.rateio.texto).join()!==estado.rateio.tickets.join()) renderRateio(); },400); }
  else if(t.id==='rt-total'){ rt.total=t.value; rtAtualizaCalculo(); }
  else if(t.id==='rt-coment'){ rt.coment=t.value; }
  else if(t.hasAttribute&&t.hasAttribute('data-rt-pct')){ rt.pcts[t.getAttribute('data-rt-pct')]=t.value; rtAtualizaCalculo(); }
  else if(t.hasAttribute&&t.hasAttribute('data-rt-man')){ rt.mans[t.getAttribute('data-rt-man')]=t.value; rtAtualizaCalculo(); }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='rateio') return;
  const rt=estado.rateio; const t=e.target; if(!t||rt.executando) return;
  if(t.id==='rt-texto'){ rt.texto=t.value;
    // Re-render só se a LISTA mudou — o change também dispara quando um outro
    // render remove a textarea focada, e renderizar de novo ali quebra o DOM.
    if(rtParse(rt.texto).join()!==rt.tickets.join()) renderRateio(); }
  else if(t.id==='rt-data'){ rt.data=t.value||hojeSP(); rtAtualizaCalculo(); }
});
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='rateio') return;
  const rt=estado.rateio; const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(rt.executando) return;   // nada de mexer no rateio com apontamentos em voo
  if(t.hasAttribute('data-rt-modo')){ const m=t.getAttribute('data-rt-modo');
    // Primeira visita ao modo percentual: pré-preenche com a divisão igual (fecha em 100).
    if(m==='pct'&&!rtValidos().some(k=>rt.pcts[k]!=null&&rt.pcts[k]!=='')) rtPctIgual();
    rt.modo=m; renderRateio(); return; }
  if(t.hasAttribute('data-rt-mais')||t.hasAttribute('data-rt-menos')){
    const k=t.getAttribute('data-rt-mais')||t.getAttribute('data-rt-menos');
    const cur=Math.max(0,Math.round(Number(rt.pesos[k]??1)||0));
    rt.pesos[k]=Math.max(0,cur+(t.hasAttribute('data-rt-mais')?1:-1));
    renderRateio(); return; }
  if(t.hasAttribute('data-rt-rm')){ const k=t.getAttribute('data-rt-rm');
    // Reescreve a lista a partir das chaves reconhecidas (evita apagar TAB-12 ao
    // remover AB-12 — a chave pode ser sufixo de outra no texto livre).
    rt.texto=rt.tickets.filter(x=>x!==k).join('\n');
    renderRateio(); return; }
  if(t.id==='rt-conferir'){ rtConfere(); return; }
  if(t.id==='rt-limpar'||t.id==='rt-limpar2'){
    Object.assign(estado.rateio,{ texto:'', tickets:[], info:{}, naoEnc:[], confErro:'',
      total:'', coment:'', modo:'igual', pesos:{}, pcts:{}, mans:{}, executando:false, resultados:null });
    renderRateio(); return; }
  if(t.id==='rt-igualar'){ rtPctIgual(); renderRateio(); return; }
  if(t.id==='rt-normalizar'){
    const ks=rtValidos();
    const pesos=ks.map(k=>Math.max(0,Number(String(rt.pcts[k]??'').replace(',','.'))||0));
    const soma=pesos.reduce((s,p)=>s+p,0);
    if(soma>0){
      ks.forEach((k,i)=>{ rt.pcts[k]=Math.round(pesos[i]/soma*10000)/100; });
      const st=ks.reduce((s,k)=>s+Number(rt.pcts[k]||0),0);
      const dif=Math.round((100-st)*100)/100;
      const k0=ks.find(k=>Number(rt.pcts[k])>0);
      if(k0!=null) rt.pcts[k0]=Math.round((Number(rt.pcts[k0])+dif)*100)/100;
    } else rtPctIgual();   // tudo vazio/zerado: normalizar vira a divisão igual
    renderRateio(); return; }
  if(t.id==='rt-apontar'||t.id==='rt-retry'){ rtExecuta(); return; }
  if(t.id==='rt-status'){ const ks=rtValidos(); if(ks.length) abreModalStatusLote(ks); return; }
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
// ---- Vincular Reuniões a AMS: lista + assistente (modal) ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const v=e.target.closest&&e.target.closest('[data-rv-vinc]');
  if(v){ abreRvWizard(v.getAttribute('data-rv-vinc')); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  const rv=estado.reuvinc;
  if(t.id==='rv-retry'){ rv.erro=''; rv.dados=null; renderReuVinc(); }
  else if(t.id==='rv-refresh'){ rv.dados=null; carregaReuVinc(true); }
  // 🔁 Transferir OUTRO ticket (qualquer tipo) pelo número: mesmo assistente da
  // Gestão (copia detalhes, vincula o esforço ao destino e EXCLUI o original).
  else if(t.hasAttribute('data-rv-transf')){
    const inp=document.getElementById('rv-transf-key');
    const k=String((inp&&inp.value)||'').trim().toUpperCase();
    if(!/^[A-Z][A-Z0-9]*-\d+$/.test(k)){ toast('Informe a chave do ticket (ex.: TAD-123).','warn'); if(inp) inp.focus(); return; }
    if(!idApontar()){ abreIdentidade(); return; }
    abreRvWizard(k, true); return; }
});
document.getElementById('conteudo').addEventListener('input', (e)=>{
  const t=e.target; if(!t) return;
  if(t.id==='rv-busca'){ estado.reuvinc.busca=t.value; renderReuVinc();
    const nb=document.getElementById('rv-busca'); if(nb){ nb.focus(); nb.setSelectionRange(nb.value.length,nb.value.length); } }
});
document.getElementById('conteudo').addEventListener('change', (e)=>{
  const t=e.target; if(!t) return;
  if(t.id==='rv-origem'){ const v=t.value.trim().toUpperCase();
    if(/^[A-Z][A-Z0-9_]*$/.test(v)){ estado.reuvinc.origem=v; estado.reuvinc.dados=null; carregaReuVinc(false); } }
});
document.getElementById('modal-body').addEventListener('click', (e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t||!_rv) return;
  if(t.id==='rv-modo-criar'){ _rv.modo='criar'; renderRvModal(); }
  else if(t.id==='rv-modo-exist'){ _rv.modo='existente'; if(!_rv.abertos&&!_rv.carregandoAb) rvCarregaAbertos(); else renderRvModal(); }
  else if(t.id==='rv-confirm'){ rvExecuta(); }
  else if(t.id==='rv-cancelar'||t.id==='rv-fechar'){ _rv=null; fechaModal();
    if(estado.vista==='apontar') renderApontar(); else if(estado.vista==='gestao') renderGestao(); }
});
document.getElementById('modal-body').addEventListener('change', (e)=>{
  const t=e.target; if(!t||!_rv) return;
  if(t.id==='rv-proj'){ _rv.projeto=t.value; _rv.tipoId=rvTipoPadrao(rvProjetosDo().find(p=>p.key===t.value));
    if(_rv.modo==='existente'){ _rv.ticket=''; rvCarregaAbertos(); } else renderRvModal(); }
  else if(t.id==='rv-tipo'){ _rv.tipoId=t.value; }
  else if(t.id==='rv-ticket'){ _rv.ticket=t.value; renderRvModal(); }
  else if(t.id==='rv-resumo'){ _rv.resumo=t.value; renderRvModal(); }
  else if(t.id==='rv-horas'){ _rv.horas=Math.max(0,Number(t.value)||0); renderRvModal(); }
  else if(t.id==='rv-worklog'){ _rv.worklog=t.checked; renderRvModal(); }
});
document.getElementById('modal-body').addEventListener('input', (e)=>{
  const t=e.target; if(!t||!_rv) return;
  if(t.id==='rv-tbusca'){ _rv.tbusca=t.value; renderRvModal();
    const nb=document.getElementById('rv-tbusca'); if(nb){ nb.focus(); nb.setSelectionRange(nb.value.length,nb.value.length); } }
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
// ---- Central de Alertas: ações rápidas, lote, filtros e retry ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const kp=e.target.closest && e.target.closest('[data-al-sev]');
  if(kp){ escondeTip(); estado.alertas.sev=kp.getAttribute('data-al-sev'); renderAlertas(); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  const a=estado.alertas;
  if(t.id==='al-retry'){ a.erro=''; a.dados=null; renderAlertas(); }
  else if(t.hasAttribute('data-alx-reprog')){ escondeTip(); abreModalReprog([t.getAttribute('data-alx-k')], t.getAttribute('data-alx-reprog')); }
  else if(t.hasAttribute('data-alx-copiar')){ alxCopiar(t, t.getAttribute('data-alx-copiar')); }
  else if(t.hasAttribute('data-alx-bulk')){ escondeTip(); abreModalReprog(Object.keys(a.sel), t.getAttribute('data-alx-bulk')); }
  else if(t.hasAttribute('data-alx-atrib')){ escondeTip(); abreModalAtribuir([t.getAttribute('data-alx-atrib')]); }
  else if(t.hasAttribute('data-alx-bulk-atrib')){ escondeTip(); abreModalAtribuir(Object.keys(a.sel)); }
  else if(t.hasAttribute('data-alx-bulk-clear')){ a.sel={}; renderAlertas(); }
  else if(t.hasAttribute('data-alx-resp')){ escondeTip(); const r=t.getAttribute('data-alx-resp'); a.fResp=(a.fResp===r?'':r); renderAlertas(); }
  else if(t.hasAttribute('data-alx-todos')){ const on=t.getAttribute('data-alx-todos')==='1';
    if(on){ document.querySelectorAll('[data-alx-sel]').forEach(c=>{ a.sel[c.getAttribute('data-alx-sel')]=true; }); } else { a.sel={}; }
    renderAlertas(); }
  else if(t.hasAttribute('data-alx-limpar')){ a.fResp='';a.fProj='';a.fPrio='';a.fStatus='';a.fTipo='';a.fMinDias=0;a.soMeus=false;a.ord='crit'; renderAlertas(); }
});
// ---- Central de Alertas: filtros (selects/checkbox) e seleção em lote (checkbox da linha) ----
document.getElementById('conteudo').addEventListener('change', (e)=>{
  const a=estado.alertas;
  const sc=e.target.closest && e.target.closest('[data-alx-sel]');
  if(sc){ const k=sc.getAttribute('data-alx-sel'); if(sc.checked) a.sel[k]=true; else delete a.sel[k]; renderAlertas(); return; }
  const f=e.target.closest && e.target.closest('[data-alx-f]');
  if(f){ const campo=f.getAttribute('data-alx-f');
    if(campo==='soMeus'){ if(f.checked && !(idApontar()&&idApontar().accountId)){ f.checked=false; abreIdentidade(); return; } a.soMeus=f.checked; }
    else if(campo==='fMinDias'){ a.fMinDias=Math.max(0, Number(f.value)||0); }
    else { a[campo]=f.value; }
    renderAlertas(); }
});
// ---- Planejamento: editor do plano (CRUD do plano, fases e funções) ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const t=e.target.closest&&e.target.closest('[data-pl-novo],[data-pl-edit],[data-pl-voltar],[data-pl-func-add],[data-pl-func-del],[data-pl-fase-add],[data-pl-row-del],[data-pl-epicos],[data-pl-salvar],[data-pl-excluir],[data-pl-aba],[data-pl-pess-del],[data-pl-real],[data-pl-real-recarrega]');
  if(!t) return;
  const pl=estado.planejamento;
  if(t.hasAttribute('data-pl-novo')){ pl.draft=planNovo(); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-edit')){ const p=(cfg.planos||[]).find(x=>x.id===t.getAttribute('data-pl-edit')); if(p){ pl.draft=JSON.parse(JSON.stringify(p)); renderPlanejamento(); } }
  else if(t.hasAttribute('data-pl-voltar')){ planSyncDraft(); pl.draft=null; renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-func-add')){ planSyncDraft(); pl.draft.funcoes.push(planFunc('')); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-func-del')){ planSyncDraft(); const fid=t.getAttribute('data-pl-func-del');
    pl.draft.funcoes=pl.draft.funcoes.filter(f=>f.id!==fid); pl.draft.fases.forEach(fa=>{ delete fa.aloc[fid]; }); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-fase-add')){ planSyncDraft(); pl.draft.fases.push(planFase({})); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-row-del')){ planSyncDraft(); pl.draft.fases.splice(+t.getAttribute('data-pl-row-del'),1); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-epicos')){ planPuxaEpicos(); }
  else if(t.hasAttribute('data-pl-salvar')){ planSalva(); }
  else if(t.hasAttribute('data-pl-excluir')){ const id=pl.draft&&pl.draft.id; cfg.planos=(cfg.planos||[]).filter(p=>p.id!==id); salvaCfg(); toast('Plano excluído.','ok'); pl.draft=null; renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-aba')){ planSyncDraft(); pl.aba=t.getAttribute('data-pl-aba'); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-pess-del')){ const p=t.getAttribute('data-pl-pess-del').split('|'); const arr=(pl.draft.pessoasPorFuncao||{})[p[0]]; if(arr) pl.draft.pessoasPorFuncao[p[0]]=arr.filter(a=>a!==p[1]); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-real')){ planCarregaReal(pl.draft, false); }
  else if(t.hasAttribute('data-pl-real-recarrega')){ planCarregaReal(pl.draft, true); }
});
// Ao mudar qualquer campo do editor: ressincroniza e re-renderiza (atualiza totais/dias úteis; tipo troca o layout).
document.getElementById('conteudo').addEventListener('change', (e)=>{
  const t=e.target;
  if(t && t.matches && t.matches('[data-pl-pess-add]')){ const fid=t.getAttribute('data-pl-pess-add'); const a=t.value;
    if(a && estado.planejamento.draft){ const d=estado.planejamento.draft; d.pessoasPorFuncao=d.pessoasPorFuncao||{}; d.pessoasPorFuncao[fid]=d.pessoasPorFuncao[fid]||[]; if(!d.pessoasPorFuncao[fid].includes(a)) d.pessoasPorFuncao[fid].push(a); renderPlanejamento(); } return; }
  if(t && t.matches && t.matches('[data-pl-meta],[data-pl-func],[data-pl-f],[data-pl-aloc]')){ planSyncDraft(); if(estado.planejamento.draft) renderPlanejamento(); }
});
// ---- Alocação macro: editor de alocações pessoa × projeto ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const t=e.target.closest&&e.target.closest('[data-ab-del],[data-ab-dup],[data-ab-cpd],[data-gt-dup],[data-al-gran],[data-al-visao],[data-al-real],[data-al-flimpar],[data-al-skdel],[data-al-skprim],[data-al-relcsv],[data-al-relreal],[data-al-odoo],[data-al-travar],[data-al-aprovar],[data-al-recusar],[data-al-destravar],[data-al-semtravar],[data-al-semdestravar],[data-al-semtoggle],[data-al-semcsv],[data-al-semtk],[data-al-plaprova],[data-al-plrecusa],[data-pp-add],[data-pp-del],[data-gt-zoom],[data-gt-hoje],[data-sim-add],[data-sim-del],[data-sim-limpar],[data-sim-fromfind]'); if(!t) return;
  if(t.hasAttribute('data-al-travar')){ const a=t.getAttribute('data-al-travar'); const id=idApontar()||{};
    cfg.alocTravas=cfg.alocTravas||{};
    cfg.alocTravas[a]={ status:'pendente', por:id.nome||id.email||'—', quando:new Date().toISOString() };
    logAcao({acao:'alocacao-travar', t:(alocPessoas()[a]||{}).nome||a, para:'aguardando aprovação (Diego)', ok:true}, false);
    salvaCfg(); toast('🔒 Alocações travadas e enviadas para a aprovação do Diego.','ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-aprovar')){ const a=t.getAttribute('data-al-aprovar'); const id=idApontar()||{};
    if(!souAprovador()){ toast('Só o Diego (aprovador) pode aprovar.','warn'); return; }
    const tv=(cfg.alocTravas||{})[a]; if(!tv) return;
    tv.status='aprovado'; tv.aprovadoPor=id.nome||id.email||'Diego'; tv.quandoAprov=new Date().toISOString();
    logAcao({acao:'alocacao-aprovar', t:(alocPessoas()[a]||{}).nome||a, para:'aprovado', ok:true}, false);
    salvaCfg(); toast('✓ Alocação aprovada — segue travada até destravar.','ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-recusar')){ const a=t.getAttribute('data-al-recusar');
    if(!souAprovador()){ toast('Só o Diego (aprovador) pode recusar.','warn'); return; }
    delete (cfg.alocTravas||{})[a];
    logAcao({acao:'alocacao-recusar', t:(alocPessoas()[a]||{}).nome||a, para:'recusado — liberado para edição', ok:true}, false);
    salvaCfg(); toast('✕ Recusado — a alocação voltou a ficar editável.','warn'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-destravar')){ const a=t.getAttribute('data-al-destravar');
    delete (cfg.alocTravas||{})[a];
    logAcao({acao:'alocacao-destravar', t:(alocPessoas()[a]||{}).nome||a, para:'liberado para edição', ok:true}, false);
    salvaCfg(); toast('🔓 Destravado — edição liberada.','ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-pp-add')){ ppLista().push(ppNova()); salvaCfg(); renderAlocacao();
    setTimeout(()=>{ const ins=document.querySelectorAll('[data-pp-f^="nome|"]'); const ult=ins[ins.length-1]; if(ult) ult.focus(); },40);
    return; }
  if(t.hasAttribute('data-pp-del')){ const id=t.getAttribute('data-pp-del');
    const nAl=alocRows().filter(a=>a.accountId===id).length;
    estado.alocacao.rows=alocRows().filter(a=>a.accountId!==id);
    cfg.alocacoes=JSON.parse(JSON.stringify(estado.alocacao.rows));
    cfg.pessoasPlanejadas=ppLista().filter(p=>p.id!==id);
    salvaCfg(); toast(nAl?`Vaga removida junto com ${nAl} alocação(ões).`:'Vaga removida.','ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-ab-del')){ const rid=t.getAttribute('data-ab-del'); const rs=alocRows(); const ix=rs.findIndex(r=>r.id===rid);
    if(ix>=0){ if(alocTravaBloqueia(rs[ix].accountId)) return; rs.splice(ix,1); alocPersiste(); } renderAlocacao(); return; }
  if(t.hasAttribute('data-ab-cpd')){ const a=alocRows().find(r=>r.id===t.getAttribute('data-ab-cpd'));
    if(a){ const txt=(a.inicio?dataBR(a.inicio):'?')+' – '+(a.fim?dataBR(a.fim):'?');
      const done=()=>{ try{ toast('📋 Período copiado: '+txt+' — Ctrl+V em um campo de data de outra linha preenche início E fim'); }catch(_){} };
      try{ navigator.clipboard.writeText(txt).then(done,()=>{}); }
      catch(_){ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select();
        try{ if(document.execCommand('copy')) done(); }catch(__){} ta.remove(); } }
    return; }
  if(t.hasAttribute('data-al-skdel')){ const v=t.getAttribute('data-al-skdel'); const i=v.indexOf('|'); const a=v.slice(0,i), s=v.slice(i+1);
    alocSkillsSet(a, alocSkills(a).filter(x=>x!==s)); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-skprim')){ const v=t.getAttribute('data-al-skprim'); const i=v.indexOf('|'); const a=v.slice(0,i), s=v.slice(i+1);
    alocSkillsSet(a, [s, ...alocSkills(a).filter(x=>x!==s)]); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-relcsv')){
    const pess=alocPessoas(); const D=alocRelDados(alocFiltraRows(alocRows()), pess);
    const gl={pessoa:'Pessoa',projeto:'Projeto',tipo:'Tipo',skill:'Função/Skill'}[D.grupo]||'Grupo';
    const mr=D.temReal&&D.grupoRealOk;
    const efi=(p,r)=>p?Math.round((r||0)/p*100)+'%':'';
    const head=[gl, ...D.meses.map(labelMesAbbr), 'Total h', '%', ...(mr?['Realizado h','Eficiência']:[]), 'Custo R$'];
    const rowsCsv=D.linhas.map(l=>[l.rot, ...D.meses.map(m=>l.meses[m]?Math.round(l.meses[m]*10)/10:''),
      Math.round(l.h*10)/10, D.totH?Math.round(l.h/D.totH*100)+'%':'',
      ...(mr?[Math.round((l.real||0)*10)/10, efi(l.h,l.real)]:[]), l.c?Math.round(l.c):'']);
    rowsCsv.push(['Total', ...D.meses.map(m=>D.mesTot[m]?Math.round(D.mesTot[m]*10)/10:''), Math.round(D.totH*10)/10, D.totH?'100%':'',
      ...(mr?[Math.round(D.realTot*10)/10, efi(D.totH,D.realTot)]:[]), D.totC?Math.round(D.totC):'']);
    if(D.temReal){ rowsCsv.push([]); rowsCsv.push(['Semana','Planejado h','Realizado h','Eficiência']);
      [...new Set([...D.wks, ...Object.keys(D.realSem)])].sort()
        .filter(w=>(D.planSem[w]||0)>0||(D.realSem[w]||0)>0)
        .forEach(w=>rowsCsv.push([fmtBR(w), Math.round((D.planSem[w]||0)*10)/10, Math.round((D.realSem[w]||0)*10)/10, efi(D.planSem[w],D.realSem[w])])); }
    baixaCSV('relatorio_alocacao.csv',[head,...rowsCsv]);
    return; }
  if(t.hasAttribute('data-al-relreal')){
    const R=estado.alocacao.rel=estado.alocacao.rel||{};
    if(!R.ini||!R.fim){ toast('Defina o período do relatório primeiro.','warn'); return; }
    const RR=estado.alocacao.relReal=estado.alocacao.relReal||{};
    RR.carregando=true; RR.erro=''; RR.range=R.ini+'|'+R.fim; renderAlocacao();
    fetch(`/api/tempo?desde=${encodeURIComponent(R.ini)}&ate=${encodeURIComponent(R.fim)}`).then(r=>r.json()).then(j=>{
      RR.carregando=false;
      if(j.erro){ RR.erro=humanizaErro(j.erro); RR.wl=null; } else RR.wl=j.worklogs||[];
      if(estado.vista==='alocacao') renderAlocacao();
    }).catch(e=>{ RR.carregando=false; RR.erro=humanizaErro(e); RR.wl=null; if(estado.vista==='alocacao') renderAlocacao(); });
    return; }
  if(t.hasAttribute('data-al-odoo')){
    t.disabled=true; t.textContent='Importando…';
    fetch('/api/usuarios?custos=1').then(r=>r.json()).then(j=>{
      if(!j || j.configurado===false || j.erro){ toast((j&&j.erro)||'Odoo não configurado.','warn'); renderAlocacao(); return; }
      const porEmail={}, porNome={};
      (j.custos||[]).forEach(c=>{ if(c.custo>0){ if(c.email) porEmail[c.email]=c.custo; if(c.nome) porNome[c.nome.trim().toLowerCase()]=c.custo; } });
      let ok=0; const sem=[];
      cfg.custosPessoa=cfg.custosPessoa||{};
      Object.entries(pessoasUnidas()).forEach(([a,p])=>{
        if(RE_EXCLUIR.test((p&&p.nome)||'')) return;
        const em=((p&&p.email)||'').toLowerCase(); const nomeN=((p&&p.nome)||'').trim().toLowerCase();
        const c=(em&&porEmail[em]!=null)?porEmail[em]:(porNome[nomeN]!=null?porNome[nomeN]:null);
        if(c!=null){ cfg.custosPessoa[a]=c; ok++; } else sem.push((p&&p.nome)||a);
      });
      if(ok) salvaCfg();
      toast(ok?`✓ ${ok} custo(s) importado(s) do Odoo (campo ${j.campo||'hourly_cost'})${sem.length?` · sem correspondência: ${sem.slice(0,3).join(', ')}${sem.length>3?'…':''}`:''}`
        :'Nenhum funcionário do Odoo casou com as pessoas do Jira (por e-mail/nome).', ok?'ok':'warn');
      renderAlocacao();
    }).catch(e=>{ toast('Erro ao consultar o Odoo: '+(e.message||e),'err'); renderAlocacao(); });
    return; }
  if(t.hasAttribute('data-ab-dup')||t.hasAttribute('data-gt-dup')){
    const rid=t.getAttribute('data-ab-dup')||t.getAttribute('data-gt-dup');
    const rs=alocRows(); const ix=rs.findIndex(r=>r.id===rid);
    if(ix>=0){ const o=rs[ix]; if(alocTravaBloqueia(o.accountId)) return;
      const c=JSON.parse(JSON.stringify(o)); c.id='al'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
      // A cópia entra NA SEQUÊNCIA do período original — evita o conflito de sobreposição.
      if(/^\d{4}-\d{2}-\d{2}$/.test(o.inicio)&&/^\d{4}-\d{2}-\d{2}$/.test(o.fim)){
        const len=gtDiff(o.inicio,o.fim); c.inicio=gtAdd(o.fim,1); c.fim=gtAdd(c.inicio,len);
      }
      const cf=alocConflitoDe(rs.concat([c]), c);
      if(cf){ alocAvisaConflito(cf); return; }
      rs.splice(ix+1,0,c); alocPersiste(); toast('✓ Duplicada na sequência do período — ajuste as datas/% da cópia.','ok'); renderAlocacao(); }
    return; }
  if(t.hasAttribute('data-gt-hoje')){ const g=document.querySelector('.gt-scroll'); if(g){ const tp=+(g.getAttribute('data-gt-target'))||0; if(g.scrollTo) g.scrollTo({left:Math.max(0,tp-140),behavior:'smooth'}); else g.scrollLeft=Math.max(0,tp-140); } return; }
  if(t.hasAttribute('data-gt-zoom')){ const d=t.getAttribute('data-gt-zoom')==='in'?4:-4; estado.alocacao.gz=Math.max(10,Math.min(44,gtZoom()+d)); alocUISave(); renderAlocacao(); return; }
  if(t.hasAttribute('data-sim-add')){ simSync(); simRows().push(simNova()); renderAlocacao(); return; }
  if(t.hasAttribute('data-sim-del')){ simSync(); simRows().splice(+t.getAttribute('data-sim-del'),1); renderAlocacao(); return; }
  if(t.hasAttribute('data-sim-limpar')){ estado.alocacao.sim=[]; renderAlocacao(); return; }
  if(t.hasAttribute('data-sim-fromfind')){ simSync(); simFindSync(); const f=estado.alocacao.find||{};
    simRows().push(simNova({ accountId:t.getAttribute('data-sim-fromfind'), projeto:(f.rot||'Novo projeto'), inicio:f.ini||'', fim:f.fim||'', hSemana:Math.max(0,Number(f.h)||0) }));
    toast('✓ Adicionado ao cenário.','ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-flimpar')){ estado.alocacao.fSkill=''; estado.alocacao.fProj=''; renderAlocacao(); return; }
  // 📆 Semanas: travar (snapshot do planejado), destravar, abrir por pessoa e CSV.
  if(t.hasAttribute('data-al-semtravar')){ const w=t.getAttribute('data-al-semtravar');
    const rows=alocRows(); const id=idApontar();
    const horas=alocSemHorasVivas(rows,w);
    cfg.alocSemTravas=cfg.alocSemTravas||{};
    cfg.alocSemTravas[semTravaKey(w)]={ quando:new Date().toISOString(), por:(id&&id.accountId)||'', porNome:(id&&id.email)||'', horas };
    salvaCfg(); const s=isoSemana(w);
    toast(`🔒 Semana S${s.num}/${s.ano} travada — planejado congelado.`,'ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-semdestravar')){ const w=t.getAttribute('data-al-semdestravar');
    const s=isoSemana(w);
    if(!window.confirm(`Destravar a semana S${s.num}/${s.ano}? O planejado volta a seguir as alocações atuais.`)) return;
    if(cfg.alocSemTravas) delete cfg.alocSemTravas[semTravaKey(w)];
    salvaCfg(); toast('🔓 Semana destravada.','warn'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-semtoggle')){ const w=t.getAttribute('data-al-semtoggle');
    estado.alocacao.semAberta=estado.alocacao.semAberta||{};
    estado.alocacao.semAberta[w]=!estado.alocacao.semAberta[w]; renderAlocacao(); return; }
  if(t.hasAttribute('data-al-semcsv')){ const rows=alocRows();
    const linhas=[['Semana','Inicio','Fim','AlocadoH','PlanoEquipeH','RealizadoH','Delta','Travada']];
    const ids=new Set(rows.map(a=>a.accountId).filter(Boolean));
    alocSemanas(rows).forEach(w=>{ const s=isoSemana(w);
      const pl=alocSemPlanejado(rows,w); const planH=Object.values(pl.horas).reduce((x,h)=>x+h,0);
      const pe=alocSemPlanoEquipe(w); let peH=0; Object.keys(pl.horas).forEach(a=>{ peH+=(pe[a]&&pe[a].h)||0; });
      const rp=alocSemRealizado(w); let re=null;
      if(rp){ re=0; Object.entries(rp).forEach(([a,h])=>{ if(ids.has(a)) re+=h; }); }
      const f1=(v)=>String(Math.round(v*10)/10).replace('.',',');
      linhas.push([`S${s.num}/${s.ano}`, w, somaDias(w,6), f1(planH), f1(peH), re==null?'':f1(re), re==null?'':f1(re-planH), pl.travada?'sim':'nao']);
    });
    baixaCSV('planejado-semanas', linhas); return; }
  // ✔/✖ Decisão de plano semanal: agora vive no Meu Planejamento → Aprovações
  // (o modelo antigo por tickets é somente leitura; a decisão usa o modelo novo).
  if(t.hasAttribute('data-al-plaprova')||t.hasAttribute('data-al-plrecusa')){
    estado.minhasemana.aba='aprovacoes';
    vaiPara('minhasemana'); return; }
  // 🔎 Plano × apontado por TICKET de uma pessoa numa semana (desvio no detalhe)
  if(t.hasAttribute('data-al-semtk')){ const at=t.getAttribute('data-al-semtk');
    const i=at.lastIndexOf('|'); const acc=at.slice(0,i); const w=at.slice(i+1); const wf=somaDias(w,6);
    const s=isoSemana(w);
    const pn=msPlanoDe(acc,w); const itens=(pn&&pn.itens)||[];
    const wl=(estado.alocacao.real&&estado.alocacao.real.wl)||[];
    const realTk={}; wl.forEach(x=>{ const d=(x.d||'').slice(0,10); if(x.a===acc&&x.k&&d>=w&&d<=wf) realTk[x.k]=(realTk[x.k]||0)+(Number(x.s)||0)/3600; });
    const noPlano=new Set(itens.map(x=>x.k));
    const fora=Object.entries(realTk).filter(([k])=>!noPlano.has(k)).sort((a,b)=>b[1]-a[1]);
    const f=(h)=>alocH(h||0);
    const linhasTk=itens.map(x=>{ const eff=msHorasItem(x,w); const re=realTk[x.k]||0; const dl=re-eff;
      return `<tr><td><a href="${projJira(x.k)}" target="_blank" rel="noopener">${esc(x.k)}</a>${x.rot?' <span class="badge ms-b-rot" data-tip="Rotina diária (h/dia × dias úteis)">🔁</span>':''}</td><td class="num">${f(eff)}</td><td class="num">${f(re)}</td><td class="num" style="color:${dl>0.01?'#b45309':dl<-0.01?'#166534':'inherit'}">${dl>0?'+':''}${f(dl)}</td></tr>`; }).join('');
    const linhasFora=fora.map(([k,h])=>`<tr><td><a href="${projJira(k)}" target="_blank" rel="noopener">${esc(k)}</a> <span class="badge ms-b-sem" data-tip="Apontou aqui, mas o ticket não estava no plano">fora do plano</span></td><td class="num">—</td><td class="num">${f(h)}</td><td class="num" style="color:#b45309">+${f(h)}</td></tr>`).join('');
    abreModal(`<h2>🔎 ${esc((pn&&pn.nome)||acc)} — S${s.num}/${s.ano}</h2>
      <div class="muted small">Plano (📋 Minha Semana) × apontado por ticket · ${esc(fmtBR(w))}–${esc(fmtBR(wf))}${pn&&pn.atualizadoEm?` · plano atualizado em ${esc(fmtBR((pn.atualizadoEm||'').slice(0,10)))}`:''}</div>
      <div class="scroll-x" style="margin-top:8px"><table><thead><tr><th>Ticket</th><th class="num">Plano</th><th class="num">Apontado</th><th class="num">Δ</th></tr></thead>
      <tbody>${linhasTk||''}${linhasFora||''}${(!linhasTk&&!linhasFora)?'<tr><td colspan="4" class="muted">Sem plano e sem apontamentos nesta semana.</td></tr>':''}</tbody></table></div>`);
    return; }
  if(t.hasAttribute('data-al-gran')){ estado.alocacao.gran=t.getAttribute('data-al-gran'); alocUISave(); renderAlocacao(); }
  else if(t.hasAttribute('data-al-visao')){ estado.alocacao.visao=t.getAttribute('data-al-visao'); alocUISave(); renderAlocacao(); }
  else if(t.hasAttribute('data-al-real')){ alocCarregaReal(alocRows(), true); }
});
// Enter no campo "+ skill" adiciona a skill (o change cobre a escolha via datalist/blur).
document.getElementById('conteudo').addEventListener('keydown', (e)=>{
  const t=e.target; if(!t||!t.matches||!t.matches('.al-skadd')||e.key!=='Enter') return;
  e.preventDefault();
  const a=t.getAttribute('data-al-skadd'); const s=(t.value||'').trim();
  if(!a||!s) return;
  const cur=alocSkills(a); if(!cur.includes(s)) cur.push(s);
  alocSkillsSet(a, cur); t.value=''; alocRedraw();
  setTimeout(()=>{ const nb=[...document.querySelectorAll('.al-skadd')].find(x=>x.getAttribute('data-al-skadd')===a); if(nb) nb.focus(); },40);
});
// Re-render ADIADO (fora do dispatch do change): trocar o DOM no meio do evento —
// com o campo ainda focado — dispara blur/change reentrantes e quebra o replaceChildren.
let _alocRedrawT=null;
function alocRedraw(){ clearTimeout(_alocRedrawT); _alocRedrawT=setTimeout(()=>{ if(estado.vista==='alocacao') renderAlocacao(); },0); }
document.getElementById('conteudo').addEventListener('change', (e)=>{ const t=e.target; if(!t||!t.matches) return;
  if(t.matches('[data-al-fskill]')){ estado.alocacao.fSkill=t.value; alocRedraw(); return; }
  if(t.matches('[data-al-fproj]')){ estado.alocacao.fProj=t.value; alocRedraw(); return; }
  if(t.matches('[data-al-ordb]')){ estado.alocacao.ordB=t.value; alocUISave(); alocRedraw(); return; }
  if(t.matches('[data-al-ptipo]')){ const k=t.getAttribute('data-al-ptipo'); cfg.projTipos=cfg.projTipos||{};
    if(t.value) cfg.projTipos[k]=t.value; else delete cfg.projTipos[k];
    salvaCfg(); alocRedraw(); return; }
  if(t.matches('[data-pp-f]')){ const p=t.getAttribute('data-pp-f').split('|'); const pp=ppLista().find(x=>x.id===p[1]);
    if(pp){ if(p[0]==='skills') pp.skills=t.value.split(',').map(x=>x.trim()).filter(Boolean);
      else if(p[0]==='hSem'||p[0]==='custoH') pp[p[0]]=Math.max(0,Number(t.value)||0);
      else pp[p[0]]=t.value;
      salvaCfg(); } alocRedraw(); return; }
  if(t.matches('[data-al-relg]')){ (estado.alocacao.rel=estado.alocacao.rel||{}).grupo=t.value; alocRedraw(); return; }
  if(t.matches('[data-al-relini]')){ (estado.alocacao.rel=estado.alocacao.rel||{}).ini=t.value; alocRedraw(); return; }
  if(t.matches('[data-al-relfim]')){ (estado.alocacao.rel=estado.alocacao.rel||{}).fim=t.value; alocRedraw(); return; }
  if(t.matches('[data-al-custo]')){ const a=t.getAttribute('data-al-custo'); cfg.custosPessoa=cfg.custosPessoa||{};
    const v=Math.max(0,Number(t.value)||0); if(v) cfg.custosPessoa[a]=v; else delete cfg.custosPessoa[a];
    salvaCfg(); alocRedraw(); return; }
  if(t.matches('.al-skadd')){ const a=t.getAttribute('data-al-skadd'); const s=(t.value||'').trim();
    if(a&&s){ const cur=alocSkills(a); if(!cur.includes(s)) cur.push(s);
      alocSkillsSet(a, cur); t.value=''; alocRedraw(); } return; }
  if(t.matches('[data-sim-f]')){ simSync(); alocRedraw(); return; }
  if(t.matches('[data-find-f]')){ simFindSync(); alocRedraw(); return; }
  // Board por pessoa: campos referenciam a alocação por ID (um "change" tardio do DOM
  // antigo, disparado durante o re-render, no máximo regrava o mesmo valor — nunca a linha errada).
  if(t.matches('[data-ab-f]')){ const p=t.getAttribute('data-ab-f').split('|'); const a=alocRows().find(r=>r.id===p[1]);
    if(a){
      if(alocTravaBloqueia(a.accountId)){ alocRedraw(); return; }
      const antigo=a[p[0]]; a[p[0]]=t.value;
      if(p[0]==='accountId' && t.value && alocTravaBloqueia(t.value)){ a[p[0]]=antigo; alocRedraw(); return; }
      const cf=alocConflitoDe(alocRows(), a);
      if(cf){ a[p[0]]=antigo; alocAvisaConflito(cf); alocRedraw(); return; }
      alocPersiste();
    } alocRedraw(); return; }
  if(t.matches('[data-ab-pct]')){ const a=alocRows().find(r=>r.id===t.getAttribute('data-ab-pct'));
    if(a){ if(alocTravaBloqueia(a.accountId)){ alocRedraw(); return; }
      const pct=Math.max(0,Number(t.value)||0); a.hSemana=Math.round(pct/100*alocSemNomH(a.accountId)*2)/2; alocPersiste(); } alocRedraw(); return; }
  if(t.matches('[data-ab-addpessproj]')){ const k=t.getAttribute('data-ab-addpessproj'); const pid=t.value; if(!pid||!k) return;
    if(alocTravaBloqueia(pid)){ alocRedraw(); return; }
    const ini=semChave(hojeSP());
    const nova=Object.assign(alocNova(),{ accountId:pid, projeto:k, inicio:ini, fim:somaDias(ini,55), hSemana:Math.round(alocSemNomH(pid)*0.2) });
    const cf=alocConflitoDe(alocRows().concat([nova]), nova);
    if(cf){ alocAvisaConflito(cf); alocRedraw(); return; }
    alocRows().push(nova);
    alocPersiste(); alocRedraw(); return; }
  if(t.matches('[data-ab-addproj]')){ const pid=t.getAttribute('data-ab-addproj'); const k=t.value; if(!pid||!k) return;
    if(alocTravaBloqueia(pid)){ alocRedraw(); return; }
    const ini=semChave(hojeSP());
    const nova=Object.assign(alocNova(),{ accountId:pid, projeto:k, inicio:ini, fim:somaDias(ini,55), hSemana:Math.round(alocSemNomH(pid)*0.2) });
    const cf=alocConflitoDe(alocRows().concat([nova]), nova);
    if(cf){ alocAvisaConflito(cf); alocRedraw(); return; }
    alocRows().push(nova);
    estado.alocacao.pessNovas=(estado.alocacao.pessNovas||[]).filter(x=>x!==pid);
    alocPersiste(); alocRedraw(); return; }
  if(t.matches('[data-ab-pess]')){ const id=t.value; if(id && !(estado.alocacao.pessNovas||[]).includes(id)) estado.alocacao.pessNovas.push(id); alocRedraw(); return; } });
// ---- Gantt de alocação: arrastar para mover · puxar bordas para redimensionar (salva ao soltar) ----
let _gtDrag=null;
document.getElementById('conteudo').addEventListener('pointerdown', (e)=>{
  if(e.button!==undefined && e.button!==0) return;
  if(e.target.closest&&e.target.closest('.gt-dup')) return;   // duplicar não é arrastar
  const bar=e.target.closest&&e.target.closest('[data-gt-idx]'); if(!bar) return;
  const h=e.target.closest('[data-gt-h]'); const mode=h?('resize-'+h.getAttribute('data-gt-h')):'move';
  const rows=alocRows(); const idx=+bar.getAttribute('data-gt-idx'); const a=rows[idx]; if(!a) return;
  _gtDrag={ idx, mode, x0:e.clientX, D:gtZoom(), ini:a.inicio, fim:a.fim, w0:parseFloat(bar.style.width)||0, bar, dd:0, moved:false, travada:alocTravada(a.accountId) };
  bar.classList.add('dragging'); try{ bar.setPointerCapture(e.pointerId); }catch(_){}
  e.preventDefault();
});
document.addEventListener('pointermove', (e)=>{ const g=_gtDrag; if(!g) return;
  if(g.travada){ if(!g.avisou){ g.avisou=true; const a=alocRows()[g.idx]; if(a) alocTravaBloqueia(a.accountId); } return; }
  const dd=Math.round((e.clientX-g.x0)/g.D); if(dd!==g.dd) g.moved=true; g.dd=dd; const b=g.bar;
  if(g.mode==='move') b.style.transform=`translateX(${dd*g.D}px)`;
  else if(g.mode==='resize-r') b.style.width=Math.max(g.D, g.w0+dd*g.D)+'px';
  else if(g.mode==='resize-l'){ const nd=Math.min(dd, (g.w0/g.D)-1); b.style.transform=`translateX(${nd*g.D}px)`; b.style.width=Math.max(g.D, g.w0-nd*g.D)+'px'; }
  const nx=gtDatas(g.mode, g.ini, g.fim, dd); const inf=document.getElementById('gtInfo'); if(inf) inf.textContent=`${fmtBR(nx.ini)} – ${fmtBR(nx.fim)}`;
});
document.addEventListener('pointerup', (e)=>{ const g=_gtDrag; if(!g) return; _gtDrag=null;
  g.bar.classList.remove('dragging');
  if(g.moved && g.dd!==0){ const a=alocRows()[g.idx];
    if(a){
      if(alocTravaBloqueia(a.accountId)){ renderAlocacao(); return; }
      const nx=gtDatas(g.mode, g.ini, g.fim, g.dd); const antigo={i:a.inicio,f:a.fim};
      a.inicio=nx.ini; a.fim=nx.fim;
      const cf=alocConflitoDe(alocRows(), a);
      if(cf){ a.inicio=antigo.i; a.fim=antigo.f; alocAvisaConflito(cf); }
      else { alocPersiste(); toast('✓ Alocação atualizada e salva.','ok'); }
    }
    renderAlocacao();
  } else {
    g.bar.style.transform=''; const inf=document.getElementById('gtInfo'); if(inf) inf.textContent='';
    // Clique sem arrastar: abre os detalhes do projeto daquela barra.
    if(!g.moved){ const a=alocRows()[g.idx]; if(a) abreGtInfo(a); }
  }
});
// Painel ao CLICAR numa barra do Gantt: o projeto (nome, tipo herdado), a alocação
// clicada e o resumo do projeto no plano (equipe, horas e custo previsto).
function abreGtInfo(al){
  const pess=alocPessoas(); const nm=(id)=>(pess[id]&&pess[id].nome)||id;
  const k=al.projeto||'—';
  const pj=(_projetosCache||[]).find(p=>p.key===k);
  const tipo=alocTipoDe(al); const tipoL=((ALOC_TIPOS.find(([t])=>t===tipo))||[tipo,tipo])[1];
  const rows=alocRows().filter(x=>x.projeto===k && /^\d{4}-\d{2}-\d{2}$/.test(x.inicio) && /^\d{4}-\d{2}-\d{2}$/.test(x.fim));
  const per=alocPeriodo(rows);
  const semanas=rows.length?alocSemanas(rows).filter(w=>!per.fim||w<=semChave(per.fim)):[];
  let plan=0, custo=0, semCusto=false;
  semanas.forEach(w=>{ const wf=somaDias(w,6); rows.forEach(x=>{ if(x.inicio<=wf&&x.fim>=w){
    const h=Number(x.hSemana)||0; plan+=h; const c=alocCustoH(x.accountId);
    if(c>0) custo+=h*c; else if(x.accountId) semCusto=true; } }); });
  const equipe=rows.slice().sort((x,y)=>nm(x.accountId).localeCompare(nm(y.accountId),'pt')).map(x=>`
    <tr${x.id===al.id?' style="font-weight:700"':''}><td>${esc(nm(x.accountId))}${x.id===al.id?' ◄':''}</td><td>${esc(x.funcao||'—')}</td>
      <td>${esc(fmtBR(x.inicio))} – ${esc(fmtBR(x.fim))}</td>
      <td class="num">${alocH(Number(x.hSemana)||0)}/sem · ${alocPctDe(x.accountId,x.hSemana)}%</td></tr>`).join('');
  let url=''; try{ url=`${jiraBase()}/projects/${encodeURIComponent(k)}`; }catch(_){}
  abreModal(`
    <h2><i class="gt-dot gtc${gtCor(k)}"></i> ${esc(k)}${pj&&pj.nome?(' — '+esc(pj.nome)):''} <span>projeto na alocação</span></h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 4px">
      <span class="ab-tdot t-${escA(tipo)}"></span><strong>${esc(tipoL)}</strong>
      <span class="muted small">(tipo do projeto — aba Projetos)</span>
      ${url&&k!=='—'?`<span class="spacer"></span><a href="${escA(url)}" target="_blank" rel="noopener">abrir no Jira ↗</a>`:''}
    </div>
    <div class="pl-destino" style="margin:10px 0"><strong>Alocação clicada:</strong>
      ${esc(nm(al.accountId))}${al.funcao?` · ${esc(al.funcao)}`:''} ·
      ${esc(fmtBR(al.inicio))} – ${esc(fmtBR(al.fim))} · <strong>${alocH(Number(al.hSemana)||0)}/sem</strong>
      <span class="muted">(${alocPctDe(al.accountId,al.hSemana)}% da capacidade da pessoa)</span></div>
    <div class="muted small" style="font-weight:600;margin:12px 0 4px">Equipe do projeto
      <span class="muted" style="font-weight:400">(${rows.length} alocação(ões)${per.ini?` · ${esc(fmtBR(per.ini))} – ${esc(fmtBR(per.fim))}`:''})</span></div>
    <div class="pl-wrap"><table class="pl-tab"><thead><tr><th>Pessoa</th><th>Função</th><th>Período</th><th class="num">Alocação</th></tr></thead>
      <tbody>${equipe||'<tr><td colspan="4" class="muted small">—</td></tr>'}</tbody></table></div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px">
      <span><strong>${alocH(plan)}</strong> <span class="muted small">planejadas no horizonte do projeto</span></span>
      ${custo>0?`<span><strong>R$ ${Math.round(custo).toLocaleString('pt-BR')}</strong> <span class="muted small">custo previsto${semCusto?' (parcial — há gente sem custo/h)':''}</span></span>`:''}
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
      <button class="btn primario" data-gtinfo-filtrar="${escA(k)}">🔎 Filtrar este projeto na tela</button>
      <button class="btn" id="gtinfo-fechar">Fechar</button>
    </div>`);
}
// ---- Administração: cadastro de contratos ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-ir-admin')){ vaiPara('admin'); return; }
  if(t.id==='ad-salvar'){ salvaContrato(); }
  else if(t.id==='ad-cancelar'){ estado.admin.editId=null; renderAdmin(); }
  else if(t.hasAttribute('data-ad-edit')){ estado.admin.editId=t.getAttribute('data-ad-edit'); renderAdmin(); window.scrollTo({top:0,behavior:'smooth'}); }
  else if(t.hasAttribute('data-ad-del')){ const id=t.getAttribute('data-ad-del');
    cfg.contratos=(cfg.contratos||[]).filter(c=>c.id!==id); if(estado.admin.editId===id) estado.admin.editId=null; salvaCfg(); renderAdmin(); }
  else if(t.hasAttribute('data-ad-portal')||t.hasAttribute('data-ad-portal-novo')){
    const id=t.getAttribute('data-ad-portal')||t.getAttribute('data-ad-portal-novo');
    const c=(cfg.contratos||[]).find(x=>x.id===id);
    if(c){ c.portalToken='pt'+Date.now().toString(36)+Math.random().toString(36).slice(2,12); salvaCfg(); renderAdmin(); }
  }
  else if(t.hasAttribute('data-ad-portal-copy')){
    const url=t.getAttribute('data-ad-portal-copy');
    const done=()=>{ const o=t.textContent; t.textContent='copiado!'; setTimeout(()=>{ t.textContent=o; },1500); };
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(url).then(done).catch(()=>{
      const i=t.parentNode.querySelector('[data-ad-portal-input]'); if(i){ i.select(); document.execCommand('copy'); done(); } }); }
    else { const i=t.parentNode.querySelector('[data-ad-portal-input]'); if(i){ i.select(); document.execCommand('copy'); done(); } }
  }
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
// ⏰ Vencidos por projeto: Enter/Espaço abrem a linha (mesma ação do clique)
document.getElementById('conteudo').addEventListener('keydown',(e)=>{
  if(e.key!=='Enter'&&e.key!==' ') return;
  const r=e.target.closest&&e.target.closest('[data-vp-proj]');
  if(r){ e.preventDefault(); r.click(); }
});
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ fimTour(); fechaModal(); } });

// ---- Copiar/colar datas (estilo Monday/Asana) — vale em QUALQUER campo de data ----
// Ctrl/Cmd+C num campo de data copia a data; Ctrl/Cmd+V em outro cola e dispara o
// mesmo fluxo de um ajuste manual (salva na hora, ex.: board de alocação).
// Aceita 23/08/2026, 23/08/26, 23/08 (ano atual), 2026-08-23 e datas do Excel.
function dataDeTexto(txt){
  const s=String(txt||'').trim();
  let m=s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if(m) return validaIso(`${m[1]}-${m[2]}-${m[3]}`);
  m=s.match(/(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/);
  if(!m) return '';
  let d=+m[1], mo=+m[2];
  if(mo>12 && d<=12){ const t=d; d=mo; mo=t; }        // veio como mm/dd (Excel en-US)
  let ano=m[3] ? (m[3].length===2 ? 2000+ +m[3] : +m[3]) : +hojeSP().slice(0,4);
  if(d<1||d>31||mo<1||mo>12||ano<1990||ano>2100) return '';
  return validaIso(`${ano}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
}
// Garante que a data existe de verdade (31/02 etc. viram '').
function validaIso(iso){
  try{ return new Date(iso+'T00:00:00Z').toISOString().slice(0,10)===iso ? iso : ''; }catch(e){ return ''; }
}
const dataBR=(iso)=> iso ? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : '';
// Todas as datas reconhecidas num texto (para colar um PERÍODO inteiro de uma vez).
function datasDeTexto(txt){
  const out=[]; const re=/\d{4}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?/g;
  const s=String(txt||''); let m;
  while((m=re.exec(s)) && out.length<4){ const iso=dataDeTexto(m[0]); if(iso) out.push(iso); }
  return out;
}
document.addEventListener('paste', (e)=>{
  const t=(e.target&&e.target.tagName==='INPUT')?e.target:document.activeElement;
  if(!t||t.tagName!=='INPUT'||t.type!=='date'||t.disabled||t.readOnly) return;
  const txt=(e.clipboardData&&e.clipboardData.getData)?e.clipboardData.getData('text'):'';
  e.preventDefault();
  const todas=datasDeTexto(txt);
  // Período completo ("29/06/2026 – 23/08/2026") colado num campo do board de alocação:
  // preenche início E fim da linha de uma vez (e salva, como uma edição manual).
  if(todas.length>=2 && t.hasAttribute('data-ab-f')){
    const id=t.getAttribute('data-ab-f').split('|')[1];
    const a=(typeof alocRows==='function')?alocRows().find(r=>r.id===id):null;
    if(a){
      if(alocTravaBloqueia(a.accountId)) return;
      const par=todas.slice(0,2).sort(); const antigo={i:a.inicio,f:a.fim};
      a.inicio=par[0]; a.fim=par[1];
      const cf=alocConflitoDe(alocRows(), a);
      if(cf){ a.inicio=antigo.i; a.fim=antigo.f; alocAvisaConflito(cf); return; }
      alocPersiste(); alocRedraw();
      try{ toast('📋 Período '+dataBR(par[0])+' – '+dataBR(par[1])+' colado'); }catch(_){}
      return; }
  }
  const iso=todas[0]||'';
  if(!iso){ try{ toast('Não entendi a data colada — use 23/08/2026 ou 2026-08-23.','warn'); }catch(_){} return; }
  if(t.value===iso) return;
  t.value=iso;
  t.dispatchEvent(new Event('change',{bubbles:true}));
  try{ toast('📋 '+dataBR(iso)+' colada'); }catch(_){}
});
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

// ---- Tela Apontar: cliques (chips, KPIs-filtro, identidade, enviar) ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  // Filtro de exibição: serve para os chips E para os cards de KPI do topo.
  const fl=e.target.closest && e.target.closest('[data-ap-fil]');
  if(fl){ escondeTip(); const v=fl.getAttribute('data-ap-fil'); estado.apontar.fil=v;
    if(v==='semvenc' && !estado.apontar.semVenc) estado.apontar.semVenc=true;   // precisa carregar os sem-data
    renderApontar(); estadoParaURL(); return; }
  const t=e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-ap-ate')){ estado.apontar.ate=t.getAttribute('data-ap-ate'); renderApontar(); estadoParaURL(); }
  else if(t.hasAttribute('data-ap-chip')){ const row=t.closest('.ap-row');
    const inp=row&&row.querySelector('.ap-tempo'); if(inp){ inp.value=t.getAttribute('data-ap-chip'); inp.focus(); } }
  else if(t.hasAttribute('data-ap-key')){ fazApontamento(t); }
  else if(t.hasAttribute('data-ap-st')){ escondeTip(); toggleTransicoes(t); }
  else if(t.hasAttribute('data-ap-trans')){ escondeTip(); executaTransicao(t); }
  else if(t.hasAttribute('data-ap-venc')){ escondeTip(); toggleReagendar(t); }
  else if(t.hasAttribute('data-ap-reag')){ escondeTip(); executaReagendar(t); }
  else if(t.hasAttribute('data-ap-resp')){ escondeTip(); toggleTransferir(t); }
  else if(t.hasAttribute('data-ap-resp-do')){ executaTransferir(t); }
  else if(t.hasAttribute('data-ap-coment')){ escondeTip(); toggleComentar(t); }
  else if(t.hasAttribute('data-ap-conv')){ escondeTip(); abreConvidarApontar(t.getAttribute('data-ap-conv')); }
  else if(t.id==='qk-criar'){ qkCria(); }
  else if(t.id==='qk-mic'){ qkMic(); }
  else if(t.id==='qk-siri'){ qkSiriModal(); }
  else if(t.hasAttribute('data-ap-coment-do')){ executaComentar(t); }
  // ---- ⏱ Meu timesheet (grade × calendário, navegação de semana, recolher projeto) ----
  else if(t.hasAttribute('data-mts-modo')){ mtsEstado().mtsModo=t.getAttribute('data-mts-modo'); escondeTip(); atualizaPainelHoras(); }
  else if(t.hasAttribute('data-mts-nav')){ const ap=mtsEstado(); const n=+t.getAttribute('data-mts-nav');
    ap.mtsSem=n===0?mtsSegunda(hojeSP()):mtsSoma(ap.mtsSem, n*7); escondeTip(); atualizaPainelHoras(); }
  else if(t.hasAttribute('data-mts-proj')){ const ap=mtsEstado(); const p=t.getAttribute('data-mts-proj');
    ap.mtsFech[p]=!ap.mtsFech[p]; escondeTip(); atualizaPainelHoras(); }
  else if(t.hasAttribute('data-ap-mover')){ escondeTip(); toggleReclass(t); }
  else if(t.hasAttribute('data-ap-mover-do')){ executaReclass(t); }
  else if(t.hasAttribute('data-ap-projtoggle')){ escondeTip(); const pk=t.getAttribute('data-ap-projtoggle');
    estado.apontar.recolhidos[pk]=!estado.apontar.recolhidos[pk]; renderApontar(); }
  else if(t.hasAttribute('data-ap-vis')){ estado.apontar.vis=t.getAttribute('data-ap-vis'); renderApontar(); estadoParaURL(); }
  else if(t.id==='ap-expandir'){ estado.apontar.recolhidos={}; renderApontar(); }
  else if(t.id==='ap-recolher'){ const r={};
    [...document.querySelectorAll('[data-ap-projtoggle]')].forEach(b=>{ r[b.getAttribute('data-ap-projtoggle')]=true; });
    estado.apontar.recolhidos=r; renderApontar(); }
  else if(t.getAttribute('data-ap-act')==='grupo'){ escondeTip(); abreReuniaoGrupo(''); }
  else if(t.getAttribute('data-ap-act')==='rateio'){ escondeTip(); vaiPara('rateio'); }
  else if(t.hasAttribute('data-ap-grupo')){ escondeTip(); abreReuniaoGrupo(t.getAttribute('data-ap-grupo')); }
  else if(t.hasAttribute('data-ap-vinc')){ escondeTip(); abreRvWizard(t.getAttribute('data-ap-vinc')); }
  else if(t.hasAttribute('data-cv-conf')){ respondeConvite(t,false); }
  else if(t.hasAttribute('data-cv-rec')){ escondeTip(); respondeConvite(t,true); }
  else if(t.id==='cv-todos'){ confirmaTodosConvites(t); }
  else if(t.getAttribute('data-ap-act')==='config-id'||t.getAttribute('data-ap-act')==='trocar-id'){ abreIdentidade(); }
  else if(t.id==='ap-refresh'){ t.disabled=true; t.textContent='Atualizando…';
    estado.apontar.recentes=null;                       // recarrega também os recentes
    carregaVenc(estado.apontar.ate,true)
      .then(()=>{ if(estado.vista==='apontar') renderApontar(); })
      .catch(()=>{ t.disabled=false; t.textContent='Atualizar lista'; }); }
  else if(t.id==='ap-rec-toggle'){ estado.apontar.recFechado=!estado.apontar.recFechado; renderApontar(); }
});
// ---- Tela Planejar: cliques e edições ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const t=e.target.closest('button'); if(!t) return;
  const pl=estado.planejar;
  if(t.hasAttribute('data-pl-modo')){ pl.modo=t.getAttribute('data-pl-modo'); pl.epicoKey=''; pl.historiaKey=''; ajustaTipo(); renderPlanejar(); }
  else if(t.hasAttribute('data-pl-hist')){ const k=t.getAttribute('data-pl-hist');
    pl.historiaKey=(pl.historiaKey===k?'':k); ajustaTipo(); renderPlanejar(); }
  else if(t.id==='pl-tentar'){ pl.projetosErro=''; renderPlanejar(); }
  else if(t.id==='pl-validar'){
    const fb=document.getElementById('pl-fb');
    const mostra=(m)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=m; } };
    if(!pl.projeto) return mostra('Escolha o projeto.');
    if(!pl.tipoId) return mostra('Escolha o tipo de ticket.');
    const itens=montaItens();
    if(!itens.length) return mostra('Digite pelo menos um ticket (uma linha por ticket).');
    if(itens.length>100) return mostra(`São ${itens.length} linhas — o máximo é 100 por lote.`);
    pl.itens=itens; renderPlanejar();
  }
  else if(t.id==='pl-importar'){
    const fb=document.getElementById('pl-fb');
    if(!pl.projeto||!pl.tipoId){ if(fb){ fb.hidden=false; fb.className='ap-fb err';
      fb.textContent='Escolha o projeto e o tipo de ticket antes de colar a planilha.'; } return; }
    abreImportar();
  }
  else if(t.id==='pl-modelo'){ baixaModeloPlanejar(); }
  else if(t.id==='pl-voltar'){ pl.itens=null; renderPlanejar(); }
  else if(t.id==='pl-criar'){ criaLote(); }
  else if(t.hasAttribute('data-pl-del')){ pl.itens.splice(Number(t.getAttribute('data-pl-del')),1);
    if(!pl.itens.length) pl.itens=null; renderPlanejar(); }
  else if(t.id==='pl-novo'){ pl.resultados=null; pl.grade=null; pl.texto=''; pl.textoEstr=''; renderPlanejar(); }
  // ---- 📐 Colar estrutura ----
  else if(t.id==='pl-estr-validar'){
    const fb=document.getElementById('pl-fb');
    const mostra=(m)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=m; } };
    if(!pl.projeto) return mostra('Escolha o projeto.');
    const its=parseEstrutura(pl.textoEstr);
    if(!its.length) return mostra('Cole a estrutura (uma linha por item: nível + título).');
    if(its.length>100) return mostra(`São ${its.length} itens — o máximo é 100 por lote.`);
    pl.estru=its; renderPlanejar();
  }
  else if(t.id==='pl-estr-voltar'){ pl.estru=null; renderPlanejar(); }
  else if(t.id==='pl-estr-criar'){ criaEstrutura(); }
  else if(t.hasAttribute('data-pl-estr-del')){ estruRemove(Number(t.getAttribute('data-pl-estr-del'))); renderPlanejar(); }
  // ---- Grade pós-criação (edição em massa) ----
  else if(t.id==='pl-g-apl-resp'){
    const v=(document.getElementById('pl-g-bresp')||{}).value||'';
    if(!v) return;
    (pl.grade||[]).forEach(x=>{ if(x.sel){ x.respId=(v==='__rem'?'':v); x.st=''; } });
    renderPlanejar();
  }
  else if(t.id==='pl-g-apl-venc'){
    const v=(document.getElementById('pl-g-bvenc')||{}).value||'';
    (pl.grade||[]).forEach(x=>{ if(x.sel){ x.venc=v; x.st=''; } });
    renderPlanejar();
  }
  else if(t.id==='pl-g-salvar'){ salvaGrade(); }
  else if(t.id==='pl-tpl-salvar'){ abreSalvarTemplatePl(); }
  else if(t.id==='pl-tpl-del'){ excluiTemplatePl(); }
  else if(t.hasAttribute('data-arv-op')){ const a=arvEstado(); const no=ARV_NOS[a.no];
    const o=no&&no.op&&no.op[+t.getAttribute('data-arv-op')];
    if(o){ a.hist.push({id:a.no,label:o.label}); a.no=o.next; a.erro='';
      if(o.set) Object.assign(a.form, o.set);   // a opção pode gravar campos (ex.: frequência da rotina)
      // ENTRAR numa folha reaplica as sugestões DELA (senão, ao voltar e escolher
      // outro departamento/contexto, projeto/departamento antigos ficavam grudados).
      const prox=ARV_NOS[o.next];
      if(prox && prox.result && (prox.cria||prox.planejados)){
        const ps=(_projetosCache||[]);
        let sug=arvProjetosSugeridos(prox.filtro||'', prox.catRe);
        const fixo=prox.filtro==='avulsa'?'TAD':(prox.soProjeto||'');
        if(fixo){ const px=ps.find(p=>p.key===fixo)||sug[0]; sug=px?[px]:[]; }
        // Folhas com escolha explícita (cards) começam SEM projeto — a pessoa escolhe.
        a.form.projeto=prox.escolheProjeto?'':((sug[0]&&sug[0].key)||'');
        a.form.tipoId=''; a.form.epicoKey=''; a.form.amsConsId=''; a.form.amsCliId='';
        a.form.depto=prox.depto||(prox.filtro==='avulsa'?'':a.form.depto);
      }
      arvRender(); } }
  else if(t.hasAttribute('data-arv-proj')){ const a=arvEstado();
    a.form.projeto=t.getAttribute('data-arv-proj')||''; a.form.tipoId=''; a.erro=''; arvRender(); }
  else if(t.hasAttribute('data-arv-trocaproj')){ const a=arvEstado();
    a.form.projeto=''; a.form.tipoId=''; a.erro=''; arvRender(); }
  else if(t.hasAttribute('data-arv-voltar')){ const a=arvEstado();
    const ant=a.hist.pop(); a.no=ant?ant.id:'start'; a.erro=''; a.feito=null; arvRender(); }
  else if(t.hasAttribute('data-arv-bc')){ const a=arvEstado(); const i=+t.getAttribute('data-arv-bc');
    if(i<0){ a.no='start'; a.hist=[]; } else if(a.hist[i]){ a.no=a.hist[i].id; a.hist=a.hist.slice(0,i); }
    a.erro=''; a.feito=null; arvRender(); }
  else if(t.hasAttribute('data-arv-reiniciar')){ estado.planejar.arv=null; arvEstado(); arvRender(); }
  else if(t.hasAttribute('data-arv-criar')){ arvCria(); }
  else if(t.hasAttribute('data-arv-aus')){ abreAusencia(t.getAttribute('data-arv-aus')); }
});
document.getElementById('conteudo').addEventListener('change', (e)=>{
  const pl=estado.planejar; const t=e.target; if(!t||!t.id&&!t.className) return;
  if(t.id==='pl-projeto'){ pl.projeto=t.value; pl.epicoKey=''; pl.historiaKey=''; ajustaTipo(); renderPlanejar(); }
  else if(t.id==='pl-tipo'){ pl.tipoId=t.value; }
  else if(t.id==='pl-resp'){ pl.respId=t.value; }
  else if(t.id==='pl-est'){ pl.est=t.value; }
  else if(t.id==='pl-labels'){ pl.labels=t.value; }
  else if(t.id==='pl-venc'){ pl.venc=t.value; }
  else if(t.id==='pl-tpl'){ aplicaTemplatePl(t.value); }
  else if(t.hasAttribute&&t.hasAttribute('data-arv-f')){ const a=arvEstado(); const c=t.getAttribute('data-arv-f');
    a.form[c]=t.value;
    if(c==='projeto'){ a.form.tipoId=''; a.form.epicoKey=''; a.form.amsConsId=''; a.form.amsCliId=''; arvRender(); }
    else if(c==='amsConsId'){ a.form.amsCliId=''; arvRender(); } }
  else if(t.id==='pl-epico'){ pl.epicoKey=t.value; pl.historiaKey=''; ajustaTipo(); renderPlanejar(); }
  else if(t.id==='pl-historia'){ pl.historiaKey=t.value; ajustaTipo(); renderPlanejar(); }
  else if(t.classList&&t.classList.contains('pl-resumo')){ const i=+t.getAttribute('data-pl-i');
    if(pl.itens&&pl.itens[i]){ pl.itens[i].resumo=t.value; renderPlanejar(); } }
  else if(t.classList&&t.classList.contains('pl-desc')){ const i=+t.getAttribute('data-pl-i');
    if(pl.itens&&pl.itens[i]) pl.itens[i].descricao=t.value; }
  else if(t.classList&&t.classList.contains('pl-tipo-row')){ const i=+t.getAttribute('data-pl-i');
    if(pl.itens&&pl.itens[i]) pl.itens[i].tipoId=t.value; }
  else if(t.classList&&t.classList.contains('pl-resp-row')){ const i=+t.getAttribute('data-pl-i');
    if(pl.itens&&pl.itens[i]) pl.itens[i].respId=t.value; }
  // ---- 📐 Colar estrutura + grade de edição em massa ----
  else if(t.hasAttribute&&t.hasAttribute('data-pl-slot')){ pl.tiposSlot[t.getAttribute('data-pl-slot')]=t.value; renderPlanejar(); }
  else if(t.classList&&t.classList.contains('pl-estr-tit')){ const i=+t.getAttribute('data-pl-i');
    if(pl.estru&&pl.estru[i]){ const it=pl.estru[i]; it.titulo=t.value.trim();
      if(it.nivel>0){ it.erro=!it.titulo?'Título vazio.':(it.titulo.length>255?`Título com ${it.titulo.length} caracteres (máx. 255).`:''); }
      renderPlanejar(); } }
  else if(t.classList&&t.classList.contains('pl-g-sel')){ const i=+t.getAttribute('data-pl-i');
    if(pl.grade&&pl.grade[i]){ pl.grade[i].sel=t.checked; renderPlanejar(); } }
  else if(t.id==='pl-g-all'){ const v=t.checked; (pl.grade||[]).forEach(x=>{ x.sel=v; }); renderPlanejar(); }
  else if(t.classList&&t.classList.contains('pl-g-resp')){ const i=+t.getAttribute('data-pl-i');
    if(pl.grade&&pl.grade[i]){ pl.grade[i].respId=t.value; pl.grade[i].st=''; renderPlanejar(); } }
  else if(t.classList&&t.classList.contains('pl-g-venc')){ const i=+t.getAttribute('data-pl-i');
    if(pl.grade&&pl.grade[i]){ pl.grade[i].venc=t.value; pl.grade[i].st=''; renderPlanejar(); } }
  else if(t.id==='pl-g-bresp'){ pl.gbResp=t.value; }
  else if(t.id==='pl-g-bvenc'){ pl.gbVenc=t.value; }
});
// O texto do lote não re-renderiza a cada tecla — só guarda e atualiza o contador.
document.getElementById('conteudo').addEventListener('input', (e)=>{
  if(e.target && e.target.id==='pl-texto'){
    estado.planejar.texto=e.target.value;
    const c=document.getElementById('pl-contador');
    if(c) c.textContent=String(e.target.value.split('\n').map(l=>l.trim()).filter(Boolean).length);
  }
  if(e.target && e.target.id==='pl-texto-estr'){
    estado.planejar.textoEstr=e.target.value;
    const c=document.getElementById('pl-estr-cont');
    if(c) c.textContent=String(e.target.value.split('\n').map(l=>l.trim()).filter(Boolean).length);
  }
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
// Fim da composição (acento confirmado): dispara o fluxo normal da busca.
document.getElementById('conteudo').addEventListener('compositionend',(e)=>{
  const id2=e.target&&e.target.id;
  if(id2==='ap-busca'||id2==='gx-busca'||id2==='rc-busca'){
    setTimeout(()=>{ if(e.target&&e.target.isConnected) e.target.dispatchEvent(new Event('input',{bubbles:true})); },0);
  }
});
// Busca da tela Apontar (mantém o foco ao re-renderizar).
document.getElementById('conteudo').addEventListener('input', (e)=>{
  if(e.target && e.target.id==='ap-busca'){
    buscaComposta(e,(v)=>{ estado.apontar.busca=v; },renderApontar,'ap-busca');
  }
});
// Enter no campo de tempo/comentário envia o apontamento da linha.
document.getElementById('conteudo').addEventListener('keydown', (e)=>{
  if(e.key!=='Enter'||!e.target.classList) return;
  if(e.target.classList.contains('ap-tempo')||e.target.classList.contains('ap-coment')){
    const row=e.target.closest('.ap-row'); const b=row&&row.querySelector('[data-ap-key]');
    if(b){ e.preventDefault(); fazApontamento(b); }
  }
});

// Ações dentro do painel de Metas (delegação no corpo do modal).
// Links "abrir tela" da lista TODAS as telas (❓ Ajuda) — fecham o modal e navegam.
document.getElementById('modal-body').addEventListener('click',(e)=>{
  // 🧭 "guia" tem prioridade sobre "abrir tela" (o botão vive dentro do item da lista).
  const gu=e.target.closest&&e.target.closest('[data-aj-guia]');
  if(gu){ e.stopPropagation(); iniciaGuia(gu.getAttribute('data-aj-guia')); return; }
  const g=e.target.closest&&e.target.closest('[data-aj-goto]'); if(!g) return;
  fechaModal(); vaiPara(g.getAttribute('data-aj-goto'));
});
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
      salvaCfg(); estado.cache={}; recarrega(); abreMetas(); }
    else toast('Escolha a pessoa e informe pelo menos uma das datas.','warn'); }
  else if(t.hasAttribute('data-del-vig')){ delete (cfg.vigencias||{})[t.getAttribute('data-del-vig')];
    salvaCfg(); estado.cache={}; recarrega(); abreMetas(); }
  else if(t.id==='mt-add-oculto'){ const a=val('mt-oc-pessoa');
    if(a){ const nome=(pessoasUnidas()[a]&&pessoasUnidas()[a].nome)||a; cfg.ocultos=cfg.ocultos||[];
      if(!cfg.ocultos.some(o=>o.a===a)) cfg.ocultos.push({a,nome});
      salvaCfg(); estado.cache={}; recarrega(); abreMetas(); } }
  else if(t.hasAttribute('data-del-oculto')){ cfg.ocultos.splice(Number(t.getAttribute('data-del-oculto')),1);
    salvaCfg(); estado.cache={}; recarrega(); abreMetas(); }
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
