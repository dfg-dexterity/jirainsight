# 📈 Dexterity Hub — análise do app, comparação com o mercado e plano de melhorias

**Data:** 2026-10-20 · **Pedido:** *"verifique meu aplicativo como um todo, analise outras ferramentas de mercado semelhantes e sugira como podemos melhorar — funcionalidades, usabilidade e facilidade para a pessoa organizar seu trabalho; crie itens no roadmap com o resultado."*

Os itens que saíram desta análise estão no 🗺️ Roadmap do próprio app (`public/js/05-novidades-roadmap.js`, revisão `2026-10-20.4`): **27 itens novos e 4 reescritos**, em três ondas. Este documento é a memória de como se chegou a eles.

---

## 1. Resumo executivo

**O que o app já é.** O Dexterity Hub cobre o ciclo inteiro de uma consultoria que vive de horas: 44 telas em 4 áreas, da ⏱ hora apontada ao 🧾 Odoo, passando por planejamento semanal com aprovação, reuniões do Outlook que viram ticket, ligações do Mac que viram apontamento, relato em linguagem natural que vira tickets, portal do cliente, relatório de sexta no Teams e guias interativos em todas as telas. Comparado com 36 ferramentas de mercado, há coisas que **quase ninguém tem**: reunião → ticket com convite de apontamento para os presentes, detector de ligações, trava do planejamento ao apontar, apuração de AMS por ticket pai, contratos de parceria ligados ao Odoo e um roadmap vivo dentro do app.

**Onde dói hoje (para a pessoa).**

1. **Apontar ainda é digitar de memória.** Não há cronômetro, não dá para editar nem apagar um apontamento pelo app, não há "desfazer", e ninguém avisa a pessoa no fim do dia que faltam horas. Os 🕑 recentes, o caso mais comum, ficam recolhidos no fim da página.
2. **O planejamento não conversa com os tickets nem com o Apontar.** O item do plano é "projeto + texto + horas"; não vira lista do dia, não pré-preenche worklog, e o comparativo não diz qual ticket ficou de fora.
3. **"O que é meu" está em seis lugares.** Início, Apontar (que por padrão mostra só o que vence até hoje), Gestão, Inbox, Agenda e Meu Planejamento — nenhum responde "o que é meu e em que ordem ataco hoje". A Início tem 12 cards de página (mais de 30 blocos contando os mini-cards) e 5.800 px no computador (8.800 px no celular), e quase nenhum card age no lugar: fora o 🎫 Criar ticket rápido e a ficha 🔍, tudo é "Abrir →".
4. **No celular nada transborda nas 15 telas medidas, mas cerca de 90% dos alvos de toque estão abaixo de 44 px** (411 de 458 no total; 111 de 114 no Apontar, 87 de 90 na Gestão).
5. **Plataforma:** 2,5 MB de JavaScript sem build em 45 módulos carregados em toda abertura; 13 leituras da API na abertura da Início (18 requisições com identidade), com leituras repetidas; a config compartilhada inteira (valores de contrato, custo/h) desce para o navegador de todo o time; 12 pontos de código gravam worklog com validações e feedbacks diferentes.

**O que o mercado faz e nós não.** Timer com "continuar o último" (Toggl, Clockify, Everhour), lembrete de fim de dia com meta que respeita feriado e folga (Clockify, Harvest, Fillchecker), rascunho do dia em cartões para aceitar de uma vez (Tempo, Timely), visão "Hoje" unificada com agenda + plano + apontado (Tempo My Work, Akiflow, Sunsama), fechamento semanal do timesheet com aprovação e trava (Clockwork Pro, Tempo, Harvest), variância planejado × real com horas assumidas e heatmap de capacidade (Runn, Float, ActivityTimeline), digest pessoal de manhã (Rize, DailyBot) e lista de trabalho única "para você" (Jira For you, Asana My Tasks, ClickUp Me Mode).

**O plano.** Três ondas: **(1) apontar com menos atrito** (cronômetro, editar/desfazer, continuar o último, lembrete diário, rascunho do dia, um componente único de apontamento); **(2) organizar o meu trabalho** (lista única, plano ligado a tickets, grade semanal, Início em modo foco com ações no lugar, atalhos, Hoje em linha do tempo, rituais); **(3) o time e a gestão** (digest pessoal, variância com horas assumidas e heatmap, fechamento semanal do timesheet, config fatiada por perfil, abertura mais leve, toque no celular).

---

## 2. Como a análise foi feita

| Frente | O que foi feito | Resultado |
| --- | --- | --- |
| Auditoria do código | Leitura estática de `public/js` (45 módulos), `index.html`, CSS e `api/` com evidência arquivo:linha; inventário por NAVCAT/ABAS; rastreio dos 9 fluxos da pessoa e do gestor | 44 telas, 15 grupos de abas, 9 fluxos, 11 sobreposições, 25 oportunidades |
| Capturas de tela | 16 telas no computador (1360 px) e 4 no celular (393 px) contra o servidor de fixtures, revistas uma a uma | Sem erro de JS; alturas e densidade medidas |
| Medição mobile | `scripts/mobile-audit.mjs` (iPhone emulado) em 15 telas do dia a dia | Transbordo 0 em todas; alvos de toque e fontes pequenas contados |
| Mercado | Pesquisa web com fontes abertas em 6 categorias: apontamento sobre o Jira, apontamento automático, organização pessoal, capacidade do time, rituais no Teams/Slack, IA aplicada | 36 ferramentas, 28 ideias, 12 padrões de UX, cada afirmação com URL |

Dados de uso real (📊 Uso do painel) não foram consultados nesta rodada: o projeto do Supabase do painel não estava acessível a partir deste ambiente. O item "🧭 podar o que ninguém abre" do roadmap continua dependendo deles.

---

## 3. O que o app já tem

| Área | Telas | Para quem |
| --- | --- | --- |
| Hub (todo mundo) | 15 — Início, Apontar (Chamados · Rateio · Sugestões do dia), Inbox (Pendências · Menções), Prioridades, Meu Planejamento (+ Planejado × realizado), Agenda (Eventos · Controle de tickets · Ligações), Meu tempo, Criar ticket (Onde crio · Criar · Preciso criar meus tickets) | consultor e gestor |
| Dexterity Entrega | 14 — Alertas, Tickets do time (5 abas), Reuniões (2), Projetos (2), Horas do time (2), Planejamento do time, Portal do cliente | gestores de entrega e PMs |
| Dexterity Negócio | 6 — Contratos (Clientes · Parceiros), Apuração (AMS · Bolsa de horas), Rentabilidade, Controladoria | comercial, financeiro, controladoria |
| Dexterity Insights | 7 — Visão Geral (2), Central de Relatórios (4), Uso do painel | diretoria e governança |
| Configuração e mais | Central de configurações (+ Metas, Histórico), Roadmap, Reportar | admin / todos |

**Pontos fortes diante do mercado** (coisas que as ferramentas comparadas não fazem, ou fazem só em parte):

- Reunião do Outlook → ticket no Jira **com convite de apontamento** para cada presente, horas estimada/real (relatório de presença do Teams)/manual, e ➕ convidar quem não estava no convite. O Clockwork e o Tempo transformam o evento em worklog **só da própria pessoa**.
- 📞 Ligações: detector no Mac que sabe pelo Core Audio quem usa o microfone e, no fim da chamada, oferece criar ticket ou apontar com a hora real. Só o Timing (macOS) tem algo parecido, sem integração com o Jira.
- 🧾 Preciso criar meus tickets: relato em linguagem natural → itens → tickets criados, horas apontadas e status movidos num fluxo só. O Rovo quebra trabalho em subtarefas, mas não aponta nem move.
- 🚧 Trava do planejamento ao apontar (avisar/bloquear) em todos os lugares que gravam horas, com régua de capacidade (feriado, ausência, fim de semana) — não encontrado em nenhuma ferramenta comparada.
- 🛡 Apuração de AMS por ticket principal (PDF por ticket pai, sem os tipos não faturáveis); 🤝 contratos de parceria ligados ao 🧾 Odoo (item por projeto e período), com frentes apuradas pela planilha do parceiro; 💰 fluxo de caixa. Produtos como Productive.io e Runn cobram caro por isso e não falam com o Odoo.
- 🧭 Guia interativo em todas as 44 telas + tour, verificados por máquina; ✨ Novidades e 🗺️ Roadmap dentro do app com aviso automático no Teams.
- Camada mobile sem transbordo nas 15 telas medidas; PWA instalável.

---

## 4. Achados da auditoria

Cada achado cita a evidência (arquivo:linha no estado do repositório em 2026-10-20) e o item do roadmap que o endereça (🗺️).

### 4.1 Apontar horas

| Achado | Evidência | 🗺️ |
| --- | --- | --- |
| Não existe cronômetro: o único timer do app é o da pauta da reunião de prioridades. O `/api/apontar` já aceita `hora` (HH:MM), mas só o 📞 a manda; a linha do Apontar grava tudo às 09:00 | `06-prioridades.js:222,345`; `api/apontar.js:21-23,95-96`; `13-apontar.js:499` | ⏱ Cronômetro; (hora na linha já estava no roadmap) |
| Não dá para editar nem apagar um worklog pelo app; o toast de sucesso não tem "desfazer"; 30 `confirm()` nativos | `api/apontar.js:19-28` (só cria); `13-apontar.js:753`, `20-gestao.js:512` | ↩ Editar/excluir + desfazer |
| A lista padrão do Apontar é "vence até hoje, só os meus": ticket sem data ou com vencimento futuro some até mexer em 2 controles | `01-nucleo.js:30`; `13-apontar.js:440-462` | 👤 Minha lista de trabalho |
| 🕑 Recentes (o caso mais comum: o mesmo ticket de ontem) ficam no fim da página e recolhidos; chips fixos 30m…8h sem "até a meta" nem "desde o último", embora meta e total do dia já estejam calculados | `13-apontar.js:550-559,499,744-746` | 🕑 Continuar de onde parei |
| Nenhum lembrete pessoal: zero `Notification`/push no front; o servidor manda ranking e resumo ao **canal**; DM individual só para os convites de apontamento e para a mensagem semanal de cada gerente (relatório de sexta) — nenhuma lembra a pessoa de apontar | `30-eventos-boot.js:63-64`; `api/teams.js:2-3,170,248,581` | 🔔 Lembrete diário |
| 12 pontos gravam worklog com validações e mensagens diferentes (os mesmos 12 em que o `planGate` é chamado; o 📝 da Agenda só cria convites); 8 chamam `registraExtraDia` e 4 não — 📍 Meu dia, 🎫 criação rápida com tempo, 📨 convidar incluindo a si mesmo e 🔗 vincular com worklog —, então o "Total do dia" não acompanha neles | `13:714` × `20:494` × `14c:392`; `09:340`, `21:117`, `21:244`, `24:119` sem extra | ♻️ Componente único |
| Três assistentes de "reconstruir o dia" sem ponte: 📍 Meu dia (ActivityWatch + Terminal + token em variável de ambiente), 📞 Ligações e 🧾 relato | `09-qualidade-auditoria-meudia.js:352-361`; `14c`; `14b` | 🤖 Rascunho do dia; 📱 Meu dia sem Terminal |
| O organizador da reunião não entra em `pessoas` do modal 📝 (checkbox desabilitado) e precisa apontar as próprias horas à parte | `03-agenda-reunioes.js:387,446,477` | 🧑‍🤝‍🧑 Organizador aponta no 📝 |
| Convites de apontamento expiram em 21 dias sem aviso; a confirmação exige abrir o painel | `api/apontar.js:37`; `19:342`; `13:1156` | 📨 Lembrete dos convites |

### 4.2 Planejar a semana

| Achado | Evidência | 🗺️ |
| --- | --- | --- |
| O item do plano é projeto + descrição livre + horas; não aponta para ticket, então não vira lista do dia nem pré-preenche o worklog; o comparativo é só por projeto/dia | `04-meu-planejamento.js:196-216,127-164` | 🔗 Plano ligado a tickets |
| Um formulário por vez com 5 campos: uma semana comum são ~15 ciclos; não há grade projeto × dia nem "copiar este dia"; "Copiar semana anterior" duplica se clicado 2×. Já existem "Copiar semana anterior", "Criar rotina" e arrastar entre dias | `04:227,202-209,321-322,1134-1142,1054-1080` | 🧩 Grade semanal |
| Nenhuma sugestão a partir dos meus tickets que vencem na semana nem das reuniões da Agenda, embora a Início já tenha os dois | `08-inicio.js:656,639` | 🔗 Plano ligado a tickets |
| Plano enviado bloqueia edição; com a trava em "bloqueio", um imprevisto no meio da semana trava o apontamento até retirar o envio (ou reabrir o aprovado), incluir a atividade no dia e reenviar — a régua aceita plano "enviado" ou "aprovado" sem nova aprovação, e com `rascunho` ligado o plano em elaboração já passa | `04:306,311,1155-1167,1251-1262` | 🔄 Rollover + guarda-corpo; (exceções já estavam no roadmap) |
| Botão "Modelo anterior desta semana" (cfg.planosSemana) continua no código e aparece nas semanas que têm plano no modelo antigo por tickets | `04:314,1034` | 🧽 Rastros aposentados |

### 4.3 Começar o dia — a Início

| Achado | Evidência | 🗺️ |
| --- | --- | --- |
| A Início junta agenda + tickets + plano + horas, mas os cards do seu dia (11 mini-cards + 📅 Hoje na agenda, 🎯 Meus tickets, 📊 Sua semana) são só **contadores e links**: nenhum deles age no lugar (apontar no card de horas, criar o ticket da reunião de hoje, concluir um ticket); as únicas ações no lugar ficam mais abaixo — o 🎫 Criar ticket rápido, a ficha 🔍 nas linhas do Radar e dos recém-criados e o 🌳 Onde crio | `08-inicio.js:493` (pcard), `641-648` (evRow), `663-664` (tkRow) | ⚡ Ações no lugar + modo foco |
| 12 cards de página (o seu dia com 11 mini-cards e 3 blocos, Apontamento do time, criação rápida, recém-criados, criados na semana, vencidos por projeto, Fechamento do mês, Radar, Time com 6 mini-cards, Onde crio, Ir para, Novidades — mais de 30 blocos no total); 5.789 px no computador e 8.813 px no celular; nenhum card pode ser recolhido, escondido ou reordenado (só o Radar guarda a combinação escolhida); cada chegada de dado redesenha tudo | captura `desk-acoes.png`; `08:371` | ⚡ Ações no lugar + modo foco |
| 13 leituras da API na abertura (18 requisições com identidade, contando os POSTs do plano, da config e do status do Odoo; 11 sem identidade): `/api/atividade?janela=7d` pedido 2× (boot e Radar) e `/api/tempo` 4× com janelas sobrepostas (7 dias no boot, mês até hoje, semana até hoje e 7 dias no Radar — boot e Radar pedem o mesmo intervalo com URLs diferentes) | `01-nucleo.js:473-479`; `08:160,176,268,274` | ⚡ Abertura mais leve (reescrito) |
| As Novidades na Início trazem o texto integral (as três entradas de 20/10 somam quase 3.000 caracteres); o rodapé "Fontes / Timesheet / Planejar / Apontar / Observações" repete em todas as telas | `08:449`; `index.html:225-240` | ⚡ Ações no lugar + modo foco |
| 🎯 Prioridades (ritual semanal de gestão) ocupa um dos 4 botões fixos da barra para todos, enquanto 📅 Agenda e 📋 Meu Planejamento, diários para o consultor, ficam no dropdown | `index.html:91-94,100-101` | ⚡ Ações no lugar + modo foco |

### 4.4 Acompanhar o que me pediram

| Achado | Evidência | 🗺️ |
| --- | --- | --- |
| "O que me pediram" está em 6 lugares (Inbox, Início, Apontar, Gestão, Agenda, Meu Planejamento); não há lista de trabalho única | fluxo f da auditoria | 👤 Minha lista de trabalho |
| Ser atribuído a um ticket ou ter o vencimento/status alterado por outra pessoa não gera pendência no Inbox; menções com janela padrão de 14 dias (ajustável para 7/30/60 na aba 💬 Menções; teto de 60 no servidor) | `19-mencoes-inbox-analytics.js:66,234-237,258` | 📥 Inbox com atribuições + snooze |
| KPI "🔒 Alocações p/ aprovar" lê `cfg.alocTravas`, escrito só pela tela arquivada — nunca enche; o Meu dia ainda lê `cfg.alocacoes` | `19:218-223,297`; `09:309` | 🧽 Rastros aposentados |

### 4.5 Criar ticket

| Achado | Evidência | 🗺️ |
| --- | --- | --- |
| Pelo menos oito portas para criar (rápido com IA, lote, árvore, relato, reunião, ligação, voz/Siri/Alexa, bot do Teams — e ainda o 🔗 Vincular reunião › criar e o 🔁 Transformar); ➕ Novo lista 7 itens; a mais rápida (IA) só existe na Início e o "📝 Criar ticket" do menu abre o módulo de lote (109 KB); a vista chama-se `planejar`, que confunde com o Meu Planejamento | `08:802`; `index.html:141-148`; `29-url-topo.js:4` | ➕ Uma porta só |

### 4.6 Celular (medição `mobile-audit`, iPhone emulado, 393 px)

| Tela | Transbordo | Toque < 44 px | Toque < 32 px (graves) | Fonte < 12 px |
| --- | --- | --- | --- | --- |
| Início | 0 | 57 / 83 | 0 | 15 |
| Apontar | 0 | 111 / 114 | 2 | 18 |
| Gestão | 0 | 87 / 90 | 7 | 5 |
| Config | 0 | 50 / 56 | 30 | 14 |
| Meu tempo | 0 | 25 / 25 | 8 | 60 |
| Inbox · Menções · Minha semana · Agenda · Controle · Ligações · Criar · Preciso criar · Projetos | 0 | 6–15 cada (quase todos) | 0–2 | 0–20 |

A camada mobile de 2026-09-28 resolveu o transbordo (meta 0, atingida em todas); os alvos de toque ficaram para depois e dominam agora. 🗺️ 📱 Alvos de toque ≥ 44 px.

### 4.7 Plataforma

| Achado | Evidência | 🗺️ |
| --- | --- | --- |
| 2.510.537 bytes de JS nos 45 módulos carregados (sem o `_arquivado`), sem minificação, todos em `<script defer>` em toda abertura; os maiores: novidades/roadmap 179 KB (cresceu com esta análise), guias 172 KB, rentabilidade 129 KB, parcerias 123 KB, Início 119 KB, criar (`14-planejar.js`) 109 KB; Negócio + Insights ≈ 700 KB para quem só aponta; CSS 252 + 131 KB | `index.html:264-308`; soma dos 45 arquivos carregados (`ls public/js/*.js \| grep -v '/_' \| xargs cat \| wc -c`) | ⚡ Abertura mais leve (reescrito) |
| A config compartilhada (45 chaves `cfg.*`) desce **inteira** para o navegador de todo o time — contratos com valores, custo/h por pessoa, parcerias com equipe/previsão/documentos — e é mesclada no cliente; teto de 256 KB | `api/_lib/portal.js:15`; `16-contratos-ams-receita.js:278`; `api/config.js:1241` | 🧾 Config fatiada por domínio e perfil |
| Um único `#modal` para 94 chamadas: busca 🎫 → ficha → apontar substituem o conteúdo e só a ficha tem "voltar"; `fechaModal` redesenha a Gestão sempre; o planGate precisou de sobreposição própria porque Gestão, 📞 e convite já ocupam o `#modal` | `26-navegacao.js:61-66`; `20:408`; `04:1301`; `14c:204` | 🪟 Pilha de modais / gaveta |
| PWA instalável e service worker que nunca intercepta `/api/`: sem rede, o apontamento falha e se perde | `sw.js:45`; `13:764` | 📱 Fila offline |
| Atalhos globais quase só de navegação (Ctrl+K, `/`, Ctrl+J, `?`, Esc — as exceções são Ctrl+Enter no 🐞 Reportar e Ctrl+C para copiar uma data); nenhum para apontar, criar ou trocar de aba; sem lista consolidada de atalhos na Ajuda | `26:319`; `12b:338`; `30:9` | ⌨️ Atalhos de ação |
| A telemetria registra abertura e segundos por tela, não ações (abriu o Apontar e não apontou, cancelou o 📝, usou Ctrl+K) | `31-uso.js:47-51,126-156` | 📊 Uso do painel (reescrito) |
| Acessibilidade: 228 `aria-*`, 61 `role=`, 24 `tabindex`, 611 `data-tip` por hover | contagens | (já no roadmap: ♿) |

---

## 5. O mercado

### 5.1 Ferramentas comparadas e o que inspira

| Categoria | Ferramentas | O que vale copiar (com a fonte no fim do documento) |
| --- | --- | --- |
| Apontamento sobre o Jira | **Clockwork Pro** (nosso provedor), Tempo Timesheets, Everhour, Clockify for Jira | Clockwork: aprovação de timesheet por período com trava, timers por status do workflow, filtro *Outliers* + e-mail a quem ficou abaixo das horas. Tempo: *activity cards* do calendário/IDE/Slack com "Log Activities" de uma vez; *recall* do timesheet submetido; agente Rovo que loga de qualquer página. Everhour: estimado × real na issue, timer com autostop. Clockify: metas por pessoa com "Their work capacity" (feriado e folga baixam a meta sozinhas), resumo ao gestor de quem esqueceu, "Copy last week" e templates de timesheet |
| Apontamento manual e automático | Toggl Track, Harvest, TimeCamp, Timely (AutoSheet), Memtime, Timing (Mac), Rize, Hubstaff | Toggl: `N` novo timer, `C` continua o último, calendário por arrastar, widget, Pomodoro. Harvest: 3 tipos de lembrete (recorrente, pontual, pessoal) e duplicar timesheet. Timely: a IA gera o timesheet de ontem toda manhã para revisar e submeter. Timing: detecta o fim da chamada e pergunta "registrar?"; sugere blocos que pertencem juntos. Rize: relatório diário/semanal por e-mail com tendência de 4 semanas. Hubstaff: ociosidade pausa o timer e pergunta "manter ou descartar?" |
| Organização pessoal | Sunsama, Akiflow, Motion, Reclaim.ai, Morgen, Todoist, TickTick, Things 3, Jira *For you*, Linear, ClickUp Home / Me Mode, Asana My Tasks, monday My work | Sunsama/Akiflow: rituais guiados (planejar de manhã, *shutdown* à noite, revisão semanal), aviso de sobrecarga com "adiar", rollover do que não foi feito. Reclaim: issue do Jira vira bloco no calendário e, ao concluir, o tempo é registrado. Jira *For you*: seções de ação (vencendo, responder menções, aprovar, atribuídos). Linear: triage com snooze por atalho, ciclos que rolam o que ficou. Asana: auto-promoção Upcoming → Today. ClickUp: "Me Mode" por cima de qualquer lista. Todoist: Karma, metas, sequências, modo férias |
| Capacidade do time | Float, Runn, Tempo Capacity Planner, Jira Plans, Resource Guru, Productive.io, ActivityTimeline, Capacity Planning for Jira | Runn: *variance chart* planejado × real e **horas assumidas** onde não há timesheet. Float: branco = livre, vermelho = superalocado; alocação tentativa; timesheet pré-preenchido pelo agendado. Resource Guru: conflito oferece lista de espera, hora extra ou estender. ActivityTimeline: heatmap pessoa × dia |
| Rituais e avisos no Teams/Slack | Geekbot, DailyBot, Standuply, Polly, Jira Cloud for Teams/Slack, Fillchecker | DailyBot: check-in em DM com os tickets abertos da pessoa, resposta muda status. Fillchecker: "time models" com horas exigidas e lembrete por grupo/horário. Jira for Slack: perfil "Essentials" de notificações pessoais |
| IA aplicada | Atlassian Rovo / Jira AI, Linear Triage Intelligence, Notion AI Meeting Notes | Rovo: quebra em subtarefas, resumo e busca natural. Linear: duplicatas, labels e responsável sugeridos. Notion: transcrição → resumo → itens de ação viram tarefas |

### 5.2 Padrões de UX que se repetem nas melhores ferramentas

1. **Uma barra de comando para tudo** (Cmd+K) e **teclas únicas na lista**: `n` novo, `c` continuar, `?` ajuda; ação comum em até duas teclas (Linear, Toggl, Clockify, Akiflow).
2. **"Continuar o último" e recentes como ação primária** — a maior parte dos apontamentos repete o ticket de ontem (Toggl, Harvest, KimaiBar).
3. **Calendário editável por gesto**: arrastar cria, borda redimensiona, clique divide, Cmd+arrastar duplica (Clockify, Toggl, Tempo).
4. **Sugestões como cartões** que se aceitam, editam ou descartam, com "aceitar tudo" — automação com a pessoa no controle (Tempo, Timely, Morgen).
5. **Copiar semana / template** com escolha do que copiar (só projetos ou também horas) (Clockify, Harvest).
6. **Edição e aprovação em lote** por checkbox (Toggl, Tempo).
7. **Listas por horizonte com auto-promoção e rollover** — Hoje / Em breve / Depois (Asana, Linear, Todoist).
8. **Guarda-corpo com saída**: o aviso de sobrecarga já traz "adiar", "hora extra", "lista de espera" (Sunsama, Resource Guru, Float).
9. **Lembretes opt-in com horário próprio e snooze**; meta que respeita folga (Harvest, Geekbot, Clockify, Toggl).
10. **Página "Para você" por seções de ação** e filtro "só o meu" por cima de qualquer lista (Jira, ClickUp, monday).
11. **Timer/apontar onde a pessoa já está**: dentro da issue, extensão, widget, barra de menus, Slack (Everhour, Clockify, Toggl, Tempo).
12. **Ritual com horário**: planejar de manhã, fechar à noite, revisar na sexta (Akiflow, Sunsama).

---

## 6. Oportunidades priorizadas

Impacto e esforço são estimativas (P = dias, M = 1–2 semanas, G = mais). A coluna "estágio" é a sugestão colocada no roadmap: **planejado** = recomendado para as próximas entregas; **avaliação** = depende de decisão de processo ou de um pedido do time.

### Onda 1 — apontar com menos atrito

| # | Item | Impacto | Esforço | Estágio |
| --- | --- | --- | --- | --- |
| 1 | ⏱ Cronômetro start/stop com o ticket atual (hora real, pílula no cabeçalho, sobrevive ao F5) | alto | M | planejado |
| 2 | ↩ Editar/excluir o próprio apontamento + desfazer no toast + "meus lançamentos de hoje" | alto | M | planejado |
| 3 | 🕑 "Continuar de onde parei" no topo do Apontar + chips "até a meta" e "desde o último" | médio | P | planejado |
| 4 | 🔔 Lembrete diário pessoal no Teams com meta dinâmica (feriado/ausência) e opt-out | alto | M | planejado |
| 5 | 🤖 Rascunho do dia de ontem toda manhã: plano + agenda + ligações + Meu dia em cartões, "registrar tudo" | alto | M–G | planejado |
| 6 | ♻️ Um componente único de apontamento (porta `apontaWorklog` + campos reutilizados) | médio | M | planejado |
| 7 | 🧑‍🤝‍🧑 O organizador aponta pelo mesmo modal 📝 da reunião | médio | P | avaliação (decisão pendente) |
| 8 | 📨 Lembrete e expiração visível dos convites de apontamento | médio | P | avaliação |
| 9 | 📱 Meu dia sem Terminal (detector do Mac envia os blocos, ou fusão com o 🧾 relato) | médio | M | avaliação |

### Onda 2 — organizar o meu trabalho

| # | Item | Impacto | Esforço | Estágio |
| --- | --- | --- | --- | --- |
| 10 | 👤 Minha lista de trabalho única (todos os meus abertos, ordem manual, hoje/semana, apontar e concluir na linha) | alto | G | planejado |
| 11 | 🔗 Plano da semana ligado a tickets, sugerido pelos meus tickets e reuniões, "apontar pelo plano" | alto | G | planejado |
| 12 | 🧩 Grade semanal projeto × dia no Meu Planejamento, copiar dia, templates nomeados, dedup do copiar | médio | M | planejado |
| 13 | ⚡ Início: ações no lugar + modo foco (blocos recolhíveis por pessoa, Novidades resumidas, rodapé na Ajuda, barra fixa pela lente) | alto | M | planejado |
| 14 | ⌨️ Atalhos de ação (`a` apontar, `n` novo, `g a`/`g i`, `1–9` abas) + folha de atalhos no `?` | médio | P | planejado |
| 15 | ➕ Uma porta só para criar ticket (botão global abre a criação rápida com IA em qualquer tela) | médio | M | planejado |
| 16 | 📆 Hoje — linha do tempo do dia (agenda + plano + apontado + lacunas clicáveis) | alto | G | avaliação |
| 17 | 🔄 O que ficou de ontem (rollover) + ⚠ guarda-corpo de sobrecarga ao planejar | médio | P | avaliação |
| 18 | 🌅 Rituais guiados: planejar de manhã, fechar o dia, fechar a semana (lembrete no Teams) | alto | M | avaliação |
| 19 | 📥 Inbox com atribuições e mudanças nos meus tickets + snooze/triagem por tecla | médio | M | avaliação |
| 20 | 🪟 Pilha de modais / gaveta lateral da ficha do ticket | médio | M | avaliação |

### Onda 3 — o time, a gestão e a plataforma

| # | Item | Impacto | Esforço | Estágio |
| --- | --- | --- | --- | --- |
| 21 | 📬 Digest matinal pessoal no Teams (reuniões, vencendo, menções, plano, ontem × meta) | alto | M | planejado |
| 22 | 📋 Carga das próximas semanas → heatmap pessoa × dia + variância planejado × real com horas assumidas (**reescrito**) | alto | M | avaliação |
| 23 | 📣 Cobrar o apontamento direto do card → filtro "abaixo da meta na semana" + histórico (**reescrito**) | alto | P | avaliação |
| 24 | ✅ Fechamento semanal do timesheet (submeter, aprovar, travar; recall) | alto | M | avaliação (processo) |
| 25 | 🧾 Config compartilhada fatiada por domínio e perfil (valores de contrato e custo/h param de descer para todo o time) | alto | G | planejado |
| 26 | ⚡ Abertura mais leve: deduplicar leituras + módulos de Negócio/Insights/Guias sob demanda + minificar (**reescrito, de avaliação para planejado**) | médio | M | planejado |
| 27 | 📱 Alvos de toque ≥ 44 px nas telas do dia a dia | médio | M | planejado |
| 28 | 🧽 Tirar os rastros das telas aposentadas (KPI 🔒, cfg.alocacoes, "Modelo anterior") | baixo | P | planejado |
| 29 | 📊 Uso do painel → telemetria de ação (funil tentativas × sucessos) (**reescrito**) | médio | P | avaliação |
| 30 | 📱 Fila offline de apontamentos (IndexedDB + reenvio) | médio | M | avaliação |
| 31 | 📝 Reunião gravada → resumo e itens de ação viram tickets | médio | G | avaliação |

**Sugestão de ordem para as próximas entregas:** 3 → 2 → 1 → 4 → 14 → 13 → 6 → 5 → 11 → 10. Os quatro primeiros atacam a ação mais repetida do app com pouco código novo; 13 e 14 mudam a sensação de velocidade; 5, 11 e 10 são as peças grandes que fazem o planejamento e o apontamento se encontrarem.

---

## 7. O que ficou de fora de propósito

- **Pomodoro / modo foco com bloqueio de distração** (TickTick, Rize): baixo impacto para quem vive em reunião e chamado; o cronômetro com ticket cobre a parte útil.
- **Auto-agendamento de tarefas no calendário** (Motion, Reclaim): exige escrever no Outlook de cada pessoa e disputar com a agenda real; a Agenda continua só leitura por decisão anterior.
- **Stand-up assíncrono no Teams** (Geekbot, DailyBot): o 🎯 Prioridades do time e o relatório de sexta já cobrem o ritual; o digest pessoal (item 21) entrega o que falta sem mais um bot.
- **App nativo nas lojas** e **login com a conta Atlassian**: já estão em avaliação no roadmap.
- **Itens já presentes no roadmap** que a análise só confirma: hora do apontamento na linha, busca por texto, exceções da trava, servidor impor a trava, resumo semanal de sexta no Meu tempo, aviso de plano aprovado/devolvido, acessibilidade, carregar sob demanda (reescrito), podar o que ninguém abre.

---

## 8. Fontes consultadas

**Clockwork (HeroCoders):** https://herocoders.com/products/jira-time-tracking/clockwork-pro · https://docs.herocoders.com/clockwork/clockwork-pro-vs-clockwork-free · https://www.herocoders.com/blog/three-ways-to-ensure-up-to-date-timesheets
**Tempo:** https://www.tempo.io/tempo-timesheets-agile-time-tracking-plugin-for-jira · https://help.tempo.io/timesheets/latest/what-is-tempo-automation · https://help.tempo.io/timesheets/latest/logging-time-in-my-work · https://help.tempo.io/timesheets/latest/tempo-for-slack · https://help.tempo.io/planner/latest/planned-vs-actual-reports
**Everhour:** https://everhour.com/integrations/jira · https://everhour.com/features · https://everhour.com/blog/tempo-vs-everhour/
**Clockify:** https://clockify.me/help/track-time/targets-reminders · https://clockify.me/help/time-tracking/calendar-view · https://clockify.me/help/time-tracking/timesheet-view · https://clockify.me/learn/resources/clockify-hidden-features/ · https://marketplace.atlassian.com/apps/1231476/clockify-for-jira
**Toggl Track:** https://toggl.com/features/automated-time-tracker · https://support.toggl.com/keyboard-shortcuts · https://support.toggl.com/tracking-time-in-the-calendar-view · https://support.toggl.com/tracking-time-in-list-view · https://toggl.com/time-tracking-windows
**Harvest:** https://support.getharvest.com/hc/en-us/articles/360058596112 · https://www.getharvest.com/time-tracking/timesheet-approval-process-best-practices · https://www.getharvest.com/blog/2009/12/new-feature-duplicate-timesheet
**TimeCamp · Timely · Memtime · Timing · Rize · Hubstaff:** https://thedigitalprojectmanager.com/tools/timecamp-review/ · https://www.timely.com/feature/autosheet/ · https://www.timely.com/help/handbook/autosheet/timely-autosheet/ · https://www.memtime.com/integrations/jiracloud-time-tracking · https://timingapp.com/presskit/ · https://rize.io/features/productivity · https://rize.io/blog/releasing-the-new-weekly-productivity-assessment · https://apploye.com/hubstaff-review
**Sunsama · Akiflow · Motion · Reclaim · Morgen:** https://help.sunsama.com/docs/daily-planning · https://product.akiflow.com/help/articles/0805246-rituals · https://product.akiflow.com/en/help/articles/7262522-keyboard-shortcuts · https://help.usemotion.com/tasks-events-and-auto-scheduling-101/what-is-auto-scheduling-and-how-to-auto-schedule-your-tasks-in-motion · https://reclaim.ai/features/jira-integration · https://marketplace.atlassian.com/apps/1227309/task-planner-for-google-outlook-calendar-reclaim-ai · https://www.morgen.so/for-ai
**Todoist · TickTick · Things · Jira For you · Linear · ClickUp · Asana · monday:** https://todoist.com/help/articles/introduction-to-karma · https://www.todoist.com/help/automations/get-started/use-an-idea-to-set-up-an-automation-0WfEL09U7 · https://zapier.com/blog/ticktick-vs-todoist.md · https://www.culturedcode.com/things/support/articles/2803579 · https://support.atlassian.com/jira-software-cloud/docs/what-is-the-for-you-page/ · https://linear.app/docs/use-cycles · https://linear.app/docs/triage-intelligence · https://fastshortcuts.com/shortcuts/linear/ · https://build-next.web.clickup.com/features/home · https://asana.com/resources/asana-tips-my-tasks.md · https://support.monday.com/hc/en-us/articles/360019300579
**Float · Runn · Resource Guru · Productive · ActivityTimeline · Jira Plans:** https://float.com/project-planning · https://www.float.com/resources/automate-capacity-in-float · https://help.runn.io/en/articles/3799817-variance-charts · https://help.runn.io/en/articles/5539576-assumed-hours · https://help.resourceguruapp.com/en/articles/2942080-booking-clashes-the-waiting-list-overtime-and-capacity-planning · https://productive.io/get-started · https://activitytimeline.com/features?view=plan · https://marketplace.atlassian.com/apps/2256676628/capacity-planning-for-jira · https://www.atlassian.com/software/jira/guides/advanced-roadmaps
**Teams/Slack e IA:** https://geekbot.com/blog/dailybot-alternative/ · https://standly.io/dailybot-alternative-microsoft-teams · https://standuply.com/microsoft-teams-standup-bot · https://www.polly.ai/help/microsoft-teams-agile/creating-a-standup-series · https://marketplace.atlassian.com/apps/1232798/fillchecker-timesheet-checks-and-reports-for-jira · https://support.atlassian.com/jira-software-cloud/docs/get-jira-notifications-in-slack/ · https://marketplace.microsoft.com/en-us/product/office/WA200002140 · https://wac-cdn.atlassian.com/br/software/jira/ai · https://fireflies.ai/blog/notion-ai-meeting-notes
