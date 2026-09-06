// Jira Insights · 15 · 🚨 CENTRAL DE ALERTAS — atrasados/parados/sem responsável, reprogramar, atribuir,
// log de ações (e carregaReunioes usado pelo Reclassificar).
// ======================================================================================

// ====================== RECLASSIFICAR (mover tickets de reunião) ======================
function carregaReunioes(forca){
  const rc=estado.reclass;
  rc.carregando=true; rc.erro='';
  fetch(`/api/reunioes?projeto=${encodeURIComponent(rc.origem)}${forca?'&nocache=1':''}`)
    .then(r=>r.json()).then(j=>{
      rc.carregando=false;
      if(j.erro){ rc.erro=j.erro; }
      else { rc.dados=j; rc.sel={};
        if(!rc.alvo && (j.alvos||[]).length) rc.alvo=j.alvos[0].key;
        if(rc.alvo && !(j.alvos||[]).some(a=>a.key===rc.alvo)) rc.alvo=(j.alvos[0]&&j.alvos[0].key)||''; }
      if(estado.vista==='reclassificar') renderReclass();
    }).catch(e=>{ rc.carregando=false; rc.erro=String(e.message||e); if(estado.vista==='reclassificar') renderReclass(); });
}

// ====================== CENTRAL DE ALERTAS ======================
// Motor de alertas acionáveis a partir dos dados que já temos (vencimentos + timesheet).
// Concluídos SEM horas (30d): carrega uma vez por sessão (Alertas e Visão Geral).
function garanteSemHoras(){
  const a=estado.alertas;
  if(a.semHoras!==null || a.shCarregando) return;
  a.shCarregando=true;
  fetch('/api/vencimentos?semHoras=1&dias=30').then(r=>r.json()).then(j=>{
    a.shCarregando=false;
    a.semHoras=(j&&!j.erro)?j:{tickets:[],meta:{},erro:(j&&j.erro)||'falhou'};
    if(estado.vista==='alertas') renderAlertas(); else if(estado.vista==='visao') renderVisao();
  }).catch(e=>{ a.shCarregando=false; a.semHoras={tickets:[],meta:{},erro:String(e.message||e)}; });
}
function calcAlertas(){
  const al=[]; const hoje=hojeSP();
  const d=estado.alertas.dados;
  // Fechou o ticket sem registrar o trabalho: mina a confiança do apontamento.
  const sh=estado.alertas.semHoras;
  if(sh && sh.tickets){
    sh.tickets.forEach(t=>{
      al.push({ sev:'alto', cat:'Concluído sem horas',
        titulo:`${t.k} concluído sem apontamento`,
        detalhe:`${t.resumo||''} · ${t.p} · ${t.t}${t.resolvido?` · resolvido em ${fmtBR(t.resolvido)}`:''}`,
        resp:t.resp||'sem responsável',
        acao:'Cobrar o apontamento retroativo das horas trabalhadas.',
        link:`${jiraBase()}/browse/${encodeURIComponent(t.k)}` });
    });
  }
  if(d && d.tickets){
    d.tickets.forEach(t=>{
      const link=`${jiraBase()}/browse/${encodeURIComponent(t.k)}`;
      if(t.venc && t.venc<hoje){
        const dias=Math.round((new Date(hoje)-new Date(t.venc))/86400000);
        al.push({ sev: dias>7?'critico':'alto', cat:'Ticket vencido',
          titulo:`${t.k} venceu há ${dias}d`, detalhe:`${t.resumo||''} · ${t.p} · ${t.status}`,
          resp:t.resp||'sem responsável', acao:'Concluir, reagendar o vencimento ou repriorizar.', link });
      } else if(t.venc===hoje){
        al.push({ sev:'medio', cat:'Vence hoje', titulo:`${t.k} vence hoje`,
          detalhe:`${t.resumo||''} · ${t.p}`, resp:t.resp||'sem responsável', acao:'Concluir ou reagendar ainda hoje.', link });
      }
      if(!t.respId){
        al.push({ sev:'medio', cat:'Sem responsável', titulo:`${t.k} sem responsável`,
          detalhe:`${t.resumo||''} · ${t.p} · ${t.status}`, resp:'—', acao:'Atribuir um responsável.', link, k:t.k });
      }
    });
  }
  try{
    const { dias, hoje:hj, linhas } = calcTimesheet();
    const uteis=dias.filter(x=>ehUtil(x)&&!ehFeriado(x)&&x!==hj);
    const ultimo=uteis[uteis.length-1];
    linhas.forEach(l=>{
      if(ultimo && !ehAusencia(l.a,ultimo) && !(l.porDia[ultimo]>0)){
        al.push({ sev:'alto', cat:'Sem apontamento', titulo:`${l.nome} não apontou em ${fmtBR(ultimo)}`,
          detalhe:'Último dia útil fechado', resp:l.nome, acao:'Cobrar/registrar o apontamento do dia.' });
      }
      if(l.esperado>0){ const pctMeta=Math.round(l.tot/l.esperado*100);
        if(pctMeta<80) al.push({ sev: pctMeta<60?'alto':'medio', cat:'Abaixo da meta',
          titulo:`${l.nome} em ${pctMeta}% da meta no período`,
          detalhe:`Apontou ${fmtH(l.tot)} de ${fmtH(l.esperado)} · faltam ${fmtH(l.lacuna)}`,
          resp:l.nome, acao:'Apontar as horas pendentes do período.' });
      }
    });
  }catch(e){ /* tempo ainda não carregado: mostra só os alertas de tickets */ }
  const ordem={critico:0,alto:1,medio:2,baixo:3};
  al.sort((a,b)=> (ordem[a.sev]-ordem[b.sev]) || a.cat.localeCompare(b.cat,'pt') || a.titulo.localeCompare(b.titulo,'pt'));
  return al;
}
// --- Central de ação dos tickets atrasados (reprogramação rápida com rastreabilidade) ---
// Os motivos padrão funcionam como CATEGORIA OBRIGATÓRIA da reprogramação (governança:
// permite depois analisar a causa-raiz dos atrasos). O último item é texto livre.
// ---- Auditoria: registra as ações feitas pelo painel (compartilhada via config; últimas 300) ----
// ev: { acao, t (ticket), de, para, motivo, ok }  ·  salvar=false adia o salvaCfg (loops em lote)
function logAcao(ev, salvar){ try{
  const id=idApontar()||{};
  cfg.auditoria=Array.isArray(cfg.auditoria)?cfg.auditoria:[];
  cfg.auditoria.unshift(Object.assign({ q:new Date().toISOString(), u:id.nome||id.email||'—' }, ev));
  if(cfg.auditoria.length>300) cfg.auditoria.length=300;
  if(salvar!==false) salvaCfg();
}catch(e){} }
function abreLogAcoes(){
  const lst=(Array.isArray(cfg.auditoria)?cfg.auditoria:[]).slice(0,120);
  const fmtQ=(iso)=>{ try{ return new Date(iso).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); }catch(e){ return iso; } };
  const rows=lst.map(e=>`<tr>
    <td style="white-space:nowrap">${esc(fmtQ(e.q))}</td><td>${esc(e.u||'—')}</td>
    <td>${e.t?`<a href="${jiraBase()}/browse/${encodeURIComponent(e.t)}" target="_blank" rel="noopener">${esc(e.t)}</a>`:'—'}</td>
    <td><span class="badge">${esc(e.acao||'—')}</span></td>
    <td class="muted small">${e.de||e.para?`${esc(e.de||'—')} → ${esc(e.para||'—')}`:'—'}</td>
    <td class="muted small">${esc(e.motivo||'—')}</td>
    <td>${e.ok===false?'<span class="aloc-badge crit">falhou</span>':'<span class="aloc-badge saud">ok</span>'}</td></tr>`).join('');
  abreModal(`<h2>🗒 Histórico de ações</h2>
    <div class="muted small">As ações feitas pelo painel (reprogramar, atribuir, status, comentar, excluir, vincular, apontar, tratado) — compartilhado com o time, últimas 300.</div>
    ${lst.length?`<div class="ts-wrap" style="max-height:420px;overflow:auto;margin-top:10px"><table class="rc-tab"><thead><tr><th>Quando</th><th>Quem</th><th>Ticket</th><th>Ação</th><th>De → Para</th><th>Motivo</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      :'<div class="estado">Nenhuma ação registrada ainda.</div>'}`);
}
const ALX_MOTIVOS=[
  ['repri','Repriorização operacional','Data reprogramada devido à repriorização operacional da fila de atendimento.'],
  ['valid','Dependência de validação','Data reprogramada porque a execução depende de validação ou retorno de terceiro.'],
  ['cliente','Dependência do cliente','Data reprogramada porque o atendimento depende de retorno do cliente.'],
  ['planej','Ajuste de planejamento','Data reprogramada para adequação ao planejamento atualizado da equipe.'],
  ['analise','Necessidade de análise adicional','Data reprogramada porque o ticket exige análise adicional antes da execução.'],
  ['capac','Capacidade do time','Data reprogramada considerando a capacidade atual do time e a priorização das demandas em aberto.'],
  ['tecnico','Bloqueio técnico','Data reprogramada devido a bloqueio técnico identificado durante a análise.'],
  ['info','Aguardando informação','Data reprogramada porque existem informações pendentes necessárias para continuidade.'],
  ['outro','Outro motivo (texto livre)',''],
];
let _alxReprog=null;   // contexto do modal aberto: { keys:[...], acao, nova }
const alxDataBR=(iso)=> iso?`${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`:'—';
function alxTickets(){ const a=(estado.alertas.dados&&estado.alertas.dados.tickets)||[];
  const g=(estado.gestao&&estado.gestao.dados&&estado.gestao.dados.tickets)||[];
  return a.concat(g.filter(t=>!a.some(x=>x.k===t.k))); }
function alxProjNome(p){ const projs=Object.assign({}, (estado.gestao&&estado.gestao.dados&&estado.gestao.dados.projetos)||{}, (estado.alertas.dados&&estado.alertas.dados.projetos)||{}); return (projs[p]&&projs[p].nome)?`${p} — ${projs[p].nome}`:p; }
function alxAtraso(venc,hoje){ return Math.max(0, Math.round((new Date(hoje)-new Date(venc))/86400000)); }
function alxPrioRank(name){ const n=String(name||'').toLowerCase();
  if(/highest|blocker|crít|crit|máxim|maxim|mais alta/.test(n)) return 5;
  if(/high|alta|urg/.test(n)) return 4;
  if(/medium|méd|med|normal/.test(n)) return 3;
  if(/lowest|mínim|minim|trivial/.test(n)) return 1;
  if(/low|baixa/.test(n)) return 2;
  return 0; }
function alxParado(status){ return /bloque|impedi|espera|aguard|parad|hold|pend|stuck|blocked|waiting/i.test(status||''); }
// Tickets atrasados (vencidos), enriquecidos com dias de atraso, antes dos filtros da tela.
function alxBaseAtrasados(hoje){
  return alxTickets().filter(t=>t.venc && t.venc<hoje)
    .map(t=>({ ...t, dias:alxAtraso(t.venc,hoje) }));
}
// Aplica os filtros da barra (responsável/projeto/prioridade/status/tipo/dias/só meus).
function alxFiltra(base){
  const a=estado.alertas, id=idApontar();
  return base.filter(t=>{
    if(a.fResp){ if(a.fResp==='__none__'){ if(t.respId) return false; } else if(t.respId!==a.fResp) return false; }
    if(a.fProj && t.p!==a.fProj) return false;
    if(a.fPrio && (t.prio||'')!==a.fPrio) return false;
    if(a.fStatus && (t.status||'')!==a.fStatus) return false;
    if(a.fTipo && (t.t||'')!==a.fTipo) return false;
    if(a.fMinDias>0 && t.dias<a.fMinDias) return false;
    if(a.soMeus && id&&id.accountId && t.respId!==id.accountId) return false;
    return true;
  });
}
// Ordenação (padrão: criticidade = atraso + prioridade + sem responsável + status parado).
function alxOrdena(list){
  const ord=estado.alertas.ord||'crit';
  const score=(t)=> t.dias*10 + alxPrioRank(t.prio)*4 + (t.respId?0:6) + (alxParado(t.status)?3:0);
  const arr=list.slice();
  if(ord==='dias') arr.sort((x,y)=> y.dias-x.dias || (x.k<y.k?-1:1));
  else if(ord==='prio') arr.sort((x,y)=> alxPrioRank(y.prio)-alxPrioRank(x.prio) || y.dias-x.dias);
  else if(ord==='resp') arr.sort((x,y)=> (x.resp||'~').localeCompare(y.resp||'~','pt') || y.dias-x.dias);
  else arr.sort((x,y)=> score(y)-score(x) || y.dias-x.dias);
  return arr;
}
function alxOpts(base, val, lab, sel){
  const m=new Map(); base.forEach(t=>{ const v=val(t); if(v && !m.has(v)) m.set(v,lab(t)); });
  return [...m.entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'pt'))
    .map(([v,l])=>`<option value="${escA(v)}" ${sel===v?'selected':''}>${esc(l)}</option>`).join('');
}

function renderAlertas(){
  const cont=document.getElementById('conteudo');
  const a=estado.alertas;
  garanteSemHoras();
  if(!a.dados && !a.carregando && !a.erro){
    a.carregando=true;
    const ate=somaDias(hojeSP(),7);   // vencidos + vencendo nos próximos 7 dias + sem data
    fetch(`/api/vencimentos?ate=${encodeURIComponent(ate)}&incluirSemVenc=1`).then(r=>r.json()).then(j=>{
      a.carregando=false; if(j.erro) a.erro=j.erro; else a.dados=j;
      if(estado.vista==='alertas') renderAlertas();
    }).catch(e=>{ a.carregando=false; a.erro=String(e.message||e); if(estado.vista==='alertas') renderAlertas(); });
  }
  if(a.erro){ cont.replaceChildren(el(`<div class="erro"><strong>Falha ao montar os alertas.</strong> ${esc(a.erro)}
    <button class="btn" id="al-retry" style="margin-left:10px">Tentar de novo</button></div>`)); return; }
  if(!a.dados){ cont.replaceChildren(el('<div class="estado">Analisando alertas…</div>')); return; }

  const hoje=(a.dados.meta&&a.dados.meta.hoje)||hojeSP();
  const id=idApontar();
  const base=alxBaseAtrasados(hoje);              // todos os atrasados (para indicadores e opções de filtro)
  const lista=alxOrdena(alxFiltra(base));         // após filtros + ordenação (o que aparece na lista)
  const todos=alxTickets();
  const venceHoje=todos.filter(t=>t.venc===hoje).length;
  const semResp=base.filter(t=>!t.respId).length;
  const mais7=base.filter(t=>t.dias>7).length;
  const reprogN=Object.keys(a.reprog).length;
  const shN=(a.semHoras&&a.semHoras.tickets)?a.semHoras.tickets.length:null;
  const shDias=(a.semHoras&&a.semHoras.meta&&a.semHoras.meta.dias)||30;
  // Atrasados por responsável (top, clicável para filtrar).
  const porResp={}; base.forEach(t=>{ const k=t.respId||'__none__'; (porResp[k]=porResp[k]||{n:0,nome:t.resp||'sem responsável'}).n++; });
  const respTop=Object.entries(porResp).sort((x,y)=>y[1].n-x[1].n).slice(0,6);

  // Seleção em lote: só conta os selecionados que ainda estão na lista filtrada.
  const visiveis=new Set(lista.map(t=>t.k));
  Object.keys(a.sel).forEach(k=>{ if(!visiveis.has(k)) delete a.sel[k]; });
  const selN=Object.keys(a.sel).length;

  const ind=`<div class="kpis ts-kpis">
    <div class="kpi ${base.length?'w':'a'}"><div class="v">${base.length}</div><div class="l">⏰ Atrasados</div></div>
    <div class="kpi ${mais7?'w':'a'}" data-tipk="atraso maior que 7 dias"><div class="v">${mais7}</div><div class="l">🔴 +7 dias</div></div>
    <div class="kpi ${semResp?'w':'a'}"><div class="v">${semResp}</div><div class="l">👤 Sem responsável</div></div>
    <div class="kpi t"><div class="v">${venceHoje}</div><div class="l">📅 Vencem hoje</div></div>
    <div class="kpi a" ${reprogN?`data-tipk="${escA(Object.keys(a.reprog).join(', '))}"`:''}><div class="v">${reprogN}</div><div class="l">↺ Reprogramados (sessão)</div></div>
    <div class="kpi ${shN?'w':'a'}" data-tipk="Chamados fechados (categoria Concluído) com 0h apontadas nos últimos ${escA(String(shDias))} dias — fora agrupadores (História/Épico) e cancelados/duplicados. Detalhe nos cards de 'Outros alertas'."><div class="v">${shN==null?'…':shN}</div><div class="l">✅🚫 Concluídos sem horas</div></div>
  </div>`;

  const respChips = respTop.length?`<div class="muted small" style="margin:2px 0 10px">Atrasados por responsável: ${respTop.map(([rid,o])=>
    `<button class="chip" data-alx-resp="${escA(rid)}" aria-pressed="${a.fResp===rid}" style="margin:2px">${esc(o.nome)} · ${o.n}</button>`).join('')}</div>`:'';

  const filtros=`<div class="alx-filtros">
    <select data-alx-f="fResp" aria-label="Responsável"><option value="">Responsável: todos</option><option value="__none__" ${a.fResp==='__none__'?'selected':''}>— sem responsável —</option>${alxOpts(base,t=>t.respId,t=>t.resp||'(sem nome)',a.fResp)}</select>
    <select data-alx-f="fProj" aria-label="Projeto"><option value="">Projeto: todos</option>${alxOpts(base,t=>t.p,t=>alxProjNome(t.p),a.fProj)}</select>
    <select data-alx-f="fPrio" aria-label="Prioridade"><option value="">Prioridade: todas</option>${alxOpts(base,t=>t.prio,t=>t.prio,a.fPrio)}</select>
    <select data-alx-f="fStatus" aria-label="Status"><option value="">Status: todos</option>${alxOpts(base,t=>t.status,t=>t.status,a.fStatus)}</select>
    <select data-alx-f="fTipo" aria-label="Tipo"><option value="">Tipo: todos</option>${alxOpts(base,t=>t.t,t=>t.t,a.fTipo)}</select>
    <label class="alx-chkf" data-tip="Atraso mínimo, em dias">≥ <input type="number" min="0" data-alx-f="fMinDias" value="${a.fMinDias||0}"> dias</label>
    <label class="alx-chkf"><input type="checkbox" data-alx-f="soMeus" ${a.soMeus?'checked':''}> Apenas meus</label>
    <select data-alx-f="ord" aria-label="Ordenar por"><option value="crit" ${a.ord==='crit'?'selected':''}>Ordem: criticidade</option><option value="dias" ${a.ord==='dias'?'selected':''}>mais atrasados</option><option value="prio" ${a.ord==='prio'?'selected':''}>prioridade</option><option value="resp" ${a.ord==='resp'?'selected':''}>responsável</option></select>
    <button class="chip alx-limpar" data-alx-limpar="1" data-tip="Limpar filtros">limpar filtros</button>
  </div>`;

  const bulk = selN?`<div class="alx-bulk">
    <span class="n">${selN} selecionado(s)</span>
    <button class="chip primario-chip" data-alx-bulk="HOJE">Reprogramar p/ hoje</button>
    <button class="chip" data-alx-bulk="AMANHA">p/ amanhã</button>
    <button class="chip" data-alx-bulk="PROX" data-tip="Próxima segunda-feira">p/ semana que vem</button>
    <button class="chip atribuir-chip" data-alx-bulk-atrib="1" data-tip="Atribuir um responsável aos selecionados">👤 Atribuir a…</button>
    <span class="spacer"></span>
    <button class="chip" data-alx-bulk-clear="1">limpar seleção</button>
  </div>`:'';

  const linhas=lista.map(t=>{
    const link=`${jiraBase()}/browse/${encodeURIComponent(t.k)}`;
    const sel=!!a.sel[t.k]; const crit=t.dias>7;
    const rep=a.reprog[t.k];
    return `<div class="alx-row ${crit?'crit':''} ${sel?'sel':''}" data-alx-rk="${escA(t.k)}">
      <input type="checkbox" class="alx-chk" data-alx-sel="${escA(t.k)}" ${sel?'checked':''} aria-label="Selecionar ${escA(t.k)}">
      <div class="alx-main">
        <div class="alx-l1">
          <span class="alx-key"><a href="${link}" target="_blank" rel="noopener">${esc(t.k)} ↗</a></span>
          <span class="alx-pill dias ${crit?'crit':''}">${t.dias}d em atraso</span>
          ${t.prio?`<span class="alx-pill prio">${esc(t.prio)}</span>`:''}
          ${!t.respId?'<span class="alx-pill sr">sem responsável</span>':''}
          <span class="alx-pill st">${esc(t.status)}</span>
          ${rep?`<span class="alx-pill reprog" data-tip="de ${escA(alxDataBR(rep.de))} → ${escA(alxDataBR(rep.para))} · ${escA(rep.motivo)}">↺ reprogramado</span>`:''}
        </div>
        <div class="alx-tit" data-tip="${escA(t.resumo||'')}">${esc(t.resumo||'(sem título)')}</div>
        <div class="alx-meta"><span>📁 ${esc(alxProjNome(t.p))}</span><span>👤 ${esc(t.resp||'sem responsável')}</span><span>📅 vencia ${esc(alxDataBR(t.venc))}</span></div>
        <div class="alx-acoes">
          <button class="chip primario-chip" data-alx-reprog="HOJE" data-alx-k="${escA(t.k)}">Hoje</button>
          <button class="chip" data-alx-reprog="AMANHA" data-alx-k="${escA(t.k)}">Amanhã</button>
          <button class="chip" data-alx-reprog="PROX" data-alx-k="${escA(t.k)}" data-tip="Próxima segunda-feira">Semana que vem</button>
          ${!t.respId?`<button class="chip atribuir-chip" data-alx-atrib="${escA(t.k)}" data-tip="Atribuir um responsável a este ticket">👤 Atribuir</button>`:''}
          <a class="chip" href="${link}" target="_blank" rel="noopener">Abrir Jira ↗</a>
          <button class="chip" data-alx-copiar="${escA(t.k)}" data-tip="Copiar um resumo do ticket">Copiar</button>
        </div>
        <div class="alx-fb" hidden></div>
      </div>
    </div>`;
  }).join('');

  const temSel=lista.length && lista.every(t=>a.sel[t.k]);
  const cabLista=`<div class="alx-head">
    <h2 style="margin:0">⏰ Tickets atrasados <span>${lista.length} de ${base.length} · ação rápida</span></h2>
    <span class="spacer" style="flex:1"></span>
    ${lista.length?`<button class="chip" data-alx-todos="${temSel?'0':'1'}">${temSel?'desmarcar todos':'selecionar todos'}</button>`:''}
  </div>`;

  // --- Outros alertas (não-atrasados): vence hoje, sem responsável, sem apontamento, abaixo da meta ---
  const outros=calcAlertas().filter(x=>x.cat!=='Ticket vencido');
  const sevInfo={critico:['Crítico','🔴'],alto:['Alto','🟠'],medio:['Médio','🟡'],baixo:['Baixo','🔵']};
  const cardsOutros=outros.map(x=>{
    const [rot,ic]=sevInfo[x.sev]||['',''];
    return `<div class="al-card al-${esc(x.sev)}">
      <div class="al-top"><span class="al-sev">${ic} ${rot}</span><span class="al-cat">${esc(x.cat)}</span>
        ${x.link?`<span class="spacer"></span><a class="al-link" href="${x.link}" target="_blank" rel="noopener">abrir ↗</a>`:''}</div>
      <div class="al-tit">${esc(x.titulo)}</div>
      ${x.detalhe?`<div class="al-det">${esc(x.detalhe)}</div>`:''}
      <div class="al-foot"><span data-tip="Responsável">👤 ${esc(x.resp||'—')}</span><span class="spacer"></span>${x.k?`<button class="chip atribuir-chip" data-alx-atrib="${escA(x.k)}" data-tip="Atribuir um responsável a ${escA(x.k)}">👤 Atribuir</button>`:`<span class="al-acao">→ ${esc(x.acao)}</span>`}</div>
    </div>`;
  }).join('');

  cont.replaceChildren(el(`<div>
    ${ind}
    <div class="card full">
      ${cabLista}
      <div class="muted small" style="margin:2px 0 10px">Reprograme o vencimento (hoje · amanhã · semana que vem), justifique com um motivo padrão (categoria) e a mudança é gravada no Jira — data + comentário — com o <strong>seu</strong> usuário. ${id?'':'<button class="chip" data-ap-act="config-id">identifique-se para agir</button>'}</div>
      ${respChips}
      ${filtros}
      ${bulk}
      ${lista.length?`<div class="alx-list">${linhas}</div>`:`<div class="alx-vazio">${base.length?'Nenhum atrasado neste filtro.':'✓ Nenhum ticket atrasado. Tudo em dia!'}</div>`}
    </div>
    <details class="card full" ${outros.length?'':'open'} style="margin-top:14px">
      <summary style="cursor:pointer;font-weight:700">🔔 Outros alertas da operação <span class="muted small">(${outros.length}) — concluídos sem horas, vencendo hoje, sem responsável, apontamento e metas</span></summary>
      <div style="margin-top:10px">${outros.length?`<div class="al-grid">${cardsOutros}</div>`:'<div class="aviso ok">✓ Sem outros alertas no período.</div>'}</div>
    </details>
  </div>`));
}

// Copia para a área de transferência um resumo acionável do ticket atrasado.
function alxCopiar(btn,k){
  const hoje=(estado.alertas.dados&&estado.alertas.dados.meta&&estado.alertas.dados.meta.hoje)||hojeSP();
  const t=alxTickets().find(x=>x.k===k); if(!t) return;
  const dias=alxAtraso(t.venc,hoje);
  const link=`${jiraBase()}/browse/${encodeURIComponent(t.k)}`;
  const msg=`${t.k} — ${t.resumo||''}\nResponsável: ${t.resp||'sem responsável'}\nProjeto: ${alxProjNome(t.p)}\nVencimento: ${alxDataBR(t.venc)} (${dias}d em atraso)\nStatus: ${t.status||'—'}\n${link}`;
  const ok=()=>{ const o=btn.textContent; btn.textContent='copiado!'; setTimeout(()=>{ btn.textContent=o; },1400); };
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(msg).then(ok).catch(()=>{});
  else { try{ const ta=document.createElement('textarea'); ta.value=msg; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); ok(); }catch(e){} }
}

// Abre o modal de confirmação da reprogramação (1 ticket ou vários em lote).
function abreModalReprog(keys, acao){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  keys=(keys||[]).filter(Boolean); if(!keys.length) return;
  const hoje=(estado.alertas.dados&&estado.alertas.dados.meta&&estado.alertas.dados.meta.hoje)||hojeSP();
  let nova=hoje;
  if(acao==='AMANHA') nova=somaDias(hoje,1); else if(acao==='PROX') nova=proximaSegunda(); else nova=hoje;
  _alxReprog={ keys, acao, nova };
  const tk=(k)=>alxTickets().find(x=>x.k===k)||{k};
  const motOpts='<option value="">— escolha o motivo (obrigatório) —</option>'+
    ALX_MOTIVOS.map(m=>`<option value="${m[0]}">${esc(m[1])}</option>`).join('');
  let resumo;
  if(keys.length===1){
    const t=tk(keys[0]); const dias=alxAtraso(t.venc,hoje);
    const dl=(rot,val,cls)=>`<div><div class="dt">${rot}</div><div class="dd ${cls||''}">${val}</div></div>`;
    resumo=`<div class="alx-rsum">
      ${dl('Ticket', `<a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener">${esc(t.k)} ↗</a>`)}
      ${dl('Status', esc(t.status||'—'))}
      ${dl('Responsável', esc(t.resp||'sem responsável'))}
      ${dl('Projeto', esc(alxProjNome(t.p)))}
      ${dl('Prioridade', esc(t.prio||'—'))}
      ${dl('Atraso', dias+' dia(s)','atraso')}
      ${dl('Vencimento atual', esc(alxDataBR(t.venc)))}
      ${dl('Nova data', esc(alxDataBR(nova)),'nova')}
    </div>
    <div class="muted small" style="margin:4px 0 0">${esc(t.resumo||'')}</div>`;
  } else {
    const itens=keys.map(k=>{ const t=tk(k); const dias=alxAtraso(t.venc,hoje);
      return `<li><strong>${esc(t.k)}</strong> — ${esc((t.resumo||'').slice(0,70))} <span class="muted">(${dias}d · ${esc(t.resp||'sem resp.')})</span></li>`; }).join('');
    resumo=`<div class="alx-rsum"><div><div class="dt">Tickets selecionados</div><div class="dd">${keys.length}</div></div>
      <div><div class="dt">Nova data (para todos)</div><div class="dd nova">${esc(alxDataBR(nova))}</div></div></div>
      <ul class="muted small" style="margin:8px 0 0;padding-left:18px;max-height:150px;overflow:auto">${itens}</ul>`;
  }
  const linkBtn = keys.length===1 ? `<a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(keys[0])}" target="_blank" rel="noopener">Abrir no Jira ↗</a>` : '';
  abreModal(`
    <h2>Reprogramar ${keys.length===1?esc(keys[0]):keys.length+' tickets'} → ${esc(alxDataBR(nova))}</h2>
    ${resumo}
    <div class="alx-campo">
      <label>Nova data de vencimento <span class="muted small">(edite se quiser outra)</span></label>
      <input type="date" id="alx-data" value="${escA(nova)}" style="max-width:180px">
    </div>
    <div class="alx-campo">
      <label>Motivo da reprogramação <span class="req">*</span> <span class="muted small">(categoria — obrigatória)</span></label>
      <select class="alx-motivo" id="alx-motivo">${motOpts}</select>
    </div>
    <div class="alx-campo" id="alx-outro-wrap" hidden>
      <label>Descreva o motivo <span class="req">*</span></label>
      <input type="text" class="alx-coment" id="alx-outro" placeholder="Escreva o motivo da reprogramação…" style="min-height:0">
    </div>
    <div class="alx-campo">
      <label>Comentário que será publicado no Jira <span class="muted small">(editável)</span></label>
      <textarea class="alx-coment" id="alx-coment" placeholder="Escolha um motivo acima para gerar o comentário…"></textarea>
      <div class="muted small" style="margin-top:4px">🔒 Em projetos AMS (categorias <b>Dexterity - AMS</b> e <b>Parceria - AMS</b>) este comentário entra como <b>nota interna</b> — o cliente não vê no portal.</div>
      ${keys.length>1?'<div class="muted small" style="margin-top:5px">A data anterior de cada ticket é preenchida automaticamente no comentário.</div>':''}
    </div>
    <div class="alx-fb" id="alx-modal-fb" hidden></div>
    <div class="alx-modal-acoes">
      <button class="btn primario" id="alx-confirmar">Confirmar reprogramação</button>
      <button class="btn" id="alx-cancelar">Cancelar</button>
      <span class="spacer"></span>
      ${linkBtn}
    </div>
  `);
  alxAtualizaComent();
}

// Texto do motivo escolhido (padrão ou livre); '' se nada válido escolhido ainda.
function alxMotivoTexto(){
  const sel=(document.getElementById('alx-motivo')||{}).value||'';
  if(!sel) return '';
  if(sel==='outro') return (document.getElementById('alx-outro')||{}).value||'';
  const m=ALX_MOTIVOS.find(x=>x[0]===sel); return m?m[2]:'';
}
// Regenera o comentário-modelo a partir do motivo e da nova data (mantém edição até trocar o motivo).
function alxAtualizaComent(){
  if(!_alxReprog) return;
  const sel=(document.getElementById('alx-motivo')||{}).value||'';
  const wrap=document.getElementById('alx-outro-wrap'); if(wrap) wrap.hidden=(sel!=='outro');
  const ta=document.getElementById('alx-coment'); if(!ta) return;
  const motivo=alxMotivoTexto();
  const nova=alxDataBR(_alxReprog.nova);
  const ant = _alxReprog.keys.length===1
    ? alxDataBR((alxTickets().find(x=>x.k===_alxReprog.keys[0])||{}).venc)
    : '[DATA_ANTERIOR]';
  if(!sel){ ta.value=''; return; }
  const quem=(idApontar()||{}); const agora=new Date().toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
  ta.value=`Atualização via JiraInsight:\nVencimento alterado de ${ant} para ${nova}.\nMotivo: ${motivo||'…'}\nResponsável pela alteração: ${quem.nome||quem.email||'—'}.\nData da alteração: ${agora}.`;
}

// Confirma: para cada ticket → muda o duedate e publica o comentário no Jira (token da pessoa).
async function confirmaReprog(){
  const ctx=_alxReprog; if(!ctx) return;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const fb=document.getElementById('alx-modal-fb'); fb.hidden=false; fb.className='alx-fb ap-fb';
  const sel=(document.getElementById('alx-motivo')||{}).value||'';
  if(!sel){ fb.classList.add('err'); fb.textContent='Escolha o motivo (categoria obrigatória).'; return; }
  const motivoTexto=alxMotivoTexto();
  if(sel==='outro' && !motivoTexto.trim()){ fb.classList.add('err'); fb.textContent='Descreva o motivo da reprogramação.';
    const o=document.getElementById('alx-outro'); if(o) o.focus(); return; }
  const motivoLabel=(ALX_MOTIVOS.find(x=>x[0]===sel)||['','Outro'])[1];
  const comentBase=(document.getElementById('alx-coment')||{}).value||'';
  const btn=document.getElementById('alx-confirmar'); const can=document.getElementById('alx-cancelar');
  if(btn) btn.disabled=true; if(can) can.disabled=true;
  const a=estado.alertas; const dados=a.dados; let okN=0; const erros=[];
  for(const k of ctx.keys){
    const t=alxTickets().find(x=>x.k===k)||{k,venc:''};
    fb.classList.remove('err','ok','warn'); fb.textContent=`Reprogramando ${k}… (${okN+erros.length+1}/${ctx.keys.length})`;
    try{
      const r1=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({reagendar:true,issue:k,duedate:ctx.nova,email:id.email,token:id.token})}).then(r=>r.json());
      if(!r1.ok){ erros.push(`${k}: ${r1.erro||'falha ao alterar a data'}`); continue; }
      const texto=comentBase.replace(/\[DATA_ANTERIOR\]/g, alxDataBR(t.venc)).replace(/\[NOVA_DATA\]/g, alxDataBR(ctx.nova));
      let comentOk=true, comentErro='';
      if(texto.trim()){
        const r2=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({comentar:true,reprogramacao:true,issue:k,texto,email:id.email,token:id.token})}).then(r=>r.json());
        comentOk=!!r2.ok; comentErro=r2.erro||'';
      }
      okN++;
      // Atualiza o estado local (sai da lista de atrasados — nova data ≥ hoje) e registra o histórico da sessão.
      if(dados&&dados.tickets){ const dt=dados.tickets.find(x=>x.k===k); if(dt) dt.venc=ctx.nova; }
      const gtk=(estado.gestao.dados&&estado.gestao.dados.tickets||[]).find(x=>x.k===k); if(gtk) gtk.venc=ctx.nova; delete estado.gestao.sel[k];
      a.reprog[k]={ de:t.venc, para:ctx.nova, motivo:motivoLabel, por:(id.nome||id.email), quando:hojeSP() };
      logAcao({acao:'reprogramar', t:k, de:t.venc||'—', para:ctx.nova, motivo:motivoLabel, ok:true}, false);
      delete a.sel[k];
      if(!comentOk) erros.push(`${k}: data alterada, mas o comentário falhou (${comentErro||'sem permissão'})`);
    }catch(e){ erros.push(`${k}: erro de rede (${e.message||e})`); }
  }
  salvaCfg();        // persiste o log de auditoria das reprogramações
  invalidaCacheDados();   // os outros painéis recarregam dados frescos
  if(okN && !erros.length){
    fb.className='alx-fb ap-fb ok';
    fb.textContent=`✓ ${okN} ticket(s) reprogramado(s) para ${alxDataBR(ctx.nova)} e comentado(s) no Jira.`;
    setTimeout(()=>{ fechaModal(); _alxReprog=null; if(estado.vista==='alertas') renderAlertas(); }, 900);
  } else if(okN){
    fb.className='alx-fb ap-fb warn';
    fb.innerHTML=`⚠ ${okN} ok, ${erros.length} com aviso/erro:<br>${esc(erros.join(' · '))}`;
    if(btn) btn.disabled=false; if(can){ can.disabled=false; can.textContent='Fechar'; }
    setTimeout(()=>{ if(estado.vista==='alertas') renderAlertas(); }, 200);
  } else {
    fb.className='alx-fb ap-fb err';
    fb.innerHTML=`Não foi possível reprogramar. Verifique se seu usuário tem permissão para editar o campo de vencimento e comentar no Jira.<br><span class="muted small">${esc(erros.join(' · '))}</span>`;
    if(btn) btn.disabled=false; if(can) can.disabled=false;
  }
}

// ---- Atribuir responsável (1 ticket ou em lote) — mesmo padrão das ações de reprogramar ----
let _alxAtrib=null;   // contexto do modal de atribuição: { keys:[...] }
function abreModalAtribuir(keys){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  keys=(keys||[]).filter(Boolean); if(!keys.length) return;
  _alxAtrib={ keys };
  const tk=(k)=>alxTickets().find(x=>x.k===k)||{k};
  const pessoas=Object.entries(pessoasUnidas()).filter(([a,p])=>!RE_EXCLUIR.test((p&&p.nome)||''))
    .sort((x,y)=>((x[1]&&x[1].nome)||'').localeCompare((y[1]&&y[1].nome)||'','pt'));
  const pessoaOpts='<option value="">— escolha a pessoa (obrigatório) —</option>'+pessoas.map(([a,p])=>
    `<option value="${escA(a)}">${esc((p&&p.nome)||a)}</option>`).join('');
  let resumo;
  if(keys.length===1){
    const t=tk(keys[0]);
    const dl=(rot,val,cls)=>`<div><div class="dt">${rot}</div><div class="dd ${cls||''}">${val}</div></div>`;
    resumo=`<div class="alx-rsum">
      ${dl('Ticket', `<a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener">${esc(t.k)} ↗</a>`)}
      ${dl('Status', esc(t.status||'—'))}
      ${dl('Responsável atual', esc(t.resp||'sem responsável'),'atraso')}
      ${dl('Projeto', esc(alxProjNome(t.p)))}
      ${dl('Prioridade', esc(t.prio||'—'))}
      ${dl('Vencimento', esc(alxDataBR(t.venc)))}
    </div>
    <div class="muted small" style="margin:4px 0 0">${esc(t.resumo||'')}</div>`;
  } else {
    const itens=keys.map(k=>{ const t=tk(k);
      return `<li><strong>${esc(t.k)}</strong> — ${esc((t.resumo||'').slice(0,70))} <span class="muted">(${esc(t.resp||'sem resp.')})</span></li>`; }).join('');
    resumo=`<div class="alx-rsum"><div><div class="dt">Tickets selecionados</div><div class="dd">${keys.length}</div></div></div>
      <ul class="muted small" style="margin:8px 0 0;padding-left:18px;max-height:150px;overflow:auto">${itens}</ul>`;
  }
  const mim = id.accountId ? `<button class="chip" id="alx-atrib-mim" data-tip="Atribuir para o meu usuário">para mim</button>` : '';
  const linkBtn = keys.length===1 ? `<a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(keys[0])}" target="_blank" rel="noopener">Abrir no Jira ↗</a>` : '';
  abreModal(`
    <h2>Atribuir responsável · ${keys.length===1?esc(keys[0]):keys.length+' tickets'}</h2>
    ${resumo}
    <div class="alx-campo">
      <label>Responsável <span class="req">*</span> <span class="muted small">(obrigatório)</span></label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <select class="alx-motivo" id="alx-atrib-pessoa" style="flex:1 1 220px">${pessoaOpts}</select>
        ${mim}
      </div>
    </div>
    <div class="alx-campo">
      <label>Comentário que será publicado no Jira <span class="muted small">(opcional, editável)</span></label>
      <textarea class="alx-coment" id="alx-atrib-coment" placeholder="Comentário opcional ao atribuir o responsável…"></textarea>
    </div>
    <div class="alx-fb" id="alx-atrib-fb" hidden></div>
    <div class="alx-modal-acoes">
      <button class="btn primario" id="alx-atrib-confirmar">Confirmar atribuição</button>
      <button class="btn" id="alx-atrib-cancelar">Cancelar</button>
      <span class="spacer"></span>
      ${linkBtn}
    </div>
  `);
}
// Nome legível da pessoa selecionada (sem o sufixo "(eu)" usado no atalho "para mim").
function alxAtribNomeSel(){
  const sel=document.getElementById('alx-atrib-pessoa'); if(!sel||!sel.value) return '';
  const opt=sel.options[sel.selectedIndex];
  return ((opt&&opt.text)||sel.value).replace(/\s*\(eu\)$/,'');
}
// Gera/atualiza o comentário-modelo quando uma pessoa é escolhida (mantém edição até trocar).
function alxAtribAtualizaComent(){
  if(!_alxAtrib) return;
  const sel=document.getElementById('alx-atrib-pessoa'); const ta=document.getElementById('alx-atrib-coment');
  if(!sel||!ta) return;
  if(!sel.value){ ta.value=''; return; }
  ta.value=`Responsável definido como ${alxAtribNomeSel()}.\n\nAção realizada via painel de Alertas do Jira Insight.`;
}
// Atalho "para mim": garante uma opção com o meu accountId e a seleciona.
function alxAtribParaMim(){
  const id=idApontar(); if(!id||!id.accountId) return;
  const sel=document.getElementById('alx-atrib-pessoa'); if(!sel) return;
  let opt=[...sel.options].find(o=>o.value===id.accountId);
  if(!opt){ opt=document.createElement('option'); opt.value=id.accountId; opt.text=`${id.nome||id.email} (eu)`; sel.appendChild(opt); }
  sel.value=id.accountId; alxAtribAtualizaComent();
}
// Confirma: para cada ticket → define o responsável (assignee) e, se houver, publica o comentário (token da pessoa).
async function confirmaAtribuir(){
  const ctx=_alxAtrib; if(!ctx) return;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const fb=document.getElementById('alx-atrib-fb'); fb.hidden=false; fb.className='alx-fb ap-fb';
  const sel=document.getElementById('alx-atrib-pessoa'); const accountId=(sel&&sel.value)||'';
  if(!accountId){ fb.classList.add('err'); fb.textContent='Escolha a pessoa responsável.'; return; }
  const nome=alxAtribNomeSel()||accountId;
  const comentBase=(document.getElementById('alx-atrib-coment')||{}).value||'';
  const btn=document.getElementById('alx-atrib-confirmar'); const can=document.getElementById('alx-atrib-cancelar');
  if(btn) btn.disabled=true; if(can) can.disabled=true;
  const a=estado.alertas; const dados=a.dados; let okN=0; const erros=[];
  for(const k of ctx.keys){
    fb.classList.remove('err','ok','warn'); fb.textContent=`Atribuindo ${k}… (${okN+erros.length+1}/${ctx.keys.length})`;
    const respAntes=((alxTickets().find(x=>x.k===k)||{}).resp)||'—';   // responsável anterior, para o histórico (antes de trocar)
    try{
      const r1=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({atribuir:true,issue:k,accountId,email:id.email,token:id.token})}).then(r=>r.json());
      if(!r1.ok){ erros.push(`${k}: ${r1.erro||'falha ao atribuir'}`); continue; }
      let comentOk=true, comentErro='';
      if(comentBase.trim()){
        const r2=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({comentar:true,issue:k,texto:comentBase,email:id.email,token:id.token})}).then(r=>r.json());
        comentOk=!!r2.ok; comentErro=r2.erro||'';
      }
      okN++;
      if(dados&&dados.tickets){ const dt=dados.tickets.find(x=>x.k===k); if(dt){ dt.respId=accountId; dt.resp=nome; } }
      const gtk=(estado.gestao.dados&&estado.gestao.dados.tickets||[]).find(x=>x.k===k); if(gtk){ gtk.respId=accountId; gtk.resp=nome; } delete estado.gestao.sel[k];
      logAcao({acao:'atribuir', t:k, de:respAntes, para:nome||'sem responsável', ok:true}, false);
      delete a.sel[k];
      if(!comentOk) erros.push(`${k}: atribuído, mas o comentário falhou (${comentErro||'sem permissão'})`);
    }catch(e){ erros.push(`${k}: erro de rede (${e.message||e})`); }
  }
  invalidaCacheDados();
  if(okN && !erros.length){
    fb.className='alx-fb ap-fb ok';
    fb.textContent=`✓ ${okN} ticket(s) atribuído(s) a ${nome} no Jira.`;
    setTimeout(()=>{ fechaModal(); _alxAtrib=null; if(estado.vista==='alertas') renderAlertas(); }, 900);
  } else if(okN){
    fb.className='alx-fb ap-fb warn';
    fb.innerHTML=`⚠ ${okN} ok, ${erros.length} com aviso/erro:<br>${esc(erros.join(' · '))}`;
    if(btn) btn.disabled=false; if(can){ can.disabled=false; can.textContent='Fechar'; }
    setTimeout(()=>{ if(estado.vista==='alertas') renderAlertas(); }, 200);
  } else {
    fb.className='alx-fb ap-fb err';
    fb.innerHTML=`Não foi possível atribuir. Verifique se seu usuário tem permissão para atribuir responsável no Jira.<br><span class="muted small">${esc(erros.join(' · '))}</span>`;
    if(btn) btn.disabled=false; if(can) can.disabled=false;
  }
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
// ---- Central de Alertas: ações rápidas, lote, filtros e retry ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const kp=e.target.closest && e.target.closest('[data-al-sev]');
  if(kp){ escondeTip(); estado.alertas.sev=kp.getAttribute('data-al-sev'); renderAlertas(); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  const a=estado.alertas;
  if(t.id==='al-retry'){ a.erro=''; a.dados=null; renderAlertas(); }
  else if(t.hasAttribute('data-alx-reprog')){ escondeTip(); abreModalReprog([t.getAttribute('data-alx-k')], t.getAttribute('data-alx-reprog')); }
  else if(t.hasAttribute('data-alx-copiar')){ alxCopiar(t, t.getAttribute('data-alx-copiar')); }
  else if(t.hasAttribute('data-alx-bulk')){ escondeTip(); abreModalReprog(Object.keys(a.sel), t.getAttribute('data-alx-bulk')); }
  else if(t.hasAttribute('data-alx-atrib')){ escondeTip(); abreModalAtribuir([t.getAttribute('data-alx-atrib')]); }
  else if(t.hasAttribute('data-alx-bulk-atrib')){ escondeTip(); abreModalAtribuir(Object.keys(a.sel)); }
  else if(t.hasAttribute('data-alx-bulk-clear')){ a.sel={}; renderAlertas(); }
  else if(t.hasAttribute('data-alx-resp')){ escondeTip(); const r=t.getAttribute('data-alx-resp'); a.fResp=(a.fResp===r?'':r); renderAlertas(); }
  else if(t.hasAttribute('data-alx-todos')){ const on=t.getAttribute('data-alx-todos')==='1';
    if(on){ document.querySelectorAll('[data-alx-sel]').forEach(c=>{ a.sel[c.getAttribute('data-alx-sel')]=true; }); } else { a.sel={}; }
    renderAlertas(); }
  else if(t.hasAttribute('data-alx-limpar')){ a.fResp='';a.fProj='';a.fPrio='';a.fStatus='';a.fTipo='';a.fMinDias=0;a.soMeus=false;a.ord='crit'; renderAlertas(); }
});
// ---- Central de Alertas: filtros (selects/checkbox) e seleção em lote (checkbox da linha) ----
document.getElementById('conteudo').addEventListener('change', (e)=>{
  const a=estado.alertas;
  const sc=e.target.closest && e.target.closest('[data-alx-sel]');
  if(sc){ const k=sc.getAttribute('data-alx-sel'); if(sc.checked) a.sel[k]=true; else delete a.sel[k]; renderAlertas(); return; }
  const f=e.target.closest && e.target.closest('[data-alx-f]');
  if(f){ const campo=f.getAttribute('data-alx-f');
    if(campo==='soMeus'){ if(f.checked && !(idApontar()&&idApontar().accountId)){ f.checked=false; abreIdentidade(); return; } a.soMeus=f.checked; }
    else if(campo==='fMinDias'){ a.fMinDias=Math.max(0, Number(f.value)||0); }
    else { a[campo]=f.value; }
    renderAlertas(); }
});
