# 🧭 Menus das áreas por seção — decisão de desenho (2026-11-05)

Pedido do usuário: *"organize mais explicitamente os menus, como o Meu trabalho — em Projetos um sub-menu para
Portfólio e ficha, Marcos e Cronograma, Status report, e assim em diante; estou com dificuldade de achar as
informações"*.

## Como a decisão foi tomada

Um modelo mais forte escreveu o plano (`menus-plano/plano-fable.md` no scratchpad da sessão, com inventário, desenho,
decisões e 5 tarefas) e um modelo mais barato o executou: T1 markup + CSS, T2 JS, T3 teste Playwright, T4 guias/tour/Ajuda/
Novidades/Roadmap, T5 documentação. O molde foi o do 👤 Meu trabalho (`docs/menu-meu-trabalho-2026-10-27.md`).

## O problema

Antes, cada área tinha 4 a 6 linhas, uma por **grupo** de abas. As telas-irmãs (📅 Marcos e Cronograma, 📋 Status
report, 🔎 Qualidade, 🏆 Ranking, 🤝 Parcerias, 📈 Analytics…) só apareciam na barra `#abas` depois de abrir a tela
principal — quem não sabia o grupo não achava a informação. O 👥 Dia do time não estava em menu nenhum.

## Regra de leitura (Ajuda, tour e CLAUDE.md)

O 👤 é organizado por **intenção** (verbo + objeto). As áreas são organizadas por **informação**:

- a linha diz **a tela e o que você acha nela** (`📁 Projetos: portfólio e ficha`, `🚨 Alertas: atrasados e críticos`);
- **linha recuada** (`.nav-sub`) = **aba da tela de cima**;
- **"…" no fim** = o app pergunta o **projeto** antes (`data-acao`).

Cabeçalho: `Dexterity <Área> · <público> · onde está cada informação`. Os rótulos reusam as palavras do título da aba
(`ABAS.rot`) para o menu e a barra de abas dizerem a mesma coisa.

## O inventário depois

### Dexterity Entrega (gestores de entrega e PMs)

| Seção | Linha | Abre |
| --- | --- | --- |
| PROJETOS | 📁 Projetos: portfólio e ficha | `projetos` |
| | ↳ 📅 Marcos e Cronograma | `cronograma` |
| | ↳ 📋 Status report do projeto | `statusrep` |
| | ↳ 🧭 Pendências do projeto | `gp` |
| | 🔎 Abrir a ficha de um projeto… | seletor → ficha (`acao:projficha`) |
| TICKETS E ALERTAS | 🛠 Tickets do time: ações em massa | `gestao` |
| | ↳ 📋 Lista do período | `tickets` |
| | ↳ 🔎 Qualidade dos tickets (IA) | `qualidade` |
| | ↳ ✅ Regras TI-04-014 (auditoria) | `audit` |
| | 🚨 Alertas: atrasados e críticos | `alertas` |
| HORAS E REUNIÕES DO TIME | ⏱ Horas do time: Timesheet | `timesheet` |
| | ↳ 🏆 Ranking de apontamento | `ranking` |
| | 🗂 Reuniões: reclassificar | `reclassificar` |
| | ↳ 🔗 Vincular reuniões a tickets | `reuvinc` |
| | 👥 Dia do time (📆 Hoje) | `hojetime` |
| CLIENTE | 🌐 Portal do cliente | `portal` |

### Dexterity Negócio (comercial, financeiro e controladoria)

| Seção | Linha | Abre |
| --- | --- | --- |
| CONTRATOS | 📑 Contratos: clientes | `admin` |
| | ↳ 🤝 Contratos de parceria | `parcerias` |
| APURAÇÃO E FATURAMENTO | 🛡 Apuração de contratos: AMS | `ams` |
| | ↳ 💰 Bolsa de horas & projetos | `receita` |
| RESULTADO | 💹 Rentabilidade de projetos | `rentab` |
| | 🏦 Controladoria de projetos | `controladoria` |

### Dexterity Insights (diretoria e governança)

| Seção | Linha | Abre |
| --- | --- | --- |
| VISÃO EXECUTIVA | 📊 Visão Geral: painel executivo | `visao` |
| | ↳ 🧠 Resumo (KPIs + IA) | `resumo` |
| RELATÓRIOS | 📚 Central de Relatórios (R01–R29) | `relatorios` |
| | ↳ 📈 Analytics (26 visões) | `analytics` |
| | ↳ 📈 Métricas por tipo de projeto | `metricas` |
| | ↳ 📊 Relatório semanal de sexta | `semanal` |
| PLANEJAMENTO E USO | 📊 Planejamento do time: por gestor | `planrel` (`data-aud="gestor"`) |
| | ↳ 👔 Visão executiva | `planrel` (`data-aud="exec"`) |
| | ↳ 📁 Por projetos | `planrel` (`data-aud="proj"`) |
| | 📊 Uso do painel | `uso` |

O `data-aud` explícito nas três linhas do planejamento faz o realce acender só a linha da audiência atual.

## Decisões

1. **Toda linha de tela leva `data-exata` e `title`** — o rótulo diz a tela (a memória de abas não troca o destino) e o
   tooltip diz o que se acha ali. Links, ⭐ e Ctrl+K não mudam.
2. **🧭 Pendências do projeto mudou para o grupo 📁 Projetos** (4ª aba, ao lado do 📋 Status report). É a visão do
   gerente DO projeto e já conversa com o status report. Custo: uma entrada no `ABAS` e os rótulos "🛠 Tickets do time › 🧭"
   viraram "📁 Projetos › 🧭".
3. **Só uma linha "…"**: `🔎 Abrir a ficha de um projeto…`. A ficha é a 🦴 espinha (contrato, parceria, plano,
   cronograma, execução, apuração, resultado), a porta mais curta para "a informação deste projeto". Status report,
   Cronograma, Pendências e Portal já têm seletor na própria tela (R178 avalia mais linhas).
4. **Títulos das abas (`ABAS.rot`) não foram renomeados** — guias, tour, Ajuda, NAVCAT e testes clicam por esses textos
   (R155, reescrito para todos os grupos).
5. **👥 Dia do time entrou em Entrega**, que antes não estava em menu nenhum; segue como aba do 📆 Hoje.
6. **Contadores nas linhas** (`navMenuContadores`): o mesmo número que a aba mostra (`ABAS_N`), pintado ao abrir o menu,
   só com dado já carregado — nada é buscado por causa do menu. Linhas com `data-aud` ficam sem (R177 amplia).
7. **Menu perto da borda direita** (Insights) alinha à direita do botão (`navMenuAltura`); no celular as linhas da gaveta
   têm 44 px de altura (`mobile.css`).

## Fora de propósito

Renomear os títulos das abas (R155) · linhas "…" para as outras telas por projeto (R178) · ⋯ Mais (já tem seções) ·
`meudia` · cliques por linha no 📊 Uso do painel (R179).

## Riscos acompanhados

- **Largura a 360 px:** rótulos de até ~34 caracteres; o teste mede a altura de cada linha na gaveta.
- **Memória de abas:** `data-exata` evita que a linha da tela principal abra a última aba vista.
- **Lente:** `aplicaLente` continua sendo só lente, nunca permissão; para quem não é gestor, o 👥 Dia do time não força a
  área Entrega a aparecer.

## Teste

`menus-test.mjs` (Playwright, 171 casos): estrutura, honestidade do recuo, cobertura das VISTAS, navegação e realce
linha a linha, audiência, `data-exata`, seletor de projeto, lente, altura e borda no desktop, contadores, celular a
360 px com alvos ≥ 44 px e teclado. Mora no scratchpad `status-plano/`, ao lado do `roda.sh`.
