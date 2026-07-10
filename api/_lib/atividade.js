// Coletor de ATIVIDADE do Jira (alterações, transições, comentários, criações e
// conclusões) num intervalo de datas. A atribuição "quem fez" vem do AUTOR no
// changelog (não do assignee). Compartilhado por /api/atividade (painel) e
// /api/teams (resumo IA agendado — que agrega por pessoa no servidor).
import { jiraSearchAll } from './util.js';

// r: { startDate:'AAAA-MM-DD', startISO, endISO } (endISO = limite superior).
// Devolve { eventos, pessoas, projetos, resumos, concluidasTotal, concluidasPorProjeto, totalIssues, paginas, truncado }.
export async function coletaAtividade(r) {
  const inicio = new Date(r.startISO).getTime();
  const fim = new Date(r.endISO).getTime();
  const naJanela = (iso) => {
    const t = new Date(iso).getTime();
    return t >= inicio && t <= fim;
  };

  // Issues atualizadas na janela, com changelog e campos mínimos.
  const { issues, pages, truncado } = await jiraSearchAll({
    jql: `updated >= "${r.startDate}" ORDER BY updated ASC`,
    fields: ['project', 'issuetype', 'created', 'reporter', 'resolutiondate', 'comment', 'summary'],
    expand: 'changelog',
    pageSize: 100,
  });

  const eventos = [];            // {k,p,t,a,e,d}
  const pessoas = {};            // accountId -> {nome,email}
  const projetos = {};           // key -> {nome,categoria}
  const resumos = {};            // issueKey -> título (summary) da issue
  const concluidasPorProj = {};  // key -> n
  let concluidasTotal = 0;

  const registraPessoa = (u) => {
    if (!u || !u.accountId) return null;
    if (!pessoas[u.accountId]) {
      pessoas[u.accountId] = {
        nome: u.displayName || u.accountId,
        email: u.emailAddress || '',
      };
    }
    return u.accountId;
  };

  for (const it of issues) {
    const f = it.fields || {};
    const proj = f.project || {};
    const pk = proj.key || '—';
    const tipo = (f.issuetype && f.issuetype.name) || '—';
    if (!projetos[pk]) {
      projetos[pk] = {
        nome: proj.name || pk,
        categoria: (proj.projectCategory && proj.projectCategory.name) || 'Sem categoria',
      };
    }
    if (f.summary && !resumos[it.key]) resumos[it.key] = f.summary;

    // Criação dentro da janela -> atribui ao reporter.
    if (f.created && naJanela(f.created)) {
      const a = registraPessoa(f.reporter);
      if (a) eventos.push({ k: it.key, p: pk, t: tipo, a, e: 'criado', d: f.created });
    }

    // Concluídas (agregado por projeto; a atribuição individual vem do changelog).
    if (f.resolutiondate && naJanela(f.resolutiondate)) {
      concluidasTotal += 1;
      concluidasPorProj[pk] = (concluidasPorProj[pk] || 0) + 1;
    }

    // Comentários na janela.
    const coments = (f.comment && f.comment.comments) || [];
    for (const c of coments) {
      if (c.created && naJanela(c.created)) {
        const a = registraPessoa(c.author);
        if (a) eventos.push({ k: it.key, p: pk, t: tipo, a, e: 'comentario', d: c.created });
      }
    }

    // Changelog: cada history = uma ação de um usuário.
    const histories = (it.changelog && it.changelog.histories) || [];
    for (const h of histories) {
      if (!h.created || !naJanela(h.created)) continue;
      const a = registraPessoa(h.author);
      if (!a) continue;
      const items = h.items || [];
      const houveTransicao = items.some((x) => x.field === 'status' || x.fieldId === 'status');
      // Resolução preenchida = ticket concluído POR essa pessoa (indicador do ranking).
      const houveConclusao = items.some((x) => (x.field === 'resolution' || x.fieldId === 'resolution') && x.to);
      eventos.push({ k: it.key, p: pk, t: tipo, a, e: 'alteracao', d: h.created });
      if (houveTransicao) {
        eventos.push({ k: it.key, p: pk, t: tipo, a, e: 'transicao', d: h.created });
      }
      if (houveConclusao) {
        eventos.push({ k: it.key, p: pk, t: tipo, a, e: 'concluido', d: h.created });
      }
    }
  }

  return {
    eventos, pessoas, projetos, resumos,
    concluidasTotal, concluidasPorProjeto: concluidasPorProj,
    totalIssues: issues.length, paginas: pages, truncado,
  };
}
