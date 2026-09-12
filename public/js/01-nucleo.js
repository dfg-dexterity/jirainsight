// ============================================================================
// Jira Insights · 01 · NÚCLEO — estado global, paleta, config compartilhada,
// helpers (esc, fmtH, toast, tooltip), datas/feriados, carrega(), filtros, agrega().
// Os arquivos public/js/*.js são scripts clássicos carregados EM ORDEM pelo
// index.html (<script defer>): const/let/function de nível superior são globais
// compartilhados; código que EXECUTA no carregamento só pode usar o que já foi
// declarado em arquivos anteriores (scripts/check-syntax.mjs confere isso).
// ============================================================================
// As CHAVES seguem o tema antigo (para não tocar nos usos); os valores são o tema novo:
// cerceta = índigo (primária) · roxo = violeta · amarelo = âmbar · musgo = esmeralda.
const cores = { cerceta:'#009994', roxo:'#4a3aa7', amarelo:'#eb6834', musgo:'#008300', grafite:'#4D4D4D' };
// Paleta (cores qualitativas do Fiori) para diferenciar projetos nas barras empilhadas.
const PALETA = ['#009994','#eb6834','#4a3aa7','#2a78d6','#e34948','#eda100','#008300','#e87ba4'];
const COR_OUTROS = 'var(--linha2)';
const RE_ROTINA = /rotina|reuni/i;
// Usuários técnicos / apps do Jira a esconder (não são pessoas). Para esconder
// outros, acrescente o nome aqui separado por | (ex.: |meu bot).
const RE_EXCLUIR = /automation for jira|biggantt|gantt chart for jira|microsoft 365 for jira/i;
// Base do Jira para montar os links dos tickets (/browse/CHAVE). Se a instância
// mudar, troque aqui. (Usa o que vier do servidor em meta.jiraBase, se existir.)
const JIRA_BASE_PADRAO = 'https://dexterityit.atlassian.net';
const jiraBase = () => ((estado.atividade&&estado.atividade.meta&&estado.atividade.meta.jiraBase) || JIRA_BASE_PADRAO).replace(/\/+$/,'');
const estado = { periodo:'7d', vista:'acoes', tempo:null, atividade:null, usuarios:{}, avisoAtiv:'', tkGroup:'', cache:{},
  // 🎯 Prioridades do time: base da reunião (?reuniao=1), vencidos até hoje,
  // log de decisões, diff de atividade e o estado do Modo reunião.
  prioridades:{ dados:null, carregando:false, erro:'', venc:null, vencB:false, decs:null, decsB:false,
    ativ:null, ativB:false, aba:'visao', passo:0, novas:[], t0:0, ataUrl:'', proj:'' },
  // Tela "Apontar": data-limite de vencimento, filtros, busca e cache por data.
  // convites = apontamentos de reunião aguardando a confirmação desta pessoa.
  apontar:{ ate:'', fil:'todos', soMeus:true, semVenc:false, busca:'', cat:'', proj:'', vis:'lista', porData:{}, carregando:false, recolhidos:{}, extraPorDia:{},
    convites:null, convitesBusca:false, recentes:null, recCarr:false, recFechado:true, recDet:{}, recDetB:{} },
  // 🏦 Controladoria de Projetos: período próprio, categoria ativa e caches
  // (worklogs do período + consolidado do Jira p/ execução do esforço).
  ctrl:{ de:'', ate:'', cat:'', tempo:null, tempoB:false, tempoErro:'', chaveT:'',
    proj:null, projB:false },
  // 📚 Central de Relatórios — catálogo × tipo de projeto (sigla da categoria)
  relcat:{ sigla:'', dim:'', busca:'' },
  // 📚 Relatório aberto pela Central ("Abrir no app"): {id, nome, vista, O, R, siglas}. Enquanto
  // ativo, as telas-alvo só oferecem projetos dos tipos onde o relatório é O ou R (ver 18).
  relCtx:null,
  // 📈 Métricas por tipo de projeto: período próprio, sigla/projeto ativos e caches
  // (worklogs do período, consolidado, fichas por projeto, planejamentos do time).
  metricas:{ sigla:'', proj:'', de:'', ate:'', tempo:null, tempoB:false, tempoErro:'', chaveT:'',
    cons:null, consB:false, fichas:{}, fichasB:{}, fichasErr:{}, plan:null, planB:false, planChave:'', planErro:'',
    abertos:null, abertosB:false, abertosErro:'' },   // tickets abertos (só para os ARQUIVADOS, que o consolidado esconde)
  // 💹 Rentabilidade de projetos: plano selecionado, edição/novo, rascunho do formulário,
  // célula a refocar após redesenhar e o realizado (worklogs) por chave projeto|de|até.
  rentab:{ sel:'', edit:false, novo:false, rasc:null, focoCel:'', tempo:{}, tempoB:{}, tempoErro:{} },
  // 🎫 Criação rápida por linguagem natural (home) — texto sobrevive aos re-renders
  qk:{ texto:'', criando:false },
  // ➗ Rateio — apontamento em massa: vários tickets, horas TOTAIS divididas por
  // igual / percentual / fatias (pesos) / manual; status trocado em conjunto.
  rateio:{ texto:'', tickets:[], info:{}, naoEnc:[], conferindo:false, confErro:'',
    total:'', data:'', coment:'', modo:'igual', pesos:{}, pcts:{}, mans:{},
    executando:false, resultados:null },
  // Tela "Planejar": criação de tickets em lote (form -> revisão -> resultado).
  // Modo épico: escolhe-se o épico e, opcionalmente, uma história dentro dele
  // (histórias vão direto no épico; sub-tarefas vão dentro da história escolhida).
  planejar:{ modo:'lote', projeto:'', tipoId:'', respId:'', epicoKey:'', historiaKey:'', texto:'',
    est:'', labels:'', venc:'', tpl:'',
    itens:null, resultados:null, criando:false, projetos:null, projetosErro:'',
    carregandoProjetos:false, epicosPorProj:{}, carregandoEpicos:false,
    // Modo 🌳 estrutura: colagem hierárquica (Épico → História → Task) + grade
    // pós-criação (edição em massa de responsável/data limite, estilo planilha).
    textoEstr:'', estru:null, tiposSlot:{}, grade:null, gSalvando:false },
  // Tela "Reclassificar": mover tickets de reunião do RDF para outro projeto.
  reuvinc:{ origem:'RDF', dados:null, carregando:false, erro:'', busca:'' },
  // 📁 Visão por Projetos: consolidado (todos) + ficha por projeto (direto do Jira).
  projetos:{ sel:'', aba:'geral', consolidado:null, fichas:{}, carregando:false, erro:'', ord:'total', dir:-1, incAberta:{} },
  // 📅 Marcos e Cronograma (R04): projeto, filtro/ordem/escala do Gantt, épico aberto no
  // modal e o cache das horas (12 meses) para a evolução por épico.
  cronograma:{ proj:'', fil:'todos', ord:'auto', escala:'auto', sel:'', fichaB:{}, fichaErr:{}, tempo:{}, tempoB:{}, tempoErro:{}, tempoChave:'' },
  // 📅 Agenda (Outlook → ticket de reunião): eventos da pessoa via Microsoft Graph.
  agenda:{ dados:null, carregando:false, erro:'', rdfTipo:null, usuarios:null, usuCarr:false },
  // 📋 Meu Planejamento: plano semanal por atividade (data + projeto + horas), sem tickets.
  // 📋 Meu Planejamento: plano semanal por atividade (Supabase) + comparativo,
  // aprovações e relatórios do gestor. rasc = itens em edição (autosave).
  planrel:{ aud:'gestor' },   // 📊 Relatórios do planejamento — visão por audiência (menu Planejamento)
  minhasemana:{ w:'', aba:'plano', meu:{}, meuB:{}, gestor:false, erro:'',
    rasc:null, rascW:'', sujo:false, salvando:false, form:null,
    real:{}, realB:{}, pend:null, pendB:0, rel:null, relB:0,
    relF:{de:'',ate:'',usuario:'',projeto:'',status:''} },
  acoes:{ venc:null, carregando:false, erro:'', mes:null, mesCarr:false, mesErro:'',
    // ⏱ Apontamento do time (card principal da Início): worklogs de segunda até
    // hoje, buscados à parte para não depender do período escolhido no topo.
    sem:null, semCarr:false, semErro:'', semTodos:false,
    // 🧭 Radar do dia: preferências (escopo × eventos × período) + caches próprios
    // (atividade janela 7d e worklogs 7d — independentes do período global).
    rad:null, radAtv:null, radAtvB:false, radAtvErro:'', radT:null, radTB:false },
  gestao:{ ate:'', dados:null, carregando:false, erro:'', sel:{}, busca:'', fProj:'', fResp:'', fStatus:'', vis:'tabela', preset:'', ord:'risco', semTrat:false,
    soKeys:null, origem:'',     // filtro por chaves vindo do 📈 Analytics (soKeys=[...], origem=nome da visão)
    agrupar:'' },               // '', resp, proj, tipo, status, prio, epico, venc, risco
  // Qualidade dos tickets (IA × boas práticas TI-04-006 do Notion)
  qualidade:{ dias:14, projeto:'', dados:null, carregando:false, erro:'' },
  reclass:{ origem:'RDF', dados:null, carregando:false, erro:'', sel:{}, alvo:'', busca:'',
    movendo:false, resultado:null, taskId:'' },
  // Ajuda & feedback (projetos para o destino dos tickets de dúvida/sugestão/bug).
  ajuda:{ projetos:null },
  // Central de Alertas (motor de alertas acionáveis + central de ação dos atrasados).
  alertas:{ dados:null, carregando:false, erro:'', sev:'',
    fResp:'', fProj:'', fPrio:'', fStatus:'', fTipo:'', fMinDias:0, soMeus:false, ord:'crit',
    sel:{},        // {chave:true} tickets marcados para ação em lote
    reprog:{},     // {chave:{de,para,motivo,por,quando}} reprogramações feitas nesta sessão
    semHoras:null, shCarregando:false },  // concluídos SEM horas apontadas (30d)
  // Administração (cadastro de contratos/clientes/valor-hora).
  admin:{ editId:null },
  // Ranking: aba ativa (apontamento clássico | engajamento & uso do Jira).
  ranking:{ aba:'apontamento', faixa:'semana', tempoPer:{}, carregandoPer:'' },
  // 🕵️ Auditoria de Tickets (apontamentos × validações TI-04-014, por pessoa).
  audit:{ accountId:'', dias:7, dados:null, carregando:false, erro:'' },
  // 📈 Analytics de governança (26 visões sobre abertos/concluídos/reabertos)
  analytics:{ dados:null, carregando:false, erro:'', fProj:'', fResp:'', x:5, dias:30, sel:'', busca:'' },
  // 💬 Menções: chamados em que EU fui marcado em comentários (responder dali mesmo)
  mencoes:{ dados:null, carregando:false, erro:'', dias:14, soPend:true, busca:'', verIgn:false },
  inbox:{ mencoes:null, carregando:false, carregou:false, erro:'' },
  // 📍 Meu dia (timetracking assistido: blocos do Mac + sugestões da IA).
  meudia:{ dados:null, carregando:false, erro:'' },
  // ⏳ Como estou gastando meu tempo?: pessoa, período próprio e caches (worklogs com
  // comentários por período; análise por IA por pessoa|período).
  meutempo:{ a:'', de:'', ate:'', chave:'', tempo:{}, tempoB:{}, tempoErro:{}, ia:{}, iaB:{}, iaErro:{} },
  // AMS: worklogs do ciclo selecionado (apuração trimestral/mensal), buscados à parte do período da tela.
  // ref = data de referência do ciclo em exibição (vazio = ciclo vigente/hoje); guarda também
  // pessoas/projetos/resumos do intervalo para drill-down por tipo e memória de apontamentos.
  ams:{ dados:null, pessoas:{}, projetos:{}, resumos:{}, range:'', carregando:false, erro:'', ref:'', sel:'' },
  planejamento:{ draft:null, aba:'editor', carregandoEpicos:false, _carregandoProjs:false, real:{ range:'', wl:null, carregando:false, erro:'' } },
  alocacao:{ rows:null, _cp:false, pessNovas:[], gran:'semana', visao:'pessoa', fSkill:'', fProj:'', gz:22, sim:[], find:{ ini:'', fim:'', h:20, skill:'', rot:'Novo projeto' }, real:{ range:'', wl:null, carregando:false, erro:'' }, semAberta:{} },
  // Resumo de atividades por IA (aba Resumo). Cache por período+filtros (chave).
  analiseIA:{ carregando:false, erro:'', geral:'', pessoas:null, chave:'', configurado:true },
  fluxo:{ dados:null, carregando:false, erro:'' } };

// ---- Configuração (meta de horas e ausências) — persistida no navegador ----
const CFG_KEY = 'dexterity_insights_cfg_v1';
function cfgDefaults(){ return { metaGlobalH:8, metasPessoa:{}, ausencias:[], feriadosExtra:{}, feriadosRemovidos:[], ocultos:[], contratos:[], planos:[], alocacoes:[], skills:{}, tratados:{}, auditoria:[], planTemplates:[], projTipos:{}, pessoasPlanejadas:[], custosPessoa:{}, alocTravas:{}, alocSemTravas:{}, planosSemana:{}, agendaTickets:{}, inboxAvisos:{}, qualidadeHist:[], teamsHora:'08:00', mencoesIgnoradas:{}, gestores:[],
  ctrl:{ custoPadrao:0, cats:{} },   // 🏦 Controladoria: custo/h padrão + blocos ativos por categoria
  relcat:{ m:{} },                    // 📚 Central de Relatórios: overrides da matriz O/R/– por relatório×sigla
  perfis:{},                          // 🎓 {accountId:{nivel:'junior'|'pleno'|'senior', depto}} — 📈 Métricas por tipo
  rentab:{ planos:[] },               // 💹 Rentabilidade: planos {duração, carga vendida, valor-hora, cenários pessoa × mês}
  vigencias:{},                       // 🪪 {accountId:{ini,fim}} — admissão/desligamento (relatórios respeitam)
  agendaAuto:{},                      // 🔁 {serie:{projeto,titulo,por,quando}} — reunião recorrente vira ticket sozinha
  scoreHist:{}, scoreInicio:'',       // 🏅 Scoreboard: fotos diárias + data em que o placar começa a valer
  teamsResumo:{ ativo:false, freq:'semanal', dia:5, hora:'17:00' },
  // 🎯 Prioridades do time — configuração do painel/reunião semanal.
  reuniao:{ facilitador:'Jéssica Cavalheiro', ultimaReuniao:'', ataUltimaUrl:'', prioridades:{},
    statusDecisao:['Proposta de Solução','Aguardando Aprovação do Cliente','Aguardando Validação','Em Validação','📆 Reunião Agendada'],
    mapaNatureza:{ DAMS:'operacao', DEF:'entrega', PEA:'entrega', PEF:'entrega', IPA:'produtos', IMI:'produtos', ITPR:'rotinas', ARQ:'outros' },
    notionPorProjeto:{}, envioTeams:{ ativo:false, dias:[1], hora:'09:00' } } }; }
function carregaCfg(){
  try{ const c=JSON.parse(localStorage.getItem(CFG_KEY)); if(c&&typeof c==='object')
    return Object.assign(cfgDefaults(), c); }catch(e){}
  return cfgDefaults();
}
// Carimbo da config: sobe a cada salvamento/adoção remota. Quem memoriza cálculos que
// dependem de metas/ausências/ocultos (ex.: calcTimesheet) usa isto como chave.
let _cfgStamp=0;
function salvaCfg(){ _cfgStamp++; try{ localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }catch(e){} salvaCfgRemota(); }
let cfg = carregaCfg();
let cfgShared = false;   // true quando a config vem/vai para o servidor (time)
// ---- Proteção contra perda de dados na config compartilhada ----
// O servidor versiona a config (rev). Toda gravação envia a rev de base; se outra
// pessoa/aba gravou depois, o servidor recusa e devolve o remoto — o cliente então
// ADOTA o remoto e re-aplica só as chaves que ESTA sessão alterou (merge), regravando.
// Sem conexão (ex.: janela de deploy), as mudanças ficam locais e sincronizam depois.
let _cfgRev=null;                                  // rev da última config remota adotada
let _cfgBase=JSON.parse(JSON.stringify(cfg));      // base p/ diff (o que esta sessão mudou)
let _cfgConectada=false, _cfgSujo=false, _cfgRetryT=null, _cfgAvisou=false;
function cfgAdotaRemoto(j){
  _cfgStamp++;
  const remoto=Object.assign(cfgDefaults(), (j&&j.data)||{});
  if(_cfgBase){ Object.keys(cfg).forEach(k=>{     // preserva o que esta sessão alterou
    try{ if(JSON.stringify(cfg[k])!==JSON.stringify(_cfgBase[k])) remoto[k]=cfg[k]; }catch(e){} }); }
  cfg=remoto; _cfgRev=(j&&j.rev)||null; _cfgBase=JSON.parse(JSON.stringify(cfg)); _cfgConectada=true;
}
function avisaCfgOffline(){ if(_cfgAvisou) return; _cfgAvisou=true;
  try{ toast('⚠ Sem conexão com a config compartilhada — suas mudanças estão salvas neste navegador e serão sincronizadas ao reconectar.','warn'); }catch(e){} }
function agendaCfgRetry(){ if(_cfgRetryT) return;
  _cfgRetryT=setTimeout(async ()=>{ _cfgRetryT=null;
    try{ const j=await fetch('/api/config').then(r=>r.json());
      if(j && j.configurado){ cfgShared=true; cfgAdotaRemoto(j);
        if(_cfgSujo) salvaCfgRemota();
        try{ render(); }catch(e){}
        return; }
    }catch(e){}
    agendaCfgRetry();
  }, 25000); }
// Carrega a config compartilhada do servidor (se configurado); senão, mantém a local.
async function carregaCfgRemota(){
  try{
    const j = await fetch('/api/config').then(r=>r.json());
    if(j && j.configurado){
      cfgShared = true;
      if(j.data && typeof j.data==='object' && Object.keys(j.data).length){
        // Adota o remoto; edições feitas antes da resposta chegar são re-aplicadas pelo diff.
        cfgAdotaRemoto(j);
      } else { _cfgConectada=true; _cfgRev=(j&&j.rev)||null; _cfgBase=JSON.parse(JSON.stringify(cfg)); }
    }
  }catch(e){ _cfgConectada=false; avisaCfgOffline(); agendaCfgRetry(); }
}
// Salva no servidor (quando compartilhado). Dispara junto com o salvar local.
// Exige credenciais do Jira (a gravação não é anônima); envia-as por cabeçalho.
function salvaCfgRemota(){
  if(!_cfgConectada){                     // sem conexão (boot falhou ou caiu depois)
    if(cfgShared || _cfgRetryT){ _cfgSujo=true; avisaCfgOffline(); agendaCfgRetry(); }
    return;
  }
  if(!cfgShared) return;
  const id=idApontar();
  const h={'Content-Type':'application/json'};
  if(id){ h['X-Jira-Email']=id.email; h['X-Jira-Token']=id.token; }
  const corpo=Object.assign({ __rev:_cfgRev||'' }, cfg);
  try{ fetch('/api/config', { method:'POST', headers:h, body:JSON.stringify(corpo) })
    .then(r=>r.json()).then(j=>{
      if(j && j.ok){ _cfgRev=j.rev||_cfgRev; _cfgBase=JSON.parse(JSON.stringify(cfg)); _cfgSujo=false; return; }
      if(j && j.conflito){
        // Outra pessoa/aba gravou depois de nós: adota o remoto, re-aplica o que
        // ESTA sessão mudou e tenta de novo com a rev nova (uma vez).
        cfgAdotaRemoto(j);
        const corpo2=Object.assign({ __rev:_cfgRev||'' }, cfg);
        fetch('/api/config', { method:'POST', headers:h, body:JSON.stringify(corpo2) })
          .then(r=>r.json()).then(j2=>{ if(j2 && j2.ok){ _cfgRev=j2.rev||_cfgRev; _cfgBase=JSON.parse(JSON.stringify(cfg)); _cfgSujo=false; } })
          .catch(()=>{ _cfgSujo=true; });
        try{ toast('↻ Config atualizada por outra pessoa — suas mudanças foram mescladas por cima.','warn'); }catch(e){}
        try{ render(); }catch(e){}
        return;
      }
      if(j && j.ok===false) console.warn('Config não salva no servidor:', j.erro||'');
    })
    .catch(()=>{ _cfgSujo=true; _cfgConectada=false; avisaCfgOffline(); agendaCfgRetry(); }); }catch(e){}
}
// Meta diária (em segundos) de uma pessoa: override individual ou meta global.
function metaSegDe(a){
  const h = (a && cfg.metasPessoa[a]!=null) ? cfg.metasPessoa[a] : cfg.metaGlobalH;
  return Math.max(0, Number(h)||0) * 3600;
}
// A pessoa está de ausência (férias etc.) nesse dia?
// 🪪 Vigência na empresa: {ini,fim} por pessoa (ambos opcionais). Fora da
// vigência a pessoa não é COBRADA (conta como ausência → meta/lacunas/score
// zerados) e some das visões de períodos em que não tem horas — o histórico
// (worklogs antigos) permanece intacto nos períodos em que estava ativa.
function vigenciaDe(a){ return (cfg.vigencias||{})[a]||null; }
function foraVigencia(a, dia){ const v=vigenciaDe(a); if(!v||!dia) return false;
  return !!((v.ini&&dia<v.ini)||(v.fim&&dia>v.fim)); }
function ehAusencia(a, dia){
  if(foraVigencia(a, dia)) return true;
  return (cfg.ausencias||[]).some(x => x.a===a && dia>=x.de && dia<=x.ate);
}
const dec = (seg) => (seg/3600).toFixed(2).replace('.',',');   // horas decimais p/ CSV (pt-BR)

const fmtH = (seg) => {
  const h = Math.floor(seg/3600), m = Math.round((seg%3600)/60);
  if (h && m) return `${h}h${String(m).padStart(2,'0')}`;
  if (h) return `${h}h`;
  return `${m}m`;
};
const pct = (n,d) => d ? Math.round(n/d*100) : 0;
const el = (h) => { const t=document.createElement('template'); t.innerHTML=h.trim(); return t.content.firstChild; };
const esc = (s) => String(s==null?'':s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
// Escape para VALOR de atributo (inclui aspas). O texto é lido de volta com getAttribute
// e renderizado via textContent, então não há injeção.
const escA = (s) => String(s==null?'':s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// ---- Feedback de ações de escrita: erros amigáveis, spinner em botão e toasts ----
// Traduz erros técnicos (rede, 401/403, 429, 5xx) em mensagens acionáveis para o time.
function humanizaErro(txt){
  const raw=String(txt==null?'':((txt&&txt.message)||txt));
  const s=raw.toLowerCase();
  if(/\b429\b|rate.?limit|too many|limite de (taxa|requisi)|muitas requisi/.test(s))
    return 'Muitas solicitações em pouco tempo. Aguarde alguns segundos e tente de novo.';
  if(/\b401\b|\b403\b|unauthor|forbidden|token|credenc|permiss|expir|inv[áa]lid/.test(s))
    return 'Sua sessão do Jira pode ter expirado. Reabra “identifique-se” (aba Apontar) e gere um novo token de API.';
  if(/failed to fetch|networkerror|network error|load failed|offline|sem conex|timeout|timed out|aborted/.test(s))
    return 'Falha de conexão. Verifique sua internet e tente novamente.';
  if(/\b5\d\d\b|server error|internal|indispon|unavailable|bad gateway|gateway timeout/.test(s))
    return 'O serviço está instável no momento. Tente novamente em instantes.';
  return raw.trim() || 'Algo deu errado. Tente novamente.';
}
// Liga/desliga o estado "ocupado" (disabled + spinner) de um botão.
function ocupado(btn, on){ if(!btn) return; btn.disabled=!!on; btn.classList.toggle('is-busy', !!on); }
// Toast efêmero no canto inferior. tipo: 'ok' | 'err' | 'warn' | 'info'.
let _toastCont=null;
function toast(msg, tipo){
  if(!_toastCont){ _toastCont=document.createElement('div'); _toastCont.className='toasts'; document.body.appendChild(_toastCont); }
  const ic={ok:'✓',err:'⚠',warn:'⚠'}[tipo]||'ℹ';
  const t=document.createElement('div'); t.className='toast '+(tipo||'info');
  t.setAttribute('role','status'); t.setAttribute('aria-live','polite');
  t.innerHTML=`<span class="toast-ic">${ic}</span><span>${esc(msg)}</span>`;
  _toastCont.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  const dur=tipo==='err'?6500:(tipo==='warn'?5000:3500);
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>{ if(t.parentNode) t.remove(); },280); }, dur);
}
// Skeleton de carregamento que imita o painel (KPIs + tabela) com shimmer.
function skeletonPainel(){
  const kpis=Array.from({length:4},()=>`<div class="skel-kpi"><div class="skel skel-l"></div><div class="skel skel-v"></div></div>`).join('');
  const linhas=Array.from({length:6},()=>`<div class="skel-row"><div class="skel" style="width:32%"></div><div class="skel" style="width:14%"></div><div class="skel" style="width:14%"></div><div class="skel" style="width:18%"></div><div class="skel" style="width:10%"></div></div>`).join('');
  return `<div class="skel-wrap" aria-busy="true" aria-label="Carregando…"><div class="skel-kpis">${kpis}</div><div class="skel-card"><div class="skel skel-h"></div>${linhas}</div></div>`;
}

// ---- Tooltip flutuante moderno (segue o cursor) ----
// Qualquer elemento com data-tip mostra o tooltip; data-tip2 é a 2ª linha; data-tipk a 3ª (dica).
let _tipEl=null;
function _tip(){ if(!_tipEl){ _tipEl=document.createElement('div'); _tipEl.className='tip'; document.body.appendChild(_tipEl); } return _tipEl; }
function mostraTip(t1,t2,t3,x,y){
  const t=_tip(); t.innerHTML='';
  const a=document.createElement('div'); a.className='tip-t'; a.textContent=t1; t.appendChild(a);
  if(t2){ const b=document.createElement('div'); b.className='tip-s'; b.textContent=t2; t.appendChild(b); }
  if(t3){ const c=document.createElement('div'); c.className='tip-k'; c.textContent=t3; t.appendChild(c); }
  t.style.display='block'; posicionaTip(x,y);
}
function posicionaTip(x,y){ const t=_tip(); const w=t.offsetWidth, h=t.offsetHeight, m=14;
  let nx=x+m, ny=y+m;
  if(nx+w+8>window.innerWidth) nx=x-w-m; if(nx<6) nx=6;
  if(ny+h+8>window.innerHeight) ny=y-h-m; if(ny<6) ny=6;
  t.style.left=nx+'px'; t.style.top=ny+'px';
}
function escondeTip(){ if(_tipEl) _tipEl.style.display='none'; }
document.addEventListener('mousemove', (e)=>{
  const t=e.target.closest && e.target.closest('[data-tip]');
  if(t){ mostraTip(t.getAttribute('data-tip'), t.getAttribute('data-tip2'), t.getAttribute('data-tipk'), e.clientX, e.clientY); }
  else escondeTip();
}, {passive:true});
document.addEventListener('scroll', escondeTip, {passive:true, capture:true});

// ---- Datas (fuso America/Sao_Paulo no cliente, aritmética em UTC nas strings) ----
const hojeSP = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
function proxDia(s){ const [y,m,d]=s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10); }
function listaDias(a,b){ if(!a||!b) return []; const out=[]; let d=a, g=0; while(d<=b && g++<400){ out.push(d); d=proxDia(d); } return out; }
function diaSemana(s){ const [y,m,d]=s.split('-').map(Number); return new Date(Date.UTC(y,m-1,d,12)).getUTCDay(); } // 0=dom … 6=sáb
const ehUtil = (s) => { const w=diaSemana(s); return w>=1 && w<=5; };
// Chave da semana (segunda-feira AAAA-MM-DD) de uma data — usada para normalizar
// "horas extras por semana" num período qualquer (mês, ano…).
function semChave(s){ const [y,m,d]=s.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d,12));
  const wd=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-wd); return dt.toISOString().slice(0,10); }

// ---- Feriados nacionais brasileiros (calculados — sem depender de internet) ----
// Inclui os fixos + os móveis (Carnaval, Sexta-feira Santa, Corpus Christi) via Páscoa
// (algoritmo de Meeus/Butcher). Ajustável em Metas: dá p/ adicionar feriados
// municipais/estaduais (feriadosExtra) e remover os facultativos (feriadosRemovidos).
function _pascoa(ano){
  const a=ano%19, b=Math.floor(ano/100), c=ano%100, d=Math.floor(b/4), e=b%4,
    f=Math.floor((b+8)/25), g=Math.floor((b-f+1)/3), h=(19*a+b-d-g+15)%30,
    i=Math.floor(c/4), k=c%4, l=(32+2*e+2*i-h-k)%7, m=Math.floor((a+11*h+22*l)/451),
    mes=Math.floor((h+l-7*m+114)/31), dia=((h+l-7*m+114)%31)+1;
  return new Date(Date.UTC(ano, mes-1, dia));
}
function _isoUTC(d){ return d.toISOString().slice(0,10); }
function _addDataDias(d,n){ const x=new Date(d); x.setUTCDate(x.getUTCDate()+n); return x; }
function feriadosNacionais(ano){
  const p=_pascoa(ano); const f={};
  f[`${ano}-01-01`]='Confraternização Universal';
  f[_isoUTC(_addDataDias(p,-48))]='Carnaval';
  f[_isoUTC(_addDataDias(p,-47))]='Carnaval';
  f[_isoUTC(_addDataDias(p,-2))]='Sexta-feira Santa';
  f[`${ano}-04-21`]='Tiradentes';
  f[`${ano}-05-01`]='Dia do Trabalho';
  f[_isoUTC(_addDataDias(p,60))]='Corpus Christi';
  f[`${ano}-09-07`]='Independência';
  f[`${ano}-10-12`]='Nossa Senhora Aparecida';
  f[`${ano}-11-02`]='Finados';
  f[`${ano}-11-15`]='Proclamação da República';
  if(ano>=2024) f[`${ano}-11-20`]='Consciência Negra';
  f[`${ano}-12-25`]='Natal';
  return f;   // { 'YYYY-MM-DD': nome }
}
const _ferCache={};
function feriadosDoAno(ano){ return _ferCache[ano] || (_ferCache[ano]=feriadosNacionais(ano)); }
// Nome do feriado nesse dia (considerando extras/removidos da config); '' se não for.
function nomeFeriado(dia){
  if((cfg.feriadosRemovidos||[]).includes(dia)) return '';
  const ex=cfg.feriadosExtra||{}; if(ex[dia]) return ex[dia];
  return feriadosDoAno(+dia.slice(0,4))[dia] || '';
}
const ehFeriado = (dia) => !!nomeFeriado(dia);

// Pessoas ativas do Jira não dependem do período: UMA busca por sessão, compartilhada por
// todas as telas (Agenda, Apontar, filtros). `forca` rebusca; resposta ruim não fica guardada.
let _usuariosP=null;
function usuariosP(forca){
  if(forca||!_usuariosP){
    _usuariosP=fetch('/api/usuarios').then(r=>r.json()).then(j=>{ if(!j||!j.pessoas) _usuariosP=null; return j||{}; })
      .catch(()=>{ _usuariosP=null; return {}; });
  }
  return _usuariosP;
}
// As três leituras do período, em paralelo. Separado de carrega() para o boot poder
// dispará-las ANTES de a config compartilhada responder (ver 30-eventos-boot.js).
function buscaDados(periodo, forca){
  const q = forca ? '&nocache=1' : '';
  return Promise.all([
    fetch(`/api/tempo?janela=${periodo}${q}`).then(r=>r.json()).catch(e=>({erro:String(e.message||e)})),
    fetch(`/api/atividade?janela=${periodo}${q}`).then(r=>r.json()).catch(e=>({erro:String(e.message||e)})),
    usuariosP(!!forca),
  ]);
}
let _prefetch=null;   // {periodo, p}: leitura já em voo, iniciada no boot
function prefetchDados(periodo){ _prefetch={ periodo, p: buscaDados(periodo, false) }; }
// `forca=true` ignora o cache do navegador E o do servidor (nocache=1): os dados
// voltam direto do Clockwork/Jira — é o "Forçar atualização" do Timesheet.
async function carrega(periodo, forca){
  if (!forca && estado.cache[periodo]) { const c=estado.cache[periodo];
    estado.tempo=c.tempo; estado.atividade=c.atividade; estado.usuarios=c.usuarios||{}; estado.avisoAtiv=c.avisoAtiv||''; return; }
  let pend=null;
  if(!forca && _prefetch && _prefetch.periodo===periodo) pend=_prefetch.p;   // aproveita o que o boot já pediu
  _prefetch=null;
  let [t,a,u] = await (pend||buscaDados(periodo, forca));
  if (t.erro) throw new Error('Tempo (Clockwork): '+t.erro);   // tempo é essencial
  let aviso='';
  if (a.erro){                                                // atividade indisponível (ex.: janela muito grande): segue só com horas
    aviso = 'Atividade do Jira indisponível ('+a.erro+'). Mostrando apenas as horas (Clockwork).';
    a = { meta:{ ...(t.meta||{}), concluidasPorProjeto:{}, concluidasTotal:0 }, pessoas:{}, projetos:{}, resumos:{}, eventos:[] };
  }
  const usuarios = (u && u.pessoas && typeof u.pessoas==='object') ? u.pessoas : {};
  const ocultos=new Set((cfg.ocultos||[]).map(o=>o.a));
  Object.keys(usuarios).forEach(id=>{ if(RE_EXCLUIR.test((usuarios[id]&&usuarios[id].nome)||'') || ocultos.has(id)) delete usuarios[id]; });
  removeUsuariosTecnicos(t, a);
  aplicaVigenciaUsuarios(usuarios, t, a);
  estado.tempo=t; estado.atividade=a; estado.usuarios=usuarios; estado.avisoAtiv=aviso;
  estado.apontar.extraPorDia={};   // dados frescos do Clockwork já incluem o que foi apontado: zera o acumulador otimista
  estado.apontar.extraLogs=[];
  estado.cache[periodo]={tempo:t,atividade:a,usuarios,avisoAtiv:aviso};
}

// Remove apps/bots do Jira (Automation, BigGantt…) dos dados antes de usar,
// para que não apareçam em nenhuma visão nem no filtro de Pessoa.
// Invalida o que o navegador guardou das leituras (chamada depois de apontar, transicionar,
// criar…). Também zera as faixas do Ranking (semana/mês/ano), que antes ficavam congeladas
// pela sessão inteira mesmo depois de novos apontamentos.
function invalidaCacheDados(){ estado.cache={}; if(estado.ranking) estado.ranking.tempoPer={}; }
function removeUsuariosTecnicos(t, a){
  const raw = Object.assign({}, (a&&a.pessoas)||{}, (t&&t.pessoas)||{});
  const bots = new Set(Object.keys(raw).filter(id => RE_EXCLUIR.test((raw[id]&&raw[id].nome)||'')));
  (cfg.ocultos||[]).forEach(o=>bots.add(o.a));   // usuários externos marcados como "ocultar"
  if(bots.size){
    if(t){ if(t.worklogs) t.worklogs = t.worklogs.filter(w=>!bots.has(w.a)); if(t.pessoas) bots.forEach(id=>delete t.pessoas[id]); }
    if(a){ if(a.eventos)  a.eventos  = a.eventos.filter(e=>!bots.has(e.a));  if(a.pessoas) bots.forEach(id=>delete a.pessoas[id]); }
  }
  // 🪪 Vigência: quem está TOTALMENTE fora da vigência no período do payload e
  // não tem nenhuma hora/evento nele sai das listas de pessoas (worklogs ficam).
  const vigs=cfg.vigencias||{};
  const idsV=Object.keys(vigs);
  if(idsV.length){
    const de=(t&&t.meta&&t.meta.startDate)||(a&&a.meta&&a.meta.startDate)||'';
    const ate=(t&&t.meta&&t.meta.endDate)||(a&&a.meta&&a.meta.endDate)||'';
    const comDados=new Set();
    if(t&&t.worklogs) t.worklogs.forEach(w=>comDados.add(w.a));
    if(a&&a.eventos)  a.eventos.forEach(e2=>comDados.add(e2.a));
    idsV.forEach(id2=>{ const v=vigs[id2]; if(!v||comDados.has(id2)) return;
      const fora=(v.fim&&de&&de>v.fim)||(v.ini&&ate&&ate<v.ini);
      if(fora){ if(t&&t.pessoas) delete t.pessoas[id2]; if(a&&a.pessoas) delete a.pessoas[id2]; } });
  }
}
// Mesmo critério da vigência aplicado à lista de usuários do Jira (seletores,
// scoreboard, convites): fora do período do payload e sem horas → não aparece.
function aplicaVigenciaUsuarios(usuarios, t, a){
  const vigs=cfg.vigencias||{};
  const de=(t&&t.meta&&t.meta.startDate)||'';
  const ate=(t&&t.meta&&t.meta.endDate)||'';
  const comDados=new Set();
  if(t&&t.worklogs) t.worklogs.forEach(w=>comDados.add(w.a));
  if(a&&a.eventos)  a.eventos.forEach(e2=>comDados.add(e2.a));
  Object.keys(vigs).forEach(id2=>{ const v=vigs[id2]; if(!v||comDados.has(id2)) return;
    const fora=(v.fim&&de&&de>v.fim)||(v.ini&&ate&&ate<v.ini);
    if(fora) delete usuarios[id2]; });
}

function projetosUnidos(){
  const m = {};
  Object.assign(m, (estado.atividade&&estado.atividade.projetos)||{}, (estado.tempo&&estado.tempo.projetos)||{});
  return m;
}
function pessoasUnidas(){
  return Object.assign({}, estado.usuarios||{}, (estado.atividade&&estado.atividade.pessoas)||{}, (estado.tempo&&estado.tempo.pessoas)||{});
}
// Títulos (summary) das issues, vindos do Jira (atividade) e do Clockwork (tempo).
function resumosUnidos(){
  return Object.assign({}, (estado.atividade&&estado.atividade.resumos)||{}, (estado.tempo&&estado.tempo.resumos)||{});
}

function preencheFiltros(){
  const projs = projetosUnidos();
  const cats = new Set(), tipos = new Set();
  Object.values(projs).forEach(p=>cats.add(p.categoria||'Sem categoria'));
  (estado.atividade.eventos||[]).forEach(e=>tipos.add(e.t));
  (estado.tempo.worklogs||[]).forEach(w=>tipos.add(w.t));
  const opt = (arr, label) => `<option value="">${label}</option>` +
    [...arr].filter(Boolean).sort((x,y)=>x.localeCompare(y,'pt')).map(v=>`<option>${esc(v)}</option>`).join('');
  preserva('f-categoria', opt(cats,'Todas as categorias'));
  // 📚 Com um relatório da Central aberto, só os projetos dos tipos onde ele é O/R.
  const okRel=(k)=>!estado.relCtx||relProjOk(k,(projs[k]||{}).categoria);
  preserva('f-projeto', `<option value="">Todos os projetos</option>` +
    Object.keys(projs).filter(okRel).sort((a,b)=>projNome(a).localeCompare(projNome(b),'pt')).map(k=>`<option value="${esc(k)}">${esc(projNome(k))}${esc(projCod(k))}</option>`).join(''));
  preserva('f-tipo', opt(tipos,'Todos os tipos'));

  const pessoas = Object.entries(pessoasUnidas())
    .map(([a,o])=>[a,(o&&o.nome)||a])
    .sort((x,y)=>x[1].localeCompare(y[1],'pt'));
  preserva('f-pessoa', `<option value="">Todas as pessoas</option>` +
    pessoas.map(([a,n])=>`<option value="${esc(a)}">${esc(n)}</option>`).join(''));
}
function preserva(id, html){ const s=document.getElementById(id); const v=s.value; s.innerHTML=html; if([...s.options].some(o=>o.value===v)) s.value=v; }

function filtros(){
  const f={
    pessoa: document.getElementById('f-pessoa').value,
    categoria: document.getElementById('f-categoria').value,
    projeto: document.getElementById('f-projeto').value,
    tipo: document.getElementById('f-tipo').value,
  };
  // 📚 Relatório aberto pela Central: só projetos dos tipos onde ele é O/R (memo por projeto —
  // passa() roda por worklog/evento). Entra na chave dos caches que serializam filtros().
  const c=estado.relCtx;
  if(c){ const memo={}; f.rel=c.id; f.relOk=(p,projs)=>{ if(memo[p]==null) memo[p]=relProjOk(p,(projs[p]||{}).categoria); return memo[p]; }; }
  return f;
}
function passa(p, t, projs, f){
  if (f.tipo && t!==f.tipo) return false;
  if (f.projeto && p!==f.projeto) return false;
  if (f.categoria){ const c=(projs[p]&&projs[p].categoria)||'Sem categoria'; if(c!==f.categoria) return false; }
  if (f.relOk && !f.relOk(p,projs)) return false;
  return true;
}

function agrega(){
  const f = filtros();
  const projs = projetosUnidos();
  const pessoasNome = pessoasUnidas();

  // ---- Tempo (Clockwork) ----
  const seg = {};                 // accountId -> segundos
  const segFat = {};              // accountId -> segundos faturáveis
  let segTot=0, segFatTot=0;
  const porCategoria={}, porProjeto={}, porDia={};
  (estado.tempo.worklogs||[]).forEach(w=>{
    if(!passa(w.p,w.t,projs,f)) return;
    if(f.pessoa && w.a!==f.pessoa) return;
    seg[w.a]=(seg[w.a]||0)+w.s; segTot+=w.s;
    if(w.f){ segFat[w.a]=(segFat[w.a]||0)+w.s; segFatTot+=w.s; }
    const cat=(projs[w.p]&&projs[w.p].categoria)||'Sem categoria';
    porCategoria[cat]=(porCategoria[cat]||0)+w.s;
    porProjeto[w.p]=(porProjeto[w.p]||0)+w.s;
    const dia=(w.d||'').slice(0,10); if(dia) porDia[dia]=(porDia[dia]||0)+w.s;
  });

  // ---- Atividade (Jira) ----
  const tickets={}, alter={}, trans={}, coment={}, criado={};
  const tocadasGlobais=new Set(); let transTot=0;
  const tipoIssues={}; // tipo -> set de issues
  (estado.atividade.eventos||[]).forEach(e=>{
    if(!passa(e.p,e.t,projs,f)) return;
    if(f.pessoa && e.a!==f.pessoa) return;
    if(e.e==='alteracao'){ alter[e.a]=(alter[e.a]||0)+1; (tickets[e.a]=tickets[e.a]||new Set()).add(e.k); tocadasGlobais.add(e.k); }
    if(e.e==='transicao'){ trans[e.a]=(trans[e.a]||0)+1; transTot++; (tickets[e.a]=tickets[e.a]||new Set()).add(e.k); tocadasGlobais.add(e.k); }
    if(e.e==='comentario'){ coment[e.a]=(coment[e.a]||0)+1; (tickets[e.a]=tickets[e.a]||new Set()).add(e.k); tocadasGlobais.add(e.k); }
    if(e.e==='criado'){ criado[e.a]=(criado[e.a]||0)+1; (tickets[e.a]=tickets[e.a]||new Set()).add(e.k); tocadasGlobais.add(e.k); }
    (tipoIssues[e.t]=tipoIssues[e.t]||new Set()).add(e.k);
  });

  // ---- Concluídas (agregado; sem atribuição por pessoa) ----
  const concPorProj = estado.atividade.meta.concluidasPorProjeto||{};
  let concl=0;
  Object.keys(concPorProj).forEach(k=>{
    if(f.projeto && k!==f.projeto) return;
    if(f.categoria){ const c=(projs[k]&&projs[k].categoria)||'Sem categoria'; if(c!==f.categoria) return; }
    if(f.relOk && !f.relOk(k,projs)) return;
    concl+=concPorProj[k];
  });
  if(f.pessoa) concl=null;   // não há atribuição individual de concluídas

  // ---- Tabela por pessoa ----
  const ids=new Set([...Object.keys(seg),...Object.keys(tickets)]);
  const pessoas=[...ids].map(a=>({
    a, nome:(pessoasNome[a]&&pessoasNome[a].nome)||a,
    seg:seg[a]||0, segFat:segFat[a]||0,
    tickets:(tickets[a]?tickets[a].size:0),
    alter:alter[a]||0, trans:trans[a]||0, coment:coment[a]||0, criado:criado[a]||0,
  })).sort((x,y)=> (y.seg-x.seg) || (y.tickets-x.tickets));

  return {
    f, projs, pessoas,
    kpi:{ segTot, fatPct:pct(segFatTot,segTot), tocadas:tocadasGlobais.size, transTot, concl },
    fat:{ fatura:segFatTot, nao:segTot-segFatTot },
    porCategoria, porProjeto, porDia,
    porTipo:Object.fromEntries(Object.entries(tipoIssues).map(([k,v])=>[k,v.size])),
  };
}

// labelFn(k) define o texto VISÍVEL (default = a própria chave); titleFn(k) o tooltip.
// Mostrar o nome no próprio rótulo evita depender do "passar o mouse" (que não existe
// em telas de toque, como iPad/celular).
// opts (opcional): { tip2Fn(k,v), drill(k)->{type,key} }. Mostra tooltip flutuante e,
// quando há drill, deixa a linha clicável (cursor + realce) para abrir o detalhe.
function barlist(obj, fmt, cor, limite, titleFn, labelFn, opts){
  opts=opts||{};
  const ent=Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,limite||8);
  const max=Math.max(1,...ent.map(e=>e[1]));
  if(!ent.length) return '<div class="estado">Sem dados para os filtros atuais.</div>';
  return `<div class="barlist anima">`+ent.map(([k,v])=>{
    const tit=titleFn?titleFn(k):k; const lbl=labelFn?labelFn(k):k;
    const t2=opts.tip2Fn?opts.tip2Fn(k,v):fmt(v);
    const dr=opts.drill?opts.drill(k):null;
    const da=dr?` data-drill="${escA(dr.type)}" data-key="${escA(dr.key)}" data-tipk="clique para detalhar"`:'';
    return `
    <div class="barrow"${da} data-tip="${escA(tit)}" data-tip2="${escA(t2)}">
      <div class="nome">${esc(lbl)}</div>
      <div class="track"><div class="fill" style="width:${Math.max(2,v/max*100)}%;background:${cor}"></div></div>
      <div class="val">${fmt(v)}</div></div>`; }).join('')+`</div>`;
}

// ---- Chrome por vista: o que cada tela mostra no topo (mecanismo central, declarativo) ----
// per = seletor de Período · fil = filtros pessoa/categoria/projeto/tipo · exp = Exportar CSV/PDF.
// Telas operacionais/formulário (apontar, planejar, gestão…) têm controles próprios: nada disso aparece.
const VCHROME={
  visao:{per:1,exp:1}, acoes:{}, resumo:{per:1,fil:1,exp:1}, timesheet:{per:1,fil:1,exp:1},
  ranking:{per:1,fil:1,exp:1}, tickets:{per:1,fil:1,exp:1}, qualidade:{}, receita:{per:1,exp:1}, controladoria:{},
  ams:{exp:1}, alocacao:{}, planejamento:{}, apontar:{}, rateio:{}, planejar:{}, ondecrio:{}, reclassificar:{},
  reuvinc:{}, gestao:{}, alertas:{}, admin:{}, config:{}, audit:{}, meudia:{}, analytics:{}, relatorios:{}, metricas:{exp:1}, rentab:{}, meutempo:{}, cronograma:{exp:1}, mencoes:{}, inbox:{}, projetos:{}, agenda:{}, minhasemana:{}, prioridades:{}, roadmap:{}, planrel:{} };
function aplicaChrome(){
  const c=VCHROME[estado.vista]||{per:1,fil:1,exp:1};
  const mostra=(sel,on)=>{ const e=document.querySelector(sel); if(e) e.style.display=on?'':'none'; };
  mostra('#hdr-periodo', !!c.per);
  mostra('.filtros', !!c.fil);
  mostra('#grp-exportar', !!c.exp);
  mostra('#btn-novidades', !!(c.per||c.exp));   // novidades só nas telas de análise
  try{ atualizaBotaoGuia(); }catch(e){}          // 🧭 guia da tela (botão flutuante)
}

// ---- Datas digitadas/coladas (dd/mm, dd/mm/aa, ISO, serial do Excel) — usadas pelos campos de data ----
// ---- Copiar/colar datas (estilo Monday/Asana) — vale em QUALQUER campo de data ----
// Ctrl/Cmd+C num campo de data copia a data; Ctrl/Cmd+V em outro cola e dispara o
// mesmo fluxo de um ajuste manual (salva na hora, ex.: board de alocação).
// Aceita 23/08/2026, 23/08/26, 23/08 (ano atual), 2026-08-23 e datas do Excel.
function dataDeTexto(txt){
  const s=String(txt||'').trim();
  let m=s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if(m) return validaIso(`${m[1]}-${m[2]}-${m[3]}`);
  m=s.match(/(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/);
  if(!m) return '';
  let d=+m[1], mo=+m[2];
  if(mo>12 && d<=12){ const t=d; d=mo; mo=t; }        // veio como mm/dd (Excel en-US)
  let ano=m[3] ? (m[3].length===2 ? 2000+ +m[3] : +m[3]) : +hojeSP().slice(0,4);
  if(d<1||d>31||mo<1||mo>12||ano<1990||ano>2100) return '';
  return validaIso(`${ano}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
}
// Garante que a data existe de verdade (31/02 etc. viram '').
function validaIso(iso){
  try{ return new Date(iso+'T00:00:00Z').toISOString().slice(0,10)===iso ? iso : ''; }catch(e){ return ''; }
}
const dataBR=(iso)=> iso ? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : '';
// Todas as datas reconhecidas num texto (para colar um PERÍODO inteiro de uma vez).
function datasDeTexto(txt){
  const out=[]; const re=/\d{4}-\d{2}-\d{2}|\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?/g;
  const s=String(txt||''); let m;
  while((m=re.exec(s)) && out.length<4){ const iso=dataDeTexto(m[0]); if(iso) out.push(iso); }
  return out;
}

// ---- Helpers que nasceram na Alocação e são usados por várias telas (gestores, custo/h,
// semana ISO, formato de horas, preferências da Alocação) — a tela em si está arquivada. ----
// ---- Pessoas planejadas (ainda não contratadas): planeje a vaga antes de contratar ----
function ppLista(){ if(!Array.isArray(cfg.pessoasPlanejadas)) cfg.pessoasPlanejadas=[]; return cfg.pessoasPlanejadas; }
function ppDe(a){ return String(a||'').startsWith('plan_') ? ppLista().find(p=>p.id===a) : null; }
// Gestores/aprovadores por CONFIGURAÇÃO (cfg.gestores: accountIds ou e-mails,
// editável em ⚙️ Configurações). Sem lista configurada, cai no aprovador legado
// (nome/e-mail contendo "diego") para não travar a operação atual.
function souAprovador(){ const id=idApontar(); if(!id) return false;
  const gs=(cfg.gestores||[]).map(x=>String((x&&(x.a||x.email))||x||'').trim().toLowerCase()).filter(Boolean);
  if(gs.length) return gs.includes(String(id.accountId||'').toLowerCase())||gs.includes(String(id.email||'').toLowerCase());
  return /diego/i.test((id.nome||'')+' '+(id.email||'')); }
// Custo/hora da pessoa: vaga usa o custo previsto do cadastro; pessoa real usa
// cfg.custosPessoa (manual ou importado do Odoo). 0 = sem custo cadastrado.
function alocCustoH(a){ const pp=ppDe(a); if(pp) return Math.max(0,Number(pp.custoH)||0);
  return Math.max(0,Number((cfg.custosPessoa||{})[a])||0); }
function alocH(h){ return (Math.round((h||0)*10)/10).toLocaleString('pt-BR')+'h'; }
// ---- 📆 Semanas: planejado TRAVADO por semana × realizado (nº da semana do ano) ----
// Semana ISO 8601 (segunda a domingo; a quinta-feira define o ano) — ex.: S31/2026.
function isoSemana(w){
  const dt=new Date(w+'T12:00:00-03:00');
  const qui=new Date(dt); qui.setUTCDate(dt.getUTCDate()+3-((dt.getUTCDay()+6)%7));
  const ano=qui.getUTCFullYear();
  const jan4=new Date(Date.UTC(ano,0,4,12));
  const seg1=new Date(jan4); seg1.setUTCDate(jan4.getUTCDate()-((jan4.getUTCDay()+6)%7));
  return { ano, num: Math.floor((qui-seg1)/(7*86400000))+1 };
}
function semTravaKey(w){ const s=isoSemana(w); return `${s.ano}-W${String(s.num).padStart(2,'0')}`; }
// Lembra visão/granularidade/zoom da Alocação entre sessões (só no navegador, não é config compartilhada).
const ALOC_UI_KEY='dexterity_aloc_ui_v1';
function alocUISave(){ try{ localStorage.setItem(ALOC_UI_KEY, JSON.stringify({ visao:estado.alocacao.visao, gran:estado.alocacao.gran, gz:estado.alocacao.gz, ordB:estado.alocacao.ordB })); }catch(e){} }
