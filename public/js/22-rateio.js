// Jira Insights · 22 · ➗ RATEIO — apontamento em massa (igual / percentual / fatias / manual) fechando exato no total.
// ===========================================================================
// ➗ Rateio — apontamento em massa: cole vários tickets, informe as horas TOTAIS
// e o painel divide entre eles (⚖️ igual · % percentual · 🍕 fatias · ✏️ manual),
// fechando EXATO no total (minutos inteiros; as sobras de arredondamento vão
// para os maiores restos). Cada worklog sai um a um via /api/apontar com o token
// da própria pessoa (mesmo modelo do ⏱ Apontar) e o status dos tickets pode ser
// trocado em conjunto reaproveitando o modal da Gestão (abreModalStatusLote).
// ===========================================================================
const RT_RE_KEYS=/[A-Z][A-Z0-9_]*-\d+/g;
function rtParse(texto){ return [...new Set(([...String(texto||'').toUpperCase().matchAll(RT_RE_KEYS)]).map(m=>m[0]))].slice(0,100); }
// Divide o alvo (segundos) pelos pesos em MINUTOS inteiros; a soma bate exata.
function rtDistribui(totalSeg,pesos){
  const soma=pesos.reduce((s,p)=>s+(p>0?p:0),0);
  if(!(totalSeg>0)||!(soma>0)) return pesos.map(()=>0);
  const totalMin=Math.round(totalSeg/60);
  const exatos=pesos.map(p=>p>0?totalMin*p/soma:0);
  const base=exatos.map(v=>Math.floor(v));
  let sobra=totalMin-base.reduce((s,v)=>s+v,0);
  exatos.map((v,i)=>[v-base[i],i]).sort((a,b)=>b[0]-a[0]||a[1]-b[1])
    .forEach(([,i])=>{ if(sobra>0&&exatos[i]>0){ base[i]+=1; sobra-=1; } });
  return base.map(m=>m*60);
}
// Pesos do modo atual (tickets "não encontrados" ficam FORA do rateio: peso 0).
function rtPesosAtuais(){
  const rt=estado.rateio; const fora=new Set(rt.naoEnc||[]);
  if(rt.modo==='pct') return rt.tickets.map(k=>fora.has(k)?0:Math.max(0,Number(String(rt.pcts[k]??'').replace(',','.'))||0));
  if(rt.modo==='fatias') return rt.tickets.map(k=>fora.has(k)?0:Math.max(0,Math.round(Number(rt.pesos[k]??1)||0)));
  return rt.tickets.map(k=>fora.has(k)?0:1);   // igual
}
// Cálculo do rateio no modo atual: segundos por ticket + total distribuído.
function rtCalculo(){
  const rt=estado.rateio; const fora=new Set(rt.naoEnc||[]);
  const out={segs:{},total:0,informado:0,somaPct:null};
  if(rt.modo==='manual'){
    rt.tickets.forEach(k=>{ const s=fora.has(k)?0:parseTempo(rt.mans[k]);
      out.segs[k]=(s&&s>0)?Math.round(s/60)*60:0; });
    out.total=rt.tickets.reduce((s,k)=>s+out.segs[k],0);
    out.informado=out.total;
    return out;
  }
  out.informado=parseTempo(rt.total)||0;
  const pesos=rtPesosAtuais();
  let alvo=out.informado;
  if(rt.modo==='pct'){
    const soma=pesos.reduce((s,p)=>s+p,0);
    out.somaPct=Math.round(soma*100)/100;
    alvo=out.informado*soma/100;   // percentual LITERAL: 30% = 30% das horas totais
  }
  const segs=rtDistribui(alvo,pesos);
  rt.tickets.forEach((k,i)=>{ out.segs[k]=segs[i]; });
  out.total=segs.reduce((s,v)=>s+v,0);
  return out;
}
// O rateio está pronto para apontar? {ok, motivo, ativos}.
function rtPronto(calc){
  const rt=estado.rateio;
  if(!rt.tickets.length) return {ok:false,motivo:'Cole os tickets no passo 1.'};
  if(rt.modo!=='manual'&&!(calc.informado>=60)) return {ok:false,motivo:'Informe as horas totais (ex.: 5h, 2h30, 45m).'};
  if(rt.modo==='pct'&&Math.abs((calc.somaPct||0)-100)>0.01) return {ok:false,motivo:`Os percentuais somam ${String(calc.somaPct??0).replace('.',',')}% — ajuste (ou use 🎯 normalizar) para fechar em 100%.`};
  const ativos=rt.tickets.filter(k=>calc.segs[k]>=60);
  if(!ativos.length) return {ok:false,motivo:rt.modo==='manual'?'Preencha as horas de pelo menos um ticket.':'Nenhum ticket ficou com pelo menos 1 minuto — revise a divisão.'};
  const estouro=ativos.find(k=>calc.segs[k]>24*3600);
  if(estouro) return {ok:false,motivo:`${estouro} ficaria com ${fmtH(calc.segs[estouro])} — o Jira aceita no máximo 24h por lançamento.`};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(rt.data||'')) return {ok:false,motivo:'Escolha a data do apontamento.'};
  return {ok:true,motivo:'',ativos};
}
const rtCor=(i)=>PALETA[i%PALETA.length];
// Barra empilhada da divisão (flex proporcional — as fatias sempre cabem).
function rtBarraHTML(calc){
  const rt=estado.rateio;
  const pos=rt.tickets.map((k,i)=>({k,i,s:calc.segs[k]})).filter(x=>x.s>0);
  if(!pos.length) return '<div class="muted small" style="margin:4px 0 8px">A barra da divisão aparece assim que houver horas para dividir.</div>';
  return `<div class="rt-barra">${pos.map(x=>`<div class="rt-seg" style="flex:${x.s} 1 0;background:${rtCor(x.i)}" data-tip="${escA(x.k+' · '+fmtH(x.s))}"></div>`).join('')}</div>`;
}
function rtResumoHTML(calc){
  const rt=estado.rateio;
  const nAtivos=rt.tickets.filter(k=>calc.segs[k]>=60).length;
  const partes=[`<strong>${fmtH(calc.total)}</strong> distribuídas em <strong>${nAtivos}</strong> ticket(s)`];
  if(rt.modo==='pct'&&calc.somaPct!=null) partes.push(`percentuais somam <strong>${String(calc.somaPct).replace('.',',')}%</strong>`);
  if(rt.modo!=='manual'&&calc.informado>0&&calc.total!==calc.informado) partes.push(`de <strong>${fmtH(calc.informado)}</strong> informadas`);
  return `<div class="muted" style="margin:8px 0 4px">${partes.join(' · ')}</div>`;
}
// Atualiza SÓ os números (células de horas, barra, resumo e botão) sem
// re-render — os inputs de % e do modo manual continuam com o foco de quem digita.
function rtAtualizaCalculo(){
  const rt=estado.rateio; const calc=rtCalculo(); const pronto=rtPronto(calc);
  rt.tickets.forEach(k=>{
    const h=document.querySelector(`[data-rt-h="${k}"]`); if(h) h.textContent=calc.segs[k]?fmtH(calc.segs[k]):'—';
    const hp=document.querySelector(`[data-rt-hp="${k}"]`); if(hp) hp.textContent=(calc.total&&calc.segs[k])?`(${Math.round(calc.segs[k]/calc.total*1000)/10}%)`:'';
  });
  const viz=document.getElementById('rt-viz'); if(viz) viz.innerHTML=rtBarraHTML(calc)+rtResumoHTML(calc);
  const bt=document.getElementById('rt-apontar');
  if(bt){ const id=idApontar(); bt.disabled=!(id&&pronto.ok&&!rt.executando);
    bt.textContent=`⏱ Apontar ${fmtH(calc.total)} em ${(pronto.ativos||[]).length} ticket(s)`; }
  const br=document.getElementById('rt-retry');
  if(br&&!rt.executando){ const faltam=rt.tickets.filter(k=>calc.segs[k]>=60&&!(rt.resultados&&rt.resultados[k]&&rt.resultados[k].ok));
    br.disabled=!faltam.length;
    br.textContent=`⏱ Apontar os que faltam (${faltam.length} · ${fmtH(faltam.reduce((s,k)=>s+calc.segs[k],0))})`; }
  const mv=document.getElementById('rt-motivo'); if(mv) mv.textContent=pronto.ok?'':pronto.motivo;
  const tt=document.getElementById('rt-total'); if(tt&&rt.modo==='manual') tt.value=fmtH(calc.total);
}
// Confere a lista no Jira (resumo/status via conta de serviço) e marca as chaves
// que não existem — elas ficam FORA da divisão e do apontamento.
async function rtConfere(){
  const rt=estado.rateio; rt.tickets=rtParse(rt.texto);
  if(!rt.tickets.length){ renderRateio(); return; }
  rt.conferindo=true; rt.confErro=''; renderRateio();
  try{
    const j=await fetch(`/api/vencimentos?chaves=${encodeURIComponent(rt.tickets.join(','))}`).then(r=>r.json());
    rt.conferindo=false;
    if(j&&j.tickets){ rt.info={...rt.info,...j.tickets}; rt.naoEnc=j.naoEncontrados||[];
      rt.confErro=(j.erros&&j.erros.length)?`Alguns tickets não puderam ser conferidos agora (tente de novo): ${j.erros.slice(0,3).join(' · ')}`:''; }
    else rt.confErro=(j&&j.erro)||'Não foi possível conferir os tickets.';
  }catch(e){ rt.conferindo=false; rt.confErro='Erro de rede ao conferir: '+String(e.message||e); }
  if(estado.vista==='rateio') renderRateio();
}
// Cria os worklogs um a um (com confirmação). Tickets já apontados com sucesso
// NUNCA repetem — reexecutar cobre só os que faltam (falhas e recém-chegados).
// Durante o loop os listeners do Rateio ficam bloqueados (rt.executando).
async function rtExecuta(){
  const rt=estado.rateio; const id=idApontar(); if(!id){ abreIdentidade(); return; }
  if(rt.executando) return;
  const calc=rtCalculo(); const pronto=rtPronto(calc);
  if(!pronto.ok){ toast(pronto.motivo,'warn'); return; }
  const alvos=rt.tickets.filter(k=>calc.segs[k]>=60)
    .filter(k=>!(rt.resultados&&rt.resultados[k]&&rt.resultados[k].ok));
  if(!alvos.length){ toast('Nada a apontar — todos os tickets com horas já foram apontados.','warn'); return; }
  const inicio=rt.data||hojeSP();
  const totAlvo=alvos.reduce((s,k)=>s+calc.segs[k],0);
  if(!window.confirm(`Criar ${alvos.length} apontamento(s) somando ${fmtH(totAlvo)} em ${fmtBR(inicio)}?`)) return;
  rt.executando=true;
  const resultados=rt.resultados=rt.resultados||{};   // referência local: sobrevive a qualquer reset
  const fb=document.getElementById('rt-fb');
  const bt=document.getElementById('rt-apontar'); if(bt) bt.disabled=true;
  const br=document.getElementById('rt-retry'); if(br) br.disabled=true;
  let okN=0; const erros=[];
  for(let i=0;i<alvos.length;i++){ const k=alvos[i]; const seg=calc.segs[k];
    if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb'; fb.textContent=`Apontando ${fmtH(seg)} em ${k}… (${i+1}/${alvos.length})`; }
    try{
      const j=await fetch('/api/apontar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({issue:k,segundos:seg,inicio,comentario:(rt.coment||'').trim(),email:id.email,token:id.token})}).then(r=>r.json());
      if(j.ok){ okN++; resultados[k]={ok:true,seg};
        registraExtraDia(inicio,seg,k);
        logAcao({acao:'apontar',t:k,para:fmtH(seg),ok:true},false);
      } else { resultados[k]={ok:false,seg,erro:j.erro||'falhou'}; erros.push(`${k}: ${j.erro||'falhou'}`); }
    }catch(e){ resultados[k]={ok:false,seg,erro:String(e.message||e)}; erros.push(`${k}: ${e.message||e}`); }
  }
  rt.executando=false;
  try{ atualizaPainelHoras(); }catch(e){}
  if(estado.vista==='rateio') renderRateio();
  toast(erros.length?`Rateio: ${okN} apontado(s), ${erros.length} falha(s).`:`✓ Rateio concluído: ${okN} apontamento(s) somando ${fmtH(totAlvo)}.`,erros.length?'warn':'ok');
}
function renderRateio(){
  const cont=document.getElementById('conteudo');
  const rt=estado.rateio; if(!rt.data) rt.data=hojeSP();
  rt.tickets=rtParse(rt.texto);
  const id=idApontar();
  const calc=rtCalculo(); const pronto=rtPronto(calc);
  const n=rt.tickets.length;
  const fora=new Set((rt.naoEnc||[]).filter(k=>rt.tickets.includes(k)));

  const faixaId=id
    ? `<div class="ap-id">➗ Rateando como <strong>${esc(id.nome||id.email)}</strong>
         <span class="muted small">(cada worklog é criado no seu usuário do Jira — mesmo modelo do ⏱ Apontar)</span>
         <span class="spacer"></span><button class="btn" data-ap-act="trocar-id">Trocar usuário</button></div>`
    : `<div class="ap-id sem">Para apontar, identifique-se uma única vez (e-mail + token de API do Jira — 2 minutos).
         <span class="spacer"></span><button class="btn" data-ap-act="config-id">Identificar-se</button></div>`;

  const passo1=`<div class="card full">
    <h2>1️⃣ Tickets do rateio <span>cole os códigos — aceita lista, vírgulas, espaços e links do Jira</span></h2>
    <textarea id="rt-texto" class="pl-texto" style="min-height:110px" placeholder="BPRACT-848&#10;BPRACT-546 BPRACT-192, BPRACT-171&#10;https://…/browse/BPRACT-169">${esc(rt.texto)}</textarea>
    <div class="ap-vis" style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <button class="btn" id="rt-conferir" ${n&&!rt.conferindo?'':'disabled'}>🔎 Conferir no Jira</button>
      <button class="btn" id="rt-limpar" ${n||rt.total||rt.coment?'':'disabled'}>🧹 Limpar tudo</button>
      <span class="muted small" id="rt-count">${n} ticket(s) reconhecido(s)${n>=100?' — limite de 100':''}</span>
      ${rt.conferindo?'<span class="muted small">· conferindo…</span>':''}
    </div>
    ${rt.confErro?`<div class="erro" style="margin-top:8px">${esc(rt.confErro)}</div>`:''}
    ${fora.size?`<div class="aviso" style="margin-top:8px">⚠ Não encontrados no Jira (ou sem permissão): <strong>${[...fora].map(esc).join(', ')}</strong> — confira o código ou remova da lista (✕). Eles ficam <strong>fora</strong> da divisão e do apontamento.</div>`:''}
  </div>`;

  const modos=[['igual','⚖️ Igual','divide por igual entre todos'],['pct','% Percentual','cada ticket recebe um percentual das horas totais'],['fatias','🍕 Fatias','dê mais fatias a quem levou mais esforço — a divisão segue as fatias'],['manual','✏️ Manual','digite as horas de cada ticket; o total vira a soma']];
  const manual=rt.modo==='manual';
  const passo2=`<div class="card full">
    <h2>2️⃣ Horas e forma de rateio <span>a divisão fecha exata com o total — minutos inteiros, sobras para os maiores restos</span></h2>
    <div class="ap-filtros">
      <div class="campo"><label>Horas totais ${manual?'<span class="muted small">(soma dos tickets)</span>':'<span class="req">*</span>'}</label>
        <input type="text" id="rt-total" placeholder="ex.: 5h, 2h30, 45m" value="${manual?escA(fmtH(calc.total)):escA(rt.total)}" ${manual?'disabled':''}></div>
      <div class="campo"><label>Data do apontamento</label><input type="date" id="rt-data" value="${escA(rt.data)}"></div>
      <div class="campo" style="flex:1;min-width:220px"><label>Comentário <span class="muted small">(opcional — vai em todos os worklogs)</span></label>
        <input type="text" id="rt-coment" placeholder="ex.: Rateio das atividades AMS da semana" value="${escA(rt.coment)}"></div>
    </div>
    <div class="ap-vis" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><span class="muted small">Forma de rateio:</span>
      ${modos.map(([m,l,tip])=>`<button class="chip" aria-pressed="${rt.modo===m}" data-rt-modo="${m}" data-tip="${escA(tip)}">${l}</button>`).join(' ')}
      ${rt.modo==='pct'?`<button class="chip" id="rt-igualar" data-tip="Preenche todos com o mesmo percentual (fecha em 100%)">⚖️ distribuir igual</button>
      <button class="chip" id="rt-normalizar" data-tip="Mantém as proporções digitadas e ajusta para somar 100%">🎯 normalizar p/ 100%</button>`:''}
    </div>
  </div>`;

  const nRateio=Math.max(1,n-fora.size);
  const linhas=rt.tickets.map((k,i)=>{
    const inf=rt.info[k]; const seg=calc.segs[k];
    const st=inf&&inf.status?`<span class="badge ${inf.statCat==='done'?'com-horas':''}">${esc(inf.status)}</span>`:'';
    const ne=fora.has(k)?'<span class="badge rt-bad">não encontrado</span>':'';
    let controle='';
    if(fora.has(k)) controle='<span class="muted small">fora do rateio</span>';
    else if(rt.modo==='igual') controle=`<span class="muted small">1/${nRateio}</span>`;
    else if(rt.modo==='pct') controle=`<span class="rt-ctl"><input type="text" inputmode="decimal" class="rt-in" data-rt-pct="${escA(k)}" value="${escA(String(rt.pcts[k]??''))}"> %</span>`;
    else if(rt.modo==='fatias'){ const p=Math.max(0,Math.round(Number(rt.pesos[k]??1)||0));
      controle=`<span class="rt-ctl"><button class="btn rt-step" data-rt-menos="${escA(k)}" ${p<=0?'disabled':''}>−</button><b class="rt-fat">${p}</b><button class="btn rt-step" data-rt-mais="${escA(k)}">+</button> <span class="muted small">fatia(s)</span></span>`; }
    else controle=`<span class="rt-ctl"><input type="text" class="rt-in rt-in-h" data-rt-man="${escA(k)}" placeholder="1h30" value="${escA(String(rt.mans[k]??''))}"></span>`;
    const res=rt.resultados&&rt.resultados[k];
    const resHtml=res?(res.ok?`<span class="badge com-horas">✓ ${fmtH(res.seg)} apontado</span>`:`<span class="badge rt-bad" data-tip="${escA(res.erro||'')}">✗ ${esc((res.erro||'falhou').slice(0,60))}</span>`):'';
    return `<tr class="${fora.has(k)?'rt-fora':''}">
      <td><span class="rt-dot" style="background:${rtCor(i)}"></span></td>
      <td><a href="${jiraBase()}/browse/${encodeURIComponent(k)}" target="_blank" rel="noopener"><strong>${esc(k)}</strong> ↗</a>
        ${inf?`<span class="ap-resumo" style="margin-left:6px">${esc((inf.resumo||'').slice(0,90))}</span>`:''}
        ${st} ${ne}
        ${inf&&inf.pNome?`<span class="muted small" style="margin-left:6px">· ${esc(inf.pNome)}</span>`:''}</td>
      <td class="num">${controle}</td>
      <td class="num"><strong data-rt-h="${escA(k)}">${seg?fmtH(seg):'—'}</strong> <span class="muted small" data-rt-hp="${escA(k)}">${calc.total&&seg?`(${Math.round(seg/calc.total*1000)/10}%)`:''}</span></td>
      <td class="num">${resHtml}</td>
      <td class="num"><button class="btn rt-step" data-rt-rm="${escA(k)}" data-tip="Tirar este ticket da lista">✕</button></td></tr>`;
  }).join('');

  const executou=!!rt.resultados;
  const falhas=executou?rt.tickets.filter(k=>rt.resultados[k]&&!rt.resultados[k].ok):[];
  const okN=executou?rt.tickets.filter(k=>rt.resultados[k]&&rt.resultados[k].ok).length:0;
  // Depois de executar, o que "falta" são as falhas E tickets acrescentados depois
  // — reexecutar cobre os dois (os já apontados nunca repetem).
  const faltam=executou?rt.tickets.filter(k=>calc.segs[k]>=60&&!(rt.resultados[k]&&rt.resultados[k].ok)):[];
  const nValidos=n-fora.size;
  const acoes=`<div class="ap-vis" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    ${executou
      ? `${faltam.length?`<button class="btn primario" id="rt-retry" ${rt.executando?'disabled':''}>⏱ Apontar os que faltam (${faltam.length} · ${fmtH(faltam.reduce((s,k)=>s+calc.segs[k],0))})</button>`:''}
         <button class="btn" id="rt-limpar2" ${rt.executando?'disabled':''}>🧹 Novo rateio</button>`
      : `<button class="btn primario" id="rt-apontar" ${(id&&pronto.ok&&!rt.executando)?'':'disabled'}>⏱ Apontar ${fmtH(calc.total)} em ${(pronto.ativos||[]).length} ticket(s)</button>`}
    <button class="btn" id="rt-status" ${nValidos&&id&&!rt.executando?'':'disabled'} data-tip="Muda o status dos tickets da lista de uma vez (transição pelo nome, ticket a ticket — os não encontrados ficam de fora)">🔁 Alterar status em conjunto (${nValidos})</button>
    ${!id?'<span class="muted small">identifique-se acima para apontar/mover</span>'
      :`<span class="muted small" id="rt-motivo">${executou||pronto.ok?'':esc(pronto.motivo)}</span>`}
  </div>
  <div class="alx-fb ap-fb" id="rt-fb" hidden></div>
  ${executou?`<div class="${falhas.length?'aviso':'mp-aprovado'}" style="margin-top:10px">${falhas.length
    ?`⚠ ${okN} apontado(s), ${falhas.length} falha(s) — veja a coluna Resultado e use "⏱ Apontar os que faltam" para tentar de novo (os já apontados não repetem).`
    :`✓ Rateio concluído: ${okN} apontamento(s) criados em ${fmtBR(rt.data)}. Que tal <strong>🔁 alterar o status em conjunto</strong> dos tickets concluídos?`}</div>`:''}`;

  const passo3=n?`<div class="card full">
    <h2>3️⃣ Divisão e apontamento <span>confira a divisão — depois é 1 clique para apontar tudo</span></h2>
    <div id="rt-viz">${rtBarraHTML(calc)}${rtResumoHTML(calc)}</div>
    <div class="scroll-x"><table class="rt-tab"><thead><tr><th></th><th>Ticket</th><th class="num">${rt.modo==='pct'?'%':rt.modo==='fatias'?'Fatias':rt.modo==='manual'?'Horas':'Divisão'}</th><th class="num">Horas</th><th class="num">Resultado</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>
    ${acoes}
  </div>`:`<div class="card full"><div class="estado">Cole os tickets no passo 1 para montar o rateio — por exemplo, os chamados de um mesmo cliente que dividiram uma tarde de trabalho. Dica: também dá para chegar aqui pela seleção em massa da 🛠 Gestão de Tickets.</div></div>`;

  // Preserva o foco/cursor da textarea: o re-render "ao vivo" (debounce do input)
  // não pode roubar o foco de quem está digitando a lista.
  const ativo=document.activeElement; const focoTexto=!!(ativo&&ativo.id==='rt-texto');
  const selS=focoTexto?ativo.selectionStart:0, selE=focoTexto?ativo.selectionEnd:0;
  cont.replaceChildren(el(`<div>${faixaId}${passo1}${passo2}${passo3}</div>`));
  if(focoTexto){ const ta=document.getElementById('rt-texto');
    if(ta){ ta.focus(); try{ ta.setSelectionRange(selS,selE); }catch(e){} } }
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
// ---- ➗ Rateio: parsing ao vivo, modos, cálculo, execução e status em conjunto ----
// Tickets VÁLIDOS da lista (fora os "não encontrados") — base do %, do status
// em lote e dos preenchimentos automáticos.
function rtValidos(){ const fora=new Set(estado.rateio.naoEnc||[]); return estado.rateio.tickets.filter(k=>!fora.has(k)); }
// Percentuais iguais fechando em 100, SÓ nos tickets válidos.
function rtPctIgual(){
  const rt=estado.rateio; const ks=rtValidos(); if(!ks.length) return;
  const q=Math.floor(10000/ks.length)/100;
  ks.forEach((k,i)=>{ rt.pcts[k]=i?q:Math.round((100-q*(ks.length-1))*100)/100; });
}
let _rtDeb=null;
document.getElementById('conteudo').addEventListener('input',(e)=>{
  if(estado.vista!=='rateio') return;
  const rt=estado.rateio; const t=e.target; if(!t||rt.executando) return;
  if(t.id==='rt-texto'){ rt.texto=t.value;
    const nn=rtParse(rt.texto).length;
    const c=document.getElementById('rt-count');
    if(c) c.textContent=`${nn} ticket(s) reconhecido(s)${nn>=100?' — limite de 100':''}`;
    const bc=document.getElementById('rt-conferir'); if(bc) bc.disabled=!nn;
    const bl=document.getElementById('rt-limpar'); if(bl) bl.disabled=false;
    // Re-render "ao vivo" com debounce (o render preserva o foco da textarea):
    // a tabela do passo 3 acompanha a lista sem esperar o blur.
    clearTimeout(_rtDeb);
    _rtDeb=setTimeout(()=>{ if(estado.vista==='rateio'&&!estado.rateio.executando
      &&rtParse(estado.rateio.texto).join()!==estado.rateio.tickets.join()) renderRateio(); },400); }
  else if(t.id==='rt-total'){ rt.total=t.value; rtAtualizaCalculo(); }
  else if(t.id==='rt-coment'){ rt.coment=t.value; }
  else if(t.hasAttribute&&t.hasAttribute('data-rt-pct')){ rt.pcts[t.getAttribute('data-rt-pct')]=t.value; rtAtualizaCalculo(); }
  else if(t.hasAttribute&&t.hasAttribute('data-rt-man')){ rt.mans[t.getAttribute('data-rt-man')]=t.value; rtAtualizaCalculo(); }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='rateio') return;
  const rt=estado.rateio; const t=e.target; if(!t||rt.executando) return;
  if(t.id==='rt-texto'){ rt.texto=t.value;
    // Re-render só se a LISTA mudou — o change também dispara quando um outro
    // render remove a textarea focada, e renderizar de novo ali quebra o DOM.
    if(rtParse(rt.texto).join()!==rt.tickets.join()) renderRateio(); }
  else if(t.id==='rt-data'){ rt.data=t.value||hojeSP(); rtAtualizaCalculo(); }
});
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='rateio') return;
  const rt=estado.rateio; const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(rt.executando) return;   // nada de mexer no rateio com apontamentos em voo
  if(t.hasAttribute('data-rt-modo')){ const m=t.getAttribute('data-rt-modo');
    // Primeira visita ao modo percentual: pré-preenche com a divisão igual (fecha em 100).
    if(m==='pct'&&!rtValidos().some(k=>rt.pcts[k]!=null&&rt.pcts[k]!=='')) rtPctIgual();
    rt.modo=m; renderRateio(); return; }
  if(t.hasAttribute('data-rt-mais')||t.hasAttribute('data-rt-menos')){
    const k=t.getAttribute('data-rt-mais')||t.getAttribute('data-rt-menos');
    const cur=Math.max(0,Math.round(Number(rt.pesos[k]??1)||0));
    rt.pesos[k]=Math.max(0,cur+(t.hasAttribute('data-rt-mais')?1:-1));
    renderRateio(); return; }
  if(t.hasAttribute('data-rt-rm')){ const k=t.getAttribute('data-rt-rm');
    // Reescreve a lista a partir das chaves reconhecidas (evita apagar TAB-12 ao
    // remover AB-12 — a chave pode ser sufixo de outra no texto livre).
    rt.texto=rt.tickets.filter(x=>x!==k).join('\n');
    renderRateio(); return; }
  if(t.id==='rt-conferir'){ rtConfere(); return; }
  if(t.id==='rt-limpar'||t.id==='rt-limpar2'){
    Object.assign(estado.rateio,{ texto:'', tickets:[], info:{}, naoEnc:[], confErro:'',
      total:'', coment:'', modo:'igual', pesos:{}, pcts:{}, mans:{}, executando:false, resultados:null });
    renderRateio(); return; }
  if(t.id==='rt-igualar'){ rtPctIgual(); renderRateio(); return; }
  if(t.id==='rt-normalizar'){
    const ks=rtValidos();
    const pesos=ks.map(k=>Math.max(0,Number(String(rt.pcts[k]??'').replace(',','.'))||0));
    const soma=pesos.reduce((s,p)=>s+p,0);
    if(soma>0){
      ks.forEach((k,i)=>{ rt.pcts[k]=Math.round(pesos[i]/soma*10000)/100; });
      const st=ks.reduce((s,k)=>s+Number(rt.pcts[k]||0),0);
      const dif=Math.round((100-st)*100)/100;
      const k0=ks.find(k=>Number(rt.pcts[k])>0);
      if(k0!=null) rt.pcts[k0]=Math.round((Number(rt.pcts[k0])+dif)*100)/100;
    } else rtPctIgual();   // tudo vazio/zerado: normalizar vira a divisão igual
    renderRateio(); return; }
  if(t.id==='rt-apontar'||t.id==='rt-retry'){ rtExecuta(); return; }
  if(t.id==='rt-status'){ const ks=rtValidos(); if(ks.length) abreModalStatusLote(ks); return; }
});
