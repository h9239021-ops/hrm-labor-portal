-- =====================================================================
-- v13: 전 카테고리 현황표·규정 버전 관리·법령정보·자동 메일
-- 새 테이블은 없습니다. 모든 현황표는 portal_records(cat, menu, data) 를 쓰고,
-- 기존 정책(portal_has(cat || '.' || menu, …))이 그대로 적용됩니다.
--   leave.status / absence.status / case.cases / case.discipline / council.agenda
--   safety.status / advice.opinions / rules.docs / home.laws / att.automail
-- 첨부 파일: portal-files 버킷의 <cat>/<menu>/<record id>/<file> 경로 → 같은 권한 키로 보호
-- =====================================================================
drop policy if exists portal_files_gen_read on storage.objects;
create policy portal_files_gen_read on storage.objects for select to authenticated
  using (bucket_id = 'portal-files' and (storage.foldername(name))[1] not in ('att', 'faq')
         and portal_has((storage.foldername(name))[1] || '.' || (storage.foldername(name))[2], 'read'));
drop policy if exists portal_files_gen_insert on storage.objects;
create policy portal_files_gen_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-files' and (storage.foldername(name))[1] not in ('att', 'faq')
         and portal_has((storage.foldername(name))[1] || '.' || (storage.foldername(name))[2], 'write'));
drop policy if exists portal_files_gen_delete on storage.objects;
create policy portal_files_gen_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portal-files' and (storage.foldername(name))[1] not in ('att', 'faq')
         and portal_has((storage.foldername(name))[1] || '.' || (storage.foldername(name))[2], 'edit'));
