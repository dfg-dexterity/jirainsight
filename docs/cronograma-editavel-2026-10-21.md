# 📅 Marcos e Cronograma totalmente editável — desenho (2026-10-21)

Pedido: "transforme essa tela em algo totalmente editável" (`?v=cronograma&cproj=COP`).

Hoje a tela só LÊ o Jira (ficha do projeto via conta de serviço): épicos = fases, Data de início (`customfield_10015`) → Data limite (`duedate`) = marco, status, responsável, links "blocks" = dependências, filhos. Tudo que a tela mostra passa a ser editável **com o token da própria pessoa** (como Apontar/Gestão), gravando no Jira — a fonte continua sendo o Jira, sem modelo paralelo.

## O que vira editável
| O quê | Como | Grava em |
| --- | --- | --- |
| Início e marco (datas) | arrastar a barra planejada (move as duas), as bordas (início / marco) e o ◆ (marco) — grade de 1 dia, tooltip com as datas; ✎ formulário | `customfield_10015` (início) e `duedate` (marco) do épico |
| Nome da fase | duplo clique no nome (inline) ou ✎ | `summary` (o prefixo "1.", "2.3" segue ordenando a cascata) |
| Responsável | ✎ (lista de usuários ativos do Jira) | `assignee` |
| Status | ✎ › transições do fluxo (lazy) | transição (`/api/transicao`) |
| Dependências (bloqueado por) | ✎ › marcar/desmarcar outros épicos do projeto | issue links `Blocks` (criar/remover) |
| Itens vencendo depois do marco | ✎ › "📐 Alinhar N itens ao marco" | `duedate` dos filhos (lote) |
| Nova fase | "+ Nova fase" (nome com o próximo prefixo, início, marco, responsável) | cria o épico (`/api/criar`, tipo de hierarquia 1, com `customfield_10015`) |
| Desfazer | barra "↩ desfazer" por 10 s depois de cada edição de datas/nome/responsável | reenvia os valores anteriores |

## Regras
- Sem identidade → explica e leva ao ⏱ Apontar (abreIdentidade). Permissões do Jira valem (erro do Jira aparece na tela, o valor volta).
- **Otimista**: a ficha em memória (`estado.projetos.fichas[proj].epicos`) muda na hora e a tela redesenha; o servidor confirma (POST); falha → reverte + toast. Depois de gravar, a ficha é relida com `nocache=1` em segundo plano (debounce) e o servidor limpa `visao:`/`epicos:`/`atividade:`/`venc:`.
- `crLinhas` (fórmula do semáforo, com gate de paridade com o servidor) **não muda**: a edição só muda os dados de entrada.
- Arrastar só com ponteiro fino (`pointer:fine`); no toque, ✎ e os campos. Links só entre épicos do mesmo projeto.
- Servidor (`api/criar.js` `editar`): campos aceitos por item `venc`, `respId`, `resumo` (1–255), `inicio` (AAAA-MM-DD ou '' = limpa); `links:[{acao:'add', de, para}|{acao:'rm', id}]`; `inicio` também na criação. A ficha passa a trazer o `id` de cada link (para remover).
- Portal do cliente lê a mesma ficha → as mudanças aparecem lá no próximo refresh (sem código novo).

## Fora (roadmap)
Arrastar filhos entre épicos; linha de base e desvio (R062); carteira de marcos (R102); editar a descrição do épico; criar itens filhos pela tela (já existe no 📝 Criar ticket).

## Entregue (2026-10-21)

Tudo da tabela acima, com `cronograma-test.mjs` (Playwright, 41 casos) verde contra o `servidor-mini.mjs`. Decisões de
implementação: edição otimista com reversão na falha; `↩ Desfazer` por 10 s; releitura da ficha com `nocache` 1,5 s depois
da última gravação; clique simples no nome espera 300 ms pelo duplo clique (senão o modal do épico engolia o 2º clique);
arrasto só com ponteiro fino (no toque, ✎ sempre visível com alvo ≥ 44 px). O que ficou de fora virou R150 (itens das
fases) e R151 (trilha das replanejadas) no 🗺️ Roadmap.
