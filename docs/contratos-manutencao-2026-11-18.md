# 📑 Contratos de clientes — manutenção e JI-299 (2026-11-18)

**Pedido:** "Favor verificar as funções de editar e fazer manutenção dos contratos de AMS e de horas abertas e fechadas, resolva também
esse issue JI-299". O JI-299 (Bug, 🐞 Reportar, 2026-11-16): "não consigo mudar o campo do ciclo de faturamento — não aparecem opções ou
possibilidade de preenchimento do ciclo de faturamento no cadastramento de novo contrato".

Arquivos: `public/js/16-contratos-ams-receita.js`, `public/js/16g-clientes-ciclo.js`, `public/css/app.css`, `public/css/mobile.css`,
`public/js/08-inicio.js`, `api/config.js`.

## Achados e o que foi feito

| # | Sev. | Achado | Situação |
|---|---|---|---|
| A1 | M | JI-299: o select do ciclo só listava `cfg.clientes`; sem cliente cadastrado só havia "— nenhum —" | Corrigido: mês civil, ciclos existentes e "＋ Novo ciclo para este cliente" |
| A2 | M | JI-299: `clPodeEditar()` exigia gestor; quem cadastra contrato não conseguia criar o ciclo | Corrigido: qualquer pessoa identificada (`CL_SO_GESTORES=false`) |
| A3 | M | Cadastrar o cliente no bloco 🗓 não atualizava o select do formulário aberto | Corrigido: `clRender()` chama `ctCicloAtualiza()` |
| A4 | B | Dica errada ("abaixo", "só informativo"); a 💹 Rentabilidade usa `c.clienteId` | Texto corrigido |
| A5 | A | O digitado sumia em qualquer redesenho da tela | Corrigido: `estado.admin.form.campos` + foco e cursor devolvidos |
| A6 | A | Trocar o tipo deixava campos de AMS pendurados (Início e portal liam) | Corrigido: limpa ao salvar; consumidores só olham AMS |
| A7 | A | Mudar apuração/início do AMS deslocava os ciclos faturados em silêncio | Confirmação com a contagem; as marcas ficam guardadas |
| A8 | M | Fim da vigência só existia em horas abertas | Campo em todos os tipos (não muda conta nenhuma) |
| A9 | M | Contrato removido por outra sessão: a edição se perdia sem aviso | Aviso e "Salvar como novo contrato" |
| A10 | B | Editar não dava retorno nem deixava rastro | Toast, confirmação do que mudou e 🗒 Histórico |
| A11 | M | Validação: teto < mínimo, fim < início fora de horas abertas, AMS sem horas/início | Bloqueia os dois primeiros; os demais só avisam |
| A12 | B | `0` voltava como "0" ao editar | Corrigido |
| A13 | M | Remover não dizia o que estava ligado ao contrato | Confirmação lista link, contas, ciclos faturados e projetos |
| A14 | B | "Editar no Admin" não mostrava o formulário (abaixo da dobra) | Rola até o formulário |
| A15 | B | Log do faturamento usava `c.nome` (não existe) | Usa `c.cliente` |
| A16 | M | Projeto em dois contratos passava despercebido | Etiqueta "já em CT-00x" na lista de projetos |
| A17 | B | "Apuração (ciclo)" × "Ciclo de faturamento" confundiam | Rótulos e dica |
| A18 | B | Vínculo com ciclo excluído sumia calado | Aviso no campo |
| C1–C2 | — | Duplicar e leitores sem criar objeto: conferidos, sem bug | Teste de regressão |

## Decisões

- **D1** Ciclo de faturamento aberto a quem está identificado; `CL_SO_GESTORES=true` religa (R045 cobre tela e `CHAVES_PAPEL`).
- **D2** Campo próprio com `__novo`; o cliente só nasce no salvar do contrato (depois das validações), com o nome digitado, na mesma
  gravação; mesmo nome reaproveita o ciclo.
- **D3** Formulário guardado em `estado.admin.form.campos`; campo novo = entrada em `CT_FORM_IDS`.
- **D4** `fim` para todos os tipos sem mudar nenhuma conta.
- **D5** Bloqueia o que é erro certo; só avisa o que pode legitimamente faltar.

## Ficou de fora

R214 consumo de bolsa/projeto desde o início · R215 contrato encerrado fora das contas · R216 AMS com aditivo por vigência · R217
revogar as contas do portal ao remover. R040, R045 e R184 foram reescritos.

## Testes

`contratos-manut-test.mjs` (Playwright, 122 asserções, porta 8796, fixture `servidor-contratos.mjs`) e `contratos-servidor-test.mjs`
(`node --test`, 8 casos do `portalHorasContrato`), no scratchpad `contratos-plano/`. Gates: `npm run check`.
