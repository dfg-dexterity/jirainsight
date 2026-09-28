// Jira Insights · 16d · 🌐 PORTAL DO CLIENTE — o módulo interno da visão externa do projeto (pedido do usuário,
// 2026-09-28): aqui o gestor PUBLICA o projeto para o cliente, CURA o que ele vê (canal do Teams, pasta do
// SharePoint, calendário do projeto, links, time, épicos ocultos, blocos, pendências, riscos, FAQ, reuniões
// e as decisões visíveis), CONVIDA as pessoas do cliente e PRÉ-VISUALIZA a página como o cliente a verá.
// ===========================================================================
// O que este arquivo NÃO faz: montar dado para o cliente. Tudo o que o cliente recebe sai de UM lugar
// (portalProjetoPayload em api/_lib/portal.js, por allowlist); o módulo só manda a curadoria para as
// rotas ?pcli=admin-* do api/config.js e mostra o que elas devolvem. Nada disso mora na config
// compartilhada (cfg): riscos, FAQ, pendências, equipe e links ficam em tabelas próprias no Supabase,
// porque a cfg desce inteira para o navegador de todo o time e tem teto de 256 KB.
// ACESSO = CONTRATO: o projeto é publicado PARA o contrato de 📑 Contratos › 🏢 Clientes que o lista, e as
// contas do cliente (👤 Acessos, reaproveitadas de 16-contratos-ams-receita.js) são desse contrato — é ele
// que define o escopo no servidor; a tela nunca escolhe de quem são os dados.
// QUEM EDITA: gestores (souAprovador). É lente, não permissão: o servidor exige gestor nas rotas admin e
// responde 403 a quem não é — a tela só evita oferecer o que vai ser recusado.
// UMA vista, 5 seções (estado.portal.sec; link ?v=portal&pproj=KEY&psec=…): 🌐 Projetos · ⚙️ Configurar ·
// 📋 Conteúdo · 👤 Acessos · 👁 Pré-visualizar. O formulário de ⚙️ Configurar nasce de um RASCUNHO
// (st.rasc, mesmo desenho do 16b) que acompanha cada tecla — um redesenho vindo de fora (a lista que chega,
// o catálogo de projetos) não apaga o que está sendo digitado. A tabela de 📋 Conteúdo salva a cada
// mudança e só se redesenha quando o foco sai dela (ptAdiaRender, o padrão do 16c).
// Helpers de outros módulos (pcliApi, pcliBlocoHTML, pcUrl, souAprovador, crFicha, logAcao…) só em
// tempo de render/clique.
// ===========================================================================
const PT_SECS=['projetos','config','conteudo','acessos','preview'];
const PT_SEC_ROT={ projetos:['🌐 Projetos','contrato × projeto: o que está publicado e o que o cliente já abriu'],
  config:['⚙️ Configurar','publicar, apresentação, Teams, pasta, calendário, links, time, épicos e blocos'],
  conteudo:['📋 Conteúdo','pendências, riscos, FAQ, reuniões manuais e as decisões visíveis'],
  acessos:['👤 Acessos','as contas do cliente: convidar por link, revogar, reativar'],
  preview:['👁 Pré-visualizar','a página exatamente como o cliente vê'] };
const PT_TIPO_IDS=['pendencia','risco','faq','reuniao'];
const PT_TIPOS={ pendencia:['⚠','Pendência','Pendências — o que a Dexterity precisa do cliente (ou o cliente da Dexterity)'],
  risco:['🛡','Risco','Riscos — probabilidade, impacto e o que está sendo feito'],
  faq:['❓','Pergunta do FAQ','FAQ — perguntas e respostas'],
  reuniao:['📅','Reunião','Reuniões manuais — as que não estão no calendário do projeto'] };
const PT_STATUS={ pendencia:['aberto','feito'], risco:['aberto','mitigado','encerrado'], faq:['aberto'], reuniao:['aberto','encerrado'] };
const PT_NIVEIS=[['','—'],['alto','alto'],['medio','médio'],['baixo','baixo']];
const PT_BLOCOS=[['progresso','📈 Progresso'],['cronograma','📅 Cronograma'],['pendencias','⚠ O que precisamos de você'],['decisoes','🎯 Decisões a tomar'],
  ['riscos','🛡 Riscos'],['equipe','👥 Time do projeto'],['reunioes','📆 Próximas reuniões'],['faq','❓ FAQ'],['links','🔗 Links úteis']];
const PT_RE_PROJ=/^[A-Z][A-Z0-9_]*$/;
const PT_RE_EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PT_RE_GUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Erros do teste do calendário (api/_lib/portal.js → calendarioDoProjeto) em português para o gestor.
const PT_CAL_ERROS={ permissao:'O aplicativo não tem permissão para ler este calendário: um grupo do Teams exige Group.Read.All no registro do aplicativo, e uma caixa compartilhada precisa existir no tenant.',
  'nao-configurado':'As credenciais do Microsoft 365 (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET) não estão configuradas na Vercel.',
  invalido:'Informe o e-mail da caixa compartilhada ou o GUID do grupo do Teams.', falha:'Não consegui falar com o Microsoft Graph agora — tente de novo em instantes.',
  'sem-calendario':'Nenhum calendário salvo para este projeto.' };
const ptSt=()=>estado.portal;
function ptGestor(){ return souAprovador(); }
function ptContratos(){ return (cfg.contratos||[]).filter(c=>c&&Array.isArray(c.projetos)&&c.projetos.length); }   // leitor: não cria nada em cfg
function ptKeysDe(c){ return (c&&Array.isArray(c.projetos)?c.projetos:[]).map(k=>String(k||'').trim().toUpperCase()).filter(k=>PT_RE_PROJ.test(k)); }
// O contrato "dono" do projeto: o que já está em foco, se lista a chave; senão o primeiro que a lista.
function ptContratoDe(key){ const K=String(key||'').toUpperCase(); const st=ptSt(); const cs=ptContratos();
  return (st.ct?cs.find(c=>c.id===st.ct&&ptKeysDe(c).includes(K)):null)||cs.find(c=>ptKeysDe(c).includes(K))||null; }
function ptLista(ct){ const l=ptSt().lista[ct]; return Array.isArray(l)?l:null; }
// A linha do projeto como o servidor a vê (publicado, config, contadores) — null enquanto a lista não chegou.
function ptInfo(key){ const K=String(key||'').toUpperCase(); const c=ptContratoDe(K); if(!c) return null; const l=ptLista(c.id); return l?(l.find(p=>p.projeto===K)||null):null; }
function ptNomeProj(K){ const i=ptInfo(K); return (i&&i.nome&&i.nome!==K)?i.nome:((typeof projNome==='function')?projNome(K):K); }
function ptReRender(){ if(estado.vista==='portal') renderPortal(); }
function ptConfigPadrao(){ return { teamsUrl:'', pasta:'', calendario:'', links:[], equipe:[], epicosOcultos:[], mostrarAta:false, blocos:Object.fromEntries(PT_BLOCOS.map(b=>[b[0],true])), apresentacao:'' }; }
// ---- datas: o servidor guarda instantes; a tela edita no fuso de São Paulo (datetime-local) ----
function ptLocalSP(v){ const t=Date.parse(String(v||'')); if(!isFinite(t)) return '';
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; }
function ptIsoSP(local){ const s=String(local||'').trim(); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)?s.slice(0,16)+':00-03:00':''; }
function ptQuandoBR(v){ const l=ptLocalSP(v); return l?`${dataBR(l.slice(0,10))} ${l.slice(11,16)}`:'—'; }
function ptQuandoCurto(v){ const l=ptLocalSP(v); return l?`${l.slice(8,10)}/${l.slice(5,7)} ${l.slice(11,16)}`:'—'; }

// ---- leituras (uma por contrato/projeto, guardadas em estado.portal; `forca` relê) ----
function ptCarregaLista(ct, forca){ const st=ptSt(); if(!ct||(!forca&&st.lista[ct]!==undefined)) return; st.lista[ct]='carregando';
  pcliApi('admin-projetos',{ qs:'&ct='+encodeURIComponent(ct) }).then(j=>{ st.lista[ct]=(j&&j.ok)?(j.projetos||[]):{ erro:(j&&j.erro)||'Não consegui ler os projetos do portal.' }; ptReRender(); }); }
function ptCarregaItens(K, forca){ const st=ptSt(); if(!K||(!forca&&st.itens[K]!==undefined)) return; st.itens[K]='carregando';
  pcliApi('admin-itens',{ qs:'&p='+encodeURIComponent(K) }).then(j=>{ st.itens[K]=(j&&j.ok)?(j.itens||[]):{ erro:(j&&j.erro)||'Não consegui ler o conteúdo.' }; ptReRenderSuave(); }); }
// Decisões do projeto (🎯 Prioridades): a mesma rota ?dec=1 — o portal só liga/desliga a visibilidade.
function ptCarregaDecs(K, forca){ const st=ptSt(); if(!K||(!forca&&st.decs[K]!==undefined)) return; st.decs[K]='carregando';
  fetch('/api/config?dec=1',{ method:'POST', headers:mpHeaders(), body:JSON.stringify({ acao:'listar', projeto:K }) }).then(r=>r.json())
    .then(j=>{ st.decs[K]=(j&&j.ok)?(j.decisoes||[]):{ erro:(j&&j.erro)||'Não consegui ler as decisões.' }; ptReRenderSuave(); })
    .catch(e=>{ st.decs[K]={ erro:humanizaErro(e) }; ptReRenderSuave(); }); }
// Sugestões (equipe do Jira, reuniões com label agenda-outlook, teste do calendário) — só para o gestor montar.
const _ptSugP={};   // a leitura em voo, por projeto: um segundo clique espera a mesma resposta em vez de disparar outra
function ptCarregaSug(K, forca){ const st=ptSt(); if(!K) return Promise.resolve(null);
  if(!forca&&st.sug[K]!==undefined) return st.sug[K]==='carregando'&&_ptSugP[K]?_ptSugP[K]:Promise.resolve(st.sug[K]);
  st.sug[K]='carregando';
  _ptSugP[K]=pcliApi('admin-sugestoes',{ qs:'&p='+encodeURIComponent(K) }).then(j=>{ st.sug[K]=(j&&j.ok)?j:{ erro:(j&&j.erro)||'Não consegui ler as sugestões.' }; delete _ptSugP[K]; return st.sug[K]; });
  return _ptSugP[K]; }
// A ficha do Jira (épicos) — o mesmo cache de 📁 Projetos / 📅 Cronograma (estado.projetos.fichas).
function ptGaranteFicha(K){ const st=ptSt(); if(!K||crFicha(K)||st.fichaB[K]) return; st.fichaB[K]=true;
  fetch(`/api/projetos?visao=1&projeto=${encodeURIComponent(K)}`).then(r=>r.json()).then(j=>{ st.fichaB[K]=false; if(j&&!j.erro) estado.projetos.fichas[K]=j; ptReRender(); })
    .catch(()=>{ st.fichaB[K]=false; }); }

// ---- rascunho da configuração (st.rasc): nasce da linha do servidor, acompanha cada tecla ----
function ptRascunho(K){ const st=ptSt(); if(st.rasc&&st.rascKey===K) return st.rasc; const info=ptInfo(K); if(!info) return null;
  const base=ptConfigPadrao(); const c=(info.config&&typeof info.config==='object')?JSON.parse(JSON.stringify(info.config)):{};
  const blocos={ ...base.blocos, ...((c.blocos&&typeof c.blocos==='object')?c.blocos:{}) };
  st.rasc={ publicado:!!info.publicado, teamsUrl:c.teamsUrl||'', pasta:c.pasta||'', calendario:c.calendario||'', apresentacao:c.apresentacao||'', mostrarAta:c.mostrarAta===true,
    links:(Array.isArray(c.links)?c.links:[]).map(l=>({ nome:l.nome||'', url:l.url||'', tipo:l.tipo||'' })),
    equipe:(Array.isArray(c.equipe)?c.equipe:[]).map(p=>({ nome:p.nome||'', papel:p.papel||'', contato:p.contato||'' })),
    epicosOcultos:(Array.isArray(c.epicosOcultos)?c.epicosOcultos:[]).slice(), blocos };
  st.rascKey=K; return st.rasc; }
function ptRascSujo(K){ const st=ptSt(); const r=st.rasc; const info=ptInfo(K); if(!r||!info) return false;
  const { publicado, ...config }=r; return publicado!==!!info.publicado||JSON.stringify(ptConfigNorm(config))!==JSON.stringify(ptConfigNorm(info.config)); }
// Forma comparável (a mesma que o servidor devolve normalizada) — para saber se há o que salvar.
function ptConfigNorm(c){ const x=(c&&typeof c==='object')?c:{};
  return { teamsUrl:x.teamsUrl||'', pasta:x.pasta||'', calendario:x.calendario||'', links:(x.links||[]).map(l=>({ nome:l.nome||'', url:l.url||'', tipo:l.tipo||'' })),
    equipe:(x.equipe||[]).map(p=>({ nome:p.nome||'', papel:p.papel||'', contato:p.contato||'' })), epicosOcultos:(x.epicosOcultos||[]).slice().sort(), mostrarAta:x.mostrarAta===true,
    blocos:Object.fromEntries(PT_BLOCOS.map(k=>[k[0],!(x.blocos&&x.blocos[k[0]]===false)])), apresentacao:x.apresentacao||'' }; }
// Valida na tela o que o servidor também valida (ele é a verdade; aqui só se evita uma ida inútil).
function ptValidaRasc(r){
  if(r.teamsUrl&&!pcUrl(r.teamsUrl)) return 'Canal do Teams: cole um link http(s) (no Teams: ⋯ do canal → Obter link do canal).';
  if(r.pasta&&!pcUrl(r.pasta)) return 'Pasta do SharePoint: cole um link http(s) (Abrir → ⋯ → Copiar link).';
  const cal=String(r.calendario||'').trim(); if(cal&&!PT_RE_EMAIL.test(cal)&&!PT_RE_GUID.test(cal)) return 'Calendário do projeto: informe o e-mail da caixa compartilhada ou o GUID do grupo do Teams.';
  for(const l of r.links){ if(!pcUrl(l.url)) return `Link "${l.nome||'?'}": use um endereço http(s).`; }
  for(const p of r.equipe){ if(!String(p.nome||'').trim()) return 'Time do projeto: cada pessoa precisa de um nome (ou remova a linha).'; }
  return '';
}
function ptFb(msg, tipo){ const fb=document.getElementById('pt-f-fb'); if(!fb) return; fb.hidden=!msg; fb.className='ap-fb '+(tipo||'ok'); fb.textContent=msg||''; }
// Um campo do formulário mudou: o rascunho acompanha (é dele que o formulário renasce em qualquer redesenho).
function ptGuardaCampo(t){ const st=ptSt(); const r=st.rasc; if(!r||!t||!t.getAttribute) return false;
  const cb=t.type==='checkbox'; const val=cb?!!t.checked:String(t.value||'');
  const c=t.getAttribute('data-pt-cfg'); if(c){ r[c]=val; return true; }
  const lk=t.getAttribute('data-pt-link'); if(lk){ const [i,campo]=lk.split('|'); if(r.links[+i]) r.links[+i][campo]=val; return true; }
  const eq=t.getAttribute('data-pt-eq'); if(eq){ const [i,campo]=eq.split('|'); if(r.equipe[+i]) r.equipe[+i][campo]=val; return true; }
  const oc=t.getAttribute('data-pt-oculto'); if(oc){ const s=new Set(r.epicosOcultos); if(val) s.add(oc); else s.delete(oc); r.epicosOcultos=[...s]; return true; }
  const bl=t.getAttribute('data-pt-bloco'); if(bl){ r.blocos[bl]=!!val; return true; }
  return false; }
// Salva a configuração (upsert validado no servidor). Publicar/despublicar pede confirmação e vai para o
// 🗒 Histórico de ações — a tabela é a fonte da verdade (atualizado_por); o log é o rastro no painel.
function ptSalvaConfig(depois){
  const st=ptSt(); const K=st.proj; const c=ptContratoDe(K); const r=st.rasc; const info=ptInfo(K); if(!K||!c||!r||!info||st.salvando) return;
  const erro=ptValidaRasc(r); if(erro){ ptFb(erro,'err'); return; }
  const { publicado, ...config }=r; const antesPub=!!info.publicado;
  if(publicado!==antesPub){ const ok=confirm(publicado?`Publicar ${K} para o cliente ${c.cliente||c.id}?\n\nQuem tem conta neste contrato passa a ver o projeto no portal na hora (progresso, pendências, decisões visíveis, riscos, time, reuniões, FAQ e links).`
    :`Despublicar ${K}?\n\nO cliente deixa de ver o projeto no portal imediatamente. A configuração e o conteúdo ficam guardados.`);
    if(!ok){ r.publicado=antesPub; renderPortal(); return; } }
  st.salvando=true; ptFb('Salvando…','warn');
  pcliApi('admin-config',{ corpo:{ projeto:K, contratoId:c.id, publicado, config } }).then(j=>{ st.salvando=false;
    if(!j||!j.ok){ ptFb((j&&j.erro)||'Não consegui salvar.','err'); return; }
    const l=ptLista(c.id); if(l){ const i=l.findIndex(p=>p.projeto===K); const novo={ ...(i>=0?l[i]:{ projeto:K, nome:ptNomeProj(K), n:{} }), ...(j.projeto||{}) }; if(i>=0) l[i]=novo; else l.push(novo); }
    if(j.publicadoMudou) logAcao({ acao:publicado?'portal-publicar':'portal-despublicar', t:'', de:K, para:c.cliente||c.id, ok:true });
    st.rasc=null; toast(publicado&&j.publicadoMudou?`🌐 ${K} publicado para ${c.cliente||'o cliente'}.`:(!publicado&&j.publicadoMudou?`${K} despublicado — o cliente não vê mais o projeto.`:'Configuração do portal salva.'),'ok');
    if(depois==='testar') ptTestaCalendario(K); else renderPortal();
  });
}
// Testa o calendário SALVO (o servidor lê a linha do projeto): mostra as próximas 3 reuniões ou o erro.
function ptTestaCalendario(K){ const st=ptSt(); st.cal[K]='carregando'; renderPortal();
  ptCarregaSug(K,true).then(s=>{ st.cal[K]=(s&&!s.erro)?(s.calendario||{ ok:false, erro:'sem-calendario', eventos:[] }):{ ok:false, erro:'falha', eventos:[] }; renderPortal(); }); }

// ---- conteúdo curado (jirainsight_portal_itens): cada mudança vai na hora para o servidor ----
function ptItens(K){ const l=ptSt().itens[K]; return Array.isArray(l)?l:null; }
function ptItemNovo(tipo){ return { tipo, titulo:'', descricao:'', respNome:'', respLado:tipo==='pendencia'?'cliente':'', prazo:'', inicio:'', fim:'', link:'', prob:'', impacto:'', mitigacao:'', status:'aberto', visivel:true, ordem:0 }; }
function ptItemCorpo(it){ return { id:it.id, tipo:it.tipo, titulo:it.titulo, descricao:it.descricao, respNome:it.respNome, respLado:it.respLado, prazo:it.prazo, inicio:it.inicio, fim:it.fim, link:it.link,
  prob:it.prob, impacto:it.impacto, mitigacao:it.mitigacao, status:it.status, visivel:it.visivel!==false, ordem:Number(it.ordem)||0 }; }
function ptSalvaItem(K, acao, item){ const st=ptSt();
  return pcliApi('admin-itens',{ qs:'&p='+encodeURIComponent(K), corpo:{ acao, item:ptItemCorpo(item) } }).then(j=>{
    if(!j||!j.ok){ toast((j&&j.erro)||'Não consegui salvar o item.','err'); ptReRenderSuave(); return false; }
    const l=ptItens(K)||[];
    if(acao==='criar'){ l.push(j.item); st.itens[K]=l; st.novo=null; toast(`${PT_TIPOS[j.item.tipo][1]} criada.`,'ok'); renderPortal(); }
    else if(acao==='remover'){ st.itens[K]=l.filter(x=>x.id!==j.id); toast('Item removido.','ok'); renderPortal(); }
    else { const i=l.findIndex(x=>x.id===j.item.id); if(i>=0) l[i]=j.item; ptReRenderSuave(); }
    const c=ptContratoDe(K); if(c) ptCarregaLista(c.id,true);   // os contadores da tabela mudaram
    return true; }); }
// Redesenha — mas NUNCA enquanto a pessoa está numa linha editável: o redesenho fica adiado até o foco
// sair da tabela, senão o Tab de uma célula à outra perderia o que estava sendo digitado (padrão do 16c).
let _ptAdiado=false, _ptAdiaT=null;
const PT_TAB_EDIT='.pt-itens-tab,.pt-dec-tab';
const ptNaTabela=(e)=>!!(e&&e.closest&&e.closest(PT_TAB_EDIT));
function ptAdiaRender(){ _ptAdiado=true; clearTimeout(_ptAdiaT);
  _ptAdiaT=setTimeout(()=>{ _ptAdiaT=null; if(!_ptAdiado) return; if(ptNaTabela(document.activeElement)){ ptAdiaRender(); return; } _ptAdiado=false; ptReRender(); },800); }
function ptReRenderSuave(){ if(estado.vista!=='portal') return; if(_ptAdiado||ptNaTabela(document.activeElement)){ ptAdiaRender(); return; } renderPortal(); }
document.getElementById('conteudo').addEventListener('focusin',(e)=>{ if(estado.vista!=='portal'||!_ptAdiado) return;
  if(ptNaTabela(e.target)){ ptAdiaRender(); return; }
  clearTimeout(_ptAdiaT); _ptAdiaT=null; _ptAdiado=false; setTimeout(()=>{ ptReRender(); },0); });

// ---- 👁 pré-visualização: o Hub entrega a identidade do gestor à página por postMessage (mesma origem) ----
// A página /portal.html?preview=KEY chama ?pcli=preview&p=KEY com x-jira-email/x-jira-token — o cliente nunca
// usa esse caminho (não tem token do Jira). A mensagem só sai para a própria origem.
function ptPreviewMsg(){ const id=idApontar(); return id?{ tipo:'preview', email:id.email||'', token:id.token||'' }:null; }
function ptPreviewManda(win){ const m=ptPreviewMsg(); if(!win||!m) return; try{ win.postMessage(m, location.origin); }catch(e){} }
function ptPreviewNovaAba(K){ const m=ptPreviewMsg(); if(!m){ toast('Identifique-se em ⏱ Apontar para pré-visualizar como gestor.','warn'); return; }
  const w=window.open(`/portal.html?preview=${encodeURIComponent(K)}`,'_blank'); if(!w) return;
  let n=0; const t=setInterval(()=>{ try{ if(w.closed){ clearInterval(t); return; } w.postMessage(m, location.origin); }catch(e){} if(++n>=16) clearInterval(t); },500); }   // a aba nova não avisa quando carregou: insiste por 8 s

// =============================== A TELA ===============================
function renderPortal(){
  const cont=document.getElementById('conteudo'); const st=ptSt(); const gestor=ptGestor(); const contratos=ptContratos();
  if(typeof _projetosCache!=='undefined'&&!_projetosCache) garanteProjetos().then(()=>ptReRender()).catch(()=>{});   // nomes dos projetos
  let K=String(st.proj||'').trim().toUpperCase(); let c=K?ptContratoDe(K):null; if(K&&!c){ K=''; }
  st.proj=K; st.ct=c?c.id:'';
  if(!PT_SECS.includes(st.sec)||(!K&&st.sec!=='projetos')) st.sec='projetos';
  if(K) ptCarregaLista(c.id);
  const info=K?ptInfo(K):null;
  // o foco (célula/campo) sobrevive ao redesenho: mesmo atributo, mesma posição do cursor
  const ativo=document.activeElement; const selFoco=cont.contains(ativo)?ptSeletorFoco(ativo):''; let pos=null; try{ pos=(selFoco&&ativo.selectionStart!=null)?ativo.selectionStart:null; }catch(e){ pos=null; }
  const chips=PT_SECS.map(s=>{ const precisa=s!=='projetos'&&!K; const on=st.sec===s;
    return `<button class="btn${on?' on':''}" data-pt-sec="${s}" ${precisa?'disabled data-tip="Escolha um projeto na lista"':`data-tip="${escA(PT_SEC_ROT[s][1])}"`} aria-pressed="${on?'true':'false'}">${esc(PT_SEC_ROT[s][0])}</button>`; }).join('');
  const foco=K?`<div class="pt-foco"><span class="muted small">Projeto em foco</span> <b>${esc(K)} · ${esc(ptNomeProj(K))}</b> <span class="muted small">· cliente</span> <b>${esc(c.cliente||c.id)}</b> ${ptBadgePub(info)} ${projChipsFicha([K])}
      <button class="btn rt-step" data-pt-voltar="1" data-tip="Voltar à lista de projetos">↩ todos os projetos</button></div>`:'';
  const intro=`<div class="card full"><h2>🌐 Portal do cliente <span>a visão externa do projeto — progresso, pendências, decisões, riscos, time, reuniões, FAQ e links, sem dar acesso ao Jira</span></h2>
    <div class="muted small">O cliente entra em <b>${esc(location.origin)}/portal.html</b> com e-mail e senha (👤 Acessos) e vê os projetos <b>publicados</b> do contrato dele. Tudo o que ele recebe sai de um único lugar no servidor, por lista fechada de campos: <b>nunca</b> valores, horas por pessoa, responsável por ticket, comentários ou outros clientes. ${gestor?'':'<b>Somente gestores editam</b>; você está vendo em modo leitura.'}</div>
    ${foco}<div class="pt-secs">${chips}</div></div>`;
  const corpo=st.sec==='config'?ptConfigHTML(K,c,info,gestor):st.sec==='conteudo'?ptConteudoHTML(K,c,gestor):st.sec==='acessos'?ptAcessosHTML(K,c,gestor):st.sec==='preview'?ptPreviewHTML(K,c,info,gestor):ptProjetosHTML(contratos,gestor);
  cont.innerHTML=intro+corpo;
  if(selFoco){ const n=cont.querySelector(selFoco); if(n&&n!==document.activeElement){ try{ n.focus({ preventScroll:true }); if(pos!=null&&n.setSelectionRange) n.setSelectionRange(pos,pos); }catch(e){} } }
  const f=document.getElementById('pt-preview'); if(f) f.addEventListener('load',()=>ptPreviewManda(f.contentWindow));
}
function ptSeletorFoco(a){ if(!a||!a.getAttribute) return '';
  for(const at of ['data-pt-cfg','data-pt-link','data-pt-eq','data-pt-novo','data-pt-item','data-pt-oculto','data-pt-bloco','data-pt-dec']){ const v=a.getAttribute(at); if(v!=null) return `[${at}="${v.replace(/"/g,'\\"')}"]`; }
  return a.id?'#'+a.id:''; }
function ptBadgePub(info){ if(!info) return '<span class="badge pt-rasc" data-tip="Ainda sem linha no portal (ou a lista ainda não chegou)">rascunho</span>';
  return info.publicado?'<span class="badge pt-pub" data-tip="O cliente vê este projeto no portal">✓ publicado</span>':'<span class="badge pt-rasc" data-tip="Só você vê (pré-visualização); o cliente ainda não">rascunho</span>'; }

// ---- 1. 🌐 Projetos: contrato × projeto ----
function ptProjetosHTML(contratos, gestor){
  const st=ptSt();
  const aviso=`<div class="aviso pt-aviso-dom">🌐 <b>Onde o cliente entra:</b> <code>${esc(location.origin)}/portal.html</code> — login com e-mail e senha (👤 Acessos). <b>Bloqueio conhecido:</b> a Vercel está com proteção SSO e só libera domínios customizados — o cliente externo só chega ao portal com o <b>domínio configurado na Vercel</b> (ex.: portal.dexterityit.com.br); num endereço <code>*.vercel.app</code> ele cai no login da Vercel. É DNS/configuração, não código.</div>`;
  if(!contratos.length) return aviso+`<div class="card full"><div class="estado">Nenhum contrato com projetos do Jira em 📑 Contratos › 🏢 Clientes. Cadastre o contrato do cliente e mapeie os projetos — é o contrato que define o que cada cliente pode ver. <button class="btn" data-goto="admin">📑 Contratos</button></div></div>`;
  const rows=[]; contratos.forEach(c=>{ ptCarregaLista(c.id); const l=st.lista[c.id]; const keys=ptKeysDe(c);
    const lista=Array.isArray(l)?l:null; const todas=[...new Set([...keys, ...(lista||[]).map(p=>p.projeto)])];
    todas.forEach((K,i)=>{ const p=lista?lista.find(x=>x.projeto===K):null; const n=(p&&p.n)||{};
      const num=(v,tip)=>p?`<td class="num" data-tip="${escA(tip)}">${v||'<span class="muted">—</span>'}</td>`:'<td class="num muted">…</td>';
      const sit=!lista?(l&&l.erro?`<span class="muted small" style="color:#B45309">${esc(l.erro)}</span>`:'<span class="muted small">carregando…</span>'):ptBadgePub(p);
      rows.push(`<tr class="${p&&p.publicado?'pt-l-pub':''}">${i===0?`<td rowspan="${todas.length}"><b>${esc(c.cliente||c.id)}</b><div class="muted small">${esc((typeof rotuloTipo==='function')?rotuloTipo(c.tipo):(c.tipo||''))}</div></td>`:''}
        <td><b>${esc(K)}</b><div class="muted small">${esc((p&&p.nome)||((typeof projNome==='function')?projNome(K):K))}${p&&p.noContrato===false?' · <span style="color:#B45309">fora do contrato</span>':''}</div></td>
        <td>${sit}</td>${num(n.pendencias,'pendências abertas (manuais) visíveis')}${num(n.decisoesVisiveis,'decisões abertas marcadas como visíveis')}${num(n.riscos,'riscos abertos/mitigados visíveis')}${num(n.faq,'perguntas do FAQ visíveis')}${num(n.reunioes,'reuniões manuais visíveis')}
        <td class="muted small">${p&&p.ultimoAcesso?esc(ptQuandoBR(p.ultimoAcesso)):'—'}</td>
        <td class="pt-acoes"><button class="btn rt-step" data-pt-abrir="${escA(K)}|${escA(c.id)}|config">⚙️ configurar</button><button class="btn rt-step" data-pt-abrir="${escA(K)}|${escA(c.id)}|conteudo">📋 conteúdo</button><button class="btn rt-step" data-pt-abrir="${escA(K)}|${escA(c.id)}|preview" data-tip="Abre a pré-visualização: a página como o cliente vê">👁 como o cliente</button></td></tr>`); }); });
  return aviso+`<div class="card full"><h2>Contratos × projetos <span>${contratos.length} contrato(s) com projetos mapeados${gestor?' · publique, configure e pré-visualize por projeto':''}</span>
      <button class="btn rt-step" data-pt-refresh-lista="1" data-tip="Reler os contadores e a situação de cada projeto" style="float:right">↻</button></h2>
    <div class="scroll-x"><table class="mp-tab-mini pt-tab"><thead><tr><th>Cliente</th><th>Projeto</th><th>Situação</th><th class="num">⚠</th><th class="num">🎯</th><th class="num">🛡</th><th class="num">❓</th><th class="num">📅</th><th>Último acesso</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <div class="muted small" style="margin-top:8px">⚠ pendências · 🎯 decisões visíveis · 🛡 riscos · ❓ FAQ · 📅 reuniões manuais — só o que está <b>visível ao cliente</b>. "Último acesso" é o da conta do contrato que entrou por último. Um projeto que não está mais no contrato aparece como <b>fora do contrato</b>: o cliente não o vê até você mapeá-lo de novo em 📑 Contratos.</div></div>`;
}

// ---- 2. ⚙️ Configurar ----
function ptConfigHTML(K, c, info, gestor){
  const st=ptSt(); const l=st.lista[c.id];
  if(!info){ if(l&&l.erro) return `<div class="card full"><div class="estado" style="color:#B45309">${esc(l.erro)}</div></div>`; return '<div class="card full"><div class="estado">Carregando a configuração do portal…</div></div>'; }
  const r=ptRascunho(K); const ro=gestor?'':' disabled'; const sujo=ptRascSujo(K);
  const ficha=crFicha(K); if(!ficha) ptGaranteFicha(K);
  const cal=st.cal[K]; const calHTML=cal==='carregando'?'<div class="muted small">Lendo o calendário…</div>'
    :cal&&cal.ok?`<div class="aviso ok pt-cal-ok">✓ Calendário lido. ${cal.eventos.length?`Próximas reuniões: ${cal.eventos.map(e=>`<b>${esc(e.titulo)}</b> (${esc(ptQuandoCurto(e.inicio))}${e.link?' · <a href="'+escA(e.link)+'" target="_blank" rel="noopener noreferrer">entrar ↗</a>':''})`).join(' · ')}`:'Nenhuma reunião nos próximos 30 dias — o bloco aparece vazio para o cliente.'}</div>`
    :cal?`<div class="aviso pt-cal-erro">⚠ ${esc(PT_CAL_ERROS[cal.erro]||cal.erro||'Falha ao ler o calendário.')} <span class="muted small">O cliente não vê este erro: para ele o bloco de reuniões só fica sem os eventos do calendário.</span></div>`:'';
  const links=r.links.map((x,i)=>`<tr><td><input type="text" data-pt-link="${i}|nome" value="${escA(x.nome)}" placeholder="nome do link"${ro}></td><td><input type="url" data-pt-link="${i}|url" value="${escA(x.url)}" placeholder="https://…" style="min-width:230px"${ro}></td><td><input type="text" data-pt-link="${i}|tipo" value="${escA(x.tipo)}" placeholder="ex.: planilha, ata, manual" style="min-width:110px"${ro}></td><td>${pcUrl(x.url)?`<a class="btn rt-step" href="${escA(pcUrl(x.url))}" target="_blank" rel="noopener noreferrer">abrir ↗</a>`:''}</td><td>${gestor?`<button class="btn rt-step" data-pt-link-rm="${i}" data-tip="Tirar este link">🗑</button>`:''}</td></tr>`).join('');
  const equipe=r.equipe.map((p,i)=>`<tr><td><input type="text" data-pt-eq="${i}|nome" value="${escA(p.nome)}" placeholder="nome"${ro}></td><td><input type="text" data-pt-eq="${i}|papel" value="${escA(p.papel)}" placeholder="ex.: gerente do projeto, consultor SAP FI"${ro}></td><td><input type="text" data-pt-eq="${i}|contato" value="${escA(p.contato)}" placeholder="e-mail ou Teams (opcional)"${ro}></td><td>${gestor?`<button class="btn rt-step" data-pt-eq-rm="${i}" data-tip="Tirar esta pessoa">🗑</button>`:''}</td></tr>`).join('');
  const sug=st.sug[K]; const sugNomes=(sug&&!sug.erro&&sug!=='carregando')?(sug.equipe||[]).map(x=>x.nome).filter(n=>n&&!r.equipe.some(p=>p.nome===n)):[];
  const eps=ficha?(ficha.epicos||[]):[]; const ocultos=new Set(r.epicosOcultos);
  const epicos=ficha?(eps.length?`<div class="rg-pessoas pt-epicos">${eps.map(e=>`<label class="check"><input type="checkbox" data-pt-oculto="${escA(e.k)}" ${ocultos.has(e.k)?'checked':''}${ro}> ${esc(e.k)} · ${esc(e.resumo||'')}${e.sc==='done'?' <span class="muted small">(concluído)</span>':e.sc==='cancel'?' <span class="muted small">(cancelado)</span>':''}</label>`).join('')}</div>`
      :'<div class="muted small">Este projeto não tem épicos no Jira — o progresso do cliente é calculado pelos itens do projeto inteiro.</div>')
    :(st.fichaB[K]?'<div class="muted small">Carregando os épicos do Jira…</div>':'<div class="muted small">Não consegui ler os épicos agora.</div>');
  const orfaos=r.epicosOcultos.filter(k=>ficha&&eps.length&&!eps.some(e=>e.k===k));
  return `<div class="card full pt-form" data-pt-form="${escA(K)}"><h2>⚙️ Configurar <span>${esc(K)} · ${esc(ptNomeProj(K))} · cliente ${esc(c.cliente||c.id)}</span></h2>
    <label class="check pt-pub-l"><input type="checkbox" id="pt-f-publicado" data-pt-cfg="publicado" ${r.publicado?'checked':''}${ro}> <b>Publicado para o cliente</b> <span class="muted small">— desmarcado, só você vê (👁 Pré-visualizar); marcado, quem tem conta no contrato vê o projeto no portal. Publicar e despublicar vão para o 🗒 Histórico de ações.</span></label>
    <div class="campo"><label>Apresentação (texto curto de boas-vindas, até 600 caracteres)</label><textarea id="pt-f-apresentacao" data-pt-cfg="apresentacao" maxlength="600" rows="2" placeholder="ex.: Bem-vindo ao acompanhamento do rollout SAP. Aqui você vê o andamento, o que precisamos de você e as próximas reuniões."${ro}>${esc(r.apresentacao)}</textarea></div>
    <div class="pl-grid pt-links3">
      <div class="campo"><label>💬 Canal do Teams (link)</label><input type="url" id="pt-f-teams" data-pt-cfg="teamsUrl" value="${escA(r.teamsUrl)}" placeholder="https://teams.microsoft.com/l/channel/…" data-tip="No Teams: ⋯ do canal → Obter link do canal. Vira o botão 💬 em destaque no portal."${ro}></div>
      <div class="campo"><label>📂 Pasta do SharePoint (link)</label><input type="url" id="pt-f-pasta" data-pt-cfg="pasta" value="${escA(r.pasta)}" placeholder="https://dexterityit.sharepoint.com/sites/…" data-tip="Abrir → ⋯ → Copiar link. O painel guarda só o endereço; quem clica abre com a própria conta."${ro}></div>
      <div class="campo pt-cal"><label>📅 Calendário do projeto</label><span class="pt-cal-l"><input type="text" id="pt-f-calendario" data-pt-cfg="calendario" value="${escA(r.calendario)}" placeholder="projeto-x@dexterityit.com.br ou GUID do grupo" style="min-width:250px"${ro}>${gestor?`<button class="btn rt-step" id="pt-cal-testar" type="button" data-tip="Lê as próximas reuniões deste calendário com as credenciais do aplicativo (só campos públicos)">${sujo?'💾 salvar e testar':'testar'}</button>`:''}</span>
        <div class="muted small">A caixa compartilhada do projeto ou o calendário da equipe do Teams (GUID do grupo). O servidor lê <b>só este calendário</b> e só título, horário, local e link — nunca convidados nem pauta. As reuniões dos próximos 30 dias entram no bloco 📆 do cliente.</div>${calHTML}</div>
    </div>
    <div class="mp-h3" style="margin-top:10px">🔗 Links úteis <span class="mp-dim">chips no portal — cronograma detalhado, manuais, atas</span></div>
    ${r.links.length?`<div class="scroll-x"><table class="mp-tab-mini pt-tab"><thead><tr><th>Nome</th><th>Link</th><th>Tipo</th><th></th><th></th></tr></thead><tbody>${links}</tbody></table></div>`:'<div class="muted small">Nenhum link ainda.</div>'}
    ${gestor?'<div style="margin-top:6px"><button class="btn rt-step" data-pt-link-add="1">＋ link</button></div>':''}
    <div class="mp-h3" style="margin-top:14px">👥 Time do projeto <span class="mp-dim">nome, papel e contato — só o que está aqui vai ao cliente; horas por pessoa nunca</span></div>
    ${r.equipe.length?`<div class="scroll-x"><table class="mp-tab-mini pt-tab"><thead><tr><th>Nome</th><th>Papel</th><th>Contato</th><th></th></tr></thead><tbody>${equipe}</tbody></table></div>`:'<div class="muted small">Ninguém no time ainda.</div>'}
    ${gestor?`<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center"><button class="btn rt-step" data-pt-eq-add="1">＋ pessoa</button><button class="btn rt-step" data-pt-eq-sug="1" data-tip="Traz os nomes de quem tem esforço no projeto (Jira) — só nomes, você preenche o papel">✨ sugerir do Jira</button>${sug==='carregando'?'<span class="muted small">lendo o Jira…</span>':sugNomes.length?`<span class="muted small">sugestões: ${sugNomes.map(esc).join(', ')}</span>`:(sug&&!sug.erro?'<span class="muted small">nenhuma sugestão nova</span>':'')}</div>`:''}
    <div class="mp-h3" style="margin-top:14px">🙈 Épicos ocultos <span class="mp-dim">marque o que o cliente NÃO deve ver no progresso e no cronograma (trabalho interno, épico técnico)</span></div>
    ${epicos}${orfaos.length?`<div class="muted small">Ocultos que não estão mais na ficha: ${orfaos.map(esc).join(', ')}.</div>`:''}
    <div class="mp-h3" style="margin-top:14px">🧩 Blocos do portal <span class="mp-dim">o que aparece na página do cliente (só quando também há conteúdo)</span></div>
    <div class="rg-pessoas pt-blocos">${PT_BLOCOS.map(b=>`<label class="check"><input type="checkbox" data-pt-bloco="${b[0]}" ${r.blocos[b[0]]!==false?'checked':''}${ro}> ${esc(b[1])}</label>`).join('')}</div>
    <label class="check" style="margin-top:6px"><input type="checkbox" id="pt-f-ata" data-pt-cfg="mostrarAta" ${r.mostrarAta?'checked':''}${ro}> Mostrar o link da <b>ata</b> nas decisões visíveis</label>
    ${gestor?`<div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;align-items:center"><button class="btn primario" id="pt-f-salvar" ${st.salvando?'disabled':''}>💾 Salvar</button><button class="btn" id="pt-f-desfazer" data-tip="Descarta o que foi digitado e volta ao que está salvo">↺ Descartar</button><span class="muted small">${sujo?'há alterações não salvas':(info.atualizadoEm?`salvo ${esc(ptQuandoBR(info.atualizadoEm))}${info.atualizadoPor?' por '+esc(info.atualizadoPor):''}`:'')}</span></div>`:''}
    <div class="ap-fb" id="pt-f-fb" hidden></div></div>`;
}

// ---- 3. 📋 Conteúdo: pendências, riscos, FAQ, reuniões manuais + decisões visíveis ----
function ptConteudoHTML(K, c, gestor){
  const st=ptSt(); ptCarregaItens(K); ptCarregaDecs(K); const ro=gestor?'':' disabled';
  const lista=ptItens(K); const li=st.itens[K];
  const tipos=st.fTipo&&PT_TIPOS[st.fTipo]?[st.fTipo]:PT_TIPO_IDS;
  const filtros=`<div class="pt-filtros"><span class="muted small">Tipo:</span><button class="btn rt-step${!st.fTipo?' on':''}" data-pt-tipo="">todos</button>${PT_TIPO_IDS.map(t=>`<button class="btn rt-step${st.fTipo===t?' on':''}" data-pt-tipo="${t}">${PT_TIPOS[t][0]} ${esc(PT_TIPOS[t][2].split(' — ')[0])}${lista?` (${lista.filter(x=>x.tipo===t).length})`:''}</button>`).join('')}
    <span class="spacer"></span><label class="muted small">Situação <select id="pt-f-st"><option value="">todas</option>${['aberto','feito','mitigado','encerrado'].map(s=>`<option value="${s}" ${st.fSt===s?'selected':''}>${s}</option>`).join('')}</select></label></div>`;
  const novoBtns=gestor?`<div class="pt-novos">${PT_TIPO_IDS.map(t=>`<button class="btn rt-step" data-pt-novo-tipo="${t}">＋ ${esc(PT_TIPOS[t][1])}</button>`).join('')}</div>`:'';
  const novo=(gestor&&st.novo)?ptNovoHTML(st.novo):'';
  const inp=(it,campo,tipo,attrs)=>{ const v=(campo==='inicio'||campo==='fim')?ptLocalSP(it[campo]):(it[campo]==null?'':it[campo]); return gestor?`<input type="${tipo}" data-pt-item="${escA(it.id)}|${campo}" value="${escA(v)}" ${attrs||''}>`:(tipo==='datetime-local'?esc(ptQuandoBR(it[campo])):tipo==='date'?esc(dataBR(v)):esc(v)); };
  const sel=(it,campo,ops)=>gestor?`<select data-pt-item="${escA(it.id)}|${campo}">${ops.map(o=>`<option value="${escA(o[0])}" ${String(it[campo]||'')===o[0]?'selected':''}>${esc(o[1])}</option>`).join('')}</select>`:esc((ops.find(o=>o[0]===String(it[campo]||''))||['',''])[1]);
  const vis=(it)=>`<input type="checkbox" data-pt-item="${escA(it.id)}|visivel" ${it.visivel!==false?'checked':''} data-tip="Visível ao cliente"${ro}>`;
  const rm=(it)=>gestor?`<button class="btn rt-step" data-pt-item-rm="${escA(it.id)}" data-tip="Apagar">🗑</button>`:'';
  const ord=(it)=>inp(it,'ordem','number','style="width:60px" min="0" step="1" data-tip="Ordem na lista (menor primeiro)"');
  const stSel=(it)=>sel(it,'status',PT_STATUS[it.tipo].map(s=>[s,s]));
  const cab={ pendencia:'<th>👁</th><th>Título</th><th>Detalhe</th><th>Lado</th><th>Responsável</th><th>Prazo</th><th>Situação</th><th class="num">Ordem</th><th></th>',
    risco:'<th>👁</th><th>Risco</th><th>Prob.</th><th>Impacto</th><th>Mitigação</th><th>Responsável</th><th>Situação</th><th class="num">Ordem</th><th></th>',
    faq:'<th>👁</th><th>Pergunta</th><th>Resposta</th><th class="num">Ordem</th><th></th>',
    reuniao:'<th>👁</th><th>Reunião</th><th>Início</th><th>Fim</th><th>Link</th><th>Local</th><th>Situação</th><th></th>' };
  const linha=(it)=>{ const t=it.tipo;
    if(t==='pendencia') return `<tr><td>${vis(it)}</td><td>${inp(it,'titulo','text','style="min-width:200px"')}</td><td>${inp(it,'descricao','text','style="min-width:160px"')}</td><td>${sel(it,'respLado',[['cliente','cliente'],['dexterity','Dexterity']])}</td><td>${inp(it,'respNome','text','style="min-width:120px"')}</td><td>${inp(it,'prazo','date','')}</td><td>${stSel(it)}</td><td class="num">${ord(it)}</td><td>${rm(it)}</td></tr>`;
    if(t==='risco') return `<tr><td>${vis(it)}</td><td>${inp(it,'titulo','text','style="min-width:200px"')}</td><td>${sel(it,'prob',PT_NIVEIS)}</td><td>${sel(it,'impacto',PT_NIVEIS)}</td><td>${inp(it,'mitigacao','text','style="min-width:200px"')}</td><td>${inp(it,'respNome','text','style="min-width:110px"')}</td><td>${stSel(it)}</td><td class="num">${ord(it)}</td><td>${rm(it)}</td></tr>`;
    if(t==='faq') return `<tr><td>${vis(it)}</td><td>${inp(it,'titulo','text','style="min-width:220px"')}</td><td>${inp(it,'descricao','text','style="min-width:280px"')}</td><td class="num">${ord(it)}</td><td>${rm(it)}</td></tr>`;
    return `<tr><td>${vis(it)}</td><td>${inp(it,'titulo','text','style="min-width:180px"')}</td><td>${inp(it,'inicio','datetime-local','')}</td><td>${inp(it,'fim','datetime-local','')}</td><td>${inp(it,'link','url','style="min-width:180px" placeholder="https://teams.microsoft.com/…"')}</td><td>${inp(it,'descricao','text','style="min-width:110px" placeholder="sala / Teams"')}</td><td>${stSel(it)}</td><td>${rm(it)}</td></tr>`; };
  let blocos='';
  if(!lista) blocos=li&&li.erro?`<div class="estado" style="color:#B45309">${esc(li.erro)}</div>`:'<div class="estado">Carregando o conteúdo…</div>';
  else blocos=tipos.map(t=>{ const its=lista.filter(x=>x.tipo===t&&(!st.fSt||x.status===st.fSt)).sort((a,b)=>(Number(a.ordem)||0)-(Number(b.ordem)||0)||String(a.criadoEm||'').localeCompare(String(b.criadoEm||'')));
    return `<div class="pt-grupo"><div class="mp-h3">${PT_TIPOS[t][0]} ${esc(PT_TIPOS[t][2])} <span class="mp-dim">${its.length}</span></div>
      ${its.length?`<div class="scroll-x"><table class="mp-tab-mini pt-tab pt-itens-tab" data-pt-tipo-tab="${t}"><thead><tr>${cab[t]}</tr></thead><tbody>${its.map(linha).join('')}</tbody></table></div>`:`<div class="muted small">Nada aqui${st.fSt?' com esta situação':''}.</div>`}</div>`; }).join('');
  // 🎯 decisões: as abertas do projeto, com o interruptor "visível ao cliente"
  const decs=st.decs[K]; const dl=Array.isArray(decs)?decs:null;
  const decHTML=!dl?(decs&&decs.erro?`<div class="muted small" style="color:#B45309">${esc(decs.erro)}</div>`:'<div class="muted small">Carregando as decisões…</div>')
    :(dl.length?`<div class="scroll-x"><table class="mp-tab-mini pt-tab pt-dec-tab"><thead><tr><th>👁</th><th>Decisão</th><th>Dono</th><th>Prazo</th><th>Situação</th><th>Ticket</th></tr></thead><tbody>${dl.map(d=>`<tr>
      <td><input type="checkbox" data-pt-dec="${escA(d.id)}" ${d.visivelCliente?'checked':''} data-tip="Visível ao cliente (título, contexto, dono, prazo e situação)"${ro}></td><td>${esc(d.decisao)}${d.contexto?`<div class="muted small">${esc(d.contexto)}</div>`:''}</td><td>${esc((d.dono&&d.dono.nome)||'')}</td><td>${d.prazo?esc(dataBR(d.prazo)):'—'}</td><td>${esc(d.status)}${d.reprazos?` <span class="muted small">(reprazada ${d.reprazos}×)</span>`:''}</td><td>${d.ticket?`<a href="${escA((typeof projJira==='function')?projJira(d.ticket):'#')}" target="_blank" rel="noopener">${esc(d.ticket)}</a>`:'—'}</td></tr>`).join('')}</tbody></table></div>`
    :'<div class="muted small">Nenhuma decisão aberta registrada para este projeto.</div>');
  return `<div class="card full"><h2>📋 Conteúdo curado <span>${esc(K)} · o que você escreve aqui vai ao cliente exatamente assim${gestor?' — cada mudança é salva na hora':''}</span></h2>
    ${filtros}${novoBtns}${novo}${blocos}
    <div class="muted small" style="margin-top:8px">👁 desmarcado = fica guardado, mas o cliente não vê. Pendências <b>feitas</b>, riscos <b>encerrados</b> e reuniões <b>encerradas</b> ou já passadas também não aparecem para ele. As pendências vindas do Jira (tickets em status "aguardando cliente") entram sozinhas — não precisam ser cadastradas aqui.</div></div>
    <div class="card full"><h2>🎯 Decisões a tomar <span>as decisões abertas do projeto (🎯 Prioridades) — marque as que o cliente pode ver</span></h2>
    ${decHTML}
    <div class="muted small" style="margin-top:8px">A decisão em si (texto, dono, prazo, situação, ata) continua sendo editada em 🎯 Prioridades. <button class="btn rt-step" data-goto="prioridades">🎯 abrir Prioridades</button> · O link da ata só vai ao cliente com <b>mostrar ata</b> ligado em ⚙️ Configurar.</div></div>`;
}
function ptNovoHTML(n){ const t=n.tipo; const T=PT_TIPOS[t]||PT_TIPOS.pendencia;
  const f=(campo,rot,tipo,attrs)=>`<div class="campo"><label>${rot}</label><input type="${tipo||'text'}" data-pt-novo="${campo}" value="${escA(n[campo]||'')}" ${attrs||''}></div>`;
  const s=(campo,rot,ops)=>`<div class="campo"><label>${rot}</label><select data-pt-novo="${campo}">${ops.map(o=>`<option value="${escA(o[0])}" ${String(n[campo]||'')===o[0]?'selected':''}>${esc(o[1])}</option>`).join('')}</select></div>`;
  let campos='';
  if(t==='pendencia') campos=f('titulo','Título','text','style="min-width:260px" placeholder="ex.: Enviar a planilha de materiais"')+f('descricao','Detalhe (opcional)','text','style="min-width:220px"')+s('respLado','Quem deve',[['cliente','o cliente'],['dexterity','a Dexterity']])+f('respNome','Responsável (nome)','text','')+f('prazo','Prazo','date','');
  else if(t==='risco') campos=f('titulo','Risco','text','style="min-width:260px" placeholder="ex.: Atraso na liberação do ambiente QAS"')+s('prob','Probabilidade',PT_NIVEIS)+s('impacto','Impacto',PT_NIVEIS)+f('mitigacao','Mitigação (o que está sendo feito)','text','style="min-width:260px"')+f('respNome','Responsável','text','');
  else if(t==='faq') campos=f('titulo','Pergunta','text','style="min-width:260px" placeholder="ex.: Como abro um chamado?"')+f('descricao','Resposta','text','style="min-width:320px"');
  else campos=f('titulo','Reunião','text','style="min-width:220px" placeholder="ex.: Comitê executivo"')+f('inicio','Início','datetime-local','')+f('fim','Fim','datetime-local','')+f('link','Link (Teams)','url','style="min-width:220px" placeholder="https://teams.microsoft.com/…"')+f('descricao','Local','text','placeholder="sala / Teams"');
  return `<div class="pt-novo" data-pt-novo-form="${t}"><div class="mp-h3">${T[0]} Nova ${esc(T[1].toLowerCase())}</div><div class="pl-grid">${campos}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primario" id="pt-novo-salvar">Salvar</button><button class="btn" id="pt-novo-cancelar">Cancelar</button><label class="check" style="padding:0"><input type="checkbox" data-pt-novo="visivel" ${n.visivel!==false?'checked':''}> visível ao cliente</label></div><div class="ap-fb" id="pt-novo-fb" hidden></div></div>`; }

// ---- 4. 👤 Acessos: o bloco de contas do contrato, reaproveitado de 16-contratos-ams-receita.js ----
function ptAcessosHTML(K, c, gestor){
  estado.admin.acessosAbertos[c.id]=true; if(estado.admin.acessos[c.id]===undefined) pcliCarrega(c.id);
  const pub=ptLista(c.id)?ptLista(c.id).filter(p=>p.publicado).map(p=>p.projeto):null;
  return `<div class="card full pt-acessos"><h2>👤 Acessos do cliente <span>contas de e-mail e senha do contrato <b>${esc(c.cliente||c.id)}</b> — valem para todos os projetos publicados nele${pub?` (${pub.length?pub.map(esc).join(', '):'nenhum publicado ainda'})`:''}</span></h2>
    <div class="muted small">Ninguém se cadastra sozinho: a conta nasce de um <b>convite</b> seu, já amarrada a este contrato — é o contrato que define o que a pessoa vê. O convite vale 7 dias e uma vez só; como o painel não envia e-mail, o link aparece aqui para você mandar. Revogar corta a sessão aberta na hora seguinte. ${gestor?'':'<b>Só gestores convidam e revogam.</b>'}</div>
    ${pcliBlocoHTML(c)}</div>`;
}

// ---- 5. 👁 Pré-visualizar: a página do cliente num iframe, com a identidade do gestor por postMessage ----
function ptPreviewHTML(K, c, info, gestor){
  const id=idApontar(); const url=`/portal.html?preview=${encodeURIComponent(K)}`;
  return `<div class="card full pt-prev"><h2>👁 Pré-visualizar <span>${esc(K)} · a página como o cliente vê — mesmo dado, mesmo cache (10 min)</span></h2>
    <div class="pt-prev-acoes"><button class="btn" id="pt-prev-nova" data-tip="Abre o portal numa aba nova, já com a sua identidade de gestor">↗ abrir em nova aba</button>${gestor?`<button class="btn" id="pt-prev-refresh" data-tip="Descarta o cache do portal e lê o Jira de novo (o cliente também passa a ver o dado novo)">↻ atualizar do Jira</button>`:''}<button class="btn" id="pt-prev-reload">⟳ recarregar</button>${ptBadgePub(info)}${info&&!info.publicado?'<span class="muted small">só você vê — o cliente recebe "projeto não encontrado" até publicar</span>':''}</div>
    ${id?`<iframe id="pt-preview" class="pt-preview" src="${escA(url)}" title="Pré-visualização do portal do cliente — ${escA(K)}"></iframe>`:'<div class="estado">Identifique-se em ⏱ Apontar (e-mail + token do Jira) para pré-visualizar: a prévia usa a sua identidade de gestor.</div>'}
    <div class="muted small" style="margin-top:8px">A prévia recebe a sua identidade do Jira por <code>postMessage</code> (só nesta página, mesma origem) e chama <code>?pcli=preview</code>, que exige gestor — o cliente nunca usa esse caminho: ele entra com e-mail e senha e recebe <code>?pcli=projeto</code>, o <b>mesmo</b> conteúdo.</div></div>`;
}

// ---- listeners delegados desta tela ----
document.getElementById('conteudo').addEventListener('click',(e)=>{
  if(estado.vista!=='portal') return; const st=ptSt(); const gestor=ptGestor(); const K=st.proj;
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-pt-sec')){ if(t.disabled) return; st.sec=t.getAttribute('data-pt-sec'); renderPortal(); estadoParaURL(); return; }
  if(t.hasAttribute('data-pt-abrir')){ const [k,ct,sec]=t.getAttribute('data-pt-abrir').split('|'); st.proj=k; st.ct=ct; st.sec=sec||'config'; st.rasc=null; renderPortal(); estadoParaURL(); window.scrollTo({ top:0, behavior:'smooth' }); return; }
  if(t.hasAttribute('data-pt-voltar')){ st.sec='projetos'; renderPortal(); estadoParaURL(); return; }
  if(t.hasAttribute('data-pt-refresh-lista')){ ptContratos().forEach(c=>ptCarregaLista(c.id,true)); renderPortal(); return; }
  if(t.hasAttribute('data-pt-tipo')){ st.fTipo=t.getAttribute('data-pt-tipo'); renderPortal(); return; }
  if(t.id==='pt-prev-reload'){ const f=document.getElementById('pt-preview'); if(f){ const s=f.getAttribute('src'); f.setAttribute('src',s); } return; }
  if(t.id==='pt-prev-nova'){ ptPreviewNovaAba(K); return; }
  if(!gestor){ toast('Só gestores editam o portal do cliente (configure em ⚙️ Central de configurações › quem aprova).','warn'); return; }
  // ⚙️ configurar
  const r=st.rasc;
  if(t.id==='pt-f-salvar'){ ptSalvaConfig(); return; }
  if(t.id==='pt-f-desfazer'){ st.rasc=null; ptFb(''); renderPortal(); return; }
  if(t.id==='pt-cal-testar'){ if(ptRascSujo(K)) ptSalvaConfig('testar'); else if(!String((r&&r.calendario)||'').trim()){ ptFb('Informe o calendário (e-mail da caixa ou GUID do grupo) e salve.','err'); } else ptTestaCalendario(K); return; }
  if(t.hasAttribute('data-pt-link-add')){ if(r){ r.links.push({ nome:'', url:'', tipo:'' }); renderPortal(); setTimeout(()=>{ const i=document.querySelector(`[data-pt-link="${r.links.length-1}|nome"]`); if(i) i.focus(); },0); } return; }
  if(t.hasAttribute('data-pt-link-rm')){ if(r){ r.links.splice(+t.getAttribute('data-pt-link-rm'),1); renderPortal(); } return; }
  if(t.hasAttribute('data-pt-eq-add')){ if(r){ r.equipe.push({ nome:'', papel:'', contato:'' }); renderPortal(); setTimeout(()=>{ const i=document.querySelector(`[data-pt-eq="${r.equipe.length-1}|nome"]`); if(i) i.focus(); },0); } return; }
  if(t.hasAttribute('data-pt-eq-rm')){ if(r){ r.equipe.splice(+t.getAttribute('data-pt-eq-rm'),1); renderPortal(); } return; }
  if(t.hasAttribute('data-pt-eq-sug')){ renderPortal(); ptCarregaSug(K).then(s=>{ const rr=st.rasc; if(!rr||st.rascKey!==K) return;
      if(!s||s.erro||s==='carregando'){ toast((s&&s.erro)||'Não consegui ler o Jira.','err'); renderPortal(); return; }
      const novos=(s.equipe||[]).map(x=>x.nome).filter(n=>n&&!rr.equipe.some(p=>p.nome===n)); novos.forEach(n=>rr.equipe.push({ nome:n, papel:n===s.lead?'gerente do projeto':'', contato:'' }));
      toast(novos.length?`${novos.length} nome(s) trazidos do Jira — preencha o papel e salve.`:'Todo mundo que tem esforço no Jira já está no time.',novos.length?'ok':'warn'); renderPortal(); }); return; }
  // 📋 conteúdo
  if(t.hasAttribute('data-pt-novo-tipo')){ st.novo=ptItemNovo(t.getAttribute('data-pt-novo-tipo')); renderPortal(); setTimeout(()=>{ const i=document.querySelector('[data-pt-novo="titulo"]'); if(i) i.focus(); },0); return; }
  if(t.id==='pt-novo-cancelar'){ st.novo=null; renderPortal(); return; }
  if(t.id==='pt-novo-salvar'){ const n=st.novo; if(!n) return; const fb=document.getElementById('pt-novo-fb'); const diz=(m)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb err'; fb.textContent=m; } };
    if(!String(n.titulo||'').trim()) { diz(n.tipo==='faq'?'Escreva a pergunta.':'Escreva o título.'); return; }
    if(n.tipo==='reuniao'&&!n.inicio){ diz('Informe o início da reunião.'); return; }
    if(n.link&&!pcUrl(n.link)){ diz('Link: use um endereço http(s).'); return; }
    t.disabled=true; ptSalvaItem(K,'criar',n).then(ok=>{ if(!ok) t.disabled=false; }); return; }
  if(t.hasAttribute('data-pt-item-rm')){ const id=t.getAttribute('data-pt-item-rm'); const it=(ptItens(K)||[]).find(x=>x.id===id); if(!it) return;
    if(!confirm(`Apagar "${it.titulo}"? O cliente deixa de ver na hora.`)) return; ptSalvaItem(K,'remover',it); return; }
  if(t.id==='pt-prev-refresh'){ t.disabled=true; pcliApi('admin-refresh',{ qs:'&p='+encodeURIComponent(K) }).then(j=>{ t.disabled=false; if(!j||!j.ok){ toast((j&&j.erro)||'Não consegui atualizar.','err'); return; }
      toast('Cache do portal descartado — a prévia foi recarregada com o Jira de agora.','ok'); const f=document.getElementById('pt-preview'); if(f) f.setAttribute('src',f.getAttribute('src')); }); return; }
});
document.getElementById('conteudo').addEventListener('input',(e)=>{ if(estado.vista!=='portal') return; const t=e.target; if(!t||!t.getAttribute) return;
  if(ptGuardaCampo(t)){ const b=document.getElementById('pt-cal-testar'); if(b) b.textContent=ptRascSujo(ptSt().proj)?'💾 salvar e testar':'testar'; return; }
  const nv=t.getAttribute('data-pt-novo'); if(nv&&ptSt().novo){ ptSt().novo[nv]=t.type==='checkbox'?!!t.checked:((nv==='inicio'||nv==='fim')?ptIsoSP(t.value):String(t.value||'')); } });
document.getElementById('conteudo').addEventListener('change',(e)=>{
  if(estado.vista!=='portal') return; const st=ptSt(); const K=st.proj; const t=e.target; if(!t||!t.getAttribute) return;
  if(t.id==='pt-f-st'){ st.fSt=String(t.value||''); renderPortal(); return; }
  if(ptGuardaCampo(t)){ if(t.getAttribute('data-pt-cfg')==='publicado'&&!ptGestor()) t.checked=!t.checked; const b=document.getElementById('pt-cal-testar'); if(b) b.textContent=ptRascSujo(K)?'💾 salvar e testar':'testar'; return; }
  const nv=t.getAttribute('data-pt-novo'); if(nv&&st.novo){ st.novo[nv]=t.type==='checkbox'?!!t.checked:((nv==='inicio'||nv==='fim')?ptIsoSP(t.value):String(t.value||'')); return; }
  // uma célula da tabela de conteúdo mudou: salva o item inteiro (o servidor valida; erro = volta ao que estava)
  if(t.hasAttribute('data-pt-item')){ if(!ptGestor()) return; const [id,campo]=t.getAttribute('data-pt-item').split('|'); const it=(ptItens(K)||[]).find(x=>x.id===id); if(!it) return;
    const val=t.type==='checkbox'?!!t.checked:String(t.value||'').trim(); const novo={ ...it };
    if(campo==='inicio'||campo==='fim') novo[campo]=val?ptIsoSP(val):''; else if(campo==='ordem') novo.ordem=Number(val)||0; else novo[campo]=val;
    if(JSON.stringify(ptItemCorpo(novo))===JSON.stringify(ptItemCorpo(it))) return;
    ptSalvaItem(K,'editar',novo); return; }
  if(t.hasAttribute('data-pt-dec')){ if(!ptGestor()){ t.checked=!t.checked; return; } const id=t.getAttribute('data-pt-dec'); const vis=!!t.checked;
    pcliApi('admin-decisao',{ corpo:{ id, visivel:vis } }).then(j=>{ if(!j||!j.ok){ toast((j&&j.erro)||'Não consegui mudar a decisão.','err'); t.checked=!vis; return; }
      const l=st.decs[K]; if(Array.isArray(l)){ const d=l.find(x=>x.id===id); if(d) d.visivelCliente=vis; }
      toast(vis?'Decisão visível ao cliente.':'Decisão escondida do cliente.','ok'); const c=ptContratoDe(K); if(c) ptCarregaLista(c.id,true); }); return; }
});
