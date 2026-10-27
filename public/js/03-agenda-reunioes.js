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
// ===========================================================================
// 🔒 TRAVA DO TICKET DE REUNIÃO (2026-10-27, a pedido do usuário: "uma pessoa que organizou demora para criar, todo
// mundo fica sem apontar, e se outra pessoa cria não existe trava; os eventos que envolvem pessoas da Dexterity podem
// ser criados por qualquer pessoa, mas se uma cria, outra não pode criar o mesmo evento"). O `id` do evento muda de
// agenda para agenda — por isso o vínculo antigo (cfg.agendaTickets[evId]) não aparecia para quem não criou. A chave
// comum é o `uid` (iCalUId do Outlook) e a trava mora no servidor (api/_lib/agenda.js, uma linha por reunião no
// Supabase: o INSERT é a trava). estado.agenda.travas = { uid: {estado:'criando'|'ok', k, por:{acc,nome}, em, vencida} }.
// Regras: (1) qualquer participante cria — quem RESERVAR primeiro cria; os outros veem "Fulano está criando" e, depois,
// o ticket — e o 📝 vira "aponte no ticket que já existe"; (2) a reserva vale 3 min (navegador que morreu não trava a
// reunião para sempre) e o ticket leva a label da reunião (`rotulo`), que o servidor confere antes de deixar outra
// pessoa assumir; (3) a leitura das travas sai junto com a agenda (uma chamada) e de novo antes de abrir o 📝.
// ===========================================================================
function agEvento(evId){ return ((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===evId)||null; }
function agTravaDe(ev){ const u=ev&&ev.uid; return u?((estado.agenda.travas||{})[u]||null):null; }
function agTravaMeta(ev){ return { uid:ev.uid, titulo:ev.titulo||'', dia:(ev.inicio||'').slice(0,10),
  org:{ email:((ev.organizador||{}).email)||'', nome:((ev.organizador||{}).nome)||'' } }; }
function agTravaPost(corpo){
  const id=idApontar(); if(!id) return Promise.reject(new Error('Identifique-se (e-mail + token do Jira).'));
  return fetch('/api/reunioes',{ method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(Object.assign({ email:id.email, token:id.token }, corpo)) }).then(r=>r.json());
}
function agGuardaTrava(ev, tv){ if(!ev||!ev.uid) return; const ag=estado.agenda; ag.travas=ag.travas||{};
  if(tv) ag.travas[ev.uid]=tv; else delete ag.travas[ev.uid];
  if(tv&&tv.estado==='ok') agTiraAlerta(ev.uid);   // ⏰ a reunião ganhou ticket: o alerta do fim do dia sai do 📥 Inbox
}
// ⏰ Tira do 📥 Inbox (em memória) o alerta de fim do dia desta reunião — ganhou ticket ou foi ignorada.
function agTiraAlerta(uid){ const ib=estado.inbox; if(!uid||!ib||!Array.isArray(ib.agAlertas)) return;
  const f=ib.agAlertas.filter(a=>a.uid!==uid); if(f.length!==ib.agAlertas.length){ ib.agAlertas=f; try{ pintaBadgeInbox(); }catch(e){} } }
// A reserva só vale com um SIM do servidor (revisão de 2026-10-27): resposta de erro ({erro} sem `ok`, 500, 401…)
// não pode contar como reservada — senão a trava "falha aberta" e duas pessoas criam no meio de uma queda.
function agReservaOk(tv){ return !!(tv&&(tv.reservado===true||tv.semTrava===true)); }
const AG_TRAVA_TTL_MS=3*60*1000;
// Alguém (que não sou eu) reservou a reunião e ainda não confirmou o ticket. A reserva vence em 3 min — conferido
// também aqui (a Início fica aberta o dia todo e a lista das travas não é relida a cada minuto).
function agCriandoOutro(ev){ const tv=agTravaDe(ev); const eu=(idApontar()||{}).accountId||'';
  if(!(tv&&tv.estado==='criando'&&!tv.vencida&&tv.por&&tv.por.acc&&tv.por.acc!==eu)) return false;
  const t=Date.parse(tv.em||''); return !(isFinite(t)&&Date.now()-t>AG_TRAVA_TTL_MS+30000); }
// Quem é o "dono" do ticket da reunião para o 👥 convidar: quem CRIOU (trava); sem trava, quem organizou.
function agSouDonoTicket(ev){ const tv=agTravaDe(ev); const eu=(idApontar()||{}).accountId||'-';
  return (tv&&tv.estado==='ok'&&tv.por&&tv.por.acc)?tv.por.acc===eu:!!(ev&&ev.meu); }
function agRedesenhaTela(){ if(agVistaAberta()) renderAgenda(); else if(typeof hjVistaAberta==='function'&&hjVistaAberta()) renderHoje(); else if(estado.vista==='acoes') agendaRenderAcoes(); }
// Lê as travas de todas as reuniões da agenda (uma chamada). Vínculo ANTIGO (cfg.agendaTickets, pela chave da MINHA
// agenda) sem trava vira trava — é assim que o ticket que alguém vinculou antes desta versão aparece para os colegas.
let _agTravaRelerT=null;
function agCarregaTravas(){
  const ag=estado.agenda; const evs=((ag.dados||{}).eventos||[]).filter(ev=>ev.uid&&!ev.privado);
  if(!evs.length||ag.travasCarr||!idApontar()) return;
  ag.travasCarr=true;
  // em lotes de 150 (o servidor lê até 200 por pedido; a agenda pode ter bem mais reuniões no período)
  const uids=[...new Set(evs.map(ev=>ev.uid))]; const lotes=[]; for(let i=0;i<uids.length;i+=150) lotes.push(uids.slice(i,i+150));
  Promise.all(lotes.map(l=>agTravaPost({ agtrava:'ler', uids:l }))).then(js=>{
    ag.travasCarr=false;
    const ruim=js.find(j=>!(j&&j.ok));
    if(ruim){ ag.travasErro=(ruim&&ruim.erro)||'falha ao ler as travas'; return; }
    ag.travasErro=''; ag.travas=Object.assign({},...js.map(j=>j.travas||{})); ag.semTrava=js.some(j=>j.semTrava); ag.travasLidas=true;
    evs.forEach(ev=>{ const tv=ag.travas[ev.uid]; if(tv&&tv.estado==='ok') agTiraAlerta(ev.uid); });
    // Vínculo ANTIGO (da config, pela chave da MINHA agenda) vira trava — sem teto: é o que faz os colegas o enxergarem.
    // Se a reunião já tem OUTRO ticket registrado, avisa (uma vez por sessão) em vez de esconder o conflito.
    if(!ag.semTrava) evs.filter(ev=>((cfg.agendaTickets||{})[ev.id]||{}).t).forEach(ev=>{
      const k=cfg.agendaTickets[ev.id].t; const tv=ag.travas[ev.uid];
      if(tv){ if(tv.estado==='ok'&&tv.k&&tv.k!==k){ ag.conflitosAvisados=ag.conflitosAvisados||{}; if(!ag.conflitosAvisados[ev.uid]){ ag.conflitosAvisados[ev.uid]=1;
          toast(`⚠ "${String(ev.titulo).slice(0,40)}": o seu vínculo antigo é ${k}, mas o ticket registrado da reunião é ${tv.k}${tv.por&&tv.por.nome?` (de ${tv.por.nome})`:''} — confira qual vale.`,'warn'); } }
        return; }
      agTravaPost(Object.assign({ agtrava:'confirmar', k, migracao:1 }, agTravaMeta(ev))).then(c=>{ if(c&&c.ok&&c.trava){ agGuardaTrava(ev, c.trava); agRedesenhaTela(); } }).catch(()=>{});
    });
    // reserva viva de outra pessoa na tela: relê quando ela vencer (ou o ticket nascer), sem esperar alguém clicar
    clearTimeout(_agTravaRelerT);
    if(evs.some(ev=>agCriandoOutro(ev))) _agTravaRelerT=setTimeout(()=>{ if(idApontar()) agCarregaTravas(); }, 65000);
    agRedesenhaTela();
  }).catch(e=>{ ag.travasCarr=false; ag.travasErro=humanizaErro(e); });
}
// Vínculo evento→ticket: a TRAVA (vale para todas as agendas) manda; depois a config compartilhada (vínculo antigo,
// pela chave da minha agenda) e o espelho no localStorage (formato mais antigo).
function agTicketDe(evId){
  const tv=agTravaDe(agEvento(evId));
  if(tv&&tv.estado==='ok'&&tv.k) return { t:tv.k, por:(tv.por&&tv.por.nome)||'', quando:tv.em||'', trava:true };
  if(tv&&tv.estado==='nao') return null;   // ✂ desvinculada por alguém: o vínculo antigo (da minha agenda) não vale mais
  const c=(cfg.agendaTickets||{})[evId]; if(c&&c.t) return c;
  const l=agTickets()[evId]; return l?{t:l,por:'',quando:''}:null;
}
// Grava o vínculo. `opts.semTrava` = quem chama já confirmou a trava (o 📝 confirma e espera a resposta); os outros
// caminhos (✓ usar este ticket, 📞 Ligações, 🔁 automático) confirmam aqui — se a reunião já tinha OUTRO ticket, avisa.
function agMarcaTicket(evId,key,opts){
  const ev=agEvento(evId);
  // Com a 🔒 trava LIGADA (reunião com uid e banco configurado — sabido, não presumido), o vínculo mora SÓ nela — gravar
  // também na config pela chave da MINHA agenda deixaria um vínculo que ninguém mais enxerga. A config só entra como
  // reserva se a confirmação FALHAR (revisão de 2026-10-27: antes ela era apagada antes de o servidor responder).
  const soTrava=!!(ev&&ev.uid&&estado.agenda.semTrava===false);
  if(ev&&ev.uid&&!(opts&&opts.semTrava)){
    const antes=agTravaDe(ev);
    agGuardaTrava(ev,{ estado:'ok', k:key, por:{ acc:(idApontar()||{}).accountId||'', nome:(idApontar()||{}).nome||'' }, em:new Date().toISOString() });
    agTravaPost(Object.assign({ agtrava:'confirmar', k:key, tok:(opts&&opts.tok)||'' }, agTravaMeta(ev))).then(c=>{
      if(c&&c.ok&&c.trava) agGuardaTrava(ev, c.trava);
      else if(c&&c.ja){ agGuardaTrava(ev, Object.assign({ estado:'ok' }, c.ja));
        toast(`⚠ "${String(ev.titulo).slice(0,40)}" já tinha o ticket ${c.ja.k}${c.ja.por&&c.ja.por.nome?` (de ${c.ja.por.nome})`:''} — o ${key} ficou só como vínculo seu.`,'warn'); agRedesenhaTela(); }
      else if(c&&c.criando){ agGuardaTrava(ev, Object.assign({ estado:'criando' }, c.criando));
        toast(`⚠ ${(c.criando.por&&c.criando.por.nome)||'Outra pessoa'} está criando o ticket de "${String(ev.titulo).slice(0,40)}" agora — o ${key} ficou só como vínculo seu; confira depois qual ficou.`,'warn'); agRedesenhaTela(); }
      else agMarcaFallback(ev, key, antes, c&&c.erro);
    }).catch(e=>agMarcaFallback(ev, key, antes, humanizaErro(e)));
  }
  const id=idApontar()||{};
  if(soTrava){
    // nada na config: o vínculo é da trava (o vínculo antigo desta reunião, se existir, sai quando a trava confirmar)
  } else {
  cfg.agendaTickets=cfg.agendaTickets||{};
  cfg.agendaTickets[evId]={ t:key, por:id.nome||id.email||'', quando:new Date().toISOString() };
  // Higiene: vínculos com mais de ~120 entradas descartam os mais antigos.
  const ks=Object.keys(cfg.agendaTickets);
  if(ks.length>120){ ks.sort((x,y)=>String(cfg.agendaTickets[x].quando||'').localeCompare(String(cfg.agendaTickets[y].quando||'')))
    .slice(0,ks.length-120).forEach(k=>delete cfg.agendaTickets[k]); }
  }
  // O vínculo RESOLVE a pendência: some o aviso "reunião sem ticket" do Inbox de todos.
  Object.entries(cfg.inboxAvisos||{}).forEach(([acc,lst])=>{
    const f=(lst||[]).filter(a=>a.evId!==evId);
    if(f.length!==(lst||[]).length){ if(f.length) cfg.inboxAvisos[acc]=f; else delete cfg.inboxAvisos[acc]; }
  });
  if(cfg.agendaNao&&cfg.agendaNao[evId]) delete cfg.agendaNao[evId];   // vinculou de novo: a recusa anterior não vale mais
  salvaCfg();
  const m=agTickets(); m[evId]=key; try{ localStorage.setItem(AG_TK_KEY, JSON.stringify(m)); }catch(e){}
}
// A confirmação da trava falhou (servidor/rede): o vínculo não pode sumir — volta para a config (pela chave da minha
// agenda, como antes da trava) e a tela avisa; a migração leva para a trava na próxima abertura.
function agMarcaFallback(ev, key, antes, erro){
  const id=idApontar()||{};   // a marca local (otimista) fica: o vínculo continua visível aqui
  cfg.agendaTickets=cfg.agendaTickets||{};
  cfg.agendaTickets[ev.id]={ t:key, por:id.nome||id.email||'', quando:new Date().toISOString() };
  salvaCfg();
  toast(`⚠ ${key} vinculado só aqui: não consegui registrar a trava da reunião agora${erro?` (${String(erro).slice(0,80)})`:''} — os colegas o verão quando você abrir a Agenda de novo.`,'warn');
  agRedesenhaTela();
}
// ✂ Desvincular (pedido de 2026-10-02): desfaz SÓ o vínculo do painel — o ticket continua no Jira e a
// reunião volta às pendências — e lembra a chave recusada (cfg.agendaNao[evId]) para a conferência no
// Jira não sugerir o MESMO ticket de novo para esta ocorrência ("não é este"). Leitores (agAchadoDe)
// não criam cfg.agendaNao: criar {} no render marcaria a chave como alterada por esta sessão.
function agDesmarcaTicket(evId){
  const atual=agTicketDe(evId); if(!atual) return null;
  const id=idApontar()||{};
  // 🔒 a trava sai também (a reunião volta a "sem ticket" para TODOS os participantes)
  // (sempre que a reunião tem uid — mesmo sem a trava em memória: a leitura pode ter falhado ou ainda estar a caminho)
  const evT=agEvento(evId); if(evT&&evT.uid){ const tvT=agTravaDe(evT);
    agGuardaTrava(evT, tvT&&tvT.estado==='ok'?Object.assign({},tvT,{ estado:'nao' }):tvT);
    agTravaPost({ agtrava:'liberar', uid:evT.uid, desvincular:1 }).then(j=>{ if(!(j&&j.ok)&&!(j&&j.nada)) toast(`⚠ O ✂ não chegou ao servidor${j&&j.erro?` (${j.erro})`:''} — os colegas ainda veem o ticket; tente de novo.`,'warn'); })
      .catch(e=>toast(`⚠ O ✂ não chegou ao servidor (${humanizaErro(e)}) — os colegas ainda veem o ticket; tente de novo.`,'warn')); }
  if(cfg.agendaTickets&&cfg.agendaTickets[evId]) delete cfg.agendaTickets[evId];
  cfg.agendaNao=cfg.agendaNao||{};
  cfg.agendaNao[evId]={ k:atual.t, por:id.nome||id.email||'', quando:new Date().toISOString() };
  const ks=Object.keys(cfg.agendaNao);
  if(ks.length>120) ks.sort((x,y)=>String(cfg.agendaNao[x].quando||'').localeCompare(String(cfg.agendaNao[y].quando||'')))
    .slice(0,ks.length-120).forEach(k=>delete cfg.agendaNao[k]);
  salvaCfg();
  const m=agTickets(); if(m[evId]){ delete m[evId]; try{ localStorage.setItem(AG_TK_KEY, JSON.stringify(m)); }catch(e){} }
  const ag=estado.agenda; if(ag&&ag.achados&&ag.achados[evId]&&ag.achados[evId].k===atual.t) delete ag.achados[evId];
  return atual;
}
// Ticket achado no Jira para o evento (conferência por título + dia) — menos o que a pessoa desvinculou.
function agAchadoDe(evId){
  const ag=estado.agenda; const h=ag&&ag.achados&&ag.achados[evId]; if(!h||!h.k) return null;
  const nao=cfg.agendaNao&&cfg.agendaNao[evId]; return (nao&&nao.k===h.k)?null:h;
}
// ✅ Ticket da reunião → concluído (JI-153, 2026-10-23, a pedido do usuário: "para esses tickets você precisa passar
// do status reunião agendada para concluído"). O tipo Reunião de alguns projetos (ex.: COP) nasce em
// "📆 Reunião Agendada" e tem DUAS transições de categoria done — "Participar da Reunião" (Feito) e "Cancelar
// Reunião" (Cancelado) —, então a escolha é pelo NOME, nunca só pela categoria. Regras: (1) só mexe se o status
// ATUAL é de reunião agendada (AG_RE_AGENDADA) — um ticket qualquer vinculado à reunião (tarefa em andamento) fica
// como está; (2) com o token da pessoa (/api/transicao, que no `listar` devolve o status atual); (3) nunca derruba
// o fluxo: devolve {feito, motivo} e quem chama decide o aviso. Usado pelo 📝 da Agenda, pelo convite confirmado
// (13) e pelas 📞 Ligações (14c).
const AG_RE_AGENDADA=/agendad|marcad/i;
async function agConcluiReuniao(key, id){
  id=id||idApontar(); if(!id||!key) return { feito:false, motivo:'sem-identidade' };
  const post=(corpo)=>fetch('/api/transicao',{ method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(Object.assign({ issue:key, email:id.email, token:id.token }, corpo)) }).then(r=>r.json());
  try{
    const j=await post({ listar:true });
    if(!j||!j.ok) return { feito:false, motivo:'erro', erro:(j&&j.erro)||'não consegui ler as transições do ticket' };
    const st=String((j.status&&j.status.nome)||'');
    if(!AG_RE_AGENDADA.test(st)) return { feito:false, motivo:'status', status:st };   // sem status no retorno = não mexe
    const done=(j.transicoes||[]).filter(t=>t.categoria==='done'&&!/cancel/i.test(`${t.nome} ${t.para}`));
    const tr=done.find(t=>/particip|realiz|feito|conclu|done/i.test(`${t.nome} ${t.para}`))||done[0];
    if(!tr) return { feito:false, motivo:'sem-transicao', status:st };
    const r=await post({ transitionId:tr.id });
    if(!r||!r.ok) return { feito:false, motivo:'erro', erro:(r&&r.erro)||'o Jira recusou a transição' };
    logAcao({ acao:'status', t:key, de:st, para:tr.para||tr.nome, motivo:'📅 reunião realizada', ok:true }, false);   // quem chama grava a config
    invalidaCacheDados();
    return { feito:true, de:st, para:tr.para||tr.nome };
  }catch(e){ return { feito:false, motivo:'erro', erro:humanizaErro(e) }; }
}
// As duas telas do grupo 📅 Agenda (2026-10-02, "o controle poluía a tela"): 'agenda' = os eventos dia a
// dia com a faixa-resumo; 'agcontrole' = o 🎫 Controle de tickets inteiro. Quem redesenha testa as duas.
function agVistaAberta(){ return estado.vista==='agenda'||estado.vista==='agcontrole'; }
// Tipo "Reunião" do projeto (senão o tipo padrão) — para criar o ticket do evento.
function agTipoReuniao(projKey){
  const pr=(_projetosCache||[]).find(x=>x.key===projKey); const tipos=(pr&&pr.tipos)||[];
  // Sem tipo "Reunião": cai no tipo padrão do projeto (task/tarefa de 1º nível), mesmo critério do Vincular Reuniões.
  const base=tipos.filter(t=>!t.subtarefa&&(t.nivel===0||t.nivel===undefined));
  return tipos.find(x=>!x.subtarefa&&/reuni/i.test(x.nome||''))||base.find(t=>/task|tarefa/i.test(t.nome||''))||base[0]||null;
}
// Usuários ativos do Jira (accountId → {nome,email}) para casar com os convidados.
// Falha na leitura NÃO vira {} (revisão de 2026-10-08): com {} o modal tratava todo convidado como externo e a
// busca ➕ respondia "ninguém com esse nome" — falso. Fica null + usuErro, o modal explica e oferece ↻ tentar de novo.
function agCarregaUsuarios(forca){
  const ag=estado.agenda; if((ag.usuarios&&!forca)||ag.usuCarr) return;
  ag.usuCarr=true; ag.usuErro=false;
  const falhou=()=>{ ag.usuCarr=false; ag.usuarios=null; ag.usuErro=true; agAtualizaModal(); };
  usuariosP(!!forca).then(j=>{ if(!(j&&j.pessoas)) return falhou(); ag.usuCarr=false; ag.usuarios=j.pessoas; agAtualizaModal(); })
    .catch(falhou);
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
  if(ev.uid) agTiraAlerta(ev.uid);
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
//   'ok'      já tem ticket (trava ou vínculo)
//   'minha'   sem ticket — QUALQUER participante da Dexterity cria (2026-10-27; antes só quem organizou, e o
//             convidado ficava "aguardando" sem poder apontar)
//   'criando' sem ticket, mas outra pessoa reservou a reunião agora e está criando (some em 3 min se não confirmar)
//   'ign'     marcada como "não precisa de ticket"
function agClasse(ev){
  if(agTicketDe(ev.id)) return 'ok';
  if(agIgnorado(ev)) return 'ign';
  if(agCriandoOutro(ev)) return 'criando';
  return 'minha';
}
// Aviso de "reunião sem ticket" já gravado no Inbox de alguém para este evento.
function agAvisoDe(evId){
  let achado=null;
  Object.values(cfg.inboxAvisos||{}).forEach(l=>(l||[]).forEach(a=>{ if(!achado&&a&&a.evId===evId) achado=a; }));
  return achado;
}
const AG_CONF_MAX=48;   // teto de reuniões conferidas no Jira por abertura da aba 🎫 (6 lotes de 8)
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
  ag.autoRodando=true; if(agVistaAberta()) renderAgenda();
  const criados=[]; const falhas=[];
  for(const ev of alvos){
    const regra=agRegraDe(ev); const proj=regra.projeto;
    const tipo=agTipoReuniao(proj);
    if(!tipo){ falhas.push(`${ev.titulo}: projeto ${proj} sem tipo de reunião`); continue; }
    // 🔒 a regra é de quem a ligou, mas QUALQUER participante pode ter criado antes: reserva primeiro
    let tv=null;
    if(ev.uid){
      try{ tv=await agTravaPost(Object.assign({ agtrava:'reservar' }, agTravaMeta(ev))); }catch(e){ falhas.push(`${ev.titulo}: ${e.message||e}`); continue; }
      if(tv&&tv.ja){ agGuardaTrava(ev, Object.assign({ estado:'ok' }, tv.ja)); continue; }
      if(tv&&tv.criando){ agGuardaTrava(ev, Object.assign({ estado:'criando' }, tv.criando)); continue; }
      if(!agReservaOk(tv)){ falhas.push(`${ev.titulo}: ${(tv&&tv.erro)||'não consegui reservar a reunião'}`); continue; }
    }
    let respondeu=false;   // o Jira respondeu "não criei" (falha certa)? só então a reserva é solta
    try{
      const r=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ email:id.email, token:id.token, itens:[{ projeto:proj, tipoId:tipo.id,
          resumo:`Reunião: ${ev.titulo}`.slice(0,250), descricao:agDescEvento(ev),
          venc:(ev.inicio||'').slice(0,10), labels:['agenda-outlook','recorrente-auto'].concat(tv&&tv.rotulo?[tv.rotulo]:[]) }] })});
      const j=await r.json(); respondeu=true; const c=j&&j.criados&&j.criados[0];
      if(c&&c.key){ agMarcaTicket(ev.id,c.key,{ tok:tv&&tv.tok }); criados.push(c.key); }
      else { if(tv&&tv.reservado) agTravaPost({ agtrava:'liberar', uid:ev.uid, tok:tv.tok }).catch(()=>{});
        falhas.push(`${ev.titulo}: ${(j&&j.erros&&j.erros[0]&&j.erros[0].erro)||(j&&j.erro)||'falhou'}`); }
    }catch(e){
      // sem resposta (rede, 504): o ticket PODE ter nascido — a reserva fica; em 3 min a label decide quem assume
      if(respondeu&&tv&&tv.reservado) agTravaPost({ agtrava:'liberar', uid:ev.uid, tok:tv.tok }).catch(()=>{});
      falhas.push(`${ev.titulo}: ${e.message||e}`); }
  }
  ag.autoRodando=false;
  if(criados.length) toast(`🔁 ${criados.length} ticket(s) de reunião recorrente criados: ${criados.join(', ')} — agora é só apontar.`,'ok');
  if(falhas.length) toast(`⚠ ${falhas.length} reunião(ões) automáticas falharam: ${falhas[0]}`,'warn');
  if(agVistaAberta()) renderAgenda();
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

// Chave da conferência no Jira: a MESMA reunião = mesmo título E mesmo dia (conferirTickets na API).
function agAchKey(ev){ return `${(ev.inicio||'').slice(0,10)}|${ev.titulo}`; }
// 🔎 Confere no Jira, só para o evento do modal, se já existe o ticket desta reunião (mesmo título,
// mesmo dia, de preferência criado por outra pessoa). Resultado em estado.agenda.achados[ev.id]; o
// modal redesenha ao chegar e abre em "vincular" com a chave preenchida.
function agConfereEvento(ev){
  const ag=estado.agenda; ag.achados=ag.achados||{};
  if(ag.achados[ev.id]||ag.conferindo) return;   // a conferência geral em andamento já cobre e redesenha o modal
  const m=_agM; if(!m||m.evId!==ev.id) return;
  m.conferindo=true;
  fetch('/api/reunioes',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({conferir:1,itens:[{titulo:ev.titulo,dia:(ev.inicio||'').slice(0,10)}]})})
    .then(r=>r.json()).then(j=>{ const h=((j&&j.achados)||{})[agAchKey(ev)]; if(h&&h.k) ag.achados[ev.id]=h; })
    .catch(()=>{})
    .finally(()=>{ if(_agM&&_agM.evId===ev.id){ _agM.conferindo=false; agAtualizaModal(); } if(agVistaAberta()&&ag.achados[ev.id]) renderAgenda(); });
}
// ⏱ Horas do convite (pedido de 2026-10-01): 📅 estimada (duração agendada) · ⏱ real (relatório de
// presença do Teams) · ✎ manual (digitada). Devolve os segundos efetivos ou null quando a escolha ainda
// não tem valor (manual vazio/inválido, real indisponível) — quem chama decide se bloqueia.
function agSegConvite(ev, m){ m=m||_agM||{}; const modo=m.durModo||'agendada';
  if(modo==='manual'){ const s=parseTempo(m.manualTxt||''); return (s&&s>=60&&s<=24*3600)?s:null; }
  if(modo==='real') return m.segReal>0?m.segReal:null;
  return agDuracaoSeg(ev); }
// Busca a duração real quando a pessoa escolhe ⏱ real; sem relatório, volta para a estimada e explica.
function agBuscaReal(){
  const m=_agM; if(!m||m.realBusca) return;
  m.realBusca=true; m.realErro=''; agAtualizaModal();
  agDuracaoReal(m.evId, null).then(j=>{ if(_agM!==m) return;
    if(j&&j.ok&&(j.minhaSeg>0||j.duracaoSeg>0)){
      m.segReal=j.minhaSeg>0?j.minhaSeg:j.duracaoSeg;
      m.realNota=`⏱ Teams: a reunião durou ${fmtH(j.duracaoSeg)}${j.minhaSeg>0?` e você ficou ${fmtH(j.minhaSeg)}`:''} · ${j.total} participante(s) no relatório.`;
    } else { m.segReal=0; m.realErro=(j&&j.ok)?'o relatório do Teams não registrou permanência':'o Teams não devolveu o relatório'; m.realNota=`⏱ Duração real indisponível (${m.realErro}) — voltei para a estimada.`; m.durModo='agendada'; }
  }).catch(()=>{ if(_agM===m){ m.segReal=0; m.durModo='agendada'; m.realNota='⏱ Duração real indisponível — voltei para a estimada.'; } })
  .finally(()=>{ if(_agM===m){ m.realBusca=false; agAtualizaModal(); } });
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
let _agM=null;   // { evId, fixo(chave já vinculada — só convidar), extras:[{acc,nome,email}] (➕ fora do convite) }
// Convidados do evento casados com os usuários ATIVOS do Jira (por e-mail). Só pessoas internas entram na
// lista de convites — participante externo (cliente/fora da Dexterity) não aponta horas aqui. Devolve null
// enquanto os usuários não chegaram; `accs` é o conjunto já coberto pelo convite (a busca ➕ exclui).
function agPessoasConvite(ev){
  const usu=estado.agenda.usuarios; if(!usu) return null;
  const meuEmail=String(((idApontar()||{}).email||'')).toLowerCase();
  const porEmail={}; Object.entries(usu).forEach(([acc,u])=>{ if(u&&u.email) porEmail[String(u.email).toLowerCase()]={ acc, nome:u.nome||acc, email:String(u.email).toLowerCase() }; });
  const internos=[]; const accs=new Set(); let externos=0;
  (ev.pessoas||[]).forEach(p=>{
    const j=porEmail[p.email];
    if(p.email===meuEmail){ internos.push({ eu:true, nome:p.nome||p.email, email:p.email }); return; }
    if(!j){ externos++; return; }
    if(accs.has(j.acc)) return;   // o mesmo e-mail duas vezes no convite
    accs.add(j.acc); internos.push(j);
  });
  return { internos, externos, accs };
}
// ➕ Convidar quem NÃO está no convite (pedido de 2026-10-08): a lista nasce do convite do Outlook, mas quem
// participou sem estar nele (entrou pelo link, foi chamado na hora, ou é o 21º convidado — o painel leva só os
// 20 primeiros do convite, `.slice(0, 20)` no api/reunioes.js) também precisa apontar. A busca procura entre os
// usuários ativos do Jira (mesmo critério de "interno" da lista e das telas 👥 em grupo e 📨 convidar do
// Apontar), fora quem já está coberto: você, os convidados casados e os extras já adicionados. Os extras vivem
// só no modal (_agM.extras) e entram em `pessoas` como os demais — o servidor não distingue.
const AG_EXTRA_MAX=8;
const agNorm=(s)=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
// Devolve { itens (até AG_EXTRA_MAX), total } — o total é o que avisa "e mais N" em vez de cortar calado.
function agExtraCandidatos(m, ev, q){
  const n=agNorm(q).trim(); if(n.length<2) return { itens:[], total:0 };
  const usu=estado.agenda.usuarios||{}; const conv=agPessoasConvite(ev); const id=idApontar()||{};
  const meuEmail=String(id.email||'').toLowerCase();
  const fora=new Set([...((conv&&conv.accs)||[]), ...(m.extras||[]).map(x=>x.acc)]); if(id.accountId) fora.add(id.accountId);
  const todos=Object.entries(usu)
    .filter(([acc,u])=>u&&!fora.has(acc)&&!RE_EXCLUIR.test(u.nome||'')&&String(u.email||'').toLowerCase()!==meuEmail
      &&(agNorm(u.nome).includes(n)||String(u.email||'').toLowerCase().includes(n)))
    .map(([acc,u])=>({ acc, nome:u.nome||acc, email:String(u.email||'').toLowerCase() }))
    .sort((a,b)=>(agNorm(a.nome).startsWith(n)?0:1)-(agNorm(b.nome).startsWith(n)?0:1)||a.nome.localeCompare(b.nome,'pt'));
  return { itens:todos.slice(0,AG_EXTRA_MAX), total:todos.length };
}
function agExtraListaHTML(m, ev){
  const q=String(m.extraBusca||'').trim();
  if(agNorm(q).length<2) return q?'<span class="muted small">digite ao menos 2 letras</span>':'';
  const { itens, total }=agExtraCandidatos(m, ev, q);
  if(!itens.length) return '<span class="muted small">ninguém com esse nome entre os usuários ativos do Jira — ou a pessoa já está na lista acima</span>';
  // O 1º chip é o que o Enter adiciona: fica destacado e com ↵. E-mail de outro domínio aparece no chip
  // (não só no tooltip), para ninguém de fora entrar por engano sob "alguém da Dexterity".
  const dom=agMeuDominio();
  return itens.map((x,i)=>{ const d=String(x.email||'').split('@')[1]||'';
    return `<button type="button" class="chip${i===0?' agm-extra-1':''}" data-agm-extra-add="${escA(x.acc)}" data-tip="${escA(x.email||'')}">➕ ${esc(x.nome)}${d&&dom&&d!==dom?` <span class="muted small">@${esc(d)}</span>`:''}${i===0?' <span class="agm-extra-enter" aria-hidden="true">↵</span>':''}</button>`; }).join('')
    +(total>itens.length?`<span class="muted small">… e mais ${total-itens.length} — digite mais letras</span>`:'');
}
// Adicionar mantém a busca enquanto ainda houver resultados (dois ou três do mesmo sobrenome entram em sequência);
// quem entrou já sai dos resultados. A linha nova é trazida à vista (#agm-pessoas rola) e o toast confirma.
function agExtraAdiciona(acc){
  const m=_agM; if(!m) return; const u=(estado.agenda.usuarios||{})[acc]; if(!u) return;
  m.extras=m.extras||[]; if(m.extras.some(x=>x.acc===acc)) return;
  m.extras.push({ acc, nome:u.nome||acc, email:String(u.email||'').toLowerCase() });
  const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===m.evId);
  if(!ev||!agExtraCandidatos(m, ev, m.extraBusca||'').itens.length) m.extraBusca='';
  m.focoExtra=true; m.ultimoExtra=acc; agAtualizaModal();
  toast(`➕ ${u.nome||acc} entrou na lista de convites`,'ok');
}
// Tirar NÃO leva o foco à busca: no celular isso abria o teclado sem a pessoa pedir.
function agExtraRemove(acc){ const m=_agM; if(!m||!m.extras) return; const x=m.extras.find(y=>y.acc===acc); m.extras=m.extras.filter(y=>y.acc!==acc); agAtualizaModal();
  if(x) toast(`✕ ${x.nome} saiu da lista de convites`,'ok'); }
function agAbreTicket(evId, fixo){
  const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===evId); if(!ev) return;
  _agM={ evId, fixo:fixo||'', durModo:'agendada', manualTxt:'', extras:[], extraBusca:'' };
  // O placeholder já nasce com .ag-modal: é o que agAgModalAberto() confere antes de qualquer redesenho.
  abreModal('<div class="ag-modal"><h2>📝 Ticket da reunião</h2><div class="estado">Carregando…</div></div>');
  if(!_projetosCache) garanteProjetos().then(()=>agAtualizaModal()).catch(()=>{});
  agCarregaUsuarios();
  if(!fixo) agConfereEvento(ev);   // 🔎 já existe o ticket desta reunião (mesmo título, mesmo dia)?
  if(!fixo&&ev.uid) agConfereTravaModal(ev);   // 🔒 alguém criou (ou está criando) enquanto a tela estava aberta?
  agAtualizaModal();
}
// 🔒 Relê a trava desta reunião ao abrir o 📝: se outra pessoa criou o ticket nesse meio-tempo, o modal já abre no
// ticket dela ("aponte aqui"); se está criando agora, o modal avisa (o Confirmar recusaria pela reserva de qualquer jeito).
function agConfereTravaModal(ev){
  const m=_agM; if(!m||m.evId!==ev.id) return;
  agTravaPost({ agtrava:'ler', uids:[ev.uid] }).then(j=>{
    if(!(j&&j.ok)||_agM!==m) return;
    const tv=(j.travas||{})[ev.uid]||null; agGuardaTrava(ev, tv);
    if(tv&&tv.estado==='ok'&&tv.k&&!m.fixo) agJaCriado(m, tv);
    agAtualizaModal(); if(agVistaAberta()) renderAgenda();
  }).catch(()=>{});
}
// ⏰ Do alerta do 📥 Inbox: acha a reunião pela chave comum (uid) na agenda — carregando-a se ainda não veio — e abre
// o 📝 no lugar. Fora do período da agenda (alerta antigo), leva ao 🎫 Controle com um aviso.
function agAbrePorUid(uid){
  if(!idApontar()){ abreIdentidade(); return; }
  const ag=estado.agenda;
  const acha=()=>((ag.dados||{}).eventos||[]).find(ev=>ev.uid===uid);
  const ev=acha();
  if(ev){ agAbreTicket(ev.id); return; }
  if(ag.dados&&!ag.carregando){ toast('Essa reunião já saiu do período da agenda (desde a segunda da semana passada) — crie o ticket direto no Jira ou pelo 📝 Criar ticket.','warn'); vaiPara('agcontrole'); return; }
  toast('📅 Carregando a sua agenda…','ok');
  ag.abrirUid=uid;
  if(!ag.carregando) carregaAgenda(false);
}
// O ticket da reunião já existe (outra pessoa criou): o 📝 vira "aponte as suas horas nele" — você marcado, os demais
// desmarcados (quem criou já convidou os participantes; convidar de novo duplicaria o convite).
function agJaCriado(m, tv){
  const eu=(idApontar()||{}).accountId||'';
  m.fixo=tv.k; m.jaPor=(tv.por&&tv.por.acc&&tv.por.acc!==eu)?(tv.por.nome||'outra pessoa'):''; m.prechecked=false;
}
// O 📝 ainda é o modal aberto? (revisão de 2026-10-08) A conferência no Jira, o ⏱ real do Teams, os projetos e
// os usuários respondem DEPOIS — se a pessoa fechou o 📝 (Esc, ×, fundo) e abriu outro modal (Ctrl+K, a ficha 🔍,
// ⚡ automatizar), o redesenho atrasado trocava o conteúdo dele pelo 📝 com o botão Confirmar. Fechado → _agM sai.
function agAgModalAberto(){
  const md=document.getElementById('modal');
  if(md&&!md.hidden&&document.querySelector('#modal-body > .ag-modal')) return true;
  _agM=null; return false;   // fechado, ou outro modal no lugar: o 📝 acabou
}
function agAtualizaModal(){
  const m=_agM; if(!m) return;
  if(!agAgModalAberto()) return;
  const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===m.evId); if(!ev) return;
  // Redesenho atrasado (conferência, projetos, usuários) não pode tirar o foco de quem está digitando:
  // guarda o campo e o cursor e devolve depois do replaceChildren.
  const at=document.activeElement; const focoId=(at&&/^agm-(extra-busca|chave|dur-manual)$/.test(at.id||''))?at.id:'';
  let pos=null; if(focoId){ try{ pos=at.selectionStart; }catch(e){} }
  const id=idApontar()||{};
  const projetos=(_projetosCache||[]);
  const projSel=(document.getElementById('agm-proj')||{}).value || (projetos.some(p=>p.key==='RDF')?'RDF':(projetos[0]&&projetos[0].key)||'');
  // 🟡 Ticket já existente desta reunião (mesmo título + mesmo dia, conferido no Jira): o modal abre em
  // "vincular" com a chave preenchida; se a pessoa trocar o modo ou a chave, a escolha dela prevalece.
  const ach=m.fixo?null:agAchadoDe(m.evId);   // o que a pessoa desvinculou não volta como sugestão
  const modoDom=((document.querySelector('input[name=agm-modo]:checked')||{}).value)||'';
  const modo=m.fixo?'vincular':(m.modoManual?(modoDom||'criar'):(ach?'vincular':'criar'));
  const chaveDom=String(((document.getElementById('agm-chave')||{}).value)||'');
  const chave=m.fixo||(m.chaveManual?chaveDom:(ach?ach.k:chaveDom));
  const marcados=new Set([...document.querySelectorAll('[data-agm-p]:checked')].map(x=>x.getAttribute('data-agm-p')));
  const noDom=new Set([...document.querySelectorAll('[data-agm-p]')].map(x=>x.getAttribute('data-agm-p')));
  const primeira=!m.prechecked;   // pré-marca todo mundo na PRIMEIRA vez que a lista aparece
  const tipo=projSel?agTipoReuniao(projSel):null;
  // Convidados do evento casados com os usuários do Jira (por e-mail) + ➕ os extras adicionados à mão.
  // Quem ainda não estava na tela (lista nova ou extra recém-adicionado) nasce marcado; quem já estava
  // mantém o que a pessoa marcou (o modal redesenha a cada troca de modo/projeto/duração).
  let pessoasHtml='<span class="muted small">Carregando pessoas…</span>'; let extraHtml='';
  if(estado.agenda.usuErro) pessoasHtml='<div class="aviso">⚠ Não consegui carregar os usuários do Jira — sem eles o painel não sabe quem do convite é da Dexterity. <button type="button" class="btn" data-agm-usu-retry="1">↻ tentar de novo</button></div>';
  const conv=agPessoasConvite(ev);
  if(conv){
    const chkDe=(acc)=>(primeira||!noDom.has(acc))?!m.jaPor:marcados.has(acc);   // 🔒 ticket de outra pessoa: ela já convidou
    // 🙋 Você (JI-153, 2026-10-23): a linha era uma caixa desabilitada que dizia "o convite aponta as suas horas
    // automaticamente" — e não apontava (você não entrava em `pessoas`). Agora é uma caixa REAL, marcada: o
    // servidor aponta o organizador na hora, com o próprio token (api/apontar.js, criarConvites). Reunião que
    // ainda não aconteceu fica desabilitada (worklog no futuro não) — aponte depois, pelo ⏱ Apontar ou 📆 Hoje.
    const euAcc=String(id.accountId||''); const futura=(ev.inicio||'').slice(0,10)>hojeSP();
    // No 👥 convidar de uma reunião que JÁ tem ticket (m.fixo) você nasce DESMARCADO: as suas horas saíram quando o
    // ticket foi criado — marcado de novo seria um segundo worklog seu no mesmo ticket.
    const euChk=(primeira||!noDom.has(euAcc))?(!m.fixo||!!m.jaPor):marcados.has(euAcc);   // ticket de OUTRA pessoa: você aponta
    const euLinha=(nome)=>!euAcc
      ?`<label class="check" style="opacity:.65"><input type="checkbox" disabled> ${esc(nome)} <span class="muted small">(você — identifique-se no ⏱ Apontar para apontar as suas horas daqui)</span></label>`
      :futura?`<label class="check" style="opacity:.65"><input type="checkbox" data-agm-p="${escA(euAcc)}" data-agm-nome="${escA(nome)}" data-agm-eu="1" disabled> ${esc(nome)} <span class="muted small">(você — a reunião ainda não aconteceu; as suas horas você aponta depois, pelo ⏱ Apontar ou 📆 Hoje)</span></label>`
      :`<label class="check"><input type="checkbox" data-agm-p="${escA(euAcc)}" data-agm-nome="${escA(nome)}" data-agm-eu="1" ${euChk?'checked':''}> ${esc(nome)} <span class="muted small">${m.jaPor?'(você — as suas horas saem agora, no seu usuário, no ticket que já existe)':m.fixo?'(você — marque só se ainda não lançou as suas horas neste ticket)':'(você — as suas horas saem agora, no seu usuário, junto com os convites)'}</span></label>`;
    const linhas=conv.internos.map(p=>p.eu?euLinha(p.nome)
      :`<label class="check"><input type="checkbox" data-agm-p="${escA(p.acc)}" data-agm-nome="${escA(p.nome)}" ${chkDe(p.acc)?'checked':''}> ${esc(p.nome)}</label>`).join('')
      // você não está no convite (criou o ticket por um colega, ou o e-mail do Outlook não é o do Jira): a linha existe, desmarcada
      +(euAcc&&!conv.internos.some(p=>p.eu)&&!futura?`<label class="check"><input type="checkbox" data-agm-p="${escA(euAcc)}" data-agm-nome="${escA(id.nome||id.email||'você')}" data-agm-eu="1" ${((primeira||!noDom.has(euAcc))?!!m.jaPor:marcados.has(euAcc))?'checked':''}> ${esc(id.nome||id.email||'você')} <span class="muted small">(você — não está no convite; marque para apontar as suas horas também)</span></label>`:'');
    const extras=(m.extras||[]).map(x=>`<div class="agm-extra-row"><label class="check"><input type="checkbox" data-agm-p="${escA(x.acc)}" data-agm-nome="${escA(x.nome)}" data-agm-extra="1" ${chkDe(x.acc)?'checked':''}> ${esc(x.nome)} <span class="badge" data-tip="Não está no convite do Outlook — adicionado à mão neste modal; recebe o convite de apontamento como os demais">➕ fora do convite</span></label><button type="button" class="agm-extra-rm" data-agm-extra-rm="${escA(x.acc)}" data-tip="Tirar da lista" aria-label="Tirar ${escA(x.nome)} da lista">✕</button></div>`).join('');
    pessoasHtml=(linhas||'<span class="muted small">Nenhum participante interno.</span>')+extras
      +(conv.externos?`<div class="muted small" style="margin-top:6px">👤 ${conv.externos} participante(s) externo(s) fora da lista — convites de apontamento são só para o time Dexterity.</div>`:'');
    m.prechecked=true;
    extraHtml=`<div class="agm-extra">
      <div class="muted small">➕ <b>Alguém da Dexterity que não está no convite?</b> Quem participou sem estar na lista do Outlook também pode apontar — procure pelo nome e adicione; a pessoa recebe o convite como os demais.</div>
      <div class="agm-extra-busca"><input type="text" id="agm-extra-busca" value="${escA(m.extraBusca||'')}" placeholder="nome ou e-mail…" maxlength="60" autocomplete="off" enterkeyhint="done" aria-label="Procurar pessoa da Dexterity para convidar" aria-describedby="agm-extra-dica"><span class="muted small" id="agm-extra-dica">Enter adiciona o destacado (↵) · Esc limpa a busca</span></div>
      <div id="agm-extra-lista" class="agm-extra-lista" aria-live="polite">${agExtraListaHTML(m, ev)}</div></div>`;
  }
  // ⏱ horas do convite: estimada · real (Teams) · manual
  const segAg=agDuracaoSeg(ev); const durModo=m.durModo||'agendada'; const segEf=agSegConvite(ev,m);
  const hFmt=segEf?fmtH(segEf):'—';
  const porMim=!!(ach&&ach.criadoPor&&ach.criadoPor.id&&id.accountId&&ach.criadoPor.id===id.accountId);
  const sugestao=ach?`<div class="aviso ag-sug" style="margin:8px 0 2px">🟡 <b>Já existe um ticket desta reunião no Jira:</b> <a href="${jiraBase()}/browse/${encodeURIComponent(ach.k)}" target="_blank" rel="noopener">${esc(ach.k)} ↗</a> <span class="muted small">${esc(String(ach.resumo||'').slice(0,60))}</span> · criado por <b>${esc(porMim?'você':((ach.criadoPor&&ach.criadoPor.nome)||'alguém'))}</b>${ach.criadoEm?` em ${esc(alxDataBR(ach.criadoEm))}`:''}${ach.venc?` · vencimento ${esc(alxDataBR(ach.venc))}`:''}. ${porMim?'Vincular evita um ticket duplicado.':'Vincular evita um ticket duplicado: o seu apontamento vai para o ticket que já existe.'}</div>`
    :((m.conferindo||estado.agenda.conferindo)?'<div class="muted small" style="margin:8px 0 2px">🔎 Conferindo no Jira se já existe um ticket desta reunião (mesmo título, mesmo dia)…</div>':'');
  const corpo=`<h2>📝 Ticket da reunião</h2>
    <div class="muted small">${esc(ev.titulo)} · ${esc((ev.inicio||'').slice(0,10))} ${ev.diaTodo?'(dia todo)':esc((ev.inicio||'').slice(11,16))}</div>
    ${m.fixo?(m.jaPor?`<div class="aviso ag-ja" style="margin-top:8px">🔒 <b>${esc(m.jaPor)}</b> já criou o ticket desta reunião: <a href="${jiraBase()}/browse/${encodeURIComponent(m.fixo)}" target="_blank" rel="noopener"><strong>${esc(m.fixo)}</strong> ↗</a> — nada será criado de novo. Os participantes já foram convidados por quem criou; aponte as suas horas aqui (e marque mais alguém só se ficou de fora).</div>`
      :`<div class="ap-id" style="margin-top:8px">✓ Ticket já criado: <strong>${esc(m.fixo)}</strong> — selecione quem convidar para apontar.</div>`):`${sugestao}${agCriandoOutro(ev)?`<div class="aviso ag-criando" style="margin:8px 0 2px">⏳ <b>${esc(((agTravaDe(ev)||{}).por||{}).nome||'Outra pessoa')}</b> está criando o ticket desta reunião agora — espere um instante: quando ficar pronto, ele aparece aqui e você só aponta.</div>`:''}
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin:10px 0 4px">
      <label class="check"><input type="radio" name="agm-modo" value="criar" ${modo==='criar'?'checked':''}> 🆕 Criar ticket novo</label>
      <label class="check"><input type="radio" name="agm-modo" value="vincular" ${modo==='vincular'?'checked':''}> 🔗 Vincular a ticket existente${ach?' <span class="badge com-horas" data-tip="Ticket desta reunião encontrado no Jira (mesmo título, mesmo dia)">sugerido</span>':''}</label>
    </div>
    ${modo==='criar'?`
      <div class="alx-campo"><label>Projeto</label>
        <select id="agm-proj">${projetos.map(p=>`<option value="${escA(p.key)}" ${projSel===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('')||'<option value="">carregando projetos…</option>'}</select>
        <span class="muted small" style="margin-left:8px">${tipo?`tipo: <b>${esc(tipo.nome)}</b>`:'sem tipo disponível'}</span></div>`
    :`<div class="alx-campo"><label>Chave do ticket</label><input type="text" id="agm-chave" value="${escA(chave)}" placeholder="ex.: IMI-41" maxlength="20" style="width:140px;text-transform:uppercase">
        <span class="muted small" style="margin-left:8px">os detalhes do evento entram como comentário</span></div>`}`}
    <div class="muted small" style="font-weight:600;margin:10px 0 4px">⏱ Horas do convite <span class="muted" style="font-weight:400">· quanto cada convidado aponta ao confirmar</span></div>
    <div class="ap-vis ag-dur" style="display:flex;gap:10px 16px;flex-wrap:wrap;align-items:center;margin:2px 0 6px">
      <label class="check"><input type="radio" name="agm-dur" value="agendada" ${durModo==='agendada'?'checked':''}> 📅 estimada (agenda): <b>${esc(fmtH(segAg))}</b></label>
      <label class="check"${ev.link?'':' style="opacity:.6"'} data-tip="${ev.link?'Quanto a reunião REALMENTE durou, pelo relatório de presença do Teams (sua permanência na chamada)':'Esta reunião não tem link do Teams — sem relatório de presença'}"><input type="radio" name="agm-dur" value="real" ${durModo==='real'?'checked':''} ${ev.link?'':'disabled'}> ⏱ real (Teams)${m.segReal>0?`: <b>${esc(fmtH(m.segReal))}</b>`:(m.realBusca?': <span class="muted small">consultando…</span>':(ev.link?'':': <span class="muted small">sem link</span>'))}</label>
      <label class="check"><input type="radio" name="agm-dur" value="manual" ${durModo==='manual'?'checked':''}> ✎ manual <input type="text" id="agm-dur-manual" value="${escA(m.manualTxt||'')}" placeholder="ex.: 1h30" maxlength="8" style="width:84px;margin-left:4px" ${durModo==='manual'?'':'disabled'} aria-label="Horas do convite (manual)"></label>
    </div>
    ${m.realNota?`<div class="muted small" style="margin:-2px 0 6px">${esc(m.realNota)}</div>`:''}
    <div class="muted small" style="font-weight:600;margin:10px 0 4px">👥 Quem aponta <span class="muted" style="font-weight:400">· você aponta na hora; cada convidado confirma com 1 clique (Inbox/Apontar) — o worklog de <b id="agm-dur-ef">${esc(hFmt)}</b> sai no usuário de cada um</span></div>
    <div id="agm-pessoas" style="max-height:180px;overflow:auto">${pessoasHtml}</div>
    ${extraHtml}
    <div style="margin-top:12px"><button class="btn primario" data-agm-conf="1">${m.fixo?(m.jaPor?'⏱ Apontar no ticket existente':'👥 Enviar convites'):'Confirmar'}</button></div>
    <div class="ap-fb" id="agm-fb" hidden></div>`;
  const mb=document.getElementById('modal-body'); if(mb){ mb.replaceChildren(el(`<div class="ag-modal">${corpo}</div>`)); }
  const foca=(idCampo, p)=>{ const i=document.getElementById(idCampo); if(!i||i.disabled) return; try{ i.focus(); if(p!=null) i.setSelectionRange(p,p); }catch(e){} };
  if(m.focoManual){ m.focoManual=false; foca('agm-dur-manual'); }
  else if(m.focoExtra){ m.focoExtra=false; const i=document.getElementById('agm-extra-busca'); foca('agm-extra-busca', i?i.value.length:null); }
  else if(focoId) foca(focoId, pos);
  // ➕ a linha recém-adicionada aparece: #agm-pessoas tem 180px e rola — sem isso ela nascia abaixo da dobra.
  if(m.ultimoExtra){ const r=document.querySelector(`#agm-pessoas [data-agm-p="${CSS.escape(m.ultimoExtra)}"]`); m.ultimoExtra='';
    if(r){ try{ r.closest('.agm-extra-row').scrollIntoView({block:'nearest'}); }catch(e){} } }
}
async function agConfirma(){
  const m=_agM; if(!m) return;
  const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===m.evId); if(!ev) return;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const fb=document.getElementById('agm-fb'); if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Processando…'; }
  const dia=(ev.inicio||'').slice(0,10);
  // Sem e-mail de propósito: o servidor resolve o e-mail do aviso individual no Teams pelo accountId, no
  // cadastro do Jira (avisaTeamsDM) — um e-mail vindo do navegador poderia mandar o aviso para outra pessoa.
  const pessoas=[...document.querySelectorAll('[data-agm-p]:checked')].map(x=>({ accountId:x.getAttribute('data-agm-p'), nome:x.getAttribute('data-agm-nome')||'' }));
  // ➕ quem não estava no convite do Outlook — vai no mesmo lote; fica no 🗒 histórico de ações (quem incluiu quem).
  const extras=[...document.querySelectorAll('[data-agm-p][data-agm-extra]:checked')].map(x=>x.getAttribute('data-agm-nome')||'');
  // 🙋 você marcado (JI-153): o seu worklog sai no MESMO lote (o servidor aponta quem tem o accountId do token) —
  // por isso a trava do planejamento (porta única, 04) vem ANTES de qualquer escrita, inclusive de criar o ticket.
  const eu=!!(id.accountId&&pessoas.some(p=>p.accountId===id.accountId));
  const futura=dia>hojeSP();
  try{
    // ⏱ As horas do convite são conferidas ANTES de criar/vincular: um ticket criado com o convite
    // recusado deixaria a reunião pela metade.
    const seg=pessoas.length?agSegConvite(ev,m):null;
    if(pessoas.length&&!seg) throw new Error(m.durModo==='manual'?'Informe as horas do convite no campo ✎ manual (ex.: 1h30, 45m).':'A duração real do Teams não está disponível — escolha 📅 estimada ou ✎ manual.');
    if(eu&&futura) throw new Error('A reunião ainda não aconteceu — desmarque você: as suas horas você aponta depois (⏱ Apontar ou 📆 Hoje).');
    if(eu&&!(await planGate(dia))){   // 🚧 dia sem planejamento: avisa ou bloqueia — nada foi criado ainda
      if(fb){ fb.className='ap-fb'; fb.textContent='Nada foi criado. Para criar o ticket e enviar os convites sem apontar as suas horas agora, desmarque você na lista.'; }
      return; }
    if(_agM!==m||!agAgModalAberto()) return;   // a pessoa fechou o 📝 enquanto a trava estava na tela
    let key=m.fixo;
    if(!key){
      const modo=((document.querySelector('input[name=agm-modo]:checked')||{}).value)||'criar';
      // 🔒 Reserva a reunião ANTES de criar/vincular: duas pessoas no mesmo segundo → só uma passa.
      let tv=null;
      if(ev.uid){
        if(fb){ fb.className='ap-fb'; fb.textContent='🔒 Reservando a reunião…'; }
        tv=await agTravaPost(Object.assign({ agtrava:'reservar' }, agTravaMeta(ev)));
        if(_agM!==m||!agAgModalAberto()){ if(tv&&tv.reservado) agTravaPost({ agtrava:'liberar', uid:ev.uid }).catch(()=>{}); return; }
        if(tv&&tv.ja){   // alguém criou primeiro: nada é criado — o 📝 vira "aponte no ticket que já existe"
          agGuardaTrava(ev, Object.assign({ estado:'ok' }, tv.ja)); agJaCriado(m, Object.assign({ estado:'ok' }, tv.ja)); agAtualizaModal();
          const fb2=document.getElementById('agm-fb'); if(fb2){ fb2.hidden=false; fb2.className='ap-fb'; fb2.textContent=`✋ ${(tv.ja.por&&tv.ja.por.nome)||'Outra pessoa'} criou o ticket ${tv.ja.k} agora há pouco — nada foi criado de novo. Confira quem aponta e confirme.`; }
          if(agVistaAberta()) renderAgenda();
          return; }
        if(tv&&tv.criando){
          if(tv.criando.minha) throw new Error('Você mesmo está criando o ticket desta reunião em outra aba ou aparelho — termine lá (ou espere 3 minutos) e abra de novo.');
          agGuardaTrava(ev, Object.assign({ estado:'criando' }, tv.criando)); if(agVistaAberta()) renderAgenda();
          throw new Error(`${(tv.criando.por&&tv.criando.por.nome)||'Outra pessoa'} está criando o ticket desta reunião agora — espere um instante e abra de novo: quando ficar pronto, você só aponta.`); }
        if(!agReservaOk(tv)) throw new Error((tv&&tv.erro)||'Não consegui reservar a reunião — tente de novo.');
      }
      let certo=false;   // a falha é CERTA (o servidor respondeu "não criei"/"não comentei")? só então a reserva é solta
      try{
      if(modo==='vincular'){
        key=String((document.getElementById('agm-chave')||{}).value||'').trim().toUpperCase();
        if(!/^[A-Z][A-Z0-9]*-\d+$/.test(key)) throw new Error('Informe a chave do ticket (ex.: IMI-41).');
        const rc=await fetch('/api/transicao',{ method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ comentar:true, issue:key, texto:`Reunião vinculada: ${ev.titulo}\n${agDescEvento(ev)}`, email:id.email, token:id.token }) });
        const jc=await rc.json(); if(!jc||!jc.ok){ certo=true; throw new Error((jc&&jc.erro)||'Falha ao comentar no ticket.'); }
      } else {
        const proj=((document.getElementById('agm-proj')||{}).value)||'RDF';
        const tipo=agTipoReuniao(proj); if(!tipo){ certo=true; throw new Error(`Projeto ${proj} sem tipo de issue utilizável.`); }
        const r=await fetch('/api/criar',{ method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ email:id.email, token:id.token,
            itens:[{ projeto:proj, tipoId:tipo.id, resumo:`Reunião: ${ev.titulo}`.slice(0,250), descricao:agDescEvento(ev), venc:dia, labels:['agenda-outlook'].concat(tv&&tv.rotulo?[tv.rotulo]:[]) }] }) });
        const j=await r.json(); const criado=j&&j.criados&&j.criados[0];
        if(!criado||!criado.key){ certo=true; throw new Error((j&&j.erros&&j.erros[0]&&j.erros[0].erro)||(j&&j.erro)||'Falha ao criar o ticket.'); }
        key=criado.key;
      }
      }catch(e){
        if(tv&&tv.reservado){
          if(certo) agTravaPost({ agtrava:'liberar', uid:ev.uid, tok:tv.tok }).catch(()=>{});   // nada criado: a reunião volta a ficar livre
          // sem resposta (rede, 504): o ticket PODE ter nascido — a reserva fica e, em 3 min, a label decide
          else throw new Error(`${humanizaErro(e)} — não deu para saber se o ticket foi criado. A reunião fica reservada por 3 minutos; confira no Jira antes de tentar de novo (se ele nasceu, aparece aqui sozinho).`);
        }
        throw e; }
      // 🔒 confirma: a reunião passa a ter dono — todo participante vê o ticket (e quem tentar criar cai nele)
      if(ev.uid&&tv&&!tv.semTrava){
        const c=await agTravaPost(Object.assign({ agtrava:'confirmar', k:key, tok:tv.tok }, agTravaMeta(ev))).catch(()=>null);
        if(c&&c.ok&&c.trava) agGuardaTrava(ev, c.trava);
        else if(c&&(c.ja||c.criando)){
          // Enquanto você criava, a reunião ficou com OUTRO ticket (a sua reserva venceu e alguém assumiu): o seu ficou
          // solto no Jira. Nada de convites nele — o 📝 vira "aponte no ticket da reunião".
          const outro=c.ja||c.criando;
          agGuardaTrava(ev, Object.assign({ estado:c.ja?'ok':'criando' }, outro));
          if(c.ja){ agJaCriado(m, Object.assign({ estado:'ok' }, c.ja)); agAtualizaModal(); }
          const fb3=document.getElementById('agm-fb'); const msg=`⚠ Enquanto você criava, a reunião ficou com ${c.ja?`o ticket ${c.ja.k}`:'outra reserva'}${outro.por&&outro.por.nome?` (de ${outro.por.nome})`:''}. O seu ${key} ficou solto no Jira — exclua ou 🔗 transfira. ${c.ja?'Aponte aqui no ticket da reunião.':''}`;
          if(fb3){ fb3.hidden=false; fb3.className='ap-fb err'; fb3.textContent=msg; }
          toast(msg,'warn'); if(agVistaAberta()) renderAgenda();
          return; }
        else { agGuardaTrava(ev,{ estado:'ok', k:key, por:{ acc:id.accountId||'', nome:id.nome||'' }, em:new Date().toISOString() });
          toast(`⚠ ${key} criado, mas não consegui registrar a trava da reunião agora${tv.rotulo?' — ela se acerta sozinha pela label do ticket':''}.`,'warn'); }
      }
      agMarcaTicket(ev.id, key, { semTrava:true });
    }
    let convidados=0, meu=null, avisos=[], gravar=false;   // gravar = houve logAcao(…,false) → UMA salvaCfg() no fim
    if(pessoas.length){
      const rv=await fetch('/api/apontar',{ method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ convidar:true, issue:key, segundos:seg, inicio:dia,
          comentario:`Reunião: ${ev.titulo}`.slice(0,200), pessoas, avisarTeams:true, email:id.email, token:id.token }) });
      const jv=await rv.json(); if(!jv||jv.ok===false) throw new Error((jv&&jv.erro)||'Ticket ok, mas falhou o envio dos convites.');
      convidados=pessoas.length-(eu?1:0);
      if(eu){
        meu=jv.proprio||null;
        if(meu&&meu.ok){
          // o mesmo pós-apontamento das outras portas: total do dia, 🕑 recentes e 🗒 Histórico (formato do ⏱ Apontar)
          try{ registraExtraDia(dia, seg, key); atualizaPainelHoras(); }catch(e){}
          estado.apontar.porData={}; estado.apontar.recentes=null;
          logAcao({ acao:'apontar', t:key, para:`${fmtH(seg)} em ${dia}`, motivo:`📅 ${String(ev.titulo||'').slice(0,100)}`, ok:true }, false); gravar=true;
        } else avisos.push(`⚠ O seu apontamento não saiu${meu&&meu.erro?` (${meu.erro})`:''} — lance pelo ⏱ Apontar.`);
      }
      // No formato que o 🗒 Histórico mostra: t = ticket (vira link), para = quem entrou fora do convite, motivo = a reunião.
      if(extras.length){ logAcao({acao:'agenda-convidar-extra', t:key, para:extras.join(', ').slice(0,200), motivo:`fora do convite: ${String(ev.titulo||'').slice(0,100)}`, n:extras.length, ok:true}, false); gravar=true; }
    }
    // ✅ reunião realizada → o ticket sai de "📆 Reunião Agendada" (só nesse status; nunca em reunião futura).
    let concl=null;
    if(!futura){ concl=await agConcluiReuniao(key, id); if(concl.feito) gravar=true;
      else if(concl.motivo==='erro'||concl.motivo==='sem-transicao') avisos.push(`⚠ Não consegui concluir o ticket${concl.erro?` (${concl.erro})`:' (o fluxo não tem a transição)'} — mude o status no Jira.`); }
    if(gravar) salvaCfg();
    toast(`✓ ${key}${meu&&meu.ok?` · ${fmtH(seg)} apontadas no seu usuário`:''}${convidados?` · ${convidados} convite(s) de apontamento enviados${extras.length?` (${extras.length} fora do convite)`:''}`:''}${concl&&concl.feito?` · status ${concl.para}`:''}`,'ok');
    avisos.forEach(a=>toast(a,'warn'));
    _agM=null; fechaModal();
    // o 📝 pode ter sido aberto pelo 📆 Hoje (24b) ou pela Início: redesenha a tela que está aberta — nunca troca pela Agenda
    if(ev.uid) agTiraAlerta(ev.uid);   // ⏰ o alerta do fim do dia desta reunião sai do 📥 Inbox
    if(typeof hjVistaAberta==='function'&&hjVistaAberta()) renderHoje(); else if(agVistaAberta()||estado.vista==='chamadas') renderAgenda(); else if(estado.vista==='acoes') agendaRenderAcoes();
    else if(estado.vista==='inbox'){ if(typeof renderInbox==='function') renderInbox(); }   // 📝 Criar agora do Inbox: a tela segue sendo o Inbox
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
      try{ agCarregaTravas(); }catch(e){}   // 🔒 quem já criou (ou está criando) o ticket de cada reunião
      if(ag.abrirUid){ const u=ag.abrirUid; ag.abrirUid=''; const evU=((j&&j.eventos)||[]).find(x=>x.uid===u);   // ⏰ "📝 Criar agora" do Inbox
        if(evU) setTimeout(()=>agAbreTicket(evU.id),0); else toast('Essa reunião não está no período da agenda.','warn'); }
      if(agVistaAberta()) renderAgenda(); else if(estado.vista==='chamadas') chmAgendaChegou(); else if(typeof hjVistaAberta==='function'&&hjVistaAberta()) renderHoje(); else agendaRenderAcoes();   // 📆 Hoje (24b) também desenha a agenda
      try{ agAutoCria(); }catch(e){} })
    .catch(e=>{ ag.carregando=false; ag.erro=humanizaErro(e); if(agVistaAberta()) renderAgenda(); else if(estado.vista==='chamadas') chmAgendaChegou(); else if(typeof hjVistaAberta==='function'&&hjVistaAberta()) renderHoje(); else agendaRenderAcoes(); });
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
// Eventos que PRECISAM de ticket e qualquer participante pode criar (desde 2026-10-27 inclusive os de um colega —
// antes eram só os seus e os de organizador externo). Fora: ignoradas e as que outra pessoa está criando agora. É
// isso que faz o 🚫 valer também no card do Início e no 📆 Fechamento do mês. Null enquanto a agenda não carregou.
function agPendentes(){
  const d=estado.agenda&&estado.agenda.dados; if(!d||!Array.isArray(d.eventos)) return null;
  return d.eventos.filter(ev=>!ev.privado&&agClasse(ev)==='minha');
}
// (agAguardando saiu em 2026-10-27: com a 🔒 trava, a reunião de um colega também é sua para criar — está em agPendentes.)
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
  const ctrl=agVistaAberta()&&estado.vista==='agcontrole';   // aba 🎫 Controle de tickets; o resto da função serve às duas abas
  const h2=ctrl?'🎫 Controle de tickets <span>quem cria o ticket de cada reunião e o que ainda falta</span>':'📅 Agenda <span>seus eventos do Outlook → ticket de reunião</span>';
  if(!id){
    cont.replaceChildren(el(`<div><div class="card full"><h2>${h2}</h2>
      <div class="estado">Identifique-se (e-mail + token do Jira) para carregarmos a SUA agenda.<br>
        <button class="btn primario" data-ap-act="config-id" style="margin-top:10px">Identificar-se</button></div></div></div>`));
    return;
  }
  if(!ag.dados && !ag.erro){
    if(!ag.carregando) carregaAgenda(false);
    cont.replaceChildren(el(`<div><div class="card full"><h2>${h2}</h2>${skeletonPainel()}</div></div>`));
    return;
  }
  const d=ag.dados||{};
  if(ag.erro || d.configurado===false){
    cont.replaceChildren(el(`<div><div class="card full"><h2>${h2}</h2>
      <div class="estado">${esc(ag.erro||d.erro||'Não consegui carregar a agenda.')}
        <div style="margin-top:10px"><button class="btn" data-ag-refresh>Tentar de novo</button></div></div></div></div>`));
    return;
  }
  const evs=d.eventos||[]; const hoje=projHoje();
  const orgExt=agOrgExterno;
  // 🎫 Controle de tickets: todo evento não particular precisa de ticket. Desde 2026-10-27 QUALQUER participante da
  // Dexterity cria (antes o convidado ficava "aguardando quem organizou", sem poder apontar):
  //   ⚠ sem ticket — qualquer um cria (as que já passaram ficam recolhidas)
  //   ⏳ sendo criadas — outra pessoa reservou a reunião agora (🔒 trava; some em 3 min se não confirmar)
  //   ✓ com ticket · 🚫 ignoradas (recolhidos: são a maior parte do ruído)
  const naoPriv=evs.filter(ev=>!ev.privado);
  const grupos={ ok:[], minha:[], criando:[], ign:[] };
  naoPriv.forEach(ev=>grupos[agClasse(ev)].push(ev));
  const pend=grupos.minha;
  const pendPass=pend.filter(ev=>(ev.inicio||'').slice(0,10)<hoje);
  const pendProx=pend.filter(ev=>(ev.inicio||'').slice(0,10)>=hoje);
  const criando=grupos.criando;
  const aberto=(k)=>!!(ag.secoes||{})[k];
  // 🔎 Confere no Jira se as pendentes JÁ têm ticket criado fora do app — pelo resumo E PELO DIA
  // (conta de serviço): se achar, a linha oferece "usar este ticket" e o modal abre em "vincular".
  ag.achados=ag.achados||{};
  const pendSem=pend;
  if(ctrl && pendSem.length && !ag.conferiu && !ag.conferindo){   // só a aba do controle mostra o "🟡 achei no Jira"
    ag.conferindo=true;
    // O servidor confere até 8 por pedido: com a semana passada na agenda (2026-10-26) vão LOTES de 8, as mais
    // recentes primeiro, até AG_CONF_MAX — antes as 8 primeiras da lista eram as únicas conferidas.
    const fila=pendSem.slice().sort((x,y)=>String(y.inicio||'').localeCompare(String(x.inicio||''))).slice(0,AG_CONF_MAX);
    const lotes=[]; for(let i=0;i<fila.length;i+=8) lotes.push(fila.slice(i,i+8));
    Promise.all(lotes.map(l=>fetch('/api/reunioes',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({conferir:1,itens:l.map(ev=>({titulo:ev.titulo,dia:(ev.inicio||'').slice(0,10)}))})})
      .then(r=>r.json()).catch(()=>({}))))
      .then(js=>({achados:Object.assign({},...js.map(j=>(j&&j.achados)||{}))}))
      .then(j=>{ ag.conferindo=false; ag.conferiu=true;
        const a=(j&&j.achados)||{};
        pendSem.forEach(ev=>{ const h=a[agAchKey(ev)]; if(h&&h.k) ag.achados[ev.id]=h; });
        if(agVistaAberta()) renderAgenda(); if(_agM) agAtualizaModal(); })
      .catch(()=>{ ag.conferindo=false; ag.conferiu=true; if(agVistaAberta()) renderAgenda(); if(_agM) agAtualizaModal(); });
  }
  // Peças reaproveitadas pelas linhas dos quatro blocos.
  const ctQuando=(ev)=>{ const dia=(ev.inicio||'').slice(0,10); const n=agDiasAtras(dia);
    return `<span class="muted small">· ${esc(alxDataBR(dia))}${dia===hoje?' · <b>hoje</b>':''}</span>`
      +(n>0?` <span class="ag-ct-atras" data-tip="Quanto tempo esta reunião está sem ticket">há ${n} dia${n>1?'s':''}</span>`:'');
  };
  const ctAchado=(ev)=>agAchadoDe(ev.id);
  const ctUsar=(ev,ach)=>`<button class="btn primario" data-ag-usar="${escA(ev.id)}|${escA(ach.k)}" data-tip="Registra este ticket como o da reunião (vínculo compartilhado com o time)">✓ usar este ticket</button>`;
  const ctSituAchado=(ach)=>`<span class="ag-ct-ok">🟡 achei no Jira</span> <a href="${jiraBase()}/browse/${encodeURIComponent(ach.k)}" target="_blank" rel="noopener">${esc(ach.k)} ↗</a> <span class="muted small" title="${escA(ach.resumo||'')}">${esc(String(ach.resumo||'').slice(0,36))}</span>${(ach.criadoPor&&ach.criadoPor.nome)?` <span class="muted small" data-tip="${escA(`Quem criou o ticket no Jira${ach.criadoEm?` em ${alxDataBR(ach.criadoEm)}`:''}`)}">por ${esc(String(ach.criadoPor.nome).split(' ')[0])}</span>`:''}`;
  const ctIgnorar=(ev)=>`<button class="btn" data-ag-ignorar="${escA(ev.id)}" data-tip="${escA(agSerieDe(ev)
    ?'Tira esta reunião recorrente (todas as ocorrências) da cobrança — nada muda no Outlook nem no Jira'
    :'Tira esta reunião da cobrança — nada muda no Outlook nem no Jira')}">🚫 ignorar</button>`;
  // ✂ Desvincular (2026-10-02): só o vínculo do painel; o ticket fica no Jira e não é sugerido de novo.
  const ctDesv=(ev)=>`<button class="btn" data-ag-desvincular="${escA(ev.id)}" data-tip="Desfaz só o vínculo no painel — o ticket continua no Jira e a reunião volta a 'sem ticket'; este ticket não é sugerido de novo para ela">✂ desvincular</button>`;
  // 🔁 Recorrente: liga/desliga a criação automática do ticket de cada ocorrência.
  const ctAuto=(ev)=>{ if(!(ev.recorrente&&(ev.meu||orgExt(ev)))) return '';
    const reg=agRegraDe(ev);
    return reg?`<button class="btn" data-ag-auto="${escA(ev.id)}" data-tip="${escA(`Automático no projeto ${reg.projeto} — clique para desligar`)}">🔁 automático (${esc(reg.projeto)})</button>`
      :`<button class="btn" data-ag-auto="${escA(ev.id)}" data-tip="Toda ocorrência desta reunião recorrente vira ticket sozinha quando você abre a Agenda">⚡ automatizar</button>`; };
  const ctRow=(c1,c2,c3,c4)=>`<div class="ag-ct-row"><div>${c1}</div><div class="muted small">${c2}</div><div>${c3}</div><div class="ag-ct-acao">${c4}</div></div>`;
  // Cabeçalho e linhas dividem UM grid (display:contents nos filhos) — senão cada
  // linha resolve as colunas sozinha e o cabeçalho não alinha com o conteúdo.
  const ctTab=(a,b,linhas)=>`<div class="ag-ct-tab"><div class="ag-ct-head"><span>Reunião</span><span>${a}</span><span>${b}</span><span></span></div>${linhas}</div>`;
  // Quem organizou (só informação — desde 2026-10-27 qualquer participante da Dexterity cria).
  const ctOrg=(ev)=>ev.meu?'Você':orgExt(ev)?'Externo':esc(String((ev.organizador&&(ev.organizador.nome||ev.organizador.email))||'—').split(' ')[0]);
  // ⚠ Sem ticket — qualquer participante cria. Quem reservar primeiro trava a reunião para os outros (🔒).
  const linhaPend=(ev)=>{
    const ach=ctAchado(ev);
    const colega=!ev.meu&&!orgExt(ev);
    const av=colega?agAvisoDe(ev.id):null;
    const situ=ach?ctSituAchado(ach)
      :`<span class="ag-ct-pend">⚠ sem ticket</span>${ag.conferindo?' <span class="muted small">· 🔎 conferindo no Jira…</span>':''}`
        +(av?` <span class="badge" data-tip="${escA(`Aviso no Inbox de quem organizou${av.quando?` em ${alxDataBR(String(av.quando).slice(0,10))}`:''}`)}">📨 avisado</span>`:'');
    const acao=ach?ctUsar(ev,ach)+ctIgnorar(ev)
      :`<button class="btn primario" data-ag-criar="${escA(ev.id)}" data-tip="Qualquer participante da Dexterity cria: quem criar primeiro trava a reunião — os outros veem o ticket e só apontam">📝 Criar/vincular</button>`
        +(colega&&!av?`<button class="btn" data-ag-avisar="${escA(ev.id)}" data-tip="Deixa um aviso 'reunião sem ticket' no 📥 Inbox de quem organizou (no fim do dia ele recebe o alerta de qualquer jeito)">📨 avisar quem organizou</button>`:'')
        +`${ctAuto(ev)}${ctIgnorar(ev)}`;
    return ctRow(`<strong>${esc(ev.titulo)}</strong> ${ctQuando(ev)}`, ctOrg(ev), situ, acao);
  };
  // ⏳ Outra pessoa reservou a reunião e está criando o ticket agora (🔒) — ninguém mais cria em paralelo.
  const linhaCriando=(ev)=>{
    const tv=agTravaDe(ev)||{}; const nome=String(((tv.por||{}).nome)||'Alguém').split(' ')[0];
    return ctRow(`<strong>${esc(ev.titulo)}</strong> ${ctQuando(ev)}`, ctOrg(ev),
      `<span class="ag-ct-criando">⏳ ${esc(nome)} está criando</span>${tv.em?` <span class="muted small">desde ${esc(String(tv.em).slice(11,16))} UTC</span>`:''}`,
      `<button class="btn" data-ag-travas="1" data-tip="Confere de novo quem criou o ticket desta reunião">↻ conferir</button>`);
  };
  // ✓ Resolvidas — ficam recolhidas: é o grosso da lista e não pede nada de ninguém.
  const linhaOk=(ev)=>{
    const tk=agTicketDe(ev.id);
    const quem=ev.meu?'Você (organizou)':orgExt(ev)?'Organizador externo':`${esc(String((ev.organizador&&(ev.organizador.nome||ev.organizador.email))||'').split(' ')[0])} (organizou)`;
    const situ=`<span class="ag-ct-ok">✓ criado</span> <a href="${jiraBase()}/browse/${encodeURIComponent(tk.t)}" target="_blank" rel="noopener">${esc(tk.t)} ↗</a>${tk.por?` <span class="muted small" data-tip="Quem criou o ticket">por ${esc(String(tk.por).split(' ')[0])}</span>`:''}`;
    const souDono=agSouDonoTicket(ev);
    const acao=(souDono?`<button class="btn" data-ag-convidar="${escA(ev.id)}">👥 convidar</button>`:`<button class="btn" data-ag-convidar="${escA(ev.id)}" data-tip="O ticket é de outra pessoa (que já convidou o time) — aponte as SUAS horas nele">⏱ apontar</button>`)+ctAuto(ev)+ctDesv(ev);
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
      <h3 class="ag-ct-h">⚠ Sem ticket — qualquer participante da Dexterity cria <span class="muted small">· ${pend.length} reunião(ões). 🔒 Quem criar primeiro trava a reunião: os outros veem o ticket e só apontam — ninguém cria em dobro. Se ninguém criar até o fim do dia, quem organizou recebe um alerta no 📥 Inbox.</span></h3>
      ${ag.semTrava?'<div class="aviso" style="margin:4px 0 8px">⚠ A trava das reuniões está desligada neste ambiente (sem banco configurado) — confira o 🟡 achei no Jira antes de criar.</div>':''}
      ${pendProx.length?ctTab('Organizou','Situação',pendProx.map(linhaPend).join(''))
        :'<div class="muted small" style="padding:6px 0">✅ Nada pendente de hoje em diante.</div>'}
      ${pendPass.length?secao('passadas',`🕗 Já aconteceram <span class="muted small">· ${pendPass.length} reunião(ões) atrasada(s) sem ticket — o time ainda não conseguiu apontar</span>`,
        `<div class="ag-sec-acao"><button class="btn" data-ag-ign-passadas="1" data-tip="Tira da cobrança todas as reuniões já passadas sem ticket — nada muda no Outlook nem no Jira">🚫 ignorar as ${pendPass.length} passadas</button></div>`
        +ctTab('Organizou','Situação',pendPass.map(linhaPend).join('')))
        :''}
    </div>`
    :'<div class="muted small" style="margin:4px 0 8px">✅ Nenhuma reunião sem ticket.</div>';
  const blocoCriando=criando.length?`<div class="ag-ct-bloco">
      <h3 class="ag-ct-h">⏳ Sendo criadas agora <span class="muted small">· ${criando.length} reunião(ões) que outra pessoa reservou — em instantes o ticket aparece e você só aponta</span></h3>
      ${ctTab('Organizou','Situação',criando.map(linhaCriando).join(''))}
    </div>`:'';
  const caixaPend=naoPriv.length?`<div class="card full" style="margin-bottom:12px">
    <h2>${h2}</h2>
    <div class="ts-fonte" style="gap:12px;flex-wrap:wrap"><span class="muted small">${esc(d.de||'')} → ${esc(d.ate||'')} · ${naoPriv.length} reunião(ões) — 🔒 particulares ficam de fora · o vínculo é por ocorrência e vale para o time todo</span>
      <span class="spacer"></span><button class="btn" data-ag-refresh title="Rebuscar a agenda e a conferência no Jira ignorando o cache">⟳ Atualizar</button></div>
    ${ag.autoRodando?'<div class="aviso" style="margin:6px 0 8px">🔁 Criando os tickets das reuniões recorrentes de hoje…</div>'
      :(nAuto?`<div class="muted small" style="margin:4px 0 8px">🔁 <b>${nAuto}</b> reunião(ões) recorrente(s) automatizada(s): o ticket de cada ocorrência é criado sozinho ao abrir a Agenda — resta apontar as horas.</div>`:'')}
    <div class="ag-ct-kpis">
      <span class="ag-ct-kpi ${pend.length?'w':'t'}">⚠ <b>${pend.length}</b> sem ticket</span>
      ${criando.length?`<span class="ag-ct-kpi">⏳ <b>${criando.length}</b> sendo criada(s)</span>`:''}
      <span class="ag-ct-kpi t">✓ <b>${grupos.ok.length}</b> com ticket</span>
      ${grupos.ign.length?`<span class="ag-ct-kpi">🚫 <b>${Object.keys(ignChaves).length}</b> ignorada(s)</span>`:''}
    </div>
    ${blocoMinhas}
    ${blocoCriando}
    ${grupos.ok.length?secao('ok',`✓ Com ticket <span class="muted small">· ${grupos.ok.length} reunião(ões) resolvida(s) — nada a fazer</span>`,
      ctTab('Quem criou','Ticket',grupos.ok.map(linhaOk).join(''))):''}
    ${linhasIgn?secao('ign',`🚫 Ignoradas <span class="muted small">· ${Object.keys(ignChaves).length} reunião(ões) que não viram ticket</span>`,
      ctTab('O que é','Situação',linhasIgn)):''}
  </div>`:'';
  const porDia={}; evs.forEach(ev=>{ const dia=(ev.inicio||'').slice(0,10)||'(sem data)'; (porDia[dia]=porDia[dia]||[]).push(ev); });
  const dias=Object.keys(porDia).sort();
  const blocoDia=(dia)=>{
    const rows=porDia[dia].map(ev=>{
      const hora=ev.diaTodo?'dia todo':`${(ev.inicio||'').slice(11,16)}–${(ev.fim||'').slice(11,16)}`;
      const badge=ev.meu?'<span class="badge com-horas" data-tip="Você é o organizador">você organizou</span>'
        :'<span class="badge" data-tip="Você foi convidado(a)">convidado</span>';
      const tk=agTicketDe(ev.id);
      const priv=!!ev.privado;
      const ign=!priv&&!tk&&agIgnorado(ev);
      const criandoOutro=!priv&&!tk&&!ign&&agCriandoOutro(ev);
      const selo=priv?'<span class="badge" data-tip="Evento particular — não precisa de ticket">🔒 particular</span>'
        :(tk?'':ign?'<span class="badge" data-tip="Marcada como &quot;não precisa de ticket&quot; no 🎫 Controle de tickets — sai das pendências">🚫 ignorada</span>'
          :criandoOutro?`<span class="badge ag-b-criando" data-tip="Outra pessoa reservou esta reunião e está criando o ticket agora — em instantes ele aparece aqui">⏳ ${esc(String(((agTravaDe(ev)||{}).por||{}).nome||'alguém').split(' ')[0])} está criando</span>`
          :'<span class="badge ms-b-atra" data-tip="Qualquer participante da Dexterity cria: quem criar primeiro trava a reunião — os outros veem o ticket e só apontam">⚠ sem ticket — qualquer participante cria</span>');
      const acao=tk
        ?`<a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(tk.t)}" target="_blank" rel="noopener">✓ ${esc(tk.t)} ↗</a>${tk.por?`<div class="muted small" data-tip="Quem criou o ticket">por ${esc(String(tk.por).split(' ')[0])}</div>`:''}${agSouDonoTicket(ev)?`<button class="btn" data-ag-convidar="${escA(ev.id)}" data-tip="Convidar (mais) participantes para apontar as horas desta reunião">👥 convidar</button>`:`<button class="btn" data-ag-convidar="${escA(ev.id)}" data-tip="O ticket é de outra pessoa (que já convidou o time) — aponte as SUAS horas nele">⏱ apontar</button>`}${ctDesv(ev)}`
        :criandoOutro?`<button class="btn" data-ag-travas="1" data-tip="Confere de novo quem criou o ticket desta reunião">↻ conferir</button>`
        :`<button class="btn ${priv||ign?'':'primario'}" data-ag-criar="${escA(ev.id)}" data-tip="Escolha o projeto (ou vincule a um ticket existente) e convide os participantes para apontar — quem criar primeiro trava a reunião">📝 Criar/vincular ticket</button>`;
      return `<div class="ag-ev${dia<hoje?' ag-passado':''}">
        <div class="ag-hora">${esc(hora)}</div>
        <div class="ag-info"><strong>${esc(ev.titulo)}</strong> ${badge} ${selo}<br>
          <span class="muted small">${esc(ev.organizador.nome||ev.organizador.email)} · 👥 ${ev.participantes}${ev.local?` · ${esc(ev.local.slice(0,40))}`:''}${ev.link?` · <a href="${escA(ev.link)}" target="_blank" rel="noopener">entrar ↗</a>`:''}</span></div>
        <div class="ag-acao">${acao}</div></div>`;
    }).join('');
    return `<div class="vg-card" style="margin-bottom:12px"><h3>${esc(agRotuloDia(dia))} <span class="muted small" style="font-weight:400">· ${porDia[dia].length} evento(s)</span></h3>${rows}</div>`;
  };
  // 🕗 Dias antes de ontem (a agenda vem desde a segunda da semana passada): recolhidos num bloco no topo, com a
  // contagem — ontem, hoje e os próximos dias continuam à vista, como antes. Aberto/fechado em estado.agenda.secoes.
  const ontem=voltaDias(hoje,1);
  const diasPass=dias.filter(d=>d<ontem), diasProx=dias.filter(d=>!(d<ontem));
  const nPass=diasPass.reduce((s2,d)=>s2+porDia[d].length,0);
  const nPassSem=diasPass.reduce((s2,d)=>s2+porDia[d].filter(ev=>!ev.privado&&agClasse(ev)==='minha').length,0);
  const blocos=(diasPass.length?`<details class="ag-sec ag-passados"${aberto('diasPassados')?' open':''}><summary data-ag-sec="diasPassados">🕗 Dias anteriores <span class="muted small">· ${esc(alxDataBR(diasPass[0]))} → ${esc(alxDataBR(diasPass[diasPass.length-1]))} · ${nPass} evento(s)${nPassSem?` · <b>${nPassSem} sem ticket</b>`:''} — clique para ver</span></summary><div class="ag-sec-corpo">${diasPass.map(blocoDia).join('')}</div></details>`:'')
    +diasProx.map(blocoDia).join('');
  try{ renderAbas(); }catch(e){}   // o contador da aba 🎫 (pendências suas) nasce com os dados da agenda, não só no render() geral
  if(ctrl){   // aba 🎫: só o controle — a lista de eventos fica na aba 📅
    cont.replaceChildren(el(`<div class="tela-agenda tela-agctrl">${caixaPend||`<div class="card full"><h2>${h2}</h2><div class="estado">Nenhuma reunião (fora as 🔒 particulares) no período da agenda.</div></div>`}</div>`));
    return;
  }
  // Faixa-resumo: os números do controle e o caminho para a aba — o controle inteiro saiu desta tela.
  const faixa=naoPriv.length?`<div class="ag-ct-faixa">🎫 <b>Controle de tickets</b>
      <span class="ag-ct-kpi ${pend.length?'w':'t'}">⚠ <b>${pend.length}</b> sem ticket</span>
      ${criando.length?`<span class="ag-ct-kpi">⏳ <b>${criando.length}</b> sendo criada(s)</span>`:''}
      <span class="ag-ct-kpi t">✓ <b>${grupos.ok.length}</b> com ticket</span>
      ${grupos.ign.length?`<span class="ag-ct-kpi">🚫 <b>${Object.keys(ignChaves).length}</b> ignorada(s)</span>`:''}
      <button class="btn ${pend.length?'primario':''}" data-ag-goto-ctrl="1" data-tip="Abre a aba 🎫 Controle de tickets: as reuniões sem ticket (qualquer participante cria), as que estão sendo criadas, ignorar e desvincular">Abrir o controle →</button></div>`:'';
  cont.replaceChildren(el(`<div class="tela-agenda">
    <div class="card full"><h2>📅 Agenda <span>${esc(d.de||'')} → ${esc(d.ate||'')} · seus eventos do Outlook — 1 clique vira ticket de reunião</span></h2>
      <div class="ts-fonte" style="gap:12px;flex-wrap:wrap">
        <span class="muted small">${evs.length} evento(s) · convites de ${esc((d.ocultarDe||[]).join(', '))} ficam ocultos (menos na agenda de quem organizou)${d.nOcultos?` · ${d.nOcultos} oculto(s)`:''}</span>
        <span class="spacer"></span><button class="btn" data-ag-refresh title="Rebuscar a agenda ignorando o cache">⟳ Atualizar</button></div>
      ${faixa}
      ${evs.length?'':'<div class="estado" style="margin-top:10px">Nenhum evento no período.</div>'}
    </div>
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
  const gc=e.target.closest&&e.target.closest('[data-ag-goto-ctrl]');
  if(gc){ vaiPara('agcontrole'); return; }
  // ✂ desvincular: confirma, desfaz o vínculo do painel (o ticket fica no Jira) e lembra a recusa
  const dv=e.target.closest&&e.target.closest('[data-ag-desvincular]');
  if(dv){ const evId=dv.getAttribute('data-ag-desvincular');
    const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===evId); const tk=agTicketDe(evId); if(!ev||!tk) return;
    if(!confirm(`Desvincular ${tk.t} de "${ev.titulo}"? Só o vínculo do painel é desfeito — o ticket continua no Jira — e a reunião volta a "sem ticket". Este ticket não será sugerido de novo para ela.`)) return;
    agDesmarcaTicket(evId);
    logAcao({acao:'agenda-desvincular', t:ev.titulo, k:tk.t, ok:true});
    toast(`✂ ${tk.t} desvinculado de "${String(ev.titulo).slice(0,40)}" — a reunião voltou às pendências.`,'ok');
    pintaBadgeInbox(); renderAgenda(); return; }
  const av=e.target.closest&&e.target.closest('[data-ag-avisar]');
  if(av){ if(!idApontar()){ abreIdentidade(); return; } agAvisaInbox(av.getAttribute('data-ag-avisar')); return; }
  const tr=e.target.closest&&e.target.closest('[data-ag-travas]');
  if(tr){ estado.agenda.travasCarr=false; agCarregaTravas(); toast('🔒 Conferindo quem criou os tickets das reuniões…','ok'); return; }
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
    const evId=cv.getAttribute('data-ag-convidar');
    const tk=agTicketDe(evId);
    agAbreTicket(evId, (tk&&tk.t)||'');
    // ticket de OUTRA pessoa (trava): o modal abre em "aponte as suas horas", com só você marcado
    const evC=agEvento(evId); const tvC=agTravaDe(evC);
    if(_agM&&tvC&&tvC.estado==='ok'&&!agSouDonoTicket(evC)){ agJaCriado(_agM, tvC); agAtualizaModal(); }   // inclusive para quem organizou
    return; }
  const bt=e.target.closest&&e.target.closest('[data-ag-criar]');
  if(!bt) return;
  if(!idApontar()){ abreIdentidade(); return; }
  agAbreTicket(bt.getAttribute('data-ag-criar'));
});
// 🔒 Voltou para a aba com a Agenda aberta: relê as travas (alguém pode ter criado o ticket de uma reunião enquanto isso).
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'&&estado.agenda.dados&&!estado.agenda.travasCarr&&idApontar()) agCarregaTravas();   // Agenda, Início, Hoje…
});
// Modal do ticket da reunião (vive em #modal): confirmar, trocar modo/projeto.
document.addEventListener('click',(e)=>{
  const c=e.target.closest&&e.target.closest('[data-agm-conf]');
  if(c){ agConfirma(); return; }
  // ➕ adicionar/tirar alguém que não está no convite (chips da busca e ✕ da linha)
  const xa=e.target.closest&&e.target.closest('[data-agm-extra-add]');
  if(xa){ agExtraAdiciona(xa.getAttribute('data-agm-extra-add')); return; }
  const xr=e.target.closest&&e.target.closest('[data-agm-extra-rm]');
  if(xr){ e.preventDefault(); agExtraRemove(xr.getAttribute('data-agm-extra-rm')); return; }
  const ur=e.target.closest&&e.target.closest('[data-agm-usu-retry]');
  if(ur){ agCarregaUsuarios(true); agAtualizaModal(); return; }
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
  if(t.matches('input[name=agm-modo]')){ _agM.modoManual=true; agAtualizaModal(); return; }   // a escolha da pessoa vence a sugestão
  if(t.matches('#agm-proj')){ agAtualizaModal(); return; }
  // ⏱ estimada · real · manual — "real" consulta o Teams na hora (uma vez por modal)
  if(t.matches('input[name=agm-dur]')){ _agM.durModo=t.value; _agM.focoManual=(t.value==='manual');
    if(t.value==='real'&&!(_agM.segReal>0)){ agBuscaReal(); return; }
    agAtualizaModal(); return; }
});
document.addEventListener('input',(e)=>{
  const t=e.target; if(!t||!t.matches||!_agM) return;
  if(t.matches('#agm-dur-manual')){ _agM.manualTxt=t.value;   // sem redesenhar: só o resumo "worklog de X" acompanha a digitação
    const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===_agM.evId); const s=ev?agSegConvite(ev,_agM):null;
    const sp=document.getElementById('agm-dur-ef'); if(sp) sp.textContent=s?fmtH(s):'—'; return; }
  if(t.matches('#agm-chave')) _agM.chaveManual=true;
  // ➕ busca de quem não está no convite: só a lista de resultados redesenha (o campo mantém o foco)
  if(t.matches('#agm-extra-busca')){ _agM.extraBusca=t.value;
    const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===_agM.evId); const l=document.getElementById('agm-extra-lista');
    if(ev&&l) l.replaceChildren(el(`<div class="agm-extra-lista-in">${agExtraListaHTML(_agM, ev)}</div>`)); }
});
// Enter no campo ➕ adiciona o resultado destacado (o 1º) sem confirmar o modal. Esc com texto só limpa a busca —
// este listener roda antes do Esc global do 30-eventos-boot (que fecharia o modal e perderia os extras); com o
// campo vazio, o Esc segue fechando o modal como em todo o app.
document.addEventListener('keydown',(e)=>{
  if(!_agM) return; const t=e.target; if(!t||!t.matches||!t.matches('#agm-extra-busca')) return;
  if(e.key==='Escape'){
    if(!t.value) return;
    e.preventDefault(); e.stopImmediatePropagation();
    t.value=''; _agM.extraBusca=''; const l=document.getElementById('agm-extra-lista'); if(l) l.replaceChildren();
    return;
  }
  if(e.key!=='Enter') return;
  e.preventDefault();
  const ev=((estado.agenda.dados||{}).eventos||[]).find(x=>x.id===_agM.evId); if(!ev) return;
  const c=agExtraCandidatos(_agM, ev, _agM.extraBusca||'').itens; if(c.length) agExtraAdiciona(c[0].acc);
});

