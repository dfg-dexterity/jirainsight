# 📆 Hoje — o planejamento do dia como ponto central do Dexterity Hub

**Data:** 2026-10-21 · **Pedido do usuário:** *"adicione mais funcionalidades para ajudar meu time a organizar seu
trabalho, usar o Jira Insight como ponto central de planejamento do dia, incluindo controle da agenda, priorização
de tarefas etc. Veja o que o mercado possui disponível para inspiração."*

Este documento registra **o que foi entregue**, **de onde veio cada ideia** (ferramentas e fontes consultadas) e **o que
ficou de fora de propósito** — para o 🗺️ Roadmap e para quem for evoluir a tela.

## 1. O que entrou

| Peça | Como funciona | Inspiração (fonte) |
| --- | --- | --- |
| **📆 Hoje** (tela nova, logo depois da 🏠 Início; grupo com a aba 👥 Dia do time) | O dia da pessoa num lugar só: KPIs (capacidade = meta − reuniões · planejado · apontado · feitos), a ✅ lista do dia e a 🕘 linha do tempo lado a lado; ‹ › andam um dia | Sunsama *Daily Planning*, Akiflow *Today*, Tempo *My Work*, MS To Do *My Day* |
| **✅ Lista do dia** | Itens = ticket do Jira, atividade do 📋 plano da semana, reunião da Agenda ou tarefa livre; ordem manual (⠿ arrastar no computador, ↑↓ no celular); os **3 primeiros são o 🎯 foco**; estimativa editável na linha; apontado de hoje por ticket; ✓ feito; ⏱ apontar; ▶ cronômetro; 📅 agendar; ⋯ mover para o próximo dia útil / ligar a um ticket / tirar | Reclaim *Up Next* (stack rank manual vence o algoritmo), ClickUp *LineUp*, Things *Today*, Nirvana *Focus ★* |
| **⚡ Ordenar por urgência** | Regra publicada como texto, não caixa-preta: vencidos (mais antigo primeiro) → vence hoje → 🎯 prioridade do time → em andamento → vence esta semana → sem data; feitos no fim. Depois disso a ordem manual vale | Motion (*ASAP > hard deadline > due date > priority*), Todoist (P1–P4 dentro do dia), Linear |
| **💡 Sugestões por fonte, com o porquê** | ↩ o que ficou do último dia planejado · 📋 atividades do plano da semana para o dia · ⏰ vencidos · ⏰ vencem hoje · 🎯 prioridades do time (minhas) · 🔄 em andamento · 📅 reuniões do dia (com a duração do convite e o horário) · 🕑 tickets recentes. Candidatos nunca vêm de uma lista só | Sunsama (importar eventos como tarefas), Tempo *Activity Feed*, TickTick *Plan Your Day*, MS To Do *Sugestões*, Jira *For you* |
| **🕘 Linha do tempo** | Reuniões do Outlook à esquerda (✓ com ticket / 📝 sem ticket → cria ali), blocos planejados à direita (arrastar um item para a linha vira bloco na grade de 15 min; arrastar o bloco muda o horário), a barra verde é o apontado com hora real, a linha vermelha é "agora", e as **lacunas** do expediente (08–18h, ≥ 30 min) são clicáveis: agendar um item ali ou apontar o que fez nesse horário | Clockify/Toggl *Calendar view*, Sunsama *timebox*, Tempo *My Work* (calendário + cartões), Reclaim |
| **⚠ conflito** | Bloco em cima de reunião (ou de outro bloco) fica ⚠ na linha e no selo do item | Motion/Reclaim ("eventos externos vencem blocos") |
| **🗓 Reservar no Outlook** | Abre o *compose* do Outlook já preenchido (assunto, início, fim, link do ticket) por deep link — **o painel não escreve na agenda** (decisão anterior do projeto) | Akiflow/Morgen (bloco no calendário), com a restrição do projeto |
| **🌅 Planejar o dia** (ritual da manhã, 3 passos) | (1) o que ficou do último dia planejado — marcados entram hoje; (2) sugestões por fonte, com "todos/nenhum" por grupo; (3) estimativas × capacidade com ⚠ sobrecarga e **"amanhã"** item a item (vai para o próximo dia útil). Fecha com o dia 🌅 planejado | Sunsama *Daily Planning* (passos, *workload threshold*), Akiflow *Rituals*, Morgen (prévia e aprovação) |
| **🌙 Fechar o dia** (ritual da tarde, 2 passos) | (1) como foi (feitos, apontado × meta) e o destino de cada não feito — amanhã (padrão) / deixar / descartar; (2) feitos **sem apontamento** viram worklogs em lote (estimativa pré-preenchida, hora do bloco) + nota para amanhã. Fecha com o dia 🌙 fechado; o card da Início lembra depois das 17h | Sunsama *Daily Shutdown*, Akiflow (*Day Rating* opcional), Timely *AutoSheet* ("aprovar todas") |
| **⏱ Cronômetro** | ▶ no item ou na 🔍 ficha de qualquer ticket; pílula fixa em **todas as telas**, sobrevive ao F5 (localStorage); ■ abre a confirmação com o tempo arredondado (5 min) e a **hora real de início** → o worklog nasce nessa hora (`/api/apontar` com `hora`); iniciar outro para o atual e oferece apontar; aviso depois de 10 h rodando | Toggl Track, Everhour, Clockify, Rize |
| **🏠 Início › 📆 Seu dia** | Sem plano: "Planejar o dia"; com plano: os 3 do foco com ✓ ali mesmo, feitos/total, apontado; depois das 17h, "Fechar o dia" | MS To Do, Jira *For you* |
| **👥 Dia do time** (aba, só gestores) | Quem 🌅 planejou / 🌙 fechou / rascunho / sem plano, feitos/total, horas planejadas, apontado (Clockwork) × capacidade — **sem os itens** (o plano é pessoal) | DailyBot/Geekbot (check-in), Float |

## 2. Regras que a tela obedece

- **Dado pessoal, fora da config compartilhada.** O dia de cada pessoa é uma linha `dia_<accountId>_<AAAA-MM-DD>` na tabela
  `jirainsight_config` (como as fotos `semanal_*`), lida e gravada por `POST /api/config?dia=1` com a identidade validada no Jira
  (`planAuth`): a pessoa só lê e grava o **próprio** dia; `time` é só para gestores (`planEhGestor`). Trava otimista pelo `updated_at`
  (`base`), como o planejamento semanal; conflito → a versão do servidor vence e a tela avisa.
- **Todo worklog passa por `planGate(dia)` antes do POST** (🚧 trava do planejamento) **e por `registraExtraDia` depois**; `logAcao`
  como os demais pontos; o lote do 🌙 grava a config **uma vez**.
- **Capacidade** = `mpCapDia` (meta da pessoa; zero em folga, feriado, ausência) − reuniões do dia (eventos não dia-inteiro).
- **Nada move sozinho**: o que ficou de ontem é *sugestão*; "amanhã" é escolhido item a item; o item de origem fica marcado `movido`.
- **Estimativa de ticket** nasce do restante no Jira (*Original estimate* − *Time spent*) quando existe; itens sem estimativa que
  ganham bloco assumem 1 h.
- **Agenda só leitura**: o Outlook nunca é escrito; o 🗓 abre o *compose* para a pessoa confirmar.

## 3. O que o mercado faz e ficou de fora de propósito

| Ideia | Por que não (agora) |
| --- | --- |
| Auto-agendamento que coloca e move tarefas no calendário (Motion, Reclaim, Morgen, Amie) | A Agenda é só leitura; o dia do consultor é interrompido por chamadas de cliente — um plano que se reescreve sozinho deixa de ser dele. Fica como R147 (decisão de política). |
| Rollover silencioso à meia-noite (Sunsama, Akiflow *Pending → hoje*) | O item é um ticket do Jira com vencimento visível ao cliente; a decisão de "amanhã" é item a item, no ritual. |
| Karma, *streaks* e pontos por tarefa (Todoist) | O time já tem 🏆 Ranking & Metas de horas; pontos por "concluir" incentivam fechar cedo e fatiar tickets. |
| Lista de tarefas paralela ao Jira (Structured, Routine, Amie) | Princípio do Hub: "ticket onde é necessário" e hora apontada em ticket. Tarefa livre existe só para o dia e pede um ticket na hora de apontar. |
| Pomodoro em tela cheia, bloqueador de distração (TickTick, Rize) | O consultor alterna reunião e atendimento; o que serve é o cronômetro por item que vira worklog. |
| Captura automática de atividade no computador (Timely *Memory*, Rize) | LGPD e sistemas SAP de clientes; o 📍 Meu dia (ActivityWatch, opt-in) já cobre quem quer. |
| Apontamento automático sem clique (Reclaim loga no Jira quando o evento começa; Toggl *auto-track*) | As horas são faturadas; nada é gravado sem a confirmação da pessoa. |
| Reflexão/avaliação do dia obrigatórias (Sunsama/Akiflow) | Num time que vê ritual como custo, obrigatoriedade mata a adoção: a nota é opcional. |
| Prioridade P1–P4 própria do app (Todoist/Things) | Duplicaria o campo do Jira; a urgência é calculada do que o Jira já tem. |
| Publicar o plano de todo mundo num canal todo dia (Sunsama → Slack) | 15 posts diários viram ruído; se vier, é DM opt-in (R021/R018). |

## 4. O que ficou para o roadmap (desdobramentos)

R145 ⏱ Cronômetro — "continuar o último" com uma tecla, ▶ no Apontar e na busca, parada automática no fim do expediente ·
R146 📆 Hoje — redimensionar blocos pela borda, Shift+arrastar duplica, visão da semana · R147 🗓 blocos escritos no Outlook pelo
Graph (decisão de política) · R148 👥 Dia do time com os itens (opt-in) e comentário do gestor · R149 estimativa que aprende com o
apontado (planejado × real por item) · R018 🌅 fechar a semana + lembrete no Teams dos rituais · R021 📬 bom-dia no Teams com o plano
do dia · R010 👤 Minha lista de trabalho (todos os meus abertos) · R013 🏠 Início com mais ações no lugar.

## 5. Fontes consultadas (documentação oficial, out/2026)

Sunsama — Daily Planning, Planned and Actual Times, Daily Shutdown, Weekly Review (help.sunsama.com) · Akiflow — Rituals, Time
Blocking 101 (akiflow.featurebase.app, product.akiflow.com) · Morgen — AI Planner, Frames (morgen.so/guides) · Routine — Planning
and scheduling (help.routine.co) · Amie — Tasks, AI Scheduling (amie.so/documentation) · Structured — Timeline/Inbox/Replan
(help.structured.app) · Todoist — Dates & time, Filters, Karma (todoist.com/help) · TickTick — Plan Your Day, Eisenhower Matrix,
Pomodoro (help.ticktick.com) · Microsoft To Do — My Day and Suggestions (support.microsoft.com) · Things 3 — Today/Upcoming/Anytime
(culturedcode.com/things/support) · Motion — Auto-scheduling reference (usemotion.com/help) · Reclaim — Up Next, Tasks, Focus Time,
Jira (help.reclaim.ai) · Clockwise — Focus Time (support.getclockwise.com) · Google Calendar — Focus time (support.google.com) ·
Outlook/Viva Insights — Focus plan (support.microsoft.com) · Fantastical — Adding events and tasks (flexibits.com) · Toggl Track —
Keyboard shortcuts, Calendar (support.toggl.com) · Clockify — Calendar view (clockify.me/help) · Everhour — Team settings/auto-stop
(support.everhour.com) · Timely — AutoSheet (timely.com/help) · Rize — Sessions (docs.rize.io) · Tempo — My Work, Logging time
(help.tempo.io) · Linear — Triage, Inbox, Cycles (linear.app/docs) · Jira Cloud — For you, quick filters (support.atlassian.com) ·
Asana — My Tasks (help.asana.com) · ClickUp — My Work/LineUp/Me Mode (help.clickup.com) · monday.com — My Work (support.monday.com)
· Superhuman — Inbox Zero/Remind Me (help.superhuman.com) · Notion — Home & My tasks (notion.com/help) · Nirvana — Glossary
(nirvanahq.com/help).

A pesquisa completa (43 ferramentas em três temas — planejamento do dia e rituais, *time blocking* e cronômetro, priorização e
triagem —, com os padrões que se repetem e as ideias avaliadas) está no histórico da sessão de 2026-10-21; este documento
consolida o que virou decisão.
