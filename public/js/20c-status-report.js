// Jira Insights · 20c · 📋 STATUS REPORT DO PROJETO (2026-11-05, a pedido do usuário: "pegar os itens abertos, que
// vencem na próxima semana ou do tipo bug; ter modelos para atualizar o comentário no ticket; tudo intuitivo, fácil
// de ler as pendências do projeto e fácil de atualizar; todo mundo com a mesma visão de próximas atividades e da
// situação do projeto"). UM projeto por vez, em ?v=statusrep&srproj=KEY (`srproj` tem nome próprio para não disputar
// o ?proj= do filtro global — mesma regra de gproj/cproj/pproj).
// Dados: (1) os itens vêm de GET /api/vencimentos?statusrep=KEY (conta de serviço; só o que entra no relatório —
// abertos vencidos/da semana/da próxima semana + bugs abertos — já com o ÚLTIMO comentário `ult` e o último comentário
// com o MARCADOR "📋 Status report · …" `sr`); (2) a "situação do projeto" (semáforo, resumo, próximos passos, riscos)
// mora numa linha própria `sr_<KEY>` em jirainsight_config, lida por GET /api/config?sr=KEY — NUNCA na `cfg`.
// (3) 🧩 os tipos de item que NÃO entram (cfg.srTiposExcluir: padrão + por projeto) vão na leitura como &excl= — ver o bloco 🧩 abaixo.
// Nesta etapa a tela é só LEITURA: o 📝 Atualizar (modelos de comentário) e a edição da situação entram depois e
// se encaixam nos ganchos marcados com data-sr-slot (coluna de ação da linha e rodapé da situação).
estado.sr=estado.sr||{ proj:'', dados:null, chave:'', carregando:'', erro:'', cache:{}, sujo:false, cab:null, cabB:false,
  cabErro:'', cabProj:'', cabRev:'', edit:false, rasc:null, cabConf:null, cabSalvando:false, histAberto:false, resp:'', soSem:false, catB:false, mais:'', achar:null, acharRele:'' };
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
// ---- 🧩 Tipos de item fora do relatório (2026-11-05, a pedido do usuário: "excluir alguns tipos de itens que não precisam
// aparecer no report, por exemplo épicos, histórias, reuniões"). Decisões do usuário: uma lista PADRÃO para todos os
// projetos + lista PRÓPRIA por projeto; qualquer pessoa identificada muda (SR_EXCL_SO_GESTORES=true religa a restrição a
// gestores/admin); o item excluído SOME SEM RASTRO (blocos, KPIs, semáforo sugerido, "fora do relatório", 📋 texto copiado,
// contador da aba); o padrão nasce com Épico, História e Reunião (sinônimos em inglês valem: Epic, Story, Meeting).
// Mora em cfg.srTiposExcluir = { padrao:{tipos,por,em}, proj:{ KEY:{proprio:true,tipos,por,em} | {proprio:false,por,em} } }
// — sempre OBJETOS com por/em (lista vazia solta "não conta como mudança" na mescla de três vias da config). srExcl é LEITOR
// (não cria a chave); quem grava é srTiposSalva + salvaCfg() uma vez. O servidor recebe a lista expandida (&excl=) e tira os
// itens antes do teto de 200; a tela filtra de novo em srCalc, para a troca valer na hora (antes da releitura).
const SR_EXCL_PADRAO=['Épico','História','Reunião'];
const SR_EXCL_SO_GESTORES=false;
const SR_EXCL_MAX=40;
const SR_TIPO_GRUPOS=[['epico','epic','epicos','epics'],['historia','story','user story','estoria','historias','stories'],['reuniao','meeting','reunioes','meetings']];
const srNormTipo=(n)=>String(n||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/,/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
function srCanonTipo(n){ const k=srNormTipo(n); const g=SR_TIPO_GRUPOS.find(x=>x.includes(k)); return g?g[0]:k; }
const srTiposLimpa=(l)=>[...new Set((Array.isArray(l)?l:[]).map(v=>String(v==null?'':v).trim().slice(0,40)).filter(Boolean))].slice(0,SR_EXCL_MAX);
function srExcl(proj){
  const x=(typeof cfg!=='undefined'&&cfg&&cfg.srTiposExcluir&&typeof cfg.srTiposExcluir==='object')?cfg.srTiposExcluir:{};
  const p=(x.proj&&typeof x.proj==='object'&&proj)?x.proj[proj]:null;
  if(p&&typeof p==='object'&&p.proprio===true) return { tipos:srTiposLimpa(p.tipos), fonte:'proj', por:String(p.por||''), em:String(p.em||'') };
  const d=(x.padrao&&typeof x.padrao==='object'&&Array.isArray(x.padrao.tipos))?x.padrao:null;
  return d?{ tipos:srTiposLimpa(d.tipos), fonte:'padrao', por:String(d.por||''), em:String(d.em||'') }:{ tipos:SR_EXCL_PADRAO.slice(), fonte:'fixo', por:'', em:'' };
}
// Conjunto dos nomes normalizados que saem (com os sinônimos de cada grupo).
function srExclNorm(proj){ const set=new Set();
  srExcl(proj).tipos.forEach(nm=>{ const k=srNormTipo(nm); if(!k) return; const g=SR_TIPO_GRUPOS.find(x=>x.includes(k)); (g||[k]).forEach(v=>set.add(v)); });
  return set; }
const srExclChave=(proj)=>[...srExclNorm(proj)].sort().join(',');
// ---- Parâmetros ----
function srProjAtual(){
  const s=estado.sr; if(s.proj) return s.proj;
  try{ const k=String(localStorage.getItem(SR_PROJ_KEY)||'').toUpperCase(); if(/^[A-Z][A-Z0-9_]*$/.test(k)) return k; }catch(e){}
  const id=idApontar(); const m=(id&&id.accountId)?meusProjetos(id.accountId):[];
  return m.length?m[0]:'';
}
function srProjSet(k){
  k=String(k||'').toUpperCase(); const s=estado.sr;
  if(k!==s.proj){ s.resp=''; s.erro=''; s.achar=null; s.acharRele=''; }   // o erro era do projeto anterior: sem isto, o novo nunca seria lido
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
  const f=!!forca;
  const nc=f||s.sujo;   // `sujo` (depois de publicar): o cache da tela segue valendo — já tem a atualização otimista —, mas a próxima leitura real vai sem o cache do servidor
  const ek=srExclChave(proj); const ck=proj+'|'+ek;   // 🧩 a lista de tipos excluídos faz parte da leitura: mudou a lista, relê
  const c=s.cache[proj];
  if(!f&&c&&c.ek===ek&&(Date.now()-c.em)<SR_CACHE_MIN*60000){ s.dados=c.dados; s.chave=proj; s.erro=''; return; }
  if(s.carregando===ck) return;
  if(!f&&s.erro) return;   // falhou: nada de laço de releitura — o ↻ / "Tentar de novo" forçam
  s.carregando=ck; s.erro=''; s.sujo=false;
  fetch(`/api/vencimentos?statusrep=${encodeURIComponent(proj)}${ek?`&excl=${encodeURIComponent(ek)}`:''}${nc?'&nocache=1':''}`)
    .then(r=>r.json().catch(()=>({erro:'resposta inválida'}))).then(j=>{
      if(s.carregando===ck) s.carregando='';
      const falhou=!j||j.erro||!j.meta||!Array.isArray(j.itens);
      if(falhou){ if(srProjAtual()===proj) s.erro=(j&&j.erro)||'resposta vazia'; }
      else { s.cache[proj]={ dados:j, em:Date.now(), ek }; if(srProjAtual()===proj){ s.dados=j; s.chave=proj; s.erro=''; } }
      if(s.acharRele&&srProjAtual()===proj){ const kk=s.acharRele; s.acharRele='';   // só refaz se a busca na tela ainda é a dela (outra busca ou o ✕ cancelam)
        if(estado.vista==='statusrep'&&s.achar&&s.achar.k===kk){
          if(falhou){ srAcharFalhaRele(kk,(j&&j.erro)||'resposta vazia'); return; }   // sem lista nova: não dá para dizer que o Jira "não devolveu"
          srAchar(kk,true); return; } }
      if(estado.vista==='statusrep') renderSr();
      if(typeof renderAbas==='function') try{ renderAbas(); }catch(e){}   // 🔢 contador da aba
    }).catch(e=>{ if(s.carregando===ck) s.carregando=''; if(srProjAtual()===proj) s.erro=humanizaErro(e);
      if(s.acharRele&&srProjAtual()===proj){ const kk=s.acharRele; s.acharRele='';
        if(estado.vista==='statusrep'&&s.achar&&s.achar.k===kk){ srAcharFalhaRele(kk,e); return; } }
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
  const ex=srExclNorm(srProjAtual());   // 🧩 o tipo excluído some de tudo daqui para baixo (blocos, KPIs, semáforo, texto, contador)
  const c={ hoje, fimSemana:m.fimSemana||hoje, ate:m.ate||hoje, N, meta:m, todos:(d.itens||[]).filter(t=>!ex.has(srNormTipo(t.t))) };
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
// Botões da coluna de ação: o rótulo vai num <span class="sr-rot"> (o CSS o esconde em tela estreita; title e aria-label ficam).
function srAcoesLinhaHTML(k){
  const K=escA(k);
  // Só `title` + `aria-label` (sem data-tip: os dois juntos mostravam dois tooltips no desktop).
  const bt=(attr,cls,ic,rot,tip)=>`<button class="gp-mini ${cls}" ${attr}="${K}" title="${escA(tip)}" aria-label="${escA(rot+' '+k)}">${ic} <span class="sr-rot">${esc(rot)}</span></button>`;
  return bt('data-sr-at','sr-at','📝','Atualizar','Publica um status report no ticket: escolha o modelo, preencha e publique (comentário, nova data e status no mesmo passo)')
    +bt('data-sr-fim','sr-fim','✅','Concluir','Conclui o ticket no Jira, com um comentário de status report já pronto (você pode editar ou apagar)')
    +bt('data-sr-resp','sr-resp','👤','Transferir','Passa o ticket para outra pessoa, com um comentário que a marca (o Jira avisa)')
    +`<button class="gp-mini sr-mais-b" data-sr-mais="${K}" aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações de ${escA(k)}" title="Mais ações: mudar status, apontar horas, comentar, reagendar">⋯</button>`;
}
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
    <div class="sr-c-acao" data-sr-slot="at">${srAcoesLinhaHTML(t.k)}</div></div>`;
}
function srBlocoHTML(id,tit,sub,lista,c){
  const corpo=lista.length?`<div class="sr-tab"><div class="sr-tab-h"><div>Ticket</div><div>Resumo</div><div>Resp.</div><div>Venc.</div><div>Status</div><div>Situação</div><div></div></div>${lista.map(t=>srLinhaHTML(t,c)).join('')}</div>`
    :'<div class="sr-vazio">✓ nada aqui.</div>';
  return `<div class="card full sr-bloco" id="sr-${id}" data-sr-bloco="${id}"><h2>${tit} <span class="sr-n">${lista.length}</span><span>${sub}</span></h2>${corpo}</div>`;
}
// ---- ✏️ Situação do projeto: edição inline (T4) ----
const SR_MAX_PROX=10;
function srCabRascunhoDe(cab){
  const c=(cab&&typeof cab==='object')?cab:{};
  return { saude:SR_SEMAFORO[c.saude]?c.saude:'', resumo:String(c.resumo||''), riscos:String(c.riscos||''),
    proximos:(Array.isArray(c.proximos)?c.proximos:[]).filter(p=>p&&typeof p==='object').map(p=>({ t:String(p.t||''), quando:String(p.quando||''), quem:String(p.quem||'') })) };
}
// Lê o formulário aberto para estado.sr.rasc (chamado a cada input/change — nunca redesenha).
function srCabRascunho(){
  const f=document.getElementById('sr-cab-form'); const s=estado.sr; if(!f) return s.rasc;
  const v=(id)=>{ const e=document.getElementById(id); return e?e.value:''; };
  s.rasc={ saude:v('sr-saude'), resumo:v('sr-resumo'), riscos:v('sr-riscos'),
    proximos:[...f.querySelectorAll('[data-sr-prox-i]')].map(l=>({ t:l.querySelector('.sr-p-t').value, quando:l.querySelector('.sr-p-q').value, quem:l.querySelector('.sr-p-w').value })) };
  return s.rasc;
}
function srCabFormHTML(c){
  const s=estado.sr; const r=s.rasc||(s.rasc=srCabRascunhoDe(s.cab)); const a=c.auto;
  const pes=srPessoasDo(c); const nomes=[...new Set([...pes.proj.map(x=>pes.todas[x]),...pes.outras.map(x=>pes.todas[x])])];
  const linha=(p,i)=>{ const ops=nomes.includes(p.quem)||!p.quem?nomes:[p.quem,...nomes];
    return `<div class="sr-prox-l" data-sr-prox-i="${i}">
      <input type="text" class="sr-p-t" maxlength="200" value="${escA(p.t)}" placeholder="O que vai acontecer" aria-label="Próximo passo ${i+1}" autocomplete="off">
      <input type="date" class="sr-p-q" value="${escA(p.quando)}" aria-label="Data do passo ${i+1}">
      <select class="sr-p-w" aria-label="Quem faz o passo ${i+1}"><option value="">— quem —</option>${ops.map(n=>`<option value="${escA(n)}" ${p.quem===n?'selected':''}>${esc(n)}</option>`).join('')}</select>
      <button type="button" class="gp-mini" data-sr-prox-rm="${i}" aria-label="Remover o passo ${i+1}" data-tip="Remover este passo">✕</button></div>`; };
  const conf=s.cabConf?`<div class="sr-conflito" role="status"><b>⚠ ${esc(s.cabConf.por||'Outra pessoa')} salvou antes de você${s.cabConf.em?` (${esc(srQuando(s.cabConf.em))})`:''}.</b> A versão dela já está no topo da tela${s.cabConf.resumo?`; resumo dela: “${esc(s.cabConf.resumo.length>160?s.cabConf.resumo.slice(0,159)+'…':s.cabConf.resumo)}”`:''}. O que você digitou foi mantido — confira e salve de novo para valer o seu.</div>`:'';
  return `${conf}<div id="sr-cab-form" class="sr-cab-form">
    <div class="campo"><label for="sr-saude">Semáforo</label><select id="sr-saude"><option value="" ${r.saude===''?'selected':''}>automático (sugerido: ${SR_SEMAFORO[a.saude].ic} ${esc(SR_SEMAFORO[a.saude].rot)})</option>${Object.keys(SR_SEMAFORO).map(k=>`<option value="${k}" ${r.saude===k?'selected':''}>${SR_SEMAFORO[k].ic} ${esc(SR_SEMAFORO[k].rot)}</option>`).join('')}</select></div>
    <div class="campo"><label for="sr-resumo">Resumo da situação <span class="muted small">— em 3 linhas, o que o time precisa saber</span></label><textarea id="sr-resumo" rows="4" maxlength="1500">${esc(r.resumo)}</textarea></div>
    <div class="campo"><label>🎯 Próximos passos <span class="muted small">— até ${SR_MAX_PROX}</span></label>
      <div class="sr-prox-ls">${r.proximos.map(linha).join('')}</div>
      <button type="button" class="btn" data-sr-prox-add="1">➕ Adicionar passo</button> <span class="muted small" id="sr-prox-dica" role="status"></span></div>
    <div class="campo"><label for="sr-riscos">⚠ Riscos</label><textarea id="sr-riscos" rows="3" maxlength="1000">${esc(r.riscos)}</textarea></div>
    <div class="alx-fb ap-fb${s.cabFb?' erro':''}" id="sr-cab-fb" ${s.cabFb?'':'hidden'}>${esc(s.cabFb)}</div>
    <div class="sr-cab-acoes"><button type="button" class="btn primario" id="sr-cab-salva" ${s.cabSalvando?'disabled':''}>💾 Salvar</button><button type="button" class="btn" id="sr-cab-cancela">Cancelar</button></div></div>`;
}
function srCabAbre(){
  const s=estado.sr;
  if(!idApontar()){ abreIdentidade('escrever a situação do projeto',{ depois:()=>{ if(estado.vista==='statusrep') srCabAbre(); } }); return; }
  s.edit=true; s.rasc=srCabRascunhoDe(s.cab); s.cabFb=''; s.cabConf=null; renderSr();
  const e=document.getElementById('sr-resumo'); if(e) e.focus();
}
function srCabFecha(){ const s=estado.sr; s.edit=false; s.rasc=null; s.cabFb=''; s.cabConf=null; renderSr(); }
async function srCabSalva(){
  const s=estado.sr; if(s.cabSalvando) return;
  const id=idApontar();
  if(!id){ abreIdentidade('escrever a situação do projeto',{ depois:()=>{ if(estado.vista==='statusrep') srCabSalva(); } }); return; }
  const proj=srProjAtual(); if(!proj) return;
  const r=srCabRascunho()||s.rasc; if(!r) return;
  const dados={ saude:r.saude, resumo:r.resumo, riscos:r.riscos, proximos:r.proximos.filter(p=>String(p.t||'').trim()) };
  if(dados.proximos.length>SR_MAX_PROX){ s.cabFb=`Máximo de ${SR_MAX_PROX} próximos passos.`; renderSr(); return; }
  s.cabSalvando=true; s.cabFb='';
  const btn=document.getElementById('sr-cab-salva'); if(btn) ocupado(btn,true);
  let j;
  try{ j=await (await fetch('/api/config?sr=1',{ method:'POST', headers:mpHeaders(), body:JSON.stringify({ acao:'salvar', proj, base:s.cabRev, dados }) })).json(); }
  catch(e){ j={ ok:false, erro:humanizaErro(e) }; }
  s.cabSalvando=false;
  if(srProjAtual()!==proj){ toast(j&&j.ok?`✓ situação de ${proj} salva.`:`Não consegui salvar a situação de ${proj}.`,j&&j.ok?'ok':'warn'); return; }
  if(j&&j.ok){
    s.cab=(j.dados&&typeof j.dados==='object')?j.dados:null; s.cabRev=j.rev||''; s.cabProj=proj; s.cabErro='';
    s.edit=false; s.rasc=null; s.cabFb=''; s.cabConf=null;
    toast('✓ situação salva — todo mundo vê','ok');
  } else if(j&&j.conflito){
    const at=j.atual||{}; const d=(at.dados&&typeof at.dados==='object')?at.dados:null;
    s.cab=d; s.cabRev=at.rev||''; s.cabProj=proj; s.cabErro='';
    s.cabConf={ por:d&&d.por?d.por.nome:'', em:d?d.atualizadoEm:'', resumo:d?String(d.resumo||''):'' };
    s.cabFb='';
    toast('A situação foi alterada por outra pessoa — a tela mostra a versão dela; o seu texto foi mantido, confira e salve de novo.','warn');
  } else { s.cabFb=(j&&j.erro)||'Não consegui salvar a situação.'; }
  if(estado.vista==='statusrep') renderSr();
}
function srSituacaoHTML(c){
  const s=estado.sr; const cab=s.cab; const a=c.auto;
  const manual=cab&&cab.saude&&SR_SEMAFORO[cab.saude]?cab.saude:'';
  const sem=SR_SEMAFORO[manual||a.saude];
  const tip='Regra do sugerido: 🔴 se há item bloqueado, 3 ou mais vencidos ou vencidos em 30% ou mais dos itens · 🟡 se há vencido, item aguardando o cliente ou 3 ou mais itens sem status report há '+c.N+' dias · 🟢 nos demais casos. O semáforo escrito por uma pessoa vale mais que o sugerido.';
  const sug=`<span class="sr-sug" data-tip="${escA(tip)}">sugerido pelos números: ${SR_SEMAFORO[a.saude].ic} (${esc(a.motivo)})</span>`;
  const dif=manual&&manual!==a.saude?`<span class="sr-dif">manual ${SR_SEMAFORO[manual].ic} · sugerido ${SR_SEMAFORO[a.saude].ic}</span>`:'';
  const prontoLer=s.cabProj===srProjAtual()||s.cabErro;
  let corpo;
  if(s.edit&&s.rasc) corpo=srCabFormHTML(c);
  else if(s.cabProj!==srProjAtual()&&!s.cabErro) corpo='<div class="muted small">Lendo a situação do projeto…</div>';
  else if(s.cabErro) corpo=`<div class="muted small">⚠ Não consegui ler a situação escrita (${esc(s.cabErro)}). Os números abaixo valem; use o ↻.</div>`;
  else if(!cab) corpo='<div class="sr-vazio">Ninguém escreveu a situação ainda — o semáforo acima é só o sugerido pelos números.</div>';
  else {
    const prox=(Array.isArray(cab.proximos)?cab.proximos:[]).filter(p=>p&&p.t);
    corpo=`${cab.resumo?`<div class="sr-resumo"><h3>Resumo</h3><p>${esc(cab.resumo).replace(/\n/g,'<br>')}</p></div>`:''}
      ${prox.length?`<div class="sr-prox"><h3>🎯 Próximos passos</h3><ul>${prox.map(p=>`<li>${esc(p.t)}${p.quando?` <span class="muted small">· ${esc(srDm(p.quando))}</span>`:''}${p.quem?` <span class="muted small">· ${esc(p.quem)}</span>`:''}</li>`).join('')}</ul></div>`:''}
      ${cab.riscos?`<div class="sr-riscos"><h3>⚠ Riscos</h3><p>${esc(cab.riscos).replace(/\n/g,'<br>')}</p></div>`:''}
      <div class="muted small sr-rodape-sit">Atualizado${cab.por&&cab.por.nome?` por ${esc(cab.por.nome)}`:''}${cab.atualizadoEm?` em ${esc(srQuando(cab.atualizadoEm))}`:''}</div>
      ${Array.isArray(cab.hist)&&cab.hist.length?`<details class="sr-hist" data-sr-hist="1" ${s.histAberto?'open':''}><summary>📜 Histórico da situação (${cab.hist.length})</summary><ul>${cab.hist.map(h=>`<li>${esc(srQuando(h.em))} · ${esc(h.por||'')} · ${h.saude&&SR_SEMAFORO[h.saude]?SR_SEMAFORO[h.saude].ic:'—'} ${esc(h.resumo||'')}</li>`).join('')}</ul></details>`:''}`;
  }
  const edita=(!s.edit&&prontoLer)?`<button type="button" class="btn" data-sr-cab-edit="1" data-tip="Escreve a situação do projeto (semáforo, resumo, próximos passos e riscos) — todo mundo passa a ver o que você salvar">✏️ Editar a situação</button>`:'';
  return `<div class="card full sr-situacao"><h2>🧭 Situação do projeto <span>a mesma visão para todo o time</span></h2>
    <div class="sr-sem-linha"><span class="sr-semaforo ${manual||a.saude}" data-tip="${escA(tip)}">${sem.ic} ${esc(sem.rot)}</span>${dif}${sug}</div>
    ${corpo}<div class="sr-sit-acoes" data-sr-slot="cab">${edita}</div></div>`;
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
    ${c?`<div class="campo sr-achar-c"><label for="sr-achar">Achar ticket</label><div class="sr-achar-l"><input type="text" id="sr-achar" maxlength="200" placeholder="ex.: ${escA(proj)}-123" autocomplete="off" value="${escA(s.achar&&s.achar.q||'')}" aria-describedby="sr-achar-res"><button class="btn" type="button" data-sr-achar="1" title="Acha o ticket no relatório ou diz por que ele não aparece" aria-label="Achar ticket no relatório">🔎</button></div></div>`:''}
  </div>${c&&s.achar&&s.achar.html?`<div class="sr-achar-res sr-achar-${escA(s.achar.tom||'info')}" id="sr-achar-res" role="status">${s.achar.html} <button type="button" class="gp-mini" data-sr-achar-fecha="1" aria-label="Fechar a resposta da busca">✕</button></div>`:''}`;
}
function srAcoesHTML(proj){
  return `<div class="ap-vis sr-acoes-topo">
    <button class="btn" data-sr-copiar="1" data-tip="Copia o relatório em texto simples — para colar na ata, no Teams ou no e-mail">📋 Copiar relatório</button>
    <button class="btn" data-sr-link="1" data-tip="Copia o link desta tela já neste projeto — todo mundo abre a mesma visão">🔗 Copiar link</button>
    <button class="btn" data-sr-gp="1" data-tip="Abre a 🧭 Pendências deste projeto: quem precisa atualizar o quê, com a cobrança pronta">🧭 Pendências por pessoa</button>
    <button class="btn" data-proj-ficha="${escA(proj)}" data-tip="Voltar à ficha deste projeto em 📁 Projetos (🦴 espinha)">📁 Ficha</button>
    <button class="btn" data-sr-tipos="1" data-tip="Escolha os tipos de item que não entram no relatório (ex.: épicos, histórias, reuniões) — na lista padrão de todos os projetos ou numa lista só deste; vale para todo o time">🧩 Tipos no relatório</button>
    ${srPodeEditarTpl()?'<button class="btn" data-sr-tpls="1" data-tip="Só gestores: edite os modelos de comentário do 📝 Atualizar (rótulo, texto, campos)">⚙️ Modelos</button>':''}</div>`;
}
function srCabHTML(sub,c){
  const proj=srProjAtual();
  return `<div class="card full sr-topo"><h2>📋 Status report <span>${sub}</span></h2>${srFiltrosHTML(c)}${proj?srAcoesHTML(proj):''}</div>`;
}
function renderSr(){
  const cont=document.getElementById('conteudo'); const s=estado.sr;
  s.mais='';
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
// ---- 🔎 Achar ticket — "por que não aparece?" (2026-11-12, JI-285: "não aparece o ticket COP-1155 no status report") ----
// A tela tem quatro jeitos de um aberto não aparecer: o tipo está na lista 🧩, o filtro Pessoa, o "só sem status report
// recente" e a regra do relatório (concluído, sem data e não é bug, vence depois do horizonte, outro projeto). A busca diz
// QUAL, com o botão que desfaz; se o ticket devia estar na lista, relê do Jira (nocache) e procura de novo UMA vez.
// O resultado mora em estado.sr.achar ({q,k,html,tom}, html já escapado) e some ao trocar de projeto.
const SR_RE_BUG=/\b(bug|erro|defeito|incidente|falha)\b/i;   // mesma régua do RE_BUG_SR do servidor (api/vencimentos.js)
function srAcharChave(q){ const m=/([A-Za-z][A-Za-z0-9_]*-\d+)/.exec(String(q||'')); return m?m[1].toUpperCase():''; }
function srGrupoDe(t,c){ const v=t.venc||'';
  if(v&&v<c.hoje) return { id:'venc', rot:'⏰ Vencidos' };
  if(v&&v<=c.fimSemana) return { id:'sem', rot:'📅 Esta semana' };
  if(v&&v<=c.ate) return { id:'prox', rot:'📅 Próxima semana' };
  return { id:'bug', rot:'🐞 Bugs abertos' }; }
function srAcharRola(k){
  const r=document.querySelector(`.sr-row[data-sr-k="${CSS.escape(k)}"]`); if(!r) return;
  try{ r.scrollIntoView({behavior:'smooth',block:'center'}); }catch(e){ r.scrollIntoView(); }
  r.classList.add('sr-achado'); setTimeout(()=>r.classList.remove('sr-achado'),2500);
}
// A releitura pedida pelo 🔎 falhou: diz isso (nada de "Relendo…" para sempre nem "o Jira não devolveu" sem lista nova).
function srAcharFalhaRele(k,erro){
  srAcharMostra({ q:k, k, tom:'warn', html:`Não consegui reler a lista do Jira para procurar <b>${esc(k)}</b>: ${esc(humanizaErro(erro))} Use o ↻ Atualizar e procure de novo.` });
}
function srAcharMostra(o){ estado.sr.achar=o; if(estado.vista==='statusrep') renderSr(); }
async function srAchar(q,jaReleu){
  const s=estado.sr; const proj=srProjAtual(); const k=srAcharChave(q); const K=`<b>${esc(k)}</b>`;
  if(!jaReleu) s.acharRele='';   // busca nova cancela a releitura que outra busca tinha pedido
  if(!k){ srAcharMostra({ q:String(q||''), k:'', tom:'warn', html:'Digite a chave do ticket (ex.: COP-1155) ou cole o link do Jira.' }); return; }
  const c=s.dados&&s.chave===proj?srCalc():null;
  if(!c){ srAcharMostra({ q:k, k, tom:'warn', html:'Espere a lista do projeto carregar e procure de novo.' }); return; }
  const tipoFora=(t)=>srExclNorm(proj).has(srNormTipo(t));
  const qualLista=()=>srExcl(proj).fonte==='proj'?`a lista própria do ${esc(proj)}`:'a lista padrão';
  const naTela=c.itens.find(t=>t.k===k);
  if(naTela){ const g=srGrupoDe(naTela,c);
    srAcharMostra({ q:k, k, tom:'ok', html:`✓ ${K} está no bloco <b>${esc(g.rot)}</b>${naTela.venc?` (vence ${esc(srDm(naTela.venc))})`:''}.` });
    srAcharRola(k); return; }
  const filtrado=c.todos.find(t=>t.k===k);
  if(filtrado){
    const mot=[]; const bts=[];
    if(s.resp&&(s.resp==='__sem__'?!!filtrado.respId:filtrado.respId!==s.resp)){
      mot.push(`o filtro <b>Pessoa</b> está ligado e o responsável é ${esc(filtrado.resp||'ninguém')}`); bts.push('<button type="button" class="gp-mini" data-sr-achar-limpa="resp">mostrar todas as pessoas</button>'); }
    if(s.soSem&&!srSemSR(filtrado,c)){
      mot.push(`o filtro <b>só sem status report recente</b> está ligado e ele tem status report de ${esc(srDm(filtrado.sr&&filtrado.sr.dia))}`); bts.push('<button type="button" class="gp-mini" data-sr-achar-limpa="sem">desligar o filtro</button>'); }
    srAcharMostra({ q:k, k, tom:'warn', html:`${K} está no relatório, mas escondido: ${mot.join(' e ')||'um filtro da tela'}. ${bts.join(' ')}` }); return; }
  const doServ=(s.dados.itens||[]).find(t=>t.k===k);
  if(doServ&&tipoFora(doServ.t)){
    srAcharMostra({ q:k, k, tom:'warn', html:`${K} não aparece porque o tipo <b>${esc(doServ.t)}</b> está fora do relatório pela ${qualLista()} (🧩). <button type="button" class="gp-mini" data-sr-tipos="1">🧩 abrir os tipos</button>` }); return; }
  srAcharMostra({ q:k, k, tom:'info', html:`🔎 Lendo ${K} no Jira…` });
  let f; try{ f=await fetch(`/api/vencimentos?detalhe=${encodeURIComponent(k)}`).then(jsonOuErro); }catch(e){ f={ erro:humanizaErro(e) }; }
  if(!s.achar||s.achar.k!==k||srProjAtual()!==proj) return;   // outra busca ou outro projeto enquanto lia
  if(!f||f.erro){ srAcharMostra({ q:k, k, tom:'warn', html:`Não consegui ler ${K} no Jira: ${esc(humanizaErro(f&&f.erro||'sem resposta'))}` }); return; }
  const c2=srCalc()||c; const ate=c2.ate;
  let html='';
  if(f.p&&f.p!==proj) html=`${K} é do projeto <b>${esc(projNomeCod(f.p))}</b>, não do ${esc(proj)}. <button type="button" class="gp-mini" data-sr-achar-proj="${escA(f.p)}">abrir o status report do ${esc(f.p)}</button>`;
  else if(f.statCat==='done') html=`${K} está <b>concluído</b> (status “${esc(f.status||'—')}”${f.resolvido?`, em ${esc(srDm(f.resolvido))}`:''}) — o relatório só mostra itens abertos.`;
  else if(tipoFora(f.t)) html=`${K} não aparece porque o tipo <b>${esc(f.t)}</b> está fora do relatório pela ${qualLista()} (🧩). <button type="button" class="gp-mini" data-sr-tipos="1">🧩 abrir os tipos</button>`;
  else if(!f.venc&&!SR_RE_BUG.test(f.t||'')) html=`${K} não tem <b>data de vencimento</b> e não é bug — o relatório mostra vencidos, os desta semana e os da próxima (até ${esc(srDm(ate))}) e os bugs abertos. Dê uma data ao ticket para ele entrar.`;
  else if(f.venc&&f.venc>ate&&!SR_RE_BUG.test(f.t||'')) html=`${K} vence em <b>${esc(srDm(f.venc))}</b>, depois do horizonte do relatório (até ${esc(srDm(ate))}). Ele entra quando a data chegar perto.`;
  else if(!jaReleu){
    srAcharMostra({ q:k, k, tom:'info', html:`${K} deveria estar no relatório (aberto${f.venc?`, vence ${esc(srDm(f.venc))}`:', bug'}). Relendo a lista do Jira…` });
    s.acharRele=k; s.cabProj=''; srCarrega(true); return; }
  else html=`${K} está aberto${f.venc?` e vence ${esc(srDm(f.venc))}`:''}, mas o Jira não o devolveu na lista do ${esc(proj)} mesmo relendo agora. Abra o ticket no Jira e confira o projeto e o status; se continuar, use o 🐞 Reportar com esta chave.`;
  srAcharMostra({ q:k, k, tom:'warn', html });
}
// ---- 📋 Copiar relatório (texto simples para ata/Teams/e-mail) ----
function srLinkTela(proj){ return `${location.origin}/?v=statusrep&srproj=${encodeURIComponent(proj)}`; }
function srTextoRelatorio(c){
  const s=estado.sr; const cab=s.cab; const proj=srProjAtual();
  const manual=cab&&cab.saude&&SR_SEMAFORO[cab.saude]?cab.saude:'';
  const L=[`📋 Status report — ${c.meta.nome||projNomeCod(proj)} — ${dataBR(c.hoje)}`];
  L.push(`Semáforo: ${SR_SEMAFORO[manual||c.auto.saude].ic} ${SR_SEMAFORO[manual||c.auto.saude].rot}${manual&&manual!==c.auto.saude?` (manual; os números sugerem ${SR_SEMAFORO[c.auto.saude].ic})`:` — ${manual?'manual':'sugerido'}: ${c.auto.motivo}`}`);
  if(cab&&cab.resumo) L.push(`Situação: ${cab.resumo}`);
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
// ---- 📝 Atualizar um item: modelo de comentário + nova data + status, no token da pessoa (T3) ----
// Estado só do modal aberto (zerado ao abrir outro e ao fechar — fechaModal chama srAoFecharModal).
let _sr=null;
const SR_MARCA='📋 Status report ·';
function srTemplates(){   // LEITOR: cfg.srTemplates se for uma lista válida e não vazia, senão os padrões (nunca cria a chave)
  const l=cfg&&cfg.srTemplates;
  if(Array.isArray(l)){
    const v=l.filter(x=>x&&typeof x==='object'&&x.id&&x.rot&&typeof x.texto==='string'&&SR_TIPOS[x.tipo]);
    if(v.length) return v;
  }
  return SR_TPLS_PADRAO;
}
function srPlaceholders(texto){ const r=[]; String(texto||'').replace(/\{(\w+)\}/g,(m,n)=>{ if(!r.includes(n)) r.push(n); return m; }); return r; }
function srCamposDe(tpl){ return srPlaceholders(tpl&&tpl.texto).map(n=>({ n, ...(SR_CAMPOS[n]||{ rot:n, tipo:'text' }) })); }
function srMarcador(tpl){ return `${SR_MARCA} ${(SR_TIPOS[tpl.tipo]||SR_TIPOS.andamento).ic} ${tpl.rot}`; }
// valores: nome → texto já formatado (data em dd/mm/aaaa, pessoa pelo nome); vazio fica {campo}.
function srMontaComentario(tpl,valores){
  const corpo=String(tpl.texto||'').replace(/\{(\w+)\}/g,(m,n)=>{ const v=String((valores&&valores[n])||'').trim(); return v||m; });
  return `${srMarcador(tpl)}\n\n${corpo}`;
}
const srTextoPronto=(txt)=>!!String(txt||'').trim()&&!/\{\w+\}/.test(String(txt));
function srItem(k){ const d=estado.sr.dados; return (d&&d.itens||[]).find(t=>t.k===k)||null; }
function srValoresTexto(S){
  const v={};
  srCamposDe(S.tpl).forEach(f=>{ const x=S.vals[f.n]||'';
    v[f.n]=f.tipo==='date'?dataBR(x):f.tipo==='pessoa'?(S.pessoas[x]||''):x; });
  return v;
}
function srPessoasDo(c){
  const m={}; (c?c.todos:[]).forEach(t=>{ if(t.respId&&t.resp) m[t.respId]=t.resp; });
  const proj=Object.keys(m);
  const outras={}; Object.entries(pessoasUnidas()).forEach(([a,p])=>{ if(!m[a]&&p&&p.nome) outras[a]=p.nome; });
  return { todas:Object.assign({},outras,m), proj, outras:Object.keys(outras).sort((a,b)=>outras[a].localeCompare(outras[b],'pt')) };
}
function srTplPadraoDe(t,tpls){
  const bug=!!t.bug; const ids=bug?['t-bug-analise']:['t-andamento'];
  return tpls.find(x=>ids.includes(x.id))||tpls.find(x=>(x.tipo==='bug')===bug)||tpls[0];
}
function srCampoHTML(S,f){
  const id=`sr-f-${f.n}`; const v=S.vals[f.n]||'';
  let ctl;
  if(f.tipo==='pessoa'){
    const P=S.pessoasInfo; const op=(a)=>`<option value="${escA(a)}" ${v===a?'selected':''}>${esc(S.pessoas[a])}</option>`;
    ctl=`<select id="${id}"><option value="">— escolha —</option>${P.proj.length?`<optgroup label="Do projeto">${P.proj.map(op).join('')}</optgroup>`:''}${P.outras.length?`<optgroup label="Outras pessoas">${P.outras.map(op).join('')}</optgroup>`:''}</select>`;
  } else ctl=`<input type="${f.tipo==='date'?'date':'text'}" id="${id}" value="${escA(v)}" autocomplete="off">`;
  return `<div class="campo sr-at-campo"><label for="${id}">${esc(f.rot)}</label>${ctl}</div>`;
}
function srPintaCampos(){
  const S=_sr; const w=document.getElementById('sr-campos'); if(!S||!w) return;
  w.innerHTML=srCamposDe(S.tpl).map(f=>srCampoHTML(S,f)).join('')||'<div class="muted small">Este modelo não tem campos: escreva direto no comentário.</div>';
  document.querySelectorAll('#modal-body [data-sr-tpl]').forEach(b=>{ const on=b.getAttribute('data-sr-tpl')===S.tpl.id; b.setAttribute('aria-pressed',on?'true':'false'); b.classList.toggle('on',on); });
}
// Só o que muda ao digitar: a prévia (se a pessoa ainda não escreveu nela), a nova data seguindo {data} e o botão.
function srPintaPreview(){
  const S=_sr; if(!S||S.feito) return;
  const ta=document.getElementById('sr-texto');
  if(ta&&!S.manual) ta.value=srMontaComentario(S.tpl,srValoresTexto(S));
  const vd=document.getElementById('sr-novadata');
  if(vd&&S.tpl.reagendar&&!S.vencMan) vd.value=S.vals.data||'';
  const rf=document.getElementById('sr-refaz'); if(rf) rf.hidden=!S.manual;
  const b=document.getElementById('sr-publica');
  if(b) b.disabled=S.pub||!srTextoPronto(ta?ta.value:'');
}
function srPintaStatus(){
  const S=_sr; const sel=document.getElementById('sr-st'); if(!S||!sel) return;
  if(!S.stMan) S.st=S.tpl.done?(((S.trans||[]).find(x=>x.categoria==='done'&&!/cancel/i.test(x.nome||''))||{}).id||''):'';
  const l=S.trans||[];
  sel.innerHTML=`<option value="">${S.trans===null?'carregando as opções…':'— não mudar —'}</option>${l.map(x=>`<option value="${escA(x.id)}" ${S.st===String(x.id)?'selected':''}>${esc(x.nome)}${x.para&&x.para!==x.nome?` → ${esc(x.para)}`:''}</option>`).join('')}`;
  const h=document.getElementById('sr-st-dica'); if(h) h.textContent=S.transErro?`⚠ ${S.transErro}`:'';
}
function srCarregaTransicoes(S){
  if(S.transB||S.trans) return; const id=idApontar(); if(!id) return; S.transB=true;
  fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listar:true,issue:S.k,email:id.email,token:id.token})})
    .then(r=>r.json()).then(j=>{
      S.transB=false;
      if(j&&j.ok&&Array.isArray(j.transicoes)) S.trans=j.transicoes; else { S.trans=[]; S.transErro=(j&&j.erro)||'não consegui ler as mudanças de status'; }
      if(_sr===S) srPintaStatus();
    }).catch(e=>{ S.transB=false; S.trans=[]; S.transErro=humanizaErro(e); if(_sr===S) srPintaStatus(); });
}
function srAbreAtualizar(k){
  const id=idApontar();
  if(!id){ abreIdentidade('atualizar o status report no Jira',{ depois:()=>srAbreAtualizar(k) }); return; }
  const t=srItem(k); if(!t){ toast('Não achei o item '+k+' na lista — use o ↻.','warn'); return; }
  const c=srCalc(); const tpls=srTemplates();
  const info=srPessoasDo(c);
  const tpl=srTplPadraoDe(t,tpls);
  _srA=null;
  _sr={ k, tpl, vals:{}, manual:false, vencMan:false, st:'', stMan:false, trans:null, transB:false, transErro:'', pub:false, feito:null,
    pessoas:info.todas, pessoasInfo:info };
  const S=_sr; const hoje=(c&&c.hoje)||hojeSP();
  S.hoje=hoje;
  const ams=/ams/i.test((estado.sr.dados&&estado.sr.dados.meta&&estado.sr.dados.meta.categoria)||'');
  const ordem=t.bug?[...tpls.filter(x=>x.tipo==='bug'),...tpls.filter(x=>x.tipo!=='bug')]:[...tpls.filter(x=>x.tipo!=='bug'),...tpls.filter(x=>x.tipo==='bug')];
  const venc=t.venc?`${esc(srDm(t.venc))}`:'sem data';
  abreModal(`<h2>📝 Atualizar status report · ${esc(k)}</h2>
    <div class="sr-at-cab"><b>${esc(t.resumo||'—')}</b><div class="muted small">${t.bug?'🐞 ':''}${esc(t.status||'—')} · vence ${venc} · ${t.resp?esc(t.resp):'sem responsável'}</div></div>
    <div class="campo"><label>Modelo</label><div class="sr-at-chips" role="group" aria-label="Modelos de comentário">${ordem.map(x=>`<button type="button" class="chip sr-chip" data-sr-tpl="${escA(x.id)}" aria-pressed="${x.id===tpl.id}">${esc((SR_TIPOS[x.tipo]||{}).ic||'')} ${esc(x.rot)}</button>`).join('')}</div></div>
    <div id="sr-campos" class="sr-at-campos"></div>
    <div class="campo"><label for="sr-texto">Comentário que vai para o ticket <span class="muted small">— pode editar; a 1ª linha é o marcador que a tela reconhece</span></label>
      <textarea id="sr-texto" class="alx-coment" rows="6"></textarea>
      <button type="button" class="btn sr-refaz" id="sr-refaz" hidden>↺ refazer pelo modelo</button></div>
    <div class="sr-at-opc">
      <div class="campo"><label for="sr-novadata">📅 Nova data <span class="muted small">(opcional)</span></label><input type="date" id="sr-novadata" value=""></div>
      <div class="campo"><label for="sr-st">🔁 Status <span class="muted small">(opcional)</span></label><select id="sr-st"></select><div class="muted small" id="sr-st-dica"></div></div></div>
    ${mnPickerHtml([])}
    ${ams?'<label class="sr-at-int"><input type="checkbox" id="sr-interno" checked> 🔒 nota interna <span class="muted small">— projeto AMS: o cliente não vê o comentário</span></label>':''}
    <div class="alx-fb" id="sr-fb" hidden></div>
    <div class="alx-modal-acoes"><button class="btn primario" id="sr-publica" disabled>Publicar</button><button class="btn" id="gx-fechar">Cancelar</button></div>`);
  srEscolheTpl(S,tpl,true);
  srCarregaTransicoes(S);
}
function srEscolheTpl(S,tpl,primeira){
  S.tpl=tpl;
  if(!primeira) S.manual=false;
  srCamposDe(tpl).forEach(f=>{ if(f.n==='data'&&S.vals.data===undefined&&!tpl.reagendar) S.vals.data=S.hoje; });
  srPintaCampos(); srPintaStatus(); srPintaPreview();
}
function srAoFecharModal(){ _sr=null; _srT=null; _srX=null; _srA=null; }
function srProximo(k){
  const c=srCalc(); if(!c) return null;
  const ordem=[...c.g.vencidos,...c.g.semana,...c.g.proxima,...c.g.bugs];
  const i=ordem.findIndex(t=>t.k===k);
  const livre=(t)=>t.k!==k&&!(t.sr&&t.sr.dia===c.hoje);
  return ordem.slice(i+1).find(livre)||ordem.find(livre)||null;
}
function srAplicaLocal(k,patch){
  const t=srItem(k); if(!t) return;
  Object.assign(t,patch);
  if(patch.sr) t.ult={ por:patch.sr.por, porId:patch.sr.porId, dia:patch.sr.dia, quando:patch.sr.quando, texto:patch.sr.texto };
}
async function srPublica(){
  const S=_sr; if(!S||S.pub||S.feito||!S.tpl) return;
  const id=idApontar();
  if(!id){ abreIdentidade('atualizar o status report no Jira',{ depois:()=>srAbreAtualizar(S.k) }); return; }
  const k=S.k; const t=srItem(k)||{ k };
  const ta=document.getElementById('sr-texto'); let txt=String((ta&&ta.value)||'').trim();
  if(!srTextoPronto(txt)) return;
  if(!txt.startsWith(SR_MARCA)) txt=`${srMarcador(S.tpl)}\n\n${txt}`;
  const vEl=document.getElementById('sr-novadata'); const vv=vEl?vEl.value:'';
  const novaData=(/^\d{4}-\d{2}-\d{2}$/.test(vv)&&vv!==(t.venc||''))?vv:'';
  const stEl=document.getElementById('sr-st'); const stId=stEl?stEl.value:'';
  const stNome=stId&&stEl.selectedOptions[0]?stEl.selectedOptions[0].textContent:'';
  const itEl=document.getElementById('sr-interno'); const interno=!!(itEl&&itEl.checked);
  const menc=mnPickerIds();
  const btn=document.getElementById('sr-publica'); const fb=document.getElementById('sr-fb');
  const aberto=()=>_sr===S;
  const diz=(msg,cls)=>{ const f=document.getElementById('sr-fb'); if(aberto()&&f){ f.hidden=false; f.className='alx-fb ap-fb'+(cls?' '+cls:''); f.textContent=msg; } };
  S.pub=true; if(btn) ocupado(btn,true); diz('Publicando o comentário…','');
  const post=(b)=>fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...b,issue:k,email:id.email,token:id.token})}).then(r=>r.json()).catch(e=>({ ok:false, erro:humanizaErro(e) }));
  // (a) o comentário: falhou, PARA (nada de data/status sem o status report).
  const j1=await post({ comentar:true, texto:txt, ...(menc.length?{mencionar:menc}:{}), ...(interno?{interno:true}:{}) });
  if(!j1||!j1.ok){
    S.pub=false; const msg=(j1&&j1.erro)||'Não consegui publicar o comentário.';
    if(aberto()){ if(btn) ocupado(btn,false); srPintaPreview(); diz(msg,'erro'); } else toast(`Status report de ${k}: ${msg}`,'warn');
    return;
  }
  const res={ interno:!!(interno||j1.interno), data:null, st:null };
  // (b) nova data, (c) status: cada falha é dita, sem desfazer o comentário.
  if(novaData){ diz('Comentário publicado. Mudando a data…','');
    const j2=await post({ reagendar:true, duedate:novaData }); res.data=(j2&&j2.ok)?{ ok:true, v:novaData }:{ ok:false, erro:(j2&&j2.erro)||'recusada' }; }
  if(stId){ diz('Mudando o status…','');
    const j3=await post({ transitionId:stId }); res.st=(j3&&j3.ok)?{ ok:true, nome:stNome }:{ ok:false, erro:(j3&&j3.erro)||'recusado' }; }
  // auditoria: uma linha por ação, UMA gravação da config
  const corpo=txt.split('\n').slice(2).join(' ').trim();
  logAcao({ acao:'status-report', t:k, para:S.tpl.rot, motivo:corpo.slice(0,80), ok:true },false);
  if(res.data&&res.data.ok) logAcao({ acao:'reprogramar', t:k, de:t.venc||'—', para:novaData, motivo:'📋 status report', ok:true },false);
  if(res.st&&res.st.ok){ const trL=(S.trans||[]).find(x=>String(x.id)===String(stId)); logAcao({ acao:'status', t:k, de:t.status||'—', para:(trL&&trL.para)||stNome, motivo:'📋 status report', ok:true },false); }
  salvaCfg();
  // otimista: a linha (e o grupo) já refletem; a próxima leitura real vai sem o cache do servidor
  const prox=srProximo(k);
  const agora=new Date().toISOString(); const hoje=S.hoje;
  const patch={ sr:{ rot:txt.split('\n')[0].slice(SR_MARCA.length).trim(), por:id.nome||id.email, porId:id.accountId||'', dia:hoje, quando:`${hoje} ${agora.slice(11,16)}`, texto:txt.split('\n').slice(2).join('\n').trim() } };
  if(res.data&&res.data.ok) patch.venc=novaData;
  if(res.st&&res.st.ok){ const tr=(S.trans||[]).find(x=>String(x.id)===String(stId)); patch.status=(tr&&tr.para)||stNome; patch.statCat=(tr&&tr.categoria)||t.statCat; }
  srAplicaLocal(k,patch);
  estado.sr.sujo=true;
  if(estado.gp) estado.gp.cache={};
  invalidaCacheDados();
  if(estado.vista==='statusrep') renderSr();
  S.pub=false; S.feito=res;
  const linhas=[`<li class="ok">✓ Comentário publicado${res.interno?' como 🔒 nota interna':''}.</li>`];
  if(res.data) linhas.push(res.data.ok?`<li class="ok">✓ Nova data: ${esc(dataBR(res.data.v))}.</li>`:`<li class="erro">⚠ Comentário publicado, mas a data não mudou: ${esc(res.data.erro)}</li>`);
  if(res.st) linhas.push(res.st.ok?`<li class="ok">✓ Status: ${esc(res.st.nome)}.</li>`:`<li class="erro">⚠ Comentário publicado, mas o status não mudou: ${esc(res.st.erro)}</li>`);
  if(aberto()){
    abreModal(`<h2>✓ Publicado em ${esc(k)}</h2><ul class="sr-at-res">${linhas.join('')}</ul>
      <div class="alx-modal-acoes">${prox?`<button class="btn primario" data-sr-prox="${escA(prox.k)}">⏭ Próximo item (${esc(prox.k)})</button>`:''}<button class="btn" id="gx-fechar">Fechar</button></div>`);
  } else toast(`Status report publicado em ${k}.`,'ok');
}
// ---- ✅ Concluir · 👤 Transferir · ⋯ (status, apontar, comentar, reagendar): ações por item, no token da pessoa ----
// Um modal só (srAcaoAbre/srAcaoExecuta) para os 5 modos; estado só do modal aberto em _srA (zerado em srAoFecharModal).
// Ordem no Jira: concluir/status/reagendar = comentário e depois a mudança; transferir = troca de responsável e depois o comentário.
let _srA=null;
const SR_AC={
  concluir:{ ic:'✅', tit:'Concluir', bt:'Concluir', motivo:'concluir o ticket no Jira' },
  status:{ ic:'🔁', tit:'Mudar status', bt:'Mudar status', motivo:'mudar o status do ticket no Jira' },
  transferir:{ ic:'👤', tit:'Transferir', bt:'Transferir', motivo:'transferir o ticket no Jira' },
  comentar:{ ic:'💬', tit:'Comentar', bt:'Comentar', motivo:'comentar no ticket do Jira' },
  reagendar:{ ic:'📅', tit:'Reagendar', bt:'Reagendar', motivo:'reagendar o ticket no Jira' } };
// Tira os {campos} que ficaram no texto do modelo e arruma os espaços (o modelo do concluir tem {detalhe}).
function srSemCampos(txt){
  return String(txt||'').replace(/\{\w+\}/g,'').replace(/[ \t]{2,}/g,' ').replace(/[ \t]+$/gm,'').replace(/\n{3,}/g,'\n\n').trim();
}
function srMaisDia(iso,n){ const [y,m,d]=String(iso).split('-').map(Number); return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10); }
function srTextoConcluir(hoje){
  const tpl=srTemplates().find(t=>t.tipo==='concluido')||SR_TPLS_PADRAO[0];
  return { tpl, texto:srSemCampos(srMontaComentario(tpl,{ data:dataBR(hoje) })) };
}
function srTextoTransfer(S){
  if(S.pessoa===null) return '';
  if(S.pessoa==='') return 'Ticket sem responsável por ora (atribuição removida pelo 📋 status report).';
  return `Transferido para ${S.pessoas[S.pessoa]||'—'} pelo 📋 status report.`;
}
function srAcPessoasOpts(S){
  const ok=(a)=>S.pessoas[a]&&!RE_EXCLUIR.test(S.pessoas[a]);
  const op=(a)=>`<option value="${escA(a)}" ${S.pessoa===a?'selected':''}>${esc(S.pessoas[a])}</option>`;
  const pr=S.proj.filter(ok).sort((a,b)=>S.pessoas[a].localeCompare(S.pessoas[b],'pt'));
  const ou=S.outras.filter(ok);
  return `<option value="__nada__" ${S.pessoa===null?'selected':''}>— escolha —</option><option value="__sem__" ${S.pessoa===''?'selected':''}>— sem responsável —</option>`
    +(pr.length?`<optgroup label="Do projeto">${pr.map(op).join('')}</optgroup>`:'')
    +(ou.length?`<optgroup label="Outras pessoas">${ou.map(op).join('')}</optgroup>`:'');
}
function srAcCorpo(S,id,ams){
  const m=S.modo;
  const coment=(rot,obrig)=>`<div class="campo"><label for="sr-ac-texto">${rot} <span class="muted small">${obrig?'— obrigatório':'— opcional'}</span></label><textarea id="sr-ac-texto" class="alx-coment" rows="${m==='concluir'?5:4}"></textarea></div>`;
  let h='';
  if(m==='concluir') h=`<div class="campo"><label for="sr-ac-st">🔁 Transição de conclusão</label><select id="sr-ac-st"></select><div class="muted small" id="sr-ac-st-dica"></div></div>`
    +coment('Comentário que vai para o ticket <span class="muted small">(editável; apague tudo para só concluir)</span>',false);
  else if(m==='status') h=`<div class="campo"><label for="sr-ac-st">🔁 Novo status</label><select id="sr-ac-st"></select><div class="muted small" id="sr-ac-st-dica"></div></div>`+coment('Comentário',false);
  else if(m==='transferir') h=`<div class="campo"><label for="sr-ac-pessoa">👤 Para quem</label><select id="sr-ac-pessoa">${srAcPessoasOpts(S)}</select>
      <div class="sr-ac-chips">${id.accountId?`<button type="button" class="chip sr-chip" data-sr-ac-eu="1">para mim</button>`:''}<button type="button" class="chip sr-chip" data-sr-ac-sem="1">sem responsável</button></div></div>`
    +coment('Comentário',false)+mnPickerHtml([]);
  else if(m==='comentar') h=coment('Comentário',true)+mnPickerHtml([]);
  else h=`<div class="sr-at-opc"><div class="campo"><label for="sr-ac-data">📅 Nova data</label><input type="date" id="sr-ac-data" value="${escA(S.t.venc||S.hoje)}"></div>
      <div class="campo"><label>Atalhos</label><div class="sr-ac-chips"><button type="button" class="chip sr-chip" data-sr-ac-dia="hoje">hoje</button><button type="button" class="chip sr-chip" data-sr-ac-dia="amanha">amanhã</button><button type="button" class="chip sr-chip" data-sr-ac-dia="seg">próxima segunda</button><button type="button" class="chip sr-chip" data-sr-ac-dia="rm" aria-pressed="false">remover data</button></div></div></div>`
    +coment('Comentário',false);
  const int=ams?'<label class="sr-at-int"><input type="checkbox" id="sr-ac-int" checked> 🔒 nota interna <span class="muted small">— projeto AMS: o cliente não vê o comentário</span></label>':'';
  return h+int;
}
function srAcaoAbre(k,modo){
  const cfgM=SR_AC[modo]; if(!cfgM) return;
  const id=idApontar();
  if(!id){ abreIdentidade(cfgM.motivo,{ depois:()=>{ if(estado.vista==='statusrep') srAcaoAbre(k,modo); } }); return; }
  const t=srItem(k); if(!t){ toast('Não achei o item '+k+' na lista — use o ↻.','warn'); return; }
  srMaisFecha();
  const c=srCalc(); const info=srPessoasDo(c); const hoje=(c&&c.hoje)||hojeSP();
  const pessoas=Object.assign({},info.todas); let outras=info.outras.slice();
  if(id.accountId&&!pessoas[id.accountId]){ pessoas[id.accountId]=id.nome||id.email; outras.push(id.accountId); }
  _sr=null;
  _srA={ k, modo, t, hoje, trans:null, transB:false, transErro:'', sel:'', selMan:false, pessoa:null, pessoas, proj:info.proj.slice(), outras,
    manual:false, mencMan:false, semData:false, pub:false, feito:null, tpl:null };
  const S=_srA;
  const ams=/ams/i.test((estado.sr.dados&&estado.sr.dados.meta&&estado.sr.dados.meta.categoria)||'');
  const venc=t.venc?esc(srDm(t.venc)):'sem data';
  abreModal(`<h2>${cfgM.ic} ${esc(cfgM.tit)} · ${esc(k)}</h2>
    <div class="sr-at-cab"><b>${esc(t.resumo||'—')}</b><div class="muted small">${t.bug?'🐞 ':''}${esc(t.status||'—')} · vence ${venc} · ${t.resp?esc(t.resp):'sem responsável'}</div></div>
    <div class="sr-ac-corpo">${srAcCorpo(S,id,ams)}</div>
    <div class="alx-fb" id="sr-fb" hidden></div>
    <div class="alx-modal-acoes"><button class="btn primario" id="sr-ac-ok" ${(modo==='concluir'||modo==='status')?'disabled':''}>${esc(cfgM.bt)}</button><button class="btn" id="gx-fechar">Cancelar</button></div>`);
  const ta=document.getElementById('sr-ac-texto');
  if(modo==='concluir'){ const x=srTextoConcluir(hoje); S.tpl=x.tpl; if(ta) ta.value=x.texto; S.manual=true; }
  if(modo==='concluir'||modo==='status'){ srAcaoPintaSt(); srAcaoCarregaTrans(S); }
  const foco=document.getElementById(modo==='comentar'?'sr-ac-texto':modo==='transferir'?'sr-ac-pessoa':modo==='reagendar'?'sr-ac-data':'sr-ac-st');
  if(foco) foco.focus();
}
function srAcaoCarregaTrans(S){
  const id=idApontar(); if(!id||S.transB) return; S.transB=true;
  fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({listar:true,issue:S.k,email:id.email,token:id.token})})
    .then(r=>r.json()).then(j=>{
      S.transB=false;
      if(j&&j.ok&&Array.isArray(j.transicoes)) S.trans=j.transicoes; else { S.trans=[]; S.transErro=(j&&j.erro)||'não consegui ler as mudanças de status'; }
      if(_srA===S) srAcaoPintaSt();
    }).catch(e=>{ S.transB=false; S.trans=[]; S.transErro=humanizaErro(e); if(_srA===S) srAcaoPintaSt(); });
}
const srEhCancel=(x)=>/cancel/i.test((x.nome||'')+' '+(x.para||''));
function srAcaoPintaSt(){
  const S=_srA; const sel=document.getElementById('sr-ac-st'); if(!S||!sel) return;
  const l=S.trans||[]; let ops=l; let dica='';
  if(S.modo==='concluir'){
    const dn=l.filter(x=>x.categoria==='done'&&!srEhCancel(x));
    if(dn.length) ops=dn; else if(l.length) dica='Nenhuma transição de conclusão disponível — escolha uma das opções.';
    if(!S.selMan){ const pref=dn.find(x=>/particip|realiz|feito|conclu|done/i.test((x.nome||'')+' '+(x.para||'')))||dn[0]; S.sel=pref?String(pref.id):''; }
  }
  if(S.transErro) dica=`⚠ ${S.transErro}`;
  else if(S.trans&&!l.length) dica='Nenhuma transição disponível para você neste ticket.';
  const ph=S.trans===null?'<option value="">carregando as opções…</option>':((S.modo==='concluir'&&S.sel)?'':'<option value="">— escolha —</option>');
  sel.innerHTML=ph+ops.map(x=>`<option value="${escA(x.id)}" ${S.sel===String(x.id)?'selected':''}>${esc(x.nome)}${x.para&&x.para!==x.nome?` → ${esc(x.para)}`:''}</option>`).join('');
  const d=document.getElementById('sr-ac-st-dica');
  if(d){ d.textContent=dica; if(S.trans&&!l.length) d.insertAdjacentHTML('beforeend',' <button type="button" class="gp-mini" data-sr-ac-retrans="1" data-tip="Ler de novo as transições do ticket">↻ tentar de novo</button>'); }
  const ok=document.getElementById('sr-ac-ok'); if(ok&&!S.pub) ok.disabled=S.trans===null||!l.length;   // sem opção para escolher, o botão não promete nada
}
function srAcaoPessoa(v){
  const S=_srA; if(!S) return;
  S.pessoa=(v==='__nada__')?null:(v==='__sem__'?'':v);
  const sel=document.getElementById('sr-ac-pessoa'); if(sel) sel.value=S.pessoa===null?'__nada__':(S.pessoa===''?'__sem__':S.pessoa);
  const ta=document.getElementById('sr-ac-texto'); if(ta&&!S.manual) ta.value=srTextoTransfer(S);
  if(!S.mencMan&&typeof _mnPick!=='undefined'&&_mnPick){
    _mnPick.clear(); if(S.pessoa) _mnPick.set(S.pessoa,S.pessoas[S.pessoa]||S.pessoa);
    if(typeof mnPickerRefresh==='function') mnPickerRefresh();
  }
}
function srAcaoData(v){
  const S=_srA; if(!S) return;
  const inp=document.getElementById('sr-ac-data');
  if(v==='rm'){ S.semData=!S.semData; if(inp){ inp.disabled=S.semData; } }
  else { S.semData=false; if(inp){ inp.disabled=false; inp.value=v==='hoje'?S.hoje:v==='amanha'?srMaisDia(S.hoje,1):proximaSegunda(); } }
  document.querySelectorAll('#modal-body [data-sr-ac-dia="rm"]').forEach(b=>{ b.setAttribute('aria-pressed',S.semData?'true':'false'); b.classList.toggle('on',S.semData); });
}
function srRemoveLocal(k){
  const d=estado.sr.dados; if(!d||!Array.isArray(d.itens)) return;
  const i=d.itens.findIndex(t=>t.k===k); if(i>=0) d.itens.splice(i,1);
}
async function srAcaoExecuta(){
  const S=_srA; if(!S||S.pub||S.feito) return;
  const modo=S.modo; const cm=SR_AC[modo];
  const id=idApontar();
  if(!id){ abreIdentidade(cm.motivo,{ depois:()=>{ if(estado.vista==='statusrep') srAcaoAbre(S.k,modo); } }); return; }
  const k=S.k; const t=srItem(k)||S.t||{ k };
  const aberto=()=>_srA===S;
  const diz=(msg,cls)=>{ const f=document.getElementById('sr-fb'); if(aberto()&&f){ f.hidden=false; f.className='alx-fb ap-fb'+(cls?' '+cls:''); f.textContent=msg; } };
  const ta=document.getElementById('sr-ac-texto'); let txt=String((ta&&ta.value)||'').trim();
  const itEl=document.getElementById('sr-ac-int'); const interno=!!(itEl&&itEl.checked);
  const stEl=document.getElementById('sr-ac-st'); const stId=stEl?stEl.value:'';
  const stNome=stId&&stEl.selectedOptions[0]?stEl.selectedOptions[0].textContent:'';
  const tr=stId?(S.trans||[]).find(x=>String(x.id)===String(stId)):null;
  let novaData=''; let respNome='';
  if(modo==='concluir'||modo==='status'){
    if(S.trans===null){ diz('Aguarde: ainda lendo as opções de status do ticket.','erro'); return; }
    if(!stId){ diz(modo==='concluir'?'Escolha a transição que conclui o ticket.':'Escolha o novo status.','erro'); return; }
  } else if(modo==='transferir'){
    if(S.pessoa===null){ diz('Escolha para quem transferir o ticket.','erro'); return; }
    if((S.pessoa||'')===(t.respId||'')){ diz(S.pessoa?'Este ticket já é de '+(S.pessoas[S.pessoa]||'essa pessoa')+'.':'Este ticket já está sem responsável.','erro'); return; }
    respNome=S.pessoa?(S.pessoas[S.pessoa]||''):'';
  } else if(modo==='comentar'){
    if(!txt){ diz('Escreva o comentário.','erro'); return; }
  } else if(modo==='reagendar'){
    const dv=(document.getElementById('sr-ac-data')||{}).value||'';
    if(!S.semData){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(dv)){ diz('Escolha a nova data ou use “remover data”.','erro'); return; }
      if(dv===(t.venc||'')){ diz('Essa já é a data do ticket.','erro'); return; }
      novaData=dv;
    } else if(!t.venc){ diz('O ticket já está sem data.','erro'); return; }
  }
  let marcado=false;
  if(txt&&modo==='concluir'){ if(!txt.startsWith(SR_MARCA)) txt=`${srMarcador(S.tpl||srTextoConcluir(S.hoje).tpl)}\n\n${txt}`; marcado=true; }
  const menc=(modo==='transferir'||modo==='comentar')?mnPickerIds():[];
  const btn=document.getElementById('sr-ac-ok');
  S.pub=true; if(btn) ocupado(btn,true);
  const post=(b)=>fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...b,issue:k,email:id.email,token:id.token})}).then(r=>r.json()).catch(e=>({ ok:false, erro:humanizaErro(e) }));
  const pComent=txt?{ id:'coment', msg:'Publicando o comentário…', body:{ comentar:true, texto:txt, ...(menc.length?{mencionar:menc}:{}), ...(interno?{interno:true}:{}) } }:null;
  let pMain=null;
  if(modo==='concluir'||modo==='status') pMain={ id:'main', msg:modo==='concluir'?'Concluindo o ticket…':'Mudando o status…', body:{ transitionId:stId } };
  else if(modo==='transferir') pMain={ id:'main', msg:'Transferindo o ticket…', body:{ atribuir:true, accountId:S.pessoa||'' } };
  else if(modo==='reagendar') pMain={ id:'main', msg:'Mudando a data…', body:{ reagendar:true, duedate:S.semData?null:novaData } };
  const ordem=(modo==='transferir'?[pMain,pComent]:[pComent,pMain]).filter(Boolean);
  const out={};
  for(const p of ordem){
    diz(p.msg,'');
    const j=await post(p.body);
    out[p.id]=(j&&j.ok)?{ ok:true, j }:{ ok:false, erro:(j&&j.erro)||(p.id==='coment'?'Não consegui publicar o comentário.':`Não consegui ${cm.tit.toLowerCase()} o ticket.`) };
    if(!out[p.id].ok) break;
  }
  const primeiro=ordem[0];
  if(!out[primeiro.id].ok){
    S.pub=false; const msg=out[primeiro.id].erro;
    if(aberto()){ if(btn) ocupado(btn,false); diz(msg,'erro'); } else toast(`${cm.tit} ${k}: ${msg}`,'warn');
    return;
  }
  const feitoC=!!(out.coment&&out.coment.ok); const feitoM=!!(out.main&&out.main.ok);
  const corpo=txt.split('\n').slice(marcado?2:0).join(' ').trim();
  if(feitoC){
    if(marcado) logAcao({ acao:'status-report', t:k, para:(S.tpl||srTextoConcluir(S.hoje).tpl).rot, motivo:corpo.slice(0,80), ok:true },false);
    else logAcao({ acao:'comentario', t:k, para:corpo.slice(0,60), motivo:'📋 status report', ok:true },false);
  }
  if(feitoM){
    if(modo==='concluir'||modo==='status') logAcao({ acao:'status', t:k, de:t.status||'—', para:(tr&&tr.para)||stNome, motivo:'📋 status report', ok:true },false);
    else if(modo==='transferir') logAcao({ acao:'transferir-resp', t:k, de:t.resp||'—', para:respNome||'sem responsável', motivo:'📋 status report', ok:true },false);
    else if(modo==='reagendar') logAcao({ acao:'reprogramar', t:k, de:t.venc||'—', para:novaData||'sem data', motivo:'📋 status report', ok:true },false);
  }
  salvaCfg();
  const prox=srProximo(k);
  const id2=id; const agora=new Date().toISOString();
  const patch={};
  if(feitoC){
    const ult={ por:id2.nome||id2.email, porId:id2.accountId||'', dia:S.hoje, quando:`${S.hoje} ${agora.slice(11,16)}`, texto:(marcado?txt.split('\n').slice(2).join('\n'):txt).trim() };
    if(marcado) patch.sr={ rot:txt.split('\n')[0].slice(SR_MARCA.length).trim(), ...ult }; else patch.ult=ult;
  }
  let sai=false; let motivoSai='';
  if(feitoM){
    if(modo==='concluir'||modo==='status'){
      if(tr&&tr.categoria==='done') sai=true;
      else { patch.status=(tr&&tr.para)||stNome; patch.statCat=(tr&&tr.categoria)||t.statCat; }
    } else if(modo==='transferir'){ patch.resp=respNome; patch.respId=S.pessoa||''; }
    else if(modo==='reagendar'){
      patch.venc=novaData||'';
      const c0=srCalc(); const ate=(c0&&c0.ate)||'9999-12-31';
      if(!t.bug&&(!novaData||novaData>ate)){ sai=true; motivoSai=novaData?'a nova data passa do horizonte do relatório':'sem data e sem ser bug, o item não entra no relatório'; }
    }
  }
  const pk=String(k).split('-')[0];
  if(estado.sr.chave===pk){ srAplicaLocal(k,patch); if(sai) srRemoveLocal(k); }
  else if(estado.sr.cache&&estado.sr.cache[pk]) delete estado.sr.cache[pk];   // a pessoa trocou de projeto com o pedido em voo: o cache dele não pode servir a lista velha
  estado.sr.sujo=true;
  if(estado.gp) estado.gp.cache={};
  invalidaCacheDados();
  if(estado.vista==='statusrep') renderSr();
  if(typeof renderAbas==='function') try{ renderAbas(); }catch(e){}   // 🔢 contador da aba (vencidos) acompanha a remoção otimista
  S.pub=false; S.feito=out;
  const linhas=[];
  const intern=feitoC&&(interno||(out.coment.j&&out.coment.j.interno))?' como 🔒 nota interna':'';
  const ctxt=feitoC?`Comentário publicado${intern}.`:'';
  if(modo==='comentar') linhas.push(`<li class="ok">✓ ${esc(ctxt)}</li>`);
  else {
    if(modo==='transferir'){
      linhas.push(`<li class="ok">✓ Responsável: ${esc(respNome||'sem responsável')}.</li>`);
      if(feitoC) linhas.push(`<li class="ok">✓ ${esc(ctxt)}</li>`);
      else if(out.coment) linhas.push(`<li class="erro">⚠ O ticket foi transferido, mas o comentário não saiu: ${esc(out.coment.erro)}</li>`);
    } else {
      if(feitoC) linhas.push(`<li class="ok">✓ ${esc(ctxt)}</li>`);
      if(feitoM){
        if(modo==='reagendar') linhas.push(`<li class="ok">✓ ${novaData?`Nova data: ${esc(dataBR(novaData))}`:'Data removida'}.</li>`);
        else linhas.push(`<li class="ok">✓ ${sai?'Ticket concluído':'Status'}: ${esc((tr&&tr.para)||stNome)}.</li>`);
      } else if(out.main) {
        const oque=modo==='concluir'?'o ticket não foi concluído':modo==='reagendar'?'a data não mudou':'o status não mudou';
        linhas.push(`<li class="erro">⚠ Comentário publicado, mas ${oque}: ${esc(out.main.erro)}</li>`);
      }
    }
  }
  if(sai) linhas.push(`<li class="muted">O item sai da lista${motivoSai?` (${esc(motivoSai)})`:''}; a próxima leitura do Jira confirma.</li>`);
  if(aberto()){
    abreModal(`<h2>✓ ${esc(cm.tit)} · ${esc(k)}</h2><ul class="sr-at-res">${linhas.join('')}</ul>
      <div class="alx-modal-acoes">${prox?`<button class="btn primario" data-sr-prox="${escA(prox.k)}">⏭ Próximo item (${esc(prox.k)})</button>`:''}<button class="btn" id="gx-fechar">Fechar</button></div>`);
  } else toast(`${cm.tit} ${k}: feito.`,'ok');
}
// ---- ⋯ menu de mais ações (um aberto por vez; Esc, clique fora ou escolher fecham) ----
function srMaisFecha(){
  estado.sr.mais='';
  document.querySelectorAll('.sr-mais').forEach(m=>m.remove());
  document.querySelectorAll('[data-sr-mais][aria-expanded="true"]').forEach(b=>b.setAttribute('aria-expanded','false'));
}
function srMaisAbre(btn){
  const k=btn.getAttribute('data-sr-mais'); const era=estado.sr.mais===k;
  srMaisFecha(); if(era) return;
  estado.sr.mais=k; btn.setAttribute('aria-expanded','true');
  const K=escA(k);
  const it=(a,txt)=>`<button type="button" role="menuitem" data-sr-acao="${a}" data-sr-k="${K}">${txt}</button>`;
  btn.insertAdjacentHTML('afterend',`<div class="sr-mais" role="menu" aria-label="Mais ações de ${K}">${it('status','🔁 Mudar status')}${it('apontar','⏱ Apontar horas')}${it('comentar','💬 Comentar')}${it('reagendar','📅 Reagendar')}</div>`);
  const p=btn.nextElementSibling&&btn.nextElementSibling.querySelector('button'); if(p) p.focus();
}
function srMaisEscolhe(a,k){
  srMaisFecha();
  if(a==='apontar'){
    if(!idApontar()){ abreIdentidade('apontar horas no ticket',{ depois:()=>{ if(estado.vista==='statusrep') abreModalApontarGx(k); } }); return; }
    abreModalApontarGx(k); return;
  }
  srAcaoAbre(k,a);
}
// ---- ⚙️ Modelos: editor dos modelos de comentário (gestor/admin) — grava cfg.srTemplates (T4) ----
let _srT=null;   // estado só do modal ⚙️ aberto: { lista, edit (id aberto), fb, conf (confirmar voltar aos padrões) }
const srPodeEditarTpl=()=>!!idApontar()&&(souAprovador()||temPapel('gestor')||temPapel('admin'));
const srCopiaTpls=(l)=>JSON.parse(JSON.stringify(l));
function srTplPintaLista(){
  const T=_srT; const w=document.getElementById('srt-lista'); if(!T||!w) return;
  w.innerHTML=T.lista.map((x,i)=>{
    const tp=SR_TIPOS[x.tipo]||SR_TIPOS.andamento;
    if(T.edit!==x.id) return `<div class="srt-item" data-srt-id="${escA(x.id)}"><div class="srt-res"><span class="srt-rot">${tp.ic} ${esc(x.rot||'(sem rótulo)')}</span>
      <span class="muted small">${esc(tp.rot)}${x.reagendar?' · 📅 pede nova data':''}${x.done?' · ✅ sugere concluir':''}</span>
      <div class="muted small srt-tx">${esc(x.texto||'')}</div></div>
      <div class="srt-bt"><button type="button" class="gp-mini" data-srt-edit="${escA(x.id)}" aria-label="Editar o modelo ${escA(x.rot||'')}" data-tip="Editar">✏️</button><button type="button" class="gp-mini" data-srt-del="${escA(x.id)}" aria-label="Remover o modelo ${escA(x.rot||'')}" data-tip="Remover">🗑</button></div></div>`;
    return `<div class="srt-item srt-ed" data-srt-id="${escA(x.id)}">
      <div class="campo"><label for="srt-tipo">Tipo <span class="muted small">(fixo: é o semáforo do item)</span></label><select id="srt-tipo">${Object.keys(SR_TIPOS).map(k=>`<option value="${k}" ${x.tipo===k?'selected':''}>${SR_TIPOS[k].ic} ${esc(SR_TIPOS[k].rot)}</option>`).join('')}</select></div>
      <div class="campo"><label for="srt-rot">Rótulo <span class="muted small">(1 a 60)</span></label><input type="text" id="srt-rot" maxlength="60" value="${escA(x.rot)}" autocomplete="off"></div>
      <div class="campo"><label for="srt-texto">Texto <span class="muted small">(1 a 500; use {campo} para o que a pessoa preenche: proximo, data, prazo, quem, motivo, detalhe, impacto — ou outro nome)</span></label><textarea id="srt-texto" rows="3" maxlength="500">${esc(x.texto)}</textarea></div>
      <div class="srt-ck"><label><input type="checkbox" id="srt-reag" ${x.reagendar?'checked':''}> 📅 pedir nova data (copia {data} para o vencimento)</label>
        <label><input type="checkbox" id="srt-done" ${x.done?'checked':''}> ✅ sugerir concluir o ticket</label></div>
      <div class="srt-bt"><button type="button" class="btn" data-srt-ok="1">Pronto</button></div></div>`; }).join('')||'<div class="sr-vazio">Nenhum modelo — adicione um ou use ↺ voltar aos padrões.</div>';
  const fb=document.getElementById('srt-fb'); if(fb){ fb.hidden=!T.fb; fb.textContent=T.fb||''; fb.className='alx-fb ap-fb'+(T.fb?' erro':''); }
  const pd=document.getElementById('srt-padroes'); if(pd) pd.textContent=T.conf?'Confirmar: voltar aos 8 padrões?':'↺ voltar aos padrões';
}
function srAbreTemplates(){
  if(!srPodeEditarTpl()){ toast('Só gestores editam os modelos.','warn'); return; }
  _srT={ lista:srCopiaTpls(srTemplates()), edit:'', fb:'', conf:false };
  abreModal(`<h2>⚙️ Modelos de comentário do status report</h2>
    <div class="muted small">Valem para todo o time, na hora de 📝 Atualizar. O <b>tipo</b> é fixo; rótulo e texto são seus. Cada <code>{campo}</code> do texto vira um campo no formulário.</div>
    <div id="srt-lista" class="srt-lista"></div>
    <div class="srt-add"><button type="button" class="btn" data-srt-add="1">➕ Novo modelo</button> <button type="button" class="btn" id="srt-padroes" data-srt-padroes="1">↺ voltar aos padrões</button></div>
    <div class="alx-fb" id="srt-fb" hidden></div>
    <div class="alx-modal-acoes"><button class="btn primario" id="srt-salva">💾 Salvar</button><button class="btn" id="gx-fechar">Cancelar</button></div>`);
  srTplPintaLista();
}
function srTplValida(l){
  for(const x of l){
    const rot=String(x.rot||'').trim(); const tx=String(x.texto||'').trim();
    if(!SR_TIPOS[x.tipo]) return { id:x.id, erro:'Escolha o tipo do modelo.' };
    if(rot.length<1||rot.length>60) return { id:x.id, erro:'O rótulo precisa ter de 1 a 60 caracteres.' };
    if(tx.length<1||tx.length>500) return { id:x.id, erro:`O texto de “${rot}” precisa ter de 1 a 500 caracteres.` };
  }
  return null;
}
function srTplSalva(){
  const T=_srT; if(!T) return;
  if(!srPodeEditarTpl()){ T.fb='Só gestores editam os modelos.'; srTplPintaLista(); return; }
  if(!T.lista.length){ T.fb='Mantenha ao menos um modelo — ou use ↺ voltar aos padrões.'; srTplPintaLista(); return; }
  const bad=srTplValida(T.lista);
  if(bad){ T.fb=bad.erro; T.edit=bad.id; srTplPintaLista(); return; }
  cfg.srTemplates=T.lista.map(x=>{ const o={ id:String(x.id), tipo:x.tipo, rot:String(x.rot).trim(), texto:String(x.texto).trim() }; if(x.reagendar) o.reagendar=true; if(x.done) o.done=true; return o; });
  logAcao({ acao:'sr-modelos', para:`${cfg.srTemplates.length} modelo(s)`, ok:true },false);
  salvaCfg();
  toast('✓ modelos salvos — valem para todo o time','ok');
  fechaModal();
}
function srTplPadroes(){
  const T=_srT; if(!T) return;
  if(!T.conf){ T.conf=true; srTplPintaLista(); return; }
  delete cfg.srTemplates;
  logAcao({ acao:'sr-modelos', para:'padrões', ok:true },false);
  salvaCfg();
  T.lista=srCopiaTpls(SR_TPLS_PADRAO); T.edit=''; T.fb=''; T.conf=false;
  srTplPintaLista(); toast('↺ os 8 modelos padrão voltaram','ok');
}
// ---- 🧩 Tipos no relatório: modal (lista padrão × lista própria do projeto) ----
let _srX=null;   // estado só do modal 🧩 aberto: { proj, modo:'padrao'|'proj', lista (nomes que saem), fb, orig (para saber se mudou) }
const srPodeExcl=()=>!!idApontar()&&(!SR_EXCL_SO_GESTORES||srPodeEditarTpl());
const srExclPadraoAtual=()=>srExcl('').tipos;   // a lista padrão em vigor (gravada ou a fixa)
// Candidatos do modal: os tipos abertos no projeto (meta.tipos, com a contagem) + os da lista em edição + os do padrão fixo,
// um por grupo de sinônimos (Épico/Epic numa linha só, com o nome que o projeto usa).
function srTiposCandidatos(X){
  const d=estado.sr.dados; const mt=(d&&d.meta&&d.meta.tipos&&typeof d.meta.tipos==='object'&&estado.sr.chave===X.proj)?d.meta.tipos:{};
  const m=new Map();
  Object.entries(mt).forEach(([nome,n])=>{ const k=srCanonTipo(nome); if(!k) return; const a=m.get(k); if(a){ a.n=(a.n||0)+(Number(n)||0); } else m.set(k,{ k, nome, n:Number(n)||0 }); });
  [...X.lista,...SR_EXCL_PADRAO].forEach(nome=>{ const k=srCanonTipo(nome); if(k&&!m.has(k)) m.set(k,{ k, nome, n:null }); });
  return [...m.values()].sort((a,b)=>((b.n||0)-(a.n||0))||a.nome.localeCompare(b.nome,'pt'));
}
const srXMarcado=(X,k)=>X.lista.some(n=>srCanonTipo(n)===k);
function srXPinta(){
  const X=_srX; const w=document.getElementById('srx-lista'); if(!X||!w) return;
  w.innerHTML=srTiposCandidatos(X).map(c=>`<label class="srx-tipo"><input type="checkbox" data-srx-tipo="${escA(c.k)}" data-srx-nome="${escA(c.nome)}" ${srXMarcado(X,c.k)?'checked':''}> <span class="srx-nome">${esc(c.nome)}</span> <span class="muted small">${c.n==null?'nenhum aberto agora':`${c.n} aberto${c.n>1?'s':''}`}</span></label>`).join('');
  const x=(typeof cfg!=='undefined'&&cfg&&cfg.srTiposExcluir&&cfg.srTiposExcluir.proj&&typeof cfg.srTiposExcluir.proj==='object')?cfg.srTiposExcluir.proj:{};
  const outros=Object.keys(x).filter(k=>k!==X.proj&&x[k]&&x[k].proprio===true).sort();
  const av=document.getElementById('srx-aviso');
  if(av) av.innerHTML=X.modo==='padrao'
    ?`⚠ Você está mudando a <b>lista padrão</b>: vale para todos os projetos sem lista própria${outros.length?` (têm lista própria: ${outros.map(esc).join(', ')})`:''}.`
    :`Só o <b>${esc(X.proj)}</b> usa esta lista. Para voltar ao padrão, escolha "Usar a lista padrão".`;
  const orig=document.getElementById('srx-orig'); if(orig) orig.hidden=X.modo!=='padrao';
  document.querySelectorAll('input[name="srx-modo"]').forEach(r=>{ r.checked=r.value===X.modo; });
  const fb=document.getElementById('srx-fb'); if(fb){ fb.hidden=!X.fb; fb.textContent=X.fb||''; fb.className='alx-fb ap-fb'+(X.fb?' erro':''); }
}
function srAbreTipos(){
  const proj=srProjAtual(); if(!proj) return;
  const e=srExcl(proj); const modo=e.fonte==='proj'?'proj':'padrao';
  _srX={ proj, modo, lista:e.tipos.slice(), fb:'', origProj:e.fonte==='proj'?e.tipos.slice():null, origPadrao:srExclPadraoAtual().slice() };
  const quem=e.por?`<div class="muted small">Última mudança${e.fonte==='proj'?' desta lista':' do padrão'}: ${esc(e.por)}${e.em?` em ${esc(srQuando(e.em))}`:''}.</div>`:'';
  abreModal(`<h2>🧩 Tipos de item no status report</h2>
    <div class="muted small">Os tipos <b>marcados</b> não entram no relatório de <b>${esc(projNomeCod(proj))}</b>: somem dos blocos, dos números, do semáforo sugerido e do texto copiado. Vale para todo o time.</div>${quem}
    <div class="srx-modo" role="radiogroup" aria-label="Qual lista vale para este projeto">
      <label><input type="radio" name="srx-modo" value="padrao"> Usar a lista padrão <span class="muted small">— a mesma de todos os projetos sem lista própria</span></label>
      <label><input type="radio" name="srx-modo" value="proj"> Lista própria deste projeto</label></div>
    <div class="muted small srx-aviso" id="srx-aviso" role="status"></div>
    <div class="srx-lista" id="srx-lista" role="group" aria-label="Tipos que não entram no relatório"></div>
    <div class="srx-add"><input type="text" id="srx-novo" maxlength="40" placeholder="outro tipo (ex.: Subtarefa)" aria-label="Nome de outro tipo para tirar do relatório" autocomplete="off"><button type="button" class="btn" data-srx-add="1">＋ Adicionar</button><button type="button" class="btn" id="srx-orig" data-srx-orig="1" data-tip="Volta a lista padrão para Épico, História e Reunião">↺ Épico, História e Reunião</button></div>
    <div class="alx-fb" id="srx-fb" hidden></div>
    <div class="alx-modal-acoes"><button class="btn primario" id="srx-salva">💾 Salvar</button><button class="btn" id="gx-fechar">Cancelar</button></div>`);
  srXPinta();
}
function srXModo(modo){
  const X=_srX; if(!X||modo===X.modo) return;
  X.modo=modo; X.fb='';
  // Lista própria nasce da que estava valendo (a dele, se já tinha; senão o padrão); voltar ao padrão mostra o padrão.
  X.lista=modo==='proj'?(X.origProj||srExclPadraoAtual()).slice():srExclPadraoAtual().slice();
  srXPinta();
}
function srXAdiciona(){
  const X=_srX; const inp=document.getElementById('srx-novo'); if(!X||!inp) return;
  const nome=String(inp.value||'').trim().slice(0,40); if(!nome){ inp.focus(); return; }
  const k=srCanonTipo(nome);
  if(!srXMarcado(X,k)){ if(X.lista.length>=SR_EXCL_MAX){ X.fb=`Máximo de ${SR_EXCL_MAX} tipos.`; srXPinta(); return; } X.lista.push(nome); }
  X.fb=''; inp.value=''; srXPinta(); inp.focus();
}
const srMesmaLista=(a,b)=>{ const A=[...new Set(a.map(srCanonTipo))].sort().join('|'); const B=[...new Set(b.map(srCanonTipo))].sort().join('|'); return A===B; };
function srTiposSalva(){
  const X=_srX; if(!X) return;
  if(!idApontar()){ abreIdentidade('mudar os tipos do status report',{ depois:()=>{ if(estado.vista==='statusrep') srAbreTipos(); } }); return; }
  if(!srPodeExcl()){ X.fb='Só gestores mudam os tipos do relatório.'; srXPinta(); return; }
  const id=idApontar()||{}; const por=String(id.nome||id.email||'').slice(0,80); const em=new Date().toISOString();
  const tipos=srTiposLimpa(X.lista);
  const x=(cfg.srTiposExcluir&&typeof cfg.srTiposExcluir==='object')?cfg.srTiposExcluir:(cfg.srTiposExcluir={});
  if(!x.proj||typeof x.proj!=='object') x.proj={};
  const ant=x.proj[X.proj]; const tinhaProprio=!!(ant&&typeof ant==='object'&&ant.proprio===true);
  let msg='';
  if(X.modo==='proj'){
    x.proj[X.proj]={ proprio:true, tipos, por, em };
    msg=`${X.proj}: lista própria — ${tipos.length?tipos.join(', '):'nenhum tipo excluído'}`;
  } else {
    const mudouPadrao=!srMesmaLista(tipos,X.origPadrao)||!(x.padrao&&Array.isArray(x.padrao.tipos));
    if(mudouPadrao) x.padrao={ tipos, por, em };
    if(tinhaProprio) x.proj[X.proj]={ proprio:false, por, em };
    if(!mudouPadrao&&!tinhaProprio){ fechaModal(); return; }   // nada mudou: nada a gravar
    msg=mudouPadrao?`padrão — ${tipos.length?tipos.join(', '):'nenhum tipo excluído'}${tinhaProprio?` (e ${X.proj} voltou ao padrão)`:''}`:`${X.proj} voltou à lista padrão`;
  }
  logAcao({ acao:'sr-tipos', t:X.proj, para:msg, ok:true },false);
  salvaCfg();
  toast('✓ tipos do relatório salvos — valem para todo o time','ok');
  fechaModal();
  if(estado.vista==='statusrep') renderSr();   // a tela já filtra; a releitura (lista nova na chave) vem do render
}
// ---- Listeners delegados desta tela ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='statusrep') return;
  const cl=(q)=>e.target.closest&&e.target.closest(q); const s=estado.sr;
  const ce=cl('[data-sr-cab-edit]'); if(ce){ srCabAbre(); return; }
  const pa=cl('[data-sr-prox-add]'); if(pa){ const r=srCabRascunho(); if(!r) return;
    if(r.proximos.length>=SR_MAX_PROX){ const d=document.getElementById('sr-prox-dica'); if(d) d.textContent=`Máximo de ${SR_MAX_PROX} passos.`; toast(`Máximo de ${SR_MAX_PROX} próximos passos.`,'warn'); return; }
    r.proximos.push({ t:'', quando:'', quem:'' }); renderSr();
    const ls=document.querySelectorAll('#sr-cab-form .sr-p-t'); if(ls.length) ls[ls.length-1].focus(); return; }
  const pr=cl('[data-sr-prox-rm]'); if(pr){ const r=srCabRascunho(); if(!r) return; r.proximos.splice(Number(pr.getAttribute('data-sr-prox-rm')),1); renderSr(); return; }
  const tp=cl('[data-sr-tpls]'); if(tp){ srAbreTemplates(); return; }
  const tx=cl('[data-sr-tipos]'); if(tx){ srAbreTipos(); return; }
  if(cl('[data-sr-achar]')){ const i=document.getElementById('sr-achar'); srAchar(i?i.value:''); return; }
  if(cl('[data-sr-achar-fecha]')){ s.achar=null; s.acharRele=''; renderSr(); return; }
  const al=cl('[data-sr-achar-limpa]'); if(al){ if(al.getAttribute('data-sr-achar-limpa')==='resp') s.resp=''; else s.soSem=false; const q=s.achar&&s.achar.k; renderSr(); if(q) srAchar(q); return; }
  const ap=cl('[data-sr-achar-proj]'); if(ap){ const q=s.achar&&s.achar.k; srProjSet(ap.getAttribute('data-sr-achar-proj')); s.cab=null; s.cabProj=''; s.edit=false; s.rasc=null; s.cabConf=null; s.histAberto=false; if(q){ const pj=srProjAtual(); s.achar={ q, k:q, tom:'info', html:`🔎 Abrindo o status report de ${esc(projNomeCod(pj))} para procurar <b>${esc(q)}</b>…` };   // srProjSet zerou a busca: ela volta, para a continuação reconhecê-la
      srCarrega(false);   // com o projeto no cache da tela, a lista volta AGORA (sem fetch, sem continuação): procura já
      if(s.dados&&s.chave===pj){ renderSr(); srAchar(q); } else { s.acharRele=q; renderSr(); } } else renderSr(); return; }
  const at=cl('[data-sr-at]'); if(at){ srAbreAtualizar(at.getAttribute('data-sr-at')); return; }
  const fm=cl('[data-sr-fim]'); if(fm){ srAcaoAbre(fm.getAttribute('data-sr-fim'),'concluir'); return; }
  const rs=cl('[data-sr-resp]'); if(rs){ srAcaoAbre(rs.getAttribute('data-sr-resp'),'transferir'); return; }
  const mb=cl('[data-sr-mais]'); if(mb){ srMaisAbre(mb); return; }
  const ma=cl('[data-sr-acao]'); if(ma){ srMaisEscolhe(ma.getAttribute('data-sr-acao'),ma.getAttribute('data-sr-k')); return; }
  const ir=cl('[data-sr-ir]'); if(ir){ const b=document.getElementById('sr-'+ir.getAttribute('data-sr-ir')); if(b) b.scrollIntoView({behavior:'smooth',block:'start'}); return; }
  const so=cl('[data-sr-so-sem]'); if(so){ s.soSem=!s.soSem; renderSr(); return; }
  const cp=cl('[data-sr-copiar]'); if(cp){ const c=srCalc(); if(c) gpCopia(srTextoRelatorio(c),'📋 Relatório copiado — cole na ata, no Teams ou no e-mail.'); return; }
  const lk=cl('[data-sr-link]'); if(lk){ const p=srProjAtual(); if(p) gpCopia(srLinkTela(p),'🔗 Link copiado — todo mundo abre a mesma visão.'); return; }
  const gp=cl('[data-sr-gp]'); if(gp){ const p=srProjAtual(); if(p&&estado.gp){ estado.gp.proj=p; estado.gp.meus=false; estado.gp.resp=''; } vaiPara('gp'); return; }
  const b=e.target.closest&&e.target.closest('button'); if(!b) return;
  if(b.id==='sr-cab-salva'){ if(!b.disabled) srCabSalva(); }
  else if(b.id==='sr-cab-cancela'){ srCabFecha(); }
  else if(b.id==='sr-refresh'){ if(b.disabled) return; s.cabProj=''; srCarrega(true); renderSr(); }   // o render seguinte mostra "buscando…" até a resposta
  else if(b.id==='sr-retry'){ s.erro=''; s.cabProj=''; srCarrega(true); renderSr(); }
});
// Formulário da situação: cada digitação só atualiza o rascunho (nunca redesenha — o Chrome dispara `change` com o foco já fora).
['input','change'].forEach(ev=>document.getElementById('conteudo').addEventListener(ev,(e)=>{
  if(estado.vista!=='statusrep'||!estado.sr.edit) return;
  if(e.target&&e.target.closest&&e.target.closest('#sr-cab-form')) srCabRascunho();
}));
document.getElementById('conteudo').addEventListener('toggle',(e)=>{
  const d=e.target; if(d&&d.matches&&d.matches('[data-sr-hist]')) estado.sr.histAberto=!!d.open;
},true);
// 🔎 Enter no campo "Achar ticket" busca (o Esc limpa só o campo, sem fechar nada).
document.getElementById('conteudo').addEventListener('keydown',(e)=>{
  if(estado.vista!=='statusrep'||!e.target||e.target.id!=='sr-achar') return;
  if(e.key==='Enter'){ e.preventDefault(); srAchar(e.target.value); }
  else if(e.key==='Escape'&&e.target.value){ e.preventDefault(); e.stopPropagation(); e.target.value=''; }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='statusrep') return;
  const t=e.target; const s=estado.sr; if(!t||!t.id) return;
  if(t.id==='sr-proj'){ srProjSet(t.value); s.erro=''; s.cab=null; s.cabProj=''; s.edit=false; s.rasc=null; s.cabConf=null; s.cabFb=''; s.histAberto=false; renderSr(); }
  else if(t.id==='sr-resp'){ s.resp=t.value; renderSr(); }
  else if(t.id==='sr-so-sem'){ s.soSem=!!t.checked; renderSr(); }
});

// ---- Listeners do modal 📝 Atualizar (delegados em #modal-body; só agem com o modal do status report aberto) ----
document.getElementById('modal-body').addEventListener('click',(e)=>{
  if(!_sr) return;
  const cl=(q)=>e.target.closest&&e.target.closest(q);
  const ch=cl('[data-sr-tpl]');
  if(ch){ const tpl=srTemplates().find(x=>x.id===ch.getAttribute('data-sr-tpl')); if(tpl&&!_sr.feito&&!_sr.pub) srEscolheTpl(_sr,tpl,false); return; }
  const pr=cl('[data-sr-prox]'); if(pr){ srAbreAtualizar(pr.getAttribute('data-sr-prox')); return; }
  const b=e.target.closest&&e.target.closest('button'); if(!b) return;
  if(b.id==='sr-publica'){ if(!b.disabled) srPublica(); }
  else if(b.id==='sr-refaz'){ _sr.manual=false; srPintaPreview(); }
});
document.getElementById('modal-body').addEventListener('input',(e)=>{
  const S=_sr; const t=e.target; if(!S||S.feito||!t||!t.id) return;
  if(t.id==='sr-texto'){ S.manual=true; srPintaPreview(); }
  else if(t.id.startsWith('sr-f-')){ S.vals[t.id.slice(5)]=t.value; srPintaPreview(); }
});
document.getElementById('modal-body').addEventListener('change',(e)=>{
  const S=_sr; const t=e.target; if(!S||S.feito||!t||!t.id) return;
  if(t.id.startsWith('sr-f-')){ S.vals[t.id.slice(5)]=t.value; srPintaPreview(); }
  else if(t.id==='sr-novadata'){ S.vencMan=true; }
  else if(t.id==='sr-st'){ S.stMan=true; S.st=t.value; }
});

// ---- Listeners do modal ⚙️ Modelos (só agem com ele aberto) ----
document.getElementById('modal-body').addEventListener('click',(e)=>{
  const T=_srT; if(!T) return;
  const cl=(q)=>e.target.closest&&e.target.closest(q);
  const ed=cl('[data-srt-edit]'); if(ed){ T.edit=ed.getAttribute('data-srt-edit'); T.fb=''; srTplPintaLista(); const r=document.getElementById('srt-rot'); if(r) r.focus(); return; }
  const dl=cl('[data-srt-del]'); if(dl){ const id=dl.getAttribute('data-srt-del'); T.lista=T.lista.filter(x=>x.id!==id); if(T.edit===id) T.edit=''; T.fb=''; srTplPintaLista(); return; }
  if(cl('[data-srt-ok]')){ T.edit=''; srTplPintaLista(); return; }
  if(cl('[data-srt-add]')){ const id='t-'+Math.random().toString(36).slice(2,8); T.lista.push({ id, tipo:'andamento', rot:'', texto:'' }); T.edit=id; T.fb=''; T.conf=false; srTplPintaLista(); const r=document.getElementById('srt-rot'); if(r) r.focus(); return; }
  if(cl('[data-srt-padroes]')){ srTplPadroes(); return; }
  if(cl('#srt-salva')){ srTplSalva(); }
});
['input','change'].forEach(ev=>document.getElementById('modal-body').addEventListener(ev,(e)=>{
  const T=_srT; const t=e.target; if(!T||!t||!t.id||!t.id.startsWith('srt-')) return;
  const x=T.lista.find(y=>y.id===T.edit); if(!x) return;
  if(t.id==='srt-tipo') x.tipo=t.value; else if(t.id==='srt-rot') x.rot=t.value; else if(t.id==='srt-texto') x.texto=t.value;
  else if(t.id==='srt-reag'){ if(t.checked) x.reagendar=true; else delete x.reagendar; }
  else if(t.id==='srt-done'){ if(t.checked) x.done=true; else delete x.done; }
}));

// ---- Listeners do modal 🧩 Tipos no relatório (só agem com ele aberto) ----
document.getElementById('modal-body').addEventListener('click',(e)=>{
  const X=_srX; if(!X) return;
  const cl=(q)=>e.target.closest&&e.target.closest(q);
  if(cl('[data-srx-add]')){ srXAdiciona(); return; }
  if(cl('[data-srx-orig]')){ X.lista=SR_EXCL_PADRAO.slice(); X.fb=''; srXPinta(); return; }
  if(cl('#srx-salva')){ srTiposSalva(); }
});
document.getElementById('modal-body').addEventListener('change',(e)=>{
  const X=_srX; const t=e.target; if(!X||!t) return;
  if(t.name==='srx-modo'){ srXModo(t.value); return; }
  if(t.matches&&t.matches('[data-srx-tipo]')){
    const k=t.getAttribute('data-srx-tipo');
    if(t.checked){ if(!srXMarcado(X,k)) X.lista.push(t.getAttribute('data-srx-nome')||k); }
    else X.lista=X.lista.filter(n=>srCanonTipo(n)!==k);
    X.fb='';
  }
});
document.getElementById('modal-body').addEventListener('keydown',(e)=>{
  if(!_srX||!e.target||e.target.id!=='srx-novo'||e.key!=='Enter') return;
  e.preventDefault(); srXAdiciona();
});

// ---- Listeners do menu ⋯ (Esc e clique fora fecham; setas andam pelos itens) ----
document.addEventListener('keydown',(e)=>{
  if(!estado.sr||!estado.sr.mais) return;
  const menu=document.querySelector('.sr-mais'); if(!menu) return;
  if(e.key==='Escape'){ const b=document.querySelector('[data-sr-mais][aria-expanded="true"]'); srMaisFecha(); if(b) b.focus(); return; }
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    if(!menu.contains(document.activeElement)) return;   // foco fora do menu (ex.: Tab para um select): as setas são dele
    const its=[...menu.querySelectorAll('[role="menuitem"]')]; if(!its.length) return;
    const i=its.indexOf(document.activeElement); e.preventDefault();
    its[(i+(e.key==='ArrowDown'?1:-1)+its.length)%its.length].focus();
  }
});
document.addEventListener('focusin',(e)=>{
  if(!estado.sr||!estado.sr.mais) return;
  if(e.target&&e.target.closest&&e.target.closest('.sr-mais,[data-sr-mais]')) return;
  srMaisFecha();   // Tab para fora da coluna de ação fecha o ⋯ (senão ficava aberto e preso)
});
document.addEventListener('click',(e)=>{
  if(!estado.sr||!estado.sr.mais) return;
  if(e.target.closest&&e.target.closest('.sr-mais,[data-sr-mais]')) return;
  srMaisFecha();
});

// ---- Listeners do modal das ações ✅ 👤 ⋯ (só agem com ele aberto) ----
document.getElementById('modal-body').addEventListener('click',(e)=>{
  const S=_srA; if(!S) return;
  const cl=(q)=>e.target.closest&&e.target.closest(q);
  if(cl('[data-mn-chip-del]')){ S.mencMan=true; return; }
  const pr=cl('[data-sr-prox]'); if(pr){ srAbreAtualizar(pr.getAttribute('data-sr-prox')); return; }
  if(S.feito||S.pub) return;
  if(cl('[data-sr-ac-eu]')){ const id=idApontar(); if(id&&id.accountId) srAcaoPessoa(id.accountId); return; }
  if(cl('[data-sr-ac-sem]')){ srAcaoPessoa('__sem__'); return; }
  const dia=cl('[data-sr-ac-dia]'); if(dia){ srAcaoData(dia.getAttribute('data-sr-ac-dia')); return; }
  if(cl('[data-sr-ac-retrans]')){ S.trans=null; S.transB=false; S.transErro=''; srAcaoPintaSt(); srAcaoCarregaTrans(S); return; }
  const b=cl('button'); if(b&&b.id==='sr-ac-ok'&&!b.disabled) srAcaoExecuta();
});
document.getElementById('modal-body').addEventListener('input',(e)=>{
  const S=_srA; const t=e.target; if(!S||S.feito||!t||!t.id) return;
  if(t.id==='sr-ac-texto') S.manual=true;
});
document.getElementById('modal-body').addEventListener('change',(e)=>{
  const S=_srA; const t=e.target; if(!S||S.feito||!t||!t.id) return;
  if(t.id==='sr-ac-pessoa') srAcaoPessoa(t.value);
  else if(t.id==='sr-ac-st'){ S.selMan=true; S.sel=t.value; }
  else if(t.id==='sr-ac-data'){ S.semData=false; document.querySelectorAll('#modal-body [data-sr-ac-dia="rm"]').forEach(b=>{ b.setAttribute('aria-pressed','false'); b.classList.remove('on'); }); }
  else if(t.id==='mn-add-pessoa') S.mencMan=true;
});
