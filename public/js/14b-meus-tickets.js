// Jira Insights · 14b · 🧾 PRECISO CRIAR MEUS TICKETS — assistente em 5 passos (2026-10-03, a pedido do
// usuário): a pessoa conta O QUE FEZ, por projeto, em texto livre; o app acha o ticket nos abertos do
// projeto (ou oferece criar), pergunta quanto tempo gastou em cada um, mostra o status e oferece
// atualizar — e só então faz tudo de uma vez, item a item, mostrando o que deu certo.
// ======================================================================================
// Peças reaproveitadas: POST /api/criar {meus:1} (separa o relato em itens + candidatos — api/criar.js),
// POST /api/criar lote (criar 1 item), POST /api/apontar (horas no dia escolhido), POST /api/transicao
// (listar + aplicar), GET /api/reunioes?abertos= (rebuscar candidatos ao trocar o projeto),
// GET /api/vencimentos?detalhe= (validar uma chave digitada), idApontar/abreIdentidade, parseTempo/fmtH,
// garanteProjetos/_projetosCache (tipo padrão e lista de projetos), registraExtraDia, logAcao.
// Estado em estado.meus (01-nucleo.js); o texto e o dia também ficam num rascunho no localStorage.
// Listeners delegados desta tela ficam no FIM deste arquivo (prefixo data-mt-* / #mt-*).
// ======================================================================================
const MT_RASC_KEY='jirainsight_meus_rasc_v1';
function mtSalvaRasc(){ const m=estado.meus; try{ localStorage.setItem(MT_RASC_KEY, JSON.stringify({ texto:m.texto||'', dia:m.dia||'' })); }catch(e){} }
function mtLeRasc(){ try{ return JSON.parse(localStorage.getItem(MT_RASC_KEY)||'null'); }catch(e){ return null; } }
function mtLimpaRasc(){ try{ localStorage.removeItem(MT_RASC_KEY); }catch(e){} }

// ---- Casamento texto × resumo (a MESMA regra do servidor, para rebuscar ao trocar o projeto) ----
const MT_STOP=new Set(['de','da','do','das','dos','e','o','a','os','as','um','uma','uns','umas','para','pra','com','sem','no','na','nos','nas',
  'em','por','ao','aos','que','se','ja','foi','fiz','feito','feita','fazer','fazendo','realizei','realizado','realizada','sobre','entre','mais',
  'ate','apos','durante','hoje','ontem','meu','minha','nosso','nossa','seu','sua','este','esta','esse','essa','isso','isto','projeto','ticket',
  'chamado','tarefa','atividade','trabalhei','trabalho','horas','hora','minutos','min']);
function mtTokens(s){ return [...new Set(normPal(s).replace(/[^a-z0-9]+/g,' ').split(' ').filter(t=>t.length>=3&&!MT_STOP.has(t)))]; }
const mtRaiz=(w)=>w.slice(0, w.length>=7?6:5);
function mtMesma(a,b){ return a===b||(a.length>=5&&b.length>=5&&mtRaiz(a)===mtRaiz(b)); }
function mtPontua(ativ, resumo){ const ta=mtTokens(ativ); if(!ta.length) return 0; const tr=mtTokens(resumo); let n=0; ta.forEach(t=>{ if(tr.some(r=>mtMesma(r,t))) n++; }); return n/ta.length; }
function mtCandidatos(ativ, chave, tickets){
  return (tickets||[]).map(t=>({ k:t.k, resumo:t.resumo, status:t.status, cat:t.cat||'', tipo:t.tipo, resp:t.resp||'', nota:(chave&&t.k===chave)?1:mtPontua(ativ,t.resumo) }))
    .filter(c=>c.nota>=0.34).sort((a,b)=>b.nota-a.nota).slice(0,4).map(c=>Object.assign(c,{nota:Math.round(c.nota*100)/100}));
}
// Tipo padrão do projeto pelo catálogo do painel (mesma regra do servidor: Tarefa/Task, nunca sub ou épico, evita "faturável").
function mtTipoDoCatalogo(proj){
  const p=(_projetosCache||[]).find(x=>x.key===proj); if(!p) return null;
  const uteis=(p.tipos||[]).filter(t=>!t.subtarefa&&(t.nivel===0||t.nivel===undefined)&&!/epic|épico/i.test(t.nome||''));
  const alvo=uteis.find(t=>/^(tarefa|task)$/i.test(t.nome||''))||uteis.find(t=>/tarefa|task/i.test(t.nome||'')&&!/fatur/i.test(t.nome||''))||uteis.find(t=>!/fatur/i.test(t.nome||''))||uteis[0];
  return alvo?{ id:String(alvo.id), nome:alvo.nome||'' }:null;
}
const MT_RE_CHAVE=/^[A-Z][A-Z0-9_]*-\d+$/;
// Redesenho DEPOIS de um await: a pessoa pode ter ido para outra tela enquanto esperava — só redesenha se ainda estiver aqui.
function mtRender(){ if(estado.vista==='meustickets') renderMeusTickets(); }
// Trocou o ticket do item: a escolha de status era do ticket anterior (outro fluxo, outro id) — começa de novo.
function mtTrocaTicket(it){ it.stId=''; it.stNome=''; it.stCatSel=''; it.trans=null; it.transErro=''; it.transCarr=false; it.statusAtual=''; }
// Tempo preenchido e ilegível (ou fora de 1m–24h) em algum item — a ÚNICA regra do passo 3 (render, digitar, chips, avançar).
function mtTempoRuim(t){ const s=String(t||'').trim(); if(!s) return false; const v=parseTempo(s); return v==null||v<60||v>86400; }
function mtTemposInvalidos(m){ return mtAtivos(m).filter(it=>!(it.exec&&it.exec.apontou)&&mtTempoRuim(it.tempo)).length; }
function mtAtivos(m){ return (m.itens||[]).filter(it=>it.escolha!=='pular'); }
function mtTotalSeg(m){ return mtAtivos(m).reduce((s,it)=>s+(parseTempo(it.tempo||'')||0),0); }
function mtFalhas(m){ return mtAtivos(m).filter(it=>it.exec&&(it.exec.erroCriar||it.exec.erroApontar||it.exec.erroSt)).length; }
function mtResumoPlano(m){
  const a=mtAtivos(m); const novos=a.filter(it=>it.escolha==='novo').length; const ex=a.length-novos;
  const st=a.filter(it=>it.escolha==='existe'?!!it.stId:!!it.stCat).length; const tot=mtTotalSeg(m);
  return [novos?`${novos} ticket(s) novo(s)`:'', ex?`${ex} existente(s)`:'', tot?`${fmtH(tot)} a apontar`:'sem horas', st?`${st} status`:''].filter(Boolean).join(' · ');
}
// Voltar a um passo: antes de confirmar, a qualquer passo anterior; depois de uma execução COM falha, só às horas e
// aos status (3 e 4) — para corrigir o que falhou e confirmar de novo. Tickets e texto (1 e 2) já viraram ações no Jira.
function mtPodeVoltar(m,n){
  if(m.executando||n>=m.passo||n<1) return false;
  if(m.executou) return n>=3&&(m.passo<5||mtFalhas(m)>0);   // já houve execução: só Horas e Status
  return true;
}
function mtEstadoNovo(dia){ return { passo:1, texto:'', dia:dia||hojeSP(), itens:[], projetos:[], interpretando:false, erro:'', avisos:[], ia:false, executando:false, feito:false, _rascLido:true }; }
// Ontem no fuso de São Paulo (somaDias só anda para a frente).
function mtOntem(){ const d=new Date(Date.parse(hojeSP()+'T12:00:00-03:00')-86400000); return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(d); }

// ============================== RENDER ==============================
function renderMeusTickets(){
  const cont=document.getElementById('conteudo'); const m=estado.meus; const id=idApontar();
  if(!m.dia) m.dia=hojeSP();
  if(!m._rascLido){ m._rascLido=true; const r=mtLeRasc(); if(r&&r.texto&&!m.texto){ m.texto=r.texto; if(r.dia&&r.dia<=hojeSP()) m.dia=r.dia; } }
  if(!_projetosCache){ try{ garanteProjetos().then(()=>{ if(estado.vista==='meustickets'&&estado.meus.passo===2) renderMeusTickets(); }).catch(()=>{}); }catch(e){} }
  const faixa=id
    ?`<div class="ap-id">🧾 Registrando como <strong>${esc(id.nome||id.email)}</strong> <span class="muted small">(tickets no seu nome, horas no seu usuário)</span><span class="spacer"></span><button class="btn" data-ap-act="trocar-id">Trocar usuário</button></div>`
    :`<div class="ap-id sem">Para achar, criar e apontar nos SEUS tickets, identifique-se uma única vez (e-mail + token de API do Jira).<span class="spacer"></span><button class="btn primario" data-ap-act="config-id">Identificar-se</button></div>`;
  const passos=[[1,'O que fiz'],[2,'Tickets'],[3,'Horas'],[4,'Status'],[5,'Pronto']];
  const podeVoltar=(n)=>mtPodeVoltar(m,n);
  const barra=`<div class="mt-passos" data-tip="Os passos do assistente — clique num passo anterior para voltar">${passos.map(([n,r])=>`<span class="mt-passo${m.passo===n?' on':''}${podeVoltar(n)?' feito':''}"${podeVoltar(n)?` data-mt-ir="${n}" role="button"`:''}>${n}. ${esc(r)}</span>`).join('')}</div>`;
  let corpo='';
  if(m.passo===1) corpo=mtP1(m,id); else if(m.passo===2) corpo=mtP2(m); else if(m.passo===3) corpo=mtP3(m); else if(m.passo===4) corpo=mtP4(m); else corpo=mtP5(m);
  cont.replaceChildren(el(`<div class="vw-meustickets"><div class="card full">
    <h2>🧾 Preciso criar meus tickets <span>conte o que fez, por projeto — eu acho (ou crio) o ticket, aponto as horas e atualizo o status</span></h2>
    ${faixa}${barra}${corpo}</div></div>`));
}
// ---- Passo 1: o que você fez ----
function mtP1(m,id){
  const temMic=!!(window.SpeechRecognition||window.webkitSpeechRecognition);
  const ontem=mtOntem();
  return `<div class="mt-p1">
    <div class="pl-dica">Escreva <b>uma linha por projeto</b>, do seu jeito — eu separo as atividades. Exemplo:<br>
      <span class="muted">Projeto Copel: fiz a configuração do produto XPTO e revisei o cadastro de fornecedores<br>Sumitomo: reunião de alinhamento do fluxo de caixa, 1h</span><br>
      Eu procuro cada atividade nos <b>tickets abertos do projeto</b>; o que não existir, ofereço criar. Depois pergunto as <b>horas</b> e o <b>status</b> — e você confirma tudo de uma vez.</div>
    <div class="pl-grid" style="margin-top:10px;align-items:flex-end">
      <div class="campo"><label>Dia do trabalho</label><input type="date" id="mt-dia" value="${escA(m.dia)}" max="${escA(hojeSP())}"></div>
      <div class="ap-chips"><button class="chip" data-mt-dia="${escA(hojeSP())}" aria-pressed="${m.dia===hojeSP()}">hoje</button><button class="chip" data-mt-dia="${escA(ontem)}" aria-pressed="${m.dia===ontem}">ontem</button></div>
    </div>
    <textarea id="mt-texto" class="pl-texto" style="min-height:140px" placeholder="Projeto Copel: fiz a configuração do produto XPTO e revisei o cadastro de fornecedores&#10;Sumitomo: reunião de alinhamento do fluxo de caixa, 1h">${esc(m.texto||'')}</textarea>
    ${m.erro?`<div class="ap-fb err" style="display:block;margin-top:8px">${esc(m.erro)}</div>`:''}
    <div class="mt-acoes">
      <button class="btn primario" id="mt-entender" ${(!id||m.interpretando)?'disabled':''}>${m.interpretando?'✨ Entendendo o que você escreveu…':'Entender o que escrevi →'}</button>
      ${temMic?'<button class="btn" id="mt-mic" data-tip="Fale o que fez — o texto entra no campo (pt-BR)">🎤 Ditar</button>':''}
      ${m.texto?'<button class="btn" id="mt-limpar" data-tip="Apaga o texto (e o rascunho guardado neste navegador)">Limpar</button>':''}
      <span class="muted small">${id?'Nada é criado nem apontado antes do passo final.':'Identifique-se acima para continuar.'}</span>
    </div></div>`;
}
// ---- Passo 2: achei isto no Jira ----
function mtP2(m){
  const projs=(m.projetos&&m.projetos.length)?m.projetos:((_projetosCache||[]).map(p=>({ key:p.key, nome:p.nome||p.key })).sort((a,b)=>a.nome.localeCompare(b.nome,'pt')));
  const itens=m.itens.map((it,i)=>{
    const proj=it.projeto?`<span class="badge" data-tip="Projeto reconhecido${it.projetoTexto?` em “${escA(it.projetoTexto)}”`:''}">${esc(it.projetoNome||it.projeto)} · ${esc(it.projeto)}</span> <button class="btn mt-mini" data-mt-trocaproj="${i}" data-tip="Procurar em outro projeto">trocar</button>`:'';
    const sel=(!it.projeto||it.trocandoProj)?`<select data-mt-proj="${i}"><option value="">— em qual projeto? —</option>${projs.map(p=>`<option value="${escA(p.key)}" ${p.key===it.projeto?'selected':''}>${esc(p.nome)} (${esc(p.key)})</option>`).join('')}</select>`:'';
    const cands=(it.cands||[]).map(c=>`<label class="mt-opcao${it.escolha==='existe'&&it.key===c.k?' sel':''}" data-mt-usar="${i}|${escA(c.k)}">
        <input type="radio" name="mt-e-${i}" ${it.escolha==='existe'&&it.key===c.k?'checked':''}> <b>${esc(c.k)}</b> <span>${esc(c.resumo)}</span> <span class="badge">${esc(c.status)}</span>${c.resp?`<span class="muted small">· ${esc(c.resp)}</span>`:''} <span class="mt-nota">${c.nota>=0.8?'parece ser este':c.nota>=0.5?'parecido':'talvez'}</span></label>`).join('');
    const extra=(it.escolha==='existe'&&it.key&&!(it.cands||[]).some(c=>c.k===it.key))?`<label class="mt-opcao sel" data-mt-usar="${i}|${escA(it.key)}"><input type="radio" name="mt-e-${i}" checked> <b>${esc(it.key)}</b> <span>${esc(it.keyResumo||'')}</span> ${it.keyStatus?`<span class="badge">${esc(it.keyStatus)}</span>`:''} <span class="mt-nota">chave informada</span></label>`:'';
    const novo=`<label class="mt-opcao${it.escolha==='novo'?' sel':''}" data-mt-novo="${i}"><input type="radio" name="mt-e-${i}" ${it.escolha==='novo'?'checked':''} ${it.projeto?'':'disabled'}> 🆕 Criar novo${it.tipo?` <span class="muted small">(${esc(it.tipo.nome)} em ${esc(it.projeto)})</span>`:''}: <input type="text" class="mt-titulo" data-mt-titulo="${i}" value="${escA(it.titulo||'')}" maxlength="120" placeholder="título do ticket" ${it.projeto?'':'disabled'} aria-label="Título do ticket novo"></label>`;
    const outro=`<div class="mt-opcao mt-outro"><span>🔎 Outro ticket (qualquer um, aberto ou não):</span> <input type="text" class="mt-chave" data-mt-chave="${i}" placeholder="ex.: ${escA(it.projeto||'COP')}-123" value="${escA(it.chaveTxt||'')}" aria-label="Chave do ticket"><button class="btn" data-mt-chave-ok="${i}">usar</button> <span class="mt-nota">${esc(it.chaveFb||'')}</span></div>`;
    const pular=`<label class="mt-opcao${it.escolha==='pular'?' sel':''}" data-mt-pular="${i}"><input type="radio" name="mt-e-${i}" ${it.escolha==='pular'?'checked':''}> 🚫 Deixar este de fora</label>`;
    const semCand=(it.projeto&&!it.buscando&&!(it.cands||[]).length)?`<div class="mt-nota" style="margin:2px 0 6px">Não achei nada parecido entre os tickets abertos de ${esc(it.projeto)}${it.truncado?' (lista cortada em 300 — se já existir, informe a chave)':''} — o natural é criar.</div>`:'';
    return `<div class="mt-item" data-mt-item="${i}"><div class="mt-item-h">${proj}${sel} <span class="mt-frase">“${esc(it.atividade)}”</span>${it.tempoTexto?` <span class="badge" data-tip="Horas que você escreveu — confirma no próximo passo">⏱ ${esc(it.tempoTexto)}</span>`:''}${it.concluido?' <span class="badge com-horas" data-tip="Você disse que terminou — sugiro concluir no passo de status">✓ terminou</span>':''}${it.buscando?' <span class="muted small">🔎 procurando nos abertos…</span>':''}</div>
      ${semCand}<div class="mt-opcoes">${cands}${extra}${novo}${outro}${pular}</div></div>`;
  }).join('');
  const pronto=(it)=>it.escolha==='pular'||(it.escolha==='existe'&&it.key)||(it.escolha==='novo'&&it.projeto&&(it.titulo||'').trim());
  const prontos=m.itens.every(pronto); const nUsa=mtAtivos(m).length;
  return `<div class="mt-p2">
    <div class="pl-dica">${m.ia?'✨ Entendi':'Separei'} <b>${m.itens.length}</b> atividade(s)${m.ia?'':' (sem IA: pelas linhas e pelos ";")'}. Para cada uma, confirme se é um ticket que <b>já existe</b> ou se eu <b>crio um novo</b>. Nada é gravado ainda.${(m.avisos||[]).length?`<div class="muted small" style="margin-top:4px">${m.avisos.map(a=>'⚠ '+esc(a)).join('<br>')}</div>`:''}</div>
    ${itens}
    <div class="mt-acoes"><button class="btn" data-mt-ir="1">← Voltar e ajustar o texto</button><button class="btn primario" id="mt-p2-ok" ${(prontos&&nUsa)?'':'disabled'}>Próximo: quanto tempo em cada um →</button>${!prontos?'<span class="muted small">Falta decidir em algum item: ticket existente, novo (com título) ou deixar de fora.</span>':(!nUsa?'<span class="muted small">Todos os itens ficaram de fora.</span>':'')}</div></div>`;
}
// ---- Passo 3: quanto tempo em cada um ----
function mtP3(m){
  const ativos=mtAtivos(m);
  const linhas=ativos.map(it=>{ const i=it.i; const ex=it.exec||{}; const feito=!!ex.apontou; const key=ex.key||(it.escolha==='existe'?it.key:'');
    const dis=feito?' disabled':'';
    return `<tr data-mt-item="${i}">
      <td><div><b>${key?esc(key):'🆕 '+esc(it.titulo)}</b></div><div class="muted small">${esc(it.projeto)} · ${esc(String(it.atividade||'').slice(0,80))}</div>${feito?'<div class="mt-nota">✓ já apontado — não muda mais por aqui</div>':''}</td>
      <td><input type="text" class="mt-tempo" data-mt-tempo="${i}" value="${escA(it.tempo||'')}" placeholder="1h30" aria-label="Tempo"${mtTempoRuim(it.tempo)&&!feito?' aria-invalid="true"':''}${dis}><div class="ap-chips" style="margin-top:4px">${feito?'':['30m','1h','2h','4h'].map(c=>`<button class="chip" data-mt-chip="${i}|${c}">${c}</button>`).join('')}</div></td>
      <td><input type="date" class="mt-dia" data-mt-idia="${i}" value="${escA(it.dia||m.dia)}" max="${escA(hojeSP())}" aria-label="Dia"${dis}></td>
      <td><input type="text" class="mt-com" data-mt-com="${i}" value="${escA(it.comentario||'')}" placeholder="comentário do apontamento" aria-label="Comentário"${dis}></td></tr>`; }).join('');
  const tot=mtTotalSeg(m); const id=idApontar(); const meta=metaSegDe(id&&id.accountId)||8*3600;
  let jaDia=0; try{ jaDia=minhasHorasPorDia()[m.dia]||0; }catch(e){}
  const invalidos=mtTemposInvalidos(m);
  return `<div class="mt-p3"><div class="pl-dica">Quanto tempo você gastou em cada um? Digite <b>1h30</b>, <b>45m</b>, <b>2</b> (= 2h) ou use os chips. Deixe vazio para não apontar naquele item. O comentário vai junto no apontamento.</div>
    <div class="ts-wrap"><table class="mt-tab"><thead><tr><th>Ticket</th><th>Tempo</th><th>Dia</th><th>Comentário</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <div class="mt-total muted small">Total destes apontamentos: <b id="mt-total">${esc(fmtH(tot))}</b>${jaDia?` · você já tem ${esc(fmtH(jaDia))} em ${esc(fmtBR(m.dia))}`:''} · meta ${esc(fmtH(meta))}/dia${(tot+jaDia)>meta?' <span class="mt-nota" style="color:#B45309">⚠ acima da meta do dia</span>':''}</div>
    <div class="mt-acoes">${mtPodeVoltar(m,2)?'<button class="btn" data-mt-ir="2">← Voltar</button>':''}<button class="btn primario" id="mt-p3-ok" ${invalidos?'disabled':''}>Próximo: status →</button>${invalidos?'<span class="muted small">Tempo inválido em algum item — use 1h30, 2h, 45m ou 1,5 (mínimo 1m, máximo 24h).</span>':''}</div></div>`;
}
// ---- Passo 4: como ficam os status ----
function mtP4(m){
  const ativos=mtAtivos(m);
  ativos.forEach(it=>{ if(it.escolha==='existe'&&!(it.exec&&it.exec.stOk)&&!it.trans&&!it.transCarr&&!it.transErro) mtCarregaTrans(it); });
  const linhas=ativos.map(it=>{ const i=it.i; let ops=''; const ex=it.exec||{};
    if(ex.stOk){
      ops=`<span class="mt-nota">✓ já movido para ${esc(ex.stNome||'o novo status')} — não muda mais por aqui</span>`;
    } else if(it.escolha==='existe'){
      if(it.transCarr) ops='<span class="muted small">carregando as transições que o Jira permite para você…</span>';
      else if(it.transErro) ops=`<span class="mt-nota" style="color:#B45309">${esc(it.transErro)}</span> <button class="btn mt-mini" data-mt-retrans="${i}">tentar de novo</button>`;
      else { const lista=it.trans||[];
        ops=`<button class="chip" data-mt-st="${i}|" aria-pressed="${!it.stId}">manter ${esc(it.statusAtual||'como está')}</button>`
          +lista.map(t=>`<button class="chip st-${escA(t.categoria)}" data-mt-st="${i}|${escA(t.id)}|${escA(t.para||t.nome)}|${escA(t.categoria)}" aria-pressed="${it.stId===t.id}">${esc(t.para||t.nome)}</button>`).join('');
        if(!lista.length) ops+=' <span class="muted small">nenhuma transição disponível para você neste ticket</span>'; }
    } else {
      ops=[['','manter como criado'],['indeterminate','Em andamento'],['done','Concluído']].map(([c,r])=>`<button class="chip${c?' st-'+c:''}" data-mt-stcat="${i}|${c}" aria-pressed="${(it.stCat||'')===c}">${r}</button>`).join('');
    }
    return `<div class="mt-item"><div class="mt-item-h"><b>${it.escolha==='existe'?esc(it.key):(ex.key?esc(ex.key)+' <span class="muted small">(criado)</span>':'🆕 '+esc(it.titulo))}</b> <span class="muted small">${esc(it.projeto)}</span>${it.escolha==='existe'&&it.statusAtual?` <span class="badge" data-tip="Status atual no Jira">${esc(it.statusAtual)}</span>`:''}${it.concluido?' <span class="muted small">· você disse que terminou</span>':''}</div><div class="ap-trans" style="margin:0">${ops}</div></div>`; }).join('');
  return `<div class="mt-p4"><div class="pl-dica">Como ficam os <b>status</b>? Para os tickets que já existem mostro as transições que o Jira permite para você; para os novos, escolha onde o ticket nasce. Depois eu faço tudo de uma vez: crio o que faltar, aponto as horas e movo os status.</div>${linhas}
    <div class="mt-acoes"><button class="btn" data-mt-ir="3">← Voltar</button><button class="btn primario" id="mt-confirmar" ${m.executando?'disabled':''}>✓ Confirmar tudo</button><span class="muted small">${esc(mtResumoPlano(m))}</span></div></div>`;
}
// ---- Passo 5: fazendo tudo / resultado ----
function mtP5(m){
  const ativos=mtAtivos(m);
  const linhas=ativos.map(it=>{ const ex=it.exec||{}; const key=ex.key||(it.escolha==='existe'?it.key:'');
    const link=key?`<a href="${jiraBase()}/browse/${encodeURIComponent(key)}" target="_blank" rel="noopener"><b>${esc(key)}</b> ↗</a>`:`<b>🆕 ${esc(it.titulo)}</b>`;
    const li=[];
    if(it.escolha==='novo') li.push(ex.key?`<span class="ok">✓ criado ${esc(ex.key)}${ex.semResp?' <span class="muted small">(sem responsável — o projeto não deixou atribuir a você)</span>':''}</span>`:ex.erroCriar?`<span class="nok">✗ criar: ${esc(ex.erroCriar)}</span>`:ex.rodando==='criar'?'<span>⏳ criando…</span>':'<span class="muted">· criar</span>');
    const seg=ex.apontou?(ex.segApontado||parseTempo(it.tempo||'')||0):(parseTempo(it.tempo||'')||0);
    if(seg||ex.erroApontar) li.push(ex.apontou?`<span class="ok">✓ ${esc(fmtH(seg))} apontadas em ${esc(fmtBR(ex.diaApontado||it.dia||m.dia))}</span>`:ex.erroApontar?`<span class="nok">✗ horas: ${esc(ex.erroApontar)}</span>`:ex.rodando==='apontar'?'<span>⏳ apontando…</span>':`<span class="muted">· ${esc(fmtH(seg))}</span>`);
    const querSt=it.escolha==='existe'?!!it.stId:!!it.stCat;
    if(querSt||ex.stOk||ex.erroSt) li.push(ex.stOk?`<span class="ok">✓ status: ${esc(ex.stNome||'')}${ex.stMeio?` <span class="muted small">(passando por ${esc(ex.stMeio)})</span>`:''}</span>`:ex.erroSt?`<span class="nok">✗ status: ${esc(ex.erroSt)}</span>`:ex.rodando==='status'?'<span>⏳ movendo…</span>':'<span class="muted">· status</span>');
    if(!li.length) li.push('<span class="muted">nada a fazer neste (só confirmado)</span>');
    return `<div class="mt-res"><div>${link} <span class="muted small">${esc(it.projeto)} · ${esc(String(it.atividade||'').slice(0,70))}</span>${key?` <button class="btn mt-mini" data-gx-det="${escA(key)}" data-tip="Abrir a ficha do ticket">🔍 ficha</button>`:''}</div><div class="qk-acoes" style="margin-top:4px">${li.join(' &nbsp;·&nbsp; ')}</div></div>`; }).join('');
  const falhas=mtFalhas(m);
  return `<div class="mt-p5 mt-result">${m.executando?'<div class="pl-dica">⏳ Fazendo tudo, item por item… não feche a tela.</div>':falhas?`<div class="ap-fb warn" style="display:block">⚠ ${falhas} ação(ões) não deram certo — veja o motivo em cada linha. Dá para corrigir em <b>3. Horas</b> ou <b>4. Status</b> (clique no passo) e confirmar de novo, ou só tentar de novo: o que já deu certo não é refeito.</div>`:'<div class="pl-dica">🎉 Pronto! Tudo registrado no Jira no seu usuário — a Início e o ⏱ Apontar já contam com isso.</div>'}
    ${linhas}
    <div class="mt-acoes">${(!m.executando&&falhas)?'<button class="btn primario" id="mt-retry">↻ Tentar de novo o que falhou</button>':''}${!m.executando?'<button class="btn" id="mt-novo">🧾 Contar mais coisas</button><button class="btn" data-goto="apontar">Ver no ⏱ Apontar →</button>':''}</div></div>`;
}

// ============================== AÇÕES ==============================
// Passo 1 → 2: o servidor separa o relato em itens e traz os candidatos nos abertos de cada projeto.
async function mtEntender(){
  const m=estado.meus; const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const texto=(m.texto||'').trim();
  if(!texto){ m.erro='Escreva o que você fez — uma linha por projeto.'; renderMeusTickets(); return; }
  m.interpretando=true; m.erro=''; renderMeusTickets();
  try{
    try{ garanteProjetos().catch(()=>{}); }catch(e){}
    const j=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ meus:1, texto, dia:m.dia, email:id.email, token:id.token })}).then(r=>r.json());
    if(!j||!j.ok) throw new Error((j&&j.erro)||'Não consegui entender o texto.');
    m.ia=!!j.ia; m.avisos=j.avisos||[]; m.projetos=j.projetos||[];
    const conferir=[];
    m.itens=(j.itens||[]).map((x,i)=>{ const top=(x.cands||[])[0];
      // Chave citada no relato que NÃO está entre os abertos (fechada, ou de outro projeto): a pessoa disse qual é —
      // confere pela ficha e usa ela; até a resposta o item fica sem escolha (o Próximo não libera um "criar" duplicado).
      const citada=!!(x.chave&&MT_RE_CHAVE.test(x.chave)&&!(top&&top.k===x.chave));
      const existe=!citada&&!!(top&&top.nota>=0.6);
      if(citada) conferir.push(i);
      return Object.assign({}, x, { i, escolha: citada?'':(existe?'existe':(x.projeto?'novo':'')), key: existe?top.k:'', statusAtual: existe?top.status:'',
        chaveTxt: citada?x.chave:'', tempo:x.tempoTexto||'', comentario:x.atividade, dia:m.dia, stId:'', stNome:'',
        stCat:x.concluido?'done':'',   // vale só se o item virar "novo"; nos existentes manda o stId (sugerido pelo mtCarregaTrans)
        trans:null, exec:null, tipo: x.tipo||mtTipoDoCatalogo(x.projeto) }); });
    m.passo=2; m.feito=false;
    m.interpretando=false; mtRender();
    conferir.forEach(i=>mtChaveOk(i));
    return;
  }catch(e){ m.erro=humanizaErro(e.message||e); }
  m.interpretando=false; mtRender();
}
// Troca/escolha de projeto num item: rebusca os candidatos nos abertos daquele projeto (lista de 3 min).
async function mtRebusca(i, proj){
  const m=estado.meus; const it=m.itens[i]; if(!it) return;
  it.projeto=proj; it.trocandoProj=false; it.projetoNome=(projNome(proj)||proj); it.cands=[]; it.escolha=proj?'novo':''; it.key='';
  mtTrocaTicket(it); it.tipo=mtTipoDoCatalogo(proj);
  if(!proj){ renderMeusTickets(); return; }
  it.buscando=true; renderMeusTickets();
  let j=null;
  try{ j=await fetch(`/api/reunioes?abertos=${encodeURIComponent(proj)}`).then(r=>r.json()); }
  catch(e){ /* sem candidatos: a pessoa decide criar ou informar a chave */ }
  if(it.projeto!==proj) return;   // trocou de novo enquanto esta busca voava: a resposta velha não vale mais
  if(j&&Array.isArray(j.tickets)){ it.cands=mtCandidatos(it.atividade, it.chave, j.tickets); it.truncado=!!j.truncado;
    // Pré-seleciona "é este" só se o item ainda está no "criar" que a troca de projeto deixou (não desfaz um "deixar de fora").
    const top=it.cands[0]; if(top&&top.nota>=0.6&&it.escolha==='novo'){ it.escolha='existe'; it.key=top.k; it.statusAtual=top.status; } }
  it.buscando=false; mtRender();
}
// "Outro ticket": valida a chave digitada pela ficha (qualquer ticket, aberto ou não).
async function mtChaveOk(i){
  const m=estado.meus; const it=m.itens[i]; if(!it) return;
  const k=String(it.chaveTxt||'').trim().toUpperCase();
  if(!MT_RE_CHAVE.test(k)){ it.chaveFb='Chave inválida — use o formato PROJ-123.'; mtRender(); return; }
  it.chaveFb='conferindo…'; mtRender();
  try{
    const d=await fetch(`/api/vencimentos?detalhe=${encodeURIComponent(k)}`).then(r=>r.json());
    if(!d||d.erro||!d.k) throw new Error((d&&d.erro)||'Não achei esse ticket (ou sem permissão).');
    if(String(it.chaveTxt||'').trim().toUpperCase()!==k) return;   // a pessoa já digitou outra chave
    if(it.key!==d.k||it.escolha!=='existe') mtTrocaTicket(it);
    it.key=d.k; it.keyResumo=d.resumo||''; it.keyStatus=d.status||''; it.statusAtual=d.status||''; it.escolha='existe'; it.chaveFb='';
    // O ticket informado manda no projeto do item (pode ser de outro projeto que o da linha do relato).
    if(d.p&&d.p!==it.projeto){ it.projeto=d.p; it.projetoNome=d.pNome||d.p; it.tipo=mtTipoDoCatalogo(d.p); }
  }catch(e){ it.chaveFb=`${k}: ${String(e.message||e)}`; }
  mtRender();
}
// Transições possíveis AGORA para a pessoa num ticket existente (lazy, no passo 4).
function mtCarregaTrans(it){
  const id=idApontar(); if(!id) return;
  it.transCarr=true; it.transErro='';
  fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ listar:true, issue:it.key, email:id.email, token:id.token })})
    .then(r=>r.json()).then(j=>{ it.transCarr=false;
      if(!j||!j.ok){ it.transErro=humanizaErro((j&&j.erro)||'Falha ao listar as transições.'); return; }
      it.trans=j.transicoes||[];
      if(it.concluido&&!it.stId){ const d=it.trans.find(t=>t.categoria==='done'); if(d){ it.stId=d.id; it.stNome=d.para||d.nome; } } })
    .catch(e=>{ it.transCarr=false; it.transErro=humanizaErro(e); })
    .finally(()=>{ if(estado.vista==='meustickets'&&estado.meus.passo===4) renderMeusTickets(); });
}
// Confirmar tudo: cria o que faltar, aponta as horas e move os status — item a item, com o resultado de cada
// passo guardado em it.exec (o "tentar de novo" só refaz o que falhou; o que já foi criado não é recriado).
async function mtExecuta(){
  const m=estado.meus; const id=idApontar(); if(!id){ abreIdentidade(); return; }
  if(m.executando) return;
  m.executando=true; m.executou=true; m.passo=5; m.feito=false; renderMeusTickets();
  // O relato virou ações: o rascunho sai já (recarregar a página não pode oferecer lançar tudo de novo).
  // O "Tentar de novo" não depende dele — usa o estado em memória (it.exec).
  mtLimpaRasc();
  const H={ method:'POST', headers:{'Content-Type':'application/json'} };
  const post=(url,corpo)=>fetch(url,Object.assign({},H,{ body:JSON.stringify(Object.assign({},corpo,{ email:id.email, token:id.token })) })).then(r=>r.json());
  let criados=0, apontados=0, movidos=0;
  for(const it of mtAtivos(m)){
    it.exec=it.exec||{}; const ex=it.exec;
    if(it.escolha==='novo'&&!ex.key){
      ex.rodando='criar'; ex.erroCriar=''; mtRender();
      try{
        const tipo=it.tipo||mtTipoDoCatalogo(it.projeto);
        if(!tipo||!tipo.id) throw new Error(`não achei um tipo de ticket utilizável em ${it.projeto}`);
        const desc=`${it.atividade}\n\nRegistrado pelo assistente "Preciso criar meus tickets" em ${fmtBR(it.dia||m.dia)}.`;
        // Atribuído a quem cria (mesma regra da árvore do 📝 Criar ticket) — é o que faz o ticket aparecer no "Só os meus".
        const base={ projeto:it.projeto, tipoId:String(tipo.id), resumo:String(it.titulo||'').trim().slice(0,250), descricao:desc, venc:it.dia||m.dia };
        let j=await post('/api/criar',{ itens:[Object.assign({},base, id.accountId?{ respId:id.accountId }:{})] });
        let c=j&&j.criados&&j.criados[0];
        const errTxt=(jj)=>(jj&&jj.erros&&jj.erros[0]&&jj.erros[0].erro)||(jj&&jj.erro)||'';
        if((!c||!c.key)&&id.accountId&&/assignee|atribu|respons/i.test(errTxt(j))){   // projeto não deixa atribuir: cria sem responsável
          j=await post('/api/criar',{ itens:[base] }); c=j&&j.criados&&j.criados[0]; if(c&&c.key) ex.semResp=true;
        }
        if(!c||!c.key) throw new Error(errTxt(j)||'falha ao criar o ticket');
        ex.key=c.key; criados++; logAcao({acao:'meus-criar', t:c.key, para:it.projeto, ok:true}, false);
      }catch(e){ ex.erroCriar=humanizaErro(e.message||e); }
      ex.rodando='';
    }
    const key=ex.key||(it.escolha==='existe'?it.key:'');
    const seg=parseTempo(it.tempo||'')||0;
    // Cada rodada reavalia do zero o que ainda não deu certo: um erro corrigido (ou desistido) nas Horas/Status
    // não pode ficar "falhando" para sempre.
    if(key&&!ex.apontou){
      ex.erroApontar='';
      if(mtTempoRuim(it.tempo)){
        ex.erroApontar=`tempo "${String(it.tempo).trim()}" não entendido (use 1h30, 45m ou 2h; mínimo 1m, máximo 24h) — volte às Horas e corrija`;
      } else if(seg){
        ex.rodando='apontar'; mtRender();
        try{
          const inicio=it.dia||m.dia;
          const j=await post('/api/apontar',{ issue:key, segundos:seg, inicio, comentario:String(it.comentario||it.atividade||'').trim() });
          if(!j||!j.ok) throw new Error((j&&j.erro)||'falha ao apontar');
          ex.apontou=true; ex.segApontado=seg; ex.diaApontado=inicio; apontados++;
          try{ registraExtraDia(inicio, seg, key); }catch(e){}
          logAcao({acao:'apontar', t:key, para:fmtH(seg)+' em '+inicio, ok:true}, false);
        }catch(e){ ex.erroApontar=humanizaErro(e.message||e); }
        ex.rodando='';
      }
    }
    const querSt=it.escolha==='existe'?!!it.stId:!!it.stCat;
    if(key&&!ex.stOk) ex.erroSt='';
    if(key&&querSt&&!ex.stOk){
      ex.rodando='status'; mtRender();
      try{
        const listar=async()=>{ const lj=await post('/api/transicao',{ listar:true, issue:key });
          if(!lj||!lj.ok) throw new Error((lj&&lj.erro)||'não consegui listar as transições'); return lj.transicoes||[]; };
        const mover=async(tid)=>{ const j=await post('/api/transicao',{ issue:key, transitionId:tid });
          if(!j||!j.ok) throw new Error((j&&j.erro)||'falha ao mover o status'); };
        if(it.escolha==='existe'){ await mover(it.stId); ex.stNome=it.stNome; }
        else {   // ticket novo: escolhe pela categoria pedida no que o fluxo oferece AGORA
          let lista=await listar(); let t=lista.find(x=>x.categoria===it.stCat);
          // Fluxo que não deixa ir direto para Concluído: passa por Em andamento e tenta de novo (um salto, no máximo).
          if(!t&&it.stCat==='done'){ const meio=lista.find(x=>x.categoria==='indeterminate');
            if(meio){ await mover(meio.id); ex.stMeio=meio.para||meio.nome; lista=await listar(); t=lista.find(x=>x.categoria==='done'); } }
          if(!t) throw new Error(`o fluxo não oferece "${it.stCat==='done'?'Concluído':'Em andamento'}" agora${ex.stMeio?` (o ticket ficou em ${ex.stMeio})`:''}${lista.length?` — disponíveis: ${lista.map(x=>x.para||x.nome).join(', ')}`:''}`);
          await mover(t.id); ex.stNome=t.para||t.nome;
        }
        ex.stOk=true; movidos++; logAcao({acao:'status', t:key, para:ex.stNome, ok:true}, false);
      }catch(e){ ex.erroSt=humanizaErro(e.message||e); }
      ex.rodando='';
    }
    mtRender();
  }
  m.executando=false; m.feito=true;
  try{ salvaCfg(); }catch(e){}
  invalidaCacheDados(); estado.apontar.porData={}; estado.apontar.recentes=null;
  const falhas=mtFalhas(m);
  toast(falhas?`⚠ ${falhas} ação(ões) não deram certo — veja o motivo e tente de novo.`:`🎉 Pronto: ${criados} ticket(s) criado(s), ${apontados} apontamento(s), ${movidos} status.`, falhas?'warn':'ok');
  mtRender();
}
// 🎤 Ditar (Web Speech, pt-BR) — o texto entra no campo e no estado.
function mtMic(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ toast('Este navegador não dita — use o microfone do teclado do celular.','warn'); return; }
  const m=estado.meus; const btn=document.getElementById('mt-mic');
  const rec=new SR(); rec.lang='pt-BR'; rec.interimResults=false; rec.maxAlternatives=1;
  if(btn){ btn.textContent='🎙 ouvindo…'; btn.disabled=true; }
  const solta=()=>{ const b=document.getElementById('mt-mic'); if(b){ b.textContent='🎤 Ditar'; b.disabled=false; } };
  rec.onresult=(ev)=>{ try{ const t=ev.results[0][0].transcript||''; m.texto=((m.texto||'').trim()+(m.texto?'\n':'')+t).trim(); mtSalvaRasc();
      const ta=document.getElementById('mt-texto'); if(ta) ta.value=m.texto; }catch(e){} };
  rec.onerror=(ev)=>{ solta(); if(ev&&ev.error==='not-allowed') toast('Permita o microfone para ditar.','warn'); };
  rec.onend=solta;
  try{ rec.start(); }catch(e){ solta(); }
}

// ============================== LISTENERS (delegados em #conteudo) ==============================
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='meustickets') return;
  const t=e.target.closest&&e.target.closest('[data-mt-ir],[data-mt-dia],#mt-entender,#mt-mic,#mt-limpar,[data-mt-usar],[data-mt-novo],[data-mt-pular],[data-mt-chave-ok],[data-mt-trocaproj],#mt-p2-ok,[data-mt-chip],#mt-p3-ok,[data-mt-st],[data-mt-stcat],[data-mt-retrans],#mt-confirmar,#mt-retry,#mt-novo');
  if(!t) return;
  const m=estado.meus;
  const idx=(a)=>{ const v=t.getAttribute(a)||''; return v.split('|'); };
  if(t.hasAttribute('data-mt-ir')){ const n=+t.getAttribute('data-mt-ir'); if(mtPodeVoltar(m,n)){ m.passo=n; renderMeusTickets(); } return; }
  if(t.hasAttribute('data-mt-dia')){ m.dia=t.getAttribute('data-mt-dia'); mtSalvaRasc(); renderMeusTickets(); return; }
  if(t.id==='mt-entender'){ mtEntender(); return; }
  if(t.id==='mt-mic'){ mtMic(); return; }
  if(t.id==='mt-limpar'){ m.texto=''; m.erro=''; mtLimpaRasc(); renderMeusTickets(); return; }
  if(t.hasAttribute('data-mt-usar')){ const [i,k]=idx('data-mt-usar'); const it=m.itens[+i]; if(!it) return;
    if(it.escolha!=='existe'||it.key!==k) mtTrocaTicket(it);   // status escolhido era de outro ticket
    it.escolha='existe'; it.key=k; const c=(it.cands||[]).find(x=>x.k===k); if(c){ it.statusAtual=c.status; } else if(it.key===k&&it.keyStatus){ it.statusAtual=it.keyStatus; }
    if(e.target.tagName!=='INPUT') e.preventDefault(); renderMeusTickets(); return; }
  if(t.hasAttribute('data-mt-novo')){ const it=m.itens[+t.getAttribute('data-mt-novo')]; if(!it||!it.projeto) return;
    if(it.escolha!=='novo'){ mtTrocaTicket(it); it.escolha='novo'; it.key=''; if(it.concluido&&!it.stCat) it.stCat='done';
      const noTitulo=!!(e.target.hasAttribute&&e.target.hasAttribute('data-mt-titulo'));
      renderMeusTickets();
      // O clique pode ter sido no próprio campo do título (o redesenho o recriou): devolve o foco ao campo novo, cursor no fim.
      const inp=document.querySelector(`[data-mt-titulo="${it.i}"]`);
      if(inp&&(noTitulo||e.target.type!=='radio')) try{ inp.focus(); const n=inp.value.length; inp.setSelectionRange(n,n); }catch(x){} }
    return; }
  if(t.hasAttribute('data-mt-pular')){ const it=m.itens[+t.getAttribute('data-mt-pular')]; if(!it) return; it.escolha='pular'; if(e.target.tagName!=='INPUT') e.preventDefault(); renderMeusTickets(); return; }
  if(t.hasAttribute('data-mt-chave-ok')){ mtChaveOk(+t.getAttribute('data-mt-chave-ok')); return; }
  if(t.hasAttribute('data-mt-trocaproj')){ const it=m.itens[+t.getAttribute('data-mt-trocaproj')]; if(!it) return; it.trocandoProj=true; renderMeusTickets(); return; }
  if(t.id==='mt-p2-ok'){ m.passo=3; renderMeusTickets(); return; }
  if(t.hasAttribute('data-mt-chip')){ const [i,c]=idx('data-mt-chip'); const it=m.itens[+i]; if(!it) return; it.tempo=c;
    const inp=document.querySelector(`[data-mt-tempo="${i}"]`); if(inp){ inp.value=c; inp.removeAttribute('aria-invalid'); }
    const tot=document.getElementById('mt-total'); if(tot) tot.textContent=fmtH(mtTotalSeg(m));
    // Libera o Próximo só se NENHUM item tiver tempo inválido (o chip conserta este, não os outros).
    if(mtTemposInvalidos(m)) renderMeusTickets(); else { const ok=document.getElementById('mt-p3-ok'); if(ok) ok.disabled=false; }
    return; }
  if(t.id==='mt-p3-ok'){ if(mtTemposInvalidos(m)){ renderMeusTickets(); return; } m.passo=4; renderMeusTickets(); return; }
  if(t.hasAttribute('data-mt-st')){ const [i,id,nome,cat]=idx('data-mt-st'); const it=m.itens[+i]; if(!it) return; it.stId=id||''; it.stNome=nome||''; it.stCatSel=cat||''; renderMeusTickets(); return; }
  if(t.hasAttribute('data-mt-stcat')){ const [i,c]=idx('data-mt-stcat'); const it=m.itens[+i]; if(!it) return; it.stCat=c||''; renderMeusTickets(); return; }
  if(t.hasAttribute('data-mt-retrans')){ const it=m.itens[+t.getAttribute('data-mt-retrans')]; if(!it) return; it.trans=null; it.transErro=''; renderMeusTickets(); return; }
  if(t.id==='mt-confirmar'){ mtExecuta(); return; }
  if(t.id==='mt-retry'){ mtExecuta(); return; }
  if(t.id==='mt-novo'){ mtLimpaRasc(); estado.meus=mtEstadoNovo(m.dia); renderMeusTickets(); return; }
});
document.getElementById('conteudo').addEventListener('input',(e)=>{
  if(estado.vista!=='meustickets') return;
  const t=e.target; if(!t||!t.getAttribute) return; const m=estado.meus;
  if(t.id==='mt-texto'){ m.texto=t.value; mtSalvaRasc(); return; }
  // Dia no futuro (digitado; o seletor já barra): volta o campo ao dia em vigor e avisa — a tela nunca mostra um dia que não vale.
  if(t.id==='mt-dia'){ if(t.value&&t.value<=hojeSP()){ m.dia=t.value; mtSalvaRasc();
      document.querySelectorAll('[data-mt-dia]').forEach(b=>b.setAttribute('aria-pressed', String(b.getAttribute('data-mt-dia')===m.dia))); }   // sem redesenhar: o foco fica no campo
    else if(t.value){ t.value=m.dia; toast('O dia do trabalho não pode ser no futuro.','warn'); } return; }
  const attrs=['data-mt-titulo','data-mt-tempo','data-mt-idia','data-mt-com','data-mt-chave'];
  const a=attrs.find(x=>t.hasAttribute(x)); if(!a) return;
  const it=m.itens[+t.getAttribute(a)]; if(!it) return;
  if(a==='data-mt-titulo'){ it.titulo=t.value; if(it.escolha!=='novo'&&it.projeto){ it.escolha='novo'; it.key=''; } const ok=document.getElementById('mt-p2-ok'); if(ok) ok.disabled=!m.itens.every(x=>x.escolha==='pular'||(x.escolha==='existe'&&x.key)||(x.escolha==='novo'&&x.projeto&&(x.titulo||'').trim())); return; }
  if(a==='data-mt-tempo'){ it.tempo=t.value; const tot=document.getElementById('mt-total'); if(tot) tot.textContent=fmtH(mtTotalSeg(m));
    if(mtTempoRuim(t.value)) t.setAttribute('aria-invalid','true'); else t.removeAttribute('aria-invalid');
    const ok=document.getElementById('mt-p3-ok'); if(ok) ok.disabled=mtTemposInvalidos(m)>0; return; }
  if(a==='data-mt-idia'){ if(t.value&&t.value<=hojeSP()) it.dia=t.value; else if(t.value){ t.value=it.dia||m.dia; toast('O dia do apontamento não pode ser no futuro.','warn'); } return; }
  if(a==='data-mt-com'){ it.comentario=t.value; return; }
  if(a==='data-mt-chave'){ it.chaveTxt=t.value; return; }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='meustickets') return;
  const t=e.target; if(!t||!t.hasAttribute||!t.hasAttribute('data-mt-proj')) return;
  mtRebusca(+t.getAttribute('data-mt-proj'), String(t.value||'').toUpperCase());
});
document.getElementById('conteudo').addEventListener('keydown',(e)=>{
  if(estado.vista!=='meustickets'||e.key!=='Enter') return;
  const t=e.target; if(!t||!t.hasAttribute) return;
  if(t.hasAttribute('data-mt-chave')){ e.preventDefault(); mtChaveOk(+t.getAttribute('data-mt-chave')); }
});
