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

## ⏱ Apontamento no Jira — TAD-829 (acordo de 2026-07-19)

A cada **entrega/commit** desta ferramenta:

1. **Criar uma SUB-TAREFA no ticket `TAD-829`** ("Aplicativo Jira Insight", projeto
   `TAD` — ITPR | Tarefas Avulsas, tipo "Subtarefa" id 10010) **detalhando o que foi
   feito**, atribuída ao usuário (Diego, accountId
   `712020:3a98a142-a5ce-443c-b3f2-32cd080d2583`).
2. **SEMPRE perguntar ao usuário quantas horas apontar** (nunca presumir) e registrar
   o worklog nessa sub-tarefa via MCP do Atlassian (`addWorklogToJiraIssue`) ou, se o
   conector pedir aprovação indisponível, via Zapier
   (`jira_software_cloud_add_work_log_to_issue`).

> As escritas no Jira podem exigir aprovação do conector no claude.ai; se falhar com
> "requires approval", avisar o usuário para aprovar e repetir — não pular a etapa.
