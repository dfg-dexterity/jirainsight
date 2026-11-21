// Jira Insights · 20e · ⏱ HORAS DA SEMANA NO 📋 STATUS REPORT — dados e cálculo (2026-11-20, a pedido do usuário: "coloque junto com o
// status report uma visão de quantas horas o pessoal apontou nos dias anteriores vs o que está planejado no planejamento semanal; a ideia
// é ver como o pessoal vem gastando seu tempo"). Este arquivo NÃO tem DOM nem listeners: a tela (srhSecaoHTML, srhPinta, srhAoChegar,
// modal e listeners) mora no 20c-status-report.js. Aqui só há a janela, a leitura (uma por SEMANA, não por projeto) e a conta.
// Decisões: D1 quem aparece = quem tem atividade no projeto no 📋 plano da semana OU apontou no projeto na janela (e o total do dia da
// pessoa em todos os projetos vai ao lado) · D2 semana corrente até ONTEM, dia a dia, ‹ › para semanas anteriores (hoje nunca entra) ·
// D3 por pessoa e dia: planejado NESTE projeto × apontado NESTE projeto, colorido pela régua ÚNICA `mpSitDe` (04) e o detalhe
// "onde mais foi o tempo". Leitura: `POST /api/config?plan=1 {acao:'relatorio'}` (aberta a qualquer identificado, como o 📊 planrel) +
// `GET /api/tempo?desde&ate` com a MESMA URL de semana cheia do planrel (divide o cache do servidor). Nada na cfg, nada é gravado, sem R$.
// R254 (2026-11-21, 📈 tendência): as N semanas que terminam na semana padrão são lidas em BLOCOS de 4 semanas (28 dias por /api/tempo,
// abaixo do limiar de 62 dias), no máximo 2 blocos em voo, cache por bloco; a conta é a MESMA `srhCalc` por semana. Só dados, sem DOM.
const SRH_CACHE_MIN=5, SRH_SEMANAS_MAX=26;
const SRH_TEND_PADRAO=8, SRH_TEND_OPCOES=[4,8,12], SRH_TEND_BLOCO=4, SRH_TEND_CACHE_MIN=30, SRH_TEND_VOO=2;

// Estado só da sessão: { aberto, w, cache:{[semana]:{em,idk,planos|null,planoErro,wl,pessoas,projetos,resumos}}, carregando, erro:{[semana]} }
function srhEstado(){
  estado.sr=estado.sr||{};
  const h=estado.sr.horas=estado.sr.horas||{};
  if(typeof h.aberto!=='boolean') h.aberto=false;
  if(typeof h.w!=='string') h.w='';
  if(!h.cache||typeof h.cache!=='object') h.cache={};
  if(typeof h.carregando!=='string') h.carregando='';
  if(!h.erro||typeof h.erro!=='object') h.erro={};
  if(h.modo!=='semana'&&h.modo!=='tend') h.modo='semana';
  if(typeof h.tn!=='number'||SRH_TEND_OPCOES.indexOf(h.tn)<0) h.tn=SRH_TEND_PADRAO;
  if(!h.tend||typeof h.tend!=='object') h.tend={};
  ['cache','voo','erro','forca'].forEach(k=>{ if(!h.tend[k]||typeof h.tend[k]!=='object') h.tend[k]={}; });
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
  const ocultos=new Set(((cfg&&cfg.ocultos)||[]).map(o=>(o&&o.a)||o).filter(Boolean));
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
      if(p==null||p===0) foraDoPlano+=re;
    });
    // o total da pessoa conta TODOS os dias da janela, inclusive sábado/feriado só com outro projeto (sem coluna):
    // é a mesma base dos outrosProj do modal, então "neste projeto" + "outros" fecham e o % nunca passa de 100 (revisão PR #238)
    tot=Object.keys(L.tot).reduce((s,d)=>s+L.tot[d],0);
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

// ---------------------------------------------------------------------------------------------------------------------------
// R254 · 📈 Tendência: as `n` semanas terminando na semana padrão, lidas em blocos de 4 semanas.

// Segundas das `n` semanas (da mais antiga à mais nova), a última = srhJanela(hoje,'').wPad. Pura.
function srhTendSemanas(hoje, n){
  const wPad=srhJanela(hoje,'').wPad; const q=Math.max(1,Math.min(SRH_SEMANAS_MAX,Number(n)||SRH_TEND_PADRAO)); const r=[];
  for(let i=q-1;i>=0;i--) r.push(mtsSoma(wPad,-7*i));
  return r;
}

// Blocos de 4 semanas alinhados a wPad: [{k:<1ª segunda>, de, ate:<domingo da última>, semanas, corrente}], do mais antigo ao mais novo. Pura.
function srhTendBlocos(hoje, n){
  const sem=srhTendSemanas(hoje,n); const cur=semChave(hoje); const blocos=[];
  for(let i=sem.length;i>0;i-=SRH_TEND_BLOCO){
    const fim=i, ini=Math.max(0,i-SRH_TEND_BLOCO); const ws=sem.slice(ini,fim);
    blocos.unshift({ k:ws[0], de:ws[0], ate:mtsSoma(ws[ws.length-1],6), semanas:ws, corrente:ws.indexOf(cur)>=0 });
  }
  return blocos;
}

// Cache válido do bloco (mesma identidade, dentro do TTL conforme corrente) ou null.
function srhTendDadosBloco(k, corrente){
  const h=srhEstado(); const c=h.tend.cache[k]; if(!c) return null;
  const id=(typeof idApontar==='function')?idApontar():null;
  const acc=(id&&id.accountId)||'';
  if(!acc||c.idk!==acc) return null;
  const ttl=(corrente?SRH_CACHE_MIN:SRH_TEND_CACHE_MIN)*60000;
  if(Date.now()-(c.em||0)>ttl) return null;
  return c;
}

// Dispara os blocos que faltam (no máximo SRH_TEND_VOO em voo). true = tudo já em cache. `forca` relê só o bloco corrente e os com erro.
function srhTendCarrega(hoje, n, forca){
  const h=srhEstado();
  const id=(typeof idApontar==='function')?idApontar():null;
  const acc=(id&&id.accountId)||'';
  if(!acc) return false;
  const blocos=srhTendBlocos(hoje,n);
  if(forca) blocos.forEach(b=>{ if(b.corrente||h.tend.erro[b.k]){ h.tend.forca[b.k]=true; delete h.tend.erro[b.k]; } });
  const aviso=()=>{ if(typeof srhAoChegar==='function'){ try{ srhAoChegar(); }catch(e){} } };
  const falta=()=>blocos.filter(b=>(h.tend.forca[b.k]||!srhTendDadosBloco(b.k,b.corrente)) && !h.tend.voo[b.k] && !h.tend.erro[b.k]);
  const lanca=(b)=>{
    const nc=!!h.tend.forca[b.k]; delete h.tend.forca[b.k]; h.tend.voo[b.k]=true;
    const ultima=b.semanas[b.semanas.length-1];
    const planP=mpApi({acao:'relatorio', de:b.de, ate:ultima}).catch(e=>({ok:false, erro:humanizaErro(e)}));
    const tempoP=fetch('/api/tempo?desde='+encodeURIComponent(b.de)+'&ate='+encodeURIComponent(b.ate)+(nc?'&nocache=1':''))
      .then(jsonOuErro).catch(e=>({erro:humanizaErro(e)}));
    Promise.all([planP,tempoP]).then(([pj,tj])=>{
      delete h.tend.voo[b.k];
      const idAgora=(typeof idApontar==='function')?idApontar():null;
      if(!idAgora||idAgora.accountId!==acc){ aviso(); return; }       // trocou de identidade no meio: descarta
      if(!tj||tj.erro||!tj.meta||tj.meta.janela!=='custom'||tj.meta.startDate!==b.de){
        h.tend.erro[b.k]=(tj&&tj.erro)?humanizaErro(tj.erro):'o servidor não devolveu os apontamentos destas semanas';
      } else {
        const okPlano=!!(pj&&pj.ok===true);
        h.tend.cache[b.k]={ em:Date.now(), idk:acc,
          planos: okPlano?(Array.isArray(pj.planos)?pj.planos:[]):null,
          planoErro: okPlano?'':humanizaErro((pj&&pj.erro)||'não consegui ler os planos'),
          wl:Array.isArray(tj.worklogs)?tj.worklogs:[], pessoas:tj.pessoas||{}, projetos:tj.projetos||{}, resumos:tj.resumos||{} };
      }
      bombeia(); aviso();
    }).catch(e=>{ delete h.tend.voo[b.k]; h.tend.erro[b.k]=humanizaErro(e); bombeia(); aviso(); });
  };
  const bombeia=()=>{
    const ids=Object.keys(h.tend.voo).length;
    falta().slice(0,Math.max(0,SRH_TEND_VOO-ids)).forEach(lanca);
  };
  const pend=falta();
  if(!pend.length) return !blocos.some(b=>h.tend.voo[b.k]);
  bombeia();
  return false;
}

// Conta da tendência (pura). `blocosDd` = {[k]:dd|null}. Formato: ver o plano (inicio-plano/plano-fable.md, 2.9).
function srhTendCalc(proj, hoje, n, blocosDd){
  blocosDd=blocosDd||{};
  const sem=srhTendSemanas(hoje,n); const blocos=srhTendBlocos(hoje,n);
  const kDe={}; blocos.forEach(b=>b.semanas.forEach(w=>{ kDe[w]=b.k; }));
  const semanas=[], faltam=[], porPessoa={};
  sem.forEach(w=>{
    const jan=srhJanela(hoje,w); const dd=blocosDd[kDe[w]]||null;
    if(!dd){
      faltam.push(w);
      semanas.push({ w, de:jan.de, ate:jan.ate, parcial:!!jan.atual, lido:false, parcialPlano:false, antesVig:false, plan:0, real:0, exec:null, fora:0, semPlano:0 });
      return;
    }
    const c=srhCalc(proj,jan,dd);
    semanas.push({ w, de:jan.de, ate:jan.ate, parcial:!!jan.atual, lido:true, parcialPlano:dd.planos==null, antesVig:!!c.antesVig,
      plan:c.tot.plan, real:c.tot.real, exec:c.tot.exec, fora:c.tot.foraDoPlano, semPlano:c.tot.semPlano });
    c.pessoas.forEach(p=>{
      const R=porPessoa[p.a]=porPessoa[p.a]||{ a:p.a, nome:p.nome, pts:{} };
      let sit, cor; const pl=p.temPlano?p.plan:null;
      if(pl==null){ sit='sem plano'; cor='nd'; }
      else if(pl===0&&p.real===0){ sit=''; cor=''; }
      else { const r=mpSitDe(pl,p.real); sit=r.sit; cor=r.cor; }
      R.pts[w]={ w, lido:true, plan:pl, real:p.real, exec:(pl!=null&&pl>0)?(p.real/pl*100):null, cor, sit };
    });
  });
  const pessoas=Object.keys(porPessoa).map(a=>{
    const R=porPessoa[a]; let plan=0, real=0, semanasCom=0;
    const pts=sem.map(w=>{
      const pt=R.pts[w];
      if(pt){ semanasCom++; real+=pt.real; if(pt.plan!=null) plan+=pt.plan; return pt; }
      const lido=semanas[sem.indexOf(w)].lido;
      return { w, lido, plan:null, real:0, exec:null, cor:'', sit:'' };
    });
    return { a, nome:R.nome, pts, plan, real, exec:plan>0?(real/plan*100):null, semanasCom };
  });
  pessoas.sort((x,y)=>(y.plan-x.plan)||(y.real-x.real)||String(x.nome).localeCompare(String(y.nome),'pt-BR'));
  const tot={ plan:0, real:0, exec:null, fora:0 };
  semanas.forEach(s=>{ if(s.lido){ tot.plan+=s.plan; tot.real+=s.real; tot.fora+=s.fora; } });
  tot.exec=tot.plan>0?(tot.real/tot.plan*100):null;
  return { proj, n:sem.length, semanas, pessoas, tot, faltam };
}

// Resumo curto da tendência para o texto do 📋 Copiar.
function srhTendResumo(t){
  const s=(t&&t.semanas)||[]; const x=(t&&t.tot)||{};
  return { plan:x.plan||0, real:x.real||0, exec:x.exec==null?null:x.exec, n:s.length, lidas:s.filter(w=>w.lido).length };
}
