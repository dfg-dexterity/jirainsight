// Jira Insights · 07 · 📊 GRÁFICOS (SVG sem dependências: sparkline, área, donut, treemap,
// tsChart interativo) e cards base por pessoa/projeto.

// Barras empilhadas: quanto cada pessoa trabalhou em cada projeto (respeita filtros).
function cardPessoaProjeto(){
  const f=filtros(); const projs=projetosUnidos(); const pessoasNome=pessoasUnidas();
  const porPessoa={}, totProj={};
  (estado.tempo.worklogs||[]).forEach(w=>{
    if(!passa(w.p,w.t,projs,f)) return;
    if(f.pessoa && w.a!==f.pessoa) return;
    (porPessoa[w.a]=porPessoa[w.a]||{})[w.p]=((porPessoa[w.a]&&porPessoa[w.a][w.p])||0)+w.s;
    totProj[w.p]=(totProj[w.p]||0)+w.s;
  });
  const ativos=Object.keys(porPessoa);
  if(!ativos.length) return '<div class="estado">Sem horas para os filtros atuais.</div>';

  const orden=Object.entries(totProj).sort((a,b)=>b[1]-a[1]);
  const top=orden.slice(0,PALETA.length).map(([k])=>k);
  const corDe={}; top.forEach((k,i)=>corDe[k]=PALETA[i]);
  const nomeProj=(k)=>projNome(k);   // a interface mostra o NOME do projeto

  const linhas=ativos.map(a=>{
    const segs=porPessoa[a]; const tot=Object.values(segs).reduce((s,v)=>s+v,0);
    return { a, nome:(pessoasNome[a]&&pessoasNome[a].nome)||a, segs, tot };
  }).sort((x,y)=>y.tot-x.tot);
  const maxTot=Math.max(1,...linhas.map(l=>l.tot));

  const rows=linhas.map(l=>{
    const partes=[]; let outros=0;
    top.forEach(k=>{ if(l.segs[k]) partes.push([nomeProj(k),l.segs[k],corDe[k],k]); });
    Object.keys(l.segs).forEach(k=>{ if(!top.includes(k)) outros+=l.segs[k]; });
    if(outros>0) partes.push(['Outros projetos',outros,COR_OUTROS,null]);
    const stack=partes.map(([nm,v,c,rawK])=>{
      const dr=rawK?` data-drill="projeto" data-key="${escA(rawK)}" data-tipk="clique para detalhar o projeto"`:'';
      return `<span${dr} style="width:${l.tot>0?v/l.tot*100:0}%;background:${c}" data-tip="${escA(nm)}" data-tip2="${escA(fmtH(v))}"></span>`;
    }).join('');
    return `<div class="pp-row"><div class="pp-nome" data-pessoa="${esc(l.a)}" data-tip="${escA(l.nome)}" data-tipk="clique para ver a pessoa">${esc(l.nome)}</div>
      <div class="pp-track"><div class="pp-stack anima" style="width:${Math.max(3,l.tot/maxTot*100)}%">${stack}</div></div>
      <div class="pp-val">${fmtH(l.tot)}</div></div>`;
  }).join('');

  const legenda=top.map(k=>`<span data-drill="projeto" data-key="${escA(k)}" data-tip="${escA(k)}" data-tipk="clique para detalhar"><i style="background:${corDe[k]}"></i>${esc(projNome(k))}</span>`).join('')
    + (orden.length>top.length?`<span><i style="background:${COR_OUTROS}"></i>Outros</span>`:'');
  return `<div class="pp-legend">${legenda}</div><div class="pp-list">${rows}</div>`;
}

// Barras: faturável vs não faturável por pessoa (respeita filtros).
function cardFaturavelPessoa(){
  const f=filtros(); const projs=projetosUnidos(); const pessoasNome=pessoasUnidas();
  const fat={}, nao={};
  (estado.tempo.worklogs||[]).forEach(w=>{
    if(!passa(w.p,w.t,projs,f)) return;
    if(f.pessoa && w.a!==f.pessoa) return;
    if(wFat(w)) fat[w.a]=(fat[w.a]||0)+w.s; else nao[w.a]=(nao[w.a]||0)+w.s;   // 💰 pela categoria do projeto (wFat, 01)
  });
  const ids=new Set([...Object.keys(fat),...Object.keys(nao)]);
  if(!ids.size) return '<div class="estado">Sem horas para os filtros atuais.</div>';
  const linhas=[...ids].map(a=>({
    a, nome:(pessoasNome[a]&&pessoasNome[a].nome)||a, fat:fat[a]||0, nao:nao[a]||0, tot:(fat[a]||0)+(nao[a]||0)
  })).sort((x,y)=>y.tot-x.tot).slice(0,14);
  const maxTot=Math.max(1,...linhas.map(l=>l.tot));
  const rows=linhas.map(l=>{
    const stack=
      `<span style="width:${l.tot>0?l.fat/l.tot*100:0}%;background:${cores.musgo}" data-tip="Faturável" data-tip2="${escA(fmtH(l.fat))}"></span>`+
      `<span style="width:${l.tot>0?l.nao/l.tot*100:0}%;background:${cores.amarelo}" data-tip="Não faturável" data-tip2="${escA(fmtH(l.nao))}"></span>`;
    return `<div class="pp-row"><div class="pp-nome" data-pessoa="${esc(l.a)}" data-tip="${escA(l.nome)}" data-tipk="clique para ver a pessoa">${esc(l.nome)}</div>
      <div class="pp-track"><div class="pp-stack anima" style="width:${Math.max(3,l.tot/maxTot*100)}%">${stack}</div></div>
      <div class="pp-val">${pct(l.fat,l.tot)}%</div></div>`;
  }).join('');
  const leg=`<div class="pp-legend"><span><i style="background:${cores.musgo}"></i>Faturável</span>`+
    `<span><i style="background:${cores.amarelo}"></i>Não faturável</span></div>`;
  return leg+`<div class="pp-list">${rows}</div>`;
}

// Mini-gráfico de linha (tendência) em SVG.
function sparkline(vals, w, h, cor){
  w=w||260; h=h||46; cor=cor||cores.cerceta;
  if(!vals.length) return '<div class="muted small">Sem dados.</div>';
  const max=Math.max(1,...vals);
  const stepX=vals.length>1 ? w/(vals.length-1) : 0;
  const xy=(v,i)=>[ (i*stepX), (h-5 - v/max*(h-10)) ];
  const pts=vals.map((v,i)=>xy(v,i).map(n=>n.toFixed(1)).join(',')).join(' ');
  const dots=vals.map((v,i)=>{ const [x,y]=xy(v,i); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${cor}"/>`; }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:clamp(52px,9vh,110px)" preserveAspectRatio="none">
    <polyline points="${pts}" fill="none" stroke="${cor}" stroke-width="2"/>${dots}</svg>`;
}

// ---- Gráficos modernos reutilizáveis (área suave + donut) ----
let _gradSeq=0;
// Área com linha suave (Catmull-Rom→Bézier), gradiente, pontos interativos e animação.
// pts: [{x,v,drill?}] · opts:{cor, fmt, alturaCss}
function areaChart(pts, opts){
  opts=opts||{}; const cor=opts.cor||cores.cerceta; const fmt=opts.fmt||fmtH;
  if(!pts.length) return '<div class="estado">Sem dados no período.</div>';
  const W=1000,H=190,padT=12,padB=26,padX=10;
  const max=Math.max(1,...pts.map(p=>p.v)); const n=pts.length;
  const stepX=n>1?(W-2*padX)/(n-1):0;
  const X=(i)=>padX+i*stepX, Y=(v)=>padT+(1-v/max)*(H-padT-padB);
  const P=pts.map((p,i)=>[X(i),Y(p.v)]);
  let d=`M ${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for(let i=0;i<P.length-1;i++){
    const p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||P[i+1];
    const c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6;
    const c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
    d+=` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  const base=H-padB;
  const dArea=`${d} L ${X(n-1).toFixed(1)} ${base} L ${X(0).toFixed(1)} ${base} Z`;
  const gid='ac'+(++_gradSeq);
  const dots=pts.map((p,i)=>{
    const dr=p.drill?` data-drill="${escA(p.drill.type)}" data-key="${escA(p.drill.key)}" data-tipk="clique para detalhar"`:'';
    return `<circle class="ac-dot" cx="${X(i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="3.4" fill="#fff" stroke="${cor}" stroke-width="2"${dr} data-tip="${escA(p.x)}" data-tip2="${escA(fmt(p.v))}"/>`;
  }).join('');
  const every=Math.ceil(n/9);
  const labels=pts.map((p,i)=>(i%every===0||i===n-1)?`<text class="ac-xl" x="${X(i).toFixed(1)}" y="${H-7}" text-anchor="middle">${esc(String(p.x).slice(5))}</text>`:'').join('');
  return `<svg class="areachart" viewBox="0 0 ${W} ${H}" style="${opts.alturaCss?('height:'+opts.alturaCss):''}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${cor}" stop-opacity=".26"/><stop offset="100%" stop-color="${cor}" stop-opacity="0"/></linearGradient></defs>
    <path class="ac-area" d="${dArea}" fill="url(#${gid})"/>
    <path class="ac-line" d="${d}" fill="none" stroke="${cor}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${labels}</svg>`;
}
// Donut/gauge com porcentagem central e animação de preenchimento.
function donut(pctv, label, cor){
  cor=cor||cores.cerceta; const p=Math.max(0,Math.min(100,Math.round(pctv||0)));
  const r=42, c=2*Math.PI*r, off=c*(1-p/100);
  return `<div class="donut-wrap"><svg viewBox="0 0 100 100" class="donut" role="img" aria-label="${escA((label||'')+': '+p+'%')}">
    <circle class="donut-track" cx="50" cy="50" r="${r}" fill="none" stroke-width="11"/>
    <circle class="donut-val" cx="50" cy="50" r="${r}" fill="none" stroke="${cor}" stroke-width="11" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 50 50)"
      style="--c:${c.toFixed(1)};--off:${off.toFixed(1)};animation:donutFill 1.1s cubic-bezier(.2,.7,.2,1) forwards"/>
    <text class="donut-pct" x="50" y="49" text-anchor="middle" dominant-baseline="middle">${p}%</text>
    <text class="donut-lbl" x="50" y="65" text-anchor="middle">${esc(label||'')}</text></svg></div>`;
}

// Treemap (squarified) interativo: áreas proporcionais ao valor, rótulo por célula,
// hover (realce + tooltip) e clique para drill-down. items:[{nome,valor,cor?,drill?}].
function treemap(items, opts){
  opts=opts||{}; const fmt=opts.fmt||(v=>String(v));
  items=(items||[]).filter(i=>(+i.valor)>0).slice().sort((a,b)=>b.valor-a.valor);
  if(!items.length) return '<div class="estado">Sem dados para os filtros atuais.</div>';
  const W=1000, H=opts.h||440;
  const total=items.reduce((s,i)=>s+(+i.valor),0)||1;
  const nodes=items.map(it=>({it, area:(+it.valor)/total*(W*H)}));
  let x=0,y=0,w=W,h=H,i=0; const placed=[];
  const worst=(row,side)=>{ const s=row.reduce((a,n)=>a+n.area,0),mx=Math.max(...row.map(n=>n.area)),mn=Math.min(...row.map(n=>n.area));
    return Math.max((side*side*mx)/(s*s),(s*s)/(side*side*mn)); };
  while(i<nodes.length){
    const side=Math.min(w,h); let row=[nodes[i]],j=i+1,cur=worst(row,side);
    while(j<nodes.length){ const t=row.concat(nodes[j]); const wt=worst(t,side); if(wt<=cur){ row=t; cur=wt; j++; } else break; }
    const s=row.reduce((a,n)=>a+n.area,0);
    if(w>=h){ const thick=s/h; let yy=y; row.forEach(n=>{ const hh=n.area/thick; placed.push({it:n.it,x,y:yy,w:thick,h:hh}); yy+=hh; }); x+=thick; w-=thick; }
    else { const thick=s/w; let xx=x; row.forEach(n=>{ const ww=n.area/thick; placed.push({it:n.it,x:xx,y,w:ww,h:thick}); xx+=ww; }); y+=thick; h-=thick; }
    i=j;
  }
  const rects=placed.map((p,idx)=>{
    const c=p.it.cor||PALETA[idx%PALETA.length];
    const showName=p.w>140&&p.h>34, showVal=p.w>64&&p.h>24;
    const px=p.x+11, py=p.y+24, maxch=Math.floor((p.w-18)/8.6);
    const nm=String(p.it.nome||''); const nmS=nm.length>maxch?nm.slice(0,Math.max(1,maxch-1))+'…':nm;
    const dr=p.it.drill?` data-drill="${escA(p.it.drill.type)}" data-key="${escA(p.it.drill.key)}" data-tipk="clique para detalhar"`:'';
    return `<g class="tm-cell"${dr} data-tip="${escA(nm)}" data-tip2="${escA(fmt(p.it.valor))}">
      <rect x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" width="${Math.max(0,p.w-2).toFixed(1)}" height="${Math.max(0,p.h-2).toFixed(1)}" rx="6" fill="${c}"/>
      ${showName?`<text class="tm-n" x="${px.toFixed(1)}" y="${py.toFixed(1)}">${esc(nmS)}</text>`:''}
      ${showVal?`<text class="tm-v" x="${px.toFixed(1)}" y="${(py+(showName?20:0)).toFixed(1)}">${esc(fmt(p.it.valor))}</text>`:''}
    </g>`;
  }).join('');
  return `<div class="tm"><svg viewBox="0 0 ${W} ${H}" class="tm-svg" preserveAspectRatio="xMidYMid meet">${rects}</svg></div>`;
}

// ===== Motor de gráficos premium interativos (SVG, sem dependências) =====
// Série temporal multi-séries com crosshair que segue o cursor, leitura ("readout")
// ao passar o mouse, gridlines, linha de meta e animação. Toda a interação usa um
// registro em memória + um único handler global; o posicionamento dos overlays é por
// PORCENTAGEM (derivada do viewBox), então não distorce mesmo com a SVG esticada.
//
// 📊 Dashboard de KPIs (2026-11-07, a pedido do usuário: "gráficos e relatórios modernos
// interativos… comparar em uma linha de tempo os indicadores"): o motor ganhou, SEM mudar
// quem já o usa, barras (agrupadas/empilhadas), série de referência, legenda que esconde
// série, zoom por arrastar (brush), anotações, tabela acessível, drill por função e
// valores ausentes. Tudo opt-in: sem as opções novas a saída é a de antes.
const _TSC = {}; let _tscSeq = 0;
function _tscReset(){ for(const k in _TSC) delete _TSC[k]; }
function _tscNice(v){ if(v<=0) return 1; const e=Math.pow(10,Math.floor(Math.log10(v))); const f=v/e;
  const n=f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10; return n*e; }
function _tscSmooth(P){ if(!P.length) return ''; let d=`M ${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for(let i=0;i<P.length-1;i++){ const p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||P[i+1];
    const c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6,c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
    d+=` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`; }
  return d; }
// Linha reta (contagens: a curva suave "inventa" subidas e descidas entre os pontos).
function _tscReta(P){ return P.map((p,i)=>(i?'L ':'M ')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' '); }
// Cor como atributo SVG; "var(--x)" só funciona em style, então vai por lá.
function _tscCor(prop, cor){ return /^var\(/.test(cor) ? ` style="${prop}:${cor}"` : ` ${prop}="${cor}"`; }
const _tscNum = v => (v==null || v==='' || !isFinite(v)) ? null : +v;

// ---- paleta e formatos do Dashboard (a paleta é validada em 3 superfícies; ver o bloco
// "📊 Dashboard de KPIs" do app.css, que define --dsh-1…6 por tema) ----
// Ordem FIXA: a cor segue a entidade, nunca a posição na fila (filtrar não repinta).
const DSH_CORES = ['var(--dsh-1)','var(--dsh-2)','var(--dsh-3)','var(--dsh-4)','var(--dsh-5)','var(--dsh-6)'];
const DSH_STATUS = { ok:'var(--musgo)', warn:'var(--amarelo)', err:'var(--err)', nd:'var(--muted2)' };
// i-ésima série; da 6ª em diante é o cinza do "Outros" (a 7ª série vira "Outros", não ganha hue).
function dshCorDe(i){ i=Math.max(0,i|0); return DSH_CORES[Math.min(i, DSH_CORES.length-1)]; }
const _dshLoc = (v,d) => Number(v).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:d});
// un: 'h' · 'R$' · '%' · 'n'. modo: falso = leitura completa · true = eixo (compacto) · 'hero' = número grande do tile.
function dshFmt(un, v, modo){
  v=_tscNum(v); if(v==null) return '—';
  const a=Math.abs(v);
  if(un==='R$'){
    if(modo===true || (modo==='hero' && a>=1e5)){
      if(a>=1e6) return 'R$ '+_dshLoc(v/1e6, a>=1e7?0:1)+' mi';
      if(a>=1e3) return 'R$ '+_dshLoc(v/1e3, a>=1e5?0:1)+' mil';
      return 'R$ '+_dshLoc(v,0);
    }
    return 'R$ '+_dshLoc(v, a>=1000?0:2);
  }
  if(un==='h'){
    if(modo===true && a>=1000) return _dshLoc(v/1000,1)+' mil h';
    return _dshLoc(v, a>=100?0:1)+'h';
  }
  if(un==='%') return _dshLoc(v,1)+'%';
  return _dshLoc(v, Number.isInteger(v)?0:1);
}

// series: [{nome,cor,vals:[{x,v}],tipo:'area'|'line'|'bar',ref?,dash?,w?}]
// opts: {fmt, yfmt, xlabel(x), readX(x), altura, metaY:{v,label}, h}
//   novas: unidade:'h'|'R$'|'%'|'n' (fmt/yfmt padrão + coluna de rótulos fora do traço) · gutter ·
//   stacked (empilha as 'bar') · reta (sem curva) · legendToggle · off:[nomes] · onToggle(nome,escondida) ·
//   brush (arrastar = zoom; ↺/duplo clique volta; 2 dedos no toque) · annot:[{x,label}] · tabela (▦) ·
//   drill(x, indiceDaSerie) · legenda:false · grupo:'id' (crosshair sincronizado entre gráficos irmãos) ·
//   rotuloFim (valor no último ponto, até 2 séries) · titulo (legenda da tabela) · maxXl ·
//   fimParcial (revisão de 2026-11-07: último ponto vazado + último segmento tracejado = período em andamento; o rótulo
//   direto vai no último ponto FECHADO) · plotPx (largura estimada do plot, só para decidir a folga entre barras)
// vals[i].rot (opcional): rótulo do ponto; o readout mostra a série de referência como "<valor> (rot)".
// s.ref = série de referência (período anterior): tracejada, cinza, sem área.
function tsChart(series, opts){
  opts=opts||{};
  series=(series||[]).filter(s=>s&&s.vals&&s.vals.length);
  if(!series.length) return '<div class="estado">Sem dados no período.</div>';
  const id='tsc'+(++_tscSeq);
  const st={ off:{}, zoom:null, tab:false, noanim:false };
  (opts.off||[]).forEach(n=>{ st.off[n]=true; });
  return _tscBuild(id, series, opts, st);
}
function _tscBuild(id, all, opts, st){
  const gut=!!(opts.unidade||opts.gutter);
  const fmt=opts.fmt||(opts.unidade?(v=>dshFmt(opts.unidade,v)):(v=>String(v)));
  const yfmt=opts.yfmt||(opts.unidade?(v=>dshFmt(opts.unidade,v,true)):null);
  const nAll=all[0].vals.length;
  const z=st.zoom && st.zoom[1]>st.zoom[0] ? st.zoom : null; const i0=z?z[0]:0, i1=z?z[1]:nAll-1;
  let vis=all.map((s,gi)=>({s,gi})).filter(o=>!st.off[o.s.nome]);
  if(!vis.length) vis=all.map((s,gi)=>({s,gi}));            // nunca fica tudo escondido
  const ser=vis.map(o=>({ nome:o.s.nome, cor:o.s.cor, tipo:o.s.tipo, ref:!!o.s.ref, dash:o.s.dash, w:o.s.w, gi:o.gi,
    pts:(z?o.s.vals.slice(i0,i1+1):o.s.vals).map(p=>_tscNum(p&&p.v)),
    rots:(z?o.s.vals.slice(i0,i1+1):o.s.vals).map(p=>(p&&p.rot!=null)?String(p.rot):null) }));
  const xs0=(z?all[0].vals.slice(i0,i1+1):all[0].vals).map(p=>p.x); const n=xs0.length;
  const hasBar=all.some(s=>s.tipo==='bar' && !s.ref);
  const stacked=!!opts.stacked && hasBar;
  const barras=ser.filter(s=>s.tipo==='bar' && !s.ref);

  // ---- escala: uma só (indicadores de unidades diferentes NUNCA dividem o eixo) ----
  let maxV=-Infinity, minV=Infinity;
  const vis1=v=>{ if(v==null) return; if(v>maxV) maxV=v; if(v<minV) minV=v; };
  if(stacked){
    for(let i=0;i<n;i++){ let pos=0,neg=0; barras.forEach(s=>{ const v=s.pts[i]; if(v==null) return; if(v>=0) pos+=v; else neg+=v; }); vis1(pos); vis1(neg); }
    ser.filter(s=>!(s.tipo==='bar' && !s.ref)).forEach(s=>s.pts.forEach(vis1));
  } else ser.forEach(s=>s.pts.forEach(vis1));
  if(opts.metaY) vis1(opts.metaY.v);
  if(maxV===-Infinity){ maxV=0; minV=0; }
  maxV=Math.max(maxV,0); minV=Math.min(minV,0);
  let lo=0, hi, ticks=4;
  if(minV<0){                                              // margem negativa: eixo atravessa o zero
    const step=_tscNice((maxV-minV)/4);
    hi=Math.ceil(maxV/step)*step; lo=Math.floor(minV/step)*step; if(hi===lo) hi=lo+step;
    ticks=Math.max(1,Math.round((hi-lo)/step));
  } else hi=_tscNice(maxV||1);

  const W=1000, H=opts.h||220, padL=opts.padL!=null?opts.padL:(gut?8:46), padR=16, padT=14, padB=30;
  const band=hasBar; const bw=(W-padL-padR)/Math.max(n,1);
  const X=i=> band ? padL+(i+.5)*bw : padL + (n>1? i*(W-padL-padR)/(n-1) : (W-padL-padR)/2);
  const Y=v=> padT + (1-(v-lo)/(hi-lo))*(H-padT-padB);
  const xs=xs0.map((_,i)=>X(i));
  const pctL=x=>(x/W*100), pctT=y=>(y/H*100);

  // gridlines + y labels (overlay HTML)
  let grid='', yl='', ylMax=0;
  for(let t=0;t<=ticks;t++){ const val=lo+(hi-lo)*t/ticks, y=Y(val);
    grid+=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" class="tsc-grid"/>`;
    const tx=opts.yfmt?opts.yfmt(val):(yfmt?yfmt(val):fmt(val)); ylMax=Math.max(ylMax,String(tx).length);
    yl+=`<span class="tsc-yl" style="top:${pctT(y).toFixed(2)}%">${esc(tx)}</span>`; }
  if(lo<0){ const y0=Y(0); grid+=`<line x1="${padL}" y1="${y0.toFixed(1)}" x2="${W-padR}" y2="${y0.toFixed(1)}" class="tsc-zero"/>`; }
  // x labels (overlay HTML, esparso). No modo novo o espaçamento é ancorado no ÚLTIMO ponto (o mais recente
  // sempre aparece e o último rótulo nunca encosta no anterior).
  const maxXl=opts.maxXl || (gut && typeof window!=='undefined' && window.innerWidth<560 ? 5 : 9);
  const every=Math.max(1,Math.ceil(n/maxXl)); let xl='';
  xs0.forEach((x,i)=>{ const mostra=gut ? ((n-1-i)%every===0) : (i%every===0||i===n-1);
    if(mostra) xl+=`<span class="tsc-xl" style="left:${pctL(X(i)).toFixed(2)}%">${esc(opts.xlabel?opts.xlabel(x):String(x).slice(5))}</span>`; });
  // meta line
  let metaSvg='';
  if(opts.metaY){ const y=Y(opts.metaY.v); metaSvg=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" class="tsc-meta"/>`; }

  const gid='tg'+id.slice(3);
  let defs='', paths='', barsHtml='', solos='';
  const reg={ W,H,padL,padR,xs,xraw:xs0,series:[], readX:(opts.readX||(x=>x)), fmt:(opts.readFmt||fmt), drillType:opts.drillType||'',
    drillFn:typeof opts.drill==='function'?opts.drill:null, brush:!!opts.brush, i0, n, st, band, bwPct:bw/W*100, gut,
    total: stacked && barras.length>1, src:{all,opts}, off:st.off };
  const nb=barras.length; let grpW=bw*(nb>1&&!stacked?0.8:0.62); let barW=stacked||nb<=1?grpW:grpW/nb;
  // revisão de 2026-11-07: 52 semanas × 2 séries num plot de ~235 px davam barras de ~1,7 px que, com as bordas de folga,
  // pintavam 0 px. Estimamos o plot pelo n e pela janela (o CSS tem min-width:3px como garantia); a folga entre barras
  // (classe tsc-sp) só existe quando a barra tem >= 5 px, e a barra nunca fica abaixo de 3 px sem invadir a vizinha.
  const plotPx = opts.plotPx || Math.max(180, Math.min(1100, (typeof window!=='undefined'?window.innerWidth:1200)-90));
  const pxDe = u => u/W*plotPx;
  if(nb>0 && pxDe(barW)<3){ barW=3/plotPx*W; if(!stacked&&nb>1) grpW=barW*nb; else grpW=barW; }
  const comFolga = pxDe(barW)>=5;
  const parcialFim = !!opts.fimParcial && (!z || i1===nAll-1);
  // empilhado: base acumulada por x (positivos acima do zero, negativos abaixo)
  const acPos=new Array(n).fill(0), acNeg=new Array(n).fill(0);
  let bk=0; const topPos=[], topNeg=[];
  barras.forEach((s,k)=>s.pts.forEach((v,i)=>{ if(v!=null&&v>0) topPos[i]=k; else if(v!=null&&v<0) topNeg[i]=k; }));
  ser.forEach((s,si)=>{
    const P=s.pts.map((v,i)=> v==null ? null : [X(i),Y(v)]);
    const regS={ nome:s.nome, cor:s.ref?'var(--muted2)':s.cor, vals:s.pts, rots:s.rots, pcts:P.map(p=>p?pctT(p[1]):null), bar:false, ref:s.ref, gi:s.gi };
    if(s.tipo==='bar' && !s.ref){
      regS.bar=true; regS.y0=[]; regS.y1=[];
      const k=bk++;
      s.pts.forEach((v,i)=>{
        if(v==null){ regS.y0.push(null); regS.y1.push(null); return; }
        let a,b,cx;
        if(stacked){ if(v>=0){ a=acPos[i]; acPos[i]+=v; b=acPos[i]; } else { a=acNeg[i]; acNeg[i]+=v; b=acNeg[i]; } cx=X(i); }
        else { a=0; b=v; cx=X(i)-grpW/2+barW*(k+.5); }
        const yTop=Y(Math.max(a,b)), yBot=Y(Math.min(a,b));
        regS.y0.push(pctT(yTop)); regS.y1.push(pctT(yBot));
        // empilhado: só o segmento do TOPO do monte é arredondado (4px) e os de cima do 1º ganham 2px de folga
        const topo = !stacked || (v>=0 ? topPos[i]===k : topNeg[i]===k);
        const raio = !topo ? '0' : (v>=0 ? '4px 4px 0 0' : '0 0 4px 4px');
        const folga = stacked && (v>=0 ? a!==0 : a!==0);
        const oco = parcialFim && i===n-1;      // período em andamento: barra vazada (contorno), não preenchida
        barsHtml+=`<i class="tsc-bar${comFolga?' tsc-sp':''}${folga?' tsc-gap':''}${oco?' tsc-bar-parc':''}" style="left:${pctL(cx-barW/2).toFixed(3)}%;width:${(barW/W*100).toFixed(3)}%;top:${pctT(yTop).toFixed(3)}%;height:${Math.max(0,pctT(yBot-yTop)).toFixed(3)}%;background-color:${oco?'transparent':s.cor};${oco?`outline:1.5px solid ${s.cor};outline-offset:-1.5px;`:''}border-radius:${raio}"></i>`;
      });
      reg.series.push(regS); return;
    }
    // linha/área: corridas contínuas (valor ausente quebra a linha em vez de cair a zero)
    const runs=[]; let cur=[]; P.forEach(p=>{ if(p) cur.push(p); else { if(cur.length) runs.push(cur); cur=[]; } }); if(cur.length) runs.push(cur);
    const cor=s.ref?'var(--muted2)':s.cor;
    let ultI=n-1; while(ultI>=0 && P[ultI]==null) ultI--;
    runs.forEach((R,ri)=>{
      // fimParcial: a corrida que termina no último ponto da série tem esse ponto vazado e o último segmento tracejado
      const parc = parcialFim && !s.ref && ultI>=0 && R[R.length-1]===P[ultI];
      if(R.length===1){ const p=R[0]; solos+= parc
        ? `<i class="tsc-pt tsc-pt-oco" style="left:${pctL(p[0]).toFixed(2)}%;top:${pctT(p[1]).toFixed(2)}%;border-color:${cor}"></i>`
        : `<i class="tsc-pt" style="left:${pctL(p[0]).toFixed(2)}%;top:${pctT(p[1]).toFixed(2)}%;background:${cor}"></i>`; return; }
      const d=opts.reta ? _tscReta(R) : _tscSmooth(R);
      if(s.tipo!=='line' && !s.ref && s.tipo!=='bar'){ const gi=gid+'_'+si+'_'+ri;
        defs+=`<linearGradient id="${gi}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%"${_tscCor('stop-color',cor)} stop-opacity=".24"/><stop offset="100%"${_tscCor('stop-color',cor)} stop-opacity="0"/></linearGradient>`;
        const yb=Y(Math.max(lo,0)); paths+=`<path d="${d} L ${R[R.length-1][0].toFixed(1)} ${yb.toFixed(1)} L ${R[0][0].toFixed(1)} ${yb.toFixed(1)} Z" fill="url(#${gi})" class="tsc-area"/>`; }
      const sw=s.ref?1.8:(s.w||2.4);
      if(parc){
        const F=R.slice(0,-1);                               // trecho fechado: linha normal
        if(F.length>=2){ const dF=opts.reta ? _tscReta(F) : _tscSmooth(F);
          paths+=`<path d="${dF}" fill="none"${_tscCor('stroke',cor)} stroke-width="${sw}"${s.dash?` stroke-dasharray="${s.dash}"`:''} class="tsc-line" stroke-linecap="round" stroke-linejoin="round"/>`; }
        const a=R[R.length-2], b=R[R.length-1];              // último segmento: tracejado
        paths+=`<path d="M ${a[0].toFixed(1)} ${a[1].toFixed(1)} L ${b[0].toFixed(1)} ${b[1].toFixed(1)}" fill="none"${_tscCor('stroke',cor)} stroke-width="${sw}" class="tsc-line tsc-parc" stroke-linecap="round"/>`;
        solos+=`<i class="tsc-pt tsc-pt-oco" style="left:${pctL(b[0]).toFixed(2)}%;top:${pctT(b[1]).toFixed(2)}%;border-color:${cor}"></i>`;
        return;
      }
      paths+=`<path d="${d}" fill="none"${_tscCor('stroke',cor)} stroke-width="${sw}"${s.dash?` stroke-dasharray="${s.dash}"`:''} class="tsc-line${s.ref?' tsc-ref':''}" stroke-linecap="round" stroke-linejoin="round"/>`;
    });
    reg.series.push(regS);
  });

  // anotações: marca vertical + rótulo (fim de contrato, feriado…); casa por igualdade e, em datas ISO, pela 1ª posição ≥ x
  let annSvg='', annHtml='';
  if(opts.annot && opts.annot.length){
    // 3 faixas verticais; um rótulo só entra numa faixa onde NÃO se sobrepõe (largura estimada) ao que já está lá
    const lanes=[[],[],[]]; const pw=Math.max(220,Math.min(1100,(typeof window!=='undefined'?window.innerWidth:1200)-90));
    opts.annot.map(a=>{ let i=xs0.indexOf(a.x); if(i<0 && typeof a.x==='string' && /^\d{4}-\d\d/.test(a.x)){ i=xs0.findIndex(x=>String(x)>=a.x); if(i===0 && String(xs0[0])>a.x) i=-1; }
      return {a,i}; }).filter(o=>o.i>=0).sort((p,q)=>p.i-q.i).forEach(({a,i})=>{
      const px=pctL(X(i)); const lb=String(a.label||''); const txt=lb.length>22?lb.slice(0,21)+'…':lb;
      const w=(txt.length*6.1+14)/pw*100; const flip=px>66; const ini=flip?px-w:px, fim=flip?px:px+w;
      let lane=lanes.findIndex(L=>L.every(([x0,x1])=>fim<x0-1||ini>x1+1));
      if(lane<0){ annSvg+=`<line x1="${X(i).toFixed(1)}" y1="${padT}" x2="${X(i).toFixed(1)}" y2="${H-padB}" class="tsc-annot"><title>${esc(lb)}</title></line>`; return; }   // sem lugar: fica só a marca (o rótulo vai no title)
      lanes[lane].push([ini,fim]);
      annSvg+=`<line x1="${X(i).toFixed(1)}" y1="${padT}" x2="${X(i).toFixed(1)}" y2="${H-padB}" class="tsc-annot"/>`;
      // revisão de 2026-11-07: classe estável .tsc-anot e o texto num span (.tsc-anot-tx) para o celular esconder só o texto e
      // manter o ícone/marcador (o rótulo "⏳ em andamento" saía cortado em 360 px); o texto completo segue no title
      const mi=txt.match(/^(\p{Extended_Pictographic}\uFE0F?)\s*(.*)$/u);
      const miolo = mi ? `${esc(mi[1])} <span class="tsc-anot-tx">${esc(mi[2])}</span>` : `<span class="tsc-anot-tx">${esc(txt)}</span>`;
      annHtml+=`<span class="tsc-an tsc-anot${flip?' flip':''}" style="left:${px.toFixed(2)}%;top:${(lane*13).toFixed(0)}px" title="${escA(lb)}">${miolo}</span>`; });
  }

  // rótulo direto do último ponto (seletivo: só com até 2 séries, nunca em todo ponto)
  let fim='';
  if(opts.rotuloFim){ const cand=reg.series.filter(r=>!r.bar && !r.ref); if(cand.length && cand.length<=2){
    let ultimoTop=null;
    cand.forEach(r=>{ let k=n-1; while(k>=0 && r.vals[k]==null) k--; if(k<0) return;
      if(parcialFim){ let k2=k-1; while(k2>=0 && r.vals[k2]==null) k2--; if(k2>=0) k=k2; }   // vai no último ponto FECHADO
      let top=r.pcts[k];
      if(ultimoTop!=null && Math.abs(top-ultimoTop)<9) top=ultimoTop+9; ultimoTop=top;
      fim+=`<span class="tsc-end" style="left:${pctL(X(k)).toFixed(2)}%;top:${top.toFixed(2)}%;border-color:${r.cor}">${esc(fmt(r.vals[k]))}</span>`; }); } }

  _TSC[id]=reg;
  const dots=reg.series.map((r,si)=> r.bar ? '' : `<i class="tsc-dot" data-s="${si}" style="border-color:${r.cor}"></i>`).join('');
  // legenda: espelha a marca (retângulo = barra/área, traço = linha, tracejado = referência)
  const mostraLeg = opts.legenda!==false && all.length>1;
  let legend='';
  if(mostraLeg){
    if(opts.legendToggle){
      legend=`<div class="tsc-legend tsc-lgt" role="group" aria-label="Séries do gráfico">${all.map((s,gi)=>{
        const off=!!st.off[s.nome] && vis.some(o=>o.gi===gi)===false;
        const marca=s.ref?'ref':(s.tipo==='line'?'ln':'');
        return `<button type="button" class="tsc-lg${off?' off':''}" data-tsc-lg="${gi}" aria-pressed="${off?'false':'true'}" title="${off?'Mostrar':'Esconder'} ${escA(s.nome)}"><i class="${marca}" style="${s.ref?'':`background:${s.cor}`}"></i>${esc(s.nome)}</button>`; }).join('')}</div>`;
    } else {
      legend=`<div class="tsc-legend">${all.map(s=>`<span><i${gut?` class="${s.ref?'ref':(s.tipo==='line'?'ln':'')}"`:''} style="${s.ref?'':`background:${s.cor}`}"></i>${esc(s.nome)}</span>`).join('')}</div>`;
    }
  }
  const botoes=(z?`<button type="button" class="tsc-btn" data-tsc-reset title="Voltar ao período inteiro (ou duplo clique no gráfico)">↺ período todo</button>`:'')+
    (opts.tabela?`<button type="button" class="tsc-btn" data-tsc-tab aria-pressed="${st.tab?'true':'false'}" title="Ver os mesmos números em tabela">▦ tabela</button>`:'');
  const topo = botoes ? `<div class="tsc-top">${legend}<div class="tsc-tools">${botoes}</div></div>` : legend;

  // tabela acessível: a MESMA série, uma linha por x (fica fora da vista até o ▦; leitor de tela a lê sempre)
  let tabela='';
  if(opts.tabela){
    const cab=`<tr><th scope="col">${esc(opts.tituloX||'Período')}</th>${all.map(s=>`<th scope="col">${esc(s.nome)}</th>`).join('')}${reg.total?'<th scope="col">Total</th>':''}</tr>`;
    const linhas=xs0.map((x,i)=>{
      const cel=all.map(s=>{ const p=s.vals[i0+i]; return `<td>${esc(fmt(_tscNum(p&&p.v)))}</td>`; }).join('');
      let tot=''; if(reg.total){ let t=0; barras.forEach(b=>{ if(b.pts[i]!=null) t+=b.pts[i]; }); tot=`<td><b>${esc(fmt(t))}</b></td>`; }
      return `<tr><th scope="row">${esc(reg.readX(x))}</th>${cel}${tot}</tr>`; }).join('');
    tabela=`<div class="tsc-tab-wrap scroll-x"><table class="tsc-tab"><caption class="dsh-sr">${esc(opts.titulo||'Dados do gráfico')}</caption><thead>${cab}</thead><tbody>${linhas}</tbody></table></div>`;
  }

  const svgBase=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="tsc-svg"><defs>${defs}</defs>${grid}${metaSvg}${annSvg}${barsHtml?'':paths}</svg>`;
  const svgTopo = barsHtml ? `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="tsc-svg tsc-svg-top"><defs>${defs}</defs>${paths}</svg>` : '';
  const camadas = `${svgBase}${barsHtml?`<div class="tsc-bars">${barsHtml}</div>`:''}${svgTopo}${solos}`;
  const sobre=`<div class="tsc-xls">${xl}</div>${annHtml}<div class="tsc-cross"></div>${dots}${fim}<div class="tsc-brushsel"></div><div class="tsc-read"></div>`;
  const yw = Math.max(34, Math.min(86, ylMax*6.3+10));
  const plot = gut
    ? `<div class="tsc-plot tsc-gutp"><div class="tsc-yls">${yl}</div><div class="tsc-in">${camadas}${sobre}</div></div>`
    : `<div class="tsc-plot">${camadas}<div class="tsc-yls">${yl}</div>${sobre}</div>`;
  const cls=['tsc']; if(opts.drillType||reg.drillFn) cls.push('tsc-drill'); if(gut) cls.push('tsc-gut'); if(band) cls.push('tsc-band');
  if(opts.brush) cls.push('tsc-brushable'); if(st.noanim) cls.push('tsc-noanim'); if(st.tab) cls.push('tsc-taboon'); if(hasBar) cls.push('tsc-hasbar');
  const sty=[]; if(opts.altura) sty.push(`--tsc-h:${opts.altura}`); if(gut){ sty.push(`--tsc-yw:${yw.toFixed(0)}px`, `--tsc-ct:${pctT(padT).toFixed(2)}%`, `--tsc-cb:${(100-pctT(H-padB)).toFixed(2)}%`); }
  if(band) sty.push(`--bw:${(bw/W*100).toFixed(3)}%`);
  return `<div class="${cls.join(' ')}" data-tsc="${id}"${opts.grupo?` data-tsc-grp="${escA(opts.grupo)}"`:''}${sty.length?` style="${sty.join(';')}"`:''}>
    ${topo}
    ${plot}
    ${tabela}
  </div>`;
}
// Refaz o gráfico no lugar (legenda, zoom, ↺), sem animar de novo e mantendo o mesmo id.
function _tscRefaz(id){
  const reg=_TSC[id]; if(!reg) return; const cont=document.querySelector(`[data-tsc="${id}"]`); if(!cont) return;
  reg.st.noanim=true; _tscAtivo=null; _tscPares=[];
  const html=_tscBuild(id, reg.src.all, reg.src.opts, reg.st);
  const t=document.createElement('template'); t.innerHTML=html.trim(); cont.replaceWith(t.content.firstChild);
}
// Handler global: mostra crosshair/readout do gráfico sob o cursor.
let _tscAtivo=null;   // gráfico com o cursor em cima (evita varrer o DOM a cada pixel de movimento)
let _tscPares=[];     // irmãos do mesmo grupo (small multiples) que acompanham o crosshair
const _tscArea = cont => cont.querySelector('.tsc-in') || cont.querySelector('.tsc-plot');
function _tscIdxDe(reg, clientX, rect){
  const vx=Math.max(0,Math.min(reg.W,(clientX-rect.left)/rect.width*reg.W));
  let idx=0,best=Infinity; reg.xs.forEach((x,i)=>{ const dd=Math.abs(x-vx); if(dd<best){best=dd;idx=i;} });
  return idx;
}
function _tscShow(cont, reg, idx){
  if(reg.lastIdx===idx && cont.classList.contains('on')) return;   // mesmo ponto: nada mudou
  reg.lastIdx=idx;
  cont.classList.add('on');
  const leftPct=reg.xs[idx]/reg.W*100;
  const cross=cont.querySelector('.tsc-cross'); if(cross) cross.style.left=leftPct.toFixed(2)+'%';
  cont.querySelectorAll('.tsc-dot').forEach(dot=>{ const si=+dot.getAttribute('data-s'); const s=reg.series[si]; if(!s) return;
    const t=s.pcts[idx]; dot.style.display = t==null ? 'none' : '';
    dot.style.left=leftPct.toFixed(2)+'%'; dot.style.top=(t||0).toFixed(2)+'%'; });
  const read=cont.querySelector('.tsc-read');
  if(read){ const linhas=reg.series.map(s=>{ let v=s.vals[idx]==null?'—':reg.fmt(s.vals[idx]);
      if(s.ref && s.vals[idx]!=null && s.rots && s.rots[idx]) v+=' ('+s.rots[idx]+')';   // série de referência: diz de que período é o valor
      return `<div class="r"><i style="background:${s.cor}"></i><span>${esc(s.nome)}</span><b>${esc(v)}</b></div>`; }).join('');
    let tot=''; if(reg.total){ let t=0; reg.series.forEach(s=>{ if(s.bar && s.vals[idx]!=null) t+=s.vals[idx]; }); tot=`<div class="r tot"><span>Total</span><b>${esc(reg.fmt(t))}</b></div>`; }
    read.innerHTML=`<div class="h">${esc(reg.readX(reg.xraw[idx]))}</div>${linhas}${tot}`;
    read.style.left=leftPct.toFixed(2)+'%'; read.classList.toggle('flip', leftPct>62);
    // revisão de 2026-11-07: espelho do flip da direita — nos primeiros pontos o balão centrado saía do plot (cortado pela esquerda)
    let flipL = leftPct<20;
    if(!flipL && leftPct<=62){ const pw=_tscArea(cont).getBoundingClientRect().width, rw=read.offsetWidth; if(pw && rw && leftPct/100*pw < rw/2) flipL=true; }
    read.classList.toggle('flipL', flipL); }
}
function _tscApaga(){
  if(_tscAtivo){ _tscAtivo.classList.remove('on'); _tscAtivo=null; }
  _tscPares.forEach(c=>c.classList.remove('on')); _tscPares=[];
}
function _tscMove(clientX, target){
  const cont = target && target.closest && target.closest('[data-tsc]');
  if(!cont){ _tscApaga(); return; }
  if(_tscAtivo&&_tscAtivo!==cont) _tscApaga();
  _tscAtivo=cont;
  const reg=_TSC[cont.getAttribute('data-tsc')]; if(!reg) return;
  const rect=_tscArea(cont).getBoundingClientRect();
  if(!rect.width) return;
  const idx=_tscIdxDe(reg, clientX, rect);
  _tscShow(cont, reg, idx);
  // small multiples: o mesmo dia aparece em todos os irmãos (comparar indicadores no tempo)
  const g=cont.getAttribute('data-tsc-grp');
  if(g){
    if(!_tscPares.length) _tscPares=[...document.querySelectorAll('[data-tsc-grp]')].filter(c=>c!==cont && c.getAttribute('data-tsc-grp')===g);
    _tscPares.forEach(c=>{ const r2=_TSC[c.getAttribute('data-tsc')]; if(r2 && r2.xs.length===reg.xs.length) _tscShow(c, r2, idx); });
  }
}
document.addEventListener('mousemove',(e)=>{ _tscBrushMove(e.clientX); _tscMove(e.clientX,e.target); },{passive:true});
document.addEventListener('mouseleave',()=>{ document.querySelectorAll('.tsc.on').forEach(c=>c.classList.remove('on')); _tscAtivo=null; _tscPares=[]; },{passive:true});
// revisão de 2026-11-07: no toque o balão ficava grudado depois de soltar o dedo; some ~1,5 s depois do touchend
// (ou ao tocar fora de um gráfico, que já passa por _tscApaga em _tscMove).
let _tscToqueT=null;
document.addEventListener('touchstart',(e)=>{
  clearTimeout(_tscToqueT);
  if(e.touches&&e.touches.length>=2){ _tscBrushIni(e.touches[0].clientX, e.touches[1].clientX, e.target, true); return; }
  if(e.touches&&e.touches[0]) _tscMove(e.touches[0].clientX,e.target); },{passive:true});
document.addEventListener('touchmove',(e)=>{
  if(_tscBr && _tscBr.toque && e.touches.length>=2){ _tscBrushAtualiza(e.touches[0].clientX, e.touches[1].clientX); return; }
  if(e.touches&&e.touches.length===1) _tscMove(e.touches[0].clientX,e.target); },{passive:true});
document.addEventListener('touchend',(e)=>{ clearTimeout(_tscToqueT); if(_tscAtivo) _tscToqueT=setTimeout(_tscApaga,1500);
  if(_tscBr && _tscBr.toque && (!e.touches || e.touches.length<2)) _tscBrushFim(); },{passive:true});
document.addEventListener('touchcancel',()=>{ _tscBrushCancela(); },{passive:true});

// ---- brush: arrastar no gráfico dá zoom no eixo x (mouse) · dois dedos (toque) ----
let _tscBr=null; let _tscSuprime=0; let _tscDrillT=null;
function _tscBrushIni(xa, xb, target, toque){
  const cont=target && target.closest && target.closest('[data-tsc]'); if(!cont) return;
  const reg=_TSC[cont.getAttribute('data-tsc')]; if(!reg||!reg.brush) return;
  if(target.closest('.tsc-top,.tsc-tab-wrap')) return;
  _tscBr={ cont, reg, a:xa, b:xb, mv:!!toque, toque:!!toque, rect:_tscArea(cont).getBoundingClientRect() };
  if(toque) _tscBrushDesenha();
}
function _tscBrushDesenha(){
  if(!_tscBr) return; const {cont,rect}=_tscBr; const sel=cont.querySelector('.tsc-brushsel'); if(!sel||!rect.width) return;
  const l=Math.max(0,Math.min(_tscBr.a,_tscBr.b)-rect.left), r=Math.min(rect.width,Math.max(_tscBr.a,_tscBr.b)-rect.left);
  sel.style.display='block'; sel.style.left=(l/rect.width*100).toFixed(2)+'%'; sel.style.width=(Math.max(0,r-l)/rect.width*100).toFixed(2)+'%';
}
function _tscBrushAtualiza(xa, xb){ if(!_tscBr) return; _tscBr.a=xa; _tscBr.b=xb; _tscBr.mv=true; _tscBrushDesenha(); }
function _tscBrushMove(x){ if(!_tscBr || _tscBr.toque) return; _tscBr.b=x; if(Math.abs(_tscBr.b-_tscBr.a)>6){ _tscBr.mv=true; _tscBrushDesenha(); } }
function _tscBrushCancela(){ if(_tscBr){ const s=_tscBr.cont.querySelector('.tsc-brushsel'); if(s) s.style.display='none'; } _tscBr=null; }
function _tscBrushFim(){
  const br=_tscBr; if(!br) return; _tscBr=null;
  const s=br.cont.querySelector('.tsc-brushsel'); if(s) s.style.display='none';
  if(!br.mv || !br.rect.width) return;
  _tscSuprime=Date.now();                                   // o clique que o soltar do mouse gera não vira drill
  const a=_tscIdxDe(br.reg, Math.min(br.a,br.b), br.rect), b=_tscIdxDe(br.reg, Math.max(br.a,br.b), br.rect);
  if(b-a<1) return;
  const id=br.cont.getAttribute('data-tsc');
  br.reg.st.zoom=[br.reg.i0+a, br.reg.i0+b];
  _tscRefaz(id);
}
document.addEventListener('mousedown',(e)=>{
  if(e.button!==0) return;
  const t=e.target; if(!t.closest || !t.closest('.tsc-plot')) return;
  _tscBrushIni(e.clientX, e.clientX, t, false);
});
document.addEventListener('mouseup',()=>{ if(_tscBr && !_tscBr.toque) _tscBrushFim(); });
document.addEventListener('dblclick',(e)=>{
  const cont=e.target.closest&&e.target.closest('[data-tsc]'); if(!cont) return;
  const reg=_TSC[cont.getAttribute('data-tsc')]; if(!reg||!reg.st.zoom) return;
  clearTimeout(_tscDrillT); reg.st.zoom=null; _tscRefaz(cont.getAttribute('data-tsc'));
});

document.addEventListener('click',(e)=>{
  const alvo=e.target.closest&&e.target.closest('[data-tsc-lg],[data-tsc-reset],[data-tsc-tab]');
  if(alvo){
    const cont=alvo.closest('[data-tsc]'); const id=cont&&cont.getAttribute('data-tsc'); const reg=id&&_TSC[id]; if(!reg) return;
    if(alvo.hasAttribute('data-tsc-lg')){
      const s=reg.src.all[+alvo.getAttribute('data-tsc-lg')]; if(!s) return;
      const escondidas=reg.src.all.filter(x=>reg.st.off[x.nome]).length;
      if(!reg.st.off[s.nome] && escondidas>=reg.src.all.length-1) return;   // sempre sobra uma série à vista
      if(reg.st.off[s.nome]) delete reg.st.off[s.nome]; else reg.st.off[s.nome]=true;
      const cb=reg.src.opts.onToggle; if(typeof cb==='function'){ try{ cb(s.nome, !!reg.st.off[s.nome]); }catch(_){} }
      _tscRefaz(id);
    } else if(alvo.hasAttribute('data-tsc-reset')){ reg.st.zoom=null; _tscRefaz(id); }
    else { reg.st.tab=!reg.st.tab; cont.classList.toggle('tsc-taboon', reg.st.tab); alvo.setAttribute('aria-pressed', reg.st.tab?'true':'false'); }
    return;
  }
  const cont=e.target.closest&&e.target.closest('[data-tsc]'); if(!cont) return;
  const reg=_TSC[cont.getAttribute('data-tsc')]; if(!reg||(!reg.drillType&&!reg.drillFn)) return;
  if(Date.now()-_tscSuprime<350) return;                                  // era o fim de um arrastar (zoom)
  if(e.target.closest('.tsc-top,.tsc-tab-wrap')) return;
  const area=_tscArea(cont); const rect=area.getBoundingClientRect(); if(!rect.width) return;
  const idx=_tscIdxDe(reg, e.clientX, rect);
  if(reg.drillFn){
    // qual série? a mais próxima da altura do clique (empilhado: o segmento sob o dedo)
    const yp=(e.clientY-rect.top)/rect.height*100; let sel=-1, melhor=Infinity;
    reg.series.forEach(s=>{ if(s.ref||s.vals[idx]==null) return;
      let d; if(s.bar && s.y0){ d = (yp>=s.y0[idx] && yp<=s.y1[idx]) ? 0 : Math.min(Math.abs(yp-s.y0[idx]),Math.abs(yp-s.y1[idx])); }
      else d=Math.abs(yp-s.pcts[idx]);
      if(d<melhor){ melhor=d; sel=s.gi; } });
    const x=reg.xraw[idx]; const chama=()=>{ escondeTip(); reg.drillFn(x, sel); };
    if(reg.brush){ clearTimeout(_tscDrillT); _tscDrillT=setTimeout(chama, 260); }   // espera um possível duplo clique (↺)
    else chama();
    return;
  }
  escondeTip(); drill(reg.drillType, reg.xraw[idx]); });

// ---- 📊 Small multiples: N gráficos pequenos, mesmo eixo x, cada indicador na SUA unidade ----
// items: [{id, nome, unidade, cor?, vals:[{x,v}], ref?:[{x,v}], tipo?:'area'|'line'|'bar', reta?, series?, stacked?, nota?}]
// opts: {cols, altura, xlabel, readX, annot, drill(x, idDoIndicador), grupo}
let _dshSmSeq=0;
function dshSmallMultiples(items, opts){
  opts=opts||{}; items=(items||[]).filter(it=>it&&((it.vals&&it.vals.length)||(it.series&&it.series.length)));
  if(!items.length) return '<div class="estado">Sem dados no período.</div>';
  const n=items.length; const cols=Math.max(1,Math.min(opts.cols||(n<=4?n:n<=6?3:4), 4));
  const grupo=opts.grupo||('dshsm'+(++_dshSmSeq));
  // largura estimada do plot de cada cartão (só decide a folga entre barras; o CSS tem min-width:3px de garantia)
  const iw=(typeof window!=='undefined'?window.innerWidth:1280);
  const colsEf = iw<=560 ? 1 : (iw<=1100 ? Math.min(cols,2) : cols);
  const plotPx = Math.max(150, Math.min(1100, (iw-64)/colsEf - 24 - 14*(colsEf>1?1:0) - 44 - 14));
  const cel=items.map((it,k)=>{
    const cor=it.cor||dshCorDe(k);
    const base = it.series || [{ nome:it.nome, cor, vals:it.vals, tipo:it.tipo||'area' }].concat(it.ref&&it.ref.length?[{ nome:'Período anterior', ref:true, tipo:'line', vals:it.ref }]:[]);
    const principal = (it.vals||base[0].vals).filter(p=>_tscNum(p.v)!=null);
    const ult=principal.length?principal[principal.length-1].v:null, ant=principal.length>1?principal[principal.length-2].v:null;
    // revisão de 2026-11-07: com 2+ séries (não-referência) o cartão mostra a legenda e UM valor por série, cada um com a
    // bolinha da cor; sem isso o único número do cabeçalho era ambíguo (de qual série?). No empilhado o hero é o total do
    // último x. Com 1 série, como antes.
    const reais = base.filter(s=>!s.ref);
    let cab;
    if(reais.length>=2){
      const ultDe = s=>{ const v=(s.vals||[]).filter(p=>_tscNum(p.v)!=null); return v.length?v[v.length-1].v:null; };
      const vs = reais.map(s=>`<span class="dsh-sm-vs" title="${escA(s.nome)}"><i style="background:${s.cor||cor}"></i>${esc(dshFmt(it.unidade,ultDe(s),true))}</span>`).join('');
      let hero='';
      if(it.stacked){ let t=0, algum=false; reais.forEach(s=>{ const v=ultDe(s); if(_tscNum(v)!=null){ t+=+v; algum=true; } });
        hero=`<b class="dsh-sm-v" title="Total do último período">${esc(dshFmt(it.unidade,algum?t:null,true))}</b>`; }
      cab=`<div class="dsh-sm-h"><span class="dsh-sm-n">${esc(it.nome)}</span><span class="dsh-sm-vals">${hero}${vs}</span></div>`;
    } else
      cab=`<div class="dsh-sm-h"><span class="dsh-sm-n"><i style="background:${cor}"></i>${esc(it.nome)}</span><b class="dsh-sm-v">${esc(dshFmt(it.unidade,ult,true))}</b></div>`;
    const nota=it.nota?`<div class="dsh-sm-nota">${esc(it.nota)}</div>`:'';
    const graf=tsChart(base,{ unidade:it.unidade, altura:opts.altura||'132px', h:130, legenda:reais.length>=2, grupo, plotPx:plotPx, fimParcial:(it.fimParcial!=null?it.fimParcial:opts.fimParcial), reta:it.reta, stacked:it.stacked,
      xlabel:opts.xlabel, readX:opts.readX, annot:opts.annot, maxXl:4, titulo:it.nome,
      drill: typeof opts.drill==='function' ? (x)=>opts.drill(x, it.id) : null });
    return `<div class="dsh-sm-c" data-dsh-sm="${escA(it.id||k)}">${cab}${graf}${nota}</div>`;
  }).join('');
  return `<div class="dsh-sm" style="--dsh-cols:${cols}">${cel}</div>`;
}

// ---- 📊 Tile de KPI: número hero, Δ vs período anterior, sparkline de 12 pontos e status ----
// spec: {id, rot, valor (número ou texto já formatado), unidade, delta (fração: 0,12 = +12%), deltaTxt (substitui, ex. '+2,1 pp'),
//        deltaBom:'cima'|'baixo'|null, deltaRef, spark:[n…], parcial, status:'ok'|'warn'|'err'|'nd', statusTxt, sub, tip, cor, data:{k:v}}
// Δ colorido SÓ quando há "bom/ruim" (deltaBom); sempre ícone + texto, nunca só cor.
function dshTileHTML(t){
  t=t||{}; const un=t.unidade;
  const val = t.valor==null ? '—' : (typeof t.valor==='number' ? dshFmt(un,t.valor,'hero') : String(t.valor));
  let dh='';
  if(t.delta!=null && isFinite(t.delta)){
    const d=+t.delta; const igual=Math.abs(d)<0.0005;
    let cls='neu'; if(!igual && t.deltaBom) cls = ((t.deltaBom==='cima')===(d>0)) ? 'bom' : 'ruim';
    const ic=igual?'▬':(d>0?'▲':'▼');
    const txt=t.deltaTxt || ((d>0?'+':d<0?'−':'')+_dshLoc(Math.abs(d)*100,1)+'%');
    const leitura=(igual?'estável':(d>0?'subiu':'caiu'))+(cls==='bom'?', favorável':cls==='ruim'?', desfavorável':'');
    dh=`<span class="dsh-t-d ${cls}"><span aria-hidden="true">${ic}</span> ${esc(txt)}<span class="dsh-t-vs"> vs ${esc(t.deltaRef||'anterior')}</span><span class="dsh-sr"> (${esc(leitura)})</span></span>`;
  }
  let sp='';
  const pts=(t.spark||[]).map(_tscNum).slice(-12);
  const reais=pts.filter(v=>v!=null);
  if(reais.length>=2){
    const mn=Math.min(...reais), mx=Math.max(...reais), r=(mx-mn)||1; const m=pts.length;
    const P=pts.map((v,i)=> v==null?null:[ (m>1?i/(m-1)*100:50), 3+(1-(v-mn)/r)*24 ]);
    const feitos=P.filter(Boolean); const ult=feitos[feitos.length-1];
    const corte = t.parcial && feitos.length>2 ? feitos.length-1 : feitos.length;   // o último ponto de período em andamento é tracejado
    const lin=feitos.slice(0,corte).map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
    const pen=feitos[corte-1], tr = corte<feitos.length ? `<line x1="${pen[0].toFixed(1)}" y1="${pen[1].toFixed(1)}" x2="${ult[0].toFixed(1)}" y2="${ult[1].toFixed(1)}" class="dsh-t-sp dsh-t-spp" vector-effect="non-scaling-stroke"/>` : '';
    sp=`<div class="dsh-t-spark" role="img" aria-label="Tendência dos últimos ${m} períodos: de ${esc(dshFmt(un,reais[0]))} a ${esc(dshFmt(un,reais[reais.length-1]))}"><svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><polyline points="${lin}" fill="none" class="dsh-t-sp" vector-effect="non-scaling-stroke"${t.cor?` style="stroke:${escA(t.cor)}"`:''}/>${tr}</svg><i class="dsh-t-dot" style="left:${ult[0].toFixed(1)}%;top:${(ult[1]/30*100).toFixed(1)}%"></i></div>`;
  }
  const ST={ ok:['✓','No alvo'], warn:['⚠','Atenção'], err:['✕','Crítico'], nd:['–','Sem meta'] };
  const sk=ST[t.status]?t.status:'';
  const st = sk ? `<span class="dsh-t-st ${sk}"><span aria-hidden="true">${ST[sk][0]}</span> ${esc(t.statusTxt||ST[sk][1])}</span>` : '';
  const dat = t.data ? Object.keys(t.data).filter(k=>/^[a-z0-9-]+$/.test(k)).map(k=>` data-${k}="${escA(t.data[k])}"`).join('') : '';
  const clic = !!dat;
  return `<div class="dsh-tile${sk?' st-'+sk:''}${clic?' dsh-click':''}" data-dsh-ind="${escA(t.id)}"${t.tip?` data-tip="${escA(t.tip)}"`:''}${clic?` role="button" tabindex="0"`:''}${dat}>
    <div class="dsh-t-rot">${esc(t.rot||'')}${t.parcial?' <span class="dsh-t-parc" data-tip="Período em andamento: o número ainda muda">⏳</span>':''}</div>
    <div class="dsh-t-val">${esc(val)}</div>
    ${dh}${sp}${st}${t.sub?`<div class="dsh-t-sub">${esc(t.sub)}</div>`:''}
  </div>`;
}
// Teclado: tile clicável (role=button) responde a Enter e Espaço como um botão.
document.addEventListener('keydown',(e)=>{
  if(e.key!=='Enter' && e.key!==' ') return;
  const t=e.target; if(t && t.classList && t.classList.contains('dsh-click') && t.getAttribute('role')==='button'){ e.preventDefault(); t.click(); }
});
