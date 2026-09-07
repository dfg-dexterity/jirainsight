// Jira Insights · 17b · 💹 RENTABILIDADE DE PROJETOS — cadastro do projeto, planner visual pessoa × mês, cenários e simulações.
// ===========================================================================
// O plano de um projeto: duração (início + meses), carga de trabalho VENDIDA (h/mês
// ou total) e valor-hora → receita. Em cada CENÁRIO, a grade pessoa × mês diz quem
// trabalha quanto (execução ou gestão); o custo é SEMPRE horas × custo/h da pessoa
// (cfg.custosPessoa / vaga planejada). Daí saem esforço previsto, eficiência
// (esforço ÷ vendidas), horas economizadas, margem, receita por hora trabalhada e a
// folga para alocar alguém mais barato mantendo a margem-meta. Se o plano aponta um
// projeto do Jira, o REALIZADO (Clockwork) entra na grade e nos KPIs — e mostra
// quanto mais rápido o projeto está sendo feito. Tudo salvo na config compartilhada
// (cfg.rentab); gestores editam, os demais leem.
// Helpers de outros módulos só em tempo de render.
// ===========================================================================
const RP_PAPEIS=[['exec','Execução'],['gestao','Gestão']];
const RP_CORES=['#009994','#4a3aa7','#eb6834','#008300','#B27DB4','#FFA436','#2a78d6','#C2660A','#5B8C5A','#8A5B00'];
const RP_MAX_MESES=36;
function rpPlanos(){ if(!cfg.rentab||typeof cfg.rentab!=='object') cfg.rentab={planos:[]}; if(!Array.isArray(cfg.rentab.planos)) cfg.rentab.planos=[]; return cfg.rentab.planos; }
function rpPlano(id){ return rpPlanos().find(p=>p.id===id)||null; }
function rpId(pre){ return pre+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function rpNovoCenario(nome){ return { id:rpId('cn'), nome:nome||'Base', aloc:[] }; }
function rpNovoPlano(){ const c=rpNovoCenario('Base'); const h=hojeSP();
  return { id:rpId('rp'), nome:'', cliente:'', projeto:'', inicio:h.slice(0,7)+'-01', meses:3, modoCarga:'mes', cargaMes:0, cargaTotal:0, valorHora:0, margemMeta:30, obs:'',
    cenarios:[c], cenario:c.id, criadoEm:h, atualizadoEm:h }; }
function rpMeses(p){ const out=[]; const ini=/^\d{4}-\d{2}/.test(p.inicio||'')?p.inicio:hojeSP(); let y=+ini.slice(0,4), m=+ini.slice(5,7);
  const n=Math.max(1,Math.min(RP_MAX_MESES,Math.round(Number(p.meses)||1)));
  for(let i=0;i<n;i++){ out.push(`${y}-${String(m).padStart(2,'0')}`); m++; if(m>12){ m=1; y++; } } return out; }
function rpFim(p){ const ms=rpMeses(p); const u=ms[ms.length-1]; const y=+u.slice(0,4), m=+u.slice(5,7); return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10); }
function rpVendidas(p){ const ms=rpMeses(p); return p.modoCarga==='total'?Math.max(0,Number(p.cargaTotal)||0):Math.max(0,Number(p.cargaMes)||0)*ms.length; }
function rpCenario(p){ let c=(p.cenarios||[]).find(x=>x.id===p.cenario); if(!c){ if(!(p.cenarios||[]).length) p.cenarios=[rpNovoCenario('Base')]; c=p.cenarios[0]; p.cenario=c.id; } return c; }
function rpStatus(p){ const h=hojeSP(); if(h<(p.inicio||'')) return ['planejado','Planejado']; if(h>rpFim(p)) return ['encerrado','Encerrado']; return ['andamento','Em andamento']; }
// Pessoas disponíveis para alocar: time (sem ocultos) + vagas planejadas (custo previsto).
function rpPessoas(){
  const u=pessoasUnidas(); const ocultos=new Set((cfg.ocultos||[]).map(o=>o&&o.a).filter(Boolean));
  const out=Object.entries(u).filter(([a,p])=>!ocultos.has(a)&&!RE_EXCLUIR.test((p&&p.nome)||'')).map(([a,p])=>({a,nome:(p&&p.nome)||a,vaga:false}));
  ppLista().forEach(pp=>out.push({a:pp.id,nome:`${pp.nome||'Vaga'} 🔮`,vaga:true}));
  return out.sort((x,y)=>x.nome.localeCompare(y.nome,'pt'));
}
function rpNome(a){ const pp=ppDe(a); if(pp) return `${pp.nome||'Vaga'} 🔮`; const u=pessoasUnidas(); return (u[a]&&u[a].nome)||a; }
function rpCustoH(a){ return alocCustoH(a); }
const rpH=(h)=>fmtHd(h);
const rpPct=(n,d)=>(d>0?Math.round(n/d*100):null);
// ---- cálculo de um cenário ----
function rpCalc(p, c){
  const meses=rpMeses(p); const vend=rpVendidas(p); const vendMes=vend/meses.length; const vh=Math.max(0,Number(p.valorHora)||0);
  const receita=vend*vh;
  const porMes={}; meses.forEach(m=>{ porMes[m]={exec:0,gestao:0,custo:0,porPessoa:{}}; });
  const porPessoa=[]; let exec=0,gestao=0,custo=0,custoExec=0,custoGestao=0,semCusto=0;
  (c.aloc||[]).forEach((al,i)=>{ const ch=rpCustoH(al.a); let tot=0,cus=0;
    meses.forEach(m=>{ const h=Math.max(0,Number((al.h||{})[m])||0); tot+=h; cus+=h*ch; const M=porMes[m];
      if(al.papel==='gestao') M.gestao+=h; else M.exec+=h; M.custo+=h*ch; M.porPessoa[i]=(M.porPessoa[i]||0)+h; });
    if(al.papel==='gestao'){ gestao+=tot; custoGestao+=cus; } else { exec+=tot; custoExec+=cus; }
    custo+=cus; if(tot>0&&!(ch>0)) semCusto++;
    porPessoa.push({ i, a:al.a, papel:al.papel||'exec', nome:rpNome(al.a), ch, h:tot, custo:cus }); });
  const esforco=exec+gestao; const margem=receita-custo; const mgp=receita>0?rpPct(margem,receita):null;
  const efic=vend>0?esforco/vend:null;           // 0,62 = 62% das horas vendidas
  const econ=vend-esforco;                        // horas economizadas (negativo = estourou)
  const recH=esforco>0?receita/esforco:null; const custoMedio=esforco>0?custo/esforco:null;
  const meta=Math.max(0,Number(p.margemMeta)||0);
  const maisBarato=porPessoa.filter(x=>x.ch>0).sort((a,b)=>a.ch-b.ch)[0]||null;
  const folgaR=receita*(1-meta/100)-custo;        // R$ que ainda cabem sem furar a meta
  const folgaH=maisBarato?Math.max(0,folgaR)/maisBarato.ch:null;
  return { meses, vend, vendMes, vh, receita, porMes, porPessoa, exec, gestao, esforco, custo, custoExec, custoGestao, margem, mgp, efic, econ, recH, custoMedio, meta, folgaR, folgaH, maisBarato, semCusto };
}
// ---- realizado (Clockwork) do projeto vinculado ----
function rpRealChave(p){ if(!p.projeto) return ''; const h=hojeSP(); let de=p.inicio, ate=rpFim(p)<h?rpFim(p):h; if(ate<de) return '';
  if(de<voltaDias(ate,365)) de=voltaDias(ate,365); return `${p.projeto}|${de}|${ate}`; }
function rpGaranteReal(p){
  const r=estado.rentab; const k=rpRealChave(p); if(!k||r.tempo[k]||r.tempoB[k]||r.tempoErro[k]) return;
  const [,de,ate]=k.split('|'); r.tempoB[k]=true;
  fetch(`/api/tempo?desde=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`).then(x=>x.json()).then(j=>{ r.tempoB[k]=false;
    if(j&&!j.erro) r.tempo[k]=j; else r.tempoErro[k]=(j&&j.erro)||'Falha ao ler as horas.'; rpReRender();
  }).catch(e=>{ r.tempoB[k]=false; r.tempoErro[k]=humanizaErro(e); rpReRender(); });
}
function rpReal(p, calc){
  const k=rpRealChave(p); const t=k&&estado.rentab.tempo[k]; if(!t) return null;
  const porMes={}; calc.meses.forEach(m=>{ porMes[m]={h:0,custo:0,porPessoa:{}}; });
  let h=0,custo=0; const pessoas={}; const tickets=new Set();
  (t.worklogs||[]).forEach(w=>{ if(w.p!==p.projeto) return; const m=(w.d||'').slice(0,7); if(!porMes[m]) return; const hh=(Number(w.s)||0)/3600; const cu=hh*rpCustoH(w.a);
    porMes[m].h+=hh; porMes[m].custo+=cu; porMes[m].porPessoa[w.a]=(porMes[m].porPessoa[w.a]||0)+hh; h+=hh; custo+=cu;
    const P=pessoas[w.a]=pessoas[w.a]||{a:w.a,nome:(t.pessoas&&t.pessoas[w.a]&&t.pessoas[w.a].nome)||rpNome(w.a),h:0,custo:0}; P.h+=hh; P.custo+=cu; if(w.k) tickets.add(w.k); });
  // fração do prazo já decorrida (dias corridos desde o início até hoje ÷ dias do projeto)
  const hoje=hojeSP(); const ate=k.split('|')[2]; const d0=Date.parse(p.inicio+'T12:00:00Z'), d1=Date.parse(rpFim(p)+'T12:00:00Z'), dh=Date.parse(ate+'T12:00:00Z');
  const fracao=d1>d0?Math.min(1,Math.max(0,(dh-d0+86400000)/(d1-d0+86400000))):1;
  const vendAteHoje=calc.vend*fracao; const prevAteHoje=calc.meses.filter(m=>m<=hoje.slice(0,7)).reduce((s,m)=>s+calc.porMes[m].exec+calc.porMes[m].gestao,0);
  return { porMes, h, custo, pessoas:Object.values(pessoas).sort((a,b)=>b.h-a.h), tickets:tickets.size, fracao, vendAteHoje, prevAteHoje,
    eficReal:vendAteHoje>0?h/vendAteHoje:null, projCusto:fracao>=0.1?custo/fracao:null, ate };
}
function rpReRender(){ if(estado.vista==='rentab') renderRentab(); }
function rpSalva(p){ if(p) p.atualizadoEm=hojeSP(); salvaCfg(); }
const rpSem=(cls,rot)=>`<span class="ct-sem ${cls}">${esc(rot)}</span>`;
function rpSemMargem(mgp, meta){ if(mgp==null) return rpSem('na','sem receita'); return mgp>=meta?rpSem('ok',`≥ meta (${meta}%)`):(mgp>=meta/2?rpSem('aten','abaixo da meta'):rpSem('crit','no vermelho')); }
const rpKpi=(v,l,cls,s)=>`<div class="vg-k ${cls||''}"><div class="v">${v}</div><div class="l">${esc(l)}</div>${s?`<div class="s">${s}</div>`:''}</div>`;

// ---- tela ----
function renderRentab(){
  const cont=document.getElementById('conteudo'); const r=estado.rentab; const gestor=souAprovador();
  if(!_projetosCache) garanteProjetos().then(rpReRender).catch(()=>{});
  const planos=rpPlanos();
  if(r.sel&&!rpPlano(r.sel)) r.sel='';
  const intro=`<div class="card full"><h2>💹 Rentabilidade de projetos <span>cadastre o projeto, planeje quem faz o quê mês a mês e simule cenários</span></h2>
    <div class="muted small">Cada plano guarda a <b>duração</b>, a <b>carga de trabalho vendida</b> e o <b>valor-hora</b> (→ receita). Em cada <b>cenário</b> você distribui as horas entre as pessoas (execução e gestão) e vê na hora o <b>esforço previsto</b>, a <b>eficiência</b> (quanto das horas vendidas você realmente gasta), o <b>custo</b> (sempre horas × custo/h de cada pessoa), a <b>margem</b> e a <b>folga</b> para alocar alguém mais barato. Com um projeto do Jira vinculado, o <b>realizado</b> entra na comparação. ${gestor?'':'<b>Somente gestores editam</b>; você está vendo em modo leitura.'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${gestor?'<button class="btn primario" data-rp-novo="1">＋ Novo plano</button>':''}
      ${r.sel?'<button class="btn" data-rp-voltar="1">‹ Todos os planos</button>':''}</div></div>`;
  if(r.novo&&gestor){ cont.replaceChildren(el(`<div>${intro}${rpFormHTML(r.rasc||rpNovoPlano(),true)}</div>`)); return; }
  if(!r.sel){
    const cards=planos.map(p=>{ const c=rpCalc(p,rpCenario(p)); const [stc,str]=rpStatus(p);
      return `<div class="ad-card rp-card" data-rp-abrir="${escA(p.id)}" role="button" tabindex="0">
        <div class="ad-top"><strong>${esc(p.nome||'(sem nome)')}</strong> <span class="badge rp-st-${stc}">${str}</span><span class="spacer"></span><span class="muted small">${esc(p.cliente||'')}</span></div>
        <div class="muted small">${p.projeto?`${esc(projNome(p.projeto))} (${esc(p.projeto)}) · `:''}${dataBR(p.inicio)} → ${dataBR(rpFim(p))} · ${c.meses.length} mês(es) · ${rpH(c.vend)} vendidas · ${fmtBRL(c.vh)}/h</div>
        <div class="ams-dgrid rp-mini">
          <div class="ams-dl"><div class="dt">Receita</div><div class="dd">${fmtBRL(c.receita)}</div></div>
          <div class="ams-dl"><div class="dt">Esforço previsto</div><div class="dd">${rpH(c.esforco)} <span class="muted small">${c.efic==null?'':Math.round(c.efic*100)+'%'}</span></div></div>
          <div class="ams-dl"><div class="dt">Custo</div><div class="dd">${fmtBRL(c.custo)}</div></div>
          <div class="ams-dl"><div class="dt">Margem</div><div class="dd">${c.mgp==null?'—':c.mgp+'%'} ${rpSemMargem(c.mgp,c.meta)}</div></div></div>
        <div class="muted small" style="margin-top:6px">${(p.cenarios||[]).length} cenário(s) · ${(rpCenario(p).aloc||[]).length} pessoa(s) alocada(s)</div></div>`; }).join('');
    cont.replaceChildren(el(`<div>${intro}<div class="card full"><h2>Planos <span>${planos.length} plano(s)</span></h2>
      ${planos.length?`<div class="ad-grid">${cards}</div>`:`<div class="estado">Nenhum plano ainda. ${gestor?'Clique em <b>＋ Novo plano</b> para cadastrar o primeiro projeto (duração, carga vendida e valor-hora) e começar a simular.':'Peça a um gestor para cadastrar o primeiro plano.'}</div>`}</div></div>`));
    return;
  }
  const p=rpPlano(r.sel); const c0=rpCenario(p); const c=rpCalc(p,c0);
  rpGaranteReal(p); const real=rpReal(p,c); const chaveReal=rpRealChave(p);
  const [stc,str]=rpStatus(p);
  const cab=`<div class="card full"><h2>💹 ${esc(p.nome||'(sem nome)')} <span class="badge rp-st-${stc}">${str}</span> <span>${esc(p.cliente||'')}${p.projeto?` · ${esc(projNome(p.projeto))} (${esc(p.projeto)})`:''} · ${dataBR(p.inicio)} → ${dataBR(rpFim(p))} · ${c.meses.length} mês(es)</span></h2>
    <div class="rp-dados">
      <div class="ams-dl"><div class="dt">Carga vendida</div><div class="dd">${rpH(c.vend)} <span class="muted small">${p.modoCarga==='total'?'no total':`(${rpH(Number(p.cargaMes)||0)}/mês)`}</span></div></div>
      <div class="ams-dl"><div class="dt">Valor-hora</div><div class="dd">${fmtBRL(c.vh)}</div></div>
      <div class="ams-dl"><div class="dt">Receita</div><div class="dd">${fmtBRL(c.receita)}</div></div>
      <div class="ams-dl"><div class="dt">Margem-meta</div><div class="dd">${c.meta}%</div></div>
      ${p.obs?`<div class="ams-dl" style="grid-column:span 2"><div class="dt">Obs.</div><div class="dd small">${esc(p.obs)}</div></div>`:''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center"><button class="btn" data-rp-voltar="1">‹ Todos os planos</button>${gestor?`<button class="btn" data-rp-editar="1">✏️ Dados do projeto</button><button class="btn" data-rp-dup="1">📋 Duplicar plano</button><button class="btn" data-rp-del="1">🗑 Excluir</button>`:'<span class="muted small">🔒 Somente gestores editam — você está em modo leitura.</span>'}</div>
    ${r.edit&&gestor?rpFormHTML(r.rasc||p,false):''}</div>`;
  // cenários
  const chips=`<div class="ap-chips rp-cen">${(p.cenarios||[]).map(x=>`<button class="chip ${x.id===c0.id?'on':''}" data-rp-cen="${escA(x.id)}">${esc(x.nome||'Cenário')}</button>`).join('')}
    ${gestor?`<button class="btn rt-step" data-rp-cen-novo="1" data-tip="Cria um cenário vazio">＋ cenário</button><button class="btn rt-step" data-rp-cen-dup="1" data-tip="Copia o cenário atual para simular uma variação">📋 duplicar</button><button class="btn rt-step" data-rp-cen-ren="1">✏️ renomear</button>${(p.cenarios||[]).length>1?'<button class="btn rt-step" data-rp-cen-del="1">🗑</button>':''}`:''}</div>`;
  const hero=`<div class="vg-hero">
    ${rpKpi(fmtBRL(c.receita),'Receita','',`${rpH(c.vend)} × ${fmtBRL(c.vh)}`)}
    ${rpKpi(rpH(c.esforco),'Esforço previsto',c.efic==null?'':(c.efic<=0.8?'good':(c.efic<=1?'warn':'bad')),c.efic==null?'sem carga vendida':`${Math.round(c.efic*100)}% das horas vendidas · ${c.econ>=0?'economiza':'estoura'} ${rpH(Math.abs(c.econ))}`)}
    ${rpKpi(fmtBRL(c.custo),'Custo previsto',c.semCusto?'bad':'',c.semCusto?`⚠ ${c.semCusto} pessoa(s) sem custo/h`:`execução ${fmtBRL(c.custoExec)} · gestão ${fmtBRL(c.custoGestao)}`)}
    ${rpKpi(fmtBRL(c.margem),'Margem prevista',c.mgp==null?'':(c.mgp>=c.meta?'good':(c.mgp>=c.meta/2?'warn':'bad')),c.mgp==null?'—':`${c.mgp}% · meta ${c.meta}%`)}
    ${rpKpi(c.recH==null?'—':fmtBRL(c.recH),'Receita por hora trabalhada','',c.custoMedio==null?'—':`custo médio ${fmtBRL(c.custoMedio)}/h`)}
    ${rpKpi(c.folgaH==null?'—':rpH(c.folgaH),'Folga até a meta',c.folgaR>=0?'good':'bad',c.maisBarato?(c.folgaR>=0?`cabem mais horas de ${esc(c.maisBarato.nome.split(' ')[0])} (${fmtBRL(c.maisBarato.ch)}/h)`:`faltam ${fmtBRL(-c.folgaR)} para a meta`):'aloque alguém com custo/h')}</div>`;
  // simulador rápido
  const sim=gestor?`<div class="rp-sim">
    <div class="campo"><label>Esforço total previsto (h)</label><input type="number" id="rp-sim-esf" min="0" step="1" value="${Math.round(c.esforco)}" data-tip="Redistribui proporcionalmente as horas de EXECUÇÃO para fechar neste total"></div>
    <div class="campo"><label>Eficiência (% das vendidas)</label><input type="number" id="rp-sim-efic" min="1" max="300" step="1" value="${c.efic==null?'':Math.round(c.efic*100)}" data-tip="Ex.: 60 = fazer o projeto com 60% das horas vendidas"></div>
    <div class="campo"><label>Valor-hora (R$)</label><input type="number" id="rp-sim-vh" min="0" step="0.01" value="${c.vh}"></div>
    <div class="campo"><label>Margem-meta (%)</label><input type="number" id="rp-sim-meta" min="0" max="100" step="1" value="${c.meta}"></div>
    <div class="campo"><label>&nbsp;</label><span class="muted small">Mude um valor e a grade, os KPIs e os gráficos se recalculam. Nada é perdido: cada cenário fica salvo.</span></div></div>`:'';
  // grade pessoa × mês
  const pessoas=rpPessoas(); const alocIds=new Set((c0.aloc||[]).map(x=>x.a));
  const cols=c.meses.map(m=>`<th class="num">${esc(labelMesAbbr(m))}</th>`).join('');
  const linhas=(c0.aloc||[]).map((al,i)=>{ const P=c.porPessoa[i]; const cor=RP_CORES[i%RP_CORES.length];
    return `<tr><td><i class="rp-sw" style="background:${cor}"></i><b>${esc(P.nome)}</b>${P.ch>0?'':' <span class="ct-sem crit" data-tip="Sem custo/h cadastrado: o custo desta pessoa está em R$ 0. Cadastre na 🏦 Controladoria (⚙️) ou na vaga planejada.">sem custo/h</span>'}</td>
      <td>${gestor?`<select data-rp-papel="${i}">${RP_PAPEIS.map(([v,l])=>`<option value="${v}" ${P.papel===v?'selected':''}>${l}</option>`).join('')}</select>`:esc(RP_PAPEIS.find(x=>x[0]===P.papel)[1])}</td>
      <td class="num">${fmtBRL(P.ch)}</td>
      <td class="num">${gestor?`<input type="number" class="rp-tot" data-rp-tot="${i}" min="0" step="1" value="${Math.round(P.h*10)/10}" data-tip="Total da pessoa: distribui igualmente pelos meses">`:rpH(P.h)}</td>
      <td class="num">${fmtBRL(P.custo)}</td>
      ${c.meses.map(m=>`<td class="num"><input type="number" class="rp-cel" data-rp-cel="${i}|${m}" min="0" step="1" value="${(al.h||{})[m]!=null&&(al.h||{})[m]!==''?Math.round(Number((al.h||{})[m])*10)/10:''}" ${gestor?'':'disabled'}></td>`).join('')}
      <td>${gestor?`<button class="btn rt-step" data-rp-rm="${i}" data-tip="Tirar esta pessoa do cenário">✕</button>`:''}</td></tr>`; }).join('');
  const foot=(rot,fn,cls)=>`<tr class="${cls||''}"><td colspan="3"><b>${rot}</b></td><td class="num"><b>${fn('tot')}</b></td><td class="num">${fn('custo')}</td>${c.meses.map(m=>`<td class="num">${fn(m)}</td>`).join('')}<td></td></tr>`;
  const grade=`<div class="scroll-x"><table class="mp-tab-mini rp-grade"><thead><tr><th>Pessoa</th><th>Papel</th><th class="num">Custo/h</th><th class="num">Total</th><th class="num">Custo</th>${cols}<th></th></tr></thead>
    <tbody>${linhas||`<tr><td colspan="${6+c.meses.length}" class="mp-dim">Ninguém alocado neste cenário ainda${gestor?' — adicione uma pessoa abaixo':''}.</td></tr>`}</tbody>
    <tfoot>
      ${foot('Esforço previsto',(k)=>k==='tot'?rpH(c.esforco):(k==='custo'?fmtBRL(c.custo):rpH(c.porMes[k].exec+c.porMes[k].gestao)),'rp-f-prev')}
      ${foot('Horas vendidas',(k)=>k==='tot'?rpH(c.vend):(k==='custo'?`<span class="muted small">receita ${fmtBRL(c.receita)}</span>`:rpH(c.vendMes)),'rp-f-vend')}
      ${foot('Saldo (vendidas − previsto)',(k)=>{ const v=k==='tot'?c.econ:(k==='custo'?null:c.vendMes-c.porMes[k].exec-c.porMes[k].gestao); return v==null?'':`<span class="${v<0?'rp-neg':'rp-pos'}">${v<0?'−':'+'}${rpH(Math.abs(v))}</span>`; },'rp-f-saldo')}
      ${real?foot('Realizado (Clockwork)',(k)=>k==='tot'?rpH(real.h):(k==='custo'?fmtBRL(real.custo):(real.porMes[k].h?rpH(real.porMes[k].h):'—')),'rp-f-real'):''}
    </tfoot></table></div>
    ${gestor?`<div class="pl-grid" style="margin-top:8px"><div class="campo"><label>Adicionar pessoa</label><select id="rp-add-pessoa"><option value="">— escolha —</option>${pessoas.map(x=>`<option value="${escA(x.a)}">${esc(x.nome)}${alocIds.has(x.a)?' (já no cenário)':''} · ${fmtBRL(rpCustoH(x.a))}/h</option>`).join('')}</select></div>
      <div class="campo"><label>Papel</label><select id="rp-add-papel">${RP_PAPEIS.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div>
      <div class="campo"><label>Horas no total</label><input type="number" id="rp-add-h" min="0" step="1" placeholder="ex.: 100" style="width:110px"></div>
      <div class="campo"><label>&nbsp;</label><button class="btn primario" id="rp-add">＋ Adicionar ao cenário</button></div>
      <div class="campo"><label>&nbsp;</label><span class="muted small">Vagas 🔮 (pessoas ainda não contratadas) vêm de Pessoas planejadas, com o custo previsto.</span></div></div>`:''}`;
  // gráficos
  const serie=[{nome:'Horas vendidas',cor:cores.grafite,vals:c.meses.map(m=>({x:m,v:Math.round(c.vendMes*10)/10})),tipo:'line',dash:1},
    {nome:'Esforço previsto',cor:cores.cerceta,vals:c.meses.map(m=>({x:m,v:Math.round((c.porMes[m].exec+c.porMes[m].gestao)*10)/10})),tipo:'area'}];
  if(real) serie.push({nome:'Realizado',cor:cores.amarelo,vals:c.meses.map(m=>({x:m,v:Math.round(real.porMes[m].h*10)/10})),tipo:'line'});
  const maxMes=Math.max(1,c.vendMes,...c.meses.map(m=>c.porMes[m].exec+c.porMes[m].gestao));
  const stack=`<div class="rp-stack">${c.meses.map(m=>{ const M=c.porMes[m]; const tot=M.exec+M.gestao;
    const segs=(c0.aloc||[]).map((al,i)=>{ const h=M.porPessoa[i]||0; if(!h) return ''; return `<i style="height:${(h/maxMes*100).toFixed(1)}%;background:${RP_CORES[i%RP_CORES.length]}" data-tip="${escA(`${c.porPessoa[i].nome} · ${labelMesAbbr(m)} · ${rpH(h)} · ${fmtBRL(h*c.porPessoa[i].ch)}`)}"></i>`; }).join('');
    return `<div class="rp-col"><div class="rp-colb"><em class="rp-mark" style="bottom:${(Math.min(c.vendMes,maxMes)/maxMes*100).toFixed(1)}%" data-tip="${escA(`vendidas: ${rpH(c.vendMes)}/mês`)}"></em>${segs}</div><div class="rp-rot"><b>${esc(labelMesAbbr(m))}</b>${rpH(tot)}</div></div>`; }).join('')}</div>
    <div class="pp-legend" style="margin-top:6px">${c.porPessoa.map(P=>`<span><i style="background:${RP_CORES[P.i%RP_CORES.length]}"></i>${esc(P.nome)} (${P.papel==='gestao'?'gestão':'execução'})</span>`).join('')}<span><i style="background:transparent;border-top:2px dashed var(--grafite)"></i>vendidas/mês</span></div>`;
  const wfMax=Math.max(1,c.receita); const wf=(rot,v,cor,extra)=>`<div class="rp-wf"><div class="rp-wf-l">${rot}</div><div class="rp-wf-t"><i style="width:${(Math.abs(v)/wfMax*100).toFixed(1)}%;background:${cor}"></i></div><div class="rp-wf-v ${v<0?'rp-neg':''}">${fmtBRL(v)}${extra?` <span class="muted small">${extra}</span>`:''}</div></div>`;
  const cascata=`${wf('Receita',c.receita,cores.grafite)}${wf('− Custo de execução',-c.custoExec,cores.cerceta,`${rpH(c.exec)}`)}${wf('− Custo de gestão',-c.custoGestao,cores.roxo,`${rpH(c.gestao)}`)}${wf('= Margem',c.margem,c.margem>=0?cores.musgo:'var(--err)',c.mgp==null?'':`${c.mgp}%`)}`;
  // realizado
  let realHtml='';
  if(p.projeto){
    if(!chaveReal) realHtml='<div class="muted small">O projeto ainda não começou — o realizado aparece a partir da data de início.</div>';
    else if(estado.rentab.tempoErro[chaveReal]) realHtml=`<div class="aviso">⚠ ${esc(estado.rentab.tempoErro[chaveReal])} <button class="btn" data-rp-real-retry="${escA(chaveReal)}">Tentar de novo</button></div>`;
    else if(!real) realHtml='<div class="muted small">⏳ Lendo as horas apontadas no projeto…</div>';
    else { const ef=real.eficReal; const custoFinal=real.projCusto;
      realHtml=`<div class="vg-hero rm-hero4">
        ${rpKpi(rpH(real.h),'Realizado até '+dataBR(real.ate),'',`${real.tickets} ticket(s) · ${fmtBRL(real.custo)} de custo`)}
        ${rpKpi(ef==null?'—':Math.round(ef*100)+'%','Eficiência real',ef==null?'':(ef<=0.8?'good':(ef<=1?'warn':'bad')),`realizado ÷ vendidas pro rata (${rpH(real.vendAteHoje)})`)}
        ${rpKpi(rpH(real.prevAteHoje),'Previsto até aqui (cenário)',real.h<=real.prevAteHoje?'good':'warn',real.h<=real.prevAteHoje?`${rpH(real.prevAteHoje-real.h)} abaixo do plano`:`${rpH(real.h-real.prevAteHoje)} acima do plano`)}
        ${rpKpi(custoFinal==null?'—':fmtBRL(custoFinal),'Custo final no ritmo atual',custoFinal==null?'':(c.receita-custoFinal>=c.receita*c.meta/100?'good':'warn'),custoFinal==null?'ainda cedo para projetar':`margem projetada ${rpPct(c.receita-custoFinal,c.receita)==null?'—':rpPct(c.receita-custoFinal,c.receita)+'%'}`)}</div>
        ${real.pessoas.length?`<div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Quem trabalhou</th><th class="num">Horas</th><th class="num">Custo</th><th class="num">% das horas</th></tr></thead><tbody>${real.pessoas.map(x=>`<tr><td>${esc(x.nome)}</td><td class="num">${rpH(x.h)}</td><td class="num">${fmtBRL(x.custo)}</td><td class="num">${rpPct(x.h,real.h)}%</td></tr>`).join('')}</tbody></table></div>`:''}`; }
  } else realHtml=`<div class="muted small">Vincule um <b>projeto do Jira</b> em ✏️ Dados do projeto para comparar o previsto com o realizado (Clockwork) e medir a eficiência real.</div>`;
  // comparação de cenários
  let comp='';
  if((p.cenarios||[]).length>1){
    const rows=(p.cenarios||[]).map(x=>{ const k=rpCalc(p,x); return `<tr class="${x.id===c0.id?'rm-destaque':''}"><td><b>${esc(x.nome)}</b>${x.id===c0.id?' <span class="muted small">(ativo)</span>':''}</td><td class="num">${rpH(k.esforco)}</td><td class="num">${k.efic==null?'—':Math.round(k.efic*100)+'%'}</td><td class="num">${fmtBRL(k.custo)}</td><td class="num">${fmtBRL(k.margem)}</td><td class="num">${k.mgp==null?'—':k.mgp+'%'} ${rpSemMargem(k.mgp,k.meta)}</td><td class="num">${k.recH==null?'—':fmtBRL(k.recH)}</td><td class="num">${k.folgaH==null?'—':rpH(k.folgaH)}</td></tr>`; }).join('');
    comp=`<section class="rm-bloco"><h3 class="mp-h3">🧪 Comparação de cenários</h3><div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Cenário</th><th class="num">Esforço</th><th class="num">Eficiência</th><th class="num">Custo</th><th class="num">Margem</th><th class="num">Margem %</th><th class="num">Receita/h</th><th class="num">Folga</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  const avisos=[];
  if(!c.vend) avisos.push('⚠ Informe a <b>carga de trabalho vendida</b> (h/mês ou total) em ✏️ Dados do projeto — sem ela não há receita nem eficiência.');
  if(c.vend&&!c.vh) avisos.push('⚠ Informe o <b>valor-hora</b> — sem ele a receita e a margem ficam em zero.');
  if(c.semCusto) avisos.push(`⚠ <b>${c.semCusto} pessoa(s) sem custo/h</b> neste cenário — o custo fica menor do que é. Cadastre o custo/h na 🏦 Controladoria (⚙️) ou o custo previsto da vaga em Pessoas planejadas.`);
  cont.replaceChildren(el(`<div>${cab}
    <div class="card full">
      <h3 class="mp-h3">🧪 Cenários</h3>${chips}
      ${avisos.map(a=>`<div class="aviso">${a}</div>`).join('')}
      ${hero}${sim}
      <section class="rm-bloco"><h3 class="mp-h3">🗓 Planner visual — quem faz o quê, mês a mês <span class="mp-dim">horas por pessoa e por mês; execução e gestão</span></h3>
        ${grade}
        ${ctExpl('cada célula é <b>quantas horas</b> a pessoa vai dedicar naquele mês; o <b>Total</b> redistribui igualmente pelos meses. <b>Execução</b> é o trabalho entregue; <b>Gestão</b> é o acompanhamento (o seu tempo de gestão também custa). O rodapé compara o esforço previsto com as horas vendidas: <b>saldo positivo</b> é o que você economiza — e pode virar horas de um consultor mais barato.')}</section>
      <section class="rm-bloco"><h3 class="mp-h3">📊 Visão mensal e composição do custo</h3>
        <div class="rm-2col"><div><div class="mp-h3">Vendidas × previsto${real?' × realizado':''}</div>${tsChart(serie,{fmt:v=>rpH(v),xlabel:x=>labelMesAbbr(x),h:190})}</div>
          <div><div class="mp-h3">Alocação por mês (por pessoa)</div>${stack}</div></div>
        <div class="mp-h3" style="margin-top:12px">Da receita à margem</div>${cascata}
        ${ctExpl('<b>Receita</b> = horas vendidas × valor-hora. O custo é sempre <b>horas × custo/h de cada pessoa</b> (o valor que o funcionário custa por hora). <b>Eficiência</b> = esforço previsto ÷ horas vendidas: 60% quer dizer fazer o projeto com 60% das horas que o cliente paga; o que sobra é margem ou horas para alocar alguém mais barato. <b>Folga até a meta</b> = quantas horas da pessoa mais barata do cenário ainda cabem sem a margem cair abaixo da meta.')}</section>
      <section class="rm-bloco"><h3 class="mp-h3">⏱ Realizado (Clockwork) × previsto</h3>${realHtml}
        ${real?ctExpl('<b>Eficiência real</b> = horas realizadas ÷ horas vendidas proporcionais ao tempo decorrido — abaixo de 100% você está entregando mais rápido do que o cliente paga (é a métrica de "sempre realizo mais rápido"). O <b>custo final no ritmo atual</b> projeta o custo total se o ritmo de agora se mantiver.'):''}</section>
      ${comp}
    </div></div>`));
  if(r.focoCel){ const e=cont.querySelector(`[data-rp-cel="${r.focoCel}"]`); if(e){ e.focus(); try{ e.select(); }catch(x){} } r.focoCel=''; }
}
function rpFormHTML(p, novo){
  const projs=(_projetosCache||[]).slice().sort((a,b)=>(a.nome||a.key).localeCompare(b.nome||b.key,'pt'));
  return `<div class="rp-form">
    <h3 class="mp-h3">${novo?'＋ Novo plano de rentabilidade':'✏️ Dados do projeto'}</h3>
    <div class="pl-grid">
      <div class="campo"><label>Nome do plano/projeto</label><input type="text" id="rp-f-nome" value="${escA(p.nome||'')}" placeholder="ex.: Implantação FI — ACME" style="min-width:240px"></div>
      <div class="campo"><label>Cliente</label><input type="text" id="rp-f-cliente" value="${escA(p.cliente||'')}" placeholder="nome do cliente"></div>
      <div class="campo"><label>Projeto do Jira (opcional)</label><select id="rp-f-projeto"><option value="">— nenhum —</option>${projs.map(x=>`<option value="${escA(x.key)}" ${p.projeto===x.key?'selected':''}>${esc(x.nome||x.key)} (${esc(x.key)})</option>`).join('')}</select></div>
      <div class="campo"><label>Início</label><input type="date" id="rp-f-inicio" value="${escA(p.inicio||'')}"></div>
      <div class="campo"><label>Duração (meses)</label><input type="number" id="rp-f-meses" min="1" max="${RP_MAX_MESES}" step="1" value="${escA(String(p.meses||3))}" style="width:90px"></div>
      <div class="campo"><label>Carga vendida</label><div style="display:flex;gap:6px"><select id="rp-f-modo"><option value="mes" ${p.modoCarga!=='total'?'selected':''}>horas por mês</option><option value="total" ${p.modoCarga==='total'?'selected':''}>horas no total</option></select>
        <input type="number" id="rp-f-carga" min="0" step="1" value="${escA(String(p.modoCarga==='total'?(p.cargaTotal||''):(p.cargaMes||'')))}" placeholder="ex.: 160" style="width:100px"></div></div>
      <div class="campo"><label>Valor-hora (R$)</label><input type="number" id="rp-f-vh" min="0" step="0.01" value="${escA(String(p.valorHora||''))}" placeholder="ex.: 220" style="width:110px"></div>
      <div class="campo"><label>Margem-meta (%)</label><input type="number" id="rp-f-meta" min="0" max="100" step="1" value="${escA(String(p.margemMeta!=null?p.margemMeta:30))}" style="width:80px"></div>
    </div>
    <div class="campo"><label>Observações</label><input type="text" id="rp-f-obs" value="${escA(p.obs||'')}" placeholder="opcional"></div>
    <div class="muted small" id="rp-f-dica" style="margin-top:6px">Ao escolher um projeto do Jira com <b>contrato</b> cadastrado (Admin), o valor-hora e as horas contratadas são sugeridos.</div>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap"><button class="btn primario" id="rp-f-salvar">${novo?'Criar plano':'Salvar dados'}</button><button class="btn" id="rp-f-cancelar">Cancelar</button></div>
    <div class="ap-fb" id="rp-f-fb" hidden></div></div>`;
}
function rpLeForm(p){
  const v=(id)=>{ const e=document.getElementById(id); return e?String(e.value).trim():''; };
  p.nome=v('rp-f-nome'); p.cliente=v('rp-f-cliente'); p.projeto=v('rp-f-projeto'); p.inicio=v('rp-f-inicio')||p.inicio;
  p.meses=Math.max(1,Math.min(RP_MAX_MESES,Math.round(Number(v('rp-f-meses'))||1))); p.modoCarga=v('rp-f-modo')==='total'?'total':'mes';
  const carga=Math.max(0,Number(v('rp-f-carga'))||0); if(p.modoCarga==='total'){ p.cargaTotal=carga; } else { p.cargaMes=carga; }
  p.valorHora=Math.max(0,Number(v('rp-f-vh'))||0); p.margemMeta=Math.max(0,Math.min(100,Number(v('rp-f-meta'))||0)); p.obs=v('rp-f-obs');
  if(!p.nome) return 'Dê um nome ao plano.'; if(!/^\d{4}-\d{2}-\d{2}$/.test(p.inicio||'')) return 'Informe a data de início.';
  return '';
}
// Redistribui as horas de EXECUÇÃO do cenário para fechar em `alvo` horas (proporcional; sem alocação, nada a fazer).
function rpEscalaExec(p, c, alvo){
  const calc=rpCalc(p,c); if(calc.exec<=0) return false; const f=Math.max(0,alvo)/calc.exec; let ult=null;
  (c.aloc||[]).forEach(al=>{ if(al.papel==='gestao') return; Object.keys(al.h||{}).forEach(m=>{ al.h[m]=Math.round((Number(al.h[m])||0)*f*10)/10; if(al.h[m]>0) ult=[al,m]; }); });
  if(ult){ const novo=rpCalc(p,c).exec; const resto=Math.round((Math.max(0,alvo)-novo)*10)/10; if(resto) ult[0].h[ult[1]]=Math.max(0,Math.round((ult[0].h[ult[1]]+resto)*10)/10); }   // resíduo do arredondamento na última célula
  return true;
}
function rpDistribui(al, meses, total){ const n=meses.length||1; const cada=Math.round(Math.max(0,total)/n*10)/10; al.h={}; meses.forEach(m=>{ al.h[m]=cada; }); }

// ---- listeners delegados desta tela ----
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='rentab') return; const r=estado.rentab; const t=e.target; if(!t) return;
  const p=r.sel?rpPlano(r.sel):null; const gestor=souAprovador();
  if(t.id==='rp-f-projeto'){   // sugestão a partir do contrato do projeto
    const c=(cfg.contratos||[]).find(x=>x&&(x.projetos||[]).includes(t.value)); if(!c) return;
    const vh=document.getElementById('rp-f-vh'), cg=document.getElementById('rp-f-carga'), md=document.getElementById('rp-f-modo'), dica=document.getElementById('rp-f-dica');
    if(vh&&!Number(vh.value)&&Number(c.valorHora)>0) vh.value=c.valorHora;
    if(cg&&!Number(cg.value)&&Number(c.horasContratadas)>0){ cg.value=c.horasContratadas; if(md&&c.tipo!=='ams') md.value='total'; }
    if(dica) dica.innerHTML=`💡 Contrato <b>${esc(c.cliente||'')}</b> encontrado: ${Number(c.valorHora)>0?`valor-hora ${fmtBRL(c.valorHora)}`:'sem valor-hora'}${Number(c.horasContratadas)>0?` · ${c.horasContratadas}h contratadas`:''}.`;
    const cl=document.getElementById('rp-f-cliente'); if(cl&&!cl.value&&c.cliente) cl.value=c.cliente; return; }
  if(!p||!gestor) return;
  const c0=rpCenario(p); const meses=rpMeses(p);
  if(t.hasAttribute('data-rp-cel')){ const [i,m]=t.getAttribute('data-rp-cel').split('|'); const al=(c0.aloc||[])[+i]; if(!al) return;
    al.h=al.h||{}; const v=Number(t.value); if(t.value===''||isNaN(v)) delete al.h[m]; else al.h[m]=Math.max(0,Math.round(v*10)/10);
    if(!r.focoCel) r.focoCel=t.getAttribute('data-rp-cel');   // sem navegação por tecla: o foco volta à mesma célula
    rpSalva(p); renderRentab(); return; }
  if(t.hasAttribute('data-rp-tot')){ const al=(c0.aloc||[])[+t.getAttribute('data-rp-tot')]; if(!al) return; rpDistribui(al,meses,Number(t.value)||0); rpSalva(p); renderRentab(); return; }
  if(t.hasAttribute('data-rp-papel')){ const al=(c0.aloc||[])[+t.getAttribute('data-rp-papel')]; if(!al) return; al.papel=t.value==='gestao'?'gestao':'exec'; rpSalva(p); renderRentab(); return; }
  if(t.id==='rp-sim-esf'){ const alvo=Math.max(0,(Number(t.value)||0)-rpCalc(p,c0).gestao);   // total inclui a gestão; só a execução é reescalada
    if(rpEscalaExec(p,c0,alvo)){ rpSalva(p); renderRentab(); } else toast('Aloque alguém em execução antes de simular o esforço.','warn'); return; }
  if(t.id==='rp-sim-efic'){ const vend=rpVendidas(p); const alvo=vend*(Math.max(1,Number(t.value)||0)/100)-rpCalc(p,c0).gestao; if(rpEscalaExec(p,c0,Math.max(0,alvo))){ rpSalva(p); renderRentab(); } else toast('Aloque alguém em execução antes de simular a eficiência.','warn'); return; }
  if(t.id==='rp-sim-vh'){ p.valorHora=Math.max(0,Number(t.value)||0); rpSalva(p); renderRentab(); return; }
  if(t.id==='rp-sim-meta'){ p.margemMeta=Math.max(0,Math.min(100,Number(t.value)||0)); rpSalva(p); renderRentab(); return; }
});
// Enter numa célula pula para a próxima; setas navegam a grade.
document.getElementById('conteudo').addEventListener('keydown',(e)=>{
  if(estado.vista!=='rentab') return; const t=e.target; if(!t||!t.hasAttribute||!t.hasAttribute('data-rp-cel')) return;
  if(!['Enter','Tab','ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(e.key)) return;
  const cels=[...document.querySelectorAll('[data-rp-cel]')]; const idx=cels.indexOf(t); if(idx<0) return;
  const porLinha=(document.querySelectorAll('.rp-grade thead th').length-6);
  const frente=e.key==='Enter'||e.key==='ArrowRight'||(e.key==='Tab'&&!e.shiftKey);
  const alvo=frente?idx+1:(e.key==='ArrowLeft'||e.key==='Tab')?idx-1:e.key==='ArrowDown'?idx+porLinha:idx-porLinha;
  if(!cels[alvo]) return;
  e.preventDefault(); estado.rentab.focoCel=cels[alvo].getAttribute('data-rp-cel');
  t.blur();   // dispara o change (que salva e redesenha, devolvendo o foco à célula-alvo)
  const e2=document.querySelector(`[data-rp-cel="${estado.rentab.focoCel}"]`); if(e2){ e2.focus(); try{ e2.select(); }catch(x){} }
});
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='rentab') return; const r=estado.rentab; const gestor=souAprovador();
  const card=e.target.closest&&e.target.closest('[data-rp-abrir]'); if(card){ r.sel=card.getAttribute('data-rp-abrir'); r.edit=false; renderRentab(); estadoParaURL(); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-rp-voltar')){ r.sel=''; r.edit=false; r.novo=false; renderRentab(); estadoParaURL(); return; }
  if(t.hasAttribute('data-rp-cen')){ const p=rpPlano(r.sel); if(!p) return; p.cenario=t.getAttribute('data-rp-cen'); if(gestor) rpSalva(p); renderRentab(); return; }
  if(!gestor) return;
  if(t.hasAttribute('data-rp-novo')){ r.novo=true; r.rasc=rpNovoPlano(); renderRentab(); return; }
  if(t.id==='rp-f-cancelar'){ r.novo=false; r.edit=false; r.rasc=null; renderRentab(); return; }
  if(t.id==='rp-f-salvar'){ const fb=document.getElementById('rp-f-fb');
    if(r.novo){ const p=r.rasc||rpNovoPlano(); const erro=rpLeForm(p); if(erro){ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=erro; } return; }
      rpPlanos().push(p); r.novo=false; r.rasc=null; r.sel=p.id; rpSalva(p); toast('Plano criado. Agora aloque as pessoas no cenário Base.','ok'); renderRentab(); estadoParaURL(); return; }
    const p=rpPlano(r.sel); if(!p) return; const erro=rpLeForm(p); if(erro){ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=erro; } return; }
    r.edit=false; rpSalva(p); renderRentab(); return; }
  const p=rpPlano(r.sel); if(!p) return; const c0=rpCenario(p); const meses=rpMeses(p);
  if(t.hasAttribute('data-rp-editar')){ r.edit=!r.edit; renderRentab(); return; }
  if(t.hasAttribute('data-rp-dup')){ const n=JSON.parse(JSON.stringify(p)); n.id=rpId('rp'); n.nome=(p.nome||'Plano')+' (cópia)'; n.criadoEm=hojeSP(); n.cenarios.forEach(x=>{ x.id=rpId('cn'); }); n.cenario=n.cenarios[0].id; rpPlanos().push(n); r.sel=n.id; rpSalva(n); renderRentab(); estadoParaURL(); return; }
  if(t.hasAttribute('data-rp-del')){ if(!confirm(`Excluir o plano "${p.nome}" e todos os cenários?`)) return; cfg.rentab.planos=rpPlanos().filter(x=>x.id!==p.id); r.sel=''; salvaCfg(); renderRentab(); estadoParaURL(); return; }
  if(t.hasAttribute('data-rp-cen-novo')){ const c=rpNovoCenario('Cenário '+((p.cenarios||[]).length+1)); p.cenarios.push(c); p.cenario=c.id; rpSalva(p); renderRentab(); return; }
  if(t.hasAttribute('data-rp-cen-dup')){ const c=JSON.parse(JSON.stringify(c0)); c.id=rpId('cn'); c.nome=(c0.nome||'Cenário')+' (cópia)'; p.cenarios.push(c); p.cenario=c.id; rpSalva(p); renderRentab(); return; }
  if(t.hasAttribute('data-rp-cen-ren')){ const n=prompt('Nome do cenário:',c0.nome||''); if(n==null) return; c0.nome=String(n).trim().slice(0,40)||c0.nome; rpSalva(p); renderRentab(); return; }
  if(t.hasAttribute('data-rp-cen-del')){ if((p.cenarios||[]).length<2) return; if(!confirm(`Excluir o cenário "${c0.nome}"?`)) return; p.cenarios=p.cenarios.filter(x=>x.id!==c0.id); p.cenario=p.cenarios[0].id; rpSalva(p); renderRentab(); return; }
  if(t.hasAttribute('data-rp-rm')){ const i=+t.getAttribute('data-rp-rm'); c0.aloc=(c0.aloc||[]).filter((x,j)=>j!==i); rpSalva(p); renderRentab(); return; }
  if(t.id==='rp-add'){ const a=(document.getElementById('rp-add-pessoa')||{}).value||''; if(!a){ toast('Escolha uma pessoa.','warn'); return; }
    const papel=(document.getElementById('rp-add-papel')||{}).value==='gestao'?'gestao':'exec'; const h=Number((document.getElementById('rp-add-h')||{}).value)||0;
    const al={a,papel,h:{}}; rpDistribui(al,meses,h); c0.aloc=c0.aloc||[]; c0.aloc.push(al); rpSalva(p); renderRentab(); return; }
  if(t.hasAttribute('data-rp-real-retry')){ delete r.tempoErro[t.getAttribute('data-rp-real-retry')]; renderRentab(); return; }
});
