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
// KPI acionável (pedido de 2026-09-13): `acao` = filtro do cronograma ('todos', 'atrasados',
// 'risco', 'marcos30'), 'progresso' (itens do projeto) ou 'epico:KEY' (abre o épico); `on` = filtro ativo.
const crKpi=(v,l,cls,s,acao,on)=>`<div class="vg-k ${cls||''} ${on?'cr-on':''}"${acao?` data-cr-kpi="${escA(acao)}" role="button" tabindex="0" data-tipk="${acao==='progresso'?'clique para ver os itens por épico':acao.startsWith('epico:')?'clique para abrir o épico':(on?'clique para voltar a todos':'clique para filtrar o cronograma')}"`:''}><div class="v">${v}</div><div class="l">${esc(l)}</div>${s?`<div class="s">${s}</div>`:''}</div>`;
const crBadge=(st)=>{ const [ic,rot,cor]=CR_ST[st]||CR_ST.nao_iniciado; return `<span class="cr-st cr-st-${st}" style="--cor:${cor}">${ic} ${rot}</span>`; };
function crGanttHTML(rows, esc_){
  const E=esc_; const H=rows.length*CR_ROWH;
  const axis=`<div class="cr-row cr-cab"><div class="cr-lbl"><b>Épico</b></div><div class="cr-track cr-axis">${E.ticks.map(t=>`<span class="cr-tick ${t.forte?'forte':''}" style="left:${t.x.toFixed(2)}%"><i></i>${t.rot?`<em>${esc(t.rot)}</em>`:''}</span>`).join('')}${E.hojeDentro?`<span class="cr-hoje-rot" style="left:${E.hoje.toFixed(2)}%">hoje</span>`:''}</div></div>`;
  const linhas=rows.map(r=>{
    const [ic,rot,cor]=CR_ST[r.st]; const tips=[];
    // ✎ (2026-10-21, cronograma editável): a barra planejada tem alças nas bordas (início / marco) e se arrasta inteira
    // (`data-cr-bar`); o ◆ também se arrasta (`data-cr-marco`). Só com ponteiro fino — no toque, o ✎ e os campos.
    let plan=''; if(r.iniPlan||r.fimRef){ const a=r.iniPlan||r.iniReal||r.criado; const b=r.fimRef||r.previsao||hojeSP(); if(a&&b&&b>=a){ plan=`<i class="cr-plan ${r.fimRef?'':'aberta'} ${r.fimDerivado?'derivada':''}${r.cancel||r.done?'':' editavel'}" data-cr-bar="${escA(r.k)}" data-cr-a="${escA(a)}" data-cr-b="${escA(b)}" style="left:${E.pos(a).toFixed(2)}%;width:${Math.max(0.4,E.pos(b)-E.pos(a)).toFixed(2)}%" data-tip="${escA(`Planejado: ${r.iniPlan?dataBR(r.iniPlan):'início não informado'} → ${r.fimPlan?dataBR(r.fimPlan):(r.fimDerivado?dataBR(r.fimRef)+' (maior vencimento dos filhos)':'sem data limite')}${r.cancel||r.done?'':' · arraste a barra (move), as bordas (início / marco) ou o ◆'}`)}">${r.cancel||r.done?'':'<b class="cr-h cr-h-l" data-cr-h="ini" title="Arraste: data de início"></b><b class="cr-h cr-h-r" data-cr-h="fim" title="Arraste: marco (data limite)"></b>'}</i>`; } }
    let real=''; if(r.iniReal){ const b=r.fimReal||(r.done?r.iniReal:hojeSP()); if(b>=r.iniReal){ const w=Math.max(0.6,E.pos(b)-E.pos(r.iniReal));
      real=`<i class="cr-real" style="left:${E.pos(r.iniReal).toFixed(2)}%;width:${w.toFixed(2)}%;--cor:${cor}" data-tip="${escA(`Real: 1º item ${dataBR(r.iniReal)} → ${r.fimReal?'concluído '+dataBR(r.fimReal):'em andamento'} · ${r.nConcluidos}/${r.nFilhos} itens (${r.pct}%)`)}"><b style="width:${r.pct}%"></b><span>${r.pct}%</span></i>`; } }
    const marco=r.fimPlan?`<i class="cr-marco ${r.st==='atrasado'||(r.done&&r.fimReal>r.fimPlan)?'tarde':(r.done?'ok':'')}${r.cancel||r.done?'':' editavel'}" ${r.cancel||r.done?'':`data-cr-marco="${escA(r.k)}" data-cr-b="${escA(r.fimPlan)}"`} style="left:${E.pos(r.fimPlan).toFixed(2)}%" data-tip="${escA(`◆ Marco: ${dataBR(r.fimPlan)}${r.atraso?` · ${r.atraso} dia(s) de atraso`:''}${r.cancel||r.done?'':' · arraste para mudar'}`)}"></i>`:'';
    const prev=r.previsao&&!r.done?`<i class="cr-prev ${r.fimRef&&r.previsao>r.fimRef?'tarde':''}" style="left:${E.pos(r.previsao).toFixed(2)}%" data-tip="${escA(`▲ Previsão pelo ritmo: ${dataBR(r.previsao)} (${r.restantes} item(ns) restante(s), ${(Math.round(r.ritmo*10)/10).toLocaleString('pt-BR')}/semana)`)}"></i>`:'';
    const semDatas=!plan&&!real?'<span class="cr-semdatas">sem datas</span>':'';
    return `<div class="cr-row lvl-${Math.min(3,r.pfx.nivel)}" data-cr-ep="${escA(r.k)}" role="button" tabindex="0" data-tipk="clique para ver a evolução e a composição">
      <div class="cr-lbl"><span class="cr-ic" style="color:${cor}">${ic}</span><b>${esc(r.k)}</b> <span class="cr-nome" title="${escA(r.resumo)}${r.cancel?'':' · duplo clique renomeia'}" data-cr-nome="${escA(r.k)}">${esc(r.resumo)}</span>${r.alertas.length?`<span class="cr-alerta" data-tip="${escA(r.alertas.join(' · '))}">⚠</span>`:''}<button class="cr-ed" data-cr-editar="${escA(r.k)}" title="Editar a fase (nome, datas, responsável, status, dependências)" aria-label="Editar ${escA(r.k)}">✎</button></div>
      <div class="cr-track">${E.hojeDentro?`<i class="cr-hoje" style="left:${E.hoje.toFixed(2)}%"></i>`:''}${plan}${real}${marco}${prev}${semDatas}</div></div>`; }).join('');
  // dependências (blocks): do fim do bloqueador ao início do bloqueado
  const idx={}; rows.forEach((r,i)=>{ idx[r.k]=i; }); const linhasSvg=[];
  rows.forEach((r,i)=>{ r.bloqueadoPor.forEach(k=>{ const j=idx[k]; if(j==null) return; const o=rows[j];
    const x1=E.pos(o.fimRef||o.fimReal||hojeSP())*10, x2=E.pos(r.iniPlan||r.iniReal||r.criado)*10; const y1=j*CR_ROWH+CR_ROWH/2, y2=i*CR_ROWH+CR_ROWH/2;
    const inv=x2<x1; linhasSvg.push(`<path d="M${x1.toFixed(1)},${y1} H${(x1+6).toFixed(1)} V${y2} H${(x2-2).toFixed(1)}" class="cr-dep ${inv?'inv':''}"/><circle cx="${x2.toFixed(1)}" cy="${y2}" r="3.5" class="cr-dep-p ${inv?'inv':''}"/>`); }); });
  const deps=linhasSvg.length?`<div class="cr-deps-wrap"><svg class="cr-deps" viewBox="0 0 1000 ${H}" preserveAspectRatio="none" style="height:${H}px">${linhasSvg.join('')}</svg></div>`:'';
  return `<div class="cr-gantt" style="--crn:${E.ticks.filter(t=>t.rot).length}">${axis}<div class="cr-body">${linhas}${deps}</div></div>
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
    <div class="campo"><label>Mostrar</label><div class="ap-chips">${[['todos','Todos'],['abertos','Abertos'],['atrasados','🔴 Atrasados'],['risco','🟠 Em risco'],['atencao','Atrasados e em risco'],['marcos30','◆ Marcos em 30 dias'],['concluidos','✅ Concluídos']].map(([v,l])=>`<button class="chip ${c.fil===v?'on':''}" data-cr-fil="${v}">${l}</button>`).join('')}</div></div>
    <div class="campo"><label>Ordem</label><select id="cr-ord"><option value="auto" ${c.ord==='auto'?'selected':''}>cascata (fase e início)</option><option value="inicio" ${c.ord==='inicio'?'selected':''}>início</option><option value="fim" ${c.ord==='fim'?'selected':''}>marco (data limite)</option><option value="status" ${c.ord==='status'?'selected':''}>status</option><option value="nome" ${c.ord==='nome'?'selected':''}>nome</option></select></div>
    <div class="campo"><label>Escala</label><select id="cr-escala"><option value="auto" ${c.escala==='auto'?'selected':''}>automática</option><option value="semanas" ${c.escala==='semanas'?'selected':''}>semanas</option><option value="meses" ${c.escala==='meses'?'selected':''}>meses</option></select></div>
    <div class="campo"><label>&nbsp;</label><div style="display:flex;gap:6px;flex-wrap:wrap">${c.proj?`<button class="btn primario" data-cr-nova="${escA(c.proj)}" data-tip="Cria um épico (fase) novo no Jira com nome, Data de início, marco e responsável">+ Nova fase</button>`:''}${c.proj?`<button class="btn" data-proj-ficha="${escA(c.proj)}" data-tip="Voltar à ficha do projeto em 📁 Portfólio e ficha (🦴 espinha)">📁 Ficha</button>`:''}${c.proj?'<button class="btn" data-cr-refresh="1" data-tip="Rebusca a ficha do Jira ignorando o cache">⟳ Atualizar</button>':''}${c.proj?'<button class="btn" data-cr-csv="1" data-tip="Baixa o cronograma em CSV">⬇ CSV</button>':''}</div></div></div>`;
  const cab=(sub)=>`<div class="card full"><h2>📅 Marcos e Cronograma <span>${sub}</span></h2>
    <div class="muted small">O relatório <b>R04</b> da Central: os épicos do projeto como fases de um cronograma em cascata — o que foi <b>planejado</b> (Data de início → Data limite do épico no Jira), o que está <b>acontecendo</b> (1º item criado → último concluído, com o % de itens), os <b>marcos</b>, a <b>previsão de término pelo ritmo</b> e as <b>dependências</b>. Clique num épico para ver a evolução e a composição.</div>${filtros}</div>`;
  if(!c.proj){ cont.replaceChildren(el(`<div class="cro-tela">${cab('escolha um projeto')}<div class="card full"><div class="estado">Escolha o projeto para montar o cronograma dos épicos.${projs.length?'':' <br><span class="muted small">⏳ carregando o catálogo do Jira…</span>'}</div></div></div>`)); return; }
  crGaranteFicha(c.proj); const d=crFicha(c.proj);
  if(!d){ cont.replaceChildren(el(`<div class="cro-tela">${cab(esc(projNome(c.proj)))}<div class="card full">${c.fichaErr[c.proj]?`<div class="erro">${esc(c.fichaErr[c.proj])} <button class="btn" data-cr-retry="1">Tentar de novo</button></div>`:skeletonPainel()}</div></div>`)); return; }
  const todas=crLinhas(d); const hoje=hojeSP();
  const n=(st)=>todas.filter(r=>r.st===st).length; const abertos=todas.filter(r=>!r.done&&!r.cancel);
  const proxMarcos=abertos.filter(r=>r.fimPlan&&r.fimPlan>=hoje&&crDias(hoje,r.fimPlan)<=30).sort((a,b)=>a.fimPlan.localeCompare(b.fimPlan));
  const proxSet=new Set(proxMarcos.map(r=>r.k));
  const filtradas=todas.filter(r=>c.fil==='abertos'?!r.done&&!r.cancel:c.fil==='atencao'?(r.st==='atrasado'||r.st==='risco'):c.fil==='atrasados'?r.st==='atrasado':c.fil==='risco'?r.st==='risco':c.fil==='marcos30'?proxSet.has(r.k):c.fil==='concluidos'?r.done:true);
  const rows=crOrdena(filtradas,c.ord); const E=crEscala(rows.length?rows:todas,c.escala); c._E={ de:E.de, dias:E.dias };   // a escala desenhada: o arrasto converte px → dias por ela
  const itensTot=todas.reduce((s,r)=>s+(r.nFilhos||0),0), itensConc=todas.reduce((s,r)=>s+(r.nConcluidos||0),0);
  const fimProj=todas.reduce((s,r)=>(r.fimRef&&r.fimRef>s?r.fimRef:s),''); const prevProj=abertos.reduce((s,r)=>(r.previsao&&r.previsao>s?r.previsao:s),'');
  const ultimo=fimProj?todas.find(r=>r.fimRef===fimProj):null;
  const hero=`<div class="vg-hero">
    ${crKpi(String(todas.length),'Épicos (fases)','',`${n('concluido')} concluído(s) · ${n('andamento')} em andamento · ${n('nao_iniciado')} não iniciado(s)`,'todos',c.fil==='todos')}
    ${crKpi(String(n('atrasado')),'Atrasados',n('atrasado')?'bad':'good','marco passou e o épico segue aberto','atrasados',c.fil==='atrasados')}
    ${crKpi(String(n('risco')),'Em risco',n('risco')?'warn':'good','previsão passa do marco, marco próximo com pouco progresso ou itens vencidos','risco',c.fil==='risco')}
    ${crKpi(String(proxMarcos.length),'Marcos nos próximos 30 dias',proxMarcos.length?'warn':'',proxMarcos.length?proxMarcos.slice(0,3).map(r=>`${esc(r.k)} ${dataBR(r.fimPlan)}`).join(' · '):'nenhum','marcos30',c.fil==='marcos30')}
    ${crKpi(`${itensTot?Math.round(itensConc/itensTot*100):0}%`,'Progresso geral (itens)','',`${itensConc} de ${itensTot} itens concluídos`,'progresso')}
    ${crKpi(fimProj?dataBR(fimProj):'—','Último marco planejado',prevProj&&fimProj&&prevProj>fimProj?'warn':'',`${ultimo?esc(ultimo.k)+' · ':''}${prevProj?`previsão pelo ritmo: ${dataBR(prevProj)}`:'sem previsão (sem ritmo recente)'}`,ultimo?`epico:${ultimo.k}`:'')}</div>`;
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
  cont.replaceChildren(el(`<div class="cro-tela">${cab(`${esc(d.nome||projNome(c.proj))} (${esc(c.proj)}) · ${todas.length} épico(s) · escala ${E.modo==='semanas'?'semanal':'mensal'} · ${dataBR(E.de)} → ${dataBR(E.ate)}`)}
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
    <div class="alx-modal-acoes"><button class="btn primario" data-cr-editar-m="${escA(k)}">✎ Editar fase</button><a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(k)}" target="_blank" rel="noopener">Abrir no Jira ↗</a>${abertosK.length?`<button class="btn" data-ct-gestao="${escA(abertosK.slice(0,200).join(','))}">🛠 Abrir os ${Math.min(abertosK.length,200)} abertos na Gestão</button>`:''}<button class="btn" id="gx-fechar">Fechar</button></div>`);
  if(soHoras){ /* redesenhado inteiro acima — mantém o modal aberto com as horas carregadas */ }
}
// KPI "Progresso geral": itens do projeto por épico (barra de progresso) + itens abertos, com ação na Gestão.
function crAbreProgresso(){
  const c=estado.cronograma; const d=crFicha(c.proj); if(!d) return; const rows=crOrdena(crLinhas(d),'auto');
  const cancel=(i)=>/cancel/i.test(i.st||''); const itens=(d.itens||[]).filter(i=>!i.ep);
  const validos=itens.filter(i=>!cancel(i)); const conc=validos.filter(i=>i.sc==='done'); const abertos=validos.filter(i=>i.sc!=='done').sort((a,b)=>(a.v||'9999').localeCompare(b.v||'9999'));
  const hoje=hojeSP(); const vencidos=abertos.filter(i=>i.v&&i.v<hoje).length; const semEp=abertos.filter(i=>!i.e).length;
  const pct=validos.length?Math.round(conc.length/validos.length*100):0;
  const dl=(l,v)=>`<div class="ams-dl"><div class="dt">${l}</div><div class="dd">${v}</div></div>`;
  const linhas=rows.map(r=>`<tr class="rm-click" data-cr-ep="${escA(r.k)}" data-tipk="clique para abrir o épico"><td><b>${esc(r.k)}</b> <span class="muted small">${esc((r.resumo||'').slice(0,50))}</span></td><td>${crBadge(r.st)}</td><td class="num">${r.nConcluidos}/${r.nFilhos}</td><td style="min-width:150px"><div class="rp-wf-t"><i style="width:${r.pct}%;background:${CR_ST[r.st][2]}"></i></div></td><td class="num">${r.pct}%</td><td class="num">${fmtHd(r.gastoH)} <span class="muted small">/ ${fmtHd(r.estH)}</span></td></tr>`).join('');
  abreModal(`<h2>📊 Progresso geral · ${esc(d.nome||projNome(c.proj))} <span class="muted small" style="font-weight:400">${conc.length} de ${validos.length} itens concluídos (${pct}%)</span></h2>
    <div class="ams-dgrid" style="margin:8px 0 10px">${dl('Concluídos',conc.length)}${dl('Abertos',abertos.length)}${dl('Vencidos',vencidos?`<span class="rp-neg">${vencidos}</span>`:'0')}${dl('Abertos sem épico',semEp)}${dl('Cancelados',itens.length-validos.length)}</div>
    <div class="mp-h3">🧩 Por épico <span class="mp-dim">clique para abrir o épico</span></div>
    <div class="scroll-x"><table class="mp-tab-mini cr-tab"><thead><tr><th>Épico</th><th>Status</th><th class="num">Itens</th><th>Progresso</th><th class="num">%</th><th class="num">Horas</th></tr></thead><tbody>${linhas||'<tr><td colspan="6" class="mp-dim">Sem épicos.</td></tr>'}</tbody></table></div>
    <div class="mp-h3" style="margin-top:12px">📋 Itens abertos <span class="mp-dim">${abertos.length} · vencimento mais próximo primeiro</span></div>${projTabelaItens(abertos,200)}
    <div class="alx-modal-acoes">${abertos.length?`<button class="btn" data-ct-gestao="${escA(abertos.slice(0,200).map(i=>i.k).join(','))}">🛠 Abrir os ${Math.min(abertos.length,200)} abertos na Gestão</button>`:''}<button class="btn" id="gx-fechar">Fechar</button></div>`);
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
// KPI acionável: filtro do cronograma (clicar de novo volta a "todos"), itens do projeto ou o épico do último marco.
function crAcaoKpi(acao){
  const c=estado.cronograma; if(!acao) return;
  if(acao==='progresso'){ crAbreProgresso(); return; }
  if(acao.startsWith('epico:')){ crAbreEpico(acao.slice(6)); return; }
  c.fil=(c.fil===acao&&acao!=='todos')?'todos':acao; if(c.fil==='marcos30') c.ord='fim';
  renderCronograma(); const g=document.querySelector('#conteudo .cr-gantt'); if(g&&c.fil!=='todos') g.scrollIntoView({behavior:'smooth',block:'start'});
}
document.getElementById('conteudo').addEventListener('keydown',(e)=>{
  if(estado.vista!=='cronograma') return; if(e.key!=='Enter'&&e.key!==' ') return;
  const k=e.target.closest&&e.target.closest('[data-cr-kpi]'); if(k){ e.preventDefault(); crAcaoKpi(k.getAttribute('data-cr-kpi')); return; }
  const r=e.target.closest&&e.target.closest('[data-cr-ep]'); if(r){ e.preventDefault(); crAbreEpico(r.getAttribute('data-cr-ep')); }
});
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='cronograma') return; const c=estado.cronograma;
  const kp=e.target.closest&&e.target.closest('[data-cr-kpi]'); if(kp){ crAcaoKpi(kp.getAttribute('data-cr-kpi')); return; }
  if(_crDrag&&_crDrag.arrastou){ _crDrag=null; return; }   // soltou a barra: o clique que acompanha o pointerup não abre o épico
  if(e.target.closest&&e.target.closest('.cr-nome-inp')) return;   // renomeando em linha
  const row=e.target.closest&&e.target.closest('[data-cr-ep]'); if(row&&!e.target.closest('a')&&!e.target.closest('button')){
    // no NOME, o clique simples espera 300 ms pelo duplo clique (renomear): abrir o épico no 1º clique engolia o 2º no modal
    if(e.target.closest('[data-cr-nome]')){ clearTimeout(_crClickT); const k=row.getAttribute('data-cr-ep'); _crClickT=setTimeout(()=>{ if(!document.querySelector('.cr-nome-inp')) crAbreEpico(k); },300); return; }
    crAbreEpico(row.getAttribute('data-cr-ep')); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-cr-editar')){ crAbreEditar(t.getAttribute('data-cr-editar')); return; }
  if(t.hasAttribute('data-cr-nova')){ crAbreNova(t.getAttribute('data-cr-nova')); return; }
  if(t.hasAttribute('data-cr-fil')){ c.fil=t.getAttribute('data-cr-fil'); renderCronograma(); return; }
  if(t.hasAttribute('data-cr-refresh')){ crGaranteFicha(c.proj,true); renderCronograma(); return; }
  if(t.hasAttribute('data-cr-retry')){ delete c.fichaErr[c.proj]; renderCronograma(); return; }
  if(t.hasAttribute('data-cr-csv')){ crExportaCSV(); return; }
});
document.getElementById('modal-body').addEventListener('click',(e)=>{
  if(estado.vista==='cronograma'){ const r=e.target.closest&&e.target.closest('[data-cr-ep]'); if(r&&!e.target.closest('a')&&!e.target.closest('button')){ crAbreEpico(r.getAttribute('data-cr-ep')); return; } }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-cr-horas')){ crGaranteTempo(); const h=document.getElementById('cr-horas'); if(h) h.innerHTML='<div class="muted small">⏳ Lendo as horas apontadas (12 meses)…</div>'; }
  if(t.hasAttribute('data-cr-editar-m')){ crAbreEditar(t.getAttribute('data-cr-editar-m')); }
});
// Atalho vindo de outras telas (ficha do projeto, catálogo): abre o cronograma do projeto.
document.addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('[data-cr-abrir]'); if(!t) return;
  const k=t.getAttribute('data-cr-abrir'); if(k) estado.cronograma.proj=k; if(estado.vista!=='cronograma') vaiPara('cronograma'); else renderCronograma();
});

// ===========================================================================
// ✎ CRONOGRAMA EDITÁVEL (2026-10-21, a pedido do usuário: "transforme essa tela em algo totalmente editável").
// Tudo que a tela mostra do épico passa a ser editável com o token da PRÓPRIA pessoa (como ⏱ Apontar e 🛠 Gestão),
// gravando no Jira — a fonte continua sendo o Jira, sem modelo paralelo: nome (summary), Data de início
// (customfield_10015), marco (duedate), responsável, status (transições), dependências (links "Blocks" entre épicos
// do projeto), itens vencendo depois do marco (📐 alinhar) e "+ Nova fase". Gestos: arrastar a barra planejada move as
// duas datas, as bordas mudam início/marco, o ◆ muda o marco (grade de 1 dia, só com ponteiro fino); duplo clique no
// nome renomeia; ✎ abre o formulário. A escrita é OTIMISTA (a ficha em memória muda e a tela redesenha na hora), o
// servidor confirma (POST /api/criar {editar:1}); falha → reverte + toast; depois a ficha é relida com nocache em
// segundo plano. `crLinhas` (o semáforo, com gate de paridade com o servidor) NÃO muda: só os dados de entrada mudam.
let _crDrag=null, _crUndo=null, _crUndoT=null, _crReleT=null, _crEd=null, _crClickT=null;
function crIdent(){ const id=idApontar(); if(!id){ abreIdentidade(); return null; } return id; }
function crEpicoLocal(k){ const c=estado.cronograma; const d=crFicha(c.proj); return d?((d.epicos||[]).find(e=>e.k===k)||null):null; }
// Releitura da ficha (nocache) com debounce — várias edições seguidas pedem UMA leitura.
function crReleFicha(){ const c=estado.cronograma; clearTimeout(_crReleT); _crReleT=setTimeout(()=>{ delete c.fichaErr[c.proj]; crGaranteFicha(c.proj,true); },1500); }
// Patch otimista no épico em memória (campos: ini, fim, resumo, resp, status, sc, links) e nos itens espelho.
function crPatchLocal(k, campos){
  const e=crEpicoLocal(k); if(!e) return; const antes={};
  Object.keys(campos).forEach(f=>{ antes[f]=e[f]; e[f]=campos[f]; });
  const d=crFicha(estado.cronograma.proj); const it=d&&(d.itens||[]).find(x=>x.k===k);
  if(it){ if('ini' in campos) it.si=campos.ini||''; if('fim' in campos) it.v=campos.fim||''; if('resumo' in campos) it.s=String(campos.resumo||'').slice(0,90); if('status' in campos) it.st=campos.status; if('sc' in campos) it.sc=campos.sc; if('resp' in campos) it.r=campos.resp||''; }
  return antes;
}
// Grava no Jira: itens [{key, venc?, inicio?, resumo?, respId?}] e/ou links [{acao, de, para}|{acao:'rm', id}].
async function crGrava(itens, links){
  const id=crIdent(); if(!id) return { ok:false, erro:'sem identidade' };
  try{
    const j=await fetch('/api/criar',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ editar:1, itens:itens||[], links:links||[], email:id.email, token:id.token }) }).then(r=>r.json());
    if(!j||j.erro) return { ok:false, erro:humanizaErro((j&&j.erro)||'Falha ao gravar.') };
    const ruim=(j.resultados||[]).find(r=>!r.ok)||(j.links||[]).find(r=>!r.ok);
    return { ok:!!j.ok, erro:ruim?humanizaErro(ruim.erro||'Falha ao gravar.'):'', resultados:j.resultados||[], links:j.links||[] };
  }catch(e){ return { ok:false, erro:humanizaErro(e) }; }
}
// Edita datas/nome/responsável de UM épico: otimista + grava + ↩ desfazer (10 s).
async function crEdita(k, campos, rotulo, opts){
  const o=opts||{}; const e=crEpicoLocal(k); if(!e) return false; const id=crIdent(); if(!id) return false;
  const corpo={ key:k }; const local={};
  if('ini' in campos){ corpo.inicio=campos.ini||''; local.ini=campos.ini||''; }
  if('fim' in campos){ corpo.venc=campos.fim||''; local.fim=campos.fim||''; }
  if('resumo' in campos){ corpo.resumo=campos.resumo; local.resumo=campos.resumo; }
  if('respId' in campos){ corpo.respId=campos.respId||''; local.resp=campos.respNome||''; }
  const antes=crPatchLocal(k, local); crReRender();
  const r=await crGrava([corpo]);
  if(!r.ok){ crPatchLocal(k, antes); crReRender(); toast(`Não gravou ${k}: ${r.erro}`,'err'); return false; }
  logAcao({ acao:'cronograma-editar', t:k, para:rotulo||Object.keys(campos).join(', '), ok:true });
  if(!o.semUndo){ const volta={}; if('ini' in campos) volta.ini=antes.ini||''; if('fim' in campos) volta.fim=antes.fim||''; if('resumo' in campos) volta.resumo=antes.resumo; if('respId' in campos){ volta.respId=o.respIdAntes||''; volta.respNome=antes.resp||''; }
    crUndoMostra(`${k}: ${rotulo||'editado'}`, ()=>crEdita(k, volta, 'desfazer', { semUndo:true })); }
  else toast(`↩ ${k} voltou como estava.`,'ok');
  crReleFicha(); return true;
}
// Barra "↩ desfazer" (10 s), uma de cada vez.
function crUndoMostra(txt, fn){
  clearTimeout(_crUndoT); _crUndo=fn; let b=document.getElementById('cr-undo');
  if(!b){ b=el('<div id="cr-undo" class="cr-undo" role="status"><span class="cr-undo-t"></span><button class="btn" data-cr-undo>↩ Desfazer</button><button class="btn cr-undo-x" data-cr-undo-x aria-label="Fechar">×</button></div>'); document.body.appendChild(b); }
  b.querySelector('.cr-undo-t').textContent=`✓ ${txt}`;
  _crUndoT=setTimeout(crUndoSome, 10000);
}
function crUndoSome(){ clearTimeout(_crUndoT); _crUndo=null; const b=document.getElementById('cr-undo'); if(b) b.remove(); }
// ---- arrastar na linha do tempo (ponteiro fino) ----
function crDragInicia(e){
  if(!matchMedia('(pointer:fine)').matches) return;
  const alca=e.target.closest&&e.target.closest('[data-cr-h]'); const bar=e.target.closest&&e.target.closest('[data-cr-bar]'); const mk=e.target.closest&&e.target.closest('[data-cr-marco]');
  if(!bar&&!mk) return; if(e.button!==0) return;
  const c=estado.cronograma; const E=c._E; if(!E||!E.dias) return;
  const track=(bar||mk).closest('.cr-track'); if(!track) return;
  const k=(bar||mk).getAttribute(bar?'data-cr-bar':'data-cr-marco'); const r=crLinhas(crFicha(c.proj)||{}).find(x=>x.k===k); if(!r||r.done||r.cancel) return;
  const modo=mk?'marco':(alca?alca.getAttribute('data-cr-h'):'move');
  _crDrag={ k, modo, x0:e.clientX, pxDia:track.getBoundingClientRect().width/E.dias, a:(bar||mk).getAttribute('data-cr-a')||r.iniPlan||r.iniReal||r.criado||'', b:(bar||mk).getAttribute('data-cr-b')||r.fimRef||'', el:bar||mk, track, dias:0, arrastou:false, r };
  try{ (bar||mk).setPointerCapture(e.pointerId); }catch(_){}
  e.preventDefault();
}
function crDragMove(e){
  const g=_crDrag; if(!g) return; const dias=Math.round((e.clientX-g.x0)/g.pxDia); if(dias===g.dias&&g.arrastou) return;
  if(Math.abs(e.clientX-g.x0)<3&&!g.arrastou) return;
  g.arrastou=true; g.dias=dias; const n=crDragNovo(g); const E=estado.cronograma._E; const pos=(iso)=>Math.max(0,Math.min(100,crDias(E.de,iso)/E.dias*100));
  g.el.classList.add('arrastando');
  if(g.modo==='marco'){ g.el.style.left=pos(n.fim).toFixed(2)+'%'; }
  else { const a=n.ini||g.a, b=n.fim||g.b; g.el.style.left=pos(a).toFixed(2)+'%'; g.el.style.width=Math.max(0.4,pos(b)-pos(a)).toFixed(2)+'%'; }
  let tip=document.getElementById('cr-drag-tip'); if(!tip){ tip=el('<div id="cr-drag-tip" class="cr-drag-tip"></div>'); document.body.appendChild(tip); }
  tip.textContent=g.modo==='marco'||g.modo==='fim'?`◆ marco → ${dataBR(n.fim)}`:g.modo==='ini'?`início → ${dataBR(n.ini)}`:`${dataBR(n.ini)} → ${dataBR(n.fim)} (${dias>0?'+':''}${dias} d)`;
  tip.style.left=(e.clientX+12)+'px'; tip.style.top=(e.clientY-30)+'px';
}
function crDragNovo(g){
  const d=g.dias; if(g.modo==='move') return { ini:g.a?crAddDias(g.a,d):'', fim:g.b?crAddDias(g.b,d):'' };
  if(g.modo==='ini'){ const ini=crAddDias(g.a,d); return { ini:ini>g.b&&g.b?g.b:ini, fim:g.b }; }
  const fim=crAddDias(g.b,d); return { ini:g.a, fim:(g.a&&fim<g.a)?g.a:fim };
}
async function crDragFim(e){
  const g=_crDrag; if(!g) return; const tip=document.getElementById('cr-drag-tip'); if(tip) tip.remove();
  try{ g.el.releasePointerCapture(e.pointerId); }catch(_){} g.el.classList.remove('arrastando');
  if(!g.arrastou||!g.dias){ _crDrag=null; return; }
  const n=crDragNovo(g); const campos={};
  if(g.modo==='move'){ if(g.r.iniPlan||g.a) campos.ini=n.ini; campos.fim=n.fim; }
  else if(g.modo==='ini') campos.ini=n.ini; else campos.fim=n.fim;
  const rot=g.modo==='move'?`movido ${g.dias>0?'+':''}${g.dias} d (${dataBR(n.ini)} → ${dataBR(n.fim)})`:g.modo==='ini'?`início ${dataBR(n.ini)}`:`marco ${dataBR(n.fim)}`;
  // o pointerup vem antes do click: _crDrag fica até o click ser engolido (ver o listener de clique); limpa depois
  setTimeout(()=>{ if(_crDrag===g) _crDrag=null; },0);
  await crEdita(g.k, campos, rot);
}
// ---- renomear em linha (duplo clique no nome) ----
function crRenomeia(k){
  const span=document.querySelector(`.cr-nome[data-cr-nome="${CSS.escape(k)}"]`); const e=crEpicoLocal(k); if(!span||!e) return; if(!crIdent()) return;
  const inp=el(`<input class="cr-nome-inp" type="text" value="${escA(e.resumo||'')}" maxlength="255" aria-label="Nome da fase">`); span.replaceWith(inp); inp.focus(); inp.select();
  let feito=false; const onBlur=()=>fim(true);
  const fim=(grava)=>{ if(feito) return; feito=true; inp.removeEventListener('blur',onBlur); const v=inp.value.trim();
    if(grava&&v&&v!==e.resumo) crEdita(k,{ resumo:v },`renomeado para "${v.slice(0,40)}"`); else crReRender(); };
  inp.addEventListener('keydown',(ev)=>{ if(ev.key==='Enter'){ ev.preventDefault(); fim(true); } if(ev.key==='Escape'){ ev.stopPropagation(); fim(false); } ev.stopPropagation(); });
  inp.addEventListener('blur',onBlur);
}
// ---- ✎ formulário da fase ----
function crEpicosDoProjeto(){ const d=crFicha(estado.cronograma.proj); return d?crOrdena(crLinhas(d),'auto'):[]; }
function crBloqueadoresDe(e){ return (e.links||[]).filter(l=>l.d==='in'&&/block|bloque|depend/i.test(l.n+' '+l.rot)); }
async function crAbreEditar(k){
  const id=crIdent(); if(!id) return; const e=crEpicoLocal(k); if(!e) return;
  _crEd={ k, trans:null, transB:false, resp:e.resp||'', respId:'' };
  abreModal('<div class="cr-ed-modal"><h2>✎ Editar fase</h2><div class="estado">Carregando…</div></div>');
  let pessoas={}; try{ const j=await usuariosP(); pessoas=(j&&j.pessoas)||{}; }catch(_){}
  if(!_crEd||_crEd.k!==k) return;
  _crEd.pessoas=pessoas; const atual=Object.entries(pessoas).find(([,u])=>u&&u.nome===e.resp); _crEd.respId=atual?atual[0]:'';
  crPintaEditar();
}
function crPintaEditar(){
  const m=_crEd; if(!m) return; const box=document.querySelector('#modal-body .cr-ed-modal'); if(!box) return; const e=crEpicoLocal(m.k); if(!e) return;
  const d=crFicha(estado.cronograma.proj); const rows=crEpicosDoProjeto(); const r=rows.find(x=>x.k===m.k)||{};
  const bloq=crBloqueadoresDe(e); const bloqSet=new Set(bloq.map(l=>l.k));
  const filhosDepois=e.fim?(d.itens||[]).filter(i=>i.e===m.k&&i.v&&i.v>e.fim&&i.sc!=='done'&&!/cancel/i.test(i.st||'')):[];
  const pessoas=Object.entries(m.pessoas||{}).map(([a,u])=>({ a, nome:(u&&u.nome)||a })).sort((x,y)=>x.nome.localeCompare(y.nome,'pt'));
  const transHtml=m.trans===null?`<button class="btn" data-cr-ed-trans>🔁 Carregar as transições do fluxo</button>`:m.transB?'<span class="muted small">Carregando…</span>':(m.trans.length?m.trans.map(t=>`<button class="chip st-${escA(t.categoria)}" data-cr-ed-ir="${escA(t.id)}" data-cr-ed-nome="${escA(t.para||t.nome)}" data-cr-ed-cat="${escA(t.categoria)}">${esc(t.para||t.nome)}</button>`).join(' '):'<span class="muted small">Nenhuma transição disponível para você neste épico.</span>');
  box.innerHTML=`<h2>✎ Editar fase <span class="muted small">${esc(m.k)} · ${esc(e.status||'')}</span></h2>
    <div class="rv-form" style="margin-top:8px">
      <div class="campo full"><label>Nome <span class="muted small">(o prefixo "1.", "2.3" ordena a cascata)</span></label><input type="text" id="cr-ed-nome" value="${escA(e.resumo||'')}" maxlength="255"></div>
      <div class="campo"><label>Data de início</label><input type="date" id="cr-ed-ini" value="${escA(e.ini||'')}"></div>
      <div class="campo"><label>Marco (data limite)</label><input type="date" id="cr-ed-fim" value="${escA(e.fim||'')}"></div>
      <div class="campo full"><label>Responsável</label><select id="cr-ed-resp"><option value="">— sem responsável —</option>${pessoas.map(p=>`<option value="${escA(p.a)}" ${p.a===m.respId?'selected':''}>${esc(p.nome)}</option>`).join('')}${(e.resp&&!m.respId)?`<option value="__atual" selected>${esc(e.resp)} (atual)</option>`:''}</select></div>
    </div>
    <div class="mp-h3" style="margin-top:12px">🔁 Status <span class="mp-dim">${esc(e.status||'—')}</span></div><div class="ap-chips" id="cr-ed-trans">${transHtml}</div>
    <div class="mp-h3" style="margin-top:12px">⏮ Bloqueado por <span class="mp-dim">dependências "Blocks" entre épicos deste projeto</span></div>
    <div class="cr-ed-deps">${rows.filter(x=>x.k!==m.k).map(x=>`<label class="hj-check small"><input type="checkbox" data-cr-ed-dep="${escA(x.k)}" ${bloqSet.has(x.k)?'checked':''}> <b>${esc(x.k)}</b> ${esc((x.resumo||'').slice(0,60))}</label>`).join('')||'<span class="muted small">Não há outros épicos no projeto.</span>'}</div>
    ${filhosDepois.length?`<div class="aviso" style="margin-top:10px">⚠ ${filhosDepois.length} item(ns) deste épico vencem DEPOIS do marco (${esc(dataBR(e.fim))}). <button class="btn" data-cr-ed-alinhar="${escA(m.k)}">📐 Alinhar ${filhosDepois.length} ao marco</button></div>`:''}
    <div class="ap-fb" id="cr-ed-fb" hidden></div>
    <div class="alx-modal-acoes"><button class="btn primario" data-cr-ed-ok>Salvar</button><a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(m.k)}" target="_blank" rel="noopener">Abrir no Jira ↗</a><button class="btn" data-cr-ed-fecha>Cancelar</button></div>`;
}
async function crEditarTrans(){
  const m=_crEd; const id=idApontar(); if(!m||!id) return; m.trans=[]; m.transB=true; crPintaEditar();
  try{ const j=await fetch('/api/transicao',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ listar:true, issue:m.k, email:id.email, token:id.token }) }).then(r=>r.json());
    m.transB=false; m.trans=(j&&j.ok)?(j.transicoes||[]):[]; if(j&&!j.ok) toast(j.erro||'Falha ao listar transições.','err'); }
  catch(e){ m.transB=false; m.trans=[]; toast(humanizaErro(e),'err'); }
  if(_crEd===m) crPintaEditar();
}
async function crEditarIr(tid, nome, cat){
  const m=_crEd; const id=idApontar(); if(!m||!id) return; const e=crEpicoLocal(m.k); if(!e) return;
  const fb=document.getElementById('cr-ed-fb'); if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Movendo…'; }
  try{ const j=await fetch('/api/transicao',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ issue:m.k, transitionId:tid, email:id.email, token:id.token }) }).then(r=>r.json());
    if(!(j&&j.ok)) throw new Error((j&&j.erro)||'Falha ao mover.');
    crPatchLocal(m.k,{ status:nome, sc:cat==='done'?'done':(cat==='new'?'new':'indeterminate') }); if(cat==='done'){ const x=crEpicoLocal(m.k); if(x){ x.aberto=false; x.resolvido=hojeSP(); } }
    logAcao({ acao:'transicao', t:m.k, para:nome, ok:true }); invalidaCacheDados(); crReRender(); m.trans=null; crPintaEditar(); toast(`✓ ${m.k} → ${nome}.`,'ok'); crReleFicha();
  }catch(e){ if(fb){ fb.className='ap-fb err'; fb.textContent=humanizaErro(e); } }
}
async function crEditarSalva(){
  const m=_crEd; if(!m) return; const e=crEpicoLocal(m.k); if(!e) return; const fb=document.getElementById('cr-ed-fb'); const bt=document.querySelector('#modal-body [data-cr-ed-ok]');
  const nome=((document.getElementById('cr-ed-nome')||{}).value||'').trim(); const ini=((document.getElementById('cr-ed-ini')||{}).value||'').trim(); const fim=((document.getElementById('cr-ed-fim')||{}).value||'').trim();
  const respSel=(document.getElementById('cr-ed-resp')||{}).value; const erro=(t)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=t; } if(bt) bt.disabled=false; };
  if(!nome) return erro('O nome da fase não pode ficar vazio.'); if(ini&&fim&&fim<ini) return erro('O marco não pode ser antes do início.');
  const campos={}; if(nome!==(e.resumo||'')) campos.resumo=nome; if(ini!==(e.ini||'')) campos.ini=ini; if(fim!==(e.fim||'')) campos.fim=fim;
  if(respSel!=null&&respSel!=='__atual'&&respSel!==m.respId){ campos.respId=respSel; campos.respNome=respSel?((m.pessoas[respSel]||{}).nome||''):''; }
  // dependências: o que marcou a mais vira link novo; o que desmarcou some pelo id
  const bloq=crBloqueadoresDe(e); const marcados=new Set([...document.querySelectorAll('[data-cr-ed-dep]:checked')].map(x=>x.getAttribute('data-cr-ed-dep')));
  const links=[]; marcados.forEach(k=>{ if(!bloq.some(l=>l.k===k)) links.push({ acao:'add', de:k, para:m.k }); });
  bloq.forEach(l=>{ if(!marcados.has(l.k)){ if(l.id) links.push({ acao:'rm', id:l.id }); else erro(`Não sei o id do link com ${l.k} — atualize a ficha (↻) e tente de novo.`); } });
  if(!Object.keys(campos).length&&!links.length){ fechaModal(); _crEd=null; return; }
  if(bt) bt.disabled=true; if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Gravando…'; }
  let ok=true;
  if(Object.keys(campos).length){ ok=await crEdita(m.k, campos, [campos.resumo!=null?'nome':'', campos.ini!=null?'início':'', campos.fim!=null?'marco':'', campos.respId!=null?'responsável':''].filter(Boolean).join(', '), { respIdAntes:m.respId }); }
  if(ok&&links.length){ const r=await crGrava([], links);
    if(!r.ok){ toast(`Dependências: ${r.erro}`,'err'); ok=false; }
    else { const x=crEpicoLocal(m.k); if(x){ x.links=(x.links||[]).filter(l=>!links.some(y=>y.acao==='rm'&&y.id===l.id)); (r.links||[]).forEach(y=>{ if(y.acao==='add'&&y.ok) x.links.push({ d:'in', n:'Blocks', rot:'is blocked by', k:y.de, id:'' }); const o=crEpicoLocal(y.de); if(o&&y.acao==='add'&&y.ok) o.links=(o.links||[]).concat({ d:'out', n:'Blocks', rot:'blocks', k:m.k, id:'' }); }); }
      logAcao({ acao:'cronograma-dependencias', t:m.k, para:links.map(l=>l.acao==='add'?`+${l.de}`:`−${l.id}`).join(' '), ok:true }); crReRender(); crReleFicha(); } }
  if(ok){ _crEd=null; fechaModal(); toast(`✓ ${m.k} atualizado.`,'ok'); } else { if(bt) bt.disabled=false; if(fb) fb.hidden=true; }
}
async function crAlinhaFilhos(k){
  const id=crIdent(); if(!id) return; const e=crEpicoLocal(k); const d=crFicha(estado.cronograma.proj); if(!e||!e.fim||!d) return;
  const filhos=(d.itens||[]).filter(i=>i.e===k&&i.v&&i.v>e.fim&&i.sc!=='done'&&!/cancel/i.test(i.st||'')); if(!filhos.length) return;
  const fb=document.getElementById('cr-ed-fb'); if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent=`Alinhando ${filhos.length} item(ns) ao marco…`; }
  const r=await crGrava(filhos.map(i=>({ key:i.k, venc:e.fim })));
  if(!r.ok){ if(fb){ fb.className='ap-fb err'; fb.textContent=r.erro; } return; }
  filhos.forEach(i=>{ i.v=e.fim; }); e.filhosDepois=0; logAcao({ acao:'cronograma-alinhar', t:k, para:`${filhos.length} item(ns) → ${e.fim}`, ok:true }); invalidaCacheDados();
  crReRender(); crPintaEditar(); toast(`✓ ${filhos.length} item(ns) alinhados ao marco ${dataBR(e.fim)}.`,'ok'); crReleFicha();
}
// ---- + Nova fase ----
function crTipoEpico(proj){ const p=(_projetosCache||[]).find(x=>x.key===proj); const t=p&&(p.tipos||[]).find(x=>x.nivel===1||/^epic$|épico/i.test(x.nome||'')); return t?t.id:''; }
async function crAbreNova(proj){
  const id=crIdent(); if(!id) return; if(!_projetosCache){ try{ await garanteProjetos(); }catch(_){} }
  const rows=crEpicosDoProjeto(); const topo=rows.map(r=>r.pfx.nums.length===1?r.pfx.nums[0]:0).reduce((a,b)=>Math.max(a,b),0);
  let pessoas={}; try{ const j=await usuariosP(); pessoas=(j&&j.pessoas)||{}; }catch(_){}
  const lista=Object.entries(pessoas).map(([a,u])=>({ a, nome:(u&&u.nome)||a })).sort((x,y)=>x.nome.localeCompare(y.nome,'pt'));
  const tipo=crTipoEpico(proj);
  abreModal(`<div class="cr-ed-modal"><h2>+ Nova fase <span class="muted small">${esc(projNome(proj))} (${esc(proj)})</span></h2>
    ${tipo?'':'<div class="aviso">⚠ Este projeto não tem um tipo de épico (hierarquia 1) no catálogo — não dá para criar a fase por aqui.</div>'}
    <div class="rv-form" style="margin-top:8px">
      <div class="campo full"><label>Nome <span class="muted small">(use o prefixo numérico para ordenar: "${topo+1}. …")</span></label><input type="text" id="cr-nv-nome" value="${escA(topo?`${topo+1}. `:'')}" maxlength="255" placeholder="ex.: 3. Testes integrados"></div>
      <div class="campo"><label>Data de início</label><input type="date" id="cr-nv-ini"></div>
      <div class="campo"><label>Marco (data limite)</label><input type="date" id="cr-nv-fim"></div>
      <div class="campo full"><label>Responsável</label><select id="cr-nv-resp"><option value="">— sem responsável —</option>${lista.map(p=>`<option value="${escA(p.a)}" ${p.a===id.accountId?'selected':''}>${esc(p.nome)}</option>`).join('')}</select></div>
    </div>
    <div class="muted small" style="margin-top:6px">O épico nasce no Jira com o seu usuário como relator; aparece aqui na hora e no portal do cliente no próximo refresh.</div>
    <div class="ap-fb" id="cr-nv-fb" hidden></div>
    <div class="alx-modal-acoes"><button class="btn primario" data-cr-nv-ok="${escA(proj)}" ${tipo?'':'disabled'}>Criar fase</button><button class="btn" data-cr-ed-fecha>Cancelar</button></div></div>`);
  setTimeout(()=>{ const i=document.getElementById('cr-nv-nome'); if(i){ i.focus(); i.setSelectionRange(i.value.length,i.value.length); } },50);
}
async function crCriaFase(proj){
  const id=crIdent(); if(!id) return; const fb=document.getElementById('cr-nv-fb'); const bt=document.querySelector('#modal-body [data-cr-nv-ok]');
  const nome=((document.getElementById('cr-nv-nome')||{}).value||'').trim(); const ini=((document.getElementById('cr-nv-ini')||{}).value||'').trim(); const fim=((document.getElementById('cr-nv-fim')||{}).value||'').trim(); const resp=((document.getElementById('cr-nv-resp')||{}).value||'');
  const erro=(t)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=t; } if(bt) bt.disabled=false; };
  if(!nome) return erro('Dê um nome à fase.'); if(ini&&fim&&fim<ini) return erro('O marco não pode ser antes do início.');
  const tipoId=crTipoEpico(proj); if(!tipoId) return erro('Projeto sem tipo de épico no catálogo.');
  if(bt) bt.disabled=true; if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Criando no Jira…'; }
  try{
    const j=await fetch('/api/criar',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ itens:[{ projeto:proj, tipoId, resumo:nome, venc:fim||undefined, inicio:ini||undefined, respId:resp||undefined }], email:id.email, token:id.token }) }).then(r=>r.json());
    const c=(j&&j.criados&&j.criados[0])||null; const e1=(j&&j.erros&&j.erros[0])||null;
    if(!c||!c.key) throw new Error((e1&&e1.erro)||(j&&j.erro)||'Não consegui criar a fase.');
    const d=crFicha(proj); const resumo=nome; const pessoas=(await usuariosP().catch(()=>({})))||{};
    if(d){ d.epicos=d.epicos||[]; d.epicos.push({ k:c.key, resumo, status:'A fazer', nFilhos:0, nConcluidos:0, pct:0, estH:0, gastoH:0, sc:'new', ini, fim, criado:hojeSP(), resolvido:'', resp:resp?(((pessoas.pessoas||{})[resp]||{}).nome||''):'', emAnd:0, filhosAbertos:0, filhosVenc:0, filhosDepois:0, iniItens:'', fimItens:'', vencFilhos:'', ultAtiv:'', porMes:{}, links:[] }); }
    logAcao({ acao:'cronograma-nova-fase', t:c.key, para:resumo.slice(0,80), ok:true }); invalidaCacheDados(); fechaModal(); crReRender(); toast(`✓ Fase ${c.key} criada.`,'ok'); crReleFicha();
  }catch(e){ erro(humanizaErro(e)); }
}
// ---- listeners da edição (delegados; os da tela ficam no fim do arquivo) ----
document.getElementById('conteudo').addEventListener('pointerdown',(e)=>{ if(estado.vista==='cronograma') crDragInicia(e); });
document.addEventListener('pointermove',(e)=>{ if(_crDrag) crDragMove(e); });
document.addEventListener('pointerup',(e)=>{ if(_crDrag) crDragFim(e); });
document.addEventListener('pointercancel',()=>{ if(_crDrag){ const tip=document.getElementById('cr-drag-tip'); if(tip) tip.remove(); _crDrag=null; crReRender(); } });
document.getElementById('conteudo').addEventListener('dblclick',(e)=>{ if(estado.vista!=='cronograma') return; const n=e.target.closest&&e.target.closest('[data-cr-nome]'); if(n){ e.preventDefault(); clearTimeout(_crClickT); crRenomeia(n.getAttribute('data-cr-nome')); } });
document.addEventListener('click',(e)=>{
  const t=e.target; if(!t||!t.closest) return;
  if(t.closest('[data-cr-undo]')){ const fn=_crUndo; crUndoSome(); if(fn) fn(); return; }
  if(t.closest('[data-cr-undo-x]')){ crUndoSome(); return; }
  if(!t.closest('#modal-body')) return;
  if(t.closest('[data-cr-ed-fecha]')){ _crEd=null; fechaModal(); return; }
  if(t.closest('[data-cr-ed-ok]')){ crEditarSalva(); return; }
  if(t.closest('[data-cr-ed-trans]')){ crEditarTrans(); return; }
  const ir=t.closest('[data-cr-ed-ir]'); if(ir){ crEditarIr(ir.getAttribute('data-cr-ed-ir'), ir.getAttribute('data-cr-ed-nome'), ir.getAttribute('data-cr-ed-cat')); return; }
  const al=t.closest('[data-cr-ed-alinhar]'); if(al){ crAlinhaFilhos(al.getAttribute('data-cr-ed-alinhar')); return; }
  const nv=t.closest('[data-cr-nv-ok]'); if(nv){ crCriaFase(nv.getAttribute('data-cr-nv-ok')); return; }
});
document.addEventListener('keydown',(e)=>{ const t=e.target; if(!t||!t.id||e.key!=='Enter') return;
  if(/^cr-ed-(nome|ini|fim)$/.test(t.id)){ e.preventDefault(); crEditarSalva(); } else if(/^cr-nv-(nome|ini|fim)$/.test(t.id)){ e.preventDefault(); const b=document.querySelector('#modal-body [data-cr-nv-ok]'); if(b&&!b.disabled) b.click(); } });
