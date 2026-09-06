// Jira Insights · 19 · 💬 MENÇÕES (responder com anexos), 📥 INBOX (pendências da pessoa) e 📈 ANALYTICS de governança.
// ===============================================================================

// ============================ 💬 MENÇÕES (responder marcações) ============================
// Chamados em que EU fui marcado (@) em comentários — com resposta dali mesmo,
// mencionando a pessoa de volta (o Jira notifica). Fonte: ?mencoes=1 no /api/vencimentos.
// ---- 🔕 Ignorar menções: some das listas/selos "para mim" ----
// Por PESSOA, salvo na config compartilhada (vale em qualquer navegador). A chave é
// ticket + horário do comentário; entradas com mais de 90 dias são limpas sozinhas
// (a menção já saiu da janela de busca há muito tempo).
function mnChave(x){ return x.k+'|'+(x.quando||''); }
function mnIgnoradasSet(){
  const id=idApontar(); if(!id||!id.accountId) return new Set();
  return new Set(Object.keys((cfg.mencoesIgnoradas||{})[id.accountId]||{}));
}
function mnIgnora(chave, desfaz){
  const id=idApontar(); if(!id||!id.accountId) return;
  cfg.mencoesIgnoradas=cfg.mencoesIgnoradas||{};
  const m=cfg.mencoesIgnoradas[id.accountId]=cfg.mencoesIgnoradas[id.accountId]||{};
  if(desfaz) delete m[chave]; else m[chave]=hojeSP();
  const corte=voltaDias(hojeSP(),90);
  Object.entries(m).forEach(([k,d])=>{ if(String(d)<corte) delete m[k]; });
  salvaCfg(); pintaBadgeInbox();
}
function carregaMencoes(forca){
  const mn=estado.mencoes; const id=idApontar();
  if(!id||!id.accountId) return;
  mn.carregando=true; mn.erro='';
  fetch(`/api/vencimentos?mencoes=1&accountId=${encodeURIComponent(id.accountId)}&dias=${mn.dias}${forca?'&nocache=1':''}`)
    .then(r=>r.json()).then(j=>{ mn.carregando=false;
      if(j.erro) mn.erro=j.erro; else { mn.dados=j; estado.inbox.mencoes=j; pintaBadgeInbox(); }
      if(estado.vista==='mencoes') renderMencoes();
    }).catch(e=>{ mn.carregando=false; mn.erro=String(e.message||e); if(estado.vista==='mencoes') renderMencoes(); });
}
function renderMencoes(){
  const cont=document.getElementById('conteudo');
  const mn=estado.mencoes; const id=idApontar();
  if(!id||!id.accountId){
    cont.replaceChildren(el(`<div><div class="card full"><h2>💬 Menções <span>chamados em que você foi marcado</span></h2>
      <div class="estado">Identifique-se (e-mail + token do Jira) para encontrarmos as SUAS menções.<br>
        <button class="btn primario" data-ap-act="config-id" style="margin-top:10px">Identificar-se</button></div></div></div>`));
    return;
  }
  if(!mn.dados && !mn.carregando && !mn.erro) carregaMencoes(false);
  if(mn.erro){ cont.replaceChildren(el(`<div class="erro"><strong>Falha ao buscar as menções.</strong> ${esc(mn.erro)}
    <button class="btn" id="mn-retry" style="margin-left:10px">Tentar de novo</button></div>`)); return; }
  if(!mn.dados){ cont.replaceChildren(el(`<div class="estado">💬 Procurando onde te marcaram (últimos ${mn.dias} dias)…</div>`)); return; }

  const d=mn.dados; const todas=d.mencoes||[];
  const ign=mnIgnoradasSet();
  const nIgn=todas.filter(x=>ign.has(mnChave(x))).length;
  let lista=todas.slice();
  if(!mn.verIgn) lista=lista.filter(x=>!ign.has(mnChave(x)));
  if(mn.soPend) lista=lista.filter(x=>!x.respondido);
  if(mn.busca){ const q=mn.busca.toLowerCase();
    lista=lista.filter(x=>(x.k+' '+x.resumo+' '+x.por+' '+x.texto).toLowerCase().includes(q)); }
  const pend=todas.filter(x=>!x.respondido && !ign.has(mnChave(x))).length;

  const kpis=`<div class="kpis ts-kpis">
    <div class="kpi ${pend?'w':'a'}"><div class="v">${pend}</div><div class="l">⏳ Aguardando sua resposta</div></div>
    <div class="kpi a"><div class="v">${todas.filter(x=>x.respondido&&!ign.has(mnChave(x))).length}</div><div class="l">✓ Já respondidas</div></div>
    <div class="kpi a"><div class="v">${nIgn}</div><div class="l">🔕 Ignoradas</div></div>
    <div class="kpi t"><div class="v">${todas.length}</div><div class="l">∑ Menções no período</div></div>
  </div>`;
  const filtros=`<div class="ap-filtros">
    <div class="campo"><label>Período</label><select id="mn-dias">${[7,14,30,60].map(v=>`<option value="${v}" ${mn.dias===v?'selected':''}>últimos ${v} dias</option>`).join('')}</select></div>
    <div class="campo"><label>Buscar</label><input type="search" id="mn-busca" placeholder="código, resumo, pessoa, texto…" value="${escA(mn.busca)}"></div>
    <div class="campo" style="display:flex;align-items:end"><label style="display:flex;gap:6px;align-items:center;font-size:12.5px;margin:0;color:var(--grafite);text-transform:none;letter-spacing:0"><input type="checkbox" id="mn-sopend" ${mn.soPend?'checked':''}> só as que aguardam resposta</label></div>
    <div class="campo" style="display:flex;align-items:end"><label style="display:flex;gap:6px;align-items:center;font-size:12.5px;margin:0;color:var(--grafite);text-transform:none;letter-spacing:0"><input type="checkbox" id="mn-verign" ${mn.verIgn?'checked':''}> mostrar ignoradas (${nIgn})</label></div>
    <div class="campo"><label>&nbsp;</label><button class="btn" id="mn-refresh">↻ Atualizar</button></div>
  </div>`;

  const rows=lista.map(x=>{
    const link=`${jiraBase()}/browse/${encodeURIComponent(x.k)}`;
    const ch=mnChave(x); const ehIgn=ign.has(ch);
    return `<div class="mn-card ${ehIgn?'ign':(x.respondido?'ok':'pend')}">
      <div class="mn-top">
        <a href="${link}" target="_blank" rel="noopener"><strong>${esc(x.k)}</strong> ↗</a>
        <span class="mn-res" title="${escA(x.resumo)}">${esc(x.resumo||'—')}</span>
        <span class="spacer"></span>
        <span class="badge" data-tip="${escA(x.p)}">${esc(projNome(x.p))}</span><span class="badge">${esc(x.status)}</span>
        ${ehIgn?'<span class="mn-badge">🔕 ignorada</span>':(x.respondido?'<span class="mn-badge ok">✓ você respondeu</span>':'<span class="mn-badge pend">⏳ aguardando sua resposta</span>')}
      </div>
      <div class="mn-quote"><strong>${esc(x.por)}</strong> te marcou ${x.dia?`em ${esc(alxDataBR(x.dia))}`:''}: <span class="muted">“${esc(x.texto||'')}”</span></div>
      <div class="mn-acts">
        <button class="btn primario" data-mn-resp="${escA(x.k)}">💬 Responder</button>
        <button class="btn" data-gx-det="${escA(x.k)}">🔍 detalhes</button>
        <button class="btn" data-gx-apont="${escA(x.k)}">⏱ apontar</button>
        ${ehIgn?`<button class="btn" data-mn-desig="${escA(ch)}">↩ Não ignorar</button>`
               :`<button class="btn" data-mn-ign="${escA(ch)}" data-tip="Some das SUAS listas e selos (não afeta o Jira nem as outras pessoas). Reverta em 'mostrar ignoradas'.">🔕 Ignorar</button>`}
      </div>
    </div>`; }).join('');

  cont.replaceChildren(el(`<div>
    <div class="card full">
      <h2>💬 Menções <span>onde <strong>${esc(id.nome||id.email)}</strong> foi marcado em comentários — responda sem abrir o Jira</span></h2>
      ${kpis}
      ${filtros}
      ${lista.length?`<div class="mn-list">${rows}</div>`
        :`<div class="alx-vazio">${todas.length?'Nada com esses filtros.':'✓ Nenhuma menção no período — caixa limpa!'}</div>`}
    </div></div>`));
}
// ---- Seletor de pessoas para marcar (@) em comentários — chips + "adicionar" ----
// Compartilhado pelo Responder (Menções) e pelo Comentar (Gestão/ficha).
let _mnPick=null;   // Map accountId -> nome
function mnPickerHtml(pre){
  _mnPick=new Map();
  (pre||[]).forEach(p=>{ if(p&&p.id) _mnPick.set(p.id, p.nome||p.id); });
  return `<div class="campo" style="margin-top:8px"><label>Marcar pessoas (@) <span class="muted small">— o Jira notifica cada uma</span></label>
    <div id="mn-picker">${mnPickerInner()}</div></div>`;
}
function mnPickerInner(){
  const todos=pessoasUnidas();
  const opts=Object.entries(todos)
    .filter(([id,p])=>!_mnPick.has(id)&&p&&p.nome)
    .sort((a,b)=>(a[1].nome||'').localeCompare(b[1].nome||'','pt'))
    .map(([id,p])=>`<option value="${escA(id)}">${esc(p.nome)}</option>`).join('');
  const chips=[..._mnPick.entries()].map(([id,nome])=>
    `<span class="mn-chip">@${esc(nome)} <button type="button" data-mn-chip-del="${escA(id)}" title="Remover">×</button></span>`).join('');
  return `<div class="mn-chips">${chips||'<span class="muted small">ninguém marcado</span>'}</div>
    <select id="mn-add-pessoa" style="margin-top:6px"><option value="">+ adicionar pessoa…</option>${opts}</select>`;
}
function mnPickerRefresh(){ const w=document.getElementById('mn-picker'); if(w) w.innerHTML=mnPickerInner(); }
function mnPickerIds(){ return _mnPick?[..._mnPick.keys()]:[]; }
// ---- Anexos para comentários (Responder/Comentar): arquivos + colar print ----
let _mnFiles=[];
function mnAnexosHtml(){
  _mnFiles=[];
  return `<div class="campo" style="margin-top:8px"><label>Anexos <span class="muted small">(até 3 arquivos de 3 MB — ou cole um print com Ctrl+V)</span></label>
    <input type="file" id="mn-anexos" multiple accept="image/*,.pdf,.txt,.log,.csv,.xlsx,.docx,.msg,.eml">
    <div id="mn-anexos-lista" class="mn-chips" style="margin-top:6px"><span class="muted small">nenhum anexo</span></div></div>`;
}
function mnAnexosRefresh(){
  const w=document.getElementById('mn-anexos-lista'); if(!w) return;
  w.innerHTML=_mnFiles.map((f,i)=>`<span class="mn-chip">📎 ${esc(f.name)} <span class="muted small">${Math.max(1,Math.round(f.size/1024))} KB</span> <button type="button" data-mn-anexo-del="${i}" title="Remover">×</button></span>`).join('')
    ||'<span class="muted small">nenhum anexo</span>';
}
function mnAnexosAdd(files){
  for(const f of (files||[])){
    if(_mnFiles.length>=3){ toast('Máximo de 3 anexos por comentário.','warn'); break; }
    if(f.size>3*1024*1024){ toast(`"${f.name}" passa de 3 MB — anexe direto no Jira.`,'warn'); continue; }
    _mnFiles.push(f);
  }
  mnAnexosRefresh();
}
function mnLeBase64(f){ return new Promise((res,rej)=>{ const r=new FileReader();
  r.onload=()=>res(String(r.result||'')); r.onerror=()=>rej(new Error('falha ao ler o arquivo')); r.readAsDataURL(f); }); }
// Sobe os anexos escolhidos para o ticket k (token da pessoa). Devolve {oks,falhas}.
async function mnEnviaAnexos(k, id, fb){
  const oks=[]; const falhas=[];
  for(const f of _mnFiles){
    if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent=`Anexando ${f.name} em ${k}…`; }
    try{
      const b64=await mnLeBase64(f);
      const j=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({anexar:true,issue:k,nome:f.name,tipo:f.type||'application/octet-stream',base64:b64,email:id.email,token:id.token})}).then(r=>r.json());
      if(j.ok) oks.push(j.nome||f.name); else falhas.push(`${f.name}: ${j.erro||'falhou'}`);
    }catch(e){ falhas.push(`${f.name}: ${e.message||e}`); }
  }
  return { oks, falhas };
}
let _mnResp=null;
function abreResponderMencao(k){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const x=(((estado.mencoes.dados||{}).mencoes)||[]).find(m=>m.k===k); if(!x) return;
  _mnResp={ k, porId:x.porId||'' };
  abreModal(`
    <h2>💬 Responder · ${esc(k)}</h2>
    <div class="rv-met"><span class="k">${esc(k)}</span> — ${esc(x.resumo||'')}
      <div class="mn-quote" style="margin-top:6px"><strong>${esc(x.por)}</strong>: <span class="muted">“${esc(x.texto||'')}”</span></div></div>
    <div class="campo" style="margin-top:10px"><label>Sua resposta <span class="req">*</span></label>
      <textarea class="alx-coment" id="mn-texto" placeholder="Escreva a resposta — será publicada como comentário no seu usuário…"></textarea></div>
    ${mnPickerHtml(x.porId?[{id:x.porId,nome:x.por}]:[])}
    ${mnAnexosHtml()}
    <div class="ap-fb" id="mn-fb" hidden></div>
    <div class="alx-modal-acoes">
      <button class="btn primario" id="mn-enviar">Publicar resposta</button>
      <button class="btn" id="mn-cancelar">Cancelar</button></div>`);
  setTimeout(()=>{ const t=document.getElementById('mn-texto'); if(t) t.focus(); },50);
}
async function enviaRespostaMencao(){
  const ctx=_mnResp; const id=idApontar(); if(!ctx||!id) return;
  const texto=((document.getElementById('mn-texto')||{}).value||'').trim();
  const fb=document.getElementById('mn-fb');
  if(!texto){ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent='Escreva a resposta.'; } return; }
  const marcados=mnPickerIds();
  const bt=document.getElementById('mn-enviar'); if(bt) bt.disabled=true;
  // Anexos primeiro: os que subirem são citados no texto do comentário.
  let textoFinal=texto;
  if(_mnFiles.length){
    const ax=await mnEnviaAnexos(ctx.k, id, fb);
    if(ax.falhas.length&&!ax.oks.length){
      if(fb){ fb.className='ap-fb err'; fb.innerHTML='Falha nos anexos:<br>'+ax.falhas.map(esc).join('<br>'); }
      if(bt) bt.disabled=false; return;
    }
    if(ax.falhas.length) toast('⚠ Alguns anexos falharam: '+ax.falhas.join(' · '),'warn');
    if(ax.oks.length) textoFinal=`${texto}\n\n📎 Anexos: ${ax.oks.join(', ')}`;
  }
  if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Publicando a resposta…'; }
  try{
    const j=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({comentar:true,issue:ctx.k,texto:textoFinal,...(marcados.length?{mencionar:marcados}:{}),email:id.email,token:id.token})}).then(r=>r.json());
    if(!j.ok){ if(fb){ fb.className='ap-fb err'; fb.textContent=humanizaErro(j.erro||'Falha ao responder.'); } if(bt) bt.disabled=false; return; }
    const x=(((estado.mencoes.dados||{}).mencoes)||[]).find(m=>m.k===ctx.k); if(x) x.respondido=true;
    logAcao({acao:'responder-menção', t:ctx.k, para:x?x.por:'', ok:true});
    _mnResp=null; fechaModal();
    toast(`✓ Resposta publicada em ${ctx.k}.`,'ok');
    pintaBadgeInbox();
    if(estado.vista==='mencoes') renderMencoes();
    else if(estado.vista==='inbox') renderInbox();
  }catch(e){ if(fb){ fb.className='ap-fb err'; fb.textContent='Erro de rede: '+(e.message||e); } if(bt) bt.disabled=false; }
}
// ============================ 📥 INBOX — pendências da pessoa ============================
// Caixa de entrada unificada de quem está identificado: convites de apontamento coletivo
// (reunião em grupo), menções aguardando resposta e — para o aprovador — alocações
// esperando aprovação. Reusa as MESMAS ações dos módulos de origem (mesmos data-attrs,
// mesmos handlers): confirmar/recusar convite, responder menção, ficha, apontar.
function inboxAprovacoes(){
  if(!souAprovador()) return [];
  const pess=pessoasUnidas();
  return Object.entries(cfg.alocTravas||{}).filter(([,t])=>t&&t.status==='pendente')
    .map(([a,t])=>({ a, nome:(pess[a]&&pess[a].nome)||a, por:t.por||'', quando:String(t.quando||'').slice(0,10) }));
}
// Avisos de "reunião sem ticket" endereçados a MIM (gravados pela Agenda do time).
function inboxAvisosAgenda(){
  const id=idApontar();
  return (id&&id.accountId&&(cfg.inboxAvisos||{})[id.accountId])||[];
}
function inboxPend(){
  const conv=(estado.apontar.convites||[]).length;
  const ign=mnIgnoradasSet();
  const men=(((estado.inbox.mencoes||{}).mencoes)||[]).filter(m=>!m.respondido && !ign.has(mnChave(m))).length;
  return conv+men+inboxAprovacoes().length+inboxAvisosAgenda().length+((estado.inbox.planos)||[]).length;
}
function pintaBadgeInbox(){
  const n=inboxPend();
  // Selo no item 📥 Inbox E no cabeçalho do grupo 👤 Meu trabalho (dropdown fechado).
  [document.querySelector('#seg-vista [data-v="inbox"]'), document.getElementById('navg-op-b')].forEach(elx=>{
    if(!elx) return; let b=elx.querySelector('.tab-badge');
    if(n>0){ if(!b){ b=document.createElement('span'); b.className='tab-badge'; elx.appendChild(b); }
      b.textContent=n; b.title=n+' pendência(s) aguardando você'; }
    else if(b) b.remove();
  });
  // Espelha a contagem no selo do botão Menu (mobile), para não ficar escondida no drawer.
  const nb=document.getElementById('nt-badge');
  if(nb){ if(n>0){ nb.textContent=n; nb.title=n+' pendência(s) aguardando você'; nb.hidden=false; } else { nb.hidden=true; } }
}
function carregaInbox(forca){
  const ib=estado.inbox; const id=idApontar(); if(!id||!id.accountId) return;
  ib.carregando=true; ib.erro='';
  const pC=fetch(`/api/apontar?convites=1&accountId=${encodeURIComponent(id.accountId)}`)
    .then(r=>r.json()).then(j=>{ estado.apontar.convites=(j&&j.convites)||[]; pintaBadgeConvites(estado.apontar.convites.length); })
    .catch(()=>{});
  const pM=fetch(`/api/vencimentos?mencoes=1&accountId=${encodeURIComponent(id.accountId)}&dias=${estado.mencoes.dias||14}${forca?'&nocache=1':''}`)
    .then(r=>r.json()).then(j=>{ if(j&&!j.erro){ ib.mencoes=j; estado.mencoes.dados=j; } else if(j&&j.erro) ib.erro=j.erro; })
    .catch(e=>{ ib.erro=String(e.message||e); });
  // 📋 Planos semanais aguardando decisão — só para o aprovador (o servidor também valida).
  const pP=souAprovador()
    ? mpApi({acao:'pendencias'}).then(j=>{ ib.planos=(j&&j.ok&&j.pendencias)||[]; }).catch(()=>{ ib.planos=ib.planos||[]; })
    : Promise.resolve(ib.planos=[]);
  Promise.all([pC,pM,pP]).then(()=>{ ib.carregando=false; ib.carregou=true; pintaBadgeInbox();
    if(estado.vista==='inbox') renderInbox(); });
}
function renderInbox(){
  const cont=document.getElementById('conteudo');
  const ib=estado.inbox; const id=idApontar();
  if(!id||!id.accountId){
    cont.replaceChildren(el(`<div><div class="card full"><h2>📥 Inbox <span>suas pendências em um só lugar</span></h2>
      <div class="estado">Identifique-se (e-mail + token do Jira) para montarmos a SUA caixa de entrada.<br>
        <button class="btn primario" data-ap-act="config-id" style="margin-top:10px">Identificar-se</button></div></div></div>`));
    return;
  }
  if(!ib.carregou && !ib.carregando){ carregaInbox(false); }
  if(!ib.carregou){ cont.replaceChildren(el(`<div class="estado">📥 Montando sua caixa de entrada…</div>`)); return; }

  const cvs=estado.apontar.convites||[];
  const ign=mnIgnoradasSet();
  const mens=(((ib.mencoes||{}).mencoes)||[]).filter(m=>!m.respondido && !ign.has(mnChave(m)));
  const aprs=inboxAprovacoes();
  const avs=inboxAvisosAgenda();
  const plns=(souAprovador()&&ib.planos)||[];
  const total=cvs.length+mens.length+aprs.length+avs.length+plns.length;

  const kpis=`<div class="kpis ts-kpis">
    <div class="kpi ${total?'w':'t'}"><div class="v">${total}</div><div class="l">📥 Pendências aguardando você</div></div>
    <div class="kpi a"><div class="v">${cvs.length}</div><div class="l">🤝 Convites de apontamento</div></div>
    <div class="kpi a"><div class="v">${mens.length}</div><div class="l">💬 Menções sem resposta</div></div>
    ${avs.length?`<div class="kpi w"><div class="v">${avs.length}</div><div class="l">📅 Reuniões sem ticket</div></div>`:''}
    ${souAprovador()?`<div class="kpi ${plns.length?'w':'a'}"><div class="v">${plns.length}</div><div class="l">📋 Planos semanais p/ aprovar</div></div>`:''}
    ${souAprovador()?`<div class="kpi a"><div class="v">${aprs.length}</div><div class="l">🔒 Alocações p/ aprovar</div></div>`:''}
  </div>`;

  // 📅 Reuniões sem ticket — avisos que o time enviou para VOCÊ pela Agenda
  // (você organizou e o ticket ainda não existe). Somem sozinhos ao criar/vincular.
  const secAg=avs.length?`<div class="card full">
    <h2>📅 Reuniões sem ticket <span>o time avisou: você organizou e o ticket ainda não existe</span></h2>
    <div class="cv-lista">${avs.map(a=>`
      <div class="cv-row">
        <strong>${esc(a.titulo)}</strong>
        ${a.dia?`<span class="badge">${esc(alxDataBR(a.dia))}</span>`:''}
        <span class="badge" data-tip="Quem avisou pelo painel da Agenda">📨 aviso de ${esc(String(a.de||'?').split(' ')[0])}</span>
        <span class="spacer"></span>
        <button class="btn primario" data-goto="agenda">📅 Abrir a Agenda para criar →</button>
        <button class="btn" data-ib-avdel="${escA(a.evId)}" data-tip="Dispensa este aviso do SEU Inbox (não muda a Agenda nem o Jira)">✕</button>
      </div>`).join('')}</div>
  </div>`:'';

  // 🤝 Convites — mesmo markup/ações do banner da aba Apontar (confirma com 1 clique).
  const secConv=`<div class="card full cv-card">
    <h2>🤝 Convites de apontamento coletivo <span>reuniões em grupo — confirme e o worklog sai no SEU usuário</span></h2>
    ${cvs.length?`<div class="cv-lista">${cvs.map(c=>`
      <div class="cv-row" data-cv-id="${escA(c.id)}">
        <a href="${jiraBase()}/browse/${encodeURIComponent(c.issue)}" target="_blank" rel="noopener"><strong>${esc(c.issue)}</strong> ↗</a>
        <span class="ap-resumo">${esc(c.resumo||'')}</span>
        <span class="badge com-horas">${fmtH(c.segundos)}</span>
        <span class="badge">${fmtBR(c.inicio)}</span>
        ${c.comentario?`<span class="badge" data-tip="${escA(c.comentario)}">💬</span>`:''}
        <span class="badge" data-tip="Quem convidou">por ${esc(c.criadoPor||'?')}</span>
        <span class="spacer"></span>
        <button class="btn primario" data-cv-conf="${escA(c.id)}">✓ Apontar ${fmtH(c.segundos)}</button>
        <button class="btn" data-cv-rec="${escA(c.id)}" data-tip="Não participei / não vou apontar">✕</button>
        <div class="ap-fb" hidden></div>
      </div>`).join('')}</div>
      ${cvs.length>1?`<div style="margin-top:10px"><button class="btn primario" id="cv-todos">✓ Confirmar todos (${cvs.length})</button></div>`:''}`
    :'<div class="alx-vazio">✓ Nenhum convite aguardando.</div>'}
  </div>`;

  // 💬 Menções sem resposta — mesmas ações do módulo Menções.
  const secMen=`<div class="card full">
    <h2>💬 Menções aguardando resposta <span>últimos ${estado.mencoes.dias||14} dias · <span class="lnk" data-goto="mencoes">ver todas no módulo Menções →</span></span></h2>
    ${mens.length?`<div class="mn-list">${mens.map(x=>{
      const link=`${jiraBase()}/browse/${encodeURIComponent(x.k)}`;
      return `<div class="mn-card pend">
        <div class="mn-top">
          <a href="${link}" target="_blank" rel="noopener"><strong>${esc(x.k)}</strong> ↗</a>
          <span class="mn-res" title="${escA(x.resumo)}">${esc(x.resumo||'—')}</span>
          <span class="spacer"></span>
          <span class="badge" data-tip="${escA(x.p)}">${esc(projNome(x.p))}</span><span class="badge">${esc(x.status)}</span>
          <span class="mn-badge pend">⏳ aguardando sua resposta</span>
        </div>
        <div class="mn-quote"><strong>${esc(x.por)}</strong> te marcou ${x.dia?`em ${esc(alxDataBR(x.dia))}`:''}: <span class="muted">“${esc(x.texto||'')}”</span></div>
        <div class="mn-acts">
          <button class="btn primario" data-mn-resp="${escA(x.k)}">💬 Responder</button>
          <button class="btn" data-gx-det="${escA(x.k)}">🔍 detalhes</button>
          <button class="btn" data-gx-apont="${escA(x.k)}">⏱ apontar</button>
          <button class="btn" data-mn-ign="${escA(mnChave(x))}" data-tip="Some das SUAS listas e selos (não afeta o Jira nem as outras pessoas). Reverta no módulo Menções, em 'mostrar ignoradas'.">🔕 Ignorar</button>
        </div>
      </div>`;}).join('')}</div>`
    :'<div class="alx-vazio">✓ Nenhuma menção sem resposta.</div>'}
  </div>`;

  // 📋 Planos semanais aguardando a decisão do aprovador — clicar abre o
  // Meu Planejamento já na aba Aprovações (onde vive a decisão completa).
  const secPl=(souAprovador()&&plns.length)?`<div class="card full">
    <h2>📋 Planos semanais aguardando sua aprovação <span>a pessoa fica com a edição travada até você decidir</span></h2>
    <div class="cv-lista">${plns.map(p=>{ const s=isoSemana(p.semana);
      return `<div class="cv-row">
        <strong>${esc(p.nome||p.email||p.accountId)}</strong>
        <span class="badge">Semana ${s.num}/${s.ano} · ${esc(fmtBR(p.semana))}</span>
        <span class="badge" data-tip="Total planejado na semana">${mpH(p.total)}</span>
        ${p.enviadoEm?`<span class="badge" data-tip="Enviado em">📨 ${esc(fmtBR((p.enviadoEm||'').slice(0,10)))}</span>`:''}
        ${(p.versao||1)>1?`<span class="badge" data-tip="Plano reenviado após devolução">v${p.versao}</span>`:''}
        <span class="spacer"></span>
        <button class="btn primario" data-ib-plano="1">Revisar e decidir →</button>
      </div>`; }).join('')}</div>
  </div>`:'';

  // 🔒 Aprovações de alocação — só aparece para o aprovador e quando há pendências.
  const secApr=(souAprovador()&&aprs.length)?`<div class="card full">
    <h2>🔒 Alocações aguardando sua aprovação <span>travadas até você aprovar ou recusar</span></h2>
    <div class="cv-lista">${aprs.map(p=>`
      <div class="cv-row">
        <strong>${esc(p.nome)}</strong>
        <span class="badge" data-tip="Quem travou">por ${esc(p.por||'?')}</span>
        ${p.quando?`<span class="badge">${esc(alxDataBR(p.quando))}</span>`:''}
        <span class="spacer"></span>
        <button class="btn primario" data-goto="alocacao">Abrir Alocação →</button>
      </div>`).join('')}</div>
  </div>`:'';

  cont.replaceChildren(el(`<div>
    <div class="ap-id">📥 Inbox de <strong>${esc(id.nome||id.email)}</strong>
      <span class="muted small">convites, menções, planos semanais e aprovações que dependem de você</span>
      <span class="spacer"></span>
      <button class="btn" id="ib-forcar" data-tip="Rebusca convites e menções agora (ignora o cache do servidor)">⟳ Atualizar</button></div>
    ${ib.erro?`<div class="aviso">Parte da caixa pode estar incompleta: ${esc(ib.erro)} <button class="btn" id="ib-retry">tentar de novo</button></div>`:''}
    ${kpis}
    ${total?'':'<div class="alx-vazio" style="margin-bottom:12px">🎉 Caixa limpa — nada aguardando você.</div>'}
    ${secAg}
    ${secPl}
    ${secConv}
    ${secMen}
    ${secApr}
  </div>`));
}
// Dispensar aviso de reunião sem ticket (só some do MEU Inbox) + abrir aprovações de plano.
document.getElementById('conteudo').addEventListener('click',(e)=>{
  const pl=e.target.closest&&e.target.closest('[data-ib-plano]');
  if(pl){ estado.minhasemana.aba='aprovacoes'; estado.minhasemana.pend=null; vaiPara('minhasemana'); return; }
  const d=e.target.closest&&e.target.closest('[data-ib-avdel]'); if(!d) return;
  const id=idApontar(); if(!id||!id.accountId) return;
  const evId=d.getAttribute('data-ib-avdel');
  const lst=((cfg.inboxAvisos||{})[id.accountId])||[];
  const f=lst.filter(a=>a.evId!==evId);
  if(f.length) cfg.inboxAvisos[id.accountId]=f; else if(cfg.inboxAvisos) delete cfg.inboxAvisos[id.accountId];
  salvaCfg(); pintaBadgeInbox(); if(estado.vista==='inbox') renderInbox();
});
// ============================ 📈 ANALYTICS DE GOVERNANÇA ============================
// 26 visões de saúde/governança calculadas NO FRONT sobre a base bruta do servidor
// (/api/vencimentos?analytics=1): abertos + concluídos do período + reabertos.
// modo: auto = regra objetiva · heur = heurística (pode ter falso positivo) ·
//       manual = não dá para automatizar com os dados atuais (vira guia/atalho).
const ANL_RE_REU=/reuni/i, ANL_RE_AGRUP=/hist[óo]ria|story|épico|epic/i, ANL_RE_ROTINA=/rotina/i,
      ANL_RE_DESCARTE=/cancel|duplic|won'?t|descart|rejeit|obsolet/i,
      ANL_RE_PRIOALTA=/highest|blocker|urgent|cr[íi]tic|\bhigh\b|alta/i,
      ANL_RE_BLOQ=/bloque|impedi|blocked|hold/i,
      ANL_RE_AGUARDA=/aguard|waiting|pendente/i,
      ANL_RE_TITREU=/reuni[ãa]o|meeting|daily|weekly|alinhamento|\bcall\b|cerim[ôo]nia/i,
      ANL_RE_TITTASK=/\b(bug|erro|corrigir|corre[çc][ãa]o|implementar|desenvolver|configurar|instalar|homologar)\b/i;
function anlDiasDesde(hoje,iso){ const d=String(iso||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return Math.max(0,Math.round((new Date(hoje)-new Date(d))/86400000)); }
function anlCatProj(p){ const pr=(_projetosCache||[]).find(x=>x.key===p); return (pr&&pr.categoria)||''; }
const ANL_GRUPOS=[['prazo','⏰ Prazos & andamento'],['pessoas','👤 Pessoas & atribuição'],
  ['horas','⏱ Horas & estimativas'],['reunioes','📅 Reuniões'],['qualidade','🧭 Qualidade & vínculos']];
const ANL_CHECKS=[
  {n:1,id:'vencidos',g:'prazo',sev:'alta',modo:'auto',tit:'Chamados vencidos',col:'Atraso',
   des:'Vencimento no passado e status diferente de concluído.',
   calc:(c)=>c.A.filter(t=>t.venc&&t.venc<c.hoje)
     .map(t=>({...t,m:`${anlDiasDesde(c.hoje,t.venc)}d (venceu ${alxDataBR(t.venc)})`}))
     .sort((x,y)=>x.venc<y.venc?-1:1)},
  {n:2,id:'semvenc',g:'prazo',sev:'media',modo:'auto',tit:'Sem data de vencimento',col:'Criado',
   des:'Abertos sem due date (fora agrupadores) — sem prazo não há SLA nem planejamento.',
   calc:(c)=>c.A.filter(t=>!t.venc&&!ANL_RE_AGRUP.test(t.t)).map(t=>({...t,m:`criado ${alxDataBR(t.criado)}`}))},
  {n:16,id:'backlog',g:'prazo',sev:'media',modo:'heur',tit:'Backlog que já deveria andar',col:'Indício',
   des:'Itens ainda "a fazer" com início planejado no passado ou vencimento nos próximos 3 dias.',
   calc:(c)=>c.A.filter(t=>t.statCat==='new'&&((t.inicio&&t.inicio<c.hoje)||(t.venc&&t.venc<=somaDias(c.hoje,3))))
     .map(t=>({...t,m:(t.inicio&&t.inicio<c.hoje)?`início planejado ${alxDataBR(t.inicio)}`:`vence ${alxDataBR(t.venc)}`}))},
  {n:8,id:'parado',g:'prazo',sev:'media',modo:'auto',tit:'Em andamento sem atualização há X dias',col:'Parado há',
   des:'Em progresso sem nenhuma movimentação no Jira acima do limite X (filtro acima).',
   calc:(c)=>c.A.filter(t=>t.statCat==='indeterminate'&&(anlDiasDesde(c.hoje,t.up)??999)>=c.x)
     .map(t=>({...t,m:`${anlDiasDesde(c.hoje,t.up)??'?'}d sem atualização`}))},
  {n:9,id:'prioparada',g:'prazo',sev:'alta',modo:'auto',tit:'Prioridade alta/crítica sem atividade',col:'Situação',
   des:'Prioridade alta ou crítica sem movimentação recente (limite X).',
   calc:(c)=>c.A.filter(t=>ANL_RE_PRIOALTA.test(t.prio||'')&&(anlDiasDesde(c.hoje,t.up)??999)>=c.x)
     .map(t=>({...t,m:`${t.prio} · ${anlDiasDesde(c.hoje,t.up)}d sem atividade`}))},
  {n:15,id:'bloqueados',g:'prazo',sev:'media',modo:'heur',tit:'Bloqueados (verificar motivo)',col:'Parado há',
   des:'Status de bloqueio/impedimento — confira se o motivo está documentado no ticket.',
   calc:(c)=>c.A.filter(t=>ANL_RE_BLOQ.test(t.status||'')).map(t=>({...t,m:`${anlDiasDesde(c.hoje,t.up)??'?'}d`}))},
  {n:21,id:'datas',g:'prazo',sev:'media',modo:'auto',tit:'Início/fim incoerentes',col:'Datas',
   des:'Data de início preenchida DEPOIS do vencimento (fim antes do início).',
   calc:(c)=>c.temInicio?c.A.filter(t=>t.inicio&&t.venc&&t.venc<t.inicio)
     .map(t=>({...t,m:`início ${alxDataBR(t.inicio)} > fim ${alxDataBR(t.venc)}`})):null,
   nota:'Requer o campo "Start date"/"Data de início" na instância do Jira — não foi encontrado.'},
  {n:26,id:'sla',g:'prazo',sev:'alta',modo:'heur',tit:'Aguardando resposta há X dias (SLA)',col:'Situação',
   des:'Status de espera (aguardando/pendente/waiting) parado acima do limite X — proxy de SLA estourado.',
   calc:(c)=>c.A.filter(t=>ANL_RE_AGUARDA.test(t.status||'')&&(anlDiasDesde(c.hoje,t.up)??999)>=c.x)
     .map(t=>({...t,m:`${t.status} · ${anlDiasDesde(c.hoje,t.up)}d sem resposta`}))},
  {n:3,id:'semresp',g:'pessoas',sev:'media',modo:'auto',tit:'Sem pessoa atribuída',col:'Aberto há',
   des:'Abertos sem assignee — itens órfãos, ninguém é dono.',
   calc:(c)=>c.A.filter(t=>!t.respId).map(t=>({...t,m:`${anlDiasDesde(c.hoje,t.criado)??'?'}d`}))},
  {n:18,id:'resperrada',g:'pessoas',sev:'info',modo:'manual',tit:'Atribuídos à pessoa errada',
   des:'Perfil incorreto (técnico × funcional × PMO) exige julgamento humano.',
   nota:'Use a lista "Sem pessoa atribuída" + os filtros de responsável da Gestão de Tickets para revisar por pessoa.'},
  {n:4,id:'finsemhoras',g:'horas',sev:'alta',modo:'auto',tit:'Finalizados sem horas apontadas',col:'Resolvido',
   des:'Concluídos no período sem nenhum worklog (fora agrupadores e cancelados/duplicados).',
   calc:(c)=>c.C.filter(t=>t.seg===0&&!ANL_RE_AGRUP.test(t.t)&&!ANL_RE_DESCARTE.test(t.resol||''))
     .map(t=>({...t,status:t.resol,m:`resolvido ${alxDataBR(t.resolvido)}`}))},
  {n:7,id:'horasreuniao',g:'horas',sev:'info',modo:'manual',tit:'Horas de reuniões por participante',
   des:'Depende do controle de participantes de cada reunião.',
   nota:'A 🕵️ Auditoria de Tickets já cruza as reuniões da pessoa com os worklogs de TODOS os participantes — use-a por pessoa.',goto:'audit'},
  {n:12,id:'estzero',g:'horas',sev:'info',modo:'heur',tit:'Estimativa zerada',col:'Status',
   des:'Em andamento sem estimativa original (fora reuniões, rotinas e agrupadores).',
   calc:(c)=>c.A.filter(t=>t.statCat==='indeterminate'&&!t.est&&!ANL_RE_AGRUP.test(t.t)&&!ANL_RE_REU.test(t.t)&&!ANL_RE_ROTINA.test(t.t))
     .map(t=>({...t,m:t.status}))},
  {n:13,id:'acimaest',g:'horas',sev:'media',modo:'heur',tit:'Horas acima da estimativa',col:'Horas / estimativa',
   des:'Worklog já passou de 120% da estimativa — verifique se há justificativa no ticket.',
   calc:(c)=>c.A.filter(t=>t.est>0&&t.seg>t.est*1.2)
     .map(t=>({...t,m:`${fmtH(t.seg)} de ${fmtH(t.est)} (${Math.round(t.seg/t.est*100)}%)`}))},
  {n:22,id:'trabsemwl',g:'horas',sev:'media',modo:'heur',tit:'Movimentado hoje sem worklog hoje',col:'Situação',
   des:'Em andamento com atividade HOJE no Jira e nenhuma hora apontada hoje no ticket.',
   calc:(c)=>c.A.filter(t=>t.statCat==='indeterminate'&&String(t.up).slice(0,10)===c.hoje&&!c.wlHoje.has(t.k))
     .map(t=>({...t,m:'movimentado hoje · 0h apontadas hoje'})),
   notaExtra:'Compara com os worklogs do período carregado no painel — confira o período atual no topo.'},
  {n:5,id:'reuvencida',g:'reunioes',sev:'alta',modo:'auto',tit:'Reuniões ocorridas não finalizadas',col:'Quando',
   des:'Tipo reunião com data no passado (ou sem data, criada há 1+ dia) ainda aberta.',
   calc:(c)=>c.A.filter(t=>ANL_RE_REU.test(t.t)&&((t.venc&&t.venc<c.hoje)||(!t.venc&&(anlDiasDesde(c.hoje,t.criado)??0)>=1)))
     .map(t=>({...t,m:t.venc?`ocorreu ${alxDataBR(t.venc)}`:`criada ${alxDataBR(t.criado)}`}))},
  {n:6,id:'reuprojeto',g:'reunioes',sev:'media',modo:'heur',tit:'Reuniões no projeto de triagem',col:'Projeto',
   des:'Reuniões abertas paradas no projeto de origem (triagem) — mova na tela 🔀 Reclassificar.',
   calc:(c)=>c.A.filter(t=>ANL_RE_REU.test(t.t)&&t.p===c.origemReu).map(t=>({...t,m:`${t.p} — reclassificar`}))},
  {n:23,id:'devserreuniao',g:'reunioes',sev:'info',modo:'heur',tit:'Deveriam ser reunião (são task/bug)',col:'Tipo atual',
   des:'Título tem cara de reunião (daily, alinhamento, call…) mas o tipo não é reunião.',
   calc:(c)=>c.A.filter(t=>!ANL_RE_REU.test(t.t)&&!t.sub&&ANL_RE_TITREU.test(t.resumo||'')).map(t=>({...t,m:t.t}))},
  {n:24,id:'reudevsertask',g:'reunioes',sev:'info',modo:'heur',tit:'Deveriam ser task/bug (são reunião)',col:'Indício',
   des:'Tipo reunião com título de execução (bug, corrigir, implementar, configurar…).',
   calc:(c)=>c.A.filter(t=>ANL_RE_REU.test(t.t)&&ANL_RE_TITTASK.test(t.resumo||'')).map(t=>({...t,m:'título sugere tarefa/bug'}))},
  {n:10,id:'semdesc',g:'qualidade',sev:'media',modo:'heur',tit:'Abertos sem descrição mínima',col:'Descrição',
   des:'Menos de 40 caracteres de descrição (fora agrupadores) — sem contexto nem critério de aceite.',
   calc:(c)=>c.A.filter(t=>!ANL_RE_AGRUP.test(t.t)&&t.descLen<40).map(t=>({...t,m:`${t.descLen} caractere(s)`}))},
  {n:11,id:'classif',g:'qualidade',sev:'info',modo:'manual',tit:'Sem classificação correta',
   des:'Tipo/componente/cliente/módulo corretos dependem de regra por projeto.',
   nota:'Cheque as visões 23/24 (tipo reunião × task) e 19 (sem épico); a 🔎 Qualidade (IA) avalia a escrita ticket a ticket.',goto:'qualidade'},
  {n:14,id:'reabertos',g:'qualidade',sev:'media',modo:'heur',tit:'Retrabalho (reabertos)',col:'Situação',
   des:'Resolução preenchida em ticket NÃO concluído — voltou depois de resolvido (ou fluxo não limpou a resolução).',
   calc:(c)=>c.R.map(t=>({...t,t:'',m:`resolução "${t.resol}" em status ${t.status}`}))},
  {n:17,id:'semevidencia',g:'qualidade',sev:'info',modo:'heur',tit:'Concluídos sem evidência (anexos)',col:'Evidência',
   des:'Concluídos executáveis (fora rotinas) sem nenhum anexo — comentários exigem checagem manual.',
   calc:(c)=>c.C.filter(t=>!ANL_RE_AGRUP.test(t.t)&&!ANL_RE_ROTINA.test(t.t)&&!ANL_RE_DESCARTE.test(t.resol||'')&&t.anexos===0)
     .map(t=>({...t,status:t.resol,m:'0 anexos'}))},
  {n:19,id:'semepico',g:'qualidade',sev:'media',modo:'auto',tit:'Sem vínculo com épico',col:'Tipo',
   des:'Abertos soltos (sem pai/épico, fora subtarefas e agrupadores).',
   calc:(c)=>c.A.filter(t=>!t.sub&&!ANL_RE_AGRUP.test(t.t)&&!t.pai).map(t=>({...t,m:t.t})),
   notaExtra:'Vincule em lote com 🧩 Ajustar épicos, na Gestão de Tickets.'},
  {n:20,id:'amsmix',g:'qualidade',sev:'media',modo:'heur',tit:'AMS misturado com projeto',col:'Categoria do projeto',
   des:'Menção a AMS (título/label/tipo) em projeto cuja categoria NÃO é AMS.',
   calc:(c)=>c.A.filter(t=>{ const cat=anlCatProj(t.p);
       return cat&&!/ams/i.test(cat)&&(/\bams\b/i.test(t.resumo||'')||(t.labels||[]).some(l=>/ams/i.test(l))||/\bams\b/i.test(t.t||'')); })
     .map(t=>({...t,m:anlCatProj(t.p)}))},
  {n:25,id:'comentarios',g:'qualidade',sev:'info',modo:'manual',tit:'Comentários fora do padrão',
   des:'Comentário usado como chat / sem objetividade exige leitura.',
   nota:'A 🔎 Qualidade (IA) avalia os tickets contra a TI-04-006 (incluindo "ticket como chat") — rode-a por projeto.',goto:'qualidade'},
];
function carregaAnalytics(forca){
  const an=estado.analytics;
  an.carregando=true; an.erro='';
  fetch(`/api/vencimentos?analytics=1&dias=${an.dias}${forca?'&nocache=1':''}`)
    .then(r=>r.json()).then(j=>{ an.carregando=false;
      if(j.erro) an.erro=j.erro; else an.dados=j;
      if(estado.vista==='analytics') renderAnalytics();
    }).catch(e=>{ an.carregando=false; an.erro=String(e.message||e); if(estado.vista==='analytics') renderAnalytics(); });
}
// Contexto dos checks: dados filtrados (projeto/responsável) + parâmetros da barra.
function anlCtx(){
  const an=estado.analytics; const d=an.dados;
  const fil=(l)=>l.filter(t=>(!an.fProj||t.p===an.fProj)&&(!an.fResp||t.respId===an.fResp));
  const wlHoje=new Set(); const hoje=(d.meta&&d.meta.hoje)||hojeSP();
  (((estado.tempo||{}).worklogs)||[]).forEach(w=>{ if(String(w.d||'').slice(0,10)===hoje) wlHoje.add(w.k); });
  return { hoje, x:Math.max(1,Number(an.x)||5), temInicio:!!(d.meta&&d.meta.temInicio),
    origemReu:(estado.reclass&&estado.reclass.origem)||'RDF', wlHoje,
    A:fil(d.abertos||[]), C:fil(d.concluidos||[]), R:fil((d.reabertos||[]).map(t=>({...t,respId:''}))) };
}
function anlResultados(){
  const ctx=anlCtx();
  return ANL_CHECKS.map(ch=>{
    let itens=null;
    if(ch.calc){ try{ itens=ch.calc(ctx); }catch(e){ itens=null; } }
    return { ch, itens, n:itens?itens.length:null };
  });
}
function anlExportaCSV(res){
  const { ch, itens }=res; if(!itens) return;
  const cel=(v)=>{ v=String(v==null?'':v); return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
  const cab=['Ticket','Resumo','Projeto','Tipo','Status','Responsável',ch.col||'Métrica'];
  const li=itens.map(t=>[t.k,t.resumo,t.p,t.t||'',t.status||'',t.resp||'',t.m||''].map(cel).join(';'));
  const csv='\ufeff'+cab.join(';')+'\n'+li.join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download=`analytics-${ch.id}-${hojeSP()}.csv`; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
}
function renderAnalytics(){
  const cont=document.getElementById('conteudo');
  const an=estado.analytics;
  if(!_projetosCache) garanteProjetos().then(()=>{ if(estado.vista==='analytics') renderAnalytics(); }).catch(()=>{});
  if(!an.dados && !an.carregando && !an.erro) carregaAnalytics(false);
  if(an.erro){ cont.replaceChildren(el(`<div class="erro"><strong>Falha ao carregar o Analytics.</strong> ${esc(an.erro)}
    <button class="btn" id="anl-retry" style="margin-left:10px">Tentar de novo</button></div>`)); return; }
  if(!an.dados){ cont.replaceChildren(el('<div class="estado">📈 Coletando a base (abertos, concluídos e reabertos)…</div>')); return; }

  const d=an.dados; const res=anlResultados();
  const projetos=[...new Set((d.abertos||[]).concat(d.concluidos||[]).map(t=>t.p))].sort();
  const resps=[...new Map((d.abertos||[]).concat(d.concluidos||[]).filter(t=>t.respId).map(t=>[t.respId,t.resp])).entries()]
    .sort((x,y)=>x[1].localeCompare(y[1],'pt'));
  const autoHeur=res.filter(r=>r.n!==null);
  const problemas=autoHeur.reduce((s,r)=>s+r.n,0);
  const altas=autoHeur.filter(r=>r.ch.sev==='alta').reduce((s,r)=>s+r.n,0);
  const ok=autoHeur.filter(r=>r.n===0).length;
  const manuais=res.filter(r=>r.n===null).length;
  const quando=d.meta&&d.meta.geradoEm?new Date(d.meta.geradoEm):null;
  const trunc=d.meta&&d.meta.truncado&&(d.meta.truncado.abertos||d.meta.truncado.concluidos);

  const filtros=`<div class="ap-filtros">
    <div class="campo"><label>Projeto</label><select id="anl-fproj"><option value="">todos</option>${projetos.map(p=>`<option value="${escA(p)}" ${an.fProj===p?'selected':''}>${esc(p)}</option>`).join('')}</select></div>
    <div class="campo"><label>Responsável</label><select id="anl-fresp"><option value="">todos</option>${resps.map(([id2,n])=>`<option value="${escA(id2)}" ${an.fResp===id2?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="campo"><label>X (dias sem atividade)</label><input type="number" id="anl-x" min="1" max="60" value="${escA(String(an.x))}" style="width:90px"></div>
    <div class="campo"><label>Concluídos (período)</label><select id="anl-dias">${[15,30,60,90].map(v=>`<option value="${v}" ${an.dias===v?'selected':''}>últimos ${v} dias</option>`).join('')}</select></div>
    <div class="campo"><label>&nbsp;</label><button class="btn" id="anl-refresh" data-tip="Recarrega a base ignorando o cache do servidor">↻ Atualizar</button></div>
    <div class="campo" style="justify-content:end"><label>&nbsp;</label><span class="muted small">🕓 base de ${quando?esc(quando.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})):'—'} · ${(d.abertos||[]).length} abertos · ${(d.concluidos||[]).length} concluídos</span></div>
  </div>${trunc?'<div class="aviso" style="margin:0 0 10px">⚠ Base truncada (muitos tickets) — os números são um piso, não o total.</div>':''}`;

  const kpis=`<div class="kpis ts-kpis">
    <div class="kpi ${altas?'w':'a'}"><div class="v">${altas}</div><div class="l">🔴 Apontamentos severidade alta</div></div>
    <div class="kpi ${problemas?'w':'a'}"><div class="v">${problemas}</div><div class="l">∑ Apontamentos (auto + heurística)</div></div>
    <div class="kpi a"><div class="v">${ok}/${autoHeur.length}</div><div class="l">✅ Visões sem ocorrência</div></div>
    <div class="kpi t"><div class="v">${manuais}</div><div class="l">📋 Visões manuais (guia)</div></div>
  </div>`;

  // ---- Drill-down de uma visão ----
  const sel=res.find(r=>r.ch.id===an.sel);
  if(sel && sel.itens===null){
    // Visão manual (ou automática indisponível): vira um GUIA com atalho.
    const { ch }=sel;
    cont.replaceChildren(el(`<div>
      <div class="card full">
        <h2><button class="btn" id="anl-voltar" style="margin-right:10px">← Visões</button>
          ${ch.n}. ${esc(ch.tit)} <span>${esc(ch.des)}</span></h2>
        <div class="ap-vis" style="margin:0 0 10px"><span class="anl-badge anl-manual">checagem manual</span></div>
        <div class="estado" style="text-align:left">${esc(ch.nota||'Esta visão exige julgamento humano com os dados atuais.')}
          ${ch.goto?`<div style="margin-top:12px"><button class="btn primario" data-anl-goto="${escA(ch.goto)}">Abrir a tela indicada →</button></div>`:''}</div>
      </div></div>`));
    return;
  }
  if(sel){
    const { ch }=sel; let itens=sel.itens||[];
    if(an.busca){ const q=an.busca.toLowerCase();
      itens=itens.filter(t=>(t.k+' '+t.resumo+' '+(t.resp||'')+' '+(t.status||'')).toLowerCase().includes(q)); }
    const rows=itens.slice(0,400).map(t=>`<tr>
      <td><a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener">${esc(t.k)} ↗</a></td>
      <td class="rc-resumo" title="${escA(t.resumo||'')}">${esc(t.resumo||'—')}</td>
      <td><span class="badge">${esc(t.p||'—')}</span></td>
      <td>${t.t?`<span class="badge">${esc(t.t)}</span>`:'—'}</td>
      <td>${t.status?`<span class="badge">${esc(t.status)}</span>`:'—'}</td>
      <td>${esc(t.resp||'—')}</td>
      <td>${esc(t.m||'—')}</td>
      <td><span class="gx-acts"><button data-gx-det="${escA(t.k)}" title="Ficha completa do ticket (descrição, comentários, anexos, horas) sem abrir o Jira">🔍 detalhes</button><button data-gx-apont="${escA(t.k)}" title="Apontar horas neste ticket (worklog no seu usuário)">⏱ apontar</button></span></td></tr>`).join('');
    cont.replaceChildren(el(`<div>
      <div class="card full">
        <h2><button class="btn" id="anl-voltar" style="margin-right:10px">← Visões</button>
          ${ch.n}. ${esc(ch.tit)} <span>${sel.n} ocorrência(s) · ${esc(ch.des)}</span></h2>
        <div class="ap-vis" style="margin:0 0 10px">
          <span class="anl-badge anl-${ch.modo}">${ch.modo==='auto'?'automática':ch.modo==='heur'?'heurística':'manual'}</span>
          ${ch.notaExtra?`<span class="muted small">${esc(ch.notaExtra)}</span>`:''}
          <span class="spacer"></span>
          <input type="search" id="anl-busca" placeholder="filtrar por código, resumo, pessoa…" value="${escA(an.busca)}" style="min-width:240px">
          <button class="btn" id="anl-gestao" ${itens.length?'':'disabled'} data-tip="Abre a Gestão de Tickets só com estes itens, já selecionados — todas as ações em massa (atribuir, status, comentar, reprogramar, excluir…) e por linha">🛠 Abrir na Gestão</button>
          <button class="btn" id="anl-csv" ${itens.length?'':'disabled'}>⬇ CSV</button>
        </div>
        ${itens.length?`<div class="ts-wrap"><table class="rc-tab"><thead><tr>
          <th>Ticket</th><th>Resumo</th><th>Projeto</th><th>Tipo</th><th>Status</th><th>Responsável</th><th>${esc(ch.col||'Métrica')}</th><th>Ações</th>
        </tr></thead><tbody>${rows}</tbody></table></div>
        ${itens.length>400?`<div class="muted small" style="margin-top:6px">Mostrando 400 de ${itens.length} — use os filtros ou exporte o CSV.</div>`:''}`
        :'<div class="alx-vazio">✓ Nenhuma ocorrência com os filtros atuais.</div>'}
      </div></div>`));
    return;
  }

  // ---- Grade de cards por grupo ----
  const cardDe=(r)=>{
    const { ch, n }=r;
    const cls=n===null?'manual':(n===0?'ok':ch.sev);
    const cnt=n===null?'—':n;
    return `<button class="anl-card ${cls}" data-anl-card="${escA(ch.id)}">
      <div class="anl-top"><span class="anl-num">${ch.n}</span><span class="anl-tit">${esc(ch.tit)}</span>
        <span class="spacer"></span><span class="anl-cnt">${cnt}</span></div>
      <div class="anl-des">${esc(ch.des)}</div>
      <div class="anl-foot"><span class="anl-badge anl-${ch.modo}">${ch.modo==='auto'?'automática':ch.modo==='heur'?'heurística':'manual'}</span>
        ${n===null?'<span class="muted small">guia →</span>':(n>0?'<span class="muted small">ver lista →</span>':'<span class="muted small">✓ sem ocorrência</span>')}</div>
    </button>`;
  };
  const grupos=ANL_GRUPOS.map(([gid,gnome])=>{
    const rs=res.filter(r=>r.ch.g===gid);
    const tot=rs.filter(r=>r.n!==null).reduce((s,r)=>s+r.n,0);
    return `<div class="anl-grupo"><h3>${esc(gnome)} <span class="muted small">${tot} apontamento(s)</span></h3>
      <div class="anl-grid">${rs.map(cardDe).join('')}</div></div>`;
  }).join('');

  cont.replaceChildren(el(`<div>
    <div class="card full">
      <h2>📈 Analytics de Governança <span>26 visões de saúde do Jira — clique num card para o detalhe (lista + CSV)</span></h2>
      ${filtros}
      ${kpis}
      ${grupos}
    </div></div>`));
}
