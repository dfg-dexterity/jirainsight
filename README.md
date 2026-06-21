# Dexterity · Insights de Uso (Jira + Clockwork)

Painel interno que dá visibilidade ao time sobre o uso do Jira: horas apontadas
(Clockwork) e atividade (tickets tocados, alterações, transições, comentários, criações)
por pessoa, com filtros por categoria de projeto, projeto e tipo, e recorte faturável
vs. não-faturável. Janelas: hoje, 7 dias e 30 dias.

## Como funciona (arquitetura)

Front estático (`public/index.html`, sem build) + duas funções serverless no Vercel:

- `GET /api/tempo` — lê os apontamentos do **Clockwork** na janela, resolve projeto/tipo
  de cada issue no Jira e classifica faturável. (métrica de **tempo**)
- `GET /api/atividade` — lê issues atualizadas no **Jira** com o changelog embutido e
  monta eventos atribuídos ao **autor da alteração**. (métrica de **atividade**)

Os tokens ficam só nas variáveis de ambiente do servidor — nunca no navegador.
Como o front e as funções são servidos pelo mesmo domínio, não há problema de CORS.

```
api/
  _lib/util.js     datas (America/Sao_Paulo), cache, fetch do Jira, heurística faturável
  tempo.js         Clockwork -> horas por pessoa/projeto/categoria/dia + faturável
  atividade.js     Jira changelog -> eventos por pessoa
public/
  index.html       dashboard (marca Dexterity, gráficos em CSS/SVG, filtros)
```

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `JIRA_BASE_URL` | sim | `https://dexterityit.atlassian.net` |
| `JIRA_EMAIL` | sim | e-mail da conta admin do Jira |
| `JIRA_API_TOKEN` | sim | token de API do Jira |
| `CLOCKWORK_API_TOKEN` | sim | token da API do Clockwork (Pro) |
| `CACHE_TTL_MIN` | não | minutos de cache no servidor (padrão 20) |
| `NAO_FATURAVEL_REGEX` | não | regex que marca o tipo como não faturável (padrão `n[aã]o.?fatur`) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | não | config compartilhada (`jirainsight_config`) e convites de reunião (`jirainsight_convites`) |
| `TEAMS_WEBHOOK_URL` | não | webhook do canal: relatório diário de apontamento e aviso de convites de reunião |
| `CRON_SECRET` | não | se definida, `/api/teams` exige `Authorization: Bearer <segredo>` (use o mesmo valor no secret do GitHub Actions) |
| `CLOCKWORK_ESCRITA` | não | `1` ativa o modo direto: ao convidar, tenta criar o worklog dos convidados via API do Clockwork (autor explícito); se a API recusar, o convite segue pendente (fallback automático) |
| `ANTHROPIC_API_KEY` | não | chave da API da Anthropic (Claude) — habilita o **resumo das atividades por IA** na aba Resumo (`/api/resumo`). Sem ela, o card explica como configurar |
| `ANTHROPIC_MODELO` | não | modelo usado no resumo por IA (padrão `claude-opus-4-8`) |

### Convites de reunião (apontamento em grupo)

Reuniões que valem para várias pessoas: quem organizou usa **👥 Apontar reunião
p/ várias pessoas** na aba ⏱ Apontar (o próprio worklog sai na hora) e os demais
confirmam o convite com **1 clique** — o worklog de cada um é criado **com o token
da própria pessoa**, preservando o modelo de segurança. Os convites ficam na tabela
`jirainsight_convites` do Supabase (colunas: grupo, issue, resumo, segundos, inicio,
comentario, criado_por, account_id, nome, status `pendente|confirmado|recusado|direto`,
worklog_id, erro).

### 📊 Visão Geral (tela executiva — inicial)

Aba **Visão Geral** (a **tela inicial** do painel): responde, num só lugar, "como está a
entrega?" — reaproveitando os dados que já temos (sem nova função serverless):

- **KPIs executivos:** apontamento do time (% da meta), horas apontadas, **receita estimada**
  (dos contratos), alertas críticos, pessoas em dia e tickets vencidos.
- **🚦 Saúde da entrega:** vencidos · vencem hoje · sem responsável · abaixo da meta (cada
  cartão leva à aba correspondente).
- **⏱ Apontamento do time:** donut da meta + **gráfico de área (horas por dia)** + lista de
  "quem mais precisa apontar".
- **🚨 Alertas críticos** (top do motor de alertas) e **💰 Receita & contratos** (consumo /
  esgotamento por cliente) — ambos com link para o detalhe.

Cada bloco é **acionável**: clicar leva direto à aba de detalhe (Alertas, Timesheet, Receita…).

### Gráficos modernos e interativos

Motor de **séries temporais premium** feito à mão em SVG (sem dependências/CDN — `tsChart()`),
estilo "Bloomberg":

- **Crosshair** que segue o cursor + **readout** flutuante (data + valor de cada série), com
  pontos destacados e **multi-séries** (linha/área, gradiente, linha de meta tracejada).
- Posicionamento dos overlays por **porcentagem do viewBox** (não distorce ao esticar) e
  **animação de traçado** que respeita `prefers-reduced-motion`. **Toque** suportado.
- Aplicado em **Horas por dia** (Visão Geral + Resumo, com **clique = drill-down do dia**) e no
  **burn-up do ciclo de AMS** (consumo acumulado × pacote contratado) na aba Receita.

Complementam: **donut/medidor** para metas e **barras com realce** (a barra focada destaca, as
demais esmaecem) clicáveis para drill-down.

### Navegação e novidades

- **Menu por função:** o topo é organizado em **📊 Visão Geral** (inicial) + 3 grupos com
  dropdown — **Análise** (Resumo, Timesheet, Ranking, Tickets), **⏱ Operação** (Apontar,
  Planejar, Reclassificar) e **💰 AMS & Governança** (Receita, Alertas, Admin). O grupo da
  aba ativa fica sublinhado; o selo de convites aparece também no cabeçalho de **Operação**.
- **Logo (canto superior esquerdo):** a **marca Dexterity** (pinwheel oficial em SVG, `public/logo.svg`) — clicável, volta para o início (Visão Geral).
- **✨ Novidades:** botão no topo abre a lista do que há de novo (com indicador quando há algo não visto; persiste em `localStorage`).
- **↑ Topo:** botão flutuante que aparece ao rolar e volta ao topo da página.
- **Aba ⏱ Apontar:** lista **agrupada por projeto** com cabeçalho **clicável** (expande/recolhe; “Expandir/Recolher todos”) e **ícones do Jira** para tipo (épico/tarefa/bug…) e prioridade (`/api/vencimentos` devolve `tIcon`/`prioIcon`).

### ⚙️ Administração — Contratos & Valores

Aba **Admin**: cadastro de **clientes/contratos** que destrava AMS e Receita.
Para cada contrato: **cliente**, **tipo** (AMS / bolsa de horas / projeto),
**valor-hora (R$)**, **vigência** e os **projetos do Jira** mapeados ao cliente.

Para o tipo **AMS** há um bloco extra de parâmetros do contrato:

- **Apuração (ciclo):** mensal / **trimestral** / semestral / anual — define a janela de
  controle e o reset do banco de horas.
- **Horas por ciclo** (ex.: 60), **mínimo mensal** (ex.: 20) e **teto mensal** (ex.: 60).
- **Banco de horas dentro do ciclo:** o saldo não consumido vale até o fim do ciclo e
  **não acumula** para o ciclo seguinte.
- O form mostra o **resumo derivado** (h/ano e valor da parcela/ano). Ex.: 60h × R$122 em
  4 trimestres = **240h/ano**, parcela **R$ 7.320** e ano **R$ 29.280**.

Cada card mostra um **preview de consumo** (período) e, para AMS, os parâmetros do ciclo.
Fica salvo em `cfg.contratos` (compartilhado via Supabase / `/api/config`).

### 💰 Receita & AMS por cliente

Aba **Receita** — duas seções, conforme o tipo de contrato (tudo sem nova função
serverless; consome `cfg.contratos` + worklogs):

**🛠️ AMS — apuração por ciclo (banco de horas).** Para cada contrato AMS, calcula o
**ciclo de apuração vigente** (alinhado ao mês de início da vigência) e busca os worklogs
**desse ciclo** via `GET /api/tempo?desde=&ate=` (independente do período do topo). Mostra:

- **Consumo do ciclo × horas contratadas** (ex.: Xh de 60h, %), com selo em risco/esgotado;
- **Banco de horas** (saldo disponível até o fim do ciclo) e **excedente** (acima do pacote
  → requer **autorização prévia** e é faturado junto com o ciclo);
- **Faturamento do ciclo** = parcela fixa (horas do ciclo × valor-hora) + excedente;
- **Consumo por mês** dentro do ciclo, sinalizando meses **abaixo do mínimo** e **acima do teto**;
- KPIs do conjunto: faturamento do ciclo, horas no ciclo, banco de horas e nº em excedente.

> O banco de horas vale **dentro do ciclo** e **não acumula** para o próximo.

**💰 Bolsa de horas & projetos.** Para contratos de bolsa/projeto fechado, projeção pelo
**período selecionado**: horas contratadas × consumidas, **% de esgotamento + projeção**
(ritmo dos dias úteis fechados até o fim do período), receita estimada e % faturável.

Ainda: card **"Horas sem contrato"** (projetos com horas não mapeados a nenhum contrato).

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

- **Faturável** é inferido pelo nome do tipo de issue (ajustável via `NAO_FATURAVEL_REGEX`).
  Se preferir usar o atributo de billable do próprio Clockwork, dá para evoluir lendo as
  *worklog properties* (requer mapear a chave do atributo no Clockwork).
- O **changelog embutido** na busca cobre as alterações recentes — adequado para janelas de
  até 30 dias. Para histórico profundo, evoluir para `/rest/api/3/issue/{key}/changelog`.
- O campo de **comentários** retorna os mais recentes da issue; em issues muito comentadas
  pode haver truncamento.
- **Concluídas** são agregadas no período (sem atribuição por pessoa) nesta versão.
- O **cache** é por instância "quente" do serverless (best-effort). Para cache compartilhado
  e durável, trocar `_lib/util.js` por Vercel KV.
