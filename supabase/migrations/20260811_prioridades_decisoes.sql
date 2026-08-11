-- 🎯 Prioridades do time — log de decisões e próximas ações da reunião semanal.
-- Aplicada em 2026-08-11 via MCP (apply_migration jirainsight_prioridades_decisoes).
-- Mesma postura das demais tabelas do app: RLS ligado com policies permissivas
-- para o role public, porque a chave ANON vive SÓ no servidor (Vercel) e a
-- autorização real acontece na camada da API (token do Jira validado por
-- requisição). Sem policy de DELETE: a API não apaga decisões (revoga por status).
create table if not exists public.jirainsight_decisoes (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  decisao text not null,
  tipo text not null default 'decisao',            -- decisao | proxima-acao
  status text not null default 'aberta',           -- aberta | concluida | reprazada | escalada | revogada
  reprazos integer not null default 0,
  dono_account_id text not null default '',
  dono_nome text not null default '',
  prazo date,
  ticket text not null default '',                 -- chave Jira (ex.: CCDV-2)
  projeto text not null default '',                -- chave do projeto (ex.: CCDV)
  contexto text not null default '',
  ata_url text not null default '',
  decidido_em date,
  registrado_por text not null default ''          -- accountId validado de quem registrou
);
create index if not exists ji_dec_status_prazo on public.jirainsight_decisoes (status, prazo);
create index if not exists ji_dec_projeto on public.jirainsight_decisoes (projeto);
alter table public.jirainsight_decisoes enable row level security;
drop policy if exists jdec_select on public.jirainsight_decisoes;
drop policy if exists jdec_insert on public.jirainsight_decisoes;
drop policy if exists jdec_update on public.jirainsight_decisoes;
create policy jdec_select on public.jirainsight_decisoes for select to public using (true);
create policy jdec_insert on public.jirainsight_decisoes for insert to public with check (true);
create policy jdec_update on public.jirainsight_decisoes for update to public using (true);
