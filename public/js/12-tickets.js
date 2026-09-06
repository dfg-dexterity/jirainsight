// Jira Insights · 12 · 🎫 TICKETS — agregação horas × atividade por ticket (renderTickets).
// Agrega os tickets (issues) do período: horas (Clockwork) + atividade (Jira).
function calcTickets(){
  const f=filtros(); const projs=projetosUnidos(); const pessoasNome=pessoasUnidas();
  const mapa={};
  const get=(k,p,t)=> mapa[k] || (mapa[k]={ k, p:p||'—', t:t||'—', autores:{}, alter:0, trans:0, coment:0, criado:0, total:0, seg:0, ultima:'' });
  // Atividade do Jira (changelog/comentários/criações)
  (estado.atividade.eventos||[]).forEach(e=>{
    if(!passa(e.p,e.t,projs,f)) return;
    if(f.pessoa && e.a!==f.pessoa) return;
    const t=get(e.k, e.p, e.t);
    if(e.e==='alteracao') t.alter++;
    else if(e.e==='transicao') t.trans++;
    else if(e.e==='comentario') t.coment++;
    else if(e.e==='criado') t.criado++;
    t.total++;
    if(pessoasNome[e.a]) t.autores[e.a]=pessoasNome[e.a].nome;
    const dia=(e.d||'').slice(0,10); if(dia>t.ultima) t.ultima=dia;
  });
  // Horas do Clockwork (agora com o código da issue)
  (estado.tempo.worklogs||[]).forEach(w=>{
    if(!w.k) return;                                  // worklog sem issue resolvida
    if(!passa(w.p,w.t,projs,f)) return;
    if(f.pessoa && w.a!==f.pessoa) return;
    const t=get(w.k, w.p, w.t);
    t.seg+=w.s;
    if(pessoasNome[w.a]) t.autores[w.a]=pessoasNome[w.a].nome;
    const dia=(w.d||'').slice(0,10); if(dia>t.ultima) t.ultima=dia;
  });
  const resumos=resumosUnidos();
  const linhas=Object.values(mapa)
    .map(l=>({ ...l, nome:resumos[l.k]||'' }))
    .sort((x,y)=> (y.seg-x.seg) || (x.ultima<y.ultima?1:x.ultima>y.ultima?-1:0) || (y.total-x.total) || x.k.localeCompare(y.k));
  return { linhas, projs };
}

// Agrupa os tickets por Projeto, Tipo, Categoria ou Pessoa (para a visão Tickets).
function calcTicketsAgrupado(group){
  const { linhas, projs } = calcTickets();
  if(group==='pessoa'){
    const f=filtros(); const pessoasNome=pessoasUnidas();
    const g={};
    const get=(a)=> g[a] || (g[a]={ chave:a, nome:(pessoasNome[a]&&pessoasNome[a].nome)||a, pessoa:true,
      tickets:new Set(), seg:0, total:0, trans:0, coment:0, criado:0 });
    (estado.tempo.worklogs||[]).forEach(w=>{
      if(!w.k || !passa(w.p,w.t,projs,f)) return;
      if(f.pessoa && w.a!==f.pessoa) return;
      const r=get(w.a); r.seg+=w.s; r.tickets.add(w.k);
    });
    (estado.atividade.eventos||[]).forEach(e=>{
      if(!passa(e.p,e.t,projs,f)) return;
      if(f.pessoa && e.a!==f.pessoa) return;
      const r=get(e.a); r.tickets.add(e.k); r.total++;
      if(e.e==='transicao') r.trans++; else if(e.e==='comentario') r.coment++; else if(e.e==='criado') r.criado++;
    });
    const rows=Object.values(g).map(r=>({ ...r, tickets:r.tickets.size }))
      .sort((x,y)=> (y.seg-x.seg) || (y.tickets-x.tickets) || x.nome.localeCompare(y.nome,'pt'));
    return { rows, projs, group };
  }
  const keyFn = group==='projeto' ? (l=>l.p)
              : group==='tipo'    ? (l=>l.t)
              :                      (l=>(projs[l.p]&&projs[l.p].categoria)||'Sem categoria'); // categoria
  const g={};
  linhas.forEach(l=>{
    const k=keyFn(l);
    const r=g[k] || (g[k]={ chave:k, tickets:0, seg:0, total:0, trans:0, coment:0, criado:0 });
    r.tickets++; r.seg+=l.seg; r.total+=l.total; r.trans+=l.trans; r.coment+=l.coment; r.criado+=l.criado;
  });
  const rows=Object.values(g).sort((x,y)=> (y.seg-x.seg) || (y.tickets-x.tickets) || String(x.chave).localeCompare(String(y.chave),'pt'));
  return { rows, projs, group };
}

function renderTickets(){
  const cont=document.getElementById('conteudo');
  const { linhas, projs } = calcTickets();
  if(!linhas.length){
    cont.replaceChildren(el('<div><div class="estado">Sem tickets para os filtros atuais.</div></div>'));
    return;
  }
  const group=estado.tkGroup||'';
  const nomeProj=(k)=>projNome(k);   // a interface mostra o NOME do projeto

  // KPIs (sempre sobre o total, independente do agrupamento).
  const horasTot=linhas.reduce((s,l)=>s+l.seg,0);
  const kpis=`<div class="kpis ts-kpis">
      <div class="kpi a"><div class="v">${linhas.length}</div><div class="l">Tickets no período</div></div>
      <div class="kpi t"><div class="v">${fmtH(horasTot)}</div><div class="l">Horas apontadas</div></div>
      <div class="kpi a"><div class="v">${linhas.reduce((s,l)=>s+l.total,0)}</div><div class="l">Atividades</div></div>
      <div class="kpi a"><div class="v">${linhas.reduce((s,l)=>s+l.trans,0)}</div><div class="l">Transições</div></div>
    </div>`;

  const seletor=`<div class="tk-bar"><label class="tk-group-sel">Agrupar por
    <select id="tk-group">
      <option value="">Nenhum (por ticket)</option>
      <option value="projeto">Projeto</option>
      <option value="tipo">Tipo</option>
      <option value="categoria">Categoria</option>
      <option value="pessoa">Pessoa</option>
    </select></label></div>`;

  let tabela;
  if(group){
    const { rows }=calcTicketsAgrupado(group);
    const rotG={projeto:'Projeto',tipo:'Tipo',categoria:'Categoria',pessoa:'Pessoa'}[group]||'Grupo';
    const corpo=rows.map(r=>{
      const cel = group==='pessoa'
          ? `<td data-pessoa="${escA(r.chave)}" data-tip="${escA(r.nome)}" data-tipk="clique para ver a pessoa">${esc(r.nome)}</td>`
        : group==='projeto'
          ? `<td data-drill="projeto" data-key="${escA(r.chave)}" data-tip="${escA(nomeProj(r.chave))}" data-tipk="clique para detalhar">${esc(nomeProj(r.chave))}</td>`
        : group==='categoria'
          ? `<td data-drill="categoria" data-key="${escA(r.chave)}" data-tip="${escA(r.chave)}" data-tipk="clique para detalhar">${esc(r.chave)}</td>`
          : `<td data-drill="tipo" data-key="${escA(r.chave)}" data-tip="${escA(r.chave)}" data-tipk="clique para detalhar">${esc(r.chave)}</td>`;
      return `<tr>${cel}
        <td class="num">${r.tickets}</td>
        <td class="num">${r.seg?fmtH(r.seg):'—'}</td>
        <td class="num">${r.total}</td>
        <td class="num">${r.trans}</td>
        <td class="num">${r.coment}</td>
        <td class="num">${r.criado}</td></tr>`;
    }).join('');
    tabela=`<table><thead><tr>
        <th>${rotG}</th><th class="num">Tickets</th><th class="num">Horas</th>
        <th class="num">Atividades</th><th class="num">Transições</th><th class="num">Coment.</th><th class="num">Criados</th>
      </tr></thead><tbody>${corpo}</tbody></table>`;
  } else {
    const rows=linhas.map(l=>{
      const url=`${jiraBase()}/browse/${encodeURIComponent(l.k)}`;
      const quem=Object.values(l.autores);
      return `<tr>
        <td><a href="${url}" target="_blank" rel="noopener" title="Abrir ${esc(l.k)} no Jira">${esc(l.k)} ↗</a></td>
        <td class="tk-nome" title="${esc(l.nome)}">${l.nome?esc(l.nome):'<span class="muted">—</span>'}</td>
        <td><span class="codigo-proj" data-drill="projeto" data-key="${escA(l.p)}" data-tip="${escA(l.p)}" data-tipk="clique para detalhar">${esc(projNome(l.p))}</span></td>
        <td><span data-drill="tipo" data-key="${escA(l.t)}" data-tip="${escA(l.t)}" data-tipk="clique para detalhar">${esc(l.t)}</span></td>
        <td class="num">${l.seg?fmtH(l.seg):'—'}</td>
        <td title="${esc(quem.join(', '))}">${quem.length}</td>
        <td class="num">${l.alter}</td>
        <td class="num">${l.trans}</td>
        <td class="num">${l.coment}</td>
        <td class="num">${l.criado}</td>
        <td>${esc(l.ultima)}</td>
      </tr>`;
    }).join('');
    tabela=`<table><thead><tr>
        <th>Ticket</th><th>Resumo</th><th>Projeto</th><th>Tipo</th><th class="num">Horas</th><th class="num">Pessoas</th>
        <th class="num">Alter.</th><th class="num">Transições</th><th class="num">Coment.</th>
        <th class="num">Criado</th><th>Última</th>
      </tr></thead><tbody>${rows}</tbody></table>`;
  }

  cont.replaceChildren(el(`<div>
    ${kpis}
    <div class="card full">
      <h2>Tickets do Jira <span>horas + atividade · clique no código para abrir no Jira</span></h2>
      ${seletor}
      <div class="ts-wrap">${tabela}</div>
    </div>
  </div>`));
  const sel=document.getElementById('tk-group'); if(sel) sel.value=group;
}

