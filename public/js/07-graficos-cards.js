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
    if(w.f) fat[w.a]=(fat[w.a]||0)+w.s; else nao[w.a]=(nao[w.a]||0)+w.s;
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
const _TSC = {}; let _tscSeq = 0;
function _tscReset(){ for(const k in _TSC) delete _TSC[k]; }
function _tscNice(v){ if(v<=0) return 1; const e=Math.pow(10,Math.floor(Math.log10(v))); const f=v/e;
  const n=f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10; return n*e; }
function _tscSmooth(P){ if(!P.length) return ''; let d=`M ${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for(let i=0;i<P.length-1;i++){ const p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||P[i+1];
    const c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6,c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
    d+=` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`; }
  return d; }
// series: [{nome,cor,vals:[{x,v}],tipo:'area'|'line',dash?,w?}]
// opts: {fmt, yfmt, xlabel(x), readX(x), altura, metaY:{v,label}, h}
function tsChart(series, opts){
  opts=opts||{}; const fmt=opts.fmt||(v=>String(v));
  series=(series||[]).filter(s=>s&&s.vals&&s.vals.length);
  if(!series.length) return '<div class="estado">Sem dados no período.</div>';
  const xs0=series[0].vals.map(p=>p.x); const n=xs0.length;
  const W=1000, H=opts.h||220, padL=opts.padL!=null?opts.padL:46, padR=16, padT=14, padB=30;
  let maxV=0; series.forEach(s=>s.vals.forEach(p=>{ if(p.v>maxV) maxV=p.v; }));
  if(opts.metaY && opts.metaY.v>maxV) maxV=opts.metaY.v;
  const niceMax=_tscNice(maxV||1);
  const X=i=> padL + (n>1? i*(W-padL-padR)/(n-1) : (W-padL-padR)/2);
  const Y=v=> padT + (1 - v/niceMax)*(H-padT-padB);
  const xs=xs0.map((_,i)=>X(i));
  const pctL=x=>(x/W*100), pctT=y=>(y/H*100);

  // gridlines + y labels (overlay HTML)
  const ticks=4; let grid=''; let yl='';
  for(let t=0;t<=ticks;t++){ const val=niceMax*t/ticks, y=Y(val);
    grid+=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" class="tsc-grid"/>`;
    yl+=`<span class="tsc-yl" style="top:${pctT(y).toFixed(2)}%">${esc(opts.yfmt?opts.yfmt(val):fmt(val))}</span>`; }
  // x labels (overlay HTML, esparso)
  const every=Math.max(1,Math.ceil(n/9)); let xl='';
  xs0.forEach((x,i)=>{ if(i%every===0||i===n-1) xl+=`<span class="tsc-xl" style="left:${pctL(X(i)).toFixed(2)}%">${esc(opts.xlabel?opts.xlabel(x):String(x).slice(5))}</span>`; });
  // meta line
  let metaSvg='';
  if(opts.metaY){ const y=Y(opts.metaY.v); metaSvg=`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" class="tsc-meta"/>`; }

  const id='tsc'+(++_tscSeq); const gid='tg'+_tscSeq;
  let defs='', paths='';
  const reg={ W,H,padL,padR,xs, xraw:xs0, series:[], readX:(opts.readX||(x=>x)), fmt:(opts.readFmt||fmt), drillType:opts.drillType||'' };
  series.forEach((s,si)=>{
    const P=s.vals.map((p,i)=>[X(i),Y(p.v)]); const d=_tscSmooth(P);
    if(s.tipo!=='line'){ const gi=gid+'_'+si;
      defs+=`<linearGradient id="${gi}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${s.cor}" stop-opacity=".24"/><stop offset="100%" stop-color="${s.cor}" stop-opacity="0"/></linearGradient>`;
      paths+=`<path d="${d} L ${X(n-1).toFixed(1)} ${(H-padB)} L ${X(0).toFixed(1)} ${(H-padB)} Z" fill="url(#${gi})" class="tsc-area"/>`; }
    paths+=`<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="${s.w||2.4}"${s.dash?` stroke-dasharray="${s.dash}"`:''} class="tsc-line" stroke-linecap="round" stroke-linejoin="round"/>`;
    reg.series.push({ nome:s.nome, cor:s.cor, vals:s.vals.map(p=>p.v), pcts:P.map(p=>pctT(p[1])) });
  });
  _TSC[id]=reg;
  const dots=series.map((s,si)=>`<i class="tsc-dot" data-s="${si}" style="border-color:${s.cor}"></i>`).join('');
  const legend = series.length>1 ? `<div class="tsc-legend">${series.map(s=>`<span><i style="background:${s.cor}"></i>${esc(s.nome)}</span>`).join('')}</div>`:'';
  return `<div class="tsc${opts.drillType?' tsc-drill':''}" data-tsc="${id}"${opts.altura?` style="--tsc-h:${opts.altura}"`:''}>
    ${legend}
    <div class="tsc-plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="tsc-svg">
        <defs>${defs}</defs>${grid}${metaSvg}${paths}</svg>
      <div class="tsc-yls">${yl}</div>
      <div class="tsc-xls">${xl}</div>
      <div class="tsc-cross"></div>${dots}
      <div class="tsc-read"></div>
    </div>
  </div>`;
}
// Handler global: mostra crosshair/readout do gráfico sob o cursor.
function _tscMove(clientX, target){
  const cont = target && target.closest && target.closest('[data-tsc]');
  document.querySelectorAll('.tsc.on').forEach(c=>{ if(c!==cont) c.classList.remove('on'); });
  if(!cont) return;
  const reg=_TSC[cont.getAttribute('data-tsc')]; if(!reg) return;
  const plot=cont.querySelector('.tsc-plot'); const rect=plot.getBoundingClientRect();
  if(!rect.width) return;
  const vx=Math.max(0,Math.min(reg.W,(clientX-rect.left)/rect.width*reg.W));
  let idx=0,best=Infinity; reg.xs.forEach((x,i)=>{ const dd=Math.abs(x-vx); if(dd<best){best=dd;idx=i;} });
  cont.classList.add('on');
  const leftPct=reg.xs[idx]/reg.W*100;
  const cross=cont.querySelector('.tsc-cross'); if(cross) cross.style.left=leftPct.toFixed(2)+'%';
  cont.querySelectorAll('.tsc-dot').forEach(dot=>{ const si=+dot.getAttribute('data-s'); const s=reg.series[si];
    dot.style.left=leftPct.toFixed(2)+'%'; dot.style.top=(s.pcts[idx]||0).toFixed(2)+'%'; });
  const read=cont.querySelector('.tsc-read');
  if(read){ const linhas=reg.series.map(s=>`<div class="r"><i style="background:${s.cor}"></i><span>${esc(s.nome)}</span><b>${esc(reg.fmt(s.vals[idx]))}</b></div>`).join('');
    read.innerHTML=`<div class="h">${esc(reg.readX(reg.xraw[idx]))}</div>${linhas}`;
    read.style.left=leftPct.toFixed(2)+'%'; read.classList.toggle('flip', leftPct>62); }
}
document.addEventListener('mousemove',(e)=>_tscMove(e.clientX,e.target),{passive:true});
document.addEventListener('mouseleave',()=>document.querySelectorAll('.tsc.on').forEach(c=>c.classList.remove('on')),{passive:true});
document.addEventListener('touchstart',(e)=>{ if(e.touches&&e.touches[0]) _tscMove(e.touches[0].clientX,e.target); },{passive:true});
document.addEventListener('touchmove',(e)=>{ if(e.touches&&e.touches[0]) _tscMove(e.touches[0].clientX,e.target); },{passive:true});
document.addEventListener('click',(e)=>{ const cont=e.target.closest&&e.target.closest('[data-tsc]'); if(!cont) return;
  const reg=_TSC[cont.getAttribute('data-tsc')]; if(!reg||!reg.drillType) return;
  const plot=cont.querySelector('.tsc-plot'); const rect=plot.getBoundingClientRect(); if(!rect.width) return;
  const vx=Math.max(0,Math.min(reg.W,(e.clientX-rect.left)/rect.width*reg.W));
  let idx=0,best=Infinity; reg.xs.forEach((x,i)=>{ const d=Math.abs(x-vx); if(d<best){best=d;idx=i;} });
  escondeTip(); drill(reg.drillType, reg.xraw[idx]); });

