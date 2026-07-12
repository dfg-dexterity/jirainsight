#!/usr/bin/env node
// 📍 MEU DIA — ponte ActivityWatch → painel Insights de Uso (Jira + Clockwork).
//
// O ActivityWatch (https://activitywatch.net — gratuito, open source, roda 100%
// local) registra qual APP e qual JANELA estão em primeiro plano no seu Mac.
// Este script lê os eventos do dia na API local dele, agrega em BLOCOS de
// atividade (app + título + duração) e envia para o painel — a aba "📍 Meu dia"
// usa a IA para sugerir onde apontar as horas e onde criar os tickets.
//
// Uso (uma vez por dia, ou quando quiser — cada envio substitui o anterior):
//   JIRA_EMAIL=voce@dexterity.com.br JIRA_TOKEN=seu-token \
//     node meudia-activitywatch.mjs [AAAA-MM-DD]
//
//   · JIRA_EMAIL / JIRA_TOKEN: os MESMOS e-mail e token de API do Jira que você
//     usa no painel (aba Apontar → Identificar-se). Nada é persistido no servidor
//     além dos blocos do dia.
//   · O dia é opcional (padrão: hoje).
//   · PAINEL_URL muda o destino (padrão: https://jirainsight.vercel.app).
//   · AW_URL muda a API do ActivityWatch (padrão: http://localhost:5600).
//
// Para automatizar no macOS: agende com o cron (crontab -e):
//   45 17 * * 1-5  JIRA_EMAIL=... JIRA_TOKEN=... /usr/local/bin/node /caminho/meudia-activitywatch.mjs
//
// Privacidade: só saem daqui o NOME DO APP e o TÍTULO DA JANELA de blocos com
// 5+ minutos — sem screenshots, sem conteúdo. Revise a lista impressa antes de
// confirmar com --enviar (sem essa flag, o script só MOSTRA o que enviaria).

const AW = (process.env.AW_URL || 'http://localhost:5600').replace(/\/+$/, '');
const PAINEL = (process.env.PAINEL_URL || 'https://jirainsight.vercel.app').replace(/\/+$/, '');
const EMAIL = process.env.JIRA_EMAIL || '';
const TOKEN = process.env.JIRA_TOKEN || '';
const MIN_BLOCO_SEG = 5 * 60;        // blocos menores que 5 min não entram
const MESCLA_GAP_SEG = 90;           // pausas curtas entre eventos iguais são mescladas
const MAX_BLOCOS = 80;

const args = process.argv.slice(2);
const ENVIAR = args.includes('--enviar');
const dia = (args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))) || new Date().toISOString().slice(0, 10);

if (!EMAIL || !TOKEN) {
  console.error('Defina JIRA_EMAIL e JIRA_TOKEN (os mesmos do painel). Ex.:');
  console.error('  JIRA_EMAIL=voce@dexterity.com.br JIRA_TOKEN=xxxx node meudia-activitywatch.mjs --enviar');
  process.exit(1);
}

const hhmm = (iso) => new Date(iso).toTimeString().slice(0, 5);

async function main() {
  // 1) Bucket de janelas do ActivityWatch (aw-watcher-window_<host>).
  const buckets = await fetch(`${AW}/api/0/buckets`).then((r) => r.json());
  const chave = Object.keys(buckets).find((k) => k.startsWith('aw-watcher-window'));
  if (!chave) { console.error('ActivityWatch sem bucket de janelas — ele está rodando?'); process.exit(1); }

  // 2) Eventos do dia (horário local).
  const ini = `${dia}T00:00:00`;
  const fim = `${dia}T23:59:59`;
  const eventos = await fetch(`${AW}/api/0/buckets/${encodeURIComponent(chave)}/events?start=${ini}&end=${fim}&limit=5000`)
    .then((r) => r.json());
  if (!Array.isArray(eventos) || !eventos.length) { console.error(`Nenhum evento em ${dia}.`); process.exit(1); }

  // 3) Agrega em blocos: eventos consecutivos do mesmo app+título viram um bloco;
  //    pausas curtas (<90s) não quebram o bloco.
  const ord = eventos
    .map((e) => ({ t: new Date(e.timestamp).getTime(), dur: Number(e.duration) || 0,
      app: String((e.data && e.data.app) || ''), titulo: String((e.data && e.data.title) || '') }))
    .filter((e) => e.app && e.dur > 0)
    .sort((a, b) => a.t - b.t);

  const blocos = [];
  for (const e of ord) {
    const ult = blocos[blocos.length - 1];
    const fimUlt = ult ? ult.t + ult.seg * 1000 : 0;
    if (ult && ult.app === e.app && ult.titulo === e.titulo && (e.t - fimUlt) / 1000 <= MESCLA_GAP_SEG) {
      ult.seg = Math.round((e.t + e.dur * 1000 - ult.t) / 1000);
    } else {
      blocos.push({ t: e.t, app: e.app, titulo: e.titulo, seg: Math.round(e.dur) });
    }
  }
  const finais = blocos
    .filter((b) => b.seg >= MIN_BLOCO_SEG)
    .sort((a, b) => b.seg - a.seg).slice(0, MAX_BLOCOS)
    .sort((a, b) => a.t - b.t)
    .map((b) => ({
      inicio: hhmm(new Date(b.t).toISOString()),
      fim: hhmm(new Date(b.t + b.seg * 1000).toISOString()),
      app: b.app.slice(0, 60), titulo: b.titulo.slice(0, 140), seg: b.seg,
    }));
  if (!finais.length) { console.error('Nenhum bloco com 5+ minutos.'); process.exit(1); }

  const totalH = (finais.reduce((s, b) => s + b.seg, 0) / 3600).toFixed(1);
  console.log(`\n📍 Meu dia — ${dia} · ${finais.length} bloco(s) · ${totalH}h\n`);
  finais.forEach((b) => console.log(`  ${b.inicio}–${b.fim}  ${String(Math.round(b.seg / 60)).padStart(3)}min  ${b.app} — ${b.titulo.slice(0, 80)}`));

  if (!ENVIAR) {
    console.log('\n(prévia — nada foi enviado; revise a lista e rode de novo com --enviar)');
    return;
  }

  // 4) Envia ao painel (o servidor valida seu token no Jira antes de gravar).
  const r = await fetch(`${PAINEL}/api/resumo?acao=meudia-ingest`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, token: TOKEN, dia, blocos: finais }),
  });
  const j = await r.json().catch(() => ({}));
  if (j.ok) console.log(`\n✓ Enviado: ${j.blocos} bloco(s) de ${dia} para ${j.nome}. Abra o painel → Operação → 📍 Meu dia.`);
  else { console.error(`\n✗ Falha: ${j.erro || `HTTP ${r.status}`}`); process.exit(1); }
}

main().catch((e) => { console.error('Erro:', e.message || e); process.exit(1); });
