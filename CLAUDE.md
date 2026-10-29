# CLAUDE.md — Notas do projeto

Painel **"Dexterity Hub"** (antes "Insights de Uso (Jira + Clockwork)") da Dexterity IT.

- **Navegação por perfil (2026-09-13, a pedido do usuário):** o **Dexterity Hub** é o conteúdo
  genérico (para todos: Início, 📆 Hoje, ⏱ Apontar, 📥 Inbox, 🎯 Prioridades, 👤 Meu trabalho, ➕ Criar ticket);
  as áreas **Dexterity Entrega** (gestores de entrega/PMs), **Dexterity Negócio** (comercial,
  financeiro, controladoria) e **Dexterity Insights** (diretoria e governança) são grupos
  `data-area` no `index.html` que aparecem pela **lente do perfil** (`cfg.papeis`, `AREAS`,
  `papeisDe`/`areaVisivel`/`homePadrao` em `01-nucleo.js`, `aplicaLente` em `26-navegacao.js`).
  **Lente, nunca permissão.** Tela nova = linha no `NAVCAT` (com a área) + botão no grupo certo;
  tela aposentada = entrada em `VISTA_ALIAS` (29-url-topo.js) para o link antigo não quebrar.
  `npm run check` confere NAVCAT × VISTAS × index.html.
- **Grupos de abas (fases 2–3, 2026-09-14):** telas irmãs são **abas de um grupo** (`ABAS` em
  `26-navegacao.js`): `estado.vista` continua sendo a tela da aba (links `?v=`, listeners e
  VCHROME intactos); o grupo é só apresentação — uma entrada no menu (a tela principal) e a
  barra `#abas`. A fase 3 fundiu Negócio/Insights (📑 Contratos, 🛡 Apuração de contratos,
  📊 Visão Geral, 📚 Central de Relatórios) e a ficha do 📁 projeto ganhou a **🦴 espinha do
  projeto** (`projEspinha`/`projEspinhaVai` em `02-projetos.js`: chips que abrem Contrato,
  Plano, Execução, Apuração e Resultado já no projeto). `npm run check` confere ABAS × VISTAS × menu.
- **Fase 4 (2026-09-14):** a espinha ficou de **ida e volta** — 7 chips (+ 🤝 Parceria e 📅
  Cronograma) e o botão/chip `[data-proj-ficha="KEY"]` em qualquer tela volta à ficha
  (`projAbreFicha`, handler global em `02-projetos.js`; `projChipsFicha` nas listas de projetos).
  As abas ganharam **memória** (`abaLembra`/`abaUltima`, só no navegador: a entrada do menu abre
  a última aba do grupo; links, favoritos e Ctrl+K abrem a aba pedida) e **contadores** (`ABAS_N`,
  só com dado já carregado). A 🏦 Controladoria ganhou o **📁 Resultado do projeto**
  (`estado.ctrl.destaque` → `ctResultadoHTML`) e o bloco 🧭 Todas as categorias. A 📚 Central
  liga cada relatório às visões do Analytics (`anl`) e aos blocos das Métricas (`rm`) — chips na
  Central, selo "R08" do outro lado (`relCodigosDe`). Tela nova que entrega um relatório oficial
  = acrescentar o id em `anl`/`rm` do item de `REL_CAT`.

- **👤 Meu trabalho por intenção + ➕ Criar ticket (2026-10-27, a pedido do usuário: "organize melhor o menu Meu
  trabalho, mais explícito — transferir ticket, convidar para apontar, meus tickets em tal projeto"):** o menu do
  `index.html` tem **4 seções** `.navg-sec` (MEUS TICKETS · CRIAR TICKETS · MINHAS HORAS E REUNIÕES · MINHA SEMANA)
  e **uma regra de leitura só** (está no tour e na ❓ Ajuda): cada linha é **verbo + objeto**; **"…" no fim = o app
  pergunta o ticket/projeto antes**; **linha recuada (`.nav-sub`) = aba da tela de cima**. Desenho escolhido por um
  painel de 3 propostas × 3 juízes (`docs/menu-meu-trabalho-2026-10-27.md`). Mecânica: item de **ação** =
  `[data-acao="x"]` → **`navAcao(x)`** (26-navegacao.js), a porta única das ações sem tela própria (também os slugs
  `acao:x` do NAVCAT/Ctrl+K, sem ⭐); `meusproj` abre o seletor de projetos `abreMeusTicketsProjeto` (conta os meus
  abertos pela base do card da Início: `carregaVenc(MTP_ATE(), velho)` — assinatura `carregaVenc(ate, forca)` — com
  `estado.apontar.semVenc` ligado SÓ durante a chamada e devolvido ao que era, porque a chave do cache e a URL levam o
  semVenc e Esc no modal não pode deixar o Apontar com "Incluir sem vencimento" marcado; cache de outro dia ou > 5 min
  é relido; exige `id.accountId`, senão revalida) e cai no ⏱ Apontar por `hxAbreApontar(fil, {proj})` — projeto sem
  chamado na lista ganha `<option>` própria no select, para o filtro não ficar invisível; `transferir`/`convidar`
  passam pelo seletor 🎫 em modo escolher **com o título da ação** (`abreBuscaTickets(proj, aoEscolher, titulo)`; no
  modo escolher a linha não tem ⏱ e o rodapé diz "Enter escolhe") e, sem identidade, `abreIdentidade(motivo, {leitura,
  depois})` diz para quê e **continua a ação** depois da validação (`_idDepois`). Todo item
  de tela do 👤 leva **`data-exata`** (o rótulo diz a tela → o 29 não aplica a memória de abas `abaUltima`; ⭐,
  links e Ctrl+K não mudam) e o 📈 leva `data-aud="minha"`; `marcaVista` acende TODAS as entradas da vista e, entre
  entradas com audiência, só a da audiência atual. O **➕ Novo ▾ virou o botão direto `#navg-novo-b` "➕ Criar
  ticket"** (`data-v="planejar" data-exata`; estilo por id para vencer o realce genérico — pressionado/hover é `color:var(--cartao)`
  sobre `--grafite`, que inverte com o tema; no Dexterity canto 2px) — 6 dos 7 itens dele moram no 👤 e o ⏱ Apontar
  segue fixo na barra; **regra: o ➕ nunca é a única porta de nada**. 🔀 Transformar só no Ctrl+K; a 🎫 busca já tem a
  linha fixa da paleta (não entra no NAVCAT). `marcaVista` acende também a tela principal do grupo quando ela é botão
  fixo da barra (⏱ Apontar na aba ➗ Rateio) — nunca o ➕. A entrada de Entrega do 📊 planrel (sem `data-aud`) volta a
  audiência de `minha` para `gestor` (o 29) — a "minha" do 👤 não vaza para o time. Títulos das abas (`ABAS.rot`)
  **não** foram renomeados de propósito (R155). CSS: `.navg-menu` rola por dentro no desktop (teto medido ao abrir por
  `navMenuAltura`, limpo em `fechaMenusNav`; `max-width:calc(100vw - 32px)`; o cabeçalho do 👤 quebra linha), na gaveta
  do celular o `.nav-sub` recua 56px e os ícones de linha saem. Item novo no
  menu = linha no `index.html` (com `data-exata` ou `data-acao`) + `title` + caso em `navAcao` se for ação + NAVCAT.
  Teste: `menu-test.mjs` (Playwright: ações, seletor, Ctrl+K, sem identidade, estrutura, realce, celular 360px).
- **🧩 Hierarquia no ⏱ Apontar (2026-10-27, a pedido do usuário: "melhore a visualização dos tickets que possuem pai,
  inclusive quando possui mais de um nível; facilite a atribuição de um ticket a um épico ou história"):** o
  `/api/vencimentos` (lista e `?detalhe=`) devolve **`pais`** = `{CHAVE:{r,t,ic,n,st,pai}}` com TODOS os ancestrais
  (`resolvePais`: o 1º nível sai do campo `parent`, os de cima de buscas `id in (…)` por nível, até 3 rodadas; `pai:null` =
  desconhecido; falha = cadeia mais curta, nunca derruba a lista) e `n` = `hierarchyLevel` por ticket (-1 sub-tarefa · 0
  tarefa/história · 1 épico · 2 iniciativa). Tela em **`public/js/13b-apontar-pai.js`** (prefixo `aph`): **`aphCadeia(t)` é a
  leitura ÚNICA da cadeia** (cartão, ▦ Tabela, agrupado, seletor); o cartão ganha `.aph-cadeia` acima do `.ap-l1` (uma linha
  por nível, recuo `--aph-i`, chave → ficha 🔍) — `linhaTicket(t, extras, pula)`, `pula` = níveis do topo que o agrupado não
  repete. **🧩 Agrupar por épico/pai** (`[data-aph-agrupa]`, só na ▤ Lista, lembrado em `localStorage`
  `jirainsight_ap_agrupa_pai_v1`): dentro do projeto, bloco por raiz (`aphGruposDe`; filhos logo depois do pai que está na
  lista, recuo `--aph-p`); soltos em "Sem épico/pai" com o lote. **Seletor** `[data-aph-pai]`: pede ao servidor SÓ o nível
  que o Jira aceita (`GET /api/projetos?pais=P&nivel=N` — 1 épicos, 0 histórias+tarefas para sub-tarefa, 2 iniciativas;
  cada candidato traz o pai DELE, para o caminho mudar sem reler), cache 2 min (`_aphCand`), filtro em memória sem acento,
  Enter escolhe o 1º, "outra chave" confere por `?chaves=`; grava por `POST /api/transicao {epico:true}` com o token da
  pessoa, que agora diz em português a recusa de hierarquia (`hierarquia:true`) e recusa pai = ele mesmo. Depois do vínculo,
  `aphDepoisDeVincular` atualiza TODAS as cópias (porData, 🕑 recentes, Gestão) e o mapa (`aphGuardaNodo`: vazio nunca apaga
  o que se sabia). O **lote** reusa o 🧩 Ajustar épicos da Gestão: `abreModalEpicos({lista, depois})` (20) — sem opções segue
  igual na Gestão; `gxSoltos` usa `t.n` quando existe. Ficou de fora (R156/R157): o mesmo na Gestão/📆 Hoje/ficha, tirar do
  épico e virar sub-tarefa. **Regras da revisão (mesmo dia, 12 achados corrigidos):** em `aphNodo` o TICKET (da lista ou
  ficha) manda no próprio `pai` e o mapa só completa — e o vínculo também reescreve `pais[k].pai` em todos os mapas (mover a
  história leva a sub-tarefa e o bloco junto); `aphGuardaNodo` parte do que já se sabe; depois de um vínculo o `_aphCand`
  some e a próxima leitura dos candidatos e da lista vai com `nocache=1` (`_aphForca`, `estado.apontar.paiSujo` lido pelo
  `carregaVenc`) — **cada função da Vercel tem o seu cache em memória: o `cacheClear` do /api/transicao não limpa o do
  /api/vencimentos**; Enter no filtro só escolhe quando sobra UM candidato; o servidor classifica a recusa pela MENSAGEM
  do Jira (toda recusa do PUT vem em `errors.parent`); no `resolvePais` o lote `id in (…)` que falha é partido ao meio até
  isolar o id ilegível (teto de 40 buscas); o "vários soltos" do seletor usa `estado.apontar.listaVisivel`; o status ▾ e o
  retorno do apontar ignoram o painel 🧩 (`.ap-trans:not(.aph-painel)`, `.ap-log .ap-fb`). Testes: `hierarquia-test.mjs`
  (Playwright, 91 casos; fixture `POST /api/_hier {ligar|falha|limpar}` no `servidor-mini.mjs`, desligada por padrão) e
  `agsem/hier-servidor-test.mjs` (handlers reais, Jira falso, 25 casos).
- **🤝 Contratos de parceria (2026-09-15, a pedido do usuário):** além do cadastro, cada contrato guarda a
  **📂 pasta do SharePoint** e os **📄 documentos** (`c.pasta`, `c.docs[]`) — só **links** validados por `pcUrl`
  (http/https), abertos em nova aba com a conta de quem clica: **o painel nunca guarda o arquivo nem
  credencial**, e todo mundo vê/abre (só gestores cadastram). E a **👥 equipe e alocação** (`c.equipe[]`): cada
  recurso (pessoa do time ou nome livre) tem uma **lista de trechos** `{de, ate, modo, v}` — é a lista que
  permite "2h/dia de 15/05 a 25/05 e 4h/dia depois" e vários consultores. `pcHorasRegra`/`pcPlanejamento`
  (em `16b-parcerias.js`) somam pelos **dias úteis** (feriados descontados) e entregam horas e valor por
  **período de faturamento**. Modo novo = entrada em `PC_MODOS` + `PC_MODO_IDS` + um ramo em `pcHorasRegra`.
  **✎ Ajuste manual da previsão (2026-09-18, a pedido do usuário):** nem todo mês fecha pela conta, então cada
  período do quadro 🧾 aceita um número **digitado** — `c.prev[ym] = {h, v}` (irmão do `c.ajustes[ym]`, que ajusta
  as datas). `pcPlanejamento` devolve o **calculado** (`horasAuto`/`valorAuto`) **e** o **efetivo** (`horas`/`valor`,
  com `manH`/`manV`): horas digitadas mandam nas calculadas e o valor as acompanha, a menos que também tenha sido
  digitado. Campo vazio = volta ao automático; o `↺` limpa o período; o calculado **nunca** é apagado — fica ao lado,
  e o total mostra os dois. As colunas por pessoa continuam sendo o que os trechos dizem (podem não somar o total
  ajustado — isso está dito na tela). Tudo vai para o `pcLog`. **Acesso (2026-09-30, a pedido do usuário: "dê acesso para todo mundo; depois bloqueamos no futuro"):** a gestão dos contratos de parceria (16b) e do 🧾 Odoo do contrato (16c) é de **todo mundo identificado** no painel — `pcPodeEditar()` em `16b-parcerias.js`; `PC_SO_GESTORES=true` religa a restrição a `cfg.gestores`. Sem identidade a tela explica e leva ao ⏱ Apontar (o servidor exige a identidade para gravar a config).
- **🧾 Contrato ↔ Odoo Vendas (2026-09-20, a pedido do usuário):** `public/js/16c-parcerias-odoo.js` + ações
  `odoo-catalogo` / `odoo-contrato` / `odoo-contrato-cancela` no `api/resumo.js`. **O contrato é o dono da ordem de
  venda** (`c.odoo = {id, name, url, parceiroId, produtoId, produtoExtraId, itens:[{chave,id}], sync}`): um item por
  período (`p:AAAA-MM`, produto de horas de consultoria) + um por hora extra (`x:<id>`, produto de horas extras), cada
  item com o rateio por **objeto de resultado** (contas analíticas → `analytic_distribution`; `c.rateio` padrão,
  `c.rateios[ym]` por período, `x.ac` na extra). **↻ Sincronizar = ler (`odoo-venda-status`) + comparar (`dry:1`)**; a
  escrita só acontece depois do "Aplicar", e as regras moram no servidor: item faturado nunca muda, quantidade nunca
  cai abaixo do faturado, o que saiu da previsão é apagado (cotação) ou zerado (ordem confirmada), item feito à mão fica.
  Remover o contrato cancela a ordem (`action_cancel` com `disable_cancel_warning`; se o Odoo recusar, a pessoa decide).
  `pcNotasPendentes` alimenta a faixa 🧾 Próximas notas e o 📆 Fechamento do mês. Produtos padrão em `cfg.odooVendas`
  (env opcional `ODOO_PRODUTO_SERVICO` / `ODOO_PRODUTO_EXTRA`). O plano da 💹 Rentabilidade sem ordem própria mostra
  a do contrato. **Regra de UI aprendida aqui:** no Chrome o `change` dispara com o foco já fora do campo — por isso o
  redesenho das tabelas editáveis (extras, rateio) é adiado (`pcAdiaRender`) até o foco sair da tabela, e o
  formulário do contrato renasce de `st.rasc` e reaproveita o nó aberto (era isso que fazia o contrato "não editar").
  Falha de gravação da config compartilhada agora avisa na tela (`avisaCfgRecusada`).
- **🔀 Mescla de três vias da config compartilhada (2026-10-03, a pedido do usuário: "não consigo editar nem
  excluir os contratos"):** a causa era a mescla de conflito do `cfgAdotaRemoto` (01-nucleo.js): a CHAVE inteira que
  a sessão tinha mexido vencia o remoto, e só desenhar a 🤝 Parceiros já "mexia" em `cfg.parcerias` (`pcDocs`,
  `pcEquipe`, `pcPrev`, `pcRateio`, `pcRateios`, `pcExtras` criam `[]`/`{}` no contrato). Resultado: uma aba antiga, o
  celular ou um colega com a tela aberta salvava qualquer coisa → conflito → devolvia a lista INTEIRA de contratos
  velha → o contrato excluído voltava e a edição sumia. Agora `cfgMescla3(base, local, remoto)` (bloco
  `// <cfg-mescla>`): **vazio não conta como mudança** (`cfgIgual` ignora `[]`/`{}`/ausente), objetos se mesclam
  **campo a campo** e listas de itens com `id` **item a item** (excluído aqui sai; excluído lá só volta se esta sessão
  o editou de verdade; criado dos dois lados fica; mesmo campo nos dois lados → vale o desta sessão). Lista sem `id`
  mexida nos dois lados → vale a desta sessão (como antes). Lista nova na config = dar `id` aos itens para ganhar a
  mescla item a item. Aba aberta antes da publicação roda a mescla antiga até recarregar (no roadmap: o servidor
  recusar cliente desatualizado). Testes: `cfg-mescla-test` (unidade, 12 casos) e `parcerias-duas-sessoes` (Playwright,
  duas sessões contra um servidor que persiste e devolve conflito por rev, com a config real de produção).
- **✎ Horas vendidas digitadas por mês (2026-09-21, a pedido do usuário):** a linha **Horas vendidas** do 🗓 planner
  (`17b-rentabilidade.js`) aceita um número por mês — `p.vendMan['AAAA-MM']`, irmão do `c.prev[ym]` do contrato. O
  ajuste entra em **`rpVendPorMes`**, a **fonte única** das horas vendidas, e por isso vale de uma vez para receita
  do mês e do plano, eficiência, saldo, `rpPeriodosFat` (itens da ordem no Odoo), `rpVendAte` (realizado × previsto)
  e os gráficos — nada de recalcular em cada consumidor. `rpCalc` devolve o **calculado** (`vendAuto`,
  `vendAutoPorMes`) ao lado do **efetivo** (`vend`, `vendPorMes`, com `vendMan`/`nVendMan`). Campo vazio volta ao
  automático, o `↺` limpa o plano, meses fora do prazo ficam guardados e avisados (`rpVendManOrfaos`). Os leitores de
  `p.vendMan` **não criam o objeto** (só `rpVendMan`/`rpVendManSet`): criar `{}` durante o render marcaria
  `cfg.rentab` como alterada por esta sessão e ela venceria o remoto no merge de conflito da config.
- **🔐 Área do cliente com e-mail e senha (2026-09-26, a pedido do usuário):** o `/portal.html` já existia
  como **link secreto por contrato** (`?c=<portalToken>`); o pedido foi uma **área para anexar no site**, com
  usuário e senha. O link continua valendo, e ao lado dele nasceu a conta: `?pcli=<ação>` no `api/config.js`
  (**sem função serverless nova** — o limite de 12) + tabela **`jirainsight_portal_contas`** no Supabase.
  **Ninguém se cadastra sozinho** — foi decisão explícita do usuário contra o auto-cadastro: a conta nasce de
  um **convite do gestor**, já amarrada a UM contrato, e é **esse contrato que define o escopo dos dados**; o
  pedido do cliente nunca escolhe de quem são os chamados. Senha só em **hash scrypt** (salt por conta,
  `timingSafeEqual`); **sessão sem estado** assinada com HMAC (`PORTAL_SEGREDO`, ou derivada da chave do
  Supabase) no cabeçalho **`Authorization` — nunca cookie**, que é o que faz a área funcionar **dentro de um
  iframe** de outro domínio; a conta é **revalidada a cada pedido**, então revogar corta a sessão aberta.
  O login responde **igual** para senha errada e e-mail inexistente (não conta quem existe na base) e trava
  após 5 erros. As contas **não** vão para a config compartilhada: ela inteira desce para o navegador de todo
  o time. Não há serviço de e-mail no projeto, então o convite volta como **link** (7 dias, uso único, guardado
  só como hash) para o gestor mandar — a gestão fica em 📑 Contratos › ⚙️ Admin › **👤 Acessos do cliente**
  (`pcliBlocoHTML` em `16-contratos-ams-receita.js`). `portalDados(req,res,c)` foi extraída de `portal()` para
  os dois caminhos (link e conta) compartilharem o mesmo código, e a lista de chamados usa a **categoria** do
  status (`statusCategory.key`), não o nome — fluxo novo no Jira não quebra a cor. **Bloqueio de ambiente:** a
  Vercel está com **SSO Protection** em `all_except_custom_domains` e só há domínios `.vercel.app`, então o
  cliente externo não chega ao portal sem um **domínio customizado** — é DNS, não código (está no roadmap).
  Testes: `portal-conta-test` chama o **handler real** com stub de Supabase/Jira (escopo, token forjado,
  sessão vencida, revogação, bloqueio) e `portal-tela-test` roda a página real contra essa API, inclusive
  **dentro de um iframe**.
- **🎫 Controle de tickets da Agenda por responsabilidade (2026-09-26, a pedido do usuário):** o painel do
  `03-agenda-reunioes.js` era UMA lista com tudo (passado, futuro, resolvido, pendente). Agora a classificação é
  **única** — `agClasse(ev)` devolve `ok` / `minha` / `colega` / `ign` — e é ela que decide o bloco na tela E o que
  `agPendentes()` (card do Início, 📆 Fechamento) e `agAguardando()` enxergam: nada de recontar em cada consumidor.
  Blocos: **⚠ dependem de você** (com as **🕗 já passadas** num `<details>` recolhido + "🚫 ignorar as N passadas"),
  **⏳ aguardando quem organizou** (colega da Dexterity que convidou e não criou o ticket — horas suas travadas,
  há quantos dias, **📨 cobrar** um a um ou **todos de uma vez**, e **📝 criar assim mesmo** para se desbloquear) e,
  recolhidos, **✓ com ticket** e **🚫 ignoradas**. **🚫 Ignorar** grava em `cfg.agendaIgnorar` pela chave
  `s:<serie>` (recorrente → a série inteira, com confirmação) ou `e:<evId>` (avulsa); `agIgnorado` é **leitor e não
  cria o objeto** (criar `{}` no render marcaria a chave como alterada por esta sessão e ela venceria o remoto no
  merge da config). `agIgnora`/`agDesignora`/`agGravaAviso` **não gravam** — quem chama faz `salvaCfg()`, e é isso
  que deixa o lote (ignorar passadas, cobrar todos) sair numa gravação só. O estado aberto/fechado dos blocos vive
  em `estado.agenda.secoes` (só a sessão): o `<details>` se abre sozinho e o listener só anota, para o redesenho
  que toda ação provoca não fechar tudo de novo. Cabeçalho e linhas compartilham **um grid** (`.ag-ct-tab` com
  `display:contents` nos filhos) — cada linha resolvendo as colunas sozinha desalinhava o cabeçalho.
  **📝 Ticket da reunião (2026-10-01, a pedido do usuário):** o modal confere no Jira (`POST /api/reunioes
  {conferir:1, itens:[{titulo,dia}]}`) se já existe um ticket com o **mesmo título no mesmo dia** (vencimento ou
  criação em SP; prefixo "Reunião:" ignorado) e devolve **quem criou** — só então abre em **🔗 Vincular** com a
  chave preenchida ("já existe… criado por X"); a escolha da pessoa (`modoManual`/`chaveManual`) vence a sugestão.
  A conferência geral da tela usa a mesma chave `dia|titulo` (`agAchKey`), o que parou de casar a ocorrência de
  hoje de uma recorrente com o ticket da semana passada. As **horas do convite** têm três fontes — 📅 estimada
  (agenda) · ⏱ real (relatório de presença do Teams, consultado ao escolher) · ✎ manual (digitada, `parseTempo`) —
  resolvidas por `agSegConvite(ev,m)`; o valor é validado **antes** de criar/vincular, para não deixar ticket sem
  convite. Legado `titulos:[…]` continua aceito na API.
  **Data exata, ✂ desvincular e aba 🎫 (2026-10-02, a pedido do usuário: "a data precisa ser exatamente a
  mesma; opção de desvincular; o controle poluía a tela"):** `conferirTickets` casa **só `duedate = dia`** da
  reunião (ticket sem vencimento ou criado no dia para outro dia **não** casa). **✂ desvincular**
  (`agDesmarcaTicket`) desfaz só o vínculo do painel — o ticket fica no Jira — e grava a recusa em
  **`cfg.agendaNao[evId]={k}`**: `agAchadoDe(evId)` (o ÚNICO leitor dos achados, na linha e no modal) esconde o
  ticket recusado; vincular de novo apaga a recusa. O **🎫 Controle de tickets virou a vista `agcontrole`**
  (aba do grupo `agenda` em `ABAS`, contador `ABAS_N.agcontrole` = `agPendentes().length`): `renderAgenda()`
  serve as duas abas (`ctrl=estado.vista==='agcontrole'`), a conferência geral no Jira só roda na aba 🎫, e a
  tela dos eventos ganhou a faixa-resumo `.ag-ct-faixa` (`[data-ag-goto-ctrl]`). Quem redesenha testa
  `agVistaAberta()`, nunca `estado.vista==='agenda'`. O card "Reuniões sem ticket" da Início e o aviso do Inbox
  levam a `agcontrole`.
  **➕ Convidar quem não está no convite (2026-10-08, a pedido do usuário: "convidar uma pessoa da Dexterity para
  fazer o apontamento mesmo que ela não esteja convidada na reunião"):** a lista do modal 📝 vem de
  `agPessoasConvite(ev)` (convidados do Outlook × usuários ativos do Jira por e-mail; devolve `internos`, `externos`
  e o conjunto `accs` já coberto) e, abaixo dela, o bloco `.agm-extra` com a busca `#agm-extra-busca`:
  `agExtraCandidatos(m, ev, q)` → `{itens, total}` procura entre `estado.agenda.usuarios` (≥ 2 letras, nome sem
  acento ou e-mail; a lista já vem só com pessoas ativas do `/api/usuarios`, o `RE_EXCLUIR` é só garantia) fora de
  você, dos convidados casados e dos extras já adicionados; até `AG_EXTRA_MAX`=8 chips + "… e mais N"; o 1º chip
  (`.agm-extra-1`, ↵) é o que o Enter adiciona; e-mail de outro domínio aparece no chip. Chips e Enter chamam
  `agExtraAdiciona` (mantém a busca enquanto houver resultados, rola a linha nova à vista, toast), o ✕
  `[data-agm-extra-rm]` chama `agExtraRemove` (sem levar o foco à busca — no celular abriria o teclado). Esc com
  texto na busca só limpa (o listener do 03 roda antes do Esc global do 30 e faz `stopImmediatePropagation`).
  Os extras vivem só em `_agM.extras` (nada na config) e viram linhas `[data-agm-p][data-agm-extra]` marcadas —
  `agConfirma` lê `[data-agm-p]:checked` como antes, **sem e-mail no payload** (o servidor resolve o do aviso no
  Teams pelo accountId), então servidor, Inbox e Teams não mudaram. Digitar na busca redesenha SÓ
  `#agm-extra-lista` (`aria-live`); no redesenho do modal inteiro, quem já estava na tela mantém a marcação
  (`noDom`/`marcados`), quem acabou de entrar nasce marcado e o campo com foco recupera foco e cursor.
  **Regras da revisão (mesmo dia):** todo redesenho do 📝 passa por `agAgModalAberto()` — o placeholder nasce com
  `.ag-modal`, e com o modal fechado `_agM` vira null (antes a conferência no Jira/⏱ real que chegava depois do Esc
  trocava o conteúdo de QUALQUER modal aberto pelo 📝 com o botão Confirmar); falha do `/api/usuarios` não vira
  `{}` (`ag.usuErro` + `[data-agm-usu-retry]`), senão todo convidado contava como externo e a busca mentia.
  `logAcao('agenda-convidar-extra')` grava no formato que o 🗒 Histórico mostra: `t`=ticket, `para`=quem entrou
  fora do convite, `motivo`=a reunião. Teste: `agenda-extra-test.mjs` (Playwright, 44 casos, inclusive um por achado da revisão, celular e tablet; fixture
  `AGENDA_EVENTOS` + `/api/_convites` no `servidor-mini.mjs`).
  **🙋 Você aponta ao enviar o convite + ✅ ticket para Feito (2026-10-23, JI-153, a pedido do usuário: "na hora que
  eu mando o invite deve ser apontado as minhas horas; para esses tickets você precisa passar do status reunião
  agendada para concluído"):** a linha "você" (antes um checkbox desabilitado sem `data-agm-p` — o achado de 2026-10-08)
  virou caixa real `[data-agm-p=<accountId>][data-agm-eu]`, marcada; você entra em `pessoas` e o `criarConvites` já
  apontava quem tem o accountId do token (`proprio`). Regras: reunião futura → desabilitada (worklog no futuro não);
  `m.fixo` (👥 de reunião que já tem ticket) → nasce desmarcada (segundo worklog seu no mesmo ticket); `planGate(dia)`
  ANTES de criar o ticket quando você está marcado (nada criado se a trava fechar; o `#agm-fb` explica como seguir);
  `proprio.ok` → `registraExtraDia` + `logAcao('apontar',…,false)`; falha do próprio → toast de aviso, convites seguem.
  **`agConcluiReuniao(key, id)`** (03) é a porta única da conclusão: `listar` (que no `api/transicao.js` passou a devolver
  `status:{nome,categoria}` do ticket) → só mexe se o status atual casa `AG_RE_AGENDADA` (`/agendad|marcad/i`) → escolhe a
  transição de categoria `done` cujo nome NÃO é cancelar (o COP tem "Participar da Reunião" → Feito e "Cancelar Reunião"
  → Cancelado, as duas done) → executa → `logAcao('status',…,false)`; devolve `{feito, motivo}` e quem chama grava a
  config UMA vez e decide o aviso. Chamado pelo 📝 (reunião não futura), pelo `respondeConvite` (13, silencioso) e pelo
  `chmConfirma` (14c). Teste: `agenda-eu-test.mjs` (Playwright, 29 casos: próprio worklog, transição 3 e nunca a 2, 👥
  desmarcado, futura, 🔗 em agendada × em andamento, falha do próprio, trava antes de criar, convidado confirmando,
  celular; fixture `STATUS_FIX`/`CONV_PEND` + `POST /api/_convites {limpar|pendente|status}` no `servidor-mini.mjs`).
  **📅 Semana passada na agenda (2026-10-26, a pedido do usuário: "não está aparecendo eventos que ocorreram na semana
  passada"):** o `calendarView` do `api/reunioes.js` vai desde a **segunda da semana passada** (dia de SP; era `agendaDiaSP(-1)`)
  até +14. Na 📅 Agenda os dias **antes de ontem** ficam no `<details class="ag-passados">` (`data-ag-sec="diasPassados"`,
  recolhido; ontem/hoje/próximos à vista — os testes antigos clicam no evento de ontem); o 🎫 Controle os mostra em 🕗 Já
  aconteceram. A conferência geral no Jira vai em **lotes de 8** (o servidor corta em 8 por pedido), das mais recentes,
  até `AG_CONF_MAX`=48 — antes só as 8 primeiras eram conferidas. `agAutoCria` continua só para HOJE. Testes:
  `agsem/janela-test.mjs` (handler real com fetch simulado e relógio fixo) e `agenda-semana-test.mjs` (Playwright, 15).
  **🔒 Trava do ticket de reunião + ⏰ alerta de fim do dia (2026-10-27, a pedido do usuário: "o organizador demora para
  criar, todo mundo fica sem apontar, e se outra pessoa cria não existe trava; os eventos que envolvem pessoas da Dexterity
  podem ser criados por qualquer pessoa, mas se uma cria, outra não pode criar o mesmo; um alerta no fim do dia, só para o
  organizador, se ninguém criou"):** o vínculo antigo (`cfg.agendaTickets[evId]`) era pela chave `id` do Outlook, que é
  DIFERENTE em cada agenda — quem não criou não via o ticket. A chave comum é o **`uid` = `iCalUId`** (o `agenda()` do
  `api/reunioes.js` agora o devolve). A **trava mora no servidor** — `api/_lib/agenda.js` (graphToken mudou-se para cá;
  `reunioes.js` o reexporta para o 🌐 portal): UMA linha por reunião em `jirainsight_config` (`agtk_<sha256(uid)>`, nunca na
  `default`); **o INSERT é a trava** (409 = alguém chegou antes). Estados `criando` (vale 3 min, `TRAVA_TTL_MS`) / `ok` (com
  o ticket) / `nao` (lápide do ✂ desvincular: livre, mas o vínculo antigo da config não ressuscita). Sub-rota `POST
  /api/reunioes {agtrava:'ler'|'reservar'|'confirmar'|'liberar'}` (identidade pelo `/myself` — o nome de quem reservou vem
  do Jira, nunca do navegador). **Regras da revisão (mesmo dia, 22 achados):** a reserva devolve uma **ficha (`tok`)** e
  confirmar/soltar sem a ficha não mexe numa reserva viva — nem a da mesma pessoa noutra aba (`criando.minha`); confirmar é
  condicional (INSERT quando não há linha, PATCH filtrado pelo `updated_at` lido) e devolve `ja`/`criando`; `migracao`
  (vínculo antigo → trava) só com a reunião SEM linha; tomar uma reserva vencida confere antes a **label
  `agenda-uid-<hash>`** que todo ticket da Agenda leva e, se a busca no Jira FALHA, recusa (não assume); o cliente só segue
  com `reservado`/`semTrava` explícitos (`agReservaOk` — erro do servidor não conta como reservado), solta a reserva só em
  falha CERTA (o Jira respondeu "não criei"; sem resposta a reserva fica e a label decide em 3 min), e a confirmação que
  volta `ja`/`criando` vira "o seu ticket ficou solto — aponte no da reunião" sem convites; `agMarcaTicket` só deixa de
  gravar na config com a trava SABIDAMENTE ligada (`semTrava===false`) e, se a confirmação falha, grava a config como
  reserva (`agMarcaFallback`); o ✂ sempre chega ao servidor; a reserva "criando" também vence na tela (`agCriandoOutro`
  confere o `em`) e a lista é relida 65 s depois quando há reserva viva; o dono do ticket (👥 convidar × ⏱ apontar) é quem
  CRIOU (`agSouDonoTicket`), não quem organizou. **Tela (03):** `agClasse` = ok · minha (QUALQUER participante cria — o
  bloco "aguardando quem organizou" e o "cobrar todos" saíram; o 📨 avisar ficou como secundário) · criando · ign;
  `agCarregaTravas` lê junto com a agenda (lotes de 150) e migra vínculos antigos; `agConfereTravaModal` relê ao abrir o 📝;
  `agJaCriado` vira o 📝 em "Fulano já criou — aponte aqui" (só você marcado). As **📞 Ligações** reservam antes de criar
  (14c). **⏰ Alerta:** `alertaFimDoDia` (fase do tique de 30 min do `api/teams.js`, a partir de `AGENDA_ALERTA_HORA`,
  padrão 18:00; `?tipo=agenda-alerta` manual só com CRON_SECRET) lê pela `$batch` do Graph a agenda de cada pessoa ativa
  do Jira, fica com as reuniões que ELA organizou (`isOrganizer`), com mais alguém da Dexterity, que **terminaram** na
  janela `(desde, ate]` (em andamento fica para a próxima), sem trava `ok`, sem vínculo antigo, não ignoradas e sem ticket
  achado pela label ou título+dia (a lápide pula as duas conferências) — e grava o aviso em `agal_<sha256(email)>` (`vistos`:
  o dispensado não volta) + DM do Teams só para quem ganhou alerta novo (`AGENDA_ALERTA_TEAMS=0` desliga). Leitura do Graph
  que falha de passagem (429/5xx) → `erroLeitura` e o dia NÃO é carimbado; a janela tem teto de 5 dias (emenda de feriado).
  O 📥 Inbox lê os alertas por `POST /api/reunioes {agalertas:'ler'|'dispensar'}` (o servidor tira os que ganharam ticket,
  foram ignorados ou vinculados) — `inboxAlertasAgenda()`, card "⏰ Reuniões suas sem ticket" com 📝 Criar agora
  (`agAbrePorUid`). Testes: `agenda-trava-test.mjs` (Playwright, 70 casos, duas pessoas com ids diferentes; fixture
  `POST /api/_trava {limpar|travas|alertas|semTrava|falha|confirmaJa}` no `servidor-mini.mjs`) e `agsem/agtrava-test.mjs`
  (handlers reais com Supabase/Jira/Graph falsos, 48 casos).
- **📞 Ligações — Call tracking (2026-10-09, a pedido do usuário: "qualquer ligação no meu computador — WhatsApp,
  Teams, Google Meet —, assim que acabar, um pop-up para criar um ticket daquela reunião ou apontar minhas horas num
  ticket já criado; igual ao Call Timing do Timing, integrado ao Jira Insights"):** o usuário usa **Mac** (o Timing é
  só macOS; o `meudia-activitywatch.mjs` e o `.shortcut` já eram de Mac). Duas peças: (1) **detector**
  `public/call-tracking/CallTracking.swift` — app de barra de menus que sabe pelo **Core Audio quem capta o
  microfone** (macOS 14.2+: `kAudioHardwarePropertyProcessObjectList` + `kAudioProcessPropertyIsRunningInput` +
  bundle id; antes: dispositivo em uso + "app provável"), lê as abas do navegador por AppleScript (Automação) para
  reconhecer Meet/Teams web/WhatsApp Web, e no fim da ligação mostra o **pop-up** (NSPanel) que abre
  `/?v=chamadas#ct=<base64url(JSON)>&m=criar|apontar|lista`. Máquina de estados `Rastreador` (folga 20 s, mínimo
  2 min, sono fecha no último tique) coberta pelo `--selftest`. **Não dá para compilar Swift neste ambiente (Linux):
  a verificação é a CI** `.github/workflows/call-tracking-mac.yml` (repo público → macOS grátis; roda em `claude/**`
  também), que compila arm64/x86_64 com alvo macOS 12, roda `--selftest`/`--probe`, o instalador em modo CI e o
  `--demo` — o pop-up sai como **PNG em base64 no log** (`CT_DEMO_PNG`), porque o proxy daqui bloqueia o download de
  artefatos; leia o log com `mcp__github__get_job_logs` e decodifique entre `PNG-INICIO`/`PNG-FIM`. Instalação:
  `instalar.sh` compila **no Mac do usuário** (Ferramentas de Linha de Comando do Xcode), assina localmente e cria o
  LaunchAgent `br.com.dexterityit.calltracking` (o painel de produção responde a `curl` sem login — conferido pela
  CI). (2) **aba 📅 Agenda › 📞 Ligações** (`public/js/14c-chamadas.js`, vista `chamadas`, prefixo `chm`): um
  `<script>` inline no `<head>` do index tira o fragmento da URL ANTES de qualquer script (Analytics da Vercel) e o
  guarda em `sessionStorage` (`jirainsight_ct_frag`) — a ligação **nunca vai ao servidor** e fica só no navegador
  (`localStorage` `jirainsight_chamadas_v1`, por id; `chmValida` filtra o payload, que é dado de fora). O modal
  (`chmAbre` → `chmDesenhaModal`; dado assíncrono atualiza só pedaços em `chmAtualizaModal`, sem tirar o foco)
  casa a ligação com o evento da Agenda pela maior sobreposição (`chmEventoDe`), sugere o ticket da reunião / os
  recentes (`apCarregaRecentes`, extraído do 13) / os abertos parecidos (`mtPontua`, cache `_tkbCache` do 12b),
  cria (`/api/criar`, tipo `agTipoReuniao`, `respId` = quem cria, labels `call-tracking`) e aponta com o **início
  real**: o `/api/apontar` ganhou `hora` (`HH:MM`, opcional, validada; sem ela segue 09:00) — só vai quando o dia não
  foi trocado. Criou e o apontamento falhou → `parcial.key` na ligação e confirmar de novo só aponta. Fila "▶
  registrar uma a uma" em `estado.chamadas.fila`. **UMA gravação da config por confirmação** (o `agMarcaTicket` já
  grava; o `logAcao` vai com `false` antes dele). **Bug do núcleo achado aqui (01-nucleo.js):** duas gravações da
  config no mesmo clique (ex.: `agMarcaTicket` + `logAcao` da Agenda) saíam com a mesma rev, a 2ª dava conflito
  contra a 1ª e a mescla descartava a mudança dela (era o "S.aud undefined" intermitente do `agenda-extra-test`).
  Regras agora: **`salvaCfgRemota` manda UMA gravação por vez** (`_cfgEmVoo`/`_cfgDeNovo`: a que chega com outra no ar
  sai depois, com o cfg atual e a rev nova); a base da mescla (`_cfgBase`) é sempre o que o servidor TEM — a cópia do
  que foi enviado no sucesso e o remoto puro no `cfgAdotaRemoto` (nunca o resultado mesclado). Não compare revs por
  string: o sucesso devolve `…Z` e o conflito `…+00:00` (Postgres). **Revisão adversarial (mesmo dia, 16 achados
  corrigidos):** Mac — as entregues ficam 14 dias para "Reenviar ao painel" (outro perfil do Chrome); antes do 14.2 o
  palpite do app fica fixo enquanto o microfone segue em uso, só o microfone PADRÃO conta, sem app de chamada não é
  chamada e fone com microfone exige o app na frente; seletores pelo código de 4 letras (o SDK do macOS 12/13 não
  tinha os nomes — a CI reprova o símbolo fora do `#if compiler(>=5.10)` do autoteste e compila com o Xcode mais
  antigo); aba ativa primeiro e Teams/WhatsApp web só na aba ativa; "nunca perguntar" no meio da ligação vale;
  "Abrir 📞" no mesmo navegador das entregas. Painel — o `<select>` placeholder não apaga o projeto lembrado; a chave
  exata digitada vem antes de ACME-120…; sucesso depois de await só segue a fila se o modal ainda é o dela (e
  Depois/Ignorar travam durante a gravação); ignorar não apaga o `parcial`; o 📅 "ligar à reunião" é um contêiner
  (`#chm-vinc-l`) atualizado sem redesenhar (o foco fica); Enter só confirma de campo de texto/data; ligação com data
  no futuro ou de mais de 30 dias é recusada e o que chega nunca despeja pendente guardada. Testes: `chamadas-test.mjs`
  (Playwright, 85 casos: criar/apontar/fila/ignorar/busca/falha parcial/sem identidade/payload hostil/link forjado/
  hashchange/duas gravações seguidas/conflito real/celular/tablet; relógio do navegador fixo às 20:00 SP com
  `ctx.clock.setFixedTime`) com `ABERTOS`, `APONTADOS` (worklog com as validações da produção) e
  `?abertos=`/`?detalhe=` no `servidor-mini.mjs`.
- **⏱ Total do dia num dia que já passou (2026-10-20, a pedido do usuário: "quando aponto num dia que já passou, é
  informado que é o primeiro lançamento do dia, e já existiam lançamentos"):** `minhasHorasPorDia()` somava
  `estado.tempo.worklogs` — o PERÍODO do topo (padrão `7d`), que o ⏱ Apontar nem mostra (`VCHROME.apontar={}`) —, então
  um dia fora dele entrava na conta só com o lançamento recém-feito ("Total do dia: 30m"). Agora o Apontar tem a
  **janela própria** `estado.apontar.meusLogs={de, ate, logs:[{d,s,k,p,dt,resumo}]}`: SÓ os meus worklogs de
  `/api/tempo?desde&ate`, hoje-13 → hoje, alargada para trás por `apGaranteMeusLogs(dia)` (uma leitura em voo; só
  alarga; falha não insiste por 30 s). **Regras:** (1) `fazApontamento` **aguarda a janela ANTES do POST** — a leitura
  anterior ao worklog não pode contá-lo duas vezes — e a mensagem diz o dia ("Total do dia 14/10: 2h"); sem base
  (`apMeusLogsCobre`/`apTempoCobre` falsos) diz que não conferiu; (2) a janela manda nos dias que cobre, o período do
  topo serve fora dela, e `extraPorDia`/`extraLogs` somam por cima; na releitura, o extra que já voltou (mesmo dia +
  ticket + segundos) sai do acumulador — o que o Clockwork ainda não devolveu fica; (3) `carrega()` zera janela, extras e
  recentes juntos; o ↻ "Atualizar lista" e o 24 marcam `meusLogsSujo`; (4) os 🕑 recentes são DERIVADOS da janela +
  extraLogs (`apRecentesDe`), sem leitura própria — por isso o modal de apontar da 🛠 Gestão passou a chamar
  `registraExtraDia`; (5) `mtsLogsSemana` lê a janela e a navegação ‹ › alarga e redesenha ("Carregando…" enquanto
  lê); (6) o passo 3 do 🧾 Preciso criar meus tickets lê a janela do dia escolhido. Escolher a data na linha já lê o dia
  (o Apontar não espera). **Regras da revisão (mesmo dia, 10 achados corrigidos):** o pedido é limitado a 400 dias
  (`voltaDias(hoje,399)`) e a janela guarda o intervalo que o servidor DEVOLVEU (`j.meta.startDate/endDate`; resposta
  que não é `custom` é erro) — o `/api/tempo` cai em silêncio nos "7 dias" quando o pedido passa de 400 dias, e a janela
  ficaria "cobrindo" anos sem dados; a janela leva `a` = accountId e `apMeusLogs()` devolve null para outra identidade
  (trocar usuário / esquecer credenciais zeram janela, recentes e otimista); a releitura vai com `nocache=1` quando
  `meusLogsSujo` ou `meusLogsEscreveu` (o `registraExtraDia` marca), senão o cache de 20 min do servidor devolvia a
  janela anterior ao apontamento; a reconciliação só consome worklog NOVO em relação à base anterior (contagem por
  `d|k|s`) — 1h + 1h no mesmo ticket não engole o lançamento de agora; `carrega()` só zera o otimista dos dias FORA da
  janela (dentro, a releitura reconcilia); `fazApontamento` reobtém a linha depois do await (a janela chegando redesenha
  a lista); `apExtrasRemoveTicket(k)` no reclassificar (13) e no vincular (24); o passo 3 do 🧾 só redesenha quando a
  janela passou a cobrir o dia (antes, sem identidade, virava laço infinito de microtarefas); a semana que não conseguiu
  ler diz isso em vez de "sem apontamentos"; o realizado por projeto da "sua semana" (08) lê `minhasLogsEntre`. Teste:
  `apontar-dia-test.mjs` (Playwright, 32 casos, um por achado; fixture `MEUS_WL` relativo a hoje + `/api/vencimentos` no
  `servidor-mini.mjs` — o `/api/tempo` com `desde&ate` devolve também o que a rodada apontou e imita a queda nos "7 dias"
  acima de 400 dias). Fica no roadmap: a hora do apontamento na própria linha.
  **🏠 Início lê a mesma janela (2026-10-24, a pedido do usuário: "0m de 8h" na Início com 2h35 no Timesheet):** o card
  ⏱ Suas horas de hoje somava `minhasHorasPorDia()[hoje]` com `estado.tempo` como única exigência — o PERÍODO do topo
  (escondido na Início, `VCHROME.acoes={}`), que pode não incluir hoje e cujo `estado.cache[periodo]` vive a sessão inteira
  (a aba do celular fica aberta o dia todo). Agora: `cobreHoje = apMeusLogsCobre(hoje) || apTempoCobre(hoje)` decide se há
  número; `axGaranteMeusLogs(hoje)` (08) chama `apGaranteMeusLogs` quando a janela não cobre hoje ou está suja/escreveu,
  UMA leitura em voo e redesenho só se a "foto" (cobertura | horas | erro) mudou — sem laço; `carrega()` marca
  `meusLogsSujo`, então o ↻ relê a janela com `nocache=1` (horas lançadas direto no Jira/Clockwork aparecem no ↻); falha
  da leitura → card "não consegui ler… use o ↻" (`meusLogsErro`), nunca "Carregando…" para sempre. Teste:
  `inicio-horas-test.mjs` (Playwright, 13 casos: período sem hoje, ↻ sem cache, período "ontem", sem laço, falha, celular).
  Cuidado: a Início faz OUTRAS leituras `/api/tempo?desde&ate` (fechamento do mês, radar) — a janela é a que começa em hoje−13.
- **🚧 Trava do planejamento ao apontar + indicadores do planejamento na Início (2026-10-20, a pedido do usuário:
  "bloquear lançamento em dia que não foi planejado no planejamento semanal, ou deixar só como aviso, bem explícito;
  e o painel de entrada com projetos da semana pelo planejamento, tickets sem data, ticket aguardando minha
  resposta"):** `cfg.planGate={modo:'off'|'aviso'|'bloqueio', rascunho}` (⚙️ Configurações › 📋 Meu Planejamento, só
  gestor/admin; **`planGate` entrou em `CHAVES_PAPEL` do `api/config.js`** — o servidor recusa a mudança de quem não é).
  **A porta é UMA: `planGate(dias)` em `04-meu-planejamento.js`**, chamada ANTES do POST em todo lugar que grava worklog
  próprio (13 `fazApontamento`/`respondeConvite`/`enviaReuniaoGrupo`, 20 `gxApontaConfirma`, 14b `mtExecuta`, 14c
  `chmConfirma`, 22 `rtExecuta`, 23 `trfExecuta`, 09 `mdAponta`, 21 `cvEnviar`/`qkConfirma`, 24 `rvExecuta`) — lugar novo
  que grava horas = `if(!(await planGate(dia))) return;`. `planGateDia(dia)` é a régua (sem identidade, antes de
  `mpInicioVig` e `mpCapDia===0` dispensam; plano ausente / em elaboração / devolvido sem `rascunho` / sem atividade
  no dia reprovam); `planGateCarrega(w)` é a leitura AGUARDÁVEL do plano (o `mpGaranteMeu` é dispara-e-segue) com o
  mesmo cache `estado.minhasemana.meu[w]`; falha ao ler → toast e segue (nunca bloqueia por erro). O aviso/bloqueio é
  uma **sobreposição própria `.pg-bg`** (não o `#modal` — Gestão, 📞 e convite já estão num modal), Esc capturado
  antes do Esc global; "Apontar mesmo assim" (só no aviso) grava `logAcao('apontar-sem-plano')`; "Ir para o Meu
  Planejamento" abre a semana reprovada. Leitores `planGateCfg`/`planGateAtivo` não criam o objeto. É regra de tela —
  o servidor não impõe (roadmap). **Início (08):** `cAloc` virou **🗂 Projetos da semana** (do MEU plano, planejado ×
  feito via `minhasLogsEntre` + `extraLogs`; a alocação macro `cfg.alocacoes` ficou órfã da tela aposentada), **💬
  Aguardando sua resposta** (`mencoesPend` + último evento `comentario` de outra pessoa nos meus tickets em
  `ax.radAtv` + plano devolvido → `ax.respKeys`, rota `aguardando-resposta` → Gestão `soKeys`) e **⏳ Com o cliente**
  (`ax.cliKeys`, rota `gestao-cliente`); o 🗓 Tickets sem data já existia. `carregaInbox` redesenha a Início ao chegar
  (19). **Cuidado aprendido:** um handler local chamado `esc` dentro de uma função que usa o `esc()` global de HTML
  antes dele = TDZ ("Cannot access 'esc' before initialization") e a faixa nunca nascia — o teste pegou; handlers
  locais nunca com nome de helper global. Teste: `plan-gate-test.mjs` (Playwright, 69 casos: régua do dia, aviso/
  bloqueio/Esc/ir ao plano, falha de leitura, 📞 por cima do modal, config por gestor × recusa de não-gestor na tela e
  no servidor, cards da Início com plano enviado/em elaboração/sem plano, celular; fixture `PLANOS`/`MENCOES`/
  `ATIVIDADE` + recusa de chave de papel no `servidor-mini.mjs`). Com `ctx.clock.setFixedTime` a Início entra em laço
  (relê o status da ordem do Odoo e regrava a config): artefato do relógio parado — os blocos da Início rodam sem ele.
- **📅 Marcos e Cronograma totalmente editável (2026-10-21, a pedido do usuário: "transforme essa tela em algo totalmente
  editável"):** a tela (`02b-cronograma.js`) grava no Jira **com o token da pessoa** — arrastar barra/bordas/◆ (grade de 1
  dia, `pointer:fine`), duplo clique renomeia, ✎ formulário (nome, início `customfield_10015`, marco `duedate`,
  responsável, transições lazy, dependências *Blocks* entre épicos, 📐 alinhar filhos ao marco), + Nova fase (tipo de
  hierarquia 1). **Otimista**: `crPatchLocal` → `crReRender` → `crGrava` (`POST /api/criar {editar:1, itens, links}`);
  falha reverte + toast; sucesso = `↩ Desfazer` 10 s + `crReleFicha` (nocache, debounce). `crLinhas` NÃO muda (gate de
  paridade). Servidor: `editaLote` aceita `resumo`, `inicio`, `links:[{acao:'add',de,para}|{acao:'rm',id}]`; a ficha traz
  o `id` dos links. Regra aprendida: clique simples no nome espera 300 ms pelo duplo (abrir o épico no 1º clique engolia
  o 2º no modal). Teste: `cronograma-test.mjs` (41 casos; fixture `FICHA_ACME`/`/api/_edicoes` no `servidor-mini.mjs`).
  **Revisão do 📆 Hoje (mesmo dia):** fila de gravação POR DIA (`h.sv[d]`), destino gravado antes de marcar `movido`
  (`hjLevaPara`), `hjEstClamp`/`HJ_MAX_ITENS` no cliente, reuniões fora do Planejado, ↻ + `visibilitychange`, cronômetro
  com `a`=accountId, foco devolvido pelo seletor (`hjFocoSel`), `:has(:focus-visible)` para ↑↓ (o `:focus-within` deslocava
  a linha no mousedown e o clique real caía fora do alvo — um teste Playwright "real" pega isso, `el.click()` não).
- **📆 Hoje — o planejamento do dia como ponto central (2026-10-21, a pedido do usuário: "ajudar meu time a organizar seu
  trabalho, usar o Jira Insight como ponto central de planejamento do dia, incluindo controle da agenda e priorização de
  tarefas; veja o que o mercado tem para inspiração"):** tela nova `📆 Hoje` (`public/js/24b-hoje.js`, prefixo `hj`; vistas
  `hoje` + `hojetime` num grupo de abas; botão fixo depois da 🏠 Início) com a ✅ lista do dia (ticket, atividade do 📋 plano
  da semana, reunião da Agenda ou tarefa livre; ordem manual, 🎯 foco nos 3 primeiros, estimativa × capacidade = `mpCapDia`
  − reuniões), ⚡ ordenar por urgência (`hjUrgencia`, regra dita na tela), 💡 sugestões por fonte (`hjSugestoes`), a 🕘 linha
  do tempo (Outlook + blocos `ini` + worklogs com hora + "agora" + lacunas clicáveis; arrastar = bloco; 🗓 deep link de
  compose do Outlook — **a Agenda segue só leitura**), os rituais 🌅 Planejar (ficou de antes → sugestões → estimativas ×
  capacidade com "amanhã") e 🌙 Fechar (não feitos → amanhã/deixar/descartar; feitos sem apontamento → lote de worklogs;
  nota), o ⏱ cronômetro (pílula em todas as telas, `localStorage`, ■ → worklog com `hora` real; ▶ também na ficha 🔍) e,
  para gestores, 👥 Dia do time. **Dados por pessoa e dia** em `POST /api/config?dia=1` (`planejamentoDia`: `ler`/`salvar`/
  `time`; linha `dia_<accountId>_<AAAA-MM-DD>` em `jirainsight_config`, trava otimista pelo `updated_at`) — **nunca em
  `cfg`**. Regras: `hjGravaWorklog` é a porta única de worklog da tela (planGate antes, registraExtraDia + logAcao depois;
  o lote do 🌙 grava a config UMA vez); `hjGarante` não atropela dia em memória (só ↻/conflito trocam); dia no futuro não
  pede worklogs; nada move sozinho (o que ficou de antes é sugestão; "amanhã" é item a item e marca `movido` na origem).
  **Cuidado aprendido:** `.then(render)` numa promessa já resolvida (a janela do Apontar cobrindo o dia) virou laço de
  microtarefas que travou a página — toda leitura disparada no render precisa de guarda (`_logsP`) e só redesenha quando
  o dado MUDOU. A busca 🎫 ganhou o modo escolher (`abreBuscaTickets(proj, aoEscolher)`). A 🏠 Início tem o card 📆 Seu
  dia (`hjCardInicio`, ✓ nos 3 do foco). Pesquisa de mercado e decisões: `docs/hoje-planejamento-do-dia-2026-10-21.md`.
  **📝 Criar tickets a partir do dia (2026-10-22, a pedido do usuário: "criar tickets em massa ou individualmente, não
  apenas criar uma tarefa e ligar a um ticket"):** `hjCriarModal` → modal com UMA LINHA POR TICKET (projeto e tipo por
  linha — `hjTiposDe`/`hjTipoPadrao` sobre `estado.planejar.projetos`, carregados por `hjProjetosCriacao` do mesmo
  `/api/projetos`), vencimento e responsável para todos, 📋 colar várias (`título ; descrição`), ↵ próxima linha, Ctrl+↵
  cria. Entradas: 📝 Criar ticket na linha de adicionar, ⋯ › 📝 Criar o ticket deste item (tarefa livre) e "Criar tickets dos
  N itens livres". **Sem endpoint novo**: o lote vai ao `POST /api/criar {itens}` do 📝 Criar ticket; o criado entra no dia com
  `orig:'criado'` ou vira a chave do item livre (mesmo item, nada duplica); dia gravado UMA vez; `logAcao('hoje-criar')` por
  ticket + `salvaCfg()` uma vez; ↻ reenvia SÓ as linhas sem `key`; o teto de 60 itens é conferido ANTES de criar (ticket
  criado sem lugar no dia seria pior); modal fechado com a criação em voo → o que o Jira criou entra no dia mesmo assim.
  Teste: `hoje-test.mjs` (Playwright, 129 casos; fixture `?dia=1` + `/api/_dias` no `servidor-mini.mjs`; o `/api/criar` da
  fixture repete a `validaItem` da produção e simula falha por item com `[falha]` no resumo). Fixture: o
  "hoje−20" das fixtures relativas desvia das datas FIXAS do AMS (`DIA20()`), senão o `apontar-dia-test` quebra num dia
  do calendário.
- **📈 Análise do app × mercado e plano de melhorias (2026-10-20, a pedido do usuário: "verifique meu aplicativo
  como um todo, analise outras ferramentas de mercado semelhantes, sugira como melhorar — funcionalidades,
  usabilidade e facilidade para a pessoa organizar seu trabalho — e crie itens no roadmap"):** o documento mora em
  **`docs/analise-mercado-e-melhorias-2026-10-20.md`** (método, inventário, achados com evidência arquivo:linha,
  mercado com fontes, oportunidades em três ondas, o que ficou de fora de propósito) e a tela do 🗺️ Roadmap linka
  para ele (`[data-rm-analise]`, com passo no guia). Os **27 itens novos** entraram no topo do `ROADMAP` numa leva
  comentada (`// ---- 📈 Análise do app × mercado`), cada descrição começando por "Análise de 2026-10-20:" com a
  evidência e as ferramentas que fazem igual; 4 itens foram **reescritos** (📋 Carga das próximas semanas, 📣 Cobrar o
  apontamento, 📊 Uso do painel, ⚡ Carregar sob demanda → "Abertura mais leve", que subiu para planejado). O estágio é
  sugestão da análise; o usuário decide. Números que a análise fixou e que valem como régua para as próximas
  entregas: 2,5 MB de JS em 45 módulos; 13 leituras da API na abertura da Início (18 requisições com identidade;
  atividade 2×, tempo 4×); 12 pontos gravam worklog (os 12 do planGate; 4 sem `registraExtraDia`); mobile-audit com
  transbordo 0 nas 15 telas medidas e alvos de toque < 44 px em 111/114 no Apontar. Dado de uso real não entrou (o
  Supabase do painel não estava acessível daqui). Lições de método: a auditoria do código, a pesquisa de mercado e a
  medição mobile rodaram em paralelo (dois agentes + script) e o documento consolidou os três; o agente de mercado não
  sabia que "Copiar semana anterior" e "Criar rotina" já existiam — conferir no código antes de propor; e a
  **verificação adversarial** (8 agentes, 230 afirmações, 39 corrigidas — 4 erradas, 35 imprecisas) pegou contagens
  feitas de cabeça ("só 3 chamam registraExtraDia" eram 8; "95 abreModal" eram 94; "📞 tem sobreposição própria" não
  tem) — número ou "não existe X" só entra no texto depois do grep.
- **🏅 Scoreboard — nome de quem saiu do time (2026-10-24, a pedido do usuário: "isso aqui está errado", com
  duas linhas "712020:…" no placar):** eram pessoas **inativas no Jira**; o placar guarda 120 dias por accountId e
  `pessoasUnidas()` só conhece o elenco atual. Regras: `/api/usuarios` devolve também `inativos` (`jiraUsuariosTodos`
  no util — `jiraUsuariosAtivos` virou atalho dela, contrato intacto; cache `usuarios:v2`); o cliente guarda
  `estado.usuariosInativos` (também no `estado.cache[periodo]`) **só para dar nome**, nunca entra no elenco;
  `rkScoreCongela` grava o nome junto com a foto em **`cfg.scoreNomes`** (higienizado com as fotos: nome sem foto sai);
  **`nomePessoaDe(a)`** (01) é a régua: elenco → inativos → `scoreNomes` → id; `pessoaForaDoTime(a)` = fora do elenco →
  no placar vai para o **fim**, com o selo "saiu do time" (`tr.sc-fora`) e sem medalha (as medalhas são de quem está
  jogando). Tela nova que mostre accountId guardado = usar `nomePessoaDe`, nunca `pessoasUnidas()[a].nome||a`. Teste:
  `scoreboard-nomes-test.mjs` (Playwright, 12 casos; fixture `/api/usuarios` com `inativos` no `servidor-mini.mjs`).
- **🌳 Onde crio o ticket? reformulada pelos projetos de hoje (2026-10-26, a pedido do usuário: "veja os projetos que
  temos hoje e reformule as perguntas que levarão a cada projeto"):** a 1ª pergunta é **para quem é** (cliente ×
  Dexterity × ausência × não sei); no cliente, o **tipo de contrato = categoria do Jira** (DAMS direto sem o DCP /
  DCP por parceira / **PEA** cards / **PEF·DEF** com as perguntas de entregável que eram do "Projeto SAP" / **PV**
  pré-venda / **ADM** pedido de projeto novo com o tipo do pedido pela resposta — o ADM é a fila "Novo Projeto" com os
  tipos Projeto AMS · Projeto Dexterity · Projeto Terceirizado · Proj. Terc. Hora Aberta); no interno, rotina → **IFCEC**
  (finanças/contábil/controladoria) ou **RDF** (decisão do usuário: era TAD, mas o time já abria as rotinas lá), IMI/IPA
  em cards, estudo → DU/TAD, pedido pontual → TAD + departamento. Folha nova = `filtro:'cat'`+`catRe` (acha pela
  categoria; projeto SEM categoria entra pelo prefixo do nome — o IMECI está sem categoria no Jira) ou `soProjeto`
  (string ou função do form, resolvida por `arvChaveFixa`); `excl`, `tipoPorFreq`, `tipoPorNovo`. Decisões do usuário:
  DMCDCS ("ARQ | Melhoria Centro de Custo", categoria DEF) está **encerrado**; o ADM está em uso. Exemplos do
  `caminhoArvore` da IA do 🕑 Meu dia (`api/resumo.js`) seguem os rótulos novos. Teste: `arvore-test.mjs` (40 casos).
- **🔗 Transferir ticket com o histórico inteiro (2026-10-26, a pedido do usuário: "todo o histórico de um ticket é enviado
  para outro ticket e o ticket original é deletado; entre projetos ou dentro do mesmo projeto"):** tela `23b-transferir.js`
  (prefixo `tft`, entrada `[data-tft-abre="KEY"]` em qualquer lugar — Gestão, ⏱ Apontar, ficha 🔍, "Transferir →" da 🗂
  Reuniões) + motor `api/_lib/transferir.js` (sub-rota `POST /api/reunioes {transf:'ler'|'conferir'|'destino'|'comentarios'|
  'anexos'|'vinculos'|'filhos'|'historico'|'horas'|'excluir'}`, **tudo com o token da pessoa**). Substituiu o 🔗 transferir
  antigo (modo `generico` do assistente de reuniões, que só levava um texto e as horas totais em nome de quem transferia —
  removido do 24; a rota `vincular {transferir:1}` segue aceita para abas antigas). Decisões do usuário: horas dos COLEGAS
  = **convite** (`/api/apontar {convidar}` por pessoa e dia; a API do Jira só cria worklog no nome do dono do token) — as da
  pessoa vão direto com o `started` e a duração originais; levar comentários, anexos, vínculos + filhos e o resumo do
  histórico; o botão em mais telas. Regras: a tela guarda o progresso por item (`_tft.prog`) e **só chama `excluir` com
  tudo feito**; ↻ refaz só o que falhou (o destino criado não é recriado); `tftChecagem()` é a régua única dos bloqueios
  (filho que não cabe: nível do destino = nível do filho + 1 e subtarefa no mesmo projeto; destino = origem ou filho dela;
  anexo > 25 MB; > 300 comentários / 1000 worklogs) e dos avisos de perda (caixa desmarcada); o servidor relê a origem em
  cada etapa (vínculos, filhos, worklog é meu?) e o `excluir` recusa com filho pendente ou destino que não responde;
  comentários com "autor em data" no cabeçalho e `visibility` mantida; mídia ADF da origem vira texto (`adfSemMidia`).
  **Sem planGate de propósito** — a transferência MOVE horas que já existem.
  **Regras da revisão (mesmo dia, 13 achados — os de risco corrigidos):** (1) toda função da execução recebe o estado `t`
  dela (`tftChama(t,…)`, `tftLotes(t,…)`, `tftContas(t)`) — nunca lê o `_tft` global; `abreTransferir` no meio de uma
  execução (ou de uma que parou) volta ao progresso dela; Esc/×/clique fora não fecham durante a execução (captura no
  document); a conclusão é medida POR ID (`tftItens`), não por contagem; resposta sem `ok:true` (400, 504 em HTML) = lote
  falhou. (2) **Idempotência no servidor**: tudo o que vai ao destino leva marcador com o id da origem ("comentário copiado
  de K #id", "⏩ Transferido de K #id", "🕓 Histórico de K", "📦 Transferido de K", anexo de mesmo nome+tamanho, remote link
  de mesma URL, propriedade `tft.origem` no ticket criado — o `destino` criar procura por ela antes) e cada etapa lê o
  destino antes de escrever — repetir (timeout, aba recarregada) não duplica; item apagado da origem depois do inventário
  conta como feito. (3) O `excluir` recebe os `vistos` (todos os ids do inventário) e recusa se a origem ganhou comentário,
  apontamento, anexo ou vínculo novo; com a conta de serviço, recusa se existe comentário/apontamento restrito que a pessoa
  não enxerga; filhos pela JQL E pelo `fields.subtasks`. (4) Convite por pessoa e dia em pedaços de até 24h, com os
  comentários originais; colega inativo = aviso (as horas dele não terão quem confirme). (5) Links externos (remote
  links) e a prioridade vão junto; componentes, versões e campos personalizados são LISTADOS como "não vão" (`naoVai`).
  Ficou de fora (R154): conferir a permissão de apontar do colega no destino. Testes: `agsem/transferir-servidor-test.mjs`
  (32 casos, Jira falso em memória com conta de serviço) e `transferir-test.mjs` (Playwright, 48 casos).
- **⚠ Meus tickets vencidos × ⏱ Apontar (2026-10-01, a pedido do usuário: "quando eu clico, a informação está
  errada"):** o card da 🏠 Início lê `estado.acoes.venc` (`/api/vencimentos?ate=+30d&incluirSemVenc=1`) e o
  ⏱ Apontar lê `estado.apontar.porData[ate|sv]` — DUAS cópias da mesma base, as duas guardadas pela sessão
  inteira. Regras agora: (1) `invalidaCacheDados()` marca a base da Início como **suja** (`vencSujo`) e
  `renderAcoes` relê em segundo plano quando suja, com mais de 5 min (`AX_VENC_TTL_MS`) ou de outro dia
  (`vencDia`) — **sem apagar** os números da tela; (2) a lista do Apontar carrega `lidoEm` (dia SP da leitura)
  e é descartada na virada do dia; (3) os cards "meus" da Início abrem o Apontar por `hxAbreApontar(fil, o)`:
  só os meus, projeto/categoria/busca zerados, `ate` = hoje (um `ate` antigo da URL escondia vencidos),
  `semVenc` conforme o card e `porData={}` (relê); (4) os **KPIs do Apontar seguem o "Só os meus"** (`base`
  em `renderApontar`), com rótulo "(meus)". Contador novo na Início = contar sobre `tks` e abrir pelo helper.
- **🧾 Preciso criar meus tickets (2026-10-03, a pedido do usuário: "parecida com a criação de ticket: a pessoa
  lista o que fez por projeto, você acha o ticket ou oferece criar, pergunta quanto tempo gastou em cada um,
  mostra o status e pergunta se quer atualizar"):** vista `meustickets` (`public/js/14b-meus-tickets.js`, aba
  do grupo 📝 Criar ticket, também no ➕ Novo e nos 🚀 atalhos da Início), estado em `estado.meus`. **Cinco
  passos, nada escrito antes do último:** (1) texto livre + dia (rascunho em `localStorage`
  `jirainsight_meus_rasc_v1`); (2) `POST /api/criar {meus:1, texto, dia}` — sub-rota de `api/criar.js`, sem
  função nova — devolve os itens: projeto casado com o catálogo (`magicoProjetos`), atividade, título
  sugerido, horas/"terminou" lidos do texto, tipo padrão (`magicoTipoTarefa`) e os **candidatos entre os
  abertos do projeto** (`meusAbertos`, mesma consulta e MESMO cache `reuvinc:abertos:P` do `?abertos=`),
  pontuados por palavras (`meusPontua`: fração das palavras da atividade achadas no resumo, raiz de 5–6 letras;
  ≥0,6 pré-seleciona "é este", ≥0,34 aparece). A IA (`chamaClaude`, schema de lista) separa os itens quando há
  `ANTHROPIC_API_KEY`; sem chave ou com erro, `meusParseSimples` (linha = projeto, `;`/`|` = itens) assume e a
  resposta avisa (`ia:false`). O front repete a pontuação (`mtPontua`) só para **rebuscar ao trocar o projeto**
  (`?abertos=`) e aceita **qualquer chave** pela ficha (`?detalhe=`). (3) horas por item (`parseTempo`, chips,
  dia e comentário próprios; total × meta). (4) status: existentes = `{listar:true}` por ticket, lazy;
  "terminou" pré-seleciona a transição `done`; novos = categoria desejada, resolvida depois da criação.
  (5) `mtExecuta`: item a item — criar (lote de 1, `venc`=dia), apontar (`/api/apontar` com `inicio`=dia do
  item), mover status — com o resultado por passo em `it.exec`; **"↻ Tentar de novo" só refaz o que falhou**
  (o criado não é recriado: `ex.key` fica). Depois: `logAcao(…, false)` por ação + `salvaCfg()` uma vez,
  `invalidaCacheDados()`, `estado.apontar.porData={}`/`recentes=null`. Listeners `data-mt-*`/`#mt-*` no fim do
  14b; o tema não redesenha a tela (lista do 30-eventos-boot). Guia `GUIAS.meustickets` e passo no tour.
  **Regras da revisão (mesmo dia):** todo redesenho DEPOIS de um await passa por `mtRender()` (só desenha se a
  vista ainda é `meustickets` — a pessoa pode ter navegado); trocar o ticket de um item passa por
  `mtTrocaTicket` (a transição escolhida era do ticket anterior); a validade das horas é UMA função
  (`mtTempoRuim`/`mtTemposInvalidos`, usada no render, no digitar, nos chips e no avançar); chave citada no
  relato que não está entre os abertos é conferida pela ficha antes de oferecer "criar"; o ticket novo nasce
  **atribuído a quem cria** (`respId`, sem responsável só se o projeto recusar); o rascunho sai quando a
  execução começa; depois de uma execução com falha dá para voltar só às Horas e aos Status (3 e 4) e
  confirmar de novo; "Concluído" num fluxo que exige "Em andamento" passa por ele (um salto). No servidor a
  sub-rota **confere a identidade no Jira** (`/myself`, hash do par por 10 min) antes da IA e da leitura dos
  abertos — o catálogo vem de um cache comum e não prova nada; horário ("às 14h", "14:30") não vira horas
  e "das 9h às 11h" vira 2h (`meusFaixaSeg`).
- **📑 ID e ⧉ duplicar contratos · 🏠 vencidos → Lista · 🐞 Reportar (2026-10-03, a pedido do usuário: "permita
  duplicar os contratos, coloque um id para cada contrato; nos vencidos por projeto quero apontar/atualizar o status
  individualmente; um workflow fácil para bugs e melhorias que vira GitHub e Jira"):** (1) cada contrato tem um **ID
  visível** — `c.cod` = `CT-001` (🏢 Clientes, contador `cfg.ctSeq`) / `PC-001` (🤝 Parceiros, `cfg.pcSeq`) — que nasce
  no cadastro e **nunca muda**; o contador só sobe. Antigos ganham o ID por **migração determinística** no render
  (`ctCodigosPlano`: data de criação → ordem da lista; código repetido fica com o primeiro da lista) — duas sessões
  chegam aos mesmos IDs, então a mescla não briga. Leitor = `ctCod`/`ctCodCli`/`pcCod` (não grava); quem grava é
  `ctGaranteCodigos`/`ctProxCod` + `salvaCfg()`. **⧉ duplicar** (`ctCopia`/`pcCopia`) abre o formulário NOVO
  preenchido e só grava no "Adicionar/Cadastrar" — sem `portalToken`, e na parceria sem `odoo`, extras, `prev`,
  `ajustes`, `rateios`, histórico; ids novos para docs/equipe/trechos; `copiaDe` guarda a origem. (2) O
  ⏰ vencidos por projeto da Início abre a 🛠 Gestão na **▤ Lista sem nada marcado** (`g.visSo`/`g.visSoDe`: vale só
  para aquele recorte; clicar noutra visualização ou "✕ ver todos" volta a `g.vis`) — cada ticket com ⏱ apontar,
  status ▾, 👤 responsável ▾, 💬, reprogramar, 🔍. (3) **🐞 Reportar** = `public/js/25b-reportar.js` + sub-rota
  `b.reportar` do `api/criar.js` (depois da identidade; `meusConfereIdentidade`): Jira (`JIRA_FEEDBACK_PROJECT`, padrão
  JI; Bug → "Bug"; Melhoria → "Melhoria"/"Improvement" se existir, senão **História + label `melhoria`** — o JI não
  tem o tipo Melhoria) **→** GitHub (`ghCriaIssue`, com o link do ticket) **→** remotelink do issue no ticket. Token
  da pessoa primeiro; 401/403 → conta de serviço (aviso + nome na descrição); erro de dado não insiste. Falha de um
  lado não derruba o outro. Contexto técnico só com a caixa marcada, montado por UMA função (`repContexto`) para a
  prévia e o envio; o servidor corta parâmetro com cara de segredo na URL e limita os erros a 8. Prefixo `rep` no
  front (o `rp` é da Rentabilidade). O formulário antigo da Ajuda saiu; `{feedback:true}` segue aceito para abas
  antigas. Testes: `meus-tmp/reportar-test.mjs` (unidade, 25 casos) e `entrega-1003-test.mjs` (Playwright, 45 casos).
- **⏱ Contrato de cliente "Horas abertas" (2026-10-04, a pedido do usuário: "um tipo horas abertas; informar o
  número de horas contratado e depois alocar essas horas para projetos do Jira; hoje nem consigo selecionar esses
  projetos"):** a causa do "não consigo selecionar" era o seletor do 🏢 Clientes filtrar SEMPRE pela categoria AMS.
  Agora a lista segue o tipo (`CT_CATS`: AMS → DAMS/PAMS, horas → DEA/PEA, projeto → DEF/PEF, bolsa → todas de
  cliente; sigla por `relSiglaDe`), com 🔎 busca e "mostrar todos" (ARQ só se já marcado). O formulário guarda
  tipo/marcados/horas em **`estado.admin.form`** (`ctFormEstado`, chave = edição/cópia/novo) — o salvar lê daí, não
  do DOM, então o que a busca esconde não se perde, e trocar o tipo redesenha só a lista (`ctProjAtualiza`). Tipo
  `horas`: `horasContratadas` obrigatório, `c.alocacao={CHAVE:h}` (só >0) com soma ≤ contratado, `c.fim` opcional;
  mudar de tipo apaga `alocacao`/`fim`. Leitores `ctAlocDe`/`ctAlocTotal` não criam objeto. Consumo desde o início
  (`ctConsumoHoras`/`ctGaranteReal`, cache `estado.ctReal` por intervalo, teto 12 meses; sem início cai para o
  período do topo e a tela diz). **`ctHorasDoProjeto(c,k)` é a régua única** das horas vendidas de um projeto
  (Controladoria `ctResultado`, Métricas vendidas/valor vendido, 💹 Rentabilidade e a ficha do projeto ao criar o
  plano). Aba 💰 ganhou a seção ⏱ Horas abertas (`[data-ct-horas]`) e a lista genérica deixou de incluir `horas`.
  Teste: `horas-abertas-test.mjs` (Playwright, 30 casos).
- **🗂 Parcerias por projeto · 📥 apuração pela planilha · 💰 fluxo de caixa (2026-10-05, a pedido do usuário: "tenho
  um contrato e eles me alocam em um projeto; faturo por hora independente se gastei horas lá ou não — posso repassar
  tarefas ou usar um acelerador; quero projetar as alocações por projeto e ter previsibilidade do caixa; integrar com o
  Odoo para o fechamento e a nota serem consistentes; Axia é AMS"):** o diagnóstico na produção foi que os 3 contratos
  de parceria não tinham equipe/alocação nem vínculo com projeto, e a alocação vivia espalhada (contrato × planos da
  💹 Rentabilidade, com o Hi-Mix a 8h/dia desde janeiro quando a planilha dizia ~4h/dia desde junho). Agora o contrato
  tem **frentes** (`c.frentes`, 16b): ⏱ `aloc` (paga as horas ALOCADAS — trechos com `regra.fr`) ou 🛠️ `ams` (paga as
  atendidas — `estMes`, janela `pcFrJanelaAms`). A **apuração** `c.apur[ym][fid]={h,fonte,parcial,ate}` manda no
  período; **`pcFrPeriodo` é a regra única** (apurado > parcial + previsto do resto > previsto) e `pcPlanejamento`
  despacha para `pcPlanejamentoFrentes` quando há frentes — contrato sem frentes segue **idêntico** (`pcPlanejamentoSimples`,
  `c.prev`). O **📥 importador** (16e) lê o `.xlsx` sem dependência (zip à mão + `DecompressionStream`), CSV e o colado do
  Excel; agrupa por projeto do parceiro (PTC), soma por **período de faturamento** do contrato (`pcYmDaData`), período
  não coberto até o fim = **parcial**, período fechado sem linha = 0h; nada grava antes do "Aplicar". O modal ✔ apurar
  **só grava o campo que a pessoa mexeu** (`data-ini`) — o parcial da planilha não pode virar fechado ao salvar sem
  mexer (bug achado no teste). **Odoo (16c):** item por projeto e período (`p:AAAA-MM:frente`), MAS período que a ordem
  já tem no formato antigo (`p:AAAA-MM`) continua item único (`pcOdooLegado`) — trocar o formato apagaria/zeraria o
  antigo e refaturaria o já faturado. **`c.odooDesde`**: vazio + sem ordem = período atual (o que veio antes saiu à mão;
  é gravado ao criar a ordem); vazio + com ordem = todos (como antes); `'todos'` explícito; itens de antes do corte não
  vão em `itens` (o servidor os trata como feitos à mão e não mexe). Próximas notas só respeitam o corte **escolhido**.
  **💰 Fluxo de caixa** (16f, só leitura): vencimento da fatura no Odoo ou nota + `pcPrazo(c)` (padrão 30), retenção
  `c.retPct`. **💹 Rentabilidade:** plano cujo projeto é `f.proj` de uma frente avisa a divergência e ↻ traz as horas
  (`pcFrHorasPorMes` → `p.vendMan`, `p.vendFonte`) — de propósito sem mudar `rpVendPorMes` (o servidor tem gate de
  paridade). Servidor: só `ODOO_MAX_LINHAS=300` (era 80 — com frentes estoura e o corte silencioso apagaria itens).
  **Regras da revisão de código (mesmo dia, 12 achados corrigidos):** hora extra (`x:`) vai SEMPRE em `itens`, mesmo
  antes do corte (`pcNoOdooChave`) — apagada, a sincronização precisa vê-la para tirar da ordem; período com item já
  faturado **nunca ganha item novo** (`pcOdooFatYms` + `pcOdooChavesExistentes`: trocar/tirar projeto mudaria a chave e a
  nota sairia de novo); o item antigo `p:AAAA-MM` respeita o `c.prev` de quando foi criado; AMS grava `f.de` ao nascer,
  ao virar AMS e ao ganhar estimativa (`pcInicioPeriodoAtual`) — sem isso a janela andava com o calendário e cada mês
  fechado sumia; a apuração parcial tem **`desde` e `ate`** (`pcImpCobre`: só conta como parcial se fica DIA ÚTIL de
  fora; recortado pela validade) e `pcFrPeriodo` soma o previsto das duas pontas (`resto`), que é o que acende o ⚠;
  importações seguidas **somam** (`pcImpMescla`: parcial da planilha + arquivo sem sobreposição = soma; completa +
  arquivo parcial = mantém); o ritmo sugerido é h ÷ dias úteis do trecho (±12% para juntar meses), buraco não é
  preenchido e só é projetado quem chega ao último mês do arquivo; trechos SEM projeto da pessoa no intervalo derivado
  são recortados; "Não aprovado"/"Reprovado" ficam de fora (`pcImpAprovado`); CSV em windows-1252 (`pcImpDecodifica`);
  zerar AMS ausente só vem marcado sem horas já apuradas; o modal não reabre depois de fechado (`pcImpModalAberto`);
  ✔ apurar tem "↺ previsão"; "Trazer" só grava os meses que o contrato cobre. **Cuidado aprendido (de novo):** comentário
  `//` acrescentado no MEIO de uma linha com mais código engole o resto — duas vezes nesta entrega.
  Testes: `parcerias-frentes-test.mjs` (Playwright, 32 casos) e `revisao-fix-test.mjs` (15 casos, um por achado),
  contra `servidor-mini.mjs` (fixtures enxutas — o `servidor-fix.mjs` antigo se perdeu num reinício do ambiente) com a
  planilha **sintética** no formato da Cast (`gera-book.py` → `book13.xlsx` + `book13-esperado.json`); a planilha real
  do usuário fica só no scratchpad, nunca no repositório.
- **📅 Ciclos com início/fim próprios · 📆 previsão diária por projeto e ciclo (2026-10-05, 2ª leva, a pedido do
  usuário: "informar manualmente início e fim de cada ciclo, sem limitar ao mês-calendário; para cada projeto, em cada
  ciclo, as horas previstas de cada dia, distintas do apontamento; vincular a alocação à consultoria; faturamento por
  consultoria, objeto de custo por projeto"):** o modelo do ciclo NÃO mudou — `AAAA-MM` definido pelo fim
  (`c.ajustes[ym].fecha`), início = fim do anterior + 1 —; o 📅 só ganhou a coluna Início: editar o início grava o fim do
  ciclo ANTERIOR (`pcCicloAjusta`, que recusa datas que se cruzam; os ciclos são contíguos) e a lista vai do 1º ciclo do
  contrato a 12 meses à frente (`pcCiclosLista`). A previsão diária mora em **`c.diario[frente][AAAA-MM-DD] = h`** (0 vale;
  leitores `pcDiario`/`pcDiaMan` não criam; `pcDiaSet`/`pcDiaPreenche`/`pcDiaLimpa` gravam + `salvaCfg()` no handler).
  **`pcFrPrevisto` = `pcFrPrevistoAuto` + Σ(digitado − automático do dia)** — continua a única porta da previsão, então
  grade por ciclo, modal ✔ apurar, Odoo, notas, caixa e Rentabilidade seguem sem mudar; `pcPlanejamentoFrentes` amplia o
  intervalo com os dias digitados. A grade `pcDiarioHTML` (dia × projeto, um ciclo por vez, `estado.parcerias.diaYm`)
  atualiza os totais no DOM (`pcDiaAtualiza`) e adia o redesenho (`PC_TAB_EDIT` ganhou `.pc-dia-tab`) — o Tab de um dia
  ao outro não perde nada. A apuração NÃO é tocada pela grade (linha "✔ Apurado" só mostra). `pcCopia` não leva `diario`.
  `projEspinhaDados` acha a consultoria pelo 🗂 projeto (`pcFrenteDoProjeto`) antes do plano e abre a gaveta 🗂;
  `pcSemObjeto` (16c) avisa projeto que iria ao Odoo sem 🎯 objeto próprio. Teste: `ciclos-diario-test.mjs` (31 casos).
- **🧩 AMS por ciclo: apuração por TICKET PRINCIPAL e PDF sem tipos não faturáveis (2026-10-06, a pedido do usuário:
  "consolidar os apontamentos por ticket pai e não abrir por qualquer tipo de task e sub-task; o PDF agrupado por ticket
  pai; excluir do relatório de faturamento os tipos não faturáveis"):** o servidor (`jiraResolveIssues`/`worklogsEnriquecidos`
  em `api/_lib/util.js`) marca a sub-tarefa (`issuetype.subtask` ou `hierarchyLevel −1`) com **`w.pk`** = chave do pai e
  resolve o pai no 2º nível (resumo, tipo + descrição, campos AMS) — o pai entra em `resumos`/`infos` e no mapa novo
  **`chamados = {chave: {t, f, pk}}`** mesmo sem apontamento próprio. **Regra do faturável:** `f = próprio tipo && tipo do
  pai` — sub-tarefa de ticket não faturável é não faturável (senão o tipo não faturável viraria faturável por baixo).
  No front (`16-contratos-ams-receita.js`) **`amsIndice(c, cyc, ym?)` é o ÚNICO agrupador**: grupo = ticket principal
  (`amsPrincipal(w)`), tipo/faturável = do pai (`amsChamadoInfo`), `subs`/`nSub`/`ent[{…, k, sub}]`; `amsPorTipo`,
  `amsChamadosCiclo`, `amsDrillMes`, relatórios e o `pdfApuracaoAMS` (27) leem dele — nada de reagrupar por consumidor.
  O PDF exclui os tipos não faturáveis da tabela e da memória (só o rodapé diz as horas deixadas de fora); a tela mantém
  o indicador faturável × não faturável, MAS os **📊 Relatórios do ciclo** (Causa raiz · Produto · Processo) e o drill
  deles leem `amsChamadosFat` (só grupos faturáveis, `seg` = horas faturáveis — pedido do mesmo dia: "nesses
  indicadores apenas os tickets faturáveis"). Testes: `tempo-pai-test.mjs` (servidor, fetch stubado, 6 casos) e
  `ams-pai-test.mjs` (Playwright, 15 casos; fixture `AMS_WL` no `servidor-mini.mjs`).
- **🎫 Busca de tickets (2026-09-15, a pedido do usuário):** `public/js/12b-busca-tickets.js` — sobreposição
  **projeto → ticket** aberta pela tecla **`/`**, por **Ctrl+J**, pelo botão 🎫 da barra, por **⋯ Mais › 🎫 Buscar
  ticket** (o caminho do celular, onde a barra vira gaveta) e pelas linhas 🎫 da paleta Ctrl+K. O desempenho é o
  desenho: o **projeto** sai da memória (`projNomes`/`projetosUnidos`, recentes no `localStorage`), os tickets são
  **só os ABERTOS de um projeto** (`GET /api/reunioes?abertos=PROJ` — nenhum endpoint novo, a Vercel está no limite
  de 12), digitar **filtra em memória** (`tkbFiltra`/`tkbOrdena`, teto `TKB_MAX`) e a lista fica **3 min** em
  `_tkbCache` (o `↻` relê com `nocache=1`). Fora dos abertos: a **chave** (`RDF-123`) abre qualquer ticket pela
  ficha, o que o período já carregou aparece numa seção à parte e o `🌐 Todos os projetos` só existe quando
  `estado.analytics.dados` já está em memória — **a busca nunca dispara carga pesada por conta própria**. A ficha é
  a de `20-gestao.js` (`abreModalTicket(k, volta)`, com `↩ Voltar à busca`). Atalho novo = conferir antes a lista de
  teclas já usadas (Ctrl+K, `?`, Esc, Ctrl+C em campo de data).
- **📊 Uso do painel (2026-09-20, a pedido do usuário):** `public/js/31-uso.js` + sub-rota `?uso=1` do
  `api/config.js` + tabela `jirainsight_uso` no Supabase. Responde "quem abre qual tela, quantas vezes e por
  quanto tempo" — o que o Vercel Web Analytics (anônimo, e num app de uma página só registra "abriram o app")
  e o 🗒 Histórico de ações (só o que escreve) não respondiam. **Coleta:** `usoTela(v)` (gancho de uma linha no
  `render()`) conta a abertura; `usoPulso()` conta 15s de cada vez **só com a aba visível e com interação nos
  últimos 5 min** — é isso que separa tempo de uso de aba esquecida aberta. O acumulado fica no `localStorage`
  por `dia|tela` e sobe em LOTES (`sendBeacon` quando a aba some); falha de envio devolve o acumulado.
  **Só id de tela e duração viajam** — nunca conteúdo — e sem identidade nada sobe. **Quem vê:** gestor,
  negócio, diretoria e admin veem o time; os demais veem só o próprio uso (`usoPodeTudo()`). Retenção de 180
  dias, podada na primeira gravação após cada partida a frio da função. Métrica nova = somar em `usoCalc()`;
  nada de gravar evento a evento nem conteúdo.
- **📊 Relatório semanal de sexta + 🧭 Pendências do projeto (2026-09-28, a pedido do usuário):** decisões
  do usuário: orçado = **horas vendidas da Rentabilidade (por projeto, pro rata dos dias úteis) + capacidade
  por pessoa**; destino = **canal de gestores + mensagem direta a cada gerente + tela no app por papel**;
  gerente = **campo no app** (`cfg.projGerentes`, líder do Jira como sugestão); reuniões **pelo Jira** (nada
  de ler agenda). `api/_lib/semanal.js` é a **fonte única** dos indicadores (funções puras; formato v1 da foto
  no topo); `api/_lib/rentab.js` é porte fiel do 17b com **gate de paridade** no `npm run check` (quem mudar a
  regra de um lado é reprovado). A foto vive em `jirainsight_config` id `semanal_<segunda>` (não desce para o
  navegador: o GET só devolve `default`), 104 semanas, seg→dom, `realFechado` anotado na semana seguinte; foto
  no **último dia útil** da semana (sexta feriado → quinta). `?tipo=semanal` **exige `CRON_SECRET`** (503 sem
  ela, mesmo em dry); duas fases no cron de 30 min; estado do Teams ilegível = tique pulado; manual sem dry
  pede `confirmar=1`; DM reenviada só para quem falhou. `?semanal=1` decide o papel **no servidor** e apaga
  `ia` para quem não vê tudo; o POST da config recusa mudança de `papeis`/`gestores`/`projGerentes` por
  não-gestor. Telas `18b` (R28) e `20b` (R29; parâmetro `gproj`, com `proj` aceito por compatibilidade nos
  links do servidor). Sem R$/custo em nada que vai ao Teams.
- **📱 Camada mobile (2026-09-28, a pedido do usuário: "faça todo o aplicativo mais mobile friendly"):**
  `public/css/mobile.css` carrega DEPOIS do `app.css` e só tem regras dentro de `@media (max-width:…)` /
  `(pointer:coarse)` — **o computador não muda um pixel** (prova: `desk-shots` + `png-diff` das 38 telas contra
  a `main`, no MESMO dia, porque a data muda o timesheet). Seções 1–3 = base (guarda `.wrap{overflow-x:clip}`,
  cabeçalho em 2 linhas, campos 16px no toque, flutuantes redondos, tablet 761–880px); depois **um bloco por
  grupo de telas** (`/* ---- 📱 grupo: X ---- */ … /* ---- fim: X ---- */`). Tela nova = regras no bloco do
  grupo, nunca no `app.css`, nunca fora de `@media`. A causa do "app encolhido" no iPhone é UM elemento mais
  largo que a tela (o Safari dá zoom-out em tudo): linha que não cabe quebra, tabela larga rola dentro do
  contêiner (`.scroll-x`), largura fixa vira `max-width:100%`. `scripts/mobile-audit.mjs` (iPhone emulado)
  mede `ofens` (cortado na borda — a guarda não conta; meta 0), toque < 44/32, fonte < 12 e campos < 16;
  `npm run check` reprova regra fora de `@media` de celular e a ordem errada dos `<link>`. Cuidado aprendido:
  comentário CSS com `*/` dentro (ex.: `.mp-*/`) fecha cedo e engole o bloco seguinte em silêncio.
- **🌐 Portal do projeto (2026-09-28, a pedido do usuário):** a área do cliente ganhou o **modo projeto**
  (mesmo `/portal.html`, mesma conta por convite amarrada ao **contrato** — decisão do usuário; várias
  pessoas = várias contas) e o Hub o módulo **🌐 Portal do cliente** (`16d-portal-cliente.js`, `?v=portal`,
  `pproj`/`psec` na URL para não disputar com o filtro global `proj`). **Um único ponto de saída** para o
  cliente: `portalProjetoPayload` em `api/_lib/portal.js` monta por **allowlist** (`ESQUEMA`;
  `assertAllowlist` nos testes) — nada de responsável, horas por pessoa, custo, comentário, e-mail, outro
  cliente; bloco desligado é **zerado no servidor**, não só escondido. Progresso = `api/_lib/cronograma.js`
  (porte de `crLinhas`/`projMarcos`, gate de paridade no `npm run check`; a ficha do projeto e o catálogo —
  agora com `lead` — moram em `api/_lib/projetos.js`, e `api/projetos.js` só importa). Reuniões = **calendário
  do projeto no M365** (`calendarioDoProjeto`: só a caixa/grupo que o gestor configurou e confirmou pela
  prévia; e-mail de pessoa do time é recusado; só campos públicos; a rota da Agenda continua "só a própria
  agenda"). Conteúdo curado em **tabelas próprias** (`jirainsight_portal_projetos`, `_portal_itens`,
  `decisoes.visivel_cliente` — migração em `supabase/migrations/`), nunca em `cfg`. Cache `portal_<KEY>` em
  `jirainsight_config` com `em` conferido a cada pedido (o ↻ vale entre instâncias); falha do banco/Jira →
  502 e nada em cache. Regra "aguardando cliente" do portal é ESTRITA (cita cliente/customer), separada do
  preset da Gestão. Trocar o contrato de um projeto publicado exige confirmação (409). Pré-requisito:
  domínio `portal.dexterityit.com.br` (cerca do host no `vercel.json` + `/api/config`).
- Front-end estático em `public/` (HTML/JS puro, **sem build**). Desde **2026-09-06** o
  `index.html` é só o HTML: o CSS está em `public/css/app.css` e o JS em **36 módulos
  `public/js/NN-nome.js`** carregados em ordem por `<script defer>` (scripts clássicos,
  escopo global compartilhado — o mapa está no README, seção "Os módulos do painel").
  Regra de ouro: código que EXECUTA no carregamento só usa o que já foi declarado em
  arquivos anteriores; `npm run check` confere isso com parser (acorn) e reprova o PR.
  Novo módulo = arquivo + tag no `index.html` na posição certa. Listeners delegados de
  uma tela ficam **no arquivo da tela** (fim do arquivo), não no `30-eventos-boot.js`.
  Código de tela desligada vai para `public/js/_arquivado-*.js` (sem tag; o gate ignora
  o prefixo `_`) — nunca fica carregando à toa.
- Funções serverless em `api/*.js` (Vercel, Node ≥ 18, **limite de 12 arquivos** — sem
  endpoint novo). Leituras usam a conta de serviço (`JIRA_*`, `CLOCKWORK_API_TOKEN`);
  apontamentos/transições/criação usam o token de API da própria pessoa (enviado por
  requisição, nunca persistido).
- Deploy: a branch **`main`** publica na Vercel.

## 📘 Documentação no Notion — MANTER ATUALIZADA

> **Mudança de 2026-09-01 (a pedido do usuário):** a documentação deixou de ser uma
> página única. Agora cada funcionalidade tem o **seu próprio processo** na database
> **🎯 Processos Dexterity**, todos ligados ao sub-processo **TI-14 - Jira Insights**.
> A página TI-14-001 continua existindo como **índice + changelog**.

**Onde as coisas ficam:**

- **Sub-processo (o "guarda-chuva"):** *TI-14 - Jira Insights* — page id
  `388c6937-1e17-8013-820b-eec985c5e773`. Todo processo novo do Jira Insights precisa
  apontar para ele na relação **`Área - Sub-processo`** — é isso que mantém as
  automações e as visões do Notion funcionando.
- **Database dos processos:** 🎯 Processos Dexterity — data source
  `collection://276c6937-1e17-8040-9aae-000b9167b98f`.
- **Índice + changelog:** *TI-14-001 - Overview Jira Insights* — page id
  `388c6937-1e17-8034-b6df-d5ca9efad81c` (seção 0 = mapa dos processos; seção 13 =
  "Log de funcionalidades (changelog)").
- **Processos por funcionalidade** (criados em 2026-09-01):

  | Código | Processo | Page id |
  | --- | --- | --- |
  | TI-14-007 | Apontamento de horas no dia a dia | `3cec6937-1e17-812a-9b5d-caaef598991f` |
  | TI-14-008 | Criação de tickets (lote, linguagem natural e voz) | `3cec6937-1e17-811f-9dd9-e30a4e934aa1` |
  | TI-14-009 | Gestão de tickets e alertas | `3cec6937-1e17-8186-8349-cfad2187057b` |
  | TI-14-010 | Reuniões: agenda, ticket e reclassificação | `3cec6937-1e17-817a-88bb-fad806d18f5b` |
  | TI-14-011 | Planejamento semanal e aprovação | `3cec6937-1e17-816d-80e2-f2235d8f9adf` |
  | TI-14-012 | Análises, ranking e relatórios | `3cec6937-1e17-81a5-9d80-de7a2753cb58` |
  | TI-14-013 | Controladoria, receita e contratos AMS | `3cec6937-1e17-8134-b5b7-daf251c76f2b` |
  | TI-14-014 | Prioridades do time e reunião semanal | `3cec6937-1e17-8177-91e9-e4b15f3ff382` |
  | TI-14-015 | Configuração, metas e acesso ao painel | `3cec6937-1e17-81db-be23-c17954ca61f0` |
  | TI-14-016 | Integrações e plataforma | `3cec6937-1e17-81b6-a91a-eec25805e2e4` |
  | TI-14-017 | Ajuda, guias interativos e adoção | `3cec6937-1e17-8156-a485-ddba12cb794e` |
  | TI-14-018 | Bot do Teams para criar tickets com IA | `3cec6937-1e17-8166-afe4-f469355e2076` |
  | TI-14-019 | Navegação por perfil e mapa do app (Dexterity Hub) | `3dbc6937-1e17-81eb-ad03-d854f090cdab` |
  | TI-14-020 | Uso do Dexterity Hub no celular e tablet (camada mobile) | `3e9c6937-1e17-816e-9261-cc3b14966ecd` |
  | TI-14-021 | Relatório semanal de sexta e pendências do projeto (gerente) | `3e9c6937-1e17-817a-a612-f3ecaae95503` |
  | TI-14-022 | Portal do projeto para o cliente (modo projeto + módulo 🌐 Portal do cliente) | `3e9c6937-1e17-81f2-b00e-d788e99c5d33` |
  | TI-14-023 | Ligações (Call tracking): detector do Mac e apontamento das chamadas | `3f4c6937-1e17-81f5-8bb7-c31280615ed8` |
  | TI-14-024 | Roadmap da solução: base no Notion sincronizada com o app (base `🗂 Roadmap da solução`, data source `bf1de04e-1690-4571-a225-c8bb79e0da03`, URL `https://app.notion.com/p/f6bcbeaa327c4fcc91b4852769cd257b`) | `400c6937-1e17-8140-9d5e-c68fa5bbd9f1` |
  | TI-14-025 | Planejamento do dia (📆 Hoje): lista do dia, linha do tempo, rituais e cronômetro | `400c6937-1e17-8173-880b-f0a83cc4bae5` |

  (O 📅 Marcos e Cronograma — inclusive a edição na própria tela, 2026-10-21 — mora na seção 6 do TI-14-012.)

  (001–006 já existiam: Overview, Criar ticket onde é necessário, Extensão, integrações
  com SharePoint, Odoo e Finder.)

**Acordo de trabalho — a cada entrega feita a pedido do usuário:**

1. Atualizar o **processo correspondente** (a descrição detalhada mora nele). Se a
   entrega criar uma funcionalidade que não cabe em nenhum, **criar um processo novo**
   na database, com `Área - Sub-processo` = TI-14, `Ferramenta` =
   `https://app.notion.com/357c69371e1780e8bfddeb7dcec31946`, `Código do Processo` =
   o próximo número livre, `Document Type` = Procedimento, `Dono` = Diego
   (`user://4d23e88e-07dd-490a-8bae-272c45603d42`) — e acrescentá-lo ao mapa da
   seção 0 do TI-14-001 **e** a esta tabela.
2. Acrescentar a linha no **changelog** (seção 13 do TI-14-001) com a **data
   (AAAA-MM-DD)** e um resumo curto.
3. **Usar imagens sempre que possível** (pedido do usuário): os processos usam
   **diagramas Mermaid** (bloco ```` ```mermaid ````, que o Notion renderiza nativo).
   Screenshots do app: gerar com Playwright e anexar via
   `mcp__Notion__notion-create-attachment`; imagens locais grandes **não** passam por
   este ambiente (o proxy bloqueia `api.notion.com` e a saída do shell trunca base64),
   então o caminho prático é o usuário arrastar o PNG na página ou o app ganhar uma URL
   pública que o Notion consiga baixar.

Ferramentas MCP: `mcp__Notion__notion-fetch` para ler, `mcp__Notion__notion-update-page`
para editar, `mcp__Notion__notion-create-pages` para criar processos. Carregar os
schemas via `ToolSearch` quando necessário.

## ⏱ Apontamento no Jira — projeto JI (atualizado em 2026-08-11)

> **Mudança de 2026-08-11 (a pedido do usuário):** as entregas da ferramenta passaram
> do TAD-829 para o projeto **`JI` (IMI | Jira Insights)**, organizado por ÉPICOS:
> JI-7 🎯 Prioridades do time · JI-8 📋 Meu Planejamento · JI-9 ⏱ Apontar & Timesheet ·
> JI-10 🏆 Ranking & Metas · JI-11 🎨 Identidade visual & Experiência ·
> JI-12 📊 Análises & Relatórios · JI-13 🔌 Integrações & Plataforma.
> O histórico anterior segue no TAD-829 apenas como arquivo: os tickets foram
> espelhados no JI com link "relates to" e, em **2026-08-11 (a pedido do usuário)**,
> os **29 worklogs (32,02h) foram COPIADOS para os espelhos JI** (JI-14..JI-46) com a
> data original e o autor original citado no comentário ("Transferido do TAD-xxx…").
> **NÃO recopiar essas horas** — a transferência está completa; as horas do TAD-829
> são duplicatas históricas (a API não move nem apaga worklogs; limpeza só pela UI).

A cada **entrega/commit** desta ferramenta:

1. **Criar uma TAREFA no projeto `JI`** (tipo "Tarefa" — id `11112`; em 2026-08-28 o
   conector passou a aceitar **só o nome `Tarefa`** em `issueTypeName` e a rejeitar o
   id, então tente o nome primeiro e caia para o id se falhar) **sob o épico
   correspondente** (campo
   `parent: {key: 'JI-x'}`), detalhando o que foi feito, atribuída ao usuário (Diego,
   accountId `712020:3a98a142-a5ce-443c-b3f2-32cd080d2583`). Transições do fluxo JI:
   "Fazendo" id 21 · "Feito" id 41 (aceitas no próprio create via `transition`).
2. **SEMPRE perguntar ao usuário quantas horas apontar** (nunca presumir) e registrar
   o worklog nessa tarefa via MCP do Atlassian (`addWorklogToJiraIssue`) ou, se o
   conector pedir aprovação indisponível, via Zapier
   (`jira_software_cloud_add_work_log_to_issue`).
3. **🖐 Passo manual = ticket `[Manual step]`** (acordo de 2026-10-04, a pedido do usuário — vale para
   **qualquer projeto/repositório**, não só este): *"toda a tarefa que eu preciso fazer algo manualmente,
   crie um ticket no mesmo projeto em que você criou o ticket do trabalho, começando com [Manual step]"*.
   Sempre que uma entrega deixar algo que **só o usuário pode fazer** (configurar algo no Jira/Vercel/
   Supabase/Odoo/M365/DNS, aprovar no conector, cadastrar dados reais no app, testar com credencial dele…):
   - **um ticket por passo**, no **mesmo projeto Jira e sob o mesmo épico** do ticket do trabalho (aqui: `JI`);
   - resumo começando **exatamente** com `[Manual step] ` + o que fazer (ex.: `[Manual step] Criar o tipo
     "Melhoria" no projeto JI`); tipo "Tarefa", atribuído ao usuário, **sem transição** (fica aberto até ele
     concluir — nunca "Feito");
   - descrição: por que é necessário, o **passo a passo** (onde clicar), como saber que deu certo e o que o app
     faz enquanto o passo não é feito; link **"relates to"** com o ticket do trabalho;
   - citar as chaves dos tickets `[Manual step]` na mensagem final ao usuário e no corpo do PR;
   - antes de criar, **conferir se o passo ainda está pendente** (ex.: a variável já existe na Vercel? o tipo já
     existe no Jira?) — passo que já está feito não vira ticket.

> As escritas no Jira podem exigir aprovação do conector no claude.ai; se falhar com
> "requires approval", avisar o usuário para aprovar e repetir — não pular a etapa.

## 📣 Aviso no Teams — canal "Avisos Gerais" (acordo de 2026-07-28)

> **AUTOMÁTICO desde 2026-09-27 (a pedido do usuário):** não é mais preciso montar o
> `curl` à mão. `.github/workflows/novidades-teams.yml` dispara a cada push na `main` que
> mexa em `public/js/05-novidades-roadmap.js`, e `scripts/aviso-novidades.mjs` compara as
> NOVIDADES com as do **commit anterior** (`git show HEAD~1:…`) e publica **só o que
> entrou** — sem estado externo. `NOV_VER` igual = sai em silêncio. Então **o aviso é
> consequência de atualizar as Novidades**: manter o array em dia (acordo abaixo) já
> cumpre este acordo. Disparo manual na aba Actions (padrão `dry=1`; o campo `base` aceita
> um commit para reenviar uma leva antiga). O script trata `{enviado:false}` como ERRO,
> para um webhook desconfigurado deixar o workflow vermelho em vez de sumir calado.

A cada **melhoria publicada** (merge na main), **publicar um aviso no canal do Teams
"Avisos Gerais"** marcando todos:

- Canal: `Avisos Gerais` — channelId `19:a5797f7659e142e5b348c5e2755f272e@thread.tacv2`,
  groupId `16c14e6a-955a-49df-a36e-7b35a0e29098` (tenant `0ef8b5b1-703e-4c1e-aa6e-90f31baa9eca`).
- Mecanismo: `POST https://jirainsight.vercel.app/api/teams` com corpo
  `{"aviso":{"titulo":"…","linhas":["melhoria 1","melhoria 2"],"link":"https://jirainsight.vercel.app"}}`
  (se `CRON_SECRET` estiver definida na Vercel, enviar `Authorization: Bearer <segredo>`).
  O endpoint monta um Adaptive Card e **menciona todos os usuários ativos do Jira**
  (webhook não expõe membros do canal; a equipe ativa do Jira é o mesmo público).
- Requisito de configuração (uma vez): criar um **fluxo/webhook de entrada** no canal
  Avisos Gerais (⋯ do canal → Fluxos de trabalho → "Publicar em um canal quando uma
  solicitação de webhook for recebida") e definir `TEAMS_AVISOS_WEBHOOK_URL` na Vercel.
- `?dry=1` visualiza o cartão sem enviar.

## 🧭 Guias interativos e tour — MANTER ATUALIZADOS (acordo de 2026-10-02, a pedido do usuário)

> Pedido literal: *"toda modificação que você faça, seja atualizado as etapas; garanta que todas as
> telas atuais tenham o guia pronto"*. Os guias moram em `public/js/25-ajuda-guias.js`: **`GUIAS`**
> (🧭 guia por tela, passos `{s|c,ti,tx,quando}`), **`TOUR_TELAS`** (🗺 tour completo, um passo `vai`
> por tela) e **`TOUR`** (▶ tour rápido da barra), mais a lista "TODAS as telas" da ❓ Ajuda em
> `abreAjuda`. **`GUIAS_REV`** é a data da última revisão.

A cada **entrega** (mesmo correção pequena):

1. **Reler o 🧭 guia (`GUIAS`) de cada tela que a entrega mexeu**: passo novo para o que entrou
   (seletor `s` real do app ou `c` = título do cartão; sem alvo na tela agora → `quando`), texto novo
   para o que mudou, passo fora para o que saiu. Tela nova = entrada em `GUIAS` (≥ 3 passos) **+**
   passo em `TOUR_TELAS` (na ordem do menu) **+** linha na lista da ❓ Ajuda (`data-aj-goto`/`data-aj-guia`).
2. **Reler o passo da tela em `TOUR_TELAS`** e, se a barra/áreas/abas mudaram, o `TOUR`.
3. **Carimbar `const GUIAS_REV='AAAA-MM-DD'`** com a data da novidade — mesmo que nada mude, a data
   confirma que foi relido.

**Verificado por máquina (`scripts/check-guias.mjs`, em `npm run check` e na CI):** reprova tela sem
guia, sem passo no tour completo ou sem linha na Ajuda; guia de tela que não existe mais; passo com
seletor (`#id`, `.classe`, `[data-x]`) que não existe no HTML/JS; e `GUIAS_REV` atrás da última
`NOVIDADES`. Para ver os guias rodando de verdade (passos ancorados × "livres", erros de JS), o
Playwright `guias-walk-test.mjs` (scratchpad, contra `servidor-fix.mjs`) percorre todos os guias, o
tour completo e o tour rápido — rodar antes de entregar mudança de tela.

## ✨ Novidades do app — MANTER ATUALIZADO (acordo de 2026-07-19)

A cada **entrega**, além do Notion, atualizar as **Novidades dentro do app**
(`public/js/05-novidades-roadmap.js` — desde 2026-09-06 as Novidades e o Roadmap moram
nesse arquivo pequeno, não mais no `index.html`):

1. Acrescentar a(s) entrada(s) no topo do array `const NOVIDADES` (formato
   `['AAAA-MM-DD','texto com <b>destaques</b>']`, tom voltado ao usuário).
2. Subir a `const NOV_VER` (ex.: `'2026-07-19.1'`) — é o que reacende o pontinho
   vermelho em "⋯ Mais → ✨ Novidades" e o destaque do card da tela inicial.

O card **✨ Novidades** na tela inicial (⚡ Ações de hoje) mostra as 6 mais recentes
automaticamente a partir do array.

## 🗺️ Roadmap — REVISAR EM TODO COMMIT (acordo de 2026-08-31; desde 2026-10-03 a cada commit, a pedido do usuário)

> Pedido literal de 2026-10-03: *"de agora em diante sempre atualize o roadmap quando for fazer um
> commit"* — veio junto com a revisão completa da lista (que estava desatualizada: itens entregues
> continuavam lá). Não é "por entrega" nem "quando lembrar": **todo commit que mexe no app revisa o
> roadmap**, inclusive o commit de correção e o de revisão de código.

O **🗺️ Roadmap** (`const ROADMAP`, vista `roadmap`) mora em `public/js/05-novidades-roadmap.js`.
A cada commit:

1. **Tirar** o que o commit concluiu (a entrega passa a aparecer sozinha em
   "✅ Entregas recentes", que lê o array `NOVIDADES`) — e conferir se algum item já
   estava entregue e ficou para trás.
2. **Mover** o que mudou de estágio entre `fazendo` / `planejado` / `avaliacao`, e
   **reescrever** a descrição do que foi entregue em parte (dizer o que já existe e o que falta).
3. **Acrescentar** os pedidos novos do usuário e os desdobramentos naturais do que
   acabou de ser feito (o que ficou de fora do escopo, a evolução óbvia).
4. **Carimbar** `const ROADMAP_REV='AAAA-MM-DD'` com a data do dia — e, se já foi
   carimbado hoje, com o sufixo da revisão do dia (`'AAAA-MM-DD.2'`, `.3`…). Mesmo que
   nada mais mude, o carimbo é a confirmação de que a lista foi relida.

**Isso é verificado por máquina, não por memória** — `npm run check` (e a CI em todo PR e
push na main, `.github/workflows/check.yml`, com `fetch-depth: 0`):

- **`scripts/check-roadmap-commits.mjs`** confere **commit a commit** do intervalo (o PR na
  CI; a branch × `origin/main` na máquina): commit que mexe em qualquer arquivo que não seja
  Markdown e **não muda o array `ROADMAP` nem o `ROADMAP_REV`** é reprovado, com o hash e a
  mensagem do commit. Na máquina, também **avisa antes do commit** quando há mudança no app
  sem revisão do roadmap. Mexer só nas `NOVIDADES` não conta. Para consertar uma branch
  reprovada: `git commit --amend`/rebase (um commit novo não conserta os anteriores).
- **`scripts/check-entrega.mjs`** reprova quando `ROADMAP_REV` ficou **para trás** da última
  entrada de `NOVIDADES` (pode passar dela — revisão sem entrega nova — mas não ficar atrás
  nem ir para o futuro), quando `NOV_VER` não acompanha a última novidade, quando `NOVIDADES`
  está fora de ordem ou malformada, e quando algum item do roadmap tem estágio inválido,
  título/descrição vazios ou está repetido.

Na tela, o card do Roadmap mostra **"🔄 Lista revisada em DD/MM/AAAA"** com a contagem
de itens — quem lê sabe se está olhando algo atual.

## 🗂 Roadmap no Notion — MANTER SINCRONIZADO (acordo de 2026-10-21, a pedido do usuário)

> Pedido literal: *"crie uma página vinculada a essa igual às demais do Notion; nessa página crie uma base
> de dados do Notion com o Roadmap, com mais campos — categoria da melhoria, esforço em tokens estimado,
> tamanho, vínculo em pré-requisitos e outras dimensões úteis para roadmap de solução — e, além de manter o
> roadmap da solução atualizado, sempre atualize essa nova base do Notion."*

- **Onde:** processo **TI-14-024** (`400c6937-1e17-8140-9d5e-c68fa5bbd9f1`) → base **🗂 Roadmap da solução**
  (data source `bf1de04e-1690-4571-a225-c8bb79e0da03`). Campos: Nome · ID no app · Estágio · Onda · Categoria ·
  Área · Telas · Tamanho · Esforço (M tokens) · Horas estimadas · Impacto · Prioridade (fórmula Impacto × Tamanho)
  · Valor para · Origem · Referência de mercado · Dependência externa · Decisão pendente · Pré-requisitos /
  Desbloqueia (relação consigo mesma) · Entrou em · Entregue em · Saiu do app em · Última sincronização · Ordem no
  app · Ticket Jira · PR · Descrição.
- **Chave:** `id:'R###'` em cada item do `ROADMAP` (05). Item novo = **próximo número livre**; o id **nunca muda nem
  é reaproveitado**, mesmo que o título seja reescrito. `scripts/check-entrega.mjs` reprova id ausente ou repetido.
- **Quem manda em quê:** o **app** é a fonte de Nome, Estágio, Descrição e Ordem no app; o **Notion** é a fonte de
  todas as dimensões de planejamento — `scripts/roadmap-notion.mjs` grava só os campos do app (+ Última
  sincronização / Saiu do app em) e nunca toca nas outras. Régua de tamanho: P ≈ 1 dia (1,5 M tokens · 2 h) · M ≈
  2–4 dias (4 M · 4 h) · G ≈ 1–2 semanas (8 M · 8 h) · GG ≈ mais de 2 semanas ou peça fora do painel (15 M · 12 h).
- **A cada commit que mexe no `ROADMAP`** (junto com a revisão do roadmap acima), refletir na base pelo MCP do
  Notion (`mcp__Notion__notion-create-pages` com `data_source_id` / `notion-update-page` com `update_properties`):
  item novo → linha nova **já classificada** (categoria, área, telas, tamanho, esforço, horas, impacto, valor para,
  origem, Entrou em, pré-requisitos, decisão/dependência); item reescrito → Nome/Descrição/Estágio (e Tamanho/Impacto
  se mudaram); item **entregue** (saiu do array) → `Estágio = Entregue`, `Entregue em`, `Ticket Jira`, `PR` — nunca
  apagar a linha. Conferir com `notion-query-data-sources` (SQL: contagem e ids repetidos) quando mexer em vários.
- **Rede de segurança:** `.github/workflows/roadmap-notion.yml` roda o script a cada push na main que mexa no 05
  (upsert por id; o que saiu do array e não está "Entregue" vira "Fora do roadmap"). Precisa dos secrets
  `NOTION_TOKEN` (integração interna do Notion com acesso à base — ticket [Manual step]) e `NOTION_ROADMAP_DB`
  (`f6bcbeaa327c4fcc91b4852769cd257b`); sem eles o job só avisa. O `api.notion.com` é bloqueado pelo proxy deste
  ambiente: o script é testado contra um Notion falso (`roadmap-notion-test.mjs` no scratchpad; o servidor falso vive
  no mesmo processo, por isso o script roda com `execFile` assíncrono — `execFileSync` bloqueia o laço e o filho
  nunca recebe resposta).
- **Para o time:** a tela 🗺️ Roadmap do app mostra o id de cada item e linka a base (`[data-rm-notion]`); mudar o
  estágio de um item é mudança no app (pedir na entrega ou pelo 🐞 Reportar), não no Notion.
