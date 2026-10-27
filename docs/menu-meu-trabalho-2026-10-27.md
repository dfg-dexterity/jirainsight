# 👤 Meu trabalho por intenção — decisão de desenho (2026-10-27)

Pedido do usuário: *"organize melhor o menu Meu trabalho, ser mais explícito — por exemplo um menu
descrever transferir ticket, convidar para apontar, meus tickets em tal projeto; veja o que fica mais
intuitivo"*.

## Como a decisão foi tomada

Três propostas independentes (uma pela rotina do consultor, uma por "três portas, três papéis", uma por
intenção em quatro seções) foram julgadas por três juízes com a mesma grade — explícito · achabilidade ·
tamanho · coerência · viabilidade (0–10 cada, 50 no total) — e a síntese partiu da vencedora,
enxertando as melhores ideias das outras.

| Proposta | Juiz 1 | Juiz 2 | Juiz 3 |
| --- | --- | --- | --- |
| Pela rotina do consultor (tickets → horas e reuniões → semana) | 36 | 36 | 37 |
| Três portas, três papéis (👤 · ➕ · 🔍) | 38 | — | — |
| **Por intenção — 4 seções** | **39** | **vencedora** | **39** |

O que pesou: os três exemplos do pedido ficam nas três primeiras linhas; quatro títulos de seção se leem
antes das treze linhas; o ➕ Novo deixa de ser um segundo catálogo das mesmas coisas.

## O menu

Cabeçalho: **Dexterity Hub · para todos · o que você quer fazer**.

Regra de leitura (está no tour e na ❓ Ajuda): cada linha é **verbo + objeto**; **"…" no fim** = o app
pergunta o ticket ou o projeto antes; **linha recuada** = aba da tela de cima.

| Seção | Linha | Abre |
| --- | --- | --- |
| MEUS TICKETS | 🎫 Ver meus tickets de um projeto… | seletor de projetos (com a contagem dos meus abertos) → ⏱ Apontar "Só os meus" + projeto |
| | 🔗 Transferir ticket com o histórico… | seletor 🎫 "Transferir: escolha o ticket de origem" → assistente 🔗 |
| | 📨 Convidar colegas a apontar… | seletor 🎫 "Convidar a apontar: escolha o ticket" → modal 📨 |
| CRIAR TICKETS | 📝 Criar ticket | `planejar` |
| | ↳ 🌳 Descobrir em que projeto criar | `ondecrio` |
| | ↳ 🧾 Criar tickets do que eu já fiz | `meustickets` |
| MINHAS HORAS E REUNIÕES | ➗ Ratear horas em vários tickets | `rateio` |
| | 📅 Reuniões do Outlook → ticket | `agenda` |
| | ↳ 🎫 Reuniões sem ticket: cobrar ou criar | `agcontrole` |
| | ↳ 📞 Apontar minhas ligações (Mac) | `chamadas` |
| MINHA SEMANA | 📋 Planejar minha semana | `minhasemana` |
| | ↳ 📈 Comparar planejado × realizado | `planrel` com audiência `minha` |
| | ⏳ Ver como gasto meu tempo | `meutempo` |

17 linhas (13 itens + 4 cabeçalhos). Cabe na gaveta do celular sem rolar; no computador o dropdown rola
por dentro quando a janela é baixa.

## O que mudou fora do menu

- **➕ Novo ▾ virou o botão direto "➕ Criar ticket"** (mesmo id `#navg-novo-b`, mesma cor). Os sete
  itens do dropdown antigo moram no 👤 Meu trabalho, cada um com o nome do que faz. Regra: o ➕ nunca é a
  única porta de nada.
- O seletor 🎫 em modo escolher ganhou o **título da ação** e a dica "ticket concluído ou de outro
  projeto: digite a chave".
- O modal de identidade diz **para quê** a identidade é pedida quando a ação veio do menu.
- O seletor de projetos vazio oferece **📝 Criar ticket** em vez de uma lista em branco.
- `marcaVista` acende **todas** as entradas da tela aberta (📝 Criar ticket está no 👤 e no ➕) e, entre
  entradas com audiência, só a da audiência atual.

## O que ficou de fora, de propósito

- **⏱ Apontar não se repete no menu** — está fixo na barra, a um toque. Se o 📊 Uso do painel mostrar
  gente abrindo o 👤 e saindo sem clicar, a 18ª linha reservada é "⏱ Apontar horas" acima do ➗ (R155).
- **🔀 Transformar chamado em atividade** e **🎫 Buscar um ticket** ficaram só no Ctrl+K, nas listas e no
  ícone 🎫 da barra — jargão e raro, no primeiro caso; já tem ícone próprio, no segundo.
- **Os títulos das abas não foram renomeados** (🧾 "Preciso criar meus tickets", 🎫 "Controle de
  tickets", 📞 "Ligações"): os guias e os testes clicam por esses textos. Alinhar `ABAS.rot` ao menu é um
  commit próprio (R155). A barra de abas mostra o grupo e a aba certa já aberta, então quem clica no menu
  não se perde.
- Nenhum slug, link `?v=` ou favorito ⭐ mudou. Os nomes antigos (Agenda, Meu Planejamento, Onde crio o
  ticket?) continuam no título das telas e como palavras-chave do Ctrl+K.

## Riscos acompanhados

- Largura no celular: a síntese propôs "🔗 Transferir ticket com todo o histórico…" e "📨 Convidar colegas
  a apontar num ticket…" (41 caracteres); medidos a 360 px, os dois quebravam em duas linhas — ficaram "🔗
  Transferir ticket com o histórico…" e "📨 Convidar colegas a apontar…" (o "…" já diz que o ticket vem
  depois) e, na gaveta, o ícone de linha sai dos itens do menu (o emoji identifica; são 24 px a mais para o
  rótulo). O teste Playwright confere, a 390 e a 360 px, que nenhum item quebra em duas linhas e que não há
  transbordo horizontal.
- Memória de abas: todo item do 👤 leva `data-exata` — o rótulo diz a tela, então a entrada não troca o
  destino pela última aba usada. É decisão de desenho, não regressão: ⭐, links e Ctrl+K seguem iguais.
