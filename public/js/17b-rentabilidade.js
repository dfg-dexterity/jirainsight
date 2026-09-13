// Jira Insights · 17b · 💹 RENTABILIDADE DE PROJETOS — cadastro do projeto, planner visual pessoa × mês, cenários e simulações.
// ===========================================================================
// A base é o PROJETO DO JIRA: cada plano aponta um projeto (obrigatório) e guarda
// duração (início + meses), carga de trabalho VENDIDA em HORAS POR DIA ÚTIL (ou um
// total) e o VALOR DA HORA VENDIDA → receita = horas vendidas × valor. Em cada
// CENÁRIO, a grade pessoa × mês diz quem trabalha quanto (execução ou gestão); o
// custo é SEMPRE horas × custo/h da pessoa (cfg.custosPessoa / vaga planejada) — o
// custo do funcionário serve só para medir custo, nunca entra na receita. Daí saem
// esforço previsto, eficiência (esforço ÷ vendidas), horas economizadas, margem,
// receita por hora trabalhada e a folga para alocar alguém mais barato mantendo a
// margem-meta. O REALIZADO (worklogs do Clockwork no projeto do Jira) entra na grade
// (linha "↳ realizado" sob cada pessoa), nos gráficos e na RENTABILIDADE REAL:
// custo realizado × previsto, margem real e projetada, eficiência real. Tudo salvo
// na config compartilhada (cfg.rentab); gestores editam, os demais leem.
//
// 💵 MODELO DE RECEITA POR TIPO DE PROJETO (pedido de 2026-09-13) — cada plano tem um
// `tipo`, sugerido pela categoria do projeto no Jira e ajustável:
//   • horas   (DEA/PEA/AMS): início e fim, horas por dia útil alocadas e valor da hora
//              → receita prevista mês a mês ("precisão de receita"), receita realizada
//              (horas faturáveis × valor) e a cotação no Odoo (ordem de venda com o
//              faturamento previsto por mês).
//   • fechado (DEF/PEF): valor do projeto + MARCOS DE FATURAMENTO (data, %, épico)
//              → curva de faturamento, faturado × a faturar, valor-hora efetivo.
//   • interno (IMI/IPA/ITPR): ORÇAMENTO de custo global, consumido pela alocação da
//              equipe (por período, horas/dia ou total) → saldo, consumo e projeção.
// Helpers de outros módulos só em tempo de render.
// ===========================================================================
const RP_PAPEIS=[['exec','Execução'],['gestao','Gestão']];
const RP_CORES=['#009994','#4a3aa7','#eb6834','#008300','#B27DB4','#FFA436','#2a78d6','#C2660A','#5B8C5A','#8A5B00'];
const RP_MAX_MESES=36;
const RP_TIPOS={ horas:['⏱','Horas abertas','receita = horas vendidas × valor da hora (início, fim, horas por dia)'],
  fechado:['📦','Escopo fechado','valor do projeto + marcos de faturamento'],
  interno:['🏠','Interno','orçamento de custo consumido pela alocação da equipe'] };
function rpTipo(p){ return RP_TIPOS[p&&p.tipo]?p.tipo:'horas'; }
// Tipo sugerido pela categoria do projeto no Jira (sigla DEF/PEF → fechado; IMI/IPA/ITPR → interno; o resto → horas).
function rpTipoSugerido(key){ const pr=(_projetosCache||[]).find(x=>x.key===key); const s=pr?relSiglaDe(pr.categoria):''; return /^(DEF|PEF)$/.test(s)?'fechado':/^(IMI|IPA|ITPR)$/.test(s)?'interno':'horas'; }
function rpPlanos(){ if(!cfg.rentab||typeof cfg.rentab!=='object') cfg.rentab={planos:[]}; if(!Array.isArray(cfg.rentab.planos)) cfg.rentab.planos=[]; return cfg.rentab.planos; }
function rpPlano(id){ return rpPlanos().find(p=>p.id===id)||null; }
function rpId(pre){ return pre+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function rpNovoCenario(nome){ return { id:rpId('cn'), nome:nome||'Base', aloc:[] }; }
function rpNovoPlano(){ const c=rpNovoCenario('Base'); const h=hojeSP();
  return { id:rpId('rp'), nome:'', cliente:'', projeto:'', tipo:'horas', inicio:h.slice(0,7)+'-01', fim:'', meses:3, modoCarga:'dia', cargaDia:0, cargaTotal:0, valorHora:0, margemMeta:30, obs:'',
    valorProjeto:0, marcos:[], orcamento:0, odoo:null,
    cenarios:[c], cenario:c.id, criadoEm:h, atualizadoEm:h }; }
// Dias úteis (seg–sex sem feriado) entre duas datas, inclusive — sem o teto de 400 dias do listaDias.
function rpDiasUteis(de, ate){ if(!de||!ate||ate<de) return 0; let n=0, d=de, g=0; while(d<=ate&&g++<1500){ if(ehUtil(d)&&!ehFeriado(d)) n++; d=proxDia(d); } return n; }
function rpUltimoDia(ym){ const y=+ym.slice(0,4), m=+ym.slice(5,7); return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10); }
const rpFimValido=(p)=>/^\d{4}-\d{2}-\d{2}$/.test(p.fim||'')&&p.fim>=(p.inicio||'');
// Meses do plano: do início até o FIM informado (quando há) ou pela duração em meses.
function rpMeses(p){ const out=[]; const ini=/^\d{4}-\d{2}/.test(p.inicio||'')?p.inicio:hojeSP(); let y=+ini.slice(0,4), m=+ini.slice(5,7);
  let n=rpFimValido(p)?((+p.fim.slice(0,4)-y)*12+(+p.fim.slice(5,7)-m)+1):Math.round(Number(p.meses)||1);
  n=Math.max(1,Math.min(RP_MAX_MESES,n));
  for(let i=0;i<n;i++){ out.push(`${y}-${String(m).padStart(2,'0')}`); m++; if(m>12){ m=1; y++; } } return out; }
function rpFim(p){ const ms=rpMeses(p); const u=rpUltimoDia(ms[ms.length-1]); return rpFimValido(p)&&p.fim<=u?p.fim:u; }
// Horas vendidas por mês: h/dia útil × dias úteis do mês dentro do prazo (modo 'dia'),
// um total rateado pelos dias úteis ('total') ou o legado h/mês ('mes').
function rpVendPorMes(p){
  const ms=rpMeses(p); const fim=rpFim(p); const out={}; const du={}; let duTot=0;
  ms.forEach(m=>{ const a=m===ms[0]?p.inicio:m+'-01'; const b=rpUltimoDia(m)<fim?rpUltimoDia(m):fim; du[m]=rpDiasUteis(a,b); duTot+=du[m]; });
  const modo=p.modoCarga||'dia';
  ms.forEach(m=>{ out[m]=modo==='total'?(duTot?Math.max(0,Number(p.cargaTotal)||0)*du[m]/duTot:0):modo==='mes'?Math.max(0,Number(p.cargaMes)||0):Math.max(0,Number(p.cargaDia)||0)*du[m]; });
  return { porMes:out, diasUteis:du, diasUteisTotal:duTot };
}
function rpVendidas(p){ const v=rpVendPorMes(p).porMes; return Object.values(v).reduce((s,x)=>s+x,0); }
// Horas vendidas até uma data (pro rata pelos dias úteis já decorridos).
function rpVendAte(p, ate){ const v=rpVendPorMes(p); const ms=rpMeses(p); let s=0;
  ms.forEach(m=>{ if(m>ate.slice(0,7)) return; if(m<ate.slice(0,7)){ s+=v.porMes[m]; return; }
    const a=m===ms[0]?p.inicio:m+'-01'; const du=rpDiasUteis(a,ate); s+=v.diasUteis[m]?v.porMes[m]*du/v.diasUteis[m]:0; });
  return s; }
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
// ---- marcos de faturamento (escopo fechado): % do valor do projeto por data, ligados a um épico se quiser ----
function rpMarcos(p){ if(!Array.isArray(p.marcos)) p.marcos=[]; return p.marcos; }
function rpMarcosCalc(p, valor){
  const hoje=hojeSP(); let acum=0;
  const lista=rpMarcos(p).slice().sort((a,b)=>(a.data||'9999').localeCompare(b.data||'9999')||String(a.nome||'').localeCompare(String(b.nome||''),'pt')).map(m=>{
    const pct=Math.max(0,Number(m.pct)||0); const v=valor*pct/100; acum+=v;
    return { ...m, pct, valor:v, acum, fat:m.status==='faturado', atrasado:m.status!=='faturado'&&!!m.data&&m.data<hoje }; });
  const pctTot=Math.round(lista.reduce((s,m)=>s+m.pct,0)*100)/100; const faturado=lista.filter(m=>m.fat).reduce((s,m)=>s+m.valor,0);
  const porMes={}; lista.forEach(m=>{ const k=(m.data||'').slice(0,7); if(k) porMes[k]=(porMes[k]||0)+m.valor; });
  return { lista, pctTot, faturado, aFaturar:Math.max(0,valor-faturado), proximo:lista.find(m=>!m.fat&&m.data&&m.data>=hoje)||null, vencidos:lista.filter(m=>m.atrasado), porMes };
}
// ---- cálculo de um cenário ----
function rpCalc(p, c){
  const meses=rpMeses(p); const vp=rpVendPorMes(p); const vendPorMes=vp.porMes; const vend=meses.reduce((s,m)=>s+vendPorMes[m],0); const vendMes=vend/meses.length; const vh=Math.max(0,Number(p.valorHora)||0);
  const tipo=rpTipo(p); const valorProj=Math.max(0,Number(p.valorProjeto)||0); const orc=Math.max(0,Number(p.orcamento)||0);
  // receita por tipo: horas = vendidas × valor da hora · fechado = valor do projeto · interno = não há receita (o que se mede é o orçamento)
  const receita=tipo==='fechado'?valorProj:tipo==='interno'?0:vend*vh;
  const marcos=tipo==='fechado'?rpMarcosCalc(p,valorProj):null;
  const receitaPorMes={}; meses.forEach(m=>{ receitaPorMes[m]=tipo==='horas'?vendPorMes[m]*vh:tipo==='fechado'?(marcos.porMes[m]||0):0; });
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
  const vhEfetivo=tipo==='fechado'?(vend>0?valorProj/vend:null):vh;   // escopo fechado: quanto vale cada hora vendida
  const saldoOrc=orc-custo; const consumoPrev=orc>0?custo/orc:null;    // interno: o que a alocação consome do orçamento
  return { meses, vend, vendMes, vendPorMes, diasUteis:vp.diasUteis, diasUteisTotal:vp.diasUteisTotal, vh, receita, porMes, porPessoa, exec, gestao, esforco, custo, custoExec, custoGestao, margem, mgp, efic, econ, recH, custoMedio, meta, folgaR, folgaH, maisBarato, semCusto,
    tipo, valorProj, orc, marcos, receitaPorMes, vhEfetivo, saldoOrc, consumoPrev };
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
  const porMes={}; calc.meses.forEach(m=>{ porMes[m]={h:0,hFat:0,custo:0,porPessoa:{}}; });
  let h=0,hFat=0,custo=0; const pessoas={}; const tickets=new Set();
  (t.worklogs||[]).forEach(w=>{ if(w.p!==p.projeto) return; const m=(w.d||'').slice(0,7); if(!porMes[m]) return; const hh=(Number(w.s)||0)/3600; const cu=hh*rpCustoH(w.a);
    porMes[m].h+=hh; porMes[m].custo+=cu; porMes[m].porPessoa[w.a]=(porMes[m].porPessoa[w.a]||0)+hh; h+=hh; custo+=cu; if(w.f){ porMes[m].hFat+=hh; hFat+=hh; }
    const P=pessoas[w.a]=pessoas[w.a]||{a:w.a,nome:(t.pessoas&&t.pessoas[w.a]&&t.pessoas[w.a].nome)||rpNome(w.a),h:0,custo:0}; P.h+=hh; P.custo+=cu; if(w.k) tickets.add(w.k); });
  // fração do prazo já decorrida em DIAS ÚTEIS (início → data lida ÷ dias úteis do projeto)
  const hoje=hojeSP(); const ate=k.split('|')[2]; const duTot=calc.diasUteisTotal||rpDiasUteis(p.inicio,rpFim(p)); const duAte=rpDiasUteis(p.inicio,ate);
  const fracao=duTot>0?Math.min(1,duAte/duTot):1;
  const vendAteHoje=rpVendAte(p,ate); const mesAtual=ate.slice(0,7);
  // fração do mês corrente já decorrida (dias úteis) — o previsto "até aqui" e o "restante" respeitam o dia de hoje
  const fMes=(m)=>{ if(m<mesAtual) return 1; if(m>mesAtual) return 0; const a=m===calc.meses[0]?p.inicio:m+'-01'; const du=calc.diasUteis[m]||0; return du?Math.min(1,rpDiasUteis(a,ate)/du):1; };
  const prevAteHoje=calc.meses.reduce((s,m)=>s+(calc.porMes[m].exec+calc.porMes[m].gestao)*fMes(m),0);
  const custoPrevAteHoje=calc.meses.reduce((s,m)=>s+calc.porMes[m].custo*fMes(m),0);
  const custoRestante=calc.meses.reduce((s,m)=>s+calc.porMes[m].custo*(1-fMes(m)),0);   // o que o cenário ainda prevê gastar
  // receita "até aqui" por tipo: horas = vendidas pro rata × valor (previsto) e horas FATURÁVEIS apontadas × valor (realizada);
  // fechado = valor do projeto pro rata do prazo (reconhecida) e marcos faturados (faturada); interno = não há receita.
  const receitaAteHoje=calc.tipo==='fechado'?calc.valorProj*fracao:calc.tipo==='interno'?0:vendAteHoje*calc.vh;
  const receitaReal=calc.tipo==='horas'?hFat*calc.vh:calc.tipo==='fechado'?calc.marcos.faturado:0;
  const receitaBase=calc.tipo==='horas'?receitaReal:receitaAteHoje;   // a margem real usa o que foi de fato faturável (horas) ou reconhecido (fechado)
  // interno: consumo do orçamento e quando ele acaba no ritmo atual (por dia útil)
  const consumoReal=calc.orc>0?custo/calc.orc:null; const ritmoDia=duAte>0?custo/duAte:0;
  let orcAcabaEm=''; if(calc.tipo==='interno'&&calc.orc>0&&ritmoDia>0&&custo<calc.orc){ let d=ate, falta=(calc.orc-custo)/ritmoDia, g=0; while(falta>0&&g++<1500){ d=proxDia(d); if(ehUtil(d)&&!ehFeriado(d)) falta--; } orcAcabaEm=d; }
  return { porMes, h, hFat, custo, pessoas:Object.values(pessoas).sort((a,b)=>b.h-a.h), tickets:tickets.size, fracao, vendAteHoje, prevAteHoje, custoPrevAteHoje, custoRestante, receitaAteHoje, receitaReal, fMesAtual:fMes(mesAtual),
    margemAteHoje:receitaBase-custo, receitaBase, eficReal:vendAteHoje>0?h/vendAteHoje:null, econReal:vendAteHoje-h,
    projCusto:fracao>=0.1?custo/fracao:null, custoFinalPlano:custo+custoRestante, consumoReal, ritmoDia, orcAcabaEm, ate };
}
// Ficha do projeto no Jira (épicos com datas e % concluído) — para ligar marcos de faturamento a épicos. Cache compartilhado com 📁 Projetos.
function rpGaranteFicha(p){
  const key=p&&p.projeto; if(!key||!estado.projetos) return; estado.projetos.fichas=estado.projetos.fichas||{}; const r=estado.rentab; r.fichaB=r.fichaB||{};
  if(estado.projetos.fichas[key]||r.fichaB[key]) return; r.fichaB[key]=true;
  fetch(`/api/projetos?visao=1&projeto=${encodeURIComponent(key)}`).then(x=>x.json()).then(j=>{ r.fichaB[key]=false; if(j&&!j.erro) estado.projetos.fichas[key]=j; rpReRender(); }).catch(()=>{ r.fichaB[key]=false; });
}
// Aloca uma pessoa por período: horas por dia útil, por mês ou um total, só nos meses entre `de` e `ate`.
function rpAloca(al, meses, diasUteis, modo, valor, de, ate){
  al.h={}; const alvo=meses.filter(m=>(!de||m>=de)&&(!ate||m<=ate)); if(!alvo.length) return;
  if(modo==='dia') alvo.forEach(m=>{ al.h[m]=Math.round(Math.max(0,valor)*(diasUteis[m]||0)*10)/10; });
  else if(modo==='mes') alvo.forEach(m=>{ al.h[m]=Math.round(Math.max(0,valor)*10)/10; });
  else { const cada=Math.round(Math.max(0,valor)/alvo.length*10)/10; alvo.forEach(m=>{ al.h[m]=cada; }); }
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
    <div class="muted small">A base é o <b>projeto do Jira</b> e o <b>tipo</b> define o modelo de receita: <b>⏱ horas abertas</b> (início, fim, horas por dia e valor da hora → receita prevista mês a mês, receita realizada e a cotação no Odoo), <b>📦 escopo fechado</b> (valor do projeto e <b>marcos de faturamento</b>) e <b>🏠 interno</b> (um <b>orçamento de custo</b> consumido pela alocação da equipe). Em cada <b>cenário</b> você aloca as pessoas (por período, em horas por dia útil, por mês ou no total; execução e gestão) e vê na hora o <b>esforço previsto</b>, o <b>custo</b> (sempre horas × custo/h de cada pessoa), a <b>margem</b> ou o <b>saldo do orçamento</b>. As <b>horas realizadas</b> do projeto (Clockwork) entram na comparação com o planejado e na rentabilidade real. ${gestor?'':'<b>Somente gestores editam</b>; você está vendo em modo leitura.'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${gestor?'<button class="btn primario" data-rp-novo="1">＋ Novo plano</button>':''}
      ${r.sel?'<button class="btn" data-rp-voltar="1">‹ Todos os planos</button>':''}</div></div>`;
  if(r.novo&&gestor){ cont.replaceChildren(el(`<div>${intro}${rpFormHTML(r.rasc||rpNovoPlano(),true)}</div>`)); return; }
  if(!r.sel){
    const cards=planos.map(p=>{ const c=rpCalc(p,rpCenario(p)); const [stc,str]=rpStatus(p); const T=RP_TIPOS[c.tipo];
      const kpi1=c.tipo==='interno'?['Orçamento',fmtBRL(c.orc)]:c.tipo==='fechado'?['Valor do projeto',fmtBRL(c.valorProj)]:['Receita prevista',fmtBRL(c.receita)];
      const kpi4=c.tipo==='interno'?['Saldo do orçamento',`<span class="${c.saldoOrc<0?'rp-neg':'rp-pos'}">${fmtBRL(c.saldoOrc)}</span> <span class="muted small">${c.consumoPrev==null?'':Math.round(c.consumoPrev*100)+'% consumido'}</span>`]:['Margem',`${c.mgp==null?'—':c.mgp+'%'} ${rpSemMargem(c.mgp,c.meta)}`];
      const linha=c.tipo==='fechado'?`${c.marcos.lista.length} marco(s) · faturado ${fmtBRL(c.marcos.faturado)}`:c.tipo==='interno'?`${rpH(c.esforco)} alocadas`:`${rpCargaRot(p)} · ${rpH(c.vend)} vendidas · hora vendida ${fmtBRL(c.vh)}`;
      return `<div class="ad-card rp-card rp-t-${c.tipo}" data-rp-abrir="${escA(p.id)}" role="button" tabindex="0">
        <div class="ad-top"><strong>${esc(p.nome||'(sem nome)')}</strong> <span class="badge rp-st-${stc}">${str}</span> <span class="badge rp-tipo" data-tip="${escA(T[2])}">${T[0]} ${T[1]}</span><span class="spacer"></span><span class="muted small">${esc(p.cliente||'')}</span></div>
        <div class="muted small">${p.projeto?`${esc(projNome(p.projeto))} (${esc(p.projeto)}) · `:''}${dataBR(p.inicio)} → ${dataBR(rpFim(p))} · ${c.meses.length} mês(es) · ${linha}</div>
        <div class="ams-dgrid rp-mini">
          <div class="ams-dl"><div class="dt">${kpi1[0]}</div><div class="dd">${kpi1[1]}</div></div>
          <div class="ams-dl"><div class="dt">Esforço previsto</div><div class="dd">${rpH(c.esforco)} <span class="muted small">${c.efic==null?'':Math.round(c.efic*100)+'%'}</span></div></div>
          <div class="ams-dl"><div class="dt">Custo</div><div class="dd">${fmtBRL(c.custo)}</div></div>
          <div class="ams-dl"><div class="dt">${kpi4[0]}</div><div class="dd">${kpi4[1]}</div></div></div>
        <div class="muted small" style="margin-top:6px">${(p.cenarios||[]).length} cenário(s) · ${(rpCenario(p).aloc||[]).length} pessoa(s) alocada(s)</div></div>`; }).join('');
    cont.replaceChildren(el(`<div>${intro}<div class="card full"><h2>Planos <span>${planos.length} plano(s)</span></h2>
      ${planos.length?`<div class="ad-grid">${cards}</div>`:`<div class="estado">Nenhum plano ainda. ${gestor?'Clique em <b>＋ Novo plano</b>, escolha o projeto do Jira e informe duração, horas vendidas por dia e o valor da hora vendida para começar a simular.':'Peça a um gestor para cadastrar o primeiro plano.'}</div>`}</div></div>`));
    return;
  }
  const p=rpPlano(r.sel); const c0=rpCenario(p); const c=rpCalc(p,c0); const tipo=c.tipo; const T=RP_TIPOS[tipo];
  rpGaranteReal(p); const real=rpReal(p,c); const chaveReal=rpRealChave(p);
  if(tipo==='fechado') rpGaranteFicha(p);
  const [stc,str]=rpStatus(p);
  const dados=tipo==='fechado'?`
      <div class="ams-dl"><div class="dt">Valor do projeto</div><div class="dd">${fmtBRL(c.valorProj)}</div></div>
      <div class="ams-dl"><div class="dt">Marcos de faturamento</div><div class="dd">${c.marcos.lista.length} <span class="muted small">· ${c.marcos.pctTot}% do valor</span></div></div>
      <div class="ams-dl"><div class="dt">Horas vendidas</div><div class="dd">${c.vend?`${rpH(c.vend)} <span class="muted small">· ${rpCargaRot(p)}</span>`:'<span class="muted">não informadas</span>'}</div></div>
      <div class="ams-dl"><div class="dt">Valor-hora efetivo</div><div class="dd">${c.vhEfetivo==null?'—':fmtBRL(c.vhEfetivo)} <span class="muted small">valor ÷ horas vendidas</span></div></div>
      <div class="ams-dl"><div class="dt">Margem-meta</div><div class="dd">${c.meta}%</div></div>`
    :tipo==='interno'?`
      <div class="ams-dl"><div class="dt">Orçamento de custo</div><div class="dd">${fmtBRL(c.orc)}</div></div>
      <div class="ams-dl"><div class="dt">Prazo</div><div class="dd">${c.diasUteisTotal} dia(s) útil(eis)</div></div>
      <div class="ams-dl"><div class="dt">Horas alocadas</div><div class="dd">${rpH(c.esforco)}</div></div>
      <div class="ams-dl"><div class="dt">Custo médio previsto</div><div class="dd">${c.custoMedio==null?'—':fmtBRL(c.custoMedio)+'/h'}</div></div>`
    :`
      <div class="ams-dl"><div class="dt">Carga vendida</div><div class="dd">${rpCargaRot(p)} <span class="muted small">· ${c.diasUteisTotal} dia(s) útil(eis)</span></div></div>
      <div class="ams-dl"><div class="dt">Horas vendidas</div><div class="dd">${rpH(c.vend)} <span class="muted small">no prazo</span></div></div>
      <div class="ams-dl"><div class="dt">Valor da hora vendida</div><div class="dd">${fmtBRL(c.vh)}</div></div>
      <div class="ams-dl"><div class="dt">Receita prevista</div><div class="dd">${fmtBRL(c.receita)}</div></div>
      <div class="ams-dl"><div class="dt">Margem-meta</div><div class="dd">${c.meta}%</div></div>`;
  const cab=`<div class="card full"><h2>💹 ${esc(p.nome||'(sem nome)')} <span class="badge rp-st-${stc}">${str}</span> <span class="badge rp-tipo" data-tip="${escA(T[2])}">${T[0]} ${T[1]}</span> <span>${esc(p.cliente||'')}${p.projeto?` · ${esc(projNome(p.projeto))} (${esc(p.projeto)})`:''} · ${dataBR(p.inicio)} → ${dataBR(rpFim(p))} · ${c.meses.length} mês(es)</span></h2>
    <div class="rp-dados">${dados}
      ${p.obs?`<div class="ams-dl" style="grid-column:span 2"><div class="dt">Obs.</div><div class="dd small">${esc(p.obs)}</div></div>`:''}
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center"><button class="btn" data-rp-voltar="1">‹ Todos os planos</button>${gestor?`<button class="btn" data-rp-editar="1">✏️ Dados do projeto</button><button class="btn" data-rp-dup="1">📋 Duplicar plano</button><button class="btn" data-rp-del="1">🗑 Excluir</button>`:'<span class="muted small">🔒 Somente gestores editam — você está em modo leitura.</span>'}</div>
    ${r.edit&&gestor?rpFormHTML(r.rasc||p,false):''}</div>`;
  // cenários
  const chips=`<div class="ap-chips rp-cen">${(p.cenarios||[]).map(x=>`<button class="chip ${x.id===c0.id?'on':''}" data-rp-cen="${escA(x.id)}">${esc(x.nome||'Cenário')}</button>`).join('')}
    ${gestor?`<button class="btn rt-step" data-rp-cen-novo="1" data-tip="Cria um cenário vazio">＋ cenário</button><button class="btn rt-step" data-rp-cen-dup="1" data-tip="Copia o cenário atual para simular uma variação">📋 duplicar</button><button class="btn rt-step" data-rp-cen-ren="1">✏️ renomear</button>${(p.cenarios||[]).length>1?'<button class="btn rt-step" data-rp-cen-del="1">🗑</button>':''}`:''}</div>`;
  const kEsf=rpKpi(rpH(c.esforco),'Esforço previsto',c.efic==null?'':(c.efic<=0.8?'good':(c.efic<=1?'warn':'bad')),c.efic==null?(tipo==='interno'?`${c.custoMedio==null?'—':fmtBRL(c.custoMedio)+'/h'} de custo médio`:'sem carga vendida'):`${Math.round(c.efic*100)}% das horas vendidas · ${c.econ>=0?'economiza':'estoura'} ${rpH(Math.abs(c.econ))}`);
  const kCusto=rpKpi(fmtBRL(c.custo),'Custo previsto',c.semCusto?'bad':'',c.semCusto?`⚠ ${c.semCusto} pessoa(s) sem custo/h`:`execução ${fmtBRL(c.custoExec)} · gestão ${fmtBRL(c.custoGestao)}`);
  const kMargem=rpKpi(fmtBRL(c.margem),'Margem prevista',c.mgp==null?'':(c.mgp>=c.meta?'good':(c.mgp>=c.meta/2?'warn':'bad')),c.mgp==null?'—':`${c.mgp}% · meta ${c.meta}%`);
  let hero;
  if(tipo==='fechado'){ const M=c.marcos; const prox=M.proximo;
    hero=`<div class="vg-hero">
    ${rpKpi(fmtBRL(c.valorProj),'Valor do projeto','',c.vhEfetivo==null?'informe as horas vendidas para ver o valor-hora efetivo':`${rpH(c.vend)} vendidas · ${fmtBRL(c.vhEfetivo)}/h efetivo`)}
    ${kEsf}${kCusto}${kMargem}
    ${rpKpi(fmtBRL(M.faturado),'Faturado × a faturar',M.vencidos.length?'bad':(M.pctTot!==100?'warn':''),M.vencidos.length?`⚠ ${M.vencidos.length} marco(s) vencido(s) sem faturar`:`a faturar ${fmtBRL(M.aFaturar)}${M.pctTot!==100?` · marcos somam ${M.pctTot}%`:''}`)}
    ${rpKpi(prox?dataBR(prox.data):'—','Próximo marco',prox&&crDias(hojeSP(),prox.data)<=14?'warn':'',prox?`${esc(prox.nome||'')} · ${fmtBRL(prox.valor)}${prox.epico?` · ${esc(prox.epico)}`:''}`:(M.lista.length?'todos faturados ou vencidos':'cadastre os marcos abaixo'))}</div>`; }
  else if(tipo==='interno'){
    hero=`<div class="vg-hero">
    ${rpKpi(fmtBRL(c.orc),'Orçamento de custo','',`${c.diasUteisTotal} dia(s) útil(eis) · ${dataBR(p.inicio)} → ${dataBR(rpFim(p))}`)}
    ${rpKpi(fmtBRL(c.custo),'Custo previsto (alocação)',c.consumoPrev==null?'':(c.consumoPrev<=0.9?'good':(c.consumoPrev<=1?'warn':'bad')),c.consumoPrev==null?'informe o orçamento':`${Math.round(c.consumoPrev*100)}% do orçamento`)}
    ${rpKpi(fmtBRL(c.saldoOrc),'Saldo previsto',c.saldoOrc>=0?'good':'bad',c.saldoOrc>=0?'sobra prevista do orçamento':'a alocação estoura o orçamento')}
    ${kEsf}
    ${rpKpi(real?fmtBRL(real.custo):'—','Custo realizado',real&&real.consumoReal!=null?(real.consumoReal<=real.fracao+0.05?'good':'warn'):'',real?(real.consumoReal==null?'sem orçamento':`${Math.round(real.consumoReal*100)}% consumido · ${Math.round(real.fracao*100)}% do prazo decorrido`):'aguardando as horas')}
    ${rpKpi(real&&real.projCusto!=null?fmtBRL(real.projCusto):'—','Projeção no ritmo atual',real&&real.projCusto!=null&&c.orc?(real.projCusto<=c.orc?'good':'bad'):'',real&&real.projCusto!=null?(c.orc?(real.projCusto<=c.orc?`cabe no orçamento (sobra ${fmtBRL(c.orc-real.projCusto)})`:`estoura em ${fmtBRL(real.projCusto-c.orc)}${real.orcAcabaEm?` · orçamento acaba em ${dataBR(real.orcAcabaEm)}`:''}`):'sem orçamento'):'ainda cedo para projetar')}</div>`; }
  else hero=`<div class="vg-hero">
    ${rpKpi(fmtBRL(c.receita),'Receita prevista','',`${rpH(c.vend)} × ${fmtBRL(c.vh)}`)}
    ${kEsf}${kCusto}${kMargem}
    ${rpKpi(c.recH==null?'—':fmtBRL(c.recH),'Receita por hora trabalhada','',c.custoMedio==null?'—':`custo médio ${fmtBRL(c.custoMedio)}/h`)}
    ${rpKpi(c.folgaH==null?'—':rpH(c.folgaH),'Folga até a meta',c.folgaR>=0?'good':'bad',c.maisBarato?(c.folgaR>=0?`cabem mais horas de ${esc(c.maisBarato.nome.split(' ')[0])} (${fmtBRL(c.maisBarato.ch)}/h)`:`faltam ${fmtBRL(-c.folgaR)} para a meta`):'aloque alguém com custo/h')}</div>`;
  // simulador rápido (por tipo: horas mexe no valor-hora; fechado no valor do projeto; interno no orçamento)
  const sim=gestor?`<div class="rp-sim">
    <div class="campo"><label>Esforço total previsto (h)</label><input type="number" id="rp-sim-esf" min="0" step="1" value="${Math.round(c.esforco)}" data-tip="Redistribui proporcionalmente as horas de EXECUÇÃO para fechar neste total"></div>
    ${tipo!=='interno'?`<div class="campo"><label>Eficiência (% das vendidas)</label><input type="number" id="rp-sim-efic" min="1" max="300" step="1" value="${c.efic==null?'':Math.round(c.efic*100)}" data-tip="Ex.: 60 = fazer o projeto com 60% das horas vendidas" ${c.vend?'':'disabled'}></div>`:''}
    ${tipo==='horas'?`<div class="campo"><label>Valor da hora vendida (R$)</label><input type="number" id="rp-sim-vh" min="0" step="0.01" value="${c.vh}"></div>`:tipo==='fechado'?`<div class="campo"><label>Valor do projeto (R$)</label><input type="number" id="rp-sim-valor" min="0" step="0.01" value="${c.valorProj}"></div>`:`<div class="campo"><label>Orçamento de custo (R$)</label><input type="number" id="rp-sim-orc" min="0" step="0.01" value="${c.orc}"></div>`}
    ${tipo!=='interno'?`<div class="campo"><label>Margem-meta (%)</label><input type="number" id="rp-sim-meta" min="0" max="100" step="1" value="${c.meta}"></div>`:''}
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
      <td>${gestor?`<button class="btn rt-step" data-rp-rm="${i}" data-tip="Tirar esta pessoa do cenário">✕</button>`:''}</td></tr>
      ${real&&!ppDe(al.a)?(()=>{ const rh=c.meses.map(m=>real.porMes[m].porPessoa[al.a]||0); const tot=rh.reduce((s,x)=>s+x,0); const ehG=al.papel==='gestao';
        return `<tr class="rp-real-row" data-tip="${escA(`${P.nome}: horas apontadas no projeto (Clockwork) — comparadas com o planejado${ehG?' (a pessoa também pode ter horas de execução nesta linha)':''}`)}"><td class="muted small">↳ realizado</td><td></td><td></td><td class="num">${tot?rpH(tot):'—'}</td><td class="num">${tot?fmtBRL(tot*P.ch):''}</td>
          ${c.meses.map((m,j)=>{ const v=rh[j]; const pl=Math.max(0,Number((al.h||{})[m])||0); return `<td class="num ${v>pl&&pl>0?'rp-neg':''}">${v?rpH(v):(m<=hojeSP().slice(0,7)?'0h':'')}</td>`; }).join('')}<td></td></tr>`; })():''}`; }).join('');
  const foot=(rot,fn,cls)=>`<tr class="${cls||''}"><td colspan="3"><b>${rot}</b></td><td class="num"><b>${fn('tot')}</b></td><td class="num">${fn('custo')}</td>${c.meses.map(m=>`<td class="num">${fn(m)}</td>`).join('')}<td></td></tr>`;
  const grade=`<div class="scroll-x"><table class="mp-tab-mini rp-grade"><thead><tr><th>Pessoa</th><th>Papel</th><th class="num">Custo/h</th><th class="num">Total</th><th class="num">Custo</th>${cols}<th></th></tr></thead>
    <tbody>${linhas||`<tr><td colspan="${6+c.meses.length}" class="mp-dim">Ninguém alocado neste cenário ainda${gestor?' — adicione uma pessoa abaixo':''}.</td></tr>`}</tbody>
    <tfoot>
      ${foot('Esforço previsto',(k)=>k==='tot'?rpH(c.esforco):(k==='custo'?fmtBRL(c.custo):rpH(c.porMes[k].exec+c.porMes[k].gestao)),'rp-f-prev')}
      ${foot('Horas vendidas',(k)=>k==='tot'?rpH(c.vend):(k==='custo'?`<span class="muted small">receita ${fmtBRL(c.receita)}</span>`:`${rpH(c.vendPorMes[k])} <span class="muted small" data-tip="dias úteis no mês">${c.diasUteis[k]}d</span>`),'rp-f-vend')}
      ${foot('Saldo (vendidas − previsto)',(k)=>{ const v=k==='tot'?c.econ:(k==='custo'?null:c.vendPorMes[k]-c.porMes[k].exec-c.porMes[k].gestao); return v==null?'':`<span class="${v<0?'rp-neg':'rp-pos'}">${v<0?'−':'+'}${rpH(Math.abs(v))}</span>`; },'rp-f-saldo')}
      ${real?foot('Realizado (Clockwork)',(k)=>k==='tot'?rpH(real.h):(k==='custo'?fmtBRL(real.custo):(real.porMes[k].h?rpH(real.porMes[k].h):'—')),'rp-f-real'):''}
      ${real?foot('Realizado − previsto até aqui',(k)=>{ if(k==='custo') return `<span class="${real.custo>real.custoPrevAteHoje?'rp-neg':'rp-pos'}">${fmtBRL(real.custo-real.custoPrevAteHoje)}</span>`; const mesAtual=real.ate.slice(0,7); if(k!=='tot'&&k>mesAtual) return '';
        const v=k==='tot'?real.h-real.prevAteHoje:real.porMes[k].h-(c.porMes[k].exec+c.porMes[k].gestao)*(k===mesAtual?real.fMesAtual:1); return `<span class="${v>0?'rp-neg':'rp-pos'}" data-tip="${k===mesAtual?'mês corrente: previsto proporcional aos dias úteis já decorridos':''}">${v>0?'+':'−'}${rpH(Math.abs(v))}</span>`; },'rp-f-dif'):''}
    </tfoot></table></div>
    ${gestor?`<div class="pl-grid" style="margin-top:8px"><div class="campo"><label>Adicionar pessoa</label><select id="rp-add-pessoa"><option value="">— escolha —</option>${pessoas.map(x=>`<option value="${escA(x.a)}">${esc(x.nome)}${alocIds.has(x.a)?' (já no cenário)':''} · ${fmtBRL(rpCustoH(x.a))}/h</option>`).join('')}</select></div>
      <div class="campo"><label>Papel</label><select id="rp-add-papel">${RP_PAPEIS.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div>
      <div class="campo"><label>Dedicação</label><div style="display:flex;gap:6px"><input type="number" id="rp-add-h" min="0" step="0.5" placeholder="ex.: 4" style="width:90px"><select id="rp-add-modo" data-tip="Horas por dia útil (× dias úteis de cada mês), horas por mês ou um total distribuído pelo período"><option value="dia">h por dia útil</option><option value="mes">h por mês</option><option value="total">h no total</option></select></div></div>
      <div class="campo"><label>Período</label><div style="display:flex;gap:6px;align-items:center"><select id="rp-add-de">${c.meses.map((m,i)=>`<option value="${m}" ${i===0?'selected':''}>${esc(labelMesAbbr(m))}</option>`).join('')}</select><span class="muted small">até</span><select id="rp-add-ate">${c.meses.map((m,i)=>`<option value="${m}" ${i===c.meses.length-1?'selected':''}>${esc(labelMesAbbr(m))}</option>`).join('')}</select></div></div>
      <div class="campo"><label>&nbsp;</label><button class="btn primario" id="rp-add">＋ Adicionar ao cenário</button></div>
      <div class="campo"><label>&nbsp;</label><span class="muted small">Vagas 🔮 (pessoas ainda não contratadas) vêm de Pessoas planejadas, com o custo previsto.</span></div></div>`:''}`;
  // gráficos
  const serie=[{nome:'Horas vendidas',cor:cores.grafite,vals:c.meses.map(m=>({x:m,v:Math.round(c.vendPorMes[m]*10)/10})),tipo:'line',dash:1},
    {nome:'Esforço previsto',cor:cores.cerceta,vals:c.meses.map(m=>({x:m,v:Math.round((c.porMes[m].exec+c.porMes[m].gestao)*10)/10})),tipo:'area'}];
  if(real) serie.push({nome:'Realizado',cor:cores.amarelo,vals:c.meses.map(m=>({x:m,v:Math.round(real.porMes[m].h*10)/10})),tipo:'line'});
  const maxMes=Math.max(1,...c.meses.map(m=>Math.max(c.vendPorMes[m],c.porMes[m].exec+c.porMes[m].gestao,real?real.porMes[m].h:0)));
  const stack=`<div class="rp-stack">${c.meses.map(m=>{ const M=c.porMes[m]; const tot=M.exec+M.gestao;
    const segs=(c0.aloc||[]).map((al,i)=>{ const h=M.porPessoa[i]||0; if(!h) return ''; return `<i style="height:${(h/maxMes*100).toFixed(1)}%;background:${RP_CORES[i%RP_CORES.length]}" data-tip="${escA(`${c.porPessoa[i].nome} · ${labelMesAbbr(m)} · ${rpH(h)} · ${fmtBRL(h*c.porPessoa[i].ch)}`)}"></i>`; }).join('');
    const realB=real&&real.porMes[m].h?`<b class="rp-realb" style="height:${(real.porMes[m].h/maxMes*100).toFixed(1)}%" data-tip="${escA(`realizado em ${labelMesAbbr(m)}: ${rpH(real.porMes[m].h)}`)}"></b>`:'';
    return `<div class="rp-col"><div class="rp-colw"><div class="rp-colb"><em class="rp-mark" style="bottom:${(c.vendPorMes[m]/maxMes*100).toFixed(1)}%" data-tip="${escA(`vendidas em ${labelMesAbbr(m)}: ${rpH(c.vendPorMes[m])}`)}"></em>${segs}</div>${realB}</div><div class="rp-rot"><b>${esc(labelMesAbbr(m))}</b>${rpH(tot)}</div></div>`; }).join('')}</div>
    <div class="pp-legend" style="margin-top:6px">${c.porPessoa.map(P=>`<span><i style="background:${RP_CORES[P.i%RP_CORES.length]}"></i>${esc(P.nome)} (${P.papel==='gestao'?'gestão':'execução'})</span>`).join('')}<span><i style="background:transparent;border-top:2px dashed var(--grafite)"></i>vendidas no mês</span>${real?'<span><i style="background:var(--amarelo)"></i>realizado</span>':''}</div>`;
  const wfMax=Math.max(1,tipo==='interno'?Math.max(c.orc,c.custo):c.receita); const wf=(rot,v,cor,extra)=>`<div class="rp-wf"><div class="rp-wf-l">${rot}</div><div class="rp-wf-t"><i style="width:${(Math.abs(v)/wfMax*100).toFixed(1)}%;background:${cor}"></i></div><div class="rp-wf-v ${v<0?'rp-neg':''}">${fmtBRL(v)}${extra?` <span class="muted small">${extra}</span>`:''}</div></div>`;
  const cascata=tipo==='interno'
    ?`${wf('Orçamento de custo',c.orc,cores.grafite)}${wf('− Custo de execução',-c.custoExec,cores.cerceta,`${rpH(c.exec)}`)}${wf('− Custo de gestão',-c.custoGestao,cores.roxo,`${rpH(c.gestao)}`)}${wf('= Saldo do orçamento',c.saldoOrc,c.saldoOrc>=0?cores.musgo:'var(--err)',c.consumoPrev==null?'':`${Math.round(c.consumoPrev*100)}% consumido`)}`
    :`${wf(tipo==='fechado'?'Valor do projeto':'Receita',c.receita,cores.grafite)}${wf('− Custo de execução',-c.custoExec,cores.cerceta,`${rpH(c.exec)}`)}${wf('− Custo de gestão',-c.custoGestao,cores.roxo,`${rpH(c.gestao)}`)}${wf('= Margem',c.margem,c.margem>=0?cores.musgo:'var(--err)',c.mgp==null?'':`${c.mgp}%`)}`;
  // ---- bloco do tipo: receita mensal + Odoo (horas) · marcos de faturamento (fechado) · consumo do orçamento (interno) ----
  let tipoHtml='';
  if(tipo==='horas'){
    const mesAtual=hojeSP().slice(0,7); let accP=0, accR=0;
    const rows=c.meses.map(m=>{ const rp=c.receitaPorMes[m]; const rr=real?real.porMes[m].hFat*c.vh:null; accP+=rp; if(rr!=null) accR+=rr; const dif=rr==null?null:rr-rp;
      return `<tr class="${m===mesAtual?'rm-destaque':''}"><td><b>${esc(labelMesAbbr(m))}</b></td><td class="num">${rpH(c.vendPorMes[m])} <span class="muted small">${c.diasUteis[m]}d</span></td><td class="num">${fmtBRL(rp)}</td><td class="num">${real?rpH(real.porMes[m].hFat):'—'}${real&&real.porMes[m].h>real.porMes[m].hFat?` <span class="muted small" data-tip="horas não faturáveis no mês">+${rpH(real.porMes[m].h-real.porMes[m].hFat)} n/f</span>`:''}</td><td class="num">${rr==null?'—':fmtBRL(rr)}</td><td class="num">${dif==null||(m>mesAtual)?'':`<span class="${dif<0?'rp-neg':'rp-pos'}">${dif<0?'−':'+'}${fmtBRL(Math.abs(dif))}</span>`}</td><td class="num muted small">${fmtBRL(accP)}${rr!=null&&m<=mesAtual?` / ${fmtBRL(accR)}`:''}</td></tr>`; }).join('');
    const od=p.odoo&&p.odoo.id?`<div class="aviso ok">🧾 Cotação criada no Odoo: <a href="${escA(p.odoo.url||'#')}" target="_blank" rel="noopener"><b>${esc(p.odoo.name||('#'+p.odoo.id))}</b> ↗</a> em ${dataBR((p.odoo.em||'').slice(0,10))}${p.odoo.por?` por ${esc(p.odoo.por)}`:''} · ${fmtBRL(p.odoo.total||0)} em ${p.odoo.linhas||0} linha(s). Confirme a cotação no Odoo para virar ordem de venda.${gestor?' <button class="btn rt-step" data-rp-odoo-limpar="1" data-tip="Esquece o vínculo para poder criar outra cotação">esquecer vínculo</button>':''}</div>`
      :gestor?`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px"><button class="btn primario" data-rp-odoo="1" ${c.receita>0?'':'disabled'} data-tip="Cria no Odoo (Vendas) uma COTAÇÃO em rascunho com uma linha por mês: horas previstas × valor da hora. Nada é confirmado automaticamente.">🧾 Criar cotação no Odoo com o faturamento previsto</button><span class="muted small">uma linha por mês (${c.meses.length}) · total ${fmtBRL(c.receita)} · cliente <b>${esc(p.cliente||'(informe o cliente)')}</b></span></div><div id="rp-odoo-fb" class="ap-fb" hidden></div>`
      :'';
    tipoHtml=`<section class="rm-bloco"><h3 class="mp-h3">💵 Precisão de receita — prevista × realizada por mês <span class="mp-dim">horas por dia útil × dias úteis × valor da hora</span></h3>
      <div class="scroll-x"><table class="mp-tab-mini rp-rec"><thead><tr><th>Mês</th><th class="num">Horas vendidas</th><th class="num">Receita prevista</th><th class="num">Horas faturáveis realizadas</th><th class="num">Receita realizada</th><th class="num">Diferença</th><th class="num">Acumulado (prev. / real.)</th></tr></thead>
        <tbody>${rows}</tbody><tfoot><tr><td><b>Total</b></td><td class="num"><b>${rpH(c.vend)}</b></td><td class="num"><b>${fmtBRL(c.receita)}</b></td><td class="num">${real?rpH(real.hFat):'—'}</td><td class="num">${real?fmtBRL(real.receitaReal):'—'}</td><td class="num">${real?`<span class="${real.receitaReal<real.receitaAteHoje?'rp-neg':'rp-pos'}" data-tip="realizada − prevista até hoje (pro rata)">${real.receitaReal<real.receitaAteHoje?'−':'+'}${fmtBRL(Math.abs(real.receitaReal-real.receitaAteHoje))}</span>`:''}</td><td></td></tr></tfoot></table></div>
      ${od}
      ${ctExpl('a <b>receita prevista</b> de cada mês é a carga por dia útil × os dias úteis do mês × o valor da hora; a <b>realizada</b> são as horas <b>faturáveis</b> apontadas no projeto (Clockwork) × o valor da hora — horas não faturáveis (reunião interna, ADM…) aparecem como n/f e não geram receita. A <b>cotação no Odoo</b> leva exatamente estas linhas (uma por mês) para o módulo de Vendas, em rascunho, para a equipe confirmar e faturar.')}</section>`;
  } else if(tipo==='fechado'){
    const M=c.marcos; const ficha=p.projeto&&estado.projetos&&estado.projetos.fichas&&estado.projetos.fichas[p.projeto]; const epicos=(ficha&&ficha.epicos)||[];
    const rows=M.lista.map(m=>{ const ep=epicos.find(e=>e.k===m.epico);
      return `<tr class="${m.fat?'rp-m-fat':(m.atrasado?'rp-m-atr':'')}" data-rp-marco="${escA(m.id)}">
        <td>${gestor?`<input type="text" data-rp-marco-f="${escA(m.id)}|nome" value="${escA(m.nome||'')}" placeholder="ex.: Go-live" style="min-width:150px">`:esc(m.nome||'')}</td>
        <td class="num">${gestor?`<input type="date" data-rp-marco-f="${escA(m.id)}|data" value="${escA(m.data||'')}">`:(m.data?dataBR(m.data):'—')}${m.atrasado?' <span class="rp-neg" data-tip="Marco vencido e ainda não faturado">⚠</span>':''}</td>
        <td class="num">${gestor?`<input type="number" data-rp-marco-f="${escA(m.id)}|pct" min="0" max="100" step="0.5" value="${m.pct}" style="width:70px">`:m.pct+'%'}</td>
        <td class="num"><b>${fmtBRL(m.valor)}</b></td><td class="num muted small">${fmtBRL(m.acum)}</td>
        <td>${gestor?`<select data-rp-marco-f="${escA(m.id)}|epico"><option value="">— nenhum —</option>${epicos.map(e=>`<option value="${escA(e.k)}" ${e.k===m.epico?'selected':''}>${esc(e.k)} · ${esc((e.resumo||'').slice(0,40))}</option>`).join('')}${m.epico&&!ep?`<option value="${escA(m.epico)}" selected>${esc(m.epico)}</option>`:''}</select>`:(m.epico?`<b>${esc(m.epico)}</b>`:'<span class="muted">—</span>')}${ep?`<div class="muted small">${esc(ep.status||'')} · ${Math.round(ep.pct||0)}% dos itens${ep.fim?` · limite ${dataBR(ep.fim)}`:''}</div>`:''}</td>
        <td>${m.fat?`<span class="ct-sem ok">faturado${m.faturadoEm?' '+dataBR(m.faturadoEm):''}</span>`:(m.atrasado?'<span class="ct-sem crit">vencido</span>':'<span class="ct-sem na">previsto</span>')}</td>
        <td>${gestor?`<button class="btn rt-step" data-rp-marco-fat="${escA(m.id)}">${m.fat?'↩ desfazer':'✓ faturado'}</button> <button class="btn rt-step" data-rp-marco-rm="${escA(m.id)}" data-tip="Tirar este marco">✕</button>`:''}</td></tr>`; }).join('');
    const add=gestor?`<div class="pl-grid" style="margin-top:8px"><div class="campo"><label>Novo marco</label><input type="text" id="rp-marco-nome" placeholder="ex.: Aceite da fase Explore" style="min-width:200px"></div>
      <div class="campo"><label>Data</label><input type="date" id="rp-marco-data"></div>
      <div class="campo"><label>% do valor</label><input type="number" id="rp-marco-pct" min="0" max="100" step="0.5" placeholder="${Math.max(0,100-M.pctTot)}" style="width:80px"></div>
      <div class="campo"><label>Épico (opcional)</label><select id="rp-marco-epico"><option value="">— nenhum —</option>${epicos.map(e=>`<option value="${escA(e.k)}">${esc(e.k)} · ${esc((e.resumo||'').slice(0,40))}${e.fim?` · ${dataBR(e.fim)}`:''}</option>`).join('')}</select></div>
      <div class="campo"><label>&nbsp;</label><button class="btn primario" id="rp-marco-add">＋ Adicionar marco</button></div>
      ${epicos.length?`<div class="campo"><label>&nbsp;</label><button class="btn" id="rp-marco-epicos" data-tip="Cria um marco por épico do projeto, com a Data limite do épico e o valor dividido igualmente">⚡ Um marco por épico (${epicos.length})</button></div>`:''}</div>`:'';
    // curva: faturamento acumulado × custo acumulado (previsto e realizado)
    let fa=0, ca=0, ra=0; const serieF=[{nome:'Faturamento previsto (acum.)',cor:cores.grafite,vals:c.meses.map(m=>{ fa+=c.receitaPorMes[m]; return {x:m,v:Math.round(fa)}; }),tipo:'line'},
      {nome:'Custo previsto (acum.)',cor:cores.cerceta,vals:c.meses.map(m=>{ ca+=c.porMes[m].custo; return {x:m,v:Math.round(ca)}; }),tipo:'area'}];
    if(real) serieF.push({nome:'Custo realizado (acum.)',cor:cores.amarelo,vals:c.meses.filter(m=>m<=real.ate.slice(0,7)).map(m=>{ ra+=real.porMes[m].custo; return {x:m,v:Math.round(ra)}; }),tipo:'line'});
    tipoHtml=`<section class="rm-bloco"><h3 class="mp-h3">🧾 Marcos de faturamento <span class="mp-dim">${M.lista.length} marco(s) · ${M.pctTot}% do valor · faturado ${fmtBRL(M.faturado)} · a faturar ${fmtBRL(M.aFaturar)}</span></h3>
      ${M.pctTot&&M.pctTot!==100?`<div class="aviso">⚠ Os marcos somam <b>${M.pctTot}%</b> do valor do projeto — ajuste os percentuais para fechar em 100%.</div>`:''}
      <div class="scroll-x"><table class="mp-tab-mini rp-marcos"><thead><tr><th>Marco</th><th class="num">Data</th><th class="num">%</th><th class="num">Valor</th><th class="num">Acumulado</th><th>Épico do Jira</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows||`<tr><td colspan="8" class="mp-dim">Nenhum marco ainda${gestor?' — cadastre abaixo (ou gere um por épico).':'.'}</td></tr>`}</tbody></table></div>${add}
      <div class="rm-2col" style="margin-top:12px"><div><div class="mp-h3">Faturamento × custo (acumulado)</div>${tsChart(serieF,{fmt:v=>fmtBRL(v),xlabel:x=>labelMesAbbr(x),h:190})}</div>
        <div><div class="mp-h3">Como ler</div><div class="muted small">A linha do <b>faturamento</b> sobe a cada marco; a área do <b>custo previsto</b> sobe todo mês com a alocação. Quando o custo acumulado passa o faturamento acumulado, o projeto está <b>financiando o cliente</b> — antecipe um marco ou renegocie. Marcos ligados a um <b>épico</b> mostram o andamento dele (% dos itens) e a data limite, direto do Jira.</div></div></div>
      ${ctExpl('<b>Marcos de faturamento</b> = quando e quanto do valor do projeto é faturado (ex.: 30% no kick-off, 40% no aceite do Realize, 30% no go-live). Marque <b>✓ faturado</b> quando emitir a nota — o KPI "Faturado × a faturar" e a rentabilidade real usam isso. O <b>valor-hora efetivo</b> é o valor do projeto ÷ horas vendidas: compare com a sua hora de tabela.')}</section>`;
  } else {
    let ca=0, ra=0; const serieO=[{nome:'Orçamento',cor:cores.grafite,vals:c.meses.map(m=>({x:m,v:Math.round(c.orc)})),tipo:'line',dash:1},
      {nome:'Custo previsto (acum.)',cor:cores.cerceta,vals:c.meses.map(m=>{ ca+=c.porMes[m].custo; return {x:m,v:Math.round(ca)}; }),tipo:'area'}];
    if(real) serieO.push({nome:'Custo realizado (acum.)',cor:cores.amarelo,vals:c.meses.filter(m=>m<=real.ate.slice(0,7)).map(m=>{ ra+=real.porMes[m].custo; return {x:m,v:Math.round(ra)}; }),tipo:'line'});
    let acc=0, accR=0; const mesAtual=hojeSP().slice(0,7);
    const rows=c.meses.map(m=>{ acc+=c.porMes[m].custo; const rr=real&&m<=mesAtual?real.porMes[m].custo:null; if(rr!=null) accR+=rr;
      return `<tr class="${m===mesAtual?'rm-destaque':''}"><td><b>${esc(labelMesAbbr(m))}</b></td><td class="num">${rpH(c.porMes[m].exec+c.porMes[m].gestao)}</td><td class="num">${fmtBRL(c.porMes[m].custo)}</td><td class="num">${fmtBRL(acc)}</td><td class="num">${c.orc?`<span class="${acc>c.orc?'rp-neg':''}">${Math.round(acc/c.orc*100)}%</span>`:'—'}</td><td class="num">${rr==null?'—':fmtBRL(rr)}</td><td class="num">${rr==null?'':`${fmtBRL(accR)} <span class="muted small">${c.orc?Math.round(accR/c.orc*100)+'%':''}</span>`}</td></tr>`; }).join('');
    tipoHtml=`<section class="rm-bloco"><h3 class="mp-h3">🧯 Consumo do orçamento <span class="mp-dim">a alocação da equipe consome o custo global orçado</span></h3>
      <div class="rm-2col"><div>${tsChart(serieO,{fmt:v=>fmtBRL(v),xlabel:x=>labelMesAbbr(x),h:190})}</div>
        <div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Mês</th><th class="num">Horas</th><th class="num">Custo previsto</th><th class="num">Acumulado</th><th class="num">% do orçamento</th><th class="num">Realizado</th><th class="num">Acum. realizado</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      ${ctExpl('o <b>orçamento</b> é o custo global que você aceita investir neste projeto interno. A alocação (pessoa × mês, em horas por dia útil, por mês ou no total) vira <b>custo previsto</b> = horas × custo/h de cada pessoa; o <b>realizado</b> vem das horas apontadas no projeto. Se a curva do realizado sobe mais rápido que a do previsto, o orçamento acaba antes do prazo — a projeção no ritmo atual diz quando.')}</section>`;
  }
  // realizado
  let realHtml='';
  if(p.projeto){
    if(!chaveReal) realHtml='<div class="muted small">O projeto ainda não começou — o realizado aparece a partir da data de início.</div>';
    else if(estado.rentab.tempoErro[chaveReal]) realHtml=`<div class="aviso">⚠ ${esc(estado.rentab.tempoErro[chaveReal])} <button class="btn" data-rp-real-retry="${escA(chaveReal)}">Tentar de novo</button></div>`;
    else if(!real) realHtml='<div class="muted small">⏳ Lendo as horas apontadas no projeto…</div>';
    else { const ef=real.eficReal; const custoFinal=real.projCusto; const mgAte=real.receitaBase>0?rpPct(real.margemAteHoje,real.receitaBase):null;
      const mgPlano=rpPct(c.receita-real.custoFinalPlano,c.receita); const mgRitmo=custoFinal==null?null:rpPct(c.receita-custoFinal,c.receita);
      const semClasse=(m)=>m==null?'':(m>=c.meta?'good':(m>=c.meta/2?'warn':'bad'));
      const rentab=tipo==='interno'
        ?`<div class="mp-h3" style="margin-top:10px">🧯 Orçamento × realizado</div><div class="vg-hero rm-hero4">
        ${rpKpi(fmtBRL(real.custo),'Custo realizado',real.custo<=real.custoPrevAteHoje?'good':'warn',`previsto até aqui ${fmtBRL(real.custoPrevAteHoje)} · ${real.custo<=real.custoPrevAteHoje?'abaixo':'acima'} do plano`)}
        ${rpKpi(real.consumoReal==null?'—':`${Math.round(real.consumoReal*100)}%`,'Orçamento consumido',real.consumoReal==null?'':(real.consumoReal<=real.fracao+0.05?'good':(real.consumoReal<=1?'warn':'bad')),real.consumoReal==null?'sem orçamento':`${Math.round(real.fracao*100)}% do prazo decorrido · saldo ${fmtBRL(c.orc-real.custo)}`)}
        ${rpKpi(fmtBRL(real.custoFinalPlano),'Custo final (real + restante do cenário)',c.orc?(real.custoFinalPlano<=c.orc?'good':'bad'):'',c.orc?(real.custoFinalPlano<=c.orc?`sobra ${fmtBRL(c.orc-real.custoFinalPlano)}`:`estoura ${fmtBRL(real.custoFinalPlano-c.orc)}`):'sem orçamento')}
        ${rpKpi(custoFinal==null?'—':fmtBRL(custoFinal),'Custo final (no ritmo atual)',custoFinal==null||!c.orc?'':(custoFinal<=c.orc?'good':'bad'),custoFinal==null?'ainda cedo para projetar':(real.orcAcabaEm?`orçamento acaba em ${dataBR(real.orcAcabaEm)}`:(c.orc&&custoFinal<=c.orc?'cabe no orçamento':'sem orçamento')))}</div>`
        :`<div class="mp-h3" style="margin-top:10px">💰 Rentabilidade real</div><div class="vg-hero rm-hero4">
        ${rpKpi(fmtBRL(real.custo),'Custo realizado',real.custo<=real.custoPrevAteHoje?'good':'warn',`previsto até aqui ${fmtBRL(real.custoPrevAteHoje)} · ${real.custo<=real.custoPrevAteHoje?'abaixo':'acima'} do plano`)}
        ${tipo==='fechado'?rpKpi(fmtBRL(real.receitaReal),'Faturado até aqui',c.marcos.vencidos.length?'bad':'',`${c.marcos.lista.filter(m=>m.fat).length} de ${c.marcos.lista.length} marco(s) · reconhecido pro rata ${fmtBRL(real.receitaAteHoje)}`)
          :rpKpi(fmtBRL(real.receitaReal),'Receita realizada',real.receitaReal>=real.receitaAteHoje?'good':'warn',`${rpH(real.hFat)} faturáveis × ${fmtBRL(c.vh)} · prevista até aqui ${fmtBRL(real.receitaAteHoje)}`)}
        ${rpKpi(mgAte==null?'—':`${mgAte}%`,'Margem real até aqui',semClasse(mgAte),mgAte==null?'sem receita':`${fmtBRL(real.margemAteHoje)} sobre ${fmtBRL(real.receitaBase)} ${tipo==='fechado'?'reconhecidos pro rata':'de receita realizada'}`)}
        ${rpKpi(mgPlano==null?'—':`${mgPlano}%`,'Margem projetada (real + restante do cenário)',semClasse(mgPlano),`custo final ${fmtBRL(real.custoFinalPlano)} · restante previsto ${fmtBRL(real.custoRestante)}${mgRitmo==null?'':` · no ritmo atual ${mgRitmo}%`}`)}</div>`;
      realHtml=`<div class="vg-hero rm-hero4">
        ${rpKpi(rpH(real.h),'Horas realizadas até '+dataBR(real.ate),'',`${real.tickets} ticket(s)${tipo==='interno'?'':' · vendidas até aqui '+rpH(real.vendAteHoje)}`)}
        ${tipo==='interno'?rpKpi(fmtBRL(real.ritmoDia),'Custo por dia útil','',`ritmo até aqui · ${rpDiasUteis(p.inicio,real.ate)} dia(s) útil(eis)`):rpKpi(ef==null?'—':Math.round(ef*100)+'%','Eficiência real',ef==null?'':(ef<=0.8?'good':(ef<=1?'warn':'bad')),ef==null?'—':`realizado ÷ vendidas pro rata · ${real.econReal>=0?'economizou':'estourou'} ${rpH(Math.abs(real.econReal))}`)}
        ${rpKpi(rpH(real.prevAteHoje),'Previsto até aqui (cenário)',real.h<=real.prevAteHoje?'good':'warn',real.h<=real.prevAteHoje?`${rpH(real.prevAteHoje-real.h)} abaixo do plano`:`${rpH(real.h-real.prevAteHoje)} acima do plano`)}
        ${rpKpi(`${Math.round(real.fracao*100)}%`,'Prazo decorrido','',`${rpDiasUteis(p.inicio,real.ate)} de ${c.diasUteisTotal} dia(s) útil(eis)`)}</div>
      ${rentab}
        ${real.pessoas.length?`<div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Quem trabalhou</th><th class="num">Horas realizadas</th><th class="num">Planejado (cenário)</th><th class="num">Diferença</th><th class="num">Custo/h</th><th class="num">Custo realizado</th><th class="num">% das horas</th></tr></thead><tbody>${real.pessoas.map(x=>{ const pl=c.porPessoa.filter(P=>P.a===x.a).reduce((s,P)=>s+P.h,0); const dif=x.h-pl;
          return `<tr><td>${esc(x.nome)}${pl?'':' <span class="muted small">(fora do cenário)</span>'}</td><td class="num">${rpH(x.h)}</td><td class="num">${pl?rpH(pl):'—'}</td><td class="num"><span class="${dif>0?'rp-neg':'rp-pos'}">${dif>0?'+':'−'}${rpH(Math.abs(dif))}</span></td><td class="num">${fmtBRL(rpCustoH(x.a))}</td><td class="num">${fmtBRL(x.custo)}</td><td class="num">${rpPct(x.h,real.h)}%</td></tr>`; }).join('')}</tbody></table></div>`:''}`; }
  } else realHtml=`<div class="aviso">⚠ Este plano não tem <b>projeto do Jira</b> — escolha o projeto em ✏️ Dados do projeto: é ele que traz as horas realizadas para comparar com o planejado e medir a rentabilidade real.</div>`;
  // comparação de cenários
  let comp='';
  if((p.cenarios||[]).length>1){
    const rows=(p.cenarios||[]).map(x=>{ const k=rpCalc(p,x); return `<tr class="${x.id===c0.id?'rm-destaque':''}"><td><b>${esc(x.nome)}</b>${x.id===c0.id?' <span class="muted small">(ativo)</span>':''}</td><td class="num">${rpH(k.esforco)}</td><td class="num">${k.efic==null?'—':Math.round(k.efic*100)+'%'}</td><td class="num">${fmtBRL(k.custo)}</td><td class="num">${fmtBRL(k.margem)}</td><td class="num">${k.mgp==null?'—':k.mgp+'%'} ${rpSemMargem(k.mgp,k.meta)}</td><td class="num">${k.recH==null?'—':fmtBRL(k.recH)}</td><td class="num">${k.folgaH==null?'—':rpH(k.folgaH)}</td></tr>`; }).join('');
    comp=`<section class="rm-bloco"><h3 class="mp-h3">🧪 Comparação de cenários</h3><div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Cenário</th><th class="num">Esforço</th><th class="num">Eficiência</th><th class="num">Custo</th><th class="num">Margem</th><th class="num">Margem %</th><th class="num">Receita/h</th><th class="num">Folga</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }
  const avisos=[];
  if(!p.projeto) avisos.push('⚠ Este plano não tem <b>projeto do Jira</b> — a base do plano é o projeto: escolha-o em ✏️ Dados do projeto para o realizado entrar na comparação.');
  if(tipo==='horas'&&!c.vend) avisos.push('⚠ Informe a <b>carga de trabalho vendida</b> (horas por dia útil ou total) em ✏️ Dados do projeto — sem ela não há receita nem eficiência.');
  if(tipo==='horas'&&c.vend&&!c.vh) avisos.push('⚠ Informe o <b>valor da hora vendida</b> — sem ele a receita e a margem ficam em zero.');
  if(tipo==='fechado'&&!c.valorProj) avisos.push('⚠ Informe o <b>valor do projeto</b> em ✏️ Dados do projeto — é a receita do escopo fechado.');
  if(tipo==='fechado'&&c.valorProj&&!c.marcos.lista.length) avisos.push('💡 Cadastre os <b>marcos de faturamento</b> (data e % do valor) para ver quando a receita entra — dá para gerar um marco por épico do Jira.');
  if(tipo==='interno'&&!c.orc) avisos.push('⚠ Informe o <b>orçamento de custo</b> em ✏️ Dados do projeto — é ele que a alocação consome.');
  if(c.semCusto) avisos.push(`⚠ <b>${c.semCusto} pessoa(s) sem custo/h</b> neste cenário — o custo fica menor do que é. Cadastre o custo/h na 🏦 Controladoria (⚙️) ou o custo previsto da vaga em Pessoas planejadas.`);
  cont.replaceChildren(el(`<div>${cab}
    <div class="card full">
      <h3 class="mp-h3">🧪 Cenários</h3>${chips}
      ${avisos.map(a=>`<div class="aviso">${a}</div>`).join('')}
      ${hero}${sim}
      <section class="rm-bloco"><h3 class="mp-h3">🗓 Planner visual — quem faz o quê, mês a mês <span class="mp-dim">horas por pessoa e por mês; execução e gestão</span></h3>
        ${grade}
        ${ctExpl('cada célula é <b>quantas horas</b> a pessoa vai dedicar naquele mês; o <b>Total</b> redistribui igualmente pelos meses. <b>Execução</b> é o trabalho entregue; <b>Gestão</b> é o acompanhamento (o seu tempo de gestão também custa). As <b>horas vendidas</b> de cada mês são a carga por dia útil × os dias úteis do mês (feriados descontados). O rodapé compara o esforço previsto com as vendidas: <b>saldo positivo</b> é o que você economiza — e pode virar horas de um consultor mais barato. A linha <b>↳ realizado</b> sob cada pessoa são as horas que ela de fato apontou no projeto (vermelho quando passou do planejado).')}</section>
      <section class="rm-bloco"><h3 class="mp-h3">📊 Visão mensal e composição do custo</h3>
        <div class="rm-2col"><div><div class="mp-h3">Vendidas × previsto${real?' × realizado':''}</div>${tsChart(serie,{fmt:v=>rpH(v),xlabel:x=>labelMesAbbr(x),h:190})}</div>
          <div><div class="mp-h3">Alocação por mês (por pessoa)</div>${stack}</div></div>
        <div class="mp-h3" style="margin-top:12px">${tipo==='interno'?'Do orçamento ao saldo':'Da receita à margem'}</div>${cascata}
        ${ctExpl(tipo==='interno'?'o <b>orçamento</b> é o custo global aceito para o projeto interno; o custo é sempre <b>horas × custo/h de cada pessoa</b>. O <b>saldo</b> é o que sobra do orçamento depois da alocação prevista — negativo quer dizer que o plano já estoura o orçamento antes de começar.':tipo==='fechado'?'no escopo fechado a <b>receita é o valor do projeto</b>, faturado pelos marcos; o custo é sempre <b>horas × custo/h de cada pessoa</b>. <b>Eficiência</b> = esforço previsto ÷ horas vendidas (quando informadas); o <b>valor-hora efetivo</b> (valor ÷ horas vendidas) mostra quanto vale cada hora que você vendeu.':'<b>Receita</b> = horas vendidas × <b>valor da hora vendida</b>. O custo é sempre <b>horas × custo/h de cada pessoa</b> (o que o funcionário custa por hora — serve só para medir custo, nunca entra na receita). <b>Eficiência</b> = esforço previsto ÷ horas vendidas: 60% quer dizer fazer o projeto com 60% das horas que o cliente paga; o que sobra é margem ou horas para alocar alguém mais barato. <b>Folga até a meta</b> = quantas horas da pessoa mais barata do cenário ainda cabem sem a margem cair abaixo da meta.')}</section>
      ${tipoHtml}
      <section class="rm-bloco"><h3 class="mp-h3">⏱ Realizado (Clockwork) × previsto</h3>${realHtml}
        ${real?ctExpl('as horas realizadas são os apontamentos do Clockwork no projeto do Jira. <b>Eficiência real</b> = realizadas ÷ vendidas proporcionais aos dias úteis já decorridos — abaixo de 100% você está entregando mais rápido do que o cliente paga (a métrica de "sempre realizo mais rápido"). <b>Rentabilidade real</b>: o custo realizado (horas de cada pessoa × custo/h) contra o previsto até aqui; a <b>margem real até aqui</b> usa a receita pro rata; a <b>projetada</b> soma ao custo real o que o cenário ainda prevê (ou extrapola o ritmo atual).'):''}</section>
      ${comp}
    </div></div>`));
  if(r.focoCel){ const e=cont.querySelector(`[data-rp-cel="${r.focoCel}"]`); if(e){ e.focus(); try{ e.select(); }catch(x){} } r.focoCel=''; }
}
function rpCargaRot(p){ const modo=p.modoCarga||'dia';
  return modo==='total'?`${rpH(Number(p.cargaTotal)||0)} no total`:modo==='mes'?`${rpH(Number(p.cargaMes)||0)}/mês`:`${rpH(Number(p.cargaDia)||0)} por dia útil`; }
function rpFormHTML(p, novo){
  const projs=(_projetosCache||[]).slice().sort((a,b)=>(a.nome||a.key).localeCompare(b.nome||b.key,'pt'));
  const modo=p.modoCarga||'dia'; const carga=modo==='total'?(p.cargaTotal||''):modo==='mes'?(p.cargaMes||''):(p.cargaDia||''); const tipo=rpTipo(p);
  return `<div class="rp-form" data-rp-form-tipo="${tipo}">
    <h3 class="mp-h3">${novo?'＋ Novo plano de rentabilidade':'✏️ Dados do projeto'}</h3>
    <div class="pl-grid">
      <div class="campo"><label>Projeto do Jira <span class="muted">(a base do plano)</span></label><select id="rp-f-projeto"><option value="">— escolha o projeto —</option>${projs.map(x=>`<option value="${escA(x.key)}" ${p.projeto===x.key?'selected':''}>${esc(x.nome||x.key)} (${esc(x.key)})</option>`).join('')}</select>${projs.length?'':'<span class="muted small">carregando projetos do Jira…</span>'}</div>
      <div class="campo"><label>Tipo de projeto <span class="muted">(modelo de receita)</span></label><select id="rp-f-tipo">${Object.entries(RP_TIPOS).map(([k,t])=>`<option value="${k}" ${tipo===k?'selected':''}>${t[0]} ${t[1]}</option>`).join('')}</select><div class="muted small" id="rp-f-tipo-dica">${esc(RP_TIPOS[tipo][2])}</div></div>
      <div class="campo"><label>Nome do plano</label><input type="text" id="rp-f-nome" value="${escA(p.nome||'')}" placeholder="preenchido pelo projeto; ajuste se quiser" style="min-width:240px"></div>
      <div class="campo"><label>Cliente</label><input type="text" id="rp-f-cliente" value="${escA(p.cliente||'')}" placeholder="nome do cliente"></div>
      <div class="campo"><label>Início</label><input type="date" id="rp-f-inicio" value="${escA(p.inicio||'')}"></div>
      <div class="campo"><label>Fim</label><input type="date" id="rp-f-fim" value="${escA(p.fim||'')}" data-tip="Data de fim do projeto; a duração em meses é calculada a partir dela"></div>
      <div class="campo"><label>Duração (meses)</label><input type="number" id="rp-f-meses" min="1" max="${RP_MAX_MESES}" step="1" value="${escA(String(p.meses||3))}" style="width:90px" data-tip="Sem data de fim, o plano vai até o último dia do último mês"></div>
      <div class="campo" data-rp-f-so="horas fechado"><label><span data-rp-f-rot="carga">${tipo==='fechado'?'Horas vendidas (opcional)':'Carga de trabalho vendida'}</span></label><div style="display:flex;gap:6px"><input type="number" id="rp-f-carga" min="0" step="0.5" value="${escA(String(carga))}" placeholder="ex.: 8" style="width:90px"><select id="rp-f-modo"><option value="dia" ${modo==='dia'?'selected':''}>horas por dia útil</option><option value="total" ${modo==='total'?'selected':''}>horas no total</option>${modo==='mes'?'<option value="mes" selected>horas por mês (antigo)</option>':''}</select></div></div>
      <div class="campo" data-rp-f-so="horas"><label>Valor da hora vendida (R$)</label><input type="number" id="rp-f-vh" min="0" step="0.01" value="${escA(String(p.valorHora||''))}" placeholder="ex.: 220" style="width:120px"></div>
      <div class="campo" data-rp-f-so="fechado"><label>Valor do projeto (R$)</label><input type="number" id="rp-f-valor" min="0" step="0.01" value="${escA(String(p.valorProjeto||''))}" placeholder="ex.: 120000" style="width:140px"></div>
      <div class="campo" data-rp-f-so="interno"><label>Orçamento de custo (R$)</label><input type="number" id="rp-f-orc" min="0" step="0.01" value="${escA(String(p.orcamento||''))}" placeholder="ex.: 50000" style="width:140px" data-tip="Custo global que você aceita investir; a alocação da equipe consome este valor"></div>
      <div class="campo" data-rp-f-so="horas fechado"><label>Margem-meta (%)</label><input type="number" id="rp-f-meta" min="0" max="100" step="1" value="${escA(String(p.margemMeta!=null?p.margemMeta:30))}" style="width:80px"></div>
    </div>
    <div class="campo"><label>Observações</label><input type="text" id="rp-f-obs" value="${escA(p.obs||'')}" placeholder="opcional"></div>
    <div class="muted small" id="rp-f-dica" style="margin-top:6px">${rpDicaTipo(tipo)}</div>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap"><button class="btn primario" id="rp-f-salvar">${novo?'Criar plano':'Salvar dados'}</button><button class="btn" id="rp-f-cancelar">Cancelar</button></div>
    <div class="ap-fb" id="rp-f-fb" hidden></div></div>`;
}
function rpDicaTipo(tipo){
  return tipo==='fechado'?'Escopo fechado: a receita é o <b>valor do projeto</b>, faturado pelos <b>marcos</b> (cadastrados depois de criar o plano). As horas vendidas são opcionais e servem para a eficiência e o valor-hora efetivo.'
    :tipo==='interno'?'Projeto interno: não há receita — informe o <b>orçamento de custo</b> global; a alocação da equipe (por período, horas por dia útil, por mês ou no total) consome esse valor e a tela mostra saldo, consumo e projeção.'
    :'Horas vendidas = carga por dia útil × dias úteis do prazo (feriados descontados). O <b>valor da hora vendida</b> é o que o cliente paga; o custo/h de cada pessoa (Controladoria) é usado só para medir o custo. Com <b>contrato</b> no Admin, o valor-hora, as horas e o cliente são sugeridos ao escolher o projeto. A receita prevista mês a mês pode virar uma <b>cotação no Odoo</b>.';
}
// Mostra só os campos do tipo escolhido no formulário (sem redesenhar: preserva o que já foi digitado).
function rpFormAjustaTipo(){
  const sel=document.getElementById('rp-f-tipo'); const form=sel&&sel.closest('.rp-form'); if(!form) return; const tipo=RP_TIPOS[sel.value]?sel.value:'horas';
  form.setAttribute('data-rp-form-tipo',tipo);
  form.querySelectorAll('[data-rp-f-so]').forEach(c=>{ c.hidden=!c.getAttribute('data-rp-f-so').split(' ').includes(tipo); });
  const rot=form.querySelector('[data-rp-f-rot="carga"]'); if(rot) rot.textContent=tipo==='fechado'?'Horas vendidas (opcional)':'Carga de trabalho vendida';
  const d=document.getElementById('rp-f-tipo-dica'); if(d) d.textContent=RP_TIPOS[tipo][2]; const dica=document.getElementById('rp-f-dica'); if(dica) dica.innerHTML=rpDicaTipo(tipo);
}
function rpLeForm(p){
  const v=(id)=>{ const e=document.getElementById(id); return e?String(e.value).trim():''; };
  p.projeto=v('rp-f-projeto'); p.nome=v('rp-f-nome')||(p.projeto?projNome(p.projeto):''); p.cliente=v('rp-f-cliente'); p.inicio=v('rp-f-inicio')||p.inicio;
  p.tipo=RP_TIPOS[v('rp-f-tipo')]?v('rp-f-tipo'):'horas'; const fim=v('rp-f-fim'); p.fim=/^\d{4}-\d{2}-\d{2}$/.test(fim)?fim:'';
  p.meses=Math.max(1,Math.min(RP_MAX_MESES,Math.round(Number(v('rp-f-meses'))||1))); if(rpFimValido(p)) p.meses=rpMeses(p).length;   // com fim informado, a duração vem dele
  const modo=v('rp-f-modo'); p.modoCarga=modo==='total'?'total':modo==='mes'?'mes':'dia';
  const carga=Math.max(0,Number(v('rp-f-carga'))||0); if(p.modoCarga==='total') p.cargaTotal=carga; else if(p.modoCarga==='mes') p.cargaMes=carga; else p.cargaDia=carga;
  p.valorHora=Math.max(0,Number(v('rp-f-vh'))||0); p.margemMeta=Math.max(0,Math.min(100,Number(v('rp-f-meta'))||0)); p.obs=v('rp-f-obs');
  p.valorProjeto=Math.max(0,Number(v('rp-f-valor'))||0); p.orcamento=Math.max(0,Number(v('rp-f-orc'))||0); if(!Array.isArray(p.marcos)) p.marcos=[];
  if(!p.projeto) return 'Escolha o projeto do Jira — é a base do plano.'; if(!p.nome) return 'Dê um nome ao plano.'; if(!/^\d{4}-\d{2}-\d{2}$/.test(p.inicio||'')) return 'Informe a data de início.';
  if(fim&&fim<p.inicio) return 'A data de fim precisa ser depois do início.';
  if(p.tipo==='horas'){ if(!carga) return 'Informe a carga de trabalho vendida (horas por dia útil ou total).'; if(!p.valorHora) return 'Informe o valor da hora vendida.'; }
  if(p.tipo==='fechado'&&!p.valorProjeto) return 'Informe o valor do projeto (escopo fechado).';
  if(p.tipo==='interno'&&!p.orcamento) return 'Informe o orçamento de custo do projeto interno.';
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
  if(t.id==='rp-f-tipo'){ rpFormAjustaTipo(); return; }
  if(t.id==='rp-f-fim'||t.id==='rp-f-meses'||t.id==='rp-f-inicio'){   // fim ⇄ duração: um preenche o outro
    const ini=(document.getElementById('rp-f-inicio')||{}).value||''; const fim=document.getElementById('rp-f-fim'); const ms=document.getElementById('rp-f-meses'); if(!ini||!fim||!ms) return;
    if(t.id==='rp-f-meses'&&Number(ms.value)>0){ const n=Math.max(1,Math.min(RP_MAX_MESES,Math.round(Number(ms.value)))); fim.value=rpFim({inicio:ini,meses:n,fim:''}); }
    else if(fim.value&&fim.value>=ini){ ms.value=rpMeses({inicio:ini,fim:fim.value,meses:1}).length; }
    return; }
  if(t.id==='rp-f-projeto'){   // o projeto é a base: nome vem dele; a categoria sugere o tipo; contrato do Admin sugere valor-hora, horas e cliente
    const nm=document.getElementById('rp-f-nome'); if(nm&&t.value&&(!nm.value||nm.getAttribute('data-auto')==='1')){ nm.value=projNome(t.value); nm.setAttribute('data-auto','1'); }
    const st=document.getElementById('rp-f-tipo'); if(st&&t.value&&(r.novo||st.getAttribute('data-auto')==='1')){ st.value=rpTipoSugerido(t.value); st.setAttribute('data-auto','1'); rpFormAjustaTipo(); }
    const c=(cfg.contratos||[]).find(x=>x&&(x.projetos||[]).includes(t.value)); if(!c) return;
    const vh=document.getElementById('rp-f-vh'), cg=document.getElementById('rp-f-carga'), md=document.getElementById('rp-f-modo'), dica=document.getElementById('rp-f-dica');
    if(vh&&!Number(vh.value)&&Number(c.valorHora)>0) vh.value=c.valorHora;
    if(cg&&md&&(md.value!=='total'||!Number(cg.value))&&Number(c.horasContratadas)>0&&c.tipo!=='ams'&&!(Number(cg.value)>0&&md.value==='dia')){ cg.value=c.horasContratadas; md.value='total'; }
    if(dica) dica.innerHTML=`💡 Contrato <b>${esc(c.cliente||'')}</b> encontrado: ${Number(c.valorHora)>0?`valor-hora ${fmtBRL(c.valorHora)}`:'sem valor-hora'}${Number(c.horasContratadas)>0?` · ${c.horasContratadas}h contratadas`:''}. Prefere horas por dia útil? Troque o modo e informe a carga diária.`;
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
  if(t.id==='rp-sim-valor'){ p.valorProjeto=Math.max(0,Number(t.value)||0); rpSalva(p); renderRentab(); return; }
  if(t.id==='rp-sim-orc'){ p.orcamento=Math.max(0,Number(t.value)||0); rpSalva(p); renderRentab(); return; }
  if(t.id==='rp-sim-meta'){ p.margemMeta=Math.max(0,Math.min(100,Number(t.value)||0)); rpSalva(p); renderRentab(); return; }
  if(t.hasAttribute('data-rp-marco-f')){ const [id,campo]=t.getAttribute('data-rp-marco-f').split('|'); const m=rpMarcos(p).find(x=>x.id===id); if(!m) return;
    if(campo==='pct') m.pct=Math.max(0,Math.min(100,Number(t.value)||0)); else if(campo==='data') m.data=/^\d{4}-\d{2}-\d{2}$/.test(t.value)?t.value:''; else if(campo==='epico') m.epico=String(t.value||''); else m.nome=String(t.value||'').trim().slice(0,80);
    rpSalva(p); renderRentab(); return; }
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
    const modo=(document.getElementById('rp-add-modo')||{}).value||'total'; let de=(document.getElementById('rp-add-de')||{}).value||'', ate=(document.getElementById('rp-add-ate')||{}).value||''; if(de&&ate&&ate<de){ const x=de; de=ate; ate=x; }
    const al={a,papel,h:{}}; rpAloca(al,meses,rpCalc(p,c0).diasUteis,modo,h,de,ate); c0.aloc=c0.aloc||[]; c0.aloc.push(al); rpSalva(p); renderRentab(); return; }
  if(t.hasAttribute('data-rp-real-retry')){ delete r.tempoErro[t.getAttribute('data-rp-real-retry')]; renderRentab(); return; }
  // marcos de faturamento (escopo fechado)
  if(t.id==='rp-marco-add'){ const nome=((document.getElementById('rp-marco-nome')||{}).value||'').trim(); const data=(document.getElementById('rp-marco-data')||{}).value||''; const pct=Number((document.getElementById('rp-marco-pct')||{}).value); const epico=(document.getElementById('rp-marco-epico')||{}).value||'';
    if(!nome){ toast('Dê um nome ao marco.','warn'); return; } if(!/^\d{4}-\d{2}-\d{2}$/.test(data)){ toast('Informe a data do marco.','warn'); return; }
    const M=rpMarcosCalc(p,1); const resto=Math.max(0,100-M.pctTot); const pf=isNaN(pct)||pct<=0?resto:Math.max(0,Math.min(100,pct));
    rpMarcos(p).push({ id:rpId('mk'), nome:nome.slice(0,80), data, pct:Math.round(pf*100)/100, epico, status:'previsto' }); rpSalva(p); renderRentab(); return; }
  if(t.id==='rp-marco-epicos'){ const f=estado.projetos&&estado.projetos.fichas&&estado.projetos.fichas[p.projeto]; const eps=((f&&f.epicos)||[]).slice().sort((a,b)=>(a.fim||a.vencFilhos||'9999').localeCompare(b.fim||b.vencFilhos||'9999')); if(!eps.length){ toast('A ficha do projeto ainda não carregou.','warn'); return; }
    const ja=new Set(rpMarcos(p).map(m=>m.epico)); const novos=eps.filter(e=>!ja.has(e.k)); if(!novos.length){ toast('Todos os épicos já têm marco.','warn'); return; }
    const livre=Math.max(0,100-rpMarcosCalc(p,1).pctTot); const cada=Math.round(livre/novos.length*100)/100;
    novos.forEach(e=>rpMarcos(p).push({ id:rpId('mk'), nome:String(e.resumo||e.k).slice(0,80), data:e.fim||e.vencFilhos||rpFim(p), pct:cada, epico:e.k, status:e.sc==='done'?'previsto':'previsto' }));
    rpSalva(p); toast(`${novos.length} marco(s) criado(s) a partir dos épicos — ajuste datas e percentuais.`,'ok'); renderRentab(); return; }
  if(t.hasAttribute('data-rp-marco-rm')){ const id=t.getAttribute('data-rp-marco-rm'); p.marcos=rpMarcos(p).filter(m=>m.id!==id); rpSalva(p); renderRentab(); return; }
  if(t.hasAttribute('data-rp-marco-fat')){ const m=rpMarcos(p).find(x=>x.id===t.getAttribute('data-rp-marco-fat')); if(!m) return; if(m.status==='faturado'){ m.status='previsto'; delete m.faturadoEm; } else { m.status='faturado'; m.faturadoEm=hojeSP(); } rpSalva(p); renderRentab(); return; }
  // cotação no Odoo (horas abertas): uma linha por mês com o faturamento previsto
  if(t.hasAttribute('data-rp-odoo')){ rpCriaCotacaoOdoo(p, t); return; }
  if(t.hasAttribute('data-rp-odoo-limpar')){ if(!confirm('Esquecer o vínculo com a cotação do Odoo? (a cotação continua existindo lá)')) return; p.odoo=null; rpSalva(p); renderRentab(); return; }
});
// Cria no Odoo (Vendas) uma cotação em rascunho com o faturamento previsto por mês do plano de horas abertas.
// Usa a identidade do Jira da pessoa só para o servidor confirmar quem pediu; a escrita no Odoo é pela conta de serviço.
function rpCriaCotacaoOdoo(p, btn, parceiroId){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const c=rpCalc(p,rpCenario(p)); if(c.tipo!=='horas'||!(c.receita>0)){ toast('A cotação usa a receita prevista de um plano de horas abertas.','warn'); return; }
  const fb=document.getElementById('rp-odoo-fb'); const diz=(cls,html)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb '+cls; fb.innerHTML=html; } };
  const linhas=c.meses.filter(m=>c.vendPorMes[m]>0).map(m=>({ mes:m, descricao:`${p.nome||projNome(p.projeto)} — consultoria ${labelMesAbbr(m)} (${Math.round(c.vendPorMes[m]*10)/10}h × ${fmtBRL(c.vh)})`, qtd:Math.round(c.vendPorMes[m]*100)/100, unitario:c.vh }));
  if(btn){ btn.disabled=true; btn.textContent='⏳ Criando a cotação no Odoo…'; }
  fetch('/api/resumo?acao=odoo-venda',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ planoId:p.id, nome:p.nome, cliente:p.cliente, projeto:p.projeto, inicio:p.inicio, fim:rpFim(p), linhas, obs:p.obs||'', parceiroId:parceiroId||null, email:id.email, token:id.token })})
    .then(r=>r.json()).then(j=>{
      if(j&&j.ok){ p.odoo={ id:j.id, name:j.name||'', url:j.url||'', em:new Date().toISOString(), por:id.nome||id.email, total:j.total||c.receita, linhas:linhas.length }; rpSalva(p); toast(`Cotação ${j.name||''} criada no Odoo (rascunho).`,'ok'); renderRentab(); return; }
      if(j&&Array.isArray(j.escolher)&&j.escolher.length){ diz('warn',`Mais de um cliente no Odoo parece com <b>${esc(p.cliente||'')}</b> — escolha: <select id="rp-odoo-parc">${j.escolher.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select> <button class="btn primario" data-rp-odoo-parc="1">Criar com este cliente</button>`); if(btn){ btn.disabled=false; btn.textContent='🧾 Criar cotação no Odoo com o faturamento previsto'; } return; }
      diz('err',`⚠ ${esc((j&&j.erro)||'Não foi possível criar a cotação.')}${j&&j.dica?`<div class="muted small">${esc(j.dica)}</div>`:''}`); if(btn){ btn.disabled=false; btn.textContent='🧾 Criar cotação no Odoo com o faturamento previsto'; }
    }).catch(e=>{ diz('err','⚠ '+esc(humanizaErro(e))); if(btn){ btn.disabled=false; btn.textContent='🧾 Criar cotação no Odoo com o faturamento previsto'; } });
}
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='rentab') return; const t=e.target.closest&&e.target.closest('[data-rp-odoo-parc]'); if(!t) return;
  const p=rpPlano(estado.rentab.sel); const sel=document.getElementById('rp-odoo-parc'); if(!p||!sel||!souAprovador()) return;
  rpCriaCotacaoOdoo(p, document.querySelector('[data-rp-odoo]'), Number(sel.value)||null);
});
