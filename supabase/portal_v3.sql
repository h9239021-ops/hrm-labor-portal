-- =====================================================================
-- 업무포털 v3: 근태 위반자 관리 (자동 필터링 월별 결과 · 설정 · 메일 기록 · 원본 파일 버킷)
-- portal_* 객체와 portal-files 버킷만 추가합니다. 근로감독 대시보드 객체는 건드리지 않습니다.
-- =====================================================================
create table if not exists public.portal_att_months (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null,
  site text not null,
  params jsonb not null default '{}'::jsonb,
  late jsonb not null default '[]'::jsonb,
  missing jsonb not null default '[]'::jsonb,
  under jsonb not null default '[]'::jsonb,
  over jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  saved_by text default my_email(),
  saved_at timestamptz not null default now(),
  unique (year, month, site)
);
alter table public.portal_att_months enable row level security;
drop policy if exists pam_select on public.portal_att_months;
create policy pam_select on public.portal_att_months for select to authenticated using (portal_has('att.violations','read'));
drop policy if exists pam_insert on public.portal_att_months;
create policy pam_insert on public.portal_att_months for insert to authenticated with check (portal_has('att.violations','write'));
drop policy if exists pam_update on public.portal_att_months;
create policy pam_update on public.portal_att_months for update to authenticated using (portal_has('att.violations','write')) with check (portal_has('att.violations','write'));
drop policy if exists pam_delete on public.portal_att_months;
create policy pam_delete on public.portal_att_months for delete to authenticated using (portal_has('att.violations','edit'));

create table if not exists public.portal_att_settings (
  key text primary key,
  value jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);
alter table public.portal_att_settings enable row level security;
drop policy if exists pas_select on public.portal_att_settings;
create policy pas_select on public.portal_att_settings for select to authenticated using (portal_has('att.violations','read'));
drop policy if exists pas_write on public.portal_att_settings;
create policy pas_write on public.portal_att_settings for all to authenticated using (portal_has('att.violations','write')) with check (portal_has('att.violations','write'));

create table if not exists public.portal_att_mails (
  id uuid primary key default gen_random_uuid(),
  quarter text not null,
  name text not null,
  email text,
  kind text,
  record_id uuid,
  subject text,
  body text,
  status text not null default '초안',
  sent_at timestamptz,
  sent_by text,
  replied_at timestamptz,
  reply_note text,
  created_by text default my_email(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.portal_att_mails enable row level security;
drop policy if exists pml_select on public.portal_att_mails;
create policy pml_select on public.portal_att_mails for select to authenticated using (portal_has('att.violations','read'));
drop policy if exists pml_write on public.portal_att_mails;
create policy pml_write on public.portal_att_mails for all to authenticated using (portal_has('att.violations','write')) with check (portal_has('att.violations','write'));

-- 원본 파일 보관용 비공개 버킷 (경로 att/… 는 att.violations 권한)
insert into storage.buckets (id, name, public) values ('portal-files', 'portal-files', false) on conflict (id) do nothing;
drop policy if exists portal_files_read on storage.objects;
create policy portal_files_read on storage.objects for select to authenticated
  using (bucket_id = 'portal-files' and (storage.foldername(name))[1] = 'att' and portal_has('att.violations','read'));
drop policy if exists portal_files_insert on storage.objects;
create policy portal_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-files' and (storage.foldername(name))[1] = 'att' and portal_has('att.violations','write'));
drop policy if exists portal_files_delete on storage.objects;
create policy portal_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portal-files' and (storage.foldername(name))[1] = 'att' and portal_has('att.violations','edit'));
