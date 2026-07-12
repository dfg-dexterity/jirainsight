// GET /api/tempo?janela=hoje|7d|30d|...   (ou ?desde=YYYY-MM-DD&ate=YYYY-MM-DD)
// Lê os apontamentos de horas do Clockwork (Pro) na janela, enriquece cada worklog
// com projeto/categoria/tipo via Jira e classifica faturável vs não-faturável.
import {
  rangeFor, normalizaJanela, cacheGet, cacheSet, worklogsEnriquecidos, json,
} from './_lib/util.js';

export default async function handler(req, res) {
  try {
    // Intervalo: janela predefinida (padrão) OU intervalo livre desde/ate (usado pela
    // apuração de AMS, que precisa do trimestre vigente independentemente do período da tela).
    const RE_D = /^\d{4}-\d{2}-\d{2}$/;
    const desde = String((req.query && req.query.desde) || '');
    const ate = String((req.query && req.query.ate) || '');
    let r, ck;
    if (RE_D.test(desde) && RE_D.test(ate) && desde <= ate
        && (new Date(ate) - new Date(desde)) <= 400 * 86400000) {
      r = {
        janela: 'custom', startDate: desde, endDate: ate,
        startISO: `${desde}T00:00:00-03:00`, endISO: `${ate}T23:59:59-03:00`,
        geradoEm: new Date().toISOString(),
      };
      ck = `tempo:custom:${desde}:${ate}`;
    } else {
      const janela = normalizaJanela((req.query && req.query.janela) || '7d');
      r = rangeFor(janela);
      ck = `tempo:${janela}`;
    }
    // ?nocache=1 força a leitura fresca (o resultado novo ainda alimenta o cache).
    const cached = (req.query && req.query.nocache === '1') ? null : cacheGet(ck);
    if (cached) return json(res, 200, cached);

    const enr = await worklogsEnriquecidos(r.startDate, r.endDate);
    const payload = {
      meta: { ...r, totalWorklogs: enr.worklogs.length },
      pessoas: enr.pessoas,
      projetos: enr.projetos,
      resumos: enr.resumos,
      infos: enr.infos,
      worklogs: enr.worklogs,
    };
    return json(res, 200, cacheSet(ck, payload));
  } catch (err) {
    return json(res, 500, { erro: String(err && err.message ? err.message : err) });
  }
}
