-- Meu Planejamento (Jira Insight): planejamento semanal por atividade (sem tickets),
-- com fluxo de aprovação, versionamento e histórico para auditoria.
-- Postura de segurança igual às tabelas jirainsight_*: RLS ligado com policies
-- permissivas — a chave anon vive SÓ no servidor (Vercel) e a autorização real
-- (dono do plano / gestor) é feita pela API validando o token do Jira.
-- Aplicada no projeto Supabase em 2026-08-10 (migration jirainsight_meu_planejamento).

create extension if not exists pgcrypto;

create table if not exists jirainsight_plan_semana (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  usuario_nome text not null default '',
  usuario_email text not null default '',
  semana_inicio date not null,
  status text not null default 'elaboracao'
    check (status in ('elaboracao','enviado','aprovado','devolvido')),
  versao int not null default 1,
  total_planejado numeric(8,2) not null default 0,
  enviado_em timestamptz,
  aprovado_em timestamptz,
  aprovado_por text,
  devolvido_em timestamptz,
  devolvido_por text,
  comentario_gestor text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, semana_inicio)
);
create index if not exists ji_plan_semana_semana on jirainsight_plan_semana (semana_inicio);
create index if not exists ji_plan_semana_status on jirainsight_plan_semana (status);

create table if not exists jirainsight_plan_itens (
  id uuid primary key default gen_random_uuid(),
  planejamento_id uuid not null references jirainsight_plan_semana(id) on delete cascade,
  data date not null,
  projeto text not null,
  descricao text not null,
  categoria text not null default '',
  horas_planejadas numeric(6,2) not null check (horas_planejadas > 0),
  observacao text not null default '',
  ordem int not null default 0
);
create index if not exists ji_plan_itens_plan on jirainsight_plan_itens (planejamento_id);

create table if not exists jirainsight_plan_hist (
  id uuid primary key default gen_random_uuid(),
  planejamento_id uuid not null references jirainsight_plan_semana(id) on delete cascade,
  versao int not null,
  acao text not null,
  status_anterior text,
  status_novo text,
  executado_por text not null default '',
  executado_em timestamptz not null default now(),
  comentario text not null default '',
  snapshot jsonb
);
create index if not exists ji_plan_hist_plan on jirainsight_plan_hist (planejamento_id);

alter table jirainsight_plan_semana enable row level security;
alter table jirainsight_plan_itens enable row level security;
alter table jirainsight_plan_hist enable row level security;

drop policy if exists jps_select on jirainsight_plan_semana;
drop policy if exists jps_insert on jirainsight_plan_semana;
drop policy if exists jps_update on jirainsight_plan_semana;
drop policy if exists jps_delete on jirainsight_plan_semana;
create policy jps_select on jirainsight_plan_semana for select using (true);
create policy jps_insert on jirainsight_plan_semana for insert with check (true);
create policy jps_update on jirainsight_plan_semana for update using (true) with check (true);
create policy jps_delete on jirainsight_plan_semana for delete using (true);

drop policy if exists jpi_select on jirainsight_plan_itens;
drop policy if exists jpi_insert on jirainsight_plan_itens;
drop policy if exists jpi_update on jirainsight_plan_itens;
drop policy if exists jpi_delete on jirainsight_plan_itens;
create policy jpi_select on jirainsight_plan_itens for select using (true);
create policy jpi_insert on jirainsight_plan_itens for insert with check (true);
create policy jpi_update on jirainsight_plan_itens for update using (true) with check (true);
create policy jpi_delete on jirainsight_plan_itens for delete using (true);

drop policy if exists jph_select on jirainsight_plan_hist;
drop policy if exists jph_insert on jirainsight_plan_hist;
create policy jph_select on jirainsight_plan_hist for select using (true);
create policy jph_insert on jirainsight_plan_hist for insert with check (true);
