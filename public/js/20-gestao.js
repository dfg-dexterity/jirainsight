// Jira Insights · 20 · 🧰 GESTÃO DE TICKETS — lista/quadro, filtros salvos, agrupar, ações em massa
// (comentar, status, excluir, apontar, épicos, duplicados), ficha do ticket (modal) e renderGestao.
// ============== GESTÃO DE TICKETS (Operação): seleção múltipla + ações em massa ==============
function carregaGestao(forca){
  const g=estado.gestao; if(!g.ate) g.ate=somaDias(hojeSP(),30);
  g.carregando=true; g.erro='';
  fetch(`/api/vencimentos?ate=${encodeURIComponent(g.ate)}&incluirSemVenc=1${forca?'&nocache=1':''}`)
    .then(r=>r.json()).then(j=>{ g.carregando=false;
      if(j.erro){ g.erro=j.erro; } else { g.dados=j; }
      if(estado.vista==='gestao') renderGestao();
    }).catch(e=>{ g.carregando=false; g.erro=String(e.message||e); if(estado.vista==='gestao') renderGestao(); });
}
// ---- Risco do ticket (0–100): atraso, falta de atualização, prioridade, estouro de estimativa, sem responsável ----
function gxAtrasoDias(t,hoje){ return (t.venc&&t.venc<hoje)? Math.max(1,Math.round((new Date(hoje)-new Date(t.venc))/86400000)) : 0; }
function gxDiasSemAtu(t,hoje){ const up=(t.up||'').slice(0,10); if(!up) return 999;
  return Math.max(0,Math.round((new Date(hoje)-new Date(up))/86400000)); }
function gxRisco(t,hoje){
  let sc=0; const atraso=gxAtrasoDias(t,hoje);
  if(atraso>0) sc+=25+Math.min(25,Math.round(atraso*2.5));
  // "Sem atualização" só pesa quando o ticket está em curso (sem vencimento ou
  // vencendo/vencido) — item AGENDADO para o futuro não é cobrado por silêncio.
  const emCurso=!t.venc || t.venc<=hoje;
  const dU=gxDiasSemAtu(t,hoje); if(emCurso && dU>5) sc+=Math.min(20,(dU-5)*2+8);
  if(/highest|urgent|cr[ií]tic|blocker/i.test(t.prio||'')) sc+=15; else if(/\bhigh\b|alta/i.test(t.prio||'')) sc+=8;
  if(t.est>0 && t.seg>t.est) sc+=15;
  if(!t.respId) sc+=10;
  sc=Math.min(100,sc);
  return { s:sc, rot: sc>=70?'Crítico': sc>=45?'Alto': sc>=20?'Médio':'Baixo',
           cls: sc>=70?'crit': sc>=45?'aten': sc>=20?'med':'disp' };
}
const GX_PRESETS=[['atrasados','Atrasados'],['hoje','Vencem hoje'],['sematu','Sem atualização >5d'],
  ['semresp','Sem responsável'],['semvenc','Sem vencimento'],['cliente','Aguardando cliente'],['risco','Risco alto/crítico']];
function gxLista(){
  const g=estado.gestao; const hoje=hojeSP(); let l=((g.dados&&g.dados.tickets)||[]).slice();
  if(Array.isArray(g.soKeys)&&g.soKeys.length){ const ks=new Set(g.soKeys); l=l.filter(t=>ks.has(t.k)); }
  if(g.fProj) l=l.filter(t=>t.p===g.fProj);
  if(g.fResp==='__sem__') l=l.filter(t=>!t.respId); else if(g.fResp) l=l.filter(t=>t.respId===g.fResp);
  if(g.fStatus) l=l.filter(t=>t.status===g.fStatus);
  if(g.busca){ const q=g.busca.toLowerCase(); l=l.filter(t=>(t.k+' '+t.resumo+' '+t.status+' '+(t.resp||'')).toLowerCase().includes(q)); }
  if(g.preset==='atrasados') l=l.filter(t=>t.venc&&t.venc<hoje);
  else if(g.preset==='hoje') l=l.filter(t=>t.venc===hoje);
  else if(g.preset==='sematu') l=l.filter(t=>(!t.venc||t.venc<=hoje) && gxDiasSemAtu(t,hoje)>5);
  else if(g.preset==='semresp') l=l.filter(t=>!t.respId);
  else if(g.preset==='semvenc') l=l.filter(t=>!t.venc);
  else if(g.preset==='cliente') l=l.filter(t=>/aguard|pendente.*client|waiting/i.test(t.status||''));
  else if(g.preset==='risco') l=l.filter(t=>gxRisco(t,hoje).s>=45);
  if(g.semTrat) l=l.filter(t=>!(cfg.tratados||{})[t.k]);
  const ord=g.ord||'risco';
  if(ord==='risco') l.sort((x,y)=>gxRisco(y,hoje).s-gxRisco(x,hoje).s);
  else if(ord==='venc') l.sort((x,y)=>((x.venc||'9999-99-99').localeCompare(y.venc||'9999-99-99')));
  else if(ord==='atual') l.sort((x,y)=>((x.up||'').localeCompare(y.up||'')));
  return l;
}
function gxSelKeys(){ const g=estado.gestao; return Object.keys(g.sel).filter(k=>g.sel[k]); }

// ---- ⭐ Filtros salvos da Gestão — compartilhados com o time (cfg remota) e por link ----
// 🔄 dinâmico = guarda os CRITÉRIOS (o resultado acompanha o Jira a cada carga);
// 📌 estático = congela a LISTA de chaves exatamente como está (soKeys).
function gxfLista(){ return Array.isArray(cfg.gxFiltros)?cfg.gxFiltros:[]; }
function gxfCodifica(f){ try{ return btoa(unescape(encodeURIComponent(JSON.stringify(f)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }catch(e){ return ''; } }
function gxfDecodifica(s){ try{ s=String(s||'').replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4) s+='=';
  return JSON.parse(decodeURIComponent(escape(atob(s)))); }catch(e){ return null; } }
function gxfCriteriosAtuais(){ const g=estado.gestao;
  return {preset:g.preset||'',busca:g.busca||'',fProj:g.fProj||'',fResp:g.fResp||'',fStatus:g.fStatus||'',
    semTrat:!!g.semTrat,agrupar:g.agrupar||'',vis:g.vis||'tabela'}; }
function gxfAplica(f,viaLink){ const g=estado.gestao; if(!f) return;
  if(f.tipo==='estatico'){ g.soKeys=(f.keys||[]).slice(); g.origem=`⭐ ${f.nome||'filtro'} (estático${viaLink?' · via link':''})`;
    g.preset='';g.busca='';g.fProj='';g.fResp='';g.fStatus='';g.semTrat=false; }
  else { const c=f.f||{}; g.soKeys=null; g.origem=viaLink?`⭐ ${f.nome||'filtro'} (via link)`:'';
    g.preset=c.preset||''; g.busca=c.busca||''; g.fProj=c.fProj||''; g.fResp=c.fResp||''; g.fStatus=c.fStatus||'';
    g.semTrat=!!c.semTrat; g.agrupar=c.agrupar||''; if(c.vis) g.vis=c.vis; }
  g.sel={}; renderGestao(); }
function gxfLinkDe(f){ return `${location.origin}${location.pathname}?v=gestao&gxf=${gxfCodifica(f)}`; }
function gxfCopiaLink(f){ const url=gxfLinkDe(f);
  const fb=document.getElementById('gxf-g-fb');
  const mostra=()=>{ if(fb){ fb.hidden=false; fb.className='ap-fb';
    fb.innerHTML=`Link do filtro <b>${esc(f.nome)}</b> (selecione e copie): <input type="text" readonly value="${escA(url)}" style="width:100%;margin-top:4px" onclick="this.select()">`; } };
  if(navigator.clipboard&&navigator.clipboard.writeText)
    navigator.clipboard.writeText(url).then(()=>toast('🔗 Link copiado — cole no Teams para compartilhar.','ok')).catch(mostra);
  else mostra(); }
function gxfCopiaLinkAtual(){ estadoParaURL(); const url=location.href;
  if(navigator.clipboard&&navigator.clipboard.writeText)
    navigator.clipboard.writeText(url).then(()=>toast('🔗 Link desta visão copiado — quem abrir vê os mesmos filtros.','ok')).catch(()=>prompt('Copie o link:',url));
  else prompt('Copie o link:',url); }
function abreModalFiltroSalvar(){ const g=estado.gestao; const nSel=gxSelKeys().length;
  const temFixo=nSel||(g.soKeys&&g.soKeys.length);
  abreModal(`<h2>💾 Salvar filtro da Gestão</h2>
    <div class="muted small">O filtro fica visível para o <b>time todo</b> nesta tela — e tem um 🔗 link para compartilhar direto.</div>
    <div class="alx-campo"><label>Nome <span class="req">*</span></label>
      <input type="text" id="gxf-nome" class="alx-motivo" maxlength="60" placeholder="ex.: Vencidos AMS sem tratamento"></div>
    <div class="alx-campo"><label>Tipo</label>
      <label style="display:block;margin-top:4px;cursor:pointer"><input type="radio" name="gxf-tipo" value="dinamico" checked>
        🔄 <b>Dinâmico</b> — guarda os critérios atuais (busca, projeto, responsável, status, preset, agrupamento); o resultado <b>acompanha o Jira</b>.</label>
      <label style="display:block;margin-top:4px;cursor:${temFixo?'pointer':'not-allowed'}"><input type="radio" name="gxf-tipo" value="estatico" ${temFixo?'':'disabled'}>
        📌 <b>Estático</b> — congela a lista ${nSel?`dos ${nSel} selecionados`:(g.soKeys&&g.soKeys.length?`atual (${g.soKeys.length} tickets)`:'(selecione tickets antes)')} exatamente como está.</label></div>
    <div class="alx-fb" id="gxf-fb" hidden></div>
    <div class="alx-modal-acoes"><button class="btn primario" id="gxf-salvar">Salvar</button>
      <button class="btn" id="gx-fechar">Cancelar</button></div>`); }
function gxfSalva(){ const nome=((document.getElementById('gxf-nome')||{}).value||'').trim();
  const fb=document.getElementById('gxf-fb');
  const erroFb=(m)=>{ if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb erro'; fb.textContent=m; } };
  const tipo=(document.querySelector('input[name="gxf-tipo"]:checked')||{}).value||'dinamico';
  if(!nome) return erroFb('Dê um nome ao filtro.');
  const g=estado.gestao; const quem=(idApontar()||{}).nome||'';
  const f={id:'f'+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36), nome, tipo, por:quem, em:hojeSP()};
  if(tipo==='estatico'){ const ks=gxSelKeys(); f.keys=ks.length?ks:(g.soKeys||[]).slice();
    if(!f.keys.length) return erroFb('Selecione tickets (ou aplique uma lista por chaves) para congelar.'); }
  else f.f=gxfCriteriosAtuais();
  cfg.gxFiltros=gxfLista().concat([f]); salvaCfg();
  fechaModal(); toast(`✓ Filtro "${nome}" salvo — visível para o time.`,'ok'); renderGestao(); }
function abreModalFiltrosGerir(){ const fs=gxfLista();
  abreModal(`<h2>⭐ Filtros salvos da Gestão</h2>
    ${fs.length?'<div class="muted small">Aplicar abre o filtro nesta tela; 🔗 link copia o endereço para mandar a alguém (abre a Gestão já filtrada).</div>':'<div class="muted small">Nenhum filtro salvo ainda — monte os filtros e use <b>💾 Salvar filtro</b>.</div>'}
    <div class="nov-lista">${fs.map(f=>`<div class="nov-item" style="align-items:center">
      <span class="nov-txt" style="flex:1"><b>${f.tipo==='estatico'?'📌':'🔄'} ${esc(f.nome)}</b>
        <span class="muted small">· ${f.tipo==='estatico'?`${(f.keys||[]).length} tickets congelados`:'critérios dinâmicos'}${f.por?` · por ${esc(f.por)}`:''}${f.em?` · ${esc(alxDataBR(f.em))}`:''}</span></span>
      <span style="display:flex;gap:6px;flex:0 0 auto">
        <button class="btn" data-gxf-apl="${escA(f.id)}">Aplicar</button>
        <button class="btn" data-gxf-link="${escA(f.id)}" title="Copiar o link deste filtro">🔗 link</button>
        <button class="btn" data-gxf-del="${escA(f.id)}" title="Excluir este filtro salvo (para todo o time)">✕</button></span></div>`).join('')}</div>
    <div class="ap-fb" id="gxf-g-fb" hidden style="margin-top:8px"></div>
    <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`); }
// ---- Agrupamento da Gestão: pessoa, projeto, tipo, status, prioridade, épico, vencimento, risco ----
const GX_AGRUPAR=[['','sem agrupamento'],['resp','responsável'],['proj','projeto'],['tipo','tipo'],
  ['status','status'],['prio','prioridade'],['epico','épico'],['venc','vencimento'],['risco','risco']];
function gxGrupoDe(t, hoje){
  const g=estado.gestao;
  switch(g.agrupar){
    case 'resp': return { k:t.respId||'__sem__', rot:t.resp||'👤 sem responsável' };
    case 'proj': return { k:t.p||'—', rot:alxProjNome(t.p) };
    case 'tipo': return { k:t.t||'—', rot:t.t||'—' };
    case 'status': return { k:t.status||'—', rot:t.status||'—' };
    case 'prio': return { k:t.prio||'__sem__', rot:t.prio||'sem prioridade' };
    case 'epico': return { k:t.pai||'__sem__', rot:t.pai?`🧩 ${t.pai}`:'sem épico' };
    case 'venc':{
      if(!t.venc) return { k:'5-sem', rot:'sem vencimento' };
      if(t.venc<hoje) return { k:'1-atras', rot:'⚠ vencidos' };
      if(t.venc===hoje) return { k:'2-hoje', rot:'📅 vencem hoje' };
      if(t.venc<=somaDias(hoje,7)) return { k:'3-semana', rot:'próximos 7 dias' };
      return { k:'4-depois', rot:'depois de 7 dias' };
    }
    case 'risco':{ const r=gxRisco(t,hoje); return { k:String(9-Math.floor(r.s/25))+'-'+r.rot, rot:`risco ${r.rot}` }; }
    default: return null;
  }
}
// Agrupa a lista filtrada: [{k, rot, itens, seg, atrasados}] — grupos maiores primeiro
// (vencimento/risco ordenam pela chave, que embute a criticidade).
function gxAgrupa(lista, hoje){
  const g=estado.gestao; if(!g.agrupar) return null;
  const m=new Map();
  lista.forEach(t=>{ const gr=gxGrupoDe(t,hoje);
    const at=m.get(gr.k)||{ k:gr.k, rot:gr.rot, itens:[], seg:0, atrasados:0 };
    at.itens.push(t); at.seg+=Number(t.seg)||0; if(t.venc&&t.venc<hoje) at.atrasados++;
    m.set(gr.k,at); });
  const arr=[...m.values()];
  if(g.agrupar==='venc'||g.agrupar==='risco') arr.sort((a,b)=>a.k.localeCompare(b.k));
  else arr.sort((a,b)=>b.itens.length-a.itens.length||a.rot.localeCompare(b.rot,'pt'));
  return arr;
}
function gxGrupoCab(gr){
  return `<span class="gx-grp-rot">${esc(gr.rot)}</span>
    <span class="badge">${gr.itens.length} ticket(s)</span>
    ${gr.seg?`<span class="badge">⏱ ${fmtH(gr.seg)}</span>`:''}
    ${gr.atrasados?`<span class="badge venc-passado">⚠ ${gr.atrasados} atrasado(s)</span>`:''}
    <span class="spacer"></span>
    <button class="chip" data-gx-grp-sel="${escA(gr.itens.map(t=>t.k).join(','))}">selecionar grupo</button>`;
}
// Comentar em massa: publica o mesmo comentário em todos os selecionados (token da pessoa).
const GX_TPLS=[
  ['','— escrever do zero —',''],
  ['cobrar','Cobrar atualização','Olá! Podem nos atualizar sobre o andamento deste chamado? Precisamos do status atual para o acompanhamento. Obrigado!'],
  ['apont','Pedir apontamento','Por favor, registrem as horas trabalhadas neste chamado para mantermos o controle de esforço em dia.'],
  ['depcli','Registrar dependência do cliente','Registro: este chamado está aguardando retorno/ação do cliente para prosseguir. Assim que houver retorno, retomamos o atendimento.'],
  ['justrep','Justificar reprogramação','O vencimento deste chamado foi reprogramado conforme alinhamento com os envolvidos; o motivo está registrado no histórico do ticket.'],
  ['bloq','Sinalizar bloqueio técnico','Registro: identificamos um bloqueio técnico que impede o avanço deste chamado. Estamos atuando na dependência e atualizaremos assim que resolvido.'],
];
let _gxCom=null;
function abreModalComentarLote(keys, tpl){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  keys=(keys||[]).filter(Boolean); if(!keys.length) return;
  _gxCom={keys};
  const tsel=GX_TPLS.find(x=>x[0]===tpl);
  const itens=keys.map(k=>{ const t=alxTickets().find(x=>x.k===k)||{k}; return `<li><strong>${esc(k)}</strong> — ${esc((t.resumo||'').slice(0,70))}</li>`; }).join('');
  abreModal(`
    <h2>💬 Comentar em massa · ${keys.length} ticket(s)</h2>
    <ul class="muted small" style="margin:8px 0 0;padding-left:18px;max-height:150px;overflow:auto">${itens}</ul>
    <div class="alx-campo"><label>Modelo de mensagem <span class="muted small">(opcional — preenche o texto abaixo)</span></label>
      <select class="alx-motivo" id="gx-com-tpl">${GX_TPLS.map(x=>`<option value="${x[0]}" ${tpl===x[0]?'selected':''}>${esc(x[1])}</option>`).join('')}</select></div>
    <div class="alx-campo"><label>Comentário <span class="req">*</span> <span class="muted small">(será publicado em todos)</span></label>
      <textarea class="alx-coment" id="gx-com-texto" placeholder="Escreva o comentário…">${esc((tsel&&tsel[2])||'')}</textarea></div>
    ${mnPickerHtml([])}
    ${mnAnexosHtml()}
    <div class="alx-fb" id="gx-fb" hidden></div>
    <div class="alx-modal-acoes">
      <button class="btn primario" id="gx-com-confirmar">Publicar em ${keys.length} ticket(s)</button>
      <button class="btn" id="gx-com-cancelar">Cancelar</button></div>`);
}
async function gxComentaLote(){
  const ctx=_gxCom; const id=idApontar(); if(!ctx||!id) return;
  const texto=((document.getElementById('gx-com-texto')||{}).value||'').trim();
  const fb=document.getElementById('gx-fb');
  if(!texto){ if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb erro'; fb.textContent='Escreva o comentário.'; } return; }
  const bt=document.getElementById('gx-com-confirmar'); if(bt) bt.disabled=true;
  const marcados=mnPickerIds();
  let ok=0; const erros=[];
  for(const k of ctx.keys){
    if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb'; fb.textContent=`Comentando ${k}… (${ok+erros.length+1}/${ctx.keys.length})`; }
    let textoK=texto;
    if(_mnFiles.length){
      const ax=await mnEnviaAnexos(k, id, fb);
      ax.falhas.forEach(f2=>erros.push(`${k} (anexo) ${f2}`));
      if(ax.oks.length) textoK=`${texto}\n\n📎 Anexos: ${ax.oks.join(', ')}`;
    }
    try{
      const r=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({comentar:true,issue:k,texto:textoK,...(marcados.length?{mencionar:marcados}:{}),email:id.email,token:id.token})}).then(x=>x.json());
      if(r.ok){ ok++; delete estado.gestao.sel[k]; logAcao({acao:'comentar', t:k, para:texto.slice(0,60), ok:true}, false); }
      else { erros.push(`${k}: ${r.erro||'falhou'}`); logAcao({acao:'comentar', t:k, ok:false}, false); }
    }catch(e){ erros.push(`${k}: ${e.message||e}`); }
  }
  salvaCfg();
  if(fb){ fb.className='alx-fb ap-fb '+(erros.length?'erro':'ok');
    fb.innerHTML=`${ok?`✓ Comentário publicado em ${ok} ticket(s).`:''}${erros.length?`<br>⚠ ${erros.map(esc).join('<br>')}`:''}`; }
  if(bt){ bt.textContent='Fechar'; bt.disabled=false; bt.id='gx-fechar'; }
  const bc=document.getElementById('gx-com-cancelar'); if(bc) bc.hidden=true;
}
// Alterar status em massa: escolhe a transição pelo NOME e aplica ticket a ticket
// (cada ticket resolve o próprio transitionId; quem não tiver a transição é reportado).
let _gxSt=null;
function abreModalStatusLote(keys){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  keys=(keys||[]).filter(Boolean); if(!keys.length) return;
  // Agrupa por STATUS ATUAL: tickets em status diferentes têm transições
  // diferentes — cada grupo ganha o próprio seletor, consultado num
  // representante do grupo (as transições dependem só do status no fluxo).
  const stDe=(k)=>{ const t=alxTickets().find(x=>x.k===k);
    if(t&&t.status) return t.status;
    const i=estado.rateio.info&&estado.rateio.info[k];
    return (i&&i.status)||'—'; };
  const porSt={};
  keys.forEach(k=>{ const s=stDe(k); (porSt[s]=porSt[s]||[]).push(k); });
  const grupos=Object.keys(porSt).sort((a,b)=>porSt[b].length-porSt[a].length||a.localeCompare(b,'pt'))
    .map(s=>({status:s, keys:porSt[s], transicoes:null, erro:''}));
  _gxSt={keys, grupos};
  abreModal(`<h2>🔁 Alterar status · ${keys.length} ticket(s)</h2>
    <div class="estado">Consultando as transições disponíveis${grupos.length>1?` para ${grupos.length} status atuais diferentes`:''}…</div>`);
  Promise.all(grupos.map(g=>
    fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({listar:true,issue:g.keys[0],email:id.email,token:id.token})})
      .then(r=>r.json()).then(j=>{ g.transicoes=(j&&j.transicoes)||[];
        if(!g.transicoes.length) g.erro=(j&&j.erro)||`sem transições a partir de "${g.status}"`; })
      .catch(e=>{ g.transicoes=[]; g.erro=String(e.message||e); })
  )).then(()=>{ if(!_gxSt||_gxSt.grupos!==grupos) return;
    if(grupos.every(g=>!g.transicoes.length)){
      abreModal(`<h2>🔁 Alterar status</h2><div class="erro">${esc(grupos[0].erro||'Não há transições disponíveis para os tickets selecionados.')}</div>
        <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`); return; }
    renderGxStModal(); });
}
function renderGxStModal(){
  const ctx=_gxSt; if(!ctx||!ctx.grupos) return; const keys=ctx.keys;
  const resumoDe=(k)=>{ const t=alxTickets().find(x=>x.k===k)||(estado.rateio.info&&estado.rateio.info[k]
      ? {resumo:estado.rateio.info[k].resumo} : {});
    return (t.resumo||'').slice(0,60); };
  const varios=ctx.grupos.length>1;
  const secoes=ctx.grupos.map((g,i)=>{
    const itens=g.keys.map(k=>`<li><strong>${esc(k)}</strong> — ${esc(resumoDe(k))}</li>`).join('');
    const ops=(g.transicoes||[]).map(t=>`<option value="${escA(t.nome)}">${esc(t.nome)}${t.para?` → ${esc(t.para)}`:''}</option>`).join('');
    const sel=g.transicoes&&g.transicoes.length
      ? `<select class="alx-motivo" ${varios?`data-gx-st-g="${i}"`:'id="gx-st-sel"'}>
           <option value="">${varios?'— manter como está —':'— escolha a transição —'}</option>${ops}</select>`
      : `<div class="muted small">⚠ ${esc(g.erro||'sem transições a partir deste status')} — este grupo não será alterado.</div>`;
    return `<div class="gx-st-grupo">
      ${varios?`<h3 class="mp-h3">${esc(g.status)} <span class="mp-dim">${g.keys.length} ticket(s)</span></h3>`:''}
      <ul class="muted small" style="margin:6px 0 0;padding-left:18px;max-height:110px;overflow:auto">${itens}</ul>
      <div class="alx-campo"><label>Transição ${varios?'<span class="muted small">(deste grupo)</span>':'<span class="req">*</span>'}
        <span class="muted small">(aplicada pelo nome, ticket a ticket)</span></label>${sel}</div></div>`;
  }).join('');
  abreModal(`
    <h2>🔁 Alterar status · ${keys.length} ticket(s)</h2>
    ${varios?`<div class="muted small">Os tickets estão em <strong>${ctx.grupos.length} status diferentes</strong> — escolha a transição certa para cada grupo (grupos sem escolha ficam como estão).</div>`:''}
    ${secoes}
    <div class="alx-campo"><label>Comentário <span class="muted small">(opcional, publicado em todos)</span></label>
      <textarea class="alx-coment" id="gx-st-texto" placeholder="Comentário opcional…"></textarea></div>
    <div class="alx-fb" id="gx-fb" hidden></div>
    <div class="alx-modal-acoes">
      <button class="btn primario" id="gx-st-confirmar">${varios?'Aplicar as transições escolhidas':`Aplicar em ${keys.length} ticket(s)`}</button>
      <button class="btn" id="gx-st-cancelar">Cancelar</button></div>`);
}
async function gxStatusLote(){
  const ctx=_gxSt; const id=idApontar(); if(!ctx||!id) return;
  const fb=document.getElementById('gx-fb');
  // Transição escolhida POR GRUPO de status atual (seletor único = 1 grupo).
  const tarefas=[];   // {k, nome}
  const nomesUsados=new Set();
  if(ctx.grupos&&ctx.grupos.length>1){
    ctx.grupos.forEach((g,i)=>{
      const sel=document.querySelector(`[data-gx-st-g="${i}"]`);
      const nome=((sel&&sel.value)||'').trim();
      if(nome){ nomesUsados.add(nome); g.keys.forEach(k=>tarefas.push({k, nome})); }
    });
    if(!tarefas.length){ if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb erro'; fb.textContent='Escolha a transição de pelo menos um grupo.'; } return; }
  } else {
    const nome=((document.getElementById('gx-st-sel')||{}).value||'').trim();
    if(!nome){ if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb erro'; fb.textContent='Escolha a transição.'; } return; }
    nomesUsados.add(nome);
    (ctx.grupos?ctx.grupos[0].keys:ctx.keys).forEach(k=>tarefas.push({k, nome}));
  }
  const texto=((document.getElementById('gx-st-texto')||{}).value||'').trim();
  const bt=document.getElementById('gx-st-confirmar'); if(bt) bt.disabled=true;
  let ok=0; const erros=[];
  for(const {k, nome} of tarefas){
    if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb'; fb.textContent=`Aplicando em ${k}… (${ok+erros.length+1}/${tarefas.length})`; }
    try{
      const lj=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({listar:true,issue:k,email:id.email,token:id.token})}).then(x=>x.json());
      const tr=((lj&&lj.transicoes)||[]).find(t=>String(t.nome||'').toLowerCase()===nome.toLowerCase());
      if(!tr){ erros.push(`${k}: não tem a transição "${nome}" no status atual`); continue; }
      const ej=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({issue:k,transitionId:tr.id,email:id.email,token:id.token})}).then(x=>x.json());
      if(!ej.ok){ erros.push(`${k}: ${ej.erro||'transição falhou'}`); continue; }
      if(texto){ try{ await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({comentar:true,issue:k,texto,email:id.email,token:id.token})}); }catch(e){} }
      ok++;
      const gtk=((estado.gestao.dados&&estado.gestao.dados.tickets)||[]).find(x=>x.k===k);
      logAcao({acao:'status', t:k, de:(gtk&&gtk.status)||'—', para:tr.para||nome, ok:true}, false);
      if(gtk&&tr.para) gtk.status=tr.para;
      delete estado.gestao.sel[k];
    }catch(e){ erros.push(`${k}: ${e.message||e}`); }
  }
  salvaCfg(); estado.cache={};
  const nomesTxt=[...nomesUsados].map(esc).join('" / "');
  if(fb){ fb.className='alx-fb ap-fb '+(erros.length?'erro':'ok');
    fb.innerHTML=`${ok?`✓ ${ok} ticket(s) movido(s) via "${nomesTxt}".`:''}${erros.length?`<br>⚠ ${erros.map(esc).join('<br>')}`:''}`; }
  if(bt){ bt.textContent='Fechar'; bt.disabled=false; bt.id='gx-fechar'; }
  const bc=document.getElementById('gx-st-cancelar'); if(bc) bc.hidden=true;
}
// Excluir em massa: IRREVERSÍVEL — exige digitar EXCLUIR para habilitar a confirmação.
let _gxDel=null;
function abreModalExcluirLote(keys){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  keys=(keys||[]).filter(Boolean); if(!keys.length) return;
  _gxDel={keys};
  const itens=keys.map(k=>{ const t=alxTickets().find(x=>x.k===k)||{k}; return `<li><strong>${esc(k)}</strong> — ${esc((t.resumo||'').slice(0,70))} <span class="muted">(${esc(t.status||'—')})</span></li>`; }).join('');
  abreModal(`
    <h2>🗑 Excluir ${keys.length} ticket(s)</h2>
    <ul class="muted small" style="margin:8px 0 0;padding-left:18px;max-height:150px;overflow:auto">${itens}</ul>
    <div class="rv-del">⚠️ A exclusão é <strong>IRREVERSÍVEL</strong>: os tickets somem do Jira com comentários, anexos e horas apontadas. Exige a permissão <strong>"Excluir itens"</strong> no projeto.</div>
    <div class="alx-campo"><label>Para confirmar, digite <strong>EXCLUIR</strong></label>
      <input type="text" class="alx-coment" id="gx-del-conf" placeholder="EXCLUIR" autocomplete="off" style="min-height:0"></div>
    <div class="alx-fb" id="gx-fb" hidden></div>
    <div class="alx-modal-acoes">
      <button class="btn perigo" id="gx-del-confirmar" disabled>Excluir ${keys.length} ticket(s) definitivamente</button>
      <button class="btn" id="gx-del-cancelar">Cancelar</button></div>`);
}
async function gxExcluiLote(){
  const ctx=_gxDel; const id=idApontar(); if(!ctx||!id) return;
  const conf=((document.getElementById('gx-del-conf')||{}).value||'').trim().toUpperCase();
  if(conf!=='EXCLUIR') return;
  const fb=document.getElementById('gx-fb');
  const bt=document.getElementById('gx-del-confirmar'); if(bt) bt.disabled=true;
  let ok=0; const erros=[];
  for(const k of ctx.keys){
    if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb'; fb.textContent=`Excluindo ${k}… (${ok+erros.length+1}/${ctx.keys.length})`; }
    try{
      const r=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({excluir:true,issue:k,email:id.email,token:id.token})}).then(x=>x.json());
      if(r.ok){ ok++;
        const g=estado.gestao; delete g.sel[k];
        if(g.dados&&g.dados.tickets) g.dados.tickets=g.dados.tickets.filter(t=>t.k!==k);
        logAcao({acao:'excluir', t:k, ok:true}, false);
      } else erros.push(`${k}: ${r.erro||'falhou'}`);
    }catch(e){ erros.push(`${k}: ${e.message||e}`); }
  }
  salvaCfg(); estado.cache={};
  if(fb){ fb.className='alx-fb ap-fb '+(erros.length?'erro':'ok');
    fb.innerHTML=`${ok?`✓ ${ok} ticket(s) excluído(s) do Jira.`:''}${erros.length?`<br>⚠ ${erros.map(esc).join('<br>')}`:''}`; }
  if(bt){ bt.textContent='Fechar'; bt.disabled=false; bt.classList.remove('perigo'); bt.id='gx-fechar'; }
  const bc=document.getElementById('gx-del-cancelar'); if(bc) bc.hidden=true;
}
// ---- 🔍 Ficha completa do ticket (modal) — Analytics e Gestão, sem abrir o Jira ----
let _gxDet=null;
function abreModalTicket(k){
  _gxDet={ k };
  abreModal(`<h2>🔍 ${esc(k)}</h2><div class="estado">Carregando a ficha do ticket…</div>`);
  fetch(`/api/vencimentos?detalhe=${encodeURIComponent(k)}`).then(r=>r.json()).then(j=>{
    if(!_gxDet||_gxDet.k!==k) return;
    if(j.erro){ abreModal(`<h2>🔍 ${esc(k)}</h2><div class="erro">${esc(j.erro)}</div>
      <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`); return; }
    renderModalTicket(j);
  }).catch(e=>{ if(_gxDet&&_gxDet.k===k) abreModal(`<h2>🔍 ${esc(k)}</h2><div class="erro">Erro de rede: ${esc(String(e.message||e))}</div>
    <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`); });
}
function renderModalTicket(d){
  const link=`${jiraBase()}/browse/${encodeURIComponent(d.k)}`;
  const badge=(x,pre)=>x?`<span class="badge">${pre||''}${esc(x)}</span>`:'';
  const m=(l,v)=>v?`<div class="gx-det-m"><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`:'';
  const wl=d.worklogs||{porPessoa:[],ultimos:[],totalSeg:0};
  const pessoas=(wl.porPessoa||[]).map(x=>`<span class="badge">${esc(x.nome)} · ${fmtH(x.seg)}</span>`).join(' ');
  const lancs=(wl.ultimos||[]).map(w=>`<div class="gx-det-item"><strong>${esc(w.por||'—')}</strong> · ${esc(alxDataBR(w.dia))} · ${fmtH(w.seg)}${w.coment?` — <span class="muted">${esc(w.coment)}</span>`:''}</div>`).join('');
  const coms=(d.comentarios||[]).map(c=>`<div class="gx-det-item"><strong>${esc(c.por||'—')}</strong> · ${esc(alxDataBR(c.quando))}<br><span class="muted">${esc(c.texto||'')}</span></div>`).join('');
  const anx=(d.anexos||[]).map(a=>`<div class="gx-det-item">📎 ${esc(a.nome)} <span class="muted small">(${a.kb} KB · ${esc(alxDataBR(a.quando))}${a.por?` · ${esc(a.por)}`:''})</span></div>`).join('');
  abreModal(`
    <h2>🔍 Ficha do ticket <span class="muted small">${esc(d.pNome||d.p)}</span></h2>
    <div class="rv-met"><span class="k"><a href="${link}" target="_blank" rel="noopener">${esc(d.k)} ↗</a></span> — ${esc(d.resumo)}
      <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
        ${badge(d.t)}${badge(d.status)}${badge(d.prio,'⚑ ')}${d.pai?`<span class="badge" title="${escA(d.paiResumo||'')}">🧩 ${esc(d.pai)}</span>`:''}
        ${(d.labels||[]).map(l=>`<span class="badge">🏷 ${esc(l)}</span>`).join('')}
      </div></div>
    <div class="gx-det-grid">
      ${m('Responsável',d.resp||'sem responsável')}${m('Relator',d.relator)}
      ${m('Criado',d.criado?alxDataBR(d.criado):'')}${m('Atualizado',d.atualizado?alxDataBR(d.atualizado):'')}
      ${m('Início',d.inicio?alxDataBR(d.inicio):'')}${m('Vencimento',d.venc?alxDataBR(d.venc):'—')}
      ${m('Resolvido',d.resolvido?`${alxDataBR(d.resolvido)}${d.resol?` (${d.resol})`:''}`:'')}
      ${m('Horas / estimativa',`${d.seg?fmtH(d.seg):'0h'}${d.est?` de ${fmtH(d.est)}`:''}`)}
    </div>
    <details open><summary>📄 Descrição</summary><div class="gx-det-txt">${esc(d.desc||'(sem descrição)')}</div></details>
    <details ${(wl.porPessoa||[]).length?'open':''}><summary>⏱ Horas apontadas — ${fmtH(wl.totalSeg||0)}</summary>
      <div style="margin:6px 0;display:flex;gap:6px;flex-wrap:wrap">${pessoas||'<span class="muted small">nenhum apontamento</span>'}</div>
      ${lancs?`<div class="muted small" style="margin:4px 0 2px">Últimos lançamentos:</div>${lancs}`:''}</details>
    <details ${(d.comentarios||[]).length?'open':''}><summary>💬 Comentários (${d.nComentarios||0})</summary>
      ${coms||'<div class="muted small" style="margin-top:6px">Nenhum comentário.</div>'}</details>
    <details><summary>📎 Anexos (${(d.anexos||[]).length})</summary>
      ${anx||'<div class="muted small" style="margin-top:6px">Nenhum anexo.</div>'}</details>
    <div class="alx-modal-acoes">
      <button class="btn primario" data-gx-apont="${escA(d.k)}">⏱ Apontar</button>
      <button class="btn" data-gx-st="${escA(d.k)}">🔁 Status</button>
      <button class="btn" data-gx-det-com="${escA(d.k)}">💬 Comentar</button>
      <button class="btn" data-gx-trf="${escA(d.k)}" data-tip="Levar este chamado para dentro de outro: vira sub-tarefa (se o destino aceitar) ou apontamento de horas">🔀 Transformar em atividade</button>
      <button class="btn" data-gx-conv="${escA(d.k)}" data-tip="Convida pessoas do time a apontar horas neste ticket — cada uma confirma com 1 clique e o aviso vai por chat individual do Teams">📨 Convidar para apontar</button>
      <a class="btn" href="${link}" target="_blank" rel="noopener">Abrir no Jira ↗</a>
      <span class="spacer"></span><button class="btn" id="gx-fechar">Fechar</button>
    </div>`);
}
// ---- Apontar horas em 1 ticket (modal) — usado pela Gestão e pelo drill do Analytics ----
let _gxApont=null;
function gxTicketInfo(k){
  return alxTickets().find(x=>x.k===k)
    || (((estado.analytics.dados||{}).abertos)||[]).find(x=>x.k===k)
    || (((estado.analytics.dados||{}).concluidos)||[]).find(x=>x.k===k)
    || { k };
}
function abreModalApontarGx(k){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const t=gxTicketInfo(k);
  _gxApont={ k };
  abreModal(`
    <h2>⏱ Apontar horas · ${esc(k)}</h2>
    <div class="muted small">${esc((t.resumo||'').slice(0,110))||'—'}${t.p?` · ${esc(projNome(t.p))}`:''}${t.status?` · ${esc(t.status)}`:''}</div>
    <div class="rv-form" style="margin-top:10px">
      <div class="campo"><label>Tempo <span class="req">*</span></label><input type="text" id="gx-ap-tempo" placeholder="ex.: 1h30, 45m, 2:15" autocomplete="off"></div>
      <div class="campo"><label>Dia</label><input type="date" id="gx-ap-dia" value="${escA(hojeSP())}"></div>
      <div class="campo full"><label>Comentário do worklog <span class="muted small">(opcional)</span></label>
        <input type="text" id="gx-ap-coment" placeholder="o que foi feito…" maxlength="500"></div>
    </div>
    <div class="muted small" style="margin-top:6px">O apontamento sai no <strong>seu usuário</strong> (${esc(id.nome||id.email)}), como na aba Apontar.</div>
    <div class="ap-fb" id="gx-ap-fb" hidden></div>
    <div class="alx-modal-acoes">
      <button class="btn primario" id="gx-ap-confirmar">Apontar</button>
      <button class="btn" id="gx-ap-cancelar">Cancelar</button></div>`);
  setTimeout(()=>{ const i=document.getElementById('gx-ap-tempo'); if(i) i.focus(); },50);
}
async function gxApontaConfirma(){
  const ctx=_gxApont; const id=idApontar(); if(!ctx||!id) return;
  const fb=document.getElementById('gx-ap-fb');
  const seg=parseTempo((document.getElementById('gx-ap-tempo')||{}).value);
  const dia=((document.getElementById('gx-ap-dia')||{}).value||'').trim()||hojeSP();
  const coment=((document.getElementById('gx-ap-coment')||{}).value||'').trim();
  if(!seg||seg<=0){ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent='Tempo inválido — use 1h30, 45m ou 2:15.'; } return; }
  const bt=document.getElementById('gx-ap-confirmar'); if(bt) bt.disabled=true;
  if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Registrando o apontamento…'; }
  try{
    const j=await fetch('/api/apontar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({issue:ctx.k, segundos:seg, inicio:dia, comentario:coment, email:id.email, token:id.token})}).then(r=>r.json());
    if(!j.ok){ if(fb){ fb.className='ap-fb err'; fb.textContent=humanizaErro(j.erro||'Falha ao apontar.'); } if(bt) bt.disabled=false; return; }
    // Reflete localmente nas telas que mostram horas do ticket.
    const soma=(t)=>{ if(t&&t.k===ctx.k) t.seg=(Number(t.seg)||0)+seg; };
    (((estado.gestao.dados||{}).tickets)||[]).forEach(soma);
    (((estado.alertas.dados||{}).tickets)||[]).forEach(soma);
    (((estado.analytics.dados||{}).abertos)||[]).forEach(soma);
    (((estado.analytics.dados||{}).concluidos)||[]).forEach(soma);
    logAcao({acao:'apontar', t:ctx.k, para:fmtH(seg), ok:true});
    estado.cache={}; estado.apontar.porData={}; estado.apontar.recentes=null;
    _gxApont=null; fechaModal();
    toast(`✓ ${fmtH(seg)} apontadas em ${ctx.k}.`,'ok');
    if(estado.vista==='gestao') renderGestao(); else if(estado.vista==='analytics') renderAnalytics();
  }catch(e){ if(fb){ fb.className='ap-fb err'; fb.textContent='Erro de rede: '+(e.message||e); } if(bt) bt.disabled=false; }
}
// Exporta a seleção (ou, sem seleção, a lista filtrada) da Gestão em CSV.
function gxExportaCSV(){
  const g=estado.gestao; const hoje=hojeSP(); const ks=new Set(gxSelKeys());
  const rows=gxLista().filter(t=>!ks.size||ks.has(t.k));
  if(!rows.length){ toast('Nada para exportar.','warn'); return; }
  const cab=['Ticket','Resumo','Projeto','Tipo','Status','Responsável','Vencimento','Atraso (dias)','Última atividade','Horas apontadas','Estimativa (h)','Prioridade','Risco','Tratado'];
  const cel=(v)=>{ v=String(v==null?'':v); return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
  const li=rows.map(t=>{ const r=gxRisco(t,hoje);
    return [t.k,t.resumo,t.p,t.t,t.status,t.resp||'',t.venc||'',gxAtrasoDias(t,hoje)||'',(t.up||'').slice(0,10),
      t.seg?Math.round(t.seg/36)/100:'', t.est?Math.round(t.est/36)/100:'', t.prio||'', r.rot,
      (cfg.tratados||{})[t.k]?'sim':''].map(cel).join(';'); });
  const csv='\ufeff'+cab.join(';')+'\n'+li.join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=`gestao-tickets-${hoje}.csv`; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
}
// ---- Verificar duplicados: agrupa tickets abertos com o MESMO resumo e o MESMO vencimento ----
function gxNormResumo(s){ return String(s||'').toLowerCase().replace(/\s+/g,' ').trim(); }
function gxGruposDuplicados(){
  const todos=((estado.gestao.dados||{}).tickets)||[];
  const por={};
  todos.forEach(t=>{ const n=gxNormResumo(t.resumo); if(!n) return;
    const ch=n+'|'+(t.venc||''); (por[ch]=por[ch]||[]).push(t); });
  return Object.values(por).filter(a=>a.length>1)
    .map(a=>a.slice().sort((x,y)=>x.k.localeCompare(y.k,'pt',{numeric:true})))
    .sort((x,y)=>y.length-x.length || x[0].resumo.localeCompare(y[0].resumo,'pt'));
}
function abreModalDuplicados(){
  const g=estado.gestao; const hoje=hojeSP();
  const nTodos=(((g.dados||{}).tickets)||[]).length;
  const grupos=gxGruposDuplicados();
  const total=grupos.reduce((s,a)=>s+a.length,0);
  if(!grupos.length){
    abreModal(`<h2>🧬 Verificar duplicados</h2>
      <div class="pl-res-ok">✓ Nenhum duplicado encontrado: não há tickets abertos com o mesmo resumo e o mesmo vencimento (${nTodos} analisados, abertos até ${esc(alxDataBR(g.ate))}).</div>
      <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`);
    return;
  }
  const bloco=(a)=>{
    const keys=a.map(t=>t.k).join(',');
    const venc=a[0].venc?alxDataBR(a[0].venc):'sem vencimento';
    const atras=a[0].venc&&a[0].venc<hoje;
    const rows=a.map(t=>`<tr>
      <td><a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener">${esc(t.k)} ↗</a></td>
      <td><span class="badge" data-tip="${escA(t.p)}">${esc(projNome(t.p))}</span></td>
      <td><span class="badge">${esc(t.status)}</span></td>
      <td>${esc(t.resp||'—')}</td>
      <td class="num" title="Horas apontadas">${t.seg?fmtH(t.seg):'—'}</td>
      <td class="num" title="Última atividade no Jira">${(t.up||'').slice(0,10)?esc(alxDataBR((t.up||'').slice(0,10))):'—'}</td></tr>`).join('');
    return `<div class="gx-dup-g">
      <div class="gx-dup-h"><strong title="${escA(a[0].resumo)}">${esc(a[0].resumo)}</strong>
        <span class="badge ${atras?'venc-passado':(a[0].venc===hoje?'venc-hoje':'')}">📅 ${esc(venc)}</span>
        <span class="badge">${a.length} tickets</span>
        <span class="spacer"></span>
        <button class="btn" data-gx-dup-sel="${escA(keys)}" title="Marca estes tickets na tela para usar as ações em massa (comentar, excluir…)">Selecionar na tela</button></div>
      <div class="ts-wrap"><table class="rc-tab"><thead><tr>
        <th>Ticket</th><th>Projeto</th><th>Status</th><th>Responsável</th><th class="num">Horas</th><th class="num">Últ. ativ.</th>
      </tr></thead><tbody>${rows}</tbody></table></div></div>`;
  };
  abreModal(`
    <h2>🧬 Tickets duplicados <span class="muted small">mesmo resumo + mesmo vencimento</span></h2>
    <div class="muted small">${grupos.length} grupo(s) · ${total} ticket(s) envolvidos, entre os ${nTodos} abertos até ${esc(alxDataBR(g.ate))} (inclui os sem vencimento).
      Use <strong>Selecionar na tela</strong> para marcar um grupo e tratar com as <strong>ações em massa</strong> (comentar, alterar status, excluir…).</div>
    ${grupos.map(bloco).join('')}
    <div class="alx-modal-acoes">
      <button class="btn primario" id="gx-dup-selall">Selecionar todos (${total})</button>
      <button class="btn" id="gx-fechar">Fechar</button></div>`);
}
// ---- Ajustar épicos: tickets abertos SEM épico (soltos) → vincula ao épico do projeto ----
let _gxEp=null;
function gxSoltos(){
  const todos=((estado.gestao.dados||{}).tickets)||[];
  return todos.filter(t=>!t.pai && !t.sub && !/épico|epic/i.test(t.t||''));
}
function abreModalEpicos(){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const soltos=gxSoltos();
  if(!soltos.length){
    abreModal(`<h2>🧩 Ajustar épicos</h2>
      <div class="pl-res-ok">✓ Nenhum ticket solto: todos os tickets abertos carregados já têm épico/pai (subtarefas e épicos ficam de fora da conta).</div>
      <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`);
    return;
  }
  const projs=[...new Set(soltos.map(t=>t.p))].sort();
  _gxEp={ epicos:{}, sel:{}, aplicando:false };
  abreModal(`<h2>🧩 Ajustar épicos</h2><div class="estado">Carregando os épicos de ${projs.length} projeto(s)…</div>`);
  Promise.all(projs.map(p=>fetch(`/api/projetos?epicos=${encodeURIComponent(p)}`).then(r=>r.json()).catch(()=>null)))
    .then(rs=>{ if(!_gxEp) return;
      rs.forEach((j,i)=>{ _gxEp.epicos[projs[i]]=(j&&j.epicos)||[]; });
      renderGxEpModal();
    });
}
function renderGxEpModal(){
  const ctx=_gxEp; if(!ctx) return;
  const soltos=gxSoltos();
  const grupos={}; soltos.forEach(t=>{ (grupos[t.p]=grupos[t.p]||[]).push(t); });
  const projs=Object.keys(grupos).sort();
  const comEp=projs.filter(p=>(ctx.epicos[p]||[]).length);
  const semEp=projs.filter(p=>!(ctx.epicos[p]||[]).length);
  if(!comEp.length){
    abreModal(`<h2>🧩 Ajustar épicos</h2>
      <div class="estado">${soltos.length?`Há ${soltos.length} ticket(s) sem épico, mas os projetos deles não têm épico aberto para vincular (${esc(semEp.join(', '))}).`:'✓ Tudo vinculado — nenhum ticket solto.'}</div>
      <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`);
    return;
  }
  const nomeProj=(p)=>{ const pr=((estado.gestao.dados||{}).projetos||{})[p]; return pr?`${p} — ${pr.nome}`:p; };
  const bloco=(p)=>{
    const a=grupos[p]; const eps=ctx.epicos[p];
    if(!ctx.sel[p]||!eps.some(e=>e.k===ctx.sel[p])) ctx.sel[p]=eps[0].k;
    const opt=eps.map(e=>`<option value="${escA(e.k)}" ${ctx.sel[p]===e.k?'selected':''}>${esc(e.k)} — ${esc((e.resumo||'').slice(0,55))}${e.nHistorias?` (${e.nHistorias} vinculados)`:''}</option>`).join('');
    const rows=a.map(t=>`<li><label style="display:flex;gap:7px;align-items:baseline;cursor:pointer">
      <input type="checkbox" class="gx-ep-chk" data-p="${escA(p)}" data-k="${escA(t.k)}" checked>
      <span><a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener">${esc(t.k)} ↗</a>
      ${esc((t.resumo||'').slice(0,80))} <span class="badge">${esc(t.status)}</span></span></label></li>`).join('');
    return `<div class="gx-dup-g" data-gx-ep-g="${escA(p)}">
      <div class="gx-dup-h"><strong>${esc(nomeProj(p))}</strong><span class="badge">${a.length} sem épico</span>
        <span class="spacer"></span>
        <select data-gx-ep-sel="${escA(p)}" class="aloc-fsel" style="max-width:320px">${opt}</select>
        <button class="btn primario" data-gx-ep-apl="${escA(p)}">Vincular marcados →</button></div>
      <ul style="list-style:none;margin:4px 0 0;padding:0;max-height:180px;overflow:auto">${rows}</ul>
      <div class="ap-fb" data-gx-ep-fb="${escA(p)}" hidden></div></div>`;
  };
  abreModal(`<h2>🧩 Ajustar épicos <span class="muted small">tickets abertos sem épico</span></h2>
    <div class="muted small">${soltos.length} ticket(s) soltos em ${projs.length} projeto(s). Escolha o épico e clique em <strong>Vincular marcados</strong> — o vínculo (campo pai/épico) é gravado no Jira com o seu usuário.${semEp.length?`<br>Projetos sem épico aberto (fora da lista): ${esc(semEp.join(', '))}.`:''}</div>
    ${comEp.map(bloco).join('')}
    <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`);
}
async function gxAplicaEpico(p){
  const ctx=_gxEp; const id=idApontar(); if(!ctx||!id||ctx.aplicando) return;
  const paiKey=ctx.sel[p]||''; if(!paiKey) return;
  const keys=[...document.querySelectorAll(`#modal-body .gx-ep-chk[data-p="${p}"]:checked`)].map(c=>c.getAttribute('data-k'));
  const fb=document.querySelector(`#modal-body [data-gx-ep-fb="${p}"]`);
  const bt=document.querySelector(`#modal-body [data-gx-ep-apl="${p}"]`);
  if(!keys.length){ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent='Marque ao menos um ticket.'; } return; }
  ctx.aplicando=true; if(bt) bt.disabled=true;
  if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent=`Vinculando ${keys.length} ticket(s) a ${paiKey}…`; }
  try{
    const j=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({epico:true,issues:keys,paiKey,email:id.email,token:id.token})}).then(r=>r.json());
    ctx.aplicando=false;
    if(!j.ajustados){
      const det=(j.falhas||[]).map(f=>`${f.k}: ${f.erro}`).join(' · ');
      if(fb){ fb.className='ap-fb err'; fb.textContent=j.erro||det||'Falha ao vincular.'; }
      if(bt) bt.disabled=false; return;
    }
    const okSet=new Set(j.oks||[]);
    (((estado.gestao.dados||{}).tickets)||[]).forEach(t=>{ if(okSet.has(t.k)) t.pai=paiKey; });
    (j.oks||[]).forEach(k=>logAcao({acao:'epico', t:k, para:paiKey, ok:true}, false));
    salvaCfg();
    toast(`✓ ${j.ajustados} ticket(s) vinculados ao épico ${paiKey}.`+((j.falhas||[]).length?` ⚠ ${j.falhas.length} falharam.`:''), (j.falhas||[]).length?'warn':'ok');
    renderGxEpModal();
  }catch(e){ ctx.aplicando=false; if(fb){ fb.className='ap-fb err'; fb.textContent='Erro de rede: '+(e.message||e); } if(bt) bt.disabled=false; }
}
function renderGestao(){
  const cont=document.getElementById('conteudo');
  const g=estado.gestao;
  if(_gxfURL){ const f=gxfDecodifica(_gxfURL); _gxfURL='';   // link compartilhado (?gxf=…)
    if(f){ gxfAplica(f,true); return; } }
  if(!g.dados && !g.carregando && !g.erro) carregaGestao(false);
  if(g.erro){ cont.replaceChildren(el(`<div class="erro"><strong>Falha ao carregar.</strong> ${esc(g.erro)}
    <button class="btn" id="gx-retry" style="margin-left:10px">Tentar de novo</button></div>`)); return; }
  if(!g.dados){ cont.replaceChildren(el(`<div class="estado">Buscando tickets abertos…</div>`)); return; }
  const id=idApontar(); const hoje=hojeSP();
  const faixaId=id?`<div class="ap-id">🛠 Operando como <strong>${esc(id.nome||id.email)}</strong> <span class="muted small">(atribuições, status e comentários saem no seu usuário do Jira)</span><span class="spacer"></span><button class="btn" data-ap-act="trocar-id">Trocar usuário</button></div>`
    :`<div class="ap-id sem">Para as ações em massa, identifique-se uma vez (e-mail + token de API do Jira).<span class="spacer"></span><button class="btn" data-ap-act="config-id">Identificar-se</button></div>`;
  const todos=(g.dados.tickets)||[];
  const projetos=[...new Set(todos.map(t=>t.p))].sort();
  const resps=[...new Map(todos.filter(t=>t.respId).map(t=>[t.respId,t.resp])).entries()].sort((x,y)=>x[1].localeCompare(y[1],'pt'));
  const statuses=[...new Set(todos.map(t=>t.status))].sort();
  const lista=gxLista();
  const nSel=gxSelKeys().length;
  const todosVis=lista.length>0&&lista.every(t=>g.sel[t.k]);
  const chk=(t)=>`<input type="checkbox" class="gx-chk" data-k="${escA(t.k)}" ${g.sel[t.k]?'checked':''} aria-label="selecionar ${escA(t.k)}">`;
  const linkK=(t)=>`<a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener" title="Abrir no Jira">${esc(t.k)} ↗</a>`;
  const tratado=(t)=>((cfg.tratados||{})[t.k]?` <span class="gx-trat" title="Marcado como tratado no painel">✓ tratado</span>`:'');
  const riscoBadge=(t)=>{ const r=gxRisco(t,hoje);
    return `<span class="aloc-badge ${r.cls}" title="Score ${r.s}/100 — considera atraso, falta de atualização, prioridade, estouro de estimativa e ausência de responsável">${r.rot}</span>`; };
  const upTxt=(t)=>{ const d=gxDiasSemAtu(t,hoje); return d>=999?'—':(d===0?'hoje':`${d}d atrás`); };
  const acts=(t)=>`<span class="gx-acts">
    <button data-gx-r="${escA(t.k)}|HOJE" title="Reprogramar o vencimento para hoje">hoje</button>
    <button data-gx-r="${escA(t.k)}|AMANHA" title="Reprogramar para amanhã">amanhã</button>
    <button data-gx-r="${escA(t.k)}|PROX" title="Reprogramar para a próxima segunda">próx. sem</button>
    <button data-gx-r="${escA(t.k)}|DATA" title="Escolher a data no modal">📅</button>
    <button data-gx-msg="${escA(t.k)}" title="Pedir atualização (comentário no Jira)">💬</button>
    <button data-gx-st="${escA(t.k)}" title="Alterar o status deste ticket no Jira (transição no seu usuário)">🔁 status</button>
    <button data-gx-trf="${escA(t.k)}" title="Transformar em atividade: levar este chamado para dentro de outro (sub-tarefa ou apontamento)">🔀 transformar</button>
    <button data-gx-conv="${escA(t.k)}" title="Convidar pessoas do time a apontar horas neste ticket (aviso por chat individual)">📨 convidar</button>
    <button data-gx-det="${escA(t.k)}" title="Ficha completa do ticket (descrição, comentários, anexos, horas) sem abrir o Jira">🔍 detalhes</button>
    <button data-gx-apont="${escA(t.k)}" title="Apontar horas neste ticket (worklog no seu usuário)">⏱ apontar</button>
    <button data-gx-transf="${escA(t.k)}" title="Transferir para outro ticket: copia os detalhes (e horas) para um ticket novo ou existente e EXCLUI este — igual ao Vincular Reuniões">🔗 transferir</button></span>`;
  // ---- Tabela (densa; padrão) ----
  const htmlTabela=()=>{
    const linha=(t)=>{ const atras=gxAtrasoDias(t,hoje);
      return `<tr class="${g.sel[t.k]?'gx-on':''}">
        <td class="c">${chk(t)}</td>
        <td>${linkK(t)}${tratado(t)}</td>
        <td class="rc-resumo" title="${escA(t.resumo)}">${esc(t.resumo||'—')}</td>
        <td><span class="badge" data-tip="${escA(t.p)}">${esc(projNome(t.p))}</span></td>
        <td><span class="badge">${esc(t.status)}</span></td>
        <td>${esc(t.resp||'—')}</td>
        <td class="gx-venc ${atras?'atrasado':''}">${t.venc?esc(alxDataBR(t.venc)):'—'}</td>
        <td class="num ${atras?'gx-venc atrasado':''}">${atras?atras+'d':'—'}</td>
        <td class="num" title="${(!t.venc||t.venc<=hoje)?'Última movimentação no Jira':'Agendado para o futuro — sem cobrança de atualização'}">${(!t.venc||t.venc<=hoje)?esc(upTxt(t)):'—'}</td>
        <td class="num" title="Horas apontadas">${t.seg?fmtH(t.seg):'—'}</td>
        <td class="num" title="Estimativa original">${t.est?fmtH(t.est):'—'}</td>
        <td>${riscoBadge(t)}</td>
        <td>${acts(t)}</td></tr>`; };
    const grupos=gxAgrupa(lista,hoje);
    const rows=grupos
      ? grupos.map(gr=>`<tr class="gx-grp-row"><td colspan="13"><div class="gx-grp">${gxGrupoCab(gr)}</div></td></tr>${gr.itens.map(linha).join('')}`).join('')
      : lista.map(linha).join('');
    return `<div class="ts-wrap"><table class="rc-tab gx-tab"><thead><tr>
        <th class="c"><input type="checkbox" id="gx-all" ${todosVis?'checked':''} aria-label="selecionar todos"></th>
        <th>Ticket</th><th>Resumo</th><th>Projeto</th><th>Status</th><th>Responsável</th><th>Vencimento</th><th class="num">Atraso</th><th class="num">Últ. atividade</th><th class="num">Horas</th><th class="num">Estim.</th><th>Risco</th><th>Ações rápidas</th></tr></thead>
        <tbody>${rows||'<tr><td colspan="13" class="muted small">Nada encontrado com esses filtros.</td></tr>'}</tbody></table></div>`;
  };
  // ---- Lista (cards operacionais) ----
  // Lista: MESMAS ações por linha da aba Apontar (status, vencimento, responsável,
  // comentar, mover, vincular reunião) — só sem o apontamento de horas. Os painéis
  // do Apontar exigem a estrutura .ap-row/.ap-l2, embutida aqui (classe gx-emb).
  const idAp=idApontar();
  const gxVencBtn=(t,atras)=>{
    if(!idAp) return t.venc?`<span class="badge ${atras?'venc-passado':(t.venc===hoje?'venc-hoje':'')}">${atras?`⚠ ${esc(alxDataBR(t.venc))} · ${atras}d`:esc(alxDataBR(t.venc))}</span>`:'<span class="badge">sem vencimento</span>';
    if(!t.venc) return `<button class="badge st-btn sem-venc" data-ap-venc="${escA(t.k)}" data-tip="Sem data — clique para definir o vencimento">📅 definir vencimento ▾</button>`;
    return `<button class="badge st-btn ${atras?'venc-passado':(t.venc===hoje?'venc-hoje':'')}" data-ap-venc="${escA(t.k)}" data-tip="Vencimento — clique para reagendar">📅 ${atras?`⚠ ${esc(alxDataBR(t.venc))} · ${atras}d`:esc(alxDataBR(t.venc))} ▾</button>`;
  };
  const htmlLista=()=>{
    if(!lista.length) return '<div class="estado">Nada encontrado com esses filtros.</div>';
    const cardDe=(t)=>{ const atras=gxAtrasoDias(t,hoje);
      const ehReuniao=RE_ROTINA.test(t.t||'')||/reuni/i.test(t.resumo||'');
      return `<div class="gx-lrow ${g.sel[t.k]?'sel':''}">
        ${chk(t)}
        <div class="ap-row gx-emb" data-k="${escA(t.k)}" style="flex:1;min-width:0">
          <div class="ap-l1">${linkK(t)}<span class="ap-resumo">${esc(t.resumo||'—')}</span>${tratado(t)}<span class="spacer"></span>${riscoBadge(t)}</div>
          <div class="ap-l2">
            <span class="badge" data-tip="${escA(t.p)}">${esc(projNome(t.p))}</span>
            <span class="badge">${t.tIcon?`<img class="ji-ic" src="${escA(t.tIcon)}" alt="" loading="lazy" onerror="this.remove()">`:''}${esc(t.t||'—')}</span>
            ${idAp?`<button class="badge st-btn" data-ap-st="${escA(t.k)}" data-tip="Status atual — clique para mover o ticket">${esc(t.status)} ▾</button>`:`<span class="badge">${esc(t.status)}</span>`}
            ${t.prio?`<span class="badge">${t.prioIcon?`<img class="ji-ic" src="${escA(t.prioIcon)}" alt="" loading="lazy" onerror="this.remove()">`:''}${esc(t.prio)}</span>`:''}
            ${gxVencBtn(t,atras)}
            ${(!t.venc||t.venc<=hoje)?`<span class="badge" data-tip="Última movimentação no Jira (comentário/alteração) — NÃO é atraso de vencimento">🕓 sem atualização: ${esc(upTxt(t))}</span>`:''}
            <span class="badge" title="Horas apontadas${t.est?' / estimativa':''}">⏱ ${t.seg?fmtH(t.seg):'0h'}${t.est?` / ${fmtH(t.est)}`:''}</span>
            ${idAp?(t.resp?`<button class="badge st-btn" data-ap-resp="${escA(t.k)}" data-tip="Responsável — clique para transferir">👤 ${esc(t.resp)} ▾</button>`
                :`<button class="badge st-btn sem-venc" data-ap-resp="${escA(t.k)}" data-tip="Sem responsável — clique para atribuir">👤 atribuir ▾</button>`)
              :`<span class="badge">${esc(t.resp||'sem responsável')}</span>`}
            ${idAp?`<button class="badge st-btn" data-ap-coment="${escA(t.k)}" data-tip="Adicionar um comentário ao chamado">💬 comentar</button>`:''}
            ${idAp?`<button class="badge st-btn" data-ap-mover="${escA(t.k)}" data-tip="Reclassificar: mover este chamado para outro projeto">🔀 mover</button>`:''}
            ${idAp&&ehReuniao?`<button class="badge st-btn" data-ap-vinc="${escA(t.k)}" data-tip="Vincular esta reunião a um ticket (cria/comenta e EXCLUI a reunião)">🔗 vincular a ticket</button>`:''}
          </div>
          <div class="ap-l2" style="margin-top:6px">${acts(t)}</div>
        </div></div>`; };
    const grupos=gxAgrupa(lista,hoje);
    const corpo2=grupos
      ? grupos.map(gr=>`<div class="gx-grp gx-grp-l">${gxGrupoCab(gr)}</div>${gr.itens.map(cardDe).join('')}`).join('')
      : lista.map(cardDe).join('');
    return `<div class="muted small" style="margin:0 0 8px"><label style="display:inline-flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="gx-all" ${todosVis?'checked':''}> selecionar todos (${lista.length})</label></div>`+corpo2;
  };
  // ---- Quadro (kanban por status — ou pelo campo do "Agrupar por") ----
  const htmlQuadro=()=>{
    if(!lista.length) return '<div class="estado">Nada encontrado com esses filtros.</div>';
    const porCol=new Map();
    lista.forEach(t=>{ const gr=g.agrupar?gxGrupoDe(t,hoje):{k:t.status||'—',rot:t.status||'—'};
      const at=porCol.get(gr.k)||{rot:gr.rot,arr:[]}; at.arr.push(t); porCol.set(gr.k,at); });
    const cols=[...porCol.keys()];
    if(g.agrupar==='venc'||g.agrupar==='risco') cols.sort();
    else cols.sort((x,y)=>porCol.get(y).arr.length-porCol.get(x).arr.length || porCol.get(x).rot.localeCompare(porCol.get(y).rot,'pt'));
    return `<div class="kanban">${cols.map(ck=>{
      const col=porCol.get(ck); const st=col.rot; const arr=col.arr.slice();
      return `<div class="kb-col"><div class="kb-head">${esc(st)} <span>${arr.length}</span></div>
        <div class="kb-cards">${arr.map(t=>{ const atras=gxAtrasoDias(t,hoje);
          return `<div class="kb-card gx-card ${g.sel[t.k]?'sel':''}" data-gx-card="${escA(t.k)}">
          <div class="kb-top"><span class="kb-k">${chk(t)} ${linkK(t)}</span><span class="badge" data-tip="${escA(t.p)}">${esc(projNome(t.p))}</span></div>
          <div class="kb-res">${esc(t.resumo||'')}</div>
          <div class="kb-meta">
            ${riscoBadge(t)}
            ${t.venc?`<span class="badge ${atras?'venc-passado':(t.venc===hoje?'venc-hoje':'')}">${atras?'⚠ ':''}${esc(alxDataBR(t.venc))}</span>`:''}
            ${t.resp?`<span class="badge">${esc(t.resp)}</span>`:'<span class="badge">sem responsável</span>'}
            <button class="kb-stbtn" data-gx-st="${escA(t.k)}" title="Alterar o status deste ticket no Jira">🔁 status</button>
          </div></div>`; }).join('')}</div></div>`;
    }).join('')}</div>
    <div class="muted small" style="margin-top:8px">Clique no cartão para <b>selecionar</b>; o código abre o ticket no Jira.</div>`;
  };
  // Filtro por chaves vindo do 📈 Analytics: mostra a origem, o que ficou de fora, e permite limpar.
  let chipAnalytics='';
  if(Array.isArray(g.soKeys)&&g.soKeys.length){
    const aqui=new Set(todos.map(t=>t.k));
    const faltam=g.soKeys.filter(k=>!aqui.has(k)).length;
    chipAnalytics=`<div class="aviso" style="margin:0 0 10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      📈 Mostrando só os tickets da visão <strong>${esc(g.origem||'do Analytics')}</strong> (${g.soKeys.length-faltam} de ${g.soKeys.length} aqui)
      ${faltam?`<span class="muted small">— ${faltam} não aparecem nesta tela (concluídos ou fora da janela de vencimento)</span>`:''}
      <span class="spacer"></span><button class="chip" data-gx-solimpar="1">✕ limpar filtro do Analytics</button></div>`;
  }
  const vis=['lista','tabela','quadro'].includes(g.vis)?g.vis:'tabela';
  const viewToggle=`<div class="ap-vis" style="margin:0 0 6px"><span class="muted small">Visualização:</span>
    <button class="chip" aria-pressed="${vis==='lista'}" data-gx-vis="lista">▤ Lista</button>
    <button class="chip" aria-pressed="${vis==='tabela'}" data-gx-vis="tabela">▦ Tabela</button>
    <button class="chip" aria-pressed="${vis==='quadro'}" data-gx-vis="quadro">🗂 Quadro</button>
    <span class="spacer"></span>
    <span class="muted small">Agrupar:</span>
    <select id="gx-agrupar" class="aloc-fsel">${GX_AGRUPAR.map(([v,l])=>`<option value="${v}" ${g.agrupar===v?'selected':''}>${esc(l)}</option>`).join('')}</select>
    <span class="muted small">Ordenar:</span>
    <select id="gx-ord" class="aloc-fsel"><option value="risco" ${g.ord==='risco'?'selected':''}>risco</option><option value="venc" ${g.ord==='venc'?'selected':''}>vencimento</option><option value="atual" ${g.ord==='atual'?'selected':''}>última atividade</option></select>
    <label class="muted small" style="display:inline-flex;gap:5px;align-items:center;cursor:pointer"><input type="checkbox" id="gx-semtrat" ${g.semTrat?'checked':''}> esconder tratados</label></div>`;
  const presets=`<div class="ap-vis" style="margin:0 0 10px"><span class="muted small">Prontos:</span>
    ${GX_PRESETS.map(([k,l])=>`<button class="chip" aria-pressed="${g.preset===k}" data-gx-preset="${k}">${esc(l)}</button>`).join(' ')}
    ${g.preset?`<button class="chip" data-gx-preset="">limpar</button>`:''}</div>`;
  const fsalvos=(()=>{ const fs=gxfLista();
    return `<div class="ap-vis" style="margin:0 0 10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="muted small">⭐ Filtros salvos:</span>
      ${fs.slice(0,12).map(f=>`<button class="chip" data-gxf-apl="${escA(f.id)}" title="${f.tipo==='estatico'?'📌 estático — lista congelada':'🔄 dinâmico — critérios'}${f.por?` · por ${escA(f.por)}`:''}">${f.tipo==='estatico'?'📌':'🔄'} ${esc(f.nome)}</button>`).join(' ')}
      ${fs.length?'':'<span class="muted small">nenhum ainda</span>'}
      <button class="chip" data-gxf-salvar="1" title="Salvar os filtros atuais (dinâmico) ou a seleção (estático) com um nome, visível para o time">💾 Salvar filtro</button>
      ${fs.length?`<button class="chip" data-gxf-gerir="1" title="Aplicar, copiar link ou excluir filtros salvos">⚙️ gerenciar</button>`:''}
      <button class="chip" data-gxf-linkatual="1" title="Copiar o endereço desta visão com os filtros atuais — quem abrir vê o mesmo">🔗 copiar link da visão</button></div>`; })();
  const corpo = vis==='lista'?htmlLista() : vis==='quadro'?htmlQuadro() : htmlTabela();
  const bar=nSel?`<div class="gx-bar"><span class="n">${nSel} selecionado(s)</span>
      <button class="btn" data-gx-act="atribuir">👤 Atribuir</button>
      <button class="btn" data-gx-act="status">🔁 Alterar status</button>
      <button class="btn" data-gx-act="rateio" data-tip="Levar a seleção para o ➗ Rateio: divida horas totais entre estes tickets">➗ Rateio de horas</button>
      <button class="btn" data-gx-act="transformar" data-tip="Transformar o ticket selecionado em atividade de outro chamado (sub-tarefa ou apontamento)">🔀 Transformar</button>
      <button class="btn" data-gx-act="comentar">💬 Comentar</button>
      <button class="btn" data-gx-act="reprog">📅 Reprogramar</button>
      <button class="btn" id="gx-tratar">✓ Tratado</button>
      <button class="btn" id="gx-csv-sel">⬇ CSV</button>
      <button class="btn perigo" data-gx-act="excluir">🗑 Excluir</button>
      <span class="spacer"></span><button class="btn" id="gx-limpar">limpar seleção</button></div>`
    :`<div class="muted small" style="margin-top:10px">Marque tickets na primeira coluna para habilitar as <strong>ações em massa</strong> (atribuir · alterar status · comentar · reprogramar · tratado · CSV · excluir). As <strong>ações rápidas</strong> de cada linha reprogramam ou pedem atualização em 1 clique.</div>`;
  cont.replaceChildren(el(`<div>
    ${faixaId}
    <div class="card full">
      <h2>🛠 Gestão de Tickets <span>${todos.length} aberto(s) até ${esc(alxDataBR(g.ate))} · ${lista.length} no filtro</span></h2>
      <div class="ap-filtros">
        <div class="campo"><label>Vencimento até</label><input type="date" id="gx-ate" value="${escA(g.ate)}"></div>
        <div class="campo"><label>Projeto</label><select id="gx-fproj"><option value="">todos</option>${projetos.map(x=>`<option value="${escA(x)}" ${g.fProj===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="campo"><label>Responsável</label><select id="gx-fresp"><option value="">todos</option><option value="__sem__" ${g.fResp==='__sem__'?'selected':''}>— sem responsável —</option>${resps.map(([x,n])=>`<option value="${escA(x)}" ${g.fResp===x?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
        <div class="campo"><label>Status</label><select id="gx-fstatus"><option value="">todos</option>${statuses.map(x=>`<option ${g.fStatus===x?'selected':''}>${esc(x)}</option>`).join('')}</select></div>
        <div class="campo"><label>Buscar</label><input type="search" id="gx-busca" placeholder="código, resumo, pessoa…" value="${escA(g.busca)}"></div>
        <div class="campo"><label>&nbsp;</label><button class="btn" id="gx-refresh">Atualizar</button></div>
        <div class="campo"><label>&nbsp;</label><button class="btn" id="gx-dup" title="Lista os tickets abertos que têm o mesmo resumo e o mesmo vencimento">🧬 Verificar duplicados</button></div>
        <div class="campo"><label>&nbsp;</label><button class="btn" id="gx-epicos" title="Tickets abertos que não estão vinculados a nenhum épico, agrupados por projeto, para vincular ao épico certo">🧩 Ajustar épicos</button></div>
      </div>
      ${chipAnalytics}
      ${viewToggle}
      ${presets}
      ${fsalvos}
      ${corpo}
      ${bar}
    </div></div>`));
  estadoParaURL();   // filtros da Gestão viram parâmetros na URL — copiar o endereço já compartilha a visão
}
