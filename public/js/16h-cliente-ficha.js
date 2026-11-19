// Jira Insights · 16h · 📇 FICHA DO CLIENTE (R183 do roadmap) — "como está o cliente?" numa tela só.
// Pedido (revisão de 2026-11-05): desde o cadastro de clientes (cfg.clientes, 16g) o contrato 🏢 e o plano da 💹 Rentabilidade
// têm `clienteId`, mas nenhuma tela respondia "como está a NTT?": a 🏦 Controladoria lê por categoria, as 📈 Métricas por projeto
// e a Rentabilidade por plano. A ficha junta, por cliente: contratos vigentes e saldo de horas, projetos do Jira com o semáforo do
// status report, planos com vendido × gasto, horas e receita do período, ciclo de faturamento e próximas notas.
// ===========================================================================
// REGRAS (prefixo `clf`; único nome fora dele: clFicha):
//   • SÓ LEITURA. Nada aqui chama salvaCfg() e nenhum leitor cria chave na cfg (clfSnap/clfRestaura desfazem o que um leitor
//     de outro módulo — pcLista, ppLista — criaria de vazio). Não usar pcLista()/rpPlanos()/rpCenario()/pcDe() daqui: criam.
//   • clFicha() é PURA em relação à rede: lê cfg e caches e nunca faz fetch. Quem dispara leituras é clfGarante(F), chamada
//     pelo clfRender depois do cálculo (uma leitura em voo por chave; falha não se repete sozinha).
//   • clfFin() é o porte por cliente do ctAgrega (18): mesma conta (wFat pela categoria, custo/h da pessoa ou o padrão, valor-hora
//     do contrato do projeto) — o teste de paridade ficha × Controladoria (scratchpad clientes-plano/) prende.
//   • Receita = a regra da Controladoria (horas faturáveis × valor-hora do contrato 🏢). O faturamento previsto (planos e
//     parcerias) aparece à parte, em "Próximas notas".
//   • Vínculos: contrato e plano por `clienteId`; parceria só indireta (plano com p.contrato) ou, rotulada, pelo NOME da consultoria
//     (CLF_PC_POR_NOME). Contrato sem clienteId e com o nome do cliente vira SUGESTÃO ("ligue no editar"), nunca entra nos números.
//   • R$ só para quem tem papel de CT_PAPEIS_FIN (clfVeFin) — é lente, não permissão (a cfg desce inteira para o navegador).
// Helpers de outros módulos (16, 16b, 16c, 17b, 18, 20c, 26) só em tempo de execução, nunca no carregamento.
// ===========================================================================
const CLF_PERS=[['ciclo','Ciclo atual do cliente'],['ciclo-1','Ciclo anterior'],['mes','Este mês'],['mes-1','Mês passado'],['livre','Outro período…']];
const CLF_AUTO_DIAS=62;        // leituras automáticas só até este tamanho; acima disso o botão "ler"
const CLF_MAX_DIAS=62;         // o período livre é cortado aqui
const CLF_SR_LOTE=12;          // semáforos lidos de uma vez (o resto atrás de "ver mais")
const CLF_SR_PAR=3;            // leituras do status report em paralelo
const CLF_SR_TTL=600000;       // 10 minutos
const CLF_NOTAS_ATRAS=31;
const CLF_NOTAS_FRENTE=60;
const CLF_PC_POR_NOME=true;    // parceria cuja consultoria tem o nome do cliente entra "pelo nome" (rotulada); false desliga
const CLF_RE_ID=/^[A-Za-z0-9_-]{1,60}$/;   // pcId('cl') gera 'cl'+base36; a fixture dos testes usa ids curtos
const CLF_RE_PROJ=/^[A-Z][A-Z0-9_]*$/;
estado.clf=estado.clf||{ cli:'', per:'ciclo', de:'', ate:'', tempo:{}, tempoB:{}, tempoErro:{}, sr:{}, srB:{}, srLim:CLF_SR_LOTE, busca:'' };

// ---- utilidades ----
const clfMsg=(e)=>String((e&&e.message)||e||'erro');
const clfNum=(x)=>{ const n=Number(x); return isFinite(n)?n:0; };
const clfMin=(a,b)=>(a<b?a:b);
const clfMax=(a,b)=>(a>b?a:b);
const clfItens=(v)=>(Array.isArray(v)?v:[]);
// Quem vê R$ (a mesma régua do Dashboard e da Disciplina). Lente, não segurança.
function clfVeFin(){ try{ return papeisDe().some(p=>CT_PAPEIS_FIN.includes(p)); }catch(e){ return false; } }
// Os leitores de outros módulos (pcLista, ppLista, rpPlanos…) criam lista vazia na cfg; marcar a chave como "mexida por esta sessão"
// faria ela vencer o remoto na mescla de conflito. clfSnap anota o que NÃO existia; clfRestaura apaga o que nasceu vazio.
const CLF_CHAVES_CFG=['parcerias','pessoasPlanejadas','rentab','clientes','contratos'];
const CLF_LISTAS_ITENS=[()=>cfg.parcerias,()=>cfg.contratos,()=>cfg.clientes,()=>cfg.rentab&&cfg.rentab.planos];
// {top:{chave:existia}, itens:[[obj, Set(chaves que tinha)]]} — os itens também: pcEquipe/pcPrev/pcExtras (parceria) e afins criam [] / {} no objeto.
function clfSnap(){ const top={}; CLF_CHAVES_CFG.forEach(k=>{ top[k]=(k in cfg)&&cfg[k]!==undefined; }); const itens=[];
  CLF_LISTAS_ITENS.forEach(f=>{ let l; try{ l=f(); }catch(e){ l=null; } if(!Array.isArray(l)) return; l.forEach(o=>{ if(o&&typeof o==='object'&&!Array.isArray(o)) itens.push([o,new Set(Object.keys(o))]); }); });
  return { top, itens }; }
function clfVazio(v){ if(v==null) return true; if(Array.isArray(v)) return v.length===0;
  if(typeof v==='object'){ const ks=Object.keys(v); if(!ks.length) return true; return ks.every(k=>clfVazio(v[k])); } return false; }
function clfRestaura(s){ CLF_CHAVES_CFG.forEach(k=>{ if(!s.top[k]&&(k in cfg)&&clfVazio(cfg[k])) delete cfg[k]; });
  s.itens.forEach(([o,ks])=>{ Object.keys(o).forEach(k=>{ if(!ks.has(k)&&clfVazio(o[k])) delete o[k]; }); }); }

// ---- período ----
function clfDiasNoMes(ym){ return pcUltimoDia(ym); }
// {id, de, ate, ateLido, rot, ciclo, futuro, cortado, invalido}
function clfPeriodo(cl, per, hoje, de, ate){
  hoje=hoje||hojeSP(); const id=CLF_PERS.some(x=>x[0]===per)?per:'ciclo'; let d='', a='', rot='', ciclo=null, cortado=false, invalido=false;
  if(id==='ciclo'||id==='ciclo-1'){ let ym=pcYmDaData(cl,hoje); if(id==='ciclo-1') ym=pcYmSoma(ym,-1);
    const P=pcPeriodo(cl,ym); d=P.ini; a=P.fim; ciclo=P; rot=`Ciclo ${labelMesAbbr(ym)}`; }
  else if(id==='mes'||id==='mes-1'){ let ym=hoje.slice(0,7); if(id==='mes-1') ym=pcYmSoma(ym,-1); d=ym+'-01'; a=clfDiasNoMes(ym); rot=id==='mes'?'Este mês':'Mês passado'; }
  else { d=pcData(de)?de:''; a=pcData(ate)?ate:'';
    if(!d&&!a){ a=hoje; d=pcMaisDias(hoje,-29); invalido=true; } else if(!d) d=pcMaisDias(a,-29); else if(!a) a=clfMin(hoje,pcMaisDias(d,29));
    if(a<d){ const t=d; d=a; a=t; }
    if(pcDias(d,a)+1>CLF_MAX_DIAS){ a=pcMaisDias(d,CLF_MAX_DIAS-1); cortado=true; }
    rot='Período livre'; }
  const ateLido=clfMin(a,hoje); return { id, de:d, ate:a, ateLido, rot, ciclo, futuro:d>hoje, cortado, invalido, emAndamento:d<=hoje&&hoje<=a, dias:pcDias(d,a)+1 }; }

// ---- vínculos ----
// {contratos, planos, parcerias:[{c, via:'plano'|'nome', planos:[ids]}], sugeridos:{contratos}} — leitores: não criam nada.
function clfVinculos(id){
  const cl=clDe(id); const out={ contratos:[], planos:[], parcerias:[], sugeridos:{ contratos:[] } }; if(!cl) return out;
  const todos=clfItens(cfg.contratos).filter(ctItemValido);
  out.contratos=todos.filter(c=>c.clienteId===id);
  out.planos=clPlanosDe(id);
  const par=clfItens(cfg.parcerias).filter(ctItemValido); const mapa={};
  out.planos.forEach(p=>{ if(!p.contrato) return; const c=par.find(x=>x.id===p.contrato); if(!c) return;
    const m=mapa[c.id]=mapa[c.id]||{ c, via:'plano', planos:[] }; m.planos.push(p.id); });
  const nn=ctNorm(String(cl.nome||'').trim());
  if(CLF_PC_POR_NOME&&nn) par.forEach(c=>{ if(mapa[c.id]) return; if(ctNorm(String(c.consultoria||'').trim())===nn) mapa[c.id]={ c, via:'nome', planos:[] }; });
  out.parcerias=Object.keys(mapa).map(k=>mapa[k]);
  if(nn) out.sugeridos.contratos=todos.filter(c=>!c.clienteId&&ctNorm(String(c.cliente||'').trim())===nn);
  return out; }
// Código do contrato de parceria SEM pcCod/pcLista (que criam a lista).
const clfPcCod=(c)=>ctCod(clfItens(cfg.parcerias),c,'PC','pcSeq');
// [{k, origens:[{t:'contrato'|'plano'|'parceria', id, rot}]}] — chaves em maiúsculas, sem repetição, ordenadas.
function clfProjetosDe(V){ const m={};
  const add=(k,o)=>{ k=String(k||'').trim().toUpperCase(); if(!CLF_RE_PROJ.test(k)) return; (m[k]=m[k]||[]).push(o); };
  clfItens(V.contratos).forEach(c=>clfItens(c.projetos).forEach(k=>add(k,{ t:'contrato', id:c.id, rot:ctCodCli(c) })));
  clfItens(V.planos).forEach(p=>add(p.projeto,{ t:'plano', id:p.id, rot:p.nome||'(plano sem nome)' }));
  clfItens(V.parcerias).filter(x=>x.via==='nome').forEach(x=>pcFrentes(x.c).forEach(f=>add(f.proj,{ t:'parceria', id:x.c.id, rot:`${clfPcCod(x.c)} · ${f.nome||''}`.trim(), pelo:'nome' })));
  return Object.keys(m).sort().map(k=>({ k, origens:m[k] })); }
// O cliente de um projeto (a espinha do projeto usa): contrato com clienteId válido vence o plano, e este a parceria pelo nome.
// {cl, via:'contrato'|'plano'|'nome', outros:[clientes]} ou null.
function clfClienteDoProjeto(key){
  const k=String(key||'').trim().toUpperCase(); if(!CLF_RE_PROJ.test(k)) return null;
  const achados=[];
  clfItens(cfg.contratos).filter(ctItemValido).forEach(c=>{ if(c.clienteId&&clfItens(c.projetos).some(x=>String(x).toUpperCase()===k)){ const cl=clDe(c.clienteId); if(cl) achados.push({ cl, via:'contrato', r:0 }); } });
  clfItens(cfg.rentab&&cfg.rentab.planos).forEach(p=>{ if(p&&typeof p==='object'&&p.clienteId&&String(p.projeto||'').toUpperCase()===k){ const cl=clDe(p.clienteId); if(cl) achados.push({ cl, via:'plano', r:1 }); } });
  if(CLF_PC_POR_NOME) clfItens(cfg.parcerias).filter(ctItemValido).forEach(c=>{ if(!pcFrentes(c).some(f=>String(f.proj||'').toUpperCase()===k)) return;
    const n=ctNorm(String(c.consultoria||'').trim()); if(!n) return; const cl=clLista().find(x=>ctNorm(String(x.nome||'').trim())===n); if(cl) achados.push({ cl, via:'nome', r:2 }); });
  if(!achados.length) return null;
  achados.sort((a,b)=>a.r-b.r); const p=achados[0]; const outros=[]; achados.forEach(x=>{ if(x.cl.id!==p.cl.id&&!outros.some(o=>o.id===x.cl.id)) outros.push(x.cl); });
  return { cl:p.cl, via:p.via, outros }; }

// ---- tempo (cache de sessão, só leitura) ----
const clfChaveT=(de,ate)=>de+'|'+ate;
// {st:'ok',t} | {st:'lendo'} | {st:'erro',erro} | {st:'falta'} — procura uma leitura que COBRE [de, ate]. Não usa estado.tempo (o período do topo).
function clfTempoAcha(de, ate){ const C=estado.clf; const exato=clfChaveT(de,ate);
  const ks=Object.keys(C.tempo||{});
  for(let i=0;i<ks.length;i++){ const [d0,a0]=ks[i].split('|'); if(d0<=de&&a0>=ate) return { st:'ok', t:C.tempo[ks[i]] }; }
  const ct=estado.ctrl; if(ct&&ct.tempo&&ct.chaveT){ const [d0,a0]=String(ct.chaveT).split('|'); if(d0&&a0&&d0<=de&&a0>=ate) return { st:'ok', t:ct.tempo }; }
  const bs=Object.keys(C.tempoB||{}); for(let i=0;i<bs.length;i++){ if(!C.tempoB[bs[i]]) continue; const [d0,a0]=bs[i].split('|'); if(d0<=de&&a0>=ate) return { st:'lendo' }; }   // leitura em voo que cobre: espera por ela, não pede outra
  if((C.tempoErro||{})[exato]) return { st:'erro', erro:C.tempoErro[exato] };
  return { st:'falta' }; }
// Worklogs do intervalo [de, ate] de uma leitura.
function clfWl(t, de, ate){ return clfItens(t&&t.worklogs).filter(w=>{ const d=String((w&&w.d)||'').slice(0,10); return d&&d>=de&&d<=ate; }); }

// ---- horas e receita (porte por cliente do ctAgrega) ----
// {seg, segFat, rec, custo, margem, mgp, semCusto, semContrato:[chaves], porProj:{K:{seg,segFat,rec,custo,vh}}}
function clfFin(t, de, ate, chaves){
  const set=chaves instanceof Set?chaves:new Set(clfItens(chaves)); const meta=(t&&t.projetos)||{};
  const custoPad=Math.max(0,Number((cfg.ctrl||{}).custoPadrao)||0); const contratoDe={}; const semCusto=new Set();
  const R={ seg:0, segFat:0, rec:0, custo:0, margem:0, mgp:null, semCusto:0, semContrato:[], porProj:{} };
  clfWl(t,de,ate).forEach(w=>{ if(!set.has(w.p)) return;
    const cat=((meta[w.p]||{}).categoria)||'Sem categoria'; const s=Number(w.s)||0; const h=s/3600;
    const chB=ctCustoBase(w.a); const ch=chB>0?chB:custoPad; if(!(chB>0)) semCusto.add(w.a);
    if(!(w.p in contratoDe)) contratoDe[w.p]=ctContratoDe(w.p); const c=contratoDe[w.p]; const vh=c?(Number(c.valorHora)||0):0;
    const fa=wFat(w,cat); const rec=(fa&&vh)?h*vh:0;
    const P=R.porProj[w.p]=R.porProj[w.p]||{ seg:0, segFat:0, rec:0, custo:0, vh }; P.seg+=s; if(fa) P.segFat+=s; P.rec+=rec; P.custo+=h*ch;
    R.seg+=s; if(fa) R.segFat+=s; R.rec+=rec; R.custo+=h*ch; });
  R.margem=R.rec-R.custo; R.mgp=ctPct(R.margem,R.rec); R.semCusto=semCusto.size;
  R.semContrato=Object.keys(R.porProj).filter(k=>!(R.porProj[k].vh>0)).sort();
  return R; }

// ---- contratos ----
function clfSitContrato(c, hoje){
  if(c.fim&&c.fim<hoje) return { k:'enc', rot:`encerrado em ${dataBR(c.fim)}` };
  if(c.inicio&&c.inicio>hoje) return { k:'fut', rot:`começa em ${dataBR(c.inicio)}` };
  if(c.inicio) return { k:'vig', rot:`vigente desde ${dataBR(c.inicio)}` };
  return { k:'semini', rot:'sem início cadastrado' }; }
const clfVigente=(sit)=>sit.k==='vig'||sit.k==='semini';
function clfConsumoVazio(st, extra){ return Object.assign({ st, h:0, hFat:0, rot:'', de:'', ate:'' }, extra||{}); }
// {c, cod, tipo, sit, vh, contratado, unid, consumo:{st,h,hFat,rot,de,ate}, saldo, pct, ciclo, faturado, alocado, lerChave}
function clfContratoLinha(c, hoje, P, tPer){
  const tipo=c.tipo||'ams'; const L={ c, cod:ctCodCli(c), tipo, sit:clfSitContrato(c,hoje), vh:Number(c.valorHora)||0, contratado:0, unid:'', consumo:clfConsumoVazio('vazio'), saldo:null, pct:null, ciclo:null, faturado:null, alocado:null, lerChave:null };
  const projetos=clfItens(c.projetos);
  if(tipo==='ams'){
    const cyc=amsCicloVigente(c,hoje); const ate=clfMin(cyc.end,hoje); const key=`${c.id}|${cyc.start}|${ate}`;
    L.contratado=amsHorasCiclo(c); L.unid='/ciclo'; L.ciclo={ start:cyc.start, end:cyc.end, ate, rot:amsLabelCiclo(cyc), n:cyc.n }; L.faturado=amsCicloFaturado(c,cyc);
    const dias=pcDias(cyc.start,ate)+1; L.lerChave={ de:cyc.start, ate, auto:dias<=CLF_AUTO_DIAS, dias };
    if(!projetos.length) return L;
    const am=estado.ams; let wl=null; let T=null;
    if(am&&am.dados&&am.range===key) wl=am.dados; else { T=clfTempoAcha(cyc.start,ate); if(T.st==='ok') wl=clfItens(T.t.worklogs); }
    if(wl){ const k=amsConsumoCiclo(c,cyc,wl); const h=k.segFat/3600;
      L.consumo={ st:'ok', h, hFat:h, hTotal:k.seg/3600, rot:`ciclo ${L.ciclo.rot} · ${dataBR(cyc.start)} → ${dataBR(ate)}, só horas faturáveis`, de:cyc.start, ate };
      L.saldo=L.contratado-h; L.pct=L.contratado>0?h/L.contratado*100:null; }
    else L.consumo=clfConsumoVazio(T?T.st:'falta',{ erro:T&&T.erro, rot:`ciclo ${L.ciclo.rot}`, de:cyc.start, ate });
    return L; }
  if(tipo==='horas'){
    L.contratado=Number(c.horasContratadas)||0; L.alocado=ctAlocTotal(c); if(!projetos.length) return L;
    const k=ctRealChave(c);
    if(k===''){
      // sem início cadastrado: o consumo "desde o início" não existe — a ficha usa o período dela (o do topo fica escondido na tela)
      L.consumo=clfConsumoPeriodo(c,P,tPer); L.consumo.rot='no período da ficha (cadastre o início da vigência para ver desde o começo)'; }
    else { const [de,ate]=k.split('|'); const R=estado.ctReal; L.lerChave={ de, ate, auto:pcDias(de,ate)+1<=CLF_AUTO_DIAS, dias:pcDias(de,ate)+1, real:true };
      if(R&&R.dados&&R.dados[k]){ const cs=ctConsumoHoras(c);
        L.consumo={ st:'ok', h:cs.seg/3600, hFat:cs.segFat/3600, rot:`desde ${dataBR(cs.de)}${cs.cortado?' (últimos 12 meses)':''}`, de:cs.de, ate:cs.ate, porProj:cs.porProj };
        L.saldo=L.contratado-L.consumo.h; L.pct=L.contratado>0?L.consumo.h/L.contratado*100:null; }
      else if(R&&R.busy&&R.busy[k]) L.consumo=clfConsumoVazio('lendo',{ de, ate });
      else if(R&&R.erro&&R.erro[k]) L.consumo=clfConsumoVazio('erro',{ erro:R.erro[k], de, ate });
      else L.consumo=clfConsumoVazio('falta',{ de, ate }); }
    return L; }
  // bolsa / projeto: o período da ficha (sem saldo — a vigência inteira não é lida aqui)
  L.contratado=Number(c.horasContratadas)||0; if(!projetos.length) return L;
  L.consumo=clfConsumoPeriodo(c,P,tPer); return L; }
// Consumo do contrato no PERÍODO da ficha (bolsa/projeto, e horas abertas sem início).
function clfConsumoPeriodo(c, P, tPer){
  if(!tPer||tPer.st!=='ok') return clfConsumoVazio(tPer?tPer.st:'falta',{ erro:tPer&&tPer.erro, rot:'no período da ficha', de:P.de, ate:P.ateLido });
  const wl=clfWl(tPer.t,P.de,P.ateLido); const k=consumoContrato(c,wl); const set=new Set(clfItens(c.projetos)); let fat=0; wl.forEach(w=>{ if(set.has(w.p)&&w.f) fat+=(Number(w.s)||0); });
  return { st:'ok', h:k.seg/3600, hFat:fat/3600, rot:'no período da ficha', de:P.de, ate:P.ateLido }; }

// ---- planos ----
function clfCenario(p){ const cs=clfItens(p&&p.cenarios); return cs.find(x=>x&&x.id===p.cenario)||cs[0]||null; }
const clfCenarioValido=(p)=>clfItens(p&&p.cenarios).some(x=>x&&x.id===p.cenario);
// {p, tipo, st, semCenario, calc, vendPer, gastoPer, deltaPer, deltaPerR, total, cicloTxt}
function clfPlanoLinha(p, hoje, P, tPer){
  const L={ p, tipo:rpTipo(p), st:rpStatus(p), semCenario:false, calc:null, vendPer:null, gastoPer:null, deltaPer:null, deltaPerR:null, total:{ st:'falta' }, cicloTxt:'' };
  try{ L.cicloTxt=rpCicloTxt(p); }catch(e){ L.cicloTxt=''; }
  const cen=clfCenario(p); if(!cen){ L.semCenario=true; L.total={ st:'semcenario' }; return L; }
  const calc=rpCalc(p,cen); L.calc=calc;
  L.vendPer=P.futuro?0:rpVendEntre(p,clfMax(P.de,p.inicio||P.de),P.ateLido);
  if(p.projeto&&tPer&&tPer.st==='ok'){ let seg=0; clfWl(tPer.t,P.de,P.ateLido).forEach(w=>{ if(w.p===p.projeto) seg+=(Number(w.s)||0); }); L.gastoPer=seg/3600;
    L.deltaPer=L.vendPer-L.gastoPer; L.deltaPerR=L.deltaPer*(L.tipo==='fechado'?(calc.vhEfetivo||0):calc.vh); }
  else if(p.projeto) L.gastoPer=tPer?{ st:tPer.st }:null;
  // desde o início do plano: só com a leitura da 💹 já em memória (estado.rentab.tempo) e cenário válido (rpReal/rpVgCalc chamam rpCenario, que grava)
  const k=rpRealChave(p); const R=estado.rentab||{};
  if(!p.projeto) L.total={ st:'semprojeto' };
  else if(!k) L.total={ st:'semprazo' };
  else if(R.tempo&&R.tempo[k]){ if(!clfCenarioValido(p)) L.total={ st:'semcenario' };
    else { const vg=rpVgCalc(p,calc,rpReal(p,calc)); L.total=vg?{ st:'ok', ...vg.periodo }:{ st:'falta' }; } }
  else if(R.tempoB&&R.tempoB[k]) L.total={ st:'lendo', k };
  else if(R.tempoErro&&R.tempoErro[k]) L.total={ st:'erro', erro:R.tempoErro[k], k };
  else L.total={ st:'falta', k };
  return L; }

// ---- próximas notas ----
// Lista ordenada por data, janela [hoje−31, hoje+60]. {data, origem, rot, ym, de, ate, horas, valor, st:{k,rot}, atrasada, alvo}
function clfNotas(V, hoje){
  const de=pcSomaDias(hoje,-CLF_NOTAS_ATRAS), ate=pcSomaDias(hoje,CLF_NOTAS_FRENTE); const out=[]; const parIds=new Set(clfItens(V.parcerias).map(x=>x.c.id));
  clfItens(V.planos).forEach(p=>{
    try{ const cen=clfCenario(p); if(!cen) return; const tipo=rpTipo(p); const calc=rpCalc(p,cen);
      if(tipo==='horas'){ if(p.contrato&&parIds.has(p.contrato)) return;   // a nota deste plano é a do contrato de parceria (bloco 🤝): não conta duas vezes
        const per=rpPeriodosFat(p,calc); const itens=rpOdooItens(p,per);
        per.forEach((Q,i)=>{ if(!(Q.horas>0)||Q.encerrado||Q.nota<de||Q.nota>ate) return;
          const st=p.odoo&&p.odoo.id?rpOdooStatusItem(p,itens[i]):{ k:'sem', rot:'sem ordem no Odoo' }; if(st.k==='faturado'||st.k==='pago') return;
          out.push({ data:Q.nota, origem:'plano', rot:`${p.nome||'(plano)'} · ${labelMesAbbr(Q.ym)}`, ym:Q.ym, de:Q.iniPlano, ate:Q.fimPlano, horas:Q.horas, valor:Q.valor, st, atrasada:Q.nota<hoje, alvo:{ t:'plano', id:p.id } }); }); }
      else if(tipo==='fechado'&&calc.marcos){
        calc.marcos.lista.forEach(m=>{ if(m.fat||!m.data||m.data<de||m.data>ate) return;
          out.push({ data:m.data, origem:'plano', rot:`${p.nome||'(plano)'} · marco ${m.nome||''}`.trim(), ym:m.data.slice(0,7), de:'', ate:'', horas:null, valor:m.valor, st:{ k:'marco', rot:'marco ainda não faturado' }, atrasada:m.data<hoje, alvo:{ t:'plano', id:p.id } }); }); }
    }catch(e){ try{ console.error('[ficha] notas do plano', p&&p.id, e); }catch(_){} } });
  if(Array.isArray(cfg.parcerias)&&cfg.parcerias.length&&parIds.size){
    pcNotasPendentes(hoje,CLF_NOTAS_ATRAS,CLF_NOTAS_FRENTE).filter(x=>parIds.has(x.c.id)).forEach(x=>{
      out.push({ data:x.P.nota, origem:'parceria', rot:`${clfPcCod(x.c)} · ${x.c.consultoria||''} · ${labelMesAbbr(x.ym)}`, ym:x.ym, de:x.P.iniPlano, ate:x.P.fimPlano, horas:x.horas, valor:x.total, st:x.st, atrasada:x.atrasada, alvo:{ t:'parceria', id:x.c.id } }); }); }
  return out.sort((a,b)=>a.data.localeCompare(b.data)||a.rot.localeCompare(b.rot,'pt')); }

// ---- semáforo do status report (só o manual da linha sr_<KEY>; sem escolha = automático) ----
// {st:'ok'|'lendo'|'erro'|'falta', sem, saude, resumo, em, por}
function clfSrDe(k){ const C=estado.clf; const x=C.sr&&C.sr[k];
  if(x&&x.ok&&(Date.now()-x.em)<CLF_SR_TTL){ const d=x.dados; if(!d||typeof d!=='object') return { st:'ok', sem:true, saude:'', resumo:'', em:'', por:'' };
    return { st:'ok', sem:false, saude:String(d.saude||''), resumo:String(d.resumo||''), em:String(d.atualizadoEm||''), por:String((d.por&&d.por.nome)||'') }; }
  if(C.srB&&C.srB[k]) return { st:'lendo' };
  if(x&&x.erro) return { st:'erro', erro:x.erro };
  return { st:'falta' }; }

// ---- seletor ----
function clfResumoCliente(cl, hoje){
  const V=clfVinculos(cl.id); const pj=clfProjetosDe(V); let ciclo=null; try{ const P=pcPeriodo(cl,pcYmDaData(cl,hoje)); ciclo={ ym:P.ym, ini:P.ini, fim:P.fim }; }catch(e){ ciclo=null; }
  return { id:cl.id, nome:cl.nome||'(sem nome)', nContratos:V.contratos.length, nPlanos:V.planos.length, nProjetos:pj.length, nParcerias:V.parcerias.length, nSugeridos:V.sugeridos.contratos.length, ciclo }; }
// Contratos e planos ainda sem cliente ligado (para o card "Sem cliente ligado").
function clfSemCliente(){ const ok=(id)=>!!id&&!!clDe(id);
  return { contratos:clfItens(cfg.contratos).filter(ctItemValido).filter(c=>!ok(c.clienteId)), planos:clfItens(cfg.rentab&&cfg.rentab.planos).filter(p=>p&&typeof p==='object'&&!ok(p.clienteId)) }; }

// ---- a ficha ----
// { ok, cl, hoje, veFin, periodo, vinc, projetos, tempo, fin, contratos, planos, notas, erros:{bloco:msg} } — PURA: nunca faz fetch.
function clFicha(id, per, o){
  const cl=CLF_RE_ID.test(String(id||''))?clDe(id):null; if(!cl) return { ok:false, motivo:'nao-achei' };
  const hoje=hojeSP(); const erros={}; const snap=clfSnap();
  const sec=(nome, fn, padrao)=>{ try{ return fn(); }catch(e){ erros[nome]=clfMsg(e); try{ console.error('[ficha]', nome, e); }catch(_){} return padrao; } };
  try{
    const F={ ok:true, cl, hoje, veFin:clfVeFin(), erros };
    F.periodo=sec('periodo',()=>clfPeriodo(cl,per,hoje,o&&o.de,o&&o.ate),null);
    if(!F.periodo){ F.ok=false; F.motivo='erro'; return F; }
    F.vinc=sec('vinc',()=>clfVinculos(id),{ contratos:[], planos:[], parcerias:[], sugeridos:{ contratos:[] } });
    F.projetos=sec('projetos',()=>clfProjetosDe(F.vinc),[]);
    const chaves=F.projetos.map(x=>x.k);
    F.tempo=sec('tempo',()=>{ if(!chaves.length) return { st:'vazio' }; if(F.periodo.futuro) return { st:'futuro' }; return clfTempoAcha(F.periodo.de,F.periodo.ateLido); },{ st:'erro', erro:erros.tempo||'' });
    F.fin=F.tempo.st==='ok'?sec('fin',()=>clfFin(F.tempo.t,F.periodo.de,F.periodo.ateLido,new Set(chaves)),null):null;
    F.contratos=F.vinc.contratos.map(c=>{ try{ return clfContratoLinha(c,hoje,F.periodo,F.tempo); }catch(e){ try{ console.error('[ficha] contrato', c&&c.id, e); }catch(_){} return { c, erro:clfMsg(e), cod:'', sit:{ k:'erro', rot:'' } }; } });
    F.planos=F.vinc.planos.map(p=>{ try{ return clfPlanoLinha(p,hoje,F.periodo,F.tempo); }catch(e){ try{ console.error('[ficha] plano', p&&p.id, e); }catch(_){} return { p, erro:clfMsg(e), semCenario:false, total:{ st:'erro' } }; } });
    F.notas=sec('notas',()=>clfNotas(F.vinc,hoje),[]);
    return F;
  } finally { clfRestaura(snap); } }

// ===========================================================================
// TELA (T2): clfRender → raiz única .clf-tela. Leituras só em clfGarante (depois do cálculo); nada grava.
// ===========================================================================
// Fonte ÚNICA dos indicadores (tile, tooltip e glossário "📖 Como ler esta ficha"): indicador novo = entrada nova aqui.
const CLF_IND={
  horas:{ rot:'Horas no período', oque:'Horas apontadas nos projetos ligados ao cliente dentro do período escolhido (ciclo de faturamento do cliente por padrão), lidas até hoje.', ler:'Compare com o ciclo anterior. As horas faturáveis são só as de tipo e categoria faturáveis (a mesma regra da 🏦 Controladoria).' },
  fat:{ rot:'% faturável', oque:'Parte das horas do período que é faturável (tipo da hora E categoria do projeto).', ler:'Abaixo do esperado = muito tempo em horas que não geram nota (internas, não faturáveis).' },
  rec:{ rot:'Receita do período', oque:'Horas faturáveis × valor-hora do contrato 🏢 do projeto — a regra da 🏦 Controladoria. Não é o faturamento emitido nem o previsto dos planos.', ler:'Projeto sem contrato 🏢 com valor-hora entra com receita zero (aparece como "sem valor-hora"). O previsto a faturar está em "Próximas notas".' },
  custo:{ rot:'Custo do período', oque:'Horas × custo/h de cada pessoa (Odoo ou digitado); sem custo cadastrado usa o custo padrão da Controladoria.', ler:'É custo de mão de obra apontada; não inclui terceirizados fora do Jira nem despesas.' },
  margem:{ rot:'Margem do período', oque:'Receita − custo do período e a margem percentual.', ler:'Semáforo da Controladoria: ≥ 30% saudável · 10–30% apertada · abaixo de 10% no vermelho.' },
  contratos:{ rot:'Contratos vigentes', oque:'Contratos 🏢 ligados a este cliente que estão vigentes hoje, sobre o total ligado.', ler:'Contrato sem cliente ligado não entra: ligue no ✏️ editar do contrato.' },
  projetos:{ rot:'Projetos', oque:'Projetos do Jira do cliente: dos contratos, dos planos e das parcerias (estas "pelo nome" da consultoria).', ler:'Projeto de outro cliente que apareça aqui = revise o vínculo do contrato ou do plano.' },
  nota:{ rot:'Próxima nota', oque:'A nota mais próxima a emitir, entre planos de horas, marcos de escopo fechado e contratos de parceria do cliente.', ler:'Atrasada aparece em vermelho. O valor só aparece para quem vê R$.' },
};
const CLF_PER_ROT=Object.fromEntries(CLF_PERS);
const clfTipAttr=(k)=>{ const e=CLF_IND[k]; return e?` data-clf-ind="${escA(k)}" data-tip="${escA(e.oque)}" data-tip2="${escA('Como ler: '+e.ler)}"`:''; };
const clfH=(h)=>(typeof fmtHd==='function'?fmtHd(h):(Math.round((Number(h)||0)*10)/10)+'h');
const clfR=(v)=>(typeof fmtBRL==='function'?fmtBRL(v):'R$ '+(Number(v)||0).toFixed(2));
const clfDtBR=(d)=>(typeof dataBR==='function'&&d?dataBR(d):(d||'—'));

// ---- leituras (só aqui há fetch) ----
function clfTempoPede(de, ate){ const C=estado.clf; const k=clfChaveT(de,ate); if(C.tempo[k]||C.tempoErro[k]) return;
  if(clfTempoAcha(de,ate).st!=='falta') return;   // já coberto (cache ou leitura em voo)
  C.tempoB[k]=true;
  fetch(`/api/tempo?desde=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`).then(r=>r.json()).then(j=>{ C.tempoB[k]=false;
    if(j&&!j.erro&&Array.isArray(j.worklogs)) C.tempo[k]=j; else C.tempoErro[k]=(j&&j.erro)||'Falha ao ler as horas.'; })
    .catch(e=>{ C.tempoB[k]=false; C.tempoErro[k]=(typeof humanizaErro==='function'?humanizaErro(e):clfMsg(e)); })
    .finally(()=>clfRenderAdia()); }
function clfSrBombeia(){ const C=estado.clf; C._srFila=C._srFila||[]; C._srAtivos=C._srAtivos||0;
  while(C._srAtivos<CLF_SR_PAR&&C._srFila.length){ const k=C._srFila.shift(); C._srAtivos++;
    fetch('/api/config?sr='+encodeURIComponent(k),{ cache:'no-store' }).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(j=>{ C.sr[k]=(j&&j.ok)?{ ok:true, em:Date.now(), dados:j.dados||null }:{ erro:(j&&j.erro)||'Falha ao ler o status report.', em:Date.now() }; })
      .catch(e=>{ C.sr[k]={ erro:clfMsg(e), em:Date.now() }; })
      .finally(()=>{ C.srB[k]=false; C._srAtivos--; clfSrBombeia(); clfRenderAdia(); }); } }
function clfSrGarante(keys){ const C=estado.clf; C._srFila=C._srFila||[];
  keys.forEach(k=>{ const x=C.sr[k]; if(x&&x.ok&&(Date.now()-x.em)<CLF_SR_TTL) return; if(C.srB[k]) return; if(x&&x.erro) return;   // falha não se repete sozinha
    C.srB[k]=true; C._srFila.push(k); });
  clfSrBombeia(); }
function clfGarante(F){ try{ const C=estado.clf; const P=F.periodo; if(!P) return;
  if(F.tempo&&F.tempo.st==='falta'&&F.projetos.length&&!P.futuro&&(pcDias(P.de,P.ateLido)+1)<=CLF_AUTO_DIAS) clfTempoPede(P.de,P.ateLido);
  clfItens(F.contratos).forEach(L=>{ if(L&&L.consumo&&L.consumo.st==='falta'&&L.lerChave&&L.lerChave.auto){
    if(L.lerChave.real){ if(typeof ctGaranteReal==='function') ctGaranteReal(L.c); } else clfTempoPede(L.lerChave.de,L.lerChave.ate); } });
  clfSrGarante(F.projetos.map(x=>x.k).slice(0,C.srLim||CLF_SR_LOTE)); }catch(e){ try{ console.error('[ficha] garante', e); }catch(_){} } }
let _clfAdiaT=0;
function clfRenderAdia(){ if(_clfAdiaT) return; _clfAdiaT=setTimeout(()=>{ _clfAdiaT=0; if(estado.vista==='clficha') clfRender(); },80); }

// ---- blocos ----
const clfAv=(m)=>`<div class="aviso">${m}</div>`;
function clfBloco(id, titulo, sub, fn, F){
  let corpo; try{ corpo=fn(); }catch(e){ try{ console.error('[ficha] bloco', id, e); }catch(_){} corpo=clfAv(`⚠ Não consegui montar este bloco (${esc(clfMsg(e))}). Os outros blocos seguem funcionando.`); }
  if(F&&F.erros&&F.erros[id]&&corpo.indexOf('Não consegui montar')<0) corpo=clfAv(`⚠ Não consegui calcular este bloco (${esc(F.erros[id])}). Os outros blocos seguem funcionando.`)+corpo;
  return `<section class="card full clf-bloco" data-clf-bloco="${escA(id)}"><h3>${titulo}${sub?` <span class="muted small">${sub}</span>`:''}</h3>${corpo}</section>`; }
const clfTile=(id,v,s,cls,extra)=>`<div class="vg-k ${cls||''}"${clfTipAttr(id)}${extra||''}><div class="v">${v}</div><div class="l">${esc(CLF_IND[id].rot)}</div>${s?`<div class="s">${s}</div>`:''}</div>`;
function clfKpisHTML(F){
  const t=F.tempo||{ st:'erro' }; const fin=F.fin; const fo=F.veFin; const st=t.st; let tiles=[];
  const semLer=(id)=>{ if(st==='lendo'||st==='falta') return clfTile(id,'…','lendo as horas…','',' aria-busy="true"');
    if(st==='erro') return clfTile(id,'⚠',`não consegui ler as horas <button class="btn" data-clf-tempo-retry>↻ tentar de novo</button>`,'bad');
    if(st==='vazio') return clfTile(id,'—','sem projetos ligados','');
    if(st==='futuro') return clfTile(id,'—','o período ainda não começou',''); return null; };
  const doTempo=['horas','fat'].concat(fo?['rec','custo','margem']:[]);
  doTempo.forEach(id=>{ const w=semLer(id); if(w){ tiles.push(w); return; }
    if(id==='horas') tiles.push(clfTile('horas',clfH(fin.seg/3600),`${clfH(fin.segFat/3600)} faturáveis`,''));
    else if(id==='fat') tiles.push(clfTile('fat',fin.seg>0?Math.round(fin.segFat/fin.seg*100)+'%':'—','das horas do período',''));
    else if(id==='rec') tiles.push(clfTile('rec',clfR(fin.rec),fin.semContrato.length?`⚠ ${fin.semContrato.length} projeto(s) sem valor-hora`:'horas faturáveis × valor-hora',fin.semContrato.length?'warn':''));
    else if(id==='custo') tiles.push(clfTile('custo',clfR(fin.custo),fin.semCusto?`${fin.semCusto} pessoa(s) sem custo próprio (usa o padrão)`:'horas × custo/h',''));
    else { const sm=ctSemaforo(fin.mgp); tiles.push(clfTile('margem',clfR(fin.margem),`${fin.mgp==null?'sem receita':(Math.round(fin.mgp*10)/10).toLocaleString('pt-BR')+'%'} · ${sm[0]}`,sm[1]==='ok'?'good':sm[1]==='aten'?'warn':sm[1]==='crit'?'bad':'')); } });
  const cs=clfItens(F.contratos); const vig=cs.filter(L=>L&&L.sit&&clfVigente(L.sit)).length;
  tiles.push(clfTile('contratos',`${vig}/${cs.length}`,cs.length?'vigentes / ligados':'nenhum contrato ligado',cs.length?'':'warn'));
  tiles.push(clfTile('projetos',String(clfItens(F.projetos).length),F.vinc&&F.vinc.parcerias.length?`${F.vinc.parcerias.length} parceria(s) ligada(s)`:'do Jira, ligados ao cliente',''));
  const pn=clfItens(F.notas).find(n=>n.data>=F.hoje)||clfItens(F.notas)[0];
  tiles.push(clfTile('nota',pn?clfDtBR(pn.data):'—',pn?(`${esc(pn.rot)}${fo&&pn.valor!=null?' · '+clfR(pn.valor):''}`):'nenhuma nota na janela',pn&&pn.atrasada?'bad':''));
  return `<div class="vg-hero clf-kpis">${tiles.join('')}</div>`; }

function clfContratosHTML(F){
  const ls=clfItens(F.contratos); const V=F.vinc; let h='';
  if(!ls.length) h+=`<div class="muted small">Nenhum contrato 🏢 está ligado a este cliente ainda. Para ligar: abra <button class="lnk-ficha" data-goto="admin">📑 Contratos › 🏢 Clientes</button>, ✏️ edite o contrato e escolha o cliente.</div>`;
  else { const rows=ls.map(L=>{ if(L.erro) return `<tr><td colspan="${F.veFin?9:8}"><span class="badge">${esc(L.c&&L.c.id||'')}</span> <span class="muted small">⚠ não consegui montar este contrato (${esc(L.erro)})</span></td></tr>`;
      const c=L.c; const co=L.consumo||{}; let cons, saldo='—', barra='';
      if(co.st==='ok'){ cons=`${clfH(co.h)}<div class="muted small">${esc(co.rot||'')}</div>`;
        if(L.saldo!=null){ saldo=`<b class="${L.saldo<0?'clf-neg':''}">${clfH(L.saldo)}</b>`; if(L.pct!=null){ const pc=Math.max(0,Math.min(100,Math.round(L.pct))); const cor=L.pct>100?'#D20A0A':L.pct>=85?'#E8A33D':'#188918'; barra=`<span class="ad-aloc-track"><i style="width:${pc}%;background:${cor}"></i></span> <span class="muted small">${Math.round(L.pct)}%</span>`; } } else saldo='<span class="muted small">sem saldo no período</span>'; }
      else if(co.st==='lendo') cons='<span aria-busy="true">…</span>';
      else if(co.st==='erro') cons=`<span class="clf-neg">⚠ ${esc(co.erro||'erro')}</span> <button class="btn rt-step" data-clf-ler="${escA(c.id)}">↻ tentar de novo</button>`;
      else if(co.st==='falta') cons=(L.lerChave&&L.lerChave.auto)?'<span aria-busy="true">…</span>':`<button class="btn rt-step" data-clf-ler="${escA(c.id)}">↻ ler o ${L.tipo==='ams'?'ciclo':'consumo'} ${esc(L.ciclo?L.ciclo.rot:'')}</button><div class="muted small">${L.lerChave?L.lerChave.dias+' dias de leitura':''}</div>`;
      else cons='<span class="muted small">—</span>';
      const ams=L.tipo==='ams'?(L.faturado?'<span class="ct-sem ok">✓ ciclo faturado</span>':'<span class="ct-sem na">● pendente</span>'):'';
      return `<tr data-clf-ct="${escA(c.id)}"><td data-rot="ID"><b>${esc(L.cod||'')}</b></td><td data-rot="Tipo">${esc(typeof rotuloTipo==='function'?rotuloTipo(L.tipo):L.tipo)}</td><td data-rot="Situação"><span class="ct-sem ${L.sit.k==='vig'?'ok':L.sit.k==='enc'?'crit':'na'}">${esc(L.sit.rot)}</span></td>`
        +(F.veFin?`<td class="num" data-rot="Valor-hora">${L.vh?clfR(L.vh):'—'}</td>`:'')
        +`<td class="num" data-rot="Contratado">${L.contratado?clfH(L.contratado)+'<span class="muted small">'+esc(L.unid||'')+'</span>':'—'}${L.alocado!=null?`<div class="muted small">alocado ${clfH(L.alocado)}</div>`:''}</td><td class="num" data-rot="Consumido">${cons}</td><td class="num" data-rot="Saldo">${saldo}${ams?'<div>'+ams+'</div>':''}</td><td data-rot="Uso">${barra}</td>`
        +`<td data-rot="Ações"><button class="btn" data-clf-contrato="${escA(c.id)}">✏️ editar</button> <button class="btn" data-clf-apur="${escA(c.id)}">🛡 apuração</button></td></tr>`; }).join('');
    h+=`<div class="scroll-x"><table class="mp-tab-mini clf-tab"><thead><tr><th>ID</th><th>Tipo</th><th>Situação</th>${F.veFin?'<th class="num">Valor-hora</th>':''}<th class="num">Contratado</th><th class="num">Consumido</th><th class="num">Saldo</th><th>Uso</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`; }
  const sg=V&&V.sugeridos?clfItens(V.sugeridos.contratos):[];
  if(sg.length) h+=`<div class="aviso" style="margin-top:8px">💡 ${sg.length===1?'Este contrato tem':'Estes contratos têm'} o nome do cliente mas não ${sg.length===1?'está ligado':'estão ligados'} a ele (por isso ${sg.length===1?'não entra':'não entram'} nos números): ${sg.map(c=>`<button class="lnk-ficha" data-clf-contrato="${escA(c.id)}">${esc(ctCodCli(c))}</button>`).join(' ')} — ligue no ✏️ editar.</div>`;
  return h; }

function clfSrCelula(k, ativo){
  if(!ativo) return '<span class="muted small" data-tip="Semáforo lido sob demanda: use ver mais">—</span>';
  const s=clfSrDe(k);
  if(s.st==='lendo'||s.st==='falta') return '<span aria-busy="true">…</span>';
  if(s.st==='erro') return `<span class="clf-neg" data-tip="${escA(String(s.erro||''))}">⚠</span> <button class="btn rt-step" data-clf-sr-retry="${escA(k)}">↻</button>`;
  if(s.sem) return '<span class="muted small">— sem status report</span>';
  const e=SR_SEMAFORO[s.saude]; return e?`<span class="clf-sem">${e.ic} ${esc(e.rot)}</span>`:'<span class="muted small">⚪ automático</span>'; }
function clfProjetosHTML(F){
  const ps=clfItens(F.projetos); if(!ps.length) return `<div class="muted small">Nenhum projeto do Jira ligado a este cliente: os projetos vêm dos contratos 🏢, dos planos 💹 e das parcerias 🤝 do cliente.</div>`;
  const C=estado.clf; const lim=C.srLim||CLF_SR_LOTE; const meta=(F.tempo&&F.tempo.st==='ok'&&F.tempo.t&&F.tempo.t.projetos)||{}; const fo=F.veFin;
  const rows=ps.map((x,i)=>{ const k=x.k; const m=(F.fin&&F.fin.porProj[k])||null; const cat=(meta[k]&&meta[k].categoria)||'—'; const sr=clfSrDe(k); const ativo=i<lim;
    const org=x.origens.map(o=>`${o.t==='contrato'?'📑':o.t==='plano'?'💹':'🤝'} ${esc(o.rot)}${o.pelo?' <span class="badge">pelo nome</span>':''}`).join('<br>');
    let resumo=''; if(ativo&&sr.st==='ok'&&!sr.sem&&sr.resumo){ const dias=sr.em?pcDias(String(sr.em).slice(0,10),F.hoje):null; const txt=sr.resumo.length>140?sr.resumo.slice(0,137)+'…':sr.resumo;
      resumo=`<div class="clf-resumo">${esc(txt)}</div><div class="muted small">${sr.por?'por '+esc(sr.por):''}${dias!=null&&dias>=0?(sr.por?' · ':'')+'há '+dias+' dia(s)':''}</div>`; }
    const horas=m?clfH(m.seg/3600):(F.tempo&&F.tempo.st==='ok'?clfH(0):'…'); const fat=m?clfH(m.segFat/3600):(F.tempo&&F.tempo.st==='ok'?clfH(0):'…');
    const rec=m?(m.vh>0?clfR(m.rec):'<span class="badge" data-tip="Nenhum contrato 🏢 com valor-hora cobre este projeto: a receita dele sai zerada">sem valor-hora</span>'):(F.tempo&&F.tempo.st==='ok'?clfR(0):'…');
    return `<tr data-clf-proj="${escA(k)}"><td data-rot="Projeto">${typeof projChipsFicha==='function'?projChipsFicha([k]):esc(k)} <span class="muted small">${esc(typeof projNome==='function'?projNome(k):k)}</span></td><td data-rot="Categoria">${esc(cat)}</td><td data-rot="Origem" class="small">${org}</td><td data-rot="Semáforo">${clfSrCelula(k,ativo)}</td><td data-rot="Situação">${resumo||'<span class="muted small">—</span>'}</td><td class="num" data-rot="Horas">${horas}</td><td class="num" data-rot="Faturáveis">${fat}</td>${fo?`<td class="num" data-rot="Receita">${rec}</td>`:''}<td data-rot="Ações"><button class="btn" data-clf-sr="${escA(k)}">📋 status report</button></td></tr>`; }).join('');
  const mais=ps.length>lim?`<div class="muted small" style="margin-top:6px">Semáforo lido para ${lim} de ${ps.length} projetos — outros ${ps.length-lim}. <button class="btn" data-clf-sr-mais>ver os outros ${ps.length-lim}</button></div>`:'';
  return `<div class="scroll-x"><table class="mp-tab-mini clf-tab"><thead><tr><th>Projeto</th><th>Categoria</th><th>Origem</th><th>Semáforo</th><th>Situação</th><th class="num">Horas</th><th class="num">Faturáveis</th>${fo?'<th class="num">Receita</th>':''}<th></th></tr></thead><tbody>${rows}</tbody></table></div>${mais}<div class="muted small" style="margin-top:6px">O semáforo é o <b>manual</b> do 📋 Status report (o sugerido pela regra automática não é calculado aqui).</div>`; }

function clfPlanosHTML(F){
  const ls=clfItens(F.planos); if(!ls.length) return `<div class="muted small">Nenhum plano 💹 ligado a este cliente. Ligue no ✏️ Dados do projeto do plano (campo cliente) da 💹 Rentabilidade.</div>`;
  const fo=F.veFin; const rows=ls.map(L=>{ const p=L.p||{};
    if(L.erro) return `<tr><td colspan="${fo?7:6}">${esc(p.nome||p.id||'')} <span class="muted small">⚠ não consegui montar este plano (${esc(L.erro)})</span></td></tr>`;
    const nome=`<button class="lnk-ficha" data-clf-plano="${escA(p.id)}">${esc(p.nome||'(sem nome)')}</button>${p.projeto?`<div class="muted small">${esc(p.projeto)}</div>`:''}`;
    const tipo=(typeof RP_TIPOS!=='undefined'&&RP_TIPOS[L.tipo])?RP_TIPOS[L.tipo][0]+' '+RP_TIPOS[L.tipo][1]:esc(L.tipo||'');
    if(L.semCenario) return `<tr><td data-rot="Plano">${nome}</td><td data-rot="Tipo">${tipo}</td><td data-rot="Status">${esc((L.st||[])[1]||'')}</td><td colspan="${fo?4:3}"><span class="muted small">⚠ plano sem cenário: abra o plano na 💹 Rentabilidade para criar o cenário (a ficha não altera nada).</span></td></tr>`;
    const gasto=(L.gastoPer&&typeof L.gastoPer==='object')?(L.gastoPer.st==='erro'?'<span class="clf-neg">⚠</span>':'…'):(L.gastoPer==null?'—':clfH(L.gastoPer));
    const delta=L.deltaPer!=null?`${rpDeltaHTML(L.deltaPer,'h')}${fo&&L.deltaPerR!=null?'<div class="small">'+rpDeltaHTML(L.deltaPerR,'r')+'</div>':''}`:'—';
    let tot; const T=L.total||{};
    if(T.st==='ok') tot=`${rpDeltaHTML(T.delta,'h')}<div class="muted small">${clfH(T.vend)} vend. × ${clfH(T.gasto)} gasto</div>${fo?'<div class="small">'+rpDeltaHTML(T.deltaR,'r')+'</div>':''}`;
    else if(T.st==='falta') tot=`<button class="btn rt-step" data-clf-plano-real="${escA(p.id)}">↻ ler desde o início</button>`;
    else if(T.st==='lendo') tot='<span aria-busy="true">…</span>'; else if(T.st==='erro') tot=`<span class="clf-neg">⚠</span> <button class="btn rt-step" data-clf-plano-real="${escA(p.id)}">↻</button>`;
    else tot='<span class="muted small">—</span>';
    return `<tr><td data-rot="Plano">${nome}</td><td data-rot="Tipo">${tipo}</td><td data-rot="Status">${esc((L.st||[])[1]||'')}</td><td class="num" data-rot="Vendido no período">${L.vendPer==null?'—':clfH(L.vendPer)}</td><td class="num" data-rot="Gasto no período">${gasto}</td><td class="num" data-rot="Δ no período">${delta}</td><td class="num" data-rot="Δ desde o início">${tot}</td></tr>`; }).join('');
  return `<div class="scroll-x"><table class="mp-tab-mini clf-tab"><thead><tr><th>Plano</th><th>Tipo</th><th>Status</th><th class="num">Vendido</th><th class="num">Gasto</th><th class="num">Δ período</th><th class="num">Δ desde o início</th></tr></thead><tbody>${rows}</tbody></table></div><div class="muted small" style="margin-top:6px">Vendido × gasto no período da ficha. Verde = ganho (vendeu mais do que gastou).</div>`; }

function clfNotasHTML(F){
  const cl=F.cl; let cic=''; try{ const P=pcPeriodo(cl,pcYmDaData(cl,F.hoje)); const du=pcDiasUteis(P.ini,P.fim); const ate=pcDiasUteis(P.ini,clfMin(F.hoje,P.fim));
    cic=`<div class="small">Ciclo de hoje: <b>${esc(labelMesAbbr(P.ym))}</b> · ${clfDtBR(P.ini)} → ${clfDtBR(P.fim)} · <b>${ate} de ${du}</b> dias úteis · nota prevista em ${clfDtBR(P.nota)}</div>`; }catch(e){ cic=''; }
  const ns=clfItens(F.notas); let lista;
  if(!ns.length) lista=`<div class="muted small">Nenhuma nota a emitir entre ${CLF_NOTAS_ATRAS} dias atrás e os próximos ${CLF_NOTAS_FRENTE} dias (planos de horas, marcos de escopo fechado e parcerias do cliente).</div>`;
  else lista=`<div class="pc-nt-lista">${ns.map(n=>{ const cls=n.st&&typeof pcStCls==='function'?pcStCls(n.st):'na';
    return `<div class="pc-nt-row ${n.atrasada?'crit':''}"><span class="pc-nt-data"><b>${clfDtBR(n.data)}</b></span><span class="pc-nt-txt">${n.origem==='parceria'?'🤝':'💹'} <b>${esc(n.rot)}</b>${n.horas!=null?' · '+clfH(n.horas):''}${F.veFin&&n.valor!=null?' · <b>'+clfR(n.valor)+'</b>':''} <span class="ct-sem ${cls}">${esc((n.st&&n.st.rot)||'')}</span>${n.atrasada?' <span class="ct-sem crit">atrasada</span>':''}</span></div>`; }).join('')}</div>`;
  const tot=F.veFin&&ns.length?`<div class="small" style="margin-top:6px">Total a faturar na janela: <b>${clfR(ns.reduce((s,n)=>s+(Number(n.valor)||0),0))}</b></div>`:'';
  return `${cic}${lista}${tot}<div class="muted small" style="margin-top:6px">A situação "Odoo" vem das ordens de venda já vinculadas ao plano ou ao contrato; sem ordem, aparece "sem ordem no Odoo".</div>`; }

function clfParceriasHTML(F){
  const ps=clfItens(F.vinc&&F.vinc.parcerias); return `<div class="pc-nt-lista">${ps.map(x=>`<div class="pc-nt-row"><span class="pc-nt-txt"><b>${esc(clfPcCod(x.c))}</b> · ${esc(x.c.consultoria||'')} <span class="badge">${x.via==='plano'?'pelo plano':'pelo nome'}</span> <button class="btn" data-clf-parceria="${escA(x.c.id)}">🤝 abrir contrato</button></span></div>`).join('')}</div>`; }

function clfGlossarioHTML(){
  return `<details class="clf-glossario"><summary>📖 Como ler esta ficha</summary><div class="small">
    <p><b>Período.</b> O padrão é o ciclo de faturamento do cliente, lido até hoje. Cada período lido é guardado na sessão; ↻ Atualizar zera.</p>
    <p><b>Vínculos.</b> Contratos 🏢 e planos 💹 entram pelo cliente ligado no cadastro. Parceria entra pelo plano que a cita ou, rotulada "pelo nome", pela consultoria de mesmo nome. Contrato só com o nome do cliente é sugestão — não entra nos números.</p>
    <p><b>Quem vê R$.</b> Os perfis gestor, negócio, diretoria e admin. É uma lente de leitura, não uma permissão: os dados chegam ao navegador de todos.</p>
    <p><b>Leituras.</b> Até ${CLF_AUTO_DIAS} dias a ficha lê sozinha; ciclos maiores, o consumo de horas abertas desde o início e o "desde o início" dos planos ficam atrás do botão ↻ ler.</p>
    <p><b>Semáforo.</b> Só o manual do status report (${CLF_SR_LOTE} projetos de cada vez); sem escolha aparece "automático".</p>
    <dl class="clf-gl">${Object.keys(CLF_IND).map(k=>`<dt>${esc(CLF_IND[k].rot)}</dt><dd>${esc(CLF_IND[k].oque)} <i>${esc(CLF_IND[k].ler)}</i></dd>`).join('')}</dl></div></details>`; }

function clfCabecalhoHTML(F){
  const C=estado.clf; const P=F.periodo; const cls=clLista();
  const sel=`<select id="clf-cli" aria-label="Cliente">${cls.map(c=>`<option value="${escA(c.id)}"${c.id===F.cl.id?' selected':''}>${esc(c.nome||'(sem nome)')}</option>`).join('')}</select>`;
  const per=`<select id="clf-per" aria-label="Período">${CLF_PERS.map(x=>`<option value="${escA(x[0])}"${x[0]===P.id?' selected':''}>${esc(x[1])}</option>`).join('')}</select>`;
  const livre=P.id==='livre'?` <input type="date" id="clf-de" value="${escA(P.de)}" aria-label="De"> <input type="date" id="clf-ate" value="${escA(P.ate)}" aria-label="Até">`:'';
  const linha=`${esc(P.rot)} · ${clfDtBR(P.de)} → ${clfDtBR(P.ate)} · ${P.futuro?'ainda não começou':P.emAndamento?'em andamento, lido até hoje':'encerrado'}${P.cortado?` · <b>cortado em ${CLF_MAX_DIAS} dias</b>`:''}${P.invalido?' · datas inválidas: usei os últimos 30 dias':''}`;
  const semFin=F.veFin?'':`<div class="muted small clf-semfin">Valores em R$ aparecem para os perfis gestor, negócio, diretoria e admin (⚙️ Central › perfis). Você vê horas, saldos e datas.${(typeof idApontar==='function'&&!idApontar())?' Para ser reconhecido, <button class="lnk-ficha" data-goto="apontar">identifique-se no ⏱ Apontar</button>.':''}</div>`;
  return `<div class="card full clf-cab"><div class="clf-cab-top"><h2>📇 ${esc(F.cl.nome||'(sem nome)')} <span class="badge">${esc(clFechaRot(F.cl))}</span></h2><span class="spacer"></span>
    <button class="btn" data-clf-atualiza data-tip="Zera as leituras guardadas na sessão e lê de novo">↻ Atualizar</button> <button class="btn" data-clf-ciclos="${escA(F.cl.id)}">🗓 Ciclos</button> <button class="btn" data-clf-link>🔗 Copiar link</button> <button class="btn" data-clf-trocar>‹ Todos os clientes</button></div>
    <div class="clf-cab-sel"><label>Cliente ${sel}</label> <label>Período ${per}${livre}</label></div><div class="small clf-periodo">${linha}</div>${semFin}</div>`; }

function clfFichaHTML(F){
  const B=(id,t,s,fn)=>clfBloco(id,t,s,()=>fn(F),F);
  let h=clfCabecalhoHTML(F);
  h+=(()=>{ try{ return clfKpisHTML(F); }catch(e){ try{ console.error('[ficha] kpis', e); }catch(_){} return clfAv(`⚠ Não consegui montar os indicadores (${esc(clfMsg(e))}).`); } })();
  h+=B('contratos','📑 Contratos','vigentes, saldo de horas e ciclo',clfContratosHTML);
  h+=B('projetos','📁 Projetos','semáforo do status report e horas do período',clfProjetosHTML);
  h+=B('planos','💹 Planos','vendido × gasto',clfPlanosHTML);
  h+=B('notas','🧾 Ciclo de faturamento e próximas notas','',clfNotasHTML);
  if(clfItens(F.vinc&&F.vinc.parcerias).length) h+=B('parcerias','🤝 Parcerias ligadas','',clfParceriasHTML);
  h+=clfGlossarioHTML();
  return `<div class="clf-tela vw-clficha">${h}</div>`; }

function clfSeletorHTML(aviso){
  const hoje=hojeSP(); const cls=clLista(); const C=estado.clf; const q=ctNorm(String(C.busca||''));
  let h=''; if(aviso) h+=clfAv('Não achei este cliente — ele pode ter sido excluído.');
  if(!cls.length) return `<div class="clf-tela vw-clficha">${h}<div class="card full"><h2>📇 Ficha do cliente</h2><div class="estado">Nenhum cliente cadastrado ainda. Cadastre em <button class="btn" data-goto="admin">📑 Contratos › 🏢 Clientes</button> e ligue os contratos e planos a ele.</div></div></div>`;
  const cards=cls.map(c=>clfResumoCliente(c,hoje)).filter(r=>!q||ctNorm(r.nome).includes(q)).map(r=>`<button class="clf-pick-card" data-clf-abre="${escA(r.id)}"><b>${esc(r.nome)}</b> <span class="badge">${esc(clFechaRot(clDe(r.id)||{}))}</span><div class="small">${r.nContratos} contrato(s) · ${r.nPlanos} plano(s) · ${r.nProjetos} projeto(s)${r.nParcerias?` · ${r.nParcerias} parceria(s)`:''}</div><div class="muted small">${r.ciclo?`Ciclo de hoje: ${esc(labelMesAbbr(r.ciclo.ym))} · ${clfDtBR(r.ciclo.ini)} → ${clfDtBR(r.ciclo.fim)}`:''}</div></button>`).join('');
  const busca=cls.length>8?`<input type="search" id="clf-busca" placeholder="Buscar cliente…" value="${escA(C.busca||'')}" aria-label="Buscar cliente">`:'';
  const sem=clfSemCliente(); const nomes=[...new Set(sem.contratos.map(c=>ctCodCli(c)+(c.cliente?' · '+c.cliente:'')).concat(sem.planos.map(p=>p.nome||'(plano sem nome)')))];
  const semH=nomes.length?`<div class="card full"><h3>Sem cliente ligado <span class="muted small">${sem.contratos.length} contrato(s) · ${sem.planos.length} plano(s)</span></h3><div class="small">${nomes.slice(0,8).map(esc).join(' · ')}${nomes.length>8?` e mais ${nomes.length-8}`:''}</div><div class="muted small">Para entrar na ficha, ligue ao cliente no ✏️ editar do contrato (📑 Contratos › 🏢 Clientes) ou nos ✏️ Dados do projeto do plano (💹 Rentabilidade).</div></div>`:'';
  return `<div class="clf-tela vw-clficha">${h}<div class="card full"><h2>📇 Ficha do cliente — escolha o cliente</h2>${busca}<div class="clf-pick" id="clf-pick">${cards||'<div class="muted small">Nenhum cliente com esse nome.</div>'}</div></div>${semH}</div>`; }

function clfRender(){
  if(estado.vista!=='clficha') return; const cont=document.getElementById('conteudo'); if(!cont) return;
  const C=estado.clf; const y=window.scrollY||0; const foco=document.activeElement&&document.activeElement.id;
  let F=null, html='';
  try{
    if(C.cli){ F=clFicha(C.cli,C.per,{ de:C.de, ate:C.ate }); if(!F.ok){ html=clfSeletorHTML(F.motivo==='nao-achei'); F=null; } else html=clfFichaHTML(F); }
    else html=clfSeletorHTML('');
  }catch(e){ try{ console.error('[ficha] render', e); }catch(_){} F=null;
    html=`<div class="clf-tela vw-clficha"><div class="card full"><h2>📇 Ficha do cliente</h2>${clfAv(`⚠ Não consegui montar a ficha (${esc(clfMsg(e))}). Nada foi alterado nos seus dados.`)}<button class="btn" data-clf-trocar>‹ Todos os clientes</button></div></div>`; }
  cont.replaceChildren(el(html)); if(y) window.scrollTo(0,y);
  if(foco==='clf-busca'){ const b=document.getElementById('clf-busca'); if(b){ b.focus(); try{ b.setSelectionRange(b.value.length,b.value.length); }catch(_){} } }
  if(F) clfGarante(F); }

// ---- ações ----
function clfAbre(id){ const C=estado.clf; C.cli=id; C.srLim=CLF_SR_LOTE;
  try{ if(typeof fechaModal==='function') fechaModal(); }catch(e){}
  if(estado.vista==='clficha'){ clfRender(); estadoParaURL(); window.scrollTo({ top:0 }); } else vaiPara('clficha'); }
document.addEventListener('click',(ev)=>{ const b=ev.target.closest&&ev.target.closest('[data-clf-abre]'); if(!b) return; ev.preventDefault(); try{ escondeTip(); }catch(e){} clfAbre(b.getAttribute('data-clf-abre')); });
const clfSync=()=>{ clfRender(); estadoParaURL(); };
function clfContratoPorId(id){ return clfItens(cfg.contratos).filter(ctItemValido).find(c=>c.id===id)||null; }
document.addEventListener('click',(ev)=>{ if(estado.vista!=='clficha') return; const t=ev.target; if(!t.closest) return; const C=estado.clf; let b;
  if((b=t.closest('[data-clf-atualiza]'))){ C.tempo={}; C.tempoErro={}; C.sr={}; C.srLim=CLF_SR_LOTE; if(estado.ctReal){ estado.ctReal.erro={}; } clfRender(); return; }
  if((b=t.closest('[data-clf-ciclos]'))){ if(typeof _clSt!=='undefined') _clSt.cal=b.getAttribute('data-clf-ciclos'); vaiPara('admin'); return; }
  if(t.closest('[data-clf-link]')){ const u=location.href; try{ navigator.clipboard.writeText(u).then(()=>toast('🔗 Link da ficha copiado.'),()=>toast(u)); }catch(e){ toast(u); } return; }
  if(t.closest('[data-clf-trocar]')){ C.cli=''; clfSync(); window.scrollTo({ top:0 }); return; }
  if(t.closest('[data-clf-tempo-retry]')){ C.tempoErro={}; clfRender(); return; }
  if((b=t.closest('[data-clf-sr-retry]'))){ delete C.sr[b.getAttribute('data-clf-sr-retry')]; clfRender(); return; }
  if(t.closest('[data-clf-sr-mais]')){ C.srLim=(C.srLim||CLF_SR_LOTE)+CLF_SR_LOTE; clfRender(); return; }
  if((b=t.closest('[data-clf-ler]'))){ const c=clfContratoPorId(b.getAttribute('data-clf-ler')); if(!c) return; const F=clFicha(C.cli,C.per,{ de:C.de, ate:C.ate }); const L=clfItens(F.contratos).find(x=>x&&x.c&&x.c.id===c.id);
    if(L&&L.lerChave){ if(L.lerChave.real){ if(estado.ctReal&&estado.ctReal.erro) delete estado.ctReal.erro[ctRealChave(c)]; ctGaranteReal(c); } else { delete C.tempoErro[clfChaveT(L.lerChave.de,L.lerChave.ate)]; clfTempoPede(L.lerChave.de,L.lerChave.ate); } } clfRender(); return; }
  if((b=t.closest('[data-clf-contrato]'))){ estado.admin.editId=b.getAttribute('data-clf-contrato'); vaiPara('admin'); return; }
  if((b=t.closest('[data-clf-apur]'))){ const c=clfContratoPorId(b.getAttribute('data-clf-apur')); if(!c) return; if((c.tipo||'ams')==='ams'){ estado.ams.sel=c.id; estado.ams.ref=''; vaiPara('ams'); } else vaiPara('receita'); return; }
  if((b=t.closest('[data-clf-sr]'))){ srProjSet(b.getAttribute('data-clf-sr')); vaiPara('statusrep'); return; }
  if((b=t.closest('[data-clf-plano-real]'))){ const p=clfItens(cfg.rentab&&cfg.rentab.planos).find(x=>x&&x.id===b.getAttribute('data-clf-plano-real')); if(!p) return; const k=rpRealChave(p); if(k&&estado.rentab&&estado.rentab.tempoErro) delete estado.rentab.tempoErro[k]; rpGaranteReal(p); clfRender(); return; }
  if((b=t.closest('[data-clf-plano]'))){ const rr=estado.rentab; rr.sel=b.getAttribute('data-clf-plano'); rr.edit=false; rr.novo=false; vaiPara('rentab'); return; }
  if((b=t.closest('[data-clf-parceria]'))){ const st=estado.parcerias=estado.parcerias||{}; st.novo=false; st.editId=null; st.rasc=null; st.destaque=b.getAttribute('data-clf-parceria'); st.cal=''; vaiPara('parcerias'); return; } });
document.addEventListener('change',(ev)=>{ if(estado.vista!=='clficha') return; const t=ev.target; if(!t||!t.id) return; const C=estado.clf;
  if(t.id==='clf-cli'){ C.cli=t.value; C.srLim=CLF_SR_LOTE; clfSync(); return; }
  if(t.id==='clf-per'){ C.per=t.value; if(C.per==='livre'&&!(pcData(C.de)&&pcData(C.ate))){ C.ate=hojeSP(); C.de=pcMaisDias(C.ate,-29); } clfSync(); return; }
  if(t.id==='clf-de'||t.id==='clf-ate'){ if(t.id==='clf-de') C.de=t.value; else C.ate=t.value; clfSync(); return; } });
document.addEventListener('input',(ev)=>{ if(estado.vista!=='clficha') return; const t=ev.target; if(!t||t.id!=='clf-busca') return; estado.clf.busca=t.value; clfRender(); });
