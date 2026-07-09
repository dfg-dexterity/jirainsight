// GET /api/atividade?janela=hoje|7d|30d
// Lê a atividade do Jira (alterações, transições, comentários, criações) na janela
// e devolve eventos compactos + mapas de apoio. A atribuição "quem fez" vem do
// AUTOR no changelog (não do assignee).
import {
  rangeFor, normalizaJanela, cacheGet, cacheSet, cacheSetTTL, jiraBase, json,
} from './_lib/util.js';
import { coletaAtividade } from './_lib/atividade.js';

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
    const col = await coletaAtividade(r);

    const payload = {
      meta: {
        ...r,
        totalIssues: col.totalIssues,
        paginas: col.paginas,
        truncado: col.truncado,
        concluidasTotal: col.concluidasTotal,
        concluidasPorProjeto: col.concluidasPorProjeto,
      },
      pessoas: col.pessoas,
      projetos: col.projetos,
      resumos: col.resumos,
      eventos: col.eventos,
    };
    return json(res, 200, cacheSet(ck, payload));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
