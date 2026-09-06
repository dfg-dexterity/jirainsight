// Jira Insights · 10 · 🔎 TIMESHEET — drill-down por dia, heatmap semanal, horas por mês.
// Idade dos dados: quanto tempo faz desde a importação real (meta.geradoEm do servidor).
function idadeTxt(iso){ const t=Date.parse(iso||''); if(!Number.isFinite(t)) return '';
  const s=Math.max(0, Math.round((Date.now()-t)/1000));
  if(s<60) return 'agora mesmo';
  const m=Math.round(s/60); if(m<60) return `há ${m} min`;
  const h=Math.floor(m/60), mm=m%60; if(h<24) return `há ${h}h${mm?String(mm).padStart(2,'0'):''}`;
  const d=Math.floor(h/24); return `há ${d} dia${d>1?'s':''}`; }
// Faixa "quando os dados foram importados" + botão de forçar atualização (bypass dos
// caches do navegador e do servidor). meta.geradoEm é gravado pelo /api/tempo no momento
// em que ele de fato leu o Clockwork/Jira — respostas de cache preservam o valor original.
function tsFonteHtml(){
  const g=(estado.tempo&&estado.tempo.meta&&estado.tempo.meta.geradoEm)||'';
  const t=Date.parse(g); const ok=Number.isFinite(t);
  const velho=ok && (Date.now()-t)>30*60*1000;
  const quando=ok?new Date(t).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
  return `<div class="ts-fonte${velho?' velha':''}" data-tip="Os dados passam por um cache de servidor (~20 min). Este é o horário em que a importação do Clockwork/Jira realmente aconteceu — não o horário em que a tela abriu.">
    <span class="ts-fonte-ic">${velho?'⚠️':'🕒'}</span>
    <span>Dados importados do <strong>Clockwork/Jira</strong> em <strong>${esc(quando)}</strong>${ok?` · <strong>${esc(idadeTxt(g))}</strong>`:''}${velho?' — podem estar defasados':''}</span>
    <span class="spacer"></span>
    <button class="btn${velho?' primario':''}" id="ts-forcar">⟳ Forçar atualização</button>
  </div>`;
}
function renderTimesheet(){
  const cont=document.getElementById('conteudo');
  const { meta, dias, hoje, linhas } = calcTimesheet();
  if(!linhas.length || !dias.length){
    cont.replaceChildren(el(`<div>${tsFonteHtml()}${cardNaoApontou()}<div class="estado">Sem dados para os filtros atuais.</div></div>`));
    return;
  }

  const horasTot=linhas.reduce((s,l)=>s+l.tot,0);
  const lacunaTot=linhas.reduce((s,l)=>s+l.lacuna,0);
  const vaziosTot=linhas.reduce((s,l)=>s+l.vazios,0);

  const semana=['dom','seg','ter','qua','qui','sex','sáb'];
  const thDias=dias.map(d=>{
    const w=diaSemana(d), fds=(w===0||w===6), fer=(!fds&&ehFeriado(d));
    const tit=fer?`${d} · ${nomeFeriado(d)}`:d;
    return `<th class="ts-d${fds?' fds':''}${fer?' fer':''}${d===hoje?' hoje':''}" title="${esc(tit)}">
      <span class="dnum">${d.slice(8,10)}</span><span class="dsem">${semana[w]}</span></th>`;
  }).join('');

  const corpo=linhas.map(l=>{
    const cells=dias.map(d=>{
      const s=l.porDia[d]||0, w=diaSemana(d), fds=(w===0||w===6), m=metaSegDe(l.a), fer=(!fds&&ehFeriado(d));
      let cls='ts-c', txt='';
      if(ehAusencia(l.a,d)){ cls+=' aus'; txt=s>0?fmtH(s):'aus'; }
      else if(fds){ cls+=' fds'; txt=s>0?fmtH(s):'·'; }
      else if(fer){ cls+=' fer'; txt=s>0?fmtH(s):'fer'; }
      else if(d===hoje){ cls+=' hoje'; txt=s>0?fmtH(s):'hoje'; }
      else if(s<=0){ cls+=' vazio'; txt='—'; }
      else if(s<m){ cls+=' parcial'; txt=fmtH(s); }
      else { cls+=' ok'; txt=fmtH(s); }
      const tFer=fer?` · ${nomeFeriado(d)}`:'';
      const clic = s>0 ? ' ts-click' : '';
      const dca = s>0 ? ` data-ts-cell="${escA(l.a)}|${d}"` : '';
      return `<td class="${cls}${clic}"${dca} title="${esc(l.nome)} · ${esc(d)}${esc(tFer)} · ${s>0?fmtH(s)+' — clique p/ ver por projeto':'sem apontamento'}">${txt}</td>`;
    }).join('');
    const alerta=l.lacuna>0?'tem-lacuna':'';
    return `<tr>
      <th class="ts-nome" data-pessoa="${esc(l.a)}" title="${esc(l.nome)}">${esc(l.nome)}</th>
      <td class="num${l.tot>0?' ts-click':''}"${l.tot>0?` data-ts-cell="${escA(l.a)}|"`:''} title="${l.tot>0?'Horas por projeto no período — clique':''}">${fmtH(l.tot)}</td>
      <td class="num ts-lac ${alerta}">${l.lacuna>0?('−'+fmtH(l.lacuna)):'ok'}</td>
      ${cells}</tr>`;
  }).join('');

  cont.replaceChildren(el(`<div>
    ${tsFonteHtml()}
    ${cardNaoApontou()}
    <div class="kpis ts-kpis">
      <div class="kpi t"><div class="v">${fmtH(horasTot)}</div><div class="l">Horas apontadas</div></div>
      <div class="kpi w"><div class="v">${fmtH(lacunaTot)}</div><div class="l">Horas não preenchidas</div></div>
      <div class="kpi w"><div class="v">${vaziosTot}</div><div class="l">Dias úteis sem apontamento</div></div>
      <div class="kpi a"><div class="v">${linhas.length}</div><div class="l">Pessoas</div></div>
    </div>
    <div class="card full">
      <h2>Timesheet · horários não preenchidos
        <span>${esc(meta.startDate||'')} → ${esc(meta.endDate||'')} · meta ${cfg.metaGlobalH}h seg–sex (ajustável em Metas)</span></h2>
      <div class="ts-legend">
        <span><i class="sw ok"></i>≥ meta</span>
        <span><i class="sw parcial"></i>parcial</span>
        <span><i class="sw vazio"></i>não preenchido</span>
        <span><i class="sw fds"></i>fim de semana</span>
        <span><i class="sw fer"></i>feriado</span>
        <span><i class="sw aus"></i>ausência</span>
        <span><i class="sw hoje"></i>hoje</span>
      </div>
      <div class="muted small" style="margin:2px 0 8px">Clique no <strong>total de horas de um dia</strong> (ou na coluna <strong>Total</strong>) para abrir as horas <strong>por projeto</strong> e, dentro de cada projeto, os <strong>chamados</strong> que somam essas horas (↗ abre no Jira).</div>
      <div class="ts-wrap">
        <table class="ts">
          <thead><tr>
            <th class="ts-nome">Pessoa</th>
            <th class="num">Total</th>
            <th class="num">Lacuna</th>
            ${thDias}
          </tr></thead>
          <tbody>${corpo}</tbody>
        </table>
      </div>
    </div>
  </div>`));
}

// Drill-down do Timesheet: clique no total de horas de uma pessoa num dia (ou no Total do
// período) → horas por projeto → chamados que somam essas horas (link para o Jira).
// `dia` vazio = período inteiro. Respeita os filtros atuais (mas conta TODAS as horas).
function drillTimesheet(a, dia){
  if(!a || !estado.tempo) return;
  const f=filtros(); const ft=Object.assign({}, f, {ocultar:false});
  const projs=projetosUnidos(); const pessoasNome=pessoasUnidas(); const resumos=resumosUnidos();
  const meta=estado.tempo.meta||{};
  const porProj={};   // pkey -> { seg, tickets:{ k -> seg } }
  let tot=0;
  (estado.tempo.worklogs||[]).forEach(w=>{
    if(w.a!==a) return;
    if(!passa(w.p,w.t,projs,ft)) return;
    const d=(w.d||'').slice(0,10); if(!d) return;
    if(dia && d!==dia) return;
    const s=Number(w.s)||0; if(!s) return;
    const o=porProj[w.p]||(porProj[w.p]={seg:0,tickets:{}});
    o.seg+=s; const k=w.k||'(sem chave)'; o.tickets[k]=(o.tickets[k]||0)+s;
    tot+=s;
  });
  const nome=(pessoasNome[a]&&pessoasNome[a].nome)||a;
  const quando = dia ? fmtBR(dia) : `${fmtBR(meta.startDate||'')} – ${fmtBR(meta.endDate||'')}`;
  const projsOrd=Object.entries(porProj).sort((x,y)=>y[1].seg-x[1].seg);
  const corpo = projsOrd.length ? projsOrd.map(([pk,o])=>{
    const pnome=(projs[pk]&&projs[pk].nome)||'';
    const pct=tot?Math.round(o.seg/tot*100):0;
    const tks=Object.entries(o.tickets).sort((x,y)=>y[1]-x[1]);
    const linhas=tks.map(([k,seg])=>{
      const temK=k && k!=='(sem chave)';
      const alvo=temK?`<a href="${jiraBase()}/browse/${encodeURIComponent(k)}" target="_blank" rel="noopener">${esc(k)} ↗</a>`:'<span class="muted">(sem chave)</span>';
      return `<div class="ts-dch"><span class="ts-dch-k">${alvo}</span><span class="ts-dch-r">${esc(resumos[k]||'')}</span><span class="ts-dch-h">${fmtH(seg)}</span></div>`;
    }).join('');
    return `<details class="ts-dproj">
      <summary><span class="ts-dp-k">${esc(pk)}</span><span class="ts-dp-n">${esc(pnome)}</span>
        <span class="ts-dp-h">${fmtH(o.seg)} · ${pct}%</span></summary>
      <div class="ts-dchs">${linhas||'<div class="muted small">Sem chamados.</div>'}</div>
    </details>`;
  }).join('') : '<div class="estado">Sem apontamentos para este recorte.</div>';
  abreModal(`<h2>${esc(nome)} <span class="muted" style="font-weight:400;font-size:14px">· ${esc(quando)} · ${fmtH(tot)}</span></h2>
    <div class="muted small" style="margin:2px 0 10px">Horas por projeto${dia?' no dia':' no período'} — clique num projeto para ver os chamados (↗ abre no Jira).</div>
    <div class="ts-drill">${corpo}</div>`);
}

// Ranking: parte da calcTimesheet e calcula esperado/percentual por pessoa.
function calcRanking(){
  const { meta, dias, hoje, linhas:base } = calcTimesheet();
  const linhas = base.map(l=>{
    const esperadoP = l.esperado;                 // já considera meta individual e ausências
    const cumprido = Math.max(0, esperadoP - l.lacuna);
    const pctv = esperadoP ? Math.round(cumprido/esperadoP*100) : null;
    let status = 'na';
    if(pctv!=null) status = pctv>=90 ? 'ok' : pctv>=60 ? 'warn' : 'bad';
    return { ...l, esperadoP, cumprido, pctv, status };
  }).sort((x,y)=> (y.lacuna-x.lacuna) || (y.tot-x.tot) || x.nome.localeCompare(y.nome,'pt'));
  return { meta, dias, hoje, linhas };
}

// Heatmap: % de dias-pessoa sem apontamento por dia da semana (seg–sex).
function cardHeatSemana(){
  const { dias, hoje, linhas } = calcTimesheet();
  const nomes=['seg','ter','qua','qui','sex'];
  const agg={1:{e:0,c:0},2:{e:0,c:0},3:{e:0,c:0},4:{e:0,c:0},5:{e:0,c:0}};
  dias.forEach(d=>{
    const wd=diaSemana(d); if(wd<1||wd>5||d===hoje||ehFeriado(d)) return;
    linhas.forEach(l=>{ if(ehAusencia(l.a,d)) return; agg[wd].c++; if(!(l.porDia[d]>0)) agg[wd].e++; });
  });
  const temDados=[1,2,3,4,5].some(wd=>agg[wd].c>0);
  if(!temDados) return '<div class="estado">Sem dias úteis fechados no período.</div>';
  const cells=[1,2,3,4,5].map(wd=>{
    const a=agg[wd], rate=a.c?a.e/a.c:0, p=Math.round(rate*100);
    const bg=`rgba(239,68,68,${(0.10+rate*0.62).toFixed(2)})`;
    return `<div class="hm-cell" style="background:${bg}" data-tip="${escA(nomes[wd-1])}" data-tip2="${escA(`${p}% sem apontamento (${a.e}/${a.c})`)}">
      <div class="hm-wd">${nomes[wd-1]}</div><div class="hm-v">${p}%</div></div>`;
  }).join('');
  return `<div class="hm-row">${cells}</div>
    <div class="muted small" style="margin-top:8px">% de dias-pessoa sem apontamento por dia da semana — mais escuro = mais lacunas.</div>`;
}

// Apontamentos (horas) agregados por mês — Janeiro, Fevereiro… Fica útil em janelas
// largas (escolha "Este ano" no período para ver o ano todo). Respeita os filtros.
const MESES_PT=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function cardPorMes(){
  const f=filtros(); const projs=projetosUnidos();
  const porMes={};
  (estado.tempo.worklogs||[]).forEach(w=>{
    if(!passa(w.p,w.t,projs,f)) return;
    if(f.pessoa && w.a!==f.pessoa) return;
    const ym=(w.d||'').slice(0,7); if(ym) porMes[ym]=(porMes[ym]||0)+w.s;
  });
  const meses=Object.keys(porMes).sort();
  if(!meses.length) return '<div class="estado">Sem horas no período.</div>';
  const max=Math.max(1,...meses.map(m=>porMes[m]));
  const rot=(ym)=>{ const [y,mm]=ym.split('-'); return `${MESES_PT[(+mm)-1]}/${y.slice(2)}`; };
  const totalH=fmtH(meses.reduce((s,m)=>s+porMes[m],0));
  const dica = meses.length<2 ? '<div class="muted small" style="margin-top:8px">Dica: escolha <strong>Este ano</strong> no período para ver mês a mês.</div>' : '';
  return `<div class="scroll-x"><div class="cols anima">${meses.map(m=>`
    <div class="col" data-drill="mes" data-key="${escA(m)}" data-tip="${escA(rot(m))}" data-tip2="${escA(fmtH(porMes[m]))}" data-tipk="clique para detalhar o mês">
      <div class="bwrap"><div class="b" style="height:${max?(porMes[m]/max*100):0}%;background:${cores.roxo}"></div></div><div class="cl">${rot(m)}</div></div>`).join('')}</div></div>
    <div class="muted small" style="margin-top:8px">Total no período: <strong>${totalH}</strong>.</div>${dica}`;
}

