// Jira Insights · 24b · 📆 HOJE — o planejamento do DIA como ponto central (2026-10-21, a pedido do usuário:
// "ajudar meu time a organizar seu trabalho, usar o Jira Insight como ponto central de planejamento do dia,
// incluindo controle da agenda, priorização de tarefas etc. — veja o que o mercado possui para inspiração").
//
// O que esta tela junta (inspiração: Sunsama, Akiflow, Toggl, Reclaim, MS To Do, Jira "For you"):
//   ✅ Lista do dia — itens (ticket do Jira, atividade do plano semanal, reunião da Agenda ou texto livre) na MINHA
//      ordem (arrastar / ↑↓), os 3 primeiros são o 🎯 foco; estimativa editável × capacidade do dia (meta − reuniões);
//      apontado hoje por item; ✓ feito; ⏱ apontar (com a hora do bloco); ▶ cronômetro; 📅 agendar; mover para amanhã.
//   ⚡ Ordenar por urgência — regra transparente: vencidos → vence hoje → 🎯 prioridade do time → em andamento →
//      vence esta semana → sem data; feitos no fim. Depois disso a ordem manual vale.
//   🕘 Linha do tempo — eventos do Outlook (ticket ✓ ou 📝 criar), blocos dos itens com hora, apontamentos com hora
//      real, "agora" e LACUNAS clicáveis (agendar um item ali / apontar ali). Arrastar um item para a linha = bloco.
//      🗓 "Reservar no Outlook" abre o compose do Outlook já preenchido (deep link) — a Agenda continua só leitura.
//   🌅 Planejar o dia (ritual da manhã: o que ficou do último dia planejado → sugestões por fonte, com o porquê →
//      estimativas × capacidade, "deixar para amanhã" ali mesmo) · 🌙 Fechar o dia (feitos/não feitos → amanhã,
//      feitos sem apontamento → ⏱ apontar em lote, nota para amanhã).
//   ⏱ Cronômetro (R001): pílula fixa em todas as telas, sobrevive ao F5, ■ vira worklog com a hora real de início.
//   👥 Dia do time (aba, só gestores): quem planejou/fechou o dia, feitos/total, planejado, apontado.
//
// ONDE GUARDA: POST /api/config?dia=1 — uma linha `dia_<accountId>_<AAAA-MM-DD>` por pessoa e dia na tabela da
// config (como as fotos `semanal_*`): é dado PESSOAL, nunca entra em `cfg` (que desce inteira para todo o time).
// `estado.hoje.dias[d]` = cópia da sessão (undefined = não lido · null = sem plano · objeto = o dia, com `rev`).
// Gravação com trava otimista (base = rev) e UMA gravação por vez (hjSalvar): conflito → a versão do servidor
// vence e a tela avisa. O cronômetro vive só em localStorage (jirainsight_timer_v1).
// REGRAS DO PROJETO respeitadas aqui: todo worklog passa por planGate(dia) ANTES do POST e por registraExtraDia
// depois; logAcao('apontar') como os demais pontos; o lote do fechamento grava a config UMA vez; leitores não
// criam objeto em cfg; listeners delegados ficam no fim deste arquivo.
const HJ_ORIG_ROT={ plano:'📋 plano da semana', venc:'⏰ vencido', hoje:'⏰ vence hoje', prio:'🎯 prioridade do time', andamento:'🔄 em andamento', reuniao:'📅 reunião', ontem:'↩ ficou de antes', manual:'✎ manual', busca:'🎫 busca', criado:'📝 criado aqui' };
const HJ_PX_HORA=48;            // altura de 1 hora na linha do tempo
const HJ_LACUNA_MIN=30;         // lacuna menor que isto não aparece
const HJ_TIMER_KEY='jirainsight_timer_v1';
const HJ_FOCO=3;                // os N primeiros itens são o 🎯 foco
const HJ_EXP_INI=8*60, HJ_EXP_FIM=18*60;   // expediente para procurar lacunas (minutos)

// ---------------- estado, identidade e leitura ----------------
function hjSt(){ const h=estado.hoje; const id=idApontar(); const acc=(id&&id.accountId)||'';
  if(h.a!==acc){ h.a=acc; h.dias={}; h.diasB={}; h.erro=''; h.erroEm=0; h.ritual=null; h.sug={}; h.time={}; h.timeB={}; h.timeErro=''; h.sv={}; h.sujo={}; h.salvando=0; h._salvaT={}; h._logsP=''; }   // trocou de identidade: nada da outra pessoa vale (gravação em voo da anterior é descartada pelo `acc` capturado)
  if(!h.sv) h.sv={}; if(!h.sujo||typeof h.sujo!=='object') h.sujo={}; if(!h._salvaT||typeof h._salvaT!=='object') h._salvaT={};
  return h; }
function hjAcc(){ const id=idApontar(); return (id&&id.accountId)||''; }
// O dia aberto. Virou o dia (aba aberta de madrugada): volta para hoje — senão o 🌅 planejaria ontem.
function hjD(){ const h=hjSt(); const hoje=hojeSP(); if(!h.d||!/^\d{4}-\d{2}-\d{2}$/.test(h.d)||(h.dRef&&h.dRef!==hoje)){ h.d=hoje; } h.dRef=hoje; return h.d; }
function hjVaiDia(d){ const h=hjSt(); h.d=d; h.dRef=hojeSP(); }
function hjSujo(d){ const h=hjSt(); return !!h.sujo[d||hjD()]; }
const HJ_MAX_ITENS=60;          // o servidor recusa o dia inteiro acima disso — a guarda fica aqui também
const hjEstClamp=(seg)=>Math.max(0,Math.min(24*3600,Math.round(Number(seg)||0)));
function hjDia(d){ const h=hjSt(); return h.dias[d||hjD()]; }   // undefined | null | {…}
function hjItens(d){ const x=hjDia(d); return (x&&Array.isArray(x.itens))?x.itens:[]; }
function hjNovoDia(d){ return { d, rev:'', st:'rascunho', itens:[], nota:'', planejadoEm:'', fechadoEm:'' }; }
function hjGaranteObj(d){ const h=hjSt(); if(!h.dias[d]) h.dias[d]=hjNovoDia(d); return h.dias[d]; }
function hjId(){ return 'i'+Math.random().toString(36).slice(2,9); }
function hjApi(body){ return fetch('/api/config?dia=1',{ method:'POST', headers:mpHeaders(), body:JSON.stringify(body) }).then(r=>r.json()); }
// Garante os dias [d−7, d] em memória (uma leitura em voo por intervalo). Devolve uma promessa com o dia (ou undefined na falha).
function hjGarante(d, forca){
  const h=hjSt(); if(!hjAcc()) return Promise.resolve(null);
  const de=mtsSoma(d,-7), ate=d, chave=`${de}|${ate}`;
  if(!forca){ let ok=true; for(let i=0;i<=7;i++){ if(h.dias[mtsSoma(de,i)]===undefined){ ok=false; break; } } if(ok) return Promise.resolve(h.dias[d]||null); }
  if(h.diasB[chave]) return h.diasB[chave];
  if(!forca&&h.erroEm&&Date.now()-h.erroEm<30000) return Promise.resolve(undefined);   // acabou de falhar: não insiste (cada render chama)
  const acc=hjAcc();
  const p=hjApi({ acao:'ler', de, ate }).then(j=>{
    if(estado.hoje.a!==acc) return undefined;   // trocou de identidade enquanto lia: o dia da pessoa anterior não entra
    if(!(j&&j.ok)) throw new Error((j&&j.erro)||'Falha ao ler o seu dia.');
    for(let i=0;i<=7;i++){ const x=mtsSoma(de,i); if((forca&&!h.sujo[x])||h.dias[x]===undefined) h.dias[x]=null; }
    // Dia já em memória NÃO é atropelado pela leitura (é a cópia em edição, com a rev): só o ↻ (forca, e sem edição
    // pendente naquele dia) e o conflito trocam
    (j.dias||[]).forEach(x=>{ if(x&&x.d){ if(!Array.isArray(x.itens)) x.itens=[]; if((forca&&!h.sujo[x.d])||!h.dias[x.d]) h.dias[x.d]=x; } });
    h.erro=''; h.erroEm=0; return h.dias[d]||null;
  }).catch(e=>{ if(estado.hoje.a===acc){ h.erro=humanizaErro(e); h.erroEm=Date.now(); } return undefined; })
    .then(x=>{ delete h.diasB[chave]; hjRedesenha(); return x; });
  h.diasB[chave]=p; return p;
}
function hjVistaAberta(){ return estado.vista==='hoje'||estado.vista==='hojetime'; }
function hjRedesenha(){ if(hjVistaAberta()){ try{ renderHoje(); }catch(e){} } else if(estado.vista==='acoes'){ try{ agendaRenderAcoes(); }catch(e){} } }
// Gravação: UMA por vez POR DIA (fila `h.sv[d]`); a que chega com outra no ar do mesmo dia sai depois, com o objeto atual e
// a rev nova. Dias diferentes gravam em paralelo e cada um tem o seu timer de debounce e a sua marca de "sujo".
function hjAgendaSalvar(d){ const h=hjSt(); d=d||hjD(); h.sujo[d]=true; hjPintaSalvando(); clearTimeout(h._salvaT[d]); h._salvaT[d]=setTimeout(()=>{ delete h._salvaT[d]; hjSalvar(d); },500); }
// Devolve true só quando o servidor confirmou ESTA gravação (false = conflito, recusa ou falha de rede).
function hjSalvar(d){
  const h=hjSt(); d=d||hjD(); const dia=h.dias[d]; if(!dia||!hjAcc()) return Promise.resolve(false);
  clearTimeout(h._salvaT[d]); delete h._salvaT[d];
  const q=h.sv[d]||(h.sv[d]={});
  if(q.p){ if(!q.prox) q.prox=q.p.then(()=>{ q.prox=null; return hjSalvar(d); }); return q.prox; }
  const acc=hjAcc(); h.salvando=(h.salvando||0)+1; hjPintaSalvando();
  const corpo={ st:dia.st, itens:dia.itens, nota:dia.nota||'', planejadoEm:dia.planejadoEm||'', fechadoEm:dia.fechadoEm||'' };
  const p=hjApi({ acao:'salvar', d, dia:corpo, base:dia.rev||'' }).then(j=>{
    if(estado.hoje.a!==acc) return false;   // trocou de identidade no meio: o resultado não é desta pessoa
    if(j&&j.ok&&j.dia){ const atual=h.dias[d]; j.dia.itens=Array.isArray(j.dia.itens)?j.dia.itens:[];
      // o servidor devolve o que gravou (rev nova); se a pessoa mexeu enquanto gravava, a cópia local segue na frente e grava de novo
      if(atual===dia){ dia.rev=j.dia.rev; } else { h.dias[d]=j.dia; }
      if(!h._salvaT[d]) h.sujo[d]=false; h.erro=''; return true; }
    if(j&&j.conflito){ h.dias[d]=j.dia?Object.assign({ itens:[] },j.dia):null; h.sujo[d]=false;
      toast('O seu dia foi alterado em outra aba/aparelho — recarreguei a versão mais nova.','warn'); hjRedesenha(); return false; }
    toast((j&&j.erro)||'Não consegui salvar o seu dia.','err'); return false;
  }).catch(e=>{ toast('Falha ao salvar o dia: '+humanizaErro(e),'err'); return false; })
    .then(ok=>{ q.p=null; h.salvando=Math.max(0,(h.salvando||1)-1); hjPintaSalvando(); return ok; });
  q.p=p; return p;
}
function hjPintaSalvando(){ const e=document.getElementById('hj-salvo'); if(!e) return; const h=estado.hoje; e.textContent=h.salvando?'salvando…':(hjSujo()?'alterações pendentes':'salvo'); }
// Contador da aba (ABAS_N): itens do dia de hoje ainda não feitos — só com o dado já em memória.
function hjPendentesN(){ const x=estado.hoje&&estado.hoje.dias&&estado.hoje.dias[hojeSP()]; if(!x||!Array.isArray(x.itens)) return null; return x.itens.filter(i=>!i.feito&&!i.movido).length; }

// ---------------- helpers de tempo ----------------
function hjMin(hhmm){ const m=/^(\d{2}):(\d{2})$/.exec(String(hhmm||'')); return m?(+m[1])*60+(+m[2]):null; }
function hjHHMM(min){ min=Math.max(0,Math.min(24*60-1,Math.round(min))); return `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`; }
function hjAgoraMin(){ try{ const p=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour12:false,hour:'2-digit',minute:'2-digit'}).format(new Date()); const [h,m]=p.split(':').map(Number); return h*60+m; }catch(e){ return 9*60; } }
function hjHoraSP(iso){ try{ return new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour12:false,hour:'2-digit',minute:'2-digit'}).format(new Date(iso)); }catch(e){ return ''; } }
function hjDiaSP(iso){ try{ return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(iso)); }catch(e){ return ''; } }
const hjH=(seg)=>seg?fmtH(seg):'0h';
function hjRotuloDia(d){ const hoje=hojeSP(); const dt=new Date(`${d}T12:00:00-03:00`);
  const sem=['domingo','segunda','terça','quarta','quinta','sexta','sábado'][dt.getUTCDay()];
  const base=`${sem}, ${d.slice(8,10)}/${d.slice(5,7)}`;
  return d===hoje?`Hoje · ${base}`:d===mtsSoma(hoje,1)?`Amanhã · ${base}`:d===mtsSoma(hoje,-1)?`Ontem · ${base}`:base; }
// Próximo dia com capacidade (dia útil sem feriado/ausência), até 14 dias à frente — senão d+1.
// Num dia passado, "amanhã" conta a partir de hoje (mover um item de segunda retrasada não pode cair numa terça que já passou).
function hjProxUtil(d){ const acc=hjAcc(); const base=d<hojeSP()?hojeSP():d; for(let i=1;i<=14;i++){ const x=mtsSoma(base,i); if(mpCapDia(acc,x)>0) return x; } return mtsSoma(base,1); }
function hjCapSeg(d){ return Math.round(mpCapDia(hjAcc(),d)*3600); }

// ---------------- o dia: eventos, apontamentos, derivadas ----------------
function hjEventosDia(d){
  const evs=((estado.agenda.dados||{}).eventos)||[];
  return evs.filter(ev=>ev&&(ev.inicio||'').slice(0,10)===d&&!ev.cancelado).sort((a,b)=>String(a.inicio).localeCompare(String(b.inicio)));
}
function hjAgendaCobre(d){ const ag=estado.agenda.dados; return !!(ag&&Array.isArray(ag.eventos)&&(!ag.de||d>=ag.de)&&(!ag.ate||d<=ag.ate)); }
function hjReunioesSeg(d){ return hjEventosDia(d).filter(ev=>!ev.diaTodo).reduce((s,ev)=>s+agDuracaoSeg(ev),0); }
function hjEvTicket(ev, d){ if(!ev) return ''; const t=agTicketDe(ev.id); if(t&&t.t) return t.t; const a=agAchadoDe(ev.id); if(a&&a.k) return a.k;
  const it=hjItens(d||hjD()).find(i=>i.ev===ev.id&&i.k); return it?it.k:''; }   // o item do dia ligado à reunião também vale
// Meus worklogs do dia (janela do Apontar + o que esta sessão apontou), com a hora quando o worklog tem.
function hjLogsDia(d){
  const out=minhasLogsEntre(d,d).map(w=>({ k:w.k||'', s:w.s, p:w.p||'', m:mtsMinSP(w.dt) }));
  (estado.apontar.extraLogs||[]).forEach(x=>{ if(x.d===d) out.push({ k:x.k||'', s:x.s, p:x.p||'', m:x.m!=null?x.m:null, extra:true }); });
  return out;
}
function hjApontadoSeg(d){ return minhasHorasPorDia()[d]||0; }
function hjApontadoPorTicket(d){ const por={}; hjLogsDia(d).forEach(w=>{ if(w.k) por[w.k]=(por[w.k]||0)+w.s; }); return por; }
function hjItemFim(it){ const a=hjMin(it.ini); if(a==null) return null; return a+Math.max(15,Math.round((it.est||0)/60)); }
// Intervalos ocupados (reuniões + blocos) e as lacunas do expediente (≥ 30 min).
function hjOcupados(d, semItem){
  const oc=[];
  hjEventosDia(d).forEach(ev=>{ if(ev.diaTodo) return; const a=hjMin((ev.inicio||'').slice(11,16)), b=hjMin((ev.fim||'').slice(11,16)); if(a!=null&&b!=null&&b>a) oc.push({ a, b, tipo:'ev', ev }); });
  hjItens(d).forEach(it=>{ if(it.feito||it.movido||!it.ini||it.id===semItem) return; const a=hjMin(it.ini), b=hjItemFim(it); if(a!=null&&b!=null) oc.push({ a, b, tipo:'it', it }); });
  return oc.sort((x,y)=>x.a-y.a);
}
function hjLacunas(d){
  const oc=hjOcupados(d); const out=[]; let cur=HJ_EXP_INI;
  oc.forEach(o=>{ if(o.a>cur&&o.a-cur>=HJ_LACUNA_MIN&&cur<HJ_EXP_FIM) out.push({ a:cur, b:Math.min(o.a,HJ_EXP_FIM) }); cur=Math.max(cur,o.b); });
  if(HJ_EXP_FIM-cur>=HJ_LACUNA_MIN) out.push({ a:cur, b:HJ_EXP_FIM });
  return out.filter(l=>l.b-l.a>=HJ_LACUNA_MIN);
}
// O item de uma reunião não conflita com a própria reunião (é o mesmo horário por definição).
function hjConflito(d, it){ const a=hjMin(it.ini), b=hjItemFim(it); if(a==null||b==null) return null;
  return hjOcupados(d, it.id).find(o=>o.a<b&&o.b>a&&!(o.tipo==='ev'&&it.ev&&o.ev&&o.ev.id===it.ev))||null; }
// Os itens que são reuniões da agenda (ev) — quando a agenda cobre o dia, as horas deles já saíram do "livre":
// não entram no "Planejado" (senão contavam duas vezes e acendiam um ⚠ falso).
function hjEhReuniaoContada(d, it){ return !!(it.ev&&hjAgendaCobre(d)); }
// Capacidade × planejado × apontado do dia.
function hjResumo(d){
  const itens=hjItens(d).filter(i=>!i.movido);
  const cap=hjCapSeg(d), reun=hjAgendaCobre(d)?hjReunioesSeg(d):null;
  const livre=Math.max(0,cap-(reun||0));
  const plan=itens.filter(i=>!i.feito&&!hjEhReuniaoContada(d,i)).reduce((s,i)=>s+(i.est||0),0);
  const planTot=itens.filter(i=>!hjEhReuniaoContada(d,i)).reduce((s,i)=>s+(i.est||0),0);
  const ap=hjApontadoSeg(d); const meta=metaSegDe(hjAcc())||8*3600;
  return { cap, reun, livre, plan, planTot, ap, meta, n:itens.length, feitos:itens.filter(i=>i.feito).length, acima:Math.max(0,plan-livre) };
}
// O último dia COM plano antes de d (até 7 dias), para o "o que ficou de…".
function hjUltimoPlanejado(d){ const h=hjSt(); for(let i=1;i<=7;i++){ const x=mtsSoma(d,-i); const v=h.dias[x]; if(v&&(v.itens||[]).length) return x; } return ''; }

// ---------------- sugestões (candidatos a entrar no dia) ----------------
// Cada candidato: { cid, k, t, p, est, orig, ev, ini, why }. Fontes: o que ficou de antes, 📋 plano da semana (o dia),
// ⏰ vencidos/vencem hoje (meus), 🎯 prioridades do time (minhas), 🔄 em andamento (meus), 📅 reuniões do dia, 🕑 recentes.
function hjSugestoes(d){
  const acc=hjAcc(); const h=hjSt(); const grupos=[]; const atuais=hjItens(d).filter(i=>!i.movido);   // o movido não está mais neste dia
  const temK=new Set(atuais.filter(i=>i.k).map(i=>i.k)), temEv=new Set(atuais.filter(i=>i.ev).map(i=>i.ev));
  const temT=new Set(atuais.filter(i=>!i.k&&!i.ev).map(i=>`${i.p}|${String(i.t||'').trim().toLowerCase()}`));
  const vistos=new Set();
  const add=(g, c)=>{ const chave=c.k?`k:${c.k}`:c.ev?`e:${c.ev}`:`t:${c.p}|${String(c.t||'').trim().toLowerCase()}`;
    if(vistos.has(chave)) return; if(c.k&&temK.has(c.k)) return; if(c.ev&&temEv.has(c.ev)) return; if(!c.k&&!c.ev&&temT.has(chave.slice(2))) return;
    vistos.add(chave); c.cid=chave; g.itens.push(c); };
  // ↩ o que ficou do último dia planejado
  const ult=hjUltimoPlanejado(d);
  if(ult){ const g={ id:'ontem', rot:`↩ Ficou de ${fmtBR(ult)}`, itens:[] };
    (h.dias[ult].itens||[]).filter(i=>!i.feito&&!i.movido).forEach(i=>add(g,{ k:i.k, t:i.t, p:i.p, est:i.est||0, orig:'ontem', ev:'', why:`não feito em ${fmtBR(ult)}` }));
    if(g.itens.length) grupos.push(g); }
  // 📋 plano da semana (atividades do dia)
  const w=semChave(d); mpGaranteMeu(w); const pl=mpPlano(w);
  if(pl&&(pl.itens||[]).some(i=>i.data===d)){ const g={ id:'plano', rot:'📋 Do seu planejamento da semana', itens:[] };
    pl.itens.filter(i=>i.data===d).forEach(i=>add(g,{ k:'', t:i.descricao||'', p:i.projeto||'', est:Math.round((Number(i.horas)||0)*3600), orig:'plano', ev:'', why:`${fmtHd(Number(i.horas)||0)} planejadas` }));
    if(g.itens.length) grupos.push(g); }
  // ⏰ vencidos e vence hoje (meus) + 🔄 em andamento (meus)
  const ax=estado.acoes; if(!ax.venc&&!ax.carregando&&!ax.erro){ try{ axCarregaVenc(false); }catch(e){} }
  const tks=((ax.venc||{}).tickets||[]).filter(t=>t.respId===acc);
  const hoje=hojeSP();
  const gV={ id:'venc', rot:'⏰ Vencidos', itens:[] }, gH={ id:'hoje', rot:'⏰ Vencem hoje', itens:[] }, gA={ id:'andamento', rot:'🔄 Em andamento (seus)', itens:[] };
  tks.slice().sort((x,y)=>String(x.venc||'9').localeCompare(String(y.venc||'9'))).forEach(t=>{
    const est=Math.max(0,(Number(t.est)||0)-(Number(t.seg)||0));
    if(t.venc&&t.venc<d) add(gV,{ k:t.k, t:t.resumo||'', p:t.p, est, orig:'venc', ev:'', why:`venceu ${fmtBR(t.venc)}${t.venc<hoje?` (há ${Math.round((Date.parse(hoje)-Date.parse(t.venc))/86400000)} d)`:''}` });
    else if(t.venc===d) add(gH,{ k:t.k, t:t.resumo||'', p:t.p, est, orig:'hoje', ev:'', why:'vence hoje' });
    else if(/andamento|progress|fazendo|execu/i.test(t.status||'')) add(gA,{ k:t.k, t:t.resumo||'', p:t.p, est, orig:'andamento', ev:'', why:t.status||'em andamento' });
  });
  // 🎯 prioridades do time (atribuídas a mim)
  const pr=estado.prioridades; if(!pr.dados&&!pr.carregando&&!pr.erro){ try{ prGarante(false); }catch(e){} }
  const gP={ id:'prio', rot:'🎯 Prioridades do time (suas)', itens:[] };
  ((pr.dados||{}).prioridades||[]).filter(t=>t.respId===acc).forEach(t=>add(gP,{ k:t.k, t:t.resumo||'', p:t.p, est:0, orig:'prio', ev:'', why:'prioridade da semana' }));
  [gV,gH,gP,gA].forEach(g=>{ if(g.itens.length) grupos.push(g); });
  // 📅 reuniões do dia (as que precisam de ticket/apontamento)
  if(hjAgendaCobre(d)){ const g={ id:'reuniao', rot:'📅 Reuniões de hoje', itens:[] };
    hjEventosDia(d).forEach(ev=>{ if(ev.diaTodo||ev.privado||agIgnorado(ev)) return;
      add(g,{ k:hjEvTicket(ev), t:ev.titulo||'', p:'', est:agDuracaoSeg(ev), orig:'reuniao', ev:ev.id, ini:(ev.inicio||'').slice(11,16), why:`${(ev.inicio||'').slice(11,16)}–${(ev.fim||'').slice(11,16)}${hjEvTicket(ev)?'':' · sem ticket'}` }); });
    if(g.itens.length) grupos.push(g); }
  // 🕑 recentes (onde apontei nos últimos 14 dias)
  try{ apCarregaRecentes(); }catch(e){}
  const gR={ id:'rec', rot:'🕑 Tickets recentes', itens:[] };
  apRecentesDe().forEach(r=>add(gR,{ k:r.k, t:r.resumo||'', p:r.p, est:0, orig:'busca', ev:'', why:`apontou ${fmtH(r.seg)} até ${fmtBR(r.ult)}` }));
  if(gR.itens.length) grupos.push(gR);
  return grupos;
}
// Pontuação de urgência (menor = mais urgente), usada pelo ⚡ e pela ordem padrão do ritual.
function hjUrgencia(it, d){
  if(it.feito) return 900;
  const acc=hjAcc(); const t=it.k?(((estado.acoes.venc||{}).tickets)||[]).find(x=>x.k===it.k):null;
  const venc=t?String(t.venc||''):'';
  if(it.orig==='reuniao'&&it.ini) return 50+ (hjMin(it.ini)||0)/10000;
  if(venc&&venc<d) return 100-Math.min(60,Math.round((Date.parse(d)-Date.parse(venc))/86400000));
  if(it.orig==='venc') return 100;
  if(venc===d||it.orig==='hoje') return 200;
  if(it.orig==='prio'||(t&&(t.labels||[]).includes('prioridade-semana'))) return 300;
  if(it.orig==='andamento'||(t&&/andamento|progress|fazendo|execu/i.test(t.status||''))) return 400;
  if(venc&&venc<=mtsSoma(d,7)) return 500;
  if(it.orig==='plano') return 600;
  if(it.orig==='ontem') return 650;
  return venc?700:800;
}
function hjOrdenaUrgencia(d){ const dia=hjGaranteObj(d); const idx=new Map(dia.itens.map((it,i)=>[it.id,i]));
  dia.itens.sort((a,b)=>hjUrgencia(a,d)-hjUrgencia(b,d)||idx.get(a.id)-idx.get(b.id)); hjAgendaSalvar(d); }

// ---------------- mutações da lista ----------------
function hjAdiciona(d, c, opts){
  const o=opts||{};
  if(hjDia(d)===undefined){ if(!o.quieto) toast('O seu dia ainda está sendo lido — tente de novo em instantes.','warn'); return null; }   // sem a rev, a gravação viraria conflito e o item sumiria
  const dia=hjGaranteObj(d);
  if(c.k&&dia.itens.some(i=>i.k===c.k&&!i.movido)){ if(!o.quieto) toast(`${c.k} já está no seu dia.`,'info'); return null; }
  if(c.ev&&dia.itens.some(i=>i.ev===c.ev&&!i.movido)){ if(!o.quieto) toast('Essa reunião já está no seu dia.','info'); return null; }
  if(dia.itens.length>=HJ_MAX_ITENS){ if(!o.quieto) toast(`Máximo de ${HJ_MAX_ITENS} itens num dia — tire ou mova alguns antes.`,'warn'); return null; }
  const it={ id:hjId(), k:String(c.k||'').toUpperCase(), t:String(c.t||'').trim().slice(0,200), p:String(c.p||(c.k?String(c.k).split('-')[0]:'')).toUpperCase(),
    est:hjEstClamp(c.est), feito:false, feitoEm:'', ini:c.ini||'', orig:c.orig||'manual', ev:c.ev||'', nota:'', movido:'' };
  if(dia.st==='fechado'){ dia.st='planejado'; }   // mexeu depois de fechar: o dia reabre
  if(o.inicio) dia.itens.unshift(it); else dia.itens.push(it);
  if(!o.semSalvar) hjAgendaSalvar(d);
  return it;
}
function hjItem(d, id){ return hjItens(d).find(i=>i.id===id)||null; }
function hjRemove(d, id){ const dia=hjGaranteObj(d); dia.itens=dia.itens.filter(i=>i.id!==id); hjAgendaSalvar(d); }
function hjToggleFeito(d, id, v){ const it=hjItem(d,id); if(!it) return; it.feito=v==null?!it.feito:!!v; it.feitoEm=it.feito?new Date().toISOString():''; hjAgendaSalvar(d); }
function hjMove(d, id, delta){ const dia=hjGaranteObj(d); const i=dia.itens.findIndex(x=>x.id===id); const j=i+delta; if(i<0||j<0||j>=dia.itens.length) return;
  const [it]=dia.itens.splice(i,1); dia.itens.splice(j,0,it); hjAgendaSalvar(d); }
function hjMovePara(d, id, pos){ const dia=hjGaranteObj(d); const i=dia.itens.findIndex(x=>x.id===id); if(i<0) return;
  const [it]=dia.itens.splice(i,1); dia.itens.splice(Math.max(0,Math.min(dia.itens.length,pos)),0,it); hjAgendaSalvar(d); }
// Leva itens para OUTRO dia: lê o destino (falha → nada muda), põe os itens lá e grava o destino PRIMEIRO; só com o servidor
// confirmando é que a origem marca `movido`. Conflito/falha no destino → os itens voltam a ser só da origem (nada some).
// Devolve { ok, prox, n } — quem chama grava a origem.
async function hjLevaPara(d, itens, prox){
  prox=prox||hjProxUtil(d); const h=hjSt();
  if(!itens.length) return { ok:true, prox, n:0 };
  const lido=await hjGarante(prox);
  if(lido===undefined){ toast(`Não consegui ler o dia ${fmtBR(prox)} — nada foi movido. Tente de novo.`,'err'); return { ok:false, prox, n:0 }; }
  const novos=[];
  itens.forEach(i=>{ const n=hjAdiciona(prox,{ k:i.k, t:i.t, p:i.p, est:i.est, orig:'ontem', ev:'' },{ quieto:true, semSalvar:true }); if(n) novos.push(n); });
  const ok=await hjSalvar(prox);
  if(!ok){ const dp=h.dias[prox]; if(dp&&Array.isArray(dp.itens)){ const ids=new Set(novos.map(n=>n.id)); dp.itens=dp.itens.filter(x=>!ids.has(x.id)); }
    toast(`O dia ${fmtBR(prox)} não gravou — nada foi movido.`,'err'); return { ok:false, prox, n:0 }; }
  itens.forEach(i=>{ i.movido=prox; i.ini=''; });
  return { ok:true, prox, n:itens.length };
}
// Mover para o próximo dia útil: o item nasce lá (orig 'ontem', sem bloco) e aqui fica marcado `movido`.
async function hjParaAmanha(d, id){
  const it=hjItem(d,id); if(!it||it.movido) return;
  const r=await hjLevaPara(d,[it]); if(!r.ok){ hjRedesenha(); return; }
  hjAgendaSalvar(d);
  toast(`↪ ${it.k||it.t} foi para ${fmtBR(r.prox)}.`,'ok'); hjRedesenha();
}
function hjAgenda(d, id, ini){ const it=hjItem(d,id); if(!it) return; it.ini=ini||''; if(it.ini&&!it.est) it.est=3600; hjAgendaSalvar(d); }
function hjSetEst(d, id, seg){ const it=hjItem(d,id); if(!it) return; it.est=hjEstClamp(seg); hjAgendaSalvar(d); }
// Ticket entrou pela chave (texto ou busca sem ficha): completa resumo/projeto/estimativa pela ficha.
async function hjEnriquece(d, itId){
  const it0=hjItem(d,itId); if(!it0||!it0.k) return;
  try{ const j=await fetch(`/api/vencimentos?detalhe=${encodeURIComponent(it0.k)}`).then(r=>r.json());
    const x=hjItem(d,itId); if(!x) return;
    if(j&&!j.erro){ x.t=x.t||j.resumo||''; x.p=j.p||x.p; if(!x.est&&j.est) x.est=hjEstClamp(j.est-(j.seg||0)); hjAgendaSalvar(d); hjRedesenha(); }
    else if(!x.t){ x.t='(ticket não encontrado — confira a chave)'; hjRedesenha(); } }catch(e){}
}

// ---------------- adicionar por texto / chave / busca ----------------
// Chave de ticket (ABC-123) → confere pela ficha e entra com o resumo; texto livre → item livre no projeto escolhido.
async function hjAdicionaTexto(d, txt, proj){
  txt=String(txt||'').trim(); if(!txt) return;
  const m=/^([A-Za-z][A-Za-z0-9_]*-\d+)\b\s*(.*)$/.exec(txt);
  if(m){ const k=m[1].toUpperCase(); const resto=m[2].trim();
    const it=hjAdiciona(d,{ k, t:resto, p:k.split('-')[0], est:0, orig:'busca' }); if(!it) return;
    hjRedesenha(); await hjEnriquece(d, it.id);
    return; }
  hjAdiciona(d,{ k:'', t:txt, p:proj||'', est:0, orig:'manual' }); hjRedesenha();
}
// 🎫 busca de tickets no modo "escolher" (12b): o ticket escolhido entra no dia (ou vira a chave de um item livre).
// `depois(it)` roda com o item já ligado — é o que faz o ⏱ de um item sem ticket seguir para o apontamento.
function hjBuscaParaDia(d, idItem, depois){
  abreBuscaTickets('', (k, info)=>{ info=info||{};
    if(idItem){ const it=hjItem(d,idItem); if(it){ it.k=k; it.p=info.p||k.split('-')[0]; if(!it.t) it.t=info.resumo||''; hjAgendaSalvar(d); hjRedesenha(); toast(`🎫 ${k} ligado ao item.`,'ok'); if(!info.resumo) hjEnriquece(d,it.id); if(depois) depois(it); } return; }
    const it=hjAdiciona(d,{ k, t:info.resumo||'', p:info.p||k.split('-')[0], est:0, orig:'busca' }); if(it){ hjRedesenha(); toast(`🎫 ${k} entrou no seu dia.`,'ok'); if(!info.resumo) hjEnriquece(d,it.id); if(depois) depois(it); }
  });
}

// ---------------- 📝 criar tickets a partir do dia (2026-10-22, a pedido do usuário: "criar tickets em massa ou
// individualmente, não apenas criar uma tarefa e ligar a um ticket") ----------------
// Um modal com LINHAS — uma por ticket, cada uma com o seu projeto, tipo e estimativa (o dia mistura projetos). Entra por:
// 📝 Criar ticket na linha de adicionar (o texto digitado vira a 1ª linha), ⋯ › 📝 Criar o ticket deste item (tarefa livre)
// e "📝 Criar tickets dos N itens livres" (em massa). O lote vai ao /api/criar como o 📝 Criar ticket (mesma validação,
// token da pessoa); cada ticket criado entra no dia com a chave (ou vira a chave do item livre de onde saiu). Linha que
// falhou fica no modal com o erro e "↻ Tentar de novo" só reenvia o que falhou — o criado nunca é recriado.
let _hjCr=null;
const HJ_CR_PROJ_KEY='jirainsight_hoje_criar_proj';
function hjProjetosCriacao(){
  const pl=estado.planejar; if(Array.isArray(pl.projetos)) return Promise.resolve(pl.projetos);
  if(pl._hjProjP) return pl._hjProjP;
  pl._hjProjP=fetch('/api/projetos').then(r=>r.json()).then(j=>{ if(j&&j.erro) throw new Error(j.erro); pl.projetos=(j&&j.projetos)||[]; pl.projetosErro=''; return pl.projetos; })
    .finally(()=>{ pl._hjProjP=null; });
  return pl._hjProjP;
}
// Tipos que dá para criar direto no projeto (nível 0, não sub-tarefa) e o padrão (Tarefa/Task, senão o primeiro).
function hjTiposDe(p){ const pr=(estado.planejar.projetos||[]).find(x=>x.key===p); return ((pr&&pr.tipos)||[]).filter(t=>!t.subtarefa&&t.nivel===0); }
function hjTipoPadrao(p){ const ts=hjTiposDe(p); const t=ts.find(x=>/tarefa|task/i.test(x.nome||''))||ts[0]; return t?t.id:''; }
// Estimativa do item (segundos) no formato do Jira ("1h 30m") — o servidor confere `\d+[wdhm]`.
function hjEstJira(seg){ seg=hjEstClamp(seg); if(!seg) return ''; const h=Math.floor(seg/3600), m=Math.round((seg%3600)/60); return [h?`${h}h`:'', m?`${m}m`:''].filter(Boolean).join(' '); }
function hjCrLinha(x){ return { rid:hjId(), itemId:x.itemId||'', resumo:String(x.resumo||'').trim().slice(0,255), desc:String(x.desc||'').trim(), p:String(x.p||'').toUpperCase(), tipoId:x.tipoId||'', estTxt:x.est?fmtH(hjEstClamp(x.est)):'', erro:'', key:'' }; }
// Abre o modal. `o.ids` = itens livres do dia que viram tickets · `o.texto`/`o.proj` = o que estava na linha de adicionar.
function hjCriarModal(d, o){
  o=o||{}; const idp=idApontar(); if(!idp){ abreIdentidade(); return; }
  if(hjDia(d)===undefined){ toast('O seu dia ainda está sendo lido — tente de novo em instantes.','warn'); return; }
  let lembrado=''; try{ lembrado=localStorage.getItem(HJ_CR_PROJ_KEY)||''; }catch(e){}
  const padrao=String(o.proj||lembrado||'').toUpperCase();
  const linhas=[];
  (o.ids||[]).forEach(id=>{ const it=hjItem(d,id); if(it&&!it.k&&!it.ev) linhas.push(hjCrLinha({ itemId:it.id, resumo:it.t, p:it.p||padrao, est:it.est })); });
  if(o.texto&&String(o.texto).trim()) linhas.push(hjCrLinha({ resumo:o.texto, p:padrao }));
  if(!linhas.length) linhas.push(hjCrLinha({ p:padrao }));
  _hjCr={ d, linhas, venc:d, resp:'eu', enviando:false, fb:null, cola:false, acc:hjAcc() };
  abreModal('<div class="hj-modal hj-cr"><h2>📝 Criar tickets</h2><div class="estado">Carregando os projetos do Jira…</div></div>');
  hjProjetosCriacao().then(()=>{ const m=_hjCr; if(!m||!hjCrAberto()) return; m.linhas.forEach(l=>{ if(!l.tipoId) l.tipoId=hjTipoPadrao(l.p); }); hjCriarPinta(); })
    .catch(e=>{ const m=_hjCr; if(!m||!hjCrAberto()) return; m.fb={ txt:'Não consegui listar os projetos do Jira: '+humanizaErro(e), cls:'err' }; m.semProjetos=true; hjCriarPinta(); });
}
function hjCrAberto(){ const m=document.getElementById('modal'); return !!(_hjCr&&m&&!m.hidden&&document.querySelector('#modal-body .hj-cr')); }
function hjCriarPinta(){
  const m=_hjCr; if(!m||!hjCrAberto()) return; const box=document.querySelector('#modal-body .hj-cr'); if(!box) return;
  const ae=document.activeElement; const foco=ae&&ae.id; let sel0=null; try{ sel0=ae&&ae.selectionStart; }catch(e){}
  const projs=(estado.planejar.projetos||[]).slice().sort((a,b)=>String(a.nome||a.key).localeCompare(String(b.nome||b.key),'pt-BR'));
  const optP=(sel)=>`<option value="">projeto…</option>${projs.map(p=>`<option value="${escA(p.key)}" ${p.key===sel?'selected':''}>${esc(p.nome||p.key)}</option>`).join('')}`;
  const optT=(p,sel)=>{ const ts=hjTiposDe(p); return ts.length?ts.map(t=>`<option value="${escA(t.id)}" ${t.id===sel?'selected':''}>${esc(t.nome)}</option>`).join(''):'<option value="">— sem tipo —</option>'; };
  const pend=m.linhas.filter(l=>!l.key); const criados=m.linhas.filter(l=>l.key);
  const rows=m.linhas.map((l,i)=>l.key
    ?`<div class="hj-cr-row ok" data-hj-cr-rid="${escA(l.rid)}"><span class="hj-cr-ok">✓ <a href="${jiraBase()}/browse/${encodeURIComponent(l.key)}" target="_blank" rel="noopener"><b>${esc(l.key)}</b></a> ${esc(l.resumo)}<span class="muted small"> · já está no seu dia</span></span></div>`
    :`<div class="hj-cr-row${l.erro?' err':''}" data-hj-cr-rid="${escA(l.rid)}">
      <input type="text" id="hj-cr-resumo-${i}" data-hj-cr-resumo="${escA(l.rid)}" value="${escA(l.resumo)}" maxlength="255" placeholder="título do ticket${l.desc?'':' (título ; descrição)'}" aria-label="Título do ticket">
      <select id="hj-cr-p-${i}" data-hj-cr-p="${escA(l.rid)}" aria-label="Projeto">${optP(l.p)}</select>
      <select id="hj-cr-tipo-${i}" data-hj-cr-tipo="${escA(l.rid)}" aria-label="Tipo" ${hjTiposDe(l.p).length?'':'disabled'}>${optT(l.p,l.tipoId)}</select>
      <input type="text" id="hj-cr-est-${i}" class="hj-cand-est${l.estTxt&&l.estTxt.trim()&&parseTempo(l.estTxt)==null?' invalido':''}" data-hj-cr-est="${escA(l.rid)}" value="${escA(l.estTxt)}" placeholder="est." aria-label="Estimativa">
      <button class="btn hj-b" data-hj-cr-rm="${escA(l.rid)}" title="Tirar esta linha" aria-label="Tirar esta linha" ${m.linhas.filter(x=>!x.key).length>1?'':'disabled'}>✕</button>
      ${l.itemId?'<span class="hj-cr-tag muted small">↳ do item do dia</span>':''}${l.desc?`<span class="hj-cr-tag muted small" title="${escA(l.desc)}">📄 com descrição</span>`:''}
      ${l.erro?`<div class="hj-cr-err">✕ ${esc(l.erro)}</div>`:''}
    </div>`).join('');
  const nome=(idApontar()||{}).nome||(idApontar()||{}).email||'você';
  box.innerHTML=`<h2>📝 Criar tickets <span class="muted small">${esc(hjRotuloDia(m.d))} · cada ticket criado entra no seu dia</span></h2>
    <div class="muted small">Uma linha por ticket, com o projeto e o tipo de cada um. ↵ pula para a próxima linha (e cria uma nova no fim); Ctrl+↵ cria os tickets. "título ; descrição" leva a descrição.</div>
    ${m.semProjetos?'':`<div class="hj-cr-rows" id="hj-cr-rows">${rows}</div>
    <div class="hj-cr-tools"><button class="btn" data-hj-cr-add>+ linha</button><button class="btn" data-hj-cr-cola-abre>${m.cola?'📋 fechar a colagem':'📋 colar várias linhas'}</button>
      ${criados.length?`<span class="muted small">${criados.length} criado(s)</span>`:''}</div>
    ${m.cola?`<div class="campo full"><textarea id="hj-cr-cola" rows="4" placeholder="uma linha por ticket — título ; descrição&#10;Rever cadastro de fornecedores ; conferir os 12 do lote de outubro&#10;Ajustar relatório de caixa">${esc(m.colaTxt||'')}</textarea><div style="margin-top:4px"><button class="btn" data-hj-cr-cola-ok>↓ Adicionar as linhas</button> <span class="muted small">no projeto da última linha</span></div></div>`:''}
    <div class="rv-form" style="margin-top:10px">
      <div class="campo"><label>📅 Vencimento <span class="muted small">(todos)</span></label><input type="date" id="hj-cr-venc" value="${escA(m.venc||'')}"></div>
      <div class="campo"><label>👤 Responsável <span class="muted small">(todos)</span></label><select id="hj-cr-resp"><option value="eu" ${m.resp==='eu'?'selected':''}>${esc(nome)} (você)</option><option value="" ${m.resp===''?'selected':''}>— sem responsável —</option></select></div>
    </div>
    <div class="muted small" style="margin-top:6px">Criados no Jira com o <strong>seu usuário</strong>, como no 📝 Criar ticket; a estimativa da linha vai para o ticket e para o item do dia.</div>`}
    <div class="ap-fb ${m.fb?escA(m.fb.cls):''}" id="hj-cr-fb" ${m.fb?'':'hidden'}>${m.fb?esc(m.fb.txt):''}</div>
    <div class="alx-modal-acoes">${m.semProjetos?'':`<button class="btn primario" data-hj-cr-ok ${m.enviando?'disabled':''}>${m.linhas.some(l=>l.erro)?'↻ Tentar de novo':`✓ Criar ${pend.length} ticket(s)`}</button>`}<button class="btn" data-hj-fecha>${criados.length&&!pend.length?'Fechar':'Cancelar'}</button></div>`;
  if(foco){ const f=document.getElementById(foco); if(f){ f.focus(); try{ if(sel0!=null&&f.setSelectionRange) f.setSelectionRange(sel0,sel0); }catch(e){} } }
}
// Lê o DOM para o estado (o redesenho acontece a cada mudança de projeto/linha e não pode apagar o que está sendo digitado).
function hjCriarLe(){
  const m=_hjCr; if(!m) return;
  m.linhas.forEach(l=>{ if(l.key) return; const r=document.querySelector(`#modal-body [data-hj-cr-resumo="${CSS.escape(l.rid)}"]`); if(r){ const v=r.value; const i=v.indexOf(';'); if(i>=0&&!l.desc){ l.resumo=v.slice(0,i).trim().slice(0,255); l.desc=v.slice(i+1).trim(); } else l.resumo=v.trim().slice(0,255); }
    const p=document.querySelector(`#modal-body [data-hj-cr-p="${CSS.escape(l.rid)}"]`); if(p) l.p=String(p.value||'').toUpperCase();
    const t=document.querySelector(`#modal-body [data-hj-cr-tipo="${CSS.escape(l.rid)}"]`); if(t) l.tipoId=t.value||'';
    const e=document.querySelector(`#modal-body [data-hj-cr-est="${CSS.escape(l.rid)}"]`); if(e) l.estTxt=e.value; });
  const v=document.getElementById('hj-cr-venc'); if(v) m.venc=v.value||'';
  const rs=document.getElementById('hj-cr-resp'); if(rs) m.resp=rs.value;
  const c=document.getElementById('hj-cr-cola'); if(c) m.colaTxt=c.value;
}
function hjCriarFb(txt, cls){ const m=_hjCr; if(m) m.fb=txt?{ txt, cls:cls||'' }:null; const fb=document.getElementById('hj-cr-fb'); if(!fb) return; fb.hidden=!txt; fb.className='ap-fb '+(cls||''); fb.textContent=txt||''; }
function hjCriarAddLinha(x){ const m=_hjCr; if(!m) return null; const ult=m.linhas.filter(l=>!l.key).slice(-1)[0]; const l=hjCrLinha(Object.assign({ p:(ult&&ult.p)||'' }, x||{})); if(!l.tipoId) l.tipoId=hjTipoPadrao(l.p); m.linhas.push(l); return l; }
// Valida tudo ANTES de mandar (o servidor confere de novo): título, projeto com tipo, estimativa, vencimento, teto do dia.
function hjCriarValida(){
  const m=_hjCr; const pend=m.linhas.filter(l=>!l.key);
  if(!pend.length) return 'Nada para criar.';
  for(const l of pend){ l.erro='';
    if(!l.resumo) l.erro='Dê um título ao ticket.';
    else if(l.resumo.length>255) l.erro='Título com mais de 255 caracteres.';
    else if(!l.p) l.erro='Escolha o projeto.';
    else if(!l.tipoId) l.erro='Este projeto não tem um tipo de ticket que dê para criar daqui — use o 📝 Criar ticket.';
    else if(l.estTxt&&l.estTxt.trim()&&parseTempo(l.estTxt)==null) l.erro='Estimativa inválida — use 1h30, 45m ou 2:15.'; }
  if(pend.some(l=>l.erro)) return 'Corrija as linhas marcadas.';
  if(m.venc&&!/^\d{4}-\d{2}-\d{2}$/.test(m.venc)) return 'Vencimento inválido.';
  if(pend.length>100) return 'Máximo de 100 tickets por vez.';
  const novos=pend.filter(l=>!l.itemId||!hjItem(m.d,l.itemId)).length; const atuais=hjItens(m.d).length;
  if(atuais+novos>HJ_MAX_ITENS) return `O dia ficaria com ${atuais+novos} itens (máximo ${HJ_MAX_ITENS}) — tire ou mova alguns antes de criar.`;
  return '';
}
async function hjCriarExecuta(){
  const m=_hjCr; if(!m||m.enviando) return; hjCriarLe();
  const idp=idApontar(); if(!idp){ abreIdentidade(); return; }
  const ruim=hjCriarValida(); if(ruim){ hjCriarFb(ruim,'err'); hjCriarPinta(); return; }
  const d=m.d; if(hjDia(d)===undefined){ hjCriarFb('O seu dia ainda não foi lido — espere um instante e tente de novo.','err'); return; }
  const pend=m.linhas.filter(l=>!l.key); const respId=m.resp==='eu'?(idp.accountId||''):'';
  const itens=pend.map(l=>{ const it={ projeto:l.p, tipoId:l.tipoId, resumo:l.resumo, descricao:l.desc||'', respId }; const est=hjEstJira(parseTempo(l.estTxt)||0); if(est) it.estimativa=est; if(m.venc) it.venc=m.venc; return it; });
  m.enviando=true; hjCriarFb(`Criando ${itens.length} ticket(s) no Jira…`); hjCriarPinta();
  let j=null;
  try{ j=await fetch('/api/criar',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ itens, email:idp.email, token:idp.token }) }).then(r=>r.json()); }
  catch(e){ j={ erro:'Falha de rede: '+humanizaErro(e) }; }
  m.enviando=false;
  const aberto=_hjCr===m&&hjCrAberto();
  // trocou de identidade no meio: o dia em memória já é de outra pessoa — os tickets ficam só no Jira (aviso)
  if(estado.hoje.a!==m.acc){ if(j&&Array.isArray(j.criados)&&j.criados.length) toast(`📝 ${j.criados.length} ticket(s) criado(s) no Jira, mas a identidade mudou — eles não entraram no dia.`,'warn'); return; }
  if(!j||j.erro){ if(aberto){ hjCriarFb((j&&j.erro)||'Falha ao criar.','err'); hjCriarPinta(); } else toast((j&&j.erro)||'Falha ao criar os tickets.','err'); return; }
  const criados=Array.isArray(j.criados)?j.criados:[], erros=Array.isArray(j.erros)?j.erros:[];
  const porIdx=new Map(criados.map(c=>[c.indice,c])), errIdx=new Map(erros.map(e=>[e.indice,e.erro]));
  let n=0; const dia=hjGaranteObj(d);
  pend.forEach((l,i)=>{ const c=porIdx.get(i);
    if(!c||!c.key){ l.erro=errIdx.get(i)||(erros.length?'Não enviado — o Jira recusou o lote antes deste item.':'Não criado.'); return; }
    l.key=String(c.key).toUpperCase(); l.erro=''; n++;
    const est=hjEstClamp(parseTempo(l.estTxt)||0);
    const it=l.itemId?hjItem(d,l.itemId):null;
    if(it&&!it.k){ it.k=l.key; it.p=l.p; it.t=it.t||l.resumo; it.orig='criado'; if(est) it.est=est; }
    else hjAdiciona(d,{ k:l.key, t:l.resumo, p:l.p, est, orig:'criado' },{ quieto:true, semSalvar:true });
    logAcao({ acao:'hoje-criar', t:l.key, para:l.p, motivo:'📆 Hoje', ok:true }, false); });
  if(n){ if(dia.st==='fechado') dia.st='planejado'; hjAgendaSalvar(d); try{ salvaCfg(); }catch(e){} invalidaCacheDados(); estado.apontar.porData={}; estado.apontar.recentes=null;
    try{ const ult=pend.filter(l=>l.key).slice(-1)[0]; if(ult) localStorage.setItem(HJ_CR_PROJ_KEY, ult.p); }catch(e){} }
  (j.avisos||[]).forEach(a=>toast(a,'warn'));
  const falhas=pend.filter(l=>l.erro);
  // o modal foi fechado (Esc) com a criação em voo: o que o Jira criou entra no dia do mesmo jeito — o ticket existe
  if(!aberto){ toast(`📝 ${n} ticket(s) criado(s) e no seu dia${falhas.length?` · ${falhas.length} falharam`:''}.`, falhas.length?'warn':'ok'); hjRedesenha(); return; }
  if(!falhas.length){ _hjCr=null; fechaModal(); toast(`📝 ${n} ticket(s) criado(s) e no seu dia.`,'ok'); hjRedesenha(); return; }
  hjCriarFb(`${n?`${n} criado(s) e já no seu dia. `:''}${falhas.length} linha(s) falharam — corrija e tente de novo (só elas são reenviadas).`,'err'); hjRedesenha(); hjCriarPinta();
}

// ---------------- ⏱ apontar a partir de um item ----------------
let _hjAp=null;
// `extra.cand` = candidato ainda FORA do dia (lacuna → ⏱): o item só entra na lista depois de o apontamento gravar.
function hjApontaModal(d, id, extra){
  const idp=idApontar(); if(!idp){ abreIdentidade(); return; }
  const cand=extra&&extra.cand; const it=cand||hjItem(d,id);
  if(!it) return;
  if(!it.k){ hjBuscaParaDia(d, id, (it2)=>hjApontaModal(d, it2.id, extra)); return; }   // item sem ticket: escolhe o ticket e SEGUE para o apontamento
  const jaSeg=hjApontadoPorTicket(d)[it.k]||0;
  const resta=(it.est||0)-jaSeg; const sug=it.est?Math.max(900,resta):3600;
  _hjAp={ d, id:cand?'':id, k:it.k, cand:cand||null };
  const hora=(extra&&extra.hora)||it.ini||'';
  abreModal(`<div class="hj-modal"><h2>⏱ Apontar · ${esc(it.k)}</h2>
    <div class="muted small">${esc((it.t||'').slice(0,120))||'—'}${it.p?` · ${esc(projNome(it.p))}`:''}${jaSeg?` · já apontadas hoje: <b>${hjH(jaSeg)}</b>`:''}${it.est?` · estimativa ${hjH(it.est)}`:''}</div>
    <div class="rv-form" style="margin-top:10px">
      <div class="campo"><label>Tempo <span class="req">*</span></label><input type="text" id="hj-ap-tempo" value="${escA(fmtH(extra&&extra.seg?extra.seg:sug))}" placeholder="ex.: 1h30, 45m" autocomplete="off"></div>
      <div class="campo"><label>Dia</label><input type="date" id="hj-ap-dia" value="${escA(d)}"></div>
      <div class="campo"><label>Hora de início <span class="muted small">(opcional)</span></label><input type="time" id="hj-ap-hora" value="${escA(hora)}"></div>
      <div class="campo full"><label>Comentário do worklog <span class="muted small">(opcional)</span></label><input type="text" id="hj-ap-coment" maxlength="500" placeholder="o que foi feito…"></div>
    </div>
    <div class="ap-chips" style="margin-top:6px">${['15m','30m','1h','2h','4h'].map(c=>`<button class="chip" data-hj-ap-chip="${c}">${c}</button>`).join('')}${it.est?`<button class="chip" data-hj-ap-chip="${escA(fmtH(it.est))}">estimativa</button>`:''}</div>
    <label class="hj-check" style="margin-top:8px"><input type="checkbox" id="hj-ap-feito" ${it.feito?'':'checked'}> marcar o item como feito</label>
    <div class="muted small" style="margin-top:6px">Sai no <strong>seu usuário</strong> (${esc(idp.nome||idp.email)}). Com a hora, o worklog nasce no horário real — como no 📞.</div>
    <div class="ap-fb" id="hj-ap-fb" hidden></div>
    <div class="alx-modal-acoes"><button class="btn primario" id="hj-ap-ok">Apontar</button><button class="btn" data-hj-fecha>Cancelar</button></div></div>`);
  setTimeout(()=>{ const i=document.getElementById('hj-ap-tempo'); if(i){ i.focus(); i.select(); } },50);
}
// A gravação de UM worklog: planGate antes, registraExtraDia/logAcao depois. Devolve {ok, erro}.
async function hjGravaWorklog(k, seg, dia, hora, coment, opts){
  const id=idApontar(); if(!id) return { ok:false, erro:'Identifique-se para apontar.' };
  const o=opts||{};
  if(!o.semGate){ if(!(await planGate(dia))) return { ok:false, cancelado:true }; }
  let j=null;
  try{ j=await fetch('/api/apontar',{ method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ issue:k, segundos:seg, inicio:dia, hora:hora||'', comentario:coment||'', email:id.email, token:id.token }) }).then(r=>r.json()); }
  catch(e){ return { ok:false, erro:'Falha de rede ao apontar: '+humanizaErro(e) }; }   // a rede caiu: o modal não pode ficar preso em "Apontando…"
  if(!(j&&j.ok)) return { ok:false, erro:humanizaErro((j&&j.erro)||'Falha ao apontar.') };
  // `m` = hora REAL de início (só quando foi informada): é o que a linha do tempo desenha; sem hora o servidor usa 09:00 e aqui fica null.
  // Apontado às 09:00 DE VERDADE: a sessão lembra (`nove`), porque depois da releitura o worklog volta igual a um sem hora.
  try{ registraExtraDia(dia, seg, k); const ex=estado.apontar.extraLogs; const ult=ex&&ex[ex.length-1]; if(ult) ult.m=hora?hjMin(hora):null;
    if(hora&&hjMin(hora)===9*60){ const h=hjSt(); h.nove=h.nove||{}; h.nove[`${dia}|${k}|${seg}`]=1; } }catch(e){}
  logAcao({ acao:'apontar', t:k, para:`${fmtH(seg)} em ${dia}${hora?' '+hora:''}`, ok:true }, o.semSalvar===true?false:undefined);
  invalidaCacheDados(); estado.apontar.porData={}; estado.apontar.recentes=null;
  return { ok:true };
}
async function hjApontaConfirma(){
  const m=_hjAp; if(!m) return; const fb=document.getElementById('hj-ap-fb'); const bt=document.getElementById('hj-ap-ok');
  const seg=parseTempo((document.getElementById('hj-ap-tempo')||{}).value);
  const dia=((document.getElementById('hj-ap-dia')||{}).value||'').trim()||m.d;
  const hora=((document.getElementById('hj-ap-hora')||{}).value||'').trim().slice(0,5);
  const coment=((document.getElementById('hj-ap-coment')||{}).value||'').trim();
  const marcar=!!((document.getElementById('hj-ap-feito')||{}).checked);
  const erro=(t)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=t; } if(bt) bt.disabled=false; };
  if(seg==null||seg<60||seg>24*3600) return erro('Tempo inválido — use 1h30, 45m ou 2:15 (de 1 minuto a 24 horas).');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dia)||dia>hojeSP()) return erro('Escolha um dia válido (hoje ou antes).');
  if(bt) bt.disabled=true; if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Apontando…'; }
  const r=await hjGravaWorklog(m.k, seg, dia, hora, coment);
  if(_hjAp!==m) return;   // a pessoa fechou o modal (Esc) no meio: nada de mexer no que está aberto agora
  if(r.cancelado){ if(bt) bt.disabled=false; if(fb) fb.hidden=true; return; }
  if(!r.ok) return erro(r.erro);
  // o candidato da lacuna só entra no dia agora, com o apontamento gravado (antes, cancelar deixava um item fantasma)
  const it=m.cand?hjAdiciona(m.d,{ ...m.cand },{ quieto:true, semSalvar:true }):hjItem(m.d, m.id);
  if(it&&marcar&&!it.feito){ it.feito=true; it.feitoEm=new Date().toISOString(); }
  if(it&&(marcar||m.cand)) hjAgendaSalvar(m.d);
  _hjAp=null; fechaModal(); toast(`✓ ${fmtH(seg)} apontadas em ${m.k}.`,'ok'); hjRedesenha();
}

// ---------------- ⏱ cronômetro (R001) ----------------
// O cronômetro é de QUEM o iniciou (`a` = accountId): "esquecer credenciais" ou trocar de usuário descarta — senão
// virava worklog de outra pessoa.
function hjTimerLe(){ try{ const t=JSON.parse(localStorage.getItem(HJ_TIMER_KEY)||'null'); if(!(t&&t.ini&&t.k)) return null;
  if((t.a||'')!==hjAcc()){ localStorage.removeItem(HJ_TIMER_KEY); return null; } return t; }catch(e){ return null; } }
function hjTimerGrava(t){ try{ if(t){ t.a=hjAcc(); localStorage.setItem(HJ_TIMER_KEY, JSON.stringify(t)); } else localStorage.removeItem(HJ_TIMER_KEY); }catch(e){} }
function hjTimerSeg(t){ t=t||hjTimerLe(); if(!t) return 0; return Math.max(0,Math.round((Date.now()-Date.parse(t.ini))/1000)); }
// Inicia (k = ticket; itemId/d = o item do dia, opcional). Com outro rodando: para o atual (oferece apontar) e segue.
function hjTimerInicia(k, t, itemId, d){
  const id=idApontar(); if(!id){ abreIdentidade(); return; }
  k=String(k||'').toUpperCase(); if(!k) { toast('O cronômetro precisa de um ticket.','warn'); return; }
  const atual=hjTimerLe();
  if(atual&&atual.k===k){ toast(`⏱ O cronômetro já está rodando em ${k}.`,'info'); return; }
  const novo={ k, t:String(t||'').slice(0,120), itemId:itemId||'', d:d||'', ini:new Date().toISOString() };
  if(atual){ hjTimerParaModal(atual, novo); return; }
  hjTimerGrava(novo); hjTimerPinta(); toast(`▶ Cronômetro em ${k}.`,'ok'); hjRedesenha();
}
let _hjTp=null;
// ■ parar: confirma o apontamento com o tempo arredondado (5 min) e a hora real de início.
function hjTimerParaModal(t, proximo){
  t=t||hjTimerLe(); if(!t) return; const id=idApontar(); if(!id){ abreIdentidade(); return; }
  const seg=hjTimerSeg(t); const arred=Math.max(300,Math.round(seg/300)*300);
  const dia=hjDiaSP(t.ini), hora=hjHoraSP(t.ini);
  _hjTp={ t, proximo:proximo||null, dia };
  if(seg<60){ hjTimerGrava(null); hjTimerPinta(); toast('⏱ Menos de 1 minuto — cronômetro descartado.','info'); if(proximo){ hjTimerGrava(proximo); hjTimerPinta(); toast(`▶ Cronômetro em ${proximo.k}.`,'ok'); } hjRedesenha(); return; }
  abreModal(`<div class="hj-modal"><h2>■ Parar o cronômetro · ${esc(t.k)}</h2>
    <div class="muted small">${esc(t.t||'')}</div>
    <div class="hj-timer-big">${esc(fmtH(seg))} <span class="muted small">desde ${esc(hora)} (${esc(fmtBR(dia))})</span></div>
    <div class="rv-form" style="margin-top:10px">
      <div class="campo"><label>Tempo a apontar</label><input type="text" id="hj-tp-tempo" value="${escA(fmtH(arred))}" autocomplete="off"></div>
      <div class="campo"><label>Dia</label><input type="date" id="hj-tp-dia" value="${escA(dia)}"></div>
      <div class="campo full"><label>Comentário <span class="muted small">(opcional)</span></label><input type="text" id="hj-tp-coment" maxlength="500" placeholder="o que foi feito…"></div>
    </div>
    <div class="muted small" style="margin-top:6px">O worklog nasce às <b>${esc(hora)}</b> (hora real de início) quando o dia é ${esc(fmtBR(dia))}; trocando o dia, entra às 09:00.${proximo?` Depois disso o cronômetro começa em <b>${esc(proximo.k)}</b>.`:''}</div>
    <div class="ap-fb" id="hj-tp-fb" hidden></div>
    <div class="alx-modal-acoes"><button class="btn primario" id="hj-tp-ok">⏱ Apontar</button><button class="btn" id="hj-tp-descarta">Descartar (sem apontar)</button><button class="btn" data-hj-fecha>Continuar rodando</button></div></div>`);
}
async function hjTimerConfirma(descartar){
  const m=_hjTp; if(!m) return; const fb=document.getElementById('hj-tp-fb'); const bt=document.getElementById('hj-tp-ok');
  const fim=()=>{ hjTimerGrava(null); if(m.proximo){ hjTimerGrava(m.proximo); } _hjTp=null; hjTimerPinta(); fechaModal(); if(m.proximo) toast(`▶ Cronômetro em ${m.proximo.k}.`,'ok'); hjRedesenha(); };
  if(descartar){ fim(); toast('⏱ Cronômetro descartado — nada foi apontado.','info'); return; }
  const seg=parseTempo((document.getElementById('hj-tp-tempo')||{}).value);
  const dia=((document.getElementById('hj-tp-dia')||{}).value||'').trim()||m.dia;
  const coment=((document.getElementById('hj-tp-coment')||{}).value||'').trim();
  const erro=(t)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=t; } if(bt) bt.disabled=false; };
  if(seg==null||seg<60||seg>24*3600) return erro('Tempo inválido — use 1h30, 45m ou 2:15.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dia)||dia>hojeSP()) return erro('Escolha um dia válido (hoje ou antes).');
  if(bt) bt.disabled=true; if(fb){ fb.hidden=false; fb.className='ap-fb'; fb.textContent='Apontando…'; }
  const r=await hjGravaWorklog(m.t.k, seg, dia, dia===m.dia?hjHoraSP(m.t.ini):'', coment);
  if(_hjTp!==m) return;   // fechou com Esc no meio
  if(r.cancelado){ if(bt) bt.disabled=false; if(fb) fb.hidden=true; return; }
  if(!r.ok) return erro(r.erro);
  toast(`✓ ${fmtH(seg)} apontadas em ${m.t.k}.`,'ok'); fim();
}
// A pílula fixa (em todas as telas) — nasce no boot e se atualiza a cada 30 s.
function hjTimerPinta(){
  let p=document.getElementById('hj-timer'); const t=hjTimerLe();
  if(!t){ if(p) p.remove(); return; }
  // sem aria-live: o relógio muda a cada 30 s e o leitor de tela anunciaria sem parar
  if(!p){ p=el('<div id="hj-timer" class="hj-timer" aria-label="Cronômetro rodando"><button class="hj-timer-k" data-hj-timer-ir title="Abrir o 📆 Hoje" aria-label="Cronômetro — abrir o Hoje"></button><span class="hj-timer-t"></span><button class="btn hj-timer-stop" data-hj-timer-stop title="Parar e apontar" aria-label="Parar o cronômetro e apontar">■</button></div>'); document.body.appendChild(p); }
  const seg=hjTimerSeg(t); const h=Math.floor(seg/3600), mi=Math.floor((seg%3600)/60);
  p.querySelector('.hj-timer-k').textContent=`⏱ ${t.k}`; p.querySelector('.hj-timer-t').textContent=`${h}:${String(mi).padStart(2,'0')}`;
  p.classList.toggle('longo', seg>10*3600);
  p.title=`${t.k}${t.t?' — '+t.t:''} · desde ${hjHoraSP(t.ini)} de ${fmtBR(hjDiaSP(t.ini))}`;
}
function hjTimerAvisoEsquecido(){ const t=hjTimerLe(); if(!t) return; if(hjTimerSeg(t)>10*3600&&!estado.hoje._avisouTimer){ estado.hoje._avisouTimer=true; toast(`⏱ O cronômetro de ${t.k} roda há mais de 10 h — esqueceu de parar? Clique em ■ para apontar ou descartar.`,'warn'); } }

// ---------------- 🌅 Planejar o dia / 🌙 Fechar o dia (rituais) ----------------
function hjRitualPlanejar(d){
  d=d||hjD(); const idp=idApontar(); if(!idp){ abreIdentidade(); return; }
  const h=hjSt(); h.ritual={ tipo:'planejar', d, passo:1, sel:{}, est:{}, estTxt:{}, adiar:{}, visto:{}, grupos:null };
  abreModal('<div class="hj-modal hj-rit"><h2>🌅 Planejar o dia</h2><div class="estado">Reunindo as sugestões…</div></div>');
  // dados que as sugestões usam (agenda, vencidos, prioridades, plano) — dispara e redesenha quando chegar: a lista de
  // candidatos é recalculada a cada pintura dos passos 1–2, e o que chega depois nasce com a marcação padrão (`visto`)
  if(!estado.agenda.dados&&!estado.agenda.carregando&&!estado.agenda.erro) carregaAgenda(false);
  Promise.all([hjGarante(d), planGateCarrega(semChave(d)), apGaranteMeusLogs(d)]).then(()=>hjRitualPinta());
  hjRitualPinta();
}
function hjRitualFechar(d){
  d=d||hjD(); const idp=idApontar(); if(!idp){ abreIdentidade(); return; }
  if(d>hojeSP()){ toast('Só dá para fechar um dia que já chegou — abra o dia de hoje.','warn'); return; }   // fechar o futuro gravaria worklog no futuro
  const h=hjSt(); if(hjDia(d)===undefined){ toast('O seu dia ainda está sendo lido — tente de novo em instantes.','warn'); return; }
  const dia=hjGaranteObj(d);
  const naoFeitos={}, apontar={}, tempos={};
  const por=hjApontadoPorTicket(d);
  // reunião não feita fica (não vira pendência de texto no dia seguinte ao lado da própria reunião); o resto vai para amanhã
  dia.itens.filter(i=>!i.movido).forEach(i=>{ if(!i.feito) naoFeitos[i.id]=i.ev?'deixar':'amanha';
    if(i.feito&&i.k&&!por[i.k]&&i.orig!=='reuniao'){ apontar[i.id]=true; tempos[i.id]=i.est||3600; } });
  h.ritual={ tipo:'fechar', d, passo:1, naoFeitos, apontar, tempos, tempoTxt:{}, nota:dia.nota||'' };
  abreModal('<div class="hj-modal hj-rit"><h2>🌙 Fechar o dia</h2><div class="estado">…</div></div>');
  apGaranteMeusLogs(d).then(()=>hjRitualPinta()); hjRitualPinta();
}
function hjRitualAberto(){ const m=document.getElementById('modal'); return !!(estado.hoje.ritual&&m&&!m.hidden&&document.querySelector('#modal-body .hj-rit')); }
function hjRitualPinta(){
  const h=hjSt(); const r=h.ritual; if(!r||!hjRitualAberto()) return;
  const d=r.d; const box=document.querySelector('#modal-body .hj-rit'); if(!box) return;
  const ae=document.activeElement; const foco=ae&&ae.id; let sel0=null; try{ sel0=ae&&ae.selectionStart; }catch(e){}
  const esq=(n)=>`<div class="hj-rit-passos">${[1,2,3].map(i=>`<span class="${i===r.passo?'on':(i<r.passo?'ok':'')}">${i}</span>`).join('')}</div>`;
  let corpo='';
  if(r.tipo==='planejar'){
    if(!r.grupos||r.passo<3){ r.grupos=hjSugestoes(d);
      // candidato que aparece pela primeira vez (inclusive o que chegou depois: vencidos, agenda) nasce com a marcação padrão
      r.grupos.forEach(g=>g.itens.forEach(c=>{ if(r.visto[c.cid]) return; r.visto[c.cid]=true; r.sel[c.cid]=g.id!=='rec'&&g.id!=='andamento'; if(c.est) r.est[c.cid]=hjEstClamp(c.est); })); }
    const res=hjResumo(d);
    if(r.passo===1){
      const g=r.grupos.find(x=>x.id==='ontem'); const ult=hjUltimoPlanejado(d);
      corpo=`<h3>1 · O que ficou de ${ult?fmtBR(ult):'antes'}</h3>
        ${g?`<div class="muted small">Itens não feitos no último dia planejado. Marcados entram hoje; desmarque o que não vale mais.</div>
          <div class="hj-cands">${g.itens.map(c=>hjCandHTML(r,c)).join('')}</div>`:'<div class="muted small">Nada ficou pendente do último dia planejado 🎉</div>'}
        <div class="alx-modal-acoes"><button class="btn primario" data-hj-rit-passo="2">Sugestões para hoje →</button><button class="btn" data-hj-fecha>Cancelar</button></div>`;
    } else if(r.passo===2){
      const gs=r.grupos.filter(x=>x.id!=='ontem');
      corpo=`<h3>2 · Sugestões para ${fmtBR(d)}</h3>
        <div class="muted small">Candidatos por fonte, com o porquê. O ⏰, o 📋 e o 📅 já vêm marcados; 🔄 e 🕑 são opcionais.</div>
        ${gs.length?gs.map(g=>`<details class="hj-grp" open><summary>${esc(g.rot)} <span class="muted small">(${g.itens.length})</span><span class="spacer"></span><button class="lnk small" data-hj-rit-todos="${escA(g.id)}">todos</button> · <button class="lnk small" data-hj-rit-nenhum="${escA(g.id)}">nenhum</button></summary><div class="hj-cands">${g.itens.map(c=>hjCandHTML(r,c)).join('')}</div></details>`).join(''):'<div class="muted small">Sem sugestões — adicione tickets à mão na lista do dia.</div>'}
        <div class="alx-modal-acoes"><button class="btn" data-hj-rit-passo="1">← Voltar</button><button class="btn primario" data-hj-rit-passo="3">Estimativas e capacidade →</button><button class="btn" data-hj-fecha>Cancelar</button></div>`;
    } else {
      const escolhidos=[]; r.grupos.forEach(g=>g.itens.forEach(c=>{ if(r.sel[c.cid]) escolhidos.push(c); }));
      escolhidos.sort((a,b)=>hjUrgencia({ ...a, feito:false },d)-hjUrgencia({ ...b, feito:false },d));
      const atual=hjItens(d).filter(i=>!i.feito&&!i.movido&&!hjEhReuniaoContada(d,i)).reduce((s,i)=>s+(i.est||0),0);
      const novo=escolhidos.filter(c=>!r.adiar[c.cid]&&!hjEhReuniaoContada(d,c)).reduce((s,c)=>s+(Number(r.est[c.cid])||0),0);
      const total=atual+novo; const livre=res.livre; const acima=Math.max(0,total-livre);
      const ruins=Object.keys(r.estTxt).filter(cid=>r.estTxt[cid]&&r.estTxt[cid].trim()&&parseTempo(r.estTxt[cid])==null);
      corpo=`<h3>3 · Estimativas × capacidade</h3>
        <div class="hj-cap"><span>Capacidade <b>${hjH(res.cap)}</b></span><span>Reuniões <b>${res.reun==null?'—':hjH(res.reun)}</b></span><span>Livre <b>${hjH(livre)}</b></span><span class="${acima?'hj-acima':''}">Planejado <b>${hjH(total)}</b>${acima?` · ⚠ ${hjH(acima)} acima`:''}</span></div>
        ${acima?`<div class="aviso">⚠ Dia cheio: <b>${hjH(acima)}</b> acima do que cabe. Marque "amanhã" no que pode esperar — vai para o próximo dia útil.</div>`:''}
        ${ruins.length?'<div class="ap-fb err">Estimativa inválida — use 1h30, 45m ou 2:15 (até 24 h).</div>':''}
        <div class="hj-cands hj-cands-est">${escolhidos.map((c,i)=>`<div class="hj-cand${r.adiar[c.cid]?' adiado':''}">
          <span class="hj-cand-t"><b>${esc(c.k||'')}</b> ${esc(c.t||'')}<span class="muted small"> · ${esc(HJ_ORIG_ROT[c.orig]||c.orig)}</span></span>
          <input type="text" class="hj-cand-est${r.estTxt[c.cid]!=null&&r.estTxt[c.cid].trim()&&parseTempo(r.estTxt[c.cid])==null?' invalido':''}" id="hj-rit-est-${i}" data-hj-rit-est="${escA(c.cid)}" value="${escA(r.estTxt[c.cid]!=null?r.estTxt[c.cid]:(r.est[c.cid]?fmtH(r.est[c.cid]):''))}" placeholder="1h30" aria-label="Estimativa">
          <label class="hj-check small"><input type="checkbox" id="hj-rit-adiar-${i}" data-hj-rit-adiar="${escA(c.cid)}" ${r.adiar[c.cid]?'checked':''}> amanhã</label></div>`).join('')||'<div class="muted small">Nada escolhido — o dia fica como está.</div>'}</div>
        ${hjRitualFbHTML(r)}
        <div class="alx-modal-acoes"><button class="btn" data-hj-rit-passo="2">← Voltar</button><button class="btn primario" data-hj-rit-ok>✓ Planejar o dia</button><button class="btn" data-hj-fecha>Cancelar</button></div>`;
    }
  } else {
    const dia=hjGaranteObj(d); const itens=dia.itens.filter(i=>!i.movido); const res=hjResumo(d); const por=hjApontadoPorTicket(d);
    const naoF=itens.filter(i=>!i.feito), feitos=itens.filter(i=>i.feito);
    if(r.passo===1){
      corpo=`<h3>1 · Como foi ${fmtBR(d)}</h3>
        <div class="hj-cap"><span>Feitos <b>${feitos.length}/${itens.length}</b></span><span>Apontado <b>${hjH(res.ap)}</b> de ${hjH(res.meta)}</span><span>Planejado <b>${hjH(res.planTot)}</b></span></div>
        ${naoF.length?`<div class="small" style="margin-top:8px"><b>Não feitos</b> — o que fazer com cada um:</div>
          <div class="hj-cands">${naoF.map(i=>`<div class="hj-cand"><span class="hj-cand-t"><b>${esc(i.k||'')}</b> ${esc(i.t||'')}</span>
            <select data-hj-rit-nf="${escA(i.id)}" aria-label="Destino"><option value="amanha" ${r.naoFeitos[i.id]==='amanha'?'selected':''}>↪ amanhã</option><option value="deixar" ${r.naoFeitos[i.id]==='deixar'?'selected':''}>deixar aqui</option><option value="descartar" ${r.naoFeitos[i.id]==='descartar'?'selected':''}>✕ descartar</option></select></div>`).join('')}</div>`
          :'<div class="muted small" style="margin-top:8px">Tudo feito 🎉</div>'}
        <div class="alx-modal-acoes"><button class="btn primario" data-hj-rit-passo="2">Apontamentos →</button><button class="btn" data-hj-fecha>Cancelar</button></div>`;
    } else if(r.passo===2){
      const semAp=feitos.filter(i=>i.k&&i.orig!=='reuniao');
      corpo=`<h3>2 · Feitos sem apontamento</h3>
        <div class="muted small">Marque o que apontar agora; o tempo vem da estimativa (ajuste). Itens com bloco entram na hora do bloco.</div>
        ${semAp.length?`<div class="hj-cands">${semAp.map((i,n)=>`<div class="hj-cand"><label class="hj-check"><input type="checkbox" id="hj-rit-ap-${n}" data-hj-rit-ap="${escA(i.id)}" ${r.apontar[i.id]?'checked':''}> <b>${esc(i.k)}</b> ${esc(i.t||'')}</label>
            <span class="muted small">${por[i.k]?`já tem ${hjH(por[i.k])} hoje`:'sem horas hoje'}${i.ini?` · 🕘 ${esc(i.ini)}`:''}</span>
            <input type="text" class="hj-cand-est" id="hj-rit-tempo-${n}" data-hj-rit-tempo="${escA(i.id)}" value="${escA(r.tempoTxt[i.id]!=null?r.tempoTxt[i.id]:(r.tempos[i.id]?fmtH(r.tempos[i.id]):''))}" placeholder="1h" aria-label="Tempo"></div>`).join('')}</div>`
          :'<div class="muted small">Nenhum item feito com ticket sem apontamento.</div>'}
        <div class="campo full" style="margin-top:10px"><label>Nota para amanhã <span class="muted small">(opcional)</span></label><textarea id="hj-rit-nota" rows="2" maxlength="1000" placeholder="onde parei, o que atacar primeiro…">${esc(r.nota||'')}</textarea></div>
        ${hjRitualFbHTML(r)}
        <div class="alx-modal-acoes"><button class="btn" data-hj-rit-passo="1">← Voltar</button><button class="btn primario" data-hj-rit-ok>🌙 Fechar o dia</button><button class="btn" data-hj-fecha>Cancelar</button></div>`;
    }
  }
  box.innerHTML=`<h2>${r.tipo==='planejar'?'🌅 Planejar o dia':'🌙 Fechar o dia'} <span class="muted small">${esc(hjRotuloDia(d))}</span></h2>${esq()}${corpo}`;
  if(foco){ const f=document.getElementById(foco); if(f){ f.focus(); try{ if(sel0!=null) f.setSelectionRange(sel0,sel0); }catch(e){} } }
}
function hjCandHTML(r, c){
  return `<label class="hj-cand"><input type="checkbox" data-hj-rit-sel="${escA(c.cid)}" ${r.sel[c.cid]?'checked':''}>
    <span class="hj-cand-t">${c.k?`<b>${esc(c.k)}</b> `:''}${esc(c.t||'')}${c.p&&!c.k?`<span class="muted small"> · ${esc(projNome(c.p))}</span>`:''}</span>
    <span class="hj-cand-why muted small">${esc(c.why||'')}${c.est?` · ${hjH(c.est)}`:''}</span></label>`;
}
// Lê os campos de texto do ritual: o texto cru fica guardado (`estTxt`/`tempoTxt`) para o redesenho não apagar o que está
// sendo digitado; o número só vale quando o texto é válido (inválido = 0 e a tela avisa).
function hjRitualLeCampos(){
  const r=estado.hoje.ritual; if(!r) return;
  document.querySelectorAll('#modal-body [data-hj-rit-est]').forEach(i=>{ const cid=i.getAttribute('data-hj-rit-est'); r.estTxt[cid]=i.value; const s=parseTempo(i.value); r.est[cid]=s==null?0:hjEstClamp(s); });
  document.querySelectorAll('#modal-body [data-hj-rit-tempo]').forEach(i=>{ const id=i.getAttribute('data-hj-rit-tempo'); r.tempoTxt[id]=i.value; const s=parseTempo(i.value); r.tempos[id]=s==null?0:s; });
  const n=document.getElementById('hj-rit-nota'); if(n) r.nota=n.value;
}
// A mensagem do rodapé do ritual vive em `r.fb` — o redesenho do modal (que acontece a cada dado novo) a mantém.
function hjRitualFb(txt, cls){ const r=estado.hoje.ritual; if(r) r.fb=txt?{ txt, cls:cls||'' }:null; const fb=document.getElementById('hj-rit-fb'); if(!fb) return; fb.hidden=!txt; fb.className='ap-fb '+(cls||''); fb.textContent=txt||''; }
function hjRitualFbHTML(r){ return `<div class="ap-fb ${r.fb?escA(r.fb.cls):''}" id="hj-rit-fb" ${r.fb?'':'hidden'}>${r.fb?esc(r.fb.txt):''}</div>`; }
// Aplica o ritual. Ordem das gravações: o DESTINO (amanhã) primeiro — só com ele confirmado a origem marca `movido`;
// depois o dia; o "ficou de antes" por último. Conflito/falha em qualquer passo: a tela avisa e NADA fica marcado como
// movido sem o item existir no destino. `executando` sempre volta a false (finally) — o botão nunca fica preso.
async function hjRitualAplica(){
  const h=hjSt(); const r=h.ritual; if(!r||r.executando) return; hjRitualLeCampos();
  const d=r.d; const dia=hjGaranteObj(d);
  const bt=document.querySelector('#modal-body [data-hj-rit-ok]');
  const aindaAberto=()=>h.ritual===r&&hjRitualAberto();
  r.executando=true; if(bt) bt.disabled=true;
  try{
  if(r.tipo==='planejar'){
    const ruins=Object.keys(r.estTxt).filter(cid=>r.estTxt[cid]&&r.estTxt[cid].trim()&&parseTempo(r.estTxt[cid])==null);
    if(ruins.length){ hjRitualPinta(); return; }
    const escolhidos=[]; (r.grupos||[]).forEach(g=>g.itens.forEach(c=>{ if(r.sel[c.cid]) escolhidos.push(c); }));
    escolhidos.sort((a,b)=>hjUrgencia({ ...a, feito:false },d)-hjUrgencia({ ...b, feito:false },d));
    const adiados=escolhidos.filter(c=>r.adiar[c.cid]); const hoje=escolhidos.filter(c=>!r.adiar[c.cid]);
    if(dia.itens.filter(i=>!i.movido).length+hoje.length>HJ_MAX_ITENS){ hjRitualFb(`Máximo de ${HJ_MAX_ITENS} itens num dia — desmarque alguns ou mande para amanhã.`,'err'); return; }
    hjRitualFb(adiados.length?`Gravando ${fmtBR(hjProxUtil(d))}…`:'Gravando o seu dia…');
    // 1) amanhã primeiro
    let prox='';
    if(adiados.length){ const lv=await hjLevaPara(d, adiados.map(c=>({ k:c.k, t:c.t, p:c.p, est:hjEstClamp(r.est[c.cid]) }))); if(!lv.ok){ hjRitualFb(`O dia ${fmtBR(lv.prox)} não gravou — o plano não foi aplicado. Tente de novo.`,'err'); return; } prox=lv.prox; }
    // 2) hoje
    hoje.forEach(c=>hjAdiciona(d,{ ...c, est:hjEstClamp(r.est[c.cid]) },{ quieto:true, semSalvar:true }));
    dia.st='planejado'; dia.planejadoEm=new Date().toISOString();
    const okD=await hjSalvar(d);
    if(!okD){ hjRitualFb('O seu dia não gravou (conflito ou falha) — confira a lista e planeje de novo.','err'); if(!aindaAberto()) hjRedesenha(); return; }
    // 3) o que ficou de antes e entrou hoje: a origem fica marcada como movida (não aparece de novo)
    const ult=hjUltimoPlanejado(d); let okU=true;
    if(ult&&h.dias[ult]){ let mexeu=false; (h.dias[ult].itens||[]).forEach(i=>{ if(!i.feito&&!i.movido&&hoje.some(c=>c.orig==='ontem'&&((c.k&&c.k===i.k)||(!c.k&&c.t===i.t&&c.p===i.p)))){ i.movido=d; mexeu=true; } });
      if(mexeu) okU=await hjSalvar(ult); }
    h.ritual=null; fechaModal();
    toast(`🌅 Dia planejado: ${hoje.length} item(ns)${adiados.length?` · ${adiados.length} para ${fmtBR(prox)}`:''}.`,'ok');
    if(!okU) toast(`O dia ${fmtBR(ult)} não gravou a marca "movido" — os itens podem aparecer de novo no próximo 🌅.`,'warn');
    hjRedesenha();
    return;
  }
  // 🌙 fechar
  const lote=Object.keys(r.apontar).filter(id=>r.apontar[id]).map(id=>({ it:hjItem(d,id), seg:Number(r.tempos[id])||0 })).filter(x=>x.it&&x.it.k);
  const ruim=lote.find(x=>!(x.seg>=60&&x.seg<=24*3600));
  if(ruim){ hjRitualFb(`Tempo inválido em ${ruim.it.k} — use 1h30, 45m ou 2:15 (até 24 h).`,'err'); return; }
  if(lote.length&&!(await planGate(d))) return;
  if(!aindaAberto()) return;
  hjRitualFb(lote.length?`Apontando ${lote.length} item(ns)…`:'Fechando…');
  let okN=0; const falhas=[];
  for(const x of lote){ const res=await hjGravaWorklog(x.it.k, x.seg, d, x.it.ini||'', '', { semGate:true, semSalvar:true }); if(res.ok){ okN++; r.apontar[x.it.id]=false; } else falhas.push(`${x.it.k}: ${res.erro}`); }
  if(okN){ try{ salvaCfg(); }catch(e){} }   // UMA gravação da config para o lote (logAcao foi com false)
  if(falhas.length){ hjRitualFb(`⚠ ${falhas.length} apontamento(s) falharam: ${falhas.slice(0,2).join(' · ')}. ${okN?`${okN} gravado(s) (desmarcados). `:''}Corrija ou desmarque e confirme de novo.`,'err'); hjRitualPinta(); return; }
  const paraAmanha=dia.itens.filter(i=>!i.movido&&!i.feito&&r.naoFeitos[i.id]==='amanha');
  const descartar=new Set(dia.itens.filter(i=>!i.movido&&!i.feito&&r.naoFeitos[i.id]==='descartar').map(i=>i.id));
  let prox='';
  if(paraAmanha.length){ hjRitualFb(`Gravando ${fmtBR(hjProxUtil(d))}…`); const lv=await hjLevaPara(d, paraAmanha); if(!lv.ok){ hjRitualFb(`O dia ${fmtBR(lv.prox)} não gravou — o fechamento não foi aplicado. Tente de novo.`,'err'); return; } prox=lv.prox; }
  dia.itens=dia.itens.filter(i=>!descartar.has(i.id));
  dia.nota=String(r.nota||'').slice(0,1000); dia.st='fechado'; dia.fechadoEm=new Date().toISOString();
  hjRitualFb('Fechando…');
  const okD=await hjSalvar(d);
  if(!okD){ hjRitualFb('O seu dia não gravou (conflito ou falha) — confira a lista e feche de novo.','err'); if(!aindaAberto()) hjRedesenha(); return; }
  h.ritual=null; fechaModal();
  toast(`🌙 Dia fechado${okN?` · ${okN} apontamento(s)`:''}${paraAmanha.length?` · ${paraAmanha.length} item(ns) para ${fmtBR(prox)}`:''}.`,'ok'); hjRedesenha();
  } finally { r.executando=false; const b2=document.querySelector('#modal-body [data-hj-rit-ok]'); if(b2&&h.ritual===r) b2.disabled=false; }
}

// ---------------- 📅 agendar (bloco de tempo) e 🗓 Outlook ----------------
function hjAgendaModal(d, id, iniSug){
  const it=hjItem(d,id); if(!it) return;
  const lac=hjLacunas(d);
  abreModal(`<div class="hj-modal"><h2>📅 Agendar · ${esc(it.k||it.t)}</h2>
    <div class="muted small">Escolha o início; a duração é a estimativa do item (${it.est?hjH(it.est):'1h, sem estimativa'}).</div>
    <div class="rv-form" style="margin-top:10px">
      <div class="campo"><label>Início</label><input type="time" id="hj-ag-ini" value="${escA(iniSug||it.ini||(lac[0]?hjHHMM(lac[0].a):'09:00'))}" step="900"></div>
      <div class="campo"><label>Duração</label><input type="text" id="hj-ag-est" value="${escA(it.est?fmtH(it.est):'1h')}" placeholder="1h30"></div>
    </div>
    ${lac.length?`<div class="small" style="margin-top:8px">Lacunas livres: ${lac.map(l=>`<button class="chip" data-hj-ag-lac="${escA(hjHHMM(l.a))}">${esc(hjHHMM(l.a))}–${esc(hjHHMM(l.b))} (${hjH((l.b-l.a)*60)})</button>`).join(' ')}</div>`:''}
    <div class="alx-modal-acoes"><button class="btn primario" data-hj-ag-ok="${escA(id)}">Agendar</button>${it.ini?`<button class="btn" data-hj-ag-tira="${escA(id)}">Tirar da linha do tempo</button>`:''}<button class="btn" data-hj-fecha>Cancelar</button></div></div>`);
}
// Deep link do compose do Outlook (sem escrever pelo Graph): assunto, início, fim e corpo já preenchidos.
function hjOutlookUrl(d, it){
  const a=hjMin(it.ini); if(a==null) return '';
  const b=hjItemFim(it); const iso=(min)=>`${d}T${hjHHMM(min)}:00`;
  const sub=`${it.k?it.k+' — ':''}${it.t||''}`.slice(0,120);
  const body=`Bloco de foco planejado no Dexterity Hub (📆 Hoje).${it.k?` Ticket: ${jiraBase()}/browse/${it.k}`:''}`;
  return `https://outlook.office.com/calendar/deeplink/compose?subject=${encodeURIComponent(sub)}&startdt=${encodeURIComponent(iso(a))}&enddt=${encodeURIComponent(iso(b))}&body=${encodeURIComponent(body)}`;
}

// ---------------- 👥 dia do time (gestores) ----------------
// Falha (ou 403 de não-gestor) NÃO relê a cada redesenho: fica 30 s de folga (`timeErroEm`) e o 403 só volta pelo ↻.
function hjTimeGarante(d, forca){
  const h=hjSt(); if(!hjAcc()) return; if(!forca&&(h.time[d]||h.timeB[d])) return;
  if(!forca&&h.timeErro&&(h.timeSo||Date.now()-(h.timeErroEm||0)<30000)) return;
  h.timeB[d]=1; h.timeErro=''; h.timeSo=false; const acc=hjAcc();
  Promise.all([ hjApi({ acao:'time', d }), fetch(`/api/tempo?desde=${d}&ate=${d}${forca?'&nocache=1':''}`).then(r=>r.json()).catch(()=>null) ]).then(([j,tp])=>{
    h.timeB[d]=0; if(estado.hoje.a!==acc) return;
    if(!(j&&j.ok)){ h.timeErro=(j&&j.erro)||'Falha ao ler o dia do time.'; h.timeSo=!!(j&&/gestor/i.test(j.erro||'')); h.timeErroEm=Date.now(); }
    else { const wl=(tp&&Array.isArray(tp.worklogs))?{}:null;   // sem o /api/tempo, "Apontado" vira "—" (não 0h para todo mundo)
      if(wl) tp.worklogs.forEach(w=>{ if((w.d||'').slice(0,10)===d) wl[w.a]=(wl[w.a]||0)+(Number(w.s)||0); });
      h.time[d]={ pessoas:j.pessoas||[], wl, pessoasTp:(tp&&tp.pessoas)||{} }; }
    if(estado.vista==='hojetime') renderHoje();
  }).catch(e=>{ h.timeB[d]=0; h.timeErro=humanizaErro(e); h.timeErroEm=Date.now(); if(estado.vista==='hojetime') renderHoje(); });
}
function hjTimeHTML(d){
  const h=hjSt(); const t=h.time[d];
  if(!souAprovador()&&!temPapel('admin')&&!temPapel('gestor')) return `<div class="card full"><h2>👥 Dia do time</h2><div class="estado">Esta aba é para gestores: mostra quem planejou e fechou o dia. O seu dia fica em <button class="lnk" data-hj-aba="hoje">📆 Meu dia</button>.</div></div>`;
  if(!t&&h.timeErro) return `<div class="card full"><h2>👥 Dia do time</h2><div class="erro">${esc(h.timeErro)}</div><div style="margin-top:8px"><button class="btn" data-hj-time-retry>Tentar de novo</button></div></div>`;
  if(!t) return `<div class="card full"><h2>👥 Dia do time</h2><div class="estado">Carregando o dia do time…</div></div>`;
  const pessoas=pessoasUnidas(); const ocultos=new Set(cfg.ocultos||[]);
  const porAcc=new Map(t.pessoas.map(p=>[p.accountId,p]));
  const todos=new Set([...Object.keys(pessoas), ...porAcc.keys()].filter(a=>!ocultos.has(a)&&!String(a).startsWith('plan_')));
  const linhas=[...todos].map(a=>{ const p=porAcc.get(a)||null; const nome=(p&&p.nome)||(pessoas[a]&&pessoas[a].nome)||(t.pessoasTp[a]&&t.pessoasTp[a].nome)||a;
    const cap=mpCapDia(a,d)*3600; const ap=t.wl?(t.wl[a]||0):null;
    return { a, nome, p, cap, ap }; }).filter(x=>x.p||x.cap>0).sort((x,y)=>(y.p?1:0)-(x.p?1:0)||String(x.nome).localeCompare(String(y.nome),'pt-BR'));
  const st=(p)=>!p?'<span class="badge">sem plano</span>':p.st==='fechado'?'<span class="badge com-horas">🌙 fechado</span>':p.st==='planejado'?'<span class="badge">🌅 planejado</span>':'<span class="badge">rascunho</span>';
  const n={ plan:linhas.filter(x=>x.p&&x.p.st!=='rascunho').length, fech:linhas.filter(x=>x.p&&x.p.st==='fechado').length, sem:linhas.filter(x=>!x.p).length };
  return `<div class="card full hj-time"><h2>👥 Dia do time <span>${esc(hjRotuloDia(d))} · quem planejou e fechou o dia</span></h2>
    <div class="hj-cap"><span>Planejaram <b>${n.plan}</b></span><span>Fecharam <b>${n.fech}</b></span><span>Sem plano <b>${n.sem}</b></span><span class="spacer"></span><button class="btn" data-hj-time-retry>↻ Atualizar</button></div>
    <div class="scroll-x"><table class="hj-time-tab"><thead><tr><th>Pessoa</th><th>Dia</th><th>Itens</th><th>Planejado</th><th>Apontado</th><th>Capacidade</th></tr></thead><tbody>
      ${linhas.map(x=>`<tr><td><span class="lnk" data-pessoa="${escA(x.a)}">${esc(x.nome)}</span></td><td>${st(x.p)}</td><td>${x.p?`${x.p.feitos}/${x.p.n}`:'—'}</td><td>${x.p?hjH(x.p.estSeg):'—'}</td><td class="${x.ap!=null&&x.cap&&x.ap<x.cap*0.5?'hj-baixo':''}">${x.ap==null?'—':hjH(x.ap)}</td><td>${hjH(x.cap)}</td></tr>`).join('')||'<tr><td colspan="6" class="muted small">Ninguém com capacidade neste dia.</td></tr>'}
    </tbody></table></div>
    ${t.wl?'':'<div class="aviso small" style="margin-top:6px">⚠ O Clockwork não respondeu — a coluna "Apontado" ficou vazia. ↻ Atualizar tenta de novo.</div>'}
    <div class="muted small" style="margin-top:6px">O planejamento do dia é pessoal — aqui só o estado (sem os itens). "Apontado" vem do Clockwork; "Capacidade" é a meta da pessoa sem feriado/ausência.</div></div>`;
}

// ---------------- render ----------------
function hjCardKpis(d, res){
  const pc=res.meta?Math.min(100,Math.round(res.ap/res.meta*100)):0;
  const kp=(ic,rot,val,sub,cls)=>`<div class="hj-kpi ${cls||''}"><div class="hj-kpi-r">${ic} ${esc(rot)}</div><div class="hj-kpi-v">${val}</div><div class="hj-kpi-s muted small">${sub||''}</div></div>`;
  return `<div class="hj-kpis">
    ${kp('🧭','Capacidade', hjH(res.cap), res.cap?`livre ${hjH(res.livre)} fora das reuniões`:'sem capacidade (folga, feriado ou ausência)', res.cap?'':'off')}
    ${kp('📅','Reuniões', res.reun==null?'—':hjH(res.reun), res.reun==null?'agenda não carregada':`${hjEventosDia(d).filter(e=>!e.diaTodo).length} evento(s)`)}
    ${kp('✅','Planejado', hjH(res.plan), res.acima?`⚠ ${hjH(res.acima)} acima do que cabe`:`${res.feitos}/${res.n} feitos`, res.acima?'aten':'')}
    ${kp('⏱','Apontado', `${hjH(res.ap)} <span class="muted small">de ${hjH(res.meta)}</span>`, `<span class="hj-prog"><i style="width:${pc}%"></i></span> ${pc}%`, res.ap>=res.meta?'ok':'')}
  </div>`;
}
function hjItemHTML(d, it, idx, ctx){
  const por=ctx.por; const ap=it.k?(por[it.k]||0):0; const conf=it.ini&&!it.feito?hjConflito(d,it):null;
  const ev=it.ev?((estado.agenda.dados||{}).eventos||[]).find(e=>e.id===it.ev):null;
  const timer=hjTimerLe(); const rodando=!!(timer&&it.k&&timer.k===it.k);
  const foco=idx<HJ_FOCO&&!it.feito;
  const tit=it.k?`<a class="hj-k" href="${jiraBase()}/browse/${encodeURIComponent(it.k)}" target="_blank" rel="noopener" title="Abrir no Jira">${esc(it.k)}</a> `:'';
  return `<div class="hj-it${it.feito?' feito':''}${foco?' foco':''}${it.movido?' movido':''}" data-hj-id="${escA(it.id)}" data-hj-d="${escA(d)}" draggable="${it.feito?'false':'true'}">
    <span class="hj-drag" title="Arraste para reordenar ou para a linha do tempo">⠿</span>
    <input type="checkbox" class="hj-chk" data-hj-feito="${escA(it.id)}" data-hj-d="${escA(d)}" ${it.feito?'checked':''} aria-label="Feito">
    <div class="hj-main">
      <div class="hj-t">${tit}<span class="hj-txt">${esc(it.t||'')}</span>${it.movido?`<span class="badge" title="Movido para ${escA(fmtBR(it.movido))}">↪ ${esc(fmtBR(it.movido))}</span>`:''}</div>
      <div class="hj-sub">${it.p?`<span class="badge hj-p" title="${escA(it.p)}">${esc(projNome(it.p))}</span>`:''}<span class="badge hj-orig">${esc(HJ_ORIG_ROT[it.orig]||it.orig)}</span>
        ${it.ini?`<button class="badge hj-bloco${conf?' conf':''}" data-hj-agendar="${escA(it.id)}" title="${conf?'⚠ Em cima de '+escA(conf.tipo==='ev'?conf.ev.titulo:(conf.it.k||conf.it.t)):'Mudar o horário'}">🕘 ${esc(it.ini)}–${esc(hjHHMM(hjItemFim(it)))}${conf?' ⚠':''}</button>`:''}
        ${ap?`<span class="badge com-horas" title="Apontado hoje neste ticket">⏱ ${hjH(ap)} hoje</span>`:''}${ev&&!it.k&&!hjEvTicket(ev,d)?`<button class="badge ms-b-atra" data-hj-ev-ticket="${escA(ev.id)}" title="Reunião sem ticket — criar/vincular">📝 sem ticket</button>`:''}
        ${rodando?'<span class="badge hj-rod">▶ rodando</span>':''}</div>
    </div>
    <button class="hj-est${it.est?'':' vazio'}" data-hj-est="${escA(it.id)}" title="Estimativa — clique para editar" aria-label="Estimativa${it.est?': '+escA(fmtH(it.est)):' (vazia)'} — editar">${it.est?esc(fmtH(it.est)):'est.'}</button>
    <div class="hj-acoes">
      ${it.k?(rodando?`<button class="btn hj-b" data-hj-timer-stop title="Parar o cronômetro e apontar" aria-label="Parar o cronômetro e apontar">■</button>`:`<button class="btn hj-b" data-hj-timer="${escA(it.id)}" title="Iniciar o cronômetro neste ticket" aria-label="Iniciar o cronômetro">▶</button>`):''}
      <button class="btn hj-b" data-hj-apontar="${escA(it.id)}" title="${it.k?'Apontar horas':'Escolher o ticket e apontar'}" aria-label="${it.k?'Apontar horas':'Escolher o ticket e apontar'}">⏱</button>
      <button class="btn hj-b" data-hj-agendar="${escA(it.id)}" title="Agendar um bloco na linha do tempo" aria-label="Agendar um bloco">📅</button>
      ${it.k?`<button class="btn hj-b" data-hj-ficha="${escA(it.k)}" title="Ficha do ticket" aria-label="Ficha do ticket">🔍</button>`:''}
      <button class="btn hj-b" data-hj-menu="${escA(it.id)}" title="Mais ações" aria-label="Mais ações" aria-haspopup="true">⋯</button>
      <span class="hj-updown"><button class="btn hj-b" data-hj-up="${escA(it.id)}" title="Subir" aria-label="Subir">↑</button><button class="btn hj-b" data-hj-down="${escA(it.id)}" title="Descer" aria-label="Descer">↓</button></span>
    </div>
  </div>`;
}
function hjListaHTML(d, dia){
  const itens=(dia&&dia.itens||[]).filter(i=>!i.movido); const por=hjApontadoPorTicket(d);
  const ativos=itens.filter(i=>!i.feito), feitos=itens.filter(i=>i.feito);
  const ctx={ por }; let idx=0; const rows=[];
  itens.forEach(it=>{ if(it.feito) return; if(idx===HJ_FOCO&&ativos.length>HJ_FOCO) rows.push('<div class="hj-sep"><span>depois</span></div>'); rows.push(hjItemHTML(d,it,idx,ctx)); idx++; });
  if(feitos.length) rows.push(`<div class="hj-sep"><span>feitos (${feitos.length})</span></div>`+feitos.map(it=>hjItemHTML(d,it,99,ctx)).join(''));
  const movidos=(dia&&dia.itens||[]).filter(i=>i.movido);
  const projs=Object.entries(projNomes()).sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'pt-BR'));
  const sugN=hjSugestoes(d).reduce((s,g)=>s+g.itens.length,0);
  const livres=ativos.filter(i=>!i.k&&!i.ev);   // tarefas livres (sem ticket e sem reunião): candidatas a virar ticket em massa
  return `<div class="card hj-lista" id="hj-lista">
    <h2>✅ Lista do dia <span>${ativos.length?`${ativos.length} a fazer${ativos.length>HJ_FOCO?` · os ${HJ_FOCO} primeiros são o 🎯 foco`:''}`:'o que você vai fazer, na sua ordem'}</span><span class="spacer"></span><span class="muted small" id="hj-salvo"></span></h2>
    ${rows.length?`<div class="hj-itens" id="hj-itens">${rows.join('')}</div>`:`<div class="hj-vazio"><div>Nada planejado para ${esc(fmtBR(d))}.</div><div class="muted small">Comece pelo 🌅 Planejar o dia (traz o que ficou de antes, o plano da semana, vencidos, reuniões) ou adicione abaixo.</div></div>`}
    ${movidos.length?`<div class="muted small" style="margin-top:6px">↪ ${movidos.length} item(ns) movido(s) para outro dia.</div>`:''}
    <div class="hj-add">
      <input type="text" id="hj-add-txt" placeholder="ticket (ACME-12) ou tarefa livre… ↵" autocomplete="off" aria-label="Adicionar ticket ou tarefa">
      <select id="hj-add-proj" aria-label="Projeto da tarefa livre"><option value="">projeto…</option>${projs.map(([k,n])=>`<option value="${escA(k)}">${esc(n)}</option>`).join('')}</select>
      <button class="btn" data-hj-add>+ Adicionar</button>
      <button class="btn" data-hj-busca title="Buscar entre os tickets abertos (tecla /)">🎫 Buscar ticket</button>
      <button class="btn" data-hj-criar title="Criar um ou vários tickets no Jira — cada um entra no seu dia">📝 Criar ticket</button>
      ${livres.length?`<button class="lnk small" data-hj-criar-livres title="Os itens sem ticket viram tickets no Jira, um por linha">📝 Criar tickets dos ${livres.length} itens livres</button>`:''}
    </div>
    <details class="hj-sug" ${estado.hoje.sugAberta?'open':''} data-hj-sug-det><summary>💡 Sugestões <span class="muted small">(${sugN})</span> — o que ficou de antes, plano da semana, vencidos, prioridades, reuniões, recentes</summary>
      <div id="hj-sug-corpo">${estado.hoje.sugAberta?hjSugestoesHTML(d):''}</div></details>
  </div>`;
}
function hjSugestoesHTML(d){
  const gs=hjSugestoes(d);
  if(!gs.length) return '<div class="muted small" style="margin-top:6px">Sem sugestões agora — tudo que o painel conhece já está no seu dia.</div>';
  return gs.map(g=>`<div class="hj-sug-g"><div class="hj-sug-t">${esc(g.rot)} <button class="lnk small" data-hj-sug-todos="${escA(g.id)}">+ todos</button></div>
    ${g.itens.map(c=>`<div class="hj-sug-i"><button class="btn hj-b" data-hj-sug-add="${escA(c.cid)}" title="Adicionar ao dia" aria-label="Adicionar ao dia">+</button><span class="hj-cand-t">${c.k?`<b>${esc(c.k)}</b> `:''}${esc(c.t||'')}</span><span class="muted small">${esc(c.why||'')}${c.est?` · ${hjH(c.est)}`:''}</span></div>`).join('')}</div>`).join('');
}
function hjLinhaTempoHTML(d, dia){
  const evs=hjEventosDia(d); const itens=(dia&&dia.itens||[]).filter(i=>!i.movido&&i.ini&&!i.feito);
  // Worklog lido do Clockwork às 09:00 é ambíguo (é a hora padrão de quem aponta sem hora). Conta como hora real quando o
  // que esta sessão gravou tinha hora (`extra`, m vem de `hora`) ou quando um item do dia naquele ticket tem bloco às 09:00.
  const ini9=new Set((dia&&dia.itens||[]).filter(i=>i.k&&i.ini==='09:00').map(i=>i.k)); const nove=estado.hoje.nove||{};
  const comHora=(w)=>w.m!=null&&(w.m!==9*60||w.extra||ini9.has(w.k)||!!nove[`${d}|${w.k}|${w.s}`]);
  const logs=hjLogsDia(d).filter(comHora);
  let h0=7, h1=19;
  evs.forEach(ev=>{ if(ev.diaTodo) return; const a=hjMin((ev.inicio||'').slice(11,16)), b=hjMin((ev.fim||'').slice(11,16)); if(a!=null) h0=Math.min(h0,Math.floor(a/60)); if(b!=null) h1=Math.max(h1,Math.ceil(b/60)); });
  itens.forEach(it=>{ const a=hjMin(it.ini), b=hjItemFim(it); h0=Math.min(h0,Math.floor(a/60)); h1=Math.max(h1,Math.ceil(b/60)); });
  logs.forEach(w=>{ h0=Math.min(h0,Math.floor(w.m/60)); h1=Math.max(h1,Math.ceil((w.m+w.s/60)/60)); });
  h0=Math.max(0,h0); h1=Math.min(24,Math.max(h1,h0+6));
  const esc1=HJ_PX_HORA/60; const alt=(h1-h0)*HJ_PX_HORA; const top=(m)=>Math.max(0,(m-h0*60)*esc1);
  const horas=[...Array(h1-h0)].map((_,i)=>`<div class="hj-lt-h" style="top:${i*HJ_PX_HORA}px">${String(h0+i).padStart(2,'0')}h</div>`).join('');
  const lac=hjLacunas(d).map(l=>`<button class="hj-lt-lac" style="top:${top(l.a)}px;height:${(l.b-l.a)*esc1}px" data-hj-lac="${escA(hjHHMM(l.a))}" data-hj-lac-fim="${escA(hjHHMM(l.b))}" title="Livre ${hjHHMM(l.a)}–${hjHHMM(l.b)} — clique para agendar ou apontar aqui">livre · ${hjH((l.b-l.a)*60)}</button>`).join('');
  const evHtml=evs.filter(e=>!e.diaTodo).map(ev=>{ const a=hjMin((ev.inicio||'').slice(11,16)), b=hjMin((ev.fim||'').slice(11,16)); if(a==null||b==null) return '';
    const k=hjEvTicket(ev,d); const priv=ev.privado;
    const alt=Math.max(18,(b-a)*esc1);
    return `<div class="hj-lt-ev${priv?' priv':''}${k?' comtk':''}${alt<34?' curto':''}" style="top:${top(a)}px;height:${alt}px" title="${escA((priv?'🔒 particular':ev.titulo)+' · '+(ev.inicio||'').slice(11,16)+'–'+(ev.fim||'').slice(11,16))}">
      <span class="hj-lt-ev-t">${priv?'🔒 particular':esc(ev.titulo)}</span>
      <span class="hj-lt-ev-s">${k?`<span class="badge com-horas">✓ ${esc(k)}</span>`:(priv||agIgnorado(ev)?'':`<button class="badge ms-b-atra" data-hj-ev-ticket="${escA(ev.id)}">📝 sem ticket</button>`)}${ev.link?` <a class="small" href="${escA(ev.link)}" target="_blank" rel="noopener">entrar ↗</a>`:''}</span></div>`; }).join('');
  const blHtml=itens.map(it=>{ const a=hjMin(it.ini), b=hjItemFim(it); const conf=hjConflito(d,it);
    return `<div class="hj-lt-blk${conf?' conf':''}" style="top:${top(a)}px;height:${Math.max(18,(b-a)*esc1)}px" data-hj-blk="${escA(it.id)}" draggable="true" title="${escA((it.k?it.k+' — ':'')+(it.t||'')+' · '+it.ini+'–'+hjHHMM(b)+(conf?' · ⚠ conflito':''))}">
      <span class="hj-lt-blk-t">${it.k?`<b>${esc(it.k)}</b> `:''}${esc(it.t||'')}</span><span class="hj-lt-blk-s">${esc(it.ini)}–${esc(hjHHMM(b))}${conf?' ⚠':''} <a class="small" href="${escA(hjOutlookUrl(d,it))}" target="_blank" rel="noopener" title="Reservar este bloco no seu Outlook (abre o compose já preenchido)">🗓 Outlook</a></span></div>`; }).join('');
  const wlHtml=logs.map(w=>`<div class="hj-lt-wl" style="top:${top(w.m)}px;height:${Math.max(6,(w.s/60)*esc1)}px" title="${escA((w.k||'sem ticket')+' · '+hjHHMM(w.m)+' · '+fmtH(w.s))}"></div>`).join('');
  const agora=(d===hojeSP())?`<div class="hj-lt-agora" style="top:${top(hjAgoraMin())}px"><span>${esc(hjHHMM(hjAgoraMin()))}</span></div>`:'';
  const semHora=hjLogsDia(d).filter(w=>!comHora(w));
  const diaTodo=evs.filter(e=>e.diaTodo);
  return `<div class="card hj-lt-card" id="hj-lt-card">
    <h2>🕘 Linha do tempo <span>agenda, blocos planejados, apontado e lacunas — arraste um item para cá</span></h2>
    ${diaTodo.length?`<div class="small" style="margin-bottom:6px">📅 Dia inteiro: ${diaTodo.map(e=>esc(e.privado?'🔒 particular':e.titulo)).join(' · ')}</div>`:''}
    ${!hjAgendaCobre(d)?`<div class="muted small" style="margin-bottom:6px">${estado.agenda.carregando?'Consultando o Outlook…':estado.agenda.erro?'Outlook indisponível — a linha do tempo mostra só os seus blocos.':'Agenda só cobre de ontem a +14 dias.'}</div>`:''}
    <div class="hj-lt" data-hj-lt="${escA(d)}" data-hj-h0="${h0}">
      <div class="hj-lt-gutter" style="height:${alt}px">${horas}</div>
      <div class="hj-lt-col" style="height:${alt}px">${lac}${evHtml}${wlHtml}${blHtml}${agora}</div>
    </div>
    <div class="hj-lt-leg"><span class="l-ev">reunião</span><span class="l-blk">bloco planejado</span><span class="l-wl">apontado (com hora)</span><span class="l-lac">lacuna</span></div>
    ${semHora.length?`<div class="small" style="margin-top:6px">⏱ Apontado hoje sem hora de início: ${semHora.map(w=>`<span class="badge">${esc(w.k||'sem ticket')} ${hjH(w.s)}</span>`).join(' ')}</div>`:''}
  </div>`;
}
function renderHoje(){
  const cont=document.getElementById('conteudo'); const h=hjSt(); const idp=idApontar(); const d=hjD();
  const time=estado.vista==='hojetime';
  if(!idp){ cont.replaceChildren(el(`<div class="card full"><h2>📆 Hoje <span>o seu dia num lugar só</span></h2>
    <div class="estado">Identifique-se (e-mail + token do Jira) para planejar o seu dia — o painel usa a sua identidade para ler a agenda, os seus tickets e gravar o plano.<br><button class="btn primario" style="margin-top:10px" data-hj-ident>Identificar-se</button></div></div>`)); return; }
  hjTimerPinta(); hjTimerAvisoEsquecido();
  if(!estado.agenda.dados&&!estado.agenda.carregando&&!estado.agenda.erro) carregaAgenda(false);
  // As minhas horas do dia (janela do ⏱ Apontar): UMA leitura por dia aberto — quando chega, redesenha. Sem a guarda
  // (h._logsP) a promessa já resolvida redesenhava, o redesenho pedia de novo e a página travava num laço de microtarefas.
  // Dia no futuro não tem worklog (a janela nunca o cobre: pedir de novo seria outro laço); e só redesenha se a leitura
  // passou a cobrir o dia — senão a guarda fica armada e a tela segue com o que tem.
  const apx=estado.apontar; const precisaLogs=d<=hojeSP()&&(!apMeusLogsCobre(d)||apx.meusLogsEscreveu||apx.meusLogsSujo);
  // A guarda solta em QUALQUER desfecho (senão uma leitura que falhou ou não cobriu o dia deixava a tela sem reler para sempre);
  // o redesenho só acontece quando a leitura passou a cobrir o dia — e o apGaranteMeusLogs tem folga de 30 s na falha.
  if(precisaLogs&&h._logsP!==d){ h._logsP=d; apGaranteMeusLogs(d).then(x=>{ h._logsP=''; if(x&&apMeusLogsCobre(d)&&!apx.meusLogsEscreveu&&!apx.meusLogsSujo&&hjVistaAberta()) renderHoje(); }); }
  const dia=hjDia(d); if(dia===undefined) hjGarante(d);
  // Foco: quem redesenha a tela devolve o foco ao MESMO controle (pelo id ou pelo atributo data-hj-*) — ↵ no "+ Adicionar",
  // ✓ feito, ↑↓ e a estimativa inline não jogam o foco para o body.
  const foco=hjFocoSel(cont);
  const topo=`<div class="hj-topo">
    <h2>📆 Hoje <span>o seu dia num lugar só: o que fazer, quando, e o que já foi apontado</span></h2>
    <div class="hj-nav">
      <button class="btn" data-hj-nav="-1" title="Dia anterior" aria-label="Dia anterior">‹</button><button class="btn" data-hj-nav="0" title="Voltar a hoje">hoje</button><button class="btn" data-hj-nav="1" title="Próximo dia" aria-label="Próximo dia">›</button>
      <strong class="hj-data">${esc(hjRotuloDia(d))}</strong>
      ${dia&&dia.st==='planejado'?`<span class="badge com-horas" title="Planejado às ${escA(hjHoraSP(dia.planejadoEm))}">🌅 planejado</span>`:dia&&dia.st==='fechado'?`<span class="badge" title="Fechado às ${escA(hjHoraSP(dia.fechadoEm))}">🌙 fechado</span>`:''}
      <button class="btn hj-b" data-hj-retry title="Reler o dia no servidor (o que outra aba/aparelho gravou)" aria-label="Atualizar">↻</button>
      <span class="spacer"></span>
      ${time?'':`<button class="btn primario" data-hj-rit="planejar">🌅 Planejar o dia</button><button class="btn" data-hj-rit="fechar" ${d>hojeSP()?'disabled title="Só um dia que já chegou pode ser fechado"':''}>🌙 Fechar o dia</button><button class="btn" data-hj-urg title="Reordena pela urgência: vencidos → vence hoje → prioridade do time → em andamento → vence esta semana → sem data">⚡ Ordenar por urgência</button>`}
    </div></div>`;
  if(time){ hjTimeGarante(d); cont.replaceChildren(el(`<div class="hj-tela">${topo}${hjTimeHTML(d)}</div>`)); hjFocoVolta(cont,foco); return; }
  if(dia===undefined&&!h.erro){ cont.replaceChildren(el(`<div class="hj-tela">${topo}<div class="card full"><div class="estado">Carregando o seu dia…</div></div></div>`)); return; }
  const res=hjResumo(d);
  const nota=dia&&dia.nota?`<div class="aviso hj-nota">📝 <b>Nota do fechamento:</b> ${esc(dia.nota)}</div>`:'';
  const ultP=hjUltimoPlanejado(d); const ficou=ultP?h.dias[ultP].itens.filter(i=>!i.feito&&!i.movido).length:0;
  const avisoFicou=(ficou&&(!dia||!dia.itens.length))?`<div class="aviso">↩ <b>${ficou} item(ns)</b> ficaram de ${esc(fmtBR(ultP))}. O 🌅 Planejar o dia traz o que ainda vale.</div>`:'';
  const erro=h.erro?`<div class="erro">${esc(h.erro)} <button class="btn" data-hj-retry>Tentar de novo</button></div>`:'';
  cont.replaceChildren(el(`<div class="hj-tela">${topo}${erro}${hjCardKpis(d,res)}${nota}${avisoFicou}
    <div class="hj-2col"><div>${hjListaHTML(d,dia)}</div><div class="hj-ltwrap">${hjLinhaTempoHTML(d,dia)}</div></div></div>`));
  hjPintaSalvando(); hjFocoVolta(cont,foco);
  try{ renderAbas(); }catch(e){}   // contador da aba (itens a fazer) acompanha o ✓
  if(hjRitualAberto()) hjRitualPinta();   // dado novo (agenda, vencidos, dias) chegou com o 🌅/🌙 aberto: as sugestões acompanham
  // ⏱ a cada minuto a linha "agora" anda (só com a tela aberta)
  clearInterval(h._tick); h._tick=setInterval(()=>{ if(!hjVistaAberta()){ clearInterval(h._tick); return; } const a=document.querySelector('.hj-lt-agora'); const lt=document.querySelector('[data-hj-lt]'); if(a&&lt){ const h0=+lt.getAttribute('data-hj-h0'); a.style.top=Math.max(0,(hjAgoraMin()-h0*60)*HJ_PX_HORA/60)+'px'; a.querySelector('span').textContent=hjHHMM(hjAgoraMin()); } hjTimerPinta(); },60000);
}

// Seletor do controle com foco dentro de `cont` (id ou o 1º atributo data-hj-*) e a volta do foco depois do redesenho.
function hjFocoSel(cont){
  const ae=document.activeElement; if(!ae||ae===document.body||!cont.contains(ae)) return '';
  if(ae.id) return '#'+CSS.escape(ae.id);
  const at=[...ae.attributes].find(a=>a.name.startsWith('data-hj-')); return at?`[${at.name}="${CSS.escape(at.value)}"]`:'';
}
function hjFocoVolta(cont, sel){ if(!sel) return; try{ const f=cont.querySelector(sel); if(f&&document.activeElement!==f) f.focus({ preventScroll:true }); }catch(e){} }

// ---------------- 🏠 card da Início ----------------
function hjCardInicio(hoje){
  const d=hoje||hojeSP(); const h=hjSt(); if(!hjAcc()) return ''; const dia=hjDia(d); if(dia===undefined) hjGarante(d);
  const hSP=hjAgoraMin();
  const corpo=(x)=>`<div class="ax-card hj-card-inicio ${x.cls}"><div class="ax-top"><span>📆</span> Seu dia${x.selo||''}</div>${x.corpo}<div class="ax-foot">${x.btns}</div></div>`;
  if(dia===undefined&&h.erro) return corpo({ cls:'aten', corpo:`<div class="ax-num muted">!</div><div class="ax-det">${esc(h.erro)}</div>`, btns:'<button class="btn" data-hj-retry-inicio>Tentar de novo</button>' });
  if(dia===undefined) return corpo({ cls:'load', corpo:'<div class="ax-num muted">…</div><div class="ax-det">Carregando o seu dia…</div>', btns:'<button class="btn" data-hx-goto="hoje">Abrir o 📆 Hoje →</button>' });
  const itens=(dia&&dia.itens||[]).filter(i=>!i.movido); const ativos=itens.filter(i=>!i.feito);
  if(!dia||!itens.length){ const ult=hjUltimoPlanejado(d); const ficou=ult?(estado.hoje.dias[ult].itens||[]).filter(i=>!i.feito&&!i.movido).length:0;
    return corpo({ cls:'aten', corpo:`<div class="ax-num">—</div><div class="ax-det">você ainda não planejou o dia${ficou?` · ${ficou} item(ns) ficaram de ${fmtBR(ult)}`:''}</div>`, btns:'<button class="btn primario" data-hx-goto="hoje-planejar">🌅 Planejar o dia →</button>' }); }
  const res=hjResumo(d); const top=ativos.slice(0,HJ_FOCO);
  const lista=top.map(it=>`<label class="hj-mini"><input type="checkbox" data-hj-feito="${escA(it.id)}" data-hj-d="${escA(d)}"> <span>${it.k?`<b>${esc(it.k)}</b> `:''}${esc((it.t||'').slice(0,60))}${it.ini?` <span class="muted small">🕘 ${esc(it.ini)}</span>`:''}</span></label>`).join('');
  const fechar=dia.st!=='fechado'&&hSP>=17*60;
  return corpo({ cls:dia.st==='fechado'?'ok':(res.acima?'aten':'ok'), selo:dia.st==='fechado'?' <span class="badge">🌙 fechado</span>':'',
    corpo:`<div class="ax-num">${res.feitos}<span class="muted" style="font-size:14px;font-weight:400">/${res.n} feitos</span> <span class="muted" style="font-size:14px;font-weight:400">· ${hjH(res.ap)} apontadas</span></div>
      ${lista?`<div class="hj-minis">${lista}${ativos.length>HJ_FOCO?`<div class="muted small">+ ${ativos.length-HJ_FOCO} depois</div>`:''}</div>`:'<div class="ax-det">tudo feito 🎉</div>'}${res.acima?`<div class="ax-det">⚠ ${hjH(res.acima)} acima do que cabe hoje</div>`:''}`,
    btns:`<button class="btn ${fechar?'':'primario'}" data-hx-goto="hoje">Ver o dia →</button>${fechar?'<button class="btn primario" data-hx-goto="hoje-fechar">🌙 Fechar o dia →</button>':''}` });
}

// ---------------- eventos (delegados — esta tela, os modais dela, o card da Início e a pílula) ----------------
let _hjDragId=null, _hjDragBlk=null;
document.addEventListener('click', async (e)=>{
  const t=e.target; if(!t||!t.closest) return;
  const dAttr=(x)=>(x&&x.getAttribute('data-hj-d'))||hjD();
  // pílula do cronômetro (qualquer tela)
  if(t.closest('[data-hj-timer-stop]')){ e.preventDefault(); hjTimerParaModal(); return; }
  if(t.closest('[data-hj-timer-ir]')){ vaiPara('hoje'); return; }
  const tm=t.closest('[data-hj-timer]'); if(tm){ const d=dAttr(tm.closest('[data-hj-d]')); const it=hjItem(d, tm.getAttribute('data-hj-timer')); if(it) hjTimerInicia(it.k, it.t, it.id, d); return; }
  const tk=t.closest('[data-hj-timer-k]'); if(tk){ hjTimerInicia(tk.getAttribute('data-hj-timer-k'), tk.getAttribute('data-hj-timer-t')||''); return; }
  if(t.closest('#hj-tp-ok')){ hjTimerConfirma(false); return; }
  if(t.closest('#hj-tp-descarta')){ hjTimerConfirma(true); return; }
  if(t.closest('[data-hj-fecha]')){ const r=estado.hoje.ritual; if(r&&r.executando) return; if(_hjCr&&_hjCr.enviando) return; estado.hoje.ritual=null; _hjAp=null; _hjTp=null; _hjCr=null; fechaModal(); return; }
  if(t.closest('[data-hj-ident]')){ abreIdentidade(); return; }
  if(t.closest('[data-hj-retry-inicio]')){ estado.hoje.erro=''; estado.hoje.erroEm=0; hjGarante(hojeSP(),true); if(estado.vista==='acoes') agendaRenderAcoes(); return; }
  // ✓ feito (lista e card da Início)
  const fe=t.closest('[data-hj-feito]'); if(fe){ const d=dAttr(fe); hjToggleFeito(d, fe.getAttribute('data-hj-feito'), fe.checked); if(hjVistaAberta()) renderHoje(); else { try{ renderAbas(); }catch(e){} if(estado.vista==='acoes') setTimeout(()=>agendaRenderAcoes(),250); } return; }
  if(!hjVistaAberta()&&!t.closest('#modal-body')) return;   // daqui para baixo: a tela e os modais dela
  const nav=t.closest('[data-hj-nav]'); if(nav){ const n=+nav.getAttribute('data-hj-nav'); hjVaiDia(n?mtsSoma(hjD(),n):hojeSP()); estado.hoje.sugAberta=false; renderHoje(); return; }
  if(t.closest('[data-hj-retry]')){ hjRele(hjD()); return; }
  if(t.closest('[data-hj-time-retry]')){ hjTimeGarante(hjD(),true); renderHoje(); return; }
  const aba=t.closest('[data-hj-aba]'); if(aba){ vaiPara(aba.getAttribute('data-hj-aba')); return; }
  const rit=t.closest('[data-hj-rit]'); if(rit){ if(rit.getAttribute('data-hj-rit')==='planejar') hjRitualPlanejar(hjD()); else hjRitualFechar(hjD()); return; }
  if(t.closest('[data-hj-urg]')){ hjOrdenaUrgencia(hjD()); renderHoje(); toast('⚡ Ordenado por urgência — arraste para ajustar.','ok'); return; }
  if(t.closest('[data-hj-add]')){ const i=document.getElementById('hj-add-txt'); const p=document.getElementById('hj-add-proj'); if(i&&i.value.trim()){ const v=i.value; i.value=''; await hjAdicionaTexto(hjD(), v, p?p.value:''); } else if(i) i.focus(); return; }
  if(t.closest('[data-hj-busca]')){ hjBuscaParaDia(hjD()); return; }
  // 📝 criar tickets: da linha de adicionar (o texto digitado vira a 1ª linha), dos itens livres (em massa) e do ⋯ de um item
  if(t.closest('[data-hj-criar]')){ const i=document.getElementById('hj-add-txt'); const p=document.getElementById('hj-add-proj'); const txt=i?i.value:''; if(i) i.value=''; hjCriarModal(hjD(),{ texto:txt, proj:p?p.value:'' }); return; }
  if(t.closest('[data-hj-criar-livres]')){ const ids=hjItens(hjD()).filter(i=>!i.k&&!i.ev&&!i.feito&&!i.movido).map(i=>i.id); if(!ids.length){ toast('Nenhum item livre no dia.','info'); return; } hjCriarModal(hjD(),{ ids }); return; }
  const cri=t.closest('[data-hj-criar-item]'); if(cri){ fechaModal(); hjCriarModal(hjD(),{ ids:[cri.getAttribute('data-hj-criar-item')] }); return; }
  if(t.closest('[data-hj-cr-ok]')){ hjCriarExecuta(); return; }
  if(t.closest('[data-hj-cr-add]')){ hjCriarLe(); const l=hjCriarAddLinha(); hjCriarPinta(); const i=l&&document.querySelector(`#modal-body [data-hj-cr-resumo="${CSS.escape(l.rid)}"]`); if(i) i.focus(); return; }
  const crRm=t.closest('[data-hj-cr-rm]'); if(crRm){ const m=_hjCr; if(!m||m.enviando) return; hjCriarLe(); m.linhas=m.linhas.filter(l=>l.rid!==crRm.getAttribute('data-hj-cr-rm')); if(!m.linhas.some(l=>!l.key)) hjCriarAddLinha(); hjCriarPinta(); return; }
  if(t.closest('[data-hj-cr-cola-abre]')){ const m=_hjCr; if(!m) return; hjCriarLe(); m.cola=!m.cola; hjCriarPinta(); const c=document.getElementById('hj-cr-cola'); if(c) c.focus(); return; }
  if(t.closest('[data-hj-cr-cola-ok]')){ const m=_hjCr; if(!m) return; hjCriarLe(); const linhas=String(m.colaTxt||'').split('\n').map(s=>s.trim()).filter(Boolean);
    if(!linhas.length){ toast('Cole uma linha por ticket.','warn'); return; }
    // a única linha vazia do modal é substituída pela primeira colada (não sobra uma linha em branco para o ✓ reprovar)
    const vazia=m.linhas.find(l=>!l.key&&!l.resumo&&!l.itemId); if(vazia) m.linhas=m.linhas.filter(l=>l!==vazia);
    const ult=m.linhas.filter(l=>!l.key).slice(-1)[0]; const pDef=(ult&&ult.p)||(vazia&&vazia.p)||'';   // o projeto da última linha (ou o da linha vazia que saiu)
    linhas.slice(0,100).forEach(s=>{ const i=s.indexOf(';'); hjCriarAddLinha({ resumo:i>=0?s.slice(0,i):s, desc:i>=0?s.slice(i+1):'', p:pDef }); });
    m.colaTxt=''; m.cola=false; hjCriarPinta(); toast(`+ ${Math.min(100,linhas.length)} linha(s).`,'ok'); return; }
  const sd=t.closest('[data-hj-sug-det]'); if(sd&&t.closest('summary')){ setTimeout(()=>{ estado.hoje.sugAberta=sd.open; const c=document.getElementById('hj-sug-corpo'); if(c&&sd.open&&!c.innerHTML) c.innerHTML=hjSugestoesHTML(hjD()); },0); return; }
  const sa=t.closest('[data-hj-sug-add]'); if(sa){ const cid=sa.getAttribute('data-hj-sug-add'); const c=hjSugestoes(hjD()).flatMap(g=>g.itens).find(x=>x.cid===cid); if(c){ hjAdiciona(hjD(), c); estado.hoje.sugAberta=true; renderHoje(); } return; }
  const st=t.closest('[data-hj-sug-todos]'); if(st){ const g=hjSugestoes(hjD()).find(x=>x.id===st.getAttribute('data-hj-sug-todos')); if(g){ g.itens.forEach(c=>hjAdiciona(hjD(), c, { quieto:true, semSalvar:true })); hjAgendaSalvar(hjD()); estado.hoje.sugAberta=true; renderHoje(); toast(`+ ${g.itens.length} item(ns) no seu dia.`,'ok'); } return; }
  const up=t.closest('[data-hj-up]'); if(up){ hjMove(hjD(), up.getAttribute('data-hj-up'), -1); renderHoje(); return; }
  const dn=t.closest('[data-hj-down]'); if(dn){ hjMove(hjD(), dn.getAttribute('data-hj-down'), 1); renderHoje(); return; }
  const ap=t.closest('[data-hj-apontar]'); if(ap){ hjApontaModal(hjD(), ap.getAttribute('data-hj-apontar')); return; }
  if(t.closest('#hj-ap-ok')){ hjApontaConfirma(); return; }
  const chip=t.closest('[data-hj-ap-chip]'); if(chip){ const i=document.getElementById('hj-ap-tempo'); if(i){ i.value=chip.getAttribute('data-hj-ap-chip'); i.focus(); } return; }
  const ag=t.closest('[data-hj-agendar]'); if(ag){ hjAgendaModal(hjD(), ag.getAttribute('data-hj-agendar')); return; }
  const lacC=t.closest('[data-hj-ag-lac]'); if(lacC){ const i=document.getElementById('hj-ag-ini'); if(i) i.value=lacC.getAttribute('data-hj-ag-lac'); return; }
  const agOk=t.closest('[data-hj-ag-ok]'); if(agOk){ const id=agOk.getAttribute('data-hj-ag-ok'); const ini=((document.getElementById('hj-ag-ini')||{}).value||'').slice(0,5); const est=parseTempo((document.getElementById('hj-ag-est')||{}).value);
    if(!/^\d{2}:\d{2}$/.test(ini)){ toast('Escolha a hora de início.','warn'); return; } if(est!=null&&est>0) hjSetEst(hjD(), id, est); hjAgenda(hjD(), id, ini); fechaModal(); renderHoje(); return; }
  const agT=t.closest('[data-hj-ag-tira]'); if(agT){ hjAgenda(hjD(), agT.getAttribute('data-hj-ag-tira'), ''); fechaModal(); renderHoje(); return; }
  // lacuna: agendar um item ali ou apontar ali
  const lac=t.closest('[data-hj-lac]'); if(lac){ const ini=lac.getAttribute('data-hj-lac'), fim=lac.getAttribute('data-hj-lac-fim'); const d=hjD();
    const cand=hjItens(d).filter(i=>!i.feito&&!i.movido&&!i.ini);
    abreModal(`<div class="hj-modal"><h2>🕘 Lacuna ${esc(ini)}–${esc(fim)}</h2><div class="muted small">${hjH((hjMin(fim)-hjMin(ini))*60)} livres. Agende um item do dia aqui ou aponte o que fez nesse horário.</div>
      ${cand.length?`<div class="hj-cands" style="margin-top:8px">${cand.map(i=>`<button class="hj-cand hj-cand-b" data-hj-lac-item="${escA(i.id)}" data-hj-lac-ini="${escA(ini)}"><span class="hj-cand-t">${i.k?`<b>${esc(i.k)}</b> `:''}${esc(i.t||'')}</span><span class="muted small">${i.est?hjH(i.est):'sem est.'}</span></button>`).join('')}</div>`:'<div class="muted small" style="margin-top:8px">Nenhum item sem horário na lista.</div>'}
      <div class="alx-modal-acoes"><button class="btn" data-hj-lac-apontar="${escA(ini)}" data-hj-lac-fim="${escA(fim)}">⏱ Apontar neste horário</button><button class="btn" data-hj-fecha>Fechar</button></div></div>`); return; }
  const li=t.closest('[data-hj-lac-item]'); if(li){ hjAgenda(hjD(), li.getAttribute('data-hj-lac-item'), li.getAttribute('data-hj-lac-ini')); fechaModal(); renderHoje(); return; }
  // ⏱ na lacuna: o ticket escolhido vai direto ao modal de apontar como CANDIDATO — só entra no dia se o apontamento gravar
  const la=t.closest('[data-hj-lac-apontar]'); if(la){ const ini=la.getAttribute('data-hj-lac-apontar'), fim=la.getAttribute('data-hj-lac-fim'); const seg=(hjMin(fim)-hjMin(ini))*60; fechaModal();
    abreBuscaTickets('', (k, info)=>{ const cand={ k, t:(info&&info.resumo)||'', p:(info&&info.p)||k.split('-')[0], est:seg, orig:'busca', ini }; hjApontaModal(hjD(), '', { hora:ini, seg, cand }); }); return; }
  const fi=t.closest('[data-hj-ficha]'); if(fi){ abreModalTicket(fi.getAttribute('data-hj-ficha'), null); return; }
  const evt=t.closest('[data-hj-ev-ticket]'); if(evt){ agAbreTicket(evt.getAttribute('data-hj-ev-ticket')); return; }
  const est=t.closest('[data-hj-est]'); if(est){ const id=est.getAttribute('data-hj-est'); const it=hjItem(hjD(), id); if(!it) return;
    const inp=el(`<input type="text" class="hj-est-inp" value="${escA(it.est?fmtH(it.est):'')}" placeholder="1h30" aria-label="Estimativa">`); est.replaceWith(inp); inp.focus(); inp.select();
    // `fim` roda UMA vez: o Enter redesenha a tela, o redesenho tira o campo do DOM e o blur dispara no meio — sem a guarda
    // eram dois replaceChildren encavalados ("node to be removed is no longer a child").
    let feito=false; const onBlur=()=>fim(true);
    const fim=(grava)=>{ if(feito) return; feito=true; inp.removeEventListener('blur',onBlur);
      if(grava){ const s=parseTempo(inp.value); if(inp.value.trim()&&s==null){ toast('Estimativa inválida — use 1h30, 45m ou 2:15.','warn'); } else hjSetEst(hjD(), id, s||0); } renderHoje(); };
    inp.addEventListener('keydown',(ev)=>{ if(ev.key==='Enter'){ ev.preventDefault(); fim(true); } if(ev.key==='Escape'){ ev.stopPropagation(); fim(false); } });
    inp.addEventListener('blur',onBlur); return; }
  const menu=t.closest('[data-hj-menu]'); if(menu){ const id=menu.getAttribute('data-hj-menu'); const it=hjItem(hjD(), id); if(!it) return;
    abreModal(`<div class="hj-modal"><h2>⋯ ${esc(it.k||it.t)}</h2><div class="hj-menu">
      <button class="btn" data-hj-amanha="${escA(id)}">↪ Mover para o próximo dia útil (${esc(fmtBR(hjProxUtil(hjD())))})</button>
      ${it.k?`<button class="btn" data-hj-ficha="${escA(it.k)}">🔍 Ficha do ticket</button><a class="btn" href="${jiraBase()}/browse/${encodeURIComponent(it.k)}" target="_blank" rel="noopener">Abrir no Jira ↗</a>`:`${it.ev?'':`<button class="btn" data-hj-criar-item="${escA(id)}">📝 Criar o ticket deste item</button>`}<button class="btn" data-hj-ligar="${escA(id)}">🎫 Ligar a um ticket</button>`}
      ${it.ini?`<a class="btn" href="${escA(hjOutlookUrl(hjD(),it))}" target="_blank" rel="noopener">🗓 Reservar no Outlook (${esc(it.ini)})</a>`:''}
      <button class="btn" data-hj-remover="${escA(id)}">✕ Tirar do dia</button></div>
      <div class="alx-modal-acoes"><button class="btn" data-hj-fecha>Fechar</button></div></div>`); return; }
  const am=t.closest('[data-hj-amanha]'); if(am){ fechaModal(); await hjParaAmanha(hjD(), am.getAttribute('data-hj-amanha')); return; }
  const lig=t.closest('[data-hj-ligar]'); if(lig){ fechaModal(); hjBuscaParaDia(hjD(), lig.getAttribute('data-hj-ligar')); return; }
  const rm=t.closest('[data-hj-remover]'); if(rm){ hjRemove(hjD(), rm.getAttribute('data-hj-remover')); fechaModal(); renderHoje(); return; }
  // rituais
  const rp=t.closest('[data-hj-rit-passo]'); if(rp){ const r=estado.hoje.ritual; if(!r||r.executando) return; hjRitualLeCampos(); r.passo=+rp.getAttribute('data-hj-rit-passo'); r.fb=null; hjRitualPinta(); return; }
  if(t.closest('[data-hj-rit-ok]')){ hjRitualAplica(); return; }
  const rtd=t.closest('[data-hj-rit-todos]'); if(rtd){ e.preventDefault(); const r=estado.hoje.ritual; const g=r&&(r.grupos||[]).find(x=>x.id===rtd.getAttribute('data-hj-rit-todos')); if(g){ g.itens.forEach(c=>{ r.sel[c.cid]=true; }); hjRitualPinta(); } return; }
  const rtn=t.closest('[data-hj-rit-nenhum]'); if(rtn){ e.preventDefault(); const r=estado.hoje.ritual; const g=r&&(r.grupos||[]).find(x=>x.id===rtn.getAttribute('data-hj-rit-nenhum')); if(g){ g.itens.forEach(c=>{ r.sel[c.cid]=false; }); hjRitualPinta(); } return; }
});
document.addEventListener('change',(e)=>{
  const t=e.target; if(!t||!t.closest) return;
  // 📝 criar: trocar o projeto de uma linha redesenha os tipos dela (o resto do que está digitado é lido antes)
  if(t.closest('#modal-body .hj-cr')){ const m=_hjCr; if(!m||m.enviando) return; hjCriarLe(); const rid=t.getAttribute('data-hj-cr-p'); if(rid!=null){ const l=m.linhas.find(x=>x.rid===rid); if(l){ l.tipoId=hjTipoPadrao(l.p); } hjCriarPinta(); } return; }
  if(!t.closest('#modal-body .hj-rit')) return; const r=estado.hoje.ritual; if(!r) return;
  const s=t.getAttribute('data-hj-rit-sel'); if(s!=null){ r.sel[s]=t.checked; return; }
  const a=t.getAttribute('data-hj-rit-adiar'); if(a!=null){ hjRitualLeCampos(); r.adiar[a]=t.checked; hjRitualPinta(); return; }
  const nf=t.getAttribute('data-hj-rit-nf'); if(nf!=null){ r.naoFeitos[nf]=t.value; return; }
  const apx=t.getAttribute('data-hj-rit-ap'); if(apx!=null){ r.apontar[apx]=t.checked; return; }
  const es=t.getAttribute('data-hj-rit-est'); if(es!=null){ hjRitualLeCampos(); hjRitualPinta(); return; }
  const tp=t.getAttribute('data-hj-rit-tempo'); if(tp!=null){ hjRitualLeCampos(); return; }
});
// Esc: roda ANTES do Esc global (30) — limpa o estado dos modais desta tela; durante uma gravação do ritual o Esc não fecha.
document.addEventListener('keydown',(e)=>{
  if(e.key!=='Escape') return; const mb=document.getElementById('modal-body'); const m=document.getElementById('modal');
  if(!mb||!m||m.hidden||!mb.querySelector('.hj-modal')) return;
  const r=estado.hoje.ritual; if((r&&r.executando)||(_hjCr&&_hjCr.enviando)){ e.stopImmediatePropagation(); e.preventDefault(); return; }
  estado.hoje.ritual=null; _hjAp=null; _hjTp=null; _hjCr=null;
});
// 📝 criar: ↵ num título pula para a próxima linha (cria uma no fim); Ctrl/Cmd+↵ em qualquer campo cria os tickets.
document.addEventListener('keydown',(e)=>{
  const t=e.target; if(!t||!t.closest||!_hjCr||!t.closest('#modal-body .hj-cr')) return;
  if(e.key!=='Enter') return;
  if(e.ctrlKey||e.metaKey){ e.preventDefault(); hjCriarExecuta(); return; }
  if(t.id==='hj-cr-cola'){ return; }   // Enter na colagem é quebra de linha
  if(t.tagName==='INPUT'){ e.preventDefault(); if(_hjCr.enviando) return; hjCriarLe(); const rid=t.getAttribute('data-hj-cr-resumo')||t.getAttribute('data-hj-cr-est'); const pend=_hjCr.linhas.filter(l=>!l.key); const i=pend.findIndex(l=>l.rid===rid);
    let prox=i>=0?pend[i+1]:null; if(i>=0&&!prox){ if(!pend[i].resumo) return; prox=hjCriarAddLinha(); } if(!prox) return; hjCriarPinta();
    const f=document.querySelector(`#modal-body [data-hj-cr-resumo="${CSS.escape(prox.rid)}"]`); if(f) f.focus(); }
});
document.addEventListener('keydown',(e)=>{
  const t=e.target; if(!t||!t.id) return;
  if(t.id==='hj-add-txt'&&e.key==='Enter'){ e.preventDefault(); const v=t.value; const p=document.getElementById('hj-add-proj'); if(v.trim()){ t.value=''; hjAdicionaTexto(hjD(), v, p?p.value:''); } return; }
  if((t.id==='hj-ap-tempo'||t.id==='hj-ap-coment'||t.id==='hj-ap-hora'||t.id==='hj-ap-dia')&&e.key==='Enter'){ e.preventDefault(); hjApontaConfirma(); return; }
  if((t.id==='hj-tp-tempo'||t.id==='hj-tp-coment')&&e.key==='Enter'){ e.preventDefault(); hjTimerConfirma(false); return; }
  if((t.id==='hj-ag-ini'||t.id==='hj-ag-est')&&e.key==='Enter'){ e.preventDefault(); const b=document.querySelector('#modal-body [data-hj-ag-ok]'); if(b) b.click(); }
});
// Relê o dia no servidor (↻ e volta à aba): o que esta sessão ainda não gravou é gravado antes, para não se perder.
function hjRele(d){ const h=hjSt(); h.erro=''; h.erroEm=0; const p=hjSujo(d)?hjSalvar(d):Promise.resolve(true); p.then(()=>{ hjGarante(d,true); }); renderHoje(); }
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState!=='visible'||!hjVistaAberta()||!hjAcc()) return; const h=hjSt(); const d=hjD(); if(hjSujo(d)||h.ritual||_hjAp||_hjTp) return; hjGarante(d,true); });
// Arrastar: item da lista → reordenar (solta em cima de outro item) ou → linha do tempo (vira bloco, grade de 15 min);
// bloco da linha do tempo → mover de horário.
document.addEventListener('dragstart',(e)=>{
  const r=e.target.closest&&e.target.closest('.hj-it[draggable="true"]'); const b=e.target.closest&&e.target.closest('.hj-lt-blk[draggable="true"]');
  if(!r&&!b) return; _hjDragId=r?r.getAttribute('data-hj-id'):null; _hjDragBlk=b?b.getAttribute('data-hj-blk'):null;
  (r||b).classList.add('hj-arrastando'); try{ e.dataTransfer.setData('text/plain', _hjDragId||_hjDragBlk); e.dataTransfer.effectAllowed='move'; }catch(_){}
});
document.addEventListener('dragend',()=>{ _hjDragId=null; _hjDragBlk=null; document.querySelectorAll('.hj-arrastando,.hj-solta,.hj-lt.solta').forEach(x=>x.classList.remove('hj-arrastando','hj-solta','solta')); });
document.addEventListener('dragover',(e)=>{
  if(!_hjDragId&&!_hjDragBlk) return;
  const lt=e.target.closest&&e.target.closest('[data-hj-lt]'); const it=e.target.closest&&e.target.closest('.hj-it');
  if(lt){ e.preventDefault(); lt.classList.add('solta'); try{ e.dataTransfer.dropEffect='move'; }catch(_){} return; }
  if(it&&_hjDragId&&it.getAttribute('data-hj-id')!==_hjDragId){ e.preventDefault(); document.querySelectorAll('.hj-it.hj-solta').forEach(x=>x.classList.remove('hj-solta')); it.classList.add('hj-solta'); try{ e.dataTransfer.dropEffect='move'; }catch(_){} }
});
document.addEventListener('drop',(e)=>{
  if(!_hjDragId&&!_hjDragBlk) return;
  const lt=e.target.closest&&e.target.closest('[data-hj-lt]'); const it=e.target.closest&&e.target.closest('.hj-it');
  const d=hjD();
  if(lt){ e.preventDefault(); const col=lt.querySelector('.hj-lt-col'); const rect=col.getBoundingClientRect(); const h0=+lt.getAttribute('data-hj-h0');
    const min=Math.round((h0*60+(e.clientY-rect.top)/HJ_PX_HORA*60)/15)*15; const id=_hjDragId||_hjDragBlk; _hjDragId=null; _hjDragBlk=null;
    hjAgenda(d, id, hjHHMM(Math.max(0,Math.min(23*60+45,min)))); renderHoje(); return; }
  if(it&&_hjDragId){ e.preventDefault(); const alvo=it.getAttribute('data-hj-id'); const id=_hjDragId; _hjDragId=null; if(alvo===id) return;
    const dia=hjGaranteObj(d); const pos=dia.itens.findIndex(x=>x.id===alvo); hjMovePara(d, id, pos); renderHoje(); }
});
// Boot: a pílula do cronômetro nasce em qualquer tela (sobrevive ao F5) e anda a cada 30 s.
setTimeout(()=>{ try{ hjTimerPinta(); hjTimerAvisoEsquecido(); }catch(e){} },0);
setInterval(()=>{ try{ hjTimerPinta(); }catch(e){} },30000);
