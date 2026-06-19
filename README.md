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
- O ícone no cabeçalho é uma **aproximação** do pinwheel Dexterity. Para o logo oficial,
  coloque `public/logo.svg` e troque o `<svg>` do cabeçalho por `<img src="/logo.svg">`.

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
