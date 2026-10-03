// Jira Insights · 25b · 🐞 REPORTAR BUG OU MELHORIA (2026-10-03, a pedido do usuário: "um workflow onde a pessoa
// consegue apontar de forma fácil bugs ou melhorias; esses tickets são criados no GitHub e no Jira como bug e
// melhoria"). UM relato vira o ticket no Jira (projeto JI: Bug, ou Melhoria → História + label "melhoria" enquanto
// o JI não tiver o tipo Melhoria) e o issue no GitHub, cada um com o link do outro — POST /api/criar {reportar:1}.
// Entradas: o 🐞 flutuante, ⋯ Mais › 🐞 Reportar, a paleta Ctrl+K (acao:reportar) e a ❓ Ajuda.
// O contexto técnico (tela, endereço, versão, navegador e os últimos erros do navegador) só vai se a pessoa
// deixar marcado — e ela vê exatamente o que vai. Nunca o conteúdo da tela.
// ======================================================================================

const REP_HIST_KEY='jirainsight_reportes_v1';     // os últimos relatos desta pessoa (só no navegador, com os links)
const REP_RASC_KEY='jirainsight_reporte_rasc_v1'; // rascunho: o bug pode ser justamente a página travar
const REP_TIPOS={
  bug:{ic:'🐞',nome:'Bug',dica:'algo não funciona como deveria',ph:'Ex.: o botão Salvar do contrato não grava',
    desc:'O que aconteceu? Onde você estava, o que clicou e o que apareceu.'},
  melhoria:{ic:'💡',nome:'Melhoria',dica:'uma ideia ou um ajuste',ph:'Ex.: filtrar a Gestão por cliente',
    desc:'O que você gostaria que o app fizesse — e para quê (qual problema resolve).'},
  duvida:{ic:'❓',nome:'Dúvida',dica:'não sabe como fazer algo (só vai ao GitHub)',ph:'Ex.: como aponto horas de um dia passado?',
    desc:'Qual é a dúvida? Conte o que tentou.'},
};
// Últimos erros do navegador (mensagem + arquivo:linha) — é o que mais ajuda a achar um bug.
const _repErros=[];
(function(){
  const anota=(m)=>{ m=String(m||'').replace(/\s+/g,' ').trim().slice(0,300); if(!m) return;
    const ult=_repErros[_repErros.length-1]; if(ult&&ult.m===m){ ult.n+=1; return; }
    _repErros.push({m, em:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}), n:1});
    if(_repErros.length>8) _repErros.shift(); };
  window.addEventListener('error',(e)=>{ if(!e||!e.message) return;
    anota(`${e.message}${e.filename?` @ ${String(e.filename).split('/').pop()}:${e.lineno||0}`:''}`); });
  window.addEventListener('unhandledrejection',(e)=>{ const r=e&&e.reason; anota('promessa rejeitada: '+((r&&r.message)||r||'?')); });
})();
let _rep=null;   // o relato aberto: {tipo, titulo, descricao, passos, esperado, ctx, vista, enviando, res}

function repRasc(){ try{ return JSON.parse(localStorage.getItem(REP_RASC_KEY)||'null'); }catch(e){ return null; } }
function repGuardaRasc(){ if(!_rep) return; try{
  const vazio=!(_rep.titulo||_rep.descricao||_rep.passos||_rep.esperado);
  if(vazio) localStorage.removeItem(REP_RASC_KEY);
  else localStorage.setItem(REP_RASC_KEY, JSON.stringify({tipo:_rep.tipo,titulo:_rep.titulo,descricao:_rep.descricao,passos:_rep.passos,esperado:_rep.esperado}));
}catch(e){} }
function repHist(){ try{ const l=JSON.parse(localStorage.getItem(REP_HIST_KEY)||'[]'); return Array.isArray(l)?l:[]; }catch(e){ return []; } }
function repGuardaHist(item){ try{ const l=repHist(); l.unshift(item); localStorage.setItem(REP_HIST_KEY, JSON.stringify(l.slice(0,10))); }catch(e){} }

function repRotuloVista(v){
  // O caminho do menu ("📑 Contratos › 🤝 Parceiros") é o que leva quem vai consertar até a tela; o título do guia é a reserva.
  const n=(typeof NAVCAT!=='undefined')?(NAVCAT.find(x=>x[0]===v)||[])[1]:'';
  const g=(typeof GUIAS!=='undefined'&&GUIAS[v])?GUIAS[v].t:'';
  return n||g||v||'';
}
// O que vai junto quando "incluir o contexto" está marcado — a mesma função monta a prévia e o envio.
function repContexto(){
  const v=(_rep&&_rep.vista)||estado.vista;
  let url=''; try{ url=location.origin+location.pathname+location.search; }catch(e){}
  return {
    tela:v||'', rotulo:repRotuloVista(v), url,
    versao:(typeof NOV_VER!=='undefined'?NOV_VER:''),
    navegador:String(navigator.userAgent||'').slice(0,200),
    janela:`${innerWidth}×${innerHeight}`,
    erros:_repErros.map(e=>`${e.em} ${e.m}${e.n>1?` (×${e.n})`:''}`),
  };
}

function abreReportar(tipo){
  const r=repRasc()||{};
  _rep={ tipo:REP_TIPOS[tipo]?tipo:(REP_TIPOS[r.tipo]?r.tipo:'bug'), titulo:r.titulo||'', descricao:r.descricao||'',
    passos:r.passos||'', esperado:r.esperado||'', ctx:true, vista:estado.vista, enviando:false, res:null, temRasc:!!(r.titulo||r.descricao) };
  try{ fechaMenusNav(); }catch(e){}
  repRender();
  const el=document.getElementById('rep-titulo'); if(el) el.focus();
}
function repRender(){
  if(!_rep) return;
  const id=idApontar();
  const t=REP_TIPOS[_rep.tipo];
  const res=_rep.res;
  if(res&&res.ok){   // ---- deu certo: os dois links e o que fazer agora
    const j=res.jira, g=res.github;
    abreModal(`
      <h2>${t.ic} ${esc(t.nome)} registrado — obrigado!</h2>
      <div class="rep-ok">
        ${j?`<a class="rep-link" href="${escA(j.url)}" target="_blank" rel="noopener"><b>🎫 ${esc(j.key)}</b><span>ticket no Jira · ${esc(j.tipo||'')}${j.servico?' (criado pela conta de serviço)':''} ↗</span></a>`:''}
        ${g?`<a class="rep-link" href="${escA(g.url)}" target="_blank" rel="noopener"><b>🐙 #${esc(String(g.numero||''))}</b><span>issue no GitHub ↗</span></a>`:''}
      </div>
      ${(res.avisos||[]).length?`<div class="ap-fb warn" style="margin-top:10px">${res.avisos.map(a=>esc(a)).join('<br>')}</div>`:''}
      <div class="muted small" style="margin-top:10px">${j&&g?'Um aponta para o outro: quem cuida do app vê no Jira e no GitHub. ':''}Você acompanha o andamento pelo link — e os seus últimos relatos ficam aqui no 🐞 Reportar.</div>
      <div class="rep-acoes"><button class="btn primario" id="rep-outro">🐞 Relatar outro</button><button class="btn" id="rep-fechar">Fechar</button></div>`);
    return;
  }
  const ctx=repContexto();
  const hist=repHist().slice(0,5);
  abreModal(`
    <h2>🐞 Reportar bug ou melhoria</h2>
    <div class="muted small">Vira um <b>ticket no Jira</b> (projeto JI) <b>e</b> um <b>issue no GitHub</b>, ligados um ao outro — quem cuida do app recebe na hora.
      ${id?`Você é <b>${esc(id.nome||id.email)}</b> (fica registrado como quem relatou).`:'<span style="color:var(--err)">Identifique-se para enviar.</span>'}</div>
    ${_rep.temRasc?'<div class="muted small rep-rasc">✎ Continuando o rascunho que você deixou. <button class="lnk" id="rep-limpa">começar do zero</button></div>':''}
    <div class="rep-tipos" role="radiogroup" aria-label="Tipo do relato">
      ${Object.entries(REP_TIPOS).map(([k,x])=>`<button class="rep-tipo${_rep.tipo===k?' on':''}" data-rep-tipo="${k}" role="radio" aria-checked="${_rep.tipo===k}">
        <b>${x.ic} ${esc(x.nome)}</b><span>${esc(x.dica)}</span></button>`).join('')}
    </div>
    <div class="fb-grid">
      <div><label for="rep-titulo">Título <span class="muted">(uma frase)</span></label>
        <input type="text" id="rep-titulo" maxlength="200" placeholder="${escA(t.ph)}" value="${escA(_rep.titulo)}"></div>
      <div><label for="rep-desc">${_rep.tipo==='melhoria'?'O que você gostaria':_rep.tipo==='duvida'?'A dúvida':'O que aconteceu'}</label>
        <textarea id="rep-desc" maxlength="8000" placeholder="${escA(t.desc)}">${esc(_rep.descricao)}</textarea></div>
      ${_rep.tipo==='bug'?`<div class="rep-2col">
        <div><label for="rep-passos">Passos para repetir <span class="muted">(opcional)</span></label>
          <textarea id="rep-passos" maxlength="4000" placeholder="1. Abri 🤝 Parceiros&#10;2. Cliquei em editar&#10;3. …">${esc(_rep.passos)}</textarea></div>
        <div><label for="rep-esperado">O que você esperava <span class="muted">(opcional)</span></label>
          <textarea id="rep-esperado" maxlength="4000" placeholder="Ex.: o valor novo continuar lá depois de salvar">${esc(_rep.esperado)}</textarea></div>
      </div>`:''}
      <label class="rep-ctx"><input type="checkbox" id="rep-ctx" ${_rep.ctx?'checked':''}> Incluir o contexto técnico — a tela <b>${esc(ctx.rotulo||ctx.tela||'—')}</b>, o endereço, a versão do app, o navegador${ctx.erros.length?` e <b>${ctx.erros.length} erro(s) recente(s)</b> do navegador`:''}</label>
      <details class="rep-ctxver"><summary>ver exatamente o que vai junto</summary>
        <div class="rep-ctxtab">
          <div><span>Tela</span><b>${esc(ctx.rotulo||'—')}</b> <code>${esc(ctx.tela)}</code></div>
          <div><span>Endereço</span><code>${esc(ctx.url)}</code></div>
          <div><span>Versão</span><code>${esc(ctx.versao||'—')}</code></div>
          <div><span>Navegador</span><code>${esc(ctx.navegador)}</code></div>
          <div><span>Janela</span><code>${esc(ctx.janela)}</code></div>
          <div><span>Erros</span>${ctx.erros.length?`<ul>${ctx.erros.map(e=>`<li><code>${esc(e)}</code></li>`).join('')}</ul>`:'<i class="muted">nenhum erro desde que a página abriu</i>'}</div>
        </div>
        <div class="muted small">Nada do conteúdo da tela (nomes, valores, tickets) vai junto — só isto. O seu token do Jira só serve para criar o ticket em seu nome e nunca é guardado.</div>
      </details>
      <div class="rep-acoes">
        <button class="btn primario" id="rep-enviar" ${id&&!_rep.enviando?'':'disabled'}>${_rep.enviando?'Enviando…':`Enviar ${t.ic} ${esc(t.nome.toLowerCase())}`}</button>
        ${id?'':'<button class="btn" data-ap-act="config-id">Identificar-se</button>'}
        <span class="muted small">${_rep.tipo==='duvida'?'Dúvida vai só ao GitHub.':`No Jira vira <b>${_rep.tipo==='bug'?'Bug':'Melhoria'}</b> no projeto JI.`}</span>
      </div>
      <div class="ap-fb${res&&!res.ok?' err':''}" id="rep-msg" ${res&&!res.ok?'':'hidden'}>${res&&!res.ok?esc(res.erro||'Não deu para enviar.'):''}</div>
    </div>
    ${hist.length?`<details class="rep-hist"><summary>Seus últimos relatos (${hist.length})</summary><ul>
      ${hist.map(h=>`<li><span class="muted">${esc(String(h.em||'').slice(0,10).split('-').reverse().join('/'))}</span> ${esc((REP_TIPOS[h.tipo]||{}).ic||'')} ${esc(h.titulo||'')}
        ${h.jira?`· <a href="${escA(h.jira.url)}" target="_blank" rel="noopener">${esc(h.jira.key)} ↗</a>`:''}
        ${h.github?`· <a href="${escA(h.github.url)}" target="_blank" rel="noopener">GitHub #${esc(String(h.github.numero))} ↗</a>`:''}</li>`).join('')}
    </ul></details>`:''}`);
}
function repLeCampos(){
  if(!_rep) return;
  const v=(i)=>{ const el=document.getElementById(i); return el?el.value:null; };
  const t=v('rep-titulo'); if(t!=null) _rep.titulo=t;
  const d=v('rep-desc'); if(d!=null) _rep.descricao=d;
  const p=v('rep-passos'); if(p!=null) _rep.passos=p;
  const e=v('rep-esperado'); if(e!=null) _rep.esperado=e;
  const c=document.getElementById('rep-ctx'); if(c) _rep.ctx=c.checked;
}
async function repEnvia(){
  if(!_rep||_rep.enviando) return;
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  repLeCampos();
  const msg=document.getElementById('rep-msg');
  const erro=(m)=>{ if(msg){ msg.hidden=false; msg.className='ap-fb err'; msg.textContent=m; } };
  if(!_rep.titulo.trim()) { erro('Dê um título — uma frase que resuma o '+REP_TIPOS[_rep.tipo].nome.toLowerCase()+'.'); const el=document.getElementById('rep-titulo'); if(el) el.focus(); return; }
  if(_rep.tipo!=='duvida'&&!_rep.descricao.trim()&&!_rep.passos.trim()){ erro('Conte um pouco mais no campo de baixo — é o que permite agir sem precisar perguntar de volta.'); const el=document.getElementById('rep-desc'); if(el) el.focus(); return; }
  _rep.enviando=true; _rep.res=null; repRender();
  let j;
  try{
    j=await fetch('/api/criar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      reportar:1, tipo:_rep.tipo, titulo:_rep.titulo.trim(), descricao:_rep.descricao.trim(),
      passos:_rep.tipo==='bug'?_rep.passos.trim():'', esperado:_rep.tipo==='bug'?_rep.esperado.trim():'',
      contexto:_rep.ctx?repContexto():null, email:id.email, token:id.token, nome:id.nome||'' })}).then(r=>r.json());
  }catch(e){ j={ok:false, erro:'Erro de rede: '+(e.message||e)+' — o rascunho ficou guardado; tente de novo.'}; }
  if(!_rep) return;   // a pessoa fechou no meio
  _rep.enviando=false; _rep.res=j||{ok:false};
  if(j&&j.ok){
    repGuardaHist({em:new Date().toISOString(), tipo:_rep.tipo, titulo:_rep.titulo.trim(), jira:j.jira?{key:j.jira.key,url:j.jira.url}:null, github:j.github?{numero:j.github.numero,url:j.github.url}:null});
    try{ localStorage.removeItem(REP_RASC_KEY); }catch(e){}
    logAcao({acao:'reportar', t:(j.jira&&j.jira.key)||'', para:`${REP_TIPOS[_rep.tipo].nome}: ${_rep.titulo.trim()}`.slice(0,120), ok:true});
  }
  const modal=document.getElementById('modal');
  if(modal&&!modal.hidden&&document.querySelector('#modal-body .rep-tipos, #modal-body .rep-ok')) repRender();
  else if(j&&j.ok) toast(`${REP_TIPOS[_rep.tipo].ic} Relato enviado${j.jira?` — ${j.jira.key}`:''}${j.github?` · GitHub #${j.github.numero}`:''}`,'ok');
  else toast((j&&j.erro)||'Não deu para enviar o relato.','err');
}

// ---- Eventos (o modal é global: delegação no document) ----
document.addEventListener('click',(e)=>{
  const b=e.target.closest&&e.target.closest('#btn-reportar,#btn-mais-reportar,[data-rep-abre],[data-rep-tipo],#rep-enviar,#rep-outro,#rep-fechar,#rep-limpa');
  if(!b) return;
  if(b.id==='btn-reportar'||b.id==='btn-mais-reportar'){ abreReportar(); return; }
  if(b.hasAttribute('data-rep-abre')){ abreReportar(b.getAttribute('data-rep-abre')||''); return; }
  if(!_rep) return;
  if(b.hasAttribute('data-rep-tipo')){ repLeCampos(); _rep.tipo=b.getAttribute('data-rep-tipo'); _rep.res=null; repGuardaRasc(); repRender();
    const el=document.getElementById('rep-titulo'); if(el) el.focus(); return; }
  if(b.id==='rep-enviar'){ repEnvia(); return; }
  if(b.id==='rep-outro'){ const tipo=_rep.tipo; _rep=null; abreReportar(tipo); return; }
  if(b.id==='rep-fechar'){ fechaModal(); _rep=null; return; }
  if(b.id==='rep-limpa'){ try{ localStorage.removeItem(REP_RASC_KEY); }catch(e){} Object.assign(_rep,{titulo:'',descricao:'',passos:'',esperado:'',temRasc:false}); repRender(); }
});
document.addEventListener('input',(e)=>{
  const t=e.target; if(!_rep||!t||!t.id||!/^rep-(titulo|desc|passos|esperado|ctx)$/.test(t.id)) return;
  repLeCampos(); repGuardaRasc();
});
document.addEventListener('change',(e)=>{ const t=e.target; if(_rep&&t&&t.id==='rep-ctx') _rep.ctx=t.checked; });
document.addEventListener('keydown',(e)=>{   // Ctrl+Enter envia (como nos outros formulários longos)
  if(_rep&&(e.ctrlKey||e.metaKey)&&e.key==='Enter'&&document.querySelector('#modal-body #rep-enviar')&&!document.getElementById('modal').hidden){ e.preventDefault(); repEnvia(); }
});
