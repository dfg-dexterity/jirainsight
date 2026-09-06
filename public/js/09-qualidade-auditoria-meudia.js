// Jira Insights · 09 · ✅ QUALIDADE DOS TICKETS (IA), 🕵️ AUDITORIA e 📍 MEU DIA.
// ========== QUALIDADE DOS TICKETS: IA audita contra as boas práticas TI-04-006 ==========
// A rubrica é lida AO VIVO da página pública do Notion (atualizou lá → a análise acompanha).
function qaAnalisa(force){
  const q=estado.qualidade;
  q.carregando=true; q.erro=''; renderQualidade();
  fetch('/api/resumo?acao=qualidade',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({dias:q.dias, projeto:q.projeto, nocache:force?1:0})})
    .then(r=>r.json()).then(j=>{ q.carregando=false;
      if(!j.ok){ q.erro=j.erro||'Falha na análise.'; q.dados=null; }
      else { q.dados=j; qaRegistraSemana(j); }   // indicador semanal salvo na config do time
      if(estado.vista==='qualidade') renderQualidade();
    }).catch(e=>{ q.carregando=false; q.erro=String(e.message||e); if(estado.vista==='qualidade') renderQualidade(); });
}
function qaCard(t){
  const url=`${jiraBase()}/browse/${encodeURIComponent(t.k)}`;
  const cls=t.sinal==='bom'?'saud':(t.sinal==='atencao'?'aten':'crit');
  const probs=t.problemas.map(p=>`<li><strong>${esc(p.principio)}</strong> — ${esc(p.detalhe)}</li>`).join('');
  const icone={comentar:'💬',vencimento:'📅',atribuir:'👤',status:'🔀',dividir:'✂️',editar:'✏️'};
  const acts=t.acoes.map((a,i)=>
    `<button class="btn qa-act" data-qa-act="${escA(a.tipo)}" data-qa-k="${escA(t.k)}" data-qa-i="${i}" data-tip="${escA((a.texto||a.rotulo||'').slice(0,220))}">${icone[a.tipo]||'▸'} ${esc(a.rotulo)}</button>`).join('');
  // Avisar a pessoa: comenta NO ticket marcando (@) o responsável (ou o relator) com
  // os pontos a corrigir e o link das boas práticas.
  const alvoId=t.respId||t.relatorId||''; const alvoNome=(t.respId?t.responsavel:t.relator)||'';
  const avisar=(t.problemas.length&&alvoId)
    ?`<button class="btn qa-act primario" data-qa-avisar="${escA(t.k)}" data-tip="Comenta no ticket marcando @${escA(alvoNome)}${t.respId?' (responsável)':' (relator)'} com os pontos a corrigir e o link das boas práticas">📣 Avisar ${esc(alvoNome.split(' ')[0]||'a pessoa')}</button>`
    :'';
  return `<div class="ap-row qa-card ${escA(t.sinal)}">
    <div class="ap-l1">
      <a href="${url}" target="_blank" rel="noopener">${esc(t.k)} ↗</a>
      <span class="ap-resumo">${esc(t.resumo)}</span>
      <span class="spacer"></span>
      <span class="badge tipo-badge">${esc(t.tipo)}</span>
      ${t.responsavel?`<span class="badge" data-tip="Responsável">👤 ${esc(t.responsavel)}</span>`:'<span class="badge venc-passado">sem responsável</span>'}
      ${t.vencimento?`<span class="badge" data-tip="Vencimento">📅 ${esc(fmtBR(t.vencimento))}</span>`:'<span class="badge venc-passado">sem vencimento</span>'}
      ${t.horasApontadas?`<span class="badge com-horas" data-tip="Horas apontadas${t.nSubtarefas?'':' — sem subtarefas'}">⏱ ${t.horasApontadas}h</span>`:''}
      ${t.nSubtarefas?`<span class="badge" data-tip="Subtarefas">${t.nSubtarefas} sub</span>`:''}
      <span class="aloc-badge ${cls}" data-tip="Nota de aderência às boas práticas (0–100)">${t.nota}</span>
    </div>
    ${probs?`<ul class="qa-probs">${probs}</ul>`:'<div class="muted small">✓ Sem violações relevantes das boas práticas.</div>'}
    <div class="ap-chips qa-acts"><span class="muted small" style="align-self:center">Ações:</span>${avisar}${acts}
      <button class="btn qa-act" data-qa-abrir="${escA(t.k)}">↗ Abrir no Jira</button></div>
  </div>`;
}
function renderQualidade(){
  const cont=document.getElementById('conteudo');
  const q=estado.qualidade;
  if(!_projetosCache) garanteProjetos().catch(()=>{});
  const projs=(_projetosCache||[]).slice().sort((a,b)=>a.key.localeCompare(b.key));
  const optProj='<option value="">todos os projetos</option>'+projs.map(p=>`<option value="${escA(p.key)}" ${q.projeto===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('');
  const controles=`<div class="ap-filtros">
      <div class="campo"><label>Tickets criados nos últimos</label><select id="qa-dias">${[7,14,30,60].map(d=>`<option value="${d}" ${q.dias===d?'selected':''}>${d} dias</option>`).join('')}</select></div>
      <div class="campo"><label>Projeto</label><select id="qa-proj">${optProj}</select></div>
      <div class="campo"><label>&nbsp;</label><button class="btn primario" id="qa-analisar" ${q.carregando?'disabled':''}>${q.carregando?'Analisando…':'🤖 Analisar qualidade'}</button></div>
      ${q.dados?'<div class="campo"><label>&nbsp;</label><button class="btn" id="qa-refresh" data-tip="Ignora o cache (10 min) e reanalisa agora">↻ Reanalisar</button></div>':''}
    </div>`;
  let corpo='';
  if(q.carregando) corpo='<div class="estado">🤖 Lendo as boas práticas no Notion e auditando os tickets… (pode levar ~1 min)</div>';
  else if(q.erro) corpo=`<div class="erro"><strong>Falha na análise.</strong> ${esc(q.erro)}</div>`;
  else if(!q.dados) corpo=`<div class="estado">Escolha o período/projeto e clique em <strong>🤖 Analisar qualidade</strong>.<br>
      <span class="small">A IA lê as boas práticas <strong>direto do Notion (TI-04-006)</strong> — atualizou o documento lá, a análise acompanha — e audita cada ticket criado no período, com um <strong>menu de ações</strong> para corrigir na hora.</span></div>`;
  else {
    const d=q.dados;
    const fonteBadge=d.fonte==='notion'
      ?`<a class="badge" href="${escA(d.url)}" target="_blank" rel="noopener" data-tip="Rubrica lida AO VIVO desta página do Notion — atualize o documento e a próxima análise acompanha">📘 rubrica: Notion TI-04-006 ↗</a>`
      :`<span class="badge venc-passado" data-tip="A página pública do Notion não pôde ser lida agora — usando a cópia local (snapshot) das boas práticas">📘 rubrica: cópia local</span>`;
    const media=d.tickets.length?Math.round(d.tickets.reduce((s,t)=>s+t.nota,0)/d.tickets.length):0;
    const nCrit=d.tickets.filter(t=>t.sinal==='critico').length, nAte=d.tickets.filter(t=>t.sinal==='atencao').length;
    corpo=`
      <div class="ia-geral" style="margin:4px 0 12px"><strong>Visão geral da IA:</strong> ${esc(d.geral||'—')}<span class="spacer"></span>${fonteBadge}</div>
      <div class="kpis ts-kpis">
        <div class="kpi a"><div class="v">${d.tickets.length}</div><div class="l">Tickets auditados (${d.dias}d${d.projeto?' · '+esc(d.projeto):''})</div></div>
        <div class="kpi ${media>=80?'a':(media>=50?'t':'w')}"><div class="v">${media}</div><div class="l">Nota média</div></div>
        <div class="kpi w"><div class="v">${nCrit}</div><div class="l">Críticos (&lt;50)</div></div>
        <div class="kpi t"><div class="v">${nAte}</div><div class="l">Atenção (50–79)</div></div>
      </div>
      <div class="qa-lista">${d.tickets.map(qaCard).join('')||'<div class="estado">Nenhum ticket criado no período.</div>'}</div>`;
  }
  // Indicadores semanais (salvos na config do time a cada análise) — recorte do projeto atual.
  const hist=(Array.isArray(cfg.qualidadeHist)?cfg.qualidadeHist:[]).filter(h=>(h.projeto||'')===(q.projeto||''));
  const histHtml=hist.length?`
    <div class="muted small" style="font-weight:600;margin:18px 0 4px">📈 Indicadores semanais
      <span class="muted" style="font-weight:400">(salvos automaticamente a cada análise — 1 registro por semana · ${q.projeto?('projeto '+esc(q.projeto)):'todos os projetos'})</span></div>
    <div class="pl-wrap"><table class="pl-tab"><thead><tr><th>Semana</th><th class="num">Auditados</th><th class="num">Nota média</th><th class="num">Bons</th><th class="num">Atenção</th><th class="num">Críticos</th><th class="num">Sem vencimento</th><th class="num">Sem responsável</th></tr></thead>
      <tbody>${hist.slice(0,26).map(h=>`<tr><td>${esc(fmtBR(h.sem))} <span class="muted small">(${esc(String(h.dias||'?'))}d)</span></td>
        <td class="num">${h.n}</td>
        <td class="num"><span class="aloc-badge ${h.media>=80?'saud':(h.media>=50?'aten':'crit')}">${h.media}</span></td>
        <td class="num">${h.bons!=null?h.bons:'—'}</td><td class="num">${h.atencao}</td><td class="num">${h.criticos}</td>
        <td class="num">${h.semVenc}</td><td class="num">${h.semResp}</td></tr>`).join('')}</tbody></table></div>`
    :'';
  cont.replaceChildren(el(`<div><div class="card full">
      <h2>🔎 Qualidade dos Tickets <span>auditoria por IA × boas práticas TI-04-006 · menu de ações por ticket</span></h2>
      ${controles}${corpo}${histHtml}
    </div></div>`));
}
// Modal de comentário com o feedback sugerido pela IA (editável antes de publicar).
// mencao (opcional) = {id, nome}: o comentário sai com a @menção à pessoa no início.
let _qaMencao=null;
function abreQaComentar(k, acao, mencao){
  const id=idApontar(); _qaMencao=mencao||null;
  abreModal(`<h2>${mencao?'📣 Avisar no':'💬 Comentar no'} ${esc(k)}</h2>
    <div class="muted small">${mencao?`O comentário será publicado <strong>marcando @${esc(mencao.nome)}</strong> (o Jira notifica a pessoa) e com o link das boas práticas.`
      :'Feedback sugerido pela IA com base nas boas práticas'} — <strong>edite à vontade</strong>; sai como comentário no ticket, com o seu usuário.</div>
    <textarea id="qa-com-texto" class="pl-texto" style="min-height:170px;margin-top:10px">${esc(acao.texto||acao.rotulo||'')}</textarea>
    <div style="display:flex;gap:10px;margin-top:12px">
      <button class="btn" id="qa-com-cancel">Cancelar</button>
      ${id?`<button class="btn primario" id="qa-com-pub" data-qa-com-k="${escA(k)}">${mencao?`📣 Publicar marcando @${esc(mencao.nome.split(' ')[0])}`:'Publicar comentário'}</button>`
          :'<button class="btn" data-ap-act="config-id">Identificar-se para comentar</button>'}
    </div>
    <div class="ap-fb" id="qa-com-fb" hidden></div>`);
}
// Texto do aviso ao dono do ticket: problemas + link das boas práticas.
function qaTextoAviso(t, urlBp){
  const probs=t.problemas.map(p=>`• ${p.principio}: ${p.detalhe}`).join('\n');
  return `este ticket precisa de alguns ajustes para seguir as nossas boas práticas de criação de tickets (TI-04-006):\n\n${probs}\n\n`+
    `Boas práticas: ${urlBp}\n\nQualquer dúvida me chama! (aviso gerado pela Análise de Qualidade do painel Insights)`;
}
function publicaQaComentario(k){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const texto=(document.getElementById('qa-com-texto')||{value:''}).value.trim();
  const fb=document.getElementById('qa-com-fb');
  if(!texto){ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent='Escreva o comentário.'; } return; }
  const bt=document.getElementById('qa-com-pub'); if(bt){ bt.disabled=true; bt.textContent='Publicando…'; }
  const men=_qaMencao;
  const body={comentar:true,issue:k,texto,email:id.email,token:id.token};
  if(men&&men.id){ body.mencionar=men.id; body.mencionarNome=men.nome||''; }
  fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body)}).then(r=>r.json()).then(j=>{
      if(j.ok){ _qaMencao=null;
        logAcao({acao:men?'qualidade-avisar':'qualidade-feedback', t:k, para:men?('@'+(men.nome||'')+' marcado no comentário'):'comentário publicado', ok:true});
        toast(`✓ ${men?'Aviso publicado marcando @'+(men.nome||''):'Feedback publicado'} em ${k}.`,'ok'); fechaModal(); }
      else { if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=humanizaErro(j.erro||'Falha ao comentar.'); }
        if(bt){ bt.disabled=false; bt.textContent='Publicar'; } }
    }).catch(e=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent='Erro de rede: '+(e.message||e); }
      if(bt){ bt.disabled=false; bt.textContent='Publicar'; } });
}
// Indicadores semanais: cada análise salva (na config do time) 1 registro por
// semana × projeto — a última análise da semana vale.
function qaRegistraSemana(d){
  try{
    if(!d || !Array.isArray(d.tickets) || !d.tickets.length) return;
    const ts=d.tickets;
    const ent={ sem: semChave(hojeSP()), projeto: d.projeto||'', dias: d.dias||0, n: ts.length,
      media: Math.round(ts.reduce((s,t)=>s+(Number(t.nota)||0),0)/ts.length),
      bons: ts.filter(t=>t.sinal==='bom').length,
      atencao: ts.filter(t=>t.sinal==='atencao').length,
      criticos: ts.filter(t=>t.sinal==='critico').length,
      semVenc: ts.filter(t=>!t.vencimento).length,
      semResp: ts.filter(t=>!t.responsavel).length,
      quando: new Date().toISOString() };
    cfg.qualidadeHist=Array.isArray(cfg.qualidadeHist)?cfg.qualidadeHist:[];
    const i=cfg.qualidadeHist.findIndex(h=>h.sem===ent.sem && (h.projeto||'')===(ent.projeto||''));
    if(i>=0) cfg.qualidadeHist[i]=ent; else cfg.qualidadeHist.push(ent);
    cfg.qualidadeHist.sort((a,b)=>String(b.sem).localeCompare(String(a.sem)));
    if(cfg.qualidadeHist.length>104) cfg.qualidadeHist.length=104;
    salvaCfg();
  }catch(e){}
}

// ================== 🕵️ Auditoria de Tickets (validações TI-04-014, por pessoa) ==================
// A pessoa é escolhida na tela; o servidor junta apontamentos (Clockwork), detalhes
// dos tickets (Jira) e a alocação planejada, e a IA aplica as regras lidas AO VIVO
// da página TI-04-014 — o resultado separa o que está correto, o que não está e as
// ações para ajustar (com botões acionáveis).
function audAnalisa(force){
  const q=estado.audit;
  if(!q.accountId){ q.erro='Escolha a pessoa que você quer auditar.'; q.dados=null; renderAudit(); return; }
  const nome=((pessoasUnidas()[q.accountId]||{}).nome)||'';
  q.carregando=true; q.erro=''; renderAudit();
  fetch('/api/resumo?acao=auditoria',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({accountId:q.accountId, nome, dias:q.dias, nocache:force?1:0})})
    .then(r=>r.json()).then(j=>{ q.carregando=false;
      if(!j.ok){ q.erro=humanizaErro(j.erro||'Falha na auditoria.'); q.dados=null; }
      else q.dados=j;
      if(estado.vista==='audit') renderAudit();
    }).catch(e=>{ q.carregando=false; q.erro=humanizaErro(e); if(estado.vista==='audit') renderAudit(); });
}
// Ação sem ticket específico (ex.: criar ticket avisando erro da automação): modal
// com o texto sugerido pronto para copiar + atalho para a Criação de Ticket.
function abreAudAcao(a){
  abreModal(`<h2>🔧 ${esc(a.rotulo)}</h2>
    <div class="muted small">Sugestão da auditoria (TI-04-014) — copie/ajuste o texto e execute a ação.</div>
    <textarea id="aud-acao-texto" class="pl-texto" style="min-height:150px;margin-top:10px">${esc(a.texto||a.rotulo||'')}</textarea>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
      <button class="btn" id="aud-acao-copia">📋 Copiar texto</button>
      ${a.tipo==='criar'?'<button class="btn primario" id="aud-acao-criar">📝 Abrir Criação de Ticket</button>':''}
      <button class="btn" id="aud-acao-fechar">Fechar</button>
    </div>`);
}
function renderAudit(){
  const cont=document.getElementById('conteudo');
  const q=estado.audit;
  const pessoas=Object.entries(pessoasUnidas()).map(([a,o])=>[a,(o&&o.nome)||a])
    .sort((x,y)=>x[1].localeCompare(y[1],'pt'));
  const optP='<option value="">— escolha a pessoa —</option>'+pessoas.map(([a,n])=>
    `<option value="${escA(a)}" ${q.accountId===a?'selected':''}>${esc(n)}</option>`).join('');
  const controles=`<div class="ap-filtros">
      <div class="campo"><label>Pessoa a auditar</label><select id="aud-pessoa">${optP}</select></div>
      <div class="campo"><label>Período</label><select id="aud-dias">${[3,7,14,30].map(d=>`<option value="${d}" ${q.dias===d?'selected':''}>últimos ${d} dias</option>`).join('')}</select></div>
      <div class="campo"><label>&nbsp;</label><button class="btn primario" id="aud-analisar" ${q.carregando?'disabled':''}>${q.carregando?'Auditando…':'🕵️ Auditar apontamentos'}</button></div>
      ${q.dados?'<div class="campo"><label>&nbsp;</label><button class="btn" id="aud-refresh" data-tip="Ignora o cache (10 min) e reaudita agora">↻ Reauditar</button></div>':''}
    </div>`;
  let corpo='';
  if(q.carregando) corpo='<div class="estado">🕵️ Lendo as validações (TI-04-014) no Notion e auditando os apontamentos… (pode levar ~1 min)</div>';
  else if(q.erro) corpo=`<div class="erro"><strong>Falha na auditoria.</strong> ${esc(q.erro)}</div>`;
  else if(!q.dados) corpo=`<div class="estado">Escolha a <strong>pessoa</strong> e clique em <strong>🕵️ Auditar apontamentos</strong>.<br>
      <span class="small">A IA lê as validações <strong>direto do Notion (TI-04-014)</strong> — atualizou o documento lá, a auditoria acompanha —
      e verifica os apontamentos da pessoa: reuniões (automação, participantes, projeto certo, atraso),
      apontamentos por dia e o planejado × realizado da alocação. O resultado separa <strong>o que está correto</strong>,
      <strong>o que não está</strong> e <strong>as ações para ajustar</strong>.</span></div>`;
  else {
    const d=q.dados;
    const fonteBadge=d.fonte==='notion'
      ?`<a class="badge" href="${escA(d.url)}" target="_blank" rel="noopener" data-tip="Regras lidas AO VIVO desta página do Notion — atualize o documento e a próxima auditoria acompanha">📘 regras: Notion TI-04-014 ↗</a>`
      :`<span class="badge venc-passado" data-tip="A página do Notion não pôde ser lida agora (publique-a na web para leitura ao vivo) — usando a cópia local das regras">📘 regras: cópia local</span>`;
    const nCrit=d.incorretos.filter(x=>x.gravidade==='critico').length;
    const nAte=d.incorretos.length-nCrit;
    const linkK=(k)=>`<a href="${jiraBase()}/browse/${encodeURIComponent(k)}" target="_blank" rel="noopener">${esc(k)}</a>`;
    const okHtml=d.corretos.length
      ?`<ul class="qa-probs aud-ok">${d.corretos.map(c=>`<li><strong>${esc(c.titulo)}</strong> — ${esc(c.detalhe)}</li>`).join('')}</ul>`
      :'<div class="muted small">A IA não destacou pontos em conformidade neste período.</div>';
    const badHtml=d.incorretos.length
      ?d.incorretos.map(x=>`<div class="aud-prob ${escA(x.gravidade)}">
          <div class="aud-prob-t"><span class="aloc-badge ${x.gravidade==='critico'?'crit':'aten'}">${x.gravidade==='critico'?'crítico':'atenção'}</span>
            <strong>${esc(x.regra)}</strong></div>
          <div class="aud-prob-d">${esc(x.detalhe)}</div>
          ${x.tickets.length?`<div class="aud-prob-k">🎟 ${x.tickets.map(linkK).join(' · ')}</div>`:''}
        </div>`).join('')
      :'<div class="pl-res-ok">✓ Nenhuma não conformidade encontrada no período.</div>';
    const icone={comentar:'💬',vencimento:'📅',status:'🔀',convidar:'👥',reclassificar:'🔁',criar:'➕',outro:'🛠'};
    const acoesHtml=d.acoes.length
      ?d.acoes.map((a,i)=>`<div class="aud-acao">
          <button class="btn qa-act" data-aud-act="${i}" data-tip="${escA((a.texto||a.rotulo||'').slice(0,220))}">${icone[a.tipo]||'▸'} ${esc(a.rotulo)}</button>
          ${a.ticket?`<span class="muted small">${linkK(a.ticket)}</span>`:''}
        </div>`).join('')
      :'<div class="muted small">Sem ações sugeridas — nada a ajustar. 🎉</div>';
    corpo=`
      <div class="ia-geral" style="margin:4px 0 12px"><strong>Balanço da IA — ${esc(d.pessoa.nome)} (${esc(fmtBR(d.de))} → ${esc(fmtBR(d.ate))}):</strong>
        ${esc(d.resumo||'—')}<span class="spacer"></span>${fonteBadge}</div>
      <div class="kpis ts-kpis">
        <div class="kpi t"><div class="v">${esc(String(d.stats.horas))}h</div><div class="l">Horas apontadas (${d.dias}d)</div></div>
        <div class="kpi t"><div class="v">${d.stats.apontamentos}</div><div class="l">Apontamentos</div></div>
        <div class="kpi t"><div class="v">${d.stats.diasComApontamento}</div><div class="l">Dias com apontamento</div></div>
        <div class="kpi t"><div class="v">${d.stats.reunioes}</div><div class="l">Reuniões apontadas</div></div>
        <div class="kpi ${nCrit?'w':'a'}"><div class="v">${nCrit}</div><div class="l">Achados críticos</div></div>
        <div class="kpi t"><div class="v">${nAte}</div><div class="l">Pontos de atenção</div></div>
      </div>
      <div class="aud-grid">
        <div class="card aud-card ok"><h2>✅ O que está correto</h2>${okHtml}</div>
        <div class="card aud-card bad"><h2>⚠️ O que não está correto</h2>${badHtml}</div>
        <div class="card aud-card act"><h2>🔧 Ações para ajustar</h2>${acoesHtml}</div>
      </div>`;
  }
  cont.replaceChildren(el(`<div><div class="card full">
      <h2>🕵️ Auditoria de Tickets <span>validações diárias de apontamentos por pessoa · IA × TI-04-014</span></h2>
      ${controles}${corpo}
    </div></div>`));
}
document.getElementById('conteudo').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  const q=estado.audit;
  if(t.id==='aud-analisar'){ audAnalisa(false); }
  else if(t.id==='aud-refresh'){ audAnalisa(true); }
  else if(t.hasAttribute('data-aud-act')){
    const a=q.dados&&q.dados.acoes[+t.getAttribute('data-aud-act')]; if(!a) return;
    escondeTip();
    if(a.tipo==='vencimento'&&a.ticket) abreModalReprog([a.ticket],'');
    else if(a.tipo==='criar') abreAudAcao(a);        // criar ticket novo (mesmo citando um existente)
    else if(a.ticket) abreQaComentar(a.ticket, a);   // comentar/status/convidar/reclassificar → feedback no ticket
    else abreAudAcao(a);
  }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  const t=e.target; if(!t||!t.id) return;
  if(t.id==='aud-pessoa'){ estado.audit.accountId=t.value; estado.audit.erro=''; }
  else if(t.id==='aud-dias'){ estado.audit.dias=Number(t.value)||7; }
});
document.getElementById('modal-body').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.id==='aud-acao-fechar'){ fechaModal(); }
  else if(t.id==='aud-acao-criar'){ fechaModal(); vaiPara('planejar'); }
  else if(t.id==='aud-acao-copia'){
    const tx=(document.getElementById('aud-acao-texto')||{value:''}).value;
    Promise.resolve().then(()=>navigator.clipboard.writeText(tx))
      .then(()=>toast('✓ Texto copiado.','ok'))
      .catch(()=>toast('Não foi possível copiar automaticamente — selecione e copie o texto.','err'));
  }
});

// ================== 📍 Meu dia (timetracking assistido por IA) ==================
// A ponte (public/meudia-activitywatch.mjs, baixável do próprio site) envia os blocos de atividade do Mac;
// aqui a IA sugere, para cada período, ONDE apontar (ticket recente) ou ONDE criar
// o ticket (caminho da árvore) — com botões de 1 clique.
async function mdContexto(){
  const id=idApontar(); const hoje=hojeSP();
  // Projetos (catálogo) + tickets recentes da pessoa (últimos 14 dias) + alocações dela.
  await garanteProjetos().catch(()=>{});
  const projetos=(_projetosCache||[]).map(p=>({key:p.key,nome:p.nome||'',categoria:p.categoria||''}));
  let recentes=[];
  try{
    const j=await fetch(`/api/tempo?desde=${voltaDias(hoje,13)}&ate=${hoje}`).then(r=>r.json());
    const nomes=(j&&j.resumos)||{};
    const por={};
    ((j&&j.worklogs)||[]).filter(w=>w.a===id.accountId&&w.k).forEach(w=>{
      const r=por[w.k]=por[w.k]||{k:w.k,resumo:nomes[w.k]||'',projeto:w.p||'',seg:0};
      r.seg+=Number(w.s)||0; });
    recentes=Object.values(por).sort((a,b)=>b.seg-a.seg).slice(0,25);
  }catch(e){}
  const alocacoes=(cfg.alocacoes||[]).filter(a=>a&&a.accountId===id.accountId&&a.projeto)
    .map(a=>({projeto:a.projeto,horasSemana:Number(a.hSemana)||0})).slice(0,20);
  return { projetos, recentes, alocacoes };
}
async function mdAnalisa(force){
  const md=estado.meudia;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  if(md.carregando) return;
  md.carregando=true; md.erro=''; renderMeuDia();
  try{
    const contexto=await mdContexto();
    const j=await fetch('/api/resumo?acao=meudia',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({accountId:id.accountId, contexto, nocache:force?1:0})}).then(r=>r.json());
    md.carregando=false;
    if(!j.ok){ md.erro=humanizaErro(j.erro||'Falha na análise.'); md.dados=null; }
    else md.dados=j;
  }catch(e){ md.carregando=false; md.erro=humanizaErro(e); md.dados=null; }
  if(estado.vista==='meudia') renderMeuDia();
}
// Aponta a sugestão com 1 clique (worklog no dia dos blocos, com a atividade como comentário).
async function mdAponta(i, btn){
  const md=estado.meudia; const s=md.dados&&md.dados.sugestoes[i]; if(!s||!s.ticket) return;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const seg=parseTempo(s.tempo||'');
  if(seg==null||seg<60){ toast('Tempo sugerido inválido — ajuste no Apontar.','err'); return; }
  if(btn){ btn.disabled=true; btn.textContent='Apontando…'; }
  try{
    const j=await fetch('/api/apontar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({issue:s.ticket, segundos:seg, inicio:md.dados.dia, comentario:s.atividade||'',
        email:id.email, token:id.token})}).then(r=>r.json());
    if(j.ok){ s.feito=true; logAcao({acao:'meudia-apontar', t:s.ticket, para:s.tempo, ok:true});
      toast(`✓ ${s.tempo} apontado em ${s.ticket}.`,'ok'); invalidaCacheDados(); renderMeuDia(); }
    else { toast(humanizaErro(j.erro||'Falha ao apontar.'),'err'); if(btn){ btn.disabled=false; btn.textContent='Tentar de novo'; } }
  }catch(e){ toast('Erro de rede: '+(e.message||e),'err'); if(btn){ btn.disabled=false; btn.textContent='Tentar de novo'; } }
}
// A ponte é servida pelo próprio painel (public/meudia-activitywatch.mjs); em
// ambiente local (file://) as instruções apontam para a URL de produção.
function mdPainelBase(){ return /^https?:/.test(location.origin)?location.origin:'https://jirainsight.vercel.app'; }
function renderMeuDia(){
  const cont=document.getElementById('conteudo');
  const md=estado.meudia; const id=idApontar();
  const setup=`<details class="arv-defs" ${md.dados&&!md.dados.semDados?'':'open'}>
      <summary>🔌 Como conectar o seu Mac (uma vez)</summary>
      <ol class="md-setup">
        <li>Instale o <a href="https://activitywatch.net" target="_blank" rel="noopener">ActivityWatch ↗</a> (gratuito, open source — registra app e janela em uso, <strong>100% local</strong>).</li>
        <li>Baixe a ponte (uma linha no Terminal — salva na sua pasta pessoal):<br>
          <code>curl -fsSL -o ~/meudia-activitywatch.mjs ${escA(mdPainelBase())}/meudia-activitywatch.mjs</code></li>
        <li>No fim do dia, rode no Terminal (usa o MESMO e-mail + token do painel):<br>
          <code>JIRA_EMAIL=${esc((id&&id.email)||'voce@dexterity.com.br')} JIRA_TOKEN=seu-token node ~/meudia-activitywatch.mjs --enviar</code></li>
        <li>Volte aqui e clique em <strong>🤖 Analisar meu dia</strong>. <span class="muted">Sem <code>--enviar</code> o script só mostra a prévia; só saem o app e o título da janela de blocos com 5+ min.</span></li>
      </ol>
    </details>`;
  let corpo='';
  if(!id) corpo=`<div class="estado">Identifique-se para usar o Meu dia (e-mail + token do Jira).<br>
      <button class="btn primario" data-ap-act="config-id" style="margin-top:10px">Identificar-se</button></div>`;
  else if(md.carregando) corpo='<div class="estado">🤖 Lendo os blocos do seu dia e montando as sugestões… (pode levar ~1 min)</div>';
  else if(md.erro) corpo=`<div class="erro"><strong>Falha na análise.</strong> ${esc(md.erro)}</div>`;
  else if(!md.dados) corpo=`<div class="estado">Envie os blocos do seu dia pela ponte (passo a passo acima) e clique em
      <strong>🤖 Analisar meu dia</strong>.</div>`;
  else if(md.dados.semDados) corpo=`<div class="estado">Ainda não recebi blocos seus. Rode a ponte no seu Mac (passo a passo acima) e analise de novo.</div>`;
  else {
    const d=md.dados;
    const totalSeg=d.blocos.reduce((s,b)=>s+(b.seg||0),0);
    const icone={apontar:'⏱',criar:'🌳',ignorar:'—'};
    const sugs=d.sugestoes.filter(s=>s.acao!=='ignorar');
    const ignoradas=d.sugestoes.length-sugs.length;
    const sugHtml=sugs.length?sugs.map((s)=>{
      const i=d.sugestoes.indexOf(s);
      const acao = s.feito ? `<span class="pl-res-ok" style="padding:4px 10px">✓ apontado</span>`
        : s.acao==='apontar'
          ? `<button class="btn primario" data-md-apontar="${i}">⏱ Apontar ${esc(s.tempo)} em ${esc(s.ticket)}</button>`
          : `<button class="btn primario" data-md-criar="${i}">🌳 Criar pelo caminho certo</button>`;
      return `<div class="aud-prob ${s.acao==='apontar'?'':'critico'}" style="border-left-color:${s.acao==='apontar'?'#1E7A46':'#009994'}">
        <div class="aud-prob-t"><span class="badge">${esc(s.periodo)}</span><strong>${icone[s.acao]||''} ${esc(s.atividade)}</strong>
          <span class="spacer"></span><span class="badge com-horas">${esc(s.tempo)}</span></div>
        <div class="aud-prob-d">${esc(s.justificativa)}${s.acao==='criar'?` <span class="muted">· caminho: <strong>${esc(s.caminhoArvore||'árvore de decisão')}</strong>${s.projeto?` · projeto ${esc(s.projeto)}`:''}</span>`:''}</div>
        <div class="aud-acao" style="margin-top:8px">${acao}
          ${s.ticket?`<span class="muted small"><a href="${jiraBase()}/browse/${encodeURIComponent(s.ticket)}" target="_blank" rel="noopener">${esc(s.ticket)} ↗</a></span>`:''}</div>
      </div>`;
    }).join(''):'<div class="estado">A IA não gerou sugestões para este dia.</div>';
    const timeline=`<div class="ts-wrap" style="max-height:320px;overflow:auto"><table class="rc-tab">
      <thead><tr><th>Período</th><th>App</th><th>Janela</th><th class="num">Duração</th></tr></thead>
      <tbody>${d.blocos.map(b=>`<tr><td style="white-space:nowrap">${esc(b.inicio)}–${esc(b.fim)}</td>
        <td>${esc(b.app)}</td><td class="muted small">${esc(b.titulo)}</td><td class="num">${fmtH(b.seg)}</td></tr>`).join('')}</tbody></table></div>`;
    corpo=`
      <div class="ia-geral" style="margin:4px 0 12px"><strong>Balanço da IA — ${esc(fmtBR(d.dia))}:</strong> ${esc(d.resumo||'—')}</div>
      <div class="kpis ts-kpis">
        <div class="kpi t"><div class="v">${fmtH(totalSeg)}</div><div class="l">Atividade registrada</div></div>
        <div class="kpi t"><div class="v">${d.blocos.length}</div><div class="l">Blocos</div></div>
        <div class="kpi t"><div class="v">${sugs.filter(s=>s.acao==='apontar').length}</div><div class="l">Sugestões de apontamento</div></div>
        <div class="kpi w"><div class="v">${sugs.filter(s=>s.acao==='criar').length}</div><div class="l">Tickets a criar</div></div>
      </div>
      <div class="aud-grid" style="grid-template-columns:1fr">
        <div class="card aud-card act"><h2>🤖 Sugestões <span>confira antes de apontar — a IA pode errar${ignoradas?` · ${ignoradas} período(s) ignorado(s) (pessoal/ocioso)`:''}</span></h2>${sugHtml}</div>
        <div class="card"><h2>🕓 Timeline do dia <span>blocos recebidos do seu Mac (app + janela)</span></h2>${timeline}</div>
      </div>`;
  }
  cont.replaceChildren(el(`<div><div class="card full">
      <h2>📍 Meu dia <span>timetracking assistido — seus blocos de atividade + sugestões da IA de onde apontar e criar tickets</span></h2>
      <div class="ap-filtros">
        <div class="campo"><label>&nbsp;</label><button class="btn primario" id="md-analisar" ${md.carregando?'disabled':''}>${md.carregando?'Analisando…':'🤖 Analisar meu dia'}</button></div>
        ${md.dados&&!md.dados.semDados?'<div class="campo"><label>&nbsp;</label><button class="btn" id="md-refresh" data-tip="Ignora o cache (10 min) e reanalisa">↻ Reanalisar</button></div>':''}
      </div>
      ${corpo}
      ${setup}
    </div></div>`));
}
document.getElementById('conteudo').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.id==='md-analisar'){ mdAnalisa(false); }
  else if(t.id==='md-refresh'){ mdAnalisa(true); }
  else if(t.hasAttribute('data-md-apontar')){ escondeTip(); mdAponta(+t.getAttribute('data-md-apontar'), t); }
  else if(t.hasAttribute('data-md-criar')){
    const s=estado.meudia.dados&&estado.meudia.dados.sugestoes[+t.getAttribute('data-md-criar')]; if(!s) return;
    escondeTip();
    // Abre a árvore de decisão com o resumo do ticket já preenchido.
    estado.planejar.arv=null; const a=arvEstado();
    a.form.resumo=s.resumoTicket||s.atividade||'';
    vaiPara('ondecrio');
    toast(`🌳 Siga o caminho: ${s.caminhoArvore||'responda as perguntas'} — o resumo já está preenchido.`,'ok');
  }
});

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
// ---- Qualidade dos Tickets (IA): analisar + menu de ações por ticket ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  const q=estado.qualidade;
  if(t.id==='qa-analisar'){ qaAnalisa(false); }
  else if(t.id==='qa-refresh'){ qaAnalisa(true); }
  else if(t.hasAttribute('data-qa-abrir')){ window.open(`${jiraBase()}/browse/${encodeURIComponent(t.getAttribute('data-qa-abrir'))}`,'_blank'); }
  else if(t.hasAttribute('data-qa-avisar')){
    const k=t.getAttribute('data-qa-avisar');
    const tk=((q.dados&&q.dados.tickets)||[]).find(x=>x.k===k); if(!tk) return;
    const alvoId=tk.respId||tk.relatorId; const alvoNome=(tk.respId?tk.responsavel:tk.relator)||'';
    if(!alvoId) return;
    escondeTip();
    abreQaComentar(k, { texto: qaTextoAviso(tk, (q.dados&&q.dados.url)||'') }, { id:alvoId, nome:alvoNome });
  }
  else if(t.hasAttribute('data-qa-act')){
    const k=t.getAttribute('data-qa-k'); const i=+t.getAttribute('data-qa-i');
    const tk=((q.dados&&q.dados.tickets)||[]).find(x=>x.k===k); const a=tk&&tk.acoes[i]; if(!a) return;
    escondeTip();
    if(a.tipo==='vencimento'){ abreModalReprog([k],''); }
    else if(a.tipo==='atribuir'){ abreModalAtribuir([k]); }
    else { abreQaComentar(k, a); }   // comentar / editar / dividir / status → feedback no ticket
  }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  const t=e.target; if(!t||!t.id) return;
  if(t.id==='qa-dias'){ estado.qualidade.dias=Number(t.value)||14; }
  else if(t.id==='qa-proj'){ estado.qualidade.projeto=t.value; }
});
document.getElementById('modal-body').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.id==='qa-com-cancel'){ fechaModal(); }
  else if(t.id==='qa-com-pub'){ publicaQaComentario(t.getAttribute('data-qa-com-k')); }
});
