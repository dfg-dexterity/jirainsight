// Jira Insights · 06 · 🎯 PRIORIDADES DO TIME — painel semanal + Modo reunião (pauta, timer, ata).


// ============================ 🎯 PRIORIDADES DO TIME ============================
// Painel das (até 5) prioridades da semana + Modo reunião (pauta de 35 min).
// Jira é a fonte da SELEÇÃO (label prioridade-semana); o painel guarda só a
// embalagem de negócio (cfg.reuniao.prioridades), o log de decisões (Supabase,
// config?dec=1) e o marco da última reunião (cfg.reuniao.ultimaReuniao).
const PR_CAP=5;
const PR_NATUREZAS=[
  ['entrega','Clientes · Entrega','marcos, dependências e aceite'],
  ['operacao','Clientes · Operação','SLA, criticidade e recorrência'],
  ['produtos','Produtos e melhoria interna','valor entregue, adoção e próxima versão'],
  ['rotinas','Rotinas e governança','só atrasos, desvios e decisões'],
  ['outros','Outros','itens fora das naturezas mapeadas'],
];
const PR_EV_ROT={criado:'criado',comentario:'comentário',alteracao:'alteração',transicao:'mudou de status',concluido:'concluído'};
function prCfg(){ return Object.assign({}, cfgDefaults().reuniao, cfg.reuniao||{}); }
function prNatDe(cat){ const m=prCfg().mapaNatureza||{}; const pref=String(cat||'').split('|')[0].trim();
  return m[pref]||m[String(cat||'').trim()]||'outros'; }
const prH=(d)=>d?`${d.slice(8,10)}/${d.slice(5,7)}`:'';
function prSemaforo(venc){ const hoje=hojeSP();
  if(!venc) return {cl:'nd',txt:'sem prazo definido'};
  if(venc<hoje) return {cl:'err',txt:`venceu ${prH(venc)}`};
  if(venc<=mtsSoma(hoje,3)) return {cl:'warn',txt:`vence ${prH(venc)}`};
  return {cl:'ok',txt:`no prazo · ${prH(venc)}`}; }

// ---- cargas (cada uma independente; re-render quando chega) ----
function prGarante(forca){ const pr=estado.prioridades;
  if(!forca&&(pr.dados||pr.carregando||pr.erro)) return;   // com erro guardado, espera o "Tentar de novo" (sem laço de fetch)
  pr.carregando=true; pr.erro='';
  fetch('/api/vencimentos?reuniao=1'+(forca?'&nocache=1':'')).then(r=>r.json()).then(j=>{
    pr.carregando=false; if(j&&j.erro) pr.erro=j.erro; else pr.dados=j;
    if(estado.vista==='prioridades') renderPrioridades();
  }).catch(e=>{ pr.carregando=false; pr.erro=humanizaErro(e); if(estado.vista==='prioridades') renderPrioridades(); }); }
function prGaranteVenc(forca){ const pr=estado.prioridades;
  if(!forca&&(pr.venc||pr.vencB)) return; pr.vencB=true;
  fetch(`/api/vencimentos?ate=${hojeSP()}${forca?'&nocache=1':''}`).then(r=>r.json()).then(j=>{
    pr.vencB=false; pr.venc=(j&&!j.erro)?j:{tickets:[],projetos:{}};
    if(estado.vista==='prioridades') renderPrioridades();
  }).catch(()=>{ pr.vencB=false; pr.venc={tickets:[],projetos:{}}; }); }
function prGaranteDecs(forca){ const pr=estado.prioridades; const id=idApontar();
  if(!id||!id.accountId){ pr.decs=null; return; }
  if(!forca&&(pr.decs||pr.decsB)) return; pr.decsB=true;
  fetch('/api/config?dec=1',{method:'POST',headers:mpHeaders(),body:JSON.stringify({acao:'listar'})})
    .then(r=>r.json()).then(j=>{ pr.decsB=false; pr.decs=(j&&j.ok)?(j.decisoes||[]):[];
      if(estado.vista==='prioridades') renderPrioridades(); })
    .catch(()=>{ pr.decsB=false; pr.decs=[]; }); }
function prGaranteAtiv(forca){ const pr=estado.prioridades;
  if(!forca&&(pr.ativ||pr.ativB)) return; pr.ativB=true;
  fetch('/api/atividade?janela=30d').then(r=>r.json()).then(j=>{ pr.ativB=false;
    pr.ativ=(j&&!j.erro)?j:{eventos:[],pessoas:{}};
    if(estado.vista==='prioridades') renderPrioridades(); })
    .catch(()=>{ pr.ativB=false; pr.ativ={eventos:[],pessoas:{}}; }); }

function prPrios(){ const d=estado.prioridades.dados||{}; return (d.prioridades||[]).slice(0,PR_CAP); }
function prVencidos(){ const pr=estado.prioridades; const hoje=hojeSP();
  return (((pr.venc||{}).tickets)||[]).filter(t=>t.venc&&t.venc<hoje); }
// Follow-ups: decisões em aberto com prazo vencido ou vencendo em ≤7 dias.
function prFollowUps(){ const pr=estado.prioridades; const lim=mtsSoma(hojeSP(),7);
  return (pr.decs||[]).filter(d=>['aberta','reprazada','escalada'].includes(d.status)&&d.prazo&&d.prazo<=lim); }
function prProjetosMapa(){ const pr=estado.prioridades;
  return Object.assign({}, ((pr.venc||{}).projetos)||{}, ((pr.dados||{}).projetos)||{}); }
// Visão projeto a projeto: cada natureza agrupa os PROJETOS do time, e cada
// projeto carrega os próprios vencidos, aguardando decisão e prioridades — com
// vários projetos rodando ao mesmo tempo, a leitura é por projeto, não em bloco.
function prPorNatureza(){ const projs=prProjetosMapa(); const m=prCfg().mapaNatureza||{};
  // projetos "ativos" = os que aparecem nas exceções/prioridades + os com horas
  // recentes (catálogo do /api/tempo, que traz a categoria)
  const ativos=Object.assign({}, ((estado.tempo||{}).projetos)||{}, projs);
  const g={}; let catNova='';
  PR_NATUREZAS.forEach(([slug])=>{ g[slug]={projetos:{},venc:[],dec:[]}; });
  const natECheca=(pk)=>{ const cat=(ativos[pk]||{}).categoria||'';
    const pref=cat.split('|')[0].trim();
    if(cat&&!m[pref]&&!m[cat.trim()]) catNova=cat;
    return prNatDe(cat); };
  const pj=(pk)=>{ const n=natECheca(pk);
    return (g[n].projetos[pk]=g[n].projetos[pk]||{venc:[],dec:[],prio:[]}); };
  Object.keys(ativos).forEach(pk=>{ pj(pk); });
  prVencidos().forEach(t=>{ const o=pj(t.p); o.venc.push(t); g[natECheca(t.p)].venc.push(t); });
  (((estado.prioridades.dados)||{}).decisoes||[]).forEach(t=>{ const o=pj(t.p); o.dec.push(t); g[natECheca(t.p)].dec.push(t); });
  prPrios().forEach(t=>{ pj(t.p).prio.push(t); });
  return {g,catNova}; }
// Ordena os projetos de uma natureza: mais crítico primeiro (vencidos, decisões,
// prioridades); os "em dia" ficam para a linha recolhida.
function prProjOrdenados(nat){
  return Object.entries(nat.projetos)
    .sort((x,y)=>(y[1].venc.length-x[1].venc.length)||(y[1].dec.length-x[1].dec.length)||(y[1].prio.length-x[1].prio.length)||projNome(x[0]).localeCompare(projNome(y[0]),'pt')); }
// Diff de uma prioridade: eventos desde a última reunião (marco da ata) — cap 3.
function prDiffDe(t){ const pr=estado.prioridades; const r=prCfg();
  const desde=(String(r.ultimaReuniao||'').slice(0,10))||mtsSoma(hojeSP(),-7);
  const pess=((pr.ativ||{}).pessoas)||{};
  return (((pr.ativ||{}).eventos)||[]).filter(ev=>ev.k===t.k&&String(ev.d||'').slice(0,10)>=desde)
    .slice(-3).map(ev=>`${PR_EV_ROT[ev.e]||ev.e} · ${(pess[ev.a]&&pess[ev.a].nome)||''} · ${fmtBR(String(ev.d||'').slice(0,10))}`); }

// ---- Ata em markdown (também vira a pauta do convite do Teams) ----
function prAtaMd(preview){ const pr=estado.prioridades; const r=prCfg(); const hoje=hojeSP();
  const met=r.prioridades||{}; const pri=prPrios();
  const lin=[`# Reunião semanal de prioridades — ${hoje}`,'',
    'Painel: https://jirainsight.vercel.app/?v=prioridades','',
    `## Prioridades da semana (${pri.length} de ${PR_CAP} vagas)`];
  pri.forEach((t,i)=>{ const m=met[t.k]||{};
    lin.push(`${i+1}. ${t.k} — ${m.obj||t.resumo} · ${t.resp||'sem dono'}${t.venc?` · venc. ${prH(t.venc)}`:''}${m.pedido?` · próximo passo: ${m.pedido}`:''}`); });
  const fu=prFollowUps();
  lin.push('','## Follow-ups (decisões anteriores com prazo)');
  if(fu.length) fu.forEach(f=>lin.push(`- ${f.ticket} — ${f.decisao} · ${f.dono.nome||''} · até ${prH(f.prazo)} (${f.status})`));
  else lin.push('- Nenhum follow-up pendente.');
  lin.push('','## Decisões desta reunião');
  if(pr.novas.length) pr.novas.forEach(dc=>lin.push(`- ${dc.ticket} — ${dc.decisao} Resp: ${dc.dono.nome||''}. Até ${prH(dc.prazo)}.`));
  else lin.push(preview?'- (as decisões registradas na reunião entram aqui)':'- Nenhuma decisão registrada nesta reunião.');
  const porProj={}; prVencidos().forEach(t=>{ porProj[t.p]=(porProj[t.p]||0)+1; });
  const partes=Object.entries(porProj).sort((x,y)=>y[1]-x[1]).slice(0,6)
    .map(([pk,n])=>`${projNome(pk)}: ${n}`);
  lin.push('',`## Fila de vencidos: ${prVencidos().length}${partes.length?` — ${partes.join(' · ')}`:''}`);
  return lin.join('\n'); }
function prMarcarReuniao(){
  const url='https://teams.microsoft.com/l/meeting/new?subject='
    +encodeURIComponent('Reunião semanal de prioridades')
    +'&content='+encodeURIComponent(prAtaMd(true).slice(0,1800));
  window.open(url,'_blank','noopener');
  toast('Convite do Teams aberto com a pauta preenchida.','ok'); }

// ---- Tour de primeiro acesso (motor de tour existente) ----
const TOUR_PRIO=[
  {sel:'#pr-kpis',titulo:'🎯 Prioridades do time',texto:'A leitura de 10 segundos: prioridades no prazo, fila de vencidos, o que aguarda decisão e os follow-ups da última reunião.'},
  {sel:'#pr-prios',titulo:'As 5 vagas da semana',texto:'Cada prioridade tem dono, prazo com semáforo e o pedido ao time. O teto é 5 — a sexta só entra quando alguém responde "qual das 5 sai?". A seleção vive no Jira (label prioridade-semana).'},
  {sel:'#pr-nat',titulo:'Portfólio — projeto por projeto',texto:'Cada projeto do time com a própria situação: vencidos, decisões pendentes e a estrela de prioridade da semana — agrupados pela natureza do trabalho. Projeto em dia fica numa linha recolhida.'},
  {sel:'[data-pr-aba="reuniao"]',titulo:'Modo reunião',texto:'A mesma tela vira a pauta de 35 minutos: follow-up → prioridades → decisões → exceções → ata. Status puro não entra — o painel já contou.'},
  {sel:'[data-pr-marcar]',titulo:'Marcar reunião',texto:'Abre o convite do Teams com a pauta preenchida e o link do painel. E em ⚙️ dá para ativar o resumo periódico no canal.'},
];

function renderPrioridades(){
  const cont=document.getElementById('conteudo'); const pr=estado.prioridades; const r=prCfg();
  prGarante(false); prGaranteVenc(false); prGaranteDecs(false); prGaranteAtiv(false);
  const d=pr.dados;
  if(!d){ cont.replaceChildren(el(`<div class="mp-root"><div class="card full mp-card"><h2>🎯 Prioridades do time</h2>${
    pr.erro?`<div class="erro">${esc(pr.erro)} <button class="btn" data-pr-rec="1">Tentar de novo</button></div>`
      :'<div class="estado">Carregando as prioridades da semana…</div>'}</div></div>`)); return; }
  const hoje=hojeSP(); const seg=semChave(hoje); const sex=mtsSoma(seg,4);
  const pri=prPrios(); const met=r.prioridades||{};
  const vencidos=prVencidos(); const fu=pr.decs?prFollowUps():null;
  const geradoHM=String(d.meta&&d.meta.geradoEm||'').slice(11,16);
  const idn=idApontar();

  // ---- cabeçalho ----
  const ultima=String(r.ultimaReuniao||'').slice(0,10);
  const cab=`<div class="card full mp-card">
    <h2>🎯 Prioridades do time <span>a reunião não é para saber como estão as coisas — é para decidir</span></h2>
    <div class="mp-head">
      <div class="mp-sem"><strong>Semana de ${esc(prH(seg))} a ${esc(prH(sex))}</strong>
        <span class="mp-dim">${ultima?`última reunião: ${esc(fmtBR(ultima))}${r.ataUltimaUrl?` · <a href="${escA(r.ataUltimaUrl)}" target="_blank" rel="noopener">ata</a>`:''}`:'primeira reunião ainda não registrada'} · facilitadora: ${esc(r.facilitador||'—')}</span></div>
      <span class="spacer"></span>
      <span class="pr-selo" data-tip="Dados lidos do Jira agora — o painel é o status; a reunião decide">Atualizado pelo Jira${geradoHM?` · ${esc(geradoHM)}`:''}</span>
      <button class="mp-btn" data-pr-marcar="1" data-tip="Abre o convite do Teams com a pauta preenchida">Marcar reunião</button>
    </div>
    <div class="kpis" id="pr-kpis">
      <div class="kpi ${pri.some(t=>t.venc&&t.venc<hoje)?'r':'a'}"><div class="v">${pri.filter(t=>!t.venc||t.venc>=hoje).length} de ${pri.length||0}</div><div class="l">Prioridades no prazo · ${pri.length} de ${PR_CAP} vagas</div></div>
      <div class="kpi ${vencidos.length?'r':'v'}"><div class="v">${vencidos.length}</div><div class="l">Vencidos · fila de saneamento</div></div>
      <div class="kpi a"><div class="v">${(d.decisoes||[]).length}</div><div class="l">Aguardando decisão</div></div>
      <div class="kpi t"><div class="v">${fu?fu.length:'—'}</div><div class="l">${fu?'Follow-ups com prazo':'Follow-ups (identifique-se)'}</div></div>
    </div>
    ${(d.prioridades||[]).length>PR_CAP?`<div class="pr-hig">⚠ ${(d.prioridades||[]).length} tickets com a label <code>prioridade-semana</code> — o painel mostra 5; remova ${(d.prioridades||[]).length-PR_CAP} no Jira: ${
      (d.prioridades||[]).slice(PR_CAP).map(t=>`<a href="${projJira(t.k)}" target="_blank" rel="noopener">${esc(t.k)}</a>`).join(' ')}</div>`:''}
  </div>`;

  // ---- abas ----
  const abas=`<div class="mp-abas" role="tablist">${[['visao','Visão do time'],['reuniao','Modo reunião'],['projeto','Página do projeto']]
    .map(([k,rot])=>`<button class="mp-tab${pr.aba===k?' atual':''}" role="tab" aria-selected="${pr.aba===k}" data-pr-aba="${k}">${rot}</button>`).join('')}</div>`;

  let corpo='';
  if(pr.aba==='visao'){
    const cards=pri.map(t=>{ const m=met[t.k]||{}; const sf=prSemaforo(t.venc);
      return `<article class="pr-prio ${sf.cl}">
        <div class="pr-obj">${esc(m.obj||t.resumo)}</div>
        <div class="pr-meta"><span>${esc((t.resp||'sem dono').split(' ')[0])}</span> · <span><i class="pr-dot ${sf.cl}"></i> ${esc(sf.txt)}</span></div>
        ${m.pedido?`<div class="pr-pedido">${esc(m.pedido)}</div>`:''}
        <div class="pr-vivo"><a class="mono" href="${projJira(t.k)}" target="_blank" rel="noopener">${esc(t.k)}</a>
          <span>${esc(t.status)}</span><span class="pr-selo">Jira</span>
          <span class="pr-fim"><button class="mp-lnk" data-pr-edit="${escA(t.k)}">Editar texto</button></span></div>
      </article>`; }).join('');
    const vagas=Array.from({length:Math.max(0,PR_CAP-pri.length)},(_,i)=>
      `<article class="pr-vaga">Vaga livre (${pri.length+i+1} de ${PR_CAP})<br>marque um ticket com a label <code>prioridade-semana</code></article>`).join('');
    const {g,catNova}=prPorNatureza();
    const projRow=(pk,o)=>{
      const fila=o.venc.slice(0,7).map(t=>`<div class="pr-linha"><a class="mono" href="${projJira(t.k)}" target="_blank" rel="noopener">${esc(t.k)}</a>
        <span>${esc((t.resumo||'').slice(0,60))}</span><span class="pr-fim mp-dim">${esc((t.resp||'—').split(' ')[0])} · ${esc(prH(t.venc))}</span></div>`).join('');
      return `<div class="pr-projrow">
        <div class="pr-linha" style="border-top:0;padding:9px 0 4px">
          <strong data-tip="${escA(pk)}">${esc(projNome(pk))}</strong>
          ${o.prio.length?`<span class="pr-chip ok">⭐ prioridade da semana</span>`:''}
          ${o.venc.length?`<span class="pr-chip err">${o.venc.length} vencido${o.venc.length>1?'s':''}</span>`:''}
          ${o.dec.length?`<span class="pr-chip dec">${o.dec.length} aguardando decisão</span>`:''}
          <span class="pr-fim"><button class="mp-lnk" data-pr-verproj="${escA(pk)}">Página do projeto</button>
            ${o.venc.length?`<button class="mp-btn" data-pr-gproj="${escA(pk)}">Gestão</button>`:''}</span>
        </div>
        ${o.venc.length?`<details class="pr-fila" style="margin:0 0 4px"><summary>ver a fila de ${esc(projNome(pk))}</summary>${fila}
          ${o.venc.length>7?`<div class="mp-dim" style="padding:4px 0">+${o.venc.length-7} na fila</div>`:''}</details>`:''}
      </div>`; };
    const natSecoes=PR_NATUREZAS.map(([slug,rot,foco])=>{
      const x=g[slug]; const ord=prProjOrdenados(x);
      const comAlgo=ord.filter(([,o])=>o.venc.length||o.dec.length||o.prio.length);
      const emDiaP=ord.filter(([,o])=>!(o.venc.length||o.dec.length||o.prio.length));
      if(!ord.length) return '';
      return `<div class="pr-natc" data-pr-nat="${slug}">
        <header style="display:flex;gap:8px;align-items:baseline;border-bottom:1px solid var(--linha2);padding-bottom:6px"><b>${esc(rot)}</b>
          <span class="mp-dim" style="font-size:11.5px">${comAlgo.length+emDiaP.length} projeto${(comAlgo.length+emDiaP.length)>1?'s':''}</span>
          <span class="mp-dim" style="margin-left:auto;font-size:11.5px">${esc(foco)}</span></header>
        ${comAlgo.map(([pk,o])=>projRow(pk,o)).join('')||'<div class="mp-dim" style="padding:8px 0">Todos os projetos em dia.</div>'}
        ${emDiaP.length?`<details class="pr-fila"><summary>Em dia: ${emDiaP.length} projeto${emDiaP.length>1?'s':''}</summary>
          <div class="mp-dim" style="padding:6px 0">${emDiaP.map(([pk])=>esc(projNome(pk))).join(' · ')}</div></details>`:''}
      </div>`; }).filter(Boolean).join('');
    corpo=`<div class="card full mp-card"><h2>As prioridades da semana <span>objetivo em linguagem de negócio, dono, prazo e pedido ao time</span></h2>
      <div class="pr-prios" id="pr-prios">${cards}${vagas}</div></div>
    <div class="card full mp-card"><h2>Portfólio — projeto por projeto <span>cada projeto com a sua situação; agrupados pela natureza do trabalho</span></h2>
      <div id="pr-nat" style="display:flex;flex-direction:column;gap:12px">${natSecoes||'<div class="estado">Nenhum projeto ativo no recorte.</div>'}</div>
      ${catNova?`<div class="pr-hig" style="margin-top:10px">⚠ Categoria "${esc(catNova)}" sem natureza mapeada — caiu em "Outros". Classifique em ⚙️ Configurações.</div>`:''}
    </div>`;
  } else if(pr.aba==='reuniao'){
    const passos=[['0','Follow-up'],['1','Prioridades'],['2','Decisões'],['3','Exceções'],['✓','Ata']];
    const stepper=`<div class="mp-fluxo" role="tablist" aria-label="Pauta da reunião" style="align-items:center">
      ${passos.map(([nn,rot],i)=>`<button class="mp-step${pr.passo===i?' atual':''}${pr.passo>i?' feito':''}" data-pr-passo="${i}" style="cursor:pointer;border:0">${nn} · ${rot}</button>`).join('<span class="mp-seta">→</span>')}
      <span class="pr-timer" id="pr-timer">00:00 / 35 min</span></div>`;
    let pc='';
    if(pr.passo===0){
      const rows=(fu||[]).map(f=>`<div class="pr-linha"><a class="mono" href="${projJira(f.ticket)}" target="_blank" rel="noopener">${esc(f.ticket)}</a>
        <span>${esc(f.decisao)}</span><span class="mp-dim">${esc(f.dono.nome||'')} · até ${esc(prH(f.prazo))}${f.reprazos?` · reprazada ${f.reprazos}×`:''}</span>
        <span class="pr-fim"><button class="mp-btn" data-pr-fu="${escA(f.id)}|concluida|${escA(f.atualizadoEm)}">Feita</button>
          <button class="mp-btn" data-pr-fu="${escA(f.id)}|reprazada|${escA(f.atualizadoEm)}">Nova data</button>
          <button class="mp-btn" data-pr-fu="${escA(f.id)}|escalada|${escA(f.atualizadoEm)}">Escalar</button></span></div>`).join('');
      pc=`<h3>0 · As decisões da semana passada, primeiro</h3>
        <div class="mp-dim" style="margin:2px 0 8px">Resposta binária do dono: feita ou não feita. Não feita = nova data (1× no máximo) ou escalação. Reprazada 2× volta como pauta de decisão.</div>
        ${pr.decs===null?'<div class="estado">Identifique-se (e-mail + token do Jira, em ⏱ Apontar) para ver e tratar os follow-ups.</div>'
          :(rows||'<div class="estado">Nenhum follow-up com prazo — siga para as prioridades.</div>')}`;
    } else if(pr.passo===1){
      pc=`<h3>1 · As prioridades — com o que mudou embutido</h3>
        <div class="mp-dim" style="margin:2px 0 8px">Fala só o dono: o que mudou → o que implica → precisa de algo do grupo? Saída única: continua no top-5?</div>
        ${pri.map(t=>{ const m=met[t.k]||{}; const sf=prSemaforo(t.venc); const diff=prDiffDe(t);
          return `<article class="pr-prio ${sf.cl}" style="max-width:640px;margin-bottom:10px">
            <div class="pr-obj">${esc(m.obj||t.resumo)}</div>
            <div class="pr-meta"><span>${esc((t.resp||'sem dono').split(' ')[0])}</span> · <span><i class="pr-dot ${sf.cl}"></i> ${esc(sf.txt)}</span></div>
            ${diff.length?diff.map(x=>`<div class="mp-dim" style="border-left:2px solid var(--linha);padding-left:10px">${esc(x)}</div>`).join(''):'<div class="mp-dim">Sem mudanças desde a última reunião.</div>'}
            <div class="pr-vivo"><a class="mono" href="${projJira(t.k)}" target="_blank" rel="noopener">${esc(t.k)}</a>
              <span class="pr-fim"><button class="mp-btn mp-btn-p" data-pr-decidir="${escA(t.k)}" data-pr-resumo="${escA(m.obj||t.resumo)}" data-pr-resp="${escA(t.resp||'')}">Registrar decisão</button></span></div>
          </article>`; }).join('')||'<div class="estado">Nenhuma prioridade marcada — defina no Jira ou na Visão do time.</div>'}`;
    } else if(pr.passo===2){
      const rows=(d.decisoes||[]).slice(0,6).map(t=>`<div class="pr-linha"><a class="mono" href="${projJira(t.k)}" target="_blank" rel="noopener">${esc(t.k)}</a>
        <span>${esc((t.resumo||'').slice(0,70))}</span><span class="mp-dim">${esc(t.status)} · ${esc((t.resp||'—').split(' ')[0])}</span>
        <span class="pr-fim"><button class="mp-btn mp-btn-p" data-pr-decidir="${escA(t.k)}" data-pr-resumo="${escA(t.resumo)}" data-pr-resp="${escA(t.resp||'')}">Decidir</button></span></div>`).join('');
      pc=`<h3>2 · O que está aguardando decisão</h3>
        <div class="mp-dim" style="margin:2px 0 8px">Em 4 minutos: decide-se com a informação que há, ou nomeia-se um dono para trazer a decisão pronta. "Discutir mais" não é saída.</div>
        ${rows||'<div class="estado">Nada aguardando decisão. 🎉</div>'}
        ${(d.decisoes||[]).length>6?`<div class="mp-dim" style="padding-top:6px">+${(d.decisoes||[]).length-6} — trate os demais de forma assíncrona</div>`:''}
        ${pr.novas.length?`<div class="mp-dim" style="margin-top:10px">✓ Registradas nesta reunião: ${pr.novas.map(x=>esc(x.ticket)).join(', ')}</div>`:''}`;
    } else if(pr.passo===3){
      const {g}=prPorNatureza();
      const linhas=PR_NATUREZAS.map(([slug,rot])=>{
        const comVenc=prProjOrdenados(g[slug]).filter(([,o])=>o.venc.length);
        if(!comVenc.length) return '';
        return comVenc.map(([pk,o])=>`<div class="pr-linha"><span class="pr-chip err">${o.venc.length} vencido${o.venc.length>1?'s':''}</span>
          <strong data-tip="${escA(pk)}">${esc(projNome(pk))}</strong><span class="mp-dim">${esc(rot)}</span>
          <span class="pr-fim"><button class="mp-btn" data-pr-gproj="${escA(pk)}">Levar para a Gestão</button></span></div>`).join(''); }).filter(Boolean).join('');
      pc=`<h3>3 · Exceções — projeto por projeto, em lote</h3>
        <div class="mp-dim" style="margin:2px 0 8px">A fila de vencidos é dívida operacional com meta assíncrona (8–10/semana). Cada projeto despacha o seu lote para a Gestão — nunca item a item na reunião.</div>
        ${linhas||'<div class="estado">Nenhuma exceção nesta semana. 🎉</div>'}`;
    } else {
      pc=`<h3>✓ · Ata pronta — publicada antes de todos saírem</h3>
        <div class="mp-dim" style="margin:2px 0 8px">Copie, cole no banco "Status Diário e Reuniões" do Notion e confirme a URL. Ao encerrar: o marco da última reunião avança (zera o diff) e cada ticket decidido recebe o comentário com o link da ata.</div>
        <div class="pr-ata" id="pr-ata">${esc(prAtaMd(false))}</div>
        <div class="mp-form-acoes" style="align-items:center;flex-wrap:wrap">
          <button class="mp-btn" data-pr-copiar="1">Copiar ata</button>
          <input id="pr-ata-url" class="mp-btn" style="cursor:text;min-width:280px" placeholder="URL da ata no Notion" value="${escA(pr.ataUrl)}">
          <button class="mp-btn mp-btn-p" data-pr-encerrar="1">Publicar e encerrar</button>
        </div>`;
    }
    corpo=`<div class="card full mp-card">${stepper}<div style="margin-top:12px">${pc}</div>
      <div class="mp-acoes">${pr.passo<4?`<button class="mp-btn mp-btn-p" data-pr-passo="${pr.passo+1}">Avançar →</button>`:''}
        <button class="mp-lnk" data-pr-aba="visao">Sair do modo reunião</button></div></div>`;
  } else {
    // ---- Página do projeto (MVP: pulso do Jira + narrativa apontada) ----
    const projs=prProjetosMapa();
    const keys=Object.keys(projs).sort((a,b)=>projNome(a).localeCompare(projNome(b),'pt'));
    const sel=pr.proj&&projs[pr.proj]?pr.proj:(pri[0]&&pri[0].p)||keys[0]||'';
    const nomeP=sel?projNome(sel):'';
    const cat=(projs[sel]||{}).categoria||'';
    const natRot=(PR_NATUREZAS.find(([slug])=>slug===prNatDe(cat))||[])[1]||'Outros';
    const vencP=prVencidos().filter(t=>t.p===sel).slice(0,5);
    const priP=pri.filter(t=>t.p===sel);
    const decsP=(pr.decs||[]).filter(x=>x.projeto===sel).slice(0,3);
    const nURL=(prCfg().notionPorProjeto||{})[sel]||'';
    corpo=`<div class="card full mp-card">
      <div class="mp-head"><h2 style="margin:0">${esc(nomeP)||'Escolha um projeto'} <span class="mono" style="font-size:12px">${esc(sel)}</span></h2>
        <span class="mp-tag">${esc(natRot)}</span><span class="spacer"></span>
        <label class="mp-dim">Projeto <select id="pr-proj-sel" class="mp-btn" style="cursor:pointer">${keys.map(k=>`<option value="${escA(k)}" ${k===sel?'selected':''}>${esc(projNome(k))} (${esc(k)})</option>`).join('')}</select></label></div>
      <div class="mp-2col">
        <div><h3 class="mp-h3">Pulso <span class="pr-selo">Jira · somente leitura</span></h3>
          ${priP.map(t=>`<div class="pr-linha"><span class="pr-chip ok">prioridade</span><a class="mono" href="${projJira(t.k)}" target="_blank" rel="noopener">${esc(t.k)}</a><span>${esc((met[t.k]||{}).obj||t.resumo)}</span></div>`).join('')}
          ${vencP.map(t=>`<div class="pr-linha"><span class="pr-chip err">venceu ${esc(prH(t.venc))}</span><a class="mono" href="${projJira(t.k)}" target="_blank" rel="noopener">${esc(t.k)}</a><span>${esc((t.resumo||'').slice(0,60))}</span></div>`).join('')||'<div class="mp-dim" style="padding:6px 0">Sem vencidos neste projeto.</div>'}
          ${decsP.length?`<h3 class="mp-h3" style="margin-top:12px">Decisões do projeto</h3>${decsP.map(x=>`<div class="pr-linha"><span>${esc(x.decisao)}</span><span class="mp-dim">${esc(x.dono.nome||'')} · ${esc(prH(x.prazo))} · ${esc(x.status)}</span></div>`).join('')}`:''}
        </div>
        <div><h3 class="mp-h3">Narrativa <span class="pr-selo">Notion</span></h3>
          <div class="pr-linha"><span>📓 Página do projeto</span><span class="pr-fim">${nURL?`<a href="${escA(nURL)}" target="_blank" rel="noopener">Abrir no Notion</a>`:'<span class="mp-dim">sem página — cadastre em ⚙️</span>'}</span></div>
          <div class="pr-linha"><span>💡 Registrar aprendizado</span><span class="pr-fim"><a href="https://app.notion.com/p/698ed174fe9d4e158a61837bdd676b16" target="_blank" rel="noopener">Lições Aprendidas</a></span></div>
          <div class="pr-linha"><span>⚠ Registrar risco</span><span class="pr-fim"><a href="https://app.notion.com/p/313c69371e1781ab8ab2eb5ad59b553b" target="_blank" rel="noopener">Mapeamento de Risco</a></span></div>
          <div class="mp-dim" style="margin-top:8px">A narrativa (sobre, atualizações, aprendizados, riscos) vive no Notion — o painel aponta e nunca duplica. Status e prazos vêm do Jira, ao lado.</div>
        </div>
      </div></div>`;
  }
  cont.replaceChildren(el(`<div class="mp-root">${cab}${abas}${corpo}</div>`));
  // tour de primeiro acesso (uma vez por navegador; motor de tour existente)
  try{ if(!localStorage.getItem('jirainsight_tour_prioridades')){
    localStorage.setItem('jirainsight_tour_prioridades','1');
    setTimeout(()=>{ if(estado.vista!=='prioridades') return; _tourLista=TOUR_PRIO; _tourHome=false; _tourI=0; mostraTour(); },500);
  } }catch(e){}
}

// ---- modal de decisão (contrato: decisão + dono + prazo + ticket) ----
function prAbreDecisao(k, resumo, resp){
  abreModal(`<h2>Registrar decisão</h2>
    <div class="muted small">${esc(k)} — ${esc((resumo||'').slice(0,90))}</div>
    <form id="pr-form-dec" class="mp-form" style="margin-top:8px" data-ticket="${escA(k)}">
      <label>Decisão (uma frase no perfeito: “Decidimos…”)<input name="decisao" required maxlength="300" placeholder="Decidimos encerrar o chamado com registro formal em produção."></label>
      <div class="mp-form-l1">
        <label>Dono (uma pessoa)<input name="dono" required maxlength="120" value="${escA(resp||'')}"></label>
        <label>Prazo<input name="prazo" type="date" required></label>
        <label>Tipo<select name="tipo"><option value="decisao">Decisão</option><option value="proxima-acao">Próxima ação</option></select></label>
      </div>
      <label>Contexto (opcional)<input name="contexto" maxlength="500" placeholder="pergunta em jogo, alternativas e recomendação"></label>
      <div class="mp-form-acoes"><button type="submit" class="mp-btn mp-btn-p">Registrar decisão</button>
        <button type="button" class="mp-btn" data-mp-fechamodal="1">Cancelar</button></div>
      <div class="ap-fb" id="pr-dec-fb" hidden></div>
    </form>`); }
function prAbreEditPrio(k){ const m=(prCfg().prioridades||{})[k]||{};
  abreModal(`<h2>Texto de negócio da prioridade</h2>
    <div class="muted small">${esc(k)} — a seleção vive no Jira; aqui fica só a embalagem que o time lê.</div>
    <form id="pr-form-edit" class="mp-form" style="margin-top:8px" data-ticket="${escA(k)}">
      <label>Objetivo em linguagem de negócio<input name="obj" maxlength="140" value="${escA(m.obj||'')}" placeholder="Entregar o controle de consórcios da Fiagril"></label>
      <label>Próximo passo / pedido ao time<input name="pedido" maxlength="200" value="${escA(m.pedido||'')}" placeholder="Homologação depende do cliente — quem falou com a Fiagril esta semana?"></label>
      <div class="mp-form-acoes"><button type="submit" class="mp-btn mp-btn-p">Salvar</button>
        <button type="button" class="mp-btn" data-mp-fechamodal="1">Cancelar</button></div>
    </form>`); }

// ---- interações ----
let _prTimerInt=null;
function prTimer(){ clearInterval(_prTimerInt);
  _prTimerInt=setInterval(()=>{ const e=document.getElementById('pr-timer'); const pr=estado.prioridades;
    if(!e||!pr.t0){ clearInterval(_prTimerInt); return; }
    const s=Math.floor((Date.now()-pr.t0)/1000);
    e.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')} / 35 min`;
    if(s>35*60) e.style.color='var(--amarelo)';
  },1000); }
document.addEventListener('click', async (e)=>{
  const t=e.target.closest&&e.target.closest('[data-pr-rec],[data-pr-aba],[data-pr-passo],[data-pr-edit],[data-pr-gestao],[data-pr-gproj],[data-pr-verproj],[data-pr-marcar],[data-pr-decidir],[data-pr-fu],[data-pr-copiar],[data-pr-encerrar]');
  if(!t) return;
  const pr=estado.prioridades;
  if(t.hasAttribute('data-pr-rec')){ prGarante(true); prGaranteVenc(true); renderPrioridades(); return; }
  if(t.hasAttribute('data-pr-marcar')){ prMarcarReuniao(); return; }
  if(t.hasAttribute('data-pr-aba')){ const aba=t.getAttribute('data-pr-aba');
    pr.aba=aba;
    if(aba==='reuniao'&&!pr.t0){ pr.t0=Date.now(); pr.passo=0; prGaranteDecs(true); prGarante(true); prTimer(); }
    if(aba!=='reuniao'&&pr.t0&&!pr.novas.length){ pr.t0=0; }
    renderPrioridades(); if(aba==='reuniao') prTimer(); return; }
  if(t.hasAttribute('data-pr-passo')){ pr.passo=Number(t.getAttribute('data-pr-passo'))||0; renderPrioridades(); prTimer(); return; }
  if(t.hasAttribute('data-pr-edit')){ prAbreEditPrio(t.getAttribute('data-pr-edit')); return; }
  if(t.hasAttribute('data-pr-decidir')){ const id=idApontar();
    if(!id||!id.accountId){ toast('Identifique-se em ⏱ Apontar para registrar decisões.','warn'); return; }
    prAbreDecisao(t.getAttribute('data-pr-decidir'), t.getAttribute('data-pr-resumo')||'', t.getAttribute('data-pr-resp')||''); return; }
  if(t.hasAttribute('data-pr-verproj')){ pr.proj=t.getAttribute('data-pr-verproj'); pr.aba='projeto'; renderPrioridades(); return; }
  if(t.hasAttribute('data-pr-gestao')||t.hasAttribute('data-pr-gproj')){
    const {g}=prPorNatureza(); let keys=[]; let origem='';
    if(t.hasAttribute('data-pr-gproj')){ const pk=t.getAttribute('data-pr-gproj');
      keys=prVencidos().filter(x=>x.p===pk).map(x=>x.k); origem=`🎯 Prioridades — ${projNome(pk)}`; }
    else { const slug=t.getAttribute('data-pr-gestao'); keys=((g[slug]||{}).venc||[]).map(x=>x.k);
      origem=`🎯 Prioridades — ${(PR_NATUREZAS.find(([s])=>s===slug)||[])[1]||slug}`; }
    if(!keys.length) return;
    const gx=estado.gestao; gx.soKeys=keys; gx.origem=origem;
    gx.preset=''; gx.busca=''; gx.fProj=''; gx.fResp=''; gx.fStatus=''; gx.semTrat=false;
    gx.sel={}; keys.forEach(k=>{ gx.sel[k]=true; });
    vaiPara('gestao'); return; }
  if(t.hasAttribute('data-pr-fu')){ const [id,st,base]=t.getAttribute('data-pr-fu').split('|');
    let prazo='';
    if(st==='reprazada'){ prazo=window.prompt('Nova data do follow-up (AAAA-MM-DD) — só é possível reprazar 1×:','')||'';
      if(!/^\d{4}-\d{2}-\d{2}$/.test(prazo)){ toast('Data inválida — use AAAA-MM-DD.','warn'); return; } }
    t.disabled=true;
    try{
      const j=await (await fetch('/api/config?dec=1',{method:'POST',headers:mpHeaders(),
        body:JSON.stringify({acao:'atualizar',id,status:st,prazo,base})})).json();
      if(j&&j.ok){ toast(st==='concluida'?'✓ Follow-up concluído.':st==='reprazada'?'Follow-up reprazado.':'Follow-up escalado.','ok'); prGaranteDecs(true); }
      else if(j&&j.conflito){ toast('Alguém alterou este follow-up — recarregando.','warn'); prGaranteDecs(true); }
      else toast((j&&j.erro)||'Não consegui atualizar.','err');
    }catch(err){ toast('Falha: '+humanizaErro(err),'err'); }
    return; }
  if(t.hasAttribute('data-pr-copiar')){ const ata=document.getElementById('pr-ata');
    try{ await navigator.clipboard.writeText(ata?ata.textContent:prAtaMd(false)); toast('✓ Ata copiada — cole no banco "Status Diário e Reuniões" do Notion.','ok'); }
    catch(err){ toast('Não consegui copiar — selecione o texto manualmente.','warn'); }
    return; }
  if(t.hasAttribute('data-pr-encerrar')){
    const url=String((document.getElementById('pr-ata-url')||{}).value||'').trim();
    if(!url&&!window.confirm('Encerrar sem registrar a URL da ata no Notion? O follow-up continua funcionando, mas a ata fica sem link.')) return;
    const id=idApontar();
    cfg.reuniao=Object.assign({}, prCfg(), { ultimaReuniao:new Date().toISOString(), ataUltimaUrl:url });
    salvaCfg();
    const novas=pr.novas.slice(); pr.novas=[]; pr.ataUrl=''; pr.t0=0; pr.aba='visao'; pr.ativ=null;
    // rastro: ata na decisão + comentário no ticket com o link
    if(id&&id.accountId){
      novas.forEach(dc=>{
        if(url) fetch('/api/config?dec=1',{method:'POST',headers:mpHeaders(),
          body:JSON.stringify({acao:'atualizar',id:dc.id,ataUrl:url,base:dc.atualizadoEm})}).catch(()=>{});
        fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({comentar:true,issue:dc.ticket,email:id.email,token:id.token,
            texto:`[DECISÃO ${hojeSP()}] ${dc.decisao} | Dono: ${dc.dono.nome||''} | Prazo: ${dc.prazo}${url?` | Ata: ${url}`:''}`})}).catch(()=>{});
      });
    }
    toast(`✓ Reunião encerrada${novas.length?` — ${novas.length} decisão(ões) registrada(s) e comentada(s) nos tickets`:''}. O diff da próxima semana começa agora.`,'ok');
    prGaranteDecs(true); renderPrioridades(); return; }
});
document.addEventListener('submit', async (e)=>{
  const f=e.target;
  if(f&&f.id==='pr-form-dec'){ e.preventDefault();
    const fb=document.getElementById('pr-dec-fb'); const id=idApontar();
    const dados={ acao:'registrar', decisao:f.decisao.value.trim(), tipo:f.tipo.value,
      dono:{ accountId:'', nome:f.dono.value.trim() }, prazo:f.prazo.value,
      ticket:f.getAttribute('data-ticket'), contexto:f.contexto.value.trim() };
    try{
      const j=await (await fetch('/api/config?dec=1',{method:'POST',headers:mpHeaders(),body:JSON.stringify(dados)})).json();
      if(j&&j.ok){ estado.prioridades.novas.push(j.decisao); fechaModal();
        toast('✓ Decisão registrada — ela entra na ata e volta no follow-up da próxima reunião.','ok');
        prGaranteDecs(true); if(estado.vista==='prioridades') renderPrioridades(); }
      else{ fb.hidden=false; fb.textContent=(j&&j.erro)||'Não consegui registrar.'; }
    }catch(err){ fb.hidden=false; fb.textContent='Falha: '+humanizaErro(err); }
    return; }
  if(f&&f.id==='pr-form-edit'){ e.preventDefault();
    const k=f.getAttribute('data-ticket');
    cfg.reuniao=prCfg();
    cfg.reuniao.prioridades=Object.assign({}, cfg.reuniao.prioridades,
      { [k]: { obj:f.obj.value.trim(), pedido:f.pedido.value.trim() } });
    salvaCfg(); fechaModal(); toast('✓ Texto da prioridade salvo para o time.','ok');
    if(estado.vista==='prioridades') renderPrioridades(); return; }
});
document.addEventListener('change', (e)=>{
  if(e.target&&e.target.id==='pr-proj-sel'){ estado.prioridades.proj=e.target.value; renderPrioridades(); }
});
