// ---- 📞 LIGAÇÕES (Call tracking, 2026-10-09, a pedido do usuário: "qualquer ligação no meu computador — WhatsApp,
// Teams, Google Meet —, assim que acabar, um pop-up para criar um ticket daquela reunião ou apontar as horas num
// ticket já criado; igual ao Call Timing do Timing, integrado ao Jira Insights") ----
// O detector mora no Mac (public/call-tracking/CallTracking.swift, app de barra de menus): ele percebe pelo Core
// Audio QUEM está usando o microfone e, quando a ligação acaba, mostra o pop-up nativo; o botão escolhido abre
// /?v=chamadas#ct=<base64url(JSON)>&m=criar|apontar|lista. O fragmento nunca vai ao servidor: o <script> do <head>
// do index.html o tira da URL antes de qualquer outro script e o guarda no sessionStorage (CHM_FRAG); este módulo
// o lê no carregamento. As ligações ficam SÓ neste navegador (CHM_KEY) até virarem apontamento — a identidade do
// Jira, o catálogo de projetos e a 📅 Agenda já moram aqui, então o formulário é do painel, não do Mac.
// Regras: (1) o worklog nasce no INÍCIO REAL da ligação (`hora` no /api/apontar) quando o dia não foi trocado;
// (2) criar = /api/criar (lote de 1, atribuído a quem cria, tipo Reunião do projeto) e, se o apontamento falhar
// depois, a ligação guarda `parcial.key` — tentar de novo NÃO cria outro ticket; (3) ligação que coincide com um
// evento da Agenda (ontem a +14 dias) puxa o título, sugere o ticket do evento e liga o ticket ao evento
// (agMarcaTicket); (4) todo redesenho depois de um await passa por chmModalAberto() (o modal é um só no app).
const CHM_KEY='jirainsight_chamadas_v1';       // { itens:[ligação] } — ligações recebidas do Mac, neste navegador
const CHM_FRAG='jirainsight_ct_frag';          // o fragmento #ct=… guardado pelo <script> do <head>
const CHM_PROJ='jirainsight_chm_proj';         // último projeto usado para criar
const CHM_MAX_PEND=100, CHM_MAX_HIST=200, CHM_HIST_DIAS=60;
const CHM_RE_CHAVE=/^[A-Z][A-Z0-9_]*-\d+$/;
const CHM_ICONE={ teams:'🟣', whatsapp:'🟢', zoom:'🔵', facetime:'📹', telefone:'📱', slack:'💬', webex:'🟦', discord:'🎮',
  skype:'🔷', telegram:'✈️', chrome:'🌐', edge:'🌐', safari:'🌐', arc:'🌐', brave:'🌐', firefox:'🌐', opera:'🌐', vivaldi:'🌐' };
estado.chamadas={ pedido:null, fila:[], reabrir:null };
let _chm=null;   // modal aberto: { id, modo, proj, chave, chaveRes, busca, titulo, tempo, dia, coment, vincular, tocado:{}, conf, confEv, executando }

// ---------- armazenamento (localStorage) ----------
function chmLe(){ try{ const o=JSON.parse(localStorage.getItem(CHM_KEY)||'null'); if(o&&Array.isArray(o.itens)) return o.itens.filter(x=>x&&x.id); }catch(e){} return []; }
function chmGrava(itens){
  const limite=Date.now()-CHM_HIST_DIAS*86400000;
  const pend=itens.filter(c=>c.st==='pend').sort((a,b)=>String(b.ini).localeCompare(String(a.ini))).slice(0,CHM_MAX_PEND);
  const hist=itens.filter(c=>c.st!=='pend'&&Date.parse((c.res&&c.res.em)||c.fim||0)>=limite)
    .sort((a,b)=>String((b.res&&b.res.em)||b.fim).localeCompare(String((a.res&&a.res.em)||a.fim))).slice(0,CHM_MAX_HIST);
  try{ localStorage.setItem(CHM_KEY, JSON.stringify({ v:1, itens:pend.concat(hist) })); }catch(e){}
}
function chmPendentes(){ return chmLe().filter(c=>c.st==='pend').sort((a,b)=>String(b.ini).localeCompare(String(a.ini))); }
function chmDe(id){ return chmLe().find(c=>c.id===id)||null; }
function chmMuda(id, fn){ const l=chmLe(); const c=l.find(x=>x.id===id); if(!c) return null; fn(c); chmGrava(l); return c; }

// ---------- chegada do Mac: #ct=<base64url(JSON)> ----------
function chmB64(s){ s=String(s||'').replace(/-/g,'+').replace(/_/g,'/'); s+='='.repeat((4-s.length%4)%4);
  return new TextDecoder().decode(Uint8Array.from(atob(s),ch=>ch.charCodeAt(0))); }
// O payload vem de fora (uma URL): só passa o que tem forma de ligação, com textos curtos e sem controle.
function chmValida(c){
  if(!c||typeof c!=='object') return null;
  const id=String(c.id||''); if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const ini=new Date(c.ini), fim=new Date(c.fim);
  if(isNaN(ini)||isNaN(fim)||fim<ini||fim-ini>24*3600000) return null;
  // Só ligação que JÁ acabou e recente (o Mac guarda 14 dias): data no futuro ou antiga demais é link forjado.
  if(fim.getTime()>Date.now()+5*60000||ini.getTime()<Date.now()-30*86400000) return null;
  const tx=(v,n)=>String(v==null?'':v).replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,n);
  return { id, app:tx(c.app,40)||'outro', rot:tx(c.rot,60)||'Ligação', bid:tx(c.bid,120), ini:ini.toISOString(), fim:fim.toISOString(),
    seg:Math.round((fim-ini)/1000), tit:tx(c.tit,120), host:tx(c.host,80), provavel:c.provavel===true, st:'pend', chegou:new Date().toISOString() };
}
// Junta ao que já está guardado (por id): o que já foi apontado ou ignorado não volta a pendente.
function chmImporta(raw){
  const f=new URLSearchParams(String(raw||'').replace(/^#/,''));
  const ct=f.get('ct'); if(!ct) return null;
  let novos=[]; try{ const o=JSON.parse(chmB64(ct)); novos=((o&&Array.isArray(o.c))?o.c:[]).map(chmValida).filter(Boolean).slice(0,60); }catch(e){ novos=[]; }
  if(!novos.length) return null;
  const l=chmLe(); const ids=[];
  // Nunca despeja pendente que já estava guardado para caber o que chegou (o Mac apagou o dele ao entregar).
  let vagas=Math.min(50, CHM_MAX_PEND-l.filter(x=>x.st==='pend').length);
  novos.forEach(n=>{ const ja=l.some(x=>x.id===n.id); if(!ja){ if(vagas<=0) return; vagas--; l.push(n); } if(!ids.includes(n.id)) ids.push(n.id); });
  if(!ids.length) return null;
  chmGrava(l);
  const m=(f.get('m')||'').toLowerCase();
  return { ids, modo:['criar','apontar','lista'].includes(m)?m:'' };
}
(function(){
  let raw='';
  try{ raw=sessionStorage.getItem(CHM_FRAG)||''; sessionStorage.removeItem(CHM_FRAG); }catch(e){}
  if(!raw&&/(^|&)ct=/.test(location.hash.slice(1))){ raw=location.hash.slice(1); try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){} }
  const r=raw?chmImporta(raw):null;
  if(r) estado.chamadas.pedido=r;
})();

// ---------- datas (o Mac manda UTC; tudo aqui é São Paulo) ----------
function chmDiaSP(iso){ return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(iso)); }
function chmHoraSP(iso){ return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso)); }
function chmDiaRot(dia){ const h=hojeSP(); return dia===h?'hoje':(dia===voltaDias(h,1)?'ontem':fmtBR(dia)); }
function chmDur(seg){ const m=Math.max(1,Math.round((Number(seg)||0)/60)); return m<60?`${m} min`:fmtH(m*60); }
function chmTempoTxt(seg){ return fmtH(Math.max(60,Math.ceil((Number(seg)||0)/60)*60)); }   // "26m", "1h05" — o parseTempo lê de volta
function chmQuando(c){ return `${chmDiaRot(chmDiaSP(c.ini))} ${chmHoraSP(c.ini)}–${chmHoraSP(c.fim)}`; }
function chmIcone(c){ return c.host&&/meet\.google/.test(c.host)?'🎥':(CHM_ICONE[c.app]||'📞'); }

// ---------- 📅 a ligação coincide com uma reunião da Agenda? ----------
// Maior sobreposição de horário entre os eventos carregados (ontem a +14 dias); vale se cobrir pelo menos
// metade da ligação ou 5 minutos. Evento privado/dia inteiro não conta.
function chmEventoDe(c){
  const evs=((estado.agenda.dados||{}).eventos)||[]; if(!c||!evs.length) return null;
  const a=Date.parse(c.ini), b=Date.parse(c.fim); const dur=Math.max(1,b-a);
  let melhor=null, nota=0;
  evs.forEach(ev=>{ if(!ev||ev.diaTodo||ev.privado||!ev.inicio||!ev.fim) return;
    const ea=Date.parse(ev.inicio+':00-03:00'), eb=Date.parse(ev.fim+':00-03:00'); if(isNaN(ea)||isNaN(eb)) return;
    const sob=Math.min(b,eb)-Math.max(a,ea);
    if(sob>0&&sob>=Math.min(300000,dur*0.5)&&sob>nota){ nota=sob; melhor=ev; } });
  return melhor;
}
function chmAgendaCobre(c){ const d=estado.agenda.dados; return !!(d&&d.de&&chmDiaSP(c.ini)>=d.de); }
function chmTicketDoEvento(ev){ if(!ev) return null; const t=agTicketDe(ev.id); if(t&&t.t) return t.t; const a=agAchadoDe(ev.id); return a&&a.k?a.k:null; }

// ---------- 📞 tela ----------
function renderChamadas(){
  const cont=document.getElementById('conteudo'); if(!cont) return;
  const id=idApontar();
  if(id&&!estado.agenda.dados&&!estado.agenda.carregando&&!estado.agenda.erro) carregaAgenda(false);
  const todas=chmLe();
  const pend=todas.filter(c=>c.st==='pend').sort((a,b)=>String(b.ini).localeCompare(String(a.ini)));
  const hist=todas.filter(c=>c.st!=='pend').sort((a,b)=>String((b.res&&b.res.em)||b.fim).localeCompare(String((a.res&&a.res.em)||a.fim))).slice(0,30);
  const hoje=hojeSP(); const sete=voltaDias(hoje,6);
  const segPend=pend.reduce((s,c)=>s+(c.seg||0),0);
  const deHoje=todas.filter(c=>chmDiaSP(c.ini)===hoje);
  const feitas7=todas.filter(c=>c.st==='feito'&&c.res&&c.res.dia>=sete);
  const faixa=id
    ?`<div class="ap-id">🧾 Registrando como <strong>${esc(id.nome||id.email)}</strong> — o ticket nasce atribuído a você e o apontamento sai no seu usuário. <button class="btn" data-ap-act="trocar-id">Trocar usuário</button></div>`
    :`<div class="ap-id sem">Para criar tickets e apontar as ligações no SEU usuário, identifique-se com o e-mail e o token de API do Jira. <button class="btn primario" data-ap-act="config-id">Identificar-se</button></div>`;
  const linha=(c)=>{ const ev=chmEventoDe(c); const tk=chmTicketDoEvento(ev);
    const det=[c.tit?`“${esc(c.tit)}”`:'', ev?`📅 ${esc(ev.titulo)}${tk?` · <span class="badge com-horas">${esc(tk)}</span>`:''}`:''].filter(Boolean).join(' · ');
    return `<div class="chm-row" data-chm-row="${escA(c.id)}">
      <div class="chm-ic" aria-hidden="true">${chmIcone(c)}</div>
      <div class="chm-info"><div><b>${esc(c.rot)}</b> · ${esc(chmQuando(c))} · <b>${esc(chmDur(c.seg))}</b>${c.provavel?' <span class="badge" data-tip="macOS antes do 14.2: o Mac só sabe que o microfone estava em uso — o app é o mais provável">app provável</span>':''}</div>
        ${det?`<div class="muted small">${det}</div>`:''}</div>
      <div class="chm-acoes-l">
        <button class="btn primario" data-chm-abre="${escA(c.id)}" data-chm-modo="apontar">⏱ Apontar</button>
        <button class="btn" data-chm-abre="${escA(c.id)}" data-chm-modo="criar">📝 Criar ticket</button>
        <button class="btn" data-chm-ign="${escA(c.id)}" data-tip="Não era trabalho (ou já está apontada): sai da lista sem apontar" aria-label="Ignorar esta ligação">🚫</button>
      </div></div>`; };
  const linhaHist=(c)=>{ const r=c.res||{};
    return `<div class="chm-row chm-hist">
      <div class="chm-ic" aria-hidden="true">${c.st==='feito'?'✓':'🚫'}</div>
      <div class="chm-info"><div><b>${esc(c.rot)}</b> · ${esc(chmQuando(c))} · ${esc(chmDur(c.seg))}</div>
        <div class="muted small">${c.st==='feito'
          ?`${esc(fmtH(r.seg||0))} em <a href="${jiraBase()}/browse/${encodeURIComponent(r.key||'')}" target="_blank" rel="noopener">${esc(r.key||'')} ↗</a> · ${esc(fmtBR(r.dia||''))}${r.criado?' · ticket criado aqui':''}`
          :`ignorada${c.parcial&&c.parcial.key?` · o ticket ${esc(c.parcial.key)} já tinha sido criado (sem apontamento)`:''}`}</div></div>
      <div class="chm-acoes-l">${c.st==='ign'?`<button class="btn" data-chm-volta="${escA(c.id)}">↺ Voltar para a lista</button>`:''}</div></div>`; };
  const nunca=!todas.length;
  const base=(/^https?:/.test(location.origin)?location.origin:'https://jirainsight.vercel.app');
  const cmd=`curl -fsSL ${base}/call-tracking/instalar.sh | bash`;
  const cmdSai=`curl -fsSL ${base}/call-tracking/desinstalar.sh | bash`;
  cont.replaceChildren(el(`<div class="tela-chamadas">
    <div class="card full chm-card">
      <h2>📞 Ligações para apontar <span>Call tracking — as chamadas que o seu Mac percebeu (Teams, WhatsApp, Meet, Zoom…) viram ticket ou apontamento</span></h2>
      ${faixa}
      <div class="chm-kpis">
        <div class="chm-kpi"><b>${pend.length}</b><span>esperando registro</span></div>
        <div class="chm-kpi"><b>${esc(pend.length?fmtH(segPend):'—')}</b><span>em ligações sem apontamento</span></div>
        <div class="chm-kpi"><b>${deHoje.length}</b><span>ligação(ões) hoje</span></div>
        <div class="chm-kpi"><b>${feitas7.length}</b><span>registrada(s) em 7 dias</span></div>
      </div>
      ${pend.length
        ?`<div class="chm-lista">${pend.map(linha).join('')}</div>
          ${pend.length>1?`<div class="chm-lote"><button class="btn" data-chm-todas="1">▶ Registrar uma a uma (${pend.length})</button> <span class="muted small">abre a mais antiga; ao confirmar, ignorar ou deixar para depois, vem a próxima</span></div>`:''}`
        :`<div class="estado chm-vazio">${nunca?'Nenhuma ligação recebida ainda neste navegador. Instale o detector no Mac (abaixo) — quando uma ligação terminar, o pop-up dele traz você direto para cá.':'✓ Nenhuma ligação esperando registro.'}</div>`}
    </div>
    ${hist.length?`<div class="card full"><h2>🗂 Já tratadas <span>últimos ${CHM_HIST_DIAS} dias, neste navegador</span></h2><div class="chm-lista">${hist.map(linhaHist).join('')}</div></div>`:''}
    <div class="card full chm-instala">
      <h2>🖥 Detector de ligações no Mac <span>fica na barra de menus e mostra o pop-up quando a ligação termina</span></h2>
      <details class="arv-defs" ${nunca?'open':''}>
        <summary>🔌 Como instalar (uma vez, ~2 minutos)</summary>
        <ol class="md-setup chm-setup">
          <li>No Mac, abra o <b>Terminal</b> e cole a linha abaixo (ela baixa o código do detector, compila no seu Mac e liga o início automático):<br>
            <code>${esc(cmd)}</code> <button class="btn chm-copia" data-chm-copia="${escA(cmd)}">⧉ copiar</button></li>
          <li>Se o macOS pedir as <b>Ferramentas de Linha de Comando do Xcode</b> (gratuitas, da Apple), aceite e rode a linha de novo.</li>
          <li>Procure o <b>📞</b> na barra de menus. Na 1ª ligação pelo navegador, o macOS pergunta se o Call tracking pode controlar o Chrome/Safari — aceite: é assim que ele reconhece o <b>Google Meet</b>, o <b>Teams</b> e o <b>WhatsApp Web</b> pela aba.</li>
          <li>Pelo 📞: duração mínima (padrão 2 min), apps que nunca perguntam, pausar por 1 hora, abrir o formulário numa janela pop-up do Chrome/Edge e <b>reenviar ao painel</b> as ligações já entregues (se a janela abriu noutro perfil do navegador, por exemplo).</li>
        </ol>
        <div class="muted small chm-priv">🔒 O detector só sabe <b>qual app</b> está usando o microfone — nunca ouve nem grava. A ligação chega aqui pelo fragmento da URL (que o navegador não manda ao servidor) e fica só neste navegador até você apontar. macOS 12 ou mais novo; no 14.2+ ele identifica o app com precisão.</div>
        <div class="muted small" style="margin-top:6px">Desinstalar: <code>${esc(cmdSai)}</code></div>
      </details>
      <div class="chm-teste"><button class="btn" data-chm-simula="1">🧪 Simular uma ligação</button> <span class="muted small">cria uma ligação de exemplo (Teams, 25 min) para ver o fluxo sem o Mac</span></div>
    </div>
  </div>`));
  if(estado.chamadas.reabrir&&id&&!chmModalAberto()){ const r=estado.chamadas.reabrir; estado.chamadas.reabrir=null; if(chmDe(r.id)) chmAbre(r.id, r.modo); }
}
function chmAgendaChegou(){ try{ renderChamadas(); }catch(e){} try{ chmAtualizaModal(); }catch(e){} }
// O modal é um só no app (identidade, busca de tickets e ficha usam o mesmo): sem o 📞 na tela, o estado sai.
function chmModalAberto(){
  const md=document.getElementById('modal');
  if(md&&!md.hidden&&document.querySelector('#modal-body > .chm-modal')) return true;
  _chm=null; return false;
}

// ---------- modal "📞 Ligação encerrada" ----------
function chmAbrePedido(){
  const p=estado.chamadas.pedido; if(!p) return;
  estado.chamadas.pedido=null;
  const todas=p.ids.map(chmDe).filter(Boolean);
  const pend=todas.filter(c=>c.st==='pend').sort((a,b)=>String(a.ini).localeCompare(String(b.ini)));
  if(!pend.length){ const r=todas[0]&&todas[0].res; toast(r&&r.key?`Essa ligação já foi registrada em ${r.key}.`:'Essa ligação já foi tratada.','info'); return; }
  if(estado.vista!=='chamadas') vaiPara('chamadas');
  estado.chamadas.fila=pend.map(c=>c.id);
  chmAbre(pend[0].id, p.modo==='lista'?'':p.modo);
}
function chmAbre(idc, modo){
  const c=chmDe(idc); if(!c) return;
  if(c.st!=='pend'){ toast('Essa ligação já foi tratada.','info'); return; }
  if(!estado.chamadas.fila.includes(idc)) estado.chamadas.fila=[idc];
  const id=idApontar();
  if(id&&!estado.agenda.dados&&!estado.agenda.carregando&&!estado.agenda.erro) carregaAgenda(false);
  if(id){ try{ apCarregaRecentes(); }catch(e){} }
  let proj=''; try{ proj=localStorage.getItem(CHM_PROJ)||''; }catch(e){}
  _chm={ id:idc, modo:modo||'', proj, chave:'', chaveRes:'', busca:'', titulo:'', tempo:chmTempoTxt(c.seg), dia:chmDiaSP(c.ini),
    coment:'', vincular:true, tocado:{}, conf:null, confEv:'', executando:false };
  if(c.parcial&&c.parcial.key){ _chm.modo='criar'; }
  abreModal('<div class="chm-modal"><h2>📞 Ligação encerrada</h2><div class="estado">Carregando…</div></div>');
  if(!_projetosCache) garanteProjetos().then(()=>chmAtualizaModal()).catch(()=>{});
  chmDesenhaModal();
}
// Valores que dependem da Agenda/catálogo: só preenchidos enquanto a pessoa não mexeu no campo.
function chmPadroes(m, c){
  const ev=chmEventoDe(c); const tk=chmTicketDoEvento(ev)||(m.conf&&m.conf.k)||'';
  if(!m.tocado.modo&&!m.modo) m.modo=(tk||!ev)?'apontar':'criar';
  if(m.modo==='apontar'&&!m.tocado.chave&&!m.chave&&tk){ m.chave=tk; m.chaveRes=''; }
  const projs=_projetosCache||[];
  if(projs.length&&(!m.proj||!projs.some(p=>p.key===m.proj))) m.proj=(projs.some(p=>p.key==='RDF')?'RDF':projs[0].key);
  if(m.tocado.chave||m.chave){ const p=String(m.chave||'').split('-')[0]; if(p&&projs.some(x=>x.key===p)&&!m.tocado.proj) m.proj=p; }
  if(!m.tocado.titulo) m.titulo=ev?`Reunião: ${ev.titulo}`:(c.tit?`Reunião: ${c.tit}`:`Ligação ${c.rot} — ${fmtBR(chmDiaSP(c.ini))} ${chmHoraSP(c.ini)}`);
  if(!m.tocado.coment) m.coment=(`${ev?`Reunião “${ev.titulo}” — `:''}ligação no ${c.rot}${c.tit&&!ev?` (${c.tit})`:''}, ${chmHoraSP(c.ini)}–${chmHoraSP(c.fim)}`).slice(0,200);
  return { ev, tk };
}
function chmDesenhaModal(){
  const m=_chm; if(!m) return;
  const c=chmDe(m.id); if(!c){ _chm=null; return; }
  const id=idApontar();
  const { ev, tk }=chmPadroes(m, c);
  const fila=estado.chamadas.fila||[]; const pos=fila.indexOf(m.id);
  const projs=_projetosCache||[];
  const optProj=projs.map(p=>`<option value="${escA(p.key)}" ${m.proj===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('')||'<option value="">carregando projetos…</option>';
  const segEv=ev?Math.max(60,Math.round((Date.parse(ev.fim+':00-03:00')-Date.parse(ev.inicio+':00-03:00'))/1000)):0;
  const chips=[...new Set([chmTempoTxt(c.seg), fmtH(Math.max(900,Math.ceil(c.seg/900)*900)), segEv?fmtH(segEv):''].filter(Boolean))];
  const corpoModo=m.modo==='criar'
    ?(c.parcial&&c.parcial.key
      ?`<div class="ap-id">✓ O ticket <b>${esc(c.parcial.key)}</b> já foi criado numa tentativa anterior — falta só apontar. Confirmar não cria outro.</div>`
      :`<div class="alx-campo"><label for="chm-proj">Projeto</label><select id="chm-proj">${optProj}</select> <span class="muted small" id="chm-tipo">${chmTipoHint(m.proj)}</span></div>
        <div class="alx-campo"><label for="chm-titulo">Título</label><input type="text" id="chm-titulo" value="${escA(m.titulo)}" maxlength="250" autocomplete="off"></div>`)
    :`<div id="chm-sug" class="chm-sug">${chmSugHTML(m, c, ev, tk)}</div>
      <div class="chm-busca-l">
        <div class="alx-campo"><label for="chm-proj">Projeto</label><select id="chm-proj">${optProj}</select></div>
        <div class="alx-campo"><label for="chm-busca">Ticket</label><input type="text" id="chm-busca" value="${escA(m.busca)}" placeholder="chave (ex.: ACME-123) ou parte do nome" maxlength="80" autocomplete="off" aria-describedby="chm-escolhido"></div>
      </div>
      <div id="chm-tks" class="chm-tks" aria-live="polite">${chmTksHTML(m, c, ev)}</div>
      <div id="chm-escolhido" class="chm-escolhido">${chmEscolhidoHTML(m)}</div>`;
  const vinc=`<div id="chm-vinc-l">${chmVincHTML(m, ev)}</div>`;
  const btnTxt=m.modo==='criar'?(c.parcial&&c.parcial.key?`⏱ Apontar em ${c.parcial.key}`:'📝 Criar e apontar'):'⏱ Apontar';
  const corpo=`<h2>📞 Ligação encerrada${fila.length>1&&pos>=0?` <span class="chm-fila">${pos+1} de ${fila.length}</span>`:''}</h2>
    <div class="chm-resumo"><span aria-hidden="true">${chmIcone(c)}</span> <b>${esc(c.rot)}</b> · ${esc(chmQuando(c))} · <b>${esc(chmDur(c.seg))}</b>${c.provavel?' <span class="badge">app provável</span>':''}</div>
    ${c.tit?`<div class="muted small chm-tit">“${esc(c.tit)}”</div>`:''}
    <div id="chm-evento" class="chm-evento">${chmEventoHTML(c, ev, tk)}</div>
    <div class="chm-modos" role="radiogroup" aria-label="O que fazer com a ligação">
      <label class="check"><input type="radio" name="chm-modo" value="apontar" ${m.modo!=='criar'?'checked':''}> ⏱ Apontar em ticket existente</label>
      <label class="check"><input type="radio" name="chm-modo" value="criar" ${m.modo==='criar'?'checked':''}> 📝 Criar ticket</label>
    </div>
    ${corpoModo}
    <div class="chm-grade">
      <div class="alx-campo"><label for="chm-tempo">Tempo</label><input type="text" id="chm-tempo" value="${escA(m.tempo)}" maxlength="8" style="width:90px" autocomplete="off" aria-describedby="chm-tempo-dica">
        <span class="chm-chips">${chips.map((t,i)=>`<button type="button" class="chip" data-chm-t="${escA(t)}" data-tip="${i===0?'duração detectada pelo Mac':(segEv&&t===fmtH(segEv)?'duração na agenda':'arredondado para 15 min')}">${esc(t)}</button>`).join('')}</span></div>
      <div class="alx-campo"><label for="chm-dia">Dia</label><input type="date" id="chm-dia" value="${escA(m.dia)}" max="${escA(hojeSP())}">
        <span class="muted small" id="chm-tempo-dica">${m.dia===chmDiaSP(c.ini)?`o apontamento começa às ${esc(chmHoraSP(c.ini))}, como a ligação`:'outro dia: o apontamento entra às 09:00'}</span></div>
    </div>
    <div class="alx-campo"><label for="chm-coment">Comentário</label><input type="text" id="chm-coment" value="${escA(m.coment)}" maxlength="200" autocomplete="off"></div>
    ${vinc}
    ${id
      ?`<div class="chm-acoes"><button class="btn primario" data-chm-conf="1">${esc(btnTxt)}</button>
          <button class="btn" data-chm-depois="1" data-tip="Fica na lista 📞 Ligações para depois">Depois</button>
          <button class="btn" data-chm-ign-m="1" data-tip="Não era trabalho: sai da lista sem apontar">🚫 Ignorar</button></div>`
      :`<div class="ap-id sem" style="margin-top:12px">Para criar e apontar, identifique-se com o e-mail e o token de API do Jira — a ligação continua guardada. <button class="btn primario" data-ap-act="config-id">Identificar-se</button></div>`}
    <div class="ap-fb" id="chm-fb" hidden></div>`;
  if(!id) estado.chamadas.reabrir={ id:m.id, modo:m.modo };
  const mb=document.getElementById('modal-body'); if(!mb) return;
  mb.replaceChildren(el(`<div class="chm-modal">${corpo}</div>`));
  if(m.modo!=='criar'&&m.proj) chmCarregaAbertos(m.proj);
  if(ev&&!tk&&m.confEv!==ev.id) chmConfere(ev);
}
// Atualiza só os pedaços que dependem de dado assíncrono (agenda, catálogo, abertos, recentes) — sem tirar o foco.
function chmAtualizaModal(){
  const m=_chm; if(!m||!chmModalAberto()) return;
  const c=chmDe(m.id); if(!c) return;
  const projAntes=m.proj; const ev0=document.getElementById('chm-evento');
  if(!ev0||!document.querySelector('#modal-body .chm-modos')) return chmDesenhaModal();
  chmLeCampos();
  const { ev, tk }=chmPadroes(m, c);
  ev0.innerHTML=chmEventoHTML(c, ev, tk);
  const sel=document.getElementById('chm-proj');
  if(sel&&(sel.options.length<=1||projAntes!==m.proj)&&(_projetosCache||[]).length){
    sel.innerHTML=(_projetosCache||[]).map(p=>`<option value="${escA(p.key)}" ${m.proj===p.key?'selected':''}>${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('');
    if(m.modo!=='criar') chmCarregaAbertos(m.proj);
  }
  const tipo=document.getElementById('chm-tipo'); if(tipo) tipo.innerHTML=chmTipoHint(m.proj);
  const ti=document.getElementById('chm-titulo'); if(ti&&!m.tocado.titulo&&document.activeElement!==ti) ti.value=m.titulo;
  const co=document.getElementById('chm-coment'); if(co&&!m.tocado.coment&&document.activeElement!==co) co.value=m.coment;
  const sug=document.getElementById('chm-sug'); if(sug) sug.innerHTML=chmSugHTML(m, c, ev, tk);
  const tks=document.getElementById('chm-tks'); if(tks) tks.innerHTML=chmTksHTML(m, c, ev);
  const es=document.getElementById('chm-escolhido'); if(es) es.innerHTML=chmEscolhidoHTML(m);
  const vl=document.getElementById('chm-vinc-l'); if(vl&&!!vl.querySelector('#chm-vinc')!==!!(ev&&!agTicketDe(ev.id))) vl.innerHTML=chmVincHTML(m, ev);
  if(ev&&!tk&&m.confEv!==ev.id) chmConfere(ev);   // a agenda chegou depois do 1º desenho: confere agora se o ticket já existe
}
function chmLeCampos(){
  const m=_chm; if(!m) return;
  const v=(i)=>{ const e=document.getElementById(i); return e?e.value:null; };
  const md=document.querySelector('input[name=chm-modo]:checked'); if(md) m.modo=md.value;
  const pairs=[['chm-proj','proj'],['chm-busca','busca'],['chm-titulo','titulo'],['chm-tempo','tempo'],['chm-dia','dia'],['chm-coment','coment']];
  pairs.forEach(([i,k])=>{ const x=v(i); if(x===null) return;
    if(i==='chm-proj'&&(!x||!(_projetosCache||[]).length)) return;   // placeholder "carregando projetos…"
    m[k]=x; });
  const vi=document.getElementById('chm-vinc'); if(vi) m.vincular=vi.checked;
}
function chmVincHTML(m, ev){
  return ev&&!agTicketDe(ev.id)
    ?`<label class="check chm-vinc"><input type="checkbox" id="chm-vinc" ${m.vincular?'checked':''}> 📅 Ligar o ticket a “${esc(ev.titulo)}” na Agenda (a reunião sai da lista “sem ticket”)</label>`:'';
}
function chmTipoHint(proj){ if(!_projetosCache) return ''; const t=proj?agTipoReuniao(proj):null; return t?`tipo: <b>${esc(t.nome)}</b> · atribuído a você`:'⚠ sem tipo de ticket utilizável neste projeto'; }
function chmEventoHTML(c, ev, tk){
  if(ev) return `📅 Na agenda: <b>${esc(ev.titulo)}</b> · ${esc(ev.inicio.slice(11,16))}–${esc(ev.fim.slice(11,16))}${ev.organizador&&ev.organizador.nome?` · organizado por ${esc(ev.meu?'você':ev.organizador.nome)}`:''}${tk?` · ticket <a href="${jiraBase()}/browse/${encodeURIComponent(tk)}" target="_blank" rel="noopener">${esc(tk)} ↗</a>`:(_chm&&_chm.conf===false?' · sem ticket no Jira ainda':'')}`;
  if(!idApontar()) return '';
  if(estado.agenda.carregando) return '<span class="muted small">🔎 Procurando a reunião na sua agenda…</span>';
  if(estado.agenda.erro||(estado.agenda.dados&&estado.agenda.dados.configurado===false)) return '<span class="muted small">📅 Agenda do Outlook indisponível — título e ticket ficam por sua conta.</span>';
  if(estado.agenda.dados&&!chmAgendaCobre(c)) return '<span class="muted small">📅 A Agenda só cobre de ontem em diante — essa ligação é mais antiga.</span>';
  return estado.agenda.dados?'<span class="muted small">📅 Nenhuma reunião da agenda nesse horário (ligação avulsa).</span>':'';
}
// Sugestões: o ticket da reunião, o ticket do mesmo título/dia no Jira, os meus recentes e os abertos parecidos.
function chmSugestoes(m, c, ev, tk){
  const out=[]; const add=(k,res,por)=>{ if(k&&CHM_RE_CHAVE.test(k)&&!out.some(x=>x.k===k)) out.push({k,res:res||'',por}); };
  if(tk) add(tk, (m.conf&&m.conf.k===tk&&m.conf.resumo)||'', ev&&agTicketDe(ev.id)?'ticket da reunião':'mesmo título e dia no Jira');
  const alvo=(ev&&ev.titulo)||c.tit||'';
  const rec=(estado.apontar.recentes||[]).slice().sort((a,b)=>(alvo?mtPontua(alvo,b.resumo||''):0)-(alvo?mtPontua(alvo,a.resumo||''):0));
  rec.slice(0,3).forEach(r=>add(r.k, r.resumo, `você apontou em ${fmtBR(r.ult||'')}`));
  const ab=(m.proj&&_tkbCache[m.proj]&&_tkbCache[m.proj].tickets)||[];
  if(alvo) ab.map(t=>({t, n:mtPontua(alvo, t.resumo||'')})).filter(x=>x.n>=0.34).sort((a,b)=>b.n-a.n).slice(0,3).forEach(x=>add(x.t.k, x.t.resumo, x.n>=0.8?'parece ser este':'parecido'));
  return out.slice(0,6);
}
function chmSugHTML(m, c, ev, tk){
  const s=chmSugestoes(m, c, ev, tk);
  if(!s.length) return estado.apontar.recCarr?'<span class="muted small">Carregando os seus tickets recentes…</span>':'';
  return `<div class="muted small">Sugestões:</div><div class="chm-sug-l">${s.map(x=>`<button type="button" class="chm-tk ${m.chave===x.k?'sel':''}" data-chm-tk="${escA(x.k)}" data-chm-res="${escA(x.res)}"><b>${esc(x.k)}</b> <span>${esc(String(x.res).slice(0,60))}</span> <em>${esc(x.por)}</em></button>`).join('')}</div>`;
}
function chmTksHTML(m, c, ev){
  if(!m.proj) return '';
  const cache=_tkbCache[m.proj];
  if(!cache) return m.carregandoProj===m.proj?'<span class="muted small">Carregando os tickets abertos…</span>':'';
  const q=normPal(m.busca||'').trim(); const pal=q.split(/\s+/).filter(Boolean);
  const alvo=(ev&&ev.titulo)||c.tit||'';
  let lista=cache.tickets.filter(t=>{ const h=normPal(`${t.k} ${t.resumo||''}`); return pal.every(p=>h.includes(p)); });
  if(alvo&&!q) lista=lista.map(t=>({t,n:mtPontua(alvo,t.resumo||'')})).sort((a,b)=>b.n-a.n).map(x=>x.t);
  const chave=String(m.busca||'').trim().toUpperCase();
  if(CHM_RE_CHAVE.test(chave)){ const ix=lista.findIndex(t=>t.k===chave); if(ix>0) lista.unshift(lista.splice(ix,1)[0]); }   // a chave exata antes de ACME-120…
  const total=lista.length; const temExata=lista.some(t=>t.k===chave); lista=lista.slice(0,8);
  const direto=CHM_RE_CHAVE.test(chave)&&!temExata
    ?`<button type="button" class="chm-tk ${m.chave===chave?'sel':''}" data-chm-tk="${escA(chave)}" data-chm-res=""><b>${esc(chave)}</b> <span>usar esta chave</span> <em>outro projeto ou fechado</em></button>`:'';
  if(!lista.length&&!direto) return `<span class="muted small">${q?'Nenhum ticket aberto com esse texto em '+esc(m.proj)+' — digite a chave completa para usar outro.':'Nenhum ticket aberto em '+esc(m.proj)+'.'}</span>`;
  return `<div class="chm-sug-l">${direto}${lista.map(t=>`<button type="button" class="chm-tk ${m.chave===t.k?'sel':''}" data-chm-tk="${escA(t.k)}" data-chm-res="${escA(t.resumo||'')}"><b>${esc(t.k)}</b> <span>${esc(String(t.resumo||'').slice(0,70))}</span> <em>${esc(t.status||'')}</em></button>`).join('')}</div>${total>8?`<div class="muted small">… e mais ${total-8} — refine a busca.</div>`:''}`;
}
function chmEscolhidoHTML(m){
  if(!m.chave) return '<span class="muted small">Escolha um ticket acima (ou digite a chave).</span>';
  const t=m.chaveRes||((_tkbCache[m.chave.split('-')[0]]||{tickets:[]}).tickets.find(x=>x.k===m.chave)||{}).resumo||'';
  return `✓ Vai apontar em <b>${esc(m.chave)}</b>${t?` — ${esc(String(t).slice(0,80))}`:''} <a href="${jiraBase()}/browse/${encodeURIComponent(m.chave)}" target="_blank" rel="noopener">↗</a>`;
}
// Abertos do projeto: mesma rota e mesmo cache da 🎫 busca de tickets (12b).
function chmCarregaAbertos(p){
  const m=_chm; if(!m||!p) return;
  const c=_tkbCache[p]; if(c&&Date.now()-c.quando<TKB_TTL) return;
  if(m.carregandoProj===p) return; m.carregandoProj=p;
  fetch('/api/reunioes?abertos='+encodeURIComponent(p)).then(r=>r.json()).then(j=>{
    if(j&&Array.isArray(j.tickets)) _tkbCache[p]={ quando:Date.now(), truncado:!!j.truncado, tickets:j.tickets.map(t=>({k:t.k,resumo:t.resumo,status:t.status,tipo:t.tipo,p})) };
  }).catch(()=>{}).then(()=>{ if(_chm&&_chm.carregandoProj===p) _chm.carregandoProj=''; chmAtualizaModal(); });
}
// "Já existe um ticket desta reunião?" — a mesma conferência da Agenda (mesmo título, mesmo dia de vencimento).
function chmConfere(ev){
  const m=_chm; if(!m) return; m.confEv=ev.id;
  fetch('/api/reunioes',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ conferir:1, itens:[{ titulo:ev.titulo, dia:ev.inicio.slice(0,10) }] }) })
    .then(r=>r.json()).then(j=>{ if(!_chm||_chm.confEv!==ev.id) return;
      const a=j&&j.achados&&j.achados[agAchKey(ev)]; const nao=(cfg.agendaNao||{})[ev.id];
      _chm.conf=(a&&a.k&&!(nao&&nao.k===a.k))?a:false; chmAtualizaModal(); })
    .catch(()=>{});
}

// ---------- confirmar ----------
function chmErro(msg){ const fb=document.getElementById('chm-fb'); if(!fb) return; fb.hidden=!msg; fb.className='ap-fb'+(msg?' err':''); fb.textContent=msg||''; }
function chmPost(url, corpo, id){
  return fetch(url,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.assign({},corpo,{ email:id.email, token:id.token })) }).then(r=>r.json());
}
function chmErrTxt(j){ return (j&&j.erros&&j.erros[0]&&j.erros[0].erro)||(j&&j.erro)||''; }
function chmDescricao(c, ev){
  return [`Ligação detectada pelo 📞 Call tracking (Mac): ${c.rot} — ${dataBR(chmDiaSP(c.ini))} ${chmHoraSP(c.ini)}–${chmHoraSP(c.fim)} (${chmDur(c.seg)}).`,
    c.tit?`Aba da chamada: ${c.tit}`:'',
    ev?`Reunião da agenda: ${ev.titulo}${ev.organizador&&ev.organizador.nome?` — organizada por ${ev.organizador.nome}`:''}${ev.participantes?` · ${ev.participantes} participante(s)`:''}`:''].filter(Boolean).join('\n');
}
async function chmConfirma(btn){
  const m=_chm; if(!m||m.executando) return;
  const c=chmDe(m.id); if(!c||c.st!=='pend'){ chmProxima(); return; }
  const id=idApontar(); if(!id){ estado.chamadas.reabrir={ id:m.id, modo:m.modo }; abreIdentidade(); return; }
  chmLeCampos(); chmErro('');
  const seg=parseTempo(String(m.tempo||'').trim());
  if(!(seg>=60&&seg<=86400)) return chmErro('Tempo inválido — use 30m, 1h ou 1h30 (de 1 minuto a 24 horas).');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(m.dia||'')||m.dia>hojeSP()) return chmErro('Escolha um dia válido (hoje ou antes).');
  const ev=chmEventoDe(c);
  let key='', criado=false;
  m.executando=true; ocupado(btn,true);
  try{
    if(m.modo==='criar'){
      if(c.parcial&&c.parcial.key){ key=c.parcial.key; criado=true; }
      else{
        if(!m.proj) throw new Error('Escolha o projeto.');
        await garanteProjetos();
        const tipo=agTipoReuniao(m.proj); if(!tipo||!tipo.id) throw new Error(`O projeto ${m.proj} não tem um tipo de ticket utilizável.`);
        const titulo=String(m.titulo||'').trim(); if(!titulo) throw new Error('Dê um título ao ticket.');
        const base={ projeto:m.proj, tipoId:String(tipo.id), resumo:titulo.slice(0,250), descricao:chmDescricao(c, ev), venc:m.dia,
          labels:ev?['call-tracking','agenda-outlook']:['call-tracking'] };
        let j=await chmPost('/api/criar',{ itens:[Object.assign({},base, id.accountId?{ respId:id.accountId }:{})] }, id);
        let cr=j&&j.criados&&j.criados[0];
        if((!cr||!cr.key)&&id.accountId&&/assignee|atribu|respons/i.test(chmErrTxt(j))){   // projeto não deixa atribuir: cria sem responsável
          j=await chmPost('/api/criar',{ itens:[base] }, id); cr=j&&j.criados&&j.criados[0]; }
        if(!cr||!cr.key) throw new Error(chmErrTxt(j)||'Não consegui criar o ticket.');
        key=cr.key; criado=true;
        chmMuda(c.id, x=>{ x.parcial={ key }; });
        try{ localStorage.setItem(CHM_PROJ, m.proj); }catch(e){}
        logAcao({ acao:'chamada-criar', t:key, para:m.proj, motivo:`${c.rot} ${chmHoraSP(c.ini)}–${chmHoraSP(c.fim)}`, ok:true }, false);
      }
    } else {
      key=String(m.chave||'').trim().toUpperCase();
      if(!CHM_RE_CHAVE.test(key)) throw new Error('Escolha um ticket da lista ou digite a chave (ex.: ACME-123).');
    }
    const hora=m.dia===chmDiaSP(c.ini)?chmHoraSP(c.ini):'';
    const j2=await chmPost('/api/apontar',{ issue:key, segundos:seg, inicio:m.dia, hora, comentario:String(m.coment||'').trim().slice(0,200) }, id);
    if(!j2||!j2.ok) throw new Error((j2&&j2.erro)||'Não consegui apontar.');
    chmMuda(c.id, x=>{ x.st='feito'; x.res={ key, seg, dia:m.dia, criado, em:new Date().toISOString(), ev:ev?ev.titulo:'' }; delete x.parcial; });
    try{ registraExtraDia(m.dia, seg, key); }catch(e){}
    logAcao({ acao:'chamada-apontar', t:key, para:`${fmtH(seg)} em ${m.dia}`, motivo:`${c.rot} ${chmHoraSP(c.ini)}–${chmHoraSP(c.fim)}${ev?` · ${ev.titulo}`:''}`.slice(0,200), ok:true }, false);
    // UMA gravação da config: o agMarcaTicket já grava (salvaCfg) — leva junto o 🗒 Histórico acima.
    let gravou=false;
    if(ev&&m.vincular&&!agTicketDe(ev.id)){ try{ agMarcaTicket(ev.id, key); gravou=true; }catch(e){} }
    if(!gravou){ try{ salvaCfg(); }catch(e){} }
    invalidaCacheDados(); estado.apontar.porData={}; estado.apontar.recentes=null;
    toast(`✓ ${fmtH(seg)} apontadas em ${key}${criado?' (ticket novo)':''}.`,'ok');
    m.executando=false;
    if(_chm===m&&chmModalAberto()) chmProxima();
    else { estado.chamadas.fila=(estado.chamadas.fila||[]).filter(x=>x!==m.id); if(estado.vista==='chamadas'&&!chmModalAberto()) renderChamadas(); try{ renderAbas(); }catch(e){} }
  }catch(e){
    m.executando=false;
    const msg=(e&&e.name==='TypeError')?humanizaErro(e):String((e&&e.message)||e);
    const parc=m.modo==='criar'?(chmDe(m.id)||{}).parcial:null;
    if(parc&&_chm===m&&chmModalAberto()) chmDesenhaModal();   // o botão vira "Apontar em CHAVE": confirmar de novo não cria outro
    else ocupado(btn,false);
    if(_chm===m&&chmModalAberto()) chmErro('⚠ '+msg+(parc?` — o ticket ${parc.key} já foi criado; confirmar de novo só aponta.`:''));
  }
}
// Próxima da fila ("registrar uma a uma") ou fecha. Quem já foi tratado sai da fila.
function chmProxima(){
  const atual=_chm&&_chm.id;
  estado.chamadas.fila=(estado.chamadas.fila||[]).filter(x=>x!==atual&&(chmDe(x)||{}).st==='pend');
  _chm=null;
  if(estado.chamadas.fila.length) chmAbre(estado.chamadas.fila[0], '');
  else fechaModal();
  if(estado.vista==='chamadas') renderChamadas();
  try{ renderAbas(); }catch(e){}
}
function chmIgnora(idc){ chmMuda(idc, x=>{ x.st='ign'; x.res={ em:new Date().toISOString() }; }); }   // o parcial fica: ↺ voltar + criar não duplica o ticket
function chmSimula(){
  const fim=Date.now()-2*60000, ini=fim-25*60000;
  const c=chmValida({ id:'sim-'+fim.toString(36), app:'teams', rot:'Microsoft Teams', bid:'com.microsoft.teams2', ini:new Date(ini).toISOString(), fim:new Date(fim).toISOString() });
  const l=chmLe(); l.push(c); chmGrava(l);
  renderChamadas(); try{ renderAbas(); }catch(e){}
  estado.chamadas.fila=[c.id]; chmAbre(c.id, '');
}

// ---------- listeners ----------
document.addEventListener('DOMContentLoaded', ()=>{ try{ chmAbrePedido(); }catch(e){} });
window.addEventListener('hashchange', ()=>{
  const raw=location.hash.slice(1); if(!/(^|&)ct=/.test(raw)) return;
  try{ history.replaceState(null,'',location.pathname+location.search); }catch(e){}
  const r=chmImporta(raw); if(!r) return;
  estado.chamadas.pedido=r; if(estado.vista==='chamadas') renderChamadas(); chmAbrePedido();
});
// Outra aba recebeu uma ligação: atualiza o contador e a lista (sem mexer num modal aberto).
window.addEventListener('storage', (e)=>{ if(e.key!==CHM_KEY) return; try{ renderAbas(); }catch(x){} if(estado.vista==='chamadas'&&!chmModalAberto()) renderChamadas(); });
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const t=e.target.closest('[data-chm-abre],[data-chm-ign],[data-chm-volta],[data-chm-todas],[data-chm-simula],[data-chm-copia]'); if(!t) return;
  if(t.hasAttribute('data-chm-abre')){ estado.chamadas.fila=[t.getAttribute('data-chm-abre')]; chmAbre(t.getAttribute('data-chm-abre'), t.getAttribute('data-chm-modo')||''); }
  else if(t.hasAttribute('data-chm-ign')){ chmIgnora(t.getAttribute('data-chm-ign')); toast('Ligação ignorada — dá para voltar em “Já tratadas”.','info'); renderChamadas(); try{ renderAbas(); }catch(x){} }
  else if(t.hasAttribute('data-chm-volta')){ chmMuda(t.getAttribute('data-chm-volta'), x=>{ x.st='pend'; delete x.res; }); renderChamadas(); try{ renderAbas(); }catch(x){} }
  else if(t.hasAttribute('data-chm-todas')){ const p=chmPendentes().sort((a,b)=>String(a.ini).localeCompare(String(b.ini))); if(!p.length) return; estado.chamadas.fila=p.map(c=>c.id); chmAbre(p[0].id,''); }
  else if(t.hasAttribute('data-chm-simula')){ chmSimula(); }
  else if(t.hasAttribute('data-chm-copia')){ const tx=t.getAttribute('data-chm-copia');
    (navigator.clipboard?navigator.clipboard.writeText(tx):Promise.reject()).then(()=>toast('✓ Comando copiado — cole no Terminal do Mac.','ok')).catch(()=>toast('Não consegui copiar — selecione o texto e copie.','warn')); }
});
document.getElementById('modal-body').addEventListener('click', (e)=>{
  if(!_chm||!e.target.closest('.chm-modal')) return;
  const t=e.target.closest('[data-chm-conf],[data-chm-depois],[data-chm-ign-m],[data-chm-tk],[data-chm-t]'); if(!t) return;
  if(_chm.executando&&!t.hasAttribute('data-chm-t')) return;   // criando/apontando: nada troca a ligação no meio
  if(t.hasAttribute('data-chm-conf')) chmConfirma(t);
  else if(t.hasAttribute('data-chm-depois')) chmProxima();
  else if(t.hasAttribute('data-chm-ign-m')){ chmIgnora(_chm.id); toast('Ligação ignorada.','info'); chmProxima(); }
  else if(t.hasAttribute('data-chm-tk')){ chmLeCampos(); _chm.chave=t.getAttribute('data-chm-tk'); _chm.chaveRes=t.getAttribute('data-chm-res')||''; _chm.tocado.chave=true;
    document.querySelectorAll('#modal-body .chm-tk').forEach(b=>b.classList.toggle('sel', b.getAttribute('data-chm-tk')===_chm.chave));
    const es=document.getElementById('chm-escolhido'); if(es) es.innerHTML=chmEscolhidoHTML(_chm); }
  else if(t.hasAttribute('data-chm-t')){ const i=document.getElementById('chm-tempo'); if(i){ i.value=t.getAttribute('data-chm-t'); _chm.tempo=i.value; } }
});
document.getElementById('modal-body').addEventListener('change', (e)=>{
  if(!_chm||!e.target.closest('.chm-modal')) return;
  const t=e.target;
  if(t.name==='chm-modo'){ chmLeCampos(); _chm.tocado.modo=true; chmDesenhaModal(); }
  else if(t.id==='chm-proj'){ chmLeCampos(); _chm.tocado.proj=true;
    if(_chm.modo==='criar'){ const h=document.getElementById('chm-tipo'); if(h) h.innerHTML=chmTipoHint(_chm.proj); }
    else { chmCarregaAbertos(_chm.proj); chmAtualizaModal(); } }
  else if(t.id==='chm-dia'){ chmLeCampos(); const c=chmDe(_chm.id); const d=document.getElementById('chm-tempo-dica');
    if(c&&d) d.textContent=_chm.dia===chmDiaSP(c.ini)?`o apontamento começa às ${chmHoraSP(c.ini)}, como a ligação`:'outro dia: o apontamento entra às 09:00'; }
  else if(t.id==='chm-vinc') _chm.vincular=t.checked;
});
document.getElementById('modal-body').addEventListener('input', (e)=>{
  if(!_chm||!e.target.closest('.chm-modal')) return;
  const t=e.target;
  if(t.id==='chm-busca'){ _chm.busca=t.value; const c=chmDe(_chm.id); const tks=document.getElementById('chm-tks'); if(c&&tks) tks.innerHTML=chmTksHTML(_chm, c, chmEventoDe(c)); }
  else if(t.id==='chm-titulo'){ _chm.titulo=t.value; _chm.tocado.titulo=true; }
  else if(t.id==='chm-coment'){ _chm.coment=t.value; _chm.tocado.coment=true; }
  else if(t.id==='chm-tempo'){ _chm.tempo=t.value; }
});
// Enter no campo de ticket: com uma chave digitada ou um único resultado, escolhe; no resto do modal, confirma.
document.getElementById('modal-body').addEventListener('keydown', (e)=>{
  if(!_chm||e.key!=='Enter'||!e.target.closest('.chm-modal')||!e.target.matches('input[type=text],input[type=date]')) return;
  e.preventDefault();
  if(e.target.id==='chm-busca'){ const b=document.querySelector('#chm-tks .chm-tk'); if(b) b.click(); return; }
  const conf=document.querySelector('#modal-body [data-chm-conf]'); if(conf&&!conf.disabled) conf.click();
});
