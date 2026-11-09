// Jira Insights · 31b · 🔔 NOTIFICAÇÕES (Web Push) — cliente (2026-11-09, camada iPad, prefixo psh).
// O servidor (api/config.js ?push=1 + api/_lib/push.js) guarda as inscrições por pessoa (linha push_<accountId> de
// jirainsight_config, nunca na cfg) e manda só o que já vira mensagem direta no Teams: convites para apontar, reunião sem
// ticket, pendências de sexta do gerente e plano aprovado/devolvido. Aqui: o estado, o cartão 🔔 (⚙️ Central e ⋯ Mais), o
// aviso dispensável do 📥 Inbox, o selo do ícone (setAppBadge) e a ponte com o sw.js (navegar ao tocar na notificação).
// Estados de pshEstado(): instalar · nao-suportado · negado · carregando · erro · sem-id · sem-chave · pedir · ativo.
// (iOS/iPadOS só entrega push ao app da Tela de Início, iPadOS >= 16.4 — fora dele o estado é "instalar".)
const PSH_DISP_KEY='jirainsight_push_dispensado_v1';
const PSH_TIPOS=[['convites','🤝 Convites para apontar','alguém te convida a apontar horas num ticket'],
  ['reunioes','⏰ Reunião sem ticket','você organizou uma reunião e ninguém criou o ticket até o fim do dia'],
  ['sexta','🧭 Pendências de sexta','o resumo das pendências dos seus projetos (só para gerentes e gestores)'],
  ['plano','📋 Plano da semana','seu plano foi aprovado ou devolvido']];
const psh={ cfg:null, carregou:false, carregando:false, erro:'', sub:false, e:'', ocupado:'', msg:'', msgTipo:'', idk:'', badge:null };

function pshSuporte(){
  try{ return !!(('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window)); }catch(e){ return false; }
}
function pshInstaladoOuSim(){ try{ return pwaInstalado()||pwaSimulado(); }catch(e){ return false; } }
function pshEstado(){
  let perm='default'; try{ if('Notification' in window) perm=Notification.permission; }catch(e){}
  if(pwaEhIOS() && !pshInstaladoOuSim()) return 'instalar';      // iOS/iPadOS: push só no app da Tela de Início
  if(!pshSuporte()) return 'nao-suportado';
  if(perm==='denied') return 'negado';
  if(!idApontar()) return 'sem-id';
  if(!psh.carregou||psh.carregando) return 'carregando';
  if(!psh.cfg) return 'erro';
  if(psh.cfg.configurado===false) return 'sem-chave';
  if(perm==='granted' && psh.cfg.inscrito===true) return 'ativo';
  return 'pedir';
}
function pshHeaders(){ const id=idApontar()||{}; return { 'Content-Type':'application/json', 'x-jira-email':id.email||'', 'x-jira-token':id.token||'' }; }
async function pshSha16(s){
  const b=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,16);
}
function pshChaveBytes(b64u){
  const pad='='.repeat((4-b64u.length%4)%4); const b=atob((b64u+pad).replace(/-/g,'+').replace(/_/g,'/'));
  const u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u;
}
function pshBytesB64u(buf){
  const u=new Uint8Array(buf); let s=''; for(let i=0;i<u.length;i++) s+=String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
// Registro "rápido" (não espera o SW ativar): serve para ler a inscrição atual sem travar o desenho.
async function pshRegRapido(){ try{ return (navigator.serviceWorker&&navigator.serviceWorker.getRegistration)?await navigator.serviceWorker.getRegistration():null; }catch(e){ return null; } }
// Registro "pronto" (só para inscrever): com teto de 6 s — sem SW registrado (http fora do localhost) o ready nunca resolve.
function pshRegPronto(){
  const t=new Promise((_,rej)=>setTimeout(()=>rej(new Error('O aplicativo ainda não está pronto para notificações (service worker). Recarregue a página e tente de novo.')),6000));
  return Promise.race([navigator.serviceWorker.ready, t]);
}
// A chave pública fica no cache do SW ('ji-push') para o pushsubscriptionchange reinscrever sem a página; o token NUNCA vai para lá.
function pshGuardaChave(chave){ try{ if(window.caches&&chave) caches.open('ji-push').then(c=>c.put('/__push/chave', new Response(chave))).catch(()=>{}); }catch(e){} }
async function pshPendente(){   // inscrição renovada pelo SW com o app fechado: o SW não tem a identidade, a página envia
  try{
    if(!window.caches||!idApontar()) return;
    const c=await caches.open('ji-push'); const r=await c.match('/__push/pendente'); if(!r) return;
    const d=await r.json().catch(()=>null); await c.delete('/__push/pendente');
    if(d&&d.sub) await pshInscreveSub(d.sub);
  }catch(e){}
}
async function pshInscreveSub(sub){
  const corpo=typeof sub.toJSON==='function'?sub.toJSON():sub;
  const r=await fetch('/api/config?push=1',{ method:'POST', headers:pshHeaders(), body:JSON.stringify({ acao:'inscrever', sub:corpo, ua:String(navigator.userAgent||'').slice(0,120) }) });
  const j=await r.json().catch(()=>({})); return { r, j };
}

async function pshCarrega(){
  const id=idApontar(); psh.idk=id?id.email:''; psh.carregando=true; psh.erro='';
  if(!id){ psh.cfg=null; psh.carregando=false; psh.carregou=true; return pshRepinta(); }
  try{
    let e=''; psh.sub=false;
    try{ const reg=await pshRegRapido(); const sub=reg&&reg.pushManager?await reg.pushManager.getSubscription():null; psh.sub=!!sub; if(sub&&sub.endpoint) e=await pshSha16(sub.endpoint); }catch(_){}
    psh.e=e;
    const r=await fetch('/api/config?push=1'+(e?'&e='+e:''),{ headers:pshHeaders() });
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j&&j.ok){ psh.cfg=j; if(j.configurado&&j.chave) pshGuardaChave(j.chave); pshPendente(); }
    else { psh.cfg=null; psh.erro=(j&&j.erro)||('HTTP '+r.status); }
  }catch(err){ psh.cfg=null; psh.erro=String(err&&err.message||err); }
  psh.carregando=false; psh.carregou=true; pshRepinta();
}
// Carrega uma vez (e de novo se a pessoa trocou). Seguro para chamar em todo render: não repete leitura em voo.
function pshGarante(forca){
  const id=idApontar(); const k=id?id.email:'';
  if(forca||(psh.idk!==k&&psh.carregou)){ psh.carregou=false; psh.cfg=null; psh.msg=''; }
  if(psh.carregou||psh.carregando) return;
  if(!pshSuporte()){ psh.carregou=true; return; }   // nada a consultar (instalar / nao-suportado não precisam do servidor)
  pshCarrega();
}

// ---------- ações (só dentro de um clique de verdade) ----------
function pshMsg(txt, tipo){ psh.msg=txt||''; psh.msgTipo=tipo||''; }
async function pshAtivar(ev){
  if(!ev||ev.isTrusted!==true) return false;                       // requestPermission exige gesto do usuário
  if(psh.ocupado||pshEstado()!=='pedir') return false;
  const chave=psh.cfg&&psh.cfg.chave; if(!chave){ pshMsg('O servidor não devolveu a chave de notificação.','err'); pshRepinta(); return false; }
  psh.ocupado='ativar'; pshMsg('',''); pshRepinta();
  let sub=null, nova=false;
  try{
    const perm=await Notification.requestPermission();             // primeiro await: ainda dentro do gesto
    if(perm!=='granted'){
      pshMsg(perm==='denied'?'Permissão negada. Para religar: Ajustes › Notificações › Dexterity Hub (no iPad) ou as permissões do site (no computador).':'Você não concedeu a permissão — nada foi ativado.','warn');
      return false;
    }
    const reg=await pshRegPronto();
    sub=await reg.pushManager.getSubscription();
    if(sub&&sub.options&&sub.options.applicationServerKey){      // chave VAPID trocada no servidor: a inscrição velha não serve
      try{ if(pshBytesB64u(sub.options.applicationServerKey)!==chave){ await sub.unsubscribe(); sub=null; } }catch(_){}
    }
    if(!sub){ sub=await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:pshChaveBytes(chave) }); nova=true; }
    const { r, j }=await pshInscreveSub(sub);
    if(!(r.ok&&j&&j.ok)){ if(nova){ try{ await sub.unsubscribe(); }catch(_){} } pshMsg((j&&j.erro)||('Não consegui registrar este aparelho (HTTP '+r.status+').'),'err'); return false; }
    psh.cfg=Object.assign({}, psh.cfg, { inscrito:true, n:j.n, prefs:j.prefs||psh.cfg.prefs }); psh.sub=true;
    try{ psh.e=await pshSha16(sub.endpoint); }catch(_){}
    pshGuardaChave(chave);
    pshMsg('✅ Notificações ativadas neste aparelho. Use 🧪 Testar para conferir.','ok');
    return true;
  }catch(err){
    if(nova&&sub){ try{ await sub.unsubscribe(); }catch(_){} }
    pshMsg('Não deu para ativar: '+String(err&&err.message||err),'err'); return false;
  }finally{ psh.ocupado=''; pshRepinta(); }
}
async function pshDesativar(){
  if(psh.ocupado) return false; psh.ocupado='desativar'; pshMsg('',''); pshRepinta();
  try{
    const reg=await pshRegRapido(); const sub=reg&&reg.pushManager?await reg.pushManager.getSubscription():null;
    if(sub){
      const r=await fetch('/api/config?push=1',{ method:'POST', headers:pshHeaders(), body:JSON.stringify({ acao:'cancelar', endpoint:sub.endpoint }) });
      const j=await r.json().catch(()=>({}));
      if(!(r.ok&&j&&j.ok)){ pshMsg((j&&j.erro)||'Não consegui avisar o servidor — nada foi desativado.','err'); return false; }
      try{ await sub.unsubscribe(); }catch(_){}
      psh.cfg=Object.assign({}, psh.cfg, { inscrito:false, n:j.n });
    } else psh.cfg=Object.assign({}, psh.cfg, { inscrito:false });
    psh.sub=false; psh.e=''; pshMsg('🔕 Notificações desativadas neste aparelho.','ok'); return true;
  }catch(err){ pshMsg('Não deu para desativar: '+String(err&&err.message||err),'err'); return false; }
  finally{ psh.ocupado=''; pshRepinta(); }
}
// Trocou/esqueceu a identidade neste aparelho: a inscrição é da pessoa ANTERIOR. Cancela no servidor com a identidade ANTIGA
// (best-effort) e solta a inscrição do navegador — senão o aparelho continuaria recebendo os avisos do colega.
async function pshSolta(idAntiga){
  try{
    const reg=await pshRegRapido(); const sub=reg&&reg.pushManager?await reg.pushManager.getSubscription():null;
    psh.sub=false; psh.e=''; psh.cfg=null; psh.carregou=false; psh.msg='';
    if(!sub) return;
    if(idAntiga&&idAntiga.email&&idAntiga.token){
      try{ await fetch('/api/config?push=1',{ method:'POST', headers:{ 'Content-Type':'application/json', 'x-jira-email':idAntiga.email, 'x-jira-token':idAntiga.token },
        body:JSON.stringify({ acao:'cancelar', endpoint:sub.endpoint }) }); }catch(_){}
    }
    try{ await sub.unsubscribe(); }catch(_){}
    try{ if(window.caches) caches.open('ji-push').then(c=>c.delete('/__push/pendente')).catch(()=>{}); }catch(_){}
  }catch(e){}
  finally{ try{ pshRepinta(); }catch(_){} }
}
async function pshTestar(){
  if(psh.ocupado) return false; psh.ocupado='testar'; pshMsg('',''); pshRepinta();
  try{
    const r=await fetch('/api/config?push=1',{ method:'POST', headers:pshHeaders(), body:JSON.stringify({ acao:'testar' }) });
    const j=await r.json().catch(()=>({}));
    if(r.ok&&j&&j.ok){ pshMsg('🧪 Teste enviado'+(j.enviados>1?` para ${j.enviados} aparelhos`:'')+' — a notificação deve chegar em instantes.','ok'); return true; }
    pshMsg((j&&j.erro)||('Não consegui testar (HTTP '+r.status+').'),r.status===429?'warn':'err'); return false;
  }catch(err){ pshMsg('Não deu para testar: '+String(err&&err.message||err),'err'); return false; }
  finally{ psh.ocupado=''; pshRepinta(); }
}
async function pshPrefs(chave, valor){
  if(!psh.cfg||!PSH_TIPOS.some(t=>t[0]===chave)) return false;
  const antes=Object.assign({}, psh.cfg.prefs||{});
  psh.cfg.prefs=Object.assign({}, antes, { [chave]:!!valor });
  try{
    const r=await fetch('/api/config?push=1',{ method:'POST', headers:pshHeaders(), body:JSON.stringify({ acao:'prefs', prefs:{ [chave]:!!valor } }) });
    const j=await r.json().catch(()=>({}));
    if(!(r.ok&&j&&j.ok)) throw new Error((j&&j.erro)||('HTTP '+r.status));
    psh.cfg.prefs=Object.assign({}, psh.cfg.prefs, j.prefs||{}); return true;
  }catch(err){ psh.cfg.prefs=antes; pshMsg('Não consegui salvar a preferência: '+String(err&&err.message||err),'err'); pshRepinta(); return false; }
}

// ---------- selo do ícone (só no app instalado) ----------
function pshBadge(n){
  try{
    if(!document.body.classList.contains('pwa')) return;
    n=Math.max(0, Math.floor(Number(n)||0)); if(psh.badge===n) return; psh.badge=n;
    const r=(n>0&&typeof navigator.setAppBadge==='function')?navigator.setAppBadge(n):(n===0&&typeof navigator.clearAppBadge==='function')?navigator.clearAppBadge():null;
    if(r&&typeof r.catch==='function') r.catch(()=>{});
  }catch(e){}
}

// ---------- ponte com o service worker ----------
// url vem de fora (push/clique): só caminho relativo ("/…"), sem "//", sem barra invertida, sem controle.
function pshUrlSegura(u){
  if(typeof u!=='string'||u[0]!=='/'||u.includes('//')||u.includes('\\')||/[\u0000-\u001f]/.test(u)) return '/';
  return u;
}
function pshNavega(url){
  const seg=pshUrlSegura(url); let x; try{ x=new URL(seg, location.origin); }catch(e){ return false; }
  if(x.origin!==location.origin) return false;
  let v=x.searchParams.get('v'); if(!v) return true;                // "/" = só trazer o app para a frente
  const al=(typeof VISTA_ALIAS==='object'&&VISTA_ALIAS)?VISTA_ALIAS[v]:null; if(al) v=al.v;
  if(!VISTAS.includes(v)) v='acoes';
  try{ const m=document.getElementById('modal'); if(m&&!m.hidden) fechaModal(); }catch(e){}
  if(v==='gp'){ const k=x.searchParams.get('gproj'); if(k&&/^[A-Za-z][A-Za-z0-9_]{0,19}$/.test(k)&&estado.gp) estado.gp.proj=k.toUpperCase(); }
  if(v==='minhasemana'){ const w=x.searchParams.get('w'); if(/^\d{4}-\d{2}-\d{2}$/.test(w||'')&&estado.minhasemana) estado.minhasemana.w=w; }
  vaiPara(v); return true;
}
try{
  if('serviceWorker' in navigator && navigator.serviceWorker.addEventListener){
    navigator.serviceWorker.addEventListener('message', (ev)=>{
      const d=ev&&ev.data; if(!d||typeof d!=='object') return;
      if(d.tipo==='navegar') pshNavega(d.url);
      else if(d.tipo==='push-reinscrito'&&idApontar()) pshPendente().then(()=>pshGarante(true)).catch(()=>{});   // o SW deixou a inscrição nova no cache 'ji-push'; a página tem a identidade
    });
  }
}catch(e){}

// ---------- telas: cartão 🔔, modal do ⋯ Mais, aviso do Inbox ----------
function pshCorpoHTML(){
  const st=pshEstado(); const ocup=!!psh.ocupado;
  const aviso=psh.msg?`<div class="aviso ${psh.msgTipo==='ok'?'ok':''}" role="status" style="margin:10px 0 0">${esc(psh.msg)}</div>`:'';
  const prefs=()=>{ const p=(psh.cfg&&psh.cfg.prefs)||{};
    return `<div class="cfgc-sec" style="margin-top:10px"><h3>O que avisar</h3>${PSH_TIPOS.filter(t=>t[0]!=='sexta'||(psh.cfg&&psh.cfg.podeSexta)).map(t=>
      `<label class="cfgc-tog" style="align-items:flex-start;min-height:44px"><input type="checkbox" data-psh-pref="${t[0]}" ${p[t[0]]!==false?'checked':''}> <span><strong>${t[1]}</strong><br><span class="muted small">${esc(t[2])}</span></span></label>`).join('')}</div>`; };
  const nota='<div class="muted small" style="margin-top:8px">Só título e uma linha, com link para a tela — nunca valores em R$ nem o texto de comentários.</div>';
  let h='';
  if(st==='instalar') h=`<div class="muted small">No <strong>iPhone/iPad</strong> as notificações só chegam ao <strong>app instalado</strong> (iPadOS 16.4 ou mais novo): no Safari, <strong>Compartilhar › Adicionar à Tela de Início</strong>, abra pelo ícone e volte aqui.</div>
      <div style="margin-top:10px"><button class="btn primario" data-psh-instalar>📱 Como instalar</button></div>`;
  else if(st==='nao-suportado') h='<div class="muted small">Este navegador não oferece notificações push. No computador use o Chrome, Edge ou Firefox; no iPad, o app instalado pela Tela de Início.</div>';
  else if(st==='negado') h='<div class="muted small">🚫 As notificações estão <strong>bloqueadas</strong> neste aparelho. Para religar: <strong>Ajustes › Notificações › Dexterity Hub</strong> (iPad/iPhone) ou as permissões do site no navegador. Depois volte e atualize esta tela.</div>';
  else if(st==='sem-id') h='<div class="muted small">As notificações são por pessoa — o painel precisa saber quem você é. Identifique-se com o seu e-mail e o token do Jira (o mesmo do ⏱ Apontar).</div><div style="margin-top:10px"><button class="btn primario" data-ap-act="config-id">Identificar-se</button></div>';
  else if(st==='carregando') h='<div class="muted small">Verificando as notificações deste aparelho…</div>';
  else if(st==='erro') h=`<div class="muted small">Não consegui consultar o servidor${psh.erro?': '+esc(psh.erro):''}.</div><div style="margin-top:10px"><button class="btn" data-psh-recarrega>↻ Tentar de novo</button></div>`;
  else if(st==='sem-chave') h=`<div class="muted small">🔕 ${esc((psh.cfg&&psh.cfg.motivo)||'O servidor ainda não tem as chaves de notificação (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY na Vercel).')}<br>Um administrador precisa configurá-las; o resto do painel funciona normalmente.</div>`;
  else if(st==='pedir') h=`<div class="muted small">Receba no aparelho — mesmo com o app fechado — os convites para apontar, reuniões sem ticket e o que depende de você.</div>
      <div style="margin-top:10px"><button class="btn primario" data-psh-ativar ${ocup?'disabled':''} style="min-height:44px">${psh.ocupado==='ativar'?'⏳ Ativando…':'🔔 Ativar neste aparelho'}</button></div>${prefs()}${nota}`;
  else h=`<div class="muted small">✅ <strong>Ativas neste aparelho</strong>${psh.cfg&&psh.cfg.n>1?` · ${psh.cfg.n} aparelhos seus recebem os avisos`:''}.</div>
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-psh-testar ${ocup?'disabled':''} style="min-height:44px">${psh.ocupado==='testar'?'⏳ Enviando…':'🧪 Testar'}</button>
        <button class="btn" data-psh-desativar ${ocup?'disabled':''} style="min-height:44px">${psh.ocupado==='desativar'?'⏳ Desativando…':'🔕 Desativar neste aparelho'}</button></div>${prefs()}${nota}`;
  return h+aviso;
}
function pshCardHTML(){
  return `<div class="card cfgc psh-card" id="psh-card"><h2>🔔 Notificações <span>neste aparelho</span></h2><div class="psh-corpo" aria-live="polite">${pshCorpoHTML()}</div></div>`;
}
function pshRepinta(){
  try{
    document.querySelectorAll('.psh-corpo').forEach(n=>{ n.innerHTML=pshCorpoHTML(); });
    if(estado.vista==='inbox'&&typeof renderInbox==='function'&&estado.inbox&&estado.inbox.carregou) renderInbox();   // o aviso do Inbox some/aparece
  }catch(e){}
}
function pshAbreModal(){
  if(typeof pshGarante==='function') pshGarante();
  abreModal(`<h2>🔔 Notificações</h2><div class="psh-corpo" aria-live="polite">${pshCorpoHTML()}</div>
    <div style="margin-top:12px"><button class="btn" id="psh-fechar">Fechar</button></div>`);
}
function pshDispensado(){ try{ return localStorage.getItem(PSH_DISP_KEY)==='1'; }catch(e){ return false; } }
// Aviso dispensável do 📥 Inbox: só quando falta ativar (pedir) ou instalar o app (instalar).
function pshAvisoInboxHTML(){
  try{
    if(pshDispensado()) return ''; const st=pshEstado(); if(st!=='pedir'&&st!=='instalar') return '';
    const acao=st==='pedir'?'<button class="btn primario" data-psh-ativar style="min-height:44px">🔔 Ativar</button>':'<button class="btn primario" data-psh-instalar style="min-height:44px">📱 Como instalar</button>';
    const txt=st==='pedir'?'<b>Receba os convites neste iPad</b> — o aviso chega mesmo com o app fechado (só título e link; nunca valores).'
      :'<b>Receba os convites neste iPad</b> — instale o app pela Tela de Início (Safari › Compartilhar › Adicionar à Tela de Início) e ative as notificações.';
    return `<div class="aviso psh-aviso" role="region" aria-label="Notificações" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">🔔 <span style="flex:1;min-width:200px">${txt}</span>${acao}<button class="btn" data-psh-dispensa style="min-height:44px" aria-label="Dispensar este aviso">Agora não</button></div>`;
  }catch(e){ return ''; }
}

document.addEventListener('click', (e)=>{
  const t=e.target.closest&&e.target.closest('[data-psh-ativar],[data-psh-desativar],[data-psh-testar],[data-psh-instalar],[data-psh-dispensa],[data-psh-recarrega],#btn-mais-notif,#psh-fechar');
  if(!t) return;
  if(t.id==='btn-mais-notif'){ try{ fechaMenusNav(); }catch(_){} pshAbreModal(); }
  else if(t.id==='psh-fechar') fechaModal();
  else if(t.hasAttribute('data-psh-ativar')) pshAtivar(e);
  else if(t.hasAttribute('data-psh-desativar')) pshDesativar();
  else if(t.hasAttribute('data-psh-testar')) pshTestar();
  else if(t.hasAttribute('data-psh-instalar')){ if(typeof abreInstalar==='function') abreInstalar(); }
  else if(t.hasAttribute('data-psh-recarrega')) pshGarante(true);
  else if(t.hasAttribute('data-psh-dispensa')){ try{ localStorage.setItem(PSH_DISP_KEY,'1'); }catch(_){} if(estado.vista==='inbox'&&typeof renderInbox==='function') renderInbox(); }
});
document.addEventListener('change', (e)=>{
  const t=e.target; if(!t||!t.getAttribute) return; const k=t.getAttribute('data-psh-pref'); if(!k) return;
  pshPrefs(k, !!t.checked);
});
