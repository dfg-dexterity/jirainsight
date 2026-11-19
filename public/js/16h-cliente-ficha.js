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
  if((C.tempoB||{})[exato]) return { st:'lendo' };
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
