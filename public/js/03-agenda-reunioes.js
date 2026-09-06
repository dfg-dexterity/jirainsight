// Jira Insights · 03 · 📅 AGENDA (Outlook → ticket de reunião) e 🔁 REUNIÕES RECORRENTES.
// renderAgenda e seus listeners ficam no fim deste arquivo.
// ===========================================================================
// 📅 Agenda (Outlook) → ticket de reunião. Lê os eventos da pessoa identificada
// via /api/reunioes?agenda=1 (Microsoft Graph, conta de aplicativo). Convites
// cujo organizador está na lista oculta (padrão diego@dexterityit.com.br) não
// aparecem. Cada evento pode virar um ticket de Reunião no RDF com 1 clique
// (criado com o TOKEN da pessoa via /api/criar; label agenda-outlook).
// ===========================================================================
const AG_TK_KEY='jirainsight_agenda_tickets';
function agTickets(){ try{ return JSON.parse(localStorage.getItem(AG_TK_KEY))||{}; }catch(e){ return {}; } }
// Vínculo evento→ticket na config COMPARTILHADA (todo o time vê quem criou) +
// espelho no localStorage (compatibilidade com o formato antigo).
function agTicketDe(evId){
  const c=(cfg.agendaTickets||{})[evId]; if(c&&c.t) return c;
  const l=agTickets()[evId]; return l?{t:l,por:'',quando:''}:null;
}
function agMarcaTicket(evId,key){
  const id=idApontar()||{};
  cfg.agendaTickets=cfg.agendaTickets||{};
  cfg.agendaTickets[evId]={ t:key, por:id.nome||id.email||'', quando:new Date().toISOString() };
  // Higiene: vínculos com mais de ~120 entradas descartam os mais antigos.
  const ks=Object.keys(cfg.agendaTickets);
  if(ks.length>120){ ks.sort((x,y)=>String(cfg.agendaTickets[x].quando||'').localeCompare(String(cfg.agendaTickets[y].quando||'')))
    .slice(0,ks.length-120).forEach(k=>delete cfg.agendaTickets[k]); }
  // O vínculo RESOLVE a pendência: some o aviso "reunião sem ticket" do Inbox de todos.
  Object.entries(cfg.inboxAvisos||{}).forEach(([acc,lst])=>{
    const f=(lst||[]).filter(a=>a.evId!==evId);
    if(f.length!==(lst||[]).length){ if(f.length) cfg.inboxAvisos[acc]=f; else delete cfg.inboxAvisos[acc]; }
  });
  salvaCfg();
  const m=agTickets(); m[evId]=key; try{ localStorage.setItem(AG_TK_KEY, JSON.stringify(m)); }catch(e){}
}
// Tipo "Reunião" do projeto (senão o tipo padrão) — para criar o ticket do evento.
function agTipoReuniao(projKey){
  const pr=(_projetosCache||[]).find(x=>x.key===projKey); const tipos=(pr&&pr.tipos)||[];
  // Sem tipo "Reunião": cai no tipo padrão do projeto (task/tarefa de 1º nível), mesmo critério do Vincular Reuniões.
  const base=tipos.filter(t=>!t.subtarefa&&(t.nivel===0||t.nivel===undefined));
  return tipos.find(x=>!x.subtarefa&&/reuni/i.test(x.nome||''))||base.find(t=>/task|tarefa/i.test(t.nome||''))||base[0]||null;
}
// Usuários ativos do Jira (accountId → {nome,email}) para casar com os convidados.
function agCarregaUsuarios(){
  const ag=estado.agenda; if(ag.usuarios||ag.usuCarr) return;
  ag.usuCarr=true;
  fetch('/api/usuarios').then(r=>r.json()).then(j=>{ ag.usuCarr=false; ag.usuarios=(j&&j.pessoas)||{}; agAtualizaModal(); })
    .catch(()=>{ ag.usuCarr=false; ag.usuarios={}; agAtualizaModal(); });
}
// Duração do evento em segundos (mínimo 15 min; dia todo = 8h).
function agDuracaoSeg(ev){
  if(ev.diaTodo) return 8*3600;
  const d=(ev.inicio||'').slice(0,10);
  const i=new Date(`${ev.inicio}:00-03:00`).getTime(); const f=new Date(`${ev.fim||ev.inicio}:00-03:00`).getTime();
  const seg=Math.round((f-i)/1000);
  return (isFinite(seg)&&seg>=900)?Math.min(seg,12*3600):3600;
}
function agDescEvento(ev){
  const dia=(ev.inicio||'').slice(0,10);
  return [
    `Evento do Outlook — ${dia} ${ev.diaTodo?'(dia todo)':`${(ev.inicio||'').slice(11,16)}–${(ev.fim||'').slice(11,16)}`}`,
    `Organizador: ${ev.organizador.nome||ev.organizador.email}`,
    `Participantes: ${ev.participantes}`,
    ev.local?`Local: ${ev.local}`:'', ev.link?`Link: ${ev.link}`:'',
  ].filter(Boolean).join('\n');
}
// ===========================================================================
// 🔁 REUNIÕES RECORRENTES — o ticket nasce sozinho, só o apontamento fica
// Regra por SÉRIE (seriesMasterId do Outlook): "toda ocorrência desta reunião
// vira um ticket no projeto X". Quando você abre a Agenda, as ocorrências de
// HOJE que ainda não têm ticket são criadas em lote, com o SEU token (o painel
// nunca guarda credenciais no servidor) — depois é só apontar as horas.
// ===========================================================================
function agSerieDe(ev){ return String((ev&&ev.serie)||'')|| (ev&&ev.recorrente?`t:${String(ev.titulo||'').trim().toLowerCase()}`:''); }
function agRegraDe(ev){ const s=agSerieDe(ev); return s?((cfg.agendaAuto||{})[s]||null):null; }
function agSalvaRegra(ev, projeto){
  const s=agSerieDe(ev); if(!s||!projeto) return;
  const id=idApontar()||{};
  cfg.agendaAuto=cfg.agendaAuto||{};
  cfg.agendaAuto[s]={ projeto, titulo:ev.titulo||'', por:id.nome||id.email||'', quando:new Date().toISOString() };
  salvaCfg();
}
function agRemoveRegra(ev){ const s=agSerieDe(ev); if(s&&cfg.agendaAuto) { delete cfg.agendaAuto[s]; salvaCfg(); } }
// Cria os tickets das ocorrências de HOJE que têm regra e ainda não têm ticket.
// Roda uma vez por carga da agenda; falhas não travam a tela (só relatam).
async function agAutoCria(){
  const ag=estado.agenda; if(ag.autoRodou||ag.autoRodando) return;
  const id=idApontar(); if(!id) return;
  const evs=((ag.dados||{}).eventos||[]);
  const hoje=hojeSP();
  const alvos=evs.filter(ev=>!ev.privado && (ev.inicio||'').slice(0,10)===hoje
    && !agTicketDe(ev.id) && agRegraDe(ev));
  ag.autoRodou=true;
  if(!alvos.length) return;
  ag.autoRodando=true; if(estado.vista==='agenda') renderAgenda();
  const criados=[]; const falhas=[];
  for(const ev of alvos){
    const regra=agRegraDe(ev); const proj=regra.projeto;
    const tipo=agTipoReuniao(proj);
    if(!tipo){ falhas.push(`${ev.titulo}: projeto ${proj} sem tipo de reunião`); continue; }
    try{
      const r=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ email:id.email, token:id.token, itens:[{ projeto:proj, tipoId:tipo.id,
          resumo:`Reunião: ${ev.titulo}`.slice(0,250), descricao:agDescEvento(ev),
          venc:(ev.inicio||'').slice(0,10), labels:['agenda-outlook','recorrente-auto'] }] })});
      const j=await r.json(); const c=j&&j.criados&&j.criados[0];
      if(c&&c.key){ agMarcaTicket(ev.id,c.key); criados.push(c.key); }
      else falhas.push(`${ev.titulo}: ${(j&&j.erros&&j.erros[0]&&j.erros[0].erro)||(j&&j.erro)||'falhou'}`);
    }catch(e){ falhas.push(`${ev.titulo}: ${e.message||e}`); }
  }
  ag.autoRodando=false;
  if(criados.length) toast(`🔁 ${criados.length} ticket(s) de reunião recorrente criados: ${criados.join(', ')} — agora é só apontar.`,'ok');
  if(falhas.length) toast(`⚠ ${falhas.length} reunião(ões) automáticas falharam: ${falhas[0]}`,'warn');
  if(estado.vista==='agenda') renderAgenda();
}
// ---- ⏱ Duração REAL (relatório de presença do Teams) ----
async function agDuracaoReal(evId, btn){
  const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===evId);
  const id=idApontar(); if(!ev||!id) return null;
  if(btn){ btn.disabled=true; btn.textContent='⏱ consultando o Teams…'; }
  try{
    const r=await fetch('/api/reunioes',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ presenca:1, email:id.email, token:id.token, joinUrl:ev.link||'' })});
    const j=await r.json();
    if(!j||!j.ok){ toast((j&&j.erro)||'Não consegui a duração real — uso a agendada.','warn'); return null; }
    return j;
  }catch(e){ toast(humanizaErro(e),'warn'); return null; }
  finally{ if(btn){ btn.disabled=false; btn.textContent='⏱ duração real'; } }
}

// Modal: escolher o projeto em que as ocorrências desta série viram ticket.
function agAbreAuto(ev){
  const projetos=(_projetosCache||[]);
  if(!projetos.length){ garanteProjetos().then(()=>agAbreAuto(ev)).catch(()=>toast('Não consegui listar os projetos.','err')); return; }
  const ops=projetos.filter(p=>agTipoReuniao(p.key)).map(p=>`<option value="${escA(p.key)}">${esc(p.key)} — ${esc(p.nome||'')}</option>`).join('');
  abreModal(`<h2>🔁 Automatizar esta reunião recorrente</h2>
    <div class="muted small">${esc(ev.titulo)} — toda ocorrência vira um ticket <b>automaticamente</b> quando você abre a Agenda no dia. Depois é só apontar as horas (dá para usar a duração real do Teams).</div>
    <div class="alx-campo"><label>Projeto do ticket <span class="req">*</span></label>
      <select class="alx-motivo" id="agauto-proj">${ops||'<option value="">nenhum projeto com tipo de reunião</option>'}</select></div>
    <div class="muted small">A regra vale para o time todo (config compartilhada) e pode ser desligada a qualquer momento na própria linha da reunião.</div>
    <div class="alx-modal-acoes">
      <button class="btn primario" id="agauto-salvar">⚡ Automatizar</button>
      <button class="btn" id="gx-fechar">Cancelar</button></div>`);
  const bt=document.getElementById('agauto-salvar');
  if(bt) bt.addEventListener('click',()=>{
    const proj=((document.getElementById('agauto-proj')||{}).value||'').trim();
    if(!proj){ toast('Escolha o projeto.','warn'); return; }
    agSalvaRegra(ev, proj); fechaModal();
    toast('🔁 Automação ligada — as próximas ocorrências viram ticket sozinhas.','ok');
    estado.agenda.autoRodou=false; agAutoCria(); renderAgenda(); });
}

// ---- Modal criar/vincular + convidar participantes ----
let _agM=null;   // { evId, fixo(chave já vinculada — só convidar) }
function agAbreTicket(evId, fixo){
  const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===evId); if(!ev) return;
  _agM={ evId, fixo:fixo||'' };
  if(!_projetosCache) garanteProjetos().then(()=>agAtualizaModal()).catch(()=>{});
  agCarregaUsuarios();
  abreModal('<h2>📝 Ticket da reunião</h2><div class="estado">Carregando…</div>');
  agAtualizaModal();
}
function agAtualizaModal(){
  const m=_agM; if(!m) return;
  const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===m.evId); if(!ev) return;
  const id=idApontar()||{};
  const projetos=(_projetosCache||[]);
  const projSel=(document.getElementById('agm-proj')||{}).value || (projetos.some(p=>p.key==='RDF')?'RDF':(projetos[0]&&projetos[0].key)||'');
  const modo=m.fixo?'vincular':(((document.querySelector('input[name=agm-modo]:checked')||{}).value)||'criar');
  const chave=m.fixo||((document.getElementById('agm-chave')||{}).value||'');
  const marcados=new Set([...document.querySelectorAll('[data-agm-p]:checked')].map(x=>x.getAttribute('data-agm-p')));
  const primeira=!m.prechecked;   // pré-marca todo mundo na PRIMEIRA vez que a lista aparece
  const tipo=projSel?agTipoReuniao(projSel):null;
  const usu=estado.agenda.usuarios;
  const meuEmail=String(id.email||'').toLowerCase();
  // Convidados do evento casados com os usuários do Jira (por e-mail).
  let pessoasHtml='<span class="muted small">Carregando pessoas…</span>';
  if(usu){
    const porEmail={}; Object.entries(usu).forEach(([acc,u])=>{ if(u.email) porEmail[String(u.email).toLowerCase()]={acc,nome:u.nome}; });
    // Só pessoas INTERNAS (com conta ativa no Jira) entram na lista de convites —
    // participantes externos (cliente/fora da Dexterity) não apontam horas aqui.
    let externos=0;
    const linhas=(ev.pessoas||[]).map(p=>{
      const j=porEmail[p.email];
      if(p.email===meuEmail) return `<label class="check" style="opacity:.65"><input type="checkbox" disabled> ${esc(p.nome||p.email)} <span class="muted small">(você — o convite aponta as suas horas automaticamente)</span></label>`;
      if(!j){ externos++; return ''; }
      const chk=primeira?true:marcados.has(j.acc);
      return `<label class="check"><input type="checkbox" data-agm-p="${escA(j.acc)}" data-agm-nome="${escA(j.nome)}" ${chk?'checked':''}> ${esc(j.nome)}</label>`;
    }).filter(Boolean).join('');
    pessoasHtml=(linhas||'<span class="muted small">Nenhum participante interno além de você.</span>')
      +(externos?`<div class="muted small" style="margin-top:6px">👤 ${externos} participante(s) externo(s) fora da lista — convites de apontamento são só para o time Dexterity.</div>`:'');
    m.prechecked=true;
  }
  const hFmt=fmtH((m.segReal&&m.segReal>0)?m.segReal:agDuracaoSeg(ev));
  const corpo=`<h2>📝 Ticket da reunião</h2>
    <div class="muted small">${esc(ev.titulo)} · ${esc((ev.inicio||'').slice(0,10))} ${ev.diaTodo?'(dia todo)':esc((ev.inicio||'').slice(11,16))}</div>
    ${m.fixo?`<div class="ap-id" style="margin-top:8px">✓ Ticket já criado: <strong>${esc(m.fixo)}</strong> — selecione quem convidar para apontar.</div>`:`
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin:10px 0 4px">
      <label class="check"><input type="radio" name="agm-modo" value="criar" ${modo==='criar'?'checked':''}> 🆕 Criar ticket novo</label>
      <label class="check"><input type="radio" name="agm-modo" value="vincular" ${modo==='vincular'?'checked':''}> 🔗 Vincular a ticket existente</label>
    </div>
    ${modo==='criar'?`
      <div class="alx-campo"><label>Projeto</label>
        <select id="agm-proj">${projetos.map(p=>`<option value="${escA(p.key)}" ${projSel===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('')||'<option value="">carregando projetos…</option>'}</select>
        <span class="muted small" style="margin-left:8px">${tipo?`tipo: <b>${esc(tipo.nome)}</b>`:'sem tipo disponível'}</span></div>`
    :`<div class="alx-campo"><label>Chave do ticket</label><input type="text" id="agm-chave" value="${escA(chave)}" placeholder="ex.: IMI-41" maxlength="20" style="width:140px;text-transform:uppercase">
        <span class="muted small" style="margin-left:8px">os detalhes do evento entram como comentário</span></div>`}`}
    <div class="muted small" style="font-weight:600;margin:10px 0 4px">👥 Convidar para apontar <span class="muted" style="font-weight:400">· cada um confirma com 1 clique (Inbox/Apontar) e o worklog de ${esc(hFmt)} sai no usuário da pessoa</span></div>
    <div class="ap-vis" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:2px 0 6px">
      <span class="muted small">⏱ Horas do convite: <strong>${esc(hFmt)}</strong> ${m.segReal>0?'<span class="badge com-horas" data-tip="Tempo real de permanência na chamada, do relatório de presença do Teams">real (Teams)</span>':'<span class="badge" data-tip="Duração agendada no Outlook">agendada</span>'}</span>
      ${ev.link&&!m.segReal?`<button class="btn" data-agm-real="1" data-tip="Busca no Teams quanto a reunião REALMENTE durou (relatório de presença) e usa esse tempo no convite">⏱ duração real</button>`:''}
      ${m.segReal>0?`<button class="btn" data-agm-agendada="1" data-tip="Voltar para a duração agendada no Outlook">↩ usar a agendada</button>`:''}</div>
    ${m.realNota?`<div class="muted small" style="margin:-2px 0 6px">${esc(m.realNota)}</div>`:''}
    <div id="agm-pessoas" style="max-height:180px;overflow:auto">${pessoasHtml}</div>
    <div style="margin-top:12px"><button class="btn primario" data-agm-conf="1">${m.fixo?'👥 Enviar convites':'Confirmar'}</button></div>
    <div class="ap-fb" id="agm-fb" hidden></div>`;
  const mb=document.getElementById('modal-body'); if(mb){ mb.replaceChildren(el(`<div>${corpo}</div>`)); }
}
async function agConfirma(){
  const m=_agM; if(!m) return;
  const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===m.evId); if(!ev) return;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const fb=document.getElementById('agm-fb'); if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Processando…'; }
  const dia=(ev.inicio||'').slice(0,10);
  const pessoas=[...document.querySelectorAll('[data-agm-p]:checked')].map(x=>({ accountId:x.getAttribute('data-agm-p'), nome:x.getAttribute('data-agm-nome')||'' }));
  try{
    let key=m.fixo;
    if(!key){
      const modo=((document.querySelector('input[name=agm-modo]:checked')||{}).value)||'criar';
      if(modo==='vincular'){
        key=String((document.getElementById('agm-chave')||{}).value||'').trim().toUpperCase();
        if(!/^[A-Z][A-Z0-9]*-\d+$/.test(key)) throw new Error('Informe a chave do ticket (ex.: IMI-41).');
        const rc=await fetch('/api/transicao',{ method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ comentar:true, issue:key, texto:`Reunião vinculada: ${ev.titulo}\n${agDescEvento(ev)}`, email:id.email, token:id.token }) });
        const jc=await rc.json(); if(!jc||!jc.ok) throw new Error((jc&&jc.erro)||'Falha ao comentar no ticket.');
      } else {
        const proj=((document.getElementById('agm-proj')||{}).value)||'RDF';
        const tipo=agTipoReuniao(proj); if(!tipo) throw new Error(`Projeto ${proj} sem tipo de issue utilizável.`);
        const r=await fetch('/api/criar',{ method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ email:id.email, token:id.token,
            itens:[{ projeto:proj, tipoId:tipo.id, resumo:`Reunião: ${ev.titulo}`.slice(0,250), descricao:agDescEvento(ev), venc:dia, labels:['agenda-outlook'] }] }) });
        const j=await r.json(); const criado=j&&j.criados&&j.criados[0];
        if(!criado||!criado.key) throw new Error((j&&j.erros&&j.erros[0]&&j.erros[0].erro)||(j&&j.erro)||'Falha ao criar o ticket.');
        key=criado.key;
      }
      agMarcaTicket(ev.id, key);
    }
    let convidados=0;
    if(pessoas.length){
      const rv=await fetch('/api/apontar',{ method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ convidar:true, issue:key, segundos:((_agM&&_agM.segReal>0)?_agM.segReal:agDuracaoSeg(ev)), inicio:dia,
          comentario:`Reunião: ${ev.titulo}`.slice(0,200), pessoas, avisarTeams:true, email:id.email, token:id.token }) });
      const jv=await rv.json(); if(!jv||jv.ok===false) throw new Error((jv&&jv.erro)||'Ticket ok, mas falhou o envio dos convites.');
      convidados=pessoas.length;
    }
    toast(`✓ ${key}${convidados?` · ${convidados} convite(s) de apontamento enviados`:''}`,'ok');
    _agM=null; fechaModal(); renderAgenda();
  }catch(err){ if(fb){ fb.classList.add('err'); fb.textContent=humanizaErro(err); } }
}
function carregaAgenda(forca){
  const ag=estado.agenda; const id=idApontar(); if(!id) return;
  ag.carregando=true; ag.erro='';
  // POST autenticado: a agenda é pessoal — o servidor confere que o token é seu.
  fetch('/api/reunioes',{ method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ agenda:1, email:id.email, token:id.token, nocache:forca?1:0 }) })
    .then(r=>r.json()).then(j=>{ ag.carregando=false; ag.dados=j;
      if(j&&j.erro&&!(j.eventos&&j.eventos.length)) ag.erro=j.erro;
      ag.autoRodou=false;   // dados novos: reavalia as regras de recorrência
      if(estado.vista==='agenda') renderAgenda(); else if(estado.vista==='acoes') renderAcoes();
      try{ agAutoCria(); }catch(e){} })
    .catch(e=>{ ag.carregando=false; ag.erro=humanizaErro(e); if(estado.vista==='agenda') renderAgenda(); else if(estado.vista==='acoes') renderAcoes(); });
}
// Tipo "Reunião" do projeto RDF (resolvido uma vez pelo catálogo de projetos).
async function agRdfTipoReuniao(){
  const ag=estado.agenda; if(ag.rdfTipo) return ag.rdfTipo;
  const j=await fetch('/api/projetos').then(r=>r.json());
  const rdf=((j&&j.projetos)||[]).find(p=>p.key==='RDF');
  const t=rdf&&(rdf.tipos||[]).find(x=>!x.subtarefa&&/reuni/i.test(x.nome||''));
  if(!t) throw new Error('Projeto RDF sem tipo de issue "Reunião" — não dá para criar o ticket.');
  ag.rdfTipo=t.id; return t.id;
}
// Eventos que PRECISAM de ticket e dependem de você: os seus e os de organizador
// externo (qualquer participante interno cria). Null enquanto a agenda não carregou.
function agPendentes(){
  const d=estado.agenda&&estado.agenda.dados; if(!d||!Array.isArray(d.eventos)) return null;
  const id=idApontar(); const meuDom=String((id&&id.email)||'').split('@')[1]||'';
  const ext=(ev)=>{ const oe=String((ev.organizador&&ev.organizador.email)||'').toLowerCase(); return !!oe&&!!meuDom&&!oe.endsWith('@'+meuDom); };
  return d.eventos.filter(ev=>!ev.privado&&!agTicketDe(ev.id)&&(ev.meu||ext(ev)));
}
// 📨 Cobra o ORGANIZADOR pelo Inbox: grava um aviso "reunião sem ticket" na config
// compartilhada (cfg.inboxAvisos[conta do organizador]) — some sozinho quando o
// ticket é criado/vinculado (limpeza no agMarcaTicket).
async function agAvisaInbox(evId){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===evId); if(!ev) return;
  if(!estado.agenda.usuarios){
    try{ const j=await fetch('/api/usuarios').then(r=>r.json()); estado.agenda.usuarios=(j&&j.pessoas)||{}; }
    catch(e){ estado.agenda.usuarios={}; }
  }
  const oe=String((ev.organizador&&ev.organizador.email)||'').toLowerCase();
  const ent=Object.entries(estado.agenda.usuarios||{}).find(([,u])=>String(u.email||'').toLowerCase()===oe);
  if(!ent){ toast(`Não achei a conta do Jira de ${oe||'quem organizou'} — sem Inbox para avisar.`,'err'); return; }
  const [acc,u]=ent;
  cfg.inboxAvisos=cfg.inboxAvisos||{};
  const lst=cfg.inboxAvisos[acc]=cfg.inboxAvisos[acc]||[];
  if(lst.some(a=>a.evId===evId)){ toast(`Já existe um aviso deste evento no Inbox de ${u.nome||oe}.`,'ok'); renderAgenda(); return; }
  lst.push({ evId, titulo:ev.titulo, dia:(ev.inicio||'').slice(0,10), de:id.nome||id.email||'', quando:new Date().toISOString() });
  if(lst.length>30) lst.splice(0,lst.length-30);
  salvaCfg();
  logAcao({acao:'agenda-avisar-inbox', t:ev.titulo, para:u.nome||oe, ok:true});
  toast(`📨 Aviso enviado para o Inbox de ${u.nome||oe}.`,'ok');
  renderAgenda();
}
function agRotuloDia(d){
  const hoje=projHoje();
  if(d===hoje) return 'Hoje';
  const dt=new Date(`${d}T12:00:00-03:00`);
  const sem=['dom','seg','ter','qua','qui','sex','sáb'][dt.getUTCDay()];
  const [y,m,dd]=d.split('-');
  return `${dd}/${m} (${sem})`;
}
function renderAgenda(){
  const cont=document.getElementById('conteudo'); const ag=estado.agenda; const id=idApontar();
  if(!id){
    cont.replaceChildren(el(`<div><div class="card full"><h2>📅 Agenda <span>seus eventos do Outlook → ticket de reunião</span></h2>
      <div class="estado">Identifique-se (e-mail + token do Jira) para carregarmos a SUA agenda.<br>
        <button class="btn primario" data-ap-act="config-id" style="margin-top:10px">Identificar-se</button></div></div></div>`));
    return;
  }
  if(!ag.dados && !ag.erro){
    if(!ag.carregando) carregaAgenda(false);
    cont.replaceChildren(el(`<div><div class="card full"><h2>📅 Agenda <span>seus eventos do Outlook → ticket de reunião</span></h2>${skeletonPainel()}</div></div>`));
    return;
  }
  const d=ag.dados||{};
  if(ag.erro || d.configurado===false){
    cont.replaceChildren(el(`<div><div class="card full"><h2>📅 Agenda</h2>
      <div class="estado">${esc(ag.erro||d.erro||'Não consegui carregar a agenda.')}
        <div style="margin-top:10px"><button class="btn" data-ag-refresh>Tentar de novo</button></div></div></div></div>`));
    return;
  }
  const evs=d.eventos||[]; const hoje=projHoje();
  // Organizador EXTERNO (fora do domínio da empresa): qualquer participante interno cria.
  const meuDom=String(((idApontar()||{}).email||'')).split('@')[1]||'';
  const orgExt=(ev)=>{ const oe=String((ev.organizador&&ev.organizador.email)||'').toLowerCase();
    return !!oe && !!meuDom && !oe.endsWith('@'+meuDom); };
  // 🎫 Controle de tickets: todo evento não particular precisa de ticket. O painel
  // mostra, POR REUNIÃO, quem deve criar (organizador; organizador externo → qualquer
  // interno), se já foi criado (e por quem) e a ação de cada linha.
  const pend=agPendentes()||[];
  const naoPriv=evs.filter(ev=>!ev.privado);
  // 🔎 Confere no Jira se as pendentes JÁ têm ticket criado fora do app (pelo resumo,
  // conta de serviço) — se achar, a linha oferece "usar este ticket" (1 clique vincula).
  ag.achados=ag.achados||{};
  const pendSem=naoPriv.filter(ev=>!agTicketDe(ev.id));
  if(pendSem.length && !ag.conferiu && !ag.conferindo){
    ag.conferindo=true;
    fetch('/api/reunioes',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({conferir:1,titulos:pendSem.map(ev=>ev.titulo)})})
      .then(r=>r.json()).then(j=>{ ag.conferindo=false; ag.conferiu=true;
        const a=(j&&j.achados)||{};
        pendSem.forEach(ev=>{ if(a[ev.titulo]&&a[ev.titulo].k) ag.achados[ev.id]=a[ev.titulo]; });
        if(estado.vista==='agenda') renderAgenda(); })
      .catch(()=>{ ag.conferindo=false; ag.conferiu=true; if(estado.vista==='agenda') renderAgenda(); });
  }
  const ctrlLinhas=naoPriv.map(ev=>{
    const tk=agTicketDe(ev.id); const ext=orgExt(ev);
    const orgNome=(ev.organizador&&(ev.organizador.nome||ev.organizador.email)||'').split(' ')[0];
    const quem=ev.meu?'Você (organizou)':ext?'Organizador externo — qualquer interno cria':`${orgNome} (organizou)`;
    const ach=!tk&&ag.achados[ev.id];
    const jaAvisado=!tk&&Object.values(cfg.inboxAvisos||{}).some(l=>(l||[]).some(a2=>a2.evId===ev.id));
    const situ=tk
      ?`<span class="ag-ct-ok">✓ criado</span> <a href="${jiraBase()}/browse/${encodeURIComponent(tk.t)}" target="_blank" rel="noopener">${esc(tk.t)} ↗</a>${tk.por?` <span class="muted small" data-tip="Quem criou o ticket">por ${esc(String(tk.por).split(' ')[0])}</span>`:''}`
      :ach?`<span class="ag-ct-ok">🟡 achei no Jira</span> <a href="${jiraBase()}/browse/${encodeURIComponent(ach.k)}" target="_blank" rel="noopener">${esc(ach.k)} ↗</a> <span class="muted small" title="${escA(ach.resumo||'')}">${esc(String(ach.resumo||'').slice(0,36))}</span>`
      :`<span class="ag-ct-pend">⚠ pendente</span>${ag.conferindo?' <span class="muted small">· 🔎 conferindo no Jira…</span>':''}`;
    // 🔁 Recorrente: liga/desliga a criação automática do ticket de cada ocorrência
    const reg=agRegraDe(ev);
    const btAuto=(ev.recorrente&&(ev.meu||ext))
      ? (reg?`<button class="btn" data-ag-auto="${escA(ev.id)}" data-tip="${escA(`Automático no projeto ${reg.projeto} — clique para desligar`)}">🔁 automático (${esc(reg.projeto)})</button>`
           :`<button class="btn" data-ag-auto="${escA(ev.id)}" data-tip="Toda ocorrência desta reunião recorrente vira ticket sozinha quando você abre a Agenda">⚡ automatizar</button>`)
      : '';
    const acao=tk
      ?(ev.meu?`<button class="btn" data-ag-convidar="${escA(ev.id)}">👥 convidar</button>${btAuto}`:btAuto)
      :ach?`<button class="btn primario" data-ag-usar="${escA(ev.id)}|${escA(ach.k)}" data-tip="Registra este ticket como o da reunião (vínculo compartilhado com o time)">✓ usar este ticket</button>`
      :((ev.meu||ext)?`<button class="btn primario" data-ag-criar="${escA(ev.id)}">📝 Criar/vincular</button>${btAuto}`
        :`<span class="muted small">aguarda ${esc(orgNome||'quem organizou')}</span> ${jaAvisado
          ?'<span class="badge" data-tip="O aviso já está no Inbox da pessoa">📨 avisado</span>'
          :`<button class="btn" data-ag-avisar="${escA(ev.id)}" data-tip="Envia um aviso para o 📥 Inbox de ${escA(orgNome||'quem organizou')}: esta reunião está sem ticket">📨 avisar no Inbox</button>`}`);
    return `<div class="ag-ct-row">
      <div><strong>${esc(ev.titulo)}</strong> <span class="muted small">· ${esc((ev.inicio||'').slice(0,10))}</span></div>
      <div class="muted small" data-tip="Quem deve criar o ticket desta reunião">${esc(quem)}</div>
      <div>${situ}</div>
      <div style="text-align:right">${acao}</div></div>`;
  }).join('');
  const nAuto=Object.keys(cfg.agendaAuto||{}).length;
  const caixaPend=naoPriv.length?`<div class="card full" style="margin-bottom:12px">
    <h2>🎫 Controle de tickets <span>quem cria o ticket de cada reunião e o que ainda falta — 🔒 particulares ficam de fora</span></h2>
    ${ag.autoRodando?'<div class="aviso" style="margin:6px 0 8px">🔁 Criando os tickets das reuniões recorrentes de hoje…</div>'
      :(nAuto?`<div class="muted small" style="margin:4px 0 8px">🔁 <b>${nAuto}</b> reunião(ões) recorrente(s) automatizada(s): o ticket de cada ocorrência é criado sozinho ao abrir a Agenda — resta apontar as horas.</div>`:'')}
    ${pend.length?`<div class="aviso" style="margin:6px 0 8px">📣 <strong>Novo evento sem ticket:</strong> <b>${pend.length}</b> reunião(ões) dependem de <b>você</b> criar o ticket — as que <b>você organizou</b> e as de <b>organizador externo</b> (qualquer participante da Dexterity cria). O time só aponta depois de criar e convidar.</div>`
      :'<div class="muted small" style="margin:4px 0 8px">✅ Nenhuma pendência sua — o que falta está com quem organizou.</div>'}
    <div class="ag-ct-head"><span>Reunião</span><span>Quem cria</span><span>Situação</span><span></span></div>
    ${ctrlLinhas}
  </div>`:'';
  const porDia={}; evs.forEach(ev=>{ const dia=(ev.inicio||'').slice(0,10)||'(sem data)'; (porDia[dia]=porDia[dia]||[]).push(ev); });
  const dias=Object.keys(porDia).sort();
  const blocos=dias.map(dia=>{
    const rows=porDia[dia].map(ev=>{
      const hora=ev.diaTodo?'dia todo':`${(ev.inicio||'').slice(11,16)}–${(ev.fim||'').slice(11,16)}`;
      const badge=ev.meu?'<span class="badge com-horas" data-tip="Você é o organizador">você organizou</span>'
        :'<span class="badge" data-tip="Você foi convidado(a)">convidado</span>';
      const tk=agTicketDe(ev.id);
      const priv=!!ev.privado;
      const selo=priv?'<span class="badge" data-tip="Evento particular — não precisa de ticket">🔒 particular</span>'
        :(tk?'':(ev.meu?'<span class="badge ms-b-atra" data-tip="Você organizou — crie o ticket para o time apontar">⚠ sem ticket</span>'
          :orgExt(ev)?'<span class="badge ms-b-atra" data-tip="Organizador de fora da Dexterity — QUALQUER participante da empresa pode criar o ticket">⚠ sem ticket — organizador externo: quem participa cria</span>'
          :`<span class="badge ms-b-sem" data-tip="Quem organizou cria o ticket e envia os convites de apontamento">sem ticket — cabe a ${escA((ev.organizador.nome||ev.organizador.email||'').split(' ')[0])}</span>`));
      const acao=tk
        ?`<a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(tk.t)}" target="_blank" rel="noopener">✓ ${esc(tk.t)} ↗</a>${tk.por?`<div class="muted small" data-tip="Quem criou o ticket">por ${esc(String(tk.por).split(' ')[0])}</div>`:''}${ev.meu?`<button class="btn" data-ag-convidar="${escA(ev.id)}" data-tip="Convidar (mais) participantes para apontar as horas desta reunião">👥 convidar</button>`:''}`
        :`<button class="btn ${priv||!(ev.meu||orgExt(ev))?'':'primario'}" data-ag-criar="${escA(ev.id)}" data-tip="Escolha o projeto (ou vincule a um ticket existente) e convide os participantes para apontar">📝 Criar/vincular ticket</button>`;
      return `<div class="ag-ev${dia<hoje?' ag-passado':''}">
        <div class="ag-hora">${esc(hora)}</div>
        <div class="ag-info"><strong>${esc(ev.titulo)}</strong> ${badge} ${selo}<br>
          <span class="muted small">${esc(ev.organizador.nome||ev.organizador.email)} · 👥 ${ev.participantes}${ev.local?` · ${esc(ev.local.slice(0,40))}`:''}${ev.link?` · <a href="${escA(ev.link)}" target="_blank" rel="noopener">entrar ↗</a>`:''}</span></div>
        <div class="ag-acao">${acao}</div></div>`;
    }).join('');
    return `<div class="vg-card" style="margin-bottom:12px"><h3>${esc(agRotuloDia(dia))} <span class="muted small" style="font-weight:400">· ${porDia[dia].length} evento(s)</span></h3>${rows}</div>`;
  }).join('');
  cont.replaceChildren(el(`<div>
    <div class="card full"><h2>📅 Agenda <span>${esc(d.de||'')} → ${esc(d.ate||'')} · seus eventos do Outlook — 1 clique vira ticket de reunião</span></h2>
      <div class="ts-fonte" style="gap:12px;flex-wrap:wrap">
        <span class="muted small">${evs.length} evento(s) · convites de ${esc((d.ocultarDe||[]).join(', '))} ficam ocultos (menos na agenda de quem organizou)${d.nOcultos?` · ${d.nOcultos} oculto(s)`:''}</span>
        <span class="spacer"></span><button class="btn" data-ag-refresh title="Rebuscar a agenda ignorando o cache">⟳ Atualizar</button></div>
      ${evs.length?'':'<div class="estado" style="margin-top:10px">Nenhum evento no período.</div>'}
    </div>
    ${caixaPend}
    ${blocos}
  </div>`));
}
// Interações da Agenda (delegadas em #conteudo).
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const rf=e.target.closest&&e.target.closest('[data-ag-refresh]');
  if(rf){ const ag=estado.agenda; ag.dados=null; ag.erro=''; ag.conferiu=false; ag.achados={}; carregaAgenda(true); renderAgenda(); return; }
  const av=e.target.closest&&e.target.closest('[data-ag-avisar]');
  if(av){ if(!idApontar()){ abreIdentidade(); return; } agAvisaInbox(av.getAttribute('data-ag-avisar')); return; }
  const us=e.target.closest&&e.target.closest('[data-ag-usar]');
  if(us){ const v=us.getAttribute('data-ag-usar'); const i=v.lastIndexOf('|');
    const evId=v.slice(0,i), key=v.slice(i+1);
    agMarcaTicket(evId,key); toast(`✓ ${key} registrado como o ticket da reunião.`,'ok');
    pintaBadgeInbox(); renderAgenda(); return; }
  const cv=e.target.closest&&e.target.closest('[data-ag-convidar]');
  if(cv){ if(!idApontar()){ abreIdentidade(); return; }
    const tk=agTicketDe(cv.getAttribute('data-ag-convidar'));
    agAbreTicket(cv.getAttribute('data-ag-convidar'), (tk&&tk.t)||''); return; }
  const bt=e.target.closest&&e.target.closest('[data-ag-criar]');
  if(!bt) return;
  if(!idApontar()){ abreIdentidade(); return; }
  agAbreTicket(bt.getAttribute('data-ag-criar'));
});
// Modal do ticket da reunião (vive em #modal): confirmar, trocar modo/projeto.
document.addEventListener('click',(e)=>{
  const c=e.target.closest&&e.target.closest('[data-agm-conf]');
  if(c){ agConfirma(); return; }
  const r=e.target.closest&&e.target.closest('[data-agm-real]');
  if(r&&_agM){ agDuracaoReal(_agM.evId, r).then(j=>{ if(!_agM) return;
    if(j&&j.ok&&(j.minhaSeg>0||j.duracaoSeg>0)){
      _agM.segReal=j.minhaSeg>0?j.minhaSeg:j.duracaoSeg;
      const q=(x)=>fmtH(x);
      _agM.realNota=`⏱ Teams: a reunião durou ${q(j.duracaoSeg)}${j.minhaSeg>0?` e você ficou ${q(j.minhaSeg)}`:''} · ${j.total} participante(s) no relatório.`;
    } else if(j&&j.ok){ _agM.realNota='O relatório do Teams não registrou permanência — mantida a duração agendada.'; }
    agAtualizaModal(); }); return; }
  const g=e.target.closest&&e.target.closest('[data-agm-agendada]');
  if(g&&_agM){ _agM.segReal=0; _agM.realNota=''; agAtualizaModal(); return; }
  // 🔁 Automatizar/desautomatizar a SÉRIE recorrente (linha do controle de tickets)
  const au=e.target.closest&&e.target.closest('[data-ag-auto]');
  if(au){ const evId=au.getAttribute('data-ag-auto');
    const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===evId); if(!ev) return;
    if(agRegraDe(ev)){ agRemoveRegra(ev); toast('Automação desligada para esta reunião recorrente.','ok'); renderAgenda(); return; }
    if(!idApontar()){ abreIdentidade(); return; }
    agAbreAuto(ev); return; }
});
document.addEventListener('change',(e)=>{
  const t=e.target; if(!t||!t.matches||!_agM) return;
  if(t.matches('input[name=agm-modo]')||t.matches('#agm-proj')) agAtualizaModal();
});

