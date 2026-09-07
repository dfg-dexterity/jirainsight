// Jira Insights · 29 · 🔗 ESTADO NA URL (links compartilháveis), PERIODOS/VISTAS, recarrega(), gaveta e menus do topo.
// ---- Estado na URL (links compartilháveis) ----
const PERIODOS=['hoje','ontem','estaSemana','semanaPassada','7d','esteMes','mesPassado','30d','esteAno','anoPassado'];
const VISTAS=['visao','acoes','inbox','projetos','agenda','minhasemana','planrel','prioridades','roadmap','resumo','timesheet','ranking','tickets','qualidade','audit','analytics','relatorios','metricas','rentab','apontar','rateio','meudia','mencoes','planejar','ondecrio','reclassificar','reuvinc','gestao','alertas','ams','receita','controladoria','alocacao','planejamento','admin','config'];
const TKGROUPS=['projeto','tipo','categoria','pessoa'];
const APFILTROS=['todos','semhoras','vencidos','vencehoje','semvenc'];
let _pendentesURL=null;
let _gxfURL='';   // filtro da Gestão vindo por link compartilhado (?gxf=…), aplicado na 1ª renderização
// ---- Persistência dos filtros (localStorage): recarregar mantém a última visão ----
// Um link compartilhado (com parâmetros na URL) sempre vence; sem parâmetros,
// restauramos os últimos filtros salvos neste navegador.
const FILTROS_KEY='jirainsight_filtros_v1';
function salvaFiltrosLS(qs){ try{ if(qs) localStorage.setItem(FILTROS_KEY, qs); else localStorage.removeItem(FILTROS_KEY); }catch(e){} }
function leFiltrosLS(){ try{ return localStorage.getItem(FILTROS_KEY)||''; }catch(e){ return ''; } }
function leURL(){
  // Sem parâmetros na URL? Restaura os últimos filtros salvos neste navegador.
  let busca=location.search;
  if(!busca || busca==='?'){ const sav=leFiltrosLS(); if(sav) busca='?'+sav; }
  const p=new URLSearchParams(busca);
  estado.periodo = PERIODOS.includes(p.get('p')) ? p.get('p') : '7d';
  estado.vista   = VISTAS.includes(p.get('v')) ? p.get('v') : 'acoes';
  estado.tkGroup = TKGROUPS.includes(p.get('g')) ? p.get('g') : '';
  const ap=estado.apontar;
  ap.ate = /^\d{4}-\d{2}-\d{2}$/.test(p.get('ate')||'') ? p.get('ate') : '';
  ap.fil = APFILTROS.includes(p.get('fil')) ? p.get('fil') : 'todos';
  ap.soMeus = p.get('meus')!=='0';
  ap.semVenc = p.get('sv')==='1' || ap.fil==='semvenc';
  ap.vis = ['lista','tabela','quadro'].includes(p.get('av')) ? p.get('av') : 'lista';
  ap.cat = p.get('acat')||'';
  ap.proj = p.get('aproj')||'';
  const gx=estado.gestao;
  gx.busca=p.get('gq')||''; gx.fProj=p.get('gpj')||''; gx.fResp=p.get('grs')||''; gx.fStatus=p.get('gst')||'';
  gx.preset=p.get('gpr')||''; gx.semTrat=p.get('gtr')==='1';
  if(['resp','proj','tipo','status','prio','epico','venc','risco'].includes(p.get('gag'))) gx.agrupar=p.get('gag');
  if(['lista','tabela','quadro'].includes(p.get('gvi'))) gx.vis=p.get('gvi');
  _gxfURL=p.get('gxf')||'';
  if(p.get('rtk')) estado.rateio.texto=rtParse(p.get('rtk')).join('\n');   // ➗ Rateio pré-carregado por link
  if(REL_SIGLAS.includes(p.get('rsig')||'')){ estado.relcat.sigla=p.get('rsig'); estado.metricas.sigla=p.get('rsig'); }   // 📚 Central / 📈 Métricas por tipo
  if(/^[A-Z][A-Z0-9_]*$/.test(p.get('mproj')||'')) estado.metricas.proj=p.get('mproj');   // 📈 Métricas: projeto em foco
  if(/^rp[a-z0-9]+$/.test(p.get('rpid')||'')) estado.rentab.sel=p.get('rpid');   // 💹 Rentabilidade: plano aberto
  if(['exec','gestor','minha','proj'].includes(p.get('paud'))) estado.planrel.aud=p.get('paud');
  _pendentesURL = { pessoa:p.get('u')||'', categoria:p.get('cat')||'', projeto:p.get('proj')||'',
    tipo:p.get('tipo')||'' };
}
function sincronizaControlesURL(){
  const sel=document.getElementById('f-periodo');
  if([...sel.options].some(o=>o.value===estado.periodo)) sel.value=estado.periodo;
  marcaVista(estado.vista);
}
function aplicaPendentes(){
  if(!_pendentesURL) return;
  const set=(id,val)=>{ const s=document.getElementById(id); if(val && [...s.options].some(o=>o.value===val)) s.value=val; };
  set('f-pessoa',_pendentesURL.pessoa); set('f-categoria',_pendentesURL.categoria);
  set('f-projeto',_pendentesURL.projeto); set('f-tipo',_pendentesURL.tipo);
  _pendentesURL=null;
}
function estadoParaURL(){
  const f=filtros(); const p=new URLSearchParams();
  if(estado.periodo!=='7d') p.set('p',estado.periodo);
  if(estado.vista!=='acoes') p.set('v', estado.vista);
  if(estado.vista==='tickets' && estado.tkGroup) p.set('g',estado.tkGroup);
  if(estado.vista==='apontar'){ const ap=estado.apontar;
    if(ap.ate && ap.ate!==hojeSP()) p.set('ate',ap.ate);
    if(ap.fil!=='todos') p.set('fil',ap.fil);
    if(ap.semVenc && ap.fil!=='semvenc') p.set('sv','1');
    if(ap.vis!=='lista') p.set('av',ap.vis);
    if(!ap.soMeus) p.set('meus','0');
    if(ap.cat) p.set('acat',ap.cat);
    if(ap.proj) p.set('aproj',ap.proj); }
  if(estado.vista==='planrel' && estado.planrel.aud!=='gestor') p.set('paud',estado.planrel.aud);
  if(estado.vista==='relatorios' && estado.relcat.sigla) p.set('rsig',estado.relcat.sigla);
  if(estado.vista==='metricas'){ const mt=estado.metricas; if(mt.sigla) p.set('rsig',mt.sigla); if(mt.proj) p.set('mproj',mt.proj); }
  if(estado.vista==='rentab' && estado.rentab.sel) p.set('rpid',estado.rentab.sel);
  if(estado.vista==='rateio'){ const ks=rtParse(estado.rateio.texto);
    if(ks.length&&ks.length<=30) p.set('rtk',ks.join(','));   // link compartilhável (listas curtas)
  }
  if(estado.vista==='gestao'){ const gx=estado.gestao;
    if(gx.busca) p.set('gq',gx.busca);
    if(gx.fProj) p.set('gpj',gx.fProj);
    if(gx.fResp) p.set('grs',gx.fResp);
    if(gx.fStatus) p.set('gst',gx.fStatus);
    if(gx.preset) p.set('gpr',gx.preset);
    if(gx.semTrat) p.set('gtr','1');
    if(gx.agrupar) p.set('gag',gx.agrupar);
    if(gx.vis!=='tabela') p.set('gvi',gx.vis); }
  if(f.pessoa) p.set('u',f.pessoa);
  if(f.categoria) p.set('cat',f.categoria);
  if(f.projeto) p.set('proj',f.projeto);
  if(f.tipo) p.set('tipo',f.tipo);
  const qs=p.toString();
  history.replaceState(null,'', qs ? ('?'+qs) : location.pathname);
  salvaFiltrosLS(qs);   // persiste a visão atual p/ sobreviver a um reload
}

async function recarrega(forca){
  const cont=document.getElementById('conteudo');
  document.getElementById('erro-box').innerHTML='';
  cont.innerHTML=skeletonPainel();
  try{
    await carrega(estado.periodo, forca===true);
    document.getElementById('atualizado').textContent =
      'Atualizado em '+new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
    preencheFiltros(); aplicaPendentes(); render(); estadoParaURL();
    if(estado.avisoAtiv){
      document.getElementById('erro-box').innerHTML =
        `<div class="aviso">${esc(estado.avisoAtiv)}</div>`;
    }
    return true;
  }catch(e){
    cont.innerHTML='';
    const msg=String(e.message||e);
    const fonte=/clockwork|tempo/i.test(msg)?'Clockwork (horas)':/jira|atividade/i.test(msg)?'Jira (movimentações)':'API do painel';
    const causa=/failed to fetch|network|rede/i.test(msg)?'sem conexão com o servidor (rede/VPN ou deploy em andamento)'
      :/401|403|token/i.test(msg)?'credenciais da conta de serviço inválidas ou expiradas'
      :/429/.test(msg)?'limite de requisições atingido — aguarde um instante':'instabilidade momentânea na fonte de dados';
    document.getElementById('erro-box').innerHTML =
      `<div class="erro"><strong>Falha ao carregar — ${esc(fonte)}.</strong> ${esc(msg)}
        <div class="muted small" style="margin-top:6px">Possível causa: ${esc(causa)}. Ação recomendada: tente de novo; se persistir, verifique as variáveis na Vercel ou fale com o administrador.</div>
        <button class="btn" id="erro-retry" style="margin-top:8px">↻ Tentar de novo</button></div>`;
    const rb=document.getElementById('erro-retry'); if(rb) rb.addEventListener('click', recarrega);
    return false;
  }
}

// Eventos de UI
document.getElementById('seg-vista').addEventListener('click', (ev)=>{
  const seg=ev.currentTarget;
  // Cabeçalho de grupo: abre/fecha o dropdown (não troca de aba).
  const hb=ev.target.closest('.navg-b');
  if(hb){ const g=hb.closest('.navg'); const abrir=!g.classList.contains('open');
    fechaMenusNav(); if(abrir){ g.classList.add('open'); hb.setAttribute('aria-expanded','true'); }
    ev.stopPropagation(); return; }
  // Item de ação (abre modal, não troca de aba).
  const ac=ev.target.closest('[data-acao]');
  if(ac){ fechaMenusNav(); fechaDrawer(); const a=ac.getAttribute('data-acao');
    if(a==='metas') abreMetas(); else if(a==='log') abreLogAcoes();
    ev.stopPropagation(); return; }
  // Item de aba (solo ou dentro do menu).
  const b=ev.target.closest('[data-v]'); if(!b) return;
  if(b.dataset.aud) estado.planrel.aud=b.dataset.aud;   // visões por audiência (menu Planejamento)
  estado.vista=b.dataset.v; marcaVista(estado.vista); fechaMenusNav(); fechaDrawer(); render(); estadoParaURL();
  window.scrollTo({ top:0, behavior:'smooth' });
});
// Menu sanduíche (celular/tablet estreito): abre/fecha o painel de navegação.
function fechaDrawer(){ const s=document.getElementById('seg-vista'); if(s) s.classList.remove('nav-aberto');
  const t=document.getElementById('nav-toggle'); if(t) t.setAttribute('aria-expanded','false'); }
(function(){ const t=document.getElementById('nav-toggle'); if(!t) return;
  t.addEventListener('click', (e)=>{ e.stopPropagation();
    const s=document.getElementById('seg-vista'); if(!s) return;
    const abrir=!s.classList.contains('nav-aberto');
    s.classList.toggle('nav-aberto', abrir); t.setAttribute('aria-expanded', abrir?'true':'false');
    if(!abrir) fechaMenusNav(); }); })();
// Dropdowns da barra de ações (Exportar ▾ / ⋯ Mais) — mesmo padrão do menu.
function fechaMenusHdr(){ document.querySelectorAll('.hdrmenu.open').forEach(x=>{ x.classList.remove('open');
  const b=x.querySelector('.hdrmenu-b'); if(b) b.setAttribute('aria-expanded','false'); }); }
document.addEventListener('click', (e)=>{
  const hb=e.target.closest && e.target.closest('.hdrmenu-b');
  if(hb){ const g=hb.closest('.hdrmenu'); const abrir=!g.classList.contains('open');
    fechaMenusHdr(); if(abrir){ g.classList.add('open'); hb.setAttribute('aria-expanded','true'); } return; }
  if(e.target.closest && e.target.closest('.hdrmenu-m')){ fechaMenusHdr(); return; }
  if(!(e.target.closest && e.target.closest('.hdrmenu'))) fechaMenusHdr();
});
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') fechaMenusHdr(); });
// Clique fora fecha os menus de navegação abertos (e o drawer mobile).
document.addEventListener('click', (e)=>{
  const dentro=e.target.closest && (e.target.closest('#seg-vista')||e.target.closest('#nav-toggle'));
  if(!dentro){ fechaMenusNav(); fechaDrawer(); } });
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape'){ fechaMenusNav(); fechaDrawer(); } });
document.getElementById('f-periodo').addEventListener('change', (ev)=>{ estado.periodo=ev.target.value; recarrega(); });
document.getElementById('btn-refresh').addEventListener('click', ()=>{ delete estado.cache[estado.periodo]; if(estado.ranking) estado.ranking.tempoPer={}; estado.alertas.dados=null; estado.alertas.semHoras=null; estado.ams.dados=null; estado.ams.range=''; recarrega(); });
['f-pessoa','f-categoria','f-projeto','f-tipo'].forEach(id=>
  document.getElementById(id).addEventListener('change', ()=>{ render(); estadoParaURL(); }));

document.getElementById('btn-csv').addEventListener('click', exportaCSV);
