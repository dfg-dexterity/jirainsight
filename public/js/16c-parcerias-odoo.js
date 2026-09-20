// Jira Insights · 16c · 🤝 CONTRATO DE PARCERIA ↔ ODOO VENDAS — a ordem de venda do contrato, os objetos de
// resultado (rateio de cada nota) e as horas extras (pedido de 2026-09-20).
// ===========================================================================
// O CONTRATO é o dono da ordem de venda no Odoo: `c.odoo = { id, name, url, em, por, parceiroId, produtoId,
// produtoExtraId, itens:[{chave, id}], sync }`. Cada PERÍODO de faturamento do quadro 🧾 vira UM ITEM da ordem
// (chave `p:AAAA-MM`, produto das horas de consultoria) e cada HORA EXTRA lançada vira OUTRO item (chave
// `x:<id>`, produto de horas extras) — é assim que cada faturamento fica visível, um a um, dentro da ordem.
// ↻ SINCRONIZAR faz duas coisas: LÊ o estado da ordem (o que já foi faturado/pago por item —
// /api/resumo?acao=odoo-venda-status) e COMPARA a previsão com os itens que a ordem já tem (?acao=odoo-contrato
// com dry:1). O que mudou aparece numa lista e só vai para o Odoo depois que a pessoa clica em "Aplicar" —
// item já faturado nunca é alterado; item que saiu da previsão é apagado (cotação) ou zerado (ordem
// confirmada, o Odoo não deixa apagar). Remover o contrato CANCELA a ordem (?acao=odoo-contrato-cancela).
// 🎯 OBJETOS DE RESULTADO = contas analíticas do Odoo. `c.rateio = [{ac, nome, pct}]` é o rateio padrão de toda
// nota (ex.: 90% Sumitomo · 10% Hi-Mix); `c.rateios[ym]` sobrepõe um período; a hora extra tem o seu (um
// objeto, 100%) ou herda o do período. Vai como `analytic_distribution` de cada item.
// ➕ HORAS EXTRAS = `c.extras = [{id, ym, h, vh, desc, ac, acNome, proj, quem, em, por}]` — processo próprio,
// esporádico, sempre um item separado na ordem, somado ao total da nota do período.
// 🧾 PRÓXIMAS NOTAS (pcNotasPendentes): todos os contratos, nota por nota, com o estado no Odoo — a lista de
// quem fatura, para nenhum faturamento ficar esquecido (também no 📆 Fechamento do mês da Início).
// ⚙ Produtos: `cfg.odooVendas = { produtoId, produtoNome, produtoExtraId, produtoExtraNome }` (padrão do painel).
// Helpers de outros módulos (pcPlanejamento, pcLog, salvaCfg, abreModal…) só em tempo de render/clique.
// ===========================================================================
const PC_ODOO_ST={ draft:'cotação em rascunho', sent:'cotação enviada', sale:'ordem de venda confirmada', done:'ordem concluída', cancel:'cancelada' };
const PC_ODOO_CAT_TTL=10*60*1000, PC_ODOO_SYNC_TTL=10*60*1000;
function pcOdoo(c){ const o=c&&c.odoo; return (o&&typeof o==='object'&&o.id)?o:null; }
function pcRateio(c){ if(!Array.isArray(c.rateio)) c.rateio=[]; return c.rateio; }
function pcRateios(c){ if(!c.rateios||typeof c.rateios!=='object') c.rateios={}; return c.rateios; }
function pcRateioDe(c, ym){ const r=pcRateios(c)[ym]; return (Array.isArray(r)&&r.length)?r:null; }   // null = padrão do contrato
function pcRateioEfetivo(c, ym){ return pcRateioDe(c,ym)||pcRateio(c); }
function pcRateioSoma(r){ return Math.round((r||[]).reduce((s,x)=>s+(Number(x&&x.pct)||0),0)*100)/100; }
function pcRateioOk(r){ return !(r||[]).length||Math.abs(pcRateioSoma(r)-100)<0.01; }
function pcRateioRot(r){ return (r||[]).length?r.map(x=>`${Math.round((Number(x.pct)||0)*100)/100}% ${x.nome||('#'+x.ac)}`).join(' · '):'—'; }
function pcExtras(c){ if(!Array.isArray(c.extras)) c.extras=[]; return c.extras; }
function pcExtrasDe(c, ym){ return pcExtras(c).filter(x=>x&&x.ym===ym); }
function pcExtraValor(x){ return Math.round((Number(x&&x.h)||0)*(Number(x&&x.vh)||0)*100)/100; }
function pcExtraNovo(c, ym){ return { id:pcId('xt'), ym, h:0, vh:Number(c.valorHora)||0, desc:'', ac:0, acNome:'', proj:'', quem:'', em:hojeSP(), por:pcQuem().nome }; }
function pcSomaDias(s, n){ const [y,m,d]=String(s).split('-').map(Number); return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10); }
// Redesenha a tela — mas NUNCA enquanto a pessoa está numa linha editável (horas extras, rateio): o redesenho
// fica adiado até o foco sair da tabela, senão o Tab de um campo ao outro perderia o que estava sendo digitado.
// Na Início (📆 Fechamento do mês) a leitura do Odoo também redesenha, para a nota "atrasada" virar "faturada".
// (No Chrome o `change` dispara com o foco já fora do campo, então a decisão "ainda está na tabela?" é tomada
// pelo `focusin` seguinte: foco caiu em outra célula → continua adiado; caiu fora → redesenha; ninguém ganhou o
// foco → redesenha depois de 800 ms.)
let _pcRenderAdiado=false, _pcAdiaT=null;
const PC_TAB_EDIT='.pc-xt-tab,.pc-rt-tab';
const pcNaTabela=(e)=>!!(e&&e.closest&&e.closest(PC_TAB_EDIT));
function pcAdiaRender(){ _pcRenderAdiado=true; clearTimeout(_pcAdiaT);
  _pcAdiaT=setTimeout(()=>{ _pcAdiaT=null; if(!_pcRenderAdiado) return; if(pcNaTabela(document.activeElement)){ pcAdiaRender(); return; } _pcRenderAdiado=false; if(estado.vista==='parcerias') renderParcerias(); },800); }
function pcReRender(){ if(estado.vista==='acoes'){ try{ render(); }catch(e){} return; } if(estado.vista!=='parcerias') return;
  if(_pcRenderAdiado||pcNaTabela(document.activeElement)){ pcAdiaRender(); return; } renderParcerias(); }
document.getElementById('conteudo').addEventListener('focusin',(e)=>{ if(estado.vista!=='parcerias'||!_pcRenderAdiado) return;
  if(pcNaTabela(e.target)){ pcAdiaRender(); return; }
  clearTimeout(_pcAdiaT); _pcAdiaT=null; _pcRenderAdiado=false; setTimeout(()=>{ if(estado.vista==='parcerias') renderParcerias(); },0); });   // depois do clique que tirou o foco da tabela
function pcOdooEstado(c){ const st=estado.parcerias=estado.parcerias||{}; st.odoo=st.odoo||{}; return st.odoo[c.id]=st.odoo[c.id]||{}; }
function pcOdooFetch(acao, corpo){ return fetch('/api/resumo?acao='+acao,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(corpo||{})}).then(r=>r.json()); }
function pcOdooVendas(){ if(!cfg.odooVendas||typeof cfg.odooVendas!=='object') cfg.odooVendas={}; return cfg.odooVendas; }
// O que impede levar a previsão ao Odoo: um rateio que não fecha 100%.
function pcRateioProblemas(c){ if(!pcRateioOk(pcRateio(c))) return `O rateio padrão do contrato soma ${pcRateioSoma(pcRateio(c))}% — precisa fechar 100%.`;
  const ruim=Object.keys(pcRateios(c)).find(ym=>!pcRateioOk(pcRateios(c)[ym])); return ruim?`O rateio de ${labelMesAbbr(ruim)} soma ${pcRateioSoma(pcRateios(c)[ruim])}% — precisa fechar 100%.`:''; }
// Períodos oferecidos para uma hora extra: do mês anterior a 11 meses à frente (+ os que a previsão já cobre).
function pcPeriodosOpcoes(c, hoje){ const s=new Set(); let ym=pcYmSoma(hoje.slice(0,7),-1); for(let i=0;i<13;i++){ s.add(ym); ym=pcYmSoma(ym,1); }
  try{ pcPlanejamento(c).periodos.forEach(x=>s.add(x.ym)); }catch(e){} return [...s].sort(); }

// ---- as linhas que a ordem deve ter HOJE: um item por período com previsão + um por hora extra ----
function pcLinhasOrdem(c, plan){
  const P=plan||pcPlanejamento(c); const nome=c.consultoria||'consultoria'; const out=[];
  P.periodos.forEach(x=>{ const h=Math.round((Number(x.horas)||0)*100)/100, v=Math.round((Number(x.valor)||0)*100)/100; if(!(v>0)) return;
    const qtd=h>0?h:1, unit=h>0?Math.round(v/h*100)/100:v;   // valor fechado sem horas = 1 × valor
    out.push({ chave:'p:'+x.ym, tipo:'periodo', mes:x.ym, de:x.iniPlano, ate:x.fimPlano, nota:x.nota, qtd, unitario:unit, valor:v,
      descricao:h>0?`Consultoria — ${nome} · ${dataBR(x.iniPlano)} a ${dataBR(x.fimPlano)} (${fmtHd(h)} × ${fmtBRL(unit)}) · nota ${dataBR(x.nota)}`
        :`Consultoria — ${nome} · ${dataBR(x.iniPlano)} a ${dataBR(x.fimPlano)} (valor fechado) · nota ${dataBR(x.nota)}`,
      rateio:pcRateioEfetivo(c,x.ym).map(r=>({ ac:r.ac, pct:r.pct })) }); });
  pcExtras(c).forEach(x=>{ const h=Math.round((Number(x.h)||0)*100)/100, vh=Math.round((Number(x.vh)||0)*100)/100; if(!(h>0)||!(vh>0)||!x.ym) return;
    const per=P.periodos.find(p=>p.ym===x.ym)||pcPeriodo(c,x.ym);
    out.push({ chave:'x:'+x.id, tipo:'extra', mes:x.ym, de:per.iniPlano||per.ini, ate:per.fimPlano||per.fim, nota:per.nota, qtd:h, unitario:vh, valor:Math.round(h*vh*100)/100,
      descricao:`Horas extras — ${x.desc||nome}${x.proj?' ('+x.proj+')':''} · ${labelMesAbbr(x.ym)} (${fmtHd(h)} × ${fmtBRL(vh)}) · nota ${dataBR(per.nota)}`,
      rateio:(x.ac?[{ ac:x.ac, pct:100 }]:pcRateioEfetivo(c,x.ym)).map(r=>({ ac:r.ac, pct:r.pct })) }); });
  return out;
}
// Estado de um item (chave) na ordem, pela última leitura do Odoo.
function pcOdooItem(c, chave){ const o=pcOdoo(c); return o?((o.itens||[]).find(x=>x.chave===chave)||null):null; }
function pcOdooStatusChave(c, chave, nota, hoje){
  const o=pcOdoo(c); if(!o) return { k:'sem', rot:'sem ordem de venda' };
  const it=pcOdooItem(c,chave); const s=o.sync; const atrasada=!!(nota&&hoje&&nota<hoje);
  if(!it) return { k:'fora', rot:'fora da ordem — sincronize' };
  if(!s) return { k:atrasada?'atrasada':'na', rot:atrasada?'⚠ nota atrasada — sincronize':`na ordem ${o.name||''}`.trim() };
  const L=s.linhas&&s.linhas[it.id]; if(!L) return { k:'fora', rot:'item não está mais na ordem — sincronize' };
  const fats=(L.faturas||[]).map(id=>(s.faturas||[]).find(f=>f.id===id)).filter(Boolean); const pagas=fats.length>0&&fats.every(f=>f.pagamento==='paid'||f.pagamento==='in_payment');
  if(L.qtdFat>0&&L.qtdFat>=L.qtd-0.01) return { k:pagas?'pago':'faturado', rot:`faturado${fats.length?' '+fats.map(f=>f.nome).join(', '):''}${fats[0]&&fats[0].data?' em '+dataBR(fats[0].data):''}${fats.length?(pagas?' · pago':' · em aberto'):''}`, fats };
  if(L.qtdFat>0) return { k:'parcial', rot:`parcial: ${fmtHd(L.qtdFat)} de ${fmtHd(L.qtd)} faturadas`, fats };
  if(L.qtd<=0) return { k:'fora', rot:'zerado na ordem' };
  if(s.state==='cancel') return { k:'fora', rot:'ordem cancelada' };
  if(atrasada) return { k:'atrasada', rot:'⚠ nota atrasada — ainda não faturada' };
  return { k:'na', rot:s.state==='sale'||s.state==='done'?'na ordem · a faturar':'na cotação · não confirmada' };
}
// Notas (uma por período com previsão ou extras) de TODOS os contratos numa janela [hoje−atras, hoje+frente],
// só as que ainda não foram faturadas — a lista de quem fatura.
function pcNotasPendentes(hoje, atras, frente){
  const de=pcSomaDias(hoje,-(atras==null?31:atras)), ate=pcSomaDias(hoje,frente==null?45:frente); const out=[];
  pcLista().forEach(c=>{ let P; try{ P=pcPlanejamento(c); }catch(e){ return; }
    const yms=new Set(P.periodos.map(x=>x.ym)); pcExtras(c).forEach(x=>{ if(x&&x.ym) yms.add(x.ym); });
    [...yms].forEach(ym=>{ let per=P.periodos.find(x=>x.ym===ym); if(!per){ const Q=pcPeriodo(c,ym); per={ ...Q, iniPlano:Q.ini, fimPlano:Q.fim, horas:0, valor:0 }; }
      const ex=pcExtrasDe(c,ym); const vEx=ex.reduce((s,x)=>s+pcExtraValor(x),0); const total=Math.round(((Number(per.valor)||0)+vEx)*100)/100;
      if(!(total>0)||per.nota<de||per.nota>ate) return;
      const sts=[]; if(per.valor>0) sts.push(pcOdooStatusChave(c,'p:'+ym,per.nota,hoje)); ex.forEach(x=>sts.push(pcOdooStatusChave(c,'x:'+x.id,per.nota,hoje)));
      const fat=(s)=>s.k==='faturado'||s.k==='pago'; if(sts.length&&sts.every(fat)) return;
      out.push({ c, ym, P:per, total, horas:Number(per.horas)||0, extras:ex.length, valorExtras:vEx, st:sts.find(s=>!fat(s))||sts[0]||{ k:'sem', rot:'sem ordem de venda' }, atrasada:per.nota<hoje }); }); });
  return out.sort((a,b)=>a.P.nota.localeCompare(b.P.nota)||String(a.c.consultoria||'').localeCompare(String(b.c.consultoria||''),'pt'));
}
const pcStCls=(s)=>s.k==='pago'||s.k==='faturado'?'ok':s.k==='parcial'?'aten':(s.k==='fora'||s.k==='atrasada')?'crit':'na';
// Faixa 🧾 Próximas notas no topo da tela (todos os contratos): atrasadas + próximos 45 dias.
function pcProximasNotasHTML(lista, hoje){
  if(!(lista||[]).some(c=>pcEquipe(c).length||pcExtras(c).length)) return '';
  const notas=pcNotasPendentes(hoje,31,45); const atras=notas.filter(x=>x.atrasada).length;
  const rows=notas.slice(0,12).map(x=>{ const o=pcOdoo(x.c); const rot=o?x.st.rot:(x.atrasada?'⚠ atrasada · sem ordem no Odoo':'sem ordem no Odoo'); const cls=o?pcStCls(x.st):(x.atrasada?'crit':'na');
    return `<div class="pc-nt-row ${x.atrasada?'crit':''}"><span class="pc-nt-data"><b>${dataBR(x.P.nota)}</b></span><span class="pc-nt-txt"><b>${esc(x.c.consultoria||'')}</b> · ${esc(labelMesAbbr(x.ym))} · ${dataBR(x.P.iniPlano)} → ${dataBR(x.P.fimPlano)} · ${x.horas?fmtHd(x.horas):'—'}${x.extras?` + ${x.extras} extra(s)`:''} · <b>${fmtBRL(x.total)}</b> <span class="ct-sem ${cls}">${esc(rot)}</span></span><span class="spacer"></span><button class="btn" data-pc-ir="${escA(x.c.id)}">Ver →</button></div>`; }).join('');
  return `<div class="card full pc-notas"><h2>🧾 Próximas notas <span>todos os contratos · atrasadas e próximos 45 dias · ${notas.length?`${notas.length} nota(s)${atras?`, <b class="rp-neg">${atras} atrasada(s)</b>`:''}`:'nada pendente'}</span></h2>
    ${notas.length?`<div class="pc-nt-lista">${rows}${notas.length>12?`<div class="muted small">+ ${notas.length-12} nota(s) — abra 🧾 Faturamentos em cada contrato.</div>`:''}</div>`:'<div class="muted small">Nenhuma nota a emitir nos próximos 45 dias (nem atrasada). As notas saem da previsão de cada contrato (👥 equipe e alocação + ➕ horas extras).</div>'}
    <div class="muted small" style="margin-top:6px">Uma nota sai daqui quando o item correspondente é <b>faturado no Odoo</b> (↻ Sincronizar no contrato). "Sem ordem no Odoo" = o contrato ainda não tem ordem de venda — crie em 🧾 Faturamentos.</div></div>`;
}
// Linha-resumo do Odoo no cartão do contrato.
function pcOdooResumo(c, plan){ const o=pcOdoo(c); const E=pcOdooEstado(c);
  if(!o) return `🧾 Odoo: <span class="muted">sem ordem de venda${(plan&&plan.periodos.length)?' — crie em 🧾 Faturamentos':''}</span>`;
  const s=o.sync; const its=Object.values((s&&s.linhas)||{}); const nFat=its.filter(l=>l.qtdFat>0).length;
  return `🧾 Odoo: <a href="${escA(o.url||'#')}" target="_blank" rel="noopener noreferrer"><b>${esc(o.name||('#'+o.id))}</b> ↗</a>${s?` · ${esc(PC_ODOO_ST[s.state]||s.state||'')} · ${(o.itens||[]).length} item(ns)${nFat?`, ${nFat} faturado(s)`:''} · ${(s.faturas||[]).length} fatura(s)`:E.lendo?' · lendo…':''}${E.erro?` · <span class="rp-neg">⚠ ${esc(E.erro)}</span>`:''}`; }

// ---- catálogo do Odoo (produtos de serviço + objetos de resultado), lido uma vez por sessão ----
function pcCat(){ return (estado.parcerias&&estado.parcerias.cat)||null; }
function pcCatCarrega(forca){ const st=estado.parcerias=estado.parcerias||{}; const c=st.cat;
  if(!forca&&c&&c.em&&(Date.now()-c.em)<PC_ODOO_CAT_TTL) return; if(st.catCarregando) return;
  const id=idApontar(); if(!id){ st.cat={ em:Date.now(), produtos:[], analiticas:[], erro:'Identifique-se em ⏱ Apontar para ler o catálogo do Odoo.' }; return; }
  st.catCarregando=true;
  pcOdooFetch('odoo-catalogo',{ email:id.email, token:id.token, forca:forca?1:0 }).then(j=>{ st.catCarregando=false;
    st.cat={ em:Date.now(), produtos:(j&&j.produtos)||[], analiticas:(j&&j.analiticas)||[], analErro:(j&&j.analErro)||'', erro:(j&&j.ok)?'':((j&&j.erro)||'Não foi possível ler o catálogo do Odoo.') };
    pcReRender(); }).catch(e=>{ st.catCarregando=false; st.cat={ em:Date.now(), produtos:[], analiticas:[], erro:humanizaErro(e) }; pcReRender(); }); }
// Chamado pelo renderParcerias: lê o Odoo dos contratos com ordem (a cada 10 min) e o catálogo quando a gaveta 🧾 está aberta.
function pcOdooAoAbrir(lista){ (lista||[]).forEach(c=>{ if(pcOdoo(c)) pcOdooGaranteLeitura(c); });
  const st=estado.parcerias||{}; if(st.aba&&st.aba.qual==='fat'&&!st.cat&&souAprovador()) pcCatCarrega(false); }

// ---- ler o Odoo: estado da ordem, faturado/pago por item, faturas ----
function pcOdooLe(c, forca){ const o=pcOdoo(c); if(!o) return; const E=pcOdooEstado(c); if(E.lendo) return; E.lendo=true; E.erro='';
  pcOdooFetch('odoo-venda-status',{ id:o.id, forca:forca?1:0 }).then(j=>{ E.lendo=false;
    if(!j||!j.ok){ E.erro=(j&&j.erro)||'Não foi possível ler a ordem no Odoo.'; pcReRender(); return; }
    const antes=o.sync||null; const sync={ em:j.lidoEm||new Date().toISOString(), state:j.state||'', invoiceStatus:j.invoiceStatus||'', total:Number(j.total)||0, linhas:{}, faturas:(j.faturas||[]).map(f=>({ id:f.id, nome:f.nome||'', estado:f.estado||'', data:f.data||'', vencimento:f.vencimento||'', total:Number(f.total)||0, aberto:Number(f.aberto)||0, pagamento:f.pagamento||'' })) };
    (j.linhas||[]).forEach(l=>{ sync.linhas[l.id]={ qtd:Number(l.qtd)||0, qtdFat:Number(l.qtdFat)||0, faturas:l.faturas||[] }; });
    o.sync=sync; if(j.name) o.name=j.name; if(j.url) o.url=j.url;
    // O que mudou desde a última leitura vai para o histórico (a 1ª leitura é só a linha de base — sem alarde).
    const mud=[]; if(antes){ if(antes.state!==sync.state) mud.push(`ordem ${PC_ODOO_ST[sync.state]||sync.state}`);
      sync.faturas.forEach(f=>{ const a=(antes.faturas||[]).find(x=>x.id===f.id); if(!a) mud.push(`fatura ${f.nome} emitida${f.data?' em '+dataBR(f.data):''} (${fmtBRL(f.total)})`); else if(a.pagamento!==f.pagamento&&(f.pagamento==='paid'||f.pagamento==='in_payment')) mud.push(`fatura ${f.nome} paga`); }); }
    if(mud.length){ pcLog(c,'odoo','Odoo: '+mud.join(' · ')); toast('Odoo: '+mud.join(' · '),'ok'); }
    if(souAprovador()) salvaCfg();   // a leitura fica na config para todos verem; sem gestor, fica só nesta sessão
    pcReRender(); }).catch(e=>{ E.lendo=false; E.erro=humanizaErro(e); pcReRender(); }); }
function pcOdooGaranteLeitura(c){ const o=pcOdoo(c); if(!o) return; const E=pcOdooEstado(c); const s=o.sync; const velho=!s||!s.em||(Date.now()-Date.parse(s.em))>PC_ODOO_SYNC_TTL; if(velho&&!E.lendo&&!E.erro) pcOdooLe(c,false); }
// ---- comparar a previsão com a ordem (dry) e aplicar ----
function pcOdooCorpo(c, extra){ const id=idApontar()||{}; const o=(c.odoo&&typeof c.odoo==='object')?c.odoo:{}; const E=pcOdooEstado(c); const ov=pcOdooVendas();
  return Object.assign({ contratoId:c.id, consultoria:c.consultoria||'', cliente:c.consultoria||'', conta:c.conta||'', fatFecha:c.fatFecha||31, fatDia:c.fatDia||0, modalidade:PC_MODAL[pcModal(c)][1], obs:c.obs||'',
    ordemId:o.id||null, parceiroId:E.parceiroId||o.parceiroId||null, produtoId:ov.produtoId||o.produtoId||null, produtoExtraId:ov.produtoExtraId||o.produtoExtraId||null,
    itens:(o.itens||[]).map(x=>({ chave:x.chave, id:x.id })),
    linhas:pcLinhasOrdem(c).map(l=>({ chave:l.chave, tipo:l.tipo, mes:l.mes, de:l.de, ate:l.ate, nota:l.nota, descricao:l.descricao, qtd:l.qtd, unitario:l.unitario, rateio:l.rateio })),
    email:id.email, token:id.token }, extra||{}); }
function pcOdooConfere(c){ const id=idApontar(); if(!id){ abreIdentidade(); return; } const E=pcOdooEstado(c); if(E.ocupado) return;
  const prob=pcRateioProblemas(c); if(prob){ toast(prob,'warn'); return; }
  E.ocupado='conferindo'; E.erro=''; E.dica=''; E.plano=null; E.avisos=null; pcReRender();
  pcOdooFetch('odoo-contrato', pcOdooCorpo(c,{ dry:1 })).then(j=>{ E.ocupado='';
    if(j&&j.ok&&j.plano){ E.plano=j.plano; E.escolher=null; }
    else if(j&&Array.isArray(j.escolher)&&j.escolher.length){ E.escolher=j.escolher; }
    else { E.erro=(j&&j.erro)||'Não foi possível conferir a ordem no Odoo.'; E.dica=(j&&j.dica)||''; }
    pcReRender(); }).catch(e=>{ E.ocupado=''; E.erro=humanizaErro(e); pcReRender(); }); }
function pcOdooSincroniza(c){ if(pcOdoo(c)) pcOdooLe(c,true); pcOdooConfere(c); }
function pcOdooAplica(c){ const id=idApontar(); if(!id){ abreIdentidade(); return; } const E=pcOdooEstado(c); if(E.ocupado) return; E.ocupado='aplicando'; E.erro=''; E.dica=''; pcReRender();
  pcOdooFetch('odoo-contrato', pcOdooCorpo(c)).then(j=>{ E.ocupado='';
    if(j&&j.ok){ const novo=!pcOdoo(c); const o=(c.odoo&&typeof c.odoo==='object')?c.odoo:{};
      c.odoo=Object.assign(o,{ id:j.id, name:j.name||o.name||'', url:j.url||o.url||'', parceiroId:j.parceiroId||o.parceiroId||null, produtoId:j.produtoId||null, produtoExtraId:j.produtoExtraId||null, itens:(j.itens||[]).map(x=>({ chave:x.chave, id:x.id })), sync:null });
      if(novo){ c.odoo.em=new Date().toISOString(); c.odoo.por=id.nome||id.email; }
      const A=j.aplicado||{}; const partes=[]; if(A.criadas) partes.push(`${A.criadas} item(ns) criado(s)`); if(A.atualizadas) partes.push(`${A.atualizadas} atualizado(s)`); if(A.removidas) partes.push(`${A.removidas} apagado(s)`); if(A.zeradas) partes.push(`${A.zeradas} zerado(s)`);
      pcLog(c,'odoo',novo?`ordem de venda ${j.name||('#'+j.id)} criada no Odoo — ${A.criadas||0} item(ns), ${fmtBRL(j.total||0)}`:`ordem ${j.name||('#'+j.id)} atualizada no Odoo — ${partes.join(', ')||'nada a mudar'}`);
      (j.avisos||[]).forEach(a=>pcLog(c,'odoo','Odoo avisou: '+a));
      E.plano=null; E.escolher=null; E.parceiroId=null; E.avisos=j.avisos||[]; salvaCfg();
      toast(novo?`Ordem ${j.name||''} criada no Odoo (cotação em rascunho).`:`Ordem ${j.name||''} atualizada no Odoo${partes.length?': '+partes.join(', '):''}.`,'ok');
      pcOdooLe(c,true); pcReRender(); return; }
    if(j&&Array.isArray(j.escolher)&&j.escolher.length){ E.escolher=j.escolher; pcReRender(); return; }
    E.erro=(j&&j.erro)||'Não foi possível gravar a ordem no Odoo.'; E.dica=(j&&j.dica)||''; pcReRender(); }).catch(e=>{ E.ocupado=''; E.erro=humanizaErro(e); pcReRender(); }); }
function pcOdooCancela(c){ const o=pcOdoo(c); const id=idApontar(); if(!o) return Promise.resolve({ ok:true, sem:true });
  if(!id) return Promise.resolve({ ok:false, erro:'Identifique-se em ⏱ Apontar para cancelar a ordem no Odoo.' });
  return pcOdooFetch('odoo-contrato-cancela',{ ordemId:o.id, email:id.email, token:id.token }).catch(e=>({ ok:false, erro:humanizaErro(e) })); }
// Remover o contrato: cancela a ordem no Odoo antes; se o Odoo recusar, a pessoa decide.
function pcRemoveContrato(c){ const st=estado.parcerias=estado.parcerias||{}; const n=pcPlanosDe(c.id).length; const o=pcOdoo(c);
  if(!confirm(`Remover o contrato "${c.consultoria}"?${n?` ${n} plano(s) da Rentabilidade apontam para ele e perderão o vínculo.`:''}${o?` A ordem de venda ${o.name||('#'+o.id)} será CANCELADA no Odoo.`:''}`)) return;
  const fim=()=>{ pcPlanosDe(c.id).forEach(p=>{ p.contrato=''; }); cfg.parcerias=pcLista().filter(x=>x.id!==c.id); if(st.aba&&st.aba.id===c.id) st.aba=null; if(st.odoo) delete st.odoo[c.id]; salvaCfg(); toast(`Contrato "${c.consultoria}" removido.`,'ok'); renderParcerias(); };
  if(!o){ fim(); return; }
  const E=pcOdooEstado(c); E.ocupado='cancelando'; renderParcerias();
  pcOdooCancela(c).then(j=>{ E.ocupado='';
    if(j&&j.ok){ if(!j.sem) toast(`Ordem ${j.name||o.name||''} cancelada no Odoo.`,'ok'); fim(); return; }
    const erro=(j&&j.erro)||'Não foi possível cancelar a ordem no Odoo.';
    if(confirm(`${erro}\n\nRemover o contrato mesmo assim? A ordem ${o.name||('#'+o.id)} continua no Odoo — cancele-a lá.`)) fim(); else renderParcerias(); }); }

// ---- tela: a gaveta 🧾 Faturamentos ----
// Editor de rateio (tabela objeto × %) — usado no padrão do contrato e no modal do período.
function pcRateioEditorHTML(rt, anals, gestor, attr, attrRm){
  if(!rt.length) return gestor?'':'<div class="muted small">Sem rateio cadastrado.</div>';
  return `<div class="scroll-x"><table class="mp-tab-mini pc-rt-tab"><thead><tr><th>Objeto de resultado (conta analítica do Odoo)</th><th class="num">%</th><th></th></tr></thead><tbody>${rt.map((r,i)=>`<tr>
    <td>${gestor?`<select ${attr(i,'ac')}>${!r.ac?'<option value="" selected>— escolha —</option>':''}${anals.map(a=>`<option value="${a.id}" ${Number(r.ac)===a.id?'selected':''}>${esc(a.nome)}${a.codigo?' ('+esc(a.codigo)+')':''}</option>`).join('')}${r.ac&&!anals.some(a=>a.id===Number(r.ac))?`<option value="${escA(String(r.ac))}" selected>${esc(r.nome||('#'+r.ac))}</option>`:''}</select>`:esc(r.nome||('#'+r.ac))}</td>
    <td class="num">${gestor?`<input type="number" min="0" max="100" step="0.01" ${attr(i,'pct')} value="${escA(String(r.pct==null?'':r.pct))}" style="width:76px">`:`${esc(String(r.pct))}%`}</td>
    <td>${gestor?`<button class="btn rt-step" ${attrRm(i)} data-tip="Tirar este objeto">🗑</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
}
function pcPlanoHTML(c, pl, gestor, ocupado){
  const n=(pl.criar||[]).length+(pl.atualizar||[]).length+(pl.remover||[]).length;
  const li=(x,extra)=>`<li>${esc(x.descricao||x.chave)} — ${fmtHd(x.qtd)} × ${fmtBRL(x.unitario)} = <b>${fmtBRL(x.valor!=null?x.valor:Math.round(x.qtd*x.unitario*100)/100)}</b>${extra||''}</li>`;
  const bloco=(rot,arr,f)=>(arr&&arr.length)?`<div><b>${rot} (${arr.length})</b><ul>${arr.map(f).join('')}</ul></div>`:'';
  const rateioTxt=(x)=>(x.rateio&&x.rateio.length)?` <span class="muted small">🎯 ${esc(x.rateio.map(r=>`${r.pct}% ${pcNomeAnalitica(r.ac)}`).join(' · '))}</span>`:'';
  const botoes=gestor?`<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario" data-pc-odoo-aplicar="${escA(c.id)}" ${ocupado?'disabled':''}>${ocupado==='aplicando'?'⏳ Gravando no Odoo…':(pl.novo?'✅ Criar a ordem no Odoo':`✅ Aplicar ${n} alteração(ões) no Odoo`)}</button><button class="btn" data-pc-odoo-descartar="${escA(c.id)}">descartar</button></div>`:'';
  if(pl.novo) return `<div class="aviso pc-plano">📤 <b>Vai criar a ordem de venda</b> no cliente <b>${esc(pl.parceiroNome||c.consultoria||'')}</b> com ${(pl.criar||[]).length} item(ns) — total <b>${fmtBRL(pl.total||0)}</b> (cotação em rascunho; nada é confirmado no Odoo).
    ${bloco('Itens',pl.criar,x=>li(x,rateioTxt(x)))}${botoes}</div>`;
  if(!n) return `<div class="aviso ok pc-plano">✓ A ordem <b>${esc(pl.name||'')}</b> está em dia com a previsão (${pl.iguais||0} item(ns) iguais${(pl.mantidas||[]).length?`, ${pl.mantidas.length} já faturado(s)`:''}${(pl.manuais||[]).length?`, ${pl.manuais.length} item(ns) criado(s) à mão no Odoo`:''}). <button class="btn rt-step" data-pc-odoo-descartar="${escA(c.id)}">ok</button></div>`;
  const rascunho=pl.state==='draft'||pl.state==='sent';
  return `<div class="aviso pc-plano">📤 <b>O que muda no Odoo</b> (ordem ${esc(pl.name||'')}, ${esc(PC_ODOO_ST[pl.state]||pl.state||'')}): ${n} alteração(ões) — confira e aplique.
    ${bloco('Criar',pl.criar,x=>li(x,rateioTxt(x)))}
    ${bloco('Atualizar',pl.atualizar,x=>{ const era=x.de?` <span class="muted small">(era ${fmtHd(x.de.qtd)} × ${fmtBRL(x.de.unitario)})</span>`:''; const tr=x.travada?` <span class="rp-neg small">mantém ${fmtHd(x.travada)} já faturadas</span>`:''; return li(x,era+tr+rateioTxt(x)); })}
    ${bloco(rascunho?'Apagar (saíram da previsão)':'Zerar (saíram da previsão — ordem confirmada não deixa apagar)',pl.remover,x=>li(x))}
    ${bloco('Mantidos (já faturados — o painel não mexe)',pl.mantidas,x=>li(x,x.motivo?` <span class="muted small">${esc(x.motivo)}</span>`:''))}
    ${bloco('Criados à mão no Odoo (ficam como estão)',pl.manuais,x=>li(x))}
    ${botoes}</div>`;
}
function pcNomeAnalitica(ac){ const cat=pcCat(); const a=cat&&(cat.analiticas||[]).find(x=>x.id===Number(ac)); return a?a.nome:('#'+ac); }
function pcFaturamentosHTML(c, gestor, plan, hoje){
  const P=plan||pcPlanejamento(c); const o=pcOdoo(c); const E=pcOdooEstado(c); const linhas=pcLinhasOrdem(c,P); const total=Math.round(linhas.reduce((s,l)=>s+l.valor,0)*100)/100;
  const cat=pcCat(); const anals=(cat&&cat.analiticas)||[]; const prods=(cat&&cat.produtos)||[]; const ocupado=E.ocupado; const st=estado.parcerias||{};
  // ---- cabeçalho do Odoo ----
  let cab;
  if(o){ const s=o.sync;
    cab=`<div class="aviso ok pc-odoo-h">🧾 Ordem de venda no Odoo: <a href="${escA(o.url||'#')}" target="_blank" rel="noopener noreferrer"><b>${esc(o.name||('#'+o.id))}</b> ↗</a> criada em ${dataBR((o.em||'').slice(0,10))}${o.por?` por ${esc(o.por)}`:''}${s?` · <b>${esc(PC_ODOO_ST[s.state]||s.state||'')}</b> · ${fmtBRL(s.total||0)} · ${(s.faturas||[]).length} fatura(s) · lido ${esc(pcQuando(s.em))}`:''}
      <button class="btn rt-step" data-pc-odoo-sync="${escA(c.id)}" ${ocupado||E.lendo?'disabled':''}>${E.lendo?'⏳ Lendo o Odoo…':ocupado==='conferindo'?'⏳ Conferindo…':ocupado==='cancelando'?'⏳ Cancelando…':'↻ Sincronizar com o Odoo'}</button>${gestor?`<button class="btn rt-step" data-pc-odoo-esquecer="${escA(c.id)}" data-tip="Esquece o vínculo (a ordem continua no Odoo) para poder criar outra">esquecer vínculo</button>`:''}
      ${s&&(s.faturas||[]).length?`<div class="small rp-fats">${s.faturas.map(f=>{ const paga=f.pagamento==='paid'||f.pagamento==='in_payment'; return `<span class="ct-sem ${paga?'ok':'aten'}" data-tip="${escA(`${f.estado==='posted'?'lançada':f.estado} · vence ${f.vencimento?dataBR(f.vencimento):'—'} · em aberto ${fmtBRL(f.aberto)}`)}">${esc(f.nome)} · ${f.data?dataBR(f.data):'—'} · ${fmtBRL(f.total)} · ${f.pagamento==='paid'?'paga':f.pagamento==='in_payment'?'em pagamento':f.pagamento==='partial'?'parcial':'em aberto'}</span>`; }).join(' ')}</div>`:''}
      <div class="muted small">↻ lê o que já foi faturado/pago de cada item e compara a previsão com a ordem: o que mudou aparece abaixo e só vai para o Odoo depois de você clicar em <b>Aplicar</b>.</div></div>`;
  } else {
    cab=`<div class="aviso pc-odoo-h">🧾 Este contrato ainda <b>não tem ordem de venda no Odoo</b>.${gestor?` <button class="btn primario" data-pc-odoo-sync="${escA(c.id)}" ${ocupado||!linhas.length?'disabled':''} data-tip="Monta a ordem (cotação em rascunho, nada é confirmado) com um item por período e um por hora extra — você confere a lista antes de criar">${ocupado==='conferindo'?'⏳ Montando…':`🧾 Criar ordem de venda no Odoo — ${linhas.length} item(ns), ${fmtBRL(total)}`}</button> <span class="muted small">cliente <b>${esc(c.consultoria||'(informe a consultoria)')}</b>${!linhas.length?' · ainda sem previsão: aloque a equipe ou lance horas extras':''}</span>`:' <span class="muted small">Só gestores criam a ordem.</span>'}</div>`;
  }
  const erro=E.erro?`<div class="aviso err">⚠ ${esc(E.erro)}${E.dica?`<div class="muted small">${esc(E.dica)}</div>`:''}</div>`:'';
  const escolher=(E.escolher&&E.escolher.length)?`<div class="aviso">Mais de um cliente no Odoo parece com <b>${esc(c.consultoria||'')}</b> — escolha: <select data-pc-odoo-parc="${escA(c.id)}">${E.escolher.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select> <button class="btn primario" data-pc-odoo-parc-ok="${escA(c.id)}">Usar este cliente</button></div>`:'';
  const plano=E.plano?pcPlanoHTML(c,E.plano,gestor,ocupado):'';
  const avisos=(E.avisos&&E.avisos.length)?`<div class="aviso">⚠ O Odoo avisou: ${E.avisos.map(esc).join(' · ')}</div>`:'';
  // ---- a grade: uma linha por período (+ sub-linhas das horas extras) ----
  const yms=[...new Set(P.periodos.map(x=>x.ym).concat(pcExtras(c).map(x=>x&&x.ym).filter(Boolean)))].sort();
  const rows=yms.map(ym=>{ let per=P.periodos.find(p=>p.ym===ym); if(!per){ const Q=pcPeriodo(c,ym); per={ ...Q, iniPlano:Q.ini, fimPlano:Q.fim, horas:0, valor:0, manH:false, manV:false }; }
    const ex=pcExtrasDe(c,ym); const vEx=ex.reduce((s,e)=>s+pcExtraValor(e),0); const tot=Math.round(((Number(per.valor)||0)+vEx)*100)/100; if(!(tot>0)) return '';
    const stP=per.valor>0?pcOdooStatusChave(c,'p:'+ym,per.nota,hoje):null; const proprio=pcRateioDe(c,ym); const rEf=pcRateioEfetivo(c,ym); const atual=per.iniPlano<=hoje&&hoje<=per.fimPlano;
    const linha=`<tr class="${atual?'rm-destaque':''}" data-pc-fat-ym="${escA(ym)}"><td><b>${esc(labelMesAbbr(ym))}</b>${per.ajustado?' <span class="muted small" data-tip="datas ajustadas neste mês">✎</span>':''}</td><td>${dataBR(per.iniPlano)} → ${dataBR(per.fimPlano)}</td>
      <td class="num">${per.horas>0?fmtHd(per.horas):'—'}${per.manH?' <span class="pc-man-selo" data-tip="horas ajustadas à mão">✎</span>':''}</td><td class="num">${per.valor>0?fmtBRL(per.valor):'—'}${per.manV?' <span class="pc-man-selo" data-tip="valor ajustado à mão">✎</span>':''}</td>
      <td class="num">${vEx>0?`${fmtBRL(vEx)} <span class="muted small">(${ex.length})</span>`:'—'}</td><td class="num"><b>${fmtBRL(tot)}</b></td>
      <td class="small">${esc(pcRateioRot(rEf))}${proprio?' <span class="muted small" data-tip="este período tem rateio próprio, diferente do padrão do contrato">(próprio)</span>':''}${gestor?` <button class="btn rt-step" data-pc-rt-per="${escA(c.id)}|${escA(ym)}" data-tip="Rateio só deste período">✎</button>`:''}</td>
      <td class="muted small">${dataBR(per.nota)}</td><td>${stP?`<span class="ct-sem ${pcStCls(stP)}">${esc(stP.rot)}</span>`:'<span class="muted small">só extras</span>'}</td></tr>`;
    const sub=ex.map(e=>{ const se=pcOdooStatusChave(c,'x:'+e.id,per.nota,hoje); return `<tr class="pc-xt-row"><td></td><td class="small">↳ ➕ ${esc(e.desc||'horas extras')}${e.proj?` <span class="muted small">${esc(e.proj)}</span>`:''}${e.quem?` <span class="muted small">· ${esc(e.quem)}</span>`:''}</td><td class="num">${fmtHd(Number(e.h)||0)}</td><td class="num muted small">× ${fmtBRL(Number(e.vh)||0)}</td><td class="num">${fmtBRL(pcExtraValor(e))}</td><td></td><td class="small">${esc(e.ac?`100% ${e.acNome||('#'+e.ac)}`:pcRateioRot(rEf))}</td><td></td><td><span class="ct-sem ${pcStCls(se)}">${esc(se.rot)}</span></td></tr>`; }).join('');
    return linha+sub; }).join('');
  const totEx=Math.round(pcExtras(c).reduce((s,e)=>s+pcExtraValor(e),0)*100)/100;
  const grade=rows?`<div class="scroll-x"><table class="mp-tab-mini pc-fat-tab"><thead><tr><th>Mês</th><th>Período</th><th class="num">Horas</th><th class="num">Valor</th><th class="num">Extras</th><th class="num">Total da nota</th><th>🎯 Objeto(s) de resultado</th><th>Nota</th><th>Odoo</th></tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td colspan="2"><b>Total</b></td><td class="num"><b>${fmtHd(P.totalH)}</b></td><td class="num"><b>${fmtBRL(P.totalV)}</b></td><td class="num"><b>${fmtBRL(totEx)}</b></td><td class="num"><b>${fmtBRL(Math.round((P.totalV+totEx)*100)/100)}</b></td><td colspan="3"></td></tr></tfoot></table></div>`
    :`<div class="estado">Nenhuma nota prevista ainda — aloque a equipe em <b>👥 Equipe e alocação</b> ou lance <b>➕ horas extras</b> abaixo.</div>`;
  // ---- ➕ horas extras ----
  const per12=pcPeriodosOpcoes(c,hoje); const projs=(typeof projNomes==='function')?Object.keys(projNomes()).sort():[];
  const exRows=pcExtras(c).slice().sort((a,b)=>String(a.ym).localeCompare(String(b.ym))).map(e=>`<tr data-pc-xt-row="${escA(e.id)}">
    <td>${gestor?`<select data-pc-xt="${escA(c.id)}|${escA(e.id)}|ym">${per12.map(ym=>`<option value="${ym}" ${e.ym===ym?'selected':''}>${esc(labelMesAbbr(ym))}</option>`).join('')}${per12.includes(e.ym)?'':`<option value="${escA(e.ym)}" selected>${esc(labelMesAbbr(e.ym))}</option>`}</select>`:esc(labelMesAbbr(e.ym))}</td>
    <td>${gestor?`<input type="text" data-pc-xt="${escA(c.id)}|${escA(e.id)}|desc" value="${escA(e.desc||'')}" placeholder="o que foi feito (ex.: suporte ao go-live)" style="min-width:200px">`:esc(e.desc||'')}</td>
    <td>${gestor?`<input type="number" min="0" step="0.5" data-pc-xt="${escA(c.id)}|${escA(e.id)}|h" value="${escA(String(e.h||''))}" style="width:72px" aria-label="Horas extras">`:fmtHd(Number(e.h)||0)}</td>
    <td>${gestor?`<input type="number" min="0" step="0.01" data-pc-xt="${escA(c.id)}|${escA(e.id)}|vh" value="${escA(String(e.vh||''))}" style="width:92px" aria-label="Valor-hora da extra">`:fmtBRL(Number(e.vh)||0)}</td>
    <td class="num"><b>${fmtBRL(pcExtraValor(e))}</b></td>
    <td>${gestor?`<input type="text" list="pc-xt-projs" data-pc-xt="${escA(c.id)}|${escA(e.id)}|proj" value="${escA(e.proj||'')}" placeholder="projeto (opcional)" style="width:110px">`:esc(e.proj||'')}</td>
    <td>${gestor?`<select data-pc-xt="${escA(c.id)}|${escA(e.id)}|ac"><option value="">= rateio do período</option>${anals.map(a=>`<option value="${a.id}" ${Number(e.ac)===a.id?'selected':''}>${esc(a.nome)}</option>`).join('')}${e.ac&&!anals.some(a=>a.id===Number(e.ac))?`<option value="${escA(String(e.ac))}" selected>${esc(e.acNome||('#'+e.ac))}</option>`:''}</select>`:esc(e.ac?(e.acNome||('#'+e.ac)):'rateio do período')}</td>
    <td>${gestor?`<input type="text" data-pc-xt="${escA(c.id)}|${escA(e.id)}|quem" value="${escA(e.quem||'')}" placeholder="quem fez" style="width:120px">`:esc(e.quem||'')}</td>
    <td>${gestor?`<button class="btn rt-step" data-pc-xt-rm="${escA(c.id)}|${escA(e.id)}" data-tip="Apagar este lançamento (sai da ordem na próxima sincronização)">🗑</button>`:''}</td></tr>`).join('');
  const extras=`<div class="mp-h3" style="margin-top:14px">➕ Horas extras <span class="mp-dim">esporádicas — cada lançamento é um item separado na ordem de venda, com o seu objeto de resultado</span></div>
    ${pcExtras(c).length?`<div class="scroll-x"><table class="mp-tab-mini pc-xt-tab"><thead><tr><th>Período</th><th>Descrição</th><th>Horas</th><th>Valor-hora</th><th class="num">Valor</th><th>Projeto</th><th>🎯 Objeto de resultado</th><th>Quem</th><th></th></tr></thead><tbody>${exRows}</tbody></table></div><datalist id="pc-xt-projs">${projs.map(k=>`<option value="${escA(k)}"></option>`).join('')}</datalist>`
      :'<div class="muted small">Nenhuma hora extra lançada neste contrato.</div>'}
    ${gestor?`<div style="margin-top:6px"><button class="btn" data-pc-xt-add="${escA(c.id)}">➕ Lançar horas extras</button> <span class="muted small">entra na nota do período escolhido (valor-hora do contrato por padrão) e vai ao Odoo como item próprio no próximo ↻ Sincronizar.</span></div>`:''}`;
  // ---- 🎯 rateio padrão ----
  const rt=pcRateio(c); const soma=pcRateioSoma(rt);
  const catBtn=st.catCarregando?'<span class="muted small">⏳ lendo o catálogo do Odoo…</span>':(cat&&cat.em)?`<span class="muted small">${anals.length} objeto(s) do Odoo${cat.analErro?' · <span class="rp-neg">'+esc(cat.analErro)+'</span>':''}</span> <button class="btn rt-step" data-pc-cat="${escA(c.id)}" data-tip="Reler produtos e objetos de resultado do Odoo">↻ catálogo</button>`:`<button class="btn rt-step" data-pc-cat="${escA(c.id)}">📥 Carregar objetos de resultado do Odoo</button>`;
  const rateio=`<div class="mp-h3" style="margin-top:14px">🎯 Objetos de resultado <span class="mp-dim">rateio padrão de cada nota (ex.: 90% Sumitomo · 10% Hi-Mix) — vai como distribuição analítica de cada item no Odoo</span></div>
    ${pcRateioEditorHTML(rt, anals, gestor, (i,campo)=>`data-pc-rt="${escA(c.id)}|${i}|${campo}"`, (i)=>`data-pc-rt-rm="${escA(c.id)}|${i}"`)}
    ${gestor?`<div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn" data-pc-rt-add="${escA(c.id)}" ${anals.length?'':'disabled'}>＋ objeto de resultado</button>
      ${rt.length?`<span class="ct-sem ${pcRateioOk(rt)?'ok':'crit'}">${pcRateioOk(rt)?'✓ fecha 100%':`soma ${soma}% — precisa fechar 100%`}</span>`:'<span class="muted small">sem rateio: o item vai sem distribuição analítica (padrão do Odoo)</span>'}
      ${catBtn}${cat&&cat.erro?`<span class="rp-neg small">⚠ ${esc(cat.erro)}</span>`:''}</div>`:(rt.length?'':'')}`;
  // ---- ⚙ produtos ----
  const ov=pcOdooVendas();
  const pSel=(campo,val,nomeSalvo,rot,vazio)=>`<div class="campo"><label>${rot}</label><select data-pc-prod="${escA(campo)}"><option value="">${vazio}</option>${prods.map(p=>`<option value="${p.id}" ${Number(val)===p.id?'selected':''}>${esc(p.nome)}${p.ref?' ('+esc(p.ref)+')':''}</option>`).join('')}${val&&!prods.some(p=>p.id===Number(val))?`<option value="${escA(String(val))}" selected>${esc(nomeSalvo||('#'+val))}</option>`:''}</select></div>`;
  const produtos=gestor?`<div class="mp-h3" style="margin-top:14px">⚙ Produtos no Odoo <span class="mp-dim">com que produto cada item nasce na ordem — "horas de consultoria" nos períodos e o das horas extras</span></div>
    <div class="ap-filtros">${pSel('produtoId',ov.produtoId,ov.produtoNome,'Horas de consultoria (períodos)','— automático (1º produto de serviço à venda) —')}${pSel('produtoExtraId',ov.produtoExtraId,ov.produtoExtraNome,'Horas extras','— o mesmo das horas de consultoria —')}</div>
    <div class="muted small">Vale para os itens NOVOS (os que já existem na ordem mantêm o produto) e para todos os contratos.${prods.length?'':' Carregue o catálogo do Odoo (acima) para escolher.'}</div>`:'';
  return `<div class="pc-cal pc-fat"><div class="mp-h3">🧾 Faturamentos <span class="mp-dim">cada período de faturamento é um item da ordem de venda no Odoo; hora extra é item à parte; o rateio diz para qual objeto de resultado vai cada nota</span></div>
    ${cab}${erro}${escolher}${avisos}${plano}${grade}${extras}${rateio}${produtos}
    <div class="muted small" style="margin-top:8px">Horas e valor de cada período vêm de <b>👥 Equipe e alocação</b> (inclusive o ✎ ajuste manual). Um item já <b>faturado</b> no Odoo nunca é alterado pelo painel; o que sai da previsão é apagado da cotação ou <b>zerado</b> na ordem confirmada. A nota só sai de 🧾 Próximas notas quando o item é faturado no Odoo.</div></div>`;
}
// Modal: rateio próprio de UM período.
function pcAbreRateioPeriodo(c, ym){ const st=estado.parcerias; st.rtModal={ id:c.id, ym, r:JSON.parse(JSON.stringify(pcRateioDe(c,ym)||pcRateio(c))) }; pcPintaRateioModal(); }
function pcPintaRateioModal(){ const st=estado.parcerias; const m=st&&st.rtModal; if(!m) return; const c=pcDe(m.id); if(!c) return; const anals=((pcCat()||{}).analiticas)||[]; const proprio=!!pcRateioDe(c,m.ym);
  abreModal(`<h3>🎯 Rateio de ${esc(labelMesAbbr(m.ym))} — ${esc(c.consultoria||'')}</h3>
    <div class="muted small">Este período usa ${proprio?'um rateio <b>próprio</b>':'o <b>rateio padrão</b> do contrato'} (${esc(pcRateioRot(pcRateioEfetivo(c,m.ym)))}). Ajuste abaixo para valer só neste período — ex.: um mês em que 100% foi para outro projeto.</div>
    ${pcRateioEditorHTML(m.r, anals, true, (i,campo)=>`data-pc-rtm="${i}|${campo}"`, (i)=>`data-pc-rtm-rm="${i}"`)}
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center"><button class="btn" data-pc-rtm-add="1" ${anals.length?'':'disabled'}>＋ objeto</button>${m.r.length?`<span class="ct-sem ${pcRateioOk(m.r)?'ok':'crit'}">${pcRateioOk(m.r)?'✓ fecha 100%':'soma '+pcRateioSoma(m.r)+'%'}</span>`:''}${anals.length?'':'<span class="muted small">carregue o catálogo do Odoo em 🧾 Faturamentos</span>'}</div>
    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"><button class="btn primario" data-pc-rtm-ok="1">Salvar para ${esc(labelMesAbbr(m.ym))}</button>${proprio?'<button class="btn" data-pc-rtm-padrao="1">Voltar ao padrão do contrato</button>':''}<button class="btn" data-pc-rtm-fechar="1">Cancelar</button></div>`); }
function pcRateioLeModal(){ const m=estado.parcerias&&estado.parcerias.rtModal; if(!m) return; const anals=((pcCat()||{}).analiticas)||[];
  document.querySelectorAll('#modal-body [data-pc-rtm]').forEach(e=>{ const [i,campo]=e.getAttribute('data-pc-rtm').split('|'); const r=m.r[+i]; if(!r) return;
    if(campo==='ac'){ r.ac=Number(e.value)||0; const a=anals.find(x=>x.id===r.ac); r.nome=a?a.nome:(r.ac?r.nome||'':''); } else r.pct=Math.max(0,Math.min(100,Number(e.value)||0)); }); }

// ---- listeners delegados desta gaveta ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='parcerias') return; const st=estado.parcerias=estado.parcerias||{}; const gestor=souAprovador();
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-pc-ir')){ const id=t.getAttribute('data-pc-ir'); st.aba={ id, qual:'fat' }; st.destaque=id; renderParcerias(); return; }
  if(t.hasAttribute('data-pc-odoo-sync')){ const c=pcDe(t.getAttribute('data-pc-odoo-sync')); if(!c) return; if(!pcOdoo(c)&&!gestor) return; pcOdooSincroniza(c); return; }
  if(t.hasAttribute('data-pc-odoo-descartar')){ const c=pcDe(t.getAttribute('data-pc-odoo-descartar')); if(!c) return; const E=pcOdooEstado(c); E.plano=null; E.escolher=null; E.erro=''; E.dica=''; E.avisos=null; renderParcerias(); return; }
  if(t.hasAttribute('data-pc-cat')){ pcCatCarrega(true); renderParcerias(); return; }
  if(!gestor) return;
  if(t.hasAttribute('data-pc-odoo-aplicar')){ const c=pcDe(t.getAttribute('data-pc-odoo-aplicar')); if(c) pcOdooAplica(c); return; }
  if(t.hasAttribute('data-pc-odoo-parc-ok')){ const c=pcDe(t.getAttribute('data-pc-odoo-parc-ok')); const sel=document.querySelector(`[data-pc-odoo-parc="${c&&c.id}"]`); if(!c||!sel) return; const E=pcOdooEstado(c); E.parceiroId=Number(sel.value)||null; E.escolher=null; pcOdooConfere(c); return; }
  if(t.hasAttribute('data-pc-odoo-esquecer')){ const c=pcDe(t.getAttribute('data-pc-odoo-esquecer')); if(!c||!pcOdoo(c)) return; if(!confirm('Esquecer o vínculo com a ordem de venda do Odoo? (ela continua existindo lá)')) return;
    const nome=c.odoo.name||('#'+c.odoo.id); c.odoo=null; delete (st.odoo||{})[c.id]; pcLog(c,'odoo',`vínculo com a ordem ${nome} esquecido`); salvaCfg(); renderParcerias(); return; }
  // ➕ horas extras
  if(t.hasAttribute('data-pc-xt-add')){ const c=pcDe(t.getAttribute('data-pc-xt-add')); if(!c) return; const hoje=hojeSP(); const ym=pcFechamento(c,hoje.slice(0,7))<hoje?pcYmSoma(hoje.slice(0,7),1):hoje.slice(0,7);
    const x=pcExtraNovo(c,ym); pcExtras(c).push(x); pcLog(c,'extras',`horas extras lançadas em ${labelMesAbbr(ym)} (preencha horas e descrição)`); salvaCfg(); st.aba={ id:c.id, qual:'fat' }; renderParcerias();
    const inp=document.querySelector(`[data-pc-xt="${c.id}|${x.id}|h"]`); if(inp){ try{ inp.focus(); }catch(e2){} } return; }
  if(t.hasAttribute('data-pc-xt-rm')){ const [id,xid]=t.getAttribute('data-pc-xt-rm').split('|'); const c=pcDe(id); if(!c) return; const x=pcExtras(c).find(y=>y.id===xid); if(!x) return;
    if(!confirm(`Apagar as horas extras "${x.desc||labelMesAbbr(x.ym)}" (${fmtHd(Number(x.h)||0)})?${pcOdooItem(c,'x:'+xid)?' O item sai da ordem no próximo ↻ Sincronizar.':''}`)) return;
    c.extras=pcExtras(c).filter(y=>y.id!==xid); pcLog(c,'extras',`horas extras apagadas: ${x.desc||labelMesAbbr(x.ym)} · ${fmtHd(Number(x.h)||0)}`); salvaCfg(); renderParcerias(); return; }
  // 🎯 rateio padrão
  if(t.hasAttribute('data-pc-rt-add')){ const c=pcDe(t.getAttribute('data-pc-rt-add')); if(!c) return; const rt=pcRateio(c); const resto=Math.max(0,Math.round((100-pcRateioSoma(rt))*100)/100);
    rt.push({ ac:0, nome:'', pct:rt.length?resto:100 }); salvaCfg(); renderParcerias(); const sel=document.querySelector(`[data-pc-rt="${c.id}|${rt.length-1}|ac"]`); if(sel){ try{ sel.focus(); }catch(e2){} } return; }
  if(t.hasAttribute('data-pc-rt-rm')){ const [id,i]=t.getAttribute('data-pc-rt-rm').split('|'); const c=pcDe(id); if(!c) return; const rt=pcRateio(c); const r=rt[+i]; if(!r) return;
    rt.splice(+i,1); pcLog(c,'rateio',`objeto de resultado removido do rateio padrão: ${r.nome||('#'+r.ac)}`); salvaCfg(); renderParcerias(); return; }
  if(t.hasAttribute('data-pc-rt-per')){ const [id,ym]=t.getAttribute('data-pc-rt-per').split('|'); const c=pcDe(id); if(!c) return; if(!pcCat()) pcCatCarrega(false); pcAbreRateioPeriodo(c,ym); return; }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='parcerias') return; const t=e.target; if(!t||!t.hasAttribute||!souAprovador()) return;
  // ➕ hora extra: período, descrição, horas, valor-hora, projeto, objeto de resultado, quem
  if(t.hasAttribute('data-pc-xt')){ const [id,xid,campo]=t.getAttribute('data-pc-xt').split('|'); const c=pcDe(id); if(!c) return; const x=pcExtras(c).find(y=>y.id===xid); if(!x) return; const val=String(t.value||'').trim();
    if(campo==='ym'){ if(!/^\d{4}-\d{2}$/.test(val)){ renderParcerias(); return; } x.ym=val; }
    else if(campo==='h') x.h=Math.max(0,Math.round((Number(val)||0)*100)/100);
    else if(campo==='vh') x.vh=Math.max(0,Math.round((Number(val)||0)*100)/100);
    else if(campo==='desc') x.desc=val.slice(0,120);
    else if(campo==='proj') x.proj=val.slice(0,20).toUpperCase();
    else if(campo==='quem') x.quem=val.slice(0,80);
    else if(campo==='ac'){ x.ac=Number(val)||0; const a=(((pcCat()||{}).analiticas)||[]).find(y=>y.id===x.ac); x.acNome=a?a.nome:(x.ac?x.acNome||'':''); }
    pcLog(c,'extras',`horas extras ${labelMesAbbr(x.ym)}: ${x.desc||'(sem descrição)'} · ${fmtHd(Number(x.h)||0)} × ${fmtBRL(Number(x.vh)||0)}${x.ac?' · '+(x.acNome||('#'+x.ac)):''}`); salvaCfg();
    const cel=t.closest('tr')&&t.closest('tr').querySelector('td.num b'); if(cel) cel.textContent=fmtBRL(pcExtraValor(x));   // o valor da linha responde na hora; o resto redesenha ao sair da tabela
    pcAdiaRender(); return; }
  // 🎯 rateio padrão do contrato
  if(t.hasAttribute('data-pc-rt')){ const [id,i,campo]=t.getAttribute('data-pc-rt').split('|'); const c=pcDe(id); if(!c) return; const r=pcRateio(c)[+i]; if(!r) return;
    if(campo==='ac'){ r.ac=Number(t.value)||0; const a=(((pcCat()||{}).analiticas)||[]).find(y=>y.id===r.ac); r.nome=a?a.nome:(r.ac?r.nome||'':''); } else r.pct=Math.max(0,Math.min(100,Math.round((Number(t.value)||0)*100)/100));
    pcLog(c,'rateio',`rateio padrão: ${pcRateioRot(pcRateio(c))}`); salvaCfg(); pcAdiaRender(); return; }
  // ⚙ produtos do Odoo (padrão do painel)
  if(t.hasAttribute('data-pc-prod')){ const campo=t.getAttribute('data-pc-prod'); if(campo!=='produtoId'&&campo!=='produtoExtraId') return; const ov=pcOdooVendas(); const id=Number(t.value)||null;
    const p=(((pcCat()||{}).produtos)||[]).find(x=>x.id===id); ov[campo]=id; ov[campo==='produtoId'?'produtoNome':'produtoExtraNome']=p?p.nome:''; salvaCfg(); toast(id?`Produto "${p?p.nome:id}" será usado nos itens novos.`:'Produto de volta ao automático.','ok'); renderParcerias(); return; }
});
// Modal do rateio por período.
document.getElementById('modal-body').addEventListener('click',(e)=>{
  if(estado.vista!=='parcerias') return; const st=estado.parcerias||{}; const m=st.rtModal; if(!m) return; const t=e.target.closest&&e.target.closest('button'); if(!t) return; const c=pcDe(m.id); if(!c||!souAprovador()) return;
  if(t.hasAttribute('data-pc-rtm-fechar')){ st.rtModal=null; fechaModal(); return; }
  if(t.hasAttribute('data-pc-rtm-add')){ pcRateioLeModal(); const resto=Math.max(0,Math.round((100-pcRateioSoma(m.r))*100)/100); m.r.push({ ac:0, nome:'', pct:m.r.length?resto:100 }); pcPintaRateioModal(); return; }
  if(t.hasAttribute('data-pc-rtm-rm')){ pcRateioLeModal(); m.r.splice(+t.getAttribute('data-pc-rtm-rm'),1); pcPintaRateioModal(); return; }
  if(t.hasAttribute('data-pc-rtm-padrao')){ delete pcRateios(c)[m.ym]; pcLog(c,'rateio',`${labelMesAbbr(m.ym)}: rateio de volta ao padrão do contrato`); st.rtModal=null; salvaCfg(); fechaModal(); renderParcerias(); return; }
  if(t.hasAttribute('data-pc-rtm-ok')){ pcRateioLeModal(); const r=m.r.filter(x=>x.ac>0&&x.pct>0); if(r.length&&!pcRateioOk(r)){ toast(`O rateio soma ${pcRateioSoma(r)}% — precisa fechar 100%.`,'warn'); return; }
    if(r.length) pcRateios(c)[m.ym]=r; else delete pcRateios(c)[m.ym];
    pcLog(c,'rateio',`${labelMesAbbr(m.ym)}: rateio ${r.length?pcRateioRot(r):'de volta ao padrão do contrato'}`); st.rtModal=null; salvaCfg(); fechaModal(); renderParcerias(); return; }
});
document.getElementById('modal-body').addEventListener('change',(e)=>{ if(estado.vista!=='parcerias'||!(estado.parcerias&&estado.parcerias.rtModal)) return; const t=e.target; if(t&&t.hasAttribute&&t.hasAttribute('data-pc-rtm')){ pcRateioLeModal(); pcPintaRateioModal(); } });
