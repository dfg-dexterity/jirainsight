// Jira Insights · 13 · ⏱ APONTAR — identidade (token da pessoa, só no navegador), minhas horas,
// apontamento rápido, transições, reagendar/transferir/comentar/reclassificar, convites, reunião em grupo.
// ============================ APONTAR (apontamento rápido) ============================
function somaDias(s,n){ let d=s; for(let i=0;i<n;i++) d=proxDia(d); return d; }
// Volta n dias no calendário (somaDias não anda para trás).
function voltaDias(s,n){ const [y,m,d]=String(s).split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d-n)).toISOString().slice(0,10); }
const fmtBR = (iso) => iso ? `${iso.slice(8,10)}/${iso.slice(5,7)}` : '';

// Identidade de quem aponta: e-mail + token de API do Jira, salvos SÓ neste navegador.
// (A API do Jira atribui o worklog ao usuário autenticado — por isso cada pessoa usa
// o próprio token; o token do painel não serve para apontar em nome de outros.)
const ID_KEY='dexterity_apontar_id_v1';
function idApontar(){ try{ const o=JSON.parse(localStorage.getItem(ID_KEY)); if(o&&o.email&&o.token) return o; }catch(e){} return null; }
function salvaIdApontar(o){ try{ localStorage.setItem(ID_KEY, JSON.stringify(o)); }catch(e){} }
function limpaIdApontar(){ try{ localStorage.removeItem(ID_KEY); }catch(e){} }

// Converte texto de tempo em segundos: "1h30", "2h", "30m", "1:30", "1,5" (=horas).
function parseTempo(str){
  if(str==null) return null;
  const s=String(str).trim().toLowerCase().replace(/\s+/g,'').replace(',','.');
  if(!s) return null;
  let m;
  if((m=s.match(/^(\d+):([0-5]?\d)$/))) return (+m[1])*3600+(+m[2])*60;
  if((m=s.match(/^(\d+(?:\.\d+)?)h(?:([0-5]?\d)m?)?$/))) return Math.round((+m[1])*3600)+((+m[2]||0)*60);
  if((m=s.match(/^(\d+(?:\.\d+)?)m(?:in)?$/))) return Math.round((+m[1])*60);
  if((m=s.match(/^(\d+(?:\.\d+)?)$/))) return Math.round((+m[1])*3600);
  return null;
}

// Cache da lista por (data-limite × incluir-sem-vencimento).
function chaveVenc(){ const ap=estado.apontar; return (ap.ate||hojeSP())+'|'+(ap.semVenc?1:0); }
// Próxima segunda-feira (atalho "Próxima semana") a partir de hoje (fuso SP).
function proximaSegunda(){
  const h=hojeSP(); const wd=new Date(h+'T12:00:00-03:00').getUTCDay();   // 0=dom … 6=sáb
  const diff=((1-wd+7)%7)||7;                                            // dias até a próxima segunda (sempre futura)
  return somaDias(h, diff);
}
async function carregaVenc(ate, forca){
  const ap=estado.apontar;
  const key=ate+'|'+(ap.semVenc?1:0);
  if(!forca && ap.porData[key]) return ap.porData[key];
  const r=await fetch(`/api/vencimentos?ate=${encodeURIComponent(ate)}${ap.semVenc?'&incluirSemVenc=1':''}${forca?'&nocache=1':''}`);
  const j=await r.json();
  if(j.erro) throw new Error(j.erro);
  ap.porData[key]=j;
  return j;
}

// Horas que EU (usuário identificado) já apontei por dia, no período carregado,
// somadas ao acumulador otimista do que foi apontado nesta sessão pela aba Apontar.
function minhasHorasPorDia(){
  const id=idApontar(); const out={};
  if(id && id.accountId){
    ((estado.tempo&&estado.tempo.worklogs)||[]).forEach(w=>{
      if(w.a!==id.accountId) return; const d=(w.d||'').slice(0,10); if(!d) return;
      out[d]=(out[d]||0)+(Number(w.s)||0);
    });
  }
  const ex=estado.apontar.extraPorDia||{};
  Object.keys(ex).forEach(d=>{ out[d]=(out[d]||0)+ex[d]; });
  return out;
}
// Registra (otimista) o que acabei de apontar, para o painel refletir na hora.
// Guarda também o TICKET (k) para a grade/calendário do Meu timesheet.
function registraExtraDia(dia, seg, k){
  if(!dia||!seg) return;
  const ap=estado.apontar; ap.extraPorDia=ap.extraPorDia||{};
  ap.extraPorDia[dia]=(ap.extraPorDia[dia]||0)+seg;
  ap.extraLogs=ap.extraLogs||[];
  ap.extraLogs.push({d:dia, s:seg, k:k||'', p:k?String(k).split('-')[0]:'—'});
  // ⏱ card "Apontamento do time" da Início: reflete o meu lançamento na hora,
  // sem esperar o Clockwork (o 🔄 atualizar relê tudo do servidor).
  const ax=estado.acoes, id=idApontar();
  if(ax && Array.isArray(ax.sem) && id && id.accountId && dia>=semChave(hojeSP())){
    ax.sem.push({ a:id.accountId, d:dia, s:seg, k:k||'', p:k?String(k).split('-')[0]:'' });
  }
}
const _diaSemana=(d)=>{ try{ return new Date(d+'T12:00:00-03:00').toLocaleDateString('pt-BR',{weekday:'short'}).replace('.',''); }catch(e){ return ''; } };

// ================= ⏱ Meu timesheet (estilo ferramenta de timetracking) =================
// Duas visões sobre os MEUS worklogs (Clockwork + o que apontei nesta sessão):
// 🧮 Grade  — matriz Projeto → Ticket × dias da semana, com Σ e totais por dia;
// 🗓 Semana — calendário com blocos posicionados pela HORA de início do worklog.
// Soma dias aceitando NEGATIVOS (somaDias global só anda para frente).
function mtsSoma(s,n){ const [y,m,d]=s.split('-').map(Number);
  const x=new Date(Date.UTC(y,m-1,d,12)); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10); }
function mtsSegunda(d){ const wd=diaSemana(d); return mtsSoma(d, wd===0?-6:1-wd); }
function mtsEstado(){ const ap=estado.apontar;
  if(!ap.mtsSem) ap.mtsSem=mtsSegunda(hojeSP());
  if(!ap.mtsModo) ap.mtsModo='grade';
  if(!ap.mtsFech) ap.mtsFech={};
  return ap; }
// Worklogs meus da semana [seg0..seg0+6]: {d, s, k, p, dt(ISO c/ hora), extra}
function mtsLogsSemana(seg0){
  const id=idApontar(); const fim=mtsSoma(seg0,6); const logs=[];
  if(id&&id.accountId){
    ((estado.tempo&&estado.tempo.worklogs)||[]).forEach(w=>{
      if(w.a!==id.accountId) return;
      const d=(w.d||'').slice(0,10); if(!d||d<seg0||d>fim) return;
      logs.push({d, s:Number(w.s)||0, k:w.k||'', p:w.p||(w.k?String(w.k).split('-')[0]:'—'), dt:w.d||''});
    });
  }
  ((estado.apontar.extraLogs)||[]).forEach(x=>{
    if(x.d<seg0||x.d>fim) return;
    logs.push({d:x.d, s:x.s, k:x.k||'', p:x.p||'—', dt:'', extra:true});
  });
  return logs;
}
// Minuto do dia (fuso SP) do início do worklog; null quando não há hora útil.
function mtsMinSP(dt){
  if(!dt||dt.length<=10) return null;
  try{ const x=new Date(dt); if(isNaN(x)) return null;
    const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour12:false,hour:'2-digit',minute:'2-digit'}).format(x);
    const [h,m]=p.split(':').map(Number); const v=h*60+m;
    return v===0?null:v;                       // 00:00 exato = ferramenta sem hora
  }catch(e){ return null; }
}
const MTS_CORES=8;   // slots categóricos validados (dataviz); além disso vira cinza
function htmlPainelHoras(){
  const id=idApontar(); if(!id||!id.accountId) return '';
  const ap=mtsEstado();
  const metaSeg=metaSegDe(id.accountId)||8*3600;
  const seg0=ap.mtsSem, dias=[...Array(7)].map((_,i)=>mtsSoma(seg0,i));
  const hoje=hojeSP();
  const logs=mtsLogsSemana(seg0);
  const resumos=(estado.tempo&&estado.tempo.resumos)||{};
  const projNomes=(estado.tempo&&estado.tempo.projetos)||{};

  // Agregações: por projeto → ticket → dia (e totais).
  const porProj=new Map();
  const porDia={}; let totalSem=0;
  logs.forEach(l=>{
    porDia[l.d]=(porDia[l.d]||0)+l.s; totalSem+=l.s;
    const pj=porProj.get(l.p)||{tot:0, dias:{}, tks:new Map()};
    pj.tot+=l.s; pj.dias[l.d]=(pj.dias[l.d]||0)+l.s;
    const tk=pj.tks.get(l.k||'—')||{tot:0, dias:{}, extra:false};
    tk.tot+=l.s; tk.dias[l.d]=(tk.dias[l.d]||0)+l.s; if(l.extra) tk.extra=true;
    pj.tks.set(l.k||'—', tk);
    porProj.set(l.p, pj);
  });
  const projs=[...porProj.entries()].sort((a,b)=>b[1].tot-a[1].tot);
  const corDe=new Map(projs.map(([p],i)=>[p, i<MTS_CORES?i+1:0]));   // 0 = cinza "outros"

  // Alvo da semana: meta × dias úteis (sem feriado/ausência), até hoje e total.
  const uteis=dias.filter(d=>ehUtil(d)&&!ehFeriado(d)&&!ehAusencia(id.accountId,d));
  const alvoSem=uteis.length*metaSeg;
  const over=dias.filter(d=>(porDia[d]||0)>metaSeg);
  const pct=alvoSem?Math.min(100,Math.round(totalSem/alvoSem*100)):0;
  const rot=(d)=>`${_diaSemana(d)} ${fmtBR(d).slice(0,5)}`;
  const clsDia=(d)=>`${!ehUtil(d)?' fds':''}${ehFeriado(d)&&ehUtil(d)?' fer':''}${d===hoje?' hj':''}`;
  const cel=(seg,forte)=> seg?`<td class="mts-v${forte?' f':''}">${fmtH(seg)}</td>`:'<td class="mts-z">·</td>';

  // Legenda de projetos (cor segue o projeto nas duas visões).
  const legenda=projs.length?`<div class="mts-leg">${projs.map(([p,pj])=>{
    const nome=(projNomes[p]&&projNomes[p].nome)?` — ${projNomes[p].nome}`:'';
    return `<span class="mts-lchip" data-tip="${escA(p)}"><i class="mts-dot c${corDe.get(p)}"></i>${esc(projNome(p))} · ${fmtH(pj.tot)}</span>`;
  }).join('')}</div>`:'';

  // ---- 🧮 Grade: Projeto → Ticket × dia ----
  let grade='';
  if(ap.mtsModo==='grade'){
    const linhas=projs.map(([p,pj])=>{
      const fech=!!ap.mtsFech[p];
      const nome=(projNomes[p]&&projNomes[p].nome)||'';
      const rowsT=fech?'':[...pj.tks.entries()].sort((a,b)=>b[1].tot-a[1].tot).map(([k,tk])=>{
        const res=resumos[k]||'';
        const rotK=k==='—'?'<span class="muted">sem ticket</span>'
          :`<a href="${jiraBase()}/browse/${encodeURIComponent(k)}" target="_blank" rel="noopener">${esc(k)}</a>`;
        return `<tr class="mts-tk"><td class="mts-c1"><span class="mts-rec">└</span> ${rotK}
            <span class="mts-res" title="${escA(res)}">${esc(res)}</span>${tk.extra?' <span class="badge" data-tip="Inclui horas apontadas agora nesta sessão (o Clockwork sincroniza em seguida)">🕓</span>':''}</td>
          <td class="mts-sig">${fmtH(tk.tot)}</td>
          ${dias.map(d=>cel(tk.dias[d])).join('')}</tr>`;
      }).join('');
      return `<tr class="mts-proj"><td class="mts-c1">
          <button class="mts-tgl" data-mts-proj="${escA(p)}" data-tip="${fech?'Mostrar':'Ocultar'} os tickets do projeto">${fech?'▸':'▾'}</button>
          <i class="mts-dot c${corDe.get(p)}"></i><strong data-tip="${escA(p)}">${esc(projNome(p))}</strong></td>
        <td class="mts-sig"><strong>${fmtH(pj.tot)}</strong></td>
        ${dias.map(d=>cel(pj.dias[d],true)).join('')}</tr>${rowsT}`;
    }).join('');
    grade=`<div class="ts-wrap"><table class="mts-tab">
      <thead><tr><th class="mts-c1">Projeto / Ticket</th><th class="mts-sig">Σ</th>
        ${dias.map(d=>`<th class="mts-d${clsDia(d)}">${esc(rot(d))}${ehFeriado(d)&&ehUtil(d)?'<br><span class="muted small">feriado</span>':''}</th>`).join('')}</tr></thead>
      <tbody>${linhas||`<tr><td colspan="9" class="muted small" style="padding:14px 10px">Sem apontamentos nesta semana. O painel usa o <strong>período selecionado</strong> no topo — se a semana está fora dele, troque o período.</td></tr>`}</tbody>
      <tfoot><tr><td class="mts-c1"><strong>Total</strong></td><td class="mts-sig"><strong>${fmtH(totalSem)}</strong></td>
        ${dias.map(d=>{ const s=porDia[d]||0; const ov=s>metaSeg;
          return `<td class="mts-v f${ov?' over':''}${clsDia(d)}">${s?fmtH(s):'·'}${ov?' ⚠':''}</td>`; }).join('')}</tr></tfoot>
    </table></div>`;
  }

  // ---- 🗓 Semana: blocos pela hora de início (fallback: empilha a partir das 08:00) ----
  let cal='';
  if(ap.mtsModo==='cal'){
    const comHora=logs.filter(l=>mtsMinSP(l.dt)!=null);
    let h0=8, h1=19;
    comHora.forEach(l=>{ const m=mtsMinSP(l.dt); h0=Math.min(h0,Math.floor(m/60)); h1=Math.max(h1,Math.ceil((m+l.s/60)/60)); });
    h1=Math.min(23,Math.max(h1,h0+6)); const escala=44/60;   // 44px por hora
    const altura=(h1-h0)*44;
    const colunas=dias.map(d=>{
      const doDia=logs.filter(l=>l.d===d).map(l=>({...l, m:mtsMinSP(l.dt)}));
      // Sem hora (Jira/apontado agora): entra na fila sequencial a partir das 08:00.
      let cursor=8*60;
      doDia.sort((a,b)=>(a.m??9e9)-(b.m??9e9));
      doDia.forEach(l=>{ if(l.m==null){ l.m=cursor; l.semHora=true; } cursor=Math.max(cursor,l.m+Math.max(l.s/60,20)); });
      // Faixas para sobreposição: desloca lateralmente quem começa antes do anterior acabar.
      const fimFaixa=[];
      const blocos=doDia.map(l=>{
        let faixa=fimFaixa.findIndex(f=>f<=l.m); if(faixa<0){ faixa=Math.min(fimFaixa.length,2); }
        fimFaixa[faixa]=l.m+Math.max(l.s/60,20);
        const top=Math.max(0,(l.m-h0*60)*escala), alt=Math.max(19,(l.s/60)*escala);
        const res=resumos[l.k]||'';
        const hIni=`${String(Math.floor(l.m/60)).padStart(2,'0')}:${String(l.m%60).padStart(2,'0')}`;
        const tip=`${l.k||'sem ticket'} — ${res||'(sem resumo)'} · ${l.semHora?'sem hora no worklog':hIni} · ${fmtH(l.s)} · ${l.p}`;
        return `<div class="mts-blk c${corDe.get(l.p)}${l.semHora?' sh':''}" style="top:${top}px;height:${alt}px;left:${faixa*12}%;width:${100-faixa*12}%"
            data-tip="${escA(tip)}"><span class="mts-blk-k">${esc(l.k||l.p)}</span><span class="mts-blk-r">${esc(res)}</span><span class="mts-blk-h">${fmtH(l.s)}</span></div>`;
      }).join('');
      const tot=porDia[d]||0, ov=tot>metaSeg;
      return `<div class="mts-col${clsDia(d)}">
        <div class="mts-col-h">${esc(rot(d))}<span class="mts-col-t${ov?' over':''}">${tot?fmtH(tot):'—'}${ov?' ⚠':''}</span></div>
        <div class="mts-col-c" style="height:${altura}px">${blocos}</div></div>`;
    }).join('');
    const horas=[...Array(h1-h0)].map((_,i)=>`<div class="mts-hora" style="top:${i*44}px">${String(h0+i).padStart(2,'0')}h</div>`).join('');
    cal=`<div class="mts-calwrap"><div class="mts-gutter" style="height:${altura+34}px">${horas}</div><div class="mts-cal">${colunas}</div></div>
      ${comHora.length?'':'<div class="muted small" style="margin-top:6px">ℹ Estes worklogs não trazem hora de início — os blocos foram empilhados a partir das 08:00 na ordem do dia.</div>'}`;
  }

  return `<div class="card full mh-card" id="mh-card">
    <h2>⏱ Meu timesheet <span>meta ${fmtH(metaSeg)}/dia · usa o período selecionado</span></h2>
    <div class="mts-head">
      <div class="mts-nav">
        <button class="btn" data-mts-nav="-1" data-tip="Semana anterior">‹</button>
        <button class="btn" data-mts-nav="0" data-tip="Voltar à semana atual">hoje</button>
        <button class="btn" data-mts-nav="1" data-tip="Próxima semana">›</button>
        <strong>Semana ${esc(fmtBR(seg0).slice(0,5))} – ${esc(fmtBR(mtsSoma(seg0,6)).slice(0,5))}</strong>
      </div>
      <div class="mts-alvo" data-tip="Apontado na semana ÷ meta (${fmtH(metaSeg)} × ${uteis.length} dia(s) útil(eis), já sem feriados e ausências)">
        <span><strong>${fmtH(totalSem)}</strong> de ${fmtH(alvoSem)}</span>
        <span class="mts-prog"><i style="width:${pct}%"></i></span><span class="muted small">${pct}%</span>
      </div>
      <span class="spacer"></span>
      <div class="ap-chips">
        <button class="chip" aria-pressed="${ap.mtsModo==='grade'}" data-mts-modo="grade">🧮 Grade</button>
        <button class="chip" aria-pressed="${ap.mtsModo==='cal'}" data-mts-modo="cal">🗓 Calendário</button>
      </div>
    </div>
    ${over.length?`<div class="aviso">⚠ Você passou da meta de <strong>${fmtH(metaSeg)}/dia</strong> em: ${over.map(d=>`${esc(fmtBR(d))} (<strong>${fmtH(porDia[d])}</strong>)`).join(' · ')}.</div>`:''}
    ${legenda}
    ${grade}${cal}
  </div>`;
}
// Atualiza só o painel (sem re-renderizar a lista) após um apontamento.
function atualizaPainelHoras(){
  const alvo=document.getElementById('mh-card'); if(!alvo) return;
  const novo=el(htmlPainelHoras()); if(novo) alvo.replaceWith(novo);
}

function renderApontar(){
  const cont=document.getElementById('conteudo');
  const ap=estado.apontar;
  if(!ap.ate) ap.ate=hojeSP();

  const dados=ap.porData[chaveVenc()];
  if(!dados){
    if(!ap.carregando){
      ap.carregando=true;
      carregaVenc(ap.ate).then(()=>{ ap.carregando=false; if(estado.vista==='apontar') renderApontar(); })
        .catch(e=>{ ap.carregando=false;
          cont.replaceChildren(el(`<div class="erro"><strong>Falha ao buscar os chamados.</strong> ${esc(e.message||e)}</div>`)); });
    }
    cont.replaceChildren(el('<div class="estado">Buscando chamados com vencimento até '+esc(fmtBR(ap.ate))+'…</div>'));
    return;
  }

  const hoje=dados.meta.hoje||hojeSP();
  const id=idApontar();
  const projs=dados.projetos||{};
  const nomeProj=(k)=>(projs[k]&&projs[k].nome)?`${k} — ${projs[k].nome}`:k;

  // ---- KPIs sobre a lista completa ----
  const todos=dados.tickets||[];
  const vencidos=todos.filter(t=>t.venc&&t.venc<hoje);
  const semHoras=todos.filter(t=>!t.seg);
  const venceHoje=todos.filter(t=>t.venc===hoje);
  const semVenc=todos.filter(t=>!t.venc);

  // ---- Filtros da tela ----
  const catDe=(pk)=>(projs[pk]&&projs[pk].categoria)||'Sem categoria';
  let lista=todos;
  if(ap.fil==='semhoras') lista=lista.filter(t=>!t.seg);
  else if(ap.fil==='vencidos') lista=lista.filter(t=>t.venc&&t.venc<hoje);
  else if(ap.fil==='vencehoje') lista=lista.filter(t=>t.venc===hoje);
  else if(ap.fil==='semvenc') lista=lista.filter(t=>!t.venc);
  if(ap.cat) lista=lista.filter(t=>catDe(t.p)===ap.cat);
  if(ap.proj) lista=lista.filter(t=>t.p===ap.proj);
  if(ap.soMeus && id && id.accountId) lista=lista.filter(t=>t.respId===id.accountId);
  if(ap.busca){ const q=ap.busca.toLowerCase();
    lista=lista.filter(t=>(t.k+' '+t.resumo+' '+t.p+' '+(t.resp||'')).toLowerCase().includes(q)); }

  // ---- Faixa de identidade ----
  const faixaId = id
    ? `<div class="ap-id">⏱ Apontando como <strong>${esc(id.nome||id.email)}</strong>
         <span class="muted small">(worklog criado no seu usuário do Jira — aparece no Clockwork)</span>
         <span class="spacer"></span>
         <button class="btn" data-ap-act="grupo" data-tip="Reunião? Aponte para o time inteiro ou para algumas pessoas de uma vez">👥 Apontar reunião p/ várias pessoas</button>
         <button class="btn" data-ap-act="rateio" data-tip="Vários tickets de uma vez: divida as horas totais por igual, percentual ou fatias">➗ Rateio em massa</button>
         <button class="btn" data-ap-act="trocar-id">Trocar usuário</button></div>`
    : `<div class="ap-id sem">Para apontar, identifique-se uma única vez (e-mail + token de API do Jira — 2 minutos).
         <span class="spacer"></span><button class="btn" data-ap-act="config-id">Identificar-se</button></div>`;

  // ---- Convites de reunião aguardando a confirmação desta pessoa ----
  if(id && id.accountId && ap.convites===null && !ap.convitesBusca) buscaConvites();
  const cvs=ap.convites||[];
  const bannerConvites = (id && cvs.length) ? `
    <div class="card full cv-card">
      <h2>📥 Apontamentos de reunião aguardando você <span>${cvs.length} convite(s) — confirme com 1 clique (o worklog sai no seu usuário)</span></h2>
      <div class="cv-lista">${cvs.map(c=>`
        <div class="cv-row" data-cv-id="${escA(c.id)}">
          <a href="${jiraBase()}/browse/${encodeURIComponent(c.issue)}" target="_blank" rel="noopener"><strong>${esc(c.issue)}</strong> ↗</a>
          <span class="ap-resumo">${esc(c.resumo||'')}</span>
          <span class="badge com-horas">${fmtH(c.segundos)}</span>
          <span class="badge">${fmtBR(c.inicio)}</span>
          ${c.comentario?`<span class="badge" data-tip="${escA(c.comentario)}">💬</span>`:''}
          <span class="badge" data-tip="Quem convidou">por ${esc(c.criadoPor||'?')}</span>
          <span class="spacer"></span>
          <button class="btn primario" data-cv-conf="${escA(c.id)}">✓ Apontar ${fmtH(c.segundos)}</button>
          <button class="btn" data-cv-rec="${escA(c.id)}" data-tip="Não participei / não vou apontar">✕</button>
          <div class="ap-fb" hidden></div>
        </div>`).join('')}
      </div>
      ${cvs.length>1?`<div style="margin-top:10px"><button class="btn primario" id="cv-todos">✓ Confirmar todos (${cvs.length})</button></div>`:''}
    </div>` : '';

  // ---- Meus tickets recentes: onde VOCÊ apontou nos últimos 14 dias (reapontar com 1 clique) ----
  if(id && id.accountId && ap.recentes===null && !ap.recCarr){
    ap.recCarr=true;
    fetch(`/api/tempo?desde=${voltaDias(hoje,13)}&ate=${hoje}`).then(r=>r.json()).then(j=>{
      ap.recCarr=false;
      const meus=((j&&j.worklogs)||[]).filter(w=>w.a===id.accountId && w.k);
      // Guarda o RESUMO junto (do mapa do /api/tempo): o ticket recente nem sempre
      // está na lista de chamados a vencer da tela (ex.: já concluído).
      const nomes=(j&&j.resumos)||{};
      const por={};
      meus.forEach(w=>{ const r=por[w.k]=por[w.k]||{k:w.k,p:w.p||'',seg:0,ult:'',resumo:nomes[w.k]||''};
        r.seg+=Number(w.s)||0; const d=(w.d||'').slice(0,10); if(d>r.ult) r.ult=d; });
      ap.recentes=Object.values(por).sort((a,b)=>b.ult.localeCompare(a.ult)||b.seg-a.seg).slice(0,6);
      if(estado.vista==='apontar') renderApontar();
    }).catch(()=>{ ap.recCarr=false; ap.recentes=[]; });
  }
  // (recRow/blocoRecentes agora vivem DEPOIS da linhaTicket — os recentes reusam a
  //  linha completa do apontamento rápido; ver "🕑 Meus tickets recentes" abaixo.)

  // ---- Barra de filtros ----
  const chipsData=[['Hoje',hoje],['Amanhã',somaDias(hoje,1)],['+7 dias',somaDias(hoje,7)]];
  const filtros=`<div class="ap-filtros">
    <div class="campo"><label>Vencimento até</label>
      <input type="date" id="ap-ate" value="${escA(ap.ate)}"></div>
    <div class="campo"><label>Atalhos</label><div class="ap-chips">${
      chipsData.map(([r,d])=>`<button class="chip" aria-pressed="${ap.ate===d}" data-ap-ate="${escA(d)}">${r}</button>`).join('')}</div></div>
    <div class="campo"><label>Mostrar</label><div class="ap-chips">
      <button class="chip" aria-pressed="${ap.fil==='todos'}" data-ap-fil="todos">Todos</button>
      <button class="chip" aria-pressed="${ap.fil==='semhoras'}" data-ap-fil="semhoras">Sem horas apontadas</button>
      <button class="chip" aria-pressed="${ap.fil==='vencidos'}" data-ap-fil="vencidos">Vencidos</button>
      <button class="chip" aria-pressed="${ap.fil==='vencehoje'}" data-ap-fil="vencehoje">Vencem hoje</button>
      <button class="chip" aria-pressed="${ap.fil==='semvenc'}" data-ap-fil="semvenc" data-tip="Chamados abertos sem data de vencimento — para programar">Sem vencimento</button></div></div>
    <div class="campo"><label>Categoria</label><select id="ap-cat">
      <option value="">Todas</option>${
      [...new Set(Object.values(projs).map(p=>p.categoria||'Sem categoria'))].sort((a,b)=>a.localeCompare(b,'pt'))
        .map(c=>`<option value="${escA(c)}" ${ap.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div>
    <div class="campo"><label>Projeto</label><select id="ap-proj">
      <option value="">Todos</option>${
      Object.keys(projs).filter(k=>!ap.cat||catDe(k)===ap.cat).sort()
        .map(k=>`<option value="${escA(k)}" ${ap.proj===k?'selected':''}>${esc(projNome(k))}${esc(projCod(k))}</option>`).join('')}</select></div>
    ${id?`<label class="check" style="padding-bottom:9px"><input type="checkbox" id="ap-meus" ${ap.soMeus?'checked':''}> Só os meus</label>`:''}
    <label class="check" style="padding-bottom:9px" data-tip="Traz também os chamados abertos que ainda não têm data de vencimento, para você programá-los"><input type="checkbox" id="ap-semvenc" ${ap.semVenc?'checked':''}> Incluir sem vencimento</label>
    <div class="campo"><label>Buscar</label>
      <input type="search" id="ap-busca" placeholder="código, resumo, projeto…" value="${escA(ap.busca)}"></div>
    <div class="campo"><label>&nbsp;</label><button class="btn" id="ap-refresh">Atualizar lista</button></div>
  </div>`;

  // ---- Linhas ----
  const badgeVenc=(v)=>{
    if(!v) return '<span class="badge sem-venc">sem vencimento</span>';
    if(v<hoje){ const d=Math.round((new Date(hoje)-new Date(v))/86400000);
      return `<span class="badge venc-passado">⚠ venceu ${fmtBR(v)} (há ${d}d)</span>`; }
    if(v===hoje) return `<span class="badge venc-hoje">vence hoje</span>`;
    return `<span class="badge">vence ${fmtBR(v)}</span>`;
  };
  // Versão clicável (abre o painel de reagendar) — só para quem está identificado.
  const reagBtn=(t)=>{
    if(!t.venc) return `<button class="badge st-btn sem-venc" data-ap-venc="${escA(t.k)}" data-tip="Sem data — clique para definir o vencimento">📅 definir vencimento ▾</button>`;
    let cls='', txt='';
    if(t.venc<hoje){ const d=Math.round((new Date(hoje)-new Date(t.venc))/86400000); cls=' venc-passado'; txt=`⚠ venceu ${fmtBR(t.venc)} (há ${d}d)`; }
    else if(t.venc===hoje){ cls=' venc-hoje'; txt='vence hoje'; }
    else txt=`vence ${fmtBR(t.venc)}`;
    return `<button class="badge st-btn${cls}" data-ap-venc="${escA(t.k)}" data-tip="Vencimento — clique para reagendar">📅 ${txt} ▾</button>`;
  };
  // Indicador de horas já apontadas no ticket (total, somando todos os usuários).
  const pilulaHoras=(seg)=> seg
    ? `<span class="ap-horas tem" data-tip="Total de horas já apontadas neste ticket (todos os usuários)">⏱ ${fmtH(seg)} já apontadas</span>`
    : `<span class="ap-horas zero" data-tip="Este ticket ainda não tem horas apontadas">⏱ sem horas ainda</span>`;
  const infoLog=(seg)=> seg
    ? `⏱ <strong>${fmtH(seg)}</strong> já apontadas neste ticket — o que você lançar abaixo <strong>soma</strong> a esse total.`
    : '⏱ Este ticket ainda <strong>não tem horas</strong> apontadas — registre o seu tempo abaixo.';
  // Responsável: clicável (abre o painel de transferência) quando identificado.
  const respBtn=(t)=> t.resp
    ? `<button class="badge st-btn" data-ap-resp="${escA(t.k)}" data-tip="Responsável — clique para transferir">👤 ${esc(t.resp)} ▾</button>`
    : `<button class="badge st-btn sem-venc" data-ap-resp="${escA(t.k)}" data-tip="Sem responsável — clique para atribuir">👤 atribuir ▾</button>`;
  const linhaTicket=(t,extras)=>{
    const url=`${jiraBase()}/browse/${encodeURIComponent(t.k)}`;
    const ehReuniao = RE_ROTINA.test(t.t||'') || /reuni/i.test(t.resumo||'');
    const logCtrl = id ? `
      <div class="ap-log">
        <div class="ap-log-info ${t.seg?'tem':'zero'}">${infoLog(t.seg)}</div>
        <div class="ap-chips">${['30m','1h','2h','4h','8h'].map(c=>`<button class="chip" data-ap-chip="${c}">${c}</button>`).join('')}</div>
        <input type="text" class="ap-tempo" placeholder="1h30" aria-label="Tempo">
        <input type="date" class="ap-data" value="${escA(hoje)}" max="${escA(hoje)}" aria-label="Dia do trabalho">
        <input type="text" class="ap-coment" placeholder="comentário (opcional)" aria-label="Comentário">
        <button class="btn primario" data-ap-key="${escA(t.k)}">Apontar</button>
        ${ehReuniao?`<button class="btn" data-ap-grupo="${escA(t.k)}" data-tip="Apontar esta reunião para o time inteiro ou para algumas pessoas">👥 em grupo</button>`:''}
        <div class="ap-fb" hidden></div>
      </div>` : '';
    return `<div class="ap-row ${t.seg?'tem-horas':'zero-horas'}" data-k="${escA(t.k)}">
      <div class="ap-l1">
        <a href="${url}" target="_blank" rel="noopener">${esc(t.k)} ↗</a>
        <span class="ap-resumo">${esc(t.resumo||'')}</span>
        <span class="spacer"></span>
        ${pilulaHoras(t.seg)}${extras||''}
      </div>
      <div class="ap-l2">
        <span class="badge tipo-badge" data-tip="Tipo: ${escA(t.t)}">${t.tIcon?`<img class="ji-ic" src="${escA(t.tIcon)}" alt="" loading="lazy" onerror="this.remove()">`:''}${esc(t.t)}</span>
        ${id?`<button class="badge st-btn" data-ap-st="${escA(t.k)}" data-tip="Status atual — clique para mover o ticket">${esc(t.status)} ▾</button>`
            :`<span class="badge">${esc(t.status)}</span>`}
        ${t.prio?`<span class="badge prio-badge" data-tip="Prioridade: ${escA(t.prio)}">${t.prioIcon?`<img class="ji-ic" src="${escA(t.prioIcon)}" alt="" loading="lazy" onerror="this.remove()">`:''}${esc(t.prio)}</span>`:''}
        ${id?reagBtn(t):badgeVenc(t.venc)}
        ${id?respBtn(t):(t.resp?`<span class="badge" data-tip="Responsável">${esc(t.resp)}</span>`:'<span class="badge">sem responsável</span>')}
        ${id?`<button class="badge st-btn" data-ap-coment="${escA(t.k)}" data-tip="Adicionar um comentário ao chamado">💬 comentar</button>`:''}
        ${id?`<button class="badge st-btn" data-ap-conv="${escA(t.k)}" data-tip="Convidar pessoas do time a apontar horas neste ticket — cada uma confirma com 1 clique (aviso por chat individual do Teams)">📨 convidar</button>`:''}
        ${id?`<button class="badge st-btn" data-ap-mover="${escA(t.k)}" data-tip="Reclassificar: mover este chamado para outro projeto">🔀 mover</button>`:''}
        ${id&&ehReuniao?`<button class="badge st-btn" data-ap-vinc="${escA(t.k)}" data-tip="Vincular esta reunião a um ticket: cria um ticket de apoio funcional (ou comenta num ticket aberto) com os detalhes e EXCLUI a reunião — o mesmo assistente da tela Vincular Reuniões">🔗 vincular a ticket</button>`:''}
      </div>
      ${logCtrl}
    </div>`;
  };
  // ---- 🕑 Meus tickets recentes: MESMAS funcionalidades do apontamento rápido ----
  // Reusa a linhaTicket (status, reagendar, responsável, comentar, mover, vincular,
  // chips e apontar). Ticket fora da lista de abertos (ex.: concluído ou vencendo
  // longe) busca a ficha completa via ?detalhe= e entra com tudo também.
  const recRow=(r)=>{
    const selo=`<span class="badge codigo-proj" data-tip="${escA(r.p)}">${esc(projNome(r.p))}</span>
      <span class="badge com-horas" data-tip="Suas horas neste ticket nos últimos 14 dias">você: ${fmtH(r.seg)}</span>
      <span class="badge" data-tip="Seu último apontamento neste ticket">último: ${fmtBR(r.ult)}</span>`;
    const tk=todos.find(t=>t.k===r.k) || ap.recDet[r.k];
    if(tk) return linhaTicket(tk, selo);
    if(!ap.recDetB[r.k]){ ap.recDetB[r.k]=true;
      fetch(`/api/vencimentos?detalhe=${encodeURIComponent(r.k)}`).then(x=>x.json()).then(j=>{
        ap.recDet[r.k]=(j&&j.k)?j:{ k:r.k, resumo:r.resumo||'', p:r.p||'', t:'', tIcon:'', status:'', venc:'', resp:'', respId:'', prio:'', prioIcon:'', seg:r.seg||0, est:0 };
        if(estado.vista==='apontar') renderApontar();
      }).catch(()=>{ ap.recDetB[r.k]=false; });
    }
    return `<div class="ap-row ap-rec" data-k="${escA(r.k)}"><div class="ap-l1">
      <a href="${jiraBase()}/browse/${encodeURIComponent(r.k)}" target="_blank" rel="noopener">${esc(r.k)} ↗</a>
      <span class="ap-resumo">${esc(r.resumo||'')}</span><span class="spacer"></span>${selo}
      <span class="muted small">carregando a ficha…</span></div></div>`;
  };
  // Fica no FIM da página e recolhido por padrão: o protagonista da aba é o
  // ⏱ Meu timesheet — os recentes são um atalho de reapontamento, não o foco.
  const recs=ap.recentes||[];
  const blocoRecentes = (id && id.accountId && (recs.length||ap.recCarr)) ? `
    <div class="card full">
      <h2><button class="ap-rec-tgl" id="ap-rec-toggle" aria-expanded="${!ap.recFechado}">${ap.recFechado?'▸':'▾'}</button>
        🕑 Meus tickets recentes${recs.length?` (${recs.length})`:''} <span>onde você apontou nos últimos 14 dias — com as mesmas ações do apontamento rápido</span></h2>
      ${ap.recFechado?'' : (ap.recCarr?'<div class="muted small">Carregando seus apontamentos recentes…</div>'
        : `<div class="ap-lista">${recs.map(recRow).join('')}</div>`)}
    </div>` : '';
  // ---- Tabela (visão densa para leitura) ----
  const htmlTabela=()=>{
    const arr=lista.slice().sort((a,b)=>((a.venc||'9999-99-99').localeCompare(b.venc||'9999-99-99'))||a.p.localeCompare(b.p));
    const tr=arr.map(t=>`<tr>
      <td><a href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener">${esc(t.k)} ↗</a></td>
      <td class="ap-tab-res">${esc(t.resumo||'')}</td>
      <td data-tip="${escA(t.p)}">${esc(projNome(t.p))}</td>
      <td>${t.tIcon?`<img class="ji-ic" src="${escA(t.tIcon)}" alt="" loading="lazy" onerror="this.remove()"> `:''}${esc(t.t)}</td>
      <td>${esc(t.status)}</td>
      <td>${t.prio?(t.prioIcon?`<img class="ji-ic" src="${escA(t.prioIcon)}" alt="" loading="lazy" onerror="this.remove()"> `:'')+esc(t.prio):'—'}</td>
      <td class="${t.venc&&t.venc<hoje?'ap-tab-venc':''}">${t.venc?(t.venc<hoje?'⚠ ':'')+esc(fmtBR(t.venc)):'—'}</td>
      <td>${esc(t.resp||'—')}</td>
      <td class="num">${t.seg?fmtH(t.seg):'—'}</td></tr>`).join('');
    return `<div class="scroll-x"><table class="ap-tab"><thead><tr>
      <th>Chave</th><th>Resumo</th><th>Projeto</th><th>Tipo</th><th>Status</th><th>Prioridade</th><th>Vencimento</th><th>Responsável</th><th class="num">Horas</th>
      </tr></thead><tbody>${tr}</tbody></table></div>
      <div class="muted small" style="margin-top:8px">Para apontar/editar (status, vencimento, responsável, mover…), use a visão <b>Lista</b>.</div>`;
  };
  // ---- Quadro (kanban por status) ----
  const htmlQuadro=()=>{
    const porSt={}; lista.forEach(t=>{ const s=t.status||'—'; (porSt[s]=porSt[s]||[]).push(t); });
    const cols=Object.keys(porSt).sort((a,b)=>porSt[b].length-porSt[a].length || a.localeCompare(b,'pt'));
    return `<div class="kanban">${cols.map(s=>{
      const arr=porSt[s].slice().sort((a,b)=>(a.venc||'9999-99-99').localeCompare(b.venc||'9999-99-99'));
      return `<div class="kb-col"><div class="kb-head">${esc(s)} <span>${arr.length}</span></div>
        <div class="kb-cards">${arr.map(t=>`<a class="kb-card" href="${jiraBase()}/browse/${encodeURIComponent(t.k)}" target="_blank" rel="noopener">
          <div class="kb-top"><span class="kb-k">${esc(t.k)}</span><span class="badge codigo-proj" data-tip="${escA(t.p)}">${esc(projNome(t.p))}</span></div>
          <div class="kb-res">${esc(t.resumo||'')}</div>
          <div class="kb-meta">
            ${t.tIcon?`<img class="ji-ic" src="${escA(t.tIcon)}" alt="" loading="lazy" onerror="this.remove()">`:''}
            ${t.venc?`<span class="badge ${t.venc<hoje?'venc-passado':(t.venc===hoje?'venc-hoje':'')}">${t.venc<hoje?'⚠ ':''}${esc(fmtBR(t.venc))}</span>`:''}
            ${t.seg?`<span class="badge com-horas">${fmtH(t.seg)}</span>`:'<span class="badge sem-horas">0h</span>'}
            ${t.resp?`<span class="badge" data-tip="Responsável">${esc(t.resp)}</span>`:''}
          </div></a>`).join('')}</div></div>`;
    }).join('')}</div>
    <div class="muted small" style="margin-top:8px">Para apontar/editar, use a visão <b>Lista</b>.</div>`;
  };

  // ---- Seletor de visualização (lista | tabela | quadro) ----
  const viewToggle=`<div class="ap-vis"><span class="muted small">Visualização:</span>
    <button class="chip" aria-pressed="${ap.vis==='lista'}" data-ap-vis="lista">▤ Lista</button>
    <button class="chip" aria-pressed="${ap.vis==='tabela'}" data-ap-vis="tabela">▦ Tabela</button>
    <button class="chip" aria-pressed="${ap.vis==='quadro'}" data-ap-vis="quadro">🗂 Quadro</button></div>`;

  const vazio = `<div class="estado">Nenhum chamado ${ap.fil==='vencidos'?'vencido':ap.fil==='semhoras'?'sem horas':''} para os filtros atuais.
     ${ap.soMeus&&id?'<br><span class="small">Dica: desmarque “Só os meus” para ver os chamados de todo o time.</span>':''}</div>`;

  let corpoLista;
  if(!lista.length){ corpoLista=vazio; }
  else if(ap.vis==='tabela'){ corpoLista=htmlTabela(); }
  else if(ap.vis==='quadro'){ corpoLista=htmlQuadro(); }
  else {
    // Lista: agrupada por projeto, com cabeçalho clicável (expandir/recolher).
    const porProj={};
    lista.forEach(t=>{ (porProj[t.p]=porProj[t.p]||[]).push(t); });
    const chavesProj=Object.keys(porProj).sort((a,b)=>a.localeCompare(b));
    const rows=chavesProj.map(pk=>{
      const grupo=porProj[pk]; const recolhido=!!ap.recolhidos[pk];
      const cab=`<button class="ap-proj-head${recolhido?' recolhido':''}" data-ap-projtoggle="${escA(pk)}" aria-expanded="${!recolhido}" data-tip="${escA(projNomeCod(pk))} — clique para ${recolhido?'expandir':'recolher'}">
        <span class="ap-proj-chev">▾</span>
        <span class="ap-proj-cod">${esc(projNome(pk))}</span>
        <span class="ap-proj-nome">${esc(pk)}</span>
        <span class="spacer"></span>
        <span class="ap-proj-cont">${grupo.length} chamado(s)</span></button>`;
      return cab + (recolhido?'':grupo.map(linhaTicket).join(''));
    }).join('');
    const barraGrupos = chavesProj.length>1
      ? `<div class="ap-grp-bar"><span class="muted small">${chavesProj.length} projetos</span><span class="spacer"></span>
          <button class="chip" id="ap-expandir">▾ Expandir todos</button>
          <button class="chip" id="ap-recolher">▸ Recolher todos</button></div>`
      : '';
    corpoLista = barraGrupos + `<div class="ap-lista">${rows}</div>`;
  }

  cont.replaceChildren(el(`<div>
    ${faixaId}
    ${bannerConvites}
    ${htmlPainelHoras()}
    <div class="kpis ts-kpis">
      <div class="kpi a" data-ap-fil="todos" aria-pressed="${ap.fil==='todos'}" data-tip="Mostrar todos" data-tipk="clique para filtrar">
        <div class="v">${todos.length}</div><div class="l">Chamados até ${fmtBR(ap.ate)}</div></div>
      <div class="kpi w" data-ap-fil="vencidos" aria-pressed="${ap.fil==='vencidos'}" data-tip="Só os vencidos" data-tipk="clique para filtrar">
        <div class="v">${vencidos.length}</div><div class="l">Vencidos</div></div>
      <div class="kpi w" data-ap-fil="semhoras" aria-pressed="${ap.fil==='semhoras'}" data-tip="Só os sem horas apontadas" data-tipk="clique para filtrar">
        <div class="v">${semHoras.length}</div><div class="l">Sem horas apontadas</div></div>
      <div class="kpi t" data-ap-fil="vencehoje" aria-pressed="${ap.fil==='vencehoje'}" data-tip="Só os que vencem hoje" data-tipk="clique para filtrar">
        <div class="v">${venceHoje.length}</div><div class="l">Vencem hoje</div></div>
      ${ap.semVenc?`<div class="kpi a" data-ap-fil="semvenc" aria-pressed="${ap.fil==='semvenc'}" data-tip="Só os sem data de vencimento" data-tipk="clique para filtrar">
        <div class="v">${semVenc.length}</div><div class="l">Sem vencimento</div></div>`:''}
    </div>
    <div class="card full">
      <h2>Apontamento rápido <span>chamados abertos com vencimento até ${fmtBR(ap.ate)}${ap.semVenc?' (+ sem vencimento)':''} · exibindo ${lista.length} de ${todos.length}${dados.meta.truncado?' (lista parcial)':''} · clique no 📅 para reagendar</span></h2>
      ${filtros}
      ${viewToggle}
      ${corpoLista}
    </div>
    ${blocoRecentes}
  </div>`));
}

// Modal de identificação (uma vez por navegador).
function abreIdentidade(){
  const id=idApontar()||{};
  abreModal(`
    <h2>Identificação para apontar</h2>
    <div class="muted small">O apontamento é criado <strong>no seu usuário do Jira</strong> (vale para Clockwork,
      ranking e timesheet). Para isso você precisa de um token de API — é grátis e leva 2 minutos:</div>
    <ol class="ap-passos">
      <li>Abra <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noopener">id.atlassian.com → Tokens de API ↗</a></li>
      <li>Clique em <strong>Criar token de API</strong>, dê um nome (ex.: “Apontamento”) e copie o token.</li>
      <li>Cole abaixo com o seu e-mail do Jira e clique em <strong>Validar e salvar</strong>.</li>
    </ol>
    <div class="mt-form" style="margin-top:14px">
      <div class="campo" style="flex:1;min-width:220px"><label>Seu e-mail do Jira</label>
        <input type="text" id="ap-id-email" value="${escA(id.email||'')}" placeholder="voce@dexterity.com.br"></div>
      <div class="campo" style="flex:1;min-width:220px"><label>Token de API</label>
        <input type="password" id="ap-id-token" value="" placeholder="cole o token aqui"></div>
      <button class="btn primario" id="ap-id-validar">Validar e salvar</button>
    </div>
    <div class="ap-fb" id="ap-id-fb" hidden></div>
    <div class="muted small" style="margin-top:12px">O token fica salvo <strong>apenas neste navegador</strong> e é
      usado só para criar os seus worklogs. ${id.email?'<button class="btn" id="ap-id-sair" style="margin-left:6px">Esquecer minhas credenciais</button>':''}</div>
  `);
}

// Valida e-mail+token no servidor e salva a identidade.
async function validaIdentidade(){
  const email=document.getElementById('ap-id-email').value.trim();
  const token=document.getElementById('ap-id-token').value.trim();
  const fb=document.getElementById('ap-id-fb'); fb.hidden=false; fb.className='ap-fb';
  if(!email||!token){ fb.classList.add('err'); fb.textContent='Preencha o e-mail e o token.'; return; }
  fb.textContent='Validando…';
  try{
    const j=await fetch('/api/apontar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({validar:true,email,token})}).then(r=>r.json());
    if(j.ok){ salvaIdApontar({email:j.email||email,token,nome:j.nome||email,accountId:j.accountId||''});
      estado.apontar.convites=null;   // recarrega os convites do (novo) usuário
      buscaConvites();                 // atualiza o selo de convites pendentes na aba
      fb.classList.add('ok'); fb.textContent=`✓ Olá, ${j.nome||email}! Credenciais salvas.`;
      setTimeout(()=>{ fechaModal(); if(estado.vista==='apontar') renderApontar(); },700);
    } else { fb.classList.add('err'); fb.textContent=j.erro||'Não foi possível validar.'; }
  }catch(e){ fb.classList.add('err'); fb.textContent='Erro de rede: '+(e.message||e); }
}

// Envia o apontamento de uma linha e dá o feedback inline.
async function fazApontamento(btn){
  const row=btn.closest('.ap-row'); if(!row) return;
  const k=btn.getAttribute('data-ap-key');
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const tempoEl=row.querySelector('.ap-tempo'), dataEl=row.querySelector('.ap-data'),
        comEl=row.querySelector('.ap-coment'), fb=row.querySelector('.ap-fb');
  const seg=parseTempo(tempoEl.value);
  fb.hidden=false; fb.className='ap-fb';
  if(seg==null){ fb.classList.add('err'); fb.textContent='Tempo inválido — use 1h30, 2h, 45m ou 1,5.'; tempoEl.focus(); return; }
  if(seg<60||seg>24*3600){ fb.classList.add('err'); fb.textContent='Tempo fora do limite (mínimo 1m, máximo 24h).'; tempoEl.focus(); return; }
  const inicio=dataEl.value||hojeSP();
  ocupado(btn,true); fb.textContent='Apontando…';
  try{
    const j=await fetch('/api/apontar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({issue:k,segundos:seg,inicio,comentario:comEl.value.trim(),email:id.email,token:id.token})}).then(r=>r.json());
    if(j.ok){
      row.classList.add('feito'); tempoEl.value=''; comEl.value='';
      // Atualiza o total do ticket na lista (otimista) e derruba caches locais.
      const dados=estado.apontar.porData[chaveVenc()];
      const t=dados&&dados.tickets&&dados.tickets.find(x=>x.k===k); if(t) t.seg=(t.seg||0)+seg;
      const novoTotal=t?t.seg:seg;
      // Reflete o novo total na pílula do título, na faixa lateral e no aviso do campo.
      row.classList.remove('zero-horas'); row.classList.add('tem-horas');
      const pil=row.querySelector('.ap-horas');
      if(pil){ pil.className='ap-horas tem'; pil.textContent=`⏱ ${fmtH(novoTotal)} já apontadas`; }
      const info=row.querySelector('.ap-log-info');
      if(info){ info.className='ap-log-info tem';
        info.innerHTML=`⏱ <strong>${fmtH(novoTotal)}</strong> já apontadas neste ticket — o que você lançar abaixo <strong>soma</strong> a esse total.`; }
      // Painel "Meu timesheet": registra e avisa se passou da meta diária.
      registraExtraDia(inicio, seg, k); atualizaPainelHoras();
      const meuId=idApontar(); const metaSeg=metaSegDe(meuId&&meuId.accountId)||8*3600;
      const totalDia=minhasHorasPorDia()[inicio]||0;
      if(totalDia>metaSeg){ fb.className='ap-fb warn';
        fb.textContent=`⚠ ${fmtH(seg)} apontadas em ${k}. Você já tem ${fmtH(totalDia)} em ${fmtBR(inicio)} — acima da meta de ${fmtH(metaSeg)}/dia.`;
        toast(`Apontado em ${k}, mas você já passou da meta de ${fmtH(metaSeg)} em ${fmtBR(inicio)}.`,'warn'); }
      else { fb.classList.add('ok'); fb.textContent=`✓ ${fmtH(seg)} apontadas em ${k} (${fmtBR(inicio)}). Total do dia: ${fmtH(totalDia)}.`;
        toast(`✓ ${fmtH(seg)} apontadas em ${k}.`,'ok'); }
      logAcao({acao:'apontar', t:k, para:fmtH(seg)+' em '+inicio, ok:true});
      // "Meus tickets recentes" acompanha sem nova busca.
      const recs=estado.apontar.recentes;
      if(Array.isArray(recs)){
        const rec=recs.find(r=>r.k===k);
        if(rec){ rec.seg+=seg; if(inicio>rec.ult) rec.ult=inicio; }
        else{ recs.unshift({k, p:(t&&t.p)||k.split('-')[0], seg, ult:inicio}); recs.length=Math.min(recs.length,6); }
      }
      invalidaCacheDados();   // painéis recarregam dados frescos na próxima navegação
    } else { const m=humanizaErro(j.erro||'Falha ao apontar.'); fb.classList.add('err'); fb.textContent=m; toast(m,'err'); }
  }catch(e){ const m=humanizaErro(e); fb.classList.add('err'); fb.textContent=m; toast(m,'err'); }
  ocupado(btn,false);
}

// Abre/fecha o painel de transições de status de um chamado (lazy: busca no clique).
async function toggleTransicoes(btn){
  const row=btn.closest('.ap-row'); if(!row) return;
  const k=btn.getAttribute('data-ap-st');
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const aberto=row.querySelector('.ap-trans');
  if(aberto){ aberto.remove(); return; }                 // segundo clique fecha
  const area=document.createElement('div'); area.className='ap-trans';
  area.innerHTML='<span class="muted small">Carregando transições…</span>';
  row.querySelector('.ap-l2').after(area);
  try{
    const j=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({listar:true,issue:k,email:id.email,token:id.token})}).then(r=>r.json());
    if(!j.ok){ area.innerHTML=`<span class="ap-fb err">${esc(j.erro||'Falha ao listar transições.')}</span>`; return; }
    if(!(j.transicoes||[]).length){ area.innerHTML='<span class="muted small">Nenhuma transição disponível para você neste ticket.</span>'; return; }
    area.innerHTML='<span class="ap-trans-rot">Mover para:</span>'+j.transicoes.map(tr=>
      `<button class="chip st-${escA(tr.categoria)}" data-ap-trans="${escA(tr.id)}"
         data-ap-trans-issue="${escA(k)}" data-ap-trans-nome="${escA(tr.para||tr.nome)}"
         data-ap-trans-cat="${escA(tr.categoria)}"
         data-tip="${escA(tr.nome+(tr.para&&tr.para!==tr.nome?' → '+tr.para:''))}">${esc(tr.para||tr.nome)}</button>`).join('');
  }catch(e){ area.innerHTML=`<span class="ap-fb err">Erro de rede: ${esc(e.message||e)}</span>`; }
}

// Executa a transição escolhida e atualiza a linha.
async function executaTransicao(btn){
  const row=btn.closest('.ap-row'); const area=btn.closest('.ap-trans'); if(!row||!area) return;
  const k=btn.getAttribute('data-ap-trans-issue');
  const tid=btn.getAttribute('data-ap-trans');
  const novo=btn.getAttribute('data-ap-trans-nome');
  const catg=btn.getAttribute('data-ap-trans-cat');
  const id=idApontar(); if(!id) return;
  [...area.querySelectorAll('button')].forEach(b=>{ b.disabled=true; });
  btn.textContent='Movendo…';
  try{
    const j=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({issue:k,transitionId:tid,email:id.email,token:id.token})}).then(r=>r.json());
    if(j.ok){
      const stBtn=row.querySelector('[data-ap-st]'); if(stBtn) stBtn.textContent=`${novo} ▾`;
      const dados=estado.apontar.porData[chaveVenc()];
      const t=dados&&dados.tickets&&dados.tickets.find(x=>x.k===k); if(t) t.status=novo;
      const tg=((estado.gestao&&estado.gestao.dados&&estado.gestao.dados.tickets)||[]).find(x=>x.k===k); if(tg) tg.status=novo;
      const fechou=(catg==='done');
      invalidaCacheDados();   // painéis recarregam dados frescos na próxima navegação
      if(fechou){
        // Concluído: o chamado SOME da lista (a tela mostra só abertos). Mostra o ✓,
        // esmaece a linha e re-renderiza (KPIs e contadores atualizam juntos).
        if(dados&&dados.tickets) dados.tickets=dados.tickets.filter(x=>x.k!==k);
        row.classList.add('feito');
        area.innerHTML=`<span class="ap-fb ok">✓ ${esc(k)} concluído — saindo da lista…</span>`;
        row.style.transition='opacity .5s ease'; row.style.opacity='.35';
        setTimeout(()=>{ if(estado.vista==='apontar') renderApontar(); else if(estado.vista==='gestao') renderGestao(); }, 1100);
      } else {
        area.innerHTML=`<span class="ap-fb ok">✓ Status atualizado para “${esc(novo)}”.</span>`;
        setTimeout(()=>{ area.remove(); }, 3000);
      }
    } else { area.innerHTML=`<span class="ap-fb err">${esc(j.erro||'Falha ao mover o ticket.')}</span>`; }
  }catch(e){ area.innerHTML=`<span class="ap-fb err">Erro de rede: ${esc(e.message||e)}</span>`; }
}

// ---------------- Reagendar: muda a data de vencimento do chamado ----------------
// Abre/fecha o painel de reagendamento (lazy, sob a linha) — espelha toggleTransicoes.
function toggleReagendar(btn){
  const row=btn.closest('.ap-row'); if(!row) return;
  const k=btn.getAttribute('data-ap-venc');
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const aberto=row.querySelector('.ap-reag'); if(aberto){ aberto.remove(); return; }
  const dados=estado.apontar.porData[chaveVenc()];
  const t=dados&&dados.tickets&&dados.tickets.find(x=>x.k===k);
  const hoje=(dados&&dados.meta&&dados.meta.hoje)||hojeSP();
  const temData=!!(t&&t.venc);
  const area=document.createElement('div'); area.className='ap-trans ap-reag';
  area.innerHTML=`<span class="ap-trans-rot">Reagendar para:</span>
    <button class="chip" data-ap-reag="HOJE" data-ap-reag-k="${escA(k)}">Hoje</button>
    <button class="chip" data-ap-reag="AMANHA" data-ap-reag-k="${escA(k)}">Amanhã</button>
    <button class="chip" data-ap-reag="PROX" data-ap-reag-k="${escA(k)}" data-tip="Próxima segunda-feira">Próxima semana</button>
    <input type="date" class="ap-reag-data" value="${escA(temData?t.venc:hoje)}" aria-label="Nova data de vencimento">
    <button class="chip primario-chip" data-ap-reag="DATA" data-ap-reag-k="${escA(k)}">aplicar data</button>
    ${temData?`<button class="chip" data-ap-reag="LIMPAR" data-ap-reag-k="${escA(k)}" data-tip="Tirar a data de vencimento">remover data</button>`:''}
    <div class="ap-fb" hidden></div>`;
  row.querySelector('.ap-l2').after(area);
}

// Aplica a nova data (ou remove) via /api/transicao (modo reagendar), com o token da pessoa.
async function executaReagendar(btn){
  const row=btn.closest('.ap-row'); const area=btn.closest('.ap-reag'); if(!row||!area) return;
  const k=btn.getAttribute('data-ap-reag-k'); const acao=btn.getAttribute('data-ap-reag');
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const ap=estado.apontar; const hoje=hojeSP();
  const fb=area.querySelector('.ap-fb'); fb.hidden=false; fb.className='ap-fb';
  let nova=null;
  if(acao==='HOJE') nova=hoje;
  else if(acao==='AMANHA') nova=somaDias(hoje,1);
  else if(acao==='PROX') nova=proximaSegunda();
  else if(acao==='LIMPAR') nova=null;
  else if(acao==='DATA'){ const inp=area.querySelector('.ap-reag-data'); nova=(inp&&inp.value)||'';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(nova)){ fb.classList.add('err'); fb.textContent='Escolha uma data válida.'; return; } }
  [...area.querySelectorAll('button')].forEach(b=>{ b.disabled=true; });
  fb.textContent='Reagendando…';
  try{
    const j=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({reagendar:true,issue:k,duedate:nova,email:id.email,token:id.token})}).then(r=>r.json());
    if(j.ok){
      const dados=ap.porData[chaveVenc()];
      const t=dados&&dados.tickets&&dados.tickets.find(x=>x.k===k); if(t) t.venc=nova||'';
      const tg=((estado.gestao&&estado.gestao.dados&&estado.gestao.dados.tickets)||[]).find(x=>x.k===k); if(tg) tg.venc=nova||'';
      invalidaCacheDados();
      // Sai da lista se deixou de pertencer à janela atual (sem data e não estamos incluindo sem-data; ou venc além da data-limite).
      const saiu=(!nova && !ap.semVenc) || (nova && nova>ap.ate);
      if(saiu && dados&&dados.tickets) dados.tickets=dados.tickets.filter(x=>x.k!==k);
      fb.classList.add('ok');
      fb.textContent = nova ? `✓ ${k} reagendado para ${fmtBR(nova)}.` : `✓ Vencimento de ${k} removido.`;
      row.classList.add('feito');
      if(saiu){ row.style.transition='opacity .5s ease'; row.style.opacity='.35'; }
      setTimeout(()=>{ if(estado.vista==='apontar') renderApontar(); else if(estado.vista==='gestao') renderGestao(); }, saiu?1100:850);
    } else { fb.classList.add('err'); fb.textContent=j.erro||'Falha ao reagendar.';
      [...area.querySelectorAll('button')].forEach(b=>{ b.disabled=false; }); }
  }catch(e){ fb.classList.add('err'); fb.textContent='Erro de rede: '+(e.message||e);
    [...area.querySelectorAll('button')].forEach(b=>{ b.disabled=false; }); }
}

// ---------------- Transferir responsável (assignee) ----------------
function toggleTransferir(btn){
  const row=btn.closest('.ap-row'); if(!row) return;
  const k=btn.getAttribute('data-ap-resp');
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const aberto=row.querySelector('.ap-resp-panel'); if(aberto){ aberto.remove(); return; }
  const dados=estado.apontar.porData[chaveVenc()];
  const t=dados&&dados.tickets&&dados.tickets.find(x=>x.k===k);
  const pessoas=Object.entries(pessoasUnidas()).filter(([a,p])=>!RE_EXCLUIR.test((p&&p.nome)||''))
    .sort((x,y)=>((x[1]&&x[1].nome)||'').localeCompare((y[1]&&y[1].nome)||'','pt'));
  const opts='<option value="">— escolha a pessoa —</option>'+pessoas.map(([a,p])=>
    `<option value="${escA(a)}" ${t&&t.respId===a?'selected':''}>${esc((p&&p.nome)||a)}</option>`).join('');
  const area=document.createElement('div'); area.className='ap-trans ap-resp-panel';
  area.innerHTML=`<span class="ap-trans-rot">Transferir para:</span>
    <select class="ap-resp-sel" aria-label="Nova pessoa responsável">${opts}</select>
    <button class="chip primario-chip" data-ap-resp-do="${escA(k)}">Transferir</button>
    ${id.accountId?`<button class="chip" data-ap-resp-do="${escA(k)}" data-mim="1" data-tip="Atribuir para mim">para mim</button>`:''}
    <button class="chip" data-ap-resp-do="${escA(k)}" data-limpar="1" data-tip="Deixar sem responsável">remover responsável</button>
    <div class="ap-fb" hidden></div>`;
  row.querySelector('.ap-l2').after(area);
}
async function executaTransferir(btn){
  const row=btn.closest('.ap-row'); const area=btn.closest('.ap-resp-panel'); if(!row||!area) return;
  const k=btn.getAttribute('data-ap-resp-do');
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const ap=estado.apontar;
  const limpar=btn.getAttribute('data-limpar')==='1';
  const aMim=btn.getAttribute('data-mim')==='1';
  const sel=area.querySelector('.ap-resp-sel');
  const accountId = limpar ? '' : (aMim ? id.accountId : ((sel&&sel.value)||''));
  const fb=area.querySelector('.ap-fb'); fb.hidden=false; fb.className='ap-fb';
  if(!limpar && !accountId){ fb.classList.add('err'); fb.textContent='Escolha uma pessoa.'; return; }
  [...area.querySelectorAll('button')].forEach(b=>{ b.disabled=true; });
  fb.textContent='Transferindo…';
  try{
    const j=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({atribuir:true,issue:k,accountId,email:id.email,token:id.token})}).then(r=>r.json());
    if(j.ok){
      const nomes=pessoasUnidas();
      const novoNome = accountId ? ((nomes[accountId]&&nomes[accountId].nome)||(aMim?(id.nome||id.email):accountId)) : '';
      const dados=ap.porData[chaveVenc()];
      const t=dados&&dados.tickets&&dados.tickets.find(x=>x.k===k);
      if(t){ t.respId=accountId||''; t.resp=novoNome||''; }
      const tg=((estado.gestao&&estado.gestao.dados&&estado.gestao.dados.tickets)||[]).find(x=>x.k===k); if(tg){ tg.respId=accountId||''; tg.resp=novoNome||''; }
      invalidaCacheDados();
      // Some da lista se o filtro "Só os meus" estiver ligado e não for mais minha.
      const saiu = ap.soMeus && id.accountId && (accountId!==id.accountId);
      if(saiu && dados&&dados.tickets) dados.tickets=dados.tickets.filter(x=>x.k!==k);
      fb.classList.add('ok'); fb.textContent = accountId?`✓ ${k} transferido para ${novoNome}.`:`✓ ${k} sem responsável.`;
      row.classList.add('feito');
      if(saiu){ row.style.transition='opacity .5s ease'; row.style.opacity='.35'; }
      setTimeout(()=>{ if(estado.vista==='apontar') renderApontar(); else if(estado.vista==='gestao') renderGestao(); }, saiu?1100:850);
    } else { fb.classList.add('err'); fb.textContent=j.erro||'Falha ao transferir.';
      [...area.querySelectorAll('button')].forEach(b=>{ b.disabled=false; }); }
  }catch(e){ fb.classList.add('err'); fb.textContent='Erro de rede: '+(e.message||e);
    [...area.querySelectorAll('button')].forEach(b=>{ b.disabled=false; }); }
}

// ---------------- Comentar no chamado ----------------
// O painel tem um seletor de @menções próprio (isolado por painel — várias linhas
// podem estar abertas ao mesmo tempo): chips por pessoa + atalho "marcar o time".
function toggleComentar(btn){
  const row=btn.closest('.ap-row'); if(!row) return;
  const k=btn.getAttribute('data-ap-coment');
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const aberto=row.querySelector('.ap-coment-panel'); if(aberto){ aberto.remove(); return; }
  const area=document.createElement('div'); area.className='ap-trans ap-coment-panel';
  area.innerHTML=`<span class="ap-trans-rot">Comentar em ${esc(k)}:</span>
    <textarea class="ap-coment-txt" rows="2" placeholder="Escreva um comentário para o chamado…" aria-label="Comentário"></textarea>
    <button class="chip primario-chip" data-ap-coment-do="${escA(k)}">Enviar comentário</button>
    <div class="ap-com-menc"><span class="muted small">Marcar (@) — o Jira notifica cada pessoa:</span>
      <span class="mn-chips ap-com-chips"></span>
      <select class="ap-com-add" aria-label="Marcar pessoa"></select>
      <button type="button" class="chip ap-com-todos" data-tip="Marca todas as pessoas ativas do time de uma vez">👥 marcar o time</button></div>
    <div class="ap-fb" hidden></div>`;
  row.querySelector('.ap-l2').after(area);
  const menc=new Map(); area._menc=menc;
  const chips=area.querySelector('.ap-com-chips'), sel=area.querySelector('.ap-com-add');
  const pessoas=()=>Object.entries(pessoasUnidas()).filter(([,p])=>p&&p.nome)
    .sort((x,y)=>(x[1].nome||'').localeCompare(y[1].nome||'','pt'));
  const desenha=()=>{
    chips.innerHTML=[...menc.entries()].map(([a,n])=>
      `<span class="mn-chip">@${esc(n)} <button type="button" data-ap-com-del="${escA(a)}" title="Remover">×</button></span>`).join('')
      ||'<span class="muted small">ninguém marcado</span>';
    sel.innerHTML='<option value="">+ marcar pessoa…</option>'+pessoas().filter(([a])=>!menc.has(a))
      .map(([a,p])=>`<option value="${escA(a)}">${esc(p.nome)}</option>`).join('');
  };
  sel.addEventListener('change',()=>{ const a=sel.value; if(!a) return;
    const p=pessoasUnidas()[a]; menc.set(a,(p&&p.nome)||a); desenha(); });
  chips.addEventListener('click',(e)=>{ const b=e.target.closest('[data-ap-com-del]'); if(!b) return;
    menc.delete(b.getAttribute('data-ap-com-del')); desenha(); });
  area.querySelector('.ap-com-todos').addEventListener('click',()=>{
    pessoas().forEach(([a,p])=>{ menc.set(a,p.nome); }); desenha(); });
  desenha();
  const ta=area.querySelector('.ap-coment-txt'); if(ta) ta.focus();
}
async function executaComentar(btn){
  const area=btn.closest('.ap-coment-panel'); if(!area) return;
  const k=btn.getAttribute('data-ap-coment-do');
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const ta=area.querySelector('.ap-coment-txt'); const texto=((ta&&ta.value)||'').trim();
  const fb=area.querySelector('.ap-fb'); fb.hidden=false; fb.className='ap-fb';
  if(!texto){ fb.classList.add('err'); fb.textContent='Escreva algo antes de enviar.'; if(ta) ta.focus(); return; }
  const marcados=area._menc?[...area._menc.keys()].slice(0,30):[];
  [...area.querySelectorAll('button')].forEach(b=>{ b.disabled=true; });
  fb.textContent='Enviando…';
  try{
    const j=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({comentar:true,issue:k,texto,...(marcados.length?{mencionar:marcados}:{}),email:id.email,token:id.token})}).then(r=>r.json());
    if(j.ok){ fb.classList.add('ok');
      fb.textContent=`✓ Comentário enviado em ${k}${marcados.length?` marcando ${marcados.length} pessoa(s)`:''}.`;
      if(ta) ta.value=''; invalidaCacheDados();
      setTimeout(()=>{ const a=area; if(a) a.remove(); }, 2500);
    } else { fb.classList.add('err'); fb.textContent=j.erro||'Falha ao comentar.';
      [...area.querySelectorAll('button')].forEach(b=>{ b.disabled=false; }); }
  }catch(e){ fb.classList.add('err'); fb.textContent='Erro de rede: '+(e.message||e);
    [...area.querySelectorAll('button')].forEach(b=>{ b.disabled=false; }); }
}

// ---------------- Reclassificar: mover o chamado para outro projeto ----------------
// Carrega (uma vez) a lista de projetos com seus tipos; reaproveita o cache do Planejar.
let _projetosPromise=null, _projetosCache=null;
// ---- Nome do projeto na interface (regra de produto de 2026-08-10) ----------
// Em relatórios, tabelas, gráficos e legendas a ferramenta mostra o NOME do
// projeto — nunca só a sigla. O código continua existindo (links do Jira, JQL,
// chaves de ticket) e aparece no tooltip/legenda de apoio.
// Fontes, nesta ordem: projetos que vêm com os worklogs (/api/tempo) e o
// catálogo do Jira (/api/projetos, que tem o nome oficial de todos).
let _projNomeMap=null, _projNomeSel='', _projNomeBusca=false;
function projNomes(){
  const tp=(estado.tempo&&estado.tempo.projetos)||{};
  const sel=`${(_projetosCache||[]).length}|${Object.keys(tp).length}`;
  if(_projNomeMap&&_projNomeSel===sel) return _projNomeMap;
  const m={};
  Object.keys(tp).forEach(k=>{ if(tp[k]&&tp[k].nome) m[k]=tp[k].nome; });
  (_projetosCache||[]).forEach(p=>{ if(p&&p.key&&p.nome) m[p.key]=p.nome; });   // catálogo prevalece
  _projNomeMap=m; _projNomeSel=sel;
  return m;
}
// Nome do projeto; enquanto o catálogo não chegou, devolve a própria chave e
// dispara UMA busca — quando responder, a tela se redesenha com os nomes.
function projNome(k){
  const key=String(k==null?'':k).trim();
  if(!key||key==='—') return key||'—';
  const n=projNomes()[key];
  if(!n && !_projetosCache && !_projNomeBusca){
    _projNomeBusca=true;
    garanteProjetos().then(()=>{ _projNomeBusca=false; _projNomeMap=null; try{ render(); }catch(e){} })
      .catch(()=>{ _projNomeBusca=false; });
  }
  return n||key;
}
// " (COD)" para pendurar no title/tooltip — vazio quando o nome é a própria sigla.
function projCod(k){ const key=String(k==null?'':k).trim(); return (key&&projNome(key)!==key)?` (${key})`:''; }
// Nome + código, para tooltips e listas de apoio.
function projNomeCod(k){ const key=String(k==null?'':k).trim(); return projNome(key)+projCod(key); }
function garanteProjetos(){
  if(estado.planejar && estado.planejar.projetos){ _projetosCache=estado.planejar.projetos; return Promise.resolve(estado.planejar.projetos); }
  if(!_projetosPromise){
    _projetosPromise=fetch('/api/projetos').then(r=>r.json()).then(j=>{
      const ps=j.projetos||[]; _projetosCache=ps;
      if(estado.planejar && !estado.planejar.projetos) estado.planejar.projetos=ps;
      return ps;
    });
  }
  return _projetosPromise;
}
// Popula o seletor de TIPO do destino conforme o projeto escolhido (default = tipo de origem, se existir).
function preencheTiposDestino(area){
  const sel=area.querySelector('.ap-mover-sel'); const tipoSel=area.querySelector('.ap-mover-tipo');
  const moverBtn=area.querySelector('[data-ap-mover-do]');
  const proj=(sel&&sel.value)||'';
  if(!proj){ tipoSel.innerHTML='<option>tipo…</option>'; tipoSel.disabled=true; if(moverBtn) moverBtn.disabled=true; return; }
  const p=(_projetosCache||[]).find(x=>x.key===proj);
  const tipos=((p&&p.tipos)||[]).filter(tp=>!tp.subtarefa).sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt'));
  const orig=(area.dataset.tipoOrig||'').toLowerCase();
  tipoSel.innerHTML=tipos.length
    ? tipos.map(tp=>`<option value="${escA(tp.nome)}" ${(tp.nome||'').toLowerCase()===orig?'selected':''}>${esc(tp.nome)}</option>`).join('')
    : '<option value="">(projeto sem tipos)</option>';
  tipoSel.disabled=!tipos.length; if(moverBtn) moverBtn.disabled=!tipos.length;
}
function toggleReclass(btn){
  const row=btn.closest('.ap-row'); if(!row) return;
  const k=btn.getAttribute('data-ap-mover');
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const aberto=row.querySelector('.ap-mover-panel'); if(aberto){ aberto.remove(); return; }
  const dados=estado.apontar.porData[chaveVenc()];
  const t=dados&&dados.tickets&&dados.tickets.find(x=>x.k===k);
  const area=document.createElement('div'); area.className='ap-trans ap-mover-panel';
  area.dataset.tipoOrig=(t&&t.t)||'';
  area.innerHTML=`<span class="ap-trans-rot">Mover para:</span>
    <select class="ap-mover-sel" aria-label="Projeto destino" disabled><option>carregando projetos…</option></select>
    <select class="ap-mover-tipo" aria-label="Tipo no destino" disabled><option>tipo…</option></select>
    <button class="chip primario-chip" data-ap-mover-do="${escA(k)}" disabled>Mover →</button>
    <div class="ap-fb" hidden></div>`;
  row.querySelector('.ap-l2').after(area);
  garanteProjetos().then(ps=>{
    if(!area.isConnected) return;
    const sel=area.querySelector('.ap-mover-sel');
    const outros=ps.filter(p=>p.key!==(t&&t.p)).sort((a,b)=>a.key.localeCompare(b.key));
    sel.innerHTML='<option value="">— escolha o projeto —</option>'+outros.map(p=>`<option value="${escA(p.key)}">${esc(p.nome||p.key)} (${esc(p.key)})</option>`).join('');
    sel.disabled=false;
  }).catch(()=>{ const sel=area.querySelector('.ap-mover-sel'); if(sel){ sel.innerHTML='<option>erro ao carregar projetos</option>'; } });
}
async function executaReclass(btn){
  const row=btn.closest('.ap-row'); const area=btn.closest('.ap-mover-panel'); if(!row||!area) return;
  const k=btn.getAttribute('data-ap-mover-do');
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const sel=area.querySelector('.ap-mover-sel'); const alvo=(sel&&sel.value)||'';
  const tipoSel=area.querySelector('.ap-mover-tipo'); const tipoDestino=(tipoSel&&tipoSel.value)||'';
  const fb=area.querySelector('.ap-fb'); fb.hidden=false; fb.className='ap-fb';
  if(!alvo){ fb.classList.add('err'); fb.textContent='Escolha o projeto destino.'; return; }
  if(!tipoDestino){ fb.classList.add('err'); fb.textContent='Escolha o tipo no destino.'; return; }
  const dados=estado.apontar.porData[chaveVenc()];
  const trava=(v)=>[...area.querySelectorAll('button,select')].forEach(b=>{ b.disabled=v; });
  trava(true); fb.textContent='Movendo… (pode levar alguns segundos)';
  try{
    let j=await fetch('/api/reunioes',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({alvo,itens:[{id:k,tipo:tipoDestino}],email:id.email,token:id.token})}).then(r=>r.json());
    let tentativas=0;
    while(j.ok && j.status==='andamento' && j.taskId && tentativas<8){
      await new Promise(r=>setTimeout(r,2500)); tentativas++;
      j=await fetch('/api/reunioes',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({taskId:j.taskId,email:id.email,token:id.token})}).then(r=>r.json());
    }
    if(j.ok && j.status==='completo'){
      const mov=j.movidos&&j.movidos[0]; const novaChave=(mov&&mov.key)||'';
      if(dados&&dados.tickets) dados.tickets=dados.tickets.filter(x=>x.k!==k);   // mudou de projeto/chave: sai da lista
      invalidaCacheDados();
      fb.classList.add('ok'); fb.textContent=`✓ ${k} movido para ${alvo}${(novaChave&&novaChave!==k)?` (agora ${novaChave})`:''}.`;
      row.classList.add('feito'); row.style.transition='opacity .5s ease'; row.style.opacity='.35';
      setTimeout(()=>{ if(estado.vista==='apontar') renderApontar(); }, 1300);
    } else if(j.ok && j.status==='andamento'){
      fb.textContent='Ainda em andamento no Jira — atualize a lista em instantes.'; trava(false);
    } else {
      fb.classList.add('err'); fb.textContent=j.erro||'Falha ao mover o chamado.'; trava(false);
    }
  }catch(e){ fb.classList.add('err'); fb.textContent='Erro de rede: '+(e.message||e); trava(false); }
}

// ---------------- Reunião em grupo: convites de apontamento ----------------
// Quem organizou a reunião dispara um convite (ticket + tempo + dia + pessoas);
// cada convidado confirma com 1 clique e o worklog é criado NO USUÁRIO DELE.
// Pinta um selo com o nº de convites pendentes no botão da aba ⏱ Apontar (visível
// de qualquer aba, para quem está identificado).
function pintaBadgeConvites(n){
  // Pinta o selo só no item ⏱ Apontar — o cabeçalho do grupo 👤 Meu trabalho é do
  // selo do Inbox (pintaBadgeInbox), que já soma convites + menções + aprovações.
  [document.querySelector('#seg-vista [data-v="apontar"]')].forEach(el=>{
    if(!el) return; let b=el.querySelector('.tab-badge');
    if(n>0){ if(!b){ b=document.createElement('span'); b.className='tab-badge'; el.appendChild(b); }
      b.textContent=n; b.title=n+' convite(s) de reunião aguardando você'; }
    else if(b){ b.remove(); }
  });
}
function buscaConvites(){
  const id=idApontar(); if(!id||!id.accountId){ pintaBadgeConvites(0); return; }
  const ap=estado.apontar; ap.convitesBusca=true;
  fetch(`/api/apontar?convites=1&accountId=${encodeURIComponent(id.accountId)}`)
    .then(r=>r.json())
    .then(j=>{ ap.convites=(j&&j.convites)||[]; ap.convitesBusca=false;
      pintaBadgeConvites(ap.convites.length);
      if(ap.convites.length && estado.vista==='apontar') renderApontar(); })
    .catch(()=>{ ap.convites=[]; ap.convitesBusca=false; });
}

// Confirma (ou recusa) um convite do banner. Confirmação = worklog no próprio usuário.
async function respondeConvite(btn, recusa){
  const row=btn.closest('.cv-row'); if(!row) return;
  const cid=btn.getAttribute(recusa?'data-cv-rec':'data-cv-conf');
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const fb=row.querySelector('.ap-fb'); fb.hidden=false; fb.className='ap-fb';
  [...row.querySelectorAll('button')].forEach(b=>{ b.disabled=true; });
  fb.textContent=recusa?'Recusando…':'Apontando…';
  try{
    const corpo=recusa?{recusarConvite:cid}:{confirmarConvite:cid};
    const j=await fetch('/api/apontar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...corpo,email:id.email,token:id.token})}).then(r=>r.json());
    if(j.ok){
      row.classList.add('feito');
      fb.classList.add('ok');
      fb.textContent=recusa?'Convite recusado.':`✓ ${fmtH(j.segundos||0)} apontadas em ${j.issue||''} (${fmtBR(j.inicio||'')}).`;
      estado.apontar.convites=(estado.apontar.convites||[]).filter(c=>c.id!==cid);
      pintaBadgeConvites(estado.apontar.convites.length); pintaBadgeInbox();
      if(!recusa && j.inicio && j.segundos){ registraExtraDia(j.inicio, j.segundos, j.issue); atualizaPainelHoras(); }
      invalidaCacheDados();   // painéis recarregam dados frescos na próxima navegação
      setTimeout(()=>{ if(estado.vista==='apontar') renderApontar(); else if(estado.vista==='inbox') renderInbox(); }, recusa?600:1400);
    } else { fb.classList.add('err'); fb.textContent=j.erro||'Falha ao confirmar.';
      [...row.querySelectorAll('button')].forEach(b=>{ b.disabled=false; }); }
  }catch(e){ fb.classList.add('err'); fb.textContent='Erro de rede: '+(e.message||e);
    [...row.querySelectorAll('button')].forEach(b=>{ b.disabled=false; }); }
}

// Confirma todos os convites pendentes, um a um.
async function confirmaTodosConvites(btn){
  btn.disabled=true;
  const botoes=[...document.querySelectorAll('[data-cv-conf]')];
  for(const b of botoes){ if(!b.disabled) await respondeConvite(b,false); }
}

// Times salvos (presets de pessoas) — só neste navegador, de quem organiza.
const RG_TIMES_KEY='dexterity_rg_times_v1', RG_SEL_KEY='dexterity_rg_sel_v1';
function rgTimes(){ try{ const t=JSON.parse(localStorage.getItem(RG_TIMES_KEY)); if(t&&typeof t==='object') return t; }catch(e){} return {}; }
function rgSalvaTimes(t){ try{ localStorage.setItem(RG_TIMES_KEY, JSON.stringify(t)); }catch(e){} }
function rgSelecionados(){ return [...document.querySelectorAll('#rg-pessoas input[data-rg-p]:checked')].map(c=>c.getAttribute('data-rg-p')); }
function rgAplicaSelecao(ids){ const set=new Set(ids||[]);
  document.querySelectorAll('#rg-pessoas input[data-rg-p]').forEach(c=>{ c.checked=set.has(c.getAttribute('data-rg-p')); }); }
function rgRenderTimes(){
  const cont=document.getElementById('rg-times'); if(!cont) return;
  const times=rgTimes(); const nomes=Object.keys(times).sort((a,b)=>a.localeCompare(b,'pt'));
  cont.innerHTML = nomes.length
    ? nomes.map(n=>`<span style="display:inline-flex;align-items:center;gap:2px">
        <button class="chip" data-rg-time="${escA(n)}" data-tip="Selecionar as ${times[n].length} pessoa(s) deste time">${esc(n)} (${times[n].length})</button>
        <button class="chip" data-rg-time-del="${escA(n)}" data-tip="Excluir este time salvo">×</button></span>`).join('')
    : '<span class="muted small">Nenhum time salvo ainda — selecione as pessoas e salve com um nome para reusar.</span>';
}

// Modal "apontar reunião para várias pessoas" (preKey opcional = ticket pré-escolhido).
function abreReuniaoGrupo(preKey){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const hoje=hojeSP();
  let ultima=[]; try{ ultima=JSON.parse(localStorage.getItem(RG_SEL_KEY))||[]; }catch(e){}
  const marcar=new Set(ultima.length?ultima:[id.accountId]);
  const pessoas=Object.entries(estado.usuarios||{})
    .filter(([a,p])=>!RE_EXCLUIR.test(p.nome||''))
    .sort((x,y)=>(x[1].nome||'').localeCompare(y[1].nome||'','pt'));
  const lista = pessoas.length
    ? pessoas.map(([a,p])=>`<label class="check"><input type="checkbox" data-rg-p="${escA(a)}" ${marcar.has(a)?'checked':''}> ${esc(p.nome||a)}${a===id.accountId?' <span class="muted small">(você)</span>':''}</label>`).join('')
    : '<span class="muted small">Carregando pessoas…</span>';
  abreModal(`
    <h2>👥 Apontar reunião para várias pessoas</h2>
    <div class="muted small">Você aponta o seu na hora; os demais recebem um <strong>convite</strong> e confirmam com
      <strong>1 clique</strong> na aba ⏱ Apontar — o worklog de cada um sai <strong>no usuário da própria pessoa</strong>.</div>
    <div class="mt-form" style="margin-top:14px">
      <div class="campo"><label>Ticket da reunião</label>
        <input type="text" id="rg-issue" value="${escA(preKey||'')}" placeholder="RDF-123" style="width:130px;text-transform:uppercase"></div>
      <div class="campo"><label>Tempo</label>
        <input type="text" id="rg-tempo" value="1h" placeholder="1h30" style="width:84px;text-align:center"></div>
      <div class="campo"><label>Atalhos</label><div class="ap-chips">${
        ['30m','1h','1h30','2h'].map(c=>`<button class="chip" data-rg-chip="${c}">${c}</button>`).join('')}</div></div>
      <div class="campo"><label>Dia da reunião</label>
        <input type="date" id="rg-data" value="${escA(hoje)}" max="${escA(hoje)}"></div>
    </div>
    <div class="campo" style="margin-top:10px"><label>Comentário (opcional, vai no worklog de todos)</label>
      <input type="text" id="rg-coment" placeholder="ex.: Reunião semanal de status" style="width:100%;box-sizing:border-box"></div>
    <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <strong style="font-size:13px">Quem participou</strong>
      <button class="chip" id="rg-todos">marcar todos</button>
      <button class="chip" id="rg-nenhum">desmarcar todos</button>
      <span class="spacer"></span>
      <span id="rg-times" style="display:inline-flex;gap:6px;flex-wrap:wrap"></span>
    </div>
    <div class="rg-pessoas" id="rg-pessoas">${lista}</div>
    <div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">
      <input type="text" id="rg-time-nome" placeholder="nome do time (ex.: Sustentação)" style="width:200px">
      <button class="chip" id="rg-time-salvar" data-tip="Salva a seleção atual como um time para reusar">💾 Salvar seleção como time</button>
    </div>
    <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn primario" id="rg-enviar">Apontar / convidar →</button>
      <label class="check" style="padding-bottom:0" data-tip="Com TEAMS_DM_WEBHOOK_URL configurada na Vercel, cada convidado recebe uma mensagem individual (chat privado); sem ela, o aviso vai ao canal"><input type="checkbox" id="rg-teams" checked> avisar no Teams</label>
    </div>
    <div class="ap-fb" id="rg-fb" hidden></div>
  `);
  rgRenderTimes();
  // Elenco ainda não carregado (ex.: entrou direto na aba Apontar): busca agora.
  if(!pessoas.length){
    usuariosP().then(j=>{
      estado.usuarios=Object.assign({}, j.pessoas||{}, estado.usuarios||{});
      const cont=document.getElementById('rg-pessoas'); if(!cont) return;
      cont.innerHTML=Object.entries(estado.usuarios).filter(([a,p])=>!RE_EXCLUIR.test(p.nome||''))
        .sort((x,y)=>(x[1].nome||'').localeCompare(y[1].nome||'','pt'))
        .map(([a,p])=>`<label class="check"><input type="checkbox" data-rg-p="${escA(a)}" ${marcar.has(a)?'checked':''}> ${esc(p.nome||a)}${a===id.accountId?' <span class="muted small">(você)</span>':''}</label>`).join('');
    }).catch(()=>{});
  }
}

// Envia o convite do grupo (e o apontamento do organizador, se ele se marcou).
async function enviaReuniaoGrupo(){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const issue=(document.getElementById('rg-issue').value||'').trim().toUpperCase();
  const seg=parseTempo(document.getElementById('rg-tempo').value);
  const inicio=document.getElementById('rg-data').value||hojeSP();
  const comentario=(document.getElementById('rg-coment').value||'').trim();
  const avisarTeams=!!(document.getElementById('rg-teams')||{}).checked;
  const ids=rgSelecionados();
  const fb=document.getElementById('rg-fb'); fb.hidden=false; fb.className='ap-fb';
  if(!/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(issue)){ fb.classList.add('err'); fb.textContent='Informe o ticket (ex.: RDF-123).'; return; }
  if(seg==null||seg<60||seg>24*3600){ fb.classList.add('err'); fb.textContent='Tempo inválido — use 1h30, 2h, 45m ou 1,5.'; return; }
  if(!ids.length){ fb.classList.add('err'); fb.textContent='Selecione pelo menos uma pessoa.'; return; }
  try{ localStorage.setItem(RG_SEL_KEY, JSON.stringify(ids)); }catch(e){}
  // email = para o aviso INDIVIDUAL no Teams (chat privado); o servidor completa
  // pelo cadastro do Jira se faltar aqui.
  const pessoas=ids.map(a=>{ const u=pessoasUnidas()[a]||estado.usuarios[a]||{};
    return { accountId:a, nome:u.nome||a, email:(u.email||'').toLowerCase() }; });
  const btn=document.getElementById('rg-enviar'); btn.disabled=true; fb.textContent='Enviando…';
  try{
    const j=await fetch('/api/apontar',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({convidar:true,issue,segundos:seg,inicio,comentario,pessoas,avisarTeams,
        email:id.email,token:id.token})}).then(r=>r.json());
    if(j.ok){
      const partes=[];
      if(j.proprio) partes.push(j.proprio.ok?'seu apontamento foi registrado':`o seu falhou (${j.proprio.erro})`);
      if(j.diretos) partes.push(`${j.diretos} apontado(s) direto via Clockwork`);
      if(j.pendentes) partes.push(`${j.pendentes} convite(s) aguardando confirmação`);
      // Aviso no Teams: individual (chat privado) quando configurado; senão, canal.
      if(avisarTeams && j.pendentes){
        if(j.teamsInfo){ const ti=j.teamsInfo;
          if(ti.enviados) partes.push(`✉️ ${ti.enviados} aviso(s) individual(is) no Teams`);
          if(ti.semEmail&&ti.semEmail.length) partes.push(`⚠ sem e-mail no Jira: ${ti.semEmail.join(', ')}`);
          if(ti.falhas&&ti.falhas.length) partes.push(`⚠ falha em ${ti.falhas.length} aviso(s)`);
          if(!ti.enviados) partes.push(ti.fallbackCanal==='enviado'?'aviso enviado ao canal (fallback)':'⚠ nenhum aviso saiu');
        }
        else if(j.teams==='enviado') partes.push('avisado no canal do Teams');
        else if(j.teams==='nao-configurado') partes.push('⚠ Teams não configurado (defina TEAMS_WEBHOOK_URL)');
        else if(j.teams && /^erro/i.test(j.teams)) partes.push('⚠ falha ao avisar no Teams');
      }
      fb.classList.add('ok');
      fb.innerHTML=`✓ <strong>${esc(j.issue)}</strong>: ${esc(partes.join(' · ')||'nada a fazer')}.
        ${j.pendentes?'<br><span class="muted small">Os convidados veem o convite no topo da aba ⏱ Apontar (precisam estar identificados com o token do Jira) e confirmam com 1 clique.</span>':''}`;
      invalidaCacheDados();
      // Atualiza o total do ticket na lista (otimista), como no apontamento individual.
      if(j.proprio&&j.proprio.ok){
        const dados=estado.apontar.porData[chaveVenc()];
        const t=dados&&dados.tickets&&dados.tickets.find(x=>x.k===j.issue); if(t) t.seg=(t.seg||0)+seg;
        registraExtraDia(inicio, seg, j.issue); atualizaPainelHoras();
      }
      setTimeout(()=>{ fechaModal(); if(estado.vista==='apontar') renderApontar(); }, j.teams==='nao-configurado'?4200:2600);
    } else { fb.classList.add('err'); fb.textContent=j.erro||'Falha ao enviar os convites.'; btn.disabled=false; }
  }catch(e){ fb.classList.add('err'); fb.textContent='Erro de rede: '+(e.message||e); btn.disabled=false; }
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
// ---- Tela Apontar: cliques (chips, KPIs-filtro, identidade, enviar) ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  // Filtro de exibição: serve para os chips E para os cards de KPI do topo.
  const fl=e.target.closest && e.target.closest('[data-ap-fil]');
  if(fl){ escondeTip(); const v=fl.getAttribute('data-ap-fil'); estado.apontar.fil=v;
    if(v==='semvenc' && !estado.apontar.semVenc) estado.apontar.semVenc=true;   // precisa carregar os sem-data
    renderApontar(); estadoParaURL(); return; }
  const t=e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-ap-ate')){ estado.apontar.ate=t.getAttribute('data-ap-ate'); renderApontar(); estadoParaURL(); }
  else if(t.hasAttribute('data-ap-chip')){ const row=t.closest('.ap-row');
    const inp=row&&row.querySelector('.ap-tempo'); if(inp){ inp.value=t.getAttribute('data-ap-chip'); inp.focus(); } }
  else if(t.hasAttribute('data-ap-key')){ fazApontamento(t); }
  else if(t.hasAttribute('data-ap-st')){ escondeTip(); toggleTransicoes(t); }
  else if(t.hasAttribute('data-ap-trans')){ escondeTip(); executaTransicao(t); }
  else if(t.hasAttribute('data-ap-venc')){ escondeTip(); toggleReagendar(t); }
  else if(t.hasAttribute('data-ap-reag')){ escondeTip(); executaReagendar(t); }
  else if(t.hasAttribute('data-ap-resp')){ escondeTip(); toggleTransferir(t); }
  else if(t.hasAttribute('data-ap-resp-do')){ executaTransferir(t); }
  else if(t.hasAttribute('data-ap-coment')){ escondeTip(); toggleComentar(t); }
  else if(t.hasAttribute('data-ap-conv')){ escondeTip(); abreConvidarApontar(t.getAttribute('data-ap-conv')); }
  else if(t.id==='qk-criar'){ qkCria(); }
  else if(t.id==='qk-mic'){ qkMic(); }
  else if(t.id==='qk-siri'){ qkSiriModal(); }
  else if(t.hasAttribute('data-ap-coment-do')){ executaComentar(t); }
  // ---- ⏱ Meu timesheet (grade × calendário, navegação de semana, recolher projeto) ----
  else if(t.hasAttribute('data-mts-modo')){ mtsEstado().mtsModo=t.getAttribute('data-mts-modo'); escondeTip(); atualizaPainelHoras(); }
  else if(t.hasAttribute('data-mts-nav')){ const ap=mtsEstado(); const n=+t.getAttribute('data-mts-nav');
    ap.mtsSem=n===0?mtsSegunda(hojeSP()):mtsSoma(ap.mtsSem, n*7); escondeTip(); atualizaPainelHoras(); }
  else if(t.hasAttribute('data-mts-proj')){ const ap=mtsEstado(); const p=t.getAttribute('data-mts-proj');
    ap.mtsFech[p]=!ap.mtsFech[p]; escondeTip(); atualizaPainelHoras(); }
  else if(t.hasAttribute('data-ap-mover')){ escondeTip(); toggleReclass(t); }
  else if(t.hasAttribute('data-ap-mover-do')){ executaReclass(t); }
  else if(t.hasAttribute('data-ap-projtoggle')){ escondeTip(); const pk=t.getAttribute('data-ap-projtoggle');
    estado.apontar.recolhidos[pk]=!estado.apontar.recolhidos[pk]; renderApontar(); }
  else if(t.hasAttribute('data-ap-vis')){ estado.apontar.vis=t.getAttribute('data-ap-vis'); renderApontar(); estadoParaURL(); }
  else if(t.id==='ap-expandir'){ estado.apontar.recolhidos={}; renderApontar(); }
  else if(t.id==='ap-recolher'){ const r={};
    [...document.querySelectorAll('[data-ap-projtoggle]')].forEach(b=>{ r[b.getAttribute('data-ap-projtoggle')]=true; });
    estado.apontar.recolhidos=r; renderApontar(); }
  else if(t.getAttribute('data-ap-act')==='grupo'){ escondeTip(); abreReuniaoGrupo(''); }
  else if(t.getAttribute('data-ap-act')==='rateio'){ escondeTip(); vaiPara('rateio'); }
  else if(t.hasAttribute('data-ap-grupo')){ escondeTip(); abreReuniaoGrupo(t.getAttribute('data-ap-grupo')); }
  else if(t.hasAttribute('data-ap-vinc')){ escondeTip(); abreRvWizard(t.getAttribute('data-ap-vinc')); }
  else if(t.hasAttribute('data-cv-conf')){ respondeConvite(t,false); }
  else if(t.hasAttribute('data-cv-rec')){ escondeTip(); respondeConvite(t,true); }
  else if(t.id==='cv-todos'){ confirmaTodosConvites(t); }
  else if(t.getAttribute('data-ap-act')==='config-id'||t.getAttribute('data-ap-act')==='trocar-id'){ abreIdentidade(); }
  else if(t.id==='ap-refresh'){ t.disabled=true; t.textContent='Atualizando…';
    estado.apontar.recentes=null;                       // recarrega também os recentes
    carregaVenc(estado.apontar.ate,true)
      .then(()=>{ if(estado.vista==='apontar') renderApontar(); })
      .catch(()=>{ t.disabled=false; t.textContent='Atualizar lista'; }); }
  else if(t.id==='ap-rec-toggle'){ estado.apontar.recFechado=!estado.apontar.recFechado; renderApontar(); }
});
// Fim da composição (acento confirmado): dispara o fluxo normal da busca.
document.getElementById('conteudo').addEventListener('compositionend',(e)=>{
  const id2=e.target&&e.target.id;
  if(id2==='ap-busca'||id2==='gx-busca'||id2==='rc-busca'){
    setTimeout(()=>{ if(e.target&&e.target.isConnected) e.target.dispatchEvent(new Event('input',{bubbles:true})); },0);
  }
});
// Busca da tela Apontar (mantém o foco ao re-renderizar).
document.getElementById('conteudo').addEventListener('input', (e)=>{
  if(e.target && e.target.id==='ap-busca'){
    buscaComposta(e,(v)=>{ estado.apontar.busca=v; },renderApontar,'ap-busca');
  }
});
// Enter no campo de tempo/comentário envia o apontamento da linha.
document.getElementById('conteudo').addEventListener('keydown', (e)=>{
  if(e.key!=='Enter'||!e.target.classList) return;
  if(e.target.classList.contains('ap-tempo')||e.target.classList.contains('ap-coment')){
    const row=e.target.closest('.ap-row'); const b=row&&row.querySelector('[data-ap-key]');
    if(b){ e.preventDefault(); fazApontamento(b); }
  }
});
