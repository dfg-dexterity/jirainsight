// =====================================================================================================================
// 13b — 🧩 Hierarquia no ⏱ Apontar (2026-10-27, a pedido do usuário: "melhore a visualização dos tickets que possuem
// pai — inclusive quando possui mais de um nível fica difícil visualizar nessa tela —, e facilite a atribuição de um
// ticket a um épico ou história").
//
// Três peças, todas sobre o mesmo mapa de ancestrais que o /api/vencimentos devolve (`dados.pais`, até 4 níveis):
//  1. 🧭 o CAMINHO no cartão: uma linha por nível, recuada ("Épico › História › este"), cada chave abre a ficha 🔍;
//  2. 🧩 AGRUPAR POR ÉPICO/PAI (chip ao lado da Lista): dentro de cada projeto, um bloco por ticket-raiz, os filhos
//     recuados debaixo do pai; os soltos vão para "Sem épico/pai", com o vínculo em lote;
//  3. 🧩 o SELETOR DE PAI em cada cartão: só oferece o nível que o Jira aceita (tarefa/história → épico; sub-tarefa →
//     história ou tarefa do mesmo projeto), filtra em memória, aceita outra chave e grava com o token da pessoa.
// Regras: `aphCadeia` é a ÚNICA leitura da cadeia (cartão, grupo, seletor); nada aqui dispara leitura no render — os
// candidatos só são lidos quando a pessoa abre o seletor; o vínculo atualiza as cópias em memória (Apontar, 🕑
// recentes, Gestão) e o mapa de pais, para o caminho mudar na hora sem reler a lista.
// =====================================================================================================================

const APH_AGRUPA_LS='jirainsight_ap_agrupa_pai_v1';   // só conveniência deste navegador
const APH_CAND_TTL_MS=2*60*1000;
const _aphCand={};                                    // `P|nivel` → {ts, itens, truncado, semTipo} | {p: Promise}
let _aphFiltro={};                                    // chave do ticket → texto do filtro do seletor aberto
let _aphForca=false;                                  // depois de um vínculo, os candidatos são relidos sem o cache do servidor
const _aphFichas={};                                  // R156: K → ficha mínima lida do ?detalhe= | {pend:true} | {erro:true,ts}
let _aphFichaSujaAte=0;                               // R156: até quando a leitura da ficha vai com nocache=1 (depois de um vínculo)
let _aphFichasP=null;                                 // R156: leitura em voo de aphGaranteFichas
const _aphIdxC=new WeakMap();                         // R156: lista de tickets → {n, mapa}

function aphDados(){ const ap=estado.apontar; return (ap&&ap.porData&&ap.porData[chaveVenc()])||null; }
function aphAgrupaLigado(){
  const ap=estado.apontar;
  if(typeof ap.agrupaPai!=='boolean'){ let v=false; try{ v=localStorage.getItem(APH_AGRUPA_LS)==='1'; }catch(e){} ap.agrupaPai=v; }
  return ap.agrupaPai;
}
function aphAgrupaGrava(v){ estado.apontar.agrupaPai=!!v; try{ localStorage.setItem(APH_AGRUPA_LS, v?'1':'0'); }catch(e){} }

// Nível na hierarquia do Jira: -1 sub-tarefa · 0 tarefa/história · 1 épico · 2 iniciativa. O servidor manda `n`;
// dados antigos (cache de outra versão) caem no palpite pelo tipo.
function aphNivel(t){
  if(t && typeof t.n==='number') return t.n;
  if(t && t.sub) return -1;
  return /épico|epic/i.test((t&&t.t)||'')?1:0;
}
// R156 — FONTES. As cópias do que se sabe sobre os tickets vivem em vários lugares (a lista do Apontar, a da Gestão, a
// base da Início, as fichas dos 🕑 recentes, a ficha aberta no modal e as lidas por aphGaranteFichas). `aphFontes(extra)`
// as devolve numa ordem só — `extra` primeiro, depois a tela aberta — cada uma como {tickets:[…], pais:{…}}.
function aphFichaAtualFonte(){
  const d=(typeof gxFichaAtual==='function')?gxFichaAtual():null;
  return d?{tickets:[d], pais:d.pais||{}}:null;
}
function aphFontes(extra){
  const out=[]; const add=(f)=>{ if(f && typeof f==='object' && out.indexOf(f)<0) out.push(f); };
  const ap=estado.apontar||{}; const g=estado.gestao||{}; const ac=estado.acoes||{};
  add(extra);
  if(estado.vista==='gestao') add(g.dados); else if(estado.vista==='hoje'||estado.vista==='hojetime') add(ac.venc); else add(aphDados());
  add(aphDados());
  Object.values(ap.recDet||{}).forEach(f=>{ if(f) add({tickets:[f], pais:f.pais||{}}); });
  Object.values(ap.porData||{}).forEach(add);
  add(g.dados);
  add(ac.venc);
  add(aphFichaAtualFonte());
  Object.values(_aphFichas).forEach(f=>{ if(f && f.k) add({tickets:[f], pais:f.pais||{}}); });
  return out;
}
// Índice K → ticket de uma lista (reconstruído quando o tamanho muda).
function aphIdx(tickets){
  let c=_aphIdxC.get(tickets);
  if(!c || c.n!==tickets.length){ const mapa=new Map(); tickets.forEach(t=>{ if(t && t.k && !mapa.has(t.k)) mapa.set(t.k,t); }); c={n:tickets.length, mapa}; _aphIdxC.set(tickets,c); }
  return c.mapa;
}
function aphTicketDe(k, extra){
  if(!k) return null;
  for(const f of aphFontes(extra)){ if(f.tickets){ const x=aphIdx(f.tickets).get(k); if(x) return x; } }
  return null;
}
// Nó de um ancestral. Regra da revisão (2026-10-27): o TICKET manda no próprio `pai` — é a cópia que o vínculo atualiza na
// hora; o nó do mapa só completa resumo/tipo/ícone/nível. Senão, mover uma história que também é pai de uma sub-tarefa da
// lista deixava a sub-tarefa (e o agrupado) no épico antigo até reler a lista.
function aphNodo(k, extra){
  if(!k) return null;
  // A PRIMEIRA fonte que sabe do ticket OU do nó decide o `pai` (é a mais próxima da tela aberta); as seguintes só
  // completam resumo/tipo/ícone/nível. Assim uma cópia velha (a lista da Gestão de horas atrás) não passa por cima do mapa
  // fresco da tela aberta.
  let mp=null, tk=null, achou=false, pai='';
  for(const f of aphFontes(extra)){
    const x=f.tickets?aphIdx(f.tickets).get(k):null; const m=(f.pais&&f.pais[k])||null;
    if(!x && !m) continue;
    if(!achou){ achou=true; pai=x?(x.pai||''):(m.pai||''); }
    if(x && !tk) tk=x;
    if(m && !mp) mp=m;
    if(tk && mp) break;
  }
  if(!achou) return null;
  const m=mp||{};
  if(!tk) return Object.assign({k}, m, {pai});
  return {k, r:tk.resumo||m.r||'', t:tk.t||m.t||'', ic:tk.tIcon||m.ic||'', n:(typeof tk.n==='number')?tk.n:(typeof m.n==='number'?m.n:aphNivel(tk)),
    st:tk.status||m.st||'', pai};
}
// Grava/atualiza um nó nos mapas de pais (sem apagar o `pai` que já se sabia). Só cria `pais` na lista do Apontar.
function aphGuardaNodo(k, nodo){
  if(!k) return;
  const d=aphDados(); if(d) d.pais=d.pais||{};
  const velho=((d&&d.pais&&d.pais[k])||aphNodo(k)||{});   // parte do que já se sabe (mapa, ficha ou o ticket da lista)
  const novo=Object.assign({r:'', t:'', ic:'', n:null, st:'', pai:null}, velho); delete novo.k;
  Object.keys(nodo||{}).forEach(c=>{
    const v=nodo[c];
    if(v===null||v===undefined) return;                // vazio/desconhecido não apaga o que já se sabia
    if(c!=='pai' && v==='') return;
    novo[c]=v;
  });
  aphFontes().forEach(f=>{ if(f.pais && typeof f.pais==='object') f.pais[k]=Object.assign({}, novo); });
}
// A cadeia do ticket, da RAIZ até o pai imediato. Para no `pai` desconhecido (null), em ciclo ou no teto de 6.
function aphCadeia(t, extra){
  const out=[]; if(!t||!t.pai) return out;
  const vistos=new Set([t.k]); let k=t.pai;
  while(k && !vistos.has(k) && out.length<6){
    vistos.add(k);
    const n=aphNodo(k, extra);
    if(!n){ out.push({k, r:(out.length===0&&t.paiResumo)||'', t:'', ic:'', n:null, st:'', pai:null}); break; }
    out.push(n);
    k=n.pai||'';
  }
  return out.reverse();
}
function aphRotTipo(n){
  const tp=(n&&n.t)||'';
  if(tp) return tp;
  return n&&n.n===1?'Épico':n&&n.n===2?'Iniciativa':'Pai';
}
// 🧭 O caminho no cartão. `pula` = quantos níveis do topo não repetir (no agrupado, a raiz já é o cabeçalho do bloco).
function aphCadeiaHTML(t, pula, extra){
  const cad=aphCadeia(t, extra).slice(pula||0);
  if(!cad.length) return '';
  const linhas=cad.map((n,i)=>`<div class="aph-cad" style="--aph-i:${i}">
      ${i?'<span class="aph-ramo" aria-hidden="true">└</span>':''}
      ${n.ic?`<img class="ji-ic" src="${escA(n.ic)}" alt="" loading="lazy" onerror="this.remove()">`:''}
      <span class="aph-tipo">${esc(aphRotTipo(n))}</span>
      <button type="button" class="aph-k" data-aph-ver="${escA(n.k)}" data-tip="Ver a ficha de ${escA(n.k)}${n.st?` (${escA(n.st)})`:''}">${esc(n.k)}</button>
      <span class="aph-res" title="${escA(n.r||'')}">${esc(n.r||'')}</span></div>`).join('');
  return `<div class="aph-cadeia" aria-label="Caminho até este ticket: ${escA(cad.map(n=>n.k).join(' › '))} › ${escA(t.k)}">${linhas}
    <div class="aph-cad aph-este" style="--aph-i:${cad.length}"><span class="aph-ramo" aria-hidden="true">└</span><span class="aph-tipo">este ticket</span></div></div>`;
}
// Botão 🧩 do cartão: diz o que falta (sem épico) ou o que dá para trocar. Épico/iniciativa: sem botão (a troca de
// iniciativa é rara e o Jira só a tem no Premium).
function aphBotaoHTML(t){
  const n=aphNivel(t);
  if(n>=1) return '';
  if(n===-1) return `<button class="badge st-btn" data-aph-pai="${escA(t.k)}" data-tip="Sub-tarefa: trocar a história ou tarefa a que ela pertence (no mesmo projeto)">🧩 trocar o pai ▾</button>`;
  return t.pai
    ? `<button class="badge st-btn" data-aph-pai="${escA(t.k)}" data-tip="Trocar o épico deste ticket">🧩 trocar o épico ▾</button>`
    : `<button class="badge st-btn sem-venc" data-aph-pai="${escA(t.k)}" data-tip="Este ticket não está em nenhum épico — clique para escolher">🧩 sem épico · vincular ▾</button>`;
}

// R156 — linha COMPACTA do caminho (Gestão: Tabela e Quadro; 📆 Hoje): `🧩 ACME-1 › ACME-10 › ACME-20  resumo do pai` e, no
// fim, a ação que abre a ficha já com o seletor (`data-aph-pai-ficha`). '' quando não há o que dizer. `extra` = fontes
// extras (aphFontes); `opts.semAcao` = só o caminho (Quadro, ou sem identidade).
function aphLinhaHTML(t, extra, opts){
  const o=opts||{}; if(!t||!t.k) return '';
  const cad=aphCadeia(t, extra);
  const nivel=aphNivel(t);
  const acao=!o.semAcao && nivel<1;
  if(!cad.length && !(acao && nivel===0)) return '';
  const nos=cad.map(n=>`<button type="button" class="aph-k" data-aph-ver="${escA(n.k)}" title="Ver a ficha de ${escA(n.k)}${n.r?' — '+escA(n.r):''}">${esc(n.k)}</button>`).join('<span class="aph-sep">›</span>');
  const pai=cad.length?cad[cad.length-1]:null;
  let fim='';
  if(acao){
    fim=cad.length
      ? `<button type="button" class="aph-troca" data-aph-pai-ficha="${escA(t.k)}" title="Trocar o épico/pai">🧩 trocar</button>`
      : `<button type="button" class="aph-troca aph-sem" data-aph-pai-ficha="${escA(t.k)}" title="Este ticket não está em nenhum épico — clique para escolher">🧩 sem épico · vincular</button>`;
  }
  return `<div class="aph-linha" aria-label="Caminho: ${escA(cad.map(n=>n.k).concat([t.k]).join(' › '))}">${cad.length?'<span aria-hidden="true">🧩</span>':''}${nos}${pai&&pai.r?`<span class="aph-res" title="${escA(pai.r)}">${esc(pai.r)}</span>`:''}${fim}</div>`;
}

// ---- 🧩 Agrupar por épico/pai ----
// Dentro de UM projeto: bloco por raiz (o ancestral mais alto; ou o próprio ticket, se ele é pai de outros da lista).
// Os filhos aparecem logo depois do pai que está na lista, recuados; entre irmãos vale a ordem da lista (vencimento).
function aphGruposDe(grupo){
  const naLista=new Map(grupo.map(t=>[t.k,t]));
  const cad=new Map(grupo.map(t=>[t.k, aphCadeia(t)]));
  const ehPaiDeAlguem=new Set();
  grupo.forEach(t=>cad.get(t.k).forEach(n=>ehPaiDeAlguem.add(n.k)));
  const raizDe=(t)=>{ const c=cad.get(t.k); return c.length?c[0].k:(ehPaiDeAlguem.has(t.k)?t.k:''); };
  // pai mais próximo QUE ESTÁ NA LISTA (para a árvore); quem não tem fica no topo do bloco
  const paiNaLista=(t)=>{ const c=cad.get(t.k); for(let i=c.length-1;i>=0;i--){ if(naLista.has(c[i].k)) return c[i].k; } return ''; };
  const blocos=new Map();
  grupo.forEach(t=>{ const r=raizDe(t); if(!blocos.has(r)) blocos.set(r,[]); blocos.get(r).push(t); });
  const out=[];
  blocos.forEach((itens, raiz)=>{
    const filhos=new Map(); const topo=[];
    itens.forEach(t=>{ const p=paiNaLista(t); if(p&&p!==t.k&&itens.some(x=>x.k===p)){ if(!filhos.has(p)) filhos.set(p,[]); filhos.get(p).push(t); } else topo.push(t); });
    const ordem=[]; const vis=new Set();
    const anda=(t,prof)=>{ if(vis.has(t.k)) return; vis.add(t.k); ordem.push({t,prof}); (filhos.get(t.k)||[]).forEach(f=>anda(f,prof+1)); };
    // a raiz que está na lista vem primeiro
    topo.sort((a,b)=>(a.k===raiz?-1:b.k===raiz?1:0)).forEach(t=>anda(t,0));
    itens.forEach(t=>{ if(!vis.has(t.k)) anda(t,0); });
    out.push({raiz, itens:ordem});
  });
  // blocos com raiz na ordem em que aparecem; os soltos no fim
  out.sort((a,b)=>(a.raiz===''?1:0)-(b.raiz===''?1:0));
  return out;
}
function aphGrupoHTML(grupo, linhaTicket, pk){
  const id=idApontar();
  return aphGruposDe(grupo).map(b=>{
    const seg=b.itens.reduce((s,x)=>s+(x.t.seg||0),0);
    let cab;
    if(b.raiz){
      const n=aphNodo(b.raiz)||{k:b.raiz,r:'',t:'',ic:''};
      cab=`<div class="aph-grp-h">
        ${n.ic?`<img class="ji-ic" src="${escA(n.ic)}" alt="" loading="lazy" onerror="this.remove()">`:'<span aria-hidden="true">🧩</span>'}
        <span class="aph-tipo">${esc(aphRotTipo(n))}</span>
        <button type="button" class="aph-k" data-aph-ver="${escA(b.raiz)}" data-tip="Ver a ficha de ${escA(b.raiz)}">${esc(b.raiz)}</button>
        <span class="aph-res" title="${escA(n.r||'')}">${esc(n.r||'')}</span>
        <span class="spacer"></span><span class="aph-cont">${b.itens.length} chamado(s)${seg?` · ${fmtH(seg)}`:''}</span></div>`;
    } else {
      const soltos=b.itens.map(x=>x.t).filter(t=>aphNivel(t)===0&&!t.pai);
      cab=`<div class="aph-grp-h aph-sem">
        <span aria-hidden="true">🧩</span><span class="aph-tipo">Sem épico/pai</span>
        <span class="spacer"></span><span class="aph-cont">${b.itens.length} chamado(s)</span>
        ${id&&soltos.length?`<button class="chip" data-aph-lote="${escA(pk)}" data-aph-lote-ks="${escA(soltos.map(t=>t.k).join(','))}" data-tip="Escolher um épico para vários destes tickets de uma vez">🧩 vincular ${soltos.length} a um épico…</button>`:''}</div>`;
    }
    const corpo=b.itens.map(x=>`<div class="aph-niv" style="--aph-p:${Math.min(x.prof,3)}">${linhaTicket(x.t, '', b.raiz&&x.t.k!==b.raiz?1:0)}</div>`).join('');
    return `<div class="aph-grp${b.raiz?'':' aph-grp-sem'}">${cab}${corpo}</div>`;
  }).join('');
}

// ---- 🧩 Seletor de pai (painel no cartão) ----
function aphNivelPai(t){ const n=aphNivel(t); return n===-1?0:n+1; }
function aphCandidatos(p, nivel, forca){
  if(_aphForca){ forca=true; _aphForca=false; }
  const ck=p+'|'+nivel; const c=_aphCand[ck];
  if(c && c.p) return c.p;
  if(c && c.itens && !forca && Date.now()-c.ts<APH_CAND_TTL_MS) return Promise.resolve(c);
  const pr=fetch(`/api/projetos?pais=${encodeURIComponent(p)}&nivel=${nivel}${forca?'&nocache=1':''}`).then(r=>r.json()).then(j=>{
    if(!j || j.erro || !Array.isArray(j.itens)) throw new Error((j&&j.erro)||'resposta inválida');
    const v={ts:Date.now(), itens:j.itens, truncado:!!j.truncado, semTipo:!!j.semTipo};
    _aphCand[ck]=v; return v;
  }).catch(e=>{ delete _aphCand[ck]; throw e; });
  _aphCand[ck]={p:pr};
  return pr;
}
function aphPainelTexto(t){
  const n=aphNivel(t);
  return n===-1
    ? 'Sub-tarefa fica sob uma <b>história ou tarefa do mesmo projeto</b>.'
    : 'Tarefa e história ficam sob um <b>épico</b> — é o épico que agrupa o trabalho no Jira.';
}
// R156 — o hospedeiro do painel: o cartão do Apontar/Gestão (`.ap-row`) ou o bloco da ficha (`[data-aph-host]`).
function aphHostDe(elm){ return elm&&elm.closest?elm.closest('[data-aph-host], .ap-row'):null; }
// Dentro da ficha aberta no modal, o ticket que o painel manda é o da ficha (ela pode ter saído de qualquer lista).
function aphExtraDe(elm){
  if(!elm||!elm.closest||!elm.closest('#modal-body')) return null;
  return aphFichaAtualFonte();
}
function aphTogglePainel(btn){
  const host=aphHostDe(btn); if(!host) return;
  const k=btn.getAttribute('data-aph-pai');
  const emModal=!!btn.closest('#modal-body');
  const id=idApontar();
  if(!id){
    if(emModal){ const dt=(typeof _gxDet!=='undefined'&&_gxDet&&_gxDet.k===k)?{volta:_gxDet.volta, pilha:(_gxDet.pilha||[]).slice()}:{volta:null, pilha:[]};   // a identidade não pode perder o "↩ Voltar"
      abreIdentidade('trocar o épico/pai do ticket', {depois:()=>abreModalTicket(k, dt.volta, {seletor:true, pilha:dt.pilha})}); }
    else abreIdentidade('trocar o épico/pai do ticket');
    return;
  }
  const aberto=host.querySelector('.aph-painel'); if(aberto){ aberto.remove(); return; }
  const t=aphTicketDe(k, aphExtraDe(btn)); if(!t) return;
  const nivel=aphNivelPai(t);
  const idCh='aph-ch-'+k+(emModal?'-m':'');   // o mesmo ticket no cartão e na ficha ao mesmo tempo: ids distintos
  const area=document.createElement('div'); area.className='ap-trans aph-painel'; area.dataset.k=k;
  area.innerHTML=`<div class="aph-p-top"><span class="ap-trans-rot">${nivel===0?'História/tarefa':'Épico'} de ${esc(k)}</span>
      <span class="muted small">${aphPainelTexto(t)}</span></div>
    <input type="search" class="aph-filtro" placeholder="filtrar por nome ou chave…" aria-label="Filtrar ${nivel===0?'histórias e tarefas':'épicos'}" value="${escA(_aphFiltro[k]||'')}">
    <div class="aph-lista" role="list"><div class="muted small">Carregando ${nivel===0?'histórias e tarefas':'épicos'} abertos de ${esc(projNome(t.p))}…</div></div>
    <div class="aph-p-outra"><label class="muted small" for="${escA(idCh)}">Outra chave${nivel===1?' (épico de outro projeto)':''}:</label>
      <input type="text" class="aph-chave" id="${escA(idCh)}" placeholder="${escA(t.p)}-123" autocomplete="off" spellcheck="false">
      <button class="chip primario-chip" data-aph-chave-do="${escA(k)}">Usar →</button>
      ${nivel===1&&!host.hasAttribute('data-aph-sem-lote')?`<button class="chip" data-aph-lote="${escA(t.p)}" data-tip="Escolher um épico para vários tickets soltos deste projeto de uma vez">🧩 vários soltos de uma vez…</button>`:''}</div>
    <div class="ap-fb" hidden></div>`;
  const ancora=host.querySelector('[data-aph-ancora]')||host.querySelector('.ap-l2'); if(!ancora) return;
  ancora.after(area);
  aphCandidatos(t.p, nivel).then(()=>aphPintaLista(area)).catch(e=>{
    const l=area.querySelector('.aph-lista');
    if(l) l.innerHTML=`<div class="ap-fb err">Não consegui ler os candidatos: ${esc(e.message||e)} <button class="chip" data-aph-recarrega="${escA(k)}">↻ tentar de novo</button></div>`;
  });
  const f=area.querySelector('.aph-filtro'); if(f && !matchMedia('(pointer:coarse)').matches) f.focus();
}
function aphPintaLista(area){
  if(!area || !area.isConnected) return;
  const k=area.dataset.k; const t=aphTicketDe(k, aphExtraDe(area)); if(!t) return;
  const nivel=aphNivelPai(t);
  const c=_aphCand[t.p+'|'+nivel]; const l=area.querySelector('.aph-lista');
  if(!c || !c.itens || !l) return;
  const q=String(_aphFiltro[k]||'').trim().toLowerCase();
  const sa=(s)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
  const qa=sa(q);
  let itens=c.itens.filter(x=>x.k!==k);
  if(qa) itens=itens.filter(x=>sa(x.k+' '+x.r+' '+(x.pai?x.pai.k+' '+x.pai.r:'')).includes(qa));
  // o pai atual primeiro (marcado), depois a ordem do servidor (mais recentes)
  itens.sort((a,b)=>(a.k===t.pai?-1:b.k===t.pai?1:0));
  const MAX=40; const mostra=itens.slice(0,MAX);
  if(c.semTipo){ l.innerHTML=`<div class="muted small">O projeto ${esc(t.p)} não tem ${nivel===0?'histórias/tarefas':'tipo épico'} — use outra chave abaixo.</div>`; return; }
  if(!mostra.length){ l.innerHTML=`<div class="muted small">${q?'Nada com esse filtro.':`Nenhum ${nivel===0?'ticket aberto':'épico aberto'} em ${esc(projNome(t.p))}.`} Use outra chave abaixo${nivel===1&&!q?' ou crie o épico no 📝 Criar ticket':''}.</div>`; return; }
  l.innerHTML=mostra.map(x=>{
    const atual=x.k===t.pai;
    return `<button type="button" role="listitem" class="aph-cand${atual?' atual':''}" data-aph-esc="${escA(x.k)}" ${atual?'aria-current="true" disabled':''}>
      ${x.ic?`<img class="ji-ic" src="${escA(x.ic)}" alt="" loading="lazy" onerror="this.remove()">`:''}
      <b>${esc(x.k)}</b> <span class="aph-res">${esc(x.r||'')}</span>
      ${x.pai?`<span class="aph-cand-pai" title="${escA(x.pai.k+' '+(x.pai.r||''))}">em ${esc(x.pai.k)}</span>`:''}
      <span class="aph-cand-st">${atual?'✓ atual':esc(x.st||'')}</span></button>`;
  }).join('') + ((itens.length>MAX||c.truncado)?`<div class="muted small">Mostrando ${mostra.length} de ${itens.length}${c.truncado?'+':''} — filtre ou digite a chave.</div>`:'');
}
// Grava o novo pai no Jira (token da pessoa) e atualiza as cópias em memória. `info` = nó do pai {r,t,ic,n,st,pai?}.
async function aphAplica(k, paiKey, info, area){
  const id=idApontar(); if(!id){ abreIdentidade('trocar o épico/pai do ticket'); return; }
  const fb=area&&area.querySelector('.ap-fb');
  const diz=(cls,txt)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb'+(cls?' '+cls:''); fb.textContent=txt; } };
  if(paiKey===k){ diz('err','Um ticket não pode ser pai de si mesmo.'); return; }
  const trava=(v)=>{ if(area) [...area.querySelectorAll('button,input')].forEach(b=>{ if(!b.classList.contains('atual')) b.disabled=v; }); };
  trava(true); diz('', `Colocando ${k} sob ${paiKey}…`);
  try{
    const j=await fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({epico:true, issues:[k], paiKey, email:id.email, token:id.token})}).then(r=>r.json());
    if(!j || !j.ajustados){
      const f=(j&&j.falhas&&j.falhas[0])||null;
      diz('err', (f&&f.erro)||(j&&j.erro)||'Falha ao gravar o pai.'); trava(false); return;
    }
    aphDepoisDeVincular([k], paiKey, info);
    logAcao({acao:'epico', t:k, para:paiKey, ok:true}, false);
    salvaCfg();
    toast(`✓ ${k} agora está sob ${paiKey}${info&&info.r?` — ${info.r}`:''}.`,'ok');
    aphRedesenha();
  }catch(e){ diz('err','Erro de rede: '+(e.message||e)); trava(false); }
}
function aphFichaSuja(){ return Date.now()<_aphFichaSujaAte; }
// Depois do vínculo (um ticket ou o lote): `pai` nas cópias do ticket de TODAS as fontes + o nó do pai (e o pai DELE, se
// veio) no mapa. R156: as fontes vêm de aphFontes (Apontar, Gestão, Início, recentes, ficha aberta e fichas lidas).
// R156 — registro curto dos vínculos feitos (4 min): uma leitura que já estava em voo, ou o índice do Jira atrasado, devolve
// o pai ANTIGO; toda lista/ficha que chega passa por aphReaplica e volta a ter o pai novo.
let _aphVinculos=[];
function aphReaplica(p){
  if(!p || typeof p!=='object') return p;
  const agora=Date.now(); _aphVinculos=_aphVinculos.filter(v=>agora-v.ts<4*60*1000);
  _aphVinculos.forEach(v=>{
    const set=new Set(v.ks); const res=v.res||'';
    const lista=Array.isArray(p.tickets)?p.tickets:(p.k?[p]:[]);
    let tocou=false;
    lista.forEach(t=>{ if(t && set.has(t.k)){ t.pai=v.paiKey; if('paiResumo' in t) t.paiResumo=res; tocou=true; } });
    if(p.pais && typeof p.pais==='object'){
      v.ks.forEach(k=>{ if(p.pais[k]){ p.pais[k].pai=v.paiKey; tocou=true; } });
      if(tocou) Object.keys(v.nodos||{}).forEach(c=>{ if(!p.pais[c]) p.pais[c]=Object.assign({}, v.nodos[c]); else if(c===v.paiKey && v.nodos[c].pai) p.pais[c].pai=v.nodos[c].pai; });
    }
  });
  return p;
}
function aphDepoisDeVincular(ks, paiKey, info){
  const set=new Set(ks);
  {
    const avo=info&&info.pai&&info.pai.k?info.pai:null; const nodos={};
    if(info){ nodos[paiKey]={r:info.r||info.resumo||'', t:info.t||info.tipo||'', ic:info.ic||'', n:typeof info.n==='number'?info.n:0, st:info.st||info.status||'', pai:avo?avo.k:''};
      if(avo) nodos[avo.k]={r:avo.r||'', t:avo.t||'', ic:avo.ic||'', n:typeof avo.n==='number'?avo.n:1, st:avo.st||'', pai:''}; }
    _aphVinculos.push({ks:ks.slice(), paiKey, res:(info&&(info.r||info.resumo))||'', nodos, ts:Date.now()});
  }
  const resumoPai=(info&&(info.r||info.resumo))||'';
  aphFontes().forEach(f=>{
    (f.tickets||[]).forEach(t=>{ if(t && set.has(t.k)){ t.pai=paiKey; if('paiResumo' in t) t.paiResumo=resumoPai; } });
    // o ticket movido também pode ser NÓ de algum mapa (é pai de outro da lista ou de um 🕑 recente): o pai dele muda lá também
    if(f.pais && typeof f.pais==='object') ks.forEach(k=>{ if(f.pais[k]) f.pais[k].pai=paiKey; });
  });
  // candidatos guardados trazem o pai de cada um (o movido pode estar entre eles) → relê; e a próxima leitura da lista vai
  // sem o cache do servidor (cada função da Vercel tem o seu: o /api/transicao não limpa o do /api/vencimentos)
  Object.keys(_aphCand).forEach(c=>{ delete _aphCand[c]; });
  _aphForca=true;
  ['apontar','gestao','acoes'].forEach(c=>{ if(estado[c]) estado[c].paiSujo=true; });
  _aphFichaSujaAte=Date.now()+4*60*1000;
  if(info){
    const avo=info.pai&&info.pai.k?info.pai:null;
    aphGuardaNodo(paiKey, {r:info.r||info.resumo||'', t:info.t||info.tipo||'', ic:info.ic||'', n:typeof info.n==='number'?info.n:null, st:info.st||info.status||'',
      pai: avo?avo.k:(info.pai===null&&info.pai!==undefined?'':(typeof info.epico==='string'?info.epico:null))});
    if(avo) aphGuardaNodo(avo.k, {r:avo.r||'', t:avo.t||'', ic:avo.ic||'', n:typeof avo.n==='number'?avo.n:null, st:avo.st||'', pai:null});
  } else aphGuardaNodo(paiKey, {pai:null});
}
async function aphUsaChave(btn){
  const area=btn.closest('.aph-painel'); if(!area) return;
  const k=btn.getAttribute('data-aph-chave-do');
  const inp=area.querySelector('.aph-chave'); const alvo=String((inp&&inp.value)||'').trim().toUpperCase();
  const fb=area.querySelector('.ap-fb');
  const diz=(cls,txt)=>{ fb.hidden=false; fb.className='ap-fb'+(cls?' '+cls:''); fb.textContent=txt; };
  if(!/^[A-Z][A-Z0-9_]*-\d+$/.test(alvo)){ diz('err','Digite a chave do ticket pai (ex.: ACME-12).'); if(inp) inp.focus(); return; }
  if(alvo===k){ diz('err','Um ticket não pode ser pai de si mesmo.'); return; }
  btn.disabled=true; diz('',`Conferindo ${alvo}…`);
  let info=null;
  try{
    const j=await fetch(`/api/vencimentos?chaves=${encodeURIComponent(alvo)}`).then(r=>r.json());
    if(j && (j.naoEncontrados||[]).includes(alvo)){ diz('err',`${alvo} não existe (ou a conta do painel não o enxerga).`); btn.disabled=false; return; }
    const tk=j&&j.tickets&&j.tickets[alvo];
    if(tk) info={r:tk.resumo, t:tk.tipo, st:tk.status};
  }catch(e){ /* a conferência é só para o nome; o Jira confere de verdade ao gravar */ }
  btn.disabled=false;
  aphAplica(k, alvo, info, area);
}
// R156 — a lista da tela aberta (tickets inteiros + as chaves à vista) para o lote.
function aphListaTela(){
  if(estado.vista==='gestao'){
    const g=estado.gestao||{};
    return {tickets:((g.dados||{}).tickets)||[], visiveis:(typeof gxLista==='function'?gxLista():[]).map(t=>t.k)};
  }
  return {tickets:((aphDados()||{}).tickets)||[], visiveis:(estado.apontar.listaVisivel||[]).slice()};
}
function aphAbreLote(btn){
  const p=btn.getAttribute('data-aph-lote');
  let ks=String(btn.getAttribute('data-aph-lote-ks')||'').split(',').filter(Boolean);
  // sem lista no botão (o do seletor do cartão): os tickets À VISTA na tela — filtros e "Só os meus" valem aqui também
  if(!ks.length) ks=aphListaTela().visiveis;
  const so=new Set(ks);
  abreModalEpicos({
    lista:()=>aphListaTela().tickets.filter(t=>t.p===p && so.has(t.k)),
    depois:(oks, paiKey, ep)=>{ aphDepoisDeVincular(oks, paiKey, ep?{r:ep.resumo, t:ep.tipo, st:ep.status, n:1}:null);
      aphRedesenha(); },
  });
}
// R156 — redesenha o que a tela aberta mostra (e o bloco da ficha, se aberta) depois de um vínculo.
function aphRedesenha(){
  if(typeof gxFichaHierPinta==='function') gxFichaHierPinta();
  if(estado.vista==='apontar') renderApontar();
  else if(estado.vista==='gestao') renderGestao();
  else if(typeof hjVistaAberta==='function' && hjVistaAberta()) renderHoje();
}

// R156 — ficha mínima dos tickets que nenhuma fonte conhece (o 📆 Hoje lê só o `?dia=1`, que não traz o pai). Até 24 por
// voo, 4 leituras de cada vez, cada chave no máximo UMA vez por sessão (erro não insiste). true = alguma ficha chegou.
function aphGaranteFichas(ks){
  if(_aphFichasP) return _aphFichasP;
  const vistos=new Set(); const falt=[];   // ficha com erro de leitura: tenta de novo depois de ~60 s
  (ks||[]).forEach(k=>{ if(!k||vistos.has(k)) return; vistos.add(k); if(aphTicketDe(k)) return; const f=_aphFichas[k]; if(f && !(f.erro && Date.now()-(f.ts||0)>60000)) return; falt.push(k); });
  if(!falt.length) return Promise.resolve(false);
  const lote=falt.slice(0,24);
  lote.forEach(k=>{ _aphFichas[k]={pend:true}; });
  _aphFichasP=(async()=>{
    let mudou=false;
    for(let i=0;i<lote.length;i+=4){
      await Promise.all(lote.slice(i,i+4).map(async k=>{
        try{
          const r=await fetch(`/api/vencimentos?detalhe=${encodeURIComponent(k)}${aphFichaSuja()?'&nocache=1':''}`);
          const j=await r.json();
          if(!j || j.erro || !j.k) throw new Error((j&&j.erro)||'ficha inválida');
          _aphFichas[k]={k:j.k, resumo:j.resumo||'', p:j.p||'', t:j.t||'', tIcon:j.tIcon||'', status:j.status||'', n:(typeof j.n==='number')?j.n:undefined,
            sub:!!j.sub, pai:j.pai||'', paiResumo:j.paiResumo||'', pais:j.pais||{}};
          aphReaplica(_aphFichas[k]);
          mudou=true;
        }catch(e){ _aphFichas[k]={erro:true, ts:Date.now()}; }
      }));
    }
    return mudou;
  })().finally(()=>{ _aphFichasP=null; });
  return _aphFichasP;
}

// ---- Listeners delegados (R156: no document — valem na tela (#conteudo) e na ficha (#modal-body)) ----
function aphAlvoValido(e){ const a=e.target; return !!(a && a.closest && a.closest('#conteudo, #modal-body')); }
document.addEventListener('click',(e)=>{
  if(!aphAlvoValido(e)) return;
  const b=e.target.closest('button'); if(!b) return;
  const emModal=!!b.closest('#modal-body');
  if(b.hasAttribute('data-aph-pai')){ escondeTip(); aphTogglePainel(b); }
  else if(b.hasAttribute('data-aph-ver')){ escondeTip(); const k=b.getAttribute('data-aph-ver');
    if(emModal && typeof gxFichaVai==='function') gxFichaVai(k); else abreModalTicket(k); }
  else if(b.hasAttribute('data-aph-pai-ficha')){ escondeTip(); abreModalTicket(b.getAttribute('data-aph-pai-ficha'), null, {seletor:true}); }
  else if(b.hasAttribute('data-aph-esc')){ const area=b.closest('.aph-painel'); if(!area) return;
    const k=area.dataset.k; const t=aphTicketDe(k, aphExtraDe(area)); if(!t) return;
    const c=_aphCand[t.p+'|'+aphNivelPai(t)]; const x=c&&c.itens&&c.itens.find(i=>i.k===b.getAttribute('data-aph-esc'));
    aphAplica(k, b.getAttribute('data-aph-esc'), x?{r:x.r, t:x.t, ic:x.ic, st:x.st, n:aphNivelPai(t), pai:x.pai||null}:null, area); }
  else if(b.hasAttribute('data-aph-chave-do')){ aphUsaChave(b); }
  else if(b.hasAttribute('data-aph-lote')){ escondeTip(); aphAbreLote(b); }
  else if(b.hasAttribute('data-aph-agrupa')){ if(estado.vista!=='apontar') return; escondeTip(); aphAgrupaGrava(!aphAgrupaLigado()); renderApontar(); }
  else if(b.hasAttribute('data-aph-recarrega')){ const area=b.closest('.aph-painel'); const k=b.getAttribute('data-aph-recarrega');
    const t=aphTicketDe(k, aphExtraDe(b)); if(!area||!t) return; const l=area.querySelector('.aph-lista'); if(l) l.innerHTML='<div class="muted small">Carregando…</div>';
    aphCandidatos(t.p, aphNivelPai(t), true).then(()=>aphPintaLista(area)).catch(err=>{ if(l) l.innerHTML=`<div class="ap-fb err">Não consegui ler os candidatos: ${esc(err.message||err)}</div>`; }); }
});
document.addEventListener('input',(e)=>{
  if(!aphAlvoValido(e)) return;
  const f=e.target; if(!f||!f.classList||!f.classList.contains('aph-filtro')) return;
  const area=f.closest('.aph-painel'); if(!area) return;
  _aphFiltro[area.dataset.k]=f.value; aphPintaLista(area);
});
document.addEventListener('keydown',(e)=>{
  if(!aphAlvoValido(e)) return;
  const f=e.target; if(e.key!=='Enter'||!f||!f.classList) return;
  const area=f.closest&&f.closest('.aph-painel'); if(!area) return;
  if(f.classList.contains('aph-chave')){ e.preventDefault(); e.stopPropagation(); const b=area.querySelector('[data-aph-chave-do]'); if(b) aphUsaChave(b); }
  else if(f.classList.contains('aph-filtro')){ e.preventDefault(); e.stopPropagation();
    // Enter só escolhe quando o filtro deixou UM candidato — Enter "de reflexo" com a lista inteira gravaria um épico qualquer
    const cs=[...area.querySelectorAll('.aph-cand:not(.atual)')];
    if(String(f.value||'').trim() && cs.length===1) cs[0].click();
    else if(cs.length) cs[0].focus(); }
});
