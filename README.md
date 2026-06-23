# Dexterity · Insights de Uso (Jira + Clockwork)

Painel interno que dá visibilidade ao time sobre o uso do Jira: horas apontadas
(Clockwork) e atividade (tickets tocados, alterações, transições, comentários, criações)
por pessoa, com filtros por categoria de projeto, projeto e tipo, e recorte faturável
vs. não-faturável. Janelas: hoje, 7 dias e 30 dias.

## Como funciona (arquitetura)

Front estático (`public/`, **sem build**) + funções serverless no Vercel. O Vercel
serve `public/` na raiz e cada arquivo em `api/*.js` vira um endpoint.

**Leitura** (conta de serviço, via variáveis de ambiente — nunca no navegador):

- `GET /api/tempo` — apontamentos do **Clockwork** na janela; resolve projeto/tipo no Jira e classifica faturável.
- `GET /api/atividade` — issues atualizadas no **Jira** com changelog → eventos por **autor da alteração**.
- `GET /api/vencimentos` — issues com vencimento/sem responsável (central de alertas).
- `GET /api/projetos`, `GET /api/usuarios` — metadados (projetos/pessoas) para filtros e formulários.
- `GET|POST /api/config` — config compartilhada do time (metas/ausências/contratos) e o **painel do cliente** (`?portal=<token>`). A **gravação exige token do Jira** (cabeçalhos `X-Jira-Email`/`X-Jira-Token`).
- `POST /api/resumo` — resumo executivo por IA (Anthropic).
- `POST /api/teams` — relatório diário de apontamento no Teams (cron via GitHub Actions).

**Escrita com o token da própria pessoa** (enviado por requisição, nunca persistido):

- `POST /api/apontar` — apontamento (Clockwork) + convites de reunião.
- `POST /api/transicao` — transição de status, reagendar, atribuir, comentar.
- `POST /api/criar` — criação de issues (planejamento em lote).
- `POST /api/reunioes` — mover/reclassificar issues entre projetos/tipos.

Os tokens de serviço ficam só nas variáveis de ambiente do servidor — nunca no navegador
(a chave do Supabase também é usada apenas no servidor). Front e funções no mesmo domínio: sem CORS.

```
api/
  _lib/util.js     datas (America/Sao_Paulo), cache, fetch do Jira/Clockwork, heurística faturável
  tempo.js atividade.js vencimentos.js projetos.js usuarios.js   (leitura)
  config.js resumo.js teams.js                                   (config/IA/cron)
  apontar.js transicao.js criar.js reunioes.js                   (escrita c/ token da pessoa)
public/
  index.html       dashboard (marca Dexterity, gráficos em CSS/SVG, modo escuro, filtros)
  portal.html      painel somente-leitura do cliente (AMS), escopado por token
scripts/
  check-syntax.mjs gate de sintaxe (npm run check) — roda na CI antes do deploy
```

> Sem build não há bundler para pegar erros: rode **`npm run check`** (ou deixe a CI rodar)
> para validar a sintaxe de `api/**` e do JS embutido nos HTML antes de publicar.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `JIRA_BASE_URL` | sim | `https://dexterityit.atlassian.net` |
| `JIRA_EMAIL` | sim | e-mail da conta admin do Jira |
| `JIRA_API_TOKEN` | sim | token de API do Jira |
| `CLOCKWORK_API_TOKEN` | sim | token da API do Clockwork (Pro) |
| `CACHE_TTL_MIN` | não | minutos de cache no servidor (padrão 20) |
| `NAO_FATURAVEL_REGEX` | não | regex que marca o tipo como **não faturável** — testada no **nome _e_ na descrição** do tipo de issue (padrão `n[aã]o.{0,4}fatur`, que cobre "não faturável", "não-faturavel" e "não é faturável") |
| `JIRA_CF_CHAMADO_CLIENTE` | não | id do campo Jira "Número do Chamado Cliente" exibido na aba AMS (padrão `customfield_10270`) |
| `JIRA_CF_CAUSA_RAIZ` | não | id do campo "Causa Raiz" usado nos relatórios da aba AMS (padrão `customfield_10759`) |
| `JIRA_CF_PRODUTO` | não | id(s) do campo "Produto" (relatórios AMS) — aceita vários separados por vírgula, usa o 1º preenchido (padrão `customfield_10766,customfield_10760`) |
| `JIRA_CF_PROCESSO` | não | id(s) do campo "Processo" (relatórios AMS) — aceita vários separados por vírgula, usa o 1º preenchido (padrão `customfield_10765,customfield_10761`) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | não | config compartilhada (`jirainsight_config`) e convites de reunião (`jirainsight_convites`) |
| `TEAMS_WEBHOOK_URL` | não | webhook do canal: relatório diário de apontamento e aviso de convites de reunião |
| `CRON_SECRET` | não | se definida, `/api/teams` exige `Authorization: Bearer <segredo>` (use o mesmo valor no secret do GitHub Actions) |
| `CLOCKWORK_ESCRITA` | não | `1` ativa o modo direto: ao convidar, tenta criar o worklog dos convidados via API do Clockwork (autor explícito); se a API recusar, o convite segue pendente (fallback automático) |
| `ANTHROPIC_API_KEY` | não | chave da API da Anthropic (Claude) — habilita o **resumo das atividades por IA** na aba Resumo (`/api/resumo`). Sem ela, o card explica como configurar |
| `ANTHROPIC_MODELO` | não | modelo usado no resumo por IA (padrão `claude-opus-4-8`) |
| `ODOO_URL` | não | base do Odoo (ex.: `https://suaempresa.odoo.com`) — habilita o botão **🌴 Folga** na aba Resumo (`POST /api/resumo?acao=folga`) |
| `ODOO_DB` | não | nome do banco (database) do Odoo |
| `ODOO_LOGIN` | não | login da **conta de serviço** que cria as folgas (precisa de direitos de Time Off) |
| `ODOO_API_KEY` | não | API Key do Odoo (Preferências → Conta → Segurança) ou a senha da conta de serviço |
| `ODOO_FOLGA_TIPO_ID` | não | id (número) **ou** nome do *Tipo de ausência* (`hr.leave.type`) usado nas folgas, ex.: `Compensação de horas` |

### Convites de reunião (apontamento em grupo)

Reuniões que valem para várias pessoas: quem organizou usa **👥 Apontar reunião
p/ várias pessoas** na aba ⏱ Apontar (o próprio worklog sai na hora) e os demais
confirmam o convite com **1 clique** — o worklog de cada um é criado **com o token
da própria pessoa**, preservando o modelo de segurança. Os convites ficam na tabela
`jirainsight_convites` do Supabase (colunas: grupo, issue, resumo, segundos, inicio,
comentario, criado_por, account_id, nome, status `pendente|confirmado|recusado|direto`,
worklog_id, erro).

### 🌴 Folga / compensação de horas extras (Odoo)

Na aba **Resumo**, a tabela **Por pessoa** mostra a coluna **Meta** (horas apontadas ÷
meta esperada no período). **Acima de 100% não é problema** — é sinal de quem trabalhou
além do previsto, então fica em **verde**. Quando alguém acumula, em média, **mais de
6h extras por semana** (extra = horas − meta esperada, normalizado pelo nº de semanas do
período), aparece o botão **🌴 Folga**. Ele abre um mini-formulário (data + meio período /
dia(s) / nº de horas) e chama `POST /api/resumo?acao=folga` (consolidado nessa rota por
causa do limite de **12 Serverless Functions** do plano Hobby), que cria uma **solicitação
de Time Off no Odoo** (`hr.leave`) **para a pessoa** — localizada pelo **e-mail de trabalho**
(ou pelo nome, como fallback). Usa a API externa do Odoo (JSON-RPC) com uma **conta de serviço**.
Requer `ODOO_URL`, `ODOO_DB`, `ODOO_LOGIN`, `ODOO_API_KEY` e `ODOO_FOLGA_TIPO_ID` (id ou
nome do tipo de ausência). Sem essas variáveis, o formulário avisa que falta configurar.

### 📊 Visão Geral (tela executiva — inicial)

Aba **Visão Geral** (a **tela inicial** do painel): responde, num só lugar, "como está a
entrega?" — reaproveitando os dados que já temos (sem nova função serverless):

- **KPIs executivos:** apontamento do time (% da meta), horas apontadas, alertas críticos,
  pessoas em dia e tickets vencidos. *(Os indicadores de **AMS/contratos** vivem só na aba
  **AMS & Governança** — ver abaixo — e não aparecem mais na Visão Geral.)*
- **🚦 Saúde da entrega:** vencidos · vencem hoje · sem responsável · abaixo da meta (cada
  cartão leva à aba correspondente).
- **⏱ Apontamento do time:** donut da meta + **gráfico de área (horas por dia)** + lista de
  "quem mais precisa apontar".
- **🚨 Alertas críticos** (top do motor de alertas) com link para o detalhe.

Cada bloco é **acionável**: clicar leva direto à aba de detalhe (Alertas, Timesheet…).

### Gráficos modernos e interativos

Motor de **séries temporais premium** feito à mão em SVG (sem dependências/CDN — `tsChart()`),
estilo "Bloomberg":

- **Crosshair** que segue o cursor + **readout** flutuante (data + valor de cada série), com
  pontos destacados e **multi-séries** (linha/área, gradiente, linha de meta tracejada).
- Posicionamento dos overlays por **porcentagem do viewBox** (não distorce ao esticar) e
  **animação de traçado** que respeita `prefers-reduced-motion`. **Toque** suportado.
- Aplicado em **Horas por dia** (Visão Geral + Resumo, com **clique = drill-down do dia**) e no
  **burn-up do ciclo de AMS** (consumo acumulado × pacote contratado) na aba Receita.

**Treemap interativo** (`treemap()`, squarified) para distribuição — área proporcional ao valor,
rótulo por célula, realce no hover e clique para drill-down. Usado em **Top projetos por horas** e
**Atividade por tipo** (Resumo) e na **classificação por causa** (portal do cliente).

Complementam: **donut/medidor** para metas e **barras com realce** (a barra focada destaca, as
demais esmaecem) clicáveis para drill-down.

### 🌙 Modo escuro

Botão **🌙/☀️** no topo alterna entre claro e escuro; a preferência fica salva em `localStorage`
(`jirainsight_theme`) e é aplicada cedo no `<head>` para evitar "flash". Implementado por
**variáveis de tema** (`[data-theme="dark"]` sobrescreve `--offwhite/--grafite/--cartao/--linha/
--muted/--trilho/…`), então todas as telas, tabelas, gráficos e campos adaptam as cores.

### 🩺 Score de saúde da entrega

Na **Visão Geral**, um **score 0–100** (donut + componentes) resume a saúde da operação:
média ponderada de **Apontamento** (40%), **Prazos** (vencidos/vencem hoje, 30%) e **Alertas**
críticos (30%). Faixas: ≥80 **Saudável** · 60–79 **Atenção** · <60 **Crítico**. Cada componente
é clicável e leva ao detalhe. *(O componente de AMS saiu do score — AMS é exclusivo da aba
AMS & Governança.)*

### 🖨 Exportar PDF

Botão **🖨 PDF** no topo gera um **relatório da tela atual** via impressão do navegador
(*Salvar como PDF*): um `@media print` força o **tema claro**, esconde a navegação/controles e
adiciona um **cabeçalho** (logo + título da visão + período + data/hora), evitando quebras no meio
dos cartões. Funciona em qualquer aba (ideal na Visão Geral).

### Navegação e novidades

- **Menu por função:** o topo é organizado em **Visão Geral** (inicial) + 3 grupos com
  dropdown — **Análise** (Resumo, Timesheet, Ranking, Tickets), **Operação** (Apontar,
  Planejar, Reclassificar) e **AMS & Governança** (AMS, Receita, Alertas, Admin). Cada item usa
  **ícones de linha** (SVG monocromático, sprite `#ic-*`) em vez de emojis, para um visual mais
  profissional. O grupo da aba ativa fica sublinhado; o selo de convites aparece também no
  cabeçalho de **Operação**.
- **Logo (canto superior esquerdo):** a **marca Dexterity** (pinwheel oficial em SVG, `public/logo.svg`) — clicável, volta para o início (Visão Geral).
- **✨ Novidades:** botão no topo abre a lista do que há de novo (com indicador quando há algo não visto; persiste em `localStorage`).
- **↑ Topo:** botão flutuante que aparece ao rolar e volta ao topo da página.
- **Aba ⏱ Apontar:** lista **agrupada por projeto** com cabeçalho **clicável** (expande/recolhe; “Expandir/Recolher todos”) e **ícones do Jira** para tipo (épico/tarefa/bug…) e prioridade (`/api/vencimentos` devolve `tIcon`/`prioIcon`).

### 🔎 Timesheet — drill-down por dia

Na aba **Timesheet**, o **total de horas de uma pessoa num dia** (qualquer célula com horas) é
**clicável** — abre um modal com as **horas por projeto** daquele dia; cada projeto expande
(`<details>`) para os **chamados** que somam essas horas, com link **↗ para o Jira**. A coluna
**Total** também é clicável e abre o mesmo detalhamento para o **período inteiro**. Tudo no
cliente, a partir dos worklogs já carregados (`estado.tempo.worklogs` + `resumos`), respeitando
os filtros atuais — sem nova chamada ao servidor.

### 🏅 Ranking — reforço visual

No **Ranking de apontamento**, quem está **em dia** ganha um destaque **comemorativo**
(estrelinhas que cintilam + medalha pulsante, em dourado) e quem **não apontou nada** no
período ganha um efeito de **decepção** (cinza dessaturado + "chuvinha" + leve balanço). Tudo em
CSS e **respeita `prefers-reduced-motion`** (sem animação para quem pediu menos movimento).

> O filtro global **"Ocultar rotinas e reuniões automáticas"** foi **removido** (não fazia
> sentido manter): as horas de rotinas/reuniões agora entram normalmente nas visões.

### ⚙️ Administração — Contratos & Valores

Aba **Admin**: cadastro de **clientes/contratos** que destrava AMS e Receita.
Para cada contrato: **cliente**, **tipo** (AMS / bolsa de horas / projeto),
**valor-hora (R$)**, **vigência** e os **projetos do Jira** mapeados ao cliente.

> **Só projetos da categoria AMS** aparecem para mapear (categoria do Jira que contém
> "AMS", ex.: *"DAMS | Dexterity - AMS"*). Projetos já marcados num contrato continuam
> listados mesmo que sejam de outra categoria (não se perde mapeamento antigo).

Para o tipo **AMS** há um bloco extra de parâmetros do contrato:

- **Apuração (ciclo):** mensal / **trimestral** / semestral / anual — define a janela de
  controle e o reset do banco de horas.
- **Horas por ciclo** (ex.: 60), **mínimo mensal** (ex.: 20) e **teto mensal** (ex.: 60).
- **Banco de horas dentro do ciclo:** o saldo não consumido vale até o fim do ciclo e
  **não acumula** para o ciclo seguinte.
- O form mostra o **resumo derivado** (h/ano e valor da parcela/ano). Ex.: 60h × R$122 em
  4 trimestres = **240h/ano**, parcela **R$ 7.320** e ano **R$ 29.280**.

Na seção **"Contratos cadastrados"**, cada contrato vira um **card com os detalhes completos**
num quadro legível: para **AMS** — apuração, valor-hora, horas/ciclo, **parcela do ciclo**,
**valor anual** (e h/ano), mín/teto mensal, início da vigência e banco de horas; para
**bolsa/projeto** — valor-hora, horas contratadas e vigência. Abaixo: projetos mapeados,
observações e um **preview de consumo** no período. Um contrato **AMS sem projetos mapeados**
recebe um **aviso** (ele não aparece na apuração da aba AMS até mapear os projetos). Fica salvo
em `cfg.contratos` (compartilhado via Supabase / `/api/config`).

### 🛠️ AMS & Governança / 💰 Receita (abas separadas)

O AMS é **totalmente separado** da Receita: tem **aba própria** (menu **AMS & Governança → AMS**).
A aba **Receita** ficou só com **bolsa de horas e projetos**. Ambas consomem `cfg.contratos` +
worklogs, **sem nova função serverless**.

**🛠️ Aba AMS — apuração por ciclo (banco de horas).** Mostra **um contrato AMS por vez**:
um **seletor de cliente** escolhe o contrato e a visão é sempre **por ciclo** (alinhado ao mês
de início da vigência). Os worklogs **do ciclo selecionado** são buscados via
`GET /api/tempo?desde=&ate=` (independente do período do topo). Mostra:

- **Seletor de cliente** + **navegador de ciclos** (◀ anterior · vigente · próximo ▶) — a
  apuração é sempre **por ciclo** (trimestral ou o do contrato); o **seletor de Período**
  tradicional do topo **fica oculto nesta aba** (não faz sentido para AMS) — a única seleção é
  o ciclo. Dá para revisar ciclos passados.
- **Apontamentos por chamado no mês:** no bloco "Por mês no ciclo", **clique num mês** para
  abrir um modal com os **chamados** apontados naquele mês; cada chamado expande para as
  **linhas de worklog** (data · pessoa · horas) e tem link **↗ para o Jira**.
- **Dados do contrato cadastrado**: valor-hora, horas/ciclo, parcela, valor anual, mín/teto
  mensal, início da vigência, banco de horas, projetos e observações — com **Editar no Admin**.
- **Controle de faturamento do ciclo**: botão para **marcar/desmarcar o ciclo como faturado**
  (com data e quem marcou). O status é por ciclo e fica salvo (com o time, via Supabase).
- **Consumo faturável do ciclo × horas contratadas** (ex.: Xh de 60h, %), com selo em
  risco/esgotado — **só as horas faturáveis consomem o pacote** (o total fica como contexto);
- **Faturável × não faturável** no ciclo (split + KPI), classificado pela **descrição do tipo**
  do chamado no Jira (ex.: tipo cuja descrição diz "não faturável");
- **Horas por tipo de issue** com **drill-down** (clique no tipo → chamados → Jira) **e**
  **Chamados do ciclo**: lista achatada de **todos os chamados que fazem parte do ciclo**
  (chave com link para o Jira, **🔖 Número do Chamado Cliente**, resumo, tipo, faturável/não,
  nº de pessoas e horas);
- **📊 Relatórios do ciclo** — distribuição dos chamados por **Causa raiz**, **Produto** e
  **Processo** (campos do Jira): horas · % do ciclo · nº de chamados, ordenado por horas
  (Pareto com acumulado); clique num item para abrir os chamados daquele grupo. Os campos
  são configuráveis por env (`JIRA_CF_*`);
- **Banco de horas** (saldo faturável disponível até o fim do ciclo) e **excedente** (horas
  faturáveis acima do pacote → requer **autorização prévia** e é faturado junto com o ciclo);
- **Faturamento do ciclo** = parcela fixa (horas do ciclo × valor-hora) + excedente faturável;
- **Consumo por mês** dentro do ciclo, sinalizando meses **abaixo do mínimo** e **acima do teto**;
- **🖨 PDF da apuração** (por contrato): documento com o **valor apurado** referenciando o
  contrato, os **responsáveis** (Dexterity e cliente), o **status de faturamento do ciclo** + a
  **memória de apontamentos por chamado** (cada chamado com suas linhas de worklog: data, pessoa
  e horas) — pronto para "Salvar como PDF". O **cabeçalho se repete em todas as páginas**.

> O banco de horas vale **dentro do ciclo** e **não acumula** para o próximo. **Só as horas
> faturáveis consomem o pacote/excedente**; as não faturáveis (ex.: "Tarefas ADM") ficam fora
> da apuração — continuam visíveis como indicador (split/KPI) e na memória do PDF, mas não
> entram no banco de horas nem no excedente.

**💰 Aba Receita — bolsa de horas & projetos.** Para contratos de bolsa/projeto fechado,
projeção pelo **período selecionado**: horas contratadas × consumidas, **% de esgotamento +
projeção** (ritmo dos dias úteis fechados até o fim do período), receita estimada e % faturável.
*(O quadro "horas sem contrato" foi removido desta visão.)*

### 🌐 Painel do cliente (portal read-only)

Página pública **`/portal.html?c=<token>`** para o **cliente acompanhar as horas** do contrato
AMS, **somente leitura** e **escopada por token** (cada contrato tem o seu link). O acesso e a
filtragem dos dados são **no servidor**: o token identifica o contrato e a API só devolve os
dados **daquele cliente** — nunca de outros.

- **Gerar o link:** na aba **⚙️ Admin**, cada contrato tem **🔗 Gerar link do cliente** (cria/rotaciona
  o `portalToken`, salvo em `cfg.contratos`); botão **copiar** e **novo** (invalida o anterior).
- **O que o cliente vê:** consumo do **ciclo vigente** × horas contratadas (banco de horas /
  excedente), consumo **por mês** (mín/teto), **série temporal semanal de chamados abertos ×
  fechados** (gráfico premium com crosshair/leitura ao passar o mouse) + **backlog líquido**, e a
  **classificação por componentes/labels** (causa). Tudo do ciclo de apuração corrente.
- **API:** `GET /api/config?portal=<token>` (consolidado no endpoint de config — **sem nova
  função serverless**): lê o contrato no Supabase, busca worklogs do ciclo (Clockwork) e
  contagens do Jira **só dos projetos do cliente**.

> **Atenção (deploy):** se o projeto na Vercel estiver com **Password Protection** global, o
> cliente não consegue abrir o `/portal.html` (a senha bloqueia tudo). Para liberar o portal,
> use um deploy/rota sem a proteção global — o **token do link** é o controle de acesso do portal.

### 🚨 Central de Alertas

Aba **Alertas**: motor de alertas **acionáveis** montado a partir dos dados que já
temos (`/api/vencimentos` amplo + `calcTimesheet`), com severidade (🔴 crítico / 🟠 alto
/ 🟡 médio) e **ação recomendada** por item:
- Tickets **vencidos** (crítico se > 7 dias), **vencem hoje**, **sem responsável**.
- Pessoas **sem apontamento** no último dia útil e **abaixo de 80% da meta** no período.

KPIs por severidade filtram a lista. Alertas de **AMS, orçamento de projeto e SLA**
entram quando os dados (valor-hora, horas contratadas, cliente↔projeto) forem cadastrados.

### Ocultar usuários externos

No botão **Metas → "Usuários externos (ocultar do time)"** dá para marcar pessoas
(ex.: colaboradores/clientes externos) que **não devem aparecer** em nenhuma visão —
ranking, timesheet, resumo, seletores e no relatório do Teams. Fica salvo em
`cfg.ocultos` (compartilhado via Supabase); os dados dessas pessoas são removidos no
carregamento (`removeUsuariosTecnicos`) e no `/api/teams`.

### Minhas horas por dia (aba ⏱ Apontar)

No topo da aba, quem está identificado vê um painel **⏱ Minhas horas por dia** com o
total que já apontou em cada dia do período carregado, destacando (⚠) e avisando os
dias que passam da **meta diária** (padrão 8h, ajustável em Metas / por pessoa). Ao
apontar, o painel atualiza na hora e o feedback avisa se aquele dia excedeu a meta.

### Reclassificar (mover de projeto) na aba ⏱ Apontar

Cada chamado tem **🔀 mover** para **reclassificá-lo para outro projeto** sem sair do
apontamento. O seletor mostra só os **destinos compatíveis** (que têm um tipo com o
mesmo nome do chamado). Reusa o *bulk move* do Jira via `POST /api/reunioes`
(`{ alvo, itens:[{id, tipo}] }`, aceitando a **chave** do issue), com o token da pessoa.

### Comentar e transferir na aba ⏱ Apontar

Os chamados ficam **agrupados por projeto** (cabeçalho com código + nome). Em cada
chamado dá para **💬 comentar** e **transferir o responsável** (para outra pessoa,
para mim ou remover), além de apontar horas, mover status e reagendar. Comentário e
transferência usam o **token da própria pessoa** via `POST /api/transicao` nos modos
`{ comentar:true, issue, texto }` e `{ atribuir:true, issue, accountId }` (accountId
vazio = sem responsável).

### Reprogramar vencimentos (aba ⏱ Apontar)

Na aba Apontar dá para **reagendar a data de vencimento** de qualquer chamado
(clique no 📅 do vencimento) com atalhos **Hoje / Amanhã / Próxima semana**, data
livre ou **remover data**. Marque **Incluir sem vencimento** para também trazer os
chamados abertos **sem data** e programá-los. A escrita usa o **token da própria
pessoa** (mesmo modelo do apontamento) via `POST /api/transicao` no modo
`{ reagendar:true, issue, duedate }`; a listagem com sem-data usa
`GET /api/vencimentos?incluirSemVenc=1`.

### Relatório diário de apontamento no Teams (8h)

O endpoint **`/api/teams`** monta um cartão (KPIs: apontamento geral, horas faltando,
pessoas em dia/atrasadas + ranking de quem mais precisa apontar, com selos
🟢 Em dia / 🟡 Atrasado / 🔴 Crítico) referente ao **último dia útil** e o envia ao canal.

- **Webhook:** crie um *Workflow* "Postar em um canal quando uma solicitação de webhook
  for recebida" no Teams e cole a URL em `TEAMS_WEBHOOK_URL` na Vercel.
- **Agendamento (08:00):** o cron da Vercel exige plano Pro, então o disparo é feito pelo
  GitHub Actions em `.github/workflows/apontamento-teams.yml` (cron `0 11 * * 1-5` = 08:00
  America/São_Paulo, seg–sex; o endpoint pula feriados). Para proteger o endpoint, defina
  `CRON_SECRET` na Vercel **e** o mesmo valor como *secret* do repositório no GitHub
  (Settings → Secrets and variables → Actions). Opcional: secret `TEAMS_CRON_URL` para
  apontar a um domínio próprio.
- **Testar:** aba **Actions** → *Relatório de apontamento no Teams* → **Run workflow**
  (use `dry=1` para só montar o cartão sem enviar), ou abra `/api/teams?dry=1`.

### Onde gerar os tokens
- **Jira:** id.atlassian.com → Manage profile → Security → Create and manage API tokens.
- **Clockwork (Pro):** no Jira, menu Apps → Clockwork → **API tokens** → Create token.
  Gere com a sua conta admin: a API roda no contexto do dono do token, então o token
  precisa enxergar os worklogs de todo o time.

## Deploy no Vercel

1. Suba este diretório para um repositório no GitHub.
2. No Vercel: **Add New… → Project** e importe o repositório (framework: *Other*).
3. Em **Settings → Environment Variables**, cadastre as variáveis acima.
4. **Deploy.** O Vercel detecta `api/` (funções) e `public/` (estático) automaticamente.

Rodar localmente: `npm i -g vercel` e depois `vercel dev` (crie um `.env` a partir de `.env.example`).

## Proteger com senha única

No projeto do Vercel: **Settings → Deployment Protection → Password Protection** → defina a
senha. Todos do time acessam o painel com a mesma senha. (Recurso de planos pagos do Vercel;
é a forma recomendada por não exigir autenticação caseira.)

## Personalização de marca

- Cores e tipografia oficiais já estão aplicadas. As fontes **Proxima Soft** (títulos) e
  **Boston** (corpo) são proprietárias: se tiver os webfonts, coloque em `public/fonts/` e
  descomente os `@font-face` no topo do `index.html`. Sem eles, usa-se um fallback neutro.
- O logo no cabeçalho é a **marca Dexterity** (pinwheel) em `public/logo.svg` — uma pétala única
  replicada com rotações de 90° (3 grafite `#404040` + 1 cerceta `#17A398` no topo-direita).
  O cabeçalho usa `<img src="/logo.svg">` e o mesmo arquivo serve de **favicon**; para trocar a
  marca, basta substituir o `logo.svg`.

## Limitações conhecidas (v1)

- **Faturável** é inferido pelo **nome _e_ pela descrição** do tipo de issue (ex.: tipo
  "Tarefas ADM - Não Faturavel" cuja descrição é "Atividades administrativa não faturavel"),
  ajustável via `NAO_FATURAVEL_REGEX`. Se preferir usar o atributo de billable do próprio
  Clockwork, dá para evoluir lendo as *worklog properties* (requer mapear a chave do atributo).
- O **changelog embutido** na busca cobre as alterações recentes — adequado para janelas de
  até 30 dias. Para histórico profundo, evoluir para `/rest/api/3/issue/{key}/changelog`.
- O campo de **comentários** retorna os mais recentes da issue; em issues muito comentadas
  pode haver truncamento.
- **Concluídas** são agregadas no período (sem atribuição por pessoa) nesta versão.
- O **cache** é por instância "quente" do serverless (best-effort). Para cache compartilhado
  e durável, trocar `_lib/util.js` por Vercel KV.
