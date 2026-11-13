-- =====================================================================
-- HRM 노무관리파트 업무포털 — portal_* tables (separate from the 근로감독 대시보드 tables)
-- Permission levels: none < read < write < edit < manage
-- Keys: admin, home.org, home.calendar, home.faq, <category>.<menu>  (e.g. att.manual)
-- =====================================================================
create table if not exists public.portal_access (
  email text primary key,
  name text,
  team text,
  perms jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.portal_access enable row level security;

create or replace function public.portal_level(k text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(greatest(
           case when lvl_rank(a.perms->>'admin') >= 4 then 4 else 0 end,
           lvl_rank(a.perms->>k))), 0)
  from portal_access a where lower(a.email) = my_email()
$$;
create or replace function public.portal_has(k text, need text) returns boolean
language sql stable security definer set search_path = public as $$
  select portal_level(k) >= lvl_rank(need) and lvl_rank(need) > 0
$$;
create or replace function public.portal_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from portal_access a where lower(a.email) = my_email())
$$;

drop policy if exists pa_select on public.portal_access;
create policy pa_select on public.portal_access for select to authenticated
  using (lower(email) = my_email() or portal_has('admin','manage'));
drop policy if exists pa_write on public.portal_access;
create policy pa_write on public.portal_access for all to authenticated
  using (portal_has('admin','manage')) with check (portal_has('admin','manage'));

-- staff list used for 업무분장 담당자 selection (names; accounts optional)
create table if not exists public.portal_staff (
  name text primary key,
  team text,
  email text,
  sort int not null default 0,
  active boolean not null default true
);
alter table public.portal_staff enable row level security;
drop policy if exists ps_select on public.portal_staff;
create policy ps_select on public.portal_staff for select to authenticated using (portal_member());
drop policy if exists ps_write on public.portal_staff;
create policy ps_write on public.portal_staff for all to authenticated
  using (portal_has('home.org','edit')) with check (portal_has('home.org','edit'));

-- 업무분장
create table if not exists public.portal_org (
  id serial primary key,
  grp text not null,
  sort int not null default 0,
  title text not null,
  hrm text,
  main_name text,
  sub_name text,
  units jsonb not null default '{}'::jsonb,
  note text,
  detail_html text,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.portal_org enable row level security;
drop policy if exists po_select on public.portal_org;
create policy po_select on public.portal_org for select to authenticated using (portal_has('home.org','read'));
drop policy if exists po_update on public.portal_org;
create policy po_update on public.portal_org for update to authenticated
  using (portal_has('home.org','edit')) with check (portal_has('home.org','edit'));
drop policy if exists po_insert on public.portal_org;
create policy po_insert on public.portal_org for insert to authenticated with check (portal_has('home.org','edit'));
drop policy if exists po_delete on public.portal_org;
create policy po_delete on public.portal_org for delete to authenticated using (portal_has('home.org','manage'));

-- 연간 계획 캘린더 (repeat: once | monthly | quarterly | yearly)
create table if not exists public.portal_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_date date not null,
  end_date date,
  repeat text not null default 'once',
  repeat_until date,
  category text,
  owner_name text,
  note text,
  done_keys jsonb not null default '{}'::jsonb,
  created_by text default my_email(),
  created_at timestamptz not null default now()
);
alter table public.portal_events enable row level security;
drop policy if exists pe_select on public.portal_events;
create policy pe_select on public.portal_events for select to authenticated using (portal_has('home.calendar','read'));
drop policy if exists pe_write on public.portal_events;
create policy pe_write on public.portal_events for all to authenticated
  using (portal_has('home.calendar','write')) with check (portal_has('home.calendar','write'));

-- FAQ
create table if not exists public.portal_faq (
  id uuid primary key default gen_random_uuid(),
  category text,
  question text not null,
  answer text,
  kind text,
  asked_on date,
  sort int not null default 0,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.portal_faq enable row level security;
drop policy if exists pf_select on public.portal_faq;
create policy pf_select on public.portal_faq for select to authenticated using (portal_has('home.faq','read'));
drop policy if exists pf_write on public.portal_faq;
create policy pf_write on public.portal_faq for all to authenticated
  using (portal_has('home.faq','write')) with check (portal_has('home.faq','write'));

-- 카테고리 매뉴얼 문서 (cat.menu 권한)
create table if not exists public.portal_pages (
  id text primary key,
  cat text not null,
  menu text not null,
  grp text not null,
  grp_sort int not null default 0,
  sort int not null default 0,
  title text not null,
  lead text,
  body_html text,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.portal_pages enable row level security;
drop policy if exists pp_select on public.portal_pages;
create policy pp_select on public.portal_pages for select to authenticated using (portal_has(cat || '.' || menu, 'read'));
drop policy if exists pp_update on public.portal_pages;
create policy pp_update on public.portal_pages for update to authenticated
  using (portal_has(cat || '.' || menu, 'edit')) with check (portal_has(cat || '.' || menu, 'edit'));
drop policy if exists pp_insert on public.portal_pages;
create policy pp_insert on public.portal_pages for insert to authenticated with check (portal_has(cat || '.' || menu, 'manage'));
drop policy if exists pp_delete on public.portal_pages;
create policy pp_delete on public.portal_pages for delete to authenticated using (portal_has(cat || '.' || menu, 'manage'));

-- 카테고리 관리표 (근태 위반자 관리, 근무형태 현황 등)
create table if not exists public.portal_records (
  id uuid primary key default gen_random_uuid(),
  cat text not null,
  menu text not null,
  data jsonb not null default '{}'::jsonb,
  created_by text default my_email(),
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.portal_records enable row level security;
drop policy if exists pr_select on public.portal_records;
create policy pr_select on public.portal_records for select to authenticated using (portal_has(cat || '.' || menu, 'read'));
drop policy if exists pr_insert on public.portal_records;
create policy pr_insert on public.portal_records for insert to authenticated with check (portal_has(cat || '.' || menu, 'write'));
drop policy if exists pr_update on public.portal_records;
create policy pr_update on public.portal_records for update to authenticated
  using (portal_has(cat || '.' || menu, 'edit') or (portal_has(cat || '.' || menu, 'write') and lower(created_by) = my_email()))
  with check (portal_has(cat || '.' || menu, 'write'));
drop policy if exists pr_delete on public.portal_records;
create policy pr_delete on public.portal_records for delete to authenticated using (portal_has(cat || '.' || menu, 'edit'));

-- 변경 이력
create table if not exists public.portal_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  email text not null default my_email(),
  area text,
  action text,
  detail text
);
alter table public.portal_log enable row level security;
drop policy if exists pl_insert on public.portal_log;
create policy pl_insert on public.portal_log for insert to authenticated with check (portal_member() and lower(email) = my_email());
drop policy if exists pl_select on public.portal_log;
create policy pl_select on public.portal_log for select to authenticated using (portal_has('admin','manage'));

-- first portal administrator (replace with your own email before running)
insert into public.portal_access(email, name, team, perms) values
 ('admin@example.com', '관리자', 'HRM팀 노무관리파트', '{"admin":"manage"}')
on conflict (email) do nothing;
