// GET /api/atividade?janela=hoje|7d|30d
// Lê a atividade do Jira (alterações, transições, comentários, criações) na janela
// e devolve eventos compactos + mapas de apoio. A atribuição "quem fez" vem do
// AUTOR no changelog (não do assignee).
import {
  rangeFor, normalizaJanela, cacheGet, cacheSet, jiraSearchAll, json,
} from './_lib/util.js';

export default async function handler(req, res) {
  try {
    const janela = normalizaJanela((req.query && req.query.janela) || '7d');
    const ck = `atividade:${janela}`;
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);

    const r = rangeFor(janela);
    const inicio = new Date(r.startISO).getTime();

    // Issues atualizadas na janela, com changelog e campos mínimos.
    const { issues, pages, truncado } = await jiraSearchAll({
      jql: `updated >= "${r.startDate}" ORDER BY updated ASC`,
      fields: ['project', 'issuetype', 'created', 'reporter', 'resolutiondate', 'comment'],
      expand: 'changelog',
      pageSize: 100,
    });

    const eventos = [];            // {k,p,t,a,e,d}
    const pessoas = {};            // accountId -> {nome,email}
    const projetos = {};           // key -> {nome,categoria}
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

      // Criação dentro da janela -> atribui ao reporter.
      if (f.created && new Date(f.created).getTime() >= inicio) {
        const a = registraPessoa(f.reporter);
        if (a) eventos.push({ k: it.key, p: pk, t: tipo, a, e: 'criado', d: f.created });
      }

      // Concluídas (agregado, sem atribuição individual em v1).
      if (f.resolutiondate && new Date(f.resolutiondate).getTime() >= inicio) {
        concluidasTotal += 1;
        concluidasPorProj[pk] = (concluidasPorProj[pk] || 0) + 1;
      }

      // Comentários na janela.
      const coments = (f.comment && f.comment.comments) || [];
      for (const c of coments) {
        if (c.created && new Date(c.created).getTime() >= inicio) {
          const a = registraPessoa(c.author);
          if (a) eventos.push({ k: it.key, p: pk, t: tipo, a, e: 'comentario', d: c.created });
        }
      }

      // Changelog: cada history = uma ação de um usuário.
      const histories = (it.changelog && it.changelog.histories) || [];
      for (const h of histories) {
        if (!h.created || new Date(h.created).getTime() < inicio) continue;
        const a = registraPessoa(h.author);
        if (!a) continue;
        const items = h.items || [];
        const houveTransicao = items.some((x) => x.field === 'status' || x.fieldId === 'status');
        eventos.push({ k: it.key, p: pk, t: tipo, a, e: 'alteracao', d: h.created });
        if (houveTransicao) {
          eventos.push({ k: it.key, p: pk, t: tipo, a, e: 'transicao', d: h.created });
        }
      }
    }

    const payload = {
      meta: {
        ...r,
        totalIssues: issues.length,
        paginas: pages,
        truncado,
        concluidasTotal,
        concluidasPorProjeto: concluidasPorProj,
      },
      pessoas,
      projetos,
      eventos,
    };
    return json(res, 200, cacheSet(ck, payload));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
