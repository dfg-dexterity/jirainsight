# Ficha do cliente (R183) — 2026-11-18

Pedido: uma tela que responda "como está o cliente?" juntando o que hoje está espalhado entre 📑 Contratos, 📁 Projetos, 📋 Status report, 💹 Rentabilidade e o ciclo de faturamento.

## Desenho
- Vista `clficha` (módulo `public/js/16h-cliente-ficha.js`, prefixo `clf`), 3ª aba do grupo `admin`, também no menu Dexterity Negócio, no Ctrl+K, no botão 📇 do cartão da 🏢 Clientes e no chip 🏢 Cliente da 🦴 espinha do projeto.
- URL: `?v=clficha&cli=<id>&clp=<ciclo|ciclo-1|mes|mes-1|livre>` e, no livre, `clde`/`clate`. Sem `cli` válido: seletor de clientes e o card "Sem cliente ligado".
- Só leitura: nunca chama `salvaCfg()`. Leitores de outros módulos que criam listas ou campos vazios na `cfg` são desfeitos por `clfSnap`/`clfRestaura`.

## Estrutura de `clFicha(cli, per, o)`
Função pura (sem rede, sem gravar) que devolve `{cl, periodo, contratos, projetos, planos, notas, parcerias, fin, tempo, veFin, ...}`. Cada seção é montada por `sec()` à parte: se uma lança, só aquele bloco vira aviso. Peças: `clfVinculos` (contratos, planos e parcerias do cliente, mais as sugestões por nome), `clfPeriodo`, `clfProjetosDe`, `clfFin` (espelha a regra da Controladoria), `clfContratoLinha`, `clfPlanoLinha`, `clfNotas`, `clfSrDe`.

## Leituras
| Leitura | Quando | Cache |
|---|---|---|
| `/api/tempo?desde&ate` do período | automática se o período tem até 62 dias | `estado.clf.tempo`, chave `de\|ate`; uma leitura que cobre o intervalo é reaproveitada |
| ciclo de contrato AMS/horas abertas | automática até 62 dias; acima disso botão "ler o ciclo" | idem (horas abertas usa `ctGaranteReal`) |
| plano desde o início | botão "ler desde o início" | `estado.rentab` (`rpGaranteReal`) |
| semáforo `GET /api/config?sr=KEY` | por projeto, em lotes de 12, 3 em paralelo | 10 minutos; falha não se repete sozinha |

Quem dispara é só `clfGarante(F)`, chamada por `clfRender`.

## Regras de dados
- Projetos do cliente: `c.projetos` dos contratos com `clienteId`, `p.projeto` dos planos com `clienteId` e `f.proj` das frentes de parceria com o mesmo nome do cliente (marcadas "pelo nome"; `CLF_PC_POR_NOME`).
- Receita: horas faturáveis × valor-hora do contrato (regra da Controladoria). Previsto de planos e parcerias fica em "Próximas notas"; plano cujo `contrato` é a parceria não duplica a nota.
- R$ só para `CT_PAPEIS_FIN` (gestor, negócio, diretoria, admin). É lente da tela, não segurança (R222).
- Semáforo: só o manual; sem escolha "automático", sem linha "sem status report".

## Limites e desdobramentos
Um período por vez (R218: 12 meses); parceria só pelo nome (R219); sem PDF (R220); bolsa/projeto sem saldo desde o início da vigência (R221); R$ sem recorte no servidor (R222).

## Testes
Fora do repositório, em `clientes-plano/`: `ficha-calc-test.mjs` (36, `node --test`) e `ficha-tela-test.mjs` (Playwright, 100 asserções, 19 casos) sobre `servidor-ficha.mjs` (porta 8796, fixture determinística com relógio fixo em 2026-11-18). Rodar com `roda.sh 8796 ficha-tela-test.mjs`.
