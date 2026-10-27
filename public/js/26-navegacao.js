// Jira Insights · 26 · 🧭 NAVEGAÇÃO — render() (dispatcher de telas), modal, vaiPara, menus (NAVCAT),
// favoritos e paleta de comandos (Ctrl+K).

// 🧭 Navegação por perfil (2026-09-13): Alocação (macro) e Planejamento macro foram aposentadas de vez
// (o código segue em _arquivado-planejamento-alocacao.js); os slugs antigos viram alias (VISTA_ALIAS) para
// o 📋 Meu Planejamento. A capacidade macro volta como aba quando for reformulada (🗺️ Roadmap).
function render(){
  _tscReset();   // limpa o registro de gráficos interativos a cada re-render
  try{ usoTela(estado.vista); }catch(e){}   // 📊 conta a abertura da tela (31-uso.js) — nunca atrapalha o desenho
  aplicaChrome();   // mostra só os controles do topo que fazem sentido nesta tela
  aplicaLente();    // 🧭 grupos Dexterity Entrega/Negócio/Insights conforme o perfil (lente, não permissão)
  renderAbas();     // 🗂 barra de abas do grupo (Inbox, Apontar, Tickets do time…) quando a vista é uma aba
  relCtxRender();   // 📚 faixa do relatório aberto pela Central (só na tela dele)
  if(estado.vista==='acoes') return renderAcoes();
  if(estado.vista==='hoje'||estado.vista==='hojetime') return renderHoje();   // 📆 o dia da pessoa · 👥 o dia do time (abas, 24b)
  if(estado.vista==='visao') return renderVisao();
  if(estado.vista==='timesheet') return renderTimesheet();
  if(estado.vista==='ranking') return renderRanking();
  if(estado.vista==='tickets') return renderTickets();
  if(estado.vista==='qualidade') return renderQualidade();
  if(estado.vista==='audit') return renderAudit();
  if(estado.vista==='analytics') return renderAnalytics();
  if(estado.vista==='relatorios') return renderRelatorios();
  if(estado.vista==='metricas') return renderMetricas();
  if(estado.vista==='rentab') return renderRentab();
  if(estado.vista==='meutempo') return renderMeuTempo();
  if(estado.vista==='cronograma') return renderCronograma();
  if(estado.vista==='mencoes') return renderMencoes();
  if(estado.vista==='inbox') return renderInbox();
  if(estado.vista==='projetos') return renderProjetos();
  if(estado.vista==='agenda'||estado.vista==='agcontrole') return renderAgenda();   // 📅 eventos · 🎫 controle (abas)
  if(estado.vista==='chamadas') return renderChamadas();   // 📞 ligações do Mac (Call tracking — 14c)
  if(estado.vista==='minhasemana') return renderMinhaSemana();
  if(estado.vista==='roadmap') return renderRoadmap();
  if(estado.vista==='prioridades') return renderPrioridades();
  if(estado.vista==='apontar') return renderApontar();
  if(estado.vista==='rateio') return renderRateio();
  if(estado.vista==='meudia') return renderMeuDia();
  if(estado.vista==='planejar') return renderPlanejar();
  if(estado.vista==='ondecrio') return renderOndeCrio();
  if(estado.vista==='meustickets') return renderMeusTickets();
  if(estado.vista==='reclassificar') return renderReclass();
  if(estado.vista==='reuvinc') return renderReuVinc();
  if(estado.vista==='gestao') return renderGestao();
  if(estado.vista==='gp') return renderGp();
  if(estado.vista==='alertas') return renderAlertas();
  if(estado.vista==='ams') return renderAMS();
  if(estado.vista==='receita') return renderReceita();
  if(estado.vista==='controladoria') return renderControladoria();
  if(estado.vista==='planrel') return renderPlanRel();
  if(estado.vista==='admin') return renderAdmin();
  if(estado.vista==='parcerias') return renderParcerias();
  if(estado.vista==='uso') return renderUso();
  if(estado.vista==='semanal') return renderSemanal();
  if(estado.vista==='portal') return renderPortal();
  if(estado.vista==='config') return renderConfig();
  return renderResumo();
}
// ======================================================================================

// ---- Modal ----
function abreModal(html){
  document.getElementById('modal-body').innerHTML=html;
  document.getElementById('modal').hidden=false;
}
function fechaModal(){ document.getElementById('modal').hidden=true;
  if(estado.vista==='gestao'){ try{ renderGestao(); }catch(e){} } }

// Troca de aba programática (mantém os botões e a URL em sincronia). Usada pelo
// logo (voltar ao início) e por links internos.
// Marca a aba ativa (e sublinha o grupo dono dela, quando está num dropdown).
// ---- 🗂 GRUPOS DE ABAS (fase 2 da navegação, 2026-09-14): telas que respondem a mesma pergunta viram ABAS
// de um grupo — SEM reescrever as telas. estado.vista continua sendo a tela de cada aba (links ?v=, listeners
// delegados, VCHROME e estadoParaURL ficam como estavam); o grupo é só apresentação: UMA entrada no menu (a
// tela principal) e a barra de abas acima do conteúdo (#abas). Abas do tipo `acao` abrem um modal (Metas,
// Histórico). O 📊 planrel pertence a dois grupos conforme a audiência: 'minha' fica com o Meu Planejamento.
// Uma vista pode aparecer em um único grupo por audiência; o gate (check-entrega) confere.
// Fase 3 (2026-09-14): as fusões de Negócio e Insights — 📑 Contratos (clientes + parceiros), 🛡 Apuração de contratos
// (AMS + Receita), 📊 Visão Geral (painel + Resumo) e a 📚 Central de Relatórios como porta única (catálogo, Analytics e
// Métricas por tipo). A ficha do 📁 projeto liga as áreas pela "espinha do projeto" (projEspinha em 02-projetos.js).
// Fase 4 (2026-09-14): a barra ganhou MEMÓRIA e CONTADORES — o menu abre a última aba usada em cada grupo
// (abaLembra/abaUltima, só neste navegador; links ?v=, favoritos e Ctrl+K continuam abrindo a aba pedida) e as abas
// que têm algo esperando ação mostram o número (ABAS_N: pendências do Inbox, menções sem resposta, vencidos entre os
// tickets abertos). A 🏦 Controladoria segue tela única, agora com o 📁 Resultado do projeto (18-controladoria).
const ABAS=[
  // 2026-10-21 (📆 Hoje — o planejamento do dia como ponto central): o meu dia e, para gestores, o dia do time.
  { id:'hoje',         rot:'📆 Hoje',                   abas:[ {v:'hoje',rot:'📆 Meu dia'}, {v:'hojetime',rot:'👥 Dia do time'} ] },
  { id:'inbox',        rot:'📥 Inbox',                  abas:[ {v:'inbox',rot:'📥 Pendências'}, {v:'mencoes',rot:'💬 Menções'} ] },
  { id:'apontar',      rot:'⏱ Apontar',                abas:[ {v:'apontar',rot:'⏱ Chamados'}, {v:'rateio',rot:'➗ Rateio (vários tickets)'}, {v:'meudia',rot:'📍 Sugestões do dia'} ] },
  // 2026-10-02 (a pedido do usuário: "o controle poluía a tela"): os eventos e o 🎫 Controle de tickets viraram abas.
  { id:'agenda',       rot:'📅 Agenda',                 abas:[ {v:'agenda',rot:'📅 Eventos (Outlook → ticket)'}, {v:'agcontrole',rot:'🎫 Controle de tickets'}, {v:'chamadas',rot:'📞 Ligações'} ] },
  { id:'minhasemana',  rot:'📋 Meu Planejamento',       abas:[ {v:'minhasemana',rot:'📋 Minha semana'}, {v:'planrel',aud:'minha',rot:'📈 Planejado × realizado'} ] },
  { id:'planejar',     rot:'📝 Criar ticket',           abas:[ {v:'ondecrio',rot:'🌳 Passo 0 · Onde crio?'}, {v:'planejar',rot:'📝 Criar (lote, IA, voz)'}, {v:'meustickets',rot:'🧾 Preciso criar meus tickets'} ] },
  { id:'gestao',       rot:'🛠 Tickets do time',        abas:[ {v:'gestao',rot:'🛠 Ações em massa'}, {v:'tickets',rot:'📋 Lista do período'}, {v:'qualidade',rot:'🔎 Qualidade (IA)'}, {v:'audit',rot:'✅ Regras TI-04-014'}, {v:'gp',rot:'🧭 Pendências do projeto'} ] },
  { id:'reclassificar',rot:'🗂 Reuniões',               abas:[ {v:'reclassificar',rot:'↔ Reclassificar'}, {v:'reuvinc',rot:'🔗 Vincular a tickets'} ] },
  { id:'projetos',     rot:'📁 Projetos',               abas:[ {v:'projetos',rot:'📁 Portfólio e ficha'}, {v:'cronograma',rot:'📅 Marcos e Cronograma'} ] },
  { id:'timesheet',    rot:'⏱ Horas do time',           abas:[ {v:'timesheet',rot:'⏱ Timesheet'}, {v:'ranking',rot:'🏆 Ranking'} ] },
  { id:'planrel',      rot:'📊 Planejamento do time',   abas:[ {v:'planrel',aud:'gestor',rot:'👥 Por gestor'}, {v:'planrel',aud:'exec',rot:'👔 Visão executiva'}, {v:'planrel',aud:'proj',rot:'📁 Por projetos'} ] },
  // fase 3 — Dexterity Negócio
  { id:'admin',        rot:'📑 Contratos',              abas:[ {v:'admin',rot:'🏢 Clientes'}, {v:'parcerias',rot:'🤝 Parceiros (consultorias)'} ] },
  { id:'ams',          rot:'🛡 Apuração de contratos',  abas:[ {v:'ams',rot:'🛡 AMS (por ciclo)'}, {v:'receita',rot:'💰 Bolsa de horas & projetos'} ] },
  // fase 3 — Dexterity Insights
  { id:'visao',        rot:'📊 Visão Geral',            abas:[ {v:'visao',rot:'📊 Painel executivo'}, {v:'resumo',rot:'🧠 Resumo (KPIs + IA)'} ] },
  { id:'relatorios',   rot:'📚 Central de Relatórios',  abas:[ {v:'relatorios',rot:'📚 Catálogo R01–R29'}, {v:'analytics',rot:'📈 Analytics (26 visões)'}, {v:'metricas',rot:'📈 Métricas por tipo'}, {v:'semanal',rot:'📊 Semanal'} ] },
  { id:'config',       rot:'⚙️ Central de configurações',abas:[ {v:'config',rot:'⚙️ Central'}, {acao:'metas',rot:'🎯 Metas & ausências'}, {acao:'log',rot:'🗒 Histórico de ações'} ] },
];
function abaAud(){ return (estado.planrel&&estado.planrel.aud)||'gestor'; }
function abaGrupoDe(v, aud){ const a=aud||abaAud(); return ABAS.find(g=>g.abas.some(x=>x.v===v&&(!x.aud||x.aud===a)))||null; }
// A entrada do menu que representa a vista: a própria, ou a tela principal do grupo de abas.
function abaAlvoMenu(v){ const g=abaGrupoDe(v); return g?g.id:v; }
// ---- 🧠 Memória das abas (fase 4): a última aba aberta em cada grupo, só neste navegador. O MENU (a entrada do
// grupo) volta para ela; links ?v=, favoritos ⭐ e o Ctrl+K abrem exatamente a aba pedida. ----
const ABAS_MEM_KEY='jirainsight_abas_ultima_v1';
function abaMemLe(){ try{ const m=JSON.parse(localStorage.getItem(ABAS_MEM_KEY)||'{}'); return m&&typeof m==='object'?m:{}; }catch(e){ return {}; } }
function abaLembra(g, v, aud){ if(!g||!v) return; try{ const m=abaMemLe(); const cur=m[g.id]||{};
  if(cur.v===v&&(cur.aud||'')===(aud||'')) return; m[g.id]={ v, aud:aud||'' }; localStorage.setItem(ABAS_MEM_KEY, JSON.stringify(m)); }catch(e){} }
// A aba que o menu deve abrir para a entrada `gid`: a lembrada (se ainda existir no grupo), senão null (= a própria).
function abaUltima(gid){ const g=ABAS.find(x=>x.id===gid); if(!g) return null; const m=abaMemLe()[gid]; if(!m||!m.v) return null;
  const a=g.abas.find(x=>x.v===m.v&&(x.aud||'')===(m.aud||'')); if(!a) return null;
  if(a.v===gid&&!a.aud) return null; return { v:a.v, aud:a.aud||'' }; }
// ---- 🔢 Contadores das abas (fase 4): número de coisas esperando ação, só onde o dado já está carregado (barato —
// nada é buscado por causa da aba). Cada função devolve um número ou null; o texto é o tooltip. ----
const ABAS_N={
  hoje:    { n:()=>(typeof hjPendentesN==='function')?hjPendentesN():null, tip:'item(ns) do seu dia ainda não feito(s)' },
  inbox:   { n:()=>(typeof inboxPend==='function'&&estado.inbox&&estado.inbox.carregou)?inboxPend():null, tip:'pendência(s) aguardando você (convites, menções, planos para aprovar)' },
  mencoes: { n:()=>(typeof mencoesPend==='function')?mencoesPend():null, tip:'menção(ões) sem resposta' },
  gestao:  { n:()=>(typeof gestaoVencidos==='function')?gestaoVencidos():null, tip:'ticket(s) vencido(s) entre os abertos' },
  gp:      { n:()=>(typeof gpPendN==='function')?gpPendN():null, tip:'ticket(s) vencido(s) ou parado(s) nos projetos em foco' },
  agcontrole: { n:()=>{ const p=(typeof agPendentes==='function')?agPendentes():null; return p?p.length:null; }, tip:'reunião(ões) sem ticket que dependem de você' },
  chamadas: { n:()=>(typeof chmPendentes==='function')?chmPendentes().length:null, tip:'ligação(ões) do Mac esperando ticket ou apontamento' },
};
function abaN(v){ const c=ABAS_N[v]; if(!c) return ''; let n=null; try{ n=c.n(); }catch(e){ n=null; }
  return (typeof n==='number'&&n>0)?`<span class="aba-n" data-tip="${escA(n+' '+c.tip)}">${n>99?'99+':n}</span>`:''; }
function renderAbas(){
  const box=document.getElementById('abas'); if(!box) return;
  const g=abaGrupoDe(estado.vista); if(!g){ box.hidden=true; box.innerHTML=''; return; }
  const aud=abaAud();
  const ativa=g.abas.find(a=>!!a.v&&a.v===estado.vista&&(!a.aud||a.aud===aud)); if(ativa) abaLembra(g, ativa.v, ativa.aud);
  box.hidden=false; box.innerHTML=`<span class="abas-rot" data-tip="Grupo de abas — o menu lembra a última aba que você abriu aqui">${esc(g.rot)}</span>`+g.abas.map(a=>{ const on=!!a.v&&a.v===estado.vista&&(!a.aud||a.aud===aud);
    return `<button class="aba${on?' on':''}" ${a.v?`data-aba-v="${escA(a.v)}"${a.aud?` data-aba-aud="${escA(a.aud)}"`:''}`:`data-aba-acao="${escA(a.acao)}"`} aria-pressed="${on?'true':'false'}">${esc(a.rot)}${a.v?abaN(a.v):''}</button>`; }).join('');
  // 📱 No celular a barra vira UMA linha que rola de lado (mobile.css): a aba ativa precisa ficar à vista.
  // No computador a barra não rola (scrollWidth = clientWidth), então isto não faz nada.
  const on=box.querySelector('.aba.on');
  if(on&&box.scrollWidth>box.clientWidth+1){ const b=box.getBoundingClientRect(), r=on.getBoundingClientRect();
    if(r.left<b.left||r.right>b.right) box.scrollLeft+=r.left-b.left-24; }
}
document.addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('#abas [data-aba-v],#abas [data-aba-acao]'); if(!t) return;
  const ac=t.getAttribute('data-aba-acao'); if(ac){ if(ac==='metas') abreMetas(); else if(ac==='log') abreLogAcoes(); return; }
  const aud=t.getAttribute('data-aba-aud'); if(aud){ estado.planrel=estado.planrel||{}; estado.planrel.aud=aud; }
  const v=t.getAttribute('data-aba-v'); if(v===estado.vista){ render(); estadoParaURL(); return; } vaiPara(v);
});
function marcaVista(v){
  const seg=document.getElementById('seg-vista'); if(!seg) return;
  seg.querySelectorAll('[data-v],.navg-b').forEach(b=>b.setAttribute('aria-pressed','false'));
  // A entrada EXATA da vista quando o menu a lista por nome (👤 Meu trabalho lista abas como ações explícitas);
  // senão, a tela principal do grupo de abas. TODAS as entradas da vista acendem (📝 Criar ticket está no 👤 e no
  // botão ➕); entre entradas com audiência (📈 planrel: "minha" no 👤, o time em Entrega) só a da audiência atual.
  let its=[...seg.querySelectorAll(`[data-v="${v}"]`)];
  if(!its.length) its=[...seg.querySelectorAll(`[data-v="${abaAlvoMenu(v)}"]`)];
  const aud=(typeof estado!=='undefined'&&estado.planrel&&estado.planrel.aud)||'';
  const daAud=its.filter(it=>it.dataset.aud&&it.dataset.aud===aud);
  its=daAud.length?daAud:its.filter(it=>!it.dataset.aud);
  // …e a tela principal do grupo quando ela é um botão FIXO da barra (⏱ Apontar na aba ➗ Rateio): a barra #abas logo
  // abaixo diz "⏱ Apontar › ➗ Rateio" — os dois sinais precisam concordar. O ➕ Criar ticket fica de fora (acende só no 📝).
  const alvo=abaAlvoMenu(v); if(alvo!==v) its.push(...seg.querySelectorAll(`:scope > .navtab[data-v="${alvo}"]:not(#navg-novo-b)`));
  its.forEach(it=>{ it.setAttribute('aria-pressed','true');
    const g=it.closest('.navg'); if(g){ const hb=g.querySelector('.navg-b'); if(hb) hb.setAttribute('aria-pressed','true'); } });
}
function fechaMenusNav(){ document.querySelectorAll('#seg-vista .navg.open').forEach(x=>{ x.classList.remove('open');
  const hb=x.querySelector('.navg-b'); if(hb) hb.setAttribute('aria-expanded','false');
  x.querySelectorAll('.navg-menu').forEach(m=>{ m.style.maxHeight=''; }); }); }
// Teto do dropdown medido na hora de abrir (2026-10-27): a barra pode estar na 2ª linha do cabeçalho (gestor com as
// 3 áreas, janela estreita), então um `max-height` fixo no CSS deixava o fim do 👤 Meu trabalho abaixo da janela.
// Só no computador — na gaveta do celular o menu é um acordeão e quem rola é a gaveta.
function navMenuAltura(g){
  const m=g&&g.querySelector('.navg-menu'); if(!m) return; m.style.maxHeight='';
  if(window.matchMedia&&window.matchMedia('(max-width:760px)').matches) return;
  const top=m.getBoundingClientRect().top; if(!top) return;
  m.style.maxHeight=Math.max(220, Math.floor(window.innerHeight-top-12))+'px';
}
// 🧭 Lente do perfil: esconde na barra os grupos data-area fora dos papéis da pessoa (cfg.papeis) — mas o
// grupo que contém a tela ABERTA sempre aparece (quem chega por link vê onde está). Nada é bloqueado:
// toda tela abre por ?v= e pelo Ctrl+K. Também atualiza os rótulos de ⋯ Mais (tela inicial, ver tudo).
function aplicaLente(){
  const alvo=abaAlvoMenu(estado.vista);
  document.querySelectorAll('#seg-vista .navg[data-area]').forEach(g=>{ const a=g.getAttribute('data-area');
    const contemAtiva=!!g.querySelector(`[data-v="${alvo}"]`);
    g.hidden=!(areaVisivel(a)||contemAtiva); });
  const ta=document.getElementById('btn-todas-areas'); if(ta) ta.textContent=lenteTodas()?'👓 Ver só as áreas do meu perfil':'👓 Ver todas as áreas';
  const bh=document.getElementById('btn-home-atual'); if(bh){ let h=''; try{ h=localStorage.getItem('jirainsight_home')||''; }catch(e){}
    bh.textContent=h&&h===estado.vista?'🏠 Tela inicial: esta ✓ (clique para voltar ao padrão)':'🏠 Usar esta tela como inicial'; }
}
document.addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('#btn-mais-roadmap,#btn-mais-config,#btn-mais-metas,#btn-mais-log,#btn-home-atual,#btn-todas-areas'); if(!t) return;
  if(t.id==='btn-mais-roadmap') vaiPara('roadmap');
  else if(t.id==='btn-mais-config') vaiPara('config');
  else if(t.id==='btn-mais-metas') abreMetas();
  else if(t.id==='btn-mais-log') abreLogAcoes();
  else if(t.id==='btn-home-atual'){ let h=''; try{ h=localStorage.getItem('jirainsight_home')||''; }catch(x){}
    try{ if(h===estado.vista){ localStorage.removeItem('jirainsight_home'); toast('🏠 Tela inicial voltou ao padrão do seu perfil.','ok'); }
      else { localStorage.setItem('jirainsight_home',estado.vista); toast('✓ Esta tela passa a ser a sua tela inicial — o logo e a abertura do app vêm para cá.','ok'); } }catch(x){}
    aplicaLente(); }
  else if(t.id==='btn-todas-areas'){ const ligar=!lenteTodas(); try{ localStorage.setItem('jirainsight_todas_areas',ligar?'1':'0'); }catch(x){}
    aplicaLente(); toast(ligar?'👓 Mostrando todas as áreas: Dexterity Entrega, Negócio e Insights.':'👓 Mostrando só as áreas do seu perfil.','ok'); }
});
function vaiPara(v){
  if(v!=='ranking' && estado.ranking){ estado.ranking._entrou=false; estado.ranking._contou=false; }   // 🌠 anima de novo na próxima entrada
  if(estado.relCtx&&estado.relCtx.vista!==v) relCtxSet(null);   // 📚 o contexto do relatório vale só na tela dele
  estado.vista=v;
  marcaVista(v); fechaMenusNav();
  render(); estadoParaURL();
  window.scrollTo({ top:0, behavior:'smooth' });
}

// ---- 🔍 Paleta de navegação (Ctrl+K) + ⭐ favoritos na barra ----
// CATÁLOGO DE TELAS — a fonte de verdade da navegação (scripts/check-entrega.mjs confere que toda vista
// de VISTAS está aqui e que toda linha tem área válida). Formato: [slug, rótulo, ÁREA, palavras-chave].
// Áreas (AREAS em 01-nucleo.js): hub = Dexterity Hub (para todos) · entrega = Dexterity Entrega ·
// negocio = Dexterity Negócio · insights = Dexterity Insights · admin = Administração · mais = ⋯ Mais.
// As palavras-chave incluem os NOMES ANTIGOS dos menus (análise, gestão, configurações…) para quem ainda
// procura pelo lugar de antes. Ações extras (sem vista própria) entram com slug 'acao:<nome>'.
const NAVCAT=[
  // Dexterity Hub — para todos
  ['acoes','🏠 Início — Ações de hoje','hub','hoje pendencias novidades inicio home principal minhas horas vencidos fechamento do mes'],
  ['hoje','📆 Hoje › 📆 Meu dia','hub','meu dia planejar o dia lista do dia prioridades foco estimativa capacidade linha do tempo agenda blocos cronometro timer fechar o dia rollover amanha organizar meu trabalho'],
  ['hojetime','📆 Hoje › 👥 Dia do time','hub','dia do time quem planejou fechou o dia gestor acompanhamento diario checkin'],
  ['apontar','⏱ Apontar','hub','worklog horas lancar apontamento registrar tempo meu trabalho novo'],
  ['inbox','📥 Inbox › 📥 Pendências','hub','convites mencoes pendencias caixa entrada aprovacoes meu trabalho'],
  ['prioridades','🎯 Prioridades do time','hub','prioridades semana reuniao semanal decisao pauta modo reuniao vencidos time equipe'],
  ['minhasemana','📋 Meu Planejamento › 📋 Minha semana','hub','planejamento semanal planejar minha semana atividades horas enviar aprovacao gestor rotina realizado alocacao macro planejamento macro capacidade meu trabalho'],
  ['agenda','📅 Agenda › 📅 Eventos (Outlook → ticket)','hub','outlook reuniao reunioes do outlook ticket eventos calendario convite meu trabalho novo minhas horas e reunioes'],
  ['agcontrole','📅 Agenda › 🎫 Controle de tickets','hub','controle de tickets reunioes sem ticket cobrar ou criar pendentes depende de voce colegas cobrar ignorar desvincular vinculo achei no jira usar este ticket meu trabalho'],
  ['chamadas','📅 Agenda › 📞 Ligações (Call tracking)','hub','call tracking ligacoes chamadas apontar minhas ligacoes telefonema teams whatsapp google meet zoom facetime microfone mac barra de menus pop-up apontar horas criar ticket reuniao meu trabalho novo'],
  ['rateio','⏱ Apontar › ➗ Rateio de horas','hub','rateio ratear horas em varios tickets massa lote dividir horas percentual fatias slices apontamento varios tickets status conjunto meu trabalho novo'],
  ['meudia','⏱ Apontar › 📍 Sugestões do dia (Meu dia)','hub','timetracking dia atividade sugestoes ia meu trabalho meu dia'],
  ['mencoes','📥 Inbox › 💬 Menções','hub','comentarios marcado responder citacoes meu trabalho'],
  ['meutempo','⏳ Como estou gastando meu tempo?','hub','meu tempo ver como gasto meu tempo como estou gastando historico apontamentos analise ia hora do dia dia da semana tipo ticket projeto epico colaboracao comentarios qualidade dados rotina foco fragmentacao meu trabalho minha semana'],
  ['planejar','📝 Criar ticket › 📝 Criar (lote, IA, voz)','hub','criar tickets lote criacao de ticket linguagem natural voz novo planejamento botao verde'],
  ['ondecrio','📝 Criar ticket › 🌳 Passo 0 · Onde crio?','hub','arvore decisao projeto duvida novo planejamento onde crio o ticket descobrir em que projeto criar'],
  // 👤 Meu trabalho — ações sem tela própria (2026-10-27): o Ctrl+K também as acha; navAcao é a porta.
  // 👤 Meu trabalho › ações sem tela própria (navAcao): o rótulo é o mesmo do menu; 🔀 só no Ctrl+K. A 🎫 busca de
  // ticket NÃO entra aqui: a paleta já tem a linha fixa "🎫 Buscar um ticket" (tkFim) — duas linhas iguais confundiam.
  ['acao:meusproj','🎫 Ver meus tickets de um projeto…','hub','meus tickets por projeto em tal projeto so os meus apontar filtrar por projeto abertos no meu nome'],
  ['acao:transferir','🔗 Transferir ticket com o histórico…','hub','transferir um ticket para outro com todo o historico inteiro juntar mover excluir original comentarios anexos horas'],
  ['acao:convidar','📨 Convidar colegas a apontar…','hub','convidar para apontar num ticket convite apontamento horas colegas time reuniao em grupo'],
  ['acao:transformar','🔀 Transformar chamado em atividade…','hub','transformar chamado atividade subtarefa origem destino levar para dentro de outro'],
  ['meustickets','📝 Criar ticket › 🧾 Preciso criar meus tickets','hub','preciso criar meus tickets criar tickets do que eu ja fiz o que fiz hoje relato texto livre por projeto achar ticket criar apontar horas status assistente dia fechar o dia timesheet novo'],
  // Dexterity Entrega — gestores de entrega e PMs
  ['alertas','🚨 Alertas','entrega','central atrasados vencidos reprogramar gestao'],
  ['gestao','🛠 Tickets do time › 🛠 Ações em massa (Gestão)','entrega','massa atribuir status transferir epico duplicados excluir gestao de tickets'],
  ['tickets','🛠 Tickets do time › 📋 Lista do período','entrega','issues lista periodo analise tickets'],
  ['qualidade','🛠 Tickets do time › 🔎 Qualidade (IA)','entrega','auditoria ia tickets qualidade analise'],
  ['audit','🛠 Tickets do time › ✅ Regras TI-04-014 (Auditoria)','entrega','validacoes ti-04-014 conformidade analise auditoria de tickets'],
  ['gp','🛠 Tickets do time › 🧭 Pendências do projeto','entrega','gerente parados vencidos por pessoa sem atualizacao cobrar cobranca pendencias do projeto gerente de projeto sem data cadastro incompleto reunioes vencidas mensagem teams inbox r29'],
  ['reclassificar','🗂 Reuniões › ↔ Reclassificar','entrega','mover reunioes projeto gestao reuniao'],
  ['reuvinc','🗂 Reuniões › 🔗 Vincular a tickets','entrega','teams tickets ams apoio reuniao vincular gestao'],
  ['projetos','📁 Projetos › 📁 Portfólio e ficha','entrega','bi ficha portfolio epicos saude consolidado analise'],
  ['cronograma','📁 Projetos › 📅 Marcos e Cronograma','entrega','r04 cronograma gantt cascata waterfall marcos epicos fases datas atraso previsao dependencias evolucao burnup analise'],
  ['timesheet','⏱ Horas do time › ⏱ Timesheet','entrega','horas planilha clockwork pessoa dia lacuna analise timesheet'],
  ['ranking','⏱ Horas do time › 🏆 Ranking','entrega','engajamento cumprimento apontamento analise ranking'],
  ['planrel','📊 Planejamento do time (por gestor · executiva · por projetos)','entrega','relatorios planejado realizado audiencia executiva gestor pessoa projeto drill tickets semana planejamento relatorios do planejamento'],
  ['portal','🌐 Portal do cliente','entrega','portal cliente publicar riscos faq decisoes reunioes sharepoint teams visao externa pendencias time do projeto equipe links pre-visualizar convidar acessos area do cliente progresso epicos marcos'],
  // Dexterity Negócio — comercial, financeiro e controladoria
  ['admin','📑 Contratos › 🏢 Clientes','negocio','valores contratos admin clientes ams bolsa projeto configuracoes cadastro contratos clientes'],
  ['parcerias','📑 Contratos › 🤝 Parceiros (consultorias)','negocio','contratos parceria consultoria parceira modalidade horas abertas ams demanda fechada valor hora negociada aviso previo validade faturamento fechamento dia nota conta bancaria calendario configuracoes odoo ordem de venda faturamentos sincronizar horas extras objeto de resultado rateio conta analitica proximas notas'],
  ['ams','🛡 Apuração de contratos › 🛡 AMS (por ciclo)','negocio','ciclo faturado banco horas chamados gestao apuracao ams governanca'],
  ['receita','🛡 Apuração de contratos › 💰 Bolsa de horas & projetos (Receita)','negocio','bolsa horas projetos consumo contratado gestao receita apuracao'],
  ['rentab','💹 Rentabilidade de projetos','negocio','rentabilidade plano projeto duracao carga horaria valor hora receita esforco previsto eficiencia cenario simulacao alocacao consultor junior gestao custo margem folga planner visual realizado odoo ordem de venda faturamento periodos'],
  ['controladoria','🏦 Controladoria de Projetos','negocio','margem custo receita funcionario gestao esforco executado financeiro categoria ams tarefas avulsas controladoria resultado do projeto custo por nivel vendido realizado todas as categorias'],
  // Dexterity Insights — diretoria e governança
  ['visao','📊 Visão Geral › 📊 Painel executivo','insights','inicio home executiva kpis painel executivo diretoria'],
  ['resumo','📊 Visão Geral › 🧠 Resumo (KPIs + IA)','insights','kpis horas faturavel ia analise resumo'],
  ['relatorios','📚 Central de Relatórios › 📚 Catálogo R01–R29','insights','catalogo relatorios tipo projeto categoria matriz configuravel essencial recomendado dimensao entrega escopo tempo custo recursos risco ams portfolio central dea def pea pef dams pams imi ipa itpr analise codigo r visoes blocos'],
  ['analytics','📚 Central de Relatórios › 📈 Analytics (26 visões)','insights','governanca 26 visoes graficos desvios analise analytics'],
  ['metricas','📚 Central de Relatórios › 📈 Métricas por tipo de projeto','insights','metricas tipo projeto categoria horas mensal equipe capacidade senior junior pleno epico estimado gasto rentabilidade margem vendidas realizadas administrativo backlog custo departamento carga planejamento chamados causa raiz arquivado dea def pea pef dams pams arq imi ipa itpr perfis nivel analise'],
  ['uso','📊 Uso do painel','insights','uso adocao analytics telemetria quem usa telas tempo por tela aberturas engajamento medir podar google analytics estatistica acesso'],
  ['semanal','📚 Central de Relatórios › 📊 Relatório semanal','insights','sexta planejado orcado realizado reunioes qualidade comparativo semana a semana foto r28 execucao aderencia consumo vencidos parados por pessoa por projeto gerente delta media'],
  // Administração e ⋯ Mais
  ['config','⚙️ Central de configurações › ⚙️ Central','admin','config ajustes configuracoes perfis papeis pessoas navegacao'],
  ['acao:metas','⚙️ Central de configurações › 🎯 Metas & ausências','admin','meta horas feriados ferias ocultar configuracoes'],
  ['acao:log','⚙️ Central de configurações › 🗒 Histórico de ações','admin','auditoria log acoes configuracoes'],
  ['roadmap','🗺️ Roadmap','mais','proximas funcionalidades futuro planejado novidades melhorias analise'],
  ['acao:reportar','🐞 Reportar bug ou melhoria','mais','bug erro problema defeito falha travou melhoria sugestao ideia duvida feedback github jira issue relatar falar com a gente'],
];
// Telas aposentadas que ainda são procuradas pelo nome antigo: a busca mostra "agora é …".
const NAV_ANTIGAS=[['alocacao','🧑‍💼 Alocação (macro)','minhasemana'],['planejamento','📅 Planejamento macro','minhasemana']];
const NAV_FAV_KEY='jirainsight_nav_favs';
function navFavs(){ try{ const a=JSON.parse(localStorage.getItem(NAV_FAV_KEY)||'[]'); return Array.isArray(a)?[...new Set(a.map(vistaAlias))].filter(v=>VISTAS.includes(v)):[]; }catch(e){ return []; } }
function navFavToggle(v){ let f=navFavs(); f=f.includes(v)?f.filter(x=>x!==v):f.concat(v).slice(0,6);
  try{ localStorage.setItem(NAV_FAV_KEY, JSON.stringify(f)); }catch(e){}
  renderNavFavs(); }
function renderNavFavs(){
  const box=document.getElementById('nav-favs'); if(!box) return;
  box.innerHTML=navFavs().map(v=>{ const c=NAVCAT.find(x=>x[0]===v);
    return c?`<button class="navtab" data-v="${escA(v)}" data-tip="⭐ favorito — gerencie na busca (Ctrl+K)">${esc(c[1])}</button>`:''; }).join('');
  marcaVista(estado.vista);
}
function normPal(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
function abrePaleta(){
  const favs=navFavs();
  abreModal(`<h2>🔍 Ir para…</h2>
    <div class="muted small">Digite para filtrar · Enter abre a primeira · ⭐ fixa a tela na barra (até 6) · as áreas fora do seu perfil aparecem no fim, em cinza — e abrem do mesmo jeito</div>
    <input class="pal-q" id="pal-q" type="text" placeholder="ex.: minha semana, apontar, desvio, reunião…" autocomplete="off">
    <div id="pal-list"></div>`);
  const lista=document.getElementById('pal-list'); const q=document.getElementById('pal-q');
  const pinta=()=>{
    const t=normPal(q.value);
    const areaRot=(k)=>(AREAS[k]&&AREAS[k].rot)||k;
    // 🎫 Tickets (12b-busca-tickets.js): digitar a CHAVE abre a ficha na hora — por isso essa linha vem
    // primeiro e é a do Enter. A linha fixa (no fim) leva à busca projeto → ticket, que é a rápida.
    const bruto=String(q.value||'').trim().toUpperCase();
    const chaveTk=(typeof RE_TKB_CHAVE!=='undefined'&&RE_TKB_CHAVE.test(bruto))?bruto:'';
    const tkTopo=chaveTk?`<div class="pal-area">🎫 Tickets</div><div style="display:flex;align-items:center">
      <button class="pal-row pal-on" data-tkb-abrir="${escA(chaveTk)}">🎫 Abrir o ticket <b>${esc(chaveTk)}</b><span class="pal-g">ficha do ticket</span></button></div>`:'';
    const tkFim=(!t||normPal('ticket tickets chamado issue buscar abertos por projeto chave').includes(t))
      ?`<div class="pal-area">🎫 Tickets</div><div style="display:flex;align-items:center">
        <button class="pal-row" data-tkb-buscar="1">🎫 Buscar um ticket <span class="muted">— escolhe o projeto e entra só nos abertos</span><span class="pal-g">tecla /</span></button></div>`:'';
    const hits=NAVCAT.filter(c=>!t||normPal(c[0]+' '+c[1]+' '+areaRot(c[2])+' '+c[3]).includes(t));
    // agrupa por área na ordem do catálogo; as áreas fora da lente vão para o fim (em cinza)
    const ordem=[]; hits.forEach(c=>{ if(!ordem.includes(c[2])) ordem.push(c[2]); });
    ordem.sort((a,b)=>(areaVisivel(a)?0:1)-(areaVisivel(b)?0:1));
    let i=0; const blocos=ordem.map(a=>{ const fora=!areaVisivel(a);
      return `<div class="pal-area${fora?' pal-fora':''}">${esc(areaRot(a))}${AREAS[a]&&AREAS[a].sub?` <span class="muted">· ${esc(AREAS[a].sub)}</span>`:''}${fora?' <span class="muted">· fora do seu perfil</span>':''}</div>`+
        hits.filter(c=>c[2]===a).map(c=>{ const n=i++; return `<div style="display:flex;align-items:center">
      <button class="pal-row${(n===0&&!chaveTk)?' pal-on':''}${fora?' pal-dim':''}" data-pal-v="${escA(c[0])}">${esc(c[1])}<span class="pal-g">${esc(areaRot(c[2]))}</span></button>
      ${c[0].startsWith('acao:')?'':`<button class="pal-fav${favs.includes(c[0])?' on':''}" data-pal-fav="${escA(c[0])}" data-tip="${favs.includes(c[0])?'Tirar da barra':'Fixar na barra'}">${favs.includes(c[0])?'★':'☆'}</button>`}
    </div>`; }).join(''); }).join('');
    const antigas=t?NAV_ANTIGAS.filter(x=>normPal(x[0]+' '+x[1]).includes(t)).map(x=>{ const c=NAVCAT.find(y=>y[0]===x[2]);
      return `<div style="display:flex;align-items:center"><button class="pal-row pal-dim" data-pal-v="${escA(x[2])}">${esc(x[1])} <span class="muted">→ agora é</span> ${esc(c?c[1]:x[2])}<span class="pal-g">aposentada</span></button></div>`; }).join(''):'';
    lista.innerHTML=(tkTopo+blocos+antigas+tkFim)||'<div class="muted small" style="padding:8px">Nada encontrado.</div>';
  };
  pinta();
  q.addEventListener('input',pinta);
  q.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ const b=lista.querySelector('[data-pal-v],[data-tkb-abrir]')||lista.querySelector('[data-tkb-buscar]'); if(b) b.click(); } });
  setTimeout(()=>q.focus(),50);
}
function navPaletaVai(slug){
  fechaModal();
  if(slug.startsWith('acao:')){ navAcao(slug.slice(5)); return; }
  vaiPara(slug);
}
// ---- 🧭 Ações do menu (2026-10-27, a pedido do usuário: "o menu 👤 Meu trabalho mais explícito — transferir
// ticket, convidar para apontar, meus tickets em tal projeto"). Item de menu `[data-acao="x"]` (29-url-topo.js) e
// slug `acao:x` do Ctrl+K caem AQUI: é a porta única das ações sem tela própria. As que precisam de um ticket abrem
// o seletor 🎫 (projeto → ticket aberto, 12b) e seguem para o modal da ação; as que precisam de identidade pedem
// antes (o seletor fechado no meio confundiria). ----
function navAcao(a){
  // sem identidade, o modal diz PARA QUÊ ela é pedida (senão parece erro); o seletor 🎫 leva no título a ação
  // que vai acontecer (senão parece que o clique abriu a busca errada).
  // `depois`: validada a identidade, a ação continua sozinha (sem a pessoa ter de voltar ao menu).
  const comId=(motivo,fn)=>{ if(!idApontar()){ abreIdentidade(motivo, { depois:fn }); return; } fn(); };
  switch(String(a||'')){
    case 'metas': abreMetas(); return;
    case 'log': abreLogAcoes(); return;
    case 'reportar': abreReportar(); return;
    case 'buscar': abreBuscaTickets(); return;
    case 'transferir': comId('transferir um ticket com todo o histórico', ()=>abreBuscaTickets('', (k)=>abreTransferir(k), '🔗 Transferir: escolha o ticket de origem')); return;
    case 'convidar': comId('convidar colegas a apontar num ticket', ()=>abreBuscaTickets('', (k,info)=>abreConvidarApontar(k, info), '📨 Convidar a apontar: escolha o ticket')); return;
    case 'transformar': comId('transformar um chamado em atividade', ()=>abreTransformar('')); return;
    case 'meusproj': abreMeusTicketsProjeto(); return;
    default: return;
  }
}
// 🎫 Meus tickets por projeto: lista os projetos em que EU tenho tickets abertos (a mesma base do card "meus
// tickets" da Início: até +30 dias e os sem vencimento), com a contagem, e abaixo os demais projetos do catálogo.
// Escolher um abre o ⏱ Apontar com "Só os meus" + o filtro do projeto (hxAbreApontar, 08).
const MTP_ATE=()=>somaDias(hojeSP(),30);
const MTP_TTL_MS=5*60*1000;   // a mesma régua do card da Início (AX_VENC_TTL_MS): contagem com mais de 5 min é relida
function abreMeusTicketsProjeto(){
  // a identidade aqui é só para saber QUEM é você (accountId) — a leitura é pela conta de serviço; identidade antiga
  // sem accountId contaria zero e o Apontar desligaria o "Só os meus" em silêncio, então ela é revalidada antes.
  const id=idApontar(); if(!id||!id.accountId){ abreIdentidade('saber quais tickets são seus', { leitura:true, depois:()=>abreMeusTicketsProjeto() }); return; }
  abreModal(`<h2>🎫 Ver meus tickets de um projeto <span class="muted small">escolha o projeto — abre o ⏱ Apontar só com os seus: abertos no seu nome vencendo até 30 dias ou sem vencimento (lá dá para alargar o "até")</span></h2>
    <input class="pal-q" id="mtp-q" type="text" autocomplete="off" spellcheck="false" placeholder="filtrar projeto…" aria-label="Filtrar projeto">
    <div id="mtp-lista" class="tkb-lista"><div class="estado">Contando os seus tickets abertos…</div></div>`);
  const q=document.getElementById('mtp-q'); if(q){ q.addEventListener('input',()=>mtpPinta());
    q.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); const b=document.querySelector('#mtp-lista [data-mtp-p]'); if(b) b.click(); } });   // ↵ = o 1º da lista (como na paleta)
    setTimeout(()=>q.focus(),50); }
  // `m` é o estado DESTA abertura: a resposta tardia só pinta se o modal ainda for o dela (fechar/escolher zera `_mtp`).
  const m=_mtp={ meus:null, erro:'', parcial:false };
  // A base é a COM os sem vencimento (a chave do cache e a URL levam o semVenc) — mas sem mexer na tela: `carregaVenc`
  // lê `ap.semVenc` só na parte síncrona, então liga, dispara e devolve ao que era. Esc no modal não pode deixar o
  // ⏱ Apontar com "Incluir sem vencimento" marcado; quem escolhe um projeto recebe semVenc:true pelo hxAbreApontar.
  // Cache de outro dia ou com mais de 5 min é relido (o Apontar que abre em seguida relê de qualquer jeito — a
  // contagem prometida não pode ser a de ontem).
  const ap=estado.apontar, svAntes=ap.semVenc; ap.semVenc=true;
  const c=ap.porData[MTP_ATE()+'|1'];
  const velho=!!(c&&(c.lidoEm!==hojeSP()||(Date.now()-(c.lidoTs||0))>MTP_TTL_MS));
  const pVenc=carregaVenc(MTP_ATE(), velho).catch(e=>{ m.erro=humanizaErro(e); return null; });
  ap.semVenc=svAntes;
  Promise.all([ pVenc, (typeof garanteProjetos==='function'?garanteProjetos():Promise.resolve()).catch(()=>null) ])
    .then(([j])=>{ if(_mtp!==m) return;
      const cont={}; ((j&&j.tickets)||[]).forEach(t=>{ if(t.respId===id.accountId&&t.p) cont[t.p]=(cont[t.p]||0)+1; });
      m.meus=cont; m.parcial=!!(j&&j.meta&&j.meta.truncado); mtpPinta(); });
}
let _mtp=null;
function mtpPinta(){
  const box=document.getElementById('mtp-lista'); if(!box||!_mtp) return;
  const md=document.getElementById('modal'); if(md&&md.hidden){ _mtp=null; return; }   // fechado por Esc/×: nada a pintar
  const q=normPal((document.getElementById('mtp-q')||{}).value||'');
  const nomes=(typeof projNomes==='function')?projNomes():{};
  const todos=(typeof tkbProjetos==='function')?tkbProjetos():Object.keys(nomes).map(k=>({k, nome:nomes[k]||k, arq:false}));
  const meus=_mtp.meus||{};
  const linha=(p,n)=>`<div class="tkb-l"><button class="pal-row${p.arq?' pal-dim':''}" data-mtp-p="${escA(p.k)}" title="${escA(p.nome)}">
      <span class="tkb-nome">${esc(p.nome)}</span><span class="muted small">${esc(p.k)}</span>${n?`<span class="tkb-n" data-tip="seus tickets abertos neste projeto (vencendo até 30 dias ou sem vencimento)">${n}</span>`:''}</button></div>`;
  const bate=(p)=>!q||normPal(p.k+' '+p.nome).includes(q);
  const comMeus=todos.filter(p=>meus[p.k]&&bate(p)).sort((a,b)=>meus[b.k]-meus[a.k]||a.nome.localeCompare(b.nome,'pt'));
  const outros=todos.filter(p=>!meus[p.k]&&bate(p));
  const semBase=_mtp.meus===null;
  box.innerHTML=(semBase?'<div class="estado">Contando os seus tickets abertos…</div>':'')
    +(_mtp.erro?`<div class="aviso">Não consegui contar os seus tickets (${esc(_mtp.erro)}) — a lista abaixo é o catálogo.</div>`:'')
    +(_mtp.parcial?'<div class="muted small" style="padding:4px 10px">⚠ A lista do servidor veio cortada — a contagem pode estar incompleta.</div>':'')
    +(comMeus.length?`<div class="pal-area">🎫 Com tickets seus em aberto</div>${comMeus.map(p=>linha(p,meus[p.k])).join('')}`
      :(!semBase&&!_mtp.erro&&!q?'<div class="muted small" style="padding:6px 10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">Nenhum ticket aberto no seu nome (até 30 dias e os sem vencimento). <button class="btn" data-mtp-criar="1">📝 Criar ticket</button></div>':''))
    +(outros.length?`<div class="pal-area">${comMeus.length?'Outros projetos':'Projetos'}</div>${outros.slice(0,60).map(p=>linha(p,0)).join('')}${outros.length>60?`<div class="muted small" style="padding:6px 10px">… e mais ${outros.length-60} — filtre pelo nome.</div>`:''}`:'')
    ||'<div class="muted small" style="padding:8px">Nenhum projeto com esse nome.</div>';
}
document.addEventListener('click',(e)=>{
  const cr=e.target.closest&&e.target.closest('[data-mtp-criar]');
  if(cr){ _mtp=null; fechaModal(); vaiPara('planejar'); return; }   // lista vazia → 📝 Criar ticket, em vez de uma tela em branco
  const b=e.target.closest&&e.target.closest('[data-mtp-p]'); if(!b) return;
  const k=b.getAttribute('data-mtp-p'); _mtp=null; fechaModal();
  hxAbreApontar('todos', { semVenc:true, ate:MTP_ATE(), proj:k });
});
document.addEventListener('click',(e)=>{
  const bp=e.target.closest&&e.target.closest('#btn-paleta'); if(bp){ abrePaleta(); return; }
  const pv=e.target.closest&&e.target.closest('[data-pal-v]'); if(pv){ navPaletaVai(pv.getAttribute('data-pal-v')); return; }
  const pf=e.target.closest&&e.target.closest('[data-pal-fav]');
  if(pf){ navFavToggle(pf.getAttribute('data-pal-fav')); const q=document.getElementById('pal-q'); abrePaleta(); if(q){ const nq=document.getElementById('pal-q'); nq.value=q.value; nq.dispatchEvent(new Event('input')); } }
});
document.addEventListener('keydown',(e)=>{
  if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){ e.preventDefault(); abrePaleta(); }
});
setTimeout(renderNavFavs,0);   // adiado: VISTAS (usada na validação) é declarada mais abaixo
