// Jira Insights · 17 · 📈 MÉTRICAS POR TIPO DE PROJETO — as visões de cada categoria (DEA/PEA, DEF/PEF, AMS, ARQ, IMI, IPA, ITPR).
// ===========================================================================
// Cada TIPO de projeto (sigla da categoria do Jira) ganha o conjunto de métricas
// que faz sentido para ele — as pedidas pela governança e as pertinentes:
//   • Escopo aberto (DEA/PEA): horas por mês × equipe/capacidade · horas do Sênior ·
//     estimado × gasto por épico · tarefas concluídas por nível · rentabilidade.
//   • Escopo fechado (DEF/PEF): vendidas × realizadas · custo administrativo ·
//     esforço por épico · custo por pessoa · valor vendido × custo realizado.
//   • AMS (DAMS/PAMS): consumo mensal × franquia · chamados · causa raiz/produto ·
//     custo por pessoa · rentabilidade · fila no Jira.
//   • Arquivados (ARQ): horas que ainda caem lá e tickets ainda abertos.
//   • Melhorias internas (IMI): backlog em horas e R$ · custo/esforço por épico ·
//     horas por mês, semana e acumulado.   • Produtos (IPA): custo por épico.
//   • Tarefas/rotinas (ITPR): custo por departamento · carga por pessoa (planejamento).
// Fontes: worklogs do período (/api/tempo?desde&ate — pessoa, projeto, tipo, faturável,
// épico), consolidado e fichas do Jira (/api/projetos?visao=1[&projeto=]), planejamento
// semanal (POST /api/config?plan=1 acao=relatorio) e a config compartilhada (custos/h,
// contratos, metas, ausências e os PERFIS: nível júnior/pleno/sênior + departamento).
// Helpers de outros módulos (Controladoria, Central, Projetos, gráficos) só são usados
// em tempo de render — nada é executado no carregamento além dos listeners.
// ===========================================================================
const RM_NIVEIS=[['senior','Sênior'],['pleno','Pleno'],['junior','Júnior']];
const RM_NIVEL_ROT={senior:'Sênior',pleno:'Pleno',junior:'Júnior','':'Sem nível'};
// "Administrativo": tipo de issue de reunião/rotina/ADM/gestão OU não faturável.
const RM_RE_ADM=/reuni|rotina|\badm\b|administr|gest[ãa]o|n[aã]o.{0,4}fatur/i;
const RM_MAX_FICHAS=12;          // fichas do Jira buscadas por tipo (uma por projeto)
const RM_PARALELO_FICHAS=3;
// Blocos por sigla (a ordem é a ordem na tela).
const RM_BLOCOS={
  DEA:['horasMes','senior','epicos','concluidas','rentab','pessoas'],
  PEA:['horasMes','senior','epicos','concluidas','rentab','pessoas'],
  DEF:['vendidas','adm','epicos','pessoas','valorVendido'],
  PEF:['vendidas','adm','epicos','pessoas','valorVendido'],
  DAMS:['ams','chamados','causa','pessoas','rentab','fila'],
  PAMS:['ams','chamados','causa','pessoas','rentab','fila'],
  ARQ:['arq','arqAbertos'],
  IMI:['backlog','epicosCusto','evolucao','pessoas'],
  IPA:['epicosCusto','evolucao','pessoas'],
  ITPR:['depto','carga','evolucao','tipos'],
};
const RM_BLOCO_ROT={
  horasMes:'📅 Horas apontadas por mês × horas realizadas pela equipe',
  senior:'🎓 Horas apontadas por mês × horas do Sênior',
  epicos:'🧩 Tempo disponibilizado por épico × gasto por épico',
  concluidas:'✅ Tarefas concluídas por nível (Júnior · Pleno · Sênior)',
  rentab:'💰 Rentabilidade do projeto',
  pessoas:'👥 Custo por pessoa',
  vendidas:'🎯 Horas vendidas × horas realizadas',
  adm:'🗂 Custo de atividades administrativas',
  valorVendido:'💵 Valor vendido × custo realizado',
  ams:'🔄 Consumo mensal × franquia do contrato AMS',
  chamados:'🎫 Chamados atendidos no período',
  causa:'🧭 Causa raiz e produto dos chamados',
  fila:'📦 Fila do AMS no Jira',
  arq:'🚫 Horas apontadas em projetos arquivados',
  arqAbertos:'📦 Tickets ainda abertos em projetos arquivados',
  backlog:'📦 Tamanho e custo do backlog',
  epicosCusto:'🧩 Custo e esforço por épico',
  evolucao:'📈 Horas gastas por mês, por semana e acumulado',
  depto:'🏢 Custo por departamento',
  carga:'📋 Carga de trabalho por pessoa (planejamento semanal)',
  tipos:'🧩 Horas por tipo de tarefa/rotina',
};

// ---- perfis (nível + departamento) na config compartilhada ----
function rmPerfil(a){ return ((cfg.perfis||{})[a])||{}; }
function rmNivel(a){ const n=rmPerfil(a).nivel; return (n&&RM_NIVEL_ROT[n]!==undefined)?n:''; }
function rmDepto(a){ return String(rmPerfil(a).depto||'').trim(); }
function rmSalvaPerfil(a, campo, valor){
  cfg.perfis=cfg.perfis||{};
  const p={...(cfg.perfis[a]||{})};
  if(valor) p[campo]=valor; else delete p[campo];
  if(Object.keys(p).length) cfg.perfis[a]=p; else delete cfg.perfis[a];
  salvaCfg();
}
function rmDeptos(){ const s=new Set(); Object.values(cfg.perfis||{}).forEach(p=>{ if(p&&p.depto) s.add(String(p.depto).trim()); }); return [...s].sort((a,b)=>a.localeCompare(b,'pt')); }
function rmEhAdm(w){ return !w.f||RM_RE_ADM.test(w.t||''); }
const rmH=(seg)=>fmtHd((Number(seg)||0)/3600);
const rmPct=(n,d)=>(d>0?Math.round(n/d*100):null);
const rmPctTxt=(n,d)=>{ const p=rmPct(n,d); return p==null?'—':`${p}%`; };
function rmMesesEntre(de,ate){ const out=[]; let y=+de.slice(0,4), m=+de.slice(5,7); const fim=ate.slice(0,7);
  for(let g=0; g<40; g++){ const k=`${y}-${String(m).padStart(2,'0')}`; out.push(k); if(k>=fim) break; m++; if(m>12){ m=1; y++; } }
  return out; }
function rmSemRot(w){ const s=isoSemana(w); return `S${String(s.num).padStart(2,'0')}`; }
function rmBarra(v,max,cor){ return `<span class="rm-bar"><i style="width:${Math.max(2,Math.min(100,(max>0?v/max*100:0)))}%;background:${cor||'var(--cerceta)'}"></i></span>`; }
function rmReRender(){ if(estado.vista==='metricas') renderMetricas(); }

// ---- dados: worklogs do período, consolidado, catálogo, fichas e planejamento ----
function rmGarante(){
  const m=estado.metricas;
  if(!m.de){ m.de=ctPrimeiroDiaMes(-5); m.ate=hojeSP(); }      // padrão: últimos 6 meses (comparação mensal)
  if(m.ate<m.de){ const x=m.de; m.de=m.ate; m.ate=x; }
  if(m.de<voltaDias(m.ate,365)) m.de=voltaDias(m.ate,365);     // teto da API: 1 ano
  const chave=m.de+'|'+m.ate;
  if(m.chaveT!==chave&&!m.tempoB&&!m.tempoErro){
    m.tempoB=true;
    fetch(`/api/tempo?desde=${encodeURIComponent(m.de)}&ate=${encodeURIComponent(m.ate)}`)
      .then(r=>r.json()).then(j=>{ m.tempoB=false;
        if(j&&!j.erro){ m.tempo=j; m.chaveT=chave; } else m.tempoErro=(j&&j.erro)||'Falha ao ler as horas.';
        rmReRender();
      }).catch(e=>{ m.tempoB=false; m.tempoErro=humanizaErro(e); rmReRender(); });
  }
  if(!m.cons&&!m.consB){
    m.consB=true;
    const pj=estado.projetos&&estado.projetos.consolidado;
    if(pj){ m.cons=pj; m.consB=false; }
    else fetch('/api/projetos?visao=1').then(r=>r.json()).then(j=>{ m.consB=false;
      m.cons=(j&&!j.erro)?j:{projetos:[],erro:(j&&j.erro)||'Consolidado do Jira indisponível.'}; rmReRender();
    }).catch(e=>{ m.consB=false; m.cons={projetos:[],erro:humanizaErro(e)}; rmReRender(); });
  }
  if(!_projetosCache) garanteProjetos().then(rmReRender).catch(()=>{});
}
// Ficha por projeto (épicos com estimado × gasto, esforço por responsável, itens abertos).
function rmFicha(key){ const m=estado.metricas; return m.fichas[key]||((estado.projetos&&estado.projetos.fichas)||{})[key]||null; }
function rmGaranteFichas(keys){
  const m=estado.metricas; let emVoo=Object.values(m.fichasB).filter(Boolean).length;
  keys.slice(0,RM_MAX_FICHAS).forEach(k=>{
    if(rmFicha(k)||m.fichasB[k]||m.fichasErr[k]||emVoo>=RM_PARALELO_FICHAS) return;
    emVoo++; m.fichasB[k]=true;
    fetch(`/api/projetos?visao=1&projeto=${encodeURIComponent(k)}`).then(r=>r.json()).then(j=>{ m.fichasB[k]=false;
      if(j&&!j.erro){ m.fichas[k]=j; if(estado.projetos&&estado.projetos.fichas&&!estado.projetos.fichas[k]) estado.projetos.fichas[k]=j; }
      else m.fichasErr[k]=(j&&j.erro)||'Ficha indisponível.';
      rmReRender();
    }).catch(e=>{ m.fichasB[k]=false; m.fichasErr[k]=humanizaErro(e); rmReRender(); });
  });
}
// Planejamento semanal de todo o time nas semanas do período (exige identidade).
function rmGarantePlan(){
  const m=estado.metricas; const id=(typeof idApontar==='function')?idApontar():null;
  if(!id) return;
  const chave=`${semChave(m.de)}|${semChave(m.ate)}`;
  if(m.planChave===chave||m.planB||m.planErro) return;
  m.planB=true;
  mpApi({acao:'relatorio', de:semChave(m.de), ate:semChave(m.ate)}).then(j=>{ m.planB=false;
    if(j&&j.ok){ m.plan=j.planos||[]; m.planChave=chave; } else m.planErro=(j&&j.erro)||'Falha ao carregar os planejamentos.';
    rmReRender();
  }).catch(e=>{ m.planB=false; m.planErro=humanizaErro(e); rmReRender(); });
}
// Tickets ABERTOS de toda a instância (só para os arquivados: o catálogo e o
// consolidado escondem projetos "ARQ", então a fila deles vem daqui).
function rmGaranteAbertos(){
  const m=estado.metricas; if(m.abertos||m.abertosB||m.abertosErro) return;
  m.abertosB=true;
  const ate=voltaDias(hojeSP(),-1095);   // 3 anos à frente: pega tudo o que tem vencimento + os sem vencimento
  fetch(`/api/vencimentos?ate=${encodeURIComponent(ate)}&incluirSemVenc=1`).then(r=>r.json()).then(j=>{ m.abertosB=false;
    if(j&&!j.erro) m.abertos=j; else m.abertosErro=(j&&j.erro)||'Tickets abertos indisponíveis.'; rmReRender();
  }).catch(e=>{ m.abertosB=false; m.abertosErro=humanizaErro(e); rmReRender(); });
}
// Projetos conhecidos (catálogo + worklogs + consolidado + abertos) com a sigla do tipo.
// O catálogo e o consolidado omitem os ARQUIVADOS; worklogs e tickets abertos trazem a categoria deles.
function rmProjetos(){
  const m=estado.metricas; const t=m.tempo; const mapa={};
  const add=(key,nome,cat)=>{ if(!key||key==='—') return;
    const cur=mapa[key]||(mapa[key]={key,nome:key,categoria:'',sigla:''});
    if(nome&&cur.nome===key) cur.nome=nome;
    if(cat&&!cur.categoria){ cur.categoria=cat; cur.sigla=relSiglaDe(cat); } };
  (_projetosCache||[]).forEach(p=>add(p.key,p.nome,p.categoria));
  Object.entries((t&&t.projetos)||{}).forEach(([k,p])=>add(k,p&&p.nome,p&&p.categoria));
  (((m.cons||{}).projetos)||[]).forEach(p=>add(p.key,p.nome,p.categoria));
  Object.entries(((m.abertos||{}).projetos)||{}).forEach(([k,p])=>add(k,p&&p.nome,p&&p.categoria));
  return mapa;
}
// Capacidade da equipe por mês (meta/dia × dias úteis − feriados − ausências − vigência).
function rmCapacidadeMes(meses, de, ate){
  const pessoas=pessoasUnidas(); const ocultos=new Set((cfg.ocultos||[]).map(o=>o&&o.a).filter(Boolean));
  const cap={}; meses.forEach(mm=>{ cap[mm]=0; });
  const dias=listaDias(de,ate);
  Object.keys(pessoas).forEach(a=>{ if(ocultos.has(a)||RE_EXCLUIR.test((pessoas[a]&&pessoas[a].nome)||'')) return;
    dias.forEach(d=>{ const mm=d.slice(0,7); if(mm in cap) cap[mm]+=mpCapDia(a,d); }); });
  return cap;
}
function rmDados(){
  const m=estado.metricas; const t=m.tempo; if(!t||m.chaveT!==m.de+'|'+m.ate) return null;
  const mapa=rmProjetos();
  const siglas={}; REL_SIGLAS.forEach(s=>{ siglas[s]=[]; });
  Object.values(mapa).forEach(p=>{ if(p.sigla) siglas[p.sigla].push(p); });
  Object.values(siglas).forEach(l=>l.sort((a,b)=>a.nome.localeCompare(b.nome,'pt')));
  if(!m.sigla||!siglas[m.sigla]) m.sigla=REL_SIGLAS.find(s=>siglas[s].length)||'DEA';
  const projs=siglas[m.sigla];
  if(m.proj&&!projs.some(p=>p.key===m.proj)) m.proj='';
  const alvo=m.proj?projs.filter(p=>p.key===m.proj):projs;
  const keys=new Set(alvo.map(p=>p.key));
  const meses=rmMesesEntre(m.de,m.ate);
  const wlAll=t.worklogs||[];
  const equipe={}; meses.forEach(mm=>{ equipe[mm]=0; });
  const porMes={}, porSem={}, por={}, porPessoa={}, porEpico={}, porTipo={}, porDepto={}, porTicket={};
  const adm={seg:0,custo:0,tipos:{}}; const semCusto=new Set(); const pessoas=new Set(); const tickets=new Set();
  let segTot=0,segFat=0,custoTot=0,recTot=0,temContrato=false;
  const infos=t.infos||{}; const causa={}, produto={};
  const wl=[];
  wlAll.forEach(w=>{
    const mm=(w.d||'').slice(0,7); const s=Number(w.s)||0;
    if(mm in equipe) equipe[mm]+=s/3600;
    if(!keys.has(w.p)) return;
    wl.push(w);
    const h=s/3600; const chBase=ctCustoBase(w.a); const ch=chBase>0?chBase:Math.max(0,Number((cfg.ctrl||{}).custoPadrao)||0);
    if(!(chBase>0)) semCusto.add(w.a);
    const custo=h*ch;
    const c=ctContratoDe(w.p); const vh=c?(Number(c.valorHora)||0):0; if(vh) temContrato=true;
    const rec=(w.f&&vh)?h*vh:0;
    const nivel=rmNivel(w.a); const depto=rmDepto(w.a)||'';
    const M=porMes[mm]=porMes[mm]||{seg:0,segFat:0,custo:0,rec:0,nivel:{senior:0,pleno:0,junior:0,'':0},tickets:new Set(),pessoas:new Set()};
    M.seg+=s; if(w.f) M.segFat+=s; M.custo+=custo; M.rec+=rec; M.nivel[nivel]+=s; if(w.k) M.tickets.add(w.k); M.pessoas.add(w.a);
    const sk=w.d?semChave(w.d.slice(0,10)):''; if(sk){ const S=porSem[sk]=porSem[sk]||{seg:0,custo:0}; S.seg+=s; S.custo+=custo; }
    const P=por[w.p]=por[w.p]||{p:w.p,seg:0,segFat:0,custo:0,rec:0,admSeg:0,admCusto:0,pessoas:new Set(),tickets:new Set(),ultimo:''};
    P.seg+=s; if(w.f) P.segFat+=s; P.custo+=custo; P.rec+=rec; P.pessoas.add(w.a); if(w.k) P.tickets.add(w.k);
    if((w.d||'').slice(0,10)>P.ultimo) P.ultimo=(w.d||'').slice(0,10);
    const U=porPessoa[w.a]=porPessoa[w.a]||{a:w.a,seg:0,custo:0,nivel,depto,tickets:new Set(),padrao:!(chBase>0)};
    U.seg+=s; U.custo+=custo; if(w.k) U.tickets.add(w.k);
    const ek=w.e||''; const E=porEpico[ek]=porEpico[ek]||{e:ek,seg:0,custo:0,pessoas:new Set(),projs:new Set(),tickets:new Set()};
    E.seg+=s; E.custo+=custo; E.pessoas.add(w.a); E.projs.add(w.p); if(w.k) E.tickets.add(w.k);
    const tp=w.t||'—'; const T=porTipo[tp]=porTipo[tp]||{t:tp,seg:0,custo:0,fat:!!w.f,adm:rmEhAdm(w)}; T.seg+=s; T.custo+=custo;
    const D=porDepto[depto]=porDepto[depto]||{d:depto,seg:0,custo:0,pessoas:new Set()}; D.seg+=s; D.custo+=custo; D.pessoas.add(w.a);
    if(rmEhAdm(w)){ adm.seg+=s; adm.custo+=custo; adm.tipos[tp]=(adm.tipos[tp]||0)+s; P.admSeg+=s; P.admCusto+=custo; }
    if(w.k){ const K=porTicket[w.k]=porTicket[w.k]||{k:w.k,p:w.p,t:tp,seg:0,custo:0,pessoas:new Set()}; K.seg+=s; K.custo+=custo; K.pessoas.add(w.a); tickets.add(w.k);
      const inf=infos[w.k]||{}; if(inf.cr) causa[inf.cr]=(causa[inf.cr]||0)+s; if(inf.pr) produto[inf.pr]=(produto[inf.pr]||0)+s; }
    pessoas.add(w.a); segTot+=s; if(w.f) segFat+=s; custoTot+=custo; recTot+=rec;
  });
  const cap=rmCapacidadeMes(meses,m.de,m.ate);
  const consPor={}; (((m.cons||{}).projetos)||[]).forEach(p=>{ consPor[p.key]=p; });
  return { sigla:m.sigla, siglas, projs, alvo, keys, meses, wl, porMes, porSem, por, porPessoa, porEpico, porTipo, porDepto, porTicket,
    adm, semCusto, pessoas, tickets, segTot, segFat, custoTot, recTot, temContrato, equipe, cap, causa, produto,
    consPor, pessoasMeta:t.pessoas||{}, resumos:t.resumos||{}, mapa };
}
const rmNome=(d,a)=>((d.pessoasMeta[a]&&d.pessoasMeta[a].nome)||(estado.usuarios[a]&&estado.usuarios[a].nome)||a);
const rmProjRot=(d,k)=>((d.mapa[k]&&d.mapa[k].nome)||k);
function rmEpicoRot(d,e){ if(!e) return 'Sem épico';
  for(const k of d.keys){ const f=rmFicha(k); const ep=f&&(f.epicos||[]).find(x=>x.k===e); if(ep) return `${e} · ${ep.resumo||''}`; }
  return d.resumos[e]?`${e} · ${d.resumos[e]}`:e; }

// ---- primitivos de tela ----
const rmKpi=(v,l,cls,s)=>`<div class="vg-k ${cls||''}"><div class="v">${v}</div><div class="l">${esc(l)}</div>${s?`<div class="s">${s}</div>`:''}</div>`;
function rmTab(cols, rows, foot){
  const head=cols.map(c=>`<th class="${c.num?'num':''}"${c.tip?` data-tip="${escA(c.tip)}"`:''}>${esc(c.h)}</th>`).join('');
  const body=rows.map(r=>{ const cel=(r.cels||r).map((c,i)=>`<td class="${cols[i]&&cols[i].num?'num':''}">${c}</td>`).join('');
    const dr=r.drill?` data-rm-drill="${escA(r.drill)}" role="button" tabindex="0" data-tipk="clique para ver os tickets"`:'';
    return `<tr class="${r.drill?'rm-click':''}${r.cls?' '+r.cls:''}"${dr}${r.tip?` data-tip="${escA(r.tip)}"`:''}>${cel}</tr>`; }).join('')
    ||`<tr><td colspan="${cols.length}" class="mp-dim">Sem dados no período.</td></tr>`;
  const ft=foot?`<tfoot><tr>${foot.map((c,i)=>`<td class="${cols[i]&&cols[i].num?'num':''}">${c}</td>`).join('')}</tr></tfoot>`:'';
  return `<div class="scroll-x"><table class="mp-tab-mini rm-tab"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${ft}</table></div>`;
}
const rmBloco=(id,html,sub)=>`<section class="rm-bloco" id="rm-${id}"><h3 class="mp-h3">${RM_BLOCO_ROT[id]||id}${sub?` <span class="mp-dim">${sub}</span>`:''}</h3>${html}</section>`;
const rmSem=(cls,rot)=>`<span class="ct-sem ${cls}">${esc(rot)}</span>`;
function rmFichasStatus(d){
  const m=estado.metricas; const ks=d.alvo.map(p=>p.key).slice(0,RM_MAX_FICHAS);
  const falt=ks.filter(k=>!rmFicha(k)); const erros=ks.filter(k=>m.fichasErr[k]);
  let html='';
  if(falt.some(k=>!m.fichasErr[k])) html+=`<div class="muted small">⏳ Lendo a ficha do Jira de ${falt.filter(k=>!m.fichasErr[k]).map(esc).join(', ')}…</div>`;
  if(erros.length) html+=`<div class="aviso">⚠ Ficha indisponível: ${erros.map(k=>`${esc(k)} (${esc(m.fichasErr[k])})`).join(' · ')} <button class="btn" data-rm-ficha="${escA(erros.join(','))}">Tentar de novo</button></div>`;
  if(d.alvo.length>RM_MAX_FICHAS) html+=`<div class="muted small">ℹ️ Este tipo tem ${d.alvo.length} projetos; as fichas do Jira cobrem os ${RM_MAX_FICHAS} primeiros — escolha um projeto no filtro para ver os demais.</div>`;
  return html;
}
function rmAvisoPerfis(d, oQue){
  const gestor=souAprovador();
  return `<div class="aviso">⚠ Ninguém tem <b>${oQue}</b> cadastrado ainda — a métrica fica toda em "Sem ${oQue}". ${gestor?'Cadastre em <b>⚙️ Perfis</b> (nível e departamento por pessoa, vale para o time todo).':'Peça a um gestor para cadastrar em ⚙️ Perfis.'}
    ${gestor?'<button class="btn" data-rm-perfis="1" style="margin-left:6px">⚙️ Perfis</button>':''}</div>`;
}

// ---- blocos ----
function rmBlHorasMes(d){
  const max=Math.max(1,...d.meses.map(mm=>Math.max(((d.porMes[mm]||{}).seg||0)/3600,d.equipe[mm]||0,d.cap[mm]||0)));
  const rows=d.meses.map(mm=>{ const M=d.porMes[mm]||{seg:0,segFat:0,pessoas:new Set()}; const h=M.seg/3600, eq=d.equipe[mm]||0, cp=d.cap[mm]||0;
    return { drill:`mes=${mm}`, cels:[`<b>${esc(labelMesAbbr(mm))}</b>`, `${fmtHd(h)} ${rmBarra(h,max)}`, rmH(M.segFat), `${fmtHd(eq)} ${rmBarra(eq,max,'var(--grafite)')}`,
      rmPctTxt(h,eq), fmtHd(cp), rmPctTxt(eq,cp), String(M.pessoas.size)] }; });
  const totP=d.segTot/3600, totE=d.meses.reduce((s,mm)=>s+(d.equipe[mm]||0),0), totC=d.meses.reduce((s,mm)=>s+(d.cap[mm]||0),0);
  const foot=['<b>Total</b>',`<b>${fmtHd(totP)}</b>`,`<b>${rmH(d.segFat)}</b>`,`<b>${fmtHd(totE)}</b>`,`<b>${rmPctTxt(totP,totE)}</b>`,`<b>${fmtHd(totC)}</b>`,`<b>${rmPctTxt(totE,totC)}</b>`,`<b>${d.pessoas.size}</b>`];
  const serie=[{nome:'Horas no(s) projeto(s)',cor:cores.cerceta,vals:d.meses.map(mm=>({x:mm,v:Math.round(((d.porMes[mm]||{}).seg||0)/360)/10})),tipo:'area'},
    {nome:'Horas da equipe (todos os projetos)',cor:cores.grafite,vals:d.meses.map(mm=>({x:mm,v:Math.round((d.equipe[mm]||0)*10)/10})),tipo:'line',dash:1},
    {nome:'Capacidade da equipe',cor:cores.amarelo,vals:d.meses.map(mm=>({x:mm,v:Math.round((d.cap[mm]||0)*10)/10})),tipo:'line',dash:1}];
  return rmBloco('horasMes', `${tsChart(serie,{fmt:v=>fmtHd(v),xlabel:x=>labelMesAbbr(x),h:200})}
    ${rmTab([{h:'Mês'},{h:'Horas no projeto',num:1},{h:'Faturáveis',num:1},{h:'Horas da equipe',num:1,tip:'Tudo o que a equipe apontou no mês, em todos os projetos'},{h:'% do time',num:1,tip:'Horas do projeto ÷ horas da equipe'},{h:'Capacidade',num:1,tip:'Meta/dia × dias úteis − feriados − ausências (Metas & ausências)'},{h:'Ocupação',num:1,tip:'Horas da equipe ÷ capacidade'},{h:'Pessoas',num:1}],rows,foot)}
    ${ctExpl('as <b>horas apontadas</b> nos projetos deste tipo, mês a mês, contra o que <b>a equipe inteira realizou</b> no mesmo mês (todos os projetos) e contra a <b>capacidade</b> (meta diária × dias úteis, descontando feriados, ausências e vigência). <b>% do time</b> diz quanto da força de trabalho o projeto consumiu; <b>Ocupação</b> diz se a equipe apontou o que cabia no mês. Clique no mês para ver os tickets.')}`);
}
function rmBlSenior(d){
  const temNivel=Object.values(d.porPessoa).some(u=>u.nivel);
  const max=Math.max(1,...d.meses.map(mm=>((d.porMes[mm]||{}).seg||0)/3600));
  const rows=d.meses.map(mm=>{ const M=d.porMes[mm]||{seg:0,nivel:{senior:0,pleno:0,junior:0,'':0}}; const h=M.seg/3600, sn=M.nivel.senior/3600;
    return { drill:`mes=${mm}`, cels:[`<b>${esc(labelMesAbbr(mm))}</b>`, `${fmtHd(h)} ${rmBarra(h,max)}`, `${fmtHd(sn)} ${rmBarra(sn,max,cores.roxo)}`, rmPctTxt(sn,h),
      fmtHd(M.nivel.pleno/3600), fmtHd(M.nivel.junior/3600), fmtHd(M.nivel['']/3600)] }; });
  const tot=(k)=>d.meses.reduce((s,mm)=>s+(((d.porMes[mm]||{}).nivel||{})[k]||0),0);
  const foot=['<b>Total</b>',`<b>${rmH(d.segTot)}</b>`,`<b>${rmH(tot('senior'))}</b>`,`<b>${rmPctTxt(tot('senior'),d.segTot)}</b>`,`<b>${rmH(tot('pleno'))}</b>`,`<b>${rmH(tot('junior'))}</b>`,`<b>${rmH(tot(''))}</b>`];
  return rmBloco('senior', `${temNivel?'':rmAvisoPerfis(d,'nível')}
    ${rmTab([{h:'Mês'},{h:'Horas no projeto',num:1},{h:'Horas do Sênior',num:1},{h:'% Sênior',num:1},{h:'Pleno',num:1},{h:'Júnior',num:1},{h:'Sem nível',num:1}],rows,foot)}
    ${ctExpl('quanto das horas do mês foi feito por <b>consultores Sênior</b> (nível cadastrado em ⚙️ Perfis). Um % alto de Sênior num escopo aberto costuma significar custo/h maior — compare com a rentabilidade abaixo. "Sem nível" são pessoas ainda sem cadastro.')}`);
}
function rmEpicosLinhas(d){
  // Une o que o Jira sabe (estimado × gasto, todo o histórico) com o período (worklogs).
  const linhas={};
  d.alvo.slice(0,RM_MAX_FICHAS).forEach(p=>{ const f=rmFicha(p.key); if(!f) return;
    (f.epicos||[]).forEach(e=>{ linhas[e.k]={e:e.k,p:p.key,resumo:e.resumo||'',status:e.status||'',estH:e.estH||0,gastoH:e.gastoH||0,nFilhos:e.nFilhos||0,pct:e.pct,seg:0,custo:0,pessoas:new Set()}; }); });
  Object.values(d.porEpico).forEach(E=>{ const L=linhas[E.e]||(linhas[E.e]={e:E.e,p:[...E.projs][0]||'',resumo:E.e?(d.resumos[E.e]||''):'',status:'',estH:0,gastoH:0,nFilhos:0,pct:null,seg:0,custo:0,pessoas:new Set()});
    L.seg=E.seg; L.custo=E.custo; L.pessoas=E.pessoas; });
  return Object.values(linhas);
}
function rmBlEpicos(d){
  rmGaranteFichas(d.alvo.map(p=>p.key));
  const ls=rmEpicosLinhas(d).sort((a,b)=>(b.estH||0)-(a.estH||0)||b.seg-a.seg);
  const rows=ls.map(L=>{ const ex=rmPct(L.gastoH,L.estH); const estouro=L.estH>0&&L.gastoH>L.estH;
    const st=L.estH>0?(estouro?rmSem('crit','estourou'):(ex>=85?rmSem('aten','no limite'):rmSem('ok','dentro'))):(L.e?rmSem('na','sem estimativa'):'');
    return { drill:`e=${L.e}`, cels:[`${L.e?`<a href="${jiraBase()}/browse/${encodeURIComponent(L.e)}" target="_blank" rel="noopener"><b>${esc(L.e)}</b> ↗</a> `:'<b>Sem épico</b> '}<span class="muted small">${esc(L.resumo.slice(0,60))}</span>`,
      esc(d.alvo.length>1?rmProjRot(d,L.p):''), L.estH?fmtHd(L.estH):'—', L.gastoH?fmtHd(L.gastoH):'—', ex==null?'—':`${ex}%`, st, rmH(L.seg), fmtBRL(L.custo), String(L.pessoas.size)] }; });
  const totEst=ls.reduce((s,L)=>s+(L.estH||0),0), totG=ls.reduce((s,L)=>s+(L.gastoH||0),0);
  const foot=['<b>Total</b>','',`<b>${fmtHd(totEst)}</b>`,`<b>${fmtHd(totG)}</b>`,`<b>${rmPctTxt(totG,totEst)}</b>`,'',`<b>${rmH(d.segTot)}</b>`,`<b>${fmtBRL(d.custoTot)}</b>`,`<b>${d.pessoas.size}</b>`];
  return rmBloco('epicos', `${rmFichasStatus(d)}
    ${rmTab([{h:'Épico'},{h:'Projeto'},{h:'Disponibilizado',num:1,tip:'Soma das estimativas originais dos itens do épico (Jira, todo o histórico)'},{h:'Gasto (Jira)',num:1,tip:'Soma do tempo gasto nos itens do épico (Jira, todo o histórico)'},{h:'Execução',num:1},{h:'Situação'},{h:'Horas no período',num:1},{h:'Custo no período',num:1},{h:'Pessoas',num:1}],rows,foot)}
    ${ctExpl('<b>Disponibilizado</b> = a soma das estimativas dos itens do épico no Jira; <b>Gasto</b> = o tempo registrado nesses itens (os dois cobrem todo o histórico do projeto). <b>Horas/Custo no período</b> vêm dos apontamentos do Clockwork no intervalo escolhido, agrupados pelo épico de cada ticket (sub-tarefa → história → épico). "Sem épico" são horas em tickets soltos — vale organizar. Clique na linha para ver os tickets do período.')}`);
}
function rmBlConcluidas(d){
  rmGaranteFichas(d.alvo.map(p=>p.key));
  const porA={}; let temFicha=false;
  d.alvo.slice(0,RM_MAX_FICHAS).forEach(p=>{ const f=rmFicha(p.key); if(!f) return; temFicha=true;
    (f.esforcoResp||[]).forEach(r=>{ const a=r.id||''; const U=porA[a]=porA[a]||{a,nome:r.nome||'Não atribuído',itens:0,concluidos:0,gastoH:0};
      U.itens+=r.itens||0; U.concluidos+=r.concluidos||0; U.gastoH+=r.gastoH||0; }); });
  const grupos={}; ['senior','pleno','junior','','na'].forEach(k=>{ grupos[k]={k,pessoas:0,itens:0,concluidos:0}; });
  Object.values(porA).forEach(U=>{ const g=U.a?rmNivel(U.a):'na'; grupos[g].pessoas++; grupos[g].itens+=U.itens; grupos[g].concluidos+=U.concluidos; });
  const totC=Object.values(porA).reduce((s,U)=>s+U.concluidos,0), totI=Object.values(porA).reduce((s,U)=>s+U.itens,0);
  const rot={senior:'Sênior',pleno:'Pleno',junior:'Júnior','':'Sem nível',na:'Não atribuído'};
  const rows=['junior','pleno','senior','','na'].filter(k=>grupos[k].itens||grupos[k].pessoas).map(k=>{ const g=grupos[k]; const share=rmPct(g.concluidos,totC);
    return { cls:k==='junior'||k==='pleno'?'rm-destaque':'', cels:[`<b>${rot[k]}</b>`, String(g.pessoas), String(g.itens), String(g.concluidos), `${share==null?'—':share+'%'} ${rmBarra(g.concluidos,totC,k==='senior'?cores.roxo:cores.cerceta)}`, rmPctTxt(g.concluidos,g.itens)] }; });
  const jp=grupos.junior.concluidos+grupos.pleno.concluidos;
  const kpi=`<div class="vg-hero rm-hero3">${rmKpi(rmPctTxt(jp,totC),'Concluídas por Júnior ou Pleno',jp>0?'good':'',`${jp} de ${totC} tarefas concluídas`)}
    ${rmKpi(rmPctTxt(grupos.senior.concluidos,totC),'Concluídas por Sênior','',`${grupos.senior.concluidos} tarefas`)}
    ${rmKpi(rmPctTxt(totC,totI),'Conclusão geral','',`${totC} de ${totI} itens (Jira, todo o histórico)`)}</div>`;
  const pess=Object.values(porA).filter(U=>U.itens).sort((a,b)=>b.concluidos-a.concluidos).slice(0,15)
    .map(U=>({ cels:[esc(U.nome), esc(U.a?RM_NIVEL_ROT[rmNivel(U.a)]:'—'), String(U.itens), String(U.concluidos), rmPctTxt(U.concluidos,U.itens), U.gastoH?fmtHd(U.gastoH):'—'] }));
  const temNivel=Object.keys(porA).some(a=>a&&rmNivel(a));
  return rmBloco('concluidas', `${rmFichasStatus(d)}${temFicha&&!temNivel?rmAvisoPerfis(d,'nível'):''}
    ${temFicha?kpi:''}
    ${rmTab([{h:'Nível'},{h:'Pessoas',num:1},{h:'Itens',num:1},{h:'Concluídos',num:1},{h:'% das concluídas',num:1},{h:'Taxa de conclusão',num:1}],rows)}
    ${pess.length?`<details class="rm-det"><summary>Por pessoa (${pess.length})</summary>${rmTab([{h:'Pessoa'},{h:'Nível'},{h:'Itens',num:1},{h:'Concluídos',num:1},{h:'Taxa',num:1},{h:'Gasto (Jira)',num:1}],pess)}</details>`:''}
    ${ctExpl('tarefas do(s) projeto(s) no Jira agrupadas pelo <b>responsável</b> e pelo nível dele (⚙️ Perfis). <b>% das concluídas</b> = quanto das tarefas concluídas foi entregue por aquele nível; num escopo aberto saudável, Júnior/Pleno entregam a maior parte e o Sênior orienta. Cobre todo o histórico do projeto (não só o período).')}`);
}
function rmBlRentab(d){
  const rows=d.alvo.map(p=>{ const P=d.por[p.key]||{seg:0,segFat:0,custo:0,rec:0,pessoas:new Set()}; const c=ctContratoDe(p.key); const vh=c?(Number(c.valorHora)||0):0;
    const mg=P.rec-P.custo; const mgp=P.rec>0?rmPct(mg,P.rec):null; const [rot,cls]=ctSemaforo(mgp);
    return { drill:`pj=${p.key}`, cels:[`<b>${esc(p.nome)}</b> <span class="muted small">${esc(p.key)}</span>`, rmH(P.seg), `${rmH(P.segFat)} <span class="muted small">${rmPctTxt(P.segFat,P.seg)}</span>`,
      vh?fmtBRL(P.rec):'<span class="muted">sem contrato</span>', fmtBRL(P.custo), vh?fmtBRL(mg):'—', mgp==null?'—':`${mgp}%`, vh?rmSem(cls,rot):rmSem('na','sem valor-hora'),
      c?`${esc(c.cliente||'')} · ${fmtBRL(vh)}/h`:'—'] }; });
  const mg=d.recTot-d.custoTot; const mgp=d.recTot>0?rmPct(mg,d.recTot):null; const [rot,cls]=ctSemaforo(mgp);
  const foot=['<b>Total</b>',`<b>${rmH(d.segTot)}</b>`,`<b>${rmH(d.segFat)}</b>`,`<b>${fmtBRL(d.recTot)}</b>`,`<b>${fmtBRL(d.custoTot)}</b>`,`<b>${fmtBRL(mg)}</b>`,`<b>${mgp==null?'—':mgp+'%'}</b>`,d.temContrato?rmSem(cls,rot):'',''];
  const avisos=[];
  if(!d.temContrato) avisos.push('⚠ Nenhum projeto deste tipo tem <b>contrato com valor-hora</b> em Contratos (Admin) — sem valor-hora não há receita nem margem; os custos continuam valendo.');
  if(d.semCusto.size&&!(Number((cfg.ctrl||{}).custoPadrao)>0)) avisos.push(`⚠ ${d.semCusto.size} pessoa(s) sem custo/h (${[...d.semCusto].slice(0,4).map(a=>esc(rmNome(d,a).split(' ')[0])).join(', ')}${d.semCusto.size>4?'…':''}) entram com R$ 0 — a margem fica melhor do que é. Cadastre na 🏦 Controladoria (⚙️).`);
  return rmBloco('rentab', `${avisos.map(a=>`<div class="aviso">${a}</div>`).join('')}
    ${rmTab([{h:'Projeto'},{h:'Horas',num:1},{h:'Faturáveis',num:1},{h:'Receita',num:1,tip:'Horas faturáveis × valor-hora do contrato'},{h:'Custo',num:1,tip:'Horas × custo/h de cada pessoa'},{h:'Margem',num:1},{h:'Margem %',num:1},{h:'Situação'},{h:'Contrato'}],rows,foot)}
    ${ctExpl('<b>Receita</b> = horas faturáveis × valor-hora do contrato do projeto; <b>Custo</b> = horas de cada pessoa × custo/h dela (Odoo ou Controladoria). Margem ≥ 30% = saudável · 10–30% = apertada · abaixo = no vermelho. Clique no projeto para ver os tickets.')}`);
}
function rmBlPessoas(d){
  const us=Object.values(d.porPessoa).sort((a,b)=>b.custo-a.custo||b.seg-a.seg);
  const max=Math.max(1,...us.map(u=>u.custo||u.seg));
  const rows=us.map(u=>({ drill:`a=${u.a}`, cels:[`<b>${esc(rmNome(d,u.a))}</b>`, esc(RM_NIVEL_ROT[u.nivel]), esc(u.depto||'—'), rmH(u.seg), rmPctTxt(u.seg,d.segTot), `${fmtBRL(u.custo)} ${rmBarra(u.custo||u.seg,max)}`,
    rmPctTxt(u.custo,d.custoTot), `${fmtBRL(u.seg?u.custo/(u.seg/3600):0)}${u.padrao?' <span class="muted small" data-tip="Sem custo próprio: usa o custo padrão da Controladoria">padrão</span>':''}`, String(u.tickets.size)] }));
  const foot=['<b>Total</b>','','',`<b>${rmH(d.segTot)}</b>`,'',`<b>${fmtBRL(d.custoTot)}</b>`,'',`<b>${fmtBRL(d.segTot?d.custoTot/(d.segTot/3600):0)}</b>`,`<b>${d.tickets.size}</b>`];
  return rmBloco('pessoas', `${rmTab([{h:'Pessoa'},{h:'Nível'},{h:'Departamento'},{h:'Horas',num:1},{h:'% horas',num:1},{h:'Custo',num:1},{h:'% custo',num:1},{h:'Custo/h',num:1},{h:'Tickets',num:1}],rows,foot)}
    ${ctExpl('quem gastou o quê nos projetos deste tipo: horas apontadas × custo/h da pessoa. Nível e departamento vêm de ⚙️ Perfis. Clique na pessoa para ver os tickets dela no período.')}`);
}
function rmBlVendidas(d){
  const rows=d.alvo.map(p=>{ const P=d.por[p.key]||{seg:0}; const c=ctContratoDe(p.key); const cons=d.consPor[p.key]||{};
    const vend=c&&Number(c.horasContratadas)>0?Number(c.horasContratadas):0; const est=cons.estH||0; const base=vend||est;
    const real=cons.gastoH||0; const pc=rmPct(real,base);
    const st=!base?rmSem('na','sem horas vendidas'):(pc>100?rmSem('crit','estourou'):(pc>=85?rmSem('aten','em risco'):rmSem('ok','dentro')));
    return { drill:`pj=${p.key}`, cels:[`<b>${esc(p.nome)}</b> <span class="muted small">${esc(p.key)}</span>`, vend?`${fmtHd(vend)} <span class="muted small">contrato</span>`:(est?`${fmtHd(est)} <span class="muted small" data-tip="Sem contrato com horas: usa a soma das estimativas do Jira">estimado</span>`:'—'),
      real?fmtHd(real):'—', `${pc==null?'—':pc+'%'} ${rmBarra(Math.min(pc||0,100),100,pc>100?'var(--err)':(pc>=85?'var(--amarelo)':'var(--musgo)'))}`, base?fmtHd(Math.max(0,base-real)):'—', rmH(P.seg), st, c?esc(c.cliente||''):'—'] }; });
  return rmBloco('vendidas', `${rmTab([{h:'Projeto'},{h:'Horas vendidas',num:1,tip:'Horas contratadas do contrato (Admin); sem contrato, a estimativa do Jira'},{h:'Realizadas (Jira)',num:1,tip:'Tempo gasto em todos os tickets do projeto, todo o histórico'},{h:'Consumo',num:1},{h:'Saldo',num:1},{h:'No período',num:1,tip:'Horas apontadas no intervalo escolhido (Clockwork)'},{h:'Situação'},{h:'Cliente'}],rows)}
    ${ctExpl('<b>Vendidas</b> = as horas contratadas no Contrato (Admin) do projeto — sem contrato, usa a soma das estimativas do Jira e avisa. <b>Realizadas</b> = todo o tempo já gasto no projeto (Jira), independentemente do período; <b>No período</b> mostra o ritmo recente. Acima de 85% do vendido é risco; acima de 100% estourou.')}`);
}
function rmBlAdm(d){
  const tipos=Object.values(d.porTipo).filter(T=>T.adm).sort((a,b)=>b.seg-a.seg);
  const max=Math.max(1,...tipos.map(T=>T.seg));
  const rows=tipos.map(T=>({ drill:`tipo=${T.t}`, cels:[`<b>${esc(T.t)}</b>${T.fat?'':' <span class="muted small">não faturável</span>'}`, `${rmH(T.seg)} ${rmBarra(T.seg,max,cores.amarelo)}`, rmPctTxt(T.seg,d.segTot), fmtBRL(T.custo), rmPctTxt(T.custo,d.custoTot)] }));
  const porProj=d.alvo.map(p=>{ const P=d.por[p.key]; if(!P||!P.seg) return null; return { drill:`pj=${p.key}&adm=1`, cels:[`<b>${esc(p.nome)}</b>`, rmH(P.admSeg), rmPctTxt(P.admSeg,P.seg), fmtBRL(P.admCusto), rmPctTxt(P.admCusto,P.custo)] }; }).filter(Boolean);
  const pa=rmPct(d.adm.custo,d.custoTot);
  const kpi=`<div class="vg-hero rm-hero3">${rmKpi(rmH(d.adm.seg),'Horas administrativas',pa>25?'warn':'good',rmPctTxt(d.adm.seg,d.segTot)+' das horas')}
    ${rmKpi(fmtBRL(d.adm.custo),'Custo administrativo',pa>25?'warn':'good',(pa==null?'—':pa+'%')+' do custo do período')}
    ${rmKpi(fmtBRL(d.custoTot-d.adm.custo),'Custo produtivo','',rmH(d.segTot-d.adm.seg))}</div>`;
  return rmBloco('adm', `${kpi}
    <div class="rm-2col"><div>${rmTab([{h:'Tipo administrativo'},{h:'Horas',num:1},{h:'% horas',num:1},{h:'Custo',num:1},{h:'% custo',num:1}],rows)}</div>
    ${d.alvo.length>1?`<div>${rmTab([{h:'Projeto'},{h:'Horas adm.',num:1},{h:'% do projeto',num:1},{h:'Custo adm.',num:1},{h:'% do custo',num:1}],porProj)}</div>`:''}</div>
    ${ctExpl('conta como <b>administrativo</b> o tempo em tipos de ticket de <b>reunião, rotina, ADM, gestão</b> ou marcados como <b>não faturáveis</b> no Jira. Num escopo fechado, é a parte do custo que não vira entrega — acima de ~25% do custo merece olhar. Clique num tipo para ver os tickets.')}`);
}
function rmBlValorVendido(d){
  rmGaranteFichas(d.alvo.map(p=>p.key));
  const rows=d.alvo.map(p=>{ const c=ctContratoDe(p.key); const vh=c?(Number(c.valorHora)||0):0; const hv=c?(Number(c.horasContratadas)||0):0;
    const vend=vh*hv; const f=rmFicha(p.key); const P=d.por[p.key]||{custo:0,seg:0};
    const custoReal=f?(f.esforcoResp||[]).reduce((s,r)=>s+(r.gastoH||0)*ctCustoDe(r.id||''),0):null;
    const mg=custoReal!=null&&vend?vend-custoReal:null; const mgp=vend?rmPct(mg,vend):null; const [rot,cls]=ctSemaforo(mgp);
    return { drill:`pj=${p.key}`, cels:[`<b>${esc(p.nome)}</b> <span class="muted small">${esc(p.key)}</span>`, vend?fmtBRL(vend):'<span class="muted">sem contrato</span>', hv?`${fmtHd(hv)} × ${fmtBRL(vh)}`:'—',
      custoReal==null?(f?'—':'<span class="muted small">lendo ficha…</span>'):fmtBRL(custoReal), fmtBRL(P.custo), mg==null?'—':fmtBRL(mg), mgp==null?'—':`${mgp}%`, vend?rmSem(cls,rot):rmSem('na','sem contrato')] }; });
  return rmBloco('valorVendido', `${rmFichasStatus(d)}
    ${rmTab([{h:'Projeto'},{h:'Valor vendido',num:1,tip:'Horas contratadas × valor-hora (Contratos/Admin)'},{h:'Base',num:1},{h:'Custo realizado (Jira)',num:1,tip:'Tempo gasto por responsável (todo o histórico) × custo/h de cada um'},{h:'Custo no período',num:1},{h:'Margem prevista',num:1},{h:'Margem %',num:1},{h:'Situação'}],rows)}
    ${ctExpl('para escopo fechado o valor é fixo: <b>vendido</b> = horas contratadas × valor-hora do contrato. O <b>custo realizado</b> soma o tempo gasto de cada responsável no Jira (todo o histórico) × custo/h da pessoa — é a melhor aproximação do que o projeto já custou; o <b>custo no período</b> é o que entrou no intervalo escolhido.')}`);
}
function rmContratosAms(d){ return (cfg.contratos||[]).filter(c=>c&&c.tipo==='ams'&&(c.projetos||[]).some(k=>d.keys.has(k))); }
function rmBlAms(d){
  const cs=rmContratosAms(d);
  const franquia=cs.reduce((s,c)=>{ const hc=amsHorasCiclo(c); const cm=amsCicloMeses(c.apuracao||'trimestral'); return s+(hc/(cm||1)); },0);
  const max=Math.max(1,...d.meses.map(mm=>((d.porMes[mm]||{}).seg||0)/3600),franquia);
  const rows=d.meses.map(mm=>{ const M=d.porMes[mm]||{seg:0,segFat:0,tickets:new Set(),pessoas:new Set()}; const h=M.seg/3600, hf=M.segFat/3600; const pc=franquia?rmPct(hf,franquia):null;
    const st=!franquia?'':(pc>100?rmSem('crit','acima da franquia'):(pc>=85?rmSem('aten','perto do teto'):rmSem('ok','dentro')));
    return { drill:`mes=${mm}`, cels:[`<b>${esc(labelMesAbbr(mm))}</b>`, `${fmtHd(h)} ${rmBarra(h,max)}`, fmtHd(hf), fmtHd(h-hf), String(M.tickets.size), M.tickets.size?fmtHd(h/M.tickets.size):'—', franquia?`${fmtHd(franquia)}`:'—', pc==null?'—':`${pc}%`, st] }; });
  const totFat=d.segFat/3600, nMes=d.meses.length;
  const foot=['<b>Total</b>',`<b>${rmH(d.segTot)}</b>`,`<b>${fmtHd(totFat)}</b>`,`<b>${fmtHd((d.segTot-d.segFat)/3600)}</b>`,`<b>${d.tickets.size}</b>`,`<b>${d.tickets.size?fmtHd(d.segTot/3600/d.tickets.size):'—'}</b>`,franquia?`<b>${fmtHd(franquia*nMes)}</b>`:'',`<b>${franquia?rmPctTxt(totFat,franquia*nMes):'—'}</b>`,''];
  const ciclo=cs.map(c=>{ const cyc=amsCicloVigente(c,hojeSP()); const set=new Set(c.projetos||[]);
    let seg=0,segF=0; d.wl.forEach(w=>{ if(!set.has(w.p)) return; const dia=(w.d||'').slice(0,10); if(dia<cyc.start||dia>cyc.end) return; seg+=Number(w.s)||0; if(w.f) segF+=Number(w.s)||0; });
    const hc=amsHorasCiclo(c); const cobre=cyc.start>=estado.metricas.de;
    return `<div class="rm-ciclo"><b>${esc(c.cliente||'AMS')}</b> · ciclo ${esc(amsLabelCiclo(cyc))} (${esc(c.apuracao||'trimestral')}): <b>${fmtHd(segF/3600)}</b> faturáveis de <b>${fmtHd(hc)}</b> contratadas (${rmPctTxt(segF/3600,hc)})${c.bancoHoras?' · banco de horas ativo':''}${cobre?'':' · <span class="muted small">o período escolhido não cobre o ciclo inteiro</span>'} <button class="btn rt-step" data-goto="ams" data-tip="Abrir a tela AMS (ciclos, banco, faturado)">AMS →</button></div>`; }).join('');
  return rmBloco('ams', `${cs.length?ciclo:'<div class="aviso">⚠ Nenhum contrato <b>AMS</b> em Contratos (Admin) aponta para os projetos deste tipo — a tabela mostra as horas sem franquia. Cadastre o contrato (apuração, horas do ciclo) para ver o consumo.</div>'}
    ${rmTab([{h:'Mês'},{h:'Horas',num:1},{h:'Faturáveis',num:1,tip:'Só as faturáveis consomem a franquia'},{h:'Não faturáveis',num:1},{h:'Chamados',num:1},{h:'Média/chamado',num:1},{h:'Franquia mensal',num:1,tip:'Horas do ciclo ÷ meses do ciclo, somando os contratos AMS do tipo'},{h:'Consumo',num:1},{h:'Situação'}],rows,foot)}
    ${ctExpl('a <b>franquia mensal</b> é a fatia do pacote contratado que cabe em cada mês (horas do ciclo ÷ meses da apuração). Só as horas <b>faturáveis</b> consomem o pacote; as não faturáveis (reunião, garantia…) são custo puro. Acima de 85% da franquia, avise o cliente; acima de 100%, é excedente. Clique no mês para ver os chamados.')}`);
}
function rmBlChamados(d){
  const ks=Object.values(d.porTicket).sort((a,b)=>b.seg-a.seg);
  const media=d.tickets.size?d.segTot/d.tickets.size:0;
  const kpi=`<div class="vg-hero rm-hero3">${rmKpi(String(d.tickets.size),'Chamados com horas','',`${d.alvo.length} projeto(s)`)}
    ${rmKpi(fmtHd(media/3600),'Horas médias por chamado','',`${rmH(d.segTot)} no total`)}
    ${rmKpi(fmtBRL(d.tickets.size?d.custoTot/d.tickets.size:0),'Custo médio por chamado','',`${fmtBRL(d.custoTot)} no total`)}</div>`;
  const rows=ks.slice(0,15).map(K=>({ cels:[`<a href="${jiraBase()}/browse/${encodeURIComponent(K.k)}" target="_blank" rel="noopener"><b>${esc(K.k)}</b> ↗</a> <button class="btn rt-step" data-gx-det="${escA(K.k)}" data-tip="Ficha completa">🔍</button>`,
    esc((d.resumos[K.k]||'').slice(0,70)), esc(K.t), rmH(K.seg), fmtBRL(K.custo), esc([...K.pessoas].map(a=>rmNome(d,a).split(' ')[0]).join(', '))] }));
  return rmBloco('chamados', `${kpi}${rmTab([{h:'Chamado'},{h:'Resumo'},{h:'Tipo'},{h:'Horas',num:1},{h:'Custo',num:1},{h:'Quem'}],rows)}
    ${ks.length>15?`<div class="muted small">Mostrando os 15 chamados mais pesados de ${ks.length}.</div>`:''}
    ${ctExpl('quantos chamados receberam horas no período e quanto custa, em média, atender cada um. Os mais pesados aparecem na lista — são os candidatos a causa raiz recorrente ou a escopo mal definido.')}`);
}
function rmBlCausa(d){
  const temC=Object.keys(d.causa).length, temP=Object.keys(d.produto).length;
  if(!temC&&!temP) return rmBloco('causa', `<div class="estado">Os chamados do período não têm <b>causa raiz</b> nem <b>produto</b> preenchidos no Jira — preencha esses campos nos chamados AMS para esta visão ganhar vida.</div>`);
  return rmBloco('causa', `<div class="rm-2col">
    <div><div class="mp-h3">Horas por causa raiz</div>${temC?barlist(d.causa,v=>rmH(v),cores.cerceta,10):'<div class="estado">Sem causa raiz preenchida.</div>'}</div>
    <div><div class="mp-h3">Horas por produto</div>${temP?barlist(d.produto,v=>rmH(v),cores.roxo,10):'<div class="estado">Sem produto preenchido.</div>'}</div></div>
    ${ctExpl('as horas dos chamados somadas pela <b>causa raiz</b> e pelo <b>produto</b> informados no ticket — onde o AMS está gastando de verdade. Uma causa raiz que domina o gráfico é um pedido de melhoria estrutural (e de conversa com o cliente).')}`);
}
function rmBlFila(d){
  const rows=d.alvo.map(p=>{ const c=d.consPor[p.key]; if(!c) return null;
    return { cels:[`<b>${esc(p.nome)}</b> <span class="muted small">${esc(p.key)}</span>`, String(c.total||0), String(c.backlog||0), String(c.emAndamento||0), c.vencidos?`<span class="ct-sem crit">${c.vencidos}</span>`:'0', c.pctConcluido!=null?`${c.pctConcluido}%`:'—', c.saude!=null?`${c.saude}`:'—',
      `<button class="btn rt-step" data-rm-proj-ficha="${escA(p.key)}" data-tip="Abrir a ficha em 📁 Projetos">📁</button>`] }; }).filter(Boolean);
  const m=estado.metricas;
  return rmBloco('fila', `${m.cons&&m.cons.erro?`<div class="aviso">⚠ ${esc(m.cons.erro)}</div>`:''}${!m.cons?'<div class="muted small">⏳ Lendo o consolidado do Jira…</div>':''}
    ${rmTab([{h:'Projeto'},{h:'Tickets',num:1},{h:'Backlog',num:1},{h:'Em andamento',num:1},{h:'Vencidos',num:1},{h:'Concluído',num:1},{h:'Saúde',num:1},{h:''}],rows)}
    ${ctExpl('a fila do AMS direto do Jira (todo o histórico do projeto): o que está no backlog, em andamento e <b>vencido</b>. Vencidos em AMS são SLA em risco — trate na 🚨 Central de Alertas ou na 🛠 Gestão.')}`);
}
function rmBlArq(d){
  const ps=Object.values(d.por).sort((a,b)=>b.seg-a.seg);
  if(!ps.length) return rmBloco('arq', `<div class="aviso ok">✅ Nenhuma hora apontada em projetos arquivados no período — como deve ser.</div>`);
  const rows=ps.map(P=>({ drill:`pj=${P.p}`, cels:[`<b>${esc(rmProjRot(d,P.p))}</b> <span class="muted small">${esc(P.p)}</span>`, rmH(P.seg), fmtBRL(P.custo), String(P.tickets.size), esc([...P.pessoas].map(a=>rmNome(d,a).split(' ')[0]).join(', ')), esc(dataBR(P.ultimo))] }));
  return rmBloco('arq', `<div class="aviso">⚠ <b>${rmH(d.segTot)}</b> (${fmtBRL(d.custoTot)}) foram apontadas em projetos <b>arquivados</b> neste período. Ou o projeto voltou à ativa (mude a categoria no Jira) ou as horas estão no lugar errado — abra os tickets e corrija.</div>
    ${rmTab([{h:'Projeto arquivado'},{h:'Horas',num:1},{h:'Custo',num:1},{h:'Tickets',num:1},{h:'Quem'},{h:'Último apontamento',num:1}],rows)}
    ${ctExpl('projeto arquivado não deveria receber horas. Quando recebe, ou é apontamento no ticket errado (corrija pelo drill: ficha, status, Gestão, Rateio) ou o projeto precisa sair da categoria de arquivados.')}`);
}
function rmBlArqAbertos(d){
  const m=estado.metricas; rmGaranteAbertos();
  if(m.abertosErro) return rmBloco('arqAbertos', `<div class="aviso">⚠ ${esc(m.abertosErro)} <button class="btn" data-rm-abertos-retry="1">Tentar de novo</button></div>`);
  if(!m.abertos) return rmBloco('arqAbertos', '<div class="muted small">⏳ Lendo os tickets abertos do Jira…</div>');
  const hoje=hojeSP(); const porP={};
  (m.abertos.tickets||[]).forEach(t=>{ const pm=d.mapa[t.p]; if(!pm||pm.sigla!=='ARQ') return;
    const P=porP[t.p]=porP[t.p]||{p:t.p,n:0,venc:0,seg:0,keys:[]}; P.n++; if(t.venc&&t.venc<hoje) P.venc++; P.seg+=Number(t.seg)||0; P.keys.push(t.k); });
  const ps=Object.values(porP).sort((a,b)=>b.n-a.n);
  if(!ps.length) return rmBloco('arqAbertos', `<div class="aviso ok">✅ Nenhum ticket aberto nos projetos arquivados${m.abertos.meta&&m.abertos.meta.truncado?' (lista do Jira truncada — confira na 🛠 Gestão)':''}.</div>`);
  const rows=ps.map(P=>({ cels:[`<b>${esc(rmProjRot(d,P.p))}</b> <span class="muted small">${esc(P.p)}</span>`, String(P.n), P.venc?`<span class="ct-sem crit">${P.venc}</span>`:'0', rmH(P.seg),
    `<button class="btn rt-step" data-ct-gestao="${escA(P.keys.slice(0,200).join(','))}" data-tip="Abrir a 🛠 Gestão só com estes tickets (fechar, cancelar ou mover em massa)">🛠 Gestão</button>`] }));
  const todos=ps.flatMap(P=>P.keys);
  return rmBloco('arqAbertos', `<div class="aviso">⚠ <b>${todos.length} ticket(s)</b> continuam abertos em projetos arquivados${m.abertos.meta&&m.abertos.meta.truncado?' (lista do Jira truncada)':''}.</div>
    ${rmTab([{h:'Projeto arquivado'},{h:'Abertos',num:1},{h:'Vencidos',num:1},{h:'Horas já gastas',num:1},{h:''}],rows)}
    ${todos.length>1?`<button class="btn" data-ct-gestao="${escA(todos.slice(0,200).join(','))}">🛠 Abrir todos na Gestão (${Math.min(todos.length,200)})</button>`:''}
    ${ctExpl('tickets que continuam abertos em projetos arquivados poluem alertas, ranking e prioridades. Feche, cancele ou mova — a 🛠 Gestão faz isso em massa.')}`);
}
function rmBacklogItens(d){
  const out=[]; const custoMedio=d.segTot?d.custoTot/(d.segTot/3600):Math.max(0,Number((cfg.ctrl||{}).custoPadrao)||0);
  d.alvo.slice(0,RM_MAX_FICHAS).forEach(p=>{ const f=rmFicha(p.key); if(!f) return;
    const idDe={}; (f.esforcoResp||[]).forEach(r=>{ if(r.id) idDe[r.nome]=r.id; });
    (f.itens||[]).forEach(i=>{ if(!projAberto(i)||i.ep) return; const a=idDe[i.r]||''; const ch=a?ctCustoDe(a):custoMedio;
      const rest=Math.max(0,(i.eH||0)-(i.gH||0)); out.push({...i, p:p.key, a, rest, custo:rest*ch, custoEst:(i.eH||0)*ch}); }); });
  return out;
}
function rmBlBacklog(d){
  rmGaranteFichas(d.alvo.map(p=>p.key));
  const its=rmBacklogItens(d); const temFicha=d.alvo.slice(0,RM_MAX_FICHAS).some(p=>rmFicha(p.key));
  const est=its.reduce((s,i)=>s+(i.eH||0),0), rest=its.reduce((s,i)=>s+i.rest,0), custo=its.reduce((s,i)=>s+i.custo,0), semEst=its.filter(i=>!(i.eH>0)).length;
  const kpi=`<div class="vg-hero rm-hero4">${rmKpi(String(its.length),'Tickets abertos','',`${semEst} sem estimativa`)}
    ${rmKpi(fmtHd(est),'Backlog em horas (estimado)','',`${fmtHd(rest)} ainda por fazer`)}
    ${rmKpi(fmtBRL(custo),'Custo do backlog',custo>0?'warn':'',`horas restantes × custo/h do responsável`)}
    ${rmKpi(d.segTot?(Math.round(rest/(d.segTot/3600/Math.max(1,d.meses.length))*10)/10).toLocaleString('pt-BR')+' meses':'—','Prazo no ritmo atual','',`ritmo de ${fmtHd(d.segTot/3600/Math.max(1,d.meses.length))}/mês`)}</div>`;
  const porProj={}; its.forEach(i=>{ const P=porProj[i.p]=porProj[i.p]||{p:i.p,n:0,semEst:0,est:0,rest:0,custo:0}; P.n++; if(!(i.eH>0)) P.semEst++; P.est+=i.eH||0; P.rest+=i.rest; P.custo+=i.custo; });
  const rowsP=Object.values(porProj).sort((a,b)=>b.custo-a.custo).map(P=>({ drill:`bl=pj:${P.p}`, cels:[`<b>${esc(rmProjRot(d,P.p))}</b> <span class="muted small">${esc(P.p)}</span>`, String(P.n), String(P.semEst), fmtHd(P.est), fmtHd(P.rest), fmtBRL(P.custo)] }));
  const porEp={}; its.forEach(i=>{ const e=i.e||''; const E=porEp[e]=porEp[e]||{e,n:0,est:0,rest:0,custo:0}; E.n++; E.est+=i.eH||0; E.rest+=i.rest; E.custo+=i.custo; });
  const rowsE=Object.values(porEp).sort((a,b)=>b.custo-a.custo||b.n-a.n).slice(0,20).map(E=>({ drill:`bl=e:${E.e}`, cels:[E.e?`<b>${esc(E.e)}</b> <span class="muted small">${esc(rmEpicoRot(d,E.e).replace(E.e+' · ','').slice(0,50))}</span>`:'<b>Sem épico</b>', String(E.n), fmtHd(E.est), fmtHd(E.rest), fmtBRL(E.custo)] }));
  return rmBloco('backlog', `${rmFichasStatus(d)}${temFicha?kpi:''}
    <div class="rm-2col"><div>${rmTab([{h:'Projeto'},{h:'Abertos',num:1},{h:'Sem estimativa',num:1},{h:'Estimado',num:1},{h:'Restante',num:1},{h:'Custo',num:1}],rowsP)}</div>
    <div>${rmTab([{h:'Épico'},{h:'Abertos',num:1},{h:'Estimado',num:1},{h:'Restante',num:1},{h:'Custo',num:1}],rowsE)}</div></div>
    ${ctExpl('<b>backlog em horas</b> = soma das estimativas dos tickets abertos (Jira); <b>restante</b> desconta o que já foi gasto neles; <b>custo do backlog</b> = restante × custo/h do responsável (sem responsável, o custo médio do tipo). Tickets <b>sem estimativa</b> não entram na conta — estime-os para o número ficar honesto. Clique numa linha para ver os tickets.')}`);
}
function rmBlEpicosCusto(d){
  rmGaranteFichas(d.alvo.map(p=>p.key));
  const ls=rmEpicosLinhas(d).filter(L=>L.seg>0||L.estH>0||L.gastoH>0).sort((a,b)=>b.custo-a.custo||b.seg-a.seg);
  const max=Math.max(1,...ls.map(L=>L.custo||L.seg/3600));
  const rows=ls.map(L=>({ drill:`e=${L.e}`, cels:[`${L.e?`<a href="${jiraBase()}/browse/${encodeURIComponent(L.e)}" target="_blank" rel="noopener"><b>${esc(L.e)}</b> ↗</a> `:'<b>Sem épico</b> '}<span class="muted small">${esc(L.resumo.slice(0,55))}</span>`,
    esc(d.alvo.length>1?rmProjRot(d,L.p):''), rmH(L.seg), rmPctTxt(L.seg,d.segTot), `${fmtBRL(L.custo)} ${rmBarra(L.custo||L.seg/3600,max)}`, rmPctTxt(L.custo,d.custoTot), String(L.pessoas.size), L.estH?fmtHd(L.estH):'—', L.gastoH?fmtHd(L.gastoH):'—', L.estH?rmPctTxt(L.gastoH,L.estH):'—'] }));
  const foot=['<b>Total</b>','',`<b>${rmH(d.segTot)}</b>`,'',`<b>${fmtBRL(d.custoTot)}</b>`,'',`<b>${d.pessoas.size}</b>`,'','',''];
  const pares=ls.filter(L=>L.custo>0).slice(0,10).map(L=>[L.e||'Sem épico',Math.round(L.custo),`e=${L.e}`]);
  return rmBloco('epicosCusto', `${rmFichasStatus(d)}
    ${pares.length?projBars(pares,cores.cerceta,'data-rm-drill',v=>fmtBRL(v)):''}
    ${rmTab([{h:'Épico'},{h:'Projeto'},{h:'Horas no período',num:1},{h:'% horas',num:1},{h:'Custo no período',num:1},{h:'% custo',num:1},{h:'Pessoas',num:1},{h:'Estimado (Jira)',num:1},{h:'Gasto (Jira)',num:1},{h:'Execução',num:1}],rows,foot)}
    ${ctExpl('o que cada <b>épico</b> custou no período (horas de cada pessoa × custo/h dela) e como isso se compara ao <b>estimado × gasto</b> do Jira (todo o histórico). Épicos sem estimativa não têm "execução" — estime para acompanhar. Clique para ver os tickets.')}`);
}
function rmBlEvolucao(d){
  let acumH=0, acumC=0;
  const rows=d.meses.map(mm=>{ const M=d.porMes[mm]||{seg:0,custo:0,tickets:new Set(),pessoas:new Set()}; acumH+=M.seg/3600; acumC+=M.custo;
    return { drill:`mes=${mm}`, cels:[`<b>${esc(labelMesAbbr(mm))}</b>`, rmH(M.seg), fmtBRL(M.custo), String(M.tickets.size), String(M.pessoas.size), fmtHd(acumH), fmtBRL(acumC)] }; });
  const sems=Object.keys(d.porSem).sort();
  let ac=0; const serieMes=[{nome:'Horas no mês',cor:cores.cerceta,vals:d.meses.map(mm=>({x:mm,v:Math.round(((d.porMes[mm]||{}).seg||0)/360)/10})),tipo:'area'}];
  const serieAc=[{nome:'Acumulado',cor:cores.roxo,vals:d.meses.map(mm=>{ ac+=((d.porMes[mm]||{}).seg||0)/3600; return {x:mm,v:Math.round(ac*10)/10}; }),tipo:'line'}];
  const serieSem=[{nome:'Horas na semana',cor:cores.musgo,vals:sems.map(w=>({x:w,v:Math.round((d.porSem[w].seg||0)/360)/10})),tipo:'area'}];
  const media=sems.length?d.segTot/3600/sems.length:0;
  return rmBloco('evolucao', `<div class="rm-2col">
    <div><div class="mp-h3">Por mês</div>${tsChart(serieMes,{fmt:v=>fmtHd(v),xlabel:x=>labelMesAbbr(x),h:180})}</div>
    <div><div class="mp-h3">Acumulado</div>${tsChart(serieAc,{fmt:v=>fmtHd(v),xlabel:x=>labelMesAbbr(x),h:180})}</div></div>
    <div class="mp-h3" style="margin-top:8px">Por semana <span class="mp-dim">média de ${fmtHd(media)} por semana · ${sems.length} semana(s)</span></div>
    ${tsChart(serieSem,{fmt:v=>fmtHd(v),xlabel:x=>rmSemRot(x),h:150,metaY:media?{v:Math.round(media*10)/10}:null})}
    ${rmTab([{h:'Mês'},{h:'Horas',num:1},{h:'Custo',num:1},{h:'Tickets',num:1},{h:'Pessoas',num:1},{h:'Acumulado (h)',num:1},{h:'Acumulado (R$)',num:1}],rows)}
    ${ctExpl('as horas gastas nos projetos deste tipo por <b>mês</b>, por <b>semana</b> (a linha tracejada é a média semanal) e o <b>acumulado</b> do período com o custo correspondente. Clique no mês para ver os tickets.')}`);
}
function rmBlDepto(d){
  const temDepto=Object.values(d.porPessoa).some(u=>u.depto);
  const ds=Object.values(d.porDepto).sort((a,b)=>b.custo-a.custo||b.seg-a.seg);
  const max=Math.max(1,...ds.map(D=>D.custo||D.seg/3600));
  const rows=ds.map(D=>({ drill:`depto=${D.d}`, cels:[`<b>${esc(D.d||'Sem departamento')}</b>`, String(D.pessoas.size), rmH(D.seg), rmPctTxt(D.seg,d.segTot), `${fmtBRL(D.custo)} ${rmBarra(D.custo||D.seg/3600,max)}`, rmPctTxt(D.custo,d.custoTot), fmtBRL(D.seg?D.custo/(D.seg/3600):0)] }));
  const foot=['<b>Total</b>',`<b>${d.pessoas.size}</b>`,`<b>${rmH(d.segTot)}</b>`,'',`<b>${fmtBRL(d.custoTot)}</b>`,'',`<b>${fmtBRL(d.segTot?d.custoTot/(d.segTot/3600):0)}</b>`];
  const porProj=d.alvo.map(p=>{ const P=d.por[p.key]; if(!P||!P.seg) return null; return [p.nome,Math.round(P.custo),`pj=${p.key}`]; }).filter(Boolean).sort((a,b)=>b[1]-a[1]).slice(0,10);
  return rmBloco('depto', `${temDepto?'':rmAvisoPerfis(d,'departamento')}
    ${rmTab([{h:'Departamento'},{h:'Pessoas',num:1},{h:'Horas',num:1},{h:'% horas',num:1},{h:'Custo',num:1},{h:'% custo',num:1},{h:'Custo/h médio',num:1}],rows,foot)}
    ${porProj.length>1?`<div class="mp-h3" style="margin-top:10px">Custo por projeto/rotina</div>${projBars(porProj,cores.roxo,'data-rm-drill',v=>fmtBRL(v))}`:''}
    ${ctExpl('as horas das rotinas internas somadas pelo <b>departamento de quem apontou</b> (⚙️ Perfis) × custo/h de cada pessoa — quanto cada área custa em tarefas, processos e rotinas. "Sem departamento" são pessoas ainda sem cadastro. Clique para ver os tickets.')}`);
}
function rmBlCarga(d){
  const m=estado.metricas; const id=(typeof idApontar==='function')?idApontar():null;
  if(!id) return rmBloco('carga', `<div class="aviso">🔐 A carga de trabalho lê o <b>Meu Planejamento</b> de todo o time e precisa da sua identidade do Jira (e-mail + token de API) — configure em <b>⏱ Apontar → identifique-se</b> e volte aqui. <button class="btn" data-goto="apontar">⏱ Apontar</button></div>`);
  rmGarantePlan();
  if(m.planErro) return rmBloco('carga', `<div class="aviso">⚠ ${esc(m.planErro)} <button class="btn" data-rm-plan-retry="1">Tentar de novo</button></div>`);
  if(!m.plan||m.planChave!==`${semChave(m.de)}|${semChave(m.ate)}`) return rmBloco('carga', '<div class="muted small">⏳ Lendo os planejamentos do time…</div>');
  const ini=mpInicioVig(); let planos=mpPlanosVigentes(m.plan); if(ini) planos=planos.filter(p=>(p.semana||'')>=ini);
  const sems=[]; { let w=semChave(m.de); const fim=semChave(m.ate); let g=0; while(w<=fim&&g++<60){ sems.push(w); w=mtsSoma(w,7); } }
  const por={}; const porSem={}; sems.forEach(w=>{ porSem[w]={planT:0,planTipo:0,real:0}; });
  planos.forEach(p=>{ const U=por[p.accountId]=por[p.accountId]||{a:p.accountId,nome:p.nome,planT:0,planTipo:0,real:0,cap:0,semanas:new Set()};
    (p.itens||[]).forEach(i=>{ const h=Number(i.horas)||0; U.planT+=h; if(d.keys.has(i.projeto)) U.planTipo+=h; U.semanas.add(p.semana);
      if(porSem[p.semana]){ porSem[p.semana].planT+=h; if(d.keys.has(i.projeto)) porSem[p.semana].planTipo+=h; } }); });
  Object.values(d.porPessoa).forEach(u=>{ const U=por[u.a]=por[u.a]||{a:u.a,nome:rmNome(d,u.a),planT:0,planTipo:0,real:0,cap:0,semanas:new Set()}; U.real+=u.seg/3600; });
  d.wl.forEach(w=>{ const sk=w.d?semChave(w.d.slice(0,10)):''; if(porSem[sk]) porSem[sk].real+=(Number(w.s)||0)/3600; });
  Object.values(por).forEach(U=>{ U.cap=sems.reduce((s,w)=>s+mpCapSem(U.a,w),0); });
  const us=Object.values(por).sort((a,b)=>(b.planT/(b.cap||1))-(a.planT/(a.cap||1)));
  const rows=us.map(U=>{ const carga=rmPct(U.planT,U.cap); const st=carga==null?rmSem('na','sem capacidade'):(carga>100?rmSem('crit','sobrecarga'):(carga>=85?rmSem('aten','cheia'):(carga<50?rmSem('na','ociosa'):rmSem('ok','equilibrada'))));
    return { drill:`a=${U.a}`, cels:[`<b>${esc(U.nome)}</b>`, esc(rmDepto(U.a)||'—'), fmtHd(U.planTipo), fmtHd(U.planT), fmtHd(U.cap), `${carga==null?'—':carga+'%'} ${rmBarra(Math.min(carga||0,120),120,carga>100?'var(--err)':(carga>=85?'var(--amarelo)':'var(--musgo)'))}`, fmtHd(U.real), rmPctTxt(U.real,U.planTipo), st] }; });
  const cols=sems.map(w=>[`${rmSemRot(w)} · ${dataBR(w)}`,{plan:porSem[w].planTipo,real:porSem[w].real},rmSemRot(w)]);
  return rmBloco('carga', `${rmTab([{h:'Pessoa'},{h:'Departamento'},{h:'Planejado neste tipo',num:1,tip:'Horas planejadas nos projetos deste tipo (Meu Planejamento)'},{h:'Planejado total',num:1,tip:'Tudo o que a pessoa planejou nas semanas do período'},{h:'Capacidade',num:1},{h:'Carga',num:1,tip:'Planejado total ÷ capacidade'},{h:'Realizado neste tipo',num:1},{h:'Execução',num:1},{h:'Situação'}],rows)}
    ${cols.length?mpgColunas('Planejado × realizado por semana (neste tipo de projeto)',`${sems.length} semana(s) · ${planos.length} planejamento(s) vigente(s)`,cols):''}
    ${ctExpl('a <b>carga</b> de cada pessoa é o que ela planejou (todas as atividades) sobre a <b>capacidade</b> (meta/dia × dias úteis − ausências). Acima de 100% = sobrecarga; abaixo de 50% = sobra. "Neste tipo" isola o que foi planejado e realizado nas rotinas internas. Só planejamentos vigentes (última versão) entram.')}`);
}
function rmBlTipos(d){
  const ts=Object.values(d.porTipo).sort((a,b)=>b.seg-a.seg); const max=Math.max(1,...ts.map(T=>T.seg));
  const rows=ts.map(T=>({ drill:`tipo=${T.t}`, cels:[`<b>${esc(T.t)}</b>${T.adm?' <span class="muted small">adm.</span>':''}`, `${rmH(T.seg)} ${rmBarra(T.seg,max,cores.musgo)}`, rmPctTxt(T.seg,d.segTot), fmtBRL(T.custo)] }));
  return rmBloco('tipos', `${rmTab([{h:'Tipo'},{h:'Horas',num:1},{h:'% horas',num:1},{h:'Custo',num:1}],rows)}
    ${ctExpl('as horas das rotinas por <b>tipo de ticket</b> — mostra em que espécie de tarefa interna o tempo está indo. Clique para ver os tickets.')}`);
}
const RM_RENDER={ horasMes:rmBlHorasMes, senior:rmBlSenior, epicos:rmBlEpicos, concluidas:rmBlConcluidas, rentab:rmBlRentab, pessoas:rmBlPessoas,
  vendidas:rmBlVendidas, adm:rmBlAdm, valorVendido:rmBlValorVendido, ams:rmBlAms, chamados:rmBlChamados, causa:rmBlCausa, fila:rmBlFila,
  arq:rmBlArq, arqAbertos:rmBlArqAbertos, backlog:rmBlBacklog, epicosCusto:rmBlEpicosCusto, evolucao:rmBlEvolucao, depto:rmBlDepto, carga:rmBlCarga, tipos:rmBlTipos };

// ---- abas Métricas ⇄ Catálogo (as duas telas se apresentam como uma só) ----
function rmAbasHTML(ativa, sigla){
  return `<div class="proj-tabs rm-abas">
    <button class="chip ${ativa==='metricas'?'on':''}" data-rm-abrir="${escA(sigla||'')}" data-tip="As métricas de cada tipo de projeto, com os dados do período">📈 Métricas por tipo</button>
    <button class="chip ${ativa==='catalogo'?'on':''}" data-rc-abrir="${escA(sigla||'')}" data-tip="O catálogo oficial de relatórios (O/R por tipo) e a matriz configurável">📚 Catálogo de relatórios</button></div>`;
}

function renderMetricas(){
  const cont=document.getElementById('conteudo');
  const m=estado.metricas;
  rmGarante();
  const d=rmDados();
  const filtrosPer=`<div class="campo"><label>De</label><input type="date" id="rm-de" value="${escA(m.de||'')}"></div>
    <div class="campo"><label>Até</label><input type="date" id="rm-ate" value="${escA(m.ate||'')}"></div>
    <div class="campo"><label>Atalhos</label><div class="ap-chips">
      <button class="chip" data-rm-per="mes">Este mês</button><button class="chip" data-rm-per="3m">3 meses</button>
      <button class="chip" data-rm-per="6m">6 meses</button><button class="chip" data-rm-per="12m">12 meses</button><button class="chip" data-rm-per="ano">Este ano</button></div></div>`;
  if(!d){
    cont.replaceChildren(el(`<div>${rmAbasHTML('metricas',m.sigla)}<div class="card full"><h2>📈 Métricas por tipo de projeto <span>as visões de cada categoria, com os dados do período</span></h2>
      <div class="ap-filtros">${filtrosPer}</div>
      ${m.tempoErro?`<div class="erro">${esc(m.tempoErro)} <button class="btn" id="rm-retry">Tentar de novo</button></div>`:skeletonPainel()}</div></div>`));
    return;
  }
  const gestor=souAprovador();
  const chips=`<div class="ap-chips rc-chips">${REL_SIGLAS.map(s=>`<button class="chip ${d.sigla===s?'on':''}" data-rm-sig="${s}"
      data-tip="${escA(REL_SIGLA_NOME[s]+(d.siglas[s].length?` — ${d.siglas[s].length} projeto(s): `+d.siglas[s].slice(0,6).map(p=>p.key).join(', ')+(d.siglas[s].length>6?'…':''):' — sem projetos'))}">${s}${d.siglas[s].length?` <span class="rc-n">${d.siglas[s].length}</span>`:''}</button>`).join('')}</div>`;
  const selProj=`<select id="rm-proj"><option value="">Todos os projetos do tipo (${d.projs.length})</option>${d.projs.map(p=>`<option value="${escA(p.key)}" ${m.proj===p.key?'selected':''}>${esc(p.nome)} (${esc(p.key)})</option>`).join('')}</select>`;
  const filtros=`<div class="ap-filtros">
    <div class="campo"><label>Tipo de projeto</label>${chips}</div>
    <div class="campo"><label>Projeto</label>${selProj}</div>
    ${filtrosPer}
    <div class="campo"><label>&nbsp;</label><div style="display:flex;gap:6px"><button class="btn" data-rm-perfis="1" data-tip="${escA(gestor?'Nível (júnior/pleno/sênior) e departamento de cada pessoa — vale para o time todo':'Ver os níveis e departamentos cadastrados (gestores editam)')}">⚙️ Perfis</button>
      <button class="btn" data-rm-csv="1" data-tip="Baixa as tabelas deste tipo em CSV">⬇ CSV</button></div></div></div>`;
  const mg=d.recTot-d.custoTot; const mgp=d.recTot>0?rmPct(mg,d.recTot):null; const [mgRot,mgCls]=ctSemaforo(mgp);
  const nProjH=Object.keys(d.por).length;
  const hero=`<div class="vg-hero">
    ${rmKpi(rmH(d.segTot),'Horas no período','',`${rmPctTxt(d.segFat,d.segTot)} faturáveis`)}
    ${rmKpi(fmtBRL(d.custoTot),'Custo','',`${d.pessoas.size} pessoa(s)${d.semCusto.size?` · ${d.semCusto.size} sem custo/h`:''}`)}
    ${rmKpi(d.temContrato?fmtBRL(d.recTot):'—','Receita','',d.temContrato?'horas faturáveis × valor-hora':'sem contrato com valor-hora')}
    ${rmKpi(mgp==null?'—':`${mgp}%`,'Margem',mgp==null?'':(mgCls==='ok'?'good':(mgCls==='aten'?'warn':'bad')),mgp==null?'—':`${fmtBRL(mg)} · ${mgRot}`)}
    ${rmKpi(`${nProjH}<span class="muted small">/${d.projs.length}</span>`,'Projetos com horas','',m.proj?'filtrando 1 projeto':`${REL_SIGLA_NOME[d.sigla]||d.sigla}`)}
    ${rmKpi(String(d.tickets.size),'Tickets com horas','',`${d.meses.length} mês(es) · ${dataBR(m.de)} → ${dataBR(m.ate)}`)}</div>`;
  const blocos=(RM_BLOCOS[d.sigla]||['evolucao','pessoas']).map(id=>{ try{ return RM_RENDER[id](d); }catch(e){ console.error('bloco',id,e); return rmBloco(id,`<div class="erro">Não consegui montar este bloco: ${esc(e.message||e)}</div>`); } }).join('');
  const semHoras=!d.wl.length?`<div class="estado">Nenhuma hora apontada nos projetos <b>${esc(REL_SIGLA_NOME[d.sigla]||d.sigla)}</b>${m.proj?` (${esc(m.proj)})`:''} entre ${dataBR(m.de)} e ${dataBR(m.ate)}. ${d.projs.length?'Amplie o período ou escolha outro tipo.':'Nenhum projeto do Jira está nesta categoria — confira o prefixo da categoria (ex.: "DEA | …").'}</div>`:'';
  cont.replaceChildren(el(`<div>${rmAbasHTML('metricas',d.sigla)}
    <div class="card full"><h2>📈 Métricas — ${esc(REL_SIGLA_NOME[d.sigla]||d.sigla)} <span>${d.sigla} · ${m.proj?esc(rmProjRot(d,m.proj)):`${d.projs.length} projeto(s)`} · ${dataBR(m.de)} → ${dataBR(m.ate)}</span></h2>
      ${filtros}${hero}${semHoras}${blocos}</div></div>`));
}

// ---- drill: tickets por trás do número (com ações) ----
function rmAbreTickets(qs){
  const d=rmDados(); if(!d) return;
  const f=new URLSearchParams(qs||'');
  const bl=f.get('bl')||'';
  if(bl){   // backlog (itens abertos das fichas) — bl=pj:KEY | bl=e:EPICO
    const [tipo,val]=bl.split(':'); const its=rmBacklogItens(d).filter(i=>tipo==='pj'?i.p===val:(i.e||'')===(val||''));
    projDrillItens(`📦 Backlog — ${esc(tipo==='pj'?rmProjRot(d,val):(val?rmEpicoRot(d,val):'Sem épico'))}`,`${fmtHd(its.reduce((s,i)=>s+i.rest,0))} restantes · ${fmtBRL(its.reduce((s,i)=>s+i.custo,0))}`,its);
    return;
  }
  const pj=f.get('pj')||'', mes=f.get('mes')||'', tipo=f.get('tipo')||'', ac=f.get('a')||'', ep=f.has('e')?(f.get('e')||''):null, adm=f.get('adm')==='1', depto=f.has('depto')?(f.get('depto')||''):null;
  const por={};
  d.wl.forEach(w=>{
    if(pj&&w.p!==pj) return; if(mes&&(w.d||'').slice(0,7)!==mes) return; if(tipo&&(w.t||'—')!==tipo) return; if(ac&&w.a!==ac) return;
    if(ep!==null&&(w.e||'')!==ep) return; if(adm&&!rmEhAdm(w)) return; if(depto!==null&&(rmDepto(w.a)||'')!==depto) return;
    const k=w.k||'(sem ticket)'; const r=por[k]=por[k]||{k,p:w.p,t:w.t||'—',seg:0,custo:0,quem:new Set()};
    r.seg+=Number(w.s)||0; r.custo+=((Number(w.s)||0)/3600)*ctCustoDe(w.a); r.quem.add(w.a); });
  const lista=Object.values(por).sort((a,b)=>b.seg-a.seg);
  const keys=lista.map(x=>x.k).filter(k=>/^[A-Z][A-Z0-9_]*-\d+$/.test(k));
  const tit=[pj?rmProjRot(d,pj):'',mes?labelMesAbbr(mes):'',tipo,ac?rmNome(d,ac):'',ep!==null?(ep?rmEpicoRot(d,ep):'sem épico'):'',adm?'administrativo':'',depto!==null?(depto||'sem departamento'):''].filter(Boolean).join(' · ')||`todo o tipo ${d.sigla}`;
  const rows=lista.slice(0,120).map(x=>`<tr>
    <td>${/^[A-Z]/.test(x.k)?`<a href="${jiraBase()}/browse/${encodeURIComponent(x.k)}" target="_blank" rel="noopener"><strong>${esc(x.k)}</strong> ↗</a>`:esc(x.k)}</td>
    <td>${esc((d.resumos[x.k]||'').slice(0,70))}</td><td>${esc(rmProjRot(d,x.p))}</td><td>${esc(x.t)}</td>
    <td class="num">${fmtH(x.seg)}</td><td class="num">${fmtBRL(x.custo)}</td>
    <td>${esc([...x.quem].map(a=>rmNome(d,a).split(' ')[0]).join(', ').slice(0,60))}</td>
    <td>${/^[A-Z]/.test(x.k)?`<button class="btn rt-step" data-gx-det="${escA(x.k)}" data-tip="Ficha completa">🔍</button>
      <button class="btn rt-step" data-gx-st="${escA(x.k)}" data-tip="Alterar o status">🔁</button>`:''}</td></tr>`).join('');
  abreModal(`<h2>🎫 Tickets — ${esc(tit)} <span class="muted small">${lista.length} ticket(s) · ${esc(dataBR(estado.metricas.de))} → ${esc(dataBR(estado.metricas.ate))}</span></h2>
    <div class="scroll-x" style="max-height:56vh;overflow:auto"><table class="mp-tab-mini"><thead><tr><th>Ticket</th><th>Resumo</th><th>Projeto</th><th>Tipo</th><th class="num">Horas</th><th class="num">Custo</th><th>Quem</th><th></th></tr></thead>
    <tbody>${rows||'<tr><td colspan="8" class="mp-dim">Nada aqui.</td></tr>'}</tbody></table></div>
    ${lista.length>120?`<div class="muted small" style="margin-top:4px">Mostrando os 120 maiores de ${lista.length} tickets.</div>`:''}
    <div class="alx-modal-acoes">
      ${keys.length?`<button class="btn" data-ct-gestao="${escA(keys.slice(0,200).join(','))}">🛠 Abrir na Gestão (${Math.min(keys.length,200)}${keys.length>200?` de ${keys.length}`:''})</button>
      <button class="btn" data-ct-rateio="${escA(keys.slice(0,100).join(','))}">➗ Enviar para o Rateio${keys.length>100?` (100 de ${keys.length})`:''}</button>`:''}
      <button class="btn" id="gx-fechar">Fechar</button></div>`);
}

// ---- ⚙️ Perfis: nível e departamento por pessoa (config compartilhada; gestores editam) ----
function rmAbrePerfis(){
  const gestor=souAprovador();
  const pessoas=pessoasUnidas(); const d=rmDados();
  if(d) Object.keys(d.porPessoa).forEach(a=>{ if(!pessoas[a]) pessoas[a]={nome:rmNome(d,a)}; });
  const ocultos=new Set((cfg.ocultos||[]).map(o=>o&&o.a).filter(Boolean));
  const lista=Object.entries(pessoas).filter(([a,p])=>!ocultos.has(a)&&!RE_EXCLUIR.test((p&&p.nome)||'')).sort((a,b)=>((a[1]&&a[1].nome)||'').localeCompare((b[1]&&b[1].nome)||'','pt'));
  const deptos=rmDeptos();
  const rows=lista.map(([a,p])=>{ const pf=rmPerfil(a);
    return `<tr><td><b>${esc((p&&p.nome)||a)}</b>${(cfg.custosPessoa||{})[a]?'':' <span class="muted small" data-tip="Sem custo/h — cadastre na 🏦 Controladoria (⚙️)">sem custo/h</span>'}</td>
      <td><select data-rm-nivel="${escA(a)}" ${gestor?'':'disabled'}><option value="">— sem nível —</option>${RM_NIVEIS.map(([k,r])=>`<option value="${k}" ${pf.nivel===k?'selected':''}>${r}</option>`).join('')}</select></td>
      <td><input type="text" list="rm-deptos" data-rm-depto="${escA(a)}" value="${escA(pf.depto||'')}" placeholder="ex.: Consultoria SAP" maxlength="60" ${gestor?'':'disabled'}></td></tr>`; }).join('');
  abreModal(`<h2>⚙️ Perfis do time <span class="muted small">nível e departamento — ${gestor?'vale para o time todo':'somente gestores editam'}</span></h2>
    <div class="ct-expl">ℹ️ O <b>nível</b> alimenta "horas do Sênior" e "% de tarefas concluídas por Júnior/Pleno" (escopo aberto); o <b>departamento</b> alimenta "custo por departamento" (rotinas internas). Salva sozinho ao alterar.</div>
    <datalist id="rm-deptos">${deptos.map(x=>`<option value="${escA(x)}">`).join('')}</datalist>
    <div class="scroll-x" style="max-height:56vh;overflow:auto"><table class="mp-tab-mini"><thead><tr><th>Pessoa</th><th>Nível</th><th>Departamento</th></tr></thead>
    <tbody>${rows||'<tr><td colspan="3" class="mp-dim">Nenhuma pessoa carregada ainda.</td></tr>'}</tbody></table></div>
    <div class="alx-modal-acoes"><button class="btn" id="gx-fechar">Fechar</button></div>`);
}

// ---- CSV do tipo ativo (mensal, por projeto, por pessoa, por épico) ----
function rmExportaCSV(){
  const d=rmDados(); if(!d){ toast('Aguarde os dados carregarem.','warn'); return; }
  const m=estado.metricas; const per=`${m.de}_${m.ate}`;
  const linhas=[['Tipo','Bloco','Chave','Nome','Horas (h)','Faturáveis (h)','Custo (R$)','Receita (R$)','Extra']];
  d.meses.forEach(mm=>{ const M=d.porMes[mm]||{seg:0,segFat:0,custo:0,rec:0,nivel:{senior:0}}; linhas.push([d.sigla,'Mês',mm,labelMesAbbr(mm),dec(M.seg),dec(M.segFat),M.custo.toFixed(2),M.rec.toFixed(2),`equipe ${(d.equipe[mm]||0).toFixed(2)}h · capacidade ${(d.cap[mm]||0).toFixed(2)}h · sênior ${dec(M.nivel.senior)}h`]); });
  Object.values(d.por).forEach(P=>{ linhas.push([d.sigla,'Projeto',P.p,rmProjRot(d,P.p),dec(P.seg),dec(P.segFat),P.custo.toFixed(2),P.rec.toFixed(2),`adm ${dec(P.admSeg)}h · ${P.pessoas.size} pessoa(s) · ${P.tickets.size} ticket(s)`]); });
  Object.values(d.porPessoa).forEach(U=>{ linhas.push([d.sigla,'Pessoa',U.a,rmNome(d,U.a),dec(U.seg),'',U.custo.toFixed(2),'',`${RM_NIVEL_ROT[U.nivel]} · ${U.depto||'sem departamento'}`]); });
  rmEpicosLinhas(d).forEach(L=>{ linhas.push([d.sigla,'Épico',L.e||'(sem épico)',L.resumo,dec(L.seg),'',L.custo.toFixed(2),'',`estimado ${(L.estH||0).toFixed(1)}h · gasto Jira ${(L.gastoH||0).toFixed(1)}h`]); });
  Object.values(d.porDepto).forEach(D=>{ linhas.push([d.sigla,'Departamento',D.d||'(sem)',D.d||'Sem departamento',dec(D.seg),'',D.custo.toFixed(2),'',`${D.pessoas.size} pessoa(s)`]); });
  baixaCSV(`metricas_${d.sigla}_${per}.csv`, linhas);
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='metricas') return;
  const m=estado.metricas; const t=e.target; if(!t) return;
  if(t.id==='rm-de'){ if(t.value) m.de=t.value; renderMetricas(); }
  else if(t.id==='rm-ate'){ if(t.value) m.ate=t.value; renderMetricas(); }
  else if(t.id==='rm-proj'){ m.proj=t.value||''; renderMetricas(); estadoParaURL(); }
});
document.getElementById('conteudo').addEventListener('keydown',(e)=>{
  if(estado.vista!=='metricas') return;
  if(e.key!=='Enter'&&e.key!==' ') return;
  const dr=e.target.closest&&e.target.closest('[data-rm-drill]');
  if(dr){ e.preventDefault(); rmAbreTickets(dr.getAttribute('data-rm-drill')); }
});
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='metricas') return;
  const m=estado.metricas;
  const dr=e.target.closest&&e.target.closest('[data-rm-drill]');
  if(dr&&!e.target.closest('button')&&!e.target.closest('a')&&!e.target.closest('input')&&!e.target.closest('select')){ rmAbreTickets(dr.getAttribute('data-rm-drill')); return; }
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-rm-sig')){ m.sigla=t.getAttribute('data-rm-sig'); m.proj=''; renderMetricas(); estadoParaURL(); return; }
  if(t.hasAttribute('data-rm-per')){ const p=t.getAttribute('data-rm-per'); const h=hojeSP();
    m.de=p==='mes'?ctPrimeiroDiaMes(0):p==='3m'?ctPrimeiroDiaMes(-2):p==='6m'?ctPrimeiroDiaMes(-5):p==='12m'?ctPrimeiroDiaMes(-11):h.slice(0,4)+'-01-01';
    m.ate=h; renderMetricas(); return; }
  if(t.id==='rm-retry'){ m.tempoErro=''; m.chaveT=''; renderMetricas(); return; }
  if(t.hasAttribute('data-rm-ficha')){ t.getAttribute('data-rm-ficha').split(',').forEach(k=>{ delete m.fichasErr[k]; }); renderMetricas(); return; }
  if(t.hasAttribute('data-rm-plan-retry')){ m.planErro=''; m.planChave=''; renderMetricas(); return; }
  if(t.hasAttribute('data-rm-abertos-retry')){ m.abertosErro=''; renderMetricas(); return; }
  if(t.hasAttribute('data-rm-perfis')){ rmAbrePerfis(); return; }
  if(t.hasAttribute('data-rm-csv')){ rmExportaCSV(); return; }
  if(t.hasAttribute('data-rm-proj-ficha')){ estado.projetos.sel=t.getAttribute('data-rm-proj-ficha'); estado.projetos.aba='epicos'; vaiPara('projetos'); return; }
  if(t.hasAttribute('data-rm-gestao-proj')){ estado.gestao.fProj=t.getAttribute('data-rm-gestao-proj'); estado.gestao.soKeys=null; vaiPara('gestao'); return; }
});
// Perfis (modal): salva ao alterar; a tela redesenha para refletir níveis/departamentos.
document.getElementById('modal-body').addEventListener('change',(e)=>{
  const t=e.target; if(!t||!t.hasAttribute) return;
  if(t.hasAttribute('data-rm-nivel')){ if(!souAprovador()) return; rmSalvaPerfil(t.getAttribute('data-rm-nivel'),'nivel',t.value); rmReRender(); }
  else if(t.hasAttribute('data-rm-depto')){ if(!souAprovador()) return; rmSalvaPerfil(t.getAttribute('data-rm-depto'),'depto',String(t.value||'').trim().slice(0,60)); rmReRender(); }
});
// Abas Métricas ⇄ Catálogo (valem nas duas telas: levam a sigla junto).
document.addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('[data-rm-abrir],[data-rc-abrir]'); if(!t) return;
  const s=t.getAttribute('data-rm-abrir')!=null?t.getAttribute('data-rm-abrir'):t.getAttribute('data-rc-abrir');
  if(t.hasAttribute('data-rm-abrir')){ if(s) estado.metricas.sigla=s; if(estado.vista!=='metricas') vaiPara('metricas'); }
  else { if(s) estado.relcat.sigla=s; if(estado.vista!=='relatorios') vaiPara('relatorios'); }
});
