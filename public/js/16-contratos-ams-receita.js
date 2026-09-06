// Jira Insights · 16 · 💼 CONTRATOS & VALORES (Admin), 🛠️ AMS & GOVERNANÇA (ciclos, apuração) e 💰 RECEITA.
// renderAdmin/renderAMS/renderReceita ficam no fim deste arquivo.
// ====================== ADMINISTRAÇÃO — CONTRATOS & VALORES ======================
const fmtBRL=(v)=> 'R$ '+(Number(v)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
// Consumo (horas e valor estimado) de um contrato, somando os worklogs dos projetos
// mapeados no período carregado.
function consumoContrato(c){
  const set=new Set(c.projetos||[]); let seg=0;
  ((estado.tempo&&estado.tempo.worklogs)||[]).forEach(w=>{ if(set.has(w.p)) seg+=(Number(w.s)||0); });
  return { seg, valor:(seg/3600)*(Number(c.valorHora)||0) };
}
const TIPOS_CONTRATO=[['ams','AMS (pacote por ciclo)'],['bolsa','Bolsa de horas (total)'],['projeto','Projeto (horas fechadas)']];
function rotuloTipo(t){ const o=TIPOS_CONTRATO.find(x=>x[0]===t); return o?o[1]:t; }

// ---------- AMS: apuração por ciclo (com banco de horas dentro do ciclo) ----------
const AMS_APUR=[['mensal','Mensal'],['trimestral','Trimestral'],['semestral','Semestral'],['anual','Anual']];
const AMS_MESES_CICLO={mensal:1,trimestral:3,semestral:6,anual:12};
const MESES_ABBR=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function amsCicloMeses(ap){ return AMS_MESES_CICLO[ap]||3; }
function amsLabelApur(ap){ const o=AMS_APUR.find(x=>x[0]===ap); return o?o[1]:'Trimestral'; }
function amsCiclosAno(ap){ return Math.round(12/amsCicloMeses(ap)); }
function amsHorasCiclo(c){ return Number(c.horasCiclo!=null?c.horasCiclo:c.horasContratadas)||0; }
// Categoria de projeto AMS no Jira (ex.: "DAMS | Dexterity - AMS"). O contrato AMS só
// deve mapear projetos dessa categoria. Detecta "AMS" como palavra na categoria.
const RE_CAT_AMS=/\bd?ams\b/i;
function ehCategoriaAMS(cat){ return RE_CAT_AMS.test(cat||''); }
function diaAntes(iso){ const [y,m,d]=iso.split('-').map(Number); return new Date(Date.UTC(y,m-1,d-1)).toISOString().slice(0,10); }
function labelMesAbbr(ym){ const [y,m]=ym.split('-'); return `${MESES_ABBR[(+m)-1]}/${y.slice(2)}`; }
// Ciclo de apuração vigente (alinhado ao mês de início da vigência), contendo `ref`.
function amsCicloVigente(c, ref){
  ref=ref||hojeSP(); const cm=amsCicloMeses(c.apuracao||'trimestral');
  let baseY,baseM;
  if(c.inicio && /^\d{4}-\d{2}/.test(c.inicio)){ baseY=+c.inicio.slice(0,4); baseM=+c.inicio.slice(5,7)-1; }
  else { baseY=+ref.slice(0,4); baseM=0; }
  const refY=+ref.slice(0,4), refM=+ref.slice(5,7)-1;
  let diff=(refY-baseY)*12+(refM-baseM); if(diff<0) diff=0;
  const idx=Math.floor(diff/cm), startIdx=baseM+idx*cm;
  const start=`${baseY+Math.floor(startIdx/12)}-${String(startIdx%12+1).padStart(2,'0')}-01`;
  const endIdx=startIdx+cm;
  const end=diaAntes(`${baseY+Math.floor(endIdx/12)}-${String(endIdx%12+1).padStart(2,'0')}-01`);
  const meses=[]; for(let k=0;k<cm;k++){ const mi=startIdx+k; meses.push(`${baseY+Math.floor(mi/12)}-${String(mi%12+1).padStart(2,'0')}`); }
  return { start, end, meses, cm, n:idx+1 };
}
function amsLabelCiclo(cyc){ if(!cyc.meses.length) return '';
  const a=cyc.meses[0], b=cyc.meses[cyc.meses.length-1];
  return cyc.meses.length===1?labelMesAbbr(a):`${labelMesAbbr(a)}–${labelMesAbbr(b)}`; }
// Consumo do ciclo (worklogs do intervalo carregados em estado.ams), por mês.
function amsConsumoCiclo(c, cyc){
  const set=new Set(c.projetos||[]); const wl=(estado.ams&&estado.ams.dados)||[];
  // seg = todas as horas do ciclo; segFat = só as faturáveis (estas consomem o pacote/excedente).
  let seg=0, segFat=0; const porMes={}; cyc.meses.forEach(m=>{ porMes[m]=0; });
  wl.forEach(w=>{ if(!set.has(w.p)) return; const dia=(w.d||'').slice(0,10);
    if(!dia||dia<cyc.start||dia>cyc.end) return;
    const s=Number(w.s)||0; seg+=s; if(w.f) segFat+=s; const ym=dia.slice(0,7); if(ym in porMes) porMes[ym]+=s; });
  return { seg, segFat, porMes };
}
// Data de referência do ciclo em exibição (vazio = hoje/ciclo vigente).
function amsRefSel(){ return (estado.ams&&estado.ams.ref) || hojeSP(); }
// Desloca a data de referência por `deltaCiclos` ciclos de `cm` meses (mid-month, sem virada).
function amsShiftRef(ref, deltaCiclos, cm){
  const y=+ref.slice(0,4), m=+ref.slice(5,7)-1; const nm=m+deltaCiclos*cm;
  const ny=y+Math.floor(nm/12), mm=((nm%12)+12)%12;
  return `${ny}-${String(mm+1).padStart(2,'0')}-15`;
}
// Horas do ciclo agrupadas por TIPO de issue (com drill-down por chamado) e split faturável.
// Cada tipo: { seg, f (faturável), chamados:{ chave -> {seg} } }.
function amsPorTipo(c, cyc){
  const set=new Set(c.projetos||[]); const wl=(estado.ams&&estado.ams.dados)||[];
  const tipos={}; let segFat=0, segNao=0;
  wl.forEach(w=>{
    if(!set.has(w.p)) return; const dia=(w.d||'').slice(0,10);
    if(!dia||dia<cyc.start||dia>cyc.end) return;
    const s=Number(w.s)||0; if(!s) return;
    const tp=w.t||'—'; const t=tipos[tp]||(tipos[tp]={seg:0,f:!!w.f,chamados:{}});
    t.seg+=s; const k=w.k||'(sem chave)'; (t.chamados[k]||(t.chamados[k]={seg:0})).seg+=s;
    if(w.f) segFat+=s; else segNao+=s;
  });
  return { tipos, segFat, segNao, seg:segFat+segNao };
}
// Worklogs (linhas individuais) de um contrato no ciclo — memória de apontamentos por chamado.
function amsWorklogsCiclo(c, cyc){
  const set=new Set(c.projetos||[]); const wl=(estado.ams&&estado.ams.dados)||[];
  return wl.filter(w=>{ if(!set.has(w.p)) return false; const dia=(w.d||'').slice(0,10);
    return dia&&dia>=cyc.start&&dia<=cyc.end&&(Number(w.s)||0)>0; });
}
function amsNomePessoa(a){ const p=(estado.ams&&estado.ams.pessoas&&estado.ams.pessoas[a])||(estado.usuarios&&estado.usuarios[a]); return (p&&p.nome)||a; }
function amsResumoChamado(k){ return (estado.ams&&estado.ams.resumos&&estado.ams.resumos[k])||''; }
// Infos do chamado (campos do Jira): cc=Número do Chamado Cliente, cr=Causa Raiz,
// pr=Produto, pc=Processo. Vem do /api/tempo (mapa por chave do chamado).
function amsInfoChamado(k){ return (estado.ams&&estado.ams.infos&&estado.ams.infos[k])||null; }
function amsNumCliente(k){ const i=amsInfoChamado(k); return (i&&i.cc)||''; }
// Contrato AMS em exibição — a aba mostra um cliente por vez (seleção em estado.ams.sel).
function amsContratoSel(amsList){
  const id=(estado.ams&&estado.ams.sel)||'';
  return amsList.find(c=>c.id===id) || amsList[0] || null;
}
// Chamados do ciclo (lista achatada de todos os tipos) — o que faz parte do ciclo selecionado.
function amsChamadosCiclo(c, cyc){
  const set=new Set(c.projetos||[]); const wl=(estado.ams&&estado.ams.dados)||[]; const m={};
  wl.forEach(w=>{ if(!set.has(w.p)) return; const dia=(w.d||'').slice(0,10);
    if(!dia||dia<cyc.start||dia>cyc.end) return; const s=Number(w.s)||0; if(!s) return;
    const k=w.k||'(sem chave)'; const o=m[k]||(m[k]={k, tipo:w.t||'—', f:!!w.f, seg:0, pessoas:new Set()});
    o.seg+=s; if(w.a) o.pessoas.add(w.a); });
  return Object.values(m).sort((a,b)=>b.seg-a.seg);
}
// Faturamento do ciclo (chave = início do ciclo), guardado em c.faturados.
function amsCicloFaturado(c, cyc){ return !!(c && c.faturados && cyc && c.faturados[cyc.start]); }
// Card com os DADOS CADASTRADOS do contrato + controle de faturamento do ciclo.
function amsDadosCard(c, cyc){
  const ap=amsLabelApur(c.apuracao||'trimestral'); const pool=amsHorasCiclo(c); const vh=Number(c.valorHora)||0;
  const ca=amsCiclosAno(c.apuracao||'trimestral'); const parcela=pool*vh;
  const dl=(l,v)=>`<div class="ams-dl"><div class="dt">${l}</div><div class="dd">${v}</div></div>`;
  const faturado=amsCicloFaturado(c,cyc); const fr=(c.faturados&&c.faturados[cyc.start])||null;
  return `<div class="ams-dados">
    <div class="ams-dados-h"><strong>Contrato — ${esc(c.cliente||'(sem nome)')}</strong>
      <span class="badge">AMS · ${esc(ap.toLowerCase())}</span><span class="spacer"></span>
      <button class="btn" data-ams-edit="${escA(c.id)}">Editar no Admin</button></div>
    <div class="ams-dgrid">
      ${dl('Valor-hora', vh?fmtBRL(vh):'—')}
      ${dl('Horas por ciclo', pool?`${pool}h`:'—')}
      ${dl('Parcela do ciclo', vh&&pool?fmtBRL(parcela):'—')}
      ${dl('Valor anual', vh&&pool?`${fmtBRL(parcela*ca)} <span class="muted">· ${pool*ca}h</span>`:'—')}
      ${dl('Mínimo mensal', c.minMes?`${c.minMes}h`:'—')}
      ${dl('Teto mensal', c.tetoMes?`${c.tetoMes}h`:'—')}
      ${dl('Início da vigência', c.inicio?esc(fmtBR(c.inicio)):'—')}
      ${dl('Banco de horas', c.bancoHoras!==false?'Sim · dentro do ciclo':'Não')}
      ${dl('Responsável Dexterity', c.respDex?esc(c.respDex):'—')}
      ${dl('Responsável / Cliente', c.respCliente?esc(c.respCliente):'—')}
    </div>
    ${c.obs?`<div class="ams-dobs muted small"><strong>Obs.:</strong> ${esc(c.obs)}</div>`:''}
    <div class="ams-dprojs muted small">Projetos: ${(c.projetos||[]).map(esc).join(', ')||'—'}</div>
    <div class="ams-fatura">
      <span class="ams-fat-tag ${faturado?'ok':'pend'}">${faturado?'✓ Ciclo faturado':'● Pendente de faturamento'}${faturado&&fr&&fr.em?` <span class="muted" style="font-weight:400">em ${esc(fmtBR(fr.em))}${fr.por?` · ${esc(fr.por)}`:''}</span>`:''}</span>
      <span class="spacer"></span>
      <button class="btn ${faturado?'':'primario'}" data-ams-fatura="${escA(c.id)}">${faturado?'Desmarcar faturamento':'Marcar ciclo como faturado'}</button>
    </div>
    <div class="ams-note">O status de faturamento é por <strong>ciclo</strong> e ${cfgShared?'fica salvo para o time.':'fica salvo só neste navegador (configure o Supabase para compartilhar).'}</div>
  </div>`;
}
// Drill-down de um MÊS do ciclo: apontamentos por chamado no mês (cada chamado abre as
// linhas de worklog — data · pessoa · horas) com link para o Jira.
function amsDrillMes(cId, ym){
  const c=(cfg.contratos||[]).find(x=>x.id===cId); if(!c) return;
  const set=new Set(c.projetos||[]); const wl=(estado.ams&&estado.ams.dados)||[];
  const porCh={}; let tot=0;
  wl.forEach(w=>{ if(!set.has(w.p)) return; const d=(w.d||'').slice(0,10); if(d.slice(0,7)!==ym) return;
    const s=Number(w.s)||0; if(!s) return;
    const k=w.k||'(sem chave)'; const o=porCh[k]||(porCh[k]={seg:0,f:!!w.f,ent:[]});
    o.seg+=s; o.ent.push({d,a:w.a,s}); tot+=s; });
  const chs=Object.entries(porCh).sort((a,b)=>b[1].seg-a[1].seg);
  const corpo = chs.length ? chs.map(([k,o])=>{
    const temK=k && k!=='(sem chave)';
    const alvo=temK?`<a href="${jiraBase()}/browse/${encodeURIComponent(k)}" target="_blank" rel="noopener">${esc(k)} ↗</a>`:'<span class="muted">(sem chave)</span>';
    const ent=o.ent.slice().sort((a,b)=> a.d<b.d?-1:a.d>b.d?1:0 );
    const linhas=ent.map(x=>`<div class="ts-dch"><span class="ts-dch-k">${esc(fmtBR(x.d))}</span><span class="ts-dch-r">${esc(amsNomePessoa(x.a))}</span><span class="ts-dch-h">${fmtH(x.s)}</span></div>`).join('');
    const pct=tot?Math.round(o.seg/tot*100):0;
    return `<details class="ts-dproj">
      <summary><span class="ts-dp-k">${alvo}</span><span class="ts-dp-n">${(()=>{const cc=amsNumCliente(k);return cc?`<span class="ams-ch-cc" data-tip="Número do Chamado Cliente">🔖 ${esc(cc)}</span> `:'';})()}${esc(amsResumoChamado(k)||'')} <span class="ams-ch-b ${o.f?'fat':'nfat'}">${o.f?'faturável':'não faturável'}</span></span>
        <span class="ts-dp-h">${fmtH(o.seg)} · ${pct}%</span></summary>
      <div class="ts-dchs">${linhas}</div>
    </details>`;
  }).join('') : '<div class="estado">Sem apontamentos neste mês.</div>';
  abreModal(`<h2>${esc(c.cliente||'(sem nome)')} <span class="muted" style="font-weight:400;font-size:14px">· ${esc(labelMesAbbr(ym))} · ${fmtH(tot)} · ${chs.length} chamado(s)</span></h2>
    <div class="muted small" style="margin:2px 0 10px">Apontamentos por chamado no mês — clique num chamado para ver as linhas (data · pessoa · horas). ↗ abre no Jira.</div>
    <div class="ts-drill">${corpo}</div>`);
}
// Card "Chamados do ciclo": lista achatada dos chamados que fazem parte do ciclo selecionado.
function amsChamadosCard(c, cyc){
  // A lista mostra só chamados FATURÁVEIS; os não faturáveis ficam fora (mas continuam
  // no indicador faturável×não faturável e em "Horas por tipo"/Relatórios).
  const todos=amsChamadosCiclo(c,cyc); const chs=todos.filter(o=>o.f); const tot=chs.reduce((s,o)=>s+o.seg,0);
  const nao=todos.filter(o=>!o.f); const segNao=nao.reduce((s,o)=>s+o.seg,0);
  const linhas=chs.map(o=>{
    const temK=o.k && o.k!=='(sem chave)';
    const alvo=temK?`<a href="${jiraBase()}/browse/${encodeURIComponent(o.k)}" target="_blank" rel="noopener">${esc(o.k)} ↗</a>`:'<span class="muted">(sem chave)</span>';
    const pct=tot?Math.round(o.seg/tot*100):0;
    const cc=amsNumCliente(o.k);
    return `<div class="ams-ch">
      <span class="ams-ch-k">${alvo}</span>
      ${cc?`<span class="ams-ch-cc" data-tip="Número do Chamado Cliente">🔖 ${esc(cc)}</span>`:''}
      <span class="ams-ch-r">${esc(amsResumoChamado(o.k)||'')}</span>
      <span class="ams-ch-t">${esc(o.tipo)}</span>
      <span class="ams-ch-b ${o.f?'fat':'nfat'}">${o.f?'faturável':'não faturável'}</span>
      <span class="ams-ch-p muted" data-tip="Pessoas que apontaram">${o.pessoas.size}</span>
      <span class="ams-ch-h">${fmtH(o.seg)} · ${pct}%</span></div>`;
  }).join('');
  const notaNao = segNao>0 ? `<span class="muted" style="font-weight:400"> · não faturáveis ocultos: <strong>${fmtH(segNao)}</strong> em ${nao.length} chamado(s)</span>` : '';
  return `<div class="ams-chcard">
    <div class="muted small" style="font-weight:600;margin:2px 0 6px">Chamados do ciclo <span class="muted" style="font-weight:400">(somente faturáveis · ${chs.length} chamado(s) · ${fmtH(tot)} — 🔖 = Nº do Chamado Cliente · clique na chave para abrir no Jira)</span>${notaNao}</div>
    <div class="ams-chlist">${linhas||'<div class="muted small">Sem chamados faturáveis neste ciclo.</div>'}</div>
  </div>`;
}
// ---- Relatórios do ciclo: Causa raiz · Produto · Processo (campos do Jira) ----
// Agrupa os chamados do ciclo por valor de cada campo: horas (faturável+não), nº de
// chamados e % (Pareto, com acumulado). Clicar num valor abre os chamados daquele grupo.
function amsAgrupaRel(chs, getVal){
  const m={};
  chs.forEach(o=>{ const info=amsInfoChamado(o.k)||{}; const v=((getVal(info)||'')+'').trim()||'(não informado)';
    const g=m[v]||(m[v]={seg:0,n:0,segFat:0}); g.seg+=o.seg; g.n+=1; if(o.f) g.segFat+=o.seg; });
  return Object.entries(m).sort((a,b)=>b[1].seg-a[1].seg);
}
function amsRelGetVal(dim){ return dim==='cr'?(i=>i.cr):dim==='pr'?(i=>i.pr):(i=>i.pc); }
function amsRelBloco(chs, dim, titulo, cor){
  const ent=amsAgrupaRel(chs, amsRelGetVal(dim));
  const tot=ent.reduce((s,[,g])=>s+g.seg,0);
  const max=Math.max(1,...ent.map(([,g])=>g.seg));
  let acc=0;
  const linhas=ent.map(([v,g])=>{
    const pct=tot?Math.round(g.seg/tot*100):0; acc+=g.seg; const cum=tot?Math.round(acc/tot*100):0;
    return `<div class="ams-relrow" data-ams-rel="${escA(dim)}" data-ams-relv="${escA(v)}" data-tip="Ver chamados — ${escA(v)}">
      <div class="nm">${esc(v)}</div>
      <div class="vl">${fmtH(g.seg)} · ${pct}% <span class="muted" style="font-weight:400">(${g.n})</span></div>
      <div class="tk"><i style="width:${Math.max(3,g.seg/max*100)}%;background:${cor}"></i></div>
      <div class="ams-rel-cum">acum. ${cum}%</div></div>`;
  }).join('');
  return `<div class="ams-rel"><h4>${titulo} <span class="muted">(${ent.length})</span></h4>
    ${linhas||'<div class="muted small">Sem dados.</div>'}</div>`;
}
function amsRelatoriosCard(c, cyc){
  const chs=amsChamadosCiclo(c, cyc);
  const semInfo=chs.every(o=>!amsInfoChamado(o.k));
  const aviso = semInfo ? `<div class="muted small" style="margin-top:6px">Sem <strong>Causa raiz/Produto/Processo</strong> preenchidos nos chamados deste ciclo (ou os campos ainda não foram mapeados).</div>` : '';
  return `<div class="ams-chcard" style="margin-top:14px">
    <div class="muted small" style="font-weight:600;margin:2px 0 8px">📊 Relatórios do ciclo — Causa raiz · Produto · Processo
      <span class="muted" style="font-weight:400">(horas · % do ciclo · (nº de chamados); ordenado por horas — Pareto com acumulado; clique num item para ver os chamados)</span></div>
    <div class="ams-rel-grid">
      ${amsRelBloco(chs,'cr','Causa raiz',cores.roxo)}
      ${amsRelBloco(chs,'pr','Produto',cores.cerceta)}
      ${amsRelBloco(chs,'pc','Processo',cores.musgo)}
    </div>${aviso}</div>`;
}
// Drill: chamados do ciclo com um valor específico de causa raiz/produto/processo.
function amsDrillRel(cId, dim, valor){
  const c=(cfg.contratos||[]).find(x=>x.id===cId); if(!c) return;
  const cyc=amsCicloVigente(c, amsRefSel()); const getVal=amsRelGetVal(dim);
  const chs=amsChamadosCiclo(c,cyc).filter(o=>{ const info=amsInfoChamado(o.k)||{}; return (((getVal(info)||'')+'').trim()||'(não informado)')===valor; });
  const tot=chs.reduce((s,o)=>s+o.seg,0);
  const linhas=chs.map(o=>{
    const temK=o.k && o.k!=='(sem chave)';
    const alvo=temK?`<a href="${jiraBase()}/browse/${encodeURIComponent(o.k)}" target="_blank" rel="noopener">${esc(o.k)} ↗</a>`:'<span class="muted">(sem chave)</span>';
    const cc=amsNumCliente(o.k); const pct=tot?Math.round(o.seg/tot*100):0;
    return `<div class="ams-ch"><span class="ams-ch-k">${alvo}</span>${cc?`<span class="ams-ch-cc" data-tip="Número do Chamado Cliente">🔖 ${esc(cc)}</span>`:''}<span class="ams-ch-r">${esc(amsResumoChamado(o.k)||'')}</span><span class="ams-ch-b ${o.f?'fat':'nfat'}">${o.f?'faturável':'não faturável'}</span><span class="ams-ch-h">${fmtH(o.seg)} · ${pct}%</span></div>`;
  }).join('');
  const dimLabel = dim==='cr'?'Causa raiz':dim==='pr'?'Produto':'Processo';
  abreModal(`<h2>${esc(dimLabel)}: ${esc(valor)} <span class="muted" style="font-weight:400;font-size:14px">· ${fmtH(tot)} · ${chs.length} chamado(s)</span></h2>
    <div class="muted small" style="margin:2px 0 10px">Chamados do ciclo de <strong>${esc(c.cliente||'')}</strong> com ${esc(dimLabel.toLowerCase())} = <strong>${esc(valor)}</strong>. 🔖 = Nº do Chamado Cliente · ↗ abre no Jira.</div>
    <div class="ams-chlist">${linhas||'<div class="estado">Sem chamados.</div>'}</div>`);
}
function renderAdmin(){
  const cont=document.getElementById('conteudo');
  if(!_projetosCache){ garanteProjetos().then(()=>{ if(estado.vista==='admin') renderAdmin(); }).catch(()=>{}); }
  const ad=estado.admin; const contratos=cfg.contratos||[];
  const edit = ad.editId ? contratos.find(c=>c.id===ad.editId) : null;
  // Só projetos da categoria AMS aparecem para mapear (+ os já marcados neste contrato,
  // para não perder mapeamentos antigos de outra categoria).
  const jaMarcados=new Set((edit&&edit.projetos)||[]);
  const projsAll=(_projetosCache||[]).slice().sort((a,b)=>a.key.localeCompare(b.key));
  const projs=projsAll.filter(p=>ehCategoriaAMS(p.categoria)||jaMarcados.has(p.key));

  const projBox = projsAll.length
    ? (projs.length
        ? `<div class="rg-pessoas" id="ad-projs">${projs.map(p=>{
            const ck = jaMarcados.has(p.key);
            const foraAMS = !ehCategoriaAMS(p.categoria);
            return `<label class="check"><input type="checkbox" data-ad-proj="${escA(p.key)}" ${ck?'checked':''}> ${esc(p.nome||p.key)} (${esc(p.key)})${foraAMS?' <span class="muted small">(fora da categoria AMS)</span>':''}</label>`;
          }).join('')}</div>`
        : '<div class="muted small">Nenhum projeto da categoria <strong>AMS</strong> encontrado no Jira.</div>')
    : '<div class="muted small">Carregando projetos do Jira…</div>';

  const form=`<div class="card full">
    <h2>${edit?'Editar contrato':'Novo contrato / cliente'}</h2>
    <div class="pl-grid">
      <div class="campo"><label>Cliente</label><input type="text" id="ad-cliente" value="${escA(edit?edit.cliente:'')}" placeholder="Nome do cliente"></div>
      <div class="campo"><label>Tipo de contrato</label><select id="ad-tipo">
        ${TIPOS_CONTRATO.map(([v,l])=>`<option value="${v}" ${edit&&edit.tipo===v?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="campo" id="ad-horas-wrap"><label>Horas contratadas</label><input type="number" id="ad-horas" min="0" step="1" value="${escA(edit&&edit.horasContratadas!=null?String(edit.horasContratadas):'')}" placeholder="ex.: 100"></div>
      <div class="campo"><label>Valor-hora (R$)</label><input type="number" id="ad-valor" min="0" step="0.01" value="${escA(edit&&edit.valorHora!=null?String(edit.valorHora):'')}" placeholder="ex.: 122"></div>
      <div class="campo"><label>Início da vigência</label><input type="date" id="ad-inicio" value="${escA(edit?edit.inicio||'':'')}"></div>
      <div class="campo"><label>Responsável Dexterity</label><input type="text" id="ad-respdex" value="${escA(edit?edit.respDex||'':'')}" placeholder="nome do responsável (Dexterity)"></div>
      <div class="campo"><label>Responsável / Nome do Cliente</label><input type="text" id="ad-respcli" value="${escA(edit?edit.respCliente||'':'')}" placeholder="responsável pelo lado do cliente"></div>
    </div>
    <fieldset id="ad-ams" style="border:1px solid var(--linha);border-radius:10px;padding:12px 14px;margin:4px 0 8px">
      <legend class="muted small" style="padding:0 6px">Parâmetros do AMS (apuração e banco de horas)</legend>
      <div class="pl-grid">
        <div class="campo"><label>Apuração (ciclo)</label><select id="ad-apur">
          ${AMS_APUR.map(([v,l])=>`<option value="${v}" ${((edit&&edit.apuracao)||'trimestral')===v?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="campo"><label>Horas por ciclo</label><input type="number" id="ad-hciclo" min="0" step="1" value="${escA(edit&&edit.horasCiclo!=null?String(edit.horasCiclo):'')}" placeholder="ex.: 60"></div>
        <div class="campo"><label>Mínimo mensal (h)</label><input type="number" id="ad-min" min="0" step="1" value="${escA(edit&&edit.minMes!=null?String(edit.minMes):'')}" placeholder="ex.: 20"></div>
        <div class="campo"><label>Teto mensal (h)</label><input type="number" id="ad-teto" min="0" step="1" value="${escA(edit&&edit.tetoMes!=null?String(edit.tetoMes):'')}" placeholder="ex.: 60"></div>
      </div>
      <label class="check" style="margin-top:6px"><input type="checkbox" id="ad-banco" ${(!edit||edit.bancoHoras!==false)?'checked':''}> Banco de horas dentro do ciclo (saldo não consumido vale até o fim do ciclo; <strong>não acumula</strong> para o ciclo seguinte)</label>
      <div class="muted small" id="ad-ams-resumo" style="margin-top:8px"></div>
    </fieldset>
    <div class="campo"><label>Projetos do Jira deste cliente <span class="muted">(categoria AMS · marque um ou mais)</span></label>${projBox}</div>
    <div class="campo"><label>Observações</label><input type="text" id="ad-obs" value="${escA(edit?edit.obs||'':'')}" placeholder="opcional"></div>
    <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
      <button class="btn primario" id="ad-salvar">${edit?'Salvar alterações':'Adicionar contrato'}</button>
      ${edit?'<button class="btn" id="ad-cancelar">Cancelar edição</button>':''}
    </div>
    <div class="ap-fb" id="ad-fb" hidden></div>
  </div>`;

  const cards=contratos.map(c=>{
    const cons=consumoContrato(c); const h=cons.seg/3600;
    const ams=c.tipo==='ams';
    const contr=ams?amsHorasCiclo(c):(Number(c.horasContratadas)||0); const pctv=contr?Math.round(h/contr*100):null;
    const over=pctv!=null&&pctv>100;
    const vh=Number(c.valorHora)||0;
    const semProj=!(c.projetos||[]).length;
    const dl=(l,v)=>`<div class="ams-dl"><div class="dt">${l}</div><div class="dd">${v}</div></div>`;
    let detalhes;
    if(ams){
      const pool=amsHorasCiclo(c); const ca=amsCiclosAno(c.apuracao||'trimestral'); const parcela=pool*vh;
      detalhes=`<div class="ams-dgrid">
        ${dl('Apuração (ciclo)', esc(amsLabelApur(c.apuracao||'trimestral')))}
        ${dl('Valor-hora', vh?fmtBRL(vh):'—')}
        ${dl('Horas por ciclo', pool?`${pool}h`:'—')}
        ${dl('Parcela do ciclo', vh&&pool?fmtBRL(parcela):'—')}
        ${dl('Valor anual', pool?(vh?`${fmtBRL(parcela*ca)} <span class="muted">· ${pool*ca}h</span>`:`${pool*ca}h/ano`):'—')}
        ${dl('Mínimo mensal', c.minMes?`${c.minMes}h`:'—')}
        ${dl('Teto mensal', c.tetoMes?`${c.tetoMes}h`:'—')}
        ${dl('Início da vigência', c.inicio?esc(fmtBR(c.inicio)):'—')}
        ${dl('Banco de horas', c.bancoHoras!==false?'Sim · dentro do ciclo':'Não')}
        ${dl('Responsável Dexterity', c.respDex?esc(c.respDex):'—')}
        ${dl('Responsável / Cliente', c.respCliente?esc(c.respCliente):'—')}
      </div>`;
    } else {
      detalhes=`<div class="ams-dgrid">
        ${dl('Valor-hora', vh?fmtBRL(vh):'—')}
        ${dl('Horas contratadas', contr?`${contr}h`:'—')}
        ${dl('Início da vigência', c.inicio?esc(fmtBR(c.inicio)):'—')}
        ${dl('Responsável Dexterity', c.respDex?esc(c.respDex):'—')}
        ${dl('Responsável / Cliente', c.respCliente?esc(c.respCliente):'—')}
      </div>`;
    }
    const projetos=`<div class="ams-dprojs muted small">Projetos: ${semProj?'<strong style="color:#B45309">nenhum mapeado</strong>':(c.projetos||[]).map(esc).join(', ')}</div>`;
    const obs=c.obs?`<div class="ams-dobs muted small"><strong>Obs.:</strong> ${esc(c.obs)}</div>`:'';
    const url = c.portalToken ? `${location.origin}/portal.html?c=${encodeURIComponent(c.portalToken)}` : '';
    const portalLine = url
      ? `<div class="ad-portal"><span class="muted small">🔗 Link do cliente:</span>
          <input type="text" readonly value="${escA(url)}" data-ad-portal-input>
          <button class="btn" data-ad-portal-copy="${escA(url)}">copiar</button>
          <button class="btn" data-ad-portal-novo="${escA(c.id)}" data-tip="Gera um novo link e invalida o anterior">novo</button></div>`
      : `<div class="ad-portal"><button class="btn" data-ad-portal="${escA(c.id)}">🔗 Gerar link do cliente</button>
          <span class="muted small">painel somente-leitura para o cliente acompanhar as horas</span></div>`;
    // AMS sem projetos não aparece na apuração da aba AMS — avisa e oferece o atalho de edição.
    const avisoSemProj = (ams && semProj)
      ? `<div class="ad-cons" style="color:#B45309">⚠ Sem projetos mapeados — este contrato <strong>não aparece</strong> na apuração da aba <strong>AMS</strong>. Clique em <strong>editar</strong> e marque os projetos da categoria AMS.</div>`
      : '';
    return `<div class="ad-card${over?' over':''}">
      <div class="ad-top"><strong>${esc(c.cliente||'(sem nome)')}</strong> <span class="badge">${esc(rotuloTipo(c.tipo))}</span>
        <span class="spacer"></span>
        <button class="btn" data-ad-edit="${escA(c.id)}">editar</button>
        <button class="btn" data-ad-del="${escA(c.id)}">remover</button></div>
      ${detalhes}
      ${projetos}
      ${obs}
      ${avisoSemProj}
      <div class="ad-cons">Consumo no período: <strong>${fmtH(cons.seg)}</strong>${contr?` de ${contr}h${ams?'/ciclo':''}${pctv!=null?` <span class="${over?'ad-over':''}">(${pctv}%)</span>`:''}`:''}${vh?` · estimado <strong>${fmtBRL(cons.valor)}</strong>`:''}${ams?' <span class="muted">· apuração completa na aba <strong>AMS</strong></span>':''}</div>
      ${portalLine}
    </div>`;
  }).join('');

  cont.replaceChildren(el(`<div>
    <div class="card full"><h2>⚙️ Administração — Contratos &amp; Valores</h2>
      <div class="muted small">${cfgShared?'✓ Compartilhado com o time (salvo no servidor).':'⚠ Salvo só neste navegador — configure o Supabase para compartilhar.'}
        Cadastre clientes, tipo de contrato, <strong>horas contratadas</strong> e <strong>valor-hora</strong>, e mapeie os <strong>projetos do Jira</strong>. Isso destrava os módulos de <strong>AMS</strong> e <strong>Receita</strong>. O consumo abaixo usa o período selecionado no topo.</div>
    </div>
    ${cfgShared && !idApontar() ? `<div class="aviso">⚠ Para <strong>salvar</strong> as configurações no servidor é preciso identificar-se: informe seu e-mail e token do Jira na aba <strong data-goto="apontar" style="cursor:pointer;text-decoration:underline">⏱ Apontar</strong>. Sem isso, as alterações ficam só neste navegador.</div>` : ''}
    ${form}
    <div class="card full"><h2>Contratos cadastrados <span>${contratos.length}</span></h2>
      ${contratos.length?`<div class="ad-grid">${cards}</div>`:'<div class="estado">Nenhum contrato cadastrado ainda.</div>'}
    </div>
  </div>`));
  const tsel=document.getElementById('ad-tipo'); if(tsel) tsel.addEventListener('change', amsToggleForm);
  ['ad-apur','ad-hciclo','ad-valor'].forEach(id=>{ const e=document.getElementById(id); if(e) e.addEventListener('input', amsResumoForm); });
  if(document.getElementById('ad-apur')) document.getElementById('ad-apur').addEventListener('change', amsResumoForm);
  // Abre o seletor nativo ao clicar em qualquer parte do campo de data (não só no
  // ícone) — alguns navegadores não abrem o calendário ao clicar no texto.
  const din=document.getElementById('ad-inicio');
  if(din) din.addEventListener('click', ()=>{ try{ if(din.showPicker) din.showPicker(); }catch(e){} });
  amsToggleForm();
}
// Mostra/esconde os campos de AMS conforme o tipo e atualiza o resumo derivado (h/ano, parcela).
function amsToggleForm(){
  const t=document.getElementById('ad-tipo'); if(!t) return;
  const isAms=t.value==='ams';
  const ams=document.getElementById('ad-ams'); if(ams) ams.style.display=isAms?'':'none';
  const hw=document.getElementById('ad-horas-wrap'); if(hw) hw.style.display=isAms?'none':'';
  amsResumoForm();
}
function amsResumoForm(){
  const r=document.getElementById('ad-ams-resumo'); if(!r) return;
  const t=document.getElementById('ad-tipo'); if(!t||t.value!=='ams'){ r.textContent=''; return; }
  const ap=(document.getElementById('ad-apur')||{}).value||'trimestral';
  const hc=Number((document.getElementById('ad-hciclo')||{}).value)||0;
  const vh=Number((document.getElementById('ad-valor')||{}).value)||0;
  const ca=amsCiclosAno(ap); const anual=hc*ca; const parts=[];
  if(hc){ parts.push(`<strong>${hc}h</strong> por ciclo`); parts.push(`<strong>${anual}h/ano</strong> (${ca} ${ca>1?'ciclos':'ciclo'})`); }
  if(hc&&vh){ parts.push(`parcela <strong>${fmtBRL(hc*vh)}</strong> · ano <strong>${fmtBRL(anual*vh)}</strong>`); }
  r.innerHTML = parts.length ? ('≈ '+parts.join(' · ')) : 'Preencha “horas por ciclo” e “valor-hora” para ver o resumo (h/ano e parcela).';
}
function salvaContrato(){
  const v=(id)=>{ const e=document.getElementById(id); return e?e.value.trim():''; };
  const fb=document.getElementById('ad-fb'); if(fb){ fb.hidden=false; fb.className='ap-fb'; }
  const cliente=v('ad-cliente');
  if(!cliente){ if(fb){ fb.classList.add('err'); fb.textContent='Informe o nome do cliente.'; } return; }
  const projetos=[...document.querySelectorAll('#ad-projs input[data-ad-proj]:checked')].map(c=>c.getAttribute('data-ad-proj'));
  const tipo=v('ad-tipo')||'ams';
  const dados={
    cliente, tipo,
    valorHora:Math.max(0,Number(v('ad-valor'))||0),
    inicio:v('ad-inicio'), respDex:v('ad-respdex'), respCliente:v('ad-respcli'),
    obs:v('ad-obs'), projetos,
  };
  if(tipo==='ams'){
    dados.apuracao=v('ad-apur')||'trimestral';
    dados.horasCiclo=Math.max(0,Number(v('ad-hciclo'))||0);
    dados.minMes=Math.max(0,Number(v('ad-min'))||0);
    dados.tetoMes=Math.max(0,Number(v('ad-teto'))||0);
    const bk=document.getElementById('ad-banco'); dados.bancoHoras=bk?bk.checked:true;
    dados.horasContratadas=dados.horasCiclo;   // compat com o preview genérico
  } else {
    dados.horasContratadas=Math.max(0,Number(v('ad-horas'))||0);
  }
  cfg.contratos=cfg.contratos||[];
  const ad=estado.admin;
  if(ad.editId){ const c=cfg.contratos.find(x=>x.id===ad.editId); if(c) Object.assign(c, dados); ad.editId=null; }
  else { dados.id='c'+Date.now().toString(36)+Math.random().toString(36).slice(2,5); cfg.contratos.push(dados); }
  salvaCfg(); renderAdmin();
}
// ===============================================================================

// ====================== RECEITA / AMS — CONSUMO POR CLIENTE ======================
// Consumo de um contrato no período: horas e valor (faturável à parte) somando os
// worklogs dos projetos mapeados.
function analisaContrato(c){
  const set=new Set(c.projetos||[]); let seg=0, segFat=0;
  ((estado.tempo&&estado.tempo.worklogs)||[]).forEach(w=>{
    if(!set.has(w.p)) return;
    const s=Number(w.s)||0; seg+=s; if(w.f) segFat+=s;
  });
  const vh=Number(c.valorHora)||0;
  return { seg, segFat, valor:(seg/3600)*vh, valorFat:(segFat/3600)*vh };
}
// ====================== AMS & GOVERNANÇA — APURAÇÃO POR CICLO (aba própria) ======================
// Aba dedicada: um contrato AMS por vez (seletor de cliente), sempre por ciclo.
function renderAMS(){
  const cont=document.getElementById('conteudo');
  if(!estado.tempo){ cont.replaceChildren(el(skeletonPainel())); return; }
  const contratos=(cfg.contratos||[]);
  const hoje=hojeSP();
  // ---- AMS: apuração por ciclo, UM contrato por vez (selecione o cliente) ----
  const amsList=contratos.filter(c=>c.tipo==='ams' && (c.projetos||[]).length);
  const cSel=amsContratoSel(amsList);
  if(cSel && (estado.ams.sel||'')!==cSel.id) estado.ams.sel=cSel.id;   // fixa a seleção efetiva
  const refSel=amsRefSel();
  const cycSel = cSel ? amsCicloVigente(cSel,refSel) : null;
  // Não há "futuro": o "próximo" só vai até o ciclo vigente (o que contém hoje).
  const noVigente = cSel ? (cycSel.start===amsCicloVigente(cSel,hoje).start) : true;
  const noPrimeiro = cycSel ? cycSel.n===1 : true;   // 1º ciclo do contrato: não há "anterior"
  let amsProntos=false, amsKey='';
  if(cSel){
    const ate = cycSel.end<hoje?cycSel.end:hoje;
    amsKey=`${cSel.id}|${cycSel.start}|${ate}`;   // a busca é só do ciclo do contrato selecionado
    const am=estado.ams;
    if(am.range!==amsKey && am.erroKey!==amsKey && !am.carregando){   // erroKey: ciclo que falhou — espera o "Atualizar agora" em vez de rebuscar em laço
      am.carregando=true; am.erro='';
      const forcar=!!am.forcar; am.forcar=false;      // "Atualizar agora" ignora o cache do servidor
      fetch(`/api/tempo?desde=${encodeURIComponent(cycSel.start)}&ate=${encodeURIComponent(ate)}${forcar?'&nocache=1':''}`).then(r=>r.json()).then(j=>{
        am.carregando=false;
        if(j.erro){ am.erro=j.erro; am.erroKey=amsKey; }
        else { am.dados=j.worklogs||[]; am.pessoas=j.pessoas||{}; am.projetos=j.projetos||{}; am.resumos=j.resumos||{}; am.infos=j.infos||{}; am.range=amsKey; am.quando=new Date(); }
        if(estado.vista==='ams') renderAMS();
      }).catch(e=>{ am.carregando=false; am.erro=String(e.message||e); am.erroKey=amsKey; if(estado.vista==='ams') renderAMS(); });
    }
    amsProntos = !!estado.ams.dados && estado.ams.range===amsKey;
  }
  // Seletor de cliente (um contrato AMS por vez) + navegador de ciclos.
  const amsSelHtml = amsList.length>1 ? `<label class="ams-sel"><span class="muted small">Cliente</span>
      <select id="ams-sel">${amsList.map(c=>`<option value="${escA(c.id)}" ${cSel&&c.id===cSel.id?'selected':''}>${esc(c.cliente||'(sem nome)')}</option>`).join('')}</select></label>` : '';
  const amsNav = cSel ? `<div class="ams-nav">
      ${amsSelHtml}
      <button class="btn" data-ams-nav="prev" ${noPrimeiro?'disabled':''} aria-label="Ciclo anterior">◀ anterior</button>
      <span class="ams-nav-l">Ciclo <strong>${esc(amsLabelCiclo(cycSel))}</strong> · ${esc(fmtBR(cycSel.start))}–${esc(fmtBR(cycSel.end))}${noVigente?' <span class="ams-nav-cur">vigente</span>':''}</span>
      <button class="btn" data-ams-nav="next" ${noVigente?'disabled':''} aria-label="Próximo ciclo">próximo ▶</button>
      ${noVigente?'':'<button class="btn" data-ams-cur>ir ao ciclo vigente</button>'}
      <span class="spacer"></span>
      ${amsProntos&&estado.ams.quando?`<span class="muted small" data-tip="Hora em que os apontamentos deste ciclo foram carregados. Apontou agora no Jira? Clique em Atualizar agora — o Clockwork pode levar alguns minutos para refletir.">🕓 dados de ${esc(estado.ams.quando.toTimeString().slice(0,5))}</span>`:''}
      <button class="btn" data-ams-atualiza data-tip="Busca agora os apontamentos mais recentes, ignorando o cache do servidor (~20 min)">↻ Atualizar agora</button>
    </div>` : '';
  const amsCard=(c)=>{
    const cyc=amsCicloVigente(c,refSel); const cons=amsConsumoCiclo(c,cyc);
    // Só horas faturáveis consomem o pacote/excedente; o total fica como contexto.
    const pool=amsHorasCiclo(c); const h=cons.segFat/3600; const vh=Number(c.valorHora)||0;
    const pctv=pool?Math.round(h/pool*100):0;
    const excedente=Math.max(0,h-pool), banco=Math.max(0,pool-h);
    const parcela=pool*vh, valExced=excedente*vh;
    const risco=pool?(h>=pool?'estourado':(pctv>=85?'risco':'ok')):'ok';
    const cor=risco==='estourado'?'#D20A0A':(risco==='risco'?'#C77700':'#17A398');
    const w=pool?Math.min(100,h/pool*100):0;
    const tag=risco==='estourado'?'<span class="rc2-tag est">esgotado</span>':(risco==='risco'?'<span class="rc2-tag ris">em risco</span>':'');
    const minMes=Number(c.minMes)||0, tetoMes=Number(c.tetoMes)||0;
    // Faturável × não faturável (por tipo de issue — pela descrição do tipo no Jira).
    const pt=amsPorTipo(c,cyc); const fatPct=pt.seg?Math.round(pt.segFat/pt.seg*100):0;
    // Burn-up: consumo acumulado por dia no ciclo (com linha do pacote contratado).
    const ateDia=cyc.end<hoje?cyc.end:hoje;
    const setP=new Set(c.projetos||[]); const wlAms=(estado.ams&&estado.ams.dados)||[]; const porDiaC={};
    wlAms.forEach(w=>{ if(!setP.has(w.p)||!w.f) return; const dd=(w.d||'').slice(0,10); if(dd>=cyc.start&&dd<=ateDia) porDiaC[dd]=(porDiaC[dd]||0)+(Number(w.s)||0); });
    let acc=0; const burn=listaDias(cyc.start,ateDia).map(dd=>{ acc+=(porDiaC[dd]||0); return {x:dd,v:acc}; });
    const burnChart = burn.length>1 ? tsChart([{nome:'Consumo faturável acumulado',cor,vals:burn,tipo:'area'}],
      {fmt:fmtH,yfmt:(v)=>Math.round(v/3600)+'h',readX:(x)=>fmtBR(x),metaY:{v:pool*3600},altura:'180px'}) : '';
    const mesesHtml=cyc.meses.map(ym=>{
      const seg=cons.porMes[ym]||0, mh=seg/3600, lo=minMes&&mh<minMes, hi=tetoMes&&mh>tetoMes;
      const clic = seg>0 ? ' clic' : '';
      const dca = seg>0 ? ` data-ams-mes="${escA(c.id)}|${ym}" title="Ver apontamentos por chamado em ${esc(labelMesAbbr(ym))}"` : '';
      return `<div class="ams-mc ${hi?'hi':(lo?'lo':'')}${clic}"${dca}><div class="mm">${esc(labelMesAbbr(ym))}</div><div class="mh">${fmtH(seg)}</div>
        ${hi?`<div class="mm" style="color:#B91C1C">&gt; teto ${tetoMes}h</div>`:(lo?`<div class="mm" style="color:#B45309">&lt; mín ${minMes}h</div>`:'')}</div>`;
    }).join('');
    // Drill-down: tipo de issue → chamados → link para o Jira.
    const tiposOrd=Object.entries(pt.tipos).sort((a,b)=>b[1].seg-a[1].seg);
    const tiposHtml=tiposOrd.map(([nome,t])=>{
      const chs=Object.entries(t.chamados).sort((a,b)=>b[1].seg-a[1].seg);
      const linhas=chs.map(([k,ch])=>{
        const temK=k && k!=='(sem chave)';
        const alvo=temK?`<a href="${jiraBase()}/browse/${encodeURIComponent(k)}" target="_blank" rel="noopener">${esc(k)} ↗</a>`:'<span class="muted">(sem chave)</span>';
        const cc=amsNumCliente(k);
        return `<div class="ams-ch"><span class="ams-ch-k">${alvo}</span>${cc?`<span class="ams-ch-cc" data-tip="Número do Chamado Cliente">🔖 ${esc(cc)}</span>`:''}<span class="ams-ch-r">${esc(amsResumoChamado(k))}</span><span class="ams-ch-h">${fmtH(ch.seg)}</span></div>`;
      }).join('');
      const pctT=pt.seg?Math.round(t.seg/pt.seg*100):0;
      return `<details class="ams-tipo${t.f?'':' nf'}">
        <summary><span class="ams-tp-ic ${t.f?'fat':'nfat'}">${t.f?'●':'○'}</span><span class="ams-tp-n">${esc(nome)}</span>
          <span class="ams-tp-b ${t.f?'fat':'nfat'}">${t.f?'faturável':'não faturável'}</span>
          <span class="ams-tp-h">${fmtH(t.seg)} · ${pctT}%</span></summary>
        <div class="ams-chamados">${linhas||'<div class="muted small">Sem chamados.</div>'}</div>
      </details>`;
    }).join('');
    return `<div class="ams-card ${risco}">
      <div class="ams-head"><strong>${esc(c.cliente||'(sem nome)')}</strong>
        <span class="badge">AMS · ${esc(amsLabelApur(c.apuracao||'trimestral').toLowerCase())}</span>${tag}
        <span class="ciclo">Ciclo ${esc(amsLabelCiclo(cyc))} · ${esc(fmtBR(cyc.start))}–${esc(fmtBR(cyc.end))}</span>
        <button class="btn ams-pdf" data-ams-pdf="${escA(c.id)}" title="Exportar a apuração deste contrato em PDF">PDF da apuração</button></div>
      <div class="ams-bar"><div class="ams-track"><div class="ams-fill" style="width:${w.toFixed(1)}%;background:${cor}"></div></div>
        <div class="ams-bar-l"><span><strong>${fmtH(cons.segFat)}</strong> faturáveis de ${pool}h no ciclo (${pctv}%)</span>
          <span class="muted">${cons.seg!==cons.segFat?`${fmtH(cons.seg)} no total · `:''}${excedente>0?`excedente ${fmtH(Math.round(excedente*3600))}`:`banco ${fmtH(Math.round(banco*3600))} disponível`}</span></div></div>
      <div class="ams-kpis">
        <div class="ams-k"><div class="v">${fmtH(Math.round(banco*3600))}</div><div class="l">Banco de horas</div></div>
        <div class="ams-k"><div class="v ${excedente>0?'over':''}">${excedente>0?fmtH(Math.round(excedente*3600)):'0h'}</div><div class="l">Excedente (autorizar)</div></div>
        <div class="ams-k"><div class="v">${vh?fmtBRL(parcela):'—'}</div><div class="l">Parcela do ciclo (${pool}h)</div></div>
        <div class="ams-k"><div class="v">${vh?fmtBRL(parcela+valExced):'—'}</div><div class="l">Faturamento do ciclo</div></div>
      </div>
      <div class="ams-fat">
        <div class="ams-fat-bar"><i class="fat" style="width:${fatPct}%"></i><i class="nfat" style="width:${100-fatPct}%"></i></div>
        <div class="ams-fat-l"><span><b style="color:#188918">${fmtH(pt.segFat)}</b> faturáveis</span>
          <span><b style="color:#C77700">${fmtH(pt.segNao)}</b> não faturáveis</span>
          <span class="muted">${fatPct}% faturável no ciclo</span></div></div>
      ${burnChart?`<div class="muted small" style="font-weight:600;margin:6px 0 2px">Evolução do consumo faturável no ciclo <span class="muted" style="font-weight:400">(linha tracejada = pacote de ${pool}h; só horas faturáveis consomem o pacote)</span></div>${burnChart}`:''}
      <div class="muted small" style="font-weight:600;margin:10px 0 2px">Por mês no ciclo <span class="muted" style="font-weight:400">(clique num mês para ver os apontamentos por chamado${minMes||tetoMes?` · mín ${minMes||'–'}h · teto ${tetoMes||'–'}h/mês`:''})</span></div>
      <div class="ams-months">${mesesHtml}</div>
      <div class="muted small" style="font-weight:600;margin:12px 0 4px">Horas por tipo de issue <span class="muted" style="font-weight:400">(clique no tipo para ver os chamados → Jira)</span></div>
      <div class="ams-tipos">${tiposHtml||'<div class="muted small">Sem apontamentos neste ciclo.</div>'}</div>
      ${excedente>0?`<div class="ams-note">⚠ Acima das ${pool}h do ciclo — o excedente (${fmtH(Math.round(excedente*3600))} · ${fmtBRL(valExced)}) só com <strong>autorização prévia</strong> e é faturado junto com o ciclo.</div>`:''}
      ${c.bancoHoras!==false?`<div class="ams-note">Banco de horas: o saldo vale até o fim do ciclo e <strong>não acumula</strong> para o próximo.</div>`:''}
      <div class="rc2-meta muted small">Projetos: ${(c.projetos||[]).map(esc).join(', ')||'—'}</div>
    </div>`;
  };
  let amsSection='';
  if(!amsList.length){
    amsSection=`<div class="card full"><h2>AMS &amp; Governança</h2>
      <div class="estado">Nenhum contrato <strong>AMS</strong> com projetos mapeados. Cadastre o contrato e mapeie os projetos na aba <strong>⚙️ Admin</strong>.</div></div>`;
  } else if(!amsProntos){
    amsSection=`<div class="card full"><h2>AMS &amp; Governança <span>apuração por ciclo · ${esc((cSel&&cSel.cliente)||'')}</span></h2>
      ${amsNav}
      ${estado.ams.erro?`<div class="aviso">Não foi possível carregar a apuração do ciclo: ${esc(estado.ams.erro)}</div>`:'<div class="estado">Carregando apuração do ciclo (banco de horas)…</div>'}</div>`;
  } else {
    amsSection=`<div class="card full"><h2>AMS &amp; Governança <span>apuração por ciclo · ${esc(cSel.cliente||'')}</span></h2>
        ${amsNav}
        <div class="muted small" style="margin:8px 0 12px">Apuração do <strong>ciclo selecionado</strong> deste contrato (independente do período do topo). Faturável vs não faturável vem da <strong>descrição do tipo</strong> do chamado no Jira; <strong>só as horas faturáveis consomem o pacote/excedente</strong>. O banco de horas vale dentro do ciclo; o excedente requer autorização e é faturado junto.</div>
        ${amsDadosCard(cSel, cycSel)}
        ${amsCard(cSel)}
        ${amsChamadosCard(cSel, cycSel)}
        ${amsRelatoriosCard(cSel, cycSel)}
      </div>`;
  }
  cont.replaceChildren(el(`<div>${amsSection}</div>`));
}

function renderReceita(){
  const cont=document.getElementById('conteudo');
  if(!estado.tempo){ cont.replaceChildren(el(skeletonPainel())); return; }
  const contratos=(cfg.contratos||[]);
  if(!contratos.length){
    cont.replaceChildren(el(`<div><div class="card full"><h2>💰 Receita — bolsa de horas &amp; projetos</h2>
      <div class="estado">Nenhum contrato cadastrado ainda.<br><br>
      Cadastre clientes, valor-hora e os projetos do Jira na aba <strong>⚙️ Admin</strong> para liberar esta visão.
      <span class="muted">(Os contratos <strong>AMS</strong> aparecem na aba <strong>AMS &amp; Governança</strong>.)</span><br><br>
      <button class="btn primario" data-ir-admin>Ir para ⚙️ Admin</button></div></div></div>`));
    return;
  }

  const meta=estado.tempo.meta||{};
  const dias=listaDias(meta.startDate, meta.endDate);
  const hoje=hojeSP();
  const diasUteis=dias.filter(d=>ehUtil(d)&&!ehFeriado(d));
  const decorridos=diasUteis.filter(d=>d<hoje).length;   // dias úteis já fechados no período
  const totalUteis=diasUteis.length;

  // ---- Bolsa de horas / projeto fechado: projeção pelo período da tela ----
  const outros=contratos.filter(c=>c.tipo!=='ams');
  const linhas=outros.map(c=>{
    const an=analisaContrato(c);
    const contrSeg=(Number(c.horasContratadas)||0)*3600;
    const pace=decorridos>0 ? an.seg/decorridos : 0;             // ritmo por dia útil fechado
    const projSeg=decorridos>0 ? pace*totalUteis : an.seg;       // projeção linear até o fim do período
    const pctAtual=contrSeg?Math.round(an.seg/contrSeg*100):null;
    const pctProj=contrSeg?Math.round(projSeg/contrSeg*100):null;
    let prev='';
    if(contrSeg>0){
      if(an.seg>=contrSeg) prev='já esgotado';
      else if(pace>0 && projSeg>contrSeg){
        const iCross=Math.ceil(contrSeg/pace);                  // índice do dia útil que cruza o teto
        prev=diasUteis[iCross-1] ? fmtBR(diasUteis[iCross-1]) : 'após o período';
      }
    }
    const risco = contrSeg>0 ? (an.seg>=contrSeg ? 'estourado' : (pctProj!=null && pctProj>=85 ? 'risco' : 'ok')) : 'ok';
    return { c, an, contrSeg, pctAtual, pctProj, projSeg, prev, risco };
  }).sort((a,b)=> (b.pctProj||0)-(a.pctProj||0) || b.an.valor-a.an.valor);

  const totSeg=linhas.reduce((s,l)=>s+l.an.seg,0);
  const totFat=linhas.reduce((s,l)=>s+l.an.segFat,0);
  const totValor=linhas.reduce((s,l)=>s+l.an.valor,0);
  const totContr=outros.reduce((s,c)=>s+(Number(c.horasContratadas)||0),0);
  const emRisco=linhas.filter(l=>l.risco!=='ok').length;

  const card=(l)=>{
    const c=l.c, an=l.an, contr=Number(c.horasContratadas)||0;
    const fatPct=an.seg?Math.round(an.segFat/an.seg*100):0;
    const w=l.contrSeg?Math.min(100, an.seg/l.contrSeg*100):0;
    const wp=l.contrSeg?Math.min(100, l.projSeg/l.contrSeg*100):0;
    const cor=l.risco==='estourado'?'#D20A0A':(l.risco==='risco'?'#C77700':'#188918');
    const tag=l.risco==='estourado'?'<span class="rc2-tag est">esgotado</span>'
             :l.risco==='risco'?'<span class="rc2-tag ris">em risco</span>':'';
    return `<div class="rc2-card ${l.risco}">
      <div class="rc2-top"><strong>${esc(c.cliente||'(sem nome)')}</strong>
        <span class="badge">${esc(rotuloTipo(c.tipo))}</span><span class="spacer"></span>${tag}</div>
      ${contr?`<div class="rc2-bar"><div class="rc2-track">
          <div class="rc2-fill" style="width:${w.toFixed(1)}%;background:${cor}"></div>
          ${wp>w+0.5?`<div class="rc2-proj" style="left:${wp.toFixed(1)}%" data-tip="Projeção até o fim do período"></div>`:''}
        </div>
        <div class="rc2-bar-l"><span><strong>${fmtH(an.seg)}</strong> de ${contr}h${c.tipo==='ams'?'/mês':''}${l.pctAtual!=null?` (${l.pctAtual}%)`:''}</span>
          ${l.pctProj!=null?`<span class="muted">projeção ${l.pctProj}%${l.prev?` · esgota ~${esc(l.prev)}`:''}</span>`:''}</div></div>`
        :`<div class="rc2-bar-l" style="margin:10px 0"><span><strong>${fmtH(an.seg)}</strong> consumidas <span class="muted">(sem horas contratadas)</span></span></div>`}
      <div class="rc2-fin">
        <div><div class="rc2-fv">${c.valorHora?fmtBRL(an.valor):'—'}</div><div class="rc2-fl">Receita estimada</div></div>
        <div><div class="rc2-fv">${c.valorHora?fmtBRL(c.valorHora):'—'}</div><div class="rc2-fl">Valor-hora</div></div>
        <div><div class="rc2-fv">${fatPct}%</div><div class="rc2-fl">Faturável</div></div>
      </div>
      <div class="rc2-meta muted small">Projetos: ${(c.projetos||[]).map(esc).join(', ')||'—'}</div>
    </div>`;
  };

  const genericoSection = outros.length ? `
    <div class="kpis">
      <div class="kpi t"><div class="v">${fmtBRL(totValor)}</div><div class="l">Receita estimada</div></div>
      <div class="kpi t"><div class="v">${fmtH(totSeg)}</div><div class="l">Horas consumidas</div></div>
      <div class="kpi a"><div class="v">${totContr}h</div><div class="l">Horas contratadas</div></div>
      <div class="kpi t"><div class="v">${totSeg?Math.round(totFat/totSeg*100):0}%</div><div class="l">Horas faturáveis</div></div>
      <div class="kpi w"><div class="v">${emRisco}</div><div class="l">Contratos em risco</div></div>
    </div>
    <div class="card full"><h2>💰 Bolsa de horas & projetos <span>${outros.length} contrato(s)</span></h2>
      <div class="muted small" style="margin-bottom:12px">Consumo e receita estimada no <strong>período selecionado</strong>. A projeção estende o ritmo dos dias úteis já fechados (${decorridos}/${totalUteis}) até o fim do período; a marca escura na barra indica a projeção.</div>
      <div class="rc2-grid">${linhas.map(card).join('')}</div>
    </div>` : '';

  cont.replaceChildren(el(`<div>
    ${genericoSection || `<div class="card full"><h2>💰 Receita — bolsa de horas &amp; projetos</h2>
      <div class="estado">Nenhum contrato de <strong>bolsa de horas</strong> ou <strong>projeto fechado</strong> cadastrado.<br>
      Os contratos <strong>AMS</strong> têm aba própria (<strong>AMS &amp; Governança</strong>). Cadastre contratos na aba <strong>⚙️ Admin</strong>.</div></div>`}
  </div>`));
}

// ---- Listeners delegados desta tela (#conteudo / #modal-body / document) ----
// Receita / AMS: navegação de ciclo + PDF da apuração por contrato.
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const nav=e.target.closest&&e.target.closest('[data-ams-nav]');
  if(nav){ escondeTip(); const dir=nav.getAttribute('data-ams-nav');
    const ams=(cfg.contratos||[]).filter(c=>c.tipo==='ams'&&(c.projetos||[]).length);
    const rep=amsContratoSel(ams); const cm=amsCicloMeses((rep&&rep.apuracao)||'trimestral'); const ref=amsRefSel();
    if(dir==='prev'){ const nr=amsShiftRef(ref,-1,cm);
      // Não recua antes do 1º ciclo do contrato: trava o ref no início do ciclo atual.
      if(rep && amsCicloVigente(rep,nr).start===amsCicloVigente(rep,ref).start) estado.ams.ref=amsCicloVigente(rep,ref).start;
      else estado.ams.ref=nr; }
    else if(dir==='next'){ const nr=amsShiftRef(ref,1,cm);
      if(rep && amsCicloVigente(rep,nr).start>=amsCicloVigente(rep,hojeSP()).start) estado.ams.ref='';
      else estado.ams.ref=nr; }
    renderAMS(); return; }
  const cur=e.target.closest&&e.target.closest('[data-ams-cur]');
  if(cur){ escondeTip(); estado.ams.ref=''; renderAMS(); return; }
  const atz=e.target.closest&&e.target.closest('[data-ams-atualiza]');
  if(atz){ escondeTip(); estado.ams.dados=null; estado.ams.range=''; estado.ams.erroKey=''; estado.ams.forcar=true; renderAMS(); return; }
  const pdf=e.target.closest&&e.target.closest('[data-ams-pdf]');
  if(pdf){ escondeTip(); pdfApuracaoAMS(pdf.getAttribute('data-ams-pdf')); return; }
  const mes=e.target.closest&&e.target.closest('[data-ams-mes]');
  if(mes){ escondeTip(); const v=mes.getAttribute('data-ams-mes'); const i=v.indexOf('|'); amsDrillMes(v.slice(0,i), v.slice(i+1)); return; }
  const rel=e.target.closest&&e.target.closest('[data-ams-rel]');
  if(rel){ escondeTip(); amsDrillRel((estado.ams&&estado.ams.sel)||'', rel.getAttribute('data-ams-rel'), rel.getAttribute('data-ams-relv')); return; }
  const amsEdit=e.target.closest&&e.target.closest('[data-ams-edit]');
  if(amsEdit){ escondeTip(); estado.admin.editId=amsEdit.getAttribute('data-ams-edit'); vaiPara('admin'); return; }
  const fat=e.target.closest&&e.target.closest('[data-ams-fatura]');
  if(fat){ escondeTip();
    const ams=(cfg.contratos||[]).filter(c=>c.tipo==='ams'&&(c.projetos||[]).length);
    const c=amsContratoSel(ams); if(!c) return;
    // O status fica salvo para o time (Supabase); a gravação compartilhada exige login do Jira.
    if(cfgShared && !idApontar()){ abreIdentidade(); return; }
    const cyc=amsCicloVigente(c, amsRefSel());
    // Chaves dos chamados do ciclo ANTES do re-render (que pode recarregar os dados).
    const keys=amsChamadosCiclo(c,cyc).map(o=>o.k).filter(k=>/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(k));
    c.faturados=c.faturados||{};
    const marcar=!c.faturados[cyc.start];
    if(marcar){ const id0=idApontar(); c.faturados[cyc.start]={ em:hojeSP(), por:(id0&&(id0.nome||id0.email))||'' }; }
    else delete c.faturados[cyc.start];
    salvaCfg(); renderAMS();
    // Reflete NO JIRA: labels "faturado" + "ciclo-<início>" em todos os chamados do
    // ciclo — adicionadas ao marcar, removidas ao desmarcar (com o token de quem marca).
    const idJ=idApontar();
    if(!idJ){ toast('Ciclo atualizado no painel — identifique-se (token do Jira) para gravar as labels nos tickets.','err'); return; }
    if(!keys.length){ toast(`Ciclo ${marcar?'marcado como faturado':'desmarcado'} — nenhum chamado com chave para rotular no Jira.`,'ok'); return; }
    const labels=['faturado', 'ciclo-'+cyc.start];
    toast(`${marcar?'Gravando':'Removendo'} a marcação de faturado em ${keys.length} ticket(s) no Jira…`);
    fetch('/api/transicao',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({rotular:true, issues:keys, labels, remover:!marcar, email:idJ.email, token:idJ.token})})
      .then(r=>r.json()).then(j=>{
        if(j.ok){ toast(`✓ ${j.rotulados} ticket(s) ${marcar?'marcados como FATURADO':'desmarcados'} no Jira (labels ${labels.join(', ')}).`,'ok');
          logAcao({acao:marcar?'ams-faturado':'ams-desfaturado', t:'', de:c.nome||c.id, para:`${j.rotulados} tickets · ciclo ${cyc.start}`, ok:true}); }
        else toast(`⚠ Labels no Jira: ${j.rotulados||0} ok, ${((j.falhas||[]).length)||'?'} falha(s)${j.erro?' — '+j.erro:''}. O status do ciclo no painel foi salvo.`,'err');
      }).catch(e=>toast('⚠ Falha ao gravar as labels no Jira: '+(e.message||e)+'. O status do ciclo no painel foi salvo.','err'));
    return; }
});
// AMS: seletor de cliente (mostra um contrato por vez; volta ao ciclo vigente ao trocar).
document.getElementById('conteudo').addEventListener('change', (e)=>{
  if(e.target && e.target.id==='ams-sel'){ estado.ams.sel=e.target.value; estado.ams.ref=''; renderAMS(); }
});
// ---- Administração: cadastro de contratos ----
document.getElementById('conteudo').addEventListener('click', (e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-ir-admin')){ vaiPara('admin'); return; }
  if(t.id==='ad-salvar'){ salvaContrato(); }
  else if(t.id==='ad-cancelar'){ estado.admin.editId=null; renderAdmin(); }
  else if(t.hasAttribute('data-ad-edit')){ estado.admin.editId=t.getAttribute('data-ad-edit'); renderAdmin(); window.scrollTo({top:0,behavior:'smooth'}); }
  else if(t.hasAttribute('data-ad-del')){ const id=t.getAttribute('data-ad-del');
    cfg.contratos=(cfg.contratos||[]).filter(c=>c.id!==id); if(estado.admin.editId===id) estado.admin.editId=null; salvaCfg(); renderAdmin(); }
  else if(t.hasAttribute('data-ad-portal')||t.hasAttribute('data-ad-portal-novo')){
    const id=t.getAttribute('data-ad-portal')||t.getAttribute('data-ad-portal-novo');
    const c=(cfg.contratos||[]).find(x=>x.id===id);
    if(c){ c.portalToken='pt'+Date.now().toString(36)+Math.random().toString(36).slice(2,12); salvaCfg(); renderAdmin(); }
  }
  else if(t.hasAttribute('data-ad-portal-copy')){
    const url=t.getAttribute('data-ad-portal-copy');
    const done=()=>{ const o=t.textContent; t.textContent='copiado!'; setTimeout(()=>{ t.textContent=o; },1500); };
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(url).then(done).catch(()=>{
      const i=t.parentNode.querySelector('[data-ad-portal-input]'); if(i){ i.select(); document.execCommand('copy'); done(); } }); }
    else { const i=t.parentNode.querySelector('[data-ad-portal-input]'); if(i){ i.select(); document.execCommand('copy'); done(); } }
  }
});
