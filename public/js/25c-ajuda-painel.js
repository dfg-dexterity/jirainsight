// Jira Insights · 25c · ❓ PAINEL DE AJUDA (2026-11-22, a pedido do usuário: botão ❓ Ajuda fixo no cabeçalho com a documentação do Notion DENTRO do app,
// só para quem está identificado). O texto vem do BANCO do painel (GET /api/config?ajuda=indice|proc|busca — api/_lib/ajuda.js é a fonte única do
// formato v1, descrito no cabeçalho dele) e NUNCA do repositório: nada de conteúdo do Notion em public/. Painel lateral NÃO modal (a pessoa lê a ajuda
// OLHANDO a tela), abas Esta tela · Manual · Novidades, busca, rodapé com 💬/🐞/Notion e, para gestor/admin, ↻ sincronizar + diagnóstico.
// REGRAS: (1) o conteúdo vindo da API só vira DOM por createElement + textContent (links só https, rel=noopener, target=_blank) — innerHTML só em
// linha marcada `// ajd:casca` (texto fixo do app) e em ajdMermaidPinta (SVG que a lib mermaid sanitiza em securityLevel 'strict'); o gate
// scripts/check-ajuda.mjs reprova o resto. (2) cache SÓ em memória, por identidade (idTrocou → ajdZeraCache); sem identidade NENHUMA chamada à API;
// uma leitura em voo por recurso e falha não insiste sozinha (botão ↻). (3) sem cópia no service worker ('ajuda' em DADOS_PARAM_PROIBIDO do sw.js).
// (4) tela nova = entrada em AJUDA_MAPA (o gate reprova vista sem mapa); processo novo = linha em AJUDA_FONTES (api/_lib/ajuda.js).
// AJUDA_MAPA: vista → [processo, palavra-chave da seção | null]. A palavra (minúscula, sem acento) casa por "contém" no título da seção; não casou ou
// null → abre o Resumo do processo (nunca fica vazio). Conferido com os títulos reais lidos do Notion: docs/ajuda-notion-2026-11-22.md.

const AJUDA_MAPA={
  acoes:['TI-14-019','inicio por urgencia'], hoje:['TI-14-025',null], hojetime:['TI-14-025',null],
  apontar:['TI-14-007','passo a passo'], rateio:['TI-14-007','rateio'], meudia:['TI-14-007',null],
  inbox:['TI-14-007','reuniao com varias pessoas'], mencoes:['TI-14-007',null],
  bloqueios:['TI-14-029',null], prioridades:['TI-14-014',null],
  minhasemana:['TI-14-011',null], planrel:['TI-14-011',null],
  agenda:['TI-14-010','passo a passo'], agcontrole:['TI-14-010','controle de tickets'], reclassificar:['TI-14-010','reclassificar'], reuvinc:['TI-14-010','reclassificar e vincular'],
  chamadas:['TI-14-023',null],
  planejar:['TI-14-008','criacao em lote'], ondecrio:['TI-14-008','onde crio'], meustickets:['TI-14-008','preciso criar meus tickets'],
  meutempo:['TI-14-012','como estou gastando'],
  alertas:['TI-14-009','central de alertas'], gestao:['TI-14-009','em massa'], tickets:['TI-14-009','filtros salvos'],
  qualidade:['TI-14-012','qual tela usar'], audit:['TI-14-012','qual tela usar'],
  projetos:['TI-14-012','qual tela usar'], cronograma:['TI-14-012','marcos e cronograma'], timesheet:['TI-14-012','qual tela usar'], ranking:['TI-14-012','qual tela usar'],
  statusrep:['TI-14-026','como usar'], gp:['TI-14-021',null], semanal:['TI-14-021',null], portal:['TI-14-022',null],
  admin:['TI-14-013',null], parcerias:['TI-14-013',null], ams:['TI-14-013',null], receita:['TI-14-013',null], rentab:['TI-14-013',null],
  controladoria:['TI-14-027','controladoria rapida'],
  dash:['TI-14-027','as cinco abas'], dashfin:['TI-14-027','as cinco abas'], dashhoras:['TI-14-027','as cinco abas'], dashsaude:['TI-14-027','as cinco abas'], dashtime:['TI-14-027','as cinco abas'],
  dashdisc:['TI-14-027','disciplina do time'],
  visao:['TI-14-012','qual tela usar'], resumo:['TI-14-012','qual tela usar'], relatorios:['TI-14-012','qual tela usar'], analytics:['TI-14-012','qual tela usar'], metricas:['TI-14-012','metricas por tipo'],
  uso:['TI-14-017',null], config:['TI-14-015',null], roadmap:['TI-14-024',null]
};
// mermaid sob demanda (só quando uma seção com diagrama é exibida): jsDelivr, versão EXATA + SRI (sha384 do arquivo do `npm pack mermaid@11.17.2`).
const AJD_MERMAID_URL='https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js';
const AJD_MERMAID_SRI='sha384-EOXBFmc3gx5mb+vn0vPvvGqACToJD24hhacX5Yx+8NUUQrHIle/Qi5Bg9o3zKwW2';
const AJD_NOTION_RAIZ='https://app.notion.com/p/388c69371e178013820beec985c5e773';
const AJD_LS='jirainsight_ajuda_v1';
const AJD_IDX_TTL=30*60*1000;          // o índice é relido se tiver mais que isto
const AJD_SINC_VOLTAS=12;              // voltas do ↻ do gestor enquanto houver páginas pendentes
const AJD_GRUPOS=[['dia','No dia a dia'],['entrega','Entrega e projetos'],['negocio','Negócio'],['insights','Indicadores'],['app','O aplicativo'],['admin','Administração e integrações']];
const AJD_ABAS=[['tela','Esta tela'],['manual','Manual'],['novidades','Novidades']];
const AJD_RE_ARQ=/^ti-14-\d{3}$/;
const AJD_RE_SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;

estado.ajuda={ aberto:false, aba:'tela', proc:'', sec:'', q:'', abertas:{}, diagAberto:false, nRender:0, opener:null, _alvo:'', _res:[] };
try{ const o=JSON.parse(localStorage.getItem(AJD_LS)||'{}'); if(o&&AJD_ABAS.some(a=>a[0]===o.aba)) estado.ajuda.aba=o.aba; }catch(e){}
// cache em memória, por identidade. `ger` = geração: leitura em voo de uma identidade antiga é descartada quando chega.
let _ajd={ idk:'', ger:0, idx:null, idxEm:0, idxP:false, idxErro:'', proc:{}, procP:{}, procErro:{}, busca:null, buscaP:false, buscaErro:'', sinc:null, sincMsg:'' };
let _ajdVistaFoto='', _ajdMmN=0, _ajdMmLib=null, _ajdBuscaT=0;

// ---------------- utilidades ----------------
const ajdSA=(s)=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const ajdIdk=()=>{ const i=idApontar(); return i?String(i.email||'').trim().toLowerCase():''; };
const ajdOff=()=>!!estado.offline||navigator.onLine===false;
const ajdMobile=()=>{ try{ return window.matchMedia('(max-width:760px)').matches; }catch(e){ return false; } };
function ajdEl(tag,cls,txt){ const e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
function ajdBtn(txt,attrs,cls){ const b=ajdEl('button',cls||'btn',txt); b.type='button'; Object.keys(attrs||{}).forEach(k=>b.setAttribute(k,attrs[k])); return b; }
function ajdUrlOk(u){ try{ const x=new URL(String(u)); return x.protocol==='https:'&&!x.username&&!x.password&&String(u).length<=2000; }catch(e){ return false; } }
function ajdLinkExt(txt,url,cls){ const a=ajdEl('a',cls||'ajd-ext',txt+' ↗'); a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; return a; }
function ajdNomeVista(v){ const c=(typeof NAVCAT!=='undefined'&&NAVCAT.find(x=>x[0]===v))||null; return c?c[1]:String(v||''); }
function ajdDataBR(iso){   // 'AAAA-MM-DD' → 'DD/MM'
  const m=String(iso||'').match(/^\d{4}-(\d{2})-(\d{2})/); return m?`${m[2]}/${m[1]}`:'';
}
function ajdQuando(iso){   // ISO → 'DD/MM HH:MM' no horário de São Paulo
  const d=new Date(iso); if(isNaN(d)) return '';
  try{ const p={}; new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d).forEach(x=>{ p[x.type]=x.value; });
    return `${p.day}/${p.month} ${p.hour}:${p.minute}`; }catch(e){ return ''; }
}
function ajdPodeSinc(){ return !!(_ajd.idx&&_ajd.idx.podeSinc); }
function ajdProcDoIndice(arq){ return ((_ajd.idx&&_ajd.idx.procs)||[]).find(p=>p.arq===arq)||null; }

// ---------------- cache e leitura ----------------
function ajdZeraCache(){
  _ajd.ger+=1; _ajd.idk=ajdIdk();
  Object.assign(_ajd,{ idx:null, idxEm:0, idxP:false, idxErro:'', proc:{}, procP:{}, procErro:{}, busca:null, buscaP:false, buscaErro:'', sinc:null, sincMsg:'' });
  if(estado.ajuda) estado.ajuda._res=[];
}
function ajdConfereId(){ if(_ajd.idk!==ajdIdk()){ ajdZeraCache(); return true; } return false; }
function ajdHeaders(){ const id=idApontar()||{}; return { 'x-jira-email':id.email||'', 'x-jira-token':id.token||'' }; }
async function ajdGet(modo,extra){
  const ger=_ajd.ger;
  const r=await fetch('/api/config?ajuda='+modo+(extra||''),{ headers:ajdHeaders(), cache:'no-store' });
  let j=null; try{ j=await r.json(); }catch(e){}
  return { ger, status:r.status, ok:!!(r.ok&&j&&j.ok!==false), j };
}
function ajdErroTxt(r){ return (r&&r.j&&r.j.erro)?String(r.j.erro).slice(0,200):`falha ao ler (${r&&r.status||'sem resposta'})`; }
function ajdGaranteIndice(forca){
  ajdConfereId();
  if(!idApontar()||_ajd.idxP) return;
  if(forca) _ajd.idxErro='';
  else if(_ajd.idxErro||(_ajd.idx&&Date.now()-_ajd.idxEm<AJD_IDX_TTL)) return;   // falha não insiste sozinha
  _ajd.idxP=true; const ger=_ajd.ger;
  ajdGet('indice').then(r=>{
    if(r.ger!==_ajd.ger) return; _ajd.idxP=false;
    if(r.status===401) _ajd.idxErro='401';
    else if(!r.ok) _ajd.idxErro=ajdErroTxt(r);
    else{ _ajd.idx=r.j; _ajd.idxEm=Date.now(); _ajd.idxErro=''; }
    ajdRender();
  }).catch(e=>{ if(ger!==_ajd.ger) return; _ajd.idxP=false; _ajd.idxErro=ajdOff()?'offline':String((e&&e.message)||e).slice(0,160); ajdRender(); });
}
function ajdGarantaProc(arq){
  if(!idApontar()||!AJD_RE_ARQ.test(arq)||_ajd.proc[arq]||_ajd.procP[arq]||_ajd.procErro[arq]) return;
  _ajd.procP[arq]=true; const ger=_ajd.ger;
  ajdGet('proc','&p='+arq).then(r=>{
    if(r.ger!==_ajd.ger) return; delete _ajd.procP[arq];
    if(r.status===404) _ajd.procErro[arq]='nao-sinc';
    else if(r.status===401) _ajd.procErro[arq]='401';
    else if(!r.ok||!r.j||!Array.isArray(r.j.secs)) _ajd.procErro[arq]=ajdErroTxt(r);
    else _ajd.proc[arq]=r.j;
    ajdRender();
  }).catch(e=>{ if(ger!==_ajd.ger) return; delete _ajd.procP[arq]; _ajd.procErro[arq]=ajdOff()?'offline':String((e&&e.message)||e).slice(0,160); ajdRender(); });
}
function ajdGarantaBusca(){
  if(!idApontar()||_ajd.busca||_ajd.buscaP||_ajd.buscaErro) return;
  _ajd.buscaP=true; const ger=_ajd.ger;
  ajdGet('busca').then(r=>{
    if(r.ger!==_ajd.ger) return; _ajd.buscaP=false;
    if(r.ok&&Array.isArray(r.j.itens)) _ajd.busca=r.j.itens; else _ajd.buscaErro=ajdErroTxt(r);
    ajdRender();
  }).catch(e=>{ if(ger!==_ajd.ger) return; _ajd.buscaP=false; _ajd.buscaErro='falha'; ajdRender(); });
}
function ajdEstado(){
  if(!idApontar()) return 'sem-id';
  if(_ajd.idxErro==='401') return 'sem-id';
  if(_ajd.idx){ const e=_ajd.idx.estado; return e==='vazio'?'vazio':e==='sem-chave'?'sem-chave':'ok'; }
  if(_ajd.idxErro==='offline'||(ajdOff()&&!_ajd.idxP)) return 'offline';
  if(_ajd.idxErro) return 'erro';
  return 'carregando';
}
function ajdRecarrega(){ ajdConfereId(); _ajd.idxErro=''; _ajd.procErro={}; _ajd.buscaErro=''; ajdRender(); }

// ---------------- renderização do conteúdo (SÓ createElement + textContent) ----------------
function ajdInline(lista,pai){
  (Array.isArray(lista)?lista:[]).forEach(x=>{
    if(!x||typeof x!=='object') return;
    if(x.br){ pai.appendChild(document.createElement('br')); return; }
    let n=document.createTextNode(String(x.x==null?'':x.x));
    const envolve=(tag)=>{ const e=document.createElement(tag); e.appendChild(n); n=e; };
    if(x.c) envolve('code'); if(x.b) envolve('strong'); if(x.i) envolve('em'); if(x.s) envolve('s');
    if(x.p&&AJD_RE_ARQ.test(String(x.p))){
      const b=ajdEl('button','ajd-plink'); b.type='button'; b.setAttribute('data-ajd-p',x.p); if(x.ps&&AJD_RE_SLUG.test(String(x.ps))) b.setAttribute('data-ajd-ps',x.ps); b.appendChild(n); pai.appendChild(b); return;
    }
    if(x.l&&ajdUrlOk(x.l)){
      const a=document.createElement('a'); a.href=x.l; a.target='_blank'; a.rel='noopener noreferrer'; a.className='ajd-ext'; a.appendChild(n); a.appendChild(document.createTextNode(' ↗')); pai.appendChild(a); return;
    }
    pai.appendChild(n);
  });
}
function ajdBlocos(lista,pai,ctx,prof){ (Array.isArray(lista)?lista:[]).forEach(b=>{ const n=ajdBloco(b,ctx,prof||0); if(n) pai.appendChild(n); }); }
function ajdBloco(b,ctx,prof){
  if(!b||typeof b!=='object'||prof>8) return null;
  switch(b.t){
    case 'p': { const e=ajdEl('p','ajd-p'); ajdInline(b.i,e); return e; }
    case 'h': { const e=ajdEl(b.n===4?'h5':'h4','ajd-h'); ajdInline(b.i,e); return e; }
    case 'ul': case 'ol': {
      const e=ajdEl(b.t==='ol'?'ol':'ul','ajd-l');
      (Array.isArray(b.it)?b.it:[]).forEach(it=>{ if(!it) return; const li=document.createElement('li'); ajdInline(it.i,li); ajdBlocos(it.f,li,ctx,prof+1); e.appendChild(li); });
      return e;
    }
    case 'nota': {
      const cor=['azul','amarelo','vermelho','verde','cinza'].includes(b.cor)?b.cor:'cinza';
      const e=ajdEl('div','ajd-nota ajd-nota-'+cor); if(b.ic) e.appendChild(ajdEl('span','ajd-nota-ic',String(b.ic).slice(0,16)));
      const c=ajdEl('div','ajd-nota-c'); ajdBlocos(b.b,c,ctx,prof+1); e.appendChild(c); return e;
    }
    case 'cit': { const e=ajdEl('blockquote','ajd-cit'); ajdBlocos(b.b,e,ctx,prof+1); return e; }
    case 'cod': { const pre=ajdEl('pre','ajd-cod'); const c=document.createElement('code'); c.textContent=String(b.x==null?'':b.x); pre.appendChild(c); const w=ajdEl('div','scroll-x'); w.appendChild(pre); return w; }
    case 'mermaid': return ajdMmNode(String(b.x==null?'':b.x),ctx);
    case 'tab': {
      const w=ajdEl('div','scroll-x'); const t=ajdEl('table','ajd-tab');
      (Array.isArray(b.l)?b.l:[]).forEach((linha,i)=>{ const tr=document.createElement('tr');
        (Array.isArray(linha)?linha:[]).forEach(cel=>{ const td=document.createElement(b.cab&&i===0?'th':'td'); ajdInline(cel,td); tr.appendChild(td); }); t.appendChild(tr); });
      w.appendChild(t); return w;
    }
    case 'det': {
      const d=ajdEl('details','ajd-det'); const s=document.createElement('summary'); ajdInline(b.s,s); d.appendChild(s);
      const c=ajdEl('div','ajd-det-c'); ajdBlocos(b.b,c,ctx,prof+1); d.appendChild(c); return d;
    }
    case 'hr': return ajdEl('hr','ajd-hr');
    case 'omit': {
      const e=ajdEl('p','ajd-omit'); const tipo=String(b.tipo||'imagem').slice(0,30);
      const u=(ctx&&ctx.url)||'';
      e.appendChild(document.createTextNode('🖼 '+tipo+' — ')); if(ajdUrlOk(u)) e.appendChild(ajdLinkExt('ver no Notion',u)); else e.appendChild(document.createTextNode('ver no Notion'));
      return e;
    }
    default: return null;
  }
}
function ajdSecaoNode(sec,ctx,aberta){
  const s=ajdEl('section','ajd-sec'); if(sec.id&&AJD_RE_SLUG.test(String(sec.id))) s.id='ajd-s-'+sec.id;
  if(aberta!==false) s.appendChild(ajdEl('h3','ajd-sec-t',String(sec.t||''))); ajdBlocos(sec.b,s,ctx,0); return s;
}
function ajdAchaSecao(pr,kw){
  const secs=Array.isArray(pr&&pr.secs)?pr.secs:[];
  if(kw){ const k=ajdSA(kw); const s=secs.find(x=>ajdSA(x.t).includes(k)); if(s) return s; }
  return secs.find(x=>x.id==='resumo')||secs[0]||{ id:'resumo', t:'Resumo', b:[] };
}

// ---------------- mermaid (sob demanda; versão exata + SRI; securityLevel 'strict') ----------------
function ajdMermaidCarrega(){
  if(window.mermaid) return Promise.resolve(window.mermaid);
  if(_ajdMmLib) return _ajdMmLib;
  _ajdMmLib=new Promise((ok,nao)=>{
    const s=document.createElement('script'); s.src=AJD_MERMAID_URL; s.integrity=AJD_MERMAID_SRI; s.crossOrigin='anonymous'; s.async=true;
    s.onload=()=>{ window.mermaid?ok(window.mermaid):nao(new Error('mermaid indisponível')); };
    s.onerror=()=>{ _ajdMmLib=null; s.remove(); nao(new Error('não carregou o diagrama')); };
    document.head.appendChild(s);
  });
  return _ajdMmLib;
}
function ajdMermaidPinta(el,svg){ const t=document.createElement('template'); t.innerHTML=svg; ajdMermaidLimpa(t.content); el.replaceChildren(t.content); }   // o SVG vem da lib mermaid em securityLevel 'strict' (já sanitizado) — e é limpo num <template> inerte ANTES de entrar na página (nada carrega nem roda no meio)
function ajdMermaidLimpa(raiz){   // defesa em profundidade: o rótulo HTML do mermaid pode deixar <img src>; nada de ativo/externo sobra no SVG
  raiz.querySelectorAll('script,img,iframe,object,embed,link,audio,video,source').forEach(n=>n.remove());
  raiz.querySelectorAll('*').forEach(n=>{
    [...n.attributes].forEach(a=>{
      const nome=a.name.toLowerCase();
      if(/^on/.test(nome)) n.removeAttribute(a.name);
      else if((nome==='href'||nome==='xlink:href'||nome==='src')&&!/^#/.test(String(a.value).trim())) n.removeAttribute(a.name);
    });
  });
}
function ajdMmNode(fonte,ctx){
  const e=ajdEl('div','ajd-mm'); e.setAttribute('data-ajd-mm','novo'); e._ajdFonte=fonte.slice(0,6000); e._ajdUrl=(ctx&&ctx.url)||'';
  e.appendChild(ajdEl('div','ajd-mm-st muted small','Diagrama'));
  return e;
}
function ajdMmFalha(e,msg){
  e.setAttribute('data-ajd-mm','falha'); e.replaceChildren();
  e.appendChild(ajdEl('div','muted small',msg||'Não consegui desenhar o diagrama — aqui está o código dele.'));
  const w=ajdEl('div','scroll-x'); const pre=ajdEl('pre','ajd-cod'); const c=document.createElement('code'); c.textContent=e._ajdFonte; pre.appendChild(c); w.appendChild(pre); e.appendChild(w);
  if(ajdUrlOk(e._ajdUrl)) e.appendChild(ajdLinkExt('ver o diagrama no Notion',e._ajdUrl));
}
async function ajdMmDesenha(e){
  e.setAttribute('data-ajd-mm','carregando'); e.replaceChildren(ajdEl('div','skel ajd-mm-skel'));
  try{
    const mm=await ajdMermaidCarrega();
    const escuro=document.documentElement.getAttribute('data-theme')==='dark';
    mm.initialize({ startOnLoad:false, securityLevel:'strict', theme:escuro?'dark':'neutral', flowchart:{ htmlLabels:false } });
    _ajdMmN+=1; const id='ajdm'+_ajdMmN;
    const r=await mm.render(id,e._ajdFonte);
    if(!e.isConnected) return;
    const w=ajdEl('div','scroll-x'); ajdMermaidPinta(w,r.svg); e.replaceChildren(w); e.setAttribute('data-ajd-mm','ok');
    const o=document.getElementById('d'+id); if(o) o.remove();
  }catch(err){ const o=document.getElementById('dajdm'+_ajdMmN); if(o) o.remove(); if(e.isConnected) ajdMmFalha(e); }
}
function ajdMmVarre(raiz){   // desenha os diagramas visíveis (fora de <details> fechado); celular/saveData: só com o botão
  (raiz||document).querySelectorAll('.ajd-mm[data-ajd-mm="novo"]').forEach(e=>{
    const d=e.closest('details'); if(d&&!d.open) return;
    const poupa=ajdMobile()||(navigator.connection&&navigator.connection.saveData);
    if(poupa){ e.setAttribute('data-ajd-mm','botao'); e.replaceChildren(ajdBtn('▶ Ver diagrama',{'data-ajd-mm-ver':'1'})); return; }
    ajdMmDesenha(e);
  });
}
function ajdMmRedesenhaTema(){   // trocar o tema redesenha os diagramas já desenhados
  document.querySelectorAll('#ajd .ajd-mm[data-ajd-mm="ok"]').forEach(e=>{ e.setAttribute('data-ajd-mm','novo'); });
  const b=document.getElementById('ajd-corpo'); if(b) ajdMmVarre(b);
}

// ---------------- cartões de estado ----------------
function ajdCartao(est,msg){
  const c=ajdEl('div','ajd-cartao ajd-est-'+est); c.setAttribute('data-ajd-estado',est);
  const lk=()=>{ const p=ajdEl('p','ajd-cartao-lk'); p.appendChild(ajdLinkExt('abrir a documentação no Notion',AJD_NOTION_RAIZ)); return p; };
  if(est==='sem-id'){
    const nao=_ajd.idxErro==='401';
    c.appendChild(ajdEl('p','ajd-cartao-t',nao?'Sua identificação não foi aceita (token vencido ou trocado).':'A documentação aparece para quem está identificado.'));
    c.appendChild(ajdEl('p','muted small','É a mesma identificação do ⏱ Apontar (e-mail + token do Jira) — só leitura, nada é gravado no seu nome.'));
    c.appendChild(ajdBtn('Identificar-me',{'data-ajd-acao':'ident'},'btn primario')); c.appendChild(lk());
  }else if(est==='carregando'){
    c.setAttribute('aria-busy','true'); ['90%','75%','82%','60%'].forEach(w=>{ const s=ajdEl('div','skel'); s.style.width=w; s.style.height='12px'; s.style.margin='8px 0'; c.appendChild(s); });
  }else if(est==='vazio'||est==='sem-chave'){
    c.appendChild(ajdEl('p','ajd-cartao-t','A documentação ainda não foi sincronizada com o Notion.'));
    if(ajdPodeSinc()){
      if(est==='sem-chave') c.appendChild(ajdEl('p','muted small','Falta configurar a chave do Notion no servidor (NOTION_TOKEN) — veja o ticket [Manual step].'));
      else c.appendChild(ajdBtn('↻ Atualizar a documentação agora',{'data-ajd-acao':'sinc'},'btn primario'));
    }else c.appendChild(ajdEl('p','muted small','Enquanto isso, o 🧭 guia desta tela, o ▶ tour e as ✨ Novidades continuam funcionando.'));
    c.appendChild(lk());
  }else if(est==='offline'){
    c.appendChild(ajdEl('p','ajd-cartao-t','Sem rede — a documentação não fica guardada no aparelho.'));
    c.appendChild(ajdEl('p','muted small','Quando a conexão voltar, tente de novo. O 🧭 guia e o ▶ tour seguem funcionando.'));
    c.appendChild(ajdBtn('↻ Tentar de novo',{'data-ajd-acao':'retry'},'btn')); c.appendChild(lk());
  }else{
    c.appendChild(ajdEl('p','ajd-cartao-t',msg||'Não consegui carregar a documentação.'));
    if(_ajd.idxErro&&_ajd.idxErro!=='401') c.appendChild(ajdEl('p','muted small',_ajd.idxErro));
    c.appendChild(ajdBtn('↻ Tentar de novo',{'data-ajd-acao':'retry'},'btn')); c.appendChild(lk());
  }
  return c;
}

// ---------------- aba Esta tela ----------------
function ajdInfoProc(pr,arq){
  const ip=ajdProcDoIndice(arq)||{}; const url=ajdUrlOk(pr.url)?pr.url:(ajdUrlOk(ip.url)?ip.url:'');
  const d=ajdEl('div','ajd-info muted small');
  d.appendChild(document.createTextNode('📘 '+String(pr.cod||ip.cod||arq.toUpperCase())+' · '+String(pr.titulo||ip.titulo||'')+(pr.editadoEm?' · atualizado em '+ajdDataBR(pr.editadoEm):'')+' · '));
  if(url) d.appendChild(ajdLinkExt('abrir no Notion',url)); return d;
}
function ajdTelaNodes(){
  const v=estado.vista; const out=[];
  const cab=ajdEl('div','ajd-tela-cab'); cab.appendChild(ajdEl('h3','ajd-tela-t',ajdNomeVista(v))); out.push(cab);
  const ac=ajdEl('div','ajd-acoes');
  ac.appendChild(ajdBtn('🧭 Guia interativo desta tela',{'data-ajd-acao':'guia'},'btn primario'));
  ac.appendChild(ajdBtn('▶ Tour rápido',{'data-ajd-acao':'tour'})); ac.appendChild(ajdBtn('🗺 Tour completo',{'data-ajd-acao':'tour-telas'}));
  out.push(ac);
  const est=ajdEstado();
  if(est!=='ok'){ out.push(ajdCartao(est)); return out; }
  const m=AJUDA_MAPA[v];
  if(!m){
    const c=ajdEl('div','ajd-cartao'); c.appendChild(ajdEl('p','ajd-cartao-t','Esta tela ainda não tem página no manual.'));
    const r=ajdEl('div','ajd-acoes'); r.appendChild(ajdBtn('📘 Ver o manual',{'data-ajd-aba':'manual'})); r.appendChild(ajdBtn('🐞 Avisar que falta',{'data-ajd-acao':'reportar'})); c.appendChild(r); out.push(c); return out;
  }
  const arq=String(m[0]).toLowerCase(); const pr=_ajd.proc[arq];
  if(!pr){
    ajdGarantaProc(arq);
    const e=_ajd.procErro[arq];
    if(e){ const c=ajdCartao('erro',e==='nao-sinc'?'Este processo ainda não foi sincronizado com o Notion.':'Não consegui carregar esta página do manual.'); out.push(c); }
    else out.push(ajdCartao('carregando'));
    return out;
  }
  const sec=ajdAchaSecao(pr,m[1]); const ctx={ url:pr.url };
  out.push(ajdInfoProc(pr,arq)); out.push(ajdSecaoNode(sec,ctx));
  const outras=(pr.secs||[]).filter(s=>s&&s.id!==sec.id);
  if(outras.length){
    const mais=ajdEl('div','ajd-mais'); mais.appendChild(ajdEl('h3','ajd-mais-t','Mais deste processo'));
    outras.forEach(s=>mais.appendChild(ajdDetSecao(arq,s,ctx,false)));
    out.push(mais);
  }
  return out;
}
function ajdDetSecao(arq,s,ctx,abrir){
  const key=arq+'|'+s.id; const d=ajdEl('details','ajd-secd'); d.setAttribute('data-ajd-key',key); if(AJD_RE_SLUG.test(String(s.id))) d.id='ajd-d-'+s.id;
  if(abrir||estado.ajuda.abertas[key]) d.open=true;
  d.appendChild(ajdEl('summary','ajd-secd-t',String(s.t||''))); const c=ajdEl('div','ajd-secd-c'); ajdBlocos(s.b,c,ctx,0); d.appendChild(c); return d;
}

// ---------------- aba Manual ----------------
function ajdManualNodes(){
  const A=estado.ajuda; const out=[];
  if(!A.proc){
    const g=ajdBtn('📖 Guia rápido do app (todas as telas, passo a passo escrito)',{'data-ajd-acao':'guiarapido'},'btn ajd-linha'); out.push(g);
  }
  const est=ajdEstado();
  if(est!=='ok'){ out.push(ajdCartao(est)); return out; }
  if(A.proc) return out.concat(ajdProcNodes(A.proc));
  const procs=(_ajd.idx.procs||[]);
  AJD_GRUPOS.forEach(([gid,gt])=>{
    const itens=procs.filter(p=>p.grupo===gid); if(!itens.length) return;
    const bloco=ajdEl('div','ajd-grupo'); bloco.appendChild(ajdEl('h3','ajd-grupo-t',gt));
    itens.forEach(p=>{
      const b=ajdEl('button','ajd-proc'); b.type='button'; b.setAttribute('data-ajd-proc',p.arq);
      b.appendChild(ajdEl('span','ajd-proc-cod',String(p.cod||''))); b.appendChild(ajdEl('span','ajd-proc-t',String(p.titulo||p.cod||p.arq)));
      const sub=!p.editadoEm?'ainda não sincronizado':(p.desatualizado?'⚠ não atualizou — conteúdo de '+ajdDataBR(p.editadoEm):'atualizado em '+ajdDataBR(p.editadoEm));
      b.appendChild(ajdEl('span','ajd-proc-d muted small',sub)); bloco.appendChild(b);
    });
    out.push(bloco);
  });
  const sl=(_ajd.idx.soLink||[]).filter(x=>ajdUrlOk(x.url));
  if(sl.length){ const bloco=ajdEl('div','ajd-grupo'); bloco.appendChild(ajdEl('h3','ajd-grupo-t','Só no Notion'));
    sl.forEach(x=>{ const p=ajdEl('p','ajd-sl'); p.appendChild(document.createTextNode(String(x.cod||'')+' · ')); p.appendChild(ajdLinkExt(String(x.titulo||'Índice e histórico de mudanças'),x.url)); bloco.appendChild(p); }); out.push(bloco); }
  if(!procs.length) out.push(ajdCartao('vazio'));
  return out;
}
function ajdProcNodes(arq){
  const A=estado.ajuda; const out=[]; const ip=ajdProcDoIndice(arq)||{}; const pr=_ajd.proc[arq];
  const bar=ajdEl('div','ajd-acoes'); bar.appendChild(ajdBtn('← Manual',{'data-ajd-voltar':'1'}));
  const url=ajdUrlOk(pr&&pr.url)?pr.url:(ajdUrlOk(ip.url)?ip.url:'');
  if(url) bar.appendChild(ajdLinkExt('abrir no Notion',url,'btn ajd-ext'));
  bar.appendChild(ajdBtn('🔗 copiar link',{'data-ajd-copia':'1'})); out.push(bar);
  if(!pr){
    ajdGarantaProc(arq); const e=_ajd.procErro[arq];
    out.push(e?ajdCartao('erro',e==='nao-sinc'?'Este processo ainda não foi sincronizado — a documentação dele está só no Notion.':'Não consegui carregar este processo.'):ajdCartao('carregando')); return out;
  }
  out.push(ajdEl('h3','ajd-proc-h',String(pr.cod||'')+' · '+String(pr.titulo||'')));
  if(ip.desatualizado) out.push(ajdEl('div','ajd-aviso small','⚠ Não atualizou na última sincronização — o conteúdo é de '+(ajdDataBR(pr.editadoEm)||'antes')+'.'));
  out.push(ajdInfoProc(pr,arq));
  const idxl=ajdEl('div','ajd-indice'); (pr.secs||[]).forEach(s=>{ if(!AJD_RE_SLUG.test(String(s.id))) return; idxl.appendChild(ajdBtn(String(s.t||''),{'data-ajd-sec':s.id},'ajd-sec-lk')); }); out.push(idxl);
  const ctx={ url:pr.url };
  (pr.secs||[]).forEach(s=>{ out.push(ajdDetSecao(arq,s,ctx,A.sec&&s.id===A.sec)); });
  return out;
}

// ---------------- aba Novidades ----------------
function ajdNovidadesNodes(){
  const out=[];
  try{ if(typeof NOV_VER!=='undefined') localStorage.setItem('jirainsight_nov_visto',NOV_VER); }catch(e){}
  ['nov-dot','mais-dot'].forEach(i=>{ const d=document.getElementById(i); if(d) d.hidden=true; });
  out.push(ajdEl('div','muted small','O que há de novo no painel — o histórico completo fica no manual.'));
  const lista=ajdEl('div','nov-lista');
  (typeof NOVIDADES!=='undefined'?NOVIDADES:[]).forEach(([d,txt])=>{
    const it=ajdEl('div','nov-item'); it.appendChild(ajdEl('span','nov-data',String(d)));
    const t=ajdEl('span','nov-txt'); t.innerHTML=txt; // ajd:casca — texto das Novidades é do próprio app (não vem do Notion)
    it.appendChild(t); lista.appendChild(it);
  });
  out.push(lista);
  const r=ajdEl('div','ajd-acoes'); r.appendChild(ajdBtn('🗺️ Roadmap',{'data-ajd-acao':'roadmap'})); out.push(r);
  return out;
}

// ---------------- busca ----------------
function ajdBuscaCalc(q){
  const P=ajdSA(q).split(/\s+/).filter(Boolean); const out=[]; const idx=_ajd.idx;
  if(!idx||!P.length) return { P, itens:[] };
  (idx.procs||[]).forEach(p=>{ (p.secs||[]).forEach(s=>{
    const t=ajdSA(String(p.titulo||'')+' '+String(p.cod||'')+' '+String(s.t||'')); if(P.every(w=>t.includes(w))) out.push({ p:p.arq, pt:p.titulo||p.cod||p.arq, s:s.id, st:s.t, x:'' }); }); });
  (_ajd.busca||[]).forEach(it=>{
    if(!it||!AJD_RE_ARQ.test(String(it.p))) return;
    const t=ajdSA(String(it.st||'')+' '+String(it.x||'')); if(!P.every(w=>t.includes(w))) return;
    const j=out.findIndex(o=>o.p===it.p&&o.s===it.s); if(j>=0) out[j].x=String(it.x||''); else out.push({ p:it.p, pt:it.pt||it.p, s:it.s, st:it.st, x:String(it.x||'') });
  });
  return { P, itens:out.slice(0,30) };
}
function ajdMarca(el,texto,P){   // trecho com <mark> montado por DOM
  const t=String(texto); const low=ajdSA(t); const marcas=[];
  P.forEach(w=>{ let i=0; while(w&&(i=low.indexOf(w,i))>=0){ marcas.push([i,i+w.length]); i+=w.length; } });
  marcas.sort((a,b)=>a[0]-b[0]); let pos=0;
  marcas.forEach(([a,b])=>{ if(a<pos) return; if(a>pos) el.appendChild(document.createTextNode(t.slice(pos,a))); el.appendChild(ajdEl('mark','',t.slice(a,b))); pos=b; });
  if(pos<t.length) el.appendChild(document.createTextNode(t.slice(pos)));
}
function ajdBuscaNodes(){
  const A=estado.ajuda; const out=[]; const est=ajdEstado();
  if(est!=='ok'){ out.push(ajdCartao(est)); return out; }
  ajdGarantaBusca();
  const r=ajdBuscaCalc(A.q); A._res=r.itens;
  out.push(ajdEl('div','muted small',`${r.itens.length} resultado(s) para “${A.q.trim()}”${_ajd.buscaP?' · buscando no texto dos processos…':''}`));
  if(!r.itens.length&&!_ajd.buscaP){
    const c=ajdEl('div','ajd-cartao'); c.appendChild(ajdEl('p','ajd-cartao-t','Nada encontrado.'));
    c.appendChild(ajdEl('p','muted small','Tente outras palavras, abra o 🧭 guia desta tela ou avise o que faltou pelo 🐞 Reportar.'));
    const ac=ajdEl('div','ajd-acoes'); ac.appendChild(ajdBtn('🧭 Guia desta tela',{'data-ajd-acao':'guia'})); ac.appendChild(ajdBtn('🐞 Reportar',{'data-ajd-acao':'reportar'})); c.appendChild(ac); out.push(c); return out;
  }
  const lista=ajdEl('div','ajd-res'); lista.setAttribute('role','list');
  r.itens.forEach((it,i)=>{
    const b=ajdEl('button','ajd-res-i'); b.type='button'; b.setAttribute('data-ajd-res',String(i)); b.setAttribute('role','listitem');
    b.appendChild(ajdEl('span','ajd-res-t',String(it.pt)+' › '+String(it.st)));
    if(it.x){ const sn=ajdEl('span','ajd-res-x muted small'); const low=ajdSA(it.x); const k=Math.max(0,low.indexOf(r.P[0])); const ini=Math.max(0,k-40);
      sn.appendChild(document.createTextNode(ini>0?'…':'')); ajdMarca(sn,it.x.slice(ini,ini+120),r.P); b.appendChild(sn); }
    lista.appendChild(b);
  });
  out.push(lista); return out;
}

// ---------------- casca: título, abas, rodapé ----------------
function ajdTitulo(){ const t=document.getElementById('ajd-tit'); if(t) t.textContent='❓ Ajuda'; }
function ajdPintaAbas(){
  const A=estado.ajuda; document.querySelectorAll('#ajd [data-ajd-aba].ajd-aba').forEach(b=>{ const on=b.getAttribute('data-ajd-aba')===A.aba&&!(A.q&&A.q.trim().length>=2); b.setAttribute('aria-selected',on?'true':'false'); b.tabIndex=on?0:-1; b.classList.toggle('on',on); });
}
function ajdRodape(){
  const f=document.getElementById('ajd-rodape'); if(!f) return;
  const A=estado.ajuda; const idx=_ajd.idx; const nos=[];
  const l1=ajdEl('div','ajd-rod-l'); l1.appendChild(ajdBtn('💬 Dúvidas e feedback',{id:'ajd-duvidas','data-ajd-acao':'duvidas'})); l1.appendChild(ajdBtn('🐞 Reportar',{id:'ajd-reportar','data-ajd-acao':'reportar'})); nos.push(l1);
  const l2=ajdEl('div','ajd-rod-l muted small');
  l2.appendChild(document.createTextNode(idx&&idx.okEm?('📘 Sincronizada com o Notion em '+ajdQuando(idx.okEm)+' · '):'📘 Documentação do Notion · '));
  l2.appendChild(ajdLinkExt('abrir no Notion',ajdUrlOk(idx&&idx.raiz)?idx.raiz:AJD_NOTION_RAIZ)); nos.push(l2);
  if(ajdPodeSinc()){
    const l3=ajdEl('div','ajd-rod-l'); const b=ajdBtn('↻ Atualizar a documentação agora',{id:'ajd-sinc','data-ajd-acao':'sinc'}); if(_ajd.sinc) b.disabled=true; l3.appendChild(b);
    const msg=ajdEl('span','ajd-sinc-msg muted small'); msg.setAttribute('aria-live','polite');
    if(_ajd.sinc){ const tot=((idx&&idx.procs)||[]).length||0; const pend=_ajd.sinc.pend; msg.textContent=pend==null?'Sincronizando… volta '+_ajd.sinc.volta:(tot?`${Math.max(0,tot-pend)} de ${tot} processos`:`${pend} pendente(s)`)+' · volta '+_ajd.sinc.volta; }
    else msg.textContent=_ajd.sincMsg||'';
    l3.appendChild(msg); nos.push(l3);
    const d=ajdEl('details','ajd-diag'); d.id='ajd-diag'; if(A.diagAberto) d.open=true; d.appendChild(ajdEl('summary','','Diagnóstico')); d.appendChild(ajdDiagNode()); nos.push(d);
  }
  f.replaceChildren(...nos);
}
function ajdMapaDiag(){
  const idx=_ajd.idx; const out=[]; if(!idx) return out;
  Object.keys(AJUDA_MAPA).forEach(v=>{ const [cod,kw]=AJUDA_MAPA[v]; if(!kw) return;
    const p=(idx.procs||[]).find(x=>x.cod===cod); if(!p||!Array.isArray(p.secs)||!p.secs.length) return;
    if(!p.secs.some(s=>ajdSA(s.t).includes(kw))) out.push({ v, cod, kw }); });
  return out;
}
function ajdDiagNode(){
  const d=ajdEl('div','ajd-diag-c small'); const dg=(_ajd.idx&&_ajd.idx.diag)||{ erros:[], masc:[], tipos:[] };
  const lista=(tit,itens)=>{ const s=ajdEl('div','ajd-diag-s'); s.appendChild(ajdEl('strong','',tit)); if(!itens.length) s.appendChild(ajdEl('div','muted','nada a corrigir')); else { const ul=ajdEl('ul','ajd-l'); itens.forEach(t=>ul.appendChild(ajdEl('li','',t))); s.appendChild(ul); } d.appendChild(s); };
  lista('Páginas que não atualizaram',(dg.erros||[]).map(x=>`${x.cod} — ${x.erro}`));
  lista('Trechos mascarados (credenciais no Notion)',(dg.masc||[]).map(x=>`${x.n} trecho(s) mascarado(s) em ${x.cod}`));
  lista('Tipos de bloco ignorados',(dg.tipos||[]).map(x=>`${x.cod}: ${(x.tipos||[]).join(', ')}`));
  lista('Telas cuja seção do mapa não foi achada (abrem o Resumo)',ajdMapaDiag().map(x=>`${x.v} → ${x.cod} “${x.kw}”`));
  return d;
}

// ---------------- render principal ----------------
function ajdRender(){
  const A=estado.ajuda; if(!A.aberto) return; const box=document.getElementById('ajd-corpo'); if(!box) return;
  A.nRender+=1; ajdConfereId();
  if(idApontar()) ajdGaranteIndice();
  const st=box.scrollTop; const at=document.activeElement; const idAt=(at&&box.contains(at)&&at.id)?at.id:'';
  _ajdVistaFoto=estado.vista;
  ajdTitulo(); ajdPintaAbas();
  let nodes;
  try{ nodes=(A.q&&A.q.trim().length>=2)?ajdBuscaNodes():A.aba==='manual'?ajdManualNodes():A.aba==='novidades'?ajdNovidadesNodes():ajdTelaNodes(); }
  catch(e){ try{ console.error('[ajd]',e); }catch(_){} nodes=[ajdCartao('erro','Não consegui desenhar a ajuda.')]; }
  box.replaceChildren(...nodes);
  ajdRodape(); ajdMmVarre(box);
  box.scrollTop=st;
  if(A._alvo){ const alvo=document.getElementById('ajd-d-'+A._alvo); if(alvo){ alvo.open=true; alvo.scrollIntoView({ block:'start' }); } A._alvo=''; }
  if(idAt){ const n=document.getElementById(idAt); if(n&&n.focus) n.focus({ preventScroll:true }); }
}
function ajdAoTrocarTela(){   // gancho do aplicaChrome (01): só redesenha com o painel aberto na aba Esta tela e a vista mudou
  const A=estado.ajuda; if(!A.aberto) return; if(_ajdVistaFoto===estado.vista) return; _ajdVistaFoto=estado.vista;
  if(A.aba==='tela'&&!(A.q&&A.q.trim().length>=2)) ajdRender();
}
function ajdSalva(){ try{ localStorage.setItem(AJD_LS,JSON.stringify({ aba:estado.ajuda.aba })); }catch(e){} }

// ---------------- abrir, fechar, foco ----------------
function ajdAbre(o){
  o=o||{}; const A=estado.ajuda; const aside=document.getElementById('ajd'); if(!aside) return;
  if(o.aba&&AJD_ABAS.some(a=>a[0]===o.aba)) A.aba=o.aba;
  if(o.proc!==undefined){ A.proc=AJD_RE_ARQ.test(String(o.proc))?String(o.proc):''; const s=String(o.sec||''); A.sec=AJD_RE_SLUG.test(s)?s:''; A._alvo=A.sec; if(A.proc) A.aba='manual'; }
  if(o.q!==undefined){ A.q=String(o.q); const q=document.getElementById('ajd-q'); if(q) q.value=A.q; }
  const ja=A.aberto;
  if(!ja){ const at=document.activeElement; A.opener=(at&&at!==document.body)?at:document.getElementById('btn-ajuda-topo'); }
  A.aberto=true; aside.hidden=false; aside.setAttribute('aria-modal',ajdMobile()?'true':'false');
  const bt=document.getElementById('btn-ajuda-topo'); if(bt) bt.setAttribute('aria-expanded','true');
  ajdSalva(); ajdRender();
  if(!ja||o.foco){ const alvo=ajdMobile()?document.getElementById('ajd-tit'):document.getElementById('ajd-q'); if(alvo) alvo.focus({ preventScroll:true }); }
}
function ajdFecha(){
  const A=estado.ajuda; if(!A.aberto) return; const aside=document.getElementById('ajd');
  A.aberto=false; if(aside) aside.hidden=true;
  const bt=document.getElementById('btn-ajuda-topo'); if(bt) bt.setAttribute('aria-expanded','false');
  const op=A.opener&&A.opener.isConnected?A.opener:bt; A.opener=null; if(op&&op.focus) op.focus({ preventScroll:true });
}
function ajdToggle(){ if(estado.ajuda.aberto) ajdFecha(); else ajdAbre({}); }
function ajdAbreProc(arq,sec){ ajdAbre({ proc:arq, sec:sec||'', q:'' }); }
function ajdLinkCopia(){
  const A=estado.ajuda; if(!A.proc) return '';
  const p=new URLSearchParams(); if(estado.vista!=='acoes') p.set('v',estado.vista); p.set('ajp',A.proc); if(A.sec) p.set('ajs',A.sec);
  return location.origin+location.pathname+'?'+p.toString();
}
let _ajdURL=null;
function ajdDeURL(p,s){   // ?ajp=<arq>&ajs=<slug>: abre o painel no processo/seção (chamado pelo leURL, 29)
  if(_ajdURL||!AJD_RE_ARQ.test(String(p||''))) return; _ajdURL={ p:String(p), s:AJD_RE_SLUG.test(String(s||''))?String(s):'' };
  setTimeout(()=>{ try{ ajdAbre({ proc:_ajdURL.p, sec:_ajdURL.s }); }catch(e){} },700);
}

// ---------------- sincronização (gestor/admin) ----------------
async function ajdSincroniza(){
  if(_ajd.sinc||!idApontar()||!ajdPodeSinc()) return;
  const ger=_ajd.ger; _ajd.sinc={ volta:0, pend:null }; _ajd.sincMsg=''; ajdRodape();
  let msg='';
  try{
    for(let i=0;i<AJD_SINC_VOLTAS;i+=1){
      if(ger!==_ajd.ger) return; _ajd.sinc.volta=i+1; ajdRodape();
      const r=await fetch('/api/config?ajuda=1',{ method:'POST', headers:{ 'Content-Type':'application/json', ...ajdHeaders() }, body:JSON.stringify({ acao:'sincronizar', forcar:false }), cache:'no-store' });
      let j=null; try{ j=await r.json(); }catch(e){}
      if(ger!==_ajd.ger) return;
      if(r.status===403){ msg='Só gestores ou admin do painel atualizam a documentação agora.'; break; }
      if(r.status===429){ msg=(j&&j.erro)||'A documentação acabou de ser atualizada — aguarde 30 segundos.'; break; }
      if(j&&j.semChave){ msg='Falta configurar a chave do Notion no servidor (NOTION_TOKEN).'; break; }
      if(!r.ok||!j||!j.ok){ msg=(j&&j.erro)||'Não consegui sincronizar agora.'; break; }
      _ajd.sinc.pend=j.pendentes|0;
      if(!(j.pendentes>0)){ msg=j.falhas>0?`Concluído, com ${j.falhas} página(s) sem atualizar — veja o Diagnóstico.`:'Documentação atualizada.'; break; }
      if(i===AJD_SINC_VOLTAS-1) msg='Ainda há páginas pendentes — clique de novo para continuar.';
    }
  }catch(e){ msg=ajdOff()?'Sem rede.':'Não consegui sincronizar agora.'; }
  if(ger!==_ajd.ger) return;
  _ajd.sinc=null; _ajd.sincMsg=msg; _ajd.proc={}; _ajd.procP={}; _ajd.procErro={}; _ajd.busca=null; _ajd.buscaP=false; _ajd.buscaErro='';
  ajdGaranteIndice(true); ajdRender();
}

// ---------------- eventos ----------------
function ajdClique(e){
  const t=e.target; if(!t||!t.closest) return;
  const A=estado.ajuda;
  if(t.closest('#ajd-x')){ ajdFecha(); return; }
  const aba=t.closest('[data-ajd-aba]');
  if(aba){ A.aba=aba.getAttribute('data-ajd-aba'); A.q=''; const q=document.getElementById('ajd-q'); if(q) q.value=''; if(A.aba==='manual') { /* mantém o processo aberto */ } ajdSalva(); ajdRender(); return; }
  const ac=t.closest('[data-ajd-acao]');
  if(ac){
    const a=ac.getAttribute('data-ajd-acao');
    if(a==='guia'){ if(ajdMobile()) ajdFecha(); iniciaGuia(estado.vista); }
    else if(a==='tour'){ if(ajdMobile()) ajdFecha(); iniciaTour(); }
    else if(a==='tour-telas'){ if(ajdMobile()) ajdFecha(); iniciaTourTelas(); }
    else if(a==='guiarapido') abreAjuda();
    else if(a==='duvidas') abreAjuda();
    else if(a==='reportar') abreReportar();
    else if(a==='roadmap'){ if(ajdMobile()) ajdFecha(); vaiPara('roadmap'); }
    else if(a==='retry'){ ajdGaranteIndice(true); _ajd.procErro={}; ajdRender(); }
    else if(a==='ident') abreIdentidade('ler a documentação do painel',{ leitura:true, depois:ajdRecarrega });
    else if(a==='sinc') ajdSincroniza();
    return;
  }
  const pl=t.closest('[data-ajd-p]'); if(pl){ ajdAbreProc(pl.getAttribute('data-ajd-p'),pl.getAttribute('data-ajd-ps')||''); return; }
  const pr=t.closest('[data-ajd-proc]'); if(pr){ ajdAbreProc(pr.getAttribute('data-ajd-proc'),''); return; }
  if(t.closest('[data-ajd-voltar]')){ A.proc=''; A.sec=''; ajdRender(); return; }
  if(t.closest('[data-ajd-copia]')){
    const u=ajdLinkCopia(); if(!u) return;
    try{ navigator.clipboard.writeText(u).then(()=>toast('🔗 Link copiado'),()=>toast('Copie o link: '+u)); }catch(er){ toast('Copie o link: '+u); }
    return;
  }
  const sl=t.closest('[data-ajd-sec]');
  if(sl){ const s=sl.getAttribute('data-ajd-sec'); if(AJD_RE_SLUG.test(s)){ A.sec=s; const d=document.getElementById('ajd-d-'+s); if(d){ d.open=true; A.abertas[A.proc+'|'+s]=true; d.scrollIntoView({ block:'start' }); ajdMmVarre(d); } } return; }
  const rs=t.closest('[data-ajd-res]'); if(rs){ const it=A._res[+rs.getAttribute('data-ajd-res')]; if(it) ajdAbreProc(it.p,it.s); return; }
  const mv=t.closest('[data-ajd-mm-ver]'); if(mv){ const e2=mv.closest('.ajd-mm'); if(e2) ajdMmDesenha(e2); return; }
}
document.addEventListener('click',(e)=>{
  const t=e.target; if(!t||!t.closest) return;
  if(t.closest('#btn-ajuda-topo')){ ajdToggle(); return; }
  if(t.closest('#ajd')) ajdClique(e);
});
// <details> não propaga o toggle: captura no corpo. Guarda: o replaceChildren recria o <details open> e dispara toggle de novo (laço) — só age se mudou.
document.getElementById('ajd-corpo').addEventListener('toggle',(e)=>{
  const d=e.target; if(!d||!d.matches||!d.matches('details[data-ajd-key]')) return;
  const k=d.getAttribute('data-ajd-key'); const atual=!!estado.ajuda.abertas[k]; if(atual===d.open) return;
  if(d.open) estado.ajuda.abertas[k]=true; else delete estado.ajuda.abertas[k];
  if(d.open) ajdMmVarre(d);
},true);
document.getElementById('ajd-corpo').addEventListener('toggle',(e)=>{ const d=e.target; if(d&&d.matches&&d.matches('details.ajd-det')&&d.open) ajdMmVarre(d); },true);
document.getElementById('ajd-rodape').addEventListener('toggle',(e)=>{ const d=e.target; if(d&&d.id==='ajd-diag') estado.ajuda.diagAberto=d.open; },true);   // o Diagnóstico aberto sobrevive ao redesenho do rodapé
document.getElementById('ajd-q').addEventListener('input',(e)=>{
  clearTimeout(_ajdBuscaT); const v=e.target.value;
  _ajdBuscaT=setTimeout(()=>{ estado.ajuda.q=v; ajdRender(); },150);
});
document.getElementById('ajd-q').addEventListener('keydown',(e)=>{
  if(e.key==='Enter'){ e.preventDefault(); clearTimeout(_ajdBuscaT); estado.ajuda.q=e.target.value; ajdRender(); const it=estado.ajuda._res[0]; if(it&&e.target.value.trim().length>=2) ajdAbreProc(it.p,it.s); }
  else if(e.key==='ArrowDown'){ const b=document.querySelector('#ajd-corpo [data-ajd-res]'); if(b){ e.preventDefault(); b.focus(); } }
  else if(e.key==='Escape'&&e.target.value){ e.preventDefault(); e.stopPropagation(); e.target.value=''; estado.ajuda.q=''; ajdRender(); }
});
document.getElementById('ajd-corpo').addEventListener('keydown',(e)=>{
  const r=e.target.closest&&e.target.closest('[data-ajd-res]'); if(!r) return;
  if(e.key==='ArrowDown'){ e.preventDefault(); const n=r.nextElementSibling; if(n) n.focus(); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); const n=r.previousElementSibling; if(n&&n.hasAttribute('data-ajd-res')) n.focus(); else document.getElementById('ajd-q').focus(); }
});
document.querySelector('#ajd .ajd-abas').addEventListener('keydown',(e)=>{
  if(e.key!=='ArrowRight'&&e.key!=='ArrowLeft') return; const abas=[...document.querySelectorAll('#ajd [data-ajd-aba].ajd-aba')]; const i=abas.indexOf(document.activeElement); if(i<0) return;
  e.preventDefault(); const n=abas[(i+(e.key==='ArrowRight'?1:abas.length-1))%abas.length]; n.focus(); n.click(); n.focus();
});
// F1 abre/fecha; Esc fecha só se não há modal, paleta, guia/tour, sobreposição ou menu aberto (o Esc global do 30 cuida desses); Tab preso no celular
document.addEventListener('keydown',(e)=>{
  if(e.key==='F1'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){ e.preventDefault(); ajdToggle(); return; }
  const A=estado.ajuda; if(!A.aberto) return;
  if(e.key==='Escape'){
    if(e.defaultPrevented) return;
    const m=document.getElementById('modal'); if(m&&!m.hidden) return;
    if(document.querySelector('.tour-pop,.tour-hl,.pg-bg')) return;
    if(document.querySelector('.hdrmenu-b[aria-expanded="true"],[data-sr-mais][aria-expanded="true"]')) return;
    ajdFecha(); return;
  }
  if(e.key==='Tab'&&ajdMobile()){
    const aside=document.getElementById('ajd'); if(!aside||!aside.contains(document.activeElement)) return;
    const foc=[...aside.querySelectorAll('button,a[href],input,summary,[tabindex="0"]')].filter(x=>!x.disabled&&x.offsetParent!==null); if(!foc.length) return;
    const p=foc[0], u=foc[foc.length-1];
    if(e.shiftKey&&document.activeElement===p){ e.preventDefault(); u.focus(); } else if(!e.shiftKey&&document.activeElement===u){ e.preventDefault(); p.focus(); }
  }
});
try{ new MutationObserver(()=>{ if(estado.ajuda.aberto) ajdMmRedesenhaTema(); }).observe(document.documentElement,{ attributes:true, attributeFilter:['data-theme'] }); }catch(e){}
