# ⏱ Horas da semana no 📋 Status report — planejado × apontado (2026-11-20)

## Pedido
"Coloque junto com o status report uma visão de quantas horas o pessoal apontou nos dias anteriores vs o que está planejado no
planejamento semanal; a ideia é ver como o pessoal vem gastando seu tempo."

## Decisões do usuário
- **D1** Aparece quem tem atividade neste projeto no 📋 plano da semana OU apontou neste projeto na janela; mostra as horas do
  projeto e, ao lado, o total do dia da pessoa em todos os projetos.
- **D2** Janela = semana corrente até ontem, dia a dia, com ‹ › para semanas anteriores.
- **D3** Por pessoa e por dia: planejado neste projeto × apontado neste projeto, colorido pelo desvio, e o detalhe "onde mais foi o tempo".

## Desenho
- **Sem servidor novo** (limite de 12 funções), nada na `cfg`, sem R$, nada gravado.
- **Leituras:** `POST /api/config?plan=1 {acao:'relatorio'}` (planos do time, aberto a todo identificado, como o 📊 Planejamento do
  time) e `GET /api/tempo?desde=<segunda>&ate=<domingo>` (mesma URL do planrel, para dividir o cache de 20 min do servidor).
  Uma leitura por semana, não por projeto; TTL de 5 min; ↻ força com `nocache=1`.
- **Janela (`srhJanela`):** a semana padrão é a do último dia útil antes de hoje. Na segunda (ou no 1º dia útil depois de feriado)
  mostra a semana passada inteira; hoje nunca entra. Piso de 26 semanas.
- **Cálculo (`srhCalc`, pura):** inclusão = plano do projeto na semana > 0 OU apontado > 0; ocultos fora; um plano por pessoa e semana
  (`mpPlanosVigentes`); projeto do worklog = `x.p` ou prefixo da chave; dia = `x.d.slice(0,10)` (igual ao planrel).
- **Régua de cor:** `mpSitDe(pl,re)`, extraída do `mpComparativo` (04): ±10% conforme, até ±40% amarelo, além vermelho. "Sem plano" não é
  0h planejadas (célula neutra).
- **Tela (20c):** `<details id="sr-horas">` recolhido, nada lido enquanto fechado; `srhPinta` troca só o corpo (não fecha o ⋯, não rouba
  foco); guarda `h.aberto===d.open` no `toggle` contra laço; modal da pessoa com tickets, atividades do plano e outros projetos.
- **URL:** `srh=1` e `srhw`. **Texto copiado:** bloco ⏱ só com a seção aberta e carregada.
- **Celular/iPad:** tabela vira cartão por pessoa; alvos de 44 px; regras só dentro de `@media`.

## Ficou de fora (roadmap)
- R252 recorte por papel no servidor e filtro "só planos enviados/aprovados" (hoje todo identificado vê todos).
- R253 a mesma visão na 🧭 Pendências e no relatório de sexta.
- R254 tendência de várias semanas por pessoa — **entregue em 2026-11-21** (seção abaixo).
- R255 hoje parcial e alerta de desvio.

## Testes
`status-report-horas-test.mjs` (Playwright, contra `servidor-sr.mjs`) e regressões do status report e do Meu Planejamento; ver CLAUDE.md.

---

## 📈 Tendência (2026-11-21, R254)

**Pedido:** "Vamos fazer o 254" — ver como o time vem gastando o tempo ao longo de várias semanas, não só uma. Decisões (todas as recomendadas): **D3** 8 semanas por padrão, chips 4 · 8 · 12; **D4** grade pessoa × semana + gráfico da pessoa ao clicar.

**Onde:** dentro da seção ⏱ Horas da semana, uma alternância `📅 Semana | 📈 Tendência` (`.sr-h-modos`, `[data-sr-h-modo]`). Estado `estado.sr.horas.modo` (`'semana'` padrão) e `tn` (4·8·12). URL: `srhm=t` (só em tendência) e `srhn` (só quando ≠ 8).

**Dados (sem servidor novo, nada na `cfg`, sem R$):** as N semanas terminam na semana padrão (`wPad`: a corrente até ontem, ou a passada na segunda). A leitura é em **blocos de 4 semanas** alinhados a `wPad`: por bloco, um `POST /api/config?plan=1 {acao:'relatorio', de, ate}` e um `GET /api/tempo?desde&ate` de 28 dias (abaixo dos 62 dias que o app trata como "rápido" e dos 400 do limite). 8 semanas = 2 blocos = 4 requisições; 12 = 6; no máximo 2 blocos em voo. Cache por bloco com identidade e TTL (5 min na semana corrente, 30 min nos fechados). Nada é lido com a seção fechada nem no modo 📅. Trocar de projeto só recalcula (os blocos são do time inteiro). Por que não as alternativas: N leituras semanais (16–24 requisições); uma leitura única de 84 dias (acima do limiar e um erro perde tudo); fotos `kpis_` (guardam pessoa, não projeto).

**Funções (20e, sem DOM):** `srhTendSemanas`, `srhTendBlocos`, `srhTendDadosBloco`, `srhTendCarrega`, `srhTendCalc` (pura; `srhCalc` por semana, mesma régua `mpSitDe`), `srhTendResumo`. **Tela (20c):** `srhModosHTML`, `srhTendContexto`, `srhTendCorpoHTML`, `srhTendGraficosHTML`, `srhTendGradeHTML`, `srhTendCelulaHTML`, `srhTendVaiSemana`, `srhTendAbrePessoa`; o corpo antigo virou `srhSemanaCorpoHTML`. Seletores: `.sr-t-barra`, `.sr-t-graf`, `.sr-t-tab`, `.sr-t-c`, `[data-sr-t-n]`, `[data-sr-t-refresh]`, `[data-sr-t-retry]`, `[data-sr-t-p]`, `[data-sr-t-w]`.

**Tela:** dois cartões de gráfico (nunca dois eixos no mesmo): "Horas no projeto" (apontado em barras, planejado em linha) e "Execução" (% com linha de 100%; semana sem plano é buraco, não zero), com ▦ tabela acessível e a última semana marcada como parcial. Grade pessoa × semana com cor e símbolo da régua (✓ ▲ ▼ ∅, "—" sem plano, "?" sem leitura); coluna abre 📅 Semana naquela semana; linha (clique ou Enter/Espaço) abre o modal com o gráfico da pessoa. Falha de um bloco = semanas "?" e "Tentar de novo" só dele; plano que falha = parcial só com o apontado. 📋 Copiar leva o bloco "📈 Tendência (N semanas)" com a seção aberta em 📈.

**Desvios do plano:** os dois cartões foram montados com `tsChart` direto (o `dshSmallMultiples` não repassa `metaY`); classe da célula `.sr-t-c ok|medio|ruim|nd`; no celular (≤ 560 px) com 12 semanas só a grade corta nas últimas 8 (com nota). **Correção junto:** `cfg.ocultos` é lista de objetos `{a,nome}`; o `srhCalc` (e o Dia do time, 24b) usavam `new Set(cfg.ocultos)` e nunca casavam — agora `.map(o=>(o&&o.a)||o)`.

**Testes:** `status-report-tend-test.mjs` (Playwright, 124 asserções) e regressão `status-report-horas-test` (106). **Roadmap:** R259 (além de 12 semanas, fotos por projeto × pessoa, comparação entre projetos), R260 (na 🧭 Pendências e na sexta); R253 e R255 reescritos.

