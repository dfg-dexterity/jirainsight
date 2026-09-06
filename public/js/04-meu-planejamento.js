// Jira Insights · 04 · 📋 MEU PLANEJAMENTO — plano semanal por atividade, aprovação,
// relatórios planejado × realizado (planrel), arrastar-e-soltar.
// ---- 📋 Meu Planejamento: planejamento semanal por ATIVIDADE (sem tickets) ----
// Processo: Em elaboração → Enviado ao gestor → Aprovado (ou Devolvido para
// ajustes → corrigido → reenviado). O plano é por DATA + PROJETO + ATIVIDADE +
// HORAS; o realizado vem do Clockwork e a comparação usa accountId + data +
// projeto. Persistência nas tabelas jirainsight_plan_* (Supabase) via
// /api/config?plan=1 — nada fica só no navegador.
// (Helpers ms* legados ficam abaixo só para LEITURA do modelo anterior por
//  tickets — cfg.planosSemana — usado como histórico e pela Alocação.)
function msKey(acc,w){ return `${acc}|${semTravaKey(w)}`; }
function msPlanoDe(acc,w){ return (cfg.planosSemana||{})[msKey(acc,w)]||null; }
function msItens(acc,w){ const p=msPlanoDe(acc,w); return p&&Array.isArray(p.itens)?p.itens:[]; }
function msStatus(p){ return (p&&p.status)||'rascunho'; }
function msDiasUteis(w){ let n=0; for(let i=0;i<7;i++){ const d=somaDias(w,i); if(ehUtil(d)&&!ehFeriado(d)) n++; } return n; }
function msHorasItem(i,w){ const h=Number(i&&i.h)||0; return i&&i.rot?h*msDiasUteis(w):h; }
function msTotalItens(itens,w){ return (itens||[]).reduce((s,i)=>s+msHorasItem(i,w),0); }

// ---------------- estado + API ----------------
const MP_STATUS={ elaboracao:'Em elaboração', enviado:'Enviado para aprovação', aprovado:'Aprovado', devolvido:'Devolvido para ajustes' };
const MP_DIAS=['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];
function mpSem(){ const mp=estado.minhasemana; if(!mp.w) mp.w=semChave(hojeSP()); return mp.w; }
function mpHeaders(){ const id=idApontar()||{}; return { 'Content-Type':'application/json', 'x-jira-email':id.email||'', 'x-jira-token':id.token||'' }; }
async function mpApi(body){
  const r=await fetch('/api/config?plan=1',{ method:'POST', headers:mpHeaders(), body:JSON.stringify(body) });
  return r.json();
}
// Cache do MEU plano por semana (usado pela tela e pelos cards do Início).
function mpGaranteMeu(w, forca, aoTerminar){
  const mp=estado.minhasemana; mp.meu=mp.meu||{}; mp.meuB=mp.meuB||{};
  if(!forca && mp.meu[w]!==undefined) return true;
  if(mp.meuB[w]) return false;
  const id=idApontar(); if(!id||!id.accountId) return false;
  mp.meuB[w]=1;
  mpApi({acao:'meu', semana:w}).then(j=>{
    mp.meuB[w]=0;
    if(j&&j.ok){ mp.meu[w]={plano:j.plano||null}; mp.gestor=!!j.gestor; mp.erro=''; }
    else mp.erro=(j&&j.erro)||'Falha ao carregar o planejamento.';
    if(aoTerminar) aoTerminar();
    if(estado.vista==='minhasemana') renderMinhaSemana();
    else if(estado.vista==='acoes') try{ renderAcoes(); }catch(e){}
  }).catch(e=>{ mp.meuB[w]=0; mp.erro=humanizaErro(e); if(estado.vista==='minhasemana') renderMinhaSemana(); });
  return false;
}
function mpPlano(w){ const c=(estado.minhasemana.meu||{})[w]; return c?c.plano:undefined; }
function mpEditavel(p){ return !p || p.status==='elaboracao' || p.status==='devolvido'; }
// 📆 Início da apuração do Meu Planejamento (cfg compartilhada): semanas e horas
// ANTERIORES a esta data ficam fora dos relatórios — evita "pendências" falsas
// do período em que o time ainda não usava a ferramenta.
function mpInicioVig(){ const d=String(cfg.mpInicio||'').slice(0,10); return /^\d{4}-\d{2}-\d{2}$/.test(d)?d:''; }
// Realizado da semana (Clockwork): worklogs próprios agrupados por data|projeto.
function mpCarregaReal(w, forca){
  const mp=estado.minhasemana; mp.real=mp.real||{}; mp.realB=mp.realB||{};
  if(!forca && mp.real[w]) return; if(mp.realB[w]) return;
  mp.realB[w]=1;
  fetch(`/api/tempo?desde=${encodeURIComponent(w)}&ate=${encodeURIComponent(mtsSoma(w,6))}${forca?'&nocache=1':''}`)
    .then(r=>r.json()).then(j=>{ mp.realB[w]=0;
      mp.real[w]=j.erro?{erro:humanizaErro(j.erro)}:{wl:j.worklogs||[], projetos:j.projetos||{}};
      if(estado.vista==='minhasemana') renderMinhaSemana();
    }).catch(e=>{ mp.realB[w]=0; mp.real[w]={erro:humanizaErro(e)}; if(estado.vista==='minhasemana') renderMinhaSemana(); });
}
function mpRealGrupo(w, acc){
  const r=(estado.minhasemana.real||{})[w]; if(!r||!r.wl) return null;
  const por={}; const porDia={}; const porProj={}; let tot=0;
  r.wl.forEach(x=>{ if(x.a!==acc) return; const d=(x.d||'').slice(0,10); if(d<w||d>mtsSoma(w,6)) return;
    const p=x.p||(x.k?String(x.k).split('-')[0]:'—'); const h=(Number(x.s)||0)/3600;
    por[`${d}|${p}`]=(por[`${d}|${p}`]||0)+h; porDia[d]=(porDia[d]||0)+h; porProj[p]=(porProj[p]||0)+h; tot+=h; });
  return { por, porDia, porProj, tot };
}
// Capacidade: meta/dia da pessoa nos dias úteis (feriado/ausência = 0).
function mpCapDia(acc,d){ return (ehUtil(d)&&!ehFeriado(d)&&!ehAusencia(acc,d))?(metaSegDe(acc)/3600):0; }
function mpCapSem(acc,w){ let s=0; for(let i=0;i<7;i++) s+=mpCapDia(acc,mtsSoma(w,i)); return s; }
const mpH=(n)=>{ const v=Math.round((Number(n)||0)*100)/100; return String(v.toFixed(2)).replace(/\.?0+$/,'').replace('.',',')+'h'; };
const mpPct=(n)=> (n==null?'—':`${Math.round(n)}%`);
// Rascunho local (itens em edição) + salvamento com debounce e trava otimista.
function mpItens(){ const mp=estado.minhasemana; if(!Array.isArray(mp.rasc)) mp.rasc=[]; return mp.rasc; }
function mpCarregaRascunho(w){
  const mp=estado.minhasemana; const p=mpPlano(w);
  if(mp.rascW===w && Array.isArray(mp.rasc)) return;
  mp.rascW=w; mp.rasc=((p&&p.itens)||[]).map(i=>({data:i.data,projeto:i.projeto,descricao:i.descricao,
    categoria:i.categoria||'',horas:Number(i.horas)||0,observacao:i.observacao||'',ordem:i.ordem||0}));
  mp.sujo=false;
}
let _mpSalvaT=null;
function mpAgendaSalvar(){
  const mp=estado.minhasemana; mp.sujo=true;
  clearTimeout(_mpSalvaT); _mpSalvaT=setTimeout(()=>{ mpSalvar(); }, 700);
}
async function mpSalvar(){
  const mp=estado.minhasemana; const w=mp.rascW||mpSem(); const p=mpPlano(w);
  if(!mp.sujo) return true;
  if(p && !mpEditavel(p)) { mp.sujo=false; return false; }
  mp.salvando=true; mpPintaSalvando();
  const itens=mpItens().map((i,ix)=>({...i, ordem:ix}));
  try{
    const j=await mpApi({acao:'salvar', semana:w, itens, base:(p&&p.atualizadoEm)||''});
    mp.salvando=false;
    if(j&&j.ok){ mp.meu[w]={plano:j.plano}; mp.sujo=false; mpPintaSalvando(); return true; }
    if(j&&j.conflito){ mp.meu[w]={plano:j.plano||null}; mp.rascW=''; mpCarregaRascunho(w);
      toast('O plano foi alterado em outra aba — recarreguei a versão mais nova.','warn');
      if(estado.vista==='minhasemana') renderMinhaSemana(); return false; }
    toast((j&&j.erro)||'Não consegui salvar o planejamento.','err'); mpPintaSalvando(); return false;
  }catch(e){ mp.salvando=false; toast('Falha ao salvar: '+humanizaErro(e),'err'); mpPintaSalvando(); return false; }
}
function mpPintaSalvando(){
  const elx=document.getElementById('mp-salvo'); if(!elx) return;
  const mp=estado.minhasemana;
  elx.textContent=mp.salvando?'salvando…':(mp.sujo?'alterações pendentes':'salvo');
}
// Projetos para o seletor (catálogo do Jira, mesmo usado no Planejar).
function mpProjetos(){
  if(!_projetosCache){ garanteProjetos().then(()=>{ if(estado.vista==='minhasemana') renderMinhaSemana(); }).catch(()=>{}); return []; }
  return _projetosCache.map(p=>({key:p.key,nome:p.nome||p.key}));
}
function mpCategorias(){
  const set=new Set(['Desenvolvimento','Reunião','Suporte','Documentação','Gestão','Treinamento']);
  mpItens().forEach(i=>{ if(i.categoria) set.add(i.categoria); });
  return [...set];
}

// ---------------- comparação planejado × realizado ----------------
// Unidade de comparação: accountId + DATA + PROJETO (nunca por ticket).
function mpComparativo(w, acc){
  const p=mpPlano(w); const itens=(p&&p.itens)||[];
  const real=mpRealGrupo(w, acc);
  const plan={}; const planDesc={};
  itens.forEach(i=>{ const k=`${i.data}|${i.projeto}`; plan[k]=(plan[k]||0)+(Number(i.horas)||0);
    (planDesc[k]=planDesc[k]||[]).push(i.descricao); });
  const chaves=[...new Set([...Object.keys(plan), ...(real?Object.keys(real.por):[])])].sort();
  const linhas=chaves.map(k=>{
    const [d,proj]=k.split('|');
    const pl=plan[k]||0; const re=real?(real.por[k]||0):null;
    const dif=re==null?null:re-pl;
    const desvio=(pl>0&&re!=null)?((re-pl)/pl*100):null;
    let sit, cor;
    if(pl>0&&re!=null&&re>0){
      if(Math.abs(desvio)<=10){ sit='Conforme planejado'; cor='ok'; }
      else if(desvio<0){ sit='Abaixo do planejado'; cor=desvio<-40?'ruim':'medio'; }
      else { sit='Acima do planejado'; cor=desvio>40?'ruim':'medio'; }
    } else if(pl>0){ sit=re==null?'Aguardando realizado':'Planejado não realizado'; cor=re==null?'nd':'nd'; }
    else { sit='Realizado não planejado'; cor='medio'; }
    return { data:d, projeto:proj, desc:(planDesc[k]||[]).join(' · '), plan:pl, real:re, dif, desvio, sit, cor };
  });
  const totPlan=Object.values(plan).reduce((s,h)=>s+h,0);
  const totReal=real?real.tot:null;
  const rnp=real?chaves.reduce((s,k)=>s+((plan[k]||0)>0?0:(real.por[k]||0)),0):null;
  const pnr=real!=null?chaves.reduce((s,k)=>s+(((real&&real.por[k])||0)>0?0:(plan[k]||0)),0):null;
  const exec=(totPlan>0&&totReal!=null)?(totReal/totPlan*100):null;
  const porProj={}; const porDia={};
  linhas.forEach(l=>{
    const pp=porProj[l.projeto]=porProj[l.projeto]||{plan:0,real:0};
    pp.plan+=l.plan; pp.real+=(l.real||0);
    const pd=porDia[l.data]=porDia[l.data]||{plan:0,real:0};
    pd.plan+=l.plan; pd.real+=(l.real||0);
  });
  return { linhas, totPlan, totReal, rnp, pnr, exec, porProj, porDia, temReal:!!real };
}
const mpCorSit=(cor)=>({ok:'mp-s-ok',medio:'mp-s-med',ruim:'mp-s-ruim',nd:'mp-s-nd'}[cor]||'mp-s-nd');

// ---------------- render ----------------
function mpStepper(st){
  if(st==='devolvido'){
    return `<div class="mp-fluxo" role="group" aria-label="Etapas do planejamento">
      <span class="mp-step atual">Devolvido para ajustes</span><span class="mp-seta">→</span>
      <span class="mp-step">Corrigido pelo usuário</span><span class="mp-seta">→</span>
      <span class="mp-step">Reenviado</span></div>`;
  }
  const ordem=['elaboracao','enviado','aprovado'];
  const idx=Math.max(0,ordem.indexOf(st));
  const rot=['Em elaboração','Enviado ao gestor','Aprovado'];
  return `<div class="mp-fluxo" role="group" aria-label="Etapas do planejamento">${ordem.map((s,i)=>
    `<span class="mp-step${i<idx?' feito':''}${i===idx?' atual':''}">${rot[i]}</span>`).join('<span class="mp-seta">→</span>')}</div>`;
}
function mpItemRow(i, idx, editavel){
  return `<div class="mp-atv" data-mp-idx="${idx}"${editavel?' draggable="true"':''}>
    ${editavel?'<span class="mp-arrasta" title="Arraste para levar esta atividade a outro dia" aria-hidden="true">⠿</span>':''}
    <div class="mp-atv-c">
      <div class="mp-atv-desc">${esc(i.descricao)}</div>
      <div class="mp-atv-meta"><span data-tip="${escA(i.projeto)}">${esc(projNome(i.projeto))}</span>${i.categoria?` · ${esc(i.categoria)}`:''}${i.observacao?` · <span class="mp-obs" title="${escA(i.observacao)}">obs.</span>`:''}</div>
    </div>
    <div class="mp-atv-h">${mpH(i.horas)}</div>
    ${editavel?`<div class="mp-atv-acoes">
      <button class="mp-lnk" data-mp-editar="${idx}">Editar</button>
      <button class="mp-lnk" data-mp-dup="${idx}">Duplicar</button>
      <button class="mp-lnk" data-mp-mover="${idx}" title="Mover para outro dia (sem arrastar — bom no celular)">Mover</button>
      <button class="mp-lnk" data-mp-sobe="${idx}" aria-label="Subir na ordem">↑</button>
      <button class="mp-lnk" data-mp-desce="${idx}" aria-label="Descer na ordem">↓</button>
      <button class="mp-lnk mp-lnk-x" data-mp-rem="${idx}">Excluir</button>
    </div>`:''}
  </div>`;
}
function mpFormAtividade(dia, item, idx){
  const projs=mpProjetos();
  const cats=mpCategorias();
  const it=item||{projeto:'',descricao:'',horas:'',categoria:'',observacao:''};
  return `<form class="mp-form" data-mp-form="${escA(dia)}" data-mp-formidx="${idx==null?'':idx}">
    <div class="mp-form-l1">
      <label>Projeto<select name="projeto" required>
        <option value="">— escolha —</option>
        ${projs.map(p=>`<option value="${escA(p.key)}" ${it.projeto===p.key?'selected':''}>${esc(p.nome)} (${esc(p.key)})</option>`).join('')}
      </select></label>
      <label>Horas<input name="horas" type="number" min="0.25" step="0.25" required value="${escA(it.horas===''?'':String(it.horas))}"></label>
      <label>Categoria (opcional)<input name="categoria" list="mp-cats" maxlength="60" value="${escA(it.categoria)}"><datalist id="mp-cats">${cats.map(c=>`<option value="${escA(c)}">`).join('')}</datalist></label>
    </div>
    <label>Descrição da atividade<input name="descricao" required maxlength="300" placeholder="o que será feito" value="${escA(it.descricao)}"></label>
    <label>Observação (opcional)<input name="observacao" maxlength="500" value="${escA(it.observacao)}"></label>
    <div class="mp-form-acoes">
      <button type="submit" class="mp-btn mp-btn-p">${idx==null?'Adicionar':'Salvar alteração'}</button>
      <button type="button" class="mp-btn" data-mp-cancelaform="1">Cancelar</button>
    </div>
  </form>`;
}
function mpDiaCard(w, acc, i, editavel, real){
  const mp=estado.minhasemana;
  const d=mtsSoma(w,i);
  const itens=mpItens().map((it,ix)=>({it,ix})).filter(x=>x.it.data===d);
  const cap=mpCapDia(acc,d);
  const plan=itens.reduce((s,x)=>s+(Number(x.it.horas)||0),0);
  const re=real?(real.porDia[d]||0):null;
  const dif=re==null?null:re-plan;
  const feriado=ehUtil(d)&&ehFeriado(d);
  const ausente=ehAusencia(acc,d);
  const aberto=mp.form&&mp.form.dia===d;
  // agrupa visualmente por projeto mantendo a ordem
  const grupos=[]; const gIdx={};
  itens.forEach(x=>{ const p=x.it.projeto; if(!(p in gIdx)){ gIdx[p]=grupos.length; grupos.push({p,rows:[]}); } grupos[gIdx[p]].rows.push(x); });
  return `<section class="mp-dia${plan||re?'':' vazio'}"${editavel?` data-mp-dia="${escA(d)}"`:''} aria-label="${escA(MP_DIAS[i])} ${escA(fmtBR(d))}">
    <header class="mp-dia-h">
      <div><strong>${MP_DIAS[i]}</strong> <span class="mp-dim">${esc(fmtBR(d).slice(0,5))}</span>
        ${feriado?'<span class="mp-tag">Feriado</span>':''}${ausente?'<span class="mp-tag">Ausência</span>':''}</div>
      <div class="mp-dia-tot" data-tip="Capacidade · Planejado · Realizado · Diferença">
        <span title="Capacidade do dia">${mpH(cap)}</span>
        <span title="Planejado" class="mp-b">${mpH(plan)}</span>
        <span title="Realizado">${re==null?'—':mpH(re)}</span>
        <span title="Diferença (realizado − planejado)" class="${dif==null?'':dif>0.01?'mp-mais':dif<-0.01?'mp-menos':''}">${dif==null?'—':(dif>0?'+':'')+mpH(dif).replace('h','')+'h'}</span>
      </div>
    </header>
    ${grupos.map(g=>`<div class="mp-grupo"><div class="mp-grupo-t" data-tip="${escA(g.p)}">${esc(projNome(g.p))}</div>
      ${g.rows.map(x=>mpItemRow(x.it,x.ix,editavel)).join('')}</div>`).join('')||'<div class="mp-vazio">Sem atividades planejadas.</div>'}
    ${editavel?(aberto&&mp.form.editIdx==null?mpFormAtividade(d):`<button class="mp-btn mp-add" data-mp-add="${escA(d)}">Adicionar atividade</button>`):''}
    ${editavel&&aberto&&mp.form.editIdx!=null?mpFormAtividade(d, mpItens()[mp.form.editIdx], mp.form.editIdx):''}
  </section>`;
}
function mpAbasHtml(mp){
  const abas=[['plano','Planejamento'],['comparativo','Planejado × realizado']];
  if(mp.gestor) abas.push(['aprovacoes','Aprovações']);   // decidir é exclusivo do gestor
  abas.push(['relatorios','Relatórios']);                  // relatórios são de TODOS (2026-08-17)
  return `<div class="mp-abas" role="tablist">${abas.map(([k,r])=>
    `<button class="mp-tab${mp.aba===k?' atual':''}" role="tab" aria-selected="${mp.aba===k}" data-mp-aba="${k}">${r}</button>`).join('')}</div>`;
}
function renderMinhaSemana(){
  const cont=document.getElementById('conteudo'); const mp=estado.minhasemana; const id=idApontar();
  if(!id||!id.accountId){
    cont.replaceChildren(el(`<div class="mp-root"><div class="card full mp-card"><h2>Meu Planejamento</h2>
      <div class="estado">Identifique-se (e-mail + token do Jira) para planejar a sua semana.<br>
        <button class="btn primario" data-ap-act="config-id" style="margin-top:10px">Identificar-se</button></div></div></div>`));
    return;
  }
  const acc=id.accountId; const w=mpSem(); const wf=mtsSoma(w,6); const s=isoSemana(w); const wHoje=semChave(hojeSP());
  mp.aba=mp.aba||'plano';
  const pronto=mpGaranteMeu(w);
  mpCarregaReal(w,false);
  if(!pronto && mpPlano(w)===undefined){
    cont.replaceChildren(el(`<div class="mp-root"><div class="card full mp-card"><h2>Meu Planejamento</h2>
      ${mp.erro?`<div class="erro">${esc(mp.erro)} <button class="btn" data-mp-recarregar="1">Tentar de novo</button></div>`
        :'<div class="estado">Carregando o seu planejamento…</div>'}</div></div>`));
    return;
  }
  mpCarregaRascunho(w);
  const p=mpPlano(w);
  const st=(p&&p.status)||'elaboracao';
  const editavel=mpEditavel(p);
  const itens=mpItens();
  const totPlan=itens.reduce((x,i)=>x+(Number(i.horas)||0),0);
  const cap=mpCapSem(acc,w);
  const real=mpRealGrupo(w,acc);
  const totReal=real?real.tot:null;
  const dif=totReal==null?null:totReal-totPlan;
  const legado=msItens(acc,w);
  // ---- cabeçalho da semana ----
  const cab=`<div class="card full mp-card">
    <h2>Meu Planejamento <span>planeje as atividades da semana, envie ao gestor e compare com o realizado</span></h2>
    <div class="mp-head">
      <div class="mp-nav" role="group" aria-label="Navegação de semanas">
        <button class="mp-btn" data-mp-nav="prev">Semana anterior</button>
        <button class="mp-btn${w===wHoje?' mp-btn-p':''}" data-mp-nav="hoje">Semana atual</button>
        <button class="mp-btn" data-mp-nav="next">Próxima semana</button>
      </div>
      <div class="mp-sem"><strong>Semana ${s.num}/${s.ano}</strong><span class="mp-dim">segunda ${esc(fmtBR(w))} a domingo ${esc(fmtBR(wf))}</span></div>
      <span class="spacer"></span>
      <span class="mp-dim" id="mp-salvo" aria-live="polite">${mp.salvando?'salvando…':(mp.sujo?'alterações pendentes':'salvo')}</span>
    </div>
    <div class="mp-kpis">
      <div class="mp-kpi"><div class="v">${mpH(cap)}</div><div class="l">Capacidade disponível</div></div>
      <div class="mp-kpi"><div class="v">${mpH(totPlan)}</div><div class="l">Total planejado</div></div>
      <div class="mp-kpi"><div class="v">${totReal==null?'—':mpH(totReal)}</div><div class="l">Total realizado</div></div>
      <div class="mp-kpi"><div class="v ${dif==null?'':dif>0.01?'mp-mais':dif<-0.01?'mp-menos':''}">${dif==null?'—':(dif>0?'+':'')+mpH(dif)}</div><div class="l">Diferença (real − plan.)</div></div>
      <div class="mp-kpi"><div class="v mp-st-${st}">${MP_STATUS[st]}</div><div class="l">Status do planejamento</div></div>
    </div>
    ${mpStepper(st)}
    ${st==='devolvido'&&p&&p.comentarioGestor?`<div class="mp-devolucao"><strong>Motivo da devolução</strong> (${esc((p.devolvidoPor||'gestor').split('<')[0].trim())}${p.devolvidoEm?`, ${esc(fmtBR((p.devolvidoEm||'').slice(0,10)))}`:''}): ${esc(p.comentarioGestor)}</div>`:''}
    ${st==='aprovado'?`<div class="mp-aprovado">Aprovado por ${esc((p.aprovadoPor||'').split('<')[0].trim()||'gestor')}${p.aprovadoEm?` em ${esc(fmtBR((p.aprovadoEm||'').slice(0,10)))}`:''} · versão ${p.versao||1}. O plano está bloqueado — para alterar, use "Reabrir planejamento".</div>`:''}
    <div class="mp-acoes">
      ${editavel?`<button class="mp-btn mp-btn-p" data-mp-enviar="1" ${itens.length?'':'disabled'}>Enviar para aprovação</button>
        ${!itens.length?'<span class="mp-dim">adicione pelo menos uma atividade para enviar</span>':''}
        ${totPlan>cap+0.01?`<span class="mp-alerta">Atenção: planejado (${mpH(totPlan)}) acima da capacidade (${mpH(cap)}).</span>`:''}`:''}
      ${st==='enviado'?`<span class="mp-dim">Enviado${p&&p.enviadoEm?` em ${esc(fmtBR((p.enviadoEm||'').slice(0,10)))}`:''} · versão ${(p&&p.versao)||1} — edição bloqueada enquanto aguarda decisão.</span>
        <button class="mp-btn" data-mp-retirar="1">Retirar envio</button>`:''}
      ${st==='aprovado'?'<button class="mp-btn" data-mp-reabrir="1">Reabrir planejamento</button>':''}
      ${legado.length?`<button class="mp-lnk" data-mp-legado="1">Modelo anterior desta semana (${legado.length} itens, somente leitura)</button>`:''}
    </div>
  </div>`;
  // ---- corpo por aba ----
  let corpo='';
  if(mp.aba==='plano'){
    const ferram=editavel?`<div class="mp-ferr">
      <button class="mp-btn" data-mp-copiar="1">Copiar semana anterior</button>
      <button class="mp-btn" data-mp-rotina="1">Criar rotina (vários dias)</button>
    </div>`:'';
    const fimDeSemana=[5,6].some(i=>mpItens().some(x=>x.data===mtsSoma(w,i))||((real&&real.porDia[mtsSoma(w,i)])||0)>0);
    corpo=`<div class="card full mp-card"><h2>Planejamento diário <span>projeto + atividade + horas, por dia útil</span></h2>
      ${ferram}
      <div class="mp-dias">
        ${[0,1,2,3,4].map(i=>mpDiaCard(w,acc,i,editavel,real)).join('')}
        ${fimDeSemana?[5,6].map(i=>mpDiaCard(w,acc,i,editavel,real)).join(''):''}
      </div>
    </div>`;
  } else if(mp.aba==='comparativo'){
    const cmp=mpComparativo(w,acc);
    const rErr=(estado.minhasemana.real[w]||{}).erro;
    const tabela=cmp.linhas.length?`<div class="ts-wrap"><table class="mp-tab-cmp">
      <thead><tr><th>Data</th><th>Projeto</th><th>Descrição planejada</th><th class="num">Planejado</th><th class="num">Realizado</th><th class="num">Diferença</th><th class="num">Desvio</th><th>Situação</th></tr></thead>
      <tbody>${cmp.linhas.map(l=>`<tr>
        <td>${esc(fmtBR(l.data))}</td><td data-tip="${escA(l.projeto)}">${esc(projNome(l.projeto))}</td>
        <td class="mp-cel-desc">${esc(l.desc||'—')}</td>
        <td class="num">${l.plan?mpH(l.plan):'—'}</td>
        <td class="num">${l.real==null?'—':mpH(l.real)}</td>
        <td class="num">${l.dif==null?'—':(l.dif>0?'+':'')+mpH(l.dif)}</td>
        <td class="num">${l.desvio==null?'—':(l.desvio>0?'+':'')+Math.round(l.desvio)+'%'}</td>
        <td><span class="mp-sit ${mpCorSit(l.cor)}">${esc(l.sit)}</span></td></tr>`).join('')}</tbody></table></div>`
      :'<div class="estado">Sem planejamento nem realizado nesta semana.</div>';
    corpo=`<div class="card full mp-card"><h2>Por dia <span>comparação por usuário + data + projeto</span></h2>
      ${rErr?`<div class="erro">Realizado indisponível: ${esc(rErr)} <button class="btn" data-mp-recreal="1">Tentar de novo</button></div>`:''}
      ${tabela}
    </div>
    <div class="card full mp-card"><h2>Resumo da semana</h2>
      <div class="mp-kpis">
        <div class="mp-kpi"><div class="v">${mpH(cmp.totPlan)}</div><div class="l">Total planejado</div></div>
        <div class="mp-kpi"><div class="v">${cmp.totReal==null?'—':mpH(cmp.totReal)}</div><div class="l">Total realizado</div></div>
        <div class="mp-kpi"><div class="v">${cmp.totReal==null?'—':(cmp.totReal-cmp.totPlan>0?'+':'')+mpH(cmp.totReal-cmp.totPlan)}</div><div class="l">Diferença em horas</div></div>
        <div class="mp-kpi"><div class="v">${mpPct(cmp.exec)}</div><div class="l">Execução do planejado</div></div>
        <div class="mp-kpi"><div class="v">${cmp.rnp==null?'—':mpH(cmp.rnp)}</div><div class="l">Realizado não planejado</div></div>
        <div class="mp-kpi"><div class="v">${cmp.pnr==null?'—':mpH(cmp.pnr)}</div><div class="l">Planejado não realizado</div></div>
      </div>
      ${mpgColunas('Por dia da semana','planejado × realizado em cada dia',
        [0,1,2,3,4,5,6].map(i=>mtsSoma(w,i)).filter((d,i)=>i<5||cmp.porDia[d])
          .map((d,i)=>[`${MP_DIAS[i]||''} ${fmtBR(d).slice(0,5)}`, cmp.porDia[d]||{plan:0,real:0}, MP_DIAS[i]?MP_DIAS[i].slice(0,3):fmtBR(d).slice(0,5)]))}
      ${mpgBarras('Por projeto','horas planejadas e realizadas na semana',
        Object.entries(cmp.porProj).sort((a,b)=>(b[1].plan+b[1].real)-(a[1].plan+a[1].real)).map(([pj,v])=>[projNome(pj),v,pj]))}
      <div class="mp-2col">
        <div><h3 class="mp-h3">Resultado por projeto</h3>
          <table class="mp-tab-mini"><thead><tr><th>Projeto</th><th class="num">Plan.</th><th class="num">Real.</th><th class="num">Dif.</th></tr></thead>
          <tbody>${Object.entries(cmp.porProj).sort((a,b)=>b[1].plan-a[1].plan).map(([pj,v])=>
            `<tr><td data-tip="${escA(pj)}">${esc(projNome(pj))}</td><td class="num">${mpH(v.plan)}</td><td class="num">${mpH(v.real)}</td><td class="num">${(v.real-v.plan>0?'+':'')+mpH(v.real-v.plan)}</td></tr>`).join('')||'<tr><td colspan="4" class="mp-dim">—</td></tr>'}</tbody></table></div>
        <div><h3 class="mp-h3">Resultado por dia</h3>
          <table class="mp-tab-mini"><thead><tr><th>Dia</th><th class="num">Plan.</th><th class="num">Real.</th><th class="num">Dif.</th></tr></thead>
          <tbody>${Object.entries(cmp.porDia).sort().map(([d,v])=>
            `<tr><td>${esc(fmtBR(d).slice(0,5))}</td><td class="num">${mpH(v.plan)}</td><td class="num">${mpH(v.real)}</td><td class="num">${(v.real-v.plan>0?'+':'')+mpH(v.real-v.plan)}</td></tr>`).join('')||'<tr><td colspan="4" class="mp-dim">—</td></tr>'}</tbody></table></div>
      </div>
    </div>`;
  } else if(mp.aba==='aprovacoes'){
    corpo=mpRenderAprovacoes();
  } else if(mp.aba==='relatorios'){
    corpo=mpRenderRelatorios();
  }
  cont.replaceChildren(el(`<div class="mp-root">${cab}${mpAbasHtml(mp)}${corpo}</div>`));
}

// ---------------- gestor: aprovações ----------------
function mpGarantePend(forca){
  const mp=estado.minhasemana;
  if(!forca && mp.pend) return true;
  if(mp.pendB) return false;
  mp.pendB=1;
  mpApi({acao:'pendencias'}).then(j=>{ mp.pendB=0;
    mp.pend=j&&j.ok?{lista:j.pendencias||[]}:{erro:(j&&j.erro)||'Falha ao carregar.'};
    if(estado.vista==='minhasemana') renderMinhaSemana();
  }).catch(e=>{ mp.pendB=0; mp.pend={erro:humanizaErro(e)}; if(estado.vista==='minhasemana') renderMinhaSemana(); });
  return false;
}
function mpRenderAprovacoes(){
  const mp=estado.minhasemana;
  if(!mpGarantePend(false)&&!mp.pend) return '<div class="card full mp-card"><h2>Aprovações pendentes</h2><div class="estado">Carregando pendências…</div></div>';
  if(mp.pend.erro) return `<div class="card full mp-card"><h2>Aprovações pendentes</h2><div class="erro">${esc(mp.pend.erro)} <button class="btn" data-mp-repend="1">Tentar de novo</button></div></div>`;
  const lista=mp.pend.lista||[];
  if(!lista.length) return '<div class="card full mp-card"><h2>Aprovações pendentes</h2><div class="estado">Nenhum planejamento aguardando decisão.</div><div class="mp-ferr"><button class="mp-btn" data-mp-repend="1">Atualizar</button></div></div>';
  const cards=lista.map(pl=>{
    const cap=mpCapSem(pl.accountId, pl.semana);
    const s=isoSemana(pl.semana);
    const porDia={}; const porProj={}; const obs=[];
    (pl.itens||[]).forEach(i=>{ porDia[i.data]=(porDia[i.data]||0)+i.horas; porProj[i.projeto]=(porProj[i.projeto]||0)+i.horas;
      if(i.observacao) obs.push(`${fmtBR(i.data).slice(0,5)} ${projNome(i.projeto)}: ${i.observacao}`); });
    return `<div class="mp-pend" data-mp-pendid="${escA(pl.id)}">
      <div class="mp-pend-h">
        <div><strong>${esc(pl.nome||pl.email||pl.accountId)}</strong>
          <span class="mp-dim">Semana ${s.num}/${s.ano} (${esc(fmtBR(pl.semana))}) · enviado ${pl.enviadoEm?esc(fmtBR((pl.enviadoEm||'').slice(0,10))):'—'} · versão ${pl.versao||1}</span></div>
        <div class="mp-pend-tot">
          <span data-tip="Total planejado">${mpH(pl.total)}</span>
          <span class="mp-dim" data-tip="Capacidade da pessoa na semana">de ${mpH(cap)}</span>
          <span class="${pl.total-cap>0.01?'mp-mais':''}" data-tip="Diferença planejado − capacidade">${pl.total-cap>0.01?'+'+mpH(pl.total-cap)+' acima':'dentro da capacidade'}</span>
        </div>
      </div>
      <div class="mp-2col">
        <div><span class="mp-h3">Por dia</span> ${Object.entries(porDia).sort().map(([d,h])=>`<span class="mp-tag">${esc(fmtBR(d).slice(0,5))} ${mpH(h)}</span>`).join(' ')||'—'}</div>
        <div><span class="mp-h3">Por projeto</span> ${Object.entries(porProj).sort((a,b)=>b[1]-a[1]).map(([pj,h])=>`<span class="mp-tag" data-tip="${escA(pj)}">${esc(projNome(pj))} ${mpH(h)}</span>`).join(' ')||'—'}</div>
      </div>
      ${obs.length?`<div class="mp-dim">Observações: ${esc(obs.join(' · '))}</div>`:''}
      <details class="mp-det"><summary>Ver as ${(pl.itens||[]).length} atividades</summary>
        <table class="mp-tab-mini"><thead><tr><th>Data</th><th>Projeto</th><th>Descrição</th><th class="num">Horas</th><th>Categoria</th></tr></thead>
        <tbody>${(pl.itens||[]).map(i=>`<tr><td>${esc(fmtBR(i.data).slice(0,5))}</td><td data-tip="${escA(i.projeto)}">${esc(projNome(i.projeto))}</td><td class="mp-cel-desc">${esc(i.descricao)}</td><td class="num">${mpH(i.horas)}</td><td>${esc(i.categoria||'—')}</td></tr>`).join('')}</tbody></table>
      </details>
      <div class="mp-form-acoes">
        <button class="mp-btn mp-btn-p" data-mp-aprovar="${escA(pl.id)}" data-mp-base="${escA(pl.atualizadoEm||'')}">Aprovar</button>
        <button class="mp-btn" data-mp-devolver="${escA(pl.id)}" data-mp-base="${escA(pl.atualizadoEm||'')}">Devolver para ajustes</button>
      </div>
    </div>`;
  }).join('');
  return `<div class="card full mp-card"><h2>Aprovações pendentes <span>${lista.length} planejamento(s) aguardando decisão</span></h2>
    <div class="mp-ferr"><button class="mp-btn" data-mp-repend="1">Atualizar</button></div>${cards}</div>`;
}

// ---------------- gráficos do planejamento (HTML/CSS, sem bibliotecas) -------
// A forma segue o trabalho que o leitor precisa fazer: evolução no tempo →
// colunas agrupadas; comparar itens nomeados (projeto/pessoa) → barras
// horizontais, onde o NOME cabe inteiro; acima/abaixo do plano → barras
// divergentes a partir do zero; composição do status → barra empilhada.
// Toda série tem legenda e a tabela equivalente fica logo abaixo — nenhuma
// informação depende só da cor.
const MPG_TOPO=9;   // itens no gráfico; o excedente vira "Outros (n)" — nunca corta calado
function mpgTopo(ent){
  if(ent.length<=MPG_TOPO) return ent;
  const cauda=ent.slice(MPG_TOPO-1);
  const som=cauda.reduce((o,x)=>({plan:o.plan+x[1].plan,real:o.real+x[1].real}),{plan:0,real:0});
  return ent.slice(0,MPG_TOPO-1).concat([[`Outros (${cauda.length})`,som,'']]);
}
const mpgLeg=()=>'<div class="mpg-leg"><span><i class="mpg-sw plan"></i>Planejado</span><span><i class="mpg-sw real"></i>Realizado</span></div>';
const mpgCab=(t,sub,leg)=>`<div class="mpg-h"><div><div class="mpg-t">${esc(t)}</div>${sub?`<div class="mpg-sub">${esc(sub)}</div>`:''}</div>${leg||''}</div>`;
const mpgVazio=(t,sub)=>`<div class="mpg">${mpgCab(t,sub,mpgLeg())}<div class="mp-vazio">Sem dados no filtro.</div></div>`;
// entradas: [rótulo, {plan,real}, códigoOpcional][] — já ordenadas
function mpgBarras(titulo, sub, entradas){
  if(!entradas.length) return mpgVazio(titulo,sub);
  const itens=mpgTopo(entradas);
  const max=Math.max(0.01,...itens.map(x=>Math.max(x[1].plan,x[1].real)));
  const linhas=itens.map(([rot,v,cod,drill])=>{
    const ex=v.plan>0?Math.round(v.real/v.plan*100):null;
    const tip=`${rot}${cod?` (${cod})`:''} · planejado ${mpH(v.plan)} · realizado ${mpH(v.real)}${ex==null?'':` · execução ${ex}%`}${drill!=null?' · clique para ver os tickets':''}`;
    return `<div class="mpg-row${drill!=null?' mpg-click':''}"${drill!=null?` data-mpdrill="${escA(drill)}" role="button" tabindex="0"`:''} data-tip="${escA(tip)}">
      <div class="mpg-lbl">${esc(rot)}</div>
      <div class="mpg-tr"><i class="mpg-b plan" style="width:${(v.plan/max*100).toFixed(1)}%"></i>
        <i class="mpg-b real" style="width:${(v.real/max*100).toFixed(1)}%"></i></div>
      <div class="mpg-v"><b>${mpH(v.real)}</b> de ${mpH(v.plan)}${ex==null?'':`<br>${ex}%`}</div>
    </div>`;
  }).join('');
  return `<div class="mpg" role="img" aria-label="${escA(titulo)} — planejado e realizado, em horas">
    ${mpgCab(titulo,sub,mpgLeg())}${linhas}</div>`;
}
// entradas: [rótulo, {plan,real}, rótuloCurto][] em ordem cronológica
function mpgColunas(titulo, sub, entradas){
  if(!entradas.length) return mpgVazio(titulo,sub);
  const max=Math.max(0.01,...entradas.map(x=>Math.max(x[1].plan,x[1].real)));
  const cols=entradas.map(([rot,v,curto,drill])=>{
    const ex=v.plan>0?Math.round(v.real/v.plan*100):null;
    const tip=`${rot} · planejado ${mpH(v.plan)} · realizado ${mpH(v.real)}${ex==null?'':` · execução ${ex}%`}${drill!=null?' · clique para ver os tickets':''}`;
    return `<div class="mpg-c${drill!=null?' mpg-click':''}"${drill!=null?` data-mpdrill="${escA(drill)}" role="button" tabindex="0"`:''} data-tip="${escA(tip)}">
      <div class="mpg-cb"><i class="plan" style="height:${(v.plan/max*100).toFixed(1)}%"></i>
        <i class="real" style="height:${(v.real/max*100).toFixed(1)}%"></i></div>
      <div class="mpg-rot"><b>${esc(curto||rot)}</b>${mpH(v.real)}</div></div>`;
  }).join('');
  return `<div class="mpg" role="img" aria-label="${escA(titulo)} — planejado e realizado, em horas">
    ${mpgCab(titulo,sub,mpgLeg())}<div class="mpg-cols">${cols}</div></div>`;
}
// Desvio (realizado − planejado): à direita do zero está acima do plano; à esquerda, abaixo.
function mpgDivergente(titulo, sub, entradas){
  const dif=entradas.map(([rot,v,cod,drill])=>[rot,(v.real-v.plan),cod,drill])
    .filter(x=>Math.abs(x[1])>0.009).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,MPG_TOPO);
  if(!dif.length) return `<div class="mpg">${mpgCab(titulo,sub,'')}<div class="mp-vazio">Tudo dentro do planejado.</div></div>`;
  const max=Math.max(...dif.map(x=>Math.abs(x[1])));
  const leg='<div class="mpg-leg"><span><i class="mpg-sw abaixo"></i>Abaixo do planejado</span><span><i class="mpg-sw acima"></i>Acima do planejado</span></div>';
  const linhas=dif.map(([rot,d,cod,drill])=>`<div class="mpg-dv${drill!=null?' mpg-click':''}"${drill!=null?` data-mpdrill="${escA(drill)}" role="button" tabindex="0"`:''} data-tip="${escA(`${rot}${cod?` (${cod})`:''} · ${d>0?'+':''}${mpH(d)} em relação ao planejado${drill!=null?' · clique para ver os tickets':''}`)}">
      <div class="mpg-lbl">${esc(rot)}</div>
      <div class="mpg-eixo"><i class="${d>0?'acima':'abaixo'}" style="width:${(Math.abs(d)/max*50).toFixed(1)}%"></i></div>
      <div class="mpg-v"><b>${d>0?'+':''}${mpH(d)}</b></div></div>`).join('');
  return `<div class="mpg" role="img" aria-label="${escA(titulo)}">${mpgCab(titulo,sub,leg)}${linhas}</div>`;
}
function mpgStatus(stCount){
  const tot=Object.values(stCount).reduce((s,v)=>s+v,0);
  if(!tot) return '';
  const ordem=['elaboracao','enviado','aprovado','devolvido'];
  const barras=ordem.filter(k=>stCount[k]>0).map(k=>
    `<i class="${k}" style="width:${(stCount[k]/tot*100).toFixed(1)}%" data-tip="${escA(`${MP_STATUS[k]}: ${stCount[k]} de ${tot}`)}"></i>`).join('');
  const leg=ordem.map(k=>`<span><i class="mpg-st-sw ${k}" style="background:${{elaboracao:'var(--muted2)',enviado:'var(--amarelo)',aprovado:'var(--mgr)',devolvido:'var(--err)'}[k]}"></i>${MP_STATUS[k]}: <strong>${stCount[k]}</strong></span>`).join('');
  return `<div class="mpg" role="img" aria-label="Situação dos planejamentos no período">
    ${mpgCab('Situação dos planejamentos',`${tot} planejamento(s) no período`,'')}
    <div class="mpg-st">${barras}</div><div class="mpg-stleg">${leg}</div></div>`;
}

// ---------------- gestor: relatórios ----------------
function mpGaranteRel(forca){
  const mp=estado.minhasemana; const f=mp.relF;
  const chave=`${f.de}|${f.ate}`;
  if(!forca && mp.rel && mp.rel.chave===chave) return true;
  if(mp.relB) return false;
  mp.relB=1;
  Promise.all([
    mpApi({acao:'relatorio', de:f.de, ate:f.ate}),
    fetch(`/api/tempo?desde=${encodeURIComponent(f.de)}&ate=${encodeURIComponent(mtsSoma(f.ate,6))}`).then(r=>r.json()),
  ]).then(([jp,jt])=>{ mp.relB=0;
    if(!jp||!jp.ok){ mp.rel={chave, erro:(jp&&jp.erro)||'Falha ao carregar os planejamentos.'}; }
    else mp.rel={chave, planos:jp.planos||[], wl:(jt&&jt.worklogs)||[], pessoas:(jt&&jt.pessoas)||{}, projetos:(jt&&jt.projetos)||{}, resumos:(jt&&jt.resumos)||{}};
    if(estado.vista==='minhasemana'||estado.vista==='planrel') mpReRender();
  }).catch(e=>{ mp.relB=0; mp.rel={chave, erro:humanizaErro(e)}; if(estado.vista==='minhasemana'||estado.vista==='planrel') mpReRender(); });
  return false;
}
// ⚠️ Um plano por PESSOA + SEMANA: fica o VIGENTE (maior versão; empate pela
// atualização/envio mais recente). Se a base tiver mais de uma linha para a
// mesma pessoa/semana (corrida ao salvar, importação, legado), o relatório
// SOMAVA os dois planejamentos e inflava o "planejado" — aqui só o último vale.
function mpPlanoMaisNovo(a,b){
  const va=Number(a.versao)||1, vb=Number(b.versao)||1;
  if(va!==vb) return va>vb?a:b;
  const qa=String(a.atualizadoEm||a.enviadoEm||''), qb=String(b.atualizadoEm||b.enviadoEm||'');
  if(qa!==qb) return qa>qb?a:b;
  return String(a.id||'')>=String(b.id||'')?a:b;   // desempate estável
}
function mpPlanosVigentes(planos){
  const por={};
  (planos||[]).forEach(p=>{ if(!p) return;
    const k=`${p.accountId}|${p.semana}`;
    por[k]=por[k]?mpPlanoMaisNovo(p,por[k]):p; });
  return Object.values(por);
}
function mpRelDados(){
  const mp=estado.minhasemana; const f=mp.relF; const r=mp.rel;
  if(!r||r.erro) return null;
  let planos=mpPlanosVigentes(r.planos||[]);
  const ini=mpInicioVig();
  if(ini) planos=planos.filter(p=>(p.semana||'')>=ini);
  if(f.usuario) planos=planos.filter(p=>p.accountId===f.usuario);
  if(f.status) planos=planos.filter(p=>p.status===f.status);
  // planejado por chave acc|data|projeto (com filtro de projeto)
  const plan={}; const linhasPlan=[];
  planos.forEach(p=>{ (p.itens||[]).forEach(i=>{ if(f.projeto&&i.projeto!==f.projeto) return;
    plan[`${p.accountId}|${i.data}|${i.projeto}`]=(plan[`${p.accountId}|${i.data}|${i.projeto}`]||0)+i.horas;
    linhasPlan.push({acc:p.accountId,nome:p.nome,data:i.data,projeto:i.projeto,h:i.horas}); }); });
  // realizado agrupado acc|data|projeto (limitado ao período + filtros)
  const accsComPlano=new Set(planos.map(p=>p.accountId));
  const real={};
  (r.wl||[]).forEach(x=>{ const d=(x.d||'').slice(0,10); if(d<f.de||d>mtsSoma(f.ate,6)) return;
    if(ini&&d<ini) return;   // realizado antes da adoção não entra na comparação
    const pj=x.p||(x.k?String(x.k).split('-')[0]:'—');
    if(f.projeto&&pj!==f.projeto) return;
    if(f.usuario&&x.a!==f.usuario) return;
    real[`${x.a}|${d}|${pj}`]=(real[`${x.a}|${d}|${pj}`]||0)+(Number(x.s)||0)/3600; });
  return { planos, plan, real, pessoas:r.pessoas||{}, accsComPlano };
}
// 🤖 Renderiza a análise da IA (resumo + destaques + por pessoa + recomendações).
function mpIaHtml(r){
  const cor=(s)=>s==='positivo'?'#188918':(s==='atencao'?'#B91C1C':'var(--muted)');
  const ic=(s)=>s==='positivo'?'✅':(s==='atencao'?'⚠️':'▪️');
  return `<div class="mp-ia">
    <div class="mp-ia-res">${esc(r.resumo||'')}</div>
    ${(r.destaques||[]).length?`<div class="mp-ia-dest">${r.destaques.map(d=>
      `<div class="mp-ia-d" style="border-left-color:${cor(d.sinal)}"><b>${ic(d.sinal)} ${esc(d.titulo||'')}</b><div class="small">${esc(d.texto||'')}</div></div>`).join('')}</div>`:''}
    ${(r.pessoas||[]).length?`<div style="margin-top:10px"><b class="small">Por pessoa</b>${r.pessoas.map(p=>
      `<div class="mp-ia-p small">${ic(p.sinal)} <b>${esc(p.nome||'')}</b> — ${esc(p.analise||'')}</div>`).join('')}</div>`:''}
    ${(r.recomendacoes||[]).length?`<div class="mp-ia-recs"><b class="small">Recomendações</b><ul>${r.recomendacoes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
    <div class="mp-dim small" style="margin-top:6px">Gerada por IA a partir dos números do recorte — confira antes de decidir.</div>
  </div>`;
}
// Pede a análise ao servidor (/api/resumo?acao=planrel) com o recorte agregado.
// A resposta fica presa à CHAVE do recorte: mudou filtro/período, pede-se de novo.
async function mpIaAnalisa(regenerar){
  const mp=estado.minhasemana; const ia=mp.ia=mp.ia||{res:null,chave:'',carregando:false,erro:''};
  if(!mp.iaCtx||ia.carregando) return;
  ia.carregando=true; ia.erro=''; const chave=mp.iaCtx.chave;
  mpReRender();
  try{
    const j=await fetch('/api/resumo?acao=planrel',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...mp.iaCtx.payload,...(regenerar?{nocache:1}:{})})}).then(r=>r.json());
    ia.carregando=false;
    if(j&&j.ok&&j.analise){ ia.res=j.analise; ia.chave=chave; }
    else ia.erro=(j&&j.erro)||'Não foi possível gerar a análise agora.';
  }catch(e){ ia.carregando=false; ia.erro='Erro de rede: '+String(e.message||e); }
  if(estado.vista==='planrel'||estado.vista==='minhasemana') mpReRender();
}
function mpRenderRelatorios(aud){
  // Audiências: gestor (completa) · exec (resumo de alto nível) · minha (a própria
  // pessoa) · proj (foco projeto a projeto). Cada uma mostra só o que interessa.
  const AUD=['exec','gestor','minha','proj'].includes(aud)?aud:'gestor';
  const S={
    exec:  {kpi:1,sit:1,time:1,difpj:1,vproj:1,evol:1,desv:1},
    gestor:{fUser:1,fProj:1,fStatus:1,fIni:1,kpi:1,sit:1,quem:1,time:1,difpj:1,pess:1,vproj:1,evol:1,g2:1,desv:1,tabs:1},
    minha: {kpi:1,pess:1,evol:1},
    proj:  {fProj:1,kpi:1,difpj:1,vproj:1,evol:1,g2:1,desv:1,tabProj:1},
  }[AUD];
  const mp=estado.minhasemana; const f=mp.relF;
  if(AUD==='minha'){ const idm=idApontar(); if(idm&&idm.accountId) f.usuario=idm.accountId; }
  if(!f.de){ const w=mpSem(); f.ate=w; f.de=mtsSoma(w,-21);
    const ini=mpInicioVig(); if(ini&&f.de<ini) f.de=(ini>w?w:ini); }
  const carregado=mpGaranteRel(false);
  const r=mp.rel;
  const pess=r&&r.pessoas?r.pessoas:{};
  const dados=mpRelDados();
  const usuarios=r&&r.planos?[...new Set(r.planos.map(p=>[p.accountId,p.nome||p.email||p.accountId].join('§')))].map(x=>x.split('§')):[];
  const projetos=r&&r.planos?[...new Set(r.planos.flatMap(p=>(p.itens||[]).map(i=>i.projeto)))].sort():[];
  // 📅 Período por SEMANA DO ANO (S33/2026), não por datas soltas — o plano vive por semana.
  const semOpts=(sel)=>{ const w0=mpSem(); const ops=[];
    for(let i=-51;i<=4;i+=1){ const w2=mtsSoma(w0,i*7); const s=isoSemana(w2);
      ops.push(`<option value="${escA(w2)}" ${w2===sel?'selected':''}>S${s.num}/${s.ano} · ${esc(fmtBR(w2))}</option>`); }
    if(sel&&!ops.some(o=>o.includes(`value="${sel}"`))){ const s=isoSemana(sel);
      ops.unshift(`<option value="${escA(sel)}" selected>S${s.num}/${s.ano} · ${esc(fmtBR(sel))}</option>`); }
    return ops.join(''); };
  const filtros=`<div class="mp-ferr" role="search">
    <label>De (semana do ano)<select data-mp-rf="de">${semOpts(f.de)}</select></label>
    <label>Até (semana do ano)<select data-mp-rf="ate">${semOpts(f.ate)}</select></label>
    ${S.fUser?`<label>Usuário<select data-mp-rf="usuario"><option value="">todos</option>${usuarios.map(([a,n])=>`<option value="${escA(a)}" ${f.usuario===a?'selected':''}>${esc(n)}</option>`).join('')}</select></label>`:''}
    ${S.fProj?`<label>Projeto<select data-mp-rf="projeto"><option value="">todos</option>${projetos.map(pj=>`<option value="${escA(pj)}" ${f.projeto===pj?'selected':''}>${esc(projNome(pj))}</option>`).join('')}</select></label>`:''}
    ${S.fStatus?`<label>Status<select data-mp-rf="status"><option value="">todos</option>${Object.entries(MP_STATUS).map(([k,rot])=>`<option value="${k}" ${f.status===k?'selected':''}>${rot}</option>`).join('')}</select></label>`:''}
    ${S.fIni?`<label title="Data em que o time começou a usar o Meu Planejamento — semanas e horas ANTERIORES ficam fora destes relatórios (configuração do time, não suja a apuração com o período pré-adoção)">📆 Início da apuração<input type="date" value="${escA(mpInicioVig())}" data-mp-rf="inicio"></label>`:''}
    <button class="mp-btn" data-mp-relatualiza="1">Atualizar</button>
    <button class="mp-btn" data-mp-relcsv="1" ${dados?'':'disabled'}>Exportar CSV</button>
  </div>
  <div class="ap-vis" style="margin:2px 0 10px"><span class="muted small">Período rápido:</span>
    ${[2,4,8,12,26].map(n=>{ const sel=f.de&&f.ate&&f.de===mtsSoma(f.ate,-(n-1)*7);
      return `<button class="chip" aria-pressed="${!!sel}" data-mp-rsem="${n}">últimas ${n} semanas</button>`; }).join(' ')}
    ${f.usuario?`<button class="chip" data-mp-ruser="${escA(f.usuario)}" title="Remover o filtro de pessoa">✕ só ${esc((usuarios.find(u=>u[0]===f.usuario)||['',f.usuario])[1].split(' ')[0])}</button>`:''}</div>`;
  if(!carregado&&!r) return `<div class="card full mp-card"><h2>Relatórios de planejamento</h2>${filtros}<div class="estado">Carregando…</div></div>`;
  if(r&&r.erro) return `<div class="card full mp-card"><h2>Relatórios de planejamento</h2>${filtros}<div class="erro">${esc(r.erro)}</div></div>`;
  if(!dados) return `<div class="card full mp-card"><h2>Relatórios de planejamento</h2>${filtros}<div class="estado">Carregando…</div></div>`;
  const nome=(a)=>{ const p=(dados.planos||[]).find(x=>x.accountId===a); return (p&&(p.nome||p.email))||(pess[a]&&pess[a].nome)||a; };
  // agregações
  const porU={}; const porP={}; const porSem={}; const porDia={}; const projPess={};
  const soma=(mapa,k,campo,v)=>{ const o=mapa[k]=mapa[k]||{plan:0,real:0}; o[campo]+=v; };
  Object.entries(dados.plan).forEach(([k,h])=>{ const [a,d,pj]=k.split('|');
    soma(porU,a,'plan',h); soma(porP,pj,'plan',h); soma(porDia,d,'plan',h); soma(porSem,semChave(d),'plan',h);
    (projPess[pj]=projPess[pj]||new Set()).add(a); });
  Object.entries(dados.real).forEach(([k,h])=>{ const [a,d,pj]=k.split('|');
    if(!f.usuario&&!dados.accsComPlano.has(a)) return;   // sem filtro: foca nas pessoas com plano no período
    soma(porU,a,'real',h); soma(porP,pj,'real',h); soma(porDia,d,'real',h); soma(porSem,semChave(d),'real',h);
    (projPess[pj]=projPess[pj]||new Set()).add(a); });
  const rnp=Object.entries(dados.real).reduce((s,[k,h])=>s+((dados.plan[k]||0)>0?0:( !f.usuario&&!dados.accsComPlano.has(k.split('|')[0])?0:h)),0);
  const pnr=Object.entries(dados.plan).reduce((s,[k,h])=>s+((dados.real[k]||0)>0?0:h),0);
  const totPlan=Object.values(porU).reduce((s,v)=>s+v.plan,0);
  const totReal=Object.values(porU).reduce((s,v)=>s+v.real,0);
  const stCount={elaboracao:0,enviado:0,aprovado:0,devolvido:0};
  dados.planos.forEach(p=>{ if(stCount[p.status]!=null) stCount[p.status]++; });
  // 🤖 Contexto da análise por IA: o MESMO recorte agregado que o relatório mostra,
  // compactado (a chave detecta mudança de filtros e invalida a análise anterior).
  (()=>{ const arr2=(m)=>Object.entries(m).sort((x,y)=>(y[1].plan+y[1].real)-(x[1].plan+x[1].real));
    mp.iaCtx={ payload:{
      periodo:{ de:f.de, ate:f.ate, semanas:Object.keys(porSem).length },
      audiencia:AUD,
      filtros:{ usuario:f.usuario?nome(f.usuario):'', projeto:f.projeto?projNome(f.projeto):'', status:f.status||'' },
      totais:{ planejadoH:+totPlan.toFixed(1), realizadoH:+totReal.toFixed(1),
        execucaoPct:totPlan>0?Math.round(totReal/totPlan*100):null,
        realizadoNaoPlanejadoH:+rnp.toFixed(1), planejadoNaoRealizadoH:+pnr.toFixed(1) },
      statusPlanos:stCount,
      pessoas:arr2(porU).slice(0,25).map(([a2,v])=>({ nome:nome(a2), plan:+v.plan.toFixed(1), real:+v.real.toFixed(1),
        status:[...new Set((dados.planos||[]).filter(p=>p.accountId===a2).map(p=>p.status))].join(', ') })),
      projetos:arr2(porP).slice(0,20).map(([pj,v])=>({ projeto:projNome(pj), plan:+v.plan.toFixed(1), real:+v.real.toFixed(1) })),
      semanas:Object.entries(porSem).sort().map(([w2,v])=>({ semana:fmtBR(w2), plan:+v.plan.toFixed(1), real:+v.real.toFixed(1) })),
    }};
    mp.iaCtx.chave=JSON.stringify(mp.iaCtx.payload); })();
  const tab=(titulo, mapa, rot)=>`<div><h3 class="mp-h3">${titulo} <span class="mp-dim">clique numa linha para ver os tickets</span></h3>
    <table class="mp-tab-mini"><thead><tr><th>${rot}</th><th class="num">Planejado</th><th class="num">Realizado</th><th class="num">Dif.</th><th class="num">Execução</th></tr></thead>
    <tbody>${Object.entries(mapa).sort((a,b)=>b[1].plan-a[1].plan).map(([k,v])=>{
      const ex=v.plan>0?Math.round(v.real/v.plan*100)+'%':'—';
      const rk=(rot==='Usuário'?nome(k):(rot==='Dia'||rot==='Semana'?fmtBR(k):projNome(k)));
      const dr=rot==='Usuário'?`a=${k}`:rot==='Projeto'?`pj=${k}`:rot==='Semana'?`w=${k}`:`d=${k}`;
      return `<tr data-mpdrill="${escA(dr)}"><td ${rot==='Projeto'?`data-tip="${escA(k)}"`:''}>${esc(rk)}</td><td class="num">${mpH(v.plan)}</td><td class="num">${mpH(v.real)}</td><td class="num">${(v.real-v.plan>0?'+':'')+mpH(v.real-v.plan)}</td><td class="num">${ex}</td></tr>`; }).join('')||'<tr><td colspan="5" class="mp-dim">Sem dados no filtro.</td></tr>'}</tbody></table></div>`;
  return `<div class="card full mp-card"><h2>Relatórios de planejamento <span>planejado × realizado do time (Clockwork)</span></h2>
    ${filtros}
    <div class="mp-kpis">
      <div class="mp-kpi"><div class="v">${mpH(totPlan)}</div><div class="l">Planejado no período</div></div>
      <div class="mp-kpi mp-kpi-click" data-mpdrill="" title="Clique para ver TODOS os tickets que compõem o realizado"><div class="v">${mpH(totReal)} 🔎</div><div class="l">Realizado no período</div></div>
      <div class="mp-kpi"><div class="v">${totPlan>0?Math.round(totReal/totPlan*100)+'%':'—'}</div><div class="l">Execução</div></div>
      <div class="mp-kpi mp-kpi-click" data-mp-rdrill="rnp" title="Clique para ver DE ONDE vêm estas horas (pessoa → projeto → dia)"><div class="v">${mpH(rnp)} 🔎</div><div class="l">Realizado não planejado</div></div>
      <div class="mp-kpi mp-kpi-click" data-mp-rdrill="pnr" title="Clique para ver O QUE estava no plano e ficou sem horas (pessoa → projeto → dia)"><div class="v">${mpH(pnr)} 🔎</div><div class="l">Planejado não realizado</div></div>
      <div class="mp-kpi"><div class="v">${stCount.enviado} · ${stCount.aprovado} · ${stCount.devolvido}</div><div class="l">Pendentes · Aprovados · Devolvidos</div></div>
    </div>
    ${(()=>{ // 🤖 Análise da IA — lê o recorte atual e devolve destaques + recomendações
      const ia=mp.ia=mp.ia||{res:null,chave:'',carregando:false,erro:''};
      const atual=!!(ia.res&&ia.chave===mp.iaCtx.chave);
      const corpo=ia.carregando?'<div class="estado">🤖 Analisando o planejado × realizado deste recorte…</div>'
        :ia.erro?`<div class="erro">${esc(ia.erro)}</div><div style="margin-top:8px"><button class="mp-btn" data-mp-ia="1">Tentar de novo</button></div>`
        :atual?(mpIaHtml(ia.res)+'<div style="margin-top:8px"><button class="chip" data-mp-ia="1" data-mp-ia-re="1">↻ Regenerar análise</button></div>')
        :`<div class="mp-dim">${ia.res?'Os filtros mudaram desde a última análise — gere de novo para refletir o recorte atual.'
            :'A IA lê os números deste relatório (totais, situação dos planos, pessoas, projetos e semanas do recorte atual) e devolve uma análise com destaques e recomendações práticas.'}</div>
          <div style="margin-top:8px"><button class="mp-btn" data-mp-ia="1">🤖 Analisar com IA</button></div>`;
      return `<div class="mp-iacard"><h3 class="mp-h3">🤖 Análise da IA <span class="mp-dim">planejado × realizado do recorte atual</span></h3>${corpo}</div>`; })()}
    ${S.sit?mpgStatus(stCount):''}
    ${(()=>{ if(!S.quem) return ''; // 👥 QUEM está em cada situação — clique filtra o relatório pela pessoa
      const ini2=mpInicioVig();
      const todos=mpPlanosVigentes((r&&r.planos)||[]).filter(p=>!ini2||(p.semana||'')>=ini2);
      if(!todos.length) return '';
      const bloco=Object.entries(MP_STATUS).map(([st,rot])=>{
        const ps=todos.filter(p=>p.status===st); if(!ps.length) return '';
        return `<div class="mp-st-quem"><span class="mp-dim" style="min-width:170px">${rot}:</span>
          ${ps.sort((a,b)=>(a.semana||'').localeCompare(b.semana||'')).map(p=>
            `<button class="chip" data-mp-ruser="${escA(p.accountId)}" aria-pressed="${f.usuario===p.accountId}"
              title="${escA((p.nome||p.email||p.accountId)+' · semana de '+fmtBR(p.semana)+' · '+mpH(p.total)+' planejadas — clique para filtrar o relatório por esta pessoa')}">
              ${esc((p.nome||p.email||p.accountId).split(' ')[0])} · ${esc(fmtBR(p.semana).slice(0,5))}${(p.versao||1)>1?` · v${p.versao}`:''}</button>`).join(' ')}</div>`;
      }).join('');
      return `<div><h3 class="mp-h3">Quem está em cada situação <span class="mp-dim">clique num nome para filtrar tudo por ele</span></h3>${bloco}</div>`; })()}
    ${(S.time&&!f.usuario)?mpQuemPlanejou(dados,f):''}
    ${S.difpj?mpDifProjetos(porP):''}
    ${(S.pess&&f.usuario)?mpRelPessoaBloco(dados,f,porSem,nome):''}
    ${(()=>{ if(!S.vproj) return ''; // 📁 visão geral por projeto — cartões clicáveis (drill até os tickets)
      const cards=Object.entries(porP).sort((x,y)=>(y[1].plan+y[1].real)-(x[1].plan+x[1].real)).map(([pj,v])=>{
        const ex=v.plan>0?Math.round(v.real/v.plan*100):null;
        const np=(projPess[pj]||new Set()).size;
        const maxpr=Math.max(v.plan,v.real,0.01);
        return `<div class="mp-projcard" data-mpdrill="pj=${escA(pj)}" role="button" tabindex="0"
          data-tip="${escA(projNome(pj)+' ('+pj+') · planejado '+mpH(v.plan)+' · realizado '+mpH(v.real)+' · clique para ver os tickets')}">
          <div class="mp-projcard-h"><b>${esc(projNome(pj))}</b><span class="mp-dim">${np} pessoa(s)</span></div>
          <div class="mp-projcard-n"><span title="Planejado">${mpH(v.plan)}</span><span class="mp-dim">→</span>
            <b title="Realizado">${mpH(v.real)}</b>
            <span class="${ex!=null&&Math.abs(ex-100)<=10?'mp-ok':'mp-mais'}">${ex==null?'—':ex+'%'}</span></div>
          <div class="mp-projbar"><i class="plan" style="width:${(v.plan/maxpr*100).toFixed(1)}%"></i><i class="real" style="width:${(v.real/maxpr*100).toFixed(1)}%"></i></div>
        </div>`; }).join('');
      return cards?`<div><h3 class="mp-h3">📁 Visão geral por projeto <span class="mp-dim">planejado → realizado · clique num cartão para abrir os tickets</span></h3>
        <div class="mp-projgrid">${cards}</div></div>`:''; })()}
    ${(()=>{ const gran=mp.relGran||'sem';
      const tg=`<div class="ap-vis" style="margin:0 0 6px"><span class="muted small">Granularidade:</span>
        <button class="chip" aria-pressed="${gran==='sem'}" data-mp-rgran="sem">por semana</button>
        <button class="chip" aria-pressed="${gran==='dia'}" data-mp-rgran="dia">por dia</button></div>`;
      const ent=gran==='dia'
        ? Object.entries(porDia).sort().map(([d,v])=>[fmtBR(d)+' ('+['dom','seg','ter','qua','qui','sex','sáb'][diaSemana(d)]+')', v, fmtBR(d), `d=${d}`])
        : Object.entries(porSem).sort().map(([w2,v])=>[`Semana de ${fmtBR(w2)}`, v, `S${isoSemana(w2).num}`, `w=${w2}`]);
      return tg+mpgColunas(gran==='dia'?'Evolução por dia':'Evolução por semana',
        `planejado × realizado em cada ${gran==='dia'?'dia':'semana'} do período — clique numa coluna para ver os tickets`, ent); })()}
    ${S.g2?`<div class="mp-2col">
      ${mpgBarras('Por projeto','clique numa barra para ver os tickets do realizado',
        Object.entries(porP).sort((a,b)=>(b[1].plan+b[1].real)-(a[1].plan+a[1].real)).map(([pj,v])=>[projNome(pj),v,pj,`pj=${pj}`]))}
      ${AUD==='proj'?'':mpgBarras('Por pessoa','clique numa barra para ver os tickets da pessoa',
        Object.entries(porU).sort((a,b)=>(b[1].plan+b[1].real)-(a[1].plan+a[1].real)).map(([a2,v])=>[nome(a2),v,'',`a=${a2}`]))}
    </div>`:''}
    ${S.desv?mpgDivergente('Maiores desvios por projeto','diferença entre o realizado e o planejado, em horas — clique para investigar os tickets',
      Object.entries(porP).map(([pj,v])=>[projNome(pj),v,pj,`pj=${pj}`])):''}
    ${S.tabs?`<div class="mp-2col">${tab('Por usuário',porU,'Usuário')}${tab('Por projeto',porP,'Projeto')}</div>
    <div class="mp-2col">${tab('Comparação semanal',porSem,'Semana')}${tab('Comparação diária',porDia,'Dia')}</div>`:''}
    ${S.tabProj?tab('Por projeto',porP,'Projeto'):''}
  </div>`;
}
// 📊 Vista própria "Relatórios do planejamento" (menu Planejamento) com as
// visões por AUDIÊNCIA: 👔 executiva · 🧑‍💼 gestor · 👤 minha · 📁 projetos.
function renderPlanRel(){
  const cont=document.getElementById('conteudo');
  const id=idApontar();
  if(!id||!id.accountId){
    cont.replaceChildren(el(`<div class="card full"><h2>📊 Relatórios do planejamento <span>planejado × realizado por audiência</span></h2>
      <div class="estado">Identifique-se (e-mail + token do Jira) para abrir os relatórios.<br>
        <button class="btn primario" data-ap-act="config-id" style="margin-top:10px">Identificar-se</button></div></div>`));
    return;
  }
  const pr=estado.planrel; if(!['exec','gestor','minha','proj'].includes(pr.aud)) pr.aud='gestor';
  const CHIPS=[['gestor','🧑‍💼 Gestor','a visão completa do time'],
    ['exec','👔 Executiva','resumo de alto nível para acompanhamento'],
    ['minha','👤 Minha visão','o MEU planejado × realizado, semana a semana e dia a dia'],
    ['proj','📁 Projetos','foco projeto a projeto']];
  const nav=`<div class="card full" style="margin-bottom:12px"><h2>📊 Relatórios do planejamento <span>escolha a visão pela audiência — tudo com drill até o ticket</span></h2>
    <div class="ap-vis" style="margin-top:6px">${CHIPS.map(([k,rot,d])=>
      `<button class="chip" aria-pressed="${pr.aud===k}" data-plr-aud="${k}" title="${escA(d)}">${rot}</button>`).join(' ')}</div></div>`;
  cont.replaceChildren(el(`<div>${nav}<div class="mp-root">${mpRenderRelatorios(pr.aud)}</div></div>`));
}
// Re-renderiza a tela certa dos relatórios (aba do Meu Planejamento OU vista própria).
function mpReRender(){ if(estado.vista==='planrel') renderPlanRel(); else renderMinhaSemana(); }
// 👤 Visão analítica do planejamento de UMA pessoa (aparece ao filtrar por usuário):
// KPIs próprios + trajetória semana a semana (status do plano, planejado × realizado,
// execução) + contagem de semanas SEM plano no intervalo (respeitando o início da apuração).
// 🏆 QUEM PLANEJOU MELHOR — visão de TIME do comparativo. Três medidas simples,
// todas explicadas na tela (nada de "métrica mágica"):
//   • Precisão  = o quanto o planejado bateu com o realizado (100 = fez exatamente
//                 o que planejou; erra para mais OU para menos, cai igual);
//   • Aderência = quanto do que a pessoa realizou estava no plano (trabalhou no
//                 que combinou?);
//   • Cobertura = em quantas semanas do período ela entregou plano.
// Score = média de precisão e aderência, ponderada pela cobertura.
function mpPrecisao(plan,real){ if(!(plan>0)) return null;
  return Math.max(0,Math.round(100-Math.abs(real-plan)/plan*100)); }
function mpQuemPlanejou(dados, f){
  const nomes={}; (dados.planos||[]).forEach(p=>{ nomes[p.accountId]=p.nome||p.email||p.accountId; });
  // semanas do período (para a cobertura) e semanas com plano por pessoa
  const sems=[]; { let w=semChave(f.de); const ate=semChave(f.ate); let n=0;
    while(w<=ate&&n<60){ sems.push(w); w=mtsSoma(w,7); n+=1; } }
  const ini=mpInicioVig();
  const semsVal=sems.filter(w=>!ini||w>=semChave(ini));
  const comPlano={}; (dados.planos||[]).forEach(p=>{ (comPlano[p.accountId]=comPlano[p.accountId]||new Set()).add(p.semana); });
  const agg={};
  const pega=(a)=>agg[a]||(agg[a]={a,plan:0,real:0,realNoPlano:0});
  Object.entries(dados.plan).forEach(([k,h])=>{ pega(k.split('|')[0]).plan+=h; });
  Object.entries(dados.real).forEach(([k,h])=>{ const a=k.split('|')[0];
    if(!dados.accsComPlano.has(a)) return;            // só quem participa do planejamento
    const o=pega(a); o.real+=h; if((dados.plan[k]||0)>0) o.realNoPlano+=h; });
  const linhas=Object.values(agg).filter(o=>o.plan>0||o.real>0).map(o=>{
    const prec=mpPrecisao(o.plan,o.real);
    const ader=o.real>0?Math.round(o.realNoPlano/o.real*100):null;
    const nSem=(comPlano[o.a]||new Set()).size;
    const cob=semsVal.length?Math.round(nSem/semsVal.length*100):null;
    const base=(prec==null||ader==null)?null:Math.round((prec+ader)/2*(cob==null?1:Math.min(1,cob/100)));
    return {...o, nome:nomes[o.a]||o.a, prec, ader, nSem, cob, score:base};
  }).sort((x,y)=>(y.score==null?-1:y.score)-(x.score==null?-1:x.score)||y.plan-x.plan);
  if(!linhas.length) return '';
  const med=['🥇','🥈','🥉'];
  const cor=(v)=>v==null?'na':(v>=80?'ok':(v>=50?'aten':'crit'));
  const rows=linhas.map((l,i)=>`<tr data-mpdrill="a=${escA(l.a)}" class="ct-click" role="button" tabindex="0"
      data-tip="${escA(`${l.nome} — clique para ver os tickets do realizado`)}">
    <td>${med[i]||(i+1)+'º'} ${esc(l.nome)}</td>
    <td class="num">${l.nSem}${semsVal.length?`/${semsVal.length}`:''}</td>
    <td class="num">${mpH(l.plan)}</td><td class="num">${mpH(l.real)}</td>
    <td class="num">${l.plan>0?Math.round(l.real/l.plan*100)+'%':'—'}</td>
    <td class="num"><span class="ct-sem ${cor(l.prec)}">${l.prec==null?'—':l.prec+'%'}</span></td>
    <td class="num"><span class="ct-sem ${cor(l.ader)}">${l.ader==null?'—':l.ader+'%'}</span></td>
    <td class="num"><b>${l.score==null?'—':l.score}</b></td></tr>`).join('');
  return `<div><h3 class="mp-h3">🏆 Quem planejou melhor <span class="mp-dim">o time no comparativo — clique numa linha para ver os tickets da pessoa</span></h3>
    <div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Pessoa</th>
      <th class="num" data-tip="Semanas com plano entregue ÷ semanas do período">Semanas</th>
      <th class="num">Planejado</th><th class="num">Realizado</th>
      <th class="num" data-tip="Realizado ÷ planejado">Execução</th>
      <th class="num" data-tip="O quanto o planejado bateu com o realizado — 100% = planejou exatamente o que fez (errar para mais ou para menos pesa igual)">Precisão</th>
      <th class="num" data-tip="Quanto do que a pessoa realizou estava no plano — mede se ela trabalhou no que combinou">Aderência</th>
      <th class="num" data-tip="Média de precisão e aderência, ponderada pelas semanas com plano">Score</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    ${ctExpl('<b>Precisão</b> premia quem acerta o tamanho do próprio plano (estourar 30% pesa igual a ficar 30% abaixo). <b>Aderência</b> mostra se as horas foram para o que estava combinado. O <b>Score</b> junta as duas e desconta quem deixou semanas sem plano — é o ranking de <b>quem planeja melhor</b>, não de quem trabalha mais.')}</div>`;
}
// 📉 MAIORES DIFERENÇAS POR PROJETO — com o percentual de eficiência de cada um.
function mpDifProjetos(porP){
  const linhas=Object.entries(porP).map(([pj,v])=>({pj,plan:v.plan,real:v.real,dif:v.real-v.plan,
      efi:mpPrecisao(v.plan,v.real)}))
    .filter(x=>Math.abs(x.dif)>0.009||x.plan>0)
    .sort((a,b)=>Math.abs(b.dif)-Math.abs(a.dif)).slice(0,12);
  if(!linhas.length) return '';
  const maxDif=Math.max(...linhas.map(x=>Math.abs(x.dif)),0.01);
  const cor=(v)=>v==null?'na':(v>=80?'ok':(v>=50?'aten':'crit'));
  const rows=linhas.map(x=>`<tr data-mpdrill="pj=${escA(x.pj)}" class="ct-click" role="button" tabindex="0"
      data-tip="${escA(`${projNome(x.pj)} — clique para ver os tickets do realizado`)}">
    <td data-tip="${escA(x.pj)}">${esc(projNome(x.pj))}</td>
    <td class="num">${mpH(x.plan)}</td><td class="num">${mpH(x.real)}</td>
    <td class="num"><b class="${x.dif>0?'mp-mais':'mp-ok'}">${x.dif>0?'+':''}${mpH(x.dif)}</b></td>
    <td><div class="mp-difbar"><i class="${x.dif>0?'acima':'abaixo'}" style="width:${(Math.abs(x.dif)/maxDif*100).toFixed(1)}%"></i></div></td>
    <td class="num"><span class="ct-sem ${cor(x.efi)}">${x.efi==null?'—':x.efi+'%'}</span></td>
    <td class="mp-dim small">${x.plan<=0?'realizado sem plano':(x.dif>0?'passou do plano':(x.dif<0?'ficou abaixo':'no alvo'))}</td></tr>`).join('');
  return `<div><h3 class="mp-h3">📉 Maiores diferenças por projeto <span class="mp-dim">onde o plano mais se distanciou da realidade — clique para ver os tickets</span></h3>
    <div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Projeto</th><th class="num">Planejado</th><th class="num">Realizado</th>
      <th class="num">Diferença</th><th></th>
      <th class="num" data-tip="100% = o realizado bateu com o planejado; quanto mais longe (para mais ou para menos), menor">Eficiência</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    ${ctExpl('a <b>diferença</b> é realizado − planejado em horas (a barra compara o tamanho dos desvios entre si). A <b>eficiência</b> é o mesmo desvio em percentual: <b>100% = o plano acertou</b>; 50% significa que errou metade do tamanho planejado — para mais ou para menos. Projeto com "realizado sem plano" é trabalho que aconteceu fora do planejamento.')}</div>`;
}
function mpRelPessoaBloco(dados, f, porSem, nomeFn){
  const a=f.usuario; if(!a) return '';
  const planos=(dados.planos||[]).filter(p=>p.accountId===a);
  const porW={}; planos.forEach(p=>{ porW[p.semana]=p; });
  const ini=mpInicioVig();
  const ate=semChave(f.ate);
  const sems=[]; let w=semChave(f.de), n=0;
  while(w<=ate && n++<106){ if(!ini||w>=ini) sems.push(w); w=mtsSoma(w,7); }
  const st={aprovado:0,enviado:0,devolvido:0,elaboracao:0}; let semPlano=0;
  const rows=sems.map(w2=>{
    const p=porW[w2]; const v=porSem[w2]||{plan:0,real:0};
    if(p&&st[p.status]!=null) st[p.status]++; if(!p) semPlano++;
    const ex=v.plan>0?Math.round(v.real/v.plan*100)+'%':'—';
    const badge=p?`<span class="badge">${esc(MP_STATUS[p.status]||p.status)}${(p.versao||1)>1?` · v${p.versao}`:''}</span>`
                 :'<span class="badge" style="opacity:.55">sem plano</span>';
    return `<tr data-mpdrill="a=${escA(a)}&w=${escA(w2)}" title="clique para ver os tickets do realizado desta semana"><td>${esc(fmtBR(w2))}</td><td>${badge}</td><td class="num">${mpH(v.plan)}</td><td class="num">${mpH(v.real)}</td>
      <td class="num">${(v.real-v.plan>0?'+':'')+mpH(v.real-v.plan)}</td><td class="num">${ex}</td></tr>`;
  }).join('');
  const totP=sems.reduce((s,w2)=>s+((porSem[w2]||{}).plan||0),0);
  const totR=sems.reduce((s,w2)=>s+((porSem[w2]||{}).real||0),0);
  return `<div class="mp-card" style="border:1px solid var(--mpb);border-radius:12px;padding:12px 14px;margin:0 0 14px">
    <h3 class="mp-h3">👤 Análise de ${esc(nomeFn(a))} <span class="mp-dim">o planejamento desta pessoa, semana a semana — clique no nome de novo (ou no ✕) para voltar ao time</span></h3>
    <div class="mp-kpis">
      <div class="mp-kpi"><div class="v">${mpH(totP)}</div><div class="l">Planejado</div></div>
      <div class="mp-kpi"><div class="v">${mpH(totR)}</div><div class="l">Realizado</div></div>
      <div class="mp-kpi"><div class="v">${totP>0?Math.round(totR/totP*100)+'%':'—'}</div><div class="l">Execução</div></div>
      <div class="mp-kpi"><div class="v">${st.aprovado} · ${st.enviado} · ${st.devolvido}</div><div class="l">Aprovados · Enviados · Devolvidos</div></div>
      <div class="mp-kpi"><div class="v">${semPlano}</div><div class="l">Semanas SEM plano</div></div>
    </div>
    <table class="mp-tab-mini"><thead><tr><th>Semana</th><th>Plano</th><th class="num">Planejado</th><th class="num">Realizado</th><th class="num">Dif.</th><th class="num">Execução</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="6" class="mp-dim">Sem semanas no intervalo.</td></tr>'}</tbody></table>
    ${(()=>{ // 📆 dia a dia da pessoa — o nível mais fino, com drill até o ticket
      const planD={}, realD={}; const diasSet=new Set();
      Object.entries(dados.plan).forEach(([k,h])=>{ const [a2,d]=k.split('|'); if(a2!==a) return; planD[d]=(planD[d]||0)+h; diasSet.add(d); });
      Object.entries(dados.real).forEach(([k,h])=>{ const [a2,d]=k.split('|'); if(a2!==a) return; realD[d]=(realD[d]||0)+h; diasSet.add(d); });
      const dias=[...diasSet].sort();
      if(!dias.length) return '';
      const linhas=dias.map(d=>{ const pl=planD[d]||0, re=realD[d]||0; const ex=pl>0?Math.round(re/pl*100)+'%':'—';
        return `<tr data-mpdrill="a=${escA(a)}&d=${escA(d)}" title="clique para ver os tickets deste dia">
          <td>${esc(fmtBR(d))} <span class="mp-dim">${['dom','seg','ter','qua','qui','sex','sáb'][diaSemana(d)]}</span></td>
          <td class="num">${mpH(pl)}</td><td class="num">${mpH(re)}</td>
          <td class="num">${(re-pl>0?'+':'')+mpH(re-pl)}</td><td class="num">${ex}</td></tr>`; }).join('');
      return `<details style="margin-top:10px"><summary><b>📆 Dia a dia</b> <span class="mp-dim">planejado × realizado por dia — clique numa linha para ver os tickets</span></summary>
        <table class="mp-tab-mini" style="margin-top:6px"><thead><tr><th>Dia</th><th class="num">Planejado</th><th class="num">Realizado</th><th class="num">Dif.</th><th class="num">Execução</th></tr></thead>
        <tbody>${linhas}</tbody></table></details>`; })()}
  </div>`;
}
// 🎫 Drill até o TICKET: quais chamados compõem o realizado de um recorte
// (pessoa/dia/semana/projeto, combináveis). Abre a ficha (🔍) sem sair do painel.
function mpAbreTickets(qs){
  const mp=estado.minhasemana; const r=mp.rel; const dados=mpRelDados(); if(!r||!dados) return;
  const p=new URLSearchParams(qs||'');
  const fa=p.get('a')||'', fd=p.get('d')||'', fpj=p.get('pj')||'', fw=p.get('w')||'';
  const f=mp.relF; const ini=mpInicioVig(); const fim=mtsSoma(f.ate,6);
  const porTk=new Map(); let tot=0;
  (r.wl||[]).forEach(x=>{ const d=(x.d||'').slice(0,10);
    if(d<f.de||d>fim) return; if(ini&&d<ini) return;
    const pj=x.p||(x.k?String(x.k).split('-')[0]:'—');
    if(f.projeto&&pj!==f.projeto) return;
    if(f.usuario&&x.a!==f.usuario) return;
    if(!f.usuario&&!fa&&!dados.accsComPlano.has(x.a)) return;
    if(fa&&x.a!==fa) return;
    if(fd&&d!==fd) return;
    if(fw&&(d<fw||d>mtsSoma(fw,6))) return;
    if(fpj&&pj!==fpj) return;
    const k=x.k||'—'; const o=porTk.get(k)||{s:0,pj,pessoas:new Set(),n:0};
    o.s+=(Number(x.s)||0)/3600; o.n+=1; o.pessoas.add(x.a); porTk.set(k,o); tot+=(Number(x.s)||0)/3600; });
  const nomeDe=(a2)=>(((r.pessoas||{})[a2]||{}).nome)||a2;
  const resumos=r.resumos||{};
  const recorte=[fa?`pessoa ${nomeDe(fa)}`:'', fd?`dia ${fmtBR(fd)}`:'', fw?`semana de ${fmtBR(fw)}`:'', fpj?`projeto ${projNome(fpj)}`:''].filter(Boolean).join(' · ');
  const linhas=[...porTk.entries()].sort((x,y)=>y[1].s-x[1].s).map(([k,o])=>`
    <div class="cv-row">
      <strong>${k==='—'?'(sem ticket)':esc(k)}</strong>
      <span class="mp-dim" style="flex:1;min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(resumos[k]||'')}</span>
      <span class="badge" data-tip="${escA(o.pj)}">${esc(projNome(o.pj))}</span>
      <span class="badge" data-tip="${o.n} apontamento(s)">${mpH(o.s)}</span>
      <span class="badge" data-tip="quem apontou">${[...o.pessoas].map(a2=>esc(String(nomeDe(a2)).split(' ')[0])).join(', ')}</span>
      ${k!=='—'?`<button class="btn" data-gx-det="${escA(k)}" data-tip="Ficha completa sem abrir o Jira">🔍 detalhes</button>
      <a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(k)}" target="_blank" rel="noopener">Jira ↗</a>`:''}
    </div>`).join('');
  abreModal(`<h2>🎫 Tickets do realizado · ${mpH(tot)}</h2>
    <div class="muted small">${esc(recorte||'período todo (com os filtros atuais)')} — o que compõe as horas realizadas, do maior para o menor.</div>
    <div class="cv-lista" style="margin-top:10px;max-height:420px;overflow:auto">${linhas||'<div class="alx-vazio">Nada apontado neste recorte.</div>'}</div>
    <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`);
}
// 🔎 De onde vêm as horas: drill dos KPIs "Realizado não planejado" e
// "Planejado não realizado" — pessoa → projeto → dias, do maior para o menor.
function mpAbreDrill(tipo){
  const dados=mpRelDados(); if(!dados) return;
  const f=estado.minhasemana.relF;
  const nomeDe=(a)=>{ const p=(dados.planos||[]).find(x=>x.accountId===a); return (p&&(p.nome||p.email))||a; };
  const linhas=[];
  if(tipo==='rnp'){
    Object.entries(dados.real).forEach(([k,h])=>{ if((dados.plan[k]||0)>0) return;
      const [a,d,pj]=k.split('|'); if(!f.usuario&&!dados.accsComPlano.has(a)) return;
      linhas.push({a,d,pj,h}); });
  } else {
    Object.entries(dados.plan).forEach(([k,h])=>{ if((dados.real[k]||0)>0) return;
      const [a,d,pj]=k.split('|'); linhas.push({a,d,pj,h}); });
  }
  const tot=linhas.reduce((s,x)=>s+x.h,0);
  const porA={};
  linhas.forEach(x=>{ const o=porA[x.a]=porA[x.a]||{tot:0,projs:{}};
    o.tot+=x.h; const pr=o.projs[x.pj]=o.projs[x.pj]||{tot:0,dias:[]}; pr.tot+=x.h;
    pr.dias.push(`${fmtBR(x.d).slice(0,5)} ${mpH(x.h)}`); });
  const corpo=Object.entries(porA).sort((x,y)=>y[1].tot-x[1].tot).map(([a,o])=>`
    <div class="mp-pend" style="padding:10px 12px">
      <div class="mp-pend-h"><strong>${esc(nomeDe(a))}</strong><span class="mp-pend-tot">${mpH(o.tot)}</span></div>
      <div>${Object.entries(o.projs).sort((x,y)=>y[1].tot-x[1].tot).map(([pj,pr])=>
        `<div class="mp-atv-meta" style="margin-top:4px"><b data-tip="${escA(pj)}">${esc(projNome(pj))}</b> · ${mpH(pr.tot)} <span class="mp-dim">(${pr.dias.join(' · ')})</span></div>`).join('')}</div>
    </div>`).join('');
  abreModal(`<h2>${tipo==='rnp'?'🔎 Realizado não planejado':'🔎 Planejado não realizado'} · ${mpH(tot)}</h2>
    <div class="muted small">${tipo==='rnp'
      ?'Horas APONTADAS em dia/projeto que não estavam no plano da pessoa — é daqui que vem o número do cartão.'
      :'O que estava no plano e ficou SEM nenhuma hora apontada naquele dia/projeto.'}</div>
    <div class="nov-lista" style="margin-top:10px">${corpo||'<div class="alx-vazio">✓ Nada por aqui com os filtros atuais.</div>'}</div>
    <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`);
}
// CSV pt-BR (datas dd/mm/aaaa, decimais com vírgula, separador ';').
function mpExportaCSV(){
  const dados=mpRelDados(); if(!dados) return;
  const f=estado.minhasemana.relF;
  const nome=(a)=>{ const p=(dados.planos||[]).find(x=>x.accountId===a); return (p&&(p.nome||p.email))||a; };
  const chaves=[...new Set([...Object.keys(dados.plan),...Object.keys(dados.real).filter(k=>f.usuario||dados.accsComPlano.has(k.split('|')[0]))])].sort();
  const linhas=[['Usuário','Data','Projeto','Código do projeto','Horas planejadas','Horas realizadas','Diferença','Execução %','Situação']];
  chaves.forEach(k=>{ const [a,d,pj]=k.split('|');
    const pl=dados.plan[k]||0; const re=dados.real[k]||0; const dif=re-pl;
    const sit=pl>0?(re>0?(Math.abs((re-pl)/pl*100)<=10?'Conforme planejado':(re<pl?'Abaixo do planejado':'Acima do planejado')):'Planejado não realizado'):'Realizado não planejado';
    linhas.push([nome(a), fmtBR(d), projNome(pj), pj, dec(pl*3600), dec(re*3600), dec(dif*3600), pl>0?String(Math.round(re/pl*100)).replace('.',','):'', sit]); });
  const csv='﻿'+linhas.map(l=>l.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`planejamento_${f.de}_a_${f.ate}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

// ---------------- modais (duplicar / rotina / legado / devolução) ----------------
function mpAbreDuplicar(idx){
  const it=mpItens()[idx]; if(!it) return; const w=mpSem();
  abreModal(`<h2>Duplicar atividade</h2>
    <div class="muted small">“${esc(it.descricao)}” (${esc(projNome(it.projeto))}, ${mpH(it.horas)}) — escolha os dias que vão receber uma cópia.</div>
    <div class="mp-checks">${[0,1,2,3,4,5,6].map(i=>{ const d=mtsSoma(w,i);
      return `<label class="check"><input type="checkbox" data-mp-dupdia="${escA(d)}" ${d===it.data?'disabled':''}> ${MP_DIAS[i]} ${esc(fmtBR(d).slice(0,5))}${d===it.data?' (origem)':''}</label>`; }).join('')}</div>
    <div class="mp-form-acoes"><button class="mp-btn mp-btn-p" data-mp-dupconf="${idx}">Duplicar</button>
      <button class="mp-btn" data-mp-fechamodal="1">Cancelar</button></div>`);
}
function mpAbreMover(idx){
  const it=mpItens()[idx]; if(!it) return; const w=mpSem();
  abreModal(`<h2>Mover atividade</h2>
    <div class="muted small">“${esc(it.descricao)}” (${esc(projNome(it.projeto))}, ${mpH(it.horas)}) — para qual dia?</div>
    <div class="mp-checks">${[0,1,2,3,4,5,6].map(i=>{ const d=mtsSoma(w,i);
      return `<button class="mp-btn" data-mp-movdia="${idx}|${escA(d)}" ${d===it.data?'disabled':''} style="margin:2px 4px 2px 0">${MP_DIAS[i]} ${esc(fmtBR(d).slice(0,5))}${d===it.data?' (atual)':''}</button>`; }).join('')}</div>
    <div class="mp-form-acoes"><button class="mp-btn" data-mp-fechamodal="1">Cancelar</button></div>`);
}
function mpAbreRotina(){
  const w=mpSem(); const projs=mpProjetos();
  abreModal(`<h2>Criar rotina</h2>
    <div class="muted small">A mesma atividade entra em vários dias úteis da semana (ex.: reunião diária).</div>
    <div class="mp-form" style="margin-top:8px">
      <div class="mp-form-l1">
        <label>Projeto<select id="mp-rot-proj"><option value="">— escolha —</option>${projs.map(p=>`<option value="${escA(p.key)}">${esc(p.nome)} (${esc(p.key)})</option>`).join('')}</select></label>
        <label>Horas por dia<input id="mp-rot-h" type="number" min="0.25" step="0.25" value="1"></label>
        <label>Categoria (opcional)<input id="mp-rot-cat" maxlength="60"></label>
      </div>
      <label>Descrição<input id="mp-rot-desc" maxlength="300" placeholder="ex.: Reunião diária do projeto"></label>
      <div class="mp-checks">${[0,1,2,3,4].map(i=>{ const d=mtsSoma(w,i); const ut=ehUtil(d)&&!ehFeriado(d);
        return `<label class="check"><input type="checkbox" data-mp-rotdia="${escA(d)}" ${ut?'checked':''}> ${MP_DIAS[i]} ${esc(fmtBR(d).slice(0,5))}${ut?'':' (feriado)'}</label>`; }).join('')}</div>
      <div class="mp-form-acoes"><button class="mp-btn mp-btn-p" data-mp-rotconf="1">Criar rotina</button>
        <button class="mp-btn" data-mp-fechamodal="1">Cancelar</button></div>
    </div>`);
}
function mpAbreLegado(){
  const id=idApontar(); const w=mpSem(); const itens=msItens(id.accountId,w); const pn=msPlanoDe(id.accountId,w);
  abreModal(`<h2>Modelo anterior <span class="muted small">(planejamento por tickets — somente leitura)</span></h2>
    <div class="muted small">Este é o plano desta semana no modelo antigo, mantido como histórico.${pn&&pn.status?` Status na época: ${esc(pn.status)}.`:''}</div>
    <table class="mp-tab-mini" style="margin-top:8px"><thead><tr><th>Ticket</th><th class="num">Horas</th><th>Rotina</th></tr></thead>
    <tbody>${itens.map(i=>`<tr><td><a href="${projJira(i.k)}" target="_blank" rel="noopener">${esc(i.k)}</a></td><td class="num">${mpH(i.h)}${i.rot?'/dia':''}</td><td>${i.rot?'diária':'—'}</td></tr>`).join('')||'<tr><td colspan="3" class="mp-dim">Sem itens.</td></tr>'}</tbody></table>`);
}
function mpAbreDevolver(idc, base){
  abreModal(`<h2>Devolver para ajustes</h2>
    <div class="muted small">Explique o que precisa mudar — o comentário é obrigatório e aparece para a pessoa.</div>
    <textarea id="mp-dev-coment" class="alx-coment" style="margin-top:8px" placeholder="ex.: redistribua as horas de quinta; o projeto X não está previsto para esta semana"></textarea>
    <div class="mp-form-acoes"><button class="mp-btn mp-btn-p" data-mp-devconf="${escA(idc)}" data-mp-base="${escA(base||'')}">Devolver</button>
      <button class="mp-btn" data-mp-fechamodal="1">Cancelar</button></div>
    <div class="ap-fb" id="mp-dev-fb" hidden></div>`);
}

// ---------------- interações ----------------
// 🖐 Arrastar e soltar: leva a atividade de um dia para outro (só com o plano
// editável — as linhas nem viram "draggable" quando está enviado/aprovado).
let _mpDragIdx=null;
document.addEventListener('dragstart',(e)=>{
  const r=e.target.closest&&e.target.closest('.mp-atv[draggable="true"]'); if(!r) return;
  _mpDragIdx=+r.getAttribute('data-mp-idx');
  r.classList.add('mp-arrastando');
  try{ e.dataTransfer.setData('text/plain', String(_mpDragIdx)); e.dataTransfer.effectAllowed='move'; }catch(_){}
});
document.addEventListener('dragend',()=>{ _mpDragIdx=null;
  document.querySelectorAll('.mp-arrastando').forEach(x=>x.classList.remove('mp-arrastando'));
  document.querySelectorAll('.mp-dia.mp-solta').forEach(x=>x.classList.remove('mp-solta')); });
document.addEventListener('dragover',(e)=>{
  const s=e.target.closest&&e.target.closest('[data-mp-dia]'); if(!s||_mpDragIdx==null) return;
  e.preventDefault(); try{ e.dataTransfer.dropEffect='move'; }catch(_){}
  if(!s.classList.contains('mp-solta')){
    document.querySelectorAll('.mp-dia.mp-solta').forEach(x=>x.classList.remove('mp-solta'));
    s.classList.add('mp-solta'); }
});
document.addEventListener('drop',(e)=>{
  const s=e.target.closest&&e.target.closest('[data-mp-dia]'); if(!s||_mpDragIdx==null) return;
  e.preventDefault();
  const it=mpItens()[_mpDragIdx]; const d=s.getAttribute('data-mp-dia'); _mpDragIdx=null;
  if(!it||it.data===d){ renderMinhaSemana(); return; }
  const de=it.data; it.data=d;
  mpAgendaSalvar(); renderMinhaSemana();
  toast(`↔ "${esc((it.descricao||'atividade').slice(0,40))}" foi de ${fmtBR(de).slice(0,5)} para ${fmtBR(d).slice(0,5)}.`,'ok');
});
document.addEventListener('click', async (e)=>{
  const t=e.target.closest&&e.target.closest('[data-mp-nav],[data-mp-aba],[data-mp-add],[data-mp-editar],[data-mp-rem],[data-mp-dup],[data-mp-sobe],[data-mp-desce],[data-mp-enviar],[data-mp-retirar],[data-mp-reabrir],[data-mp-copiar],[data-mp-rotina],[data-mp-legado],[data-mp-cancelaform],[data-mp-recarregar],[data-mp-recreal],[data-mp-repend],[data-mp-aprovar],[data-mp-devolver],[data-mp-devconf],[data-mp-dupconf],[data-mp-rotconf],[data-mp-fechamodal],[data-mp-relatualiza],[data-mp-relcsv],[data-mp-mover],[data-mp-movdia],[data-mp-rsem],[data-mp-ruser],[data-mp-rdrill],[data-mp-rgran],[data-mp-ia],[data-mpdrill],[data-plr-aud]');
  if(!t) return;
  const mp=estado.minhasemana; const id=idApontar();
  if(t.hasAttribute('data-mp-fechamodal')){ fechaModal(); return; }
  if(!id||!id.accountId) return;
  const w=mpSem(); const p=mpPlano(w);
  const guardaEdicao=()=>{ if(!mpEditavel(p)){ toast(p&&p.status==='enviado'?'Plano aguardando decisão — retire o envio para editar.':'Plano aprovado — use "Reabrir planejamento".','warn'); return true; } return false; };
  if(t.hasAttribute('data-mp-nav')){
    await mpSalvar();
    const d=t.getAttribute('data-mp-nav');
    mp.w=d==='hoje'?semChave(hojeSP()):mtsSoma(w, d==='prev'?-7:7);
    mp.form=null; renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-aba')){ mp.aba=t.getAttribute('data-mp-aba'); mp.form=null; renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-recarregar')){ mp.erro=''; mpGaranteMeu(w,true); renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-recreal')){ mpCarregaReal(w,true); renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-add')){ if(guardaEdicao()) return; mp.form={dia:t.getAttribute('data-mp-add'), editIdx:null}; renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-cancelaform')){ mp.form=null; renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-editar')){ if(guardaEdicao()) return; const ix=+t.getAttribute('data-mp-editar');
    const it=mpItens()[ix]; if(!it) return; mp.form={dia:it.data, editIdx:ix}; renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-rem')){ if(guardaEdicao()) return; const ix=+t.getAttribute('data-mp-rem');
    mpItens().splice(ix,1); mpAgendaSalvar(); renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-sobe')||t.hasAttribute('data-mp-desce')){ if(guardaEdicao()) return;
    const ix=+(t.getAttribute('data-mp-sobe')||t.getAttribute('data-mp-desce'));
    const dir=t.hasAttribute('data-mp-sobe')?-1:1;
    const itens=mpItens(); const it=itens[ix]; if(!it) return;
    const doDia=itens.map((x,i2)=>({x,i2})).filter(y=>y.x.data===it.data);
    const pos=doDia.findIndex(y=>y.i2===ix); const alvo=doDia[pos+dir]; if(!alvo) return;
    itens[ix]=alvo.x; itens[alvo.i2]=it;
    mpAgendaSalvar(); renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-dup')){ if(guardaEdicao()) return; mpAbreDuplicar(+t.getAttribute('data-mp-dup')); return; }
  if(t.hasAttribute('data-mp-mover')){ if(guardaEdicao()) return; mpAbreMover(+t.getAttribute('data-mp-mover')); return; }
  if(t.hasAttribute('data-mp-movdia')){ if(guardaEdicao()) return;
    const at=t.getAttribute('data-mp-movdia'); const sep=at.indexOf('|');
    const it=mpItens()[+at.slice(0,sep)]; const d=at.slice(sep+1); if(!it||it.data===d) return;
    const de=it.data; it.data=d;
    mpAgendaSalvar(); fechaModal(); renderMinhaSemana();
    toast(`↔ Atividade movida de ${fmtBR(de).slice(0,5)} para ${fmtBR(d).slice(0,5)}.`,'ok'); return; }
  if(t.hasAttribute('data-mp-dupconf')){ const ix=+t.getAttribute('data-mp-dupconf'); const it=mpItens()[ix]; if(!it) return;
    const dias=[...document.querySelectorAll('[data-mp-dupdia]:checked')].map(x=>x.getAttribute('data-mp-dupdia'));
    if(!dias.length){ toast('Escolha pelo menos um dia.','warn'); return; }
    dias.forEach(d=>{ mpItens().push({...it, data:d}); });
    mpAgendaSalvar(); fechaModal(); renderMinhaSemana();
    toast(`Atividade duplicada para ${dias.length} dia(s).`,'ok'); return; }
  if(t.hasAttribute('data-mp-rotina')){ if(guardaEdicao()) return; mpAbreRotina(); return; }
  if(t.hasAttribute('data-mp-rotconf')){
    const proj=(document.getElementById('mp-rot-proj')||{}).value||'';
    const desc=((document.getElementById('mp-rot-desc')||{}).value||'').trim();
    const h=parseFloat(String((document.getElementById('mp-rot-h')||{}).value).replace(',','.'))||0;
    const cat=((document.getElementById('mp-rot-cat')||{}).value||'').trim();
    const dias=[...document.querySelectorAll('[data-mp-rotdia]:checked')].map(x=>x.getAttribute('data-mp-rotdia'));
    if(!proj||!desc||!(h>0)||!dias.length){ toast('Preencha projeto, descrição, horas e pelo menos um dia.','warn'); return; }
    dias.forEach(d=>{ mpItens().push({data:d, projeto:proj, descricao:desc, categoria:cat, horas:h, observacao:'', ordem:99}); });
    mpAgendaSalvar(); fechaModal(); renderMinhaSemana();
    toast(`Rotina criada em ${dias.length} dia(s).`,'ok'); return; }
  if(t.hasAttribute('data-mp-copiar')){ if(guardaEdicao()) return;
    const wAnt=mtsSoma(w,-7);
    const j=await mpApi({acao:'ver', semana:wAnt});
    const its=(j&&j.ok&&j.plano&&j.plano.itens)||[];
    if(!its.length){ toast('A semana anterior não tem planejamento no modelo novo.','warn'); return; }
    its.forEach(i=>{ mpItens().push({data:mtsSoma(i.data,7), projeto:i.projeto, descricao:i.descricao,
      categoria:i.categoria||'', horas:Number(i.horas)||0, observacao:i.observacao||'', ordem:i.ordem||0}); });
    mpAgendaSalvar(); renderMinhaSemana();
    toast(`${its.length} atividade(s) copiadas da semana anterior.`,'ok'); return; }
  if(t.hasAttribute('data-mp-legado')){ mpAbreLegado(); return; }
  if(t.hasAttribute('data-mp-enviar')){
    if(!mpItens().length){ toast('Adicione pelo menos uma atividade antes de enviar.','warn'); return; }
    const cap=mpCapSem(id.accountId,w); const tot=mpItens().reduce((s,i)=>s+(Number(i.horas)||0),0);
    if(tot>cap+0.01 && !window.confirm(`O planejado (${mpH(tot)}) está acima da sua capacidade (${mpH(cap)}). Enviar mesmo assim?`)) return;
    const okS=await mpSalvar(); if(okS===false&&mp.sujo) return;
    const pAtual=mpPlano(w);
    const j=await mpApi({acao:'enviar', semana:w, base:(pAtual&&pAtual.atualizadoEm)||''});
    if(j&&j.ok){ mp.meu[w]={plano:j.plano}; toast('Planejamento enviado para aprovação.','ok'); }
    else toast((j&&j.erro)||'Falha ao enviar.', j&&j.conflito?'warn':'err');
    if(j&&j.plano) mp.meu[w]={plano:j.plano};
    mp.rascW=''; renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-retirar')){
    const j=await mpApi({acao:'retirar', semana:w, base:(p&&p.atualizadoEm)||''});
    if(j&&j.ok){ mp.meu[w]={plano:j.plano}; toast('Envio retirado — o plano voltou para elaboração.','ok'); }
    else toast((j&&j.erro)||'Falha ao retirar.', 'err');
    if(j&&j.plano) mp.meu[w]={plano:j.plano};
    mp.rascW=''; renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-reabrir')){
    if(!window.confirm('Reabrir o planejamento aprovado? Uma nova versão será criada e precisará de nova aprovação; a versão aprovada fica no histórico.')) return;
    const j=await mpApi({acao:'reabrir', semana:w, base:(p&&p.atualizadoEm)||''});
    if(j&&j.ok){ mp.meu[w]={plano:j.plano}; toast(`Planejamento reaberto (versão ${j.plano.versao}).`,'ok'); }
    else toast((j&&j.erro)||'Falha ao reabrir.','err');
    if(j&&j.plano) mp.meu[w]={plano:j.plano};
    mp.rascW=''; renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-repend')){ mp.pend=null; mpGarantePend(true); renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-aprovar')){
    if(!window.confirm('Aprovar este planejamento? Ele ficará bloqueado para edição.')) return;
    const idPl=t.getAttribute('data-mp-aprovar');
    const j=await mpApi({acao:'decidir', id:idPl, decisao:'aprovar', base:t.getAttribute('data-mp-base')||''});
    if(j&&j.ok){ toast('Planejamento aprovado.','ok');
      estado.inbox.planos=((estado.inbox.planos)||[]).filter(x=>x.id!==idPl); pintaBadgeInbox();
      mp.meu={}; mp.meuB={}; mp.rel=null; }   // invalida caches: o status novo aparece na hora (cabeçalho, Início e relatórios)
    else toast((j&&j.erro)||'Falha ao aprovar.','err');
    mp.pend=null; mpGarantePend(true); renderMinhaSemana(); return; }
  if(t.hasAttribute('data-mp-devolver')){ mpAbreDevolver(t.getAttribute('data-mp-devolver'), t.getAttribute('data-mp-base')); return; }
  if(t.hasAttribute('data-mp-devconf')){
    const coment=((document.getElementById('mp-dev-coment')||{}).value||'').trim();
    const fb=document.getElementById('mp-dev-fb');
    if(!coment){ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent='O comentário é obrigatório na devolução.'; } return; }
    const idPl=t.getAttribute('data-mp-devconf');
    const j=await mpApi({acao:'decidir', id:idPl, decisao:'devolver', comentario:coment, base:t.getAttribute('data-mp-base')||''});
    if(j&&j.ok){ toast('Planejamento devolvido para ajustes.','ok'); fechaModal();
      estado.inbox.planos=((estado.inbox.planos)||[]).filter(x=>x.id!==idPl); pintaBadgeInbox();
      mp.meu={}; mp.meuB={}; mp.rel=null; }   // invalida caches: status novo na hora
    else if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=(j&&j.erro)||'Falha ao devolver.'; }
    mp.pend=null; if(estado.vista==='minhasemana'){ mpGarantePend(true); renderMinhaSemana(); } return; }
  if(t.hasAttribute('data-mp-relatualiza')){ mp.rel=null; mpGaranteRel(true); mpReRender(); return; }
  if(t.hasAttribute('data-mp-relcsv')){ mpExportaCSV(); return; }
  if(t.hasAttribute('data-mp-rsem')){ const n=+t.getAttribute('data-mp-rsem')||4; const fR=mp.relF;
    fR.ate=mpSem(); fR.de=mtsSoma(fR.ate,-(n-1)*7);
    const ini=mpInicioVig(); if(ini&&fR.de<ini) fR.de=(ini>fR.ate?fR.ate:ini);
    mp.rel=null; mpReRender(); return; }
  if(t.hasAttribute('data-mp-ruser')){ const a=t.getAttribute('data-mp-ruser');
    mp.relF.usuario=(mp.relF.usuario===a?'':a); mpReRender(); return; }
  if(t.hasAttribute('data-mp-rdrill')){ mpAbreDrill(t.getAttribute('data-mp-rdrill')); return; }
  if(t.hasAttribute('data-mp-rgran')){ mp.relGran=t.getAttribute('data-mp-rgran')||'sem'; mpReRender(); return; }
  if(t.hasAttribute('data-mp-ia')){ mpIaAnalisa(t.hasAttribute('data-mp-ia-re')); return; }
  if(t.hasAttribute('data-plr-aud')){ estado.planrel.aud=t.getAttribute('data-plr-aud');
    if(estado.planrel.aud!=='minha'&&mp.relF.usuario&&estado.planrel.aud!=='gestor') mp.relF.usuario='';
    estadoParaURL(); mpReRender(); return; }
  if(t.hasAttribute('data-mpdrill')){ mpAbreTickets(t.getAttribute('data-mpdrill')); return; }
});
// Filtros dos Relatórios do gestor — inclui o 📆 Início da apuração (cfg do time).
document.getElementById('conteudo').addEventListener('change',(e)=>{
  const t=e.target; if(!t||!t.hasAttribute||!t.hasAttribute('data-mp-rf')) return;
  const c=t.getAttribute('data-mp-rf'); const mp=estado.minhasemana;
  if(c==='inicio'){
    cfg.mpInicio=String(t.value||'').slice(0,10); salvaCfg();
    mp.rel=null; mp.relF.de='';   // recalcula o "De" padrão respeitando o novo início
    toast(cfg.mpInicio?`📆 Relatórios do planejamento apurados a partir de ${fmtBR(cfg.mpInicio)} (vale para o time todo).`:'📆 Início da apuração removido — relatórios voltam a considerar tudo.','ok');
    renderMinhaSemana(); return; }
  mp.relF[c]=(c==='de'||c==='ate')?(semChave(t.value)||''):(t.value||'');   // De/Até viram a SEGUNDA da semana escolhida
  if(c==='de'||c==='ate') mp.rel=null;
  mpReRender();
});
// Formulário de atividade (submit) — adiciona ou edita no dia.
document.addEventListener('submit',(e)=>{
  const f=e.target.closest&&e.target.closest('[data-mp-form]'); if(!f) return;
  e.preventDefault();
  const mp=estado.minhasemana; const w=mpSem(); const pl=mpPlano(w);
  if(!mpEditavel(pl)) return;
  const dia=f.getAttribute('data-mp-form');
  const idxS=f.getAttribute('data-mp-formidx');
  const fd=new FormData(f);
  const item={ data:dia, projeto:String(fd.get('projeto')||''), descricao:String(fd.get('descricao')||'').trim(),
    categoria:String(fd.get('categoria')||'').trim(), horas:parseFloat(String(fd.get('horas')||'').replace(',','.'))||0,
    observacao:String(fd.get('observacao')||'').trim(), ordem:99 };
  if(!item.projeto){ toast('Escolha o projeto.','warn'); return; }
  if(!item.descricao){ toast('Descreva a atividade.','warn'); return; }
  if(!(item.horas>0)){ toast('Horas planejadas devem ser maiores que zero.','warn'); return; }
  if(idxS!==''&&idxS!=null){ const ix=+idxS; if(mpItens()[ix]) mpItens()[ix]={...mpItens()[ix], ...item, data:mpItens()[ix].data}; }
  else mpItens().push(item);
  mp.form=null; mpAgendaSalvar(); renderMinhaSemana();
});
