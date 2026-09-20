// Jira Insights · 16b · 🤝 CONTRATOS DE PARCERIA — cadastro dos contratos com as consultorias parceiras
// (quem contrata a Dexterity), pedido de 2026-09-13.
// ===========================================================================
// Cada contrato guarda: a CONSULTORIA, a MODALIDADE (⏱ horas abertas · 🛠️ atendimento AMS · 📦 demanda com
// horas fechadas), a VALIDADE (início/fim), o VALOR DA HORA negociada, o PERÍODO DE AVISO (dias de aviso
// prévio para encerrar/renovar), o PERÍODO DE FATURAMENTO — o dia em que o período fecha ("até o dia 25")
// e o DIA DA NOTA — ambos AJUSTÁVEIS MÊS A MÊS (cfg.parcerias[].ajustes['AAAA-MM']) — e a CONTA BANCÁRIA de
// recebimento. Tudo mora em cfg.parcerias (config compartilhada); gestores editam, os demais leem.
// A 💹 Rentabilidade liga cada plano de horas abertas a um contrato: cliente e valor-hora vêm dele e a receita
// prevista é quebrada nos PERÍODOS DE FATURAMENTO do contrato — um item da ordem de venda no Odoo por período.
// Regra do período: o período do mês M vai do dia seguinte ao fechamento de M−1 até o fechamento de M; a nota
// sai no "dia da nota" do próprio mês (se ≥ fechamento) ou do mês seguinte (se < fechamento).
// Helpers de outros módulos (souAprovador, salvaCfg, ehUtil/ehFeriado, rpPlanos…) só em tempo de render.
// ===========================================================================
const PC_MODAL={ horas:['⏱','Horas abertas','o cliente paga as horas trabalhadas ao valor-hora negociado, por período de faturamento'],
  ams:['🛠️','Atendimento AMS','pacote de horas por ciclo (a apuração do banco de horas fica na aba AMS / Contratos do Admin)'],
  fechado:['📦','Demanda com horas fechadas','escopo e horas fechados por demanda; o valor-hora é a referência para precificar'] };
function pcLista(){ if(!Array.isArray(cfg.parcerias)) cfg.parcerias=[]; return cfg.parcerias; }
function pcDe(id){ return id?pcLista().find(c=>c&&c.id===id)||null:null; }
function pcModal(c){ return PC_MODAL[c&&c.modalidade]?c.modalidade:'horas'; }
// Quem está mexendo (identidade do ⏱ Apontar) — só o nome/e-mail, para o histórico.
function pcQuem(){ const id=idApontar()||{}; return { nome:String(id.nome||id.email||'alguém').trim(), email:String(id.email||'') }; }
function pcNovo(){ const h=hojeSP(); return { id:'pc'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), consultoria:'', modalidade:'horas', inicio:h.slice(0,7)+'-01', fim:'', valorHora:0, avisoDias:30, fatFecha:25, fatDia:30, conta:'', contato:'', obs:'', pasta:'', docs:[], equipe:[], ajustes:{}, hist:[] }; }
// ---- datas ----
function pcUltimoDia(ym){ const y=+ym.slice(0,4), m=+ym.slice(5,7); return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10); }
function pcDiaNoMes(ym, dia){ const u=pcUltimoDia(ym); const d=Math.max(1,Math.min(31,Math.round(Number(dia)||31))); const dd=Math.min(d,+u.slice(8,10)); return `${ym}-${String(dd).padStart(2,'0')}`; }
function pcYmSoma(ym, n){ let y=+ym.slice(0,4), m=+ym.slice(5,7)+n; while(m>12){ m-=12; y++; } while(m<1){ m+=12; y--; } return `${y}-${String(m).padStart(2,'0')}`; }
function pcDias(a,b){ if(!a||!b) return 0; return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000); }
function pcDiasUteis(de, ate){ if(!de||!ate||ate<de) return 0; let n=0, d=de, g=0; while(d<=ate&&g++<800){ if(ehUtil(d)&&!ehFeriado(d)) n++; d=proxDia(d); } return n; }
const pcData=(s)=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
function pcAjuste(c, ym){ const a=c&&c.ajustes&&c.ajustes[ym]; return a&&typeof a==='object'?a:null; }
// Fechamento do período de faturamento do mês ym: ajuste do mês ou o dia padrão do contrato (31 = último dia).
function pcFechamento(c, ym){ const a=pcAjuste(c,ym); if(a&&pcData(a.fecha)) return a.fecha; return pcDiaNoMes(ym, c.fatFecha||31); }
// Dia da nota do mês ym: ajuste do mês; senão o dia de faturamento no próprio mês (≥ fechamento) ou no seguinte.
function pcNota(c, ym){ const a=pcAjuste(c,ym); if(a&&pcData(a.nota)) return a.nota; const fd=Math.round(Number(c.fatDia)||0); const fecha=pcFechamento(c,ym); if(!fd) return fecha;
  const d=pcDiaNoMes(ym,fd); return d>=fecha?d:pcDiaNoMes(pcYmSoma(ym,1),fd); }
function pcPeriodo(c, ym){ const fim=pcFechamento(c,ym); let ini=proxDia(pcFechamento(c,pcYmSoma(ym,-1))); if(ini>fim) ini=fim; return { ym, ini, fim, nota:pcNota(c,ym), ajustado:!!pcAjuste(c,ym) }; }
// Períodos de faturamento que cobrem [de, ate] — recortados nas pontas (iniPlano/fimPlano).
function pcPeriodos(c, de, ate){ const out=[]; if(!pcData(de)||!pcData(ate)||ate<de) return out; let ym=de.slice(0,7); if(pcFechamento(c,ym)<de) ym=pcYmSoma(ym,1); let g=0;
  while(g++<60){ const P=pcPeriodo(c,ym); if(P.ini>ate) break; out.push({ ...P, iniPlano:P.ini<de?de:P.ini, fimPlano:P.fim>ate?ate:P.fim, recortado:P.ini<de||P.fim>ate }); ym=pcYmSoma(ym,1); }
  return out; }
// Situação do contrato hoje: futuro · vigente · a vencer (dentro do período de aviso) · encerrado.
function pcStatus(c){ const h=hojeSP(); const fim=pcData(c.fim)?c.fim:''; const aviso=Math.max(0,Math.round(Number(c.avisoDias)||0)); const avisoAte=fim?voltaDias(fim,aviso):'';
  if(pcData(c.inicio)&&h<c.inicio) return { k:'futuro', rot:'Começa em '+dataBR(c.inicio), avisoAte };
  if(fim&&h>fim) return { k:'encerrado', rot:'Encerrado em '+dataBR(fim), avisoAte };
  if(fim&&avisoAte&&h>=avisoAte) return { k:'avencer', rot:`Vence em ${pcDias(h,fim)} dia(s)`, avisoAte, avisoPassou:h>avisoAte };
  return { k:'vigente', rot:fim?'Vigente':'Vigente (sem fim definido)', avisoAte }; }
// Histórico do contrato (quem gravou/alterou o quê) — mesmo formato do plano de rentabilidade.
function pcLog(c, o, d){ if(!Array.isArray(c.hist)) c.hist=[]; const q=pcQuem(); c.hist.push({ em:new Date().toISOString().slice(0,16), por:q.nome, o, d:String(d||'').slice(0,240) }); if(c.hist.length>40) c.hist=[c.hist[0]].concat(c.hist.slice(-39)); c.atualizadoEm=hojeSP(); c.atualizadoPor=q.nome; }
function pcQuando(em){ if(!em) return ''; const d=new Date(em.length===16?em+':00Z':em); if(isNaN(d)) return em; return d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}); }
const PC_CAMPOS={ consultoria:'consultoria', modalidade:'modalidade', inicio:'início', fim:'fim', valorHora:'valor-hora', avisoDias:'aviso (dias)', fatFecha:'fechamento (dia)', fatDia:'nota (dia)', conta:'conta', contato:'contato', obs:'obs.', pasta:'pasta do contrato' };
function pcDiff(a, b){ const out=[]; Object.keys(PC_CAMPOS).forEach(k=>{ const x=a[k]==null?'':String(a[k]), y=b[k]==null?'':String(b[k]); if(x!==y) out.push(`${PC_CAMPOS[k]}: ${x||'—'} → ${y||'—'}`); }); return out; }
// Planos da 💹 Rentabilidade ligados a este contrato.
function pcPlanosDe(id){ const r=cfg.rentab&&Array.isArray(cfg.rentab.planos)?cfg.rentab.planos:[]; return r.filter(p=>p&&p.contrato===id); }
function pcContas(){ const s=new Set(); pcLista().forEach(c=>{ if(c.conta) s.add(c.conta); }); return [...s]; }
function pcId(pre){ return pre+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

// ===========================================================================
// 📂 DOCUMENTOS DO CONTRATO (pedido de 2026-09-14)
// A pasta do contrato no SharePoint e os arquivos (contrato, aditivos, proposta) ficam como LINKS: o painel
// não guarda arquivo nenhum nem credencial — quem clica abre no SharePoint com a própria conta. TODOS veem e
// abrem (é o "visualizar o contrato"); só gestores cadastram.
// ===========================================================================
const PC_DOC_TIPOS=[['contrato','📄','Contrato'],['aditivo','📝','Aditivo'],['proposta','📑','Proposta'],['outro','📎','Outro']];
function pcDocs(c){ if(!Array.isArray(c.docs)) c.docs=[]; return c.docs; }
function pcDocTipo(d){ return PC_DOC_TIPOS.find(t=>t[0]===(d&&d.tipo))||PC_DOC_TIPOS[3]; }
// Só http(s): o link colado do SharePoint/OneDrive abre em nova aba; qualquer outro esquema (javascript:, data:…) é descartado.
function pcUrl(u){ const s=String(u||'').trim(); return /^https?:\/\/[^\s<>"']+$/i.test(s)?s.slice(0,900):''; }
function pcUrlCurta(u){ try{ const x=new URL(u); const p=decodeURIComponent(x.pathname).split('/').filter(Boolean).pop()||x.hostname;
  return p.length>44?p.slice(0,42)+'…':p; }catch(e){ const s=String(u||''); return s.length>44?s.slice(0,42)+'…':s; } }

// ===========================================================================
// 👥 EQUIPE E ALOCAÇÃO DO CONTRATO (pedido de 2026-09-14) — o PLANEJAMENTO do contrato
// Cada RECURSO (uma pessoa do time ou um nome livre) tem uma LISTA de regras `{de, ate, modo, v}`: é a lista
// que permite "2h por dia entre 15/05 e 25/05 e 4h por dia depois" — dois trechos da MESMA pessoa — e vários
// consultores no mesmo contrato. As horas de cada trecho saem dos DIAS ÚTEIS (feriados descontados) e são
// somadas por PERÍODO DE FATURAMENTO do contrato → horas e valor previstos de cada nota.
// Modos: % do dia (da meta diária da pessoa) · h por dia útil · h por mês · h no total (os dois últimos
// rateados pelos dias úteis). Tudo em cfg.parcerias[].equipe (config compartilhada); gestores editam.
// ===========================================================================
const PC_MODOS={ pct:['% do dia','%','percentual da meta diária da pessoa — 50% de 8h = 4h por dia útil'],
  dia:['h por dia útil','h/dia','horas em cada dia útil do trecho'],
  mes:['h por mês','h/mês','horas por mês, rateadas pelos dias úteis do trecho'],
  total:['h no total','h no total','horas no trecho inteiro, rateadas pelos dias úteis'] };
const PC_MODO_IDS=['pct','dia','mes','total'];
function pcModo(r){ return PC_MODO_IDS.includes(r&&r.modo)?r.modo:'dia'; }
function pcEquipe(c){ if(!Array.isArray(c.equipe)) c.equipe=[]; return c.equipe; }
function pcRegras(p){ if(!p||!Array.isArray(p.regras)) { if(p) p.regras=[]; } return (p&&p.regras)||[]; }
function pcNovoRec(nome, a){ return { id:pcId('rc'), nome:String(nome||'').slice(0,80), a:a||'', obs:'', regras:[] }; }
// Trecho novo: começa hoje (ou no início do contrato, se ele ainda não começou) e vai até o fim do contrato
// (ou 3 meses adiante, quando o contrato não tem prazo).
function pcNovaRegra(c){ const h=hojeSP(); const de=(pcData(c.inicio)&&c.inicio>h)?c.inicio:h;
  let ate=pcData(c.fim)?c.fim:pcUltimoDia(pcYmSoma(de.slice(0,7),2)); if(ate<de) ate=de;
  return { id:pcId('rg'), de, ate, modo:'dia', v:4 }; }
// Meta diária da pessoa (🎯 Metas & ausências); um nome livre (sem accountId) usa a meta global.
function pcHDia(a){ const h=(typeof metaSegDe==='function')?metaSegDe(a)/3600:0; return h>0?h:8; }
function pcNomeRec(p){ if(p&&p.a&&typeof pessoasUnidas==='function'){ const u=pessoasUnidas()[p.a]; if(u&&u.nome) return u.nome; } return (p&&p.nome)||'(sem nome)'; }
function pcDiasUteisPorMes(de, ate){ const out={}; if(!pcData(de)||!pcData(ate)||ate<de) return out; let d=de, g=0;
  while(d<=ate&&g++<800){ if(ehUtil(d)&&!ehFeriado(d)){ const m=d.slice(0,7); out[m]=(out[m]||0)+1; } d=proxDia(d); } return out; }
// Horas de UM trecho dentro de [ini, fim] — a interseção do trecho com o recorte, pelos dias úteis.
function pcHorasRegra(r, a, ini, fim){
  if(!r||!pcData(r.de)||!pcData(r.ate)||r.ate<r.de) return 0;
  const de=r.de>ini?r.de:ini, ate=r.ate<fim?r.ate:fim;
  if(!pcData(de)||!pcData(ate)||ate<de) return 0;
  const v=Math.max(0,Number(r.v)||0); if(!v) return 0;
  const modo=pcModo(r); const n=pcDiasUteis(de,ate); if(!n) return 0;
  if(modo==='dia') return n*v;
  if(modo==='pct') return n*pcHDia(a)*v/100;
  if(modo==='mes'){ const reg=pcDiasUteisPorMes(r.de,r.ate); const rec=pcDiasUteisPorMes(de,ate); let h=0;
    Object.keys(rec).forEach(m=>{ const tot=reg[m]||0; if(tot>0) h+=v*rec[m]/tot; }); return h; }
  const tot=pcDiasUteis(r.de,r.ate); return tot?v*n/tot:0;   // total no trecho, rateado pelos dias úteis
}
function pcHorasRec(p, ini, fim){ return pcRegras(p).reduce((s,r)=>s+pcHorasRegra(r,p&&p.a,ini,fim),0); }
// Janela coberta pela equipe, recortada pela validade do contrato (e o que ficou fora dela).
function pcEqRange(c){
  let de='', ate=''; const fora=[];
  pcEquipe(c).forEach(p=>pcRegras(p).forEach(r=>{
    if(!pcData(r.de)||!pcData(r.ate)||r.ate<r.de) return;
    const tr=`${pcNomeRec(p)} · ${dataBR(r.de)} → ${dataBR(r.ate)}`;
    if(pcData(c.inicio)&&r.ate<c.inicio){ fora.push(`${tr} termina antes do início do contrato`); return; }
    if(pcData(c.fim)&&r.de>c.fim){ fora.push(`${tr} começa depois do fim do contrato`); return; }
    const a=(pcData(c.inicio)&&r.de<c.inicio)?c.inicio:r.de;
    const b=(pcData(c.fim)&&r.ate>c.fim)?c.fim:r.ate;
    if(!de||a<de) de=a; if(!ate||b>ate) ate=b;
  }));
  return { de, ate, fora };
}
// ---- ✎ AJUSTE MANUAL DA PREVISÃO (pedido do usuário, 2026-09-18) ----
// A previsão de cada período nasce do cálculo (trechos × dias úteis × valor-hora), mas nem todo mês fecha
// pela conta: um mês negociado, um valor fechado, uma redução combinada com o parceiro. Por isso cada
// período aceita um número DIGITADO para as HORAS e/ou para o VALOR, guardado em `c.prev[ym] = {h, v}`
// (do mesmo jeito que `c.ajustes[ym]` já ajusta as datas do calendário mês a mês).
// Campo vazio = de volta ao automático, e o valor calculado nunca é apagado: ele continua à vista, ao lado
// do que foi digitado, para a diferença ficar sempre explícita.
function pcPrev(c){ if(!c.prev||typeof c.prev!=='object') c.prev={}; return c.prev; }
function pcPrevDe(c, ym){ const m=pcPrev(c)[ym]; return (m&&typeof m==='object')?m:null; }
// '' / texto inválido / negativo => null (= automático). Aceita vírgula decimal.
function pcPrevNum(x){ const s=String(x==null?'':x).trim().replace(',','.'); if(!s) return null;
  const n=Number(s); return (isFinite(n)&&n>=0)?Math.round(n*100)/100:null; }
function pcPrevSet(c, ym, campo, val){
  const p=pcPrev(c); const m=p[ym]||{}; const n=pcPrevNum(val);
  if(n==null) delete m[campo]; else m[campo]=n;
  if(Object.keys(m).length) p[ym]=m; else delete p[ym];
  return n;
}
// Ajustes guardados para meses que a alocação atual não cobre mais (trecho encurtado, validade mudada).
// Não são apagados sozinhos — se o período voltar, o ajuste volta com ele —, mas ficam avisados na tela.
function pcPrevOrfaos(c, periodos){
  const vistos=new Set((periodos||[]).map(P=>P.ym));
  return Object.keys(pcPrev(c)).filter(ym=>!vistos.has(ym)).sort();
}

// O planejamento: horas de cada recurso em cada período de faturamento + o valor previsto da nota.
// Cada período leva o valor CALCULADO (horasAuto/valorAuto) e o EFETIVO (horas/valor) — iguais, a não ser
// que haja ajuste manual; manH/manV dizem qual dos dois foi digitado.
function pcPlanejamento(c){
  const eq=pcEquipe(c); const vh=Math.max(0,Number(c.valorHora)||0); const R=pcEqRange(c);
  const porRec={}; eq.forEach(p=>{ porRec[p.id]=0; });
  if(!R.de||!R.ate||R.ate<R.de) return { periodos:[], eq, vh, porRec, totalH:0, totalV:0, totalHAuto:0, totalVAuto:0,
    nMan:0, orfaos:pcPrevOrfaos(c,[]), de:R.de, ate:R.ate, fora:R.fora };
  const periodos=pcPeriodos(c,R.de,R.ate).map(P=>{
    const porPessoa={}; let horas=0;
    eq.forEach(p=>{ const h=Math.round(pcHorasRec(p,P.iniPlano,P.fimPlano)*100)/100;
      if(h>0){ porPessoa[p.id]=h; horas+=h; porRec[p.id]+=h; } });
    horas=Math.round(horas*100)/100;
    const m=pcPrevDe(c,P.ym); const hMan=(m&&m.h!=null)?m.h:null, vMan=(m&&m.v!=null)?m.v:null;
    const hEf=hMan!=null?hMan:horas;                      // horas digitadas mandam nas calculadas…
    const vEf=vMan!=null?vMan:Math.round(hEf*vh*100)/100;  // …e o valor acompanha, a menos que também tenha sido digitado
    return { ...P, du:pcDiasUteis(P.iniPlano,P.fimPlano), porPessoa,
      horasAuto:horas, valorAuto:Math.round(horas*vh*100)/100, horas:hEf, valor:vEf, manH:hMan!=null, manV:vMan!=null };
  });
  const soma=(f)=>Math.round(periodos.reduce((s,P)=>s+f(P),0)*100)/100;
  Object.keys(porRec).forEach(k=>{ porRec[k]=Math.round(porRec[k]*100)/100; });
  return { periodos, eq, vh, porRec,
    totalH:soma(P=>P.horas), totalV:soma(P=>P.valor), totalHAuto:soma(P=>P.horasAuto), totalVAuto:soma(P=>P.valorAuto),
    nMan:periodos.filter(P=>P.manH||P.manV).length, orfaos:pcPrevOrfaos(c,periodos),
    de:R.de, ate:R.ate, fora:R.fora };
}
function pcRegraRot(r){ const v=Number(r&&r.v)||0; const m=pcModo(r); const q=m==='pct'?`${v}% do dia`:m==='dia'?`${v}h/dia útil`:m==='mes'?`${v}h/mês`:`${v}h no total`;
  return `${q} · ${pcData(r.de)?dataBR(r.de):'—'} → ${pcData(r.ate)?dataBR(r.ate):'—'}`; }

// ---- tela ----
function renderParcerias(){
  const cont=document.getElementById('conteudo'); const st=estado.parcerias=estado.parcerias||{}; const gestor=souAprovador(); const lista=pcLista();
  const edit=st.editId?pcDe(st.editId):null; if(st.editId&&!edit) st.editId=null;
  const hoje=hojeSP();
  const intro=`<div class="card full"><h2>🤝 Contratos de parceria <span>as consultorias que contratam a Dexterity: modalidade, valor-hora, validade e o calendário de faturamento</span></h2>
    <div class="muted small">Cadastre cada contrato com a <b>modalidade</b> (horas abertas, atendimento AMS ou demanda com horas fechadas), o <b>período de validade</b>, o <b>valor da hora negociada</b>, o <b>período de aviso</b> (dias de aviso prévio), o <b>período de faturamento</b> (o dia em que o período fecha — "até o dia 25") e o <b>dia da nota</b>, além da <b>conta bancária</b> em que você recebe. As datas de fechamento e de nota podem ser <b>ajustadas mês a mês</b> no 📅 calendário de cada contrato. Na 💹 Rentabilidade, o plano de horas abertas liga-se ao contrato: o cliente, o valor-hora e os <b>períodos de faturamento</b> (um item da ordem de venda no Odoo por período) vêm daqui. ${gestor?'':'<b>Somente gestores editam</b>; você está vendo em modo leitura.'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${gestor&&!st.novo&&!edit?'<button class="btn primario" data-pc-novo="1">＋ Novo contrato</button>':''}<button class="btn" data-goto="rentab">💹 Rentabilidade</button><button class="btn" data-goto="admin">⚙️ Contratos (Admin)</button></div></div>`;
  // O formulário nasce do RASCUNHO (st.rasc): no contrato novo ele já existe; na edição é a cópia do contrato.
  // O rascunho acompanha o que a pessoa digita (pcGuardaRasc), então um render() vindo de fora — o catálogo de
  // projetos que chega, um conflito da config compartilhada, a troca de tema — ou sair da tela e voltar não apaga
  // nada. (Era exatamente isso que fazia parecer que o contrato "não editava": o formulário renascia vazio.)
  if(gestor&&(st.novo||edit)&&!st.rasc) st.rasc=edit?JSON.parse(JSON.stringify(edit)):pcNovo();
  const chaveForm=gestor&&(st.novo||edit)?(edit?edit.id:'novo'):'';
  const form=chaveForm?pcFormHTML(st.rasc, !edit, chaveForm):'';
  const ordem={avencer:0,vigente:1,futuro:2,encerrado:3};
  const cards=lista.slice().sort((a,b)=>(ordem[pcStatus(a).k]-ordem[pcStatus(b).k])||String(a.consultoria||'').localeCompare(String(b.consultoria||''),'pt'))
    .map(c=>pcCardHTML(c, gestor, (st.aba&&st.aba.id===c.id)?st.aba.qual:'', hoje)).join('');
  const aVencer=lista.filter(c=>pcStatus(c).k==='avencer');
  const aviso=aVencer.length?`<div class="aviso">⏰ <b>${aVencer.length} contrato(s) dentro do período de aviso</b>: ${aVencer.map(c=>{ const s=pcStatus(c); return `<b>${esc(c.consultoria||'')}</b> vence em ${dataBR(c.fim)} (aviso prévio ${s.avisoPassou?'<span class="rp-neg">deveria ter sido dado até':'até'} ${dataBR(s.avisoAte)}${s.avisoPassou?'</span>':''})`; }).join(' · ')}.</div>`:'';
  const notas=(typeof pcProximasNotasHTML==='function')?pcProximasNotasHTML(lista, hoje):'';
  // O formulário já aberto é REAPROVEITADO (mesmo nó, com o que está digitado e o cursor onde estava) quando o
  // redesenho é do mesmo contrato — só o resto da tela é reconstruído.
  const formVelho=cont.querySelector('.pc-form'); const ativo=document.activeElement;
  const arvore=el(`<div>${intro}${aviso}${notas}${form}
    <div class="card full"><h2>Contratos cadastrados <span>${lista.length}</span></h2>
      ${lista.length?`<div class="ad-grid pc-grid">${cards}</div>`:`<div class="estado">Nenhum contrato de parceria ainda.${gestor?' Clique em <b>＋ Novo contrato</b> para cadastrar o primeiro.':''}</div>`}</div></div>`);
  const reusa=!!(formVelho&&chaveForm&&formVelho.getAttribute('data-pc-form')===chaveForm);
  if(reusa){ const novo=arvore.querySelector('.pc-form'); if(novo) novo.replaceWith(formVelho); }
  cont.replaceChildren(arvore);
  if(reusa&&ativo&&formVelho.contains(ativo)){ try{ ativo.focus({preventScroll:true}); }catch(e){} }
  pcPreview();
  if(typeof pcOdooAoAbrir==='function') try{ pcOdooAoAbrir(lista); }catch(e){}   // 16c: lê o Odoo dos contratos com ordem (a cada 10 min)
  // 🦴 vindo da espinha do projeto: o contrato da consultoria em destaque e à vista
  if(st.destaque){ const card=cont.querySelector(`[data-pc-card="${st.destaque}"]`); if(card) setTimeout(()=>{ try{ card.scrollIntoView({behavior:'smooth',block:'center'}); }catch(e){} },60); }
  ['pc-f-inicio','pc-f-fim'].forEach(id=>{ const d=document.getElementById(id); if(d&&!d.hasAttribute('data-picker')){ d.setAttribute('data-picker','1'); d.addEventListener('click',()=>{ try{ if(d.showPicker) d.showPicker(); }catch(e){} }); } });
}
// O rascunho do formulário (st.rasc) acompanha cada tecla: é dele que o formulário renasce em qualquer redesenho.
const PC_FORM_CAMPOS=[['consultoria','pc-f-consultoria'],['modalidade','pc-f-modal'],['inicio','pc-f-inicio'],['fim','pc-f-fim'],['valorHora','pc-f-vh'],['avisoDias','pc-f-aviso'],['fatFecha','pc-f-fecha'],['fatDia','pc-f-nota'],['conta','pc-f-conta'],['contato','pc-f-contato'],['obs','pc-f-obs'],['pasta','pc-f-pasta']];
function pcGuardaRasc(){ const st=estado.parcerias; if(!st||!(st.novo||st.editId)) return;
  if(!st.rasc) st.rasc=st.editId?JSON.parse(JSON.stringify(pcDe(st.editId)||pcNovo())):pcNovo();
  PC_FORM_CAMPOS.forEach(([k,id])=>{ const e=document.getElementById(id); if(e) st.rasc[k]=String(e.value); }); }
function pcFormHTML(c, novo, chave){
  const contas=pcContas();
  return `<div class="card full pc-form" data-pc-form="${escA(chave||(novo?'novo':c.id))}"><h2>${novo?'＋ Novo contrato de parceria':'✏️ Editar contrato'} <span>${esc(c.consultoria||'')}</span></h2>
    <div class="pl-grid">
      <div class="campo"><label>Consultoria parceira</label><input type="text" id="pc-f-consultoria" value="${escA(c.consultoria||'')}" placeholder="nome da consultoria (cliente)" style="min-width:240px"></div>
      <div class="campo"><label>Modalidade de contratação</label><select id="pc-f-modal">${Object.entries(PC_MODAL).map(([k,t])=>`<option value="${k}" ${pcModal(c)===k?'selected':''}>${t[0]} ${t[1]}</option>`).join('')}</select><div class="muted small" id="pc-f-modal-dica">${esc(PC_MODAL[pcModal(c)][2])}</div></div>
      <div class="campo"><label>Início da validade</label><input type="date" id="pc-f-inicio" value="${escA(c.inicio||'')}"></div>
      <div class="campo"><label>Fim da validade</label><input type="date" id="pc-f-fim" value="${escA(c.fim||'')}" data-tip="Vazio = sem prazo definido (o aviso prévio só faz sentido com fim)"></div>
      <div class="campo"><label>Valor da hora negociada (R$)</label><input type="number" id="pc-f-vh" min="0" step="0.01" value="${escA(String(c.valorHora||''))}" placeholder="ex.: 220" style="width:120px"></div>
      <div class="campo"><label>Período de aviso (dias)</label><input type="number" id="pc-f-aviso" min="0" step="1" value="${escA(String(c.avisoDias!=null?c.avisoDias:30))}" style="width:90px" data-tip="Dias de aviso prévio para encerrar ou renovar; a tela avisa quando o contrato entra nesse período"></div>
      <div class="campo"><label>Fechamento do período (dia do mês)</label><input type="number" id="pc-f-fecha" min="1" max="31" step="1" value="${escA(String(c.fatFecha||25))}" style="width:90px" data-tip="Até que dia vai o período de faturamento (ex.: 25 = de 26 do mês anterior a 25 deste; 31 = mês civil)"></div>
      <div class="campo"><label>Dia da nota (faturamento)</label><input type="number" id="pc-f-nota" min="1" max="31" step="1" value="${escA(String(c.fatDia||''))}" placeholder="= fechamento" style="width:90px" data-tip="Dia em que a nota é emitida: no próprio mês se for igual/depois do fechamento, senão no mês seguinte"></div>
      <div class="campo"><label>Conta bancária de recebimento</label><input type="text" id="pc-f-conta" list="pc-contas" value="${escA(c.conta||'')}" placeholder="ex.: Itaú · ag 1234 · cc 56789-0" style="min-width:240px"><datalist id="pc-contas">${contas.map(x=>`<option value="${escA(x)}"></option>`).join('')}</datalist></div>
      <div class="campo"><label>Contato na consultoria</label><input type="text" id="pc-f-contato" value="${escA(c.contato||'')}" placeholder="nome / e-mail"></div>
    </div>
    <div class="campo"><label>Observações</label><input type="text" id="pc-f-obs" value="${escA(c.obs||'')}" placeholder="opcional (ex.: reajuste anual pelo IPCA, NF até o dia 28)"></div>
    <div class="campo"><label>📂 Pasta do contrato (SharePoint)</label>
      <span style="display:flex;gap:6px;align-items:center"><input type="url" id="pc-f-pasta" value="${escA(c.pasta||'')}" placeholder="https://dexterity.sharepoint.com/..." style="min-width:280px" data-tip="Cole o link da pasta onde o contrato está guardado (no SharePoint: Abrir → ⋯ → Copiar link). O painel guarda só o endereço — o arquivo continua lá e abre com a sua conta."><button class="btn rt-step" id="pc-f-abrir-pasta" type="button" data-tip="Testar o link numa aba nova">abrir ↗</button></span>
      <div class="muted small">Depois de salvar, os arquivos (contrato, aditivos, proposta) entram em <b>📄 Documentos</b>, no cartão do contrato.</div></div>
    <div class="aviso pc-prev" id="pc-f-prev"></div>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap"><button class="btn primario" id="pc-f-salvar" data-pc-id="${escA(c.id)}">${novo?'Cadastrar contrato':'Salvar alterações'}</button><button class="btn" id="pc-f-cancelar">Cancelar</button></div>
    <div class="ap-fb" id="pc-f-fb" hidden></div></div>`;
}
// Exemplo vivo do calendário com o que está digitado no formulário.
function pcPreview(){
  const box=document.getElementById('pc-f-prev'); if(!box) return; const v=(id)=>{ const e=document.getElementById(id); return e?String(e.value).trim():''; };
  const c={ fatFecha:Number(v('pc-f-fecha'))||31, fatDia:Number(v('pc-f-nota'))||0, ajustes:{} }; const ym=hojeSP().slice(0,7); const P=pcPeriodo(c,ym), Q=pcPeriodo(c,pcYmSoma(ym,1));
  const fim=v('pc-f-fim'); const aviso=Number(v('pc-f-aviso'))||0; const avisoAte=pcData(fim)?voltaDias(fim,aviso):'';
  box.innerHTML=`📅 <b>Como fica:</b> período de ${esc(labelMesAbbr(P.ym))} = ${dataBR(P.ini)} → ${dataBR(P.fim)}, nota em <b>${dataBR(P.nota)}</b>; ${esc(labelMesAbbr(Q.ym))} = ${dataBR(Q.ini)} → ${dataBR(Q.fim)}, nota em <b>${dataBR(Q.nota)}</b>.${avisoAte?` ⏰ Com fim em ${dataBR(fim)} e ${aviso} dia(s) de aviso, o aviso prévio vai até <b>${dataBR(avisoAte)}</b>.`:''} <span class="muted small">Datas de um mês específico se ajustam depois, no 📅 calendário do contrato.</span>`;
  const md=document.getElementById('pc-f-modal'), dica=document.getElementById('pc-f-modal-dica'); if(md&&dica) dica.textContent=PC_MODAL[PC_MODAL[md.value]?md.value:'horas'][2];
}
function pcCardHTML(c, gestor, aba, hoje){
  const s=pcStatus(c); const M=PC_MODAL[pcModal(c)]; const vh=Number(c.valorHora)||0; const planos=pcPlanosDe(c.id);
  const ym=hoje.slice(0,7); const atual=pcPeriodo(c, pcFechamento(c,ym)<hoje?pcYmSoma(ym,1):ym);
  const dl=(l,v)=>`<div class="ams-dl"><div class="dt">${l}</div><div class="dd">${v}</div></div>`;
  const hist=Array.isArray(c.hist)?c.hist.slice().reverse():[];
  const dest=(estado.parcerias&&estado.parcerias.destaque)===c.id;
  const docs=pcDocs(c).filter(d=>pcUrl(d.url)); const pasta=pcUrl(c.pasta); const plan=pcPlanejamento(c);
  return `<div class="ad-card pc-card pc-${s.k}${aba?' pc-aberto':''}${dest?' pc-dest':''}" data-pc-card="${escA(c.id)}">
    <div class="ad-top"><strong>${esc(c.consultoria||'(sem nome)')}</strong> <span class="badge rp-tipo" data-tip="${escA(M[2])}">${M[0]} ${M[1]}</span> <span class="badge pc-st-${s.k}">${esc(s.rot)}</span><span class="spacer"></span>
      ${gestor?`<button class="btn" data-pc-edit="${escA(c.id)}">editar</button><button class="btn" data-pc-del="${escA(c.id)}">remover</button>`:''}</div>
    <div class="ams-dgrid">
      ${dl('Validade', `${c.inicio?dataBR(c.inicio):'—'} → ${c.fim?dataBR(c.fim):'sem fim'}`)}
      ${dl('Aviso prévio', c.fim?`${Number(c.avisoDias)||0} dia(s) · até ${dataBR(s.avisoAte)}${s.k==='avencer'?(s.avisoPassou?' <span class="rp-neg">(passou)</span>':' <span class="rp-neg">(agora)</span>'):''}`:`${Number(c.avisoDias)||0} dia(s)`)}
      ${dl('Valor-hora', vh?fmtBRL(vh):'—')}
      ${dl('Fechamento', `dia ${c.fatFecha||31}${(c.fatFecha||31)>=31?' (mês civil)':''}`)}
      ${dl('Nota', c.fatDia?`dia ${c.fatDia}`:'no fechamento')}
      ${dl('Período atual', `${dataBR(atual.ini)} → ${dataBR(atual.fim)} · nota ${dataBR(atual.nota)}${atual.ajustado?' ✎':''}`)}
      ${dl('Conta de recebimento', c.conta?esc(c.conta):'—')}
      ${dl('Contato', c.contato?esc(c.contato):'—')}
    </div>
    <div class="pc-docs-l">${pasta?`<a class="btn rt-step pc-doc" href="${escA(pasta)}" target="_blank" rel="noopener noreferrer" data-tip="${escA('Abrir a pasta do contrato no SharePoint — '+pcUrlCurta(pasta))}">📂 Pasta do contrato</a>`:''}${
      docs.slice(0,4).map(d=>{ const T=pcDocTipo(d); return `<a class="btn rt-step pc-doc" href="${escA(pcUrl(d.url))}" target="_blank" rel="noopener noreferrer" data-tip="${escA(T[2]+' — '+pcUrlCurta(d.url))}">${T[1]} ${esc(d.nome||T[2])}</a>`; }).join('')}${
      docs.length>4?`<span class="muted small">+${docs.length-4} em 📄 Documentos</span>`:''}${
      !pasta&&!docs.length?`<span class="muted small">📂 Nenhum documento cadastrado${gestor?' — informe a <b>pasta do contrato</b> em ✏️ editar e os arquivos em 📄 Documentos':''}.</span>`:''}</div>
    <div class="ams-dprojs muted small">👥 Equipe: ${plan.eq.length?`<b>${plan.eq.length}</b> recurso(s) · <b>${fmtHd(plan.totalH)}</b> previstas${plan.vh?` · <b>${fmtBRL(plan.totalV)}</b>`:''}${plan.de?` · ${dataBR(plan.de)} → ${dataBR(plan.ate)}`:''}`:'ninguém alocado ainda'}</div>
    <div class="ams-dprojs muted small">💹 Planos na Rentabilidade: ${planos.length?planos.map(p=>`<span class="lnk" data-pc-plano="${escA(p.id)}">${esc(p.nome||p.projeto||p.id)}</span>${p.projeto?` ${projChipsFicha([p.projeto])}`:''}`).join(', '):'nenhum ainda'}${Object.keys(c.ajustes||{}).length?` · ✎ ${Object.keys(c.ajustes).length} mês(es) com datas ajustadas`:''}</div>
    ${typeof pcOdooResumo==='function'?`<div class="ams-dprojs muted small pc-odoo-l">${pcOdooResumo(c, plan)}</div>`:''}
    ${c.obs?`<div class="ams-dobs muted small"><strong>Obs.:</strong> ${esc(c.obs)}</div>`:''}
    <div class="ad-cons pc-gav">
      <button class="btn rt-step${aba==='equipe'?' on':''}" data-pc-eq="${escA(c.id)}">👥 ${aba==='equipe'?'Fechar equipe':`Equipe e alocação${plan.eq.length?` (${plan.eq.length})`:''}`}</button>
      <button class="btn rt-step${aba==='fat'?' on':''}" data-pc-fat="${escA(c.id)}">🧾 ${aba==='fat'?'Fechar faturamentos':`Faturamentos${(typeof pcOdoo==='function'&&pcOdoo(c))?' · '+esc(pcOdoo(c).name||'Odoo'):''}`}</button>
      <button class="btn rt-step${aba==='cal'?' on':''}" data-pc-cal="${escA(c.id)}">📅 ${aba==='cal'?'Fechar calendário':'Calendário de faturamento'}</button>
      <button class="btn rt-step${aba==='docs'?' on':''}" data-pc-docs="${escA(c.id)}">📄 ${aba==='docs'?'Fechar documentos':`Documentos${docs.length?` (${docs.length})`:''}`}</button>
      <span class="muted small">${c.atualizadoEm?`atualizado ${dataBR(c.atualizadoEm)}${c.atualizadoPor?' por '+esc(c.atualizadoPor):''}`:''}</span></div>
    ${aba==='cal'?pcCalendarioHTML(c, gestor, hoje):aba==='equipe'?pcEquipeHTML(c, gestor, plan):aba==='docs'?pcDocsHTML(c, gestor):(aba==='fat'&&typeof pcFaturamentosHTML==='function')?pcFaturamentosHTML(c, gestor, plan, hoje):''}
    ${hist.length?`<details class="rm-det"><summary>🕓 Histórico (${hist.length})</summary><table class="mp-tab-mini rp-hist"><tbody>${hist.slice(0,8).map(h=>`<tr><td class="muted small">${esc(pcQuando(h.em))}</td><td>${esc(h.por||'')}</td><td class="small">${esc(h.d||'')}</td></tr>`).join('')}</tbody></table></details>`:''}
  </div>`;
}
// Calendário dos próximos 12 períodos (a partir do mês anterior ao atual): datas ajustáveis mês a mês.
function pcCalendarioHTML(c, gestor, hoje){
  let ym=pcYmSoma(hoje.slice(0,7),-1); if(pcData(c.inicio)&&ym<c.inicio.slice(0,7)) ym=c.inicio.slice(0,7);
  const rows=[]; for(let i=0;i<12;i++){ const P=pcPeriodo(c,ym); const fora=(pcData(c.fim)&&P.ini>c.fim)||(pcData(c.inicio)&&P.fim<c.inicio); const atual=P.ini<=hoje&&hoje<=P.fim;
    rows.push(`<tr class="${atual?'rm-destaque':''} ${fora?'pc-fora':''}"><td><b>${esc(labelMesAbbr(P.ym))}</b>${P.ajustado?' <span class="muted small" data-tip="datas ajustadas neste mês">✎</span>':''}</td><td>${dataBR(P.ini)} → ${dataBR(P.fim)}</td>
      <td>${gestor?`<input type="date" data-pc-aj="${escA(c.id)}|${P.ym}|fecha" value="${escA(P.fim)}">`:dataBR(P.fim)}</td>
      <td>${gestor?`<input type="date" data-pc-aj="${escA(c.id)}|${P.ym}|nota" value="${escA(P.nota)}">`:dataBR(P.nota)}</td>
      <td class="num">${pcDiasUteis(P.ini,P.fim)}</td><td>${fora?'<span class="muted small">fora da validade</span>':''}${gestor&&P.ajustado?`<button class="btn rt-step" data-pc-aj-rm="${escA(c.id)}|${P.ym}" data-tip="Volta às datas padrão do contrato neste mês">↺ padrão</button>`:''}</td></tr>`);
    ym=pcYmSoma(ym,1); }
  return `<div class="pc-cal"><div class="mp-h3">📅 Calendário de faturamento <span class="mp-dim">período · fechamento · dia da nota · dias úteis (feriados descontados)</span></div>
    <div class="scroll-x"><table class="mp-tab-mini pc-cal-tab"><thead><tr><th>Mês</th><th>Período</th><th>Fechamento</th><th>Nota</th><th class="num">Dias úteis</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <div class="muted small">${gestor?'Mude a data de fechamento ou de nota de um mês para ajustar só aquele mês (ex.: dezembro fecha no dia 20). O mês seguinte começa no dia seguinte ao fechamento ajustado.':'Datas ajustáveis pelos gestores.'}</div></div>`;
}
// 📄 Documentos do contrato: tipo, nome e o link (SharePoint). Todos veem e abrem; gestores cadastram.
function pcDocsHTML(c, gestor){
  const docs=pcDocs(c); const pasta=pcUrl(c.pasta);
  const rows=docs.map(d=>{ const T=pcDocTipo(d); const u=pcUrl(d.url);
    return `<tr>
      <td>${gestor?`<select data-pc-doc="${escA(c.id)}|${escA(d.id)}|tipo">${PC_DOC_TIPOS.map(t=>`<option value="${t[0]}" ${d.tipo===t[0]?'selected':''}>${t[1]} ${t[2]}</option>`).join('')}</select>`:`${T[1]} ${esc(T[2])}`}</td>
      <td>${gestor?`<input type="text" data-pc-doc="${escA(c.id)}|${escA(d.id)}|nome" value="${escA(d.nome||'')}" placeholder="nome do arquivo" style="min-width:170px">`:esc(d.nome||T[2])}</td>
      <td>${gestor?`<input type="url" data-pc-doc="${escA(c.id)}|${escA(d.id)}|url" value="${escA(d.url||'')}" placeholder="https://…sharepoint.com/…" style="min-width:230px">`:`<span class="muted small">${esc(pcUrlCurta(d.url||''))}</span>`}</td>
      <td>${u?`<a class="btn rt-step" href="${escA(u)}" target="_blank" rel="noopener noreferrer" data-tip="Abre no SharePoint, com a sua conta">abrir ↗</a>`:'<span class="muted small">sem link válido</span>'}</td>
      <td>${gestor?`<button class="btn rt-step" data-pc-doc-rm="${escA(c.id)}|${escA(d.id)}" data-tip="Tira o documento da lista (o arquivo continua no SharePoint)">🗑</button>`:''}</td></tr>`; }).join('');
  return `<div class="pc-cal"><div class="mp-h3">📄 Documentos do contrato <span class="mp-dim">contrato, aditivos e proposta — o painel guarda só o link; o arquivo continua no SharePoint</span></div>
    <div class="muted small" style="margin-bottom:8px">📂 Pasta: ${pasta?`<a href="${escA(pasta)}" target="_blank" rel="noopener noreferrer">${esc(pcUrlCurta(pasta))} ↗</a>`:`<b>não informada</b>${gestor?' — clique em <b>editar</b> e cole o link da pasta no SharePoint':''}`}</div>
    ${docs.length?`<div class="scroll-x"><table class="mp-tab-mini pc-doc-tab"><thead><tr><th>Tipo</th><th>Nome</th><th>Link</th><th></th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      :`<div class="estado">Nenhum documento cadastrado ainda.${gestor?' Clique em <b>＋ Documento</b> e cole o link do arquivo no SharePoint (Abrir → ⋯ → Copiar link).':''}</div>`}
    ${gestor?`<div style="margin-top:8px"><button class="btn" data-pc-doc-add="${escA(c.id)}">＋ Documento</button></div>`:''}
    <div class="muted small" style="margin-top:6px">Quem abre usa a <b>própria conta do SharePoint</b> — quem não tem acesso à pasta continua sem ver o arquivo. O painel nunca guarda o documento nem credencial.</div></div>`;
}
// 👥 Equipe e alocação: os recursos do contrato, cada um com os seus trechos, e as horas por período de faturamento.
function pcEquipeHTML(c, gestor, plan){
  const P=plan||pcPlanejamento(c); const eq=P.eq; const vh=P.vh;
  const pessoas=(typeof pessoasUnidas==='function')?pessoasUnidas():{};
  const ocultos=new Set((cfg.ocultos||[]).map(o=>o&&o.a).filter(Boolean));
  const opts=Object.entries(pessoas).filter(([a,p])=>!ocultos.has(a)&&!(typeof RE_EXCLUIR!=='undefined'&&RE_EXCLUIR.test((p&&p.nome)||'')))
    .sort((x,y)=>((x[1]&&x[1].nome)||'').localeCompare((y[1]&&y[1].nome)||'','pt'));
  const add=gestor?`<div class="ap-filtros pc-eq-add">
    <div class="campo"><label>Pessoa do time</label><select id="pc-eq-a"><option value="">— ou digite um nome ao lado —</option>${opts.map(([a,p])=>`<option value="${escA(a)}">${esc((p&&p.nome)||a)}</option>`).join('')}</select></div>
    <div class="campo"><label>Nome do recurso</label><input type="text" id="pc-eq-nome" placeholder="ex.: Consultor SAP MM (a contratar)" style="min-width:210px"></div>
    <div class="campo"><label>&nbsp;</label><button class="btn primario" data-pc-eq-add="${escA(c.id)}">＋ Adicionar recurso</button></div></div>`:'';
  const ci=pcData(c.inicio)?c.inicio:'0000-01-01', cf=pcData(c.fim)?c.fim:'9999-12-31';   // o trecho conta só dentro da validade
  const caixas=eq.map(p=>{
    const rs=pcRegras(p);
    const linhas=rs.map(r=>{ const h=Math.round(pcHorasRegra(r,p.a,ci,cf)*100)/100;
      const du=pcDiasUteis(r.de>ci?r.de:ci, r.ate<cf?r.ate:cf);
      return `<tr>
        <td>${gestor?`<input type="date" data-pc-rg="${escA(p.id)}|${escA(r.id)}|de" value="${escA(r.de||'')}">`:dataBR(r.de)}</td>
        <td>${gestor?`<input type="date" data-pc-rg="${escA(p.id)}|${escA(r.id)}|ate" value="${escA(r.ate||'')}">`:dataBR(r.ate)}</td>
        <td>${gestor?`<span class="pc-rg-ded"><input type="number" min="0" step="0.5" data-pc-rg="${escA(p.id)}|${escA(r.id)}|v" value="${escA(String(r.v==null?'':r.v))}" style="width:84px">
          <select data-pc-rg="${escA(p.id)}|${escA(r.id)}|modo">${Object.entries(PC_MODOS).map(([k,M])=>`<option value="${k}" ${pcModo(r)===k?'selected':''} title="${escA(M[2])}">${M[0]}</option>`).join('')}</select></span>`
          :esc(pcRegraRot(r).split(' · ')[0])}</td>
        <td class="num">${du}</td>
        <td class="num"><b>${fmtHd(h)}</b>${vh?` <span class="muted small">${fmtBRL(h*vh)}</span>`:''}</td>
        <td>${gestor?`<button class="btn rt-step" data-pc-rg-rm="${escA(p.id)}|${escA(r.id)}" data-tip="Remover este trecho">🗑</button>`:''}</td></tr>`; }).join('');
    const tot=P.porRec[p.id]||0;
    return `<div class="pc-eq-p" data-pc-rec="${escA(p.id)}">
      <div class="pc-eq-h"><b>${esc(pcNomeRec(p))}</b>${p.a?` <span class="badge" data-tip="Pessoa do time — a meta diária dela (${pcHDia(p.a)}h) é a base do % do dia">👤 do time</span>`:' <span class="badge" data-tip="Nome livre: usa a meta diária global no % do dia">✎ nome livre</span>'}
        <span class="muted small">${rs.length} trecho(s) · <b>${fmtHd(tot)}</b> no contrato${vh?` · ${fmtBRL(tot*vh)}`:''}</span>
        <span class="spacer"></span>${gestor?`<button class="btn rt-step" data-pc-rec-rm="${escA(c.id)}|${escA(p.id)}" data-tip="Tirar o recurso do contrato">🗑 remover</button>`:''}</div>
      ${rs.length?`<div class="scroll-x"><table class="mp-tab-mini pc-eq-tab"><thead><tr><th>De</th><th>Até</th><th>Dedicação</th><th class="num">Dias úteis</th><th class="num">Horas</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>`
        :`<div class="muted small">Sem trechos — ${gestor?'clique em <b>＋ trecho</b> para alocar (ex.: 2h por dia útil de 15/05 a 25/05).':'nada alocado ainda.'}</div>`}
      ${gestor?`<div style="margin-top:6px"><button class="btn rt-step" data-pc-rg-add="${escA(c.id)}|${escA(p.id)}">＋ trecho</button> <span class="muted small">um trecho por dedicação: 2h/dia até 25/05 e 4h/dia depois são <b>dois</b> trechos.</span></div>`:''}</div>`;
  }).join('');
  const hoje=hojeSP();
  const curto=(n)=>{ const w=String(n||'').trim().split(/\s+/); let s=w[0]||''; if(w[1]&&(s+' '+w[1]).length<=16) s+=' '+w[1]; return s; };
  // 🧾 A grade da previsão. As colunas Horas e Valor são EDITÁVEIS para gestores: o campo vazio mostra o
  // cálculo como placeholder (= automático) e, quando alguém digita, o calculado continua logo abaixo
  // ("calc. 168h") para a diferença ficar à vista. O ↺ devolve a linha ao automático.
  const nu=(v)=>String(Math.round((Number(v)||0)*100)/100);
  const celH=(x)=>gestor
    ? `<input type="number" min="0" step="0.5" class="pc-prev-i${x.manH?' pc-man':''}" data-pc-prev="${escA(c.id)}|${escA(x.ym)}|h"
         value="${x.manH?escA(nu(x.horas)):''}" placeholder="${escA(fmtHd(x.horasAuto))}" aria-label="Horas previstas em ${escA(labelMesAbbr(x.ym))}"
         data-tip="${x.manH?'Horas digitadas — apague para voltar ao cálculo':'Horas calculadas pelos trechos: digite para substituir'}">
       ${x.manH?`<span class="pc-prev-calc">calc. ${fmtHd(x.horasAuto)}</span>`:''}`
    : `<b>${fmtHd(x.horas)}</b>${x.manH?` <span class="pc-man-selo" data-tip="Ajustado à mão — o cálculo dava ${escA(fmtHd(x.horasAuto))}">✎</span>`:''}`;
  const celV=(x)=>gestor
    ? `<input type="number" min="0" step="0.01" class="pc-prev-i pc-prev-v${x.manV?' pc-man':''}" data-pc-prev="${escA(c.id)}|${escA(x.ym)}|v"
         value="${x.manV?escA(nu(x.valor)):''}" placeholder="${escA(fmtBRL(x.valorAuto))}" aria-label="Valor previsto em ${escA(labelMesAbbr(x.ym))}"
         data-tip="${x.manV?'Valor digitado — apague para voltar ao cálculo':'Valor calculado (horas × valor-hora): digite para fechar um valor'}">
       ${x.manV?`<span class="pc-prev-calc">calc. ${fmtBRL(x.valorAuto)}</span>`:''}`
    : `${fmtBRL(x.valor)}${x.manV?` <span class="pc-man-selo" data-tip="Ajustado à mão — o cálculo dava ${escA(fmtBRL(x.valorAuto))}">✎</span>`:''}`;
  const grade=P.periodos.length?`<div class="scroll-x"><table class="mp-tab-mini pc-eq-grade"><thead><tr><th>Mês</th><th>Período</th><th class="num">Dias úteis</th>${
      eq.map(p=>`<th class="num" data-tip="${escA(pcNomeRec(p))}">${esc(curto(pcNomeRec(p)))}</th>`).join('')}<th class="num">Horas</th>${vh?'<th class="num">Valor</th>':''}<th>Nota</th>${gestor?'<th></th>':''}</tr></thead>
    <tbody>${P.periodos.map(x=>`<tr class="${x.ini<=hoje&&hoje<=x.fim?'rm-destaque':''}${(x.manH||x.manV)?' pc-prev-man':''}"><td><b>${esc(labelMesAbbr(x.ym))}</b>${x.ajustado?' <span class="muted small" data-tip="datas ajustadas neste mês">✎</span>':''}</td>
      <td>${dataBR(x.iniPlano)} → ${dataBR(x.fimPlano)}${x.recortado?' <span class="muted small" data-tip="Período recortado pela alocação/validade">✂</span>':''}</td><td class="num">${x.du}</td>
      ${eq.map(p=>`<td class="num">${x.porPessoa[p.id]?fmtHd(x.porPessoa[p.id]):'<span class="muted">—</span>'}</td>`).join('')}
      <td class="num pc-prev-c">${celH(x)}</td>${vh?`<td class="num pc-prev-c">${celV(x)}</td>`:''}<td class="muted small">${dataBR(x.nota)}</td>${
      gestor?`<td>${(x.manH||x.manV)?`<button class="btn rt-step" data-pc-prev-rm="${escA(c.id)}|${escA(x.ym)}" data-tip="Voltar este período ao cálculo automático">↺</button>`:''}</td>`:''}</tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="3"><b>Total</b></td>${eq.map(p=>`<td class="num"><b>${fmtHd(P.porRec[p.id]||0)}</b></td>`).join('')}<td class="num"><b>${fmtHd(P.totalH)}</b>${
      P.totalH!==P.totalHAuto?`<span class="pc-prev-calc">calc. ${fmtHd(P.totalHAuto)}</span>`:''}</td>${vh?`<td class="num"><b>${fmtBRL(P.totalV)}</b>${
      P.totalV!==P.totalVAuto?`<span class="pc-prev-calc">calc. ${fmtBRL(P.totalVAuto)}</span>`:''}</td>`:''}<td></td>${gestor?'<td></td>':''}</tr></tfoot></table></div>
    ${P.nMan?`<div class="muted small" style="margin-top:6px">✎ <b>${P.nMan} período(s) ajustado(s) à mão</b> — o número digitado vale, e o calculado fica ao lado. As colunas de cada pessoa continuam mostrando o que os <b>trechos</b> dizem, por isso elas podem não somar o total ajustado.</div>`:''}
    ${P.orfaos&&P.orfaos.length?`<div class="aviso" style="margin-top:6px">✎ Há ajuste manual guardado para ${P.orfaos.map(ym=>`<b>${esc(labelMesAbbr(ym))}</b>`).join(' · ')}, fora do que a alocação cobre hoje. Ele volta a valer se o período voltar.${
      gestor?` <button class="btn rt-step" data-pc-prev-limpar="${escA(c.id)}">🗑 descartar</button>`:''}</div>`:''}
    <div class="muted small" style="margin-top:6px">As horas de cada período saem dos <b>dias úteis</b> do trecho dentro dele (feriados descontados) e o valor usa o valor-hora do contrato${vh?` (${fmtBRL(vh)})`:' — ainda não informado'}. O período e o dia da nota são os do 📅 calendário de faturamento.${
      gestor?' Nem todo mês fecha pela conta: <b>digite por cima</b> nas colunas Horas e Valor quando o mês for negociado; apague o campo para voltar ao cálculo.':''}</div>`
    :`<div class="estado">Nenhuma alocação ainda${eq.length?' — cadastre os trechos de cada recurso acima':''}. O planejamento aparece aqui por <b>período de faturamento</b> assim que houver um trecho com datas.</div>`;
  return `<div class="pc-cal pc-eq"><div class="mp-h3">👥 Equipe e alocação <span class="mp-dim">quem vai trabalhar no contrato, quanto e quando — e quanto isso vira em cada nota</span></div>
    ${P.fora&&P.fora.length?`<div class="aviso">⚠ Fora da validade do contrato (não entram no planejamento): ${P.fora.map(esc).join(' · ')}.</div>`:''}
    ${add}${caixas}${eq.length?'':`<div class="estado">Nenhum recurso no contrato ainda.${gestor?' Escolha alguém do time (ou digite o nome de um recurso a contratar) e clique em <b>＋ Adicionar recurso</b>.':''}</div>`}
    <div class="mp-h3" style="margin-top:14px">🧾 Previsão por período de faturamento</div>${grade}</div>`;
}
function pcLeForm(c){
  const v=(id)=>{ const e=document.getElementById(id); return e?String(e.value).trim():''; };
  c.consultoria=v('pc-f-consultoria').slice(0,120); c.modalidade=PC_MODAL[v('pc-f-modal')]?v('pc-f-modal'):'horas'; c.inicio=v('pc-f-inicio'); c.fim=v('pc-f-fim');
  c.valorHora=Math.max(0,Number(v('pc-f-vh'))||0); c.avisoDias=Math.max(0,Math.round(Number(v('pc-f-aviso'))||0));
  c.fatFecha=Math.max(1,Math.min(31,Math.round(Number(v('pc-f-fecha'))||31))); c.fatDia=Math.max(0,Math.min(31,Math.round(Number(v('pc-f-nota'))||0)));
  c.conta=v('pc-f-conta').slice(0,120); c.contato=v('pc-f-contato').slice(0,120); c.obs=v('pc-f-obs').slice(0,300);
  const pasta=v('pc-f-pasta'); if(pasta&&!pcUrl(pasta)) return 'A pasta do contrato precisa ser um endereço http(s) — copie o link da pasta no SharePoint.';
  c.pasta=pcUrl(pasta); if(!c.ajustes||typeof c.ajustes!=='object') c.ajustes={};
  if(!c.consultoria) return 'Informe o nome da consultoria parceira.'; if(!pcData(c.inicio)) return 'Informe o início da validade.';
  if(c.fim&&!pcData(c.fim)) return 'Data de fim inválida.'; if(c.fim&&c.fim<c.inicio) return 'O fim da validade precisa ser depois do início.';
  return '';
}

// ---- listeners delegados desta tela ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='parcerias') return; const st=estado.parcerias=estado.parcerias||{}; const gestor=souAprovador();
  const pl=e.target.closest&&e.target.closest('[data-pc-plano]'); if(pl){ estado.rentab.sel=pl.getAttribute('data-pc-plano'); estado.rentab.edit=false; vaiPara('rentab'); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  // 🗂 gavetas do cartão (uma por vez): 👥 equipe · 🧾 faturamentos (16c) · 📅 calendário · 📄 documentos
  const gav=['data-pc-eq','data-pc-fat','data-pc-cal','data-pc-docs'].find(k=>t.hasAttribute(k));
  if(gav){ const id=t.getAttribute(gav); const qual=gav==='data-pc-eq'?'equipe':gav==='data-pc-fat'?'fat':gav==='data-pc-cal'?'cal':'docs';
    st.aba=(st.aba&&st.aba.id===id&&st.aba.qual===qual)?null:{ id, qual }; renderParcerias(); return; }
  if(!gestor) return;
  // 📄 documentos do contrato
  if(t.hasAttribute('data-pc-doc-add')){ const c=pcDe(t.getAttribute('data-pc-doc-add')); if(!c) return;
    pcDocs(c).push({ id:pcId('dc'), tipo:pcDocs(c).length?'aditivo':'contrato', nome:'', url:'' }); salvaCfg(); renderParcerias(); return; }
  if(t.hasAttribute('data-pc-doc-rm')){ const [id,did]=t.getAttribute('data-pc-doc-rm').split('|'); const c=pcDe(id); if(!c) return;
    const d=pcDocs(c).find(x=>x.id===did); c.docs=pcDocs(c).filter(x=>x.id!==did);
    pcLog(c,'doc',`documento removido${d&&d.nome?': '+d.nome:''}`); salvaCfg(); renderParcerias(); return; }
  // 👥 equipe e alocação
  if(t.hasAttribute('data-pc-eq-add')){ const c=pcDe(t.getAttribute('data-pc-eq-add')); if(!c) return;
    const sel=document.getElementById('pc-eq-a'); const inp=document.getElementById('pc-eq-nome');
    const a=(sel&&sel.value)||''; const nome=String((inp&&inp.value)||'').trim()||(a?(((typeof pessoasUnidas==='function'?pessoasUnidas():{})[a]||{}).nome||a):'');
    if(!nome){ toast('Escolha alguém do time ou digite o nome do recurso.','warn'); return; }
    if(a&&pcEquipe(c).some(x=>x.a===a)){ toast('Esta pessoa já está na equipe do contrato.','warn'); return; }
    const rec=pcNovoRec(nome,a); rec.regras=[pcNovaRegra(c)];
    pcEquipe(c).push(rec); pcLog(c,'equipe',`${nome} entrou na equipe · ${pcRegraRot(rec.regras[0])}`); salvaCfg();
    st.aba={ id:c.id, qual:'equipe' }; renderParcerias(); return; }
  if(t.hasAttribute('data-pc-rec-rm')){ const [id,pid]=t.getAttribute('data-pc-rec-rm').split('|'); const c=pcDe(id); if(!c) return;
    const p=pcEquipe(c).find(x=>x.id===pid); if(!p) return;
    if(!confirm(`Tirar ${pcNomeRec(p)} da equipe do contrato "${c.consultoria}"? Os trechos de alocação dele serão apagados.`)) return;
    c.equipe=pcEquipe(c).filter(x=>x.id!==pid); pcLog(c,'equipe',`${pcNomeRec(p)} saiu da equipe`); salvaCfg(); renderParcerias(); return; }
  if(t.hasAttribute('data-pc-rg-add')){ const [id,pid]=t.getAttribute('data-pc-rg-add').split('|'); const c=pcDe(id); if(!c) return;
    const p=pcEquipe(c).find(x=>x.id===pid); if(!p) return;
    const r=pcNovaRegra(c); const ult=pcRegras(p)[pcRegras(p).length-1];
    if(ult&&pcData(ult.ate)){ r.de=proxDia(ult.ate); if(r.ate<r.de) r.ate=pcData(c.fim)?c.fim:pcUltimoDia(pcYmSoma(r.de.slice(0,7),2)); }   // o trecho novo começa no dia seguinte ao anterior
    pcRegras(p).push(r); pcLog(c,'equipe',`${pcNomeRec(p)} · trecho novo ${pcRegraRot(r)}`); salvaCfg(); renderParcerias(); return; }
  if(t.hasAttribute('data-pc-rg-rm')){ const [pid,rid]=t.getAttribute('data-pc-rg-rm').split('|');
    const c=pcLista().find(x=>pcEquipe(x).some(p=>p.id===pid)); if(!c) return;
    const p=pcEquipe(c).find(x=>x.id===pid); if(!p) return; const r=pcRegras(p).find(x=>x.id===rid);
    p.regras=pcRegras(p).filter(x=>x.id!==rid); pcLog(c,'equipe',`${pcNomeRec(p)} · trecho removido${r?' ('+pcRegraRot(r)+')':''}`); salvaCfg(); renderParcerias(); return; }
  if(t.id==='pc-f-abrir-pasta'){ const u=pcUrl((document.getElementById('pc-f-pasta')||{}).value); if(u) window.open(u,'_blank','noopener'); else toast('Cole primeiro o link da pasta (http:// ou https://).','warn'); return; }
  if(t.hasAttribute('data-pc-novo')){ st.novo=true; st.editId=null; st.rasc=pcNovo(); st.destaque=''; renderParcerias(); return; }
  if(t.hasAttribute('data-pc-edit')){ st.editId=t.getAttribute('data-pc-edit'); st.novo=false; st.rasc=null; st.destaque=''; renderParcerias(); window.scrollTo({top:0,behavior:'smooth'}); return; }
  if(t.id==='pc-f-cancelar'){ st.novo=false; st.editId=null; st.rasc=null; renderParcerias(); return; }
  if(t.id==='pc-f-salvar'){ const fb=document.getElementById('pc-f-fb'); const diz=(m)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=m; } };
    if(st.editId){ const c=pcDe(st.editId); if(!c) return; const antes=JSON.parse(JSON.stringify(c)); const erro=pcLeForm(c); if(erro){ Object.assign(c,antes); diz(erro); return; }
      const dif=pcDiff(antes,c); pcLog(c,'editou',dif.length?dif.join('; '):'salvo sem mudanças'); st.editId=null; st.rasc=null; salvaCfg(); toast('Contrato atualizado.','ok'); renderParcerias(); return; }
    const c=st.rasc||pcNovo(); const erro=pcLeForm(c); if(erro){ diz(erro); return; }
    c.criadoEm=hojeSP(); c.criadoPor=pcQuem().nome; pcLog(c,'criou',`${PC_MODAL[pcModal(c)][1]} · ${dataBR(c.inicio)} → ${c.fim?dataBR(c.fim):'sem fim'} · ${fmtBRL(c.valorHora)}/h · fecha dia ${c.fatFecha}`);
    pcLista().push(c); st.novo=false; st.rasc=null; salvaCfg(); toast('Contrato cadastrado. Ligue os planos de horas abertas a ele na 💹 Rentabilidade.','ok'); renderParcerias(); return; }
  if(t.hasAttribute('data-pc-del')){ const c=pcDe(t.getAttribute('data-pc-del')); if(!c) return;
    if(typeof pcRemoveContrato==='function'){ pcRemoveContrato(c); return; }   // 16c: cancela a ordem no Odoo antes
    const n=pcPlanosDe(c.id).length; if(!confirm(`Remover o contrato "${c.consultoria}"?${n?` ${n} plano(s) da Rentabilidade apontam para ele e perderão o vínculo.`:''}`)) return;
    pcPlanosDe(c.id).forEach(p=>{ p.contrato=''; }); cfg.parcerias=pcLista().filter(x=>x.id!==c.id); if(st.aba&&st.aba.id===c.id) st.aba=null; salvaCfg(); renderParcerias(); return; }
  if(t.hasAttribute('data-pc-aj-rm')){ const [id,ym]=t.getAttribute('data-pc-aj-rm').split('|'); const c=pcDe(id); if(!c||!c.ajustes) return; delete c.ajustes[ym]; pcLog(c,'ajuste',`${labelMesAbbr(ym)}: datas de volta ao padrão`); salvaCfg(); renderParcerias(); return; }
  // ✎ previsão: ↺ devolve um período ao cálculo · 🗑 descarta os ajustes órfãos (meses que a alocação não cobre mais)
  if(t.hasAttribute('data-pc-prev-rm')){ const [id,ym]=t.getAttribute('data-pc-prev-rm').split('|'); const c=pcDe(id); if(!c) return;
    if(!pcPrevDe(c,ym)) return; delete pcPrev(c)[ym];
    pcLog(c,'previsão',`${labelMesAbbr(ym)}: de volta ao cálculo automático`); salvaCfg(); renderParcerias(); return; }
  if(t.hasAttribute('data-pc-prev-limpar')){ const c=pcDe(t.getAttribute('data-pc-prev-limpar')); if(!c) return;
    const orf=pcPrevOrfaos(c,pcPlanejamento(c).periodos); if(!orf.length) return;
    if(!confirm(`Descartar o ajuste manual de ${orf.map(labelMesAbbr).join(', ')}? Esses meses estão fora do que a alocação cobre hoje.`)) return;
    orf.forEach(ym=>{ delete pcPrev(c)[ym]; });
    pcLog(c,'previsão',`ajuste manual descartado: ${orf.map(labelMesAbbr).join(', ')}`); salvaCfg(); renderParcerias(); return; }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='parcerias') return; const t=e.target; if(!t||!t.hasAttribute) return;
  if(t.hasAttribute('data-pc-aj')){ if(!souAprovador()) return; const [id,ym,campo]=t.getAttribute('data-pc-aj').split('|'); const c=pcDe(id); if(!c) return; if(!c.ajustes||typeof c.ajustes!=='object') c.ajustes={};
    const val=String(t.value||''); if(!pcData(val)){ renderParcerias(); return; }
    const padrao=campo==='fecha'?pcDiaNoMes(ym,c.fatFecha||31):pcNota({ ...c, ajustes:{ ...c.ajustes, [ym]:{ ...(c.ajustes[ym]||{}), nota:'' } } },ym);
    const a=c.ajustes[ym]||{}; if(val===padrao) delete a[campo]; else a[campo]=val; if(Object.keys(a).length) c.ajustes[ym]=a; else delete c.ajustes[ym];
    pcLog(c,'ajuste',`${labelMesAbbr(ym)}: ${campo==='fecha'?'fechamento':'nota'} → ${dataBR(val)}`); salvaCfg(); renderParcerias(); return; }
  // 📄 documento: tipo, nome e link (só http(s) — um endereço inválido é recusado e o campo volta ao que estava)
  if(t.hasAttribute('data-pc-doc')){ if(!souAprovador()) return; const [id,did,campo]=t.getAttribute('data-pc-doc').split('|'); const c=pcDe(id); if(!c) return;
    const d=pcDocs(c).find(x=>x.id===did); if(!d) return; const val=String(t.value||'').trim();
    if(campo==='url'){ const u=pcUrl(val); if(val&&!u){ toast('O link precisa começar com http:// ou https:// — copie o link do arquivo no SharePoint.','warn'); renderParcerias(); return; } d.url=u; }
    else if(campo==='nome') d.nome=val.slice(0,120);
    else d.tipo=PC_DOC_TIPOS.some(x=>x[0]===val)?val:'outro';
    pcLog(c,'doc',`${pcDocTipo(d)[2]}${d.nome?' "'+d.nome+'"':''}: ${campo} atualizado`); salvaCfg(); renderParcerias(); return; }
  // ✎ previsão do período digitada à mão: horas e/ou valor (vazio = volta ao cálculo automático)
  if(t.hasAttribute('data-pc-prev')){ if(!souAprovador()) return; const [id,ym,campo]=t.getAttribute('data-pc-prev').split('|');
    const c=pcDe(id); if(!c||(campo!=='h'&&campo!=='v')) return;
    const bruto=String(t.value||'').trim();
    if(bruto&&pcPrevNum(bruto)==null){ toast('Digite um número igual ou maior que zero — ou deixe em branco para voltar ao cálculo.','warn'); renderParcerias(); return; }
    const antes=pcPrevDe(c,ym)||{}; const tinha=antes[campo];
    const n=pcPrevSet(c,ym,campo,bruto);
    if(n===tinha||(n==null&&tinha==null)){ renderParcerias(); return; }
    const rot=campo==='h'?'horas':'valor';
    pcLog(c,'previsão',`${labelMesAbbr(ym)}: ${rot} ${n==null?'de volta ao cálculo':'→ '+(campo==='h'?fmtHd(n):fmtBRL(n))}`);
    salvaCfg(); renderParcerias(); return; }
  // 👥 trecho de alocação: datas, modo e dedicação (salva na hora; as horas do período são recalculadas)
  if(t.hasAttribute('data-pc-rg')){ if(!souAprovador()) return; const [pid,rid,campo]=t.getAttribute('data-pc-rg').split('|');
    const c=pcLista().find(x=>pcEquipe(x).some(p=>p.id===pid)); if(!c) return;
    const p=pcEquipe(c).find(x=>x.id===pid); const r=pcRegras(p).find(x=>x.id===rid); if(!r) return;
    const val=String(t.value||'').trim();
    if(campo==='de'||campo==='ate'){ if(!pcData(val)){ renderParcerias(); return; } r[campo]=val; if(pcData(r.de)&&pcData(r.ate)&&r.ate<r.de){ const x=r.de; r.de=r.ate; r.ate=x; } }
    else if(campo==='modo') r.modo=PC_MODO_IDS.includes(val)?val:'dia';
    else r.v=Math.max(0,Number(val)||0);
    pcLog(c,'equipe',`${pcNomeRec(p)} · ${pcRegraRot(r)}`); salvaCfg(); renderParcerias(); return; }
  if(/^pc-f-/.test(t.id||'')){ pcGuardaRasc(); pcPreview(); }
});
document.getElementById('conteudo').addEventListener('input',(e)=>{ if(estado.vista!=='parcerias') return; const t=e.target; if(!t||!/^pc-f-/.test(t.id||'')) return;
  pcGuardaRasc(); if(/^pc-f-(fecha|nota|fim|aviso)$/.test(t.id)) pcPreview(); });
