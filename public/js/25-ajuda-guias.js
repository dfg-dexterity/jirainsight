// Jira Insights · 25 · ❓ AJUDA, feedback, 🗺 TOUR e 🧭 GUIAS INTERATIVOS por tela.
// ======================================================================================

// ============================ AJUDA, TOUR E FEEDBACK =================================
const FB_PREFIXO = { duvida:'Dúvida', sugestao:'Sugestão', bug:'Bug' };

function abreAjuda(){
  const id=idApontar();
  abreModal(`
    <h2>Ajuda &amp; Feedback</h2>
    <div class="muted small">Como o aplicativo funciona — <b>guias interativos</b> que explicam cada item na própria tela, o passo a passo escrito e os canais para dúvidas, sugestões e bugs.</div>
    <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn primario" id="aj-guia-atual" data-tip="Explica, item por item, a tela que está aberta agora">🧭 Guia da tela atual</button>
      <button class="btn" id="aj-tour">▶ Tour rápido (navegação)</button>
      <button class="btn" id="aj-tour-telas" data-tip="Passa por TODAS as telas do aplicativo, uma a uma, explicando o que cada uma faz">🗺 Tour completo — todas as telas</button>
    </div>

    <details class="help-sec" open><summary>🧭 Guias interativos — escolha a tela</summary><div class="help-body">
      Cada guia <b>abre a tela e destaca um item por vez</b>, explicando para que serve — do jeito que
      você faria com um colega ao lado. Dá para sair a qualquer momento e voltar de onde parou;
      o ✓ marca os que você já viu. Dentro de qualquer tela, o botão flutuante <b>🧭 Guia desta tela</b>
      (ou a tecla <b>?</b>) abre o guia daquela tela na hora.
      ${guiasIndiceHTML()}
    </div></details>
    <details class="help-sec"><summary>Visão geral</summary><div class="help-body">
      O painel cruza o <b>Jira</b> (atividade, tickets, status) com o <b>Clockwork</b> (horas apontadas) para
      acompanhar apontamentos, metas e produtividade — e ainda permite <b>apontar horas</b>, <b>mover status</b>
      e <b>criar tickets</b>. Os dados ficam em cache por alguns minutos; use <b>Atualizar</b> para forçar.
    </div></details>
    <details class="help-sec"><summary>TODAS as telas (por grupo do menu — clique para abrir)</summary><div class="help-body"><ul>
      <li><span class="lnk" data-aj-goto="acoes"><b>🏠 Início — Ações de hoje</b></span> — a página principal: SEU dia num relance (horas × meta, vencidos, plano da semana, reuniões sem ticket, Inbox), ações do time, a 🌳 árvore "Onde crio meu ticket?" e os atalhos 🚀.<button class="aj-g" data-aj-guia="acoes">🧭 guia</button></li>
      <li><span class="lnk" data-aj-goto="visao"><b>📊 Visão Geral</b></span> — painel executivo: apontamento do time, saúde da entrega, alertas críticos e atividade — cada bloco leva ao detalhe.<button class="aj-g" data-aj-guia="visao">🧭 guia</button></li>
      <li><b>👤 Meu trabalho:</b></li>
      <li>· <span class="lnk" data-aj-goto="minhasemana"><b>📋 Meu Planejamento</b></span> — planeje a semana por atividade (data + projeto + horas, sem tickets), envie ao gestor e compare planejado × realizado.<button class="aj-g" data-aj-guia="minhasemana">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="apontar"><b>⏱ Apontar</b></span> — horas, status, vencimento, comentários, transferências, reuniões em grupo e os 🕑 recentes com reaponte de 1 clique.<button class="aj-g" data-aj-guia="apontar">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="agenda"><b>📅 Agenda</b></span> — eventos do Outlook viram ticket de reunião (projeto à escolha ou vínculo), com convites de apontamento ao time interno e o painel 🎫 Controle de tickets (quem cria, criado ou pendente — conferido no Jira — e 📨 aviso pelo Inbox).<button class="aj-g" data-aj-guia="agenda">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="inbox"><b>📥 Inbox</b></span> — convites, menções, reuniões sem ticket e aprovações que dependem de você (o selo vermelho soma tudo).<button class="aj-g" data-aj-guia="inbox">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="mencoes"><b>💬 Menções</b></span> — responda onde foi @marcado, com anexos e @marcações, sem ir ao Jira.<button class="aj-g" data-aj-guia="mencoes">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="meudia"><b>📍 Meu dia</b></span> — timetracking assistido (beta): sugestões de apontamento por IA a partir do uso do computador.<button class="aj-g" data-aj-guia="meudia">🧭 guia</button></li>
      <li><b>Planejamento:</b></li>
      <li>· <span class="lnk" data-aj-goto="alocacao"><b>🧑‍💼 Alocação (macro)</b></span> — board por pessoa (função + % capacidade), Gantt, 📆 Semanas (trava semanal + aprovação dos planos), skills, vagas 🔮, relatórios com custo e simulação.<button class="aj-g" data-aj-guia="alocacao">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="planejamento"><b>📅 Planejamento macro</b></span> — esforço por função (fases = épicos) com planejado × realizado e valor.<button class="aj-g" data-aj-guia="planejamento">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="planejar"><b>📝 Criação de Ticket</b></span> — tickets em lote (ou colando do Excel), dentro de épicos, com padrões e templates; 📐 colar estrutura Épico → História → Task e edição em massa de data/responsável.<button class="aj-g" data-aj-guia="planejar">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="ondecrio"><b>🌳 Onde crio o ticket?</b></span> — a árvore de decisão da governança cria o ticket no projeto certo (também na página inicial).<button class="aj-g" data-aj-guia="ondecrio">🧭 guia</button></li>
      <li><b>Análise:</b></li>
      <li>· <span class="lnk" data-aj-goto="projetos"><b>📁 Projetos</b></span> — BI por projeto direto do Jira, com drill-down total.<button class="aj-g" data-aj-guia="projetos">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="resumo"><b>Resumo</b></span> — KPIs, faturável, top projetos e o resumo por IA.<button class="aj-g" data-aj-guia="resumo">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="timesheet"><b>Timesheet</b></span> — pessoa × dia com lacunas até a meta; ⬇ exporta em vários recortes.<button class="aj-g" data-aj-guia="timesheet">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="ranking"><b>Ranking</b></span> — cumprimento de apontamento por semana/mês/ano, com 🏆 pódio, ⭐ estrelinhas de meta batida e 🔥 sequências; + engajamento por pessoa.<button class="aj-g" data-aj-guia="ranking">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="tickets"><b>Tickets</b></span> — issues do período (horas + atividade), agrupáveis.<button class="aj-g" data-aj-guia="tickets">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="qualidade"><b>🔎 Qualidade (IA)</b></span> — auditoria dos tickets criados vs. boas práticas TI-04-006 (nota + ações).<button class="aj-g" data-aj-guia="qualidade">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="audit"><b>🕵️ Auditoria de Tickets</b></span> — validações TI-04-014 por pessoa, com drill-down.<button class="aj-g" data-aj-guia="audit">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="analytics"><b>📈 Analytics</b></span> — 26 visões de governança; cada achado abre na Gestão para agir.<button class="aj-g" data-aj-guia="analytics">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="relatorios"><b>📚 Central de Relatórios</b></span> — o catálogo oficial (R01–R27) numa matriz relatório × tipo de projeto (O essencial · R recomendado · – não se aplica), com o link para a tela que entrega cada um; gestores ajustam a matriz.<button class="aj-g" data-aj-guia="relatorios">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="metricas"><b>📈 Métricas por tipo de projeto</b></span> — para cada tipo (DEA, DEF, PEA, PEF, AMS, ARQ, IMI, IPA, ITPR) as métricas que interessam: horas por mês × equipe e Sênior, estimado × gasto por épico, tarefas por nível, rentabilidade, vendidas × realizadas, custo administrativo, backlog em horas e R$, custo por épico/departamento, carga do planejamento — tudo com drill até o ticket.<button class="aj-g" data-aj-guia="metricas">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="roadmap"><b>🗺️ Roadmap</b></span> — o que está chegando na ferramenta.<button class="aj-g" data-aj-guia="roadmap">🧭 guia</button></li>
      <li><b>Gestão:</b></li>
      <li>· <span class="lnk" data-aj-goto="gestao"><b>🛠 Gestão de Tickets</b></span> — seleção múltipla + ações em massa (atribuir, status, comentar, reprogramar, mover, épicos, duplicados, excluir).<button class="aj-g" data-aj-guia="gestao">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="alertas"><b>🚨 Alertas</b></span> — atrasados/críticos com reprogramação justificada em lote.<button class="aj-g" data-aj-guia="alertas">🧭 guia</button></li>
      <li>· <b>🗂 Reuniões</b> — tela unificada: <span class="lnk" data-aj-goto="reclassificar"><b>Reclassificar</b></span> (mover reuniões do RDF para o projeto certo) e <span class="lnk" data-aj-goto="reuvinc"><b>Vincular a tickets</b></span> (registro em AMS ou 🔁 transferir QUALQUER ticket pelo número).<button class="aj-g" data-aj-guia="reclassificar">🧭 guia — reclassificar</button><button class="aj-g" data-aj-guia="reuvinc">🧭 guia — vincular</button></li>
      <li>· <span class="lnk" data-aj-goto="ams"><b>AMS</b></span> — apuração por ciclo: banco de horas, faturável × não faturável e PDF.<button class="aj-g" data-aj-guia="ams">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="receita"><b>💰 Receita</b></span> — bolsa de horas e projetos (consumo × contratado + projeção).<button class="aj-g" data-aj-guia="receita">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="rentab"><b>💹 Rentabilidade de projetos</b></span> — cadastre duração, carga vendida e valor-hora, planeje quem faz o quê mês a mês (execução e gestão), simule cenários (esforço previsto, eficiência, alocar um consultor mais barato) e compare com o realizado; custo sempre = horas × custo/h de cada pessoa.<button class="aj-g" data-aj-guia="rentab">🧭 guia</button></li>
      <li><b>Configurações:</b></li>
      <li>· <span class="lnk" data-aj-goto="config"><b>⚙️ Central de configurações</b></span> — todos os ajustes num lugar só.<button class="aj-g" data-aj-guia="config">🧭 guia</button></li>
      <li>· <span class="lnk" data-aj-goto="admin"><b>Contratos (Admin)</b></span> — cadastro de clientes/contratos (base do AMS/Receita).<button class="aj-g" data-aj-guia="admin">🧭 guia</button></li>
      <li>· <b>🎯 Metas & ausências</b> e <b>🗒 Histórico de ações</b> — no menu Configurações (metas, feriados, ausências e a auditoria do que o time fez pelo painel).</li>
    </ul></div></details>
    <details class="help-sec"><summary>Apontar horas e mover status</summary><div class="help-body">
      Na aba <b>⏱ Apontar</b>: identifique-se uma vez (e-mail + token de API do Jira). Filtre pelos cards do topo
      ou pelos atalhos, escolha um chamado, clique num chip de tempo (30m/1h/2h…) ou digite (<b>1h30</b>, <b>1:30</b>,
      <b>45m</b>) e clique <b>Apontar</b>. Para mudar o status, clique no status do chamado e escolha o destino.
      No <b>fim da página</b>, recolhido, o painel <b>🕑 Meus tickets recentes</b> lista onde <b>você</b> apontou
      nos últimos 14 dias, para <b>reapontar com 1 clique</b> sem procurar o ticket de novo (o título mostra a
      contagem; 1 clique expande).
      Abrindo a página, o protagonista é o painel <b>⏱ Meu timesheet</b>, que mostra a sua semana como nas ferramentas de timetracking:
      <b>🧮 Grade</b> (matriz <b>Projeto → Ticket × dias</b>, com Σ por linha, totais por dia e fim de semana
      destacado) e <b>🗓 Calendário</b> (blocos posicionados pela <b>hora de início</b> de cada worklog, coloridos
      por projeto). Navegue entre as semanas (‹ hoje ›), recolha projetos, acompanhe o alvo semanal
      (<i>apontado de meta</i>, descontando feriados e ausências) e veja o <b>aviso quando um dia passa da meta</b>
      (padrão 8h/dia, ajustável em Metas). O que você aponta na sessão entra na hora com o selo 🕓.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="apontar">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Navegação, novidades e versão</summary><div class="help-body">
      <b>Logo</b> (canto superior esquerdo): clique para voltar ao <b>início</b>. Os controles do topo aparecem
      <b>só onde fazem sentido</b>: Período/filtros/Exportar nas telas de análise; as telas operacionais têm controles próprios.
      Em <b>Configurações</b> ficam <b>Contratos (Admin)</b>, <b>🎯 Metas & ausências</b> e o <b>🗒 Histórico de ações</b>; em <b>⋯ Mais</b>, <b>✨ Novidades</b> e a <b>❓ Ajuda</b>; <b>🌙</b> alterna claro/escuro.
      No <b>rodapé</b> fica a <b>versão em produção</b> com link para o pull request no GitHub.
      <b>↑ Topo</b>: botão flutuante que aparece ao rolar. Links são <b>compartilháveis</b>: a aba e os filtros ficam na URL.
      <b>🧭 Guia desta tela</b>: o botão flutuante do canto inferior direito (ou a tecla <b>?</b>) explica,
      item por item, a tela que está aberta — o pontinho vermelho avisa quando você ainda não viu o guia dela.
    </div></details>
    <details class="help-sec"><summary>Comentar e transferir o responsável</summary><div class="help-body">
      Na aba <b>⏱ Apontar</b> os chamados ficam <b>agrupados por projeto</b> — clique no <b>cabeçalho do projeto</b>
      para <b>expandir/recolher</b> o grupo (ou use “Expandir/Recolher todos”). Em cada chamado: <b>💬 comentar</b> abre um campo para escrever e enviar um comentário no Jira —
      com o seletor <b>Marcar (@)</b> para citar colegas um a um ou <b>👥 marcar o time</b> inteiro de uma vez (o Jira notifica cada pessoa marcada);
      <b>👤 responsável ▾</b> abre o seletor para <b>transferir</b> o chamado para outra pessoa (ou <b>para mim</b> /
      <b>remover responsável</b>); <b>🔀 mover</b> <b>reclassifica</b> o chamado para <b>outro projeto</b> (mostra só os
      destinos que têm um tipo com o mesmo nome — ex.: Tarefa/Bug). Tudo é gravado no Jira com o seu usuário e respeita as permissões.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="apontar">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Reprogramar / reagendar vencimentos</summary><div class="help-body">
      Na aba <b>⏱ Apontar</b>, clique no <b>📅 vencimento</b> de um chamado (vencido ou não) para abrir o painel de
      reagendamento, com atalhos <b>Hoje</b>, <b>Amanhã</b> e <b>Próxima semana</b>, um campo de <b>data</b> livre e
      <b>remover data</b>. Para programar tarefas que ainda <b>não têm vencimento</b>, marque <b>Incluir sem
      vencimento</b> (ou o filtro <b>Sem vencimento</b>) — elas aparecem com o botão <b>📅 definir vencimento</b>.
      A mudança é gravada no Jira com o seu usuário e respeita suas permissões.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="apontar">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Reunião do time (apontar para várias pessoas)</summary><div class="help-body">
      Participou de uma reunião com mais gente? Na aba <b>⏱ Apontar</b>, use <b>👥 Apontar reunião p/ várias
      pessoas</b> (ou o botão <b>👥 em grupo</b> nos chamados de reunião): escolha o ticket, o tempo, o dia e
      <b>quem participou</b> (dá para <b>salvar a seleção como time</b> e reusar). Você aponta o seu na hora; os
      demais recebem um <b>convite</b> e confirmam com <b>1 clique</b> no topo da aba ⏱ Apontar — o worklog de cada
      um sai <b>no usuário da própria pessoa</b>. Com o webhook configurado, o canal do Teams recebe o aviso.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="apontar">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Planejar (criar tickets em lote)</summary><div class="help-body">
      Na aba <b>📝 Planejar</b>: escolha projeto, tipo e responsável; digite <b>um ticket por linha</b> (use “;” para
      “resumo ; descrição”) ou <b>cole do Excel/CSV</b>. Revise (erros destacados) e crie — o resultado lista os
      tickets criados com links.<br>
      <b>Planejamento de épico (dois níveis):</b> escolha o <b>épico</b> — a tela mostra as <b>histórias já abertas
      nele</b>. Deixando em <b>“criar direto no épico”</b>, os itens viram <b>histórias/tarefas do épico</b>; escolhendo
      uma história (no seletor ou no botão <i>planejar sub-tarefas aqui</i>), os itens viram <b>sub-tarefas</b> dela.
      Assim dá para planejar primeiro as histórias do épico e depois detalhar cada uma.<br>
      <b>📐 Colar estrutura (três níveis de uma vez):</b> cole do Excel linhas no formato <b>nível + título</b>
      (Épico / História / Task) e o app monta a árvore: histórias entram no <b>último épico acima</b>, tasks viram
      <b>sub-tarefas da última história</b> (ou tarefas do épico, se vierem antes de qualquer história). Na revisão
      dá para ajustar o <b>tipo de ticket por nível</b> e os títulos; a criação sai em <b>ondas</b>, já vinculada.<br>
      <b>🧮 Edição em massa (pós-criação):</b> o resultado vira uma <b>grade estilo planilha</b> — mude a
      <b>data limite</b> e o <b>responsável</b> linha a linha, ou marque várias e <b>aplique aos marcados</b>;
      nada muda no Jira até clicar em <b>💾 Salvar</b>.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="planejar">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>⏱ Apontamento do time na primeira página (hoje e nesta semana)</summary><div class="help-body">
      O objetivo nº 1 do painel é que <b>ninguém esqueça de apontar</b>. Por isso a tela <b>🏠 Início</b> abre com o card
      <b>⏱ Apontamento do time</b>, logo abaixo do seu resumo pessoal:<br>
      <ul style="margin:6px 0 6px 18px;line-height:1.75">
        <li><b>Placar do dia</b> — quantas pessoas já lançaram horas hoje, quanto o time apontou <b>hoje</b> e <b>na semana</b>
          (contra o esperado) e quantos <b>dias úteis ficaram em branco</b> na semana.</li>
        <li><b>Uma linha por pessoa</b> — quanto ela lançou <b>hoje contra a meta dela</b>, o total da <b>semana contra o
          esperado</b> (com o %) e a <b>fita de dias</b> de segunda até hoje: 🟩 dia fechado, 🟨 parcial, 🟥 em branco,
          ▫️ dia que não é cobrado.</li>
        <li><b>Quem não apontou sobe para o topo</b>, e você aparece em primeiro, destacado. Clicar numa pessoa abre o
          <b>📊 Timesheet</b> já filtrado nela.</li>
      </ul>
      A <b>meta</b> é a jornada de cada pessoa (<b>Configurações → 🎯 Metas</b>, global ou individual), descontando fins de
      semana, <b>feriados</b>, <b>ausências</b> e a <b>vigência</b> (quem entrou depois ou já saiu não é cobrado).
      <b>O dia de hoje nunca conta como “em branco”</b> — ele ainda está correndo. Assim que você aponta pelo painel, a sua
      linha se atualiza na hora; o <b>🔄 atualizar</b> relê tudo do Clockwork.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="acoes">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>🎫 Criar ticket rápido — linguagem natural, voz e ações no mesmo pedido</summary><div class="help-body">
      No card <b>🎫 Criar ticket rápido</b> da tela <b>🏠 Início</b> (ou no app 📲 <b>voz.html</b> do celular, no Atalho da
      <b>Siri</b> e na skill da <b>Alexa</b>) você <b>descreve em português</b> e a IA monta o ticket. O pedido pode ser
      <b>acionável</b> — além de criar, ela executa o que você mandar fazer:<br>
      <ul style="margin:6px 0 6px 18px;line-height:1.75">
        <li><b>👤 Responsável</b> — “<i>no nome da Jéssica</i>”, “<i>atribua ao Pedro</i>”. O nome é casado com as pessoas ativas do Jira.</li>
        <li><b>⏱ Apontar horas</b> — “<i>aponte 30 minutos</i>”, “<i>lance 1h30</i>”. O worklog sai <b>no SEU usuário</b> (é o seu token) — para lançar
          no tempo de outra pessoa, use o <b>📨 convidar para apontar</b> que aparece no fim.</li>
        <li><b>💬 Comentário com @menção</b> — “<i>marque o Diego no comentário: esse é o ticket da nossa conversa</i>”. Quem for marcado
          recebe a notificação do Jira.</li>
        <li><b>🔀 Status</b> — “<i>passe para finalizado</i>”. O status é casado com o <b>fluxo do próprio projeto</b>; se aquela transição
          não existir a partir do status inicial, o ticket continua criado e o motivo aparece na tela.</li>
      </ul>
      A <b>prévia</b> mostra tudo antes de gravar — projeto, épico, título, descrição, responsável, vencimento, horas, status,
      comentário e quem será marcado — e <b>todos os campos são editáveis</b> ali mesmo. Depois de confirmar, o resultado lista
      <b>ação por ação</b> o que deu certo e o que não deu (o ticket é criado mesmo que uma ação falhe).
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="acoes">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Reclassificar reuniões</summary><div class="help-body">
      Na aba <b>🔀 Reclassificar</b>: selecione as reuniões abertas do RDF, escolha o projeto destino e mova.
      O <b>tipo</b> é mantido e o <b>status</b> é preservado quando existe no destino.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="reclassificar">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Gestão de Tickets (ações em massa)</summary><div class="help-body">
      Em <b>Operação › 🛠 Gestão de Tickets</b>: filtre (vencimento-limite, projeto, responsável, status, busca),
      escolha a visualização (<b>▤ Lista</b>, <b>▦ Tabela</b> ou <b>🗂 Quadro</b> — no quadro, <b>clicar no cartão seleciona</b>)
      e marque os tickets. A <b>barra de ações</b> aparece embaixo: <b>👤 Atribuir</b>, <b>🔁 Alterar status</b> (transição
      pelo nome, aplicada ticket a ticket), <b>💬 Comentar</b> (mesmo texto em todos), <b>📅 Reprogramar</b> (com motivo) e
      <b>🗑 Excluir</b> — a exclusão é <b>irreversível</b> e exige digitar <b>EXCLUIR</b>. Tudo sai no seu usuário do Jira,
      respeitando as suas permissões; a seleção persiste ao trocar de visualização.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="gestao">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Vincular Reuniões a Tickets de AMS</summary><div class="help-body">
      Em <b>Operação › 🔗 Vincular Reuniões</b>: escolha uma reunião aberta e clique <b>Vincular →</b>. O assistente
      oferece dois caminhos: <b>➕ criar um ticket novo</b> de apoio funcional num projeto de AMS (tipo detectado,
      resumo e duração pré-preenchidos com as horas apontadas na reunião) ou <b>🔗 comentar num ticket aberto</b>
      do projeto. Nos dois casos dá para registrar a duração como <b>seu apontamento</b> no destino e, ao confirmar,
      a <b>reunião é excluída</b> — os detalhes (data, relator, horas por pessoa, descrição) ficam gravados no destino.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="reuvinc">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Alocação (resource planning)</summary><div class="help-body">
      Em <b>Planejamento › 🧑‍💼 Alocação</b>: no <b>Planejamento por pessoa</b> (embaixo), adicione a pessoa,
      os projetos dela e o <b>% da capacidade</b> em cada um — tudo inline, <b>salva sozinho</b>. Em cima, as visões:
      <b>Por Pessoa</b> (utilização semana/mês; capacidade desconta fins de semana, feriados e ausências),
      <b>Linha do tempo</b> (Gantt: <b>arraste para mover</b>, puxe as bordas para redimensionar, botão “→ hoje”),
      <b>Por Projeto</b> (equipe + planejado × apontado), <b>Empresa</b> (faturável × não faturável),
      <b>Por Skill</b> (capacidade × demanda por competência, com cadastro de skills) e <b>Simulação</b>
      (cenários “e se…” que não tocam nos dados + busca <b>“quem cabe?”</b> por folga).
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="alocacao">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Planejamento macro (planejado × realizado)</summary><div class="help-body">
      Em <b>Planejamento › 📅 Planejamento macro</b>: monte o plano de esforço do projeto <b>por função</b>
      (Implementação usa as <b>fases = épicos do Jira</b>; AMS/interno usa o projeto inteiro), com horas, período e
      % por função (pode passar de 100%). Atribuindo <b>pessoas às funções</b> e clicando <b>Calcular realizado</b>,
      o painel soma as tarefas dos épicos no período e mostra <b>Planejado × Realizado · Aderência · Saldo</b>.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="planejamento">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Resumo das atividades por IA</summary><div class="help-body">
      Na aba <b>Resumo</b>, o card <b>🧠 Resumo das atividades (IA)</b> gera, sob demanda, uma análise
      em texto de <b>cada pessoa</b> no período: cadência de apontamento (horas, média por dia útil, dias sem
      apontar vs. a meta), volume e tipo de atividade (tickets, alterações, transições, criações) e a
      colaboração (comentários). Cada pessoa recebe um sinal 🟢/⚪/🟠. Respeita os <b>filtros e o período</b> atuais
      (filtre por uma pessoa para um resumo individual). O resumo é só uma leitura dos números desta tela —
      confira antes de qualquer decisão. <i>Requer a chave de IA configurada pelo administrador.</i>
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="resumo">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Metas, ausências e feriados</summary><div class="help-body">
      Em <b>Configurações → 🎯 Metas & ausências</b>: meta de horas (global ou por pessoa), ausências, feriados nacionais (com Carnaval,
      Sexta-feira Santa e Corpus Christi) e <b>usuários externos a ocultar</b> (somem de todas as visões).
      Fim de semana, feriado, ausência e hoje não contam na lacuna.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="config">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Meu Planejamento (semana + aprovação + planejado × realizado)</summary><div class="help-body">
      Em <b>Planejamento › 📋 Meu Planejamento</b>: planeje a semana por <b>atividade</b> — cada linha tem
      <b>data, projeto, descrição e horas</b> (categoria e observação opcionais), <b>sem escolher tickets</b>.
      Adicione, edite, exclua, <b>duplique para outros dias</b>, crie <b>rotinas</b> para vários dias úteis,
      reordene e <b>copie a semana anterior</b> — tudo salva sozinho no servidor (disponível em qualquer navegador).
      O fluxo é <b>Em elaboração → Enviar para aprovação → Aprovado</b> (ou <b>Devolvido para ajustes</b>, com o
      motivo do gestor; corrija e reenvie). Plano aprovado fica <b>bloqueado</b>; "Reabrir planejamento" cria uma
      <b>nova versão</b> que precisa de nova aprovação (a anterior fica no histórico). Na aba
      <b>Planejado × realizado</b>, o realizado vem do <b>Clockwork</b> e a comparação é por <b>data + projeto</b> —
      com as situações Conforme / Abaixo / Acima do planejado, <b>Planejado não realizado</b> e
      <b>Realizado não planejado</b>. Gestores (configurados em ⚙️ Configurações) têm as abas
      <b>Aprovações</b> (aprovar/devolver com comentário) e <b>Relatórios</b> (filtros + CSV).
      O plano antigo por tickets fica disponível como <b>Modelo anterior</b>, somente leitura.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="minhasemana">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Agenda (Outlook → ticket) e o controle de tickets</summary><div class="help-body">
      Em <b>👤 Meu trabalho › 📅 Agenda</b>: seus eventos do Outlook, agrupados por dia. <b>Todo evento não
      particular precisa de ticket</b>: quem organiza cria (organizador <b>externo</b> → qualquer participante interno);
      🔒 particulares ficam de fora. O assistente cria o ticket no <b>projeto à escolha</b> (ou <b>vincula a um
      existente</b>) e envia <b>convites de apontamento</b> aos participantes <b>internos</b> — cada um confirma com 1
      clique e o worklog sai no usuário da pessoa. O painel <b>🎫 Controle de tickets</b> mostra, por reunião,
      <b>quem cria · situação · ação</b>: confere no <b>Jira</b> se já existe ticket criado fora do app
      ("🟡 achei no Jira" → <b>✓ usar este ticket</b>) e deixa <b>📨 avisar no Inbox</b> do organizador — o aviso
      some sozinho quando o ticket é criado/vinculado.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="agenda">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Inbox (suas pendências)</summary><div class="help-body">
      Em <b>👤 Meu trabalho › 📥 Inbox</b>: tudo que depende de você — <b>🤝 convites</b> de apontamento coletivo
      (confirme com 1 clique), <b>💬 menções</b> sem resposta, <b>📅 reuniões sem ticket</b> (avisos do time pela
      Agenda) e, para o aprovador, <b>🔒 alocações/planos</b> aguardando decisão. O selo vermelho no menu soma tudo
      e atualiza na hora.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="inbox">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Menções (responder onde fui marcado)</summary><div class="help-body">
      Em <b>👤 Meu trabalho › 💬 Menções</b>: os comentários do Jira onde você foi <b>@marcado</b> nos últimos dias.
      Responda direto do painel (com <b>@marcações</b> de várias pessoas e <b>anexos/print colado</b>), abra a ficha
      completa do ticket, aponte horas ou <b>🔕 ignore</b> (some só para você; reversível).
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="mencoes">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Projetos (BI por projeto)</summary><div class="help-body">
      Em <b>Análise › 📁 Projetos</b>: escolha o projeto e veja a ficha completa direto do Jira — épicos e saúde,
      equipe e horas, prazos, tipos e drill-down até o ticket (com as ações de detalhe/apontar). Visões por
      categoria e consolidado do portfólio. Em qualquer gráfico clicável da ficha (⏳ idade do backlog, 📅 radar de
      vencimentos, 👤 carga por responsável, KPIs, status/tipo/rótulo…), a lista de itens traz o botão
      <b>🛠 Abrir na Gestão</b> — os tickets vão <b>já selecionados</b> para a Gestão de Tickets, com todas as
      ações em massa (atribuir, status, comentar, reprogramar, mover…).
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="projetos">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Analytics & Auditoria (governança)</summary><div class="help-body">
      Em <b>Análise › 📈 Analytics</b>: 26 visões de governança (prazos, pessoas, horas & estimativas, reuniões,
      qualidade & vínculos) — cada achado tem drill-down e abre <b>filtrado na 🛠 Gestão</b> para agir em massa.
      Em <b>Análise › 🕵️ Auditoria</b>: as validações objetivas <b>TI-04-014 por pessoa</b> (datas, estimativa,
      descrição, épico…), para acompanhar a conformidade de quem cria tickets.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="analytics">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Meu dia (timetracking assistido — beta)</summary><div class="help-body">
      Em <b>👤 Meu trabalho › 📍 Meu dia</b>: com a ponte do ActivityWatch instalada no computador, o painel mostra
      em que apps/janelas o seu dia foi e a <b>IA sugere apontamentos</b> (ticket + duração) — revise, ajuste e
      confirme; nada é gravado sem a sua confirmação.
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="meudia">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>AMS, Receita e Contratos (Admin)</summary><div class="help-body">
      <b>Gestão › AMS</b>: apuração <b>por ciclo</b> do contrato selecionado — banco de horas, excedente,
      faturável × não faturável (pelo <b>tipo</b> do chamado), chamados do ciclo, labels de ciclo faturado e
      <b>PDF da apuração</b>. <b>Gestão › 💰 Receita</b>: bolsa de horas e projetos (consumo × contratado, projeção).
      <b>Configurações › Contratos (Admin)</b>: o cadastro de clientes/contratos que alimenta tudo isso
      (tipo, horas, valor-hora, vigência, mín/teto mensal e projetos do Jira).
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="ams">🧭 ver na tela (guia interativo)</button></div></div></details>
    <details class="help-sec"><summary>Central de configurações</summary><div class="help-body">
      Em <b>Configurações › ⚙️ Central de configurações</b>: os ajustes num lugar só — 🎯 metas & ausências,
      contratos, <b>resumo agendado no Teams</b> (horário), integrações e preferências do painel. O
      <b>🗒 Histórico de ações</b> guarda quem fez o quê pelo painel (últimas ações, com ticket e resultado).
    <div style="margin-top:8px"><button class="aj-g" data-aj-guia="config">🧭 ver na tela (guia interativo)</button></div></div></details>

    <div class="mt-sec">
      <h3>Falar com a gente</h3>
      <div class="muted small">Abre um <b>issue no GitHub</b> do projeto, com o título prefixado (ex.: “Sugestão: …”).
        ${id?`Você é <b>${esc(id.nome||id.email)}</b> (registrado como autor do report).`:'<span style="color:var(--err)">Identifique-se para enviar.</span>'}</div>
      <div class="fb-tipos">
        <button class="chip fb-tipo" data-fb="duvida" aria-pressed="false">❓ Dúvida</button>
        <button class="chip fb-tipo" data-fb="sugestao" aria-pressed="true">💡 Sugestão</button>
        <button class="chip fb-tipo" data-fb="bug" aria-pressed="false">🐞 Bug</button>
      </div>
      <div class="fb-grid">
        <div><label>Título</label><input type="text" id="fb-titulo" maxlength="200" placeholder="Resumo curto da dúvida/sugestão/bug"></div>
        <div><label>Detalhes</label><textarea id="fb-detalhes" placeholder="Descreva com o máximo de contexto (passos, tela, comportamento esperado…)"></textarea></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn primario" id="fb-enviar" ${id?'':'disabled'}>Enviar</button>
          ${id?'':'<button class="btn" data-ap-act="config-id">Identificar-se</button>'}
        </div>
        <div class="ap-fb" id="fb-msg" hidden></div>
      </div>
    </div>
  `);
}

async function enviaFeedback(){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const tipoEl=document.querySelector('.fb-tipo[aria-pressed="true"]');
  const tipo=tipoEl?tipoEl.getAttribute('data-fb'):'sugestao';
  const titulo=(document.getElementById('fb-titulo').value||'').trim();
  const detalhes=(document.getElementById('fb-detalhes').value||'').trim();
  const msg=document.getElementById('fb-msg'); msg.hidden=false; msg.className='ap-fb';
  if(!titulo){ msg.classList.add('err'); msg.textContent='Dê um título.'; return; }
  const pref=FB_PREFIXO[tipo];
  const btn=document.getElementById('fb-enviar'); btn.disabled=true; msg.textContent='Enviando ao GitHub…';
  try{
    // Cria um issue no GitHub do projeto (token de serviço no servidor); o report
    // é atribuído à pessoa identificada (nome/e-mail no corpo do issue).
    const j=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({feedback:true, tipo, titulo, detalhes, reporter:{nome:id.nome||'', email:id.email||''}})}).then(r=>r.json());
    if(j.configurado===false){
      msg.classList.add('err'); msg.textContent=j.erro||'Integração com o GitHub não configurada.';
    } else if(j.ok){
      msg.classList.add('ok');
      msg.innerHTML=`✓ ${esc(pref)} registrado no GitHub${j.url?`: <a href="${escA(j.url)}" target="_blank" rel="noopener">#${esc(String(j.numero||''))} ↗</a>`:'.'}`;
      document.getElementById('fb-titulo').value=''; document.getElementById('fb-detalhes').value='';
    } else {
      msg.classList.add('err'); msg.textContent=j.erro||'Falha ao criar o issue no GitHub.';
    }
  }catch(e){ msg.classList.add('err'); msg.textContent='Erro de rede: '+(e.message||e); }
  btn.disabled=false;
}

// ---- Tour guiado (coach marks) ----
const TOUR=[
  {sel:'.brand',titulo:'Bem-vindo! 👋',texto:'Este é o Insights de Uso — cruza o Jira (atividade, tickets, status) com o Clockwork (horas) para análise, operação do dia a dia e planejamento do time. Clicar no logo volta ao início.'},
  {sel:'#seg-vista [data-v="acoes"]',titulo:'🏠 Início',texto:'A página principal: SEU dia num relance (horas de hoje, vencidos, plano da semana, reuniões sem ticket, Inbox) + as ações do time — tudo clicável. A 📊 Visão Geral segue ao lado para a análise executiva completa.'},
  {sel:'#navg-op-b',titulo:'👤 Meu trabalho',texto:'Tudo que é SEU dia a dia: 📋 Meu Planejamento (planeje a semana por atividade e envie para aprovação), ⏱ Apontar (horas, status, vencimento), 📅 Agenda (Outlook → ticket de reunião), 📥 Inbox (pendências que dependem de você), 💬 Menções e 📍 Meu dia. O selo vermelho soma suas pendências.'},
  {sel:'#navg-pl-b',titulo:'Planejamento',texto:'🧑‍💼 Alocação (resource planning: board por pessoa, visão 📆 Semanas com trava do planejado, linha do tempo, empresa/skill e simulação "e se…"); 📅 Planejamento macro (fases = épicos do Jira, planejado × realizado por função); 📝 Criação de Ticket (tickets em lote).'},
  {sel:'#navg-an-b',titulo:'Análise',texto:'📁 Projetos (BI por projeto), Resumo (KPIs e resumo por IA), Timesheet (pessoa × dia), Ranking, Tickets, Qualidade (IA), 🕵️ Auditoria e 📈 Analytics (26 visões de governança).'},
  {sel:'#navg-ge-b',titulo:'Gestão',texto:'🛠 Gestão de Tickets (ações em massa), 🚨 Alertas (atrasados com reprogramação justificada), 🗂 Reuniões (gestão e reclassificação: mover de projeto ou vincular a tickets de AMS numa tela só), AMS (apuração por ciclo, com PDF) e 💰 Receita (bolsa de horas e projetos).'},
  {sel:'#navg-cfg-b',titulo:'Configurações',texto:'⚙️ Contratos (Admin — base do AMS/Receita e do risco de faturamento), 🎯 Metas & ausências (meta de horas, feriados e usuários a ocultar) e 🗒 Histórico de ações (auditoria do que o time fez pelo painel).'},
  {sel:'#hdr-periodo',titulo:'Período',texto:'Escolha o intervalo de análise — hoje, semana, mês, ano… Ele aparece só nas telas de análise; as telas operacionais têm controles próprios.'},
  {sel:'.filtros',titulo:'Filtros',texto:'Filtre por pessoa, categoria, projeto e tipo nas telas de análise.'},
  {sel:'#btn-refresh',titulo:'Atualizar',texto:'Os dados ficam em cache por alguns minutos — clique para recarregar na hora.'},
  {sel:'#grp-exportar',titulo:'⬇ Exportar',texto:'CSV/Excel da visão atual ou PDF da tela — disponível nas telas de análise.'},
  {sel:'#btn-tema',titulo:'Tema do painel',texto:'Claro, Escuro ou Dexterity (o visual do site novo) — a preferência fica salva no navegador.'},
  {sel:'#grp-mais',titulo:'⋯ Mais',texto:'✨ Novidades (o pontinho vermelho avisa quando há algo novo), 🧭 Guia desta tela (explica item por item a tela aberta — atalho: tecla ?) e ❓ Ajuda & feedback, com os guias de todas as telas e os canais de dúvida/sugestão/bug.'},
  {sel:'#versaoApp',titulo:'Versão',texto:'No rodapé fica a versão em produção, com link para o pull request no GitHub.', se:()=>!!((document.getElementById('versaoApp')||{}).textContent||'').trim()},
];
// 🗺 Tour COMPLETO: navega por TODAS as telas do aplicativo (uma por passo), com o
// destaque no cartão principal e a descrição do que a tela faz. `vai` troca a vista
// antes do passo; a cobertura de TODAS as VISTAS é garantida por teste automatizado.
const TOUR_TELAS=[
  {vai:'acoes',titulo:'🏠 Início — Ações de hoje',texto:'A página principal: SEU dia num relance (horas de hoje × meta, seus vencidos, plano da semana, reuniões sem ticket, Inbox), as ações do time, a 🌳 árvore "Onde crio meu ticket?" e os atalhos 🚀 Ir para. Tudo clicável.'},
  {vai:'visao',titulo:'📊 Visão Geral (painel executivo)',texto:'A leitura executiva num lugar só: apontamento do time, saúde da entrega, alertas críticos e atividade — cada bloco leva ao detalhe.'},
  {vai:'minhasemana',titulo:'📋 Meu Planejamento',texto:'Planeje a semana por ATIVIDADE (data + projeto + descrição + horas — sem tickets), envie ao gestor, receba aprovação ou devolução com motivo e compare planejado × realizado por dia e por projeto (realizado do Clockwork). Gestores decidem e tiram relatórios aqui.'},
  {vai:'apontar',titulo:'⏱ Apontar',texto:'O dia a dia: aponte horas (chips 30m/1h/2h ou digitando), mova status, reagende vencimento, comente, transfira responsável e aponte reuniões para várias pessoas. Os 🕑 recentes reapontam com 1 clique.'},
  {vai:'gestao',titulo:'🔀 Transformar chamado em atividade',texto:'Um chamado que na verdade é atividade de outro? Informe origem e destino: se o destino aceita sub-tarefa, ela é criada lá dentro com a descrição e as horas da origem; se não aceita, as horas viram apontamento no destino com todos os detalhes no comentário. Comenta na origem e pode encerrá-la. Abre pela ficha 🔍 do ticket ou pela 🛠 Gestão.'},
  {vai:'controladoria',titulo:'🏦 Controladoria de Projetos',texto:'A saúde financeira por CATEGORIA de projeto (AMS, Tarefas Avulsas…), explicada em bom português: receita, custo, MARGEM com semáforo, custo de gestão, tipo de esforço, quanto do projeto já foi executado e evolução mês a mês — tudo clicável até o ticket, com ações (ficha, status, Gestão, Rateio). Blocos configuráveis por categoria.'},
  {vai:'rateio',titulo:'➗ Rateio de horas (apontar em massa)',texto:'Cole VÁRIOS tickets (lista, vírgulas ou links do Jira), informe as horas totais (ex.: 5h) e divida entre eles: ⚖️ igual, % percentual, 🍕 fatias ou ✏️ manual — a soma fecha exata com o total, com barra visual da divisão. Confira resumo/status no Jira antes, aponte tudo em 1 clique (reenvio só dos que falharem) e 🔁 altere o status de todos em conjunto.'},
  {vai:'agenda',titulo:'📅 Agenda (Outlook → ticket)',texto:'Seus eventos do Outlook viram tickets de reunião: crie no projeto certo ou vincule a um ticket existente e convide os participantes internos para apontar. O painel 🎫 Controle de tickets mostra quem deve criar, o que já foi criado (confere no Jira!) e deixa 📨 avisar o organizador pelo Inbox.'},
  {vai:'inbox',titulo:'📥 Inbox',texto:'Tudo que depende de VOCÊ num lugar só: convites de apontamento coletivo, menções sem resposta, reuniões sem ticket (avisos do time) e — para o aprovador — alocações e planos aguardando decisão. O selo vermelho no menu soma as pendências.'},
  {vai:'mencoes',titulo:'💬 Menções',texto:'Onde você foi @marcado em comentários do Jira: responda (com @marcações e anexos), abra a ficha, aponte horas ou 🔕 ignore — sem sair do painel.'},
  {vai:'meudia',titulo:'📍 Meu dia (beta)',texto:'Timetracking assistido: o registro de apps/janelas do seu computador vira sugestões de apontamento por IA — revise e confirme.'},
  {vai:'alocacao',titulo:'🧑‍💼 Alocação (macro)',texto:'Resource planning do gestor: board por pessoa (projeto + função + % capacidade), linha do tempo, visão 📆 Semanas (planejado travado × realizado, com aprovação dos planos), skills, vagas 🔮, relatórios e simulação "e se…".'},
  {vai:'planejamento',titulo:'📅 Planejamento macro',texto:'Plano de esforço por função (Implementação usa fases = épicos do Jira) com Planejado × Realizado, aderência e saldo — inclusive valor (h × custo/h).'},
  {vai:'planejar',titulo:'📝 Criação de Ticket',texto:'Crie tickets em LOTE: um por linha ou colando do Excel, com padrões (estimativa, labels, vencimento), templates do time e criação dentro de épicos/histórias. No modo 📐 Colar estrutura, cole Épico → História → Task e a hierarquia nasce pronta; depois, edite data limite e responsável EM MASSA na grade.'},
  {vai:'ondecrio',titulo:'🌳 Onde crio o ticket?',texto:'A árvore de decisão da governança (TI-04-006): responda as perguntas e crie o ticket no projeto certo — AMS (com reunião/atividade NÃO FATURÁVEL), SAP, interno, administrativa, ausências e Dexterity University. Ela também vive na página inicial.'},
  {vai:'projetos',titulo:'📁 Projetos',texto:'BI por projeto direto do Jira: ficha completa com épicos, saúde, equipe, horas e drill-down até o ticket — e todo drill (idade do backlog, vencimentos, responsável…) tem o 🛠 Abrir na Gestão, que leva os tickets já selecionados para agir em massa.'},
  {vai:'resumo',titulo:'Resumo',texto:'KPIs do período: horas por pessoa/projeto, % faturável, uso do Jira, top projetos e o 🧠 resumo das atividades por IA.'},
  {vai:'timesheet',titulo:'Timesheet',texto:'Matriz pessoa × dia com as lacunas até a meta; exporta em vários recortes (detalhado, por pessoa, projeto, ticket, tipo).'},
  {vai:'ranking',titulo:'Ranking',texto:'Cumprimento de apontamento por pessoa NO TEMPO: 📅 esta semana, 🗓 este mês e 📆 este ano — com 🏆 pódio dos destaques, ⭐ estrelinhas (fechou a semana na meta = ganhou uma) e 🔥 sequências. A aba Engajamento segue com o uso do Jira.'},
  {vai:'tickets',titulo:'Tickets',texto:'Os tickets do período com horas + atividade, agrupáveis por projeto, tipo, categoria ou pessoa.'},
  {vai:'qualidade',titulo:'🔎 Qualidade (IA)',texto:'A IA lê as boas práticas TI-04-006 no Notion e audita os tickets criados no período: nota, violações e menu de ações por ticket.'},
  {vai:'audit',titulo:'🕵️ Auditoria de Tickets',texto:'Validações objetivas TI-04-014 por pessoa: conformidade dos tickets (datas, estimativas, descrição, épico…) com drill-down.'},
  {vai:'analytics',titulo:'📈 Analytics',texto:'26 visões de governança para investigar: prazos, pessoas, horas, reuniões e qualidade — cada achado abre na Gestão para agir.'},
  {vai:'roadmap',titulo:'🗺️ Roadmap',texto:'O rumo da ferramenta: o que está em desenvolvimento, planejado e em avaliação — e as entregas recentes. Sugestões entram por ❓ Ajuda & feedback.'},
  {vai:'gestao',titulo:'🛠 Gestão de Tickets',texto:'Ações em massa: selecione vários tickets e atribua, mude status, comente, reprograme (com motivo), mova de projeto, ajuste épicos, verifique duplicados ou exclua.'},
  {vai:'alertas',titulo:'🚨 Alertas',texto:'A central dos atrasados e críticos: reprograme com motivo padrão (data + comentário no Jira), em lote, com criticidade.'},
  {vai:'reclassificar',titulo:'🗂 Reuniões — aba Reclassificar',texto:'Gestão e reclassificação de reuniões: mova tickets de reunião do RDF para o projeto certo (tipo e status preservados) ou confirme como processo administrativo.'},
  {vai:'reuvinc',titulo:'🗂 Reuniões — aba Vincular',texto:'Transforme reuniões em registro num ticket de AMS (criar novo ou comentar num aberto, com worklog) — e 🔁 transfira QUALQUER ticket pelo número (vincula o esforço e exclui o original).'},
  {vai:'ams',titulo:'AMS (apuração por ciclo)',texto:'Um contrato por vez, por ciclo: banco de horas, faturamento, faturável × não faturável (pelo TIPO do chamado), chamados do ciclo e PDF da apuração.'},
  {vai:'receita',titulo:'💰 Receita',texto:'Bolsa de horas e projetos: consumo × contratado, projeção e receita estimada por período.'},
  {vai:'prioridades',titulo:'🎯 Prioridades do time',texto:'As (até) 5 prioridades da semana com dono, prazo e pedido ao time; portfólio por natureza mostrando só exceções; e o Modo reunião que conduz a pauta de 35 minutos — status é assíncrono, a reunião decide.'},
  {vai:'config',titulo:'⚙️ Central de configurações',texto:'Todos os ajustes num lugar só: metas & ausências, contratos, resumo agendado no Teams, integrações e preferências.'},
  {vai:'admin',titulo:'⚙️ Contratos (Admin)',texto:'Cadastro de clientes/contratos (tipo, horas, valor-hora, vigência, projetos do Jira) — a base do AMS, da Receita e do risco de faturamento.'},
  {vai:'acoes',sel:'#btn-guia',titulo:'É isso! 🎉',texto:'Você passou por TODAS as telas. Quer o detalhe de uma delas? Abra a tela e clique em 🧭 Guia desta tela (ou tecle ?): o guia destaca item por item ali mesmo. A lista completa dos guias está em ⋯ Mais → ❓ Ajuda, junto do canal de dúvidas/sugestões/bugs. Bom uso!'},
];
let _tourI=0, _tourLista=TOUR, _tourHome=false, _tourGuia='';   // _tourGuia = vista do 🧭 guia em curso
function fimTour(){ document.querySelectorAll('.tour-hl,.tour-pop').forEach(e=>e.remove());
  window.removeEventListener('resize',_tourReposi); window.removeEventListener('scroll',_tourReposi,true); }
function _tourReposi(){ if(document.querySelector('.tour-pop')) posicionaTour(); }
function iniciaTour(){
  fechaModal(); _tourLista=TOUR; _tourHome=false; _tourGuia='';
  // A tela de partida não pode impedir o tour (mesmo guard do mostraTour).
  try{ estado.vista='resumo'; marcaVista('resumo'); render(); estadoParaURL(); }catch(e){}
  _tourI=0; setTimeout(mostraTour,160);
}
// Tour completo: todas as telas, uma por passo (termina de volta no Início).
function iniciaTourTelas(){
  fechaModal(); _tourLista=TOUR_TELAS; _tourHome=true; _tourGuia='';
  _tourI=0; setTimeout(mostraTour,160);
}
// Primeiro elemento VISÍVEL do seletor (o app esconde muita coisa por vista).
function _qsVis(sel){
  try{ return Array.prototype.find.call(document.querySelectorAll(sel), e=>e.getClientRects().length>0)||null; }
  catch(e){ return null; }
}
// Cartão da tela pelo texto do título (tolerante a acento/maiúscula) — âncora
// estável para os guias, já que os cartões mudam de id/posição com o tempo.
function _cardPorTitulo(txt){
  const alvo=normPal(txt);
  const cards=document.querySelectorAll('#conteudo .card,#conteudo .vg-card,#conteudo .mp-card,#conteudo .cfgc');
  for(const c of cards){ const h=c.querySelector('h2,h3'); if(!h) continue;
    if(normPal(h.textContent).includes(alvo) && c.getClientRects().length) return c; }
  return null;
}
function _tourAlvo(passo){
  // Passos de tela destacam o cartão principal; `sel`/`s` explícitos têm prioridade.
  if(passo.sel){ const a=document.querySelector(passo.sel); if(a) return a; }
  if(passo.s){ const a=_qsVis(passo.s); if(a) return a; }
  if(passo.c){ const a=_cardPorTitulo(passo.c); if(a) return a; }
  // Tour de telas (sem seletor) destaca o cartão principal; passo de GUIA sem alvo
  // vira tarja central (`g:1`), para não apontar a moldura para o lugar errado.
  if(passo.vai && !passo.g && !passo.s && !passo.c){ return document.querySelector('#conteudo .card')||document.getElementById('conteudo'); }
  return null;
}
function mostraTour(){
  fimTour();
  const L=_tourLista;
  if(_tourI>=L.length){ if(_tourGuia){ guiaMarcaVisto(_tourGuia); const g=GUIAS[_tourGuia]; _tourGuia='';
      toast(`🧭 Guia concluído — ${g?g.t:'tela'}. Reabra quando quiser no botão 🧭 ou na tecla ?`,'ok'); }
    if(_tourHome){ _tourHome=false; vaiPara('acoes'); } return; }
  const passo=L[_tourI];
  // Uma tela com dados indisponíveis não pode matar o tour — navega e segue.
  if(passo.vai && estado.vista!==passo.vai){ try{ vaiPara(passo.vai); }catch(e){} return void setTimeout(mostraTour,320); }
  if(passo.se && !passo.se()){ _tourI++; return mostraTour(); }
  const alvo=_tourAlvo(passo);
  // Nos guias, um item que não está na tela AGORA (sem dados, sem permissão) continua
  // sendo explicado — numa tarja central, com o aviso de quando ele aparece.
  if(!alvo && !_tourGuia){ _tourI++; return mostraTour(); }
  if(alvo) alvo.scrollIntoView({block:'center',behavior:'smooth'});
  if(alvo){ const hl=document.createElement('div'); hl.className='tour-hl'; document.body.appendChild(hl); }
  const pop=document.createElement('div');
  pop.className='tour-pop'+(_tourGuia?' guia':'')+(alvo?'':' livre');
  const tit=passo.titulo||passo.ti||''; const txt=passo.texto||passo.tx||'';
  const pct=Math.round((_tourI+1)/L.length*100);
  pop.innerHTML=`${_tourGuia?`<span class="tour-tag">🧭 Guia · ${esc((GUIAS[_tourGuia]||{}).t||'')}</span>`:''}
    <div class="tour-prog"><i style="width:${pct}%"></i></div>
    <h3>${esc(tit)}</h3><p>${esc(txt)}</p>
    ${alvo?'':`<div class="tour-nota">${esc(passo.quando||'Este item aparece quando houver dados (ou permissão) para ele nesta tela — a explicação vale para quando aparecer.')}</div>`}
    <div class="tour-nav"><span class="tour-step">${_tourI+1} de ${L.length}</span>
      ${_tourI>0?'<button class="btn" id="tour-prev">Anterior</button>':''}
      <button class="btn" id="tour-fim">Fechar</button>
      <button class="btn primario" id="tour-next">${_tourI===L.length-1?'Concluir':'Próximo →'}</button></div>`;
  document.body.appendChild(pop);
  setTimeout(posicionaTour,200);
  window.addEventListener('resize',_tourReposi); window.addEventListener('scroll',_tourReposi,true);
}
function posicionaTour(){
  const passo=_tourLista[_tourI]; const alvo=passo&&_tourAlvo(passo);
  const hl=document.querySelector('.tour-hl'); const pop=document.querySelector('.tour-pop');
  if(!pop) return;
  if(!alvo){ pop.classList.add('livre'); pop.style.top=''; pop.style.left=''; return; }
  if(!hl) return;
  const r=alvo.getBoundingClientRect(); const pad=6;
  hl.style.top=(window.scrollY+r.top-pad)+'px'; hl.style.left=(window.scrollX+r.left-pad)+'px';
  hl.style.width=(r.width+pad*2)+'px'; hl.style.height=(r.height+pad*2)+'px';
  const pw=pop.offsetWidth, ph=pop.offsetHeight; let top=r.bottom+10, left=r.left;
  if(top+ph>window.innerHeight-8) top=Math.max(8, r.top-ph-10);
  if(left+pw>window.innerWidth-8) left=window.innerWidth-pw-8; if(left<8) left=8;
  pop.style.top=top+'px'; pop.style.left=left+'px';
}

// ============================ 🧭 GUIAS INTERATIVOS POR TELA ==========================
// Cada tópico da Ajuda tem um guia passo a passo que roda NA PRÓPRIA TELA: o app
// navega até ela, espera o conteúdo pintar e destaca item por item, explicando o que
// cada um faz. Passos com `s` (seletor CSS) ou `c` (título do cartão) apontam para um
// elemento real; quando ele não está na tela agora (sem dados, sem permissão), o passo
// continua sendo explicado numa tarja central — o guia ensina a tela inteira.
// ⚠ Contrato coberto por teste: TODA vista de VISTAS precisa ter um guia aqui.
const GUIAS={
  acoes:{t:'🏠 Início — Ações de hoje',p:[
    {c:'👋',ti:'Seu dia num relance',tx:'O topo é SEU: horas de hoje × meta, seus tickets vencidos, o plano da semana, reuniões sem ticket e o Inbox. Cada número é clicável e leva à tela que resolve aquilo.'},
    {s:'#conteudo .apr-topo',ti:'⏱ Apontamento do time — o placar do dia',tx:'Quantas pessoas já lançaram horas hoje, quanto o time apontou hoje e na semana, e quantos dias úteis ficaram em branco. É o objetivo nº 1 do painel: ninguém esquecer de apontar.'},
    {s:'#conteudo .apr-lista',ti:'Pessoa a pessoa, hoje e na semana',tx:'Cada linha traz a pessoa, quanto lançou HOJE contra a meta dela, o total da SEMANA contra o esperado e a fita de dias (verde = dia fechado, amarelo = parcial, vermelho = em branco, vazado = fim de semana, feriado, ausência ou fora da vigência). Você aparece em primeiro; clique em alguém para abrir o timesheet dessa pessoa.'},
    {s:'#conteudo .apr-l.vazio',ti:'Quem ainda não apontou hoje',tx:'As linhas vermelhas sobem para o topo — é quem precisa de um empurrão hoje. O aviso logo acima do quadro já cita os primeiros nomes.',quando:'Aparece quando alguém que é cobrado hoje ainda não lançou nenhuma hora.'},
    {s:'#qk-texto',ti:'🎫 Criar ticket rápido (e acionável)',tx:'Descreva em português tudo o que precisa acontecer — "crie um ticket no nome da Jéssica, no épico de gestão do projeto da Copel, vencimento hoje, marque o Diego no comentário, aponte 30 minutos e passe para finalizado". A IA resolve projeto, épico, título, prazo, responsável, horas, comentário com @menção e status; a prévia mostra tudo antes, campo a campo, e você ajusta o que quiser.'},
    {s:'#qk-mic',ti:'🎤 Ditar em vez de digitar',tx:'No navegador, o microfone transcreve a sua fala direto no campo. É o mesmo caminho do texto — só muda a forma de escrever.'},
    {s:'#qk-siri',ti:'📱 Pelo celular, Siri e Alexa',tx:'Este botão reúne o app instalável do celular (voz.html), o Atalho da Siri pronto e a configuração da skill da Alexa: criar ticket sem abrir o painel.'},
    {c:'🆕 Meus tickets recém criados',ti:'🆕 Meus tickets recém criados',tx:'Os últimos tickets que VOCÊ abriu, com projeto e quando. Um clique manda todos para a 🛠 Gestão, já selecionados, para ajustar responsável, data ou status em massa.'},
    {c:'📅 Criados nesta semana',ti:'📅 Criados nesta semana',tx:'Quantos tickets o time abriu de segunda até hoje, com a quebra por projeto e por pessoa — útil para ver onde a demanda está entrando.'},
    {c:'⏰ Tickets vencidos por projeto',ti:'⏰ Onde o atraso está concentrado',tx:'Os vencidos agrupados por projeto, com barra comparativa, o pior atraso, quantos estão sem horas e quem tem mais casos. Clique no projeto e trate na Gestão.'},
    {c:'🧭 Radar',ti:'🧭 Radar — combine as informações',tx:'Escolha o escopo (meu/time), o período e os eventos (criados, apontados, vencidos…) e o radar cruza tudo: dá para mandar o resultado para a Gestão ou para o ➗ Rateio.'},
    {s:'#conteudo .ax-grid',ti:'🏢 Time — ações de hoje',tx:'Os seis indicadores do time: atrasados, pessoas abaixo da meta, sem atualização há +5 dias, sem responsável, risco de faturamento e aguardando cliente. A setinha compara com o último dia; "Ver casos →" abre a lista.'},
    {s:'#arv-home',ti:'🌳 Onde crio meu ticket?',tx:'A árvore da governança (TI-04-006): responda as perguntas e ela diz — e cria — o ticket no projeto certo, sem sair da Início.'},
    {s:'#conteudo .hx-atalhos',ti:'🚀 Ir para',tx:'Atalhos para as telas mais usadas. A busca completa é o 🔍 (Ctrl+K), onde também dá para ⭐ fixar telas na barra.'},
    {c:'✨ Novidades',ti:'✨ Novidades',tx:'As últimas melhorias publicadas. O pontinho vermelho acende quando há algo que você ainda não leu.'}]},
  visao:{t:'📊 Visão Geral',p:[
    {s:'#hdr-periodo',ti:'O período manda nesta tela',tx:'Tudo aqui obedece ao período escolhido no topo (hoje, semana, mês, ano…). Trocou o período, os números se refazem.'},
    {s:'#conteudo .vg-hero',ti:'Os números do período',tx:'A leitura executiva: horas do time, cumprimento da meta, pessoas em dia e atividade — a mesma base das telas de análise, resumida.'},
    {c:'🩺 Score',ti:'🩺 Score de saúde da entrega',tx:'Combina apontamento (40%), prazos (30%) e alertas críticos (30%) numa nota de 0 a 100. Clique num componente para ir ao detalhe que o derrubou.'},
    {c:'🚦 Saúde da entrega',ti:'🚦 Saúde da entrega',tx:'Como estão os prazos e o andamento — o bloco leva à tela de 🚨 Alertas para agir sobre o que está vermelho.'},
    {c:'⏱ Apontamento do time',ti:'⏱ Apontamento do time',tx:'Quem está longe da meta no período, com a lacuna em horas. Clique numa pessoa para abrir o Timesheet dela.'},
    {c:'🚨 Alertas críticos',ti:'🚨 Alertas críticos',tx:'Os casos que exigem decisão hoje: vencidos, sem responsável, parados. Cada linha abre a lista correspondente.'},
    {c:'📰 Fluxo de atividade',ti:'📰 Fluxo de atividade',tx:'As últimas ações do time no Jira, em tempo quase real — bom para saber o que está acontecendo agora.'}]},
  apontar:{t:'⏱ Apontar',p:[
    {s:'#conteudo .ap-id',ti:'Identifique-se uma vez',tx:'O worklog sai no SEU usuário do Jira, então o painel pede e-mail + token de API uma única vez (fica só neste navegador, nunca no servidor).'},
    {s:'#mh-card',ti:'⏱ Meu timesheet',tx:'A sua semana como numa ferramenta de timetracking: 🧮 Grade (Projeto → Ticket × dias) e 🗓 Calendário (blocos pela hora de início). Navegue as semanas em ‹ hoje › e acompanhe o alvo diário.'},
    {s:'#conteudo .ap-filtros',ti:'Achar o chamado certo',tx:'Filtre por categoria, projeto, busca livre e data-limite. "Só meus" mostra o que é seu; "Incluir sem vencimento" traz o que ainda não tem data.'},
    {s:'#conteudo .ap-chips',ti:'Apontar em 1 clique',tx:'Os chips (30m, 1h, 2h…) preenchem o tempo; dá para digitar 1h30, 1:30 ou 45m. Clique em Apontar e o worklog vai para o Jira/Clockwork na hora.'},
    {s:'#conteudo .ap-row [data-ap-st]',ti:'Mover o status',tx:'Clique no status do chamado para ver as transições disponíveis e mover sem abrir o Jira.',quando:'Aparece em cada chamado da lista, ao lado do resumo.'},
    {s:'#conteudo .ap-row [data-ap-venc]',ti:'📅 Reprogramar o vencimento',tx:'Clique na data para reagendar com Hoje / Amanhã / Próxima semana, data livre ou remover — respeitando as suas permissões.',quando:'Aparece em cada chamado da lista (ou como "📅 definir vencimento", quando não há data).'},
    {s:'#conteudo [data-ap-conv]',ti:'📨 Convidar para apontar',tx:'Trabalhou junto? Convide as pessoas para apontar neste ticket: cada uma confirma com 1 clique e o worklog sai no usuário dela.',quando:'Aparece em cada chamado, depois de você se identificar.'},
    {s:'#conteudo [data-ap-act="grupo"]',ti:'👥 Reunião para várias pessoas',tx:'Aponte a reunião do time de uma vez: escolha o ticket, o tempo, o dia e quem participou (dá para salvar a seleção como time e reusar).'},
    {s:'#conteudo [data-ap-act="rateio"]',ti:'➗ Rateio em massa',tx:'Vários tickets de uma vez: informe o total de horas e divida por igual, percentual ou fatias na tela de Rateio.'},
    {s:'#ap-rec-toggle',ti:'🕑 Meus tickets recentes',tx:'No fim da página, onde você apontou nos últimos 14 dias — para reapontar com 1 clique, sem procurar o ticket de novo.'}]},
  rateio:{t:'➗ Rateio de horas',p:[
    {s:'#rt-texto',ti:'1️⃣ Cole os tickets',tx:'Aceita lista, vírgulas ou links do Jira colados de qualquer lugar. O painel identifica as chaves sozinho.'},
    {s:'#rt-conferir',ti:'Conferir antes',tx:'Busca no Jira o resumo, o status e o responsável de cada ticket — assim você aponta sabendo onde está apontando.'},
    {s:'#rt-total',ti:'2️⃣ Horas totais',tx:'Informe o total (ex.: 5h ou 5:30). É esse valor que será dividido entre os tickets.'},
    {s:'#conteudo .rt-tab',ti:'A forma de dividir',tx:'⚖️ igual · % percentual · 🍕 fatias · ✏️ manual. A soma sempre fecha exata com o total; a barra mostra a divisão.',quando:'Aparece depois que o painel reconhece os tickets colados.'},
    {s:'#rt-data',ti:'Data e comentário',tx:'O dia do apontamento e um comentário opcional que vai junto em todos os worklogs.'},
    {s:'#rt-apontar',ti:'3️⃣ Apontar tudo',tx:'Um clique lança em todos. Se algum falhar, o reenvio é só dos que falharam — nada é apontado duas vezes.',quando:'Aparece com os tickets reconhecidos e as horas informadas.'},
    {s:'#rt-status',ti:'🔁 Status em conjunto',tx:'Depois de apontar, mude o status de todos: o painel separa os tickets por status ATUAL e aplica a transição válida de cada grupo.',quando:'Aparece junto do apontamento, depois dos tickets reconhecidos.'}]},
  agenda:{t:'📅 Agenda (Outlook → ticket)',p:[
    {c:'📅 Agenda',ti:'Seus eventos, dia a dia',tx:'A agenda do Outlook dentro do painel. Todo evento não particular precisa de ticket: quem organiza cria (organizador externo → qualquer participante interno). 🔒 particulares ficam de fora.'},
    {s:'#conteudo [data-ag-criar]',ti:'Criar o ticket da reunião',tx:'O assistente cria no projeto que você escolher (ou vincula a um ticket existente), já com título, descrição e data do evento.'},
    {s:'#conteudo [data-ag-auto]',ti:'⚡ Automatizar a série',tx:'Reunião que se repete? Escolha o projeto UMA vez e toda ocorrência passa a ganhar o ticket sozinha quando você abre a Agenda no dia — sobra só o apontamento.'},
    {s:'#conteudo [data-ag-convidar]',ti:'Convidar quem participou',tx:'Os participantes internos recebem o convite de apontamento e confirmam com 1 clique; o worklog sai no usuário de cada um.',quando:'Aparece nas reuniões que já têm ticket criado ou vinculado.'},
    {s:'#conteudo [data-agm-real]',ti:'⏱ Duração real do Teams',tx:'No convite, este botão consulta o relatório de presença do Teams e usa quanto tempo você REALMENTE ficou na chamada, em vez da duração agendada.',quando:'Aparece dentro do modal de convite de apontamento da reunião.'},
    {c:'🎫 Controle de tickets',ti:'🎫 Controle de tickets',tx:'Por reunião: quem deve criar, se já existe (o painel confere no Jira — "🟡 achei no Jira" → ✓ usar este) e o 📨 avisar no Inbox do organizador. O aviso some sozinho quando o ticket aparece.'}]},
  inbox:{t:'📥 Inbox',p:[
    {s:'#conteudo .kpis',ti:'Tudo que depende de você',tx:'A caixa de entrada do painel: convites, menções, reuniões sem ticket e aprovações. O selo vermelho no menu soma esses contadores e atualiza na hora.'},
    {c:'🤝 Convites',ti:'🤝 Convites de apontamento',tx:'Reuniões e tickets em que te convidaram para apontar: confirme com 1 clique (ou recuse) — o worklog sai no seu usuário.',quando:'Aparece quando houver convites de apontamento esperando você.'},
    {c:'💬 Menções',ti:'💬 Menções sem resposta',tx:'Comentários do Jira onde você foi @marcado e ainda não respondeu. Responda daqui mesmo.',quando:'Aparece quando houver menções suas sem resposta.'},
    {c:'📅 Reuniões sem ticket',ti:'📅 Reuniões sem ticket',tx:'Avisos do time (pela Agenda) de reuniões que você organiza e ainda não têm ticket.',quando:'Aparece quando o time avisar sobre uma reunião sua sem ticket.'},
    {c:'📋 Planos semanais',ti:'📋 Planos aguardando aprovação',tx:'Para quem aprova: os planejamentos semanais do time esperando decisão — aprove ou devolva com o motivo.',quando:'Aparece só para quem aprova planos, quando houver planos aguardando decisão.'},
    {s:'#ib-forcar',ti:'Atualizar agora',tx:'A Inbox usa cache curto; este botão força a releitura de tudo.'}]},
  mencoes:{t:'💬 Menções',p:[
    {s:'#mn-dias',ti:'A janela de tempo',tx:'Quantos dias para trás procurar menções suas nos comentários do Jira.'},
    {s:'#mn-sopend',ti:'Só as pendentes',tx:'Mostra apenas onde você ainda não respondeu — o modo de trabalho do dia a dia.'},
    {s:'#conteudo .mn-list',ti:'A menção em contexto',tx:'Cada cartão traz o trecho do comentário, o ticket e quem marcou você.',quando:'Aparece quando houver menções no período escolhido.'},
    {s:'#conteudo [data-mn-resp]',ti:'Responder sem sair daqui',tx:'A resposta vai como comentário no Jira, com @marcações de várias pessoas e anexos (inclusive print colado).',quando:'Aparece em cada menção da lista.'},
    {s:'#conteudo [data-mn-ign]',ti:'🔕 Ignorar',tx:'Some só para você e é reversível — o botão "ver ignoradas" traz de volta.',quando:'Aparece em cada menção da lista.'}]},
  meudia:{t:'📍 Meu dia (beta)',p:[
    {c:'📍 Meu dia',ti:'Timetracking assistido',tx:'Com a ponte do ActivityWatch instalada no computador, o painel enxerga em que apps/janelas o seu dia foi — nada sai daqui sem a sua confirmação.'},
    {s:'#md-analisar',ti:'🤖 Analisar o dia',tx:'A IA lê o registro do dia e propõe apontamentos (ticket + duração) com a justificativa de cada um.'},
    {c:'🤖 Sugestões',ti:'Revisar e confirmar',tx:'Cada sugestão pode ser ajustada, apontada ou descartada. Nada é gravado no Jira sem o seu clique.',quando:'Aparece depois de clicar em 🤖 Analisar o dia (com a ponte do ActivityWatch instalada).'},
    {c:'🕓 Timeline do dia',ti:'🕓 A linha do tempo',tx:'O dia hora a hora — útil para lembrar do que aconteceu antes de apontar.',quando:'Aparece quando a ponte do ActivityWatch estiver enviando o registro do dia.'}]},
  minhasemana:{t:'📋 Meu Planejamento',p:[
    {s:'#conteudo .mp-abas',ti:'As abas',tx:'Planejamento (a sua semana), Planejado × realizado, e — para gestores — Aprovações e Relatórios. O modelo antigo por tickets fica como "Modelo anterior", só leitura.'},
    {s:'#conteudo .mp-nav',ti:'Navegar entre semanas',tx:'‹ e › trocam a semana; "hoje" volta para a atual. Cada semana tem o seu próprio plano e a sua própria situação.'},
    {s:'#conteudo .mp-dias',ti:'Planejar por atividade',tx:'Cada linha tem data, projeto, descrição e horas — sem escolher tickets. Dá para arrastar entre dias, duplicar, reordenar e excluir.'},
    {s:'#conteudo [data-mp-rotina]',ti:'Rotinas e cópia',tx:'Crie rotinas que se repetem em vários dias úteis e copie a semana anterior inteira — a base do plano em segundos.'},
    {s:'#conteudo [data-mp-enviar]',ti:'Enviar para aprovação',tx:'O fluxo é Em elaboração → Enviar → Aprovado (ou Devolvido com motivo). Plano aprovado fica bloqueado; reabrir cria uma nova versão que precisa de nova aprovação.'},
    {s:'#mp-salvo',ti:'Salva sozinho',tx:'Tudo é gravado no servidor conforme você digita — abra de qualquer navegador que o plano está lá.'},
    {s:'#conteudo .mp-kpis',ti:'Planejado × realizado',tx:'Na aba de comparação, o realizado vem do Clockwork e o confronto é por data + projeto: Conforme, Abaixo, Acima, Planejado não realizado e Realizado não planejado.',quando:'Aparece quando houver atividades planejadas na semana.'}]},
  planrel:{t:'📊 Relatórios do planejamento',p:[
    {s:'#conteudo [data-plr-aud]',ti:'Escolha a audiência',tx:'Os mesmos dados contados para públicos diferentes: executivo, gestor, pessoa e projeto — cada um com o corte que interessa a ele.'},
    {c:'📊 Relatórios do planejamento',ti:'Planejado × realizado do time',tx:'Só o ÚLTIMO plano de cada pessoa/semana entra na conta (versões antigas não somam) — por isso os totais batem com o que foi aprovado.'},
    {s:'#conteudo .mp-tab-cmp',ti:'Quem planejou melhor',tx:'A precisão de cada pessoa: o quanto o realizado ficou perto do planejado, com o desvio em horas e o percentual de eficiência.',quando:'Aparece quando houver planos enviados e horas apontadas no período.'},
    {s:'#conteudo [data-mp-rdrill]',ti:'Diferenças por projeto',tx:'Os projetos com as maiores diferenças entre planejado e realizado — clique para ver os tickets por trás do número.',quando:'Aparece quando houver planos enviados e horas apontadas no período.'},
    {s:'#conteudo [data-mp-ia]',ti:'🤖 Leitura por IA',tx:'Gera, sob demanda, uma análise em texto do planejado × realizado do período. É uma leitura dos números desta tela — confira antes de decidir.',quando:'Aparece quando a chave de IA estiver configurada pelo administrador.'},
    {s:'#conteudo [data-mp-relcsv]',ti:'⬇ Exportar',tx:'O recorte atual sai em CSV para tratar fora do painel.'}]},
  prioridades:{t:'🎯 Prioridades do time',p:[
    {s:'#conteudo .mp-abas',ti:'Três modos',tx:'Visão do time (as prioridades da semana), Modo reunião (a pauta de 35 minutos) e Página do projeto (o detalhe de um projeto).'},
    {s:'#pr-kpis',ti:'O termômetro da semana',tx:'Quantas prioridades existem, quantas estão em risco e o que já foi decidido — a régua da reunião semanal.'},
    {s:'#pr-prios',ti:'Até 5 prioridades',tx:'Cada prioridade tem dono, prazo e o pedido ao time. Poucas e claras: é isso que faz a reunião andar.'},
    {s:'#pr-nat',ti:'Portfólio por natureza',tx:'Os projetos agrupados por natureza, mostrando só as exceções — o que está fora do esperado.',quando:'Aparece quando houver projetos classificados por natureza.'},
    {s:'#pr-timer',ti:'⏲ Modo reunião',tx:'Conduz a pauta em blocos cronometrados: status é assíncrono, a reunião serve para DECIDIR.',quando:'Aparece na aba Modo reunião.'},
    {s:'#pr-ata',ti:'📝 Ata pronta',tx:'As decisões viram ata copiável (e link) no fim da reunião — sem ninguém digitando durante a conversa.',quando:'Aparece na aba Modo reunião, ao encerrar os blocos da pauta.'}]},
  planejar:{t:'📝 Criação de Ticket',p:[
    {s:'#conteudo [data-pl-modo]',ti:'Três modos de criar',tx:'Criação em lote (um ticket por linha), Planejamento de épico (histórias e sub-tarefas dentro de um épico) e 📐 Colar estrutura (Épico → História → Task de uma vez).'},
    {s:'#conteudo select',ti:'Projeto, tipo e responsável',tx:'Escolha onde os tickets nascem: projeto, tipo (Tarefa, Bug…), responsável e — quando quiser — o épico ou a história que recebe os itens.'},
    {s:'#conteudo textarea',ti:'Um ticket por linha',tx:'Digite ou cole do Excel/CSV. Use ";" para separar "resumo ; descrição". A revisão destaca os erros antes de criar.'},
    {ti:'📐 Colar estrutura (3 níveis)',tx:'Cole linhas no formato nível + título: histórias entram no último épico acima e tasks viram sub-tarefas da última história. A criação sai em ondas, já vinculada.',quando:'Aparece ao escolher o modo 📐 Colar estrutura.'},
    {ti:'🧮 Edição em massa depois de criar',tx:'O resultado vira uma grade estilo planilha: mude data limite e responsável linha a linha (ou marque vários e aplique aos marcados). Nada muda no Jira até clicar em 💾 Salvar.',quando:'Aparece depois que os tickets são criados.'}]},
  ondecrio:{t:'🌳 Onde crio o ticket?',p:[
    {c:'🌳 Onde crio o ticket?',ti:'A árvore da governança',tx:'Responda as perguntas e a árvore aplica a regra TI-04-006: AMS (com reunião/atividade não faturável), SAP, interno, administrativa, ausências e Dexterity University.'},
    {s:'#conteudo .arv-op,#conteudo .arv-opts button,#conteudo .pl-dica',ti:'Um passo de cada vez',tx:'Cada resposta leva à próxima pergunta; o caminho percorrido fica em migalhas clicáveis, para voltar a qualquer ponto.'},
    {ti:'Cria o ticket ali mesmo',tx:'No fim, a árvore mostra o projeto certo e abre o formulário para criar sem sair — respeitando o padrão de título e a descrição pedidos pela governança.',quando:'Aparece ao chegar no fim de um caminho.'}]},
  projetos:{t:'📁 Projetos',p:[
    {s:'#conteudo .ts-fonte',ti:'Escolha o projeto',tx:'O seletor troca entre o consolidado do portfólio e a ficha de um projeto; ⟳ Atualizar rebusca do Jira ignorando o cache.'},
    {c:'📁 Projetos — Consolidado',ti:'O portfólio de uma vez',tx:'Todos os projetos com saúde, horas e prazos — clique numa linha ou categoria para abrir a ficha.'},
    {s:'#conteudo .vg-hero',ti:'A ficha do projeto',tx:'KPIs do projeto, épicos e saúde, equipe e horas, prazos, tipos e rótulos — tudo direto do Jira.',quando:'Aparece ao abrir a ficha de um projeto (escolha um no seletor).'},
    {s:'#conteudo [data-pdrill],#conteudo [data-pdrill-cons]',ti:'Drill-down até o ticket',tx:'Qualquer gráfico é clicável (idade do backlog, radar de vencimentos, carga por responsável…) e abre a lista de itens por trás do número.',quando:'Aparece na ficha de um projeto, nos gráficos clicáveis.'},
    {ti:'🛠 Abrir na Gestão',tx:'Dentro de qualquer drill, este botão manda os tickets JÁ SELECIONADOS para a Gestão de Tickets — onde estão as ações em massa.',quando:'Aparece dentro do modal de drill-down de qualquer gráfico.'}]},
  resumo:{t:'Resumo',p:[
    {s:'#hdr-periodo',ti:'Período e filtros mandam',tx:'Esta tela responde ao período e aos filtros do topo (pessoa, categoria, projeto, tipo).'},
    {s:'#conteudo .kpis',ti:'Os KPIs do período',tx:'Horas apontadas, % faturável, pessoas ativas e uso do Jira — a leitura rápida do intervalo.'},
    {c:'Por pessoa',ti:'Por pessoa',tx:'Horas de cada um no período, com a meta ao lado. As folgas (chips) explicam feriados e ausências descontados.'},
    {c:'Top projetos',ti:'Top projetos por horas',tx:'Onde o esforço foi parar. Clique numa barra para filtrar o restante da tela por aquele projeto.'},
    {s:'#conteudo .ia-card',ti:'🧠 Resumo das atividades (IA)',tx:'Gera, sob demanda, uma análise em texto de cada pessoa: cadência, volume e colaboração, com sinal 🟢/⚪/🟠. Requer a chave de IA configurada pelo administrador.',quando:'Aparece quando a chave de IA estiver configurada pelo administrador.'}]},
  timesheet:{t:'Timesheet',p:[
    {s:'#conteudo .ts-kpis',ti:'O total e a lacuna',tx:'Horas apontadas no período, o esperado pela meta e a lacuna que falta fechar.',quando:'Aparece quando houver horas apontadas no período selecionado.'},
    {s:'#conteudo .ts-wrap',ti:'Pessoa × dia',tx:'A matriz do time: cada célula é um dia. Fim de semana, feriado, ausência e hoje não contam na lacuna — por isso as cores diferentes.',quando:'Aparece quando houver horas apontadas no período selecionado.'},
    {s:'#conteudo .ts-legend',ti:'A legenda das cores',tx:'Verde fechou o dia, laranja fechou em parte, vazio não apontou; cinza é dia que não conta.',quando:'Aparece junto da matriz, quando houver dados no período.'},
    {s:'#grp-exportar',ti:'⬇ Exportar',tx:'Exporta em vários recortes: detalhado, por pessoa, por projeto, por ticket ou por tipo.'}]},
  ranking:{t:'Ranking',p:[
    {s:'#conteudo .ap-vis,#conteudo .rc-tab',ti:'Semana · mês · ano',tx:'O cumprimento de apontamento no tempo: 📅 esta semana, 🗓 este mês e 📆 este ano.'},
    {s:'#conteudo .rk-list',ti:'A régua é a meta',tx:'Cada pessoa aparece com o % da meta batida no recorte — não é quem apontou mais horas, é quem fechou o combinado.',quando:'Aparece quando houver apontamentos no recorte escolhido.'},
    {s:'#conteudo .rk-medal',ti:'🏆 Pódio, ⭐ estrelinhas e 🔥 sequências',tx:'Fechou a semana na meta, ganhou uma estrelinha; semanas seguidas viram sequência. O pódio destaca os três primeiros.',quando:'Aparece quando alguém já tiver batido meta no recorte.'},
    {ti:'Engajamento',tx:'A outra aba mede o uso do Jira (comentários, transições, criações) — atividade, não horas.',quando:'Aparece na aba Engajamento desta tela.'}]},
  tickets:{t:'Tickets',p:[
    {s:'#tk-group',ti:'Agrupar do seu jeito',tx:'Os tickets do período agrupados por projeto, tipo, categoria ou pessoa.'},
    {s:'#conteudo .ts-wrap',ti:'Horas + atividade por ticket',tx:'Cada linha traz as horas apontadas e a atividade do período — clique para abrir a ficha do ticket.',quando:'Aparece quando houver tickets com movimento no período.'},
    {s:'#hdr-periodo',ti:'Período e filtros',tx:'A lista obedece ao período e aos filtros do topo; ⬇ Exportar leva o recorte atual para CSV.'}]},
  qualidade:{t:'🔎 Qualidade (IA)',p:[
    {s:'#qa-dias',ti:'O recorte da auditoria',tx:'Quantos dias para trás e (opcional) o projeto a auditar.'},
    {s:'#qa-analisar',ti:'Analisar com IA',tx:'A IA lê as boas práticas TI-04-006 no Notion e confronta os tickets criados no período.'},
    {s:'#conteudo .qa-lista',ti:'Nota e violações',tx:'Cada ticket recebe nota e a lista do que não seguiu a prática, com o menu de ações para corrigir na hora.',quando:'Aparece depois de rodar 🤖 Analisar qualidade.'},
    {s:'#conteudo .ia-geral',ti:'A leitura geral',tx:'O resumo do período: o que o time mais erra ao abrir ticket — a pauta de melhoria.',quando:'Aparece depois de rodar a análise (requer a chave de IA).'}]},
  audit:{t:'🕵️ Auditoria de Tickets',p:[
    {s:'#aud-pessoa',ti:'Por pessoa',tx:'A auditoria TI-04-014 é por quem CRIA o ticket: escolha a pessoa e a janela de dias.'},
    {s:'#aud-analisar',ti:'Rodar as validações',tx:'São checagens objetivas (datas, estimativa, descrição, épico, responsável…) — sem IA, sem subjetividade.'},
    {c:'✅ O que está correto',ti:'✅ / ⚠️ / 🔧',tx:'O que passou, o que não passou e as ações sugeridas para ajustar — cada item abre o ticket.',quando:'Aparece depois de rodar as validações da pessoa escolhida.'}]},
  analytics:{t:'📈 Analytics',p:[
    {s:'#conteudo .anl-grupo',ti:'26 visões de governança',tx:'Os achados vêm agrupados por tema: prazos, pessoas, horas & estimativas, reuniões, qualidade & vínculos.',quando:'Aparece quando os dados do período terminam de carregar.'},
    {s:'#anl-dias',ti:'A janela de análise',tx:'Quantos dias entram na conta — e os filtros de projeto e responsável ao lado.'},
    {s:'#conteudo .anl-grid',ti:'Cada cartão é um achado',tx:'O número é o tamanho do problema; clicar abre a lista dos itens por trás dele.',quando:'Aparece quando os dados do período terminam de carregar.'},
    {s:'#anl-gestao',ti:'🛠 Agir em massa',tx:'Dentro de um achado, este botão leva os tickets já selecionados para a Gestão — atribuir, reprogramar, comentar, mover.',quando:'Aparece dentro do detalhe de um achado — clique num cartão para abrir.'},
    {s:'#anl-csv',ti:'⬇ Exportar o achado',tx:'A lista aberta sai em CSV para levar à reunião.',quando:'Aparece dentro do detalhe de um achado — clique num cartão para abrir.'}]},
  relatorios:{t:'📚 Central de Relatórios',p:[
    {s:'#conteudo .rc-chips',ti:'Escolha o tipo de projeto',tx:'DEA, DEF, PEA, PEF, DAMS, PAMS, ARQ, IMI, IPA, ITPR — o número no chip diz quantos projetos seus são daquele tipo.'},
    {s:'#conteudo .rc-grid',ti:'O que é essencial ali',tx:'Para o tipo escolhido: ⭐ Essenciais (O) primeiro, depois 👍 Recomendados (R). Cada cartão explica a pergunta que o relatório responde e como usá-lo.',quando:'Aparece ao escolher um tipo de projeto nos chips acima.'},
    {s:'#conteudo [data-rel-abre]',ti:'Abrir no app →',tx:'Leva direto à tela que entrega aquele relatório, já no recorte certo — o catálogo é um índice para o que existe.',quando:'Aparece nos cartões do tipo escolhido.'},
    {s:'#rc-dim',ti:'Filtrar por dimensão e busca',tx:'Escopo, tempo, custo, recursos, risco… ou busque pelo nome/pergunta do relatório.'},
    {s:'#conteudo .rc-td',ti:'A matriz completa',tx:'Relatório × tipo de projeto: O essencial · R recomendado · – não se aplica. Gestores clicam na célula para ajustar a matriz da empresa.'}]},
  metricas:{t:'📈 Métricas por tipo de projeto',p:[
    {s:'#conteudo .rc-chips',ti:'Escolha o tipo de projeto',tx:'Cada tipo (DEA, DEF, PEA, PEF, DAMS, PAMS, ARQ, IMI, IPA, ITPR) tem o seu conjunto de métricas — o número no chip é quantos projetos estão naquela categoria do Jira.'},
    {s:'#rm-proj',ti:'Todos os projetos ou um só',tx:'Por padrão soma os projetos do tipo; escolha um projeto (ex.: Parceria por nome) para ver as métricas dele.'},
    {s:'#rm-de',ti:'Período próprio',tx:'As métricas não dependem do período do topo: escolha de/até ou um atalho (este mês, 3, 6 ou 12 meses, este ano). Máximo de 1 ano.'},
    {s:'#conteudo .vg-hero',ti:'Os números do tipo',tx:'Horas, custo, receita e margem do período, projetos e tickets com horas — cada bloco abaixo detalha uma métrica e explica como ler.',quando:'Aparece quando as horas do período terminam de carregar.'},
    {s:'#conteudo .rm-bloco',ti:'Cada bloco é uma métrica',tx:'Tabelas e gráficos com a linha "Como ler" embaixo. Linhas clicáveis abrem os tickets por trás do número, com ações (ficha, status, Gestão, Rateio).',quando:'Aparece quando as horas do período terminam de carregar.'},
    {s:'#conteudo [data-rm-perfis]',ti:'⚙️ Perfis',tx:'Nível (Júnior/Pleno/Sênior) e departamento de cada pessoa — alimentam "horas do Sênior", "tarefas por nível" e "custo por departamento". Gestores editam; vale para o time todo.',quando:'Aparece quando as horas do período terminam de carregar.'},
    {s:'#conteudo .rm-abas',ti:'Métricas ⇄ Catálogo',tx:'A aba ao lado é a 📚 Central de Relatórios: o catálogo oficial (O/R por tipo). As duas telas andam juntas, com o mesmo tipo selecionado.'}]},
  rentab:{t:'💹 Rentabilidade de projetos',p:[
    {s:'#conteudo [data-rp-novo]',ti:'Cadastre o projeto',tx:'Nome, cliente, projeto do Jira (opcional), início, duração em meses, carga de trabalho vendida (h/mês ou total) e valor-hora — é isso que define a receita.',quando:'Aparece para gestores na lista de planos.'},
    {s:'#conteudo .ad-grid',ti:'Os planos',tx:'Cada cartão resume receita, esforço previsto, custo e margem do cenário ativo; clique para abrir.',quando:'Aparece quando há ao menos um plano cadastrado.'},
    {s:'#conteudo .rp-cen',ti:'Cenários',tx:'Base + quantas variações quiser: duplique um cenário, mude quem faz o quê e compare no fim da tela.',quando:'Aparece com um plano aberto.'},
    {s:'#conteudo .vg-hero',ti:'Os números do cenário',tx:'Receita, esforço previsto (e a eficiência: % das horas vendidas), custo (sempre horas × custo/h de cada pessoa), margem contra a meta, receita por hora trabalhada e a folga para alocar alguém mais barato.',quando:'Aparece com um plano aberto.'},
    {s:'#conteudo .rp-sim',ti:'Simulador rápido',tx:'Digite o esforço total previsto ou a eficiência alvo e a grade se reajusta; mude o valor-hora ou a margem-meta e veja o efeito na hora.',quando:'Aparece para gestores com um plano aberto.'},
    {s:'#conteudo .rp-grade',ti:'Planner visual pessoa × mês',tx:'Cada célula são as horas da pessoa naquele mês (execução ou gestão). Enter e setas navegam; o Total redistribui pelos meses. O rodapé mostra previsto, vendidas, saldo e o realizado do Clockwork.',quando:'Aparece com um plano aberto.'},
    {s:'#conteudo .rp-stack',ti:'Gráficos',tx:'Vendidas × previsto × realizado por mês, a alocação empilhada por pessoa e a cascata da receita até a margem.',quando:'Aparece com um plano aberto.'}]},
  roadmap:{t:'🗺️ Roadmap',p:[
    {c:'🗺️ Roadmap',ti:'O que vem por aí',tx:'O rumo da ferramenta: em desenvolvimento, planejado e em avaliação — atualizado a cada entrega.'},
    {c:'✅ Entregas recentes',ti:'✅ Entregas recentes',tx:'O que já foi publicado, direto das Novidades — para conferir se o que você pediu chegou.'},
    {ti:'Como entrar no roadmap',tx:'Sugestões entram por ⋯ Mais → ❓ Ajuda & feedback: viram issue no GitHub e depois item aqui.'}]},
  gestao:{t:'🛠 Gestão de Tickets',p:[
    {s:'#conteudo .ap-filtros',ti:'Filtrar o que interessa',tx:'Vencimento-limite, projeto, responsável, status, busca e presets. Um link compartilhável guarda o filtro para outra pessoa abrir igual.'},
    {s:'#conteudo .ap-vis',ti:'Lista, tabela ou quadro',tx:'▤ Lista, ▦ Tabela ou 🗂 Quadro — no quadro, clicar no cartão SELECIONA. A seleção persiste ao trocar de visualização.'},
    {s:'#gx-all',ti:'Selecionar em massa',tx:'Marque tudo (ou grupo a grupo) e trabalhe em cima da seleção.',quando:'Aparece quando há tickets no filtro atual.'},
    {s:'#conteudo .gx-bar',ti:'A barra de ações',tx:'👤 Atribuir · 🔁 Alterar status (separado por status atual) · 💬 Comentar · 📅 Reprogramar com motivo · 🔀 Mover de projeto · 🗑 Excluir (irreversível, exige digitar EXCLUIR).',quando:'Aparece assim que você marca ao menos um ticket.'},
    {s:'#gx-epicos',ti:'Épicos e duplicados',tx:'Ajuste o épico de vários tickets e encontre duplicados prováveis antes de sair criando mais.',quando:'Aparece com tickets marcados.'},
    {s:'#gx-csv-sel',ti:'⬇ Exportar a seleção',tx:'Leva os tickets marcados para CSV — útil para atas e cobranças.',quando:'Aparece com tickets marcados.'}]},
  alertas:{t:'🚨 Alertas',p:[
    {s:'#conteudo .al-grid',ti:'O que está pegando fogo',tx:'Atrasados e críticos organizados por severidade e categoria — cada bloco abre a lista.',quando:'Aparece quando houver atrasados ou críticos no período.'},
    {s:'#conteudo .alx-filtros',ti:'Filtrar e selecionar',tx:'Filtre por projeto/responsável e marque vários tickets para tratar juntos.',quando:'Aparece ao abrir uma das listas de alerta.'},
    {s:'#conteudo [data-alx-reprog]',ti:'📅 Reprogramar com motivo',tx:'A nova data vai para o Jira junto com um comentário padronizado dizendo POR QUE mudou — em lote.',quando:'Aparece em cada ticket da lista de alertas.'},
    {s:'#conteudo [data-alx-atrib]',ti:'👤 Atribuir',tx:'Ticket crítico sem dono não anda: atribua na hora, para você ou para outra pessoa.',quando:'Aparece em cada ticket da lista de alertas.'}]},
  reclassificar:{t:'🗂 Reuniões — Reclassificar',p:[
    {s:'#conteudo .rc-tab',ti:'As duas abas de Reuniões',tx:'Reclassificar (mover de projeto) e Vincular a tickets — a mesma tela, dois trabalhos diferentes.'},
    {s:'#rc-busca',ti:'Achar as reuniões',tx:'As reuniões abertas do RDF; busque pelo título ou pelo responsável.',quando:'Aparece quando houver reuniões abertas para reclassificar.'},
    {s:'#rc-alvo',ti:'Escolher o destino',tx:'O projeto para onde as reuniões vão. O tipo é mantido e o status é preservado quando existe no destino.',quando:'Aparece quando houver reuniões abertas para reclassificar.'},
    {s:'#rc-mover',ti:'Mover em lote',tx:'Marque as reuniões e mova todas de uma vez — o painel avisa uma a uma o que deu certo.',quando:'Aparece quando houver reuniões selecionadas.'}]},
  reuvinc:{t:'🗂 Reuniões — Vincular a tickets',p:[
    {s:'#rv-busca',ti:'A reunião de origem',tx:'Escolha a reunião aberta que deve virar registro em outro ticket.',quando:'Aparece quando houver reuniões abertas para vincular.'},
    {s:'#conteudo [data-rv-vinc]',ti:'Vincular →',tx:'Dois caminhos: ➕ criar um ticket novo de apoio funcional num projeto de AMS (tipo, resumo e duração já preenchidos) ou 🔗 comentar num ticket aberto.',quando:'Aparece em cada reunião da lista.'},
    {s:'#rv-transf-key',ti:'🔁 Transferir qualquer ticket',tx:'Informe o número do ticket destino: o esforço é vinculado lá e o original é excluído — com todos os detalhes gravados no destino.'}]},
  ams:{t:'AMS (apuração por ciclo)',p:[
    {s:'#ams-sel',ti:'Um contrato por vez',tx:'Escolha o cliente/contrato: a apuração é sempre de um contrato, independente do período do topo.',quando:'Aparece quando houver contrato de AMS com projetos mapeados em Contratos (Admin).'},
    {s:'#conteudo .ams-nav',ti:'O ciclo',tx:'Navegue entre os ciclos do contrato — o vigente vem selecionado.',quando:'Aparece com um contrato de AMS selecionado.'},
    {s:'#conteudo .ams-kpis',ti:'Banco de horas e excedente',tx:'Horas contratadas, consumidas, saldo e excedente. Só as horas FATURÁVEIS consomem o pacote.',quando:'Aparece com um contrato de AMS selecionado.'},
    {s:'#conteudo .ams-fat',ti:'Faturável × não faturável',tx:'A separação vem da descrição do TIPO do chamado no Jira — por isso o tipo importa tanto na criação.',quando:'Aparece com um contrato de AMS selecionado.'},
    {s:'#conteudo [data-ams-pdf]',ti:'🖨 PDF da apuração',tx:'Gera o documento do ciclo para enviar ao cliente ou anexar à fatura.',quando:'Aparece com um contrato de AMS selecionado.'}]},
  receita:{t:'💰 Receita',p:[
    {s:'#conteudo .kpis',ti:'A visão do dinheiro',tx:'Bolsa de horas e projetos: consumo × contratado, com a receita estimada do período.'},
    {s:'#conteudo .rc2-grid',ti:'Projeto a projeto',tx:'Cada barra mostra quanto do contratado já foi consumido, com a projeção até o fim — e a tag de risco quando o ritmo estoura.',quando:'Aparece quando houver contratos com horas e projetos mapeados.'},
    {ti:'De onde vêm os números',tx:'Da base de Contratos (Admin): horas contratadas, valor-hora e projetos do Jira. Contrato sem projeto mapeado não aparece aqui.'}]},
  controladoria:{t:'🏦 Controladoria de Projetos',p:[
    {s:'#conteudo .ap-chips',ti:'Escolha a categoria',tx:'A saúde financeira é lida por CATEGORIA de projeto (AMS, Tarefas Avulsas…) — os blocos são configuráveis por categoria.'},
    {s:'#ct-de',ti:'O período da apuração',tx:'De/até próprios desta tela (não é o período do topo), porque o fechamento financeiro tem calendário próprio.'},
    {s:'#conteudo .ct-tb',ti:'Receita, custo e margem',tx:'A margem vem com semáforo: verde saudável, amarelo atenção, vermelho no prejuízo. Tudo clicável até o ticket.',quando:'Aparece quando houver dados no período escolhido nesta tela.'},
    {c:'👥 Custo por pessoa',ti:'👥 Custo por pessoa',tx:'Quem custou o quê no período, pelo custo/hora — o custo de gestão aparece separado.'},
    {c:'⏳ Execução do esforço',ti:'⏳ Quanto já foi executado',tx:'O andamento do esforço do projeto e a evolução mês a mês — para ver se o consumo está no ritmo certo.'},
    {s:'#ct-custopadrao',ti:'Custo padrão',tx:'O valor usado quando a pessoa não tem custo/hora cadastrado — mexer aqui muda toda a apuração.'}]},
  config:{t:'⚙️ Central de configurações',p:[
    {s:'#conteudo .cfgc-grid',ti:'Todos os ajustes num lugar',tx:'Cada cartão é uma área: metas, pessoas, projetos, Teams, planejamento, identidade, auditoria e integrações.'},
    {s:'#cf-abrir-metas',ti:'🎯 Metas, ausências e feriados',tx:'Meta de horas (global ou por pessoa), ausências, feriados nacionais e a vigência de cada pessoa (admissão/desligamento) — sem perder o histórico.'},
    {s:'#cf-gestores',ti:'📋 Quem aprova',tx:'Os gestores que recebem as aprovações de planejamento e veem as abas de decisão e relatórios.'},
    {s:'#cf-res-ativo',ti:'📣 Envios automáticos ao Teams',tx:'O resumo agendado e o aviso de ranking: ligue, escolha frequência e horário, e teste com um clique.'},
    {s:'#cf-reu-nat',ti:'🎯 Prioridades e reuniões',tx:'Naturezas de projeto, status considerados e o horário do lembrete da reunião semanal.'},
    {s:'#cf-abrir-log',ti:'🗒 Histórico de ações',tx:'A auditoria do que o time fez PELO PAINEL: quem, quando, em qual ticket e com que resultado.'}]},
  admin:{t:'⚙️ Contratos (Admin)',p:[
    {s:'#ad-cliente',ti:'O cadastro do contrato',tx:'Cliente, tipo de contrato, horas contratadas, valor-hora, vigência e mínimo/teto mensal.'},
    {s:'#ad-projs',ti:'Projetos do Jira',tx:'É este mapeamento que liga o contrato às horas apontadas — sem ele, AMS e Receita não têm o que apurar.',quando:'Aparece no formulário do contrato (ao cadastrar um novo ou editar um existente).'},
    {s:'#ad-salvar',ti:'Salvar e conferir',tx:'Depois de salvar, o consumo do contrato aparece logo abaixo, no período selecionado no topo.'},
    {s:'#conteudo [data-ad-portal]',ti:'Portal do cliente',tx:'Gera o link de acompanhamento para o cliente — leitura apenas, sem acesso ao painel.',quando:'Aparece nos contratos já cadastrados.'}]},
  alocacao:{t:'🧑‍💼 Alocação (macro)',p:[
    {c:'🧑‍💼 Alocação',ti:'Temporariamente indisponível',tx:'Esta tela está fora do ar por reformulação — vai voltar integrada ao 📋 Meu Planejamento.'},
    {s:'#conteudo [data-goto="minhasemana"]',ti:'O que usar enquanto isso',tx:'O 📋 Meu Planejamento cobre o planejamento semanal por atividade, com aprovação e comparação com o realizado.'},
    {s:'#conteudo [data-goto="roadmap"]',ti:'Acompanhar o retorno',tx:'O 🗺️ Roadmap mostra em que fase está a reformulação.'}]},
  planejamento:{t:'📅 Planejamento macro',p:[
    {c:'📅 Planejamento macro',ti:'Temporariamente indisponível',tx:'O plano de esforço por função (fases = épicos) está fora do ar por reformulação.'},
    {s:'#conteudo [data-goto="minhasemana"]',ti:'O que usar enquanto isso',tx:'Para planejar e comparar com o realizado, use o 📋 Meu Planejamento e os 📊 Relatórios do planejamento.'},
    {s:'#conteudo [data-goto="roadmap"]',ti:'Acompanhar o retorno',tx:'O 🗺️ Roadmap mostra em que fase está a reformulação.'}]},
};
const GUIA_KEY='jirainsight_guias_v1';
function guiasVistos(){ try{ return JSON.parse(localStorage.getItem(GUIA_KEY)||'{}')||{}; }catch(e){ return {}; } }
function guiaVisto(v){ return !!guiasVistos()[v]; }
function guiaMarcaVisto(v){ const m=guiasVistos(); m[v]=hojeSP();
  try{ localStorage.setItem(GUIA_KEY, JSON.stringify(m)); }catch(e){} atualizaBotaoGuia(); }
// Botão flutuante 🧭: some onde não há guia e acende o pontinho quando a pessoa
// ainda não viu o guia DESTA tela.
function atualizaBotaoGuia(){
  const b=document.getElementById('btn-guia'); if(!b) return;
  const g=GUIAS[estado.vista];
  b.hidden=!g;
  if(!g) return;
  const dot=document.getElementById('guia-dot'); if(dot) dot.hidden=guiaVisto(estado.vista);
  b.title=`Guia interativo de ${g.t} (tecla ?)`;
}
// Roda o guia de uma tela: navega, espera pintar e começa os passos.
function iniciaGuia(v){
  const g=GUIAS[v]; if(!g){ toast('Esta tela ainda não tem guia interativo.','warn'); return; }
  fechaModal(); fimTour();
  _tourLista=g.p.map(p=>Object.assign({vai:v,g:1}, p)); _tourGuia=v; _tourHome=false; _tourI=0;
  if(estado.vista!==v){ try{ vaiPara(v); }catch(e){} }
  _guiaEspera(0);
}
function _guiaEspera(n){
  const pronto=document.querySelector('#conteudo .card,#conteudo .vg-card,#conteudo .mp-card,#conteudo .ax-grid');
  if(pronto||n>20) return mostraTour();       // até ~4s esperando os dados da tela
  setTimeout(()=>_guiaEspera(n+1),200);
}
// Índice de guias (usado na Ajuda): telas na ordem do menu, com ✓ nas já vistas.
function guiasIndiceHTML(){
  const grupos={};
  NAVCAT.forEach(c=>{ if(c[0].startsWith('acao:')||!GUIAS[c[0]]) return;
    (grupos[c[2]]=grupos[c[2]]||[]).push([c[0], (GUIAS[c[0]]||{}).t||c[1]]); });
  return Object.keys(grupos).map(g=>`<div class="gu-grp">${esc(g)}</div>
    <div class="gu-grid">${grupos[g].map(([v,rot])=>`<button class="gu-b" data-aj-guia="${escA(v)}">
      <span class="gu-n">${esc(rot)}</span>${guiaVisto(v)?'<span class="gu-v">✓ visto</span>':'<span class="gu-v" style="color:var(--cerceta)">▶</span>'}</button>`).join('')}</div>`).join('');
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
// Ações dentro do painel de Metas (delegação no corpo do modal).
// Links "abrir tela" da lista TODAS as telas (❓ Ajuda) — fecham o modal e navegam.
document.getElementById('modal-body').addEventListener('click',(e)=>{
  // 🧭 "guia" tem prioridade sobre "abrir tela" (o botão vive dentro do item da lista).
  const gu=e.target.closest&&e.target.closest('[data-aj-guia]');
  if(gu){ e.stopPropagation(); iniciaGuia(gu.getAttribute('data-aj-guia')); return; }
  const g=e.target.closest&&e.target.closest('[data-aj-goto]'); if(!g) return;
  fechaModal(); vaiPara(g.getAttribute('data-aj-goto'));
});
