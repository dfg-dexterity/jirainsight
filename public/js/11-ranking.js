// Jira Insights · 11 · 🏆 RANKING — engajamento, faixas (semana/mês/ano), pódio, mural, scoreboard.
// ===================== 📈 Ranking — Engajamento & uso do Jira =====================
// Paleta categórica VALIDADA para daltonismo (ordem fixa: cada par adjacente passa
// no teste de separação CVD nos temas claro e escuro — não trocar a ordem).
const RK_PAL={ verde:'#008300', azul:'#009994', laranja:'#eb6834', roxo:'#4a3aa7', vermelho:'#e34948' };
// Segunda-feira (ISO) da semana de uma data — agrupa os worklogs por semana.
function rkSemanaDe(dia){ const dt=new Date(dia+'T12:00:00Z'); const w=(dt.getUTCDay()+6)%7;
  dt.setUTCDate(dt.getUTCDate()-w); return dt.toISOString().slice(0,10); }

// Agrega TODOS os indicadores de engajamento por pessoa no período/filtros da tela:
// horas (+ por semana), tickets com horas, tickets tocados, alterações, transições,
// comentários, criados, concluídos (resolução no changelog), ações no painel
// (auditoria) e % da meta (planejado × realizado). Score 0–100 normalizado no time.
function calcEngajamento(){
  const f=filtros(); const projs=projetosUnidos(); const nomes=pessoasUnidas();
  const P={};
  const at=(a)=>P[a]||(P[a]={ a, nome:(nomes[a]&&nomes[a].nome)||a, seg:0, segFat:0,
    tkHoras:new Set(), tkTocados:new Set(), alter:0, trans:0, coment:0, criado:0, concl:0, acoes:0, porSemana:{} });
  const semTot={}, semFat={};
  (estado.tempo.worklogs||[]).forEach(w=>{
    if(!passa(w.p,w.t,projs,f)) return; if(f.pessoa && w.a!==f.pessoa) return;
    const r=at(w.a); r.seg+=w.s; if(w.f) r.segFat+=w.s; if(w.k) r.tkHoras.add(w.k);
    const dia=(w.d||'').slice(0,10);
    if(dia){ const s=rkSemanaDe(dia); r.porSemana[s]=(r.porSemana[s]||0)+w.s;
      semTot[s]=(semTot[s]||0)+w.s; if(w.f) semFat[s]=(semFat[s]||0)+w.s; }
  });
  (estado.atividade.eventos||[]).forEach(e=>{
    if(!passa(e.p,e.t,projs,f)) return; if(f.pessoa && e.a!==f.pessoa) return;
    const r=at(e.a); r.tkTocados.add(e.k);
    if(e.e==='alteracao') r.alter++;
    else if(e.e==='transicao') r.trans++;
    else if(e.e==='comentario') r.coment++;
    else if(e.e==='criado') r.criado++;
    else if(e.e==='concluido') r.concl++;
  });
  // Ações feitas NA FERRAMENTA (auditoria compartilhada, últimas 300) dentro do período.
  const metaP=(estado.tempo&&estado.tempo.meta)||{}; const de=metaP.startDate||'', ate=metaP.endDate||'';
  const porChave={};
  Object.values(P).forEach(r=>{ porChave[r.nome.toLowerCase()]=r;
    const em=(nomes[r.a]&&nomes[r.a].email)||''; if(em) porChave[em.toLowerCase()]=r; });
  (cfg.auditoria||[]).forEach(ev=>{ const q=String(ev.q||'').slice(0,10);
    if(!q || (de&&q<de) || (ate&&q>ate)) return;
    const r=porChave[String(ev.u||'').toLowerCase()]; if(r) r.acoes++; });
  // % da meta (planejado × realizado) — mesma conta da aba Apontamento.
  const pctDe={}; try{ calcRanking().linhas.forEach(l=>{ pctDe[l.a]=l.pctv; }); }catch(e){}
  const semanas=Object.keys(semTot).sort();
  const rows=Object.values(P).map(r=>({ ...r, tkHoras:r.tkHoras.size, tkTocados:r.tkTocados.size,
    pctMeta:(pctDe[r.a]!=null?pctDe[r.a]:null) }));
  const mx=(fn)=>Math.max(1,...rows.map(fn));
  const mAtu=mx(r=>r.alter+r.trans), mCom=mx(r=>r.coment), mEnt=mx(r=>r.criado+r.concl),
    mAc=mx(r=>r.acoes), mH=mx(r=>r.seg);
  rows.forEach(r=>{
    const metaComp=(r.pctMeta!=null?Math.min(100,r.pctMeta):Math.round(r.seg/mH*100));
    r.score=Math.round(0.35*metaComp + 0.25*((r.alter+r.trans)/mAtu*100) + 0.15*(r.coment/mCom*100)
      + 0.15*((r.criado+r.concl)/mEnt*100) + 0.10*(r.acoes/mAc*100));
  });
  rows.sort((x,y)=>(y.score-x.score)||(y.seg-x.seg)||x.nome.localeCompare(y.nome,'pt'));
  return { rows, semanas, semTot, semFat };
}

function rkAbas(aba){ return `<div class="rk-abas">
  <button class="btn ${aba==='apontamento'?'primario':''}" data-rk-aba="apontamento">🏆 Apontamento (metas)</button>
  <button class="btn ${aba==='uso'?'primario':''}" data-rk-aba="uso">📈 Engajamento &amp; uso do Jira</button>
</div>`; }

// Leaderboard: score de engajamento com barra (trilha e preenchimento no MESMO tom).
function rkLeaderboard(rows){
  const top=rows.slice(0,15);
  if(!top.length) return '<div class="estado">Sem dados para os filtros atuais.</div>';
  const medal=['🥇','🥈','🥉'];
  return `<div class="rklb">`+top.map((r,i)=>`
    <div class="rklb-row">
      <div class="rklb-pos">${medal[i]||(i+1)}</div>
      <div class="rklb-main">
        <div class="rklb-top"><span class="rklb-nome" data-pessoa="${escA(r.a)}" title="${escA(r.nome)}">${esc(r.nome)}</span>
          <span class="rklb-score" data-tip="Score de engajamento (0–100)" data-tip2="35% meta de horas · 25% atualizações · 15% comentários · 15% criação/conclusão · 10% uso do painel">${r.score}</span></div>
        <div class="rklb-bar"><i style="width:${Math.min(100,Math.max(2,r.score))}%"></i></div>
        <div class="rklb-chips">
          <span data-tip="Horas apontadas no período">⏱ ${fmtH(r.seg)}</span>
          <span data-tip="% da meta de apontamento cumprida (planejado × realizado)">🎯 ${r.pctMeta==null?'—':r.pctMeta+'% da meta'}</span>
          <span data-tip="Tickets distintos com horas apontadas">🎟 ${r.tkHoras} c/ horas</span>
          <span data-tip="Alterações + transições feitas nos tickets">✏️ ${r.alter+r.trans} atualizações</span>
          <span data-tip="Comentários (colaboração)">💬 ${r.coment}</span>
          <span data-tip="Tickets criados / concluídos por esta pessoa">🧾 ${r.criado} criados · ${r.concl} concl.</span>
          <span data-tip="Ações feitas por esta pessoa dentro do painel (auditoria)">🛠 ${r.acoes} no painel</span>
        </div>
      </div>
    </div>`).join('')+`</div>`;
}

// Mapa de calor pessoa × semana (sequencial: um tom, mais escuro = mais horas).
function rkHeatmap(rows, semanas){
  const comH=rows.filter(r=>r.seg>0).slice().sort((x,y)=>y.seg-x.seg);
  const top=comH.slice(0,12);
  if(!top.length || !semanas.length) return '<div class="estado">Sem horas no período.</div>';
  const max=Math.max(1,...top.flatMap(r=>semanas.map(s=>r.porSemana[s]||0)));
  const head=`<div class="rkhm-row rkhm-head"><div class="rkhm-nome"></div>${semanas.map(s=>`<div class="rkhm-c rkhm-h">${esc(fmtBR(s))}</div>`).join('')}<div class="rkhm-tot rkhm-h">total</div></div>`;
  const body=top.map(r=>{
    const cels=semanas.map(s=>{ const v=r.porSemana[s]||0; const al=v?(0.12+0.83*v/max):0;
      return `<div class="rkhm-c${v?'':' vazia'}" style="${v?`background:rgba(0,112,242,${al.toFixed(2)})`:''}"
        data-tip="${escA(r.nome+' · semana de '+fmtBR(s))}" data-tip2="${escA(v?fmtH(v):'sem horas')}">${v?`<span class="rkhm-v${al>0.55?' inv':''}">${Math.round(v/3600)}h</span>`:''}</div>`; }).join('');
    return `<div class="rkhm-row"><div class="rkhm-nome" data-pessoa="${escA(r.a)}" title="${escA(r.nome)}">${esc(r.nome)}</div>${cels}<div class="rkhm-tot">${fmtH(r.seg)}</div></div>`;
  }).join('');
  const resto=comH.length-top.length;
  return `<div class="rkhm">${head}${body}</div>
    ${resto>0?`<div class="muted small" style="margin-top:6px">+ ${resto} pessoa(s) com horas além do top 12 (use o filtro de Pessoa para detalhar).</div>`:''}`;
}

// Barras agrupadas: tickets criados × concluídos por pessoa (2 séries + legenda).
function rkCriadosConcluidos(rows){
  const top=rows.filter(r=>r.criado+r.concl>0).slice().sort((x,y)=>(y.criado+y.concl)-(x.criado+x.concl)).slice(0,10);
  if(!top.length) return '<div class="estado">Sem criações/conclusões no período.</div>';
  const max=Math.max(1,...top.flatMap(r=>[r.criado,r.concl]));
  const leg=`<div class="rk-leg"><span><i style="background:${RK_PAL.azul}"></i>Criados</span><span><i style="background:${RK_PAL.verde}"></i>Concluídos</span></div>`;
  return leg+`<div class="rkgb anima">`+top.map(r=>`
    <div class="rkgb-row">
      <div class="rkgb-nome" data-pessoa="${escA(r.a)}" title="${escA(r.nome)}">${esc(r.nome)}</div>
      <div class="rkgb-bars">
        <div class="rkgb-bar" data-tip="${escA(r.nome)}" data-tip2="${escA(r.criado+' ticket(s) criados')}"><i style="width:${r.criado?Math.max(1.5,r.criado/max*100):0}%;background:${RK_PAL.azul}"></i><b>${r.criado}</b></div>
        <div class="rkgb-bar" data-tip="${escA(r.nome)}" data-tip2="${escA(r.concl+' ticket(s) concluídos (resolução)')}"><i style="width:${r.concl?Math.max(1.5,r.concl/max*100):0}%;background:${RK_PAL.verde}"></i><b>${r.concl}</b></div>
      </div>
    </div>`).join('')+`</div>`;
}

// Barras empilhadas: atualizações por pessoa (segmentos com respiro de 2px; a ordem
// dos segmentos segue a ordem validada da paleta — não reordenar).
function rkAtualizacoes(rows){
  const segs=[['alter','Alterações',RK_PAL.verde],['trans','Transições',RK_PAL.azul],['coment','Comentários',RK_PAL.laranja],['criado','Criações',RK_PAL.roxo]];
  const top=rows.map(r=>({ ...r, __tot:r.alter+r.trans+r.coment+r.criado })).filter(r=>r.__tot>0)
    .sort((x,y)=>y.__tot-x.__tot).slice(0,12);
  if(!top.length) return '<div class="estado">Sem atividade no Jira no período.</div>';
  const max=Math.max(1,...top.map(r=>r.__tot));
  const leg=`<div class="rk-leg">${segs.map(([k,l,c])=>`<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;
  return leg+`<div class="rkst anima">`+top.map(r=>`
    <div class="rkst-row">
      <div class="rkst-nome" data-pessoa="${escA(r.a)}" title="${escA(r.nome)}">${esc(r.nome)}</div>
      <div class="rkst-track">${segs.map(([k,l,c])=>{ const v=r[k]; if(!v) return '';
        return `<i style="width:${(v/max*100).toFixed(2)}%;background:${c}" data-tip="${escA(r.nome+' · '+l)}" data-tip2="${escA(v+' no período')}"></i>`; }).join('')}</div>
      <b class="rkst-v">${r.__tot}</b>
    </div>`).join('')+`</div>`;
}

// Aba "Engajamento & uso do Jira": KPIs + gráficos (foco: quem mais usa a ferramenta).
function renderRankingUso(){
  const cont=document.getElementById('conteudo');
  const eng=calcEngajamento();
  const rows=eng.rows;
  if(!rows.length){
    cont.replaceChildren(el(`<div>${rkAbas('uso')}<div class="estado">Sem dados para os filtros atuais.</div></div>`));
    return;
  }
  const nomes=pessoasUnidas();
  const nomeDe=(a)=>((nomes[a]||{}).nome)||a;
  const tot=(fn)=>rows.reduce((s,r)=>s+fn(r),0);
  const kpis=`<div class="kpis ts-kpis">
    <div class="kpi t"><div class="v">${fmtH(tot(r=>r.seg))}</div><div class="l">Horas apontadas</div></div>
    <div class="kpi t"><div class="v">${tot(r=>r.tkHoras)}</div><div class="l">Tickets com horas</div></div>
    <div class="kpi t"><div class="v">${tot(r=>r.alter+r.trans)}</div><div class="l">Atualizações em tickets</div></div>
    <div class="kpi t"><div class="v">${tot(r=>r.criado)}</div><div class="l">Tickets criados</div></div>
    <div class="kpi ${tot(r=>r.concl)>=tot(r=>r.criado)?'t':'w'}"><div class="v">${tot(r=>r.concl)}</div><div class="l">Tickets concluídos</div></div>
    <div class="kpi t"><div class="v">${tot(r=>r.acoes)}</div><div class="l">Ações no painel</div></div>
  </div>`;
  const serSem=[
    { nome:'Horas apontadas', cor:RK_PAL.azul, vals:eng.semanas.map(s=>({x:s, v:+((eng.semTot[s]||0)/3600).toFixed(1)})) },
    { nome:'Horas faturáveis', cor:RK_PAL.verde, tipo:'line', vals:eng.semanas.map(s=>({x:s, v:+((eng.semFat[s]||0)/3600).toFixed(1)})) },
  ];
  const objTkHoras={}; rows.filter(r=>r.tkHoras>0).forEach(r=>{ objTkHoras[r.a]=r.tkHoras; });
  const objAcoes={}; rows.filter(r=>r.acoes>0).forEach(r=>{ objAcoes[r.a]=r.acoes; });
  const tocadosDe={}; rows.forEach(r=>{ tocadosDe[r.a]=r.tkTocados; });
  cont.replaceChildren(el(`<div>
    ${rkAbas('uso')}
    ${kpis}
    <div class="card full"><h2>🏅 Quem mais usa o Jira <span>score de engajamento — meta de horas, atualizações, colaboração, entregas e uso do painel</span></h2>
      ${rkLeaderboard(rows)}</div>
    <div class="card full"><h2>Horas apontadas por semana <span>equipe · total × faturável</span></h2>
      ${eng.semanas.length?tsChart(serSem,{ fmt:v=>v+'h', yfmt:v=>Math.round(v)+'h', xlabel:s=>fmtBR(s), readX:s=>'semana de '+fmtBR(s) }):'<div class="estado">Sem horas no período.</div>'}</div>
    <div class="card full"><h2>Horas por pessoa por semana <span>mapa de calor — mais escuro = mais horas na semana</span></h2>
      ${rkHeatmap(rows, eng.semanas)}</div>
    <div class="card"><h2>Tickets criados × concluídos <span>por pessoa (autor da criação/resolução)</span></h2>${rkCriadosConcluidos(rows)}</div>
    <div class="card"><h2>Atualizações nos tickets <span>por pessoa — alterações, transições, comentários e criações</span></h2>${rkAtualizacoes(rows)}</div>
    <div class="card"><h2>Tickets com horas apontadas <span>nº de tickets distintos em que a pessoa apontou</span></h2>
      ${Object.keys(objTkHoras).length?barlist(objTkHoras, v=>String(v), cores.cerceta, 12, nomeDe, nomeDe,
        { tip2Fn:(a,v)=>`${v} ticket(s) com horas · ${tocadosDe[a]||0} tocado(s) no Jira` }):'<div class="estado">Sem horas no período.</div>'}</div>
    <div class="card"><h2>Uso da ferramenta <span>ações feitas dentro do painel (auditoria compartilhada, últimas 300)</span></h2>
      ${Object.keys(objAcoes).length?barlist(objAcoes, v=>String(v), cores.roxo, 12, nomeDe, nomeDe):'<div class="estado">Nenhuma ação registrada no período.</div>'}</div>
  </div>`));
}

// ============ 🏆 Ranking no tempo: Esta semana · Este mês · Este ano ============
// A brincadeira das ⭐ estrelinhas: fechou a SEMANA batendo a meta → ganha uma
// estrelinha. O período escolhido soma as estrelinhas das semanas fechadas dele;
// 🔥 é a sequência de semanas seguidas na meta. Dados via /api/tempo (janelas
// prontas com cache no servidor); a visão "Período da tela" mantém o comportamento
// clássico com os filtros do topo.
const RK_FAIXAS={ semana:{jan:'estaSemana',rot:'📅 Esta semana'}, mes:{jan:'esteMes',rot:'🗓 Este mês'},
  ano:{jan:'esteAno',rot:'📆 Este ano'}, tela:{rot:'⚙️ Período da tela'} };
function rkFaixaChips(atual){
  return `<div class="ap-chips rk-faixas">${Object.entries(RK_FAIXAS).map(([k,v])=>
    `<button class="chip" aria-pressed="${atual===k}" data-rk-faixa="${escA(k)}">${v.rot}</button>`).join('')}
    <span class="muted small">as faixas de tempo usam o time inteiro (sem os filtros do topo)</span></div>`;
}
function rkGaranteFaixa(fx){
  const rk=estado.ranking;
  rk.tempoPer=rk.tempoPer||{};
  if(rk.tempoPer[fx]) return true;
  if(rk.carregandoPer!==fx){
    rk.carregandoPer=fx;
    fetch(`/api/tempo?janela=${RK_FAIXAS[fx].jan}`).then(r=>r.json()).then(j=>{
      rk.carregandoPer='';
      rk.tempoPer[fx]=j&&j.worklogs?j:{erro:(j&&j.erro)||'Resposta inesperada.'};
      if(estado.vista==='ranking') renderRanking();
    }).catch(e=>{ rk.carregandoPer='';
      rk.tempoPer[fx]={erro:String(e.message||e)};
      if(estado.vista==='ranking') renderRanking(); });
  }
  return false;
}
// Ranking + estrelinhas a partir de um payload do /api/tempo (qualquer intervalo).
function rkCalcDe(tempo){
  const meta=tempo.meta||{}; const de=meta.startDate||'', ateBr=meta.endDate||'';
  const hoje=hojeSP();
  const fim = (ateBr && ateBr<hoje) ? ateBr : hoje;
  const ocultos=new Set((cfg.ocultos||[]).map(o=>o.a));
  const porA={};
  // Quem NÃO apontou nada também entra (é justamente quem o ranking precisa mostrar):
  // parte das pessoas ativas do Jira, respeitando ocultos e vigência (admissão/desligamento).
  Object.entries(estado.usuarios||{}).forEach(([a,u])=>{
    const nm=(u&&u.nome)||''; if(ocultos.has(a) || RE_EXCLUIR.test(nm)) return;
    const v=vigenciaDe(a); if(v && ((v.fim&&v.fim<de)||(v.ini&&v.ini>ateBr))) return;
    porA[a]={a, nome:nm||a, tot:0, porSem:{}};
  });
  Object.entries(tempo.pessoas||{}).forEach(([a,p])=>{
    if(ocultos.has(a) || RE_EXCLUIR.test((p&&p.nome)||'')) return;
    if(!porA[a]) porA[a]={a, nome:(p&&p.nome)||a, tot:0, porSem:{}};
  });
  (tempo.worklogs||[]).forEach(w=>{ const r=porA[w.a]; if(!r) return;
    const d=(w.d||'').slice(0,10); if(!d||d<de||d>ateBr) return;
    r.tot+=Number(w.s)||0; const s=rkSemanaDe(d); r.porSem[s]=(r.porSem[s]||0)+(Number(w.s)||0); });
  const dias=[]; for(let d=de; d && d<=fim && dias.length<420; d=mtsSoma(d,1)) dias.push(d);
  const semanas=[...new Set(dias.map(rkSemanaDe))].sort();
  const semAtual=rkSemanaDe(hoje);
  // Semana FECHADA: o último dia dela dentro do período já passou.
  const fechadas=semanas.filter(s=>{ const f7=mtsSoma(s,6); const fimS=f7<fim?f7:fim; return fimS<hoje; });
  const linhas=Object.values(porA).map(r=>{
    let esperado=0; const metaSem={}; let metaCorr=0;
    dias.forEach(d=>{
      if(!ehUtil(d)||ehFeriado(d)||ehAusencia(r.a,d)) return;
      const m=metaSegDe(r.a); const s=rkSemanaDe(d);
      metaSem[s]=(metaSem[s]||0)+m;
      if(d!==hoje){ esperado+=m; if(s===semAtual) metaCorr+=m; }
    });
    let estrelas=0, seq=0;
    fechadas.forEach(s=>{
      if(!(metaSem[s]>0)) return;                       // semana sem meta (férias/feriados) não conta nem quebra
      if((r.porSem[s]||0)>=metaSem[s]){ estrelas++; seq++; } else seq=0;
    });
    // ⭐ em rota: na semana corrente a pessoa está na meta dos dias já fechados.
    const emRota = semanas.includes(semAtual) && metaCorr>0 && (r.porSem[semAtual]||0)>=metaCorr;
    const pct = esperado?Math.round(r.tot/esperado*100):null;
    const status = pct==null?'na': pct>=90?'ok': pct>=60?'warn':'bad';
    return { ...r, esperado, pct, status, estrelas, streak:seq, emRota, metaCem:pct!=null&&pct>=100 };
  }).sort((x,y)=>((y.pct==null?-1:y.pct)-(x.pct==null?-1:x.pct)) || (y.tot-x.tot) || x.nome.localeCompare(y.nome,'pt'));
  return { de, ate:fim, hoje, linhas, nSemFech:fechadas.length };
}
const rkStars=(n)=> n<=0?'' : (n<=8 ? '⭐'.repeat(n) : `⭐×${n}`);
// 🌠 Animação de boas-vindas ao ENTRAR no Ranking: uma chuva de estrelinhas cai
// sobre a página (uma vez por visita à tela; sair e voltar anima de novo).
// Respeita prefers-reduced-motion e se remove sozinha ao terminar.
function rkAnimaEntrada(){
  const rk=estado.ranking;
  if(rk._entrou) return false;
  rk._entrou=true;
  try{ if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return false; }catch(e){}
  const glifos=['⭐','✨','⭐','🌟','⭐','✨','⭐','🎉','⭐','🏆','⭐','✨'];
  const n=36;
  const itens=[...Array(n)].map((_,i)=>{
    const g=glifos[i%glifos.length];
    const esq=(i*47+13)%100;                          // espalha sem Math.random (determinístico)
    const dur=(1.3+((i*31)%130)/100).toFixed(2);
    const atraso=(((i*53)%120)/100).toFixed(2);
    const tam=13+((i*29)%18);
    return `<i style="left:${esq}%;font-size:${tam}px;animation-duration:${dur}s;animation-delay:${atraso}s">${g}</i>`;
  }).join('');
  const conf=[...Array(20)].map((_,i)=>{               // fitas de confete nas cores da marca
    const esq=(i*37+7)%100;
    const dur=(1.6+((i*41)%90)/100).toFixed(2);
    const atraso=(((i*67)%110)/100).toFixed(2);
    return `<i class="cf cf${1+(i%4)}" style="left:${esq}%;animation-duration:${dur}s;animation-delay:${atraso}s"></i>`;
  }).join('');
  const ov=el(`<div class="rk-chuva" aria-hidden="true">${itens}${conf}</div>`);
  document.body.appendChild(ov);
  setTimeout(()=>{ try{ ov.remove(); }catch(e){} }, 3600);
  return true;
}
// 🔢 O percentual do pódio conta de 0 até o valor (uma vez por entrada na tela;
// o HTML já traz o valor final, então com menos-movimento nada muda).
function rkContaPct(){
  const rk=estado.ranking||{}; if(rk._contou) return;
  const els=document.querySelectorAll('[data-rk-conta]'); if(!els.length) return;
  rk._contou=true;
  try{ if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; }catch(e){}
  els.forEach((s,ix)=>{
    const alvo=Number(s.getAttribute('data-rk-conta'))||0;
    const dur=900, ini=performance.now()+150+ix*130;
    s.textContent='0%';
    const tick=(t)=>{ const p=Math.min(1,Math.max(0,(t-ini)/dur)); const e=1-Math.pow(1-p,3);
      s.textContent=Math.round(alvo*e)+'%'; if(p<1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
// Pódio dos 3 melhores do período (2º · 1º · 3º), com coroa no campeão.
function rkPodio(linhas){
  const top=linhas.filter(l=>l.tot>0).slice(0,3);
  if(!top.length) return '<div class="estado">Ainda sem horas neste período.</div>';
  const ordem=[top[1],top[0],top[2]].filter(Boolean);
  const medal=['🥇','🥈','🥉'];
  return `<div class="rk-podio">${ordem.map(l=>{ const i=top.indexOf(l);
    return `<div class="rk-pod p${i+1}">
      ${i===0?'<div class="rk-crown" aria-hidden="true">👑</div>':''}
      <div class="rk-pod-medal">${medal[i]}</div>
      <div class="rk-pod-nome" title="${escA(l.nome)}">${esc(l.nome)}</div>
      <div class="rk-pod-pct">${l.pct==null?fmtH(l.tot):`<span data-rk-conta="${l.pct}">${l.pct}%</span>`}${l.metaCem?' <span class="rk-100">💯</span>':''}</div>
      <div class="rk-pod-sub">${fmtH(l.tot)}${l.esperado?` de ${fmtH(l.esperado)}`:' apontadas'}</div>
      <div class="rk-pod-stars">${rkStars(l.estrelas)||(l.emRota?'<span class="rk-rota">⭐ em rota</span>':'&nbsp;')}${l.streak>=2?` <span class="rk-fire" data-tip="${l.streak} semanas seguidas batendo a meta">🔥${l.streak}</span>`:''}</div>
    </div>`; }).join('')}</div>`;
}
// 🌟 Mural de estrelinhas: quem está colecionando (e quem está garantindo a da semana).
function rkMural(linhas, nSemFech){
  const com=linhas.filter(l=>l.estrelas>0 || l.emRota)
    .sort((x,y)=>(y.estrelas-x.estrelas)||(y.streak-x.streak)||((y.pct==null?-1:y.pct)-(x.pct==null?-1:x.pct)));
  if(!com.length) return `<div class="estado">Ninguém coletou estrelinha neste período ainda — feche a semana batendo a meta para ganhar a sua ⭐.</div>`;
  return `<div class="rk-mural">${com.map(l=>`
    <div class="rk-mchip${l.emRota&&!l.estrelas?' rota':''}">
      <span class="rk-mnome">${esc(l.nome)}</span>
      <span class="rk-mstars">${rkStars(l.estrelas)||'—'}</span>
      ${nSemFech?`<span class="muted small">${l.estrelas}/${nSemFech} semana(s)</span>`:''}
      ${l.streak>=2?`<span class="rk-fire" data-tip="${l.streak} semanas seguidas na meta">🔥${l.streak}</span>`:''}
      ${l.emRota?'<span class="rk-rota" data-tip="Está na meta dos dias já fechados desta semana — fechando assim, a estrelinha vem">⭐ em rota</span>':''}
    </div>`).join('')}</div>`;
}
// Variante do "por mês" que aceita worklogs de qualquer fonte (faixa Este ano).
function cardPorMesDe(worklogs){
  const porMes={};
  (worklogs||[]).forEach(w=>{ const ym=(w.d||'').slice(0,7); if(ym) porMes[ym]=(porMes[ym]||0)+(Number(w.s)||0); });
  const meses=Object.keys(porMes).sort();
  if(!meses.length) return '<div class="estado">Sem horas no período.</div>';
  const max=Math.max(1,...meses.map(m=>porMes[m]));
  const rot=(ym)=>{ const [y,mm]=ym.split('-'); return `${MESES_PT[(+mm)-1]}/${y.slice(2)}`; };
  return `<div class="scroll-x"><div class="cols anima">${meses.map(m=>`
    <div class="col" data-tip="${escA(rot(m))}" data-tip2="${escA(fmtH(porMes[m]))}">
      <div class="bwrap"><div class="b" style="height:${(porMes[m]/max*100)}%;background:${cores.roxo}"></div></div><div class="cl">${rot(m)}</div></div>`).join('')}</div></div>`;
}
// Visão por FAIXA DE TEMPO (semana/mês/ano): pódio + mural + lista com estrelas.
function renderRankingFaixa(fx){
  const cont=document.getElementById('conteudo');
  const rk=estado.ranking;
  rkScoreCongela();   // 🏅 fecha a foto dos dias úteis já passados (dia seguinte chegou)
  if(!rkGaranteFaixa(fx)){
    cont.replaceChildren(el(`<div>${rkAbas('apontamento')}${rkFaixaChips(fx)}
      <div class="estado">Carregando os apontamentos de ${esc(RK_FAIXAS[fx].rot.replace(/^\S+\s/,'').toLowerCase())}…</div></div>`));
    return;
  }
  const dados=rk.tempoPer[fx];
  if(dados.erro){
    cont.replaceChildren(el(`<div>${rkAbas('apontamento')}${rkFaixaChips(fx)}
      <div class="erro"><strong>Falha ao carregar o período.</strong> ${esc(dados.erro)}
        <button class="btn" data-rk-refaixa="${escA(fx)}" style="margin-left:8px">Tentar de novo</button></div></div>`));
    return;
  }
  const R=rkCalcDe(dados);
  const comMeta=R.linhas.filter(l=>l.esperado>0);
  const naMeta=comMeta.filter(l=>l.metaCem).length;
  const totEst=R.linhas.reduce((s,l)=>s+l.estrelas,0);
  const melhor=R.linhas.slice().sort((x,y)=>y.streak-x.streak)[0];
  const espTot=R.linhas.reduce((s,l)=>s+l.esperado,0);
  const totTot=R.linhas.reduce((s,l)=>s+l.tot,0);
  const pctGeral=espTot?Math.round(totTot/espTot*100):null;
  const medal=['🥇','🥈','🥉'];
  const rows=R.linhas.map((l,i)=>{
    const w=l.pct==null?0:Math.min(100,l.pct);
    const cheer=l.metaCem, sad=(l.tot||0)===0;
    const fx2=cheer?'<span class="rk-fx rk-stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>'
      :(sad?'<span class="rk-fx rk-rain" aria-hidden="true"><i></i><i></i><i></i><i></i></span>':'');
    return `<div class="rk-row${cheer?' rk-cheer':(sad?' rk-sad':'')}">
      ${fx2}
      <div class="rk-pos">${medal[i]||i+1}</div>
      <div class="rk-main">
        <div class="rk-top"><span class="rk-nome" data-pessoa="${esc(l.a)}" title="${esc(l.nome)}">${esc(l.nome)}</span>
          ${l.metaCem?'<span class="rk-badge ok">💯 Meta atingida</span>':`<span class="rk-badge ${l.status}">${{ok:'Em dia',warn:'Atrasado',bad:'Crítico',na:'—'}[l.status]}</span>`}
          ${sad?'<span class="rk-sadface" aria-hidden="true" title="não apontou no período">😔</span>':''}
          <span class="rk-rowstars">${rkStars(l.estrelas)}${l.streak>=2?` <span class="rk-fire">🔥${l.streak}</span>`:''}${!l.estrelas&&l.emRota?'<span class="rk-rota">⭐ em rota</span>':''}</span></div>
        <div class="rk-bar"><div class="rk-fill ${l.status}" style="width:${w}%"></div></div>
      </div>
      <div class="rk-meta"><div class="rk-pct">${l.pct==null?'—':l.pct+'%'}</div>
        <div class="rk-sub">${fmtH(l.tot)}${l.esperado?` / ${fmtH(l.esperado)}`:' apontadas'}</div></div>
    </div>`;
  }).join('');
  cont.replaceChildren(el(`<div>
    ${rkAbas('apontamento')}
    ${rkFaixaChips(fx)}
    <div class="kpis ts-kpis">
      <div class="kpi t"><div class="v">${pctGeral==null?'—':pctGeral+'%'}</div><div class="l">Apontamento do time</div></div>
      <div class="kpi t"><div class="v">${naMeta}</div><div class="l">💯 Na meta (100%+)</div></div>
      <div class="kpi t"><div class="v">${totEst} ⭐</div><div class="l">Estrelinhas no período</div></div>
      <div class="kpi ${melhor&&melhor.streak>=2?'t':'a'}"><div class="v">${melhor&&melhor.streak>=2?('🔥'+melhor.streak):'—'}</div>
        <div class="l">${melhor&&melhor.streak>=2?('Maior sequência · '+esc(melhor.nome.split(' ')[0])):'Maior sequência'}</div></div>
    </div>
    <div class="card full">
      <h2>🏆 Quem está fazendo a diferença <span>${esc(fmtBR(R.de))} → ${esc(fmtBR(R.ate))} · % da meta até ontem</span></h2>
      ${rkPodio(R.linhas)}
    </div>
    <div class="card full">
      <h2>🌟 Mural de estrelinhas <span>fechou a semana batendo a meta → ganha uma ⭐ · 🔥 = semanas seguidas</span></h2>
      ${rkMural(R.linhas, R.nSemFech)}
      <div class="muted small" style="margin-top:8px">A brincadeira: quem faz um bom trabalho merece uma estrelinha —
        cada <strong>semana fechada com a meta batida</strong> vale <strong>uma ⭐</strong>
        (semanas sem meta, como férias, não contam nem quebram a sequência). ${R.nSemFech?`Este período tem <strong>${R.nSemFech} semana(s) fechada(s)</strong>.`:'A semana atual conta quando fechar.'}</div>
    </div>
    <div class="card full">
      <h2>Ranking · ${esc(RK_FAIXAS[fx].rot.replace(/^\S+\s/,''))} <span>meta ${cfg.metaGlobalH}h/dia (individual em Metas) · descontando feriados e ausências</span></h2>
      <div class="rk-list">${rows||'<div class="estado">Sem pessoas ativas no período.</div>'}</div>
    </div>
    ${rkScoreboardHTML()}
    ${fx==='ano'?`<div class="card full"><h2>Apontamentos por mês <span>horas do time em cada mês do ano</span></h2>${cardPorMesDe(dados.worklogs)}</div>`:''}
  </div>`));
  rkContaPct();
}

// 🏅 SCOREBOARD DIÁRIO — a FOTO da qualidade de apontamento de cada dia útil,
// congelada NO DIA SEGUINTE. Regra do placar: pontos do dia = horas apontadas
// ÷ meta × 100 (máx. 100), medidos quando o dia seguinte chega. Depois de
// congelado, o score do dia NÃO muda mais — apontar atrasado não recupera o
// placar (é exatamente essa disciplina que ele mede). Fica guardado para o
// time todo em cfg.scoreHist (config compartilhada), com retenção de 120 dias.
function rkScoreCongela(){
  try{
    const t=estado.tempo; if(!t||!t.worklogs||!t.meta) return;
    // Frescor: só congela com um payload buscado há POUCO (≤2h) — uma aba parada
    // desde ontem não pode fotografar o dia com dados velhos e faltando horas.
    const ger=Date.parse((t.meta&&t.meta.geradoEm)||'');
    if(!ger||Date.now()-ger>2*3600*1000) return;
    const de=(t.meta.startDate||'').slice(0,10), ate=(t.meta.endDate||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(de)||!/^\d{4}-\d{2}-\d{2}$/.test(ate)) return;
    const hoje=hojeSP();
    // Janela de captura: só dias cujo "dia seguinte" é RECENTE (até 4 dias atrás —
    // cobre fim de semana/feriadão). Dias mais antigos NÃO ganham foto retroativa:
    // congelar tarde deixaria entrar apontamento atrasado, que é o que o placar mede.
    let minDia=voltaDias(hoje,4);
    // 📆 Início do placar (configurável): dias antes do início não são fotografados.
    const iniSc=(cfg.scoreInicio&&/^\d{4}-\d{2}-\d{2}$/.test(cfg.scoreInicio))?cfg.scoreInicio:'';
    if(iniSc&&iniSc>minDia) minDia=iniSc;
    cfg.scoreHist=cfg.scoreHist||{};
    const oc=new Set((cfg.ocultos||[]).map(o=>(o&&o.a)||o));
    const pessoas=Object.keys(pessoasUnidas()).filter(a=>!oc.has(a));
    if(!pessoas.length) return;
    const porDia={};
    t.worklogs.forEach(w=>{ const d2=(w.d||'').slice(0,10);
      const m2=porDia[d2]=porDia[d2]||{}; m2[w.a]=(m2[w.a]||0)+(Number(w.s)||0); });
    let mudou=false;
    for(let d2=(de>minDia?de:minDia); d2<=ate&&d2<hoje; d2=somaDias(d2,1)){
      if(!ehUtil(d2)||ehFeriado(d2)) continue;
      if(cfg.scoreHist[d2]) continue;                // a foto de um dia congelado não muda
      const dia={_q:hoje};
      pessoas.forEach(a=>{ if(ehAusencia(a,d2)) return;
        const m=metaSegDe(a);
        if(!(m>0)) return;                           // meta 0 = pessoa isenta: fora do placar
        const h=(porDia[d2]||{})[a]||0;
        dia[a]={p:Math.min(100,Math.round(h/m*100)), h:Math.round(h/60), m:Math.round(m/60)}; });
      cfg.scoreHist[d2]=dia; mudou=true;
    }
    const ks=Object.keys(cfg.scoreHist).sort();
    while(ks.length>120){ delete cfg.scoreHist[ks.shift()]; mudou=true; }
    if(mudou) salvaCfg();
  }catch(e){}
}
function rkScoreboardHTML(){
  const rk=estado.ranking=estado.ranking||{};
  const gran=['dia','sem','mes'].includes(rk.scGran)?rk.scGran:'dia';
  const iniSc=(cfg.scoreInicio&&/^\d{4}-\d{2}-\d{2}$/.test(cfg.scoreInicio))?cfg.scoreInicio:'';
  const sh=cfg.scoreHist||{};
  const dias=Object.keys(sh).filter(d2=>!iniSc||d2>=iniSc).sort();
  const gestorEu=(typeof souAprovador==='function')&&souAprovador();
  const chips=`<div class="ap-vis" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0 8px">
    ${[['dia','📅 Por dia'],['sem','🗓 Por semana'],['mes','📆 Por mês']].map(([g,r])=>
      `<button class="chip" aria-pressed="${gran===g}" data-sc-gran="${g}">${r}</button>`).join(' ')}
    <span class="rad-sep"></span>
    ${gestorEu?`<label class="muted small" style="display:inline-flex;align-items:center;gap:6px" title="Dias ANTERIORES a esta data ficam fora do placar e não são mais fotografados — use quando o time 'zerar' o jogo e recomeçar a contagem">📆 Início do placar
      <input type="date" id="sc-inicio" value="${escA(iniSc)}"></label>`
      :(iniSc?`<span class="muted small">📆 placar valendo desde ${fmtBR(iniSc)}</span>`:'')}
  </div>`;
  const cab='<h2>🏅 Scoreboard <span>a foto do apontamento de cada dia útil, tirada NO DIA SEGUINTE — apontar atrasado não muda o placar</span></h2>';
  if(!dias.length) return `<div class="card full">${cab}${chips}
    <div class="estado">Ainda sem dias congelados${iniSc?` a partir de ${fmtBR(iniSc)}`:''} — a partir de agora, cada dia útil é fotografado no dia seguinte e fica guardado aqui (o placar começa a valer amanhã).</div></div>`;
  const oc=new Set((cfg.ocultos||[]).map(o=>(o&&o.a)||o));
  const nomes=pessoasUnidas();
  const pess={};
  dias.forEach(d2=>{ Object.keys(sh[d2]).forEach(a=>{ if(a!=='_q'&&!oc.has(a)) pess[a]=1; }); });
  // Colunas por granularidade: dia (últimos 10) · semana (média, últimas 12) · mês (média, últimos 12).
  let cols;
  if(gran==='sem'){
    const g={}; dias.forEach(d2=>{ const w=semChave(d2); (g[w]=g[w]||[]).push(d2); });
    cols=Object.keys(g).sort().slice(-12).map(w=>{ const s2=isoSemana(w);
      return { dias:g[w], rot:`S${s2.num}`, tip:`Semana de ${fmtBR(w)} (S${s2.num}/${s2.ano}) — média dos ${g[w].length} dia(s) fotografado(s)` }; });
  } else if(gran==='mes'){
    const g={}; dias.forEach(d2=>{ const m2=d2.slice(0,7); (g[m2]=g[m2]||[]).push(d2); });
    cols=Object.keys(g).sort().slice(-12).map(m2=>({ dias:g[m2], rot:m2.slice(5,7)+'/'+m2.slice(2,4),
      tip:`Mês ${m2.slice(5,7)}/${m2.slice(0,4)} — média dos ${g[m2].length} dia(s) fotografado(s)` }));
  } else {
    cols=dias.slice(-10).map(d2=>({ dias:[d2], rot:fmtBR(d2),
      tip:'Dia '+fmtBR(d2)+(sh[d2]._q?' — congelado em '+fmtBR(String(sh[d2]._q).slice(0,10)):'') }));
  }
  const cor=(p)=>p>=100?'sc-100':(p>=90?'sc-70':(p>=70?'sc-70':(p>0?'sc-1':'sc-0')));
  // Célula = pontos do dia OU a média dos dias fotografados do período.
  const celDe=(a,c)=>{
    const vs=c.dias.map(d2=>sh[d2][a]).filter(Boolean);
    if(!vs.length) return null;
    const p=Math.round(vs.reduce((s2,v)=>s2+v.p,0)/vs.length);
    return { p, n:vs.length, h:vs.reduce((s2,v)=>s2+v.h,0), m:vs.reduce((s2,v)=>s2+v.m,0) };
  };
  const linhas=Object.keys(pess).map(a=>{
    const cels=cols.map(c=>celDe(a,c));
    const vals=cels.filter(Boolean).map(c=>c.p);
    const med=vals.length?Math.round(vals.reduce((s2,v)=>s2+v,0)/vals.length):null;
    let streak=0;
    for(let i=cels.length-1;i>=0;i--){ const c=cels[i]; if(c==null) continue; if(c.p>=90) streak++; else break; }
    return { a, nome:(nomes[a]&&nomes[a].nome)||a, cels, med, streak };
  }).filter(l=>l.med!=null).sort((x,y)=>y.med-x.med||y.streak-x.streak);
  const rotSeq=gran==='dia'?'dias':(gran==='sem'?'semanas':'meses');
  const rows=linhas.map((l,i)=>`<tr>
    <td>${i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':''}${esc(l.nome)}</td>
    ${l.cels.map((c,j)=>`<td>${c==null
      ?'<span class="sc-cell sc-na" data-tip="Ausência, feriado, meta isenta ou período sem foto">—</span>'
      :`<span class="sc-cell ${cor(c.p)}" data-tip="${escA(cols[j].rot+' · '+c.p+' ponto(s)'+(c.n>1?' (média de '+c.n+' dias)':'')+' · '+(Math.round(c.h/6)/10)+'h apontadas de '+(Math.round(c.m/6)/10)+'h de meta')}">${c.p}</span>`}</td>`).join('')}
    <td><b>${l.med}</b></td>
    <td>${l.streak>=3?'🔥 ':''}${l.streak}</td></tr>`).join('');
  return `<div class="card full">${cab}${chips}
    <div class="scroll-x"><table class="mp-tab-mini sc-tab"><thead><tr><th>Pessoa</th>
      ${cols.map(c=>`<th data-tip="${escA(c.tip)}">${esc(c.rot)}</th>`).join('')}
      <th data-tip="Média dos pontos nas colunas mostradas">Média</th>
      <th data-tip="${escA(rotSeq.charAt(0).toUpperCase()+rotSeq.slice(1)+' SEGUIDOS com 90+ pontos, contando do mais recente')}">Sequência</th></tr></thead>
    <tbody>${rows||'<tr><td class="mp-dim" colspan="99">Sem pessoas no placar ainda.</td></tr>'}</tbody></table></div>
    ${ctExpl('cada célula é o <b>score</b>: horas apontadas ÷ meta × 100 (máximo 100), fotografado quando o painel abre <b>no dia seguinte</b> (janela de até 4 dias — depois disso o dia fica sem foto, nunca retroativa). Nas visões <b>por semana</b> e <b>por mês</b>, a célula é a MÉDIA dos dias fotografados do período. Verde 100 = meta batida em dia · amarelo 70–99 · laranja 1–69 · <b>vermelho 0 = nada apontado até a foto</b>. "—" = ausência, feriado, meta isenta ou sem foto. A <b>Sequência</b> conta '+rotSeq+' seguidos com 90+ — mantenha o 🔥 aceso! O 📆 <b>início do placar</b> (gestores) recomeça a contagem: dias anteriores saem do jogo.')}</div>`;
}
function renderRanking(){
  const cont=document.getElementById('conteudo');
  rkAnimaEntrada();   // 🌠 a festa começa já na entrada, mesmo com os dados ainda carregando
  if(((estado.ranking&&estado.ranking.aba)||'apontamento')==='uso') return renderRankingUso();
  const rk=estado.ranking=estado.ranking||{};
  rk.faixa=rk.faixa||'semana';
  if(rk.faixa!=='tela') return renderRankingFaixa(rk.faixa);
  const { meta, dias, hoje, linhas } = calcRanking();
  rkScoreCongela();   // 🏅 fecha a foto dos dias úteis já passados (dia seguinte chegou)
  if(!linhas.length){
    cont.replaceChildren(el(`<div>${rkAbas('apontamento')}${rkFaixaChips('tela')}${cardNaoApontou()}<div class="estado">Sem dados para os filtros atuais.</div></div>`));
    return;
  }

  const faltaTot=linhas.reduce((s,l)=>s+l.lacuna,0);
  const espTot=linhas.reduce((s,l)=>s+l.esperadoP,0);
  const emDia=linhas.filter(l=>l.status==='ok').length;
  const atras=linhas.filter(l=>l.status==='warn'||l.status==='bad').length;
  const pctGeral=espTot?Math.round((espTot-faltaTot)/espTot*100):null;
  const diasUteis=dias.filter(d=>ehUtil(d) && !ehFeriado(d) && d!==hoje);

  const rotulo={ok:'Em dia',warn:'Atrasado',bad:'Crítico',na:'—'};
  const rows=linhas.map((l,i)=>{
    const w=l.pctv==null?0:Math.min(100,l.pctv);
    const sub=l.pctv==null ? `${fmtH(l.tot)} apontadas`
      : `${fmtH(l.cumprido)} / ${fmtH(l.esperadoP)} · ${l.lacuna>0?('faltam '+fmtH(l.lacuna)):'em dia'}`;
    // Quem está em dia ganha um destaque comemorativo (estrelas); quem não apontou
    // nada no período ganha um efeito de decepção (chuvinha + cinza).
    const cheer = l.status==='ok';
    const sad = (l.tot||0)===0;
    const cls = cheer?' rk-cheer':(sad?' rk-sad':'');
    const fx = cheer
      ? '<span class="rk-fx rk-stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>'
      : (sad ? '<span class="rk-fx rk-rain" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' : '');
    return `<div class="rk-row${cls}">
      ${fx}
      <div class="rk-pos">${i+1}${cheer?'<span class="rk-medal" aria-hidden="true">★</span>':''}</div>
      <div class="rk-main">
        <div class="rk-top"><span class="rk-nome" data-pessoa="${esc(l.a)}" title="${esc(l.nome)}">${esc(l.nome)}</span>
          <span class="rk-badge ${l.status}">${rotulo[l.status]}</span>${sad?'<span class="rk-sadface" aria-hidden="true" title="não apontou no período">😔</span>':''}</div>
        <div class="rk-bar"><div class="rk-fill ${l.status}" style="width:${w}%"></div></div>
      </div>
      <div class="rk-meta"><div class="rk-pct">${l.pctv==null?'—':l.pctv+'%'}</div>
        <div class="rk-sub">${sub}</div></div>
    </div>`;
  }).join('');

  const aviso = espTot ? '' :
    '<div class="estado" style="padding:14px">Este período ainda não tem dias úteis fechados (a meta só conta dias seg–sex já passados). Mostrando apenas as horas apontadas.</div>';

  cont.replaceChildren(el(`<div>
    ${rkAbas('apontamento')}
    ${rkFaixaChips('tela')}
    ${cardNaoApontou()}
    <div class="kpis ts-kpis">
      <div class="kpi t"><div class="v">${pctGeral==null?'—':pctGeral+'%'}</div><div class="l">Apontamento geral</div></div>
      <div class="kpi w"><div class="v">${fmtH(faltaTot)}</div><div class="l">Horas faltando</div></div>
      <div class="kpi t"><div class="v">${emDia}</div><div class="l">Pessoas em dia</div></div>
      <div class="kpi w"><div class="v">${atras}</div><div class="l">Pessoas atrasadas</div></div>
    </div>
    <div class="card full">
      <h2>Ranking de apontamento
        <span>${esc(meta.startDate||'')} → ${esc(meta.endDate||'')} · ${diasUteis.length} dias úteis · meta ${cfg.metaGlobalH}h/dia (ajustável)</span></h2>
      <div class="ts-legend">
        <span><i class="sw ok"></i>Em dia (≥ 90%)</span>
        <span><i class="sw parcial"></i>Atrasado (60–89%)</span>
        <span><i class="sw vazio"></i>Crítico (&lt; 60%)</span>
      </div>
      ${aviso}
      <div class="rk-list">${rows}</div>
    </div>
    ${rkScoreboardHTML()}
    <div class="card full"><h2>Apontamentos por mês <span>horas lançadas em cada mês</span></h2>${cardPorMes()}</div>
    <div class="card full"><h2>Lacunas por dia da semana <span>onde mais falta apontar</span></h2>${cardHeatSemana()}</div>
  </div>`));
  rkContaPct();
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
// ---- 🏦 Controladoria: período, categoria, blocos por categoria e drill ----
// 🏅 Scoreboard — data de início do placar (gestores; vale para o time)
document.getElementById('conteudo').addEventListener('change',(e)=>{
  const t=e.target; if(!t||t.id!=='sc-inicio') return;
  cfg.scoreInicio=/^\d{4}-\d{2}-\d{2}$/.test(t.value||'')?t.value:'';
  salvaCfg();
  toast(cfg.scoreInicio?`📆 Placar valendo a partir de ${fmtBR(cfg.scoreInicio)} — dias anteriores saem do jogo.`
    :'📆 Início do placar removido — todo o histórico guardado volta a contar.','ok');
  renderRanking();
});
