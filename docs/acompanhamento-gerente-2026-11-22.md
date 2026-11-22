# Acompanhamento de projetos pelo gerente — pesquisa de mercado e plano (2026-11-22)

Pedido do usuário: *"planeje novas funcionalidades; faça uma pesquisa de mercado para ver como meu gerente pode acompanhar os projetos de uma forma mais eficiente — vendo como o pessoal está usando o tempo deles em projeto, fazendo update dos tickets; eu quero facilitar o acompanhamento dos projetos para o gerente de projeto. Crie itens no roadmap do Notion; depois eu escolho qual executar primeiro."*

**Método.** Três frentes em paralelo e uma síntese:
1. Pesquisa de mercado na web, com cerca de 40 buscas (seção A, com as fontes).
2. Inventário do que o Dexterity Hub já oferece ao gerente e do que já está no 🗺️ Roadmap, conferido no código.
3. Plano de produto que cruza as duas, sem duplicar itens existentes.

Afirmações do plano que dependem do código foram reconferidas, por exemplo:
- o "parado" da 🧭 Pendências conta dias corridos pelo `updated` (`gpCalc`);
- o `/api/vencimentos` não lê o histórico de status dos tickets (o R266 precisa dele: o `statuscategorychangedate` só muda quando a categoria muda — achado da revisão do PR #241);
- o `srSaudeAuto` só olha vencidos, bloqueados, aguardando e sem status report.

**Resultado no 🗺️ Roadmap** (app e base do Notion, TI-14-024):
- 14 itens novos, **R262–R275**;
- 13 itens reescritos: R182, R257, R165, R041, R255, R090, R174, R181, R176, R175, R251, R115 e R130.

O dono escolhe a ordem; a seção 5 é só uma recomendação.


## 1. Diagnóstico

- O gerente **já tem quase todos os dados**: 📋 Status report (itens, semáforo com sugestão `srSaudeAuto`, ⏱ Horas da semana e 📈 Tendência), 🧭 Pendências do projeto (vencidos, parados, cadastro incompleto, sem apontamento, cobrança pronta), 🚧 Bloqueios com escalonamento, 📅 Cronograma com previsão pelo ritmo, 📊 Relatório de sexta com DM por gerente, 💹 Rentabilidade (⚖️ vendido × gasto) e 📈 Dashboard.
- O problema é **fragmentação**: são 6 telas, todas **um projeto por vez** (`srproj`, `gproj`). Só a 🧭 tem o filtro "meus projetos" (`gpMeusKeys`). Quem gerencia 4 projetos abre 4 × 6 telas para saber onde agir.
- O app é **reativo**: mostra o que já aconteceu. O único aviso ativo ao gerente é o bloqueio vencido e a DM de sexta. Não há alerta de horas nem de consumo (nenhuma fase do cron trata disso).
- **Falta de verdade (sem item no roadmap):**
  - previsão de horas no término (nenhum EAC no código);
  - registro formal de riscos (hoje um `<textarea>` de 1000 caracteres);
  - controle de escopo crescendo (catálogo R06 "falta");
  - previsão de prazo em faixa (o cronograma dá uma data única);
  - status incoerente (apontou horas e o ticket está "A fazer");
  - "parado" em dias úteis no status (hoje é dias corridos desde o `updated`);
  - ritmo fixo de status report com "não atualizado" visível.
- **Já previsto no roadmap, espalhado em itens pequenos:** quadro de semáforos (R182), fila do gestor (R257), alertas de horas (R255, R165, R041), cobrança programada (R090), IA no status report (R181), carga futura (R115). A proposta é reescrevê-los, não duplicar (seção 4).

## 2. Princípios

1. **Lembrete ao responsável antes do gerente.** A pessoa recebe primeiro; só o que persiste sobe (Linear, Atlassian Home).
2. **Sem vigilância.** Só ticket e apontamento; a pessoa vê o mesmo número que o gerente; nada de ranking individual novo (Timely × Hubstaff).
3. **Risco sempre explicado.** Todo semáforo, alerta ou previsão diz os fatores e lista os tickets (Wrike, Productive).
4. **Resumo semanal; crítico fora do resumo.** Nada de resumo diário novo ao gerente; alerta em lote, uma vez por limiar. Sem R$ por pessoa no Teams e no push.
5. **Dado faltando ≠ zero.** Semana sem apontamento ou sem plano aparece como "incompleta" e rebaixa a confiança da previsão, em vez de virar verde falso (Runn).
6. **Dias úteis e regra única.** Contagens em dias úteis (feriados e ausências do app); cada número novo reusa a régua existente (`srhCalc`, `mpSitDe`, `srSaudeAuto`, `rpVendEntre`, `crLinhas`).

## 3. Funcionalidades propostas (14 itens novos, R262–R275)

Pré-requisito "—" = usa só o que já existe.

### 🧭 Cockpit do gerente

| id | Título | Descrição | Estágio | Categoria | Área | Telas | Tam. | Impacto | Valor para | Pré-req. | Referência | Decisão pendente |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R262 | 🧭 Meus projetos — o cockpit do gerente: todos os projetos que gerencio numa tela, o mais urgente primeiro | Uma linha por projeto em que sou gerente (`cfg.projGerentes`; gestor e diretoria podem ver todos). Cada linha traz semáforo escolhido e sugerido, há quantos dias úteis o status report não é atualizado, vencidos, parados, bloqueios abertos e vencidos, execução das horas da semana (planejado × apontado, régua `mpSitDe`) e consumo do vendido. A ordem vem de uma tabela de pesos única, como a `AX_PRIO` da Início, e cada número diz o motivo e abre a tela já no projeto (📋, 🧭, 🚧, ⏱). Só leitura de dados que já existem: linhas `sr_<KEY>`, `/api/vencimentos?analytics=1`, `?bloqueios=1` e a foto `?semanal=1`. Fica de fora: editar na própria linha e a previsão (R263, R274), que entram como colunas quando existirem. | planejado | Funcionalidade | Entrega (gestão) | Vista nova no grupo 📁 Projetos · 🏠 Início (atalho) · 🦴 espinha | M | Alto | Gestor, Diretoria | — (absorve R182) | Atlassian Home, Kantata, Linear | Nome e lugar da tela (aba nova do 📁 ou substituir o "meus" da 🧭); quem vê todos os projetos |

### ⏱ Tempo do time no projeto

| id | Título | Descrição | Estágio | Categoria | Área | Telas | Tam. | Impacto | Valor para | Pré-req. | Referência | Decisão pendente |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R263 | 🔮 Horas no término — previsão de estouro das horas vendidas do projeto, com a data | Previsão = apontado até hoje + o que falta, comparada às horas vendidas (`ctHorasDoProjeto` / plano da 💹). Dois cenários lado a lado: pelo ritmo das últimas 4 semanas fechadas e pelo plano semanal já lançado. Mostra "estoura em dd/mm" ou "sobram N h", e a confiança cai quando há semana com apontamento incompleto. Aparece na seção ⏱ do 📋 Status report, na 🧭 Pendências e como coluna do cockpit. Dados: fotos `semanal_` (real por projeto) e `/api/tempo`. Só horas; R$ fica no R275. | planejado | Relatório e análise | Entrega (gestão), Negócio | 📋 Status report · 🧭 Pendências · R262 | M | Alto | Gestor, Negócio | — | Tempo Financial Manager (EAC), Harvest Forecast, Runn, Productive | De onde vem o "vendido" quando o projeto não tem contrato nem plano (estimativa do Jira ou sem previsão) |
| R264 | ⏱ Para onde foi o tempo — horas do projeto por épico e tickets que passaram da estimativa | Na seção ⏱ do 📋 Status report, um terceiro modo "🧩 Por épico": horas da semana e acumuladas por épico (cadeia de pais que o `/api/vencimentos` já devolve), ao lado da estimativa original. Lista "passaram da estimativa" os tickets abertos com apontado > estimado (limiar 100% e 150%), com responsável e botão 📝 Atualizar. Ticket sem estimativa aparece como "sem estimativa", nunca como 0%. Dados: `/api/tempo` + `timeoriginalestimate`. Não redistribui horas nem muda estimativa. | planejado | Relatório e análise | Entrega (gestão) | 📋 Status report (⏱) · 🧭 Pendências | M | Médio | Gestor, Consultor | — | Tempo Planned vs Actual, Runn (variação por papel) | — |
| R265 | 🕒 Apontamento em dia — quanto do projeto foi lançado no prazo, e semana incompleta marcada | Indicador por projeto e semana: % das horas lançadas até 1 dia útil depois do dia trabalhado, e quantas pessoas do plano ainda não lançaram a semana. Semana incompleta ganha selo próprio na ⏱ e na 📈 Tendência e não entra na conta de desvio nem na previsão (R263). Mostrado por projeto, sem ranking de pessoas; a pessoa vê o próprio número no ⏱ Apontar. Depende de o Clockwork devolver a data de criação do lançamento. | avaliacao | Relatório e análise | Entrega (gestão), Hub (pessoa) | 📋 Status report (⏱ e 📈) · 🧭 Disciplina do time | M | Médio | Gestor | — | Runn (lacuna de timesheet), Tempo (aviso de previsão) | Confirmar se a API do Clockwork traz a data de criação do worklog; limiar de "no prazo" |

### 🎫 Higiene dos tickets

| id | Título | Descrição | Estágio | Categoria | Área | Telas | Tam. | Impacto | Valor para | Pré-req. | Referência | Decisão pendente |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R266 | ⏳ Envelhecimento — dias úteis no status atual, com exceções, na 🧭 Pendências e no 📋 Status report | Hoje "parado" é dias corridos desde a última alteração de qualquer campo (`gpCalc`). Passa a existir "N dias úteis neste status" (data da última mudança de status tirada do histórico do ticket — changelog, campo status, lido só para os abertos do projeto, com cache; o `statuscategorychangedate` não serve: só muda quando a categoria muda), com um marcador discreto na linha: cinza até 5, amarelo de 6 a 10, vermelho acima. Não contam como parado: ticket com 🚧 bloqueio aberto, com 🟢 "No prazo" nesta semana, aguardando cliente ou com início no futuro. Comentário e apontamento recentes aparecem ao lado ("último apontamento há 2 d"). É sinal passivo, sem notificação. | planejado | Usabilidade | Entrega (gestão) | 🧭 Pendências · 📋 Status report · 🛠 Tickets do time | P | Médio | Gestor, Consultor | — | Jira "Days in column", Stale Work for Jira, Linear | Limiares (5 e 10) fixos ou os de `cfg.relSemanal.parado` |
| R267 | 🔀 Status incoerente — apontou horas e está "A fazer", concluído que recebeu horas, "Em andamento" sem apontamento | Bloco novo na 🧭 Pendências (e contagem no cockpit) com três regras: horas apontadas na semana em ticket ainda "A fazer"; ticket concluído com apontamento depois da conclusão; "Em andamento" sem apontamento há 5 dias úteis. Cada linha oferece a correção num clique (mover para "Em andamento", reabrir, comentar), com o token da pessoa e as transições que o fluxo aceita. O Jira não tem isso pronto. Dados: `/api/tempo` × `/api/vencimentos?analytics=1`. Nada é mudado sozinho. | planejado | Funcionalidade | Entrega (gestão), Hub (pessoa) | 🧭 Pendências · 🚨 Alertas · ⏱ Apontar (aviso ao apontar) | P | Alto | Gestor, Consultor | — | ScriptRunner/JQL da comunidade Atlassian | Oferecer ao próprio consultor "mover para Em andamento" no momento em que aponta |

### 📋 Status e ritmo semanal

| id | Título | Descrição | Estágio | Categoria | Área | Telas | Tam. | Impacto | Valor para | Pré-req. | Referência | Decisão pendente |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R268 | 📋 Ritmo semanal do status report — lembrete na sexta, resumo na segunda e "não atualizado" como estado | Sexta às 10h o gerente recebe um lembrete (Teams e push) só dos projetos sem situação salva na semana; repete na segunda cedo se continuar. Projeto sem atualização há mais de 7 dias ganha o estado ⚪ "não atualizado" no semáforo, no cockpit e no Dashboard, em vez de manter a cor antiga. Segunda às 8h quem segue o projeto (gestores, negócio, diretoria) recebe um resumo: o que mudou de cor, por quê e o link. Fase nova no cron do `api/teams.js` e tipo de push novo; sem R$ e sem nomes de tickets no push. | planejado | Automação | Entrega (gestão), Teams e bot | 📋 Status report · R262 · 📥 Inbox · ⚙️ Central (preferências) | M | Alto | Gestor, Diretoria, Negócio | R262 (para o estado aparecer junto) | Atlassian Home (sexta/segunda), Linear (atualização perdida) | Dia e hora; quem "segue" por padrão; se AMS entra no ritmo |
| R269 | 🙋 Minha atualização da semana — check-in pré-preenchido do consultor, item a item | Quinta à tarde a pessoa vê, na 🏠 Início e no 📥 Inbox, os seus itens que entram no status report de cada projeto, já com o que o app sabe: horas apontadas, mudança de status e último comentário. Para cada um escolhe 👍 no prazo, 📅 nova data, ⚠ risco ou 🚧 bloqueio, e publica tudo de uma vez pelos mesmos modelos de comentário (`srOkRapido`, `srAcaoExecuta`, `abreBloqueio`). O gerente abre o 📋 na sexta com os itens já atualizados e vê quem ainda não respondeu. Não cria texto novo para a pessoa escrever nem pergunta "o que você fez". | planejado | Funcionalidade | Hub (pessoa), Entrega (gestão) | 🏠 Início (fila) · 📥 Inbox · 📋 Status report | M | Alto | Consultor, Gestor | — (absorve R175 e R251) | Steady, Range, ClickUp AI StandUp | Dia e hora; obrigatório ou só lembrete |
| R270 | 🎤 Modo reunião do status report — percorrer os itens na reunião e sair com tudo atualizado | Botão "▶ Reunião" no 📋 Status report abre a tela cheia: vencidos, bloqueios, semana e próxima semana, um item por vez (o ⏭ `srProximo` já existe), com as ações da linha e um campo de decisão. No fim mostra o que foi atualizado, o que ficou sem dono e copia a ata em texto; as decisões vão para o registro da 🎯 Prioridades. Reusa o modo reunião e o timer do `06-prioridades.js`. Sem gravação nem transcrição de áudio. | avaliacao | Usabilidade | Entrega (gestão) | 📋 Status report · 🎯 Prioridades (decisões) | M | Médio | Gestor, Consultor | — | Spinach, modo reunião da 🎯 Prioridades | Se a ata vai ao Teams ou ao Portal do cliente |

### ⚠ Riscos e previsão

| id | Título | Descrição | Estágio | Categoria | Área | Telas | Tam. | Impacto | Valor para | Pré-req. | Referência | Decisão pendente |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R271 | 🚦 Semáforo com fatores — prazo, horas, bloqueios e escopo explicados, e aviso quando o escolhido diverge | O sugerido (`srSaudeAuto`) hoje olha só vencidos, bloqueados, aguardando e itens sem status report. Passa a somar: execução das horas fora da faixa por 2 semanas, bloqueio 🔴 vencido, marco atrasado ou em risco no 📅 Cronograma e, quando existirem, a previsão de estouro (R263) e o escopo (R273). A tela lista cada fator com os tickets que o causam. Quando o gerente escolhe uma cor mais verde que a sugerida, a tela pede uma linha de motivo e mostra "escolhido 🟢 · sugerido 🔴" a todos. Combate o projeto "melancia" sem tirar a decisão do gerente. | planejado | Funcionalidade | Entrega (gestão) | 📋 Status report · R262 · 📈 Dashboard › 🩺 Saúde | M | Alto | Gestor, Diretoria | — (melhor com R263 e R273; liga ao R200) | Wrike Risk Prediction, Planview, Asana smart status | Motivo obrigatório ou opcional; pesos de cada fator |
| R272 | ⚠ Registro de riscos do projeto — probabilidade, impacto, dono, mitigação e revisão | O campo de texto "Riscos" do status report vira uma lista: descrição, probabilidade e impacto (baixo, médio, alto), dono, ação de mitigação, data de revisão e estado (aberto, mitigando, aconteceu, encerrado). Risco alto × alto ou com revisão vencida entra nos fatores do semáforo e na fila do dono. Mora na linha `sr_<KEY>` (nunca na `cfg`), com a mesma trava por `rev`; o texto antigo vira o primeiro risco. O 🌐 Portal mostra só os marcados "visível ao cliente". Fecha o R18 do catálogo de relatórios. | planejado | Funcionalidade | Entrega (gestão), Portal do cliente | 📋 Status report · 🌐 Portal do cliente · 📚 Central (R18) | M | Médio | Gestor, Cliente, Diretoria | — | Planview, Kantata, matriz clássica de riscos | Guardar no app (linha `sr_`) ou como ticket do Jira com tipo "Risco" |
| R273 | 📐 Escopo do projeto — o que entrou depois da linha de base, em itens e horas | O gerente marca a linha de base do projeto (data; por padrão o início do plano da 💹). A tela mostra, semana a semana, a linha de escopo (itens e horas estimadas criados depois) contra a de concluídos, e a lista "entrou depois" com tipo, quem criou e estimativa. Um ticket pode ser marcado "mudança de escopo" (label `mudanca-escopo`), o que dá a soma de horas para a conversa de aditivo. Dados: data de criação e estimativa que o `/api/vencimentos` já lê. Sem fluxo de aprovação de mudança nem valor em R$. | avaliacao | Relatório e análise | Entrega (gestão), Negócio | 📅 Marcos e Cronograma · 📋 Status report · ficha do 📁 projeto (Evolução) | M | Médio | Gestor, Negócio | R062 (linha de base, a mesma data) | Linear (linha de escopo), Jira Sprint Report, Kantata | Label ou tipo "Change Request" no Jira; AMS fica de fora? |
| R274 | 🎲 Previsão de conclusão em faixa — "85% de chance até dd/mm" pelo ritmo real do projeto | O 📅 Cronograma hoje dá uma data única pela média de 8 semanas (`crLinhas`). A previsão passa a simular o ritmo semanal de conclusões (as fotos `semanal_` guardam concluídos por projeto por até 104 semanas) e responde com três datas: 50%, 85% e 95%. Marco anterior à data de 85% vira fator de risco no semáforo. Com menos de 6 semanas de histórico a tela diz "avaliação preliminar" e não pinta risco. Calculado na tela, sem servidor novo; a data única do `crLinhas` não muda (gate de paridade). | avaliacao | Relatório e análise | Entrega (gestão) | 📅 Marcos e Cronograma · R262 · 🌐 Portal (opcional) | M | Médio | Gestor, Cliente | — | ActionableAgile, Flow Metrics & Forecasting | Mostrar a faixa ao cliente no Portal ou só ao time |

### 💰 Financeiro do projeto

| id | Título | Descrição | Estágio | Categoria | Área | Telas | Tam. | Impacto | Valor para | Pré-req. | Referência | Decisão pendente |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R275 | 💰 Saúde financeira do projeto para o gerente — horas e R$ lado a lado, margem de hoje × margem no término | Um cartão na ficha do 📁 projeto e uma coluna no cockpit: vendido × consumido em horas e em R$, faturável × não faturável dentro do projeto, margem até hoje e margem prevista no término (previsão de horas do R263 × custo do plano). Lê as fotos `rpsem_` e o `rpCalc` da 💹 Rentabilidade, sem conta nova. Custo e margem por projeto, nunca por pessoa; quem não tem papel de gestor, negócio ou diretoria vê só as horas (recorte no servidor, como no Dashboard). Nada disso vai ao Teams ou ao push. | avaliacao | Relatório e análise | Entrega (gestão), Negócio | ficha do 📁 projeto · R262 · 💹 Rentabilidade | M | Alto | Gestor, Negócio, Diretoria | R263; projeto com plano na 💹 | Teamwork (profitability), Kantata, Productive | O gerente de projeto vê R$ e margem, ou só horas e um semáforo financeiro |

## 4. Itens existentes a reescrever (em vez de criar outro)

| id | Por quê | Texto novo sugerido |
|---|---|---|
| R182 | O quadro de semáforos é a primeira fatia do cockpit (R262). | **t:** "📋 Quadro de status reports — visão de todos os projetos para a diretoria, dentro do 🧭 Meus projetos". **d:** "A leitura de todas as linhas sr_<KEY> (só a parte pública: semáforo, resumo, quem e quando atualizou) passa a alimentar o cockpit do R262. Fica aqui só o que é da diretoria: ver todos os projetos, filtrar por categoria e gerente, e a ordem 'parado há mais tempo'." |
| R257 | A fila do gestor na Início deve usar a mesma ordem de urgência do cockpit. | **d (acréscimo):** "Os itens 'projetos em risco' vêm do cockpit (R262) e do semáforo com fatores (R271), com a mesma tabela de pesos; a Início mostra os 3 mais urgentes e leva ao cockpit." |
| R165 (+ R041) | Dois alertas de consumo com regras diferentes; a pesquisa aponta limiar em % e envio em lote. | **t:** "📣 Alerta de consumo das horas do projeto — limiares de 50, 75, 90 e 100% e Δ negativo, em lote ao gerente". **d:** "Uma fase do cron olha cada projeto com horas vendidas (plano da 💹 ou contrato de horas abertas) e avisa o gerente no dia útil seguinte ao cruzar um limiar, uma vez por limiar, repetindo por semana só acima de 100%. Mantém a regra do Δ vendido × gasto negativo por duas semanas. Mensagem com projeto, % e horas, sem R$." O R041 fica só com "remanejar o saldo de um projeto parado para outro". |
| R255 | O alerta de desvio precisa da escada "pessoa primeiro". | **d (acréscimo):** "O alerta vai primeiro à própria pessoa (desvio acima do limite por 2 semanas seguidas); só entra na lista do gerente se continuar na 3ª semana. Semana com apontamento incompleto não dispara." |
| R090 | Cobrança programada sem escada vira cobrança direta do gerente. | **t:** "🧭 Pendências do projeto — lembrete automático em escada: a pessoa primeiro, o gerente depois". **d:** "Vencido, parado (R266) e status incoerente (R267): o responsável recebe um lembrete pessoal no 1º dia útil e outro no 3º; só o que persistir aparece em 'precisa de você' para o gerente no 5º. O gerente escolhe por projeto o que entra e pausa quando quiser. Não lembra ticket com bloqueio aberto ou 'No prazo' na semana." |
| R174 | Falta dizer que a foto por projeto serve à tendência do semáforo. | **d (acréscimo):** "Com a cor escolhida e a sugerida por projeto na foto, o 📋 Status report e o cockpit mostram a faixa das últimas 12 semanas de cada projeto (🟢🟡🔴⚪), para ver a piora gradual." |
| R181 | A IA deve usar mais sinais e mostrar as fontes. | **d (acréscimo):** "O rascunho também lê as horas da semana (`srhCalc`), os bloqueios, os riscos (R272) e o que entrou no escopo, propõe a cor e cita em cada frase os tickets e números de onde tirou. A pessoa sempre confirma." |
| R176 | A regra passa a ter mais fatores (R271). | **d (acréscimo):** "Os limiares dos fatores novos do R271 (execução das horas, dias úteis no status, consumo) entram na mesma configuração por categoria de projeto." |
| R175 | Vira a porta de entrada do check-in (R269). | **d:** "Absorvido pelo R269: o card 'meus itens sem status report' é a entrada do check-in semanal. Fica aqui só a sugestão no ritual 🌅 Planejar do 📆 Hoje." |
| R251 | O "No prazo" em lote passa a ser parte do check-in (R269). | **d (acréscimo):** "O lote do consultor é o R269; fica aqui o lote do gerente e o selo 'no prazo desde'." |
| R115 | Falta a lente do projeto para o gerente. | **d (acréscimo):** "Na 🧭 Pendências, a mesma grade recortada no projeto: as pessoas do projeto nas próximas 2 a 4 semanas, quanto do plano delas é deste projeto, ausências e feriados, e o aviso de conflito quando a soma dos projetos passa da capacidade." |
| R130 | Riscos e mudanças de escopo ganham itens próprios. | **d:** tirar "Change Requests e Riscos como tipos padronizados" e apontar para R272 e R273. |

## 5. Sugestão de ordem (recomendação; a escolha é do dono)

**Pacote 1: "ver tudo e achar o erro" (cerca de 1 semana): R262 + R267 + R266.**
- O cockpit usa só dados que já existem, então não depende de cron, foto nova nem decisão de negócio.
- É a resposta direta ao pedido: o gerente passa a ter uma tela, ordenada por urgência.
- Status incoerente e envelhecimento são pequenos e atacam o "fazendo update dos tickets".

**Pacote 2: "o ritmo da semana" (2 a 3 semanas): R269 + R268 + R271, com as reescritas R090 e R181.**
- Quinta o consultor confirma os itens, sexta o gerente fecha o status report, segunda os interessados recebem o resumo.
- É o que cria o hábito e tira do gerente a cobrança manual.

**Pacote 3: "olhar para a frente" (3 a 4 semanas): R263 + R264 + R165 reescrito, depois R274, R273, R272 e R275.**
- Previsão de horas e alerta de consumo primeiro, porque têm dinheiro envolvido.
- R272, R273 e R275 dependem de decisões do dono (onde guardar o risco, label de escopo, quem vê R$).
- R265 e R270 ficam para depois: o primeiro depende de confirmar um dado do Clockwork, o segundo é conforto.

## 6. Fica de fora de propósito

- **Monitoramento de tela, teclado, mouse ou "nível de atividade".** O próprio fornecedor (Hubstaff) relata desconforto da maioria dos trabalhadores e leitura errada do indicador. O detector do Mac continua só para ligações, por escolha da pessoa.
- **Ranking individual de higiene ou de pontualidade.** Os indicadores novos são por projeto; a pessoa vê o próprio número.
- **Fechar ou mover ticket sozinho** (auto-close do Linear). Com contrato e faturamento por trás, o app só sugere e a pessoa confirma.
- **Resumo diário ao gerente.** A pesquisa mostra que treina a ignorar; já existem o cartão diário do ranking e a DM de sexta.
- **Valor agregado completo (SPI, CPI) e burndown ou velocity.** O Jira da Dexterity não usa sprints nem story points; a previsão por ritmo (R263, R274) entrega a resposta.
- **Semáforo ou status publicado por IA sem confirmação.** A IA redige e a pessoa publica (Asana, Rovo).
- **Lições aprendidas e encerramento do projeto.** É lacuna real, mas não é acompanhamento; continua no R130 e no R075.
- **Grade de capacidade nova.** Já está no R115 e no R111; aqui só a lente do projeto (reescrita do R115).
- **R$ por pessoa em qualquer aviso** (regra do projeto) e funções serverless novas (limite de 12): tudo entra em rotas e fases de cron existentes.


---

# A. Pesquisa de mercado (2025–2026)


**Método e limites.** Fiz cerca de 40 buscas na web. A busca funcionou, mas abrir páginas não: linear.app, help.asana.com e support.atlassian.com não resolvem nesta sessão. As afirmações sobre essas ferramentas vêm dos trechos que a busca devolveu, com a URL indicada. Para eu ler as páginas inteiras, esses domínios precisam ser liberados nas configurações de rede da sessão.

Muitas fontes são do próprio fornecedor (marketing ou ajuda) ou do fórum da Atlassian. Aponto quando é o caso.

Ficaram sem pesquisa própria: Notion Projects, Height, Toggl Track e Scoro (só apareceu um gráfico citado). Não afirmo nada sobre eles.

---

### 1. Uso do tempo do time no projeto (planejado × realizado, consumo do orçamento, previsão de estouro)

**(a) O que o mercado faz**
- **Tempo (Capacity Planner + Timesheets):**
  - O relatório *Planned vs Actual* compara o plano do Planner com as horas lançadas. Variação negativa = gastou mais que o planejado. ([help.tempo.io](https://help.tempo.io/planner/latest/planned-vs-actual-reports))
  - Ele só usa planos feitos no Planner. As datas do Jira não entram.
  - Na aprovação, o gerente vê lado a lado as horas planejadas e as enviadas. ([help.tempo.io](https://help.tempo.io/professionalservices/latest/compare-planned-time-to-actual-time-for-your-proje))
- **Tempo Financial Manager:** EAC = CTD + ETC, ou seja, previsão final = custo até hoje + custo estimado para terminar. ([help.tempo.io](https://help.tempo.io/kb/latest/estimated-cost-calculations))
  - Há dois cenários: pelo desempenho até agora (ritmo de gasto ou % concluído) e pelos custos já conhecidos. ([help.tempo.io](https://help.tempo.io/kb/latest/tempo-budgets-forecasting-scenarios))
  - A Tempo avisa que a previsão só presta se os lançamentos estiverem em dia. ([tempo.io](https://www.tempo.io/products/project-financial-management/project-cost-forecasting))
- **Harvest + Forecast:**
  - Coluna *Delta* = horas agendadas no Forecast − horas lançadas no Harvest. ([support.getharvest.com](https://support.getharvest.com/hc/en-us/articles/28715425906573-Forecast-What-does-Delta-mean-on-the-Team-overview-time-report-and-project-analysis-page))
  - "Horas restantes do orçamento" aparece abaixo das horas futuras agendadas. ([help.getharvest.com](https://help.getharvest.com/forecast/projects/analyzing/future-scheduled-hours))
  - A página do projeto mostra se ele vai estourar e em quanto. ([support.getharvest.com](https://support.getharvest.com/hc/en-us/articles/40050557633677))
- **Harvest, alerta de orçamento:**
  - O gestor escolhe um % do orçamento. O e-mail sai na madrugada seguinte (cerca de 3h, horário do leste dos EUA).
  - Repete toda semana até o projeto ser arquivado ou voltar ao limite. Em orçamento mensal, sai uma vez por mês.
  - ([support.getharvest.com](https://support.getharvest.com/hc/en-us/articles/4407283487629))
- **Runn:**
  - Previsão total = horas lançadas + lançamentos pendentes + trabalho agendado no futuro. Orçamento restante = orçamento − previsão.
  - Tabela de variação por papel e por pessoa. ([help.runn.io](https://help.runn.io/en/articles/10356662-reports-metrics-definitions-calculations-breakdown))
  - Sem lançamento, o Runn assume que o agendado aconteceu. Lacuna de timesheet aparece como linha pontilhada quebrada. ([help.runn.io](https://help.runn.io/en/articles/3777293-timesheets-and-actuals-tracking))
- **Productive:** o gráfico de previsão junta o tempo lançado com as reservas futuras e mostra quando o orçamento vai estourar. Promete "alertas customizados", sem detalhar o limiar. ([help.productive.io](https://help.productive.io/en/articles/4611165-forecasting-profitability-charts-on-budgets), [productive.io](https://productive.io/budgeting/))
- **Everhour:**
  - Limiares de e-mail configuráveis (75/90/100%). Sugere um alerta em 50% para projetos longos.
  - A "proteção de orçamento" pode parar os cronômetros quando o limite passa.
  - ([everhour.com](https://everhour.com/integrations/clickup-budget-threshold), [everhour.com](https://everhour.com/integrations/basecamp-budget-threshold))
- **Scoro:** gráfico de consumo com linha cheia (realizado) e pontilhada (previsto). ([citado em resultado de busca, support.scoro.com](https://support.scoro.com/hc/en-us/articles/18326155777037))
- **Planview / Clarity:** variação de esforço projetada = EAC − linha de base, mostrada como semáforo. ([docs Broadcom Clarity](https://ftpdocs.broadcom.com/cadocs/0/CA%20Clarity%20PPM%2013%203%2000%20%20On%20Demand%20-ENU/Bookshelf_Files/HTML/pmoaccel/1812195.html))

**(b) Padrões**
1. Previsão = **realizado + o que já está agendado**, comparada ao orçamento. O estouro é visto antes de acontecer.
2. Variação **por pessoa e por papel**, não só o total do projeto.
3. Alerta por **% do orçamento**, enviado em lote (no dia seguinte ou por semana), não em tempo real.
4. Lançamento incompleto aparece como **dado faltante** (Runn), e não como zero.

**(c) Armadilhas citadas**
- Previsão ruim quando os lançamentos atrasam (Tempo).
- O Runn, sem lançamento, presume que o plano foi cumprido. É um "verde falso".
- Orçamento por tarefa ignora horas lançadas fora das tarefas orçadas (Harvest).

### 2. Higiene dos tickets (parados, sem estimativa, sem responsável, status incoerente, lembretes)

**(a) O que o mercado faz**
- **Jira Automation (regra montada pelo cliente, não é recurso pronto):**
  - Gatilho agendado + JQL `updated` há mais de N dias + status ≠ concluído → e-mail ao responsável. Exemplos da Atlassian: 2 dias, 7 dias a cada 4 h, e 5 dias "Em andamento" → comentar ou mudar o status.
  - ([support.atlassian.com KB](https://support.atlassian.com/jira/kb/how-to-automatically-send-email-notification-to-assignee-if-a-ticket-is-not-updated-for-a-certain-time/), [confluence.atlassian.com](https://confluence.atlassian.com/jirasoftware/automate-your-project-1688898977.html))
- **Jira, "Days in column":** pontos no cartão que mudam de cor com os dias na coluna. ([community](https://community.atlassian.com/forums/Jira-questions/How-to-add-Days-in-Column-Card-layout-menu-missing/qaq-p/2554688))
  - Problemas relatados: conta fim de semana e zera quando o cartão volta de coluna.
  - O pedido de "destacar acima de X dias" segue aberto. ([JSWSERVER-11704](https://jira.atlassian.com/browse/JSWSERVER-11704))
- **Jira, "Work suggestions":** painel pessoal no quadro que mostra itens "bloqueadores parados". Só a própria pessoa vê. ([support.atlassian.com](https://support.atlassian.com/jira-software-cloud/docs/work-suggestions-on-the-development-page/))
- **App de terceiro, Stale Work for Jira:** gadget com itens abertos sem mudança de status nem comentário há N dias. ([marketplace](https://marketplace.atlassian.com/apps/4192006392/stale-work-for-jira))
- **Linear, auto-close:** fecha itens sem atualização depois de um prazo configurado.
  - Não fecha se o item está num ciclo ativo, num projeto não concluído, tem data futura, SLA ativo ou subtarefas abertas.
  - Os inscritos são avisados. ([linear.app/docs](https://linear.app/docs/archive-issues), [changelog](https://linear.app/changelog/2020-08-19-auto-close-and-auto-archive))
- **Status incoerente (lançou horas mas está "A fazer"):** não achei recurso pronto.
  - A comunidade usa ScriptRunner no evento "Work logged" ou uma JQL agendada `status = open AND timespent > 0`.
  - O gatilho "Issue updated" não dispara com "Log work". ([community](https://community.atlassian.com/forums/Jira-questions/Jira-Auto-start-issue-on-logwork/qaq-p/179937))
- **Clockwork Pro:**
  - O gestor filtra o timesheet por "outliers" (quem trabalhou acima ou abaixo da meta), edita o texto e manda e-mail.
  - O envio é manual, pelo gestor. ([docs.herocoders.com](https://docs.herocoders.com/clockwork/email-notifications-to-users-who-missed-their-work))
  - Tem aprovação de timesheet com trava dos lançamentos. ([herocoders](https://www.herocoders.com/blog/three-ways-to-ensure-up-to-date-timesheets))
  - Lembrete agendado de horas faltantes fica com apps como Worklog Reminder (regra "8h por dia útil"). ([marketplace](https://marketplace.atlassian.com/apps/1232558/worklog-reminder))
- Sem estimativa, sem responsável, sem data: no Jira são **avisos do Plans** ("missing sprint", dependência fora do prazo). ([support.atlassian.com](https://support.atlassian.com/jira-software-cloud/docs/what-are-warnings-in-advanced-roadmaps))

**(b) Padrões**
1. Regra **agendada + consulta + limiar em dias**, e não um evento em tempo real.
2. **O lembrete vai ao responsável** antes de chegar ao gerente.
3. Exceções explícitas: não incomodar item em ciclo ativo, com data futura ou bloqueado (Linear).
4. Visual "passivo" no próprio cartão (envelhecimento) além do lembrete "ativo".

**(c) Armadilhas citadas**
- Contar dias corridos em vez de dias úteis.
- Contador que zera quando o item é retrabalhado.
- Fechar sozinho o que ainda importa (por isso as exceções do Linear).

### 3. Status report periódico

**(a) O que o mercado faz**
- **Atlassian Home (Goals/Projects):**
  - O responsável recebe lembrete **semanal na sexta**. Os seguidores recebem o resumo **na segunda**, na Home e por e-mail, Slack ou Teams.
  - Estados: on track / at risk / off track (+ cancelado, concluído, "não atualizado").
  - A cadência é fixa: semanal para projetos, mensal para metas.
  - ([support.atlassian.com](https://support.atlassian.com/platform-experiences/docs/update-reminders-for-goals-and-projects), [follow](https://support.atlassian.com/platform-experiences/docs/follow-goals-projects-teams-and-topics), [community](https://community.atlassian.com/t5/Atlas-questions/Can-the-cadence-of-project-and-goal-updates-be-changed/qaq-p/2511556))
  - A Atlassian não define oficialmente quando usar cada cor.
- **Linear:**
  - O líder do projeto recebe lembrete na Inbox e novas cobranças 1 e 2 dias úteis depois de perder o prazo.
  - **Atualização perdida aparece no ícone de saúde do projeto.**
  - O Pulse entrega resumo diário ou semanal até 7h, com uma frase-resumo e versão em áudio.
  - ([linear.app/docs/pulse](https://linear.app/docs/pulse), [changelog](https://linear.app/changelog/2025-04-16-pulse))
- **Asana:**
  - Estados On track / At risk / Off track / On hold / Complete.
  - "Draft update with AI" **escolhe o status e redige** a partir dos dados. A pessoa edita antes de publicar.
  - Em portfólio, escolhe quais projetos cobrir e aceita "guidance" (instruções extras).
  - ([asana.com](https://asana.com/features/project-management/status-updates), [help.asana.com](https://help.asana.com/s/article/smart-status))
  - Crítica de usuário: tarefas no prazo não garantem que o projeto não esteja em risco por fatores externos. ([forum.asana.com](https://forum.asana.com/t/new-ai-powered-smart-summaries-for-portfolios/813481))
- **Rovo (Atlassian):** a IA resume, mas **não publica sozinha numa agenda**.
  - O caminho é uma regra semanal do Automation que chama o agente e grava o resultado como comentário ou página do Confluence.
  - ([community](https://community.atlassian.com/forums/Rovo-questions/Using-Rovo-to-Roll-Up-and-Post-Project-Status-Updates/qaa-p/3090729), [atlassian.com](https://www.atlassian.com/software/rovo/use-cases/draft-a-weekly-progress-report))
- **ClickUp Brain:** "Write StandUp" sobre a atividade de uma ou mais pessoas no período (só tarefas públicas) e "project update" sobre espaços ou listas. ([help.clickup.com](https://help.clickup.com/hc/en-us/articles/20011540694551), [help.clickup.com](https://help.clickup.com/hc/en-us/articles/31521204059415-Generate-a-project-update-with-Brain-AI))
- **Planview:**
  - Avaliação de status com vários semáforos por área.
  - O relatório WRK16 mostra a **tendência dos semáforos ao longo do tempo** (até 4 em gráfico + 9 atuais).
  - ([success.planview.com](https://success.planview.com/Planview_Portfolios/Analytics_and_Reporting/FastTrack_Analytics/Work_and_Project_Analytics/WRK16_-_Project_(and_Portfolio)_Status_Report))
- **Teamwork.com:** o relatório de saúde do projeto mostra o % do orçamento usado ao lado do status manual. ([support.teamwork.com](https://support.teamwork.com/projects/reports/using-project-health-reports))

**(b) Padrões**
1. Cadência fixa semanal: **lembrete ao dono no fim da semana, resumo aos interessados no começo da seguinte**.
2. Três cores + "não atualizado" como estado de primeira classe.
3. **A IA redige e sugere o status, mas uma pessoa confirma.**
4. Histórico e tendência do semáforo, não só a foto atual.

**(c) Armadilhas**
- **Projeto "melancia"** (verde por fora, vermelho por dentro). O remédio citado é critério objetivo por cor e conferir contra os dados. ([builtin.com](https://builtin.com/product-management/poisonous-watermelon-project-management-fable), [cio.com](https://www.cio.com/article/4142004/project-management-has-a-status-problem.html))
- Cores sem definição combinada. ([tempo.io](https://www.tempo.io/blog/rag-status))
- Status calculado por máquina ignora fatores externos (Asana).

### 4. Riscos e previsão de entrega

**(a) O que o mercado faz**
- **Wrike, AI Project Risk Prediction:**
  - Risco baixo/médio/alto para os projetos de que a pessoa é dona, com os **fatores** do risco e, no alto, as **tarefas que contribuem**.
  - E-mail semanal.
  - Diz "avaliação preliminar" em projeto recém-iniciado e não calcula acima de 500 dias.
  - ([help.wrike.com](https://help.wrike.com/hc/en-us/articles/360055046934), [wrike.com](https://www.wrike.com/blog/wrike-work-intelligence-ai-project-risk-prediction/))
- **Monte Carlo (apps do Jira: ActionableAgile, Flow Metrics & Forecasting, Agile Monte Carlo Charts):**
  - Usa o histórico de entregas por semana (throughput) e simula milhares de vezes.
  - Responde "quando termina?" e "quantos itens até tal data?" com 50/85/95% de confiança.
  - ([marketplace](https://marketplace.atlassian.com/apps/1216661/actionableagile-analytics-kanban-agile-metrics-forecasts), [scrum.org](https://www.scrum.org/resources/blog/create-faster-and-more-accurate-forecasts-using-probabilities), [marketplace](https://marketplace.atlassian.com/apps/3298816930/flow-metrics-forecasting-cycle-time-kanban-for-jira))
- **Escopo crescendo:**
  - Linear: linha cinza de escopo nos gráficos de ciclo e de projeto, mostrando o que entrou e saiu desde o início; previsão pela velocidade semanal. ([linear.app/docs](https://linear.app/docs/project-graph), [changelog](https://linear.app/changelog/2022-09-22-cycles-and-graph-improvements))
  - Jira Sprint Report: asterisco em item "adicionado depois do início", com falsos positivos conhecidos. ([Atlassian KB](https://confluence.atlassian.com/jirakb/planned-scope-issues-in-sprint-showing-as-scope-change-in-burndown-reports-1095238268.html))
  - Kantata: visão de "At-Risk Projects" que inclui escopo crescendo. ([kantata.com](https://kantata.com/solutions/project-budget-management-software))
- **Dependências:** o Jira Plans avisa quando há dependência fora do prazo e quando dependentes estão no mesmo período. ([support.atlassian.com](https://support.atlassian.com/jira-software-cloud/docs/troubleshoot-warnings-on-your-timeline-in-advanced-roadmaps))

**(b) Padrões**
1. **Risco com explicação** (fatores + itens), nunca só um número.
2. Previsão **em faixa de probabilidade**, não uma data única.
3. Linha de escopo separada da linha de concluído.
4. Aviso de dependência dentro do cronograma.

**(c) Armadilhas**
- O modelo não serve para projeto novo ou longo demais (Wrike).
- O marcador de escopo erra quando a data do sprint não bate (Jira).
- Não achei avaliação independente da precisão das previsões por IA.

### 5. Capacidade e alocação

**(a) O que o mercado faz**
- **Asana Workload:** barra vermelha quando o esforço (horas ou pontos) passa da capacidade semanal da pessoa. Dá para arrastar para reatribuir. ([asana.com](https://asana.com/inside-asana/workload-effort))
- **monday.com Workload:** cor por capacidade e widget que junta vários quadros. Usuários pedem uma visão da conta inteira. ([support.monday.com](https://support.monday.com/hc/en-us/articles/360010166559-Resource-management-with-Workload))
- **ClickUp Workload:**
  - Capacidade por estimativa de tempo e "mostrar tempo lançado ao lado do estimado". ([help.clickup.com](https://help.clickup.com/hc/en-us/articles/30799838221335-Measure-availability-or-capacity-in-Workload-view))
  - Crítica: conta a estimativa cheia, não o que falta. ([feedback.clickup.com](https://feedback.clickup.com/feature-requests/p/dynamic-workload-calculation-based-on-time-remaining-net-effort))
- **Float:**
  - A capacidade já desconta férias aprovadas e feriados.
  - O relatório de pessoas tem horas agendadas × lançadas, horas extras agendadas e lançadas, folga e "não agendado".
  - ([support.float.com](https://support.float.com/en/articles/4385599-people-report))
- **Runn:** utilização faturável e não faturável sobre a capacidade efetiva. Meta sugerida de 70–80% faturável. ([help.runn.io](https://help.runn.io/en/articles/11517169-utilization-dashboard), [runn.io](https://runn.io/blog/billable-utilization))
- **Jira Plans:** capacidade **só do time**. A sobrecarga de uma pessoa só aparece quando estoura a barra do time inteiro. ([community](https://community.atlassian.com/forums/Jira-questions/How-to-identify-capacity-issues-during-sprint-planning-with-Jira/qaa-p/3262757))

**(b) Padrões**
1. Grade pessoa × semana com cor (verde, amarelo, vermelho) contra a capacidade **já sem as férias**.
2. Agendado × lançado na mesma grade.
3. Meta de utilização explícita, separando faturável e não faturável.

**(c) Armadilhas**
- Alocação antiga dá falsa sobrecarga (Float sugere conferir com o lançado).
- Estimativa cheia em vez do restante (ClickUp).
- Capacidade só agregada esconde a pessoa sobrecarregada (Jira Plans).

### 6. Rotina do gerente: tudo num lugar, resumos e standups assíncronos

**(a) O que o mercado faz**
- **Atlassian Home:** feed dos projetos que a pessoa segue + resumo de segunda. ([support.atlassian.com](https://support.atlassian.com/platform-experiences/docs/follow-goals-projects-teams-and-topics))
- **Linear Pulse:** resumo diário ou semanal na Inbox, com cadência padrão definida pelo admin. ([linear.app/docs/pulse](https://linear.app/docs/pulse))
- **Geekbot e Steady (antigo Status Hero):**
  - Perguntas assíncronas no Slack ou Teams ("o que fez / o que bloqueia").
  - O Steady **anexa ao check-in as atualizações de tickets do Jira** da pessoa.
  - ([marketplace](https://marketplace.atlassian.com/apps/1225763/steady-for-jira-formerly-status-hero), [geekbot.com](https://geekbot.com/))
- **Range:** check-in com humor (emoji vermelho/amarelo/verde), *flags* de bloqueio que avisam um canal e itens puxados de mais de 75 apps. ([range.co](https://www.range.co/product/flags), [range.co](https://www.range.co/product/mood-sharing))
  - Crítica de usuário: o check-in repete o que já está na ferramenta de projeto. ([g2.com](https://www.g2.com/products/range/reviews?page=2))
- **Spinach:** depois da reunião, liga tickets citados, sugere tickets novos e **propõe atualizações nos tickets do Jira** a partir do que foi decidido. ([marketplace](https://marketplace.atlassian.com/apps/1231257/spinach-io-your-ai-scrum-master))
- **ClickUp:** cartão "AI StandUp" com os 7 dias da própria pessoa. ([help.clickup.com](https://help.clickup.com/hc/en-us/articles/21021454281239))

**(b) Padrões**
1. **O sistema monta o rascunho a partir da atividade** e a pessoa só complementa.
2. Resumo com hora fixa (segunda de manhã ou 7h).
3. Bloqueio como sinal de primeira classe, com canal de ajuda.

**(c) Armadilhas**
- Resumo diário para todos os interessados treina as pessoas a ignorar. Recomenda-se semanal para quem supervisiona, filtrado por papel, e alerta crítico fora do resumo. ([profit.co](https://www.profit.co/blog/project-management/how-to-design-a-project-portfolio-management-notification-system-that-people-actually-trust/), [knock.app](https://knock.app/template-library/workflows/alert-digest))
- Standup assíncrono só funciona se alguém lê e resolve o bloqueio no mesmo dia (comentário em resultado de busca, sem URL específica: sem fonte).

### 7. Saúde financeira do projeto para o gerente

**(a) O que o mercado faz**
- **Teamwork.com:** painel de lucro, custo e margem contra a meta. Margem = (orçamento − custo até hoje) ÷ orçamento. ([support.teamwork.com](https://support.teamwork.com/projects/project-budgets/project-profitability))
- **Kantata:** painel de saúde com receita, prazo, recursos, orçamento e custo; placar do portfólio; gasto acima do orçamento em vermelho. ([knowledge.kantata.com](https://knowledge.kantata.com/hc/en-us/articles/360035090374))
- **Productive:** o gráfico de previsão mostra também se o projeto continua lucrativo enquanto o orçamento é consumido. ([help.productive.io](https://help.productive.io/en/articles/4611165-forecasting-profitability-charts-on-budgets))
- **Harvest:** previsão de estouro também em orçamento por valor. ([blog.getharvest.com](https://blog.getharvest.com/2015/07/forecasted-project-health-now-supports-fee-based-budgets/))
- **Everhour:** orçamento por hora, valor fixo ou não faturável; o alerta deve trazer a divisão faturável × não faturável. ([everhour.com](https://everhour.com/integrations/basecamp-budget-threshold))

**(b) Padrões**
1. Orçamento em **horas e em dinheiro** lado a lado.
2. Margem atual × margem prevista.
3. Faturável × não faturável dentro do mesmo projeto.

**(c) Armadilhas**
- Valor com permissão separada (Teamwork exige permissão de orçamento).
- Promessas de IA financeira ("AI Forecaster", Teamwork) sem verificação independente.

### 8. Ideias diferenciadas

- **Índices de saúde (Kantata):** "Pace" e "Execution"; o quadrado fica vermelho abaixo de 1. ([knowledge.kantata.com](https://knowledge.kantata.com/hc/en-us/articles/360035090374))
- **Linear:** "saúde" do projeto que também reflete **disciplina de reporte** (atualização perdida). ([linear.app/docs](https://linear.app/docs/initiative-and-project-updates))
- **Productive:** relatório de saúde por IA que mostra **os dados e as fontes** de cada conclusão, para auditar. ([thedigitalprojectmanager.com](https://thedigitalprojectmanager.com/productivity/productive-ai-features/))
- **Timely:** rastreio automático numa linha do tempo **privada**; o gestor só vê o que a pessoa lança. ([timelyapp.com/privacy](https://timelyapp.com/privacy))
- **O contraponto, Hubstaff:** capturas de tela a cada ~10 min e contagem de teclado e mouse. ([techradar](https://www.techradar.com/reviews/hubstaff))
  - O próprio fornecedor cita 59% de trabalhadores desconfortáveis com monitoramento e alerta que o "activity score" é mal interpretado e mina a confiança. ([hubstaff.com](https://hubstaff.com/blog/common-hubstaff-misconceptions/))
- **Comparar com projetos parecidos:** o Wrike diz usar padrões históricos (é afirmação de marketing). Não achei recurso documentado de comparação com projetos semelhantes (sem fonte).

---

### Ideias candidatas para o Dexterity Hub

O Hub já tem partes de várias dessas ideias: 📋 Status report, ⏱ Horas da semana e 📈 Tendência, 🚧 Bloqueios, 🧭 Disciplina, 💹 Rentabilidade e 📊 Dashboard de KPIs. As ideias abaixo são as que o mercado faz e que completariam isso.

1. **Previsão de estouro do projeto.** O que é: realizado (Clockwork) + restante planejado (plano semanal / vendido) contra o orçamento, com a data prevista de estouro. Por que ajuda: o gerente vê o estouro antes de acontecer. Referência: Tempo FM, Harvest+Forecast, Runn, Productive.
2. **Alerta de % do orçamento.** O que é: limiares (50/75/90/100%), enviados ao gerente no dia seguinte e repetidos por semana enquanto continuar acima. Por que ajuda: aviso sem barulho. Referência: Harvest, Everhour.
3. **Variação por pessoa e por épico.** O que é: tabela planejado × apontado × diferença por consultor e por épico do projeto. Por que ajuda: mostra onde o tempo vazou. Referência: Runn, Tempo Planned vs Actual.
4. **"Lançamento faltando" ≠ "zero horas".** O que é: célula própria para semana sem apontamento, fora da conta de desvio. Por que ajuda: evita o verde falso. Referência: Runn.
5. **Tickets parados do projeto.** O que é: lista "sem atualização há N dias úteis" (status, comentário ou worklog), contando só dias úteis e com exceções (bloqueio aberto, data futura). Por que ajuda: higiene sem caçar à mão. Referência: Jira Automation, Linear auto-close, Stale Work.
6. **Status incoerente.** O que é: avisar "apontou horas mas está em A fazer" e "concluído com horas depois da conclusão"; oferecer mudar o status num clique. Por que ajuda: o Jira não faz isso nativamente. Referência: ScriptRunner/JQL da comunidade.
7. **Lacunas de cadastro.** O que é: contagem por projeto de abertos sem responsável, sem data ou sem estimativa, com atalho para corrigir em lote. Por que ajuda: o plano depende disso. Referência: avisos do Jira Plans.
8. **Lembrete ao responsável primeiro.** O que é: lembrete pessoal (Teams ou push) uma vez; só o que persistir sobe ao gerente. Por que ajuda: menos cobrança direta do gerente. Referência: Linear (1 e 2 dias úteis), Atlassian Home.
9. **Envelhecimento no cartão.** O que é: indicador de dias úteis no status atual, na lista do gerente. Por que ajuda: sinal passivo, sem notificação. Referência: Jira "Days in column".
10. **Ritmo semanal do status report.** O que é: lembrete na sexta ao gerente do projeto e resumo na segunda aos interessados; "não atualizado" vira estado visível. Por que ajuda: cria o hábito. Referência: Atlassian Home, Linear.
11. **Rascunho do status por IA.** O que é: a IA lê a semana (itens, horas, bloqueios, escopo novo) e propõe semáforo + texto com as fontes citadas; o gerente confirma. Por que ajuda: poupa tempo e mostra o porquê. Referência: Asana smart status, Rovo, Productive.
12. **Critério objetivo para as cores.** O que é: regra escrita para verde, amarelo e vermelho (prazo, consumo, bloqueios vencidos), com aviso quando o semáforo manual diverge da regra. Por que ajuda: combate o "melancia". Referência: guias de semáforo, Planview.
13. **Tendência do semáforo.** O que é: linha do tempo das cores semana a semana, por projeto. Por que ajuda: mostra a deterioração gradual. Referência: Planview WRK16.
14. **Risco explicado.** O que é: "em risco porque…" com os fatores (vencidos, bloqueio 🔴, consumo, escopo) e os tickets que causam. Por que ajuda: o gerente vê onde agir. Referência: Wrike.
15. **Escopo crescendo.** O que é: linha de escopo (itens ou horas criados depois da linha de base) × concluídos por semana. Por que ajuda: torna visível a conversa de aditivo com o cliente. Referência: Linear, Jira Sprint Report, Kantata.
16. **Previsão de conclusão em faixa (Monte Carlo).** O que é: com o throughput semanal do projeto, "85% de chance de terminar até dd/mm". Por que ajuda: evita prometer uma data única. Referência: ActionableAgile, Flow Metrics.
17. **Grade de capacidade entre projetos.** O que é: pessoa × semana, alocado em todos os projetos contra a capacidade menos férias e feriados; vermelho acima de 100%. Por que ajuda: mostra conflito de alocação. Referência: Float, Asana Workload, monday.
18. **Utilização faturável.** O que é: % faturável e não faturável por pessoa contra uma meta (ex.: 75%). Por que ajuda: sinaliza margem cedo. Referência: Runn, Teamwork.
19. **Margem prevista do projeto.** O que é: margem atual e no fim (custo/h × horas previstas), sem detalhe de controladoria. Por que ajuda: decisão rápida. Referência: Teamwork, Kantata, Productive.
20. **"Meus projetos" do gerente.** O que é: uma tela com os projetos que ele gerencia: semáforo, consumo, parados, bloqueios, status atrasado, ordenada por urgência. Por que ajuda: tudo num lugar só. Referência: Atlassian Home, Kantata.
21. **Resumo semanal no Teams.** O que é: um resumo por gerente na segunda (só o que mudou e o que pede ação), sem resumo diário; alertas críticos fora do resumo. Por que ajuda: evita cansaço de notificação. Referência: Linear Pulse, boas práticas de resumo.
22. **Check-in assíncrono pré-preenchido.** O que é: o consultor recebe "o que você fez", montado dos worklogs e transições, e só marca bloqueio ou risco. Por que ajuda: dado sem retrabalho. Referência: Steady, Range.
23. **Reunião → atualização de tickets.** O que é: depois da reunião de status, sugerir os tickets a atualizar (data, status, comentário) a partir do que foi falado. Por que ajuda: fecha o ciclo da reunião. Referência: Spinach.
24. **Saúde do reporte.** O que é: indicador por projeto de "% de tickets atualizados na semana" e "% de horas lançadas no prazo". Mostrado ao time, não como ranking individual. Por que ajuda: mede higiene sem vigiar. Referência: ícone de saúde do Linear.
25. **Política explícita de não vigiar.** O que é: nada de tela, teclado ou atividade; só ticket e apontamento, e a pessoa vê o mesmo número que o gerente. Por que ajuda: preserva a confiança. Referência: Timely (contraponto: Hubstaff).
