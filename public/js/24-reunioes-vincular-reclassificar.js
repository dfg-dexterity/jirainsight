// Jira Insights · 24 · 🔗 VINCULAR REUNIÕES a tickets de AMS e 🔁 RECLASSIFICAR (mover tickets de reunião).
// ============== VINCULAR REUNIÕES A TICKETS DE AMS (menu Operação) ==============
// Fluxo: escolhe a reunião → assistente (modal) → cria ticket de apoio funcional OU
// comenta num ticket aberto, com worklog opcional → EXCLUI a reunião.
function carregaReuVinc(forca){
  const rv=estado.reuvinc;
  rv.carregando=true; rv.erro='';
  fetch(`/api/reunioes?projeto=${encodeURIComponent(rv.origem)}${forca?'&nocache=1':''}`)
    .then(r=>r.json()).then(j=>{ rv.carregando=false;
      if(j.erro) rv.erro=j.erro; else rv.dados=j;
      if(estado.vista==='reuvinc') renderReuVinc();
    }).catch(e=>{ rv.carregando=false; rv.erro=String(e.message||e); if(estado.vista==='reuvinc') renderReuVinc(); });
}
let _rv=null;   // estado do assistente (só enquanto o modal está aberto)
// SEM restrição de destino: qualquer projeto serve nos dois fluxos. No fluxo de
// reunião os AMS vêm primeiro (e são o padrão), por ser o caso mais comum.
function rvProjetosAMS(){ const ps=_projetosCache||[];
  const ams=ps.filter(p=>ehCategoriaAMS(p.categoria));
  return [...ams, ...ps.filter(p=>!ehCategoriaAMS(p.categoria))]; }
function rvTipoPadrao(p){ const ts=((p&&p.tipos)||[]).filter(t=>!t.subtarefa && t.nivel===0);
  const ap=ts.find(t=>/apoio|funcional|suporte/i.test(t.nome))||ts.find(t=>/task|tarefa/i.test(t.nome)); return String((ap||ts[0]||{}).id||''); }
function abreRvWizard(key, generico){
  _rv={ key, m:null, erro:'', modo:'criar', projeto:'', tipoId:'', resumo:'', horas:1, worklog:true,
        ticket:'', tbusca:'', abertos:null, carregandoAb:false, executando:false, resultado:null,
        generico:!!generico };
  abreModal(`<h2>${_rv.generico?'Transferir ticket':'Vincular reunião'}</h2><div class="estado">Carregando detalhes…</div>`);
  Promise.all([ fetch(`/api/reunioes?detalhe=${encodeURIComponent(key)}`).then(r=>r.json()), garanteProjetos().catch(()=>null) ])
    .then(([j])=>{ if(!_rv||_rv.key!==key) return;
      if(j.erro){ _rv.erro=j.erro; renderRvModal(); return; }
      _rv.m=j;
      const p0=rvProjetosDo()[0];
      _rv.projeto=(p0&&p0.key)||''; _rv.tipoId=rvTipoPadrao(p0);
      _rv.resumo=(_rv.generico?(j.resumo||key):`Apoio funcional — ${j.resumo||key}`).slice(0,255);
      _rv.horas=j.totalSeg>0? Math.max(0.5, Math.round(j.totalSeg/360)/10) : 1;
      renderRvModal();
    }).catch(e=>{ if(_rv){ _rv.erro=String(e.message||e); renderRvModal(); } });
}
// Projetos que o assistente oferece: AMS no fluxo de reunião; TODOS na transferência.
function rvProjetosDo(){ return (_rv&&_rv.generico) ? (_projetosCache||[]) : rvProjetosAMS(); }
function rvCarregaAbertos(){
  const rv=_rv; if(!rv) return;
  if(!rv.projeto){ renderRvModal(); return; }
  rv.carregandoAb=true; rv.abertos=null; renderRvModal();
  fetch(`/api/reunioes?abertos=${encodeURIComponent(rv.projeto)}`).then(r=>r.json()).then(j=>{
    if(!_rv) return; _rv.carregandoAb=false;
    if(j.erro){ _rv.abertos=[]; _rv.erro=j.erro; } else { _rv.abertos=j.tickets||[]; }
    if(_rv.ticket && !(_rv.abertos||[]).some(t=>t.k===_rv.ticket)) _rv.ticket='';
    renderRvModal();
  }).catch(e=>{ if(_rv){ _rv.carregandoAb=false; _rv.abertos=[]; _rv.erro=String(e.message||e); renderRvModal(); } });
}
function renderRvModal(){
  const rv=_rv; if(!rv) return;
  const G=!!rv.generico;                                   // transferência de ticket (Gestão)
  const ORIG=G?'o ticket':'a reunião';
  const TIT=G?'Transferir ticket para outro':'Vincular reunião a um ticket';
  if(rv.resultado){ const r=rv.resultado; const url=`${jiraBase()}/browse/${encodeURIComponent(r.destino)}`;
    abreModal(`<h2>${G?'Ticket transferido':'Reunião vinculada'}</h2>
      <div class="pl-res-ok">✓ ${r.modo==='criar'?'Ticket criado:':'Comentário registrado em'} <a href="${url}" target="_blank" rel="noopener">${esc(r.destino)} ↗</a></div>
      ${r.worklogOk===false?'<div class="aviso" style="margin-top:8px">O apontamento de horas falhou — registre manualmente no ticket.</div>':''}
      ${r.excluida?`<div class="muted small" style="margin-top:8px">🗑 ${G?'O ticket original foi excluído':'A reunião foi excluída'} do Jira.</div>`:`<div class="aviso" style="margin-top:8px">${esc(r.erro||`A exclusão d${G?'o ticket original':'a reunião'} falhou — exclua manualmente.`)}</div>`}
      <div style="display:flex;gap:10px;margin-top:14px"><button class="btn primario" id="rv-fechar">Fechar</button></div>`);
    return; }
  if(rv.erro && !rv.m){
    abreModal(`<h2>${G?'Transferir ticket':'Vincular reunião'}</h2><div class="erro">${esc(rv.erro)}</div>
      <div style="display:flex;gap:10px;margin-top:12px"><button class="btn" id="rv-fechar">Fechar</button></div>`);
    return; }
  if(!rv.m) return;
  const m=rv.m; const id=idApontar();
  const ams=rvProjetosDo(); const pSel=ams.find(p=>p.key===rv.projeto);
  const horasBox=m.totalSeg>0?`<div class="muted small" style="margin-top:4px">⏱ <strong>${alocH(m.totalSeg/3600)}</strong> apontadas: ${m.horas.map(h=>`${esc(h.nome)} ${alocH(h.seg/3600)}`).join(' · ')}</div>`:'';
  const descBox=m.desc?`<details style="margin-top:6px"><summary class="muted small" style="cursor:pointer">ver descrição ${G?'do ticket':'da reunião'}</summary><div class="muted small" style="white-space:pre-wrap;margin-top:4px">${esc(m.desc.slice(0,1200))}</div></details>`:'';
  const met=`<div class="rv-met"><span class="k">${esc(m.k)}</span> — ${esc(m.resumo)}
    <div class="muted small" style="margin-top:2px">criad${G?'o':'a'} em ${esc(fmtBR(m.criado))}${m.relator?` · por ${esc(m.relator)}`:''} · status ${esc(m.status)}</div>${horasBox}${descBox}</div>`;
  const modoBtns=`<div class="rv-modo">
    <button id="rv-modo-criar" class="${rv.modo==='criar'?'on':''}">➕ Criar ticket novo<br><span class="muted small" style="font-weight:400">${G?'cria um ticket novo no projeto escolhido com os detalhes deste':'não existe ticket — cria como apoio funcional no projeto escolhido'}</span></button>
    <button id="rv-modo-exist" class="${rv.modo==='existente'?'on':''}">🔗 Usar ticket existente<br><span class="muted small" style="font-weight:400">registra ${G?'os detalhes':'a reunião'} nos comentários de um ticket aberto</span></button></div>`;
  const projOpt=ams.map(p=>`<option value="${escA(p.key)}" ${rv.projeto===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('');
  const horasCampos=`<div class="campo"><label>Duração (horas)</label><input type="number" id="rv-horas" value="${rv.horas}" min="0" step="0.5"></div>
      <div class="campo" style="display:flex;align-items:end"><label style="display:flex;gap:6px;align-items:center;font-size:12.5px;margin:0;color:var(--grafite);text-transform:none;letter-spacing:0"><input type="checkbox" id="rv-worklog" ${rv.worklog?'checked':''}> registrar como <strong>meu apontamento</strong> no destino</label></div>`;
  const rotProj=G?'Projeto destino':'Projeto destino (AMS primeiro)';
  let form='';
  if(rv.modo==='criar'){
    const tipos=((pSel&&pSel.tipos)||[]).filter(t=>!t.subtarefa&&t.nivel===0);
    const tipoOpt=tipos.map(t=>`<option value="${escA(String(t.id))}" ${rv.tipoId===String(t.id)?'selected':''}>${esc(t.nome)}</option>`).join('');
    form=`<div class="rv-form">
      <div class="campo"><label>${rotProj}</label><select id="rv-proj">${projOpt||'<option value="">—</option>'}</select></div>
      <div class="campo"><label>Tipo do ticket</label><select id="rv-tipo">${tipoOpt||'<option value="">—</option>'}</select></div>
      <div class="campo full"><label>Resumo do ticket novo</label><input type="text" id="rv-resumo" value="${escA(rv.resumo)}" maxlength="255"></div>
      ${horasCampos}</div>`;
  } else {
    const q=(rv.tbusca||'').toLowerCase();
    const lista=(rv.abertos||[]).filter(t=>!q||(t.k+' '+t.resumo).toLowerCase().includes(q)).slice(0,80);
    const tickOpt='<option value="">— escolha o ticket —</option>'+lista.map(t=>`<option value="${escA(t.k)}" ${rv.ticket===t.k?'selected':''}>${esc(t.k)} — ${esc((t.resumo||'').slice(0,70))} (${esc(t.status)})</option>`).join('');
    form=`<div class="rv-form">
      <div class="campo"><label>${rotProj}</label><select id="rv-proj">${projOpt||'<option value="">—</option>'}</select></div>
      <div class="campo"><label>Filtrar tickets</label><input type="search" id="rv-tbusca" value="${escA(rv.tbusca)}" placeholder="código ou resumo…"></div>
      <div class="campo full"><label>Ticket aberto ${rv.carregandoAb?'(carregando…)':(rv.abertos?`(${rv.abertos.length})`:'')}</label><select id="rv-ticket" ${rv.carregandoAb||!rv.abertos?'disabled':''}>${tickOpt}</select></div>
      ${horasCampos}</div>`;
  }
  const detTxt=G?'os detalhes do ticket':'os detalhes da reunião';
  const passos = rv.modo==='criar'
    ? `<ol class="ap-passos"><li>Cria o ticket em <strong>${esc(rv.projeto||'…')}</strong> com ${detTxt} (data, quem, horas, descrição).</li>${rv.worklog&&rv.horas>0?`<li>Registra <strong>${rv.horas}h</strong> como seu apontamento no ticket novo.</li>`:''}<li>Exclui ${ORIG} <strong>${esc(m.k)}</strong>.</li></ol>`
    : `<ol class="ap-passos"><li>Comenta ${detTxt} (data, quem, horas, descrição) no ticket <strong>${esc(rv.ticket||'…')}</strong>.</li>${rv.worklog&&rv.horas>0?`<li>Registra <strong>${rv.horas}h</strong> como seu apontamento no ticket.</li>`:''}<li>Exclui ${ORIG} <strong>${esc(m.k)}</strong>.</li></ol>`;
  const aviso=`<div class="rv-del">⚠️ Ao confirmar, ${ORIG} <strong>${esc(m.k)}</strong> será <strong>excluíd${G?'o':'a'} do Jira</strong> (não dá para desfazer)${m.totalSeg>0?` — junto com as horas apontadas nel${G?'e':'a'}; elas ficam registradas no texto do destino${rv.worklog?' e no seu apontamento':''}.`:'. Os detalhes ficam registrados no destino.'}</div>`;
  const valido = rv.modo==='criar' ? !!(rv.projeto&&rv.tipoId&&rv.resumo.trim()) : !!rv.ticket;
  const rodape = id
    ? `<div style="display:flex;gap:10px;margin-top:12px"><button class="btn" id="rv-cancelar">Cancelar</button><span class="spacer"></span><button class="btn primario" id="rv-confirm" ${valido&&!rv.executando?'':'disabled'}>${rv.executando?'Executando…':`Confirmar e excluir ${G?'o original':'a reunião'}`}</button></div>`
    : `<div class="ap-id sem" style="margin-top:12px">Para ${G?'transferir':'vincular'}, identifique-se uma vez (e-mail + token de API do Jira).<span class="spacer"></span><button class="btn" data-ap-act="config-id">Identificar-se</button></div>`;
  abreModal(`<h2>${TIT}</h2>${met}${modoBtns}${form}${passos}${aviso}${rv.erro?`<div class="erro">${esc(rv.erro)}</div>`:''}${rodape}`);
}
function rvExecuta(){
  const rv=_rv; const id=idApontar(); if(!rv||!rv.m||!id||rv.executando) return;
  rv.executando=true; rv.erro=''; renderRvModal();
  const body={ vincular:1, email:id.email, token:id.token, reuniao:rv.m.k, modo:rv.modo,
    horas:Number(rv.horas)||0, worklog:!!rv.worklog, ...(rv.generico?{transferir:1}:{}) };
  if(rv.modo==='criar'){ body.projeto=rv.projeto; body.tipoId=rv.tipoId; body.resumo=rv.resumo.trim(); }
  else body.ticket=rv.ticket;
  fetch('/api/reunioes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(r=>r.json()).then(j=>{ if(!_rv) return; _rv.executando=false;
      if(!j.ok){ _rv.erro=j.erro||(rv.generico?'Falha ao transferir.':'Falha ao vincular.'); renderRvModal(); return; }
      logAcao({acao:rv.generico?'transferir ticket':'vincular reunião', t:rv.m.k, para:j.destino||'', motivo:rv.modo==='criar'?'ticket novo':'ticket existente', ok:true});
      _rv.resultado=j; renderRvModal();
      if(rv.generico){
        // O ticket original saiu do Jira: tira das listas da Gestão sem refetch.
        const g=estado.gestao; delete g.sel[rv.m.k];
        if(g.dados&&g.dados.tickets) g.dados.tickets=g.dados.tickets.filter(x=>x.k!==rv.m.k);
        estado.reuvinc.dados=null;
      } else { estado.reuvinc.dados=null; carregaReuVinc(true); }
      // O original foi excluído: a aba Apontar recarrega as listas ao fechar o modal.
      estado.apontar.porData={}; estado.apontar.recentes=null; estado.cache={};
    }).catch(e=>{ if(_rv){ _rv.executando=false; _rv.erro=String(e.message||e); renderRvModal(); } });
}
// ---- 🗂 Reuniões: tela unificada (gestão e reclassificação) ----
// Duas abas sobre as mesmas reuniões abertas: 🔀 Reclassificar (mover de projeto)
// e 🔗 Vincular a tickets (virar apoio AMS/comentário e excluir a reunião).
// Os deep-links ?v=reclassificar e ?v=reuvinc continuam funcionando (cada um abre a sua aba).
function reuTabsHTML(atual){
  return `<div class="reu-tabs">
    <button class="chip${atual==='reclassificar'?' primario-chip':''}" data-reu-tab="reclassificar" data-tip="Mover reuniões para outro projeto, mantendo tipo e status">🔀 Reclassificar</button>
    <button class="chip${atual==='reuvinc'?' primario-chip':''}" data-reu-tab="reuvinc" data-tip="Transformar a reunião em ticket de apoio AMS (ou comentar num ticket aberto) e excluir a reunião">🔗 Vincular a tickets</button>
  </div>`;
}
document.addEventListener('click',(e)=>{
  const b=e.target.closest&&e.target.closest('[data-reu-tab]');
  if(b) vaiPara(b.getAttribute('data-reu-tab'));
});
function renderReuVinc(){
  const cont=document.getElementById('conteudo');
  const rv=estado.reuvinc;
  if(!rv.dados && !rv.carregando && !rv.erro) carregaReuVinc(false);
  if(!_projetosCache) garanteProjetos().catch(()=>{});
  if(rv.erro){
    cont.replaceChildren(el(`<div class="erro"><strong>Falha ao carregar.</strong> ${esc(rv.erro)}
      <button class="btn" id="rv-retry" style="margin-left:10px">Tentar de novo</button></div>`));
    return; }
  if(!rv.dados){ cont.replaceChildren(el(`<div class="estado">Buscando reuniões abertas em ${esc(rv.origem)}…</div>`)); return; }
  const d=rv.dados; const id=idApontar();
  const faixaId = id
    ? `<div class="ap-id">🔗 Vinculando como <strong>${esc(id.nome||id.email)}</strong> <span class="muted small">(cria/comenta e exclui com o seu usuário do Jira)</span><span class="spacer"></span><button class="btn" data-ap-act="trocar-id">Trocar usuário</button></div>`
    : `<div class="ap-id sem">Para vincular reuniões, identifique-se uma vez (e-mail + token de API do Jira).<span class="spacer"></span><button class="btn" data-ap-act="config-id">Identificar-se</button></div>`;
  let lista=d.tickets||[];
  if(rv.busca){ const q=rv.busca.toLowerCase(); lista=lista.filter(t=>(t.k+' '+t.resumo+' '+t.status).toLowerCase().includes(q)); }
  const rows=lista.map(t=>`<tr>
    <td><a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener">${esc(t.k)} ↗</a></td>
    <td class="rc-resumo" title="${escA(t.resumo)}">${esc(t.resumo||'—')}</td>
    <td><span class="badge">${esc(t.status)}</span></td>
    <td class="num"><button class="btn primario" data-rv-vinc="${escA(t.k)}">Vincular →</button></td></tr>`).join('');
  cont.replaceChildren(el(`<div>
    ${faixaId}
    <div class="card full">
      <h2>🗂 Reuniões <span>gestão e reclassificação · ${d.tickets.length} reunião(ões) aberta(s) em ${esc(d.projeto)}</span></h2>
      ${reuTabsHTML('reuvinc')}
      <div class="muted small" style="margin:0 0 10px">Escolha a reunião e o assistente faz o resto: <strong>cria um ticket de apoio funcional</strong> (ou <strong>comenta num ticket aberto</strong>) com os detalhes da reunião e, no fim, <strong>exclui a reunião</strong>.</div>
      <div class="ap-filtros">
        <div class="campo"><label>Projeto das reuniões</label><input type="text" id="rv-origem" value="${escA(rv.origem)}" maxlength="12" style="width:110px"></div>
        <div class="campo"><label>Buscar</label><input type="search" id="rv-busca" placeholder="código, resumo…" value="${escA(rv.busca)}"></div>
        <div class="campo"><label>&nbsp;</label><button class="btn" id="rv-refresh">Atualizar lista</button></div>
      </div>
      <div class="rv-transf">
        <span class="muted small"><b>🔁 Transferir OUTRO ticket</b> (qualquer tipo, não só reunião): informe o número — o assistente copia os detalhes para um ticket novo ou existente, <b>vincula o esforço (horas)</b> ao destino e <b>exclui o original</b>.</span>
        <input type="text" id="rv-transf-key" placeholder="ex.: TAD-123" maxlength="20" style="width:130px;text-transform:uppercase">
        <button class="btn primario" data-rv-transf="1">Transferir →</button>
      </div>
      ${d.tickets.length?`<div class="ts-wrap"><table class="rc-tab"><thead><tr><th>Reunião</th><th>Resumo</th><th>Status</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="4" class="muted small">Nada com esse filtro.</td></tr>'}</tbody></table></div>`
        :`<div class="estado">${esc(d.aviso||`Nenhuma reunião aberta em ${d.projeto}.`)}</div>`}
    </div></div>`));
}
function renderReclass(){
  const cont=document.getElementById('conteudo');
  const rc=estado.reclass;
  if(rc.resultado) return renderReclassResultado();
  if(!rc.dados && !rc.carregando && !rc.erro) carregaReunioes(false);
  if(rc.erro){
    cont.replaceChildren(el(`<div class="erro"><strong>Falha ao carregar.</strong> ${esc(rc.erro)}
      <button class="btn" id="rc-retry" style="margin-left:10px">Tentar de novo</button></div>`));
    return;
  }
  if(!rc.dados){ cont.replaceChildren(el(`<div class="estado">Buscando reuniões abertas em ${esc(rc.origem)}…</div>`)); return; }

  const d=rc.dados;
  const id=idApontar();
  const alvos=d.alvos||[];
  const alvoNome=(k)=>{ const a=alvos.find(x=>x.key===k); return a?`${a.key} — ${a.nome}`:k; };

  // Lista filtrada por busca.
  let lista=d.tickets||[];
  if(rc.busca){ const q=rc.busca.toLowerCase();
    lista=lista.filter(t=>(t.k+' '+t.resumo+' '+t.status).toLowerCase().includes(q)); }
  const nSel=Object.keys(rc.sel).filter(id=>rc.sel[id]).length;
  const todosVis = lista.length>0 && lista.every(t=>rc.sel[t.id]);

  const faixaId = id
    ? `<div class="ap-id">🔀 Movendo como <strong>${esc(id.nome||id.email)}</strong>
         <span class="muted small">(precisa de permissão de mover na origem e criar no destino)</span>
         <span class="spacer"></span><button class="btn" data-ap-act="trocar-id">Trocar usuário</button></div>`
    : `<div class="ap-id sem">Para mover tickets, identifique-se uma vez (e-mail + token de API do Jira).
         <span class="spacer"></span><button class="btn" data-ap-act="config-id">Identificar-se</button></div>`;

  if(!d.tickets.length){
    cont.replaceChildren(el(`<div>${faixaId}
      <div class="card full"><h2>🗂 Reuniões <span>gestão e reclassificação · projeto ${esc(d.projeto)}</span></h2>
        ${reuTabsHTML('reclassificar')}
        <div class="estado">${esc(d.aviso||`Nenhuma reunião aberta em ${d.projeto}.`)}</div></div></div>`));
    return;
  }

  const optAlvo=alvos.length
    ? alvos.map(a=>`<option value="${escA(a.key)}" ${rc.alvo===a.key?'selected':''}>${esc(a.nome||a.key)} (${esc(a.key)})</option>`).join('')
    : '<option value="">— nenhum projeto destino com esse tipo —</option>';

  const rows=lista.map(t=>`<tr>
      <td class="c"><input type="checkbox" class="rc-chk" data-id="${escA(t.id)}" ${rc.sel[t.id]?'checked':''} aria-label="selecionar ${escA(t.k)}"></td>
      <td><a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener">${esc(t.k)} ↗</a></td>
      <td class="rc-resumo" title="${escA(t.resumo)}">${esc(t.resumo||'—')}</td>
      <td><span class="badge">${esc(t.status)}</span></td>
      <td><span class="badge">${esc(t.tipo)}</span></td>
    </tr>`).join('');

  const podeMover = nSel>0 && rc.alvo && id && !rc.movendo;

  cont.replaceChildren(el(`<div>
    ${faixaId}
    <div class="card full">
      <h2>🗂 Reuniões <span>gestão e reclassificação · ${d.tickets.length} reunião(ões) aberta(s) em ${esc(d.projeto)} · mover mantém tipo e status</span></h2>
      ${reuTabsHTML('reclassificar')}
      <div class="ap-filtros">
        <div class="campo"><label>Projeto destino</label><select id="rc-alvo" ${alvos.length?'':'disabled'}>${optAlvo}</select></div>
        <div class="campo"><label>Buscar</label><input type="search" id="rc-busca" placeholder="código, resumo, status…" value="${escA(rc.busca)}"></div>
        <div class="campo"><label>&nbsp;</label><button class="btn" id="rc-refresh">Atualizar lista</button></div>
      </div>
      <div class="muted small" style="margin:0 0 10px">O <strong>tipo</strong> é mantido (mesmo nome no destino) e o <strong>status</strong> é preservado quando existe no fluxo do destino (senão vai para o status inicial).
        Reunião que é mesmo <strong>processo administrativo</strong>? Selecione e use <strong>✓ Confirmar processo administrativo</strong> — ela recebe a label <code>${esc(RC_LABEL_ADM)}</code> no Jira e deixa de aparecer aqui.</div>
      <div class="ts-wrap"><table class="rc-tab">
        <thead><tr>
          <th class="c"><input type="checkbox" id="rc-all" ${todosVis?'checked':''} aria-label="selecionar todos"></th>
          <th>Ticket</th><th>Resumo</th><th>Status</th><th>Tipo</th>
        </tr></thead><tbody>${rows}</tbody></table></div>
      <div class="rc-foot">
        <span class="muted" id="rc-count">${nSel} selecionado(s)</span>
        <span class="spacer" style="flex:1"></span>
        <button class="btn" id="rc-confirma-adm" ${nSel>0&&id&&!rc.movendo?'':'disabled'}
          title="Confirma que a(s) reunião(ões) selecionada(s) fazem parte de um processo administrativo — recebem a label ${escA(RC_LABEL_ADM)} no Jira e saem desta tela">
          ✓ Confirmar processo administrativo</button>
        <button class="btn primario" id="rc-mover" ${podeMover?'':'disabled'}>
          Mover ${nSel||''} para ${rc.alvo?esc(rc.alvo):'…'} →</button>
      </div>
      <div class="ap-fb" id="rc-fb" hidden></div>
    </div>
  </div>`));
}

function renderReclassResultado(){
  const cont=document.getElementById('conteudo');
  const rc=estado.reclass; const r=rc.resultado;
  if(r.status==='andamento'){
    cont.replaceChildren(el(`<div><div class="card full">
      <h2>Movimentação em andamento</h2>
      <div class="estado">O Jira está processando a movimentação (${esc(String(r.progresso||0))}%).
        Isso pode levar alguns segundos.</div>
      <div style="display:flex;gap:10px;justify-content:center">
        <button class="btn primario" id="rc-verificar">Verificar agora</button>
        <button class="btn" id="rc-voltar">Voltar à lista</button></div>
      <div class="ap-fb" id="rc-fb" hidden></div></div></div>`));
    return;
  }
  const movidos=r.movidos||[];
  const links=movidos.map(m=>`<div class="pl-res-item">
    <a href="${jiraBase()}/browse/${encodeURIComponent(m.key)}" target="_blank" rel="noopener">${esc(m.key)} ↗</a>
    <span>${esc(m.resumo||'')}</span></div>`).join('');
  cont.replaceChildren(el(`<div><div class="card full">
    <h2>Resultado da reclassificação</h2>
    <div class="pl-res-ok">✓ ${movidos.length} ticket(s) movido(s) para ${esc(rc.alvo)}</div>
    ${links||'<div class="muted small">Nenhum ticket movido.</div>'}
    ${r.invalidos?`<div class="aviso" style="margin-top:12px">${r.invalidos} item(ns) não puderam ser movidos (sem acesso ou inválidos).</div>`:''}
    <div style="display:flex;gap:10px;margin-top:16px">
      <button class="btn primario" id="rc-voltar">Voltar à lista</button></div>
  </div></div>`));
}

// Confirma e dispara a movimentação.
function confirmaMover(){
  const rc=estado.reclass; const id=idApontar();
  if(!id){ abreIdentidade(); return; }
  const ids=Object.keys(rc.sel).filter(x=>rc.sel[x]);
  if(!ids.length || !rc.alvo) return;
  const alvoNm=(()=>{ const a=(rc.dados.alvos||[]).find(x=>x.key===rc.alvo); return a?`${a.key} — ${a.nome}`:rc.alvo; })();
  abreModal(`
    <h2>Confirmar reclassificação</h2>
    <div class="muted small">Você vai mover <strong>${ids.length}</strong> reunião(ões) de
      <strong>${esc(rc.origem)}</strong> para <strong>${esc(alvoNm)}</strong>.</div>
    <ul class="ap-passos">
      <li>O <strong>tipo</strong> (reunião) é mantido no destino.</li>
      <li>O <strong>status</strong> é preservado quando existe no fluxo do destino; senão vai para o status inicial.</li>
      <li>O <strong>código do ticket muda</strong> para o prefixo do projeto destino (a operação é reversível movendo de volta).</li>
    </ul>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button class="btn" id="rc-cancelar">Cancelar</button>
      <button class="btn primario" id="rc-confirmar">Mover ${ids.length} ticket(s)</button>
    </div>
    <div class="ap-fb" id="rc-mfb" hidden></div>`);
}

// ---- Confirmar reunião como PROCESSO ADMINISTRATIVO: label no Jira + some da lista ----
const RC_LABEL_ADM='processo-administrativo';
function confirmaReuniaoAdm(){
  const rc=estado.reclass; const id=idApontar();
  if(!id){ abreIdentidade(); return; }
  const ids=Object.keys(rc.sel).filter(x=>rc.sel[x]);
  const tks=(rc.dados&&rc.dados.tickets)||[];
  const sel=ids.map(v=>tks.find(t=>String(t.id)===String(v))).filter(Boolean);
  if(!sel.length) return;
  const itens=sel.map(t=>`<li><strong>${esc(t.k)}</strong> — ${esc((t.resumo||'').slice(0,70))}</li>`).join('');
  abreModal(`
    <h2>✓ Confirmar processo administrativo</h2>
    <div class="muted small">Você confirma que ${sel.length===1?'esta reunião faz':'estas '+sel.length+' reuniões fazem'} parte de um <strong>processo administrativo</strong> — não precisa reclassificar.</div>
    <ul class="muted small" style="margin:8px 0 0;padding-left:18px;max-height:150px;overflow:auto">${itens}</ul>
    <ul class="ap-passos">
      <li>O ticket recebe a label <strong>${esc(RC_LABEL_ADM)}</strong> no Jira (fica registrado e auditável).</li>
      <li>Ele <strong>deixa de aparecer nesta tela</strong> (e na de Vincular Reuniões).</li>
      <li>Para desfazer, remova a label no próprio Jira — o ticket volta à lista.</li>
    </ul>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button class="btn" id="rc-adm-cancelar">Cancelar</button>
      <button class="btn primario" id="rc-adm-confirmar">Confirmar ${sel.length} reunião(ões)</button>
    </div>
    <div class="ap-fb" id="rc-mfb" hidden></div>`);
}
async function executaConfirmaAdm(){
  const rc=estado.reclass; const id=idApontar(); if(!id) return;
  const ids=Object.keys(rc.sel).filter(x=>rc.sel[x]);
  const tks=(rc.dados&&rc.dados.tickets)||[];
  const keys=ids.map(v=>{ const t=tks.find(x=>String(x.id)===String(v)); return t?t.k:null; }).filter(Boolean);
  if(!keys.length) return;
  const fb=document.getElementById('rc-mfb');
  const bt=document.getElementById('rc-adm-confirmar'); if(bt) bt.disabled=true;
  if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Gravando a label no Jira…'; }
  try{
    const j=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({rotular:true,issues:keys,labels:[RC_LABEL_ADM],email:id.email,token:id.token})}).then(r=>r.json());
    if(!j.rotulados){
      const det=(j.falhas||[]).map(f=>`${f.k}: ${f.erro}`).join(' · ');
      if(fb){ fb.className='ap-fb err'; fb.textContent=j.erro||det||'Falha ao confirmar.'; }
      if(bt) bt.disabled=false; return;
    }
    const falhas=new Set((j.falhas||[]).map(f=>f.k));
    const okKeys=keys.filter(k=>!falhas.has(k));
    rc.dados.tickets=tks.filter(t=>!okKeys.includes(t.k));
    okKeys.forEach(k=>{ logAcao({acao:'reclassificar', t:k, para:'processo administrativo', ok:true}, false); });
    rc.sel={}; salvaCfg();
    fechaModal();
    toast(`✓ ${okKeys.length} reunião(ões) confirmadas como processo administrativo.`+(falhas.size?` ⚠ ${falhas.size} falharam.`:''), falhas.size?'warn':'ok');
    renderReclass();
  }catch(e){
    if(fb){ fb.className='ap-fb err'; fb.textContent='Erro de rede: '+(e.message||e); }
    if(bt) bt.disabled=false;
  }
}

async function executaMover(){
  const rc=estado.reclass; const id=idApontar(); if(!id) return;
  const sel=Object.keys(rc.sel).filter(x=>rc.sel[x]);
  const tks=(rc.dados.tickets||[]);
  const itens=sel.map(idv=>{ const t=tks.find(x=>String(x.id)===String(idv)); return t?{id:t.id,tipo:t.tipo}:null; }).filter(Boolean);
  if(!itens.length) return;
  rc.movendo=true;
  const fb=document.getElementById('rc-mfb');
  if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Enviando para o Jira…'; }
  try{
    const j=await fetch('/api/reunioes',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({alvo:rc.alvo,itens,email:id.email,token:id.token})}).then(r=>r.json());
    rc.movendo=false;
    if(j.erro){ if(fb){ fb.className='ap-fb err'; fb.textContent=j.erro; } return; }
    if(j.ok===false){ if(fb){ fb.className='ap-fb err'; fb.textContent=j.erro||'Falha ao mover.'; } return; }
    rc.taskId=j.taskId||''; rc.resultado=j; rc.dados=null; estado.cache={};
    fechaModal(); renderReclass();
  }catch(e){ rc.movendo=false; if(fb){ fb.className='ap-fb err'; fb.textContent='Erro de rede: '+(e.message||e); } }
}

async function verificaMover(){
  const rc=estado.reclass; const id=idApontar(); if(!id||!rc.taskId) return;
  const fb=document.getElementById('rc-fb');
  if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Consultando o Jira…'; }
  try{
    const j=await fetch('/api/reunioes',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({taskId:rc.taskId,email:id.email,token:id.token})}).then(r=>r.json());
    if(j.ok===false){ if(fb){ fb.className='ap-fb err'; fb.textContent=j.erro||'Ainda processando.'; } return; }
    rc.resultado=j; renderReclass();
  }catch(e){ if(fb){ fb.className='ap-fb err'; fb.textContent='Erro de rede: '+(e.message||e); } }
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
document.getElementById('conteudo').addEventListener('change', (e)=>{
  const rc=estado.reclass; const t=e.target; if(!t) return;
  if(t.id==='rc-alvo'){ rc.alvo=t.value; renderReclass(); }
  else if(t.id==='rc-all'){
    let lista=(rc.dados&&rc.dados.tickets)||[];
    if(rc.busca){ const q=rc.busca.toLowerCase(); lista=lista.filter(x=>(x.k+' '+x.resumo+' '+x.status).toLowerCase().includes(q)); }
    lista.forEach(x=>{ if(t.checked) rc.sel[x.id]=true; else delete rc.sel[x.id]; });
    renderReclass();
  } else if(t.classList && t.classList.contains('rc-chk')){
    const idv=t.getAttribute('data-id');
    if(t.checked) rc.sel[idv]=true; else delete rc.sel[idv];
    const n=Object.keys(rc.sel).filter(x=>rc.sel[x]).length;
    const c=document.getElementById('rc-count'); if(c) c.textContent=n+' selecionado(s)';
    const b=document.getElementById('rc-mover');
    if(b){ b.disabled=!(n>0 && rc.alvo && idApontar()); b.textContent=`Mover ${n||''} para ${rc.alvo||'…'} →`; }
    const ba=document.getElementById('rc-confirma-adm'); if(ba) ba.disabled=!(n>0 && idApontar());
  }
});
document.getElementById('conteudo').addEventListener('input', (e)=>{
  if(e.target && e.target.id==='rc-busca'){
    buscaComposta(e,(v)=>{ estado.reclass.busca=v; },renderReclass,'rc-busca');
  }
});
// ---- Vincular Reuniões a AMS: lista + assistente (modal) ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const v=e.target.closest&&e.target.closest('[data-rv-vinc]');
  if(v){ abreRvWizard(v.getAttribute('data-rv-vinc')); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  const rv=estado.reuvinc;
  if(t.id==='rv-retry'){ rv.erro=''; rv.dados=null; renderReuVinc(); }
  else if(t.id==='rv-refresh'){ rv.dados=null; carregaReuVinc(true); }
  // 🔁 Transferir OUTRO ticket (qualquer tipo) pelo número: mesmo assistente da
  // Gestão (copia detalhes, vincula o esforço ao destino e EXCLUI o original).
  else if(t.hasAttribute('data-rv-transf')){
    const inp=document.getElementById('rv-transf-key');
    const k=String((inp&&inp.value)||'').trim().toUpperCase();
    if(!/^[A-Z][A-Z0-9]*-\d+$/.test(k)){ toast('Informe a chave do ticket (ex.: TAD-123).','warn'); if(inp) inp.focus(); return; }
    if(!idApontar()){ abreIdentidade(); return; }
    abreRvWizard(k, true); return; }
});
document.getElementById('conteudo').addEventListener('input', (e)=>{
  const t=e.target; if(!t) return;
  if(t.id==='rv-busca'){ estado.reuvinc.busca=t.value; renderReuVinc();
    const nb=document.getElementById('rv-busca'); if(nb){ nb.focus(); nb.setSelectionRange(nb.value.length,nb.value.length); } }
});
document.getElementById('conteudo').addEventListener('change', (e)=>{
  const t=e.target; if(!t) return;
  if(t.id==='rv-origem'){ const v=t.value.trim().toUpperCase();
    if(/^[A-Z][A-Z0-9_]*$/.test(v)){ estado.reuvinc.origem=v; estado.reuvinc.dados=null; carregaReuVinc(false); } }
});
document.getElementById('modal-body').addEventListener('click', (e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t||!_rv) return;
  if(t.id==='rv-modo-criar'){ _rv.modo='criar'; renderRvModal(); }
  else if(t.id==='rv-modo-exist'){ _rv.modo='existente'; if(!_rv.abertos&&!_rv.carregandoAb) rvCarregaAbertos(); else renderRvModal(); }
  else if(t.id==='rv-confirm'){ rvExecuta(); }
  else if(t.id==='rv-cancelar'||t.id==='rv-fechar'){ _rv=null; fechaModal();
    if(estado.vista==='apontar') renderApontar(); else if(estado.vista==='gestao') renderGestao(); }
});
document.getElementById('modal-body').addEventListener('change', (e)=>{
  const t=e.target; if(!t||!_rv) return;
  if(t.id==='rv-proj'){ _rv.projeto=t.value; _rv.tipoId=rvTipoPadrao(rvProjetosDo().find(p=>p.key===t.value));
    if(_rv.modo==='existente'){ _rv.ticket=''; rvCarregaAbertos(); } else renderRvModal(); }
  else if(t.id==='rv-tipo'){ _rv.tipoId=t.value; }
  else if(t.id==='rv-ticket'){ _rv.ticket=t.value; renderRvModal(); }
  else if(t.id==='rv-resumo'){ _rv.resumo=t.value; renderRvModal(); }
  else if(t.id==='rv-horas'){ _rv.horas=Math.max(0,Number(t.value)||0); renderRvModal(); }
  else if(t.id==='rv-worklog'){ _rv.worklog=t.checked; renderRvModal(); }
});
document.getElementById('modal-body').addEventListener('input', (e)=>{
  const t=e.target; if(!t||!_rv) return;
  if(t.id==='rv-tbusca'){ _rv.tbusca=t.value; renderRvModal();
    const nb=document.getElementById('rv-tbusca'); if(nb){ nb.focus(); nb.setSelectionRange(nb.value.length,nb.value.length); } }
});
