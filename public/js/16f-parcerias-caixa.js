// Jira Insights · 16f · 💰 FLUXO DE CAIXA DAS PARCERIAS (pedido do usuário, 2026-10-05: "quero poder projetar essas
// alocações por projeto e ter previsibilidade do meu fluxo de caixa… integrar com o Odoo para que o fechamento e a
// emissão da nota sejam consistentes").
// ===========================================================================
// Cada NOTA de cada contrato de parceria — um item por período de faturamento (por 🗂 projeto, quando o contrato tem
// projetos) e cada ➕ hora extra — vira uma ENTRADA de caixa:
//   • quando: o vencimento da fatura no Odoo, se ela já existe; senão o dia da nota + o prazo de recebimento do
//     contrato (pcPrazo — 30 dias se não informado);
//   • situação: 💚 recebido (fatura paga no Odoo) · 🔵 faturado, a receber · ⚪ previsto (sem fatura ainda) ·
//     🔴 atrasado (a data passou e não está paga) · ◻ antes do Odoo (faturado fora do painel — histórico);
//   • quanto: o valor da nota (bruto) e, se o contrato informa a retenção na fonte (c.retPct), o líquido.
// A grade cobre 12 meses (2 para trás → 9 à frente): uma linha por contrato (▸ abre os projetos) e o total, por
// mês de RECEBIMENTO (caixa) ou de NOTA (faturamento). Tudo aqui é LEITURA de pcPlanejamento (16b) e da última
// leitura do Odoo (c.odoo.sync, 16c) — nada é gravado. Helpers dos outros módulos só em tempo de render.
// ===========================================================================
const PC_CX_SIT={ recebido:['💚','recebido','ok'], faturado:['🔵','faturado, a receber','na'], previsto:['⚪','previsto (sem fatura)','prev'], atrasado:['🔴','atrasado','crit'], antes:['◻','antes do Odoo (faturado fora do painel)','antes'] };
const PC_CX_ORDEM=['atrasado','faturado','previsto','recebido','antes'];
// % retido na fonte (impostos que o parceiro retém ao pagar) — 0 quando não informado.
function pcRetPct(c){ const n=Number(c&&c.retPct); return (isFinite(n)&&n>0)?Math.min(n,60):0; }
function pcCxLiquido(c, v){ return Math.round(v*(1-pcRetPct(c)/100)*100)/100; }
// As entradas de UM contrato (uma por item de nota), com a data e a situação.
function pcCaixaEntradas(c, hoje){
  let P; try{ P=pcPlanejamento(c); }catch(e){ return []; }
  const o=(typeof pcOdoo==='function')?pcOdoo(c):null; const s=o&&o.sync; const out=[]; const legado=typeof pcOdooLegado==='function'?pcOdooLegado(c):new Set();
  const faturas=(chave)=>{ if(!o||!s) return []; const it=(o.itens||[]).find(x=>x.chave===chave); const L=it&&s.linhas&&s.linhas[it.id]; if(!L) return [];
    return (L.faturas||[]).map(id=>(s.faturas||[]).find(f=>f.id===id)).filter(Boolean); };
  const entra=(chave, ym, f, valor, per, rot)=>{ if(!(valor>0)||!per) return;
    let data=pcRecebeEm(c,per), sit='previsto'; const fora=typeof pcNoOdoo==='function'&&!pcNoOdoo(c,ym);
    if(fora) sit=(data&&data>=hoje)?'previsto':'antes';   // faturado fora do painel: o que ainda não venceu continua a receber; o que venceu é histórico
    else if(typeof pcOdooStatusChave==='function'){ const st=pcOdooStatusChave(c,chave,per.nota,hoje);
      if(st.k==='pago') sit='recebido'; else if(st.k==='faturado'||st.k==='parcial') sit='faturado';
      const fs=faturas(chave); const venc=fs.map(x=>x.vencimento).filter(Boolean).sort()[0]; if(venc) data=venc; }
    if(!fora&&(sit==='previsto'||sit==='faturado')&&data&&data<hoje) sit='atrasado';
    out.push({ c, chave, ym, f, valor:Math.round(valor*100)/100, liquido:pcCxLiquido(c,valor), data, nota:per.nota, sit, rot }); };
  P.periodos.forEach(x=>{
    if(x.porFr) (P.frentes||[]).forEach(f=>{ const z=x.porFr[f.id]; if(z) entra(typeof pcChaveItem==='function'?pcChaveItem(c,x.ym,f.id,legado):`p:${x.ym}:${f.id}`, x.ym, f, Number(z.v)||0, x, pcFrNome(f)); });
    else entra('p:'+x.ym, x.ym, null, Number(x.valor)||0, x, 'Consultoria'); });
  if(typeof pcExtras==='function') pcExtras(c).forEach(e=>{ if(!e||!e.ym) return; const per=P.periodos.find(p=>p.ym===e.ym)||pcPeriodo(c,e.ym); entra('x:'+e.id, e.ym, null, pcExtraValor(e), per, '➕ '+(e.desc||'horas extras')); });
  return out; }
// Meses da grade: 2 para trás → 9 à frente do mês de hoje.
function pcCxMeses(hoje){ const out=[]; let ym=pcYmSoma(hoje.slice(0,7),-2); for(let i=0;i<12;i++){ out.push(ym); ym=pcYmSoma(ym,1); } return out; }
// O resumo inteiro (todas as parcerias): por contrato, por projeto e por mês — na base escolhida (receb · nota).
function pcCaixa(lista, hoje, base){
  const meses=pcCxMeses(hoje); const chaveMes=(e)=>(base==='nota'?e.nota:e.data||'').slice(0,7);
  const linhas=[]; const tot={}; meses.forEach(m=>{ tot[m]={ v:0, liq:0, sit:{} }; });
  let atrasado=0, prox30=0, recebidoMes=0; const ate30=pcMaisDias(hoje,30); const ymHoje=hoje.slice(0,7);
  (lista||[]).forEach(c=>{ const es=pcCaixaEntradas(c,hoje); if(!es.length) return;
    const L={ c, porMes:{}, frentes:{} }; meses.forEach(m=>{ L.porMes[m]={ v:0, liq:0, sit:{} }; });
    es.forEach(e=>{ if(e.sit==='atrasado') atrasado+=e.valor; if((e.sit==='previsto'||e.sit==='faturado')&&e.data>=hoje&&e.data<=ate30) prox30+=e.valor; if(e.sit==='recebido'&&(e.data||'').slice(0,7)===ymHoje) recebidoMes+=e.valor;
      const m=chaveMes(e); if(!L.porMes[m]) return;
      const add=(o)=>{ o.v+=e.valor; o.liq+=e.liquido; o.sit[e.sit]=(o.sit[e.sit]||0)+e.valor; };
      add(L.porMes[m]); add(tot[m]);
      const fk=e.f?e.f.id:(e.chave.startsWith('x:')?'~extras':'~contrato'); if(!L.frentes[fk]) { L.frentes[fk]={ rot:e.f?pcFrNome(e.f):(fk==='~extras'?'➕ Horas extras':'Consultoria (sem projetos)'), f:e.f, porMes:{} }; meses.forEach(mm=>{ L.frentes[fk].porMes[mm]={ v:0, liq:0, sit:{} }; }); }
      add(L.frentes[fk].porMes[m]); });
    if(meses.some(m=>L.porMes[m].v>0)) linhas.push(L); });
  const r2=(n)=>Math.round(n*100)/100;
  return { meses, linhas, tot, atrasado:r2(atrasado), prox30:r2(prox30), recebidoMes:r2(recebidoMes), temRet:(lista||[]).some(c=>pcRetPct(c)>0) }; }
// A situação que dá a cor da célula: a mais "urgente" que tiver valor (atrasado > faturado > previsto > recebido).
function pcCxSitCel(o){ return PC_CX_ORDEM.find(k=>(o.sit[k]||0)>0)||''; }
function pcCxTip(o, m){ return `${labelMesAbbr(m)} · ${fmtBRL(o.v)}${Math.abs(o.liq-o.v)>0.005?` (líquido ${fmtBRL(o.liq)})`:''} — `+PC_CX_ORDEM.filter(k=>(o.sit[k]||0)>0).map(k=>`${PC_CX_SIT[k][0]} ${PC_CX_SIT[k][1]}: ${fmtBRL(o.sit[k])}`).join(' · '); }
function pcCaixaHTML(lista, hoje){
  const st=estado.parcerias=estado.parcerias||{}; const base=st.cxBase==='nota'?'nota':'receb'; const abre=st.cxAbre||{};
  if(!(lista||[]).some(c=>(typeof pcTemFrentes==='function'&&pcTemFrentes(c))||pcEquipe(c).length||(typeof pcExtras==='function'&&pcExtras(c).length))) return '';
  const X=pcCaixa(lista,hoje,base); if(!X.linhas.length) return '';
  const max=Math.max(1,...X.meses.map(m=>X.tot[m].v)); const ymHoje=hoje.slice(0,7);
  const cel=(o,m)=>{ if(!(o.v>0)) return '<td class="num"><span class="muted">—</span></td>'; const k=pcCxSitCel(o); return `<td class="num pc-cx-c pc-cx-${PC_CX_SIT[k]?PC_CX_SIT[k][2]:'prev'}${m===ymHoje?' pc-cx-hoje':''}" data-tip="${escA(pcCxTip(o,m))}">${fmtBRL(o.v)}</td>`; };
  const barras=`<div class="pc-cx-barras scroll-x" aria-hidden="true">${X.meses.map(m=>{ const o=X.tot[m]; const h=Math.round(o.v/max*100); const segs=PC_CX_ORDEM.slice().reverse().filter(k=>(o.sit[k]||0)>0).map(k=>`<i class="pc-cx-${PC_CX_SIT[k][2]}" style="height:${o.v>0?Math.max(2,Math.round((o.sit[k]/o.v)*h)):0}%"></i>`).join('');
    return `<div class="pc-cx-bar${m===ymHoje?' pc-cx-hoje':''}" data-tip="${escA(pcCxTip(o,m))}"><div class="pc-cx-pilha">${segs}</div><span>${esc(labelMesAbbr(m))}</span></div>`; }).join('')}</div>`;
  const rows=X.linhas.map(L=>{ const aberto=!!abre[L.c.id]; const fks=Object.keys(L.frentes); const sub=aberto&&fks.length>1||aberto&&fks.length===1&&fks[0]!=='~contrato';
    return `<tr class="pc-cx-ct"><td><button class="btn rt-step pc-cx-tg" data-pc-cx-abre="${escA(L.c.id)}" aria-expanded="${aberto?'true':'false'}" data-tip="${aberto?'Fechar':'Ver por projeto'}">${aberto?'▾':'▸'}</button> <b>${esc(L.c.consultoria||'')}</b> <span class="muted small">${esc(pcCod(L.c))} · ${pcPrazo(L.c)}d${pcRetPct(L.c)?` · ret. ${pcRetPct(L.c)}%`:''}</span></td>${X.meses.map(m=>cel(L.porMes[m],m)).join('')}<td class="num"><b>${fmtBRL(X.meses.reduce((s,m)=>s+L.porMes[m].v,0))}</b></td></tr>
      ${sub?fks.map(fk=>{ const F=L.frentes[fk]; const tipo=F.f&&typeof pcFrTipo==='function'?pcFrTipo(F.f):''; return `<tr class="pc-cx-fr"><td class="small">↳ ${tipo&&PC_FR_TIPOS[tipo]?PC_FR_TIPOS[tipo][0]+' ':''}${esc(F.rot)}</td>${X.meses.map(m=>cel(F.porMes[m],m)).join('')}<td class="num small">${fmtBRL(X.meses.reduce((s,m)=>s+F.porMes[m].v,0))}</td></tr>`; }).join(''):''}`; }).join('');
  let acum=0; const acumRow=X.meses.map(m=>{ acum+=X.tot[m].v; return `<td class="num muted small">${fmtBRL(acum)}</td>`; }).join('');
  const liqRow=X.temRet?`<tr class="pc-cx-liq"><td class="small">Líquido (descontada a retenção)</td>${X.meses.map(m=>`<td class="num small">${X.tot[m].liq>0?fmtBRL(X.tot[m].liq):'—'}</td>`).join('')}<td class="num small"><b>${fmtBRL(X.meses.reduce((s,m)=>s+X.tot[m].liq,0))}</b></td></tr>`:'';
  return `<div class="card full pc-caixa"><h2>💰 Fluxo de caixa das parcerias <span>${base==='nota'?'por mês da NOTA (faturamento)':'por mês do RECEBIMENTO (caixa)'} · ${esc(labelMesAbbr(X.meses[0]))} → ${esc(labelMesAbbr(X.meses[X.meses.length-1]))}</span></h2>
    <div class="pc-cx-kpis"><div class="pc-cx-kpi"><span>A receber em 30 dias</span><b>${fmtBRL(X.prox30)}</b></div><div class="pc-cx-kpi${X.atrasado>0?' crit':''}"><span>🔴 Atrasado</span><b>${fmtBRL(X.atrasado)}</b></div><div class="pc-cx-kpi"><span>💚 Recebido em ${esc(labelMesAbbr(ymHoje))}</span><b>${fmtBRL(X.recebidoMes)}</b></div>
      <div class="pc-cx-base"><button class="btn rt-step${base==='receb'?' on':''}" data-pc-cx-base="receb" data-tip="Agrupa pelo mês em que o dinheiro entra (vencimento da fatura ou nota + prazo)">💰 caixa</button><button class="btn rt-step${base==='nota'?' on':''}" data-pc-cx-base="nota" data-tip="Agrupa pelo mês em que a nota é emitida">🧾 notas</button></div></div>
    ${barras}
    <div class="scroll-x"><table class="mp-tab-mini pc-cx-tab"><thead><tr><th>Contrato</th>${X.meses.map(m=>`<th class="num${m===ymHoje?' pc-cx-hoje':''}">${esc(labelMesAbbr(m))}</th>`).join('')}<th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody><tfoot><tr><td><b>Total</b></td>${X.meses.map(m=>`<td class="num"><b>${X.tot[m].v>0?fmtBRL(X.tot[m].v):'—'}</b></td>`).join('')}<td class="num"><b>${fmtBRL(X.meses.reduce((s,m)=>s+X.tot[m].v,0))}</b></td></tr>
      ${liqRow}<tr><td class="muted small">Acumulado</td>${acumRow}<td></td></tr></tfoot></table></div>
    <div class="muted small pc-cx-leg">${PC_CX_ORDEM.map(k=>`<span class="pc-cx-l pc-cx-${PC_CX_SIT[k][2]}">${PC_CX_SIT[k][0]} ${PC_CX_SIT[k][1]}</span>`).join(' ')}</div>
    <div class="muted small" style="margin-top:4px">Cada nota entra no mês do <b>vencimento da fatura no Odoo</b> (quando já existe) ou no <b>dia da nota + o prazo de recebimento</b> do contrato. O valor vem da previsão de cada projeto — e, depois do fechamento, da <b>✔ apuração</b> (horas aprovadas no parceiro). "Recebido" = fatura paga no Odoo (↻ Sincronizar em 🧾 Faturamentos). Valores brutos${X.temRet?'; a linha "Líquido" desconta a retenção na fonte informada em cada contrato':' — informe a retenção na fonte em ✏️ editar para ver o líquido'}.</div></div>`;
}
// ---- listeners desta faixa ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='parcerias') return; const t=e.target.closest&&e.target.closest('button'); if(!t) return; const st=estado.parcerias=estado.parcerias||{};
  if(t.hasAttribute('data-pc-cx-base')){ st.cxBase=t.getAttribute('data-pc-cx-base')==='nota'?'nota':'receb'; renderParcerias(); return; }
  if(t.hasAttribute('data-pc-cx-abre')){ const id=t.getAttribute('data-pc-cx-abre'); st.cxAbre=st.cxAbre||{}; st.cxAbre[id]=!st.cxAbre[id]; renderParcerias(); return; }
});
