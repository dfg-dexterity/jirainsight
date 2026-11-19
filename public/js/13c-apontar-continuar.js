// =====================================================================================================================
// 13c — 🕑 "Continuar de onde parei" no topo do ⏱ Apontar + chips "até a meta" / "desde as HH:MM" (R003, 2026-11-18,
// pedido registrado no roadmap em 2026-10-20: o caso mais comum — o mesmo ticket de ontem ou da manhã — exigia rolar até o
// fim da tela e expandir os 🕑 recentes; e fechar o dia certinho exigia conta de cabeça, embora a meta e o total do dia já
// estivessem calculados).
//
// Duas peças, sobre a MESMA janela das minhas horas que o 13 já mantém (`estado.apontar.meusLogs`), sem endpoint novo:
//  1. 🕑 a FAIXA do topo: o último ticket em que a pessoa apontou, mais os dois anteriores; um clique abre a linha de
//     apontamento completa ali em cima (`#apc-linha`), já com o tempo sugerido, mesmo que o ticket não esteja na lista;
//  2. ➕ dois CHIPS dinâmicos em cada linha: "até a meta (1h45)" = o que falta para a meta do dia escolhido, e "desde as
//     14:30 (1h10)" = do fim do último lançamento de hoje até agora. Chip só PREENCHE o tempo (nada é gravado até Apontar).
// Regras: 09:00 é a hora padrão de quem aponta sem hora — logo é hora DESCONHECIDA; a âncora do "desde" é o maior entre o
// fim real do último worklog com hora e a marca deste navegador (`APC_LS`); a `hora` só vai no POST com o chip intacto e o
// dia de hoje (`fazApontamento`, 13); nada aqui dispara leitura no render; leitores não criam objetos na `cfg`.
// Ganchos no 13: `registraExtraDia` → `apcMarcaFim`; `atualizaPainelHoras` → `apcAtualizaTudo`; `renderApontar` →
// `apcChipsHTML`/`apcFaixaHTML`/`apcDepoisRender`.
// =====================================================================================================================

const APC_N=3;                       // tickets na faixa (o último + os dois anteriores)
const APC_DESDE_MIN=5*60;            // "desde" com menos de 5 min não vale o chip
const APC_DESDE_MAX=10*3600;         // acima de 10 h a âncora é velha demais para ser verdade
const APC_LS='jirainsight_ap_ultfim_v1';   // {d,a,min,k}: fim do último lançamento feito NESTE navegador, hoje

function apcHHMM(min){ const m=Math.max(0,Math.floor(min)); return String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function apcQuando(d, hoje){
  if(d===hoje) return 'hoje';
  if(d===voltaDias(hoje,1)) return 'ontem';
  return `${_diaSemana(d)} ${fmtBR(d)}`;
}
// Meta do dia da pessoa (0 = dia sem meta: fim de semana, feriado, ausência ou fora da vigência).
function apcMetaDia(acc, d){
  if(!acc||!d||!ehUtil(d)||ehFeriado(d)||ehAusencia(acc,d)) return 0;
  return metaSegDe(acc)||8*3600;
}
// {meta, feito, falta} do dia; null sem identidade, sem meta ou sem base do dia (mesma régua da Início: janela ou período do topo).
function apcMetaInfo(d){
  const id=idApontar(); if(!(id&&id.accountId)||!d) return null;
  const meta=apcMetaDia(id.accountId, d); if(!meta) return null;
  if(!(apMeusLogsCobre(d)||apTempoCobre(d))) return null;
  const feito=minhasHorasPorDia()[d]||0;
  const falta=Math.floor((meta-feito)/60)*60;
  if(falta<60) return null;
  return {meta, feito, falta};
}
function apcFaltaMeta(d){ const i=apcMetaInfo(d); return i?i.falta:null; }
// Marca deste navegador: fim do último lançamento de hoje. Lida/gravada com try/catch; só vale hoje e para a mesma pessoa.
function apcFimLS(){
  const id=idApontar(); if(!(id&&id.accountId)) return null;
  try{ const o=JSON.parse(localStorage.getItem(APC_LS));
    if(o&&o.d===hojeSP()&&o.a===id.accountId&&typeof o.min==='number') return o; }catch(e){}
  return null;
}
function apcMarcaFim(k){
  const id=idApontar(); if(!(id&&id.accountId)) return;
  const agora=apAgoraMinSP(); if(typeof agora!=='number') return;
  const ant=apcFimLS();
  try{ localStorage.setItem(APC_LS, JSON.stringify({d:hojeSP(), a:id.accountId, min:Math.max(ant?ant.min:0, agora), k:k||''})); }catch(e){}
}
// Maior fim conhecido de hoje: {min, fonte:'worklog'|'sessao'} ou null. 09:00 é hora padrão (desconhecida): não conta.
function apcUltimoFim(){
  const id=idApontar(); if(!(id&&id.accountId)) return null;
  const hoje=hojeSP(); let melhor=null;
  const vale=(min,fonte)=>{ if(typeof min==='number'&&(!melhor||min>melhor.min)) melhor={min, fonte}; };
  minhasLogsEntre(hoje,hoje).forEach(w=>{ const m=mtsMinSP(w.dt); if(m!=null&&m!==540) vale(m+Math.round((Number(w.s)||0)/60),'worklog'); });
  ((estado.apontar.extraLogs)||[]).forEach(x=>{ if(x.d===hoje&&typeof x.m==='number') vale(x.m+Math.round((Number(x.s)||0)/60),'worklog'); });
  const ls=apcFimLS(); if(ls) vale(ls.min,'sessao');
  return melhor;
}
// "Desde o último": {seg, hora, fonte} só para hoje e entre 5 min e 10 h; senão null.
function apcDesde(d){
  if(d!==hojeSP()) return null;
  const fim=apcUltimoFim(); const agora=apAgoraMinSP();
  if(!fim||typeof agora!=='number') return null;
  const seg=(agora-fim.min)*60;
  if(seg<APC_DESDE_MIN||seg>APC_DESDE_MAX) return null;
  return {seg, hora:apcHHMM(fim.min), fonte:fim.fonte};
}
// Os chips dinâmicos de UMA linha para o dia `d` (0, 1 ou 2 botões). `memo` evita recalcular o mesmo dia na mesma passada.
function apcChipsHTML(d, memo){
  if(memo&&memo[d]!==undefined) return memo[d];
  let html='';
  const id=idApontar();
  if(id&&id.accountId&&d){
    const bt=[];
    const mi=apcMetaInfo(d);
    if(mi) bt.push(`<button class="chip apc-chip" data-ap-chip="${escA(fmtH(mi.falta))}" data-apc="meta"
      data-tip="${escA(`Meta de ${fmtH(mi.meta)} em ${fmtBR(d)} menos as ${fmtH(mi.feito)} que você já apontou. Só preenche o tempo — você confirma em Apontar.`)}">até a meta (${esc(fmtH(mi.falta))})</button>`);
    const ds=apcDesde(d);
    if(ds){
      const de=ds.fonte==='sessao'?`${ds.hora} (hora em que você fez o último lançamento de hoje neste navegador)`:`${ds.hora} (fim do seu último lançamento de hoje)`;
      bt.push(`<button class="chip apc-chip" data-ap-chip="${escA(fmtH(ds.seg))}" data-apc="desde" data-apc-hora="${escA(ds.hora)}"
        data-tip="${escA(`Das ${de} até agora. Só preenche o tempo; ao apontar, o worklog nasce às ${ds.hora}.`)}">desde as ${esc(ds.hora)} (${esc(fmtH(ds.seg))})</button>`);
    }
    html=bt.length===1?bt[0].replace('class="chip apc-chip"','class="chip apc-chip apc-so"'):bt.join('');
  }
  if(memo) memo[d]=html;
  return html;
}
// Meus tickets mais recentes (janela + o que esta sessão apontou), do mais novo ao mais antigo: [{k,p,resumo,ult,ultSeg}].
function apcRecentes(n){
  const id=idApontar(); if(!(id&&id.accountId)) return [];
  const hoje=hojeSP(); const de=voltaDias(hoje,13); const m=apMeusLogs();
  const ls=apcFimLS();
  const por={};
  const add=(k,p,resumo,d,s,chave)=>{
    if(!k||d<de||d>hoje) return;
    const r=por[k]=por[k]||{k, p:p||String(k).split('-')[0], resumo:'', ult:'', ultSeg:0, _kb:'', _ord:''};
    if(!r.resumo&&resumo) r.resumo=resumo;
    if(chave>r._kb){ r._kb=chave; r.ult=d; r.ultSeg=Number(s)||0; }
    if(chave>r._ord) r._ord=chave;
  };
  (m?m.logs:[]).forEach(w=>add(w.k,w.p,w.resumo,w.d,w.s,w.d+'|0|'+(w.dt||'')));
  ((estado.apontar.extraLogs)||[]).forEach((x,i)=>add(x.k,x.p,'',x.d,x.s,x.d+'|1|'+String(i).padStart(6,'0')));
  if(ls&&ls.k&&por[ls.k]){ const c=ls.d+'|2|'; if(c>por[ls.k]._ord) por[ls.k]._ord=c; }
  return Object.values(por).sort((a,b)=>b._ord.localeCompare(a._ord)||b._kb.localeCompare(a._kb)).slice(0,n)
    .map(r=>({k:r.k,p:r.p,resumo:r.resumo,ult:r.ult,ultSeg:r.ultSeg}));
}
function apcResumoDe(r){
  if(r.resumo) return r.resumo;
  const ap=estado.apontar; const dd=ap.porData&&ap.porData[chaveVenc()];
  const t=dd&&dd.tickets&&dd.tickets.find(x=>x.k===r.k); if(t&&t.resumo) return t.resumo;
  const rd=ap.recDet&&ap.recDet[r.k]; return (rd&&rd.resumo)||'';
}
// A faixa do topo. '' sem identidade; "carregando…" enquanto a janela é lida; '' sem nada a mostrar.
function apcFaixaHTML(){
  const id=idApontar(); if(!(id&&id.accountId)) return '';
  const ap=estado.apontar; const hoje=hojeSP();
  const recs=apcRecentes(APC_N);
  const tit='<span class="apc-tit">🕑 Continuar de onde parei</span>';
  if(!recs.length){
    if(ap.recCarr||ap.meusLogsP) return `<div class="apc-faixa apc-carr" id="apc-faixa">${tit}<span class="muted small">carregando seus últimos apontamentos…</span></div>`;
    return '';
  }
  const u=recs[0]; const qd=apcQuando(u.ult,hoje); const res=apcResumoDe(u);
  const mesmo=u.ultSeg>=60?`<button class="chip" data-apc-ir="${escA(u.k)}" data-apc-tempo="${escA(fmtH(u.ultSeg))}" data-apc-mesmo
      data-tip="${escA(`Abre ${u.k} com o mesmo tempo do seu último lançamento (${fmtH(u.ultSeg)}, ${qd}).`)}">${esc(`mesmo de ${qd} (${fmtH(u.ultSeg)})`)}</button>`:'';
  const um=(u.ultSeg===3600&&mesmo)?'':`<button class="chip" data-apc-ir="${escA(u.k)}" data-apc-tempo="1h" data-tip="${escA(`Abre ${u.k} com 1h já preenchida.`)}">1h</button>`;
  const outros=recs.slice(1).map(r=>{ const t=fmtH(r.ultSeg||3600); const rs=apcResumoDe(r);
    return `<button class="chip" data-apc-ir="${escA(r.k)}" data-apc-tempo="${escA(t)}" data-tip="${escA(`${r.k}${rs?' — '+rs:''}. Último: ${t} ${apcQuando(r.ult,hoje)}. Abre a linha já com ${t}.`)}">${esc(r.k)} · ${esc(t)}</button>`; }).join('');
  return `<div class="apc-faixa" id="apc-faixa" role="group" aria-label="Continuar de onde parei">${tit}
    <span class="apc-ult">Último:
      <button class="apc-k" data-apc-ir="${escA(u.k)}" data-tip="Abrir a linha de apontamento deste ticket aqui em cima">${esc(u.k)}</button>
      <span class="apc-res">${esc(res)}</span>
      <span class="apc-qd">${esc(fmtH(u.ultSeg))} ${esc(qd)}</span></span>
    <span class="apc-acoes">${um}${mesmo}</span>
    ${outros?`<span class="apc-outros"><span class="muted small">Também:</span>${outros}</span>`:''}
  </div>`;
}

// ---- Tela ----
function apcAtualizaLinha(row, memo){
  const ch=row&&row.querySelector('.ap-log .ap-chips'); if(!ch) return;
  const dEl=row.querySelector('.ap-data'); const dia=(dEl&&dEl.value)||hojeSP();
  ch.querySelectorAll('[data-apc]').forEach(b=>b.remove());
  const h=apcChipsHTML(dia, memo); if(h) ch.insertAdjacentHTML('beforeend', h);
}
function apcAtualizaTudo(){
  if(estado.vista!=='apontar') return;
  const memo={};
  document.querySelectorAll('#conteudo .ap-row').forEach(r=>{ if(r.querySelector('.ap-log')) apcAtualizaLinha(r, memo); });
  const slot=document.getElementById('apc-slot'); if(slot) slot.innerHTML=apcFaixaHTML();
  apcGuardaCampos();
}
// Guarda TODOS os campos da linha aberta no topo (tempo, dia, comentário e a hora do chip "desde"): o renderApontar
// recria a linha do zero, e sem isso só o tempo voltava — o próximo apontamento perdia o comentário e o dia escolhido
// e, sem a marca do chip, gravava às 09:00 em vez da hora real (achado da revisão automática do PR #232).
function apcGuardaCampos(){
  const ab=estado.apontar.apcAberto; const row=document.querySelector('#apc-linha .ap-row');
  if(!ab||!row) return;
  const t=row.querySelector('.ap-tempo'), d=row.querySelector('.ap-data'), c=row.querySelector('.ap-coment');
  if(!t) return;   /* ficha ainda carregando: nada para guardar */
  ab.tempo=t.value; ab.dia=d?d.value:''; ab.coment=c?c.value:'';
  ab.apcHora=t.dataset.apcHora||''; ab.apcVal=t.dataset.apcVal||'';
}
function apcAbre(k, tempo){
  const id=idApontar(); if(!(id&&id.accountId)||!k) return;
  estado.apontar.apcAberto={k, tempo:tempo||'', foco:true, a:id.accountId};
  renderApontar();
}
function apcFecha(){ estado.apontar.apcAberto=null; renderApontar(); }
// No fim do renderApontar: preenche o tempo sugerido e leva o foco (uma vez) para a linha aberta.
function apcDepoisRender(){
  const ab=estado.apontar.apcAberto; if(!ab) return;
  const campo=document.querySelector('#apc-linha .ap-tempo'); if(!campo) return;   // ficha ainda carregando: o foco espera
  const row0=campo.closest('.ap-row');
  if(!campo.value&&ab.tempo) campo.value=ab.tempo;
  const dEl=row0.querySelector('.ap-data'), cEl=row0.querySelector('.ap-coment');
  if(dEl&&ab.dia&&dEl.value!==ab.dia&&(!dEl.max||ab.dia<=dEl.max)){ dEl.value=ab.dia; apcAtualizaLinha(row0); }
  if(cEl&&!cEl.value&&ab.coment) cEl.value=ab.coment;
  if(ab.apcHora&&ab.apcVal&&campo.value===ab.apcVal){ campo.dataset.apcHora=ab.apcHora; campo.dataset.apcVal=ab.apcVal; }
  if(ab.foco){
    ab.foco=false;
    const row=campo.closest('.ap-row');
    try{ row.scrollIntoView({block:'nearest'}); }catch(e){}
    let toque=false; try{ toque=window.matchMedia('(pointer:coarse)').matches; }catch(e){}
    const alvo=toque?row.querySelector('[data-ap-key]'):campo;
    if(alvo){ alvo.focus(); if(!toque&&alvo.select) alvo.select(); }
  }
}

// ---- Listeners (depois dos do 13) ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  if(estado.vista!=='apontar') return;
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-apc-ir')){ escondeTip(); apcAbre(t.getAttribute('data-apc-ir'), t.getAttribute('data-apc-tempo')); return; }
  if(t.hasAttribute('data-apc-fecha')){ escondeTip(); apcFecha(); return; }
  if(!t.hasAttribute('data-ap-chip')) return;
  const row=t.closest('.ap-row'); const inp=row&&row.querySelector('.ap-tempo'); if(!inp) return;
  if(!t.hasAttribute('data-apc')){ delete inp.dataset.apcHora; delete inp.dataset.apcVal; return; }
  const dEl=row.querySelector('.ap-data'); const dia=(dEl&&dEl.value)||hojeSP();
  const tipo=t.getAttribute('data-apc');
  let seg=null, hora='';
  if(tipo==='meta') seg=apcFaltaMeta(dia);
  else if(tipo==='desde'){ const ds=apcDesde(dia); if(ds){ seg=ds.seg; hora=ds.hora; } }
  delete inp.dataset.apcHora; delete inp.dataset.apcVal;
  if(seg==null){
    inp.value=''; apcAtualizaLinha(row);
    toast('Esse atalho não vale mais — confira o dia e a hora.','warn'); return;
  }
  inp.value=fmtH(seg);
  if(tipo==='desde'){ inp.dataset.apcHora=hora; inp.dataset.apcVal=inp.value; }
  apcAtualizaLinha(row);
  if(row.closest('#apc-linha')) apcGuardaCampos();
});
document.getElementById('conteudo').addEventListener('input', (e)=>{
  if(estado.vista!=='apontar') return;
  const t=e.target; if(!(t&&t.classList)) return;
  if(t.classList.contains('ap-tempo')){ delete t.dataset.apcHora; delete t.dataset.apcVal; }
  else if(!t.classList.contains('ap-coment')) return;
  if(t.closest('#apc-linha')) apcGuardaCampos();
});
document.getElementById('conteudo').addEventListener('change', (e)=>{
  if(estado.vista!=='apontar') return;
  const campo=e.target; if(!(campo&&campo.classList&&campo.classList.contains('ap-data'))) return;
  const row=campo.closest('.ap-row'); if(!row) return;
  apcAtualizaLinha(row);
  if(row.closest('#apc-linha')) apcGuardaCampos();
  const dia=campo.value;
  if(dia&&!(apMeusLogsCobre(dia)||apTempoCobre(dia))){
    apGaranteMeusLogs(dia).then(()=>{ if(row.isConnected&&campo.value===dia) apcAtualizaLinha(row); });
  }
});
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible'&&estado.vista==='apontar') apcAtualizaTudo();
});
