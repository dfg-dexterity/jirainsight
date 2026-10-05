// Jira Insights · 16e · 📥 IMPORTAR APONTAMENTOS DO PARCEIRO (pedido do usuário, 2026-10-05, com a planilha
// "Apontamentos consolidados" exportada do sistema da Cast como exemplo)
// ===========================================================================
// O parceiro aprova as horas no sistema DELE e é isso que ele paga. Esta tela lê a exportação — Excel (.xlsx),
// CSV ou as linhas coladas direto do Excel — e, para UM contrato de parceria:
//   1. agrupa as linhas pelo PROJETO DO PARCEIRO (coluna "Descrição Projeto"/"Projeto", com o código PTC/classe de valor);
//   2. casa cada grupo com um 🗂 projeto do contrato (pelos padrões "reconhecer na planilha" ou pelo código) ou propõe
//      criar um — tipo sugerido (AMS/suporte/sustentação → 🛠️ AMS sob demanda; o resto → ⏱ alocação) e o projeto do
//      Jira (pelo nome do cliente no catálogo);
//   3. soma as horas por PERÍODO DE FATURAMENTO do contrato (fechamento "até o dia N", com os ajustes do 📅) — é a
//      ✔ APURAÇÃO de cada projeto; o período que o arquivo não cobre até o fim entra como PARCIAL (o resto do período
//      continua previsto); período fechado dentro do arquivo sem nenhuma linha do projeto = 0h apuradas;
//   4. sugere a ALOCAÇÃO dos projetos de alocação a partir do histórico (h por dia trabalhado, mês a mês, juntando os
//      meses parecidos num trecho) e projeta o último trecho até uma data (fim do contrato ou 6 meses);
//   5. sugere a ESTIMATIVA mensal dos projetos de AMS (média dos últimos 3 períodos com horas).
// NADA é gravado antes do "Aplicar". Só as linhas APROVADAS entram (quando a planilha tem a coluna de situação), e
// cada Id de apontamento conta uma vez só. O leitor de .xlsx não tem dependência: o arquivo é um zip — o índice
// central é lido à mão e cada parte é inflada com DecompressionStream('deflate-raw'); dentro, é XML (sharedStrings,
// a 1ª planilha e os estilos, que dizem o que é data e o que é duração).
// Helpers dos outros módulos (pcPeriodo, pcYmDaData, pcFrentes, pcLog, salvaCfg, abreModal…) só em tempo de uso.
// ===========================================================================
const pcImpNorm=(s)=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
// ---------------------------------------------------------------- leitura do arquivo
function pcImpCol(letras){ let n=0; for(const ch of String(letras||'').toUpperCase()) n=n*26+(ch.charCodeAt(0)-64); return Math.max(0,n-1); }
function pcImpSerialData(n){ return new Date(Math.round((Number(n)-25569)*86400000)).toISOString().slice(0,10); }
// Formato numérico de um estilo → 'data' · 'hora' (duração/hora do dia) · 'datahora' · '' (número comum).
function pcImpTipoFmt(id, code){
  if([14,15,16,17,27,30,36,50,57].includes(id)) return 'data'; if(id===22) return 'datahora'; if([18,19,20,21,45,46,47].includes(id)) return 'hora';
  const f=String(code||'').replace(/"[^"]*"/g,'').replace(/\[(?![hms]+\])[^\]]*\]/gi,'').toLowerCase();
  if(!f||f==='general') return ''; const temH=/\[h+\]|h+\s*:\s*m|m+\s*:\s*s/.test(f); const temD=/[dy]/.test(f);
  return temH&&temD?'datahora':temH?'hora':temD?'data':''; }
// Índice central do zip → { caminho: {metodo, csize, off} }.
function pcImpZipIndice(buf){ const u8=new Uint8Array(buf), dv=new DataView(buf); let eocd=-1;
  for(let i=u8.length-22;i>=Math.max(0,u8.length-22-65535);i--){ if(dv.getUint32(i,true)===0x06054b50){ eocd=i; break; } }
  if(eocd<0) throw new Error('O arquivo não parece um .xlsx válido — salve de novo no Excel ou use CSV.');
  const n=dv.getUint16(eocd+10,true); let p=dv.getUint32(eocd+16,true); const out={}; const td=new TextDecoder();
  for(let k=0;k<n&&p+46<=u8.length;k++){ if(dv.getUint32(p,true)!==0x02014b50) break;
    const metodo=dv.getUint16(p+10,true), csize=dv.getUint32(p+20,true), nlen=dv.getUint16(p+28,true), xlen=dv.getUint16(p+30,true), clen=dv.getUint16(p+32,true), off=dv.getUint32(p+42,true);
    out[td.decode(u8.subarray(p+46,p+46+nlen))]={ metodo, csize, off }; p+=46+nlen+xlen+clen; }
  return out; }
async function pcImpZipParte(buf, ent){ if(!ent) return ''; const u8=new Uint8Array(buf), dv=new DataView(buf); const o=ent.off;
  if(dv.getUint32(o,true)!==0x04034b50) throw new Error('O .xlsx está corrompido.');
  const ini=o+30+dv.getUint16(o+26,true)+dv.getUint16(o+28,true); const dados=u8.subarray(ini,ini+ent.csize);
  if(ent.metodo===0) return new TextDecoder().decode(dados);
  if(ent.metodo!==8) throw new Error('Compressão do .xlsx não suportada — salve como CSV.');
  if(typeof DecompressionStream==='undefined') throw new Error('Este navegador não abre .xlsx — salve como CSV ou cole as linhas do Excel.');
  return await new Response(new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text(); }
// .xlsx → linhas (array de arrays). Datas viram {data:'AAAA-MM-DD'}; durações/horas viram {horas:n}.
async function pcImpXlsx(buf){
  const ent=pcImpZipIndice(buf); const parte=(n)=>pcImpZipParte(buf,ent[n]); const xml=(t)=>new DOMParser().parseFromString(t||'<x/>','application/xml');
  let caminho='xl/worksheets/sheet1.xml';
  try{ const wb=xml(await parte('xl/workbook.xml')); const s1=wb.getElementsByTagName('sheet')[0];
    const rid=s1&&(s1.getAttribute('r:id')||s1.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));
    const rels=xml(await parte('xl/_rels/workbook.xml.rels')); const r=[...rels.getElementsByTagName('Relationship')].find(x=>x.getAttribute('Id')===rid);
    if(r){ const t=String(r.getAttribute('Target')||'').replace(/^\//,''); const cand=t.startsWith('xl/')?t:'xl/'+t; if(ent[cand]) caminho=cand; } }catch(e){}
  if(!ent[caminho]){ const k=Object.keys(ent).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0]; if(!k) throw new Error('Nenhuma planilha dentro do arquivo.'); caminho=k; }
  const ss=[]; const sst=await parte('xl/sharedStrings.xml'); if(sst) [...xml(sst).getElementsByTagName('si')].forEach(si=>{ ss.push([...si.getElementsByTagName('t')].map(t=>t.textContent).join('')); });
  const tipoEst=[]; const sty=await parte('xl/styles.xml');
  if(sty){ const d=xml(sty); const fmts={}; [...d.getElementsByTagName('numFmt')].forEach(n=>{ fmts[n.getAttribute('numFmtId')]=n.getAttribute('formatCode')||''; });
    const xfs=d.getElementsByTagName('cellXfs')[0]; if(xfs) [...xfs.getElementsByTagName('xf')].forEach((x,i)=>{ const id=+x.getAttribute('numFmtId')||0; tipoEst[i]=pcImpTipoFmt(id,fmts[id]); }); }
  const sh=xml(await parte(caminho)); const rows=[];
  [...sh.getElementsByTagName('row')].forEach(r=>{ const ri=Math.max(0,(+r.getAttribute('r')||rows.length+1)-1); const linha=[];
    [...r.getElementsByTagName('c')].forEach((cel,ci)=>{ const ref=cel.getAttribute('r')||''; const col=ref?pcImpCol(ref.replace(/\d+/g,'')):ci; const t=cel.getAttribute('t')||''; const s=+cel.getAttribute('s')||0;
      const v=cel.getElementsByTagName('v')[0]; let val=v?v.textContent:'';
      if(t==='s') val=ss[+val]||'';
      else if(t==='inlineStr') val=[...cel.getElementsByTagName('t')].map(x=>x.textContent).join('');
      else if(t==='b') val=val==='1';
      else if(t!=='str'&&t!=='e'&&val!==''){ const n=Number(val); const tp=tipoEst[s];
        val=!isFinite(n)?val:tp==='data'||tp==='datahora'?{ data:pcImpSerialData(n) }:tp==='hora'?{ horas:n*24 }:n; }
      linha[col]=val; });
    rows[ri]=linha; });
  const out=[]; for(let i=0;i<rows.length;i++) out.push(rows[i]||[]); return out; }
// CSV/TSV (ou o colado do Excel, que vem com TAB) → linhas. Aspas com quebra de linha dentro são respeitadas.
function pcImpTexto(txt){ const s=String(txt||'').replace(/^﻿/,'').replace(/\r\n?/g,'\n'); if(!s.trim()) return [];
  const amostra=s.split('\n').filter(l=>l.trim()).slice(0,20);   // a linha com mais colunas manda (um título no topo não engana)
  const sep=['\t',';',','].map(x=>[x,Math.max(...amostra.map(l=>l.split(x).length))]).sort((a,b)=>b[1]-a[1])[0][0];
  const rows=[]; let lin=[], cur='', q=false;
  for(let i=0;i<s.length;i++){ const ch=s[i];
    if(q){ if(ch==='"'){ if(s[i+1]==='"'){ cur+='"'; i++; } else q=false; } else cur+=ch; continue; }
    if(ch==='"'&&cur==='') { q=true; continue; }
    if(ch===sep){ lin.push(cur.trim()); cur=''; continue; }
    if(ch==='\n'){ lin.push(cur.trim()); rows.push(lin); lin=[]; cur=''; continue; }
    cur+=ch; }
  if(cur!==''||lin.length){ lin.push(cur.trim()); rows.push(lin); }
  return rows.filter(r=>r.some(x=>String(x).trim()!=='')); }
// ---------------------------------------------------------------- linhas → apontamentos
const PC_IMP_COLS={ data:[/^data$/,/^data (do )?apontamento$/,/^dia$/,/^date$/], horas:[/^horas?$/,/^horas apontadas$/,/^qtd\.? (de )?horas$/,/^hours?$/,/^tempo$/],
  proj:[/^descricao (do )?projeto$/,/^projeto$/,/^projeto\/demanda$/,/^nome do projeto$/], cliente:[/^cliente$/], cv:[/^descricao cv$/,/^classe de valor$/],
  sit:[/^situacao$/,/^status$/], recurso:[/^recurso$/,/^colaborador$/,/^consultor$/,/^profissional$/], id:[/^id apontamento$/,/^id$/] };
function pcImpLeData(v){ if(v&&typeof v==='object'&&v.data) return v.data; if(typeof v==='number'&&v>20000&&v<80000) return pcImpSerialData(v);
  const s=String(v==null?'':v).trim(); let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); if(m){ const y=m[3].length===2?'20'+m[3]:m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; } return ''; }
function pcImpLeHoras(v){ if(v&&typeof v==='object'&&v.horas!=null) return Number(v.horas)||0; if(typeof v==='number') return v;
  const s=String(v==null?'':v).trim(); let m=s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/); if(m) return (+m[1])+(+m[2])/60+(m[3]?(+m[3])/3600:0);
  const dec=/,/.test(s)?s.replace(/\./g,'').replace(',','.'):s;   // "1.234,5" e "8,5" (vírgula decimal) · "8.5" (ponto decimal)
  const n=Number(dec); return isFinite(n)?n:0; }
// "Aprovado" sim; "Não aprovado", "Desaprovado", "Reprovado" não.
function pcImpAprovado(sit){ const n=pcImpNorm(sit); return /aprovad/.test(n)&&!/nao aprov|desaprov|reprov/.test(n); }
// CSV salvo pelo Excel em português vem em windows-1252: UTF-8 estrito primeiro, senão windows-1252.
function pcImpDecodifica(buf){ try{ return new TextDecoder('utf-8',{ fatal:true }).decode(buf); }catch(e){ return new TextDecoder('windows-1252').decode(buf); } }
// Acha o cabeçalho (1ª linha com "data" e "horas") e devolve os apontamentos + o que faltou.
function pcImpRegistros(rows){
  let hi=-1, mapa=null;
  for(let i=0;i<Math.min(rows.length,40)&&hi<0;i++){ const r=rows[i]||[]; const m={};
    r.forEach((cel,j)=>{ const n=pcImpNorm(cel); if(!n) return; Object.keys(PC_IMP_COLS).forEach(k=>{ if(m[k]==null&&PC_IMP_COLS[k].some(re=>re.test(n))) m[k]=j; }); });
    if(m.data!=null&&m.horas!=null){ hi=i; mapa=m; } }
  if(hi<0) return { erro:'Não achei o cabeçalho: a planilha precisa ter as colunas "Data" e "Horas" (e, de preferência, "Descrição Projeto"/"Projeto" e "Situação").', regs:[] };
  const regs=[]; const ids=new Set(); let dup=0, inval=0;
  for(let i=hi+1;i<rows.length;i++){ const r=rows[i]||[]; const g=(k)=>mapa[k]!=null?r[mapa[k]]:'';
    const data=pcImpLeData(g('data')); const h=Math.round(pcImpLeHoras(g('horas'))*100)/100;
    if(!data||!(h>0)){ if(r.some(x=>String(x==null?'':x).trim()!=='')) inval++; continue; }
    const id=String(g('id')==null?'':g('id')).trim(); if(id){ if(ids.has(id)){ dup++; continue; } ids.add(id); }
    const sit=String(g('sit')==null?'':g('sit')).trim();
    const proj=String(g('proj')||g('cv')||g('cliente')||'').trim()||'(sem projeto)';
    regs.push({ data, h, proj, cliente:String(g('cliente')||'').trim(), cv:String(g('cv')||'').trim(), recurso:String(g('recurso')||'').trim(), sit, aprovado:mapa.sit==null?true:pcImpAprovado(sit) }); }
  return { regs, cols:mapa, dup, inval, temSit:mapa.sit!=null, temProj:mapa.proj!=null }; }
// ---------------------------------------------------------------- análise para UM contrato
// Código do projeto no parceiro (PTC-29028) e um nome legível ("Sumitomo — Implementação SAP S/4HANA").
function pcImpRef(g){ const m=String(g.proj+' '+g.cv).match(/\bPTC[-\s]?\d+/i); if(m) return m[0].toUpperCase().replace(/\s/,'-'); const cv=String(g.cv||'').match(/\bCV\d+/i); return cv?cv[0].toUpperCase():''; }
// Título legível ("SUMITOMO" → "Sumitomo", "HI-MIX" → "Hi-Mix"), com as siglas conhecidas em maiúsculas (SAP, AMS, BBM…).
const PC_IMP_SIGLAS=new Set(['SAP','AMS','BBM','SBU','TRM','BPD','ERP','S4HANA','SP','PR','SC','RS','RJ','NE','TI','CV','PTC','MM','FI','SD','CO','PP','QM','PM','HR','RH','BI','CRM','SA','EPM','GRC','IFRS']);
function pcImpTitulo(s){ return String(s||'').split(/(\s+|[-/+()])/).map(w=>{ if(!w||/^(\s+|[-/+()])$/.test(w)) return w;
    const U=w.toUpperCase(); if(PC_IMP_SIGLAS.has(U)||/\d/.test(w)) return U; const l=w.toLowerCase(); return l.charAt(0).toUpperCase()+l.slice(1); }).join(''); }
function pcImpNome(g){ const partes=String(g.proj||'').split(/\s+-\s+/).map(x=>x.trim()).filter(Boolean)
    .filter(x=>!/^\d{2}-\d{5}-\d{5}$/.test(x)&&!/^PTC[-\s]?\d+$/i.test(x));
  const cliente=String(g.cliente||'').replace(/^\d+\s*-\s*/,'').split(/\s+-\s+/)[0].trim();   // "810 - AXIA ENERGIA - 00.001…" → "AXIA ENERGIA"
  if(!partes.length) return pcImpTitulo(cliente||g.proj||'Projeto').slice(0,90);
  const cli=partes[0], resto=partes.slice(1).join(' — ');
  // o cliente do parceiro entra entre parênteses quando o nome do projeto não o cita (ELETROBRAS × "Axia Energia")
  const nc=pcImpNorm(cliente).replace(/[^a-z0-9]/g,''), np=pcImpNorm(cli).replace(/[^a-z0-9]/g,'');
  const extra=(nc&&np&&!nc.includes(np)&&!np.includes(nc))?` (${pcImpTitulo(cliente)})`:'';
  return (pcImpTitulo(cli)+extra+(resto?' — '+(resto===resto.toUpperCase()?pcImpTitulo(resto):resto):'')).slice(0,90); }
const PC_IMP_AMS=/\bams\b|suporte|sustenta|atendimento|chamado|pr[eé]-?\s?venda/i;   // sob demanda (pré-venda incluída)
// O 🗂 projeto do contrato que reconhece este grupo: padrões "reconhecer na planilha" (separados por ;) ou o código.
function pcImpCasaFrente(c, g){ const alvo=pcImpNorm(`${g.proj} ${g.cv} ${g.cliente}`);
  return pcFrentes(c).find(f=>{ const pads=String(f.casar||'').split(/[;|]/).map(pcImpNorm).filter(x=>x.length>=3); if(f.ref) pads.push(pcImpNorm(f.ref));
    return pads.some(p=>alvo.includes(p)); })||null; }
// Projeto do Jira sugerido pelo nome do cliente (catálogo); AMS sem cliente achado → o projeto de AMS de consultorias parceiras.
function pcImpJira(g, tipo){ const cat=(_projetosCache||[]).filter(p=>p&&p.key); if(!cat.length) return '';
  const nomeP=pcImpNorm(String(g.proj).split(/\s+-\s+/).filter(x=>!/^\d{2}-\d{5}-\d{5}$/.test(x))[0]||'');
  const nomeC=pcImpNorm(String(g.cliente||'').replace(/^\d+\s*-\s*/,'').split(/\s+-\s+/)[0]||'');
  const toks=[nomeP,nomeC].map(t=>t.replace(/[^a-z0-9 ]/g,' ').trim()).filter(t=>t.length>=3);
  if(tipo!=='ams') for(const t of toks){ const sem=t.replace(/[\s-]/g,''); const p=cat.find(x=>{ const n=pcImpNorm(x.nome).replace(/[\s-]/g,''); return n.includes(sem); }); if(p) return p.key; }
  if(tipo==='ams'){ const p=cat.find(x=>/ams/i.test(String(x.categoria||''))&&/parceir/i.test(pcImpNorm(x.nome))); if(p) return p.key; }
  return ''; }
// Pessoa do time pelo nome do recurso (1º e último nome iguais bastam: "Diego Fornazier Gozer" = "Diego Gozer").
function pcImpPessoa(nome){ const u=(typeof pessoasUnidas==='function')?pessoasUnidas():{}; const n=pcImpNorm(nome).split(' ').filter(Boolean); if(!n.length) return '';
  const ent=Object.entries(u).find(([a,p])=>{ const m=pcImpNorm(p&&p.nome).split(' ').filter(Boolean); return m.length&&m[0]===n[0]&&m[m.length-1]===n[n.length-1]; }); return ent?ent[0]:''; }
// Alocação sugerida para um recurso a partir do histórico: o RITMO de cada mês é h ÷ dias úteis entre o 1º e o último
// dia com apontamento (ausência no meio conta — não se aplica "h por dia trabalhado" a todo dia útil); meses VIZINHOS
// com ritmo parecido (±12%, mínimo 0,75h) viram um trecho. Cada trecho começa no seu 1º apontamento (um buraco entre trechos fica
// sem alocação) e só o último é projetado até `ateProj` — e só se ele chega ao último mês do arquivo (quem parou antes
// não ganha horas futuras).
function pcImpTrechos(regsRec, ateProj, ymFimArq){
  const porMes={}; regsRec.forEach(r=>{ const m=r.data.slice(0,7); const x=porMes[m]=porMes[m]||{ h:0, de:r.data, ate:r.data }; x.h+=r.h; if(r.data<x.de) x.de=r.data; if(r.data>x.ate) x.ate=r.data; });
  const du=(a,b)=>Math.max(1,pcDiasUteis(a,b));
  const ms=Object.keys(porMes).sort(); const runs=[];
  ms.forEach(m=>{ const x=porMes[m]; const taxa=x.h/du(x.de,x.ate); const R=runs[runs.length-1];
    const contiguo=R&&pcYmSoma(R.ms[R.ms.length-1],1)===m;
    const rR=R?R.h/du(R.de,R.ate):0;
    if(R&&contiguo&&Math.abs(taxa-rR)<=Math.max(0.75,rR*0.12)){ R.ms.push(m); R.h+=x.h; R.ate=x.ate; }   // ±12% (ou 0,75h): duas faltas num mês de 8h/dia não quebram o trecho
    else runs.push({ ms:[m], h:x.h, de:x.de, ate:x.ate }); });
  return runs.map((R,i)=>{ const v=Math.max(0.5,Math.round(R.h/du(R.de,R.ate)*2)/2); const prox=runs[i+1];
    let ate=R.ate;
    if(prox&&pcYmSoma(R.ms[R.ms.length-1],1)===prox.ms[0]) ate=pcMaisDias(prox.de,-1);   // vizinho: emenda até a véspera do próximo
    else if(!prox&&R.ms[R.ms.length-1]===ymFimArq&&pcData(ateProj)&&ateProj>R.ate) ate=ateProj;   // segue até o fim da projeção
    return { de:R.de, ate, modo:'dia', v, h:Math.round(R.h*10)/10 }; }); }
// O que o arquivo cobre de um período: `desde`/`ate` só quando fica DIA ÚTIL de fora (um arquivo que começa no dia 2
// porque o dia 1 é feriado não deixa o período parcial). Recortado pela validade do contrato.
function pcImpCobre(c, ym, dMin, dMax){ const P=pcPeriodo(c,ym); const ini=pcData(c.inicio)&&P.ini<c.inicio?c.inicio:P.ini, fim=pcData(c.fim)&&P.fim>c.fim?c.fim:P.fim;
  const desde=dMin>ini&&pcDiasUteis(ini,pcMaisDias(dMin,-1))>0?dMin:''; const ate=dMax<fim&&pcDiasUteis(proxDia(dMax),fim)>0?dMax:'';
  return { desde, ate, parcial:!!(desde||ate), ini, fim }; }
// A apuração que fica gravada para um projeto num período, juntando com a que já existe:
//   • existente COMPLETA e arquivo parcial → mantém a existente (o arquivo cobre menos que ela);
//   • existente parcial da planilha e arquivo sem sobreposição (o mês seguinte do relatório) → SOMA e une a cobertura;
//   • qualquer outro caso → vale a do arquivo.
function pcImpMescla(c, ym, fid, novo){ const ant=fid?pcApurDe(c,ym,fid):null;
  if(!ant) return { ...novo, acao:'novo' };
  if(!ant.parcial&&novo.parcial) return { ...ant, acao:'mantem' };
  if(ant.parcial&&ant.fonte==='planilha'&&novo.parcial){ const P=pcPeriodo(c,ym);
    const od=ant.desde||P.ini, oa=ant.ate||P.fim, nd=novo.desde||P.ini, na=novo.ate||P.fim;
    if(na<od||nd>oa){ const d=od<nd?od:nd, a=oa>na?oa:na; const cob=pcImpCobre(c,ym,d,a);
      return { h:Math.round(((Number(ant.h)||0)+(Number(novo.h)||0))*100)/100, parcial:cob.parcial, desde:cob.desde, ate:cob.ate, acao:'soma', antes:Number(ant.h)||0 }; } }
  return { ...novo, acao:Math.abs((Number(ant.h)||0)-(Number(novo.h)||0))>0.005||!!ant.parcial!==!!novo.parcial?'troca':'igual', antes:Number(ant.h)||0 }; }
// A análise completa (o que vai acontecer se aplicar), recalculada a cada escolha na tela.
function pcImpAnalisa(c, I){
  const regs=I.regs.filter(r=>I.naoAprovados||r.aprovado!==false);
  const ini=pcData(c.inicio)?c.inicio:'', fim=pcData(c.fim)?c.fim:''; const foraVal=regs.filter(r=>(ini&&r.data<ini)||(fim&&r.data>fim)).length;
  const uso=regs.filter(r=>!((ini&&r.data<ini)||(fim&&r.data>fim)));
  let dMin='', dMax=''; uso.forEach(r=>{ if(!dMin||r.data<dMin) dMin=r.data; if(!dMax||r.data>dMax) dMax=r.data; });
  const grupos={}; uso.forEach(r=>{ const g=grupos[r.proj]=grupos[r.proj]||{ chave:r.proj, proj:r.proj, cliente:r.cliente, cv:r.cv, regs:[], h:0, de:r.data, ate:r.data };
    g.regs.push(r); g.h+=r.h; if(r.data<g.de) g.de=r.data; if(r.data>g.ate) g.ate=r.data; });
  const ymFim=dMax?pcYmDaData(c,dMax):'';
  const lista=Object.values(grupos).sort((a,b)=>b.h-a.h).map(g=>{
    g.h=Math.round(g.h*100)/100; g.ref=pcImpRef(g); g.nome=pcImpNome(g); g.tipoSug=PC_IMP_AMS.test(g.proj+' '+g.cv)?'ams':'aloc';
    const fr=pcImpCasaFrente(c,g); const esc0=I.escolhas[g.chave]||{};
    const acao=esc0.acao||(fr?'fr:'+fr.id:'novo'); const frAlvo=acao.startsWith('fr:')?pcFrente(c,acao.slice(3)):null;
    const tipo=frAlvo?pcFrTipo(frAlvo):(esc0.tipo||g.tipoSug); const jira=esc0.jira!=null?esc0.jira:(frAlvo?(frAlvo.proj||''):pcImpJira(g,tipo));
    // apuração por período: do 1º período do grupo até o último que o arquivo alcança (0h onde não há linha)
    const porYm={}; g.regs.forEach(r=>{ const ym=pcYmDaData(c,r.data); porYm[ym]=(porYm[ym]||0)+r.h; });
    const yms=[]; let ym=pcYmDaData(c,g.de), guard=0; while(ym&&ym<=ymFim&&guard++<72){ yms.push(ym); ym=pcYmSoma(ym,1); }
    const fidAlvo=frAlvo?frAlvo.id:'';
    const apur=yms.map(y=>{ const cob=pcImpCobre(c,y,dMin,dMax); const novo={ ym:y, h:Math.round((porYm[y]||0)*100)/100, parcial:cob.parcial, desde:cob.desde, ate:cob.ate };
      return { ...novo, fica:pcImpMescla(c,y,fidAlvo,novo) }; });
    // alocação sugerida por recurso (só alocação)
    const porRec={}; g.regs.forEach(r=>{ const k=r.recurso||'(sem nome)'; (porRec[k]=porRec[k]||[]).push(r); });
    const ateProj=pcData(I.ate)?I.ate:(fim||pcUltimoDia(pcYmSoma(hojeSP().slice(0,7),6)));
    const ymFimArq=dMax.slice(0,7);
    const recursos=Object.keys(porRec).map(nome=>{ const a=pcImpPessoa(nome); const trechos=pcImpTrechos(porRec[nome],ateProj,ymFimArq);
      // trechos SEM projeto desta pessoa que cruzam o intervalo derivado seriam contados de novo ("Sem projeto") — são recortados
      const D=trechos.length?trechos[0].de:'', Z=trechos.length?trechos[trechos.length-1].ate:''; const rec=(a&&pcEquipe(c).find(p=>p.a===a))||pcEquipe(c).find(p=>!p.a&&pcImpNorm(p.nome)===pcImpNorm(nome));
      const recortar=rec&&D?pcRegras(rec).filter(r=>pcRegraFr(c,r)===PC_SEM_FR&&pcData(r.de)&&pcData(r.ate)&&r.ate>=D&&r.de<=Z).length:0;
      return { nome, a, trechos, recortar }; });
    // estimativa: média dos últimos 3 períodos fechados com hora
    const cheios=apur.filter(x=>!x.parcial&&x.h>0).slice(-3); const est=cheios.length?Math.round(cheios.reduce((s,x)=>s+x.h,0)/cheios.length*2)/2:0;
    return { ...g, fr:frAlvo, acao, tipo, jira, apur, recursos, est, aloc:esc0.aloc!=null?!!esc0.aloc:(tipo==='aloc'&&!(frAlvo&&pcEquipe(c).some(p=>pcRegras(p).some(r=>r.fr===frAlvo.id)))), regs:undefined };
  });
  // projetos do contrato que a planilha não traz: zerar (AMS) nos períodos fechados que o arquivo cobre?
  const casados=new Set(lista.filter(g=>g.acao.startsWith('fr:')).map(g=>g.acao.slice(3)));
  // períodos INTEIROS dentro do arquivo (nenhum dia útil de fora): só neles "não aparece na planilha" quer dizer 0h
  const cobertos=[]; if(dMin&&dMax){ let y=pcYmDaData(c,dMin), gd=0; while(y<=ymFim&&gd++<72){ if(!pcImpCobre(c,y,dMin,dMax).parcial) cobertos.push(y); y=pcYmSoma(y,1); } }
  // zerar vem marcado só para AMS SEM horas já apuradas nesses períodos (uma planilha filtrada não apaga o que outra trouxe)
  const ausentes=pcFrentes(c).filter(f=>!casados.has(f.id)).map(f=>{ const tem=cobertos.reduce((s,ym)=>{ const a=pcApurDe(c,ym,f.id); return s+(a?Number(a.h)||0:0); },0);
    return { f, tem:Math.round(tem*100)/100, zerar:I.zerar[f.id]!=null?!!I.zerar[f.id]:(pcFrTipo(f)==='ams'&&!(tem>0)) }; });
  return { grupos:lista, dMin, dMax, foraVal, nUso:uso.length, nNaoAprov:I.regs.filter(r=>r.aprovado===false).length, cobertos, ausentes }; }
// ---------------------------------------------------------------- a tela (modal)
// O modal do importador ainda está aberto? (× e Esc fecham pelo fechaModal global, sem passar por aqui — uma leitura que
// termina depois NÃO pode reabri-lo por cima de outra coisa)
function pcImpModalAberto(){ const m=document.getElementById('modal'); return !!(m&&!m.hidden&&document.querySelector('#modal-body .pc-imp-root')); }
function pcImpAbre(c){ const st=estado.parcerias=estado.parcerias||{}; st.imp={ cid:c.id, arq:'', regs:null, info:null, escolhas:{}, zerar:{}, naoAprovados:false, ate:'', erro:'', lendo:false }; pcImpPinta();
  if(typeof garanteProjetos==='function') garanteProjetos().then(()=>{ if(st.imp&&st.imp.regs&&pcImpModalAberto()) pcImpPinta(); }).catch(()=>{}); }
function pcImpPinta(){ const st=estado.parcerias||{}; const I=st.imp; if(!I) return; const c=pcDe(I.cid); if(!c){ st.imp=null; fechaModal(); return; }
  const topo=`<div class="pc-imp-root" hidden></div><h3>📥 Importar apontamentos — ${esc(c.consultoria||'')} <span class="muted small">${esc(pcCod(c))} · fecha dia ${c.fatFecha||31}</span></h3>`;
  if(!I.regs){ abreModal(`${topo}
    <div class="muted small">Use a planilha de <b>apontamentos aprovados</b> exportada do sistema do parceiro (ex.: "Apontamentos consolidados" da Cast). Ela precisa ter as colunas <b>Data</b> e <b>Horas</b> e, de preferência, <b>Descrição Projeto</b>, <b>Cliente</b>, <b>Recurso</b> e <b>Situação</b>. Nada é gravado antes de você conferir e clicar em <b>Aplicar</b>.</div>
    <div class="pc-imp-arq"><label class="btn primario" for="pc-imp-file">📂 Escolher arquivo (.xlsx ou .csv)</label><input type="file" id="pc-imp-file" accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" hidden>
      <span class="muted small">${I.lendo?'⏳ lendo…':''}</span></div>
    <div class="campo" style="margin-top:10px"><label>…ou cole aqui as linhas copiadas do Excel (com o cabeçalho)</label><textarea id="pc-imp-cola" rows="5" placeholder="Data	Horas	Descrição Projeto	Situação …" style="width:100%">${esc(I.cola||'')}</textarea>
      <div style="margin-top:6px"><button class="btn" data-pc-imp-cola="1">Ler o texto colado</button></div></div>
    ${I.erro?`<div class="aviso err">⚠ ${esc(I.erro)}</div>`:''}
    <div style="display:flex;gap:10px;margin-top:12px"><button class="btn" data-pc-imp-fechar="1">Cancelar</button></div>`); return; }
  const A=pcImpAnalisa(c,I); I.ultima=A; const frs=pcFrentes(c);
  const linhas=A.grupos.map(g=>{ const k=escA(g.chave); const novo=g.acao==='novo'; const ign=g.acao==='ignorar';
    const opts=`<option value="novo" ${novo?'selected':''}>＋ criar projeto novo</option>${frs.map(f=>`<option value="fr:${escA(f.id)}" ${g.acao==='fr:'+f.id?'selected':''}>→ ${PC_FR_TIPOS[pcFrTipo(f)][0]} ${esc(pcFrNome(f))}</option>`).join('')}<option value="ignorar" ${ign?'selected':''}>✕ ignorar estas linhas</option>`;
    const trechos=g.tipo==='aloc'?g.recursos.map(R=>`<div class="small"><b>${esc(R.nome)}</b>${R.a?' <span class="badge" data-tip="pessoa do time">👤</span>':' <span class="muted small">(nome livre)</span>'}: ${R.trechos.map(t=>`${String(t.v).replace('.',',')}h/dia ${dataBR(t.de)} → ${dataBR(t.ate)}`).join(' · ')}${R.recortar?` <span class="muted small">· ${R.recortar} trecho(s) sem projeto dessa pessoa nesse intervalo serão recortados (senão as horas contariam duas vezes)</span>`:''}</div>`).join(''):'';
    return `<tr class="${ign?'pc-imp-ign':''}"><td><b>${esc(g.nome)}</b>${g.ref?` <span class="badge">${esc(g.ref)}</span>`:''}<div class="muted small" title="${escA(g.proj)}">${esc(String(g.proj).slice(0,80))}</div></td>
      <td class="num"><b>${fmtHd(g.h)}</b><div class="muted small">${dataBR(g.de)} → ${dataBR(g.ate)}</div></td>
      <td><select data-pc-imp-acao="${k}" aria-label="O que fazer">${opts}</select>
        ${novo?`<div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap"><select data-pc-imp-tipo="${k}" aria-label="Tipo">${Object.entries(PC_FR_TIPOS).map(([t,T])=>`<option value="${t}" ${g.tipo===t?'selected':''}>${T[0]} ${T[1]}</option>`).join('')}</select>
          <input type="text" data-pc-imp-jira="${k}" list="pc-imp-projs" value="${escA(g.jira||'')}" placeholder="projeto no Jira" style="width:110px" aria-label="Projeto no Jira"></div>`:''}</td>
      <td>${ign?'—':g.tipo==='aloc'?`<label class="small"><input type="checkbox" data-pc-imp-aloc="${k}" ${g.aloc?'checked':''}> ${g.fr&&pcEquipe(c).some(p=>pcRegras(p).some(r=>r.fr===g.fr.id))?'substituir a alocação pelo histórico':'criar a alocação pelo histórico'}</label>${g.aloc?trechos:''}`
        :`<span class="small">estimativa sugerida: <b>${fmtHd(g.est)}/mês</b>${g.fr&&Number(g.fr.estMes)>0?` <span class="muted">(hoje ${fmtHd(g.fr.estMes)})</span>`:''}</span>`}</td></tr>`; }).join('');
  // grade de apuração: período × grupo
  const yms=[...new Set(A.grupos.filter(g=>g.acao!=='ignorar').flatMap(g=>g.apur.map(x=>x.ym)))].sort();
  const gr=A.grupos.filter(g=>g.acao!=='ignorar');
  const grade=yms.length?`<div class="scroll-x"><table class="mp-tab-mini pc-imp-grade"><thead><tr><th>Período</th>${gr.map(g=>`<th class="num" data-tip="${escA(g.nome)}">${esc(g.nome.split(' — ')[0].slice(0,16))}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${yms.map(ym=>{ const P=pcPeriodo(c,ym); let tot=0;
      const cels=gr.map(g=>{ const x=g.apur.find(a=>a.ym===ym); if(!x) return '<td class="num muted">—</td>'; const F=x.fica||{ ...x, acao:'novo' }; tot+=Number(F.h)||0;
        const cob=F.parcial?`parcial${F.desde?' desde '+dataBR(F.desde):''}${F.ate?' até '+dataBR(F.ate):''} (o resto do período continua previsto)`:'período inteiro';
        const nota=F.acao==='soma'?` <span class="muted small">soma ${fmtHd(F.antes)} já importadas</span>`:F.acao==='mantem'?' <span class="muted small">mantém a apuração completa</span>':F.acao==='troca'?` <span class="muted small">era ${fmtHd(F.antes)}</span>`:'';
        return `<td class="num${F.acao==='troca'||F.acao==='soma'?' pc-imp-muda':''}" data-tip="${escA(`arquivo: ${fmtHd(x.h)} · ${cob}`)}">${F.parcial?'◐ ':''}${fmtHd(F.h)}${nota}</td>`; }).join('');
      return `<tr><td><b>${esc(labelMesAbbr(ym))}</b> <span class="muted small">${dataBR(P.ini)} → ${dataBR(P.fim)}</span></td>${cels}<td class="num"><b>${fmtHd(tot)}</b></td></tr>`; }).join('')}</tbody></table></div>`:'<div class="estado">Nada a apurar com as escolhas atuais.</div>';
  const aus=A.ausentes.length?`<div class="muted small" style="margin-top:8px">Projetos do contrato que <b>não aparecem</b> na planilha: ${A.ausentes.map(x=>`<label class="pc-imp-aus"><input type="checkbox" data-pc-imp-zerar="${escA(x.f.id)}" ${x.zerar?'checked':''}> ${esc(pcFrNome(x.f))}${x.tem>0?` <span class="muted">(já tem ${fmtHd(x.tem)} apuradas nesses períodos)</span>`:''}</label>`).join(' ')} — marcados = <b>0h apuradas</b> nos períodos fechados que o arquivo cobre (${A.cobertos.length?A.cobertos.map(labelMesAbbr).join(', '):'nenhum'}).</div>`:'';
  const ateDef=pcData(I.ate)?I.ate:(pcData(c.fim)?c.fim:pcUltimoDia(pcYmSoma(hojeSP().slice(0,7),6)));
  abreModal(`${topo}
    <div class="aviso ok">📄 <b>${esc(I.arq||'texto colado')}</b> · ${A.nUso} apontamento(s) de ${dataBR(A.dMin)} a ${dataBR(A.dMax)} · ${A.grupos.length} projeto(s) do parceiro${I.info.dup?` · ${I.info.dup} repetido(s) ignorado(s)`:''}${A.foraVal?` · <span class="rp-neg">${A.foraVal} fora da validade do contrato (ignorados)</span>`:''}${I.info.temSit?(A.nNaoAprov?` · <label><input type="checkbox" data-pc-imp-naoaprov="1" ${I.naoAprovados?'checked':''}> incluir ${A.nNaoAprov} não aprovado(s)</label>`:' · todos aprovados'):' · <span class="muted">sem coluna de situação — tudo entra</span>'}</div>
    <div class="scroll-x"><table class="mp-tab-mini pc-imp-tab"><thead><tr><th>Projeto no parceiro</th><th class="num">Horas</th><th>No contrato</th><th>Alocação / estimativa</th></tr></thead><tbody>${linhas}</tbody></table></div>
    <datalist id="pc-imp-projs">${(_projetosCache||[]).filter(p=>p&&p.key).map(p=>`<option value="${escA(p.key)}">${esc(p.nome||'')}</option>`).join('')}</datalist>
    <div class="campo" style="margin-top:8px"><label>Projetar a alocação até</label><input type="date" data-pc-imp-ate="1" value="${escA(ateDef)}"> <span class="muted small">o último ritmo de cada projeto de alocação continua até esta data (a previsão do caixa).</span></div>
    <div class="mp-h3" style="margin-top:12px">✔ Apuração que será gravada <span class="mp-dim">horas aprovadas por período de faturamento do contrato · ◐ parcial = o arquivo não cobre o período inteiro (o resto continua previsto) · importações seguidas do mesmo período se somam</span></div>${grade}${aus}
    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap"><button class="btn primario" data-pc-imp-aplicar="1" ${gr.length?'':'disabled'}>✅ Aplicar no contrato</button><button class="btn" data-pc-imp-outro="1">Outro arquivo</button><button class="btn" data-pc-imp-fechar="1">Cancelar</button></div>`);
}
async function pcImpCarrega(fonte, nome){ const st=estado.parcerias||{}; const I=st.imp; if(!I) return;
  if(!pcImpModalAberto()){ st.imp=null; return; }   // o modal já foi fechado: não reabre
  I.erro=''; I.lendo=true; pcImpPinta();
  try{ const rows=(typeof fonte==='string')?pcImpTexto(fonte):(/\.(csv|tsv|txt)$/i.test(nome||'')?pcImpTexto(pcImpDecodifica(fonte)):await pcImpXlsx(fonte));
    const R=pcImpRegistros(rows); I.lendo=false; if(!pcImpModalAberto()){ if(st.imp===I) st.imp=null; return; }   // fecharam o modal enquanto lia
    if(R.erro){ I.erro=R.erro; pcImpPinta(); return; }
    if(!R.regs.length){ I.erro='Nenhum apontamento com data e horas foi encontrado.'; pcImpPinta(); return; }
    I.regs=R.regs; I.info=R; I.arq=String(nome||'').slice(0,80); pcImpPinta();
  }catch(e){ I.lendo=false; I.erro=(e&&e.message)||String(e); if(pcImpModalAberto()) pcImpPinta(); else if(st.imp===I) st.imp=null; } }
// Aplica: cria/atualiza os projetos, grava a apuração (fonte planilha), a alocação e a estimativa. Uma gravação só.
function pcImpAplica(){ const st=estado.parcerias||{}; const I=st.imp; if(!I||!I.ultima) return; const c=pcDe(I.cid); if(!c||!pcPodeEditar()) return;
  const A=pcImpAnalisa(c,I); const quem=pcQuem().nome; const em=hojeSP(); const res={ novos:0, apur:0, trechos:0, est:0, zerados:0, recortados:0, somados:0, mantidos:0 };
  const acum={};   // fid → ym → {h, parcial, ate}
  A.grupos.forEach(g=>{ if(g.acao==='ignorar') return; let f=g.acao.startsWith('fr:')?pcFrente(c,g.acao.slice(3)):null;
    if(!f){ f=pcNovaFrente(g.nome,g.tipo); f.proj=String(g.jira||'').toUpperCase().replace(/[^A-Z0-9_]/g,'').slice(0,20); f.ref=g.ref; f.casar=g.ref||g.proj.slice(0,120); pcFrentesW(c).push(f); res.novos++; }
    else { if(!f.ref&&g.ref) f.ref=g.ref; if(!f.casar) f.casar=g.ref||g.proj.slice(0,120); }
    g.apur.forEach(x=>{ const m=acum[f.id]=acum[f.id]||{}; const y=m[x.ym]=m[x.ym]||{ h:0, parcial:x.parcial, desde:x.desde, ate:x.ate }; y.h+=x.h; });
    if(pcFrTipo(f)==='aloc'&&g.aloc){ g.recursos.forEach(R=>{ const eq=pcEquipe(c);
        let rec=(R.a&&eq.find(p=>p.a===R.a))||eq.find(p=>!p.a&&pcImpNorm(p.nome)===pcImpNorm(R.nome));
        if(!rec){ rec=pcNovoRec(R.a?((pessoasUnidas()[R.a]||{}).nome||R.nome):R.nome, R.a); eq.push(rec); }
        rec.regras=pcRegras(rec).filter(r=>r.fr!==f.id);
        if(R.trechos.length){ const D=R.trechos[0].de, Z=R.trechos[R.trechos.length-1].ate; const novas=[];   // recorta os trechos SEM projeto no intervalo derivado
          pcRegras(rec).forEach(r=>{ if(pcRegraFr(c,r)!==PC_SEM_FR||!pcData(r.de)||!pcData(r.ate)||r.ate<D||r.de>Z){ novas.push(r); return; }
            if(r.de<D) novas.push({ ...r, ate:pcMaisDias(D,-1) }); if(r.ate>Z) novas.push({ ...r, id:pcId('rg'), de:proxDia(Z) }); res.recortados++; });
          rec.regras=novas; }
        R.trechos.forEach(t=>{ rec.regras.push({ id:pcId('rg'), de:t.de, ate:t.ate, modo:'dia', v:t.v, fr:f.id }); res.trechos++; }); }); }
    if(pcFrTipo(f)==='ams'){ if(g.est>0&&!(Number(f.estMes)>0)){ f.estMes=g.est; res.est++; }
      const prim=(g.apur.find(x=>x.h>0)||g.apur[0]); if(prim&&!pcData(f.de)) f.de=pcPeriodo(c,prim.ym).ini; } });   // a janela da estimativa começa no 1º período do arquivo
  Object.keys(acum).forEach(fid=>Object.keys(acum[fid]).forEach(ym=>{ const y=acum[fid][ym];
    const F=pcImpMescla(c,ym,fid,{ h:Math.round(y.h*100)/100, parcial:y.parcial, desde:y.desde, ate:y.ate });
    if(F.acao==='mantem'){ res.mantidos++; return; } if(F.acao==='soma') res.somados++;
    pcApurSet(c,ym,fid,{ h:Math.round((Number(F.h)||0)*100)/100, fonte:'planilha', arq:I.arq||'texto colado', em, por:quem, ...(F.parcial?{ parcial:true, ...(F.desde?{ desde:F.desde }:{}), ...(F.ate?{ ate:F.ate }:{}) }:{}) }); res.apur++; }));
  A.ausentes.forEach(x=>{ if(!x.zerar) return; A.cobertos.forEach(ym=>{ const ant=pcApurDe(c,ym,x.f.id); if(ant&&ant.fonte==='manual') return;
    pcApurSet(c,ym,x.f.id,{ h:0, fonte:'planilha', arq:I.arq||'texto colado', em, por:quem }); res.zerados++; }); });
  pcLog(c,'importação',`📥 ${I.arq||'texto colado'}: ${A.nUso} apontamento(s) ${dataBR(A.dMin)}–${dataBR(A.dMax)} · ${res.apur} apuração(ões)${res.novos?` · ${res.novos} projeto(s) novo(s)`:''}${res.trechos?` · ${res.trechos} trecho(s) de alocação`:''}${res.est?` · ${res.est} estimativa(s) AMS`:''}${res.zerados?` · ${res.zerados} período(s) zerado(s)`:''}${res.somados?` · ${res.somados} somada(s) à importação anterior`:''}${res.mantidos?` · ${res.mantidos} apuração(ões) completa(s) mantida(s)`:''}${res.recortados?` · ${res.recortados} trecho(s) sem projeto recortado(s)`:''}`);
  salvaCfg(); st.imp=null; fechaModal(); st.aba={ id:c.id, qual:'proj' }; st.destaque=c.id;
  toast(`Importado: ${res.apur} apuração(ões)${res.novos?`, ${res.novos} projeto(s) novo(s)`:''}${res.trechos?`, ${res.trechos} trecho(s) de alocação`:''}. Confira em 🗂 Projetos.`,'ok'); renderParcerias(); }
// ---------------------------------------------------------------- listeners do modal
document.getElementById('modal-body').addEventListener('click',(e)=>{
  if(estado.vista!=='parcerias') return; const st=estado.parcerias||{}; const I=st.imp; if(!I) return; const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-pc-imp-fechar')){ st.imp=null; fechaModal(); return; }
  if(t.hasAttribute('data-pc-imp-outro')){ I.regs=null; I.info=null; I.arq=''; I.escolhas={}; I.zerar={}; I.erro=''; pcImpPinta(); return; }
  if(t.hasAttribute('data-pc-imp-cola')){ const ta=document.getElementById('pc-imp-cola'); const v=ta?ta.value:''; if(!v.trim()){ toast('Cole as linhas do Excel (com o cabeçalho) no campo.','warn'); return; } I.cola=v.slice(0,2000000); pcImpCarrega(v,'texto colado'); return; }
  if(t.hasAttribute('data-pc-imp-aplicar')){ pcImpAplica(); return; }
});
document.getElementById('modal-body').addEventListener('change',(e)=>{
  if(estado.vista!=='parcerias') return; const st=estado.parcerias||{}; const I=st.imp; if(!I) return; const t=e.target; if(!t||!t.getAttribute) return;
  if(t.id==='pc-imp-file'){ const f=t.files&&t.files[0]; if(!f) return; if(f.size>15*1024*1024){ I.erro='Arquivo grande demais (máx. 15 MB).'; pcImpPinta(); return; }
    f.arrayBuffer().then(buf=>pcImpCarrega(buf,f.name)).catch(err=>{ I.erro=(err&&err.message)||'Não consegui ler o arquivo.'; pcImpPinta(); }); return; }
  const k=(a)=>t.getAttribute(a); const E=(ch)=>I.escolhas[ch]=I.escolhas[ch]||{};
  if(t.hasAttribute('data-pc-imp-acao')){ const ch=k('data-pc-imp-acao'); const x=E(ch); x.acao=t.value; delete x.jira; delete x.aloc; pcImpPinta(); return; }
  if(t.hasAttribute('data-pc-imp-tipo')){ const ch=k('data-pc-imp-tipo'); const x=E(ch); x.tipo=t.value==='ams'?'ams':'aloc'; delete x.jira; delete x.aloc; pcImpPinta(); return; }
  if(t.hasAttribute('data-pc-imp-jira')){ E(k('data-pc-imp-jira')).jira=String(t.value||'').trim().toUpperCase(); return; }
  if(t.hasAttribute('data-pc-imp-aloc')){ E(k('data-pc-imp-aloc')).aloc=!!t.checked; pcImpPinta(); return; }
  if(t.hasAttribute('data-pc-imp-zerar')){ I.zerar[k('data-pc-imp-zerar')]=!!t.checked; return; }
  if(t.hasAttribute('data-pc-imp-naoaprov')){ I.naoAprovados=!!t.checked; pcImpPinta(); return; }
  if(t.hasAttribute('data-pc-imp-ate')){ I.ate=pcData(t.value)?t.value:''; pcImpPinta(); return; }
});
