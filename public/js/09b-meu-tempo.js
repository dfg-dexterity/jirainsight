// Jira Insights · 09b · ⏳ COMO ESTOU GASTANDO MEU TEMPO? — o histórico de apontamentos de uma pessoa, em gráficos e com análise por IA.
// ===========================================================================
// Lê TODOS os apontamentos do período (/api/tempo?desde&ate&comentarios=1 — com o
// texto do comentário de cada worklog) e monta, para a pessoa escolhida (você, ou
// qualquer pessoa se você for gestor): KPIs; como o dia funciona (hora do dia, dia da
// semana, início/fim, tamanho dos apontamentos, troca de contexto); onde o tempo vai
// (tipo de ticket, projeto/categoria, faturável, épicos, tickets que mais consumiram,
// evolução semanal); colaboração (quem divide seus tickets, tickets que andam juntos);
// o que os comentários dizem (classes de atividade, palavras frequentes, amostras);
// um SCORE de qualidade dos dados (os registros permitem uma boa análise?) e a
// análise por IA (/api/resumo?acao=meutempo) em cima de tudo isso.
// Helpers de outros módulos só em tempo de render.
// ===========================================================================
const MTP_DIAS=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MTP_FAIXAS=[['≤ 30 min',0.5],['30 min – 1h',1],['1 – 2h',2],['2 – 4h',4],['4 – 8h',8],['> 8h',Infinity]];
const MTP_CLASSES=[
  ['Reuniões e alinhamentos',/reuni|alinha|daily|call\b|weekly|status|cerim|planning|review|retro|comit[eê]|apresenta/i],
  ['Suporte e atendimento',/suport|atend|chamado|incident|erro|falha|d[uú]vida|problema|corre[cç]|bug\b|ajuste emerg/i],
  ['Testes e homologação',/test|homolog|valid|\bqa\b|cen[aá]rio|evid[eê]ncia/i],
  ['Análise e levantamento',/an[aá]lis|levant|estud|mapea|requisit|especific|desenh|diagn|entend/i],
  ['Documentação',/document|\bata\b|manual|guia|relat[oó]rio|wiki|procedimento/i],
  ['Gestão e planejamento',/gest|planej|acompanh|priori|prazo|cronogram|or[cç]ament|comercial|proposta|kickoff|governan/i],
  ['Treinamento',/trein|capacit|workshop|curso|onboard|mentor/i],
  ['Desenvolvimento e configuração',/desenv|implement|config|codif|program|ajust|build|deploy|customiz|abap|script|parametr|cria[cç][aã]o|integra|migra|carga|cadastr/i],
];
const MTP_RE_GENERICO=/^(reuni[aã]o|reunioes|ajustes?|diversos|trabalho|atividades?|dev|desenvolvimento|suporte|an[aá]lise|tarefas?|teste|ok|feito|apontamento|horas?|acompanhamento|gest[aã]o|projeto|continua[cç][aã]o|idem|\.+|-+)\.?$/i;
const MTP_STOP=new Set('a o e de da do das dos em no na nos nas um uma para com por que se ao à às os as sobre como mais menos foi ser está esta este esse essa isso isto pelo pela até entre sem sua seu suas seus não sim já muito também ainda hoje ontem dia dias hora horas realizado realizada realização reunião reuniao atividade atividades ticket tarefa tarefas the and of to in for on with'.split(' '));
const mtpH=(h)=>fmtHd(h);
const mtpPct=(n,d)=>(d>0?Math.round(n/d*100):0);
function mtpQuem(){ const id=(typeof idApontar==='function')?idApontar():null; return id&&id.accountId?id.accountId:''; }
function mtpNome(a){ const u=pessoasUnidas(); const t=estado.meutempo.tempo[estado.meutempo.chave]; return (t&&t.pessoas&&t.pessoas[a]&&t.pessoas[a].nome)||(u[a]&&u[a].nome)||a; }
function mtpReRender(){ if(estado.vista==='meutempo') renderMeuTempo(); }
// ---- dados ----
function mtpGarante(){
  const m=estado.meutempo;
  if(!m.de){ m.de=ctPrimeiroDiaMes(-2); m.ate=hojeSP(); }
  if(m.ate<m.de){ const x=m.de; m.de=m.ate; m.ate=x; }
  if(m.de<voltaDias(m.ate,365)) m.de=voltaDias(m.ate,365);
  if(!m.a) m.a=mtpQuem();
  const chave=`${m.de}|${m.ate}`; m.chave=chave;
  if(!m.tempo[chave]&&!m.tempoB[chave]&&!m.tempoErro[chave]){
    m.tempoB[chave]=true;
    fetch(`/api/tempo?desde=${encodeURIComponent(m.de)}&ate=${encodeURIComponent(m.ate)}&comentarios=1`).then(r=>r.json()).then(j=>{ m.tempoB[chave]=false;
      if(j&&!j.erro) m.tempo[chave]=j; else m.tempoErro[chave]=(j&&j.erro)||'Falha ao ler os apontamentos.'; mtpReRender();
    }).catch(e=>{ m.tempoB[chave]=false; m.tempoErro[chave]=humanizaErro(e); mtpReRender(); });
  }
}
function mtpClasse(txt){ for(const [nome,re] of MTP_CLASSES){ if(re.test(txt)) return nome; } return ''; }
function mtpDados(){
  const m=estado.meutempo; const t=m.tempo[m.chave]; if(!t||!m.a) return null;
  const all=t.worklogs||[]; const wl=all.filter(w=>w.a===m.a); const projMeta=t.projetos||{}; const resumos=t.resumos||{};
  const dias=listaDias(m.de,m.ate); const diasUteis=dias.filter(d=>ehUtil(d)&&!ehFeriado(d)).length;
  const porTipo={}, porProj={}, porCat={}, porEpico={}, porHora={}, porDS={}, porSem={}, porMes={}, porDia={}, porTicket={};
  let seg=0,segFat=0,segFds=0,segSemEpico=0; const tickets=new Set(), projetos=new Set();
  const horasDistintas=new Set(); const tam={}; MTP_FAIXAS.forEach(([f])=>{ tam[f]={n:0,seg:0}; });
  const classes={}; let nCom=0,nSem=0,chars=0,genericos=0; const textos={}; const amostras=[]; const palavras={};
  wl.forEach(w=>{
    const s=Number(w.s)||0; const h=s/3600; const dia=(w.d||'').slice(0,10); const hh=(w.d||'').length>=13?+w.d.slice(11,13):NaN;
    seg+=s; if(w.f) segFat+=s; if(!w.e) segSemEpico+=s;
    const tp=w.t||'—'; porTipo[tp]=(porTipo[tp]||0)+s;
    porProj[w.p]=(porProj[w.p]||0)+s; projetos.add(w.p);
    const cat=(projMeta[w.p]&&projMeta[w.p].categoria)||'Sem categoria'; porCat[cat]=(porCat[cat]||0)+s;
    const ek=w.e||''; porEpico[ek]=(porEpico[ek]||0)+s;
    if(!isNaN(hh)){ porHora[hh]=(porHora[hh]||0)+s; horasDistintas.add(hh); }
    if(dia){ const ds=diaSemana(dia); porDS[ds]=(porDS[ds]||0)+s; if(ds===0||ds===6) segFds+=s;
      const sk=semChave(dia); porSem[sk]=(porSem[sk]||0)+s; porMes[dia.slice(0,7)]=(porMes[dia.slice(0,7)]||0)+s;
      const D=porDia[dia]=porDia[dia]||{seg:0,tickets:new Set(),projs:new Set(),hIni:null,hFim:null,n:0}; D.seg+=s; D.n++; if(w.k) D.tickets.add(w.k); D.projs.add(w.p);
      if(!isNaN(hh)){ if(D.hIni==null||hh<D.hIni) D.hIni=hh; const fim=hh+h; if(D.hFim==null||fim>D.hFim) D.hFim=fim; } }
    if(w.k){ tickets.add(w.k); const K=porTicket[w.k]=porTicket[w.k]||{k:w.k,p:w.p,t:tp,seg:0,n:0,outros:0,quem:new Set(),dias:new Set()}; K.seg+=s; K.n++; if(dia) K.dias.add(dia); }
    const faixa=MTP_FAIXAS.find(([,lim])=>h<=lim)||MTP_FAIXAS[MTP_FAIXAS.length-1]; tam[faixa[0]].n++; tam[faixa[0]].seg+=s;
    const c=String(w.c||'').trim();
    if(c.length>=3){ nCom++; chars+=c.length; if(MTP_RE_GENERICO.test(c)||c.length<8) genericos++; const norm=c.toLowerCase().replace(/\s+/g,' '); textos[norm]=(textos[norm]||0)+1;
      if(amostras.length<60&&c.length>=12) amostras.push({k:w.k||'',tipo:tp,h:Math.round(h*10)/10,texto:c.slice(0,200)});
      c.toLowerCase().replace(/[^a-zà-ú0-9\s-]/gi,' ').split(/\s+/).forEach(p=>{ if(p.length>=4&&!MTP_STOP.has(p)&&!/^\d+$/.test(p)) palavras[p]=(palavras[p]||0)+1; }); }
    else nSem++;
    const cl=mtpClasse(c)||mtpClasse(resumos[w.k]||'')||mtpClasse(tp)||'Outros / sem descrição'; classes[cl]=(classes[cl]||0)+s;
  });
  // colaboração: quem mais apontou nos MEUS tickets (e quanto)
  const colab={}; let ticketsCompartilhados=0;
  all.forEach(w=>{ if(w.a===m.a||!w.k||!porTicket[w.k]) return; const K=porTicket[w.k]; K.outros+=Number(w.s)||0; K.quem.add(w.a);
    const C=colab[w.a]=colab[w.a]||{a:w.a,seg:0,tickets:new Set()}; C.seg+=Number(w.s)||0; C.tickets.add(w.k); });
  Object.values(porTicket).forEach(K=>{ if(K.quem.size) ticketsCompartilhados++; });
  // coocorrência: pares de tickets trabalhados no mesmo dia
  const pares={};
  Object.values(porDia).forEach(D=>{ const ks=[...D.tickets].sort(); for(let i=0;i<ks.length&&i<12;i++) for(let j=i+1;j<ks.length&&j<12;j++){ const key=ks[i]+'|'+ks[j]; pares[key]=(pares[key]||0)+1; } });
  const coocor=Object.entries(pares).filter(([,n])=>n>=2).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,n])=>{ const [a,b]=k.split('|'); return {a,b,dias:n}; });
  // contexto: tickets/projetos por dia, início/fim médios, dias fragmentados
  const diasArr=Object.values(porDia); const nDias=diasArr.length;
  const tPorDia=nDias?diasArr.reduce((s,D)=>s+D.tickets.size,0)/nDias:0; const pPorDia=nDias?diasArr.reduce((s,D)=>s+D.projs.size,0)/nDias:0;
  const tMax=diasArr.reduce((s,D)=>Math.max(s,D.tickets.size),0); const fragment=diasArr.filter(D=>D.tickets.size>=5).length;
  const horarioDisponivel=horasDistintas.size>=3&&!(Object.entries(porHora).some(([,v])=>v/seg>0.85));
  const comIni=diasArr.filter(D=>D.hIni!=null); const iniMedio=comIni.length?comIni.reduce((s,D)=>s+D.hIni,0)/comIni.length:null; const fimMedio=comIni.length?comIni.reduce((s,D)=>s+Math.min(24,D.hFim),0)/comIni.length:null;
  const oitoHoras=wl.filter(w=>Math.abs((Number(w.s)||0)-28800)<1).length; const maisDe8=wl.filter(w=>(Number(w.s)||0)>28800).length;
  const repetidos=Object.values(textos).filter(n=>n>=3).reduce((s,n)=>s+n,0);
  const genericTickets=Object.values(porTicket).filter(K=>{ const r=resumos[K.k]||''; return r.length<12||MTP_RE_GENERICO.test(r); }).reduce((s,K)=>s+K.seg,0);
  // qualidade dos dados (0–100)
  const nW=wl.length||1; const pctCom=nCom/nW; const mediaChars=nCom?chars/nCom:0;
  const q={ problemas:[], recs:[] };
  const notaCom=Math.round(30*Math.min(1,pctCom/0.9)); if(pctCom<0.6){ q.problemas.push(`${Math.round((1-pctCom)*100)}% dos apontamentos não têm comentário (${nSem} de ${nW}).`); q.recs.push('Escreva uma frase em cada apontamento: o que foi feito e para quem — é o que permite ler o dia depois.'); }
  const notaRiq=Math.round(15*Math.min(1,mediaChars/45)); if(nCom&&mediaChars<25){ q.problemas.push(`Comentários curtos demais: média de ${Math.round(mediaChars)} caracteres.`); q.recs.push('Prefira "Ajuste da regra X do relatório Y após teste com o cliente" a "ajustes".'); }
  const notaGen=Math.round(10*(1-(nCom?genericos/nCom:0))); if(nCom&&genericos/nCom>0.25){ q.problemas.push(`${genericos} comentário(s) genérico(s) ("reunião", "ajustes", "diversos"…).`); q.recs.push('Diga qual reunião, com quem e o resultado; qual ajuste e em quê.'); }
  const pctEp=seg?1-segSemEpico/seg:0; const notaEp=Math.round(15*Math.min(1,pctEp/0.8)); if(seg&&pctEp<0.5){ q.problemas.push(`${Math.round((1-pctEp)*100)}% das horas estão em tickets sem épico.`); q.recs.push('Vincule os tickets aos épicos: é o que permite ver o tempo por frente de trabalho.'); }
  const pctGenT=seg?genericTickets/seg:0; const notaTk=Math.round(10*(1-Math.min(1,pctGenT/0.5))); if(pctGenT>0.2){ q.problemas.push(`${Math.round(pctGenT*100)}% das horas caem em tickets genéricos ou com título curto.`); q.recs.push('Abra tickets específicos (um por entrega/assunto) em vez de acumular horas em "Reunião"/"Diversos".'); }
  const pct8=oitoHoras/nW; const notaGr=Math.round(10*(1-Math.min(1,pct8/0.6)))-(maisDe8?2:0); if(pct8>0.3){ q.problemas.push(`${Math.round(pct8*100)}% dos apontamentos são blocos de 8h fechados — o dia inteiro num ticket só.`); q.recs.push('Quebre o dia em blocos por assunto (2–4 apontamentos): a análise por tipo e por hora passa a fazer sentido.'); }
  if(maisDe8) q.problemas.push(`${maisDe8} apontamento(s) com mais de 8h.`);
  const notaHr=horarioDisponivel?10:0; if(!horarioDisponivel) q.problemas.push('O horário de início não é registrado (todos os apontamentos caem na mesma hora) — a visão "hora do dia" fica sem valor.');
  if(!horarioDisponivel) q.recs.push('Aponte pelo Clockwork/Jira informando a hora de início, ou use o 📍 Meu dia para gerar os blocos com horário.');
  const nota=Math.max(0,Math.min(100,notaCom+notaRiq+notaGen+notaEp+notaTk+Math.max(0,notaGr)+notaHr));
  const sortSeg=(o)=>Object.entries(o).sort((a,b)=>b[1]-a[1]);
  return { a:m.a, wl, all, projMeta, resumos, dias, diasUteis, seg, segFat, segFds, segSemEpico, tickets, projetos, porTipo, porProj, porCat, porEpico, porHora, porDS, porSem, porMes, porDia, porTicket,
    tam, classes, nCom, nSem, chars, genericos, repetidos, amostras, palavras, colab, ticketsCompartilhados, coocor, tPorDia, pPorDia, tMax, fragment, horarioDisponivel, iniMedio, fimMedio,
    oitoHoras, maisDe8, genericTickets, qualidade:{ nota, problemas:q.problemas, recs:q.recs, partes:{ comentarios:notaCom, riqueza:notaRiq, especificidade:notaGen, epico:notaEp, tickets:notaTk, granularidade:Math.max(0,notaGr), horario:notaHr } },
    sortSeg, pessoasMeta:t.pessoas||{} };
}
// ---- payload para a IA ----
function mtpPayloadIA(d){
  const m=estado.meutempo; const h=(s)=>Math.round(s/360)/10; const pct=(s)=>mtpPct(s,d.seg);
  const lista=(o,n,rot)=>d.sortSeg(o).slice(0,n).map(([k,v])=>({nome:rot?rot(k):k,horas:h(v),pct:pct(v)}));
  return { pessoa:{nome:mtpNome(d.a)}, periodo:{de:m.de,ate:m.ate,diasUteis:d.diasUteis},
    totais:{ horas:h(d.seg), apontamentos:d.wl.length, diasComApontamento:Object.keys(d.porDia).length, mediaHorasPorDia:Object.keys(d.porDia).length?h(d.seg/Object.keys(d.porDia).length):0,
      faturavelPct:pct(d.segFat), tickets:d.tickets.size, projetos:d.projetos.size, mediaHorasPorApontamento:d.wl.length?h(d.seg/d.wl.length):0, horarioDisponivel:d.horarioDisponivel,
      horasEmFimDeSemana:h(d.segFds), horasSemEpicoPct:pct(d.segSemEpico) },
    porTipo:lista(d.porTipo,12), porProjeto:d.sortSeg(d.porProj).slice(0,12).map(([k,v])=>({nome:projNome(k),categoria:(d.projMeta[k]&&d.projMeta[k].categoria)||'',horas:h(v),pct:pct(v)})),
    porCategoria:lista(d.porCat,10), porEpico:lista(d.porEpico,10,(k)=>k?`${k} ${d.resumos[k]||''}`.trim():'(sem épico)'),
    porHoraDoDia:d.horarioDisponivel?Object.entries(d.porHora).map(([k,v])=>({hora:+k,horas:h(v)})).sort((a,b)=>a.hora-b.hora):[],
    porDiaSemana:Object.entries(d.porDS).map(([k,v])=>({dia:MTP_DIAS[+k],horas:h(v)})),
    tamanhos:MTP_FAIXAS.map(([f])=>({faixa:f,n:d.tam[f].n,horas:h(d.tam[f].seg)})),
    contexto:{ ticketsPorDiaMedia:Math.round(d.tPorDia*10)/10, ticketsPorDiaMax:d.tMax, projetosPorDiaMedia:Math.round(d.pPorDia*10)/10, diasFragmentados:d.fragment,
      inicioMedio:d.iniMedio==null?'':mtpHora(d.iniMedio), fimMedio:d.fimMedio==null?'':mtpHora(d.fimMedio) },
    topTickets:Object.values(d.porTicket).sort((a,b)=>b.seg-a.seg).slice(0,15).map(K=>({k:K.k,resumo:d.resumos[K.k]||'',tipo:K.t,projeto:K.p,horas:h(K.seg),n:K.n,outrosHoras:h(K.outros)})),
    colaboradores:Object.values(d.colab).sort((a,b)=>b.seg-a.seg).slice(0,10).map(C=>({nome:mtpNome(C.a),horasNosMeusTickets:h(C.seg),tickets:C.tickets.size})),
    coocorrencia:d.coocor,
    comentarios:{ com:d.nCom, sem:d.nSem, pct:mtpPct(d.nCom,d.wl.length), mediaChars:d.nCom?Math.round(d.chars/d.nCom):0, genericos:d.genericos, repetidos:d.repetidos,
      classes:lista(d.classes,10), amostras:d.amostras.slice(0,60) },
    qualidade:{ nota:d.qualidade.nota, problemas:d.qualidade.problemas } };
}
function mtpHora(x){ const hh=Math.floor(x), mm=Math.round((x-hh)*60); return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`; }
function mtpIaGera(forca){
  const m=estado.meutempo; const d=mtpDados(); if(!d||!d.wl.length) return;
  const chave=`${m.a}|${m.chave}`; if(m.iaB[chave]) return;
  m.iaB[chave]=true; m.iaErro[chave]=''; mtpReRender();
  const body={...mtpPayloadIA(d), nocache:!!forca};
  fetch('/api/resumo?acao=meutempo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json()).then(j=>{ m.iaB[chave]=false;
    if(j&&j.configurado===false){ m.iaErro[chave]='cfg:'+(j.erro||'IA não configurada'); }
    else if(j&&j.ok){ m.ia[chave]=j.analise; }
    else m.iaErro[chave]=humanizaErro((j&&j.erro)||'Falha ao gerar a análise.');
    mtpReRender();
  }).catch(e=>{ m.iaB[chave]=false; m.iaErro[chave]=humanizaErro(e); mtpReRender(); });
}
// ---- primitivos ----
const mtpKpi=(v,l,cls,s)=>`<div class="vg-k ${cls||''}"><div class="v">${v}</div><div class="l">${esc(l)}</div>${s?`<div class="s">${s}</div>`:''}</div>`;
function mtpCols(entradas, cor, fmt){   // colunas verticais simples: [[rótulo, valor, tip]]
  const max=Math.max(0.01,...entradas.map(e=>e[1]));
  return `<div class="mtp-cols">${entradas.map(([rot,v,tip])=>`<div class="mtp-col" data-tip="${escA(tip||`${rot}: ${fmt(v)}`)}"><div class="mtp-colb"><i style="height:${(v/max*100).toFixed(1)}%;background:${cor}"></i></div><div class="mtp-rot">${esc(rot)}</div></div>`).join('')}</div>`;
}
const mtpSinal=(s)=>s==='positivo'?'✅':(s==='atencao'?'⚠️':'▪️');
function mtpBars(pares, cor, fmt){ return pares.length?projBars(pares,cor,'data-mtp-x',fmt):'<div class="estado">Sem dados.</div>'; }

// ---- tela ----
function renderMeuTempo(){
  const cont=document.getElementById('conteudo'); const m=estado.meutempo; const gestor=souAprovador();
  const eu=mtpQuem();
  if(!eu&&!m.a){
    cont.replaceChildren(el(`<div><div class="card full"><h2>⏳ Como estou gastando meu tempo? <span>seu histórico de apontamentos, em gráficos e com análise por IA</span></h2>
      <div class="aviso">🔐 Para saber quem é você, a tela usa a sua identidade do Jira (e-mail + token de API), guardada só neste navegador. Configure em <b>⏱ Apontar → identifique-se</b> e volte aqui. <button class="btn" data-goto="apontar">⏱ Apontar</button></div></div></div>`));
    return;
  }
  mtpGarante(); const d=mtpDados(); const t=m.tempo[m.chave];
  const filtros=`<div class="ap-filtros">
    ${gestor?`<div class="campo"><label>Pessoa</label><select id="mtp-a">${Object.entries(pessoasUnidas()).filter(([a,p])=>!RE_EXCLUIR.test((p&&p.nome)||'')).sort((x,y)=>((x[1]&&x[1].nome)||'').localeCompare((y[1]&&y[1].nome)||'','pt')).map(([a,p])=>`<option value="${escA(a)}" ${m.a===a?'selected':''}>${esc((p&&p.nome)||a)}${a===eu?' (você)':''}</option>`).join('')}</select></div>`:''}
    <div class="campo"><label>De</label><input type="date" id="mtp-de" value="${escA(m.de||'')}"></div>
    <div class="campo"><label>Até</label><input type="date" id="mtp-ate" value="${escA(m.ate||'')}"></div>
    <div class="campo"><label>Atalhos</label><div class="ap-chips"><button class="chip" data-mtp-per="mes">Este mês</button><button class="chip" data-mtp-per="3m">3 meses</button><button class="chip" data-mtp-per="6m">6 meses</button><button class="chip" data-mtp-per="12m">12 meses</button><button class="chip" data-mtp-per="ano">Este ano</button></div></div></div>`;
  const cab=`<div class="card full"><h2>⏳ Como estou gastando meu tempo? <span>${esc(mtpNome(m.a))} · ${dataBR(m.de)} → ${dataBR(m.ate)}</span></h2>
    <div class="muted small">Todos os apontamentos da pessoa no período, lidos do Clockwork com o <b>comentário</b> de cada um: como o dia funciona, onde o tempo vai, com quem você divide tickets, o que os comentários revelam — e se os registros têm detalhe suficiente para essa leitura. A <b>análise por IA</b> fecha com um retrato e recomendações.</div>${filtros}</div>`;
  if(!d){
    cont.replaceChildren(el(`<div>${cab}<div class="card full">${m.tempoErro[m.chave]?`<div class="erro">${esc(m.tempoErro[m.chave])} <button class="btn" id="mtp-retry">Tentar de novo</button></div>`:skeletonPainel()}</div></div>`));
    return;
  }
  if(!d.wl.length){
    cont.replaceChildren(el(`<div>${cab}<div class="card full"><div class="estado">Nenhum apontamento de <b>${esc(mtpNome(m.a))}</b> entre ${dataBR(m.de)} e ${dataBR(m.ate)}. Amplie o período${gestor?' ou escolha outra pessoa':''}.</div></div></div>`));
    return;
  }
  const H=(s)=>mtpH(s/3600); const nDias=Object.keys(d.porDia).length; const temC=!!(t.meta&&t.meta.comentarios)||d.nCom>0;
  const hero=`<div class="vg-hero">
    ${mtpKpi(H(d.seg),'Horas apontadas','',`${d.wl.length} apontamento(s) · média ${H(d.wl.length?d.seg/d.wl.length:0)} cada`)}
    ${mtpKpi(String(nDias),'Dias com apontamento',nDias>=d.diasUteis*0.8?'good':(nDias>=d.diasUteis*0.5?'warn':'bad'),`de ${d.diasUteis} dia(s) útil(eis) · média ${H(nDias?d.seg/nDias:0)}/dia`)}
    ${mtpKpi(`${mtpPct(d.segFat,d.seg)}%`,'Faturável',mtpPct(d.segFat,d.seg)>=70?'good':(mtpPct(d.segFat,d.seg)>=50?'warn':''),`${H(d.segFat)} faturáveis · ${H(d.seg-d.segFat)} não`)}
    ${mtpKpi(String(d.tickets.size),'Tickets tocados','',`${d.projetos.size} projeto(s) · ${Math.round(d.tPorDia*10)/10} ticket(s) por dia`)}
    ${mtpKpi(d.qualidade.nota+'<span class="muted small">/100</span>','Qualidade dos dados',d.qualidade.nota>=70?'good':(d.qualidade.nota>=45?'warn':'bad'),d.qualidade.nota>=70?'dá para analisar bem':(d.qualidade.nota>=45?'análise parcial':'registros fracos para analisar'))}
    ${mtpKpi(`${mtpPct(d.nCom,d.wl.length)}%`,'Com comentário',mtpPct(d.nCom,d.wl.length)>=80?'good':(mtpPct(d.nCom,d.wl.length)>=50?'warn':'bad'),temC?`média de ${d.nCom?Math.round(d.chars/d.nCom):0} caracteres`:'comentários não disponíveis')}</div>`;
  // rotina
  const horas=Array.from({length:24},(_,h)=>[String(h).padStart(2,'0'),(d.porHora[h]||0)/3600]).filter(([,v],i)=>i>=6||v>0);
  const diasSem=[1,2,3,4,5,6,0].map(ds=>[MTP_DIAS[ds],(d.porDS[ds]||0)/3600]);
  const tamanhos=MTP_FAIXAS.map(([f])=>[f,d.tam[f].seg/3600,`${f}: ${d.tam[f].n} apontamento(s) · ${mtpH(d.tam[f].seg/3600)}`]);
  const rotina=`<section class="rm-bloco"><h3 class="mp-h3">🕘 Como funciona o meu dia</h3>
    <div class="rm-2col">
      <div><div class="mp-h3">Horas por hora do dia</div>${d.horarioDisponivel?mtpCols(horas,cores.cerceta,mtpH):'<div class="aviso">⚠ O horário de início não é registrado nos apontamentos (todos caem na mesma hora) — esta visão fica sem valor. Aponte com hora de início (Clockwork) ou pelo 📍 Meu dia.</div>'}
        ${d.horarioDisponivel&&d.iniMedio!=null?`<div class="muted small" style="margin-top:6px">Começa em média às <b>${mtpHora(d.iniMedio)}</b> e o último apontamento termina por volta das <b>${mtpHora(d.fimMedio)}</b>.</div>`:''}</div>
      <div><div class="mp-h3">Horas por dia da semana</div>${mtpCols(diasSem,cores.roxo,mtpH)}
        ${d.segFds?`<div class="muted small" style="margin-top:6px">⚠ ${H(d.segFds)} em fins de semana.</div>`:'<div class="muted small" style="margin-top:6px">Nada em fins de semana.</div>'}</div></div>
    <div class="rm-2col" style="margin-top:12px">
      <div><div class="mp-h3">Tamanho dos apontamentos</div>${mtpCols(tamanhos,cores.musgo,mtpH)}
        <div class="muted small" style="margin-top:6px">${d.oitoHoras?`<b>${d.oitoHoras}</b> bloco(s) de 8h fechados · `:''}${d.maisDe8?`<b>${d.maisDe8}</b> acima de 8h · `:''}média ${H(d.wl.length?d.seg/d.wl.length:0)} por apontamento.</div></div>
      <div><div class="mp-h3">Troca de contexto</div><div class="vg-hero rm-hero3">
        ${mtpKpi(String(Math.round(d.tPorDia*10)/10),'Tickets por dia',d.tPorDia<=3?'good':(d.tPorDia<=5?'warn':'bad'),`máximo ${d.tMax} num dia`)}
        ${mtpKpi(String(Math.round(d.pPorDia*10)/10),'Projetos por dia',d.pPorDia<=2?'good':'warn','')}
        ${mtpKpi(String(d.fragment),'Dias fragmentados',d.fragment?'warn':'good','5 ou mais tickets no dia')}</div></div></div>
    ${ctExpl('<b>hora do dia</b> soma as horas pelo horário de início de cada apontamento — mostra em que parte do dia o trabalho de fato acontece. <b>Tamanho dos apontamentos</b>: muitos blocos curtos = dia picado; blocos de 8h = o dia inteiro num ticket só (pobre para análise). <b>Troca de contexto</b>: quantos tickets e projetos diferentes você toca por dia — acima de 5 tickets num dia é fragmentação.')}</section>`;
  // onde vai o tempo
  const topTipos=d.sortSeg(d.porTipo).slice(0,10).map(([k,v])=>[k,v/3600,k]); const topProj=d.sortSeg(d.porProj).slice(0,10).map(([k,v])=>[projNome(k),v/3600,k]);
  const topCat=d.sortSeg(d.porCat).slice(0,8).map(([k,v])=>[k,v/3600,k]); const topEp=d.sortSeg(d.porEpico).slice(0,10).map(([k,v])=>[k?`${k} · ${(d.resumos[k]||'').slice(0,40)}`:'Sem épico',v/3600,k||'(sem épico)']);
  const sems=Object.keys(d.porSem).sort(); const serie=[{nome:'Horas na semana',cor:cores.cerceta,vals:sems.map(w=>({x:w,v:Math.round(d.porSem[w]/360)/10})),tipo:'area'}];
  const tempo=`<section class="rm-bloco"><h3 class="mp-h3">🧩 Onde vai o tempo</h3>
    <div class="rm-2col"><div><div class="mp-h3">Por tipo de ticket</div>${mtpBars(topTipos,cores.cerceta,mtpH)}</div>
      <div><div class="mp-h3">Por projeto</div>${mtpBars(topProj,cores.roxo,mtpH)}</div></div>
    <div class="rm-2col" style="margin-top:12px"><div><div class="mp-h3">Por categoria de projeto</div>${mtpBars(topCat,cores.amarelo,mtpH)}</div>
      <div><div class="mp-h3">Por épico</div>${mtpBars(topEp,cores.musgo,mtpH)}${d.segSemEpico?`<div class="muted small" style="margin-top:4px">${mtpPct(d.segSemEpico,d.seg)}% das horas em tickets sem épico.</div>`:''}</div></div>
    <div class="mp-h3" style="margin-top:12px">Semana a semana</div>${tsChart(serie,{fmt:v=>mtpH(v),xlabel:x=>{ const s=isoSemana(x); return `S${String(s.num).padStart(2,'0')}`; },h:170,metaY:sems.length?{v:Math.round(d.seg/3600/sems.length*10)/10}:null})}
    ${ctExpl('as horas do período somadas por <b>tipo de ticket</b>, <b>projeto</b>, <b>categoria</b> e <b>épico</b>. Clique numa barra para ver os tickets por trás. A linha tracejada da semana é a sua média semanal.')}</section>`;
  // top tickets
  const top=Object.values(d.porTicket).sort((a,b)=>b.seg-a.seg).slice(0,15);
  const rowsT=top.map(K=>`<tr><td><a href="${jiraBase()}/browse/${encodeURIComponent(K.k)}" target="_blank" rel="noopener"><b>${esc(K.k)}</b> ↗</a> <button class="btn rt-step" data-gx-det="${escA(K.k)}" data-tip="Ficha completa">🔍</button></td><td>${esc((d.resumos[K.k]||'').slice(0,70))}</td><td>${esc(K.t)}</td><td>${esc(projNome(K.p))}</td><td class="num">${H(K.seg)}</td><td class="num">${mtpPct(K.seg,d.seg)}%</td><td class="num">${K.n}</td><td class="num">${K.dias.size}</td><td class="num">${K.outros?H(K.outros):'—'}${K.quem.size?` <span class="muted small">(${K.quem.size})</span>`:''}</td></tr>`).join('');
  const tickets=`<section class="rm-bloco"><h3 class="mp-h3">🎫 Tickets que mais consumiram</h3>
    <div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Ticket</th><th>Resumo</th><th>Tipo</th><th>Projeto</th><th class="num">Horas</th><th class="num">%</th><th class="num">Apont.</th><th class="num">Dias</th><th class="num" data-tip="Horas de OUTRAS pessoas nesses tickets (colaboração)">Outros</th></tr></thead><tbody>${rowsT}</tbody></table></div>
    ${ctExpl('os tickets em que você mais gastou horas, quantas vezes e em quantos dias apontou neles, e quanto <b>outras pessoas</b> também trabalharam neles. Um ticket genérico no topo ("Reunião", "Diversos") é sinal de que o registro não conta a história.')}</section>`;
  // colaboração
  const colabs=Object.values(d.colab).sort((a,b)=>b.seg-a.seg).slice(0,10).map(C=>[mtpNome(C.a),C.seg/3600,C.a]);
  const coocorRows=d.coocor.map(x=>`<tr><td><b>${esc(x.a)}</b> <span class="muted small">${esc((d.resumos[x.a]||'').slice(0,40))}</span></td><td><b>${esc(x.b)}</b> <span class="muted small">${esc((d.resumos[x.b]||'').slice(0,40))}</span></td><td class="num">${x.dias}</td></tr>`).join('');
  const colab=`<section class="rm-bloco"><h3 class="mp-h3">🤝 Colaboração</h3>
    <div class="rm-2col"><div><div class="mp-h3">Quem também trabalha nos meus tickets <span class="mp-dim">${d.ticketsCompartilhados} de ${d.tickets.size} ticket(s) compartilhados</span></div>${colabs.length?projBars(colabs,cores.roxo,'data-mtp-pessoa',mtpH):'<div class="estado">Ninguém mais apontou nos seus tickets no período.</div>'}</div>
      <div><div class="mp-h3">Tickets que andam juntos <span class="mp-dim">no mesmo dia</span></div>${coocorRows?`<div class="scroll-x"><table class="mp-tab-mini"><thead><tr><th>Ticket A</th><th>Ticket B</th><th class="num">Dias juntos</th></tr></thead><tbody>${coocorRows}</tbody></table></div>`:'<div class="estado">Nenhum par de tickets se repete no mesmo dia.</div>'}</div></div>
    ${ctExpl('<b>colaboração</b> = outras pessoas apontando nos mesmos tickets que você (horas delas nesses tickets). <b>Tickets que andam juntos</b> = pares que você trabalhou no mesmo dia repetidas vezes — costumam ser dependências, um épico comum ou o mesmo assunto quebrado em dois tickets.')}</section>`;
  // comentários
  const classes=d.sortSeg(d.classes).map(([k,v])=>[k,v/3600,k]);
  const topPal=Object.entries(d.palavras).sort((a,b)=>b[1]-a[1]).slice(0,25);
  const maxPal=Math.max(1,...topPal.map(x=>x[1]));
  const nuvem=topPal.map(([p,n])=>`<span class="mtp-pal" style="font-size:${(11+Math.round(n/maxPal*12))}px" data-tip="${escA(`"${p}" aparece em ${n} apontamento(s)`)}">${esc(p)}</span>`).join(' ');
  const amostras=d.amostras.slice(0,12).map(x=>`<li><b>${esc(x.k)}</b> <span class="muted small">${esc(x.tipo)} · ${mtpH(x.h)}</span> — ${esc(x.texto)}</li>`).join('');
  const coment=`<section class="rm-bloco"><h3 class="mp-h3">📝 O que dizem os apontamentos</h3>
    ${temC?`<div class="rm-2col"><div><div class="mp-h3">Natureza do trabalho <span class="mp-dim">pelos comentários, títulos e tipos</span></div>${mtpBars(classes,cores.cerceta,mtpH)}</div>
      <div><div class="mp-h3">Palavras mais frequentes</div><div class="mtp-nuvem">${nuvem||'<span class="muted small">Sem comentários suficientes.</span>'}</div>
        <div class="muted small" style="margin-top:8px">${d.nCom} com comentário · ${d.nSem} sem · ${d.genericos} genérico(s) · ${d.repetidos} repetido(s) (mesmo texto 3+ vezes)</div></div></div>
      ${amostras?`<details class="rm-det"><summary>Amostras de comentários (${Math.min(12,d.amostras.length)})</summary><ul class="mtp-amostras">${amostras}</ul></details>`:''}`
      :'<div class="aviso">⚠ Os comentários dos apontamentos não vieram na leitura (versão antiga da API ou apontamentos sem texto). Atualize a página; se persistir, os registros não têm comentário.</div>'}
    ${ctExpl('cada apontamento é classificado pelo <b>texto do comentário</b> (e, na falta dele, pelo título e tipo do ticket) em reunião, desenvolvimento, suporte, análise, testes, documentação, gestão ou treinamento — é a leitura mais próxima do que você de fato fez. Comentários genéricos ("ajustes", "reunião") ou repetidos deixam essa leitura pobre.')}</section>`;
  // qualidade
  const q=d.qualidade; const partes=[['Comentários presentes',q.partes.comentarios,30],['Riqueza dos comentários',q.partes.riqueza,15],['Comentários específicos',q.partes.especificidade,10],['Horas com épico',q.partes.epico,15],['Tickets específicos',q.partes.tickets,10],['Granularidade',q.partes.granularidade,10],['Horário registrado',q.partes.horario,10]];
  const qual=`<section class="rm-bloco"><h3 class="mp-h3">🔍 Os dados permitem uma boa análise? <span class="mp-dim">nota ${q.nota}/100</span></h3>
    <div class="rm-2col"><div>${partes.map(([rot,v,max])=>`<div class="rp-wf"><div class="rp-wf-l">${esc(rot)}</div><div class="rp-wf-t"><i style="width:${(v/max*100).toFixed(0)}%;background:${v/max>=0.7?cores.musgo:(v/max>=0.4?cores.amarelo:'var(--err)')}"></i></div><div class="rp-wf-v">${v}/${max}</div></div>`).join('')}</div>
      <div>${q.problemas.length?`<div class="mp-h3">Problemas encontrados</div><ul class="mtp-lista">${q.problemas.map(p=>`<li>⚠ ${esc(p)}</li>`).join('')}</ul>`:'<div class="aviso ok">✅ Registros com bom nível de detalhe para a análise.</div>'}
        ${q.recs.length?`<div class="mp-h3" style="margin-top:8px">Como melhorar</div><ul class="mtp-lista">${q.recs.map(p=>`<li>💡 ${esc(p)}</li>`).join('')}</ul>`:''}</div></div>
    ${ctExpl('a nota mede se os apontamentos têm detalhe suficiente para responder "como gasto meu tempo": comentário em cada apontamento (e com conteúdo), tickets ligados a épicos, tickets específicos em vez de genéricos, dia quebrado em blocos e horário de início registrado. Quanto maior a nota, mais confiável é tudo o que está acima — e a análise por IA abaixo.')}</section>`;
  // IA
  const chaveIA=`${m.a}|${m.chave}`; const ia=m.ia[chaveIA]; const iaErr=m.iaErro[chaveIA]||''; const iaB=!!m.iaB[chaveIA];
  let iaHtml='';
  if(iaB) iaHtml='<div class="muted small">⏳ Lendo o período e escrevendo a análise… (leva alguns segundos)</div>';
  else if(iaErr.startsWith('cfg:')) iaHtml=`<div class="aviso">🤖 ${esc(iaErr.slice(4))}</div>`;
  else if(iaErr) iaHtml=`<div class="erro">${esc(iaErr)} <button class="btn" data-mtp-ia="1">Tentar de novo</button></div>`;
  else if(ia) iaHtml=`<div class="mp-iacard"><div class="mp-h3">${mtpSinal(ia.sinal)} Retrato do período</div><p>${esc(ia.resumo)}</p>
      ${ia.rotina.length?`<div class="mp-h3">🕘 Como o meu dia funciona</div><ul class="mtp-lista">${ia.rotina.map(x=>`<li><b>${esc(x.titulo)}</b> — ${esc(x.texto)}</li>`).join('')}</ul>`:''}
      ${ia.tempo.length?`<div class="mp-h3">🧩 Onde o tempo vai</div><ul class="mtp-lista">${ia.tempo.map(x=>`<li>${mtpSinal(x.sinal)} <b>${esc(x.titulo)}</b> — ${esc(x.texto)}</li>`).join('')}</ul>`:''}
      ${ia.colaboracao.length?`<div class="mp-h3">🤝 Colaboração</div><ul class="mtp-lista">${ia.colaboracao.map(x=>`<li><b>${esc(x.titulo)}</b> — ${esc(x.texto)}</li>`).join('')}</ul>`:''}
      <div class="mp-h3">🔍 Qualidade dos dados <span class="mp-dim">nota da IA: ${ia.qualidade.nota}/100</span></div><p>${esc(ia.qualidade.avaliacao)}</p>
      ${ia.qualidade.problemas.length?`<ul class="mtp-lista">${ia.qualidade.problemas.map(x=>`<li>⚠ ${esc(x)}</li>`).join('')}</ul>`:''}
      ${ia.qualidade.recomendacoes.length?`<ul class="mtp-lista">${ia.qualidade.recomendacoes.map(x=>`<li>💡 ${esc(x)}</li>`).join('')}</ul>`:''}
      ${ia.recomendacoes.length?`<div class="mp-h3">🎯 Para a próxima semana</div><ol class="mtp-lista">${ia.recomendacoes.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}
      <div style="margin-top:8px;display:flex;gap:8px;align-items:center"><button class="btn" data-mtp-ia="1">↻ Gerar de novo</button><span class="muted small">Gerada por IA a partir dos números e das amostras desta tela — confira antes de decisões.</span></div></div>`;
  else iaHtml=`<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn primario" data-mtp-ia="1">🤖 Gerar a análise por IA</button><span class="muted small">Envia os números agregados e até 60 amostras de comentários (sem dados sensíveis) e devolve o retrato do período, como o dia funciona, onde o tempo vai, colaboração, qualidade dos dados e recomendações.</span></div>`;
  const iaSec=`<section class="rm-bloco"><h3 class="mp-h3">🤖 Análise por IA</h3>${iaHtml}</section>`;
  cont.replaceChildren(el(`<div>${cab}<div class="card full">${hero}${rotina}${tempo}${tickets}${colab}${coment}${qual}${iaSec}</div></div>`));
}
// ---- drill: tickets por trás de uma barra ----
function mtpAbreTickets(tipo, chave){
  const d=mtpDados(); if(!d) return;
  const projMeta=d.projMeta; const por={};
  d.wl.forEach(w=>{
    if(tipo==='tipo'&&(w.t||'—')!==chave) return; if(tipo==='proj'&&w.p!==chave) return;
    if(tipo==='cat'&&(((projMeta[w.p]||{}).categoria)||'Sem categoria')!==chave) return;
    if(tipo==='epico'&&(w.e||'(sem épico)')!==chave) return;
    if(tipo==='classe'){ const c=String(w.c||'').trim(); const cl=mtpClasse(c)||mtpClasse(d.resumos[w.k]||'')||mtpClasse(w.t||'')||'Outros / sem descrição'; if(cl!==chave) return; }
    const k=w.k||'(sem ticket)'; const r=por[k]=por[k]||{k,p:w.p,t:w.t||'—',seg:0,n:0,coment:''}; r.seg+=Number(w.s)||0; r.n++; if(!r.coment&&w.c) r.coment=String(w.c).slice(0,90); });
  const lista=Object.values(por).sort((a,b)=>b.seg-a.seg);
  abreModal(`<h2>🎫 ${esc(chave)} <span class="muted small">${lista.length} ticket(s) · ${esc(dataBR(estado.meutempo.de))} → ${esc(dataBR(estado.meutempo.ate))}</span></h2>
    <div class="scroll-x" style="max-height:56vh;overflow:auto"><table class="mp-tab-mini"><thead><tr><th>Ticket</th><th>Resumo</th><th>Tipo</th><th class="num">Horas</th><th class="num">Apont.</th><th>Último comentário</th><th></th></tr></thead>
    <tbody>${lista.slice(0,120).map(x=>`<tr><td>${/^[A-Z]/.test(x.k)?`<a href="${jiraBase()}/browse/${encodeURIComponent(x.k)}" target="_blank" rel="noopener"><strong>${esc(x.k)}</strong> ↗</a>`:esc(x.k)}</td><td>${esc((d.resumos[x.k]||'').slice(0,60))}</td><td>${esc(x.t)}</td><td class="num">${fmtH(x.seg)}</td><td class="num">${x.n}</td><td class="muted small">${esc(x.coment)}</td><td>${/^[A-Z]/.test(x.k)?`<button class="btn rt-step" data-gx-det="${escA(x.k)}" data-tip="Ficha completa">🔍</button>`:''}</td></tr>`).join('')||'<tr><td colspan="7" class="mp-dim">Nada aqui.</td></tr>'}</tbody></table></div>
    <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`);
}
// ---- listeners delegados desta tela ----
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='meutempo') return; const m=estado.meutempo; const t=e.target; if(!t) return;
  if(t.id==='mtp-de'){ if(t.value) m.de=t.value; renderMeuTempo(); }
  else if(t.id==='mtp-ate'){ if(t.value) m.ate=t.value; renderMeuTempo(); }
  else if(t.id==='mtp-a'){ if(!souAprovador()) return; m.a=t.value; renderMeuTempo(); }
});
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='meutempo') return; const m=estado.meutempo;
  const bar=e.target.closest&&e.target.closest('[data-mtp-x]');
  if(bar){ const sec=bar.closest('section'); const h3=bar.closest('div')&&bar.closest('div').parentElement&&bar.closest('div').parentElement.querySelector('.mp-h3');
    const rot=(h3&&h3.textContent||'').toLowerCase(); const chave=bar.getAttribute('data-mtp-x');
    const tipo=/tipo de ticket/.test(rot)?'tipo':/projeto$|por projeto/.test(rot)?'proj':/categoria/.test(rot)?'cat':/épico|epico/.test(rot)?'epico':/natureza/.test(rot)?'classe':'tipo';
    mtpAbreTickets(tipo,chave); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-mtp-per')){ const p=t.getAttribute('data-mtp-per'); const h=hojeSP();
    m.de=p==='mes'?ctPrimeiroDiaMes(0):p==='3m'?ctPrimeiroDiaMes(-2):p==='6m'?ctPrimeiroDiaMes(-5):p==='12m'?ctPrimeiroDiaMes(-11):h.slice(0,4)+'-01-01'; m.ate=h; renderMeuTempo(); return; }
  if(t.id==='mtp-retry'){ delete m.tempoErro[m.chave]; renderMeuTempo(); return; }
  if(t.hasAttribute('data-mtp-ia')){ const chave=`${m.a}|${m.chave}`; const forca=!!m.ia[chave]||!!m.iaErro[chave]; delete m.ia[chave]; delete m.iaErro[chave]; mtpIaGera(forca); return; }
});
