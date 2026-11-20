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
- R254 tendência de várias semanas por pessoa.
- R255 hoje parcial e alerta de desvio.

## Testes
`status-report-horas-test.mjs` (Playwright, contra `servidor-sr.mjs`) e regressões do status report e do Meu Planejamento; ver CLAUDE.md.
