// Jira Insights · 20b · 🧭 PENDÊNCIAS DO PROJETO — a visão do gerente (2026-09-28, a pedido do usuário).
// Responde "o que cada pessoa precisa atualizar nesta semana?": vencidos POR PESSOA, parados sem atualização,
// vencendo sem movimento, cadastro incompleto, sem apontamento e reuniões vencidas — e a COBRANÇA já pronta:
// mensagem para copiar, chat do Teams, comentário no Jira em lote (token da própria pessoa) e aviso no Inbox.
// Os dados são os mesmos do 📈 Analytics (/api/vencimentos?analytics=1, restrito por &projetos=) e as regras
// dos blocos são as dos ANL_CHECKS (19) — é isso que deixa o "Δ vs sexta passada" comparável com a foto do
// 📊 Relatório semanal (?semanal=1&n=1, contrato v1). Filtros na URL: ?v=gp&proj=KEY[,KEY]&resp=<accountId>&dias=N.
// O estado da tela nasce aqui (e não no literal de `estado` do 01) para a tela entrar sem mexer no núcleo.
estado.gp={ proj:'', resp:'', dias:null, meus:null, semVenc:true, dados:null, chave:'', carregando:false, erro:'',
  cache:{}, foto:null, fotoB:false, fotoOk:null, catB:false };
const GP_LINK='https://jirainsight.vercel.app/';   // o mesmo endereço que o servidor usa nas DMs do Teams
const GP_DIAS_KEY='jirainsight_gp_dias_v1';        // "parado há ≥ N dias" lembrado só neste navegador
const GP_CACHE_MIN=3;
// Tipos e resoluções: as MESMAS regexes do 📈 Analytics (ANL_RE_* em 19) — um critério só para "reunião",
// "agrupador" (épico/história) e "descarte" (cancelado/duplicado), senão o Δ vs a foto não fecha.
// ---- Parâmetros ----
// Padrão de "parado": o da config do relatório semanal (cfg.relSemanal.parado), senão 5 — leitor, não cria o objeto.
function gpDiasPadrao(){ const r=cfg.relSemanal; const n=r&&Number(r.parado); return (n>0&&n<=60)?n:5; }
function gpDias(){ const gp=estado.gp; if(gp.dias) return gp.dias;
  try{ const n=Number(localStorage.getItem(GP_DIAS_KEY)); if(n>=1&&n<=60) return n; }catch(e){}
  return gpDiasPadrao(); }
function gpDiasSet(n){ n=Math.max(1,Math.min(60,Math.round(Number(n)||0)))||gpDiasPadrao(); estado.gp.dias=n;
  try{ localStorage.setItem(GP_DIAS_KEY,String(n)); }catch(e){} }
function gpMeusKeys(){ const id=idApontar(); return (id&&id.accountId)?meusProjetos(id.accountId):[]; }
// "Meus projetos" é o padrão quando a pessoa é gerente de algum; sem projeto seu, o escopo é tudo.
function gpMeusAtivo(){ const gp=estado.gp; if(!gpMeusKeys().length) return false; return gp.meus==null?true:!!gp.meus; }
// O que o chip 👤 EXIBE: "Meus projetos" só está ligado quando nenhum projeto foi escolhido por cima. O clique alterna
// em relação a isto (e não a gpMeusAtivo): com FIX1 escolhido e meus ainda nulo, o chip aparece desligado e clicar
// nele tem que RELIGAR os meus — não abrir "todos os projetos" (a base inteira do Analytics, 8 páginas do Jira).
function gpMeusLigado(){ return gpMeusAtivo()&&!estado.gp.proj; }
// Escopo: lista de chaves (projeto escolhido, ou os meus) ou null (= todos os projetos).
function gpEscopo(){ const gp=estado.gp; if(gp.proj) return gp.proj.split(',').filter(Boolean);
  if(gpMeusAtivo()) return gpMeusKeys().slice().sort(); return null; }
function gpDiasFetch(){ return Math.min(90,Math.max(7,gpDias())); }   // janela dos concluídos (o servidor aceita 7–90)
function gpChave(){ const ks=gpEscopo(); return `${gpDiasFetch()}|${ks?ks.join(','):'*'}`; }
// ---- Dados ----
// A base é a do Analytics, restrita aos projetos do escopo (menos páginas no Jira); 3 min de cache por escopo.
function gpCarrega(forca){
  const gp=estado.gp; const chave=gpChave(); const ks=gpEscopo();
  const c=gp.cache[chave];
  if(!forca&&c&&(Date.now()-c.em)<GP_CACHE_MIN*60000){ gp.dados=c.dados; gp.chave=chave; gp.erro=''; return; }
  if(gp.carregando===chave) return;
  gp.carregando=chave; gp.erro='';
  fetch(`/api/vencimentos?analytics=1&dias=${gpDiasFetch()}${ks?`&projetos=${encodeURIComponent(ks.join(','))}`:''}${forca?'&nocache=1':''}`)
    .then(r=>r.json()).then(j=>{ if(gp.carregando===chave) gp.carregando=false;
      if(!j||j.erro){ gp.erro=(j&&j.erro)||'resposta vazia'; }
      else { gp.cache[chave]={ dados:j, em:Date.now() }; if(gpChave()===chave){ gp.dados=j; gp.chave=chave; } }
      if(estado.vista==='gp') renderGp();
      if(typeof renderAbas==='function') try{ renderAbas(); }catch(e){}   // 🔢 contador da aba
    }).catch(e=>{ if(gp.carregando===chave) gp.carregando=false; gp.erro=humanizaErro(e); if(estado.vista==='gp') renderGp(); });
}
// A última foto de sexta (📊 Relatório semanal) só serve para o Δ: sem identidade, 401/404 ou rota ausente → segue sem ela.
function gpCarregaFoto(){
  const gp=estado.gp; const id=idApontar();
  if(gp.fotoB||gp.fotoOk!=null) return;
  if(!id){ gp.fotoOk=false; return; }
  gp.fotoB=true;
  fetch('/api/config?semanal=1&n=1',{ headers:mpHeaders() }).then(r=>r.ok?r.json():null).then(j=>{
    gp.fotoB=false; const f=j&&Array.isArray(j.semanas)?j.semanas[0]:null;
    gp.foto=(f&&f.v===1&&f.projetos)?f:null; gp.fotoOk=!!gp.foto;
    if(estado.vista==='gp') renderGp();
  }).catch(()=>{ gp.fotoB=false; gp.fotoOk=false; });
}
function gpDiasDesde(hoje,iso){ const d=String(iso||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return Math.max(0,Math.round((new Date(hoje)-new Date(d))/86400000)); }
const gpRespKey=(t)=>t.respId||'__sem__';
// ---- Cálculo (uma passada por render; ≤ 800 tickets) ----
function gpCalc(){
  const gp=estado.gp; const d=gp.dados; if(!d) return null;
  const hoje=(d.meta&&d.meta.hoje)||hojeSP(); const N=gpDias(); const keys=gpEscopo();
  const ks=keys?new Set(keys):null; const rc=relCtxAtivo('gp');
  const passa=(t)=>(!ks||ks.has(t.p))&&(!rc||relProjOk(t.p));
  const porResp=(t)=>!gp.resp||(gp.resp==='__sem__'?!t.respId:t.respId===gp.resp);
  const Aall=(d.abertos||[]).filter(passa); const A=Aall.filter(porResp);
  const C=(d.concluidos||[]).filter(passa).filter(porResp);
  const up=(t)=>{ const n=gpDiasDesde(hoje,t.up); return n==null?999:n; };
  const agrup=(t)=>ANL_RE_AGRUP.test(t.t||'');
  const ate7=somaDias(hoje,7);
  const b={
    vencidos:A.filter(t=>t.venc&&t.venc<hoje).sort((x,y)=>x.venc<y.venc?-1:1),
    parados:A.filter(t=>t.statCat==='indeterminate'&&up(t)>=N).sort((x,y)=>up(y)-up(x)),
    vencem:A.filter(t=>t.venc&&t.venc>=hoje&&t.venc<=ate7&&up(t)>=N).sort((x,y)=>x.venc<y.venc?-1:1),
    semVenc:gp.semVenc?A.filter(t=>!t.venc&&!agrup(t)):[],
    semResp:A.filter(t=>!t.respId),
    estZero:A.filter(t=>t.statCat==='indeterminate'&&!(t.est>0)&&!agrup(t)&&!ANL_RE_REU.test(t.t||'')&&!ANL_RE_ROTINA.test(t.t||'')),
    semDesc:A.filter(t=>!agrup(t)&&(t.descLen||0)<40),
    mexidos:A.filter(t=>t.statCat==='indeterminate'&&!(t.seg>0)&&!agrup(t)&&up(t)<N),
    conclSem:C.filter(t=>!(t.seg>0)&&!agrup(t)&&!ANL_RE_DESCARTE.test(t.resol||'')),
    reunioes:A.filter(t=>ANL_RE_REU.test(t.t||'')&&t.venc&&t.venc<hoje).sort((x,y)=>x.venc<y.venc?-1:1),
  };
  const cad=new Set([...b.semVenc,...b.semResp,...b.estZero,...b.semDesc].map(t=>t.k));
  const projs=[...new Set(Aall.map(t=>t.p))].sort();
  const rotProj=keys?(keys.length===1?projNomeCod(keys[0]):keys.join(', ')):'todos os projetos';
  // Δ vs sexta passada: soma dos projetos do escopo na foto (ou a linha da pessoa, quando filtrada).
  const F=gp.foto; let ant=null;
  if(F&&F.projetos){
    const fk=Object.keys(F.projetos).filter(k=>!ks||ks.has(k));
    if(fk.length){ ant={ vencidos:0, parados:0, semVenc:0, semResp:0, estZero:0, semDesc:0, reunioes:0 }; const ap=gp.resp&&gp.resp!=='__sem__';
      fk.forEach(k=>{ const P=F.projetos[k]||{}; if(ap){ const pp=(P.porPessoa||{})[gp.resp]||{}; ant.vencidos+=pp.vencidos||0; ant.parados+=pp.parados||0; }
        else { ant.vencidos+=P.vencidos||0; ant.parados+=P.parados||0; ant.semVenc+=P.semVenc||0; ant.semResp+=P.semResp||0; ant.estZero+=P.estZero||0; ant.semDesc+=P.semDesc||0; ant.reunioes+=P.reunioesVencidas||0; } });
      if(ap){ ant.semVenc=null; ant.semResp=null; ant.estZero=null; ant.semDesc=null; ant.reunioes=null; } }
  }
  return { hoje, N, keys, ks, A, Aall, C, b, cad, projs, rotProj, ant, up, foto:F };
}
// Agrupa por responsável, pior caso primeiro (o pior item de cada pessoa, depois a quantidade).
function gpPorPessoa(lista, peso){
  const m=new Map();
  lista.forEach(t=>{ const a=gpRespKey(t); const g=m.get(a)||{ a, nome:t.resp||'sem responsável', itens:[], pior:0 };
    g.itens.push(t); g.pior=Math.max(g.pior,peso?peso(t):0); m.set(a,g); });
  return [...m.values()].sort((x,y)=>(y.pior-x.pior)||(y.itens.length-x.itens.length)||x.nome.localeCompare(y.nome,'pt'));
}
function gpNomeDe(c,a){ if(a==='__sem__') return 'sem responsável';
  const t=c.Aall.find(x=>x.respId===a); if(t&&t.resp) return t.resp;
  const p=pessoasUnidas()[a]; return (p&&p.nome)||a; }
function gpEmailDe(a){ const p=pessoasUnidas()[a]; return (p&&p.email)||''; }
// As pendências de UMA pessoa, sem repetir ticket entre categorias (vencido > parado > vence > sem data).
function gpPendPessoa(c,a){
  const de=(l)=>l.filter(t=>gpRespKey(t)===a); const visto=new Set();
  const pega=(l)=>de(l).filter(t=>{ if(visto.has(t.k)) return false; visto.add(t.k); return true; });
  const vencidos=pega(c.b.vencidos), parados=pega(c.b.parados), vencem=pega(c.b.vencem), semData=pega(c.b.semVenc);
  const keys=[...visto]; const n=keys.length;
  const det=[vencidos.length?`${vencidos.length} vencido(s)`:'', parados.length?`${parados.length} parado(s)`:'', vencem.length?`${vencem.length} vencendo`:'', semData.length?`${semData.length} sem data`:''].filter(Boolean).join(' · ');
  return { a, nome:gpNomeDe(c,a), vencidos, parados, vencem, semData, keys, n, det };
}
// O link vai para dentro de uma mensagem: montado à mão para a vírgula e o ":" do accountId ficarem legíveis.
function gpLinkPessoa(keys,a){ let qs='v=gp'; if(keys&&keys.length) qs+='&proj='+keys.join(','); if(a&&a!=='__sem__') qs+='&resp='+encodeURIComponent(a).replace(/%3A/gi,':');
  return { qs, url:GP_LINK+'?'+qs }; }
const gpDataCurta=(iso)=>iso?`${iso.slice(8,10)}/${iso.slice(5,7)}`:'';
function gpListaKeys(arr, fn){ const max=6; const l=arr.slice(0,max).map(fn); if(arr.length>max) l.push(`+${arr.length-max}`); return l.join(', '); }
// Texto pronto para colar no chat: o que está pendente, com as chaves, e o link já filtrado na pessoa.
function gpMensagem(c,a){
  const pp=gpPendPessoa(c,a); const partes=[];
  if(pp.vencidos.length) partes.push(`${pp.vencidos.length} vencido${pp.vencidos.length>1?'s':''} (${gpListaKeys(pp.vencidos,t=>`${t.k} venceu em ${gpDataCurta(t.venc)}`)})`);
  if(pp.parados.length) partes.push(`${pp.parados.length} parado${pp.parados.length>1?'s':''} (${gpListaKeys(pp.parados,t=>`${t.k} há ${c.up(t)} dias`)})`);
  if(pp.vencem.length) partes.push(`${pp.vencem.length} vencendo até ${gpDataCurta(pp.vencem[pp.vencem.length-1].venc)} sem movimento (${gpListaKeys(pp.vencem,t=>t.k)})`);
  if(pp.semData.length) partes.push(`${pp.semData.length} sem data (${gpListaKeys(pp.semData,t=>t.k)})`);
  const onde=c.keys?(c.keys.length===1?`no projeto ${projNomeCod(c.keys[0])}`:`nos projetos ${c.keys.join(', ')}`):'nos projetos';
  return `${pp.nome.split(' ')[0]}, ${onde}: ${partes.join(', ')}. Pode atualizar data, status e apontamento até segunda? Lista: ${gpLinkPessoa(c.keys,a).url}`;
}
function gpResumoTexto(c){
  const porP=(l)=>{ const g=gpPorPessoa(l); return g.length?` (${g.slice(0,5).map(x=>`${x.a==='__sem__'?'sem responsável':x.nome.split(' ')[0]} ${x.itens.length}`).join(', ')}${g.length>5?', …':''})`:''; };
  const L=[`🧭 Pendências — ${c.rotProj} — ${dataBR(c.hoje)}`,
    `⏰ Vencidos: ${c.b.vencidos.length}${porP(c.b.vencidos)}`,
    `🧊 Parados há ≥ ${c.N} dias: ${c.b.parados.length}${porP(c.b.parados)}`,
    `⏳ Vencem em 7 dias sem movimento: ${c.b.vencem.length}${porP(c.b.vencem)}`,
    `📝 Cadastro incompleto: ${c.cad.size} (sem data ${c.b.semVenc.length} · sem responsável ${c.b.semResp.length} · sem estimativa ${c.b.estZero.length} · descrição curta ${c.b.semDesc.length})`,
    `⏱ Sem apontamento: ${c.b.mexidos.length} mexido(s) sem horas · ${c.b.conclSem.length} concluído(s) sem horas`,
    `📅 Reuniões vencidas: ${c.b.reunioes.length}`];
  if(c.foto&&c.keys) c.keys.forEach(k=>{ const P=c.foto.projetos[k]; if(!P) return;
    L.push(`📊 ${k} · semana ${dataBR(c.foto.semana)}–${dataBR(c.foto.ate)}: planejado ${fmtH(P.plan||0)} · orçado ${fmtH(P.orc||0)} · realizado ${fmtH(P.real||0)}${P.consumo!=null?` · consumo ${P.consumo}%`:''}`); });
  L.push(`Lista: ${gpLinkPessoa(c.keys,'').url}`);
  return L.join('\n');
}
function gpCopia(txt, ok){
  const fb=()=>{ try{ prompt('Copie o texto:', txt); }catch(e){} };
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(()=>toast(ok||'📋 Copiado.','ok')).catch(fb); else fb();
}
// ---- 📣 Comentar no Jira em lote (modelo "Cobrar atualização", @menção, token da própria pessoa) ----
let _gpCom=null;
function gpAbreComentar(a){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const c=gpCalc(); if(!c) return; const pp=gpPendPessoa(c,a); if(!pp.n){ toast('Nada pendente para esta pessoa.','warn'); return; }
  const tpl=(GX_TPLS.find(x=>x[0]==='cobrar')||[])[2]||'';
  const item=(t,rot)=>`<li><label style="display:flex;gap:7px;align-items:baseline;cursor:pointer"><input type="checkbox" class="gp-com-chk" data-k="${escA(t.k)}" checked>
    <span><strong>${esc(t.k)}</strong> — ${esc((t.resumo||'').slice(0,70))} <span class="muted small">${esc(rot)}</span></span></label></li>`;
  const itens=pp.vencidos.map(t=>item(t,`venceu ${alxDataBR(t.venc)}`)).concat(pp.parados.map(t=>item(t,`parado há ${c.up(t)}d`)),pp.vencem.map(t=>item(t,`vence ${alxDataBR(t.venc)}`)),pp.semData.map(t=>item(t,'sem data'))).join('');
  _gpCom={ a, nome:pp.nome };
  abreModal(`<h2>📣 Comentar no Jira · ${esc(pp.nome)} <span class="muted small">${pp.n} ticket(s)</span></h2>
    <div class="muted small">O comentário sai no <strong>seu</strong> usuário e marca <strong>@${esc(pp.nome)}</strong> em cada ticket — o Jira notifica. Modelo "Cobrar atualização"; edite à vontade.</div>
    <ul style="list-style:none;margin:8px 0 0;padding:0;max-height:200px;overflow:auto">${itens}</ul>
    <div class="alx-campo"><label>Comentário <span class="req">*</span></label><textarea class="alx-coment" id="gp-com-texto">${esc(tpl)}</textarea></div>
    <div class="alx-fb" id="gp-com-fb" hidden></div>
    <div class="alx-modal-acoes"><button class="btn primario" id="gp-com-confirmar">Publicar em ${pp.n} ticket(s)</button><button class="btn" id="gx-fechar">Cancelar</button></div>`);
}
async function gpComentaLote(){
  const ctx=_gpCom; const id=idApontar(); if(!ctx||!id) return;
  const texto=((document.getElementById('gp-com-texto')||{}).value||'').trim();
  const keys=[...document.querySelectorAll('#modal-body .gp-com-chk:checked')].map(x=>x.getAttribute('data-k'));
  const fb=document.getElementById('gp-com-fb'); const bt=document.getElementById('gp-com-confirmar');
  const erro=(m)=>{ if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb erro'; fb.textContent=m; } };
  if(!texto) return erro('Escreva o comentário.'); if(!keys.length) return erro('Marque ao menos um ticket.');
  if(bt) bt.disabled=true;
  const men=ctx.a&&ctx.a!=='__sem__'?{ mencionar:[ctx.a] }:{};
  let ok=0; const linhas=[];
  for(const k of keys){
    if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb'; fb.textContent=`Comentando ${k}… (${ok+linhas.length+1}/${keys.length})`; }
    try{
      const r=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({comentar:true,issue:k,texto,...men,email:id.email,token:id.token})}).then(x=>x.json());
      if(r&&r.ok){ ok++; logAcao({acao:'gp-cobrar-jira', t:k, para:ctx.nome, ok:true}, false); }
      else { linhas.push(`${k}: ${(r&&r.erro)||'falhou'}`); logAcao({acao:'gp-cobrar-jira', t:k, para:ctx.nome, ok:false}, false); }
    }catch(e){ linhas.push(`${k}: ${e.message||e}`); }
  }
  salvaCfg();   // uma gravação para o lote inteiro (o log de ações)
  if(fb){ fb.className='alx-fb ap-fb '+(linhas.length?'erro':'ok'); fb.innerHTML=`${ok?`✓ Comentário publicado em ${ok} ticket(s), com @${esc(ctx.nome)}.`:''}${linhas.length?`<br>⚠ ${linhas.map(esc).join('<br>')}`:''}`; }
  if(bt){ bt.textContent='Fechar'; bt.disabled=false; bt.id='gx-fechar'; }
}
// ---- 📥 Aviso no Inbox do app (cfg.inboxAvisos[pessoa], padrão da Agenda; máx. 30; reenvio substitui) ----
// Não grava: quem chama faz salvaCfg() uma vez por lote.
function gpGravaAviso(c,a){
  const id=idApontar()||{}; const pp=gpPendPessoa(c,a); if(!pp.n||a==='__sem__') return null;
  cfg.inboxAvisos=cfg.inboxAvisos||{};
  const lst=cfg.inboxAvisos[a]=cfg.inboxAvisos[a]||[];
  const evId='gp:'+(c.keys?c.keys.join(','):'*');
  const i=lst.findIndex(x=>x&&x.evId===evId); if(i>=0) lst.splice(i,1);
  lst.push({ evId, gp:true, titulo:`🧭 ${pp.n} pendência(s) — ${c.rotProj}`, det:pp.det, link:gpLinkPessoa(c.keys,a).qs,
    dia:c.hoje, de:id.nome||id.email||'', quando:new Date().toISOString() });
  if(lst.length>30) lst.splice(0,lst.length-30);
  logAcao({acao:'gp-avisar-inbox', t:c.rotProj, para:pp.nome, ok:true}, false);
  return pp;
}
function gpAvisaInbox(lista){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const c=gpCalc(); if(!c) return;
  const feitos=lista.map(a=>gpGravaAviso(c,a)).filter(Boolean);
  if(!feitos.length){ toast('Ninguém com pendência para avisar.','warn'); return; }
  salvaCfg();
  toast(`📥 Aviso no Inbox de ${feitos.length===1?feitos[0].nome:feitos.length+' pessoa(s)'} — some sozinho quando a pessoa dispensar.`,'ok');
  renderGp();
}
// Pessoas com pendência (para "avisar todos") — sem responsável fica de fora.
function gpPessoasPend(c){ return [...new Set([...c.b.vencidos,...c.b.parados,...c.b.vencem,...c.b.semVenc].map(gpRespKey))].filter(a=>a!=='__sem__'); }
// 🛠 Os mesmos tickets na Gestão (soKeys + origem, todos selecionados — o caminho do 📁 drill dos Projetos).
function gpAbreGestao(c){
  const keys=[...new Set([...c.b.vencidos,...c.b.parados,...c.b.vencem,...c.b.semVenc,...c.b.semResp,...c.b.estZero,...c.b.semDesc,...c.b.reunioes].map(t=>t.k))];
  if(!keys.length){ toast('Nada pendente para levar à Gestão.','warn'); return; }
  const g=estado.gestao; g.soKeys=keys; g.origem=`🧭 Pendências — ${c.rotProj}`;
  g.preset=''; g.busca=''; g.fProj=''; g.fResp=''; g.fStatus=''; g.semTrat=false; g.sel={}; keys.forEach(k=>{ g.sel[k]=true; });
  vaiPara('gestao');
}
// Abre a tela a partir de um link interno (aviso do Inbox): v=gp&proj=…&resp=…
function gpAbreLink(qs){
  const p=new URLSearchParams(String(qs||'')); const gp=estado.gp;
  const pj=(p.get('proj')||'').toUpperCase(); gp.proj=/^[A-Z][A-Z0-9_]*(,[A-Z][A-Z0-9_]*)*$/.test(pj)?pj:''; if(gp.proj) gp.meus=false;
  const rs=p.get('resp')||''; gp.resp=(/^[\w:-]{5,128}$/.test(rs)||rs==='__sem__')?rs:'';
  if(!document.getElementById('modal').hidden) fechaModal();
  vaiPara('gp');
}
// 🔢 Contador da aba (fase 4): vencidos + parados do escopo atual, só com dado já carregado.
function gpPendN(){ const gp=estado.gp; if(!gp.dados||gp.chave!==gpChave()) return null; const c=gpCalc(); if(!c) return null;
  return new Set([...c.b.vencidos,...c.b.parados].map(t=>t.k)).size; }
// ---- Tela ----
function gpDelta(atual, ant){ if(ant==null) return '';
  const d=atual-ant; return `<span class="gp-delta ${d>0?'up':(d<0?'down':'')}" data-tip="${escA(`sexta passada: ${ant} · agora: ${atual}`)}">Δ ${d>0?'+':''}${d} vs sexta</span>`; }
function renderGp(){
  const cont=document.getElementById('conteudo'); const gp=estado.gp; const id=idApontar();
  if(typeof _projetosCache!=='undefined'&&!_projetosCache&&!gp.catB){ gp.catB=true; garanteProjetos().then(()=>{ if(estado.vista==='gp') renderGp(); }).catch(()=>{}); }
  gpCarrega(false); gpCarregaFoto();
  const c=gpCalc(); const chaveOk=gp.dados&&gp.chave===gpChave();
  const keys=gpEscopo(); const meus=gpMeusKeys(); const N=gpDias(); const rc=relCtxAtivo('gp');
  // Projetos do seletor: os meus + os da base carregada + o catálogo (quando já chegou); com relatório aberto, só os tipos O/R.
  const cat=(typeof _projetosCache!=='undefined'&&_projetosCache)||[];
  const opts=[...new Set([...meus,...((c&&c.projs)||[]),...cat.map(p=>p.key)])].filter(k=>!rc||relProjOk(k)).sort((a,b)=>projNome(a).localeCompare(projNome(b),'pt'));
  const projSel=gp.proj&&!gp.proj.includes(',')?gp.proj:'';
  const resps=c?[...new Map(c.Aall.filter(t=>t.respId).map(t=>[t.respId,t.resp])).entries()].sort((x,y)=>x[1].localeCompare(y[1],'pt')):[];
  const filtros=`<div class="ap-filtros gp-filtros">
    ${meus.length?`<div class="campo"><label>Escopo</label><button class="chip" data-gp-meus="1" aria-pressed="${gpMeusLigado()}" data-tip="${escA('Os projetos em que você é gerente: '+meus.join(', '))}">👤 Meus projetos (${meus.length})</button></div>`:''}
    <div class="campo"><label>Projeto</label><select id="gp-proj"><option value="">${gpMeusAtivo()?'todos os meus':'todos'}</option>${opts.map(k=>`<option value="${escA(k)}" ${projSel===k?'selected':''}>${esc(projNomeCod(k))}</option>`).join('')}</select></div>
    <div class="campo"><label>Pessoa</label><select id="gp-resp"><option value="">todas</option><option value="__sem__" ${gp.resp==='__sem__'?'selected':''}>— sem responsável —</option>${resps.map(([a,n])=>`<option value="${escA(a)}" ${gp.resp===a?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
    <div class="campo"><label>Parado há ≥ (dias)</label><input type="number" id="gp-dias" min="1" max="60" value="${N}" style="width:80px"></div>
    <div class="campo"><label>&nbsp;</label><label class="muted small" style="display:inline-flex;gap:5px;align-items:center;cursor:pointer;min-height:34px"><input type="checkbox" id="gp-semvenc" ${gp.semVenc?'checked':''}> incluir sem vencimento</label></div>
    <div class="campo"><label>&nbsp;</label><button class="btn" id="gp-refresh" data-tip="Rebuscar do Jira ignorando o cache">↻ Atualizar</button></div>
    ${keys&&keys.length===1?`<div class="campo"><label>&nbsp;</label><button class="btn" data-proj-ficha="${escA(keys[0])}" data-tip="Voltar à ficha deste projeto em 📁 Projetos (🦴 espinha)">📁 Ficha de ${esc(projNome(keys[0]))}</button></div>`:''}
    ${gp.proj&&gp.proj.includes(',')?`<div class="campo"><label>&nbsp;</label><button class="chip" data-gp-limpar-proj="1" data-tip="Tirar o filtro de projetos vindo do link">✕ ${esc(gp.proj)}</button></div>`:''}
  </div>`;
  const cab=(sub)=>`<div class="card full gp-topo"><h2>🧭 Pendências do projeto <span>${sub}</span></h2>${filtros}`;
  if(gp.erro&&!chaveOk){ cont.replaceChildren(el(`<div>${cab('a visão do gerente')}<div class="erro"><strong>Falha ao carregar.</strong> ${esc(gp.erro)} <button class="btn" id="gp-retry" style="margin-left:10px">Tentar de novo</button></div></div></div>`)); return; }
  if(!c||!chaveOk){ cont.replaceChildren(el(`<div>${cab('a visão do gerente')}<div class="estado">Buscando os tickets abertos${keys?` de ${esc(keys.join(', '))}`:''}…</div></div></div>`)); return; }
  const F=c.foto; const ant=c.ant||{};
  const sub=`${esc(c.rotProj)} · ${c.A.length} aberto(s) · hoje ${esc(dataBR(c.hoje))}${F?` · foto de sexta ${esc(dataBR(F.ate))}`:(gp.fotoOk===false?' · sem foto semanal para comparar':'')}${rc?` · relatório ${esc(rc.id)}`:''}`;
  const kpi=(id2,rot,v,antV,sev)=>`<div class="vg-k ${sev||''}" data-gp-ir="${id2}" data-tip="clique para ir ao bloco"><div class="v">${v}</div><div class="l">${rot}</div>${gpDelta(v,antV)?`<div class="s">${gpDelta(v,antV)}</div>`:''}</div>`;
  const kpis=`<div class="gp-kpis">
    ${kpi('b1','⏰ vencidos',c.b.vencidos.length,ant.vencidos,c.b.vencidos.length?'bad':'good')}
    ${kpi('b2',`🧊 parados ≥ ${c.N}d`,c.b.parados.length,ant.parados,c.b.parados.length?'warn':'good')}
    ${kpi('b3','⏳ vencem em 7d',c.b.vencem.length,null,c.b.vencem.length?'warn':'')}
    ${kpi('b4','📝 cadastro incompleto',c.cad.size,null,'')}
    ${kpi('b5','⏱ sem apontamento',c.b.mexidos.length+c.b.conclSem.length,null,'')}
    ${kpi('b6','📅 reuniões vencidas',c.b.reunioes.length,ant.reunioes,c.b.reunioes.length?'bad':'good')}</div>`;
  const pend=gpPessoasPend(c);
  const acoes=`<div class="ap-vis gp-acoes-topo" id="gp-resumo">
    <button class="btn" data-gp-resumo="1" data-tip="Copia um resumo em texto simples — para a reunião de status">📋 Copiar resumo do projeto</button>
    <button class="btn" data-gp-gestao="1" data-tip="Abre 🛠 Tickets do time só com estes tickets, já selecionados — atribuir, status, reprogramar em massa">🛠 Abrir na Gestão</button>
    <button class="btn" data-gp-inbox-todos="1" ${pend.length?'':'disabled'} data-tip="Grava um aviso no 📥 Inbox de cada pessoa com pendência (uma gravação só)">📥 Avisar todos no Inbox (${pend.length})</button>
    ${(F&&F.truncado&&(F.truncado.abertos||F.truncado.atividade))?'<span class="muted small">⚠ foto de sexta truncada (tetos do Jira)</span>':''}
    ${gp.dados.meta&&gp.dados.meta.truncado&&gp.dados.meta.truncado.abertos?'<span class="muted small">⚠ base de abertos truncada — os números podem estar subestimados</span>':''}</div>`;
  // 👥 Por pessoa — a cobrança em 1 clique. Pior caso primeiro: quem tem o maior atraso; sem vencido, quem está parado há mais tempo.
  const todosP=gpPorPessoa([...c.b.vencidos,...c.b.parados,...c.b.vencem,...c.b.semVenc],(t)=>(t.venc&&t.venc<c.hoje?1000+(gpDiasDesde(c.hoje,t.venc)||0):c.up(t)));
  const pessoasHTML=todosP.map(g=>{ const pp=gpPendPessoa(c,g.a); const email=g.a!=='__sem__'?gpEmailDe(g.a):'';
    const chips=[pp.vencidos.length?`<span class="badge venc-passado">⏰ ${pp.vencidos.length}</span>`:'',pp.parados.length?`<span class="badge">🧊 ${pp.parados.length}</span>`:'',pp.vencem.length?`<span class="badge">⏳ ${pp.vencem.length}</span>`:'',pp.semData.length?`<span class="badge">📝 ${pp.semData.length} sem data</span>`:''].filter(Boolean).join(' ');
    const acoesP=g.a==='__sem__'?`<span class="muted small">sem dono — atribua na 🛠 Gestão</span>`
      :`<button class="btn" data-gp-msg="${escA(g.a)}" data-tip="Copia a mensagem pronta: o que está pendente, as chaves e o link da lista filtrada nesta pessoa">📋 mensagem</button>
        ${email?`<a class="btn" href="https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(email)}&message=${encodeURIComponent(gpMensagem(c,g.a))}" target="_blank" rel="noopener" data-tip="Abre o chat individual do Teams com a mensagem pronta">💬 Teams</a>`:`<button class="btn" disabled data-tip="Sem e-mail conhecido para esta pessoa (lista de usuários do Jira)">💬 Teams</button>`}
        <button class="btn" data-gp-com="${escA(g.a)}" data-tip="Comenta em cada ticket pendente com o modelo 'Cobrar atualização' e @menção — no seu usuário, com confirmação">📣 comentar no Jira</button>
        <button class="btn" data-gp-inbox="${escA(g.a)}" data-tip="Aviso no 📥 Inbox do app desta pessoa, com o link da lista">📥 Inbox</button>`;
    return `<div class="gp-pessoa-row" data-gp-pessoa="${escA(g.a)}"><span class="gp-pessoa-nome">👤 ${esc(g.nome)} <span class="muted small">· ${pp.n} ticket(s)</span></span><span class="gp-chips">${chips}</span><span class="gp-acoes">${acoesP}</span></div>`; }).join('');
  const pessoas=`<div class="card full gp-pessoas"><h2>👥 Por pessoa <span>pior caso primeiro · ${todosP.length} pessoa(s) com pendência</span></h2>${pessoasHTML||'<div class="gp-vazio">✓ Ninguém com pendência no escopo.</div>'}</div>`;
  // Blocos 1–7: cada um agrupado por pessoa.
  const multi=!c.keys||c.keys.length>1;
  const linha=(t,met,cls)=>`<div class="gp-row"><div class="gp-c-k"><a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener">${esc(t.k)} ↗</a></div>
    <div class="gp-c-res" title="${escA(t.resumo||'')}">${esc(t.resumo||'—')}</div>
    <div class="gp-c-st"><span class="badge">${esc(t.status||t.resol||'—')}</span>${multi?` <span class="badge" data-tip="${escA(t.p)}">${esc(projNome(t.p))}</span>`:''}</div>
    <div class="gp-c-m ${cls||''}">${met}</div>
    <div class="gp-c-acao"><button class="gp-mini" data-gx-det="${escA(t.k)}" data-tip="Ficha completa do ticket (descrição, comentários, horas) sem abrir o Jira">🔍</button></div></div>`;
  const grupo=(g,col,fn)=>`<div class="gp-pessoa"><div class="gp-pessoa-h">👤 ${esc(g.nome)} <span class="badge">${g.itens.length}</span>${g.a!=='__sem__'?` <button class="lnk-ficha" data-gp-msg="${escA(g.a)}" data-tip="Copiar a mensagem de cobrança desta pessoa">📋 mensagem</button>`:''}</div>
    <div class="gp-tab"><div class="gp-tab-h"><div>Ticket</div><div>Resumo</div><div>Status</div><div>${esc(col)}</div><div></div></div>${g.itens.map(fn).join('')}</div></div>`;
  const bloco=(id2,tit,sub2,n,delta,corpo)=>`<div class="card full gp-bloco" id="gp-${id2}"><h2>${tit} <span class="gp-n">${n}</span>${delta}<span>${sub2}</span></h2>${corpo||'<div class="gp-vazio">✓ nada aqui.</div>'}</div>`;
  const porPessoa=(lista,peso,col,fn)=>gpPorPessoa(lista,peso).map(g=>grupo(g,col,fn)).join('');
  const b1=bloco('b1','⏰ Vencidos por pessoa','vencimento no passado, ainda aberto',c.b.vencidos.length,gpDelta(c.b.vencidos.length,ant.vencidos),
    porPessoa(c.b.vencidos,(t)=>gpDiasDesde(c.hoje,t.venc)||0,'Atraso',(t)=>linha(t,`${gpDiasDesde(c.hoje,t.venc)}d · venceu ${esc(alxDataBR(t.venc))}`,'gp-sev')));
  const b2=bloco('b2',`🧊 Parados há ≥ ${c.N} dias`,'em andamento/aguardando sem nenhuma movimentação no Jira',c.b.parados.length,gpDelta(c.b.parados.length,ant.parados),
    porPessoa(c.b.parados,(t)=>c.up(t),'Parado há',(t)=>linha(t,`${c.up(t)>=999?'?':c.up(t)+'d'} sem atualização`,'')));
  const b3=bloco('b3','⏳ Vencem em até 7 dias sem movimento',`vencimento até ${esc(dataBR(somaDias(c.hoje,7)))} e ≥ ${c.N} dias sem atualização`,c.b.vencem.length,'',
    porPessoa(c.b.vencem,(t)=>7-(gpDiasDesde(t.venc,c.hoje)||0),'Vence',(t)=>linha(t,`${esc(alxDataBR(t.venc))} · parado há ${c.up(t)}d`,'')));
  const sub4=(rot,l,antV,col,fn)=>l.length?`<h3 class="gp-h3">${rot} <span class="badge">${l.length}</span>${gpDelta(l.length,antV)}</h3>${porPessoa(l,()=>0,col,fn)}`:'';
  const b4=bloco('b4','📝 Cadastro incompleto',`${c.cad.size} ticket(s) distintos · o que o Jira não consegue cobrar sozinho`,c.cad.size,'',
    (sub4('📅 Sem vencimento',c.b.semVenc,ant.semVenc,'Criado',(t)=>linha(t,`criado ${esc(alxDataBR(t.criado))}`,''))
    +sub4('👤 Sem responsável',c.b.semResp,ant.semResp,'Aberto há',(t)=>linha(t,`${gpDiasDesde(c.hoje,t.criado)??'?'}d`,''))
    +sub4('⏱ Sem estimativa (em andamento)',c.b.estZero,ant.estZero,'Horas',(t)=>linha(t,`${t.seg?fmtH(t.seg):'0h'} apontadas · sem estimativa`,''))
    +sub4('📄 Descrição curta',c.b.semDesc,ant.semDesc,'Descrição',(t)=>linha(t,`${t.descLen||0} caractere(s)`,'')))||'');
  // ⏱ Sem apontamento: mexidos sem horas, concluídos sem horas e (pela foto) quem ficou com dia útil vazio na semana.
  let vazios='';
  if(F&&F.pessoas&&c.keys){ const ids=new Set(); c.keys.forEach(k=>{ const P=F.projetos[k]; Object.keys((P&&P.porPessoa)||{}).forEach(a=>ids.add(a)); });
    const l=[...ids].map(a=>({a,p:F.pessoas[a]})).filter(x=>x.p&&x.p.diasVazios>0&&(!gp.resp||gp.resp===x.a)).sort((x,y)=>y.p.diasVazios-x.p.diasVazios);
    if(l.length) vazios=`<h3 class="gp-h3">📆 Dias úteis sem apontamento na semana da foto <span class="badge">${l.length}</span></h3><div class="gp-chips" style="margin:0 0 8px">${l.map(x=>`<span class="badge" data-tip="${escA(`semana ${dataBR(F.semana)}–${dataBR(F.ate)}`)}">👤 ${esc(x.p.nome||x.a)} · ${x.p.diasVazios} dia(s)</span>`).join(' ')}</div>`; }
  const b5=bloco('b5','⏱ Sem apontamento','tickets que andaram (ou fecharam) sem nenhuma hora registrada',c.b.mexidos.length+c.b.conclSem.length,'',
    (sub4(`🔧 Mexidos nos últimos ${c.N} dias sem horas`,c.b.mexidos,null,'Última atividade',(t)=>linha(t,`${c.up(t)}d atrás · 0h`,''))
    +sub4('✅ Concluídos sem horas',c.b.conclSem,null,'Resolvido',(t)=>linha(t,`${esc(alxDataBR(t.resolvido))} · 0h`,''))+vazios)||'');
  const b6=bloco('b6','📅 Reuniões vencidas abertas','tickets de reunião com data no passado — falta apontar e fechar',c.b.reunioes.length,gpDelta(c.b.reunioes.length,ant.reunioes),
    porPessoa(c.b.reunioes,(t)=>gpDiasDesde(c.hoje,t.venc)||0,'Foi em',(t)=>linha(t,`${esc(alxDataBR(t.venc))} · ${gpDiasDesde(c.hoje,t.venc)}d`,'gp-sev')));
  // 📊 Planejado × orçado × realizado da semana (da foto) — horas, nunca R$; chip para a 💹 Rentabilidade.
  let b7='';
  if(F&&F.projetos){ const fk=Object.keys(F.projetos).filter(k=>!c.ks||c.ks.has(k));
    const rows=fk.map(k=>{ const P=F.projetos[k]; const RF=(F.realFechado&&F.realFechado.projetos&&F.realFechado.projetos[k])||null; const real=RF?RF.real:P.real;
      const plano=(typeof rpPlanos==='function')?rpPlanos().find(x=>x&&x.projeto===k):null;
      return `<div class="gp-row gp-row7"><div class="gp-c-k"><button class="lnk-ficha" data-proj-ficha="${escA(k)}">📁 ${esc(k)}</button></div>
        <div class="gp-c-res">${esc(P.nome||projNome(k))}${(P.gerentes||[]).length?` <span class="muted small">· gerente(s): ${esc((P.gerentes||[]).map(a=>gpNomeDe(c,a).split(' ')[0]).join(', '))}</span>`:''}</div>
        <div class="gp-c-st"><span class="badge" data-tip="planejado (planos semanais enviados/aprovados)">📋 ${fmtH(P.plan||0)}</span> <span class="badge" data-tip="orçado (horas vendidas da Rentabilidade rateadas na semana)">🎯 ${fmtH(P.orc||0)}</span> <span class="badge ${P.orc&&real>P.orc?'venc-passado':''}" data-tip="realizado (worklogs${RF?' — semana fechada':''})">⏱ ${fmtH(real||0)}</span></div>
        <div class="gp-c-m">${P.consumo!=null?`consumo ${P.consumo}%`:'—'}${P.saldo!=null?` · saldo ${P.saldo>0?'+':''}${P.saldo} ticket(s)`:''}</div>
        <div class="gp-c-acao">${plano?`<button class="lnk-ficha" data-gp-rentab="${escA(plano.id)}" data-tip="Abre o plano deste projeto na 💹 Rentabilidade">💹 plano</button>`:'<span class="muted small" data-tip="Sem plano de rentabilidade para este projeto">💹 —</span>'}</div></div>`; }).join('');
    b7=bloco('b7','📊 Planejado × orçado × realizado',`semana ${esc(dataBR(F.semana))}–${esc(dataBR(F.ate))} (foto de sexta) · horas`,fk.length,'',rows?`<div class="gp-tab"><div class="gp-tab-h"><div>Projeto</div><div>Nome</div><div>Plan · Orç · Real</div><div>Consumo</div><div></div></div>${rows}</div>`:''); }
  else b7=bloco('b7','📊 Planejado × orçado × realizado','vem da foto de sexta do 📊 Relatório semanal',0,'',`<div class="gp-vazio">${gp.fotoB?'buscando a foto de sexta…':(id?'Sem foto de sexta ainda — o comparativo aparece depois do primeiro relatório semanal.':'Identifique-se (⏱ Apontar) para ver a semana da foto.')}</div>`);
  cont.replaceChildren(el(`<div>${cab(sub)}${kpis}${acoes}</div>${pessoas}${b1}${b2}${b3}${b4}${b5}${b6}${b7}</div>`));
  estadoParaURL();
}
// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='gp') return;
  const cl=(s)=>e.target.closest&&e.target.closest(s); const gp=estado.gp;
  const ir=cl('[data-gp-ir]'); if(ir){ const b=document.getElementById('gp-'+ir.getAttribute('data-gp-ir')); if(b) b.scrollIntoView({behavior:'smooth',block:'start'}); return; }
  const m=cl('[data-gp-meus]'); if(m){ gp.meus=!gpMeusLigado(); gp.proj=''; renderGp(); return; }   // alterna o estado EXIBIDO
  const lp=cl('[data-gp-limpar-proj]'); if(lp){ gp.proj=''; renderGp(); return; }
  const msg=cl('[data-gp-msg]'); if(msg){ const c=gpCalc(); if(c) gpCopia(gpMensagem(c,msg.getAttribute('data-gp-msg')),'📋 Mensagem copiada — cole no chat da pessoa.'); return; }
  const com=cl('[data-gp-com]'); if(com){ gpAbreComentar(com.getAttribute('data-gp-com')); return; }
  const ib=cl('[data-gp-inbox]'); if(ib){ gpAvisaInbox([ib.getAttribute('data-gp-inbox')]); return; }
  const ibt=cl('[data-gp-inbox-todos]'); if(ibt){ const c=gpCalc(); if(c) gpAvisaInbox(gpPessoasPend(c)); return; }
  const rs=cl('[data-gp-resumo]'); if(rs){ const c=gpCalc(); if(c) gpCopia(gpResumoTexto(c),'📋 Resumo copiado — cole na ata ou no chat.'); return; }
  const gs=cl('[data-gp-gestao]'); if(gs){ const c=gpCalc(); if(c) gpAbreGestao(c); return; }
  const rp=cl('[data-gp-rentab]'); if(rp){ const rr=estado.rentab; rr.sel=rp.getAttribute('data-gp-rentab'); rr.edit=false; rr.novo=false; vaiPara('rentab'); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.id==='gp-refresh'){ gpCarrega(true); gp.fotoOk=null; gp.foto=null; renderGp(); }
  else if(t.id==='gp-retry'){ gp.erro=''; gpCarrega(true); renderGp(); }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='gp') return;
  const t=e.target; const gp=estado.gp; if(!t||!t.id) return;
  if(t.id==='gp-proj'){ gp.proj=t.value?t.value.toUpperCase():''; renderGp(); }
  else if(t.id==='gp-resp'){ gp.resp=t.value; renderGp(); }
  // O redesenho sai do evento: no Chrome, tirar o campo focado do DOM dispara `blur` → um segundo `change`
  // no meio do replaceChildren (o mesmo caso do pcAdiaRender, 16c). Adiado, os dois só marcam o valor.
  else if(t.id==='gp-dias'){ gpDiasSet(t.value); setTimeout(()=>{ if(estado.vista==='gp') renderGp(); },0); }
  else if(t.id==='gp-semvenc'){ gp.semVenc=!!t.checked; renderGp(); }
});
document.getElementById('modal-body').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.id==='gp-com-confirmar') gpComentaLote();
});
// Aviso do Inbox (19) → abre a lista já filtrada; vale na tela e dentro de modais.
document.addEventListener('click',(e)=>{
  const g=e.target.closest&&e.target.closest('[data-ib-gp]'); if(!g) return;
  if(typeof escondeTip==='function') try{ escondeTip(); }catch(x){}
  gpAbreLink(g.getAttribute('data-ib-gp'));
});
