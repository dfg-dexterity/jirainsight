// Jira Insights · 23 · 🔀 TRANSFORMAR CHAMADO EM ATIVIDADE — sub-tarefa no destino ou apontamento com detalhes.
// ===========================================================================
// 🔀 TRANSFORMAR CHAMADO EM ATIVIDADE — pega um chamado que existe (ORIGEM) e o
// leva para dentro de OUTRO chamado (DESTINO):
//  · destino ACEITA sub-tarefa  → cria uma SUB-TAREFA no destino com o conteúdo
//    da origem e leva as horas para ela;
//  · destino NÃO aceita         → registra as horas como APONTAMENTO no próprio
//    destino, com os DETALHES (origem, resumo, quem apontou) no comentário.
// Em ambos os casos comenta na origem apontando para onde foi (e pode encerrá-la).
// Reusa as APIs que já existem: ?detalhe= (fichas), /api/projetos (tipos),
// /api/criar (sub-tarefa com parent), /api/apontar e /api/transicao.
// ===========================================================================
const RE_ISSUE_TRF=/^[A-Za-z][A-Za-z0-9_]*-\d+$/;
let _trf=null;
function abreTransformar(kOrigem){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  _trf={ origem:String(kOrigem||'').toUpperCase(), destino:'', fo:null, fd:null, tipos:null, erro:'', carregando:false, feito:null };
  trfRenderPasso1();
  if(_trf.origem) trfCarregaFicha('origem');
}
function trfRenderPasso1(){
  const t=_trf; if(!t) return;
  const ficha=(f,rot)=>!f?'':`<div class="trf-ficha"><b>${rot}: ${esc(f.k)}</b> — ${esc((f.resumo||'').slice(0,80))}
    <div class="muted small">${esc(f.t||'')} · ${esc(f.status||'')} · ${esc(f.pNome||f.p||'')}${f.worklogs&&f.worklogs.totalSeg?` · ⏱ ${fmtH(f.worklogs.totalSeg)} apontadas`:' · sem horas apontadas'}</div></div>`;
  abreModal(`<h2>🔀 Transformar chamado em atividade <span class="muted small">leve um chamado para dentro de outro</span></h2>
    <div class="muted small" style="margin-bottom:10px;line-height:1.5">Informe o chamado que <b>vai deixar de existir sozinho</b> (origem) e o chamado que <b>vai recebê-lo</b> (destino).
      Se o destino aceitar sub-tarefa, a origem vira uma <b>sub-tarefa</b> dele; se não aceitar, ela vira um <b>apontamento de horas</b> com os detalhes no comentário.</div>
    <div class="ap-filtros">
      <div class="campo"><label>Chamado de ORIGEM <span class="req">*</span></label>
        <input type="text" id="trf-origem" placeholder="ex.: RDF-123" value="${escA(t.origem)}" autocomplete="off"></div>
      <div class="campo"><label>Chamado de DESTINO <span class="req">*</span></label>
        <input type="text" id="trf-destino" placeholder="ex.: CCDV-500" value="${escA(t.destino)}" autocomplete="off"></div>
    </div>
    ${ficha(t.fo,'Origem')}${ficha(t.fd,'Destino')}
    ${t.erro?`<div class="erro" style="margin-top:8px">${esc(t.erro)}</div>`:''}
    ${t.carregando?'<div class="estado">Conferindo no Jira…</div>':''}
    <div class="alx-modal-acoes">
      <button class="btn primario" id="trf-analisar" ${t.carregando?'disabled':''}>Analisar →</button>
      <button class="btn" id="gx-fechar">Cancelar</button></div>`);
}
// Busca a ficha (?detalhe=) da origem/destino e, no destino, os tipos do projeto.
function trfCarregaFicha(qual){
  const t=_trf; if(!t) return;
  const k=(qual==='origem'?t.origem:t.destino);
  if(!RE_ISSUE_TRF.test(k)) return;
  t.carregando=true; t.erro=''; trfRenderPasso1();
  const ps=[fetch(`/api/vencimentos?detalhe=${encodeURIComponent(k)}`).then(r=>r.json())];
  if(qual==='destino') ps.push(garanteProjetos().catch(()=>[]));
  Promise.all(ps).then(([j,projs])=>{
    if(!_trf) return;
    t.carregando=false;
    if(!j||j.erro){ t.erro=`${k}: ${(j&&j.erro)||'não encontrado.'}`; if(qual==='origem') t.fo=null; else t.fd=null; trfRenderPasso1(); return; }
    if(qual==='origem'){ t.fo=j; trfRenderPasso1(); if(t.destino) trfCarregaFicha('destino'); return; }
    t.fd=j;
    const pj=(projs||[]).find(p=>p.key===j.p);
    t.tipos=(pj&&pj.tipos)||[];
    trfRenderPasso2();
  }).catch(e=>{ if(!_trf) return; t.carregando=false; t.erro='Erro de rede: '+String(e.message||e); trfRenderPasso1(); });
}
// Decide o caminho: sub-tarefa só se o DESTINO for um item comum (não sub-tarefa,
// não épico) E o projeto dele tiver um tipo de sub-tarefa habilitado.
function trfPlano(){
  const t=_trf; if(!t||!t.fo||!t.fd) return null;
  const tipoSub=(t.tipos||[]).find(x=>x.subtarefa);
  const dEhSub=(t.tipos||[]).some(x=>x.subtarefa&&String(x.nome||'').toLowerCase()===String(t.fd.t||'').toLowerCase());
  const dEhEpico=/epic|épico/i.test(t.fd.t||'');
  const podeSub=!!tipoSub&&!dEhSub&&!dEhEpico;
  const motivo=podeSub?''
    :(dEhSub?'o destino já é uma sub-tarefa (sub-tarefa não tem filha)'
      :(dEhEpico?'o destino é um épico (épico não recebe sub-tarefa direta)'
        :'o projeto do destino não tem tipo de sub-tarefa habilitado'));
  return { podeSub, tipoSub, motivo, segOrigem:((t.fo.worklogs||{}).totalSeg)||0 };
}
function trfRenderPasso2(){
  const t=_trf; if(!t) return; const p=trfPlano(); if(!p){ trfRenderPasso1(); return; }
  const wl=(t.fo.worklogs||{porPessoa:[],ultimos:[],totalSeg:0});
  const quem=(wl.porPessoa||[]).map(x=>`${x.nome} (${fmtH(x.seg)})`).join(' · ');
  const cabec=p.podeSub
    ? `<div class="trf-plano ok"><b>✅ O destino aceita sub-tarefa.</b><br>Vou criar a sub-tarefa <b>“${esc((t.fo.resumo||t.fo.k).slice(0,70))}”</b> dentro de <b>${esc(t.fd.k)}</b> (tipo <b>${esc((p.tipoSub||{}).nome||'Sub-tarefa')}</b>)${p.segOrigem?` e lançar <b>${fmtH(p.segOrigem)}</b> nela`:''}.</div>`
    : `<div class="trf-plano aten"><b>⏱ O destino NÃO aceita sub-tarefa</b> — ${esc(p.motivo)}.<br>Então as horas entram como <b>apontamento direto em ${esc(t.fd.k)}</b>, com os detalhes da origem no comentário.</div>`;
  abreModal(`<h2>🔀 ${esc(t.fo.k)} → ${esc(t.fd.k)} <span class="muted small">transformar chamado em atividade</span></h2>
    ${cabec}
    <div class="trf-cols">
      <div class="trf-ficha"><b>Origem · ${esc(t.fo.k)}</b><div>${esc((t.fo.resumo||'').slice(0,90))}</div>
        <div class="muted small">${esc(t.fo.t||'')} · ${esc(t.fo.status||'')} · ${esc(t.fo.pNome||t.fo.p||'')}</div>
        <div class="muted small">${p.segOrigem?`⏱ <b>${fmtH(p.segOrigem)}</b> apontadas${quem?` — ${esc(quem)}`:''}`:'sem horas apontadas'}</div></div>
      <div class="trf-ficha"><b>Destino · ${esc(t.fd.k)}</b><div>${esc((t.fd.resumo||'').slice(0,90))}</div>
        <div class="muted small">${esc(t.fd.t||'')} · ${esc(t.fd.status||'')} · ${esc(t.fd.pNome||t.fd.p||'')}</div></div>
    </div>
    <div class="ap-filtros" style="margin-top:10px">
      <div class="campo" style="flex:1;min-width:220px"><label>Título da atividade</label>
        <input type="text" id="trf-titulo" value="${escA((t.fo.resumo||t.fo.k).slice(0,120))}"></div>
      <div class="campo"><label>Horas a transferir <span class="muted small">(vazio = não apontar)</span></label>
        <input type="text" id="trf-horas" placeholder="ex.: 2h30" value="${escA(p.segOrigem?fmtH(p.segOrigem):'')}"></div>
      <div class="campo"><label>Data do apontamento</label><input type="date" id="trf-data" value="${escA(hojeSP())}"></div>
    </div>
    <label class="check"><input type="checkbox" id="trf-comentar" checked> Comentar na <b>origem</b> dizendo para onde foi</label>
    <label class="check"><input type="checkbox" id="trf-encerrar"> Encerrar a origem depois (move para “Concluído”, se o fluxo permitir)</label>
    <div class="alx-fb ap-fb" id="trf-fb" hidden></div>
    <div class="alx-modal-acoes">
      <button class="btn primario" id="trf-executar">${p.podeSub?'✅ Criar sub-tarefa e transferir':'⏱ Apontar no destino e registrar'}</button>
      <button class="btn" id="trf-voltar">‹ Trocar chamados</button>
      <button class="btn" id="gx-fechar">Cancelar</button></div>`);
}
async function trfExecuta(){
  const t=_trf; const id=idApontar(); if(!t||!id) return;
  const p=trfPlano(); if(!p) return;
  const titulo=((document.getElementById('trf-titulo')||{}).value||'').trim()||t.fo.resumo||t.fo.k;
  const seg=parseTempo(((document.getElementById('trf-horas')||{}).value||'').trim());
  const data=((document.getElementById('trf-data')||{}).value||'')||hojeSP();
  const comentarOrigem=!!(document.getElementById('trf-comentar')||{}).checked;
  const encerrar=!!(document.getElementById('trf-encerrar')||{}).checked;
  const fb=document.getElementById('trf-fb'); const bt=document.getElementById('trf-executar');
  const diz=(txt,cls)=>{ if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb'+(cls?' '+cls:''); fb.innerHTML=txt; } };
  if(seg!=null&&(seg<60||seg>24*3600)){ diz('Tempo inválido — use 1h30, 45m ou 2:15 (mínimo 1m, máximo 24h).','erro'); return; }
  if(bt) bt.disabled=true;
  const passos=[]; let alvo=t.fd.k; let novaKey='';
  // Detalhes da origem que viajam junto (worklogs por pessoa + resumo).
  const wl=(t.fo.worklogs||{porPessoa:[]});
  const detalhes=[`Origem: ${t.fo.k} — ${t.fo.resumo||''}`,
    `Tipo/status na origem: ${t.fo.t||'—'} · ${t.fo.status||'—'}`,
    (wl.porPessoa||[]).length?`Horas apontadas na origem: ${(wl.porPessoa||[]).map(x=>`${x.nome} ${fmtH(x.seg)}`).join(' · ')} (total ${fmtH(wl.totalSeg||0)})`:'Origem sem horas apontadas.',
    `Transformado em atividade por ${id.nome||id.email} em ${fmtBR(hojeSP())} pelo painel Jira Insights.`].join('\n');
  try{
    // 1) sub-tarefa (quando o destino aceita)
    if(p.podeSub){
      diz('Criando a sub-tarefa no destino…');
      const desc=`${(t.fo.desc||'').slice(0,3000)}\n\n---\n${detalhes}`;
      const j=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({itens:[{projeto:t.fd.p, tipoId:(p.tipoSub||{}).id, resumo:titulo.slice(0,240),
          descricao:desc, paiKey:t.fd.k}], email:id.email, token:id.token})}).then(r=>r.json());
      const cr=(j&&j.criados&&j.criados[0])||null;
      if(!cr){ const er=(j&&j.erros&&j.erros[0]&&j.erros[0].erro)||(j&&j.erro)||'falha ao criar a sub-tarefa';
        diz(`⚠ ${esc(er)}`,'erro'); if(bt) bt.disabled=false; return; }
      novaKey=cr.key; alvo=cr.key; passos.push(`✓ Sub-tarefa <b>${esc(novaKey)}</b> criada em ${esc(t.fd.k)}`);
    }
    // 2) horas no alvo (sub-tarefa nova ou o próprio destino)
    if(seg!=null&&seg>=60){
      diz(`Apontando ${fmtH(seg)} em ${alvo}…`);
      const coment=p.podeSub?`Horas transferidas de ${t.fo.k}.`:`${titulo}\n\n${detalhes}`;
      const ja=await fetch('/api/apontar',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({issue:alvo, segundos:seg, inicio:data, comentario:coment, email:id.email, token:id.token})}).then(r=>r.json());
      if(ja&&ja.ok){ passos.push(`✓ <b>${fmtH(seg)}</b> apontadas em ${esc(alvo)} (${esc(fmtBR(data))})`);
        registraExtraDia(data,seg,alvo); logAcao({acao:'apontar',t:alvo,para:fmtH(seg),ok:true},false); }
      else passos.push(`⚠ Apontamento em ${esc(alvo)}: ${esc((ja&&ja.erro)||'falhou')}`);
    }
    // 3) sem sub-tarefa: os detalhes ficam registrados no próprio destino
    if(!p.podeSub){
      diz('Registrando os detalhes no destino…');
      const texto=`🔀 Atividade incorporada: ${titulo}\n\n${detalhes}`;
      const jc=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({comentar:true, issue:t.fd.k, texto, email:id.email, token:id.token})}).then(r=>r.json());
      passos.push(jc&&jc.ok?`✓ Detalhes registrados em ${esc(t.fd.k)}`:`⚠ Comentário no destino: ${esc((jc&&jc.erro)||'falhou')}`);
    }
    // 4) comentário na origem
    if(comentarOrigem){
      const texto=novaKey
        ? `🔀 Este chamado virou a sub-tarefa ${novaKey}, dentro de ${t.fd.k}. Acompanhe por lá.`
        : `🔀 Este chamado foi incorporado ao ${t.fd.k}${seg?` (${fmtH(seg)} apontadas lá)`:''}. Acompanhe por lá.`;
      const jo=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({comentar:true, issue:t.fo.k, texto, email:id.email, token:id.token})}).then(r=>r.json());
      passos.push(jo&&jo.ok?`✓ Origem ${esc(t.fo.k)} comentada`:`⚠ Comentário na origem: ${esc((jo&&jo.erro)||'falhou')}`);
    }
    // 5) encerrar a origem (transição da categoria "done", se existir)
    if(encerrar){
      diz('Encerrando a origem…');
      const lj=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({listar:true, issue:t.fo.k, email:id.email, token:id.token})}).then(r=>r.json());
      const tr=((lj&&lj.transicoes)||[]).find(x=>x.categoria==='done');
      if(!tr) passos.push(`⚠ A origem não tem transição de conclusão disponível no status atual`);
      else{
        const ej=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({issue:t.fo.k, transitionId:tr.id, email:id.email, token:id.token})}).then(r=>r.json());
        passos.push(ej&&ej.ok?`✓ Origem movida para <b>${esc(tr.para||'Concluído')}</b>`:`⚠ Encerrar a origem: ${esc((ej&&ej.erro)||'falhou')}`);
      }
    }
    invalidaCacheDados(); estado.apontar.porData={};
    const houveFalha=passos.some(x=>x.startsWith('⚠'));
    _trf.feito=passos;
    abreModal(`<h2>🔀 ${esc(t.fo.k)} → ${esc(t.fd.k)}</h2>
      <div class="${houveFalha?'aviso':'mp-aprovado'}">${houveFalha?'Concluído com avisos:':'Tudo certo!'}</div>
      <ul class="small" style="margin:10px 0 0;padding-left:18px;line-height:1.7">${passos.map(x=>`<li>${x}</li>`).join('')}</ul>
      <div class="alx-modal-acoes">
        ${novaKey?`<a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(novaKey)}" target="_blank" rel="noopener">Abrir ${esc(novaKey)} ↗</a>`:''}
        <a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(t.fd.k)}" target="_blank" rel="noopener">Abrir ${esc(t.fd.k)} ↗</a>
        <button class="btn primario" id="trf-nova">🔀 Transformar outro</button>
        <span class="spacer"></span><button class="btn" id="gx-fechar">Fechar</button></div>`);
    toast(houveFalha?'Transformação concluída com avisos — confira o detalhe.':`✓ ${t.fo.k} transformado em atividade de ${t.fd.k}.`, houveFalha?'warn':'ok');
    if(estado.vista==='gestao') renderGestao();
  }catch(e){ diz('Erro de rede: '+esc(String(e.message||e)),'erro'); if(bt) bt.disabled=false; }
}
