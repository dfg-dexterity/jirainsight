// Gera um par de chaves VAPID (Web Push) só com node:crypto e IMPRIME no formato do `web-push` (base64url).
// NUNCA grava em arquivo: copie para as envs da Vercel (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) e feche o terminal.
import crypto from 'node:crypto';
const e = crypto.createECDH('prime256v1');
e.generateKeys();
const b64u = (b) => Buffer.from(b).toString('base64url');
console.log('VAPID_PUBLIC_KEY=' + b64u(e.getPublicKey()));
console.log('VAPID_PRIVATE_KEY=' + b64u(Buffer.concat([Buffer.alloc(32), e.getPrivateKey()]).subarray(-32)));   // 32 bytes sempre (zeros à esquerda)
console.log('VAPID_SUBJECT=mailto:ti@dexterityit.com.br');
console.error('\nAs chaves NÃO foram gravadas em lugar nenhum. Guarde a privada só nas envs da Vercel.');
