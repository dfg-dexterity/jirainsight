// Jira Insights · 21 · 🎫 CRIAÇÃO RÁPIDA por linguagem natural/voz (prévia acionável via /api/criar {magico:1})
// e 📨 CONVIDAR PARA APONTAR em qualquer ticket.
// ===========================================================================
// 📨 Convidar para apontar — em QUALQUER ticket (não só reunião). Reusa a
// infraestrutura de convites da Agenda (/api/apontar {convidar:true}): cada
// pessoa recebe o convite no painel (⏱ Apontar/📥 Inbox) e confirma com 1
// clique (worklog no usuário DELA). O aviso do Teams sai INDIVIDUAL (chat
// privado) quando TEAMS_DM_WEBHOOK_URL está configurada na Vercel; além
// disso, o modal oferece o link de chat 1:1 pré-preenchido por pessoa.
// ===========================================================================
// ===========================================================================
// 🎫 Criação rápida por LINGUAGEM NATURAL (home): o texto (digitado ou ditado)
// vai para /api/criar {magico:1} — a IA resolve projeto, épico, título,
// descrição e vencimento; a PRÉVIA editável aparece num modal e só cria após
// confirmar. O modo {confirmar:1} direto é o usado pelos Atalhos da Siri.
// ===========================================================================
let _qkPrev=null, _qkPessoas=[], _qkStatus=[], _qkMenc=[];
const QK_ACAO_NOME={responsavel:'responsável',tempo:'apontamento',comentario:'comentário',status:'status'};
async function qkCria(){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const texto=(estado.qk.texto||'').trim();
  if(!texto){ toast('Descreva o ticket no campo (ou dite pelo 🎤).','warn'); return; }
  estado.qk.criando=true; if(estado.vista==='acoes') renderAcoes();
  try{
    const r=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({magico:1, texto, email:id.email, token:id.token})});
    const j=await r.json();
    estado.qk.criando=false;
    if(!j||!j.ok||!j.previa){
      toast((j&&j.erro)||'Não consegui interpretar o pedido.','err');
      if(estado.vista==='acoes') renderAcoes(); return; }
    _qkPrev=j.previa; _qkPessoas=Array.isArray(j.pessoas)?j.pessoas:[];
    _qkStatus=Array.isArray(j.statusOpcoes)?j.statusOpcoes:[];
    _qkMenc=(j.previa.mencoes||[]).slice();
    qkAbrePrevia();
  }catch(e){ estado.qk.criando=false; toast(humanizaErro(e),'err'); }
  if(estado.vista==='acoes') renderAcoes();
}
// Opções de pessoa (responsável e menções) — a lista vem do servidor junto da prévia.
function qkPessoasOpc(sel){
  return _qkPessoas.map(p=>`<option value="${escA(p.id)}"${p.id===sel?' selected':''}>${esc(p.nome)}</option>`).join('');
}
function qkMencHTML(){
  if(!_qkMenc.length) return '<span class="muted small">ninguém marcado — escolha abaixo para avisar alguém no comentário</span>';
  return _qkMenc.map(m=>`<span class="chip" data-tip="Vai como @menção no comentário — a pessoa recebe a notificação do Jira">@${esc(m.nome||m.id)}
    <button class="qk-x" data-qk-menc-rm="${escA(m.id)}" title="Não marcar ${escA(m.nome||m.id)}">✕</button></span>`).join('');
}
function qkAtualizaMenc(){
  const c=document.getElementById('qk-p-menc'); if(c) c.innerHTML=qkMencHTML();
  const s=document.getElementById('qk-p-menc-add'); if(s) s.value='';
}
function qkAbrePrevia(){
  const p=_qkPrev; if(!p) return;
  const stSel=p.statusNome||'';
  const stOpc=(_qkStatus.length?_qkStatus:(stSel?[{nome:stSel,cat:p.statusCat||''}]:[]));
  abreModal(`<h2>🎫 Confirme o ticket</h2>
    <div class="muted small">A IA interpretou assim — ajuste o que quiser antes de criar. Além de abrir o ticket, dá para já
      <b>atribuir a alguém</b>, <b>apontar horas</b>, <b>comentar marcando pessoas</b> e <b>mudar o status</b>.</div>
    ${(p.avisos||[]).map(a=>`<div class="aviso" style="margin-top:8px">⚠ ${esc(a)}</div>`).join('')}
    <div class="alx-campo"><label>Projeto</label>
      <div><strong>${esc(p.projeto)}</strong> — ${esc(p.projetoNome)} <span class="muted small">· tipo ${esc(p.tipoNome||'Tarefa')}</span></div></div>
    ${p.epicoKey?`<div class="alx-campo"><label>Épico</label><div><strong>${esc(p.epicoKey)}</strong> — ${esc(p.epicoNome||'')}</div></div>`:''}
    <div class="alx-campo"><label>Título <span class="req">*</span></label>
      <input id="qk-p-resumo" class="alx-motivo" value="${escA(p.resumo)}" maxlength="250"></div>
    <div class="alx-campo"><label>Descrição</label>
      <textarea id="qk-p-desc" class="alx-coment" style="min-height:90px">${esc(p.descricao||'')}</textarea></div>
    <div class="qk-grid">
      <div class="alx-campo"><label>👤 Responsável</label>
        ${_qkPessoas.length
          ?`<select id="qk-p-resp"><option value="">— sem responsável —</option>${qkPessoasOpc(p.respId||'')}</select>`
          :'<div class="muted small">Lista de pessoas indisponível (o seu token não pode procurar usuários no Jira) — atribua depois pela 🛠 Gestão.</div>'}</div>
      <div class="alx-campo"><label>📅 Vencimento</label>
        <input type="date" id="qk-p-venc" value="${escA(p.venc||'')}"></div>
      <div class="alx-campo"><label>⏱ Apontar horas <span class="muted" style="font-weight:400">— sai no SEU usuário</span></label>
        <input type="text" id="qk-p-tempo" value="${escA(p.tempoTexto||'')}" placeholder="ex.: 30m, 1h30, 2h">
        <div class="ap-chips" style="margin-top:6px">${['30m','1h','2h'].map(c=>`<button class="chip" data-qk-t="${c}">${c}</button>`).join('')}
          <button class="chip" data-qk-t="" data-tip="Criar sem apontar horas">sem apontar</button></div></div>
      <div class="alx-campo"><label>🔀 Status ao criar</label>
        ${stOpc.length
          ?`<select id="qk-p-status"><option value="">— manter o status inicial —</option>${
             stOpc.map(s=>`<option value="${escA(s.nome)}"${s.nome===stSel?' selected':''}>${esc(s.nome)}</option>`).join('')}</select>`
          :'<div class="muted small">O Jira não devolveu os status deste projeto — mova o ticket depois pela 🛠 Gestão.</div>'}</div>
    </div>
    <div class="alx-campo"><label>💬 Comentário no ticket <span class="muted" style="font-weight:400">(opcional)</span></label>
      <textarea id="qk-p-coment" class="alx-coment" style="min-height:64px" placeholder="ex.: Esse é o ticket da nossa conversa">${esc(p.comentario||'')}</textarea></div>
    <div class="alx-campo"><label>📣 Marcar pessoas no comentário</label>
      <div class="qk-menc" id="qk-p-menc">${qkMencHTML()}</div>
      ${_qkPessoas.length?`<select id="qk-p-menc-add" style="margin-top:8px;max-width:280px"><option value="">+ marcar alguém…</option>${qkPessoasOpc('')}</select>`:''}</div>
    <div class="alx-fb" id="qk-fb" hidden></div>
    <div class="alx-modal-acoes">
      <button class="btn primario" id="qk-prev-conf">✓ Criar o ticket</button>
      <button class="btn" id="gx-fechar">Cancelar</button></div>`);
}
async function qkConfirma(){
  const p=_qkPrev; const id=idApontar(); if(!p||!id) return;
  const fb=document.getElementById('qk-fb');
  const resumo=((document.getElementById('qk-p-resumo')||{}).value||'').trim();
  const descricao=((document.getElementById('qk-p-desc')||{}).value||'').trim();
  const venc=((document.getElementById('qk-p-venc')||{}).value||'').trim();
  const respId=((document.getElementById('qk-p-resp')||{}).value||'').trim();
  const statusNome=((document.getElementById('qk-p-status')||{}).value||'').trim();
  const comentario=((document.getElementById('qk-p-coment')||{}).value||'').trim();
  const tempoTxt=((document.getElementById('qk-p-tempo')||{}).value||'').trim();
  if(!resumo){ if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb erro'; fb.textContent='Dê um título ao ticket.'; } return; }
  let tempoSeg=0;
  if(tempoTxt){
    tempoSeg=parseTempo(tempoTxt)||0;
    if(!tempoSeg||tempoSeg<60||tempoSeg>24*3600){
      if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb erro'; fb.textContent='Tempo inválido — use 30m, 1h30, 2h ou deixe em branco.'; } return; }
  }
  if(_qkMenc.length&&!comentario){
    if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb erro'; fb.textContent='Escreva o comentário — é nele que as pessoas marcadas serão avisadas.'; } return; }
  const bt=document.getElementById('qk-prev-conf'); if(bt) bt.disabled=true;
  if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb'; fb.textContent='Criando o ticket e executando as ações…'; }
  try{
    const r=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({magico:1, confirmar:1, projeto:p.projeto, epicoKey:p.epicoKey||'',
        resumo, descricao, venc, respId, tempoSeg, statusNome, comentario, mencoes:_qkMenc,
        email:id.email, token:id.token})});
    const j=await r.json();
    if(!j||!j.ok||!j.key) throw new Error((j&&j.erro)||'Falha ao criar o ticket.');
    const acoes=Array.isArray(j.acoes)?j.acoes:[];
    estado.qk.texto=''; _qkPrev=null; _qkMenc=[]; invalidaCacheDados();
    abreModal(`<h2>🎫 Ticket criado!</h2>
      <div class="alx-fb ap-fb ok" style="display:block">✓ <a href="${jiraBase()}/browse/${encodeURIComponent(j.key)}" target="_blank" rel="noopener"><strong>${esc(j.key)}</strong> ↗</a> — ${esc(resumo)}
        <br><span class="muted small">${esc(p.projetoNome)}${p.epicoKey?` · épico ${esc(p.epicoNome||p.epicoKey)}`:''}${venc?` · vence ${esc(venc.split('-').reverse().join('/'))}`:''}</span></div>
      ${acoes.length?`<div class="qk-acoes">${acoes.map(a=>a.ok
        ?`<div class="ok">✓ ${esc(a.detalhe||a.tipo)}</div>`
        :`<div class="nok">✕ ${esc(QK_ACAO_NOME[a.tipo]||a.tipo)}: ${esc(a.erro||'não deu certo')}</div>`).join('')}</div>`:''}
      ${acoes.some(a=>!a.ok)?'<div class="muted small" style="margin-top:6px">O ticket foi criado — o que falhou dá para resolver na 🛠 Gestão ou direto no Jira.</div>':''}
      <div class="alx-modal-acoes">
        <button class="btn primario" data-gx-conv="${escA(j.key)}" data-tip="Já convide quem vai trabalhar junto">📨 Convidar para apontar</button>
        <button class="btn" id="gx-fechar">Fechar</button></div>`);
    if(estado.vista==='acoes') renderAcoes();
  }catch(e){ if(fb){ fb.className='alx-fb ap-fb erro'; fb.textContent=humanizaErro(e); } if(bt) bt.disabled=false; }
}
function qkMic(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ toast('Ditado não disponível neste navegador — use o microfone do teclado do celular.','warn'); return; }
  try{
    const rec=new SR(); rec.lang='pt-BR'; rec.interimResults=false; rec.maxAlternatives=1;
    const btn=document.getElementById('qk-mic'); if(btn){ btn.textContent='🎙 ouvindo…'; btn.disabled=true; }
    const solta=()=>{ const b=document.getElementById('qk-mic'); if(b){ b.textContent='🎤 Ditar'; b.disabled=false; } };
    rec.onresult=(e)=>{ try{ const txt=e.results[0][0].transcript||'';
      estado.qk.texto=((estado.qk.texto||'').trim()+' '+txt).trim();
      const ta=document.getElementById('qk-texto'); if(ta) ta.value=estado.qk.texto; }catch(err){} };
    rec.onend=solta; rec.onerror=(e)=>{ solta(); if(e&&e.error==='not-allowed') toast('Permita o microfone para ditar.','warn'); };
    rec.start();
  }catch(e){ toast('Não consegui iniciar o ditado aqui.','warn'); }
}
function qkSiriModal(){
  const id=idApontar();
  const corpo=`{"magico":1,"confirmar":1,"texto":"[Texto ditado]","email":"${id?esc(id.email):'seu-email@dexterityit.com.br'}","token":"[seu token de API do Jira]"}`;
  abreModal(`<h2>📱 Criar ticket por voz no celular</h2>
    <div class="muted small">Três caminhos: o <b>app instalável de um toque</b> (recomendado), o <b>Atalho da Siri</b> (cria só falando) e a <b>skill da Alexa</b>.</div>
    <div class="mt-sec"><h3>📲 App de um toque na tela de início (recomendado)</h3>
      <div class="muted small" style="line-height:1.7">Abra <a href="/voz.html" target="_blank" rel="noopener"><b>jirainsight.vercel.app/voz.html</b> ↗</a> no celular →
        <b>Compartilhar</b> (□↑) → <b>"Adicionar à Tela de Início"</b>. Vira o app <b>🎫 Criar Ticket</b>: abre direto no campo,
        você <b>dita pelo microfone do teclado</b> (ou digita), confere a prévia e cria. No primeiro uso do app instalado ele pede seu e-mail + token do Jira (ficam só no aparelho). Funciona em iPhone e Android.</div></div>
    <div class="mt-sec"><h3>🍎 iPhone — Atalhos da Siri (uma vez só)</h3>
      <div class="muted small" style="margin-bottom:6px;line-height:1.7">⬇️ <b>Atalho pronto:</b> <a href="/criar-ticket.shortcut" download><b>criar-ticket.shortcut</b></a> — já vem com as 4 ações montadas
        (Ditar → criação com IA → resposta falada); só editar o e-mail e colar o seu token. <b>Atenção (regra da Apple):</b> o iPhone só
        instala Atalhos <b>assinados</b> — quem tiver um Mac roda <code>shortcuts sign -m anyone -i criar-ticket.shortcut -o criar-ticket-ok.shortcut</code>
        uma única vez e o arquivo assinado instala em qualquer iPhone. Sem Mac, monte 1× pelos passos abaixo e depois
        distribua ao time por <b>link do iCloud</b> (Compartilhar → Copiar Link do iCloud) — instala com 1 toque.</div>
      <ol style="margin:6px 0 0;padding-left:20px;line-height:1.7">
        <li>Abra o app <b>Atalhos</b> → <b>+</b> novo atalho, nomeie <b>"Criar ticket"</b>.</li>
        <li>Ação <b>"Ditar texto"</b> (idioma Português).</li>
        <li>Ação <b>"Obter conteúdo do URL"</b>: URL <code>https://jirainsight.vercel.app/api/criar</code>, Método <b>POST</b>, Tipo <b>JSON</b>, corpo:
          <pre class="pl-texto" style="white-space:pre-wrap;font-size:11.5px;margin-top:6px">${corpo}</pre>
          <span class="muted small">No campo <code>texto</code>, insira a variável <b>Texto ditado</b>; no <code>token</code>, cole o seu token de API do Jira (o mesmo que você usa aqui no painel).</span></li>
        <li>Ação <b>"Mostrar resultado"</b> escolhendo o campo <code>msg</code> (ou o retorno inteiro).</li>
        <li>Pronto: diga <b>"E aí Siri, Criar ticket"</b> e fale o pedido — ex.: <i>"criar um ticket no projeto da Copel dentro do épico de gestão com a descrição fazer atividade XPTO com vencimento até o dia 31"</i>.</li>
        <li class="muted small">💡 Depois de montar, toque em <b>Compartilhar → Copiar Link do iCloud</b> no Atalho e mande ao time — cada pessoa instala com 1 toque (só troca o token pelo dela). É o único jeito que a Apple aceita para distribuir Atalhos.</li>
      </ol></div>
    <div class="mt-sec"><h3>🤖 Android</h3>
      <div class="muted small" style="line-height:1.6">Instale o painel como app (menu do navegador → <b>Adicionar à tela inicial</b>), abra o 🎫 na Início e use o <b>🎤 Ditar</b> — ou o microfone do teclado. Apps de automação (Tasker/Macrodroid) podem chamar o mesmo endpoint acima por voz.</div></div>
    <div class="mt-sec"><h3>🔊 Alexa — skill pronta para instalar</h3>
      <div class="muted small" style="line-height:1.7">O painel já fala o protocolo da Alexa — diga <b>"Alexa, abrir jira insights"</b> e depois
        <i>"crie um ticket no projeto da Copel, no épico de gestão…"</i>; ela confirma a prévia por voz e cria. Configuração (uma vez, conta gratuita de desenvolvedor Amazon):
        <ol style="margin:6px 0 0;padding-left:20px">
          <li>Em <b>developer.amazon.com/alexa</b> → Alexa Skills Kit → <b>Create Skill</b>: tipo <b>Custom</b>, idioma <b>Português (BR)</b>, hospedagem <b>Provision your own</b>.</li>
          <li>Em <b>Interaction Model → JSON Editor</b>, cole o modelo pronto: <a href="/alexa-skill-model.json" target="_blank" rel="noopener"><b>alexa-skill-model.json</b> ↗</a> e salve/builde.</li>
          <li>Em <b>Endpoint</b>: HTTPS → <code>https://jirainsight.vercel.app/api/criar</code> → certificado "<i>sub-domain of a domain that has a wildcard certificate</i>".</li>
          <li>Copie o <b>Skill ID</b> e defina na Vercel: <code>ALEXA_SKILL_ID</code>, <code>ALEXA_JIRA_EMAIL</code> e <code>ALEXA_JIRA_TOKEN</code> (o e-mail e o token de API do Jira de quem a skill cria os tickets).</li>
          <li>Teste na aba <b>Test</b> (modo Development) — a skill vale nas Alexas da sua conta Amazon, sem precisar de certificação.</li>
        </ol></div></div>
    <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`);
}

let _cv=null;
function abreConvidarApontar(k){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const meuEmail=String(id.email||'').toLowerCase();
  const us=Object.entries(estado.usuarios||{})
    .filter(([a,o])=>o&&o.email&&!RE_EXCLUIR.test(o.nome||'')&&String(o.email).toLowerCase()!==meuEmail
      &&!foraVigencia(a,hojeSP()))
    .map(([a,o])=>({a, nome:o.nome||o.email, email:String(o.email).toLowerCase()}))
    .sort((x,y)=>x.nome.localeCompare(y.nome,'pt'));
  _cv={k, us};
  const apT=((estado.apontar.porData[chaveVenc()]||{}).tickets||[]).find(x=>x.k===k);
  const t=((estado.gestao.dados&&estado.gestao.dados.tickets)||[]).find(x=>x.k===k)||apT||{};
  abreModal(`<h2>📨 Convidar para apontar · ${esc(k)}</h2>
    ${t.resumo?`<div class="muted small">${esc(t.resumo)}</div>`:''}
    <div class="muted small" style="margin-top:6px">Cada pessoa recebe o convite no painel (⏱ Apontar / 📥 Inbox) e
      confirma com 1 clique — o worklog sai <strong>no usuário dela</strong>. O aviso vai por
      <strong>chat individual do Teams</strong> (quando configurado na Vercel) e você ainda ganha o link do chat 1:1 de cada pessoa.</div>
    <div class="alx-campo"><label>Pessoas <span class="req">*</span></label>
      <div class="cv-lista">${us.length?us.map(u=>`<label class="check"><input type="checkbox" data-cv-p="${escA(u.a)}"
        data-cv-nome="${escA(u.nome)}" data-cv-email="${escA(u.email)}"> ${esc(u.nome)}</label>`).join('')
        :'<div class="muted small">Nenhuma pessoa interna com e-mail na lista — clique em ↻ Atualizar no topo e tente de novo.</div>'}</div></div>
    <div class="alx-campo" style="display:flex;gap:10px;flex-wrap:wrap">
      <div class="campo"><label>Tempo por pessoa <span class="req">*</span></label>
        <input id="cv-tempo" placeholder="1h30" style="width:110px" data-tip="Formatos: 1h30 · 1,5h · 45m · 2:15"></div>
      <div class="campo"><label>Dia <span class="req">*</span></label><input type="date" id="cv-dia" value="${escA(hojeSP())}"></div>
      <div class="campo"><label>Apontar também para mim?</label>
        <label class="check" style="margin-top:6px"><input type="checkbox" id="cv-eu"> incluir meu apontamento agora</label></div></div>
    <div class="alx-campo"><label>Comentário do apontamento</label>
      <textarea id="cv-coment" class="alx-coment" placeholder="Ex.: Atividade conjunta — levantamento do processo"></textarea></div>
    <div class="alx-fb" id="cv-fb" hidden></div>
    <div class="alx-modal-acoes">
      <button class="btn primario" id="cv-enviar">📨 Enviar convites</button>
      <button class="btn" id="gx-fechar">Cancelar</button></div>`);
}
async function cvEnviar(){
  const ctx=_cv; const id=idApontar(); if(!ctx||!id) return;
  const fb=document.getElementById('cv-fb');
  const erroFb=(m)=>{ if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb erro'; fb.textContent=m; } };
  const pessoas=[...document.querySelectorAll('[data-cv-p]:checked')].map(x=>({
    accountId:x.getAttribute('data-cv-p'), nome:x.getAttribute('data-cv-nome')||'', email:x.getAttribute('data-cv-email')||'' }));
  const seg=parseTempo((document.getElementById('cv-tempo')||{}).value);
  const dia=((document.getElementById('cv-dia')||{}).value||'').trim();
  const coment=((document.getElementById('cv-coment')||{}).value||'').trim();
  const inclEu=!!(document.getElementById('cv-eu')||{}).checked;
  if(!pessoas.length) return erroFb('Selecione pelo menos uma pessoa.');
  if(!seg||seg<60||seg>24*3600) return erroFb('Tempo inválido — use por exemplo 1h30, 45m ou 2:15.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return erroFb('Informe o dia do apontamento.');
  if(inclEu) pessoas.push({accountId:id.accountId, nome:id.nome||'', email:String(id.email||'').toLowerCase()});
  const bt=document.getElementById('cv-enviar'); if(bt) bt.disabled=true;
  if(fb){ fb.hidden=false; fb.className='alx-fb ap-fb'; fb.textContent='Enviando convites…'; }
  try{
    const r=await fetch('/api/apontar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ convidar:true, issue:ctx.k, segundos:seg, inicio:dia,
        comentario:coment||`Convite de apontamento — ${ctx.k}`, pessoas, avisarTeams:true,
        email:id.email, token:id.token })});
    const j=await r.json();
    if(!j||j.ok===false) throw new Error((j&&j.erro)||'Falha ao enviar os convites.');
    const teams=String(j.teams||'');
    const tTxt=teams.startsWith('individual')?`💬 Aviso individual no Teams enviado (${teams.split(':')[1]||''}).`
      :teams==='canal'?'📣 Aviso publicado no canal do Teams (aviso individual não configurado).'
      :teams==='desligado'?'' : '⚠ Aviso do Teams não configurado — use os links de chat abaixo.';
    const outros=pessoas.filter(p=>p.accountId!==id.accountId);
    const diaBR=dia.split('-').reverse().join('/');
    const links=outros.map(p=>{
      const msg=`Oi, ${esc((p.nome||'').split(' ')[0])}! Te enviei um convite de apontamento no ${ctx.k} (${fmtH(seg)} em ${diaBR}). Confirma com 1 clique no Jira Insights → ⏱ Apontar: https://jirainsight.vercel.app/?v=apontar`;
      const url=`https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(p.email)}&message=${encodeURIComponent(msg)}`;
      return `<div class="mt-item"><span>${esc(p.nome)}</span>
        <a class="btn" href="${escA(url)}" target="_blank" rel="noopener">💬 Chamar no chat</a></div>`; }).join('');
    abreModal(`<h2>📨 Convites enviados · ${esc(ctx.k)}</h2>
      <div class="alx-fb ap-fb ok" style="display:block">✓ ${outros.length} convite(s) de ${fmtH(seg)} em ${esc(diaBR)}${inclEu?' · seu apontamento foi lançado':''}.
        ${tTxt?`<br>${tTxt}`:''}</div>
      ${outros.length?`<div class="alx-campo"><label>Reforçar pelo chat individual (abre o Teams com a mensagem pronta)</label>${links}</div>`:''}
      <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`);
    _cv=null;
  }catch(e){ erroFb(humanizaErro(e)); if(bt) bt.disabled=false; }
}

