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
  usuariosP().then(j=>{ ag.usuCarr=false; ag.usuarios=(j&&j.pessoas)||{}; agAtualizaModal(); })
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
// ===========================================================================
// 🚫 REUNIÕES IGNORADAS — nem todo convite vira ticket
// Bloqueio de foco, all-hands, convite em massa: a reunião existe na agenda mas
// NUNCA vai ter apontamento. Ignorar tira a linha da cobrança (aqui, no card do
// Início e no 📆 Fechamento) sem apagar nada do Outlook nem do Jira.
// A chave é a SÉRIE quando a reunião é recorrente (ignorar a daily ignora todas
// as ocorrências, que é o que faz sentido) e o próprio evento quando é avulsa.
// LEITORES NÃO CRIAM cfg.agendaIgnorar: criar {} durante o render marcaria a
// chave como alterada por esta sessão e ela venceria o remoto no merge da config.
// ===========================================================================
function agIgnChave(ev){ const s=agSerieDe(ev); return s?`s:${s}`:`e:${String((ev&&ev.id)||'')}`; }
function agIgnorado(ev){ const m=cfg.agendaIgnorar; return !!(m&&m[agIgnChave(ev)]); }
// agIgnora/agDesignora NÃO gravam — quem chama faz salvaCfg() (assim o "ignorar
// todas as passadas" grava uma vez só, em vez de uma por reunião).
function agIgnora(ev){
  const k=agIgnChave(ev); if(!k||k==='e:') return;
  const id=idApontar()||{};
  cfg.agendaIgnorar=cfg.agendaIgnorar||{};
  cfg.agendaIgnorar[k]={ titulo:String(ev.titulo||'').slice(0,80), serie:!!agSerieDe(ev),
    por:id.nome||id.email||'', quando:new Date().toISOString() };
  // Higiene: mesma regra dos vínculos — acima de 120 entradas, as mais antigas saem.
  const ks=Object.keys(cfg.agendaIgnorar);
  if(ks.length>120) ks.sort((x,y)=>String(cfg.agendaIgnorar[x].quando||'').localeCompare(String(cfg.agendaIgnorar[y].quando||'')))
    .slice(0,ks.length-120).forEach(k2=>delete cfg.agendaIgnorar[k2]);
}
function agDesignora(chave){ if(cfg.agendaIgnorar&&cfg.agendaIgnorar[chave]) delete cfg.agendaIgnorar[chave]; }
// Domínio da empresa (o e-mail de quem está identificado) e organizador de FORA.
function agMeuDominio(){ return String(((idApontar()||{}).email||'')).split('@')[1]||''; }
function agOrgExterno(ev){
  const oe=String((ev&&ev.organizador&&ev.organizador.email)||'').toLowerCase();
  const d=agMeuDominio(); return !!oe && !!d && !oe.endsWith('@'+d);
}
// Classificação ÚNICA de cada reunião do 🎫 Controle de tickets — é ela que
// decide em que bloco a linha aparece e quem a lê (Início, Fechamento do mês):
//   'ok'     já tem ticket vinculado
//   'minha'  sem ticket e depende de VOCÊ (você organizou ou o organizador é externo)
//   'colega' sem ticket e depende de um COLEGA da Dexterity que convidou você
//   'ign'    marcada como "não precisa de ticket"
function agClasse(ev){
  if(agTicketDe(ev.id)) return 'ok';
  if(agIgnorado(ev)) return 'ign';
  if(ev.meu||agOrgExterno(ev)) return 'minha';
  return 'colega';
}
// Aviso de "reunião sem ticket" já gravado no Inbox de alguém para este evento.
function agAvisoDe(evId){
  let achado=null;
  Object.values(cfg.inboxAvisos||{}).forEach(l=>(l||[]).forEach(a=>{ if(!achado&&a&&a.evId===evId) achado=a; }));
  return achado;
}
function agDiasAtras(dia){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(dia||''))) return 0;
  const a=Date.parse(`${dia}T12:00:00-03:00`), b=Date.parse(`${projHoje()}T12:00:00-03:00`);
  return isFinite(a)&&isFinite(b)?Math.round((b-a)/86400000):0;
}
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
      if(estado.vista==='agenda') renderAgenda(); else agendaRenderAcoes();
      try{ agAutoCria(); }catch(e){} })
    .catch(e=>{ ag.carregando=false; ag.erro=humanizaErro(e); if(estado.vista==='agenda') renderAgenda(); else agendaRenderAcoes(); });
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
// externo (qualquer participante interno cria). As ignoradas ficam de fora — é
// isso que faz o 🚫 valer também no card do Início e no 📆 Fechamento do mês.
// Null enquanto a agenda não carregou.
function agPendentes(){
  const d=estado.agenda&&estado.agenda.dados; if(!d||!Array.isArray(d.eventos)) return null;
  return d.eventos.filter(ev=>!ev.privado&&agClasse(ev)==='minha');
}
// Reuniões em que um COLEGA da Dexterity convidou você e não criou o ticket —
// você não consegue apontar enquanto ele não criar. Null antes de carregar.
function agAguardando(){
  const d=estado.agenda&&estado.agenda.dados; if(!d||!Array.isArray(d.eventos)) return null;
  return d.eventos.filter(ev=>!ev.privado&&agClasse(ev)==='colega');
}
// 📨 Cobra o ORGANIZADOR pelo Inbox: grava um aviso "reunião sem ticket" na config
// compartilhada (cfg.inboxAvisos[conta do organizador]) — some sozinho quando o
// ticket é criado/vinculado (limpeza no agMarcaTicket).
// Grava o aviso (sem salvaCfg — quem chama grava, para o lote sair numa gravação
// só). Devolve {ok, nome} ou {ok:false, erro} quando não há conta do Jira.
function agGravaAviso(ev, id){
  const oe=String((ev.organizador&&ev.organizador.email)||'').toLowerCase();
  const ent=Object.entries(estado.agenda.usuarios||{}).find(([,u])=>String(u.email||'').toLowerCase()===oe);
  if(!ent) return { ok:false, erro:`Não achei a conta do Jira de ${oe||'quem organizou'} — sem Inbox para avisar.` };
  const [acc,u]=ent; const nome=u.nome||oe;
  cfg.inboxAvisos=cfg.inboxAvisos||{};
  const lst=cfg.inboxAvisos[acc]=cfg.inboxAvisos[acc]||[];
  if(lst.some(a=>a.evId===ev.id)) return { ok:false, jaTinha:true, nome };
  lst.push({ evId:ev.id, titulo:ev.titulo, dia:(ev.inicio||'').slice(0,10), de:id.nome||id.email||'', quando:new Date().toISOString() });
  if(lst.length>30) lst.splice(0,lst.length-30);
  logAcao({acao:'agenda-avisar-inbox', t:ev.titulo, para:nome, ok:true});
  return { ok:true, nome };
}
async function agGaranteUsuarios(){
  if(estado.agenda.usuarios) return;
  try{ const j=await usuariosP(); estado.agenda.usuarios=(j&&j.pessoas)||{}; }
  catch(e){ estado.agenda.usuarios={}; }
}
async function agAvisaInbox(evId){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===evId); if(!ev) return;
  await agGaranteUsuarios();
  const r=agGravaAviso(ev, id);
  if(r.jaTinha){ toast(`Já existe um aviso deste evento no Inbox de ${r.nome}.`,'ok'); renderAgenda(); return; }
  if(!r.ok){ toast(r.erro,'err'); return; }
  salvaCfg();
  toast(`📨 Aviso enviado para o Inbox de ${r.nome}.`,'ok');
  renderAgenda();
}
// 📨 Cobra de uma vez TODO MUNDO que deixou reunião sua sem ticket.
async function agCobraTodos(){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  await agGaranteUsuarios();
  const alvos=(agAguardando()||[]).filter(ev=>!agAvisoDe(ev.id));
  if(!alvos.length){ toast('Todo mundo já foi avisado — nada novo para cobrar.','ok'); return; }
  const nomes=new Set(); let falhas=0;
  alvos.forEach(ev=>{ const r=agGravaAviso(ev, id); if(r.ok) nomes.add(r.nome); else if(!r.jaTinha) falhas++; });
  if(nomes.size) salvaCfg();
  if(nomes.size) toast(`📨 ${alvos.length-falhas} aviso(s) no Inbox de ${[...nomes].map(n=>String(n).split(' ')[0]).join(', ')}.`,'ok');
  if(falhas) toast(`⚠ ${falhas} organizador(es) sem conta no Jira — esses ficam sem aviso.`,'warn');
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
  const orgExt=agOrgExterno;
  // 🎫 Controle de tickets: todo evento não particular precisa de ticket. O painel
  // SEPARA por responsabilidade, em vez de despejar tudo numa lista só:
  //   ⚠ com você (e, dentro dela, o que já passou fica recolhido)
  //   ⏳ aguardando quem organizou — você foi convidado e não consegue apontar
  //   ✓ com ticket · 🚫 ignoradas (recolhidos: são a maior parte do ruído)
  const naoPriv=evs.filter(ev=>!ev.privado);
  const grupos={ ok:[], minha:[], colega:[], ign:[] };
  naoPriv.forEach(ev=>grupos[agClasse(ev)].push(ev));
  const pend=grupos.minha;
  const pendPass=pend.filter(ev=>(ev.inicio||'').slice(0,10)<hoje);
  const pendProx=pend.filter(ev=>(ev.inicio||'').slice(0,10)>=hoje);
  const aguard=grupos.colega;
  const aguardSeg=aguard.reduce((s,ev)=>s+agDuracaoSeg(ev),0);
  const aguardSemAviso=aguard.filter(ev=>!agAvisoDe(ev.id)).length;
  const aberto=(k)=>!!(ag.secoes||{})[k];
  // 🔎 Confere no Jira se as pendentes JÁ têm ticket criado fora do app (pelo resumo,
  // conta de serviço) — se achar, a linha oferece "usar este ticket" (1 clique vincula).
  ag.achados=ag.achados||{};
  const pendSem=pend.concat(aguard);
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
  // Peças reaproveitadas pelas linhas dos quatro blocos.
  const ctQuando=(ev)=>{ const dia=(ev.inicio||'').slice(0,10); const n=agDiasAtras(dia);
    return `<span class="muted small">· ${esc(alxDataBR(dia))}${dia===hoje?' · <b>hoje</b>':''}</span>`
      +(n>0?` <span class="ag-ct-atras" data-tip="Quanto tempo esta reunião está sem ticket">há ${n} dia${n>1?'s':''}</span>`:'');
  };
  const ctAchado=(ev)=>ag.achados[ev.id];
  const ctUsar=(ev,ach)=>`<button class="btn primario" data-ag-usar="${escA(ev.id)}|${escA(ach.k)}" data-tip="Registra este ticket como o da reunião (vínculo compartilhado com o time)">✓ usar este ticket</button>`;
  const ctSituAchado=(ach)=>`<span class="ag-ct-ok">🟡 achei no Jira</span> <a href="${jiraBase()}/browse/${encodeURIComponent(ach.k)}" target="_blank" rel="noopener">${esc(ach.k)} ↗</a> <span class="muted small" title="${escA(ach.resumo||'')}">${esc(String(ach.resumo||'').slice(0,36))}</span>`;
  const ctIgnorar=(ev)=>`<button class="btn" data-ag-ignorar="${escA(ev.id)}" data-tip="${escA(agSerieDe(ev)
    ?'Tira esta reunião recorrente (todas as ocorrências) da cobrança — nada muda no Outlook nem no Jira'
    :'Tira esta reunião da cobrança — nada muda no Outlook nem no Jira')}">🚫 ignorar</button>`;
  // 🔁 Recorrente: liga/desliga a criação automática do ticket de cada ocorrência.
  const ctAuto=(ev)=>{ if(!(ev.recorrente&&(ev.meu||orgExt(ev)))) return '';
    const reg=agRegraDe(ev);
    return reg?`<button class="btn" data-ag-auto="${escA(ev.id)}" data-tip="${escA(`Automático no projeto ${reg.projeto} — clique para desligar`)}">🔁 automático (${esc(reg.projeto)})</button>`
      :`<button class="btn" data-ag-auto="${escA(ev.id)}" data-tip="Toda ocorrência desta reunião recorrente vira ticket sozinha quando você abre a Agenda">⚡ automatizar</button>`; };
  const ctRow=(c1,c2,c3,c4)=>`<div class="ag-ct-row"><div>${c1}</div><div class="muted small">${c2}</div><div>${c3}</div><div class="ag-ct-acao">${c4}</div></div>`;
  // Cabeçalho e linhas dividem UM grid (display:contents nos filhos) — senão cada
  // linha resolve as colunas sozinha e o cabeçalho não alinha com o conteúdo.
  const ctTab=(a,b,linhas)=>`<div class="ag-ct-tab"><div class="ag-ct-head"><span>Reunião</span><span>${a}</span><span>${b}</span><span></span></div>${linhas}</div>`;
  // ⚠ Depende de VOCÊ — você organizou ou o organizador é de fora da Dexterity.
  const linhaMinha=(ev)=>{
    const ach=ctAchado(ev);
    const quem=ev.meu?'Você (organizou)':'Organizador externo — qualquer interno cria';
    const situ=ach?ctSituAchado(ach)
      :`<span class="ag-ct-pend">⚠ pendente</span>${ag.conferindo?' <span class="muted small">· 🔎 conferindo no Jira…</span>':''}`;
    const acao=ach?ctUsar(ev,ach)+ctIgnorar(ev)
      :`<button class="btn primario" data-ag-criar="${escA(ev.id)}">📝 Criar/vincular</button>${ctAuto(ev)}${ctIgnorar(ev)}`;
    return ctRow(`<strong>${esc(ev.titulo)}</strong> ${ctQuando(ev)}`, esc(quem), situ, acao);
  };
  // ⏳ Depende de um COLEGA — ele convidou, não criou o ticket e você fica sem apontar.
  const linhaColega=(ev)=>{
    const ach=ctAchado(ev);
    const org=(ev.organizador&&(ev.organizador.nome||ev.organizador.email))||'quem organizou';
    const av=agAvisoDe(ev.id);
    const dAv=av?agDiasAtras(String(av.quando||'').slice(0,10)):0;
    const situ=ach?ctSituAchado(ach)
      :`<span class="ag-ct-pend">⏳ sem ticket</span> <span class="badge" data-tip="Horas suas que ficam sem apontamento enquanto o ticket não existe">⏱ ${esc(fmtH(agDuracaoSeg(ev)))}</span>`
        +(av?` <span class="badge" data-tip="${escA(`Aviso no Inbox de ${org}${av.quando?` em ${alxDataBR(String(av.quando).slice(0,10))}`:''}`)}">📨 avisado${dAv>0?` há ${dAv}d`:''}</span>`:'');
    const acao=ach?ctUsar(ev,ach)+ctIgnorar(ev)
      :`${av?'':`<button class="btn primario" data-ag-avisar="${escA(ev.id)}" data-tip="${escA(`Envia um aviso para o 📥 Inbox de ${org}: esta reunião está sem ticket`)}">📨 cobrar</button>`}`
        +`<button class="btn" data-ag-criar="${escA(ev.id)}" data-tip="${escA(`Não dá para esperar: crie (ou vincule) você mesmo o ticket e aponte — ${org} continua vendo o vínculo`)}">📝 criar assim mesmo</button>${ctIgnorar(ev)}`;
    return ctRow(`<strong>${esc(ev.titulo)}</strong> ${ctQuando(ev)}`,
      `${esc(String(org).split(' ')[0])} <span class="muted">convidou você</span>`, situ, acao);
  };
  // ✓ Resolvidas — ficam recolhidas: é o grosso da lista e não pede nada de ninguém.
  const linhaOk=(ev)=>{
    const tk=agTicketDe(ev.id);
    const quem=ev.meu?'Você (organizou)':orgExt(ev)?'Organizador externo':`${esc(String((ev.organizador&&(ev.organizador.nome||ev.organizador.email))||'').split(' ')[0])} (organizou)`;
    const situ=`<span class="ag-ct-ok">✓ criado</span> <a href="${jiraBase()}/browse/${encodeURIComponent(tk.t)}" target="_blank" rel="noopener">${esc(tk.t)} ↗</a>${tk.por?` <span class="muted small" data-tip="Quem criou o ticket">por ${esc(String(tk.por).split(' ')[0])}</span>`:''}`;
    const acao=(ev.meu?`<button class="btn" data-ag-convidar="${escA(ev.id)}">👥 convidar</button>`:'')+ctAuto(ev);
    return ctRow(`<strong>${esc(ev.titulo)}</strong> ${ctQuando(ev)}`, quem, situ, acao);
  };
  // 🚫 Ignoradas — agrupadas pela CHAVE (a série aparece uma vez, não uma por dia).
  const ignChaves={};
  grupos.ign.forEach(ev=>{ const k=agIgnChave(ev); (ignChaves[k]=ignChaves[k]||{ ev, n:0 }).n++; });
  const linhasIgn=Object.entries(ignChaves).map(([k,{ev,n}])=>{
    const reg=(cfg.agendaIgnorar||{})[k]||{};
    return ctRow(`<strong>${esc(ev.titulo)}</strong>${n>1?` <span class="badge" data-tip="Ocorrências desta série no período da agenda">${n}×</span>`:''}`,
      `${reg.serie?'série recorrente':'reunião avulsa'}${reg.por?` · 🚫 por ${esc(String(reg.por).split(' ')[0])}`:''}${reg.quando?` em ${esc(alxDataBR(String(reg.quando).slice(0,10)))}`:''}`,
      '<span class="muted small">fora da cobrança</span>',
      `<button class="btn" data-ag-designorar="${escA(k)}" data-tip="Volta a aparecer nas pendências (e no card do Início)">↩ voltar a cobrar</button>`);
  }).join('');
  const nAuto=Object.keys(cfg.agendaAuto||{}).length;
  const secao=(k,titulo,corpo)=>`<details class="ag-sec"${aberto(k)?' open':''}><summary data-ag-sec="${escA(k)}">${titulo}</summary><div class="ag-sec-corpo">${corpo}</div></details>`;
  const blocoMinhas=pend.length?`<div class="ag-ct-bloco">
      <h3 class="ag-ct-h">⚠ Dependem de você <span class="muted small">· ${pend.length} reunião(ões) — as que você organizou e as de organizador externo (qualquer participante da Dexterity cria). O time só aponta depois de criar e convidar.</span></h3>
      ${pendProx.length?ctTab('Quem cria','Situação',pendProx.map(linhaMinha).join(''))
        :'<div class="muted small" style="padding:6px 0">✅ Nada pendente de hoje em diante.</div>'}
      ${pendPass.length?secao('passadas',`🕗 Já aconteceram <span class="muted small">· ${pendPass.length} reunião(ões) atrasada(s) — o apontamento delas ainda depende de você</span>`,
        `<div class="ag-sec-acao"><button class="btn" data-ag-ign-passadas="1" data-tip="Tira da cobrança todas as reuniões já passadas que dependem de você — nada muda no Outlook nem no Jira">🚫 ignorar as ${pendPass.length} passadas</button></div>`
        +ctTab('Quem cria','Situação',pendPass.map(linhaMinha).join('')))
        :''}
    </div>`
    :'<div class="muted small" style="margin:4px 0 8px">✅ Nenhuma pendência sua — o que falta está com quem organizou.</div>';
  const blocoAguard=aguard.length?`<div class="ag-ct-bloco">
      <h3 class="ag-ct-h">⏳ Aguardando quem organizou <span class="muted small">· ${aguard.length} reunião(ões) de colegas da Dexterity sem ticket — <b>${esc(fmtH(aguardSeg))}</b> suas sem onde apontar</span></h3>
      <div class="ag-sec-acao">${aguardSemAviso?`<button class="btn primario" data-ag-cobrar-todos="1" data-tip="Deixa um aviso 'reunião sem ticket' no 📥 Inbox de cada organizador que ainda não foi cobrado">📨 cobrar os ${aguardSemAviso} pendentes</button>`
        :'<span class="muted small">📨 todo mundo já foi avisado — se não puder esperar, crie o ticket você mesmo na linha.</span>'}</div>
      ${ctTab('Quem deve criar','Situação',aguard.map(linhaColega).join(''))}
    </div>`:'';
  const caixaPend=naoPriv.length?`<div class="card full" style="margin-bottom:12px">
    <h2>🎫 Controle de tickets <span>quem cria o ticket de cada reunião e o que ainda falta — 🔒 particulares ficam de fora</span></h2>
    ${ag.autoRodando?'<div class="aviso" style="margin:6px 0 8px">🔁 Criando os tickets das reuniões recorrentes de hoje…</div>'
      :(nAuto?`<div class="muted small" style="margin:4px 0 8px">🔁 <b>${nAuto}</b> reunião(ões) recorrente(s) automatizada(s): o ticket de cada ocorrência é criado sozinho ao abrir a Agenda — resta apontar as horas.</div>`:'')}
    <div class="ag-ct-kpis">
      <span class="ag-ct-kpi ${pend.length?'w':'t'}">⚠ <b>${pend.length}</b> com você</span>
      <span class="ag-ct-kpi ${aguard.length?'w':'t'}">⏳ <b>${aguard.length}</b> com colegas${aguard.length?` · ${esc(fmtH(aguardSeg))} suas`:''}</span>
      <span class="ag-ct-kpi t">✓ <b>${grupos.ok.length}</b> com ticket</span>
      ${grupos.ign.length?`<span class="ag-ct-kpi">🚫 <b>${Object.keys(ignChaves).length}</b> ignorada(s)</span>`:''}
    </div>
    ${blocoMinhas}
    ${blocoAguard}
    ${grupos.ok.length?secao('ok',`✓ Com ticket <span class="muted small">· ${grupos.ok.length} reunião(ões) resolvida(s) — nada a fazer</span>`,
      ctTab('Quem criou','Ticket',grupos.ok.map(linhaOk).join(''))):''}
    ${linhasIgn?secao('ign',`🚫 Ignoradas <span class="muted small">· ${Object.keys(ignChaves).length} reunião(ões) que não viram ticket</span>`,
      ctTab('O que é','Situação',linhasIgn)):''}
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
      const ign=!priv&&!tk&&agIgnorado(ev);
      const selo=priv?'<span class="badge" data-tip="Evento particular — não precisa de ticket">🔒 particular</span>'
        :(tk?'':ign?'<span class="badge" data-tip="Marcada como &quot;não precisa de ticket&quot; no 🎫 Controle de tickets — sai das pendências">🚫 ignorada</span>'
          :(ev.meu?'<span class="badge ms-b-atra" data-tip="Você organizou — crie o ticket para o time apontar">⚠ sem ticket</span>'
          :orgExt(ev)?'<span class="badge ms-b-atra" data-tip="Organizador de fora da Dexterity — QUALQUER participante da empresa pode criar o ticket">⚠ sem ticket — organizador externo: quem participa cria</span>'
          :`<span class="badge ms-b-sem" data-tip="Quem organizou cria o ticket e envia os convites de apontamento">sem ticket — cabe a ${escA((ev.organizador.nome||ev.organizador.email||'').split(' ')[0])}</span>`));
      const acao=tk
        ?`<a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(tk.t)}" target="_blank" rel="noopener">✓ ${esc(tk.t)} ↗</a>${tk.por?`<div class="muted small" data-tip="Quem criou o ticket">por ${esc(String(tk.por).split(' ')[0])}</div>`:''}${ev.meu?`<button class="btn" data-ag-convidar="${escA(ev.id)}" data-tip="Convidar (mais) participantes para apontar as horas desta reunião">👥 convidar</button>`:''}`
        :`<button class="btn ${priv||ign||!(ev.meu||orgExt(ev))?'':'primario'}" data-ag-criar="${escA(ev.id)}" data-tip="Escolha o projeto (ou vincule a um ticket existente) e convide os participantes para apontar">📝 Criar/vincular ticket</button>`;
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
  // Blocos recolhíveis: o <details> abre/fecha sozinho — aqui só guardamos o estado
  // para o próximo render (que acontece a cada ação) não fechar tudo de novo.
  const sc=e.target.closest&&e.target.closest('summary[data-ag-sec]');
  if(sc){ const det=sc.parentElement;
    estado.agenda.secoes=estado.agenda.secoes||{};
    estado.agenda.secoes[sc.getAttribute('data-ag-sec')]=!(det&&det.open); return; }
  const rf=e.target.closest&&e.target.closest('[data-ag-refresh]');
  if(rf){ const ag=estado.agenda; ag.dados=null; ag.erro=''; ag.conferiu=false; ag.achados={}; carregaAgenda(true); renderAgenda(); return; }
  const av=e.target.closest&&e.target.closest('[data-ag-avisar]');
  if(av){ if(!idApontar()){ abreIdentidade(); return; } agAvisaInbox(av.getAttribute('data-ag-avisar')); return; }
  const cb=e.target.closest&&e.target.closest('[data-ag-cobrar-todos]');
  if(cb){ agCobraTodos(); return; }
  const ig=e.target.closest&&e.target.closest('[data-ag-ignorar]');
  if(ig){ const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===ig.getAttribute('data-ag-ignorar')); if(!ev) return;
    if(agSerieDe(ev)&&!confirm(`Ignorar "${ev.titulo}"? Esta reunião é recorrente — TODAS as ocorrências saem das pendências (aqui, no card do Início e no Fechamento do mês). Nada muda no Outlook nem no Jira, e dá para voltar a cobrar quando quiser.`)) return;
    agIgnora(ev); salvaCfg();
    logAcao({acao:'agenda-ignorar', t:ev.titulo, serie:!!agSerieDe(ev), ok:true});
    toast(`🚫 "${String(ev.titulo).slice(0,40)}" saiu das pendências${agSerieDe(ev)?' (toda a série)':''}.`,'ok');
    renderAgenda(); return; }
  const dg=e.target.closest&&e.target.closest('[data-ag-designorar]');
  if(dg){ agDesignora(dg.getAttribute('data-ag-designorar')); salvaCfg();
    toast('↩ Reunião de volta às pendências.','ok'); renderAgenda(); return; }
  const ip=e.target.closest&&e.target.closest('[data-ag-ign-passadas]');
  if(ip){ const hoje=projHoje();
    const alvos=(agPendentes()||[]).filter(ev=>(ev.inicio||'').slice(0,10)<hoje);
    if(!alvos.length){ toast('Nada passado para ignorar.','ok'); return; }
    if(!confirm(`Ignorar ${alvos.length} reunião(ões) já passada(s)? Elas saem das pendências (e do card do Início); reuniões recorrentes saem com todas as ocorrências. Nada muda no Outlook nem no Jira.`)) return;
    alvos.forEach(ev=>agIgnora(ev)); salvaCfg();
    logAcao({acao:'agenda-ignorar-passadas', n:alvos.length, ok:true});
    toast(`🚫 ${alvos.length} reunião(ões) passada(s) fora da cobrança.`,'ok');
    renderAgenda(); return; }
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

