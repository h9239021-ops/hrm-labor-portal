-- 업무포털 v5: FAQ 항목 확장 (유형 · 질문자 · 완료날짜 · 진행현황 · 답변자 등)
alter table public.portal_faq add column if not exists qtype text;
alter table public.portal_faq add column if not exists asker_name text;
alter table public.portal_faq add column if not exists asker_dept text;
alter table public.portal_faq add column if not exists asker_title text;
alter table public.portal_faq add column if not exists channel text;
alter table public.portal_faq add column if not exists done_on date;
alter table public.portal_faq add column if not exists status text not null default '완료';
alter table public.portal_faq add column if not exists answerer text;
alter table public.portal_faq add column if not exists caution boolean not null default false;
alter table public.portal_faq add column if not exists detail text;
alter table public.portal_faq add column if not exists source text;
alter table public.portal_faq add column if not exists source_url text;
alter table public.portal_faq add column if not exists notion_id text unique;
