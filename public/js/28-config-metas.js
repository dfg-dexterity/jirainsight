// Jira Insights · 28 · ⚙️ CONFIGURAÇÃO — metas & ausências (abreMetas), tela Configurações (renderConfig), teste do Teams.

// ---- Metas e ausências ----
function abreMetas(){
  const pessoas=Object.entries(pessoasUnidas()).map(([a,o])=>[a,(o&&o.nome)||a])
    .sort((x,y)=>x[1].localeCompare(y[1],'pt'));
  const optP=pessoas.map(([a,n])=>`<option value="${esc(a)}">${esc(n)}</option>`).join('');
  const nomeDe=(a)=>{ const o=pessoasUnidas()[a]; return (o&&o.nome)||a; };
  const overrides=Object.entries(cfg.metasPessoa);
  const listaM=overrides.length ? overrides.map(([a,h])=>
    `<div class="mt-item"><span>${esc(nomeDe(a))} — <strong>${esc(String(h))}h/dia</strong></span>
       <button class="btn" data-del-meta="${esc(a)}">remover</button></div>`).join('')
    : '<div class="muted small">Nenhuma meta individual (todos usam a meta global).</div>';
  const listaA=(cfg.ausencias||[]).length ? cfg.ausencias.map((x,i)=>
    `<div class="mt-item"><span>${esc(nomeDe(x.a))} — ${esc(x.de)} → ${esc(x.ate)}</span>
       <button class="btn" data-del-aus="${i}">remover</button></div>`).join('')
    : '<div class="muted small">Nenhuma ausência cadastrada.</div>';
  const listaOc=(cfg.ocultos||[]).length ? cfg.ocultos.map((o,i)=>
    `<div class="mt-item"><span>${esc(o.nome||o.a)}</span>
       <button class="btn" data-del-oculto="${i}">reexibir</button></div>`).join('')
    : '<div class="muted small">Nenhum usuário externo ocultado.</div>';
  const listaV=Object.keys(cfg.vigencias||{}).length ? Object.entries(cfg.vigencias).map(([a,v])=>
    `<div class="mt-item"><span>${esc(nomeDe(a))} — ${v.ini?`admissão <strong>${esc(v.ini)}</strong>`:'admissão livre'}${v.fim?` · desligamento <strong>${esc(v.fim)}</strong>`:''}</span>
       <button class="btn" data-del-vig="${escA(a)}">remover</button></div>`).join('')
    : '<div class="muted small">Nenhuma vigência cadastrada (todo o histórico vale para todo mundo).</div>';

  // Feriados do(s) ano(s) abrangidos pelo período atual.
  const metaP=(estado.tempo&&estado.tempo.meta)||{};
  const anosF=new Set();
  if(metaP.startDate&&metaP.endDate){ for(let y=+metaP.startDate.slice(0,4); y<=+metaP.endDate.slice(0,4); y++) anosF.add(y); }
  if(!anosF.size) anosF.add(+hojeSP().slice(0,4));
  const semAbrev=['dom','seg','ter','qua','qui','sex','sáb'];
  const ferLista=[];
  [...anosF].sort().forEach(y=>{ const base=feriadosDoAno(y);
    Object.keys(base).forEach(iso=>{ if(!(cfg.feriadosRemovidos||[]).includes(iso)) ferLista.push([iso, base[iso], false]); }); });
  Object.entries(cfg.feriadosExtra||{}).forEach(([iso,nome])=>{ if(anosF.has(+iso.slice(0,4))) ferLista.push([iso, nome, true]); });
  ferLista.sort((a,b)=> a[0]<b[0]?-1:a[0]>b[0]?1:0);
  const listaF = ferLista.length ? ferLista.map(([iso,nome,extra])=>
    `<div class="mt-item"><span>${esc(iso)} <span class="muted small">(${semAbrev[diaSemana(iso)]})</span> — ${esc(nome)}${extra?' <span class="muted small">· personalizado</span>':''}</span>
       <button class="btn" data-del-fer="${esc(iso)}">remover</button></div>`).join('')
    : '<div class="muted small">Nenhum feriado para o período.</div>';
  const remF=(cfg.feriadosRemovidos||[]).filter(iso=>anosF.has(+iso.slice(0,4))).sort();
  const listaRem = remF.length ? '<div class="muted small" style="margin-top:8px">Removidos (não contam mais como feriado):</div>'+
    remF.map(iso=>`<div class="mt-item"><span class="muted">${esc(iso)}</span>
       <button class="btn" data-restore-fer="${esc(iso)}">restaurar</button></div>`).join('') : '';
  const anosTxt=[...anosF].sort().join(', ');

  abreModal(`
    <h2>Metas e ausências</h2>
    <div class="muted small">${cfgShared
      ? '✓ Configuração compartilhada com o time (salva no servidor).'
      : 'Salva só neste navegador. Para valer para o time, configure o servidor (Supabase) — veja instruções.'}</div>

    <div class="mt-sec">
      <h3>Meta global por dia útil</h3>
      <div class="mt-form">
        <div class="campo"><label>Horas/dia</label>
          <input type="number" id="mt-global" min="0" max="24" step="0.5" value="${esc(String(cfg.metaGlobalH))}"></div>
        <button class="btn" id="mt-save-global">Salvar meta global</button>
      </div>
    </div>

    <div class="mt-sec">
      <h3>Meta individual (sobrepõe a global)</h3>
      ${listaM}
      <div class="mt-form">
        <div class="campo"><label>Pessoa</label><select id="mt-meta-pessoa">${optP}</select></div>
        <div class="campo"><label>Horas/dia</label>
          <input type="number" id="mt-meta-h" min="0" max="24" step="0.5" value="6"></div>
        <button class="btn" id="mt-add-meta">Adicionar</button>
      </div>
    </div>

    <div class="mt-sec">
      <h3>Ausências (férias/folga — não contam como atraso)</h3>
      ${listaA}
      <div class="mt-form">
        <div class="campo"><label>Pessoa</label><select id="mt-aus-pessoa">${optP}</select></div>
        <div class="campo"><label>De</label><input type="date" id="mt-aus-de"></div>
        <div class="campo"><label>Até</label><input type="date" id="mt-aus-ate"></div>
        <button class="btn" id="mt-add-aus">Adicionar</button>
      </div>
    </div>

    <div class="mt-sec">
      <h3>🪪 Vigência na empresa (admissão/desligamento)</h3>
      <div class="muted small">Os relatórios passam a considerar o período em que a pessoa <strong>está na empresa</strong>:
        antes da admissão e depois do desligamento ela <strong>não é cobrada</strong> (meta, lacunas e scoreboard tratam como ausência)
        e <strong>some das visões</strong> de períodos em que não tem horas. O histórico anterior fica intacto — nada é apagado.
        Deixe um campo vazio quando não se aplica (ex.: só desligamento).</div>
      ${listaV}
      <div class="mt-form">
        <div class="campo"><label>Pessoa</label><select id="mt-vig-pessoa">${optP}</select></div>
        <div class="campo"><label>Admissão</label><input type="date" id="mt-vig-ini"></div>
        <div class="campo"><label>Desligamento</label><input type="date" id="mt-vig-fim"></div>
        <button class="btn" id="mt-add-vig">Salvar vigência</button>
      </div>
    </div>

    <div class="mt-sec">
      <h3>Usuários externos (ocultar do time)</h3>
      <div class="muted small">Pessoas marcadas aqui <strong>não aparecem em nenhuma visão</strong> (ranking, timesheet, resumo, seletores). Use para colaboradores/clientes externos. Vale para o time todo quando a config é compartilhada.</div>
      ${listaOc}
      <div class="mt-form">
        <div class="campo"><label>Pessoa</label><select id="mt-oc-pessoa">${optP}</select></div>
        <button class="btn" id="mt-add-oculto">Ocultar pessoa</button>
      </div>
    </div>

    <div class="mt-sec">
      <h3>Feriados nacionais — ${esc(anosTxt)}</h3>
      <div class="muted small">Não contam como dia útil no timesheet/ranking. Remova os facultativos (Carnaval/Corpus Christi) se o time trabalha nesses dias, ou adicione feriados municipais/estaduais.</div>
      ${listaF}
      ${listaRem}
      <div class="mt-form">
        <div class="campo"><label>Data</label><input type="date" id="mt-fer-data"></div>
        <div class="campo"><label>Nome (opcional)</label><input type="text" id="mt-fer-nome" placeholder="Feriado municipal"></div>
        <button class="btn" id="mt-add-fer">Adicionar feriado</button>
      </div>
    </div>

    <div class="mt-sec">
      <h3>📣 Ranking diário no Teams — horário do envio</h3>
      <div class="muted small">O robô verifica <strong>a cada 30 minutos</strong> nos dias úteis e envia o ranking
        ao canal <strong>a partir do horário escolhido</strong> (envia 1× por dia; sai em até ~30 min após a hora).
        Vale para o time (config compartilhada). Requer o webhook do Teams configurado na Vercel.</div>
      <div class="mt-form">
        <div class="campo" style="max-width:160px"><label>Enviar às</label>
          <select id="mt-teams-hora">${(()=>{ const cur=/^\d{2}:\d{2}$/.test(cfg.teamsHora||'')?cfg.teamsHora:'08:00'; const ops=[];
            for(let h=6;h<=20;h++) for(const m of ['00','30']){ const v=String(h).padStart(2,'0')+':'+m;
              ops.push(`<option value="${v}" ${v===cur?'selected':''}>${v}</option>`); }
            return ops.join(''); })()}</select></div>
      </div>
    </div>
  `);
}

// ---------------- ⚙️ Central de configurações ----------------
// Reúne TODAS as configurações da ferramenta numa tela só: envios ao Teams
// (ranking + resumo IA), metas/ausências/feriados, pessoas, projetos, custos,
// travas, identidade, auditoria. Tudo salvo na config compartilhada (salvaCfg).
function cfgResumoTeams(){ return Object.assign({ ativo:false, freq:'semanal', dia:5, hora:'17:00' }, cfg.teamsResumo||{}); }
function optsHora(cur){ const ops=[];
  for(let h=6;h<=20;h++) for(const m of ['00','30']){ const v=String(h).padStart(2,'0')+':'+m;
    ops.push(`<option value="${v}" ${v===cur?'selected':''}>${v}</option>`); }
  return ops.join(''); }
function renderConfig(){
  const cont=document.getElementById('conteudo');
  const id=idApontar();
  const r=cfgResumoTeams();
  const horaRank=/^\d{2}:\d{2}$/.test(cfg.teamsHora||'')?cfg.teamsHora:'08:00';
  const nMetas=Object.keys(cfg.metasPessoa||{}).length, nAus=(cfg.ausencias||[]).length,
    nOc=(cfg.ocultos||[]).length, nFer=Object.keys(cfg.feriadosExtra||{}).length+(cfg.feriadosRemovidos||[]).length,
    nCat=Object.keys(cfg.projTipos||{}).length, nCusto=Object.keys(cfg.custosPessoa||{}).length,
    nTravas=Object.keys(cfg.alocTravas||{}).length, nAud=(cfg.auditoria||[]).length,
    nPlanejadas=(cfg.pessoasPlanejadas||[]).length, nTpl=(cfg.planTemplates||[]).length;
  const chip=(v,l)=>`<span class="cfgc-chip"><b>${esc(String(v))}</b> ${esc(l)}</span>`;
  const diasSem=[[1,'segunda-feira'],[2,'terça-feira'],[3,'quarta-feira'],[4,'quinta-feira'],[5,'sexta-feira']];

  cont.replaceChildren(el(`<div>
    <div class="card full">
      <h2>⚙️ Central de configurações <span>todas as configurações da ferramenta num só lugar</span></h2>
      <div class="pl-dica">${cfgShared
        ?'✓ Configuração <strong>compartilhada com o time</strong> — o que você mudar aqui vale para todos.'
        :'⚠ Sem servidor de config (Supabase): as mudanças valem <strong>só neste navegador</strong>.'}</div>
    </div>
    <div class="cfgc-grid">

      <div class="card cfgc">
        <h2>📣 Envios automáticos ao Teams</h2>
        <div class="cfgc-sec">
          <h3>📊 Ranking diário de apontamento</h3>
          <div class="muted small">Enviado <strong>1× por dia útil</strong> ao canal, a partir do horário escolhido (o robô confere a cada 30 min).</div>
          <div class="mt-form" style="margin-top:8px">
            <div class="campo" style="max-width:140px"><label>Enviar às</label><select id="cf-teams-hora">${optsHora(horaRank)}</select></div>
            <button class="btn" id="cf-teste-rank" data-tip="Gera o cartão do ranking sem enviar (prévia técnica)">🧪 Testar (sem enviar)</button>
          </div>
        </div>
        <div class="cfgc-sec">
          <h3>🧠 Resumo das atividades (IA)</h3>
          <div class="muted small">O mesmo resumo da aba <strong>Análise → Resumo</strong>, gerado por IA no servidor e enviado ao canal —
            geral do time + 1 parágrafo por pessoa. Requer <code>ANTHROPIC_API_KEY</code> e <code>TEAMS_WEBHOOK_URL</code> na Vercel.</div>
          <label class="cfgc-tog"><input type="checkbox" id="cf-res-ativo" ${r.ativo?'checked':''}> <strong>Enviar automaticamente</strong></label>
          <div class="mt-form">
            <div class="campo"><label>Frequência</label>
              <select id="cf-res-freq" ${r.ativo?'':'disabled'}>
                <option value="semanal" ${r.freq!=='diario'?'selected':''}>Semanal (últimos 7 dias)</option>
                <option value="diario" ${r.freq==='diario'?'selected':''}>Diária (último dia útil)</option>
              </select></div>
            <div class="campo" id="cf-res-dia-wrap" ${r.freq==='diario'?'hidden':''}><label>Dia do envio</label>
              <select id="cf-res-dia" ${r.ativo?'':'disabled'}>${diasSem.map(([v,l])=>`<option value="${v}" ${Number(r.dia||5)===v?'selected':''}>${l}</option>`).join('')}</select></div>
            <div class="campo" style="max-width:140px"><label>Enviar às</label>
              <select id="cf-res-hora" ${r.ativo?'':'disabled'}>${optsHora(/^\d{2}:\d{2}$/.test(r.hora||'')?r.hora:'17:00')}</select></div>
            <button class="btn" id="cf-teste-res" data-tip="Gera o resumo por IA sem enviar — pode levar ~1 min">🧪 Testar (sem enviar)</button>
          </div>
        </div>
        <div class="ap-fb" id="cf-fb" hidden style="margin-top:10px"></div>
      </div>

      <div class="card cfgc">
        <h2>📋 Meu Planejamento — gestores</h2>
        <div class="cfgc-sec">
          <h3>Quem aprova os planejamentos semanais</h3>
          <div class="muted small">Um por linha: <strong>e-mail do Jira</strong> ou <strong>accountId</strong>.
            Gestores veem as abas <strong>Aprovações</strong> e <strong>Relatórios</strong> no Meu Planejamento e decidem os envios do time.
            ${(cfg.gestores||[]).length?'':'<br>⚠ Sem ninguém configurado, vale a regra antiga (usuário com "diego" no nome/e-mail).'}</div>
          <textarea id="cf-gestores" class="pl-texto" style="min-height:90px;margin-top:8px" placeholder="ana@empresa.com.br&#10;712020:abcd-…">${esc((cfg.gestores||[]).map(g=>String((g&&(g.a||g.email))||g||'')).join('\n'))}</textarea>
          <div style="margin-top:8px"><button class="btn primario" id="cf-gestores-salvar">Salvar gestores</button></div>
        </div>
      </div>

      <div class="card cfgc">
        <h2>🎯 Prioridades do time</h2>
        <div class="cfgc-sec">
          <h3>Reunião semanal e painel</h3>
          <div class="muted small">Facilitador(a) — aparece no cabeçalho e conduz o Modo reunião.</div>
          <input id="cf-reu-facil" class="pl-texto" style="margin-top:6px" maxlength="80" value="${escA(prCfg().facilitador||'')}">
          <div class="muted small" style="margin-top:10px">Status que contam como <strong>aguardando decisão</strong> (um por linha) — além deles, a label <code>aguardando-decisao</code> sempre vale.</div>
          <textarea id="cf-reu-status" class="pl-texto" style="min-height:80px;margin-top:6px">${esc((prCfg().statusDecisao||[]).join('\n'))}</textarea>
          <div class="muted small" style="margin-top:10px">Natureza do trabalho por categoria do Jira — <code>PREFIXO=natureza</code> (naturezas: entrega, operacao, produtos, rotinas, outros).</div>
          <textarea id="cf-reu-nat" class="pl-texto" style="min-height:90px;margin-top:6px">${esc(Object.entries(prCfg().mapaNatureza||{}).map(([k,v])=>`${k}=${v}`).join('\n'))}</textarea>
          <div class="muted small" style="margin-top:10px">Página do projeto no Notion — <code>CHAVE=url</code> (ex.: <code>FDFR=https://…</code>).</div>
          <textarea id="cf-reu-notion" class="pl-texto" style="min-height:70px;margin-top:6px" placeholder="FDFR=https://www.notion.so/…">${esc(Object.entries(prCfg().notionPorProjeto||{}).map(([k,v])=>`${k}=${v}`).join('\n'))}</textarea>
          <div class="muted small" style="margin-top:10px"><strong>Resumo periódico no Teams</strong> — cartão "🎯 Prioridades da semana" no canal, pelo agendador que já existe.</div>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:6px">
            <label class="check"><input type="checkbox" id="cf-reu-tativo" ${(prCfg().envioTeams||{}).ativo?'checked':''}> ativo</label>
            ${['seg','ter','qua','qui','sex'].map((d,i)=>`<label class="check"><input type="checkbox" data-cf-reu-dia="${i+1}" ${((prCfg().envioTeams||{}).dias||[]).map(Number).includes(i+1)?'checked':''}> ${d}</label>`).join('')}
            <label class="muted small">hora <input id="cf-reu-thora" type="time" value="${escA((prCfg().envioTeams||{}).hora||'09:00')}"></label>
          </div>
          <div style="margin-top:10px"><button class="btn primario" id="cf-reuniao-salvar">Salvar Prioridades do time</button></div>
        </div>
      </div>

      <div class="card cfgc">
        <h2>🎯 Metas, ausências &amp; feriados</h2>
        <div class="cfgc-chips">${chip(cfg.metaGlobalH+'h','meta global/dia')}${chip(nMetas,'metas individuais')}${chip(nAus,'ausências')}${chip(nFer,'feriados ajustados')}</div>
        <div class="muted small">Meta de horas por dia útil (global e por pessoa), férias/folgas e o calendário de feriados usados no Timesheet, Ranking e envios ao Teams.</div>
        <div style="margin-top:10px"><button class="btn primario" id="cf-abrir-metas">Abrir Metas &amp; ausências</button></div>
      </div>

      <div class="card cfgc">
        <h2>👥 Pessoas</h2>
        <div class="cfgc-chips">${chip(nOc,'ocultas (externas)')}${chip(nPlanejadas,'planejadas 🔮')}${chip(nCusto,'com custo/h')}</div>
        <div class="muted small">Usuários externos ocultos das visões (em Metas &amp; ausências), pessoas ainda não contratadas (planejamento 🔮) e o custo/hora de cada um (manual ou importado do Odoo).</div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="cf-abrir-metas-oc">Ocultar/reexibir pessoas</button>
          <button class="btn" data-cf-aloc="acontratar">Pessoas planejadas 🔮</button>
          <button class="btn" data-cf-aloc="relatorios">Custos por pessoa (R$/h)</button>
        </div>
      </div>

      <div class="card cfgc">
        <h2>🧱 Projetos &amp; categorias</h2>
        <div class="cfgc-chips">${chip(nCat,'projetos com categoria definida')}</div>
        <div class="muted small">A categoria de cada projeto (faturável, interno, investimento…) usada na Alocação e nos relatórios — definida <strong>por projeto</strong>, numa tela própria.</div>
        <div style="margin-top:10px"><button class="btn" data-cf-aloc="projetos">Abrir categorias por projeto</button></div>
      </div>

      <div class="card cfgc">
        <h2>🔒 Travas de alocação</h2>
        <div class="cfgc-chips">${chip(nTravas,'alocações travadas')}</div>
        <div class="muted small">Alocações travadas por pessoa aguardam a <strong>aprovação do Diego</strong> para serem alteradas. A trava é aplicada na própria tela de Alocação.</div>
        <div style="margin-top:10px"><button class="btn" data-cf-aloc="pessoa">Abrir Alocação</button></div>
      </div>

      <div class="card cfgc">
        <h2>🔑 Identidade no Jira (apontar/criar)</h2>
        <div class="muted small">${id
          ?`Identificado como <strong>${esc(id.nome||id.email)}</strong> <span class="muted">(${esc(id.email||'')})</span> — usado para apontar horas, criar tickets e transições, sempre <strong>no seu usuário</strong>. O token fica salvo só neste navegador.`
          :'Você ainda não se identificou neste navegador. A identificação (e-mail + token de API do Jira) é usada para apontar horas e criar tickets no seu usuário.'}</div>
        <div style="margin-top:10px"><button class="btn ${id?'':'primario'}" data-ap-act="${id?'trocar-id':'config-id'}">${id?'Trocar usuário':'Identificar-se'}</button></div>
      </div>

      <div class="card cfgc">
        <h2>🗒 Auditoria &amp; templates</h2>
        <div class="cfgc-chips">${chip(nAud,'ações registradas')}${chip(nTpl,'templates de planejamento')}</div>
        <div class="muted small">Histórico das ações feitas pelo painel (compartilhado, últimas 300) e os templates salvos da Criação de Ticket.</div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="cf-abrir-log">Ver histórico de ações</button>
          <button class="btn" data-goto="planejar">Abrir Criação de Ticket</button>
        </div>
      </div>

      <div class="card cfgc">
        <h2>🤖 IA &amp; integrações (servidor)</h2>
        <div class="muted small">Configuradas por variáveis de ambiente na <strong>Vercel</strong> (um administrador):<br>
          · <code>ANTHROPIC_API_KEY</code> — resumo de atividades e Qualidade (IA)<br>
          · <code>TEAMS_WEBHOOK_URL</code> — envios ao canal do Teams<br>
          · <code>TEAMS_DM_WEBHOOK_URL</code> — aviso <strong>individual</strong> (chat privado) dos convites de reunião; fluxo do Power Automate que lê <code>email</code>/<code>texto</code> do corpo<br>
          · <code>JIRA_EMAIL/JIRA_API_TOKEN</code> e <code>CLOCKWORK_API_TOKEN</code> — leituras (conta de serviço)<br>
          · <code>SUPABASE_URL/SUPABASE_ANON_KEY</code> — config compartilhada<br>
          · <code>ODOO_URL/ODOO_DB/ODOO_LOGIN/ODOO_API_KEY</code> — custos e folgas<br>
          · <code>QUALIDADE_URL</code> — página de boas práticas (padrão: <a href="https://dexterityitsolutions.notion.site/TI-04-006-Boas-Praticas-de-Cria-o-de-itens-do-Ticket-do-JIRA-2c7c69371e17803a9650c3e391599385" target="_blank" rel="noopener">TI-04-006 ↗</a>)</div>
      </div>

    </div>
  </div>`));
}
// Prévia dos envios ao Teams (?dry=1 gera o cartão sem enviar).
async function testaTeams(resumo){
  const fb=document.getElementById('cf-fb');
  const mostra=(cls,msg)=>{ if(fb){ fb.hidden=false; fb.className='ap-fb'+(cls?' '+cls:''); fb.textContent=msg; } };
  mostra('', resumo?'Gerando o resumo por IA (prévia, sem enviar)… pode levar ~1 min.':'Gerando o cartão do ranking (prévia, sem enviar)…');
  try{
    const j=await fetch('/api/teams?dry=1'+(resumo?'&tipo=resumo':'')).then(x=>x.json());
    if(j&&j.dry) mostra('ok',`✓ Cartão gerado com sucesso ${resumo?`(período ${j.de} → ${j.ate})`:`(dia ${j.dia})`} — o envio real acontece no horário agendado.`);
    else mostra('err','Falha: '+((j&&j.erro)||'resposta inesperada do servidor')+
      (/utorizad/.test(String((j&&j.erro)||''))?' (CRON_SECRET ativo bloqueia o teste manual)':''));
  }catch(e){ mostra('err','Erro de rede: '+(e.message||e)); }
}
document.getElementById('conteudo').addEventListener('click',(e)=>{
  const t=e.target.closest&&e.target.closest('button'); if(!t) return;
  if(t.hasAttribute('data-rk-aba')){ estado.ranking=estado.ranking||{};
    estado.ranking.aba=t.getAttribute('data-rk-aba'); renderRanking(); }
  else if(t.hasAttribute('data-rk-faixa')){ estado.ranking.faixa=t.getAttribute('data-rk-faixa'); escondeTip(); renderRanking(); }
  else if(t.hasAttribute('data-rk-refaixa')){ const fx=t.getAttribute('data-rk-refaixa');
    delete estado.ranking.tempoPer[fx]; renderRanking(); }
  else if(t.hasAttribute('data-sc-gran')){ estado.ranking=estado.ranking||{};
    estado.ranking.scGran=t.getAttribute('data-sc-gran'); escondeTip(); renderRanking(); }
  else if(t.id==='cf-abrir-metas'||t.id==='cf-abrir-metas-oc'){ abreMetas(); }
  else if(t.id==='cf-abrir-log'){ abreLogAcoes(); }
  else if(t.hasAttribute('data-cf-aloc')){ const v=t.getAttribute('data-cf-aloc');
    estado.alocacao=estado.alocacao||{}; estado.alocacao.visao=v;
    try{ if(typeof alocUISave==='function') alocUISave(); }catch(err){}
    vaiPara('alocacao'); }
  else if(t.id==='cf-teste-rank'){ testaTeams(false); }
  else if(t.id==='cf-gestores-salvar'){
    const linhas=((document.getElementById('cf-gestores')||{}).value||'').split('\n')
      .map(x=>x.trim()).filter(Boolean).slice(0,30);
    cfg.gestores=linhas; salvaCfg();
    toast(linhas.length?`✓ ${linhas.length} gestor(es) do planejamento salvos.`:'Lista de gestores esvaziada — vale a regra antiga (nome/e-mail com "diego").','ok');
    renderConfig(); }
  else if(t.id==='cf-reuniao-salvar'){
    const r2=prCfg();
    r2.facilitador=((document.getElementById('cf-reu-facil')||{}).value||'').trim().slice(0,80);
    r2.statusDecisao=((document.getElementById('cf-reu-status')||{}).value||'').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,15);
    const nat={}; ((document.getElementById('cf-reu-nat')||{}).value||'').split('\n').forEach(l=>{
      const kv=l.split('='); if(kv[0]&&kv[1]&&['entrega','operacao','produtos','rotinas','outros'].includes(kv[1].trim())) nat[kv[0].trim()]=kv[1].trim(); });
    if(Object.keys(nat).length) r2.mapaNatureza=nat;
    const np={}; ((document.getElementById('cf-reu-notion')||{}).value||'').split('\n').forEach(l=>{
      const i2=l.indexOf('='); if(i2>0){ const k=l.slice(0,i2).trim().toUpperCase(); const v=l.slice(i2+1).trim();
        if(/^[A-Z][A-Z0-9_]*$/.test(k)&&/^https:\/\//.test(v)) np[k]=v.slice(0,300); } });
    r2.notionPorProjeto=np;
    r2.envioTeams={ ativo:!!((document.getElementById('cf-reu-tativo')||{}).checked),
      dias:[...document.querySelectorAll('[data-cf-reu-dia]')].filter(x=>x.checked).map(x=>Number(x.getAttribute('data-cf-reu-dia'))),
      hora:/^\d{2}:\d{2}$/.test(((document.getElementById('cf-reu-thora')||{}).value||''))?document.getElementById('cf-reu-thora').value:'09:00' };
    cfg.reuniao=r2; salvaCfg();
    toast('✓ Configuração do Prioridades do time salva.','ok'); renderConfig(); }
  else if(t.id==='cf-teste-res'){ testaTeams(true); }
});
document.getElementById('conteudo').addEventListener('change',(e)=>{
  const t=e.target; if(!t||!t.id||!t.id.startsWith('cf-')) return;
  if(t.id==='cf-teams-hora'){ if(/^\d{2}:\d{2}$/.test(t.value)){ cfg.teamsHora=t.value; salvaCfg();
    toast(`📣 Ranking no Teams: envio a partir das ${t.value}.`,'ok'); } }
  else if(t.id==='cf-res-ativo'){ const r=cfgResumoTeams(); r.ativo=!!t.checked; cfg.teamsResumo=r; salvaCfg();
    toast(r.ativo?'🧠 Resumo IA no Teams: ATIVADO.':'Resumo IA no Teams: desativado.','ok'); renderConfig(); }
  else if(t.id==='cf-res-freq'){ const r=cfgResumoTeams(); r.freq=(t.value==='diario'?'diario':'semanal'); cfg.teamsResumo=r; salvaCfg(); renderConfig(); }
  else if(t.id==='cf-res-dia'){ const r=cfgResumoTeams(); r.dia=Math.min(5,Math.max(1,Number(t.value)||5)); cfg.teamsResumo=r; salvaCfg(); }
  else if(t.id==='cf-res-hora'){ if(/^\d{2}:\d{2}$/.test(t.value)){ const r=cfgResumoTeams(); r.hora=t.value; cfg.teamsResumo=r; salvaCfg(); } }
});

