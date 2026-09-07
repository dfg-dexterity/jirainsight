// Jira Insights · 26 · 🧭 NAVEGAÇÃO — render() (dispatcher de telas), modal, vaiPara, menus (NAVCAT),
// favoritos e paleta de comandos (Ctrl+K).

// 🚧 Telas em reformulação: Alocação (macro) e Planejamento macro ficam
// temporariamente indisponíveis (pedido de 2026-08-17) até a reformulação,
// que vai integrá-las ao 📋 Meu Planejamento. O código original permanece
// intacto (renderAlocacao/renderPlanejamento) para a volta.
function renderIndisponivel(v){
  const cont=document.getElementById('conteudo');
  const rot=v==='alocacao'?'🧑‍💼 Alocação (macro)':'📅 Planejamento macro';
  cont.replaceChildren(el(`<div class="card full">
    <h2>${rot} <span>temporariamente indisponível</span></h2>
    <div class="aviso" style="margin-top:8px">🚧 Esta funcionalidade está <b>temporariamente indisponível</b>.
      Vamos <b>reformulá-la</b> no futuro, integrada ao novo <b>📋 Meu Planejamento</b> — acompanhe no 🗺️ Roadmap.</div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn primario" data-goto="minhasemana">📋 Abrir o Meu Planejamento</button>
      <button class="btn" data-goto="roadmap">🗺️ Ver o Roadmap</button>
    </div>
  </div>`));
}
function render(){
  _tscReset();   // limpa o registro de gráficos interativos a cada re-render
  aplicaChrome();   // mostra só os controles do topo que fazem sentido nesta tela
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
  if(estado.vista==='alocacao') return renderIndisponivel('alocacao');
  if(estado.vista==='planejamento') return renderIndisponivel('planejamento');
  if(estado.vista==='admin') return renderAdmin();
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
function marcaVista(v){
  const seg=document.getElementById('seg-vista'); if(!seg) return;
  seg.querySelectorAll('[data-v],.navg-b').forEach(b=>b.setAttribute('aria-pressed','false'));
  const it=seg.querySelector(`[data-v="${v}"]`);
  if(it){ it.setAttribute('aria-pressed','true');
    const g=it.closest('.navg'); if(g){ const hb=g.querySelector('.navg-b'); if(hb) hb.setAttribute('aria-pressed','true'); } }
}
function fechaMenusNav(){ document.querySelectorAll('#seg-vista .navg.open').forEach(x=>{ x.classList.remove('open');
  const hb=x.querySelector('.navg-b'); if(hb) hb.setAttribute('aria-expanded','false'); }); }
function vaiPara(v){
  if(v!=='ranking' && estado.ranking){ estado.ranking._entrou=false; estado.ranking._contou=false; }   // 🌠 anima de novo na próxima entrada
  estado.vista=v;
  marcaVista(v); fechaMenusNav();
  render(); estadoParaURL();
  window.scrollTo({ top:0, behavior:'smooth' });
}

// ---- 🔍 Paleta de navegação (Ctrl+K) + ⭐ favoritos na barra ----
// Catálogo de telas: [slug, rótulo, grupo, palavras-chave p/ busca]. Ações extras
// (sem vista própria) entram com slug 'acao:<nome>'.
const NAVCAT=[
  ['visao','Visão Geral','Início','inicio home executiva kpis'],
  ['acoes','🏠 Início — Ações de hoje','Início','hoje pendencias novidades inicio home principal minhas horas vencidos'],
  ['prioridades','🎯 Prioridades do time','Início','prioridades semana reuniao semanal decisao pauta modo reuniao vencidos time equipe'],
  ['minhasemana','📋 Meu Planejamento','Planejamento','planejamento semanal planejar semana atividades horas enviar aprovacao gestor rotina realizado'],
  ['planrel','📊 Relatórios do planejamento','Planejamento','relatorios planejado realizado audiencia executiva gestor pessoa projeto drill tickets semana'],
  ['apontar','⏱ Apontar','Meu trabalho','worklog horas lancar apontamento registrar tempo'],
  ['rateio','➗ Rateio de horas','Meu trabalho','rateio massa lote dividir horas percentual fatias slices apontamento varios tickets status conjunto'],
  ['agenda','📅 Agenda','Meu trabalho','outlook reuniao eventos calendario convite'],
  ['inbox','📥 Inbox','Meu trabalho','convites mencoes pendencias caixa entrada aprovacoes'],
  ['mencoes','💬 Menções','Meu trabalho','comentarios marcado responder citacoes'],
  ['meudia','📍 Meu dia','Meu trabalho','timetracking dia atividade sugestoes ia'],
  ['alocacao','🧑‍💼 Alocação (macro)','Planejamento','capacidade recurso utilizacao semanas travar gantt skill simulacao resource macro periodo aprovar'],
  ['planejamento','📅 Planejamento macro','Planejamento','funcao fases epicos planejado realizado'],
  ['planejar','📝 Criação de Ticket','Planejamento','criar tickets lote'],
  ['ondecrio','🌳 Onde crio o ticket?','Planejamento','arvore decisao projeto duvida'],
  ['projetos','📁 Projetos','Análise','bi ficha portfolio epicos saude consolidado'],
  ['resumo','Resumo','Análise','kpis horas faturavel ia'],
  ['timesheet','Timesheet','Análise','horas planilha clockwork pessoa dia lacuna'],
  ['ranking','Ranking','Análise','engajamento cumprimento apontamento'],
  ['tickets','Tickets','Análise','issues lista periodo'],
  ['qualidade','Qualidade (IA)','Análise','auditoria ia tickets qualidade'],
  ['audit','🕵️ Auditoria de Tickets','Análise','validacoes ti-04-014 conformidade'],
  ['analytics','📈 Analytics','Análise','governanca 26 visoes graficos desvios'],
  ['relatorios','📚 Central de Relatórios','Análise','catalogo relatorios tipo projeto categoria matriz configuravel essencial recomendado dimensao entrega escopo tempo custo recursos risco ams portfolio central dea def pea pef dams pams imi ipa itpr'],
  ['metricas','📈 Métricas por tipo de projeto','Análise','metricas tipo projeto categoria horas mensal equipe capacidade senior junior pleno epico estimado gasto rentabilidade margem vendidas realizadas administrativo backlog custo departamento carga planejamento chamados causa raiz arquivado dea def pea pef dams pams arq imi ipa itpr perfis nivel'],
  ['roadmap','🗺️ Roadmap','Análise','proximas funcionalidades futuro planejado novidades melhorias'],
  ['gestao','🛠 Gestão de Tickets','Gestão','massa atribuir status transferir epico duplicados excluir'],
  ['alertas','🚨 Alertas','Gestão','central atrasados vencidos reprogramar'],
  ['reclassificar','🗂 Reuniões — Reclassificar','Gestão','mover reunioes projeto gestao reuniao'],
  ['reuvinc','🗂 Reuniões — Vincular a tickets','Gestão','teams tickets ams apoio reuniao vincular gestao'],
  ['ams','AMS','Gestão','ciclo faturado banco horas chamados'],
  ['receita','💰 Receita','Gestão','bolsa horas projetos consumo contratado'],
  ['controladoria','🏦 Controladoria de Projetos','Gestão','margem custo receita funcionario gestao esforco executado financeiro categoria ams tarefas avulsas controladoria'],
  ['config','⚙️ Central de configurações','Configurações','config ajustes'],
  ['admin','Contratos (Admin)','Configurações','valores contratos admin'],
  ['acao:metas','🎯 Metas & ausências','Configurações','meta horas feriados ferias ocultar'],
  ['acao:log','🗒 Histórico de ações','Configurações','auditoria log acoes'],
];
const NAV_FAV_KEY='jirainsight_nav_favs';
function navFavs(){ try{ const a=JSON.parse(localStorage.getItem(NAV_FAV_KEY)||'[]'); return Array.isArray(a)?a.filter(v=>VISTAS.includes(v)):[]; }catch(e){ return []; } }
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
    <div class="muted small">Digite para filtrar · Enter abre a primeira · ⭐ fixa a tela na barra (até 6)</div>
    <input class="pal-q" id="pal-q" type="text" placeholder="ex.: minha semana, apontar, desvio, reunião…" autocomplete="off">
    <div id="pal-list"></div>`);
  const lista=document.getElementById('pal-list'); const q=document.getElementById('pal-q');
  const pinta=()=>{
    const t=normPal(q.value);
    const hits=NAVCAT.filter(c=>!t||normPal(c[0]+' '+c[1]+' '+c[2]+' '+c[3]).includes(t));
    lista.innerHTML=hits.map((c,i)=>`<div style="display:flex;align-items:center">
      <button class="pal-row${i===0?' pal-on':''}" data-pal-v="${escA(c[0])}">${esc(c[1])}<span class="pal-g">${esc(c[2])}</span></button>
      ${c[0].startsWith('acao:')?'':`<button class="pal-fav${favs.includes(c[0])?' on':''}" data-pal-fav="${escA(c[0])}" data-tip="${favs.includes(c[0])?'Tirar da barra':'Fixar na barra'}">${favs.includes(c[0])?'★':'☆'}</button>`}
    </div>`).join('')||'<div class="muted small" style="padding:8px">Nada encontrado.</div>';
  };
  pinta();
  q.addEventListener('input',pinta);
  q.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ const b=lista.querySelector('[data-pal-v]'); if(b) b.click(); } });
  setTimeout(()=>q.focus(),50);
}
function navPaletaVai(slug){
  fechaModal();
  if(slug.startsWith('acao:')){ const b=document.querySelector(`#seg-vista [data-acao="${slug.slice(5)}"]`); if(b) b.click(); return; }
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
