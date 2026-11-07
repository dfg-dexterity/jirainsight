// Jira Insights · 18c · 📊 DASHBOARD DE KPIs (Dexterity Insights) — a linha do tempo dos indicadores, semana a semana e mês a mês.
//
// O pedido (2026-11-06/07): "passe essa tela para os insights e crie diversas visões, principalmente que possa comparar em uma
// linha de tempo os indicadores; quero gráficos e relatórios modernos interativos e KPIs em formato de dashboard; leve em
// consideração desempenho: hoje está lento quando eu vejo por ano". A saída de desempenho é a mesma das 📸 fotos da Rentabilidade e
// do 📊 relatório semanal: o SERVIDOR fotografa os indicadores por SEMANA e por MÊS (api/_lib/kpi.js; linhas kpis_<segunda> e
// kpim_<AAAA-MM> em jirainsight_config, nunca na cfg) e esta tela só LÊ a fatia (GET /api/config?kpis=1&gran=sem|mes) — um ano abre em
// menos de 1 s, sem tocar no Clockwork. Nada aqui recalcula o que o servidor já calculou: tiles, gráficos, quebra, tabela e CSV leem os
// MESMOS números (DSH_IND é a fonte única de cada indicador — rótulo, unidade, fórmula e "como ler").
//
// Quem vê o quê é decidido NO SERVIDOR (recorteKpi): gestor/negócio/diretoria/admin recebem a foto inteira; os demais não recebem nenhum
// R$ (a tela esconde a visão 💰 com um aviso) e só a própria linha de pessoa. `saude` e `time` só existem na foto SEMANAL: no mês a tela
// agrega as semanas cuja segunda cai no mês (estoques = a última foto do mês; fluxos = soma) e diz isso no rodapé.
// Semana/mês CORRENTES são `parcial` (⏳ — o número ainda muda; o gestor pode ↻ atualizar agora).

const DSH_VISTAS = ['dash', 'dashfin', 'dashhoras', 'dashsaude', 'dashtime'];
const DSH_TTL_MS = 10 * 60 * 1000;           // a foto não muda de minuto em minuto: 10 min de cache por sessão bastam
const DSH_MAXN = { sem: 104, mes: 36 };      // retenção do servidor (KPIS_MAX / KPIM_MAX)
const DSH_SEMANAS = { 3: 13, 6: 26, 12: 52 };
const DSH_VE_TUDO = ['gestor', 'negocio', 'diretoria', 'admin'];
const DSH_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DSH_MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
// Estado só da sessão (nasce aqui para o 29-url-topo ler os links kgran/kmeses/kcat/kproj).
estado.dash = estado.dash || {
  gran: 'sem', meses: 12, ate: '', cache: { sem: null, mes: null }, carr: { sem: false, mes: false }, erro: { sem: '', mes: '' }, ver: 0,
  cat: '', proj: '', pessoa: '', comparar: true, ind: {}, tabela: false, qd: {}, off: {}, atualizando: false, _jan: null, filtrosAbertos: false,
};

// ---- datas (sem fuso: tudo ISO AAAA-MM-DD / AAAA-MM) ----
const dshAdd = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const dshSegunda = (iso) => { const [y, m, d] = iso.split('-').map(Number); const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return dshAdd(iso, -((dow + 6) % 7)); };
const dshFimMes = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const dshMesMais = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
// as `n` chaves (segundas ou meses) terminando em `fim`, em ordem cronológica
function dshChaves(gran, fim, n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(gran === 'sem' ? dshAdd(fim, -7 * i) : dshMesMais(fim, -i)); return out; }
const dshRotX = (gran, x) => (gran === 'sem' ? `${x.slice(8, 10)}/${x.slice(5, 7)}` : `${DSH_MES[+x.slice(5, 7) - 1]}/${x.slice(2, 4)}`);
const dshLeituraX = (gran, x) => (gran === 'sem' ? `Semana de ${dataBR(x)} a ${dataBR(dshAdd(x, 6))}` : `${DSH_MES_LONGO[+x.slice(5, 7) - 1]} de ${x.slice(0, 4)}`);
const dshNum = (v) => ((typeof v === 'number' && Number.isFinite(v)) ? v : null);
function dshQuando(iso) { try { const d = new Date(iso); if (Number.isNaN(d.getTime())) return ''; return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }

// ===========================================================================
// Indicadores — a fonte ÚNICA (tiles, chips, gráfico, quebra, tabela, CSV e o glossário leem daqui)
// de(rec, F, S): valor do período; S = recorte fin/horas (dshEsc) para os grupos fin e horas.
// q(entrada): o mesmo indicador numa linha da quebra (categoria/projeto/pessoa…) — null quando a linha não tem como calculá-lo.
// ===========================================================================
const _dshR = (a, b) => (b > 0 ? a / b * 100 : null);
const DSH_IND = [
  // ---- 💰 Financeiro ----
  { id: 'receita', grupo: 'fin', rot: 'Receita', un: 'R$', bom: 'cima', cor: 0, tile: 1, de: (r, F, S) => S && S.r, q: (e) => e.r,
    calc: 'Σ horas FATURÁVEIS × valor-hora do contrato do projeto (o contrato que tem valor-hora). Projeto sem contrato não gera receita.',
    ler: 'Quanto o trabalho faturável do período vale em dinheiro. Subir é bom; a semana ou o mês em andamento (⏳) ainda está incompleto.' },
  { id: 'custo', grupo: 'fin', rot: 'Custo', un: 'R$', bom: null, cor: 1, tile: 1, de: (r, F, S) => S && S.c, q: (e) => e.c,
    calc: 'Σ horas apontadas × custo/h de cada pessoa (custo do Odoo ou digitado; sem custo próprio vale o custo padrão da Controladoria).',
    ler: 'O que o time custou no período, todas as horas (faturáveis ou não). Subir sem a receita acompanhar aperta a margem.' },
  { id: 'margem', grupo: 'fin', rot: 'Margem', un: 'R$', bom: 'cima', cor: 3, tile: 1, de: (r, F, S) => (S && S.r != null && S.c != null ? S.r - S.c : null), q: (e) => (e.r != null && e.c != null ? e.r - e.c : null),
    calc: 'Receita − custo, em R$.', ler: 'A sobra em dinheiro. Negativa = o período custou mais do que faturou.' },
  { id: 'margempct', grupo: 'fin', rot: 'Margem %', un: '%', bom: 'cima', cor: 2, tile: 1, tom: 'mg',
    de: (r, F, S) => (S && S.r > 0 && S.c != null ? (S.r - S.c) / S.r * 100 : null), q: (e) => (e.r > 0 && e.c != null ? (e.r - e.c) / e.r * 100 : null),
    calc: '(receita − custo) ÷ receita. Sem receita (sem contrato com valor-hora) não há percentual.',
    ler: '≥ 30% saudável · 10–29% apertada · abaixo de 10% no vermelho (a mesma régua da 🏦 Controladoria).' },
  { id: 'custogest', grupo: 'fin', rot: 'Custo de gestão', un: 'R$', bom: null, cor: 4, tile: 1, de: (r, F, S) => S && S.cg, q: (e) => e.cg,
    calc: 'Parte do custo feita por quem está na lista de gestores (⚙️ Configurações).', ler: 'Quanto do custo é gestão. Compare com o custo total para ver o peso da gestão.' },
  // ---- ⏱ Horas ----
  { id: 'real', grupo: 'horas', rot: 'Horas realizadas', un: 'h', bom: null, cor: 0, tile: 1, de: (r, F, S) => S && S.h, q: (e) => e.h,
    calc: 'Σ horas apontadas no período (Clockwork), em todos os projetos do recorte.', ler: 'Todo o trabalho apontado — o esforço total do período.' },
  { id: 'fat', grupo: 'horas', rot: 'Horas faturáveis', un: 'h', bom: 'cima', cor: 1, tile: 1, de: (r, F, S) => S && S.hf, q: (e) => e.hf,
    calc: 'Horas realizadas cujo tipo de ticket é faturável E cujo projeto está numa categoria faturável (DEA, DEF, PEA, PEF, DAMS, PAMS).',
    ler: 'A parte do esforço que gera receita. Interno (IMI, IPA, ITPR) e arquivado nunca entram.' },
  { id: 'vend', grupo: 'horas', rot: 'Horas vendidas', un: 'h', bom: null, cor: 3, tile: 1, de: (r, F, S) => S && S.vend, q: (e) => e.vend,
    calc: 'Horas vendidas rateadas no período (planos da 💹 Rentabilidade com projeto; horas digitadas por mês valem mais que o cálculo).',
    ler: 'O que foi vendido para o período. Só entra projeto com plano na Rentabilidade — sem plano, o vendido é zero.' },
  { id: 'pctfat', grupo: 'horas', rot: '% faturável', un: '%', bom: 'cima', cor: 0, tile: 1, de: (r, F, S) => (S && S.h > 0 ? S.hf / S.h * 100 : null), q: (e) => _dshR(e.hf, e.h),
    calc: 'Horas faturáveis ÷ horas realizadas.', ler: 'Quanto do esforço vira receita. Subir é bom.' },
  { id: 'consumo', grupo: 'horas', rot: 'Consumo do vendido', un: '%', bom: null, cor: 2, tile: 1, tom: 'cons', de: (r, F, S) => (S && S.vend > 0 ? S.ch / S.vend * 100 : null), q: (e) => _dshR(e.ch, e.vend),
    calc: 'Horas realizadas nos projetos que têm horas vendidas ÷ horas vendidas no período.',
    ler: 'Acima de 100% o time gastou mais horas do que foi vendido; de 85% a 100% é risco. Só conta projeto com plano.' },
  // ---- 🩺 Saúde da entrega (foto semanal) ----
  { id: 'vencidos', grupo: 'saude', rot: 'Vencidos', un: 'n', bom: 'baixo', cor: 0, tile: 1, momento: true, de: (r, F) => dshSaudeV(r, F, 'vencidos'), q: (e) => dshNum(e.vencidos),
    calc: 'Tickets ABERTOS com vencimento anterior ao dia da foto (fora ARQ).', ler: 'Tickets que já deviam ter sido entregues. Cair é bom. Foto do momento: semanas retroativas não têm este número.' },
  { id: 'bugs', grupo: 'saude', rot: 'Bugs abertos', un: 'n', bom: 'baixo', cor: 1, tile: 1, momento: true, de: (r, F) => dshSaudeV(r, F, 'bugs'), q: (e) => dshNum(e.bugs),
    calc: 'Tickets abertos de tipo bug, erro, defeito, incidente ou falha.', ler: 'Defeitos esperando correção. Cair é bom.' },
  { id: 'parados', grupo: 'saude', rot: 'Parados', un: 'n', bom: 'baixo', cor: 2, tile: 1, momento: true, de: (r, F) => dshSaudeV(r, F, 'parados'), q: (e) => dshNum(e.parados),
    calc: 'Tickets em andamento sem atualização há N dias (N = ⚙️ relatório semanal › parado, padrão 5).', ler: 'Trabalho começado que não anda. Cair é bom.' },
  { id: 'semvenc', grupo: 'saude', rot: 'Sem vencimento', un: 'n', bom: 'baixo', cor: 3, momento: true, de: (r, F) => dshSaudeV(r, F, 'semVenc'), q: () => null,
    calc: 'Tickets abertos sem data de vencimento (fora épico e história). Não se divide por projeto.', ler: 'Sem data não há como cobrar nem planejar.' },
  { id: 'semresp', grupo: 'saude', rot: 'Sem responsável', un: 'n', bom: 'baixo', cor: 4, momento: true, de: (r, F) => dshSaudeV(r, F, 'semResp'), q: () => null,
    calc: 'Tickets abertos sem responsável (fora épico e história). Não se divide por projeto.', ler: 'Ticket sem dono não anda.' },
  { id: 'criados', grupo: 'saude', rot: 'Criados', un: 'n', bom: null, cor: 1, tipo: 'bar', grp: 'fluxo', tile: 0, de: (r, F) => dshSaudeV(r, F, 'criados'), q: (e) => dshNum(e.criados),
    calc: 'Tickets criados na janela (JQL created).', ler: 'A demanda que entrou. Compare com os concluídos.' },
  { id: 'concluidos', grupo: 'saude', rot: 'Concluídos', un: 'n', bom: 'cima', cor: 0, tipo: 'bar', grp: 'fluxo', tile: 1, de: (r, F) => dshSaudeV(r, F, 'concluidos'), q: (e) => dshNum(e.concluidos),
    calc: 'Tickets resolvidos na janela (JQL resolved).', ler: 'A entrega do período. Subir é bom.' },
  { id: 'saldo', grupo: 'saude', rot: 'Saldo (criados − concluídos)', un: 'n', bom: 'baixo', cor: 2, tipo: 'line', grp: 'fluxo', tile: 1, de: (r, F) => dshSaudeV(r, F, 'saldo'), q: (e) => (e.criados != null && e.concluidos != null ? e.criados - e.concluidos : null),
    calc: 'Criados − concluídos na janela.', ler: 'Positivo = o backlog cresceu; negativo = o time deu conta de mais do que entrou.' },
  { id: 'execpct', grupo: 'saude', rot: 'Execução (tickets abertos)', un: '%', bom: null, cor: 2, tile: 1, tom: 'exec', momento: true, de: (r, F) => { const s = dshSaudeEsc(r, F); return s && s.exec && s.exec.est > 0 ? s.exec.gasto / s.exec.est * 100 : null; },
    q: (e) => _dshR(e.gasto, e.est),
    calc: 'Horas gastas ÷ horas estimadas dos tickets que estavam ABERTOS no momento da foto (não é o esforço de toda a entrega).', ler: 'Estimado × gasto dos tickets abertos naquele momento. Acima de 100% o que está em aberto já consumiu mais do que o estimado.' },
  { id: 'sem_verde', grupo: 'saude', rot: '🟢 Projetos verdes', un: 'n', bom: null, corFixa: DSH_STATUS.ok, stack: 'sem', momento: true, de: (r, F) => dshSemaforo(r, F, 'verde'),
    calc: 'Projetos ativos com o semáforo verde escolhido pelo gerente na situação do 📋 Status report. Projeto sem semáforo escolhido conta como "sem" e não entra em nenhuma das três cores.', ler: 'O semáforo que o gerente escolheu em cada projeto — o sugerido pelo app não é gravado na foto.' },
  { id: 'sem_amarelo', grupo: 'saude', rot: '🟡 Projetos amarelos', un: 'n', bom: null, corFixa: DSH_STATUS.warn, stack: 'sem', momento: true, de: (r, F) => dshSemaforo(r, F, 'amarelo'),
    calc: 'Projetos ativos com o semáforo amarelo escolhido pelo gerente (sem escolha = "sem").', ler: 'Em atenção.' },
  { id: 'sem_vermelho', grupo: 'saude', rot: '🔴 Projetos vermelhos', un: 'n', bom: null, corFixa: DSH_STATUS.err, stack: 'sem', momento: true, de: (r, F) => dshSemaforo(r, F, 'vermelho'),
    calc: 'Projetos ativos com o semáforo vermelho escolhido pelo gerente (sem escolha = "sem").', ler: 'Críticos.' },
  // ---- 👥 Time e capacidade (foto semanal) ----
  { id: 'tcap', grupo: 'time', rot: 'Capacidade', un: 'h', bom: null, cor: 3, tile: 1, de: (r, F) => dshTimeV(r, F, 'cap'), q: (e) => dshNum(e.cap),
    calc: 'Horas disponíveis do time na semana (meta diária × dias úteis − ausências).', ler: 'O tamanho da semana: quanto o time poderia entregar.' },
  { id: 'tplan', grupo: 'time', rot: 'Planejado', un: 'h', bom: null, cor: 1, tile: 1, de: (r, F) => dshTimeV(r, F, 'plan'), q: (e) => dshNum(e.plan),
    calc: 'Horas do plano semanal (📋 Meu Planejamento) enviado ou aprovado.', ler: 'O que o time se comprometeu a fazer.' },
  { id: 'treal', grupo: 'time', rot: 'Realizado', un: 'h', bom: null, cor: 0, tile: 1, de: (r, F) => dshTimeV(r, F, 'real'), q: (e) => dshNum(e.real),
    calc: 'Horas apontadas na semana (fora as pessoas ocultas).', ler: 'O que de fato foi apontado.' },
  { id: 'texec', grupo: 'time', rot: 'Execução do plano', un: '%', bom: 'cima', cor: 0, tile: 1, de: (r, F) => dshTimeV(r, F, 'exec'), q: (e) => _dshR(e.real, e.plan),
    calc: 'Realizado ÷ planejado de quem enviou plano (0–100+). No mês: média das semanas, ponderada pelo planejado.', ler: 'Quanto do plano virou apontamento.' },
  { id: 'tader', grupo: 'time', rot: 'Aderência ao plano', un: '%', bom: 'cima', cor: 1, tile: 1, de: (r, F) => dshTimeV(r, F, 'ader'), q: () => null,
    calc: 'Quanto do realizado caiu nas atividades/dias/projetos que foram planejados (chaves pessoa·dia·projeto).', ler: 'Executar muito fora do plano derruba a aderência.' },
  { id: 'tcapuso', grupo: 'time', rot: 'Capacidade usada', un: '%', bom: null, cor: 2, tile: 1, tom: 'cap', de: (r, F) => { const t = dshTimeEsc(r, F); return t && t.cap > 0 ? t.real / t.cap * 100 : null; }, q: (e) => _dshR(e.real, e.cap),
    calc: 'Realizado ÷ capacidade.', ler: 'Perto de 100% é o time cheio: de 80% a 105% no ritmo · até 120% acima da capacidade · além disso, sobrecarga; abaixo de 80%, ociosidade ou apontamento atrasado.' },
  { id: 'tausH', grupo: 'time', rot: 'Ausências', un: 'h', bom: null, cor: 4, de: (r, F) => dshTimeV(r, F, 'ausH'), q: () => null,
    calc: 'Horas de ausência cadastradas (⚙️ Metas & ausências) × meta diária.', ler: 'Capacidade que já saiu da semana por férias, atestados e feriados.' },
];
const DSH_BY = Object.fromEntries(DSH_IND.map((i) => [i.id, i]));
const DSH_VIS = {
  dash: { rot: '📈 Resumo dos KPIs', grupo: null, titulo: 'Dashboard de KPIs', sub: 'os indicadores principais, semana a semana e mês a mês' },
  dashfin: { rot: '💰 Financeiro', grupo: 'fin', titulo: 'Financeiro', sub: 'receita, custo e margem ao longo do tempo', padrao: ['receita', 'custo', 'margem', 'margempct'], quebra: ['cat', 'proj', 'pessoa'] },
  dashhoras: { rot: '⏱ Horas', grupo: 'horas', titulo: 'Horas: realizadas × faturáveis × vendidas', sub: 'o esforço do time contra o que foi vendido', padrao: ['real', 'fat', 'vend', 'pctfat', 'consumo'], quebra: ['cat', 'proj', 'pessoa', 'nivel', 'tipo'] },
  dashsaude: { rot: '🩺 Saúde da entrega', grupo: 'saude', titulo: 'Saúde da entrega', sub: 'vencidos, bugs, parados, criados × concluídos e os semáforos dos projetos', padrao: ['vencidos', 'bugs', 'parados', 'criados', 'concluidos', 'execpct'], quebra: ['proj'] },
  dashtime: { rot: '👥 Time e capacidade', grupo: 'time', titulo: 'Time e capacidade', sub: 'capacidade, planejado e realizado, execução e aderência', padrao: ['tcap', 'tplan', 'treal', 'texec', 'tader'], quebra: ['pessoa'] },
};
// Visão geral: 8 tiles (cada um leva à sua visão) e 4 gráficos pequenos (um por visão)
const DSH_GERAL_TILES = [['receita', 'dashfin'], ['margempct', 'dashfin'], ['real', 'dashhoras'], ['pctfat', 'dashhoras'], ['consumo', 'dashhoras'], ['vencidos', 'dashsaude'], ['bugs', 'dashsaude'], ['tcapuso', 'dashtime']];
const DSH_GERAL_MINIS = [['dashfin', ['receita', 'custo']], ['dashhoras', ['real', 'fat', 'vend']], ['dashsaude', ['vencidos', 'bugs', 'parados']], ['dashtime', ['tcap', 'tplan', 'treal']]];
const DSH_NIVEL_ROT = { senior: 'Sênior', pleno: 'Pleno', junior: 'Júnior', '': 'Sem nível' };

// ===========================================================================
// Leitura (cache na sessão por granularidade) — nunca refaz sozinho em erro (o botão "Tentar de novo" limpa e refaz)
// ===========================================================================
// Revisão de 2026-11-07: o cache das fotos (com R$) e os papéis são da IDENTIDADE que os leu. Trocar de usuário ou esquecer as
// credenciais no ⏱ Apontar, na mesma aba, não pode manter receita, custo e o ↻ de gestor por até 10 min (o servidor recorta por
// papel; o navegador não pode contrariar). A chave é o accountId (ou o e-mail, se o Jira ainda não o devolveu).
function dshIdk() { const id = (typeof idApontar === 'function' && idApontar()) || null; return id ? String(id.accountId || id.email || '') : ''; }
function dshZeraCache() {
  const D = estado.dash; D.cache = { sem: null, mes: null }; D.erro = { sem: '', mes: '' }; D.ver++; D._jan = null; D._mapa = null;
  D.pessoa = ''; D.atualizando = false;   // a pessoa filtrada pode nem ser visível para a nova identidade
}
function dshHeaders() { const id = (typeof idApontar === 'function' && idApontar()) || {}; return { 'x-jira-email': id.email || '', 'x-jira-token': id.token || '' }; }
function dshPapeis() { const c = estado.dash.cache; return (c.sem && c.sem.papeis) || (c.mes && c.mes.papeis) || []; }
const dshVeTudo = () => dshPapeis().some((p) => DSH_VE_TUDO.includes(p));
const dshPodeAtualizar = () => dshPapeis().some((p) => p === 'gestor' || p === 'admin');
function dshJanelaW() { const D = estado.dash; return D.gran === 'sem' ? (DSH_SEMANAS[D.meses] || 52) : D.meses; }
// O que a visão precisa ler: fin/horas vêm da granularidade escolhida; saúde e time só existem na semanal (no mês, derivados dela).
function dshNecessidades() {
  const D = estado.dash; const v = estado.vista; const W = dshJanelaW(); const f = (D.comparar && v !== 'dash') ? 2 : 1; const need = {};   // a Visão geral não compara: não dobra o pedido
  const soSemanal = v === 'dashsaude' || v === 'dashtime';
  if (D.gran === 'sem') need.sem = Math.min(DSH_MAXN.sem, W * f);
  else {
    if (!soSemanal) need.mes = Math.min(DSH_MAXN.mes, W * f);
    if (v === 'dash' || soSemanal) need.sem = Math.min(DSH_MAXN.sem, Math.ceil(D.meses * 4.35 * f) + 1);
  }
  return need;
}
function dshCarrega(gran, n) {
  const D = estado.dash; if (D.carr[gran]) return;
  const idk = dshIdk();
  D.carr[gran] = true; D.erro[gran] = '';
  fetch(`/api/config?kpis=1&gran=${gran}&n=${n}${/^\d{4}-\d{2}-\d{2}$/.test(D.ate) ? '&ate=' + D.ate : ''}`, { headers: dshHeaders(), cache: 'no-store' })
    .then((r) => r.json().catch(() => ({ ok: false, erro: `Resposta inesperada do servidor (HTTP ${r.status}).` })))
    .then((j) => {
      D.carr[gran] = false;
      if (idk !== dshIdk()) { if (DSH_VISTAS.includes(estado.vista)) renderDash(); return; }   // a identidade mudou no meio da leitura: descarta
      if (!j || j.ok === false) D.erro[gran] = (j && j.erro) || 'Não consegui ler as fotos de KPI.';
      else { D.cache[gran] = { n, itens: j.itens || [], pendentes: j.pendentes || 0, em: Date.now(), papeis: j.papeis || [], accountId: j.accountId || '', idk, de: j.de || '', fim: j.fim || '', horizonteSem: j.horizonteSem || '', horizonteMes: j.horizonteMes || '' }; D.ver++; D._jan = null; }
      if (DSH_VISTAS.includes(estado.vista)) renderDash();
    })
    .catch((e) => { D.carr[gran] = false; if (idk !== dshIdk()) { if (DSH_VISTAS.includes(estado.vista)) renderDash(); return; } D.erro[gran] = `Sem resposta do servidor (${String((e && e.message) || e)}).`; if (DSH_VISTAS.includes(estado.vista)) renderDash(); });
}
function dshGarante() {
  const D = estado.dash; const eu = dshIdk();
  if (['sem', 'mes'].some((g) => D.cache[g] && D.cache[g].idk !== eu)) dshZeraCache();
  const need = dshNecessidades();
  Object.entries(need).forEach(([gran, n]) => {
    const c = D.cache[gran];
    if ((!c || c.n < n || Date.now() - c.em > DSH_TTL_MS) && !D.carr[gran] && !D.erro[gran]) dshCarrega(gran, n);
  });
}
// ↻ atualizar agora (gestor/admin): o servidor refaz a semana e o mês CORRENTES e devolve as duas fotos — entram no cache sem reler tudo.
async function dshAtualiza() {
  const D = estado.dash; if (D.atualizando) return; D.atualizando = true; renderDash();
  let j = null;
  try { j = await fetch('/api/config?kpis=1', { method: 'POST', headers: { 'Content-Type': 'application/json', ...dshHeaders() }, body: JSON.stringify({ acao: 'atualizar' }) }).then((r) => r.json()); }
  catch (e) { j = { ok: false, erro: String((e && e.message) || e) }; }
  D.atualizando = false;
  if (!j || !j.ok) { toast('⚠ Não deu para atualizar agora: ' + humanizaErro((j && j.erro) || 'sem resposta do servidor'), 'err'); renderDash(); return; }
  (j.itens || []).forEach((f) => {
    const c = D.cache[f.gran]; if (!c) return;
    const i = c.itens.findIndex((x) => x.chave === f.chave); if (i >= 0) c.itens[i] = f; else { c.itens.push(f); c.itens.sort((a, b) => (a.chave < b.chave ? -1 : 1)); }
  });
  D.ver++; D._jan = null;
  toast('✓ Semana e mês correntes refeitos agora.', 'ok'); renderDash();
}

// ===========================================================================
// Registros do período: uma linha por semana/mês, com buraco (vazio) quando o servidor ainda não fotografou
// ===========================================================================
function dshRecVazio(gran, chave) {
  const de = gran === 'sem' ? chave : chave + '-01'; const ate = gran === 'sem' ? dshAdd(chave, 6) : dshFimMes(chave);
  return { chave, gran, de, ate, vazio: true, parcial: ate >= hojeSP() };
}
// saúde de um mês = as semanas cuja SEGUNDA cai nele: fluxos somam; estoques (vencidos, bugs…) valem pela última foto de momento do mês
function dshSaudeMes(fs) {
  const com = fs.filter((f) => f.saude); if (!com.length) return null;
  const vivos = com.filter((f) => !f.saude.retro); const ult = vivos.length ? vivos[vivos.length - 1].saude : null;
  const soma = (k) => com.reduce((s, f) => s + (Number(f.saude[k]) || 0), 0);
  const criados = soma('criados'); const concluidos = soma('concluidos');
  const S = { criados, concluidos, saldo: criados - concluidos, retro: !ult, semaforos: ult ? ult.semaforos : null, exec: ult ? ult.exec : null, porProj: {} };
  ['vencidos', 'bugs', 'parados', 'semVenc', 'semResp'].forEach((k) => { S[k] = ult ? ult[k] : null; });
  com.forEach((f) => Object.entries(f.saude.porProj || {}).forEach(([k, p]) => { const L = S.porProj[k] = S.porProj[k] || { criados: 0, concluidos: 0 }; L.criados += p.criados || 0; L.concluidos += p.concluidos || 0; }));
  if (ult) Object.entries(ult.porProj || {}).forEach(([k, p]) => { const L = S.porProj[k] = S.porProj[k] || { criados: 0, concluidos: 0 }; ['vencidos', 'bugs', 'parados', 'semaforo', 'est', 'gasto'].forEach((c) => { L[c] = p[c]; }); });
  return S;
}
function dshTimeMes(fs) {
  const com = fs.filter((f) => f.time); if (!com.length) return null;
  const soma = (k) => com.reduce((s, f) => s + (Number(f.time[k]) || 0), 0);
  const pond = (k) => { let num = 0; let den = 0; com.forEach((f) => { const v = f.time[k]; const w = Number(f.time.plan) || 0; if (v != null && w > 0) { num += v * w; den += w; } }); return den > 0 ? Math.round(num / den) : null; };
  const T = { cap: soma('cap'), plan: soma('plan'), real: soma('real'), realFat: soma('realFat'), ausH: soma('ausH'), semPlano: soma('semPlano'), naoFeito: soma('naoFeito'), exec: pond('exec'), ader: pond('ader'),
    pessoasComPlano: Math.max(...com.map((f) => f.time.pessoasComPlano || 0)), pessoas: com[com.length - 1].time.pessoas, porPessoa: {} };
  com.forEach((f) => Object.entries(f.time.porPessoa || {}).forEach(([a, p]) => { const U = T.porPessoa[a] = T.porPessoa[a] || { nome: p.nome, cap: 0, plan: 0, real: 0 }; U.cap += p.cap || 0; U.plan += p.plan || 0; U.real += p.real || 0; }));
  return T;
}
// A janela: `atual` (W períodos) e `ant` (os W anteriores, para o "comparar"), memorizada pela versão do cache.
function dshJanela() {
  const D = estado.dash; const chave = `${D.ver}|${D.gran}|${D.meses}`;
  if (D._jan && D._jan.k === chave) return D._jan;
  const W = dshJanelaW(); const hoje = hojeSP(); const gran = D.gran;
  const fim = gran === 'sem' ? dshSegunda(hoje) : hoje.slice(0, 7);
  const chaves = dshChaves(gran, fim, W * 2);
  const semPor = {}; ((D.cache.sem && D.cache.sem.itens) || []).forEach((f) => { semPor[f.chave] = f; });
  const mesPor = {}; ((D.cache.mes && D.cache.mes.itens) || []).forEach((f) => { mesPor[f.chave] = f; });
  const recs = chaves.map((c) => {
    if (gran === 'sem') return semPor[c] || dshRecVazio('sem', c);
    const f = mesPor[c]; const semanas = Object.values(semPor).filter((s) => s.chave.slice(0, 7) === c).sort((a, b) => (a.chave < b.chave ? -1 : 1));
    const saude = dshSaudeMes(semanas); const time = dshTimeMes(semanas);
    if (!f && !saude && !time) return dshRecVazio('mes', c);
    const base = f || dshRecVazio('mes', c);
    let fotoEm = base.fotoEm || ''; semanas.forEach((w) => { if (w.fotoEm && w.fotoEm > fotoEm) fotoEm = w.fotoEm; });   // revisão de 2026-11-07: o mês derivado herda a foto mais recente das semanas
    return { chave: c, gran: 'mes', de: base.de, ate: base.ate, parcial: base.parcial, fotoEm: fotoEm || undefined, vazio: false, fin: f ? f.fin : null, horas: f ? f.horas : null, saude, time, truncado: f ? f.truncado : null, derivado: !!(saude || time) };
  });
  D._jan = { k: chave, gran, W, atual: recs.slice(W), ant: recs.slice(0, W), fim };
  return D._jan;
}
const dshTemFoto = (r) => !!(r && !r.vazio && (r.fin || r.horas || r.saude || r.time));
// Horizonte das fotos, vindo do servidor na resposta do ?kpis=1 (horizonteSem = segunda mais antiga fotografada, 'AAAA-MM-DD';
// horizonteMes = mês fechado mais antigo, 'AAAA-MM'). Vazio = desconhecido (servidor antigo) — a tela não supõe nada.
function dshHorizonte(gran) { const c = estado.dash.cache; const k = gran === 'sem' ? 'horizonteSem' : 'horizonteMes'; return (c.sem && c.sem[k]) || (c.mes && c.mes[k]) || ''; }
const dshChaveDe = (r, gran) => (gran === 'sem' ? String(r.de || r.chave || '').slice(0, 10) : String(r.chave || r.de || '').slice(0, 7));
const dshHorizonteBR = (hor, gran) => (gran === 'sem' ? dataBR(hor) : `${hor.slice(5, 7)}/${hor.slice(0, 4)}`);

// ===========================================================================
// Recortes (filtros) e valores
// ===========================================================================
// categoria/projeto de cada chave, visto em qualquer foto carregada (a saúde só traz a chave)
function dshMapaProj() {
  const D = estado.dash; if (D._mapa && D._mapa.v === D.ver) return D._mapa.m;
  const m = {};
  ['sem', 'mes'].forEach((g) => ((D.cache[g] && D.cache[g].itens) || []).forEach((f) => {
    Object.entries((f.fin && f.fin.porProj) || {}).forEach(([k, p]) => { m[k] = { nome: p.nome, cat: p.cat }; });
    Object.entries((f.horas && f.horas.porProj) || {}).forEach(([k, p]) => { if (!m[k] && p.cat) m[k] = { nome: p.nome, cat: p.cat }; });
  }));
  D._mapa = { v: D.ver, m }; return m;
}
const dshFiltro = () => { const D = estado.dash; return { cat: D.cat, proj: D.proj, pessoa: D.pessoa }; };
// Revisão de 2026-11-07: quem não vê o time todo (sem gestor/negócio/diretoria/admin) recebe do servidor só a PRÓPRIA linha do plano;
// os totais do time que a foto traz ao lado não são dela. Em 👥 a tela fixa a pessoa = ela mesma (tiles e gráfico da própria linha;
// o rodapé diz isso). Só o grupo `time` — as horas por categoria/projeto continuam as do recorte de qualquer perfil.
function dshEuForcado() { if (dshVeTudo() || !dshPapeis().length) return ''; const c = estado.dash.cache; return (c.sem && c.sem.accountId) || (c.mes && c.mes.accountId) || ''; }
// cada grupo só aplica os filtros que fazem sentido (saúde não se divide por pessoa; o plano semanal não se divide por projeto)
function dshFGrupo(grupo, F) {
  if (grupo === 'saude') return { cat: F.cat, proj: F.proj, pessoa: '' };
  if (grupo === 'time') return { cat: '', proj: '', pessoa: dshEuForcado() || F.pessoa };
  return F.pessoa ? { cat: '', proj: '', pessoa: F.pessoa } : { cat: F.cat, proj: F.proj, pessoa: '' };
}
// fin + horas no recorte: { h, hf, r, c, cg, vend, ch } (r/c/cg null quando o perfil não recebe R$)
function dshEsc(rec, F) {
  const k = `${F.cat}|${F.proj}|${F.pessoa}`; if (rec._ek === k) return rec._e;
  let S = null; const fin = rec.fin; const ho = rec.horas;
  if (fin || ho) {
    const temR = !!(fin && typeof fin.receita === 'number');
    S = { h: null, hf: null, r: null, c: null, cg: null, vend: null, ch: null };
    const projs = (ho && ho.porProj) || {};
    if (F.pessoa) { const p = fin && fin.porPessoa && fin.porPessoa[F.pessoa]; S.h = p ? p.h : 0; S.hf = p ? p.hf : 0; if (temR) S.c = p ? p.c : 0; }
    else if (F.proj) {
      const p = fin && fin.porProj && fin.porProj[F.proj]; const hp = projs[F.proj];
      S.h = hp ? hp.h : (p ? p.h : 0); S.hf = hp ? hp.hf : (p ? p.hf : 0); S.vend = hp ? hp.vend : 0; S.ch = S.vend > 0 ? S.h : 0;
      if (temR) { S.r = p ? p.r : 0; S.c = p ? p.c : 0; S.cg = p ? p.cg : 0; }
    } else if (F.cat) {
      const c = fin && fin.porCat && fin.porCat[F.cat]; const hc = ho && ho.porCat && ho.porCat[F.cat];
      S.h = hc ? hc.h : (c ? c.h : 0); S.hf = hc ? hc.hf : (c ? c.hf : 0); S.vend = 0; S.ch = 0;
      Object.values(projs).forEach((p) => { if (p.cat === F.cat) { S.vend += p.vend || 0; if (p.vend > 0) S.ch += p.h || 0; } });
      if (temR) { S.r = c ? c.r : 0; S.c = c ? c.c : 0; S.cg = c ? c.cg : 0; }
    } else if (ho) {
      S.h = ho.real; S.hf = ho.fat; S.vend = ho.vend; S.ch = 0; Object.values(projs).forEach((p) => { if (p.vend > 0) S.ch += p.h || 0; });
      if (temR) { S.r = fin.receita; S.c = fin.custo; S.cg = fin.custoGest; }
    }
  }
  rec._ek = k; rec._e = S; return S;
}
function dshSaudeEsc(r, F) {
  const s = r && r.saude; if (!s) return null;
  if (!F.cat && !F.proj) return s;
  const mapa = dshMapaProj();
  const O = { vencidos: 0, bugs: 0, parados: 0, semVenc: null, semResp: null, criados: 0, concluidos: 0, saldo: 0, retro: s.retro, exec: { est: 0, gasto: 0 }, semaforos: { verde: 0, amarelo: 0, vermelho: 0, sem: 0 } };
  Object.entries(s.porProj || {}).forEach(([k, p]) => {
    if (F.proj ? k !== F.proj : ((mapa[k] || {}).cat !== F.cat)) return;
    O.vencidos += p.vencidos || 0; O.bugs += p.bugs || 0; O.parados += p.parados || 0; O.criados += p.criados || 0; O.concluidos += p.concluidos || 0;
    O.exec.est += p.est || 0; O.exec.gasto += p.gasto || 0; const sm = p.semaforo; if (sm && O.semaforos[sm] != null) O.semaforos[sm] += 1;
  });
  O.saldo = O.criados - O.concluidos;
  if (s.retro) { O.vencidos = O.bugs = O.parados = null; O.exec = null; O.semaforos = null; }
  return O;
}
const _dshMomento = ['vencidos', 'bugs', 'parados', 'semVenc', 'semResp'];
function dshSaudeV(r, F, k) { const s = dshSaudeEsc(r, F); if (!s) return null; if (s.retro && _dshMomento.includes(k)) return null; return dshNum(s[k]); }
function dshSemaforo(r, F, cor) { const s = dshSaudeEsc(r, F); return s && s.semaforos ? dshNum(s.semaforos[cor]) : null; }
function dshTimeEsc(r, F) {
  const t = r && r.time; if (!t) return null;
  if (F.pessoa) { const p = (t.porPessoa || {})[F.pessoa] || { cap: 0, plan: 0, real: 0 }; return { cap: p.cap, plan: p.plan, real: p.real, exec: p.plan > 0 ? Math.round(p.real / p.plan * 100) : null, ader: null, ausH: null }; }
  return t;
}
function dshTimeV(r, F, k) { const t = dshTimeEsc(r, F); return t ? dshNum(t[k]) : null; }
function dshVal(ind, rec, F) {
  if (!rec || rec.vazio) return null;
  const FF = dshFGrupo(ind.grupo, F);
  const S = (ind.grupo === 'fin' || ind.grupo === 'horas') ? dshEsc(rec, FF) : null;
  if ((ind.grupo === 'fin' || ind.grupo === 'horas') && !S) return null;
  let v = null; try { v = ind.de(rec, FF, S); } catch (e) { v = null; }
  return dshNum(v);
}
// o perfil recebe R$? (o servidor recorta; `fin.receita` ausente = sem R$)
function dshSemFin() {
  const j = dshJanela(); const r = j.atual.slice().reverse().find((x) => x.fin) || j.ant.slice().reverse().find((x) => x.fin);
  if (r) return typeof r.fin.receita !== 'number';
  return !dshVeTudo() && dshPapeis().length > 0;
}

// ===========================================================================
// Gráficos
// ===========================================================================
function dshCorInd(ind) { return ind.corFixa || dshCorDe(ind.cor || 0); }
function dshGruposDe(ids) {
  const out = [];
  // Revisão de 2026-11-07: estoques (vencidos, bugs…) e fluxos (criados × concluídos) não dividem o gráfico: `grp` põe o fluxo num
  // grupo próprio (barras AGRUPADAS, não empilhadas — `stack` só existe nos semáforos).
  ids.forEach((id) => { const ind = DSH_BY[id]; if (!ind) return; const gk = ind.stack || ind.grp || ind.un; let g = out.find((x) => x.k === gk);
    if (!g) { g = { k: gk, un: ind.un, stack: !!ind.stack, grp: ind.grp || '', inds: [] }; out.push(g); } g.inds.push(ind); });
  return out;
}
const dshTituloGrupo = (g) => g.inds.map((i) => i.rot).join(g.grp === 'fluxo' ? ' × ' : ' · ');
// celular estreito: 52 semanas × 2 barras não cabem no plot (< 3 px por barra) — as barras mostram as últimas 26 semanas, com nota
const DSH_SEM_CEL = 26;
function dshCel() { try { return window.matchMedia('(max-width:560px)').matches; } catch (e) { return false; } }
function dshMobile() { try { return window.matchMedia('(max-width:760px)').matches; } catch (e) { return false; } }
const dshTemBarra = (g) => g.stack || g.inds.some((i) => i.tipo === 'bar');
function dshRecorteBarras(g, jan) { return (estado.dash.gran === 'sem' && dshTemBarra(g) && dshCel() && jan.atual.length > DSH_SEM_CEL) ? DSH_SEM_CEL : 0; }
function dshSeriesDe(g, jan, F, comparar) {
  const lim = dshRecorteBarras(g, jan); const atual = lim ? jan.atual.slice(-lim) : jan.atual; const ant = lim ? jan.ant.slice(-lim) : jan.ant;
  const xs = atual.map((r) => r.chave); const series = []; const ids = [];
  const multi = g.inds.length > 1;
  g.inds.forEach((ind) => {
    series.push({ nome: ind.rot, cor: dshCorInd(ind), tipo: g.stack ? 'bar' : (ind.tipo || (multi ? 'line' : 'area')), vals: atual.map((r) => ({ x: r.chave, v: dshVal(ind, r, F) })) });
    ids.push(ind.id);
  });
  if (comparar && !g.stack) {
    // `rot` = a semana/mês de onde vem o ponto tracejado (o readout o mostra: o valor é do período anterior, não do que está sob o cursor)
    const rotRef = (r) => (jan.gran === 'sem' ? `sem. ${dshRotX('sem', r.chave)}–${dshRotX('sem', dshAdd(r.chave, 6))}` : dshRotX('mes', r.chave));
    const ind = g.inds[0]; const ref = ant.map((r, i) => ({ x: xs[i], v: dshVal(ind, r, F), rot: rotRef(r) }));
    if (ref.some((p) => p.v != null)) { series.push({ nome: ind.rot + ' (período anterior)', ref: true, tipo: 'line', vals: ref }); ids.push(ind.id); }
  }
  return { series, ids };
}
function dshOptsGrafico(g, jan, ids, extra) {
  const D = estado.dash; const gran = D.gran;
  const parc = jan.atual.length && jan.atual[jan.atual.length - 1].parcial && dshTemFoto(jan.atual[jan.atual.length - 1]) ? jan.atual[jan.atual.length - 1].chave : '';
  return Object.assign({
    unidade: g.un, reta: g.un === 'n', stacked: g.stack, fimParcial: !!parc, xlabel: (x) => dshRotX(gran, x), readX: (x) => dshLeituraX(gran, x),
    annot: parc ? [{ x: parc, label: '⏳ em andamento' }] : [], tituloX: 'Período',
    drill: (x, gi) => dshDrill(x, ids[gi]),
  }, extra || {});
}
// Gráfico principal: o primeiro grupo de unidade; os demais viram small multiples (uma unidade por gráfico, mesmo eixo x).
function dshGraficosHTML(ids, jan, F, comparar) {
  const D = estado.dash; const grupos = dshGruposDe(ids); if (!grupos.length) return '';
  const g0 = grupos[0]; const s0 = dshSeriesDe(g0, jan, F, comparar);
  if (!s0.series.some((s) => s.vals.some((p) => p.v != null))) return `<div class="estado">${esc(dshSemValor(g0.inds[0], jan, F))} para esses indicadores — veja o rodapé.</div>`;
  const princ = tsChart(s0.series, dshOptsGrafico(g0, jan, s0.ids, {
    legendToggle: true, brush: true, altura: '300px', h: 250, titulo: dshTituloGrupo(g0), rotuloFim: s0.series.filter((s) => !s.ref).length <= 2,
    off: Object.keys(D.off), onToggle: (nome, esc) => { if (esc) D.off[nome] = true; else delete D.off[nome]; }, legenda: s0.series.length > 1,
  }));
  let resto = '';
  if (grupos.length > 1) {
    const itens = grupos.slice(1).map((g) => {
      const s = dshSeriesDe(g, jan, F, comparar && g.inds.length === 1);
      const it = { id: g.inds[0].id, nome: dshTituloGrupo(g), unidade: g.un, series: s.series, reta: g.un === 'n', stacked: g.stack };
      // revisão de 2026-11-07: com 2+ séries NÃO se manda cor/vals da 1ª como "o" valor do grupo — o 07 decide (legenda + um valor por série)
      if (g.inds.length === 1) { it.cor = dshCorInd(g.inds[0]); it.vals = s.series[0].vals; }
      if (dshRecorteBarras(g, jan)) it.nota = `Mostrando as últimas ${DSH_SEM_CEL} semanas (no celular as barras não cabem em 52) — "Mês a mês" mostra o ano inteiro.`;
      return it;
    });
    resto = dshSmallMultiples(itens, { xlabel: (x) => dshRotX(D.gran, x), readX: (x) => dshLeituraX(D.gran, x), annot: dshOptsGrafico(g0, jan, s0.ids).annot, fimParcial: dshOptsGrafico(g0, jan, s0.ids).fimParcial, cols: Math.min(itens.length, 3), drill: (x, id) => dshDrill(x, id), grupo: 'dshsm' });
  }
  const nota0 = dshRecorteBarras(g0, jan) ? `<div class="muted small dsh-nota-cel">Mostrando as últimas ${DSH_SEM_CEL} semanas (no celular as barras não cabem em 52) — "Mês a mês" mostra o ano inteiro.</div>` : '';
  return `<div class="dsh-graf">${princ}</div>${nota0}${resto ? `<div class="dsh-sm-titulo muted small">Outras unidades — cada uma no seu eixo:</div>${resto}` : ''}`;
}

// ===========================================================================
// Tiles
// ===========================================================================
function dshStatusTile(ind, v) {
  if (v == null) return {};
  if (ind.tom === 'mg') return v >= 30 ? { status: 'ok', statusTxt: 'saudável' } : (v >= 10 ? { status: 'warn', statusTxt: 'apertada' } : { status: 'err', statusTxt: 'no vermelho' });
  if (ind.tom === 'cons') return v > 100 ? { status: 'err', statusTxt: 'estourou' } : (v >= 85 ? { status: 'warn', statusTxt: 'em risco' } : { status: 'ok', statusTxt: 'dentro' });
  if (ind.tom === 'cap') return v > 120 ? { status: 'err', statusTxt: 'sobrecarga' } : (v > 105 ? { status: 'warn', statusTxt: 'acima da capacidade' } : (v >= 80 ? { status: 'ok', statusTxt: 'no ritmo' } : { status: 'warn', statusTxt: 'abaixo da capacidade' }));
  if (ind.tom === 'exec') return v > 110 ? { status: 'err', statusTxt: 'acima do estimado' } : (v > 90 ? { status: 'warn', statusTxt: 'perto do estimado' } : { status: 'ok', statusTxt: 'dentro' });
  return {};
}
// Por que não há número: sem foto na janela × a foto existe mas o indicador não se divide por este recorte (pessoa/projeto) ×
// semana retroativa (a foto de momento não existe). Antes tudo virava "sem foto neste período", contradizendo o rodapé.
function dshSemValor(ind, jan, F) {
  const campo = ind.grupo === 'fin' ? 'fin' : ind.grupo === 'horas' ? 'horas' : ind.grupo === 'saude' ? 'saude' : 'time';
  const com = jan.atual.filter((r) => !r.vazio && r[campo]);
  if (!com.length) return 'sem foto neste período';
  if (ind.grupo === 'saude' && ind.momento && com.every((r) => r[campo].retro)) return 'sem retrato (semana anterior ao início das fotos)';
  return 'não se aplica a este recorte';
}
function dshTileSpec(ind, jan, F, extra) {
  const D = estado.dash; const at = jan.atual; const gran = D.gran;
  let i = at.length - 1; while (i >= 0 && (at[i].parcial || dshVal(ind, at[i], F) == null)) i--;
  let usaParcial = false;
  if (i < 0) { i = at.length - 1; while (i >= 0 && dshVal(ind, at[i], F) == null) i--; usaParcial = i >= 0; }
  const spec = { id: ind.id, rot: ind.rot, unidade: ind.un, deltaBom: ind.bom, tip: `${ind.rot}: ${ind.calc}`, cor: dshCorInd(ind), deltaRef: gran === 'sem' ? 'semana anterior' : 'mês anterior' };
  Object.assign(spec, extra || {});
  if (i < 0) { spec.valor = null; spec.sub = dshSemValor(ind, jan, F); return spec; }
  const v = dshVal(ind, at[i], F); spec.valor = v; spec.parcial = usaParcial;
  let j = i - 1; while (j >= 0 && dshVal(ind, at[j], F) == null) j--;
  if (j >= 0) {
    const p = dshVal(ind, at[j], F); const dif = v - p;
    if (ind.un === '%') { const rd = Math.round(dif * 10) / 10; spec.delta = Math.abs(dif) < 0.05 ? 0 : dif; spec.deltaTxt = (rd > 0 ? '+' : rd < 0 ? '−' : '') + Math.abs(rd).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' pp'; }   // arredonda ANTES do sinal ("−0 pp" não existe)
    else if (ind.un === 'n') { spec.delta = dif; spec.deltaTxt = (dif > 0 ? '+' : dif < 0 ? '−' : '') + Math.abs(dif).toLocaleString('pt-BR'); }
    else if (p !== 0) spec.delta = dif / Math.abs(p);
  }
  spec.spark = at.slice(0, i + 1).map((r) => dshVal(ind, r, F));
  Object.assign(spec, dshStatusTile(ind, v));
  const per = at[i]; let sub = (gran === 'sem' ? `semana ${dshRotX('sem', per.chave)}–${dshRotX('sem', dshAdd(per.chave, 6))}` : dshLeituraX('mes', per.chave));
  const ult = at[at.length - 1];
  if (!usaParcial && ult.parcial && ult !== per) { const pv = dshVal(ind, ult, F); if (pv != null) sub += ` · ⏳ agora ${dshFmt(ind.un, pv)}`; }
  else if (usaParcial) sub += ' · ainda em andamento';
  spec.sub = sub; return spec;
}

// ===========================================================================
// Quebra do período (barras horizontais, top 12 + Outros) — clicar filtra a tela
// ===========================================================================
const _dshSoma = (into, e, ultimos) => { Object.keys(e).forEach((k) => { const v = e[k]; if (typeof v === 'number') { if (ultimos && ultimos.includes(k)) into[k] = v; else into[k] = (into[k] || 0) + v; } else if (v != null && typeof v !== 'object') into[k] = v; }); };
function dshEntradas(grupo, dim, recs, F) {
  const out = {}; const ult = ['vencidos', 'bugs', 'parados', 'est', 'gasto'];
  const add = (key, nome, e, ultimos) => { const L = out[key] = out[key] || { nome }; if (nome) L.nome = nome; _dshSoma(L, e, ultimos); };
  recs.forEach((r) => {
    if (!dshTemFoto(r)) return;
    if (grupo === 'fin') {
      if (!r.fin) return;
      if (dim === 'cat') Object.entries(r.fin.porCat || {}).forEach(([k, e]) => add(k, k, e));
      else if (dim === 'proj') Object.entries(r.fin.porProj || {}).forEach(([k, e]) => add(k, e.nome, { h: e.h, hf: e.hf, r: e.r, c: e.c, cg: e.cg, cat: e.cat }));
      else if (dim === 'pessoa') Object.entries(r.fin.porPessoa || {}).forEach(([k, e]) => add(k, e.nome, { h: e.h, hf: e.hf, c: e.c }));
    } else if (grupo === 'horas') {
      const ho = r.horas; if (!ho) return;
      if (dim === 'cat') { const com = {}; Object.values(ho.porProj || {}).forEach((p) => { const c = p.cat || 'Sem categoria'; const L = com[c] = com[c] || { h: 0, hf: 0, vend: 0, ch: 0 }; L.h += p.h || 0; L.hf += p.hf || 0; L.vend += p.vend || 0; if (p.vend > 0) L.ch += p.h || 0; });
        Object.entries(com).forEach(([k, e]) => add(k, k, e)); }
      else if (dim === 'proj') Object.entries(ho.porProj || {}).forEach(([k, e]) => add(k, e.nome, { h: e.h, hf: e.hf, vend: e.vend, ch: e.vend > 0 ? e.h : 0, cat: e.cat }));
      else if (dim === 'pessoa') Object.entries((r.fin && r.fin.porPessoa) || {}).forEach(([k, e]) => add(k, e.nome, { h: e.h, hf: e.hf }));
      else if (dim === 'nivel') Object.entries(ho.porNivel || {}).forEach(([k, h]) => add(k, DSH_NIVEL_ROT[k] || k || 'Sem nível', { h }));
      else if (dim === 'tipo') Object.entries(ho.porTipo || {}).forEach(([k, h]) => add(k, k, { h }));
    } else if (grupo === 'saude' && r.saude && dim === 'proj') {
      Object.entries(r.saude.porProj || {}).forEach(([k, e]) => add(k, (dshMapaProj()[k] || {}).nome || k, { vencidos: e.vencidos, bugs: e.bugs, parados: e.parados, criados: e.criados, concluidos: e.concluidos, est: e.est, gasto: e.gasto, semaforo: e.semaforo }, ult));
    } else if (grupo === 'time' && r.time && dim === 'pessoa') {
      Object.entries(r.time.porPessoa || {}).forEach(([k, e]) => add(k, e.nome, { cap: e.cap, plan: e.plan, real: e.real }));
    }
  });
  const mapa = dshMapaProj();
  return Object.entries(out).filter(([k, e]) => {
    if (dim === 'cat' && F.cat) return k === F.cat;
    if (dim === 'proj') { if (F.proj) return k === F.proj; if (F.cat) return (e.cat || (mapa[k] || {}).cat) === F.cat; }
    if (dim === 'pessoa' && F.pessoa) return k === F.pessoa;
    return true;
  }).map(([k, e]) => Object.assign({ key: k }, e));
}
function dshQuebraHTML(v, jan, F) {
  const D = estado.dash; const vis = DSH_VIS[v]; const dims = vis.quebra || []; if (!dims.length) return '';
  let dim = D.qd[v]; if (!dims.includes(dim)) dim = dims[0];
  const Fg = dshFGrupo(vis.grupo, F);
  const ents = dshEntradas(vis.grupo, dim, jan.atual, Fg);
  const sel = (D.ind[v] || vis.padrao); const grupoInds = DSH_IND.filter((i) => i.grupo === vis.grupo && i.q);
  const cands = sel.map((id) => DSH_BY[id]).filter((i) => i && i.q).concat(grupoInds);
  const ind = cands.find((i) => ents.some((e) => dshNum(i.q(e)) != null));
  const dimRot = { cat: 'Categoria', proj: 'Projeto', pessoa: 'Pessoa', nivel: 'Nível', tipo: 'Tipo de esforço' };
  const abas = dims.map((d) => `<button type="button" class="dsh-chip" aria-pressed="${d === dim}" data-dsh-qd="${d}">${dimRot[d]}</button>`).join('');
  const cab = `<h3 class="dsh-h3">🧩 Quebra do período <span class="muted small">por ${dimRot[dim].toLowerCase()}</span></h3><div class="dsh-chips" role="group" aria-label="Quebrar por">${abas}</div>`;
  if (!ind || !ents.length) return `<div class="card full dsh-quebra">${cab}<div class="estado">Sem fotos para quebrar este período por ${esc(dimRot[dim].toLowerCase())}.</div></div>`;
  const val = (e) => dshNum(ind.q(e));
  const ord = ents.slice().sort((a, b) => ((val(b) == null ? -Infinity : val(b)) - (val(a) == null ? -Infinity : val(a))));
  const top = ord.slice(0, 12); const resto = ord.slice(12);
  const linhas = top.map((e) => ({ key: e.key, nome: e.nome || e.key, v: val(e), sem: e.semaforo, clic: true }));
  if (resto.length) { const m = {}; resto.forEach((e) => _dshSoma(m, e, ['vencidos', 'bugs', 'parados', 'est', 'gasto'])); linhas.push({ key: '', nome: `Outros (${resto.length})`, v: val(m), clic: false }); }
  const max = Math.max(1e-9, ...linhas.map((l) => Math.abs(l.v || 0)));
  const SEM = { verde: '🟢', amarelo: '🟡', vermelho: '🔴' };
  const clicavel = ['cat', 'proj', 'pessoa'].includes(dim) && (dim !== 'pessoa' || dshVeTudo());
  const rows = linhas.map((l) => {
    const w = l.v == null ? 0 : Math.abs(l.v) / max * 100; const neg = l.v != null && l.v < 0;
    const inner = `<span class="dsh-q-n">${l.sem ? `<span aria-label="semáforo ${esc(l.sem)}">${SEM[l.sem] || '⚪'}</span> ` : ''}${esc(l.nome)}</span><span class="dsh-q-b"><i class="${neg ? 'neg' : ''}" style="width:${w.toFixed(1)}%"></i></span><b class="dsh-q-v">${esc(dshFmt(ind.un, l.v))}</b>`;
    return (clicavel && l.clic) ? `<button type="button" class="dsh-q-row" data-dsh-q="${escA(dim)}" data-dsh-qk="${escA(l.key)}" data-tip="Filtrar a tela por ${escA(l.nome)}">${inner}</button>` : `<div class="dsh-q-row dsh-q-fixo">${inner}</div>`;
  }).join('');
  const semProjeto = ['fin', 'horas'].includes(vis.grupo) && ['pessoa', 'nivel', 'tipo'].includes(dim) && !!(Fg.cat || Fg.proj);
  const notaTodas = semProjeto ? ` <span class="muted small">· = todas as categorias (as fotos não dividem ${esc(dimRot[dim].toLowerCase())} por projeto)</span>` : '';
  const nota = (sel[0] && DSH_BY[sel[0]] && DSH_BY[sel[0]] !== ind) ? ` <span class="muted small">(${esc(DSH_BY[sel[0]].rot)} não se divide por ${esc(dimRot[dim].toLowerCase())} — mostrando ${esc(ind.rot)})</span>` : '';
  return `<div class="card full dsh-quebra">${cab}<div class="dsh-q-ind muted small">Indicador: <b>${esc(ind.rot)}</b>, ${ind.momento ? 'no último período com foto' : 'somando o período'}${nota}${notaTodas}${clicavel ? ' · clique numa barra para filtrar a tela' : ''}</div><div class="dsh-q">${rows}</div></div>`;
}

// ===========================================================================
// Tabela, CSV e cópia — as mesmas séries do gráfico
// ===========================================================================
function dshTabelaDados(v, jan, F) {
  const D = estado.dash; const ids = dshIdsDe(v); const inds = ids.map((id) => DSH_BY[id]).filter(Boolean);
  // revisão de 2026-11-07: não repete a unidade que o rótulo já traz ("Margem %", "% faturável")
  const cab = ['Período', ...inds.map((i) => (i.un === '%' ? i.rot : `${i.rot} (${i.un === 'n' ? 'qtd' : i.un})`))];
  const linhas = jan.atual.map((r) => [dshLeituraX(D.gran, r.chave) + (r.parcial ? ' ⏳' : ''), ...inds.map((i) => dshVal(i, r, F))]);
  return { cab, linhas, inds, ids };
}
function dshTabelaHTML(dados) {
  const th = dados.cab.map((c, i) => `<th scope="col"${i ? '' : ''}>${esc(c)}</th>`).join('');
  const tr = dados.linhas.map((l) => `<tr><th scope="row" style="text-transform:none">${esc(l[0])}</th>${l.slice(1).map((x, k) => `<td>${esc(dshFmt(dados.inds[k].un, x))}</td>`).join('')}</tr>`).join('');
  return `<div class="dsh-tab-wrap scroll-x"><table class="tsc-tab dsh-tabela"><caption class="dsh-sr">Dados do gráfico</caption><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}
// a Visão geral exporta o financeiro — ou as horas, para quem não recebe R$ (senão o arquivo teria só colunas vazias)
const dshVisExporta = (v) => (v === 'dash' ? (dshSemFin() ? 'dashhoras' : 'dashfin') : v);
function dshCsv() {
  const v = estado.vista; const jan = dshJanela(); const dados = dshTabelaDados(dshVisExporta(v), jan, dshFiltro());
  const n2 = (x) => (x == null ? '' : String(Math.round(x * 100) / 100).replace('.', ','));
  baixaCSV(`dashboard-${v}-${estado.dash.gran === 'sem' ? 'semanal' : 'mensal'}.csv`, [dados.cab, ...dados.linhas.map((l) => [l[0], ...l.slice(1).map(n2)])]);
}
function dshCopia() {
  const jan = dshJanela(); const dados = dshTabelaDados(dshVisExporta(estado.vista), jan, dshFiltro());
  const txt = [dados.cab, ...dados.linhas.map((l) => [l[0], ...l.slice(1).map((x, k) => dshFmt(dados.inds[k].un, x))])].map((l) => l.join('\t')).join('\n');
  try { navigator.clipboard.writeText(txt).then(() => toast('✓ Tabela copiada (cole no Excel ou no Teams).', 'ok'), () => toast('⚠ Não consegui copiar — use o 📥 CSV.', 'err')); } catch (e) { toast('⚠ Não consegui copiar — use o 📥 CSV.', 'err'); }
}
const dshIdsDe = (v) => { const D = estado.dash; const vis = DSH_VIS[v] || DSH_VIS.dashfin; return (D.ind[v] && D.ind[v].length ? D.ind[v] : vis.padrao).filter((id) => DSH_BY[id]); };

// ===========================================================================
// Drill — clicar num ponto abre o relatório que explica o número
// ===========================================================================
function dshDrill(x, indId) {
  const D = estado.dash; const ind = DSH_BY[indId]; if (!ind) return;
  const rec = dshJanela().atual.find((r) => r.chave === x) || dshJanela().ant.find((r) => r.chave === x); if (!rec) return;
  const hoje = hojeSP();
  if (ind.grupo === 'fin' || ind.grupo === 'horas') {
    const ct = estado.ctrl; ct.de = rec.de; ct.ate = rec.ate > hoje ? hoje : rec.ate; ct.destaque = ''; ct.cat = '';
    if (D.proj) { ct.cat = (dshMapaProj()[D.proj] || {}).cat || ''; ct.destaque = D.proj; ct.rolar = true; } else if (D.cat) ct.cat = D.cat;
    vaiPara('controladoria'); return;
  }
  if (ind.grupo === 'saude') {
    if (D.proj && estado.gp) { estado.gp.proj = D.proj; vaiPara('gp'); } else vaiPara('analytics');
    return;
  }
  estado.planrel.aud = 'gestor'; vaiPara('planrel');
}

// ===========================================================================
// A tela
// ===========================================================================
function dshOpcoes() {
  const D = estado.dash; const cats = new Set(); const projs = {}; const pessoas = {};
  ['sem', 'mes'].forEach((g) => ((D.cache[g] && D.cache[g].itens) || []).forEach((f) => {
    Object.keys((f.fin && f.fin.porCat) || {}).forEach((c) => cats.add(c)); Object.keys((f.horas && f.horas.porCat) || {}).forEach((c) => cats.add(c));
    Object.entries((f.fin && f.fin.porProj) || {}).forEach(([k, p]) => { projs[k] = { nome: p.nome, cat: p.cat }; });
    Object.entries((f.horas && f.horas.porProj) || {}).forEach(([k, p]) => { if (!projs[k]) projs[k] = { nome: p.nome, cat: p.cat }; });
    Object.entries((f.fin && f.fin.porPessoa) || {}).forEach(([a, p]) => { pessoas[a] = p.nome; });
  }));
  return { cats: [...cats].sort((a, b) => a.localeCompare(b, 'pt')), projs, pessoas };
}
function dshFiltrosHTML(v) {
  const D = estado.dash; const op = dshOpcoes(); const veTudo = dshVeTudo();
  const ch = (rot, attr, val, on, tip) => `<button type="button" class="dsh-chip" aria-pressed="${on}" ${attr}="${val}"${tip ? ` data-tip="${escA(tip)}"` : ''}>${rot}</button>`;
  const per = [3, 6, 12].map((m) => ch(`${m} meses`, 'data-dsh-meses', m, D.meses === m)).join('');
  const gr = ch('Semana a semana', 'data-dsh-gran', 'sem', D.gran === 'sem', 'Uma foto por semana (segunda a domingo)') + ch('Mês a mês', 'data-dsh-gran', 'mes', D.gran === 'mes', 'Uma foto por mês civil; saúde e time são agregados das semanas do mês');
  const optCat = `<option value="">Todas as categorias</option>${op.cats.map((c) => `<option value="${escA(c)}"${D.cat === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}`;
  const lp = Object.entries(op.projs).filter(([, p]) => !D.cat || p.cat === D.cat).sort((a, b) => String(a[1].nome).localeCompare(String(b[1].nome), 'pt'));
  const optProj = `<option value="">Todos os projetos</option>${lp.map(([k, p]) => `<option value="${escA(k)}"${D.proj === k ? ' selected' : ''}>${esc(p.nome || k)} (${esc(k)})</option>`).join('')}${D.proj && !op.projs[D.proj] ? `<option value="${escA(D.proj)}" selected>${esc(D.proj)}</option>` : ''}`;
  const optPes = `<option value="">Todas as pessoas</option>${Object.entries(op.pessoas).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'pt')).map(([a, n]) => `<option value="${escA(a)}"${D.pessoa === a ? ' selected' : ''}>${esc((typeof nomePessoaDe === 'function' && nomePessoaDe(a) !== a) ? nomePessoaDe(a) : n)}</option>`).join('')}`;
  const acoes = `<button type="button" class="tsc-btn" data-dsh-tabela="1" aria-pressed="${D.tabela}" data-tip="Mostra os números do gráfico em tabela">▦ tabela</button>
    <button type="button" class="tsc-btn" data-dsh-copiar="1" data-tip="Copia a tabela (cole no Excel ou no Teams)">📋 copiar</button>
    <button type="button" class="tsc-btn" data-dsh-csv="1" data-tip="Baixa a tabela em CSV">📥 CSV</button>
    ${dshPodeAtualizar() ? `<button type="button" class="tsc-btn" data-dsh-atualiza="1" ${D.atualizando ? 'disabled' : ''} data-tip="Refaz agora as fotos da semana e do mês correntes (gestores). Leva alguns segundos.">${D.atualizando ? 'Atualizando…' : '↻ atualizar agora'}</button>` : ''}`;
  const ativos = [D.cat ? ['cat', 'categoria', D.cat] : null, D.proj ? ['proj', 'projeto', (op.projs[D.proj] || {}).nome || D.proj] : null, D.pessoa ? ['pessoa', 'pessoa', op.pessoas[D.pessoa] || D.pessoa] : null].filter(Boolean);
  // a comparação com o período anterior só existe nas visões com gráfico grande; na Visão geral a caixa não faria nada (revisão de 2026-11-07)
  const campos = `<div class="campo"><label>Período</label><div class="dsh-chips" role="group" aria-label="Período">${per}</div></div>
      <div class="campo"><label>Granularidade</label><div class="dsh-chips" role="group" aria-label="Granularidade">${gr}</div></div>
      <div class="campo"><label for="dsh-cat">Categoria</label><select id="dsh-cat">${optCat}</select></div>
      <div class="campo"><label for="dsh-proj">Projeto</label><select id="dsh-proj">${optProj}</select></div>
      ${veTudo ? `<div class="campo"><label for="dsh-pessoa">Pessoa</label><select id="dsh-pessoa">${optPes}</select></div>` : ''}
      ${v === 'dash' ? '' : `<div class="campo dsh-comp"><label class="check"><input type="checkbox" id="dsh-comp"${D.comparar ? ' checked' : ''}> comparar com o período anterior</label></div>`}`;
  const chipsAtivos = ativos.length ? `<div class="dsh-ativos"><span class="muted small">Filtrando por:</span> ${ativos.map(([k, rot, val]) => `<button type="button" class="dsh-chip" data-dsh-limpa="${k}" data-tip="Tirar o filtro" aria-label="Tirar o filtro de ${rot}: ${escA(val)}">${esc(rot)}: <b>${esc(val)}</b> ✕</button>`).join(' ')}</div>` : '';
  if (!dshMobile()) return `<div class="dsh-filtros" id="dsh-filtros">
      ${campos}
      <div class="campo dsh-acoes">${acoes}</div>
    </div>${chipsAtivos}`;
  // Celular (≤ 760 px): os filtros ficam recolhidos num <details> com o resumo do que está valendo, e os botões numa linha — o
  // 1º número aparece logo abaixo do título, não 500 px de formulário depois (revisão de 2026-11-07).
  const resumo = ['Filtros', `${D.meses} meses`, D.gran === 'sem' ? 'semana a semana' : 'mês a mês', ativos.length ? ativos.map((a) => a[2]).join(', ') : 'todas as categorias'].join(' · ');
  return `<div class="dsh-filtros dsh-filtros-m" id="dsh-filtros">
      <details class="dsh-filtros-det"${D.filtrosAbertos ? ' open' : ''}><summary>${esc(resumo)}</summary><div class="dsh-filtros-in">${campos}</div></details>
      <div class="campo dsh-acoes">${acoes}</div>
    </div>${chipsAtivos}`;
}
function dshNotasFiltro(v) {
  const D = estado.dash; const n = [];
  const g = (DSH_VIS[v] || {}).grupo;
  if (D.pessoa && (v === 'dashsaude')) n.push('A saúde da entrega não se divide por pessoa — o filtro de pessoa foi ignorado aqui.');
  if ((D.cat || D.proj) && v === 'dashtime') n.push('O plano semanal é por pessoa, não por projeto — o filtro de categoria/projeto foi ignorado aqui.');
  if (D.pessoa && g === 'fin') n.push('Por pessoa só existem horas, horas faturáveis e custo — receita, margem e vendido não se atribuem a uma pessoa.');
  if (D.pessoa && v === 'dash') n.push('Com uma pessoa escolhida, a saúde da entrega não se aplica e o plano usa só a linha dela; receita e vendido não se atribuem a uma pessoa.');
  if ((D.cat || D.proj) && v === 'dash') n.push('Categoria/projeto não se aplicam ao plano semanal do time (capacidade usada segue o time inteiro).');
  if ((D.cat || D.proj) && v === 'dashsaude') n.push('Sem vencimento e sem responsável não vêm por projeto nas fotos — ficam em branco com filtro de categoria/projeto.');
  return n;
}
function dshChipsHTML(v) {
  const D = estado.dash; const vis = DSH_VIS[v]; const sel = new Set(dshIdsDe(v));
  const inds = DSH_IND.filter((i) => i.grupo === vis.grupo);
  return `<div class="dsh-chips" id="dsh-chips" role="group" aria-label="Indicadores no gráfico">${inds.map((i) => `<button type="button" class="dsh-chip" aria-pressed="${sel.has(i.id)}" data-dsh-chip="${i.id}" data-tip="${escA(i.calc)}"><i style="background:${dshCorInd(i)}"></i>${esc(i.rot)}</button>`).join('')}</div>
    <div class="muted small dsh-chips-nota">Unidades diferentes (R$, h, %, n) ficam em gráficos separados — um eixo por unidade.</div>`;
}
function dshGlossarioHTML(inds) {
  return `<details class="dsh-glossario card full"><summary>📖 Como ler estes indicadores</summary><dl>${inds.map((i) => `<dt>${esc(i.rot)} <span class="muted small">(${i.un === 'n' ? 'quantidade' : esc(i.un)})</span></dt><dd><b>Como é calculado:</b> ${esc(i.calc)}<br><b>Como ler:</b> ${esc(i.ler)}</dd>`).join('')}</dl></details>`;
}
function dshRodapeHTML(v, jan) {
  const D = estado.dash; const itens = []; const todos = jan.atual.concat(jan.ant).filter(dshTemFoto);
  let ult = ''; todos.forEach((r) => { if (r.fotoEm && r.fotoEm > ult) ult = r.fotoEm; });
  // Horizonte do servidor (horizonteSem/horizonteMes da resposta — a tela NUNCA copia a constante): período anterior a ele
  // nunca será fotografado, então não entra em "o servidor completa nos próximos dias úteis" (revisão de 2026-11-07).
  const hor = dshHorizonte(D.gran);
  const antesHor = (r) => !!hor && dshChaveDe(r, D.gran) < hor;
  const semFoto = jan.atual.filter((r) => !dshTemFoto(r));
  const nAntes = semFoto.filter(antesHor).length; const nSem = semFoto.length - nAntes;
  const un1 = D.gran === 'sem' ? 'semana(s)' : 'mês(es)';
  itens.push(`📸 Fotos tiradas pelo servidor${ult ? ` · última: ${esc(dshQuando(ult))}` : ''}`);
  const parc = jan.atual[jan.atual.length - 1]; if (parc && parc.parcial && dshTemFoto(parc)) itens.push(`⏳ ${D.gran === 'sem' ? 'semana' : 'mês'} corrente parcial — o último ponto ainda muda`);
  if (nSem) itens.push(`${nSem} ${un1} da janela ainda sem foto (aparecem como buraco no gráfico; o servidor completa nos próximos dias úteis)`);
  if (nAntes) itens.push(`${nAntes} ${un1} anteriores a ${esc(dshHorizonteBR(hor, D.gran))} não são fotografados pelo servidor (fora do horizonte das fotos — ficam como buraco no gráfico)`);
  if (!nSem && !nAntes) itens.push('todos os períodos da janela têm foto');
  // pendentes vêm do servidor por granularidade: na tela mensal 🩺/👥 são SEMANAS (dito com a unidade e o trecho), nunca "períodos"
  const need = dshNecessidades();
  const primeiro = (jan.ant && jan.ant[0]) || jan.atual[0];
  ['sem', 'mes'].filter((g) => need[g] && D.cache[g] && D.cache[g].pendentes).forEach((g) => {
    if (nSem || nAntes) return;
    const hg = dshHorizonte(g);
    const cruza = !!hg && primeiro && dshChaveDe(primeiro, g) <= hg;   // o pedido alcança o horizonte: parte dos pendentes nunca terá foto
    const nota = cruza ? ` — as anteriores a ${esc(dshHorizonteBR(hg, g))} não entram no horizonte do servidor e não serão fotografadas` : '';
    if (g === 'sem') itens.push(D.gran === 'mes' ? `semanas anteriores a ${dataBR(jan.atual[0].de)} ainda sem foto (a saúde e o time do mês vêm delas)${nota}` : `${D.cache[g].pendentes} semana(s) fora da janela sem foto${nota}`);
    else itens.push(`${D.cache[g].pendentes} mês(es) fora da janela sem foto${nota.replace('as anteriores', 'os anteriores')}`);
  });
  const g = (DSH_VIS[v] || {}).grupo;
  if (D.comparar && v !== 'dash' && !jan.ant.some(dshTemFoto)) itens.push('período anterior sem fotos — comparação indisponível');
  else if (D.comparar && v !== 'dash') itens.push('tracejado = período anterior, só do 1º indicador de cada gráfico');
  if ((g === 'saude' || v === 'dash') && jan.atual.some((r) => r.saude && r.saude.retro)) itens.push('semanas fotografadas depois de terminadas (retroativas) têm só criados e concluídos — vencidos, bugs e semáforos são retratos do momento');
  if (D.gran === 'mes' && (g === 'saude' || g === 'time' || v === 'dash')) itens.push('no mês, saúde e time vêm das semanas cuja segunda cai no mês (estoques = última foto do mês; fluxos = soma)');
  if ((g === 'time' || v === 'dash') && dshEuForcado()) itens.push('seu perfil vê só a própria linha do plano: capacidade, planejado e realizado são seus, não do time');
  if (todos.some((r) => r.truncado && (r.truncado.worklogs || r.truncado.abertos || r.truncado.tickets))) itens.push('⚠ alguma foto foi truncada pelo limite de leitura do servidor (worklogs/abertos) — os números dela podem estar incompletos');
  const comFin = todos.filter((r) => r.fin && r.fin.semCusto).pop();
  if ((g === 'fin' || v === 'dash') && comFin && comFin.fin.semCusto.length) itens.push(`ℹ️ ${comFin.fin.semCusto.length} pessoa(s) apontaram sem custo/h próprio (entram pelo custo padrão ou R$ 0)`);
  return `<div class="card full dsh-rodape" role="note">${itens.map((x) => `<span>${x}</span>`).join('<span class="dsh-sep" aria-hidden="true">·</span>')}</div>`;
}
function dshSemIdHTML() {
  return `<div class="ct-tela dsh-tela"><div class="card full dsh-vazio"><h2>📊 Dashboard de KPIs <span>os indicadores do time numa linha do tempo</span></h2>
    <div class="estado">🔐 As fotos de KPI exigem que o painel saiba quem você é — elas trazem horas, custos e saúde dos projetos, e o que você vê depende do seu perfil.<br>Identifique-se uma vez (e-mail + token do Jira) no ⏱ Apontar e volte aqui.</div>
    <div style="margin-top:10px"><button type="button" class="btn" data-dsh-apontar="1">⏱ Ir para o Apontar e me identificar</button></div></div></div>`;
}
function dshEstadoHTML(msg, erroGran) {
  return `<div class="ct-tela dsh-tela"><div class="card full"><h2>📊 Dashboard de KPIs <span>${esc((DSH_VIS[estado.vista] || {}).sub || '')}</span></h2>
    ${erroGran ? `<div class="erro">${esc(erroGran)} <button type="button" class="btn" data-dsh-retry="1">Tentar de novo</button></div>` : `<div class="estado" aria-busy="true">${esc(msg)}</div>`}</div></div>`;
}
// ids: ['receita', …] (o clique foca o indicador no gráfico) ou [['receita','dashfin'], …] (o clique abre a visão)
function dshTilesHTML(ids, jan, F) {
  return `<div class="dsh-tiles">${ids.map((x) => {
    const par = Array.isArray(x) ? x : [x, '']; const ind = DSH_BY[par[0]]; if (!ind) return '';
    return dshTileHTML(dshTileSpec(ind, jan, F, { data: par[1] ? { 'dsh-go': par[1] } : { 'dsh-foco': ind.id } }));
  }).join('')}</div>`;
}
function dshVisaoHTML(v, jan, F) {
  const D = estado.dash; const vis = DSH_VIS[v];
  const tiles = dshTilesHTML(DSH_IND.filter((i) => i.grupo === vis.grupo && i.tile).map((i) => i.id), jan, F);
  const ids = dshIdsDe(v); const dados = dshTabelaDados(v, jan, F);
  return `${tiles}
    <div class="card full dsh-grafico"><h3 class="dsh-h3">📈 ${esc(vis.titulo)} <span class="muted small">clique num ponto para abrir o relatório do período</span></h3>
      ${dshChipsHTML(v)}
      ${dshGraficosHTML(ids, jan, F, D.comparar)}
      ${D.tabela ? dshTabelaHTML(dados) : ''}
    </div>
    ${dshQuebraHTML(v, jan, F)}
    ${dshGlossarioHTML(DSH_IND.filter((i) => i.grupo === vis.grupo))}`;
}
function dshGeralHTML(jan, F, semFin) {
  const D = estado.dash;
  const tiles = dshTilesHTML(DSH_GERAL_TILES.filter(([id]) => !(semFin && DSH_BY[id].grupo === 'fin')), jan, F);
  const minis = DSH_GERAL_MINIS.filter(([vv]) => !(semFin && vv === 'dashfin')).map(([vv, ids]) => {
    const g = dshGruposDe(ids)[0]; const s = dshSeriesDe(g, jan, F, false);
    const graf = s.series.some((x) => x.vals.some((p) => p.v != null)) ? tsChart(s.series, dshOptsGrafico(g, jan, s.ids, { altura: '170px', h: 150, maxXl: 5, drill: (x, gi) => dshDrill(x, s.ids[gi]) })) : '<div class="estado">Sem fotos neste período.</div>';
    return `<div class="dsh-sm-c dsh-mini"><div class="dsh-sm-h"><span class="dsh-sm-n">${esc(DSH_VIS[vv].rot)}</span><button type="button" class="tsc-btn" data-dsh-go="${vv}">ver tudo →</button></div>${graf}</div>`;
  }).join('');
  return `${tiles}<div class="muted small dsh-minis-dica">Clique num ponto de um gráfico para abrir o relatório do período — “ver tudo →” abre a visão completa.</div><div class="dsh-sm dsh-minis" style="--dsh-cols:2">${minis}</div>
    ${dshGlossarioHTML(DSH_GERAL_TILES.filter(([id]) => !(semFin && DSH_BY[id].grupo === 'fin')).map(([id]) => DSH_BY[id]))}`;
}
function renderDash() {
  const D = estado.dash; const v = DSH_VISTAS.includes(estado.vista) ? estado.vista : 'dash'; const cont = document.getElementById('conteudo');
  if (typeof _tscReset === 'function') _tscReset();
  if (!(typeof idApontar === 'function' && idApontar())) { if (D.cache.sem || D.cache.mes) dshZeraCache(); cont.replaceChildren(el(dshSemIdHTML())); return; }
  dshGarante();
  const need = dshNecessidades(); const grans = Object.keys(need);
  const faltam = grans.filter((g) => !D.cache[g]);
  const erro = faltam.map((g) => D.erro[g]).find(Boolean);
  if (faltam.length) { cont.replaceChildren(el(dshEstadoHTML('Lendo as fotos de KPI…', erro))); return; }
  const jan = dshJanela(); const F = dshFiltro();
  const vis = DSH_VIS[v]; const semFin = dshSemFin();
  const algumaFoto = jan.atual.concat(jan.ant).some(dshTemFoto);
  const errAtual = grans.map((g) => D.erro[g]).find(Boolean);
  let corpo;
  if (!algumaFoto) {
    corpo = `<div class="card full dsh-vazio"><div class="estado">📸 Ainda não há fotos de KPI nesta janela. O servidor tira as fotos todo dia útil a partir das 07:00 (a semana e o mês correntes todo dia; as fechadas, até 3 por vez, das mais recentes para trás).${dshPodeAtualizar() ? '<br>Como gestor você pode <b>refazer a semana e o mês correntes agora</b> com o botão ↻ acima.' : '<br>Se for a primeira vez, volte amanhã — ou peça a um gestor para ↻ atualizar.'}</div></div>`;
  } else if (v === 'dashfin' && semFin) {
    corpo = `<div class="card full dsh-vazio"><div class="estado">💰 O financeiro (receita, custo e margem) aparece para <b>gestor, negócio, diretoria e admin</b>. O servidor não envia nenhum valor em R$ para o seu perfil — as horas, a saúde da entrega e o time estão nas outras abas.</div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-dsh-go="dashhoras">⏱ Horas</button><button type="button" class="btn" data-dsh-go="dashsaude">🩺 Saúde da entrega</button><button type="button" class="btn" data-dsh-go="dashtime">👥 Time e capacidade</button></div></div>`;
  } else corpo = v === 'dash' ? dshGeralHTML(jan, F, semFin) : dshVisaoHTML(v, jan, F);
  const notas = dshNotasFiltro(v);
  const aviso = (semFin && v !== 'dashfin' ? '<div class="aviso dsh-aviso">ℹ️ Seu perfil não recebe valores financeiros (receita, custo, margem): esses indicadores ficam de fora.</div>' : '')
    + (errAtual ? `<div class="aviso dsh-aviso">⚠ ${esc(errAtual)} — mostrando o que já estava na tela. <button type="button" class="btn" data-dsh-retry="1">Tentar de novo</button></div>` : '')
    + notas.map((t) => `<div class="aviso dsh-aviso">ℹ️ ${esc(t)}</div>`).join('');
  cont.replaceChildren(el(`<div class="ct-tela dsh-tela">
    <div class="card full dsh-topo"><h2 title="${escA(vis.sub)}">${v === 'dash' ? '📈' : '📊'} ${esc(vis.titulo)} <span>${D.meses} meses · ${D.gran === 'sem' ? 'semana a semana' : 'mês a mês'}${D.comparar && v !== 'dash' ? ' · comparando com o período anterior' : ''}</span></h2>
      ${dshFiltrosHTML(v)}${aviso}</div>
    ${corpo}
    ${algumaFoto ? dshRodapeHTML(v, jan) : ''}
  </div>`));
}

// ---- Listeners delegados desta tela ----
function dshMuda() { estado.dash._jan = null; try { estadoParaURL(); } catch (e) { /* link é conveniência */ } renderDash(); }
document.getElementById('conteudo').addEventListener('click', (e) => {
  if (!DSH_VISTAS.includes(estado.vista)) return;
  const D = estado.dash; const alvo = e.target.closest && e.target.closest('[data-dsh-meses],[data-dsh-gran],[data-dsh-chip],[data-dsh-tabela],[data-dsh-copiar],[data-dsh-csv],[data-dsh-atualiza],[data-dsh-go],[data-dsh-foco],[data-dsh-qd],[data-dsh-q],[data-dsh-limpa],[data-dsh-retry],[data-dsh-apontar]');
  if (!alvo) return;
  const a = (n) => alvo.getAttribute(n); const v = estado.vista;
  if (alvo.hasAttribute('data-dsh-meses')) { D.meses = +a('data-dsh-meses'); dshMuda(); }
  else if (alvo.hasAttribute('data-dsh-gran')) { D.gran = a('data-dsh-gran') === 'mes' ? 'mes' : 'sem'; dshMuda(); }
  else if (alvo.hasAttribute('data-dsh-chip')) {
    const id = a('data-dsh-chip'); const cur = dshIdsDe(v).slice(); const i = cur.indexOf(id);
    if (i >= 0) { if (cur.length > 1) cur.splice(i, 1); else return; } else cur.push(id);
    D.ind[v] = cur; renderDash();
  }
  else if (alvo.hasAttribute('data-dsh-tabela')) { D.tabela = !D.tabela; renderDash(); }
  else if (alvo.hasAttribute('data-dsh-copiar')) dshCopia();
  else if (alvo.hasAttribute('data-dsh-csv')) dshCsv();
  else if (alvo.hasAttribute('data-dsh-atualiza')) dshAtualiza();
  else if (alvo.hasAttribute('data-dsh-go')) vaiPara(a('data-dsh-go'));
  else if (alvo.hasAttribute('data-dsh-foco')) { if (v !== 'dash') { D.ind[v] = [a('data-dsh-foco')]; renderDash(); } }
  else if (alvo.hasAttribute('data-dsh-qd')) { D.qd[v] = a('data-dsh-qd'); renderDash(); }
  else if (alvo.hasAttribute('data-dsh-q')) {
    const dim = a('data-dsh-q'); const k = a('data-dsh-qk'); if (!k) return;
    if (dim === 'cat') { D.cat = k; D.proj = ''; D.pessoa = ''; } else if (dim === 'proj') { D.proj = k; D.cat = ''; D.pessoa = ''; } else if (dim === 'pessoa') { D.pessoa = k; D.cat = ''; D.proj = ''; }
    dshMuda();
  }
  else if (alvo.hasAttribute('data-dsh-limpa')) { D[a('data-dsh-limpa')] = ''; dshMuda(); }
  else if (alvo.hasAttribute('data-dsh-retry')) { D.erro = { sem: '', mes: '' }; renderDash(); }
  else if (alvo.hasAttribute('data-dsh-apontar')) vaiPara('apontar');
});
// o <details> dos filtros (celular) lembra se está aberto: cada ação redesenha a tela e não pode fechá-lo de novo
document.getElementById('conteudo').addEventListener('toggle', (e) => {
  const t = e.target; if (t && t.classList && t.classList.contains('dsh-filtros-det')) estado.dash.filtrosAbertos = !!t.open;
}, true);
try { window.matchMedia('(max-width:760px)').addEventListener('change', () => { if (DSH_VISTAS.includes(estado.vista)) renderDash(); }); } catch (e) { /* navegador sem matchMedia.addEventListener: a tela só não troca de layout ao girar */ }
document.getElementById('conteudo').addEventListener('change', (e) => {
  if (!DSH_VISTAS.includes(estado.vista)) return;
  const D = estado.dash; const t = e.target; if (!t || !t.id) return;
  if (t.id === 'dsh-cat') { D.cat = t.value; if (D.proj) { const p = dshMapaProj()[D.proj]; if (D.cat && p && p.cat !== D.cat) D.proj = ''; } if (D.cat) D.pessoa = ''; dshMuda(); }
  else if (t.id === 'dsh-proj') { D.proj = t.value; if (D.proj) { D.pessoa = ''; const p = dshMapaProj()[D.proj]; if (p && p.cat) D.cat = p.cat; } dshMuda(); }
  else if (t.id === 'dsh-pessoa') { D.pessoa = t.value; if (D.pessoa) { D.cat = ''; D.proj = ''; } dshMuda(); }
  else if (t.id === 'dsh-comp') { D.comparar = !!t.checked; dshMuda(); }
});
