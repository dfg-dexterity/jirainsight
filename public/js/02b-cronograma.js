// Jira Insights · 02b · 📅 MARCOS E CRONOGRAMA (R04) — cronograma em cascata (Gantt) dos épicos de um projeto, com status, marcos e evolução.
// ===========================================================================
// Fonte: a ficha do projeto (/api/projetos?visao=1&projeto=KEY), que agora traz, por
// épico, as datas do próprio épico (Data de início, Data limite, criado, resolvido),
// o que os filhos revelam (1º item criado, último resolvido, maior vencimento, itens
// vencidos, itens vencendo depois do marco), criados × concluídos por mês e os links
// entre épicos (dependências "blocks"). A tela desenha:
//   • Gantt em cascata: barra PLANEJADA (início → data limite; sem data limite, até o
//     maior vencimento dos filhos), barra REAL (1º item → último resolvido, ou até
//     hoje se aberto) com o progresso preenchido, ◆ marco na data limite, linha de
//     hoje, ▲ previsão de término pelo ritmo e setas de dependência.
//   • Status derivado: concluído · atrasado (marco passou) · em risco (previsão passa
//     do marco, marco a ≤14 dias com <70%, ou filhos vencidos) · em andamento · não
//     iniciado; ordem em cascata pelo número da fase ("1.", "2.3"…) e pelo início.
//   • Tabela de marcos, alertas de qualidade dos dados (épico sem datas, filhos
//     vencendo depois do marco, concluído com filhos abertos, estouro de horas,
//     dependência invertida) e o detalhe do épico: burn-up (criados × concluídos
//     acumulados), horas por mês e a composição, com ação em massa na Gestão.
// Helpers de outros módulos só em tempo de render.
// ===========================================================================
const CR_ST={ concluido:['✅','Concluído','var(--musgo)'], atrasado:['🔴','Atrasado','var(--err)'], risco:['🟠','Em risco','var(--amarelo)'],
  andamento:['🔵','Em andamento','var(--cerceta)'], nao_iniciado:['⚪','Não iniciado','var(--muted2)'], cancelado:['⛔','Cancelado','var(--muted)'] };
const CR_ROWH=34;
function crDias(a,b){ if(!a||!b) return 0; return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000); }
function crAddDias(iso,n){ const d=new Date(iso+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); }
function crPrefixo(resumo){ const m=String(resumo||'').match(/^\s*(\d+(?:\.\d+)*)[.)\s-]/); if(!m) return { nums:[], nivel:0 }; const nums=m[1].split('.').map(Number); return { nums, nivel:Math.max(0,nums.length-1) }; }
function crCmpNums(a,b){ for(let i=0;i<Math.max(a.length,b.length);i++){ const x=a[i]==null?-1:a[i], y=b[i]==null?-1:b[i]; if(x!==y) return x-y; } return 0; }
function crFicha(key){ return ((estado.projetos&&estado.projetos.fichas)||{})[key]||null; }
function crReRender(){ if(estado.vista==='cronograma') renderCronograma(); }
function crGaranteFicha(key, forca){
  const c=estado.cronograma; if(!key) return; if(!forca&&(crFicha(key)||c.fichaB[key]||c.fichaErr[key])) return;
  c.fichaB[key]=true; delete c.fichaErr[key];
  fetch(`/api/projetos?visao=1&projeto=${encodeURIComponent(key)}${forca?'&nocache=1':''}`).then(r=>r.json()).then(j=>{ c.fichaB[key]=false;
    if(j&&!j.erro){ estado.projetos.fichas[key]=j; } else c.fichaErr[key]=(j&&j.erro)||'Ficha indisponível.'; crReRender();
  }).catch(e=>{ c.fichaB[key]=false; c.fichaErr[key]=humanizaErro(e); crReRender(); });
}
// Linhas do cronograma: datas, status derivado, previsão e alertas por épico.
function crLinhas(d){
  const hoje=hojeSP(); const corte=crAddDias(hoje,-56);
  const rows=(d.epicos||[]).map(e=>{
    const pfx=crPrefixo(e.resumo);
    const iniPlan=e.ini||''; const fimPlan=e.fim||''; const fimRef=fimPlan||e.vencFilhos||''; const fimDerivado=!fimPlan&&!!e.vencFilhos;
    const iniReal=e.iniItens||''; const done=e.sc==='done'; const cancel=e.sc==='cancel';
    const fimReal=done?(e.resolvido||e.fimItens||''):'';
    // ritmo: filhos concluídos nas últimas 8 semanas → previsão de término
    let concl8=0; Object.entries(e.porMes||{}).forEach(([m,v])=>{ if(m>=corte.slice(0,7)) concl8+=v.d||0; });
    const restantes=Math.max(0,(e.nFilhos||0)-(e.nConcluidos||0));
    const ritmo=concl8/8; let previsao=''; if(!done&&!cancel&&restantes>0&&ritmo>0) previsao=crAddDias(hoje,Math.ceil(restantes/ritmo*7));
    const pct=e.nFilhos?Math.round(e.nConcluidos/e.nFilhos*100):(done?100:0);
    const diasAte=fimRef?crDias(hoje,fimRef):null;
    const risco=!done&&!cancel&&((previsao&&fimRef&&previsao>fimRef)||(fimRef&&diasAte!=null&&diasAte<=14&&diasAte>=0&&pct<70)||(e.filhosVenc>0));
    let st='nao_iniciado';
    if(cancel) st='cancelado'; else if(done) st='concluido'; else if(fimRef&&fimRef<hoje) st='atrasado'; else if(risco) st='risco';
    else if(e.sc==='indeterminate'||e.emAnd>0||e.nConcluidos>0||(e.gastoH>0)) st='andamento';
    const atraso=st==='atrasado'?crDias(fimRef,hoje):(done&&fimPlan&&fimReal&&fimReal>fimPlan?crDias(fimPlan,fimReal):0);
    const alertas=[];
    if(!iniPlan&&!fimPlan&&!cancel) alertas.push('sem datas');
    else if(!fimPlan&&!cancel&&!done) alertas.push(fimDerivado?'sem data limite (usando o maior vencimento dos filhos)':'sem data limite');
    if(e.filhosDepois>0) alertas.push(`${e.filhosDepois} item(ns) vencendo depois do marco`);
    if(done&&e.filhosAbertos>0) alertas.push(`concluído com ${e.filhosAbertos} item(ns) aberto(s)`);
    if(e.estH>0&&e.gastoH>e.estH) alertas.push(`estouro: ${fmtHd(e.gastoH)} gastas de ${fmtHd(e.estH)}`);
    if(!done&&e.filhosVenc>0) alertas.push(`${e.filhosVenc} item(ns) vencido(s)`);
    return { ...e, pfx, iniPlan, fimPlan, fimRef, fimDerivado, iniReal, fimReal, done, cancel, previsao, ritmo, restantes, pct, diasAte, st, atraso, alertas,
      bloqueadoPor:(e.links||[]).filter(l=>l.d==='in'&&/block|bloque|depend/i.test(l.n+' '+l.rot)).map(l=>l.k),
      bloqueia:(e.links||[]).filter(l=>l.d==='out'&&/block|bloque|depend/i.test(l.n+' '+l.rot)).map(l=>l.k) };
  });
  const porK={}; rows.forEach(r=>{ porK[r.k]=r; });
  rows.forEach(r=>{ r.bloqueadoPor.forEach(k=>{ const o=porK[k]; if(o&&o.fimRef&&r.iniPlan&&o.fimRef>r.iniPlan) r.alertas.push(`começa antes de ${k} terminar (dependência invertida)`); }); });
  return rows;
}
function crOrdena(rows, ord){
  const st={atrasado:0,risco:1,andamento:2,nao_iniciado:3,concluido:4,cancelado:5};
  const key=(r)=>r.iniPlan||r.iniReal||r.criado||'9999';
  const out=rows.slice();
  if(ord==='inicio') out.sort((a,b)=>key(a).localeCompare(key(b))||a.k.localeCompare(b.k));
  else if(ord==='fim') out.sort((a,b)=>(a.fimRef||'9999').localeCompare(b.fimRef||'9999')||a.k.localeCompare(b.k));
  else if(ord==='status') out.sort((a,b)=>st[a.st]-st[b.st]||key(a).localeCompare(key(b)));
  else if(ord==='nome') out.sort((a,b)=>(a.resumo||'').localeCompare(b.resumo||'','pt'));
  else out.sort((a,b)=>{ const pa=a.pfx.nums.length, pb=b.pfx.nums.length; if(pa&&pb){ const c=crCmpNums(a.pfx.nums,b.pfx.nums); if(c) return c; } else if(pa!==pb) return pa?-1:1; return key(a).localeCompare(key(b))||a.k.localeCompare(b.k); });
  return out;
}
// Escala de tempo: de/até com folga; marcas semanais (≤ 120 dias) ou mensais.
function crEscala(rows, escala){
  const hoje=hojeSP(); let de=hoje, ate=hoje;
  rows.forEach(r=>{ [r.iniPlan,r.iniReal,r.criado].forEach(x=>{ if(x&&x<de) de=x; }); [r.fimRef,r.fimReal,r.previsao].forEach(x=>{ if(x&&x>ate) ate=x; }); });
  ate=crAddDias(ate,7); de=crAddDias(de,-3);
  if(crDias(de,ate)<28) ate=crAddDias(de,28);
  const dias=Math.max(1,crDias(de,ate)); const modo=escala==='semanas'||(escala!=='meses'&&dias<=120)?'semanas':'meses';
  const pos=(iso)=>Math.max(0,Math.min(100,crDias(de,iso)/dias*100));
  const ticks=[];
  if(modo==='semanas'){ let d=de; while(diaSemana(d)!==1) d=crAddDias(d,1); for(let g=0; d<=ate&&g<60; g++){ ticks.push({x:pos(d),rot:`${d.slice(8,10)}/${d.slice(5,7)}`,forte:d.slice(8,10)<='07'}); d=crAddDias(d,7); } }
  else { let d=de.slice(0,7)+'-01'; if(d<de) d=crAddDias(d.slice(0,7)+'-28',4).slice(0,7)+'-01'; const every=dias>540?3:(dias>300?2:1); let i=0;
    for(let g=0; d<=ate&&g<48; g++){ ticks.push({x:pos(d),rot:i%every===0?labelMesAbbr(d.slice(0,7)):'',forte:d.slice(5,7)==='01'}); d=crAddDias(d.slice(0,7)+'-28',4).slice(0,7)+'-01'; i++; } }
  return { de, ate, dias, modo, pos, ticks, hoje:pos(hoje), hojeDentro:hoje>=de&&hoje<=ate };
}
const crKpi=(v,l,cls,s)=>`<div class="vg-k ${cls||''}"><div class="v">${v}</div><div class="l">${esc(l)}</div>${s?`<div class="s">${s}</div>`:''}</div>`;
const crBadge=(st)=>{ const [ic,rot,cor]=CR_ST[st]||CR_ST.nao_iniciado; return `<span class="cr-st cr-st-${st}" style="--cor:${cor}">${ic} ${rot}</span>`; };
function crGanttHTML(rows, esc_){
  const E=esc_; const H=rows.length*CR_ROWH;
  const axis=`<div class="cr-row cr-cab"><div class="cr-lbl"><b>Épico</b></div><div class="cr-track cr-axis">${E.ticks.map(t=>`<span class="cr-tick ${t.forte?'forte':''}" style="left:${t.x.toFixed(2)}%"><i></i>${t.rot?`<em>${esc(t.rot)}</em>`:''}</span>`).join('')}${E.hojeDentro?`<span class="cr-hoje-rot" style="left:${E.hoje.toFixed(2)}%">hoje</span>`:''}</div></div>`;
  const linhas=rows.map(r=>{
    const [ic,rot,cor]=CR_ST[r.st]; const tips=[];
    let plan=''; if(r.iniPlan||r.fimRef){ const a=r.iniPlan||r.iniReal||r.criado; const b=r.fimRef||r.previsao||hojeSP(); if(a&&b&&b>=a){ plan=`<i class="cr-plan ${r.fimRef?'':'aberta'} ${r.fimDerivado?'derivada':''}" style="left:${E.pos(a).toFixed(2)}%;width:${Math.max(0.4,E.pos(b)-E.pos(a)).toFixed(2)}%" data-tip="${escA(`Planejado: ${r.iniPlan?dataBR(r.iniPlan):'início não informado'} → ${r.fimPlan?dataBR(r.fimPlan):(r.fimDerivado?dataBR(r.fimRef)+' (maior vencimento dos filhos)':'sem data limite')}`)}"></i>`; } }
    let real=''; if(r.iniReal){ const b=r.fimReal||(r.done?r.iniReal:hojeSP()); if(b>=r.iniReal){ const w=Math.max(0.6,E.pos(b)-E.pos(r.iniReal));
      real=`<i class="cr-real" style="left:${E.pos(r.iniReal).toFixed(2)}%;width:${w.toFixed(2)}%;--cor:${cor}" data-tip="${escA(`Real: 1º item ${dataBR(r.iniReal)} → ${r.fimReal?'concluído '+dataBR(r.fimReal):'em andamento'} · ${r.nConcluidos}/${r.nFilhos} itens (${r.pct}%)`)}"><b style="width:${r.pct}%"></b><span>${r.pct}%</span></i>`; } }
    const marco=r.fimPlan?`<i class="cr-marco ${r.st==='atrasado'||(r.done&&r.fimReal>r.fimPlan)?'tarde':(r.done?'ok':'')}" style="left:${E.pos(r.fimPlan).toFixed(2)}%" data-tip="${escA(`◆ Marco: ${dataBR(r.fimPlan)}${r.atraso?` · ${r.atraso} dia(s) de atraso`:''}`)}"></i>`:'';
    const prev=r.previsao&&!r.done?`<i class="cr-prev ${r.fimRef&&r.previsao>r.fimRef?'tarde':''}" style="left:${E.pos(r.previsao).toFixed(2)}%" data-tip="${escA(`▲ Previsão pelo ritmo: ${dataBR(r.previsao)} (${r.restantes} item(ns) restante(s), ${(Math.round(r.ritmo*10)/10).toLocaleString('pt-BR')}/semana)`)}"></i>`:'';
    const semDatas=!plan&&!real?'<span class="cr-semdatas">sem datas</span>':'';
    return `<div class="cr-row lvl-${Math.min(3,r.pfx.nivel)}" data-cr-ep="${escA(r.k)}" role="button" tabindex="0" data-tipk="clique para ver a evolução e a composição">
      <div class="cr-lbl"><span class="cr-ic" style="color:${cor}">${ic}</span><b>${esc(r.k)}</b> <span class="cr-nome" title="${escA(r.resumo)}">${esc(r.resumo)}</span>${r.alertas.length?`<span class="cr-alerta" data-tip="${escA(r.alertas.join(' · '))}">⚠</span>`:''}</div>
      <div class="cr-track">${E.hojeDentro?`<i class="cr-hoje" style="left:${E.hoje.toFixed(2)}%"></i>`:''}${plan}${real}${marco}${prev}${semDatas}</div></div>`; }).join('');
  // dependências (blocks): do fim do bloqueador ao início do bloqueado
  const idx={}; rows.forEach((r,i)=>{ idx[r.k]=i; }); const linhasSvg=[];
  rows.forEach((r,i)=>{ r.bloqueadoPor.forEach(k=>{ const j=idx[k]; if(j==null) return; const o=rows[j];
    const x1=E.pos(o.fimRef||o.fimReal||hojeSP())*10, x2=E.pos(r.iniPlan||r.iniReal||r.criado)*10; const y1=j*CR_ROWH+CR_ROWH/2, y2=i*CR_ROWH+CR_ROWH/2;
    const inv=x2<x1; linhasSvg.push(`<path d="M${x1.toFixed(1)},${y1} H${(x1+6).toFixed(1)} V${y2} H${(x2-2).toFixed(1)}" class="cr-dep ${inv?'inv':''}"/><circle cx="${x2.toFixed(1)}" cy="${y2}" r="3.5" class="cr-dep-p ${inv?'inv':''}"/>`); }); });
  const deps=linhasSvg.length?`<div class="cr-deps-wrap"><svg class="cr-deps" viewBox="0 0 1000 ${H}" preserveAspectRatio="none" style="height:${H}px">${linhasSvg.join('')}</svg></div>`:'';
  return `<div class="cr-gantt">${axis}<div class="cr-body">${linhas}${deps}</div></div>
    <div class="pp-legend cr-leg"><span><i class="cr-leg-plan"></i>planejado (início → marco)</span><span><i class="cr-leg-real"></i>real (1º item → último concluído / hoje) com % de itens</span><span><i class="cr-leg-marco"></i>marco (data limite)</span><span><i class="cr-leg-prev"></i>previsão pelo ritmo</span><span><i class="cr-leg-hoje"></i>hoje</span>${linhasSvg.length?'<span><i class="cr-leg-dep"></i>dependência (bloqueia)</span>':''}</div>`;
}
function renderCronograma(){
  const cont=document.getElementById('conteudo'); const c=estado.cronograma;
  if(!_projetosCache) garanteProjetos().then(crReRender).catch(()=>{});
  // 📚 Vindo da Central (R04): só os projetos dos tipos onde o R04 é O/R; um projeto de fora sai da seleção.
  const rc=relCtxAtivo('cronograma');
  const projs=(_projetosCache||[]).filter(p=>!rc||relProjOk(p.key,p.categoria)).sort((a,b)=>(a.nome||a.key).localeCompare(b.nome||b.key,'pt'));
  if(!c.proj&&estado.projetos&&estado.projetos.sel) c.proj=estado.projetos.sel;
  if(rc&&c.proj&&_projetosCache&&_projetosCache.length&&!projs.some(p=>p.key===c.proj)) c.proj='';
  const sel=`<select id="cr-proj"><option value="">— escolha o projeto —</option>${projs.map(p=>`<option value="${escA(p.key)}" ${c.proj===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('')}</select>`;
  const filtros=`<div class="ap-filtros">
    <div class="campo"><label>Projeto</label>${sel}</div>
    <div class="campo"><label>Mostrar</label><div class="ap-chips">${[['todos','Todos'],['abertos','Abertos'],['atencao','Atrasados e em risco'],['concluidos','Concluídos']].map(([v,l])=>`<button class="chip ${c.fil===v?'on':''}" data-cr-fil="${v}">${l}</button>`).join('')}</div></div>
    <div class="campo"><label>Ordem</label><select id="cr-ord"><option value="auto" ${c.ord==='auto'?'selected':''}>cascata (fase e início)</option><option value="inicio" ${c.ord==='inicio'?'selected':''}>início</option><option value="fim" ${c.ord==='fim'?'selected':''}>marco (data limite)</option><option value="status" ${c.ord==='status'?'selected':''}>status</option><option value="nome" ${c.ord==='nome'?'selected':''}>nome</option></select></div>
    <div class="campo"><label>Escala</label><select id="cr-escala"><option value="auto" ${c.escala==='auto'?'selected':''}>automática</option><option value="semanas" ${c.escala==='semanas'?'selected':''}>semanas</option><option value="meses" ${c.escala==='meses'?'selected':''}>meses</option></select></div>
    <div class="campo"><label>&nbsp;</label><div style="display:flex;gap:6px">${c.proj?'<button class="btn" data-cr-refresh="1" data-tip="Rebusca a ficha do Jira ignorando o cache">⟳ Atualizar</button>':''}${c.proj?'<button class="btn" data-cr-csv="1" data-tip="Baixa o cronograma em CSV">⬇ CSV</button>':''}</div></div></div>`;
  const cab=(sub)=>`<div class="card full"><h2>📅 Marcos e Cronograma <span>${sub}</span></h2>
    <div class="muted small">O relatório <b>R04</b> da Central: os épicos do projeto como fases de um cronograma em cascata — o que foi <b>planejado</b> (Data de início → Data limite do épico no Jira), o que está <b>acontecendo</b> (1º item criado → último concluído, com o % de itens), os <b>marcos</b>, a <b>previsão de término pelo ritmo</b> e as <b>dependências</b>. Clique num épico para ver a evolução e a composição.</div>${filtros}</div>`;
  if(!c.proj){ cont.replaceChildren(el(`<div>${cab('escolha um projeto')}<div class="card full"><div class="estado">Escolha o projeto para montar o cronograma dos épicos.${projs.length?'':' <br><span class="muted small">⏳ carregando o catálogo do Jira…</span>'}</div></div></div>`)); return; }
  crGaranteFicha(c.proj); const d=crFicha(c.proj);
  if(!d){ cont.replaceChildren(el(`<div>${cab(esc(projNome(c.proj)))}<div class="card full">${c.fichaErr[c.proj]?`<div class="erro">${esc(c.fichaErr[c.proj])} <button class="btn" data-cr-retry="1">Tentar de novo</button></div>`:skeletonPainel()}</div></div>`)); return; }
  const todas=crLinhas(d); const hoje=hojeSP();
  const filtradas=todas.filter(r=>c.fil==='abertos'?!r.done&&!r.cancel:c.fil==='atencao'?(r.st==='atrasado'||r.st==='risco'):c.fil==='concluidos'?r.done:true);
  const rows=crOrdena(filtradas,c.ord); const E=crEscala(rows.length?rows:todas,c.escala);
  const n=(st)=>todas.filter(r=>r.st===st).length; const abertos=todas.filter(r=>!r.done&&!r.cancel);
  const proxMarcos=abertos.filter(r=>r.fimPlan&&r.fimPlan>=hoje&&crDias(hoje,r.fimPlan)<=30).sort((a,b)=>a.fimPlan.localeCompare(b.fimPlan));
  const itensTot=todas.reduce((s,r)=>s+(r.nFilhos||0),0), itensConc=todas.reduce((s,r)=>s+(r.nConcluidos||0),0);
  const fimProj=todas.reduce((s,r)=>(r.fimRef&&r.fimRef>s?r.fimRef:s),''); const prevProj=abertos.reduce((s,r)=>(r.previsao&&r.previsao>s?r.previsao:s),'');
  const hero=`<div class="vg-hero">
    ${crKpi(String(todas.length),'Épicos (fases)','',`${n('concluido')} concluído(s) · ${n('andamento')} em andamento · ${n('nao_iniciado')} não iniciado(s)`)}
    ${crKpi(String(n('atrasado')),'Atrasados',n('atrasado')?'bad':'good','marco passou e o épico segue aberto')}
    ${crKpi(String(n('risco')),'Em risco',n('risco')?'warn':'good','previsão passa do marco, marco próximo com pouco progresso ou itens vencidos')}
    ${crKpi(String(proxMarcos.length),'Marcos nos próximos 30 dias',proxMarcos.length?'warn':'',proxMarcos.length?proxMarcos.slice(0,3).map(r=>`${esc(r.k)} ${dataBR(r.fimPlan)}`).join(' · '):'nenhum')}
    ${crKpi(`${itensTot?Math.round(itensConc/itensTot*100):0}%`,'Progresso geral (itens)','',`${itensConc} de ${itensTot} itens concluídos`)}
    ${crKpi(fimProj?dataBR(fimProj):'—','Último marco planejado',prevProj&&fimProj&&prevProj>fimProj?'warn':'',prevProj?`previsão pelo ritmo: ${dataBR(prevProj)}`:'sem previsão (sem ritmo recente)')}</div>`;
  const gantt=rows.length?crGanttHTML(rows,E):'<div class="estado">Nenhum épico neste filtro.</div>';
  const tab=`<div class="scroll-x"><table class="mp-tab-mini cr-tab"><thead><tr><th>Épico</th><th>Status</th><th class="num">Início plan.</th><th class="num">Início real</th><th class="num">Marco</th><th class="num">Fim real / previsão</th><th class="num">Atraso</th><th class="num">Itens</th><th class="num">Horas</th><th>Dependências</th><th>Alertas</th></tr></thead>
    <tbody>${rows.map(r=>`<tr class="rm-click" data-cr-ep="${escA(r.k)}"><td><b>${esc(r.k)}</b> <span class="muted small">${esc((r.resumo||'').slice(0,50))}</span></td><td>${crBadge(r.st)}</td><td class="num">${r.iniPlan?dataBR(r.iniPlan):'<span class="muted">—</span>'}</td><td class="num">${r.iniReal?dataBR(r.iniReal):'—'}</td><td class="num">${r.fimPlan?dataBR(r.fimPlan):(r.fimDerivado?`<span class="muted" data-tip="Maior vencimento dos filhos">${dataBR(r.fimRef)}*</span>`:'<span class="muted">—</span>')}</td>
      <td class="num">${r.fimReal?dataBR(r.fimReal):(r.previsao?`<span data-tip="Previsão pelo ritmo das últimas 8 semanas">▲ ${dataBR(r.previsao)}</span>`:'—')}</td><td class="num">${r.atraso?`<span class="rp-neg">${r.atraso}d</span>`:'—'}</td><td class="num">${r.nConcluidos}/${r.nFilhos} <span class="muted small">${r.pct}%</span></td><td class="num">${fmtHd(r.gastoH)} <span class="muted small">/ ${fmtHd(r.estH)}</span></td>
      <td>${r.bloqueadoPor.length?`⏮ ${r.bloqueadoPor.map(esc).join(', ')}`:''}${r.bloqueia.length?` ⏭ ${r.bloqueia.map(esc).join(', ')}`:''}</td><td class="small">${r.alertas.map(a=>`⚠ ${esc(a)}`).join('<br>')}</td></tr>`).join('')||'<tr><td colspan="11" class="mp-dim">Nenhum épico.</td></tr>'}</tbody></table></div>`;
  const semDatas=todas.filter(r=>!r.iniPlan&&!r.fimPlan&&!r.cancel).length; const semFim=todas.filter(r=>!r.fimPlan&&!r.done&&!r.cancel).length;
  const qual=[]; if(semDatas) qual.push(`${semDatas} épico(s) sem Data de início nem Data limite — sem eles não há barra planejada nem marco.`);
  if(semFim>semDatas) qual.push(`${semFim-semDatas} épico(s) com início mas sem Data limite — a barra usa o maior vencimento dos filhos (marcado com *).`);
  const depois=todas.filter(r=>r.filhosDepois>0); if(depois.length) qual.push(`${depois.length} épico(s) com itens vencendo depois do próprio marco (${depois.slice(0,3).map(r=>r.k).join(', ')}${depois.length>3?'…':''}).`);
  const concAb=todas.filter(r=>r.done&&r.filhosAbertos>0); if(concAb.length) qual.push(`${concAb.length} épico(s) concluído(s) com itens abertos (${concAb.slice(0,3).map(r=>r.k).join(', ')}).`);
  const inv=todas.filter(r=>r.alertas.some(a=>/invertida/.test(a))); if(inv.length) qual.push(`${inv.length} dependência(s) invertida(s): o épico começa antes de o bloqueador terminar.`);
  cont.replaceChildren(el(`<div>${cab(`${esc(d.nome||projNome(c.proj))} (${esc(c.proj)}) · ${todas.length} épico(s) · escala ${E.modo==='semanas'?'semanal':'mensal'} · ${dataBR(E.de)} → ${dataBR(E.ate)}`)}
    <div class="card full">${hero}
      <section class="rm-bloco"><h3 class="mp-h3">🗓 Cronograma em cascata <span class="mp-dim">${rows.length} de ${todas.length} épico(s)</span></h3>${gantt}
        ${ctExpl('cada linha é um épico (fase). A barra clara é o <b>planejado</b> (Data de início → Data limite do épico no Jira; sem data limite, vai até o maior vencimento dos filhos); a barra colorida é o <b>real</b> (do 1º item criado até o último concluído — ou até hoje, se aberto), preenchida com o % de itens concluídos. ◆ é o <b>marco</b> (vermelho quando passou); ▲ é a <b>previsão de término</b> pelo ritmo das últimas 8 semanas; a linha tracejada é hoje; as setas ligam quem bloqueia a quem é bloqueado. A ordem em cascata segue o número da fase no nome do épico ("1.", "2.3"…) e o início.')}</section>
      <section class="rm-bloco"><h3 class="mp-h3">🎯 Marcos e status por épico</h3>${tab}
        ${ctExpl('<b>Atrasado</b> = marco passou e o épico segue aberto (atraso em dias). <b>Em risco</b> = a previsão pelo ritmo passa do marco, o marco está a 14 dias com menos de 70% dos itens, ou há itens vencidos. <b>Previsão</b> = itens restantes ÷ itens concluídos por semana nas últimas 8 semanas. Marco com * vem do maior vencimento dos filhos (o épico não tem Data limite).')}</section>
      <section class="rm-bloco"><h3 class="mp-h3">🔍 Os dados permitem ler o cronograma?</h3>${qual.length?`<ul class="mtp-lista">${qual.map(x=>`<li>⚠ ${esc(x)}</li>`).join('')}</ul><div class="muted small">Preencha <b>Data de início</b> e <b>Data limite</b> nos épicos do Jira e ligue os épicos com "blocks" para as dependências aparecerem.</div>`:'<div class="aviso ok">✅ Épicos com datas e marcos consistentes.</div>'}</section>
    </div></div>`));
}
// ---- detalhe do épico: evolução (burn-up), horas por mês e composição ----
function crGaranteTempo(){
  const c=estado.cronograma; const hoje=hojeSP(); const de=crAddDias(hoje,-364); const chave=`${de}|${hoje}`; c.tempoChave=chave;
  if(c.tempo[chave]||c.tempoB[chave]||c.tempoErro[chave]) return;
  c.tempoB[chave]=true;
  fetch(`/api/tempo?desde=${encodeURIComponent(de)}&ate=${encodeURIComponent(hoje)}`).then(r=>r.json()).then(j=>{ c.tempoB[chave]=false;
    if(j&&!j.erro) c.tempo[chave]=j; else c.tempoErro[chave]=(j&&j.erro)||'Falha ao ler as horas.'; if(c.sel) crAbreEpico(c.sel,true);
  }).catch(e=>{ c.tempoB[chave]=false; c.tempoErro[chave]=humanizaErro(e); if(c.sel) crAbreEpico(c.sel,true); });
}
function crAbreEpico(k, soHoras){
  const c=estado.cronograma; const d=crFicha(c.proj); if(!d) return; const r=crLinhas(d).find(x=>x.k===k); if(!r) return; c.sel=k;
  const meses=Object.keys(r.porMes||{}).sort(); let ac=0, ad=0;
  const serie=meses.length?tsChart([{nome:'Criados (acum.)',cor:cores.cerceta,vals:meses.map(m=>{ ac+=r.porMes[m].c||0; return {x:m,v:ac}; }),tipo:'line'},{nome:'Concluídos (acum.)',cor:cores.musgo,vals:meses.map(m=>{ ad+=r.porMes[m].d||0; return {x:m,v:ad}; }),tipo:'area'}],{fmt:v=>String(v),xlabel:x=>labelMesAbbr(x),h:170}):'<div class="estado">Sem itens neste épico ainda.</div>';
  const t=c.tempo[c.tempoChave]; let horas='';
  if(t){ const porMes={}; let tot=0; (t.worklogs||[]).forEach(w=>{ if(w.e!==k&&w.k!==k) return; const m=(w.d||'').slice(0,7); porMes[m]=(porMes[m]||0)+(Number(w.s)||0)/3600; tot+=(Number(w.s)||0)/3600; });
    const ms=Object.keys(porMes).sort(); horas=ms.length?`${tsChart([{nome:'Horas apontadas',cor:cores.roxo,vals:ms.map(m=>({x:m,v:Math.round(porMes[m]*10)/10})),tipo:'area'}],{fmt:v=>fmtHd(v),xlabel:x=>labelMesAbbr(x),h:150})}<div class="muted small">${fmtHd(tot)} apontadas nos últimos 12 meses neste épico (Clockwork) · estimado ${fmtHd(r.estH)} · gasto (Jira) ${fmtHd(r.gastoH)}</div>`:'<div class="muted small">Nenhuma hora apontada neste épico nos últimos 12 meses.</div>'; }
  else if(c.tempoB[c.tempoChave]) horas='<div class="muted small">⏳ Lendo as horas apontadas (12 meses)…</div>';
  else if(c.tempoErro[c.tempoChave]) horas=`<div class="aviso">⚠ ${esc(c.tempoErro[c.tempoChave])}</div>`;
  else horas='<button class="btn" data-cr-horas="1">⏱ Carregar horas apontadas por mês (12 meses)</button>';
  const filhos=(d.itens||[]).filter(i=>i.e===k).sort((a,b)=>(a.sc==='done')-(b.sc==='done')||(a.v||'9999').localeCompare(b.v||'9999'));
  const abertosK=filhos.filter(i=>i.sc!=='done'&&!/cancel/i.test(i.st)).map(i=>i.k);
  const dl=(l,v)=>`<div class="ams-dl"><div class="dt">${l}</div><div class="dd">${v}</div></div>`;
  abreModal(`<h2>${esc(r.k)} · ${esc(r.resumo)} ${crBadge(r.st)}</h2>
    <div class="ams-dgrid" style="margin:8px 0 10px">${dl('Início planejado',r.iniPlan?dataBR(r.iniPlan):'—')}${dl('Marco (data limite)',r.fimPlan?dataBR(r.fimPlan):(r.fimDerivado?dataBR(r.fimRef)+' *':'—'))}${dl('Início real (1º item)',r.iniReal?dataBR(r.iniReal):'—')}${dl(r.done?'Fim real':'Previsão pelo ritmo',r.done?(r.fimReal?dataBR(r.fimReal):'—'):(r.previsao?dataBR(r.previsao):'—'))}${dl('Itens',`${r.nConcluidos}/${r.nFilhos} (${r.pct}%)`)}${dl('Horas',`${fmtHd(r.gastoH)} / ${fmtHd(r.estH)}`)}${r.atraso?dl('Atraso',`<span class="rp-neg">${r.atraso} dia(s)</span>`):''}${r.resp?dl('Responsável',esc(r.resp)):''}</div>
    ${r.alertas.length?`<div class="aviso">${r.alertas.map(a=>`⚠ ${esc(a)}`).join('<br>')}</div>`:''}
    <div class="rm-2col"><div><div class="mp-h3">📈 Evolução — itens criados × concluídos (acumulado)</div>${serie}</div><div><div class="mp-h3">⏱ Horas apontadas por mês</div><div id="cr-horas">${horas}</div></div></div>
    <div class="mp-h3" style="margin-top:10px">🧩 Composição <span class="mp-dim">${filhos.length} item(ns) · abertos primeiro</span></div>${projTabelaItens(filhos,200)}
    <div class="alx-modal-acoes"><a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(k)}" target="_blank" rel="noopener">Abrir no Jira ↗</a>${abertosK.length?`<button class="btn" data-ct-gestao="${escA(abertosK.slice(0,200).join(','))}">🛠 Abrir os ${Math.min(abertosK.length,200)} abertos na Gestão</button>`:''}<button class="btn" id="gx-fechar">Fechar</button></div>`);
  if(soHoras){ /* redesenhado inteiro acima — mantém o modal aberto com as horas carregadas */ }
}
function crExportaCSV(){
  const c=estado.cronograma; const d=crFicha(c.proj); if(!d){ toast('Aguarde a ficha carregar.','warn'); return; }
  const rows=crOrdena(crLinhas(d),c.ord); const rot={concluido:'Concluído',atrasado:'Atrasado',risco:'Em risco',andamento:'Em andamento',nao_iniciado:'Não iniciado',cancelado:'Cancelado'};
  baixaCSV(`cronograma_${c.proj}_${hojeSP()}.csv`,[['Épico','Resumo','Status','Início planejado','Início real','Marco (data limite)','Fim real','Previsão','Atraso (dias)','Itens concluídos','Itens','%','Horas gastas','Horas estimadas','Bloqueado por','Bloqueia','Alertas'],
    ...rows.map(r=>[r.k,r.resumo,rot[r.st],r.iniPlan,r.iniReal,r.fimPlan||(r.fimDerivado?r.fimRef+' *':''),r.fimReal,r.previsao,r.atraso||'',r.nConcluidos,r.nFilhos,r.pct,r.gastoH,r.estH,r.bloqueadoPor.join(' '),r.bloqueia.join(' '),r.alertas.join('; ')])]);
}
// ---- listeners delegados desta tela ----
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='cronograma') return; const c=estado.cronograma; const t=e.target; if(!t) return;
  if(t.id==='cr-proj'){ c.proj=t.value||''; renderCronograma(); estadoParaURL(); }
  else if(t.id==='cr-ord'){ c.ord=t.value; renderCronograma(); }
  else if(t.id==='cr-escala'){ c.escala=t.value; renderCronograma(); }
});
document.getElementById('conteudo').addEventListener('keydown',(e)=>{
  if(estado.vista!=='cronograma') return; if(e.key!=='Enter'&&e.key!==' ') return;
  const r=e.target.closest&&e.target.closest('[data-cr-ep]'); if(r){ e.preventDefault(); crAbreEpico(r.getAttribute('data-cr-ep')); }
});
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='cronograma') return; const c=estado.cronograma;
  const row=e.target.closest&&e.target.closest('[data-cr-ep]'); if(row&&!e.target.closest('a')&&!e.target.closest('button')){ crAbreEpico(row.getAttribute('data-cr-ep')); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-cr-fil')){ c.fil=t.getAttribute('data-cr-fil'); renderCronograma(); return; }
  if(t.hasAttribute('data-cr-refresh')){ crGaranteFicha(c.proj,true); renderCronograma(); return; }
  if(t.hasAttribute('data-cr-retry')){ delete c.fichaErr[c.proj]; renderCronograma(); return; }
  if(t.hasAttribute('data-cr-csv')){ crExportaCSV(); return; }
});
document.getElementById('modal-body').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-cr-horas')){ crGaranteTempo(); const h=document.getElementById('cr-horas'); if(h) h.innerHTML='<div class="muted small">⏳ Lendo as horas apontadas (12 meses)…</div>'; }
});
// Atalho vindo de outras telas (ficha do projeto, catálogo): abre o cronograma do projeto.
document.addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('[data-cr-abrir]'); if(!t) return;
  const k=t.getAttribute('data-cr-abrir'); if(k) estado.cronograma.proj=k; if(estado.vista!=='cronograma') vaiPara('cronograma'); else renderCronograma();
});
