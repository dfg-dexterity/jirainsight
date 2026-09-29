-- 🌐 Portal do projeto (visão externa para o cliente) — 2026-09-28, a pedido do usuário.
-- Mesma postura das demais tabelas jirainsight_*: RLS ligado com policies permissivas para
-- o role public, porque a chave ANON vive SÓ no servidor (Vercel) e a autorização real
-- acontece na API (sessão do cliente por HMAC; gestor por token do Jira validado a cada
-- pedido). O conteúdo curado do portal fica em tabelas próprias — nunca na config
-- compartilhada (jirainsight_config), que desce inteira para o navegador de todo o time.

create extension if not exists pgcrypto;

-- 1) Contas do cliente (🔐 área do cliente, em produção desde 2026-09-26 sem migração no
--    repositório): o DDL que api/config.js espera (PC_TAB). Idempotente — no projeto onde a
--    tabela já existe, nada muda.
create table if not exists public.jirainsight_portal_contas (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,                      -- sempre normalizado (minúsculas) pela API
  nome text not null default '',
  contrato_id text not null,                       -- id do contrato em cfg.contratos[] — é o ESCOPO
  senha_hash text,                                 -- scrypt$N$r$p$salt$hash; nulo = convite ainda não aceito
  convite_hash text,                               -- sha256 do token do link (o valor cru nunca é gravado)
  convite_exp timestamptz,
  ativo boolean not null default true,
  falhas integer not null default 0,
  bloqueado_ate timestamptz,
  criado_em timestamptz not null default now(),
  criado_por text not null default '',
  ultimo_acesso timestamptz
);
create index if not exists ji_pcontas_contrato on public.jirainsight_portal_contas (contrato_id);
create index if not exists ji_pcontas_convite on public.jirainsight_portal_contas (convite_hash);
alter table public.jirainsight_portal_contas enable row level security;
drop policy if exists jpc_select on public.jirainsight_portal_contas;
drop policy if exists jpc_insert on public.jirainsight_portal_contas;
drop policy if exists jpc_update on public.jirainsight_portal_contas;
drop policy if exists jpc_delete on public.jirainsight_portal_contas;
create policy jpc_select on public.jirainsight_portal_contas for select to public using (true);
create policy jpc_insert on public.jirainsight_portal_contas for insert to public with check (true);
create policy jpc_update on public.jirainsight_portal_contas for update to public using (true) with check (true);
create policy jpc_delete on public.jirainsight_portal_contas for delete to public using (true);   -- "remover" conta

-- 2) Projetos publicados no portal: um por chave Jira, amarrado ao contrato que o cliente
--    enxerga. `config` (jsonb) guarda o que o gestor cura por projeto:
--    { teamsUrl, pasta, calendario /* e-mail da caixa OU GUID do grupo M365 */, links:[{nome,url,tipo}],
--      equipe:[{nome,papel,contato}], epicosOcultos:[KEY-n…], mostrarAta:false,
--      blocos:{progresso,cronograma,pendencias,decisoes,riscos,equipe,reunioes,faq,links}, apresentacao:'' }
--    Nunca se apaga: despublicar é o caminho (publicado=false).
create table if not exists public.jirainsight_portal_projetos (
  id uuid primary key default gen_random_uuid(),
  contrato_id text not null,                       -- id do contrato em cfg.contratos[]
  projeto text not null unique,                    -- chave Jira (^[A-Za-z][A-Za-z0-9_]*$)
  publicado boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por text                              -- e-mail do gestor (validado no Jira)
);
create index if not exists ji_pproj_contrato on public.jirainsight_portal_projetos (contrato_id);
alter table public.jirainsight_portal_projetos enable row level security;
drop policy if exists jpp_select on public.jirainsight_portal_projetos;
drop policy if exists jpp_insert on public.jirainsight_portal_projetos;
drop policy if exists jpp_update on public.jirainsight_portal_projetos;
create policy jpp_select on public.jirainsight_portal_projetos for select to public using (true);
create policy jpp_insert on public.jirainsight_portal_projetos for insert to public with check (true);
create policy jpp_update on public.jirainsight_portal_projetos for update to public using (true) with check (true);

-- 3) Conteúdo curado por projeto: pendências (do cliente ou da Dexterity), riscos, FAQ e
--    reuniões manuais. `visivel` é o interruptor do cliente; `ordem` é a ordem na tela.
create table if not exists public.jirainsight_portal_itens (
  id uuid primary key default gen_random_uuid(),
  projeto text not null,
  tipo text not null check (tipo in ('pendencia','risco','faq','reuniao')),
  titulo text not null,
  descricao text,
  resp_nome text,
  resp_lado text check (resp_lado in ('dexterity','cliente')),
  prazo date,                                      -- pendência
  inicio timestamptz, fim timestamptz, link text,  -- reunião manual
  prob text, impacto text, mitigacao text,         -- risco: alto | medio | baixo
  status text not null default 'aberto',           -- aberto | feito | mitigado | encerrado
  visivel boolean not null default true,
  ordem integer not null default 0,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);
create index if not exists jirainsight_portal_itens_proj on public.jirainsight_portal_itens (projeto, tipo);
alter table public.jirainsight_portal_itens enable row level security;
drop policy if exists jpi2_select on public.jirainsight_portal_itens;
drop policy if exists jpi2_insert on public.jirainsight_portal_itens;
drop policy if exists jpi2_update on public.jirainsight_portal_itens;
drop policy if exists jpi2_delete on public.jirainsight_portal_itens;
create policy jpi2_select on public.jirainsight_portal_itens for select to public using (true);
create policy jpi2_insert on public.jirainsight_portal_itens for insert to public with check (true);
create policy jpi2_update on public.jirainsight_portal_itens for update to public using (true) with check (true);
create policy jpi2_delete on public.jirainsight_portal_itens for delete to public using (true);   -- "remover" item

-- 4) Decisões (🎯 Prioridades): o gestor escolhe, uma a uma, quais o cliente vê.
alter table public.jirainsight_decisoes add column if not exists visivel_cliente boolean not null default false;
create index if not exists ji_dec_visivel on public.jirainsight_decisoes (projeto, visivel_cliente);

-- O cache do payload do cliente (10 min) usa a tabela jirainsight_config já existente, com
-- id = 'portal_<KEY>' e data = {em, dados}; invalidar = regravar com em=0 (insert/update
-- bastam — não depende de policy de delete).
