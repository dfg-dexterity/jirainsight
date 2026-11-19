// Jira Insights · 20d · 🚧 PENDÊNCIAS E BLOQUEIOS (issue #230 / JI-301, 2026-11-19, a pedido do usuário via 🐞 Reportar no ⏱ Apontar: "os bloqueios
// ficam em comentários soltos, sem resposta, sem dizer o que é crítico e o que é só ciência; o responsável pelo entregável precisa de
// rastreabilidade total e de gerir o bloqueio"). O bloqueio mora NO TICKET DO JIRA: comentário com marcador na 1ª linha (um EVENTO por
// comentário: abrir · atualizar · resolver · reabrir) + o flag de impedimento + a label `bloqueio-aberto`. O formato e as regras moram no
// servidor (api/_lib/bloqueios.js — fonte ÚNICA): esta tela NUNCA escreve o marcador à mão, só mostra a prévia do que o servidor montaria
// (bqPreviaLinhas = espelho só de exibição). Nada disto vive na `cfg`.
// Leitura: GET /api/vencimentos?bloqueios=1[&resolvidos=1][&nocache=1] (conta de serviço; cache de 3 min no servidor e na tela).
// Escrita: POST /api/transicao {bloqueio:{acao,id,nivel,quem,prazo,texto,interno}, issue, email, token} (token da própria pessoa).
// Cada função da Vercel tem o seu cache: depois de escrever, `estado.bq.sujo=true` e a próxima leitura vai com nocache=1.
// CONTRATO PÚBLICO (usado pelos pontos de entrada das outras telas — não mude os nomes): bqGarante · bqDe · bqSeloHTML · bqBotaoHTML ·
// [data-bq-abre] · [data-bq-ver] · bqParaMim/bqParaMimN · bqMeusTravados · bqVencidosGerente · bqCardInicioHTML · bqInboxHTML/bqInboxN ·
// bqFichaHTML · abreBloqueio · bqAbre · bqAoFecharModal · renderBloqueios (vista `bloqueios`, aba do grupo 📥 Inbox).
estado.bq=estado.bq||{ dados:null, em:0, carregando:false, erro:'', erroEm:0, sujo:false, sujoK:{}, escopo:'meus',
  fil:{ papel:'', proj:'', nivel:'', venc:false, q:'' }, resolv:null, resolvCarregando:false, resolvAberto:false,
  hist:{}, exp:{}, foco:'', ficha:{}, fichaItem:{} };
const BQ_TTL_MS=3*60*1000;          // a mesma régua do cache do servidor
const BQ_ERRO_MS=60*1000;           // leitura que falhou não é repetida por 1 min (sem laço)
const BQ_VISTAS_SELO=['bloqueios','apontar','gestao','statusrep','gp','acoes','inbox'];
const BQ_NIV={ crit:{ ic:'🔴', rot:'Crítico', ord:0, desc:'Trava a entrega — atenção imediata.' },
  imp:{ ic:'🟡', rot:'Importante', ord:1, desc:'Precisa de resposta com prazo.' },
  cien:{ ic:'🔵', rot:'Ciência', ord:2, desc:'Só para saber — não trava ninguém agora.' } };
const BQ_MODOS={
  abrir:{ ic:'⛔', tit:'Registrar bloqueio', bt:'Registrar bloqueio', motivo:'registrar um bloqueio no Jira' },
  atualizar:{ ic:'📝', tit:'Atualizar bloqueio', bt:'Salvar alterações', motivo:'atualizar um bloqueio no Jira' },
  nota:{ ic:'💬', tit:'Responder no bloqueio', bt:'Publicar nota', motivo:'responder num bloqueio no Jira' },
  resolver:{ ic:'✅', tit:'Desbloquear', bt:'Confirmar desbloqueio', motivo:'desbloquear um ticket no Jira' },
  reabrir:{ ic:'🔁', tit:'Reabrir bloqueio', bt:'Reabrir bloqueio', motivo:'reabrir um bloqueio no Jira' } };
const BQ_ACAO={ abrir:'abrir', atualizar:'atualizar', nota:'atualizar', resolver:'resolver', reabrir:'reabrir' };
let _bq=null;           // estado do modal aberto (zerado em bqAoFecharModal)
let _bqIdx={};          // chave do ticket → item (refeito a cada chegada/alteração)

// ---------------------------------------------------------------- datas e pequenos helpers
const bqDif=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000);
const bqDm=(iso)=>iso?`${iso.slice(8,10)}/${iso.slice(5,7)}`:'';
const bqDmA=(iso)=>iso?`${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`:'';
const bqNorm=(s)=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function bqDiaUtilMais(d,n){ let x=d, i=0, g=0; while(i<n&&g++<60){ x=proxDia(x); if(ehUtil(x)&&!ehFeriado(x)) i++; } return x; }
function bqSexta(hoje){ let d=hoje, g=0; while(diaSemana(d)!==5&&g++<8) d=proxDia(d); return d; }
function bqNovoId(){ let s=''; while(s.length<4) s=Math.random().toString(36).slice(2,6); return s.slice(0,4); }
const bqHoje=()=>{ const m=estado.bq.dados&&estado.bq.dados.meta; return (m&&m.hoje)||hojeSP(); };
const bqNome=(p)=>String((p&&p.nome)||nomePessoaDe(p&&p.a)||'');
const bqEu=()=>{ const id=idApontar(); return id&&id.accountId?String(id.accountId):''; };
const bqAbertosDe=(it)=>((it&&it.bloqueios)||[]).filter(b=>b&&b.st==='aberto');
const bqVenc=(b,hoje)=>!!(b&&b.st==='aberto'&&b.prazo&&b.prazo<hoje);
function bqCmp(a,b,hoje){   // a mesma régua do servidor (bqOrdem): nível › vencido › prazo › mais antigo
  const na=(BQ_NIV[a.nivel]||BQ_NIV.imp).ord, nb=(BQ_NIV[b.nivel]||BQ_NIV.imp).ord; if(na!==nb) return na-nb;
  const va=bqVenc(a,hoje)?0:1, vb=bqVenc(b,hoje)?0:1; if(va!==vb) return va-vb;
  const pa=a.prazo||'9999-12-31', pb=b.prazo||'9999-12-31'; if(pa!==pb) return pa<pb?-1:1;
  return String(a.abertoDia||'')<String(b.abertoDia||'')?-1:(String(a.abertoDia||'')>String(b.abertoDia||'')?1:0);
}
function bqReindexa(){ _bqIdx={}; const d=estado.bq.dados; ((d&&d.itens)||[]).forEach(it=>{ if(it&&it.k) _bqIdx[it.k]=it; }); }
const bqItem=(k)=>_bqIdx[String(k||'').toUpperCase()]||null;
function bqAssinatura(j){
  try{ return JSON.stringify([ (j.itens||[]).map(i=>[i.k,i.flag,i.label,i.semRegistro?1:0,(i.bloqueios||[]).map(b=>[b.id,b.st,b.nivel,b.prazo,b.atualizadoEm,(b.quem&&(b.quem.nome||(b.quem.pessoas||[]).map(p=>p.a).join(',')))||''])]), j.meta&&j.meta.flag, j.meta&&j.meta.idx, j.meta&&j.meta.orfasLabel, j.meta&&j.meta.truncado ]); }
  catch(e){ return String(Math.random()); }
}

// ---------------------------------------------------------------- leitura
function bqGarante(forca){
  const s=estado.bq; if(s.carregando) return;
  const agora=Date.now();
  if(!forca&&s.dados&&(agora-s.em)<BQ_TTL_MS) return;                 // o `sujo` só faz a PRÓXIMA leitura ir com nocache — não antecipa a leitura (o índice de busca do Jira atrasa alguns segundos)
  if(!forca&&s.erroEm&&(agora-s.erroEm)<BQ_ERRO_MS) return;
  s.carregando=true; const nc=!!forca||s.sujo;
  fetch(`/api/vencimentos?bloqueios=1${nc?'&nocache=1':''}`)
    .then(r=>r.json().catch(()=>({erro:'resposta inválida'}))).then(j=>{
      s.carregando=false;
      if(!j||j.erro||!j.meta||!Array.isArray(j.itens)){ s.erro=(j&&j.erro)||'resposta vazia'; s.erroEm=Date.now(); if(estado.vista==='bloqueios') renderBloqueios(); return; }
      const antes=s.dados?bqAssinatura(s.dados):''; const depois=bqAssinatura(j);
      s.dados=j; s.em=Date.now(); s.erro=''; s.erroEm=0; if(nc){ s.sujo=false; s.sujoK={}; }
      bqReindexa();
      if(estado.vista==='bloqueios'){ renderBloqueios(); if(typeof renderAbas==='function'){ try{ renderAbas(); }catch(e){} } }   // a própria tela sempre redesenha (↻ destrava o botão) e a aba ganha o contador
      else if(antes!==depois&&BQ_VISTAS_SELO.includes(estado.vista)){ try{ render(); }catch(e){} }
      else if(typeof renderAbas==='function'){ try{ renderAbas(); }catch(e){} }
    }).catch(e=>{ s.carregando=false; s.erro=humanizaErro(e); s.erroEm=Date.now(); if(estado.vista==='bloqueios') renderBloqueios(); });
}
function bqCarregaResolvidos(forca){
  const s=estado.bq; if(s.resolvCarregando) return;
  s.resolvCarregando=true;
  fetch(`/api/vencimentos?bloqueios=1&resolvidos=1${(forca||s.sujo)?'&nocache=1':''}`)
    .then(r=>r.json().catch(()=>({erro:'resposta inválida'}))).then(j=>{
      s.resolvCarregando=false;
      s.resolv=(!j||j.erro||!Array.isArray(j.itens))?{ erro:(j&&j.erro)||'resposta vazia', itens:[] }:{ erro:'', itens:j.itens, meta:j.meta||{} };
      if(estado.vista==='bloqueios') renderBloqueios();
    }).catch(e=>{ s.resolvCarregando=false; s.resolv={ erro:humanizaErro(e), itens:[] }; if(estado.vista==='bloqueios') renderBloqueios(); });
}

// ---------------------------------------------------------------- consultas (contrato público)
function bqDe(k){ bqGarante(); const it=bqItem(k); return bqAbertosDe(it); }
function bqLinhas(){   // [{k,it,b}] de todos os bloqueios abertos
  const d=estado.bq.dados; const out=[]; ((d&&d.itens)||[]).forEach(it=>bqAbertosDe(it).forEach(b=>out.push({ k:it.k, it, b })));
  return out;
}
function bqParaMim(){
  const a=bqEu(); if(!a||!estado.bq.dados) return [];
  return bqLinhas().filter(x=>x.b.quem&&x.b.quem.tipo==='time'&&(x.b.quem.pessoas||[]).some(p=>p.a===a));
}
function bqParaMimN(){ const a=bqEu(); if(!a||!estado.bq.dados) return null; return bqParaMim().length; }
function bqMeusTravados(){
  const a=bqEu(); if(!a||!estado.bq.dados) return [];
  return bqLinhas().filter(x=>(x.it.respId===a||x.b.abertoPorId===a)&&!(x.b.quem&&x.b.quem.tipo==='time'&&(x.b.quem.pessoas||[]).some(p=>p.a===a)));
}
function bqVencidosGerente(){
  const a=bqEu(); if(!a||!estado.bq.dados) return [];
  const ps=meusProjetos(a); if(!ps.length) return []; const hoje=bqHoje();
  return bqLinhas().filter(x=>ps.includes(x.it.p)&&x.b.nivel!=='cien'&&bqVenc(x.b,hoje));
}
function bqPior(abertos){ return abertos.slice().sort((a,b)=>(BQ_NIV[a.nivel]||BQ_NIV.imp).ord-(BQ_NIV[b.nivel]||BQ_NIV.imp).ord)[0]; }

// ---------------------------------------------------------------- selo e botão (contrato público)
function bqSeloHTML(k){
  bqGarante(); const ab=bqDe(k); if(!ab.length) return '';
  const hoje=bqHoje(); const pior=bqPior(ab); const venc=ab.some(b=>bqVenc(b,hoje));
  const tip=`${ab.length} bloqueio(s) aberto(s): ${ab.map(b=>`${(BQ_NIV[b.nivel]||{}).ic||''} ${(BQ_NIV[b.nivel]||{}).rot||''}${b.prazo?` até ${bqDm(b.prazo)}`:''}`).join(' · ')}${venc?' — com prazo vencido':''} — clique para ver`;
  return `<button type="button" class="bq-selo bq-${escA(pior.nivel)}" data-bq-ver="${escA(k)}" title="${escA(tip)}" aria-label="${escA(tip)}">⛔ ${ab.length}${venc?' ⏰':''}</button>`;
}
function bqBotaoHTML(k, cls, rot){
  return `<button type="button" class="${escA(cls||'btn')}" data-bq-abre="${escA(k)}" data-tip="Registrar um bloqueio neste ticket: nível (crítico, importante, ciência), quem destrava e o prazo">${esc(rot||'⛔ bloqueio')}</button>`;
}
function bqVai(escopo, o){
  const s=estado.bq; o=o||{};
  s.escopo=escopo==='time'?'time':'meus'; s.fil={ papel:'', proj:'', nivel:'', venc:!!o.venc, q:'' }; s.foco=o.foco?String(o.foco).toUpperCase():'';
  vaiPara('bloqueios');
}
function abreBloqueio(k){ bqAbre(k); }

// ---------------------------------------------------------------- 🏠 Início (card) e 📥 Inbox (blocos)
function bqCardInicioHTML(pcard){
  bqGarante(); const s=estado.bq;
  if(!s.dados&&!s.erro) return pcard('load','⛔','Bloqueios','<div class="ax-num muted">…</div><div class="ax-det">Carregando o Jira…</div>','bloqueios','Ver →');
  if(!s.dados) return pcard('aten','⛔','Bloqueios','<div class="ax-num muted">—</div><div class="ax-det">Não consegui ler os bloqueios agora — abra a tela e use o ↻.</div>','bloqueios','Ver →');
  if(!bqEu()) return pcard('aten','⛔','Bloqueios',`<div class="ax-num">${bqLinhas().length}</div><div class="ax-det">bloqueios abertos no time — identifique-se para ver os que dependem de você</div>`,'bloqueios','Ver →');
  const mim=bqParaMim(); const n=mim.length; const trav=bqMeusTravados().length;
  const cls=n?(mim.some(x=>x.b.nivel==='crit')?'crit':'aten'):'ok';
  const corpo=`<div class="ax-num">${n}</div><div class="ax-det">${n?'dependem de você para destravar':'nada espera você destravar 👌'}</div>${trav?`<div class="ax-det">${trav} travando os seus tickets</div>`:''}`;
  return pcard(cls,'⛔','Bloqueios',corpo,'bloqueios',n?'Destravar →':'Ver →');
}
function bqPrazoBadge(b,hoje){
  if(!b.prazo) return '<span class="bq-prazo sem">sem prazo</span>';
  const d=bqDif(hoje,b.prazo);
  if(d<0) return `<span class="bq-prazo venc">vencido há ${-d} dia${-d===1?'':'s'}</span>`;
  if(d===0) return '<span class="bq-prazo hoje">vence hoje</span>';
  return `<span class="bq-prazo">em ${d} dia${d===1?'':'s'} · ${esc(bqDm(b.prazo))}</span>`;
}
function bqInboxN(){ if(!estado.bq.dados||!bqEu()) return 0; return bqParaMim().length+bqVencidosGerente().length; }
function bqInboxHTML(){
  bqGarante(); if(!estado.bq.dados||!bqEu()) return '';
  const hoje=bqHoje(); const cmp=(x,y)=>bqCmp(x.b,y.b,hoje);
  const mim=bqParaMim().sort(cmp); const ven=bqVencidosGerente().sort(cmp);
  const cab=(x)=>`<span class="badge bq-nv-b bq-${escA(x.b.nivel)}">${esc((BQ_NIV[x.b.nivel]||{}).ic||'')} ${esc((BQ_NIV[x.b.nivel]||{}).rot||'')}</span>
    <a href="${jiraBase()}/browse/${encodeURIComponent(x.k)}" target="_blank" rel="noopener"><strong>${esc(x.k)}</strong></a> <span class="bq-res">${esc(x.it.resumo||'')}</span>
    ${bqPrazoBadge(x.b,hoje)}`;
  let h='';
  if(mim.length) h+=`<div class="card full bq-inbox">
    <h2>⛔ Bloqueios que dependem de você <span>${mim.length} — destrave, responda ou dê ciência; o ticket do Jira guarda tudo</span></h2>
    <div class="cv-lista">${mim.map(x=>`
      <div class="cv-row bq-row-ib" data-bq-item="${escA(x.k)}#${escA(x.b.id)}">${cab(x)}
        <span class="badge" data-tip="Quem registrou o bloqueio">📨 de ${esc(String(x.b.abertoPor||'?').split(' ')[0])}</span>
        <span class="spacer"></span>
        ${x.b.nivel==='cien'
          ?`<button class="btn primario" data-bq-abre="${escA(x.k)}" data-bq-id="${escA(x.b.id)}" data-bq-modo="resolver" data-bq-pre="Ciente.">👍 Ciente</button>`
          :`<button class="btn primario" data-bq-abre="${escA(x.k)}" data-bq-id="${escA(x.b.id)}" data-bq-modo="resolver">✅ Destravei</button>`}
        <button class="btn" data-bq-abre="${escA(x.k)}" data-bq-id="${escA(x.b.id)}" data-bq-modo="nota">💬 Responder</button>
        <button class="btn" data-gx-det="${escA(x.k)}" title="Ficha completa do ticket">🔍</button>
      </div>`).join('')}</div></div>`;
  if(ven.length) h+=`<div class="card full bq-inbox">
    <h2>⏰ Bloqueios vencidos nos seus projetos <span>${ven.length} 🔴/🟡 passaram do prazo — cobre quem destrava</span></h2>
    <div class="cv-lista">${ven.slice(0,8).map(x=>`
      <div class="cv-row bq-row-ib" data-bq-item="${escA(x.k)}#${escA(x.b.id)}">${cab(x)}
        <span class="badge">${x.b.quem?(x.b.quem.tipo==='cliente'?`🏢 ${esc(x.b.quem.nome||'')}`:`👤 ${esc((x.b.quem.pessoas||[]).map(bqNome).join(', '))}`):'sem responsável'}</span>
        <span class="spacer"></span>
        <button class="btn" data-bq-abre="${escA(x.k)}" data-bq-id="${escA(x.b.id)}" data-bq-modo="atualizar">📝 Atualizar</button>
        <button class="btn" data-bq-ver="${escA(x.k)}">Ver →</button>
      </div>`).join('')}
      ${ven.length>8?`<div class="muted small">e mais ${ven.length-8}…</div>`:''}
      <div><button class="btn primario" data-bq-venc-todos="1">⏰ Ver todos os vencidos →</button></div></div></div>`;
  return h;
}

// ---------------------------------------------------------------- 🔍 seção da ficha do ticket
function bqHistHTML(b){
  const ic={ abrir:'⛔', atualizar:'📝', resolver:'✅', reabrir:'🔁' }; const rot={ abrir:'Registrou', atualizar:'Atualizou', resolver:'Desbloqueou', reabrir:'Reabriu' };
  return `<ol class="bq-tl">${(b.hist||[]).map(e=>{
    const partes=[];
    if(e.nivel&&e.tipo!=='resolver') partes.push(`${(BQ_NIV[e.nivel]||{}).ic||''} ${(BQ_NIV[e.nivel]||{}).rot||''}`);
    if(e.quem) partes.push(e.quem.tipo==='cliente'?`🏢 ${e.quem.nome||''}`:`👤 ${(e.quem.pessoas||[]).map(bqNome).join(', ')}`);
    if(e.prazo) partes.push(`prazo ${bqDmA(e.prazo)}`);
    return `<li><span class="bq-tl-i">${ic[e.tipo]||'•'}</span><div><b>${esc(rot[e.tipo]||e.tipo)}</b> · ${esc(e.por||'—')} · <span class="muted">${esc(bqDmA(e.dia)||'')}</span>${partes.length?`<div class="muted small">${esc(partes.join(' · '))}</div>`:''}${e.texto?`<div class="bq-tl-t">${esc(e.texto)}</div>`:''}</div></li>`; }).join('')}</ol>`;
}
function bqFichaItemHTML(k,b,hoje){
  const n=BQ_NIV[b.nivel]||BQ_NIV.imp;
  const quem=b.quem?(b.quem.tipo==='cliente'?`🏢 cliente: ${esc(b.quem.nome||'')}`:`👤 ${esc((b.quem.pessoas||[]).map(bqNome).join(', '))}`):'—';
  const A=(modo,rot,cls,pre)=>`<button type="button" class="btn ${cls||''}" data-bq-abre="${escA(k)}" data-bq-id="${escA(b.id)}" data-bq-modo="${modo}"${pre?` data-bq-pre="${escA(pre)}"`:''}>${rot}</button>`;
  const acoes=b.st==='aberto'
    ?(b.nivel==='cien'?A('resolver','👍 Ciente','primario','Ciente.'):A('resolver','✅ Desbloquear','primario'))+A('atualizar','📝 Atualizar')+A('nota','💬 Responder')
    :A('reabrir','🔁 Reabrir');
  return `<div class="bq-ficha-b bq-${escA(b.nivel)}">
    <div class="bq-l1"><span class="badge bq-nv-b bq-${escA(b.nivel)}">${n.ic} ${esc(n.rot)}</span> <b>${b.st==='aberto'?'Aberto':'✅ Resolvido'}</b> <span class="muted small">#${esc(b.id)}</span>
      ${b.st==='aberto'?bqPrazoBadge(b,hoje):`<span class="muted small">em ${esc(bqDmA(b.resolvidoDia))} por ${esc(b.resolvidoPor||'—')}</span>`}</div>
    <div class="bq-l2 muted small">Quem destrava: <b>${quem}</b> · aberto em ${esc(bqDmA(b.abertoDia))} por ${esc(b.abertoPor||'—')}${b.reaberturas?` · reaberto ${b.reaberturas}×`:''}${b.interno?' · 🔒 nota interna':''}</div>
    ${b.texto?`<div class="bq-texto aberto">${esc(b.texto)}</div>`:''}
    <div class="bq-acoes">${acoes}</div>
    <details class="bq-hist-d"><summary>🕓 Linha do tempo (${(b.hist||[]).length})</summary>${bqHistHTML(b)}</details></div>`;
}
function bqFichaHTML(d){
  const l=Array.isArray(d&&d.bloqueios)?d.bloqueios:[]; if(!l.length||!d||!d.k) return '';
  const s=estado.bq; s.fichaItem[d.k]={ k:d.k, resumo:d.resumo||'', p:d.p||'', pNome:d.pNome||'', status:d.status||'', resp:d.resp||'' };
  l.forEach(b=>{ s.ficha[`${d.k}#${b.id}`]=b; });
  const hoje=hojeSP(); const ab=l.filter(b=>b.st==='aberto').length;
  return `<details class="bq-ficha" open><summary>🚧 Bloqueios (${ab} aberto${ab===1?'':'s'} · ${l.length} no total)</summary>${l.map(b=>bqFichaItemHTML(d.k,b,hoje)).join('')}</details>`;
}

// ---------------------------------------------------------------- vista 🚧
function bqEfetivo(){ return bqEu()?estado.bq.escopo:'time'; }
function bqBase(){   // linhas {it,b|null} dentro do escopo (+ projeto + busca) — antes dos filtros de nível/papel/vencido
  const s=estado.bq; const d=s.dados; if(!d) return [];
  const a=bqEu(); const ef=bqEfetivo(); const q=bqNorm(s.fil.q).trim();
  const out=[];
  (d.itens||[]).forEach(it=>{
    if(s.fil.proj&&it.p!==s.fil.proj) return;
    const abertos=bqAbertosDe(it);
    const rows=abertos.length?abertos.map(b=>({ it, b })):(it.semRegistro?[{ it, b:null }]:[]);
    rows.forEach(r=>{
      if(ef==='meus'){
        const souQuem=r.b&&r.b.quem&&r.b.quem.tipo==='time'&&(r.b.quem.pessoas||[]).some(p=>p.a===a);
        if(!(souQuem||it.respId===a||(r.b&&r.b.abertoPorId===a))) return;
      }
      if(q){
        const h=bqNorm([it.k,it.resumo,r.b&&r.b.texto,r.b&&r.b.quem&&(r.b.quem.nome||(r.b.quem.pessoas||[]).map(bqNome).join(' ')),it.resp].join(' '));
        if(!h.includes(q)) return;
      }
      out.push(r);
    });
  });
  return out;
}
function bqFiltra(rows){
  const f=estado.bq.fil; const a=bqEu(); const hoje=bqHoje();
  return rows.filter(r=>{
    if(f.nivel&&!(r.b&&r.b.nivel===f.nivel)) return false;
    if(f.venc&&!(r.b&&bqVenc(r.b,hoje))) return false;
    if(f.papel==='destravar') return !!(r.b&&r.b.quem&&r.b.quem.tipo==='time'&&(r.b.quem.pessoas||[]).some(p=>p.a===a));
    if(f.papel==='resp') return r.it.respId===a;
    if(f.papel==='abri') return !!(r.b&&r.b.abertoPorId===a);
    return true;
  });
}
function bqKpisHTML(rows){
  const f=estado.bq.fil; const hoje=bqHoje(); const a=bqEu();
  const ab=rows.filter(r=>r.b);
  const n=(nv)=>ab.filter(r=>r.b.nivel===nv).length;
  const venc=ab.filter(r=>bqVenc(r.b,hoje)).length;
  const mim=ab.filter(r=>r.b.quem&&r.b.quem.tipo==='time'&&(r.b.quem.pessoas||[]).some(p=>p.a===a)).length;
  const idade=ab.reduce((m,r)=>Math.max(m,r.b.abertoDia?Math.max(0,bqDif(r.b.abertoDia,hoje)):0),0);
  const K=(kpi,cls,v,l,on)=>`<button type="button" class="kpi ${cls} bq-kpi" data-bq-kpi="${kpi}" aria-pressed="${on?'true':'false'}"><div class="v">${v}</div><div class="l">${l}</div></button>`;
  return `<div class="kpis bq-kpis">
    ${K('crit','bq-k-crit',n('crit'),'🔴 Críticos',f.nivel==='crit')}${K('imp','bq-k-imp',n('imp'),'🟡 Importantes',f.nivel==='imp')}${K('cien','bq-k-cien',n('cien'),'🔵 Ciência',f.nivel==='cien')}
    ${K('venc',venc?'w':'t',venc,'⏰ Prazo vencido',f.venc)}${K('destravar',mim?'w':'t',a?mim:'—','🙋 Dependem de você',f.papel==='destravar')}
    <div class="kpi a bq-kpi" data-bq-kpi="antigo"><div class="v">${idade}<small>d</small></div><div class="l">⌛ Mais antigo</div></div></div>`;
}
function bqCardHTML(r,hoje){
  const it=r.it; const b=r.b; const link=`${jiraBase()}/browse/${encodeURIComponent(it.k)}`;
  if(!b) return `<div class="bq-item bq-sem" data-bq-item="${escA(it.k)}#">
    <div class="bq-l1"><a class="k" href="${link}" target="_blank" rel="noopener">${esc(it.k)} ↗</a> <span class="bq-res">${esc(it.resumo||'')}</span></div>
    <div class="bq-l2 muted small">🚩 Sinalizado no Jira como impedimento, sem bloqueio registrado${it.resp?` · responsável: ${esc(it.resp)}`:''}${it.status?` · ${esc(it.status)}`:''}</div>
    <div class="bq-acoes">${bqBotaoHTML(it.k,'btn primario','⛔ Registrar bloqueio')}<button class="btn" data-gx-det="${escA(it.k)}" title="Ficha completa do ticket">🔍</button></div></div>`;
  const key=`${it.k}#${b.id}`; const n=BQ_NIV[b.nivel]||BQ_NIV.imp; const s=estado.bq;
  const quem=b.quem?(b.quem.tipo==='cliente'?`<span class="chip bq-chip">🏢 cliente: ${esc(b.quem.nome||'')}</span>`:(b.quem.pessoas||[]).map(p=>`<span class="chip bq-chip">👤 ${esc(bqNome(p))}</span>`).join('')):'<span class="muted">—</span>';
  const idade=b.abertoDia?Math.max(0,bqDif(b.abertoDia,hoje)):0;
  const A=(modo,rot,cls,pre)=>`<button type="button" class="btn ${cls||''}" data-bq-abre="${escA(it.k)}" data-bq-id="${escA(b.id)}" data-bq-modo="${modo}"${pre?` data-bq-pre="${escA(pre)}"`:''}>${rot}</button>`;
  return `<div class="bq-item bq-${escA(b.nivel)}" data-bq-item="${escA(key)}">
    <div class="bq-l1"><a class="k" href="${link}" target="_blank" rel="noopener">${esc(it.k)} ↗</a> <span class="bq-res">${esc(it.resumo||'')}</span> ${bqPrazoBadge(b,hoje)}</div>
    <div class="bq-l2"><span class="bq-quem"><b>${b.nivel==='cien'?'Para ciência de':'Quem destrava'}:</b> ${quem}</span>
      <span class="muted small">aberto há ${idade} dia${idade===1?'':'s'} por ${esc(b.abertoPor||'—')}${it.resp?` · responsável: ${esc(it.resp)}`:''}${it.status?` · ${esc(it.status)}`:''}${b.interno?' · 🔒 interno':''}${b.reaberturas?` · reaberto ${b.reaberturas}×`:''}</span></div>
    ${b.texto?`<div class="bq-texto${s.exp[key]?' aberto':''}" data-bq-exp="${escA(key)}" title="Clique para ${s.exp[key]?'recolher':'ler tudo'}">${esc(b.texto)}</div>`:''}
    <div class="bq-acoes">${b.nivel==='cien'?A('resolver','👍 Ciente','primario','Ciente.'):A('resolver','✅ Desbloquear','primario')}${A('atualizar','📝 Atualizar')}${A('nota','💬 Responder')}
      <button type="button" class="btn" data-bq-hist="${escA(key)}" aria-expanded="${s.hist[key]?'true':'false'}">🕓 Histórico</button>
      <button type="button" class="btn" data-gx-det="${escA(it.k)}" title="Ficha completa do ticket">🔍</button></div>
    ${s.hist[key]?`<div class="bq-hist">${bqHistHTML(b)}</div>`:''}</div>`;
}
function bqListaHTML(rows){
  const hoje=bqHoje(); const fil=bqFiltra(rows);
  const f0=estado.bq.fil;
  if(!fil.length) return (rows.length||f0.q||f0.proj)
    ?'<div class="estado">Nenhum bloqueio com estes filtros. <button class="btn" data-bq-limpa="1">Limpar filtros</button></div>'
    :`<div class="estado">Nenhum bloqueio aberto${bqEfetivo()==='meus'?' para você':''} 🎉<br><button class="btn primario" id="bq-novo2" style="margin-top:10px">⛔ Registrar bloqueio…</button></div>`;
  let h='';
  [['crit','🔴 Críticos','trava a entrega'],['imp','🟡 Importantes','resposta com prazo'],['cien','🔵 Ciência','só para saber']].forEach(([nv,t,sub])=>{
    const l=fil.filter(r=>r.b&&r.b.nivel===nv).sort((x,y)=>bqCmp(x.b,y.b,hoje)); if(!l.length) return;
    h+=`<section class="bq-bloco"><h3>${t} <span class="bq-n">${l.length}</span> <span class="muted small">${sub}</span></h3>${l.map(r=>bqCardHTML(r,hoje)).join('')}</section>`;
  });
  const sem=fil.filter(r=>!r.b);
  if(sem.length) h+=`<section class="bq-bloco"><h3>🚩 Sinalizados no Jira sem bloqueio registrado <span class="bq-n">${sem.length}</span> <span class="muted small">alguém marcou o impedimento direto no Jira</span></h3>${sem.map(r=>bqCardHTML(r,hoje)).join('')}</section>`;
  return h;
}
function bqResolvHTML(){
  const s=estado.bq; const hoje=bqHoje();
  if(!s.resolvAberto) return '';
  if(s.resolvCarregando||!s.resolv) return '<div class="estado">Lendo os bloqueios resolvidos…</div>';
  if(s.resolv.erro) return `<div class="erro">${esc(s.resolv.erro)} <button class="btn" data-bq-resolv-retry="1" style="margin-left:10px">Tentar de novo</button></div>`;
  const rows=[]; (s.resolv.itens||[]).forEach(it=>(it.bloqueios||[]).filter(b=>b.st==='resolvido').forEach(b=>rows.push({ it, b })));
  rows.sort((x,y)=>String(y.b.resolvidoEm||'')<String(x.b.resolvidoEm||'')?-1:1);
  if(!rows.length) return '<div class="muted small">Nenhum bloqueio resolvido nos últimos 30 dias.</div>';
  return rows.map(r=>{ const d=r.b.resolvidoDia?Math.max(0,bqDif(r.b.resolvidoDia,hoje)):0; const n=BQ_NIV[r.b.nivel]||BQ_NIV.imp;
    return `<div class="bq-res-row" data-bq-item="${escA(r.it.k)}#${escA(r.b.id)}"><span class="badge bq-nv-b bq-${escA(r.b.nivel)}">${n.ic} ${esc(n.rot)}</span>
      <a href="${jiraBase()}/browse/${encodeURIComponent(r.it.k)}" target="_blank" rel="noopener"><b>${esc(r.it.k)}</b></a> <span class="bq-res">${esc(r.it.resumo||'')}</span>
      <span class="muted small">destravado há ${d} dia${d===1?'':'s'} por ${esc(r.b.resolvidoPor||'—')}${r.b.resolucao?` — ${esc(r.b.resolucao.slice(0,120))}`:''}</span>
      <span class="spacer"></span><button type="button" class="btn" data-bq-abre="${escA(r.it.k)}" data-bq-id="${escA(r.b.id)}" data-bq-modo="reabrir">🔁 Reabrir</button></div>`; }).join('');
}
function bqPintaLista(){
  const k=document.getElementById('bq-kpis'); const l=document.getElementById('bq-lista'); if(!k||!l) return;
  const base=bqBase(); k.innerHTML=bqKpisHTML(base); l.innerHTML=bqListaHTML(base);
  bqAplicaFoco();
}
function bqAplicaFoco(){
  const s=estado.bq; if(!s.foco||!s.dados) return;
  const K=s.foco; s.foco='';
  const els=[...document.querySelectorAll('#bq-lista [data-bq-item]')].filter(e=>String(e.getAttribute('data-bq-item')).startsWith(K+'#'));
  if(!els.length){ toast(`Sem bloqueio aberto em ${K} — abrindo a ficha.`,'warn'); if(typeof abreModalTicket==='function') abreModalTicket(K); return; }
  els.forEach(e=>e.classList.add('bq-foco')); try{ els[0].scrollIntoView({ block:'center' }); }catch(e){}
  setTimeout(()=>els.forEach(e=>e.classList.remove('bq-foco')),2000);
}
function renderBloqueios(){
  const cont=document.getElementById('conteudo'); const s=estado.bq; const id=idApontar();
  bqGarante();
  const d=s.dados;
  const cab=`<div class="card full bq-cab"><h2>🚧 Pendências e bloqueios <span>o que está travado e quem destrava — registrado no ticket do Jira</span></h2>
    <div class="bq-barra">
      <div class="bq-escopo" role="group" aria-label="Escopo"><button type="button" class="chip ${bqEfetivo()==='meus'?'on':''}" data-bq-escopo="meus" ${id&&id.accountId?'':'disabled'}>🙋 Meus</button><button type="button" class="chip ${bqEfetivo()==='time'?'on':''}" data-bq-escopo="time">👥 Todo o time</button></div>
      <span class="spacer"></span>
      <button type="button" class="btn" id="bq-atualiza" ${s.carregando?'disabled':''} data-tip="Ler de novo os bloqueios no Jira">↻ Atualizar</button>
      <button type="button" class="btn primario" id="bq-novo">⛔ Registrar bloqueio…</button></div>
    ${(!id||!id.accountId)?'<div class="aviso" style="margin-top:10px">Identifique-se (⏱ Apontar › Identificação) para ver os <b>seus</b> bloqueios e agir — aqui você vê todo o time, só leitura.</div>':''}</div>`;
  if(!d){
    const corpo=s.erro?`<div class="erro"><strong>Não consegui ler os bloqueios.</strong> ${esc(s.erro)} <button class="btn" id="bq-retry" style="margin-left:10px">Tentar de novo</button></div>`
      :'<div class="estado">🚧 Lendo os bloqueios no Jira…</div>';
    cont.replaceChildren(el(`<div>${cab}${corpo}</div>`)); return;
  }
  const m=d.meta||{};
  const avisos=[
    m.flag&&m.flag.campo===false?'🚩 O campo <b>Flagged</b> não foi achado no Jira — os bloqueios funcionam, mas não aparecem sinalizados nos quadros.':'',
    m.flag&&m.flag.erro?'🚩 A busca pelo flag falhou — a lista usa só a etiqueta <b>bloqueio-aberto</b>.':'',
    m.idx>0?`🏷 ${m.idx} ticket(s) sem a etiqueta — peça ao admin do Jira para pôr <i>Labels</i> na tela do projeto (eles entram pela lista de reserva do painel).`:'',
    m.truncado&&m.truncado.itens?'⚠ Lista cortada no teto de tickets — pode haver bloqueios a mais.':'',
    m.truncado&&m.truncado.comentarios?'⚠ Não consegui ler os comentários de alguns tickets — a lista pode estar incompleta.':'',
    s.erro?`⚠ A última leitura falhou (${esc(s.erro)}) — mostrando o que já estava carregado.`:'' ].filter(Boolean);
  const projs=[...new Set((d.itens||[]).map(i=>i.p).filter(Boolean))].sort();
  const f=s.fil;
  const filtros=`<div class="card full bq-filtros"><div class="bq-fl">
    <div class="campo"><label for="bq-papel">Meu papel</label><select id="bq-papel"><option value="">todos</option><option value="destravar" ${f.papel==='destravar'?'selected':''}>eu destravo</option><option value="resp" ${f.papel==='resp'?'selected':''}>sou o responsável</option><option value="abri" ${f.papel==='abri'?'selected':''}>eu registrei</option></select></div>
    <div class="campo"><label for="bq-nivel">Nível</label><select id="bq-nivel"><option value="">todos</option>${Object.keys(BQ_NIV).map(n=>`<option value="${n}" ${f.nivel===n?'selected':''}>${BQ_NIV[n].ic} ${BQ_NIV[n].rot}</option>`).join('')}</select></div>
    <div class="campo"><label for="bq-proj">Projeto</label><select id="bq-proj"><option value="">todos</option>${projs.map(p=>`<option value="${escA(p)}" ${f.proj===p?'selected':''}>${esc(p)}</option>`).join('')}</select></div>
    <div class="campo"><label for="bq-q">Buscar</label><input id="bq-q" type="text" value="${escA(f.q)}" placeholder="chave, resumo, pessoa…" autocomplete="off"></div>
    <label class="bq-venc-l"><input type="checkbox" id="bq-venc" ${f.venc?'checked':''}> só vencidos</label></div></div>`;
  const resolv=`<details class="card full bq-resolv" id="bq-resolv" ${s.resolvAberto?'open':''}><summary>✅ Resolvidos nos últimos 30 dias</summary><div id="bq-resolv-c">${bqResolvHTML()}</div></details>`;
  cont.replaceChildren(el(`<div class="bq-root">${cab}
    ${avisos.map(a=>`<div class="aviso">${a}</div>`).join('')}
    <div id="bq-kpis"></div>${filtros}<div id="bq-lista" class="bq-lista"></div>${resolv}</div>`));
  bqPintaLista();
  if(s.resolvAberto&&!s.resolv&&!s.resolvCarregando) bqCarregaResolvidos(false);
  estadoParaURL();
}

// ---------------------------------------------------------------- modal único (registrar · atualizar · responder · desbloquear · reabrir)
function bqCatalogo(pk){ const c=(typeof _projetosCache!=='undefined'&&_projetosCache)||[]; return c.find(x=>x&&x.key===pk)||null; }
function bqInfoDe(k){
  const it=bqItem(k)||estado.bq.fichaItem[k]||((typeof srItem==='function')?srItem(k):null)||((typeof gxTicketInfo==='function')?gxTicketInfo(k):null)||{ k };
  return it;
}
function bqEhAms(S){   // true/false, ou null enquanto o catálogo de projetos não chegou
  const it=bqItem(S.k); let cat=(it&&it.cat)||(S.info&&(S.info.cat||S.info.categoria))||'';
  if(!cat){ const p=bqCatalogo(S.k.split('-')[0]); if(p) cat=p.categoria||''; else if(!(typeof _projetosCache!=='undefined'&&_projetosCache)) return null; }
  const sr=estado.sr&&estado.sr.dados&&estado.sr.dados.meta; if(!cat&&sr&&sr.proj===S.k.split('-')[0]) cat=sr.categoria||'';
  return /ams/i.test(cat);
}
const bqQuemKey=(q)=>!q?'':(q.tipo==='cliente'?'c:'+bqNorm(q.nome).trim():'t:'+(q.pessoas||[]).map(p=>p.a||p).sort().join(','));
function bqQuemForm(S){
  if(S.quemTipo==='cliente'){ const n=String(S.cliente||'').trim(); return n?{ tipo:'cliente', nome:n }:null; }
  return S.pessoas.length?{ tipo:'time', pessoas:S.pessoas.slice() }:null;
}
function bqQuemTexto(q){ return !q?'':(q.tipo==='cliente'?`cliente: ${q.nome}`:(q.pessoas||[]).map(a=>bqNomeDe(a)).join(', ')); }
function bqNomeDe(a){ const S=_bq; return (S&&S.nomes&&S.nomes[a])||nomePessoaDe(a); }
function bqSugPrazo(n,hoje){ return n==='crit'?bqDiaUtilMais(hoje,1):(n==='imp'?bqDiaUtilMais(hoje,3):''); }
function bqPessoasDo(proj){
  const m={}; const d=estado.bq.dados;
  ((d&&d.itens)||[]).filter(i=>i.p===proj).forEach(i=>{ if(i.respId&&i.resp) m[i.respId]=i.resp; });
  const sr=estado.sr&&estado.sr.dados; if(sr&&sr.meta&&sr.meta.proj===proj) (sr.itens||[]).forEach(t=>{ if(t.respId&&t.resp) m[t.respId]=t.resp; });
  const proj_=Object.keys(m); const outras={};
  Object.entries(pessoasUnidas()).forEach(([a,p])=>{ if(!m[a]&&p&&p.nome) outras[a]=p.nome; });
  return { todas:Object.assign({},outras,m), proj:proj_.sort((a,b)=>m[a].localeCompare(m[b],'pt')), outras:Object.keys(outras).sort((a,b)=>outras[a].localeCompare(outras[b],'pt')) };
}
// espelho SÓ de exibição do formato v1 (quem monta o comentário de verdade é o servidor)
function bqPreviaLinhas(S){
  const modo=BQ_ACAO[S.modo]; const idl='#'+S.id; const n=BQ_NIV[S.nivel||(S.b&&S.b.nivel)]; const pn=n?`${n.ic} ${n.rot}`:'…';
  const L=[];
  if(modo==='resolver') L.push(`✅ Desbloqueado · ${idl}`);
  else if(modo==='atualizar') L.push(`📝 Bloqueio atualizado · ${pn} · ${idl}`);
  else if(modo==='reabrir') L.push(`🔁 Bloqueio reaberto · ${pn} · ${idl}`);
  else L.push(`⛔ Bloqueio · ${pn} · ${idl}`);
  if(S.modo!=='nota'&&modo!=='resolver'){
    const q=bqQuemForm(S); const mudouQ=modo==='abrir'||bqQuemKey(q)!==S.quem0;
    if(q&&mudouQ){ const rot=(S.nivel||(S.b&&S.b.nivel))==='cien'?'Para ciência de':'Quem destrava'; L.push(`${rot}: ${q.tipo==='cliente'?'cliente: '+q.nome:q.pessoas.map(a=>'@'+bqNomeDe(a)).join(' ')}`); }
    if(S.prazo&&(modo==='abrir'||S.prazo!==S.prazo0)) L.push(`Prazo: ${bqDmA(S.prazo)}`);
  }
  const t=String(S.texto||'').trim(); if(t){ L.push(''); L.push(t); }
  return L;
}
function bqPintaPrevia(){ const S=_bq; const p=document.getElementById('bq-previa'); if(!S||!p) return; p.textContent=bqPreviaLinhas(S).join('\n'); }
function bqPintaCab(){
  const S=_bq; const c=document.getElementById('bq-cab'); if(!S||!c) return;
  const it=S.info||bqInfoDe(S.k);
  c.innerHTML=`<b>${esc(S.k)}</b> — ${esc(it.resumo||'…')}<div class="muted small">${esc([it.status,it.resp?`responsável: ${it.resp}`:''].filter(Boolean).join(' · '))}</div>`;
}
function bqPintaInterno(){
  const S=_bq; const w=document.getElementById('bq-int-w'); if(!S||!w) return;
  const ams=bqEhAms(S); const marcado=(document.getElementById('bq-interno')||{}).checked;
  w.innerHTML=ams?`<label class="sr-at-int"><input type="checkbox" id="bq-interno" ${marcado===false?'':'checked'}> 🔒 nota interna <span class="muted small">— projeto AMS: o cliente não vê o comentário</span></label>`:'';
}
function bqPintaQuem(){
  const S=_bq; const w=document.getElementById('bq-quem-w'); if(!S||!w) return;
  const P=S.pessoasInfo; const cien=S.nivel==='cien';
  const nomeP=(a)=>S.nomes[a]||P.todas[a]||nomePessoaDe(a);
  const chips=S.pessoas.map(a=>`<span class="chip bq-chip">👤 ${esc(nomeP(a))} <button type="button" class="bq-x" data-bq-pessoa-rm="${escA(a)}" aria-label="Tirar ${escA(nomeP(a))}">✕</button></span>`).join('');
  const op=(a)=>`<option value="${escA(a)}">${esc(P.todas[a]||nomeP(a))}</option>`;
  const livres=(l)=>l.filter(a=>!S.pessoas.includes(a));
  const eu=bqEu(); const euOpt=(eu&&!S.pessoas.includes(eu))?`<option value="${escA(eu)}">Eu</option>`:'';
  w.innerHTML=`<div class="bq-quemtipo" role="radiogroup" aria-label="Tipo de quem destrava">
      <label><input type="radio" name="bq-quemtipo" value="time" ${S.quemTipo==='time'?'checked':''}> 👤 Pessoa do time</label>
      <label><input type="radio" name="bq-quemtipo" value="cliente" ${S.quemTipo==='cliente'?'checked':''}> 🏢 Cliente / terceiro</label></div>
    ${S.quemTipo==='time'
      ?`<div class="bq-chips" id="bq-pessoas">${chips||'<span class="muted small">ninguém escolhido ainda</span>'}</div>
        <select id="bq-pessoa-add" aria-label="Adicionar pessoa" ${S.pessoas.length>=5?'disabled':''}><option value="">＋ adicionar pessoa${S.pessoas.length>=5?' (máx. 5)':''}…</option>${euOpt}
          ${livres(P.proj).length?`<optgroup label="Do projeto">${livres(P.proj).map(op).join('')}</optgroup>`:''}
          ${livres(P.outras).length?`<optgroup label="Outras pessoas">${livres(P.outras).map(op).join('')}</optgroup>`:''}</select>`
      :`<input id="bq-cliente" type="text" maxlength="80" value="${escA(S.cliente)}" placeholder="Nome do cliente ou do terceiro" autocomplete="off">`}
    <div class="muted small">${cien?'Opcional em ciência.':'Obrigatório: avisamos quem destrava (Inbox, Teams e notificação).'}</div>`;
}
function bqPintaPrazoDica(){ const S=_bq; const e=document.getElementById('bq-prazo'); if(!S||!e) return; if(e.value!==S.prazo) e.value=S.prazo||''; }
function bqModalHTML(S){
  const M=BQ_MODOS[S.modo]; const campos=S.modo==='abrir'||S.modo==='atualizar'||S.modo==='reabrir';
  const rotTexto={ abrir:'O que está travado e o que é preciso', atualizar:'Nota (opcional se algo acima mudou)', nota:'Nota', resolver:'Como foi resolvido', reabrir:'Por que reabriu' }[S.modo];
  const niveis=Object.keys(BQ_NIV).map(n=>`<label class="bq-nv bq-${n}"><input type="radio" name="bq-nivel" value="${n}" ${S.nivel===n?'checked':''}><span class="bq-nv-t"><b>${BQ_NIV[n].ic} ${BQ_NIV[n].rot}</b><span class="muted small">${esc(BQ_NIV[n].desc)}</span></span></label>`).join('');
  const resumo=(!campos&&S.b)?`<div class="bq-resumo muted small">${(BQ_NIV[S.b.nivel]||{}).ic||''} ${esc((BQ_NIV[S.b.nivel]||{}).rot||'')} · quem destrava: ${esc(bqQuemTexto(S.b.quem&&S.b.quem.tipo==='time'?{ tipo:'time', pessoas:S.b.quem.pessoas.map(p=>p.a) }:S.b.quem)||'—')}${S.b.prazo?` · prazo ${esc(bqDmA(S.b.prazo))}`:''}${S.b.texto?`<br>${esc(S.b.texto.slice(0,240))}`:''}</div>`:'';
  return `<h2 id="bq-root">${M.ic} ${esc(M.tit)} · ${esc(S.k)}</h2>
    <div class="sr-at-cab" id="bq-cab"></div>${resumo}
    ${campos?`<div class="campo"><label>Nível</label><div class="bq-niveis" role="radiogroup" aria-label="Nível do bloqueio">${niveis}</div></div>
      <div class="campo"><label>${S.nivel==='cien'?'Para ciência de':'Quem destrava'}</label><div id="bq-quem-w"></div></div>
      <div class="campo"><label for="bq-prazo">Prazo para destravar${S.nivel==='cien'?' <span class="muted small">(opcional)</span>':''}</label>
        <input type="date" id="bq-prazo" value="${escA(S.prazo)}" ${S.modo==='abrir'?`min="${escA(S.hoje)}"`:''}>
        <div class="sr-ac-chips"><button type="button" class="chip" data-bq-prazo="hoje">hoje</button><button type="button" class="chip" data-bq-prazo="amanha">amanhã</button><button type="button" class="chip" data-bq-prazo="u3">+3 dias úteis</button><button type="button" class="chip" data-bq-prazo="sexta">sexta</button><button type="button" class="chip" data-bq-prazo="nenhum">sem prazo</button></div></div>`:''}
    <div class="campo"><label for="bq-texto">${esc(rotTexto)} <span class="muted small" id="bq-cont"></span></label><textarea id="bq-texto" class="alx-coment" rows="5" maxlength="1500">${esc(S.texto)}</textarea></div>
    <div id="bq-int-w"></div>
    <div class="campo"><label>Prévia — como vai aparecer no ticket do Jira</label><pre class="bq-previa" id="bq-previa"></pre></div>
    <div class="alx-fb" id="bq-fb" hidden></div>
    <div class="alx-modal-acoes"><button class="btn primario" id="bq-confirma">${esc(M.bt)}</button><button class="btn" id="gx-fechar">Cancelar</button></div>`;
}
function bqAbre(k, o){
  o=o||{}; k=String(k||'').toUpperCase().trim(); if(!k) return;
  const modo=BQ_MODOS[o.modo]?o.modo:'abrir';
  const id=idApontar();
  if(!id){ abreIdentidade(BQ_MODOS[modo].motivo,{ depois:()=>bqAbre(k,o) }); return; }
  const hoje=hojeSP(); const it=bqItem(k);
  let b=null;
  if(modo!=='abrir'){
    const key=`${k}#${o.id||''}`;
    const rv=((estado.bq.resolv&&estado.bq.resolv.itens)||[]).find(x=>x.k===k);   // a lista ✅ Resolvidos também alimenta o 🔁 Reabrir
    b=(it&&(it.bloqueios||[]).find(x=>x.id===o.id))||(rv&&(rv.bloqueios||[]).find(x=>x.id===o.id))||estado.bq.ficha[key]||null;
    if(!b&&!o.id&&it) b=bqAbertosDe(it)[0]||null;
    if(!b){ toast(`Não achei esse bloqueio em ${k} — use o ↻ Atualizar da tela 🚧.`,'warn'); return; }
  }
  const S={ k, modo, id:modo==='abrir'?(o.novoId||bqNovoId()):b.id, b, hoje, info:null, nivel:b?b.nivel:'', prazo:b?(b.prazo||''):'', prazo0:b?(b.prazo||''):'', prazoMan:false,
    quemTipo:(b&&b.quem&&b.quem.tipo==='cliente')?'cliente':'time', pessoas:(b&&b.quem&&b.quem.tipo==='time')?b.quem.pessoas.map(p=>p.a):[], cliente:(b&&b.quem&&b.quem.tipo==='cliente')?(b.quem.nome||''):'',
    texto:String(o.texto||o.pre||''), nomes:{}, pub:false, feito:false, pessoasInfo:null };
  if(b&&b.quem&&b.quem.tipo==='time') b.quem.pessoas.forEach(p=>{ S.nomes[p.a]=p.nome||nomePessoaDe(p.a); });
  S.quem0=bqQuemKey(b&&b.quem?(b.quem.tipo==='time'?{ tipo:'time', pessoas:b.quem.pessoas.map(p=>p.a) }:b.quem):null);
  if(modo==='reabrir'&&b) S.nivel=b.nivel;
  S.pessoasInfo=bqPessoasDo(k.split('-')[0]);
  _bq=S;
  abreModal(bqModalHTML(S));
  bqPintaCab(); bqPintaQuem(); bqPintaInterno(); bqPintaPrevia(); bqContaTexto();
  const foco=document.getElementById(modo==='abrir'?null:'bq-texto')||document.querySelector('#modal-body input[name="bq-nivel"]'); if(foco) foco.focus();
  // dados que chegam depois (resumo/categoria/pessoas) só atualizam pedaços — nunca o modal inteiro
  if(!it&&!S.info){ fetch(`/api/vencimentos?detalhe=${encodeURIComponent(k)}`).then(r=>r.json()).then(j=>{ if(_bq!==S||!j||j.erro) return; S.info=j; estado.bq.fichaItem[k]={ k, resumo:j.resumo||'', p:j.p||'', pNome:j.pNome||'', status:j.status||'', resp:j.resp||'' }; bqPintaCab(); bqPintaInterno(); }).catch(()=>{}); }
  if(typeof garanteProjetos==='function'&&bqEhAms(S)===null) garanteProjetos().then(()=>{ if(_bq===S) bqPintaInterno(); }).catch(()=>{});
  if(!Object.keys(pessoasUnidas()).length&&typeof usuariosP==='function') usuariosP().then(j=>{ if(j&&j.pessoas&&!Object.keys(estado.usuarios||{}).length) estado.usuarios=j.pessoas; if(_bq===S){ S.pessoasInfo=bqPessoasDo(k.split('-')[0]); bqPintaQuem(); } }).catch(()=>{});
}
function bqAoFecharModal(){ _bq=null; }
const bqModalAberto=()=>!!(_bq&&document.getElementById('bq-root')&&!document.getElementById('modal').hidden);
function bqContaTexto(){ const S=_bq; const c=document.getElementById('bq-cont'); if(!S||!c) return; const n=String(S.texto||'').trim().length; const min={ abrir:10, resolver:3, reabrir:3 }[S.modo]; c.textContent=`${n}/1500${min?` · mínimo ${min}`:''}`; }
function bqValidaForm(S){
  const M=S.modo; const modo=BQ_ACAO[M]; const texto=String(S.texto||'').replace(/\r\n?/g,'\n').trim(); const q=bqQuemForm(S);
  const campos=M==='abrir'||M==='atualizar'||M==='reabrir';
  if(texto.length>1500) return { erro:'Texto longo demais (máx. 1500 caracteres).' };
  if(campos&&!S.nivel) return { erro:'Escolha o nível do bloqueio.' };
  if(M==='abrir'){
    if(texto.length<10) return { erro:'Descreva o bloqueio (mínimo de 10 caracteres).' };
    if(S.nivel!=='cien'){ if(!q) return { erro:'Diga quem destrava (uma pessoa do time ou o cliente).' }; if(!S.prazo) return { erro:'Informe o prazo para destravar.' }; }
  }
  if(M==='resolver'&&texto.length<3) return { erro:'Diga como foi resolvido (mínimo de 3 caracteres).' };
  if(M==='reabrir'&&texto.length<3) return { erro:'Diga o motivo da reabertura (mínimo de 3 caracteres).' };
  if(M==='nota'&&!texto) return { erro:'Escreva a nota.' };
  if(campos&&S.prazo&&(M==='abrir'||S.prazo!==S.prazo0)&&S.prazo<S.hoje) return { erro:'O prazo não pode estar no passado.' };
  if(campos&&S.quemTipo==='cliente'&&String(S.cliente||'').trim().length>80) return { erro:'Nome do cliente: até 80 caracteres.' };
  const dados={ id:S.id, texto };
  if(campos){
    const mudouQ=M==='abrir'||bqQuemKey(q)!==S.quem0; const mudouP=M==='abrir'||S.prazo!==S.prazo0; const mudouN=M==='abrir'||M==='reabrir'||S.nivel!==(S.b&&S.b.nivel);
    if(mudouN) dados.nivel=S.nivel;
    if(q&&mudouQ) dados.quem=q;
    if(S.prazo&&mudouP) dados.prazo=S.prazo;
    if(M==='atualizar'&&!dados.nivel&&!dados.quem&&!dados.prazo&&!texto) return { erro:'Nada para atualizar: mude o nível, quem destrava, o prazo ou escreva uma nota.' };
  }
  const it=document.getElementById('bq-interno'); if(it) dados.interno=!!it.checked;
  return { acao:modo, dados };
}
function bqAplicaItem(k,item){
  const s=estado.bq; if(!s.dados||!item) return;
  const abertos=bqAbertosDe(item); const i=s.dados.itens.findIndex(x=>x.k===k);
  if(!abertos.length&&item.flag) item=Object.assign({},item,{ semRegistro:true });
  if(!abertos.length&&!item.semRegistro){ if(i>=0) s.dados.itens.splice(i,1); }
  else if(i>=0) s.dados.itens[i]=item; else s.dados.itens.unshift(item);
  const m=s.dados.meta; if(m){ m.abertos=0; m.vencidos=0; const hoje=m.hoje||hojeSP(); s.dados.itens.forEach(x=>bqAbertosDe(x).forEach(b=>{ m.abertos++; if(bqVenc(b,hoje)) m.vencidos++; })); m.total=s.dados.itens.length; }
  bqReindexa();
}
function bqToastTexto(acao,k,j){
  const base={ abrir:`Bloqueio registrado em ${k}.`, atualizar:`Bloqueio atualizado em ${k}.`, resolver:`Bloqueio de ${k} resolvido.`, reabrir:`Bloqueio reaberto em ${k}.` }[acao]||'Feito.';
  if(j.ja) return `Este bloqueio já estava registrado em ${k}.`;
  const av=[]; const p=j.passos||{};
  if(p.label&&p.label.ok===false) av.push('a etiqueta não foi gravada (o painel guarda o ticket numa lista própria)');
  if(p.flag&&p.flag.ok===false&&p.flag.motivo!=='sem-campo') av.push('o Jira não deixou sinalizar o cartão neste projeto');
  return av.length?`${base} Atenção: ${av.join('; ')}.`:base;
}
async function bqEnvia(){
  const S=_bq; if(!S||S.pub||S.feito) return;
  const diz=(msg,cls)=>{ const f=document.getElementById('bq-fb'); if(_bq===S&&f){ f.hidden=false; f.className='alx-fb ap-fb'+(cls?' '+cls:''); f.textContent=msg; } };
  const id=idApontar();
  if(!id){ abreIdentidade(BQ_MODOS[S.modo].motivo,{ depois:()=>bqAbre(S.k,{ id:S.b&&S.b.id, modo:S.modo, texto:S.texto, novoId:S.id }) }); return; }
  const v=bqValidaForm(S); if(v.erro){ diz(v.erro,'erro'); return; }
  const k=S.k; const btn=document.getElementById('bq-confirma'); S.pub=true; if(btn) ocupado(btn,true); diz('Gravando no Jira…','');
  const quemTxt=v.dados.quem?bqQuemTexto(v.dados.quem):(S.b&&S.b.quem?bqQuemTexto(S.b.quem.tipo==='time'?{ tipo:'time', pessoas:S.b.quem.pessoas.map(p=>p.a) }:S.b.quem):'');
  let j;
  try{
    const r=await fetch('/api/transicao',{ method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ bloqueio:Object.assign({ acao:v.acao }, v.dados), issue:k, email:id.email, token:id.token }) });
    j=await r.json().catch(()=>({ ok:false, erro:`Resposta inválida do servidor (${r.status}).` }));
  }catch(e){ j={ ok:false, erro:humanizaErro(e) }; }
  S.pub=false;
  const aberto=()=>_bq===S;
  if(j&&j.conflito){
    const it=j.item||j.estado; if(it&&it.k) bqAplicaItem(k,it);
    estado.bq.sujo=true; estado.bq.sujoK[k]=true;
    if(aberto()){ if(btn) ocupado(btn,false); diz(j.erro||'O bloqueio mudou enquanto você editava — confira e tente de novo.','erro'); } else toast(`${k}: ${j.erro||'o bloqueio mudou'}`,'warn');
    if(estado.vista==='bloqueios') bqPintaLista();
    return;
  }
  if(!j||!j.ok){
    const msg=(j&&j.erro)||'Não consegui gravar no Jira.';
    if(aberto()){ if(btn) ocupado(btn,false); diz(msg,'erro'); } else toast(`${BQ_MODOS[S.modo].tit} ${k}: ${msg}`,'warn');
    return;
  }
  S.feito=true;
  if(j.item) bqAplicaItem(k,j.item);
  const s=estado.bq; s.sujo=true; s.sujoK[k]=true; s.resolv=null;
  if(!j.ja){ logAcao({ acao:'bloqueio-'+v.acao, t:k, para:quemTxt||'—', motivo:String(v.dados.texto||'').slice(0,80), ok:true },false); salvaCfg(); }
  if(estado.sr) estado.sr.sujo=true;
  const t=bqToastTexto(v.acao,k,j);
  toast(t,/Atenção/.test(t)?'warn':'ok');
  if(aberto()) fechaModal();
  if(estado.vista==='bloqueios') renderBloqueios(); else if(BQ_VISTAS_SELO.includes(estado.vista)){ try{ render(); }catch(e){} }
  if(typeof renderAbas==='function'){ try{ renderAbas(); }catch(e){} }
}

// ---------------------------------------------------------------- listeners
// 1) globais (o botão/selo vivem em outras telas e em modais)
document.addEventListener('click',(e)=>{
  const t=e.target; if(!t||!t.closest) return;
  const ab=t.closest('[data-bq-abre]');
  if(ab){ e.preventDefault(); const k=ab.getAttribute('data-bq-abre'); const modo=ab.getAttribute('data-bq-modo')||'abrir';
    bqAbre(k,{ id:ab.getAttribute('data-bq-id')||'', modo, pre:ab.getAttribute('data-bq-pre')||'' }); return; }
  const vr=t.closest('[data-bq-ver]');
  if(vr){ e.preventDefault(); if(!document.getElementById('modal').hidden) fechaModal(); bqVai('time',{ foco:vr.getAttribute('data-bq-ver') }); return; }
  const vt=t.closest('[data-bq-venc-todos]'); if(vt){ bqVai('time',{ venc:true }); return; }
});
// 2) a vista
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='bloqueios') return;
  const t=e.target; if(!t||!t.closest) return; const s=estado.bq;
  const es=t.closest('[data-bq-escopo]'); if(es){ if(es.disabled) return; s.escopo=es.getAttribute('data-bq-escopo')==='time'?'time':'meus'; renderBloqueios(); return; }
  const kp=t.closest('[data-bq-kpi]');
  if(kp){ const kk=kp.getAttribute('data-bq-kpi'); const f=s.fil;
    if(kk==='crit'||kk==='imp'||kk==='cien') f.nivel=(f.nivel===kk)?'':kk;
    else if(kk==='venc') f.venc=!f.venc;
    else if(kk==='destravar') f.papel=(f.papel==='destravar')?'':'destravar';
    else return;
    renderBloqueios(); return; }
  const hi=t.closest('[data-bq-hist]'); if(hi){ const key=hi.getAttribute('data-bq-hist'); s.hist[key]=!s.hist[key]; bqPintaLista(); return; }
  const ex=t.closest('[data-bq-exp]'); if(ex){ const key=ex.getAttribute('data-bq-exp'); s.exp[key]=!s.exp[key]; ex.classList.toggle('aberto',!!s.exp[key]); return; }
  if(t.closest('[data-bq-limpa]')){ s.fil={ papel:'', proj:'', nivel:'', venc:false, q:'' }; renderBloqueios(); return; }
  if(t.closest('[data-bq-resolv-retry]')){ s.resolv=null; bqCarregaResolvidos(true); renderBloqueios(); return; }
  const b=t.closest('button'); if(!b) return;
  if(b.id==='bq-atualiza'){ if(!b.disabled){ s.erroEm=0; bqGarante(true); renderBloqueios(); if(s.resolvAberto){ s.resolv=null; bqCarregaResolvidos(true); } } }
  else if(b.id==='bq-retry'){ s.erro=''; s.erroEm=0; bqGarante(true); renderBloqueios(); }
  else if(b.id==='bq-novo'||b.id==='bq-novo2'){ navAcao('bloqueio'); }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='bloqueios') return; const t=e.target; if(!t||!t.id) return; const f=estado.bq.fil;
  if(t.id==='bq-papel') f.papel=t.value; else if(t.id==='bq-nivel') f.nivel=t.value; else if(t.id==='bq-proj') f.proj=t.value; else if(t.id==='bq-venc') f.venc=!!t.checked; else return;
  bqPintaLista(); estadoParaURL();
});
document.getElementById('conteudo').addEventListener('input',(e)=>{
  if(estado.vista!=='bloqueios'||!e.target||e.target.id!=='bq-q') return;
  estado.bq.fil.q=e.target.value; bqPintaLista();
});
document.getElementById('conteudo').addEventListener('toggle',(e)=>{
  const d=e.target; if(!d||d.id!=='bq-resolv') return; const s=estado.bq; s.resolvAberto=!!d.open;
  if(d.open&&!s.resolv&&!s.resolvCarregando){ bqCarregaResolvidos(false); const c=document.getElementById('bq-resolv-c'); if(c) c.innerHTML=bqResolvHTML(); }
},true);
// 3) o modal (só age com o modal 🚧 aberto)
document.getElementById('modal-body').addEventListener('click',(e)=>{
  if(!bqModalAberto()) return; const S=_bq; if(S.feito) return;
  const t=e.target; if(!t||!t.closest) return;
  const rm=t.closest('[data-bq-pessoa-rm]'); if(rm){ const a=rm.getAttribute('data-bq-pessoa-rm'); S.pessoas=S.pessoas.filter(x=>x!==a); bqPintaQuem(); bqPintaPrevia(); return; }
  const pz=t.closest('[data-bq-prazo]');
  if(pz){ const k=pz.getAttribute('data-bq-prazo'); const h=S.hoje;
    S.prazo=k==='hoje'?h:k==='amanha'?proxDia(h):k==='u3'?bqDiaUtilMais(h,3):k==='sexta'?bqSexta(h):''; S.prazoMan=true; bqPintaPrazoDica(); bqPintaPrevia(); return; }
  const b=t.closest('button'); if(b&&b.id==='bq-confirma'&&!b.disabled) bqEnvia();
});
document.getElementById('modal-body').addEventListener('change',(e)=>{
  if(!bqModalAberto()) return; const S=_bq; if(S.feito) return; const t=e.target; if(!t) return;
  if(t.name==='bq-nivel'){
    S.nivel=t.value;
    if(S.modo==='abrir'&&!S.prazoMan){ S.prazo=bqSugPrazo(S.nivel,S.hoje); bqPintaPrazoDica(); }
    const lq=document.querySelector('#modal-body #bq-quem-w'); if(lq&&lq.parentElement){ const l=lq.parentElement.querySelector('label'); if(l) l.textContent=S.nivel==='cien'?'Para ciência de':'Quem destrava'; }
    bqPintaQuem(); bqPintaPrevia(); return; }
  if(t.name==='bq-quemtipo'){ S.quemTipo=t.value==='cliente'?'cliente':'time'; bqPintaQuem(); bqPintaPrevia(); return; }
  if(t.id==='bq-pessoa-add'){ const a=t.value; if(a&&!S.pessoas.includes(a)&&S.pessoas.length<5){ S.pessoas.push(a); S.nomes[a]=S.pessoasInfo.todas[a]||nomePessoaDe(a); } bqPintaQuem(); bqPintaPrevia(); return; }
  if(t.id==='bq-prazo'){ S.prazo=t.value; S.prazoMan=true; bqPintaPrevia(); return; }
});
document.getElementById('modal-body').addEventListener('input',(e)=>{
  if(!bqModalAberto()) return; const S=_bq; if(S.feito) return; const t=e.target; if(!t||!t.id) return;
  if(t.id==='bq-texto'){ S.texto=t.value; bqContaTexto(); bqPintaPrevia(); }
  else if(t.id==='bq-cliente'){ S.cliente=t.value; bqPintaPrevia(); }
  else if(t.id==='bq-prazo'){ S.prazo=t.value; S.prazoMan=true; bqPintaPrevia(); }
});
document.getElementById('modal-body').addEventListener('keydown',(e)=>{
  if(!bqModalAberto()||!e.target) return;
  if(e.target.id==='bq-texto'&&e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); bqEnvia(); }   // Enter sozinho só quebra a linha no textarea
});
