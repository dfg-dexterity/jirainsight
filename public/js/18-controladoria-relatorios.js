// Jira Insights · 18 · 🏦 CONTROLADORIA por categoria de projeto e 📚 CENTRAL DE RELATÓRIOS (matriz relatório × tipo).
// ===========================================================================
// 🏦 CONTROLADORIA DE PROJETOS — visão financeira por CATEGORIA de projeto
// (AMS, Tarefas Avulsas, …): margem, custo por pessoa, custo de gestão, tipo de
// esforço, execução do esforço e evolução mensal comparável — tudo com drill
// até os tickets (com ações) e textos explícitos para quem não vive de métrica.
// Fontes: worklogs do período (/api/tempo — traz tipo da issue, faturável e a
// categoria do projeto), custo/h por pessoa (Alocação → cfg.custosPessoa, com
// custo padrão de fallback), contratos do Admin (valor-hora) e o consolidado
// do Jira (/api/projetos?visao=1 — estimado × gasto). Os blocos exibidos são
// CONFIGURÁVEIS por categoria (cfg.ctrl, compartilhado; só gestores editam).
// ===========================================================================
const CT_BLOCOS=[
  ['kpis','💰 KPIs financeiros'],
  ['proj','📁 Projetos — margem & execução'],
  ['custopes','👥 Custo por pessoa & custo de gestão'],
  ['esforco','🧩 Tipo de esforço'],
  ['evolucao','📈 Evolução no tempo'],
  ['exec','⏳ Execução do esforço (Jira)'],
];
function ctBlocosDe(cat){
  const c=(((cfg.ctrl||{}).cats)||{})[cat];
  if(!c) return Object.fromEntries(CT_BLOCOS.map(([k])=>[k,1]));   // sem config: tudo ligado
  return c;
}
function ctCustoDe(a){
  const ch=ctCustoBase(a);
  return ch>0?ch:Math.max(0,Number((cfg.ctrl||{}).custoPadrao)||0);
}
// Quem é GESTOR (cfg.gestores aceita accountId OU e-mail) — as horas dessas
// pessoas compõem o "custo de gestão" da categoria.
function ctGestoresSet(pessoas){
  const gs=(cfg.gestores||[]).map(x=>String((x&&(x.a||x.email))||x||'').trim().toLowerCase()).filter(Boolean);
  const set=new Set();
  Object.entries(pessoas||{}).forEach(([a,p])=>{
    if(gs.includes(String(a).toLowerCase())||(p&&p.email&&gs.includes(String(p.email).toLowerCase()))) set.add(a);
  });
  gs.forEach(g=>{ if(/^[\w:-]{10,}$/.test(g)) set.add(g); });
  return set;
}
// Contrato do projeto — se houver mais de um, prefere o que TEM valor-hora.
function ctContratoDe(p){
  const cs=(cfg.contratos||[]).filter(c=>c&&(c.projetos||[]).includes(p));
  return cs.find(c=>Number(c.valorHora)>0)||cs[0]||null;
}
// Custo/h PRÓPRIO da pessoa (sem o fallback) — para saber quem está no padrão.
function ctCustoBase(a){
  return (typeof alocCustoH==='function')?alocCustoH(a):Math.max(0,Number((cfg.custosPessoa||{})[a])||0);
}
function ctPrimeiroDiaMes(off){ const h=hojeSP(); const y=+h.slice(0,4), m=+h.slice(5,7)-1+(off||0);
  const d=new Date(Date.UTC(y,m,1)); return d.toISOString().slice(0,10); }
// Busca os worklogs do período (cache pela chave de/até) + consolidado do Jira.
// Em erro, NÃO refaz sozinho (o botão "Tentar de novo" limpa o erro e refaz) —
// senão o render re-dispararia o fetch em loop contra a API.
function ctGarante(){
  const ct=estado.ctrl;
  if(!ct.de){ ct.de=ctPrimeiroDiaMes(-2); ct.ate=hojeSP(); }   // padrão: últimos 3 meses (comparável)
  if(ct.ate<ct.de){ const x=ct.de; ct.de=ct.ate; ct.ate=x; }   // intervalo invertido: corrige
  if(ct.de<voltaDias(ct.ate,365)) ct.de=voltaDias(ct.ate,365); // teto de 1 ano (limite da API)
  const chave=ct.de+'|'+ct.ate;
  if(ct.chaveT!==chave&&!ct.tempoB&&!ct.tempoErro){
    ct.tempoB=true;
    fetch(`/api/tempo?desde=${encodeURIComponent(ct.de)}&ate=${encodeURIComponent(ct.ate)}`)
      .then(r=>r.json()).then(j=>{ ct.tempoB=false;
        if(j&&!j.erro){ ct.tempo=j; ct.chaveT=chave; } else ct.tempoErro=(j&&j.erro)||'Falha ao ler as horas.';
        if(estado.vista==='controladoria') renderControladoria();
      }).catch(e=>{ ct.tempoB=false; ct.tempoErro=String(e.message||e); if(estado.vista==='controladoria') renderControladoria(); });
  }
  if(!ct.proj&&!ct.projB){
    ct.projB=true;
    fetch('/api/projetos?visao=1').then(r=>r.json()).then(j=>{ ct.projB=false;
      ct.proj=(j&&!j.erro)?j:{projetos:[],erro:(j&&j.erro)||'Consolidado do Jira indisponível.'};
      if(estado.vista==='controladoria') renderControladoria();
    }).catch(e=>{ ct.projB=false; ct.proj={projetos:[],erro:String(e.message||e)};
      if(estado.vista==='controladoria') renderControladoria(); });
  }
}
// Agregação da categoria ativa: por projeto, por pessoa, por tipo e por mês.
function ctDados(){
  const ct=estado.ctrl; const t=ct.tempo; if(!t||ct.chaveT!==(ct.de+'|'+ct.ate)) return null;
  const projMeta=t.projetos||{};
  const cats=[...new Set(Object.values(projMeta).map(x=>(x&&x.categoria)||'Sem categoria'))].sort((a,b)=>a.localeCompare(b,'pt'));
  if(!ct.cat||!cats.includes(ct.cat)) ct.cat=cats[0]||'';
  const gest=ctGestoresSet(t.pessoas||{});
  const wl=(t.worklogs||[]).filter(w=>(((projMeta[w.p]||{}).categoria)||'Sem categoria')===ct.cat);
  const por={}; const porPessoa={}; const porTipo={}; const porMes={}; const semCusto=new Set();
  let segTot=0,segFat=0,custoTot=0,custoGest=0,recTot=0,temContrato=false;
  wl.forEach(w=>{
    const s=Number(w.s)||0; const h=s/3600;
    const chBase=ctCustoBase(w.a); const ch=chBase>0?chBase:Math.max(0,Number((cfg.ctrl||{}).custoPadrao)||0);
    const custo=h*ch;
    if(!(chBase>0)) semCusto.add(w.a);   // sem custo PRÓPRIO (mesmo que o padrão cubra)
    const c=ctContratoDe(w.p); const vh=c?(Number(c.valorHora)||0):0;
    const rec=(w.f&&vh)?h*vh:0; if(vh) temContrato=true;   // receita = horas FATURÁVEIS × valor-hora do contrato
    const P=por[w.p]=por[w.p]||{p:w.p,seg:0,segFat:0,custo:0,custoGest:0,rec:0,temC:!!vh,pessoas:new Set(),tipos:{}};
    P.seg+=s; if(w.f) P.segFat+=s; P.custo+=custo; P.rec+=rec; P.pessoas.add(w.a);
    P.tipos[w.t||'—']=(P.tipos[w.t||'—']||0)+s;
    const U=porPessoa[w.a]=porPessoa[w.a]||{a:w.a,seg:0,custo:0,gestor:gest.has(w.a)};
    U.seg+=s; U.custo+=custo;
    porTipo[w.t||'—']=(porTipo[w.t||'—']||0)+s;
    const mes=(w.d||'').slice(0,7);
    const M=porMes[mes]=porMes[mes]||{custo:0,rec:0,seg:0};
    M.custo+=custo; M.rec+=rec; M.seg+=s;
    segTot+=s; if(w.f) segFat+=s; custoTot+=custo; recTot+=rec;
    if(gest.has(w.a)){ custoGest+=custo; P.custoGest+=custo; }
  });
  return { cats, wl, por, porPessoa, porTipo, porMes, semCusto, segTot, segFat,
    custoTot, custoGest, recTot, temContrato, projMeta, pessoas:t.pessoas||{}, resumos:t.resumos||{}, gest };
}
// Linha "como ler" — a explicação explícita que acompanha cada bloco.
const ctExpl=(txt)=>`<div class="ct-expl">ℹ️ <b>Como ler:</b> ${txt}</div>`;
const ctPct=(n,d)=>d>0?Math.round(n/d*100):null;
function ctSemaforo(mgp){ return mgp==null?['—','na']:(mgp>=30?['saudável','ok']:(mgp>=10?['apertada','aten']:['no vermelho','crit'])); }
// ===========================================================================
// 📚 Central de Relatórios — o catálogo oficial de relatórios da operação,
// CONFIGURÁVEL POR TIPO DE PROJETO (sigla da categoria do Jira), como uma
// matriz relatório × tipo com três estados:
//   O = essencial (obrigatório para esse tipo) · R = recomendado · – = não se aplica
// Cada relatório aponta para a TELA REAL do app que o entrega (deep-link) e
// declara honestamente a disponibilidade: ✅ no app · 🔶 parcial (proxy) ·
// 🔒 exige dados que o Jira ainda não tem (sprints, CSAT, SLA nativo…).
// Defaults da matriz = planilha de governança aprovada pelo usuário (2026-08-25);
// gestores podem ajustar célula a célula (cfg.relcat.m guarda só os desvios).
// ===========================================================================
const REL_SIGLAS=['DEA','DEF','PEA','PEF','DAMS','PAMS','ARQ','IMI','IPA','ITPR'];
const REL_SIGLA_NOME={ DEA:'Dexterity - Escopo Aberto', DEF:'Dexterity - Escopo Fechado',
  PEA:'Parceria - Escopo Aberto', PEF:'Parceria - Escopo Fechado', DAMS:'Dexterity - AMS',
  PAMS:'Parceria - AMS', ARQ:'Arquivado', IMI:'Interno - Melhorias Internas',
  IPA:'Interno - Produtos e aceleradores', ITPR:'Interno - Tarefas, Processos e Rotinas' };
const REL_DIMS=['Entrega','Escopo','Tempo','Custo','Recursos','Risco','AMS','Portfólio'];
// def = 10 caracteres na ordem de REL_SIGLAS (O / R / -)
const REL_CAT=[
  {id:'R01',nome:'Status Report Executivo',dim:'Entrega',freq:'Semanal',def:'OOOOOO-RR-',disp:'ok',vista:'projetos',
   obj:'Uma página com a situação do projeto: progresso, prazo, esforço e pendências.',
   resp:'O projeto está no prazo, no escopo e no orçamento? O que precisa de decisão?',
   como:'📁 Projetos — consolidado com saúde por projeto e ficha detalhada (épicos, esforço, evolução).'},
  {id:'R02',nome:'Burndown / Burnup de Sprint',dim:'Entrega',freq:'Diária (na sprint)',def:'OOOO---RO-',disp:'falta',vista:'projetos',
   obj:'Acompanhar o consumo do escopo comprometido dentro da sprint.',
   resp:'Vamos entregar o comprometido até o fim da sprint?',
   como:'Exige sprints e story points, que a instância ainda não usa. Proxy: evolução mensal criados × concluídos na ficha do projeto.'},
  {id:'R03',nome:'Fluxo por status (CFD)',dim:'Entrega',freq:'Semanal',def:'RRRROO-RRR',disp:'parcial',vista:'gestao',go:()=>{ estado.gestao.agrupar='status'; },
   obj:'Ver onde o trabalho está acumulando no fluxo.',
   resp:'Onde o trabalho está acumulando? O fluxo está estável?',
   como:'🛠 Gestão agrupada por status mostra a foto atual do fluxo. O diagrama acumulado no tempo exige histórico de transições (roadmap).'},
  {id:'R04',nome:'Marcos e Cronograma',dim:'Entrega',freq:'Semanal',def:'OOOO---RR-',disp:'parcial',vista:'projetos',
   obj:'Controlar as datas dos marcos de fase (Explore, Realize, Deploy, Go-live).',
   resp:'Os marcos serão cumpridos? Qual o impacto de um atraso?',
   como:'📁 Projetos — épicos com vencimento e esforço na ficha. Baseline formal de cronograma ainda não existe.'},
  {id:'R05',nome:'Velocity por Sprint',dim:'Entrega',freq:'Por sprint',def:'RORO---RO-',disp:'falta',vista:'',
   obj:'Medir a capacidade média de entrega do time por sprint.',
   resp:'Quanto o time entrega por sprint? A previsão de término é confiável?',
   como:'Exige sprints e story points — no roadmap para quando o time adotar.'},
  {id:'R06',nome:'Controle de Escopo e Change Requests',dim:'Escopo',freq:'Mensal',def:'OOOORR--R-',disp:'falta',vista:'',
   obj:'Registrar e precificar as mudanças de escopo após a linha de base.',
   resp:'Quanto o escopo cresceu? As mudanças foram aprovadas e faturadas?',
   como:'Exige tipo/label "Change Request" nos projetos — padronização no roadmap.'},
  {id:'R07',nome:'Rastreabilidade de Requisitos (GAP → EF → Objeto)',dim:'Escopo',freq:'Semanal',def:'OOOORR-RO-',disp:'parcial',vista:'projetos',
   obj:'Garantir que cada GAP tenha especificação, desenvolvimento, teste e aceite.',
   resp:'Todo requisito está coberto? Onde está cada GAP no ciclo?',
   como:'📁 Projetos — hierarquia épico → tickets na ficha. Rastreio completo exige links GAP→EF→Objeto padronizados.'},
  {id:'R08',nome:'Saúde e Aging do Backlog',dim:'Escopo',freq:'Semanal',def:'OROROO-OOO',disp:'ok',vista:'analytics',
   obj:'Avaliar volume, envelhecimento e refinamento do backlog.',
   resp:'Há itens paralisados? O backlog está refinado o suficiente?',
   como:'📈 Analytics — "Backlog que já deveria andar", "Sem atualização há X dias", "Estimativa zerada".'},
  {id:'R09',nome:'Aderência a Prazos',dim:'Tempo',freq:'Semanal',def:'OOOOOO-RRO',disp:'ok',vista:'analytics',
   obj:'Comparar a data prometida com a entrega real de cada item.',
   resp:'Estamos cumprindo o que prometemos? Onde erramos mais?',
   como:'📈 Analytics — "Chamados vencidos" e "Sem data de vencimento"; 🚨 Alertas para agir nos atrasados.'},
  {id:'R10',nome:'Lead Time e Cycle Time',dim:'Tempo',freq:'Mensal',def:'RRRROO-RRR',disp:'parcial',vista:'analytics',
   obj:'Medir o tempo de ponta a ponta das demandas.',
   resp:'Quanto tempo levamos para atender uma demanda?',
   como:'Lead time aproximado por criado → resolvido (base do Analytics). Cycle time exige histórico de transições (roadmap).'},
  {id:'R11',nome:'Apontamento de Horas (Timesheet)',dim:'Tempo',freq:'Semanal',def:'OOOOOO-OOO',disp:'ok',vista:'timesheet',
   obj:'Consolidar as horas apontadas por projeto, pessoa e dia.',
   resp:'Onde as horas estão sendo gastas? O apontamento está completo?',
   como:'Timesheet (grade pessoa × dia com lacunas) + ⏱ Apontar + 🏅 Ranking de apontamento.'},
  {id:'R12',nome:'Horas Planejadas vs Realizadas',dim:'Custo',freq:'Semanal',def:'ROROOO-RRR',disp:'ok',vista:'planrel',
   obj:'Comparar estimativa e esforço real para medir precisão e consumo.',
   resp:'Estamos consumindo mais esforço do que o previsto?',
   como:'📊 Relatórios do planejamento (semana a semana, por pessoa e projeto) + estimado × gasto na 🏦 Controladoria.'},
  {id:'R13',nome:'Rentabilidade / Margem por Projeto',dim:'Custo',freq:'Mensal',def:'OOOOOO----',disp:'ok',vista:'controladoria',
   obj:'Confrontar receita contratada com custo de horas para apurar a margem.',
   resp:'O projeto é rentável? Qual a margem atual?',
   como:'🏦 Controladoria — receita (contratos) × custo (horas × custo/h), margem R$ e %, semáforo por projeto.'},
  {id:'R14',nome:'Consumo de Bolsa de Horas e Faturamento',dim:'Custo',freq:'Mensal',def:'OROROO----',disp:'ok',vista:'receita',
   obj:'Controlar o saldo de horas contratadas e a base de faturamento.',
   resp:'Quantas horas restam? Qual o valor a faturar neste mês?',
   como:'💰 Receita — bolsa contratada × consumida por contrato; AMS traz o ciclo faturado.'},
  {id:'R15',nome:'Forecast de Receita e Backlog Contratado',dim:'Custo',freq:'Mensal',def:'OOOOOO----',disp:'parcial',vista:'receita',
   obj:'Projetar a receita futura a partir do contratado e do ritmo de consumo.',
   resp:'Qual a receita esperada nos próximos meses? Há risco de vazio?',
   como:'💰 Receita — saldo e ritmo de consumo permitem projeção simples; pipeline comercial fica fora do Jira.'},
  {id:'R16',nome:'Alocação e Capacidade do Time',dim:'Recursos',freq:'Semanal',def:'OOOOOO-RRR',disp:'parcial',vista:'ranking',
   obj:'Comparar a capacidade disponível com a demanda alocada.',
   resp:'Temos gente suficiente? Quem está sub ou sobrealocado?',
   como:'🏅 Ranking — meta de horas × apontado por pessoa (🎯 Metas & ausências). A Alocação macro está desativada.'},
  {id:'R17',nome:'Carga por Consultor e WIP por Pessoa',dim:'Recursos',freq:'Semanal',def:'OOOOOO-RRR',disp:'ok',vista:'gestao',go:()=>{ estado.gestao.agrupar='resp'; },
   obj:'Quantos itens e horas cada pessoa tem em andamento ao mesmo tempo.',
   resp:'Alguém está sobrecarregado? O WIP individual é saudável?',
   como:'🛠 Gestão agrupada por responsável + 📈 Analytics "Sem pessoa atribuída".'},
  {id:'R18',nome:'Registro de Riscos e Issues',dim:'Risco',freq:'Semanal',def:'OOOORR-RR-',disp:'parcial',vista:'gestao',go:()=>{ estado.gestao.agrupar='risco'; },
   obj:'Inventário de riscos e impedimentos com dono e prazo.',
   resp:'Quais riscos podem inviabilizar a entrega? Há impedimento sem dono?',
   como:'🛠 Gestão agrupada por risco (vencidos/parados/bloqueados). Registro formal de riscos com probabilidade × impacto no roadmap.'},
  {id:'R19',nome:'Qualidade — Bugs por Origem e Severidade',dim:'Risco',freq:'Mensal',def:'OOOOOO-RO-',disp:'parcial',vista:'tickets',go:()=>{ estado.tkGroup='tipo'; },
   obj:'Classificar defeitos por origem e severidade.',
   resp:'De onde vêm nossos defeitos? A qualidade está melhorando?',
   como:'Tickets agrupados por tipo (Bug × demais) com prioridade como severidade. Causa-raiz BUG.1–BUG.5 exige campo padronizado (roadmap).'},
  {id:'R20',nome:'Retrabalho e Reabertura de Tickets',dim:'Risco',freq:'Mensal',def:'RRRROO-RR-',disp:'ok',vista:'analytics',
   obj:'Medir tickets reabertos como indicador de qualidade.',
   resp:'Estamos entregando certo na primeira vez?',
   como:'📈 Analytics — visão "Retrabalho (reabertos)" com a lista do período.'},
  {id:'R21',nome:'Volumetria de Chamados por Categoria',dim:'AMS',freq:'Mensal',def:'----OO----',disp:'ok',vista:'ams',
   obj:'Distribuir os chamados AMS nas categorias de atendimento.',
   resp:'Que tipo de demanda o cliente mais abre? Onde atuar preventivamente?',
   como:'AMS — ciclo do contrato com chamados, horas e banco de horas por categoria.'},
  {id:'R22',nome:'Cumprimento de SLA',dim:'AMS',freq:'Mensal',def:'----OO---R',disp:'parcial',vista:'analytics',
   obj:'Apurar o atendimento aos SLAs de resposta e resolução.',
   resp:'Estamos dentro do SLA contratado? Onde há violação?',
   como:'📈 Analytics — "Aguardando resposta há X dias" é o proxy. SLA nativo do Jira Service Management no roadmap.'},
  {id:'R23',nome:'Satisfação do Cliente (CSAT)',dim:'AMS',freq:'Trimestral',def:'RRRROO----',disp:'falta',vista:'',
   obj:'Capturar a percepção do cliente sobre atendimentos e entregas.',
   resp:'O cliente está satisfeito? A satisfação está caindo?',
   como:'Exige pesquisa de satisfação vinculada aos tickets — no roadmap.'},
  {id:'R24',nome:'Recorrência e Top Ofensores',dim:'AMS',freq:'Mensal',def:'----OO-RR-',disp:'parcial',vista:'tickets',go:()=>{ estado.tkGroup='projeto'; },
   obj:'Identificar temas que geram chamados repetidos, candidatos a solução definitiva.',
   resp:'O que abre chamado repetidamente? O que vale automatizar ou treinar?',
   como:'Tickets do período agrupados (projeto/tipo/pessoa) mostram concentração; agrupamento por tema/texto no roadmap.'},
  {id:'R25',nome:'Dashboard de Portfólio',dim:'Portfólio',freq:'Semanal',def:'OOOOOOROOO',disp:'ok',vista:'projetos',
   obj:'Todos os projetos numa tela com semáforo de saúde.',
   resp:'Quais projetos precisam de atenção da diretoria agora?',
   como:'📁 Projetos — consolidado com saúde, esforço e conclusão; 🏦 Controladoria soma a dimensão financeira.'},
  {id:'R26',nome:'Saúde do Portfólio Interno',dim:'Portfólio',freq:'Mensal',def:'-------OOO',disp:'ok',vista:'controladoria',
   obj:'Acompanhar as iniciativas internas e o investimento nelas.',
   resp:'Nossos investimentos internos estão avançando e gerando valor?',
   como:'🏦 Controladoria filtrada nas categorias internas (IMI/IPA/ITPR) — horas investidas e evolução.'},
  {id:'R27',nome:'Lições Aprendidas e Encerramento',dim:'Portfólio',freq:'No encerramento',def:'OOOORRORR-',disp:'falta',vista:'',
   obj:'Consolidar resultados, desvios e aprendizados ao encerrar o projeto.',
   resp:'O que deu certo e o que repetir/evitar no próximo projeto?',
   como:'Exige ritual/ticket padrão de encerramento — modelo no roadmap.'},
];
// Sigla do tipo a partir da CATEGORIA do Jira: prefixo "XXX | ..." quando houver;
// senão, heurística pelo texto do nome (cobre categorias antigas sem prefixo).
function relSiglaDe(cat){
  const c=String(cat||'').trim();
  const m=c.match(/^([A-Z]{2,5})\s*\|/);
  if(m&&REL_SIGLAS.includes(m[1])) return m[1];
  const t=c.toLowerCase();
  if(/arquiv/.test(t)) return 'ARQ';
  if(/ams/.test(t)) return /parceria/.test(t)?'PAMS':'DAMS';
  if(/melhorias?\s+internas/.test(t)) return 'IMI';
  if(/produtos|acelerador/.test(t)) return 'IPA';
  if(/tarefas|processos|rotinas/.test(t)) return 'ITPR';
  if(/escopo\s+aberto/.test(t)) return /parceria/.test(t)?'PEA':'DEA';
  if(/escopo\s+fechado/.test(t)) return /parceria/.test(t)?'PEF':'DEF';
  return '';
}
// Valor efetivo da célula: override do gestor (cfg.relcat.m) ou default do catálogo.
function relVal(item, sigla){
  const ov=cfg.relcat&&cfg.relcat.m&&cfg.relcat.m[item.id];
  if(ov&&['O','R','-'].includes(ov[sigla])) return ov[sigla];
  const i=REL_SIGLAS.indexOf(sigla);
  return i>=0?(item.def[i]||'-'):'-';
}
function relCicla(id, sigla){
  const item=REL_CAT.find(r=>r.id===id); if(!item) return;
  const seq={O:'R',R:'-','-':'O'};
  const novo=seq[relVal(item,sigla)]||'O';
  cfg.relcat=cfg.relcat||{m:{}}; cfg.relcat.m=cfg.relcat.m||{};
  const ov={...(cfg.relcat.m[item.id]||{})};
  const i=REL_SIGLAS.indexOf(sigla);
  if(novo===(item.def[i]||'-')) delete ov[sigla]; else ov[sigla]=novo;   // guarda só o desvio
  if(Object.keys(ov).length) cfg.relcat.m[item.id]=ov; else delete cfg.relcat.m[item.id];
  salvaCfg();
}
// Projetos reais por sigla (via catálogo /api/projetos) + categorias não reconhecidas.
function relProjPorSigla(){
  const por={}; REL_SIGLAS.forEach(s=>por[s]=[]);
  const desconhecidas=new Set();
  (_projetosCache||[]).forEach(p=>{
    const s=relSiglaDe(p.categoria);
    if(s) por[s].push(p); else if(p.categoria&&p.categoria!=='Sem categoria') desconhecidas.add(p.categoria);
  });
  return { por, desconhecidas:[...desconhecidas] };
}
const REL_DISP={ ok:['✅','no app','A tela que entrega este relatório já existe — clique em Abrir.'],
  parcial:['🔶','parcial','Uma tela do app cobre parte do relatório (proxy honesto); o complemento está no roadmap.'],
  falta:['🔒','exige dados novos','Depende de dados que o Jira ainda não tem (sprints, CSAT, SLA nativo…). Configurável desde já; entra no roadmap.'] };
function relAbre(id){
  const item=REL_CAT.find(r=>r.id===id);
  if(!item||!item.vista) return;
  if(item.go) try{ item.go(); }catch(e){}
  vaiPara(item.vista);
}
function relCardHTML(item, sigla){
  const [ic,rot,tip]=REL_DISP[item.disp]||REL_DISP.falta;
  const v=sigla?relVal(item,sigla):'';
  const marca=v==='O'?'<span class="rc-cell rc-O" data-tip="Essencial para este tipo de projeto">O</span>'
    :v==='R'?'<span class="rc-cell rc-R" data-tip="Recomendado para este tipo de projeto">R</span>':'';
  return `<div class="rc-card">
    <div class="rc-card-top"><b>${item.id} · ${esc(item.nome)}</b>${marca}
      <span class="rc-badge rc-${item.disp}" data-tip="${escA(tip)}">${ic} ${rot}</span></div>
    <div class="rc-meta">${esc(item.dim)} · ${esc(item.freq)}</div>
    <div class="rc-obj">${esc(item.obj)} <span class="mp-dim">${esc(item.resp)}</span></div>
    <div class="rc-como">${esc(item.como)}</div>
    ${item.vista?`<button class="btn rc-abrir" data-rel-abre="${item.id}">Abrir no app →</button>`:''}</div>`;
}
function renderRelatorios(){
  const cont=document.getElementById('conteudo');
  const rc=estado.relcat;
  if(!_projetosCache) garanteProjetos().then(()=>{ if(estado.vista==='relatorios') renderRelatorios(); }).catch(()=>{});
  const { por, desconhecidas }=relProjPorSigla();
  const gestor=souAprovador();
  const q=(rc.busca||'').toLowerCase();
  const lista=REL_CAT.filter(r=>(!rc.dim||r.dim===rc.dim)
    &&(!q||(r.id+' '+r.nome+' '+r.obj+' '+r.resp+' '+r.como).toLowerCase().includes(q)));

  const chips=`<div class="ap-chips rc-chips">
    <button class="chip ${!rc.sigla?'on':''}" data-rc-sig="">Todos os tipos</button>
    ${REL_SIGLAS.map(s=>`<button class="chip ${rc.sigla===s?'on':''}" data-rc-sig="${s}"
      data-tip="${escA(REL_SIGLA_NOME[s]+(por[s].length?` — ${por[s].length} projeto(s): `+por[s].slice(0,6).map(p=>p.key).join(', ')+(por[s].length>6?'…':''):' — sem projetos hoje'))}">${s}${por[s].length?` <span class="rc-n">${por[s].length}</span>`:''}</button>`).join('')}</div>`;
  const filtros=`<div class="ap-filtros">
    <div class="campo"><label>Tipo de projeto</label>${chips}</div>
    <div class="campo"><label>Dimensão</label><select id="rc-dim"><option value="">todas</option>
      ${REL_DIMS.map(d2=>`<option ${rc.dim===d2?'selected':''}>${d2}</option>`).join('')}</select></div>
    <div class="campo"><label>Buscar</label><input type="search" id="rc-busca" value="${escA(rc.busca||'')}" placeholder="nome, pergunta, tela…" style="min-width:200px"></div>
    ${gestor&&Object.keys((cfg.relcat&&cfg.relcat.m)||{}).length?`<div class="campo"><label>&nbsp;</label>
      <button class="btn" id="rc-reset" data-tip="Volta a matriz inteira para o padrão aprovado">↺ Restaurar padrão</button></div>`:''}
  </div>`;

  // ---- cards do tipo selecionado (O primeiro, depois R) ----
  let cards='';
  if(rc.sigla){
    const os=lista.filter(r=>relVal(r,rc.sigla)==='O');
    const rs=lista.filter(r=>relVal(r,rc.sigla)==='R');
    const na=lista.length-os.length-rs.length;
    cards=`<div class="card full"><h2>📚 Relatórios de ${esc(REL_SIGLA_NOME[rc.sigla])} <span>${os.length} essenciais · ${rs.length} recomendados${na?` · ${na} não se aplicam`:''}</span></h2>
      ${os.length?`<h3 class="mp-h3">⭐ Essenciais (O)</h3><div class="rc-grid">${os.map(r=>relCardHTML(r,rc.sigla)).join('')}</div>`:''}
      ${rs.length?`<h3 class="mp-h3">👍 Recomendados (R)</h3><div class="rc-grid">${rs.map(r=>relCardHTML(r,rc.sigla)).join('')}</div>`:''}
      ${!os.length&&!rs.length?'<div class="estado">Nenhum relatório se aplica com os filtros atuais.</div>':''}</div>`;
  }

  // ---- matriz completa ----
  const linhas=lista.map(item=>{
    const [ic]=REL_DISP[item.disp]||REL_DISP.falta;
    const cels=REL_SIGLAS.map(s=>{
      const v=relVal(item,s);
      const cls=v==='O'?'rc-O':(v==='R'?'rc-R':'rc-x');
      const hl=rc.sigla===s?' rc-hl':'';
      return `<td class="rc-td${hl}"><button class="rc-cell ${cls}" data-rc-cel="${item.id}|${s}"
        data-tip="${escA(`${item.id} × ${s}: ${v==='O'?'essencial':(v==='R'?'recomendado':'não se aplica')}${gestor?' — clique para alternar O → R → –':''}`)}"
        ${gestor?'':'disabled'}>${v==='-'?'–':v}</button></td>`;
    }).join('');
    return `<tr><td class="rc-nome"><span class="rc-badge rc-${item.disp}" data-tip="${escA(REL_DISP[item.disp][2])}">${ic}</span>
      <button class="rc-link" data-rel-info="${item.id}" data-tip="${escA(item.obj)}">${item.id} · ${esc(item.nome)}</button></td>
      <td class="rc-dim">${esc(item.dim)}</td>${cels}</tr>`;
  }).join('');
  const matriz=`<div class="card full"><h2>Matriz relatório × tipo de projeto
      <span>${gestor?'clique numa célula para alternar O → R → – (vale para o time todo)':'somente gestores editam a matriz'}</span></h2>
    <div class="scroll-x"><table class="mp-tab-mini rc-tab"><thead><tr><th>Relatório</th><th>Dimensão</th>
      ${REL_SIGLAS.map(s=>`<th class="rc-th${rc.sigla===s?' rc-hl':''}" data-tip="${escA(REL_SIGLA_NOME[s])}">${s}</th>`).join('')}</tr></thead>
      <tbody>${linhas}</tbody></table></div>
    ${ctExpl('<b>O</b> = relatório <b>essencial</b> para aquele tipo de projeto (faz parte do padrão de governança) · <b>R</b> = <b>recomendado</b> (use quando agregar) · <b>–</b> = não se aplica. O ícone diz onde o relatório vive hoje: <b>✅ no app</b> (clique e abra), <b>🔶 parcial</b> (uma tela cobre parte, o resto está no roadmap) e <b>🔒 exige dados novos</b> no Jira. O padrão vem da planilha de governança; ajustes dos gestores valem para o time todo.')}
    ${desconhecidas.length?`<div class="aviso" style="margin-top:10px">⚠ Categorias de projeto sem tipo reconhecido: ${desconhecidas.map(esc).join(' · ')} — renomeie no Jira com o prefixo da sigla (ex.: "DAMS | …") para entrarem na matriz.</div>`:''}</div>`;

  cont.replaceChildren(el(`<div>${filtros}${cards}${matriz}</div>`));

  cont.querySelectorAll('[data-rc-sig]').forEach(b=>b.addEventListener('click',()=>{
    if(estado.vista!=='relatorios') return;
    rc.sigla=b.getAttribute('data-rc-sig')||''; renderRelatorios(); }));
  const dim=document.getElementById('rc-dim');
  if(dim) dim.addEventListener('change',()=>{ rc.dim=dim.value; renderRelatorios(); });
  const bus=document.getElementById('rc-busca');
  if(bus) bus.addEventListener('input',()=>{ rc.busca=bus.value;
    clearTimeout(renderRelatorios._deb);
    renderRelatorios._deb=setTimeout(()=>{ if(estado.vista==='relatorios'&&document.activeElement!==bus){ renderRelatorios(); return; }
      if(estado.vista!=='relatorios') return;
      const pos=bus.selectionStart; renderRelatorios();
      const b2=document.getElementById('rc-busca'); if(b2){ b2.focus(); try{ b2.setSelectionRange(pos,pos); }catch(e){} } },350); });
  cont.querySelectorAll('[data-rc-cel]').forEach(b=>b.addEventListener('click',()=>{
    if(estado.vista!=='relatorios') return;
    if(!souAprovador()){ toast('Só gestores alteram a matriz de relatórios.','warn'); return; }
    const [id2,s]=b.getAttribute('data-rc-cel').split('|');
    relCicla(id2,s); renderRelatorios(); }));
  cont.querySelectorAll('[data-rel-abre]').forEach(b=>b.addEventListener('click',()=>relAbre(b.getAttribute('data-rel-abre'))));
  cont.querySelectorAll('[data-rel-info]').forEach(b=>b.addEventListener('click',()=>{
    const item=REL_CAT.find(r=>r.id===b.getAttribute('data-rel-info')); if(!item) return;
    abreModal(`<h2 style="margin-top:0">${item.id} · ${esc(item.nome)}</h2>
      <div class="rc-ficha"><p><b>O que é:</b> ${esc(item.obj)}</p>
       <p><b>Responde:</b> ${esc(item.resp)}</p>
       <p><b>Dimensão:</b> ${esc(item.dim)} · <b>Frequência sugerida:</b> ${esc(item.freq)}</p>
       <p><b>Onde vive hoje:</b> ${esc(item.como)}</p>
       <p><b>Vale para:</b> ${REL_SIGLAS.filter(s=>relVal(item,s)!=='-').map(s=>`${s} (${relVal(item,s)})`).join(' · ')||'—'}</p>
       ${item.vista?`<button class="btn primario" data-rel-abre="${item.id}">Abrir no app →</button>`:''}
       <div class="alx-modal-acoes"><button class="btn" id="gx-fechar" onclick="fechaModal()">Fechar</button></div></div>`);
    const mb=document.getElementById('modal-body');
    if(mb){ const b2=mb.querySelector('[data-rel-abre]');
      if(b2) b2.addEventListener('click',()=>{ fechaModal(); relAbre(item.id); }); } }));
  const rst=document.getElementById('rc-reset');
  if(rst) rst.addEventListener('click',()=>{
    if(!souAprovador()) return;
    if(!confirm('Restaurar TODA a matriz para o padrão aprovado? Os ajustes feitos pelos gestores serão descartados.')) return;
    cfg.relcat={m:{}}; salvaCfg(); toast('Matriz restaurada para o padrão.','ok'); renderRelatorios(); });
}

function renderControladoria(){
  const cont=document.getElementById('conteudo');
  const ct=estado.ctrl;
  ctGarante();
  const d=ctDados();
  const filtros=`<div class="ap-filtros">
    <div class="campo"><label>De</label><input type="date" id="ct-de" value="${escA(ct.de||'')}"></div>
    <div class="campo"><label>Até</label><input type="date" id="ct-ate" value="${escA(ct.ate||'')}"></div>
    <div class="campo"><label>Atalhos</label><div class="ap-chips">
      <button class="chip" data-ct-per="mes">Este mês</button>
      <button class="chip" data-ct-per="3m">Últimos 3 meses</button>
      <button class="chip" data-ct-per="6m">Últimos 6 meses</button>
      <button class="chip" data-ct-per="ano">Este ano</button></div></div>
  </div>`;
  if(!d){
    cont.replaceChildren(el(`<div><div class="card full"><h2>🏦 Controladoria de Projetos <span>margem, custos e esforço por categoria de projeto</span></h2>
      ${filtros}
      ${ct.tempoErro?`<div class="erro">${esc(ct.tempoErro)} <button class="btn" id="ct-retry">Tentar de novo</button></div>`
        :'<div class="estado">Carregando as horas do período…</div>'}</div></div>`));
    return;
  }
  const S=ctBlocosDe(ct.cat);
  const gestorEu=(typeof souAprovador==='function')&&souAprovador();
  const nomeDe=(a)=>((d.pessoas[a]&&d.pessoas[a].nome)||a);
  const chipsCat=d.cats.map(c=>{ const n=Object.values(d.projMeta).filter(x=>((x&&x.categoria)||'Sem categoria')===c).length;
    return `<button class="chip" aria-pressed="${ct.cat===c}" data-ct-cat="${escA(c)}">${esc(c)} <b>${n}</b></button>`; }).join(' ');
  const margem=d.recTot-d.custoTot;
  const mgp=ctPct(margem,d.recTot);
  const [mgRot,mgCls]=ctSemaforo(mgp);
  const custoPadrao=Math.max(0,Number((cfg.ctrl||{}).custoPadrao)||0);
  const avisos=[];
  if(d.semCusto.size&&!custoPadrao) avisos.push(`⚠ <b>${d.semCusto.size} pessoa(s) sem custo/h cadastrado</b> (${[...d.semCusto].slice(0,4).map(a=>esc(nomeDe(a).split(' ')[0])).join(', ')}${d.semCusto.size>4?'…':''}) — as horas delas entram com custo R$ 0 e a margem fica MELHOR do que é. ${gestorEu?'Cadastre no <b>⚙️ abaixo</b> (custo por pessoa ou custo padrão).':'Peça a um gestor para cadastrar no ⚙️ desta tela.'}`);
  else if(d.semCusto.size&&custoPadrao) avisos.push(`ℹ️ ${d.semCusto.size} pessoa(s) sem custo/h próprio — usando o custo padrão de ${fmtBRL(custoPadrao)}/h (marcadas como "padrão" na tabela de custo por pessoa).`);
  if(!d.temContrato) avisos.push('⚠ <b>Nenhum projeto desta categoria tem contrato com valor-hora</b> no Admin — sem valor-hora não há receita nem margem (os custos continuam valendo). Cadastre em Contratos (Admin).');
  const kpis=S.kpis?`<div class="kpis ts-kpis">
      <div class="kpi t"><div class="v">${fmtH(d.segTot)}</div><div class="l">Horas realizadas<div class="ct-kl">todo o trabalho apontado na categoria</div></div></div>
      <div class="kpi t"><div class="v">${d.recTot?fmtBRL(d.recTot):'—'}</div><div class="l">Receita estimada<div class="ct-kl">horas faturáveis × valor-hora do contrato</div></div></div>
      <div class="kpi w"><div class="v">${fmtBRL(d.custoTot)}</div><div class="l">Custo estimado<div class="ct-kl">horas × custo/h de cada pessoa</div></div></div>
      <div class="kpi ${mgCls==='ok'?'t':'w'}"><div class="v">${mgp==null?'—':mgp+'%'}</div><div class="l">Margem — ${mgRot}<div class="ct-kl">${d.recTot?`sobra ${fmtBRL(margem)} da receita`:'precisa de contrato com valor-hora'}</div></div></div>
      <div class="kpi w"><div class="v">${fmtBRL(d.custoGest)}</div><div class="l">Custo de gestão<div class="ct-kl">horas dos gestores (${ctPct(d.custoGest,d.custoTot)==null?'—':ctPct(d.custoGest,d.custoTot)+'%'} do custo)</div></div></div>
      <div class="kpi t"><div class="v">${ctPct(d.segFat,d.segTot)==null?'—':ctPct(d.segFat,d.segTot)+'%'}</div><div class="l">Horas faturáveis<div class="ct-kl">parte do esforço que gera receita</div></div></div>
    </div>
    ${ctExpl('a <b>margem</b> é o que sobra da receita depois de pagar o custo das horas — <b>≥30% saudável</b> · 10–29% apertada · &lt;10% no vermelho. Receita usa só as horas FATURÁVEIS (o tipo do ticket define); custo usa TODAS as horas. Valores são estimativas a partir do custo/h cadastrado e do valor-hora dos contratos.')}`:'';
  // 📁 por projeto — margem, execução do esforço, pessoas e AÇÕES (drill)
  const projRows=Object.values(d.por).sort((a,b)=>b.custo-a.custo).map(P=>{
    const m2=P.rec-P.custo; const mp2=ctPct(m2,P.rec); const [rot2,cls2]=ctSemaforo(mp2);
    const cons=(ct.proj&&ct.proj.projetos||[]).find(x=>x.key===P.p);
    const execu=cons&&Number(cons.estH)>0?Math.round(Number(cons.gastoH)/Number(cons.estH)*100):null;
    const conc=cons&&Number(cons.total)>0?Math.round(Number(cons.concluidos)/Number(cons.total)*100):null;
    return `<tr class="ct-click" data-ct-drill="pj=${escA(P.p)}" role="button" tabindex="0" data-tip="${escA(projNome(P.p)+' — clique para ver os tickets do realizado, com ações')}">
      <td data-tip="${escA(P.p)}">${esc(projNome(P.p))}</td>
      <td class="num">${fmtH(P.seg)}</td>
      <td class="num">${fmtBRL(P.custo)}</td>
      <td class="num">${P.temC?fmtBRL(P.rec):'<span class="muted" data-tip="Projeto sem contrato com valor-hora no Admin">—</span>'}</td>
      <td class="num"><span class="ct-sem ${cls2}">${mp2==null?'—':mp2+'%'}</span> <span class="muted small">${rot2}</span></td>
      <td class="num" data-tip="Horas já gastas ÷ estimativa dos tickets no Jira (todo o histórico do projeto)">${execu==null?'—':execu+'%'}</td>
      <td class="num" data-tip="Tickets concluídos ÷ total do projeto no Jira">${conc==null?'—':conc+'%'}</td>
      <td class="num">${P.pessoas.size}</td></tr>`;
  }).join('');
  const blocoProj=S.proj?`<div class="card full"><h2>📁 Projetos da categoria <span>clique numa linha para os tickets — de lá dá para agir (ficha, status, Gestão, Rateio)</span></h2>
    <div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Projeto</th><th class="num">Horas</th><th class="num">Custo</th><th class="num">Receita</th><th class="num">Margem</th><th class="num">Esforço executado</th><th class="num">Concluído</th><th class="num">Pessoas</th></tr></thead>
    <tbody>${projRows||'<tr><td colspan="8" class="mp-dim">Sem horas na categoria neste período.</td></tr>'}</tbody></table></div>
    ${ctExpl('<b>Esforço executado</b> compara as horas já gastas com a estimativa dos tickets no Jira (histórico do projeto inteiro, não só o período) — acima de 100% significa que o projeto já custou mais esforço do que o previsto. <b>Concluído</b> é a % de tickets fechados.')}</div>`:'';
  // 👥 custo por pessoa + custo de gestão
  const pesRows=Object.values(d.porPessoa).sort((a,b)=>b.custo-a.custo).map(U=>{
    const chB=ctCustoBase(U.a); const ch=ctCustoDe(U.a);
    return `<tr class="ct-click" data-ct-drill="a=${escA(encodeURIComponent(U.a))}" role="button" tabindex="0">
      <td>${esc(nomeDe(U.a))} ${U.gestor?'<span class="badge" data-tip="Pessoa listada como gestora — as horas dela compõem o custo de gestão">🧑‍💼 gestão</span>':''}</td>
      <td class="num">${fmtH(U.seg)}</td>
      <td class="num">${ch>0?fmtBRL(ch)+'/h'+(chB>0?'':' <span class="muted small" data-tip="Sem custo próprio — usando o custo padrão do ⚙️">(padrão)</span>'):'<span class="muted" data-tip="Sem custo/h cadastrado nem custo padrão — entra como R$ 0">—</span>'}</td>
      <td class="num"><b>${fmtBRL(U.custo)}</b></td>
      <td class="num">${ctPct(U.custo,d.custoTot)==null?'—':ctPct(U.custo,d.custoTot)+'%'}</td></tr>`;
  }).join('');
  const blocoPes=S.custopes?`<div class="card full"><h2>👥 Custo por pessoa <span>quem carrega o custo da categoria — clique numa linha para os tickets da pessoa</span></h2>
    <div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Pessoa</th><th class="num">Horas</th><th class="num">Custo/h</th><th class="num">Custo no período</th><th class="num">% do custo</th></tr></thead>
    <tbody>${pesRows}</tbody></table></div>
    ${ctExpl(`o <b>custo de gestão</b> (${fmtBRL(d.custoGest)}) soma as horas de quem está na lista de gestores (⚙️ Configurações → Meu Planejamento — gestores). O custo/h de cada pessoa é cadastrado no <b>⚙️ desta tela</b> (gestores); quem não tem, usa o custo padrão${custoPadrao?` (${fmtBRL(custoPadrao)}/h)`:' (não definido)'}.`)}</div>`:'';
  // 🧩 tipo de esforço
  const tiposOrd=Object.entries(d.porTipo).sort((a,b)=>b[1]-a[1]);
  const maxTipo=Math.max(1,...tiposOrd.map(([,s])=>s));
  const blocoTipo=S.esforco?`<div class="card full"><h2>🧩 Tipo de esforço <span>em que TIPO de trabalho as horas foram — clique numa barra para os tickets</span></h2>
    ${tiposOrd.map(([tp,s])=>`<div class="ct-tb ct-click" data-ct-drill="tipo=${escA(encodeURIComponent(tp))}" role="button" tabindex="0" data-tip="${escA(tp+' · '+fmtH(s)+' ('+(ctPct(s,d.segTot)||0)+'% do esforço) — clique para ver os tickets')}">
      <div class="ct-tb-l">${esc(tp)}</div>
      <div class="ct-tb-bar"><i style="width:${(s/maxTipo*100).toFixed(1)}%"></i></div>
      <div class="ct-tb-v">${fmtH(s)} <span class="muted small">(${ctPct(s,d.segTot)||0}%)</span></div></div>`).join('')}
    ${ctExpl('o tipo vem do TICKET no Jira (Tarefa, Bug, Reunião, Sub-tarefa…). Muita hora em <b>Reunião</b> ou em <b>Bug</b> conta uma história diferente de horas em Tarefa — e os tipos definem também o que é faturável.')}</div>`:'';
  // 📈 evolução mensal comparável (receita × custo, % = margem do mês)
  const meses=Object.keys(d.porMes).sort();
  const maxMes=Math.max(0.01,...meses.map(m=>Math.max(d.porMes[m].custo,d.porMes[m].rec)));
  const mesAtual=hojeSP().slice(0,7);
  const colsMes=meses.map(m=>{ const v=d.porMes[m]; const mg2=v.rec-v.custo; const mp3=ctPct(mg2,v.rec);
    const parcial=m===mesAtual;
    const rot=m.slice(5,7)+'/'+m.slice(2,4)+(parcial?'*':'');
    return `<div class="mpg-c mpg-click" data-ct-drill="mes=${escA(m)}" role="button" tabindex="0"
      data-tip="${escA(`${rot}${parcial?' (mês PARCIAL — ainda em andamento)':''} · receita ${fmtBRL(v.rec)} · custo ${fmtBRL(v.custo)} · margem ${mp3==null?'—':mp3+'%'} · ${fmtH(v.seg)} — clique para os tickets do mês`)}">
      <div class="mpg-cb"><i class="plan" style="height:${(v.rec/maxMes*100).toFixed(1)}%"></i><i class="real" style="height:${(v.custo/maxMes*100).toFixed(1)}%"></i></div>
      <div class="mpg-rot"><b>${esc(rot)}</b>${mp3==null?'—':mp3+'%'}</div></div>`; }).join('');
  const blocoEvo=S.evolucao?`<div class="card full"><div class="mpg" role="img" aria-label="Evolução mensal de receita e custo">
    ${mpgCab('📈 Evolução no tempo','receita × custo mês a mês — o número embaixo é a MARGEM do mês; * = mês parcial (em andamento); clique numa coluna para os tickets',
      '<div class="mpg-leg"><span><i class="mpg-sw plan"></i>Receita</span><span><i class="mpg-sw real"></i>Custo</span></div>')}
    <div class="mpg-cols">${colsMes||'<div class="mp-vazio">Sem meses no período.</div>'}</div></div>
    ${ctExpl('compare os meses lado a lado: barras de <b>receita</b> encolhendo ou de <b>custo</b> crescendo mudam a margem — o ideal é a margem estável ou subindo mês a mês.')}</div>`:'';
  // ⏳ execução do esforço (Jira, projeto inteiro)
  const consProjs=S.exec?((ct.proj&&ct.proj.projetos)||[]).filter(x=>Object.keys(d.por).includes(x.key)):[];
  const blocoExec=S.exec?`<div class="card full"><h2>⏳ Execução do esforço <span>estimado × já gasto no Jira — o histórico completo de cada projeto</span></h2>
    ${consProjs.length?`<div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Projeto</th><th class="num">Estimado (Jira)</th><th class="num">Gasto (Jira)</th><th class="num">Esforço executado</th><th class="num">Tickets concluídos</th></tr></thead>
      <tbody>${consProjs.map(x=>{ const ex=Number(x.estH)>0?Math.round(Number(x.gastoH)/Number(x.estH)*100):null;
        const cc=Number(x.total)>0?Math.round(Number(x.concluidos)/Number(x.total)*100):null;
        return `<tr class="ct-click" data-ct-drill="pj=${escA(x.key)}" role="button" tabindex="0"><td>${esc(x.nome||x.key)}</td>
          <td class="num">${Number(x.estH)?Number(x.estH).toLocaleString('pt-BR')+'h':'<span class="muted" data-tip="Tickets sem estimativa no Jira">—</span>'}</td>
          <td class="num">${Number(x.gastoH)?Number(x.gastoH).toLocaleString('pt-BR')+'h':'—'}</td>
          <td class="num">${ex==null?'—':`<span class="ct-sem ${ex>110?'crit':(ex>90?'aten':'ok')}">${ex}%</span>`}</td>
          <td class="num">${cc==null?'—':cc+'% ('+x.concluidos+'/'+x.total+')'}</td></tr>`; }).join('')}</tbody></table></div>`
      :(ct.projB?'<div class="estado">Carregando o consolidado do Jira…</div>':'<div class="mp-dim">Sem dados do Jira para os projetos desta categoria.</div>')}
    ${ctExpl('<b>quanto do projeto já foi executado</b>: horas gastas ÷ estimativa dos tickets (Jira, histórico completo). Verde até 90%, amarelo até 110%, vermelho acima — vermelho significa que o esforço já passou do previsto; combine com a % de tickets concluídos para saber se está perto do fim ou estourando.')}</div>`:'';
  // ⚙️ configuração por categoria (gestor)
  const blocoCfg=gestorEu?`<details class="ct-cfg" ${ct.cfgAberto?'open':''}><summary>⚙️ Configurar os relatórios desta categoria <span class="muted small">(gestores — vale para o time todo)</span></summary>
    <div class="ap-vis" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px">
      ${CT_BLOCOS.map(([k,rot])=>`<label class="check"><input type="checkbox" data-ct-b="${k}" ${S[k]?'checked':''}> ${rot}</label>`).join('')}
    </div>
    <div class="ap-filtros" style="margin-top:8px">
      <div class="campo"><label>Custo/h padrão (R$) <span class="muted small">para quem não tem custo próprio</span></label>
        <input type="number" id="ct-custopadrao" min="0" step="10" value="${escA(custoPadrao?String(custoPadrao):'')}" placeholder="ex.: 120"></div>
    </div>
    <div style="margin-top:8px"><b class="small">Custo/h por pessoa</b> <span class="muted small">(R$/h — quem trabalhou nesta categoria no período; vazio = usa o custo padrão)</span>
      <div class="ap-vis" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
        ${Object.keys(d.porPessoa).sort((a,b)=>nomeDe(a).localeCompare(nomeDe(b),'pt')).map(a=>`<label class="small" style="display:inline-flex;align-items:center;gap:6px">${esc(nomeDe(a).split(' ').slice(0,2).join(' '))}
          <input type="number" data-ct-custo="${escA(a)}" min="0" step="10" style="max-width:96px" placeholder="R$/h" value="${escA(ctCustoBase(a)>0?String(ctCustoBase(a)):'')}"></label>`).join('')}
      </div></div>
    <div class="muted small" style="margin-top:8px">Cada CATEGORIA (ex.: AMS, Tarefas Avulsas) pode mostrar um conjunto diferente de blocos — desligue o que não faz sentido para aquele tipo de projeto. Tudo aqui fica salvo para o time.</div>
  </details>`:'';
  cont.replaceChildren(el(`<div>
    <div class="card full"><h2>🏦 Controladoria de Projetos <span>${esc(fmtBR(ct.de))} → ${esc(fmtBR(ct.ate))} · a saúde financeira de cada categoria, explicada</span></h2>
      ${filtros}
      <div class="ap-vis" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="muted small">Categoria:</span>${chipsCat}</div>
      <details class="ct-cfg"><summary>❓ Como ler este relatório <span class="muted small">(para quem não vive de métricas)</span></summary>
        <div class="muted small" style="margin-top:6px;line-height:1.5">
        • <b>Receita</b> = horas faturáveis × valor-hora do contrato (Admin → Contratos). Sem contrato, não há receita — só custo.<br>
        • <b>Custo</b> = horas apontadas × custo/h de cada pessoa (gestores cadastram no ⚙️ desta tela; sem cadastro vale o custo padrão).<br>
        • <b>Margem</b> = receita − custo. É a "sobra": <b>verde ≥30%</b> · amarelo 10–29% · vermelho &lt;10%.<br>
        • <b>Custo de gestão</b> = a parte do custo feita pelos gestores (lista de gestores nas Configurações).<br>
        • <b>Esforço executado</b> = quanto do previsto (estimativas do Jira) já foi consumido.<br>
        • Tudo é <b>clicável</b>: linhas, barras e colunas abrem os tickets por trás do número — e de lá dá para agir (ficha 🔍, status 🔁, 🛠 Gestão, ➗ Rateio).</div>
      </details>
      ${avisos.length?`<div class="aviso" style="margin-top:8px">${avisos.join('<br>')}</div>`:''}
      ${blocoCfg}
    </div>
    ${kpis?`<div class="card full">${kpis}</div>`:''}
    ${blocoProj}${blocoEvo}${blocoPes}${blocoTipo}${blocoExec}
  </div>`));
}
// 🔎 Drill da controladoria: tickets por trás do número, com AÇÕES.
// qs: '' (tudo) · pj=KEY · mes=YYYY-MM · tipo=NOME · a=accountId
function ctAbreTickets(qs){
  const d=ctDados(); if(!d) return;
  const f=new URLSearchParams(qs||'');
  const pj=f.get('pj')||'', mes=f.get('mes')||'', tipo=f.get('tipo')||'', ac=f.get('a')||'';
  const nomeDe=(a)=>((d.pessoas[a]&&d.pessoas[a].nome)||a);
  const por={};
  d.wl.forEach(w=>{
    if(pj&&w.p!==pj) return;
    if(mes&&(w.d||'').slice(0,7)!==mes) return;
    if(tipo&&(w.t||'—')!==tipo) return;
    if(ac&&w.a!==ac) return;
    const k=w.k||'(sem ticket)';
    const r=por[k]=por[k]||{k,p:w.p,t:w.t||'—',seg:0,custo:0,quem:new Set()};
    r.seg+=Number(w.s)||0; r.custo+=((Number(w.s)||0)/3600)*ctCustoDe(w.a); r.quem.add(w.a);
  });
  const lista=Object.values(por).sort((a,b)=>b.seg-a.seg);
  const keys=lista.map(x=>x.k).filter(k=>/^[A-Z][A-Z0-9_]*-\d+$/.test(k));
  const tit=[pj?projNome(pj):'',mes?('mês '+mes.slice(5,7)+'/'+mes.slice(0,4)):'',tipo,ac?nomeDe(ac):''].filter(Boolean).join(' · ')||'toda a categoria';
  const rows=lista.slice(0,120).map(x=>`<tr>
    <td>${/^[A-Z]/.test(x.k)?`<a href="${jiraBase()}/browse/${encodeURIComponent(x.k)}" target="_blank" rel="noopener"><strong>${esc(x.k)}</strong> ↗</a>`:esc(x.k)}</td>
    <td>${esc((d.resumos[x.k]||'').slice(0,70))}</td><td>${esc(x.t)}</td>
    <td class="num">${fmtH(x.seg)}</td><td class="num">${fmtBRL(x.custo)}</td>
    <td>${esc([...x.quem].map(a=>nomeDe(a).split(' ')[0]).join(', ').slice(0,60))}</td>
    <td>${/^[A-Z]/.test(x.k)?`<button class="btn rt-step" data-gx-det="${escA(x.k)}" data-tip="Ficha completa">🔍</button>
      <button class="btn rt-step" data-gx-st="${escA(x.k)}" data-tip="Alterar o status">🔁</button>`:''}</td></tr>`).join('');
  abreModal(`<h2>🎫 Tickets — ${esc(tit)} <span class="muted small">${lista.length} ticket(s) · ${esc(fmtBR(estado.ctrl.de))} → ${esc(fmtBR(estado.ctrl.ate))}</span></h2>
    <div class="scroll-x" style="max-height:56vh;overflow:auto"><table class="mp-tab-mini"><thead><tr><th>Ticket</th><th>Resumo</th><th>Tipo</th><th class="num">Horas</th><th class="num">Custo</th><th>Quem</th><th></th></tr></thead>
    <tbody>${rows||'<tr><td colspan="7" class="mp-dim">Nada aqui.</td></tr>'}</tbody></table></div>
    ${lista.length>120?`<div class="muted small" style="margin-top:4px">Mostrando os 120 maiores de ${lista.length} tickets — refine pelo drill de um projeto/mês ou abra tudo na Gestão.</div>`:''}
    <div class="alx-modal-acoes">
      ${keys.length?`<button class="btn" data-ct-gestao="${escA(keys.slice(0,200).join(','))}">🛠 Abrir na Gestão (${Math.min(keys.length,200)}${keys.length>200?` de ${keys.length}`:''})</button>
      <button class="btn" data-ct-rateio="${escA(keys.slice(0,100).join(','))}">➗ Enviar para o Rateio${keys.length>100?` (100 de ${keys.length})`:''}</button>`:''}
      <button class="btn" id="gx-fechar">Fechar</button></div>`);
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='controladoria') return;
  const ct=estado.ctrl; const t=e.target; if(!t) return;
  if(t.id==='ct-de'){ if(t.value) ct.de=t.value; renderControladoria(); }
  else if(t.id==='ct-ate'){ if(t.value) ct.ate=t.value; renderControladoria(); }
  else if(t.hasAttribute&&t.hasAttribute('data-ct-b')){
    cfg.ctrl=cfg.ctrl||{custoPadrao:0,cats:{}}; cfg.ctrl.cats=cfg.ctrl.cats||{};
    const atual={...ctBlocosDe(ct.cat)}; atual[t.getAttribute('data-ct-b')]=t.checked?1:0;
    cfg.ctrl.cats[ct.cat]=atual; ct.cfgAberto=true; salvaCfg(); renderControladoria(); }
  else if(t.id==='ct-custopadrao'){ cfg.ctrl=cfg.ctrl||{custoPadrao:0,cats:{}};
    cfg.ctrl.custoPadrao=Math.max(0,Number(t.value)||0); ct.cfgAberto=true; salvaCfg(); renderControladoria(); }
  else if(t.hasAttribute&&t.hasAttribute('data-ct-custo')){
    cfg.custosPessoa=cfg.custosPessoa||{};
    const a=t.getAttribute('data-ct-custo'); const v=Math.max(0,Number(t.value)||0);
    if(v>0) cfg.custosPessoa[a]=v; else delete cfg.custosPessoa[a];
    ct.cfgAberto=true; salvaCfg(); renderControladoria(); }
});
// Enter/Espaço abrem o drill (as linhas anunciam role="button")
document.getElementById('conteudo').addEventListener('keydown',(e)=>{
  if(estado.vista!=='controladoria') return;
  if(e.key!=='Enter'&&e.key!==' ') return;
  const dr=e.target.closest&&e.target.closest('[data-ct-drill]');
  if(dr){ e.preventDefault(); ctAbreTickets(dr.getAttribute('data-ct-drill')); }
});
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='controladoria') return;
  const ct=estado.ctrl;
  const dr=e.target.closest&&e.target.closest('[data-ct-drill]');
  if(dr&&!e.target.closest('button')&&!e.target.closest('a')&&!e.target.closest('input')){
    ctAbreTickets(dr.getAttribute('data-ct-drill')); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-ct-cat')){ ct.cat=t.getAttribute('data-ct-cat'); renderControladoria(); return; }
  if(t.hasAttribute('data-ct-per')){ const p=t.getAttribute('data-ct-per'); const h=hojeSP();
    ct.de=p==='mes'?ctPrimeiroDiaMes(0):p==='3m'?ctPrimeiroDiaMes(-2):p==='6m'?ctPrimeiroDiaMes(-5):h.slice(0,4)+'-01-01';
    ct.ate=h; renderControladoria(); return; }
  if(t.id==='ct-retry'){ ct.tempoErro=''; ct.chaveT=''; renderControladoria(); return; }
});
