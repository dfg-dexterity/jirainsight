// Jira Insights · 20e · ⏱ HORAS DA SEMANA NO 📋 STATUS REPORT — dados e cálculo (2026-11-20, a pedido do usuário: "coloque junto com o
// status report uma visão de quantas horas o pessoal apontou nos dias anteriores vs o que está planejado no planejamento semanal; a ideia
// é ver como o pessoal vem gastando seu tempo"). Este arquivo NÃO tem DOM nem listeners: a tela (srhSecaoHTML, srhPinta, srhAoChegar,
// modal e listeners) mora no 20c-status-report.js. Aqui só há a janela, a leitura (uma por SEMANA, não por projeto) e a conta.
// Decisões: D1 quem aparece = quem tem atividade no projeto no 📋 plano da semana OU apontou no projeto na janela (e o total do dia da
// pessoa em todos os projetos vai ao lado) · D2 semana corrente até ONTEM, dia a dia, ‹ › para semanas anteriores (hoje nunca entra) ·
// D3 por pessoa e dia: planejado NESTE projeto × apontado NESTE projeto, colorido pela régua ÚNICA `mpSitDe` (04) e o detalhe
// "onde mais foi o tempo". Leitura: `POST /api/config?plan=1 {acao:'relatorio'}` (aberta a qualquer identificado, como o 📊 planrel) +
// `GET /api/tempo?desde&ate` com a MESMA URL de semana cheia do planrel (divide o cache do servidor). Nada na cfg, nada é gravado, sem R$.
const SRH_CACHE_MIN=5, SRH_SEMANAS_MAX=26;

// Estado só da sessão: { aberto, w, cache:{[semana]:{em,idk,planos|null,planoErro,wl,pessoas,projetos,resumos}}, carregando, erro:{[semana]} }
function srhEstado(){
  estado.sr=estado.sr||{};
  const h=estado.sr.horas=estado.sr.horas||{};
  if(typeof h.aberto!=='boolean') h.aberto=false;
  if(typeof h.w!=='string') h.w='';
  if(!h.cache||typeof h.cache!=='object') h.cache={};
  if(typeof h.carregando!=='string') h.carregando='';
  if(!h.erro||typeof h.erro!=='object') h.erro={};
  return h;
}

// Janela (pura). `w` = segunda pedida (ou vazio = padrão). Hoje nunca entra. De terça a sexta a padrão é a semana corrente até ontem;
// na segunda (ou no 1º dia útil depois de feriado) é a semana passada inteira, porque a corrente ainda não tem dia fechado.
function srhJanela(hoje, w){
  let ontemUtil=mtsSoma(hoje,-1), g=0;
  while((!ehUtil(ontemUtil)||ehFeriado(ontemUtil)) && g++<20) ontemUtil=mtsSoma(ontemUtil,-1);
  const wPad=semChave(ontemUtil);
  const piso=mtsSoma(wPad,-7*SRH_SEMANAS_MAX);
  let sel=(typeof w==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(w))?semChave(w):wPad;
  if(sel>wPad) sel=wPad;
  if(sel<piso) sel=piso;
  const atual=(sel===semChave(hoje));
  const ate=atual?mtsSoma(hoje,-1):mtsSoma(sel,6);
  return { w:sel, wPad, de:sel, ate, hoje, atual, padrao:(sel===wPad) };
}

// Cache válido da semana (mesma identidade, dentro do TTL) ou null.
function srhDados(w){
  const h=srhEstado(); const c=h.cache[w]; if(!c) return null;
  const id=(typeof idApontar==='function')?idApontar():null;
  const acc=(id&&id.accountId)||'';
  if(!acc||c.idk!==acc) return null;
  if(Date.now()-(c.em||0)>SRH_CACHE_MIN*60000) return null;
  return c;
}

// Lê a semana inteira do time. true = já há cache válido (nada pedido); false = pediu (ou não pôde pedir). Chama srhAoChegar() se existir.
function srhCarrega(w, forca){
  const h=srhEstado();
  const id=(typeof idApontar==='function')?idApontar():null;
  const acc=(id&&id.accountId)||'';
  if(!acc||!w) return false;
  if(!forca && srhDados(w)) return true;
  if(h.carregando===w) return false;
  h.carregando=w; delete h.erro[w];
  const aviso=()=>{ if(typeof srhAoChegar==='function'){ try{ srhAoChegar(); }catch(e){} } };
  const planP=mpApi({acao:'relatorio', de:w, ate:w}).catch(e=>({ok:false, erro:humanizaErro(e)}));
  const tempoP=fetch('/api/tempo?desde='+encodeURIComponent(w)+'&ate='+encodeURIComponent(mtsSoma(w,6))+(forca?'&nocache=1':''))
    .then(jsonOuErro).catch(e=>({erro:humanizaErro(e)}));
  Promise.all([planP, tempoP]).then(([pj, tj])=>{
    h.carregando='';
    const idAgora=(typeof idApontar==='function')?idApontar():null;
    if(!idAgora||idAgora.accountId!==acc) return aviso();          // trocou de identidade no meio: descarta
    if(!tj||tj.erro||!tj.meta||tj.meta.janela!=='custom'||tj.meta.startDate!==w){
      const msg=(tj&&tj.erro)?humanizaErro(tj.erro):'o servidor não devolveu os apontamentos desta semana';
      h.erro[w]=msg; return aviso();
    }
    const okPlano=!!(pj&&pj.ok===true);
    h.cache[w]={ em:Date.now(), idk:acc,
      planos: okPlano?(Array.isArray(pj.planos)?pj.planos:[]):null,
      planoErro: okPlano?'':humanizaErro((pj&&pj.erro)||'não consegui ler os planos'),
      wl:Array.isArray(tj.worklogs)?tj.worklogs:[], pessoas:tj.pessoas||{}, projetos:tj.projetos||{}, resumos:tj.resumos||{} };
    aviso();
  }).catch(e=>{ h.carregando=''; h.erro[w]=humanizaErro(e); aviso(); });
  return false;
}

// Conta da seção (pura em relação a `dd`). Ver o formato de saída no plano (srhoras-plano/plano-fable.md, T1).
function srhCalc(proj, jan, dd){
  dd=dd||{}; const wl=Array.isArray(dd.wl)?dd.wl:[]; const pessoasDd=dd.pessoas||{}; const resumosDd=dd.resumos||{};
  const ocultos=new Set((cfg&&cfg.ocultos)||[]);
  const ini=(typeof mpInicioVig==='function')?mpInicioVig():'';
  const temPlanos=dd.planos!=null;
  const planos=temPlanos?mpPlanosVigentes(dd.planos).filter(p=>p&&p.semana===jan.w):[];
  const planDe={}; planos.forEach(p=>{ planDe[p.accountId]=p; });
  const noPeriodo=(d)=>d>=jan.de&&d<=jan.ate;

  // worklogs da janela, por pessoa
  const logs={};   // a -> {proj:{d:h}, tot:{d:h}, tks:{k:{h,dias:{d:h}}}, outros:{pj:{h,tks:{k:h}}}}
  wl.forEach(x=>{
    if(!x||!x.a) return; const d=String(x.d||'').slice(0,10); if(!d||!noPeriodo(d)) return;
    const h=(Number(x.s)||0)/3600; const k=x.k?String(x.k):'';
    const pj=x.p||(k?k.split('-')[0]:'—');
    const L=logs[x.a]=logs[x.a]||{proj:{},tot:{},tks:{},outros:{}};
    L.tot[d]=(L.tot[d]||0)+h;
    if(pj===proj){
      L.proj[d]=(L.proj[d]||0)+h;
      if(k){ const t=L.tks[k]=L.tks[k]||{h:0,dias:{}}; t.h+=h; t.dias[d]=(t.dias[d]||0)+h; }
    } else {
      const o=L.outros[pj]=L.outros[pj]||{h:0,tks:{}}; o.h+=h;
      if(k) o.tks[k]=(o.tks[k]||0)+h;
    }
  });

  // dias da janela: úteis e não feriados + qualquer dia com plano ou apontamento no projeto
  const extra=new Set();
  Object.keys(planDe).forEach(a=>{ (planDe[a].itens||[]).forEach(i=>{ if(i&&i.projeto===proj&&Number(i.horas)>0&&noPeriodo(i.data)) extra.add(i.data); }); });
  Object.keys(logs).forEach(a=>{ Object.keys(logs[a].proj).forEach(d=>{ if(logs[a].proj[d]>0) extra.add(d); }); });
  const dias=listaDias(jan.de, jan.ate).filter(d=>(ehUtil(d)&&!ehFeriado(d))||extra.has(d))
    .map(d=>({ d, dow:diaSemana(d), util:ehUtil(d)&&!ehFeriado(d) }));

  const accs=new Set([...Object.keys(planDe), ...Object.keys(logs)]);
  const pessoas=[];
  accs.forEach(a=>{
    if(ocultos.has(a)) return;
    const pl=planDe[a]||null; const L=logs[a]||{proj:{},tot:{},tks:{},outros:{}};
    const itens=pl?(pl.itens||[]).filter(i=>i):[];
    const temPlano=!!pl;
    // planejado do projeto por dia (semana inteira, inclui dias futuros) e do plano todo por dia
    const plProj={}, plTot={}; let planSemana=0;
    itens.forEach(i=>{ const h=Number(i.horas)||0;
      plTot[i.data]=(plTot[i.data]||0)+h;
      if(i.projeto===proj){ plProj[i.data]=(plProj[i.data]||0)+h; planSemana+=h; } });
    const real=dias.reduce((s,x)=>s+(L.proj[x.d]||0),0);
    if(!(planSemana>0)&&!(real>0)) return;                             // D1
    const cel={}; let plan=0, planTot=0, tot=0, foraDoPlano=0;
    dias.forEach(x=>{
      const d=x.d; const re=L.proj[d]||0; const t=L.tot[d]||0; const cap=mpCapDia(a,d);
      const p=temPlano?(plProj[d]||0):null;
      let sit, cor, desvio=null;
      if(p==null){ sit='sem plano'; cor='nd'; }
      else if(p===0&&re===0){ sit=''; cor=''; }
      else { const r=mpSitDe(p,re); sit=r.sit; cor=r.cor; desvio=r.desvio; }
      cel[d]={ pl:p, re, tot:t, cap, sit, cor, desvio, aus:(x.util&&cap===0) };
      if(p!=null) plan+=p;
      if(temPlano) planTot+=(plTot[d]||0);
      tot+=t;
      if(p==null||p===0) foraDoPlano+=re;
    });
    const dif=temPlano?real-plan:null;
    const exec=(temPlano&&plan>0)?(real/plan*100):null;
    const tickets=Object.keys(L.tks).map(k=>({ k, resumo:resumosDd[k]||'', h:L.tks[k].h, dias:L.tks[k].dias }))
      .sort((x,y)=>y.h-x.h||x.k.localeCompare(y.k));
    const outrosProj=Object.keys(L.outros).map(pj=>({ pj, h:L.outros[pj].h,
      tks:Object.keys(L.outros[pj].tks).map(k=>({ k, resumo:resumosDd[k]||'', h:L.outros[pj].tks[k] }))
        .sort((x,y)=>y.h-x.h).slice(0,3) })).sort((x,y)=>y.h-x.h||x.pj.localeCompare(y.pj));
    const itensPlano=itens.filter(i=>i.projeto===proj).map(i=>({ d:i.data, desc:i.descricao||'', h:Number(i.horas)||0 }))
      .sort((x,y)=>x.d<y.d?-1:x.d>y.d?1:0);
    const nome=(pl&&pl.nome)||(pessoasDd[a]&&pessoasDd[a].nome)||nomePessoaDe(a);
    pessoas.push({ a, nome, status:pl?(pl.status||''):'', versao:pl?(pl.versao||0):0, temPlano,
      dias:cel, plan:temPlano?plan:null, real, dif, exec, prec:(temPlano&&plan>0)?mpPrecisao(plan,real):null,
      planSemana, tot, outros:Math.max(0,tot-real), planTot, tickets, outrosProj, itensPlano, _fora:foraDoPlano });
  });
  pessoas.sort((x,y)=>((y.plan||0)-(x.plan||0))||(y.real-x.real)||String(x.nome).localeCompare(String(y.nome),'pt-BR'));

  const totais={ plan:0, real:0, dif:0, exec:null, porDia:{}, semPlano:0, foraDoPlano:0, pessoas:pessoas.length };
  dias.forEach(x=>{ totais.porDia[x.d]={ pl:0, re:0 }; });
  pessoas.forEach(p=>{
    totais.real+=p.real; totais.foraDoPlano+=p._fora; delete p._fora;
    if(p.temPlano) totais.plan+=p.plan; else totais.semPlano+=1;
    dias.forEach(x=>{ const c=p.dias[x.d]; totais.porDia[x.d].re+=c.re; totais.porDia[x.d].pl+=(c.pl||0); });
  });
  totais.dif=totais.real-totais.plan;
  totais.exec=totais.plan>0?(totais.real/totais.plan*100):null;
  return { proj, w:jan.w, de:jan.de, ate:jan.ate, dias, temPlanos, antesVig:!!(ini&&jan.w<semChave(ini)), pessoas, tot:totais };
}

// Resumo curto para o <summary> da seção e para o texto copiado do relatório.
function srhResumo(c){
  const t=(c&&c.tot)||{}; return { plan:t.plan||0, real:t.real||0, exec:t.exec==null?null:t.exec };
}
