// Web Push SEM dependência (2026-11-09, camada iPad): RFC 8291 (cifra aes128gcm) + RFC 8292 (VAPID, ES256) só com node:crypto.
// Chaves VAPID no formato do pacote `web-push` (base64url): pública = ponto P-256 NÃO comprimido de 65 bytes (0x04||X||Y),
// privada = os 32 bytes de `d`. Env: VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT (mailto: ou https:).
// Nada aqui lê o Supabase nem sabe de pessoa — quem guarda as inscrições é api/_lib/push.js.
import crypto from 'node:crypto';

export const b64u = (buf) => Buffer.from(buf).toString('base64url');
export const deB64u = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, ''), 'base64');

export function vapidDeEnv(env = process.env) {
  return { pub: String(env.VAPID_PUBLIC_KEY || '').trim(), priv: String(env.VAPID_PRIVATE_KEY || '').trim(), sub: String(env.VAPID_SUBJECT || '').trim() || 'mailto:ti@dexterityit.com.br' };
}
export const vapidConfigurado = (env = process.env) => { const v = vapidDeEnv(env); return !!(v.pub && v.priv); };

function chavePrivada(pub, priv) {
  const P = deB64u(pub), D = deB64u(priv);
  if (P.length !== 65 || P[0] !== 4) throw new Error('VAPID_PUBLIC_KEY inválida (esperado ponto P-256 de 65 bytes).');
  if (D.length !== 32) throw new Error('VAPID_PRIVATE_KEY inválida (esperado 32 bytes).');
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(P.subarray(1, 33)), y: b64u(P.subarray(33, 65)), d: b64u(D) }, format: 'jwk' });
}

/** JWT ES256 do VAPID: aud = origem do endpoint, exp ≤ 24 h (usa 12 h), sub = mailto:/https:. Assinatura raw r||s (P1363) em base64url. */
export function vapidJwt(aud, sub, { pub, priv } = {}, { agora = Date.now(), validadeSeg = 12 * 3600 } = {}) {
  const exp = Math.floor(agora / 1000) + Math.min(validadeSeg, 24 * 3600 - 60);
  const cab = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const cor = b64u(JSON.stringify({ aud, exp, sub }));
  const sig = crypto.sign('sha256', Buffer.from(`${cab}.${cor}`), { key: chavePrivada(pub, priv), dsaEncoding: 'ieee-p1363' });
  return `${cab}.${cor}.${b64u(sig)}`;
}

/**
 * Cifra o corpo (RFC 8291 §3, registro único). Devolve o Buffer pronto para o POST:
 *   salt(16) | rs(4, =4096) | idlen(1, =65) | chave pública efêmera (65) | texto cifrado + tag(16).
 * `p256dh` (65 bytes) e `auth` (16 bytes) em base64url (os da inscrição do navegador). `opc.salt` e `opc.asPrivada`
 * (32 bytes, base64url ou Buffer) existem SÓ para o vetor de teste do RFC — em produção são aleatórios.
 */
export function cifraPayload(p256dh, auth, bytes, opc = {}) {
  const uaPub = deB64u(p256dh), authS = deB64u(auth);
  if (uaPub.length !== 65 || uaPub[0] !== 4) throw new Error('p256dh inválido.');
  if (authS.length !== 16) throw new Error('auth inválido.');
  const dados = Buffer.from(bytes);
  if (dados.length > 4096 - 17 - 1) throw new Error('payload grande demais para um registro (máx. 4078 bytes).');
  const salt = opc.salt ? Buffer.from(typeof opc.salt === 'string' ? deB64u(opc.salt) : opc.salt) : crypto.randomBytes(16);
  const ecdh = crypto.createECDH('prime256v1');
  if (opc.asPrivada) ecdh.setPrivateKey(typeof opc.asPrivada === 'string' ? deB64u(opc.asPrivada) : Buffer.from(opc.asPrivada)); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();   // 65 bytes, não comprimida
  const segredo = ecdh.computeSecret(uaPub);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', segredo, authS, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const cifrado = Buffer.concat([c.update(Buffer.concat([dados, Buffer.from([2])])), c.final(), c.getAuthTag()]);   // 0x02 = delimitador do último registro
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, cifrado]);
}

/**
 * Envia UM push. `sub` = {endpoint, keys:{p256dh, auth}}; `payload` = objeto (vira JSON) ou texto/Buffer.
 * → { ok, status, apagar } — `apagar` = 404/410 (inscrição morta). Nunca lança: falha de rede/cifra volta { ok:false, status:0, erro }.
 */
export async function enviaPush(sub, payload, { ttl = 86400, urgency = 'normal', topic, timeoutMs = 4000, vapid, agora } = {}) {
  try {
    const v = vapid || vapidDeEnv();
    if (!v.pub || !v.priv) return { ok: false, status: 0, apagar: false, erro: 'VAPID não configurado.' };
    const ep = new URL(String(sub && sub.endpoint));
    if (ep.protocol !== 'https:') return { ok: false, status: 0, apagar: false, erro: 'endpoint não é https.' };
    const corpo = cifraPayload(sub.keys && sub.keys.p256dh, sub.keys && sub.keys.auth,
      Buffer.isBuffer(payload) ? payload : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)));
    const jwt = vapidJwt(ep.origin, v.sub, v, { agora });
    const h = {
      Authorization: `vapid t=${jwt}, k=${v.pub}`, 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      'Content-Length': String(corpo.length), TTL: String(Math.max(0, Math.floor(ttl))),
      Urgency: ['very-low', 'low', 'normal', 'high'].includes(urgency) ? urgency : 'normal',
    };
    const tp = String(topic || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
    if (tp) h.Topic = tp;
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
    let r;
    try { r = await fetch(ep.href, { method: 'POST', headers: h, body: corpo, signal: ac.signal }); } finally { clearTimeout(t); }
    const status = r.status;
    return { ok: status >= 200 && status < 300, status, apagar: status === 404 || status === 410 };
  } catch (e) {
    return { ok: false, status: 0, apagar: false, erro: String(e && e.message ? e.message : e).slice(0, 160) };
  }
}
