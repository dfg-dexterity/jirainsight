// 🔔 Ponto ÚNICO de aviso por pessoa (2026-11-09, camada iPad): Teams DM (avisaTeamsDM) E Web Push, em paralelo.
// Um falhar não derruba o outro nem a ação principal (allSettled). A assinatura de avisaTeamsDM NÃO muda.
//   notificaPessoas(pendentes:[{accountId,nome,email}], mensagemDe(p) → corpo do Teams, { tipo, push, teams })
//   tipo ∈ convites | reunioes | sexta | plano (decide a preferência do push)
//   push(p) → {titulo, corpo, url, tag}; sem ele o push é DERIVADO do corpo do Teams (título + texto sem markdown/links/e-mail).
// → { teams, push }  (teams = o retorno do avisaTeamsDM: null quando TEAMS_DM_WEBHOOK_URL falta; push = {enviados,…} do pushEnviaPara)
import { avisaTeamsDM } from '../apontar.js';
import { pushEnviaPara } from './push.js';

export function pushDerivado(m, url) {
  const x = m || {};
  return { titulo: x.titulo || 'Dexterity Hub', corpo: String(x.texto || x.corpo || ''), url: url || '/', tag: x.tag };
}

export async function notificaPessoas(pendentes, mensagemDe, { tipo, push, teams = avisaTeamsDM, sb, vapid } = {}) {
  const lista = Array.isArray(pendentes) ? pendentes : [];
  const [t, p] = await Promise.allSettled([
    (async () => teams(lista, mensagemDe))(),
    pushEnviaPara(lista, (pes) => {
      const m = typeof push === 'function' ? push(pes) : null;
      return m || pushDerivado(mensagemDe(pes) || {});
    }, { tipo, sb, vapid }),
  ]);
  return {
    teams: t.status === 'fulfilled' ? t.value : { enviados: 0, total: lista.length, semEmail: [], falhas: [String(t.reason && t.reason.message ? t.reason.message : t.reason).slice(0, 120)], falhasIds: lista.map((x) => String(x.accountId || '')).filter(Boolean), erro: true },
    push: p.status === 'fulfilled' ? p.value : { enviados: 0, pessoas: 0, apagadas: 0, semInscricao: 0, falhas: 1 },
  };
}
