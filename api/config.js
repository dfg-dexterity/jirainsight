// GET /api/config  -> { configurado, data }
// POST /api/config -> salva a configuração (metas/ausências) compartilhada do time.
//
// Guarda um único registro (id='default') na tabela `jirainsight_config` do Supabase.
// Requer as variáveis de ambiente SUPABASE_URL e SUPABASE_ANON_KEY. Sem elas, responde
// { configurado:false } e o front-end usa o armazenamento local do navegador.
import { json } from './_lib/util.js';

const TABELA = 'jirainsight_config';
const ID = 'default';

function lerBody(req) {
  return new Promise((resolve) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'string') { try { return resolve(JSON.parse(req.body)); } catch (e) { return resolve({}); } }
      return resolve(req.body);
    }
    let d = '';
    req.on('data', (c) => { d += c; });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  const base = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_ANON_KEY || '';
  if (!base || !key) return json(res, 200, { configurado: false });

  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    if (req.method === 'POST') {
      const body = await lerBody(req);
      const data = (body && typeof body === 'object') ? body : {};
      const payload = [{ id: ID, data, updated_at: new Date().toISOString() }];
      const r = await fetch(`${base}/rest/v1/${TABELA}?on_conflict=id`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const t = await r.text();
        return json(res, 200, { configurado: true, ok: false, erro: t.slice(0, 300) });
      }
      return json(res, 200, { configurado: true, ok: true });
    }

    const r = await fetch(`${base}/rest/v1/${TABELA}?id=eq.${ID}&select=data`, { headers });
    if (!r.ok) {
      const t = await r.text();
      return json(res, 200, { configurado: true, data: {}, erro: t.slice(0, 300) });
    }
    const rows = await r.json();
    const data = (Array.isArray(rows) && rows[0] && rows[0].data) || {};
    return json(res, 200, { configurado: true, data });
  } catch (err) {
    return json(res, 200, { configurado: true, erro: String(err && err.message ? err.message : err) });
  }
}
