// Jira Insights · 08 · 🏠 INÍCIO — ⚡ Ações de hoje (renderAcoes), ⏱ Apontamento do time,
// 🧭 Radar, Visão Geral executiva (renderVisao), Resumo (renderResumo), análise por IA,
// folga/ausência, drill-down por pessoa/projeto/dia.
// Reúne os dados de uma pessoa no período (para o detalhe/drill-down).
function dadosPessoa(a){
  const f=filtros(); const projs=projetosUnidos(); const pessoasNome=pessoasUnidas();
  const ft=Object.assign({}, f, {ocultar:false, pessoa:''});
  const meta=estado.tempo.meta||{}; const dias=listaDias(meta.startDate, meta.endDate); const hoje=hojeSP();
  const porDia={}, porProj={}; let tot=0, fat=0;
  (estado.tempo.worklogs||[]).forEach(w=>{
    if(w.a!==a || !passa(w.p,w.t,projs,ft)) return;
    const dia=(w.d||'').slice(0,10);
    porDia[dia]=(porDia[dia]||0)+w.s; porProj[w.p]=(porProj[w.p]||0)+w.s;
    tot+=w.s; if(w.f) fat+=w.s;
  });
  let lacuna=0;
  dias.forEach(d=>{ if(!ehUtil(d)||d===hoje||ehAusencia(a,d)||ehFeriado(d)) return;
    const s=porDia[d]||0, m=metaSegDe(a); if(s<m) lacuna+=(m-s); });
  return { nome:(pessoasNome[a]&&pessoasNome[a].nome)||a, meta, dias, porDia, porProj, tot, fat, lacuna };
}

function abrePessoa(a){
  const d=dadosPessoa(a);
  const vals=d.dias.map(x=>d.porDia[x]||0);
  const projObj={}; const projs=projetosUnidos();
  Object.keys(d.porProj).forEach(k=>{
    projObj[projNome(k)]=d.porProj[k];   // a lista mostra o NOME do projeto
  });
  const semana=['dom','seg','ter','qua','qui','sex','sáb'];
  const comH=d.dias.filter(x=>d.porDia[x]);
  const lista=comH.length ? comH.map(x=>
    `<div class="mt-item"><span>${esc(x)} <span class="muted small">(${semana[diaSemana(x)]})</span></span><span>${fmtH(d.porDia[x])}</span></div>`
    ).join('') : '<div class="muted small">Sem apontamentos no período.</div>';
  abreModal(`
    <h2>${esc(d.nome)}</h2>
    <div class="muted small">${esc(d.meta.startDate||'')} → ${esc(d.meta.endDate||'')}</div>
    <div class="det-kpis">
      <div class="kpi t"><div class="v">${fmtH(d.tot)}</div><div class="l">Horas apontadas</div></div>
      <div class="kpi t"><div class="v">${d.tot?pct(d.fat,d.tot):0}%</div><div class="l">Horas faturáveis</div></div>
      <div class="kpi w"><div class="v">${d.lacuna>0?fmtH(d.lacuna):'0h'}</div><div class="l">Horas faltantes</div></div>
    </div>
    <div class="sec">Tendência — horas por dia</div>
    ${sparkline(vals)}
    <div class="sec" style="margin-top:16px">Horas por projeto</div>
    ${Object.keys(projObj).length?barlist(projObj,fmtH,cores.cerceta,14):'<div class="muted small">Sem horas.</div>'}
    <div class="sec" style="margin-top:16px">Dias apontados</div>
    <div class="dt-list">${lista}</div>
  `);
}

// ---- Drill-down: agrega worklogs/eventos sob um predicado, herdando os filtros ----
function agregaPred(predW, predE){
  const f=filtros(); const projs=projetosUnidos(); const pessoasNome=pessoasUnidas();
  const porPessoa={}, porProjeto={}, porTipo={}, porDia={}; let tot=0, fat=0; const tickets=new Set();
  (estado.tempo.worklogs||[]).forEach(w=>{
    if(!passa(w.p,w.t,projs,f)) return; if(f.pessoa&&w.a!==f.pessoa) return;
    if(predW && !predW(w)) return;
    tot+=w.s; if(w.f) fat+=w.s;
    porPessoa[w.a]=(porPessoa[w.a]||0)+w.s; porProjeto[w.p]=(porProjeto[w.p]||0)+w.s;
    porTipo[w.t]=(porTipo[w.t]||0)+w.s; const dd=(w.d||'').slice(0,10); if(dd) porDia[dd]=(porDia[dd]||0)+w.s;
    if(w.k) tickets.add(w.k);
  });
  (estado.atividade.eventos||[]).forEach(e=>{
    if(!passa(e.p,e.t,projs,f)) return; if(f.pessoa&&e.a!==f.pessoa) return;
    if(predE && !predE(e)) return; if(e.k) tickets.add(e.k);
  });
  return { f, projs, pessoasNome, porPessoa, porProjeto, porTipo, porDia, tot, fat, tickets };
}
// Bloco padrão de um detalhe (KPIs + tendência + barras). `secoes` controla o que mostrar.
function blocoDetalhe(d, secoes){
  const projs=d.projs, pn=d.pessoasNome;
  const nomeProj=(k)=>projNome(k);   // a interface mostra o NOME do projeto
  const pessoasBar=()=>{
    const ent=Object.entries(d.porPessoa).sort((a,b)=>b[1]-a[1]).slice(0,12);
    const max=Math.max(1,...ent.map(e=>e[1]));
    if(!ent.length) return '<div class="muted small">Sem horas no recorte.</div>';
    return `<div class="barlist anima">`+ent.map(([a,v])=>{ const nm=(pn[a]&&pn[a].nome)||a;
      return `<div class="barrow" data-pessoa="${escA(a)}" data-tip="${escA(nm)}" data-tip2="${escA(fmtH(v))}" data-tipk="clique para ver a pessoa">
        <div class="nome">${esc(nm)}</div>
        <div class="track"><div class="fill" style="width:${Math.max(2,v/max*100)}%;background:${cores.cerceta}"></div></div>
        <div class="val">${fmtH(v)}</div></div>`; }).join('')+`</div>`;
  };
  const meta=estado.tempo&&estado.tempo.meta||{};
  const vals=listaDias(meta.startDate,meta.endDate).map(x=>d.porDia[x]||0);
  let html=`<div class="det-kpis">
    <div class="kpi t"><div class="v">${fmtH(d.tot)}</div><div class="l">Horas apontadas</div></div>
    <div class="kpi t"><div class="v">${d.tot?pct(d.fat,d.tot):0}%</div><div class="l">Horas faturáveis</div></div>
    <div class="kpi a"><div class="v">${d.tickets.size}</div><div class="l">Tickets</div></div>
  </div>`;
  if(secoes.includes('trend') && vals.some(v=>v)) html+=`<div class="sec">Tendência — horas por dia</div>${sparkline(vals)}`;
  if(secoes.includes('pessoa')) html+=`<div class="sec" style="margin-top:16px">Por pessoa</div>${pessoasBar()}`;
  if(secoes.includes('projeto')) html+=`<div class="sec" style="margin-top:16px">Por projeto</div>${barlist(d.porProjeto,fmtH,cores.cerceta,10,nomeProj,nomeProj,{drill:(k)=>({type:'projeto',key:k})})}`;
  if(secoes.includes('tipo')) html+=`<div class="sec" style="margin-top:16px">Por tipo</div>${barlist(d.porTipo,fmtH,cores.roxo,10,null,null,{drill:(k)=>({type:'tipo',key:k})})}`;
  return html;
}
const _periodoRotulo=()=>{ const m=estado.tempo&&estado.tempo.meta||{}; return `${m.startDate||''} → ${m.endDate||''}`; };
function abreProjeto(p){
  const projs=projetosUnidos(); const nome=(projs[p]&&projs[p].nome)?projs[p].nome:p;
  const d=agregaPred(w=>w.p===p, e=>e.p===p);
  abreModal(`<h2>${esc(projNome(p))}</h2><div class="muted small">Projeto ${esc(p)} · ${esc(_periodoRotulo())}</div>
    ${blocoDetalhe(d,['trend','pessoa','tipo'])}`);
}
function abreCategoria(c){
  const projs=projetosUnidos(); const cat=(p)=>(projs[p]&&projs[p].categoria)||'Sem categoria';
  const d=agregaPred(w=>cat(w.p)===c, e=>cat(e.p)===c);
  abreModal(`<h2>${esc(c)}</h2><div class="muted small">Categoria · ${esc(_periodoRotulo())}</div>
    ${blocoDetalhe(d,['trend','projeto','pessoa'])}`);
}
function abreTipo(tp){
  const d=agregaPred(w=>w.t===tp, e=>e.t===tp);
  abreModal(`<h2>${esc(tp)}</h2><div class="muted small">Tipo de issue · ${esc(_periodoRotulo())}</div>
    ${blocoDetalhe(d,['trend','pessoa','projeto'])}`);
}
function abreDia(dia){
  const semana=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
  const fer=nomeFeriado(dia);
  const d=agregaPred(w=>(w.d||'').slice(0,10)===dia, e=>(e.d||'').slice(0,10)===dia);
  abreModal(`<h2>${esc(dia)}</h2><div class="muted small">${esc(semana[diaSemana(dia)])}${fer?(' · feriado: '+esc(fer)):''}</div>
    ${blocoDetalhe(d,['pessoa','projeto','tipo'])}`);
}
function abreMes(ym){
  const [y,mm]=ym.split('-');
  const d=agregaPred(w=>(w.d||'').slice(0,7)===ym, e=>(e.d||'').slice(0,7)===ym);
  abreModal(`<h2>${esc(MESES_PT[(+mm)-1]||ym)} ${esc(y)}</h2><div class="muted small">Apontamentos do mês</div>
    ${blocoDetalhe(d,['pessoa','projeto','tipo'])}`);
}
function drill(type,key){
  if(type==='projeto') abreProjeto(key);
  else if(type==='categoria') abreCategoria(key);
  else if(type==='tipo') abreTipo(key);
  else if(type==='dia') abreDia(key);
  else if(type==='mes') abreMes(key);
}

// ======================= VISÃO GERAL EXECUTIVA =======================
// Tela executiva: uma pergunta de gestão por bloco, com acesso direto ao detalhe.
// (AMS/receita ficam fora daqui — são exclusivos da aba AMS & Governança.)
// ============== AÇÕES DE HOJE — tela inicial de comando ==============
// Seis pontos de atenção com quantidade, severidade, variação vs. o último dia
// visto (histórico local) e "Ver casos" abrindo a tela certa já filtrada.
function axCarregaVenc(forca){
  const ax=estado.acoes; ax.carregando=true; ax.erro='';
  const ate=somaDias(hojeSP(),30);
  fetch(`/api/vencimentos?ate=${encodeURIComponent(ate)}&incluirSemVenc=1${forca?'&nocache=1':''}`)
    .then(r=>r.json()).then(j=>{ ax.carregando=false;
      if(j.erro){ ax.erro=humanizaErro(j.erro); } else ax.venc=j;
      if(estado.vista==='acoes') renderAcoes();
    }).catch(e=>{ ax.carregando=false; ax.erro=humanizaErro(e); if(estado.vista==='acoes') renderAcoes(); });
}
function axCarregaMes(){
  const ax=estado.acoes; ax.mesCarr=true; ax.mesErro='';
  const hoje=hojeSP(); const ini=hoje.slice(0,8)+'01';
  fetch(`/api/tempo?desde=${encodeURIComponent(ini)}&ate=${encodeURIComponent(hoje)}`)
    .then(r=>r.json()).then(j=>{ ax.mesCarr=false;
      if(j.erro){ ax.mesErro=humanizaErro(j.erro); } else ax.mes=j.worklogs||[];
      if(estado.vista==='acoes') renderAcoes();
    }).catch(e=>{ ax.mesCarr=false; ax.mesErro=humanizaErro(e); if(estado.vista==='acoes') renderAcoes(); });
}
// ===========================================================================
// ⏱ APONTAMENTO DO TIME — hoje e nesta semana (card principal da Início)
// O objetivo nº 1 do painel é que ninguém esqueça de apontar. Este card mostra,
// PESSOA A PESSOA, quanto já foi lançado hoje e como está a semana (segunda →
// hoje), com a fita de dias para ver de relance o dia que ficou em branco.
// Busca própria (/api/tempo desde a segunda), independente do período do topo.
// ===========================================================================
function axCarregaSemana(){
  const ax=estado.acoes; ax.semCarr=true; ax.semErro='';
  const hoje=hojeSP(); const seg=semChave(hoje);
  fetch(`/api/tempo?desde=${encodeURIComponent(seg)}&ate=${encodeURIComponent(hoje)}`)
    .then(r=>r.json()).then(j=>{ ax.semCarr=false;
      if(j.erro) ax.semErro=humanizaErro(j.erro);
      else { ax.sem=j.worklogs||[]; ax.semPessoas=(j.pessoas)||{}; }
      if(estado.vista==='acoes') renderAcoes();
    }).catch(e=>{ ax.semCarr=false; ax.semErro=humanizaErro(e); if(estado.vista==='acoes') renderAcoes(); });
}
// Um dia em que a pessoa NÃO é cobrada: fim de semana, feriado, ausência
// cadastrada ou fora da vigência dela na empresa.
function axFolga(a, d){ return !ehUtil(d) || ehFeriado(d) || ehAusencia(a,d); }
function axApontResumo(){
  const ax=estado.acoes, hoje=hojeSP(), seg=semChave(hoje);
  const dias=listaDias(seg,hoje);
  const porPessoa={};
  (ax.sem||[]).forEach(w=>{ const d=String(w.d||'').slice(0,10); if(!d) return;
    (porPessoa[w.a]=porPessoa[w.a]||{})[d]=((porPessoa[w.a]||{})[d]||0)+(Number(w.s)||0); });
  const nomes=Object.assign({}, ax.semPessoas||{}, pessoasUnidas(), estado.usuarios||{});
  const elenco=new Set(Object.keys(estado.usuarios||{}));
  Object.keys(porPessoa).forEach(a=>elenco.add(a));
  const ocultos=new Set((cfg.ocultos||[]).map(o=>o.a));
  const linhas=[...elenco]
    .filter(a=>!ocultos.has(a) && !RE_EXCLUIR.test((nomes[a]&&nomes[a].nome)||''))
    // Quem já saiu (ou ainda não entrou) e não tem horas na semana sai da lista:
    // não é cobrança pendente, é gente que não está no time hoje.
    .filter(a=>!(foraVigencia(a,hoje) && !porPessoa[a]))
    .map(a=>{
      const porDia=porPessoa[a]||{}, meta=metaSegDe(a);
      const hojeSeg=porDia[hoje]||0;
      let semSeg=0, espSeg=0, ultimo='';
      const fita=dias.map(d=>{
        const s=porDia[d]||0; semSeg+=s; if(s>0) ultimo=d;
        const folga=axFolga(a,d);
        if(!folga && d!==hoje) espSeg+=meta;
        return { d, s, st: folga?'folga':(s>=meta?'ok':(s>0?'parcial':(d===hoje?'hoje':'vazio'))) };
      });
      const st = axFolga(a,hoje) ? 'folga' : (hojeSeg>=meta?'ok':(hojeSeg>0?'parcial':'vazio'));
      return { a, nome:(nomes[a]&&nomes[a].nome)||a, meta, hojeSeg, semSeg, espSeg, fita, st, ultimo,
        buracos:fita.filter(x=>x.st==='vazio').length,
        pct: espSeg>0?Math.round(semSeg/espSeg*100):null };
    });
  const eu=(idApontar()||{}).accountId||'';
  const ordem={vazio:0,parcial:1,hoje:1,ok:2,folga:3};
  linhas.sort((x,y)=> (x.a===eu?-1:y.a===eu?1:0)
    || ((ordem[x.st]||0)-(ordem[y.st]||0)) || (y.buracos-x.buracos) || x.nome.localeCompare(y.nome,'pt'));
  const cobrados=linhas.filter(l=>l.st!=='folga');
  return { hoje, seg, dias, linhas, eu,
    nOk:cobrados.filter(l=>l.st==='ok').length,
    nParcial:cobrados.filter(l=>l.st==='parcial').length,
    nVazio:cobrados.filter(l=>l.st==='vazio').length,
    nCobrados:cobrados.length,
    nBuracos:linhas.reduce((s,l)=>s+l.buracos,0),
    totHoje:linhas.reduce((s,l)=>s+l.hojeSeg,0),
    totSem:linhas.reduce((s,l)=>s+l.semSeg,0),
    espHoje:cobrados.reduce((s,l)=>s+l.meta,0),
    espSem:linhas.reduce((s,l)=>s+l.espSeg,0) };
}
// Histórico local (21 dias) para a variação "vs. dia anterior visto".
const AX_HIST_KEY='jirainsight_axhist_v1';
function axVariacao(counts){
  let hist={}; try{ hist=JSON.parse(localStorage.getItem(AX_HIST_KEY))||{}; }catch(e){}
  const hoje=hojeSP(); hist[hoje]=counts;
  const dias=Object.keys(hist).sort(); while(dias.length>21) delete hist[dias.shift()];
  try{ localStorage.setItem(AX_HIST_KEY, JSON.stringify(hist)); }catch(e){}
  const ant=Object.keys(hist).filter(d=>d<hoje).sort().pop();
  return { ant, de: ant?hist[ant]:null };
}
// ---- 🧭 Radar do dia: COMBINE informações (escopo × eventos × período) ----
// Cruza os eventos do Jira (/api/atividade, janela 7d), as horas do Clockwork e os
// vencimentos numa lista única de tickets — ex.: "meus tickets criados hoje" ou
// "tudo que o time concluiu e apontou ontem". A combinação fica salva no navegador.
const RAD_EVS=[
  ['criados','🆕 Criados','🆕 criado'],
  ['concluidos','✅ Concluídos','✅ concluído'],
  ['status','🔁 Status movidos','🔁 status'],
  ['editados','✏️ Editados','✏️ editado'],
  ['comentados','💬 Comentados','💬 comentário'],
  ['apontados','⏱ Horas apontadas',''],
  ['vencem','⏰ Vencendo',''],
];
const RAD_KEY='jirainsight_radar_v1';
function radPrefs(){
  const ax=estado.acoes;
  if(!ax.rad){
    let sv=null; try{ sv=JSON.parse(localStorage.getItem(RAD_KEY)||'null'); }catch(e){}
    ax.rad=(sv&&sv.ev)?sv:{ esc:'meus', per:'hoje', ev:{criados:1,concluidos:1} };
  }
  return ax.rad;   // sem identidade o cálculo cai para "time" (sem mutar a preferência)
}
function radSalva(){ try{ localStorage.setItem(RAD_KEY, JSON.stringify(estado.acoes.rad)); }catch(e){} }
function radGarante(){
  const ax=estado.acoes;
  if(!ax.radAtv&&!ax.radAtvB&&!ax.radAtvErro){ ax.radAtvB=true;
    fetch('/api/atividade?janela=7d').then(r=>r.json()).then(j=>{ ax.radAtvB=false;
      if(j&&!j.erro) ax.radAtv=j; else ax.radAtvErro=(j&&j.erro)||'Falha ao ler a atividade do Jira.';
      if(estado.vista==='acoes') renderAcoes();
    }).catch(e=>{ ax.radAtvB=false; ax.radAtvErro=String(e.message||e); if(estado.vista==='acoes') renderAcoes(); }); }
  if(!ax.radT&&!ax.radTB){ ax.radTB=true;
    const h=hojeSP();
    fetch(`/api/tempo?desde=${voltaDias(h,6)}&ate=${h}`).then(r=>r.json()).then(j=>{ ax.radTB=false;
      if(j&&!j.erro) ax.radT=j;
      if(estado.vista==='acoes') renderAcoes();
    }).catch(()=>{ ax.radTB=false; }); }
}
// 🆕 CARDS DE CRIAÇÃO NA HOME — leem a MESMA base do Radar (atividade de 7 dias),
// sem chamada nova: "meus tickets recém criados" (últimos meus, do mais novo para
// o mais antigo) e "criados nesta semana" (time todo, de segunda até hoje).
// ⏰ VENCIDOS POR PROJETO — usa a base de vencimentos que a Início já carrega
// (a mesma dos cards de atraso): tickets abertos com data no passado.
function vpVencidos(){
  const v=estado.acoes.venc;                       // MESMA base do card "Tickets atrasados"
  const hoje2=(v&&v.meta&&v.meta.hoje)||hojeSP();
  return ((v&&v.tickets)||[]).filter(t2=>t2.venc&&t2.venc<hoje2);
}
// Nome do projeto na base dos vencimentos (a Início nem sempre tem o catálogo).
function vpProjNome(k){
  const v=estado.acoes.venc; const p=((v&&v.projetos)||{})[k];
  const n=(p&&(p.nome||p))||'';
  return n?String(n):projNome(k);
}
function vpPorProjeto(){
  const hoje2=hojeSP(); const por={};
  vpVencidos().forEach(t2=>{
    const o=por[t2.p]=por[t2.p]||{ p:t2.p, n:0, maxAtraso:0, semHoras:0, resp:{} };
    o.n+=1;
    const dias=Math.max(0, Math.round((new Date(`${hoje2}T12:00:00Z`)-new Date(`${t2.venc}T12:00:00Z`))/86400000));
    if(dias>o.maxAtraso) o.maxAtraso=dias;
    if(!t2.seg) o.semHoras+=1;
    const r=t2.resp||'—'; o.resp[r]=(o.resp[r]||0)+1;
  });
  return Object.values(por).sort((x,y)=>y.n-x.n||y.maxAtraso-x.maxAtraso);
}
function novSemanaIni(){                    // segunda-feira desta semana (SP)
  const h=hojeSP(); const d=new Date(`${h}T12:00:00Z`).getUTCDay();
  return voltaDias(h, d===0?6:d-1);
}
function novCriados(){
  const ax=estado.acoes; const acc=(idApontar()||{}).accountId||'';
  const evs=(((ax.radAtv&&ax.radAtv.eventos))||[]).filter(e=>e.e==='criado');
  const vistos=new Set(); const lista=[];
  // um ticket aparece uma vez, pelo evento de criação mais recente
  evs.slice().sort((x,y)=>String(y.d||'').localeCompare(String(x.d||''))).forEach(e=>{
    if(vistos.has(e.k)) return; vistos.add(e.k); lista.push(e); });
  const ini=novSemanaIni();
  const naSemana=lista.filter(e=>String(e.d||'').slice(0,10)>=ini);
  return {
    meus: acc?lista.filter(e=>e.a===acc):[],
    semana: naSemana,
    meusSemana: acc?naSemana.filter(e=>e.a===acc):[],
    ini,
  };
}
function radRange(per){
  const h=hojeSP();
  if(per==='ontem'){ const o=voltaDias(h,1); return [o,o]; }   // somaDias não anda p/ trás
  if(per==='7d') return [voltaDias(h,6),h];
  return [h,h];
}
// Junta tudo por ticket no escopo/período: lista dos eventos LIGADOS + contagem
// de tickets distintos por evento (para os chips mostrarem o que existe).
function radDados(){
  const ax=estado.acoes; const rad=radPrefs(); const id=idApontar();
  const acc=(id&&id.accountId)||'';
  const [de,ate]=radRange(rad.per);
  const meu=rad.esc==='meus'&&!!acc;   // "meus" exige identidade; sem ela vale o time
  const por={}; const cont={}; RAD_EVS.forEach(([e])=>{ cont[e]=0; });
  const abre=(k,p)=>por[k]||(por[k]={k,p:p||'',evs:{},seg:0,ult:'',venc:''});
  const EV_DE={criado:'criados',concluido:'concluidos',transicao:'status',alteracao:'editados',comentario:'comentados'};
  (((ax.radAtv&&ax.radAtv.eventos))||[]).forEach(ev=>{
    const dia=String(ev.d||'').slice(0,10); if(dia<de||dia>ate) return;
    if(meu&&ev.a!==acc) return;
    const nome=EV_DE[ev.e]; if(!nome) return;
    const r=abre(ev.k,ev.p); r.evs[nome]=(r.evs[nome]||0)+1;
    if(String(ev.d)>r.ult) r.ult=String(ev.d);
  });
  (((ax.radT&&ax.radT.worklogs))||[]).forEach(w=>{
    const dia=String(w.d||'').slice(0,10); if(dia<de||dia>ate||!w.k) return;
    if(meu&&w.a!==acc) return;
    const r=abre(w.k,w.p); r.evs.apontados=(r.evs.apontados||0)+1; r.seg+=Number(w.s)||0;
    if(String(w.d||'')>r.ult) r.ult=String(w.d||'');
  });
  (((ax.venc&&ax.venc.tickets))||[]).forEach(t=>{
    if(!t.venc||t.venc<de||t.venc>ate) return;
    if(meu&&t.respId!==acc) return;
    const r=abre(t.k,t.p); r.evs.vencem=1; r.venc=t.venc;
    if(!r.ult) r.ult=t.venc;
  });
  Object.values(por).forEach(r=>{ Object.keys(r.evs).forEach(e=>{ if(cont[e]!=null) cont[e]+=1; }); });
  const ligados=RAD_EVS.map(([e])=>e).filter(e=>rad.ev[e]);
  const lista=Object.values(por).filter(r=>ligados.some(e=>r.evs[e]))
    .sort((a,b)=>String(b.ult).localeCompare(String(a.ult)));
  return {cont,lista,de,ate};
}
function renderAcoes(){
  const cont=document.getElementById('conteudo');
  const ax=estado.acoes; const hoje=hojeSP();
  if(!ax.venc && !ax.carregando && !ax.erro) axCarregaVenc(false);
  const temContratos=(cfg.contratos||[]).some(c=>c&&(Number(c.tetoMes)>0||Number(c.minMes)>0)&&(c.projetos||[]).length);
  if(temContratos && !ax.mes && !ax.mesCarr && !ax.mesErro) axCarregaMes();
  const tks=(ax.venc&&ax.venc.tickets)||null;
  // ---- contagens ----
  const nAtras = tks? tks.filter(t=>t.venc&&t.venc<hoje).length : null;
  const vh = tks? tks.filter(t=>t.venc===hoje).length : 0;
  const nSemAtu = tks? tks.filter(t=>gxDiasSemAtu(t,hoje)>5).length : null;
  const nSemResp = tks? tks.filter(t=>!t.respId).length : null;
  const nCli = tks? tks.filter(t=>/aguard|pendente.*client|waiting/i.test(t.status||'')).length : null;
  let nMeta=null, metaDet='';
  if(estado.tempo && estado.atividade){ const ts=calcTimesheet(); const comEsp=ts.linhas.filter(l=>l.esperado>0);
    const ab=comEsp.filter(l=>(l.tot/l.esperado)<0.9); nMeta=ab.length;
    metaDet=ab.length?`${ab.slice(0,3).map(l=>l.nome||'').filter(Boolean).join(' · ')}${ab.length>3?' …':''}`:`todas as ${comEsp.length} pessoas ≥ 90% no período`; }
  let nFat=null, fatDet='';
  if(!temContratos){ nFat=0; fatDet='nenhum contrato com mínimo/teto mensal no Admin'; }
  else if(ax.mesErro){ fatDet=''; }
  else if(ax.mes){
    const porProj={}; ax.mes.forEach(w=>{ if(w.f) porProj[w.p]=(porProj[w.p]||0)+(Number(w.s)||0); });
    const diaFrac=Math.min(1,(+hoje.slice(8,10))/28); const nomes=[];
    (cfg.contratos||[]).forEach(c=>{ if(!c||!(c.projetos||[]).length) return;
      const teto=Number(c.tetoMes)||0, min=Number(c.minMes)||0; if(!teto&&!min) return;
      const h=(c.projetos||[]).reduce((sm,p)=>sm+(porProj[p]||0),0)/3600;
      if(teto>0 && h>teto*0.9) nomes.push(`${c.cliente||'?'} perto do teto (${Math.round(h)}h/${teto}h)`);
      else if(min>0 && diaFrac>0.6 && h<min*diaFrac*0.7) nomes.push(`${c.cliente||'?'} abaixo do mínimo (${Math.round(h)}h; mín. ${min}h/mês)`);
    });
    nFat=nomes.length; fatDet=nomes.slice(0,2).join(' · ')||'consumo do mês dentro do esperado';
  }
  // ---- variação vs. último dia visto (só grava quando tudo carregou) ----
  const counts={atras:nAtras, meta:nMeta, sematu:nSemAtu, semresp:nSemResp, fat:nFat, cli:nCli};
  const prontos=Object.values(counts).every(v=>v!=null);
  const vInfo=prontos?axVariacao(counts):null;
  const varTag=(key)=>{ if(!vInfo||!vInfo.de||vInfo.de[key]==null) return '<span class="ax-var" title="Sem base de comparação ainda — a variação aparece a partir do próximo dia de uso">—</span>';
    const d=counts[key]-vInfo.de[key]; const tit=`vs. ${alxDataBR(vInfo.ant)}`;
    if(!d) return `<span class="ax-var" title="${escA(tit)}">= estável</span>`;
    return d>0?`<span class="ax-var up" title="${escA(tit)}">▲ +${d}</span>`:`<span class="ax-var down" title="${escA(tit)}">▼ ${d}</span>`; };
  const sev=(n,lim)=> n==null?'load':(n===0?'ok':(n>lim?'crit':'aten'));
  const CARDS=[
    { key:'atras', ic:'⏰', t:'Tickets atrasados', n:nAtras, cls:sev(nAtras,5), det: tks?`${vh} vencem hoje`:'' , goto:'atras', fonte:'jira' },
    { key:'meta', ic:'⏱', t:'Pessoas abaixo da meta', n:nMeta, cls:sev(nMeta,2), det: metaDet, goto:'meta', fonte:'clock' },
    { key:'sematu', ic:'🕓', t:'Sem atualização há +5 dias', n:nSemAtu, cls:sev(nSemAtu,8), det: tks?'sem nenhuma movimentação no Jira':'', goto:'sematu', fonte:'jira' },
    { key:'semresp', ic:'👤', t:'Tickets sem responsável', n:nSemResp, cls:sev(nSemResp,3), det: tks?'ninguém atribuído':'', goto:'semresp', fonte:'jira' },
    { key:'fat', ic:'💰', t:'Risco de faturamento', n:nFat, cls:sev(nFat,1), det: fatDet, goto:'fat', fonte:'mes' },
    { key:'cli', ic:'⏸', t:'Aguardando cliente', n:nCli, cls:sev(nCli,999), det: tks?'dependem de retorno externo':'', goto:'cli', fonte:'jira' },
  ];
  const cardHtml=(c)=>{
    let corpo;
    if(c.n==null){
      const carr = c.fonte==='clock' ? (estado.tempo?'Calculando metas…':'Carregando dados do Clockwork…')
        : c.fonte==='mes' ? (ax.mesErro?'':'Carregando as horas do mês…') : (ax.erro?'':'Carregando dados do Jira…');
      const erro = c.fonte==='clock' ? '' : c.fonte==='mes' ? ax.mesErro : ax.erro;
      corpo = erro
        ? `<div class="ax-det" style="color:#B91C1C">${esc(erro)}</div><div class="ax-foot"><button class="btn" id="${c.fonte==='mes'?'ax-mes-retry':'ax-retry'}">Tentar de novo</button></div>`
        : `<div class="ax-num muted">…</div><div class="ax-det">${esc(carr)}</div>`;
    } else {
      corpo = `<div class="ax-num">${c.n}</div><div class="ax-det">${esc(c.det||'')}</div>
        <div class="ax-foot"><button class="btn ${c.n>0?'primario':''}" data-ax-goto="${c.goto}">Ver casos →</button></div>`;
    }
    return `<div class="ax-card ${c.cls}"><div class="ax-top"><span>${c.ic}</span> ${esc(c.t)} <span class="spacer"></span>${c.n!=null?varTag(c.key):''}</div>${corpo}</div>`;
  };
  const fJira = ax.erro?'⚠ Jira com falha':(tks?'✓ Jira':'⏳ Carregando dados do Jira…');
  const fClock = estado.tempo?'✓ Clockwork':'⏳ Carregando dados do Clockwork…';
  const fMes = !temContratos?'' : ax.mesErro?'⚠ horas do mês com falha' : ax.mes?'✓ horas do mês':'⏳ calculando faturamento…';
  // Card de Novidades na tela inicial: as últimas melhorias, com destaque quando
  // ainda não foram vistas (mesma marca NOV_VER do modal ✨ Novidades).
  let novVisto=''; try{ novVisto=localStorage.getItem('jirainsight_nov_visto')||''; }catch(e){}
  const novNovas = novVisto!==NOV_VER;
  const novItens = NOVIDADES.slice(0,6).map(([d,txt])=>`<div class="nov-item">
    <span class="nov-data">${esc(d)}</span><span class="nov-txt">${txt}</span></div>`).join('');
  const cardNov = `<div class="card full" style="margin-top:14px">
    <h2>✨ Novidades ${novNovas?'<span class="nov-dot" style="margin-left:2px"></span>':''}<span>últimas melhorias do painel</span></h2>
    <div class="nov-lista" style="margin-top:6px">${novItens}</div>
    <div style="margin-top:12px"><button class="btn" data-nov-todas>Ver todas as novidades (${NOVIDADES.length})</button></div>
  </div>`;
  // ---- micro-gráficos modernos da home (SVG puro, sem libs, cores do tema) ----
  // Gauge radial de progresso vs meta (status verde/laranja SEMPRE acompanha texto).
  const hxDonut=(pct,cor)=>{ const r=24,c=2*Math.PI*r,p=Math.max(0,Math.min(100,pct));
    return `<svg class="hxg-donut" width="58" height="58" viewBox="0 0 58 58" role="img" aria-label="${p}% da meta do dia">
      <circle cx="29" cy="29" r="${r}" fill="none" style="stroke:var(--linha)" stroke-width="6"/>
      ${p?`<circle cx="29" cy="29" r="${r}" fill="none" stroke="${cor}" stroke-width="6" stroke-linecap="round"
        stroke-dasharray="${(p/100*c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 29 29)"/>`:''}
      <text x="29" y="33" text-anchor="middle" class="hxg-dtxt">${p}%</text>
    </svg>`; };
  // Bullet chart: barra do realizado + traço-alvo do planejado (escala = maior dos dois).
  const hxBullet=(realSeg,planSeg,w)=>{ const max=Math.max(realSeg,planSeg,1);
    const wR=realSeg/max*w, xP=planSeg?planSeg/max*w:null;
    const cor=planSeg&&realSeg>=planSeg?'#188918':'var(--cerceta)';
    return `<svg class="hxg-bullet" width="${w}" height="12" viewBox="0 0 ${w} 12" role="img" aria-label="realizado ${fmtH(realSeg)} de ${planSeg?fmtH(planSeg):'—'} planejadas">
      <rect x="0" y="3" width="${w}" height="6" rx="3" style="fill:var(--linha)"/>
      ${realSeg?`<rect x="0" y="3" width="${Math.max(3,wR).toFixed(1)}" height="6" rx="3" fill="${cor}"/>`:''}
      ${xP!=null?`<rect x="${Math.min(w-2.4,Math.max(0,xP-1.2)).toFixed(1)}" y="0" width="2.4" height="12" rx="1.2" style="fill:var(--grafite)"/>`:''}
    </svg>`; };
  // Colunas do ritmo diário (seg→dom): hoje em azul com rótulo direto; demais em
  // cinza-ardósia de de-ênfase; tracejado = meta/dia. Tooltip em cada coluna.
  const hxColunas=(dias,metaSeg2)=>{ const W=216,H=58,n=dias.length,slot=W/n,bw=Math.min(20,slot-8);
    const max=Math.max(metaSeg2,...dias.map(x=>x.seg),1);
    const y=(s)=>(H-12)-(s/max*(H-24));
    const ym=y(metaSeg2);
    const cols=dias.map((x,i)=>{ const cx=i*slot+slot/2;
      const top=y(x.seg), h=(H-12)-top;
      return `<g data-tip="${escA(x.rot)}" data-tip2="${escA(fmtH(x.seg)+(x.hoje?' (hoje)':''))}">
        <rect x="${(cx-slot/2+1).toFixed(1)}" y="0" width="${(slot-2).toFixed(1)}" height="${H}" fill="transparent"/>
        ${x.seg?`<rect x="${(cx-bw/2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw}" height="${Math.max(3,h).toFixed(1)}" rx="3" fill="${x.hoje?'var(--cerceta)':'#7E8E9E'}"/>`
          :`<rect x="${(cx-bw/2).toFixed(1)}" y="${H-14}" width="${bw}" height="2" rx="1" style="fill:var(--linha)"/>`}
        ${x.hoje&&x.seg?`<text x="${cx.toFixed(1)}" y="${Math.max(9,top-3).toFixed(1)}" text-anchor="middle" class="hxg-vtxt">${fmtH(x.seg)}</text>`:''}
        <text x="${cx.toFixed(1)}" y="${H-2}" text-anchor="middle" class="hxg-ctxt${x.hoje?' hoje':''}">${x.ini}</text>
      </g>`; }).join('');
    return `<svg class="hxg-cols" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <line x1="0" x2="${W}" y1="${ym.toFixed(1)}" y2="${ym.toFixed(1)}" style="stroke:var(--muted)" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/>
      ${cols}
    </svg>`; };
  // ---- 👋 SEU dia num relance (hero pessoal acionável) ----
  const id=idApontar();
  let heroHtml='';
  const pcard=(cls,ic,t,corpo,goto,btn)=>`<div class="ax-card ${cls}"><div class="ax-top"><span>${ic}</span> ${esc(t)}</div>${corpo}<div class="ax-foot"><button class="btn ${(cls==='crit'||cls==='aten')?'primario':''}" data-hx-goto="${escA(goto)}">${esc(btn)}</button></div></div>`;
  if(id&&id.accountId){
    const acc=id.accountId;
    const hSP=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hour12:false}).format(new Date()));
    const sauda=hSP<12?'Bom dia':hSP<18?'Boa tarde':'Boa noite';
    const dataExt=new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeZone:'America/Sao_Paulo'}).format(new Date());
    // ⏱ suas horas de hoje × meta
    const metaSeg=metaSegDe(acc)||8*3600;
    const meuSeg=estado.tempo?(minhasHorasPorDia()[hoje]||0):null;
    let cHoras;
    if(meuSeg==null) cHoras=pcard('load','⏱','Suas horas de hoje','<div class="ax-num muted">…</div><div class="ax-det">Carregando o Clockwork…</div>','apontar','Apontar horas →');
    else{ const falta=Math.max(0,metaSeg-meuSeg); const pc=Math.min(100,Math.round(meuSeg/metaSeg*100));
      const cls=meuSeg>=metaSeg?'ok':(pc>=50?'aten':'crit');
      cHoras=`<div class="ax-card ${cls}"><div class="ax-top"><span>⏱</span> Suas horas de hoje</div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;min-width:0">
            <div class="ax-num">${fmtH(meuSeg)} <span class="muted" style="font-size:14px;font-weight:400">de ${fmtH(metaSeg)}</span></div>
            <div class="ax-det">${falta?`faltam <b>${fmtH(falta)}</b> para a sua meta`:'meta do dia batida ✅'}</div>
          </div>
          ${hxDonut(pc, meuSeg>=metaSeg?'#188918':'#E76500')}
        </div>
        <div class="ax-foot"><button class="btn ${falta?'primario':''}" data-hx-goto="apontar">${falta?'Apontar agora →':'Ver apontamentos →'}</button></div></div>`; }
    // ⚠ meus tickets vencidos
    const meusVenc=tks?tks.filter(t=>t.respId===acc&&t.venc&&t.venc<hoje).length:null;
    const cVenc=meusVenc==null
      ?pcard('load','⚠','Meus tickets vencidos','<div class="ax-num muted">…</div><div class="ax-det">Carregando o Jira…</div>','apontar-vencidos','Ver os meus →')
      :pcard(meusVenc===0?'ok':(meusVenc>3?'crit':'aten'),'⚠','Meus tickets vencidos',
        `<div class="ax-num">${meusVenc}</div><div class="ax-det">${meusVenc?'clique para resolver — abre o Apontar já filtrado':'nada vencido no seu nome 🎉'}</div>`,
        'apontar-vencidos', meusVenc?'Resolver agora →':'Ver meus tickets →');
    // 📋 seu planejamento da semana (modelo novo: atividades no Supabase)
    const wAtual=semChave(hoje);
    mpGaranteMeu(wAtual);
    const meuPl=mpPlano(wAtual);                        // undefined = carregando
    const itensP=(meuPl&&meuPl.itens)||[];
    const planH=itensP.reduce((s,i)=>s+(Number(i.horas)||0),0);
    const stP=meuPl?meuPl.status:'';
    const stTxt=meuPl===undefined?'carregando seu planejamento…'
      :!meuPl||!itensP.length?'você ainda não planejou esta semana'
      :{elaboracao:'em elaboração — envie para aprovação', enviado:'enviado — aguardando aprovação',
        aprovado:'aprovado', devolvido:'devolvido para ajustes — corrija e reenvie'}[stP]||'';
    const cPlano=meuPl===undefined
      ?pcard('load','📋','Seu planejamento','<div class="ax-num muted">…</div><div class="ax-det">Carregando…</div>','minhasemana','Abrir Meu Planejamento →')
      :pcard(stP==='aprovado'?'ok':stP==='devolvido'?'crit':itensP.length&&stP==='enviado'?'ok':'aten','📋','Seu planejamento',
        `<div class="ax-num">${fmtHd(planH)}</div><div class="ax-det">${esc(stTxt)}</div>`,'minhasemana', itensP.length?'Abrir Meu Planejamento →':'Planejar agora →');
    // 📅 reuniões sem ticket
    if(!estado.agenda.dados && !estado.agenda.carregando && !estado.agenda.erro) carregaAgenda(false);
    const agp=agPendentes();
    const agIndisp=estado.agenda.erro||(estado.agenda.dados&&estado.agenda.dados.configurado===false);
    const cAg=agIndisp
      ?pcard('load','📅','Reuniões sem ticket','<div class="ax-num muted">—</div><div class="ax-det">Agenda do Outlook indisponível</div>','agenda','Abrir Agenda →')
      :agp==null
        ?pcard('load','📅','Reuniões sem ticket','<div class="ax-num muted">…</div><div class="ax-det">Consultando o Outlook…</div>','agenda','Abrir Agenda →')
        :pcard(agp.length===0?'ok':'aten','📅','Reuniões sem ticket',
          `<div class="ax-num">${agp.length}</div><div class="ax-det">${agp.length?'suas ou de organizador externo — crie para o time apontar':'agenda em dia ✅'}</div>`,
          'agenda', agp.length?'Criar tickets →':'Abrir Agenda →');
    // 📥 inbox
    const nIb=(typeof inboxPend==='function')?inboxPend():0;
    const cIb=pcard(nIb?'aten':'ok','📥','Suas pendências',
      `<div class="ax-num">${nIb}</div><div class="ax-det">${nIb?'convites, menções e aprovações esperando você':'caixa de entrada limpa ✅'}</div>`,'inbox', nIb?'Resolver →':'Abrir Inbox →');
    // 🗓 meus tickets SEM DATA (sem prazo não há planejamento)
    const meusSemData=tks?tks.filter(t=>t.respId===acc&&!t.venc).length:null;
    const cSemData=meusSemData==null
      ?pcard('load','🗓','Tickets sem data','<div class="ax-num muted">…</div><div class="ax-det">Carregando o Jira…</div>','apontar-semdata','Ver os meus →')
      :pcard(meusSemData===0?'ok':(meusSemData>5?'crit':'aten'),'🗓','Tickets sem data',
        `<div class="ax-num">${meusSemData}</div><div class="ax-det">${meusSemData?'sem prazo não há planejamento — clique e defina os vencimentos':'todos os seus tickets têm prazo 🎉'}</div>`,
        'apontar-semdata', meusSemData?'Definir datas →':'Ver meus tickets →');
    // ⏰ meus tickets que VENCEM HOJE
    const meusHoje=tks?tks.filter(t=>t.respId===acc&&t.venc===hoje).length:null;
    const cVHoje=meusHoje==null
      ?pcard('load','⏰','Vencem hoje','<div class="ax-num muted">…</div><div class="ax-det">Carregando o Jira…</div>','apontar-vencehoje','Ver →')
      :pcard(meusHoje===0?'ok':'aten','⏰','Vencem hoje',
        `<div class="ax-num">${meusHoje}</div><div class="ax-det">${meusHoje?'priorize estes no seu dia':'nada vencendo hoje 🎉'}</div>`,
        'apontar-vencehoje', meusHoje?'Atacar agora →':'Abrir Apontar →');
    // 🧑‍💼 PROJETOS em que estou ALOCADO nesta semana (alocação macro)
    const wFimAloc=somaDias(wAtual,6);
    const minhasAloc={};
    (cfg.alocacoes||[]).forEach(x=>{ if(x.accountId!==acc) return;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(x.inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(x.fim)) return;
      if(x.inicio<=wFimAloc&&x.fim>=wAtual) minhasAloc[x.projeto||'—']=(minhasAloc[x.projeto||'—']||0)+(Number(x.hSemana)||0); });
    const alocPs=Object.entries(minhasAloc).sort((x,y)=>y[1]-x[1]);
    const alocTotH=alocPs.reduce((s,[,h])=>s+h,0);
    const cAloc=pcard(alocPs.length?'ok':'aten','🧑‍💼','Projetos da semana',
      `<div class="ax-num">${alocPs.length}</div>
       <div class="ax-det" title="${escA(alocPs.map(([p,h])=>`${p} (${fmtHd(h)}/sem)`).join(' · '))}">${alocPs.length
         ?`${esc(alocPs.slice(0,3).map(([p])=>p).join(' · '))}${alocPs.length>3?' …':''} — ${fmtHd(alocTotH)}/sem alocadas`
         :'sem alocação macro nesta semana — combine com o gestor'}</div>`,
      'minhasemana', alocPs.length?'Planejar a semana →':'Abrir Minha Semana →');
    // 🏅 MEU RANKING de apontamento na semana (% da meta até hoje, entre o time)
    const rankDias=[]; for(let i=0;i<7;i++){ const d2=somaDias(wAtual,i); if(d2>hoje) break; rankDias.push(d2); }
    const porPessoaSem={};
    ((estado.tempo&&estado.tempo.worklogs)||[]).forEach(w2=>{ const d2=(w2.d||'').slice(0,10);
      if(d2<wAtual||d2>hoje) return; porPessoaSem[w2.a]=(porPessoaSem[w2.a]||0)+(Number(w2.s)||0); });
    const ocultosSet=new Set(cfg.ocultos||[]);
    const rankLista=Object.keys(pessoasUnidas()).filter(a2=>!ocultosSet.has(a2)).map(a2=>{
        let metaAte=0; rankDias.forEach(d2=>{ if(ehUtil(d2)&&!ehFeriado(d2)&&!ehAusencia(a2,d2)) metaAte+=metaSegDe(a2); });
        return { a:a2, pct: metaAte?((porPessoaSem[a2]||0)/metaAte):null };
      }).filter(x=>x.pct!=null).sort((x,y)=>y.pct-x.pct);
    const minhaPos=rankLista.findIndex(x=>x.a===acc);
    const meuPct=minhaPos>=0?Math.round(rankLista[minhaPos].pct*100):null;
    const cRank=!estado.tempo
      ?pcard('load','🏅','Seu ranking da semana','<div class="ax-num muted">…</div><div class="ax-det">Calculando com o Clockwork…</div>','ranking','Abrir Ranking →')
      :meuPct==null
        ?pcard('ok','🏅','Seu ranking da semana','<div class="ax-num muted">—</div><div class="ax-det">ainda sem dados do time nesta semana</div>','ranking','Abrir Ranking →')
        :pcard(meuPct>=90?'ok':(meuPct>=50?'aten':'crit'),'🏅','Seu ranking da semana',
          `<div class="ax-num">#${minhaPos+1} <span class="muted" style="font-size:14px;font-weight:400">de ${rankLista.length}</span></div>
           <div class="ax-det">${meuPct}% da meta da semana até hoje</div>`,
          'ranking','Abrir Ranking →');
    // ---- 🗓 Ponto de partida do dia: agenda de HOJE · meus tickets · plano × realizado ----
    // 📅 eventos de hoje (Outlook, já carregado para o card de pendências)
    const evsHoje=((estado.agenda.dados&&estado.agenda.dados.eventos)||[]).filter(ev=>(ev.inicio||'').slice(0,10)===hoje)
      .sort((x,y)=>String(x.inicio||'').localeCompare(String(y.inicio||'')));
    const evRow=(ev)=>{ const tk2=agTicketDe(ev.id);
      const selo=ev.privado?'<span class="badge" data-tip="Evento particular">🔒</span>'
        :(tk2?`<span class="badge com-horas" data-tip="Ticket da reunião — aponte nele">✓ ${esc(tk2.t)}</span>`
        :'<span class="badge ms-b-atra" data-tip="Reunião ainda sem ticket — crie na Agenda">⚠ sem ticket</span>');
      return `<div class="hxd-row"><span class="hxd-hora">${ev.diaTodo?'dia todo':esc((ev.inicio||'').slice(11,16))}</span>
        <span class="hxd-tit" title="${escA(ev.titulo)}">${esc(ev.titulo)}</span>${selo}
        ${ev.link?`<a class="small" href="${escA(ev.link)}" target="_blank" rel="noopener">entrar ↗</a>`:''}</div>`; };
    const blocoAgenda=`<div class="hxd-col"><h3>📅 Hoje na agenda <span class="muted small">${estado.agenda.dados?`(${evsHoje.length})`:''}</span></h3>
      ${agIndisp?'<div class="muted small">Outlook indisponível — configure na Agenda.</div>'
        :!estado.agenda.dados?'<div class="muted small">Consultando o Outlook…</div>'
        :evsHoje.length?evsHoje.slice(0,6).map(evRow).join('')+(evsHoje.length>6?`<div class="muted small" style="margin-top:4px">+ ${evsHoje.length-6} evento(s) na Agenda</div>`:'')
        :'<div class="muted small">Sem eventos hoje — dia livre para produzir 🎉</div>'}
      <div style="margin-top:8px"><button class="btn" data-hx-goto="agenda">Abrir Agenda →</button></div></div>`;
    // 🎯 tickets atribuídos a MIM (abertos), do mais urgente para o mais folgado
    const meusTk=tks?tks.filter(t=>t.respId===acc):null;
    const ordTk=(meusTk||[]).slice().sort((x,y)=>{ const vx=x.venc||'9999-12-31', vy=y.venc||'9999-12-31';
      return vx===vy?String(x.k).localeCompare(String(y.k)):(vx<vy?-1:1); });
    const tkBadge=(t)=>!t.venc?'<span class="badge" data-tip="Defina um vencimento no Apontar">sem data</span>'
      :t.venc<hoje?`<span class="badge ms-b-atra" data-tip="Vencido — reagende ou conclua">venceu ${esc(alxDataBR(t.venc))}</span>`
      :t.venc===hoje?'<span class="badge ms-b-atra" style="background:#FBF0DC;color:#8A5200" data-tip="Vence hoje">vence hoje</span>'
      :`<span class="badge">${esc(alxDataBR(t.venc))}</span>`;
    const tkRow=(t)=>`<div class="hxd-row"><a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener"><strong>${esc(t.k)}</strong> ↗</a>
      <span class="hxd-tit" title="${escA(t.resumo||'')}">${esc(t.resumo||'')}</span>${tkBadge(t)}</div>`;
    const blocoTk=`<div class="hxd-col"><h3>🎯 Meus tickets <span class="muted small">${meusTk?`(${meusTk.length} abertos)`:''}</span></h3>
      ${!tks?'<div class="muted small">Carregando o Jira…</div>'
        :ordTk.length?ordTk.slice(0,6).map(tkRow).join('')+(ordTk.length>6?`<div class="muted small" style="margin-top:4px">+ ${ordTk.length-6} ticket(s) no Apontar</div>`:'')
        :'<div class="muted small">Nenhum ticket aberto atribuído a você 🎉</div>'}
      <div style="margin-top:8px"><button class="btn" data-hx-goto="apontar-meus">Abrir no Apontar →</button></div></div>`;
    // 📊 sua semana: planejamento (Meu Planejamento) × realizado (worklogs da semana)
    const wDias=[...Array(7)].map((_,i)=>somaDias(wAtual,i));
    const hpd=minhasHorasPorDia();
    const realSemSeg=wDias.reduce((s,d)=>s+(hpd[d]||0),0);
    const planSeg=Math.round(planH*3600);
    const planPorP={}; itensP.forEach(i=>{ if(i.projeto) planPorP[i.projeto]=(planPorP[i.projeto]||0)+(Number(i.horas)||0)*3600; });
    const realPorP={}; ((estado.tempo&&estado.tempo.worklogs)||[]).forEach(w=>{ if(w.a!==acc) return;
      const d=(w.d||'').slice(0,10); if(d<wDias[0]||d>wDias[6]) return;
      realPorP[w.p||'—']=(realPorP[w.p||'—']||0)+(Number(w.s)||0); });
    const projsCmp=[...new Set([...Object.keys(planPorP),...Object.keys(realPorP)])]
      .map(p=>({p, plan:Math.round(planPorP[p]||0), real:realPorP[p]||0}))
      .sort((x,y)=>(y.plan+y.real)-(x.plan+x.real)).slice(0,4);
    const pctSem=planSeg?Math.min(100,Math.round(realSemSeg/planSeg*100)):0;
    const DIAS_INI=['S','T','Q','Q','S','S','D'];
    const diasSem=wDias.map((d,i)=>({seg:hpd[d]||0, hoje:d===hoje, ini:DIAS_INI[i], rot:alxDataBR(d)}));
    const blocoPlano=`<div class="hxd-col"><h3>📊 Sua semana: plano × realizado</h3>
      ${(itensP.length||realSemSeg)?`
        <div class="small"><b>${fmtH(realSemSeg)}</b> realizadas de <b>${fmtHd(planH)}</b> planejadas${planSeg?` <span class="muted">(${pctSem}%)</span>`:''}</div>
        <div style="margin:4px 0 6px">${hxBullet(realSemSeg,planSeg,216)}</div>
        ${hxColunas(diasSem,metaSeg)}
        <div class="muted small" style="margin:0 0 6px">seu ritmo dia a dia · tracejado = meta/dia</div>
        ${projsCmp.map(x=>`<div class="hxd-row"><span class="hxd-tit" data-tip="${escA(x.p)}">${esc(projNome(x.p))}</span>
            <span class="muted small" style="white-space:nowrap">${fmtH(x.real)} / ${x.plan?fmtH(x.plan):'—'}</span>
            ${hxBullet(x.real,x.plan,86)}</div>`).join('')}
        <div class="muted small" style="margin-top:6px">planejamento: ${esc(stTxt)}</div>`
        :'<div class="muted small">Sem planejamento nem horas nesta semana ainda — comece pelo Meu Planejamento.</div>'}
      <div style="margin-top:8px"><button class="btn" data-hx-goto="minhasemana">Abrir Meu Planejamento →</button></div></div>`;
    heroHtml=`<div class="card full">
      <h2>👋 ${esc(sauda)}, ${esc(String(id.nome||id.email).split(' ')[0])} <span>${esc(dataExt)} · seu dia num relance — tudo clicável</span></h2>
      <div class="ax-grid ax-hero" style="margin-top:8px">${cHoras}${cVenc}${cVHoje}${cSemData}${cPlano}${cAloc}${cRank}${cAg}${cIb}</div>
      <div class="hxd-grid">${blocoAgenda}${blocoTk}${blocoPlano}</div>
    </div>`;
  } else {
    heroHtml=`<div class="card full"><h2>👋 Bem-vindo(a) <span>identifique-se para ver o SEU dia num relance (horas, vencidos, plano da semana…)</span></h2>
      <div style="margin-top:8px"><button class="btn primario" data-ap-act="config-id">Identificar-se (e-mail + token do Jira)</button></div></div>`;
  }
  // ---- 🧭 Radar do dia: combinador de informações ----
  radGarante();
  const rad=radPrefs(); const rd=radDados();
  const radResumoDe=(k)=>((ax.radAtv&&ax.radAtv.resumos&&ax.radAtv.resumos[k])
    ||(ax.radT&&ax.radT.resumos&&ax.radT.resumos[k])
    ||(((tks||[]).find(t2=>t2.k===k)||{}).resumo)||'');
  const radCarr=(!ax.radAtv&&!ax.radAtvErro)||(!ax.radT&&ax.radTB);
  const radEscEf=id?rad.esc:'time';   // efetivo: sem identidade só existe "time"
  const chipsEsc=[['meus','👤 Meus'],['time','👥 Time']].map(([v,r])=>
    `<button class="chip" aria-pressed="${radEscEf===v}" data-rad-esc="${v}" ${v==='meus'&&!id?'disabled data-tip="Identifique-se para combinar as SUAS informações"':''}>${r}</button>`).join(' ');
  const chipsPer=[['hoje','Hoje'],['ontem','Ontem'],['7d','Últimos 7 dias']].map(([v,r])=>
    `<button class="chip" aria-pressed="${rad.per===v}" data-rad-per="${v}">${r}</button>`).join(' ');
  const chipsEv=RAD_EVS.map(([e,r])=>
    `<button class="chip" aria-pressed="${!!rad.ev[e]}" data-rad-ev="${e}">${r} <b>${rd.cont[e]}</b></button>`).join(' ');
  const radRow=(r)=>{
    const badges=RAD_EVS.filter(([e])=>rad.ev[e]&&r.evs[e]).map(([e,,curto])=>{
      if(e==='apontados') return `<span class="badge com-horas">⏱ ${fmtH(r.seg)}</span>`;
      if(e==='vencem') return `<span class="badge ms-b-atra">⏰ ${r.venc===hoje?'vence hoje':(r.venc<hoje?'venceu ':'vence ')+alxDataBR(r.venc)}</span>`;
      const n2=r.evs[e];
      return `<span class="badge">${curto}${n2>1?` ×${n2}`:''}</span>`;
    }).join(' ');
    const q=r.ult&&r.ult.length>10?` · ${alxDataBR(r.ult.slice(0,10))} ${esc(r.ult.slice(11,16))}`:(r.ult?` · ${alxDataBR(r.ult)}`:'');
    return `<div class="hxd-row"><a href="${jiraBase()}/browse/${encodeURIComponent(r.k)}" target="_blank" rel="noopener"><strong>${esc(r.k)}</strong> ↗</a>
      <span class="hxd-tit" title="${escA(radResumoDe(r.k))}">${esc(radResumoDe(r.k))}</span>
      ${badges}
      <span class="muted small" style="white-space:nowrap">${esc(projNome(r.p))}${q}</span>
      <button class="btn rt-step" data-gx-det="${escA(r.k)}" data-tip="Ficha completa sem abrir o Jira">🔍</button></div>`;
  };
  const radKeys=rd.lista.map(r=>r.k);
  // ---- 🆕 Meus tickets recém criados · 📅 Criados nesta semana ----
  const nv=novCriados();
  const pess=(a2)=>{ const p2=(ax.radAtv&&ax.radAtv.pessoas&&ax.radAtv.pessoas[a2]);
    return (p2&&(p2.nome||p2))||'—'; };
  const quando=(d2)=>{ const dia=String(d2||'').slice(0,10); const hm=String(d2||'').slice(11,16);
    return dia===hoje?`hoje ${hm}`:(dia===voltaDias(hoje,1)?`ontem ${hm}`:alxDataBR(dia)); };
  const linhaNov=(e2)=>`<div class="hxd-row">
    <a href="${jiraBase()}/browse/${encodeURIComponent(e2.k)}" target="_blank" rel="noopener"><strong>${esc(e2.k)}</strong> ↗</a>
    <span class="hxd-tit" title="${escA(radResumoDe(e2.k))}">${esc(radResumoDe(e2.k))}</span>
    <span class="muted small" style="white-space:nowrap">${esc(radProjNome(e2.p))} · ${esc(quando(e2.d))}</span>
    <button class="btn rt-step" data-gx-det="${escA(e2.k)}" data-tip="Ficha completa sem abrir o Jira">🔍</button></div>`;
  // por projeto e por pessoa na semana (top 4 de cada, para a leitura rápida)
  const porProjSem={}; const porPessSem={};
  nv.semana.forEach(e2=>{ porProjSem[e2.p]=(porProjSem[e2.p]||0)+1; porPessSem[e2.a]=(porPessSem[e2.a]||0)+1; });
  const radProjNome=(k)=>{ const pj=((ax.radAtv&&ax.radAtv.projetos)||{})[k];
    const n=(pj&&(pj.nome||pj))||''; return n?String(n):projNome(k); };
  const topProj=Object.entries(porProjSem).sort((x,y)=>y[1]-x[1]).slice(0,4);
  const topPess=Object.entries(porPessSem).sort((x,y)=>y[1]-x[1]).slice(0,4);
  const semIniBR=alxDataBR(nv.ini);
  // ---- ⏰ Tickets vencidos POR PROJETO (onde o atraso está concentrado) ----
  const vps=vpPorProjeto(); const vpTot=vps.reduce((x,y)=>x+y.n,0);
  const vpMax=Math.max(1,...vps.map(x=>x.n));
  const vpCarr=!estado.acoes.venc&&!estado.acoes.erro;
  const vpLinhas=vps.slice(0,8).map(o=>{
    const topResp=Object.entries(o.resp).sort((x,y)=>y[1]-x[1])[0];
    return `<div class="vp-row" data-vp-proj="${escA(o.p)}" role="button" tabindex="0"
        data-tip="${escA(`Abrir os ${o.n} vencido(s) de ${vpProjNome(o.p)} na 🛠 Gestão`)}">
      <div class="vp-nome">${esc(vpProjNome(o.p))}</div>
      <div class="vp-bar"><i style="width:${(o.n/vpMax*100).toFixed(1)}%"></i></div>
      <div class="vp-n"><b>${o.n}</b></div>
      <div class="vp-det muted small">pior atraso <b>${o.maxAtraso}d</b>${o.semHoras?` · ${o.semHoras} sem horas`:''}${topResp?` · ${esc(String(topResp[0]).split(' ')[0])} ${topResp[1]}`:''}</div></div>`;
  }).join('');
  const cardVenc=`<div class="card full" style="margin-top:14px">
    <h2>⏰ Tickets vencidos por projeto <span>onde o atraso está concentrado — clique num projeto para tratar na 🛠 Gestão</span></h2>
    ${vpCarr?'<div class="muted small" style="margin-top:8px">Carregando os vencimentos do Jira…</div>'
      :(vps.length?`<div class="ax-det" style="margin:6px 0 8px"><b>${vpTot}</b> ticket(s) vencido(s) em <b>${vps.length}</b> projeto(s)</div>
          ${vpLinhas}
          ${vps.length>8?`<div class="muted small" style="margin-top:6px">+ ${vps.length-8} projeto(s) com atraso — veja todos na 🚨 Alertas</div>`:''}
          <div class="ap-vis" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
            <button class="btn" data-vp-proj="" data-tip="Abrir TODOS os vencidos na 🛠 Gestão">🛠 abrir todos na Gestão</button>
            <button class="btn" data-hx-goto="alertas" data-tip="Central de atrasados com reprogramação em massa">🚨 Alertas</button></div>`
        :'<div class="muted small" style="margin-top:8px">✅ Nenhum ticket vencido — o time está em dia.</div>')}
  </div>`;
  const cardsNovos=`<div class="nv-cards">
    <div class="card full" style="margin:0">
      <h2>🆕 Meus tickets recém criados <span>os últimos que <b>você</b> abriu (7 dias) — clique para ver a ficha</span></h2>
      ${radCarr?'<div class="muted small" style="margin-top:8px">Lendo a atividade do Jira…</div>'
        :(nv.meus.length?`<div style="margin-top:8px">${nv.meus.slice(0,6).map(linhaNov).join('')}</div>
            <div class="ap-vis" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
              <span class="muted small">${nv.meus.length} criado(s) por você nos últimos 7 dias · ${nv.meusSemana.length} nesta semana</span>
              <span class="spacer"></span>
              <button class="btn" data-nv-gestao="meus" data-tip="Abrir todos na 🛠 Gestão para tratar em massa">🛠 abrir na Gestão</button>
              <button class="btn" data-hx-goto="planejar" data-tip="Criar mais tickets (lote, épicos, colar do Excel)">📝 criar mais</button></div>`
          :`<div class="muted small" style="margin-top:8px">${(idApontar()?'Você não criou tickets nos últimos 7 dias.':'Identifique-se para ver os seus tickets.')}</div>`)}
    </div>
    <div class="card full" style="margin:0">
      <h2>📅 Criados nesta semana <span>o time todo, de ${esc(semIniBR)} até hoje</span></h2>
      ${radCarr?'<div class="muted small" style="margin-top:8px">Lendo a atividade do Jira…</div>':`
      <div class="ax-num" style="margin-top:6px">${nv.semana.length}</div>
      <div class="ax-det">ticket(s) abertos pelo time nesta semana${nv.meusSemana.length?` · <b>${nv.meusSemana.length}</b> por você`:''}</div>
      ${topProj.length?`<div class="muted small" style="margin-top:8px"><b>Por projeto:</b> ${topProj.map(([k2,n2])=>`${esc(radProjNome(k2))} <b>${n2}</b>`).join(' · ')}${Object.keys(porProjSem).length>4?` · +${Object.keys(porProjSem).length-4}`:''}</div>`:''}
      ${topPess.length?`<div class="muted small" style="margin-top:4px"><b>Quem abriu:</b> ${topPess.map(([a2,n2])=>`${esc(String(pess(a2)).split(' ')[0])} <b>${n2}</b>`).join(' · ')}${Object.keys(porPessSem).length>4?` · +${Object.keys(porPessSem).length-4}`:''}</div>`:''}
      <div class="ap-vis" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button class="btn" data-nv-gestao="semana" data-tip="Abrir na 🛠 Gestão os tickets criados nesta semana">🛠 abrir na Gestão</button>
        <button class="btn" data-hx-goto="tickets" data-tip="Análise completa dos tickets do período">📊 análise de tickets</button></div>`}
    </div></div>`;
  // 🎫 Criação rápida: descreva em português (ou dite) e a IA monta o ticket.
  const temMic=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
  const cardTicket=`<div class="card full" style="margin-top:14px">
    <h2>🎫 Criar ticket rápido <span>descreva em português — a IA resolve projeto, épico, responsável, prazo, horas, comentário e status; você confirma a prévia</span></h2>
    <textarea id="qk-texto" class="pl-texto" style="min-height:74px;margin-top:8px" oninput="estado.qk.texto=this.value"
      placeholder='Ex.: "Crie um ticket no nome da Jéssica dentro do épico de gestão do projeto da Copel com vencimento hoje e a descrição alinhamento de estratégia; marque o Diego no comentário &quot;esse é o ticket da nossa conversa&quot;, aponte 30 minutos e passe para finalizado"'>${esc(estado.qk.texto||'')}</textarea>
    <div class="ap-vis" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">
      <button class="btn primario" id="qk-criar" ${estado.qk.criando?'disabled':''}>${estado.qk.criando?'✨ Interpretando…':'✨ Criar com IA'}</button>
      ${temMic?'<button class="btn" id="qk-mic" data-tip="Fale o pedido — o texto entra no campo (pt-BR)">🎤 Ditar</button>':''}
      <button class="btn" id="qk-siri" data-tip="Crie tickets por voz pelo celular (Atalhos da Siri) sem abrir o painel">📱 Pelo celular / Siri</button>
      <span class="spacer"></span>
      <button class="btn" data-hx-goto="planejar" data-tip="Criação completa: vários tickets, épicos, padrões e colar do Excel">📝 Criação completa</button>
      <button class="btn" data-hx-goto="ondecrio" data-tip="Não sabe o projeto certo? A árvore de decisão te leva">🌳 Onde crio?</button></div>
    <div class="muted small" style="margin-top:6px">💡 O pedido pode ser <b>acionável</b>: <b>atribuir a alguém</b> ("no nome da Jéssica"),
      <b>apontar horas</b> ("aponte 30 minutos" — sai no seu usuário), <b>comentar marcando gente</b> ("marque o Diego no comentário…")
      e <b>mudar o status</b> ("passe para finalizado"). A prévia sempre aparece antes, e você ajusta tudo lá.</div></div>`;
  const cardRadar=`<div class="card full" style="margin-top:14px">
    <h2>🧭 Radar — combine as informações <span>escopo × eventos × período — ex.: "meus tickets criados hoje" (a combinação fica salva)</span></h2>
    <div class="ap-vis" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">
      ${chipsEsc}<span class="rad-sep"></span>${chipsPer}</div>
    <div class="ap-vis" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px">${chipsEv}</div>
    ${ax.radAtvErro?`<div class="muted small" style="margin-top:8px;color:#B91C1C">${esc(ax.radAtvErro)} <button class="btn" data-rad-retry>Tentar de novo</button></div>`:''}
    ${radCarr?'<div class="muted small" style="margin-top:8px">Cruzando Jira + Clockwork…</div>':''}
    <div style="margin-top:8px">
      ${rd.lista.length?rd.lista.slice(0,12).map(radRow).join('')+(rd.lista.length>12?`<div class="muted small" style="margin-top:4px">+ ${rd.lista.length-12} ticket(s) — refine a combinação ou abra tudo na Gestão</div>`:'')
        :(radCarr||ax.radAtvErro?'':'<div class="muted small">Nenhum ticket combina com esses filtros no período — ligue outros eventos acima ou troque o período/escopo.</div>')}
    </div>
    ${rd.lista.length?`<div class="ap-vis" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn" data-rad-gestao="${escA(radKeys.slice(0,200).join(','))}" data-tip="Abre a Gestão de Tickets já filtrada por esta combinação">🛠 Abrir na Gestão (${rd.lista.length})</button>
      <button class="btn" data-rad-rateio="${escA(radKeys.slice(0,100).join(','))}" data-tip="Leva esta combinação para o ➗ Rateio: divida horas ou mude o status em conjunto">➗ Enviar para o Rateio</button>
    </div>`:''}
  </div>`;
  // ---- 🚀 atalhos descritivos ----
  const ATALHOS=[
    ['prioridades','🎯 Prioridades do time','as 5 prioridades da semana + o Modo reunião de 35 minutos'],
    ['minhasemana','📋 Meu Planejamento','planeje as atividades da semana e envie para aprovação'],
    ['apontar','⏱ Apontar','lance horas, mova status e reagende com 1 clique'],
    ['agenda','📅 Agenda','reuniões do Outlook viram tickets com convites ao time'],
    ['projetos','📁 Projetos','BI por projeto direto do Jira, com drill-down'],
    ['alocacao','🧑‍💼 Alocação (macro)','capacidade por período + validação e desvio semanal'],
    ['analytics','📈 Analytics','26 visões de governança para investigar'],
    ['gestao','🛠 Gestão de Tickets','ações em massa: atribuir, mover, reprogramar'],
    ['roadmap','🗺️ Roadmap','o que está chegando na ferramenta'],
  ];
  const atalhosHtml=`<div class="card full" style="margin-top:14px"><h2>🚀 Ir para <span>as telas mais usadas — busca completa no 🔍 (Ctrl+K)</span></h2>
    <div class="hx-atalhos">${ATALHOS.map(([v,t,d])=>`<div class="hx-atalho" data-hx-goto="${escA(v)}" role="button" tabindex="0"><b>${esc(t)}</b><span class="muted small">${esc(d)}</span></div>`).join('')}</div></div>`;
  // ⏱ Apontamento do time — o card mais importante da Início: quem já lançou as
  // horas de HOJE e como está a SEMANA de cada pessoa (segunda → hoje).
  if(!ax.sem && !ax.semCarr && !ax.semErro) axCarregaSemana();
  let cardApont;
  if(ax.semErro){
    cardApont=`<div class="card full"><h2>⏱ Apontamento do time <span>hoje e nesta semana</span></h2>
      <div class="muted small" style="margin-top:8px;color:#B91C1C">${esc(ax.semErro)}
        <button class="btn" id="apr-retry" style="margin-left:8px">Tentar de novo</button></div></div>`;
  } else if(!ax.sem){
    cardApont=`<div class="card full"><h2>⏱ Apontamento do time <span>hoje e nesta semana</span></h2>
      <div class="muted small" style="margin-top:8px">Lendo os apontamentos da semana no Clockwork…</div></div>`;
  } else {
    const ar=axApontResumo();
    const diaCurto=(d)=>['dom','seg','ter','qua','qui','sex','sáb'][diaSemana(d)];
    const rot={ok:'apontou o dia',parcial:'apontou parcialmente',vazio:'sem apontar hoje',folga:'não é cobrado(a) hoje'};
    const dica={ok:'Já bateu a meta de hoje',parcial:'Lançou menos que a meta de hoje',
      vazio:'Ainda não lançou nada hoje',folga:'Fim de semana, feriado, ausência ou fora da vigência'};
    const linha=(l)=>{
      const pcHoje=l.meta>0?Math.min(100,Math.round(l.hojeSeg/l.meta*100)):0;
      const eu=l.a===ar.eu;
      return `<div class="apr-l ${l.st}${eu?' eu':''}" data-apr-p="${escA(l.a)}" role="button" tabindex="0"
        data-tip="${escA(`${l.nome} — ${dica[l.st]}. Clique para ver o timesheet dela.`)}">
        <span class="apr-dot" aria-hidden="true"></span>
        <span class="apr-nome">${esc(l.nome)}${eu?' <b class="apr-eu">você</b>':''}</span>
        <span class="apr-hoje"><span class="apr-bar"><i style="width:${pcHoje}%"></i></span>
          <b>${l.hojeSeg?fmtH(l.hojeSeg):'—'}</b> <span class="muted">de ${fmtH(l.meta)}</span></span>
        <span class="apr-sem">${l.semSeg?`<b>${fmtH(l.semSeg)}</b>`:'<b>—</b>'}${l.espSeg?` <span class="muted">de ${fmtH(l.espSeg)}</span>`:''}
          ${l.pct!=null?`<span class="apr-pct ${l.pct>=90?'ok':(l.pct>=60?'aten':'ruim')}">${l.pct}%</span>`:''}</span>
        <span class="apr-fita">${l.fita.map(x=>`<i class="apr-d ${x.st}" data-tip="${escA(`${diaCurto(x.d)} ${x.d.slice(8,10)}/${x.d.slice(5,7)} — ${x.st==='folga'?'não é cobrado':(x.s?fmtH(x.s):'nada apontado')}`)}"></i>`).join('')}</span>
        <span class="apr-st">${esc(rot[l.st])}${l.buracos?` · <b>${l.buracos}</b> dia(s) em branco`:''}</span>
      </div>`;
    };
    const mostra=ax.semTodos?ar.linhas:ar.linhas.slice(0,8);
    const pcTime=ar.espHoje>0?Math.round(ar.totHoje/ar.espHoje*100):0;
    cardApont=`<div class="card full">
      <h2>⏱ Apontamento do time <span>hoje (${esc(alxDataBR(ar.hoje))}) e nesta semana — desde ${esc(alxDataBR(ar.seg))}</span></h2>
      <div class="apr-topo">
        <div class="apr-kpi ${ar.nVazio?'ruim':'ok'}"><b>${ar.nCobrados-ar.nVazio}/${ar.nCobrados}</b><span>já apontaram hoje</span></div>
        <div class="apr-kpi"><b>${fmtH(ar.totHoje)}</b><span>lançadas hoje${ar.espHoje?` · ${pcTime}% do esperado`:''}</span></div>
        <div class="apr-kpi"><b>${fmtH(ar.totSem)}</b><span>na semana${ar.espSem?` · de ${fmtH(ar.espSem)}`:''}</span></div>
        <div class="apr-kpi ${ar.nBuracos?'aten':'ok'}"><b>${ar.nBuracos}</b><span>dia(s) útil(eis) em branco na semana</span></div>
      </div>
      ${ar.nVazio?`<div class="aviso" style="margin-top:10px">🔴 <b>${ar.nVazio} pessoa(s) ainda não apontaram hoje</b> — ${esc(ar.linhas.filter(l=>l.st==='vazio').slice(0,4).map(l=>String(l.nome).split(' ')[0]).join(' · '))}${ar.nVazio>4?` e mais ${ar.nVazio-4}`:''}.</div>`
        :`<div class="muted small" style="margin-top:10px">✅ Todo mundo que é cobrado hoje já lançou alguma hora.</div>`}
      <div class="apr-cab"><span></span><span>Pessoa</span><span>Hoje</span><span>Semana</span><span>${esc(ar.dias.map(diaCurto).join(' '))}</span><span>Situação</span></div>
      <div class="apr-lista">${mostra.map(linha).join('')}</div>
      ${ar.linhas.length>8?`<div style="margin-top:6px"><button class="btn" id="apr-todos">${ax.semTodos?'▲ mostrar só os 8 primeiros':`▼ ver as ${ar.linhas.length} pessoas`}</button></div>`:''}
      <div class="ap-vis" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn primario" data-hx-goto="apontar" data-tip="Lançar as suas horas agora">⏱ Apontar minhas horas</button>
        <button class="btn" data-hx-goto="timesheet" data-tip="Grade completa pessoa × dia, com lacunas">📊 Timesheet completo</button>
        <button class="btn" data-hx-goto="ranking" data-tip="Ranking de apontamento e metas">🏆 Ranking</button>
        <span class="spacer"></span>
        <button class="btn" id="apr-refresh" data-tip="Reler os apontamentos da semana no Clockwork">🔄 atualizar</button>
      </div>
      <div class="muted small" style="margin-top:6px">A meta é a jornada de cada pessoa (<b>Configurações → 🎯 Metas</b>), descontando fins de semana, feriados, ausências e vigência. <b>Hoje não conta como dia em branco</b> — o dia ainda está correndo.</div>
    </div>`;
  }
  // 🌳 A árvore de decisão TAMBÉM na home — mesmo estado da vista 'ondecrio'.
  const cardArv=`<div class="card full" style="margin-top:14px">
    <h2>🌳 Onde crio meu ticket? <span>responda e crie no lugar certo — sem sair daqui</span></h2>
    <div id="arv-home">${arvHTML()}</div>
  </div>`;
  cont.replaceChildren(el(`<div>
    ${heroHtml}
    <div style="margin-top:14px">${cardApont}</div>
    ${cardTicket}
    ${cardsNovos}
    ${cardVenc}
    ${cardRadar}
    <div class="card full" style="margin-top:14px">
      <h2>🏢 Time — ações de hoje <span>${esc(alxDataBR(hoje))} · o que exige atenção agora</span></h2>
      <div class="ax-fontes"><span>${esc(fJira)}</span><span>${esc(fClock)}</span>${fMes?`<span>${esc(fMes)}</span>`:''}<span class="spacer"></span><button class="btn" data-hx-goto="visao">📊 Painel executivo completo →</button></div>
      <div class="ax-grid">${CARDS.map(cardHtml).join('')}</div>
    </div>
    ${cardArv}
    ${atalhosHtml}
    ${cardNov}</div>`));
}
// Cliques da home (hero pessoal + atalhos)
document.getElementById('conteudo').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('[data-hx-goto]'); if(!t) return;
  const g=t.getAttribute('data-hx-goto');
  if(g==='apontar-vencidos'){ estado.apontar.fil='vencidos'; estado.apontar.soMeus=true; vaiPara('apontar'); return; }
  if(g==='apontar-meus'){ estado.apontar.fil='todos'; estado.apontar.soMeus=true; vaiPara('apontar'); return; }
  if(g==='apontar-semdata'){ estado.apontar.fil='semvenc'; estado.apontar.soMeus=true; vaiPara('apontar'); return; }
  if(g==='apontar-vencehoje'){ estado.apontar.fil='vencehoje'; estado.apontar.soMeus=true; vaiPara('apontar'); return; }
  vaiPara(g);
});
// 🧭 Radar do dia — chips (escopo/período/eventos) e ações da combinação
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='acoes') return;
  // As linhas de "vencidos por projeto" são DIVs clicáveis (não botões) — por isso
  // o alvo cai para o elemento que carrega o atributo quando não há botão.
  const t=(e.target.closest&&(e.target.closest('button')||e.target.closest('[data-vp-proj]'))); if(!t) return;
  const rad=radPrefs();
  if(t.hasAttribute('data-rad-esc')){ rad.esc=t.getAttribute('data-rad-esc'); radSalva(); renderAcoes(); return; }
  if(t.hasAttribute('data-rad-per')){ rad.per=t.getAttribute('data-rad-per'); radSalva(); renderAcoes(); return; }
  if(t.hasAttribute('data-rad-ev')){ const ev=t.getAttribute('data-rad-ev');
    if(rad.ev[ev]) delete rad.ev[ev]; else rad.ev[ev]=1;
    radSalva(); renderAcoes(); return; }
  if(t.hasAttribute('data-rad-retry')){ estado.acoes.radAtvErro=''; estado.acoes.radAtv=null; renderAcoes(); return; }
  // ⏱ Apontamento do time: recarregar, expandir a lista e abrir o timesheet da pessoa
  if(t.id==='apr-retry'||t.id==='apr-refresh'){ const ax2=estado.acoes; ax2.sem=null; ax2.semErro=''; renderAcoes(); return; }
  if(t.id==='apr-todos'){ estado.acoes.semTodos=!estado.acoes.semTodos; renderAcoes(); return; }
  if(t.hasAttribute('data-rad-gestao')){ const ks=t.getAttribute('data-rad-gestao').split(',').filter(Boolean);
    const g=estado.gestao; g.soKeys=ks; g.origem='🧭 Radar do dia'; g.preset=''; g.busca=''; g.fProj=''; g.fResp=''; g.fStatus=''; g.semTrat=false;
    g.sel={}; ks.forEach(k=>{ g.sel[k]=true; });
    vaiPara('gestao'); return; }
  if(t.hasAttribute('data-nv-gestao')){
    const alvo=t.getAttribute('data-nv-gestao'); const nv2=novCriados();
    const ks=(alvo==='meus'?nv2.meus:nv2.semana).map(e2=>e2.k).slice(0,200);
    if(!ks.length){ toast('Nenhum ticket criado nesse recorte.','warn'); return; }
    const g=estado.gestao; g.soKeys=ks; g.origem=alvo==='meus'?'🆕 Meus tickets recém criados':'📅 Criados nesta semana';
    g.preset=''; g.busca=''; g.fProj=''; g.fResp=''; g.fStatus=''; g.semTrat=false;
    g.sel={}; ks.forEach(k=>{ g.sel[k]=true; });
    vaiPara('gestao'); return; }
  // ⏰ Vencidos por projeto: abre a Gestão já filtrada no projeto escolhido
  if(t.hasAttribute('data-vp-proj')){
    const pk=t.getAttribute('data-vp-proj');
    const ks=vpVencidos().filter(x=>!pk||x.p===pk).map(x=>x.k).slice(0,200);
    if(!ks.length){ toast('Nenhum vencido nesse projeto.','warn'); return; }
    const g=estado.gestao; g.soKeys=ks; g.origem=pk?`⏰ Vencidos — ${vpProjNome(pk)}`:'⏰ Tickets vencidos';
    g.preset=''; g.busca=''; g.fProj=''; g.fResp=''; g.fStatus=''; g.semTrat=false;
    g.sel={}; ks.forEach(k=>{ g.sel[k]=true; });
    vaiPara('gestao'); return; }
  if(t.hasAttribute('data-rad-rateio')){ const ks=t.getAttribute('data-rad-rateio').split(',').filter(Boolean);
    const rt=estado.rateio; rt.texto=ks.join('\n'); rt.resultados=null;
    vaiPara('rateio'); rtConfere(); return; }
});
// ⏱ Apontamento do time: clicar (ou Enter/Espaço) numa pessoa abre o Timesheet
// já filtrado nela — do "fulano não apontou" para o detalhe em um passo.
function aprAbrePessoa(a){
  const sel=document.getElementById('f-pessoa');
  if(sel && [...sel.options].some(o=>o.value===a)) sel.value=a;
  else toast('Essa pessoa não tem apontamento no período do topo — mostrando o timesheet completo.','warn');
  vaiPara('timesheet');
}
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='acoes') return;
  const l=e.target.closest&&e.target.closest('[data-apr-p]'); if(!l) return;
  aprAbrePessoa(l.getAttribute('data-apr-p'));
});
document.getElementById('conteudo').addEventListener('keydown',(e)=>{
  if(estado.vista!=='acoes'||(e.key!=='Enter'&&e.key!==' ')) return;
  const l=e.target.closest&&e.target.closest('[data-apr-p]'); if(!l) return;
  e.preventDefault(); aprAbrePessoa(l.getAttribute('data-apr-p'));
});
function renderVisao(){
  const cont=document.getElementById('conteudo');
  if(!estado.tempo || !estado.atividade){ cont.replaceChildren(el(skeletonPainel())); return; }

  // Vencimentos (alertas) sob demanda — mesmo fetch da aba Alertas.
  const a=estado.alertas;
  garanteSemHoras();
  if(!a.dados && !a.carregando && !a.erro){
    a.carregando=true;
    const ate=somaDias(hojeSP(),7);
    fetch(`/api/vencimentos?ate=${encodeURIComponent(ate)}&incluirSemVenc=1`).then(r=>r.json()).then(j=>{
      a.carregando=false; if(j.erro) a.erro=j.erro; else a.dados=j;
      if(estado.vista==='visao') renderVisao();
    }).catch(e=>{ a.carregando=false; a.erro=String(e.message||e); if(estado.vista==='visao') renderVisao(); });
  }

  const d=agrega();
  const ts=calcTimesheet();
  const totTot=ts.linhas.reduce((s,l)=>s+l.tot,0);
  const totEsp=ts.linhas.reduce((s,l)=>s+l.esperado,0);
  const pctMeta=totEsp?Math.round(totTot/totEsp*100):0;
  const comEsp=ts.linhas.filter(l=>l.esperado>0);
  const emDia=comEsp.filter(l=>Math.round(l.tot/l.esperado*100)>=90).length;
  const totalPessoas=comEsp.length;
  const precisa=ts.linhas.filter(l=>l.lacuna>0).sort((x,y)=>y.lacuna-x.lacuna).slice(0,5);

  const alertasProntos=!!a.dados;
  const alTok = a.erro ? '—' : '…';   // placeholder enquanto carrega (… ) ou se falhou ( — )
  const todos=alertasProntos?calcAlertas():[];
  const cSev={critico:0,alto:0,medio:0}; todos.forEach(x=>{ if(cSev[x.sev]!=null) cSev[x.sev]++; });
  const topAl=todos.slice(0,6);
  const tk=(a.dados&&a.dados.tickets)||[]; const hoje=hojeSP();
  const venc=tk.filter(t=>t.venc&&t.venc<hoje).length;
  const vh=tk.filter(t=>t.venc===hoje).length;
  const semResp=tk.filter(t=>!t.respId).length;

  const diasH=Object.keys(d.porDia).sort();
  const areaPts=diasH.map(x=>({x, v:d.porDia[x], drill:{type:'dia',key:x}}));

  const clsMeta=pctMeta>=90?'good':(pctMeta>=70?'warn':'bad');
  const clsDia=totalPessoas&&emDia/totalPessoas>=0.9?'good':(totalPessoas&&emDia/totalPessoas>=0.6?'warn':'bad');

  const hero=`<div class="vg-hero">
    <div class="vg-k ${clsMeta}"><div class="v">${pctMeta}%</div><div class="l">Apontamento do time</div><div class="s">${fmtH(totTot)} de ${fmtH(totEsp)}</div></div>
    <div class="vg-k"><div class="v">${fmtH(d.kpi.segTot)}</div><div class="l">Horas apontadas</div><div class="s">${d.kpi.fatPct}% de horas faturáveis</div></div>
    <div class="vg-k ${cSev.critico>0?'bad':'good'}"><div class="v">${alertasProntos?cSev.critico:alTok}</div><div class="l">Alertas críticos</div><div class="s">${alertasProntos?(cSev.alto+' altos · '+cSev.medio+' médios'):(a.erro?'indisponível':'analisando')}</div></div>
    <div class="vg-k ${clsDia}"><div class="v">${emDia}/${totalPessoas}</div><div class="l">Pessoas em dia</div><div class="s">≥ 90% da meta</div></div>
    <div class="vg-k ${(venc>0)?'bad':'good'}"><div class="v">${alertasProntos?venc:alTok}</div><div class="l">Tickets vencidos</div><div class="s">${alertasProntos?(vh+' vencem hoje'):(a.erro?'indisponível':'analisando')}</div></div>
  </div>`;

  const health=`<div class="vg-card full"><h2>🚦 Saúde da entrega <span class="lnk" data-goto="alertas">central de alertas →</span></h2>
    <div class="vg-health">
      <div class="vg-hcell ${venc>0?'bad':'good'}" data-goto="alertas"><div class="hv">${alertasProntos?venc:alTok}</div><div class="hl">Vencidos</div></div>
      <div class="vg-hcell ${vh>0?'warn':'good'}" data-goto="alertas"><div class="hv">${alertasProntos?vh:alTok}</div><div class="hl">Vencem hoje</div></div>
      <div class="vg-hcell ${semResp>0?'warn':'good'}" data-goto="alertas"><div class="hv">${alertasProntos?semResp:alTok}</div><div class="hl">Sem responsável</div></div>
      <div class="vg-hcell ${precisa.length>0?'warn':'good'}" data-goto="timesheet"><div class="hv">${precisa.length}</div><div class="hl">Abaixo da meta</div></div>
    </div></div>`;

  const miniPrecisa = precisa.length
    ? `<div class="vg-mini">${precisa.map(l=>`<div class="vg-mrow"><span data-pessoa="${esc(l.a)}" style="cursor:pointer">${esc(l.nome)}</span><span class="vg-pill r">faltam ${fmtH(l.lacuna)}</span></div>`).join('')}</div>`
    : '<div class="aviso ok">✓ Todo mundo dentro da meta no período.</div>';

  const cardApont=`<div class="vg-card"><h2>⏱ Apontamento do time <span class="lnk" data-goto="timesheet">timesheet →</span></h2>
    <div class="vg-split">${donut(pctMeta,'da meta',pctMeta>=90?cores.musgo:(pctMeta>=70?cores.amarelo:cores.err||'#BB0000'))}
      <div>${tsChart([{nome:'Horas',cor:cores.cerceta,vals:areaPts,tipo:'area'}],{fmt:fmtH,yfmt:(v)=>Math.round(v/3600)+'h',readX:(x)=>fmtBR(x),altura:'190px'})}</div></div>
    <div class="muted small" style="margin:14px 0 8px;font-weight:600">Quem mais precisa apontar</div>
    ${miniPrecisa}</div>`;

  const cardAl=`<div class="vg-card"><h2>🚨 Alertas críticos <span class="lnk" data-goto="alertas">ver todos →</span></h2>
    ${!alertasProntos ? (a.erro?'<div class="aviso">Não foi possível carregar os alertas agora. Abra a <b data-goto="alertas" style="cursor:pointer">central de alertas</b> para tentar de novo.</div>':'<div class="estado">Analisando alertas…</div>')
      : (topAl.length ? `<div class="vg-al">${topAl.map(x=>`<div class="vg-alrow"><span class="dot ${esc(x.sev)}"></span>
        <div><div class="t">${esc(x.titulo)}</div><div class="d">${esc(x.cat)}${x.detalhe?' · '+esc(x.detalhe):''}</div></div>
        ${x.link?`<a href="${x.link}" target="_blank" rel="noopener">abrir ↗</a>`:`<span class="d">${esc(x.resp||'')}</span>`}</div>`).join('')}</div>`
        : '<div class="aviso ok">✓ Nenhum alerta no momento.</div>')}</div>`;

  const cardJira=`<div class="vg-card"><h2>📈 Atividade no Jira <span>no período</span></h2>${(()=>{
    const soma=(c)=>d.pessoas.reduce((s,p)=>s+(p[c]||0),0);
    return barlist({ 'Chamados criados':soma('criado'), 'Atualizações':soma('alter'),
      'Comentários':soma('coment'), 'Transições':d.kpi.transTot,
      'Concluídos':(d.kpi.concl==null?0:d.kpi.concl) },(v)=>v,cores.amarelo,6);
  })()}</div>`;

  // 🩺 Score de saúde da entrega (0–100): média ponderada de subscores acionáveis.
  let scoreCard='';
  {
    const sApont=totEsp?Math.max(0,Math.min(100,pctMeta)):null;
    const sPrazo=alertasProntos?Math.max(0,100-Math.min(100,venc*9+vh*4)):null;
    const sAlertas=alertasProntos?Math.max(0,100-Math.min(100,cSev.critico*16+cSev.alto*7)):null;
    const comps=[['Apontamento',sApont,0.40,'timesheet'],['Prazos',sPrazo,0.30,'alertas'],
      ['Alertas',sAlertas,0.30,'alertas']].filter(c=>c[1]!=null);
    const wsum=comps.reduce((s,c)=>s+c[2],0)||1;
    const score=comps.length?Math.round(comps.reduce((s,c)=>s+c[1]*c[2],0)/wsum):null;
    const corS=score==null?cores.cerceta:(score>=80?cores.musgo:(score>=60?cores.amarelo:'#D20A0A'));
    const rot=score==null?'':(score>=80?'Saudável':(score>=60?'Atenção':'Crítico'));
    const subBars=comps.map(c=>{ const v=Math.round(c[1]); const cc=v>=80?cores.musgo:(v>=60?cores.amarelo:'#D20A0A');
      return `<div class="vg-mrow"><span class="lnk" data-goto="${c[3]}" style="cursor:pointer">${c[0]}</span>
        <span style="font-variant-numeric:tabular-nums;color:${cc};font-weight:700">${v}</span>
        <div class="bar"><i style="width:${v}%;background:${cc}"></i></div></div>`; }).join('');
    scoreCard=`<div class="vg-card full"><h2>🩺 Score de saúde da entrega ${score!=null?`<span style="margin-left:auto;color:${corS};font-weight:700">${rot} · ${score}/100</span>`:''}</h2>
      ${!alertasProntos ? '<div class="estado">Calculando o score…</div>'
        : `<div class="vg-split">${donut(score,'saúde',corS)}<div class="vg-mini" style="gap:11px">${subBars}</div></div>
           <div class="muted small" style="margin-top:10px">Combina <strong>apontamento</strong> do time, <strong>prazos</strong> (vencidos/vencem hoje) e <strong>alertas</strong> críticos. Clique num componente para ver o detalhe.</div>`}
    </div>`;
  }
  // Fluxo de atividade do Jira (feed do activity stream) — sob demanda, cache no servidor.
  const fx=estado.fluxo;
  if(!fx.dados && !fx.carregando && !fx.erro){
    fx.carregando=true;
    fetch('/api/atividade?fluxo=1').then(r=>r.json()).then(j=>{
      fx.carregando=false; if(j.erro){ fx.erro=j.erro; } else fx.dados=j.entradas||[];
      if(estado.vista==='visao') renderVisao();
    }).catch(e=>{ fx.carregando=false; fx.erro=String(e.message||e); if(estado.vista==='visao') renderVisao(); });
  }
  const tempoRel=(iso)=>{ if(!iso) return ''; const ms=Date.now()-new Date(iso).getTime(); const m=Math.round(ms/60000);
    if(m<1) return 'agora'; if(m<60) return `há ${m} min`; const h=Math.round(m/60); if(h<24) return `há ${h}h`;
    const dd=Math.round(h/24); return `há ${dd} dia${dd>1?'s':''}`; };
  let cardFluxo='';
  if(fx.erro) cardFluxo=`<div class="vg-card full"><h2>📰 Fluxo de atividade</h2><div class="muted small">${esc(fx.erro)}</div></div>`;
  else if(!fx.dados) cardFluxo=`<div class="vg-card full"><h2>📰 Fluxo de atividade</h2><div class="estado">Carregando o fluxo do Jira…</div></div>`;
  else cardFluxo=`<div class="vg-card full"><h2>📰 Fluxo de atividade <span>as últimas ações no Jira, de todo o time</span></h2>
    ${fx.dados.length?`<div class="fx-lista">${fx.dados.slice(0,20).map(e=>`<div class="fx-item">
        <span class="fx-quando" title="${escA(e.q)}">${esc(tempoRel(e.q))}</span>
        <span class="fx-txt">${e.l?`<a href="${escA(e.l)}" target="_blank" rel="noopener">${esc(e.t)}</a>`:esc(e.t)}</span>
      </div>`).join('')}</div>`:'<div class="muted small">Nenhuma atividade recente no stream.</div>'}
  </div>`;
  cont.replaceChildren(el(`<div>
    ${hero}
    ${scoreCard}
    ${health}
    <div class="vg-grid">
      ${cardApont}
      ${cardAl}
      ${cardJira}
    </div>
    ${cardFluxo}
  </div>`));
}

function renderResumo(){
  const d=agrega();
  const cont=document.getElementById('conteudo');
  const k=d.kpi;
  const nomeProjResumo=(key)=>projNome(key);   // a interface mostra o NOME do projeto

  // Meta e horas extras por pessoa (mesma base do timesheet). metaPct = horas
  // apontadas ÷ meta esperada no período. Acima de 100% NÃO é problema — sinaliza
  // que a pessoa trabalhou além do previsto. Quando a média de horas EXTRAS por
  // semana passa de 6h, oferecemos solicitar folga (compensação) no Odoo.
  const tsR=calcTimesheet();
  const porPessoaTsR={}; tsR.linhas.forEach(l=>{ porPessoaTsR[l.a]=l; });
  const semanasR=new Set();
  tsR.dias.forEach(x=>{ if(ehUtil(x)&&!ehFeriado(x)&&x!==tsR.hoje) semanasR.add(semChave(x)); });
  const nSemanasR=Math.max(1, semanasR.size);
  const nomesR=pessoasUnidas();
  const LIMITE_FOLGA=6;   // horas extras médias por semana que liberam o botão de folga
  function metaPessoa(a){
    const l=porPessoaTsR[a];
    const esperado=l?l.esperado:0, tot=l?l.tot:0;
    const pctMeta=esperado>0?Math.round(tot/esperado*100):null;
    const extraSeg=Math.max(0, tot-esperado);
    const extraSemH=(extraSeg/3600)/nSemanasR;                 // h extras médias por semana
    return { pctMeta, extraSemH, extraTotH:+(extraSeg/3600).toFixed(1), email:(nomesR[a]&&nomesR[a].email)||'' };
  }
  function celMeta(p){
    const m=metaPessoa(p.a);
    if(m.pctMeta==null) return '<td class="num"><span class="muted">—</span></td>';
    const cor=m.pctMeta>100?cores.musgo:(m.pctMeta>=90?'inherit':cores.amarelo);
    const tip=m.pctMeta>100?'Acima da meta — trabalhou mais que o previsto (não é ruim)':(m.pctMeta>=90?'Em dia com a meta':'Abaixo da meta no período');
    const folga=m.extraSemH>LIMITE_FOLGA
      ? ` <button class="chip folga-chip" data-folga="1" data-folga-a="${escA(p.a)}" data-folga-email="${escA(m.email)}" data-folga-nome="${escA(p.nome)}" data-folga-extra="${escA(String(m.extraTotH))}" data-folga-sem="${escA(m.extraSemH.toFixed(1))}" data-tip="≈ ${escA(m.extraSemH.toFixed(1))}h extras/semana — solicitar folga (compensação) no Odoo">🌴 Folga</button>`
      : '';
    return `<td class="num meta-cel"><span style="color:${cor};font-weight:700" data-tip="${escA(tip)}">${m.pctMeta}%${m.pctMeta>100?' ↑':''}</span>${folga}</td>`;
  }

  const tabela = d.pessoas.length ? `
    <table><thead><tr>
      <th>Pessoa</th><th class="num">Horas</th><th class="num">Faturável</th><th class="num">Meta</th>
      <th class="num">Tickets</th><th class="num">Alter.</th><th class="num">Transições</th><th class="num">Coment.</th>
    </tr></thead><tbody>${d.pessoas.map(p=>`
      <tr><td data-pessoa="${esc(p.a)}">${esc(p.nome)}</td><td class="num">${fmtH(p.seg)}</td>
      <td class="num">${p.seg?pct(p.segFat,p.seg):0}%</td>${celMeta(p)}
      <td class="num">${p.tickets}</td><td class="num">${p.alter}</td>
      <td class="num">${p.trans}</td><td class="num">${p.coment}</td></tr>`).join('')}
    </tbody></table>` : '<div class="estado">Sem dados para os filtros atuais.</div>';

  const totFat=d.fat.fatura+d.fat.nao;
  const split = totFat ? `
    <div class="split">
      <span style="width:${pct(d.fat.fatura,totFat)}%;background:${cores.musgo}" data-tip="Faturável" data-tip2="${escA(fmtH(d.fat.fatura))}">${pct(d.fat.fatura,totFat)}%</span>
      <span style="width:${pct(d.fat.nao,totFat)}%;background:${cores.amarelo}" data-tip="Não faturável" data-tip2="${escA(fmtH(d.fat.nao))}">${pct(d.fat.nao,totFat)}%</span>
    </div>
    <div class="legend">
      <span><i style="background:${cores.musgo}"></i>Faturável · ${fmtH(d.fat.fatura)}</span>
      <span><i style="background:${cores.amarelo}"></i>Não faturável · ${fmtH(d.fat.nao)}</span>
    </div>` : '<div class="estado">Sem horas no período.</div>';

  const dias=Object.keys(d.porDia).sort();
  const colunas = dias.length
    ? tsChart([{nome:'Horas apontadas',cor:cores.cerceta,vals:dias.map(x=>({x,v:d.porDia[x]})),tipo:'area'}],
        {fmt:fmtH,yfmt:(v)=>Math.round(v/3600)+'h',readX:(x)=>fmtBR(x),drillType:'dia',altura:'230px'})
    : '<div class="estado">Sem horas no período.</div>';

  cont.replaceChildren(el(`<div>
    <div class="kpis">
      <div class="kpi t"><div class="v">${fmtH(k.segTot)}</div><div class="l">Horas apontadas</div></div>
      <div class="kpi t"><div class="v">${k.fatPct}%</div><div class="l">Horas faturáveis</div></div>
      <div class="kpi a"><div class="v">${k.tocadas}</div><div class="l">Tickets tocados</div></div>
      <div class="kpi a"><div class="v">${k.transTot}</div><div class="l">Transições</div></div>
      <div class="kpi a"><div class="v">${k.concl==null?'—':k.concl}</div><div class="l">Concluídas</div></div>
    </div>
    <div class="grid">
      <div class="card full ia-card">${cardAnaliseIA()}</div>
      <div class="card full"><h2>Por pessoa <span>meta acima de 100% = trabalhou além do previsto; 🌴 aparece quando passa de 6h extras/semana</span></h2><div class="scroll-x">${tabela}</div></div>
      <div class="card full"><h2>Horas por pessoa e projeto
        <span>cada cor é um projeto</span></h2>${cardPessoaProjeto()}</div>
      <div class="card full"><h2>Faturável por pessoa
        <span>% faturável de cada um</span></h2>${cardFaturavelPessoa()}</div>
      <div class="card"><h2>Horas · faturável vs não</h2>${split}</div>
      <div class="card"><h2>Uso do Jira <span>no período</span></h2>${(()=>{
        const soma=(c)=>d.pessoas.reduce((s,p)=>s+(p[c]||0),0);
        return barlist({ 'Chamados criados':soma('criado'), 'Atualizações (alterações)':soma('alter'),
          'Comentários':soma('coment'), 'Transições de status':k.transTot,
          'Concluídos':(k.concl==null?0:k.concl) },(v)=>v,cores.amarelo,6);
      })()}</div>
      <div class="card"><h2>Horas por categoria <span>clique para detalhar</span></h2>${barlist(d.porCategoria,fmtH,cores.cerceta,8,null,null,{drill:(k)=>({type:'categoria',key:k})})}</div>
      <div class="card"><h2>Atividade por tipo <span>treemap · clique p/ detalhar</span></h2>${treemap(Object.entries(d.porTipo).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>({nome:k,valor:v,drill:{type:'tipo',key:k}})),{fmt:(v)=>v+' tickets'})}</div>
      <div class="card full"><h2>Top projetos por horas <span>treemap · área = horas · clique p/ detalhar</span></h2>${treemap(Object.entries(d.porProjeto).sort((a,b)=>b[1]-a[1]).slice(0,14).map(([k,v])=>({nome:nomeProjResumo(k),valor:v,drill:{type:'projeto',key:k}})),{fmt:fmtH})}</div>
      <div class="card full"><h2>Horas por dia <span>clique num ponto para detalhar</span></h2>${colunas}</div>
    </div>
  </div>`));
}

// ---------------- Resumo de atividades por IA (Claude) ----------------
// Chave de cache: período + filtros atuais (se mudar, o resumo é regerado).
function chaveAnaliseIA(){ return estado.periodo+'|'+JSON.stringify(filtros()); }

// Monta o payload com as MÉTRICAS já agregadas (mesmas da tela) + cadência diária.
function payloadAnaliseIA(){
  const d=agrega();
  const ts=calcTimesheet();
  const porPessoaTs={}; ts.linhas.forEach(l=>{ porPessoaTs[l.a]=l; });
  const diasUteis=ts.dias.filter(x=>ehUtil(x)&&!ehFeriado(x)&&x!==ts.hoje).length;
  const sel=document.getElementById('f-periodo');
  const label=(sel&&sel.options[sel.selectedIndex]&&sel.options[sel.selectedIndex].text)||estado.periodo;

  const pessoas=d.pessoas.map(p=>{
    const l=porPessoaTs[p.a];
    const diasComApont=l?Object.keys(l.porDia||{}).filter(x=>(l.porDia[x]||0)>0 && ts.dias.includes(x)).length:0;
    const metaPct=(l&&l.esperado>0)?Math.round(l.tot/l.esperado*100):null;
    return {
      id:p.a, nome:p.nome,
      horas:+(p.seg/3600).toFixed(1),
      faturavelPct:p.seg?pct(p.segFat,p.seg):0,
      tickets:p.tickets, alteracoes:p.alter, transicoes:p.trans,
      comentarios:p.coment, criados:p.criado,
      diasComApontamento:diasComApont, diasUteisEsperados:diasUteis,
      metaPct:(metaPct==null?0:metaPct),
    };
  });
  const equipe={
    horasTotais:+(d.kpi.segTot/3600).toFixed(1), faturavelPct:d.kpi.fatPct,
    ticketsTocados:d.kpi.tocadas, transicoes:d.kpi.transTot,
    concluidas:(d.kpi.concl==null?0:d.kpi.concl),
    criados:d.pessoas.reduce((s,p)=>s+(p.criado||0),0),
    comentarios:d.pessoas.reduce((s,p)=>s+(p.coment||0),0),
  };
  return { periodo:{ label, diasUteis }, equipe, pessoas };
}

function cardAnaliseIA(){
  const a=estado.analiseIA;
  const atual=(a.chave===chaveAnaliseIA());
  const cab=`<h2>🧠 Resumo das atividades (IA)
    <span>análise automática de cada pessoa no período selecionado</span></h2>`;

  if(a.carregando) return `${cab}<div class="estado">Analisando as atividades do período…</div>`;

  if(a.configurado===false)
    return `${cab}<div class="aviso">${esc(a.erro||'Resumo por IA não configurado.')}
      <br><span class="small">Um administrador precisa definir a variável <strong>ANTHROPIC_API_KEY</strong> nas configurações da Vercel.</span></div>`;

  if(a.erro && atual)
    return `${cab}<div class="erro">${esc(a.erro)}</div>
      <div style="margin-top:10px"><button class="btn primario" id="ia-gerar">Tentar de novo</button></div>`;

  if(!atual || !a.pessoas){
    return `${cab}
      <div class="muted small">Gera, com IA, um resumo das atividades de cada pessoa (cadência de apontamento,
        tickets, transições, colaboração por comentários…) com base nos números desta tela.</div>
      <div style="margin-top:12px"><button class="btn primario" id="ia-gerar">✨ Gerar resumo das atividades</button></div>`;
  }

  // Resultado pronto: mapa id->nome para exibir.
  const nomes=pessoasUnidas();
  const nomeDe=(id)=>(nomes[id]&&nomes[id].nome)||id;
  const ic={positivo:'🟢', neutro:'⚪', atencao:'🟠'};
  const cards=(a.pessoas||[]).map(p=>`
    <div class="ia-pessoa ia-${esc(p.sinal)}">
      <div class="ia-nome"><span data-pessoa="${escA(p.id)}">${esc(nomeDe(p.id))}</span>
        <span class="ia-sinal" data-tip="${p.sinal==='positivo'?'Em dia e ativo':p.sinal==='atencao'?'Merece atenção':'Mediano'}">${ic[p.sinal]||'⚪'}</span></div>
      <div class="ia-texto">${esc(p.resumo)}</div>
    </div>`).join('');

  return `${cab}
    ${a.geral?`<div class="ia-geral">${esc(a.geral)}</div>`:''}
    <div class="ia-grid">${cards||'<div class="estado">Sem pessoas para resumir.</div>'}</div>
    <div style="margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn" id="ia-gerar">↻ Atualizar resumo</button>
      <span class="muted small">Gerado por IA a partir dos números desta tela — confira antes de decisões.</span>
    </div>`;
}

async function geraAnaliseIA(){
  const a=estado.analiseIA;
  if(a.carregando) return;
  const chave=chaveAnaliseIA();
  a.carregando=true; a.erro=''; if(estado.vista==='resumo') renderResumo();
  try{
    const body=payloadAnaliseIA();
    if(!body.pessoas.length){ a.carregando=false; a.erro='Sem dados para os filtros atuais.'; a.chave=chave;
      if(estado.vista==='resumo') renderResumo(); return; }
    const j=await fetch('/api/resumo',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)}).then(r=>r.json());
    a.carregando=false; a.chave=chave;
    if(j.configurado===false){ a.configurado=false; a.erro=j.erro||''; }
    else if(j.ok){ a.configurado=true; a.geral=j.geral||''; a.pessoas=j.pessoas||[]; a.erro=''; }
    else { a.erro=humanizaErro(j.erro||'Falha ao gerar o resumo.'); a.pessoas=null; }
  }catch(e){ a.carregando=false; a.chave=chave; a.erro=humanizaErro(e); a.pessoas=null; }
  if(estado.vista==='resumo') renderResumo();
}
// ----------------------------------------------------------------------

// ---------------- Solicitar folga (compensação de horas extras) ----------------
// Abre um mini-formulário (data + quantidade) e cria um pedido de Time Off no Odoo
// para a pessoa. Disponível na aba Resumo quando alguém passa de 6h extras/semana.
function abreFolga(a, email, nome, extraTotH, extraSemH){
  email=email||''; nome=nome||'';
  const hoje=hojeSP();
  const sug=Math.min(8, Math.max(1, Math.round(Number(extraSemH)||1)));
  abreModal(`
    <h2>🌴 Solicitar folga — ${esc(nome)}</h2>
    <div class="muted small" style="margin-bottom:12px">
      ${esc(nome)} está com <strong>≈ ${esc(String(extraSemH))}h extras por semana</strong>
      (${esc(String(extraTotH))}h no período). A folga é uma <strong>compensação</strong> dessas horas:
      o pedido é criado no <strong>Odoo</strong> como Time&nbsp;Off para a pessoa${email?` <span class="muted">(${esc(email)})</span>`:''}.
    </div>
    ${email?'':'<div class="ap-fb warn" style="margin-bottom:10px">⚠ Não temos o e-mail desta pessoa pelo Jira. O Odoo vai tentar localizar pelo nome; se não achar, o pedido falha.</div>'}
    <div class="mt-form">
      <div class="campo"><label>Data da folga</label><input type="date" id="folga-data" value="${escA(hoje)}" min="${escA(hoje)}"></div>
      <div class="campo"><label>Quantidade</label>
        <select id="folga-modo">
          <option value="meio">Meio período</option>
          <option value="dia">Dia(s) inteiro(s)</option>
          <option value="horas">Horas específicas</option>
        </select></div>
      <div class="campo" id="folga-wrap-periodo"><label>Período</label>
        <select id="folga-periodo"><option value="am">Manhã</option><option value="pm">Tarde</option></select></div>
      <div class="campo" id="folga-wrap-horas" hidden><label>Nº de horas</label>
        <input type="number" id="folga-horas" min="0.5" max="8" step="0.5" value="${escA(String(sug))}"></div>
      <div class="campo" id="folga-wrap-ate" hidden><label>Até (opcional)</label>
        <input type="date" id="folga-ate" value="${escA(hoje)}" min="${escA(hoje)}"></div>
      <div class="campo" style="flex:1 1 100%"><label>Motivo (opcional)</label>
        <input type="text" id="folga-motivo" placeholder="Compensação de horas extras" maxlength="120" style="width:100%;box-sizing:border-box"></div>
    </div>
    <div id="folga-fb" class="ap-fb" hidden style="margin-top:10px"></div>
    <div style="margin-top:14px;display:flex;gap:10px">
      <button class="btn primario" id="folga-enviar" data-folga-email="${escA(email)}" data-folga-nome="${escA(nome)}">Enviar pedido ao Odoo</button>
      <button class="btn" id="folga-cancelar">Cancelar</button>
    </div>`);
  folgaToggle();
}
// Ausência a partir da árvore "Onde crio?": pedido no Odoo em nome da própria
// pessoa (identificação do painel), com o TIPO escolhido (compensação, atestado,
// férias remuneradas/não remuneradas). Reusa os campos/handlers do modal de folga.
const AUS_TIPOS={
  compensacao:{ rot:'Compensação de horas', ic:'🌴', modo:'meio', nota:'Compensa horas extras já trabalhadas — o padrão é meio período ou horas específicas.' },
  atestado:{ rot:'Atestado médico', ic:'🩺', modo:'dia', nota:'Depois de enviar, anexe o atestado no próprio pedido dentro do Odoo (o RH valida por lá).' },
  ferias:{ rot:'Férias remuneradas', ic:'🏖', modo:'dia', nota:'Informe o período completo (de/até). O pedido segue para aprovação do gestor no Odoo.' },
  ferias_nr:{ rot:'Férias não remuneradas', ic:'🏝', modo:'dia', nota:'Licença sem remuneração — informe o período completo; aprovação do gestor no Odoo.' },
};
function abreAusencia(tipo){
  const t=AUS_TIPOS[tipo]; if(!t) return;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const hoje=hojeSP();
  abreModal(`
    <h2>${t.ic} ${esc(t.rot)} — ${esc(id.nome||id.email)}</h2>
    <div class="muted small" style="margin-bottom:12px">O pedido é criado no <strong>Odoo</strong> (Time Off) em seu nome
      <span class="muted">(${esc(id.email)})</span> e segue o fluxo de aprovação de lá. ${esc(t.nota)}</div>
    <div class="mt-form">
      <div class="campo"><label>Data ${t.modo==='dia'?'inicial':''}</label><input type="date" id="folga-data" value="${escA(hoje)}"></div>
      <div class="campo"><label>Quantidade</label>
        <select id="folga-modo">
          <option value="meio" ${t.modo==='meio'?'selected':''}>Meio período</option>
          <option value="dia" ${t.modo==='dia'?'selected':''}>Dia(s) inteiro(s)</option>
          <option value="horas">Horas específicas</option>
        </select></div>
      <div class="campo" id="folga-wrap-periodo"><label>Período</label>
        <select id="folga-periodo"><option value="am">Manhã</option><option value="pm">Tarde</option></select></div>
      <div class="campo" id="folga-wrap-horas" hidden><label>Nº de horas</label>
        <input type="number" id="folga-horas" min="0.5" max="8" step="0.5" value="2"></div>
      <div class="campo" id="folga-wrap-ate" hidden><label>Até (opcional)</label>
        <input type="date" id="folga-ate" value="${escA(hoje)}"></div>
      <div class="campo" style="flex:1 1 100%"><label>Motivo <span class="muted">(opcional)</span></label>
        <input type="text" id="folga-motivo" placeholder="${escA(t.rot)}" maxlength="120" style="width:100%;box-sizing:border-box"></div>
    </div>
    <div id="folga-fb" class="ap-fb" hidden style="margin-top:10px"></div>
    <div style="margin-top:14px;display:flex;gap:10px">
      <button class="btn primario" id="folga-enviar" data-folga-email="${escA(id.email)}" data-folga-nome="${escA(id.nome||'')}" data-folga-tipo="${escA(tipo)}">Enviar pedido ao Odoo</button>
      <button class="btn" id="folga-cancelar">Cancelar</button>
    </div>`);
  folgaToggle();
}
// Mostra só os campos relevantes ao tipo de quantidade escolhido.
function folgaToggle(){
  const sel=document.getElementById('folga-modo'); if(!sel) return;
  const modo=sel.value||'meio';
  const set=(id,show)=>{ const w=document.getElementById(id); if(w) w.hidden=!show; };
  set('folga-wrap-periodo', modo==='meio');
  set('folga-wrap-horas', modo==='horas');
  set('folga-wrap-ate', modo==='dia');
}
async function enviaFolga(){
  const fb=document.getElementById('folga-fb');
  const btn=document.getElementById('folga-enviar'); if(!btn) return;
  const get=(id)=>{ const el=document.getElementById(id); return el?el.value:''; };
  const modo=get('folga-modo')||'meio';
  const data=get('folga-data');
  const mostra=(cls,txt)=>{ fb.hidden=false; fb.className='ap-fb'+(cls?' '+cls:''); fb.innerHTML=txt; };
  if(!data){ mostra('err','Escolha a data da folga.'); return; }
  const body={ email:btn.getAttribute('data-folga-email')||'', nome:btn.getAttribute('data-folga-nome')||'',
    data, modo, motivo:get('folga-motivo') };
  const tipoAus=btn.getAttribute('data-folga-tipo'); if(tipoAus) body.tipoAusencia=tipoAus;
  if(modo==='meio') body.periodo=get('folga-periodo')||'am';
  else if(modo==='horas') body.horas=Math.max(0.5, Number(get('folga-horas'))||1);
  else if(modo==='dia'){ const ate=get('folga-ate'); if(ate && ate>data) body.dataFim=ate; }
  ocupado(btn,true); mostra('','Enviando ao Odoo…');
  try{
    const j=await fetch('/api/resumo?acao=folga',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)}).then(r=>r.json());
    if(j.configurado===false){ mostra('err','Integração com o Odoo não configurada. '+esc(j.erro||'')); ocupado(btn,false); return; }
    if(j.ok){ mostra('ok','✓ Pedido de folga criado no Odoo'+(j.funcionario?(' para '+esc(j.funcionario)):'')+
        (j.url?` — <a href="${escA(j.url)}" target="_blank" rel="noopener">abrir no Odoo</a>`:'')+'.');
      toast('✓ Pedido de folga criado no Odoo'+(j.funcionario?(' para '+j.funcionario):'')+'.','ok');
      setTimeout(fechaModal, 3000); }
    else { const m=humanizaErro(j.erro||'Falha ao criar o pedido de folga.'); mostra('err', esc(m)); toast(m,'err'); ocupado(btn,false); }
  }catch(e){ const m=humanizaErro(e); mostra('err', esc(m)); toast(m,'err'); ocupado(btn,false); }
}
// -------------------------------------------------------------------------------

// Calcula a matriz pessoa × dia (segundos) e a lacuna por pessoa, respeitando a
// meta individual e as ausências. Reutilizado por timesheet, ranking, "não
// apontou", heatmap e exportação.
function calcTimesheet(){
  const f=filtros();
  const ft=Object.assign({}, f, {ocultar:false});   // conta TODAS as horas apontadas
  const projs=projetosUnidos();
  const pessoasNome=pessoasUnidas();
  const meta=estado.tempo.meta||{};
  const dias=listaDias(meta.startDate, meta.endDate);
  const hoje=hojeSP();

  const cel={}; const ativos=new Set();
  (estado.tempo.worklogs||[]).forEach(w=>{
    if(!passa(w.p,w.t,projs,ft)) return;
    if(f.pessoa && w.a!==f.pessoa) return;
    const dia=(w.d||'').slice(0,10); if(!dia) return;
    (cel[w.a]=cel[w.a]||{})[dia]=((cel[w.a]&&cel[w.a][dia])||0)+w.s;
    ativos.add(w.a);
  });
  (estado.atividade.eventos||[]).forEach(e=>{
    if(!passa(e.p,e.t,projs,ft)) return;
    if(f.pessoa && e.a!==f.pessoa) return;
    ativos.add(e.a);
  });
  // Elenco: inclui todos os usuários ativos do Jira (mesmo sem apontamento), para que
  // quem não lançou horas apareça no ranking/timesheet. Só quando não há recorte por
  // projeto/categoria/tipo (nesses casos a ausência de horas naquele recorte é esperada).
  if(!f.projeto && !f.categoria && !f.tipo){
    Object.keys(estado.usuarios||{}).forEach(a=>{ if(!f.pessoa || a===f.pessoa) ativos.add(a); });
  }

  const linhas=[...ativos].map(a=>{
    const porDia=cel[a]||{};
    let tot=0, lacuna=0, vazios=0, parciais=0, esperado=0;
    dias.forEach(d=>{
      const s=porDia[d]||0; tot+=s;
      if(!ehUtil(d) || d===hoje || ehAusencia(a,d) || ehFeriado(d)) return;  // fds/hoje/ausência/feriado não contam
      const m=metaSegDe(a); esperado+=m;
      if(s<=0){ vazios++; lacuna+=m; }
      else if(s<m){ parciais++; lacuna+=(m-s); }
    });
    return { a, nome:(pessoasNome[a]&&pessoasNome[a].nome)||a, porDia, tot, lacuna, vazios, parciais, esperado };
  }).sort((x,y)=> (y.lacuna-x.lacuna) || (y.tot-x.tot) || x.nome.localeCompare(y.nome,'pt'));

  return { meta, dias, hoje, linhas };
}

// Aviso: quem não apontou no último dia útil fechado do período.
function cardNaoApontou(){
  const { dias, hoje, linhas } = calcTimesheet();
  const uteis = dias.filter(d => ehUtil(d) && !ehFeriado(d) && d!==hoje);
  if(!uteis.length || !linhas.length) return '';
  const ultimo = uteis[uteis.length-1];
  const faltam = linhas.filter(l => !ehAusencia(l.a, ultimo) && !(l.porDia[ultimo] > 0));
  if(!faltam.length)
    return `<div class="aviso ok">✓ Todo mundo apontou em <strong>${esc(ultimo)}</strong> (último dia útil).</div>`;
  const nomes = faltam.map(l => `<span data-pessoa="${esc(l.a)}">${esc(l.nome)}</span>`).join(', ');
  return `<div class="aviso"><strong>${faltam.length}</strong> sem apontamento em
    <strong>${esc(ultimo)}</strong> (último dia útil): ${nomes}</div>`;
}

