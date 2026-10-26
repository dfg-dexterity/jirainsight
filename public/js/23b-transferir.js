// Jira Insights · 23b · 🔗 TRANSFERIR TICKET — todo o histórico de um ticket vai para outro e o original é excluído.
// ===========================================================================
// Pedido do usuário (2026-10-26): "transferir ticket: todo o histórico de um ticket é enviado para outro ticket e o
// ticket original é deletado; entre projetos ou dentro do mesmo projeto". Substitui o 🔗 transferir antigo da Gestão
// (que só levava um texto-resumo e as horas totais num apontamento de quem transferia).
//
// O servidor (api/_lib/transferir.js, sub-rota { transf } do /api/reunioes) faz cada ETAPA com o token da pessoa;
// esta tela conduz: inventário da origem → destino (existente ou novo) → checagens → confirmação → execução em
// lotes, guardando o que já deu certo (↻ refaz SÓ o que falhou, o copiado não é copiado de novo) → exclusão, que
// só acontece quando TUDO deu certo. Horas: as da pessoa vão direto (mesmo dia e duração); as dos colegas viram
// CONVITE (POST /api/apontar {convidar}, um por pessoa e dia) — a API do Jira só cria worklog no nome de quem tem o
// token, e copiar o do colega no seu nome tiraria as horas dele (decisão do usuário: convite).
// Sem planGate de propósito: a transferência MOVE horas que já existem no Jira (o total do dia não muda).
// ===========================================================================
let _tft=null;
const TFT_ETAPAS=[
  ['destino','📦 Destino'], ['com','💬 Comentários'], ['anx','📎 Anexos'], ['vin','🔗 Vínculos'], ['fil','🧩 Filhos'],
  ['rem','🌐 Links externos'], ['hist','🕓 Histórico'], ['hor','⏱ Suas horas'], ['conv','📨 Convites aos colegas'], ['excl','🗑 Excluir a origem'] ];
function tftAberto(){ const b=document.querySelector('#modal:not([hidden]) .tft-modal'); return !!(b&&_tft&&b.getAttribute('data-tft-k')===_tft.k); }
function abreTransferir(k){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  k=String(k||'').trim().toUpperCase(); if(!k) return;
  // Uma transferência por vez (revisão de 2026-10-26): reabrir no meio volta ao progresso dela, nunca recria o
  // estado — senão a execução em voo passaria a ler o estado novo (outra origem) e marcaria progresso errado.
  if(_tft&&(_tft.executando||(_tft.k===k&&_tft.prog&&_tft.fase!=='fim'))){
    if(_tft.k!==k) toast(`Termine antes a transferência de ${_tft.k}.`,'warn');
    tftRender(); return; }
  const t=_tft={ k, carregando:true, erro:'', L:null, destModo:'existente', destKey:'', d:null, conferindo:false, destErro:'',
    destProj:'', destTipo:'', destResumo:'', opc:{com:true, anx:true, vin:true, hist:true}, entendi:false,
    executando:false, fase:'form', prog:null, fim:null };
  tftRender();
  garanteProjetos().catch(()=>null).then(()=>{ if(_tft===t&&tftAberto()) tftRender(); });
  tftChama(t, {transf:'ler'}).then(j=>{ if(_tft!==t) return; t.carregando=false;
    if(!j||!j.ok){ t.erro=(j&&j.erro)||'Não consegui ler o ticket.'; } else { t.L=j; t.destProj=j.o.projeto; t.destResumo=j.o.resumo; }
    if(tftAberto()) tftRender(); })
  .catch(e=>{ if(_tft===t){ t.carregando=false; t.erro=humanizaErro(e); if(tftAberto()) tftRender(); } });
}
// Toda função da execução recebe o estado `t` dela — nunca lê o _tft global (que pode ser outro).
function tftChama(t, corpo){ const id=idApontar();
  return fetch('/api/reunioes',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ ...corpo, origem:t&&t.k, email:id&&id.email, token:id&&id.token })}).then(r=>r.json()); }
const tftMB=(b)=>(b/1048576).toLocaleString('pt-BR',{maximumFractionDigits:1})+' MB';
// Separa os worklogs: os meus (vão direto) e os dos colegas, somados por pessoa e dia (um convite cada).
// O convite aceita até 24h por lançamento: o dia que passar disso vira mais de um convite (…|2, …|3).
function tftHoras(L){
  const eu=(L.me&&L.me.accountId)||''; const meus=[]; const dias={}; const inativos=new Set();
  (L.worklogs||[]).forEach(w=>{ if(w.autorId===eu){ meus.push(w); return; }
    if(w.ativo===false||(estado.usuariosInativos||{})[w.autorId]) inativos.add(w.autor);
    const ch=`${w.autorId}|${w.dia}`; const c=dias[ch]||(dias[ch]={a:w.autorId, nome:w.autor, dia:w.dia, seg:0, coms:[]}); c.seg+=w.seg; if(w.comentario) c.coms.push(w.comentario); });
  const convites=[];
  Object.entries(dias).sort((x,y)=>(x[1].nome+x[1].dia).localeCompare(y[1].nome+y[1].dia)).forEach(([ch,c])=>{
    let resto=c.seg, i=1;
    while(resto>0){ const seg=Math.min(resto, 24*3600); convites.push({ ch:i>1?`${ch}|${i}`:ch, a:c.a, nome:c.nome, dia:c.dia, seg, coms:c.coms }); resto-=seg; i++; } });
  return { meus, convites, inativos:[...inativos] };
}
// Os ids de cada etapa — a conclusão é medida POR ID (não pela contagem).
function tftItens(t){ const L=t.L; const H=tftHoras(L);
  return { com:t.opc.com?(L.comentarios||[]).map(c=>c.id):[], anx:t.opc.anx?(L.anexos||[]).map(a=>a.id):[], vin:t.opc.vin?(L.vinculos||[]).map(v=>v.id):[],
    fil:(L.filhos||[]).map(f=>f.k), hor:H.meus.map(w=>w.id), conv:H.convites.map(c=>c.ch) }; }
// Tipo (e nível) do destino: o conferido no Jira, ou o tipo escolhido no projeto para o ticket novo.
function tftDestinoInfo(t){ if(!t) return null;
  if(t.destModo==='existente') return t.d?{ k:t.d.k, projeto:t.d.projeto, nivel:t.d.nivel, tipo:t.d.tipo, pai:t.d.pai }:null;
  const p=(_projetosCache||[]).find(x=>x.key===t.destProj); const tp=p&&(p.tipos||[]).find(x=>String(x.id)===String(t.destTipo));
  if(!p||!tp||!String(t.destResumo||'').trim()) return null;
  return { k:'', projeto:p.key, nivel:tp.subtarefa?-1:(Number(tp.nivel)||0), tipo:tp.nome, pai:'' };
}
// Régua única do que impede (bloqueios) e do que se perde (avisos) — usada no render e antes de executar.
function tftChecagem(t){ const L=t&&t.L; const out={bloq:[], avisos:[]}; if(!L) return out;
  const o=L.o; const d=tftDestinoInfo(t);
  if(!d) out.bloq.push(t.destModo==='existente'?'Escolha e confira o ticket de destino.':'Escolha o projeto, o tipo e o resumo do ticket novo.');
  else {
    if(d.k&&d.k===o.k) out.bloq.push('O destino não pode ser o próprio ticket.');
    if(d.pai&&d.pai===o.k) out.bloq.push(`${d.k} é filho de ${o.k} e seria excluído junto — escolha outro destino.`);
    if(d.nivel<0&&(L.filhos||[]).length) out.bloq.push(`O destino é uma subtarefa e não pode receber os ${L.filhos.length} filho(s) de ${o.k}.`);
    (L.filhos||[]).forEach(f=>{
      if(d.nivel!==f.nivel+1) out.bloq.push(`${f.k} (${f.tipo}) não pode ser filho de um ${d.tipo||'ticket desse nível'} — escolha um destino do mesmo nível de ${o.k} (${o.tipo}) ou transfira ${f.k} antes.`);
      else if(f.nivel===-1&&f.projeto!==d.projeto) out.bloq.push(`A subtarefa ${f.k} não muda de projeto — escolha um destino em ${f.projeto} ou transfira ${f.k} antes (ela vira um ticket do outro projeto).`);
    });
  }
  if(L.comentariosMais) out.bloq.push(`${o.k} tem mais de ${L.limites.comentarios} comentários — grande demais para transferir com segurança pelo painel.`);
  if(L.filhosMais) out.bloq.push(`${o.k} tem mais de ${L.limites.filhos} filhos — grande demais para transferir com segurança pelo painel.`);
  if(L.worklogsMais) out.bloq.push(`${o.k} tem mais de ${L.limites.worklogs} apontamentos — grande demais para transferir com segurança pelo painel.`);
  const grandes=(L.anexos||[]).filter(a=>a.grande);
  if(t.opc.anx&&grandes.length) out.bloq.push(`${grandes.map(a=>`“${a.nome}” (${tftMB(a.bytes)})`).join(', ')} passa(m) do limite de ${tftMB(L.limites.anexoBytes)}: baixe e anexe no destino à mão e desmarque 📎 Anexos — ou não transfira.`);
  if(!t.opc.anx&&(L.anexos||[]).length) out.avisos.push(`📎 ${L.anexos.length} anexo(s) NÃO vão — serão perdidos com a exclusão.`);
  if(!t.opc.com&&(L.comentarios||[]).length) out.avisos.push(`💬 ${L.comentarios.length} comentário(s) NÃO vão — serão perdidos com a exclusão.`);
  if(!t.opc.vin&&(L.vinculos||[]).length) out.avisos.push(`🔗 ${L.vinculos.length} vínculo(s) NÃO serão refeitos.`);
  if(!t.opc.vin&&(L.remotos||[]).length) out.avisos.push(`🌐 ${L.remotos.length} link(s) externo(s) NÃO serão refeitos.`);
  if(!t.opc.hist&&L.historico&&L.historico.n) out.avisos.push('🕓 O histórico de status NÃO vai — fica só no que já foi registrado nos comentários.');
  const H=tftHoras(L);
  if(H.inativos.length) out.avisos.push(`⏱ ${H.inativos.join(', ')} saiu do time (inativo no Jira): o convite das horas dessa pessoa não terá quem confirme — essas horas deixam de existir com a exclusão.`);
  if((L.naoVai||[]).length) out.avisos.push(`Não vão (o Jira não copia entre tickets por aqui): ${L.naoVai.join('; ')}.`);
  if(t.opc.com&&(L.comentarios||[]).length>5) out.avisos.push(`💬 Quem observa o destino recebe um aviso do Jira por comentário copiado (${L.comentarios.length}), e as @menções avisam de novo.`);
  return out;
}
function tftRender(){ const t=_tft; if(!t) return;
  const casca=(corpo)=>abreModal(`<div class="tft-modal" data-tft-k="${escA(t.k)}">${corpo}</div>`);
  const cab=`<h2>🔗 Transferir ticket <span class="muted small">o histórico inteiro vai para outro ticket e ${esc(t.k)} é excluído</span></h2>`;
  if(t.carregando){ casca(`${cab}<div class="estado">Lendo ${esc(t.k)} no Jira (comentários, anexos, vínculos, horas e histórico)…</div>`); return; }
  if(!t.L){ casca(`${cab}<div class="erro">${esc(t.erro||'Falha ao ler o ticket.')}</div><div class="alx-modal-acoes"><span class="spacer"></span><button class="btn" id="gx-fechar">Fechar</button></div>`); return; }
  if(t.fase!=='form'){ tftRenderProgresso(casca, cab); return; }
  const L=t.L; const o=L.o; const H=tftHoras(L); const ck=tftChecagem(t); const id=idApontar();
  const segMeus=H.meus.reduce((s,w)=>s+w.seg,0); const segConv=H.convites.reduce((s,c)=>s+c.seg,0);
  const bytes=(L.anexos||[]).reduce((s,a)=>s+a.bytes,0);
  const caixa=(k,rot,n,det)=>`<label class="tft-item${n?'':' vazio'}"><input type="checkbox" data-tft-opc="${k}" ${t.opc[k]?'checked':''} ${n?'':'disabled'}> <span><b>${rot}</b> <span class="muted small">${det}</span></span></label>`;
  const pessoasConv=[...new Set(H.convites.map(c=>c.nome))];
  const inv=`<div class="tft-inv"><div class="sec">📦 O que vai junto</div>
    <div class="tft-item fixo">📝 <span><b>Descrição e dados</b> <span class="muted small">tipo, status, criação, relator e responsável abrem a transferência no destino</span></span></div>
    ${caixa('com','💬 Comentários',(L.comentarios||[]).length,`${(L.comentarios||[]).length} — cada um com o autor e a data originais no cabeçalho${(L.comentarios||[]).some(c=>c.restrito)?' (os restritos continuam restritos)':''}`)}
    ${caixa('anx','📎 Anexos',(L.anexos||[]).length,`${(L.anexos||[]).length}${bytes?` · ${tftMB(bytes)}`:''} — baixados de ${esc(o.k)} e anexados no destino`)}
    ${caixa('vin','🔗 Vínculos',(L.vinculos||[]).length+(L.remotos||[]).length,`${(L.vinculos||[]).length}${(L.vinculos||[]).length?` (${esc(L.vinculos.slice(0,3).map(v=>`${v.rotulo} ${v.k}`).join(' · '))}${L.vinculos.length>3?'…':''})`:''}${(L.remotos||[]).length?` + ${L.remotos.length} link(s) externo(s)`:''} — refeitos no destino`)}
    <div class="tft-item fixo">🧩 <span><b>Filhos</b> <span class="muted small">${(L.filhos||[]).length?`${L.filhos.length} (${esc(L.filhos.slice(0,4).map(f=>f.k).join(', '))}${L.filhos.length>4?'…':''}) — passam a ser filhos do destino`:'nenhum'}</span></span></div>
    ${caixa('hist','🕓 Histórico',(L.historico&&L.historico.n)||1,`${(L.historico&&L.historico.n)||0} mudança(s) de status/responsável — um comentário com a linha do tempo`)}
    <div class="tft-item fixo">⏱ <span><b>Horas</b> <span class="muted small">${segMeus?`suas <b>${esc(fmtH(segMeus))}</b> (${H.meus.length} lançamento(s)) vão direto, com o dia e a duração originais`:'nenhuma hora sua'}${segConv?` · colegas: <b>${esc(fmtH(segConv))}</b> de ${esc(pessoasConv.join(', '))} — cada um recebe um 📨 convite no 📥 Inbox para confirmar no destino`:''}</span></span></div>
  </div>`;
  const projs=(_projetosCache||[]).slice().sort((x,y)=>(x.key===o.projeto?-1:y.key===o.projeto?1:x.key.localeCompare(y.key)));
  const pSel=projs.find(p=>p.key===t.destProj);
  const tipos=((pSel&&pSel.tipos)||[]).filter(x=>!x.subtarefa);
  if(t.destModo==='criar'&&(!t.destTipo||!tipos.some(x=>String(x.id)===String(t.destTipo)))){
    const igual=tipos.find(x=>x.nome===o.tipo)||tipos.find(x=>(Number(x.nivel)||0)===Math.max(0,o.nivel))||tipos[0]; t.destTipo=igual?String(igual.id):''; }
  const dFicha=t.d?`<div class="trf-ficha"><b>${esc(t.d.k)}</b> — ${esc(String(t.d.resumo||'').slice(0,90))}<div class="muted small">${esc(t.d.tipo)} · ${esc(t.d.status)} · ${esc(t.d.projeto)}${t.d.projetoNome?` (${esc(t.d.projetoNome)})`:''}</div></div>`:'';
  const dest=`<div class="tft-dest"><div class="sec">🎯 Para onde vai</div>
    <div class="rv-modo"><button id="tft-modo-ex" class="${t.destModo==='existente'?'on':''}">🔗 Um ticket que já existe<br><span class="muted small" style="font-weight:400">no mesmo projeto ou em outro</span></button>
      <button id="tft-modo-novo" class="${t.destModo==='criar'?'on':''}">➕ Um ticket novo<br><span class="muted small" style="font-weight:400">criado agora, no projeto que você escolher</span></button></div>
    ${t.destModo==='existente'
      ?`<div class="ap-filtros"><div class="campo"><label>Ticket de destino</label><input type="text" id="tft-dest" value="${escA(t.destKey)}" placeholder="ex.: CV-123" autocomplete="off"></div>
          <div class="campo" style="display:flex;gap:6px;align-items:end"><button class="btn" id="tft-conferir" ${t.conferindo?'disabled':''}>${t.conferindo?'Conferindo…':'Conferir'}</button><button class="btn" id="tft-buscar" data-tip="Escolher entre os tickets abertos de um projeto">🎫 Buscar</button></div></div>
        ${t.destErro?`<div class="erro">${esc(t.destErro)}</div>`:''}${dFicha}`
      :`<div class="ap-filtros"><div class="campo"><label>Projeto</label><select id="tft-proj">${projs.map(p=>`<option value="${escA(p.key)}" ${t.destProj===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('')||'<option value="">carregando…</option>'}</select></div>
          <div class="campo"><label>Tipo</label><select id="tft-tipo">${tipos.map(x=>`<option value="${escA(String(x.id))}" ${String(t.destTipo)===String(x.id)?'selected':''}>${esc(x.nome)}</option>`).join('')||'<option value="">—</option>'}</select></div>
          <div class="campo" style="flex:1;min-width:220px"><label>Resumo</label><input type="text" id="tft-resumo" maxlength="255" value="${escA(t.destResumo)}"></div></div>
        <div class="muted small">O responsável, o vencimento, a prioridade e os rótulos de ${esc(o.k)} vão junto quando o projeto aceitar.</div>`}
  </div>`;
  const checks=(ck.bloq.length?`<div class="tft-bloq"><b>⛔ Não dá para transferir ainda:</b><ul>${ck.bloq.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'')
    +(ck.avisos.length?`<div class="aviso tft-avisos"><ul>${ck.avisos.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:'');
  const pode=!ck.bloq.length&&t.entendi&&!!id;
  casca(`${cab}
    <div class="rv-met"><span class="k">${esc(o.k)}</span> — ${esc(o.resumo)}
      <div class="muted small" style="margin-top:2px">${esc(o.tipo)} · ${esc(o.status)} · ${esc(o.projeto)}${o.projetoNome?` (${esc(o.projetoNome)})`:''} · criado em ${esc(fmtBR(String(o.criado).slice(0,10)))} por ${esc(o.relator)}${o.resp?` · responsável ${esc(o.resp)}`:''}</div></div>
    ${inv}${dest}${checks}
    <div class="rv-del">⚠️ <b>${esc(o.k)} será excluído do Jira</b> — só depois que tudo acima tiver sido copiado; se algo falhar, nada é excluído e você pode tentar de novo só o que faltou. Não dá para desfazer a exclusão.
      <label class="check" style="margin-top:6px"><input type="checkbox" id="tft-entendi" ${t.entendi?'checked':''}> Entendi — pode excluir ${esc(o.k)} no fim</label></div>
    <div class="alx-modal-acoes"><button class="btn primario" id="tft-executar" ${pode?'':'disabled'}>🔗 Transferir e excluir ${esc(o.k)}</button>
      <span class="spacer"></span><button class="btn" id="gx-fechar">Cancelar</button></div>`);
}
// Quantos itens cada etapa tem e quantos já foram feitos.
function tftContas(t){ const P=t.prog; const I=tftItens(t);
  const feitos=(k)=>I[k].filter(id=>P[k].ok[id]).length;
  const nRem=t.opc.vin&&(t.L.remotos||[]).length?1:0;
  const n={ destino:1, com:I.com.length, anx:I.anx.length, vin:I.vin.length, rem:nRem, fil:I.fil.length, hist:t.opc.hist?1:0, hor:I.hor.length, conv:I.conv.length, excl:1 };
  const f={ destino:P.destino?1:0, com:feitos('com'), anx:feitos('anx'), vin:feitos('vin'), rem:P.rem.ok?1:0, fil:feitos('fil'), hist:P.hist.ok?1:0,
    hor:feitos('hor'), conv:feitos('conv'), excl:P.excl&&P.excl.excluida?1:0 };
  return {n,f};
}
function tftRenderProgresso(casca, cab){ const t=_tft; const P=t.prog; const {n,f}=tftContas(t);
  const errosDe=(k)=>k==='destino'?(P.erroDestino?[P.erroDestino]:[]):k==='hist'?(P.hist.erro?[P.hist.erro]:[]):k==='rem'?(P.rem.erro?[P.rem.erro]:[]):k==='excl'?((P.excl&&!P.excl.excluida&&P.excl.erro)?[P.excl.erro]:[]):Object.entries((P[k]||{}).erros||{}).map(([id,e])=>`${id}: ${e}`);
  const linhas=TFT_ETAPAS.filter(([k])=>n[k]).map(([k,rot])=>{ const er=errosDe(k); const ok=f[k]>=n[k];
    const ic=ok?'✅':er.length?'⚠️':(t.executando&&P.atual===k?'⏳':'·');
    return `<li class="tft-et${ok?' ok':er.length?' err':''}"><span>${ic} <b>${rot}</b>${n[k]>1?` <span class="muted small">${f[k]}/${n[k]}</span>`:''}</span>${er.length?`<div class="muted small">${er.slice(0,3).map(esc).join('<br>')}${er.length>3?`<br>… e mais ${er.length-3}`:''}</div>`:''}</li>`; }).join('');
  const D=P.destino&&P.destino.k; const url=D?`${jiraBase()}/browse/${encodeURIComponent(D)}`:'';
  let topo='', acoes='';
  if(t.executando){ topo=`<div class="estado">Transferindo ${esc(t.k)}${D?` → ${esc(D)}`:''}… não feche esta janela.</div>`; }
  else if(t.fase==='fim'){
    topo=`<div class="pl-res-ok">✓ ${esc(t.k)} transferido para <a href="${url}" target="_blank" rel="noopener">${esc(D)} ↗</a> e excluído do Jira.</div>`
      +(n.conv?`<div class="muted small" style="margin-top:6px">📨 ${n.conv} convite(s) enviados: cada colega confirma no 📥 Inbox (ou no ⏱ Apontar) e as horas entram no nome dele em ${esc(D)}.</div>`:'')
      +(P.destino&&P.destino.semExtras?`<div class="muted small">O projeto de destino não aceitou o responsável/vencimento/rótulos de ${esc(t.k)} — o ticket foi criado sem eles.</div>`:'');
    acoes=`${D?`<a class="btn" href="${url}" target="_blank" rel="noopener">Abrir ${esc(D)} ↗</a>`:''}<span class="spacer"></span><button class="btn primario" id="gx-fechar">Fechar</button>`;
  } else {
    const soExcl=P.excl&&!P.excl.excluida;
    topo=soExcl?`<div class="aviso">Tudo foi copiado para <a href="${url}" target="_blank" rel="noopener">${esc(D)} ↗</a>, mas ${esc(t.k)} <b>não foi excluído</b>: ${esc(P.excl.erro||'')}</div>`
      :`<div class="aviso">Parte da transferência falhou — <b>${esc(t.k)} NÃO foi excluído</b>. O que já foi copiado${D?` para <a href="${url}" target="_blank" rel="noopener">${esc(D)} ↗</a>`:''} fica; “Tentar de novo” refaz só o que falhou.</div>`;
    acoes=`<button class="btn primario" id="tft-retentar">↻ Tentar de novo ${soExcl?'a exclusão':'o que falhou'}</button><span class="spacer"></span><button class="btn" id="gx-fechar">Fechar (${esc(t.k)} continua)</button>`;
  }
  casca(`${cab}${topo}<ul class="tft-etapas">${linhas}</ul><div class="alx-modal-acoes">${acoes}</div>`);
}
function tftProgNovo(){ const v=()=>({ok:{}, erros:{}}); return { destino:null, erroDestino:'', com:v(), anx:v(), vin:v(), fil:v(), hor:v(), conv:v(), rem:{ok:false, erro:''}, hist:{ok:false, erro:''}, excl:null, atual:'' }; }
const tftVisivel=(t)=>_tft===t&&tftAberto();
// Roda uma etapa em lotes: só os itens ainda não feitos; o erro de um item fica até ele dar certo.
// Resposta sem ok:true (400, 504 em HTML, rede) = o lote inteiro falhou — o servidor não duplica ao repetir (marcadores).
async function tftLotes(t, chave, itens, tam, chamada){
  const st=t.prog[chave]; const pend=itens.filter(x=>!st.ok[x]);
  for(let i=0;i<pend.length;i+=tam){ const lote=pend.slice(i,i+tam);
    let j; try{ j=await chamada(lote); }catch(e){ j={ok:false, erro:humanizaErro(e)}; }
    if(!j||j.ok!==true){ lote.forEach(x=>{ st.erros[x]=(j&&j.erro)||'falha'; }); }
    else { (j.feitos||[]).forEach(x=>{ st.ok[x]=true; delete st.erros[x]; }); Object.entries(j.erros||{}).forEach(([x,e])=>{ st.erros[x]=e; }); }
    if(tftVisivel(t)) tftRender(); }
}
const tftUma=(p)=>p.then(j=>({ ok:!!(j&&j.ok===true), erro:(j&&j.ok===true)?'':((j&&j.erro)||'falha') })).catch(e=>({ok:false, erro:humanizaErro(e)}));
async function tftExecuta(t){ if(!t||!t.L||t.executando) return;
  const ck=tftChecagem(t); if(ck.bloq.length||!t.entendi) return;
  const L=t.L; const H=tftHoras(L); const I=tftItens(t); const id=idApontar(); if(!id){ abreIdentidade(); return; }
  if(!t.prog) t.prog=tftProgNovo(); const P=t.prog;
  t.executando=true; t.fase='exec'; if(tftVisivel(t)) tftRender();
  try{
    if(!P.destino){ P.atual='destino';
      const corpo=t.destModo==='criar'?{transf:'destino', modo:'criar', projeto:t.destProj, tipoId:t.destTipo, resumo:String(t.destResumo||'').trim()}
        :{transf:'destino', modo:'existente', destino:t.d.k};
      const j=await tftChama(t, corpo).catch(e=>({ok:false, erro:humanizaErro(e)}));
      if(!j||j.ok!==true){ P.erroDestino=(j&&j.erro)||'Falha ao preparar o destino.'; }
      else { P.destino={k:j.destino, criado:!!j.criado, semExtras:!!j.semExtras}; P.erroDestino=''; } }
    const D=P.destino&&P.destino.k;
    if(D){
      const lote=(transf,campo)=>(xs)=>tftChama(t, {transf, destino:D, [campo]:xs});
      P.atual='com'; await tftLotes(t, 'com', I.com, 5, lote('comentarios','ids'));
      P.atual='anx'; await tftLotes(t, 'anx', I.anx, 1, lote('anexos','ids'));
      P.atual='vin'; await tftLotes(t, 'vin', I.vin, 20, lote('vinculos','ids'));
      P.atual='rem'; if(t.opc.vin&&(L.remotos||[]).length&&!P.rem.ok){ P.rem=await tftUma(tftChama(t, {transf:'remotos', destino:D})); if(tftVisivel(t)) tftRender(); }
      P.atual='fil'; await tftLotes(t, 'fil', I.fil, 10, lote('filhos','chaves'));
      P.atual='hist'; if(t.opc.hist&&!P.hist.ok){ P.hist=await tftUma(tftChama(t, {transf:'historico', destino:D})); if(tftVisivel(t)) tftRender(); }
      P.atual='hor'; await tftLotes(t, 'hor', I.hor, 5, lote('horas','ids'));
      // Convites: por pessoa e dia (até 24h cada), no nome de quem apontou, com os comentários originais; aviso no
      // Teams só no 1º convite de cada pessoa.
      P.atual='conv'; const avisada={};
      await tftLotes(t, 'conv', I.conv, 1, async ([ch])=>{ const c=H.convites.find(x=>x.ch===ch);
        const coment=`⏩ Transferido de ${t.k} — apontamento de ${fmtBR(c.dia)}${c.coms.length?`: ${c.coms.join(' · ')}`:''}`.slice(0,300);
        const j=await fetch('/api/apontar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ convidar:true, issue:D,
          segundos:c.seg, inicio:c.dia, comentario:coment, pessoas:[{accountId:c.a, nome:c.nome}],
          avisarTeams:!avisada[c.a], email:id.email, token:id.token })}).then(r=>r.json());
        avisada[c.a]=true;
        return (j&&j.ok===true)?{ok:true, feitos:[ch]}:{ok:false, erro:(j&&j.erro)||'falha ao convidar'}; });
      // Exclusão: só com TUDO feito (por id). O servidor ainda relê a origem: conteúdo novo desde o inventário
      // (vistos = TUDO o que a tela viu, copiado ou não por escolha) ou restrito que a pessoa não vê → recusa.
      const {n,f}=tftContas(t);
      const falta=['com','anx','vin','rem','fil','hist','hor','conv'].some(k=>f[k]<n[k]);
      if(!falta){ P.atual='excl';
        const vistos={ com:(L.comentarios||[]).map(c=>c.id), wl:(L.worklogs||[]).map(w=>w.id), anx:(L.anexos||[]).map(a=>a.id), vin:(L.vinculos||[]).map(v=>v.id) };
        const j=await tftChama(t, {transf:'excluir', destino:D, vistos}).catch(e=>({ok:false, erro:humanizaErro(e)}));
        P.excl={ excluida:!!(j&&j.excluida===true), erro:(j&&j.erro)||(j&&j.excluida===true?'':'falha ao excluir') }; }
    }
  } finally {
    t.executando=false; P.atual='';
    const excluida=!!(P.excl&&P.excl.excluida); const D=P.destino&&P.destino.k;
    t.fase=excluida?'fim':'parou';
    try{
      const {n,f}=tftContas(t);
      logAcao({acao:'transferir ticket', t:t.k, para:D||'', ok:excluida,
        motivo:`${f.com} coment. · ${f.anx} anexo(s) · ${f.vin} vínculo(s) · ${f.fil} filho(s) · ${f.hor} apont. seu(s) · ${f.conv}/${n.conv} convite(s)${excluida?'':' — origem mantida'}`});
      if(f.hor){ estado.apontar.meusLogsSujo=true; estado.apontar.meusLogsEscreveu=true; }
    }catch(e){}
    if(excluida){
      const g=estado.gestao; if(g){ delete (g.sel||{})[t.k]; if(g.dados&&g.dados.tickets) g.dados.tickets=g.dados.tickets.filter(x=>x.k!==t.k); }
      apExtrasRemoveTicket(t.k);
      toast(`✓ ${t.k} transferido para ${D} e excluído.`,'ok');
    } else toast(`⚠ Transferência de ${t.k} incompleta — ${t.k} não foi excluído.`,'warn');
    estado.apontar.porData={}; estado.apontar.recentes=null; invalidaCacheDados();
    if(tftVisivel(t)) tftRender(); else if(estado.vista==='gestao') renderGestao();
  }
}
function tftConfere(){ const t=_tft; if(!t) return;
  const k=String(t.destKey||'').trim().toUpperCase();
  if(t.d&&t.d.k===k&&!t.destErro) return;   // já conferido
  t.destKey=k; t.d=null; t.destErro='';
  if(!/^[A-Z][A-Z0-9_]*-\d+$/.test(k)){ t.destErro=k?'Chave inválida — ex.: CV-123.':''; tftRender(); return; }
  if(k===t.k){ t.destErro='O destino não pode ser o próprio ticket.'; tftRender(); return; }
  if(t.conferindo===k) return;   // o change (ao sair do campo) e o clique em Conferir chegam juntos
  t.conferindo=k; tftRender();
  tftChama(t, {transf:'conferir', destino:k}).then(j=>{ if(!_tft||_tft!==t) return; t.conferindo=false;
    if(t.destKey!==k){ if(tftAberto()) tftRender(); return; }   // a pessoa já trocou a chave
    if(j&&j.ok) t.d=j.d; else t.destErro=(j&&j.erro)||'Não consegui conferir o destino.';
    if(tftAberto()) tftRender(); })
  .catch(e=>{ t.conferindo=false; t.destErro=humanizaErro(e); if(tftAberto()) tftRender(); });
}

// ---- Listeners desta tela ----
// Durante a execução o modal NÃO fecha (Esc, ×, clique fora): fechar no meio deixava a execução órfã. Captura no
// document, antes dos fechamentos globais do 30-eventos-boot.
const tftTrava=(e)=>{ if(!(_tft&&_tft.executando&&tftAberto())) return false;
  e.preventDefault(); e.stopImmediatePropagation(); toast(`Aguarde: a transferência de ${_tft.k} está em andamento.`,'warn'); return true; };
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') tftTrava(e); }, true);
document.addEventListener('click',(e)=>{ const id=e.target&&e.target.id; if(id==='modal-x'||id==='modal') tftTrava(e); }, true);
// Entradas: [data-tft-abre="KEY"] em qualquer lugar (Gestão, ficha 🔍, ⏱ Apontar).
document.addEventListener('click',(e)=>{
  const a=e.target.closest&&e.target.closest('[data-tft-abre]'); if(!a) return;
  e.preventDefault(); e.stopPropagation(); escondeTip(); abreTransferir(a.getAttribute('data-tft-abre'));
}, true);
document.getElementById('modal-body').addEventListener('click',(e)=>{
  if(!_tft||!e.target.closest('.tft-modal')) return;
  const b=e.target.closest('button'); if(!b) return;
  if(b.id==='tft-modo-ex'){ _tft.destModo='existente'; tftRender(); }
  else if(b.id==='tft-modo-novo'){ _tft.destModo='criar'; tftRender(); }
  else if(b.id==='tft-conferir'){ const i=document.getElementById('tft-dest'); if(i) _tft.destKey=i.value; tftConfere(); }
  else if(b.id==='tft-buscar'){ const t=_tft; const proj=(t.d&&t.d.projeto)||(t.L&&t.L.o.projeto)||'';
    abreBuscaTickets(proj, (k)=>{ if(_tft!==t) return; t.destKey=String(k||'').toUpperCase(); tftRender(); tftConfere(); }); }
  else if(b.id==='tft-executar'){ tftExecuta(_tft); }
  else if(b.id==='tft-retentar'){ if(_tft.prog&&_tft.prog.excl&&!_tft.prog.excl.excluida) _tft.prog.excl=null; tftExecuta(_tft); }
});
document.getElementById('modal-body').addEventListener('change',(e)=>{
  if(!_tft||!e.target.closest('.tft-modal')) return; const el=e.target;
  if(el.hasAttribute('data-tft-opc')){ _tft.opc[el.getAttribute('data-tft-opc')]=el.checked; tftRender(); }
  else if(el.id==='tft-entendi'){ _tft.entendi=el.checked; tftRender(); }
  else if(el.id==='tft-proj'){ _tft.destProj=el.value; _tft.destTipo=''; tftRender(); }
  else if(el.id==='tft-tipo'){ _tft.destTipo=el.value; tftRender(); }
  else if(el.id==='tft-resumo'){ _tft.destResumo=el.value; tftRender(); }
  else if(el.id==='tft-dest'){ _tft.destKey=el.value; tftConfere(); }
});
document.getElementById('modal-body').addEventListener('keydown',(e)=>{
  if(!_tft||e.key!=='Enter') return;
  if(e.target.id==='tft-dest'){ e.preventDefault(); _tft.destKey=e.target.value; tftConfere(); }
});
