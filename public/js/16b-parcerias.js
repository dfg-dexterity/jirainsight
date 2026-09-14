// Jira Insights · 16b · 🤝 CONTRATOS DE PARCERIA — cadastro dos contratos com as consultorias parceiras
// (quem contrata a Dexterity), pedido de 2026-09-13.
// ===========================================================================
// Cada contrato guarda: a CONSULTORIA, a MODALIDADE (⏱ horas abertas · 🛠️ atendimento AMS · 📦 demanda com
// horas fechadas), a VALIDADE (início/fim), o VALOR DA HORA negociada, o PERÍODO DE AVISO (dias de aviso
// prévio para encerrar/renovar), o PERÍODO DE FATURAMENTO — o dia em que o período fecha ("até o dia 25")
// e o DIA DA NOTA — ambos AJUSTÁVEIS MÊS A MÊS (cfg.parcerias[].ajustes['AAAA-MM']) — e a CONTA BANCÁRIA de
// recebimento. Tudo mora em cfg.parcerias (config compartilhada); gestores editam, os demais leem.
// A 💹 Rentabilidade liga cada plano de horas abertas a um contrato: cliente e valor-hora vêm dele e a receita
// prevista é quebrada nos PERÍODOS DE FATURAMENTO do contrato — um item da ordem de venda no Odoo por período.
// Regra do período: o período do mês M vai do dia seguinte ao fechamento de M−1 até o fechamento de M; a nota
// sai no "dia da nota" do próprio mês (se ≥ fechamento) ou do mês seguinte (se < fechamento).
// Helpers de outros módulos (souAprovador, salvaCfg, ehUtil/ehFeriado, rpPlanos…) só em tempo de render.
// ===========================================================================
const PC_MODAL={ horas:['⏱','Horas abertas','o cliente paga as horas trabalhadas ao valor-hora negociado, por período de faturamento'],
  ams:['🛠️','Atendimento AMS','pacote de horas por ciclo (a apuração do banco de horas fica na aba AMS / Contratos do Admin)'],
  fechado:['📦','Demanda com horas fechadas','escopo e horas fechados por demanda; o valor-hora é a referência para precificar'] };
function pcLista(){ if(!Array.isArray(cfg.parcerias)) cfg.parcerias=[]; return cfg.parcerias; }
function pcDe(id){ return id?pcLista().find(c=>c&&c.id===id)||null:null; }
function pcModal(c){ return PC_MODAL[c&&c.modalidade]?c.modalidade:'horas'; }
// Quem está mexendo (identidade do ⏱ Apontar) — só o nome/e-mail, para o histórico.
function pcQuem(){ const id=idApontar()||{}; return { nome:String(id.nome||id.email||'alguém').trim(), email:String(id.email||'') }; }
function pcNovo(){ const h=hojeSP(); return { id:'pc'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), consultoria:'', modalidade:'horas', inicio:h.slice(0,7)+'-01', fim:'', valorHora:0, avisoDias:30, fatFecha:25, fatDia:30, conta:'', contato:'', obs:'', ajustes:{}, hist:[] }; }
// ---- datas ----
function pcUltimoDia(ym){ const y=+ym.slice(0,4), m=+ym.slice(5,7); return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10); }
function pcDiaNoMes(ym, dia){ const u=pcUltimoDia(ym); const d=Math.max(1,Math.min(31,Math.round(Number(dia)||31))); const dd=Math.min(d,+u.slice(8,10)); return `${ym}-${String(dd).padStart(2,'0')}`; }
function pcYmSoma(ym, n){ let y=+ym.slice(0,4), m=+ym.slice(5,7)+n; while(m>12){ m-=12; y++; } while(m<1){ m+=12; y--; } return `${y}-${String(m).padStart(2,'0')}`; }
function pcDias(a,b){ if(!a||!b) return 0; return Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/86400000); }
function pcDiasUteis(de, ate){ if(!de||!ate||ate<de) return 0; let n=0, d=de, g=0; while(d<=ate&&g++<800){ if(ehUtil(d)&&!ehFeriado(d)) n++; d=proxDia(d); } return n; }
const pcData=(s)=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
function pcAjuste(c, ym){ const a=c&&c.ajustes&&c.ajustes[ym]; return a&&typeof a==='object'?a:null; }
// Fechamento do período de faturamento do mês ym: ajuste do mês ou o dia padrão do contrato (31 = último dia).
function pcFechamento(c, ym){ const a=pcAjuste(c,ym); if(a&&pcData(a.fecha)) return a.fecha; return pcDiaNoMes(ym, c.fatFecha||31); }
// Dia da nota do mês ym: ajuste do mês; senão o dia de faturamento no próprio mês (≥ fechamento) ou no seguinte.
function pcNota(c, ym){ const a=pcAjuste(c,ym); if(a&&pcData(a.nota)) return a.nota; const fd=Math.round(Number(c.fatDia)||0); const fecha=pcFechamento(c,ym); if(!fd) return fecha;
  const d=pcDiaNoMes(ym,fd); return d>=fecha?d:pcDiaNoMes(pcYmSoma(ym,1),fd); }
function pcPeriodo(c, ym){ const fim=pcFechamento(c,ym); let ini=proxDia(pcFechamento(c,pcYmSoma(ym,-1))); if(ini>fim) ini=fim; return { ym, ini, fim, nota:pcNota(c,ym), ajustado:!!pcAjuste(c,ym) }; }
// Períodos de faturamento que cobrem [de, ate] — recortados nas pontas (iniPlano/fimPlano).
function pcPeriodos(c, de, ate){ const out=[]; if(!pcData(de)||!pcData(ate)||ate<de) return out; let ym=de.slice(0,7); if(pcFechamento(c,ym)<de) ym=pcYmSoma(ym,1); let g=0;
  while(g++<60){ const P=pcPeriodo(c,ym); if(P.ini>ate) break; out.push({ ...P, iniPlano:P.ini<de?de:P.ini, fimPlano:P.fim>ate?ate:P.fim, recortado:P.ini<de||P.fim>ate }); ym=pcYmSoma(ym,1); }
  return out; }
// Situação do contrato hoje: futuro · vigente · a vencer (dentro do período de aviso) · encerrado.
function pcStatus(c){ const h=hojeSP(); const fim=pcData(c.fim)?c.fim:''; const aviso=Math.max(0,Math.round(Number(c.avisoDias)||0)); const avisoAte=fim?voltaDias(fim,aviso):'';
  if(pcData(c.inicio)&&h<c.inicio) return { k:'futuro', rot:'Começa em '+dataBR(c.inicio), avisoAte };
  if(fim&&h>fim) return { k:'encerrado', rot:'Encerrado em '+dataBR(fim), avisoAte };
  if(fim&&avisoAte&&h>=avisoAte) return { k:'avencer', rot:`Vence em ${pcDias(h,fim)} dia(s)`, avisoAte, avisoPassou:h>avisoAte };
  return { k:'vigente', rot:fim?'Vigente':'Vigente (sem fim definido)', avisoAte }; }
// Histórico do contrato (quem gravou/alterou o quê) — mesmo formato do plano de rentabilidade.
function pcLog(c, o, d){ if(!Array.isArray(c.hist)) c.hist=[]; const q=pcQuem(); c.hist.push({ em:new Date().toISOString().slice(0,16), por:q.nome, o, d:String(d||'').slice(0,240) }); if(c.hist.length>40) c.hist=[c.hist[0]].concat(c.hist.slice(-39)); c.atualizadoEm=hojeSP(); c.atualizadoPor=q.nome; }
function pcQuando(em){ if(!em) return ''; const d=new Date(em.length===16?em+':00Z':em); if(isNaN(d)) return em; return d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}); }
const PC_CAMPOS={ consultoria:'consultoria', modalidade:'modalidade', inicio:'início', fim:'fim', valorHora:'valor-hora', avisoDias:'aviso (dias)', fatFecha:'fechamento (dia)', fatDia:'nota (dia)', conta:'conta', contato:'contato', obs:'obs.' };
function pcDiff(a, b){ const out=[]; Object.keys(PC_CAMPOS).forEach(k=>{ const x=a[k]==null?'':String(a[k]), y=b[k]==null?'':String(b[k]); if(x!==y) out.push(`${PC_CAMPOS[k]}: ${x||'—'} → ${y||'—'}`); }); return out; }
// Planos da 💹 Rentabilidade ligados a este contrato.
function pcPlanosDe(id){ const r=cfg.rentab&&Array.isArray(cfg.rentab.planos)?cfg.rentab.planos:[]; return r.filter(p=>p&&p.contrato===id); }
function pcContas(){ const s=new Set(); pcLista().forEach(c=>{ if(c.conta) s.add(c.conta); }); return [...s]; }

// ---- tela ----
function renderParcerias(){
  const cont=document.getElementById('conteudo'); const st=estado.parcerias=estado.parcerias||{}; const gestor=souAprovador(); const lista=pcLista();
  const edit=st.editId?pcDe(st.editId):null; if(st.editId&&!edit) st.editId=null;
  const hoje=hojeSP();
  const intro=`<div class="card full"><h2>🤝 Contratos de parceria <span>as consultorias que contratam a Dexterity: modalidade, valor-hora, validade e o calendário de faturamento</span></h2>
    <div class="muted small">Cadastre cada contrato com a <b>modalidade</b> (horas abertas, atendimento AMS ou demanda com horas fechadas), o <b>período de validade</b>, o <b>valor da hora negociada</b>, o <b>período de aviso</b> (dias de aviso prévio), o <b>período de faturamento</b> (o dia em que o período fecha — "até o dia 25") e o <b>dia da nota</b>, além da <b>conta bancária</b> em que você recebe. As datas de fechamento e de nota podem ser <b>ajustadas mês a mês</b> no 📅 calendário de cada contrato. Na 💹 Rentabilidade, o plano de horas abertas liga-se ao contrato: o cliente, o valor-hora e os <b>períodos de faturamento</b> (um item da ordem de venda no Odoo por período) vêm daqui. ${gestor?'':'<b>Somente gestores editam</b>; você está vendo em modo leitura.'}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">${gestor&&!st.novo&&!edit?'<button class="btn primario" data-pc-novo="1">＋ Novo contrato</button>':''}<button class="btn" data-goto="rentab">💹 Rentabilidade</button><button class="btn" data-goto="admin">⚙️ Contratos (Admin)</button></div></div>`;
  const form=gestor&&(st.novo||edit)?pcFormHTML(st.rasc||(edit?JSON.parse(JSON.stringify(edit)):pcNovo()), !edit):'';
  const ordem={avencer:0,vigente:1,futuro:2,encerrado:3};
  const cards=lista.slice().sort((a,b)=>(ordem[pcStatus(a).k]-ordem[pcStatus(b).k])||String(a.consultoria||'').localeCompare(String(b.consultoria||''),'pt')).map(c=>pcCardHTML(c, gestor, st.cal===c.id, hoje)).join('');
  const aVencer=lista.filter(c=>pcStatus(c).k==='avencer');
  const aviso=aVencer.length?`<div class="aviso">⏰ <b>${aVencer.length} contrato(s) dentro do período de aviso</b>: ${aVencer.map(c=>{ const s=pcStatus(c); return `<b>${esc(c.consultoria||'')}</b> vence em ${dataBR(c.fim)} (aviso prévio ${s.avisoPassou?'<span class="rp-neg">deveria ter sido dado até':'até'} ${dataBR(s.avisoAte)}${s.avisoPassou?'</span>':''})`; }).join(' · ')}.</div>`:'';
  cont.replaceChildren(el(`<div>${intro}${aviso}${form}
    <div class="card full"><h2>Contratos cadastrados <span>${lista.length}</span></h2>
      ${lista.length?`<div class="ad-grid pc-grid">${cards}</div>`:`<div class="estado">Nenhum contrato de parceria ainda.${gestor?' Clique em <b>＋ Novo contrato</b> para cadastrar o primeiro.':''}</div>`}</div></div>`));
  pcPreview();
  // 🦴 vindo da espinha do projeto: o contrato da consultoria em destaque e à vista
  if(st.destaque){ const card=cont.querySelector(`[data-pc-card="${st.destaque}"]`); if(card) setTimeout(()=>{ try{ card.scrollIntoView({behavior:'smooth',block:'center'}); }catch(e){} },60); }
  ['pc-f-inicio','pc-f-fim'].forEach(id=>{ const d=document.getElementById(id); if(d) d.addEventListener('click',()=>{ try{ if(d.showPicker) d.showPicker(); }catch(e){} }); });
}
function pcFormHTML(c, novo){
  const contas=pcContas();
  return `<div class="card full pc-form"><h2>${novo?'＋ Novo contrato de parceria':'✏️ Editar contrato'} <span>${esc(c.consultoria||'')}</span></h2>
    <div class="pl-grid">
      <div class="campo"><label>Consultoria parceira</label><input type="text" id="pc-f-consultoria" value="${escA(c.consultoria||'')}" placeholder="nome da consultoria (cliente)" style="min-width:240px"></div>
      <div class="campo"><label>Modalidade de contratação</label><select id="pc-f-modal">${Object.entries(PC_MODAL).map(([k,t])=>`<option value="${k}" ${pcModal(c)===k?'selected':''}>${t[0]} ${t[1]}</option>`).join('')}</select><div class="muted small" id="pc-f-modal-dica">${esc(PC_MODAL[pcModal(c)][2])}</div></div>
      <div class="campo"><label>Início da validade</label><input type="date" id="pc-f-inicio" value="${escA(c.inicio||'')}"></div>
      <div class="campo"><label>Fim da validade</label><input type="date" id="pc-f-fim" value="${escA(c.fim||'')}" data-tip="Vazio = sem prazo definido (o aviso prévio só faz sentido com fim)"></div>
      <div class="campo"><label>Valor da hora negociada (R$)</label><input type="number" id="pc-f-vh" min="0" step="0.01" value="${escA(String(c.valorHora||''))}" placeholder="ex.: 220" style="width:120px"></div>
      <div class="campo"><label>Período de aviso (dias)</label><input type="number" id="pc-f-aviso" min="0" step="1" value="${escA(String(c.avisoDias!=null?c.avisoDias:30))}" style="width:90px" data-tip="Dias de aviso prévio para encerrar ou renovar; a tela avisa quando o contrato entra nesse período"></div>
      <div class="campo"><label>Fechamento do período (dia do mês)</label><input type="number" id="pc-f-fecha" min="1" max="31" step="1" value="${escA(String(c.fatFecha||25))}" style="width:90px" data-tip="Até que dia vai o período de faturamento (ex.: 25 = de 26 do mês anterior a 25 deste; 31 = mês civil)"></div>
      <div class="campo"><label>Dia da nota (faturamento)</label><input type="number" id="pc-f-nota" min="1" max="31" step="1" value="${escA(String(c.fatDia||''))}" placeholder="= fechamento" style="width:90px" data-tip="Dia em que a nota é emitida: no próprio mês se for igual/depois do fechamento, senão no mês seguinte"></div>
      <div class="campo"><label>Conta bancária de recebimento</label><input type="text" id="pc-f-conta" list="pc-contas" value="${escA(c.conta||'')}" placeholder="ex.: Itaú · ag 1234 · cc 56789-0" style="min-width:240px"><datalist id="pc-contas">${contas.map(x=>`<option value="${escA(x)}"></option>`).join('')}</datalist></div>
      <div class="campo"><label>Contato na consultoria</label><input type="text" id="pc-f-contato" value="${escA(c.contato||'')}" placeholder="nome / e-mail"></div>
    </div>
    <div class="campo"><label>Observações</label><input type="text" id="pc-f-obs" value="${escA(c.obs||'')}" placeholder="opcional (ex.: reajuste anual pelo IPCA, NF até o dia 28)"></div>
    <div class="aviso pc-prev" id="pc-f-prev"></div>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap"><button class="btn primario" id="pc-f-salvar" data-pc-id="${escA(c.id)}">${novo?'Cadastrar contrato':'Salvar alterações'}</button><button class="btn" id="pc-f-cancelar">Cancelar</button></div>
    <div class="ap-fb" id="pc-f-fb" hidden></div></div>`;
}
// Exemplo vivo do calendário com o que está digitado no formulário.
function pcPreview(){
  const box=document.getElementById('pc-f-prev'); if(!box) return; const v=(id)=>{ const e=document.getElementById(id); return e?String(e.value).trim():''; };
  const c={ fatFecha:Number(v('pc-f-fecha'))||31, fatDia:Number(v('pc-f-nota'))||0, ajustes:{} }; const ym=hojeSP().slice(0,7); const P=pcPeriodo(c,ym), Q=pcPeriodo(c,pcYmSoma(ym,1));
  const fim=v('pc-f-fim'); const aviso=Number(v('pc-f-aviso'))||0; const avisoAte=pcData(fim)?voltaDias(fim,aviso):'';
  box.innerHTML=`📅 <b>Como fica:</b> período de ${esc(labelMesAbbr(P.ym))} = ${dataBR(P.ini)} → ${dataBR(P.fim)}, nota em <b>${dataBR(P.nota)}</b>; ${esc(labelMesAbbr(Q.ym))} = ${dataBR(Q.ini)} → ${dataBR(Q.fim)}, nota em <b>${dataBR(Q.nota)}</b>.${avisoAte?` ⏰ Com fim em ${dataBR(fim)} e ${aviso} dia(s) de aviso, o aviso prévio vai até <b>${dataBR(avisoAte)}</b>.`:''} <span class="muted small">Datas de um mês específico se ajustam depois, no 📅 calendário do contrato.</span>`;
  const md=document.getElementById('pc-f-modal'), dica=document.getElementById('pc-f-modal-dica'); if(md&&dica) dica.textContent=PC_MODAL[PC_MODAL[md.value]?md.value:'horas'][2];
}
function pcCardHTML(c, gestor, calAberto, hoje){
  const s=pcStatus(c); const M=PC_MODAL[pcModal(c)]; const vh=Number(c.valorHora)||0; const planos=pcPlanosDe(c.id);
  const ym=hoje.slice(0,7); const atual=pcPeriodo(c, pcFechamento(c,ym)<hoje?pcYmSoma(ym,1):ym);
  const dl=(l,v)=>`<div class="ams-dl"><div class="dt">${l}</div><div class="dd">${v}</div></div>`;
  const hist=Array.isArray(c.hist)?c.hist.slice().reverse():[];
  const dest=(estado.parcerias&&estado.parcerias.destaque)===c.id;
  return `<div class="ad-card pc-card pc-${s.k}${calAberto?' pc-cal-aberto':''}${dest?' pc-dest':''}" data-pc-card="${escA(c.id)}">
    <div class="ad-top"><strong>${esc(c.consultoria||'(sem nome)')}</strong> <span class="badge rp-tipo" data-tip="${escA(M[2])}">${M[0]} ${M[1]}</span> <span class="badge pc-st-${s.k}">${esc(s.rot)}</span><span class="spacer"></span>
      ${gestor?`<button class="btn" data-pc-edit="${escA(c.id)}">editar</button><button class="btn" data-pc-del="${escA(c.id)}">remover</button>`:''}</div>
    <div class="ams-dgrid">
      ${dl('Validade', `${c.inicio?dataBR(c.inicio):'—'} → ${c.fim?dataBR(c.fim):'sem fim'}`)}
      ${dl('Aviso prévio', c.fim?`${Number(c.avisoDias)||0} dia(s) · até ${dataBR(s.avisoAte)}${s.k==='avencer'?(s.avisoPassou?' <span class="rp-neg">(passou)</span>':' <span class="rp-neg">(agora)</span>'):''}`:`${Number(c.avisoDias)||0} dia(s)`)}
      ${dl('Valor-hora', vh?fmtBRL(vh):'—')}
      ${dl('Fechamento', `dia ${c.fatFecha||31}${(c.fatFecha||31)>=31?' (mês civil)':''}`)}
      ${dl('Nota', c.fatDia?`dia ${c.fatDia}`:'no fechamento')}
      ${dl('Período atual', `${dataBR(atual.ini)} → ${dataBR(atual.fim)} · nota ${dataBR(atual.nota)}${atual.ajustado?' ✎':''}`)}
      ${dl('Conta de recebimento', c.conta?esc(c.conta):'—')}
      ${dl('Contato', c.contato?esc(c.contato):'—')}
    </div>
    <div class="ams-dprojs muted small">💹 Planos na Rentabilidade: ${planos.length?planos.map(p=>`<span class="lnk" data-pc-plano="${escA(p.id)}">${esc(p.nome||p.projeto||p.id)}</span>${p.projeto?` ${projChipsFicha([p.projeto])}`:''}`).join(', '):'nenhum ainda'}${Object.keys(c.ajustes||{}).length?` · ✎ ${Object.keys(c.ajustes).length} mês(es) com datas ajustadas`:''}</div>
    ${c.obs?`<div class="ams-dobs muted small"><strong>Obs.:</strong> ${esc(c.obs)}</div>`:''}
    <div class="ad-cons"><button class="btn rt-step" data-pc-cal="${escA(c.id)}">📅 ${calAberto?'Fechar calendário':'Calendário de faturamento'}</button> <span class="muted small">${c.atualizadoEm?`atualizado ${dataBR(c.atualizadoEm)}${c.atualizadoPor?' por '+esc(c.atualizadoPor):''}`:''}</span></div>
    ${calAberto?pcCalendarioHTML(c, gestor, hoje):''}
    ${hist.length?`<details class="rm-det"><summary>🕓 Histórico (${hist.length})</summary><table class="mp-tab-mini rp-hist"><tbody>${hist.slice(0,8).map(h=>`<tr><td class="muted small">${esc(pcQuando(h.em))}</td><td>${esc(h.por||'')}</td><td class="small">${esc(h.d||'')}</td></tr>`).join('')}</tbody></table></details>`:''}
  </div>`;
}
// Calendário dos próximos 12 períodos (a partir do mês anterior ao atual): datas ajustáveis mês a mês.
function pcCalendarioHTML(c, gestor, hoje){
  let ym=pcYmSoma(hoje.slice(0,7),-1); if(pcData(c.inicio)&&ym<c.inicio.slice(0,7)) ym=c.inicio.slice(0,7);
  const rows=[]; for(let i=0;i<12;i++){ const P=pcPeriodo(c,ym); const fora=(pcData(c.fim)&&P.ini>c.fim)||(pcData(c.inicio)&&P.fim<c.inicio); const atual=P.ini<=hoje&&hoje<=P.fim;
    rows.push(`<tr class="${atual?'rm-destaque':''} ${fora?'pc-fora':''}"><td><b>${esc(labelMesAbbr(P.ym))}</b>${P.ajustado?' <span class="muted small" data-tip="datas ajustadas neste mês">✎</span>':''}</td><td>${dataBR(P.ini)} → ${dataBR(P.fim)}</td>
      <td>${gestor?`<input type="date" data-pc-aj="${escA(c.id)}|${P.ym}|fecha" value="${escA(P.fim)}">`:dataBR(P.fim)}</td>
      <td>${gestor?`<input type="date" data-pc-aj="${escA(c.id)}|${P.ym}|nota" value="${escA(P.nota)}">`:dataBR(P.nota)}</td>
      <td class="num">${pcDiasUteis(P.ini,P.fim)}</td><td>${fora?'<span class="muted small">fora da validade</span>':''}${gestor&&P.ajustado?`<button class="btn rt-step" data-pc-aj-rm="${escA(c.id)}|${P.ym}" data-tip="Volta às datas padrão do contrato neste mês">↺ padrão</button>`:''}</td></tr>`);
    ym=pcYmSoma(ym,1); }
  return `<div class="pc-cal"><div class="mp-h3">📅 Calendário de faturamento <span class="mp-dim">período · fechamento · dia da nota · dias úteis (feriados descontados)</span></div>
    <div class="scroll-x"><table class="mp-tab-mini pc-cal-tab"><thead><tr><th>Mês</th><th>Período</th><th>Fechamento</th><th>Nota</th><th class="num">Dias úteis</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <div class="muted small">${gestor?'Mude a data de fechamento ou de nota de um mês para ajustar só aquele mês (ex.: dezembro fecha no dia 20). O mês seguinte começa no dia seguinte ao fechamento ajustado.':'Datas ajustáveis pelos gestores.'}</div></div>`;
}
function pcLeForm(c){
  const v=(id)=>{ const e=document.getElementById(id); return e?String(e.value).trim():''; };
  c.consultoria=v('pc-f-consultoria').slice(0,120); c.modalidade=PC_MODAL[v('pc-f-modal')]?v('pc-f-modal'):'horas'; c.inicio=v('pc-f-inicio'); c.fim=v('pc-f-fim');
  c.valorHora=Math.max(0,Number(v('pc-f-vh'))||0); c.avisoDias=Math.max(0,Math.round(Number(v('pc-f-aviso'))||0));
  c.fatFecha=Math.max(1,Math.min(31,Math.round(Number(v('pc-f-fecha'))||31))); c.fatDia=Math.max(0,Math.min(31,Math.round(Number(v('pc-f-nota'))||0)));
  c.conta=v('pc-f-conta').slice(0,120); c.contato=v('pc-f-contato').slice(0,120); c.obs=v('pc-f-obs').slice(0,300); if(!c.ajustes||typeof c.ajustes!=='object') c.ajustes={};
  if(!c.consultoria) return 'Informe o nome da consultoria parceira.'; if(!pcData(c.inicio)) return 'Informe o início da validade.';
  if(c.fim&&!pcData(c.fim)) return 'Data de fim inválida.'; if(c.fim&&c.fim<c.inicio) return 'O fim da validade precisa ser depois do início.';
  return '';
}

// ---- listeners delegados desta tela ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='parcerias') return; const st=estado.parcerias=estado.parcerias||{}; const gestor=souAprovador();
  const pl=e.target.closest&&e.target.closest('[data-pc-plano]'); if(pl){ estado.rentab.sel=pl.getAttribute('data-pc-plano'); estado.rentab.edit=false; vaiPara('rentab'); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-pc-cal')){ const id=t.getAttribute('data-pc-cal'); st.cal=st.cal===id?'':id; renderParcerias(); return; }
  if(!gestor) return;
  if(t.hasAttribute('data-pc-novo')){ st.novo=true; st.editId=null; st.rasc=pcNovo(); st.destaque=''; renderParcerias(); return; }
  if(t.hasAttribute('data-pc-edit')){ st.editId=t.getAttribute('data-pc-edit'); st.novo=false; st.rasc=null; st.destaque=''; renderParcerias(); window.scrollTo({top:0,behavior:'smooth'}); return; }
  if(t.id==='pc-f-cancelar'){ st.novo=false; st.editId=null; st.rasc=null; renderParcerias(); return; }
  if(t.id==='pc-f-salvar'){ const fb=document.getElementById('pc-f-fb'); const diz=(m)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=m; } };
    if(st.editId){ const c=pcDe(st.editId); if(!c) return; const antes=JSON.parse(JSON.stringify(c)); const erro=pcLeForm(c); if(erro){ Object.assign(c,antes); diz(erro); return; }
      const dif=pcDiff(antes,c); pcLog(c,'editou',dif.length?dif.join('; '):'salvo sem mudanças'); st.editId=null; salvaCfg(); toast('Contrato atualizado.','ok'); renderParcerias(); return; }
    const c=st.rasc||pcNovo(); const erro=pcLeForm(c); if(erro){ diz(erro); return; }
    c.criadoEm=hojeSP(); c.criadoPor=pcQuem().nome; pcLog(c,'criou',`${PC_MODAL[pcModal(c)][1]} · ${dataBR(c.inicio)} → ${c.fim?dataBR(c.fim):'sem fim'} · ${fmtBRL(c.valorHora)}/h · fecha dia ${c.fatFecha}`);
    pcLista().push(c); st.novo=false; st.rasc=null; salvaCfg(); toast('Contrato cadastrado. Ligue os planos de horas abertas a ele na 💹 Rentabilidade.','ok'); renderParcerias(); return; }
  if(t.hasAttribute('data-pc-del')){ const c=pcDe(t.getAttribute('data-pc-del')); if(!c) return; const n=pcPlanosDe(c.id).length;
    if(!confirm(`Remover o contrato "${c.consultoria}"?${n?` ${n} plano(s) da Rentabilidade apontam para ele e perderão o vínculo.`:''}`)) return;
    pcPlanosDe(c.id).forEach(p=>{ p.contrato=''; }); cfg.parcerias=pcLista().filter(x=>x.id!==c.id); if(st.cal===c.id) st.cal=''; salvaCfg(); renderParcerias(); return; }
  if(t.hasAttribute('data-pc-aj-rm')){ const [id,ym]=t.getAttribute('data-pc-aj-rm').split('|'); const c=pcDe(id); if(!c||!c.ajustes) return; delete c.ajustes[ym]; pcLog(c,'ajuste',`${labelMesAbbr(ym)}: datas de volta ao padrão`); salvaCfg(); renderParcerias(); return; }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='parcerias') return; const t=e.target; if(!t||!t.hasAttribute) return;
  if(t.hasAttribute('data-pc-aj')){ if(!souAprovador()) return; const [id,ym,campo]=t.getAttribute('data-pc-aj').split('|'); const c=pcDe(id); if(!c) return; if(!c.ajustes||typeof c.ajustes!=='object') c.ajustes={};
    const val=String(t.value||''); if(!pcData(val)){ renderParcerias(); return; }
    const padrao=campo==='fecha'?pcDiaNoMes(ym,c.fatFecha||31):pcNota({ ...c, ajustes:{ ...c.ajustes, [ym]:{ ...(c.ajustes[ym]||{}), nota:'' } } },ym);
    const a=c.ajustes[ym]||{}; if(val===padrao) delete a[campo]; else a[campo]=val; if(Object.keys(a).length) c.ajustes[ym]=a; else delete c.ajustes[ym];
    pcLog(c,'ajuste',`${labelMesAbbr(ym)}: ${campo==='fecha'?'fechamento':'nota'} → ${dataBR(val)}`); salvaCfg(); renderParcerias(); return; }
  if(/^pc-f-/.test(t.id||'')) pcPreview();
});
document.getElementById('conteudo').addEventListener('input',(e)=>{ if(estado.vista!=='parcerias') return; const t=e.target; if(t&&/^pc-f-(fecha|nota|fim|aviso)$/.test(t.id||'')) pcPreview(); });
