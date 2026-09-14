// Jira Insights · 26 · 🧭 NAVEGAÇÃO — render() (dispatcher de telas), modal, vaiPara, menus (NAVCAT),
// favoritos e paleta de comandos (Ctrl+K).

// 🧭 Navegação por perfil (2026-09-13): Alocação (macro) e Planejamento macro foram aposentadas de vez
// (o código segue em _arquivado-planejamento-alocacao.js); os slugs antigos viram alias (VISTA_ALIAS) para
// o 📋 Meu Planejamento. A capacidade macro volta como aba quando for reformulada (🗺️ Roadmap).
function render(){
  _tscReset();   // limpa o registro de gráficos interativos a cada re-render
  aplicaChrome();   // mostra só os controles do topo que fazem sentido nesta tela
  aplicaLente();    // 🧭 grupos Dexterity Entrega/Negócio/Insights conforme o perfil (lente, não permissão)
  renderAbas();     // 🗂 barra de abas do grupo (Inbox, Apontar, Tickets do time…) quando a vista é uma aba
  relCtxRender();   // 📚 faixa do relatório aberto pela Central (só na tela dele)
  if(estado.vista==='acoes') return renderAcoes();
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
  if(estado.vista==='agenda') return renderAgenda();
  if(estado.vista==='minhasemana') return renderMinhaSemana();
  if(estado.vista==='roadmap') return renderRoadmap();
  if(estado.vista==='prioridades') return renderPrioridades();
  if(estado.vista==='apontar') return renderApontar();
  if(estado.vista==='rateio') return renderRateio();
  if(estado.vista==='meudia') return renderMeuDia();
  if(estado.vista==='planejar') return renderPlanejar();
  if(estado.vista==='ondecrio') return renderOndeCrio();
  if(estado.vista==='reclassificar') return renderReclass();
  if(estado.vista==='reuvinc') return renderReuVinc();
  if(estado.vista==='gestao') return renderGestao();
  if(estado.vista==='alertas') return renderAlertas();
  if(estado.vista==='ams') return renderAMS();
  if(estado.vista==='receita') return renderReceita();
  if(estado.vista==='controladoria') return renderControladoria();
  if(estado.vista==='planrel') return renderPlanRel();
  if(estado.vista==='admin') return renderAdmin();
  if(estado.vista==='parcerias') return renderParcerias();
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
// Métricas por tipo). A 🏦 Controladoria segue tela única (🗺️ Roadmap: blocos financeiros das Métricas). A ficha do
// 📁 projeto liga as áreas pela "espinha do projeto" (projEspinha em 02-projetos.js).
const ABAS=[
  { id:'inbox',        rot:'📥 Inbox',                  abas:[ {v:'inbox',rot:'📥 Pendências'}, {v:'mencoes',rot:'💬 Menções'} ] },
  { id:'apontar',      rot:'⏱ Apontar',                abas:[ {v:'apontar',rot:'⏱ Chamados'}, {v:'rateio',rot:'➗ Rateio (vários tickets)'}, {v:'meudia',rot:'📍 Sugestões do dia'} ] },
  { id:'minhasemana',  rot:'📋 Meu Planejamento',       abas:[ {v:'minhasemana',rot:'📋 Minha semana'}, {v:'planrel',aud:'minha',rot:'📈 Planejado × realizado'} ] },
  { id:'planejar',     rot:'📝 Criar ticket',           abas:[ {v:'ondecrio',rot:'🌳 Passo 0 · Onde crio?'}, {v:'planejar',rot:'📝 Criar (lote, IA, voz)'} ] },
  { id:'gestao',       rot:'🛠 Tickets do time',        abas:[ {v:'gestao',rot:'🛠 Ações em massa'}, {v:'tickets',rot:'📋 Lista do período'}, {v:'qualidade',rot:'🔎 Qualidade (IA)'}, {v:'audit',rot:'✅ Regras TI-04-014'} ] },
  { id:'reclassificar',rot:'🗂 Reuniões',               abas:[ {v:'reclassificar',rot:'↔ Reclassificar'}, {v:'reuvinc',rot:'🔗 Vincular a tickets'} ] },
  { id:'projetos',     rot:'📁 Projetos',               abas:[ {v:'projetos',rot:'📁 Portfólio e ficha'}, {v:'cronograma',rot:'📅 Marcos e Cronograma'} ] },
  { id:'timesheet',    rot:'⏱ Horas do time',           abas:[ {v:'timesheet',rot:'⏱ Timesheet'}, {v:'ranking',rot:'🏆 Ranking'} ] },
  { id:'planrel',      rot:'📊 Planejamento do time',   abas:[ {v:'planrel',aud:'gestor',rot:'👥 Por gestor'}, {v:'planrel',aud:'exec',rot:'👔 Visão executiva'}, {v:'planrel',aud:'proj',rot:'📁 Por projetos'} ] },
  // fase 3 — Dexterity Negócio
  { id:'admin',        rot:'📑 Contratos',              abas:[ {v:'admin',rot:'🏢 Clientes'}, {v:'parcerias',rot:'🤝 Parceiros (consultorias)'} ] },
  { id:'ams',          rot:'🛡 Apuração de contratos',  abas:[ {v:'ams',rot:'🛡 AMS (por ciclo)'}, {v:'receita',rot:'💰 Bolsa de horas & projetos'} ] },
  // fase 3 — Dexterity Insights
  { id:'visao',        rot:'📊 Visão Geral',            abas:[ {v:'visao',rot:'📊 Painel executivo'}, {v:'resumo',rot:'🧠 Resumo (KPIs + IA)'} ] },
  { id:'relatorios',   rot:'📚 Central de Relatórios',  abas:[ {v:'relatorios',rot:'📚 Catálogo R01–R27'}, {v:'analytics',rot:'📈 Analytics (26 visões)'}, {v:'metricas',rot:'📈 Métricas por tipo'} ] },
  { id:'config',       rot:'⚙️ Central de configurações',abas:[ {v:'config',rot:'⚙️ Central'}, {acao:'metas',rot:'🎯 Metas & ausências'}, {acao:'log',rot:'🗒 Histórico de ações'} ] },
];
function abaAud(){ return (estado.planrel&&estado.planrel.aud)||'gestor'; }
function abaGrupoDe(v, aud){ const a=aud||abaAud(); return ABAS.find(g=>g.abas.some(x=>x.v===v&&(!x.aud||x.aud===a)))||null; }
// A entrada do menu que representa a vista: a própria, ou a tela principal do grupo de abas.
function abaAlvoMenu(v){ const g=abaGrupoDe(v); return g?g.id:v; }
function renderAbas(){
  const box=document.getElementById('abas'); if(!box) return;
  const g=abaGrupoDe(estado.vista); if(!g){ box.hidden=true; box.innerHTML=''; return; }
  const aud=abaAud();
  box.hidden=false; box.innerHTML=`<span class="abas-rot">${esc(g.rot)}</span>`+g.abas.map(a=>{ const on=!!a.v&&a.v===estado.vista&&(!a.aud||a.aud===aud);
    return `<button class="aba${on?' on':''}" ${a.v?`data-aba-v="${escA(a.v)}"${a.aud?` data-aba-aud="${escA(a.aud)}"`:''}`:`data-aba-acao="${escA(a.acao)}"`} aria-pressed="${on?'true':'false'}">${esc(a.rot)}</button>`; }).join('');
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
  const it=seg.querySelector(`[data-v="${abaAlvoMenu(v)}"]`);   // aba de um grupo → marca a tela principal do grupo
  if(it){ it.setAttribute('aria-pressed','true');
    const g=it.closest('.navg'); if(g){ const hb=g.querySelector('.navg-b'); if(hb) hb.setAttribute('aria-pressed','true'); } }
}
function fechaMenusNav(){ document.querySelectorAll('#seg-vista .navg.open').forEach(x=>{ x.classList.remove('open');
  const hb=x.querySelector('.navg-b'); if(hb) hb.setAttribute('aria-expanded','false'); }); }
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
  ['apontar','⏱ Apontar','hub','worklog horas lancar apontamento registrar tempo meu trabalho novo'],
  ['inbox','📥 Inbox › 📥 Pendências','hub','convites mencoes pendencias caixa entrada aprovacoes meu trabalho'],
  ['prioridades','🎯 Prioridades do time','hub','prioridades semana reuniao semanal decisao pauta modo reuniao vencidos time equipe'],
  ['minhasemana','📋 Meu Planejamento › 📋 Minha semana','hub','planejamento semanal planejar semana atividades horas enviar aprovacao gestor rotina realizado alocacao macro planejamento macro capacidade meu trabalho'],
  ['agenda','📅 Agenda','hub','outlook reuniao eventos calendario convite meu trabalho novo'],
  ['rateio','⏱ Apontar › ➗ Rateio de horas','hub','rateio massa lote dividir horas percentual fatias slices apontamento varios tickets status conjunto meu trabalho novo'],
  ['meudia','⏱ Apontar › 📍 Sugestões do dia (Meu dia)','hub','timetracking dia atividade sugestoes ia meu trabalho meu dia'],
  ['mencoes','📥 Inbox › 💬 Menções','hub','comentarios marcado responder citacoes meu trabalho'],
  ['meutempo','⏳ Como estou gastando meu tempo?','hub','meu tempo historico apontamentos analise ia hora do dia dia da semana tipo ticket projeto epico colaboracao comentarios qualidade dados rotina foco fragmentacao meu trabalho'],
  ['planejar','📝 Criar ticket › 📝 Criar (lote, IA, voz)','hub','criar tickets lote criacao de ticket linguagem natural voz novo planejamento'],
  ['ondecrio','📝 Criar ticket › 🌳 Passo 0 · Onde crio?','hub','arvore decisao projeto duvida novo planejamento onde crio o ticket'],
  // Dexterity Entrega — gestores de entrega e PMs
  ['alertas','🚨 Alertas','entrega','central atrasados vencidos reprogramar gestao'],
  ['gestao','🛠 Tickets do time › 🛠 Ações em massa (Gestão)','entrega','massa atribuir status transferir epico duplicados excluir gestao de tickets'],
  ['tickets','🛠 Tickets do time › 📋 Lista do período','entrega','issues lista periodo analise tickets'],
  ['qualidade','🛠 Tickets do time › 🔎 Qualidade (IA)','entrega','auditoria ia tickets qualidade analise'],
  ['audit','🛠 Tickets do time › ✅ Regras TI-04-014 (Auditoria)','entrega','validacoes ti-04-014 conformidade analise auditoria de tickets'],
  ['reclassificar','🗂 Reuniões › ↔ Reclassificar','entrega','mover reunioes projeto gestao reuniao'],
  ['reuvinc','🗂 Reuniões › 🔗 Vincular a tickets','entrega','teams tickets ams apoio reuniao vincular gestao'],
  ['projetos','📁 Projetos › 📁 Portfólio e ficha','entrega','bi ficha portfolio epicos saude consolidado analise'],
  ['cronograma','📁 Projetos › 📅 Marcos e Cronograma','entrega','r04 cronograma gantt cascata waterfall marcos epicos fases datas atraso previsao dependencias evolucao burnup analise'],
  ['timesheet','⏱ Horas do time › ⏱ Timesheet','entrega','horas planilha clockwork pessoa dia lacuna analise timesheet'],
  ['ranking','⏱ Horas do time › 🏆 Ranking','entrega','engajamento cumprimento apontamento analise ranking'],
  ['planrel','📊 Planejamento do time (por gestor · executiva · por projetos)','entrega','relatorios planejado realizado audiencia executiva gestor pessoa projeto drill tickets semana planejamento relatorios do planejamento'],
  // Dexterity Negócio — comercial, financeiro e controladoria
  ['admin','📑 Contratos › 🏢 Clientes','negocio','valores contratos admin clientes ams bolsa projeto configuracoes cadastro contratos clientes'],
  ['parcerias','📑 Contratos › 🤝 Parceiros (consultorias)','negocio','contratos parceria consultoria parceira modalidade horas abertas ams demanda fechada valor hora negociada aviso previo validade faturamento fechamento dia nota conta bancaria calendario configuracoes'],
  ['ams','🛡 Apuração de contratos › 🛡 AMS (por ciclo)','negocio','ciclo faturado banco horas chamados gestao apuracao ams governanca'],
  ['receita','🛡 Apuração de contratos › 💰 Bolsa de horas & projetos (Receita)','negocio','bolsa horas projetos consumo contratado gestao receita apuracao'],
  ['rentab','💹 Rentabilidade de projetos','negocio','rentabilidade plano projeto duracao carga horaria valor hora receita esforco previsto eficiencia cenario simulacao alocacao consultor junior gestao custo margem folga planner visual realizado odoo ordem de venda faturamento periodos'],
  ['controladoria','🏦 Controladoria de Projetos','negocio','margem custo receita funcionario gestao esforco executado financeiro categoria ams tarefas avulsas controladoria'],
  // Dexterity Insights — diretoria e governança
  ['visao','📊 Visão Geral › 📊 Painel executivo','insights','inicio home executiva kpis painel executivo diretoria'],
  ['resumo','📊 Visão Geral › 🧠 Resumo (KPIs + IA)','insights','kpis horas faturavel ia analise resumo'],
  ['relatorios','📚 Central de Relatórios › 📚 Catálogo R01–R27','insights','catalogo relatorios tipo projeto categoria matriz configuravel essencial recomendado dimensao entrega escopo tempo custo recursos risco ams portfolio central dea def pea pef dams pams imi ipa itpr analise'],
  ['analytics','📚 Central de Relatórios › 📈 Analytics (26 visões)','insights','governanca 26 visoes graficos desvios analise analytics'],
  ['metricas','📚 Central de Relatórios › 📈 Métricas por tipo de projeto','insights','metricas tipo projeto categoria horas mensal equipe capacidade senior junior pleno epico estimado gasto rentabilidade margem vendidas realizadas administrativo backlog custo departamento carga planejamento chamados causa raiz arquivado dea def pea pef dams pams arq imi ipa itpr perfis nivel analise'],
  // Administração e ⋯ Mais
  ['config','⚙️ Central de configurações › ⚙️ Central','admin','config ajustes configuracoes perfis papeis pessoas navegacao'],
  ['acao:metas','⚙️ Central de configurações › 🎯 Metas & ausências','admin','meta horas feriados ferias ocultar configuracoes'],
  ['acao:log','⚙️ Central de configurações › 🗒 Histórico de ações','admin','auditoria log acoes configuracoes'],
  ['roadmap','🗺️ Roadmap','mais','proximas funcionalidades futuro planejado novidades melhorias analise'],
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
    const hits=NAVCAT.filter(c=>!t||normPal(c[0]+' '+c[1]+' '+areaRot(c[2])+' '+c[3]).includes(t));
    // agrupa por área na ordem do catálogo; as áreas fora da lente vão para o fim (em cinza)
    const ordem=[]; hits.forEach(c=>{ if(!ordem.includes(c[2])) ordem.push(c[2]); });
    ordem.sort((a,b)=>(areaVisivel(a)?0:1)-(areaVisivel(b)?0:1));
    let i=0; const blocos=ordem.map(a=>{ const fora=!areaVisivel(a);
      return `<div class="pal-area${fora?' pal-fora':''}">${esc(areaRot(a))}${AREAS[a]&&AREAS[a].sub?` <span class="muted">· ${esc(AREAS[a].sub)}</span>`:''}${fora?' <span class="muted">· fora do seu perfil</span>':''}</div>`+
        hits.filter(c=>c[2]===a).map(c=>{ const n=i++; return `<div style="display:flex;align-items:center">
      <button class="pal-row${n===0?' pal-on':''}${fora?' pal-dim':''}" data-pal-v="${escA(c[0])}">${esc(c[1])}<span class="pal-g">${esc(areaRot(c[2]))}</span></button>
      ${c[0].startsWith('acao:')?'':`<button class="pal-fav${favs.includes(c[0])?' on':''}" data-pal-fav="${escA(c[0])}" data-tip="${favs.includes(c[0])?'Tirar da barra':'Fixar na barra'}">${favs.includes(c[0])?'★':'☆'}</button>`}
    </div>`; }).join(''); }).join('');
    const antigas=t?NAV_ANTIGAS.filter(x=>normPal(x[0]+' '+x[1]).includes(t)).map(x=>{ const c=NAVCAT.find(y=>y[0]===x[2]);
      return `<div style="display:flex;align-items:center"><button class="pal-row pal-dim" data-pal-v="${escA(x[2])}">${esc(x[1])} <span class="muted">→ agora é</span> ${esc(c?c[1]:x[2])}<span class="pal-g">aposentada</span></button></div>`; }).join(''):'';
    lista.innerHTML=(blocos+antigas)||'<div class="muted small" style="padding:8px">Nada encontrado.</div>';
  };
  pinta();
  q.addEventListener('input',pinta);
  q.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ const b=lista.querySelector('[data-pal-v]'); if(b) b.click(); } });
  setTimeout(()=>q.focus(),50);
}
function navPaletaVai(slug){
  fechaModal();
  if(slug==='acao:metas'){ abreMetas(); return; }
  if(slug==='acao:log'){ abreLogAcoes(); return; }
  if(slug.startsWith('acao:')) return;
  vaiPara(slug);
}
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
