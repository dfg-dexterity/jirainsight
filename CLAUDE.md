# CLAUDE.md — Notas do projeto

Painel **"Insights de Uso (Jira + Clockwork)"** da Dexterity IT.

- Front-end estático em `public/index.html` (HTML/JS puro, **sem build**).
- Funções serverless em `api/*.js` (Vercel, Node ≥ 18). Leituras usam a conta de
  serviço (`JIRA_*`, `CLOCKWORK_API_TOKEN`); apontamentos/transições/criação usam o
  token de API da própria pessoa (enviado por requisição, nunca persistido).
- Deploy: a branch **`main`** publica na Vercel.

## 📘 Manual no Notion — MANTER ATUALIZADO

Existe um manual no Notion que documenta **todas as funcionalidades** + um **changelog**:

- Título: **TI-14-001 - Overview Jira Insights** (em *Processos Dexterity*)
- URL: https://www.notion.so/dexterityitsolutions/TI-14-001-Overview-Jira-Insights-388c69371e178034b6dfd5ca9efad81c
- Page ID: `388c6937-1e17-8034-b6df-d5ca9efad81c`

> **Atualizado em 2026-06-23 (a pedido do usuário):** o manual passou a ser esta
> página. A página antiga (`37bc6937-1e17-8124-b315-c6bc7ac0a2ad`, "Manual — Insights
> de Uso") está **descontinuada** — não atualizar mais.

**Acordo de trabalho (solicitado pelo usuário em 2026-06-10):** sempre que uma
funcionalidade desta ferramenta for **adicionada ou alterada** a pedido do usuário,
**atualizar essa página do Notion** na mesma entrega:

1. Ajustar/acrescentar a descrição na **seção correspondente** (ex.: a aba afetada).
2. Acrescentar uma linha na tabela **"Log de funcionalidades (changelog)"** com a
   **data (AAAA-MM-DD)** e uma descrição curta.

Usar a ferramenta MCP do Notion: `mcp__Notion__notion-fetch` para ler a página atual e
`mcp__Notion__notion-update-page` para editar. Carregar os schemas via `ToolSearch`
quando necessário.

## ⏱ Apontamento no Jira — projeto JI (atualizado em 2026-08-11)

> **Mudança de 2026-08-11 (a pedido do usuário):** as entregas da ferramenta passaram
> do TAD-829 para o projeto **`JI` (IMI | Jira Insights)**, organizado por ÉPICOS:
> JI-7 🎯 Prioridades do time · JI-8 📋 Meu Planejamento · JI-9 ⏱ Apontar & Timesheet ·
> JI-10 🏆 Ranking & Metas · JI-11 🎨 Identidade visual & Experiência ·
> JI-12 📊 Análises & Relatórios · JI-13 🔌 Integrações & Plataforma.
> O histórico anterior segue no TAD-829 (as horas antigas ficam lá; os tickets foram
> espelhados no JI com link "relates to").

A cada **entrega/commit** desta ferramenta:

1. **Criar uma TAREFA no projeto `JI`** (tipo "Tarefa" — usar o id `11112`, o nome
   traduzido é rejeitado pela API) **sob o épico correspondente** (campo
   `parent: {key: 'JI-x'}`), detalhando o que foi feito, atribuída ao usuário (Diego,
   accountId `712020:3a98a142-a5ce-443c-b3f2-32cd080d2583`). Transições do fluxo JI:
   "Fazendo" id 21 · "Feito" id 41 (aceitas no próprio create via `transition`).
2. **SEMPRE perguntar ao usuário quantas horas apontar** (nunca presumir) e registrar
   o worklog nessa tarefa via MCP do Atlassian (`addWorklogToJiraIssue`) ou, se o
   conector pedir aprovação indisponível, via Zapier
   (`jira_software_cloud_add_work_log_to_issue`).

> As escritas no Jira podem exigir aprovação do conector no claude.ai; se falhar com
> "requires approval", avisar o usuário para aprovar e repetir — não pular a etapa.

## 📣 Aviso no Teams — canal "Avisos Gerais" (acordo de 2026-07-28)

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

## ✨ Novidades do app — MANTER ATUALIZADO (acordo de 2026-07-19)

A cada **entrega**, além do Notion, atualizar as **Novidades dentro do app**
(`public/index.html`):

1. Acrescentar a(s) entrada(s) no topo do array `const NOVIDADES` (formato
   `['AAAA-MM-DD','texto com <b>destaques</b>']`, tom voltado ao usuário).
2. Subir a `const NOV_VER` (ex.: `'2026-07-19.1'`) — é o que reacende o pontinho
   vermelho em "⋯ Mais → ✨ Novidades" e o destaque do card da tela inicial.

O card **✨ Novidades** na tela inicial (⚡ Ações de hoje) mostra as 6 mais recentes
automaticamente a partir do array.

Também manter o **🗺️ Roadmap** (`const ROADMAP`, vista `roadmap`) em dia a cada
entrega: mover itens entre fazendo/planejado/avaliação e acrescentar os novos
pedidos do usuário (as entregas recentes vêm sozinhas do array NOVIDADES).
