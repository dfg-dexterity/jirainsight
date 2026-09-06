// Jira Insights · 14 · 📝 PLANEJAR — criação em lote, 🌳 colar estrutura (Épico → História → Task),
// árvore de decisão "onde crio o ticket", importação CSV/TSV e templates.
// ======================================================================================

// ============================ PLANEJAR (criação em lote) =============================
// Tipos disponíveis conforme o destino: dentro de uma história = sub-tarefas; dentro
// de um épico (ou direto no projeto) = tipos padrão (nível 0, não sub-tarefa).
function tiposDisponiveis(){
  const pl=estado.planejar;
  const proj=(pl.projetos||[]).find(p=>p.key===pl.projeto);
  if(!proj) return [];
  const paiEhHistoria = pl.modo==='epico' && !!pl.historiaKey;
  return proj.tipos.filter(t=> paiEhHistoria ? t.subtarefa : (!t.subtarefa && t.nivel===0));
}
// Ticket-pai efetivo no modo épico: a história (se escolhida) ou o épico.
function paiEfetivo(){
  const pl=estado.planejar;
  if(pl.modo!=='epico') return '';
  return pl.historiaKey || pl.epicoKey || '';
}
// Histórias (abertas) que já pertencem ao épico selecionado.
function historiasDoEpico(){
  const pl=estado.planejar;
  const ep=pl.epicosPorProj[pl.projeto];
  if(!ep||!pl.epicoKey) return [];
  return (ep.historias||[]).filter(h=>h.epico===pl.epicoKey);
}
// Garante que o tipo selecionado é válido para o destino atual.
function ajustaTipo(){
  const pl=estado.planejar; const tipos=tiposDisponiveis();
  if(!tipos.some(t=>t.id===pl.tipoId)) pl.tipoId=(tipos[0]&&tipos[0].id)||'';
}

// Valida um item da revisão ('' = ok).
function validaItemPl(it){
  const r=(it.resumo||'').trim();
  if(!r) return 'Resumo vazio';
  if(r.length>255) return `Resumo com ${r.length} caracteres (máx. 255)`;
  return '';
}

// Texto do formulário -> itens da revisão (uma linha = um ticket; "resumo ; descrição").
function montaItens(){
  const pl=estado.planejar;
  return pl.texto.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{
    const i=l.indexOf(';');
    return {
      resumo:(i>=0?l.slice(0,i):l).trim(),
      descricao:(i>=0?l.slice(i+1):'').trim(),
      tipoId:pl.tipoId, respId:pl.respId,
      paiKey:paiEfetivo(),
    };
  });
}

// ================= 🌳 Colar estrutura (Épico → História → Task) =================
// Cada linha começa com o NÍVEL (Epic/Épico · História/Story · Task/Tarefa/Subtarefa)
// separado do título por TAB (colagem do Excel), ";" ou espaços. A hierarquia vem da
// ordem: histórias entram no último épico acima; tasks na última história acima
// (ou direto no épico, se vierem antes de qualquer história).
const PL_NIVEIS=[
  {n:1, re:/^(?:epics?|[ée]picos?)$/i, rot:'Épico'},
  {n:2, re:/^(?:hist[óo]rias?|stor(?:y|ies)|hist)$/i, rot:'História'},
  {n:3, re:/^(?:tasks?|tarefas?|sub-?tarefas?|sub-?tasks?|atividades?|subs?)$/i, rot:'Task'},
];
function parseEstrutura(text){
  const itens=[];
  let ultEpico=-1, ultHist=-1;
  String(text||'').split('\n').forEach(l0=>{
    const l=l0.replace(/\u00a0/g,' ').trim(); if(!l) return;
    // 1ª coluna = nível; separador: TAB/";" (Excel), 2+ espaços ou o 1º espaço.
    let m=l.match(/^([^\t;]+?)[\t;]\s*(.+)$/) || l.match(/^(\S+)\s{2,}(.+)$/) || l.match(/^(\S+)\s+(.+)$/);
    const chave=(m?m[1]:l).trim();
    const nv=PL_NIVEIS.find(x=>x.re.test(chave));
    if(!nv){
      itens.push({nivel:0,titulo:l.slice(0,255),descricao:'',pai:-1,slot:'',
        erro:'Nível não reconhecido — comece a linha com Épico, História ou Task.'});
      return;
    }
    // Título pode trazer uma 3ª coluna (TAB) = descrição.
    let titulo=(m?m[2]:'').trim(), descricao='';
    const tb=titulo.indexOf('\t');
    if(tb>=0){ descricao=titulo.slice(tb+1).replace(/\t/g,' · ').trim(); titulo=titulo.slice(0,tb).trim(); }
    const i=itens.length;
    const it={nivel:nv.n,titulo,descricao,pai:-1,slot:'',erro:''};
    if(nv.n===1){ it.slot='epico'; ultEpico=i; ultHist=-1; }
    else if(nv.n===2){ it.slot='historia'; it.pai=ultEpico; ultHist=i; }
    else {
      if(ultHist>=0){ it.slot='subtarefa'; it.pai=ultHist; }
      else if(ultEpico>=0){ it.slot='tarefa'; it.pai=ultEpico; }
      else it.erro='Task sem épico ou história acima dela.';
    }
    if(!it.erro && !it.titulo) it.erro='Título vazio.';
    if(!it.erro && it.titulo.length>255) it.erro=`Título com ${it.titulo.length} caracteres (máx. 255).`;
    itens.push(it);
  });
  return itens;
}
// Tipos do projeto por "slot" da estrutura: épico (nível 1), história e tarefa
// (nível 0) e subtarefa (nível -1). Devolve as opções e a seleção efetiva
// (escolha do usuário quando ainda válida; senão, o default resolvido pelo nome).
function slotsEstrutura(){
  const pl=estado.planejar;
  const proj=(pl.projetos||[]).find(p=>p.key===pl.projeto);
  const tipos=(proj&&proj.tipos)||[];
  const nv0=tipos.filter(t=>!t.subtarefa&&t.nivel===0);
  const sub=tipos.filter(t=>t.subtarefa);
  const opts={ epico:tipos.filter(t=>t.nivel===1), historia:nv0, tarefa:nv0, subtarefa:sub };
  const semNF=nv0.filter(t=>!/fatur/i.test(t.nome));
  const def={
    epico:((opts.epico[0]||{}).id)||'',
    historia:(((nv0.find(t=>/hist[óo]ria|story/i.test(t.nome))||semNF[0]||nv0[0])||{}).id)||'',
    tarefa:(((semNF.find(t=>/^(tarefa|task)$/i.test(t.nome))||semNF.find(t=>/tarefa|task/i.test(t.nome))||semNF[0]||nv0[0])||{}).id)||'',
    subtarefa:(((sub.find(t=>/sub/i.test(t.nome))||sub[0])||{}).id)||'',
  };
  const sel={};
  for(const s of ['epico','historia','tarefa','subtarefa']){
    sel[s]=opts[s].some(t=>t.id===pl.tiposSlot[s])?pl.tiposSlot[s]:def[s];
  }
  return {opts, sel};
}
const PL_SLOT_ROT={epico:'Épicos',historia:'Histórias',tarefa:'Tasks direto no épico',subtarefa:'Tasks (sub-tarefas da história)'};
// Remove um item da estrutura junto com TODOS os descendentes, remapeando os pais.
function estruRemove(i){
  const pl=estado.planejar; const its=pl.estru||[];
  const kill=new Set([i]); let mudou=true;
  while(mudou){ mudou=false;
    its.forEach((it,j)=>{ if(!kill.has(j)&&it.pai>=0&&kill.has(it.pai)){ kill.add(j); mudou=true; } }); }
  const mapa=new Map(); const novo=[];
  its.forEach((it,j)=>{ if(kill.has(j)) return; mapa.set(j,novo.length); novo.push(it); });
  novo.forEach(it=>{ it.pai=it.pai>=0?(mapa.has(it.pai)?mapa.get(it.pai):-1):-1; });
  pl.estru=novo.length?novo:null;
}

function renderPlanejar(){
  const cont=document.getElementById('conteudo');
  const pl=estado.planejar;

  // Projetos (com tipos) carregam uma vez.
  if(!pl.projetos){
    if(pl.projetosErro){
      cont.replaceChildren(el(`<div class="erro"><strong>Falha ao carregar os projetos.</strong> ${esc(pl.projetosErro)}
        <button class="btn" id="pl-tentar" style="margin-left:10px">Tentar de novo</button></div>`));
      return;
    }
    if(!pl.carregandoProjetos){
      pl.carregandoProjetos=true;
      fetch('/api/projetos').then(r=>r.json()).then(j=>{
        pl.carregandoProjetos=false;
        if(j.erro) pl.projetosErro=j.erro; else pl.projetos=j.projetos||[];
        if(estado.vista==='planejar') renderPlanejar();
      }).catch(e=>{ pl.carregandoProjetos=false; pl.projetosErro=String(e.message||e);
        if(estado.vista==='planejar') renderPlanejar(); });
    }
    cont.replaceChildren(el('<div class="estado">Carregando projetos do Jira…</div>'));
    return;
  }

  if(pl.resultados) return renderPlanejarResultado();
  if(pl.estru) return renderPlanejarEstru();
  if(pl.itens) return renderPlanejarRevisao();
  renderPlanejarForm();
}

// ================= 🌳 ÁRVORE DE DECISÃO: onde abrir o ticket? =================
// Guia de governança (TI-04-006): perguntas encadeadas até a recomendação — e,
// quando a recomendação é abrir um ticket, o ÚLTIMO PASSO cria o ticket ali mesmo.
// Folhas "sap_fale_gp" NÃO criam ticket (a regra é justamente não criar paralelo).
const ARV_NOS={
  start:{ q:'A atividade pertence claramente a um cliente, contrato ou iniciativa já existente?',
    helper:'Se já existe um projeto, contrato ou frente formal, o ticket deve nascer lá.',
    op:[ {label:'Sim', next:'tipoProjeto', tone:'teal'}, {label:'Não', next:'adminOuAvulsa', tone:'grafite'},
      {label:'Estou em dúvida', next:'duvida_apoio', tone:'orange', desc:'Sem certeza de onde encaixar? Responda mais 2–3 perguntas rápidas.'} ] },
  duvida_apoio:{ q:'Sua tarefa é de apoio ou acompanhamento com alguma pessoa?',
    helper:'Se você está apoiando ou acompanhando alguém que atua num cliente, contrato ou iniciativa, o registro segue o mesmo caminho dessa frente.',
    op:[ {label:'Sim', next:'tipoProjeto', tone:'teal', desc:'Apoio/acompanhamento de alguém numa frente existente — o ticket nasce no contexto dessa frente.'},
      {label:'Não', next:'duvida_estudo', tone:'grafite'} ] },
  duvida_estudo:{ q:'Você está estudando ou se capacitando?',
    helper:'Estudos, treinamentos e certificações têm caminho próprio.',
    op:[ {label:'Sim', next:'duvida_doc', tone:'purple', desc:'Cursos, certificações, estudo de ferramenta/tecnologia.'},
      {label:'Não', next:'adminOuAvulsa', tone:'grafite', desc:'Sem frente, sem apoio a alguém e sem estudo — trate como demanda administrativa/avulsa.'} ] },
  duvida_doc:{ q:'Você está gerando algum manual ou documentação que será reaproveitado por outras pessoas?',
    helper:'Conteúdo reutilizável (manuais, guias, materiais de treinamento) vira um ativo da Dexterity University.',
    op:[ {label:'Sim, vou gerar material reaproveitável', next:'duvida_du', tone:'teal', desc:'Manual, guia, documentação ou treinamento que outras pessoas vão usar.'},
      {label:'Não, é estudo individual', next:'dept_pessoas', tone:'grafite', desc:'Capacitação pessoal sem material reutilizável — tarefa avulsa em Pessoas & Cultura.'} ] },
  duvida_du:{ result:true, tone:'teal', badge:'Dexterity University', title:'Crie a atividade no projeto Dexterity University', cria:true, filtro:'', soProjeto:'DU',
    text:'Estudo/capacitação que gera manual, documentação ou material reaproveitável por outras pessoas nasce no projeto Dexterity University.',
    bullets:['O projeto é fixo: DU (Dexterity University).',
      'Descreva no ticket qual material será produzido e onde ele ficará disponível.',
      'O material gerado vira ativo da empresa — vincule o link na descrição/comentários.'] },
  ausencia:{ result:true, tone:'orange', badge:'Ausência', title:'Registrar ausência — pedido no Odoo', cria:false, ausencia:true,
    text:'Ausências não viram ticket no Jira: o pedido é registrado no Odoo (Time Off) e segue para aprovação. Escolha o tipo:',
    bullets:['O pedido é criado em SEU nome (use a identificação do painel).',
      'Depois de aprovado no Odoo, o painel cria automaticamente o ticket de folga no Jira e registra as horas (sincronização diária).',
      'Para atestado, anexe o documento no próprio pedido dentro do Odoo.'] },
  tipoProjeto:{ q:'Qual é o contexto principal da atividade?', helper:'Escolha a natureza do vínculo da atividade.',
    op:[ {label:'Projeto AMS', next:'ams_parceria', tone:'teal'}, {label:'Projeto SAP', next:'sap_entregavel', tone:'purple'},
      {label:'Projeto Interno', next:'interno', tone:'moss'}, {label:'Nenhum destes', next:'adminOuAvulsa', tone:'grafite'} ] },
  ams_parceria:{ q:'O AMS é por parceria?',
    helper:'Atendimentos AMS executados por meio de uma consultoria PARCEIRA têm projeto próprio (DAMS | Consultorias Parceiras). AMS direto com o cliente segue no projeto do cliente.',
    op:[ {label:'Sim, é via consultoria parceira', next:'ams_dams', tone:'teal'},
      {label:'Não, é AMS direto com o cliente', next:'ams_natureza', tone:'grafite'} ] },
  ams_natureza:{ q:'É uma reunião de alinhamento ou uma atividade administrativa?',
    helper:'Reuniões de alinhamento e atividades administrativas do AMS não consomem o pacote do contrato — o ticket nasce no projeto AMS do cliente, mas com o TIPO "não faturável". Atendimentos normais do contrato seguem faturáveis.',
    op:[ {label:'Não — é atendimento do contrato', next:'ams', tone:'teal', desc:'Incidente, atendimento recorrente, pequena melhoria ou suporte — consome o pacote (faturável).'},
      {label:'Reunião de alinhamento', next:'ams_reuniao', tone:'orange', desc:'Alinhamento com o cliente ou interno sobre o contrato — vira REUNIÃO NÃO FATURÁVEL.'},
      {label:'Atividade administrativa', next:'ams_admin', tone:'orange', desc:'Gestão do contrato, relatórios, organização interna — vira TAREFA NÃO FATURÁVEL.'} ] },
  ams_reuniao:{ result:true, tone:'orange', badge:'AMS — Reunião não faturável', title:'Abrir no projeto AMS do cliente como REUNIÃO NÃO FATURÁVEL', cria:true, filtro:'ams', tipoNaoFat:'reuniao',
    text:'Reuniões de alinhamento do AMS são registradas no projeto AMS do cliente com o tipo "Reunião não faturável" — ficam fora da apuração do pacote (a apuração usa o TIPO do chamado como fonte de verdade).',
    bullets:['O tipo do ticket já vem selecionado como o de REUNIÃO NÃO FATURÁVEL do projeto (ajuste se o projeto usar outro nome).',
      'Só as horas de tipos faturáveis consomem o pacote/excedente do contrato.',
      'Descreva no resumo o assunto do alinhamento e quem participou.'] },
  ams_admin:{ result:true, tone:'orange', badge:'AMS — Tarefa não faturável', title:'Abrir no projeto AMS do cliente como TAREFA NÃO FATURÁVEL', cria:true, filtro:'ams', tipoNaoFat:'tarefa',
    text:'Atividades administrativas do AMS (gestão do contrato, relatórios, organização interna) são registradas no projeto AMS do cliente com o tipo "Tarefa não faturável" — fora da apuração do pacote.',
    bullets:['O tipo do ticket já vem selecionado como o de TAREFA NÃO FATURÁVEL do projeto (ajuste se o projeto usar outro nome).',
      'Só as horas de tipos faturáveis consomem o pacote/excedente do contrato.',
      'Se a atividade não é de um contrato AMS específico, volte e use "Nenhum destes" → tarefa administrativa (TAD).'] },
  ams_dams:{ result:true, tone:'teal', badge:'AMS — Parceria', title:'Abrir no projeto DCP | Consultorias Parceiras', cria:true, filtro:'ams', soProjeto:'DCP', camposAms:true,
    text:'Atendimentos AMS feitos por meio de consultorias parceiras nascem SEMPRE no projeto DCP (DAMS | Consultorias Parceiras).',
    bullets:['O projeto é fixo: DCP (único permitido neste caminho).',
      'Informe a CONSULTORIA parceira e o CLIENTE — vão no campo "AMS | Consultoria > Cliente" do ticket (obrigatórios).',
      'Os demais campos funcionam como no AMS direto.'] },
  sap_entregavel:{ q:'A atividade ajuda na entrega de algum entregável do projeto SAP?',
    helper:'Entregável é qualquer item formal que será entregue ao cliente ou usado para cumprir o escopo: configuração, especificação, teste, documento, desenvolvimento, migração, integração, treinamento, validação ou gestão da entrega.',
    op:[ {label:'Sim, ajuda em um entregável', next:'sap_planejado', tone:'purple'}, {label:'Não ou não está claro', next:'sap_alinhamento', tone:'grafite'} ] },
  sap_alinhamento:{ q:'É uma tarefa de alinhamento que não está relacionada a nenhum entregável?',
    helper:'Alinhamentos, reuniões de acompanhamento, status e atividades de gestão do projeto não produzem um entregável específico — e são registrados no épico de GESTÃO do projeto.',
    op:[ {label:'Sim, é alinhamento/gestão', next:'sap_gestao', tone:'purple'},
      {label:'Não', next:'sap_fale_gp', tone:'grafite'} ] },
  sap_gestao:{ result:true, tone:'purple', badge:'Projeto SAP — Gestão', title:'Crie o ticket no épico de Gestão do projeto', cria:true, filtro:'sap', epico:true,
    text:'Tarefas de alinhamento e gestão que não estão ligadas a nenhum entregável nascem DENTRO do épico de Gestão do projeto em questão.',
    bullets:['Alinhamentos, reuniões de acompanhamento, status report e gestão do projeto.',
      'Escolha o projeto e o épico de Gestão — o ticket é criado dentro dele.',
      'Se o projeto não tiver épico de Gestão, fale com o gerente do projeto.'] },
  sap_planejado:{ q:'Esse entregável não foi planejado?',
    helper:'Se o entregável já estava planejado, a atividade deve ser tratada dentro da estrutura/ticket já existente. Se não estava planejado, precisa ser vinculada ao ticket responsável ou criada sob orientação do responsável.',
    op:[ {label:'Sim, não foi planejado', next:'sap_ticket_responsavel', tone:'purple'}, {label:'Não, já estava planejado', next:'sap_planejados', tone:'grafite'} ] },
  sap_planejados:{ result:true, tone:'purple', badge:'Projeto SAP — planejado', title:'Aponte no ticket que JÁ FOI planejado', cria:false, planejados:true, escolheProjeto:true, filtro:'cat', catRe:/delivery/i, catNome:'Delivery',
    text:'O entregável já estava planejado — não crie ticket paralelo. Escolha o projeto SAP (categoria Delivery, em aberto) e localize o ÉPICO (nível 1) e a HISTÓRIA (nível 2) planejados para apontar no lugar certo.',
    bullets:['Aponte as horas direto na história planejada (ou nas sub-tarefas dela) — não abra tarefa administrativa ou avulsa.',
      'Não achou o épico/história do seu trabalho? Fale com o gerente do projeto ANTES de criar qualquer coisa.',
      'Precisa detalhar? Combine com o GP a criação de sub-tarefas dentro da história planejada.'] },
  adminOuAvulsa:{ q:'A atividade existe para manter a empresa funcionando no dia a dia?',
    helper:'Se for rotina operacional recorrente, é administrativa. Se for uma demanda pontual e excepcional, é avulsa. Ausências (folga, atestado, férias) não viram ticket — são registradas no Odoo.',
    op:[ {label:'Sim, é manutenção operacional/recorrente', next:'adm_freq', tone:'orange'}, {label:'Não, é algo pontual/ad hoc', next:'departamento', tone:'grafite'},
      {label:'Quero registrar uma AUSÊNCIA', next:'ausencia', tone:'teal', desc:'Compensação de horas, atestado médico ou férias — o pedido vai para o Odoo, não vira ticket.'} ] },
  adm_freq:{ q:'Isso se repete com que frequência?',
    helper:'A frequência da rotina define o tipo do ticket — ele já vem pré-selecionado na tela de criação.',
    op:[ {label:'Diariamente', next:'adm_primeira', tone:'orange', set:{freqAdm:'diária'}, desc:'Rotina executada todo dia útil (ex.: conferências diárias, monitoramentos).'},
      {label:'Semanalmente', next:'adm_primeira', tone:'teal', set:{freqAdm:'semanal'}, desc:'Rotina executada 1× por semana (ex.: fechamentos semanais, relatórios).'},
      {label:'Mensalmente', next:'adm_primeira', tone:'purple', set:{freqAdm:'mensal'}, desc:'Rotina executada 1× por mês (ex.: faturamento, folha, apurações mensais).'} ] },
  adm_primeira:{ q:'É a primeira vez que você está fazendo esta atividade?',
    helper:'Rotinas recorrentes reutilizam o ticket: o anterior precisa ser finalizado antes de criar o próximo.',
    op:[ {label:'Sim, é a primeira vez', next:'administrativa', tone:'orange'},
      {label:'Não, já fiz antes', next:'adm_repetida', tone:'grafite'} ] },
  adm_repetida:{ result:true, tone:'grafite', badge:'Tarefa Administrativa', title:'Finalize o ticket anterior antes de criar outro', cria:false,
    text:'Você provavelmente não finalizou o ticket anterior desta rotina — e ele é necessário para poder criar o próximo.',
    bullets:['Localize o ticket da rotina (aba Gestão de Tickets ou Apontar) e conclua-o.',
      'Rotinas recorrentes não devem acumular tickets abertos em paralelo.',
      'Depois de concluir o anterior, volte aqui e crie o novo pela árvore.'] },
  departamento:{ q:'Qual departamento é o dono da demanda avulsa?', helper:'Abra o ticket como tarefa avulsa no departamento responsável — as descrições ajudam a escolher.',
    op:[ {label:'Comercial & Relacionamento', next:'dept_comercial', tone:'teal', desc:'Propostas e materiais comerciais, contato com clientes/parceiros, follow-ups de venda e relacionamento.'},
      {label:'Projetos & Entregas', next:'dept_projetos', tone:'purple', desc:'Operação de delivery: ritos, formatos de entrega, apoio operacional a projetos sem projeto formal.'},
      {label:'Financeiro', next:'dept_financeiro', tone:'moss', desc:'Faturamento, pagamentos, cobranças, análises e levantamentos financeiros pontuais.'},
      {label:'Pessoas & Cultura', next:'dept_pessoas', tone:'orange', desc:'Onboarding, comunicação interna, treinamentos, clima e dinâmicas de equipe.'},
      {label:'Administrativo & Compliance', next:'dept_admin', tone:'grafite', desc:'Documentos, contratos, cadastros, acessos e demandas de conformidade.'},
      {label:'Inovação & Melhoria', next:'dept_inovacao', tone:'teal', desc:'Provas de conceito, automações e experimentos de melhoria que ainda não viraram projeto.'},
      {label:'Governança & Estratégia', next:'dept_governanca', tone:'purple', desc:'Indicadores, análises executivas, definição de regras e direcionamento estratégico.'} ] },
  ams:{ result:true, tone:'teal', badge:'Projeto AMS', title:'Abrir no projeto AMS do cliente', cria:true, filtro:'ams',
    text:'Use o projeto AMS quando a atividade fizer parte da sustentação, suporte recorrente, pequenas melhorias ou operação contínua de um contrato AMS.',
    bullets:['Incidente, atendimento recorrente, pequena melhoria, suporte funcional ou técnico.',
      'Se existe cliente e contrato AMS ativo, não abra como administrativo nem avulso.',
      'O ticket deve refletir o cliente e a frente correta de atendimento.'] },
  sap_fale_gp:{ result:true, tone:'grafite', badge:'Projeto SAP', title:'Fale com o gerente de projeto', cria:false,
    text:'Não crie um ticket paralelo quando a atividade não estiver claramente ligada a um entregável ou quando o entregável já estava planejado e você não sabe qual ticket usar.',
    bullets:['O gerente de projeto deve indicar o ticket correto para apontamento.',
      'Evite duplicar tickets de entregáveis já planejados.',
      'Se for necessário novo ticket, ele deve manter vínculo com o escopo, fase e entregável correto.'] },
  sap_ticket_responsavel:{ result:true, tone:'purple', badge:'Projeto SAP', title:'Coloque no ticket responsável', cria:true, filtro:'', subtarefa:true,
    text:'Quando a atividade ajuda em um entregável que não foi planejado, ela deve ser registrada no ticket responsável pelo entregável ou criada como SUBTAREFA vinculada a ele.',
    bullets:['Não abrir como tarefa administrativa ou avulsa.',
      'Vincular ao entregável, fase ou frente correta do projeto SAP.',
      'Se o ticket responsável ainda não existir, alinhar com o gerente de projeto para criar com a estrutura correta.'] },
  interno:{ q:'Qual é a natureza do trabalho interno?',
    helper:'Cada frente interna tem os seus próprios projetos no Jira — escolha a que descreve melhor a atividade.',
    op:[ {label:'Melhorias Internas', next:'interno_imi', tone:'moss'},
      {label:'Produtos e aceleradores Dexterity', next:'interno_ipa', tone:'teal'},
      {label:'Tarefas, Processos e Rotinas', next:'interno_itpr', tone:'purple'} ] },
  interno_imi:{ result:true, tone:'moss', badge:'Melhorias Internas', title:'Escolha o projeto de melhoria interna', cria:true,
    filtro:'cat', catRe:/^\s*IMI\b|melhorias\s+internas/i, catNome:'IMI | Interno - Melhorias Internas', escolheProjeto:true,
    text:'Iniciativas de evolução da própria Dexterity: melhorar processos, ferramentas e formas de trabalhar.',
    bullets:['Implantação do Odoo, revisão de processo, construção de playbooks.',
      'Precisa ter dono, objetivo e entregável claro.',
      'Escolha o projeto abaixo pelo nome e pela descrição do objetivo.'] },
  interno_ipa:{ result:true, tone:'teal', badge:'Produtos e aceleradores', title:'Escolha o projeto de produto ou acelerador', cria:true,
    filtro:'cat', catRe:/^\s*IPA\b|produtos\s+e\s+aceleradores/i, catNome:'IPA | Interno - Produtos e aceleradores Dexterity', escolheProjeto:true,
    text:'Construção de produtos próprios e aceleradores reutilizáveis da Dexterity.',
    bullets:['Aceleradores SAP, componentes reutilizáveis, produtos internos.',
      'O resultado é um ativo da empresa, não uma entrega para um cliente específico.',
      'Escolha o projeto abaixo pelo nome e pela descrição do objetivo.'] },
  interno_itpr:{ result:true, tone:'purple', badge:'Tarefas, Processos e Rotinas', title:'Escolha o projeto de tarefas, processos e rotinas', cria:true,
    filtro:'cat', catRe:/^\s*ITPR\b|tarefas.{0,3}\s*processos\s+e\s+rotinas/i, catNome:'ITPR | Interno - Tarefas, Processos e Rotinas', escolheProjeto:true,
    text:'Trabalho interno estruturado em processos e rotinas contínuas que têm projeto próprio no Jira.',
    bullets:['Rotinas internas organizadas em projeto próprio (diferente das tarefas avulsas do TAD).',
      'Escolha o projeto abaixo pelo nome e pela descrição do objetivo.'] },
  administrativa:{ result:true, tone:'orange', badge:'Tarefa Administrativa', title:'Abrir como tarefa administrativa', cria:true, filtro:'avulsa', tipoPorFreq:true,
    text:'Use essa categoria para o trabalho recorrente e operacional que sustenta a empresa.',
    bullets:['Rotinas financeiras, cadastros, controles obrigatórios, acessos, contratos, pagamentos e agenda operacional.',
      'A lógica é sustentação da operação da empresa, não transformação.',
      'Se a atividade se repete ou faz parte do funcionamento normal da empresa, tende a ser administrativa.'] },
  dept_comercial:{ result:true, tone:'teal', badge:'Tarefa Avulsa', title:'Abrir como tarefa avulsa — Comercial & Relacionamento', cria:true, filtro:'avulsa', depto:'Comercial & Relacionamento',
    text:'Use quando a demanda for pontual e o dono natural for a área comercial ou de relacionamento.',
    bullets:['Material comercial específico, follow-up especial, contato com parceiro, apoio a proposta pontual.'] },
  dept_projetos:{ result:true, tone:'purple', badge:'Tarefa Avulsa', title:'Abrir como tarefa avulsa — Projetos & Entregas', cria:true, filtro:'avulsa', depto:'Projetos & Entregas',
    text:'Use quando a demanda for pontual e ligada à operação de delivery, mas sem pertencer a um projeto formal.',
    bullets:['Apoio operacional isolado, ajuste de rito, revisão pontual de formato de entrega.'] },
  dept_financeiro:{ result:true, tone:'moss', badge:'Tarefa Avulsa', title:'Abrir como tarefa avulsa — Financeiro', cria:true, filtro:'avulsa', depto:'Financeiro',
    text:'Use quando a demanda financeira for pontual, específica e fora da rotina padrão.',
    bullets:['Análise extraordinária, levantamento especial, ajuste não recorrente.'] },
  dept_pessoas:{ result:true, tone:'orange', badge:'Tarefa Avulsa', title:'Abrir como tarefa avulsa — Pessoas & Cultura', cria:true, filtro:'avulsa', depto:'Pessoas & Cultura',
    text:'Use quando a demanda for pontual e ligada a pessoas, cultura ou desenvolvimento interno.',
    bullets:['Ação específica de onboarding, comunicação interna isolada, dinâmica pontual de equipe.'] },
  dept_admin:{ result:true, tone:'grafite', badge:'Tarefa Avulsa', title:'Abrir como tarefa avulsa — Administrativo & Compliance', cria:true, filtro:'avulsa', depto:'Administrativo & Compliance',
    text:'Use quando a demanda for pontual em temas administrativos, contratuais ou de conformidade, sem virar rotina operacional.',
    bullets:['Solicitação específica de documento, revisão pontual de cláusula, demanda eventual de compliance.'] },
  dept_inovacao:{ result:true, tone:'teal', badge:'Tarefa Avulsa', title:'Abrir como tarefa avulsa — Inovação & Melhoria', cria:true, filtro:'avulsa', depto:'Inovação & Melhoria',
    text:'Use quando for uma melhoria ou experimento pequeno que ainda não virou projeto interno.',
    bullets:['Teste de automação, prova de conceito, ideia de melhoria ainda exploratória.'] },
  dept_governanca:{ result:true, tone:'purple', badge:'Tarefa Avulsa', title:'Abrir como tarefa avulsa — Governança & Estratégia', cria:true, filtro:'avulsa', depto:'Governança & Estratégia',
    text:'Use quando a demanda for pontual e ligada a gestão, estrutura, indicadores, decisões ou direcionamento estratégico.',
    bullets:['Análise executiva específica, definição pontual de regra, estudo isolado de estrutura.'] },
};
const ARV_DEFS=[
  ['Projetos AMS','Atividades executadas dentro de um contrato recorrente de suporte, sustentação, pequenas melhorias ou atendimento contínuo a cliente.'],
  ['Projetos SAP','Atividades vinculadas a entregáveis formais de cliente. Exigem validação do entregável e do planejamento antes de decidir o ticket.'],
  ['Projetos Internos','Iniciativas estruturadas da própria Dexterity com objetivo, dono, entregáveis e continuidade.'],
  ['Tarefa Administrativa','Trabalho recorrente e operacional para manter a empresa funcionando. Sustenta a operação, não transforma a empresa.'],
  ['Tarefa Avulsa','Demanda pontual, ad hoc, não recorrente e que não pertence a um projeto já existente. Classificada pelo departamento dono da necessidade.'],
];
function arvEstado(){ const pl=estado.planejar;
  if(!pl.arv) pl.arv={ no:'start', hist:[], form:{projeto:'',tipoId:'',resumo:'',descricao:'',respId:null,venc:'',paiKey:'',epicoKey:'',depto:null,freqAdm:'',amsConsId:'',amsCliId:''}, criando:false, feito:null, erro:'' };
  return pl.arv; }
// Sugestão de projeto conforme a folha: AMS (categoria), categoria específica (catRe),
// interno genérico ou tarefas avulsas/ADM.
function arvProjetosSugeridos(filtro, catRe){
  const ps=(_projetosCache||[]);
  const m=(p)=>`${p.key} ${p.nome||''} ${p.categoria||''}`;
  if(filtro==='ams') return ps.filter(p=>ehCategoriaAMS(p.categoria));
  if(filtro==='sap') return ps.filter(p=>/\bsap\b/i.test(m(p)) && !ehCategoriaAMS(p.categoria));
  if(filtro==='cat') return ps.filter(p=>catRe && catRe.test(p.categoria||'') && p.key!=='TAD');
  if(filtro==='interno') return ps.filter(p=>/intern/i.test(m(p)) && !/avuls|tad/i.test(m(p)));
  if(filtro==='avulsa') return ps.filter(p=>/avuls|(^|\s)adm|tad/i.test(m(p)));
  return [];
}

// A árvore vive na vista 'ondecrio' E embutida na home (#arv-home) — arvHTML monta
// o miolo (MESMO estado nos dois lugares) e arvRender re-renderiza onde ela estiver.
function arvRender(){
  if(estado.vista==='ondecrio') return renderOndeCrio();
  const c=document.getElementById('arv-home'); if(c) c.innerHTML=arvHTML();
}
function arvHTML(){
  const a=arvEstado(); const id=idApontar();
  // Catálogo de projetos (para as sugestões e o formulário do último passo).
  if(!_projetosCache){
    garanteProjetos().then(()=>{ arvRender(); }).catch(()=>{});
  }
  const no=ARV_NOS[a.no]||ARV_NOS.start;
  // Breadcrumbs clicáveis: cada passo volta para a PERGUNTA daquele ponto.
  const atualRot=no.result?`📌 ${no.badge}`:`❓ pergunta ${a.hist.length+1}`;
  const trilha=a.hist.length?`<div class="arv-trilha">
      <button class="arv-bc" data-arv-bc="-1" data-tip="Voltar ao início (mantém o que você já digitou)">🏠 Início</button>
      ${a.hist.map((h,i)=>`<span class="arv-sep">→</span><button class="arv-bc" data-arv-bc="${i}" data-tip="Voltar para esta etapa">${esc(h.label)}</button>`).join('')}
      <span class="arv-sep">→</span><strong class="arv-atual">${esc(atualRot)}</strong>
    </div>`:'';
  const defs=`<details class="arv-defs"><summary>📖 Conceitos-chave</summary>
      ${ARV_DEFS.map(([t2,x])=>`<div class="arv-def"><strong>${esc(t2)}</strong><div class="muted small">${esc(x)}</div></div>`).join('')}</details>`;
  let corpo='';
  if(a.feito){
    const url=`${jiraBase()}/browse/${encodeURIComponent(a.feito.key)}`;
    corpo=`<div class="pl-res-ok">✓ Ticket criado: <a href="${url}" target="_blank" rel="noopener">${esc(a.feito.key)} ↗</a> — ${esc(a.feito.resumo)}</div>
      <div style="display:flex;gap:10px;margin-top:14px"><button class="btn primario" data-arv-reiniciar="1">🌳 Classificar outra atividade</button></div>`;
  } else if(no.result && no.planejados){
    // 🧭 SAP já planejado: NÃO cria ticket — escolha o projeto (categoria Delivery,
    // em aberto) e veja os ÉPICOS (nível 1) com as HISTÓRIAS (nível 2) planejadas,
    // com link ao Jira, para apontar no ticket certo.
    const f=a.form;
    const sug=arvProjetosSugeridos('cat', no.catRe);
    let corpoP;
    if(!_projetosCache){ corpoP='<div class="muted" style="margin-top:8px">Carregando projetos…</div>'; }
    else if(!f.projeto){
      corpoP=sug.length?`<div class="sec" style="margin:12px 0 6px">Escolha o projeto <span class="muted">— categoria ${esc(no.catNome||'')}, em aberto</span></div>
        <div class="arv-projs">${sug.map(p=>`<button class="arv-pcard t-${escA(no.tone)}" data-arv-proj="${escA(p.key)}">
            <span class="arv-pcard-t">${esc(p.nome||p.key)} <span class="arv-pcard-k">${esc(p.key)}</span></span>
            <span class="arv-pcard-d">${esc(p.descricao||'Sem descrição do objetivo cadastrada no Jira.')}</span>
          </button>`).join('')}</div>`
        :`<div class="ap-fb err" style="margin-top:8px">Nenhum projeto encontrado na categoria “${esc(no.catNome||'')}”. Confira a categoria dos projetos no Jira.</div>`;
    } else {
      const pl2=estado.planejar;
      const ep=pl2.epicosPorProj[f.projeto];
      if(!ep && !pl2.carregandoEpicos){
        pl2.carregandoEpicos=true;
        fetch(`/api/projetos?epicos=${encodeURIComponent(f.projeto)}`).then(r=>r.json()).then(j=>{
          pl2.carregandoEpicos=false;
          pl2.epicosPorProj[f.projeto]=j.erro?{epicos:[],historias:[],erro:j.erro}:j;
          arvRender();
        }).catch(e2=>{ pl2.carregandoEpicos=false;
          pl2.epicosPorProj[f.projeto]={epicos:[],historias:[],erro:String(e2.message||e2)};
          arvRender(); });
      }
      const proj=(_projetosCache||[]).find(p=>p.key===f.projeto);
      const cab=`<div class="campo" style="margin-top:10px"><label>Projeto</label>
        <div class="arv-proj-fixo"><span><strong>${esc(f.projeto)}</strong> — ${esc((proj&&proj.nome)||'')}</span>
          <button class="btn arv-troca" data-arv-trocaproj="1" data-tip="Voltar à lista de projetos da categoria">trocar</button></div>
        ${proj&&proj.descricao?`<div class="muted small" style="margin-top:4px">${esc(proj.descricao)}</div>`:''}</div>`;
      if(!ep) corpoP=cab+'<div class="muted small" style="margin-top:8px">Carregando os épicos e histórias planejados…</div>';
      else if(ep.erro) corpoP=cab+`<div class="ap-fb err" style="margin-top:8px">${esc(ep.erro)}</div>`;
      else {
        const hs=ep.historias||[]; const eps=ep.epicos||[];
        const soltas=hs.filter(h=>!h.epico||!eps.some(e2=>e2.k===h.epico));
        const linkK=(x)=>`<a href="${jiraBase()}/browse/${encodeURIComponent(x.k)}" target="_blank" rel="noopener"><strong>${esc(x.k)}</strong> ↗</a>`;
        const hRow=(h)=>`<div class="arv-pl-h">${linkK(h)} <span class="hxd-tit" title="${escA(h.resumo)}">${esc(h.resumo)}</span> <span class="badge">${esc(h.status)}</span></div>`;
        const blocosEp=eps.map(e2=>{ const minhas=hs.filter(h=>h.epico===e2.k);
          return `<details class="arv-pl-ep" open>
            <summary>${linkK(e2)} <span class="arv-pl-t" title="${escA(e2.resumo)}">${esc(e2.resumo)}</span>
              <span class="badge">${esc(e2.status)}</span><span class="muted small">${minhas.length} história(s)</span></summary>
            ${minhas.length?minhas.map(hRow).join(''):'<div class="muted small" style="padding:4px 0 4px 10px">Sem histórias abertas neste épico.</div>'}
          </details>`; }).join('');
        corpoP=cab+`<div class="sec" style="margin:12px 0 6px">Épicos e histórias planejados <span class="muted">— em aberto · nível 1 e 2</span></div>
          ${(eps.length||soltas.length)
            ?blocosEp+(soltas.length?`<details class="arv-pl-ep" open><summary><span class="arv-pl-t">Histórias sem épico</span><span class="muted small">${soltas.length}</span></summary>${soltas.map(hRow).join('')}</details>`:'')
            :'<div class="muted small">Nenhum épico ou história em aberto neste projeto — fale com o gerente do projeto.</div>'}`;
      }
    }
    corpo=`${trilha}
      <span class="arv-badge t-${escA(no.tone)}">${esc(no.badge)}</span>
      <h3 class="arv-titulo">${esc(no.title)}</h3>
      <div class="muted" style="margin:4px 0 8px">${esc(no.text)}</div>
      <ul class="qa-probs">${no.bullets.map(b2=>`<li>${esc(b2)}</li>`).join('')}</ul>
      ${corpoP}
      <div style="display:flex;gap:10px;margin-top:14px">
        <button class="btn" data-arv-voltar="1">← Voltar</button>
        <button class="btn" data-arv-reiniciar="1">Reiniciar</button></div>`;
  } else if(no.result){
    const podeCriar=!!no.cria;
    let form='';
    if(podeCriar){
      const f=a.form;
      const ps=(_projetosCache||[]).slice().sort((x,y)=>x.key.localeCompare(y.key));
      // Tarefas AVULSAS/administrativas: o ÚNICO projeto permitido é o TAD.
      const ehAvulsa=no.filtro==='avulsa';
      const escolhe=!!no.escolheProjeto;      // folha com escolha explícita de projeto (cards)
      // Projeto ÚNICO permitido na folha: TAD (avulsas/administrativas) ou soProjeto (ex.: DAMS).
      const chaveFixa = ehAvulsa ? 'TAD' : (no.soProjeto||'');
      let sug=arvProjetosSugeridos(no.filtro||'', no.catRe);
      if(chaveFixa){ const px=ps.find(p=>p.key===chaveFixa)||sug[0]; sug=px?[px]:[]; f.projeto=(sug[0]&&sug[0].key)||''; }
      else if(!escolhe && !f.projeto && sug.length) f.projeto=sug[0].key;   // 1º sugerido já selecionado
      if(f.respId==null && id && id.accountId) f.respId=id.accountId;   // atribuído a quem cria
      if(ehAvulsa && f.depto==null && no.depto) f.depto=no.depto;       // departamento da folha
      if(escolhe && !f.projeto){
      // Escolha user-friendly do projeto: um card por projeto da categoria,
      // com o nome e a descrição do objetivo (vinda do Jira).
      const cards=sug.length
        ?`<div class="arv-projs">${sug.map(p=>`<button class="arv-pcard t-${escA(no.tone)}" data-arv-proj="${escA(p.key)}">
              <span class="arv-pcard-t">${esc(p.nome||p.key)} <span class="arv-pcard-k">${esc(p.key)}</span></span>
              <span class="arv-pcard-d">${esc(p.descricao||'Sem descrição do objetivo cadastrada no Jira.')}</span>
            </button>`).join('')}</div>`
        :(_projetosCache
          ?`<div class="ap-fb err" style="margin-top:8px">Nenhum projeto encontrado na categoria “${esc(no.catNome||'')}”. Confira a categoria dos projetos no Jira.</div>`
          :'<div class="muted" style="margin-top:8px">Carregando projetos…</div>');
      form=`<div class="sec" style="margin:16px 0 6px">Escolha o projeto <span class="muted">— categoria ${esc(no.catNome||'')}</span></div>
        ${cards}
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <button class="btn" data-arv-voltar="1">← Voltar</button>
          <button class="btn" data-arv-reiniciar="1">Reiniciar</button>
        </div>`;
      } else {
      const sugSet=new Set(sug.map(p=>p.key));
      const optProj = chaveFixa
        ? (sug.length?`<option value="${escA(sug[0].key)}" selected>${esc(sug[0].nome||sug[0].key)} (${esc(sug[0].key)})</option>`:`<option value="">projeto ${esc(chaveFixa)} não encontrado</option>`)
        : '<option value="">— escolha —</option>'
          +(sug.length?`<optgroup label="Sugeridos (${esc(no.badge)})">${sug.map(p=>`<option value="${escA(p.key)}" ${f.projeto===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('')}</optgroup>`:'')
          +`<optgroup label="Todos os projetos">${ps.filter(p=>!sugSet.has(p.key)).map(p=>`<option value="${escA(p.key)}" ${f.projeto===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('')}</optgroup>`;
      const proj=ps.find(p=>p.key===f.projeto);
      // Projeto escolhido via card: aparece fixo, com a descrição e um botão para trocar.
      const campoProjeto = escolhe
        ? `<div class="campo"><label>Projeto</label>
            <div class="arv-proj-fixo"><span><strong>${esc(f.projeto)}</strong> — ${esc((proj&&proj.nome)||'')}</span>
              <button class="btn arv-troca" data-arv-trocaproj="1" data-tip="Voltar à lista de projetos desta categoria">trocar</button></div>
            ${proj&&proj.descricao?`<div class="muted small" style="margin-top:4px">${esc(proj.descricao)}</div>`:''}</div>`
        : `<div class="campo"><label>Projeto${chaveFixa?' <span class="muted">(fixo)</span>':''}</label><select class="arv-in" data-arv-f="projeto" ${chaveFixa?`disabled data-tip="${ehAvulsa?'Tarefas avulsas/administrativas só podem nascer no projeto TAD':escA('Este caminho só permite criar no projeto '+chaveFixa)}"`:''}>${optProj}</select></div>`;
      // Folha "no épico de Gestão": o ticket nasce DENTRO de um épico do projeto —
      // carrega os épicos (mesmo cache do Planejar) e pré-seleciona o de Gestão (⭐).
      let campoEpico='';
      if(no.epico){
        const pl2=estado.planejar;
        const ep=f.projeto?pl2.epicosPorProj[f.projeto]:null;
        if(f.projeto && !ep && !pl2.carregandoEpicos){
          pl2.carregandoEpicos=true;
          fetch(`/api/projetos?epicos=${encodeURIComponent(f.projeto)}`).then(r=>r.json()).then(j=>{
            pl2.carregandoEpicos=false;
            pl2.epicosPorProj[f.projeto]=j.erro?{epicos:[],historias:[],erro:j.erro}:j;
            arvRender();
          }).catch(e2=>{ pl2.carregandoEpicos=false;
            pl2.epicosPorProj[f.projeto]={epicos:[],historias:[],erro:String(e2.message||e2)};
            arvRender(); });
        }
        let selEp;
        if(!f.projeto) selEp='<select disabled><option>escolha o projeto</option></select>';
        else if(!ep) selEp='<select disabled><option>carregando épicos…</option></select>';
        else if(ep.erro) selEp=`<select disabled><option>erro: ${esc(ep.erro)}</option></select>`;
        else if(!(ep.epicos||[]).length) selEp='<select disabled><option>projeto sem épicos abertos</option></select>';
        else {
          if(!f.epicoKey || !(ep.epicos||[]).some(x=>x.k===f.epicoKey)){
            const g=(ep.epicos||[]).find(x=>/gest/i.test(x.resumo||''));
            f.epicoKey=(g&&g.k)||'';
          }
          selEp=`<select class="arv-in" data-arv-f="epicoKey"><option value="">— escolha o épico —</option>${
            (ep.epicos||[]).map(x=>`<option value="${escA(x.k)}" ${f.epicoKey===x.k?'selected':''}>${esc(x.k)} — ${esc((x.resumo||'').slice(0,55))}${/gest/i.test(x.resumo||'')?' ⭐':''}</option>`).join('')}</select>`;
        }
        campoEpico=`<div class="campo"><label>Épico de Gestão <span class="muted">(o ticket nasce dentro dele)</span></label>${selEp}</div>`;
      }
      // Folha "AMS por parceria": consultoria + cliente vêm do campo CASCATA
      // "AMS | Consultoria > Cliente" do Jira (opções lidas do createmeta do DCP).
      let camposAms='';
      if(no.camposAms){
        const pl3=estado.planejar;
        pl3.amsConsPorProj=pl3.amsConsPorProj||{};
        const cc=f.projeto?pl3.amsConsPorProj[f.projeto]:null;
        if(f.projeto && !cc && !pl3.carregandoCons){
          pl3.carregandoCons=true;
          fetch(`/api/projetos?consultorias=${encodeURIComponent(f.projeto)}`).then(r=>r.json()).then(j=>{
            pl3.carregandoCons=false;
            pl3.amsConsPorProj[f.projeto]=j&&j.opcoes?j:{opcoes:[],erro:(j&&j.erro)||'resposta inesperada'};
            arvRender();
          }).catch(e3=>{ pl3.carregandoCons=false;
            pl3.amsConsPorProj[f.projeto]={opcoes:[],erro:String(e3.message||e3)};
            arvRender(); });
        }
        let selCons, selCli;
        if(!f.projeto){ selCons='<select disabled><option>escolha o projeto</option></select>'; selCli=selCons; }
        else if(!cc){ selCons='<select disabled><option>carregando…</option></select>'; selCli=selCons; }
        else if(!(cc.opcoes||[]).length){
          selCons=`<select disabled><option>${esc(cc.erro||'sem opções no Jira')}</option></select>`;
          selCli='<select disabled><option>—</option></select>';
        } else {
          const ops=cc.opcoes||[];
          if(f.amsConsId && !ops.some(o=>o.id===f.amsConsId)) f.amsConsId='';
          selCons=`<select class="arv-in" data-arv-f="amsConsId"><option value="">— escolha a consultoria —</option>${
            ops.map(o=>`<option value="${escA(o.id)}" ${f.amsConsId===o.id?'selected':''}>${esc(o.nome)}</option>`).join('')}</select>`;
          const clientes=((ops.find(o=>o.id===f.amsConsId)||{}).clientes)||[];
          if(f.amsCliId && !clientes.some(o=>o.id===f.amsCliId)) f.amsCliId='';
          selCli=f.amsConsId
            ?`<select class="arv-in" data-arv-f="amsCliId"><option value="">— escolha o cliente —</option>${
              clientes.map(o=>`<option value="${escA(o.id)}" ${f.amsCliId===o.id?'selected':''}>${esc(o.nome)}</option>`).join('')}</select>`
            :'<select disabled><option>escolha a consultoria primeiro</option></select>';
        }
        camposAms=`<div class="campo"><label>Consultoria parceira <span class="muted">(obrigatório)</span></label>${selCons}</div>
          <div class="campo"><label>Cliente <span class="muted">(obrigatório)</span></label>${selCli}</div>`;
      }
      const tipos=((proj&&proj.tipos)||[]).filter(t=> no.subtarefa ? t.subtarefa : (!t.subtarefa&&t.nivel===0));
      // Rotina administrativa: a FREQUÊNCIA respondida na árvore pré-seleciona o tipo
      // (ex.: "Rotina Semanal"); se o projeto não tiver tipo equivalente, cai no padrão.
      if(no.tipoPorFreq && f.freqAdm && !f.tipoId){
        const REF={ 'diária':/di[aá]ri/i, semanal:/semana/i, mensal:/mensal|m[eê]s/i }[f.freqAdm];
        const tf=REF?tipos.find(t2=>REF.test(t2.nome||'')):null;
        if(tf) f.tipoId=tf.id;
      }
      // Folha AMS não faturável: pré-seleciona o TIPO "não faturável" do projeto
      // (reunião ou tarefa) pelo nome — a apuração usa o tipo como fonte de verdade.
      let avisoNF='';
      if(no.tipoNaoFat){
        const RE_NF=/n[aã]o.{0,4}fatur/i;
        const cand=tipos.filter(t2=>RE_NF.test(t2.nome||''));
        if(!f.tipoId){
          const re=no.tipoNaoFat==='reuniao'?/reuni/i:/taref|ativid|admin/i;
          const tf=cand.find(t2=>re.test(t2.nome||''))||cand[0];
          if(tf) f.tipoId=tf.id;
        }
        if(tipos.length && !cand.length)
          avisoNF=`<div class="muted small" style="color:#B45309;margin-top:4px">⚠ Este projeto não tem um tipo "não faturável" — escolha o mais próximo ou cadastre o tipo no Jira.</div>`;
      }
      if(!tipos.some(t=>t.id===f.tipoId)) f.tipoId=(tipos[0]&&tipos[0].id)||'';
      const optTipos=tipos.length?tipos.map(t=>`<option value="${escA(t.id)}" ${f.tipoId===t.id?'selected':''}>${esc(t.nome)}</option>`).join(''):'<option value="">—</option>';
      const pessoas=Object.entries(pessoasUnidas()).map(([ac,o])=>[ac,(o&&o.nome)||ac]).sort((x,y)=>x[1].localeCompare(y[1],'pt'));
      if(f.respId && !pessoas.some(([ac])=>ac===f.respId)) pessoas.unshift([f.respId,(id&&id.nome)||'Você']);
      const optResp='<option value="">— sem responsável —</option>'+pessoas.map(([ac,n])=>`<option value="${escA(ac)}" ${f.respId===ac?'selected':''}>${esc(n)}</option>`).join('');
      form=`<div class="sec" style="margin:16px 0 6px">Último passo: criar o ticket ${no.subtarefa?'(como <strong>subtarefa</strong> do ticket responsável)':(no.epico?'(dentro do <strong>épico de Gestão</strong> do projeto)':'')}</div>
        <div class="pl-grid">
          ${campoProjeto}
          ${campoEpico}
          ${camposAms}
          ${ehAvulsa?`<div class="campo"><label>Departamento Dexterity <span class="muted">(obrigatório)</span></label>
            <select class="arv-in" data-arv-f="depto"><option value="">— escolha —</option>${ARV_NOS.departamento.op.map(o=>`<option value="${escA(o.label)}" ${f.depto===o.label?'selected':''}>${esc(o.label)}</option>`).join('')}</select></div>`:''}
          ${no.subtarefa?`<div class="campo"><label>Ticket responsável (pai)</label><input type="text" class="arv-in" data-arv-f="paiKey" value="${escA(f.paiKey||'')}" placeholder="ex.: SAP1-123"></div>`:''}
          <div class="campo"><label>Tipo${no.tipoPorFreq&&f.freqAdm?` <span class="muted">(rotina ${esc(f.freqAdm)})</span>`:''}${no.tipoNaoFat?' <span class="muted">(não faturável)</span>':''}</label><select class="arv-in" data-arv-f="tipoId" ${tipos.length?'':'disabled'}>${optTipos}</select>${avisoNF}</div>
          <div class="campo"><label>Responsável</label><select class="arv-in" data-arv-f="respId">${optResp}</select></div>
          <div class="campo"><label>Vencimento <span class="muted">(opcional)</span></label><input type="date" class="arv-in" data-arv-f="venc" value="${escA(f.venc||'')}"></div>
        </div>
        <div class="campo"><label>Resumo do ticket</label><input type="text" class="arv-in" data-arv-f="resumo" value="${escA(f.resumo||'')}" maxlength="255" placeholder="o que será feito — objetivo claro (P1)"></div>
        <div class="campo"><label>Descrição <span class="muted">(motivo + critério de aceite)</span></label>
          <textarea class="pl-texto" style="min-height:90px" data-arv-f="descricao" placeholder="Por quê:\nCritério de aceite:">${esc(f.descricao||'')}</textarea></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
          <button class="btn" data-arv-voltar="1">← Voltar</button>
          <button class="btn" data-arv-reiniciar="1">Reiniciar</button>
          ${id?`<button class="btn primario" data-arv-criar="1" ${a.criando?'disabled':''}>${a.criando?'Criando…':'Criar ticket'}</button>`
              :'<button class="btn" data-ap-act="config-id">Identificar-se para criar</button>'}
        </div>
        <div class="ap-fb" id="arv-fb" ${a.erro?'':'hidden'}>${esc(a.erro||'')}</div>`;
      }
    } else {
      const aus=no.ausencia?`<div class="arv-ops" style="margin-top:12px">${[
          ['compensacao','🌴 Compensação de horas','Folga para compensar horas extras já trabalhadas.'],
          ['atestado','🩺 Atestado médico','Afastamento por atestado — anexe o documento no pedido dentro do Odoo.'],
          ['ferias','🏖 Férias remuneradas','Período de férias com remuneração (aprovação do gestor no Odoo).'],
          ['ferias_nr','🏝 Férias não remuneradas','Licença sem remuneração (aprovação do gestor no Odoo).'],
        ].map(x=>`<button class="arv-op t-orange" data-arv-aus="${x[0]}"><span class="arv-op-l">${x[1]}</span><span class="arv-op-d">${x[2]}</span></button>`).join('')}</div>`:'';
      form=`${aus}<div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn" data-arv-voltar="1">← Voltar</button>
          <button class="btn primario" data-arv-reiniciar="1">Reiniciar</button></div>`;
    }
    corpo=`${trilha}
      <span class="arv-badge t-${escA(no.tone)}">${esc(no.badge)}</span>
      <h3 class="arv-titulo">${esc(no.title)}</h3>
      <div class="muted" style="margin:4px 0 8px">${esc(no.text)}</div>
      <ul class="qa-probs">${no.bullets.map(b2=>`<li>${esc(b2)}</li>`).join('')}</ul>
      ${form}`;
  } else {
    corpo=`${trilha}
      <h3 class="arv-titulo">${esc(no.q)}</h3>
      <div class="muted small" style="margin:4px 0 12px">${esc(no.helper)}</div>
      <div class="arv-ops">${no.op.map((o,i)=>`<button class="arv-op t-${escA(o.tone)}" data-arv-op="${i}"><span class="arv-op-l">${esc(o.label)}</span>${o.desc?`<span class="arv-op-d">${esc(o.desc)}</span>`:''}</button>`).join('')}</div>
      <div style="display:flex;gap:10px;margin-top:14px">
        ${a.hist.length?'<button class="btn" data-arv-voltar="1">← Voltar</button>':''}
        ${a.hist.length?'<button class="btn" data-arv-reiniciar="1">Reiniciar</button>':''}
      </div>`;
  }
  return `${corpo}
      ${defs}`;
}
function renderOndeCrio(){
  const cont=document.getElementById('conteudo');
  cont.replaceChildren(el(`<div>
    <div class="card full">
      <h2>🌳 Onde crio o ticket? <span>árvore de decisão — governança de tickets (TI-04-006)</span></h2>
      <div class="pl-dica">Responda as perguntas para descobrir <strong>onde o ticket deve nascer</strong> — no fim, crie o ticket ali mesmo, já no projeto certo e <strong>atribuído a você</strong>.</div>
      ${arvHTML()}
    </div>
  </div>`));
}
// Cria o ticket da folha da árvore (1 item, mesma API da criação em lote).
async function arvCria(){
  const a=arvEstado(); const no=ARV_NOS[a.no]||{}; const f=a.form;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  a.erro='';
  if(!f.projeto){ a.erro='Escolha o projeto.'; arvRender(); return; }
  if(no.filtro==='avulsa' && !(f.depto||'').trim()){ a.erro='Escolha o Departamento Dexterity (obrigatório nas tarefas avulsas).'; arvRender(); return; }
  if(!f.tipoId){ a.erro='Escolha o tipo do ticket.'; arvRender(); return; }
  if(no.subtarefa && !/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test((f.paiKey||'').trim().toUpperCase())){
    a.erro='Informe o ticket responsável (pai) — ex.: SAP1-123.'; arvRender(); return; }
  if(no.epico && !/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test((f.epicoKey||'').trim().toUpperCase())){
    a.erro='Escolha o épico de Gestão do projeto — o ticket é criado dentro dele.'; arvRender(); return; }
  if(no.camposAms){
    if(!f.amsConsId){ a.erro='Escolha a CONSULTORIA parceira (campo "AMS | Consultoria > Cliente" — obrigatório).'; arvRender(); return; }
    if(!f.amsCliId){ a.erro='Escolha o CLIENTE da consultoria (campo "AMS | Consultoria > Cliente" — obrigatório).'; arvRender(); return; }
  }
  if(!(f.resumo||'').trim()){ a.erro='Escreva o resumo do ticket (objetivo claro — P1).'; arvRender(); return; }
  const depto=(no.filtro==='avulsa'?(f.depto||''):(no.depto||'')).trim();
  // Nomes da consultoria/cliente (folha AMS por parceria) para o rodapé de classificação.
  let consNome='', cliNome='';
  if(no.camposAms){
    const cc=((estado.planejar.amsConsPorProj||{})[f.projeto])||{opcoes:[]};
    const co=(cc.opcoes||[]).find(o=>o.id===f.amsConsId)||{};
    consNome=co.nome||''; cliNome=((co.clientes||[]).find(o=>o.id===f.amsCliId)||{}).nome||'';
  }
  const rodape=`Classificação (árvore de decisão): ${no.badge}${depto?` · ${depto}`:''}${no.tipoPorFreq&&f.freqAdm?` · rotina ${f.freqAdm}`:''}${consNome?` · ${consNome} > ${cliNome}`:''}`;
  const item={ projeto:f.projeto, tipoId:f.tipoId, resumo:f.resumo.trim(),
    ...(no.camposAms?{consultoriaId:f.amsConsId, clienteId:f.amsCliId}:{}),
    descricao:((f.descricao||'').trim()?f.descricao.trim()+'\n\n':'')+rodape,
    respId:f.respId||'',
    paiKey: no.subtarefa ? (f.paiKey||'').trim().toUpperCase()
          : (no.epico ? (f.epicoKey||'').trim().toUpperCase() : ''),
    estimativa:'', labels:[], venc:f.venc||'', departamento:depto };
  a.criando=true; arvRender();
  try{
    const j=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({itens:[item],email:id.email,token:id.token})}).then(r=>r.json());
    a.criando=false;
    const ok=j&&j.criados&&j.criados[0];
    if(ok){ a.feito={key:ok.key, resumo:item.resumo};
      logAcao({acao:'arvore-criar', t:ok.key, para:no.badge, ok:true});
      toast(`✓ Ticket ${ok.key} criado (${no.badge}).`,'ok');
      estado.cache={};
    } else a.erro=(j&&(j.erro||(j.erros&&j.erros[0]&&j.erros[0].erro)))||'Falha ao criar o ticket.';
  }catch(e){ a.criando=false; a.erro='Erro de rede: '+(e.message||e); }
  arvRender();
}

function renderPlanejarForm(){
  const cont=document.getElementById('conteudo');
  const pl=estado.planejar;
  const id=idApontar();
  if(pl.modo==='estrutura') return renderPlanejarEstruForm();

  // Épicos/histórias do projeto (modo épico) carregam sob demanda.
  if(pl.modo==='epico' && pl.projeto && !pl.epicosPorProj[pl.projeto] && !pl.carregandoEpicos){
    pl.carregandoEpicos=true;
    fetch(`/api/projetos?epicos=${encodeURIComponent(pl.projeto)}`).then(r=>r.json()).then(j=>{
      pl.carregandoEpicos=false;
      pl.epicosPorProj[pl.projeto]=j.erro?{epicos:[],historias:[],erro:j.erro}:j;
      if(estado.vista==='planejar') renderPlanejar();
    }).catch(e=>{ pl.carregandoEpicos=false;
      pl.epicosPorProj[pl.projeto]={epicos:[],historias:[],erro:String(e.message||e)};
      if(estado.vista==='planejar') renderPlanejar(); });
  }
  ajustaTipo();

  const faixaId = id
    ? `<div class="ap-id">📝 Criando como <strong>${esc(id.nome||id.email)}</strong>
         <span class="muted small">(os tickets terão você como relator)</span>
         <span class="spacer"></span><button class="btn" data-ap-act="trocar-id">Trocar usuário</button></div>`
    : `<div class="ap-id sem">Para criar tickets, identifique-se uma única vez (e-mail + token de API do Jira).
         <span class="spacer"></span><button class="btn" data-ap-act="config-id">Identificar-se</button></div>`;

  const optProjetos='<option value="">— escolha —</option>'+pl.projetos.map(p=>
    `<option value="${escA(p.key)}" ${pl.projeto===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('');
  const tipos=tiposDisponiveis();
  const optTipos=tipos.length?tipos.map(t=>
    `<option value="${escA(t.id)}" ${pl.tipoId===t.id?'selected':''}>${esc(t.nome)}</option>`).join('')
    :'<option value="">—</option>';
  const pessoas=Object.entries(pessoasUnidas()).map(([a,o])=>[a,(o&&o.nome)||a])
    .sort((x,y)=>x[1].localeCompare(y[1],'pt'));
  const optResp='<option value="">— sem responsável —</option>'+pessoas.map(([a,n])=>
    `<option value="${escA(a)}" ${pl.respId===a?'selected':''}>${esc(n)}</option>`).join('');

  // Seleção de épico e, dentro dele, história (modo épico).
  let campoPai='';
  let painelHist='';
  if(pl.modo==='epico'){
    const ep=pl.epicosPorProj[pl.projeto];
    if(!pl.projeto) campoPai='<div class="campo"><label>Épico</label><select disabled><option>escolha o projeto</option></select></div>';
    else if(!ep) campoPai='<div class="campo"><label>Épico</label><select disabled><option>carregando…</option></select></div>';
    else if(ep.erro) campoPai=`<div class="campo"><label>Épico</label><select disabled><option>erro: ${esc(ep.erro)}</option></select></div>`;
    else {
      const optEp='<option value="">— escolha o épico —</option>'+(ep.epicos||[]).map(e=>
        `<option value="${escA(e.k)}" ${pl.epicoKey===e.k?'selected':''}>${esc(e.k)} — ${esc(e.resumo.slice(0,55))}${e.nHistorias?` · ${e.nHistorias} história(s)`:''}</option>`).join('');
      campoPai=`<div class="campo"><label>Épico</label><select id="pl-epico">${optEp}</select></div>`;
      if(pl.epicoKey){
        const hs=historiasDoEpico();
        const optH='<option value="">— criar direto no épico (história/tarefa) —</option>'+hs.map(h=>
          `<option value="${escA(h.k)}" ${pl.historiaKey===h.k?'selected':''}>${esc(h.k)} — ${esc(h.resumo.slice(0,55))}</option>`).join('');
        campoPai+=`<div class="campo"><label>Criar dentro de</label><select id="pl-historia">${optH}</select></div>`;
        painelHist=`<div class="pl-hist">
          <div class="pl-hist-cab">📚 Histórias abertas neste épico <span class="muted">(${hs.length})</span></div>
          ${hs.length? hs.map(h=>`<div class="pl-hist-row${pl.historiaKey===h.k?' sel':''}">
              <a href="${jiraBase()}/browse/${encodeURIComponent(h.k)}" target="_blank" rel="noopener">${esc(h.k)} ↗</a>
              <span class="pl-hist-res">${esc(h.resumo)}</span>
              <span class="badge">${esc(h.status)}</span>
              <span class="spacer"></span>
              <button class="btn${pl.historiaKey===h.k?' primario':''}" data-pl-hist="${escA(h.k)}">${pl.historiaKey===h.k?'✓ planejando aqui':'planejar sub-tarefas aqui →'}</button>
            </div>`).join('')
            : '<div class="muted small">Nenhuma história aberta neste épico ainda. Deixe em “criar direto no épico” e liste as histórias abaixo para criá-las; depois entre em cada uma para detalhar as sub-tarefas.</div>'}
        </div>`;
      }
    }
  }

  const nLinhas=pl.texto.split('\n').map(l=>l.trim()).filter(Boolean).length;
  let modoDica;
  if(pl.modo!=='epico') modoDica='Os tickets serão criados direto no projeto, com o tipo e responsável padrão abaixo.';
  else if(!pl.epicoKey) modoDica='Escolha o <strong>épico</strong>. Você poderá criar as <strong>histórias dentro dele</strong> e, depois, entrar em cada história para planejar as <strong>sub-tarefas</strong>.';
  else if(pl.historiaKey) modoDica=`Os itens abaixo viram <strong>sub-tarefas</strong> dentro da história <strong>${esc(pl.historiaKey)}</strong>.`;
  else modoDica=`Os itens abaixo são criados <strong>dentro do épico ${esc(pl.epicoKey)}</strong> (como histórias/tarefas). Para detalhar uma história em sub-tarefas, selecione-a em “Criar dentro de” (ou no botão da lista).`;

  cont.replaceChildren(el(`<div>
    ${faixaId}
    <div class="card full">
      <h2>Planejamento Jira <span>criação de tickets em lote</span></h2>
      <div class="ap-chips" style="margin-bottom:12px">
        <button class="chip" aria-pressed="${pl.modo==='lote'}" data-pl-modo="lote">Criação em lote</button>
        <button class="chip" aria-pressed="${pl.modo==='epico'}" data-pl-modo="epico">Planejamento de épico</button>
        <button class="chip" aria-pressed="false" data-pl-modo="estrutura" data-tip="Cole Épico → História → Task e os tickets nascem já na hierarquia certa">📐 Colar estrutura</button>
        <button class="chip" aria-pressed="false" data-goto="ondecrio" data-tip="Não sabe onde abrir o ticket? A árvore de decisão guia e cria o ticket no lugar certo">🌳 Onde crio o ticket?</button>
      </div>
      <div class="pl-dica">${modoDica}</div>
      <div class="pl-grid">
        <div class="campo"><label>Projeto</label><select id="pl-projeto">${optProjetos}</select></div>
        ${campoPai}
        <div class="campo"><label>Tipo de ticket</label><select id="pl-tipo" ${tipos.length?'':'disabled'}>${optTipos}</select></div>
        <div class="campo"><label>Responsável (padrão)</label><select id="pl-resp">${optResp}</select></div>
      </div>
      <div class="pl-dica" style="margin-top:10px">Padrões do lote <span class="muted">(opcionais — aplicados a <strong>todos</strong> os tickets desta criação)</span> e templates:</div>
      <div class="pl-grid">
        <div class="campo"><label>⏱ Estimativa</label>
          <input id="pl-est" placeholder="ex.: 4h · 2d · 1w 2d" value="${escA(pl.est||'')}"></div>
        <div class="campo"><label>🏷 Labels</label>
          <input id="pl-labels" placeholder="separadas por vírgula" value="${escA(pl.labels||'')}"></div>
        <div class="campo"><label>📅 Vencimento</label>
          <input type="date" id="pl-venc" value="${escA(pl.venc||'')}"></div>
        <div class="campo"><label>📑 Templates do time</label>
          <div style="display:flex;gap:6px">
            <select id="pl-tpl" style="flex:1;min-width:0">${'<option value="">— aplicar um template… —</option>'+(cfg.planTemplates||[]).map(x=>`<option value="${escA(x.nome)}" ${pl.tpl===x.nome?'selected':''}>${esc(x.nome)}</option>`).join('')}</select>
            <button class="btn" id="pl-tpl-salvar" data-tip="Salvar a lista e os padrões atuais como template do time">💾</button>
            <button class="btn" id="pl-tpl-del" data-tip="Excluir o template selecionado" ${pl.tpl?'':'disabled'}>🗑</button>
          </div></div>
      </div>
      ${painelHist}
      <div class="campo"><label>Tickets — um por linha <span class="muted">(use “;” para separar resumo ; descrição)</span></label>
        <textarea class="pl-texto" id="pl-texto" placeholder="Levantar requisitos com o cliente ; agendar reunião inicial
Configurar ambiente de homologação
Criar massa de testes ; usar dados do projeto anterior">${esc(pl.texto)}</textarea></div>
      <div class="pl-dica"><span id="pl-contador">${nLinhas}</span> ticket(s) na lista · máximo 100 por lote.
        Tem uma planilha? Use <strong>📋 Colar do Excel / CSV</strong> (com colunas Resumo, Descrição, Tipo, Responsável).</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" id="pl-importar">📋 Colar do Excel / CSV</button>
        <button class="btn" id="pl-modelo">⬇ Baixar modelo (.csv)</button>
        <button class="btn primario" id="pl-validar">Validar e revisar →</button>
      </div>
      <div class="ap-fb" id="pl-fb" hidden></div>
    </div>
  </div>`));
}

// ---- 📐 Colar estrutura: formulário (projeto + colagem hierárquica) ----
function renderPlanejarEstruForm(){
  const cont=document.getElementById('conteudo');
  const pl=estado.planejar;
  const id=idApontar();
  const faixaId = id
    ? `<div class="ap-id">📝 Criando como <strong>${esc(id.nome||id.email)}</strong>
         <span class="muted small">(os tickets terão você como relator)</span>
         <span class="spacer"></span><button class="btn" data-ap-act="trocar-id">Trocar usuário</button></div>`
    : `<div class="ap-id sem">Para criar tickets, identifique-se uma única vez (e-mail + token de API do Jira).
         <span class="spacer"></span><button class="btn" data-ap-act="config-id">Identificar-se</button></div>`;
  const optProjetos='<option value="">— escolha —</option>'+pl.projetos.map(p=>
    `<option value="${escA(p.key)}" ${pl.projeto===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('');
  const pessoas=Object.entries(pessoasUnidas()).map(([a,o])=>[a,(o&&o.nome)||a])
    .sort((x,y)=>x[1].localeCompare(y[1],'pt'));
  const optResp='<option value="">— sem responsável —</option>'+pessoas.map(([a,n])=>
    `<option value="${escA(a)}" ${pl.respId===a?'selected':''}>${esc(n)}</option>`).join('');
  const nLinhas=pl.textoEstr.split('\n').map(l=>l.trim()).filter(Boolean).length;
  const exemplo=['Epic\t3.1 Aplicação Financeira Mercado Monetário',
    'História\t3.1 Gestão de Transações (Criação, Modificação e estorno)',
    'Task\t3.1 Configurar Processo','Task\t3.1 Teste Funcional',
    'História\t3.1 Rotinas diárias (Contabilização, Atualização da Taxa de Juros)',
    'Task\t3.1 Configurar Processo'].join('\n');
  cont.replaceChildren(el(`<div>
    ${faixaId}
    <div class="card full">
      <h2>Planejamento Jira <span>colar estrutura — Épico → História → Task</span></h2>
      <div class="ap-chips" style="margin-bottom:12px">
        <button class="chip" aria-pressed="false" data-pl-modo="lote">Criação em lote</button>
        <button class="chip" aria-pressed="false" data-pl-modo="epico">Planejamento de épico</button>
        <button class="chip" aria-pressed="true" data-pl-modo="estrutura">📐 Colar estrutura</button>
        <button class="chip" aria-pressed="false" data-goto="ondecrio" data-tip="Não sabe onde abrir o ticket? A árvore de decisão guia e cria o ticket no lugar certo">🌳 Onde crio o ticket?</button>
      </div>
      <div class="pl-dica">Cole a estrutura direto do Excel: cada linha começa com o <strong>nível</strong>
        (<span class="pl-nv n1">Épico</span> <span class="pl-nv n2">História</span> <span class="pl-nv n3">Task</span>)
        seguido do <strong>título</strong>. As histórias entram no último épico acima; as tasks viram
        <strong>sub-tarefas da última história</strong> acima delas — a hierarquia nasce pronta no Jira.</div>
      <div class="pl-grid">
        <div class="campo"><label>Projeto</label><select id="pl-projeto">${optProjetos}</select></div>
        <div class="campo"><label>Responsável (padrão)</label><select id="pl-resp">${optResp}</select></div>
        <div class="campo"><label>⏱ Estimativa (todos)</label>
          <input id="pl-est" placeholder="ex.: 4h · 2d · 1w 2d" value="${escA(pl.est||'')}"></div>
        <div class="campo"><label>📅 Vencimento (todos)</label>
          <input type="date" id="pl-venc" value="${escA(pl.venc||'')}"></div>
      </div>
      <div class="pl-dica" style="margin-top:8px">💡 Depois de criar, uma <strong>grade estilo planilha</strong> deixa
        mudar <strong>em massa</strong> a data limite e o responsável dos tickets criados.</div>
      <div class="campo"><label>Estrutura — um item por linha <span class="muted">(nível + TAB/";" + título; colar do Excel funciona direto)</span></label>
        <textarea class="pl-texto" id="pl-texto-estr" placeholder="${escA(exemplo)}">${esc(pl.textoEstr)}</textarea></div>
      <div class="pl-dica"><span id="pl-estr-cont">${nLinhas}</span> linha(s) na estrutura · máximo 100 tickets por lote.</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn primario" id="pl-estr-validar">Validar estrutura →</button>
      </div>
      <div class="ap-fb" id="pl-fb" hidden></div>
    </div>
  </div>`));
}

// ---- 📐 Colar estrutura: revisão hierárquica + tipos por nível ----
function renderPlanejarEstru(){
  const cont=document.getElementById('conteudo');
  const pl=estado.planejar;
  const id=idApontar();
  const its=pl.estru||[];
  const {opts,sel}=slotsEstrutura();
  const usados=[...new Set(its.filter(it=>it.slot).map(it=>it.slot))];
  // Slot usado sem NENHUM tipo disponível no projeto trava a criação.
  const slotSemTipo=usados.filter(s=>!(opts[s]||[]).length);
  let nErros=0;
  const rotNv=(it)=>{ const r={1:'Épico',2:'História',3:it.slot==='tarefa'?'Task no épico':'Task'}[it.nivel]||'?';
    return `<span class="pl-nv n${it.nivel||0}">${r}</span>`; };
  const linhas=its.map((it,i)=>{
    const semTipo=it.slot&&!(opts[it.slot]||[]).length;
    const erro=it.erro||(semTipo?`O projeto não tem tipo para “${PL_SLOT_ROT[it.slot]}”.`:'');
    if(erro) nErros++;
    const tipoNome=erro?'':esc(((opts[it.slot]||[]).find(t=>t.id===sel[it.slot])||{}).nome||'');
    return `<tr class="${erro?'pl-row-err':''}">
      <td class="muted">${i+1}</td>
      <td style="white-space:nowrap;padding-left:${8+(it.nivel>0?(it.nivel-1)*22:0)}px">${it.nivel>1?'<span class="muted">└</span> ':''}${rotNv(it)}</td>
      <td style="min-width:240px"><input class="pl-estr-tit${erro?' pl-resumo':''}" data-pl-i="${i}" value="${escA(it.titulo)}"></td>
      <td class="muted small">${tipoNome}</td>
      <td>${erro?`<span class="pl-st err" data-tip="${escA(erro)}">✕</span>`:'<span class="pl-st ok">✓</span>'}</td>
      <td><button class="btn" data-pl-estr-del="${i}" data-tip="Remove o item e tudo que está dentro dele">remover</button></td>
    </tr>`;
  }).join('');
  const nEp=its.filter(it=>it.nivel===1).length, nHi=its.filter(it=>it.nivel===2).length,
        nTk=its.filter(it=>it.nivel===3).length;
  const pj=(pl.projetos||[]).find(p=>p.key===pl.projeto);
  const slots=usados.map(s=>{
    const os=(opts[s]||[]).map(t=>`<option value="${escA(t.id)}" ${sel[s]===t.id?'selected':''}>${esc(t.nome)}</option>`).join('');
    return `<div class="campo"><label>Tipo — ${esc(PL_SLOT_ROT[s])}</label>
      <select data-pl-slot="${escA(s)}" ${os?'':'disabled'}>${os||'<option>— nenhum no projeto —</option>'}</select></div>`;
  }).join('');
  const pads=[];
  if((pl.est||'').trim()) pads.push('⏱ '+esc(pl.est.trim()));
  if(pl.venc) pads.push('📅 vence '+fmtBR(pl.venc));
  const prontos=its.length-nErros;
  const podeCriar=prontos>0 && nErros===0 && !slotSemTipo.length && !pl.criando;
  cont.replaceChildren(el(`<div>
    <div class="card full">
      <h2>Revisão da estrutura <span>${nEp} épico(s) · ${nHi} história(s) · ${nTk} task(s)</span></h2>
      <div class="pl-destino">Projeto <strong>${esc(pl.projeto)}${pj?(' — '+esc(pj.nome)):''}</strong>
        · a hierarquia é criada em <strong>ondas</strong>: épicos → histórias → tasks, já vinculados.
        ${pads.length?`<br>Padrões aplicados a <strong>todos</strong>: ${pads.join(' · ')}`:''}</div>
      ${nErros?'<div class="aviso">Corrija (ou remova) os itens marcados com ✕ para liberar a criação.</div>':''}
      <div class="pl-estr-slots">${slots}</div>
      <div class="ts-wrap"><table class="pl-rev">
        <thead><tr><th>#</th><th>Nível</th><th>Título</th><th>Tipo</th><th></th><th></th></tr></thead>
        <tbody>${linhas}</tbody></table></div>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn" id="pl-estr-voltar">← Voltar e editar</button>
        <button class="btn primario" id="pl-estr-criar" ${podeCriar?'':'disabled'}>
          ${pl.criando?esc(pl.criandoMsg||'Criando…'):`Criar ${prontos} ticket(s) na hierarquia`}</button>
        ${id?'':'<button class="btn" data-ap-act="config-id">Identificar-se para criar</button>'}
      </div>
      <div class="ap-fb" id="pl-fb" hidden></div>
    </div>
  </div>`));
}

// Criação hierárquica em ondas: épicos primeiro, depois histórias (paiKey = épico
// criado) e por fim as tasks (paiKey = história criada). Filhos de um item que
// falhou não são criados — viram erro explicado no resultado.
async function criaEstrutura(){
  const pl=estado.planejar;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  if(pl.criando) return;
  const its=pl.estru||[];
  const {opts,sel}=slotsEstrutura();
  // Segurança: nada de criar com itens inválidos ou slot sem tipo no projeto.
  if(!its.length || its.some(it=>it.erro||!it.slot||!(opts[it.slot]||[]).length)) return;
  // Profundidade real de cada item (épico=0; história=1; task=2 — ou menos, se sem pai).
  const prof=(i)=>{ let n=0,p=its[i].pai; while(p>=0){ n++; p=its[p].pai; } return n; };
  const maxProf=its.length?Math.max(...its.map((_,i)=>prof(i))):0;
  pl.criando=true; pl.criandoMsg='Criando…'; renderPlanejar();
  const chaves=new Array(its.length).fill('');
  const criadosIdx=new Array(its.length).fill(null), erros=[];
  // Grade na ORDEM da árvore colada (cada task sob a sua história), não das ondas.
  const criadosOrdenados=()=>criadosIdx.filter(Boolean);
  try{
    for(let d=0;d<=maxProf;d++){
      const onda=its.map((it,i)=>({it,i})).filter(x=>prof(x.i)===d);
      if(!onda.length) continue;
      pl.criandoMsg=`Criando… onda ${d+1}/${maxProf+1}`;
      const btn=document.getElementById('pl-estr-criar'); if(btn) btn.textContent=pl.criandoMsg;
      // Pai falhou → filho nem tenta.
      const vivas=onda.filter(x=>{ if(x.it.pai>=0 && !chaves[x.it.pai]){
        erros.push({resumo:x.it.titulo, erro:'Item-pai não foi criado.'}); return false; } return true; });
      if(!vivas.length) continue;
      const itensReq=vivas.map(x=>({ projeto:pl.projeto, tipoId:sel[x.it.slot], resumo:x.it.titulo,
        descricao:x.it.descricao||'', respId:pl.respId||'', paiKey:x.it.pai>=0?chaves[x.it.pai]:'',
        estimativa:(pl.est||'').trim(), labels:plLabels(), venc:pl.venc||'' }));
      const j=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({itens:itensReq,email:id.email,token:id.token})}).then(r=>r.json());
      if(j.erro) throw new Error(j.erro);
      (j.criados||[]).forEach(c=>{ const x=vivas[c.indice]; if(!x) return;
        chaves[x.i]=c.key;
        criadosIdx[x.i]={key:c.key, resumo:x.it.titulo, nivel:x.it.nivel, respId:pl.respId||'', venc:pl.venc||''}; });
      (j.erros||[]).forEach(e2=>{ const x=vivas[e2.indice];
        erros.push({resumo:(x&&x.it.titulo)||('item '+(e2.indice+1)), erro:e2.erro}); });
    }
    const criados=criadosOrdenados();
    pl.criando=false; pl.criandoMsg='';
    pl.resultados={criados, erros, ok:!erros.length};
    pl.grade=montaGrade(criados);
    pl.estru=null;
    estado.cache={};            // os painéis verão os tickets novos
    renderPlanejar();
  }catch(e){
    pl.criando=false; pl.criandoMsg='';
    // O que já foi criado até aqui não se perde: vira resultado parcial com o erro.
    const criados=criadosOrdenados();
    if(criados.length){
      erros.push({resumo:'(interrompido)', erro:String(e.message||e)});
      pl.resultados={criados, erros, ok:false}; pl.grade=montaGrade(criados); pl.estru=null;
      estado.cache={};
      renderPlanejar(); return;
    }
    renderPlanejar();
    const fb=document.getElementById('pl-fb');
    if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=String(e.message||e); }
  }
}

function renderPlanejarRevisao(){
  const cont=document.getElementById('conteudo');
  const pl=estado.planejar;
  const id=idApontar();
  const tipos=tiposDisponiveis();
  const pessoas=Object.entries(pessoasUnidas()).map(([a,o])=>[a,(o&&o.nome)||a])
    .sort((x,y)=>x[1].localeCompare(y[1],'pt'));

  // Validação + duplicados (aviso, não bloqueia).
  const contagem={};
  pl.itens.forEach(it=>{ const r=(it.resumo||'').trim().toLowerCase(); if(r) contagem[r]=(contagem[r]||0)+1; });
  let nErros=0;
  const linhas=pl.itens.map((it,i)=>{
    const erro=validaItemPl(it); if(erro) nErros++;
    const dup=!erro && contagem[(it.resumo||'').trim().toLowerCase()]>1;
    const st=erro?`<span class="pl-st err" data-tip="${escA(erro)}">✕</span>`
      : dup?`<span class="pl-st warn" data-tip="Resumo repetido na lista">⚠</span>`
      : `<span class="pl-st ok">✓</span>`;
    const optT=tipos.map(t=>`<option value="${escA(t.id)}" ${it.tipoId===t.id?'selected':''}>${esc(t.nome)}</option>`).join('');
    const optR='<option value="">—</option>'+pessoas.map(([a,n])=>
      `<option value="${escA(a)}" ${it.respId===a?'selected':''}>${esc(n)}</option>`).join('');
    return `<tr class="${erro?'pl-row-err':''}">
      <td class="muted">${i+1}</td>
      <td style="min-width:220px"><input class="pl-resumo" data-pl-i="${i}" value="${escA(it.resumo)}"></td>
      <td style="min-width:160px"><input class="pl-desc" data-pl-i="${i}" value="${escA(it.descricao)}" placeholder="—"></td>
      <td><select class="pl-tipo-row" data-pl-i="${i}">${optT}</select></td>
      <td><select class="pl-resp-row" data-pl-i="${i}">${optR}</select></td>
      <td>${st}</td>
      <td><button class="btn" data-pl-del="${i}">remover</button></td>
    </tr>`;
  }).join('');

  const projs=pl.projetos||[];
  const pj=projs.find(p=>p.key===pl.projeto);
  const ep=pl.epicosPorProj[pl.projeto]||{epicos:[],historias:[]};
  const epico=(ep.epicos||[]).find(x=>x.k===pl.epicoKey);
  const hist=(ep.historias||[]).find(x=>x.k===pl.historiaKey);
  let destino=`Projeto <strong>${esc(pl.projeto)}${pj?(' — '+esc(pj.nome)):''}</strong>`;
  if(pl.modo==='epico'&&epico){
    destino+=` · épico <strong>${esc(epico.k)}</strong> <span class="muted">(${esc(epico.resumo.slice(0,50))})</span>`;
    if(hist) destino+=` · sub-tarefas em <strong>${esc(hist.k)}</strong> <span class="muted">(${esc(hist.resumo.slice(0,50))})</span>`;
    else destino+=' · como <strong>histórias/tarefas do épico</strong>';
  }
  const pads=[];
  if((pl.est||'').trim()) pads.push('⏱ '+esc(pl.est.trim()));
  const lbs=plLabels(); if(lbs.length) pads.push('🏷 '+esc(lbs.join(', ')));
  if(pl.venc) pads.push('📅 vence '+fmtBR(pl.venc));
  if(pads.length) destino+=`<br>Padrões aplicados a <strong>todos</strong>: ${pads.join(' · ')}`;
  const prontos=pl.itens.length-nErros;
  const podeCriar = prontos>0 && nErros===0 && !pl.criando;

  cont.replaceChildren(el(`<div>
    <div class="card full">
      <h2>Revisão antes de criar <span>${prontos} pronto(s)${nErros?` · ${nErros} com erro`:''}</span></h2>
      <div class="pl-destino">${destino}</div>
      ${nErros?'<div class="aviso">Corrija (ou remova) os itens marcados com ✕ para liberar a criação.</div>':''}
      <div class="ts-wrap"><table class="pl-rev">
        <thead><tr><th>#</th><th>Resumo</th><th>Descrição</th><th>Tipo</th><th>Responsável</th><th></th><th></th></tr></thead>
        <tbody>${linhas}</tbody></table></div>
      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap">
        <button class="btn" id="pl-voltar">← Voltar e editar</button>
        <button class="btn primario" id="pl-criar" ${podeCriar?'':'disabled'}>
          ${pl.criando?'Criando…':`Criar ${prontos} ticket(s) em lote`}</button>
        ${id?'':'<button class="btn" data-ap-act="config-id">Identificar-se para criar</button>'}
      </div>
      <div class="ap-fb" id="pl-fb" hidden></div>
    </div>
  </div>`));
}

// Grade pós-criação: uma linha editável por ticket criado (responsável + data
// limite), com os valores enviados na criação como ponto de partida.
function montaGrade(criados){
  return (criados||[]).map(c=>({ key:c.key, resumo:c.resumo, nivel:c.nivel||0,
    respId:c.respId||'', venc:c.venc||'', respId0:c.respId||'', venc0:c.venc||'',
    sel:false, st:'', erro:'' }));
}
function gradeMudanca(g){ return g.respId!==g.respId0 || g.venc!==g.venc0; }

function renderPlanejarResultado(){
  const cont=document.getElementById('conteudo');
  const pl=estado.planejar;
  const r=pl.resultados;
  const g=pl.grade||[];
  const pessoas=Object.entries(pessoasUnidas()).map(([a,o])=>[a,(o&&o.nome)||a])
    .sort((x,y)=>x[1].localeCompare(y[1],'pt'));
  const optResp=(v)=>'<option value="">— sem responsável —</option>'+pessoas.map(([a,n])=>
    `<option value="${escA(a)}" ${v===a?'selected':''}>${esc(n)}</option>`).join('');
  const nSel=g.filter(x=>x.sel).length;
  const nMud=g.filter(gradeMudanca).length;
  const linhas=g.map((x,i)=>{
    const st=x.st==='ok'?'<span class="pl-st ok">✓ salvo</span>'
      : x.st==='err'?`<span class="pl-st err" data-tip="${escA(x.erro)}">✕ ${esc((x.erro||'').slice(0,40))}</span>`
      : gradeMudanca(x)?'<span class="pl-st warn">alterado</span>':'<span class="muted">—</span>';
    return `<tr class="${gradeMudanca(x)?'pl-g-mud':''}">
      <td><input type="checkbox" class="pl-g-sel" data-pl-i="${i}" ${x.sel?'checked':''}></td>
      <td style="white-space:nowrap"><a href="${jiraBase()}/browse/${encodeURIComponent(x.key)}" target="_blank" rel="noopener">${esc(x.key)} ↗</a></td>
      <td style="min-width:220px;padding-left:${8+(x.nivel>1?(x.nivel-1)*18:0)}px">${x.nivel>1?'<span class="muted">└</span> ':''}${esc(x.resumo)}</td>
      <td style="min-width:170px"><select class="pl-g-resp" data-pl-i="${i}">${optResp(x.respId)}</select></td>
      <td><input type="date" class="pl-g-venc" data-pl-i="${i}" value="${escA(x.venc)}"></td>
      <td class="pl-g-st">${st}</td>
    </tr>`;
  }).join('');
  const erros=(r.erros||[]).map(e=>`<div class="pl-res-item"><span class="pl-st err">✕</span>
    <span>${esc(e.resumo||('item '+((e.indice||0)+1)))} — <span class="muted">${esc(e.erro)}</span></span></div>`).join('');
  const grade=g.length?`
      <div class="pl-dica" style="margin-top:14px">🧮 <strong>Edição em massa</strong> — ajuste a
        <strong>data limite</strong> e o <strong>responsável</strong> direto na grade (como numa planilha),
        ou marque várias linhas e aplique de uma vez. Nada muda no Jira até você salvar.</div>
      <div class="pl-g-bar">
        <span><strong>${nSel}</strong> marcado(s)</span>
        <select id="pl-g-bresp"><option value="">— responsável… —</option>${pessoas.map(([a,n])=>
          `<option value="${escA(a)}" ${pl.gbResp===a?'selected':''}>${esc(n)}</option>`).join('')}
          <option value="__rem" ${pl.gbResp==='__rem'?'selected':''}>(remover responsável)</option></select>
        <button class="btn" id="pl-g-apl-resp" ${nSel?'':'disabled'}>aplicar aos marcados</button>
        <span class="muted">·</span>
        <input type="date" id="pl-g-bvenc" value="${escA(pl.gbVenc||'')}">
        <button class="btn" id="pl-g-apl-venc" ${nSel?'':'disabled'}>aplicar data aos marcados</button>
        <span class="spacer"></span>
        <button class="btn primario" id="pl-g-salvar" ${nMud&&!pl.gSalvando?'':'disabled'}>
          ${pl.gSalvando?'Salvando…':`💾 Salvar ${nMud} alteração(ões) no Jira`}</button>
      </div>
      <div class="ts-wrap"><table class="pl-rev">
        <thead><tr><th><input type="checkbox" id="pl-g-all" ${g.length&&nSel===g.length?'checked':''} data-tip="Marcar/desmarcar todos"></th>
          <th>Ticket</th><th>Resumo</th><th>Responsável</th><th>📅 Data limite</th><th></th></tr></thead>
        <tbody>${linhas}</tbody></table></div>`
    :'<div class="muted small">Nenhum ticket criado.</div>';
  cont.replaceChildren(el(`<div>
    <div class="card full">
      <h2>Resultado da criação</h2>
      <div class="pl-res-ok">✓ ${(r.criados||[]).length} ticket(s) criado(s)</div>
      ${grade}
      ${erros?`<div class="sec" style="margin-top:16px">Falhas (${r.erros.length})</div>${erros}`:''}
      <div style="display:flex;gap:10px;margin-top:16px">
        <button class="btn primario" id="pl-novo">Criar mais tickets</button>
      </div>
      <div class="ap-fb" id="pl-fb" hidden></div>
    </div>
  </div>`));
}

// Salva na API só o que mudou em cada linha (data limite e/ou responsável).
async function salvaGrade(){
  const pl=estado.planejar;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  if(pl.gSalvando) return;
  const mudadas=(pl.grade||[]).filter(gradeMudanca);
  if(!mudadas.length) return;
  pl.gSalvando=true; renderPlanejar();
  try{
    const itens=mudadas.map(x=>{ const it={key:x.key};
      if(x.respId!==x.respId0) it.respId=x.respId;
      if(x.venc!==x.venc0) it.venc=x.venc;
      return it; });
    const j=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({editar:1,itens,email:id.email,token:id.token})}).then(r=>r.json());
    pl.gSalvando=false;
    if(j.erro){ renderPlanejar(); const fb=document.getElementById('pl-fb');
      if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=j.erro; } return; }
    const por=new Map((j.resultados||[]).map(r2=>[r2.key,r2]));
    mudadas.forEach(x=>{ const r2=por.get(x.key)||por.get(x.key.toUpperCase());
      if(r2&&r2.ok){ x.respId0=x.respId; x.venc0=x.venc; x.st='ok'; x.erro=''; }
      else { x.st='err'; x.erro=(r2&&r2.erro)||'Falha ao salvar.'; } });
    estado.cache={};            // vencimentos/atribuições mudaram
    renderPlanejar();
  }catch(e){
    pl.gSalvando=false; renderPlanejar();
    const fb=document.getElementById('pl-fb');
    if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent='Erro de rede: '+(e.message||e); }
  }
}

// Envia o lote validado para o servidor.
async function criaLote(){
  const pl=estado.planejar;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  if(pl.criando) return;
  pl.criando=true; renderPlanejar();
  try{
    const itens=pl.itens.map(it=>({ projeto:pl.projeto, tipoId:it.tipoId, resumo:it.resumo,
      descricao:it.descricao, respId:it.respId, paiKey:it.paiKey,
      estimativa:(pl.est||'').trim(), labels:plLabels(), venc:pl.venc||'' }));
    const j=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({itens,email:id.email,token:id.token})}).then(r=>r.json());
    pl.criando=false;
    if(j.erro){ const fb=document.getElementById('pl-fb');
      if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=j.erro; }
      renderPlanejar(); return; }
    // Junta o resumo aos erros (para exibir o que falhou).
    (j.erros||[]).forEach(e=>{ const it=pl.itens[e.indice]; if(it) e.resumo=it.resumo; });
    // Grade de edição em massa: cada criado nasce com o responsável/vencimento enviados.
    pl.grade=montaGrade((j.criados||[]).map(c=>{ const it=pl.itens[c.indice]||{};
      return {...c, respId:it.respId||'', venc:pl.venc||''}; }));
    pl.resultados=j; pl.itens=null;
    estado.cache={};            // os painéis verão os tickets novos
    renderPlanejar();
  }catch(e){
    pl.criando=false;
    const fb=document.getElementById('pl-fb');
    if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent='Erro de rede: '+(e.message||e); }
    renderPlanejar();
  }
}
// ---- Importação de CSV / colar do Excel ----
// Aceita TAB (colagem do Excel), ";" ou "," . Colunas: Resumo, Descrição, Tipo, Responsável.
function detectaDelim(text){
  const linha=(text.split('\n').find(l=>l.trim())||'');
  if(linha.includes('\t')) return '\t';
  const pv=(linha.match(/;/g)||[]).length, vg=(linha.match(/,/g)||[]).length;
  if(pv>0 && pv>=vg) return ';';
  if(vg>0) return ',';
  return '\t';                                 // coluna única (só resumos)
}
// Parser com suporte a campos entre aspas (que podem conter o delimitador e quebras de linha).
function parseDelimitado(text, delim){
  const rows=[]; let row=[], field='', inQ=false, i=0;
  const fimCampo=()=>{ row.push(field); field=''; };
  const fimLinha=()=>{ fimCampo(); rows.push(row); row=[]; };
  while(i<text.length){
    const c=text[i];
    if(inQ){
      if(c==='"'){ if(text[i+1]==='"'){ field+='"'; i+=2; continue; } inQ=false; i++; continue; }
      field+=c; i++; continue;
    }
    if(c==='"'){ inQ=true; i++; continue; }
    if(c===delim){ fimCampo(); i++; continue; }
    if(c==='\r'){ i++; continue; }
    if(c==='\n'){ fimLinha(); i++; continue; }
    field+=c; i++;
  }
  if(field!==''||row.length){ fimLinha(); }
  return rows.filter(r=>r.some(c=>String(c).trim()!==''));
}
const RE_HEAD=/resumo|summary|t[ií]tulo|title|assunto|descri|description|tipo|type|respons|assignee|atribu/i;
function temCabecalho(rows){
  if(!rows.length) return false;
  return rows[0].some(c=>RE_HEAD.test(String(c).trim()));
}
function mapeiaColunas(header){
  const idx={resumo:0,descricao:1,tipo:2,resp:3};
  if(header){
    const acha=(re)=>header.findIndex(h=>re.test(String(h).trim()));
    idx.resumo=Math.max(0,acha(/resumo|summary|t[ií]tulo|title|assunto/i));
    idx.descricao=acha(/descri|description/i);
    idx.tipo=acha(/tipo|type/i);
    idx.resp=acha(/respons|assignee|atribu/i);
  }
  return idx;
}
function tipoIdPorNome(nome){
  const n=String(nome).trim().toLowerCase(); if(!n) return '';
  const t=tiposDisponiveis().find(x=>(x.nome||'').toLowerCase()===n);
  return t?t.id:'';
}
function respIdPorNome(nome){
  const n=String(nome).trim().toLowerCase(); if(!n) return '';
  const ent=Object.entries(pessoasUnidas());
  let hit=ent.find(([a,o])=>((o&&o.nome)||'').toLowerCase()===n)
      || ent.find(([a,o])=>((o&&o.email)||'').toLowerCase()===n)
      || (n.length>=3 ? ent.find(([a,o])=>((o&&o.nome)||'').toLowerCase().includes(n)) : null);
  return hit?hit[0]:'';
}
// Texto colado -> { itens, avisos } usando o destino atual (projeto/tipo/responsável padrão).
function importaDeTexto(text, comHeader){
  const pl=estado.planejar;
  const rows0=parseDelimitado(text, detectaDelim(text));
  if(!rows0.length) return { itens:[], avisos:[] };
  let header=null, rows=rows0;
  if(comHeader){ header=rows0[0].map(c=>String(c).trim()); rows=rows0.slice(1); }
  const idx=mapeiaColunas(header);
  const avisos=new Set();
  const itens=rows.map(r=>{
    const get=(i)=> (i>=0 && i<r.length) ? String(r[i]).trim() : '';
    let tipoId=pl.tipoId;
    if(idx.tipo>=0){ const nm=get(idx.tipo); if(nm){ const id=tipoIdPorNome(nm);
      if(id) tipoId=id; else avisos.add(`Tipo “${nm}” não existe neste destino — usando o padrão.`); } }
    let respId=pl.respId;
    if(idx.resp>=0){ const nm=get(idx.resp); if(nm){ const id=respIdPorNome(nm);
      if(id) respId=id; else avisos.add(`Responsável “${nm}” não encontrado — usando o padrão.`); } }
    return { resumo:get(idx.resumo), descricao:idx.descricao>=0?get(idx.descricao):'',
      tipoId, respId, paiKey:paiEfetivo() };
  }).filter(it=>it.resumo);
  return { itens, avisos:[...avisos] };
}

// Baixa um modelo .csv (UTF-8 + BOM, separado por ";") pronto para o Excel: o time
// preenche, copia as células e cola de volta no importador.
function baixaModeloPlanejar(){
  const tipos=tiposDisponiveis();
  const tEx=(tipos.find(x=>x.id===estado.planejar.tipoId)||tipos[0]||{}).nome||'Tarefa';
  const head=['Resumo','Descrição','Tipo','Responsável'];
  const exemplos=[
    ['Levantar requisitos com o cliente','Agendar reunião inicial',tEx,''],
    ['Configurar ambiente de homologação','',tEx,''],
    ['Criar massa de testes','Usar dados do projeto anterior',tEx,''],
  ];
  baixaCSV('modelo_planejamento_jira.csv',[head,...exemplos]);
}

// ---- Padrões do lote + templates (compartilhados com o time via config) ----
// Labels do Jira não aceitam espaço: "em análise" vira "em-análise".
function plLabels(){
  return [...new Set(String(estado.planejar.labels||'').split(',')
    .map(s=>s.trim().replace(/\s+/g,'-')).filter(Boolean))].slice(0,10);
}
function aplicaTemplatePl(nome){
  const pl=estado.planejar; pl.tpl=nome||'';
  if(!nome){ renderPlanejar(); return; }
  const t=(cfg.planTemplates||[]).find(x=>x.nome===nome);
  if(!t){ pl.tpl=''; renderPlanejar(); return; }
  pl.texto=t.texto||''; pl.est=t.est||''; pl.labels=t.labels||''; pl.venc=t.venc||'';
  renderPlanejar();
  toast(`📑 Template “${nome}” aplicado — confira o destino (projeto/tipo) e valide.`);
}
function abreSalvarTemplatePl(){
  const pl=estado.planejar;
  if(!pl.texto.trim()){ toast('Escreva a lista de tickets antes de salvar como template.','warn'); return; }
  abreModal(`
    <h2>Salvar como template do time</h2>
    <div class="muted small">Guarda a <strong>lista de tickets</strong> e os <strong>padrões do lote</strong>
      (estimativa, labels, vencimento) para reutilizar depois — fica disponível para o time inteiro.
      Salvar com um nome que já existe <strong>substitui</strong> o template.</div>
    <div class="campo" style="margin-top:12px"><label>Nome do template</label>
      <input id="pl-tpl-nome" placeholder="ex.: Kick-off de projeto" value="${escA(pl.tpl||'')}"></div>
    <div style="display:flex;gap:10px;margin-top:12px">
      <button class="btn" id="pl-tpl-cancel">Cancelar</button>
      <button class="btn primario" id="pl-tpl-conf">💾 Salvar template</button>
    </div>
    <div class="ap-fb" id="pl-tpl-fb" hidden></div>`);
  setTimeout(()=>{ const i=document.getElementById('pl-tpl-nome'); if(i) i.focus(); },30);
}
function confirmaSalvarTemplatePl(){
  const pl=estado.planejar;
  const nome=(document.getElementById('pl-tpl-nome')||{value:''}).value.trim().slice(0,60);
  const fb=document.getElementById('pl-tpl-fb');
  if(!nome){ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent='Dê um nome ao template.'; } return; }
  cfg.planTemplates=(cfg.planTemplates||[]).filter(x=>x&&x.nome!==nome);
  cfg.planTemplates.push({nome, texto:pl.texto, est:(pl.est||'').trim(), labels:pl.labels||'', venc:pl.venc||''});
  cfg.planTemplates.sort((a,b)=>a.nome.localeCompare(b.nome,'pt'));
  if(cfg.planTemplates.length>30) cfg.planTemplates.length=30;
  pl.tpl=nome; salvaCfg();
  fechaModal(); renderPlanejar();
  toast(`💾 Template “${nome}” salvo para o time.`);
}
function excluiTemplatePl(){
  const pl=estado.planejar; if(!pl.tpl) return;
  cfg.planTemplates=(cfg.planTemplates||[]).filter(x=>x&&x.nome!==pl.tpl);
  toast(`🗑 Template “${pl.tpl}” excluído.`);
  pl.tpl=''; salvaCfg(); renderPlanejar();
}

// Modal de importação (colar do Excel / CSV) com pré-visualização.
function abreImportar(){
  abreModal(`
    <h2>Colar do Excel / importar CSV</h2>
    <div class="muted small">Cole direto do Excel (Ctrl/Cmd+V) ou um CSV. Colunas, nesta ordem:
      <strong>Resumo</strong>, Descrição, Tipo, Responsável. Só o <strong>Resumo</strong> é obrigatório;
      Tipo/Responsável em branco usam o padrão do formulário. Uma linha = um ticket.
      <button class="btn" id="pl-csv-modelo" style="margin-left:6px;padding:3px 9px">⬇ Baixar modelo (.csv)</button></div>
    <textarea id="pl-csv" class="pl-texto" style="min-height:170px;margin-top:10px"
      placeholder="Resumo&#9;Descrição&#9;Tipo&#9;Responsável&#10;Levantar requisitos&#9;reunião inicial&#9;Tarefa&#9;Ana&#10;Configurar ambiente&#9;&#9;Tarefa&#9;Julian"></textarea>
    <label class="check" style="margin-top:8px"><input type="checkbox" id="pl-csv-head"> Primeira linha é cabeçalho</label>
    <div id="pl-csv-prev" class="pl-dica" style="margin-top:10px"></div>
    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn" id="pl-csv-cancel">Cancelar</button>
      <button class="btn primario" id="pl-csv-import" disabled>Importar para revisão</button>
    </div>`);
  setTimeout(()=>{ const ta=document.getElementById('pl-csv'); if(ta) ta.focus(); atualizaPreviewCSV(); }, 30);
}
function atualizaPreviewCSV(){
  const ta=document.getElementById('pl-csv'), cb=document.getElementById('pl-csv-head'),
        prev=document.getElementById('pl-csv-prev'), btn=document.getElementById('pl-csv-import');
  if(!ta||!prev) return;
  const text=ta.value;
  if(cb && !cb.hasAttribute('data-touched')){                   // sugere cabeçalho automaticamente
    cb.checked=temCabecalho(parseDelimitado(text, detectaDelim(text)));
  }
  const { itens, avisos }=importaDeTexto(text, cb&&cb.checked);
  if(btn) btn.disabled=!itens.length;
  if(!itens.length){ prev.innerHTML='<span class="muted small">Cole os dados acima para pré-visualizar.</span>'; return; }
  const nomeTipo=(id)=>{ const t=tiposDisponiveis().find(x=>x.id===id); return t?t.nome:'(padrão)'; };
  const nomeResp=(id)=>{ const o=pessoasUnidas()[id]; return o?(o.nome||id):'—'; };
  const amostra=itens.slice(0,4).map(it=>`<tr><td>${esc(it.resumo)}</td><td>${esc(it.descricao||'—')}</td>
    <td>${esc(nomeTipo(it.tipoId))}</td><td>${esc(it.respId?nomeResp(it.respId):'—')}</td></tr>`).join('');
  prev.innerHTML=`<div><strong>${itens.length}</strong> ticket(s) detectado(s).</div>`+
    (avisos.length?`<div class="aviso" style="margin:8px 0">${avisos.map(esc).join('<br>')}</div>`:'')+
    `<div class="ts-wrap" style="margin-top:8px"><table class="pl-rev"><thead><tr>
       <th>Resumo</th><th>Descrição</th><th>Tipo</th><th>Responsável</th></tr></thead>
       <tbody>${amostra}</tbody></table></div>`+
    (itens.length>4?`<div class="muted small" style="margin-top:4px">…e mais ${itens.length-4}.</div>`:'');
}
function confirmaImportacao(){
  const ta=document.getElementById('pl-csv'), cb=document.getElementById('pl-csv-head');
  if(!ta) return;
  const { itens }=importaDeTexto(ta.value, cb&&cb.checked);
  if(!itens.length) return;
  if(itens.length>100){ const prev=document.getElementById('pl-csv-prev');
    if(prev) prev.innerHTML=`<div class="aviso">São ${itens.length} linhas — o máximo é 100 por lote. Reduza a seleção.</div>`; return; }
  estado.planejar.itens=itens;                 // vai direto para a revisão
  estado.planejar.resultados=null;
  fechaModal();
  renderPlanejar();
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
// ---- Tela Planejar: cliques e edições ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const t=e.target.closest('button'); if(!t) return;
  const pl=estado.planejar;
  if(t.hasAttribute('data-pl-modo')){ pl.modo=t.getAttribute('data-pl-modo'); pl.epicoKey=''; pl.historiaKey=''; ajustaTipo(); renderPlanejar(); }
  else if(t.hasAttribute('data-pl-hist')){ const k=t.getAttribute('data-pl-hist');
    pl.historiaKey=(pl.historiaKey===k?'':k); ajustaTipo(); renderPlanejar(); }
  else if(t.id==='pl-tentar'){ pl.projetosErro=''; renderPlanejar(); }
  else if(t.id==='pl-validar'){
    const fb=document.getElementById('pl-fb');
    const mostra=(m)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=m; } };
    if(!pl.projeto) return mostra('Escolha o projeto.');
    if(!pl.tipoId) return mostra('Escolha o tipo de ticket.');
    const itens=montaItens();
    if(!itens.length) return mostra('Digite pelo menos um ticket (uma linha por ticket).');
    if(itens.length>100) return mostra(`São ${itens.length} linhas — o máximo é 100 por lote.`);
    pl.itens=itens; renderPlanejar();
  }
  else if(t.id==='pl-importar'){
    const fb=document.getElementById('pl-fb');
    if(!pl.projeto||!pl.tipoId){ if(fb){ fb.hidden=false; fb.className='ap-fb err';
      fb.textContent='Escolha o projeto e o tipo de ticket antes de colar a planilha.'; } return; }
    abreImportar();
  }
  else if(t.id==='pl-modelo'){ baixaModeloPlanejar(); }
  else if(t.id==='pl-voltar'){ pl.itens=null; renderPlanejar(); }
  else if(t.id==='pl-criar'){ criaLote(); }
  else if(t.hasAttribute('data-pl-del')){ pl.itens.splice(Number(t.getAttribute('data-pl-del')),1);
    if(!pl.itens.length) pl.itens=null; renderPlanejar(); }
  else if(t.id==='pl-novo'){ pl.resultados=null; pl.grade=null; pl.texto=''; pl.textoEstr=''; renderPlanejar(); }
  // ---- 📐 Colar estrutura ----
  else if(t.id==='pl-estr-validar'){
    const fb=document.getElementById('pl-fb');
    const mostra=(m)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=m; } };
    if(!pl.projeto) return mostra('Escolha o projeto.');
    const its=parseEstrutura(pl.textoEstr);
    if(!its.length) return mostra('Cole a estrutura (uma linha por item: nível + título).');
    if(its.length>100) return mostra(`São ${its.length} itens — o máximo é 100 por lote.`);
    pl.estru=its; renderPlanejar();
  }
  else if(t.id==='pl-estr-voltar'){ pl.estru=null; renderPlanejar(); }
  else if(t.id==='pl-estr-criar'){ criaEstrutura(); }
  else if(t.hasAttribute('data-pl-estr-del')){ estruRemove(Number(t.getAttribute('data-pl-estr-del'))); renderPlanejar(); }
  // ---- Grade pós-criação (edição em massa) ----
  else if(t.id==='pl-g-apl-resp'){
    const v=(document.getElementById('pl-g-bresp')||{}).value||'';
    if(!v) return;
    (pl.grade||[]).forEach(x=>{ if(x.sel){ x.respId=(v==='__rem'?'':v); x.st=''; } });
    renderPlanejar();
  }
  else if(t.id==='pl-g-apl-venc'){
    const v=(document.getElementById('pl-g-bvenc')||{}).value||'';
    (pl.grade||[]).forEach(x=>{ if(x.sel){ x.venc=v; x.st=''; } });
    renderPlanejar();
  }
  else if(t.id==='pl-g-salvar'){ salvaGrade(); }
  else if(t.id==='pl-tpl-salvar'){ abreSalvarTemplatePl(); }
  else if(t.id==='pl-tpl-del'){ excluiTemplatePl(); }
  else if(t.hasAttribute('data-arv-op')){ const a=arvEstado(); const no=ARV_NOS[a.no];
    const o=no&&no.op&&no.op[+t.getAttribute('data-arv-op')];
    if(o){ a.hist.push({id:a.no,label:o.label}); a.no=o.next; a.erro='';
      if(o.set) Object.assign(a.form, o.set);   // a opção pode gravar campos (ex.: frequência da rotina)
      // ENTRAR numa folha reaplica as sugestões DELA (senão, ao voltar e escolher
      // outro departamento/contexto, projeto/departamento antigos ficavam grudados).
      const prox=ARV_NOS[o.next];
      if(prox && prox.result && (prox.cria||prox.planejados)){
        const ps=(_projetosCache||[]);
        let sug=arvProjetosSugeridos(prox.filtro||'', prox.catRe);
        const fixo=prox.filtro==='avulsa'?'TAD':(prox.soProjeto||'');
        if(fixo){ const px=ps.find(p=>p.key===fixo)||sug[0]; sug=px?[px]:[]; }
        // Folhas com escolha explícita (cards) começam SEM projeto — a pessoa escolhe.
        a.form.projeto=prox.escolheProjeto?'':((sug[0]&&sug[0].key)||'');
        a.form.tipoId=''; a.form.epicoKey=''; a.form.amsConsId=''; a.form.amsCliId='';
        a.form.depto=prox.depto||(prox.filtro==='avulsa'?'':a.form.depto);
      }
      arvRender(); } }
  else if(t.hasAttribute('data-arv-proj')){ const a=arvEstado();
    a.form.projeto=t.getAttribute('data-arv-proj')||''; a.form.tipoId=''; a.erro=''; arvRender(); }
  else if(t.hasAttribute('data-arv-trocaproj')){ const a=arvEstado();
    a.form.projeto=''; a.form.tipoId=''; a.erro=''; arvRender(); }
  else if(t.hasAttribute('data-arv-voltar')){ const a=arvEstado();
    const ant=a.hist.pop(); a.no=ant?ant.id:'start'; a.erro=''; a.feito=null; arvRender(); }
  else if(t.hasAttribute('data-arv-bc')){ const a=arvEstado(); const i=+t.getAttribute('data-arv-bc');
    if(i<0){ a.no='start'; a.hist=[]; } else if(a.hist[i]){ a.no=a.hist[i].id; a.hist=a.hist.slice(0,i); }
    a.erro=''; a.feito=null; arvRender(); }
  else if(t.hasAttribute('data-arv-reiniciar')){ estado.planejar.arv=null; arvEstado(); arvRender(); }
  else if(t.hasAttribute('data-arv-criar')){ arvCria(); }
  else if(t.hasAttribute('data-arv-aus')){ abreAusencia(t.getAttribute('data-arv-aus')); }
});
document.getElementById('conteudo').addEventListener('change', (e)=>{
  const pl=estado.planejar; const t=e.target; if(!t||!t.id&&!t.className) return;
  if(t.id==='pl-projeto'){ pl.projeto=t.value; pl.epicoKey=''; pl.historiaKey=''; ajustaTipo(); renderPlanejar(); }
  else if(t.id==='pl-tipo'){ pl.tipoId=t.value; }
  else if(t.id==='pl-resp'){ pl.respId=t.value; }
  else if(t.id==='pl-est'){ pl.est=t.value; }
  else if(t.id==='pl-labels'){ pl.labels=t.value; }
  else if(t.id==='pl-venc'){ pl.venc=t.value; }
  else if(t.id==='pl-tpl'){ aplicaTemplatePl(t.value); }
  else if(t.hasAttribute&&t.hasAttribute('data-arv-f')){ const a=arvEstado(); const c=t.getAttribute('data-arv-f');
    a.form[c]=t.value;
    if(c==='projeto'){ a.form.tipoId=''; a.form.epicoKey=''; a.form.amsConsId=''; a.form.amsCliId=''; arvRender(); }
    else if(c==='amsConsId'){ a.form.amsCliId=''; arvRender(); } }
  else if(t.id==='pl-epico'){ pl.epicoKey=t.value; pl.historiaKey=''; ajustaTipo(); renderPlanejar(); }
  else if(t.id==='pl-historia'){ pl.historiaKey=t.value; ajustaTipo(); renderPlanejar(); }
  else if(t.classList&&t.classList.contains('pl-resumo')){ const i=+t.getAttribute('data-pl-i');
    if(pl.itens&&pl.itens[i]){ pl.itens[i].resumo=t.value; renderPlanejar(); } }
  else if(t.classList&&t.classList.contains('pl-desc')){ const i=+t.getAttribute('data-pl-i');
    if(pl.itens&&pl.itens[i]) pl.itens[i].descricao=t.value; }
  else if(t.classList&&t.classList.contains('pl-tipo-row')){ const i=+t.getAttribute('data-pl-i');
    if(pl.itens&&pl.itens[i]) pl.itens[i].tipoId=t.value; }
  else if(t.classList&&t.classList.contains('pl-resp-row')){ const i=+t.getAttribute('data-pl-i');
    if(pl.itens&&pl.itens[i]) pl.itens[i].respId=t.value; }
  // ---- 📐 Colar estrutura + grade de edição em massa ----
  else if(t.hasAttribute&&t.hasAttribute('data-pl-slot')){ pl.tiposSlot[t.getAttribute('data-pl-slot')]=t.value; renderPlanejar(); }
  else if(t.classList&&t.classList.contains('pl-estr-tit')){ const i=+t.getAttribute('data-pl-i');
    if(pl.estru&&pl.estru[i]){ const it=pl.estru[i]; it.titulo=t.value.trim();
      if(it.nivel>0){ it.erro=!it.titulo?'Título vazio.':(it.titulo.length>255?`Título com ${it.titulo.length} caracteres (máx. 255).`:''); }
      renderPlanejar(); } }
  else if(t.classList&&t.classList.contains('pl-g-sel')){ const i=+t.getAttribute('data-pl-i');
    if(pl.grade&&pl.grade[i]){ pl.grade[i].sel=t.checked; renderPlanejar(); } }
  else if(t.id==='pl-g-all'){ const v=t.checked; (pl.grade||[]).forEach(x=>{ x.sel=v; }); renderPlanejar(); }
  else if(t.classList&&t.classList.contains('pl-g-resp')){ const i=+t.getAttribute('data-pl-i');
    if(pl.grade&&pl.grade[i]){ pl.grade[i].respId=t.value; pl.grade[i].st=''; renderPlanejar(); } }
  else if(t.classList&&t.classList.contains('pl-g-venc')){ const i=+t.getAttribute('data-pl-i');
    if(pl.grade&&pl.grade[i]){ pl.grade[i].venc=t.value; pl.grade[i].st=''; renderPlanejar(); } }
  else if(t.id==='pl-g-bresp'){ pl.gbResp=t.value; }
  else if(t.id==='pl-g-bvenc'){ pl.gbVenc=t.value; }
});
// O texto do lote não re-renderiza a cada tecla — só guarda e atualiza o contador.
document.getElementById('conteudo').addEventListener('input', (e)=>{
  if(e.target && e.target.id==='pl-texto'){
    estado.planejar.texto=e.target.value;
    const c=document.getElementById('pl-contador');
    if(c) c.textContent=String(e.target.value.split('\n').map(l=>l.trim()).filter(Boolean).length);
  }
  if(e.target && e.target.id==='pl-texto-estr'){
    estado.planejar.textoEstr=e.target.value;
    const c=document.getElementById('pl-estr-cont');
    if(c) c.textContent=String(e.target.value.split('\n').map(l=>l.trim()).filter(Boolean).length);
  }
});
