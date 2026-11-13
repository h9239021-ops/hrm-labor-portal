-- 업무포털 v8: FAQ 이미지 첨부 (portal-files 버킷의 faq/ 경로, home.faq 권한)
alter table public.portal_faq add column if not exists images jsonb not null default '[]'::jsonb;
drop policy if exists portal_files_faq_read on storage.objects;
create policy portal_files_faq_read on storage.objects for select to authenticated
  using (bucket_id = 'portal-files' and (storage.foldername(name))[1] = 'faq' and portal_has('home.faq','read'));
drop policy if exists portal_files_faq_insert on storage.objects;
create policy portal_files_faq_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-files' and (storage.foldername(name))[1] = 'faq' and portal_has('home.faq','write'));
drop policy if exists portal_files_faq_delete on storage.objects;
create policy portal_files_faq_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portal-files' and (storage.foldername(name))[1] = 'faq' and portal_has('home.faq','write'));
select column_name from information_schema.columns where table_name = 'portal_faq' and column_name = 'images'
union all select policyname from pg_policies where policyname like 'portal_files_faq%';
