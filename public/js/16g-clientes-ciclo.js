// Jira Insights · 16g · 🗓 CICLOS DE FATURAMENTO POR CLIENTE — o calendário de faturamento de cada cliente (pedido de 2026-11-02:
// "o cliente NTT fecha o ciclo no dia 25 e o chama pelo mês do fechamento — Jan26 = 26/12/2025 → 25/01/2026 —; quero cadastrar isso
// POR CLIENTE, separado do nosso ciclo, que é o mês civil").
// ===========================================================================
// Dois ciclos convivem e a tela sempre diz qual é qual:
//   • o NOSSO ciclo é o MÊS CIVIL (decisão do usuário) — o planner da 💹 Rentabilidade, as horas vendidas por mês e a tabela mensal;
//   • o ciclo do CLIENTE é o do cadastro daqui (cfg.clientes): fecha no dia N, tem a nota no dia M e cada ciclo é NOMEADO pelo mês em
//     que termina. Ele quebra a receita do plano nos PERÍODOS DE FATURAMENTO (a ordem de venda no Odoo, o 🧾 Próximas notas).
// Precedência na Rentabilidade (rpCiclosDe, 17b): cliente cadastrado › 🤝 contrato de parceria (fatFecha/ajustes) › mês civil.
// O MODELO é o mesmo do contrato de parceria — de propósito: o cliente guarda `fatFecha`, `fatDia`, `inicio` e `ajustes['AAAA-MM']`
// ({fecha, nota}), e por isso pcPeriodo/pcPeriodos/pcCiclosLista/pcCicloAjusta (16b) servem sem mudar uma linha. Os ciclos são
// CONTÍGUOS (o início de um é o dia seguinte ao fim do anterior); mudar o início de um ciclo grava o fim do anterior.
// Regras de config compartilhada (mescla de 3 vias): cfg.clientes é lista com `id` (mescla item a item); os LEITORES (clLista,
// clDe, clPlanosDe…) NUNCA criam `cfg.clientes` — só clGaranteLista(), chamada logo antes de um push — e quem muda algo faz o
// salvaCfg() (o lote de colar ciclos grava uma vez). Helpers de outros módulos só em tempo de render.
// ===========================================================================
const _clSt={ form:'', cal:'', imp:'' };   // estado da tela (só desta sessão): form = '' | 'novo' | id do cliente em edição · cal = id do cliente com o calendário aberto
const CL_CICLO_MAX_DIAS=190;               // um ciclo de faturamento maior que isso é erro de digitação (o normal é ~30 dias)
function clItemValido(c){ return !!c&&typeof c==='object'&&!Array.isArray(c)&&c.id!=null&&String(c.id)!==''; }
// ---- leitores (não criam nada) ----
function clLista(){ return Array.isArray(cfg.clientes)?cfg.clientes.filter(clItemValido):[]; }
function clDe(id){ return id?(clLista().find(c=>c.id===id)||null):null; }
function clPorNome(nome, exceto){ const n=ctNorm(String(nome||'').trim()); if(!n) return null; return clLista().find(c=>c.id!==exceto&&ctNorm(String(c.nome||'').trim())===n)||null; }
// só o setter cria a lista (logo antes de um push)
function clGaranteLista(){ if(!Array.isArray(cfg.clientes)) cfg.clientes=[]; return cfg.clientes; }
function clPodeEditar(){ return souAprovador(); }
const clFechaDia=(c)=>Math.max(1,Math.min(31,Math.round(Number(c&&c.fatFecha)||31)));
const clFechaRot=(c)=>{ const n=clFechaDia(c); return n>=31?'fecha no último dia do mês':`fecha dia ${n}`; };
const clNotaRot=(c)=>{ const n=Math.round(Number(c&&c.fatDia)||0); return n>0?`nota dia ${n}`:'nota no fechamento'; };
function clNAjustes(c){ const a=c&&c.ajustes; return (a&&typeof a==='object')?Object.keys(a).filter(k=>a[k]&&typeof a[k]==='object'&&(pcData(a[k].fecha)||pcData(a[k].nota))).length:0; }
// Onde o cliente está em uso: planos da 💹 Rentabilidade e contratos da 🏢 (vínculo `clienteId`). Sem criar objetos.
function clPlanosDe(id){ const r=cfg.rentab&&Array.isArray(cfg.rentab.planos)?cfg.rentab.planos:[]; return r.filter(p=>p&&typeof p==='object'&&p.clienteId===id); }
function clContratosDe(id){ return (Array.isArray(cfg.contratos)?cfg.contratos:[]).filter(c=>c&&typeof c==='object'&&c.clienteId===id); }
function clEmUso(id){ return { planos:clPlanosDe(id), contratos:clContratosDe(id) }; }
// Cópia só das datas válidas dos ajustes de ciclo (a migração do contrato → cliente e o inverso passam por aqui).
function clCopiaAjustes(aj){ const out={}; if(!aj||typeof aj!=='object') return out;
  Object.keys(aj).forEach(ym=>{ const a=aj[ym]; if(!/^\d{4}-\d{2}$/.test(ym)||!a||typeof a!=='object') return; const o={}; if(pcData(a.fecha)) o.fecha=a.fecha; if(pcData(a.nota)) o.nota=a.nota; if(Object.keys(o).length) out[ym]=o; });
  return out; }
// ---- setters (quem chama faz o salvaCfg) ----
function clNovo(nome, base){ const b=base||{}; const h=hojeSP(); const q=pcQuem();
  return { id:pcId('cl'), nome:String(nome||'').trim().slice(0,80), fatFecha:Math.max(1,Math.min(31,Math.round(Number(b.fatFecha)||31))), fatDia:Math.max(0,Math.min(31,Math.round(Number(b.fatDia)||0))),
    inicio:pcData(b.inicio)?b.inicio:'', ajustes:clCopiaAjustes(b.ajustes), obs:String(b.obs||'').slice(0,240), hist:[], criadoEm:h, criadoPor:q.nome, atualizadoEm:h, atualizadoPor:q.nome }; }
// Cadastra o cliente (ou devolve o que já tem esse nome — o mesmo cliente não nasce duas vezes). `null` se o nome vier vazio.
function clCria(nome, base){ const n=String(nome||'').trim(); if(!n) return null; const ja=clPorNome(n); if(ja) return ja;
  const c=clNovo(n,base); clGaranteLista().push(c); pcLog(c,'criou',`${clFechaRot(c)} · ${clNotaRot(c)}${c.inicio?' · 1º ciclo começa em '+dataBR(c.inicio):''}${clNAjustes(c)?' · '+clNAjustes(c)+' ciclo(s) ajustado(s)':''}`); return c; }

// ---- 📅 colar ciclos: uma linha por ciclo, "26/12/2025 → 25/01/2026" ----
function clDataIso(y, m, d){ y=+y; m=+m; d=+d; if(y<100) y+=2000; const t=new Date(Date.UTC(y,m-1,d)); if(!(y>=2000&&y<=2100)||t.getUTCFullYear()!==y||t.getUTCMonth()!==m-1||t.getUTCDate()!==d) return '';
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
// Lê o texto colado: acha as datas de cada linha (dd/mm/aaaa, dd/mm/aa ou AAAA-MM-DD) — o resto da linha (nome do ciclo, setas, tabs) é ignorado.
function clImpParse(texto){
  return String(texto||'').split(/\r?\n/).map((bruto,i)=>({ n:i+1, bruto:bruto.trim() })).filter(l=>l.bruto).map(l=>{
    const ds=[]; const re=/(\d{4})-(\d{2})-(\d{2})|(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})/g; let m; let ruim=false;
    while((m=re.exec(l.bruto))){ const d=m[1]?clDataIso(m[1],m[2],m[3]):clDataIso(m[6],m[5],m[4]); if(d) ds.push(d); else ruim=true; }
    if(ruim) return { ...l, erro:'tem uma data que não existe no calendário.' };
    if(ds.length!==2) return { ...l, erro:ds.length<2?'esperava duas datas (início e fim do ciclo).':'tem mais de duas datas — uma linha por ciclo.' };
    if(ds[1]<ds[0]) return { ...l, erro:'o fim vem antes do início.' };
    if(pcDias(ds[0],ds[1])+1>CL_CICLO_MAX_DIAS) return { ...l, erro:`ciclo de mais de ${CL_CICLO_MAX_DIAS} dias — confira as datas.` };
    return { ...l, ini:ds[0], fim:ds[1] }; }); }
// Aplica as linhas ao calendário do cliente: o ciclo leva o nome do mês em que TERMINA, e cada linha é gravada pelo pcCicloAjusta
// (a mesma regra de contiguidade da tela). Recusa, dizendo o motivo, a linha que cruza com a anterior da colagem, que deixaria
// buraco, que cai num mês de fechamento já usado ou que o calendário não aceita. NÃO grava a config: quem chama faz o salvaCfg().
function clImporta(c, texto){
  const linhas=clImpParse(texto); const res={ ok:[], recusadas:[] };
  linhas.filter(l=>l.erro).forEach(l=>res.recusadas.push({ n:l.n, bruto:l.bruto, motivo:l.erro }));
  const boas=linhas.filter(l=>!l.erro).sort((a,b)=>a.fim.localeCompare(b.fim)||a.n-b.n); const fila=[]; let ant=null;
  boas.forEach(l=>{ const recusa=(motivo)=>res.recusadas.push({ n:l.n, bruto:l.bruto, motivo }); const ym=l.fim.slice(0,7);
    if(ant){
      if(l.ini<=ant.fim) return recusa(`cruza com o ciclo ${labelMesAbbr(ant.ym)} (${dataBR(ant.ini)} → ${dataBR(ant.fim)}), que veio antes — os ciclos não se sobrepõem.`);
      if(ym<=ant.ym) return recusa(`${labelMesAbbr(ym)} já tem ciclo nesta colagem — cada ciclo leva o nome do mês em que termina.`);
      if(l.ini>pcMaisDias(ant.fim,1)) return recusa(`deixaria ${pcDias(ant.fim,l.ini)-1} dia(s) sem ciclo depois de ${labelMesAbbr(ant.ym)} (${dataBR(ant.fim)}) — os ciclos são contíguos; cole também o ciclo do meio.`);
    }
    ant={ ...l, ym }; fila.push({ ...l, ym }); });
  // aplica na ordem; o que o calendário recusa por causa do ciclo vizinho (ainda não ajustado) espera as próximas voltas
  let pend=fila.slice(); let progresso=true; const erros={};
  while(pend.length&&progresso){ progresso=false; const resto=[];
    pend.forEach(l=>{ const antes=JSON.stringify(c.ajustes||{}); let erro=pcCicloAjusta(c,l.ym,'fecha',l.fim);
      if(!erro){ const P=pcPeriodo(c,l.ym); if(P.ini!==l.ini) erro=pcCicloAjusta(c,l.ym,'ini',l.ini); }
      if(!erro){ const P=pcPeriodo(c,l.ym); if(P.ini!==l.ini||P.fim!==l.fim) erro='as datas não fecham com os ciclos vizinhos.'; }
      if(erro){ c.ajustes=JSON.parse(antes); erros[l.ym]=erro; resto.push(l); return; }
      progresso=true; res.ok.push({ n:l.n, ini:l.ini, fim:l.fim, ym:l.ym }); });
    pend=resto; }
  pend.forEach(l=>res.recusadas.push({ n:l.n, bruto:l.bruto, motivo:erros[l.ym]||'o calendário não aceitou estas datas.' }));
  res.ok.sort((a,b)=>a.fim.localeCompare(b.fim)); res.recusadas.sort((a,b)=>a.n-b.n); return res; }

// ---- tela: o bloco 🗓 na 📑 Contratos › 🏢 Clientes (inserido pelo renderAdmin, 16) ----
function clCalHTML(c, pode, hoje){
  const rows=pcCiclosLista(c,hoje).map(ym=>{ const P=pcPeriodo(c,ym); const atual=P.ini<=hoje&&hoje<=P.fim;
    const campo=(k,v,rot,tip)=>pode?`<input type="date" data-cl-aj="${escA(c.id)}|${P.ym}|${k}" value="${escA(v)}" aria-label="${escA(rot+' do ciclo '+labelMesAbbr(P.ym))}"${tip?` data-tip="${escA(tip)}"`:''}>`:dataBR(v);
    return `<tr class="${atual?'rm-destaque':''}" data-cl-ciclo="${escA(P.ym)}"><td><b>${esc(labelMesAbbr(P.ym))}</b>${P.ajustado?' <span class="muted small" data-tip="datas próprias neste ciclo">✎</span>':''}</td>
      <td>${campo('ini',P.ini,'Início','O 1º dia do ciclo — gravar aqui muda o fim do ciclo anterior (os ciclos são contíguos)')}</td>
      <td>${campo('fecha',P.fim,'Fim','O último dia do ciclo (o fechamento) — o ciclo seguinte começa no dia seguinte')}</td>
      <td>${campo('nota',P.nota,'Nota','')}</td>
      <td class="num">${pcDiasUteis(P.ini,P.fim)}</td><td class="num">${pcDias(P.ini,P.fim)+1}</td>
      <td>${pode&&P.ajustado?`<button class="btn rt-step" data-cl-aj-rm="${escA(c.id)}|${escA(P.ym)}" data-tip="Volta às datas padrão do cliente neste ciclo (${esc(clFechaRot(c))})">↺ padrão</button>`:''}</td></tr>`; }).join('');
  return `<div class="cl-cal"><div class="mp-h3">📅 Ciclos de ${esc(c.nome||'')} <span class="mp-dim">início · fim (fechamento) · dia da nota · dias úteis (feriados descontados) · dias corridos</span></div>
    <div class="scroll-x"><table class="mp-tab-mini cl-cal-tab"><thead><tr><th>Ciclo</th><th>Início</th><th>Fim</th><th>Nota</th><th class="num">Dias úteis</th><th class="num">Dias</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="muted small">Cada ciclo leva o <b>nome do mês em que termina</b> (Jan/26 fecha em janeiro de 2026). ${pode?`O padrão vem do cadastro (${esc(clFechaRot(c))}, ${esc(clNotaRot(c))}); digite o <b>início</b> ou o <b>fim</b> de um ciclo para ele ter as suas próprias datas. Os ciclos são <b>contíguos</b>: mudar o início de um muda o fim do anterior, e o seguinte começa no dia seguinte ao fim — datas que se cruzam são recusadas. ↺ padrão desfaz.`:'Somente gestores ajustam as datas.'}</div></div>`;
}
function clFormHTML(c, novo){
  const v=c||{}; const campo=(l,html,dica)=>`<div class="campo"><label>${l}</label>${html}${dica?`<div class="muted small">${dica}</div>`:''}</div>`;
  return `<div class="cl-form"><h3 class="mp-h3">${novo?'＋ Novo cliente':'✏️ '+esc(v.nome||'Cliente')}</h3>
    <div class="pl-grid">
      ${campo('Nome do cliente',`<input type="text" id="cl-f-nome" value="${escA(v.nome||'')}" placeholder="ex.: NTT" style="min-width:220px" maxlength="80">`)}
      ${campo('O ciclo fecha no dia',`<input type="number" id="cl-f-fecha" min="1" max="31" step="1" value="${escA(String(novo?25:clFechaDia(v)))}" style="width:90px">`,'1 a 31 — 31 = o último dia do mês (o mês civil)')}
      ${campo('A nota sai no dia',`<input type="number" id="cl-f-fatdia" min="0" max="31" step="1" value="${escA(String(Math.round(Number(v.fatDia)||0)))}" style="width:90px">`,'0 = no dia do fechamento')}
      ${campo('O 1º ciclo começa em',`<input type="date" id="cl-f-inicio" value="${escA(v.inicio||'')}">`,'opcional — ex.: 26/12/2025 para o ciclo que fecha em Jan/26')}
      ${campo('Observações',`<input type="text" id="cl-f-obs" value="${escA(v.obs||'')}" placeholder="opcional" maxlength="240">`)}
    </div>
    <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap"><button class="btn primario" data-cl-salvar="1">${novo?'Cadastrar cliente':'Salvar alterações'}</button><button class="btn" data-cl-cancelar="1">Cancelar</button></div>
    <div class="ap-fb" id="cl-f-fb" hidden></div></div>`;
}
function clCardHTML(c, pode, hoje){
  const uso=clEmUso(c.id); const nU=uso.planos.length+uso.contratos.length; const atual=pcPeriodo(c,pcYmDaData(c,hoje)); const aberto=_clSt.cal===c.id;
  const dl=(l,vv)=>`<div class="ams-dl"><div class="dt">${l}</div><div class="dd">${vv}</div></div>`;
  const ligados=nU?`${uso.planos.length?`💹 ${uso.planos.length} plano(s): ${uso.planos.slice(0,4).map(p=>`<span class="lnk" data-cl-plano="${escA(p.id)}" role="button" tabindex="0">${esc(p.nome||'(sem nome)')}</span>`).join(' · ')}${uso.planos.length>4?' …':''}`:''}${uso.planos.length&&uso.contratos.length?' · ':''}${uso.contratos.length?`🏢 ${uso.contratos.length} contrato(s): ${esc(uso.contratos.slice(0,4).map(x=>x.cliente||'').join(', '))}`:''}`
    :'<span class="muted">nenhum plano nem contrato ligado ainda — ligue no ✏️ Dados do projeto da 💹 Rentabilidade ou no cadastro do contrato.</span>';
  return `<div class="cl-card${aberto?' cl-aberto':''}" data-cl-card="${escA(c.id)}">
    <div class="cl-top"><strong>${esc(c.nome||'(sem nome)')}</strong> <span class="badge">${esc(clFechaRot(c))}</span><span class="spacer"></span>
      ${pode?`<button class="btn" data-cl-edit="${escA(c.id)}">✏️ editar</button>`:''}
      <button class="btn" data-cl-cal="${escA(c.id)}" aria-expanded="${aberto?'true':'false'}">📅 ${aberto?'fechar ciclos':'ciclos'}</button>
      ${pode?`<button class="btn" data-cl-imp="${escA(c.id)}" data-tip="Cole as datas dos ciclos (uma linha por ciclo, direto da planilha do cliente) e o painel confere se são contíguos">📋 colar ciclos</button><button class="btn" data-cl-del="${escA(c.id)}" data-tip="${escA(nU?'Ligado a '+nU+' plano(s)/contrato(s): desligue antes de excluir':'Excluir este cliente')}">🗑</button>`:''}</div>
    <div class="ams-dgrid">${dl('Fechamento',esc(clFechaRot(c)))}${dl('Nota',esc(clNotaRot(c)))}${dl('1º ciclo',c.inicio?dataBR(c.inicio):'—')}${dl('Ciclos ajustados',String(clNAjustes(c)))}
      ${dl('Ciclo de hoje',`${esc(labelMesAbbr(atual.ym))} <span class="muted small">${dataBR(atual.ini)} → ${dataBR(atual.fim)}</span>`)}</div>
    <div class="muted small" style="margin-top:6px">${ligados}</div>
    ${c.obs?`<div class="muted small">${esc(c.obs)}</div>`:''}
    ${aberto?clCalHTML(c,pode,hoje):''}</div>`;
}
function clBlocoHTML(pode){
  try{
    const lista=clLista(); const hoje=hojeSP();
    if(_clSt.form&&_clSt.form!=='novo'&&!clDe(_clSt.form)) _clSt.form=''; if(_clSt.cal&&!clDe(_clSt.cal)) _clSt.cal='';
    const emEdicao=_clSt.form&&_clSt.form!=='novo'?clDe(_clSt.form):null;
    return `<section class="card full cl-bloco" id="cl-bloco"><h2>🗓 Ciclos de faturamento por cliente <span>${lista.length} cliente(s)</span></h2>
      <div class="muted small">Cada cliente fecha o ciclo no seu dia — o <b>NTT</b>, por exemplo, fecha dia 25 e chama o ciclo pelo mês do fechamento: <b>Jan/26</b> = 26/12/2025 → 25/01/2026. Cadastre o calendário aqui uma vez e a 💹 Rentabilidade passa a quebrar a receita dos planos ligados a ele nesses períodos de faturamento. <b>O nosso ciclo é o mês civil</b> (planner, horas vendidas e tabela mensal). Na Rentabilidade vale primeiro o ciclo do <b>cliente</b>, depois o do 🤝 <b>contrato de parceria</b> e, sem nenhum dos dois, o mês civil.${pode?'':' <b>Somente gestores cadastram e ajustam</b> — você está vendo em modo leitura.'}</div>
      ${pode&&!_clSt.form?'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn primario" data-cl-novo="1">＋ Novo cliente</button></div>':''}
      ${pode&&_clSt.form==='novo'?clFormHTML(null,true):''}${pode&&emEdicao?clFormHTML(emEdicao,false):''}
      ${lista.length?`<div class="cl-grid" style="margin-top:12px">${lista.map(c=>{ try{ return clCardHTML(c,pode,hoje); }catch(e){ return `<div class="cl-card"><strong>${esc(c.nome||c.id)}</strong> <div class="aviso">⚠ Não consegui montar este cliente (${esc(String((e&&e.message)||e))}).</div></div>`; } }).join('')}</div>`
        :'<div class="estado" style="margin-top:12px">Nenhum cliente com ciclo próprio cadastrado ainda — enquanto não houver, a Rentabilidade usa o ciclo do 🤝 contrato de parceria ou o mês civil.</div>'}
    </section>`;
  }catch(e){ return `<section class="card full cl-bloco" id="cl-bloco"><h2>🗓 Ciclos de faturamento por cliente</h2><div class="aviso">⚠ Não consegui montar este bloco (${esc(String((e&&e.message)||e))}). Os contratos abaixo continuam funcionando.</div></section>`; }
}
// Redesenha só o bloco (o resto da tela — por exemplo, um contrato aberto no formulário — fica como está).
function clRender(){ if(estado.vista!=='admin') return; const w=document.getElementById('cl-bloco'); if(!w){ renderAdmin(); return; } w.replaceWith(el(clBlocoHTML(clPodeEditar()))); }

// ---- ações ----
function clFb(msg){ const fb=document.getElementById('cl-f-fb'); if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=msg; } }
function clSalvaForm(){
  if(!clPodeEditar()) return; const v=(id)=>{ const e=document.getElementById(id); return e?String(e.value).trim():''; };
  const novo=_clSt.form==='novo'; const c=novo?null:clDe(_clSt.form); if(!novo&&!c) return;
  const nome=v('cl-f-nome'); if(!nome) return clFb('Informe o nome do cliente.');
  if(clPorNome(nome,c&&c.id)) return clFb('Já existe um cliente com este nome — edite o que já está cadastrado.');
  const fecha=Math.round(Number(v('cl-f-fecha'))); if(!(fecha>=1&&fecha<=31)) return clFb('O dia de fechamento vai de 1 a 31 (31 = o último dia do mês).');
  const fatDia=v('cl-f-fatdia')===''?0:Math.round(Number(v('cl-f-fatdia'))); if(!(fatDia>=0&&fatDia<=31)) return clFb('O dia da nota vai de 0 a 31 (0 = no dia do fechamento).');
  const ini=v('cl-f-inicio'); if(ini&&!pcData(ini)) return clFb('Data de início inválida.');
  const obs=v('cl-f-obs');
  if(novo){ const n=clNovo(nome,{ fatFecha:fecha, fatDia, inicio:ini, obs }); clGaranteLista().push(n);
    pcLog(n,'criou',`${clFechaRot(n)} · ${clNotaRot(n)}${n.inicio?' · 1º ciclo começa em '+dataBR(n.inicio):''}`); toast(`Cliente ${n.nome} cadastrado — ${clFechaRot(n)}.`,'ok'); _clSt.cal=n.id; }
  else { const dif=[]; const mud=(rot,a,b)=>{ if(String(a)!==String(b)) dif.push(`${rot}: ${a||'—'} → ${b||'—'}`); };
    mud('nome',c.nome||'',nome); mud('fechamento (dia)',clFechaDia(c),fecha); mud('nota (dia)',Math.round(Number(c.fatDia)||0),fatDia); mud('1º ciclo',c.inicio||'',ini); mud('obs.',c.obs||'',obs);
    c.nome=nome.slice(0,80); c.fatFecha=fecha; c.fatDia=fatDia; c.inicio=ini; c.obs=obs.slice(0,240); pcLog(c,'editou',dif.length?dif.join('; '):'dados salvos sem mudança'); toast('Cliente atualizado.','ok'); }
  _clSt.form=''; salvaCfg(); clRender(); }
function clRemove(id){
  if(!clPodeEditar()) return; const c=clDe(id); if(!c) return; const uso=clEmUso(id);
  if(uso.planos.length||uso.contratos.length){
    toast(`Não dá para excluir ${c.nome}: ${uso.planos.length?`${uso.planos.length} plano(s) da Rentabilidade (${uso.planos.slice(0,3).map(p=>p.nome||'sem nome').join(', ')})`:''}${uso.planos.length&&uso.contratos.length?' e ':''}${uso.contratos.length?`${uso.contratos.length} contrato(s) da 🏢`:''} ainda usa(m) este ciclo. Desligue o vínculo antes.`,'warn'); return; }
  if(!confirm(`Excluir o cliente ${c.nome} e os ajustes dos seus ciclos (${clNAjustes(c)})?`)) return;
  cfg.clientes=clGaranteLista().filter(x=>x&&x.id!==id); if(_clSt.cal===id) _clSt.cal=''; if(_clSt.form===id) _clSt.form=''; salvaCfg(); toast(`Cliente ${c.nome} excluído.`,'ok'); clRender(); }
function clImpAbre(c){
  _clSt.imp=c.id;
  abreModal(`<div class="cl-imp-root"><h2>📋 Colar ciclos <span class="muted small">${esc(c.nome||'')}</span></h2>
    <div class="muted small">Uma linha por ciclo, com o <b>início</b> e o <b>fim</b>: <code>26/12/2025 → 25/01/2026</code> (vale também <code>2025-12-26 2026-01-25</code>, e dá para colar direto da planilha do cliente). O ciclo leva o nome do mês em que <b>termina</b> — Jan/26 é o que fecha em janeiro de 2026. Os ciclos são contíguos: a linha que se sobrepõe à anterior ou deixaria um buraco é <b>recusada</b>, e o motivo aparece aqui.</div>
    <textarea id="cl-imp-txt" rows="9" spellcheck="false" aria-label="Datas dos ciclos, uma linha por ciclo" placeholder="26/12/2025 → 25/01/2026&#10;26/01/2026 → 25/02/2026&#10;26/02/2026 → 25/03/2026" style="width:100%;box-sizing:border-box;margin-top:8px;font-family:var(--mono,monospace)"></textarea>
    <div id="cl-imp-res" class="cl-imp-res" aria-live="polite"></div>
    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn primario" data-cl-imp-go="${escA(c.id)}">Importar os ciclos</button><button class="btn" data-cl-imp-fechar="1">Fechar</button></div></div>`);
  setTimeout(()=>{ const i=document.getElementById('cl-imp-txt'); if(i) i.focus(); },30); }
function clImpVai(id){
  if(!clPodeEditar()) return; const c=clDe(id); const box=document.getElementById('cl-imp-res'); const txt=(document.getElementById('cl-imp-txt')||{}).value||''; if(!c||!box) return;
  if(!txt.trim()){ box.innerHTML='<div class="aviso">Cole pelo menos uma linha com as duas datas do ciclo.</div>'; return; }
  const r=clImporta(c,txt); const rot=(x)=>`${esc(labelMesAbbr(x.ym))} <span class="muted small">${dataBR(x.ini)} → ${dataBR(x.fim)}</span>`;
  if(r.ok.length){ pcLog(c,'ciclo',`colados ${r.ok.length} ciclo(s): ${labelMesAbbr(r.ok[0].ym)} ${dataBR(r.ok[0].ini)} → ${dataBR(r.ok[0].fim)}${r.ok.length>1?' … '+labelMesAbbr(r.ok[r.ok.length-1].ym):''}`); _clSt.cal=c.id; salvaCfg(); clRender(); }
  box.innerHTML=`${r.ok.length?`<div class="aviso ok">✓ <b>${r.ok.length}</b> ciclo(s) entraram no calendário de ${esc(c.nome||'')}: ${r.ok.map(rot).join(' · ')}</div>`:''}
    ${r.recusadas.length?`<div class="aviso">✗ <b>${r.recusadas.length}</b> linha(s) recusada(s):<ul class="cl-imp-rec">${r.recusadas.map(x=>`<li>linha ${x.n} — <code>${esc(x.bruto)}</code>: ${esc(x.motivo)}</li>`).join('')}</ul></div>`:''}`; }

// ---- listeners desta tela (delegados) ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='admin') return; const alvo=e.target.closest&&e.target.closest('[data-cl-plano]'); if(alvo){ const id=alvo.getAttribute('data-cl-plano'); if(id){ estado.rentab.sel=id; estado.rentab.novo=false; estado.rentab.edit=false; vaiPara('rentab'); } return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-cl-novo')){ if(!clPodeEditar()) return; _clSt.form='novo'; clRender(); const i=document.getElementById('cl-f-nome'); if(i) i.focus({preventScroll:false}); return; }
  if(t.hasAttribute('data-cl-edit')){ if(!clPodeEditar()) return; _clSt.form=t.getAttribute('data-cl-edit'); clRender(); const i=document.getElementById('cl-f-nome'); if(i) i.focus({preventScroll:false}); return; }
  if(t.hasAttribute('data-cl-cancelar')){ _clSt.form=''; clRender(); return; }
  if(t.hasAttribute('data-cl-salvar')){ clSalvaForm(); return; }
  if(t.hasAttribute('data-cl-cal')){ const id=t.getAttribute('data-cl-cal'); _clSt.cal=_clSt.cal===id?'':id; clRender(); return; }
  if(t.hasAttribute('data-cl-imp')){ const c=clDe(t.getAttribute('data-cl-imp')); if(c&&clPodeEditar()) clImpAbre(c); return; }
  if(t.hasAttribute('data-cl-del')){ clRemove(t.getAttribute('data-cl-del')); return; }
  if(t.hasAttribute('data-cl-aj-rm')){ if(!clPodeEditar()) return; const [id,ym]=t.getAttribute('data-cl-aj-rm').split('|'); const c=clDe(id); if(!c||!c.ajustes||!c.ajustes[ym]) return;
    delete c.ajustes[ym]; pcLog(c,'ciclo',`${labelMesAbbr(ym)}: datas de volta ao padrão`); salvaCfg(); clRender(); return; }
});
document.getElementById('conteudo').addEventListener('keydown',(e)=>{
  if(estado.vista!=='admin'||e.key!=='Enter') return; const t=e.target; if(!t||!t.id||t.id.indexOf('cl-f-')!==0) return; e.preventDefault(); clSalvaForm();
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='admin') return; const t=e.target; if(!t||!t.hasAttribute||!t.hasAttribute('data-cl-aj')) return; if(!clPodeEditar()) return;
  const [id,ym,campo]=t.getAttribute('data-cl-aj').split('|'); const c=clDe(id); if(!c||!/^(ini|fecha|nota)$/.test(campo)) return;
  const val=String(t.value||''); if(!pcData(val)){ clRender(); return; }
  const antes=JSON.stringify(c.ajustes||{}); const erro=pcCicloAjusta(c,ym,campo,val);
  if(erro){ toast(erro,'warn'); clRender(); return; }
  if(JSON.stringify(c.ajustes||{})===antes){ clRender(); return; }
  pcLog(c,'ciclo',`${labelMesAbbr(ym)}: ${campo==='ini'?`início → ${dataBR(val)} (fim de ${labelMesAbbr(pcYmSoma(ym,-1))} → ${dataBR(pcMaisDias(val,-1))})`:campo==='fecha'?'fim → '+dataBR(val):'nota → '+dataBR(val)}`);
  salvaCfg(); clRender();
});
document.getElementById('modal-body').addEventListener('click',(e)=>{
  const raiz=e.target.closest&&e.target.closest('.cl-imp-root'); if(!raiz) return; const t=e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-cl-imp-fechar')){ _clSt.imp=''; fechaModal(); return; }
  if(t.hasAttribute('data-cl-imp-go')){ clImpVai(t.getAttribute('data-cl-imp-go')); }
});
