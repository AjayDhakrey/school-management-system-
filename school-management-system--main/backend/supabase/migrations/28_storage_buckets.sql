-- admission-documents: private, path {school_id}/{admission_id}/{filename}.
-- avatars: public read (avoids signed-URL churn everywhere a photo renders), one bucket for
-- both student and teacher photos — folder prefix (`students/` or `teachers/`) isolates them.
-- school-logos: public read, write restricted to SUPER_ADMIN/SCHOOL_ADMIN.
insert into storage.buckets (id, name, public) values
  ('admission-documents', 'admission-documents', false),
  ('avatars', 'avatars', true),
  ('school-logos', 'school-logos', true)
on conflict (id) do nothing;

drop policy if exists "admission_documents_rw" on storage.objects;
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_write" on storage.objects;
drop policy if exists "avatars_update" on storage.objects;
drop policy if exists "avatars_delete" on storage.objects;
drop policy if exists "school_logos_public_read" on storage.objects;
drop policy if exists "school_logos_write" on storage.objects;

create policy "admission_documents_rw" on storage.objects for all to authenticated using (
  bucket_id = 'admission-documents'
  and (storage.foldername(name))[1] = (select public.jwt_school_id())
  and (select public.has_permission('admissions.manage'))
) with check (
  bucket_id = 'admission-documents'
  and (storage.foldername(name))[1] = (select public.jwt_school_id())
  and (select public.has_permission('admissions.manage'))
);

create policy "avatars_public_read" on storage.objects for select to public using (
  bucket_id = 'avatars'
);
create policy "avatars_write" on storage.objects for insert to authenticated with check (
  bucket_id = 'avatars' and (storage.foldername(name))[2] = (select public.jwt_school_id())
);
create policy "avatars_update" on storage.objects for update to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[2] = (select public.jwt_school_id())
) with check (
  bucket_id = 'avatars' and (storage.foldername(name))[2] = (select public.jwt_school_id())
);
create policy "avatars_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'avatars' and (storage.foldername(name))[2] = (select public.jwt_school_id())
);

create policy "school_logos_public_read" on storage.objects for select to public using (
  bucket_id = 'school-logos'
);
create policy "school_logos_write" on storage.objects for all to authenticated using (
  bucket_id = 'school-logos'
  and (storage.foldername(name))[1] = (select public.jwt_school_id())
  and (select public.jwt_role()) in ('SUPER_ADMIN', 'SCHOOL_ADMIN')
) with check (
  bucket_id = 'school-logos'
  and (storage.foldername(name))[1] = (select public.jwt_school_id())
  and (select public.jwt_role()) in ('SUPER_ADMIN', 'SCHOOL_ADMIN')
);
