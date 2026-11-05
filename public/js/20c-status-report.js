// Jira Insights · 20c · 📋 STATUS REPORT DO PROJETO (2026-11-05, a pedido do usuário: "pegar os itens abertos, que
// vencem na próxima semana ou do tipo bug; ter modelos para atualizar o comentário no ticket; tudo intuitivo, fácil
// de ler as pendências do projeto e fácil de atualizar; todo mundo com a mesma visão de próximas atividades e da
// situação do projeto"). UM projeto por vez, em ?v=statusrep&srproj=KEY (`srproj` tem nome próprio para não disputar
// o ?proj= do filtro global — mesma regra de gproj/cproj/pproj).
// Dados: (1) os itens vêm de GET /api/vencimentos?statusrep=KEY (conta de serviço; só o que entra no relatório —
// abertos vencidos/da semana/da próxima semana + bugs abertos — já com o ÚLTIMO comentário `ult` e o último comentário
// com o MARCADOR "📋 Status report · …" `sr`); (2) a "situação do projeto" (semáforo, resumo, próximos passos, riscos)
// mora numa linha própria `sr_<KEY>` em jirainsight_config, lida por GET /api/config?sr=KEY — NUNCA na `cfg`.
// Nesta etapa a tela é só LEITURA: o 📝 Atualizar (modelos de comentário) e a edição da situação entram depois e
// se encaixam nos ganchos marcados com data-sr-slot (coluna de ação da linha e rodapé da situação).
estado.sr=estado.sr||{ proj:'', dados:null, chave:'', carregando:'', erro:'', cache:{}, sujo:false, cab:null, cabB:false,
  cabErro:'', cabProj:'', cabRev:'', edit:false, rasc:null, resp:'', soSem:false, catB:false };
const SR_PROJ_KEY='jirainsight_sr_proj_v1';   // último projeto aberto, só neste navegador
const SR_CACHE_MIN=3;
const SR_SO_GESTORES=false;                   // espelho da constante do servidor (D2): true restringe a edição da situação
// Tipos fixos: são o "semáforo" do item e o que a tela reconhece no marcador do comentário.
const SR_TIPOS={ concluido:{ic:'✅',rot:'Concluído',cor:'good'}, andamento:{ic:'▶️',rot:'Em andamento',cor:''},
  aguardando:{ic:'⏳',rot:'Aguardando cliente',cor:'warn'}, bloqueado:{ic:'⛔',rot:'Bloqueado',cor:'bad'},
  replanejado:{ic:'📅',rot:'Nova data prevista',cor:'warn'}, bug:{ic:'🐞',rot:'Bug',cor:''} };
const SR_CAMPOS={ proximo:{rot:'Próximo passo',tipo:'text'}, data:{rot:'Data',tipo:'date'}, prazo:{rot:'Prazo',tipo:'date'},
  quem:{rot:'Quem',tipo:'pessoa'}, motivo:{rot:'Motivo',tipo:'text'}, detalhe:{rot:'Detalhe',tipo:'text'}, impacto:{rot:'Impacto',tipo:'text'} };
const SR_TPLS_PADRAO=[
  { id:'t-concluido',   tipo:'concluido',   rot:'Concluído',                      texto:'Concluído em {data}. {detalhe}', done:true },
  { id:'t-andamento',   tipo:'andamento',   rot:'Em andamento — próximo passo',   texto:'Em andamento. Próximo passo: {proximo} (previsto para {data}, com {quem}).' },
  { id:'t-aguardando',  tipo:'aguardando',  rot:'Aguardando cliente',             texto:'Aguardando retorno do cliente: {motivo}. Cobrado em {data}; sem retorno até {prazo}, escalamos.' },
  { id:'t-bloqueado',   tipo:'bloqueado',   rot:'Bloqueado por…',                 texto:'Bloqueado por: {motivo}. Quem destrava: {quem}. Impacto: {impacto}.' },
  { id:'t-replanejado', tipo:'replanejado', rot:'Nova data prevista',             texto:'Nova data prevista: {data}. Motivo: {motivo}.', reagendar:true },
  { id:'t-bug-analise', tipo:'bug',         rot:'Bug — em análise',               texto:'Bug em análise: {detalhe}. Próximo passo: {proximo}.' },
  { id:'t-bug-corr',    tipo:'bug',         rot:'Bug — correção em andamento',    texto:'Correção em andamento: {detalhe}. Previsão de entrega: {data}.' },
  { id:'t-bug-valid',   tipo:'bug',         rot:'Bug — aguardando validação',     texto:'Correção entregue, aguardando validação de {quem} até {data}.' },
];
const SR_SEMAFORO={ verde:{ic:'🟢',rot:'No rumo'}, amarelo:{ic:'🟡',rot:'Atenção'}, vermelho:{ic:'🔴',rot:'Crítico'} };
// ---- Parâmetros ----
function srProjAtual(){
  const s=estado.sr; if(s.proj) return s.proj;
  try{ const k=String(localStorage.getItem(SR_PROJ_KEY)||'').toUpperCase(); if(/^[A-Z][A-Z0-9_]*$/.test(k)) return k; }catch(e){}
  const id=idApontar(); const m=(id&&id.accountId)?meusProjetos(id.accountId):[];
  return m.length?m[0]:'';
}
function srProjSet(k){
  k=String(k||'').toUpperCase(); const s=estado.sr;
  if(k!==s.proj){ s.resp=''; s.erro=''; }   // o erro era do projeto anterior: sem isto, o novo nunca seria lido
  s.proj=k;
  try{ if(k) localStorage.setItem(SR_PROJ_KEY,k); }catch(e){}
}
// "rot" do marcador ("⏳ Aguardando cliente") → tipo pelo emoji inicial; modelo renomeado continua reconhecido.
function srTipoDe(rot){ const r=String(rot||'');
  return Object.keys(SR_TIPOS).find(id=>r.startsWith(SR_TIPOS[id].ic))||'andamento'; }
function srDiasDesde(hoje,iso){ const d=String(iso||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return Math.max(0,Math.round((new Date(hoje)-new Date(d))/86400000)); }
const srN=()=>gpDiasPadrao();
const srDm=(iso)=>iso?`${iso.slice(8,10)}/${iso.slice(5,7)}`:'';
function srQuando(iso){ const t=Date.parse(iso||''); if(!Number.isFinite(t)) return '';
  try{ return new Date(t).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).replace(',',''); }catch(e){ return ''; } }
const srPrimeiro=(n)=>String(n||'').trim().split(/\s+/)[0]||'';
// ---- Dados ----
function srCarrega(forca){
  const s=estado.sr; const proj=srProjAtual(); if(!proj) return;
  const f=!!forca||s.sujo;
  const c=s.cache[proj];
  if(!f&&c&&(Date.now()-c.em)<SR_CACHE_MIN*60000){ s.dados=c.dados; s.chave=proj; s.erro=''; return; }
  if(s.carregando===proj) return;
  if(!f&&s.erro) return;   // falhou: nada de laço de releitura — o ↻ / "Tentar de novo" forçam
  s.carregando=proj; s.erro=''; s.sujo=false;
  fetch(`/api/vencimentos?statusrep=${encodeURIComponent(proj)}${f?'&nocache=1':''}`)
    .then(r=>r.json().catch(()=>({erro:'resposta inválida'}))).then(j=>{
      if(s.carregando===proj) s.carregando='';
      if(!j||j.erro||!j.meta||!Array.isArray(j.itens)){ if(srProjAtual()===proj) s.erro=(j&&j.erro)||'resposta vazia'; }
      else { s.cache[proj]={ dados:j, em:Date.now() }; if(srProjAtual()===proj){ s.dados=j; s.chave=proj; s.erro=''; } }
      if(estado.vista==='statusrep') renderSr();
      if(typeof renderAbas==='function') try{ renderAbas(); }catch(e){}   // 🔢 contador da aba
    }).catch(e=>{ if(s.carregando===proj) s.carregando=''; if(srProjAtual()===proj) s.erro=humanizaErro(e);
      if(estado.vista==='statusrep') renderSr(); });
}
// A situação do projeto (linha sr_<KEY>): leitura pública; sem linha = ainda ninguém escreveu. Uma leitura em voo;
// falha marca `cabErro` e NÃO insiste sozinha (o ↻ zera cabProj e tenta de novo).
function srCarregaCab(){
  const s=estado.sr; const proj=srProjAtual(); if(!proj||s.cabB||s.cabProj===proj) return;
  s.cabB=true;
  fetch(`/api/config?sr=${encodeURIComponent(proj)}`).then(r=>r.json().catch(()=>null)).then(j=>{
    s.cabB=false;
    if(srProjAtual()!==proj){ if(estado.vista==='statusrep') renderSr(); return; }   // trocou de projeto no meio: o render seguinte relê
    s.cabProj=proj;
    if(!j||j.ok===false||j.erro){ s.cab=null; s.cabRev=''; s.cabErro=(j&&j.erro)||'não consegui ler a situação do projeto'; }
    else { s.cab=(j.dados&&typeof j.dados==='object')?j.dados:null; s.cabRev=j.rev||''; s.cabErro=''; }
    if(estado.vista==='statusrep') renderSr();
  }).catch(e=>{ s.cabB=false; if(srProjAtual()===proj){ s.cabProj=proj; s.cab=null; s.cabErro=humanizaErro(e); } if(estado.vista==='statusrep') renderSr(); });
}
// ---- Cálculo (uma passada por render) ----
const SR_PRIO={ highest:5, high:4, medium:3, low:2, lowest:1 };
const srPrio=(t)=>SR_PRIO[String(t.prio||'').toLowerCase()]||0;
// Sem status report recente: nunca teve o marcador OU o último tem ≥ N dias.
function srSemSR(t,c){ if(!t.sr) return true; const d=srDiasDesde(c.hoje,t.sr.dia); return d==null||d>=c.N; }
function srGrupos(itens,hoje,fimSemana,ate){
  const g={ vencidos:[], semana:[], proxima:[], bugs:[] };
  itens.forEach(t=>{
    const v=t.venc||'';
    if(v&&v<hoje) g.vencidos.push(t);
    else if(v&&v<=fimSemana) g.semana.push(t);
    else if(v&&v<=ate) g.proxima.push(t);
    else if(t.bug) g.bugs.push(t);   // bug COM data dentro do horizonte fica no grupo da data (nunca em dois)
  });
  const porData=(a,b)=>(a.venc<b.venc?-1:a.venc>b.venc?1:0)||String(a.resp||'~').localeCompare(String(b.resp||'~'),'pt');
  g.vencidos.sort(porData); g.semana.sort(porData); g.proxima.sort(porData);
  g.bugs.sort((a,b)=>(srPrio(b)-srPrio(a))||(String(b.up||'')<String(a.up||'')?-1:1));
  return g;
}
// Semáforo sugerido pelos números (a regra está no data-tip da tela).
function srSaudeAuto(c){
  const todos=c.todos; const venc=todos.filter(t=>t.venc&&t.venc<c.hoje).length;
  const bl=todos.filter(t=>t.sr&&srTipoDe(t.sr.rot)==='bloqueado').length;
  const ag=todos.filter(t=>t.sr&&srTipoDe(t.sr.rot)==='aguardando').length;
  const mudos=todos.filter(t=>srSemSR(t,c)).length;
  const motivos=[]; let saude='verde';
  if(bl||venc>=3||(todos.length&&venc/todos.length>=0.3)){
    saude='vermelho';
    if(bl) motivos.push(`${bl} bloqueado${bl>1?'s':''}`);
    if(venc) motivos.push(`${venc} vencido${venc>1?'s':''}`);
  } else if(venc||ag||mudos>=3){
    saude='amarelo';
    if(venc) motivos.push(`${venc} vencido${venc>1?'s':''}`);
    if(ag) motivos.push(`${ag} aguardando cliente`);
    if(mudos>=3) motivos.push(`${mudos} sem status report há ≥ ${c.N} d`);
  } else motivos.push('nada vencido, bloqueado ou parado');
  return { saude, motivo:motivos.join(' · ') };
}
function srCalc(){
  const s=estado.sr; const d=s.dados; if(!d||!d.meta) return null;
  const m=d.meta; const hoje=m.hoje||hojeSP(); const N=srN();
  const c={ hoje, fimSemana:m.fimSemana||hoje, ate:m.ate||hoje, N, meta:m, todos:d.itens||[] };
  const emSoSem=s.soSem;
  c.itens=c.todos.filter(t=>(!s.resp||(s.resp==='__sem__'?!t.respId:t.respId===s.resp))&&(!emSoSem||srSemSR(t,c)));
  c.g=srGrupos(c.itens,hoje,c.fimSemana,c.ate);
  c.kpis={ vencidos:c.g.vencidos.length, semana:c.g.semana.length, proxima:c.g.proxima.length, bugs:c.g.bugs.length,
    hojeAtu:c.itens.filter(t=>t.sr&&t.sr.dia===hoje).length, mudos:c.itens.filter(t=>srSemSR(t,c)).length };
  c.auto=srSaudeAuto(c);
  return c;
}
// 🔢 Contador da aba: vencidos do projeto carregado, só com dado já em memória.
function srPendN(){ const s=estado.sr; if(!s.dados||s.chave!==srProjAtual()) return null; const c=srCalc(); return c?c.kpis.vencidos:null; }
// ---- Desenho ----
function srLinhaHTML(t,c){
  let venc='<span class="muted">sem data</span>';
  if(t.venc){
    const rel=t.venc<c.hoje?`<span class="sr-atraso">há ${srDiasDesde(c.hoje,t.venc)} d</span>`:(t.venc===c.hoje?'<span class="sr-hoje">hoje</span>':`<span class="muted small">em ${srDiasDesde(t.venc,c.hoje)} d</span>`);
    venc=`${esc(srDm(t.venc))} ${rel}`;
  }
  // Situação: o último comentário COM marcador, senão o último comentário comum, senão nada; os selos dizem o que falta.
  let sit='';
  if(t.sr){ const tp=srTipoDe(t.sr.rot); const cor=SR_TIPOS[tp].cor;
    sit=`<div class="sr-sit ${cor}"><b>${esc(t.sr.rot)}</b> · ${esc(srPrimeiro(t.sr.por))} · ${esc(srDm(t.sr.dia))}${t.sr.texto?`<div class="sr-trecho">${esc(t.sr.texto.length>140?t.sr.texto.slice(0,139)+'…':t.sr.texto)}</div>`:''}</div>`; }
  else if(t.ult){ sit=`<div class="sr-sit">💬 ${esc(srPrimeiro(t.ult.por))} ${esc(srDm(t.ult.dia))}: <span class="sr-trecho-i">${esc((t.ult.texto||'').length>140?t.ult.texto.slice(0,139)+'…':(t.ult.texto||''))}</span></div>`; }
  else sit='<div class="sr-sit muted">sem comentário</div>';
  const selos=[];
  if(srSemSR(t,c)) selos.push(`<span class="sr-sel" data-tip="${escA(t.sr?`O último status report deste item tem ${srDiasDesde(c.hoje,t.sr.dia)} dias (limite: ${c.N}).`:'Este item ainda não tem nenhum comentário de status report.')}">🔇 sem status report${t.sr?` há ${srDiasDesde(c.hoje,t.sr.dia)} d`:''}</span>`);
  const dup=srDiasDesde(c.hoje,t.up);
  if(dup!=null&&dup>=c.N) selos.push(`<span class="sr-sel" data-tip="Última movimentação no Jira (campo 'atualizado').">🕓 mexido há ${dup} d</span>`);
  return `<div class="sr-row" data-sr-k="${escA(t.k)}">
    <div class="sr-c-k"><a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener">${esc(t.k)} ↗</a> <button class="gp-mini" data-gx-det="${escA(t.k)}" data-tip="Ficha completa do ticket (descrição, comentários, horas) sem abrir o Jira">🔍</button></div>
    <div class="sr-c-res" title="${escA(t.resumo||'')}">${t.bug?'<span class="sr-bug" data-tip="Tipo do ticket: '+escA(t.t||'bug')+'">🐞</span> ':''}${esc(t.resumo||'—')}${t.pai?` <span class="muted small" data-tip="Ticket pai">🧩 ${esc(t.pai)}</span>`:''}</div>
    <div class="sr-c-resp">${t.resp?esc(srPrimeiro(t.resp)):'<span class="muted">—</span>'}</div>
    <div class="sr-c-venc">${venc}</div>
    <div class="sr-c-st"><span class="badge">${esc(t.status||'—')}</span></div>
    <div class="sr-c-sit">${sit}${selos.length?`<div class="sr-selos">${selos.join(' ')}</div>`:''}</div>
    <div class="sr-c-acao" data-sr-slot="at"></div></div>`;
}
function srBlocoHTML(id,tit,sub,lista,c){
  const corpo=lista.length?`<div class="sr-tab"><div class="sr-tab-h"><div>Ticket</div><div>Resumo</div><div>Resp.</div><div>Venc.</div><div>Status</div><div>Situação</div><div></div></div>${lista.map(t=>srLinhaHTML(t,c)).join('')}</div>`
    :'<div class="sr-vazio">✓ nada aqui.</div>';
  return `<div class="card full sr-bloco" id="sr-${id}" data-sr-bloco="${id}"><h2>${tit} <span class="sr-n">${lista.length}</span><span>${sub}</span></h2>${corpo}</div>`;
}
function srSituacaoHTML(c){
  const s=estado.sr; const cab=s.cab; const a=c.auto;
  const manual=cab&&cab.saude&&SR_SEMAFORO[cab.saude]?cab.saude:'';
  const sem=SR_SEMAFORO[manual||a.saude];
  const tip='Regra do sugerido: 🔴 se há item bloqueado, 3 ou mais vencidos ou vencidos em 30% ou mais dos itens · 🟡 se há vencido, item aguardando o cliente ou 3 ou mais itens sem status report há '+c.N+' dias · 🟢 nos demais casos. O semáforo escrito por uma pessoa vale mais que o sugerido.';
  const sug=`<span class="sr-sug" data-tip="${escA(tip)}">sugerido pelos números: ${SR_SEMAFORO[a.saude].ic} (${esc(a.motivo)})</span>`;
  const dif=manual&&manual!==a.saude?`<span class="sr-dif">manual ${SR_SEMAFORO[manual].ic} · sugerido ${SR_SEMAFORO[a.saude].ic}</span>`:'';
  let corpo;
  if(s.cabProj!==srProjAtual()&&!s.cabErro) corpo='<div class="muted small">Lendo a situação do projeto…</div>';
  else if(s.cabErro) corpo=`<div class="muted small">⚠ Não consegui ler a situação escrita (${esc(s.cabErro)}). Os números abaixo valem; use o ↻.</div>`;
  else if(!cab) corpo='<div class="sr-vazio">Ninguém escreveu a situação ainda — o semáforo acima é só o sugerido pelos números.</div>';
  else {
    const prox=(Array.isArray(cab.proximos)?cab.proximos:[]).filter(p=>p&&p.t);
    corpo=`${cab.resumo?`<div class="sr-resumo"><h3>Resumo</h3><p>${esc(cab.resumo).replace(/\n/g,'<br>')}</p></div>`:''}
      ${prox.length?`<div class="sr-prox"><h3>🎯 Próximos passos</h3><ul>${prox.map(p=>`<li>${esc(p.t)}${p.quando?` <span class="muted small">· ${esc(srDm(p.quando))}</span>`:''}${p.quem?` <span class="muted small">· ${esc(p.quem)}</span>`:''}</li>`).join('')}</ul></div>`:''}
      ${cab.riscos?`<div class="sr-riscos"><h3>⚠ Riscos</h3><p>${esc(cab.riscos).replace(/\n/g,'<br>')}</p></div>`:''}
      <div class="muted small sr-rodape-sit">Atualizado${cab.por&&cab.por.nome?` por ${esc(cab.por.nome)}`:''}${cab.atualizadoEm?` em ${esc(srQuando(cab.atualizadoEm))}`:''}</div>
      ${Array.isArray(cab.hist)&&cab.hist.length?`<details class="sr-hist"><summary>📜 Histórico da situação (${cab.hist.length})</summary><ul>${cab.hist.map(h=>`<li>${esc(srQuando(h.em))} · ${esc(h.por||'')} · ${h.saude&&SR_SEMAFORO[h.saude]?SR_SEMAFORO[h.saude].ic:'—'} ${esc(h.resumo||'')}</li>`).join('')}</ul></details>`:''}`;
  }
  return `<div class="card full sr-situacao"><h2>🧭 Situação do projeto <span>a mesma visão para todo o time</span></h2>
    <div class="sr-sem-linha"><span class="sr-semaforo ${manual||a.saude}" data-tip="${escA(tip)}">${sem.ic} ${esc(sem.rot)}</span>${dif}${sug}</div>
    ${corpo}<div class="sr-sit-acoes" data-sr-slot="cab"></div></div>`;
}
function srKpisHTML(c){
  const k=c.kpis; const N=c.N;
  const kpi=(ir,rot,v,sev,extra)=>`<div class="vg-k ${sev||''}" ${ir?`data-sr-ir="${ir}" data-tip="clique para ir ao bloco"`:''} ${extra||''}><div class="v">${v}</div><div class="l">${rot}</div></div>`;
  return `<div class="sr-kpis">
    ${kpi('venc','⏰ vencidos',k.vencidos,k.vencidos?'bad':'good')}
    ${kpi('sem','📅 esta semana',k.semana,'')}
    ${kpi('prox','📅 próxima semana',k.proxima,'')}
    ${kpi('bug','🐞 bugs abertos',k.bugs,k.bugs?'warn':'good')}
    ${kpi('','📝 atualizados hoje',k.hojeAtu,'good','data-tip="Itens com status report publicado hoje"')}
    ${kpi('','🔇 sem status report',k.mudos,k.mudos?'warn':'good',`data-sr-so-sem="1" data-tip="${escA(`Itens sem status report ou com o último há ${N} dias ou mais (limite: o 'parado há' da config). Clique para filtrar.`)}"`)}</div>`;
}
function srFiltrosHTML(c){
  const s=estado.sr; const proj=srProjAtual(); const id=idApontar();
  const meus=(id&&id.accountId)?meusProjetos(id.accountId):[];
  const cat=(typeof _projetosCache!=='undefined'&&_projetosCache)||[];
  const todos=[...new Set([...cat.map(p=>p.key),...meus,proj].filter(Boolean))];
  const resto=todos.filter(k=>!meus.includes(k)).sort((a,b)=>projNome(a).localeCompare(projNome(b),'pt'));
  const opt=(k)=>`<option value="${escA(k)}" ${proj===k?'selected':''}>${esc(projNomeCod(k))}</option>`;
  const resps=c?[...new Map(c.todos.filter(t=>t.respId).map(t=>[t.respId,t.resp])).entries()].sort((x,y)=>x[1].localeCompare(y[1],'pt')):[];
  const buscando=!!s.carregando;
  return `<div class="ap-filtros sr-filtros">
    <div class="campo"><label>Projeto</label><select id="sr-proj">${proj?'':'<option value="" selected>— escolha —</option>'}${meus.length?`<optgroup label="Meus projetos">${meus.map(opt).join('')}</optgroup><optgroup label="Todos">${resto.map(opt).join('')}</optgroup>`:resto.map(opt).join('')}</select></div>
    ${c?`<div class="campo"><label>Pessoa</label><select id="sr-resp"><option value="">todas</option><option value="__sem__" ${s.resp==='__sem__'?'selected':''}>— sem responsável —</option>${resps.map(([a,n])=>`<option value="${escA(a)}" ${s.resp===a?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="campo"><label>&nbsp;</label><label class="muted small sr-so-sem"><input type="checkbox" id="sr-so-sem" ${s.soSem?'checked':''}> só sem status report recente</label></div>`:''}
    <div class="campo"><label>&nbsp;</label><button class="btn" id="sr-refresh" ${buscando?'disabled':''} data-tip="Rebuscar do Jira ignorando o cache">${buscando?'↻ buscando…':'↻ Atualizar'}</button></div>
  </div>`;
}
function srAcoesHTML(proj){
  return `<div class="ap-vis sr-acoes-topo">
    <button class="btn" data-sr-copiar="1" data-tip="Copia o relatório em texto simples — para colar na ata, no Teams ou no e-mail">📋 Copiar relatório</button>
    <button class="btn" data-sr-link="1" data-tip="Copia o link desta tela já neste projeto — todo mundo abre a mesma visão">🔗 Copiar link</button>
    <button class="btn" data-sr-gp="1" data-tip="Abre a 🧭 Pendências deste projeto: quem precisa atualizar o quê, com a cobrança pronta">🧭 Pendências por pessoa</button>
    <button class="btn" data-proj-ficha="${escA(proj)}" data-tip="Voltar à ficha deste projeto em 📁 Projetos (🦴 espinha)">📁 Ficha</button></div>`;
}
function srCabHTML(sub,c){
  const proj=srProjAtual();
  return `<div class="card full sr-topo"><h2>📋 Status report <span>${sub}</span></h2>${srFiltrosHTML(c)}${proj?srAcoesHTML(proj):''}</div>`;
}
function renderSr(){
  const cont=document.getElementById('conteudo'); const s=estado.sr;
  if(typeof _projetosCache!=='undefined'&&!_projetosCache&&!s.catB){ s.catB=true; garanteProjetos().then(()=>{ if(estado.vista==='statusrep') renderSr(); }).catch(()=>{}); }
  const proj=srProjAtual();
  if(proj&&!s.proj) s.proj=proj;
  if(!proj){
    cont.replaceChildren(el(`<div>${srCabHTML('escolha um projeto',null)}<div class="estado">Escolha um projeto acima para ver os itens da semana, os bugs abertos e a situação.</div></div>`));
    estadoParaURL(); return;
  }
  srCarrega(false); srCarregaCab();
  const chaveOk=s.dados&&s.chave===proj;
  if(s.erro&&!chaveOk){
    cont.replaceChildren(el(`<div>${srCabHTML('não consegui carregar',null)}<div class="erro"><strong>Falha ao carregar.</strong> ${esc(s.erro)} <button class="btn" id="sr-retry" style="margin-left:10px">Tentar de novo</button></div></div>`));
    estadoParaURL(); return;
  }
  const c=chaveOk?srCalc():null;
  if(!c){
    cont.replaceChildren(el(`<div>${srCabHTML(`${esc(projNomeCod(proj))}`,null)}<div class="estado">Buscando os itens do projeto ${esc(proj)} no Jira…</div></div>`));
    estadoParaURL(); return;
  }
  const m=c.meta; const nome=m.nome||projNomeCod(proj);
  const sub=`${esc(nome)} · hoje ${esc(srDm(c.hoje))} · horizonte até ${esc(srDm(c.ate))}`;
  const aviso=[ m.truncado&&m.truncado.abertos?'⚠ lista de abertos truncada pelo teto do Jira — pode haver itens a mais':'',
    m.truncado&&m.truncado.itens?'⚠ mais de 200 itens: só os 200 primeiros aparecem':'',
    m.truncado&&m.truncado.comentarios?'⚠ não consegui ler os comentários de alguns itens — a coluna Situação pode estar incompleta':'' ].filter(Boolean);
  const f=m.fora||{};
  const rodape=`<div class="muted small sr-fora" id="sr-fora">Fora do relatório: <b>${f.semData||0} sem data</b> · <b>${f.depois||0} depois de ${esc(srDm(c.ate))}</b> (de ${f.total||0} abertos no projeto). Quem precisa atualizar o quê, por pessoa: <button class="lnk-ficha" data-sr-gp="1">🧭 Pendências</button></div>`;
  const vazio=!c.todos.length?'<div class="card full"><div class="sr-vazio">Nenhum item no relatório: não há aberto vencido, da semana, da próxima semana nem bug aberto neste projeto.</div></div>':'';
  const blocos=c.todos.length?[
    srBlocoHTML('venc','⏰ Vencidos','venceu e segue aberto',c.g.vencidos,c),
    srBlocoHTML('sem','📅 Esta semana',`vence até ${esc(srDm(c.fimSemana))}`,c.g.semana,c),
    srBlocoHTML('prox','📅 Próxima semana',`vence de ${esc(srDm(somaDias(c.fimSemana,1)))} a ${esc(srDm(c.ate))}`,c.g.proxima,c),
    srBlocoHTML('bug','🐞 Bugs abertos sem data no horizonte','sem data, ou com data depois do horizonte',c.g.bugs,c)].join(''):'';
  cont.replaceChildren(el(`<div>${srCabHTML(sub,c)}${aviso.length?`<div class="card full sr-aviso">${aviso.map(esc).join('<br>')}</div>`:''}${srSituacaoHTML(c)}${c.todos.length?srKpisHTML(c):''}${vazio}${blocos}${rodape}</div>`));
  estadoParaURL();
}
// ---- 📋 Copiar relatório (texto simples para ata/Teams/e-mail) ----
function srLinkTela(proj){ return `${location.origin}/?v=statusrep&srproj=${encodeURIComponent(proj)}`; }
function srTextoRelatorio(c){
  const s=estado.sr; const cab=s.cab; const proj=srProjAtual();
  const manual=cab&&cab.saude&&SR_SEMAFORO[cab.saude]?cab.saude:'';
  const L=[`📋 Status report — ${c.meta.nome||projNomeCod(proj)} — ${dataBR(c.hoje)}`];
  L.push(`Semáforo: ${SR_SEMAFORO[manual||c.auto.saude].ic} ${SR_SEMAFORO[manual||c.auto.saude].rot}${manual&&manual!==c.auto.saude?` (manual; os números sugerem ${SR_SEMAFORO[c.auto.saude].ic})`:` — ${manual?'manual':'sugerido'}: ${c.auto.motivo}`}`);
  if(cab&&cab.resumo) L.push(`Resumo: ${cab.resumo}`);
  const prox=cab&&Array.isArray(cab.proximos)?cab.proximos.filter(p=>p&&p.t):[];
  if(prox.length){ L.push('🎯 Próximos passos:'); prox.forEach(p=>L.push(`• ${p.t}${p.quando?` — ${srDm(p.quando)}`:''}${p.quem?` — ${p.quem}`:''}`)); }
  if(cab&&cab.riscos) L.push(`⚠ Riscos: ${cab.riscos}`);
  L.push(`⏰ ${c.kpis.vencidos} vencido(s) · 📅 ${c.kpis.semana} esta semana · 📅 ${c.kpis.proxima} próxima semana · 🐞 ${c.kpis.bugs} bug(s) aberto(s)`);
  const bloco=(tit,lista)=>{ if(!lista.length) return;
    L.push('',`${tit} (${lista.length})`);
    lista.forEach(t=>{
      let sit='sem comentário';
      if(t.sr) sit=`${t.sr.rot} (${srPrimeiro(t.sr.por)}, ${srDm(t.sr.dia)})${t.sr.texto?`: ${t.sr.texto.slice(0,140)}`:''}`;
      else if(t.ult) sit=`💬 ${srPrimeiro(t.ult.por)} ${srDm(t.ult.dia)}: ${(t.ult.texto||'').slice(0,140)}`;
      L.push(`• ${t.k} — ${t.resumo||'—'} (${t.resp?srPrimeiro(t.resp):'sem responsável'})${t.venc?` · vence ${srDm(t.venc)}`:''} · ${t.status||'—'} · ${sit}`); }); };
  bloco('⏰ Vencidos',c.g.vencidos); bloco('📅 Esta semana',c.g.semana); bloco('📅 Próxima semana',c.g.proxima); bloco('🐞 Bugs abertos sem data no horizonte',c.g.bugs);
  L.push('',srLinkTela(proj));
  return L.join('\n');
}
// ---- Listeners delegados desta tela ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='statusrep') return;
  const cl=(q)=>e.target.closest&&e.target.closest(q); const s=estado.sr;
  const ir=cl('[data-sr-ir]'); if(ir){ const b=document.getElementById('sr-'+ir.getAttribute('data-sr-ir')); if(b) b.scrollIntoView({behavior:'smooth',block:'start'}); return; }
  const so=cl('[data-sr-so-sem]'); if(so){ s.soSem=!s.soSem; renderSr(); return; }
  const cp=cl('[data-sr-copiar]'); if(cp){ const c=srCalc(); if(c) gpCopia(srTextoRelatorio(c),'📋 Relatório copiado — cole na ata, no Teams ou no e-mail.'); return; }
  const lk=cl('[data-sr-link]'); if(lk){ const p=srProjAtual(); if(p) gpCopia(srLinkTela(p),'🔗 Link copiado — todo mundo abre a mesma visão.'); return; }
  const gp=cl('[data-sr-gp]'); if(gp){ const p=srProjAtual(); if(p&&estado.gp){ estado.gp.proj=p; estado.gp.meus=false; estado.gp.resp=''; } vaiPara('gp'); return; }
  const b=e.target.closest&&e.target.closest('button'); if(!b) return;
  if(b.id==='sr-refresh'){ if(b.disabled) return; s.cabProj=''; srCarrega(true); renderSr(); }   // o render seguinte mostra "buscando…" até a resposta
  else if(b.id==='sr-retry'){ s.erro=''; s.cabProj=''; srCarrega(true); renderSr(); }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='statusrep') return;
  const t=e.target; const s=estado.sr; if(!t||!t.id) return;
  if(t.id==='sr-proj'){ srProjSet(t.value); s.erro=''; s.cab=null; s.cabProj=''; s.edit=false; s.rasc=null; renderSr(); }
  else if(t.id==='sr-resp'){ s.resp=t.value; renderSr(); }
  else if(t.id==='sr-so-sem'){ s.soSem=!!t.checked; renderSr(); }
});
