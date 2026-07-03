// GET /api/atividade?janela=hoje|7d|30d
// Lê a atividade do Jira (alterações, transições, comentários, criações) na janela
// e devolve eventos compactos + mapas de apoio. A atribuição "quem fez" vem do
// AUTOR no changelog (não do assignee).
import {
  rangeFor, normalizaJanela, cacheGet, cacheSet, cacheSetTTL, jiraBase, jiraSearchAll, json,
} from './_lib/util.js';

// GET /api/atividade?fluxo=1 — Fluxo de atividade do Jira (feed Atom do activity stream).
// O stream exige autenticação e não tem CORS: o servidor busca com a conta de serviço
// e devolve entradas compactas { t: texto, a: autor, q: quando(ISO), l: link }.
async function fluxoAtividade(req, res) {
  const ck = 'atividade:fluxo';
  const c = cacheGet(ck);
  if (c && req.query.nocache !== '1') return json(res, 200, c);
  const email = process.env.JIRA_EMAIL; const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) return json(res, 200, { erro: 'JIRA_EMAIL / JIRA_API_TOKEN não configurados.' });
  const r = await fetch(`${jiraBase()}/activity?maxResults=25&os_authType=basic`, {
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64'),
      Accept: 'application/atom+xml, application/xml',
    },
  });
  if (!r.ok) { const t = await r.text(); return json(res, 200, { erro: `Jira ${r.status}: ${t.slice(0, 160)}` }); }
  const xml = await r.text();
  // O título vem HTML-escapado no Atom: decodifica &lt;/&gt; ANTES de remover as tags.
  const limpa = (t) => String(t || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
  const entradas = [];
  const blocos = xml.split(/<entry[\s>]/).slice(1);
  for (const b of blocos.slice(0, 30)) {
    const tit = (b.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || '';
    const quando = (b.match(/<updated>([\s\S]*?)<\/updated>/) || [])[1] || (b.match(/<published>([\s\S]*?)<\/published>/) || [])[1] || '';
    const autor = (b.match(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/) || [])[1] || '';
    const link = (b.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/) || b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    const txt = limpa(tit);
    if (txt) entradas.push({ t: txt.slice(0, 220), a: limpa(autor), q: quando.trim(), l: link.replace(/&amp;/g, '&') });
  }
  return json(res, 200, cacheSetTTL(ck, { entradas }, 3));
}

export default async function handler(req, res) {
  try {
    if (req.query && req.query.fluxo) return await fluxoAtividade(req, res);
    const janela = normalizaJanela((req.query && req.query.janela) || '7d');
    const ck = `atividade:${janela}`;
    const cached = cacheGet(ck);
    if (cached) return json(res, 200, cached);

    const r = rangeFor(janela);
    const inicio = new Date(r.startISO).getTime();
    const fim = new Date(r.endISO).getTime();   // limite superior (janelas passadas)
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

      // Concluídas (agregado, sem atribuição individual em v1).
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
      resumos,
      eventos,
    };
    return json(res, 200, cacheSet(ck, payload));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
