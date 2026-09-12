// Jira Insights · 27 · ⬇️ EXPORTAÇÃO — CSV da tela atual, timesheet e PDF (impressão), apuração AMS em PDF.

// ---- Exportar CSV (da visão atual) ----
function baixaCSV(nome, linhas){
  const csv=linhas.map(r=>r.map(c=>{
    const s=String(c==null?'':c);
    return /[";\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
  }).join(';')).join('\r\n');
  const blob=new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=nome; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}
// Worklogs do período RESPEITANDO os filtros globais (pessoa/categoria/projeto/tipo).
function tsWorklogsFiltrados(){
  const f=filtros(); const ft=Object.assign({}, f, {ocultar:false});
  const projs=projetosUnidos();
  return ((estado.tempo&&estado.tempo.worklogs)||[]).filter(w=>{
    if(!passa(w.p,w.t,projs,ft)) return false;
    if(f.pessoa && w.a!==f.pessoa) return false;
    return !!(w.d||'').slice(0,10);
  });
}
// Modal de exportação do timesheet: escolha COMO agrupar (matriz, detalhado,
// pessoa, projeto, ticket, tipo, projeto × pessoa) — sempre no recorte atual.
function abreExportTimesheet(){
  if(!estado.tempo){ toast('Aguarde os dados do período carregarem.','warn'); return; }
  const n=tsWorklogsFiltrados().length;
  abreModal(`
    <h2>Exportar timesheet</h2>
    <div class="muted small">Exporta as horas do <strong>período selecionado</strong>, respeitando os
      filtros ativos (pessoa/categoria/projeto/tipo) — <strong>${n}</strong> apontamento(s) no recorte.</div>
    <div class="campo" style="margin-top:12px;max-width:380px"><label>Agrupar por</label>
      <select id="ts-exp-modo">
        <option value="matriz">Pessoa × Dia (a matriz da tela)</option>
        <option value="detalhado">Detalhado — Dia · Pessoa · Projeto · Ticket</option>
        <option value="pessoa">Pessoa (totais)</option>
        <option value="projeto">Projeto (totais)</option>
        <option value="ticket">Ticket / issue (totais)</option>
        <option value="tipo">Tipo de issue (totais)</option>
        <option value="projpessoa">Projeto × Pessoa</option>
      </select></div>
    <div style="display:flex;gap:10px;margin-top:14px">
      <button class="btn" id="ts-exp-cancel">Cancelar</button>
      <button class="btn primario" id="ts-exp-ok">⬇ Exportar CSV</button>
    </div>`);
}
function exportaTimesheet(modo){
  const meta=(estado.tempo&&estado.tempo.meta)||{}; const per=`${meta.startDate||''}_${meta.endDate||''}`;
  if(modo==='matriz'){
    const { dias, linhas } = calcTimesheet();
    const head=['Pessoa','Total (h)','Lacuna (h)', ...dias];
    const rows=linhas.map(l=>[l.nome, dec(l.tot), dec(l.lacuna), ...dias.map(d=>dec(l.porDia[d]||0))]);
    baixaCSV(`timesheet_${per}.csv`, [head, ...rows]);
    return;
  }
  const wls=tsWorklogsFiltrados();
  const pess=pessoasUnidas(); const nm=(a)=>(pess[a]&&pess[a].nome)||a;
  const projs=(estado.tempo&&estado.tempo.projetos)||{};
  const resumos=(estado.tempo&&estado.tempo.resumos)||{};
  // nome do projeto: helper global projNome()
  if(modo==='detalhado'){
    // Uma linha por dia + pessoa + ticket (agrega múltiplos worklogs do mesmo dia).
    const map={};
    wls.forEach(w=>{ const d=(w.d||'').slice(0,10); const ch=`${d}|${w.a}|${w.k||''}`;
      const r=map[ch]=map[ch]||{d,a:w.a,k:w.k||'',p:w.p||'',t:w.t||'',f:0,s:0};
      r.s+=Number(w.s)||0; if(w.f) r.f=1; });
    const rows=Object.values(map).sort((x,y)=>x.d.localeCompare(y.d)||nm(x.a).localeCompare(nm(y.a),'pt')||x.k.localeCompare(y.k));
    baixaCSV(`timesheet_detalhado_${per}.csv`, [
      ['Dia','Pessoa','Projeto','Ticket','Resumo','Tipo','Faturável','Horas'],
      ...rows.map(r=>[r.d, nm(r.a), projNome(r.p), r.k, resumos[r.k]||'', r.t, r.f?'sim':'não', dec(r.s)])]);
    return;
  }
  const chave={ pessoa:(w)=>w.a, projeto:(w)=>w.p||'—', ticket:(w)=>w.k||'—', tipo:(w)=>w.t||'—',
    projpessoa:(w)=>`${w.p||'—'}|${w.a}` }[modo] || ((w)=>w.a);
  const g={}; let tot=0;
  wls.forEach(w=>{ const k=chave(w); const r=g[k]=g[k]||{s:0,fat:0,p:w.p||'',pess:new Set(),tick:new Set()};
    const s=Number(w.s)||0; r.s+=s; if(w.f) r.fat+=s; r.pess.add(w.a); if(w.k) r.tick.add(w.k); tot+=s; });
  const ord=Object.entries(g).sort((x,y)=>y[1].s-x[1].s);
  const pc=(s)=> tot?Math.round(s/tot*100)+'%':'';
  let head, rows, nomeArq;
  if(modo==='pessoa'){ nomeArq='pessoa';
    head=['Pessoa','Horas','Faturável (h)','% faturável','% do total','Tickets'];
    rows=ord.map(([k,r])=>[nm(k), dec(r.s), dec(r.fat), r.s?Math.round(r.fat/r.s*100)+'%':'', pc(r.s), r.tick.size]);
  } else if(modo==='projeto'){ nomeArq='projeto';
    head=['Projeto','Horas','% do total','Faturável (h)','Pessoas','Tickets'];
    rows=ord.map(([k,r])=>[projNome(k), dec(r.s), pc(r.s), dec(r.fat), r.pess.size, r.tick.size]);
  } else if(modo==='ticket'){ nomeArq='ticket';
    head=['Ticket','Resumo','Projeto','Horas','% do total','Pessoas','Link'];
    rows=ord.map(([k,r])=>[k, resumos[k]||'', projNome(r.p), dec(r.s), pc(r.s), [...r.pess].map(nm).join(', '),
      k!=='—'?`${jiraBase()}/browse/${k}`:'']);
  } else if(modo==='tipo'){ nomeArq='tipo';
    head=['Tipo de issue','Horas','% do total','Tickets','Pessoas'];
    rows=ord.map(([k,r])=>[k, dec(r.s), pc(r.s), r.tick.size, r.pess.size]);
  } else { nomeArq='projeto_pessoa';
    head=['Projeto','Pessoa','Horas','% do total','Tickets'];
    rows=ord.map(([k,r])=>{ const i=k.indexOf('|'); return [projNome(k.slice(0,i)), nm(k.slice(i+1)), dec(r.s), pc(r.s), r.tick.size]; });
  }
  baixaCSV(`timesheet_${nomeArq}_${per}.csv`, [head, ...rows]);
}
function exportaCSV(){
  if(estado.vista==='metricas'){ rmExportaCSV(); return; }   // 📈 Métricas por tipo: período próprio (não depende do topo)
  if(estado.vista==='cronograma'){ crExportaCSV(); return; }   // 📅 Cronograma: ficha do projeto
  if(!estado.tempo){ return; }
  const meta=estado.tempo.meta||{}; const per=`${meta.startDate||''}_${meta.endDate||''}`;
  if(estado.vista==='timesheet'){
    abreExportTimesheet();     // opções: matriz, detalhado, pessoa, projeto, ticket, tipo…
  } else if(estado.vista==='ranking'){
    const { linhas } = calcRanking();
    const rot={ok:'Em dia',warn:'Atrasado',bad:'Crítico',na:'-'};
    const head=['#','Pessoa','Apontado (h)','Esperado (h)','Lacuna (h)','%','Status'];
    const rows=linhas.map((l,i)=>[i+1, l.nome, dec(l.tot), dec(l.esperadoP), dec(l.lacuna),
      l.pctv==null?'':l.pctv, rot[l.status]]);
    baixaCSV(`ranking_${per}.csv`, [head, ...rows]);
  } else if(estado.vista==='tickets'){
    const group=estado.tkGroup||'';
    if(group){
      const { rows } = calcTicketsAgrupado(group);
      const rotG={projeto:'Projeto',tipo:'Tipo',categoria:'Categoria',pessoa:'Pessoa'}[group]||'Grupo';
      const head=[rotG,'Tickets','Horas','Atividades','Transições','Comentários','Criados'];
      const linhasCsv=rows.map(r=>[ (group==='projeto'?( (estado.tempo&&estado.tempo.projetos&&estado.tempo.projetos[r.chave]&&estado.tempo.projetos[r.chave].nome)?`${r.chave} — ${estado.tempo.projetos[r.chave].nome}`:r.chave) : (r.nome||r.chave)),
        r.tickets, dec(r.seg), r.total, r.trans, r.coment, r.criado]);
      baixaCSV(`tickets_${group}_${per}.csv`, [head, ...linhasCsv]);
    } else {
      const { linhas } = calcTickets();
      const head=['Ticket','Resumo','Link','Projeto','Tipo','Horas','Pessoas','Alterações','Transições','Comentários','Criado','Última atividade'];
      const rows=linhas.map(l=>[l.k, l.nome||'', `${jiraBase()}/browse/${l.k}`, l.p, l.t, dec(l.seg),
        Object.values(l.autores).join(', '), l.alter, l.trans, l.coment, l.criado, l.ultima]);
      baixaCSV(`tickets_${per}.csv`, [head, ...rows]);
    }
  } else if(estado.vista==='apontar'){
    const ap=estado.apontar; const dados=ap.porData[chaveVenc()];
    if(!dados) return;
    const head=['Ticket','Resumo','Projeto','Tipo','Status','Vencimento','Responsável','Horas apontadas (h)'];
    const rows=(dados.tickets||[]).map(t=>[t.k, t.resumo, t.p, t.t, t.status, t.venc, t.resp, dec(t.seg||0)]);
    baixaCSV(`vencimentos_${ap.ate}.csv`, [head, ...rows]);
  } else {
    const d=agrega();
    const head=['Pessoa','Horas','Faturável %','Tickets','Alterações','Transições','Comentários'];
    const rows=d.pessoas.map(p=>[p.nome, dec(p.seg), p.seg?pct(p.segFat,p.seg):0, p.tickets, p.alter, p.trans, p.coment]);
    baixaCSV(`resumo_${per}.csv`, [head, ...rows]);
  }
}
// Exportar a tela atual em PDF (via impressão do navegador → "Salvar como PDF").
function exportarPDF(){
  const titulos={visao:'Visão Geral — Relatório executivo',resumo:'Resumo de uso',timesheet:'Timesheet',
    ranking:'Ranking de apontamento',tickets:'Tickets',apontar:'Apontar horas',planejar:'Planejar',
    reclassificar:'Reuniões — gestão e reclassificação',reuvinc:'Reuniões — vincular a tickets de AMS',gestao:'Gestão de Tickets',acoes:'Ações de hoje',alertas:'Central de Alertas',receita:'Receita & AMS',admin:'Administração — Contratos',analytics:'Analytics de Governança',mencoes:'Menções',inbox:'Inbox — suas pendências',projetos:'Visão por Projetos',agenda:'Agenda — Outlook',minhasemana:'Minha Semana — plano semanal',roadmap:'Roadmap de funcionalidades'};
  const tit=titulos[estado.vista]||'Relatório';
  const sel=document.getElementById('f-periodo');
  const per=(sel&&sel.options[sel.selectedIndex]&&sel.options[sel.selectedIndex].text)||estado.periodo;
  const agora=new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
  const ph=document.getElementById('print-head');
  if(ph) ph.innerHTML=`<img src="/logo.svg" alt="Dexterity"><div><h1>${esc(tit)}</h1>
    <div class="ph-sub">Dexterity IT · Insights de Uso (Jira + Clockwork)</div></div>
    <div class="ph-right">Período: <strong>${esc(per)}</strong><br>Gerado em ${esc(agora)}</div>`;
  const prev=document.title;
  document.title=`Dexterity — ${tit} — ${per}`;
  const restaura=()=>{ document.title=prev; window.removeEventListener('afterprint',restaura); };
  window.addEventListener('afterprint', restaura);
  // Só imprime depois que o logo do cabeçalho decodificar (evita imagem quebrada na 1ª impressão).
  const go=()=>window.print();
  const img=ph&&ph.querySelector('img');
  if(img&&img.decode) img.decode().then(go).catch(go);
  else setTimeout(go,120);
}
// PDF da apuração de UM contrato AMS: valor apurado (referenciando o contrato) +
// memória de apontamentos por chamado (cada chamado com suas linhas de worklog → Jira).
function pdfApuracaoAMS(id){
  const c=(cfg.contratos||[]).find(x=>x.id===id); if(!c) return;
  const doc=document.getElementById('print-doc'); if(!doc) return;
  const cyc=amsCicloVigente(c,amsRefSel()); const cons=amsConsumoCiclo(c,cyc);
  // Só horas faturáveis consomem o pacote/excedente; o total do ciclo entra como contexto.
  const pool=amsHorasCiclo(c); const vh=Number(c.valorHora)||0; const h=cons.segFat/3600;
  const excedente=Math.max(0,h-pool), banco=Math.max(0,pool-h);
  const parcela=pool*vh, valExced=excedente*vh, total=parcela+valExced;
  const pctv=pool?Math.round(h/pool*100):0;
  const pt=amsPorTipo(c,cyc); const fatPct=pt.seg?Math.round(pt.segFat/pt.seg*100):0;
  const agora=new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
  // Memória por chamado (com as entradas individuais de apontamento).
  const wl=amsWorklogsCiclo(c,cyc); const porCh={};
  wl.forEach(w=>{ const k=w.k||'(sem chave)'; const ch=porCh[k]||(porCh[k]={seg:0,f:!!w.f,tipo:w.t||'—',ent:[]});
    ch.seg+=(Number(w.s)||0); ch.ent.push({d:(w.d||'').slice(0,10),a:w.a,s:Number(w.s)||0}); });
  const chs=Object.entries(porCh).sort((a,b)=>b[1].seg-a[1].seg);
  const tiposOrd=Object.entries(pt.tipos).sort((a,b)=>b[1].seg-a[1].seg);

  const linhaKpi=(v,l,cls)=>`<div class="doc-k${cls?' '+cls:''}"><div class="dk-v">${v}</div><div class="dk-l">${l}</div></div>`;
  const tiposTab=`<table class="doc-t"><thead><tr><th>Tipo de issue</th><th>Faturável</th><th class="num">Horas</th><th class="num">%</th></tr></thead><tbody>
    ${tiposOrd.map(([nome,t])=>`<tr><td>${esc(nome)}</td><td>${t.f?'Sim':'Não'}</td><td class="num">${fmtH(t.seg)}</td><td class="num">${pt.seg?Math.round(t.seg/pt.seg*100):0}%</td></tr>`).join('')}
    <tr class="doc-tot"><td>Total</td><td>${fatPct}% faturável</td><td class="num">${fmtH(pt.seg)}</td><td class="num">100%</td></tr>
    </tbody></table>`;
  const memoria=chs.map(([k,ch])=>{
    const temK=k&&k!=='(sem chave)';
    const tit=temK?`${esc(k)} — ${esc(amsResumoChamado(k)||'')}`:'(apontamentos sem chave de chamado)';
    const ent=ch.ent.slice().sort((a,b)=>(a.d<b.d?-1:a.d>b.d?1:0));
    return `<div class="doc-ch">
      <div class="doc-ch-h"><span class="doc-ch-k">${temK?`<a href="${jiraBase()}/browse/${encodeURIComponent(k)}">${tit}</a>`:tit}</span>
        <span class="doc-ch-meta">${esc(ch.tipo)} · ${ch.f?'faturável':'não faturável'}</span>
        <span class="doc-ch-tot">${fmtH(ch.seg)}</span></div>
      <table class="doc-ct"><thead><tr><th>Data</th><th>Pessoa</th><th class="num">Horas</th></tr></thead><tbody>
        ${ent.map(x=>`<tr><td>${esc(fmtBR(x.d))}</td><td>${esc(amsNomePessoa(x.a))}</td><td class="num">${fmtH(x.s)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }).join('');

  doc.innerHTML=`<div class="doc"><table class="doc-wrap">
    <thead><tr><td>
      <div class="doc-head"><img src="/logo.svg" alt="Dexterity">
        <div><h1>Relatório de apuração — AMS</h1><div class="doc-sub">Dexterity IT · Insights de Uso (Jira + Clockwork)</div></div>
        <div class="doc-right">${esc(c.cliente||'')}${c.cliente?'<br>':''}Gerado em ${esc(agora)}</div></div>
    </td></tr></thead>
    <tbody><tr><td>
    <h2 class="doc-cli">${esc(c.cliente||'(sem nome)')}</h2>
    <table class="doc-meta"><tbody>
      <tr><th>Contrato</th><td>AMS · apuração ${esc(amsLabelApur(c.apuracao||'trimestral').toLowerCase())}</td><th>Ciclo</th><td>${esc(amsLabelCiclo(cyc))} · ${esc(fmtBR(cyc.start))}–${esc(fmtBR(cyc.end))}</td></tr>
      <tr><th>Valor-hora</th><td>${vh?esc(fmtBRL(vh)):'—'}</td><th>Pacote do ciclo</th><td>${pool}h${c.minMes?` · mín ${c.minMes}h/mês`:''}${c.tetoMes?` · teto ${c.tetoMes}h/mês`:''}</td></tr>
      ${(c.respDex||c.respCliente)?`<tr><th>Responsáveis</th><td colspan="3">${c.respDex?`Dexterity: <strong>${esc(c.respDex)}</strong>`:''}${c.respDex&&c.respCliente?' · ':''}${c.respCliente?`Cliente: <strong>${esc(c.respCliente)}</strong>`:''}</td></tr>`:''}
      <tr><th>Faturamento</th><td colspan="3">${(()=>{ const fr=(c.faturados&&c.faturados[cyc.start])||null; return fr?`✓ Ciclo faturado${fr.em?` em ${esc(fmtBR(fr.em))}`:''}${fr.por?` · ${esc(fr.por)}`:''}`:'● Pendente de faturamento'; })()}</td></tr>
      <tr><th>Projetos</th><td colspan="3">${(c.projetos||[]).map(esc).join(', ')||'—'}</td></tr>
      ${c.obs?`<tr><th>Observações</th><td colspan="3">${esc(c.obs)}</td></tr>`:''}
    </tbody></table>
    <div class="doc-kpis">
      ${linhaKpi(fmtH(cons.seg),'Horas no ciclo (total)')}
      ${linhaKpi(fmtH(pt.segFat),`Faturáveis · ${pctv}% de ${pool}h`,'good')}
      ${linhaKpi(fmtH(pt.segNao),'Não faturáveis','warn')}
      ${linhaKpi(fmtH(Math.round(banco*3600)),'Banco de horas')}
      ${linhaKpi(excedente>0?fmtH(Math.round(excedente*3600)):'0h','Excedente',excedente>0?'bad':'')}
      ${linhaKpi(vh?fmtBRL(total):'—','Valor apurado do ciclo','tot')}
    </div>
    <div class="doc-val">Valor apurado: parcela do ciclo (${pool}h × ${vh?fmtBRL(vh):'—'} = <strong>${vh?fmtBRL(parcela):'—'}</strong>)${excedente>0?` + excedente (${fmtH(Math.round(excedente*3600))} × ${fmtBRL(vh)} = <strong>${fmtBRL(valExced)}</strong>, requer autorização prévia)`:''} = <strong>${vh?fmtBRL(total):'—'}</strong></div>
    <h3>Horas por tipo de issue</h3>
    ${tiposOrd.length?tiposTab:'<div class="doc-empty">Sem apontamentos neste ciclo.</div>'}
    <h3>Memória de apontamentos por chamado <span class="doc-h3s">${chs.length} chamado(s) · ${fmtH(pt.seg)}</span></h3>
    ${memoria||'<div class="doc-empty">Sem apontamentos neste ciclo.</div>'}
    <div class="doc-foot">Faturável vs não faturável é classificado pela <strong>descrição do tipo</strong> do chamado no Jira. <strong>Só as horas faturáveis consomem o pacote/excedente</strong>; as não faturáveis aparecem na memória apenas como registro. O banco de horas vale dentro do ciclo e não acumula para o próximo. Documento gerado pelo painel Insights de Uso (Jira + Clockwork) da Dexterity IT.</div>
    </td></tr></tbody></table></div>`;
  document.body.classList.add('doc-print');
  const prev=document.title; document.title=`Apuração AMS — ${c.cliente||''} — ${amsLabelCiclo(cyc)}`;
  const cleanup=()=>{ document.body.classList.remove('doc-print'); doc.innerHTML=''; document.title=prev; window.removeEventListener('afterprint',cleanup); };
  window.addEventListener('afterprint', cleanup);
  const go=()=>window.print();
  const img=doc.querySelector('img');
  if(img&&img.decode) img.decode().then(go).catch(go); else setTimeout(go,150);
}
