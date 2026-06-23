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
