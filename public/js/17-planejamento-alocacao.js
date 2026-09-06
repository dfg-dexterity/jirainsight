// Jira Insights · 17 · 🧮 PLANEJAMENTO MACRO (MVP legado) e 👥 ALOCAÇÃO por pessoa (semanas, gantt, simulação).
// As duas telas estão marcadas como "em reformulação" (renderIndisponivel) — o código fica para a volta.
// ====================== PLANEJAMENTO Semanal/Mensal — MVP 1 (montar o plano) ======================
// Plano de esforço de um projeto por FUNÇÃO. Implementação: fases = épicos do Jira;
// AMS/interno: projeto inteiro. Horas planejadas (função, fase) = horas da fase × % (1.35 = 135%).
// Realizado e custo (Odoo) vêm nas próximas entregas. Salvo no cfg (Supabase compartilhado).
const PLAN_TIPOS=[['implementacao','Implementação (fases = épicos)'],['ams','AMS (projeto inteiro)'],['interno','Interno (projeto inteiro)']];
function planRotuloTipo(t){ const o=PLAN_TIPOS.find(x=>x[0]===t); return o?o[1]:t; }
function planFunc(nome){ return { id:'f'+Math.random().toString(36).slice(2,8), nome:nome||'' }; }
function planFase(o){ return Object.assign({ id:'fa'+Math.random().toString(36).slice(2,8), epicoKey:'', nome:'', inicio:'', fim:'', horas:0, aloc:{} }, o||{}); }
function planNovo(){ return { id:'pl'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
  nome:'', projeto:'', tipo:'implementacao', jornadaH:8,
  funcoes:[planFunc('Gerente de Projeto'), planFunc('Consultor Sênior'), planFunc('Consultor Pleno')], fases:[], pessoasPorFuncao:{} }; }
function planDiasUteis(ini,fim){ if(!/^\d{4}-\d{2}-\d{2}$/.test(ini)||!/^\d{4}-\d{2}-\d{2}$/.test(fim)||fim<ini) return 0;
  let n=0,d=ini; for(let i=0;i<3000&&d<=fim;i++){ if(ehUtil(d)&&!ehFeriado(d)) n++; d=proxDia(d); } return n; }
// Horas planejadas de uma função numa fase = horas da fase × fração de alocação.
function planHorasFuncFase(fa, fid){ return (Number(fa.horas)||0) * (Number(fa.aloc[fid])||0); }
function planTotalGeral(d){ return (d.fases||[]).reduce((s,fa)=>s+(d.funcoes||[]).reduce((ss,fn)=>ss+planHorasFuncFase(fa,fn.id),0),0); }

// Lê os inputs atuais do editor de volta para o draft (antes de qualquer ação estrutural/salvar).
function planSyncDraft(){
  const d=estado.planejamento.draft; if(!d) return;
  const g=(s)=>document.querySelector(s);
  const nm=g('[data-pl-meta="nome"]'); if(nm) d.nome=nm.value;
  const pj=g('[data-pl-meta="projeto"]'); if(pj) d.projeto=pj.value;
  const tp=g('[data-pl-meta="tipo"]'); if(tp) d.tipo=tp.value;
  const jr=g('[data-pl-meta="jornada"]'); if(jr) d.jornadaH=Math.max(1,Number(jr.value)||8);
  document.querySelectorAll('[data-pl-func]').forEach(inp=>{ const fn=(d.funcoes||[]).find(x=>x.id===inp.getAttribute('data-pl-func')); if(fn) fn.nome=inp.value; });
  document.querySelectorAll('[data-pl-f]').forEach(inp=>{ const p=inp.getAttribute('data-pl-f').split('|'); const fa=d.fases[+p[1]]; if(!fa) return;
    if(p[0]==='horas') fa.horas=Math.max(0,Number(inp.value)||0); else fa[p[0]]=inp.value; });
  document.querySelectorAll('[data-pl-aloc]').forEach(inp=>{ const p=inp.getAttribute('data-pl-aloc').split('|'); const fa=d.fases[+p[0]]; if(!fa) return;
    const v=Number(inp.value); if(inp.value===''||isNaN(v)) delete fa.aloc[p[1]]; else fa.aloc[p[1]]=Math.max(0,v)/100; });
}
function planEditorHTML(d){
  const projs=(_projetosCache||[]).slice().sort((a,b)=>a.key.localeCompare(b.key));
  const projOpts='<option value="">— escolha o projeto —</option>'+projs.map(p=>`<option value="${escA(p.key)}" ${d.projeto===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('');
  const tipoOpts=PLAN_TIPOS.map(([v,l])=>`<option value="${v}" ${d.tipo===v?'selected':''}>${esc(l)}</option>`).join('');
  const ehImpl=d.tipo==='implementacao';
  const funcChips=(d.funcoes||[]).map(fn=>`<span class="pl-chip"><input type="text" data-pl-func="${escA(fn.id)}" value="${escA(fn.nome)}" placeholder="Função"><button class="pl-x" data-pl-func-del="${escA(fn.id)}" title="Remover função">×</button></span>`).join('');
  const thFunc=(d.funcoes||[]).map(fn=>`<th class="num">${esc(fn.nome||'—')}</th>`).join('');
  const rows=(d.fases||[]).map((fa,i)=>{
    const du=planDiasUteis(fa.inicio,fa.fim);
    const aloc=(d.funcoes||[]).map(fn=>{ const pct=Math.round((Number(fa.aloc[fn.id])||0)*100);
      return `<td class="num pl-alloc"><input type="number" class="pl-pct" data-pl-aloc="${i}|${escA(fn.id)}" value="${pct||''}" min="0" step="5" placeholder="0"><span>%</span></td>`; }).join('');
    return `<tr>
      <td><input type="text" class="pl-nm" data-pl-f="nome|${i}" value="${escA(fa.nome)}" placeholder="${ehImpl?'Fase':'Etapa'}">${fa.epicoKey?`<div class="muted small">🔗 ${esc(fa.epicoKey)}</div>`:''}</td>
      <td><input type="date" data-pl-f="inicio|${i}" value="${escA(fa.inicio)}"></td>
      <td><input type="date" data-pl-f="fim|${i}" value="${escA(fa.fim)}"></td>
      <td class="num muted">${du||'—'}</td>
      <td><input type="number" class="pl-h" data-pl-f="horas|${i}" value="${fa.horas||''}" min="0" step="0.5" placeholder="0"></td>
      ${aloc}
      <td class="num"><button class="pl-x" data-pl-row-del="${i}" title="Remover fase">×</button></td></tr>`;
  }).join('');
  const totFunc=(d.funcoes||[]).map(fn=>{ const t=(d.fases||[]).reduce((s,fa)=>s+planHorasFuncFase(fa,fn.id),0); return `<td class="num">${fmtH(Math.round(t*3600))}</td>`; }).join('');
  const totGeral=planTotalGeral(d);
  const carrEp=estado.planejamento.carregandoEpicos;
  return `<div class="card full">
    <div class="ams-dados-h"><strong>${d.nome?esc(d.nome):'Novo plano'}</strong><span class="spacer"></span>
      <button class="btn primario" data-pl-aba="editor">Editor</button><button class="btn" data-pl-aba="acomp">Planejado × Realizado</button>
      <button class="btn" data-pl-voltar="1">← Voltar</button></div>
    <div class="pl-meta">
      <div><label>Nome do plano</label><input type="text" data-pl-meta="nome" value="${escA(d.nome)}" placeholder="Ex.: TRM — Implementação 2026"></div>
      <div><label>Projeto (Jira)</label><select data-pl-meta="projeto">${projOpts}</select></div>
      <div><label>Tipo</label><select data-pl-meta="tipo">${tipoOpts}</select></div>
      <div><label>Jornada (h/dia)</label><input type="number" data-pl-meta="jornada" value="${d.jornadaH||8}" min="1" max="24" step="0.5"></div>
    </div>
    <div class="muted small" style="font-weight:600;margin:6px 0 2px">Funções</div>
    <div class="pl-chips">${funcChips}<button class="btn" data-pl-func-add="1">+ função</button></div>
    <div class="muted small" style="font-weight:600;margin:12px 0 2px">${ehImpl?'Fases (épicos)':'Etapas'}
      ${ehImpl?`<button class="btn" data-pl-epicos="1" ${carrEp?'disabled':''}>${carrEp?'puxando…':'⤓ Puxar fases dos épicos'}</button>`:''}
      <span class="muted" style="font-weight:400">· % por função (pode passar de 100%) · horas digitadas manualmente</span></div>
    <div class="pl-wrap"><table class="pl-tab"><thead><tr>
      <th>${ehImpl?'Fase':'Etapa'}</th><th>Início</th><th>Fim</th><th class="num">Dias úteis</th><th class="num">Horas</th>${thFunc}<th></th>
    </tr></thead><tbody>${rows||`<tr><td colspan="${6+(d.funcoes||[]).length}" class="muted small">Nenhuma ${ehImpl?'fase':'etapa'} ainda — ${ehImpl?'puxe os épicos ou ':''}clique em "+ adicionar".</td></tr>`}</tbody>
      <tfoot><tr class="pl-tot"><td colspan="4">Total planejado por função →</td><td class="num">${fmtH(Math.round((d.fases||[]).reduce((s,fa)=>s+(Number(fa.horas)||0),0)*3600))}</td>${totFunc}<td></td></tr></tfoot>
    </table></div>
    <div style="margin-top:10px"><button class="btn" data-pl-fase-add="1">+ adicionar ${ehImpl?'fase':'etapa'}</button></div>
    <div class="ams-fatura" style="margin-top:14px">
      <span class="muted small">Esforço total planejado: <strong>${fmtH(Math.round(totGeral*3600))}</strong></span><span class="spacer"></span>
      ${(cfg.planos||[]).some(p=>p.id===d.id)?'<button class="btn" data-pl-excluir="1">Excluir plano</button>':''}
      <button class="btn primario" data-pl-salvar="1">Salvar plano</button></div>
    <div class="muted small" style="margin-top:8px">Salvo na configuração compartilhada${idApontar()?'':' (identifique-se na aba Apontar para compartilhar com o time; por ora salva só neste navegador)'}.</div>
  </div>`;
}
function renderPlanejamento(){
  const cont=document.getElementById('conteudo');
  if(!_projetosCache && !estado.planejamento._carregandoProjs){ estado.planejamento._carregandoProjs=true;
    garanteProjetos().then(()=>{ estado.planejamento._carregandoProjs=false; if(estado.vista==='planejamento') renderPlanejamento(); })
      .catch(()=>{ estado.planejamento._carregandoProjs=false; }); }
  const pl=estado.planejamento;
  if(pl.draft){ cont.replaceChildren(el(`<div>${pl.aba==='acomp'?planAcompHTML(pl.draft):planEditorHTML(pl.draft)}</div>`)); return; }
  const planos=cfg.planos||[];
  const linhas=planos.length?planos.map(p=>{
    const tot=planTotalGeral(p);
    return `<div class="pl-item" data-pl-edit="${escA(p.id)}">
      <div><strong>${esc(p.nome||'(sem nome)')}</strong> <span class="muted small">· ${esc(p.projeto||'—')} · ${esc(planRotuloTipo(p.tipo))}</span></div>
      <div class="muted small">${(p.fases||[]).length} ${p.tipo==='implementacao'?'fase(s)':'etapa(s)'} · ${(p.funcoes||[]).length} função(ões) · <strong>${fmtH(Math.round(tot*3600))}</strong> planejadas</div></div>`;
  }).join(''):'<div class="muted small">Nenhum plano ainda. Crie o primeiro.</div>';
  cont.replaceChildren(el(`<div><div class="card full">
    <h2>📅 Planejamento <span>plano de horas por função · planejado × realizado</span></h2>
    <div class="muted small" style="margin:6px 0 12px">Monte o esforço de um projeto <strong>por função</strong> (ex.: Gerente de Projeto, Consultor Sênior). Em <strong>implementação</strong>, as fases são os <strong>épicos</strong> do Jira; em <strong>AMS/interno</strong>, planeja-se o projeto inteiro. <span class="muted">(MVP 1: montagem do plano — realizado e custo, via Odoo, vêm a seguir.)</span></div>
    <button class="btn primario" data-pl-novo="1">+ Novo plano</button>
    <div class="pl-list" style="margin-top:14px">${linhas}</div>
  </div></div>`));
}
// Puxa os épicos abertos do projeto e adiciona como fases (sem duplicar).
function planPuxaEpicos(){
  planSyncDraft(); const d=estado.planejamento.draft; if(!d) return;
  if(!d.projeto){ toast('Escolha o projeto primeiro.','warn'); return; }
  estado.planejamento.carregandoEpicos=true; renderPlanejamento();
  fetch('/api/projetos?epicos='+encodeURIComponent(d.projeto)).then(r=>r.json()).then(j=>{
    estado.planejamento.carregandoEpicos=false;
    const eps=(j&&j.epicos)||[]; const jaTem=new Set((d.fases||[]).map(f=>f.epicoKey).filter(Boolean));
    let add=0; eps.forEach(e=>{ if(e.k && !jaTem.has(e.k)){ d.fases.push(planFase({epicoKey:e.k, nome:e.resumo||e.k})); add++; } });
    toast(add?`✓ ${add} épico(s) adicionado(s) como fase.`:'Nenhum épico novo (ou projeto sem épicos abertos).', add?'ok':'info');
    if(estado.vista==='planejamento') renderPlanejamento();
  }).catch(e=>{ estado.planejamento.carregandoEpicos=false; toast(humanizaErro(e),'err'); if(estado.vista==='planejamento') renderPlanejamento(); });
}
function planSalva(){
  planSyncDraft(); const d=estado.planejamento.draft; if(!d) return;
  if(!d.nome.trim()){ toast('Dê um nome ao plano.','warn'); return; }
  if(!d.projeto){ toast('Escolha o projeto do plano.','warn'); return; }
  cfg.planos=cfg.planos||[];
  const i=cfg.planos.findIndex(p=>p.id===d.id);
  if(i>=0) cfg.planos[i]=JSON.parse(JSON.stringify(d)); else cfg.planos.push(JSON.parse(JSON.stringify(d)));
  salvaCfg(); toast('✓ Plano salvo.','ok'); estado.planejamento.draft=null; renderPlanejamento();
}
// ---- MVP 2: Planejado × Realizado (atribuir pessoas → função + comparar com apontamentos) ----
function planPeriodo(d){ let ini='',fim='';
  (d.fases||[]).forEach(fa=>{ if(/^\d{4}-\d{2}-\d{2}$/.test(fa.inicio)&&(!ini||fa.inicio<ini)) ini=fa.inicio;
    if(/^\d{4}-\d{2}-\d{2}$/.test(fa.fim)&&(!fim||fa.fim>fim)) fim=fa.fim; });
  return { ini, fim }; }
function planRealKey(d){ const p=planPeriodo(d); return (d.projeto||'')+'|'+p.ini+'|'+p.fim; }
// Realizado (seg) por fase×função: apontamentos das pessoas da função, no épico da fase
// (implementação) ou no projeto (AMS/interno), dentro do período da fase.
function planRealizadoMapa(d){
  const wl=(estado.planejamento.real.wl)||[]; const proj=d.projeto; const pess=d.pessoasPorFuncao||{}; const ehImpl=d.tipo==='implementacao';
  const map={};
  (d.fases||[]).forEach(fa=>{ (d.funcoes||[]).forEach(fn=>{
    const set=new Set(pess[fn.id]||[]); let seg=0;
    if(set.size) wl.forEach(w=>{ if(w.p!==proj||!set.has(w.a)) return;
      if(ehImpl && (!fa.epicoKey || w.e!==fa.epicoKey)) return;
      const dia=(w.d||'').slice(0,10); if(fa.inicio&&dia<fa.inicio) return; if(fa.fim&&dia>fa.fim) return;
      seg+=Number(w.s)||0; });
    map[fa.id+'|'+fn.id]=seg; }); });
  return map; }
function planCarregaReal(d, forca){
  const per=planPeriodo(d); if(!per.ini||!per.fim) return;
  const r=estado.planejamento.real; const key=planRealKey(d);
  if(!forca && r.range===key && r.wl) return;
  r.carregando=true; r.erro=''; r.range=key; renderPlanejamento();
  fetch(`/api/tempo?desde=${encodeURIComponent(per.ini)}&ate=${encodeURIComponent(per.fim)}`).then(x=>x.json()).then(j=>{
    r.carregando=false; if(j.erro){ r.erro=humanizaErro(j.erro); r.wl=null; } else { r.wl=j.worklogs||[]; }
    if(estado.vista==='planejamento') renderPlanejamento();
  }).catch(e=>{ r.carregando=false; r.erro=humanizaErro(e); r.wl=null; if(estado.vista==='planejamento') renderPlanejamento(); }); }
function planRealizadoTabela(d){
  const map=planRealizadoMapa(d); const ehImpl=d.tipo==='implementacao';
  const headFunc=(d.funcoes||[]).map(fn=>`<th class="num">${esc(fn.nome||'—')}</th>`).join('');
  let totPlan=0,totReal=0;
  const cel=(plan,real)=>{ const pct=plan?Math.round(real/plan*100):(real?'—':0);
    const cor=plan?(real>plan*1.1?'#C77700':(real>=plan*0.9?'#188918':'var(--grafite)')):'var(--muted)';
    return `<td class="num"><span style="color:${cor};font-weight:600">${fmtH(real)}</span> <span class="muted">/ ${fmtH(plan)}${plan?` · ${pct}%`:''}</span></td>`; };
  const rows=(d.fases||[]).map(fa=>{ const cells=(d.funcoes||[]).map(fn=>{ const plan=planHorasFuncFase(fa,fn.id)*3600, real=map[fa.id+'|'+fn.id]||0; totPlan+=plan; totReal+=real; return cel(plan,real); }).join('');
    return `<tr><td>${esc(fa.nome||'—')}${fa.epicoKey?` <span class="muted small">🔗${esc(fa.epicoKey)}</span>`:''}</td>${cells}</tr>`; }).join('');
  const totFunc=(d.funcoes||[]).map(fn=>{ let p=0,r=0; (d.fases||[]).forEach(fa=>{ p+=planHorasFuncFase(fa,fn.id)*3600; r+=map[fa.id+'|'+fn.id]||0; }); return cel(p,r); }).join('');
  const ades=totPlan?Math.round(totReal/totPlan*100):0;
  return `<div class="ams-kpis" style="margin-bottom:12px">
      <div class="ams-k"><div class="v">${fmtH(totPlan)}</div><div class="l">Planejado</div></div>
      <div class="ams-k"><div class="v">${fmtH(totReal)}</div><div class="l">Realizado</div></div>
      <div class="ams-k"><div class="v">${ades}%</div><div class="l">Aderência</div></div>
      <div class="ams-k"><div class="v">${fmtH(Math.max(0,totPlan-totReal))}</div><div class="l">Saldo a fazer</div></div></div>
    <div class="pl-wrap"><table class="pl-tab"><thead><tr><th>${ehImpl?'Fase':'Etapa'}</th>${headFunc}</tr></thead>
      <tbody>${rows||`<tr><td colspan="${1+(d.funcoes||[]).length}" class="muted small">Sem fases no plano.</td></tr>`}</tbody>
      <tfoot><tr class="pl-tot"><td>Total</td>${totFunc}</tr></tfoot></table></div>
    <div class="muted small" style="margin-top:6px">Cada célula: <strong>realizado / planejado · %</strong>. Realizado = tarefas ${ehImpl?'do épico da fase':'do projeto'}, das pessoas de cada função, no período. <button class="btn" data-pl-real-recarrega="1">↻ recarregar</button></div>`;
}
function planAcompHTML(d){
  const per=planPeriodo(d); const r=estado.planejamento.real;
  const pess=pessoasUnidas(); const pord=Object.entries(pess).filter(([a,p])=>!RE_EXCLUIR.test((p&&p.nome)||'')).sort((x,y)=>((x[1].nome||'')).localeCompare((y[1].nome||''),'pt'));
  d.pessoasPorFuncao=d.pessoasPorFuncao||{};
  const atrib=(d.funcoes||[]).map(fn=>{ const ids=d.pessoasPorFuncao[fn.id]||[];
    const chips=ids.map(a=>`<span class="pl-chip" style="padding-left:10px">${esc((pess[a]&&pess[a].nome)||a)}<button class="pl-x" data-pl-pess-del="${escA(fn.id)}|${escA(a)}" title="Remover">×</button></span>`).join('');
    const opts='<option value="">+ pessoa…</option>'+pord.filter(([a])=>!ids.includes(a)).map(([a,p])=>`<option value="${escA(a)}">${esc(p.nome||a)}</option>`).join('');
    return `<div class="pl-atr"><div class="pl-atr-f">${esc(fn.nome||'—')}</div><div class="pl-chips">${chips}<select class="pl-pess-add" data-pl-pess-add="${escA(fn.id)}">${opts}</select></div></div>`; }).join('');
  let res='';
  if(!per.ini||!per.fim) res='<div class="muted small">Defina Início/Fim nas fases (aba Editor) para calcular o realizado.</div>';
  else if(r.carregando) res='<div class="estado">Carregando apontamentos do período…</div>';
  else if(r.erro) res=`<div class="aviso">${esc(r.erro)} <button class="btn" data-pl-real-recarrega="1">tentar de novo</button></div>`;
  else if(!r.wl || r.range!==planRealKey(d)) res=`<button class="btn primario" data-pl-real="1">Calcular realizado · ${esc(fmtBR(per.ini))}–${esc(fmtBR(per.fim))}</button>`;
  else res=planRealizadoTabela(d);
  return `<div class="card full">
    <div class="ams-dados-h"><strong>${esc(d.nome||'Plano')}</strong><span class="spacer"></span>
      <button class="btn" data-pl-aba="editor">Editor</button><button class="btn primario" data-pl-aba="acomp">Planejado × Realizado</button>
      <button class="btn" data-pl-voltar="1">← Voltar</button></div>
    <div class="muted small" style="font-weight:600;margin:8px 0 6px">👥 Pessoas por função <span class="muted" style="font-weight:400">(quem realiza cada papel — usado para somar os apontamentos)</span></div>
    <div class="pl-atrs">${atrib||'<div class="muted small">Cadastre funções na aba Editor primeiro.</div>'}</div>
    <div style="margin-top:16px">${res}</div></div>`;
}
// ====================== ALOCAÇÃO MACRO — Visão por Pessoa (capacidade × utilização) ======================
// Aloca pessoas a PROJETOS por período, em HORAS/SEMANA. A grade mostra a utilização por
// pessoa × semana/mês: alocado ÷ capacidade (jornada − fins de semana/feriados/ausências),
// com status em 4 níveis (≤80 disponível · 80–100 saudável · 100–120 atenção · >120 crítico).
function alocNova(){ return { id:'al'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), accountId:'', projeto:'', tipo:'faturavel', funcao:'', inicio:'', fim:'', hSemana:20 }; }
function alocRows(){ if(!estado.alocacao.rows) estado.alocacao.rows=JSON.parse(JSON.stringify(cfg.alocacoes||[])).map(a=>{
    if(a.hSemana==null) a.hSemana = a.pct!=null ? Math.round((Number(a.pct)||0)/100*40) : 0; if(a.tipo==null) a.tipo='faturavel';
    if(!a.id) a.id='al'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); return a; }); return estado.alocacao.rows; }
// Tipos de alocação (para a visão de capacidade da empresa). Os 3 primeiros contam como faturável.
const ALOC_TIPOS=[['faturavel','Faturável'],['fechado','Projeto fechado'],['ams','AMS'],['prevenda','Pré-venda'],['interno','Interno'],['treino','Treinamento']];
const ALOC_FAT=new Set(['faturavel','fechado','ams']);
// Tipo/categoria definido POR PROJETO (aba Projetos → cfg.projTipos); a linha guarda
// um fallback (alocações antigas / projeto ainda sem cadastro).
function alocTipoDe(x){ return (x&&x.projeto&&(cfg.projTipos||{})[x.projeto]) || (x&&x.tipo) || 'faturavel'; }
// Função da pessoa NAQUELA alocação (permite a mesma pessoa 2× no mesmo projeto com
// funções diferentes); sem função explícita, vale a skill principal da pessoa.
function alocFuncaoDe(x){ return (x&&x.funcao) || alocSkillPrim(x&&x.accountId); }
// ---- Pessoas planejadas (ainda não contratadas): planeje a vaga antes de contratar ----
function ppLista(){ if(!Array.isArray(cfg.pessoasPlanejadas)) cfg.pessoasPlanejadas=[]; return cfg.pessoasPlanejadas; }
function ppDe(a){ return String(a||'').startsWith('plan_') ? ppLista().find(p=>p.id===a) : null; }
function ppNova(){ return { id:'plan_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), nome:'', skills:[], hSem:40, custoH:0, inicio:'', obs:'' }; }
// Pessoas da ALOCAÇÃO = pessoas reais (Jira/Clockwork) + planejadas (🔮 no nome).
// Só a Alocação usa isto — as demais telas continuam vendo apenas pessoas reais.
function alocPessoas(){ const out=Object.assign({}, pessoasUnidas());
  ppLista().forEach(p=>{ out[p.id]={ nome:(p.nome||'A contratar')+' 🔮' }; }); return out; }
// ---- Trava + aprovação (Diego): congela a alocação de uma pessoa até aprovar ----
// cfg.alocTravas[accountId] = { status:'pendente'|'aprovado', por, quando, aprovadoPor?, quandoAprov? }
function alocTravaDe(a){ return (cfg.alocTravas||{})[a]||null; }
function alocTravada(a){ return !!alocTravaDe(a); }
// Gestores/aprovadores por CONFIGURAÇÃO (cfg.gestores: accountIds ou e-mails,
// editável em ⚙️ Configurações). Sem lista configurada, cai no aprovador legado
// (nome/e-mail contendo "diego") para não travar a operação atual.
function souAprovador(){ const id=idApontar(); if(!id) return false;
  const gs=(cfg.gestores||[]).map(x=>String((x&&(x.a||x.email))||x||'').trim().toLowerCase()).filter(Boolean);
  if(gs.length) return gs.includes(String(id.accountId||'').toLowerCase())||gs.includes(String(id.email||'').toLowerCase());
  return /diego/i.test((id.nome||'')+' '+(id.email||'')); }
function alocTravaBloqueia(a, avisa){
  if(!alocTravada(a)) return false;
  if(avisa!==false){ const t=alocTravaDe(a);
    try{ toast(`🔒 Alocações travadas ${t&&t.status==='aprovado'?'(aprovadas pelo Diego)':'— aguardando aprovação do Diego'}. Destrave no cabeçalho da pessoa para editar.`,'warn'); }catch(_){} }
  return true;
}
// Conflito: MESMA pessoa, MESMO projeto e MESMA função com períodos sobrepostos.
// (Funções diferentes no mesmo projeto continuam permitidas — cada função é uma linha.)
function alocConflitoDe(rows, x){
  if(!x||!x.accountId||!x.projeto) return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(x.inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(x.fim)) return null;
  return rows.find(y=> y.id!==x.id && y.accountId===x.accountId && y.projeto===x.projeto
    && String(y.funcao||'')===String(x.funcao||'')
    && /^\d{4}-\d{2}-\d{2}$/.test(y.inicio) && /^\d{4}-\d{2}-\d{2}$/.test(y.fim)
    && y.inicio<=x.fim && y.fim>=x.inicio) || null;
}
function alocAvisaConflito(cf){
  try{ toast(`✕ Conflito: essa pessoa já está alocada neste projeto${cf.funcao?` como ${cf.funcao}`:''} em ${dataBR(cf.inicio)} – ${dataBR(cf.fim)}. Ajuste o período ou use uma FUNÇÃO diferente.`,'err'); }catch(_){}
}
// Custo/hora da pessoa: vaga usa o custo previsto do cadastro; pessoa real usa
// cfg.custosPessoa (manual ou importado do Odoo). 0 = sem custo cadastrado.
function alocCustoH(a){ const pp=ppDe(a); if(pp) return Math.max(0,Number(pp.custoH)||0);
  return Math.max(0,Number((cfg.custosPessoa||{})[a])||0); }
// Semana nominal (h) da pessoa = jornada de Metas × 5 dias — base da conversão % ↔ h/sem.
// Pessoa planejada usa a capacidade cadastrada na vaga.
function alocSemNomH(a){ const pp=ppDe(a); if(pp) return Math.max(0,Number(pp.hSem)||40); return metaSegDe(a)/3600*5; }
function alocPctDe(a, h){ const n=alocSemNomH(a); return n?Math.round((Number(h)||0)/n*100):0; }
// Board por pessoa: toda alteração persiste na hora (config compartilhada), sem botão "salvar".
function alocPersiste(){ cfg.alocacoes=JSON.parse(JSON.stringify(estado.alocacao.rows||[])); salvaCfg(); }
function alocH(h){ return (Math.round((h||0)*10)/10).toLocaleString('pt-BR')+'h'; }
// Semanas (segunda-feira) do horizonte das alocações (com folga à frente).
function alocSemanas(rows){
  let ini='',fim=''; rows.forEach(a=>{ if(/^\d{4}-\d{2}-\d{2}$/.test(a.inicio)&&(!ini||a.inicio<ini)) ini=a.inicio; if(/^\d{4}-\d{2}-\d{2}$/.test(a.fim)&&(!fim||a.fim>fim)) fim=a.fim; });
  const hoje=hojeSP(); if(!ini) ini=hoje; if(!fim) fim=somaDias(ini,7*7);
  let w=semChave(ini); const wFim=semChave(fim); const out=[]; let g=0;
  while(w<=wFim && g<78){ out.push(w); w=somaDias(w,7); g++; }
  while(out.length<6 && g<78){ out.push(somaDias(out[out.length-1],7)); g++; }
  return out; }
// Capacidade (h) de uma pessoa numa semana: dias úteis (não feriado, não ausência) × jornada.
// Pessoa planejada: h/sem da vaga ÷ 5, e capacidade ZERO antes do início previsto.
function alocCapacSemana(a, w){
  const pp=ppDe(a);
  if(pp){ const jor=Math.max(0,Number(pp.hSem)||40)/5; let h=0;
    for(let i=0;i<7;i++){ const d=somaDias(w,i); if(!ehUtil(d)||ehFeriado(d)) continue;
      if(pp.inicio && d<pp.inicio) continue; h+=jor; } return h; }
  const jor=metaSegDe(a)/3600; let h=0;
  for(let i=0;i<7;i++){ const d=somaDias(w,i); if(ehUtil(d)&&!ehFeriado(d)&&!ehAusencia(a,d)) h+=jor; } return h; }
// Alocado (h/semana) de uma pessoa numa semana = soma das alocações ativas naquela semana.
function alocAlocadoSemana(rows, a, w){ const wi=w, wf=somaDias(w,6); let h=0;
  rows.forEach(x=>{ if(x.accountId!==a) return; if(!/^\d{4}-\d{2}-\d{2}$/.test(x.inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(x.fim)) return;
    if(x.inicio<=wf && x.fim>=wi) h+=Number(x.hSemana)||0; }); return h; }
function alocStatus(u){ if(u<=0) return ['','—']; if(u<80) return ['disp','Disponível']; if(u<=100) return ['saud','Saudável']; if(u<=120) return ['aten','Atenção']; return ['crit','Crítico']; }
// Matriz pessoa × coluna (semana ou mês) com {cap, al} por célula + totais por pessoa.
function alocMatriz(rows, gran){
  const semanas=alocSemanas(rows); let cols;
  if(gran==='mes'){ const ms=[]; semanas.forEach(w=>{ const ym=w.slice(0,7); if(!ms.includes(ym)) ms.push(ym); });
    cols=ms.map(ym=>({key:ym, label:labelMesAbbr(ym), semanas:semanas.filter(w=>w.slice(0,7)===ym)})); }
  else cols=semanas.map(w=>({key:w, label:fmtBR(w).slice(0,5), semanas:[w]}));
  const pessoas=[...new Set(rows.map(a=>a.accountId).filter(Boolean))];
  const dados={}; pessoas.forEach(a=>{ dados[a]={cols:{},capTot:0,alTot:0};
    cols.forEach(c=>{ let cap=0,al=0; c.semanas.forEach(w=>{ cap+=alocCapacSemana(a,w); al+=alocAlocadoSemana(rows,a,w); });
      dados[a].cols[c.key]={cap,al}; dados[a].capTot+=cap; dados[a].alTot+=al; }); });
  return { cols, pessoas, dados, nSem:semanas.length };
}
// ---- Fase B: Visão por Projeto (equipe + planejado × apontado) ----
function alocPeriodo(rows){ let ini='',fim=''; rows.forEach(a=>{ if(/^\d{4}-\d{2}-\d{2}$/.test(a.inicio)&&(!ini||a.inicio<ini)) ini=a.inicio; if(/^\d{4}-\d{2}-\d{2}$/.test(a.fim)&&(!fim||a.fim>fim)) fim=a.fim; }); return {ini,fim}; }
function alocRealKey(rows){ const p=alocPeriodo(rows); return p.ini+'|'+p.fim; }
function alocCarregaReal(rows, forca){
  const p=alocPeriodo(rows); if(!p.ini||!p.fim){ toast('Defina os períodos das alocações para calcular o apontado.','warn'); return; }
  const r=estado.alocacao.real; const key=alocRealKey(rows); if(!forca && r.range===key && r.wl) return;
  r.carregando=true; r.erro=''; r.range=key; renderAlocacao();
  fetch(`/api/tempo?desde=${encodeURIComponent(p.ini)}&ate=${encodeURIComponent(p.fim)}`).then(x=>x.json()).then(j=>{
    r.carregando=false; if(j.erro){ r.erro=humanizaErro(j.erro); r.wl=null; } else r.wl=j.worklogs||[];
    if(estado.vista==='alocacao') renderAlocacao();
  }).catch(e=>{ r.carregando=false; r.erro=humanizaErro(e); r.wl=null; if(estado.vista==='alocacao') renderAlocacao(); });
}
// ---- 📆 Semanas: planejado TRAVADO por semana × realizado (nº da semana do ano) ----
// Semana ISO 8601 (segunda a domingo; a quinta-feira define o ano) — ex.: S31/2026.
function isoSemana(w){
  const dt=new Date(w+'T12:00:00-03:00');
  const qui=new Date(dt); qui.setUTCDate(dt.getUTCDate()+3-((dt.getUTCDay()+6)%7));
  const ano=qui.getUTCFullYear();
  const jan4=new Date(Date.UTC(ano,0,4,12));
  const seg1=new Date(jan4); seg1.setUTCDate(jan4.getUTCDate()-((jan4.getUTCDay()+6)%7));
  return { ano, num: Math.floor((qui-seg1)/(7*86400000))+1 };
}
function semTravaKey(w){ const s=isoSemana(w); return `${s.ano}-W${String(s.num).padStart(2,'0')}`; }
function alocSemTravaDe(w){ return (cfg.alocSemTravas||{})[semTravaKey(w)]||null; }
// Horas planejadas "ao vivo" por pessoa numa semana (direto das alocações atuais).
function alocSemHorasVivas(rows, w){
  const horas={};
  [...new Set(rows.map(a=>a.accountId).filter(Boolean))].forEach(a=>{
    const h=alocAlocadoSemana(rows,a,w); if(h>0) horas[a]=h; });
  return horas;
}
// Planejado por pessoa numa semana: TRAVADA → snapshot congelado; aberta → das alocações.
function alocSemPlanejado(rows, w){
  const tv=alocSemTravaDe(w);
  if(tv&&tv.horas) return { travada:tv, horas:Object.assign({},tv.horas) };
  return { travada:null, horas:alocSemHorasVivas(rows,w) };
}
// Planejamento da equipe por faixa de semanas (modelo NOVO, via API — uma chamada
// para o intervalo inteiro). Cache em estado.minhasemana.equipe[w] = {acc:{h,st,nome}}.
function mpGaranteEquipe(semanas){
  const mp=estado.minhasemana; mp.equipe=mp.equipe||{};
  const falta=semanas.filter(w=>mp.equipe[w]===undefined);
  if(!falta.length||mp.equipeB) return;
  const id=idApontar(); if(!id||!id.accountId) return;
  mp.equipeB=1;
  const de=falta.slice().sort()[0], ate=falta.slice().sort().pop();
  mpApi({acao:'semana', semana:de, de, ate}).then(j=>{ mp.equipeB=0;
    falta.forEach(w=>{ mp.equipe[w]=mp.equipe[w]||{}; });
    if(j&&j.ok) (j.planos||[]).forEach(p=>{ const w=p.semana||de;
      (mp.equipe[w]=mp.equipe[w]||{})[p.accountId]={ h:Number(p.total)||0, st:p.status, nome:p.nome||'' }; });
    if(estado.vista==='alocacao') renderAlocacao();
  }).catch(()=>{ mp.equipeB=0; falta.forEach(w=>{ mp.equipe[w]=mp.equipe[w]||{}; }); });
}
// Plano da equipe numa semana: modelo novo (Meu Planejamento) com fallback no
// legado por tickets (cfg.planosSemana) para semanas antigas.
function alocSemPlanoEquipe(w){
  const por={};
  const suf='|'+semTravaKey(w);
  Object.entries(cfg.planosSemana||{}).forEach(([k,p])=>{
    if(!k.endsWith(suf)||!p) return;
    const acc=k.slice(0,k.length-suf.length);
    por[acc]={ h:msTotalItens(p.itens||[],w), st:msStatus(p), nome:p.nome||'', legado:true };
  });
  const novo=(estado.minhasemana.equipe||{})[w];
  if(novo) Object.entries(novo).forEach(([acc,v])=>{ por[acc]=v; });   // novo modelo prevalece
  return por;
}
// Ícone/rótulo curto do status do plano (visão do gestor) — modelo novo + legado.
function alocSemStIcone(st){
  return st==='enviado'?'<span class="ms-st ms-st-e" data-tip="Enviado — decida em Meu Planejamento → Aprovações">📤</span>'
    :st==='aprovado'?'<span class="ms-st ms-st-a" data-tip="Planejamento aprovado">✅</span>'
    :(st==='recusado'||st==='devolvido')?'<span class="ms-st ms-st-x" data-tip="Devolvido para ajustes">↩</span>'
    :'<span class="muted small" data-tip="Em elaboração — a pessoa ainda não enviou">…</span>';
}
// Realizado (h) por pessoa numa semana, a partir dos worklogs já carregados (Clockwork).
function alocSemRealizado(w){
  const wl=(estado.alocacao.real&&estado.alocacao.real.wl)||null; if(!wl) return null;
  const wf=somaDias(w,6); const horas={};
  wl.forEach(x=>{ const d=(x.d||'').slice(0,10); if(d>=w&&d<=wf&&x.a) horas[x.a]=(horas[x.a]||0)+(Number(x.s)||0)/3600; });
  return horas;
}
function alocViewSemanas(rows, pess){
  const nm=(a)=>(pess[a]&&pess[a].nome)||a;
  const semanas=alocSemanas(rows);
  mpGaranteEquipe(semanas);   // planejamentos do modelo novo (uma chamada p/ a faixa)
  const wHoje=semChave(hojeSP());
  const r=estado.alocacao.real;
  if(!r.wl && !r.carregando && !r.erro && rows.length) alocCarregaReal(rows,false);
  const alocIds=new Set(rows.map(a=>a.accountId).filter(Boolean));
  const aberta=estado.alocacao.semAberta||{};
  const corDl=(dl)=> dl==null?'inherit':(dl<0?'#b45309':dl>0?'#166534':'inherit');
  const linhas=semanas.map(w=>{
    const {ano,num}=isoSemana(w);
    const plano=alocSemPlanejado(rows,w);
    const planH=Object.values(plano.horas).reduce((s,h)=>s+h,0);
    const realPor=alocSemRealizado(w);
    let realH=null;
    if(realPor){ realH=0; Object.entries(realPor).forEach(([a,h])=>{ if(alocIds.has(a)) realH+=h; }); }
    const delta=realH==null?null:realH-planH;
    const pctR=(realH==null||!planH)?null:Math.round(realH/planH*100);
    // Plano da equipe (📋 Minha Semana): horas distribuídas nos tickets pelas pessoas alocadas.
    const plEq=alocSemPlanoEquipe(w);
    let plEqH=0, nPlan=0, nEnv=0; const nAloc=Object.keys(plano.horas).length;
    Object.keys(plano.horas).forEach(a=>{ const pe=plEq[a]; if(pe&&pe.h>0){ plEqH+=pe.h; nPlan++; if(pe.st==='enviado') nEnv++; } });
    const tv=plano.travada;
    const badge=tv
      ?`<span class="badge com-horas" data-tip="Planejado congelado — edições nas alocações não mudam esta semana">🔒 travada ${esc(fmtBR((tv.quando||'').slice(0,10)))}${tv.porNome?` por ${esc(String(tv.porNome).split('@')[0])}`:''}</span>`
      :'<span class="badge" data-tip="O planejado ainda segue as alocações atuais">aberta</span>';
    const acao=tv
      ?`<button class="btn" data-al-semdestravar="${escA(w)}" data-tip="Remove a trava — o planejado volta a seguir as alocações">🔓 Destravar</button>`
      :`<button class="btn ${w<=wHoje?'primario':''}" data-al-semtravar="${escA(w)}" data-tip="Congela o planejado desta semana como está agora">🔒 Travar</button>`;
    let drill='';
    if(aberta[w]){
      const ids=[...new Set([...Object.keys(plano.horas), ...Object.keys(plEq).filter(a=>alocIds.has(a)), ...Object.keys(realPor||{}).filter(a=>alocIds.has(a))])];
      const aprovo=souAprovador();
      const rws=ids.map(a=>{ const p=plano.horas[a]||0; const pe=plEq[a]; const pl=(pe&&pe.h)||0; const re=realPor?(realPor[a]||0):null;
        // Δ contra o PLANO da pessoa quando ela planejou; senão contra o alocado.
        return { a, p, pl, st:(pe&&pe.st)||'', re, dl: re==null?null:re-(pl>0?pl:p) };
      }).sort((x,y)=>(y.p-x.p)||((y.re||0)-(x.re||0)));
      drill=`<tr class="al-sem-drill"><td colspan="8"><div class="scroll-x"><table><thead><tr><th>Pessoa</th><th class="num">Alocado</th><th class="num" data-tip="Horas que a pessoa distribuiu nos tickets (📋 Minha Semana); rotinas contam h/dia × dias úteis">Plano</th><th>Situação</th><th class="num">Realizado</th><th class="num" data-tip="Realizado − plano (ou − alocado, se não planejou)">Δ</th><th></th></tr></thead><tbody>${
        rws.map(x=>`<tr><td>${esc(nm(x.a))}</td><td class="num">${alocH(x.p)}</td><td class="num">${x.pl>0?alocH(x.pl):(x.p>0?'<span class="badge ms-b-sem" data-tip="Ainda não montou o plano em 📋 Minha Semana">sem plano</span>':'—')}</td><td>${x.pl>0?alocSemStIcone(x.st):''}${aprovo&&x.st==='enviado'?` <button class="btn primario" data-al-plaprova="${escA(x.a)}|${escA(w)}" data-tip="Aprovar o plano desta pessoa">✔ Aprovar</button> <button class="btn" data-al-plrecusa="${escA(x.a)}|${escA(w)}" data-tip="Recusar (com motivo) — a pessoa ajusta e reenvia">✖ Recusar</button>`:''}</td><td class="num">${x.re==null?'…':alocH(x.re)}</td><td class="num" style="color:${corDl(x.dl)}">${x.dl==null?'—':(x.dl>0?'+':'')+alocH(x.dl)}</td><td>${(x.pl>0||(x.re||0)>0)?`<button class="btn" data-al-semtk="${escA(x.a)}|${escA(w)}" data-tip="Plano × apontado por TICKET desta pessoa nesta semana">🔎 tickets</button>`:''}</td></tr>`).join('')
        ||'<tr><td colspan="7" class="muted">Nada nesta semana.</td></tr>'}</tbody></table></div></td></tr>`;
    }
    return `<tr class="proj-linha ${w===wHoje?'al-sem-atual':''}" data-al-semtoggle="${escA(w)}" data-tipk="clique para abrir por pessoa">
      <td><strong>S${num}</strong><span class="muted small">/${ano}</span></td>
      <td>${esc(fmtBR(w).slice(0,5))}–${esc(fmtBR(somaDias(w,6)).slice(0,5))}${w===wHoje?' <span class="badge com-horas">atual</span>':''}</td>
      <td class="num"><strong>${alocH(planH)}</strong></td>
      <td class="num" data-tip="${nPlan}/${nAloc} pessoa(s) alocada(s) montaram o plano em 📋 Minha Semana${nEnv?` · ${nEnv} aguardando aprovação`:''}">${plEqH>0?alocH(plEqH):'—'}${nAloc?` <span class="muted small">${nPlan}/${nAloc}</span>`:''}${nEnv?` <span class="badge ms-b-sem" data-tip="${nEnv} plano(s) enviados aguardando SUA aprovação — abra a semana">📤 ${nEnv}</span>`:''}</td>
      <td class="num">${realH==null?(r.carregando?'…':'—'):alocH(realH)}</td>
      <td class="num" style="color:${corDl(delta)}">${delta==null?'—':(delta>0?'+':'')+alocH(delta)}</td>
      <td class="num">${pctR==null?'—':pctR+'%'}</td>
      <td style="white-space:nowrap">${badge} ${acao}</td></tr>${drill}`;
  }).join('');
  const nota=r.erro
    ?`<div class="estado">Falha ao carregar o realizado: ${esc(r.erro)} <button class="btn" data-al-real="1">Tentar de novo</button></div>`
    :'';
  return `<div class="muted small" style="margin:6px 0 10px">Cada linha é uma <strong>semana do ano</strong> (ISO, seg–dom). <strong>Alocado</strong> = horas da Alocação (🔒 Travar congela como está — é a validação semanal). <strong>Plano</strong> = horas que cada pessoa distribuiu nos próprios tickets em <strong>📋 Minha Semana</strong>. <strong>Realizado</strong> = Clockwork das pessoas alocadas. Abra a semana para ver por pessoa e 🔎 por ticket. <button class="btn" data-al-real="1" style="margin-left:6px">↻ Atualizar realizado</button> <button class="btn" data-al-semcsv="1">⬇ CSV</button></div>
    ${nota}
    <div class="scroll-x"><table><thead><tr><th>Semana</th><th>Período</th><th class="num">Alocado</th><th class="num" data-tip="Soma dos planos individuais (📋 Minha Semana) das pessoas alocadas">Plano</th><th class="num">Realizado</th><th class="num" data-tip="Realizado − alocado">Δ</th><th class="num">Real/Plan</th><th>Trava</th></tr></thead><tbody>${linhas||'<tr><td colspan="8" class="muted">Sem alocações cadastradas.</td></tr>'}</tbody></table></div>`;
}
function alocViewProjeto(rows, pess){
  const semanas=alocSemanas(rows); const r=estado.alocacao.real; const nm=(a)=>(pess[a]&&pess[a].nome)||a;
  const porProj={}; rows.forEach(a=>{ if(a.projeto){ (porProj[a.projeto]=porProj[a.projeto]||[]).push(a); } });
  const projetos=Object.keys(porProj).sort();
  // nome do projeto: helper global projNome()
  const apont={}; if(r.wl) r.wl.forEach(w=>{ if(w.p) apont[w.p]=(apont[w.p]||0)+(Number(w.s)||0); });
  const temAp=!!r.wl && r.range===alocRealKey(rows);
  const rowsHtml=projetos.map(k=>{
    const als=porProj[k]; const porPessoa={};
    als.forEach(a=>{ if(a.accountId) porPessoa[a.accountId]=(porPessoa[a.accountId]||0)+(Number(a.hSemana)||0); });
    const equipe=Object.entries(porPessoa).sort((x,y)=>nm(x[0]).localeCompare(nm(y[0]),'pt')).map(([a,h])=>`${esc(nm(a))} <span class="muted">${alocH(h)}/sem</span>`).join(' · ')||'<span class="muted">—</span>';
    let plan=0; semanas.forEach(w=>{ const wf=somaDias(w,6); als.forEach(a=>{ if(/^\d{4}-\d{2}-\d{2}$/.test(a.inicio)&&/^\d{4}-\d{2}-\d{2}$/.test(a.fim)&&a.inicio<=wf&&a.fim>=w) plan+=Number(a.hSemana)||0; }); });
    const ap=(apont[k]||0)/3600; const pct=plan?Math.round(ap/plan*100):0;
    return `<tr><td><strong>${esc(projNome(k))}</strong></td><td>${equipe}</td>
      <td class="num">${alocH(plan)}</td>
      <td class="num">${temAp?`${alocH(ap)}${plan?` <span class="muted">· ${pct}%</span>`:''}`:'<span class="muted">—</span>'}</td>
      <td class="num"${temAp&&plan&&ap>plan?' style="color:#C77700"':''}>${temAp?alocH(Math.max(0,plan-ap)):'<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  const per=alocPeriodo(rows); let head='';
  if(r.carregando) head='<div class="estado">Carregando apontamentos…</div>';
  else if(r.erro) head=`<div class="aviso">${esc(r.erro)} <button class="btn" data-al-real="1">tentar de novo</button></div>`;
  else if(!temAp) head=(per.ini&&per.fim)?`<button class="btn primario" data-al-real="1">Calcular apontado · ${esc(fmtBR(per.ini))}–${esc(fmtBR(per.fim))}</button>`:'<span class="muted small">Defina períodos nas alocações para calcular o apontado.</span>';
  else head='<button class="btn" data-al-real="1">↻ recarregar apontado</button>';
  return `<div class="muted small" style="margin:6px 0 10px">Equipe alocada e <strong>planejado × apontado</strong> por projeto no horizonte das alocações. ${head}</div>
    ${projetos.length?`<div class="pl-wrap"><table class="pl-tab"><thead><tr><th>Projeto</th><th>Equipe (h/sem)</th><th class="num">Planejado</th><th class="num">Apontado</th><th class="num">Saldo</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`:'<div class="muted small">Sem alocações com projeto definido — preencha o projeto nas alocações abaixo.</div>'}`;
}
// ---- Fase C: Visão de Capacidade da Empresa (totais + por tipo) ----
function alocViewEmpresa(rows, pess){
  const per=alocPeriodo(rows); const semanas=alocSemanas(rows).filter(w=> !per.fim || w<=semChave(per.fim));
  const pessoas=[...new Set(rows.map(a=>a.accountId).filter(Boolean))];
  let capTot=0; pessoas.forEach(a=>semanas.forEach(w=>{ capTot+=alocCapacSemana(a,w); }));
  let alTot=0; const porTipo={}; ALOC_TIPOS.forEach(([k])=>porTipo[k]=0);
  semanas.forEach(w=>{ const wf=somaDias(w,6); rows.forEach(a=>{ if(!a.accountId) return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(a.inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(a.fim)) return;
    if(a.inicio<=wf&&a.fim>=w){ const h=Number(a.hSemana)||0; alTot+=h; const t=alocTipoDe(a); porTipo[t]=(porTipo[t]||0)+h; } }); });
  const disp=Math.max(0,capTot-alTot); const util=capTot?Math.round(alTot/capTot*100):0;
  let fat=0; ALOC_FAT.forEach(k=>fat+=porTipo[k]||0); const nfat=alTot-fat;
  const kpis=`<div class="ams-kpis">
    <div class="ams-k"><div class="v">${alocH(capTot)}</div><div class="l">Capacidade total</div></div>
    <div class="ams-k"><div class="v">${alocH(alTot)}</div><div class="l">Alocado</div></div>
    <div class="ams-k"><div class="v">${alocH(disp)}</div><div class="l">Disponível</div></div>
    <div class="ams-k"><div class="v">${util}%</div><div class="l">Utilização média</div></div></div>`;
  const tipoRows=ALOC_TIPOS.map(([k,l])=>{ const h=porTipo[k]||0; if(!h) return ''; const pct=alTot?Math.round(h/alTot*100):0;
    return `<tr><td>${esc(l)}</td><td class="num">${alocH(h)}</td><td class="num">${pct}%</td></tr>`; }).filter(Boolean).join('');
  return `<div class="muted small" style="margin:6px 0 10px">Capacidade e alocação <strong>da empresa</strong> no horizonte (pessoas com alocação). A capacidade desconta fins de semana, feriados e ausências/férias.</div>
    ${kpis}
    <div class="muted small" style="font-weight:600;margin:16px 0 4px">Por tipo de alocação</div>
    <div class="pl-wrap"><table class="pl-tab"><thead><tr><th>Tipo</th><th class="num">Horas</th><th class="num">% do alocado</th></tr></thead>
      <tbody>${tipoRows||'<tr><td colspan="3" class="muted small">Sem alocações no horizonte.</td></tr>'}</tbody>
      <tfoot><tr class="pl-tot"><td>Faturável <span class="muted" style="font-weight:400">(faturável + fechado + AMS)</span></td><td class="num">${alocH(fat)}</td><td class="num">${alTot?Math.round(fat/alTot*100):0}%</td></tr>
      <tr class="pl-tot"><td>Não faturável <span class="muted" style="font-weight:400">(pré-venda + interno + treino)</span></td><td class="num">${alocH(nfat)}</td><td class="num">${alTot?Math.round(nfat/alTot*100):0}%</td></tr></tfoot></table></div>`;
}
// ---- Fase D: Skills/competências + filtros ----
function alocSkills(a){ const pp=ppDe(a); if(pp) return Array.isArray(pp.skills)?pp.skills.filter(Boolean):[];
  const s=(cfg.skills||{})[a]; return Array.isArray(s)?s.filter(Boolean):(s?String(s).split(',').map(x=>x.trim()).filter(Boolean):[]); }
// Grava as skills no lugar certo (cfg.skills para pessoa real; a própria vaga para planejada).
function alocSkillsSet(a, arr){ const pp=ppDe(a); if(pp){ pp.skills=arr; } else { cfg.skills=cfg.skills||{}; cfg.skills[a]=arr; } salvaCfg(); }
function alocSkillPrim(a){ const s=alocSkills(a); return s[0]||'Sem skill'; }
function alocSkillsTodas(){ const set=new Set(); Object.keys(cfg.skills||{}).forEach(a=>alocSkills(a).forEach(s=>set.add(s)));
  ppLista().forEach(p=>(p.skills||[]).forEach(s=>{ if(s) set.add(s); })); return [...set].sort(); }
function alocFiltraRows(rows){ const f=estado.alocacao; let r=rows;
  if(f.fProj) r=r.filter(a=>a.projeto===f.fProj);
  if(f.fSkill) r=r.filter(a=>a.funcao===f.fSkill || alocSkills(a.accountId).includes(f.fSkill));
  return r; }
// Visão por Skill: capacidade × demanda por competência (skill principal da pessoa).
function alocViewSkill(rows, pess){
  const per=alocPeriodo(rows); const semanas=alocSemanas(rows).filter(w=> !per.fim || w<=semChave(per.fim));
  const pessoas=[...new Set(rows.map(a=>a.accountId).filter(Boolean))]; const nm=(a)=>(pess[a]&&pess[a].nome)||a;
  const grupos={};
  pessoas.forEach(a=>{ const sk=alocSkillPrim(a); const g=grupos[sk]||(grupos[sk]={cap:0,dem:0,n:0}); g.n++; semanas.forEach(w=>{ g.cap+=alocCapacSemana(a,w); }); });
  semanas.forEach(w=>{ const wf=somaDias(w,6); rows.forEach(a=>{ if(!a.accountId) return; if(!/^\d{4}-\d{2}-\d{2}$/.test(a.inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(a.fim)) return;
    if(a.inicio<=wf&&a.fim>=w){ const sk=alocFuncaoDe(a); const g=grupos[sk]||(grupos[sk]={cap:0,dem:0,n:0}); g.dem+=Number(a.hSemana)||0; } }); });
  const skillsOrd=Object.keys(grupos).sort();
  const rowsHtml=skillsOrd.map(sk=>{ const g=grupos[sk]; const gap=g.cap-g.dem; const util=g.cap?Math.round(g.dem/g.cap*100):0; const [cls]=alocStatus(util);
    return `<tr><td>${esc(sk)} <span class="muted small">(${g.n})</span></td><td class="num">${alocH(g.cap)}</td><td class="num">${alocH(g.dem)}</td><td class="num" style="color:${gap<0?'#B91C1C':'#188918'};font-weight:600">${gap<0?'−':'+'}${alocH(Math.abs(gap))}</td><td class="num"><span class="aloc-badge ${cls}">${util}%</span></td></tr>`; }).join('');
  const datalist=`<datalist id="al-sklist">${alocSkillsTodas().map(s=>`<option value="${escA(s)}"></option>`).join('')}</datalist>`;
  const skEd=pessoas.slice().sort((a,b)=>nm(a).localeCompare(nm(b),'pt')).map(a=>{
    const chips=alocSkills(a).map((s,i)=>`<span class="al-chip${i===0?' prim':''}" data-tip="${i===0?'Skill principal':'Clique na ★ para tornar principal'}">${esc(s)}${i>0?`<button class="al-chip-b" data-al-skprim="${escA(a)}|${escA(s)}" title="Tornar principal">★</button>`:''}<button class="al-chip-b" data-al-skdel="${escA(a)}|${escA(s)}" title="Remover">×</button></span>`).join('');
    return `<tr><td>${esc(nm(a))}</td><td class="al-skcell">${chips}<input type="text" class="al-skadd" data-al-skadd="${escA(a)}" list="al-sklist" placeholder="+ skill (Enter)"></td></tr>`;
  }).join('');
  return `<div class="muted small" style="margin:6px 0 10px">Capacidade × <strong>demanda</strong> por competência no período — a demanda usa a <strong>função de cada alocação</strong> (ou a skill principal da pessoa); a capacidade conta na skill <strong>principal</strong>. <span style="color:#B91C1C">Gap negativo = falta capacidade</span>.</div>
    ${skillsOrd.length?`<div class="pl-wrap"><table class="pl-tab"><thead><tr><th>Skill</th><th class="num">Capacidade</th><th class="num">Demanda</th><th class="num">Gap</th><th class="num">Utilização</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`:'<div class="muted small">Cadastre as skills das pessoas abaixo para ver a análise.</div>'}
    <div class="muted small" style="font-weight:600;margin:16px 0 4px">Skills por pessoa <span class="muted" style="font-weight:400">(quantas quiser — digite e dê Enter; a <strong>1ª é a principal</strong>, use ★ para promover · salva sozinho)</span></div>
    ${datalist}
    <div class="pl-wrap"><table class="pl-tab"><thead><tr><th style="width:220px">Pessoa</th><th>Skills</th></tr></thead><tbody>${skEd||'<tr><td colspan="2" class="muted small">Adicione alocações para listar as pessoas.</td></tr>'}</tbody></table></div>`;
}
// ---- Relatórios de alocação: horas (e custo) por pessoa/projeto/tipo/função, mês a mês ----
// A hora é atribuída ao MÊS da segunda-feira da semana (consistente com o resto da tela).
function alocRelDados(rows, pess){
  const nm=(a)=>(pess[a]&&pess[a].nome)||a;
  const R=estado.alocacao.rel=estado.alocacao.rel||{};
  const per=alocPeriodo(rows);
  if(!R.ini) R.ini=per.ini||semChave(hojeSP());
  if(!R.fim||R.fim<R.ini) R.fim=per.fim&&per.fim>R.ini?per.fim:somaDias(R.ini,7*12);
  const grupo=R.grupo||'pessoa';
  const wks=[]; { let w=semChave(R.ini); const wf=semChave(R.fim); let g=0; while(w<=wf&&g<160){ wks.push(w); w=somaDias(w,7); g++; } }
  const meses=[...new Set(wks.map(w=>w.slice(0,7)))];
  const chave=(a)=> grupo==='projeto'?(a.projeto||'—') : grupo==='tipo'?alocTipoDe(a) : grupo==='skill'?alocFuncaoDe(a) : (a.accountId||'—');
  const rotulo=(k)=> grupo==='tipo'?(((ALOC_TIPOS.find(([t])=>t===k))||[k,k])[1]) : grupo==='pessoa'?nm(k) : (k||'—');
  const dados={}; let totH=0, totC=0; const semCusto=new Set(); const mesTot={}; const planSem={};
  wks.forEach(w=>{ const wf=somaDias(w,6); const ym=w.slice(0,7);
    rows.forEach(a=>{ if(!/^\d{4}-\d{2}-\d{2}$/.test(a.inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(a.fim)) return;
      if(a.inicio>wf||a.fim<w) return;
      const h=Number(a.hSemana)||0; if(!h) return;
      const k=chave(a); const d=dados[k]=dados[k]||{h:0,c:0,meses:{}};
      d.h+=h; d.meses[ym]=(d.meses[ym]||0)+h; totH+=h; mesTot[ym]=(mesTot[ym]||0)+h;
      planSem[w]=(planSem[w]||0)+h;
      const cH=alocCustoH(a.accountId);
      if(cH>0){ d.c+=h*cH; totC+=h*cH; } else if(a.accountId) semCusto.add(a.accountId);
    }); });
  // Realizado (Clockwork) no período — por grupo, total e semana a semana. Para
  // função/skill não há como atribuir o apontamento a uma função → indisponível.
  const RR=estado.alocacao.relReal||{};
  const temReal=Array.isArray(RR.wl) && RR.range===R.ini+'|'+R.fim;
  const grupoRealOk=grupo!=='skill';
  const chaveReal=(w)=> grupo==='pessoa'?(w.a||'—') : grupo==='projeto'?(w.p||'—') : alocTipoDe({projeto:w.p});
  const realPorG={}; const realSem={}; let realTot=0;
  if(temReal){ RR.wl.forEach(w=>{ const dt=(w.d||'').slice(0,10); if(!dt||dt<R.ini||dt>R.fim) return;
    const h=(Number(w.s)||0)/3600; realTot+=h;
    const sw=semChave(dt); realSem[sw]=(realSem[sw]||0)+h;
    if(grupoRealOk){ const k=chaveReal(w); realPorG[k]=(realPorG[k]||0)+h; } }); }
  const linhas=Object.keys(dados).sort((x,y)=>dados[y].h-dados[x].h)
    .map(k=>({ k, rot:rotulo(k), h:dados[k].h, c:dados[k].c, meses:dados[k].meses,
      real:(temReal&&grupoRealOk)?(realPorG[k]||0):null }));
  return { R, grupo, meses, mesTot, linhas, totH, totC, semCusto:[...semCusto].map(nm),
    wks, planSem, temReal, grupoRealOk, realSem, realTot,
    realCarregando:!!RR.carregando, realErro:RR.erro||'' };
}
function alocViewRelatorios(rows, pess){
  const nm=(a)=>(pess[a]&&pess[a].nome)||a;
  const D=alocRelDados(rows, pess);
  const fmtR=(v)=> v?('R$ '+Math.round(v).toLocaleString('pt-BR')):'—';
  const gruposSel=[['pessoa','Por pessoa'],['projeto','Por projeto'],['tipo','Por tipo'],['skill','Por função/skill']];
  const btnReal=D.realCarregando?'<button class="btn" disabled>Calculando…</button>'
    :(D.temReal?'<button class="btn" data-al-relreal="1" data-tip="Recarrega as horas apontadas (Clockwork) do período">↻ recarregar realizado</button>'
      :'<button class="btn primario" data-al-relreal="1" data-tip="Busca as horas APONTADAS nos tickets (Clockwork) no período e calcula a eficiência planejado × realizado">📈 Calcular realizado</button>');
  const controles=`<div class="ap-filtros" style="margin:6px 0 12px">
      <div class="campo"><label>Agrupar</label><select data-al-relg>${gruposSel.map(([v,l])=>`<option value="${v}" ${D.grupo===v?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="campo"><label>De</label><input type="date" data-al-relini value="${escA(D.R.ini)}"></div>
      <div class="campo"><label>Até</label><input type="date" data-al-relfim value="${escA(D.R.fim)}"></div>
      <div class="campo"><label>&nbsp;</label>${btnReal}</div>
      <div class="campo"><label>&nbsp;</label><button class="btn" data-al-relcsv="1">⬇ Exportar CSV</button></div>
      <div class="campo"><label>&nbsp;</label><button class="btn" data-al-odoo="1" data-tip="Busca o custo/h dos funcionários no Odoo (hr.employee) e grava na config do time — requer ODOO_URL/DB/LOGIN/API_KEY na Vercel">↻ Importar custos do Odoo</button></div>
    </div>
    ${D.realErro?`<div class="aviso">${esc(D.realErro)} <button class="btn" data-al-relreal="1">tentar de novo</button></div>`:''}`;
  // Eficiência = realizado ÷ planejado (≈100% é bom; muito abaixo = não executou; muito acima = estourou o plano)
  const efiBadge=(p,r)=>{ if(!p) return '<span class="muted small">—</span>';
    const e2=Math.round((r||0)/p*100); const cls=(e2>=85&&e2<=115)?'saud':((e2>=60&&e2<=150)?'aten':'crit');
    return `<span class="aloc-badge ${cls}" data-tip="Realizado ÷ planejado">${e2}%</span>`; };
  const mostraReal=D.temReal&&D.grupoRealOk;
  const thM=D.meses.map(m=>`<th class="num">${esc(labelMesAbbr(m))}</th>`).join('');
  const thReal=mostraReal?'<th class="num">Realizado</th><th class="num">Eficiência</th>':'';
  const linhas=D.linhas.map(l=>`<tr><td>${esc(l.rot)}</td>${D.meses.map(m=>`<td class="num">${l.meses[m]?alocH(l.meses[m]):'·'}</td>`).join('')}
      <td class="num"><strong>${alocH(l.h)}</strong></td><td class="num">${D.totH?Math.round(l.h/D.totH*100)+'%':'—'}</td>
      ${mostraReal?`<td class="num">${alocH(l.real||0)}</td><td class="num">${efiBadge(l.h,l.real)}</td>`:''}
      <td class="num">${fmtR(l.c)}</td></tr>`).join('');
  const tot=`<tr class="pl-tot"><td>Total</td>${D.meses.map(m=>`<td class="num">${D.mesTot[m]?alocH(D.mesTot[m]):'·'}</td>`).join('')}
      <td class="num">${alocH(D.totH)}</td><td class="num">${D.totH?'100%':'—'}</td>
      ${mostraReal?`<td class="num">${alocH(D.realTot)}</td><td class="num">${efiBadge(D.totH,D.realTot)}</td>`:''}
      <td class="num">${fmtR(D.totC)}</td></tr>`;
  // Semana a semana: planejado × realizado (o "realizado" vem dos apontamentos nos tickets)
  const semTable=D.temReal?(()=>{
    const semanas=[...new Set([...D.wks, ...Object.keys(D.realSem)])].sort().filter(w=>(D.planSem[w]||0)>0||(D.realSem[w]||0)>0);
    if(!semanas.length) return '';
    const trs=semanas.map(w=>{ const p=D.planSem[w]||0, r=D.realSem[w]||0;
      return `<tr><td>${esc(fmtBR(w))}</td><td class="num">${alocH(p)}</td><td class="num">${alocH(r)}</td><td class="num">${efiBadge(p,r)}</td></tr>`; }).join('');
    return `<div class="muted small" style="font-weight:600;margin:16px 0 4px">📈 Eficiência semana a semana <span class="muted" style="font-weight:400">(planejado × horas apontadas nos tickets, no recorte atual)</span></div>
      <div class="pl-wrap"><table class="pl-tab" style="max-width:560px"><thead><tr><th>Semana</th><th class="num">Planejado</th><th class="num">Realizado</th><th class="num">Eficiência</th></tr></thead><tbody>${trs}</tbody></table></div>`;
  })():'';
  const notaSkill=(D.temReal&&!D.grupoRealOk)?'<div class="muted small" style="margin-top:6px">ℹ O realizado por <strong>função/skill</strong> não é possível (o apontamento no ticket não carrega a função) — use os agrupamentos por pessoa, projeto ou tipo.</div>':'';
  const avisoCusto=D.semCusto.length?`<div class="aviso" style="margin-top:10px">⚠ ${D.semCusto.length} pessoa(s) alocada(s) <strong>sem custo/h cadastrado</strong> (${esc(D.semCusto.slice(0,4).join(', '))}${D.semCusto.length>4?'…':''}) — o custo total está <strong>subestimado</strong>. Cadastre abaixo ou importe do Odoo.</div>`:'';
  // Editor de custo/h por pessoa (vagas editam na aba A contratar)
  const pessoasAloc=[...new Set(rows.map(a=>a.accountId).filter(Boolean))].sort((a,b)=>nm(a).localeCompare(nm(b),'pt'));
  const custosEd=pessoasAloc.map(a=>{ const pp=ppDe(a);
    return `<tr><td>${esc(nm(a))}</td><td class="num">${pp
      ?`<span class="muted small" data-tip="Vaga — edite o custo previsto na aba A contratar">${pp.custoH?('R$ '+pp.custoH+'/h'):'—'} (vaga)</span>`
      :`<input type="number" data-al-custo="${escA(a)}" value="${escA((cfg.custosPessoa||{})[a]?String(cfg.custosPessoa[a]):'')}" min="0" step="10" placeholder="R$/h" style="max-width:110px">`}</td></tr>`; }).join('');
  return `<div class="muted small" style="margin:6px 0 4px">Horas <strong>planejadas</strong> (e custo previsto) no período, mês a mês — use os filtros de skill/projeto acima para recortar. O custo usa o <strong>R$/h de cada pessoa</strong> (manual ou do Odoo) e o custo previsto das vagas 🔮.</div>
    ${controles}
    ${D.linhas.length?`<div class="pl-wrap"><table class="pl-tab"><thead><tr><th>${esc((gruposSel.find(([v])=>v===D.grupo)||[])[1]||'Grupo')}</th>${thM}<th class="num">Total h</th><th class="num">%</th>${thReal}<th class="num">Custo</th></tr></thead>
      <tbody>${linhas}</tbody><tfoot>${tot}</tfoot></table></div>`
      :'<div class="muted small">Nenhuma alocação no período escolhido.</div>'}
    ${notaSkill}
    ${semTable}
    ${avisoCusto}
    <div class="muted small" style="font-weight:600;margin:16px 0 4px">💰 Custo/h por pessoa <span class="muted" style="font-weight:400">(salvo na config do time · usado só nos relatórios)</span></div>
    <div class="pl-wrap"><table class="pl-tab" style="max-width:520px"><thead><tr><th>Pessoa</th><th class="num">Custo (R$/h)</th></tr></thead><tbody>${custosEd||'<tr><td colspan="2" class="muted small">Sem pessoas alocadas no período.</td></tr>'}</tbody></table></div>`;
}
// ---- A contratar: cadastro de pessoas planejadas (vagas) para planejar antes de contratar ----
function alocViewACont(rows){
  const pps=ppLista();
  const linhas=pps.map(p=>{
    const nAl=rows.filter(a=>a.accountId===p.id).length;
    return `<tr>
      <td><span style="display:inline-flex;align-items:center;gap:6px">🔮<input type="text" data-pp-f="nome|${escA(p.id)}" value="${escA(p.nome||'')}" placeholder="ex.: Consultor SAP Sr. (vaga)"></span></td>
      <td><input type="text" data-pp-f="skills|${escA(p.id)}" value="${escA((p.skills||[]).join(', '))}" placeholder="skills por vírgula (1ª = principal)"></td>
      <td class="num"><input type="number" data-pp-f="hSem|${escA(p.id)}" value="${escA(String(p.hSem!=null?p.hSem:40))}" min="0" step="4" style="max-width:76px"> h/sem</td>
      <td class="num"><input type="number" data-pp-f="custoH|${escA(p.id)}" value="${escA(p.custoH?String(p.custoH):'')}" min="0" step="10" style="max-width:96px" placeholder="R$/h" data-tip="Custo/hora previsto — usado nos relatórios de custo"></td>
      <td><input type="date" data-pp-f="inicio|${escA(p.id)}" value="${escA(p.inicio||'')}" data-tip="Início previsto — antes desta data a capacidade da vaga é ZERO"></td>
      <td class="num">${nAl}</td>
      <td><button class="ab-x" data-pp-del="${escA(p.id)}" title="Remover a vaga (remove também as alocações dela)">×</button></td></tr>`;
  }).join('');
  return `<div class="muted small" style="margin:6px 0 10px">Planeje com pessoas que você <strong>ainda não contratou</strong>: cadastre a vaga e ela entra no <strong>board</strong>, na <strong>Linha do tempo</strong>, na análise <strong>Por Skill</strong> e na <strong>Simulação</strong> como uma pessoa normal, marcada com <strong>🔮</strong>. A capacidade usa as <strong>h/sem</strong> da vaga e é <strong>zero antes do início previsto</strong>. Contratou? Troque a pessoa nas alocações e remova a vaga. Tudo <strong>salva sozinho</strong> (config do time).</div>
    <div class="pl-wrap"><table class="pl-tab"><thead><tr><th style="min-width:220px">Nome / vaga</th><th style="min-width:220px">Skills</th><th class="num">Capacidade</th><th class="num">Custo previsto</th><th>Início previsto</th><th class="num">Alocações</th><th></th></tr></thead>
    <tbody>${linhas||'<tr><td colspan="7" class="muted small">Nenhuma vaga planejada ainda — adicione abaixo e depois aloque a vaga aos projetos no board.</td></tr>'}</tbody></table></div>
    <div style="margin-top:10px"><button class="btn primario" data-pp-add="1">+ adicionar pessoa planejada</button></div>`;
}
// ---- Projetos: o TIPO/categoria é definido por projeto (e herdado pelas alocações) ----
function alocViewProjetos(rows){
  const usados={}; rows.forEach(a=>{ if(a.projeto){ const u=usados[a.projeto]=usados[a.projeto]||{n:0,pess:new Set(),tipos:{}};
    u.n++; if(a.accountId) u.pess.add(a.accountId); const t=a.tipo||'faturavel'; u.tipos[t]=(u.tipos[t]||0)+1; } });
  const cat=(_projetosCache||[]).map(p=>p.key);
  const keys=[...new Set([...Object.keys(usados), ...cat])].sort();
  const nomeDe=(k)=>{ const p=(_projetosCache||[]).find(x=>x.key===k); return (p&&p.nome)||''; };
  // Sugestão para projetos ainda sem cadastro: o tipo mais comum nas alocações existentes.
  const sugestao=(k)=>{ const u=usados[k]; if(!u) return '';
    return Object.entries(u.tipos).sort((a,b)=>b[1]-a[1]).map(x=>x[0])[0]||''; };
  const linhas=keys.map(k=>{
    const def=(cfg.projTipos||{})[k]||''; const sug=def?'':sugestao(k);
    const u=usados[k];
    const opt=`<option value="">${sug?`— herdando das linhas (${esc(((ALOC_TIPOS.find(([t])=>t===sug))||[sug,sug])[1])}) —`:'— definir —'}</option>`+
      ALOC_TIPOS.map(([t,l])=>`<option value="${t}" ${def===t?'selected':''}>${esc(l)}</option>`).join('');
    const tp=def||sug||'';
    return `<tr${u?'':' class="muted"'}><td><i class="gt-dot gtc${gtCor(k)}"></i><strong>${esc(k)}</strong> <span class="muted small">${esc(nomeDe(k))}</span></td>
      <td><span style="display:inline-flex;align-items:center;gap:7px">${tp?`<i class="ab-tdot t-${escA(tp)}"></i>`:''}<select class="ab-tipo t-${escA(tp||'faturavel')}" data-al-ptipo="${escA(k)}" style="max-width:210px">${opt}</select></span></td>
      <td class="num">${u?u.n:'—'}</td><td class="num">${u?u.pess.size:'—'}</td></tr>`;
  }).join('');
  return `<div class="muted small" style="margin:6px 0 10px">O <strong>tipo/categoria</strong> (faturável, AMS, interno…) é definido <strong>uma vez por projeto</strong> aqui — todas as alocações do projeto herdam automaticamente (a bolinha colorida em cada linha do board mostra o tipo herdado). Alterações <strong>salvam sozinhas</strong> e valem para o time.</div>
    <div class="pl-wrap"><table class="pl-tab"><thead><tr><th>Projeto</th><th>Tipo (vale para o projeto todo)</th><th class="num">Alocações</th><th class="num">Pessoas</th></tr></thead>
      <tbody>${linhas||'<tr><td colspan="4" class="muted small">Nenhum projeto ainda — adicione alocações ou aguarde o catálogo do Jira carregar.</td></tr>'}</tbody></table></div>`;
}
// ---- Fase E: Gantt / linha do tempo com arrastar-e-soltar ----
// Diferença/soma em dias corridos (calendário, sem pular fim de semana) — para a geometria.
function gtDiff(a,b){ const [ay,am,ad]=a.split('-').map(Number),[by,bm,bd]=b.split('-').map(Number); return Math.round((Date.UTC(by,bm-1,bd)-Date.UTC(ay,am-1,ad))/86400000); }
function gtAdd(s,n){ const [y,m,d]=s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10); }
// As cores do Gantt/board são as classes .gtc0–.gtc9 (com variante clara e escura no CSS).
const GT_NCORES=10;
function gtCor(key){ let h=0; const s=String(key||'—'); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))>>>0; return h%GT_NCORES; }
function gtZoom(){ return Math.max(10,Math.min(44, estado.alocacao.gz||22)); }
// Datas resultantes de um arraste em andamento (para o preview ao vivo e o commit).
function gtDatas(mode, ini, fim, dd){ let ni=ini, nf=fim;
  if(mode==='move'){ ni=gtAdd(ini,dd); nf=gtAdd(fim,dd); }
  else if(mode==='resize-r'){ nf=gtAdd(fim,dd); if(nf<ni) nf=ni; }
  else if(mode==='resize-l'){ ni=gtAdd(ini,dd); if(ni>nf) ni=nf; }
  return { ini:ni, fim:nf }; }
function alocViewGantt(rows, pess){
  const nm=(a)=>(pess[a]&&pess[a].nome)||a;
  const full=alocRows(); // índices para o drag referenciam a lista completa (não filtrada)
  const weeks=alocSemanas(rows); const start=weeks[0]; const end=gtAdd(weeks[weeks.length-1],6);
  const D=gtZoom(); const totalD=gtDiff(start,end)+1; const totalPx=totalD*D;
  const pessoas=[...new Set(rows.map(a=>a.accountId).filter(Boolean))].sort((a,b)=>nm(a).localeCompare(nm(b),'pt'));
  const valid=rows.filter(a=>a.accountId&&/^\d{4}-\d{2}-\d{2}$/.test(a.inicio)&&/^\d{4}-\d{2}-\d{2}$/.test(a.fim)&&a.fim>=a.inicio);
  const NAME=158, barH=26, gap=4, padT=6;
  const toolbar=`<div class="gt-toolbar">
      <span class="muted small">Arraste a barra para <strong>mover</strong> · puxe as bordas para <strong>redimensionar</strong> · as alterações <strong>salvam sozinhas</strong>.</span>
      <span id="gtInfo" class="gt-info"></span>
      <span class="spacer"></span>
      <button class="btn" data-gt-hoje="1" title="Rolar até hoje">→ hoje</button>
      <span class="muted small">Zoom</span> <button class="btn" data-gt-zoom="out" title="Menos zoom">−</button><button class="btn" data-gt-zoom="in" title="Mais zoom">+</button>
    </div>`;
  if(!pessoas.length || !valid.length){
    return `${toolbar}<div class="muted small">Adicione alocações no <strong>Planejamento por pessoa</strong> (abaixo) para vê-las na linha do tempo.</div>`;
  }
  // Cabeçalho: faixa de meses + faixa de semanas.
  const mSeg=[]; { let d=start; while(d<=end){ const ym=d.slice(0,7); let cnt=0; while(d<=end && d.slice(0,7)===ym){ cnt++; d=gtAdd(d,1); } mSeg.push({ym,cnt}); } }
  const monthsHtml=mSeg.map(s=>`<div class="gt-mon" style="width:${s.cnt*D}px">${esc(labelMesAbbr(s.ym))}</div>`).join('');
  const weeksHtml=weeks.map(w=>{ const off=gtDiff(start,w); const wpx=Math.min(7,totalD-off)*D; return `<div class="gt-wk" style="width:${wpx}px">${esc(fmtBR(w))}</div>`; }).join('');
  const tOff=gtDiff(start, hojeSP()); const today=(tOff>=0&&tOff<totalD)?`<div class="gt-today" style="left:${tOff*D}px"></div>`:'';
  // Alvo de rolagem inicial / botão "→ hoje": hoje se estiver no horizonte, senão a 1ª alocação.
  const firstLeft=valid.length?Math.min.apply(null, valid.map(x=>gtDiff(start,x.inicio)))*D:0;
  const alvoPx=(tOff>=0&&tOff<totalD)?tOff*D:firstLeft;
  // Uma faixa (lane) por pessoa: heat de utilização por semana + barras empacotadas em sub-linhas.
  const lanes=pessoas.map(a=>{
    const als=valid.filter(x=>x.accountId===a).map(x=>({x, s:gtDiff(start,x.inicio), e:gtDiff(start,x.fim)}));
    als.sort((p,q)=>p.s-q.s||p.e-q.e);
    const subs=[]; als.forEach(it=>{ let r=0; for(;;r++){ const sub=subs[r]||(subs[r]=[]); if(sub.every(o=> it.s>o.e||it.e<o.s)){ sub.push(it); it.row=r; break; } } });
    const nSub=Math.max(1,subs.length); const laneH=padT*2 + nSub*barH + (nSub-1)*gap;
    const heat=weeks.map(w=>{ const cap=alocCapacSemana(a,w); const al=alocAlocadoSemana(rows,a,w); if(!cap&&!al) return '';
      const u=cap?Math.round(al/cap*100):999; const [cls]=alocStatus(u); const off=gtDiff(start,w); const wpx=Math.min(7,totalD-off)*D;
      return `<div class="gt-hb ${cls}" style="left:${off*D}px;width:${wpx}px" data-tip="${escA(nm(a))} · ${esc(fmtBR(w))}: ${alocH(al)} de ${alocH(cap)} (${u}%)"></div>`; }).join('');
    const bars=als.map(it=>{ const x=it.x; const left=it.s*D, w=(it.e-it.s+1)*D, top=padT+it.row*(barH+gap); const ci=gtCor(x.projeto);
      const nf=!ALOC_FAT.has(alocTipoDe(x)); const idx=full.indexOf(x);
      const tip=`${x.projeto||'—'} · ${nm(a)}${x.funcao?` · ${x.funcao}`:''}\n${fmtBR(x.inicio)}–${fmtBR(x.fim)} · ${x.hSemana||0}h/sem\nClique para ver os detalhes do projeto`;
      return `<div class="gt-bar gtc${ci}${nf?' nf':''}" data-gt-idx="${idx}" style="left:${left}px;width:${w}px;top:${top}px" title="${escA(tip)}"><span class="gt-h l" data-gt-h="l"></span>${esc(x.projeto||'—')} · ${x.hSemana||0}h<span class="gt-dup" data-gt-dup="${escA(x.id)}" title="Duplicar esta alocação">⧉</span><span class="gt-h r" data-gt-h="r"></span></div>`; }).join('');
    // Coluna fixa: nome + horas alocadas × capacidade da SEMANA ATUAL (sempre visível).
    const wAtu=semChave(hojeSP()); const alAtu=alocAlocadoSemana(rows,a,wAtu); const capAtu=alocCapacSemana(a,wAtu);
    const uAtu=capAtu?Math.round(alAtu/capAtu*100):(alAtu>0?999:0); const [clsAtu]=alocStatus(uAtu);
    return `<div class="gt-lane" style="height:${laneH}px"><div class="gt-name" title="${escA(nm(a))} — alocado nesta semana: ${escA(alocH(alAtu))} de ${escA(alocH(capAtu))}${alocTravada(a)?' · alocações travadas (aprovação)':''}"><span class="gt-nm">${esc(nm(a))}${alocTravada(a)?' 🔒':''}</span><span class="gt-nh ${clsAtu}">${alocH(alAtu)}/${alocH(capAtu)} · ${uAtu}%</span></div><div class="gt-track" style="width:${totalPx}px;--d:${D}px">${heat}${today}${bars}</div></div>`;
  }).join('');
  const head=`<div class="gt-head"><div class="gt-corner"></div><div class="gt-htl" style="width:${totalPx}px"><div class="gt-months">${monthsHtml}</div><div class="gt-weeks">${weeksHtml}</div></div></div>`;
  const leg=`<div class="aloc-leg"><span><i class="disp"></i>≤80%</span><span><i class="saud"></i>80–100%</span><span><i class="aten"></i>100–120%</span><span><i class="crit"></i>&gt;120%</span><span style="margin-left:4px">▨ listrado = não faturável · cor = projeto · <span style="color:#B91C1C">|</span> linha vermelha = hoje</span></div>`;
  return `${toolbar}<div class="gt-scroll" data-gt-target="${Math.round(alvoPx)}"><div class="gt-inner" style="--gt-name:${NAME}px">${head}${lanes}</div></div>${leg}`;
}
// ---- Fase F: Simulação ("e se…") — camada de alocações hipotéticas + busca de disponibilidade ----
function simRows(){ if(!Array.isArray(estado.alocacao.sim)) estado.alocacao.sim=[]; return estado.alocacao.sim; }
function simNova(base){ return Object.assign({ id:'sim'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), accountId:'', projeto:'Cenário', tipo:'faturavel', inicio:'', fim:'', hSemana:20 }, base||{}); }
function simSync(){ const rows=simRows(); document.querySelectorAll('[data-sim-f]').forEach(inp=>{ const p=inp.getAttribute('data-sim-f').split('|'); const a=rows[+p[1]]; if(!a) return; if(p[0]==='hSemana') a.hSemana=Math.max(0,Number(inp.value)||0); else a[p[0]]=inp.value; }); }
function simFindSync(){ const f=estado.alocacao.find=estado.alocacao.find||{}; document.querySelectorAll('[data-find-f]').forEach(inp=>{ const k=inp.getAttribute('data-find-f'); f[k]= k==='h'?Math.max(0,Number(inp.value)||0):inp.value; }); }
function simSemanas(ini,fim){ let w=semChave(ini); const wf=semChave(fim); const out=[]; let g=0; while(w<=wf&&g<104){ out.push(w); w=somaDias(w,7); g++; } return out; }
// Impacto por pessoa: baseline (só real) × cenário (real + simulado), sobre as semanas ativas.
function simImpacto(){
  const rows=alocRows(); const sim=simRows().filter(a=>a.accountId&&/^\d{4}-\d{2}-\d{2}$/.test(a.inicio)&&/^\d{4}-\d{2}-\d{2}$/.test(a.fim)&&a.fim>=a.inicio);
  const combined=rows.concat(sim); const weeks=alocSemanas(combined);
  const pessoas=[...new Set(sim.map(a=>a.accountId))];
  return { sim, linhas: pessoas.map(a=>{ let cap=0,n=0,peakB=0,peakC=0,peakSim=0;
    weeks.forEach(w=>{ const c=alocCapacSemana(a,w); const r=alocAlocadoSemana(rows,a,w); const s=alocAlocadoSemana(sim,a,w);
      if(c>0 && (r+s)>0){ cap+=c; n++; const ub=r/c*100, uc=(r+s)/c*100; if(ub>peakB) peakB=ub; if(uc>peakC) peakC=uc; if(s>peakSim) peakSim=s; } });
    const avgCap=n?cap/n:0; const uBase=Math.round(peakB), uCen=Math.round(peakC);
    return { a, avgCap, peakSim, uBase, uCen, novo: peakB<=100 && peakC>100 };
  }).sort((x,y)=> (y.novo-x.novo)||(y.uCen-x.uCen)) };
}
// Busca de disponibilidade ("quem cabe?"): folga média no período e se comporta a demanda.
function simBusca(pess){
  const f=estado.alocacao.find||{}; if(!f.ini||!f.fim||f.fim<f.ini) return null;
  const rows=alocRows(); const wks=simSemanas(f.ini,f.fim); const n=wks.length||1; const need=Math.max(0,Number(f.h)||0);
  return Object.entries(pess).filter(([id,p])=>!RE_EXCLUIR.test((p&&p.nome)||'')).map(([id,p])=>{
    let free=0, fits=0, ativo=0; wks.forEach(w=>{ const cap=alocCapacSemana(id,w); if(cap<=0) return; ativo++; const fr=cap-alocAlocadoSemana(rows,id,w); free+=Math.max(0,fr); if(fr>=need) fits++; });
    return { id, nome:p.nome||id, avgFree:ativo?free/ativo:0, fitsAll:ativo>0&&fits===ativo, fitsSome:fits>0, skillP:alocSkillPrim(id), skills:alocSkills(id) };
  }).filter(c=> (!f.skill || c.skills.includes(f.skill)) && (c.avgFree>0.05 || c.fitsSome))
    .sort((a,b)=> b.avgFree-a.avgFree).slice(0,12);
}
function alocViewSimulacao(_rows, pess){
  const nm=(a)=>(pess[a]&&pess[a].nome)||a;
  const sim=simRows(); const pordPess=Object.entries(pess).filter(([a,p])=>!RE_EXCLUIR.test((p&&p.nome)||'')).sort((x,y)=>((x[1].nome||'')).localeCompare(y[1].nome||'','pt'));
  const f=estado.alocacao.find=estado.alocacao.find||{};
  // Pré-preenche o período da busca (hoje → ~8 semanas) para já mostrar quem cabe, sem exigir digitação.
  if(!f.ini) f.ini=semChave(hojeSP());
  if(!f.fim) f.fim=somaDias(f.ini,55);
  const skillsAll=alocSkillsTodas();
  // ---- Editor do cenário (alocações hipotéticas, NÃO salvas na config) ----
  const edRows=sim.map((a,i)=>{
    const pOpt='<option value="">— pessoa —</option>'+pordPess.map(([id,p])=>`<option value="${escA(id)}" ${a.accountId===id?'selected':''}>${esc(p.nome||id)}</option>`).join('');
    const tOpt=ALOC_TIPOS.map(([k,l])=>`<option value="${k}" ${(a.tipo||'faturavel')===k?'selected':''}>${esc(l)}</option>`).join('');
    return `<tr>
      <td><select data-sim-f="accountId|${i}">${pOpt}</select></td>
      <td><input type="text" data-sim-f="projeto|${i}" value="${escA(a.projeto||'')}" placeholder="rótulo" style="min-width:110px"></td>
      <td><select data-sim-f="tipo|${i}">${tOpt}</select></td>
      <td><input type="date" data-sim-f="inicio|${i}" value="${escA(a.inicio)}"></td>
      <td><input type="date" data-sim-f="fim|${i}" value="${escA(a.fim)}"></td>
      <td class="num pl-alloc"><input type="number" class="pl-pct" data-sim-f="hSemana|${i}" value="${a.hSemana!=null?a.hSemana:''}" min="0" step="1"><span>h/sem</span></td>
      <td class="num"><button class="pl-x" data-sim-del="${i}" title="Remover">×</button></td></tr>`;
  }).join('');
  // ---- Impacto por pessoa ----
  const imp=simImpacto(); const demanda=imp.sim.reduce((s,a)=>s+(Number(a.hSemana)||0),0); const gargalos=imp.linhas.filter(l=>l.novo).length;
  const impRows=imp.linhas.map(l=>{ const [clsB]=alocStatus(l.uBase), [clsC,lblC]=alocStatus(l.uCen);
    return `<tr class="${l.novo?'sim-new':''}"><td>${esc(nm(l.a))}${l.novo?' <span class="sim-tag gargalo">novo gargalo</span>':''}</td>
      <td class="num">${alocH(l.avgCap)}/sem</td><td class="num" style="color:var(--cerceta);font-weight:600">+${alocH(l.peakSim)}/sem</td>
      <td class="num sim-arrow"><span class="aloc-badge ${clsB}">${l.uBase}%</span> → <span class="aloc-badge ${clsC}">${l.uCen}%</span></td>
      <td><span class="aloc-badge ${clsC}">${esc(lblC)}</span></td></tr>`; }).join('');
  const impTab = imp.linhas.length
    ? `<div class="muted small" style="margin:2px 0 8px">Cenário: <strong>${imp.sim.length}</strong> alocação(ões) · demanda simulada <strong>${alocH(demanda)}/sem</strong>${gargalos?` · <span style="color:#B91C1C;font-weight:700">${gargalos} pessoa(s) viram gargalo</span>`:' · nenhum novo gargalo'}.</div>
       <div class="pl-wrap"><table class="pl-tab"><thead><tr><th>Pessoa</th><th class="num">Capacidade</th><th class="num">+ Cenário (pico)</th><th class="num">Utilização pico: base → cenário</th><th>Status cenário</th></tr></thead><tbody>${impRows}</tbody></table></div>`
    : '<div class="muted small">Adicione alocações hipotéticas (com pessoa e período) para ver o impacto na utilização de cada um.</div>';
  // ---- Busca de disponibilidade ("quem cabe?") ----
  const busca=simBusca(pess);
  const skOpt='<option value="">qualquer skill</option>'+skillsAll.map(s=>`<option value="${escA(s)}" ${f.skill===s?'selected':''}>${esc(s)}</option>`).join('');
  let buscaTab;
  if(!f.ini||!f.fim){ buscaTab='<div class="muted small">Informe início e fim para procurar quem tem folga no período.</div>'; }
  else if(!busca||!busca.length){ buscaTab='<div class="muted small">Ninguém com folga suficiente no período/critério informado.</div>'; }
  else { buscaTab=`<div class="pl-wrap"><table class="pl-tab"><thead><tr><th>Pessoa</th><th>Skill</th><th class="num">Folga média</th><th>Cabe?</th><th></th></tr></thead><tbody>`+
    busca.map(c=>{ const tag=c.fitsAll?'<span class="sim-tag ok">todas as semanas</span>':(c.fitsSome?'<span class="sim-tag part">em algumas</span>':'<span class="sim-tag no">não</span>');
      return `<tr><td>${esc(c.nome)}</td><td class="muted small">${esc(c.skillP)}</td><td class="num" style="font-weight:600;color:#188918">${alocH(c.avgFree)}/sem</td><td>${tag}</td><td class="num"><button class="sim-add" data-sim-fromfind="${escA(c.id)}">+ cenário</button></td></tr>`; }).join('')+
    `</tbody></table></div>`; }
  return `<div class="muted small" style="margin:6px 0 12px">Modele cenários <strong>"e se…"</strong> sem tocar nas alocações reais: alocações hipotéticas ficam <strong>só nesta sessão</strong> (não são salvas) e mostram o impacto na utilização de cada pessoa. Use a <strong>busca de disponibilidade</strong> para achar quem cabe numa nova demanda.</div>
    <div class="sim-grid">
      <div class="sim-box">
        <h4>🔎 Quem cabe? <span class="muted small" style="font-weight:400">(folga no período)</span></h4>
        <div class="sim-find">
          <label>Início<input type="date" data-find-f="ini" value="${escA(f.ini||'')}"></label>
          <label>Fim<input type="date" data-find-f="fim" value="${escA(f.fim||'')}"></label>
          <label>h/sem<input type="number" data-find-f="h" min="0" step="1" value="${f.h!=null?f.h:20}"></label>
          <label>Skill<select data-find-f="skill">${skOpt}</select></label>
          <label>Rótulo<input type="text" data-find-f="rot" value="${escA(f.rot||'Novo projeto')}" style="width:120px"></label>
        </div>
        ${buscaTab}
      </div>
      <div class="sim-box">
        <h4>🧪 Impacto do cenário</h4>
        ${impTab}
      </div>
    </div>
    <div class="card" style="box-shadow:none;border:1px solid var(--linha);margin-top:14px;padding:12px 14px">
      <div class="muted small" style="font-weight:600;margin:0 0 8px">Cenário <span class="muted" style="font-weight:400">(alocações hipotéticas · pessoa · rótulo · período · h/semana)</span></div>
      <div class="pl-wrap"><table class="pl-tab aloc-ed"><thead><tr><th>Pessoa</th><th>Rótulo</th><th>Tipo</th><th>Início</th><th>Fim</th><th class="num">h/sem</th><th></th></tr></thead>
        <tbody>${edRows||'<tr><td colspan="7" class="muted small">Cenário vazio. Adicione uma linha ou use "+ cenário" na busca ao lado.</td></tr>'}</tbody></table></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px"><button class="btn" data-sim-add="1">+ adicionar hipótese</button>
        ${sim.length?'<button class="btn" data-sim-limpar="1">limpar cenário</button>':''}
        <span class="spacer"></span><span class="muted small">As hipóteses não afetam as alocações salvas.</span></div>
    </div>`;
}
// Lembra visão/granularidade/zoom da Alocação entre sessões (só no navegador, não é config compartilhada).
const ALOC_UI_KEY='dexterity_aloc_ui_v1';
function alocUISave(){ try{ localStorage.setItem(ALOC_UI_KEY, JSON.stringify({ visao:estado.alocacao.visao, gran:estado.alocacao.gran, gz:estado.alocacao.gz, ordB:estado.alocacao.ordB })); }catch(e){} }
function alocUILoad(){ if(estado.alocacao._ui) return; estado.alocacao._ui=true;
  try{ const u=JSON.parse(localStorage.getItem(ALOC_UI_KEY)||'{}'); if(u&&typeof u==='object'){ if(u.visao) estado.alocacao.visao=u.visao; if(u.gran) estado.alocacao.gran=u.gran; if(u.gz) estado.alocacao.gz=u.gz; if(u.ordB) estado.alocacao.ordB=u.ordB; } }catch(e){} }
function renderAlocacao(){
  const cont=document.getElementById('conteudo');
  alocUILoad();
  if(!_projetosCache && !estado.alocacao._cp){ estado.alocacao._cp=true; garanteProjetos().then(()=>{ estado.alocacao._cp=false; if(estado.vista==='alocacao') renderAlocacao(); }).catch(()=>{ estado.alocacao._cp=false; }); }
  // Guarda a rolagem horizontal do Gantt para restaurar após o re-render (arrastar/zoom não "pulam").
  const _gtPrev=cont.querySelector('.gt-scroll'); const _gtSL=_gtPrev?_gtPrev.scrollLeft:null;
  const rows=alocRows(); const rv=alocFiltraRows(rows); const gran=estado.alocacao.gran||'semana';
  const pess=alocPessoas();   // pessoas reais + planejadas (🔮), só nesta tela
  const projs=(_projetosCache||[]).slice().sort((a,b)=>a.key.localeCompare(b.key));
  const pordPess=Object.entries(pess).filter(([a,p])=>!RE_EXCLUIR.test((p&&p.nome)||'')).sort((x,y)=>((x[1].nome||'')).localeCompare(y[1].nome||'','pt'));
  const M=alocMatriz(rv, gran);
  const nm=(a)=>(pess[a]&&pess[a].nome)||a;
  const pessoasOrd=M.pessoas.slice().sort((a,b)=>nm(a).localeCompare(nm(b),'pt'));
  // Grade de utilização (pessoa × coluna)
  const thCols=M.cols.map(c=>`<th class="num">${esc(c.label)}</th>`).join('');
  const gridRows=pessoasOrd.map(a=>{
    const cells=M.cols.map(c=>{ const d=M.dados[a].cols[c.key]; const u=d.cap?Math.round(d.al/d.cap*100):(d.al>0?999:0);
      const [cls]=alocStatus(u); const tip=(d.cap||d.al)?`${escA(nm(a))} · ${esc(c.label)}: ${alocH(d.al)} de ${alocH(d.cap)} (${u}%)`:'';
      return `<td class="num aloc-c ${cls}"${tip?` data-tip="${tip}"`:''}>${(d.cap||d.al)?u+'%':'·'}</td>`; }).join('');
    return `<tr><td>${esc(nm(a))}</td>${cells}</tr>`;
  }).join('');
  const grid = pessoasOrd.length ? `<div class="pl-wrap"><table class="aloc-grid"><thead><tr><th>Pessoa</th>${thCols}</tr></thead><tbody>${gridRows}</tbody></table></div>
    <div class="aloc-leg"><span><i class="disp"></i>≤80% disponível</span><span><i class="saud"></i>80–100% saudável</span><span><i class="aten"></i>100–120% atenção</span><span><i class="crit"></i>&gt;120% crítico</span></div>`
    : '<div class="muted small">Sem alocações ainda — comece no <strong>Planejamento por pessoa</strong> (abaixo): adicione a pessoa, os projetos e o % de cada um.</div>';
  // Resumo por pessoa (média por semana no horizonte)
  const semsR=alocSemanas(rv);
  const resumo=pessoasOrd.map(a=>{ let cap=0,al=0,n=0; semsR.forEach(w=>{ const aw=alocAlocadoSemana(rv,a,w); if(aw>0){ cap+=alocCapacSemana(a,w); al+=aw; n++; } });
    const u=cap?Math.round(al/cap*100):(al>0?999:0); const [cls,lbl]=alocStatus(u);
    return `<tr><td>${esc(nm(a))}</td><td class="num">${alocH(n?cap/n:0)}/sem</td><td class="num">${alocH(n?al/n:0)}/sem</td><td class="num">${u}%</td><td><span class="aloc-badge ${cls}">${lbl}</span></td></tr>`; }).join('');
  const resumoTab = pessoasOrd.length ? `<div class="pl-wrap"><table class="pl-tab"><thead><tr><th>Pessoa</th><th class="num">Capacidade</th><th class="num">Alocado</th><th class="num">Utilização</th><th>Status</th></tr></thead><tbody>${resumo}</tbody></table></div>` : '';
  // Board de planejamento (estilo Monday): o AGRUPAMENTO acompanha a visão selecionada —
  // Por Pessoa (padrão/Gantt/Simulação) · Por Projeto · Empresa (por tipo) · Por Skill.
  // Edição inline, sem botão de salvar — toda alteração persiste na hora (alocPersiste).
  const hj=hojeSP(); const semAtual=semChave(hj);
  const visaoB=estado.alocacao.visao||'pessoa';
  const modoB = visaoB==='projeto'?'projeto' : visaoB==='skill'?'skill' : visaoB==='empresa'?'tipo' : 'pessoa';
  const ativaSem=(x)=>/^\d{4}-\d{2}-\d{2}$/.test(x.inicio)&&/^\d{4}-\d{2}-\d{2}$/.test(x.fim)&&x.inicio<=somaDias(semAtual,6)&&x.fim>=semAtual;
  const pessoaSel=(x)=>'<select data-ab-f="accountId|'+escA(x.id)+'"><option value="">— pessoa —</option>'+
    pordPess.map(([id,pp])=>`<option value="${escA(id)}" ${x.accountId===id?'selected':''}>${esc(pp.nome||id)}</option>`).join('')+'</select>';
  const projetoSel=(x)=>{ const prSolto=x.projeto && !projs.some(pp=>pp.key===x.projeto);
    return `<span style="display:flex;align-items:center;min-width:0"><i class="gt-dot gtc${gtCor(x.projeto)}" style="flex:0 0 9px"></i><select data-ab-f="projeto|${escA(x.id)}"><option value="">— projeto —</option>${prSolto?`<option value="${escA(x.projeto)}" selected>${esc(x.projeto)}</option>`:''}${projs.map(pp=>`<option value="${escA(pp.key)}" ${x.projeto===pp.key?'selected':''}>${esc(pp.nome||pp.key)} (${esc(pp.key)})</option>`).join('')}</select></span>`; };
  const skillsCat=alocSkillsTodas();
  const funcaoSel=(x)=>{ const opts=[...new Set([...(x.funcao?[x.funcao]:[]), ...alocSkills(x.accountId), ...skillsCat])];
    return `<select data-ab-f="funcao|${escA(x.id)}" data-tip="Função da pessoa NESTA alocação — a mesma pessoa pode entrar mais de uma vez no mesmo projeto, com funções diferentes. As opções vêm das skills (aba Por Skill).">
      <option value="">— função —</option>${opts.map(s=>`<option value="${escA(s)}" ${x.funcao===s?'selected':''}>${esc(s)}</option>`).join('')}</select>`; };
  const tipoDot=(x)=>{ const tp=alocTipoDe(x); const lbl=((ALOC_TIPOS.find(([k])=>k===tp))||[tp,tp])[1];
    return `<i class="ab-tdot t-${escA(tp)}" data-tip="Tipo: ${escA(lbl)} — definido por PROJETO na aba Projetos"></i>`; };
  const linhaDe=(x)=>{
    const past=/^\d{4}-\d{2}-\d{2}$/.test(x.fim)&&x.fim<hj;
    const trav=alocTravada(x.accountId);
    const cf=alocConflitoDe(rows,x);
    const pct=alocPctDe(x.accountId,x.hSemana);
    const col1 = modoB==='pessoa' ? projetoSel(x) : pessoaSel(x);
    const col2 = (modoB==='pessoa'||modoB==='projeto') ? funcaoSel(x) : projetoSel(x);
    return `<div class="ab-row${past?' past':''}${trav?' travada':''}${cf?' conflito':''}">${col1}${col2}
      <input type="date" data-ab-f="inicio|${escA(x.id)}" value="${escA(x.inicio)}" title="Início" data-tip="Início — Ctrl+C copia · Ctrl+V cola (aceita um período inteiro: 29/06/2026 – 23/08/2026)">
      <input type="date" data-ab-f="fim|${escA(x.id)}" value="${escA(x.fim)}" title="Fim" data-tip="Fim — Ctrl+C copia · Ctrl+V cola (aceita um período inteiro)">
      <span class="ab-pctc"><input type="number" data-ab-pct="${escA(x.id)}" value="${pct}" min="0" step="5" title="% da capacidade da pessoa">% <span class="eq">= ${alocH(Number(x.hSemana)||0)}/sem</span></span>
      <span class="ab-acts">${cf?`<i class="ab-conf" data-tip="✕ CONFLITO: mesma pessoa, mesmo projeto e mesma função com período sobreposto (${escA(dataBR(cf.inicio))} – ${escA(dataBR(cf.fim))}). Ajuste o período ou defina funções diferentes.">⚠</i>`:''}${trav?'<i class="ab-conf" style="color:#64748B" data-tip="Alocações desta pessoa travadas (aguardando aprovação/aprovadas)">🔒</i>':''}${tipoDot(x)}<button class="ab-x" data-ab-cpd="${escA(x.id)}" title="Copiar o período (início – fim) para colar em outra linha" style="font-size:12px">📋</button><button class="ab-x" data-ab-dup="${escA(x.id)}" title="Duplicar esta alocação (a cópia entra na sequência do período)" style="font-size:12px">⧉</button><button class="ab-x" data-ab-del="${escA(x.id)}" title="Remover">×</button></span></div>`;
  };
  const cab = modoB==='pessoa' ? ['Projeto','Função'] : modoB==='projeto' ? ['Pessoa','Função'] : ['Pessoa','Projeto'];
  const colsHtml=`<div class="ab-cols"><span>${cab[0]}</span><span>${cab[1]}</span><span>Início</span><span>Fim</span><span>% Alocação</span><span></span></div>`;
  const chaveDe=(x)=> modoB==='pessoa'?(x.accountId||'') : modoB==='projeto'?(x.projeto||'') : modoB==='tipo'?alocTipoDe(x) : alocFuncaoDe(x);
  const gruposMap={};
  rows.forEach(x=>{ const k=chaveDe(x); (gruposMap[k]=gruposMap[k]||[]).push(x); });
  if(modoB==='pessoa') (estado.alocacao.pessNovas||[]).forEach(id=>{ if(!gruposMap[id]) gruposMap[id]=[]; });
  const rotuloDe=(k)=> modoB==='pessoa'?(k?nm(k):'Sem pessoa')
    : modoB==='projeto'?(k?`${k} — ${((projs.find(pp=>pp.key===k)||{}).nome||'')}`:'Sem projeto')
    : modoB==='tipo'?(((ALOC_TIPOS.find(([t])=>t===k))||[k,k])[1]) : (k||'Sem skill');
  const chaves=Object.keys(gruposMap).sort((x,y)=>rotuloDe(x).localeCompare(rotuloDe(y),'pt'));
  const addOpt='<option value="">+ adicionar projeto…</option>'+projs.map(pp=>`<option value="${escA(pp.key)}">${esc(pp.nome||pp.key)} (${esc(pp.key)})</option>`).join('');
  const addPessOpt='<option value="">+ adicionar pessoa…</option>'+pordPess.map(([id,pp])=>`<option value="${escA(id)}">${esc(pp.nome||id)}</option>`).join('');
  // Ordenação das linhas dentro de cada grupo — escolhida pelo usuário (lembrada no navegador).
  // Padrão: por PROJETO (A–Z) no planejamento por pessoa.
  const ordB=estado.alocacao.ordB||'alfa';
  const rotLin=(x)=> modoB==='pessoa' ? (x.projeto||'') : nm(x.accountId||'');
  const alocOrdena=(arr)=>{ const c=arr.slice();
    if(ordB==='insercao') return c;
    if(ordB==='fim') return c.sort((x,y)=>String(x.fim||'9999').localeCompare(String(y.fim||'9999')));
    if(ordB==='alfa') return c.sort((x,y)=>rotLin(x).localeCompare(rotLin(y),'pt'));
    if(ordB==='horas') return c.sort((x,y)=>(Number(y.hSemana)||0)-(Number(x.hSemana)||0));
    return c.sort((x,y)=>String(x.inicio||'9999').localeCompare(String(y.inicio||'9999')));
  };
  const grupos=chaves.map(k=>{
    const its=alocOrdena(gruposMap[k]);
    const rot=rotuloDe(k); const ci=gtCor(k||rot);
    const inic=(rot||'?').split(/\s+/).map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
    let res='';
    if(modoB==='pessoa'){
      const nomH=alocSemNomH(k); const alHoje=k?alocAlocadoSemana(rows,k,semAtual):0;
      const u=nomH?Math.round(alHoje/nomH*100):0; const [cls,lbl]=alocStatus(u);
      res=k?`<span class="ab-res">${its.length} projeto${its.length===1?'':'s'} · esta semana <strong>${alocH(alHoje)}</strong> de ${alocH(nomH)}</span>${u>0?` <span class="aloc-badge ${cls}">${u}% · ${esc(lbl)}</span>`:''}`
        :'<span class="ab-res">linhas sem pessoa — defina ou remova</span>';
    } else {
      const hAtiva=its.filter(ativaSem).reduce((s2,x)=>s2+(Number(x.hSemana)||0),0);
      const nPess=new Set(its.map(x=>x.accountId).filter(Boolean)).size;
      res=`<span class="ab-res">${nPess} pessoa${nPess===1?'':'s'} · ${its.length} alocação(ões) · esta semana <strong>${alocH(hAtiva)}</strong>/sem</span>`;
    }
    const linhas=its.map(linhaDe).join('');
    const add = (modoB==='pessoa' && k) ? `<div class="ab-add"><select data-ab-addproj="${escA(k)}">${addOpt}</select></div>`
      : (modoB==='projeto' && k) ? `<div class="ab-add"><select data-ab-addpessproj="${escA(k)}">${addPessOpt}</select></div>` : '';
    // Trava/aprovação por pessoa (só no agrupamento Por Pessoa)
    let trava='';
    if(modoB==='pessoa' && k){
      const tv=alocTravaDe(k);
      if(!tv) trava=`<button class="btn ab-tv" data-al-travar="${escA(k)}" data-tip="Congela as alocações desta pessoa e envia para o Diego aprovar">🔒 Travar p/ aprovação</button>`;
      else if(tv.status==='pendente'){
        trava=`<span class="aloc-badge aten" data-tip="Enviado por ${escA(tv.por||'?')} em ${escA(dataBR((tv.quando||'').slice(0,10)))}">⏳ aguardando aprovação do Diego</span>`
          +(souAprovador()
            ?` <button class="btn ab-tv" data-al-aprovar="${escA(k)}">✓ Aprovar</button><button class="btn ab-tv" data-al-recusar="${escA(k)}" data-tip="Recusa e libera a edição">✕ Recusar</button>`
            :` <button class="btn ab-tv" data-al-destravar="${escA(k)}" data-tip="Cancela o envio e libera a edição">destravar</button>`);
      } else trava=`<span class="aloc-badge saud" data-tip="Aprovado por ${escA(tv.aprovadoPor||'Diego')} em ${escA(dataBR((tv.quandoAprov||'').slice(0,10)))}">🔒 aprovado</span> <button class="btn ab-tv" data-al-destravar="${escA(k)}" data-tip="Libera a edição (a aprovação é descartada)">destravar</button>`;
    }
    return `<div class="ab-grupo"><div class="ab-head gtc${ci}"><span class="ab-av">${esc(inic)}</span><span class="ab-nome">${esc(rot)}</span>${res}<span class="spacer"></span>${trava}</div>
      ${linhas?colsHtml+linhas:'<div class="ab-row" style="grid-template-columns:1fr"><span class="muted small">Nenhuma alocação ainda.</span></div>'}${add}</div>`;
  }).join('');
  const jaNoBoard=new Set(modoB==='pessoa'?chaves:[]);
  const pessOpt='<option value="">+ adicionar pessoa…</option>'+pordPess.filter(([id])=>!jaNoBoard.has(id)).map(([id,pp])=>`<option value="${escA(id)}">${esc(pp.nome||id)}</option>`).join('');
  const tituloB = modoB==='pessoa'?'Planejamento por pessoa': modoB==='projeto'?'Planejamento por projeto': modoB==='tipo'?'Planejamento por tipo (Empresa)':'Planejamento por skill';
  const dicaB = modoB==='pessoa'?'atribua a pessoa aos projetos e ajuste o <strong>%</strong> de alocação'
    : modoB==='projeto'?'monte a <strong>equipe de cada projeto</strong> e ajuste o % de cada pessoa'
    : modoB==='tipo'?'as alocações agrupadas por <strong>tipo</strong> — o tipo é definido <strong>por projeto</strong>, na aba Projetos'
    : 'as alocações agrupadas pela <strong>função de cada alocação</strong> (ou a skill principal da pessoa — cadastre na visão Por Skill)';
  const ordSel=`<select class="aloc-fsel" data-al-ordb data-tip="Como ordenar as linhas dentro de cada grupo (fica lembrado neste navegador)">
      <option value="alfa" ${ordB==='alfa'?'selected':''}>ordenar: ${modoB==='pessoa'?'Projeto (A–Z)':'Nome (A–Z)'}</option>
      <option value="inicio" ${ordB==='inicio'?'selected':''}>ordenar: Início</option>
      <option value="fim" ${ordB==='fim'?'selected':''}>ordenar: Fim</option>
      <option value="horas" ${ordB==='horas'?'selected':''}>ordenar: h/sem ↓</option>
      <option value="insercao" ${ordB==='insercao'?'selected':''}>ordenar: como inseri</option>
    </select>`;
  const pendAprov=souAprovador()?Object.entries(cfg.alocTravas||{}).filter(([,tv])=>tv&&tv.status==='pendente').map(([a])=>nm(a)):[];
  const avisoAprov=pendAprov.length?`<div class="aviso" style="margin:0 0 10px">⏳ <strong>${pendAprov.length} alocação(ões) aguardando a SUA aprovação</strong>: ${esc(pendAprov.join(', '))} — aprove ou recuse no cabeçalho de cada pessoa (visão Por Pessoa).</div>`:'';
  const edCard=`${avisoAprov}<div style="margin:2px 0 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="muted small" style="font-weight:600">${tituloB}</span> <span class="muted small">— ${dicaB}; edite direto nos campos, <strong>salva sozinho</strong>.</span><span class="spacer"></span>${ordSel}</div>
      ${grupos||'<div class="muted small" style="margin-bottom:10px">Ninguém alocado ainda — comece adicionando uma pessoa abaixo.</div>'}
      ${modoB==='pessoa'?`<div class="ab-pess"><select data-ab-pess="1">${pessOpt}</select></div>`:''}
      <div class="muted small" style="margin-top:10px">O <strong>%</strong> é sobre a jornada da pessoa em <strong>Metas</strong> (${cfg.metaGlobalH}h/dia = ${cfg.metaGlobalH*5}h/sem, ajustável por pessoa)${idApontar()?'':' · identifique-se na aba Apontar para compartilhar a config'}. Na <strong>Linha do tempo</strong> dá para arrastar/redimensionar os períodos.</div>`;
  const granBtn=(v,l)=>`<button class="btn ${gran===v?'primario':''}" data-al-gran="${v}">${l}</button>`;
  const visao=estado.alocacao.visao||'pessoa';
  const V_DESC={pessoa:'Utilização de cada pessoa por semana/mês',gantt:'Linha do tempo: arraste para mover, puxe as bordas para redimensionar (salva sozinho)',projeto:'Equipe e planejado × apontado por projeto',semanas:'Planejado × realizado por semana do ano (ISO), com trava semanal do planejado',empresa:'Capacidade da empresa e faturável × não faturável',skill:'Capacidade × demanda por competência (Gap) + cadastro de skills',projetos:'Defina o TIPO (faturável, AMS, interno…) de cada projeto — vale para todas as alocações',acontratar:'Cadastre vagas (pessoas ainda não contratadas) para planejar com elas 🔮',relatorios:'Horas e custo planejados por pessoa/projeto/tipo/função, mês a mês, com CSV',simulacao:'Cenários "e se…" e busca de disponibilidade'};
  const vBtn=(v,l)=>`<button class="btn ${visao===v?'primario':''}" data-al-visao="${v}" title="${escA(V_DESC[v]||'')}">${l}</button>`;
  const fSkill=estado.alocacao.fSkill||'', fProj=estado.alocacao.fProj||'';
  const projetosAloc=[...new Set(rows.map(a=>a.projeto).filter(Boolean))].sort();
  const skillsAll=alocSkillsTodas();
  const filtros=`<span class="muted small">Filtros:</span> <select class="aloc-fsel" data-al-fskill><option value="">skill: todas</option>${skillsAll.map(s=>`<option ${fSkill===s?'selected':''}>${esc(s)}</option>`).join('')}</select> <select class="aloc-fsel" data-al-fproj><option value="">projeto: todos</option>${projetosAloc.map(k=>`<option value="${escA(k)}" ${fProj===k?'selected':''}>${esc(k)}</option>`).join('')}</select>${(fSkill||fProj)?` <button class="btn" data-al-flimpar="1">limpar</button> <span class="muted small">(${rv.length}/${rows.length})</span>`:''}`;
  const viewPessoa=`<div class="muted small" style="margin:6px 0 10px">Cada célula = <strong>utilização</strong> (alocado ÷ capacidade) da pessoa no período. A capacidade desconta <strong>fins de semana, feriados e ausências/férias</strong> automaticamente. &nbsp; ${granBtn('semana','Semana')} ${granBtn('mes','Mês')}</div>
      ${grid}
      ${resumoTab?`<div class="muted small" style="font-weight:600;margin:16px 0 4px">Resumo por pessoa <span class="muted" style="font-weight:400">(média por semana no horizonte)</span></div>${resumoTab}`:''}`;
  cont.replaceChildren(el(`<div>
    <div class="card full">
      <h2>🧑‍💼 Alocação <span>planejamento MACRO por período (sem limite de semana — ex.: feche as horas até o fim do ano) · o plano SEMANAL de cada pessoa fica em 👤 Meu trabalho → 📋 Minha Semana</span></h2>
      <div style="margin:4px 0 8px">${vBtn('pessoa','Por Pessoa')} ${vBtn('gantt','Linha do tempo')} ${vBtn('projeto','Por Projeto')} ${vBtn('semanas','📆 Semanas')} ${vBtn('empresa','Empresa')} ${vBtn('skill','Por Skill')} ${vBtn('projetos','Projetos')} ${vBtn('acontratar','A contratar 🔮')} ${vBtn('relatorios','📊 Relatórios')} ${vBtn('simulacao','Simulação')}</div>
      <div class="aloc-filtros" style="margin:0 0 12px">${(visao==='simulacao'||visao==='projetos'||visao==='acontratar'||visao==='semanas')?'':filtros}</div>
      ${visao==='gantt'?alocViewGantt(rv,pess):visao==='projeto'?alocViewProjeto(rv,pess):visao==='semanas'?alocViewSemanas(rows,pess):visao==='empresa'?alocViewEmpresa(rv,pess):visao==='skill'?alocViewSkill(rv,pess):visao==='projetos'?alocViewProjetos(rows):visao==='acontratar'?alocViewACont(rows):visao==='relatorios'?alocViewRelatorios(rv,pess):visao==='simulacao'?alocViewSimulacao(rv,pess):viewPessoa}
    </div>
    <div class="card full" style="margin-top:14px">${edCard}</div></div>`));
  // Restaura a rolagem do Gantt (ou posiciona em "hoje"/1ª barra na primeira vez).
  const _gt=cont.querySelector('.gt-scroll');
  if(_gt){ if(_gtSL!=null) _gt.scrollLeft=_gtSL; else { const tp=+(_gt.getAttribute('data-gt-target'))||0; if(tp>0) _gt.scrollLeft=Math.max(0, tp-140); } }
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
// ---- Planejamento: editor do plano (CRUD do plano, fases e funções) ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const t=e.target.closest&&e.target.closest('[data-pl-novo],[data-pl-edit],[data-pl-voltar],[data-pl-func-add],[data-pl-func-del],[data-pl-fase-add],[data-pl-row-del],[data-pl-epicos],[data-pl-salvar],[data-pl-excluir],[data-pl-aba],[data-pl-pess-del],[data-pl-real],[data-pl-real-recarrega]');
  if(!t) return;
  const pl=estado.planejamento;
  if(t.hasAttribute('data-pl-novo')){ pl.draft=planNovo(); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-edit')){ const p=(cfg.planos||[]).find(x=>x.id===t.getAttribute('data-pl-edit')); if(p){ pl.draft=JSON.parse(JSON.stringify(p)); renderPlanejamento(); } }
  else if(t.hasAttribute('data-pl-voltar')){ planSyncDraft(); pl.draft=null; renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-func-add')){ planSyncDraft(); pl.draft.funcoes.push(planFunc('')); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-func-del')){ planSyncDraft(); const fid=t.getAttribute('data-pl-func-del');
    pl.draft.funcoes=pl.draft.funcoes.filter(f=>f.id!==fid); pl.draft.fases.forEach(fa=>{ delete fa.aloc[fid]; }); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-fase-add')){ planSyncDraft(); pl.draft.fases.push(planFase({})); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-row-del')){ planSyncDraft(); pl.draft.fases.splice(+t.getAttribute('data-pl-row-del'),1); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-epicos')){ planPuxaEpicos(); }
  else if(t.hasAttribute('data-pl-salvar')){ planSalva(); }
  else if(t.hasAttribute('data-pl-excluir')){ const id=pl.draft&&pl.draft.id; cfg.planos=(cfg.planos||[]).filter(p=>p.id!==id); salvaCfg(); toast('Plano excluído.','ok'); pl.draft=null; renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-aba')){ planSyncDraft(); pl.aba=t.getAttribute('data-pl-aba'); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-pess-del')){ const p=t.getAttribute('data-pl-pess-del').split('|'); const arr=(pl.draft.pessoasPorFuncao||{})[p[0]]; if(arr) pl.draft.pessoasPorFuncao[p[0]]=arr.filter(a=>a!==p[1]); renderPlanejamento(); }
  else if(t.hasAttribute('data-pl-real')){ planCarregaReal(pl.draft, false); }
  else if(t.hasAttribute('data-pl-real-recarrega')){ planCarregaReal(pl.draft, true); }
});
// Ao mudar qualquer campo do editor: ressincroniza e re-renderiza (atualiza totais/dias úteis; tipo troca o layout).
document.getElementById('conteudo').addEventListener('change', (e)=>{
  const t=e.target;
  if(t && t.matches && t.matches('[data-pl-pess-add]')){ const fid=t.getAttribute('data-pl-pess-add'); const a=t.value;
    if(a && estado.planejamento.draft){ const d=estado.planejamento.draft; d.pessoasPorFuncao=d.pessoasPorFuncao||{}; d.pessoasPorFuncao[fid]=d.pessoasPorFuncao[fid]||[]; if(!d.pessoasPorFuncao[fid].includes(a)) d.pessoasPorFuncao[fid].push(a); renderPlanejamento(); } return; }
  if(t && t.matches && t.matches('[data-pl-meta],[data-pl-func],[data-pl-f],[data-pl-aloc]')){ planSyncDraft(); if(estado.planejamento.draft) renderPlanejamento(); }
});
// ---- Alocação macro: editor de alocações pessoa × projeto ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const t=e.target.closest&&e.target.closest('[data-ab-del],[data-ab-dup],[data-ab-cpd],[data-gt-dup],[data-al-gran],[data-al-visao],[data-al-real],[data-al-flimpar],[data-al-skdel],[data-al-skprim],[data-al-relcsv],[data-al-relreal],[data-al-odoo],[data-al-travar],[data-al-aprovar],[data-al-recusar],[data-al-destravar],[data-al-semtravar],[data-al-semdestravar],[data-al-semtoggle],[data-al-semcsv],[data-al-semtk],[data-al-plaprova],[data-al-plrecusa],[data-pp-add],[data-pp-del],[data-gt-zoom],[data-gt-hoje],[data-sim-add],[data-sim-del],[data-sim-limpar],[data-sim-fromfind]'); if(!t) return;
  if(t.hasAttribute('data-al-travar')){ const a=t.getAttribute('data-al-travar'); const id=idApontar()||{};
    cfg.alocTravas=cfg.alocTravas||{};
    cfg.alocTravas[a]={ status:'pendente', por:id.nome||id.email||'—', quando:new Date().toISOString() };
    logAcao({acao:'alocacao-travar', t:(alocPessoas()[a]||{}).nome||a, para:'aguardando aprovação (Diego)', ok:true}, false);
    salvaCfg(); toast('🔒 Alocações travadas e enviadas para a aprovação do Diego.','ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-aprovar')){ const a=t.getAttribute('data-al-aprovar'); const id=idApontar()||{};
    if(!souAprovador()){ toast('Só o Diego (aprovador) pode aprovar.','warn'); return; }
    const tv=(cfg.alocTravas||{})[a]; if(!tv) return;
    tv.status='aprovado'; tv.aprovadoPor=id.nome||id.email||'Diego'; tv.quandoAprov=new Date().toISOString();
    logAcao({acao:'alocacao-aprovar', t:(alocPessoas()[a]||{}).nome||a, para:'aprovado', ok:true}, false);
    salvaCfg(); toast('✓ Alocação aprovada — segue travada até destravar.','ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-recusar')){ const a=t.getAttribute('data-al-recusar');
    if(!souAprovador()){ toast('Só o Diego (aprovador) pode recusar.','warn'); return; }
    delete (cfg.alocTravas||{})[a];
    logAcao({acao:'alocacao-recusar', t:(alocPessoas()[a]||{}).nome||a, para:'recusado — liberado para edição', ok:true}, false);
    salvaCfg(); toast('✕ Recusado — a alocação voltou a ficar editável.','warn'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-destravar')){ const a=t.getAttribute('data-al-destravar');
    delete (cfg.alocTravas||{})[a];
    logAcao({acao:'alocacao-destravar', t:(alocPessoas()[a]||{}).nome||a, para:'liberado para edição', ok:true}, false);
    salvaCfg(); toast('🔓 Destravado — edição liberada.','ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-pp-add')){ ppLista().push(ppNova()); salvaCfg(); renderAlocacao();
    setTimeout(()=>{ const ins=document.querySelectorAll('[data-pp-f^="nome|"]'); const ult=ins[ins.length-1]; if(ult) ult.focus(); },40);
    return; }
  if(t.hasAttribute('data-pp-del')){ const id=t.getAttribute('data-pp-del');
    const nAl=alocRows().filter(a=>a.accountId===id).length;
    estado.alocacao.rows=alocRows().filter(a=>a.accountId!==id);
    cfg.alocacoes=JSON.parse(JSON.stringify(estado.alocacao.rows));
    cfg.pessoasPlanejadas=ppLista().filter(p=>p.id!==id);
    salvaCfg(); toast(nAl?`Vaga removida junto com ${nAl} alocação(ões).`:'Vaga removida.','ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-ab-del')){ const rid=t.getAttribute('data-ab-del'); const rs=alocRows(); const ix=rs.findIndex(r=>r.id===rid);
    if(ix>=0){ if(alocTravaBloqueia(rs[ix].accountId)) return; rs.splice(ix,1); alocPersiste(); } renderAlocacao(); return; }
  if(t.hasAttribute('data-ab-cpd')){ const a=alocRows().find(r=>r.id===t.getAttribute('data-ab-cpd'));
    if(a){ const txt=(a.inicio?dataBR(a.inicio):'?')+' – '+(a.fim?dataBR(a.fim):'?');
      const done=()=>{ try{ toast('📋 Período copiado: '+txt+' — Ctrl+V em um campo de data de outra linha preenche início E fim'); }catch(_){} };
      try{ navigator.clipboard.writeText(txt).then(done,()=>{}); }
      catch(_){ const ta=document.createElement('textarea'); ta.value=txt; document.body.appendChild(ta); ta.select();
        try{ if(document.execCommand('copy')) done(); }catch(__){} ta.remove(); } }
    return; }
  if(t.hasAttribute('data-al-skdel')){ const v=t.getAttribute('data-al-skdel'); const i=v.indexOf('|'); const a=v.slice(0,i), s=v.slice(i+1);
    alocSkillsSet(a, alocSkills(a).filter(x=>x!==s)); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-skprim')){ const v=t.getAttribute('data-al-skprim'); const i=v.indexOf('|'); const a=v.slice(0,i), s=v.slice(i+1);
    alocSkillsSet(a, [s, ...alocSkills(a).filter(x=>x!==s)]); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-relcsv')){
    const pess=alocPessoas(); const D=alocRelDados(alocFiltraRows(alocRows()), pess);
    const gl={pessoa:'Pessoa',projeto:'Projeto',tipo:'Tipo',skill:'Função/Skill'}[D.grupo]||'Grupo';
    const mr=D.temReal&&D.grupoRealOk;
    const efi=(p,r)=>p?Math.round((r||0)/p*100)+'%':'';
    const head=[gl, ...D.meses.map(labelMesAbbr), 'Total h', '%', ...(mr?['Realizado h','Eficiência']:[]), 'Custo R$'];
    const rowsCsv=D.linhas.map(l=>[l.rot, ...D.meses.map(m=>l.meses[m]?Math.round(l.meses[m]*10)/10:''),
      Math.round(l.h*10)/10, D.totH?Math.round(l.h/D.totH*100)+'%':'',
      ...(mr?[Math.round((l.real||0)*10)/10, efi(l.h,l.real)]:[]), l.c?Math.round(l.c):'']);
    rowsCsv.push(['Total', ...D.meses.map(m=>D.mesTot[m]?Math.round(D.mesTot[m]*10)/10:''), Math.round(D.totH*10)/10, D.totH?'100%':'',
      ...(mr?[Math.round(D.realTot*10)/10, efi(D.totH,D.realTot)]:[]), D.totC?Math.round(D.totC):'']);
    if(D.temReal){ rowsCsv.push([]); rowsCsv.push(['Semana','Planejado h','Realizado h','Eficiência']);
      [...new Set([...D.wks, ...Object.keys(D.realSem)])].sort()
        .filter(w=>(D.planSem[w]||0)>0||(D.realSem[w]||0)>0)
        .forEach(w=>rowsCsv.push([fmtBR(w), Math.round((D.planSem[w]||0)*10)/10, Math.round((D.realSem[w]||0)*10)/10, efi(D.planSem[w],D.realSem[w])])); }
    baixaCSV('relatorio_alocacao.csv',[head,...rowsCsv]);
    return; }
  if(t.hasAttribute('data-al-relreal')){
    const R=estado.alocacao.rel=estado.alocacao.rel||{};
    if(!R.ini||!R.fim){ toast('Defina o período do relatório primeiro.','warn'); return; }
    const RR=estado.alocacao.relReal=estado.alocacao.relReal||{};
    RR.carregando=true; RR.erro=''; RR.range=R.ini+'|'+R.fim; renderAlocacao();
    fetch(`/api/tempo?desde=${encodeURIComponent(R.ini)}&ate=${encodeURIComponent(R.fim)}`).then(r=>r.json()).then(j=>{
      RR.carregando=false;
      if(j.erro){ RR.erro=humanizaErro(j.erro); RR.wl=null; } else RR.wl=j.worklogs||[];
      if(estado.vista==='alocacao') renderAlocacao();
    }).catch(e=>{ RR.carregando=false; RR.erro=humanizaErro(e); RR.wl=null; if(estado.vista==='alocacao') renderAlocacao(); });
    return; }
  if(t.hasAttribute('data-al-odoo')){
    t.disabled=true; t.textContent='Importando…';
    fetch('/api/usuarios?custos=1').then(r=>r.json()).then(j=>{
      if(!j || j.configurado===false || j.erro){ toast((j&&j.erro)||'Odoo não configurado.','warn'); renderAlocacao(); return; }
      const porEmail={}, porNome={};
      (j.custos||[]).forEach(c=>{ if(c.custo>0){ if(c.email) porEmail[c.email]=c.custo; if(c.nome) porNome[c.nome.trim().toLowerCase()]=c.custo; } });
      let ok=0; const sem=[];
      cfg.custosPessoa=cfg.custosPessoa||{};
      Object.entries(pessoasUnidas()).forEach(([a,p])=>{
        if(RE_EXCLUIR.test((p&&p.nome)||'')) return;
        const em=((p&&p.email)||'').toLowerCase(); const nomeN=((p&&p.nome)||'').trim().toLowerCase();
        const c=(em&&porEmail[em]!=null)?porEmail[em]:(porNome[nomeN]!=null?porNome[nomeN]:null);
        if(c!=null){ cfg.custosPessoa[a]=c; ok++; } else sem.push((p&&p.nome)||a);
      });
      if(ok) salvaCfg();
      toast(ok?`✓ ${ok} custo(s) importado(s) do Odoo (campo ${j.campo||'hourly_cost'})${sem.length?` · sem correspondência: ${sem.slice(0,3).join(', ')}${sem.length>3?'…':''}`:''}`
        :'Nenhum funcionário do Odoo casou com as pessoas do Jira (por e-mail/nome).', ok?'ok':'warn');
      renderAlocacao();
    }).catch(e=>{ toast('Erro ao consultar o Odoo: '+(e.message||e),'err'); renderAlocacao(); });
    return; }
  if(t.hasAttribute('data-ab-dup')||t.hasAttribute('data-gt-dup')){
    const rid=t.getAttribute('data-ab-dup')||t.getAttribute('data-gt-dup');
    const rs=alocRows(); const ix=rs.findIndex(r=>r.id===rid);
    if(ix>=0){ const o=rs[ix]; if(alocTravaBloqueia(o.accountId)) return;
      const c=JSON.parse(JSON.stringify(o)); c.id='al'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
      // A cópia entra NA SEQUÊNCIA do período original — evita o conflito de sobreposição.
      if(/^\d{4}-\d{2}-\d{2}$/.test(o.inicio)&&/^\d{4}-\d{2}-\d{2}$/.test(o.fim)){
        const len=gtDiff(o.inicio,o.fim); c.inicio=gtAdd(o.fim,1); c.fim=gtAdd(c.inicio,len);
      }
      const cf=alocConflitoDe(rs.concat([c]), c);
      if(cf){ alocAvisaConflito(cf); return; }
      rs.splice(ix+1,0,c); alocPersiste(); toast('✓ Duplicada na sequência do período — ajuste as datas/% da cópia.','ok'); renderAlocacao(); }
    return; }
  if(t.hasAttribute('data-gt-hoje')){ const g=document.querySelector('.gt-scroll'); if(g){ const tp=+(g.getAttribute('data-gt-target'))||0; if(g.scrollTo) g.scrollTo({left:Math.max(0,tp-140),behavior:'smooth'}); else g.scrollLeft=Math.max(0,tp-140); } return; }
  if(t.hasAttribute('data-gt-zoom')){ const d=t.getAttribute('data-gt-zoom')==='in'?4:-4; estado.alocacao.gz=Math.max(10,Math.min(44,gtZoom()+d)); alocUISave(); renderAlocacao(); return; }
  if(t.hasAttribute('data-sim-add')){ simSync(); simRows().push(simNova()); renderAlocacao(); return; }
  if(t.hasAttribute('data-sim-del')){ simSync(); simRows().splice(+t.getAttribute('data-sim-del'),1); renderAlocacao(); return; }
  if(t.hasAttribute('data-sim-limpar')){ estado.alocacao.sim=[]; renderAlocacao(); return; }
  if(t.hasAttribute('data-sim-fromfind')){ simSync(); simFindSync(); const f=estado.alocacao.find||{};
    simRows().push(simNova({ accountId:t.getAttribute('data-sim-fromfind'), projeto:(f.rot||'Novo projeto'), inicio:f.ini||'', fim:f.fim||'', hSemana:Math.max(0,Number(f.h)||0) }));
    toast('✓ Adicionado ao cenário.','ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-flimpar')){ estado.alocacao.fSkill=''; estado.alocacao.fProj=''; renderAlocacao(); return; }
  // 📆 Semanas: travar (snapshot do planejado), destravar, abrir por pessoa e CSV.
  if(t.hasAttribute('data-al-semtravar')){ const w=t.getAttribute('data-al-semtravar');
    const rows=alocRows(); const id=idApontar();
    const horas=alocSemHorasVivas(rows,w);
    cfg.alocSemTravas=cfg.alocSemTravas||{};
    cfg.alocSemTravas[semTravaKey(w)]={ quando:new Date().toISOString(), por:(id&&id.accountId)||'', porNome:(id&&id.email)||'', horas };
    salvaCfg(); const s=isoSemana(w);
    toast(`🔒 Semana S${s.num}/${s.ano} travada — planejado congelado.`,'ok'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-semdestravar')){ const w=t.getAttribute('data-al-semdestravar');
    const s=isoSemana(w);
    if(!window.confirm(`Destravar a semana S${s.num}/${s.ano}? O planejado volta a seguir as alocações atuais.`)) return;
    if(cfg.alocSemTravas) delete cfg.alocSemTravas[semTravaKey(w)];
    salvaCfg(); toast('🔓 Semana destravada.','warn'); renderAlocacao(); return; }
  if(t.hasAttribute('data-al-semtoggle')){ const w=t.getAttribute('data-al-semtoggle');
    estado.alocacao.semAberta=estado.alocacao.semAberta||{};
    estado.alocacao.semAberta[w]=!estado.alocacao.semAberta[w]; renderAlocacao(); return; }
  if(t.hasAttribute('data-al-semcsv')){ const rows=alocRows();
    const linhas=[['Semana','Inicio','Fim','AlocadoH','PlanoEquipeH','RealizadoH','Delta','Travada']];
    const ids=new Set(rows.map(a=>a.accountId).filter(Boolean));
    alocSemanas(rows).forEach(w=>{ const s=isoSemana(w);
      const pl=alocSemPlanejado(rows,w); const planH=Object.values(pl.horas).reduce((x,h)=>x+h,0);
      const pe=alocSemPlanoEquipe(w); let peH=0; Object.keys(pl.horas).forEach(a=>{ peH+=(pe[a]&&pe[a].h)||0; });
      const rp=alocSemRealizado(w); let re=null;
      if(rp){ re=0; Object.entries(rp).forEach(([a,h])=>{ if(ids.has(a)) re+=h; }); }
      const f1=(v)=>String(Math.round(v*10)/10).replace('.',',');
      linhas.push([`S${s.num}/${s.ano}`, w, somaDias(w,6), f1(planH), f1(peH), re==null?'':f1(re), re==null?'':f1(re-planH), pl.travada?'sim':'nao']);
    });
    baixaCSV('planejado-semanas', linhas); return; }
  // ✔/✖ Decisão de plano semanal: agora vive no Meu Planejamento → Aprovações
  // (o modelo antigo por tickets é somente leitura; a decisão usa o modelo novo).
  if(t.hasAttribute('data-al-plaprova')||t.hasAttribute('data-al-plrecusa')){
    estado.minhasemana.aba='aprovacoes';
    vaiPara('minhasemana'); return; }
  // 🔎 Plano × apontado por TICKET de uma pessoa numa semana (desvio no detalhe)
  if(t.hasAttribute('data-al-semtk')){ const at=t.getAttribute('data-al-semtk');
    const i=at.lastIndexOf('|'); const acc=at.slice(0,i); const w=at.slice(i+1); const wf=somaDias(w,6);
    const s=isoSemana(w);
    const pn=msPlanoDe(acc,w); const itens=(pn&&pn.itens)||[];
    const wl=(estado.alocacao.real&&estado.alocacao.real.wl)||[];
    const realTk={}; wl.forEach(x=>{ const d=(x.d||'').slice(0,10); if(x.a===acc&&x.k&&d>=w&&d<=wf) realTk[x.k]=(realTk[x.k]||0)+(Number(x.s)||0)/3600; });
    const noPlano=new Set(itens.map(x=>x.k));
    const fora=Object.entries(realTk).filter(([k])=>!noPlano.has(k)).sort((a,b)=>b[1]-a[1]);
    const f=(h)=>alocH(h||0);
    const linhasTk=itens.map(x=>{ const eff=msHorasItem(x,w); const re=realTk[x.k]||0; const dl=re-eff;
      return `<tr><td><a href="${projJira(x.k)}" target="_blank" rel="noopener">${esc(x.k)}</a>${x.rot?' <span class="badge ms-b-rot" data-tip="Rotina diária (h/dia × dias úteis)">🔁</span>':''}</td><td class="num">${f(eff)}</td><td class="num">${f(re)}</td><td class="num" style="color:${dl>0.01?'#b45309':dl<-0.01?'#166534':'inherit'}">${dl>0?'+':''}${f(dl)}</td></tr>`; }).join('');
    const linhasFora=fora.map(([k,h])=>`<tr><td><a href="${projJira(k)}" target="_blank" rel="noopener">${esc(k)}</a> <span class="badge ms-b-sem" data-tip="Apontou aqui, mas o ticket não estava no plano">fora do plano</span></td><td class="num">—</td><td class="num">${f(h)}</td><td class="num" style="color:#b45309">+${f(h)}</td></tr>`).join('');
    abreModal(`<h2>🔎 ${esc((pn&&pn.nome)||acc)} — S${s.num}/${s.ano}</h2>
      <div class="muted small">Plano (📋 Minha Semana) × apontado por ticket · ${esc(fmtBR(w))}–${esc(fmtBR(wf))}${pn&&pn.atualizadoEm?` · plano atualizado em ${esc(fmtBR((pn.atualizadoEm||'').slice(0,10)))}`:''}</div>
      <div class="scroll-x" style="margin-top:8px"><table><thead><tr><th>Ticket</th><th class="num">Plano</th><th class="num">Apontado</th><th class="num">Δ</th></tr></thead>
      <tbody>${linhasTk||''}${linhasFora||''}${(!linhasTk&&!linhasFora)?'<tr><td colspan="4" class="muted">Sem plano e sem apontamentos nesta semana.</td></tr>':''}</tbody></table></div>`);
    return; }
  if(t.hasAttribute('data-al-gran')){ estado.alocacao.gran=t.getAttribute('data-al-gran'); alocUISave(); renderAlocacao(); }
  else if(t.hasAttribute('data-al-visao')){ estado.alocacao.visao=t.getAttribute('data-al-visao'); alocUISave(); renderAlocacao(); }
  else if(t.hasAttribute('data-al-real')){ alocCarregaReal(alocRows(), true); }
});
// Enter no campo "+ skill" adiciona a skill (o change cobre a escolha via datalist/blur).
document.getElementById('conteudo').addEventListener('keydown', (e)=>{
  const t=e.target; if(!t||!t.matches||!t.matches('.al-skadd')||e.key!=='Enter') return;
  e.preventDefault();
  const a=t.getAttribute('data-al-skadd'); const s=(t.value||'').trim();
  if(!a||!s) return;
  const cur=alocSkills(a); if(!cur.includes(s)) cur.push(s);
  alocSkillsSet(a, cur); t.value=''; alocRedraw();
  setTimeout(()=>{ const nb=[...document.querySelectorAll('.al-skadd')].find(x=>x.getAttribute('data-al-skadd')===a); if(nb) nb.focus(); },40);
});
// Re-render ADIADO (fora do dispatch do change): trocar o DOM no meio do evento —
// com o campo ainda focado — dispara blur/change reentrantes e quebra o replaceChildren.
let _alocRedrawT=null;
function alocRedraw(){ clearTimeout(_alocRedrawT); _alocRedrawT=setTimeout(()=>{ if(estado.vista==='alocacao') renderAlocacao(); },0); }
document.getElementById('conteudo').addEventListener('change', (e)=>{ const t=e.target; if(!t||!t.matches) return;
  if(t.matches('[data-al-fskill]')){ estado.alocacao.fSkill=t.value; alocRedraw(); return; }
  if(t.matches('[data-al-fproj]')){ estado.alocacao.fProj=t.value; alocRedraw(); return; }
  if(t.matches('[data-al-ordb]')){ estado.alocacao.ordB=t.value; alocUISave(); alocRedraw(); return; }
  if(t.matches('[data-al-ptipo]')){ const k=t.getAttribute('data-al-ptipo'); cfg.projTipos=cfg.projTipos||{};
    if(t.value) cfg.projTipos[k]=t.value; else delete cfg.projTipos[k];
    salvaCfg(); alocRedraw(); return; }
  if(t.matches('[data-pp-f]')){ const p=t.getAttribute('data-pp-f').split('|'); const pp=ppLista().find(x=>x.id===p[1]);
    if(pp){ if(p[0]==='skills') pp.skills=t.value.split(',').map(x=>x.trim()).filter(Boolean);
      else if(p[0]==='hSem'||p[0]==='custoH') pp[p[0]]=Math.max(0,Number(t.value)||0);
      else pp[p[0]]=t.value;
      salvaCfg(); } alocRedraw(); return; }
  if(t.matches('[data-al-relg]')){ (estado.alocacao.rel=estado.alocacao.rel||{}).grupo=t.value; alocRedraw(); return; }
  if(t.matches('[data-al-relini]')){ (estado.alocacao.rel=estado.alocacao.rel||{}).ini=t.value; alocRedraw(); return; }
  if(t.matches('[data-al-relfim]')){ (estado.alocacao.rel=estado.alocacao.rel||{}).fim=t.value; alocRedraw(); return; }
  if(t.matches('[data-al-custo]')){ const a=t.getAttribute('data-al-custo'); cfg.custosPessoa=cfg.custosPessoa||{};
    const v=Math.max(0,Number(t.value)||0); if(v) cfg.custosPessoa[a]=v; else delete cfg.custosPessoa[a];
    salvaCfg(); alocRedraw(); return; }
  if(t.matches('.al-skadd')){ const a=t.getAttribute('data-al-skadd'); const s=(t.value||'').trim();
    if(a&&s){ const cur=alocSkills(a); if(!cur.includes(s)) cur.push(s);
      alocSkillsSet(a, cur); t.value=''; alocRedraw(); } return; }
  if(t.matches('[data-sim-f]')){ simSync(); alocRedraw(); return; }
  if(t.matches('[data-find-f]')){ simFindSync(); alocRedraw(); return; }
  // Board por pessoa: campos referenciam a alocação por ID (um "change" tardio do DOM
  // antigo, disparado durante o re-render, no máximo regrava o mesmo valor — nunca a linha errada).
  if(t.matches('[data-ab-f]')){ const p=t.getAttribute('data-ab-f').split('|'); const a=alocRows().find(r=>r.id===p[1]);
    if(a){
      if(alocTravaBloqueia(a.accountId)){ alocRedraw(); return; }
      const antigo=a[p[0]]; a[p[0]]=t.value;
      if(p[0]==='accountId' && t.value && alocTravaBloqueia(t.value)){ a[p[0]]=antigo; alocRedraw(); return; }
      const cf=alocConflitoDe(alocRows(), a);
      if(cf){ a[p[0]]=antigo; alocAvisaConflito(cf); alocRedraw(); return; }
      alocPersiste();
    } alocRedraw(); return; }
  if(t.matches('[data-ab-pct]')){ const a=alocRows().find(r=>r.id===t.getAttribute('data-ab-pct'));
    if(a){ if(alocTravaBloqueia(a.accountId)){ alocRedraw(); return; }
      const pct=Math.max(0,Number(t.value)||0); a.hSemana=Math.round(pct/100*alocSemNomH(a.accountId)*2)/2; alocPersiste(); } alocRedraw(); return; }
  if(t.matches('[data-ab-addpessproj]')){ const k=t.getAttribute('data-ab-addpessproj'); const pid=t.value; if(!pid||!k) return;
    if(alocTravaBloqueia(pid)){ alocRedraw(); return; }
    const ini=semChave(hojeSP());
    const nova=Object.assign(alocNova(),{ accountId:pid, projeto:k, inicio:ini, fim:somaDias(ini,55), hSemana:Math.round(alocSemNomH(pid)*0.2) });
    const cf=alocConflitoDe(alocRows().concat([nova]), nova);
    if(cf){ alocAvisaConflito(cf); alocRedraw(); return; }
    alocRows().push(nova);
    alocPersiste(); alocRedraw(); return; }
  if(t.matches('[data-ab-addproj]')){ const pid=t.getAttribute('data-ab-addproj'); const k=t.value; if(!pid||!k) return;
    if(alocTravaBloqueia(pid)){ alocRedraw(); return; }
    const ini=semChave(hojeSP());
    const nova=Object.assign(alocNova(),{ accountId:pid, projeto:k, inicio:ini, fim:somaDias(ini,55), hSemana:Math.round(alocSemNomH(pid)*0.2) });
    const cf=alocConflitoDe(alocRows().concat([nova]), nova);
    if(cf){ alocAvisaConflito(cf); alocRedraw(); return; }
    alocRows().push(nova);
    estado.alocacao.pessNovas=(estado.alocacao.pessNovas||[]).filter(x=>x!==pid);
    alocPersiste(); alocRedraw(); return; }
  if(t.matches('[data-ab-pess]')){ const id=t.value; if(id && !(estado.alocacao.pessNovas||[]).includes(id)) estado.alocacao.pessNovas.push(id); alocRedraw(); return; } });
// ---- Gantt de alocação: arrastar para mover · puxar bordas para redimensionar (salva ao soltar) ----
let _gtDrag=null;
document.getElementById('conteudo').addEventListener('pointerdown', (e)=>{
  if(e.button!==undefined && e.button!==0) return;
  if(e.target.closest&&e.target.closest('.gt-dup')) return;   // duplicar não é arrastar
  const bar=e.target.closest&&e.target.closest('[data-gt-idx]'); if(!bar) return;
  const h=e.target.closest('[data-gt-h]'); const mode=h?('resize-'+h.getAttribute('data-gt-h')):'move';
  const rows=alocRows(); const idx=+bar.getAttribute('data-gt-idx'); const a=rows[idx]; if(!a) return;
  _gtDrag={ idx, mode, x0:e.clientX, D:gtZoom(), ini:a.inicio, fim:a.fim, w0:parseFloat(bar.style.width)||0, bar, dd:0, moved:false, travada:alocTravada(a.accountId) };
  bar.classList.add('dragging'); try{ bar.setPointerCapture(e.pointerId); }catch(_){}
  e.preventDefault();
});
document.addEventListener('pointermove', (e)=>{ const g=_gtDrag; if(!g) return;
  if(g.travada){ if(!g.avisou){ g.avisou=true; const a=alocRows()[g.idx]; if(a) alocTravaBloqueia(a.accountId); } return; }
  const dd=Math.round((e.clientX-g.x0)/g.D); if(dd!==g.dd) g.moved=true; g.dd=dd; const b=g.bar;
  if(g.mode==='move') b.style.transform=`translateX(${dd*g.D}px)`;
  else if(g.mode==='resize-r') b.style.width=Math.max(g.D, g.w0+dd*g.D)+'px';
  else if(g.mode==='resize-l'){ const nd=Math.min(dd, (g.w0/g.D)-1); b.style.transform=`translateX(${nd*g.D}px)`; b.style.width=Math.max(g.D, g.w0-nd*g.D)+'px'; }
  const nx=gtDatas(g.mode, g.ini, g.fim, dd); const inf=document.getElementById('gtInfo'); if(inf) inf.textContent=`${fmtBR(nx.ini)} – ${fmtBR(nx.fim)}`;
});
document.addEventListener('pointerup', (e)=>{ const g=_gtDrag; if(!g) return; _gtDrag=null;
  g.bar.classList.remove('dragging');
  if(g.moved && g.dd!==0){ const a=alocRows()[g.idx];
    if(a){
      if(alocTravaBloqueia(a.accountId)){ renderAlocacao(); return; }
      const nx=gtDatas(g.mode, g.ini, g.fim, g.dd); const antigo={i:a.inicio,f:a.fim};
      a.inicio=nx.ini; a.fim=nx.fim;
      const cf=alocConflitoDe(alocRows(), a);
      if(cf){ a.inicio=antigo.i; a.fim=antigo.f; alocAvisaConflito(cf); }
      else { alocPersiste(); toast('✓ Alocação atualizada e salva.','ok'); }
    }
    renderAlocacao();
  } else {
    g.bar.style.transform=''; const inf=document.getElementById('gtInfo'); if(inf) inf.textContent='';
    // Clique sem arrastar: abre os detalhes do projeto daquela barra.
    if(!g.moved){ const a=alocRows()[g.idx]; if(a) abreGtInfo(a); }
  }
});
// Painel ao CLICAR numa barra do Gantt: o projeto (nome, tipo herdado), a alocação
// clicada e o resumo do projeto no plano (equipe, horas e custo previsto).
function abreGtInfo(al){
  const pess=alocPessoas(); const nm=(id)=>(pess[id]&&pess[id].nome)||id;
  const k=al.projeto||'—';
  const pj=(_projetosCache||[]).find(p=>p.key===k);
  const tipo=alocTipoDe(al); const tipoL=((ALOC_TIPOS.find(([t])=>t===tipo))||[tipo,tipo])[1];
  const rows=alocRows().filter(x=>x.projeto===k && /^\d{4}-\d{2}-\d{2}$/.test(x.inicio) && /^\d{4}-\d{2}-\d{2}$/.test(x.fim));
  const per=alocPeriodo(rows);
  const semanas=rows.length?alocSemanas(rows).filter(w=>!per.fim||w<=semChave(per.fim)):[];
  let plan=0, custo=0, semCusto=false;
  semanas.forEach(w=>{ const wf=somaDias(w,6); rows.forEach(x=>{ if(x.inicio<=wf&&x.fim>=w){
    const h=Number(x.hSemana)||0; plan+=h; const c=alocCustoH(x.accountId);
    if(c>0) custo+=h*c; else if(x.accountId) semCusto=true; } }); });
  const equipe=rows.slice().sort((x,y)=>nm(x.accountId).localeCompare(nm(y.accountId),'pt')).map(x=>`
    <tr${x.id===al.id?' style="font-weight:700"':''}><td>${esc(nm(x.accountId))}${x.id===al.id?' ◄':''}</td><td>${esc(x.funcao||'—')}</td>
      <td>${esc(fmtBR(x.inicio))} – ${esc(fmtBR(x.fim))}</td>
      <td class="num">${alocH(Number(x.hSemana)||0)}/sem · ${alocPctDe(x.accountId,x.hSemana)}%</td></tr>`).join('');
  let url=''; try{ url=`${jiraBase()}/projects/${encodeURIComponent(k)}`; }catch(_){}
  abreModal(`
    <h2><i class="gt-dot gtc${gtCor(k)}"></i> ${esc(k)}${pj&&pj.nome?(' — '+esc(pj.nome)):''} <span>projeto na alocação</span></h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 4px">
      <span class="ab-tdot t-${escA(tipo)}"></span><strong>${esc(tipoL)}</strong>
      <span class="muted small">(tipo do projeto — aba Projetos)</span>
      ${url&&k!=='—'?`<span class="spacer"></span><a href="${escA(url)}" target="_blank" rel="noopener">abrir no Jira ↗</a>`:''}
    </div>
    <div class="pl-destino" style="margin:10px 0"><strong>Alocação clicada:</strong>
      ${esc(nm(al.accountId))}${al.funcao?` · ${esc(al.funcao)}`:''} ·
      ${esc(fmtBR(al.inicio))} – ${esc(fmtBR(al.fim))} · <strong>${alocH(Number(al.hSemana)||0)}/sem</strong>
      <span class="muted">(${alocPctDe(al.accountId,al.hSemana)}% da capacidade da pessoa)</span></div>
    <div class="muted small" style="font-weight:600;margin:12px 0 4px">Equipe do projeto
      <span class="muted" style="font-weight:400">(${rows.length} alocação(ões)${per.ini?` · ${esc(fmtBR(per.ini))} – ${esc(fmtBR(per.fim))}`:''})</span></div>
    <div class="pl-wrap"><table class="pl-tab"><thead><tr><th>Pessoa</th><th>Função</th><th>Período</th><th class="num">Alocação</th></tr></thead>
      <tbody>${equipe||'<tr><td colspan="4" class="muted small">—</td></tr>'}</tbody></table></div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:10px">
      <span><strong>${alocH(plan)}</strong> <span class="muted small">planejadas no horizonte do projeto</span></span>
      ${custo>0?`<span><strong>R$ ${Math.round(custo).toLocaleString('pt-BR')}</strong> <span class="muted small">custo previsto${semCusto?' (parcial — há gente sem custo/h)':''}</span></span>`:''}
    </div>
    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
      <button class="btn primario" data-gtinfo-filtrar="${escA(k)}">🔎 Filtrar este projeto na tela</button>
      <button class="btn" id="gtinfo-fechar">Fechar</button>
    </div>`);
}
document.addEventListener('paste', (e)=>{
  const t=(e.target&&e.target.tagName==='INPUT')?e.target:document.activeElement;
  if(!t||t.tagName!=='INPUT'||t.type!=='date'||t.disabled||t.readOnly) return;
  const txt=(e.clipboardData&&e.clipboardData.getData)?e.clipboardData.getData('text'):'';
  e.preventDefault();
  const todas=datasDeTexto(txt);
  // Período completo ("29/06/2026 – 23/08/2026") colado num campo do board de alocação:
  // preenche início E fim da linha de uma vez (e salva, como uma edição manual).
  if(todas.length>=2 && t.hasAttribute('data-ab-f')){
    const id=t.getAttribute('data-ab-f').split('|')[1];
    const a=(typeof alocRows==='function')?alocRows().find(r=>r.id===id):null;
    if(a){
      if(alocTravaBloqueia(a.accountId)) return;
      const par=todas.slice(0,2).sort(); const antigo={i:a.inicio,f:a.fim};
      a.inicio=par[0]; a.fim=par[1];
      const cf=alocConflitoDe(alocRows(), a);
      if(cf){ a.inicio=antigo.i; a.fim=antigo.f; alocAvisaConflito(cf); return; }
      alocPersiste(); alocRedraw();
      try{ toast('📋 Período '+dataBR(par[0])+' – '+dataBR(par[1])+' colado'); }catch(_){}
      return; }
  }
  const iso=todas[0]||'';
  if(!iso){ try{ toast('Não entendi a data colada — use 23/08/2026 ou 2026-08-23.','warn'); }catch(_){} return; }
  if(t.value===iso) return;
  t.value=iso;
  t.dispatchEvent(new Event('change',{bubbles:true}));
  try{ toast('📋 '+dataBR(iso)+' colada'); }catch(_){}
});
