// Jira Insights · 16 · 💼 CONTRATOS & VALORES (Admin), 🛠️ AMS & GOVERNANÇA (ciclos, apuração) e 💰 RECEITA.
// renderAdmin/renderAMS/renderReceita ficam no fim deste arquivo.
// ====================== ADMINISTRAÇÃO — CONTRATOS & VALORES ======================
const fmtBRL=(v)=> 'R$ '+(Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
// Consumo (horas e valor estimado) de um contrato, somando os worklogs dos projetos
// mapeados no período carregado.
function consumoContrato(c){
  const set=new Set(c.projetos||[]); let seg=0;
  ((estado.tempo&&estado.tempo.worklogs)||[]).forEach(w=>{ if(set.has(w.p)) seg+=(Number(w.s)||0); });
  return { seg, valor:(seg/3600)*(Number(c.valorHora)||0) };
}
const TIPOS_CONTRATO=[['ams','AMS (pacote por ciclo)'],['bolsa','Bolsa de horas (total)'],['projeto','Projeto (horas fechadas)'],['horas','Horas abertas (alocar por projeto)']];
function rotuloTipo(t){ const o=TIPOS_CONTRATO.find(x=>x[0]===t); return o?o[1]:t; }
// ---- ⏱ Horas abertas (2026-10-04, a pedido do usuário: "informar o número de horas contratado e, num segundo
// momento, alocar essas horas para projetos do Jira"): o contrato guarda o TOTAL (horasContratadas) e a alocação
// por projeto em c.alocacao = {CHAVE: horas}; c.projetos continua sendo a lista de projetos do contrato (é ela que
// liga as horas apontadas a todos os módulos). Projeto marcado sem horas = ainda não alocado.
// Categorias do Jira que cada tipo SUGERE no seletor (as demais ficam a um clique, em "mostrar todos").
const CT_CATS={ ams:['DAMS','PAMS'], horas:['DEA','PEA'], projeto:['DEF','PEF'], bolsa:['DEA','PEA','DEF','PEF','DAMS','PAMS'] };
function ctSiglaProj(p){ return (typeof relSiglaDe==='function')?relSiglaDe((p&&p.categoria)||''):''; }
function ctAlocDe(c, k){ return Math.max(0, Number(((c&&c.alocacao)||{})[k])||0); }   // leitor: não cria c.alocacao
function ctAlocTotal(c){ return ((c&&c.projetos)||[]).reduce((s,k)=>s+ctAlocDe(c,k),0); }
// Horas "vendidas" de UM projeto do contrato — a régua que a Controladoria, as Métricas, a Rentabilidade e a ficha do
// projeto usam: AMS = horas do ciclo; horas abertas = o que foi alocado ao projeto; bolsa/projeto = o total do contrato.
function ctHorasDoProjeto(c, k){ if(!c) return 0; if(c.tipo==='ams') return amsHorasCiclo(c);
  if(c.tipo==='horas') return ctAlocDe(c,k); return Number(c.horasContratadas)||0; }

// ---------- AMS: apuração por ciclo (com banco de horas dentro do ciclo) ----------
const AMS_APUR=[['mensal','Mensal'],['trimestral','Trimestral'],['semestral','Semestral'],['anual','Anual']];
const AMS_MESES_CICLO={mensal:1,trimestral:3,semestral:6,anual:12};
const MESES_ABBR=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function amsCicloMeses(ap){ return AMS_MESES_CICLO[ap]||3; }
function amsLabelApur(ap){ const o=AMS_APUR.find(x=>x[0]===ap); return o?o[1]:'Trimestral'; }
function amsCiclosAno(ap){ return Math.round(12/amsCicloMeses(ap)); }
function amsHorasCiclo(c){ return Number(c.horasCiclo!=null?c.horasCiclo:c.horasContratadas)||0; }
// Categoria de projeto AMS no Jira (ex.: "DAMS | Dexterity - AMS"). O contrato AMS só
// deve mapear projetos dessa categoria. Detecta "AMS" como palavra na categoria.
const RE_CAT_AMS=/\bd?ams\b/i;
function ehCategoriaAMS(cat){ return RE_CAT_AMS.test(cat||''); }
function diaAntes(iso){ const [y,m,d]=iso.split('-').map(Number); return new Date(Date.UTC(y,m-1,d-1)).toISOString().slice(0,10); }
function labelMesAbbr(ym){ const [y,m]=ym.split('-'); return `${MESES_ABBR[(+m)-1]}/${y.slice(2)}`; }
// Ciclo de apuração vigente (alinhado ao mês de início da vigência), contendo `ref`.
function amsCicloVigente(c, ref){
  ref=ref||hojeSP(); const cm=amsCicloMeses(c.apuracao||'trimestral');
  let baseY,baseM;
  if(c.inicio && /^\d{4}-\d{2}/.test(c.inicio)){ baseY=+c.inicio.slice(0,4); baseM=+c.inicio.slice(5,7)-1; }
  else { baseY=+ref.slice(0,4); baseM=0; }
  const refY=+ref.slice(0,4), refM=+ref.slice(5,7)-1;
  let diff=(refY-baseY)*12+(refM-baseM); if(diff<0) diff=0;
  const idx=Math.floor(diff/cm), startIdx=baseM+idx*cm;
  const start=`${baseY+Math.floor(startIdx/12)}-${String(startIdx%12+1).padStart(2,'0')}-01`;
  const endIdx=startIdx+cm;
  const end=diaAntes(`${baseY+Math.floor(endIdx/12)}-${String(endIdx%12+1).padStart(2,'0')}-01`);
  const meses=[]; for(let k=0;k<cm;k++){ const mi=startIdx+k; meses.push(`${baseY+Math.floor(mi/12)}-${String(mi%12+1).padStart(2,'0')}`); }
  return { start, end, meses, cm, n:idx+1 };
}
function amsLabelCiclo(cyc){ if(!cyc.meses.length) return '';
  const a=cyc.meses[0], b=cyc.meses[cyc.meses.length-1];
  return cyc.meses.length===1?labelMesAbbr(a):`${labelMesAbbr(a)}–${labelMesAbbr(b)}`; }
// Consumo do ciclo (worklogs do intervalo carregados em estado.ams), por mês.
function amsConsumoCiclo(c, cyc){
  const set=new Set(c.projetos||[]); const wl=(estado.ams&&estado.ams.dados)||[];
  // seg = todas as horas do ciclo; segFat = só as faturáveis (estas consomem o pacote/excedente).
  let seg=0, segFat=0; const porMes={}; cyc.meses.forEach(m=>{ porMes[m]=0; });
  wl.forEach(w=>{ if(!set.has(w.p)) return; const dia=(w.d||'').slice(0,10);
    if(!dia||dia<cyc.start||dia>cyc.end) return;
    const s=Number(w.s)||0; seg+=s; if(w.f) segFat+=s; const ym=dia.slice(0,7); if(ym in porMes) porMes[ym]+=s; });
  return { seg, segFat, porMes };
}
// Data de referência do ciclo em exibição (vazio = hoje/ciclo vigente).
function amsRefSel(){ return (estado.ams&&estado.ams.ref) || hojeSP(); }
// Desloca a data de referência por `deltaCiclos` ciclos de `cm` meses (mid-month, sem virada).
function amsShiftRef(ref, deltaCiclos, cm){
  const y=+ref.slice(0,4), m=+ref.slice(5,7)-1; const nm=m+deltaCiclos*cm;
  const ny=y+Math.floor(nm/12), mm=((nm%12)+12)%12;
  return `${ny}-${String(mm+1).padStart(2,'0')}-15`;
}
// 🧩 TICKET PRINCIPAL (pedido de 2026-10-06: "a apuração seja feita por ticket pai — consolidar os apontamentos por
// ticket pai e não abrir por qualquer tipo de task e sub-task; um ticket pai pode ter várias sub-tarefas"): cada
// sub-tarefa é somada no ticket principal (`w.pk`, resolvido pelo servidor). A chave do grupo é o pai; o TIPO e o
// FATURÁVEL são os do pai (`estado.ams.chamados`, que traz o pai mesmo sem apontamento próprio). amsIndice é o ÚNICO
// agrupador do ciclo — lista de chamados, horas por tipo, drill do mês, relatórios e o PDF leem dele.
function amsChamadoInfo(k){ return (estado.ams&&estado.ams.chamados&&estado.ams.chamados[k])||null; }
function amsPrincipal(w){ return w.pk||w.k||'(sem chave)'; }
// Grupos do ciclo (ou de UM mês do ciclo, com `ym`): { k, tipo, f, seg, segFat, segNao, pessoas, subs:{k->{seg}}, nSub, ent:[…] }.
function amsIndice(c, cyc, ym){
  const set=new Set(c.projetos||[]); const wl=(estado.ams&&estado.ams.dados)||[]; const porK={};
  wl.forEach(w=>{ if(!set.has(w.p)) return; const dia=(w.d||'').slice(0,10); if(!dia) return;
    if(ym){ if(dia.slice(0,7)!==ym) return; } else if(dia<cyc.start||dia>cyc.end) return;
    const s=Number(w.s)||0; if(!s) return;
    const k=amsPrincipal(w); const I=amsChamadoInfo(k);
    const g=porK[k]||(porK[k]={ k, tipo:(I&&I.t)||w.t||'—', f:I?!!I.f:!!w.f, seg:0, segFat:0, segNao:0, pessoas:new Set(), subs:{}, ent:[] });
    g.seg+=s; if(w.f) g.segFat+=s; else g.segNao+=s; if(w.a) g.pessoas.add(w.a);
    if(w.pk&&w.k){ const sb=g.subs[w.k]||(g.subs[w.k]={ k:w.k, tipo:w.t||'—', seg:0 }); sb.seg+=s; }
    g.ent.push({ d:dia, a:w.a, s, k:w.k||'', f:!!w.f, sub:!!w.pk }); });
  const lista=Object.values(porK); lista.forEach(g=>{ g.nSub=Object.keys(g.subs).length; }); lista.sort((a,b)=>b.seg-a.seg);
  const segFat=lista.reduce((s,g)=>s+g.segFat,0), segNao=lista.reduce((s,g)=>s+g.segNao,0);
  return { lista, porK, segFat, segNao, seg:segFat+segNao };
}
// Rótulo "+N sub" de um grupo (as sub-tarefas somadas no ticket principal).
function amsSubChip(n){ return n?`<span class="ams-ch-sub" data-tip="${n} sub-tarefa(s) somada(s) neste ticket principal">+${n} sub</span>`:''; }
// Horas do ciclo agrupadas por TIPO do ticket principal (com drill-down por chamado) e split faturável.
// Cada tipo: { seg, f (faturável), chamados:{ chave -> {seg, nSub} } }.
function amsPorTipo(c, cyc){
  const X=amsIndice(c,cyc); const tipos={};
  X.lista.forEach(g=>{ const t=tipos[g.tipo]||(tipos[g.tipo]={seg:0,f:g.f,chamados:{}}); t.seg+=g.seg; t.chamados[g.k]={ seg:g.seg, nSub:g.nSub }; });
  return { tipos, segFat:X.segFat, segNao:X.segNao, seg:X.seg };
}
// Worklogs (linhas individuais) de um contrato no ciclo — memória de apontamentos por chamado.
function amsWorklogsCiclo(c, cyc){
  const set=new Set(c.projetos||[]); const wl=(estado.ams&&estado.ams.dados)||[];
  return wl.filter(w=>{ if(!set.has(w.p)) return false; const dia=(w.d||'').slice(0,10);
    return dia&&dia>=cyc.start&&dia<=cyc.end&&(Number(w.s)||0)>0; });
}
function amsNomePessoa(a){ const p=(estado.ams&&estado.ams.pessoas&&estado.ams.pessoas[a])||(estado.usuarios&&estado.usuarios[a]); return (p&&p.nome)||a; }
function amsResumoChamado(k){ return (estado.ams&&estado.ams.resumos&&estado.ams.resumos[k])||''; }
// Infos do chamado (campos do Jira): cc=Número do Chamado Cliente, cr=Causa Raiz,
// pr=Produto, pc=Processo. Vem do /api/tempo (mapa por chave do chamado).
function amsInfoChamado(k){ return (estado.ams&&estado.ams.infos&&estado.ams.infos[k])||null; }
function amsNumCliente(k){ const i=amsInfoChamado(k); return (i&&i.cc)||''; }
// Contrato AMS em exibição — a aba mostra um cliente por vez (seleção em estado.ams.sel).
function amsContratoSel(amsList){
  const id=(estado.ams&&estado.ams.sel)||'';
  return amsList.find(c=>c.id===id) || amsList[0] || null;
}
// Chamados do ciclo — os tickets PRINCIPAIS (sub-tarefas somadas), do maior para o menor.
function amsChamadosCiclo(c, cyc){ return amsIndice(c,cyc).lista; }
// Só os tickets principais FATURÁVEIS, com `seg` = as horas faturáveis (pedido de 2026-10-06: "nesses indicadores
// apenas os tickets que são faturáveis") — a base dos 📊 Relatórios do ciclo (Causa raiz · Produto · Processo) e do
// drill deles. Um ticket faturável com uma "Subtarefa Não Faturável" entra só com as horas faturáveis.
function amsChamadosFat(c, cyc){ return amsIndice(c,cyc).lista.filter(o=>o.f&&o.segFat>0).map(o=>Object.assign({}, o, { seg:o.segFat })); }
// Faturamento do ciclo (chave = início do ciclo), guardado em c.faturados.
function amsCicloFaturado(c, cyc){ return !!(c && c.faturados && cyc && c.faturados[cyc.start]); }
// Card com os DADOS CADASTRADOS do contrato + controle de faturamento do ciclo.
function amsDadosCard(c, cyc){
  const ap=amsLabelApur(c.apuracao||'trimestral'); const pool=amsHorasCiclo(c); const vh=Number(c.valorHora)||0;
  const ca=amsCiclosAno(c.apuracao||'trimestral'); const parcela=pool*vh;
  const dl=(l,v)=>`<div class="ams-dl"><div class="dt">${l}</div><div class="dd">${v}</div></div>`;
  const faturado=amsCicloFaturado(c,cyc); const fr=(c.faturados&&c.faturados[cyc.start])||null;
  return `<div class="ams-dados">
    <div class="ams-dados-h"><strong>Contrato — ${esc(c.cliente||'(sem nome)')}</strong>
      <span class="badge">AMS · ${esc(ap.toLowerCase())}</span><span class="spacer"></span>
      <button class="btn" data-ams-edit="${escA(c.id)}">Editar no Admin</button></div>
    <div class="ams-dgrid">
      ${dl('Valor-hora', vh?fmtBRL(vh):'—')}
      ${dl('Horas por ciclo', pool?`${pool}h`:'—')}
      ${dl('Parcela do ciclo', vh&&pool?fmtBRL(parcela):'—')}
      ${dl('Valor anual', vh&&pool?`${fmtBRL(parcela*ca)} <span class="muted">· ${pool*ca}h</span>`:'—')}
      ${dl('Mínimo mensal', c.minMes?`${c.minMes}h`:'—')}
      ${dl('Teto mensal', c.tetoMes?`${c.tetoMes}h`:'—')}
      ${dl('Início da vigência', c.inicio?esc(fmtBR(c.inicio)):'—')}
      ${dl('Banco de horas', c.bancoHoras!==false?'Sim · dentro do ciclo':'Não')}
      ${dl('Responsável Dexterity', c.respDex?esc(c.respDex):'—')}
      ${dl('Responsável / Cliente', c.respCliente?esc(c.respCliente):'—')}
    </div>
    ${c.obs?`<div class="ams-dobs muted small"><strong>Obs.:</strong> ${esc(c.obs)}</div>`:''}
    <div class="ams-dprojs muted small">Projetos: ${projChipsFicha(c.projetos)}</div>
    <div class="ams-fatura">
      <span class="ams-fat-tag ${faturado?'ok':'pend'}">${faturado?'✓ Ciclo faturado':'● Pendente de faturamento'}${faturado&&fr&&fr.em?` <span class="muted" style="font-weight:400">em ${esc(fmtBR(fr.em))}${fr.por?` · ${esc(fr.por)}`:''}</span>`:''}</span>
      <span class="spacer"></span>
      <button class="btn ${faturado?'':'primario'}" data-ams-fatura="${escA(c.id)}">${faturado?'Desmarcar faturamento':'Marcar ciclo como faturado'}</button>
    </div>
    <div class="ams-note">O status de faturamento é por <strong>ciclo</strong> e ${cfgShared?'fica salvo para o time.':'fica salvo só neste navegador (configure o Supabase para compartilhar).'}</div>
  </div>`;
}
// Drill-down de um MÊS do ciclo: apontamentos por chamado no mês (cada chamado abre as
// linhas de worklog — data · pessoa · horas) com link para o Jira.
function amsDrillMes(cId, ym){
  const c=(cfg.contratos||[]).find(x=>x.id===cId); if(!c) return;
  const X=amsIndice(c, amsCicloVigente(c, amsRefSel()), ym); const chs=X.lista; const tot=X.seg;
  const corpo = chs.length ? chs.map(o=>{ const k=o.k;
    const temK=k && k!=='(sem chave)';
    const alvo=temK?`<a href="${jiraBase()}/browse/${encodeURIComponent(k)}" target="_blank" rel="noopener">${esc(k)} ↗</a>`:'<span class="muted">(sem chave)</span>';
    const ent=o.ent.slice().sort((a,b)=> a.d<b.d?-1:a.d>b.d?1:0 );
    // a linha de uma sub-tarefa diz qual é (o total do grupo é do ticket principal)
    const linhas=ent.map(x=>`<div class="ts-dch"><span class="ts-dch-k">${esc(fmtBR(x.d))}</span><span class="ts-dch-r">${esc(amsNomePessoa(x.a))}${x.sub?` <span class="ams-ch-sub" data-tip="${escA('sub-tarefa '+x.k+(amsResumoChamado(x.k)?' — '+amsResumoChamado(x.k):''))}">↳ ${esc(x.k)}</span>`:''}</span><span class="ts-dch-h">${fmtH(x.s)}</span></div>`).join('');
    const pct=tot?Math.round(o.seg/tot*100):0;
    return `<details class="ts-dproj">
      <summary><span class="ts-dp-k">${alvo}</span><span class="ts-dp-n">${(()=>{const cc=amsNumCliente(k);return cc?`<span class="ams-ch-cc" data-tip="Número do Chamado Cliente">🔖 ${esc(cc)}</span> `:'';})()}${esc(amsResumoChamado(k)||'')} ${amsSubChip(o.nSub)} <span class="ams-ch-b ${o.f?'fat':'nfat'}">${o.f?'faturável':'não faturável'}</span></span>
        <span class="ts-dp-h">${fmtH(o.seg)} · ${pct}%</span></summary>
      <div class="ts-dchs">${linhas}</div>
    </details>`;
  }).join('') : '<div class="estado">Sem apontamentos neste mês.</div>';
  abreModal(`<h2>${esc(c.cliente||'(sem nome)')} <span class="muted" style="font-weight:400;font-size:14px">· ${esc(labelMesAbbr(ym))} · ${fmtH(tot)} · ${chs.length} ticket(s) principal(is)</span></h2>
    <div class="muted small" style="margin:2px 0 10px">Apontamentos por <b>ticket principal</b> no mês (as sub-tarefas estão somadas no pai, +N sub) — clique num ticket para ver as linhas (data · pessoa · sub-tarefa · horas). ↗ abre no Jira.</div>
    <div class="ts-drill">${corpo}</div>`);
}
// Card "Chamados do ciclo": lista achatada dos chamados que fazem parte do ciclo selecionado.
function amsChamadosCard(c, cyc){
  // A lista mostra só tickets principais FATURÁVEIS (com as horas faturáveis das sub-tarefas somadas); os não
  // faturáveis ficam fora (mas continuam no indicador faturável×não faturável e em "Horas por tipo"/Relatórios).
  const X=amsIndice(c,cyc); const todos=X.lista; const chs=todos.filter(o=>o.f&&o.segFat>0); const tot=chs.reduce((s,o)=>s+o.segFat,0);
  const nao=todos.filter(o=>!o.f); const segNao=X.segNao; const nSub=chs.reduce((s,o)=>s+o.nSub,0);
  const linhas=chs.map(o=>{
    const temK=o.k && o.k!=='(sem chave)';
    const alvo=temK?`<a href="${jiraBase()}/browse/${encodeURIComponent(o.k)}" target="_blank" rel="noopener">${esc(o.k)} ↗</a>`:'<span class="muted">(sem chave)</span>';
    const pct=tot?Math.round(o.segFat/tot*100):0;
    const cc=amsNumCliente(o.k);
    return `<div class="ams-ch">
      <span class="ams-ch-k">${alvo}</span>
      ${cc?`<span class="ams-ch-cc" data-tip="Número do Chamado Cliente">🔖 ${esc(cc)}</span>`:''}
      <span class="ams-ch-r">${esc(amsResumoChamado(o.k)||'')}</span>
      ${amsSubChip(o.nSub)}
      <span class="ams-ch-t">${esc(o.tipo)}</span>
      <span class="ams-ch-b ${o.f?'fat':'nfat'}">${o.f?'faturável':'não faturável'}</span>
      <span class="ams-ch-p muted" data-tip="Pessoas que apontaram">${o.pessoas.size}</span>
      <span class="ams-ch-h">${fmtH(o.segFat)} · ${pct}%</span></div>`;
  }).join('');
  const notaNao = segNao>0 ? `<span class="muted" style="font-weight:400"> · não faturáveis ocultos: <strong>${fmtH(segNao)}</strong>${nao.length?` em ${nao.length} ticket(s)`:''}</span>` : '';
  return `<div class="ams-chcard">
    <div class="muted small" style="font-weight:600;margin:2px 0 6px">Chamados do ciclo <span class="muted" style="font-weight:400">(por <b>ticket principal</b>, sub-tarefas somadas no pai${nSub?` — ${nSub} sub-tarefa(s)`:''} · somente faturáveis · ${chs.length} ticket(s) · ${fmtH(tot)} — 🔖 = Nº do Chamado Cliente · clique na chave para abrir no Jira)</span>${notaNao}</div>
    <div class="ams-chlist">${linhas||'<div class="muted small">Sem chamados faturáveis neste ciclo.</div>'}</div>
  </div>`;
}
// ---- Relatórios do ciclo: Causa raiz · Produto · Processo (campos do Jira) ----
// Agrupa os chamados do ciclo por valor de cada campo: horas (faturável+não), nº de
// chamados e % (Pareto, com acumulado). Clicar num valor abre os chamados daquele grupo.
function amsAgrupaRel(chs, getVal){
  const m={};
  chs.forEach(o=>{ const info=amsInfoChamado(o.k)||{}; const v=((getVal(info)||'')+'').trim()||'(não informado)';
    const g=m[v]||(m[v]={seg:0,n:0,segFat:0}); g.seg+=o.seg; g.n+=1; if(o.f) g.segFat+=o.seg; });
  return Object.entries(m).sort((a,b)=>b[1].seg-a[1].seg);
}
function amsRelGetVal(dim){ return dim==='cr'?(i=>i.cr):dim==='pr'?(i=>i.pr):(i=>i.pc); }
function amsRelBloco(chs, dim, titulo, cor){
  const ent=amsAgrupaRel(chs, amsRelGetVal(dim));
  const tot=ent.reduce((s,[,g])=>s+g.seg,0);
  const max=Math.max(1,...ent.map(([,g])=>g.seg));
  let acc=0;
  const linhas=ent.map(([v,g])=>{
    const pct=tot?Math.round(g.seg/tot*100):0; acc+=g.seg; const cum=tot?Math.round(acc/tot*100):0;
    return `<div class="ams-relrow" data-ams-rel="${escA(dim)}" data-ams-relv="${escA(v)}" data-tip="Ver chamados — ${escA(v)}">
      <div class="nm">${esc(v)}</div>
      <div class="vl">${fmtH(g.seg)} · ${pct}% <span class="muted" style="font-weight:400">(${g.n})</span></div>
      <div class="tk"><i style="width:${Math.max(3,g.seg/max*100)}%;background:${cor}"></i></div>
      <div class="ams-rel-cum">acum. ${cum}%</div></div>`;
  }).join('');
  return `<div class="ams-rel"><h4>${titulo} <span class="muted">(${ent.length})</span></h4>
    ${linhas||'<div class="muted small">Sem dados.</div>'}</div>`;
}
function amsRelatoriosCard(c, cyc){
  const chs=amsChamadosFat(c, cyc);
  const semInfo=chs.every(o=>!amsInfoChamado(o.k));
  const aviso = semInfo ? `<div class="muted small" style="margin-top:6px">Sem <strong>Causa raiz/Produto/Processo</strong> preenchidos nos tickets faturáveis deste ciclo (ou os campos ainda não foram mapeados).</div>` : '';
  return `<div class="ams-chcard" style="margin-top:14px">
    <div class="muted small" style="font-weight:600;margin:2px 0 8px">📊 Relatórios do ciclo — Causa raiz · Produto · Processo
      <span class="muted" style="font-weight:400">(somente tickets <b>faturáveis</b>, pelos campos do ticket principal · horas faturáveis · % · (nº de tickets); ordenado por horas — Pareto com acumulado; clique num item para ver os tickets)</span></div>
    <div class="ams-rel-grid">
      ${amsRelBloco(chs,'cr','Causa raiz',cores.roxo)}
      ${amsRelBloco(chs,'pr','Produto',cores.cerceta)}
      ${amsRelBloco(chs,'pc','Processo',cores.musgo)}
    </div>${aviso}</div>`;
}
// Drill: chamados do ciclo com um valor específico de causa raiz/produto/processo.
function amsDrillRel(cId, dim, valor){
  const c=(cfg.contratos||[]).find(x=>x.id===cId); if(!c) return;
  const cyc=amsCicloVigente(c, amsRefSel()); const getVal=amsRelGetVal(dim);
  const chs=amsChamadosFat(c,cyc).filter(o=>{ const info=amsInfoChamado(o.k)||{}; return (((getVal(info)||'')+'').trim()||'(não informado)')===valor; });
  const tot=chs.reduce((s,o)=>s+o.seg,0);
  const linhas=chs.map(o=>{
    const temK=o.k && o.k!=='(sem chave)';
    const alvo=temK?`<a href="${jiraBase()}/browse/${encodeURIComponent(o.k)}" target="_blank" rel="noopener">${esc(o.k)} ↗</a>`:'<span class="muted">(sem chave)</span>';
    const cc=amsNumCliente(o.k); const pct=tot?Math.round(o.seg/tot*100):0;
    return `<div class="ams-ch"><span class="ams-ch-k">${alvo}</span>${cc?`<span class="ams-ch-cc" data-tip="Número do Chamado Cliente">🔖 ${esc(cc)}</span>`:''}<span class="ams-ch-r">${esc(amsResumoChamado(o.k)||'')}</span>${amsSubChip(o.nSub)}<span class="ams-ch-b ${o.f?'fat':'nfat'}">${o.f?'faturável':'não faturável'}</span><span class="ams-ch-h">${fmtH(o.seg)} · ${pct}%</span></div>`;
  }).join('');
  const dimLabel = dim==='cr'?'Causa raiz':dim==='pr'?'Produto':'Processo';
  abreModal(`<h2>${esc(dimLabel)}: ${esc(valor)} <span class="muted" style="font-weight:400;font-size:14px">· ${fmtH(tot)} · ${chs.length} ticket(s) principal(is)</span></h2>
    <div class="muted small" style="margin:2px 0 10px">Tickets principais <b>faturáveis</b> do ciclo de <strong>${esc(c.cliente||'')}</strong> com ${esc(dimLabel.toLowerCase())} = <strong>${esc(valor)}</strong> (o campo é o do ticket pai; as sub-tarefas estão somadas, só as horas faturáveis). 🔖 = Nº do Chamado Cliente · ↗ abre no Jira.</div>
    <div class="ams-chlist">${linhas||'<div class="estado">Sem chamados.</div>'}</div>`);
}
// ===========================================================================
// 🔐 ACESSOS DO CLIENTE (portal com e-mail e senha) — pedido do usuário, 2026-09-26
// O "🔗 link do cliente" continua existindo (quem tem o link entra), mas para uma ÁREA
// no site do cliente ele não serve: vaza, não se revoga por pessoa e não diz quem entrou.
// Aqui o gestor convida NOMINALMENTE. Não há serviço de e-mail no projeto, então o
// convite volta como LINK para o gestor mandar por onde quiser.
// As contas vivem no Supabase (jirainsight_portal_contas), não na config compartilhada:
// senha é dado sensível e a config inteira vai para o navegador de todo mundo.
// ===========================================================================
function pcliApi(acao, opcoes){
  const o=opcoes||{}; const id=idApontar()||{};
  const h={ 'Content-Type':'application/json', 'X-Jira-Email':id.email||'', 'X-Jira-Token':id.token||'' };
  return fetch(`/api/config?pcli=${encodeURIComponent(acao)}${o.qs||''}`,
    { method:o.corpo?'POST':'GET', headers:h, body:o.corpo?JSON.stringify(o.corpo):undefined })
    .then(r=>r.json()).catch(()=>({ ok:false, erro:'Falha de rede.' }));
}
// O bloco de acessos vive em duas telas: 📑 Contratos › ⚙️ Admin e, desde 2026-09-28, 🌐 Portal do cliente
// (16d, seção 👤 Acessos — o mesmo HTML e os mesmos handlers). Redesenha a que está aberta.
function pcliReRender(){ if(estado.vista==='admin') renderAdmin(); else if(estado.vista==='portal'&&typeof renderPortal==='function') renderPortal(); }
function pcliCarrega(cid){
  estado.admin.acessos[cid]='carregando';
  pcliApi('contas',{ qs:'&ct='+encodeURIComponent(cid) }).then(j=>{
    estado.admin.acessos[cid]=(j&&j.ok)?(j.contas||[]):{ erro:(j&&j.erro)||'Não consegui listar os acessos.' };
    pcliReRender();
  });
}
// Só GESTORES veem e mexem nas contas (o servidor exige gestor em contas|convidar|revogar|reativar|remover):
// para quem não é, o bloco abre só com a explicação — nem a lista é pedida, nem botão é oferecido.
function pcliBlocoHTML(c){
  const aberto=!!estado.admin.acessosAbertos[c.id]; const gestor=souAprovador();
  const dados=estado.admin.acessos[c.id];
  const n=Array.isArray(dados)?dados.length:null;
  const cab=`<button class="btn" data-pcli-abre="${escA(c.id)}" data-tip="Contas de e-mail e senha para o cliente acompanhar os chamados dele">
      ${aberto?'▾':'▸'} 👤 Acessos do cliente${n!=null?` (${n})`:''}</button>`;
  if(!aberto) return `<div class="ad-portal">${cab}<span class="muted small">área com login — cada pessoa tem a sua conta, revogável</span></div>`;
  if(!gestor) return `<div class="pcli-bloco"><div class="ad-portal">${cab}</div><div class="muted small pcli-ro" style="padding:6px 0">🔒 Só gestores veem e gerenciam as contas do cliente (convidar, revogar, reativar).</div></div>`;
  let corpo;
  if(dados==='carregando'||dados===undefined) corpo='<div class="muted small" style="padding:6px 0">Carregando…</div>';
  else if(!Array.isArray(dados)) corpo=`<div class="muted small" style="padding:6px 0;color:#B45309">${esc(dados.erro)}</div>`;
  else if(!dados.length) corpo='<div class="muted small" style="padding:6px 0">Ninguém tem acesso ainda. Convide pelo e-mail abaixo.</div>';
  else corpo=`<table class="pcli-tab"><thead><tr><th>Pessoa</th><th>Situação</th><th>Último acesso</th><th></th></tr></thead>
    <tbody>${dados.map(x=>`<tr>
      <td><strong>${esc(x.email)}</strong>${x.nome?`<div class="muted small">${esc(x.nome)}</div>`:''}</td>
      <td>${!x.ativo?'<span class="badge">🚫 revogado</span>'
        :x.pendente?'<span class="badge ms-b-atra" data-tip="Já foi convidada e ainda não criou a senha">✉ convite pendente</span>'
        :'<span class="badge com-horas">✓ ativo</span>'}</td>
      <td class="muted small">${x.ultimoAcesso?esc(alxDataBR(String(x.ultimoAcesso).slice(0,10))):'—'}</td>
      <td style="text-align:right">
        ${x.ativo?`<button class="btn" data-pcli-rev="${escA(c.id)}|${escA(x.id)}" data-tip="Corta o acesso agora — a sessão aberta para de valer na hora seguinte">revogar</button>`
          :`<button class="btn" data-pcli-rea="${escA(c.id)}|${escA(x.id)}">reativar</button>`}
        <button class="btn" data-pcli-conv="${escA(c.id)}|${escA(x.email)}" data-tip="Gera um novo link de convite (a pessoa define a senha de novo)">novo convite</button>
        <button class="btn" data-pcli-del="${escA(c.id)}|${escA(x.id)}" data-tip="Apaga a conta">✕</button>
      </td></tr>`).join('')}</tbody></table>`;
  return `<div class="pcli-bloco">
    <div class="ad-portal">${cab}</div>
    ${corpo}
    <div class="pcli-add">
      <input type="email" placeholder="email@cliente.com" data-pcli-email="${escA(c.id)}">
      <input type="text" placeholder="Nome (opcional)" data-pcli-nome="${escA(c.id)}">
      <button class="btn primario" data-pcli-add="${escA(c.id)}">✉ Convidar</button>
    </div>
    <div class="muted small">O convite vale ${7} dias e serve uma vez só. Como o painel não envia e-mail, o link aparece aqui para você mandar.</div>
  </div>`;
}
// Mostra o link do convite recém-criado para o gestor copiar.
function pcliMostraConvite(cru, email){
  const url=`${portalBase()}/portal.html?convite=${encodeURIComponent(cru)}`;
  abreModal(`<h2>✉ Convite criado</h2>
    <div class="muted small">Mande este link para <strong>${esc(email)}</strong>. Ele vale <strong>7 dias</strong>, serve <strong>uma vez</strong>
      e é onde a pessoa escolhe a própria senha.</div>
    <div class="alx-campo" style="margin-top:10px"><input type="text" readonly id="pcli-url" value="${escA(url)}" style="width:100%"></div>
    <div class="alx-modal-acoes">
      <button class="btn primario" id="pcli-copia">Copiar link</button>
      <button class="btn" id="gx-fechar">Fechar</button></div>`);
  const i=document.getElementById('pcli-url'); if(i){ i.focus(); i.select(); }
  const b=document.getElementById('pcli-copia');
  if(b) b.addEventListener('click',()=>{ try{ navigator.clipboard.writeText(url); toast('Link do convite copiado.','ok'); }catch(e){ toast('Selecione e copie o link.','warn'); } });
}
// ---- 🔖 Código visível de cada contrato (2026-10-03, a pedido do usuário: "coloque um id para cada contrato") ----
// CT-001… nos 🏢 Clientes (cfg.contratos) e PC-001… nos 🤝 Parceiros (cfg.parcerias, 16b). O id interno continua sendo
// o que liga tudo (planos, portal, Odoo); o código é para GENTE: falar, procurar e citar. Nasce no cadastro e nunca
// muda; o contador (cfg.ctSeq / cfg.pcSeq) só sobe, então o código de um contrato removido não volta para outro.
// Os contratos antigos ganham código numa migração determinística (pela data de criação e pela ordem da lista): duas
// sessões que migram ao mesmo tempo chegam aos MESMOS códigos — a mescla da config não vê conflito.
function ctNumCod(c){ const m=/-(\d+)$/.exec(String((c&&c.cod)||'')); return m?+m[1]:0; }
// Código repetido (duas sessões cadastrando no mesmo instante: a mescla da config guarda os dois contratos) fica com o
// primeiro da lista; o outro ganha o próximo número livre — de novo igual em todas as sessões.
function ctCodigosPlano(lista, pre, seq){
  const out={}; let n=Math.max(Number(seq)||0, 0, ...(lista||[]).map(ctNumCod)); const vistos=new Set();
  const precisa=(c)=>{ if(!c) return false; if(c.cod&&!vistos.has(c.cod)){ vistos.add(c.cod); return false; } return true; };
  (lista||[]).map((c,i)=>({c,i,k:String((c&&(c.criadoEm||((c.hist||[])[0]||{}).em))||'')})).filter(x=>precisa(x.c))
    .sort((a,b)=>a.k.localeCompare(b.k)||a.i-b.i).forEach(({c})=>{ n+=1; out[c.id]=`${pre}-${String(n).padStart(3,'0')}`; });
  return { mapa:out, ultimo:n };
}
/** Código do contrato para mostrar (leitor: não grava; o provisório é o mesmo que a migração vai gravar). */
function ctCod(lista, c, pre, seqKey){ return ctCodigosPlano(lista,pre,cfg[seqKey]).mapa[c&&c.id]||(c&&c.cod)||''; }
/** Grava o código nos contratos que ainda não têm. Devolve true se mudou algo (quem chama faz salvaCfg). */
function ctGaranteCodigos(lista, pre, seqKey){
  const p=ctCodigosPlano(lista,pre,cfg[seqKey]); const ids=Object.keys(p.mapa); if(!ids.length) return false;
  (lista||[]).forEach(c=>{ if(p.mapa[c.id]) c.cod=p.mapa[c.id]; }); cfg[seqKey]=Math.max(Number(cfg[seqKey])||0, p.ultimo); return true;
}
/** Próximo código livre (depois de garantir os antigos). */
function ctProxCod(lista, pre, seqKey){ ctGaranteCodigos(lista,pre,seqKey);
  const n=Math.max(Number(cfg[seqKey])||0, 0, ...(lista||[]).map(ctNumCod))+1; cfg[seqKey]=n; return `${pre}-${String(n).padStart(3,'0')}`; }
const ctCodCli=(c)=>ctCod(cfg.contratos||[], c, 'CT', 'ctSeq');
// ⧉ Duplicar um contrato de cliente: o formulário abre como NOVO, já preenchido — só grava ao clicar em "Adicionar".
// O link do cliente (portalToken) e o código NÃO são copiados (um link por contrato; código novo no cadastro).
function ctCopia(c){ const x=JSON.parse(JSON.stringify(c||{})); delete x.id; delete x.cod; delete x.portalToken;
  x.cliente=(String(c.cliente||'').trim()+' (cópia)').slice(0,120); x._dupDe={ id:c.id, cod:ctCodCli(c), nome:c.cliente||'' }; return x; }

// ---- Formulário do contrato: o tipo, os projetos marcados e as horas alocadas vivem em estado.admin.form (e não no
// DOM): a busca pode esconder um projeto marcado, e trocar o tipo redesenha a lista — nada disso pode perder a escolha.
const ctNorm=(s)=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
function ctFormEstado(edit){
  const ad=estado.admin; const chave=ad.editId?('e:'+ad.editId):(ad.dup?('d:'+((ad.dup._dupDe&&ad.dup._dupDe.id)||'')):'novo');
  if(!ad.form||ad.form.chave!==chave){
    const marc={}; ((edit&&edit.projetos)||[]).forEach(k=>{ marc[k]=true; });
    const aloc={}; Object.keys((edit&&edit.alocacao)||{}).forEach(k=>{ const h=ctAlocDe(edit,k); if(h>0) aloc[k]=h; });
    ad.form={ chave, tipo:(edit&&edit.tipo)||'ams', marc, aloc, busca:'', todos:false };
  }
  return ad.form;
}
const CT_CAT_ROT={ DAMS:'Dexterity - AMS', PAMS:'Parceria - AMS', DEA:'Dexterity - Escopo Aberto', PEA:'Parceria - Escopo Aberto', DEF:'Dexterity - Escopo Fechado', PEF:'Parceria - Escopo Fechado' };
function ctProjRotulo(tipo){
  const cs=CT_CATS[tipo]||[];
  const sug=`<span data-tip="${escA(cs.map(x=>`${x} · ${CT_CAT_ROT[x]||x}`).join(' / '))}">${esc(cs.join(', '))}</span>`;
  return tipo==='horas'
    ? `Projetos do Jira e horas alocadas <span class="muted">(sugeridos: ${sug} · pode alocar depois)</span>`
    : `Projetos do Jira deste cliente <span class="muted">(sugeridos: ${sug} · marque um ou mais)</span>`;
}
function ctProjListaHTML(f){
  if(!_projetosCache) return '<div class="muted small">Carregando projetos do Jira…</div>';
  const cats=CT_CATS[f.tipo]||[]; const busca=ctNorm(f.busca).trim();
  const lista=(_projetosCache||[]).filter(p=>{ const marc=!!f.marc[p.key]; const sig=ctSiglaProj(p);
    if(!marc&&sig==='ARQ') return false;                         // arquivado só fica se já estava no contrato
    if(!marc&&!f.todos&&!cats.includes(sig)) return false;       // fora das categorias do tipo: a um clique ("mostrar todos")
    if(busca&&!ctNorm(`${p.key} ${p.nome||''} ${p.categoria||''}`).includes(busca)) return false;
    return true; }).sort((a,b)=>((f.marc[b.key]?1:0)-(f.marc[a.key]?1:0))||a.key.localeCompare(b.key));
  if(!lista.length) return `<div class="muted small" id="ad-projs">${busca?`Nenhum projeto com “${esc(f.busca)}”.`
    :`Nenhum projeto das categorias <b>${esc(cats.join(', '))}</b> no Jira — marque <b>mostrar todos os projetos</b>.`}</div>`;
  const tag=(p)=>{ const sig=ctSiglaProj(p); return sig&&!cats.includes(sig)?` <span class="muted small" data-tip="${escA(p.categoria||'sem categoria')}">(${esc(sig)})</span>`:(!sig?' <span class="muted small">(sem categoria)</span>':''); };
  if(f.tipo!=='horas') return `<div class="rg-pessoas" id="ad-projs">${lista.map(p=>
    `<label class="check"><input type="checkbox" data-ad-proj="${escA(p.key)}" ${f.marc[p.key]?'checked':''}> ${esc(p.nome||p.key)} (${esc(p.key)})${tag(p)}</label>`).join('')}</div>`;
  return `<div class="ad-aloc-lista" id="ad-projs">${lista.map(p=>{ const on=!!f.marc[p.key];
    return `<div class="ad-aloc-l${on?' on':''}"><label class="check"><input type="checkbox" data-ad-proj="${escA(p.key)}" ${on?'checked':''}> ${esc(p.nome||p.key)} (${esc(p.key)})${tag(p)}</label>
      <span class="ad-aloc-h"><input type="number" min="0" step="1" data-ad-aloc="${escA(p.key)}" value="${on&&f.aloc[p.key]?escA(String(f.aloc[p.key])):''}" placeholder="${on?'a alocar':'—'}" ${on?'':'disabled'} aria-label="Horas alocadas em ${escA(p.key)}"> h</span></div>`; }).join('')}</div>`;
}
// Total alocado no formulário × horas contratadas — a mesma conta valida o salvar.
function ctAlocForm(){
  const f=estado.admin.form||{marc:{},aloc:{}};
  const marcados=Object.keys(f.marc).filter(k=>f.marc[k]);
  const alocado=marcados.reduce((s,k)=>s+(Number(f.aloc[k])||0),0);
  const contr=Math.max(0,Number((document.getElementById('ad-horas')||{}).value)||0);
  return { marcados, alocado, contr, semHoras:marcados.filter(k=>!(Number(f.aloc[k])>0)) };
}
function ctAlocResumo(){
  const r=document.getElementById('ad-aloc-resumo'); if(!r) return;
  const f=estado.admin.form; if(!f||f.tipo!=='horas'){ r.innerHTML=''; r.className='muted small'; return; }
  const a=ctAlocForm(); const vh=Number((document.getElementById('ad-valor')||{}).value)||0;
  const sobra=a.contr-a.alocado;
  r.className='ad-aloc-resumo'+(a.contr&&sobra<0?' err':'');
  r.innerHTML=!a.contr?'Informe as <b>horas contratadas</b> — depois é só distribuir entre os projetos (agora ou mais tarde).'
    :`Contratado <b>${fmtHd(a.contr)}</b>${vh?` (${fmtBRL(a.contr*vh)})`:''} · alocado <b>${fmtHd(a.alocado)}</b> em ${a.marcados.length-a.semHoras.length} projeto(s) · `
      +(sobra<0?`<b>⚠ ${fmtHd(-sobra)} além do contratado</b> — reduza a alocação ou aumente as horas contratadas`:`a alocar <b>${fmtHd(sobra)}</b>`)
      +(a.semHoras.length?` · <span class="muted">${a.semHoras.length} projeto(s) ainda sem horas</span>`:'');
}
// ---- Consumo do contrato de horas abertas DESDE O INÍCIO da vigência (até hoje ou o fim) — à parte do período do
// topo, que mede outra coisa. Uma leitura por intervalo (/api/tempo, teto de 12 meses como na 💹 Rentabilidade) em
// estado.ctReal; sem início cadastrado, cai para o período do topo e a tela diz isso.
function ctRealChave(c){ if(!c||!/^\d{4}-\d{2}-\d{2}$/.test(c.inicio||'')) return ''; const h=hojeSP();
  const ate=(c.fim&&c.fim<h)?c.fim:h; let de=c.inicio; if(ate<de) return ''; if(de<voltaDias(ate,365)) de=voltaDias(ate,365); return `${de}|${ate}`; }
function ctGaranteReal(c){
  const k=ctRealChave(c); const R=estado.ctReal||(estado.ctReal={dados:{},busy:{},erro:{}}); if(!k||R.dados[k]||R.busy[k]||R.erro[k]) return;
  const [de,ate]=k.split('|'); R.busy[k]=true;
  const volta=()=>{ if(estado.vista==='admin') renderAdmin(); else if(estado.vista==='receita') renderReceita(); };
  fetch(`/api/tempo?desde=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`).then(r=>r.json()).then(j=>{ R.busy[k]=false;
    if(j&&!j.erro) R.dados[k]=j; else R.erro[k]=(j&&j.erro)||'Falha ao ler as horas.'; volta();
  }).catch(e=>{ R.busy[k]=false; R.erro[k]=String(e.message||e); volta(); });
}
// {fonte:'inicio'|'periodo'|'carregando'|'erro', de, ate, cortado, seg, segFat, porProj:{K:seg}}
function ctConsumoHoras(c){
  const set=new Set(c.projetos||[]); const k=ctRealChave(c); const out={ fonte:'', de:'', ate:'', cortado:false, seg:0, segFat:0, porProj:{} };
  let wl=null;
  if(k){ const R=estado.ctReal||{dados:{},busy:{},erro:{}}; [out.de,out.ate]=k.split('|'); out.cortado=out.de>c.inicio;
    if(R.dados[k]){ wl=R.dados[k].worklogs||[]; out.fonte='inicio'; }
    else if(R.erro[k]){ out.fonte='erro'; out.erro=R.erro[k]; return out; }
    else { ctGaranteReal(c); out.fonte='carregando'; return out; } }
  else { wl=(estado.tempo&&estado.tempo.worklogs)||[]; out.fonte='periodo'; }
  wl.forEach(w=>{ if(!set.has(w.p)) return; const s=Number(w.s)||0; out.seg+=s; if(w.f) out.segFat+=s; out.porProj[w.p]=(out.porProj[w.p]||0)+s; });
  return out;
}
function ctFonteTxt(cs){ return cs.fonte==='inicio'?`desde ${fmtBR(cs.de)}${cs.cortado?' (últimos 12 meses)':''}`
  :cs.fonte==='periodo'?'no período do topo — cadastre o início da vigência para ver desde o começo'
  :cs.fonte==='carregando'?'lendo as horas desde o início…':`não deu para ler as horas (${cs.erro||'erro'})`; }
// Tabela projeto × alocado × consumido × saldo — a mesma no cartão do contrato e na 💰 Receita.
function ctAlocTabelaHTML(c, cs){
  const ks=c.projetos||[]; if(!ks.length) return '<div class="muted small">Nenhum projeto ainda — as horas estão todas <b>a alocar</b>.</div>';
  const pron=cs.fonte==='inicio'||cs.fonte==='periodo';
  const rows=ks.map(k=>{ const al=ctAlocDe(c,k); const h=(cs.porProj[k]||0)/3600; const pc=al?Math.round(h/al*100):null;
    const cor=pc==null?'var(--muted)':pc>100?'var(--err)':pc>=85?'var(--amarelo)':'var(--musgo)';
    return `<tr><td>${projChipsFicha([k])} <span class="muted small">${esc(projNome(k)!==k?projNome(k):'')}</span></td><td class="num">${al?fmtHd(al):'<span class="muted">a alocar</span>'}</td>
      <td class="num">${pron?fmtHd(h):'…'}</td><td class="num">${al&&pron?(h>al?`<b style="color:var(--err)">−${fmtHd(h-al)}</b>`:fmtHd(al-h)):'—'}</td>
      <td class="ad-aloc-bar">${al&&pron?`<span class="ad-aloc-track"><i style="width:${Math.min(100,pc)}%;background:${cor}"></i></span> <span class="muted small">${pc}%</span>`:''}</td></tr>`; }).join('');
  return `<div class="scroll-x"><table class="ad-aloc-tab"><thead><tr><th>Projeto</th><th class="num">Alocado</th><th class="num">Consumido</th><th class="num">Saldo</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function ctProjAtualiza(){
  const w=document.getElementById('ad-projs-wrap'); const f=estado.admin.form; if(!w||!f) return;
  w.innerHTML=ctProjListaHTML(f);
  const rot=document.getElementById('ad-projs-rot'); if(rot) rot.innerHTML=ctProjRotulo(f.tipo);
  ctAlocResumo();
}

function renderAdmin(){
  const cont=document.getElementById('conteudo');
  if(!_projetosCache){ garanteProjetos().then(()=>{ if(estado.vista==='admin') renderAdmin(); }).catch(()=>{}); }
  const ad=estado.admin; const contratos=cfg.contratos||[];
  // Contratos antigos ganham o código na primeira vez que alguém identificado abre a tela (uma gravação só).
  if(cfgShared&&idApontar()&&ctGaranteCodigos(contratos,'CT','ctSeq')) salvaCfg();
  const edit = ad.editId ? contratos.find(c=>c.id===ad.editId) : (ad.dup||null);
  const dup = !ad.editId&&ad.dup ? ad.dup : null;
  const f=ctFormEstado(edit);   // tipo, projetos marcados e horas alocadas do formulário (sobrevivem ao redesenho)
  const projBox=`<div class="ad-proj-barra">
      <input type="search" id="ad-proj-busca" value="${escA(f.busca)}" placeholder="🔎 filtrar projetos (nome ou chave)" aria-label="Filtrar projetos">
      <label class="check"><input type="checkbox" id="ad-proj-todos" ${f.todos?'checked':''}> mostrar todos os projetos</label>
    </div>
    <div id="ad-projs-wrap">${ctProjListaHTML(f)}</div>
    <div class="muted small" id="ad-aloc-resumo"></div>`;

  const form=`<div class="card full">
    <h2>${dup?`⧉ Novo contrato — cópia de ${esc(dup._dupDe&&dup._dupDe.cod||'')} ${esc(dup._dupDe&&dup._dupDe.nome||'')}`:(edit?`Editar contrato <span class="badge ct-cod" data-tip="ID do contrato">${esc(ctCodCli(edit))}</span>`:'Novo contrato / cliente')}</h2>
    ${dup?'<div class="aviso">⧉ Cópia pronta para ajustar: confira o nome, as datas e os projetos e clique em <b>Adicionar contrato</b>. O link do cliente não é copiado (cada contrato tem o seu) e o novo contrato ganha um ID próprio.</div>':''}
    <div class="pl-grid">
      <div class="campo"><label>Cliente</label><input type="text" id="ad-cliente" value="${escA(edit?edit.cliente:'')}" placeholder="Nome do cliente"></div>
      <div class="campo"><label>Tipo de contrato</label><select id="ad-tipo">
        ${TIPOS_CONTRATO.map(([v,l])=>`<option value="${v}" ${f.tipo===v?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="campo" id="ad-horas-wrap"><label id="ad-horas-rot">Horas contratadas</label><input type="number" id="ad-horas" min="0" step="1" value="${escA(edit&&edit.horasContratadas!=null?String(edit.horasContratadas):'')}" placeholder="ex.: 100"></div>
      <div class="campo"><label>Valor-hora (R$)</label><input type="number" id="ad-valor" min="0" step="0.01" value="${escA(edit&&edit.valorHora!=null?String(edit.valorHora):'')}" placeholder="ex.: 122"></div>
      <div class="campo"><label>Início da vigência</label><input type="date" id="ad-inicio" value="${escA(edit?edit.inicio||'':'')}"></div>
      <div class="campo" id="ad-fim-wrap"><label>Fim da vigência <span class="muted">(opcional)</span></label><input type="date" id="ad-fim" value="${escA(edit?edit.fim||'':'')}"></div>
      <div class="campo"><label>Responsável Dexterity</label><input type="text" id="ad-respdex" value="${escA(edit?edit.respDex||'':'')}" placeholder="nome do responsável (Dexterity)"></div>
      <div class="campo"><label>Responsável / Nome do Cliente</label><input type="text" id="ad-respcli" value="${escA(edit?edit.respCliente||'':'')}" placeholder="responsável pelo lado do cliente"></div>
    </div>
    <fieldset id="ad-ams" style="border:1px solid var(--linha);border-radius:10px;padding:12px 14px;margin:4px 0 8px">
      <legend class="muted small" style="padding:0 6px">Parâmetros do AMS (apuração e banco de horas)</legend>
      <div class="pl-grid">
        <div class="campo"><label>Apuração (ciclo)</label><select id="ad-apur">
          ${AMS_APUR.map(([v,l])=>`<option value="${v}" ${((edit&&edit.apuracao)||'trimestral')===v?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="campo"><label>Horas por ciclo</label><input type="number" id="ad-hciclo" min="0" step="1" value="${escA(edit&&edit.horasCiclo!=null?String(edit.horasCiclo):'')}" placeholder="ex.: 60"></div>
        <div class="campo"><label>Mínimo mensal (h)</label><input type="number" id="ad-min" min="0" step="1" value="${escA(edit&&edit.minMes!=null?String(edit.minMes):'')}" placeholder="ex.: 20"></div>
        <div class="campo"><label>Teto mensal (h)</label><input type="number" id="ad-teto" min="0" step="1" value="${escA(edit&&edit.tetoMes!=null?String(edit.tetoMes):'')}" placeholder="ex.: 60"></div>
      </div>
      <label class="check" style="margin-top:6px"><input type="checkbox" id="ad-banco" ${(!edit||edit.bancoHoras!==false)?'checked':''}> Banco de horas dentro do ciclo (saldo não consumido vale até o fim do ciclo; <strong>não acumula</strong> para o ciclo seguinte)</label>
      <div class="muted small" id="ad-ams-resumo" style="margin-top:8px"></div>
    </fieldset>
    <div class="campo"><label id="ad-projs-rot">${ctProjRotulo(f.tipo)}</label>${projBox}</div>
    <div class="campo"><label>Observações</label><input type="text" id="ad-obs" value="${escA(edit?edit.obs||'':'')}" placeholder="opcional"></div>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
      <button class="btn primario" id="ad-salvar">${edit&&!dup?'Salvar alterações':'Adicionar contrato'}</button>
      ${edit?`<button class="btn" id="ad-cancelar">${dup?'Cancelar cópia':'Cancelar edição'}</button>`:''}
    </div>
    <div class="ap-fb" id="ad-fb" hidden></div>
  </div>`;

  const cards=contratos.map(c=>{
    const ams=c.tipo==='ams', horas=c.tipo==='horas';
    const csH=horas?ctConsumoHoras(c):null;   // horas abertas: consumo desde o início do contrato
    const cons=horas?{seg:csH.seg, valor:(csH.seg/3600)*(Number(c.valorHora)||0)}:consumoContrato(c); const h=cons.seg/3600;
    const contr=ams?amsHorasCiclo(c):(Number(c.horasContratadas)||0); const pctv=contr?Math.round(h/contr*100):null;
    const over=pctv!=null&&pctv>100;
    const vh=Number(c.valorHora)||0;
    const semProj=!(c.projetos||[]).length;
    const dl=(l,v)=>`<div class="ams-dl"><div class="dt">${l}</div><div class="dd">${v}</div></div>`;
    let detalhes;
    if(horas){
      const al=ctAlocTotal(c); const aAlocar=contr-al;
      detalhes=`<div class="ams-dgrid">
        ${dl('Horas contratadas', contr?fmtHd(contr):'—')}
        ${dl('Valor-hora', vh?fmtBRL(vh):'—')}
        ${dl('Valor do contrato', vh&&contr?fmtBRL(contr*vh):'—')}
        ${dl('Alocado nos projetos', `${fmtHd(al)}${contr?` <span class="muted">(${Math.round(al/contr*100)}%)</span>`:''}`)}
        ${dl('A alocar', aAlocar<0?`<b style="color:var(--err)">−${fmtHd(-aAlocar)}</b>`:(aAlocar>0?`<b style="color:var(--amarelo)">${fmtHd(aAlocar)}</b>`:'0h'))}
        ${dl('Vigência', c.inicio?`${esc(fmtBR(c.inicio))}${c.fim?` → ${esc(fmtBR(c.fim))}`:''}`:'—')}
        ${dl('Responsável Dexterity', c.respDex?esc(c.respDex):'—')}
        ${dl('Responsável / Cliente', c.respCliente?esc(c.respCliente):'—')}
      </div>
      <div class="ad-aloc-bloco"><div class="ad-aloc-cab"><b>📌 Alocação por projeto</b> <span class="muted small">consumo ${esc(ctFonteTxt(csH))}</span>
        <span class="spacer"></span><button class="btn" data-ad-alocar="${escA(c.id)}">📌 ${aAlocar>0&&!(c.projetos||[]).length?'alocar horas':'ajustar alocação'}</button></div>
        ${ctAlocTabelaHTML(c, csH)}</div>`;
    } else if(ams){
      const pool=amsHorasCiclo(c); const ca=amsCiclosAno(c.apuracao||'trimestral'); const parcela=pool*vh;
      detalhes=`<div class="ams-dgrid">
        ${dl('Apuração (ciclo)', esc(amsLabelApur(c.apuracao||'trimestral')))}
        ${dl('Valor-hora', vh?fmtBRL(vh):'—')}
        ${dl('Horas por ciclo', pool?`${pool}h`:'—')}
        ${dl('Parcela do ciclo', vh&&pool?fmtBRL(parcela):'—')}
        ${dl('Valor anual', pool?(vh?`${fmtBRL(parcela*ca)} <span class="muted">· ${pool*ca}h</span>`:`${pool*ca}h/ano`):'—')}
        ${dl('Mínimo mensal', c.minMes?`${c.minMes}h`:'—')}
        ${dl('Teto mensal', c.tetoMes?`${c.tetoMes}h`:'—')}
        ${dl('Início da vigência', c.inicio?esc(fmtBR(c.inicio)):'—')}
        ${dl('Banco de horas', c.bancoHoras!==false?'Sim · dentro do ciclo':'Não')}
        ${dl('Responsável Dexterity', c.respDex?esc(c.respDex):'—')}
        ${dl('Responsável / Cliente', c.respCliente?esc(c.respCliente):'—')}
      </div>`;
    } else {
      detalhes=`<div class="ams-dgrid">
        ${dl('Valor-hora', vh?fmtBRL(vh):'—')}
        ${dl('Horas contratadas', contr?`${contr}h`:'—')}
        ${dl('Início da vigência', c.inicio?esc(fmtBR(c.inicio)):'—')}
        ${dl('Responsável Dexterity', c.respDex?esc(c.respDex):'—')}
        ${dl('Responsável / Cliente', c.respCliente?esc(c.respCliente):'—')}
      </div>`;
    }
    const projetos=horas?'':`<div class="ams-dprojs muted small">Projetos: ${semProj?'<strong style="color:#B45309">nenhum mapeado</strong>':projChipsFicha(c.projetos)}</div>`;
    const obs=c.obs?`<div class="ams-dobs muted small"><strong>Obs.:</strong> ${esc(c.obs)}</div>`:'';
    const url = c.portalToken ? `${portalBase()}/portal.html?c=${encodeURIComponent(c.portalToken)}` : '';
    const portalLine = url
      ? `<div class="ad-portal"><span class="muted small">🔗 Link do cliente:</span>
          <input type="text" readonly value="${escA(url)}" data-ad-portal-input>
          <button class="btn" data-ad-portal-copy="${escA(url)}">copiar</button>
          <button class="btn" data-ad-portal-novo="${escA(c.id)}" data-tip="Gera um novo link e invalida o anterior">novo</button></div>`
      : `<div class="ad-portal"><button class="btn" data-ad-portal="${escA(c.id)}">🔗 Gerar link do cliente</button>
          <span class="muted small">link único, sem senha — quem tiver o endereço entra</span></div>`;
    // AMS sem projetos não aparece na apuração da aba AMS — avisa e oferece o atalho de edição.
    const avisoSemProj = (ams && semProj)
      ? `<div class="ad-cons" style="color:#B45309">⚠ Sem projetos mapeados — este contrato <strong>não aparece</strong> na apuração da aba <strong>AMS</strong>. Clique em <strong>editar</strong> e marque os projetos da categoria AMS.</div>`
      : (horas && contr && ctAlocTotal(c)<contr)
      ? `<div class="ad-cons" style="color:#B45309">📌 <strong>${fmtHd(contr-ctAlocTotal(c))}</strong> ainda a alocar — use <strong>📌 ${semProj?'alocar horas':'ajustar alocação'}</strong> quando os projetos do Jira estiverem definidos.</div>`
      : (horas && contr && ctAlocTotal(c)>contr)
      ? `<div class="ad-cons" style="color:var(--err)">⚠ A alocação passa das horas contratadas em <strong>${fmtHd(ctAlocTotal(c)-contr)}</strong>.</div>`
      : '';
    return `<div class="ad-card${over?' over':''}">
      <div class="ad-top"><span class="badge ct-cod" data-tip="ID do contrato — use para citar e procurar">${esc(ctCodCli(c))}</span> <strong>${esc(c.cliente||'(sem nome)')}</strong> <span class="badge">${esc(rotuloTipo(c.tipo))}</span>
        <span class="spacer"></span>
        <button class="btn" data-ad-edit="${escA(c.id)}">editar</button>
        <button class="btn" data-ad-dup="${escA(c.id)}" data-tip="Abre um contrato novo já preenchido com os dados deste (o link do cliente não é copiado)">⧉ duplicar</button>
        <button class="btn" data-ad-del="${escA(c.id)}">remover</button></div>
      ${detalhes}
      ${pcliBlocoHTML(c)}
      ${projetos}
      ${obs}
      ${avisoSemProj}
      <div class="ad-cons">${horas?`Consumo ${esc(ctFonteTxt(csH))}`:'Consumo no período'}: <strong>${fmtH(cons.seg)}</strong>${contr?` de ${contr}h${ams?'/ciclo':''}${pctv!=null?` <span class="${over?'ad-over':''}">(${pctv}%)</span>`:''}`:''}${vh?` · estimado <strong>${fmtBRL(cons.valor)}</strong>`:''}${ams?' <span class="muted">· apuração completa na aba <strong>AMS</strong></span>':''}${horas?' <span class="muted">· projeto a projeto na aba <strong>💰 Bolsa de horas &amp; projetos</strong></span>':''}</div>
      ${portalLine}
    </div>`;
  }).join('');

  cont.replaceChildren(el(`<div class="vw-admin">
    <div class="card full"><h2>🏢 Contratos — clientes &amp; valores <span>a base do AMS, da bolsa de horas, da Rentabilidade e da Controladoria</span></h2>
      <div class="muted small">${cfgShared?'✓ Compartilhado com o time (salvo no servidor).':'⚠ Salvo só neste navegador — configure o Supabase para compartilhar.'}
        Cadastre clientes, tipo de contrato, <strong>horas contratadas</strong> e <strong>valor-hora</strong>, e mapeie os <strong>projetos do Jira</strong>. Isso destrava os módulos de <strong>AMS</strong> e <strong>Receita</strong>. O consumo abaixo usa o período selecionado no topo.</div>
    </div>
    ${cfgShared && !idApontar() ? `<div class="aviso">⚠ Para <strong>salvar</strong> as configurações no servidor é preciso identificar-se: informe seu e-mail e token do Jira na aba <strong data-goto="apontar" style="cursor:pointer;text-decoration:underline">⏱ Apontar</strong>. Sem isso, as alterações ficam só neste navegador.</div>` : ''}
    ${form}
    <div class="card full"><h2>Contratos cadastrados <span>${contratos.length}</span></h2>
      ${contratos.length?`<div class="ad-grid">${cards}</div>`:'<div class="estado">Nenhum contrato cadastrado ainda.</div>'}
    </div>
  </div>`));
  const tsel=document.getElementById('ad-tipo'); if(tsel) tsel.addEventListener('change', amsToggleForm);
  ['ad-apur','ad-hciclo','ad-valor'].forEach(id=>{ const e=document.getElementById(id); if(e) e.addEventListener('input', amsResumoForm); });
  if(document.getElementById('ad-apur')) document.getElementById('ad-apur').addEventListener('change', amsResumoForm);
  // Abre o seletor nativo ao clicar em qualquer parte do campo de data (não só no
  // ícone) — alguns navegadores não abrem o calendário ao clicar no texto.
  const din=document.getElementById('ad-inicio');
  if(din) din.addEventListener('click', ()=>{ try{ if(din.showPicker) din.showPicker(); }catch(e){} });
  amsToggleForm();
}
// Mostra/esconde os campos de AMS conforme o tipo e atualiza o resumo derivado (h/ano, parcela).
function amsToggleForm(){
  const t=document.getElementById('ad-tipo'); if(!t) return;
  const isAms=t.value==='ams', isHoras=t.value==='horas';
  const ams=document.getElementById('ad-ams'); if(ams) ams.style.display=isAms?'':'none';
  const hw=document.getElementById('ad-horas-wrap'); if(hw) hw.style.display=isAms?'none':'';
  const hr=document.getElementById('ad-horas-rot'); if(hr) hr.textContent=isHoras?'Horas contratadas (total)':'Horas contratadas';
  const fw=document.getElementById('ad-fim-wrap'); if(fw) fw.style.display=isHoras?'':'none';
  const f=estado.admin.form; if(f&&f.tipo!==t.value){ f.tipo=t.value; ctProjAtualiza(); } else ctAlocResumo();
  amsResumoForm();
}
function amsResumoForm(){
  const r=document.getElementById('ad-ams-resumo'); if(!r) return;
  const t=document.getElementById('ad-tipo'); if(!t||t.value!=='ams'){ r.textContent=''; return; }
  const ap=(document.getElementById('ad-apur')||{}).value||'trimestral';
  const hc=Number((document.getElementById('ad-hciclo')||{}).value)||0;
  const vh=Number((document.getElementById('ad-valor')||{}).value)||0;
  const ca=amsCiclosAno(ap); const anual=hc*ca; const parts=[];
  if(hc){ parts.push(`<strong>${hc}h</strong> por ciclo`); parts.push(`<strong>${anual}h/ano</strong> (${ca} ${ca>1?'ciclos':'ciclo'})`); }
  if(hc&&vh){ parts.push(`parcela <strong>${fmtBRL(hc*vh)}</strong> · ano <strong>${fmtBRL(anual*vh)}</strong>`); }
  r.innerHTML = parts.length ? ('≈ '+parts.join(' · ')) : 'Preencha “horas por ciclo” e “valor-hora” para ver o resumo (h/ano e parcela).';
}
function salvaContrato(){
  const v=(id)=>{ const e=document.getElementById(id); return e?e.value.trim():''; };
  const fb=document.getElementById('ad-fb'); if(fb){ fb.hidden=false; fb.className='ap-fb'; }
  const cliente=v('ad-cliente');
  if(!cliente){ if(fb){ fb.classList.add('err'); fb.textContent='Informe o nome do cliente.'; } return; }
  const f=estado.admin.form||{marc:{},aloc:{}};
  const projetos=Object.keys(f.marc).filter(k=>f.marc[k]);   // do estado: inclui os marcados que a busca escondeu
  const tipo=v('ad-tipo')||'ams';
  const dados={
    cliente, tipo,
    valorHora:Math.max(0,Number(v('ad-valor'))||0),
    inicio:v('ad-inicio'), respDex:v('ad-respdex'), respCliente:v('ad-respcli'),
    obs:v('ad-obs'), projetos,
  };
  if(tipo==='ams'){
    dados.apuracao=v('ad-apur')||'trimestral';
    dados.horasCiclo=Math.max(0,Number(v('ad-hciclo'))||0);
    dados.minMes=Math.max(0,Number(v('ad-min'))||0);
    dados.tetoMes=Math.max(0,Number(v('ad-teto'))||0);
    const bk=document.getElementById('ad-banco'); dados.bancoHoras=bk?bk.checked:true;
    dados.horasContratadas=dados.horasCiclo;   // compat com o preview genérico
  } else {
    dados.horasContratadas=Math.max(0,Number(v('ad-horas'))||0);
  }
  if(tipo==='horas'){   // ⏱ horas abertas: o total é obrigatório; a alocação pode ficar para depois, mas não passa do total
    const erro=(m)=>{ if(fb){ fb.classList.add('err'); fb.textContent=m; } };
    if(!dados.horasContratadas) return erro('Informe as horas contratadas (o total do contrato) — a alocação nos projetos pode ficar para depois.');
    const fim=v('ad-fim'); if(fim&&dados.inicio&&fim<dados.inicio) return erro('O fim da vigência é anterior ao início.');
    const a=ctAlocForm();
    if(a.alocado>dados.horasContratadas) return erro(`A alocação (${fmtHd(a.alocado)}) passa das horas contratadas (${fmtHd(dados.horasContratadas)}) em ${fmtHd(a.alocado-dados.horasContratadas)}. Reduza a alocação ou aumente o total.`);
    dados.fim=fim; dados.alocacao={};
    projetos.forEach(k=>{ const h=Math.max(0,Number(f.aloc[k])||0); if(h>0) dados.alocacao[k]=h; });
  }
  cfg.contratos=cfg.contratos||[];
  const ad=estado.admin;
  if(ad.editId){ const c=cfg.contratos.find(x=>x.id===ad.editId); if(c){ Object.assign(c, dados);
      if(tipo!=='horas'){ delete c.alocacao; delete c.fim; } }   // mudou de tipo: a alocação de horas abertas não fica pendurada
    ad.editId=null; }
  else { dados.id='c'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); dados.cod=ctProxCod(cfg.contratos,'CT','ctSeq'); dados.criadoEm=hojeSP();
    if(ad.dup&&ad.dup._dupDe) dados.copiaDe=ad.dup._dupDe.cod||ad.dup._dupDe.id;
    cfg.contratos.push(dados); try{ toast(`Contrato ${dados.cod} adicionado.`,'ok'); }catch(e){} }
  ad.dup=null; ad.form=null; salvaCfg(); renderAdmin();
}
// ===============================================================================

// ====================== RECEITA / AMS — CONSUMO POR CLIENTE ======================
// Consumo de um contrato no período: horas e valor (faturável à parte) somando os
// worklogs dos projetos mapeados.
function analisaContrato(c){
  const set=new Set(c.projetos||[]); let seg=0, segFat=0;
  ((estado.tempo&&estado.tempo.worklogs)||[]).forEach(w=>{
    if(!set.has(w.p)) return;
    const s=Number(w.s)||0; seg+=s; if(w.f) segFat+=s;
  });
  const vh=Number(c.valorHora)||0;
  return { seg, segFat, valor:(seg/3600)*vh, valorFat:(segFat/3600)*vh };
}
// ====================== AMS & GOVERNANÇA — APURAÇÃO POR CICLO (aba própria) ======================
// Aba dedicada: um contrato AMS por vez (seletor de cliente), sempre por ciclo.
function renderAMS(){
  const cont=document.getElementById('conteudo');
  if(!estado.tempo){ cont.replaceChildren(el(skeletonPainel())); return; }
  const contratos=(cfg.contratos||[]);
  const hoje=hojeSP();
  // ---- AMS: apuração por ciclo, UM contrato por vez (selecione o cliente) ----
  const amsList=contratos.filter(c=>c.tipo==='ams' && (c.projetos||[]).length);
  const cSel=amsContratoSel(amsList);
  if(cSel && (estado.ams.sel||'')!==cSel.id) estado.ams.sel=cSel.id;   // fixa a seleção efetiva
  const refSel=amsRefSel();
  const cycSel = cSel ? amsCicloVigente(cSel,refSel) : null;
  // Não há "futuro": o "próximo" só vai até o ciclo vigente (o que contém hoje).
  const noVigente = cSel ? (cycSel.start===amsCicloVigente(cSel,hoje).start) : true;
  const noPrimeiro = cycSel ? cycSel.n===1 : true;   // 1º ciclo do contrato: não há "anterior"
  let amsProntos=false, amsKey='';
  if(cSel){
    const ate = cycSel.end<hoje?cycSel.end:hoje;
    amsKey=`${cSel.id}|${cycSel.start}|${ate}`;   // a busca é só do ciclo do contrato selecionado
    const am=estado.ams;
    if(am.range!==amsKey && am.erroKey!==amsKey && !am.carregando){   // erroKey: ciclo que falhou — espera o "Atualizar agora" em vez de rebuscar em laço
      am.carregando=true; am.erro='';
      const forcar=!!am.forcar; am.forcar=false;      // "Atualizar agora" ignora o cache do servidor
      fetch(`/api/tempo?desde=${encodeURIComponent(cycSel.start)}&ate=${encodeURIComponent(ate)}${forcar?'&nocache=1':''}`).then(r=>r.json()).then(j=>{
        am.carregando=false;
        if(j.erro){ am.erro=j.erro; am.erroKey=amsKey; }
        else { am.dados=j.worklogs||[]; am.pessoas=j.pessoas||{}; am.projetos=j.projetos||{}; am.resumos=j.resumos||{}; am.infos=j.infos||{}; am.chamados=j.chamados||{}; am.range=amsKey; am.quando=new Date(); }
        if(estado.vista==='ams') renderAMS();
      }).catch(e=>{ am.carregando=false; am.erro=String(e.message||e); am.erroKey=amsKey; if(estado.vista==='ams') renderAMS(); });
    }
    amsProntos = !!estado.ams.dados && estado.ams.range===amsKey;
  }
  // Seletor de cliente (um contrato AMS por vez) + navegador de ciclos.
  const amsSelHtml = amsList.length>1 ? `<label class="ams-sel"><span class="muted small">Cliente</span>
      <select id="ams-sel">${amsList.map(c=>`<option value="${escA(c.id)}" ${cSel&&c.id===cSel.id?'selected':''}>${esc(c.cliente||'(sem nome)')}</option>`).join('')}</select></label>` : '';
  const amsNav = cSel ? `<div class="ams-nav">
      ${amsSelHtml}
      <button class="btn" data-ams-nav="prev" ${noPrimeiro?'disabled':''} aria-label="Ciclo anterior">◀ anterior</button>
      <span class="ams-nav-l">Ciclo <strong>${esc(amsLabelCiclo(cycSel))}</strong> · ${esc(fmtBR(cycSel.start))}–${esc(fmtBR(cycSel.end))}${noVigente?' <span class="ams-nav-cur">vigente</span>':''}</span>
      <button class="btn" data-ams-nav="next" ${noVigente?'disabled':''} aria-label="Próximo ciclo">próximo ▶</button>
      ${noVigente?'':'<button class="btn" data-ams-cur>ir ao ciclo vigente</button>'}
      <span class="spacer"></span>
      ${amsProntos&&estado.ams.quando?`<span class="muted small" data-tip="Hora em que os apontamentos deste ciclo foram carregados. Apontou agora no Jira? Clique em Atualizar agora — o Clockwork pode levar alguns minutos para refletir.">🕓 dados de ${esc(estado.ams.quando.toTimeString().slice(0,5))}</span>`:''}
      <button class="btn" data-ams-atualiza data-tip="Busca agora os apontamentos mais recentes, ignorando o cache do servidor (~20 min)">↻ Atualizar agora</button>
    </div>` : '';
  const amsCard=(c)=>{
    const cyc=amsCicloVigente(c,refSel); const cons=amsConsumoCiclo(c,cyc);
    // Só horas faturáveis consomem o pacote/excedente; o total fica como contexto.
    const pool=amsHorasCiclo(c); const h=cons.segFat/3600; const vh=Number(c.valorHora)||0;
    const pctv=pool?Math.round(h/pool*100):0;
    const excedente=Math.max(0,h-pool), banco=Math.max(0,pool-h);
    const parcela=pool*vh, valExced=excedente*vh;
    const risco=pool?(h>=pool?'estourado':(pctv>=85?'risco':'ok')):'ok';
    const cor=risco==='estourado'?'#D20A0A':(risco==='risco'?'#C77700':'#17A398');
    const w=pool?Math.min(100,h/pool*100):0;
    const tag=risco==='estourado'?'<span class="rc2-tag est">esgotado</span>':(risco==='risco'?'<span class="rc2-tag ris">em risco</span>':'');
    const minMes=Number(c.minMes)||0, tetoMes=Number(c.tetoMes)||0;
    // Faturável × não faturável (por tipo de issue — pela descrição do tipo no Jira).
    const pt=amsPorTipo(c,cyc); const fatPct=pt.seg?Math.round(pt.segFat/pt.seg*100):0;
    // Burn-up: consumo acumulado por dia no ciclo (com linha do pacote contratado).
    const ateDia=cyc.end<hoje?cyc.end:hoje;
    const setP=new Set(c.projetos||[]); const wlAms=(estado.ams&&estado.ams.dados)||[]; const porDiaC={};
    wlAms.forEach(w=>{ if(!setP.has(w.p)||!w.f) return; const dd=(w.d||'').slice(0,10); if(dd>=cyc.start&&dd<=ateDia) porDiaC[dd]=(porDiaC[dd]||0)+(Number(w.s)||0); });
    let acc=0; const burn=listaDias(cyc.start,ateDia).map(dd=>{ acc+=(porDiaC[dd]||0); return {x:dd,v:acc}; });
    const burnChart = burn.length>1 ? tsChart([{nome:'Consumo faturável acumulado',cor,vals:burn,tipo:'area'}],
      {fmt:fmtH,yfmt:(v)=>Math.round(v/3600)+'h',readX:(x)=>fmtBR(x),metaY:{v:pool*3600},altura:'180px'}) : '';
    const mesesHtml=cyc.meses.map(ym=>{
      const seg=cons.porMes[ym]||0, mh=seg/3600, lo=minMes&&mh<minMes, hi=tetoMes&&mh>tetoMes;
      const clic = seg>0 ? ' clic' : '';
      const dca = seg>0 ? ` data-ams-mes="${escA(c.id)}|${ym}" title="Ver apontamentos por chamado em ${esc(labelMesAbbr(ym))}"` : '';
      return `<div class="ams-mc ${hi?'hi':(lo?'lo':'')}${clic}"${dca}><div class="mm">${esc(labelMesAbbr(ym))}</div><div class="mh">${fmtH(seg)}</div>
        ${hi?`<div class="mm" style="color:#B91C1C">&gt; teto ${tetoMes}h</div>`:(lo?`<div class="mm" style="color:#B45309">&lt; mín ${minMes}h</div>`:'')}</div>`;
    }).join('');
    // Drill-down: tipo de issue → chamados → link para o Jira.
    const tiposOrd=Object.entries(pt.tipos).sort((a,b)=>b[1].seg-a[1].seg);
    const tiposHtml=tiposOrd.map(([nome,t])=>{
      const chs=Object.entries(t.chamados).sort((a,b)=>b[1].seg-a[1].seg);
      const linhas=chs.map(([k,ch])=>{
        const temK=k && k!=='(sem chave)';
        const alvo=temK?`<a href="${jiraBase()}/browse/${encodeURIComponent(k)}" target="_blank" rel="noopener">${esc(k)} ↗</a>`:'<span class="muted">(sem chave)</span>';
        const cc=amsNumCliente(k);
        return `<div class="ams-ch"><span class="ams-ch-k">${alvo}</span>${cc?`<span class="ams-ch-cc" data-tip="Número do Chamado Cliente">🔖 ${esc(cc)}</span>`:''}<span class="ams-ch-r">${esc(amsResumoChamado(k))}</span>${amsSubChip(ch.nSub)}<span class="ams-ch-h">${fmtH(ch.seg)}</span></div>`;
      }).join('');
      const pctT=pt.seg?Math.round(t.seg/pt.seg*100):0;
      return `<details class="ams-tipo${t.f?'':' nf'}">
        <summary><span class="ams-tp-ic ${t.f?'fat':'nfat'}">${t.f?'●':'○'}</span><span class="ams-tp-n">${esc(nome)}</span>
          <span class="ams-tp-b ${t.f?'fat':'nfat'}">${t.f?'faturável':'não faturável'}</span>
          <span class="ams-tp-h">${fmtH(t.seg)} · ${pctT}%</span></summary>
        <div class="ams-chamados">${linhas||'<div class="muted small">Sem chamados.</div>'}</div>
      </details>`;
    }).join('');
    return `<div class="ams-card ${risco}">
      <div class="ams-head"><strong>${esc(c.cliente||'(sem nome)')}</strong>
        <span class="badge">AMS · ${esc(amsLabelApur(c.apuracao||'trimestral').toLowerCase())}</span>${tag}
        <span class="ciclo">Ciclo ${esc(amsLabelCiclo(cyc))} · ${esc(fmtBR(cyc.start))}–${esc(fmtBR(cyc.end))}</span>
        <button class="btn ams-pdf" data-ams-pdf="${escA(c.id)}" title="Exportar a apuração deste contrato em PDF">PDF da apuração</button></div>
      <div class="ams-bar"><div class="ams-track"><div class="ams-fill" style="width:${w.toFixed(1)}%;background:${cor}"></div></div>
        <div class="ams-bar-l"><span><strong>${fmtH(cons.segFat)}</strong> faturáveis de ${pool}h no ciclo (${pctv}%)</span>
          <span class="muted">${cons.seg!==cons.segFat?`${fmtH(cons.seg)} no total · `:''}${excedente>0?`excedente ${fmtH(Math.round(excedente*3600))}`:`banco ${fmtH(Math.round(banco*3600))} disponível`}</span></div></div>
      <div class="ams-kpis">
        <div class="ams-k"><div class="v">${fmtH(Math.round(banco*3600))}</div><div class="l">Banco de horas</div></div>
        <div class="ams-k"><div class="v ${excedente>0?'over':''}">${excedente>0?fmtH(Math.round(excedente*3600)):'0h'}</div><div class="l">Excedente (autorizar)</div></div>
        <div class="ams-k"><div class="v">${vh?fmtBRL(parcela):'—'}</div><div class="l">Parcela do ciclo (${pool}h)</div></div>
        <div class="ams-k"><div class="v">${vh?fmtBRL(parcela+valExced):'—'}</div><div class="l">Faturamento do ciclo</div></div>
      </div>
      <div class="ams-fat">
        <div class="ams-fat-bar"><i class="fat" style="width:${fatPct}%"></i><i class="nfat" style="width:${100-fatPct}%"></i></div>
        <div class="ams-fat-l"><span><b style="color:#188918">${fmtH(pt.segFat)}</b> faturáveis</span>
          <span><b style="color:#C77700">${fmtH(pt.segNao)}</b> não faturáveis</span>
          <span class="muted">${fatPct}% faturável no ciclo</span></div></div>
      ${burnChart?`<div class="muted small" style="font-weight:600;margin:6px 0 2px">Evolução do consumo faturável no ciclo <span class="muted" style="font-weight:400">(linha tracejada = pacote de ${pool}h; só horas faturáveis consomem o pacote)</span></div>${burnChart}`:''}
      <div class="muted small" style="font-weight:600;margin:10px 0 2px">Por mês no ciclo <span class="muted" style="font-weight:400">(clique num mês para ver os apontamentos por chamado${minMes||tetoMes?` · mín ${minMes||'–'}h · teto ${tetoMes||'–'}h/mês`:''})</span></div>
      <div class="ams-months">${mesesHtml}</div>
      <div class="muted small" style="font-weight:600;margin:12px 0 4px">Horas por tipo do ticket principal <span class="muted" style="font-weight:400">(sub-tarefas somadas no pai, pelo tipo do pai · clique no tipo para ver os tickets → Jira)</span></div>
      <div class="ams-tipos">${tiposHtml||'<div class="muted small">Sem apontamentos neste ciclo.</div>'}</div>
      ${excedente>0?`<div class="ams-note">⚠ Acima das ${pool}h do ciclo — o excedente (${fmtH(Math.round(excedente*3600))} · ${fmtBRL(valExced)}) só com <strong>autorização prévia</strong> e é faturado junto com o ciclo.</div>`:''}
      ${c.bancoHoras!==false?`<div class="ams-note">Banco de horas: o saldo vale até o fim do ciclo e <strong>não acumula</strong> para o próximo.</div>`:''}
      <div class="rc2-meta muted small">Projetos: ${projChipsFicha(c.projetos)}</div>
    </div>`;
  };
  let amsSection='';
  if(!amsList.length){
    amsSection=`<div class="card full"><h2>🛡 AMS — apuração por ciclo</h2>
      <div class="estado">Nenhum contrato <strong>AMS</strong> com projetos mapeados. Cadastre o contrato e mapeie os projetos na aba <strong>⚙️ Admin</strong>.</div></div>`;
  } else if(!amsProntos){
    amsSection=`<div class="card full"><h2>🛡 AMS <span>apuração por ciclo · ${esc((cSel&&cSel.cliente)||'')}</span></h2>
      ${amsNav}
      ${estado.ams.erro?`<div class="aviso">Não foi possível carregar a apuração do ciclo: ${esc(estado.ams.erro)}</div>`:'<div class="estado">Carregando apuração do ciclo (banco de horas)…</div>'}</div>`;
  } else {
    amsSection=`<div class="card full"><h2>🛡 AMS <span>apuração por ciclo · ${esc(cSel.cliente||'')}</span></h2>
        ${amsNav}
        <div class="muted small" style="margin:8px 0 12px">Apuração do <strong>ciclo selecionado</strong> deste contrato (independente do período do topo), <strong>consolidada por ticket principal</strong>: as sub-tarefas são somadas no ticket pai (+N sub), e o tipo que vale é o do pai. Faturável vs não faturável vem da <strong>descrição do tipo</strong> no Jira (sub-tarefa de ticket não faturável também não é); <strong>só as horas faturáveis consomem o pacote/excedente</strong>, e o PDF da apuração deixa os tipos não faturáveis de fora. O banco de horas vale dentro do ciclo; o excedente requer autorização e é faturado junto.</div>
        ${amsDadosCard(cSel, cycSel)}
        ${amsCard(cSel)}
        ${amsChamadosCard(cSel, cycSel)}
        ${amsRelatoriosCard(cSel, cycSel)}
      </div>`;
  }
  cont.replaceChildren(el(`<div class="ams-tela">${amsSection}</div>`));
}

function renderReceita(){
  const cont=document.getElementById('conteudo');
  if(!estado.tempo){ cont.replaceChildren(el(skeletonPainel())); return; }
  const contratos=(cfg.contratos||[]);
  if(!contratos.length){
    cont.replaceChildren(el(`<div class="rc-tela"><div class="card full"><h2>💰 Bolsa de horas &amp; projetos <span>consumo × contratado, projeção e receita estimada</span></h2>
      <div class="estado">Nenhum contrato cadastrado ainda.<br><br>
      Cadastre clientes, valor-hora e os projetos do Jira em <strong>📑 Contratos › 🏢 Clientes</strong> para liberar esta visão.
      <span class="muted">(Os contratos <strong>AMS</strong> aparecem na aba <strong>🛡 AMS</strong>, ao lado.)</span><br><br>
      <button class="btn primario" data-ir-admin>Ir para 🏢 Clientes</button></div></div></div>`));
    return;
  }

  const meta=estado.tempo.meta||{};
  const dias=listaDias(meta.startDate, meta.endDate);
  const hoje=hojeSP();
  const diasUteis=dias.filter(d=>ehUtil(d)&&!ehFeriado(d));
  const decorridos=diasUteis.filter(d=>d<hoje).length;   // dias úteis já fechados no período
  const totalUteis=diasUteis.length;

  // ---- Bolsa de horas / projeto fechado: projeção pelo período da tela ----
  const outros=contratos.filter(c=>c.tipo!=='ams'&&c.tipo!=='horas');
  // ---- ⏱ Horas abertas: contratado × alocado × consumido DESDE O INÍCIO, projeto a projeto ----
  const abertos=contratos.filter(c=>c.tipo==='horas');
  const cardHoras=(c)=>{
    const cs=ctConsumoHoras(c); const contr=Number(c.horasContratadas)||0; const al=ctAlocTotal(c); const h=cs.seg/3600; const vh=Number(c.valorHora)||0;
    const pron=cs.fonte==='inicio'||cs.fonte==='periodo';
    const estPor=(c.projetos||[]).filter(k=>{ const a=ctAlocDe(c,k); return a&&(cs.porProj[k]||0)/3600>a; });
    const risco=!pron?'ok':(contr&&h>=contr?'estourado':(estPor.length||(contr&&h>=contr*0.85)?'risco':'ok'));
    const cor=risco==='estourado'?'#D20A0A':(risco==='risco'?'#C77700':'#188918');
    const w=contr&&pron?Math.min(100,h/contr*100):0; const wa=contr?Math.min(100,al/contr*100):0;
    const tag=risco==='estourado'?'<span class="rc2-tag est">contrato esgotado</span>':risco==='risco'?`<span class="rc2-tag ris">${estPor.length?`${estPor.length} projeto(s) acima do alocado`:'em risco'}</span>`:'';
    return `<div class="rc2-card ${risco}" data-ct-horas="${escA(c.id)}">
      <div class="rc2-top"><span class="badge ct-cod">${esc(ctCodCli(c))}</span> <strong>${esc(c.cliente||'(sem nome)')}</strong>
        <span class="badge">${esc(rotuloTipo(c.tipo))}</span><span class="spacer"></span>${tag}</div>
      ${contr?`<div class="rc2-bar"><div class="rc2-track">
          <div class="rc2-fill" style="width:${w.toFixed(1)}%;background:${cor}"></div>
          ${wa>0.5&&wa<99.5?`<div class="rc2-proj" style="left:${wa.toFixed(1)}%" data-tip="Até aqui está alocado nos projetos (${fmtHd(al)})"></div>`:''}
        </div>
        <div class="rc2-bar-l"><span><strong>${pron?fmtHd(h):'…'}</strong> consumidas de ${fmtHd(contr)}${pron&&contr?` (${Math.round(h/contr*100)}%)`:''}</span>
          <span class="muted">alocado ${fmtHd(al)}${contr>al?` · a alocar ${fmtHd(contr-al)}`:''}</span></div></div>`
        :'<div class="rc2-bar-l" style="margin:10px 0"><span class="muted">sem horas contratadas</span></div>'}
      <div class="muted small" style="margin:6px 0">Consumo ${esc(ctFonteTxt(cs))}</div>
      ${ctAlocTabelaHTML(c, cs)}
      <div class="rc2-fin">
        <div><div class="rc2-fv">${vh&&pron?fmtBRL(h*vh):'—'}</div><div class="rc2-fl">Receita estimada</div></div>
        <div><div class="rc2-fv">${vh&&contr?fmtBRL(contr*vh):'—'}</div><div class="rc2-fl">Valor do contrato</div></div>
        <div><div class="rc2-fv">${pron&&cs.seg?Math.round(cs.segFat/cs.seg*100)+'%':'—'}</div><div class="rc2-fl">Faturável</div></div>
      </div>
      <div class="rc2-meta"><button class="btn" data-ad-alocar-ir="${escA(c.id)}">📌 ${contr>al?'alocar horas':'ajustar alocação'} em 📑 Contratos</button></div>
    </div>`;
  };
  const horasSection=abertos.length?`<div class="card full"><h2>⏱ Horas abertas <span>${abertos.length} contrato(s) · contratado × alocado × consumido desde o início</span></h2>
      <div class="muted small" style="margin-bottom:12px">O total contratado é distribuído entre os projetos do Jira (📌 alocação); o consumo de cada projeto é contado <strong>desde o início da vigência</strong> (até 12 meses), não pelo período do topo. A marca escura na barra é o quanto já foi alocado.</div>
      <div class="rc2-grid">${abertos.map(cardHoras).join('')}</div></div>`:'';
  const linhas=outros.map(c=>{
    const an=analisaContrato(c);
    const contrSeg=(Number(c.horasContratadas)||0)*3600;
    const pace=decorridos>0 ? an.seg/decorridos : 0;             // ritmo por dia útil fechado
    const projSeg=decorridos>0 ? pace*totalUteis : an.seg;       // projeção linear até o fim do período
    const pctAtual=contrSeg?Math.round(an.seg/contrSeg*100):null;
    const pctProj=contrSeg?Math.round(projSeg/contrSeg*100):null;
    let prev='';
    if(contrSeg>0){
      if(an.seg>=contrSeg) prev='já esgotado';
      else if(pace>0 && projSeg>contrSeg){
        const iCross=Math.ceil(contrSeg/pace);                  // índice do dia útil que cruza o teto
        prev=diasUteis[iCross-1] ? fmtBR(diasUteis[iCross-1]) : 'após o período';
      }
    }
    const risco = contrSeg>0 ? (an.seg>=contrSeg ? 'estourado' : (pctProj!=null && pctProj>=85 ? 'risco' : 'ok')) : 'ok';
    return { c, an, contrSeg, pctAtual, pctProj, projSeg, prev, risco };
  }).sort((a,b)=> (b.pctProj||0)-(a.pctProj||0) || b.an.valor-a.an.valor);

  const totSeg=linhas.reduce((s,l)=>s+l.an.seg,0);
  const totFat=linhas.reduce((s,l)=>s+l.an.segFat,0);
  const totValor=linhas.reduce((s,l)=>s+l.an.valor,0);
  const totContr=outros.reduce((s,c)=>s+(Number(c.horasContratadas)||0),0);
  const emRisco=linhas.filter(l=>l.risco!=='ok').length;

  const card=(l)=>{
    const c=l.c, an=l.an, contr=Number(c.horasContratadas)||0;
    const fatPct=an.seg?Math.round(an.segFat/an.seg*100):0;
    const w=l.contrSeg?Math.min(100, an.seg/l.contrSeg*100):0;
    const wp=l.contrSeg?Math.min(100, l.projSeg/l.contrSeg*100):0;
    const cor=l.risco==='estourado'?'#D20A0A':(l.risco==='risco'?'#C77700':'#188918');
    const tag=l.risco==='estourado'?'<span class="rc2-tag est">esgotado</span>'
             :l.risco==='risco'?'<span class="rc2-tag ris">em risco</span>':'';
    return `<div class="rc2-card ${l.risco}">
      <div class="rc2-top"><strong>${esc(c.cliente||'(sem nome)')}</strong>
        <span class="badge">${esc(rotuloTipo(c.tipo))}</span><span class="spacer"></span>${tag}</div>
      ${contr?`<div class="rc2-bar"><div class="rc2-track">
          <div class="rc2-fill" style="width:${w.toFixed(1)}%;background:${cor}"></div>
          ${wp>w+0.5?`<div class="rc2-proj" style="left:${wp.toFixed(1)}%" data-tip="Projeção até o fim do período"></div>`:''}
        </div>
        <div class="rc2-bar-l"><span><strong>${fmtH(an.seg)}</strong> de ${contr}h${c.tipo==='ams'?'/mês':''}${l.pctAtual!=null?` (${l.pctAtual}%)`:''}</span>
          ${l.pctProj!=null?`<span class="muted">projeção ${l.pctProj}%${l.prev?` · esgota ~${esc(l.prev)}`:''}</span>`:''}</div></div>`
        :`<div class="rc2-bar-l" style="margin:10px 0"><span><strong>${fmtH(an.seg)}</strong> consumidas <span class="muted">(sem horas contratadas)</span></span></div>`}
      <div class="rc2-fin">
        <div><div class="rc2-fv">${c.valorHora?fmtBRL(an.valor):'—'}</div><div class="rc2-fl">Receita estimada</div></div>
        <div><div class="rc2-fv">${c.valorHora?fmtBRL(c.valorHora):'—'}</div><div class="rc2-fl">Valor-hora</div></div>
        <div><div class="rc2-fv">${fatPct}%</div><div class="rc2-fl">Faturável</div></div>
      </div>
      <div class="rc2-meta muted small">Projetos: ${projChipsFicha(c.projetos)}</div>
    </div>`;
  };

  const genericoSection = outros.length ? `
    <div class="kpis">
      <div class="kpi t"><div class="v">${fmtBRL(totValor)}</div><div class="l">Receita estimada</div></div>
      <div class="kpi t"><div class="v">${fmtH(totSeg)}</div><div class="l">Horas consumidas</div></div>
      <div class="kpi a"><div class="v">${totContr}h</div><div class="l">Horas contratadas</div></div>
      <div class="kpi t"><div class="v">${totSeg?Math.round(totFat/totSeg*100):0}%</div><div class="l">Horas faturáveis</div></div>
      <div class="kpi w"><div class="v">${emRisco}</div><div class="l">Contratos em risco</div></div>
    </div>
    <div class="card full"><h2>💰 Bolsa de horas & projetos <span>${outros.length} contrato(s)</span></h2>
      <div class="muted small" style="margin-bottom:12px">Consumo e receita estimada no <strong>período selecionado</strong>. A projeção estende o ritmo dos dias úteis já fechados (${decorridos}/${totalUteis}) até o fim do período; a marca escura na barra indica a projeção.</div>
      <div class="rc2-grid">${linhas.map(card).join('')}</div>
    </div>` : '';

  cont.replaceChildren(el(`<div class="rc-tela">
    ${genericoSection || (horasSection?'':`<div class="card full"><h2>💰 Bolsa de horas &amp; projetos <span>consumo × contratado, projeção e receita estimada</span></h2>
      <div class="estado">Nenhum contrato de <strong>bolsa de horas</strong>, <strong>projeto fechado</strong> ou <strong>horas abertas</strong> cadastrado.<br>
      Os contratos <strong>AMS</strong> têm aba própria (<strong>🛡 AMS</strong>, ao lado). Cadastre contratos em <strong>📑 Contratos › 🏢 Clientes</strong>.</div></div>`)}
    ${horasSection}
  </div>`));
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
// Receita / AMS: navegação de ciclo + PDF da apuração por contrato.
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const nav=e.target.closest&&e.target.closest('[data-ams-nav]');
  if(nav){ escondeTip(); const dir=nav.getAttribute('data-ams-nav');
    const ams=(cfg.contratos||[]).filter(c=>c.tipo==='ams'&&(c.projetos||[]).length);
    const rep=amsContratoSel(ams); const cm=amsCicloMeses((rep&&rep.apuracao)||'trimestral'); const ref=amsRefSel();
    if(dir==='prev'){ const nr=amsShiftRef(ref,-1,cm);
      // Não recua antes do 1º ciclo do contrato: trava o ref no início do ciclo atual.
      if(rep && amsCicloVigente(rep,nr).start===amsCicloVigente(rep,ref).start) estado.ams.ref=amsCicloVigente(rep,ref).start;
      else estado.ams.ref=nr; }
    else if(dir==='next'){ const nr=amsShiftRef(ref,1,cm);
      if(rep && amsCicloVigente(rep,nr).start>=amsCicloVigente(rep,hojeSP()).start) estado.ams.ref='';
      else estado.ams.ref=nr; }
    renderAMS(); return; }
  const cur=e.target.closest&&e.target.closest('[data-ams-cur]');
  if(cur){ escondeTip(); estado.ams.ref=''; renderAMS(); return; }
  const atz=e.target.closest&&e.target.closest('[data-ams-atualiza]');
  if(atz){ escondeTip(); estado.ams.dados=null; estado.ams.range=''; estado.ams.erroKey=''; estado.ams.forcar=true; renderAMS(); return; }
  const pdf=e.target.closest&&e.target.closest('[data-ams-pdf]');
  if(pdf){ escondeTip(); pdfApuracaoAMS(pdf.getAttribute('data-ams-pdf')); return; }
  const mes=e.target.closest&&e.target.closest('[data-ams-mes]');
  if(mes){ escondeTip(); const v=mes.getAttribute('data-ams-mes'); const i=v.indexOf('|'); amsDrillMes(v.slice(0,i), v.slice(i+1)); return; }
  const rel=e.target.closest&&e.target.closest('[data-ams-rel]');
  if(rel){ escondeTip(); amsDrillRel((estado.ams&&estado.ams.sel)||'', rel.getAttribute('data-ams-rel'), rel.getAttribute('data-ams-relv')); return; }
  const amsEdit=e.target.closest&&e.target.closest('[data-ams-edit]');
  if(amsEdit){ escondeTip(); estado.admin.editId=amsEdit.getAttribute('data-ams-edit'); vaiPara('admin'); return; }
  const fat=e.target.closest&&e.target.closest('[data-ams-fatura]');
  if(fat){ escondeTip();
    const ams=(cfg.contratos||[]).filter(c=>c.tipo==='ams'&&(c.projetos||[]).length);
    const c=amsContratoSel(ams); if(!c) return;
    // O status fica salvo para o time (Supabase); a gravação compartilhada exige login do Jira.
    if(cfgShared && !idApontar()){ abreIdentidade(); return; }
    const cyc=amsCicloVigente(c, amsRefSel());
    // Chaves dos chamados do ciclo ANTES do re-render (que pode recarregar os dados).
    const keys=amsChamadosCiclo(c,cyc).map(o=>o.k).filter(k=>/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(k));
    c.faturados=c.faturados||{};
    const marcar=!c.faturados[cyc.start];
    if(marcar){ const id0=idApontar(); c.faturados[cyc.start]={ em:hojeSP(), por:(id0&&(id0.nome||id0.email))||'' }; }
    else delete c.faturados[cyc.start];
    salvaCfg(); renderAMS();
    // Reflete NO JIRA: labels "faturado" + "ciclo-<início>" em todos os chamados do
    // ciclo — adicionadas ao marcar, removidas ao desmarcar (com o token de quem marca).
    const idJ=idApontar();
    if(!idJ){ toast('Ciclo atualizado no painel — identifique-se (token do Jira) para gravar as labels nos tickets.','err'); return; }
    if(!keys.length){ toast(`Ciclo ${marcar?'marcado como faturado':'desmarcado'} — nenhum chamado com chave para rotular no Jira.`,'ok'); return; }
    const labels=['faturado', 'ciclo-'+cyc.start];
    toast(`${marcar?'Gravando':'Removendo'} a marcação de faturado em ${keys.length} ticket(s) no Jira…`);
    fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({rotular:true, issues:keys, labels, remover:!marcar, email:idJ.email, token:idJ.token})})
      .then(r=>r.json()).then(j=>{
        if(j.ok){ toast(`✓ ${j.rotulados} ticket(s) ${marcar?'marcados como FATURADO':'desmarcados'} no Jira (labels ${labels.join(', ')}).`,'ok');
          logAcao({acao:marcar?'ams-faturado':'ams-desfaturado', t:'', de:c.nome||c.id, para:`${j.rotulados} tickets · ciclo ${cyc.start}`, ok:true}); }
        else toast(`⚠ Labels no Jira: ${j.rotulados||0} ok, ${((j.falhas||[]).length)||'?'} falha(s)${j.erro?' — '+j.erro:''}. O status do ciclo no painel foi salvo.`,'err');
      }).catch(e=>toast('⚠ Falha ao gravar as labels no Jira: '+(e.message||e)+'. O status do ciclo no painel foi salvo.','err'));
    return; }
});
// AMS: seletor de cliente (mostra um contrato por vez; volta ao ciclo vigente ao trocar).
document.getElementById('conteudo').addEventListener('change', (e)=>{
  if(e.target && e.target.id==='ams-sel'){ estado.ams.sel=e.target.value; estado.ams.ref=''; renderAMS(); }
});
// ---- Administração: cadastro de contratos ----
// Projetos do contrato e horas alocadas: só anotam no estado do formulário (e atualizam a linha e o resumo), sem
// redesenhar a tela — o que foi digitado nos outros campos fica onde está.
document.getElementById('conteudo').addEventListener('change', (e)=>{
  const t=e.target; if(!t||!estado.admin.form) return; const f=estado.admin.form;
  if(t.hasAttribute&&t.hasAttribute('data-ad-proj')){ const k=t.getAttribute('data-ad-proj'); if(t.checked) f.marc[k]=true; else delete f.marc[k];
    const l=t.closest('.ad-aloc-l'); if(l){ l.classList.toggle('on',t.checked); const h=l.querySelector('[data-ad-aloc]'); if(h){ h.disabled=!t.checked; h.placeholder=t.checked?'a alocar':'—'; if(t.checked&&f.aloc[k]) h.value=f.aloc[k]; if(!t.checked) h.value=''; } }
    ctAlocResumo(); }
  else if(t.id==='ad-proj-todos'){ f.todos=t.checked; ctProjAtualiza(); }
});
document.getElementById('conteudo').addEventListener('input', (e)=>{
  const t=e.target; if(!t||!estado.admin.form) return; const f=estado.admin.form;
  if(t.hasAttribute&&t.hasAttribute('data-ad-aloc')){ const k=t.getAttribute('data-ad-aloc'); const h=Number(t.value);
    if(t.value===''||!(h>0)) delete f.aloc[k]; else f.aloc[k]=h; ctAlocResumo(); }
  else if(t.id==='ad-proj-busca'){ f.busca=t.value; ctProjAtualiza(); }
  else if(t.id==='ad-horas'||t.id==='ad-valor'){ ctAlocResumo(); }
});
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-ir-admin')){ vaiPara('admin'); return; }
  if(t.hasAttribute('data-ad-alocar-ir')){ estado.admin.editId=t.getAttribute('data-ad-alocar-ir'); estado.admin.dup=null; vaiPara('admin');
    setTimeout(()=>{ const w=document.getElementById('ad-projs-wrap'); if(w) w.scrollIntoView({block:'center'}); },60); return; }
  if(t.id==='ad-salvar'){ salvaContrato(); }
  else if(t.id==='ad-cancelar'){ estado.admin.editId=null; estado.admin.dup=null; estado.admin.form=null; renderAdmin(); }
  else if(t.hasAttribute('data-ad-edit')){ estado.admin.editId=t.getAttribute('data-ad-edit'); estado.admin.dup=null; renderAdmin(); window.scrollTo({top:0,behavior:'smooth'}); }
  else if(t.hasAttribute('data-ad-alocar')){   // 📌 alocar horas: abre o contrato já na lista de projetos
    estado.admin.editId=t.getAttribute('data-ad-alocar'); estado.admin.dup=null; renderAdmin();
    const w=document.getElementById('ad-projs-wrap'); if(w){ w.scrollIntoView({block:'center'}); const i=w.querySelector('input[data-ad-aloc]:not([disabled])'); if(i) i.focus({preventScroll:true}); } }
  else if(t.hasAttribute('data-ad-dup')){ const c=(cfg.contratos||[]).find(x=>x.id===t.getAttribute('data-ad-dup')); if(!c) return;
    estado.admin.editId=null; estado.admin.dup=ctCopia(c); renderAdmin(); window.scrollTo({top:0,behavior:'smooth'});
    try{ const i=document.getElementById('ad-cliente'); if(i){ i.focus({preventScroll:true}); i.select(); } }catch(x){} }
  else if(t.hasAttribute('data-ad-del')){ const id=t.getAttribute('data-ad-del'); const c=(cfg.contratos||[]).find(x=>x.id===id);
    if(!confirm(`Remover o contrato ${c?ctCodCli(c)+' · '+(c.cliente||''):''}? Ele sai da apuração do AMS, da Receita e da Controladoria.`)) return;
    cfg.contratos=(cfg.contratos||[]).filter(c=>c.id!==id); if(estado.admin.editId===id) estado.admin.editId=null; salvaCfg(); renderAdmin(); }
  else if(t.hasAttribute('data-ad-portal')||t.hasAttribute('data-ad-portal-novo')){
    const id=t.getAttribute('data-ad-portal')||t.getAttribute('data-ad-portal-novo');
    const c=(cfg.contratos||[]).find(x=>x.id===id);
    if(c){ c.portalToken='pt'+Date.now().toString(36)+Math.random().toString(36).slice(2,12); salvaCfg(); renderAdmin(); }
  }
  else if(t.hasAttribute('data-ad-portal-copy')){
    const url=t.getAttribute('data-ad-portal-copy');
    const done=()=>{ const o=t.textContent; t.textContent='copiado!'; setTimeout(()=>{ t.textContent=o; },1500); };
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(url).then(done).catch(()=>{
      const i=t.parentNode.querySelector('[data-ad-portal-input]'); if(i){ i.select(); document.execCommand('copy'); done(); } }); }
    else { const i=t.parentNode.querySelector('[data-ad-portal-input]'); if(i){ i.select(); document.execCommand('copy'); done(); } }
  }
  // ---- 🔐 acessos do cliente (portal com senha) ----
  else if(t.hasAttribute('data-pcli-abre')){
    const cid=t.getAttribute('data-pcli-abre');
    const abrindo=!estado.admin.acessosAbertos[cid];
    estado.admin.acessosAbertos[cid]=abrindo;
    if(abrindo && estado.admin.acessos[cid]===undefined && souAprovador()) pcliCarrega(cid);   // quem não é gestor não lista (o servidor recusaria)
    pcliReRender();
  }
  else if(t.hasAttribute('data-pcli-add')){
    const cid=t.getAttribute('data-pcli-add');
    const iE=document.querySelector(`[data-pcli-email="${cid}"]`), iN=document.querySelector(`[data-pcli-nome="${cid}"]`);
    const email=((iE&&iE.value)||'').trim();
    if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('Informe um e-mail válido.','warn'); if(iE) iE.focus(); return; }
    t.disabled=true; t.textContent='Convidando…';
    pcliApi('convidar',{ corpo:{ email, nome:((iN&&iN.value)||'').trim(), contrato:cid } }).then(j=>{
      if(!j||!j.ok){ toast((j&&j.erro)||'Não consegui convidar.','err'); t.disabled=false; t.textContent='✉ Convidar'; return; }
      if(iE) iE.value=''; if(iN) iN.value='';
      logAcao({acao:'portal-convidar', t:email, ok:true});
      pcliMostraConvite(j.convite, email);
      pcliCarrega(cid);
    });
  }
  else if(t.hasAttribute('data-pcli-conv')){
    const [cid,email]=t.getAttribute('data-pcli-conv').split('|');
    pcliApi('convidar',{ corpo:{ email, contrato:cid } }).then(j=>{
      if(!j||!j.ok){ toast((j&&j.erro)||'Não consegui gerar o convite.','err'); return; }
      pcliMostraConvite(j.convite, email); pcliCarrega(cid);
    });
  }
  else if(t.hasAttribute('data-pcli-rev')||t.hasAttribute('data-pcli-rea')){
    const rev=t.hasAttribute('data-pcli-rev');
    const [cid,id]=t.getAttribute(rev?'data-pcli-rev':'data-pcli-rea').split('|');
    pcliApi(rev?'revogar':'reativar',{ corpo:{ id } }).then(j=>{
      if(!j||!j.ok){ toast((j&&j.erro)||'Não consegui mudar o acesso.','err'); return; }
      toast(rev?'🚫 Acesso revogado — a sessão aberta para de valer na hora seguinte.':'✓ Acesso reativado.','ok');
      pcliCarrega(cid);
    });
  }
  else if(t.hasAttribute('data-pcli-del')){
    const [cid,id]=t.getAttribute('data-pcli-del').split('|');
    if(!confirm('Apagar esta conta de acesso? A pessoa perde o acesso imediatamente e precisará de um novo convite.')) return;
    pcliApi('remover',{ corpo:{ id } }).then(j=>{
      if(!j||!j.ok){ toast((j&&j.erro)||'Não consegui remover.','err'); return; }
      toast('Conta removida.','ok'); pcliCarrega(cid);
    });
  }
});
